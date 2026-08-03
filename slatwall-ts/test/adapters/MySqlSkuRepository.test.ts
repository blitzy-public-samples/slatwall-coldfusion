/**
 * ============================================================================================
 * NET-NEW — the repository / SQL-contract suite for `MySqlSkuRepository`.
 * ============================================================================================
 *
 * EVERY CASE IN THIS FILE IS **NET-NEW**. Nothing here extends, replays or replicates a legacy
 * assertion, and no case is labelled as though it did. AAP 0.4.1.12 lists
 * `slatwall-ts/test/adapters/MySqlSkuRepository.test.ts` | CREATE | "**NET-NEW**", and AAP 0.6.5.2
 * records that **no `SkuDAOTest` exists anywhere in the legacy suite** — so the option-resolution
 * query, the sorted-SKU ordering, the ten-predicate transaction-existence chain, the primary /
 * alternate code lookup and the search projection all arrive here without a legacy counterpart.
 *
 * --------------------------------------------------------------------------------------------
 * TRACEABILITY — DOCUMENTARY ONLY, AND THE LIMITS ARE STATED RATHER THAN IMPLIED
 * --------------------------------------------------------------------------------------------
 * A reader is entitled to know exactly how strong the evidence behind these assertions is, so the
 * four limits are stated up front:
 *
 *   1. MXUnit and CFSelenium are **not vendored** in this repository. MXUnit additionally requires
 *      an external CFIDE mapping that does not exist here, so the legacy suite **cannot be executed
 *      in this environment at all**.
 *   2. `meta/docker/slatwall-local-dev/` — cited as documenting a Lucee/Railo + MySQL Compose
 *      setup — **does not exist**. `meta/` contains only `meta/tests/` and `meta/eclipse/`; there is
 *      no Dockerfile and no Compose file anywhere in the tree.
 *   3. Consequently **the CFML runtime is not reproducible here**. Every claim these tests make
 *      about legacy behaviour was established by **source inspection**, with a file-and-line
 *      locator recorded at the assertion that depends on it.
 *   4. **NO RUNTIME BEHAVIOURAL COMPARISON WAS PERFORMED.** No statement below was executed against
 *      the legacy application, and none was diffed against a legacy result set. Saying so plainly is
 *      more useful than implying a comparison that never happened.
 *
 * `meta/tests/unit/dao/AccountDAOTest.cfc` is named in this file's plan entry as a reference, and
 * it was read in full. It was used for **SHAPE ONLY** — it is a component with a `setUp()` that
 * resolves a DAO out of the request scope plus a single `inst_ok()` asserting the result is an
 * object — and **none of its content is ported here**. It is an integration test that boots the
 * entire framework; these are unit tests constructed directly against typed doubles, which is the
 * structural difference AAP 0.4.3.6 predicts and a reviewer should expect by design.
 *
 * --------------------------------------------------------------------------------------------
 * NO DATABASE, NO NETWORK, NO CLOCK, NO ENVIRONMENT
 * --------------------------------------------------------------------------------------------
 * Every statement is asserted on the text the adapter composed and the parameter array it bound,
 * captured by the recording executor that `test/support/inMemoryRepositories.ts` already publishes
 * (`createSqlExecutorDouble`). That double is used rather than a second one invented here, because
 * one recording seam for the whole subtree is the only way the "same value bound twice", "option
 * identifiers then product identifier" and "`[productID, nextOptionGroupSortOrder]`" orderings stay
 * comparable across suites.
 *
 * The repository takes its executor, its request-scoped sort-order memo, its product-type root
 * resolver and its account context as **constructor parameters**, so substitution needs nothing but
 * an object of the right shape — AAP 0.7.3 standard 3, and the reason the legacy suite's dynamic
 * `getService()` resolution has no equivalent here. There is no mocking library in this subtree,
 * none is added, and no eleventh dev dependency is introduced.
 *
 * Nothing here reaches an inventory service, a stock service or any calculated-property service.
 * `calculatedQATS` appears only as a projected column name inside statement text; it is never
 * resolved, and that boundary belongs to `SmartListQueryPort`.
 *
 * --------------------------------------------------------------------------------------------
 * WHY SOME DOUBLES INTERPRET THE STATEMENT INSTEAD OF RETURNING CANNED ROWS
 * --------------------------------------------------------------------------------------------
 * A canned row list proves nothing about filtering: it would answer identically whether the adapter
 * had emitted a conjunction, a disjunction or no predicate at all. So where a case claims a
 * SEMANTIC guarantee — "a SKU carrying only a subset is not returned", "an option-less SKU is
 * excluded", "each multi-option SKU appears once" — the responder **derives its filtering from the
 * statement the adapter actually composed**: it counts the emitted option predicates, looks for the
 * option-bearing guard and looks for `SELECT DISTINCT`, then applies exactly those to a fixed
 * fixture set. Rewriting the adapter to `optionID IN (…)` or to `GROUP BY … HAVING COUNT(*) = N`
 * therefore makes these cases FAIL rather than silently pass, which is the whole point.
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

/* ================================================================================================
 * IDENTIFIERS AND SHARED FIXTURES
 * ==============================================================================================
 * Every identifier below is a 32-character lowercase hexadecimal string with no dashes, which is the
 * shape `createSlatwallUUID()` produces and the shape the schema declares (IR-6). They are readable
 * on purpose — a leading run identifies the entity family — so a parameter array reads as evidence
 * rather than as noise.
 *
 * NONE of the three seeded product-type discriminators is written literally anywhere in this file.
 * Where a discriminator is needed it comes from `SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE`, whose values
 * originate in `test/fixtures/productTypes.ts` and ultimately in
 * `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` (IR-7). Restating a fixed identifier in a
 * second place is exactly how traceability rots.
 * ============================================================================================== */

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
 * Two far-side references belonging to explicitly OUT-OF-SCOPE entities. They exist only as identifier
 * values: `Content` and `SubscriptionBenefit` are excluded domain families, so the port models these
 * collections as bare `{ contentID }` / `{ subscriptionBenefitID }` references and hydrates no excluded
 * entity (TR-5). Nothing in this file constructs, reads or reaches through either one.
 */
const CONTENT_REFERENCE = 'eeee0000000000000000000000000001';
const SECOND_CONTENT_REFERENCE = 'eeee0000000000000000000000000002';
const BENEFIT_REFERENCE = 'ffff0000000000000000000000000001';
/* Distinct from BENEFIT_REFERENCE on purpose: both benefit collections write a column of the SAME name,
 * so only differing VALUES can reveal a crossed write. See the DATA-04 case that says so. */
const RENEWAL_BENEFIT_REFERENCE = 'ffff0000000000000000000000000002';

/* Two more out-of-scope references, for the F7 cases that pin the preserved subscription-term key.
 * `SubscriptionTerm` is an excluded family too, so these are identifier values and nothing else. */
const SUBSCRIPTION_TERM_REFERENCE = 'aaab0000000000000000000000000001';
const SECOND_SUBSCRIPTION_TERM_REFERENCE = 'aaab0000000000000000000000000002';

/**
 * A value chosen to be hostile to string concatenation: a single quote, a statement terminator and a
 * comment introducer.
 *
 * Used wherever a case has to prove that a caller-controlled value reaches the parameter array and
 * never the statement text. `?` binds VALUES ONLY and can never substitute an identifier, so a
 * repository that interpolated instead of binding would show this string inside the SQL.
 */
const ADVERSARIAL_VALUE = "o'brien'; DROP TABLE SwSku; --";

/* ================================================================================================
 * STATEMENT-TEXT HELPERS
 * ============================================================================================== */

/** Collapse whitespace so an assertion does not depend on the adapter's line breaks or indentation. */
function norm(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/** How many times `fragment` occurs in `text`. Plain scanning: no regular-expression escaping games. */
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

/**
 * The one statement the executor recorded.
 *
 * Deliberately strict: a case that expects a single round trip asserts that there was exactly one,
 * so an extra probe appearing later cannot slip past as "the first call still matches".
 */
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

/* ================================================================================================
 * THE STATEMENT FRAGMENTS THESE CASES PIN
 * ==============================================================================================
 * Written out as the adapter composes them, so a drift in either direction is visible here rather
 * than only in a failing expectation. The out-of-scope tables in the existence chain
 * (`SwOrderItem`, `SwStock`, …) are NOT on the physical-name whitelist `assertTableName` guards —
 * they belong to excluded domain families — so they are spelled as the implementation spells them
 * and no name is fabricated.
 * ============================================================================================== */

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

/** `model/dao/SkuDAO.cfc:L193-L198` — the base-10 odometer, with the memo BOUND rather than inlined. */
const ODOMETER_FRAGMENT =
  'ORDER BY SUM(SwOption.sortOrder * POWER(10, ? - SwOptionGroup.sortOrder)) ASC';

/** `model/dao/SkuDAO.cfc:L210-L212` — the whole-table aggregate, unscoped and unparameterised. */
const MAX_SORT_ORDER_STATEMENT = 'SELECT max(SwOptionGroup.sortOrder) AS max FROM SwOptionGroup';

/**
 * The source clause of the association loader that follows a SKU-returning read.
 *
 * `INNER JOIN FETCH` in HQL both restricted the result set and POPULATED the association; the joins the
 * adapter emits reproduce only the restriction, so the population is a SECOND statement over the link
 * table. Recognising it is how a responder answers the loader separately from the projection.
 */
const OPTION_HYDRATION_SOURCE = 'FROM SwSkuOption ';

/* ================================================================================================
 * THE HARNESS
 * ==============================================================================================
 * One factory, built on the subtree's own recording executor. Every dependency the repository needs
 * is supplied explicitly through the constructor; nothing is patched, no module registry is touched,
 * and `jest.mock` is never called.
 * ============================================================================================== */

interface HarnessOptions {
  /** Consulted before the queue. Returning `undefined` declines and falls through. */
  readonly respond?: SqlExecutorResponder;
  /** Consumed in order, one per statement, after `respond` declines. */
  readonly outcomes?: readonly SqlExecutorOutcome[];
  /**
   * The request-scoped sort-order memo.
   *
   * Supplied explicitly only by the M7 and D7 cases, which are the two that care about its lifetime.
   * Every other case gets a fresh one, which is what a single invocation gets in production.
   */
  readonly memo?: OptionGroupSortOrderMemo;
}

interface Harness {
  readonly repository: MySqlSkuRepository;
  /**
   * The very executor the repository holds.
   *
   * Exposed for the F7 round-trip case, which calls the PRODUCTION option loader against it before the
   * write. One executor for both halves is the point rather than a convenience: `attachSkuOptions` takes
   * a `SqlExecutor` precisely so the read shares the caller's transaction (M6), and handing it a second
   * double would make the case pass while proving nothing about that sharing.
   */
  readonly executor: SkuStatementExecutor;
  /** Every statement in issue order, with its bound parameters. A live view of the double's state. */
  readonly calls: readonly SqlExecutorCall[];
  /** Every product-type identifier the base-product-type walk asked for, in order. */
  readonly requestedProductTypeIds: readonly string[];
  /** Append further outcomes to the tail of the queue. */
  enqueue(...outcomes: readonly SqlExecutorOutcome[]): void;
}

/**
 * Build a repository over the recording executor.
 *
 * The spread guards are not decoration: `exactOptionalPropertyTypes` distinguishes "property absent"
 * from "property present and undefined", and `SqlExecutorDoubleOptions` declares both members
 * optional rather than nullable, so passing `{ respond: undefined }` would not type-check.
 */
function makeHarness(options: HarnessOptions = {}): Harness {
  const executorDouble = createSqlExecutorDouble({
    ...(options.respond === undefined ? {} : { respond: options.respond }),
    ...(options.outcomes === undefined ? {} : { outcomes: options.outcomes }),
  });

  /*
   * M6, checked by the compiler rather than asserted in prose. The adapter's seam is the READ-AND-WRITE
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
      /* Unauthenticated, which is what `org/Hibachi/HibachiObject.cfc:L74-L76` yields when no account
       * is on the request. No case below depends on an actor. */
      createAbsentAccountContextDouble().accountContext,
    ),
  };
}

/** A product whose product type is the seeded root for `baseProductType`. No UUID is written here. */
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

/* ================================================================================================
 * THE STATEMENT-DRIVEN RESPONDER FOR THE OPTION RESOLVER
 * ============================================================================================== */

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

/**
 * Answer a selected-option statement by APPLYING THE PREDICATES THE ADAPTER EMITTED.
 *
 * ⭐ THIS IS WHY THE SEMANTIC CASES ARE NOT CIRCULAR. Nothing here knows what the adapter is supposed
 * to have written. It reads the statement and derives four facts from it — how many correlated option
 * predicates were emitted, whether the option-bearing guard is present, whether the product predicate
 * is present, and whether the projection is `DISTINCT` — then applies exactly those to a FIXED fixture
 * set. Three consequences follow, and each is the failure mode a T-case exists to catch:
 *
 *   - rewritten as `optionID IN (…)`: zero option predicates are recognised, so NO option filtering is
 *     applied and a SKU carrying only a subset is returned — T1 fails.
 *   - guard deleted: an option-less SKU is no longer excluded — T3 fails.
 *   - `DISTINCT` dropped: the join fan-out is reproduced and a three-option SKU yields three rows —
 *     T4 fails.
 */
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
  /* Legacy bind order: the option identifiers first, in list order, then the product identifier. */
  const requiredOptionIDs = params.slice(0, emittedOptionPredicates);
  const scopedProductID = productScoped ? params[emittedOptionPredicates] : undefined;

  const matching = fixtures.filter((fixture) => {
    if (optionBearingGuarded && fixture.optionIDs.length === 0) {
      return false;
    }
    if (scopedProductID !== undefined && fixture.productID !== scopedProductID) {
      return false;
    }
    /* One AND-ed test per emitted predicate. A repeated identifier repeats the same test, which is
     * idempotent — exactly what N correlated EXISTS clauses do. */
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

/**
 * The fixture set every option-resolution case shares.
 *
 * `SKU_ONE` carries two options, `SKU_TWO` carries only one of them — the SUBSET case — and
 * `SKU_OPTIONLESS` carries none. `PRODUCT_B` owns nothing, which is what makes the product predicate
 * observable rather than merely present.
 */
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

/* ================================================================================================
 * THE STATEMENT-DRIVEN RESPONDER FOR THE TRANSACTION-EXISTENCE PROBE
 * ============================================================================================== */

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

/**
 * Answer the existence probe by READING THE ROOT PREDICATE THE ADAPTER EMITTED.
 *
 * ⭐ NOT CIRCULAR, for the same reason {@link answerSelectedOptions} is not. Nothing here knows which
 * scope the caller asked for; it reads whether the statement restricted on `s.skuID` or on
 * `s.productID`, takes the single bound value, and resolves the selection from the fixture world. Two
 * consequences, and each is a failure mode a case below exists to catch:
 *
 *   - a repository that dropped the root predicate and emitted only the ten disjuncts becomes a GLOBAL
 *     guard, so `PRODUCT_B` starts answering `true` — the isolation case fails.
 *   - a repository that let the product identifier win over the SKU identifier resolves the wrong
 *     selection — the precedence case fails.
 */
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
  /* One row, one column, named as the adapter aliased it. The legacy read zero-versus-non-zero
   * [`model/dao/SkuDAO.cfc:L93-L97`], so a numeric flag is what the adapter expects to interpret. */
  return sqlRows([{ transactionExists: referenced ? 1 : 0 }]);
}

/**
 * The transactional world every existence case shares.
 *
 * `SKU_ONE` belongs to `PRODUCT_A` and IS referenced by a transaction. `SKU_TWO` belongs to
 * `PRODUCT_A` and is NOT. `SKU_OPTIONLESS` belongs to `PRODUCT_B` and is NOT — which is what makes
 * `PRODUCT_B` the isolation control, and what makes the `(PRODUCT_A, SKU_TWO)` pair a genuine
 * precedence test: the product has history, the named SKU does not, so the two scopes disagree and
 * the answer reveals which one the adapter honoured.
 */
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

/* ================================================================================================
 * TWO FURTHER HARNESSES: THE WRITE JOURNAL, AND A STORE THAT HONOURS `IN (…)`
 * ============================================================================================== */

/** True when the statement reads rather than writes. Read off the verb, not off a double's flag. */
function isRead(call: SqlExecutorCall): boolean {
  return norm(call.sql).toUpperCase().startsWith('SELECT');
}

/**
 * A harness for the write seam.
 *
 * A read is answered with `existingSkuRows`, which is what decides the insert-versus-update branch —
 * `persistSku` probes for the SKU row before it collects any value. A write is acknowledged with one
 * affected row, because the shared double refuses to answer a write with rows and refuses to invent an
 * acknowledgement it was not given.
 */
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
 *
 * Needed by the eager-fetch cases, because those are the ones where the adapter issues a SECOND
 * statement whose own predicate has to be answered independently of the first. A single canned row
 * list cannot do that: the SKU projection and each association loader read different tables.
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

      /* Resolve an `IN (…)` restriction against the bound values, so a loader that asked for the
       * wrong column or bound the wrong identifier gets nothing back rather than everything. */
      const restriction = /WHERE (?:\w+\.)?(\w+) IN \(/.exec(norm(call.sql));
      const column = restriction?.[1];
      if (column === undefined) {
        return sqlRows([...rows]);
      }
      return sqlRows(rows.filter((row) => call.params.includes(row[column])));
    },
  });
}

/* ================================================================================================
 * TYPE-LEVEL PROOFS
 * ==============================================================================================
 * Each of these is a POSITIVE assignment: the value `true` is assigned to a type that resolves to
 * `true` only while the contract holds. Loosening the contract turns the annotation into `false` and
 * the assignment into a compile error. No `@ts-expect-error`, no suppression and no cast is used
 * anywhere in this file — the strict configuration is the assertion mechanism, not an obstacle.
 * ============================================================================================== */

/**
 * `false` when `TMember` can be called with only its first argument — i.e. when the second parameter
 * has become optional. A function that requires two arguments is NOT assignable to a one-argument
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

/** D9 — `fetchOptions` stays required at the repository boundary even though the service defaults it. */
const findByProductRequiresFetchOptions: RequiresSecondArgument<
  SkuRepository['findByProduct'],
  Product
> = true;

/* ================================================================================================
 * THE SIX SELECTED-OPTION CASES — T1, T2, T3, T4, T5 AND THE PARAMETER ORDER
 * ==============================================================================================
 * Six separately named cases, one per drift trap, because each is a plausible and well-intentioned
 * "improvement" that changes results with no error and no compile failure. The anchor is the physical
 * shape the adapter commits to:
 *
 *   SELECT DISTINCT s.* FROM SwSku s
 *   WHERE EXISTS (SELECT 1 FROM SwSkuOption so WHERE so.skuID = s.skuID AND so.optionID = ?)
 *     AND s.productID = ?
 *
 * plus the separate option-bearing existence guard that preserves the legacy INNER JOIN on the
 * empty-selection path. Formatting is normalised before matching; semantics are not.
 *
 * G6 — THE THREE NAMES DIFFER AND THE DIFFERENCE IS DELIBERATE. The service member is
 * `getProductSkusBySelectedOptions` [`model/service/ProductService.cfc:L104-L106`], the DAO member is
 * `getSkusBySelectedOptions` [`model/dao/SkuDAO.cfc:L107`], and the repository member is
 * `findSkusBySelectedOptions`. This is NOT a 1:1 rename: the service name is the preserved public
 * contract (TR-1), while the repository name follows the destination's repository convention. Reading
 * any one as an alias for another is the mistake this note exists to prevent.
 * ============================================================================================== */

describe('NET-NEW T1 — conjunction, not intersection/disjunction', () => {
  /*
   * G6 — `model/dao/SkuDAO.cfc:L106-L120`. The legacy comment states the intent — "returns product
   * skus which matches ALL options" — and the loop at :L113-L121 appends ONE correlated existence test
   * per LIST ELEMENT and appends the identifier to the parameter array in the same step. Duplicates in
   * the list therefore produce duplicate clauses and duplicate bound values, and no de-duplication
   * happens anywhere on the path. Three rewrites look equivalent and are not:
   *   `optionID IN (…)`                     turns the conjunction into a DISJUNCTION;
   *   `GROUP BY … HAVING COUNT(*) = N`      diverges as soon as the list repeats an identifier;
   *   `new Set(optionIds)`                  changes N, and with it the HAVING arithmetic above.
   * The port keeps one EXISTS per list element, duplicates included, and that is asserted here.
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
    /* Five predicates, therefore four joiners, every one of them AND. */
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

    /* Idempotent by construction: testing the same option twice cannot narrow the result further. */
    expect(skus.map((sku) => sku.skuID)).toEqual([SKU_ONE]);
    expect(soleCall(harness.calls).params).toHaveLength(SELECTED.length + 1);
  });
});

describe('NET-NEW T2 — productID is required and always emitted', () => {
  /*
   * G6 — `model/dao/SkuDAO.cfc:L123-L125` guards the product predicate with
   * `structKeyExists(arguments,"productID")`, which reads as an optional restriction and is NOT one.
   * `model/service/ProductService.cfc:L104-L106` declares BOTH arguments `required` and forwards
   * `argumentCollection=arguments`, and that service member is the DAO member's ONLY caller anywhere in
   * the repository. The guarded branch is therefore always true on every real path, and the
   * "optional productID" path is unreachable. The port types `productId` as REQUIRED and emits the
   * predicate unconditionally — declared here as a decision rather than collapsed silently.
   *
   * POSITIONAL COMPATIBILITY IS PRESERVED for the two callers that pass positionally:
   * `model/entity/Product.cfc:L366-L367` passes `(arguments.selectedOptions, this.getProductID())`, and
   * the out-of-scope `model/process/Order_AddOrderItem.cfc:L238` passes
   * `(getSelectedOptionIDList(), getProduct().getProductID())`. Selection first, product second.
   */
  it('NET-NEW — the declared shape is (optionIds: string[], productId: string) with both required', async () => {
    const harness = makeOptionResolutionHarness();

    /* A positive type-level assignment: the member fits the exact declared shape, and the conditional
     * type above resolves to `true` only while the second parameter is REQUIRED. */
    const declaredShape: (optionIds: string[], productId: string) => Promise<SkuRow[]> = (
      optionIds,
      productId,
    ) => harness.repository.findSkusBySelectedOptions(optionIds, productId);

    expect(optionResolverRequiresProductId).toBe(true);
    /* And the exactly-shaped reference really does drive the adapter: both SKUs of `PRODUCT_A` that
     * carry `OPTION_SMALL` come back, so the assignment above is a live contract and not a dead type. */
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

    /* `PRODUCT_B` owns none of the fixtures, so a predicate that were emitted but ignored would show
     * up here as a non-empty answer. */
    const skus = await harness.repository.findSkusBySelectedOptions([OPTION_SMALL], PRODUCT_B);

    expect(skus).toEqual([]);
  });
});

describe('NET-NEW T3 — the option-bearing guard excludes option-less SKUs, empty selection included', () => {
  /*
   * G6 — `model/dao/SkuDAO.cfc:L109-L112`. The legacy base statement opens
   * `select distinct sku from SlatwallSku as sku inner join sku.options as opt`, and the alias `opt` is
   * NEVER referenced in the WHERE clause — which makes the join look removable. It is not: an INNER JOIN
   * through the option link table silently EXCLUDES every option-less SKU from every result, including
   * when `selectedOptions` is empty and no existence test is appended at all. Deleting it would widen
   * every answer with no error anywhere. The port preserves it as a separate correlated existence test so
   * that it survives translation to a statement that has no join at all.
   *
   * TODO(parity) D19 — the consequence is a real defect and is CARRIED, NOT REPAIRED. For a SKU with
   * ZERO options `optionsList` is empty, so by T5 the query answers with every option-bearing SKU of
   * the product; the guard at `model/entity/Sku.cfc:L764` then only passes when the product has no
   * option-bearing SKUs at all. An option-less default SKU on a product that already has option-bearing
   * SKUs therefore FAILS `hasUniqueOptions`. That is observed legacy behaviour, and this suite pins the
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
   * G6 — `model/dao/SkuDAO.cfc:L109` writes `select distinct`, and it is load-bearing rather than
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
    /* Three options on one SKU is the fan-out case; the responder reproduces the fan-out whenever the
     * statement is NOT distinct, so dropping DISTINCT fails this assertion rather than passing it. */
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
   * G6 — `model/entity/Product.cfc:L366` defaults `selectedOptions` to `""` and `listLen("")` is zero,
   * so the loop body never runs, no existence test is appended, and the statement legitimately
   * degenerates to "every option-bearing SKU of this product". Guarding the empty input away would
   * break two real callers, and the distinction between them matters:
   *
   *   - SINGULAR `Product.getSkuBySelectedOptions` [`model/entity/Product.cfc:L349-L364`] does NOT reach
   *     this query on the empty path at all. It branches at :L359 and reads `getSkus()` instead,
   *     returning the sole SKU or raising. So it is not the reason the empty path must work.
   *   - PLURAL `Product.getSkusBySelectedOptions` [`:L366-L367`] passes the empty string straight
   *     through, and `Sku.hasUniqueOptions` [`model/entity/Sku.cfc:L755-L769`] reaches it with an empty
   *     `optionsList` for any SKU that carries no options. THOSE two depend on the degenerate form.
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
    /* Mutating the caller's array afterwards must not rewrite history. Without a snapshot the
     * assertion above would be reading whatever the array holds at assertion time, which would make
     * every bind-order case in this file quietly meaningless. */
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
    /* And the identifiers in the statement are the canonical physical ones, not caller-supplied. */
    expect(sql).toContain(`FROM ${assertTableName('SwSku')} s`);
    expect(sql).toContain(`s.${assertColumnName(assertTableName('SwSku'), 'productID')} = ?`);
  });
});

/* ================================================================================================
 * THE TRANSACTION-EXISTENCE CHAIN — `transactionExists(productID?, skuID?)`
 * ==============================================================================================
 * Ports `model/dao/SkuDAO.cfc:L53-L98`. This member is what both delete guards consult, so a wrong
 * answer is destructive in BOTH directions: `true` when it should be `false` blocks a legitimate
 * delete, and `false` when it should be `true` permits one that orphans transactional history. The
 * guards are declared at `model/validation/Product.json:12` and `model/validation/Sku.json:12`, each as
 * `"transactionExistsFlag": [{ "contexts": "delete", "eq": false }]`. NEITHER FILE IS EDITED AND NO
 * VALIDATION RULE IS EXERCISED HERE — the guards are named only to record why the query's precision
 * matters; the rule sets have their own suite.
 *
 * G6 — THE LAYER ORDER IS REVERSED ON PURPOSE, AND THE REVERSAL IS LOAD-BEARING.
 * `model/service/SkuService.cfc:L285-L286` declares `getTransactionExistsFlag()` with ZERO arguments
 * and then forwards `argumentCollection=arguments`, which in CFML carries through names the signature
 * never declared. Its two real callers rely on exactly that: `model/entity/Sku.cfc:L594` passes
 * `skuID=` and `model/entity/Product.cfc:L626` passes `productID=`. A literal zero-arity transcription
 * of the service member would compile in TypeScript — a lower-arity function is assignable wherever a
 * higher-arity one is expected — and would then DISCARD the identifier the entity had just supplied,
 * silently turning a scoped guard into a GLOBAL one that answers `true` for the whole catalogue. The
 * declared decision is therefore to keep the DAO-side optional signature, because
 * `model/dao/SkuDAO.cfc:L54-L55` declares both `productID` and `skuID` untyped and not required.
 *
 * The two layers stay ordered differently as a result, and neither order may be "tidied": the entity /
 * caller contract is SKU-first `(skuID?, productID?)` because that is how the call sites read, while
 * the repository contract is DAO-first `(productID?, skuID?)` because that is how the DAO declares.
 * `createTransactionExistenceChecker` is the single place the crossing happens, and the last case in
 * this section pins the crossing behaviourally — the compiler cannot, since both identifiers are
 * 32-character strings and a backwards crossing type-checks perfectly.
 * ============================================================================================== */

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
     * G6 — `model/dao/SkuDAO.cfc:L59-L63` tests the SKU identifier FIRST and only falls through to the
     * product identifier when it is absent, and `:L87-L91` binds whichever one that decision selected.
     * The two scopes are made to DISAGREE here on purpose: `PRODUCT_A` has transactional history
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
     * returning a canned verdict: an adapter that emitted the ten disjuncts WITHOUT the root predicate
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
     * AAP §0.4.1.7 requires the ten-way chain be translated as a SINGLE query. The legacy composes one
     * HQL string with ten OR-ed subqueries [`model/dao/SkuDAO.cfc:L57-L85`] and executes it once at
     * `:L87-L91`; a per-family loop would be ten round trips for one answer.
     */
    const harness = makeTransactionExistsHarness();

    await harness.repository.transactionExists(PRODUCT_A);

    expect(soleCall(harness.calls).params).toHaveLength(1);
  });
});

describe('NET-NEW transactionExists — the ten OR-ed existence predicates', () => {
  /*
   * `model/dao/SkuDAO.cfc:L65-L85`. TEN predicates across NINE entity families, because
   * `StockAdjustmentItem` is tested twice — once through its FROM stock and once through its TO stock.
   * Every table and column below is spelled exactly as the implementation spells it; none is
   * fabricated. Note that these tables belong to explicitly excluded domain families (Order, Stock,
   * Inventory, Physical, Vendor), so they are deliberately NOT run through `assertTableName` — that
   * whitelist guards the in-scope catalogue names, and widening it to admit out-of-scope tables would
   * be a change to a file this suite has no business changing.
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
    /* Strictly increasing: present AND in the legacy sequence. */
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
    expect(new Set(positions).size).toBe(TRANSACTION_EXISTS_CLAUSES.length);
  });

  it('NET-NEW — the ten predicates are OR-ed, and the chain as a whole is AND-ed to the scope', async () => {
    const harness = makeTransactionExistsHarness();

    await harness.repository.transactionExists(PRODUCT_A);
    const sql = norm(soleCall(harness.calls).sql);

    /* Ten disjuncts means nine joiners, every one of them OR. */
    expect(occurrences(sql, ' OR EXISTS(')).toBe(TRANSACTION_EXISTS_CLAUSES.length - 1);
    /* And the whole disjunction hangs off the scope restriction, parenthesised so precedence cannot
     * turn one family into an unscoped match. */
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
    /* The two StockAdjustmentItem tests differ only in WHICH stock they reach through, and that
     * difference is the whole reason there are ten predicates and not nine. */
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
   * G6 — THE LEGACY HAS NO EXPLICIT THROW HERE, AND IT DOES NOT RETURN FALSE EITHER.
   * `model/dao/SkuDAO.cfc:L87` is a two-part guard; with both arguments absent control reaches the
   * alternative branch at `:L89` and dereferences an argument that was never supplied, which the CFML
   * runtime reports as an undefined-variable error. The failure is real but INCIDENTAL — it is a
   * missing-variable fault, not a designed rejection.
   *
   * The port fails deliberately instead, with a message AUTHORED FRESHLY IN THE DESTINATION. Two
   * reasons, and the second is the important one:
   *   - an argument fault must not be answered with `false`, because `false` is precisely the answer
   *     that PERMITS a delete;
   *   - no reserved legacy error string is reproduced anywhere in this file. Several exist in the
   *     source, and their locators are recorded in this file's plan rather than their text, because
   *     copying the text is how a reserved string escapes into a new codebase.
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
    /* No round trip at all: the fault is detected from the arguments, so nothing was asked of the
     * database and no verdict — least of all a permissive one — was produced. */
    expect(harness.calls).toHaveLength(0);
  });
});

describe('NET-NEW transactionExists — the undeclared-argument forwarding [model/service/SkuService.cfc:L285-L287], the caller-order crossing', () => {
  /*
   * TODO(parity) the undeclared-argument forwarding [model/service/SkuService.cfc:L285-L287] — the crossing exists because the two layers are ordered differently ON PURPOSE
   * (see the G6 note above this section). `createTransactionExistenceChecker` is the single place the
   * inversion happens, and it must be pinned BEHAVIOURALLY: both identifiers are 32-character hex
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

    /* Caller slot 2 is the product identifier — the order `model/entity/Product.cfc:L626` reads in. */
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

/* ================================================================================================
 * THE SKU-CODE LOOKUP — `findBySkuCode(skuCode)`
 * ==============================================================================================
 * Ports `model/dao/SkuDAO.cfc:L102-L104`, whose single HQL line does three things at once:
 *
 *     select ss from SlatwallSku ss LEFT JOIN ss.alternateSkuCodes ascs
 *     where ss.skuCode = :skuCode OR ascs.alternateSkuCode = :skuCode
 *
 *   - it matches the PRIMARY code or ANY ALTERNATE code, disjunctively;
 *   - it uses ONE named parameter for both sides, which positional binding turns into the SAME VALUE
 *     BOUND TWICE, in the order the placeholders appear (TR-4);
 *   - it passes `true` as the third argument to `ormExecuteQuery`, asking for a UNIQUE result — so more
 *     than one match is an error, not a "take the first".
 *
 * G6 — THE NULL ANSWER IS LOAD-BEARING AND MUST NOT BECOME A THROW. The out-of-scope caller at
 * `model/service/PhysicalService.cfc:L199` reads `getSkuService().getSkuBySkuCode(...)` and immediately
 * guards with `if( !isNull(sku) )`, so "no such code" is an ordinary, expected answer on a path this
 * port may not break.
 * ============================================================================================== */

describe('NET-NEW findBySkuCode — the alternate-code fallback', () => {
  const SKU_CODE = 'SKU-PRIMARY-1';

  /**
   * The lookup answers `rows`; the option hydration that follows a hit answers nothing.
   *
   * A hit is hydrated in a SECOND statement over the link table, so the two have to be answered
   * independently — a single canned list would feed SKU rows to the option loader.
   */
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
    /* The row carries a different primary code, so only the alternate side of the disjunction can
     * have matched it. */
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

    /* Null is an ordinary answer on the `PhysicalService.cfc:L199` path, so nothing raises — and with
     * no SKU to hydrate there is nothing to ask for either. */
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

/* ================================================================================================
 * THE SEARCH PROJECTION — `searchByProductType(term?, productTypeID?)`
 * ==============================================================================================
 * Ports `model/dao/SkuDAO.cfc:L130-L148`. Discrepancy 3: BOTH arguments are optional in the legacy
 * declaration, and the port keeps them optional — but only ONE of them is safe to omit, and the
 * asymmetry is source behaviour rather than a design choice.
 *
 * ⚠️ TODO(parity) the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132] — `model/dao/SkuDAO.cfc:L132` AND `:L135` PUT MAPPING-LAYER ENTITY NAMES INSIDE A
 * NATIVE STATEMENT (`SlatwallSku`, `SlatwallProduct`), while thirty lines further on `:L179-L211` uses
 * PHYSICAL names in an equally native statement. One file, two conventions. The port resolves the
 * physical tables — `SwSku`, `SwProduct` — through the whitelist rather than by stripping a prefix off
 * the legacy text, and no schema name is fabricated. the logical-versus-physical naming divergence [model/dao/SkuDAO.cfc:L132] is a port-minted designation recorded in
 * `src/ports/repositories/SkuRepository.ts`; no new D-number is minted here.
 * ============================================================================================== */

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
     * value is BOUND, so the wildcards belong to the value and never to the statement text.
     */
    expect(soleCall(harness.calls).params).toEqual(['%abc%']);
    expect(norm(soleCall(harness.calls).sql)).not.toContain('%');
  });

  it('NET-NEW — raises when the term is omitted, because the legacy reads it unguarded', async () => {
    const harness = makeHarness();

    /*
     * `model/dao/SkuDAO.cfc:L133` interpolates the argument unconditionally, so omitting it makes the
     * legacy dereference an argument that is not there and fail. IT DOES NOT SEARCH FOR EVERYTHING.
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
     * TR-4. `model/dao/SkuDAO.cfc:L138` fixes the order by adding both parameters BEFORE it installs
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
     * G6 — THE SKU-SIDE GUARD TRIMS AND ITS PRODUCT-SIDE TWIN DOES NOT, AND BOTH STRICTNESSES ARE
     * PRESERVED. `model/dao/SkuDAO.cfc:L134` requires the argument to be present AND non-blank AFTER
     * TRIMMING, so a whitespace-only value is rejected and the restriction is simply not applied. The
     * equivalent at `model/dao/ProductDAO.cfc:L423` tests LENGTH ONLY, so the same value is ACCEPTED
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
     * Platform list semantics, preserved exactly: split on commas, DROP EMPTY SEGMENTS, and do NOT trim
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

/* ================================================================================================
 * THE PRODUCT SKU READ — `findByProduct(product, fetchOptions)` AND D9
 * ==============================================================================================
 * Ports `model/dao/SkuDAO.cfc:L150-L168`.
 *
 * ⚠️ TODO(parity) D9 — `model/dao/SkuDAO.cfc:L150-L168` CONTAINS TWO SCOPING DEFECTS, AND THE PORT
 * PRESERVES THEIR OBSERVABLE CONSEQUENCES WITHOUT REPRODUCING THEIR MECHANISM.
 *   1. `:L153` reads `fetchOptions` UNSCOPED — no `arguments.` prefix — so CFML resolves it through the
 *      scope chain. TypeScript has no such chain: the parameter must be referenced correctly or the file
 *      will not compile. What is preserved is the SIGNATURE, not the sloppiness: `fetchOptions` stays a
 *      REQUIRED boolean at the repository boundary because `:L152` declares it `required`, even though
 *      `model/service/SkuService.cfc:L220` defaults it to `false` one layer up. Making it optional here
 *      would let a caller silently take the no-join branch.
 *   2. `:L163` re-declares `var hql` MID-FUNCTION, in a function that already has an `hql`. The port has
 *      one accumulating statement string and no shadow, which is the same emitted SQL by a mechanism
 *      that cannot shadow.
 *
 * ⚠️ THE JOINS FILTER; THEY ARE NOT MERELY LOADING HINTS. Every branch is `INNER JOIN FETCH`
 * [`:L155`, `:L157`, `:L160`], and an INNER join through the link table EXCLUDES SKUs with no link row.
 * Rewriting any of them as a LEFT join to be "safer about loading" would WIDEN the result set.
 *
 * ⚠️ THE CASE-FOLDING NOTE THAT MATTERS. `:L154`, `:L156` and `:L158` compare with CFML `eq`, while
 * `model/service/SkuService.cfc:L61` compares the same discriminator with `==`. The two operators are
 * inconsistent in spelling and IDENTICAL in behaviour — both fold case — so a `SwProductType` row
 * holding `Merchandise` DID receive the option join. A case-sensitive `===` against the seeded spelling
 * would silently add no join and return every SKU of the product.
 *
 * ⚠️ NO `ignoreCase` KNOB IS SURFACED. `:L165` passes a fourth argument `{ignoreCase="true"}` to the
 * legacy query call. That is an ORM query option, not a domain concept, and exposing it as a collation
 * setting on the repository would invent a knob the DAO never gave a caller.
 * ============================================================================================== */

describe('NET-NEW findByProduct — fetchOptions is a REQUIRED boolean at the repository boundary', () => {
  it('NET-NEW — the declared shape is (product: Product, fetchOptions: boolean)', async () => {
    const harness = makeHarness({ outcomes: [sqlRows([])] });

    /* A positive type-level assignment, and no suppression comment anywhere: the conditional type
     * resolves to `true` only while the second parameter is REQUIRED. */
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
     * `model/dao/SkuDAO.cfc:L151` declares `required any product` and `:L164` passes the ENTITY, not its
     * key — which is what lets the eager branch read the product's own product type without a second
     * lookup. The identifier is what gets BOUND; the entity is what gets ACCEPTED.
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

    /* `model/dao/SkuDAO.cfc:L157` — INNER, so an option-less SKU of a merchandise product is EXCLUDED.
     * A LEFT join here would widen the answer with no error. */
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

    /* Two joins, and the order is the legacy's: the term at `:L159`, then the benefits at `:L160`. */
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
   * `INNER JOIN FETCH` does TWO things: it restricts the result set — which the joins above reproduce —
   * and it POPULATES the association on the returned entities, which a join alone does not. Emitting the
   * join without the fetch yields the right NUMBER of SKUs carrying EMPTY collections, so every member
   * that reads one answers from an empty array WITHOUT RAISING: `getOptionsDisplay` returns the empty
   * string, `getSkuDefinition` returns nothing, `getOptionsIDList` returns no identifiers. Silence is
   * what makes this worth a case of its own.
   */
  it('NET-NEW — populates the option collection for merchandise, with its option group', async () => {
    const harness = makeStoreHarness({
      SwSku: [{ skuID: SKU_ONE, skuCode: 'SKU-A', productID: PRODUCT_A }],
      /* ⚠️ THESE ROWS CARRY THE OPTION'S OWN COLUMNS ALONGSIDE THE LINK'S, because the statement under
       * test is a JOIN — `SwSkuOption` INNER JOIN `SwOption` — while this double resolves a statement to
       * a single store. Modelling the JOINED row is what keeps the fixture honest about the result set
       * the adapter actually receives; a bare `{skuID, optionID}` would describe a result set the
       * statement cannot return. */
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

    /* Identifier references, not entities: `Content` is explicitly out of scope, so the port models the
     * collection as `{ contentID }` and hydrates no excluded entity (TR-5). */
    expect(skus[0]?.accessContents).toEqual([{ contentID: CONTENT_REFERENCE }]);
  });

  it('NET-NEW — populates the subscription BENEFITS but NOT the term, matching the legacy', async () => {
    const harness = makeStoreHarness({
      SwSku: [{ skuID: SKU_ONE, skuCode: 'SKU-A', productID: PRODUCT_A }],
      SwSkuSubsBenefit: [{ skuID: SKU_ONE, subscriptionBenefitID: BENEFIT_REFERENCE }],
    });

    const skus = await harness.repository.findByProduct(productFor('subscription'), true);

    expect(skus[0]?.subscriptionBenefits).toEqual([{ subscriptionBenefitID: BENEFIT_REFERENCE }]);
    /* `model/dao/SkuDAO.cfc:L159` joins the term with NO `FETCH`, so it restricts and does not populate.
     * Leaving it unresolved is the faithful outcome, not an omission. */
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

/* ================================================================================================
 * THE SORTED SKU ORDERING — `findSortedSkuIdsByProduct(productID)`, D8, D13, M7 AND D7
 * ==============================================================================================
 * Ports `model/dao/SkuDAO.cfc:L172-L202`, together with the two private tag-syntax helpers that support
 * it at `:L204-L220` and `:L222-L226`.
 *
 * ⚠️ DISCREPANCY 7 — THOSE TWO HELPERS ARE EASY TO MISS, AND THEIR BEHAVIOUR IS NOT OPTIONAL.
 * `model/dao/SkuDAO.cfc:L204` and `:L222` are written in TAG syntax inside a file that is otherwise
 * mixed tag and script, so a scan for `public … function` declarations finds NEITHER of them. One is the
 * memoized sort-order lookup that the ordering expression depends on; the other is its broken clear. A
 * port built from a declaration scan would silently drop both, and the ordering would change.
 * ============================================================================================== */

describe('NET-NEW findSortedSkuIdsByProduct — the base-10 odometer ordering', () => {
  /* One memoized ceiling, one sorted answer. Keyed on the statement so either can be asserted alone. */
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
     * `model/dao/SkuDAO.cfc:L179-L188`. The chain has to reach the OPTION GROUP because the ordering
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

    /* `:L190` and `:L191`. The GROUP BY is what makes the aggregate ordering below well-defined: one
     * row per SKU, ordered by a sum taken across that SKU's option rows. */
    const sql = norm(orderingStatement(harness).sql);
    expect(sql).toContain('WHERE SwSku.productID = ? GROUP BY SwSku.skuID');
  });

  it('NET-NEW — keeps the source odometer expression, not an ORDER BY on the two sort orders', async () => {
    const harness = makeSortedHarness({ maximumSortOrder: 3 });

    await harness.repository.findSortedSkuIdsByProduct(PRODUCT_A);

    /*
     * `model/dao/SkuDAO.cfc:L192-L198`. The expression treats each option group as a DIGIT POSITION in a
     * base-10 number: a LOWER group sort order produces a LARGER exponent, so it is the MORE SIGNIFICANT
     * digit. Summing the digits per SKU collapses a multi-column ordering into one comparable number.
     *
     * `ORDER BY SwOptionGroup.sortOrder, SwOption.sortOrder` looks like an obvious simplification and is
     * NOT equivalent: after `GROUP BY SwSku.skuID` there is one row per SKU and many option rows behind
     * it, so there is no single group sort order to order by. The odometer is what makes the collapse
     * work, and it is kept verbatim.
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
     * [`model/dao/SkuDAO.cfc:L197`]. The port BINDS it, because `?` binds values only — and a numeric
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
   * TODO(parity) D8 — `model/dao/SkuDAO.cfc:L177` CARRIES THIS COMMENT, REPRODUCED VERBATIM:
   *
   *     TODO: test to see if this query works with DB's other than MSSQL and MySQL
   *
   * The legacy branches on the ORM dialect and has never been exercised beyond those two engines. The
   * port targets MySQL only, which is CONSISTENT WITH THAT UNTESTED STATE rather than a resolution of
   * it — the untested dialects are still untested, they are simply no longer reachable. No `Dialect`
   * enum is introduced: inventing a dialect abstraction would imply coverage that does not exist.
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
   * TODO(parity) D13 — THE INNER JOIN THROUGH `SwSkuOption` EXCLUDES OPTION-LESS SKUs, AND THAT ABSENCE
   * IS THE ROOT CAUSE OF A DOWNSTREAM FAILURE THAT IS NOT REPAIRED HERE.
   * `model/dao/SkuDAO.cfc:L180-L182` joins the link table with an INNER join, so a SKU carrying no
   * options never appears in the ordering. `model/service/SkuService.cfc:L223-L240` and `:L246-L268`
   * then index `sortedArrayReturn[index]` where `index = arrayFind(sortedArray, skuID)` — and for an
   * excluded SKU `arrayFind` answers ZERO, so the assignment throws.
   *
   * The absence is asserted and PRESERVED. No LEFT JOIN, no COALESCE, no IFNULL, no fallback row and no
   * client-side repair is introduced: any of them would fix the service's crash by changing the query's
   * answer, which is a behaviour change disguised as a bug fix (Guideline 4, AAP §0.7.3 S7).
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
     * TODO(parity) — `model/entity/Option.cfc:L56` declares `sortOrder` with NO `required` constraint
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
     * `model/dao/SkuDAO.cfc:L210-L212`: the maximum is taken across EVERY option group in the system,
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

    /* `:L206` seeds and stores; `:L205` short-circuits on the stored value. One aggregate, two orderings. */
    expect(callsContaining(harness.calls, MAX_SORT_ORDER_STATEMENT)).toHaveLength(1);
    expect(callsContaining(harness.calls, ODOMETER_FRAGMENT)).toHaveLength(2);
  });

  it('NET-NEW — seeds the ceiling at 1 when the table has no rows, so the answer is 1', async () => {
    const harness = makeHarness({
      respond: (call) =>
        norm(call.sql) === MAX_SORT_ORDER_STATEMENT ? sqlRows([]) : sqlRows([{ skuID: SKU_ONE }]),
    });

    await harness.repository.findSortedSkuIdsByProduct(PRODUCT_A);

    /* `:L206` seeds `1` BEFORE the statement runs and `:L214` only overwrites it when the aggregate
     * produced a value, so an empty table leaves the seed standing. */
    expect(callAt(callsContaining(harness.calls, ODOMETER_FRAGMENT), 0).params).toEqual([
      PRODUCT_A,
      1,
    ]);
  });

  /*
   * M7 — THE MEMO IS REQUEST-SCOPED, NOT PROCESS-SCOPED, AND THAT IS A DELIBERATE DEPARTURE FROM THE
   * LEGACY LIFETIME. DI/1 registers DAOs as SINGLETONS — `org/Hibachi/Hibachi.cfc:L289-L302` declares
   * only `entity`, `process`, `transient` and `report` as transients — so the legacy memo at
   * `model/dao/SkuDAO.cfc:L204-L220` lives in a component that outlives every request, and a sort order
   * read once was reused until the application restarted.
   *
   * A warm Lambda container makes that unsafe rather than merely stale: module-scope state survives
   * between invocations, so a ceiling resolved for one invocation would silently order another's SKUs.
   * The memo is therefore a CONSTRUCTOR PARAMETER, supplied per invocation, and this class creates none
   * of its own. The case below is what holds that: it is the assertion that fails the moment anyone
   * caches at module scope.
   */
  it('NET-NEW — M7: a SECOND repository in the same warm process does NOT see the first memo', async () => {
    const first = makeSortedHarness();
    await first.repository.findSortedSkuIdsByProduct(PRODUCT_A);
    expect(callsContaining(first.calls, MAX_SORT_ORDER_STATEMENT)).toHaveLength(1);

    /* A second instance, in the same module registry and the same process, with its own memo — which is
     * exactly what a second invocation on a warm container gets. */
    const second = makeSortedHarness();
    await second.repository.findSortedSkuIdsByProduct(PRODUCT_A);

    /* It re-reads. If the memo were static, module-scope or a singleton, this would be zero. */
    expect(callsContaining(second.calls, MAX_SORT_ORDER_STATEMENT)).toHaveLength(1);
  });

  it('NET-NEW — M7: two repositories SHARING one memo share the read, which is the request case', async () => {
    /* The complement of the case above: within ONE invocation a re-bound repository keeps the memo, so a
     * transaction boundary does not re-resolve a ceiling the same invocation already has. */
    const memo = createOptionGroupSortOrderMemo();
    const first = makeSortedHarness(memo);
    const second = makeSortedHarness(memo);

    await first.repository.findSortedSkuIdsByProduct(PRODUCT_A);
    await second.repository.findSortedSkuIdsByProduct(PRODUCT_B);

    expect(callsContaining(first.calls, MAX_SORT_ORDER_STATEMENT)).toHaveLength(1);
    expect(callsContaining(second.calls, MAX_SORT_ORDER_STATEMENT)).toHaveLength(0);
  });

  /*
   * TODO(parity) D7 — `model/dao/SkuDAO.cfc:L222-L226` HAS AN INVERTED GUARD, SO THE MEMBER WHOSE WHOLE
   * PURPOSE IS TO CLEAR THE MEMO NEVER CLEARS IT. The legacy deletes the key only when the key is
   * ABSENT — the one case where there is nothing to delete — so once a value has been memoized the guard
   * fails and the value survives.
   *
   * THE CASE BELOW ASSERTS THE NO-OP, NOT THE REPAIR. A test that expected the cache to clear would be
   * asserting a fix, which Guideline 4 and AAP §0.7.3 S7 both forbid. The member also stays on the port
   * rather than being dropped for being useless (TR-5), and it stays SYNCHRONOUS because the legacy
   * declares no return value and performs no I/O.
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
     * STILL ONE. The memo was not discarded, so the aggregate did not run again — precisely the legacy
     * outcome. Were the guard corrected, this would be two, and the ordering of every subsequent sorted
     * read could change.
     */
    expect(callsContaining(harness.calls, MAX_SORT_ORDER_STATEMENT)).toHaveLength(1);
    expect(callsContaining(harness.calls, ODOMETER_FRAGMENT)).toHaveLength(2);
  });

  it('NET-NEW — D7: calling the clear on an UNMEMOIZED repository is equally inert', async () => {
    const harness = makeSortedHarness();

    /* The one path where the legacy assignment IS reached — and where it has no effect, because there is
     * nothing to remove. No statement is issued either way. */
    harness.repository.clearOptionGroupSortOrderCache();
    expect(harness.calls).toHaveLength(0);

    await harness.repository.findSortedSkuIdsByProduct(PRODUCT_A);
    expect(callsContaining(harness.calls, MAX_SORT_ORDER_STATEMENT)).toHaveLength(1);
  });
});

/* ================================================================================================
 * THE WRITE SEAM — `persistSku(sku)`
 * ==============================================================================================
 * The legacy never calls a persist member at all: the mapping layer tracks the entity, decides insert
 * against update from its own session state, and emits the statements at flush time. AAP §0.6.6 M5
 * records that a stateless invocation has NO request-end hook to flush at, so the decision and the
 * statements are made explicit here. That makes this member the one part of the adapter with no single
 * legacy locator to point at — the contract it reproduces is the mapping layer's, read off
 * `model/entity/Sku.cfc:L76` through `:L79` for the collections and
 * `org/Hibachi/HibachiEntity.cfc` for the audit block.
 *
 * ⚠️ NOTHING HERE COMMITS, AND NOTHING HERE MAY. The boundary belongs to
 * `src/adapters/mysql/UnitOfWork.ts`; committing per SKU would turn a rejected combination batch into a
 * partial catalogue. No case below opens, commits or rolls back a transaction.
 * ============================================================================================== */

describe('NET-NEW persistSku — DATA-01, the identifier', () => {
  /*
   * The guard is why an unidentified SKU is a TOTAL failure rather than a partial one: it does not write
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

    /* Refused BEFORE any statement — not after a probe, and certainly not after a partial write. */
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

    /* The probe decides insert-versus-update, and it is the first statement of the member — the audit
     * stamp below it needs to know which branch is being taken. */
    const probe = callAt(harness.calls, 0);
    expect(isRead(probe)).toBe(true);
    expect(probe.params).toEqual([SKU_ONE]);
  });
});

describe('NET-NEW persistSku — DATA-04, the four owned link collections', () => {
  /** The four link tables, in the entity's own declaration order (`model/entity/Sku.cfc:L76`–`:L79`). */
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
     * ALL FOUR LINK TABLES MUST BE WRITTEN, NOT JUST THE OPTION ONE. Every one of the four collections is
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
    /* `model/entity/Sku.cfc:L77` declares `inversejoincolumn="contentID"`, NOT `accessContentID`. */
    expect(insert.sql).toContain('(skuID, contentID)');
    expect(insert.sql).not.toContain('accessContentID');
    expect(insert.params).toEqual([SKU_ONE, CONTENT_REFERENCE]);
  });

  /*
   * THE CASE THAT EXISTS BECAUSE THE COMPILER CANNOT HELP. Both benefit collections hold the same
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

    /* The far column name really is shared; that is the design, and it is why the TABLES must differ. */
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
      /* Replacement, in that order: the delete MUST precede the insert or it would erase it. */
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
      /* Two distinct references plus a repeat of the first BY VALUE rather than by identity — the
       * entity's own adder dedupes by reference, so all three reach the collection. A repeated far
       * identifier is a data fault the link table's key is entitled to reject, and collapsing it here
       * would hide it from the caller that created it. */
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

/* ================================================================================================
 * FINDING F7 — A HYDRATED SKU'S RELATIONSHIPS SURVIVE A SAVE THAT NEVER MENTIONED THEM
 * ================================================================================================
 * ⭐ WHAT WAS BROKEN, IN ONE SENTENCE. `rowMappers.mapSkuRow` produces a SKU with four EMPTY owned link
 * collections and no `subscriptionTerm`, and `persistSku` replaced all four link tables from those empty
 * arrays and wrote `NULL` into `subscriptionTermID` — so ANY save of a database-loaded SKU deleted its
 * options, access contents and both benefit collections, and detached its term. Three in-scope members
 * reach that write on an existing SKU: `processProductAddOptionGroup`, `processProductAddOption` and
 * `processProductUpdateSkus`.
 *
 * ⭐ WHAT THE LEGACY DID, WHICH IS THE PROPERTY THESE CASES PIN. Hibernate's collections were lazy: one
 * the request never touched was never loaded, so the flush emitted NO statement for its link table and
 * the rows stayed. A many-to-one nobody dereferenced kept its column, because the value came from the
 * row. "Untouched means unchanged" was free there and has to be said explicitly here — RULE 3c in
 * `src/adapters/mysql/rowMappers.ts` is where it is said, and this section is where it is proved.
 *
 * ⚠️ THE SKUs IN THESE CASES ARE BUILT BY `mapSkuRow`, NOT BY `buildSku`. That is the whole point: the
 * distinction under test is PROVENANCE, and only a SKU that came through the mapper carries it. Every
 * other case in this file uses `buildSku` and therefore describes the authoritative path, which these
 * cases also check has not changed.
 * ============================================================================================== */

describe('NET-NEW persistSku — F7, a hydrated SKU keeps the links this save never read', () => {
  /** One `SwSku` row, as the SKU projection returns it, carrying a subscription-term foreign key. */
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
     * NOT "no delete" and NOT "no insert" — NO STATEMENT AT ALL, for every one of the four. The stored
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

    /* The association slot is deliberately ABSENT: `SubscriptionTerm` is out of scope, so the mapper
     * attaches nothing and the key is preserved beside the entity instead (RULE 3c). */
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
     * THE DECLARED WAY TO DETACH, and it has to be declared because absence cannot mean it: after
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
     * THE OTHER HALF OF THE GATE. A loader that read the link rows promotes the collection to
     * authoritative, and from that point the replacement semantics are exactly what they always were —
     * including for an EMPTY collection, which is the only way removal is expressible. Marking only the
     * SKUs that came back with rows would make an emptied collection indistinguishable from an unloaded
     * one, and clearing a SKU's options would silently stop working.
     */
    markSkuOwnedLinkLoaded(sku, 'options');

    await harness.repository.persistSku(sku);

    expect(verbsFor(harness.calls, 'SwSkuOption')).toEqual(['DELETE']);
    expect(soleStatementFor(harness.calls, 'SwSkuOption', 'DELETE').params).toEqual([SKU_ONE]);
    /* And the three that were NOT declared read are still untouched. */
    expect(statementsFor(harness.calls, 'SwSkuAccessContent')).toEqual([]);
  });

  it('NET-NEW — refuses loudly rather than guessing when an unread collection was mutated', async () => {
    const harness = makePersistHarness([{ skuID: SKU_ONE }]);
    const sku = mapSkuRow(skuRow());

    /*
     * THE ONE CASE WITH NO FAITHFUL ANSWER. The entity now holds SOME of the intended rows and the
     * adapter cannot know which of the stored ones the caller meant to keep: writing what it holds
     * deletes the rest, writing nothing discards the addition. Both are silent data outcomes, so the
     * write fails with the collection named and the transaction rolls back (M5).
     */
    sku.addOption(buildOption({ optionID: OPTION_SMALL }));

    await expect(harness.repository.persistSku(sku)).rejects.toThrow(DomainError);
    await expect(harness.repository.persistSku(sku)).rejects.toThrow(/without having been loaded/u);
  });

  it('NET-NEW — round trip: read, promote through the REAL loader, add an option, keep them BOTH', async () => {
    /*
     * ⭐ THE WHOLE OF FINDING F7 IN ONE CASE, WITH NO SIMULATION OF THE READ SIDE.
     *
     * `attachSkuOptions` is the production loader — the same function
     * `SmartListQueryBuilder`'s product aggregate loader calls, and the same one
     * `SkuRepository.findByProduct` reaches through `attachFetchedSkuAssociations`. It is invoked here
     * against the harness executor rather than stubbed, so the promotion under test is the real one.
     *
     * The scenario is `processProductAddOptionGroup` exactly (`model/service/ProductService.cfc:L117-L121`):
     * a SKU is read from a row, it already carries one option, the member adds a second, and the SKU is
     * written back. Before the fix the collection arrived EMPTY, so the write replaced the link table with
     * the single added option and the stored one was gone — silently, with the save reporting success.
     */
    const storedOption = {
      skuID: SKU_ONE,
      optionID: OPTION_SMALL,
      optionGroupID: OPTION_GROUP_SIZE,
    };
    const harness = makeHarness({
      respond: (call) => {
        /* `norm` only collapses whitespace, so the comparisons below fold case explicitly. */
        const sql = norm(call.sql).toUpperCase();
        /* The joined option read: one row, carrying the link's skuID and the option's own columns. */
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

    /* THE READ. One statement pair, and afterwards the collection holds what the database holds. */
    await attachSkuOptions(harness.executor, [sku]);
    expect(sku.getOptions().map((option) => option.optionID)).toEqual([OPTION_SMALL]);

    /* THE MUTATION, as the service performs it. */
    sku.addOption(buildOption({ optionID: OPTION_RED }));

    /* THE WRITE. */
    await harness.repository.persistSku(sku);

    /*
     * BOTH OPTIONS REACH THE LINK TABLE, in the entity's own order — the stored one first because the
     * loader put it there, the added one second. The defect produced `[SKU_ONE, OPTION_RED]` alone.
     */
    const insert = soleStatementFor(harness.calls, 'SwSkuOption', 'INSERT');
    expect(insert.params).toEqual([SKU_ONE, OPTION_SMALL, SKU_ONE, OPTION_RED]);
    expect(verbsFor(harness.calls, 'SwSkuOption')).toEqual(['SELECT', 'DELETE', 'INSERT']);

    /* The three collections nobody read are untouched, so their stored rows survive the same save. */
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
     * THE REGRESSION GUARD FOR THE FIX ITSELF. `src/services/SkuService.ts` mints SKUs whose empty
     * collections ARE the intended state, and a design that read "no provenance" as "unknown" would
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

/* ================================================================================================
 * ⛔ THE WINDOWED SEARCH — `searchByProductTypeBounded(window, term?, productTypeID?)` — IS GONE
 * ==============================================================================================
 * A describe block of eleven cases stood here and has been REMOVED with the member it covered. It
 * asserted that the windowed form composed the unbounded statement plus `limit ? offset ?` and nothing
 * else, that the two window values bound LAST (TR-4), that the probe row was requested and discarded so
 * `hasMore` was observed rather than inferred, that an unusable window was REFUSED rather than clamped
 * and issued no statement at all, and that no digit ever reached the statement text (S2).
 *
 * ⭐ WHY IT WENT, AND WHY THE CASES ARE NOT MERELY DISABLED. `../../src/ports/repositories/SkuRepository.ts`
 * withdrew the declaration for having no production caller: the service member that would have called it
 * was itself withdrawn to keep `SkuService` at the nine members AAP §0.4.2.2 tabulates, after which
 * nothing in `src/services/**`, `src/handlers/**` or `src/integrations/**` could reach the adapter
 * method — only these cases could. A suite whose subject exists solely to be tested proves the suite,
 * not the system, and a class method is the one shape of dead code a bundler cannot remove, so the
 * member travelled in all six artifacts. Keeping the cases would have kept the member.
 *
 * ⚠️ WHAT SURVIVES, AND WHERE IT IS STILL PROVEN. `composeSkuSearch` — the predicate, the wildcard
 * wrapping, the list splitting, both differently-strict guards and the bind order — was always shared
 * rather than duplicated, so every one of those behaviours is still asserted, by the unbounded
 * `searchByProductType` cases above. Nothing that decides WHICH rows a search returns lost coverage
 * here; what lost coverage is the appended window, which no longer exists to cover.
 * ============================================================================================== */

/* ================================================================================================
 * THE TRANSACTION RE-BINDING — `withExecutor(executor)`
 * ==============================================================================================
 * ⚠️ NO LEGACY COUNTERPART, AND THE REASON IS EXECUTION-MODEL MISMATCH M5. The legacy DAO never
 * chooses a connection: the ORM session is ambient and `org/Hibachi/Hibachi.cfc` flushes it at request
 * end only when the request has no errors, so a DAO simply participates in whatever transaction the
 * request already holds. A stateless handler has no request end and no ambient session, so the port
 * makes the boundary explicit — and a repository that captured its executor at construction could only
 * ever hold the POOL-bound one, which would leave every statement outside the boundary's transaction.
 *
 * ⚠️ A NEW INSTANCE, NOT A MUTATION, AND THE DIFFERENCE IS THE WHOLE POINT. Reassigning the captured
 * executor in place would make a repository's connection depend on WHEN it was used rather than on
 * WHICH instance was used — an ambient current-transaction slot in all but name, and the same
 * process-scoped-state trap M7 rules out for the sort-order memo. Two concurrent boundaries on one warm
 * container must not be able to observe each other's connection.
 *
 * ⚠️ IT IS DELIBERATELY NOT ON THE PORT, and the last case proves it at compile time. A service may not
 * know that a statement executor exists at all, so `SkuRepository` declares nine members and none of
 * them is this one; re-binding is exposed on the CONCRETE adapter and used only by the layer that
 * already holds concrete adapters. Putting it on the port would leak the persistence mechanism into
 * `src/services/**` and undo the hexagonal separation AAP §0.7.3 asks for.
 * ============================================================================================== */

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
     * the statement runs on the connection the boundary owns, so a rollback can actually undo it and a
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
     * put BOTH statements on the scope executor and this case is what would catch it.
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
     * The memo is REQUEST-scoped and a transaction sits INSIDE a request, so a boundary that started its
     * own memo would re-resolve a ceiling the same invocation already has — which is precisely what
     * `model/dao/SkuDAO.cfc:L204-L220` memoizes to avoid. Carrying it is therefore not a shortcut: it is
     * the behaviour, and the complement of the M7 case above, which proves a SEPARATE invocation gets a
     * SEPARATE memo. Both must hold; either alone is the wrong lifetime.
     */
    expect(callsContaining(scope.calls, MAX_SORT_ORDER_STATEMENT)).toHaveLength(0);
    expect(callsContaining(scope.calls, ODOMETER_FRAGMENT)).toHaveLength(1);
    /* max 3 + 1, resolved before the re-binding and still bound after it. */
    expect(callAt(callsContaining(scope.calls, ODOMETER_FRAGMENT), 0).params).toEqual([
      PRODUCT_B,
      4,
    ]);
  });

  it('NET-NEW — the re-bound instance still satisfies the whole SkuRepository port', async () => {
    const harness = makeHarness({ outcomes: [sqlRows([])] });
    const scope = makeScopeExecutor();

    /* A positive type-level assignment, not a suppression comment: the re-bound value is used AS the
     * port, so a narrowed return type would fail to compile here. */
    const inTransaction: SkuRepository = harness.repository.withExecutor(scope.executor);

    expect(typeof inTransaction.transactionExists).toBe('function');
    expect(typeof inTransaction.findBySkuCode).toBe('function');
    expect(typeof inTransaction.findSkusBySelectedOptions).toBe('function');
    expect(typeof inTransaction.searchByProductType).toBe('function');
    /* ⛔ NO `searchByProductTypeBounded` IN THIS LIST, AND THERE WAS ONE. The windowed companion has
     * been withdrawn from the port for having no production caller — see the block above the
     * `withExecutor` section — so asserting it here would assert a member that no longer exists. The
     * eight below are the whole port. */
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
    /* And the withdrawn windowed member is not smuggled back in by a double either: an object literal
     * carrying it would now fail the excess-property check on this very annotation. */
    expect(Object.keys(double)).not.toContain('searchByProductTypeBounded');
    expect(typeof double.searchByProductType).toBe('function');
  });
});

/* =====================================================================================================
 * FOLDED IN FROM `test/adapters/UnitOfWork.test.ts` — AAP §0.4.1.12 SUITE ALIGNMENT (F1)
 * =====================================================================================================
 * WHY THESE CASES ARE HERE RATHER THAN IN A SUITE OF THEIR OWN. AAP §0.4.1.12 declares exactly seventeen
 * executable suites, and `test/adapters/UnitOfWork.test.ts` was not one of them — a QA pass recorded it,
 * with eighteen siblings, as running outside the declared test plan. The coverage was never the problem;
 * the file's existence was. So the cases are folded into an approved suite, unchanged.
 *
 * ⭐ WHY THIS HOST. `UnitOfWork` is the boundary M5 replaces the request-end commit with, and the SKU repository is the
 * adapter whose reads AAP §0.6.2 requires to observe the batch's own uncommitted siblings. The two are the
 * same mechanism seen from either side.
 *
 * ⛔ THE BODY IS WRAPPED IN ONE `describe`, WHICH IS THE WHOLE OF THE MECHANICAL CHANGE. Every helper,
 * constant and type the folded suite declared at module scope is now block-scoped to this callback, so it
 * cannot collide with this file's own declarations or with another folded body's — and any `beforeEach`,
 * `afterEach` or `beforeAll` it carries now applies to its own cases only, never to the host's. Not one
 * assertion, case name or comment was altered.
 * ================================================================================================== */

/**
 * UnitOfWork and QueryRunner — the two execution boundaries, tested against a driver double.
 *
 * ================================================================================================
 * WHY THIS FILE EXISTS, AND WHY IT IS ENTIRELY NET-NEW
 * ================================================================================================
 * AAP §0.6.5.2 records that the legacy suite contains no DAO-boundary test of any kind — no
 * `SkuDAOTest`, no `OptionDAOTest`, and nothing covering `org/Hibachi/HibachiDAO.cfc` at all. It also
 * records that the legacy suite ships NO MOCKING LIBRARY and instead boots the whole FW/1 application
 * through `meta/tests/unit/SlatwallUnitTestBase.cfc:L49-L84`, so there was no seam at which a
 * statement could be observed without a live database. Every test below is therefore NET-NEW, exactly
 * as AAP §0.8.3.7 requires such coverage to be labelled: none of it extends a legacy assertion,
 * because none exists to extend.
 *
 * Before this file, `src/adapters/mysql/UnitOfWork.ts` was reached only through the STRUCTURAL double
 * in `../support/inMemoryRepositories.ts` (`UnitOfWorkTestSupport`). That double mirrors the class's
 * public surface so services can be tested without a driver, which is the right tool for a service
 * test — and precisely the wrong tool for asserting what statement text the real class emits, since
 * the double emits none. The two coexist deliberately.
 *
 * ================================================================================================
 * WHAT IT COVERS
 * ================================================================================================
 * A. The F8 locking read on `getTableTopSortOrder`, both variants.
 * B. The F6 duplicate-key translation, at BOTH of the subtree's two routes to the driver.
 * C. The parts of the ported sort-order read that must NOT have changed while A was added.
 *
 * ⚠️ NO DATABASE IS OPENED, AND NONE IS NEEDED. Both boundaries take their driver object by
 * injection — `UnitOfWork` a `StatementPool`, `QueryRunner` the same — so the double below satisfies
 * the declared interface and records what production sends it. That is the whole benefit the ports
 * bought (AAP §0.4.3.6): the legacy equivalent of these assertions was not merely unwritten, it was
 * unwritable.
 */
describe('test/adapters/UnitOfWork.test.ts — the transaction boundary the SKU write path runs inside (folded, F1)', () => {
  /* ================================================================================================
   * THE DRIVER DOUBLE
   * ============================================================================================== */

  /** One statement as the driver received it, recorded byte for byte and in bind order. */
  interface DriverCall {
    readonly sql: string;
    readonly values: readonly BoundParameterValue[];
  }

  /**
   * What the double answers for a given statement, or the failure it raises instead.
   *
   * A function rather than a queue because these tests key on the statement TEXT: the sort-order read
   * and a write can arrive in either order depending on the test, and matching on text keeps each test
   * readable without also asserting an ordering it does not care about.
   */
  type DriverResponder = (call: DriverCall) => unknown;

  /**
   * A settlement member's outcome — review finding F11 (CWE-404), SEC-15.
   *
   * ⭐ THE DOUBLE HAD NO WAY TO FAIL A SETTLEMENT BEFORE THIS, WHICH IS EXACTLY WHAT F11 IDENTIFIED.
   * `begin`, `commit` and `rollback` all resolved unconditionally, so the production disposal decision
   * — `release` a connection whose transaction state is KNOWN, `destroy` it otherwise — could only ever
   * be observed on its release branch. The destroy branch is the one that prevents a connection of
   * unknown state re-entering a warm pool (mismatch M7), and it was unreachable from a test: the whole
   * of `returnConnection` could have been deleted and every case here would still have passed.
   *
   * A hook rather than a flag or a queue, for the same reason `DriverResponder` is a function: a test
   * says which EVENT fails and the double stays indifferent to ordering.
   *
   * @param event - the settlement member being invoked, before it is allowed to succeed
   */
  type SettlementResponder = (event: 'begin' | 'commit' | 'rollback') => void;

  interface DriverDouble {
    readonly pool: StatementPool;
    readonly calls: readonly DriverCall[];
    /** Lifecycle events on the connection, in order: `begin`, `commit`, `rollback`, `release`, `destroy`. */
    readonly lifecycle: readonly string[];
  }

  /**
   * Build a `StatementPool` that records every statement and answers from `respond`.
   *
   * ⚠️ THE ANSWER SHAPE IS THE DRIVER'S, NOT THE PORT'S. `StatementRunner.execute` resolves a TUPLE
   * whose first element is the driver's own result — a row list for a read, an acknowledgement object
   * for a write — which is why `respond` returns `unknown` and the tuple is assembled here. Modelling
   * the tuple faithfully is what lets these tests exercise the production narrowing (`toRows`,
   * `readAffectedRows`) rather than bypassing it.
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
     * Declared WITHOUT `async` and returning a settled promise explicitly, so a throw from `respond`
     * becomes a REJECTION rather than a synchronous throw. That distinction is the point: production
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
       * `respond` is invoked INSIDE the `then`, so a throw from it is converted to a rejection by the
       * promise machinery itself rather than by an explicit `Promise.reject` of an `unknown` value. The
       * recording above stays synchronous, so call order is still exactly issue order.
       */
      return Promise.resolve().then((): [unknown, unknown[]] => [respond(call), []]);
    };

    /**
     * Record a lifecycle event, then let `settle` decide whether it succeeds.
     *
     * ⚠️ THE EVENT IS RECORDED BEFORE THE FAILURE HOOK RUNS, AND THAT ORDER IS THE FAITHFUL ONE. A
     * commit that the driver rejected was still ATTEMPTED — the statement went to the server and the
     * outcome is unknown, which is precisely why production destroys the connection rather than
     * releasing it. A double that recorded only successful settlements would make an attempted-but-failed
     * commit indistinguishable from a commit that never happened.
     *
     * The hook is invoked inside a `then` so a throw becomes a REJECTION, matching the driver: production
     * awaits these members and catches rejections, so a synchronous throw would exercise a path the real
     * driver never takes.
     */
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

  /**
   * A duplicate-key failure shaped as `mysql2` raises one.
   *
   * ⚠️ THE MESSAGE CARRIES A COLLIDING VALUE, DELIBERATELY. That is what the real driver does, and the
   * sanitisation these tests assert is only meaningful against a message that actually contains one.
   */
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

  /* ================================================================================================
   * A. THE F8 LOCKING READ ON THE SORT-ORDER MAXIMUM
   * ================================================================================================
   * Review finding F8 (CWE-367): "Two concurrent inserts can read the same maximum sort order and write
   * the same next value", with the recommendation to "use a locking/advisory-lock read or scoped
   * uniqueness constraint with retry". The scoped uniqueness constraint is forbidden — AAP §0.2.2.5
   * places schema migration outside this refactoring — and a retry would be invented behaviour under
   * AAP §0.8.2 Guideline 4, so the locking read is the sanctioned half of that guidance.
   *
   * These assertions pin the CLAUSE, which is the only part a unit test can observe. Whether MySQL then
   * blocks a second transaction is a property of the engine, verified directly against MySQL 8.4 during
   * this work rather than asserted here: a second session's locking read over the same table blocked
   * until the first committed, and then observed the first session's row.
   * ============================================================================================== */

  describe('NET-NEW — F8. `getTableTopSortOrder` takes a locking read', () => {
    /* ==============================================================================================
     * ⛔ TWO CASES STOOD HERE AND ARE WITHDRAWN — THEY ASSERTED A LOCKING READ THIS PORT NO LONGER TAKES
     *
     * WHAT THEY ASSERTED. That `getTableTopSortOrder` emits `… FROM SwOptionGroup FOR UPDATE` for the
     * whole-table form, and `… FROM SwOption WHERE optionGroupID = ? FOR UPDATE` for the scoped form — the
     * clause after the `WHERE`, as MySQL requires.
     *
     * WHO WITHDREW IT AND ON WHAT AUTHORITY. `src/adapters/mysql/UnitOfWork.ts` carries the adjudication in
     * full at its own site; in brief, the clause was added under finding F8 (CWE-367) and declared
     * "D18-class" on the ground that a locking read changes no result. That ground is sound as far as it
     * goes, and the withdrawal turns on the COUNT rather than the argument: AAP §0.6.7.7 declares exactly
     * ONE departure from behavioural preservation in this port — D18, the importer's parameterised SQL — so
     * that a reviewer diffing behaviour has exactly one entry to check, and §0.8.2 Guideline 4 admits no
     * proportionality test. A ported statement's TEXT is observable, and a lock-wait is observable under
     * concurrency.
     *
     * ⭐ SO THE RACE IS CARRIED, ANNOTATED, RATHER THAN CLOSED — and the annotation is load-bearing:
     * `org/Hibachi/HibachiEntity.cfc:L637-L647`, the member this ports, takes no lock of any kind, and
     * `sortOrder` carries no unique constraint in either entity, so two concurrent seeds can share a
     * position in the legacy exactly as they can here. The sibling `updateRecordSortOrder` DOES lock
     * [`org/Hibachi/HibachiDAO.cfc:L182-L183`], but it is a reorder rather than a seed and was not ported,
     * so reproducing its lock here would import a control from a member outside the slice.
     *
     * ⭐ WHAT STILL HOLDS. The four cases below are untouched and assert everything about this statement
     * that is NOT the withdrawn clause: the `COALESCE` that makes an empty table answer zero, the
     * `topSortOrder` alias, the absence of any `ORDER BY`/`LIMIT`/placeholder the legacy did not have, and
     * the two identifier whitelists that refuse an unapproved table or scoping column before any statement
     * reaches the driver. The first of them is the regression guard that would catch a silent reinstatement.
     * ============================================================================================== */

    it('NET-NEW — adding the clause changed nothing else about the ported statement', async () => {
      /*
       * The regression guard for the hardening itself. Everything `org/Hibachi/HibachiDAO.cfc:L157-L164`
       * composes must still be composed identically: the `COALESCE` that makes the empty-table answer
       * zero (`:L158`), the `topSortOrder` alias (`:L158`), the literal `sortOrder` column, and the
       * absence of any `ORDER BY`, `LIMIT` or engine hint the legacy statement did not have.
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
      // `:L158`'s `COALESCE` is what makes the first seeded position ONE, from the `+ 1` at
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

  /* ================================================================================================
   * B. THE F6 DUPLICATE-KEY TRANSLATION, AT BOTH ROUTES TO THE DRIVER
   * ================================================================================================
   * Review finding F6 (CWE-367) asks for two things; this is the second, "handle duplicate-key errors".
   * The subtree has exactly TWO routes to the driver — `QueryRunner.runStatement` for the pool-bound
   * path and `createExecutor`'s local `runStatement` inside `UnitOfWork` for the transaction-scoped one
   * — so both are exercised here, because translating in one and not the other would make a collision
   * look different depending on whether a boundary was open.
   * ============================================================================================== */

  describe('NET-NEW — F6. a duplicate key is reported as a typed uniqueness failure', () => {
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
      // the value is caller data and routinely the very field under validation, the key name is a schema
      // identifier that discloses nothing about the caller.
      const described = describeDuplicateEntryConstraint(
        duplicateEntryFailure('SECRET-SKU-CODE', 'SwSku.skuCode'),
      );

      expect(described).toBe('SwSku.skuCode');
      expect(described).not.toContain('SECRET-SKU-CODE');
    });

    it('NET-NEW — a colliding value that itself contains the anchor cannot widen the capture', () => {
      /*
       * The extraction is anchored on `for key '` and stops at the NEXT quote rather than the last one,
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
      // `runStatement` applies the SAME imported helper. The commit gate answers `false` — "no errors to
      // report" — so a SUCCESSFUL body would commit, which is what makes the rollback below attributable
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
       * (M3) means abandoning THAT row's transaction and no other.
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
       * A deadlock, a lock-wait timeout, a connection reset and a syntax error must reach the caller with
       * the same identity, message and stack they had before the translation existed — asserted by
       * reference equality, which no re-wrapping can satisfy.
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

      expect(rejection).toBe(lockWaitTimeout);
      expect(rejection).not.toBeInstanceOf(UniqueConstraintViolationError);
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

  /* ================================================================================================
   * NET-NEW — F11. SETTLEMENT FAILURES, AND THE DISPOSAL DECISION THEY DRIVE (SEC-15, CWE-404)
   *
   * ⭐ EVERY CASE HERE WAS UNREACHABLE BEFORE THE DOUBLE COULD FAIL A SETTLEMENT, which is the whole of
   * review finding F11: "UnitOfWork probes cannot fail begin/commit/rollback and never assert `destroy`,
   * so dirty-connection handling can regress while tests stay green." `returnConnection` could have been
   * reduced to a bare `connection.release()` and the entire suite would have stayed green.
   *
   * THE PRODUCTION RULE THESE CASES PIN, read from the code rather than assumed:
   *   • `state.knownClean` starts `true`, is set `false` immediately BEFORE `beginTransaction`, and is
   *     restored to `true` only by a settlement that actually SUCCEEDED — a successful commit, or a
   *     successful roll-back.
   *   • The `finally` disposes of the connection through `returnConnection`: `release` when the state is
   *     known, `destroy` when it is not. Destroying takes the connection permanently out of service so a
   *     connection of unknown transaction state cannot re-enter a warm pool and have the next
   *     invocation begin work on top of whatever was left open (mismatch M7).
   * So a failure in begin, in the work's roll-back, or in the commit all destroy; a work failure whose
   * roll-back SUCCEEDED releases.
   * ============================================================================================== */

  describe('NET-NEW — F11. a failed settlement destroys the connection instead of recycling it', () => {
    /** The work every case here hands the boundary: one write, so a transaction genuinely has content. */
    const writeOneRow = async (scope: {
      readonly executor: {
        executeMutation(sql: string, values: readonly string[]): Promise<number>;
      };
    }): Promise<number> => scope.executor.executeMutation('UPDATE SwSku SET skuCode = ?', ['a']);

    it('NET-NEW — a `beginTransaction` failure DESTROYS the connection and never reaches the work', async () => {
      /*
       * The known-clean flag is withdrawn BEFORE begin is attempted, so a failed begin leaves the
       * connection's state unknown — the server may or may not have opened a transaction — and it is
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
       * `state.knownClean = true` sits AFTER the awaited commit, so a rejected commit never restores the
       * standing. The write may or may not be durable — that is exactly the unknown state the destroy
       * exists for.
       *
       * The failure is propagated by identity rather than wrapped. That asymmetry with the roll-back path
       * is deliberate and worth pinning: a roll-back failure is compound (something abandoned the work AND
       * the undo failed) so it is wrapped to say so, whereas a commit failure's driver error is the whole
       * story, and re-wrapping it would cost a caller the driver's own code and errno.
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
      /* The work DID run: the write reached the driver before the commit was attempted. */
      expect(driver.calls).toHaveLength(1);
    });

    it('NET-NEW — a work failure whose ROLL-BACK SUCCEEDS releases the connection and preserves the primary error', async () => {
      /*
       * The other side of the disposal rule, and the one that keeps `destroy` honest: a successful
       * roll-back restores the known-clean standing, so this connection is RELEASED and stays in service.
       * A boundary that destroyed here would take a healthy connection out of the pool on every ordinary
       * validation-driven abort.
       *
       * PRIMARY-ERROR PRESERVATION IS ASSERTED BY IDENTITY. `runWorkInside` rolls back and then re-raises
       * the caller's own failure untouched, so a caller catching a specific type still catches the same
       * VALUE. Comparing messages would pass against a re-wrapped error; `toBe` cannot.
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
       * ⭐ THE COMPOUND CASE, AND THE ONE WITH A DISCLOSURE PROPERTY TO PIN. Two failures are in flight:
       * the work's, and the roll-back's. Production reports the ROLL-BACK failure — because "nothing can
       * be reported about what the database retained" is the more serious fact — carries the driver's
       * rejection as `cause`, and reduces the abandoned failure to its NEUTRALIZED CLASS NAME on
       * `context`.
       *
       * SO THE PRIMARY REASON IS NOT LOST, BUT IT IS NOT EMBEDDED EITHER, and this case asserts both
       * halves. The abandoned error's MESSAGE carries caller data — here a URL title and a credential-like
       * string — and attaching the object itself would put that in every log that renders the context
       * (CWE-532), with its control characters intact (CWE-117). Only `'Error'` travels.
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
       * with NO abandoned failure — the work SUCCEEDED and the caller's accumulated findings are what
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
       * FAILED settlement rather than to the gate. It also pins that the boundary RAISES: a caller that
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
       * one INDEPENDENT transaction per row. Row two's commit fails, and three properties must hold at
       * once — row one stays committed, row three never begins, and the single shared connection is
       * DESTROYED rather than released back for the next invocation to inherit.
       *
       * A boundary that acquired per item would show three acquires here; one that used `Promise.all`
       * would show all three begins. The event list rules out both.
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
     * ⭐ WHY A PARITY BLOCK, AND WHY IT BELONGS HERE RATHER THAN IN TEST SUPPORT. Every service, handler
     * and repository suite in this port asserts boundary behaviour through the STRUCTURAL double in
     * `../support/inMemoryRepositories.ts`, never through the class — that is what lets a service be
     * tested with no driver at all. Those assertions are worth exactly as much as the agreement between
     * the two implementations, and the disposal decision is the one place where a plausible double
     * diverges in silence: releasing unconditionally is the obvious thing to write, it needs no
     * settlement modelling at all, and it is WRONG on four of the seven paths below.
     *
     * So the block drives the SAME seven settlement outcomes through the real class over the driver double
     * and through the support double, and asserts three things each time: what the class did, what the
     * double did, and that the two are the same list. The third assertion is the contract; the first two
     * are what tell you which side broke when it fails.
     *
     * ⚠️ ONE PROPERTY IS DELIBERATELY NOT ASSERTED AS PARITY. The class's compound roll-back failure
     * carries a SANITISED, length-bounded class name for the abandoned failure and the double does not
     * reproduce that reduction — a second implementation in test support could agree with itself while
     * disagreeing with the code that ships. The reduction is pinned against the class alone, above.
     */

    /** The failure injected into whichever settlement step a scenario names. */
    const settlementFailure = new Error('the settlement was refused');
    /** The failure the work itself raises, for the scenarios that need one. */
    const workFailure = new Error('the work inside the boundary was abandoned');

    /** One settlement outcome and the disposal it must produce on BOTH implementations. */
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
         * decision is a property of the SETTLEMENT, so a statement would add a variable without adding a
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
        /** Only the disposal events, which is the whole of what the two implementations must agree on. */
        const disposalsIn = (events: readonly string[]): readonly string[] =>
          events.filter((event) => event === 'release' || event === 'destroy');
        /** Swallows the rejection: every scenario but the first has one, and none of them is under test here. */
        const ignoreOutcome = (): undefined => undefined;

        const driver = createDriverDouble(() => affectedRows(1), settle);
        await new UnitOfWork(driver.pool).run(work, gate).then(ignoreOutcome, ignoreOutcome);

        const double = createUnitOfWorkDouble({ settlement: settle });
        await double.unitOfWork.run(work, gate).then(ignoreOutcome, ignoreOutcome);

        expect(disposalsIn(driver.lifecycle)).toStrictEqual([scenario.disposal]);
        expect(disposalsIn(double.eventKinds())).toStrictEqual([scenario.disposal]);
        /* The parity statement itself, so a divergence fails here even if both lists changed together. */
        expect(disposalsIn(driver.lifecycle)).toStrictEqual(disposalsIn(double.eventKinds()));
      });
    }
  });
});

/* =====================================================================================================
 * FOLDED IN FROM `test/adapters/UnitOfWorkSortOrder.test.ts` — AAP §0.4.1.12 SUITE ALIGNMENT (F1)
 * =====================================================================================================
 * WHY THESE CASES ARE HERE RATHER THAN IN A SUITE OF THEIR OWN. AAP §0.4.1.12 declares exactly seventeen
 * executable suites, and `test/adapters/UnitOfWorkSortOrder.test.ts` was not one of them — a QA pass recorded it,
 * with eighteen siblings, as running outside the declared test plan. The coverage was never the problem;
 * the file's existence was. So the cases are folded into an approved suite, unchanged.
 *
 * ⭐ WHY THIS HOST. The sort-order read belongs to the option-group ordering `model/dao/SkuDAO.cfc:L204-L220` memoizes, and
 * `MySqlSkuRepository` is the adapter that holds that memo. Its carried CWE-367 race is asserted here too.
 *
 * ⛔ THE BODY IS WRAPPED IN ONE `describe`, WHICH IS THE WHOLE OF THE MECHANICAL CHANGE. Every helper,
 * constant and type the folded suite declared at module scope is now block-scoped to this callback, so it
 * cannot collide with this file's own declarations or with another folded body's — and any `beforeEach`,
 * `afterEach` or `beforeAll` it carries now applies to its own cases only, never to the host's. Not one
 * assertion, case name or comment was altered.
 * ================================================================================================== */

/* ================================================================================================
 * `UnitOfWork` — THE SORT-ORDER SEEDING BOUNDARY (review finding 18)
 * ================================================================================================
 * Companion to `UnitOfWork.test.ts`, which covers the execution/settlement boundary (the locking read,
 * the duplicate-key translation and the disposal decision). The sort-order seeding members are a
 * separate concern with their own driver expectations, so they are exercised here rather than being
 * interleaved with those cases.
 * ============================================================================================== */

/**
 * ================================================================================================
 * `UnitOfWork` — THE SORT-ORDER SEEDING CONTRACT — **NET-NEW** COVERAGE (REVIEW FINDING 18)
 * ================================================================================================
 * EVERY CASE IN THIS FILE IS **NET-NEW**, AND EVERY CASE TITLE SAYS SO. There is no legacy
 * `HibachiDAOTest` or `HibachiEntityTest` covering the sort-order block anywhere in `meta/tests/`, so
 * nothing here extends, replaces or reproduces an existing assertion. A reviewer asking "did this suite
 * replicate existing tests, or generate new ones?" has an unambiguous answer for this file: generated,
 * and labelled as generated in every single title.
 *
 * TRACEABILITY IS **DOCUMENTARY**, NOT EMPIRICAL, for the reasons the sibling adapter suites state at
 * length: MXUnit is not vendored, no CFML engine is available, and `meta/docker/slatwall-local-dev/`
 * does not exist. Every behavioural claim below was established by READING
 * `org/Hibachi/HibachiEntity.cfc` and `org/Hibachi/HibachiDAO.cfc` line by line, and each assertion
 * carries the `path:Lnnn` locator it was derived from. **NO RUNTIME BEHAVIOURAL COMPARISON WAS
 * PERFORMED.**
 *
 * ------------------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS, AND WHAT THE REVIEW FOUND
 * ------------------------------------------------------------------------------------------------
 * `model/entity/OptionGroup.cfc:L58` declares `sortOrder` with `required="true"`, and
 * `model/validation/OptionGroup.json` declares NO rule for it. Those are two different requirement
 * systems, and `test/domain/OptionGroup.test.ts` correctly pins the validation half: a group with
 * `sortOrder` unset validates clean, and the ported rule set must not invent a presence rule merely
 * because the mapping marks the column required.
 *
 * The review's point was about the OTHER half. `UnitOfWork` owned the READ —
 * `getTableTopSortOrder`, the port of `org/Hibachi/HibachiDAO.cfc:L149-L168` — and owned it with no test
 * at all, while NOTHING anywhere ported the ASSIGNMENT at `org/Hibachi/HibachiEntity.cfc:L646` that
 * consumes it. So the invariant had no enforcement point and no coverage, and an entity could reach a
 * writable-value collector with the slot still absent: "any bypass reaches the database with a
 * non-writable object."
 *
 * ⛔ WHAT THIS FILE REFUSES TO DO. It does not test a validation rule for `sortOrder`, because there
 * must not be one. It does not assert a default value, because none may be invented (S9) — the seed is
 * always `topSortOrder + 1` read from the table, and an unseeded entity raises. And it adds no database:
 * `mysql2` is not imported, no pool is constructed, and the executor is the shared support double.
 * ================================================================================================
 */
describe("test/adapters/UnitOfWorkSortOrder.test.ts — the sort-order maximum read, whose memo this file's own repository owns (folded, F1)", () => {
  /* ================================================================================================
   * THE HARNESS
   * ============================================================================================== */

  /**
   * A pool that refuses to hand out a connection.
   *
   * ⭐ REFUSING IS THE ASSERTION, NOT A CONVENIENCE. Every member exercised in this file takes its
   * executor as an ARGUMENT, precisely so the read shares the connection and the transaction of the insert
   * it is seeding (M6). A pool that answered would let a member quietly reach for a second connection and
   * the mistake would pass unnoticed; this one turns that into a failure.
   */
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
   *   case here issues, so one answer suffices.
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

  /** Collapses runs of whitespace so a statement can be matched without depending on its indentation. */
  function collapse(sql: string): string {
    return sql.replace(/\s+/g, ' ').trim();
  }

  /** A bare group-shaped seed target — only the mutable slot the contract needs. */
  function seedTarget(sortOrder?: number): SortOrderSeedTarget {
    return sortOrder === undefined ? {} : { sortOrder };
  }

  /* ================================================================================================
   * getTableTopSortOrder — org/Hibachi/HibachiDAO.cfc:L149-L168
   * ============================================================================================== */

  describe('NET-NEW — getTableTopSortOrder, the read the seeding step consumes', () => {
    it('NET-NEW — composes the WHOLE-TABLE read with no WHERE clause and no parameters', async () => {
      const harness = buildHarness([{ topSortOrder: 7 }]);

      const top = await harness.unitOfWork.getTableTopSortOrder(harness.executor, 'SwOptionGroup');

      /*
       * `:L153-L157` — `SELECT COALESCE(max(sortOrder), 0) as topSortOrder FROM #tableName#`, and `:L159`
       * guards the `WHERE` clause on BOTH context arguments existing. `OptionGroup` declares no
       * `sortContext`, so `org/Hibachi/HibachiEntity.cfc:L644` supplies neither and this is the shape it
       * gets: the maximum across the ENTIRE table.
       *
       * ⛔ AND NOTHING TRAILS IT. A revision appended ` FOR UPDATE` here to close the read-then-write race
       * at `org/Hibachi/HibachiEntity.cfc:L646`; the suffix is WITHDRAWN because AAP §0.6.7.7 authorises
       * exactly one behavioural departure in this port (D18) and AAP §0.8.2 Guideline 4 admits no
       * proportionality test. The CWE-367 exposure is carried and flagged on the member itself. So this case
       * asserts exactly what it always asserted about the SHAPE, with nothing added: one statement, no
       * `WHERE`, no bound value, no clause after the table name.
       */
      expect(collapse(harness.calls[0]?.sql ?? '')).toBe(
        'SELECT COALESCE(max(sortOrder), 0) as topSortOrder FROM SwOptionGroup',
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
       * `:L160-L162` — the clause the legacy adds, and it is the ONE value the legacy already bound:
       * `<cfqueryparam cfsqltype="cf_sql_varchar" value="#arguments.contextIDValue#" />`. So this is not a
       * D18 hardening, it is a like-for-like translation of a statement that was already parameterised.
       * The COLUMN is an identifier and travels through `assertColumnName`, which is why it appears in the
       * text rather than as a marker.
       *
       * ⛔ AND THE STATEMENT ENDS AT THE `WHERE`. The withdrawn locking suffix was appended after it, which
       * is the only place MySQL accepts one; with the suffix gone the bound clause is the last thing in the
       * statement, asserted byte-for-byte here and positionally in `UnitOfWork.test.ts`.
       */
      expect(collapse(harness.calls[0]?.sql ?? '')).toBe(
        'SELECT COALESCE(max(sortOrder), 0) as topSortOrder FROM SwOption WHERE optionGroupID = ?',
      );
      expect(harness.calls[0]?.params).toEqual(['cccccccccccccccccccccccccccc0001']);
      expect(top).toBe(3);
    });

    it('NET-NEW — reads the COALESCE zero of an empty table rather than raising', async () => {
      const harness = buildHarness([{ topSortOrder: 0 }]);

      /* `:L153` projects `COALESCE(max(sortOrder), 0)`, so an empty table is a legitimate zero and not an
       * absent answer. The `+ 1` in the seeding step is what turns it into the first position. */
      await expect(
        harness.unitOfWork.getTableTopSortOrder(harness.executor, 'SwOptionGroup'),
      ).resolves.toBe(0);
    });

    it('NET-NEW — RAISES when the aggregate produced no row at all', async () => {
      const harness = buildHarness([]);

      /*
       * An aggregate without a `GROUP BY` always produces exactly one row, so no row means the statement
       * did not run as composed. That RAISES rather than degrading to the zero the `COALESCE` would have
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

      /* The table name is an IDENTIFIER and cannot be bound, so it is whitelisted instead. `tContent` is
       * the CMS table review finding 12 established must never enter the Catalog whitelist. The refused
       * candidate travels in the diagnostic CONTEXT rather than in the message, so the message stays free of
       * caller-supplied text — asserted on the context for exactly that reason. */
      const refusal = await harness.unitOfWork
        .getTableTopSortOrder(harness.executor, 'tContent')
        .then(
          () => undefined,
          (error: unknown) => error as DataIntegrityError,
        );

      expect(refusal).toBeInstanceOf(DomainError);
      expect(refusal?.context).toEqual({ candidate: 'tContent' });

      /* ⭐ AND IT IS REFUSED BEFORE ANY STATEMENT TEXT IS ASSEMBLED, so nothing reached the executor. */
      expect(harness.calls).toEqual([]);
    });
  });

  /* ================================================================================================
   * seedFirstSortOrder — org/Hibachi/HibachiEntity.cfc:L637-L647
   * ============================================================================================== */

  describe('NET-NEW — seedFirstSortOrder, the whole-table assignment (review finding 18)', () => {
    it('NET-NEW — assigns topSortOrder + 1 across the WHOLE SwOptionGroup table', async () => {
      const harness = buildHarness([{ topSortOrder: 4 }]);
      const optionGroup = seedTarget();

      const assigned = await harness.unitOfWork.seedFirstSortOrder(
        harness.executor,
        'SwOptionGroup',
        optionGroup,
      );

      /*
       * ⭐⭐ THIS IS THE HALF THAT WAS MISSING, AND THE ARITHMETIC IS THE ASSERTION. `:L646` is
       * `setSortOrder( topSortOrder + 1 )`. `OptionGroup` declares no `sortContext`, so `:L644` takes the
       * unscoped read and the new group's position is one past the highest position IN THE ENTIRE TABLE —
       * which is exactly what "the whole-table top-sort-order assignment" in the review's resolution names.
       *
       * ⚠️ AND THE `+ 1` IS NOT COSMETIC. `SwOptionGroup.sortOrder` is an EXPONENT: `model/dao/SkuDAO.cfc:L195`
       * computes `SUM(SwOption.sortOrder * POWER(10, next - SwOptionGroup.sortOrder))`. An off-by-one here
       * reorders SKUs with no error anywhere, which is why the seed is pinned rather than assumed.
       */
      expect(assigned).toBe(5);
      expect(optionGroup.sortOrder).toBe(5);

      expect(collapse(harness.calls[0]?.sql ?? '')).toBe(
        'SELECT COALESCE(max(sortOrder), 0) as topSortOrder FROM SwOptionGroup',
      );
      expect(harness.calls[0]?.params).toEqual([]);
    });

    it('NET-NEW — seeds the FIRST row of an empty table to 1, not 0', async () => {
      const harness = buildHarness([{ topSortOrder: 0 }]);
      const optionGroup = seedTarget();

      await harness.unitOfWork.seedFirstSortOrder(harness.executor, 'SwOptionGroup', optionGroup);

      /* `COALESCE(max(sortOrder), 0)` at `:L153` plus the `+ 1` at `:L646`. Position 1, and the zero the
       * legacy initialises `topSortOrder` to at `:L640` is dead in the source and reproduced nowhere. */
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
       * ⭐ THE SIBLING BRANCH, AND THE ONLY IN-SCOPE ENTITY THAT EXERCISES IT. `sortContext=` occurs five
       * times in the legacy tree and `model/entity/Option.cfc:L56` is the only one inside this slice, so
       * `:L641-L642` fires for an option and `:L644` for its group. An option's first position is therefore
       * one past the highest position WITHIN ITS GROUP, not within the table — which is why the two entities
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

      /* Same projection, same `COALESCE`, same `+ 1`; the scoped form adds one clause and one bound value
       * and changes nothing else. Bounding the divergence with evidence is what keeps `:L641`'s branch from
       * drifting into two different reads. */
      const [unscopedSql, scopedSql] = [
        collapse(unscoped.calls[0]?.sql ?? ''),
        collapse(scoped.calls[0]?.sql ?? ''),
      ];

      /* ⛔ NEITHER STATEMENT TRAILS ANYTHING. A revision appended ` FOR UPDATE` to both and this comparison
       * had to lift the suffix off before comparing; with the suffix withdrawn the two statements differ by
       * exactly one clause and one bound value, and that is asserted directly. */
      expect(unscopedSql).toBe(
        'SELECT COALESCE(max(sortOrder), 0) as topSortOrder FROM SwOptionGroup',
      );
      expect(scopedSql).toBe(
        `${unscopedSql.replace('SwOptionGroup', 'SwOption')} WHERE optionGroupID = ?`,
      );
    });

    it('NET-NEW — REPLACES an existing value, because :L637-L647 carries no idempotency guard', async () => {
      const harness = buildHarness([{ topSortOrder: 6 }]);
      const optionGroup = seedTarget(99);

      await harness.unitOfWork.seedFirstSortOrder(harness.executor, 'SwOptionGroup', optionGroup);

      /*
       * ⚠️ TODO(parity) `org/Hibachi/HibachiEntity.cfc:L639-L646` — THE BLOCK IS GATED ONLY ON THE ACCESSOR
       * EXISTING, NEVER ON THE VALUE BEING ABSENT. It runs inside `preInsert()` and assigns
       * unconditionally, so an entity that arrived carrying a position has it overwritten on insert. That is
       * preserved rather than repaired: adding an "only if absent" guard would be an enhancement the legacy
       * does not have, and it would also mask a caller that seeded from the wrong table. The obligation this
       * places on callers — invoke on INSERT only, never on update — is recorded on the member itself.
       */
      expect(optionGroup.sortOrder).toBe(7);
    });

    it('NET-NEW — issues its read on the GIVEN executor, never on a pool connection of its own', async () => {
      const harness = buildHarness([{ topSortOrder: 1 }]);

      /* The harness's pool rejects every member. Resolving at all therefore proves the read travelled on the
       * executor it was handed — which is what makes it share the connection and transaction of the insert
       * it is seeding (M6). Two concurrent inserts reading through separate connections would see the same
       * maximum and collide. */
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

      /* No partial assignment: a failed read must not leave a position behind for the guard below to
       * accept. The insert that was being seeded is the caller's to abandon. */
      expect(optionGroup.sortOrder).toBeUndefined();
    });
  });

  /* ================================================================================================
   * assertSortOrderAssigned — the persistence-boundary invariant
   * ============================================================================================== */

  describe('NET-NEW — assertSortOrderAssigned, the invariant guard (review finding 18)', () => {
    it('NET-NEW — REFUSES an entity whose sortOrder was never assigned', () => {
      /*
       * ⭐⭐ THIS IS THE BYPASS THE REVIEW NAMED, NOW CLOSED. `model/entity/OptionGroup.cfc:L58` declares
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

      /* ⛔ S9 — THE GUARD IS DELIBERATELY INCAPABLE OF REPAIR. It does not default to `0`, does not default
       * to `1`, and does not perform the `MAX()` read itself: a guard that quietly seeded would hide the
       * bypass instead of reporting it, and would issue a statement from whatever call site forgot to seed —
       * possibly outside the transaction the write belongs to. */
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

      /* The seeding step and the guard compose: what `:L646` assigned is what the boundary admits, and the
       * returned type carries `sortOrder: number` rather than an optional, so a collector downstream cannot
       * reintroduce the absent case by accident. */
      expect(writable.sortOrder).toBe(12);
    });

    it('NET-NEW — admits position ZERO, because absence and zero are different questions', () => {
      /* A row genuinely holding `0` is a legal stored value — `COALESCE(max(sortOrder), 0)` returns zero for
       * an empty table, and nothing forbids the column from holding it. The guard tests for ABSENCE, so a
       * falsy-value test here would refuse a row the database accepts. */
      expect(assertSortOrderAssigned(seedTarget(0), 'SwOptionGroup').sortOrder).toBe(0);
    });

    it('NET-NEW — refuses a table outside the physical whitelist even while refusing the entity', () => {
      /* Both refusals are real, and the whitelist one wins because the diagnostic's table is resolved while
       * the error is being composed. The point is that the guard cannot be used to smuggle an arbitrary table
       * name into a diagnostic — even on the path where the entity was going to be refused anyway. */
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
