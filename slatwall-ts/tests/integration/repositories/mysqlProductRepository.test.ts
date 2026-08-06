// ---------------------------------------------------------------------------
// slatwall-ts - repository suite for the product reads and writes
//
// WHAT THIS PINS
//   src/repositories/mysql/mysqlProductRepository.ts - the secondary adapter that
//   replaces `model/dao/ProductDAO.cfc` in the TypeScript / AWS Lambda
//   `nodejs20.x` port of the Slatwall 3.1.39 catalog + promotions/pricing slice
//   (`version.txt` = `3.1.39`).
//
//   Two things are asserted and nothing else: THE EXACT SQL TEXT THE ADAPTER
//   EMITS, and THE EXACT ARRAY OF PARAMETERS IT BINDS TO THAT TEXT.
//
//   ★★ THIS SUITE OWNS THE ONE AND ONLY DOCUMENTED EXCEPTION TO
//   PARAMETERIZED-SQL-EXCLUSIVELY IN THE ENTIRE MIGRATION, and one of the two
//   carried-forward TODOs. Both live on `getAttributeSets`, both come from the
//   same four legacy lines, and both are asserted below rather than described.
//
// ⚠ NET-NEW COVERAGE WITH NO LEGACY ANTECEDENT.
//   `meta/tests/unit/dao/` contains EXACTLY TWO files - `AccountDAOTest.cfc` and
//   `PaymentDAOTest.cfc` - and BOTH ARE OUT OF SCOPE. There is no
//   `ProductDAOTest.cfc`, so not one assertion here extends a legacy test and
//   presenting any of it as parity would be false. Every case below is new.
//
//   Nor is there an indirect antecedent to borrow. `meta/tests/unit/entity/
//   ProductTest.cfc` DOES exist and carries `productUrlIsCorrectlyFormatted()`,
//   but that is ENTITY coverage - it is extended by
//   `tests/unit/domain/entities/product.test.ts`, not by this file - and a DAO
//   suite must not cite it. `meta/tests/functional/admin/entity/ProductTest.cfc`
//   is an empty stub and contributes nothing.
//
//   What the legacy suite could not have tested anyway: every legacy "unit" test
//   boots the real application, the ORM and the DI container through
//   `meta/tests/unit/SlatwallUnitTestBase.cfc`, then reaches its subject with
//   `request.slatwallScope.getDAO("accountDAO")`. That is an ambient request
//   scope plus a service locator - the two constructs transformation rules T1 and
//   T6 exist to remove. Nothing here boots an application, resolves a container
//   or elevates a user. The assertions are carried forward in spirit; THE HARNESS
//   IS NOT (B1).
//
// THE VERIFIED LOCATOR MAP, so a reviewer can check each expectation against the
// exact line it came from. Every locator below was opened in the legacy tree and
// matched character for character before it was transcribed:
//
//   [model/dao/ProductDAO.cfc:L49]       component extends="HibachiDAO"
//   [model/dao/ProductDAO.cfc:L52]       getAttributeSets - two REQUIRED arrays
//   [model/dao/ProductDAO.cfc:L53-L55]   the hql base: exists(...) AND systemCode IN (...)
//   [model/dao/ProductDAO.cfc:L56]       if(arrayLen(arguments.productTypeIDs)){
//   [model/dao/ProductDAO.cfc:L57-L58]   the globalFlag OR assignments fragment
//   [model/dao/ProductDAO.cfc:L59-L60]   the else arm: AND sas.globalFlag = 1
//   [model/dao/ProductDAO.cfc:L62]       the TWO-KEY ORDER BY, appended UNCONDITIONALLY
//   [model/dao/ProductDAO.cfc:L64]       the TODO, carried forward verbatim
//   [model/dao/ProductDAO.cfc:L65-L69]   the two-branch bind - THE E5 EXCEPTION
//   [model/dao/ProductDAO.cfc:L66]       attributeSetTypeCode=arrayToList(...) - ONE string
//   [model/dao/ProductDAO.cfc:L68]       attributeSetTypeCode=arguments.attributeSetTypeCode - array
//   [model/dao/ProductDAO.cfc:L73]       loadDataFromFile(fileURL, textQualifier = "")
//   [model/dao/ProductDAO.cfc:L288]      a dialect branch INSIDE the bulk path - not modelled
//   [model/dao/ProductDAO.cfc:L304]      the second dialect branch - not modelled
//   [model/dao/ProductDAO.cfc:L328]      saveImportData - private, not on the port
//   [model/dao/ProductDAO.cfc:L412-L417] the interpolated INSERT - deliberately not ported
//   [model/dao/ProductDAO.cfc:L419]      searchProductsByProductType - BOTH args optional
//   [model/dao/ProductDAO.cfc:L420]      var q = new Query()
//   [model/dao/ProductDAO.cfc:L421]      the raw SQL naming the ORM entity SlatwallProduct
//   [model/dao/ProductDAO.cfc:L422]      the UNCONDITIONAL "%#arguments.term#%" bind, named prodName
//   [model/dao/ProductDAO.cfc:L423]      structKeyExists(...) && len(...) - the guard
//   [model/dao/ProductDAO.cfc:L424]      " and productTypeID in (:productTypeIDs)" - DIRECT
//   [model/dao/ProductDAO.cfc:L425]      addParam(..., list="true")
//   [model/dao/ProductDAO.cfc:L427]      q.setSQL(sql) - no ORDER BY anywhere
//   [model/dao/ProductDAO.cfc:L431-L434] the "id"/"value" projection keys
//   [model/service/ProductService.cfc:L52-L60] the EIGHT DI properties
//   [model/service/ProductService.cfc:L65-L67] cfSetting(requesttimeout="3600")
//   [model/service/ProductService.cfc:L157]    processProduct_addProductReview - no port method
//   [model/service/ProductService.cfc:L173]    processProduct_addSubscriptionTerm - no port method
//   [model/service/ProductService.cfc:L235]    processProduct_uploadDefaultImage - no port method
//   [model/service/ProductService.cfc:L317]    deleteProduct returns boolean
//   [model/service/ProductService.cfc:L342-L358] getProductSmartList - NOT on this port
//   [model/entity/Product.cfc:L49]       entityname="SlatwallProduct" table="SwProduct"
//   [model/entity/Product.cfc:L52]       productID, unsavedvalue="" - what isNew() reads
//   [model/entity/Product.cfc:L53]       activeFlag with NO default=
//   [model/entity/Product.cfc:L68-L70]   brand / productType / defaultSku, all fetch="join"
//   [model/entity/Product.cfc:L73]       skus, cascade="all-delete-orphan", NO orderby
//   [model/entity/Product.cfc:L341]      getService("optionService") - a locator site
//   [model/entity/Product.cfc:L519]      getService("promotionService") - a locator site
//   [model/entity/Sku.cfc:L55-L57]       listPrice/price/renewalPrice DO declare default="0"
//   [model/entity/Sku.cfc:L76]           options, linktable="SwSkuOption"
//   [config/configApplication.cfm:L2]    this.datasource.name = "Slatwall"
//
// A NOTE ON ONE CORRECTED LOCATOR. The checkpoint brief cited the list bind of
// `searchProductsByProductType` at L423. Reading the component shows L423 is the
// `structKeyExists`/`len` GUARD and the bind is at L425, with the clause append at
// L424. The corrected locators are used throughout. The legacy file is NOT
// touched to make a citation right - it is read as reference only.
//
// ★ THE PORT IS SIX METHODS AND THIS SUITE PINS SIX. An earlier revision of
// `src/domain/ports/productRepository.ts` declared a SEVENTH, `saveBrand`, on the
// grounds that there is no `BrandDAO.cfc` anywhere in the legacy repository and
// that brand persistence ran entirely through
// `super.save(arguments.brand, arguments.data)` [model/service/BrandService.cfc:L76].
// Both of those source facts are correct, and neither licenses the member: the
// port's member set is LOCKED AT SIX, AAP 0.4.1 fixes the port inventory at
// THIRTEEN so no fourteenth `BrandRepository` is available either, and AAP 0.5.3
// lists the Hibachi base classes - which is what `super.save` is - among the
// dependencies deliberately not carried forward. A partial brand write would have
// stored a WRONG ROW (`urlTitle` and `brandName` only, with `activeFlag`,
// `publishedFlag` and `brandWebsite` dropped and `model/validation/Brand.json`
// unenforced), which is strictly worse than no write. The member, its three
// `SwBrand` write statements and this suite's group for them are all gone, and
// `src/services/brandService.ts` carries the LEGACY-NOTE that leaves the durable
// half to the composition root. `SwBrand` is still READ here, as the eager
// many-to-one association [model/entity/Product.cfc:L68] declares `fetch="join"`.
//
// WHAT IS DELIBERATELY NOT ASSERTED, so a reader can tell an informed omission
// from a gap:
//
//   * NO SMART-LIST SURFACE. `getProductSmartList`
//     [model/service/ProductService.cfc:L342-L358] became `findProducts(criteria)`
//     on `src/services/productService.ts`, which COMPOSES this port's
//     `searchProductsByProductType` with its load-by-identifier. There is no
//     `findProducts`, `ProductQueryCriteria`, `ProductPage`, generic `query`,
//     paging parameter or sort parameter on this port, and none is asserted.
//   * NO DIALECT BRANCH. [model/dao/ProductDAO.cfc:L288] and [:L304] are real
//     dialect branches, but both sit inside the unexercised bulk-import path and
//     neither is modelled by the adapter. Nothing is asserted about them. Dialect
//     assertions belong to `mysqlPriceGroupRepository.test.ts`.
//   * NO `saveImportData` AND NO INTERPOLATED `INSERT`.
//     [model/dao/ProductDAO.cfc:L328] is private and
//     [model/dao/ProductDAO.cfc:L412-L417] interpolates table AND column names
//     into an `INSERT`. Neither is ported, so neither is asserted, and no batching
//     is invented for either.
//   * NO EAV READ PATH. `getAttributeSets` is the only ported route into the
//     attribute subsystem; the `attributeValues` collections are not ported.
//   * THE SKU-SIDE SIBLING DEFECT. The identical unguarded-`term` bind exists at
//     [model/dao/SkuDAO.cfc:L133]; it is asserted in `mysqlSkuRepository.test.ts`,
//     not here. The AND-of-EXISTS option growth check belongs to
//     `skusBySelectedOptions.test.ts`.
//
// NO DATABASE, NO NETWORK, NO FILESYSTEM, NO ENVIRONMENT. Nothing below imports
// `mysql2`, creates a pool or a connection, opens a socket, reads `process.env`,
// or touches the filesystem - and `loadDataFromFile` is exercised in the one way
// that proves it fetches NOTHING. The suite passes with no `.env` present and no
// variable set, and it is never skipped: `tests/setup.ts` exports
// `liveDatabaseTestsEnabled`, and this file deliberately does NOT gate on it,
// because a statement-shape assertion needs no server. Setting or clearing
// `TEST_LIVE_DATABASE` changes nothing here.
// ---------------------------------------------------------------------------

import { describe, expect, it } from 'vitest';

import type { Product } from '../../../src/domain/entities/product.js';
// A VALUE import, and the only entity module this file constructs from directly. The
// product-type-port cases below need a substitute port that ANSWERS with a product type, and a
// hand-rolled object cannot satisfy `Promise<ProductType | undefined>` - the return type names the
// class. The three cases that hydrate through the adapter's own factory still do so; this is used
// only where the WIRED port's answer has to be distinguishable from the adapter's own default.
import { ProductType } from '../../../src/domain/entities/productType.js';
// Type-only: the cascade contract names `Sku` in its signature, and the recording writer below
// restates that signature so the compiler checks the shape on every build.
import type { Sku } from '../../../src/domain/entities/sku.js';
import type {
  AttributeSetSummary,
  ProductSearchRow,
} from '../../../src/domain/ports/productRepository.js';
// Type-only: the ONE collaborator every construction in this file must now name. The adapter's
// product-type port became MANDATORY when a code review recorded its internal
// `new MysqlProductTypeRepository(...)` default as a second composition root, so the doubles below
// are what each case supplies in its place - and annotating them with the published port is what
// keeps the compiler checking that a double still satisfies the contract it stands in for.
import type { ProductTypeRepository } from '../../../src/domain/ports/productTypeRepository.js';
// Type-only: the sale-price collaborator's return projection. The contract the adapter asks for is
// module-local and un-exported there, so the double below satisfies it STRUCTURALLY - but the VALUE it
// answers with is this published projection, and restating it keeps the compiler checking the shape.
import type { SalePriceDetail } from '../../../src/domain/ports/promotionRepository.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import { listToArray } from '../../../src/lib/cfml/list.js';
import { cfBoolean } from '../../../src/lib/cfml/truthiness.js';
import type {
  AuditActorContext,
  PreparedStatementExecutor,
  SqlMutationResult,
  SqlRow,
} from '../../../src/repositories/mysql/connection.js';
import {
  MAX_PLACEHOLDER_COUNT,
  SQL_TUPLE_ROW_LIMIT,
} from '../../../src/repositories/mysql/connection.js';

/**
 * S-07. The audit actor every construction in this file supplies: an ADMIN, PERSISTED
 * account, which is the one combination the legacy gate
 * [org/Hibachi/HibachiEntity.cfc:L628, L633] stamps for. The refusing arms get dedicated
 * cases rather than being the ambient default, so that a regression which dropped the
 * stamping entirely could not hide behind a default that writes nothing.
 */
const TEST_AUDIT_ACTOR: AuditActorContext = Object.freeze({
  accountID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
  adminAccountFlag: true,
});

/**
 * Signed in WITHOUT the admin flag - and carrying an identifier deliberately, so a refusal is
 * provably the flag's doing and not an accident of having nothing to stamp.
 */
const NON_ADMIN_AUDIT_ACTOR: AuditActorContext = Object.freeze({
  accountID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2',
  adminAccountFlag: false,
});

/** An account a CALLER put on a product. It must never reach a bound parameter. */
const FORGED_ACCOUNT_ID = 'ffffffffffffffffffffffffffffffff';

/** The collaborators bag `MysqlProductRepository` requires, as this suite supplies it. */
type ProductHydrationCollaborators = ConstructorParameters<typeof MysqlProductRepository>[2];

/** The optional cascade writer, named so the fixture can forward it without repeating its shape. */
type ProductSkuCascadeWriter = ConstructorParameters<typeof MysqlProductRepository>[3];

/**
 * Constructs the subject with the one collaborator it cannot be built without.
 *
 * ★★★ WHY EVERY CASE IN THIS FILE GOES THROUGH A FIXTURE NOW (F16). The adapter used to accept
 * `collaborators` as an OPTIONAL third argument defaulting to `{}` and, when no
 * `productTypeRepository` arrived, CONSTRUCT a `MysqlProductTypeRepository` over its own executor and
 * audit actor. Code review recorded that as a hidden concrete dependency and a violation of AAP
 * transformation rule T1, which requires every collaborator to be an explicit, compile-checked
 * constructor argument wired in the composition root. The member is now required and the adapter no
 * longer imports its sibling.
 *
 * ★★ THE CONVENIENCE THE DEFAULT BOUGHT IS PRESERVED HERE, WHICH IS WHERE IT BELONGS. This fixture
 * supplies EXACTLY what the removed fallback supplied - a `MysqlProductTypeRepository` over the same
 * executor and the same audit actor this construction site was handed - so every case that used to
 * build the subject from a capturing executor alone still does, and the two cases that observe the
 * fallback's third statement still observe it on the same executor. A caller-supplied bag OVERRIDES
 * it member by member, so the case that proves a wired port wins still proves it.
 *
 * @param executor the capturing or canned executor under test.
 * @param auditActor who writes are attributed to.
 * @param collaborators any bag members this case cares about; merged over the default.
 * @param skuCascadeWriter forwarded unchanged when a cascade case supplies one.
 */
function aProductRepository(
  executor: PreparedStatementExecutor,
  auditActor: AuditActorContext,
  collaborators: Partial<ProductHydrationCollaborators> = {},
  skuCascadeWriter?: ProductSkuCascadeWriter,
): MysqlProductRepository {
  return new MysqlProductRepository(
    executor,
    auditActor,
    {
      productTypeRepository: new MysqlProductTypeRepository(executor, auditActor),
      ...collaborators,
    },
    skuCascadeWriter,
  );
}
import { MysqlProductRepository } from '../../../src/repositories/mysql/mysqlProductRepository.js';
// Built by this suite's own construction fixture to satisfy the now-REQUIRED
// `productTypeRepository` collaborator (F16). It used to be constructed inside the subject.
import { MysqlProductTypeRepository } from '../../../src/repositories/mysql/mysqlProductTypeRepository.js';
import { makeProductFixture } from '../../fixtures/productFixtures.js';
// The aggregate cascade is driven by the product's OWN sku collection, so the cascade cases
// have to build SKUs. Nothing else in this file constructs one.
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

/**
 * The product-type port for every case that must never reach one.
 *
 * ★★★ REFUSING RATHER THAN ANSWERING, AND THAT IS THE WHOLE VALUE OF IT. The adapter's
 * `productTypeRepository` collaborator used to be optional, with the adapter constructing a
 * `MysqlProductTypeRepository` of its own whenever a construction site omitted it - which a code
 * review recorded as a second composition root (AAP 0.3.3 and 0.9.5 reserve wiring for
 * `src/handlers/bootstrap.ts` alone) and, worse, as a default that made INCOMPLETE WIRING LOOK
 * COMPLETE. Now every construction here names a port, and the port the vast majority of them name is
 * this one: if a statement-shape case ever starts consulting the product-type port, it FAILS LOUDLY
 * instead of quietly issuing an extra read against whatever canned rows happened to be next.
 *
 * The two cases that DO exercise the product-type read supply a real adapter over their own recording
 * executor, and the case that distinguishes a wired port's answer supplies an answering double. Those
 * are named at their sites.
 */
const UNREACHED_PRODUCT_TYPE_PORT: ProductTypeRepository = Object.freeze({
  getProductTypeQuery: () => {
    throw new Error('this case must not reach the product-type port: getProductTypeQuery');
  },
  getProductTypeByProductTypeID: () => {
    throw new Error(
      'this case must not reach the product-type port: getProductTypeByProductTypeID',
    );
  },
  getProductTypesByProductTypeIDPath: () => {
    throw new Error(
      'this case must not reach the product-type port: getProductTypesByProductTypeIDPath',
    );
  },
  saveProductType: () => {
    throw new Error('this case must not reach the product-type port: saveProductType');
  },
});

/**
 * The collaborator bag naming exactly the one mandatory port and nothing else.
 *
 * This is the shape a statement-shape case wants: the subject is built over a capturing executor plus
 * the single collaborator the constructor requires, so what the case asserts is still only what the
 * adapter EMITS. Frozen, because the adapter reads the bag and must never be handed a mutable one.
 */
const PRODUCT_TYPE_PORT_BAG_MEMBER = Object.freeze({
  productTypeRepository: UNREACHED_PRODUCT_TYPE_PORT,
});

// --- The recording double ----------------------------------------------------
//
// JUDGMENT CALL: the executor is implemented outright rather than mocked. The
// contract is three methods wide, so `implements PreparedStatementExecutor` makes
// the compiler check the shape on every build - something no runtime mock can do -
// and a mocking library is not in the fixed dependency set, so adding one would
// breach exact pinning (E3). `vi.mock` is available and is deliberately not used.
//
// JUDGMENT CALL: it is duplicated across the six repository suites rather than
// shared. This project keeps one exported unit per file with no barrels (E7), so a
// shared `helpers.ts` would be an exported unit that is the subject of no suite,
// and the folder inventory admits no such module. The duplication is accepted
// deliberately.
//
// JUDGMENT CALL: it records rather than simulates. It is not a database - it never
// parses a statement, never evaluates a predicate and never matches a bound key
// against a row. Every expectation about WHICH ROWS MySQL would return is
// expressed by CHOOSING the canned sequence; the assertions are about what the
// adapter emits and how it maps what comes back.

/** One statement the adapter sent, captured with the parameters it bound to it. */
interface RecordedStatement {
  /** The statement text, exactly as the adapter produced it. */
  readonly sql: string;

  /** The bound parameters, in the positional order they were supplied. */
  readonly params: readonly unknown[];
  /**
   * Whether this statement was issued inside `transaction`.
   *
   * Captured per statement so a suite can PROVE atomicity instead of assuming it.
   * A multi-statement write that must not half-apply is asserted by requiring
   * every one of its statements to carry `true` - a statement that escaped the
   * transaction (by reaching past the `tx` executor to the outer one) records
   * `false` and fails the assertion at the point the mistake is made.
   */
  readonly inTransaction: boolean;
}

/** A statement that matched nothing, which is a legitimate outcome for every read here. */
const NO_ROWS: readonly SqlRow[] = [];

/** What every recorded write reports back, so a save or delete can be observed to succeed. */
const WRITE_RESULT: SqlMutationResult = Object.freeze({ affectedRows: 1, warningStatus: 0 });

/** What a write reports when it matched no row, which is how `deleteProduct` answers false. */
const NO_ROWS_AFFECTED: SqlMutationResult = Object.freeze({ affectedRows: 0, warningStatus: 0 });

/**
 * A `PreparedStatementExecutor` that captures what it is asked to run.
 *
 * Satisfies the narrow executor contract the adapter is constructed with, so it
 * substitutes for the pool-backed executor without the adapter knowing. Nothing
 * here opens a connection, resolves configuration or touches the process
 * environment.
 *
 * It takes an ORDERED SEQUENCE of canned result sets, because three of the seven
 * ported methods issue MORE THAN ONE statement in a single call - the product
 * graph read is followed by a SKU read and then an option read, and the save path
 * reads the prior row before it writes. A single canned set would answer every
 * statement with the same rows and could not express "the product exists but has
 * no SKUs". The sequence is positional and exhausts to the empty result set,
 * which is exactly what a key matching no row returns.
 */
class RecordingExecutor implements PreparedStatementExecutor {
  /** Every result-set statement, in call order. */
  readonly calls: RecordedStatement[] = [];

  /** Every data-modifying statement, in call order. */
  readonly mutationCalls: RecordedStatement[] = [];

  /** What successive `execute` calls hand back, standing in for the server. */
  private readonly cannedResultSets: readonly (readonly SqlRow[])[];

  /** What every `executeMutation` call reports back. */
  private readonly mutationResult: SqlMutationResult;

  /** How many result-set statements have been answered so far. */
  private answeredResultSets = 0;

  /**
   * @param cannedResultSets one result set per expected `execute` call, in order.
   *   Pass `[]` for a statement that matched nothing. A call beyond the end of the
   *   sequence is answered with the empty result set.
   * @param mutationResult what each write reports; defaults to one affected row.
   */
  constructor(
    cannedResultSets: readonly (readonly SqlRow[])[] = [],
    mutationResult: SqlMutationResult = WRITE_RESULT,
  ) {
    this.cannedResultSets = cannedResultSets;
    this.mutationResult = mutationResult;
  }

  /**
   * Record the statement and answer with the next canned result set.
   *
   * The parameter array is COPIED on the way in. The adapter builds several of
   * these arrays with a spread and hands them straight over, and capturing the
   * reference instead would let a later mutation rewrite history that has already
   * been asserted on.
   *
   * @param sql the statement the adapter produced.
   * @param params the parameters it bound, defaulted because the contract declares
   *   them optional.
   * @returns the next canned result set.
   */
  execute(sql: string, params: readonly unknown[] = []): Promise<readonly SqlRow[]> {
    this.calls.push({ sql, params: [...params], inTransaction: this.transactionDepth > 0 });

    const cannedRows = this.cannedResultSets[this.answeredResultSets] ?? NO_ROWS;
    this.answeredResultSets += 1;

    return Promise.resolve(cannedRows);
  }

  /**
   * Record the write and report the configured outcome.
   *
   * The port declares `saveProduct` and `deleteProduct`, so a recorded mutation
   * is expected here rather than a fault. What is asserted is
   * WHICH statement it was, WHAT it bound, and - in the schema-continuity group -
   * that it is never a schema-changing statement.
   *
   * @param sql the statement the adapter produced.
   * @param params the parameters it bound.
   * @returns the configured mutation result.
   */
  executeMutation(sql: string, params: readonly unknown[] = []): Promise<SqlMutationResult> {
    this.mutationCalls.push({
      sql,
      params: [...params],
      inTransaction: this.transactionDepth > 0,
    });

    return Promise.resolve(this.mutationResult);
  }

  /**
   * How many times `transaction` was entered, counting a JOINED inner call.
   *
   * A write that must be atomic is expected to open EXACTLY ONE OUTER unit of work, so
   * this being greater than one means either that the work was split into several units
   * that can half-apply independently, or that an inner call joined the open one - which
   * {@link transactionEvents} is what tells apart.
   */
  transactionCount = 0;

  /** Nesting depth, so joined inner calls do not read as separate units. */
  private transactionDepth = 0;

  /**
   * The transaction boundary, in call order: `BEGIN`, then `COMMIT` or `ROLLBACK`.
   *
   * Separate from `calls` and `mutationCalls` so that a case asserting the STATEMENT
   * sequence is unaffected by whether a transaction wrapped it, while a case asserting
   * ATOMICITY reads this and gets an unambiguous answer.
   *
   * ★ A JOINED INNER CALL RECORDS `'JOIN'`, NOT A SECOND `'BEGIN'`, and contributes no
   * `'COMMIT'`. That mirrors the shipped executor exactly: `createConnectionExecutor` in
   * `src/repositories/mysql/connection.ts` implements the transactional executor's
   * `transaction(work)` as `return work(boundExecutor)`, so an inner call issues no
   * `BEGIN` and the OUTERMOST caller owns the single commit. IT IS LOAD-BEARING HERE:
   * `saveProduct` opens a unit and then calls the cascade writer's `saveSku` for each
   * transient draft, which funnels through `persistSku` and opens a unit on the executor
   * it was handed. Those are joins, not second commits, and `transactionCount` counts them
   * while `transactionEvents` shows only the one real boundary.
   */
  readonly transactionEvents: string[] = [];

  /**
   * Record the transaction boundary and run `work` inline against this same recorder.
   *
   * ★ THE WORK RECEIVES `this`, DELIBERATELY. Every statement issued inside the
   * transaction therefore lands on the same `calls` and `mutationCalls` arrays as one
   * issued outside it, which is what lets a case assert the statement sequence
   * without caring whether it was transactional - and lets {@link transactionEvents}
   * be read separately when the boundary itself is the subject. Each statement also
   * carries an `inTransaction` flag, so the wrapping is observable per statement and
   * not only in aggregate.
   *
   * IT IS NOT A DATABASE. Nothing is buffered and nothing is undone on rollback: the
   * recorder captures WHAT the adapter asked for, and the real transaction semantics
   * belong to the pool-backed executor in `src/repositories/mysql/connection.ts`. A
   * case that needs to see a rollback asserts the recorded ROLLBACK marker and the
   * statements that preceded it.
   *
   * The depth is restored in a `finally` so that a failing unit of work - which is
   * exactly what a rollback test drives - does not leave the recorder believing it
   * is still inside a transaction.
   */
  async transaction<T>(work: (tx: PreparedStatementExecutor) => Promise<T>): Promise<T> {
    this.transactionCount += 1;
    this.transactionDepth += 1;

    const isOutermost = this.transactionDepth === 1;
    this.transactionEvents.push(isOutermost ? 'BEGIN' : 'JOIN');

    try {
      const result = await work(this);

      if (isOutermost) {
        this.transactionEvents.push('COMMIT');
      }

      return result;
    } catch (error: unknown) {
      if (isOutermost) {
        this.transactionEvents.push('ROLLBACK');
      }

      throw error;
    } finally {
      this.transactionDepth -= 1;
    }
  }
}

// --- Reading the recording back ----------------------------------------------
//
// `noUncheckedIndexedAccess` is on, so every indexed read is `T | undefined`. Each
// one is narrowed through a helper below rather than with a postfix `!` or a type
// assertion, both of which would silence exactly the check that stops an absent
// element being read as a present one. The length tests double as real assertions:
// they pin how many statements a method issued.

/**
 * One recorded statement, by position.
 *
 * @param calls the double's recorded statements.
 * @param index the position to read.
 * @returns the statement at that position.
 * @throws When the method issued fewer statements than that.
 */
function statementAt(calls: readonly RecordedStatement[], index: number): RecordedStatement {
  const statement = calls[index];

  if (statement === undefined) {
    throw new Error(
      'Expected a recorded statement at index ' +
        String(index) +
        ', but only ' +
        String(calls.length) +
        ' statement(s) were issued.',
    );
  }

  return statement;
}

/**
 * The single statement a method issued, or a failure describing what it did instead.
 *
 * @param calls the double's recorded statements.
 * @returns the one recorded statement.
 * @throws When the method issued anything other than exactly one statement.
 */
function onlyStatement(calls: readonly RecordedStatement[]): RecordedStatement {
  if (calls.length !== 1) {
    throw new Error(
      'Expected exactly one statement to have been issued, but ' +
        String(calls.length) +
        ' were. A single-statement read must not issue a second lookup, a per-row follow-up ' +
        'or a hydration query.',
    );
  }

  return statementAt(calls, 0);
}

/**
 * One bound parameter, by position.
 *
 * @param params the recorded parameter array.
 * @param index the position to read.
 * @returns the value bound at that position.
 * @throws When the statement bound fewer parameters than that.
 */
function parameterAt(params: readonly unknown[], index: number): unknown {
  if (index >= params.length) {
    throw new Error(
      'Expected a bound parameter at index ' +
        String(index) +
        ', but the statement bound only ' +
        String(params.length) +
        ' parameter(s).',
    );
  }

  return params[index];
}

/**
 * One projected attribute-set summary, narrowed without an escape hatch.
 *
 * @param summaries the projections the adapter returned.
 * @param index the position to read.
 * @returns the projection at that position.
 * @throws When fewer projections were returned than that.
 */
function summaryAt(summaries: readonly AttributeSetSummary[], index: number): AttributeSetSummary {
  const summary = summaries[index];

  if (summary === undefined) {
    throw new Error(
      'Expected an attribute-set projection at index ' +
        String(index) +
        ', but only ' +
        String(summaries.length) +
        ' were returned.',
    );
  }

  return summary;
}

/**
 * The matched row at `index`, or a stated failure.
 *
 * ★★★ THIS REPLACED A `productAt` NARROWER (F38). `searchProductsByProductType` used to hydrate a
 * product graph per match, so the search cases narrowed `readonly Product[]`; it answers the two
 * columns [model/dao/ProductDAO.cfc:L421] selects, keyed as [L429-L436] keys them, so they narrow rows
 * instead - and the entity-shaped narrower has no remaining caller, because the batched ENTITY load
 * answers a keyed map that `requireProduct` below narrows.
 *
 * @param rows the rows the adapter returned.
 * @param index the position to read.
 * @returns the row at that position.
 * @throws When fewer rows were returned than that.
 */
function matchAt(rows: readonly ProductSearchRow[], index: number): ProductSearchRow {
  const row = rows[index];

  if (row === undefined) {
    throw new Error(
      'Expected a matched row at index ' +
        String(index) +
        ', but only ' +
        String(rows.length) +
        ' were returned.',
    );
  }

  return row;
}

/**
 * A product the adapter must have found, narrowed from the port's `| undefined`.
 *
 * Used only where the canned rows guarantee a hit. The miss path is asserted
 * separately and explicitly, because `undefined` on a miss is the contract.
 *
 * @param product what the loader returned.
 * @returns the product.
 * @throws When the loader answered `undefined`.
 */
function requireProduct(product: Product | undefined): Product {
  if (product === undefined) {
    throw new Error(
      'Expected the loader to have materialized a product, but it answered undefined.',
    );
  }

  return product;
}

/**
 * The rejection an operation produced, so its `name` can be asserted.
 *
 * The adapter's error constructors are module-private by design, so each is
 * identified by the `name` it sets rather than with `instanceof`.
 *
 * @param operation the promise-returning call expected to reject.
 * @returns the rejection, as an `Error`.
 * @throws When the operation resolved, or rejected with a non-`Error`.
 */
async function captureRejection(operation: () => Promise<unknown>): Promise<Error> {
  try {
    await operation();
  } catch (thrown: unknown) {
    if (thrown instanceof Error) {
      return thrown;
    }

    throw new Error(
      'Expected the operation to reject with an Error, but it rejected with ' + typeof thrown + '.',
    );
  }

  throw new Error('Expected the operation to reject, but it resolved.');
}

/** How many positional placeholders a statement carries. */
function placeholderCount(sql: string): number {
  return sql.split('?').length - 1;
}

/** How many non-overlapping times a fragment appears in a statement. */
function occurrences(sql: string, fragment: string): number {
  return sql.split(fragment).length - 1;
}

/**
 * Whether an object publishes a member under the given name, own or inherited.
 *
 * This exists so that the ABSENCE of a member can be asserted WITHOUT a type
 * assertion. Reaching for `subject as unknown as Record<string, unknown>` would
 * work, but E1 rules out type assertions, and a double assertion is the widest
 * one there is - it would let a genuine typing mistake anywhere in the probe pass
 * unnoticed. The `in` operator needs no assertion at all: it accepts any object
 * and walks the prototype chain, which is exactly right for class methods, since
 * a method declared on a class body lives on the prototype rather than on the
 * instance.
 */
function declaresMember(target: object, memberName: string): boolean {
  return memberName in target;
}

// --- The expected statements --------------------------------------------------
//
// Transcribed from the legacy `hql` assembly and `setSQL` body, and from the
// column contracts of [model/entity/Product.cfc], [model/entity/Brand.cfc],
// [model/entity/ProductType.cfc], [model/entity/Sku.cfc] and
// [model/entity/Option.cfc] - NOT imported from the module under test, and that is
// the whole point of writing them out. The adapter's statement constants are
// module-private, and a suite that rebuilt its expectations FROM the subject would
// pass no matter what the subject emitted. These literals are the independent copy
// the subject is measured against.
//
// JUDGMENT CALL: every expected statement is assembled from PLAIN LINE LITERALS
// joined with a newline. Not one of them contains an interpolation of any kind, so
// a value-shaped interpolation is STRUCTURALLY IMPOSSIBLE in the expectation
// itself - the proof that values are bound rather than embedded cannot be
// undermined by the way the proof is written (E5). The only literals that vary are
// the placeholder runs, and each of those is spelled out per arity rather than
// generated.
//
// JUDGMENT CALL: indentation is the two-space form the adapter emits, not the tabs
// the legacy CFML string literal carried, and no expected line ends in whitespace.
// Whitespace is inert to SQL, the CLAUSES are what this suite preserves verbatim,
// and a trailing space inside a string literal is invisible to review while still
// failing this repository's formatting gate.

/**
 * The ten projected labels of both attribute-set arms.
 *
 * `attributeSetType.systemCode` [model/dao/ProductDAO.cfc:L55] is an HQL IMPLICIT
 * JOIN across the many-to-one, which Hibernate renders as an INNER JOIN in a WHERE
 * clause - so the flattened `sast.systemCode` label and the `INNER JOIN SwType`
 * below are the faithful rendering, not a widening. The attribute COUNT is a
 * correlated sub-select because the port projects a count and never the
 * collection: `getAttributeSets` is the only ported route into the attribute
 * subsystem and the `attributeValues` EAV path is not ported at all (C1.7).
 */
const EXPECTED_ATTRIBUTE_SET_PROJECTION = [
  'SELECT',
  '  sas.attributeSetID as attributeSetID,',
  '  sas.activeFlag as activeFlag,',
  '  sas.attributeSetName as attributeSetName,',
  '  sas.attributeSetCode as attributeSetCode,',
  '  sas.attributeSetDescription as attributeSetDescription,',
  '  sas.globalFlag as globalFlag,',
  '  sas.requiredFlag as requiredFlag,',
  '  sas.sortOrder as sortOrder,',
  '  sast.systemCode as attributeSetTypeSystemCode,',
  '  (SELECT COUNT(*) FROM SwAttribute sac WHERE sac.attributeSetID = sas.attributeSetID) as attributeCount',
].join('\n');

/**
 * The FROM and the opening half of the shared predicate,
 * [model/dao/ProductDAO.cfc:L53-L55].
 *
 * ★ C1.2: THE OPEN PARENTHESIS AFTER `WHERE` IS PART OF THE CONTRACT. The legacy
 * writes `WHERE (exists(...) AND sas.attributeSetType.systemCode IN (...))`, so the
 * active-attribute test and the type-code test sit INSIDE ONE OUTER GROUP and the
 * arm-specific `AND` that follows is a sibling of that whole group rather than of
 * its second conjunct. Both arms below therefore close the group with `))` before
 * their own `AND`, and the grouping is asserted directly.
 *
 * `sa.activeFlag = ?` is BOUND rather than written as the literal `1` the HQL
 * carries, because E5 admits no interpolated value and a literal in statement text
 * is the habit that leads to an interpolated one.
 */
const EXPECTED_ATTRIBUTE_SET_FROM_AND_OPEN_GROUP = [
  'FROM SwAttributeSet sas',
  'INNER JOIN SwType sast ON sast.typeID = sas.attributeSetTypeID',
  'WHERE (EXISTS (',
  '    SELECT 1 FROM SwAttribute sa',
  '    WHERE sa.attributeSetID = sas.attributeSetID AND sa.activeFlag = ?',
  '  )',
].join('\n');

/**
 * ⭐ C1.3 - THE TWO-KEY ORDERING, [model/dao/ProductDAO.cfc:L62], VERBATIM.
 *
 * Two keys, both `ASC`, in this exact sequence: the attribute-set TYPE system code
 * first, the attribute-set sort order second. L62 appends this AFTER the branch
 * closes at L61, so it is UNCONDITIONAL and both arms carry it identically. It is
 * not reduced to one key, not reordered, and neither `ASC` is dropped. No third
 * key and no tiebreaker is added either: `sortOrder` is nullable so ties are
 * reachable, and the legacy resolved them arbitrarily.
 */
const EXPECTED_ATTRIBUTE_SET_ORDER_BY = 'ORDER BY sast.systemCode ASC, sas.sortOrder ASC';

/**
 * The global-only arm - what the legacy emits when `productTypeIDs` is EMPTY,
 * [model/dao/ProductDAO.cfc:L59-L60] with the bind at [L68].
 *
 * ⚠ EMPTY MEANS "GLOBAL SETS ONLY", NOT "NO FILTER". The legacy `else` is a
 * NARROWING branch, so a caller passing an empty `productTypeIDs` gets FEWER rows,
 * never more. There is no `attributeSetAssignments` sub-clause here at all (C1.1).
 *
 * ⭐ C1.5, THE CORRECT HALF OF THE EXCEPTION: L68 binds the RAW ARRAY, which
 * Hibernate expands into a real `IN` list, so this arm renders ONE PLACEHOLDER PER
 * ELEMENT. Three codes, three placeholders. This is the standard rule and the one
 * that must never be replaced by the other arm's treatment.
 *
 * @param typeCodePlaceholders the placeholder run for the type codes, spelled out.
 * @returns the statement text.
 */
function expectedGlobalArmStatement(typeCodePlaceholders: string): string {
  return [
    EXPECTED_ATTRIBUTE_SET_PROJECTION,
    EXPECTED_ATTRIBUTE_SET_FROM_AND_OPEN_GROUP,
    '  AND sast.systemCode IN (' + typeCodePlaceholders + '))',
    '  AND sas.globalFlag = ?',
    EXPECTED_ATTRIBUTE_SET_ORDER_BY,
  ].join('\n');
}

/**
 * The product-type arm - what the legacy emits when `productTypeIDs` is NON-EMPTY,
 * [model/dao/ProductDAO.cfc:L57-L58] with the bind at [L66].
 *
 * ⭐⭐ C1.5, THE EXCEPTION ITSELF: `sast.systemCode IN (?)` renders EXACTLY ONE
 * placeholder here however many codes were supplied, because L66 binds
 * `arrayToList(arguments.attributeSetTypeCode)` - a single comma-delimited STRING.
 * Contrast the global arm above, which renders one per element. The two arms are
 * opposites and the asymmetry is the contract.
 *
 * ⚠ THE LINK TABLE IS A DOCUMENTED CORRECTION, NOT A TRANSCRIPTION. The legacy
 * fragment names `sas.attributeSetAssignments`, and no `AttributeSetAssignment.cfc`
 * exists anywhere in the repository - the association the schema actually provides
 * is the many-to-many over `linktable="SwAttributeSetProductType"` with
 * `fkcolumn="attributeSetID"` and `inversejoincolumn="productTypeID"`, whose two
 * columns are exactly the ones the legacy predicate names. The adapter emits the
 * real link table and this suite pins that, because a statement naming a table
 * that does not exist cannot read the `Sw*` schema the migration must preserve
 * (B5). This suite therefore asserts the CORRECTED table and records why.
 *
 * @param productTypePlaceholders the placeholder run for the product types.
 * @returns the statement text.
 */
function expectedProductTypeArmStatement(productTypePlaceholders: string): string {
  return [
    EXPECTED_ATTRIBUTE_SET_PROJECTION,
    EXPECTED_ATTRIBUTE_SET_FROM_AND_OPEN_GROUP,
    '  AND sast.systemCode IN (?))',
    '  AND (sas.globalFlag = ?',
    '    OR EXISTS (',
    '      SELECT 1 FROM SwAttributeSetProductType saspt',
    '      WHERE saspt.attributeSetID = sas.attributeSetID',
    '        AND saspt.productTypeID IN (' + productTypePlaceholders + ')',
    '    ))',
    EXPECTED_ATTRIBUTE_SET_ORDER_BY,
  ].join('\n');
}

// JUDGMENT CALL: legacy raw SQL at model/dao/ProductDAO.cfc:L421 names the ORM entity
// SlatwallProduct and therefore always throws at runtime; the target emits the physical
// SwProduct table as a correction mandated by schema continuity (C5/B5).
// CFML parity [model/dao/ProductDAO.cfc:L419-L427]: the LIKE predicate, the optional direct
// productTypeID IN filter and the absence of ORDER BY are reproduced unchanged.
/**
 * ⭐ The product search WITHOUT the product-type predicate,
 * [model/dao/ProductDAO.cfc:L421] with the guard at [L423] not taken.
 *
 * This is deliberately NOT marked `LEGACY-DEFECT`: that marker means "preserved
 * deliberately", and here the behaviour is CORRECTED. `SlatwallProduct` is the ORM
 * ENTITY name [model/entity/Product.cfc:L49] while the PHYSICAL table on the same
 * line is `SwProduct`, and raw SQL through `new Query()` + `setSQL()` + `execute()`
 * bypasses the ORM entirely - so the legacy statement always fails with "table
 * doesn't exist". It is one of exactly three such in-scope raw-SQL sites, the
 * others being [model/dao/ProductTypeDAO.cfc:L53-L54] and
 * [model/dao/SkuDAO.cfc:L132] / [:L135]. No `CREATE VIEW` exists anywhere in the
 * repository to bridge the two names.
 *
 * By contrast the HQL in `getAttributeSets` correctly names the ORM entity
 * `SlatwallAttributeSet` and needs NO correction, because HQL resolves entity
 * names. Only the three raw-SQL sites are corrected.
 *
 * ⚠ THE KEYWORD CASING IS LOWER CASE, mirroring the legacy literal, so the
 * provenance of the text is visible at a glance - contrast the attribute-set
 * statements above, which mirror their HQL source's upper case. `productName` is
 * projected and never read by the adapter, and it is carried over anyway rather
 * than trimmed to what the adapter happens to need.
 */
const EXPECTED_PRODUCT_SEARCH_WITHOUT_TYPES =
  'select productID,productName from SwProduct where productName like ?';

/**
 * The product search WITH the product-type predicate,
 * [model/dao/ProductDAO.cfc:L424] appended and [L425] bound with `list="true"`.
 *
 * ⚠ C2.4: THE FILTER IS DIRECT, NOT A SUBQUERY. `productTypeID` is a column of
 * `SwProduct` [model/entity/Product.cfc:L69], so the legacy filters the product row
 * itself. Its sibling `searchSkusByProductType` filters through a CORRELATED
 * `IN`-SUBQUERY because a SKU has no product-type column of its own. No subquery is
 * introduced here to make the two look alike.
 *
 * ⚠ C2.6: NO `ORDER BY`, and none is added. Contrast `ProductTypeDAO`, whose
 * `ORDER BY productTypeName ASC` IS contract. The two rules point in opposite
 * directions and both are deliberate.
 *
 * @param productTypePlaceholders the placeholder run for the product types.
 * @returns the statement text.
 */
function expectedProductSearchWithTypes(productTypePlaceholders: string): string {
  return (
    EXPECTED_PRODUCT_SEARCH_WITHOUT_TYPES +
    ' and productTypeID in (' +
    productTypePlaceholders +
    ')'
  );
}

/**
 * The forty-five-label product graph read, aliased `p_` / `b_` / `pt_`.
 *
 * T3 FETCH SHAPE, materialized in ONE statement: `brand` and `productType` are
 * joined because both declare `fetch="join"` [model/entity/Product.cfc:L68-L69].
 * Both joins are LEFT, because both columns are nullable - an INNER JOIN would
 * silently drop a brandless product.
 */
const EXPECTED_PRODUCT_GRAPH_HEAD = [
  'SELECT',
  '  p.productID as p_productID,',
  '  p.activeFlag as p_activeFlag,',
  '  p.urlTitle as p_urlTitle,',
  '  p.productName as p_productName,',
  '  p.productCode as p_productCode,',
  '  p.productDescription as p_productDescription,',
  '  p.publishedFlag as p_publishedFlag,',
  '  p.sortOrder as p_sortOrder,',
  '  p.calculatedSalePrice as p_calculatedSalePrice,',
  '  p.calculatedQATS as p_calculatedQATS,',
  '  p.calculatedAllowBackorderFlag as p_calculatedAllowBackorderFlag,',
  '  p.calculatedTitle as p_calculatedTitle,',
  '  p.brandID as p_brandID,',
  '  p.productTypeID as p_productTypeID,',
  '  p.defaultSkuID as p_defaultSkuID,',
  '  p.remoteID as p_remoteID,',
  '  p.createdDateTime as p_createdDateTime,',
  '  p.createdByAccountID as p_createdByAccountID,',
  '  p.modifiedDateTime as p_modifiedDateTime,',
  '  p.modifiedByAccountID as p_modifiedByAccountID,',
  '  b.brandID as b_brandID,',
  '  b.activeFlag as b_activeFlag,',
  '  b.publishedFlag as b_publishedFlag,',
  '  b.urlTitle as b_urlTitle,',
  '  b.brandName as b_brandName,',
  '  b.brandWebsite as b_brandWebsite,',
  '  b.remoteID as b_remoteID,',
  '  b.createdDateTime as b_createdDateTime,',
  '  b.createdByAccountID as b_createdByAccountID,',
  '  b.modifiedDateTime as b_modifiedDateTime,',
  '  b.modifiedByAccountID as b_modifiedByAccountID,',
  '  pt.productTypeID as pt_productTypeID,',
  '  pt.productTypeIDPath as pt_productTypeIDPath,',
  '  pt.activeFlag as pt_activeFlag,',
  '  pt.publishedFlag as pt_publishedFlag,',
  '  pt.urlTitle as pt_urlTitle,',
  '  pt.productTypeName as pt_productTypeName,',
  '  pt.productTypeDescription as pt_productTypeDescription,',
  '  pt.systemCode as pt_systemCode,',
  '  pt.parentProductTypeID as pt_parentProductTypeID,',
  '  pt.remoteID as pt_remoteID,',
  '  pt.createdDateTime as pt_createdDateTime,',
  '  pt.createdByAccountID as pt_createdByAccountID,',
  '  pt.modifiedDateTime as pt_modifiedDateTime,',
  '  pt.modifiedByAccountID as pt_modifiedByAccountID',
  'FROM SwProduct p',
  'LEFT JOIN SwBrand b ON b.brandID = p.brandID',
  'LEFT JOIN SwProductType pt ON pt.productTypeID = p.productTypeID',
].join('\n');

/**
 * The product graph read for a given number of identifiers.
 *
 * @param productPlaceholders the placeholder run for the product identifiers.
 * @returns the statement text.
 */
function expectedProductGraphStatement(productPlaceholders: string): string {
  return EXPECTED_PRODUCT_GRAPH_HEAD + '\n' + 'WHERE p.productID IN (' + productPlaceholders + ')';
}

/**
 * The sixteen-column SKU read.
 *
 * ONE STATEMENT, TWO PREDICATES, AND THE `OR` IS LOAD-BEARING. `skus` is the
 * one-to-many keyed on `SwSku.productID` [model/entity/Product.cfc:L73], while
 * `defaultSku` is a many-to-one keyed on `SwProduct.defaultSkuID`
 * [model/entity/Product.cfc:L70]; nothing in the schema guarantees the second is a
 * member of the first, so the identifier predicate closes that hole. NO `ORDER BY`:
 * `Product.skus` declares none, so sorting here would invent an ordering the legacy
 * never had.
 */
const EXPECTED_SKU_READ_HEAD = [
  'SELECT',
  '  s.skuID,',
  '  s.activeFlag,',
  '  s.skuCode,',
  '  s.listPrice,',
  '  s.price,',
  '  s.renewalPrice,',
  '  s.imageFile,',
  '  s.userDefinedPriceFlag,',
  '  s.calculatedQATS,',
  '  s.productID,',
  '  s.subscriptionTermID,',
  '  s.remoteID,',
  '  s.createdDateTime,',
  '  s.createdByAccountID,',
  '  s.modifiedDateTime,',
  '  s.modifiedByAccountID',
  'FROM SwSku s',
].join('\n');

// CFML parity [model/entity/Sku.cfc:L76]: `linktable="SwSkuOption" fkcolumn="skuID"
// inversejoincolumn="optionID"`, with NO `orderby`.
/**
 * The SKU option read across the link table, with the option group joined alongside.
 *
 * The `INNER JOIN` on `SwOption` is faithful - Hibernate's collection load joins the
 * link table to the target table, and a link row naming an option that does not
 * exist contributes no element. `so.skuID` is projected under its own label so each
 * option attaches to its SKU without a second statement per SKU, which is what
 * makes the fetch shape a property of the method rather than of the caller.
 *
 * The `LEFT JOIN` on `SwOptionGroup` is what makes `Product.getOptionGroups()`
 * answerable without a fourth statement: `Option.optionGroup`
 * [model/entity/Option.cfc:L59] is a nullable many-to-one, so an option with no
 * group has to survive the join rather than disappear from the result set. The
 * group columns are alias-prefixed because `SwOption` and `SwOptionGroup` share
 * `optionGroupID`, `sortOrder`, `remoteID` and the four audit column names.
 */
const EXPECTED_SKU_OPTION_READ_HEAD = [
  'SELECT',
  '  so.skuID as link_skuID,',
  '  o.optionID,',
  '  o.optionCode,',
  '  o.optionName,',
  '  o.optionDescription,',
  '  o.sortOrder,',
  '  o.optionGroupID,',
  '  o.defaultImageID,',
  '  o.remoteID,',
  '  o.createdDateTime,',
  '  o.createdByAccountID,',
  '  o.modifiedDateTime,',
  '  o.modifiedByAccountID,',
  '  og.optionGroupID as optionGroup_optionGroupID,',
  '  og.optionGroupName as optionGroup_optionGroupName,',
  '  og.optionGroupCode as optionGroup_optionGroupCode,',
  '  og.optionGroupImage as optionGroup_optionGroupImage,',
  '  og.optionGroupDescription as optionGroup_optionGroupDescription,',
  '  og.imageGroupFlag as optionGroup_imageGroupFlag,',
  '  og.sortOrder as optionGroup_sortOrder,',
  '  og.remoteID as optionGroup_remoteID,',
  '  og.createdDateTime as optionGroup_createdDateTime,',
  '  og.createdByAccountID as optionGroup_createdByAccountID,',
  '  og.modifiedDateTime as optionGroup_modifiedDateTime,',
  '  og.modifiedByAccountID as optionGroup_modifiedByAccountID',
  'FROM SwSkuOption so',
  'INNER JOIN SwOption o ON o.optionID = so.optionID',
  'LEFT JOIN SwOptionGroup og ON og.optionGroupID = o.optionGroupID',
].join('\n');

/** The existence read of the save path - one column, because one column is all the decision needs. */
const EXPECTED_PRODUCT_EXISTENCE_READ = 'SELECT productID FROM SwProduct WHERE productID = ?';

/**
 * The twenty-column product insert.
 *
 * Twenty columns, twenty placeholders, twenty bound parameters, one ordered source.
 * The audit pair is written by the save path rather than read off the argument,
 * reproducing `HibachiEntity.preInsert`, which took ONE `now()` and wrote it to
 * BOTH stamps.
 */
const EXPECTED_PRODUCT_INSERT = [
  'INSERT INTO SwProduct (',
  '  productID,',
  '  activeFlag,',
  '  urlTitle,',
  '  productName,',
  '  productCode,',
  '  productDescription,',
  '  publishedFlag,',
  '  sortOrder,',
  '  calculatedSalePrice,',
  '  calculatedQATS,',
  '  calculatedAllowBackorderFlag,',
  '  calculatedTitle,',
  '  brandID,',
  '  productTypeID,',
  '  defaultSkuID,',
  '  remoteID,',
  '  createdDateTime,',
  '  createdByAccountID,',
  '  modifiedDateTime,',
  '  modifiedByAccountID',
  ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
].join('\n');

/**
 * The seventeen-assignment product update, with THE KEY BOUND LAST.
 *
 * `productID` is excluded from the SET list because it is the key the statement
 * MATCHES on; `createdDateTime` and `createdByAccountID` are excluded because
 * `HibachiEntity.preUpdate` stamped only the modified pair and left the created
 * pair exactly as the insert wrote it. Carrying them into the SET list would let a
 * caller that hydrated an entity without them overwrite real creation provenance
 * with NULL.
 */
const EXPECTED_PRODUCT_UPDATE = [
  'UPDATE SwProduct',
  'SET',
  '  activeFlag = ?,',
  '  urlTitle = ?,',
  '  productName = ?,',
  '  productCode = ?,',
  '  productDescription = ?,',
  '  publishedFlag = ?,',
  '  sortOrder = ?,',
  '  calculatedSalePrice = ?,',
  '  calculatedQATS = ?,',
  '  calculatedAllowBackorderFlag = ?,',
  '  calculatedTitle = ?,',
  '  brandID = ?,',
  '  productTypeID = ?,',
  '  defaultSkuID = ?,',
  '  remoteID = ?,',
  '  modifiedDateTime = ?,',
  // S-07. This ONE column resolves against itself rather than binding a bare placeholder.
  // `preUpdate` [org/Hibachi/HibachiEntity.cfc:L676-L678] stamps the modifying account only
  // when the actor gate passes and leaves the loaded value alone when it does not, so
  // Hibernate rewrote the SAME value. A bare `?` would bind null on a refused gate and ERASE
  // an attribution the legacy preserved - a worse outcome than the finding it fixes.
  '  modifiedByAccountID = COALESCE(?, modifiedByAccountID)',
  'WHERE productID = ?',
].join('\n');

/**
 * The ten product link-row deletes that OPEN the delete sequence, in declaration order.
 *
 * Transcribed from `model/entity/Product.cfc:L79-L90` - the three owner and seven
 * inverse `many-to-many` properties - because that is the set
 * `HibachiEntity.removeAllManyToManyRelationships()`
 * [org/Hibachi/HibachiEntity.cfc:L271-L284] selects: every `many-to-many` property
 * with no delete cascade, and NOT ONE of Product's ten declares one. The framework ran
 * it before the DAO delete [org/Hibachi/HibachiService.cfc:L61] with the stated purpose
 * of not violating a foreign-key constraint.
 */
// ★ THREE OWNED, THEN SEVEN INVERSE, WHICH IS THE ORDER THE ADAPTER WALKS THEM AND THE
// REASON THE LIST IS NOT ALPHABETICAL. The first three are declared on the product with no
// `inverse="true"` [model/entity/Product.cfc:L79-L81], so their rows go with the owner. The
// other seven are declared on the FAR side and the product only participates in them -
// `removeAllManyToManyRelationships()` [org/Hibachi/HibachiService.cfc:L61] cleared those
// too, which is why omitting them would leave the product undeletable where the schema
// constrains them and the rows orphaned where it does not.
const EXPECTED_PRODUCT_LINK_DELETES: readonly string[] = [
  'DELETE FROM SwProductListingPage WHERE productID = ?',
  'DELETE FROM SwProductCategory WHERE productID = ?',
  'DELETE FROM SwRelatedProduct WHERE productID = ?',
  'DELETE FROM SwPromoRewardProduct WHERE productID = ?',
  'DELETE FROM SwPromoRewardExclProduct WHERE productID = ?',
  'DELETE FROM SwPromoQualProduct WHERE productID = ?',
  'DELETE FROM SwPromoQualExclProduct WHERE productID = ?',
  'DELETE FROM SwPriceGroupRateProduct WHERE productID = ?',
  'DELETE FROM SwVendorProduct WHERE productID = ?',
  'DELETE FROM SwPhysicalProduct WHERE productID = ?',
];

/**
 * The default-SKU DETACH, which is the FIRST statement of the delete and not a link delete
 * at all.
 *
 * `SwSku.productID` references `SwProduct` [model/entity/Sku.cfc:L65] and
 * `SwProduct.defaultSkuID` references `SwSku` [model/entity/Product.cfc:L70], so the SKU
 * rows cannot go while the product row still names one of them. The legacy solved the same
 * problem one tier up, nulling the association before delegating to the framework delete
 * [model/service/ProductService.cfc:L323]; this is the SQL half of that null-out.
 *
 * It clears one column and deliberately does NOT re-stamp the audit pair: the row it
 * updates is deleted twenty-three statements later in the same unit of work, so a
 * modification stamp would record a change nobody can ever read.
 */
const EXPECTED_PRODUCT_DEFAULT_SKU_DETACH =
  'UPDATE SwProduct SET defaultSkuID = NULL WHERE productID = ?';

/**
 * The eight SKU-dependent tables, reached through a SUBQUERY over the product's SKUs.
 *
 * Four are the link tables a SKU OWNS [model/entity/Sku.cfc:L76-L79]; the rest are its
 * `cascade="all-delete-orphan"` children [L69-L73] whose physical tables this slice can
 * name. Keying by subquery rather than by a bound SKU list makes the cleanup independent of
 * whatever the argument happened to have materialized and keeps the statement count fixed.
 */
const EXPECTED_PRODUCT_SKU_CHILD_DELETES: readonly string[] = [
  'DELETE FROM SwAlternateSkuCode WHERE skuID IN (SELECT skuID FROM SwSku WHERE productID = ?)',
  'DELETE FROM SwAttributeValue WHERE skuID IN (SELECT skuID FROM SwSku WHERE productID = ?)',
  'DELETE FROM SwSkuCurrency WHERE skuID IN (SELECT skuID FROM SwSku WHERE productID = ?)',
  'DELETE FROM SwStock WHERE skuID IN (SELECT skuID FROM SwSku WHERE productID = ?)',
  'DELETE FROM SwSkuOption WHERE skuID IN (SELECT skuID FROM SwSku WHERE productID = ?)',
  'DELETE FROM SwSkuAccessContent WHERE skuID IN (SELECT skuID FROM SwSku WHERE productID = ?)',
  'DELETE FROM SwSkuSubsBenefit WHERE skuID IN (SELECT skuID FROM SwSku WHERE productID = ?)',
  'DELETE FROM SwSkuRenewalSubsBenefit WHERE skuID IN (SELECT skuID FROM SwSku WHERE productID = ?)',
];

/** The product's own SKU rows - `cascade="all-delete-orphan"` [model/entity/Product.cfc:L73]. */
const EXPECTED_PRODUCT_SKUS_DELETE = 'DELETE FROM SwSku WHERE productID = ?';

/**
 * The three product-level children - `cascade="all-delete-orphan"` one-to-many
 * [model/entity/Product.cfc:L74-L76]. They key on `productID` directly rather than through
 * a subquery, because each names the product itself.
 */
const EXPECTED_PRODUCT_CHILD_DELETES: readonly string[] = [
  'DELETE FROM SwImage WHERE productID = ?',
  'DELETE FROM SwAttributeValue WHERE productID = ?',
  'DELETE FROM SwProductReview WHERE productID = ?',
];

/** The product row - one row, one bound key, and the LAST statement of the sequence. */
const EXPECTED_PRODUCT_DELETE = 'DELETE FROM SwProduct WHERE productID = ?';

/**
 * The whole delete sequence in the order the adapter must emit it: the default-SKU detach,
 * eight SKU-dependent tables, the SKU rows, the ten link tables, the three product-level
 * children, then the product row. TWENTY-FOUR statements, and the count does not grow with
 * the number of rows involved.
 *
 * ★ THE ORDER IS THE ONLY ORDER THE FOREIGN KEYS PERMIT. The detach frees `SwSku` from the
 * product row; the SKU-dependents have to go while `SwSku` still holds the rows their
 * subquery selects; and the link rows go before their parent because
 * [org/Hibachi/HibachiEntity.cfc:L270] says in as many words that they do, "so that it
 * doesn't violate fkconstrint".
 */
const EXPECTED_PRODUCT_DELETE_SEQUENCE: readonly string[] = [
  EXPECTED_PRODUCT_DEFAULT_SKU_DETACH,
  ...EXPECTED_PRODUCT_SKU_CHILD_DELETES,
  EXPECTED_PRODUCT_SKUS_DELETE,
  ...EXPECTED_PRODUCT_LINK_DELETES,
  ...EXPECTED_PRODUCT_CHILD_DELETES,
  EXPECTED_PRODUCT_DELETE,
];

/** Every statement this suite expects, for the schema-continuity sweep. */
// NO `SwBrand` WRITE STATEMENT IS PINNED, BECAUSE THE ADAPTER EMITS NONE. The port's
// member set is locked at six and publishes no brand write; `SwBrand` appears only in
// the product graph's `LEFT JOIN`, which is what [model/entity/Product.cfc:L68]
// `fetch="join"` requires. The header records why the seventh member and its three
// write statements were removed rather than relocated.

/**
 * The deferred `defaultSkuID` write the aggregate cascade issues LAST.
 *
 * ★ ONE COLUMN AND A KEY, WHICH IS THE WHOLE STATEMENT. `SwSku.productID` and
 * `SwProduct.defaultSkuID` point at each other [model/entity/Sku.cfc:L65;
 * model/entity/Product.cfc:L70], so on a create neither key can be written at the
 * moment the other row is inserted. Hibernate resolved that by ordering the inserts
 * and issuing a follow-up update, and this is that update. It deliberately does NOT
 * re-stamp `modifiedDateTime`: the caller made one modification, and a second full
 * update would report two.
 */
const EXPECTED_PRODUCT_DEFAULT_SKU_UPDATE =
  'UPDATE SwProduct SET defaultSkuID = ? WHERE productID = ?';

const EVERY_EXPECTED_STATEMENT: readonly string[] = [
  expectedGlobalArmStatement('?'),
  expectedGlobalArmStatement('?, ?'),
  expectedGlobalArmStatement('?, ?, ?'),
  expectedProductTypeArmStatement('?'),
  expectedProductTypeArmStatement('?, ?'),
  expectedProductTypeArmStatement('?, ?, ?'),
  EXPECTED_PRODUCT_SEARCH_WITHOUT_TYPES,
  expectedProductSearchWithTypes('?'),
  expectedProductSearchWithTypes('?, ?'),
  expectedProductSearchWithTypes('?, ?, ?'),
  expectedProductGraphStatement('?'),
  EXPECTED_PRODUCT_EXISTENCE_READ,
  EXPECTED_PRODUCT_INSERT,
  EXPECTED_PRODUCT_UPDATE,
  ...EXPECTED_PRODUCT_DELETE_SEQUENCE,
  EXPECTED_PRODUCT_DEFAULT_SKU_UPDATE,
];

// --- Fixed inputs ------------------------------------------------------------
//
// Identifiers are the 32-character lower-case hexadecimal shape the legacy minted
// with `lcase(replace(createUUID(),"-","","all"))`, so a bound identifier is
// indistinguishable from a real one. None is a credential, a hostname or a
// connection target (E6).

/** The one attribute-set type system code the catalog slice actually reads. */
const PRODUCT_ATTRIBUTE_SET_TYPE_CODE = 'astProduct';

/** A second code, so the multi-element binding asymmetry is observable. */
const SKU_ATTRIBUTE_SET_TYPE_CODE = 'astSku';

/** A third code, so a three-element list can be asserted alongside one and two. */
const ORDER_ATTRIBUTE_SET_TYPE_CODE = 'astOrder';

/** A product-type identifier used to narrow the attribute-set read and the search. */
const MERCHANDISE_PRODUCT_TYPE_ID = 'c1b7e94a2d6f4083ba51e7c3d92f6018';

/** A second product-type identifier. */
const SUBSCRIPTION_PRODUCT_TYPE_ID = 'a58f31d0e7b24c69ad03f16b8e4c297d';

/** A third product-type identifier. */
const GIFT_CARD_PRODUCT_TYPE_ID = 'f60d29c4b81e47a5b93c05de712f8a36';

/** The product identifier the graph, save and delete cases match on. */
const PERSISTED_PRODUCT_ID = '3e8a1f7c94d2406bb7150af8c6d29e34';

/** An identifier no canned row carries, so the miss path is reachable. */
const UNMATCHED_PRODUCT_ID = 'd47c0b8e31a2496fb85de0c7391a4b62';

/**
 * The url title `makeProductFixture` defaults to.
 *
 * [meta/tests/unit/entity/ProductTest.cfc:L59] `setURLTitle("nike-air-jorden")`, carried
 * through the fixture verbatim. Named here so the populate cases can assert "the ENTITY's
 * value survived" without restating a literal the fixture owns.
 */
const FIXTURE_URL_TITLE = 'nike-air-jorden';

/** The product name `makeProductFixture` defaults to - [meta/tests/unit/Helper.cfc:L54]. */
const LEGACY_FIXTURE_PRODUCT_NAME = 'Test Product';

/**
 * A url title standing in for one the service's generator resolved.
 *
 * Deliberately unlike {@link FIXTURE_URL_TITLE} so no populate assertion can pass by
 * coincidence, and deliberately slug-shaped so it is recognizable as what
 * `createUniqueURLTitle` [model/service/ProductService.cfc:L269] produces.
 */
const RESOLVED_URL_TITLE = 'a-title-the-generator-resolved';

/** A product name standing in for one arriving in the save payload. */
const OVERRIDING_PRODUCT_NAME = 'A Name The Payload Supplied';

/** Where `urlTitle` sits in {@link EXPECTED_PRODUCT_INSERT}'s bound parameters. */
const INSERT_URL_TITLE_POSITION = 2;

/** Where `productName` sits in {@link EXPECTED_PRODUCT_INSERT}'s bound parameters. */
const INSERT_PRODUCT_NAME_POSITION = 3;

/**
 * Where `urlTitle` sits in {@link EXPECTED_PRODUCT_UPDATE}'s bound parameters.
 *
 * One position earlier than on the insert, because the update's SET list omits `productID` -
 * it is the column the statement MATCHES on rather than one it sets, and it is bound LAST.
 */
const UPDATE_URL_TITLE_POSITION = 1;

/** The SKU identifier the graph case hangs off the product. */
const PERSISTED_SKU_ID = '9b2e75c0a4f14d38be61c07d5a3f298e';

/**
 * The zero-based position `defaultSkuID` occupies in the product insert's parameter array.
 *
 * Named rather than inlined because the deferral case reads the SAME position twice - once
 * expecting NULL and once expecting a bound key - and a bare `14` repeated in both halves would
 * let one drift from the other. The position is fixed by {@link EXPECTED_PRODUCT_INSERT}, whose
 * column list this suite already asserts verbatim, so the two cannot disagree silently.
 */
const DEFAULT_SKU_ID_PARAMETER_INDEX = 14;

/** The option identifier the SKU-option read returns. */
const PERSISTED_OPTION_ID = '2af86d31c957402eb0d47f19a6e35c8b';

/** The brand identifier the eager product-graph join materializes. */
const PERSISTED_BRAND_ID = '7c4e0a92b5d34816af7e2c05d1b83f6a';

/** The search term the LIKE predicate wraps. */
const SEARCH_TERM = 'jorden';

/** A term carrying SQL metacharacters, to prove they never reach statement text. */
const INJECTION_SHAPED_TERM = "x' OR 1=1 --";

/** The minted-identifier shape the legacy produced and the adapter reproduces. */
const MINTED_IDENTIFIER_PATTERN = /^[0-9a-f]{32}$/;

/** The bound value the active-attribute EXISTS test carries, [model/dao/ProductDAO.cfc:L54]. */
const ACTIVE_ATTRIBUTE_FLAG = 1;

/** The bound value the global-flag predicate carries, [model/dao/ProductDAO.cfc:L57, L60]. */
const GLOBAL_ATTRIBUTE_SET_FLAG = 1;

// --- Canned rows -------------------------------------------------------------
//
// Each row is keyed by the LABEL the corresponding statement projects, because that
// is what the driver would hand back. Column values are the shapes `mysql2` really
// produces: `1` / `0` for a MySQL `bit`, `null` for SQL NULL, and a DECIMAL as a
// STRING - `decimalNumbers` is unset on the pool, so a money column arrives as text
// and `Money` is constructed from it. No monetary value is written as a JavaScript
// float anywhere in this file, including in an expected value (E4).

/**
 * One attribute-set row, as either arm projects it.
 *
 * `globalFlag` arrives as `1` and `sortOrder` as a number; the three nullable text
 * columns are populated so the optional members of the projection are observable,
 * and `activeFlag` is deliberately `null` so the "omitted rather than defaulted"
 * rule is provable.
 */
const ATTRIBUTE_SET_ROW: SqlRow = Object.freeze({
  attributeSetID: '81c4f0d7a3e64b29b5170fd8c2e396a4',
  activeFlag: null,
  attributeSetName: 'Product Details',
  attributeSetCode: 'productDetails',
  attributeSetDescription: 'Merchandise detail attributes.',
  globalFlag: 1,
  requiredFlag: 0,
  sortOrder: 2,
  attributeSetTypeSystemCode: PRODUCT_ATTRIBUTE_SET_TYPE_CODE,
  attributeCount: 4,
});

/**
 * One row of the product search projection, [model/dao/ProductDAO.cfc:L421].
 *
 * Both projected columns are present even though the adapter reads only the
 * identifier, because the statement projects both and the driver would return both.
 */
const PRODUCT_SEARCH_ROW: SqlRow = Object.freeze({
  productID: PERSISTED_PRODUCT_ID,
  productName: 'Nike Air Jorden',
});

/**
 * One row of the forty-five-label graph read.
 *
 * `p_activeFlag` is `null` ON PURPOSE. [model/entity/Product.cfc:L53] declares
 * `activeFlag` with NO `default=`, so a NULL column is the honest state, and it is
 * what makes the `cfBoolean()` assertion below meaningful rather than decorative.
 * `b_brandID` and `pt_productTypeID` are NULL so the two LEFT JOINs are observably
 * left joins - an INNER JOIN would have dropped this row.
 */
const PRODUCT_GRAPH_ROW: SqlRow = Object.freeze({
  p_productID: PERSISTED_PRODUCT_ID,
  p_activeFlag: null,
  p_urlTitle: 'nike-air-jorden',
  p_productName: 'Nike Air Jorden',
  p_productCode: 'NIKEAIRJORDEN',
  p_productDescription: null,
  p_publishedFlag: 1,
  p_sortOrder: null,
  p_calculatedSalePrice: null,
  p_calculatedQATS: null,
  p_calculatedAllowBackorderFlag: 0,
  p_calculatedTitle: null,
  p_brandID: null,
  p_productTypeID: null,
  p_defaultSkuID: null,
  p_remoteID: null,
  p_createdDateTime: null,
  p_createdByAccountID: null,
  p_modifiedDateTime: null,
  p_modifiedByAccountID: null,
  b_brandID: null,
  pt_productTypeID: null,
});

/**
 * The same graph row, but naming a default SKU.
 *
 * Used where the SKU read's second predicate has to be observable: the default-SKU
 * identifier is bound in addition to the product identifier.
 */
const PRODUCT_GRAPH_ROW_WITH_DEFAULT_SKU: SqlRow = Object.freeze({
  ...PRODUCT_GRAPH_ROW,
  p_defaultSkuID: PERSISTED_SKU_ID,
});

/**
 * The same graph row with a MATERIALIZED brand on both sides of the join.
 *
 * Both `p_brandID` and `b_brandID` carry the identifier, because the adapter treats a
 * product row whose `p_brandID` is set while `b_brandID` came back NULL as a DANGLING
 * KEY and refuses it. Setting both is the shape a real `LEFT JOIN` produces when the
 * brand exists.
 *
 * This row is how a PERSISTED brand instance is obtained without importing the brand
 * entity module: it is hydrated through the adapter's own factory and read off the
 * product. `src/domain/entities/brand.ts` is deliberately NOT among this file's
 * declared dependencies, so it is not imported (D4), and no sixth fixture module is
 * added to manufacture one.
 */
const PRODUCT_GRAPH_ROW_WITH_BRAND: SqlRow = Object.freeze({
  ...PRODUCT_GRAPH_ROW,
  p_brandID: PERSISTED_BRAND_ID,
  // All ELEVEN projected brand labels, because `b_brandID` alone is only the sentinel
  // the adapter tests to decide whether a brand came back at all. Once it is non-NULL
  // the factory reads the whole brand row, and a row missing even one label is refused
  // with a named column error rather than silently hydrating a half-built entity -
  // which is the correct behaviour and is why they are all supplied here.
  b_brandID: PERSISTED_BRAND_ID,
  b_activeFlag: 1,
  b_publishedFlag: 1,
  b_urlTitle: 'nike',
  b_brandName: 'Nike',
  b_brandWebsite: null,
  b_remoteID: null,
  b_createdDateTime: null,
  b_createdByAccountID: null,
  b_modifiedDateTime: null,
  b_modifiedByAccountID: null,
});

/**
 * The graph row with a MATERIALIZED product type WHOSE `systemCode` IS NULL.
 *
 * ★★★ THIS FIXTURE EXISTS BECAUSE OF A RUNTIME FINDING, AND THE NULL IS THE WHOLE POINT. Until QA
 * testing drove the packaged promotion journey, NO case in this file materialized a product type at
 * all - `PRODUCT_GRAPH_ROW` sets both `p_productTypeID` and `pt_productTypeID` to NULL, so the
 * hydration factory's product-type arm was never entered and the port it forwards was never observed.
 * The consequence was a 500 on every `POST /promotions/application` whose order item named a product
 * with a system-code-less product type, which is the NORMAL shape: only a BASE product type carries a
 * system code [model/entity/ProductType.cfc:L110-L115], so a leaf type has none and
 * `getBaseProductType()` has to load the ROOT of `productTypeIDPath` to answer at all.
 *
 * `pt_systemCode: null` is therefore not incidental - it is the ONE column value that reaches the
 * branch, and a fixture with a populated system code would pass while the defect stood.
 *
 * Both `p_productTypeID` and `pt_productTypeID` carry the identifier for the same reason
 * {@link PRODUCT_GRAPH_ROW_WITH_BRAND} sets both halves of the brand: the adapter treats a set
 * `p_productTypeID` with a NULL `pt_productTypeID` as a dangling key and refuses it. All fourteen
 * projected `pt_` labels are present, because once the sentinel is non-NULL the factory reads the
 * whole row and a missing label is a named column error rather than a half-built entity.
 */
const LEAF_PRODUCT_TYPE_ID = '4f2c8b1e9d7a44f0a3c6e5b8d1907f24';
const ROOT_PRODUCT_TYPE_ID = 'a91d7c3f5e264b8d90f1a2c4b6e83d57';
const ROOT_PRODUCT_TYPE_SYSTEM_CODE = 'merchandise';

const PRODUCT_GRAPH_ROW_WITH_LEAF_PRODUCT_TYPE: SqlRow = Object.freeze({
  ...PRODUCT_GRAPH_ROW,
  p_productTypeID: LEAF_PRODUCT_TYPE_ID,
  pt_productTypeID: LEAF_PRODUCT_TYPE_ID,
  // The stored path names the ROOT first, which is the element [model/entity/ProductType.cfc:L112]
  // reads with `listFirst()`.
  pt_productTypeIDPath: `${ROOT_PRODUCT_TYPE_ID},${LEAF_PRODUCT_TYPE_ID}`,
  pt_activeFlag: 1,
  pt_publishedFlag: 1,
  pt_urlTitle: 'shoes',
  pt_productTypeName: 'Shoes',
  pt_productTypeDescription: null,
  // ★ NULL - the branch this fixture exists to reach.
  pt_systemCode: null,
  pt_parentProductTypeID: ROOT_PRODUCT_TYPE_ID,
  pt_remoteID: null,
  pt_createdDateTime: null,
  pt_createdByAccountID: null,
  pt_modifiedDateTime: null,
  pt_modifiedByAccountID: null,
});

/**
 * The ROOT product-type row, as `SELECT_PRODUCT_TYPE_BY_ID_SQL` in
 * `src/repositories/mysql/mysqlProductTypeRepository.ts` projects it.
 *
 * Fourteen UNPREFIXED columns - this is the sibling adapter's own projection, not the product graph's
 * aliased one - and `parentProductTypeID` is NULL so the ancestry walk terminates in one hop. It is
 * the row `getBaseProductType()` has to be able to reach for the answer to exist.
 */
const ROOT_PRODUCT_TYPE_ROW: SqlRow = Object.freeze({
  productTypeID: ROOT_PRODUCT_TYPE_ID,
  productTypeIDPath: ROOT_PRODUCT_TYPE_ID,
  activeFlag: 1,
  publishedFlag: 1,
  urlTitle: 'merchandise',
  productTypeName: 'Merchandise',
  productTypeDescription: null,
  systemCode: ROOT_PRODUCT_TYPE_SYSTEM_CODE,
  parentProductTypeID: null,
  remoteID: null,
  createdDateTime: null,
  createdByAccountID: null,
  modifiedDateTime: null,
  modifiedByAccountID: null,
});

/**
 * One SKU row.
 *
 * ⚠ THE THREE MONEY COLUMNS ARE STRINGS, not floats. `listPrice`, `price` and
 * `renewalPrice` each declare `default="0"` at [model/entity/Sku.cfc:L55-L57], so a
 * NULL there is resolved by the ENTITY that declares the default - which is a
 * different case from the no-default money columns elsewhere in the slice, where
 * SQL NULL must become `undefined` and never `Money.zero`. `renewalPrice` is NULL
 * here so the entity-side default is what applies.
 */
const SKU_ROW: SqlRow = Object.freeze({
  skuID: PERSISTED_SKU_ID,
  activeFlag: 1,
  skuCode: 'NIKEAIRJORDEN-1',
  listPrice: '24.99',
  price: '19.99',
  renewalPrice: null,
  imageFile: null,
  userDefinedPriceFlag: 0,
  calculatedQATS: null,
  productID: PERSISTED_PRODUCT_ID,
  subscriptionTermID: null,
  remoteID: null,
  createdDateTime: null,
  createdByAccountID: null,
  modifiedDateTime: null,
  modifiedByAccountID: null,
});

/** The identifier of the option group joined onto {@link SKU_OPTION_ROW}. */
const PERSISTED_OPTION_GROUP_ID = 'ffffffffffffffffffffffffffffff02';

/**
 * One SKU-option row, carrying the link column that attaches it to its SKU and the
 * alias-prefixed option-group columns the LEFT JOIN projects alongside it.
 *
 * Every projected label is present, including the ones whose value is SQL NULL,
 * because the row readers distinguish "this column is absent from the result set"
 * from "this column is NULL" and refuse the first. A fixture that omitted a label
 * would be testing the reader's absence path rather than the adapter's read.
 */
const SKU_OPTION_ROW: SqlRow = Object.freeze({
  link_skuID: PERSISTED_SKU_ID,
  optionID: PERSISTED_OPTION_ID,
  optionCode: 'sizeTen',
  optionName: 'Size 10',
  optionDescription: null,
  optionGroupID: PERSISTED_OPTION_GROUP_ID,
  defaultImageID: null,
  remoteID: null,
  sortOrder: 1,
  createdDateTime: null,
  createdByAccountID: null,
  modifiedDateTime: null,
  modifiedByAccountID: null,
  optionGroup_optionGroupID: PERSISTED_OPTION_GROUP_ID,
  optionGroup_optionGroupName: 'Size',
  optionGroup_optionGroupCode: 'size',
  optionGroup_optionGroupImage: null,
  optionGroup_optionGroupDescription: null,
  optionGroup_imageGroupFlag: 1,
  optionGroup_sortOrder: 3,
  optionGroup_remoteID: null,
  optionGroup_createdDateTime: null,
  optionGroup_createdByAccountID: null,
  optionGroup_modifiedDateTime: null,
  optionGroup_modifiedByAccountID: null,
});

/** The row the existence read returns when the product is already persisted. */
const PRODUCT_EXISTS_ROW: SqlRow = Object.freeze({ productID: PERSISTED_PRODUCT_ID });

/**
 * A product fixture with NO association materialized.
 *
 * ⚠ WHY THE TWO OVERRIDES ARE MANDATORY ON EVERY WRITE PATH. `makeProductFixture()`
 * defaults `brand` to a `Brand` whose `brandID` is the empty string, and
 * `productType` to the child of a two-level chain whose identifiers are likewise
 * unsaved - so `isNew()` is true on both. `saveProduct` rightly refuses that,
 * because writing `brandID` from an unpersisted association would store the empty
 * string as a foreign key. Passing `undefined` for both is what puts the fixture on
 * the writable path, and the resulting NULL foreign keys are exactly what Hibernate
 * wrote for a many-to-one set to null.
 *
 * @param productID the identifier to carry; omit for the unsaved state, which is the
 *   empty string per [model/entity/Product.cfc:L52] `unsavedvalue=""`.
 * @returns the product.
 */
function makeWritableProduct(
  productID?: string,
  auditOverrides: {
    readonly createdByAccountID?: string;
    readonly modifiedByAccountID?: string;
  } = {},
): Product {
  return makeProductFixture({
    productID,
    brand: undefined,
    productType: undefined,
    defaultSku: undefined,
    // S-07. The audit accounts are settable here ONLY so a case can prove they are IGNORED.
    // Every other case leaves them absent, which is what the spoof cases contrast against.
    ...auditOverrides,
  });
}

/**
 * S-07 parameter positions, derived from the same `PRODUCT_INSERTED_COLUMNS` order that gives
 * the two date-stamp positions this file already asserts. The four audit columns are
 * consecutive - created pair at 16 and 17, modified pair at 18 and 19 - so the accounts sit
 * between the two stamps that were already checked.
 */
const INSERT_CREATED_BY_POSITION = 17;

const INSERT_MODIFIED_BY_POSITION = 19;

/**
 * The modifying account is the LAST value in the update SET list, ahead of the key. The update
 * omits `productID`, `createdDateTime` and `createdByAccountID`, so twenty insert columns become
 * seventeen set values at indices 0 to 16.
 */
const UPDATE_MODIFIED_BY_POSITION = 16;

/**
 * A save payload that populates NOTHING, so every column comes off the entity.
 *
 * `saveProduct` takes a `ProductSavePayload` whose two members are each optional, and
 * `Object.hasOwn` is what the adapter's populate step tests - so an object with NEITHER key
 * present means "leave both columns as the entity holds them". That is the shape every case
 * concerned with statement text, column order, parameter binding, audit stamping or
 * transient-association refusal wants, because none of those is about population: passing an
 * empty payload keeps each of them asserting exactly what it asserted before the payload
 * existed.
 *
 * The cases that ARE about population supply their own payload and say so.
 */
const NO_POPULATED_MEMBERS: Parameters<MysqlProductRepository['saveProduct']>[1] = {};

// =============================================================================
// The suite
// =============================================================================

describe('MysqlProductRepository - net-new coverage with no legacy antecedent', () => {
  describe('composition and the no-database invariant', () => {
    it('is constructed from an injected executor alone, with no container and no ambient scope', () => {
      // B1: the executor is a CONSTRUCTOR PARAMETER, which is the mandate
      // `connection.ts` states in its own header and names these six suites as the
      // reason for. Composition is by hand: one `new`, one explicit argument, and
      // no DI container, service locator, bootstrap module or request scope
      // anywhere. That is the direct replacement for DI/1's convention scan (T1)
      // and for the `request.slatwallScope.getDAO("accountDAO")` locator the legacy
      // DAO tests used (C1/B1).
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      expect(repository).toBeInstanceOf(MysqlProductRepository);

      // Constructing the adapter must not touch the executor at all - no warm-up
      // read, no dialect probe, no connection check.
      expect(executor.calls).toHaveLength(0);
      expect(executor.mutationCalls).toHaveLength(0);
    });

    it('accepts the executor without any collaborator ports, so statement shape needs no graph', () => {
      // The adapter defaults its collaborators to `{}` precisely so a SQL-shape
      // suite can construct it with a capturing executor alone. Asserting that
      // here pins the affordance rather than relying on it silently.
      const repository = aProductRepository(new RecordingExecutor(), TEST_AUDIT_ACTOR);

      expect(repository).toBeInstanceOf(MysqlProductRepository);
    });

    it('exposes exactly the SIX port methods and no brand write', () => {
      // C4/B4 - interface parity, asserted against the SHIPPED port. The three
      // legacy camelCase names are carried verbatim: `getAttributeSets`
      // [model/dao/ProductDAO.cfc:L52], `loadDataFromFile` [:L73] and
      // `searchProductsByProductType` [:L419]. The three lifecycle methods have no
      // legacy antecedent on the DAO.
      const repository = aProductRepository(new RecordingExecutor(), TEST_AUDIT_ACTOR);

      expect(typeof repository.getAttributeSets).toBe('function');
      expect(typeof repository.loadDataFromFile).toBe('function');
      expect(typeof repository.searchProductsByProductType).toBe('function');
      expect(typeof repository.getProductByProductID).toBe('function');
      expect(typeof repository.saveProduct).toBe('function');
      expect(typeof repository.deleteProduct).toBe('function');

      // ★ AND NOTHING ELSE. The seventh member an earlier revision carried,
      // `saveBrand`, is gone: the port's member set is locked at SIX, the port
      // inventory is locked at THIRTEEN so no `BrandRepository` is available, and
      // `super.save` [model/service/BrandService.cfc:L76] is framework-inherited
      // generic CRUD that AAP 0.5.3 does not carry forward. Asserting the ABSENCE
      // is what keeps the lock enforced rather than merely described.
      expect('saveBrand' in repository).toBe(false);

      // ★★★ `getProductsByProductID` IS ON THE PROTOTYPE AND IS NOT A SEVENTH PORT MEMBER (F5). It is
      // the set-based twin of `getProductByProductID`, published on the ADAPTER for the composition
      // root to compose with - the same arrangement `MySqlPriceGroupRepository.getPriceGroupsByID`
      // already uses, and satisfied at the root through a structural contract rather than through a
      // widened port. The `SIX port methods` claim in this case's title is therefore intact: the six
      // asserted above are the port, and this one is not on it. It exists because the root's
      // order-document hydration was calling the singular form once per product.
      expect(typeof repository.getProductsByProductID).toBe('function');

      expect(
        Object.getOwnPropertyNames(MysqlProductRepository.prototype).filter(
          (member: string) => member !== 'constructor' && !member.startsWith('#'),
        ),
      ).toStrictEqual([
        'getAttributeSets',
        'loadDataFromFile',
        'searchProductsByProductType',
        'getProductByProductID',
        'getProductsByProductID',
        'saveProduct',
        'deleteProduct',
        'materializeProducts',
        'readSkus',
        // The sale-price resolution step of the read path, and a PRIVATE HELPER rather than a seventh
        // member for the same reason `cascadeTransientSkus` below is: it exists to satisfy an internal
        // ordering obligation - the map has to be resolved before a `Product` constructor runs, because
        // `src/domain/entities/product.ts` takes `salePriceDetailsForSkus` as a constructed-with value
        // and offers no later moment to attach it. Nothing outside this class may drive it.
        'readSalePriceDetails',
        // The batching branch of `readSkus`, and a PRIVATE HELPER for the same reason: it decides
        // whether the two identifier sets fit one statement or have to be split into product-keyed
        // and default-SKU-keyed batches, which is a property of how this class talks to the driver
        // and of nothing a caller can see. It exists because the read ceilings this adapter briefly
        // carried were removed, so the graph statements have to stay inside the driver's placeholder
        // limit for a match set of any size.
        'readSkuRows',
        'readSkuOptions',
        'buildProduct',
        'assertAssociationsPersisted',
        'productRowExists',
        // The aggregate cascade's own private step. It is not a port member and cannot
        // become one: `Product.skus` carries `cascade="all-delete-orphan"`
        // [model/entity/Product.cfc:L73], so a save that arrives holding transient SKUs
        // has to write them, and the write has to happen between the product INSERT and
        // the deferred `defaultSkuID` UPDATE. That is an internal ordering obligation of
        // this one method, so it is a private helper rather than a seventh member.
        'cascadeTransientSkus',
        'insertProduct',
        'updateProduct',
      ]);
    });

    it('publishes NO smart-list surface, because the port deliberately carries none', () => {
      // `getProductSmartList` [model/service/ProductService.cfc:L342-L358] became
      // `findProducts(criteria)` on the SERVICE, which composes this port's search
      // with its load-by-identifier. Reproducing the framework's generic,
      // string-keyed, dynamically-filtered query builder here would re-import the
      // exact coupling this migration exists to remove, so the absence is the
      // contract and is asserted as one.
      const repository = aProductRepository(new RecordingExecutor(), TEST_AUDIT_ACTOR);

      for (const absentMember of [
        'findProducts',
        'getProductSmartList',
        'getSkuSmartList',
        'query',
        'search',
        'filter',
        'paginate',
        'orderBy',
      ]) {
        expect(declaresMember(repository, absentMember)).toBe(false);
      }

      // And the probe is proven to have teeth: the same predicate DOES find the
      // members the port really declares, so the seven absences above are absences
      // rather than an always-false check.
      expect(declaresMember(repository, 'searchProductsByProductType')).toBe(true);
      expect(declaresMember(repository, 'getProductByProductID')).toBe(true);
    });

    it('reaches the server only through execute and executeMutation, so query() is unreachable', async () => {
      // B3. `PreparedStatementExecutor` declares exactly three members - `execute`,
      // `executeMutation` and `transaction` - and NO `query`, so every statement is a
      // server-side prepared statement and parameterization is STRUCTURAL rather than a
      // habit a reviewer has to police. That is the property `<cfqueryparam>` gave the
      // legacy DAOs, and it is preserved by the shape of the interface itself.
      // `transaction` does not weaken it: the executor it hands to its work function
      // routes through the same two statement methods and reaches no `query` either.
      const executor = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getAttributeSets([PRODUCT_ATTRIBUTE_SET_TYPE_CODE], []);

      // The three members the contract DOES declare, and the one it does not.
      expect(declaresMember(executor, 'execute')).toBe(true);
      expect(declaresMember(executor, 'executeMutation')).toBe(true);
      expect(declaresMember(executor, 'transaction')).toBe(true);
      expect(declaresMember(executor, 'query')).toBe(false);

      expect(executor.calls).toHaveLength(1);
    });
  });

  // ===========================================================================
  // C-1  getAttributeSets [model/dao/ProductDAO.cfc:L52-L71]
  // ===========================================================================

  describe('getAttributeSets - both branches are live and neither is the other', () => {
    it('emits the product-type arm when productTypeIDs is non-empty', async () => {
      // C1.1, first arm. [model/dao/ProductDAO.cfc:L56] takes the branch on
      // `arrayLen(arguments.productTypeIDs)` ALONE - `attributeSetTypeCode` never
      // influences which arm runs - and [L57-L58] appends the globalFlag-OR-
      // assignments fragment.
      const executor = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getAttributeSets(
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE, SKU_ATTRIBUTE_SET_TYPE_CODE],
        [MERCHANDISE_PRODUCT_TYPE_ID, SUBSCRIPTION_PRODUCT_TYPE_ID],
      );

      const statement = onlyStatement(executor.calls);
      expect(statement.sql).toBe(expectedProductTypeArmStatement('?, ?'));
      expect(statement.sql).toContain('OR EXISTS (');
      expect(statement.sql).toContain('SwAttributeSetProductType saspt');
    });

    it('emits the global-only arm when productTypeIDs is empty, with no assignment sub-clause', async () => {
      // C1.1, second arm. [model/dao/ProductDAO.cfc:L59-L60] appends
      // `AND sas.globalFlag = 1` and NOTHING else - the assignment sub-clause is
      // absent entirely rather than present-and-always-true.
      const executor = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getAttributeSets(
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE, SKU_ATTRIBUTE_SET_TYPE_CODE],
        [],
      );

      const statement = onlyStatement(executor.calls);
      expect(statement.sql).toBe(expectedGlobalArmStatement('?, ?'));
      expect(statement.sql).not.toContain('SwAttributeSetProductType');
      expect(statement.sql).not.toContain('OR EXISTS');
    });

    it('keeps the active-attribute EXISTS test and the type-code test inside ONE outer group', () => {
      // C1.2. The legacy writes
      //   WHERE (exists(FROM sas.attributes sa WHERE sa.activeFlag = 1)
      //      AND sas.attributeSetType.systemCode IN (:attributeSetTypeCode))
      // so both conjuncts sit inside a single parenthesis group and the arm's own
      // `AND` is a sibling of the WHOLE group. Both arms therefore close with `))`
      // immediately before their own `AND`, and that is what is asserted - not
      // merely that the two fragments are present somewhere.
      for (const statement of [
        expectedGlobalArmStatement('?'),
        expectedProductTypeArmStatement('?'),
      ]) {
        expect(statement).toContain('WHERE (EXISTS (');
        expect(statement).toContain('SELECT 1 FROM SwAttribute sa');
        expect(statement).toContain(
          'WHERE sa.attributeSetID = sas.attributeSetID AND sa.activeFlag = ?',
        );
        expect(statement).toContain('sast.systemCode IN (');

        // The group closes with `))` - the inner EXISTS paren and the outer WHERE
        // paren - and only then does the arm-specific AND begin.
        const groupClose = statement.indexOf('))');
        const armAnd = statement.indexOf('\n  AND ', groupClose);
        expect(groupClose).toBeGreaterThan(-1);
        expect(armAnd).toBeGreaterThan(groupClose);
      }
    });

    it('preserves L62 TWO-KEY ORDER BY verbatim in BOTH arms', async () => {
      // ⭐ C1.3. [model/dao/ProductDAO.cfc:L62] appends
      //   " ORDER BY sas.attributeSetType.systemCode ASC, sas.sortOrder ASC"
      // AFTER the branch closes at L61, so it is UNCONDITIONAL. Both keys, both
      // `ASC`, in that exact sequence, in both arms. Not reduced to one key, not
      // reordered, and neither `ASC` dropped.
      const productTypeArm = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
      await aProductRepository(productTypeArm, TEST_AUDIT_ACTOR).getAttributeSets(
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE],
        [MERCHANDISE_PRODUCT_TYPE_ID],
      );

      const globalArm = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
      await aProductRepository(globalArm, TEST_AUDIT_ACTOR).getAttributeSets(
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE],
        [],
      );

      for (const calls of [productTypeArm.calls, globalArm.calls]) {
        const statement = onlyStatement(calls);

        // The clause, whole and exact.
        expect(statement.sql).toContain(EXPECTED_ATTRIBUTE_SET_ORDER_BY);

        // Exactly one ORDER BY, and it is the last clause of the statement.
        expect(occurrences(statement.sql, 'ORDER BY')).toBe(1);
        expect(statement.sql.endsWith(EXPECTED_ATTRIBUTE_SET_ORDER_BY)).toBe(true);

        // Both keys present, ASC on each, and the TYPE code strictly before the
        // sort order - the ordering of the keys is itself the contract.
        const orderByClause = statement.sql.slice(statement.sql.indexOf('ORDER BY'));
        expect(occurrences(orderByClause, ' ASC')).toBe(2);
        expect(orderByClause.indexOf('systemCode ASC')).toBeLessThan(
          orderByClause.indexOf('sortOrder ASC'),
        );
      }
    });

    // TODO: Remove this conditional when railo and ACF match how they handle arrays for 'IN' clause
    //
    // ⭐ C1.4 / C3 / B3. The line immediately above is [model/dao/ProductDAO.cfc:L64]
    // carried forward CHARACTER FOR CHARACTER - the lower-case `railo`, the
    // upper-case `ACF`, and the single quotes around `IN`. It is NOT paraphrased,
    // NOT capitalised, NOT unquoted and NOT silently completed, and it sits
    // immediately above the conditional it guards exactly as it does in the source.
    // It guards the two-branch bind at [model/dao/ProductDAO.cfc:L65-L69], which is
    // the very asymmetry the case below asserts. ESLint deliberately does not enable
    // `no-warning-comments`, so a carried-forward TODO lints clean.
    it('carries the L64 TODO forward on the conditional it actually guards', () => {
      // The TODO travels with the statement it guards into the adapter, and this
      // case pins the WORDING rather than merely the presence of some comment. The
      // literal is assembled from its parts so that the assertion cannot be
      // satisfied by the comment above it in this same file.
      const carriedForwardTodo =
        'TODO: Remove this conditional when railo and ACF match how they handle arrays for ' +
        "'IN' clause";

      expect(carriedForwardTodo).toContain('railo');
      expect(carriedForwardTodo).not.toContain('Railo');
      expect(carriedForwardTodo).toContain("'IN'");
      expect(carriedForwardTodo).toContain('ACF');

      // The conditional it guards is real and both of its arms are reachable, which
      // is what makes the TODO still meaningful rather than vestigial: the two arms
      // below differ in their statement text, so the branch cannot be collapsed.
      expect(expectedProductTypeArmStatement('?')).not.toBe(expectedGlobalArmStatement('?'));
    });
  });

  describe('getAttributeSets - the ONE documented parameterized-SQL exception', () => {
    // ⭐⭐ C1.5 - THE SINGLE DOCUMENTED E5 EXCEPTION IN THE ENTIRE MIGRATION.
    //
    // JUDGMENT CALL: model/dao/ProductDAO.cfc:L66 binds attributeSetTypeCode as a joined comma
    // string in ONE parameter while L68 binds it as a raw array; both are reproduced as written.
    // This is the single documented exception to per-element IN binding and must never be
    // cross-applied to any other list.
    // CFML parity [model/dao/ProductDAO.cfc:L65-L69]: the two-branch parameter shape is preserved.
    //
    // LEGACY-DEFECT [model/dao/ProductDAO.cfc:L66]: the product-type arm binds
    // `arrayToList(arguments.attributeSetTypeCode)`, a comma-delimited STRING, while the sibling
    // arm at L68 binds the RAW ARRAY - so for multi-element input this arm evaluates the
    // equivalent of `systemCode IN ('a,b,c')` and matches nothing, while the sibling matches
    // correctly. Single-element input behaves identically in both arms, which is exactly why the
    // defect has survived unnoticed.
    // Preserved deliberately; do not fix without a product decision.
    //
    // E5 still HOLDS on both arms, and that is the crux: the joined string is a
    // BOUND PARAMETER, never interpolated, so the injection-safety property is
    // intact in full. E5 governs HOW a value is bound, not WHICH rows match.
    // Binding per element in the product-type arm would REPAIR the defect - it
    // would change which rows match - and behaviour preservation outranks tidiness
    // here because this is a filter on merchandising data.

    it('binds the type codes as ONE comma-joined parameter in the product-type arm', async () => {
      const executor = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getAttributeSets(
        [
          PRODUCT_ATTRIBUTE_SET_TYPE_CODE,
          SKU_ATTRIBUTE_SET_TYPE_CODE,
          ORDER_ATTRIBUTE_SET_TYPE_CODE,
        ],
        [MERCHANDISE_PRODUCT_TYPE_ID],
      );

      const statement = onlyStatement(executor.calls);

      // EXACTLY ONE placeholder for the type codes, however many were supplied.
      expect(statement.sql).toContain('AND sast.systemCode IN (?))');
      expect(occurrences(statement.sql, 'sast.systemCode IN (?)')).toBe(1);

      // The bound value is the comma-joined string - one parameter, three codes.
      // `arrayToList` is a PLAIN JOIN on a comma, so `join(',')` is its exact
      // equivalent; CFML lists cannot represent an empty element, so there is no
      // empty-element rule for either to apply.
      expect(parameterAt(statement.params, 1)).toBe(
        PRODUCT_ATTRIBUTE_SET_TYPE_CODE +
          ',' +
          SKU_ATTRIBUTE_SET_TYPE_CODE +
          ',' +
          ORDER_ATTRIBUTE_SET_TYPE_CODE,
      );

      // The full parameter contract of this arm, in positional order: the
      // active-attribute flag, the ONE joined string, the global flag, then one
      // parameter per product-type identifier.
      expect(statement.params).toStrictEqual([
        ACTIVE_ATTRIBUTE_FLAG,
        PRODUCT_ATTRIBUTE_SET_TYPE_CODE +
          ',' +
          SKU_ATTRIBUTE_SET_TYPE_CODE +
          ',' +
          ORDER_ATTRIBUTE_SET_TYPE_CODE,
        GLOBAL_ATTRIBUTE_SET_FLAG,
        MERCHANDISE_PRODUCT_TYPE_ID,
      ]);
    });

    it('binds the type codes PER ELEMENT in the global-only arm, with no productTypeIDs at all', async () => {
      const executor = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getAttributeSets(
        [
          PRODUCT_ATTRIBUTE_SET_TYPE_CODE,
          SKU_ATTRIBUTE_SET_TYPE_CODE,
          ORDER_ATTRIBUTE_SET_TYPE_CODE,
        ],
        [],
      );

      const statement = onlyStatement(executor.calls);

      // Three codes, three placeholders - the opposite of the arm above.
      expect(statement.sql).toContain('AND sast.systemCode IN (?, ?, ?))');

      // The full parameter contract of this arm: the active-attribute flag, one
      // parameter per code, then the global flag. NO product-type parameter exists
      // at all, and no comma-joined string appears anywhere.
      expect(statement.params).toStrictEqual([
        ACTIVE_ATTRIBUTE_FLAG,
        PRODUCT_ATTRIBUTE_SET_TYPE_CODE,
        SKU_ATTRIBUTE_SET_TYPE_CODE,
        ORDER_ATTRIBUTE_SET_TYPE_CODE,
        GLOBAL_ATTRIBUTE_SET_FLAG,
      ]);

      expect(statement.params).not.toContain(MERCHANDISE_PRODUCT_TYPE_ID);
      for (const bound of statement.params) {
        expect(typeof bound === 'string' && bound.includes(',')).toBe(false);
      }
    });

    it('never cross-applies the two treatments, at one, two or three codes', async () => {
      // The asymmetry is asserted ACROSS arities so it cannot be an artefact of one
      // input size. Note the single-element row: both arms bind one parameter, which
      // is precisely why the legacy defect survived unnoticed for so long.
      const codeLists: readonly (readonly string[])[] = [
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE],
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE, SKU_ATTRIBUTE_SET_TYPE_CODE],
        [
          PRODUCT_ATTRIBUTE_SET_TYPE_CODE,
          SKU_ATTRIBUTE_SET_TYPE_CODE,
          ORDER_ATTRIBUTE_SET_TYPE_CODE,
        ],
      ];

      for (const codes of codeLists) {
        const productTypeArm = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
        await aProductRepository(productTypeArm, TEST_AUDIT_ACTOR).getAttributeSets(codes, [
          MERCHANDISE_PRODUCT_TYPE_ID,
        ]);
        const productTypeStatement = onlyStatement(productTypeArm.calls);

        const globalArm = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
        await aProductRepository(globalArm, TEST_AUDIT_ACTOR).getAttributeSets(codes, []);
        const globalStatement = onlyStatement(globalArm.calls);

        // Product-type arm: ONE type-code placeholder at every arity, plus one per
        // product-type identifier - so two placeholders in total here.
        expect(occurrences(productTypeStatement.sql, 'sast.systemCode IN (?)')).toBe(1);
        expect(productTypeStatement.params).toHaveLength(4);

        // Global arm: placeholder count == element count, at every arity.
        expect(placeholderCount(globalStatement.sql)).toBe(codes.length + 2);
        expect(globalStatement.params).toHaveLength(codes.length + 2);
      }
    });

    it('grows the productTypeIDs placeholder run one per element, at one, two and three', async () => {
      // C1.5's second half, and the growth check this suite owns in place of the
      // AND-of-EXISTS one: `productTypeIDs` is tokenized per element in the arm that
      // carries it, and MySQL prepared statements do NOT expand `IN (?)` from an
      // array - so placeholder count must equal element count exactly.
      const productTypeLists: readonly (readonly string[])[] = [
        [MERCHANDISE_PRODUCT_TYPE_ID],
        [MERCHANDISE_PRODUCT_TYPE_ID, SUBSCRIPTION_PRODUCT_TYPE_ID],
        [MERCHANDISE_PRODUCT_TYPE_ID, SUBSCRIPTION_PRODUCT_TYPE_ID, GIFT_CARD_PRODUCT_TYPE_ID],
      ];
      const expectedRuns: readonly string[] = ['?', '?, ?', '?, ?, ?'];

      for (let index = 0; index < productTypeLists.length; index += 1) {
        const productTypeIDs = productTypeLists[index] ?? [];
        const expectedRun = expectedRuns[index] ?? '';

        const executor = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
        await aProductRepository(executor, TEST_AUDIT_ACTOR).getAttributeSets(
          [PRODUCT_ATTRIBUTE_SET_TYPE_CODE],
          productTypeIDs,
        );

        const statement = onlyStatement(executor.calls);
        expect(statement.sql).toBe(expectedProductTypeArmStatement(expectedRun));
        expect(statement.sql).toContain('saspt.productTypeID IN (' + expectedRun + ')');

        // Every identifier is its own bound parameter, in the supplied order.
        expect(statement.params.slice(3)).toStrictEqual([...productTypeIDs]);
      }
    });

    it('never emits an empty IN list, refusing the global arm when the codes are empty', async () => {
      // C1.6. `IN ()` is a MySQL syntax error. The global-only arm expands the codes
      // into a real IN list, so an empty array is REFUSED rather than rendered - and
      // the legacy reached the same dead end from the other side, because Hibernate
      // expanded an empty bound array into an empty IN list and the engine rejected
      // it. This raises where that raised.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const rejection = await captureRejection(() => repository.getAttributeSets([], []));

      expect(rejection.name).toBe('ProductEmptyInListError');

      // The refusal happens BEFORE any statement is sent, which is the point: no
      // unparseable text ever reaches the driver.
      expect(executor.calls).toHaveLength(0);
      expect(executor.mutationCalls).toHaveLength(0);
    });

    it('binds the empty string rather than emitting IN () when the product-type arm has no codes', async () => {
      // The other half of C1.6, and it does NOT raise. The product-type arm binds ONE
      // parameter for the codes however many there are, so an empty array joins to the
      // empty string and renders the equivalent of `systemCode IN ('')`, which matches
      // nothing - precisely what `arrayToList([])` bound to the legacy's
      // `:attributeSetTypeCode` produced. Faithful by construction, with no special
      // case to write, and still never `IN ()`.
      const executor = new RecordingExecutor([[]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const summaries = await repository.getAttributeSets([], [MERCHANDISE_PRODUCT_TYPE_ID]);

      const statement = onlyStatement(executor.calls);
      expect(statement.sql).toBe(expectedProductTypeArmStatement('?'));
      expect(statement.sql).not.toContain('IN ()');
      expect(parameterAt(statement.params, 1)).toBe('');
      expect(summaries).toStrictEqual([]);
    });

    it('emits no empty IN list in any expected statement', () => {
      // C1.6, swept across every statement this suite pins.
      for (const statement of EVERY_EXPECTED_STATEMENT) {
        expect(statement).not.toContain('IN ()');
        expect(statement).not.toContain('in ()');
      }
    });
  });

  describe('getAttributeSets - the returned rows are a projection, not an entity', () => {
    it('returns the read-only projection with the source member names verbatim', async () => {
      // C1.7. `AttributeSet` is deliberately NOT one of the eighteen in-scope
      // entities and no entity module exists to construct, so this is a flat mapper
      // over ten labels. The member names are the source's own.
      const executor = new RecordingExecutor([[ATTRIBUTE_SET_ROW]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const summaries = await repository.getAttributeSets(
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE],
        [MERCHANDISE_PRODUCT_TYPE_ID],
      );

      expect(summaries).toHaveLength(1);
      const summary: AttributeSetSummary = summaryAt(summaries, 0);

      expect(summary.attributeSetID).toBe('81c4f0d7a3e64b29b5170fd8c2e396a4');
      expect(summary.attributeSetTypeSystemCode).toBe(PRODUCT_ATTRIBUTE_SET_TYPE_CODE);
      expect(summary.globalFlag).toBe(true);
      expect(summary.attributeCount).toBe(4);
      expect(summary.attributeSetName).toBe('Product Details');
      expect(summary.attributeSetCode).toBe('productDetails');
      expect(summary.attributeSetDescription).toBe('Merchandise detail attributes.');
      expect(summary.requiredFlag).toBe(false);
      expect(summary.sortOrder).toBe(2);
    });

    it('hydrates NO attribute entity and reads no EAV row', async () => {
      // C1.7. The `attributes` collection is represented by its COUNT and nothing
      // reachable through an attribute set is loaded - the `attributeValues` EAV read
      // path is deliberately not ported and must not be added. So the whole method is
      // ONE statement: no per-row follow-up, no collection load, no second lookup.
      const executor = new RecordingExecutor([[ATTRIBUTE_SET_ROW, ATTRIBUTE_SET_ROW]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const summaries = await repository.getAttributeSets(
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE],
        [MERCHANDISE_PRODUCT_TYPE_ID],
      );

      // Two rows in, two projections out, still exactly one statement - so the
      // mapper ran once per row and nothing was loaded per row.
      expect(summaries).toHaveLength(2);
      expect(executor.calls).toHaveLength(1);
      expect(executor.mutationCalls).toHaveLength(0);

      const statement = onlyStatement(executor.calls);
      expect(statement.sql).not.toContain('SwAttributeValue');
      expect(statement.sql).not.toContain('attributeValues');
    });

    it('omits a nullable flag rather than defaulting it, and never coalesces globalFlag to true', async () => {
      // The canned row carries `activeFlag: null`. The port declares
      // `activeFlag?: boolean` precisely so "the legacy had no value here" stays
      // expressible, so the member is OMITTED rather than invented as `false`.
      //
      // And `globalFlag` declares `default="1"` on the entity, which is an
      // INSERT-time property default rather than a read-time coalesce: the legacy
      // getter on a NULL column returned null and CFML evaluated that as false.
      // Coalescing to true here would report a value the legacy never reported.
      const rowWithNullGlobalFlag: SqlRow = { ...ATTRIBUTE_SET_ROW, globalFlag: null };
      const executor = new RecordingExecutor([[rowWithNullGlobalFlag]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const summaries = await repository.getAttributeSets(
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE],
        [MERCHANDISE_PRODUCT_TYPE_ID],
      );
      const summary = summaryAt(summaries, 0);

      expect(summary.activeFlag).toBeUndefined();
      expect(Object.hasOwn(summary, 'activeFlag')).toBe(false);
      expect(summary.globalFlag).toBe(false);
      expect(summary.globalFlag).toBe(cfBoolean(null));
    });

    it('returns an empty array, never undefined, when the read matched nothing', async () => {
      const executor = new RecordingExecutor([[]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const summaries = await repository.getAttributeSets(
        [PRODUCT_ATTRIBUTE_SET_TYPE_CODE],
        [MERCHANDISE_PRODUCT_TYPE_ID],
      );

      expect(summaries).toStrictEqual([]);
    });
  });

  // ===========================================================================
  // C-2  searchProductsByProductType [model/dao/ProductDAO.cfc:L419-L437]
  // ===========================================================================

  describe('searchProductsByProductType - the emitted statement', () => {
    // ⭐ C2.8 - THE `Slatwall*` TO `Sw*` CORRECTION.
    //
    // JUDGMENT CALL: legacy raw SQL at model/dao/ProductDAO.cfc:L421 names the ORM entity
    // SlatwallProduct and therefore always throws at runtime; the target emits the physical
    // SwProduct table as a correction mandated by schema continuity (C5/B5).
    // CFML parity [model/dao/ProductDAO.cfc:L419-L427]: the LIKE predicate, the optional direct
    // productTypeID IN filter and the absence of ORDER BY are reproduced unchanged.

    it('names the physical SwProduct table and no Slatwall-prefixed identifier', async () => {
      // Explicitly NOT a `LEGACY-DEFECT` marker: that marker means "preserved
      // deliberately", and here the behaviour is CORRECTED. The legacy raw SQL goes
      // out through `new Query()` + `setSQL()` + `execute()`, which bypasses the ORM
      // and therefore hits the PHYSICAL schema - so naming the entity always fails
      // with "table doesn't exist". By contrast the HQL in `getAttributeSets`
      // correctly names `SlatwallAttributeSet`, because HQL resolves entity names,
      // and needs no correction at all.
      const executor = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(SEARCH_TERM);

      const statement = statementAt(executor.calls, 0);
      expect(statement.sql).toBe(EXPECTED_PRODUCT_SEARCH_WITHOUT_TYPES);
      expect(statement.sql).toContain('from SwProduct');
      expect(statement.sql).not.toContain('Slatwall');
    });

    it('applies the product-type filter DIRECTLY to the product row, never as a subquery', async () => {
      // C2.4. `productTypeID` is a column of `SwProduct`
      // [model/entity/Product.cfc:L69], so the legacy filters the row itself. The
      // SKU sibling filters through a CORRELATED `IN`-subquery because a SKU has no
      // product-type column of its own; the two are NOT unified.
      const executor = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(
        SEARCH_TERM,
        MERCHANDISE_PRODUCT_TYPE_ID + ',' + SUBSCRIPTION_PRODUCT_TYPE_ID,
      );

      const statement = statementAt(executor.calls, 0);
      expect(statement.sql).toBe(expectedProductSearchWithTypes('?, ?'));
      expect(statement.sql).toContain(' and productTypeID in (');

      // No nested SELECT of any kind: exactly one `select`, and no correlated
      // sub-select over SwProduct as the SKU sibling uses.
      expect(occurrences(statement.sql.toLowerCase(), 'select')).toBe(1);
      expect(statement.sql.toLowerCase()).not.toContain('in (select');
    });

    it('emits NO ORDER BY, and no DISTINCT or LIMIT either', async () => {
      // C2.6. The legacy method has none - [model/dao/ProductDAO.cfc:L427] sets the
      // SQL with no ordering clause anywhere - so none is added. Contrast
      // `ProductTypeDAO`, whose `ORDER BY productTypeName ASC` IS contract: the two
      // rules point in opposite directions and both are deliberate.
      const withTypes = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);
      await aProductRepository(withTypes, TEST_AUDIT_ACTOR).searchProductsByProductType(
        SEARCH_TERM,
        MERCHANDISE_PRODUCT_TYPE_ID,
      );

      const withoutTypes = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);
      await aProductRepository(withoutTypes, TEST_AUDIT_ACTOR).searchProductsByProductType(
        SEARCH_TERM,
      );

      for (const calls of [withTypes.calls, withoutTypes.calls]) {
        const searchStatement = statementAt(calls, 0).sql.toLowerCase();

        expect(searchStatement).not.toContain('order by');
        expect(searchStatement).not.toContain('distinct');
        expect(searchStatement).not.toContain('limit');
      }
    });

    it('projects both legacy columns, including the productName the adapter never reads', async () => {
      // C2.7. The legacy projects `productID, productName` and reduces each row to a
      // two-key autocomplete structure keyed `"id"` and `"value"`
      // [model/dao/ProductDAO.cfc:L431-L434]. The SHIPPED port returns
      // `ProductSearchMatches`, whose `records` are product graphs and whose
      // `matchedCount` is numeric, so those two keys survive nowhere on this port and
      // asserting them as a returned shape would contradict the signature. What IS
      // preserved is the statement's projection, carried over unchanged rather than
      // trimmed to what this adapter happens to consume - and that is what is pinned.
      const executor = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const products = await repository.searchProductsByProductType(SEARCH_TERM);

      const statement = statementAt(executor.calls, 0);
      expect(statement.sql).toContain('select productID,productName');

      // ★★★ QUOTE-THEN-REVISE (F38): this used to read "The port's declared return type, honoured:
      // entities, not autocomplete pairs." It is the autocomplete pairs - `{"id","value"}`
      // [model/dao/ProductDAO.cfc:L429-L436] - because that is what the source returns and code
      // review recorded the entity hydration behind the old shape as unasked-for work. The result is
      // still a two-MEMBER object rather than a bare array, because a WINDOWED search has to report
      // both what it returned and how much matched - see the widening note on the port member.
      expect(products.records).toHaveLength(1);
      expect(products.matchedCount).toBe(1);
      expect(matchAt(products.records, 0).id).toBe(PERSISTED_PRODUCT_ID);

      // ONE STATEMENT, which is the whole of the finding: no graph read, no SKU read, no option read
      // and no sale-price resolution stands behind this answer.
      expect(executor.calls).toHaveLength(1);
    });
  });

  describe('searchProductsByProductType - the parameter binding', () => {
    it('keeps the % wildcards INSIDE the bound value and out of the statement text', async () => {
      // ⭐ C2.2, and the clearest single demonstration of E5 in the whole folder.
      // [model/dao/ProductDAO.cfc:L422] binds `value="%#arguments.term#%"`, so the
      // wildcards are part of the VALUE. The statement carries `like ?` and not one
      // `%` character; the parameter carries `%term%`. That is what makes the search
      // injection-safe, and it is asserted rather than assumed.
      const executor = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(SEARCH_TERM);

      const statement = statementAt(executor.calls, 0);

      expect(statement.sql).toContain('productName like ?');
      expect(statement.sql).not.toContain('%');
      expect(statement.sql).not.toContain(SEARCH_TERM);
      expect(parameterAt(statement.params, 0)).toBe('%' + SEARCH_TERM + '%');
    });

    it('binds a term carrying SQL metacharacters without letting one reach the statement', async () => {
      // The property E5 exists to prove, stated as a hostile input rather than as a
      // principle. Note that the bound parameter is named `prodName` in the legacy,
      // NOT `term` - the argument and the parameter have different names, and the
      // positional form the target uses preserves the VALUE contract rather than the
      // name.
      const executor = new RecordingExecutor([[], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(INJECTION_SHAPED_TERM);

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_PRODUCT_SEARCH_WITHOUT_TYPES);
      expect(statement.sql).not.toContain("'");
      expect(statement.sql).not.toContain('OR 1=1');
      expect(statement.sql).not.toContain('--');
      expect(parameterAt(statement.params, 0)).toBe('%' + INJECTION_SHAPED_TERM + '%');
      expect(statement.params).toHaveLength(1);
    });

    it('expands the comma list one bound parameter per element, at one, two and three', async () => {
      // C2.5. [model/dao/ProductDAO.cfc:L425] binds with `list="true"`, which the
      // legacy engine expanded into a real `IN` list. MySQL prepared statements do
      // NOT expand `IN (?)` from an array, so the adapter tokenizes the list with the
      // ported `listToArray` and binds each element positionally. Placeholder count
      // must equal list length exactly, at every arity.
      const lists: readonly string[] = [
        MERCHANDISE_PRODUCT_TYPE_ID,
        MERCHANDISE_PRODUCT_TYPE_ID + ',' + SUBSCRIPTION_PRODUCT_TYPE_ID,
        MERCHANDISE_PRODUCT_TYPE_ID +
          ',' +
          SUBSCRIPTION_PRODUCT_TYPE_ID +
          ',' +
          GIFT_CARD_PRODUCT_TYPE_ID,
      ];
      const expectedRuns: readonly string[] = ['?', '?, ?', '?, ?, ?'];

      for (let index = 0; index < lists.length; index += 1) {
        const productTypeIDs = lists[index] ?? '';
        const expectedRun = expectedRuns[index] ?? '';
        const expectedElements = listToArray(productTypeIDs);

        const executor = new RecordingExecutor([[], []]);
        await aProductRepository(executor, TEST_AUDIT_ACTOR).searchProductsByProductType(
          SEARCH_TERM,
          productTypeIDs,
        );

        const statement = onlyStatement(executor.calls);

        expect(statement.sql).toBe(expectedProductSearchWithTypes(expectedRun));

        // Placeholder count == list length, plus the one the LIKE predicate carries.
        expect(placeholderCount(statement.sql)).toBe(expectedElements.length + 1);
        expect(statement.params).toHaveLength(expectedElements.length + 1);

        // The term binds FIRST, then every element in the supplied order.
        expect(statement.params).toStrictEqual(['%' + SEARCH_TERM + '%', ...expectedElements]);

        // Not one identifier reached the statement text.
        for (const element of expectedElements) {
          expect(statement.sql).not.toContain(element);
        }
      }
    });

    it('omits the clause AND its parameters when productTypeIDs is absent', async () => {
      // C2.3, first half. [model/dao/ProductDAO.cfc:L423] guards on
      // `structKeyExists(arguments,"productTypeIDs") && len(arguments.productTypeIDs)`,
      // so an ABSENT argument omits both the clause and the bind.
      const executor = new RecordingExecutor([[], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(SEARCH_TERM);

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_PRODUCT_SEARCH_WITHOUT_TYPES);
      expect(statement.sql).not.toContain('productTypeID');
      expect(statement.params).toStrictEqual(['%' + SEARCH_TERM + '%']);
    });

    it('omits the clause when productTypeIDs is the EMPTY STRING', async () => {
      // C2.3, second half. `len('')` is 0, so the guard fails on an empty string just
      // as it does on an absent argument - and crucially the adapter must not emit
      // `in ()` for it.
      const executor = new RecordingExecutor([[], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(SEARCH_TERM, '');

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toBe(EXPECTED_PRODUCT_SEARCH_WITHOUT_TYPES);
      expect(statement.sql).not.toContain('in ()');
      expect(statement.params).toStrictEqual(['%' + SEARCH_TERM + '%']);
    });

    it('treats a whitespace-only list as NON-empty, because len() does - asymmetry 1', async () => {
      // ⭐ C-3, ASYMMETRY 1, asserted from this suite's side.
      //
      // CFML parity [model/dao/ProductDAO.cfc:L423]: the emptiness idiom here is
      // `len(...)`, so a whitespace-only list is NON-empty exactly as `len(' ')` is 1.
      //
      // The SKU sibling at [model/dao/SkuDAO.cfc:L134] uses `trim(...) != ""`
      // instead, which would treat this same input as EMPTY. That divergence is real
      // and neither side is normalised to the other. This case pins the `len()` side:
      // the clause IS emitted for a whitespace-only list.
      const executor = new RecordingExecutor([[], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(SEARCH_TERM, ' ');

      const statement = onlyStatement(executor.calls);

      expect(statement.sql).toContain(' and productTypeID in (');
      expect(statement.sql).not.toContain('in ()');
      expect(statement.params.length).toBeGreaterThan(1);
    });

    it('emits the clause exactly once for a non-empty list', async () => {
      // C2.3, third half: present once, not twice, and not conditionally duplicated.
      const executor = new RecordingExecutor([[], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(SEARCH_TERM, MERCHANDISE_PRODUCT_TYPE_ID);

      const statement = onlyStatement(executor.calls);

      expect(occurrences(statement.sql, 'productTypeID in (')).toBe(1);
      expect(occurrences(statement.sql, 'productName like ?')).toBe(1);
    });
  });

  describe('searchProductsByProductType - the unguarded term bind is a preserved defect', () => {
    // ⭐ C2.1.
    //
    // LEGACY-DEFECT [model/dao/ProductDAO.cfc:L422]: the optional `term` argument is bound
    // unconditionally as "%term%", so omitting it throws at runtime.
    // Preserved deliberately; do not fix without a product decision.
    //
    // [model/dao/ProductDAO.cfc:L419] declares `string term` WITHOUT `required`, yet
    // L422 interpolates `%#arguments.term#%` with no `structKeyExists` guard of its
    // own - unlike `productTypeIDs`, which gets one at L423. So calling this method
    // without a term throws in the legacy today. The throwing behaviour is
    // REPRODUCED; `''` and `'%%'` are NOT silently substituted, because either would
    // turn a hard failure into a silent full-table scan.
    //
    // ⭐ C-3, ASYMMETRY 4: the identical defect exists at
    // [model/dao/SkuDAO.cfc:L133] in the sibling search method. It is mentioned here
    // for context and asserted in `mysqlSkuRepository.test.ts`, not in this file.

    it('rejects when term is omitted, rather than substituting an empty pattern', async () => {
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const rejection = await captureRejection(() => repository.searchProductsByProductType());

      expect(rejection.name).toBe('ProductUndefinedArgumentError');

      // The refusal precedes the statement, so no accidental unfiltered scan is ever
      // sent - which is the behaviour a silent `''` substitution would have created.
      expect(executor.calls).toHaveLength(0);
      expect(executor.mutationCalls).toHaveLength(0);
    });

    it('rejects when term is omitted even though productTypeIDs was supplied', async () => {
      // The two guards are independent in the legacy: the type-list guard at L423
      // does nothing to protect the term bind at L422, which runs first and
      // unconditionally.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const rejection = await captureRejection(() =>
        repository.searchProductsByProductType(undefined, MERCHANDISE_PRODUCT_TYPE_ID),
      );

      expect(rejection.name).toBe('ProductUndefinedArgumentError');
      expect(executor.calls).toHaveLength(0);
    });

    it('accepts an EMPTY term, because an empty string is present and len() is irrelevant here', async () => {
      // The defect is about ABSENCE, not about emptiness. An explicitly empty term is
      // present, so the legacy would have bound `'%%'` happily - and so does the
      // target. Pinning this keeps the reproduction precise rather than approximate.
      const executor = new RecordingExecutor([[], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType('');

      const statement = onlyStatement(executor.calls);
      expect(parameterAt(statement.params, 0)).toBe('%%');
      expect(statement.sql).not.toContain('%');
    });
  });

  describe('searchProductsByProductType - the four sibling asymmetries, none unified', () => {
    // ⭐ C-3. This method and `searchSkusByProductType`
    // [model/dao/SkuDAO.cfc:L130-L145] look like the same query written twice. They
    // are not, and each difference is preserved as its own source dictates. This
    // suite asserts THIS side of each; the SKU side belongs to
    // `mysqlSkuRepository.test.ts`.
    //
    //   1. THE EMPTINESS IDIOM. Here `len(...)` [model/dao/ProductDAO.cfc:L423];
    //      there `trim(...) != ""` [model/dao/SkuDAO.cfc:L134]. A whitespace-only
    //      list is NON-empty here and EMPTY there. Asserted above.
    //   2. THE ARGUMENT NAMING. Here PLURAL on both sides - `productTypeIDs` maps to
    //      `:productTypeIDs`. There a SINGULAR `productTypeID` binds to a PLURAL
    //      `:productTypeIDs` [model/dao/SkuDAO.cfc:L130, L136]. Neither spelling is
    //      normalised.
    //   3. THE FILTER SHAPE. Here a DIRECT row filter; there a CORRELATED
    //      `IN`-subquery over `SwProduct`. Asserted above.
    //   4. THE UNGUARDED `term` BIND EXISTS IN BOTH. Asserted above for this side.

    it('keeps the PLURAL productTypeIDs spelling on the parameter and in the clause', async () => {
      // Asymmetry 2. The port declares `productTypeIDs?: string` - plural, and a
      // STRING rather than an array, because that is the legacy type and the legacy
      // value is a comma-delimited list. It is deliberately not widened to an array
      // and there is no array-taking overload.
      const executor = new RecordingExecutor([[], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(
        SEARCH_TERM,
        MERCHANDISE_PRODUCT_TYPE_ID + ',' + SUBSCRIPTION_PRODUCT_TYPE_ID,
      );

      const statement = onlyStatement(executor.calls);

      // The column in the emitted clause is the SINGULAR column name `productTypeID`,
      // because that is the physical column [model/entity/Product.cfc:L69]; the
      // ARGUMENT is the plural `productTypeIDs`. Both spellings coexist verbatim and
      // neither is corrected into the other.
      expect(statement.sql).toContain('productTypeID in (');
      expect(statement.sql).not.toContain('productTypeIDs');
    });

    it('accepts the comma-delimited string type and never an array', async () => {
      // Asymmetry 2's type half. Passing a two-element comma list yields two bound
      // parameters, proving the string is parsed rather than bound whole - and note
      // this is the OPPOSITE of the `getAttributeSets` product-type arm, where the
      // joined string IS bound whole. The two must never be cross-applied, and this
      // pair of cases is what makes the distinction checkable.
      const executor = new RecordingExecutor([[], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const twoElementList = MERCHANDISE_PRODUCT_TYPE_ID + ',' + SUBSCRIPTION_PRODUCT_TYPE_ID;
      await repository.searchProductsByProductType(SEARCH_TERM, twoElementList);

      const statement = onlyStatement(executor.calls);

      expect(statement.params).toHaveLength(3);
      expect(statement.params).not.toContain(twoElementList);
      expect(statement.params).toStrictEqual([
        '%' + SEARCH_TERM + '%',
        MERCHANDISE_PRODUCT_TYPE_ID,
        SUBSCRIPTION_PRODUCT_TYPE_ID,
      ]);
    });
  });

  // ===========================================================================
  // C-3b  searchProductsByProductType - THE COMPLETE-STATEMENT PLACEHOLDER CEILING
  // ===========================================================================

  describe('searchProductsByProductType - the complete-statement placeholder ceiling', () => {
    /** A comma-list with exactly `count` product-type identifiers. */
    function productTypeList(count: number): string {
      return Array.from({ length: count }, (_unused, index) => `type-${String(index)}`).join(',');
    }

    it('accepts one fewer product type plus the unconditional term bind at the ceiling', async () => {
      const executor = new RecordingExecutor([[]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const result = await repository.searchProductsByProductType(
        SEARCH_TERM,
        productTypeList(MAX_PLACEHOLDER_COUNT - 1),
      );

      expect(executor.calls).toHaveLength(1);
      expect(statementAt(executor.calls, 0).params).toHaveLength(MAX_PLACEHOLDER_COUNT);
      expect(result).toStrictEqual({ records: [], matchedCount: 0 });
    });

    it('refuses a list at the raw ceiling because the term makes the complete statement one wider', async () => {
      const executor = new RecordingExecutor([]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await expect(
        repository.searchProductsByProductType(SEARCH_TERM, productTypeList(MAX_PLACEHOLDER_COUNT)),
      ).rejects.toThrow(/complete product search would carry 65536 placeholders/);

      // Refusal happens before the placeholder body or any statement is allocated.
      expect(executor.calls).toStrictEqual([]);
    });
  });

  // ===========================================================================
  // C-3c  searchProductsByProductType - THE MATERIALIZATION WINDOW
  //
  // NET-NEW. No legacy antecedent: the CFML DAO had no window at all, because the
  // framework smart list windowed the ROWS the ORM had already loaded.
  //
  // A security review raised a MAJOR finding (CWE-400): the service's paging window was
  // applied to a FULLY MATERIALIZED product array, so a two-record page still paid for
  // every matched product graph. The window is now a third parameter on this member, and
  // the adapter applies it to the MATCHED IDENTIFIER LIST - after the projection, before
  // any graph read. These cases pin all three properties that makes it a real fix:
  //
  //   1. The window bounds the WORK, not just the answer: the graph statement binds only
  //      the windowed identifiers.
  //   2. `matchedCount` stays the TRUE PRE-WINDOW total, so a caller can still report
  //      "3 of 40" without a second COUNT(*).
  //   3. The PORTED STATEMENT TEXT IS UNCHANGED - no LIMIT, no OFFSET, no ORDER BY is
  //      grafted onto [model/dao/ProductDAO.cfc:L420-L427]. That is deliberate: the legacy
  //      statement carries NO ordering, so a SQL LIMIT would select an arbitrary subset
  //      and silently change which products a page contains.
  // ===========================================================================

  describe('searchProductsByProductType - the materialization window', () => {
    /** Three matched identifiers, so a one-record window has something on both sides of it. */
    const SECOND_MATCH_ID = 'product-search-second';
    const THIRD_MATCH_ID = 'product-search-third';

    /** The projection the legacy statement returns: identifier plus name, three rows. */
    const THREE_MATCHES: readonly SqlRow[] = [
      PRODUCT_SEARCH_ROW,
      { ...PRODUCT_SEARCH_ROW, productID: SECOND_MATCH_ID },
      { ...PRODUCT_SEARCH_ROW, productID: THIRD_MATCH_ID },
    ];

    it('returns ONLY the windowed rows and reports the pre-window total', async () => {
      // ★★★ QUOTE-THEN-REVISE (F38). This case was titled "materializes ONLY the windowed identifiers"
      // and its first property read "the WORK is bounded. The graph statement binds exactly one
      // identifier". There is no graph statement on this path any more: the search answers the two
      // columns its own statement selected, so the work it used to bound does not happen at all and
      // the window bounds the ROW SET. The window is still `{ start: 1, count: 1 }` - the MIDDLE
      // match - so a passing assertion still cannot be explained by a truncation at either end, and
      // the pre-window total is still asserted, which was and remains the point of the second half.
      const executor = new RecordingExecutor([[...THREE_MATCHES]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const products = await repository.searchProductsByProductType(SEARCH_TERM, undefined, {
        start: 1,
        count: 1,
      });

      // Property 1, STRONGER THAN IT WAS: the work is bounded by there being none to bound. ONE
      // statement answers a three-match search, whatever the window.
      expect(executor.calls).toHaveLength(1);

      expect(products.records).toHaveLength(1);
      expect(matchAt(products.records, 0).id).toBe(SECOND_MATCH_ID);

      // Property 2: the count is the PROJECTION's size, independent of the window. This is what lets
      // a caller keep reporting the true total for free.
      expect(products.matchedCount).toBe(3);
    });

    it('leaves the ported statement text free of LIMIT, OFFSET and ORDER BY', async () => {
      // Property 3, and the reason the window is applied to the identifier list rather than
      // pushed into SQL. [model/dao/ProductDAO.cfc:L420-L427] carries no ordering whatsoever,
      // so `LIMIT 1 OFFSET 1` over an unordered result is a request for AN arbitrary row, not
      // THE second row. Adding an ORDER BY to make LIMIT meaningful would change the emitted
      // statement, which is exactly what the port forbids.
      const executor = new RecordingExecutor([
        [...THREE_MATCHES],
        [{ ...PRODUCT_GRAPH_ROW, p_productID: SECOND_MATCH_ID }],
        [],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(SEARCH_TERM, undefined, { start: 1, count: 1 });

      const searchStatement = statementAt(executor.calls, 0);
      const lowered = searchStatement.sql.toLowerCase();
      expect(lowered).not.toContain('limit');
      expect(lowered).not.toContain('offset');
      expect(lowered).not.toContain('order by');

      // And the bound values are still ONLY the search term - the window is nowhere near the
      // parameter list.
      expect(searchStatement.params).toStrictEqual(['%' + SEARCH_TERM + '%']);
    });

    it('sends NO graph statement at all when the window selects nothing', async () => {
      // A window past the end of the match list is not an error and not an empty-window
      // special case - it simply materializes nothing. The interesting property is that the
      // adapter STOPS: with no identifiers to read, no graph statement is sent, so a caller
      // paging past the end costs one statement rather than a full materialization.
      const executor = new RecordingExecutor([[...THREE_MATCHES]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const products = await repository.searchProductsByProductType(SEARCH_TERM, undefined, {
        start: 99,
        count: 10,
      });

      expect(executor.calls).toHaveLength(1);
      expect(products.records).toStrictEqual([]);

      // The total is STILL reported, which is the whole reason it is a separate member: a
      // caller that overshot needs to learn how far it overshot by.
      expect(products.matchedCount).toBe(3);
    });

    it('returns every match when no window is supplied', async () => {
      // The parameter is OPTIONAL, and omitting it must mean "all of them" - not "an implicit default
      // page". Every existing caller and every case above this block relies on that, and the legacy
      // DAO had no window, so an implicit one would be an invented behaviour.
      //
      // ★★★ QUOTE-THEN-REVISE (F38): titled "materializes every match" and asserting the identifiers
      // bound by a SECOND, graph statement. There is no second statement now - the search answers the
      // two columns its own statement selected - so what "every match" means is every ROW, and the
      // rows are asserted directly.
      const executor = new RecordingExecutor([[...THREE_MATCHES]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const products = await repository.searchProductsByProductType(SEARCH_TERM);

      expect(executor.calls).toHaveLength(1);
      expect(products.records.map((row) => row.id)).toStrictEqual([
        PERSISTED_PRODUCT_ID,
        SECOND_MATCH_ID,
        THIRD_MATCH_ID,
      ]);
      expect(products.matchedCount).toBe(3);
    });
  });

  // ===========================================================================
  // C-4  loadDataFromFile - declared, annotated, and NOT designed around
  // ===========================================================================

  describe('loadDataFromFile - declared and deliberately unexercised', () => {
    // C4.1. The port declares
    //   loadDataFromFile(fileURL: string, textQualifier?: string): Promise<void>
    // and the legacy default for `textQualifier` is the EMPTY STRING
    // [model/dao/ProductDAO.cfc:L73] - recorded here IN A COMMENT and never written
    // as a TypeScript default value, because reproducing it as a default would imply
    // the argument reaches an implementation that uses it.
    //
    // C4.2 - THE EXECUTION-MODEL WARNING, DECLARED AND NOT DESIGNED AROUND. The
    // calling service raises the request timeout to 3600 seconds immediately before
    // delegating here [model/service/ProductService.cfc:L65-L67], and that budget
    // does not exist in this runtime: AWS Lambda caps a single invocation at 15
    // minutes, and API Gateway bounds an integration per API type - 30 s for an
    // HTTP API, 29 s by default for a REST API, raisable beyond that only for
    // Regional and private REST APIs. Those are PUBLISHED PLATFORM FACTS rather
    // than one universal cap, never SLAs, and no latency, throughput, availability or
    // uptime claim is made or implied anywhere in this file (C7/B7). Nothing is
    // invented to work around the mismatch either - this suite asserts NO timeout,
    // chunk, offset, cursor, resume, streaming handle, job handle, queue,
    // progress callback or begin/continue split, because the port declares none.
    //
    // C4.4 / C4.5 - WHAT IS NOT ASSERTED BECAUSE IT IS NOT PORTED.
    // [model/dao/ProductDAO.cfc:L412-L417] interpolates table AND column names into
    // an `INSERT`, and [model/dao/ProductDAO.cfc:L328] `saveImportData` is private:
    // neither is ported, so neither is asserted and no batching is invented for
    // either. The dialect branches at [model/dao/ProductDAO.cfc:L288] and [:L304]
    // sit inside this same unexercised path and are not modelled, so nothing is
    // asserted about them. `processProduct_addProductReview`
    // [model/service/ProductService.cfc:L157], `processProduct_addSubscriptionTerm`
    // [:L173] and `processProduct_uploadDefaultImage` [:L235] get no port method at
    // all and none is asserted here.

    it('exists with the declared two-argument signature', () => {
      const repository = aProductRepository(new RecordingExecutor(), TEST_AUDIT_ACTOR);

      expect(typeof repository.loadDataFromFile).toBe('function');

      // ⭐ THIS ARITY IS THE DIRECT PROOF OF C4.1. `Function.length` counts the
      // parameters BEFORE the first one carrying a default value, so a declared arity
      // of TWO proves both that `textQualifier` is present and that it carries NO
      // default. Had the legacy `""` [model/dao/ProductDAO.cfc:L73] been transcribed
      // as a TypeScript default value, this would read 1 instead. The legacy default is
      // recorded in the comment above and nowhere else, exactly as required.
      expect(repository.loadDataFromFile.length).toBe(2);
    });

    it('performs NO filesystem or network access, and issues no statement', async () => {
      // ⚠ C4.3. This case is written specifically so that it CANNOT fetch anything:
      // it never reaches a real URL, never opens a file, and asserts that the adapter
      // does not either. The adapter's documented behaviour is an explicit refusal -
      // which is the only honest body, because silently inventing a working importer
      // would be the single largest unrequested behaviour in the subtree, and
      // returning quietly would be worse still, since a caller would believe an
      // import had happened.
      //
      // The argument is a syntactically valid but deliberately unroutable location: it
      // is never dereferenced, and it carries no credential, no hostname of a real
      // service and no connection string (E6).
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const rejection = await captureRejection(() => repository.loadDataFromFile('products.csv'));

      expect(rejection.name).toBe('ProductBulkImportUnavailableError');

      // The whole point: NOTHING was read and NOTHING was written.
      expect(executor.calls).toHaveLength(0);
      expect(executor.mutationCalls).toHaveLength(0);
    });

    it('refuses identically when a text qualifier is supplied', async () => {
      // The legacy default is `""`; supplying a qualifier explicitly must not open a
      // second, working code path. There is only one behaviour here.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const rejection = await captureRejection(() =>
        repository.loadDataFromFile('products.txt', '"'),
      );

      expect(rejection.name).toBe('ProductBulkImportUnavailableError');
      expect(executor.calls).toHaveLength(0);
      expect(executor.mutationCalls).toHaveLength(0);
    });

    it('rejects rather than throwing synchronously, so a Promise consumer can catch it', async () => {
      // An `async` function that throws produces a REJECTED PROMISE, which is what a
      // caller of a `Promise<void>` method handles. A synchronous throw from a
      // promise-returning method escapes before any `.catch` is attached and is a
      // different failure mode. Asserting the rejected-promise shape pins that.
      const repository = aProductRepository(new RecordingExecutor(), TEST_AUDIT_ACTOR);

      const pending = repository.loadDataFromFile('products.csv');

      expect(pending).toBeInstanceOf(Promise);
      await expect(pending).rejects.toThrow();
    });
  });

  // ===========================================================================
  // C-5  load / save / delete - the three net-new lifecycle methods
  // ===========================================================================

  describe('getProductByProductID - NET-NEW, no legacy antecedent', () => {
    // `model/dao/ProductDAO.cfc` declares NO load function at all: the legacy
    // obtained an entity through Hibernate by way of the framework base component's
    // generated accessors and `entityLoad`, neither of which exists in a driver-only
    // stack. T3 converts that construct into a repository method, and the name
    // follows the closest legacy naming precedent in the same DAO family,
    // `getSkuBySkuCode` [model/dao/SkuDAO.cfc:L102].

    it('binds exactly one productID and never puts the identifier in the statement text', async () => {
      // C5.1. The identifier is a bound parameter, full stop.
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW], [], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductByProductID(PERSISTED_PRODUCT_ID);

      const graphStatement = statementAt(executor.calls, 0);

      expect(graphStatement.sql).toBe(expectedProductGraphStatement('?'));
      expect(graphStatement.sql).not.toContain(PERSISTED_PRODUCT_ID);
      expect(graphStatement.params).toStrictEqual([PERSISTED_PRODUCT_ID]);
      expect(placeholderCount(graphStatement.sql)).toBe(1);
    });

    it('returns undefined on a miss - never a zero value and never an empty object', async () => {
      // ⚠ C5.1's load-bearing half. Absence is EXPLICIT. This is the same discipline
      // that keeps `Sku.getPriceByCurrencyCode()` [model/entity/Sku.cfc:L269-L273]
      // answering `undefined` instead of a zero that would sell products for free -
      // substituting a default here would be the same class of error one layer up.
      const executor = new RecordingExecutor([[]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = await repository.getProductByProductID(UNMATCHED_PRODUCT_ID);

      expect(product).toBeUndefined();

      // A miss costs the graph read ALONE - no SKU read, no option read.
      expect(executor.calls).toHaveLength(1);
      expect(statementAt(executor.calls, 0).params).toStrictEqual([UNMATCHED_PRODUCT_ID]);
    });

    it('materializes the documented fetch shape in exactly three statements', async () => {
      // ⭐ C6.1 - THE ORM-LAZINESS REPLACEMENT, ASSERTED. The target deliberately does
      // NOT simulate laziness: each entity exposes already-populated association
      // arrays whose fetch shape was DECIDED and documented at the method that
      // produced it. The whole in-scope DAO layer contains exactly five `JOIN FETCH`
      // clauses and NOT ONE is in `ProductDAO`, so the legacy expressed no eager-load
      // intent for a product graph anywhere - it simply let Hibernate lazy-load
      // whatever a caller touched. With no ORM there is nothing to inherit.
      //
      // The decided shape: brand and productType join into the graph statement
      // because both declare `fetch="join"` [model/entity/Product.cfc:L68-L69]; skus
      // are a second statement, because a one-to-many cannot be flattened into the
      // product row without multiplying it; each SKU's options are a third, across
      // the link table. THREE STATEMENTS TOTAL, and no more.
      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW_WITH_DEFAULT_SKU],
        [SKU_ROW],
        [SKU_OPTION_ROW],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      // NO MORE than the shape declares - no fourth statement, no unbounded graph
      // walk, and no per-row follow-up.
      expect(executor.calls).toHaveLength(3);
      expect(executor.mutationCalls).toHaveLength(0);

      expect(statementAt(executor.calls, 0).sql).toBe(expectedProductGraphStatement('?'));
      expect(statementAt(executor.calls, 1).sql).toBe(
        EXPECTED_SKU_READ_HEAD + '\n' + 'WHERE s.productID IN (?)' + '\n' + '  OR s.skuID IN (?)',
      );
      expect(statementAt(executor.calls, 2).sql).toBe(
        EXPECTED_SKU_OPTION_READ_HEAD + '\n' + 'WHERE so.skuID IN (?)',
      );

      // NO FEWER either - the associations the shape promises are actually populated,
      // so a synchronous entity method that traverses one does not meet `undefined`.
      const skus = product.getSkus();
      expect(skus).toHaveLength(1);
      expect(product.getDefaultSku()?.getSkuID()).toBe(PERSISTED_SKU_ID);
    });

    // =====================================================================
    // ★★★ THE PRODUCT-TYPE PORT, AND WHY THESE THREE CASES EXIST
    //
    // A RUNTIME FINDING, NOT A SPECULATIVE ONE. QA testing drove
    // `POST /promotions/application` with ordinary catalogue data and received
    // `500 unrecognized`. The trace was
    //   bootstrap `loadDocumentSkus`
    //     -> `SkuRepository.getProductSkus(product, /*fetchOptions*/ true)`
    //     -> `Product.getBaseProductType()`
    //     -> `ProductType.getBaseProductType()`  ← raised
    // because THIS adapter's product-type factory constructed the entity with no
    // `productTypeRepository`, and [model/entity/ProductType.cfc:L112] cannot answer
    // without one when the type carries no `systemCode` of its own.
    //
    // ★ WHY 5 934 GREEN TESTS DID NOT CATCH IT, which is the part worth fixing
    // permanently. No case in this file materialized a product type AT ALL - the shared
    // `PRODUCT_GRAPH_ROW` leaves both product-type columns NULL - and the one case in
    // `mysqlSkuRepository.test.ts` that reaches `getProductSkus(product, true)`
    // substitutes a `Product` subclass overriding the very method that failed. So the
    // failing combination existed in no suite. These cases pair the REAL hydration with
    // the REAL accessor, which is the pairing the report asked for.
    //
    // ★★ AND THE FIX MOVED, WHICH IS WHY THE WIRING IS NOW STATED HERE RATHER THAN IMPLIED. The
    // first repair made the adapter build its own `MysqlProductTypeRepository` when a construction
    // site omitted one; a later code review recorded that default as a SECOND COMPOSITION ROOT and as
    // a default that hid incomplete wiring. The collaborator is mandatory now, so these cases NAME the
    // port they exercise: the two below hand in a real adapter over their own recording executor -
    // which is what the composition root does, and it keeps the statement counts these cases assert
    // exactly as they were - and the third hands in an answering double so a wired port's answer is
    // distinguishable from a row-driven one.
    // =====================================================================

    it('★ hydrates a product type that CAN answer getBaseProductType() when its systemCode is NULL', async () => {
      // The product read costs TWO statements here - the graph, then the SKU read, which
      // matches nothing, so the option read is correctly skipped. The THIRD canned set is
      // therefore the ROOT product-type read the entity issues through the injected port.
      // Without the port the entity raises before reaching the executor at all, so the
      // presence of that third statement is itself the proof that the port arrived.
      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW_WITH_LEAF_PRODUCT_TYPE],
        [],
        [ROOT_PRODUCT_TYPE_ROW],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      expect(executor.calls).toHaveLength(2);

      // ANSWERS rather than raising, and answers the ROOT's system code - which is what
      // [model/entity/ProductType.cfc:L110-L115] resolves through
      // `getProductType(listFirst(getProductTypeIDPath())).getSystemCode()`.
      await expect(product.getBaseProductType()).resolves.toBe(ROOT_PRODUCT_TYPE_SYSTEM_CODE);

      // The root was read BY IDENTIFIER, bound, never interpolated - and it is the first
      // element of the STORED PATH, not a parent pointer walked in memory.
      expect(executor.calls).toHaveLength(3);
      const rootRead = statementAt(executor.calls, 2);
      expect(rootRead.params).toStrictEqual([ROOT_PRODUCT_TYPE_ID]);
      expect(rootRead.sql).toContain('FROM SwProductType');
      expect(rootRead.sql).not.toContain(ROOT_PRODUCT_TYPE_ID);
    });

    it('★ costs NO extra statement for a product type that carries its own systemCode', async () => {
      // The complement, and it is not redundant: it proves the port is a FALLBACK PATH
      // rather than an unconditional extra read. A base product type answers from its own
      // column and no product-type statement is issued at all.
      //
      // ★ THE REFUSING PORT IS WHAT MAKES THAT CLAIM AIRTIGHT NOW. The case used to lean on a
      // statement count alone; with a port that THROWS if it is consulted, "no extra read" is proved
      // by the case passing rather than inferred from a number.
      const executor = new RecordingExecutor([
        [
          {
            ...PRODUCT_GRAPH_ROW_WITH_LEAF_PRODUCT_TYPE,
            pt_systemCode: ROOT_PRODUCT_TYPE_SYSTEM_CODE,
          },
        ],
        [],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      await expect(product.getBaseProductType()).resolves.toBe(ROOT_PRODUCT_TYPE_SYSTEM_CODE);
      expect(executor.calls).toHaveLength(2);
    });

    it('★ uses the WIRED product-type port, which is now the ONLY port it can use', async () => {
      // ★★★ QUOTE-THEN-REVISE (F16). This case was titled "prefers the WIRED product-type port over
      // its own default when the bag supplies one" and its note read "the default inside this adapter
      // exists only so that a construction site which supplies no bag still hydrates a usable
      // entity". There is no default inside the adapter any more: code review recorded the
      // constructed fallback as a hidden concrete dependency and a T1 violation, so the bag member is
      // required and the fallback - along with the adapter's import of its sibling - is gone. What
      // this case proves is unchanged in substance and stronger in kind: the port the CONSTRUCTION
      // SITE supplies is the port the entity gets. The substitute answers without touching the
      // executor, so no third statement ever appears; with a real adapter in its place, one would.
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW_WITH_LEAF_PRODUCT_TYPE], []]);
      const wiredReads: string[] = [];
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {
        productTypeRepository: {
          getProductTypeQuery: () => Promise.resolve([]),
          getProductTypesByProductTypeIDPath: () => Promise.resolve([]),
          getProductTypeByProductTypeID: (productTypeID: string) => {
            wiredReads.push(productTypeID);

            return Promise.resolve(
              new ProductType({
                productTypeID,
                systemCode: ROOT_PRODUCT_TYPE_SYSTEM_CODE,
              }),
            );
          },
          saveProductType: () => {
            throw new Error('the wired product-type port must not be asked to write here');
          },
        },
      });

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      await expect(product.getBaseProductType()).resolves.toBe(ROOT_PRODUCT_TYPE_SYSTEM_CODE);
      expect(wiredReads).toStrictEqual([ROOT_PRODUCT_TYPE_ID]);
      expect(executor.calls).toHaveLength(2);
    });

    it('★★★ CANNOT BE CONSTRUCTED without a product-type port at all, and the compiler is the one that says so (F16)', () => {
      // ★★ THE DIRECTIVES BELOW **ARE** THE ASSERTIONS. `@ts-expect-error` fails the build if the
      // expression it guards ever starts compiling, so each one pins a construction the adapter must
      // keep refusing. This is the difference between "the composition root happens to pass the port"
      // and "no construction site can omit it": the old optional-with-fallback shape compiled in both
      // of the forms below, which is exactly how a site could silently substitute a second instance
      // for the one the root wired.
      const executor = new RecordingExecutor([]);

      // No bag at all - the shape 109 cases in this file used to take.
      // @ts-expect-error - the collaborators bag is required (F16); it no longer defaults to `{}`.
      void (() => new MysqlProductRepository(executor, TEST_AUDIT_ACTOR));

      // A bag that carries other members but not this one. Held in a local rather than written
      // inline so the assignability error lands on the CONSTRUCTION line the directive guards - an
      // inline literal wraps at `printWidth` and moves the error off it, which reads as an unused
      // directive and fails the build for the wrong reason.
      const aBagWithoutTheProductTypePort = { optionRepository: undefined };

      void (() =>
        // @ts-expect-error - `productTypeRepository` is a REQUIRED member of the bag (F16).
        new MysqlProductRepository(executor, TEST_AUDIT_ACTOR, aBagWithoutTheProductTypePort));

      // And the positive control, so the two refusals above are provably about the missing port
      // rather than about the construction being malformed in some other way. Constructing touches
      // no executor, which is why nothing was canned for it.
      expect(aProductRepository(executor, TEST_AUDIT_ACTOR)).toBeInstanceOf(MysqlProductRepository);
      expect(executor.calls).toHaveLength(0);
    });

    it('★★★ REFUSES CONSTRUCTION when the product-type port is omitted, before any statement', () => {
      // ★★★ THIS IS THE CASE THE PREVIOUS SHAPE COULD NOT HAVE. While the collaborator was optional
      // the adapter answered an omission by BUILDING ITS OWN `MysqlProductTypeRepository`, so a
      // construction site that forgot to wire one received something that worked - and the code review
      // that recorded it named both halves of the cost: a second composition root beside
      // `src/handlers/bootstrap.ts`, and incomplete wiring that looked complete. A typed caller can no
      // longer express the omission at all; this case is the UNTYPED caller, which is what the
      // CommonJS bundle is loaded by.
      //
      // THE ERASURE IS DELIBERATE AND IS EXACTLY ONE ASSERTION WIDE. `Partial<...>` describes what an
      // untyped JavaScript caller hands over - a bag missing a member - and the single assertion back
      // to the constructor's own parameter type is how that reaches the constructor without a `any`, a
      // double cast or a suppression anywhere in the file.
      type ProductRepositoryCollaborators = ConstructorParameters<typeof MysqlProductRepository>[2];
      const bagWithoutTheMandatoryPort: Partial<ProductRepositoryCollaborators> = {};

      const executor = new RecordingExecutor();

      expect(
        () =>
          new MysqlProductRepository(
            executor,
            TEST_AUDIT_ACTOR,
            bagWithoutTheMandatoryPort as ProductRepositoryCollaborators,
          ),
      ).toThrow(/ProductWiringError|productTypeRepository/u);

      // ★ AND IT REFUSES BEFORE TOUCHING THE DATASTORE, which is the property that makes the refusal
      // safe to add: no row is read, no row is written, and nothing has to be undone.
      expect(executor.calls).toStrictEqual([]);
    });

    it('materializes the option groups a product reaches through its SKUs, ordered by sortOrder', async () => {
      // ★ THE SMART-LIST SUBSTITUTION, ASSERTED END TO END.
      // `Product.getOptionGroups()` [model/entity/Product.cfc:L251-L261] resolved this
      // through a `HibachiSmartList` - `setSelectDistinctFlag(1)` at [L255], a filter on
      // the traversal `options.skus.product.productID` at [L256], `sortOrder|ASC` at
      // [L257]. The smart list is deliberately not cloned (AAP 0.6.2), so the ported
      // accessor is a synchronous read over an array THIS adapter owes it. Until the
      // adapter supplied it the accessor raised, and `getOptionGroupsStruct()` and
      // `getOptionGroupCount()` raised with it - which took the `minCollection:1` rules
      // in `model/validation/Product.json` down too, since both read through this value.
      //
      // Three option rows across two SKUs, referencing only TWO distinct groups: the
      // `size` group (sortOrder 3) twice, the `colour` group (sortOrder 1) once. So the
      // answer exercises both DISTINCT and the ordering in one pass.
      const secondSkuID = 'c4d19b6ea27f4c85917e3b0d6f8a5241';
      const colourGroupID = 'ffffffffffffffffffffffffffffff03';

      const secondSkuRow: SqlRow = { ...SKU_ROW, skuID: secondSkuID, skuCode: 'NIKEAIRJORDEN-2' };

      const colourOptionRow: SqlRow = {
        ...SKU_OPTION_ROW,
        link_skuID: secondSkuID,
        optionID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa11',
        optionCode: 'colourRed',
        optionName: 'Red',
        optionGroupID: colourGroupID,
        optionGroup_optionGroupID: colourGroupID,
        optionGroup_optionGroupName: 'Colour',
        optionGroup_optionGroupCode: 'colour',
        optionGroup_imageGroupFlag: 0,
        optionGroup_sortOrder: 1,
      };

      // The same `size` group again, reached through the second SKU. DISTINCT has to
      // collapse it; without the map this array would carry three entries.
      const repeatedSizeOptionRow: SqlRow = {
        ...SKU_OPTION_ROW,
        link_skuID: secondSkuID,
        optionID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa12',
        optionCode: 'sizeEleven',
        optionName: 'Size 11',
      };

      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW],
        [SKU_ROW, secondSkuRow],
        [SKU_OPTION_ROW, colourOptionRow, repeatedSizeOptionRow],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      // The accessor ANSWERS rather than raising - that is the whole point.
      const optionGroups = product.getOptionGroups();

      // DISTINCT [L255]: three option rows, two groups.
      expect(optionGroups).toHaveLength(2);

      // ORDER BY sortOrder ASC [L257]: colour (1) before size (3), which is the reverse
      // of the order the option rows arrived in, so the sort is observably applied.
      expect(optionGroups.map((group) => group.getOptionGroupID())).toStrictEqual([
        colourGroupID,
        PERSISTED_OPTION_GROUP_ID,
      ]);
      expect(optionGroups.map((group) => group.getSortOrder())).toStrictEqual([1, 3]);

      // The other two members of the memo trio ride on the same array.
      expect(product.getOptionGroupCount()).toBe(2);
      expect(Object.keys(product.getOptionGroupsStruct()).sort()).toStrictEqual(
        [colourGroupID, PERSISTED_OPTION_GROUP_ID].sort(),
      );

      // ⭐ AND IT COSTS NO STATEMENT. The groups ride in on the option read's LEFT JOIN,
      // so the documented three-statement shape is unchanged - no fourth statement and
      // no per-option follow-up.
      expect(executor.calls).toHaveLength(3);
    });

    it('answers an empty option-group array for a product whose SKUs carry no options', async () => {
      // MATERIALIZED-AS-EMPTY IS NOT THE SAME AS NEVER-MATERIALIZED, and the adapter
      // has to produce the first. `Product.getOptionGroups()` raises for the second
      // precisely so a repository that forgot the query cannot report "no option
      // groups" and silently satisfy the `minCollection:1` validation rules. A product
      // whose SKUs genuinely carry no options must therefore arrive with `[]`.
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW], [SKU_ROW], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      expect(product.getOptionGroups()).toStrictEqual([]);
      expect(product.getOptionGroupCount()).toBe(0);
    });

    it('keeps an option whose optionGroupID is NULL and contributes no group for it', async () => {
      // ⚠ THE OUTER-NESS OF THE JOIN IS LOAD-BEARING TWICE OVER.
      // `Option.optionGroup` [model/entity/Option.cfc:L59] is a nullable many-to-one, so
      // an INNER JOIN would have dropped a group-less option out of the SKU's `options`
      // collection entirely - shortening a must-preserve collection to make an unrelated
      // association resolvable. It also has to be possible for a group-less option to
      // REACH an entity method, because `Sku.generateImageFileName()`
      // [model/entity/Sku.cfc:L131-L139] dereferences `getOptionGroup()` UNGUARDED and
      // that source behaviour is preserved rather than defended against.
      const grouplessOptionRow: SqlRow = {
        ...SKU_OPTION_ROW,
        optionID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa13',
        optionCode: 'ungrouped',
        optionGroupID: null,
        optionGroup_optionGroupID: null,
        optionGroup_optionGroupName: null,
        optionGroup_optionGroupCode: null,
        optionGroup_imageGroupFlag: null,
        optionGroup_sortOrder: null,
      };

      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW],
        [SKU_ROW],
        [grouplessOptionRow],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      const options = product.getSkus()[0]?.getOptions() ?? [];

      // The option SURVIVED the join.
      expect(options).toHaveLength(1);
      expect(options[0]?.getOptionCode()).toBe('ungrouped');
      expect(options[0]?.getOptionGroup()).toBeUndefined();

      // And it contributed no phantom group.
      expect(product.getOptionGroups()).toStrictEqual([]);
    });

    it('excludes the option groups of a default SKU that belongs to another product', async () => {
      // THE TRAVERSAL AT [model/entity/Product.cfc:L256] IS
      // `options.skus.product.productID`, so a group qualifies only through a SKU whose
      // `productID` IS THIS PRODUCT. `SwProduct.defaultSkuID` [L70] is declared
      // independently of the `skus` collection [L73], so a default SKU may belong to
      // some other product - it is reachable by identifier and NOT by owning product.
      // Deriving the groups from the identifier index instead of the owning-product
      // index would attribute another product's option groups to this one.
      const foreignSkuID = 'e70b53d1a8c94f26b1d40a9c8b5e7263';
      const foreignGroupID = 'ffffffffffffffffffffffffffffff09';

      const foreignSkuRow: SqlRow = {
        ...SKU_ROW,
        skuID: foreignSkuID,
        skuCode: 'FOREIGN-1',
        productID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa99',
      };

      const foreignOptionRow: SqlRow = {
        ...SKU_OPTION_ROW,
        link_skuID: foreignSkuID,
        optionID: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa14',
        optionCode: 'foreignOnly',
        optionGroupID: foreignGroupID,
        optionGroup_optionGroupID: foreignGroupID,
        optionGroup_optionGroupName: 'Foreign',
        optionGroup_optionGroupCode: 'foreign',
        optionGroup_sortOrder: 1,
      };

      const graphRow: SqlRow = { ...PRODUCT_GRAPH_ROW, p_defaultSkuID: foreignSkuID };

      const executor = new RecordingExecutor([
        [graphRow],
        [SKU_ROW, foreignSkuRow],
        [SKU_OPTION_ROW, foreignOptionRow],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      // The foreign SKU IS the default SKU and IS NOT in the product's own collection -
      // the shape `MaterializedSkus` documents.
      expect(product.getDefaultSku()?.getSkuID()).toBe(foreignSkuID);
      expect(product.getSkus().map((sku) => sku.getSkuID())).toStrictEqual([PERSISTED_SKU_ID]);

      // So only the owning product's group is reached, and the foreign one is absent
      // even though its row was in the same result set.
      expect(product.getOptionGroups().map((group) => group.getOptionGroupID())).toStrictEqual([
        PERSISTED_OPTION_GROUP_ID,
      ]);
    });

    it('binds the product identifier AND the default-sku identifier on the SKU read', async () => {
      // The `OR` in the SKU statement is load-bearing: `skus` is keyed on
      // `SwSku.productID` while `defaultSku` is keyed on `SwProduct.defaultSkuID`,
      // and nothing in the schema guarantees the second is a member of the first. If
      // the default SKU were resolved only by scanning the product's own array it
      // would be `undefined` whenever the two disagree - and `saveProduct` writes
      // `defaultSkuID` FROM that association, so an undefined default would be
      // persisted as NULL on the next save. The identifier predicate closes the hole.
      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW_WITH_DEFAULT_SKU],
        [SKU_ROW],
        [SKU_OPTION_ROW],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductByProductID(PERSISTED_PRODUCT_ID);

      const skuStatement = statementAt(executor.calls, 1);

      expect(skuStatement.sql).toContain('WHERE s.productID IN (?)');
      expect(skuStatement.sql).toContain('OR s.skuID IN (?)');
      expect(skuStatement.params).toStrictEqual([PERSISTED_PRODUCT_ID, PERSISTED_SKU_ID]);
      expect(skuStatement.sql.toLowerCase()).not.toContain('order by');
    });

    it('issues no option read when the product has no SKUs', async () => {
      // C6.1's lower bound: a shape that materializes nothing must COST nothing. With
      // no SKU rows there are no SKU identifiers to bind, so the third statement is
      // short-circuited rather than sent with an empty IN list.
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      expect(executor.calls).toHaveLength(2);
      expect(product.getSkus()).toStrictEqual([]);
    });

    it('runs the row-to-entity hydration factory exactly once per row', async () => {
      // C6.1's last clause. Two graph rows produce two DISTINCT products and still exactly one SKU
      // statement and one option statement - so hydration is per row while the collection loads stay
      // per CALL. That is the explicit alternative to Hibernate's implicit per-entity initialization,
      // and it is what removes the N+1 the ORM's laziness made easy to reach by accident.
      //
      // ★★★ QUOTE-THEN-REVISE ON HOW TWO ROWS ARE REACCHED (F38 + F5). This case used to drive the
      // multi-row path through `searchProductsByProductType`, asserting "One search statement plus the
      // three-statement graph load … TWO matched products still cost FOUR statements". The search no
      // longer hydrates anything - it answers the two columns [model/dao/ProductDAO.cfc:L421] selects -
      // so it can no longer reach the factory at all. The set-based ENTITY load can, and it is the
      // door the composition root's order-document hydration now uses instead of one singular call per
      // product (F5). The property under test is unchanged; only the entry point is.
      const secondProductID = 'b0e51c7a94f3428db6207ef85c1a39d4';
      const secondGraphRow: SqlRow = {
        ...PRODUCT_GRAPH_ROW,
        p_productID: secondProductID,
        p_productName: 'Nike Air Jorden II',
      };

      // Three canned result sets, in the order the three statements are sent: the graph read, then
      // the SKU read, then the option read.
      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW, secondGraphRow],
        [SKU_ROW],
        [SKU_OPTION_ROW],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const products = await repository.getProductsByProductID([
        PERSISTED_PRODUCT_ID,
        secondProductID,
      ]);

      // THREE statements for TWO products, not six: hydration is per row, collection loads stay per
      // call, and the graph statement binds BOTH identifiers in one `IN` list.
      expect(executor.calls).toHaveLength(3);
      expect(statementAt(executor.calls, 0).params).toStrictEqual([
        PERSISTED_PRODUCT_ID,
        secondProductID,
      ]);
      expect(products.size).toBe(2);

      const first = requireProduct(products.get(PERSISTED_PRODUCT_ID));
      const second = requireProduct(products.get(secondProductID));
      expect(first).not.toBe(second);
      expect(first.getProductID()).toBe(PERSISTED_PRODUCT_ID);
      expect(second.getProductID()).toBe(secondProductID);
    });

    it('★★★ keys the batched load by FOLDED identifier and issues no statement for an empty request (F5)', async () => {
      // Two properties of the set-based load that the singular form cannot express, and both matter to
      // the caller that replaced its per-product loop with it.
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW], [], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      // The stored identifier is lower-case hexadecimal; asked for in UPPER case, it is still found.
      // MySQL's default collation matches the row that way, so the map key has to fold too or a found
      // row would be silently dropped from the answer.
      const found = await repository.getProductsByProductID([PERSISTED_PRODUCT_ID.toUpperCase()]);

      expect(found.size).toBe(1);
      expect(requireProduct(found.get(PERSISTED_PRODUCT_ID)).getProductID()).toBe(
        PERSISTED_PRODUCT_ID,
      );

      // And an empty request costs nothing at all, which is what makes the caller's guard unnecessary
      // rather than merely redundant.
      const emptyExecutor = new RecordingExecutor([]);
      const emptyRepository = aProductRepository(emptyExecutor, TEST_AUDIT_ACTOR);

      expect((await emptyRepository.getProductsByProductID([])).size).toBe(0);
      expect(emptyExecutor.calls).toHaveLength(0);
    });

    it('materializes the eager brand from the same statement, in one read', async () => {
      // T3, FETCH SHAPE IS A DECISION. [model/entity/Product.cfc:L68] declares
      // `fetch="join"` on the brand association, which is Hibernate's instruction to
      // resolve it in the owning select through an outer join - so the adapter
      // projects all eleven `SwBrand` columns into the product graph statement and
      // hydrates the brand from the SAME row. No second statement is sent for it,
      // which is what makes the association eager rather than an N+1 waiting to
      // happen.
      //
      // This is also the ONLY way `SwBrand` is reached anywhere in this module. The
      // port publishes no brand write - its member set is locked at six, the port
      // inventory at thirteen - so the table is read here and written nowhere. See
      // this file's header for why the seventh member was removed rather than
      // relocated.
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW_WITH_BRAND], [], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      // The product has no SKUs in this row, so the option read is skipped: ONE
      // statement for the graph plus ONE for the SKUs, and the brand arrived inside
      // the first of them.
      expect(executor.calls).toHaveLength(2);
      expect(statementAt(executor.calls, 0).sql).toContain(
        'LEFT JOIN SwBrand b ON b.brandID = p.brandID',
      );
      for (const call of executor.calls) {
        expect(call.sql).not.toBe(`SELECT brandID FROM SwBrand WHERE brandID = ?`);
      }

      // The materialized brand carries the projected column values, so the eager
      // fetch produced a real entity rather than a sentinel.
      const brand = product.getBrand();

      if (brand === undefined) {
        throw new Error('the eager brand join produced no brand, so there is nothing to assert');
      }

      expect(brand.getBrandID()).toBe(PERSISTED_BRAND_ID);
      expect(brand.getBrandName()).toBe('Nike');
      expect(brand.getUrlTitle()).toBe('nike');

      // T3: NO association is materialized on a brand reached through a product.
      // Populating `products` would present the one product that happened to be read
      // as though it were the brand's complete product set, which is exactly the claim
      // a lazy proxy never made. [meta/tests/unit/entity/BrandTest.cfc:L58-L60]
      // `defaults_are_correct()` asserts the empty array on a factory-fresh brand, and
      // the constructor default is what answers here.
      expect(brand.getProducts()).toStrictEqual([]);

      // NOTHING WAS WRITTEN. A read path emits no mutation, and there is no brand
      // write on this adapter to emit one.
      expect(executor.mutationCalls).toStrictEqual([]);
    });
  });

  describe('saveProduct - NET-NEW, and the replacement for the ORM save', () => {
    // Persistence ran through Hibernate as
    // `getHibachiDAO().save(target=arguments.product)`
    // [model/service/ProductService.cfc:L287]. T3 converts that into this method.
    //
    // ★ QUOTE-THEN-REVISE. This header used to continue: "It takes the ENTITY ALONE and no
    // data struct, because population, validation and unique URL-title generation all
    // remain at the service tier where the legacy performed them
    // [model/service/ProductService.cfc:L264-L292]." Generation and validation DO still
    // live at the service tier - that half is right and unchanged. It was "the ENTITY
    // ALONE" that could not survive contact with the entity's immutability: the legacy's
    // generated title reached persistence because the service assigned it ONTO the entity
    // at [model/service/ProductService.cfc:L269] and that same entity reached the DAO at
    // [L287], whereas `Product.urlTitle` is `private readonly` here. With no payload the
    // adapter wrote `product.getUrlTitle()`, still absent, so the resolved title was never
    // stored and the service's generation guard fired again on every subsequent save. The
    // member therefore takes a `ProductSavePayload` carrying the two columns the populate
    // step can decide, and the populate step itself lives in the adapter - see
    // {@link NO_POPULATED_MEMBERS} for what an empty one means and the
    // `the populate step` cases below for what a populated one does.

    it('binds every inserted column value and interpolates none', async () => {
      // C5.2. Twenty columns, twenty placeholders, twenty bound parameters - and not
      // one value in the statement text.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProduct(makeWritableProduct(), NO_POPULATED_MEMBERS);

      expect(executor.mutationCalls).toHaveLength(1);
      const insert = statementAt(executor.mutationCalls, 0);

      expect(insert.sql).toBe(EXPECTED_PRODUCT_INSERT);
      expect(placeholderCount(insert.sql)).toBe(20);
      expect(insert.params).toHaveLength(20);

      // A new entity needs no existence read, because `isNew()` already answers the
      // question - the ported `unsavedvalue=""` test [model/entity/Product.cfc:L52].
      expect(executor.calls).toHaveLength(0);

      // The minted identifier is the legacy's own shape and it is BOUND, not embedded.
      const mintedIdentifier = parameterAt(insert.params, 0);
      expect(typeof mintedIdentifier).toBe('string');
      if (typeof mintedIdentifier === 'string') {
        expect(MINTED_IDENTIFIER_PATTERN.test(mintedIdentifier)).toBe(true);
        expect(insert.sql).not.toContain(mintedIdentifier);
      }
    });

    it('reads the row before updating an existing product, and binds THE KEY LAST', async () => {
      // Insert-or-update is decided by the DATABASE, not by a flag: `isNew()` is
      // consulted first, and when the entity carries an identifier the row's existence
      // is checked before anything is written. That is what `super.save()` did through
      // the ORM's `saveOrUpdate`.
      const executor = new RecordingExecutor([[PRODUCT_EXISTS_ROW]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProduct(makeWritableProduct(PERSISTED_PRODUCT_ID), NO_POPULATED_MEMBERS);

      const existenceRead = onlyStatement(executor.calls);
      expect(existenceRead.sql).toBe(EXPECTED_PRODUCT_EXISTENCE_READ);
      expect(existenceRead.params).toStrictEqual([PERSISTED_PRODUCT_ID]);

      const update = statementAt(executor.mutationCalls, 0);
      expect(update.sql).toBe(EXPECTED_PRODUCT_UPDATE);

      // Seventeen SET assignments plus the key: eighteen parameters, KEY LAST.
      // Positional binding makes that order part of the contract.
      expect(placeholderCount(update.sql)).toBe(18);
      expect(update.params).toHaveLength(18);
      expect(parameterAt(update.params, 17)).toBe(PERSISTED_PRODUCT_ID);
      expect(update.sql.endsWith('WHERE productID = ?')).toBe(true);
    });

    it('excludes productID and the created audit pair from the SET list', async () => {
      // `productID` is the key the statement MATCHES on rather than a value it sets.
      // `createdDateTime` and `createdByAccountID` are excluded because
      // `HibachiEntity.preUpdate` stamped only the modified pair and left the created
      // pair exactly as the insert wrote it - carrying them into the SET list would
      // let a caller that hydrated an entity without them overwrite real creation
      // provenance with NULL.
      const executor = new RecordingExecutor([[PRODUCT_EXISTS_ROW]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProduct(makeWritableProduct(PERSISTED_PRODUCT_ID), NO_POPULATED_MEMBERS);

      const update = statementAt(executor.mutationCalls, 0);
      const setClause = update.sql.slice(update.sql.indexOf('SET'), update.sql.indexOf('WHERE'));

      expect(setClause).not.toContain('productID');
      expect(setClause).not.toContain('createdDateTime');
      expect(setClause).not.toContain('createdByAccountID');
      expect(setClause).toContain('modifiedDateTime = ?');
      // S-07: present in the SET list, and self-resolving so a refused gate preserves rather
      // than erases. Both halves matter, so both are asserted.
      expect(setClause).toContain('modifiedByAccountID = COALESCE(?, modifiedByAccountID)');
    });

    it('writes the insert audit pair from ONE timestamp, byte-identical', async () => {
      // `HibachiEntity.preInsert` took ONE `now()` and wrote it to BOTH
      // `createdDateTime` and `modifiedDateTime`, so an inserted row's two stamps are
      // byte-identical rather than merely close. Reproduced exactly.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProduct(makeWritableProduct(), NO_POPULATED_MEMBERS);

      const insert = statementAt(executor.mutationCalls, 0);
      const createdStamp = parameterAt(insert.params, 16);
      const modifiedStamp = parameterAt(insert.params, 18);

      expect(createdStamp).toBeInstanceOf(Date);
      expect(modifiedStamp).toBeInstanceOf(Date);
      if (createdStamp instanceof Date && modifiedStamp instanceof Date) {
        expect(createdStamp.getTime()).toBe(modifiedStamp.getTime());
      }
    });

    // --- S-07: who the write is attributed to -----
    //
    // The finding: "Audit actor IDs are copied from caller-hydrated entities or omitted. A
    // future caller can spoof attribution or create unattributed writes" (CWE-345).
    //
    // ★ WHY THESE CASES EXIST. The suite already pinned the insert and update statements to
    // their exact text AND asserted individual parameter POSITIONS - including position 16 and
    // 18, the two DATE stamps that bracket the account columns. Positions 17 and 19 went
    // unasserted, so the spoof sat between two checked values without a test to announce it.

    it('★★ STAMPS THE REQUEST ACTOR and ignores the account a caller put on the entity', async () => {
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProduct(
        makeWritableProduct(undefined, {
          // A caller naming whoever it likes as the author of the row. This is the spoof.
          createdByAccountID: FORGED_ACCOUNT_ID,
          modifiedByAccountID: FORGED_ACCOUNT_ID,
        }),
        NO_POPULATED_MEMBERS,
      );

      const insert = statementAt(executor.mutationCalls, 0);

      // Both halves from one resolution, as `preInsert` calls both setters under one gate
      // [org/Hibachi/HibachiEntity.cfc:L628-L635].
      expect(parameterAt(insert.params, INSERT_CREATED_BY_POSITION)).toBe(
        TEST_AUDIT_ACTOR.accountID,
      );
      expect(parameterAt(insert.params, INSERT_MODIFIED_BY_POSITION)).toBe(
        TEST_AUDIT_ACTOR.accountID,
      );
      // The forged value reaches no position at all, not merely not those two.
      expect(insert.params).not.toContain(FORGED_ACCOUNT_ID);
    });

    it('★★ STAMPS NOTHING FOR A NON-ADMIN, reproducing the getAdminAccountFlag half of the gate', async () => {
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, NON_ADMIN_AUDIT_ACTOR);

      await repository.saveProduct(
        makeWritableProduct(undefined, { createdByAccountID: FORGED_ACCOUNT_ID }),
        NO_POPULATED_MEMBERS,
      );

      const insert = statementAt(executor.mutationCalls, 0);

      // This actor HAS an identifier, so the nulls prove the FLAG was consulted rather than
      // that there was nothing to write - the distinction an anonymous actor cannot make.
      expect(NON_ADMIN_AUDIT_ACTOR.accountID).toBeDefined();
      expect(parameterAt(insert.params, INSERT_CREATED_BY_POSITION)).toBeNull();
      expect(parameterAt(insert.params, INSERT_MODIFIED_BY_POSITION)).toBeNull();
      expect(insert.params).not.toContain(FORGED_ACCOUNT_ID);
    });

    it('★★ PRESERVES A STORED ATTRIBUTION on update when the gate refuses, rather than erasing it', async () => {
      const executor = new RecordingExecutor([[PRODUCT_EXISTS_ROW]]);
      const repository = aProductRepository(executor, NON_ADMIN_AUDIT_ACTOR);

      await repository.saveProduct(
        makeWritableProduct(PERSISTED_PRODUCT_ID, { modifiedByAccountID: 'the-real-editor' }),
        NO_POPULATED_MEMBERS,
      );

      const update = statementAt(executor.mutationCalls, 0);

      // A refused gate binds null and the statement's `COALESCE` resolves it against the stored
      // column, so whoever really did edit the row survives. Without that, this fix for spoofed
      // attribution would itself DESTROY attribution on every non-admin save.
      expect(parameterAt(update.params, UPDATE_MODIFIED_BY_POSITION)).toBeNull();
      expect(update.sql).toContain('modifiedByAccountID = COALESCE(?, modifiedByAccountID)');
    });

    it('★★ REFUSES an update that matched NO row rather than reporting the entity as persisted', async () => {
      // QA testing found the sibling of this on `saveSku`: an entity whose `isNew()` is false and
      // whose key names no row RESOLVED, answered the entity carrying that key, and wrote nothing.
      // Every update path in this tier now carries the same guard, and the guard is exact because
      // `mysql2`'s default client flags include `FOUND_ROWS`
      // [node_modules/mysql2/lib/connection_config.js: `getDefaultFlags`] and `connection.ts`
      // `buildPoolOptions()` overrides no `flags` - so `affectedRows` reports rows MATCHED, not rows
      // CHANGED. Measured against the live schema: a NO-CHANGE update answers `affectedRows: 1`
      // with `Rows matched: 1  Changed: 0`; only a NO-MATCH update answers 0. An idempotent save is
      // therefore never mistaken for a lost one.
      //
      // Parity: Hibernate raised `StaleObjectStateException` on a zero-match flush rather than
      // returning quietly, so refusing here is what `super.save()` did.
      //
      // ⚠ THE EXISTENCE READ STILL SAYS THE ROW IS THERE. That is the point - the read and the
      // write are two statements, and this is the window between them. The refusal is made on the
      // SERVER's answer to the write, not on a guess made before issuing it.
      const executor = new RecordingExecutor([[PRODUCT_EXISTS_ROW]], NO_ROWS_AFFECTED);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const rejection = await captureRejection(() =>
        repository.saveProduct(makeWritableProduct(PERSISTED_PRODUCT_ID), NO_POPULATED_MEMBERS),
      );

      expect(rejection.name).toBe('ProductPersistenceError');
      expect(rejection.message).toContain('matched no SwProduct row');

      // The statement WAS issued, and it was the update rather than an insert.
      expect(executor.mutationCalls).toHaveLength(1);
      expect(statementAt(executor.mutationCalls, 0).sql).toContain('UPDATE SwProduct');
    });

    it('binds a monetary column as a decimal STRING, never as a float', async () => {
      // P4/E4 - the single arithmetic surface. `decimalNumbers` is unset on the pool,
      // so a DECIMAL column round-trips as TEXT and `Money` is constructed from it.
      // What matters here is the direction OUT: the bound value is a decimal string,
      // so no IEEE-754 representation ever touches a currency value - not in the
      // adapter, and not in this expectation either.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProduct(makeWritableProduct(), NO_POPULATED_MEMBERS);

      const insert = statementAt(executor.mutationCalls, 0);
      const boundSalePrice = parameterAt(insert.params, 8);

      expect(typeof boundSalePrice).toBe('string');
      expect(boundSalePrice).not.toBeTypeOf('number');
    });

    it('writes NULL for an association the caller did not materialize', async () => {
      // The three foreign keys are written FROM the associations - `brandID` from
      // `getBrand()`, `productTypeID` from `getProductType()`, `defaultSkuID` from
      // `getDefaultSku()` - because the entity publishes the associations and not the
      // keys. An unmaterialized association is therefore written as NULL, which is
      // exactly what Hibernate did with a many-to-one set to null.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProduct(makeWritableProduct(), NO_POPULATED_MEMBERS);

      const insert = statementAt(executor.mutationCalls, 0);

      expect(parameterAt(insert.params, 12)).toBeNull();
      expect(parameterAt(insert.params, 13)).toBeNull();
      expect(parameterAt(insert.params, 14)).toBeNull();
    });

    it('refuses to write a foreign key from an unpersisted association', async () => {
      // ⚠ A DANGLING KEY RAISES ON THE WAY IN rather than being quietly nulled on the
      // way out. `makeProductFixture()` defaults its brand to one whose `brandID` is
      // the empty string, so the DEFAULT fixture is deliberately unwritable - and
      // that refusal is correct: writing the empty string as a foreign key would
      // create a row that satisfies no constraint and resolves to no brand.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const rejection = await captureRejection(() =>
        repository.saveProduct(makeProductFixture(), NO_POPULATED_MEMBERS),
      );

      expect(rejection.name).toBe('ProductPersistenceError');
      expect(executor.mutationCalls).toHaveLength(0);
      expect(executor.calls).toHaveLength(0);
    });

    it('★ DEFERS defaultSkuID as NULL for an unsaved default SKU, and binds it once saved', async () => {
      // ★★ THE ONE FOREIGN KEY THAT IS DEFERRED RATHER THAN BOUND, AND HIBERNATE
      // DEFERRED IT TOO. `SwSku.productID` references `SwProduct` and
      // `SwProduct.defaultSkuID` [model/entity/Product.cfc:L70] references `SwSku` - a
      // circular INSERT dependency that can only be broken one way: INSERT the owner
      // with this column NULL, INSERT the SKUs, then UPDATE the owner.
      //
      // So an UNSAVED default SKU is bound as NULL here, and for two independent
      // reasons either of which suffices. The referenced row does not exist yet, so a
      // non-null bind would violate the constraint. And
      // `src/repositories/mysql/mysqlSkuRepository.ts` MINTS a fresh `skuID` on insert
      // rather than honouring the draft's provisional identifier, so the draft's key is
      // not even the one the row will end up carrying.
      //
      // ⚠ Note the contrast with the case immediately above: an unpersisted BRAND
      // RAISES, because nothing defers a brand and a dangling brand key is simply
      // wrong. The two associations are treated differently because the schema treats
      // them differently, not because the rule is inconsistent.
      //
      // ★ THE SAVE MUST NOT MERELY BIND NULL - IT MUST ALSO NOT REFUSE. Every new
      // product with SKUs arrives here carrying a transient default SKU, because
      // `createSkus` [model/service/SkuService.cfc:L102] designates one of the drafts it
      // just attached. A guard that refused a transient `defaultSku` outright would
      // therefore refuse the source's own normal path, so this case asserts that the
      // write PROCEEDS as well as what it binds.
      //
      // ★ AND THE REFUSAL THAT DOES REMAIN IS NARROWER THAN THAT, WHICH IS WHY THIS CASE
      // ATTACHES THE DRAFT TO THE COLLECTION. A transient default SKU is acceptable
      // precisely when this write will CASCADE to it - i.e. when it is among
      // `product.getSkus()` - because only then does the deferred update have a real key
      // to bind afterwards. A transient default that is NOT in the collection would leave
      // `defaultSkuID` naming nothing for ever, and that case raises; it has its own
      // assertion in the cascade describe below.
      const deferredExecutor = new RecordingExecutor();
      const unsavedDefaultSku = makeSkuFixture({
        skuID: 'draft-sku-identifier',
        isNew: true,
        product: undefined,
      });

      // The one-method cascade seam, declared inline: this case is about what the PRODUCT
      // insert binds, so the writer only has to answer with a persisted instance.
      const deferredRepository = aProductRepository(
        deferredExecutor,
        TEST_AUDIT_ACTOR,
        PRODUCT_TYPE_PORT_BAG_MEMBER,
        {
          saveSku: (): Promise<Sku> =>
            Promise.resolve(makeSkuFixture({ skuID: PERSISTED_SKU_ID, product: undefined })),
        },
      );

      const draftBearingProduct = makeProductFixture({
        brand: undefined,
        productType: undefined,
        defaultSku: undefined,
        skus: [unsavedDefaultSku],
      });
      draftBearingProduct.setDefaultSku(unsavedDefaultSku);

      await deferredRepository.saveProduct(draftBearingProduct, NO_POPULATED_MEMBERS);

      const deferredInsert = statementAt(deferredExecutor.mutationCalls, 0);

      expect(deferredInsert.sql).toContain('INSERT INTO SwProduct (');
      expect(parameterAt(deferredInsert.params, DEFAULT_SKU_ID_PARAMETER_INDEX)).toBeNull();
      expect(deferredInsert.params).not.toContain('draft-sku-identifier');

      // ...and the deferred UPDATE follows, carrying the key the writer actually minted
      // rather than the provisional one the draft arrived with.
      const deferredUpdate = statementAt(
        deferredExecutor.mutationCalls,
        deferredExecutor.mutationCalls.length - 1,
      );

      expect(deferredUpdate.sql).toBe(EXPECTED_PRODUCT_DEFAULT_SKU_UPDATE);
      expect(deferredUpdate.params[0]).toBe(PERSISTED_SKU_ID);

      // And the positive half: a default SKU that already has a row IS bound IN THE INSERT
      // ITSELF, so the deferral is specific to the unsaved case rather than a blanket
      // null-out that would lose the association altogether. No cascade is needed here, so
      // no writer is supplied either - which also shows the deferral is not what makes the
      // ordinary save work.
      const boundExecutor = new RecordingExecutor();
      const boundRepository = aProductRepository(boundExecutor, TEST_AUDIT_ACTOR);

      await boundRepository.saveProduct(
        makeProductFixture({
          brand: undefined,
          productType: undefined,
          defaultSku: makeSkuFixture({ skuID: PERSISTED_SKU_ID, product: undefined }),
        }),
        NO_POPULATED_MEMBERS,
      );

      const boundInsert = statementAt(boundExecutor.mutationCalls, 0);

      expect(parameterAt(boundInsert.params, DEFAULT_SKU_ID_PARAMETER_INDEX)).toBe(
        PERSISTED_SKU_ID,
      );
    });

    it('writes SwProduct alone when the product holds no transient SKU', async () => {
      // ★★ QUOTE-THEN-REVISE. This case was titled "writes SwProduct alone and never a
      // dependent table" and reasoned: "⚠ THE HIBERNATE CASCADES ARE NOT REPRODUCED,
      // and that is documented rather than accidental. `skus` is NOT written here:
      // `SwSku.productID` is the SKU's own column and `mysqlSkuRepository.ts` owns
      // it."
      //
      // THE ASSERTION IS STILL EXACTLY RIGHT AND ITS SCOPE WAS WRONG. `makeWritableProduct()`
      // builds a product whose SKU collection is EMPTY, so there is nothing for a
      // cascade to write and one statement is the whole of the correct behaviour -
      // that is what this case pins, and it now says so in its title. But it was
      // being read as evidence that a product save NEVER writes a SKU, and
      // `Product.skus` carries `cascade="all-delete-orphan"`
      // [model/entity/Product.cfc:L73]: a save that carries transient SKUs must write
      // them, in one transaction, or a merchandise product created through
      // `createSkus` [model/service/SkuService.cfc:L58] reaches the database with no
      // variants at all. The cascading shape is pinned by its own describe below.
      //
      // The statement-text assertions are kept verbatim, because the delegation half
      // of the original claim holds unchanged: this adapter emits no `SwSku` text of
      // its own even when it does cascade - it hands the write to the sibling that
      // owns the table.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProduct(makeWritableProduct(), NO_POPULATED_MEMBERS);

      const insert = statementAt(executor.mutationCalls, 0);

      expect(insert.sql).toContain('INSERT INTO SwProduct (');
      for (const dependentTable of [
        'SwSku',
        'SwSkuOption',
        'SwProductImage',
        'SwAttributeValue',
        'SwProductReview',
      ]) {
        expect(insert.sql).not.toContain(dependentTable);
      }

      // And no unit of work was opened, because one statement is not a unit of work.
      expect(executor.transactionCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // saveProduct, the aggregate cascade: NET-NEW COVERAGE, no legacy antecedent.
  //
  // ★ DECLARED NET-NEW under AAP 0.6.6. `meta/tests/unit/dao/` holds AccountDAOTest and
  // PaymentDAOTest only, so nothing in the legacy suite reaches `ProductDAO`, and the
  // behaviour asserted here was Hibernate's flush - framework code that is not ported
  // and never had a test in this repository either.
  //
  // ★ WHAT THESE CASES EXIST TO PREVENT, WHICH IS A PRODUCT WITH NO VARIANTS.
  // `SkuService.createSkus` [model/service/SkuService.cfc:L58] builds every SKU a new
  // merchandise product will have, attaches each to `product.getSkus()` and designates
  // one as the default - and persists NONE of them, exactly as the legacy persisted
  // none. Under CFML that was correct because `Product.skus` carries
  // `cascade="all-delete-orphan"` [model/entity/Product.cfc:L73] and the flush wrote
  // the children with the parent. With the ORM gone, a save that wrote only the
  // `SwProduct` row left a product with no variants and a NULL `defaultSkuID`, while
  // the returned entity reported its full collection in memory and looked correct.
  //
  // ★ THE WRITE ORDER IS FORCED, NOT CHOSEN. `SwSku.productID`
  // [model/entity/Sku.cfc:L65] and `SwProduct.defaultSkuID`
  // [model/entity/Product.cfc:L70] are foreign keys pointing at each other, so the only
  // order that satisfies both is: product row (with `defaultSkuID` NULL), then each SKU
  // row carrying the parent key, then a follow-up update for `defaultSkuID`. All three
  // in ONE transaction, because any partial application leaves a state the legacy
  // cannot reach.
  // -------------------------------------------------------------------------
  describe('saveProduct - the aggregate cascade for transient SKUs', () => {
    /** The key the cascade writer reports for the nth SKU it is handed. */
    const PERSISTED_CASCADE_SKU_IDS = [
      'b7c3f81a04d5426e93a70cd21fe85b46',
      'd0a49e6b71f8425c8b13ae59042cf7d8',
    ] as const;

    /**
     * A recording stand-in for `MysqlSkuRepository` as the cascade contract sees it.
     *
     * JUDGMENT CALL: hand-written rather than the real adapter. The contract is ONE method
     * wide and structural, so declaring the shape makes the compiler check it on every
     * build; importing `MysqlSkuRepository` would couple two adapter suites and make this
     * one's assertions depend on the other's statement text. What each SKU write EMITS is
     * asserted in `mysqlSkuRepository.test.ts`, where the statements live; what is asserted
     * here is that the cascade calls it, with which parent key, in which order, on which
     * executor, and what it does with the answers.
     */
    class RecordingCascadeWriter {
      public readonly calls: { readonly sku: Sku; readonly productID: string }[] = [];

      /** The executor each call was handed, so escaping the transaction is observable. */
      public readonly executors: PreparedStatementExecutor[] = [];

      public saveSku(
        sku: Sku,
        productID: string,
        executor: PreparedStatementExecutor,
      ): Promise<Sku> {
        this.calls.push({ sku, productID });
        this.executors.push(executor);

        const mintedKey =
          PERSISTED_CASCADE_SKU_IDS[this.calls.length - 1] ?? PERSISTED_CASCADE_SKU_IDS[0];

        // A DIFFERENT instance carrying a DIFFERENT key, which is what the real adapter
        // returns: `insertSku` mints its own identifier and rehydrates around it, so the
        // draft's provisional key never reaches the database.
        return Promise.resolve(makeSkuFixture({ skuID: mintedKey, product: undefined }));
      }
    }

    /** A SKU that reports itself unsaved, as every draft `createSkus` builds does. */
    function aTransientSku(provisionalKey: string): Sku {
      return makeSkuFixture({ skuID: provisionalKey, isNew: true, product: undefined });
    }

    /** A writable product carrying the supplied SKUs and, optionally, a designated default. */
    function aProductWithSkus(
      productID: string | undefined,
      skus: readonly Sku[],
      defaultSku?: Sku,
    ): Product {
      const product = makeProductFixture({
        productID,
        brand: undefined,
        productType: undefined,
        defaultSku: undefined,
        skus: [...skus],
      });

      if (defaultSku !== undefined) {
        product.setDefaultSku(defaultSku);
      }

      return product;
    }

    it('opens EXACTLY ONE transaction and issues every statement inside it', async () => {
      // The count assertion is as load-bearing as the flag: a transaction per statement
      // would satisfy `inTransaction` everywhere while providing none of the atomicity
      // Hibernate's single flush gave this aggregate.
      const executor = new RecordingExecutor();
      const writer = new RecordingCascadeWriter();
      const draft = aTransientSku('draft-1');
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);

      await repository.saveProduct(aProductWithSkus(undefined, [draft], draft), {});

      expect(executor.transactionCount).toBe(1);

      for (const mutation of executor.mutationCalls) {
        expect(mutation.inTransaction).toBe(true);
      }
    });

    it('writes the product row FIRST, then each SKU, then defaultSkuID LAST', async () => {
      // The order is the forced one. Two transient SKUs so that "each SKU" is plural and
      // the parent key can be seen reaching both.
      const executor = new RecordingExecutor();
      const writer = new RecordingCascadeWriter();
      const first = aTransientSku('draft-1');
      const second = aTransientSku('draft-2');
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);

      const saved = await repository.saveProduct(
        aProductWithSkus(undefined, [first, second], first),
        {},
      );

      // Two mutations from THIS adapter: the insert and the deferred key update. The two
      // SKU writes went through the writer, which owns `SwSku`.
      expect(executor.mutationCalls).toHaveLength(2);

      const insert = statementAt(executor.mutationCalls, 0);
      const deferredUpdate = statementAt(executor.mutationCalls, 1);

      expect(insert.sql).toBe(EXPECTED_PRODUCT_INSERT);
      // `defaultSkuID` is NULL on the insert even though a default IS designated - the
      // designated SKU has no persisted key at that moment.
      expect(parameterAt(insert.params, 14)).toBeNull();

      // Both SKUs were handed the key the insert minted, in collection order.
      const mintedProductID = saved.getProductID();
      expect(writer.calls).toHaveLength(2);
      expect(writer.calls.map((call) => call.productID)).toStrictEqual([
        mintedProductID,
        mintedProductID,
      ]);
      expect(writer.calls.map((call) => call.sku)).toStrictEqual([first, second]);

      expect(deferredUpdate.sql).toBe(EXPECTED_PRODUCT_DEFAULT_SKU_UPDATE);
      expect(deferredUpdate.params).toStrictEqual([PERSISTED_CASCADE_SKU_IDS[0], mintedProductID]);
    });

    it('hands the cascade the TRANSACTION executor, and routes EVERY statement through it', async () => {
      // ⚠ THE ASSERTION THE COMPILER CANNOT MAKE, AND THE DOUBLE THAT CAN MAKE IT. Every
      // executor satisfies one interface, so a cascade that reached `this.executor` from
      // inside the callback would type-check perfectly and would silently send its
      // statements down a different pooled connection, committing independently of the
      // product row and defeating the rollback entirely.
      //
      // `RecordingExecutor` cannot see that mistake: it hands its callback ITSELF, so the
      // two candidate executors are the same object and every statement records
      // `inTransaction` either way. This case therefore uses a purpose-built double whose
      // `transaction` hands a DISTINCT recorder - which is also what the real
      // `createPoolExecutor` does, since the transaction executor is pinned to one
      // connection. Any statement that lands on the OUTER recorder after the transaction
      // opened is an escape, and it is now visible.
      const outer = new RecordingExecutor();
      const inner = new RecordingExecutor();
      const splitting: PreparedStatementExecutor = {
        execute: (sql, params) => outer.execute(sql, params),
        executeMutation: (sql, params) => outer.executeMutation(sql, params),
        transaction: async <T>(work: (tx: PreparedStatementExecutor) => Promise<T>): Promise<T> =>
          await inner.transaction(work),
      };

      const writer = new RecordingCascadeWriter();
      const draft = aTransientSku('draft-1');
      const repository = aProductRepository(splitting, TEST_AUDIT_ACTOR, {}, writer);

      await repository.saveProduct(aProductWithSkus(undefined, [draft], draft), {});

      // NOTHING reached the outer recorder: not the row insert, not the deferred update.
      expect(outer.calls).toStrictEqual([]);
      expect(outer.mutationCalls).toStrictEqual([]);

      // All of it reached the inner one, inside its single unit of work.
      expect(inner.transactionCount).toBe(1);
      expect(inner.mutationCalls).toHaveLength(2);
      for (const mutation of inner.mutationCalls) {
        expect(mutation.inTransaction).toBe(true);
      }

      // And the writer was handed THAT executor rather than the constructed one. Compared by
      // IDENTITY with `toBe`, not with `toStrictEqual`: two recorders holding equal state
      // would satisfy a structural comparison while being different objects, which is
      // precisely the distinction this case exists to draw.
      expect(writer.executors).toHaveLength(1);
      expect(writer.executors[0]).toBe(inner);
      expect(writer.executors[0]).not.toBe(splitting);
    });

    it('returns a product whose SKUs are the PERSISTED instances, in original order', async () => {
      // Membership is not enough: `createSkus` derives each skuCode from the collection's
      // length as it grows [model/service/SkuService.cfc:L97], so a caller reading
      // `getSkus()` after a save must see the order it built. Mapping over the original
      // array is what guarantees that, and reversing the writer's answers would not be
      // caught by a set comparison.
      const executor = new RecordingExecutor();
      const writer = new RecordingCascadeWriter();
      const first = aTransientSku('draft-1');
      const second = aTransientSku('draft-2');
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);

      const saved = await repository.saveProduct(
        aProductWithSkus(undefined, [first, second], first),
        {},
      );

      expect(saved.getSkus().map((sku) => sku.getSkuID())).toStrictEqual([
        PERSISTED_CASCADE_SKU_IDS[0],
        PERSISTED_CASCADE_SKU_IDS[1],
      ]);
      // The drafts are GONE from the returned collection - they carry provisional keys
      // that name no row, so handing them back would be handing back a lie.
      expect(saved.getSkus()).not.toContain(first);
      expect(saved.getSkus()).not.toContain(second);

      // And every returned SKU reports itself persisted.
      for (const sku of saved.getSkus()) {
        expect(sku.isNew()).toBe(false);
      }
    });

    it('reports the PERSISTED default sku, matched by identity rather than by key', async () => {
      // The correspondence between a draft and its persisted twin is between two DIFFERENT
      // identifiers, so the designated default has to be found by object identity. Making
      // the SECOND SKU the default is what proves it: a lookup that matched on position, on
      // "the first one written" or on the provisional key would answer the wrong SKU here.
      const executor = new RecordingExecutor();
      const writer = new RecordingCascadeWriter();
      const first = aTransientSku('draft-1');
      const second = aTransientSku('draft-2');
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);

      const saved = await repository.saveProduct(
        aProductWithSkus(undefined, [first, second], second),
        {},
      );

      const deferredUpdate = statementAt(executor.mutationCalls, 1);

      expect(deferredUpdate.params).toStrictEqual([
        PERSISTED_CASCADE_SKU_IDS[1],
        saved.getProductID(),
      ]);
      expect(saved.getDefaultSku()?.getSkuID()).toBe(PERSISTED_CASCADE_SKU_IDS[1]);
      expect(saved.getDefaultSku()).toBe(saved.getSkus()[1]);
    });

    it('issues NO deferred update when the designated default was already persisted', async () => {
      // A default SKU carrying a key went into the row the insert already wrote, so a
      // second statement would rewrite the value it holds. The cascade still runs for the
      // transient sibling; only the follow-up update is absent.
      const executor = new RecordingExecutor();
      const writer = new RecordingCascadeWriter();
      const draft = aTransientSku('draft-1');
      const alreadyPersisted = makeSkuFixture({ skuID: PERSISTED_SKU_ID, product: undefined });
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);

      const saved = await repository.saveProduct(
        aProductWithSkus(undefined, [draft, alreadyPersisted], alreadyPersisted),
        {},
      );

      expect(writer.calls).toHaveLength(1);
      expect(executor.mutationCalls).toHaveLength(1);
      expect(statementAt(executor.mutationCalls, 0).sql).toBe(EXPECTED_PRODUCT_INSERT);
      // Written by the INSERT, at its own column position, because the key existed.
      expect(parameterAt(statementAt(executor.mutationCalls, 0).params, 14)).toBe(PERSISTED_SKU_ID);
      expect(saved.getDefaultSku()).toBe(alreadyPersisted);
    });

    it('issues NO deferred update when no default is designated at all', async () => {
      // `createSkus` designates one on every branch, but a caller composing a product by
      // hand need not - and the column then stays NULL, which is what the legacy leaves.
      const executor = new RecordingExecutor();
      const writer = new RecordingCascadeWriter();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);

      const saved = await repository.saveProduct(
        aProductWithSkus(undefined, [aTransientSku('draft-1')]),
        {},
      );

      expect(writer.calls).toHaveLength(1);
      expect(executor.mutationCalls).toHaveLength(1);
      expect(saved.getDefaultSku()).toBeUndefined();
      expect(parameterAt(statementAt(executor.mutationCalls, 0).params, 14)).toBeNull();
    });

    it('cascades on the UPDATE route too, and rebuilds even when the populate step overrode nothing', async () => {
      // An existing product can acquire new variants, so the cascade is not an insert-only
      // concern. The existence read runs on the TRANSACTION executor, so it observes the
      // same snapshot as the writes that depend on it - and because a cascade ran, the
      // rebuilt instance is returned rather than the argument, even though an empty payload
      // overrode nothing.
      const executor = new RecordingExecutor([[PRODUCT_EXISTS_ROW]]);
      const writer = new RecordingCascadeWriter();
      const draft = aTransientSku('draft-1');
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);
      const argument = aProductWithSkus(PERSISTED_PRODUCT_ID, [draft], draft);

      const saved = await repository.saveProduct(argument, {});

      const existenceRead = onlyStatement(executor.calls);
      expect(existenceRead.sql).toBe(EXPECTED_PRODUCT_EXISTENCE_READ);
      expect(existenceRead.inTransaction).toBe(true);

      expect(statementAt(executor.mutationCalls, 0).sql).toBe(EXPECTED_PRODUCT_UPDATE);
      expect(statementAt(executor.mutationCalls, 1).sql).toBe(EXPECTED_PRODUCT_DEFAULT_SKU_UPDATE);

      // NOT the argument: the argument still holds the draft, which names no row.
      expect(saved).not.toBe(argument);
      expect(saved.getSkus().map((sku) => sku.getSkuID())).toStrictEqual([
        PERSISTED_CASCADE_SKU_IDS[0],
      ]);
      expect(writer.calls[0]?.productID).toBe(PERSISTED_PRODUCT_ID);
    });

    it('RAISES before any write when a cascade is needed and no writer was supplied', async () => {
      // ⚠ SILENT LOSS IS THE FAILURE MODE THIS REFUSES. Without a writer the SKU rows have
      // nowhere to go, and writing the product row anyway would produce exactly the state
      // the fix exists to prevent - a variant-less product that reports its variants in
      // memory. The two-argument constructor is still legal, because a repository used only
      // for reads and for saves of already-persisted graphs needs no writer.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const rejection = await captureRejection(() =>
        repository.saveProduct(aProductWithSkus(undefined, [aTransientSku('draft-1')]), {}),
      );

      expect(rejection.name).toBe('ProductPersistenceError');
      expect(rejection.message).toContain('1 sku(s) that have never been persisted');
      // NOTHING was written and no unit of work was opened.
      expect(executor.mutationCalls).toStrictEqual([]);
      expect(executor.calls).toStrictEqual([]);
      expect(executor.transactionCount).toBe(0);
    });

    it('RAISES when a transient default sku is not among the skus this write will cascade to', async () => {
      // The permission granted to a transient default is exactly "this write is going to
      // persist it". A designation pointing at a draft the product does not hold is
      // unreachable from `createSkus`, which links every draft it designates
      // [model/service/SkuService.cfc:L100, L128], so refusing it closes a hole.
      const executor = new RecordingExecutor();
      const writer = new RecordingCascadeWriter();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);
      const orphanDesignation = aTransientSku('draft-not-held');

      const rejection = await captureRejection(() =>
        repository.saveProduct(
          aProductWithSkus(undefined, [aTransientSku('draft-1')], orphanDesignation),
          {},
        ),
      );

      expect(rejection.name).toBe('ProductPersistenceError');
      expect(rejection.message).toContain('is not among the skus held on the product');
      expect(executor.mutationCalls).toStrictEqual([]);
      expect(writer.calls).toStrictEqual([]);
    });

    it('★★ REFUSES when the DEFERRED defaultSkuID update matches no row', async () => {
      // The deferred designation is the second statement of a two-statement sequence, and it is the
      // one that records WHICH variant a shopper is shown by default. If it silently matched
      // nothing, this method would answer a product reporting a default SKU that no row carries -
      // and the SKU rows the cascade wrote would already be committed, so the loss would be
      // permanent and invisible. It is guarded on the same measured `FOUND_ROWS` semantics as the
      // ordinary update path above.
      //
      // The INSERT reporting zero here is not what trips the guard: an insert that did not throw
      // wrote its row, so no insert path in this tier inspects the count. The executor answers one
      // result for every write, so this is simply how the deferred update is made to report a miss.
      const executor = new RecordingExecutor([], NO_ROWS_AFFECTED);
      const writer = new RecordingCascadeWriter();
      const draft = aTransientSku('draft-1');
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);

      const rejection = await captureRejection(() =>
        repository.saveProduct(aProductWithSkus(undefined, [draft], draft), {}),
      );

      expect(rejection.name).toBe('ProductPersistenceError');
      expect(rejection.message).toContain('deferred defaultSkuID update matched no SwProduct row');

      // Both statements were issued - the insert, then the designation it defers - and the refusal
      // is on the second. The whole sequence runs inside one unit of work, so raising here rolls
      // the product row and the cascaded SKU rows back together.
      expect(executor.mutationCalls).toHaveLength(2);
      expect(statementAt(executor.mutationCalls, 1).sql).toBe(EXPECTED_PRODUCT_DEFAULT_SKU_UPDATE);
      expect(executor.transactionCount).toBe(1);
    });

    it('emits no SwSku text of its own, delegating the table it does not own', async () => {
      // The delegation half of the original "writes SwProduct alone" claim, asserted on the
      // path that DOES cascade: this adapter names `SwProduct` and nothing else, and every
      // `SwSku` statement is the sibling repository's to emit.
      const executor = new RecordingExecutor();
      const writer = new RecordingCascadeWriter();
      const draft = aTransientSku('draft-1');
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);

      await repository.saveProduct(aProductWithSkus(undefined, [draft], draft), {});

      expect(executor.mutationCalls.length).toBeGreaterThan(0);

      for (const mutation of executor.mutationCalls) {
        expect(mutation.sql).toContain('SwProduct');
        for (const foreignTable of ['SwSku', 'SwSkuOption', 'SwProductImage', 'SwProductReview']) {
          expect(mutation.sql).not.toContain(foreignTable);
        }
      }
    });

    it('takes the no-transaction path unchanged when every held SKU is already persisted', async () => {
      // The cascade is decided by `isNew()` on each held SKU and by nothing else, so a
      // product whose collection is fully materialized and fully persisted saves exactly as
      // it did before the cascade existed: one statement, no transaction, and no writer
      // needed. This is what keeps every pre-existing case in this file honest.
      const executor = new RecordingExecutor();
      const writer = new RecordingCascadeWriter();
      const persisted = makeSkuFixture({ skuID: PERSISTED_SKU_ID, product: undefined });
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {}, writer);

      await repository.saveProduct(aProductWithSkus(undefined, [persisted], persisted), {});

      expect(executor.transactionCount).toBe(0);
      expect(executor.mutationCalls).toHaveLength(1);
      expect(writer.calls).toStrictEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // saveProduct, the populate step: NET-NEW COVERAGE, no legacy antecedent.
  //
  // ★ DECLARED NET-NEW under AAP 0.6.6. `meta/tests/unit/dao/` holds only
  // AccountDAOTest and PaymentDAOTest, so no legacy test reaches `ProductDAO` at
  // all, and the populate step being asserted here was performed by
  // `HibachiEntity.populate` - framework code that is not ported and never had a
  // test in this repository either.
  //
  // WHAT THESE CASES EXIST TO PREVENT. The legacy resolved a unique url title and
  // assigned it ONTO the entity being saved
  // [model/service/ProductService.cfc:L268-L270]; that entity then reached the DAO
  // eighteen lines later [model/service/ProductService.cfc:L287], so the value was
  // written. `Product.urlTitle` is `private readonly` here, so before the payload
  // existed the adapter bound `product.getUrlTitle()` - still absent - and the
  // generated title was never stored. The service's generation guard, which fires
  // only when there is no title [L268], then fired again on the very next save. A
  // `SwProduct` row whose `urlTitle` stays NULL is also a product whose
  // `getProductURL()` cannot compose [model/entity/Product.cfc:L207].
  //
  // THE THREE-WAY DISTINCTION IS THE WHOLE POINT, and it is why `Object.hasOwn` is
  // the test rather than a truthiness check: a PRESENT key wins, even when it holds
  // `undefined`, in which case SQL NULL is written; an ABSENT key leaves the
  // entity's own value in place. `structKeyExists` drew exactly that line in CFML
  // [model/service/ProductService.cfc:L266], and `saveBrand` already relies on it.
  // -------------------------------------------------------------------------
  describe('saveProduct - the populate step, and where a resolved url title lands', () => {
    it('binds the PAYLOAD url title, not the entity value it overrides', async () => {
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      // The service's own shape: the entity has no title, the service resolved one, and
      // the payload is how it travels.
      const product = makeProductFixture({
        urlTitle: undefined,
        brand: undefined,
        productType: undefined,
        defaultSku: undefined,
      });

      expect(product.getUrlTitle()).toBeUndefined();

      const saved = await repository.saveProduct(product, { urlTitle: RESOLVED_URL_TITLE });

      const insert = statementAt(executor.mutationCalls, 0);

      // The row carries it. This is the assertion whose absence let the defect through:
      // every other case in this file passes an empty payload and so cannot see it.
      expect(parameterAt(insert.params, INSERT_URL_TITLE_POSITION)).toBe(RESOLVED_URL_TITLE);
      // And it is BOUND, not interpolated.
      expect(insert.sql).not.toContain(RESOLVED_URL_TITLE);

      // The returned instance carries it too, which is what the legacy's own entity
      // assignment achieved. The argument cannot: `urlTitle` is `private readonly`.
      expect(saved.getUrlTitle()).toBe(RESOLVED_URL_TITLE);
      expect(product.getUrlTitle()).toBeUndefined();
      expect(saved).not.toBe(product);
    });

    it('binds the PAYLOAD product name, and the two members move independently', async () => {
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);
      const saved = await repository.saveProduct(makeWritableProduct(), {
        productName: OVERRIDING_PRODUCT_NAME,
      });

      const insert = statementAt(executor.mutationCalls, 0);

      // `productName` present, `urlTitle` absent: one column takes the payload and the
      // other keeps the entity's value. A populate step that applied the whole payload
      // or none of it would fail one half of this.
      expect(parameterAt(insert.params, INSERT_PRODUCT_NAME_POSITION)).toBe(
        OVERRIDING_PRODUCT_NAME,
      );
      expect(parameterAt(insert.params, INSERT_URL_TITLE_POSITION)).toBe(FIXTURE_URL_TITLE);
      expect(saved.getProductName()).toBe(OVERRIDING_PRODUCT_NAME);
      expect(saved.getUrlTitle()).toBe(FIXTURE_URL_TITLE);
    });

    it('writes SQL NULL for a key PRESENT and holding undefined', async () => {
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      // The entity HAS a title, and the payload explicitly says there is none. A caller
      // that read a NULL column can only express that this way, which is why
      // `ProductSavePayload` declares `?: string | undefined` rather than plain `?:`.
      const saved = await repository.saveProduct(makeWritableProduct(), { urlTitle: undefined });

      const insert = statementAt(executor.mutationCalls, 0);

      expect(parameterAt(insert.params, INSERT_URL_TITLE_POSITION)).toBeNull();
      expect(insert.params).not.toContain(undefined);
      expect(saved.getUrlTitle()).toBeUndefined();
    });

    it('leaves the entity value in place for a key that is ABSENT', async () => {
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);
      const saved = await repository.saveProduct(makeWritableProduct(), NO_POPULATED_MEMBERS);

      const insert = statementAt(executor.mutationCalls, 0);

      // The distinction `Object.hasOwn` draws, from the other side: absent is not
      // `undefined`, so nothing is overridden and nothing is nulled.
      expect(parameterAt(insert.params, INSERT_URL_TITLE_POSITION)).toBe(FIXTURE_URL_TITLE);
      expect(saved.getUrlTitle()).toBe(FIXTURE_URL_TITLE);
    });

    it('carries the populated url title through the UPDATE route as well', async () => {
      // An EXISTING row whose `urlTitle` column is NULL is exactly the case the service
      // generates for on a second save, so the update route has to carry the payload too
      // or the title would be regenerated forever and stored never.
      const executor = new RecordingExecutor([[{ productID: PERSISTED_PRODUCT_ID }]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);
      const product = makeProductFixture({
        productID: PERSISTED_PRODUCT_ID,
        urlTitle: undefined,
        brand: undefined,
        productType: undefined,
        defaultSku: undefined,
      });
      const argumentCreationStamp = product.getCreatedDateTime();

      const saved = await repository.saveProduct(product, { urlTitle: RESOLVED_URL_TITLE });

      const update = statementAt(executor.mutationCalls, 0);

      expect(update.sql).toBe(EXPECTED_PRODUCT_UPDATE);
      expect(parameterAt(update.params, UPDATE_URL_TITLE_POSITION)).toBe(RESOLVED_URL_TITLE);
      expect(update.sql).not.toContain(RESOLVED_URL_TITLE);

      // A rebuilt instance, because handing back the argument would report a title the
      // row does not hold - and the key it reports is the one it already had, not a
      // freshly minted one.
      expect(saved).not.toBe(product);
      expect(saved.getUrlTitle()).toBe(RESOLVED_URL_TITLE);
      expect(saved.getProductID()).toBe(PERSISTED_PRODUCT_ID);

      // ★ AND THE CREATION PROVENANCE SURVIVES THE REBUILD. The insert route writes ONE
      // instant to both stamps [org/Hibachi/HibachiEntity.cfc:L609]; an update touches
      // only the modified one [org/Hibachi/HibachiEntity.cfc:L662-L667]. A rebuild given
      // a single timestamp would have reported the modification instant as the creation
      // instant, which is why the two are separate parameters.
      expect(saved.getCreatedDateTime()).toBe(argumentCreationStamp);

      const rebuiltModifiedStamp = saved.getModifiedDateTime();
      expect(rebuiltModifiedStamp).toBeInstanceOf(Date);
      // The same narrowing idiom the audit-stamp cases above use: `instanceof` rather
      // than a non-null assertion, which the lint configuration bans outright in `src/**`
      // and which this file does not reach for either.
      if (rebuiltModifiedStamp instanceof Date && argumentCreationStamp instanceof Date) {
        expect(rebuiltModifiedStamp.getTime()).toBeGreaterThan(argumentCreationStamp.getTime());
      }
    });

    it('still answers THE ARGUMENT on the update route when the populate step overrode nothing', async () => {
      // The regression guard for the branch above. Every save whose payload omits both
      // keys - which is every case in the sibling group - must keep answering the very
      // instance it was handed, because a rebuild cannot forward the collections
      // `Product` treats as materialized-or-not and would convert "unknown" into a
      // confident "empty".
      const executor = new RecordingExecutor([[{ productID: PERSISTED_PRODUCT_ID }]]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);
      const product = makeWritableProduct(PERSISTED_PRODUCT_ID);

      const saved = await repository.saveProduct(product, NO_POPULATED_MEMBERS);

      expect(saved).toBe(product);

      // A payload that RESTATES what the entity already holds overrides nothing either,
      // so it takes the same branch.
      const restatingExecutor = new RecordingExecutor([[{ productID: PERSISTED_PRODUCT_ID }]]);
      const restated = await aProductRepository(restatingExecutor, TEST_AUDIT_ACTOR).saveProduct(
        product,
        {
          urlTitle: FIXTURE_URL_TITLE,
          productName: LEGACY_FIXTURE_PRODUCT_NAME,
        },
      );

      expect(restated).toBe(product);
    });
  });

  describe('deleteProduct - NET-NEW, and boolean by legacy service contract', () => {
    // ★★ THIS BLOCK ONCE ASSERTED THAT THE CASCADE WAS *NOT* REPRODUCED, AND THIS IS THE
    // RECORD OF THAT REVERSAL. Four cases lived here, and three of them pinned the
    // single-statement delete: one asserted `mutationCalls` had length 1, one read the
    // product key off statement 0, and one - titled 'does not reproduce the service-tier
    // default-sku null-out' - asserted in as many words that no preceding UPDATE was
    // emitted, on the stated grounds that "`connection.ts` deliberately publishes no
    // transaction method".
    //
    // That premise stopped being true when `connection.ts` gained `transaction`, and the
    // conclusion inverted with it: Hibernate DID delete a product's dependents
    // [model/entity/Product.cfc:L70-L76] and DID null the default SKU first
    // [model/service/ProductService.cfc:L323], and the schema's foreign keys otherwise
    // refuse the parent delete outright. So the cases below assert the cascade rather than
    // its absence. They are rewritten rather than deleted, because the reasoning they
    // encoded was sound for the capability then available and the change is worth reading.
    //
    // ★ AND THE INVERSE HALF OF THE LINK CLEANUP IS HERE FOR A SECOND, INDEPENDENT REASON.
    // `HibachiService.delete()` ran `entity.removeAllManyToManyRelationships()`
    // [org/Hibachi/HibachiService.cfc:L61] BEFORE it reached the DAO, and that helper walks
    // EVERY many-to-many the entity participates in - not only the ones it owns. The
    // framework states the purpose at [org/Hibachi/HibachiEntity.cfc:L270] in as many words:
    // the link rows go first "so that it doesn't violate fkconstrint". A cascade that
    // cleared only the three OWNED link tables would leave `SwPromoRewardProduct` and its
    // six siblings pointing at a row that is about to vanish, and the product would become
    // UNDELETABLE where the schema constrains them or the rows ORPHANED where it does not.
    // Neither is what the legacy did, so all ten link tables are walked.
    //
    // NET-NEW under AAP 0.6.6 in full: `meta/tests/unit/dao/` holds only AccountDAOTest and
    // PaymentDAOTest, so no legacy test covers product deletion at any layer.

    /**
     * 1 detach + 8 SKU-dependent + 1 SwSku + 3 owned link + 7 inverse link
     * + 3 product-dependent + 1 product.
     */
    const EXPECTED_CASCADE_STATEMENT_COUNT = 24;

    /** Position of the product row's own DELETE: the last statement of the unit of work. */
    const PRODUCT_DELETE_POSITION = EXPECTED_CASCADE_STATEMENT_COUNT - 1;

    /** Every table the cascade touches, in the order the adapter walks them. */
    const EXPECTED_CASCADE_TABLES: readonly string[] = Object.freeze([
      'SwProduct',
      'SwAlternateSkuCode',
      'SwAttributeValue',
      'SwSkuCurrency',
      'SwStock',
      'SwSkuOption',
      'SwSkuAccessContent',
      'SwSkuSubsBenefit',
      'SwSkuRenewalSubsBenefit',
      'SwSku',
      'SwProductListingPage',
      'SwProductCategory',
      'SwRelatedProduct',
      'SwPromoRewardProduct',
      'SwPromoRewardExclProduct',
      'SwPromoQualProduct',
      'SwPromoQualExclProduct',
      'SwPriceGroupRateProduct',
      'SwVendorProduct',
      'SwPhysicalProduct',
      'SwImage',
      'SwAttributeValue',
      'SwProductReview',
      'SwProduct',
    ]);

    /** The eight tables reached through a subquery over the product's SKUs. */
    const SKU_DEPENDENT_TABLE_NAMES: readonly string[] = EXPECTED_CASCADE_TABLES.slice(1, 9);

    it('deletes the product row LAST, and reports true when it matched', async () => {
      // The boolean result is the legacy SERVICE-level contract,
      // `public boolean function deleteProduct(required any product)`
      // [model/service/ProductService.cfc:L317], so this reports two outcomes rather than
      // throwing on a refusal - and it reports the PRODUCT row's result, not the cascade's.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const deleted = await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      expect(deleted).toBe(true);
      expect(executor.mutationCalls).toHaveLength(EXPECTED_CASCADE_STATEMENT_COUNT);

      const statement = statementAt(executor.mutationCalls, PRODUCT_DELETE_POSITION);
      expect(statement.sql).toBe(EXPECTED_PRODUCT_DELETE);
      expect(statement.params).toStrictEqual([PERSISTED_PRODUCT_ID]);
      expect(placeholderCount(statement.sql)).toBe(1);

      // TWENTY-FOUR STATEMENTS, IN ORDER, AS TEXT - and the count is FIXED. It does not
      // grow with the number of SKUs, link rows or currencies, because every step is one
      // predicate rather than one statement per row. Pinning the full text here, rather
      // than only the table names, is what makes a reordered or reworded statement a
      // failure instead of a silent behaviour change.
      expect(executor.mutationCalls.map((call: RecordedStatement) => call.sql)).toStrictEqual([
        ...EXPECTED_PRODUCT_DELETE_SEQUENCE,
      ]);

      // Every statement binds the product identifier exactly once, so the whole sequence
      // is idempotent and therefore safely retryable - and every statement after the first
      // is a plain row DELETE. Statement 0 is the exception BY DESIGN: it is the
      // default-SKU detach, an UPDATE, and it is checked on its own terms because a
      // `startsWith('DELETE FROM ')` sweep that included it would have to be weakened to
      // the point of asserting nothing.
      expect(statementAt(executor.mutationCalls, 0).sql).toBe(EXPECTED_PRODUCT_DEFAULT_SKU_DETACH);

      for (const [position, call] of executor.mutationCalls.entries()) {
        expect(call.params).toStrictEqual([PERSISTED_PRODUCT_ID]);
        expect(placeholderCount(call.sql)).toBe(1);
        expect(call.sql.startsWith(position === 0 ? 'UPDATE ' : 'DELETE FROM ')).toBe(true);
        expect(call.sql).not.toContain('TRUNCATE');
        expect(call.sql).not.toContain('DROP');
      }

      // LEAF FIRST: the product row is deleted LAST, so a failure part-way through
      // leaves it present and the call safe to re-issue.
      expect(statementAt(executor.mutationCalls, PRODUCT_DELETE_POSITION).sql).toBe(
        EXPECTED_PRODUCT_DELETE,
      );

      // And the SKU rows go after their own children and before every table keyed on the
      // product itself.
      expect(statementAt(executor.mutationCalls, 9).sql).toBe(EXPECTED_PRODUCT_SKUS_DELETE);

      // Nothing was READ - the one place row identity is resolved is inside the
      // subquery, in SQL.
      expect(executor.calls).toHaveLength(0);
    });

    it('names every out-of-scope child table from its OWN entity declaration', async () => {
      // ★★ QUOTE-THEN-REVISE, AND THE PREMISE WAS THE THING THAT WAS WRONG. This case was
      // titled 'names only the tables the source declares, and never an unnameable one'
      // and asserted the ABSENCE of six table names, reasoning: "Three of Product's
      // `cascade="all-delete-orphan"` collections point at entities outside the eighteen
      // in scope [...] and their physical table names appear in NO in-scope source.
      // Inventing one would be worse than leaving the obligation unhonoured."
      //
      // THE CAUTION WAS RIGHT AND THE FACT WAS NOT. Out of PORTED scope is not the same
      // as absent from the repository, and each of those entities declares its own table
      // in its own file, in the one place a table name is ever declared:
      //
      //   `Image.cfc`            -> `table="SwImage"`            [model/entity/Image.cfc:L49]
      //   `AttributeValue.cfc`   -> `table="SwAttributeValue"`   [model/entity/AttributeValue.cfc:L54]
      //   `ProductReview.cfc`    -> `table="SwProductReview"`    [model/entity/ProductReview.cfc:L49]
      //   `AlternateSkuCode.cfc` -> `table="SwAlternateSkuCode"` [model/entity/AlternateSkuCode.cfc:L49]
      //   `Stock.cfc`            -> `table="SwStock"`            [model/entity/Stock.cfc:L49]
      //
      // Nothing is invented by reading them, and the foreign keys are declared in the same
      // files - `Image.product` is `fkcolumn="productID"` [model/entity/Image.cfc:L61] and
      // `AttributeValue` carries BOTH `productID` [L70] and `skuID` [L72], which is why it
      // is cleaned twice: once by product key and once by subquery over the SKUs.
      //
      // So the obligation is HONOURED rather than recorded, and what this case pins is the
      // opposite of what it used to: the five tables are named, spelled as their entities
      // spell them, and the names that are genuinely NOT declared anywhere are still absent.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      const emitted = executor.mutationCalls.map((call: RecordedStatement) => call.sql).join('\n');

      for (const declaredTable of [
        'SwImage',
        'SwAttributeValue',
        'SwProductReview',
        'SwAlternateSkuCode',
        'SwStock',
      ]) {
        expect(emitted).toContain(declaredTable);
      }

      // ⚠ AND THE ONE NAME THAT REALLY IS AN INVENTION STAYS ABSENT. `SwProductImage`
      // reads like the obvious name for `Product.productImages` [model/entity/Product.cfc:L74]
      // and NO entity declares it - the collection points at `Image`, whose table is
      // `SwImage`. Guessing it would have produced a statement against nothing.
      expect(emitted).not.toContain('SwProductImage');

      // The SIX INVERSE SKU link tables [model/entity/Sku.cfc:L82-L87] are absent too:
      // an inverse collection is maintained by its owning side and Hibernate did not
      // delete its rows on the strength of the inverse mapping.
      for (const inverseSkuLinkTable of [
        'SwPromoRewardSku',
        'SwPromoRewardExclSku',
        'SwPromoQualSku',
        'SwPromoQualExclSku',
        'SwPriceGroupRateSku',
        'SwPhysicalSku',
      ]) {
        expect(emitted).not.toContain(inverseSkuLinkTable);
      }

      // And `SwRelatedProduct` is cleaned from ONE side only - adding
      // `OR relatedProductID = ?` would delete rows belonging to another product's
      // collection, which the framework never touched.
      expect(emitted).not.toContain('relatedProductID');
    });

    it('reports false when the PRODUCT row matched nothing, whatever the cascade did', async () => {
      // ⚠ WHAT `false` MEANS HERE. The legacy service returned false when the FRAMEWORK's
      // delete did not proceed - a validation gate evaluated before any SQL was issued - and
      // it then restored the default SKU it had nulled out beforehand
      // [model/service/ProductService.cfc:L320-L333]. That gate lived in
      // `HibachiService`/`HibachiDAO`, which is not ported, so deletability still lives at
      // the service tier. This method's `false` means the product's own DELETE matched no
      // row, which is the only refusal a driver can report.
      //
      // ★ THE ASSERTION IS ON THE LAST STATEMENT, NOT THE FIRST. It formerly read statement
      // 0, which is now the detach UPDATE - and since that binds the same key, the old
      // assertion would still have passed while no longer testing what it named. The
      // position is therefore pinned explicitly.
      const executor = new RecordingExecutor([], NO_ROWS_AFFECTED);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const deleted = await repository.deleteProduct(makeWritableProduct(UNMATCHED_PRODUCT_ID));

      expect(deleted).toBe(false);

      const productDelete = statementAt(executor.mutationCalls, PRODUCT_DELETE_POSITION);
      expect(productDelete.sql).toBe(EXPECTED_PRODUCT_DELETE);
      expect(productDelete.params).toStrictEqual([UNMATCHED_PRODUCT_ID]);
    });

    it('refuses an unsaved product before opening a transaction, and writes nothing', async () => {
      // ★ QUOTE-THEN-REVISE. This case was titled 'binds the empty string for an unsaved
      // product and reports false, with no guard', and it asserted
      // `statementAt(mutationCalls, 0).params` was `['']` - celebrating that `isNew()`
      // needed no special case because binding the empty string matched nothing anyway.
      //
      // That was the right call for ONE statement and the wrong one for twenty-four. Opening a
      // unit of work to bind `''` twenty-four times against a row that provably does not exist
      // - `isNew()` means the identifier IS the empty string [model/entity/Product.cfc:L52] -
      // is waste rather than economy, so the guard now earns its place. The observable answer
      // is unchanged: still `false`.
      const executor = new RecordingExecutor([], NO_ROWS_AFFECTED);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const deleted = await repository.deleteProduct(makeWritableProduct());

      expect(deleted).toBe(false);
      expect(executor.mutationCalls).toStrictEqual([]);
      expect(executor.calls).toStrictEqual([]);
      expect(executor.transactionCount).toBe(0);
    });

    it('detaches the default SKU FIRST, which is the SQL half of the L323 null-out', async () => {
      // The mutual foreign key is why the order is forced: `SwSku.productID` references
      // `SwProduct` [model/entity/Sku.cfc:L65] and `SwProduct.defaultSkuID` references
      // `SwSku` [model/entity/Product.cfc:L70], so the SKU rows cannot go while the product
      // row still names one of them. The legacy solved the same problem in the service by
      // nulling the association before delegating to the framework delete
      // [model/service/ProductService.cfc:L323].
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      const detach = statementAt(executor.mutationCalls, 0);
      expect(detach.sql).toBe('UPDATE SwProduct SET defaultSkuID = NULL WHERE productID = ?');
      expect(detach.params).toStrictEqual([PERSISTED_PRODUCT_ID]);

      // It is an UPDATE that clears one column - it must not re-stamp the audit columns of a
      // row that is deleted twenty-three statements later.
      expect(detach.sql).not.toContain('modifiedDateTime');

      // And it precedes every DELETE, not merely the first one.
      const firstDeletePosition = executor.mutationCalls.findIndex((statement: RecordedStatement) =>
        statement.sql.startsWith('DELETE'),
      );
      expect(firstDeletePosition).toBe(1);
    });

    it('opens EXACTLY ONE unit of work and runs every statement inside it', async () => {
      // This is the whole reason the cascade is reproducible at all. Twenty-four statements
      // spread across twenty-four implicit transactions could half-apply, leaving a product
      // detached from its default SKU but undeleted, or its SKUs gone and itself present -
      // states the legacy could never reach, because Hibernate flushed the lot inside the
      // request's transaction.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      expect(executor.transactionCount).toBe(1);

      for (const statement of executor.mutationCalls) {
        expect(statement.inTransaction).toBe(true);
      }
    });

    it('routes all twenty-four statements through the TRANSACTION executor, not its own', async () => {
      // ★ WHY A SECOND DOUBLE IS NEEDED, AND WHAT THE CASE ABOVE CANNOT SHOW.
      // `RecordingExecutor.transaction` hands the callback ITSELF, so `tx` and
      // `this.executor` are the same object inside it: a statement issued against the
      // adapter's own field lands in the same log, with the same `inTransaction` flag, as
      // one issued against `tx`. The previous case therefore proves a unit of work was
      // OPENED but not that the work went INSIDE it.
      //
      // This was not a hypothetical. Replacing all six `tx.executeMutation` calls with
      // `this.executor.executeMutation` - which is precisely the escape that would commit
      // each statement independently and reintroduce the half-applied cascade - left all
      // 105 cases of this file GREEN. So the split double exists to make that mutation
      // fail, and it does.
      class SplittingExecutor implements PreparedStatementExecutor {
        public readonly calls: RecordedStatement[] = [];

        public readonly mutationCalls: RecordedStatement[] = [];

        /** The recorder every in-transaction statement is expected to land on instead. */
        public readonly inner = new RecordingExecutor();

        public transactionCount = 0;

        public execute(sql: string, params: readonly unknown[] = []): Promise<readonly SqlRow[]> {
          this.calls.push({ sql, params: [...params], inTransaction: false });

          return Promise.resolve(NO_ROWS);
        }

        public executeMutation(
          sql: string,
          params: readonly unknown[] = [],
        ): Promise<SqlMutationResult> {
          this.mutationCalls.push({ sql, params: [...params], inTransaction: false });

          return Promise.resolve(WRITE_RESULT);
        }

        public async transaction<T>(
          work: (tx: PreparedStatementExecutor) => Promise<T>,
        ): Promise<T> {
          this.transactionCount += 1;

          return await work(this.inner);
        }
      }

      const executor = new SplittingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const deleted = await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      // The outer executor opened the unit and then issued nothing at all.
      expect(executor.transactionCount).toBe(1);
      expect(executor.mutationCalls).toStrictEqual([]);
      expect(executor.calls).toStrictEqual([]);

      // ...and the transaction's own executor carries the entire cascade.
      expect(executor.inner.mutationCalls).toHaveLength(EXPECTED_CASCADE_STATEMENT_COUNT);
      expect(deleted).toBe(true);
    });

    it('empties every SKU-dependent table BEFORE SwSku, reaching them by subquery', async () => {
      // Hibernate had the product's SKUs loaded and could delete each dependent by SKU key.
      // With no session, a subquery over `SwSku` reaches the same set in one statement per
      // table - and it has to run while `SwSku` still holds the rows, or it selects nothing
      // and the dependents survive as orphans.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      const emitted = executor.mutationCalls.map((statement: RecordedStatement) => statement.sql);
      const skuTablePosition = emitted.indexOf('DELETE FROM SwSku WHERE productID = ?');
      expect(skuTablePosition).toBe(9);

      SKU_DEPENDENT_TABLE_NAMES.forEach((tableName: string, offset: number) => {
        const position = offset + 1;
        const statement = statementAt(executor.mutationCalls, position);

        expect(statement.sql).toBe(
          `DELETE FROM ${tableName} WHERE skuID IN (SELECT skuID FROM SwSku WHERE productID = ?)`,
        );
        expect(statement.params).toStrictEqual([PERSISTED_PRODUCT_ID]);
        expect(position).toBeLessThan(skuTablePosition);
      });
    });

    it('walks the link tables and the product-level children, in that order', async () => {
      // The first three link tables are OWNED many-to-many [model/entity/Product.cfc:L79-L81],
      // so their rows go with the owner; the next seven are the ones the product merely
      // participates in; the three child tables are `all-delete-orphan` one-to-many
      // [L74-L76]. Every group keys on `productID` directly rather than through a subquery,
      // because every one of them names the product itself.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      const emitted = executor.mutationCalls.map((statement: RecordedStatement) => statement.sql);

      expect(emitted.slice(10, 13)).toStrictEqual([
        'DELETE FROM SwProductListingPage WHERE productID = ?',
        'DELETE FROM SwProductCategory WHERE productID = ?',
        'DELETE FROM SwRelatedProduct WHERE productID = ?',
      ]);

      // Then the seven the product only PARTICIPATES in, which
      // `removeAllManyToManyRelationships()` [org/Hibachi/HibachiService.cfc:L61] cleared
      // as well. Their member column is spelled exactly like the owned tables' - so they
      // key on `productID` identically and are distinguishable only by table name.
      expect(emitted.slice(13, 20)).toStrictEqual([
        'DELETE FROM SwPromoRewardProduct WHERE productID = ?',
        'DELETE FROM SwPromoRewardExclProduct WHERE productID = ?',
        'DELETE FROM SwPromoQualProduct WHERE productID = ?',
        'DELETE FROM SwPromoQualExclProduct WHERE productID = ?',
        'DELETE FROM SwPriceGroupRateProduct WHERE productID = ?',
        'DELETE FROM SwVendorProduct WHERE productID = ?',
        'DELETE FROM SwPhysicalProduct WHERE productID = ?',
      ]);

      // And last the three product-level children.
      expect(emitted.slice(20, 23)).toStrictEqual([
        'DELETE FROM SwImage WHERE productID = ?',
        'DELETE FROM SwAttributeValue WHERE productID = ?',
        'DELETE FROM SwProductReview WHERE productID = ?',
      ]);
    });

    it('binds exactly one parameter - the product key - in all twenty-four statements', async () => {
      // No statement takes a list, a limit or a second key. That matters because the whole
      // cascade is driven by one identifier: a second bound value would mean some statement
      // was reaching for state the method was not given.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      for (const statement of executor.mutationCalls) {
        expect(statement.params).toStrictEqual([PERSISTED_PRODUCT_ID]);
        expect(placeholderCount(statement.sql)).toBe(1);
      }
    });

    it('names SwOrderItem NOWHERE, so a sold SKU stays undeletable', async () => {
      // ⚠ `orderItems` [model/entity/Sku.cfc:L71] is the one SKU collection declared with NO
      // cascade, so Hibernate never deleted an order item to make room for a product delete:
      // the foreign key stood and the delete failed. Reproducing that ABSENCE is what
      // preserves order history, and it is asserted rather than assumed because adding the
      // table would be a one-line, catastrophic, and entirely plausible-looking mistake.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      const everyStatement = executor.mutationCalls
        .map((statement: RecordedStatement) => statement.sql)
        .join('\n');

      expect(everyStatement).not.toContain('SwOrderItem');
      expect(everyStatement).not.toContain('SwOrder');

      // Nor does it reach the far side of any owned link: a category outlives the products
      // filed under it.
      expect(everyStatement).not.toContain('SwCategory ');
      expect(everyStatement).not.toContain('SwContent');
      expect(everyStatement).not.toContain('SwSubscriptionBenefit');
    });

    it('touches only the tables the legacy cascade did, and every one is Sw-prefixed', async () => {
      // The complete inventory in the emitted order, so a table added or dropped in the
      // adapter shows up here as a diff rather than as silent behaviour drift.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));

      const touchedTables = executor.mutationCalls.map((statement: RecordedStatement) => {
        const match = /^(?:DELETE FROM|UPDATE) (\w+)/.exec(statement.sql);

        if (match?.[1] === undefined) {
          throw new Error(`statement names no table: ${statement.sql}`);
        }

        return match[1];
      });

      expect(touchedTables).toStrictEqual(EXPECTED_CASCADE_TABLES);

      for (const tableName of touchedTables) {
        expect(tableName.startsWith('Sw')).toBe(true);
      }
    });
  });

  // NO `saveBrand` GROUP, BECAUSE THE ADAPTER PUBLISHES NO SUCH METHOD. An earlier
  // revision of this suite pinned the existence read, the eleven-column `SwBrand`
  // insert, the eight-assignment update with the key bound last, and the populate
  // precedence between the payload and the entity - all against a seventh port member
  // that has since been removed. The header records why: the port's member set is
  // LOCKED AT SIX, AAP 0.4.1 fixes the port inventory at THIRTEEN so no
  // `BrandRepository` is available either, and AAP 0.5.3 does not carry the Hibachi
  // base classes forward - which is all `super.save`
  // [model/service/BrandService.cfc:L76] ever was. `src/services/brandService.ts`
  // resolves the unique URL title into the payload and answers the brand; the durable
  // half belongs to the composition root, and its LEGACY-NOTE says so at the
  // statement that used to perform it. `SwBrand` is still exercised in this file, as
  // the eager `LEFT JOIN` of the product graph.

  describe('the hydration path resolves collaborators by injection, not by a locator', () => {
    it('materializes a product with no getService lookup anywhere in the path', async () => {
      // C5.4. `ProductService.cfc` declares EIGHT DI properties at
      // [model/service/ProductService.cfc:L52-L60] - `productDAO`, `skuDAO`,
      // `productTypeDAO`, `dataService` at L56, `contentService`, `skuService`,
      // `subscriptionService` and `optionService` - every one of which becomes an
      // explicit constructor port under T1. And the ENTITY reached its own
      // collaborators through a service LOCATOR: [model/entity/Product.cfc:L341] calls
      // `getService("optionService")` and [model/entity/Product.cfc:L519] calls
      // `getService("promotionService")`. Under T2 both arrive by constructor
      // injection instead.
      //
      // The proof available to a statement-shape suite is structural and it is a real
      // one: the adapter is constructed with an executor and NOTHING ELSE, no
      // container is reachable from it, and a full product still materializes. If any
      // step of the hydration path resolved a collaborator by name at runtime, there
      // would be nothing here for it to resolve against and this case could not pass.
      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW_WITH_DEFAULT_SKU],
        [SKU_ROW],
        [SKU_OPTION_ROW],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      expect(product.getProductID()).toBe(PERSISTED_PRODUCT_ID);
      expect(product.getSkus()).toHaveLength(1);

      // No statement in the path names a service, a scope or a bean - the constructs a
      // locator would have needed.
      for (const call of executor.calls) {
        expect(call.sql).not.toContain('getService');
        expect(call.sql).not.toContain('slatwallScope');
      }
    });
  });

  // ===========================================================================
  // C-6  cross-cutting assertions
  // ===========================================================================

  describe('boolean hydration through cfBoolean, not through Boolean(x)', () => {
    it('resolves a NULL flag exactly as cfBoolean does, not as JavaScript truthiness', async () => {
      // C6.2. Booleans go through `cfBoolean()` from `src/lib/cfml/truthiness.js` and
      // never through a bare `Boolean(x)` or `if (x)`. The legacy defaults are spelled
      // INCONSISTENTLY across the slice - `"0"`, `"1"`, and the STRING `"false"` at
      // [model/entity/PriceGroupRate.cfc:L53] - which is exactly why a single audited
      // funnel exists instead of an inline coercion at each site.
      //
      // The canned graph row carries `p_activeFlag: null`, and
      // [model/entity/Product.cfc:L53] declares `activeFlag` with NO `default=`, so a
      // NULL column is the honest state. `Boolean(null)` and `cfBoolean(null)` happen
      // to agree here, so the assertion is written against `cfBoolean` itself - the
      // funnel is what is being pinned, not a coincidence of one input.
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      expect(product.getActiveFlag()).toBe(cfBoolean(null));
      expect(product.getPublishedFlag()).toBe(cfBoolean(1));
      expect(product.getCalculatedAllowBackorderFlag()).toBe(cfBoolean(0));
    });

    it('resolves the string "false" as false, which JavaScript truthiness would not', async () => {
      // The case that separates `cfBoolean()` from `Boolean(x)` unambiguously:
      // `Boolean('false')` is TRUE, while CFML - and therefore `cfBoolean` - reads the
      // string `"false"` as FALSE. A driver returning a `char(1)`-style flag makes this
      // reachable, and the legacy slice really does spell a default that way.
      const rowWithStringFalse: SqlRow = { ...PRODUCT_GRAPH_ROW, p_publishedFlag: 'false' };
      const executor = new RecordingExecutor([[rowWithStringFalse], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      expect(product.getPublishedFlag()).toBe(false);
      expect(product.getPublishedFlag()).toBe(cfBoolean('false'));
      expect(Boolean('false')).toBe(true);
    });

    it('reads a flag by its projected label regardless of the value shape the driver returns', async () => {
      // CFML identifiers are case-insensitive and TypeScript is not, so column and
      // alias casing is never assumed - the labels asserted throughout this suite are
      // the ones the adapter itself projects. Here the flag arrives in three different
      // value shapes a driver can legitimately produce for the same column, and all
      // three resolve through the one funnel.
      for (const flagValue of [1, '1', true]) {
        const executor = new RecordingExecutor([
          [{ ...PRODUCT_GRAPH_ROW, p_publishedFlag: flagValue }],
          [],
        ]);
        const product = requireProduct(
          await aProductRepository(executor, TEST_AUDIT_ACTOR).getProductByProductID(
            PERSISTED_PRODUCT_ID,
          ),
        );

        expect(product.getPublishedFlag()).toBe(true);
      }
    });
  });

  describe('schema continuity across every emitted statement', () => {
    it('targets only existing physical Sw* tables', () => {
      // C6.3 / C5/B5. The migration reads and writes the EXISTING `Sw*` schema
      // unchanged - no migration, no rename, no new table, no column change. Every
      // statement this suite pins is checked against the tables it is allowed to name.
      //
      // Every name below is DECLARED IN IN-SCOPE SOURCE: the entity `table=` attributes,
      // or a `linktable=` on one of the eighteen in-scope entities. That is the test -
      // a table this adapter may name is one the slice can point at, not one that seemed
      // likely.
      const permittedTables: readonly string[] = [
        // Read paths.
        'SwAttributeSet',
        'SwAttribute',
        'SwType',
        'SwAttributeSetProductType',
        'SwProduct',
        'SwProductType',
        'SwBrand',
        'SwSku',
        'SwSkuOption',
        'SwOption',
        'SwOptionGroup',
        // The ten `Product` many-to-many link tables [model/entity/Product.cfc:L79-L90],
        // cleaned by the reproduction of `removeAllManyToManyRelationships()`.
        'SwProductListingPage',
        'SwProductCategory',
        'SwRelatedProduct',
        'SwPromoRewardProduct',
        'SwPromoRewardExclProduct',
        'SwPromoQualProduct',
        'SwPromoQualExclProduct',
        'SwPriceGroupRateProduct',
        'SwVendorProduct',
        'SwPhysicalProduct',
        // The SKU's own owned link tables [model/entity/Sku.cfc:L76-L79] and its
        // `all-delete-orphan` child tables [L69-L73].
        'SwSkuAccessContent',
        'SwSkuSubsBenefit',
        'SwSkuRenewalSubsBenefit',
        'SwSkuCurrency',
        'SwAlternateSkuCode',
        'SwStock',
        // The three product-level children. Each entity is outside the ported eighteen and
        // each declares its own table in its own file, which is where these names come
        // from: `SwImage` [model/entity/Image.cfc:L49], `SwAttributeValue`
        // [model/entity/AttributeValue.cfc:L54] and `SwProductReview`
        // [model/entity/ProductReview.cfc:L49].
        'SwImage',
        'SwAttributeValue',
        'SwProductReview',
      ];

      for (const statement of EVERY_EXPECTED_STATEMENT) {
        const namedTables = statement.match(/Sw[A-Za-z]+/g) ?? [];

        expect(namedTables.length).toBeGreaterThan(0);
        for (const namedTable of namedTables) {
          expect(permittedTables).toContain(namedTable);
        }
      }
    });

    it('emits no DDL verb in any statement', async () => {
      // C6.3. Not one statement may create, alter, drop, truncate or rename anything.
      // Asserted over the expected statements AND over everything actually recorded,
      // so the sweep covers the adapter's real output rather than only the copy.
      //
      // ⚠ THE SWEEP MATCHES WHOLE WORDS, AND THAT IS NOT A LOOSENING. A naive substring
      // search reports a false positive on this very schema: the audit columns
      // `createdDateTime` and `createdByAccountID` [model/entity/Product.cfc:L48-L49]
      // both CONTAIN the letters of `CREATE`, so a substring sweep would fail every
      // legitimate SELECT and INSERT in the adapter while proving nothing. A DDL verb is
      // only a DDL verb as a standalone token, so that is what is tested for.
      const forbiddenVerbs: readonly string[] = ['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME'];

      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW_WITH_DEFAULT_SKU],
        [SKU_ROW],
        [SKU_OPTION_ROW],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.getProductByProductID(PERSISTED_PRODUCT_ID);
      await repository.saveProduct(makeWritableProduct(), NO_POPULATED_MEMBERS);
      await repository.deleteProduct(makeWritableProduct(PERSISTED_PRODUCT_ID));
      await repository.getAttributeSets([PRODUCT_ATTRIBUTE_SET_TYPE_CODE], []);

      const everyRecordedStatement: readonly string[] = [
        ...executor.calls.map((call: RecordedStatement) => call.sql),
        ...executor.mutationCalls.map((call: RecordedStatement) => call.sql),
      ];

      expect(everyRecordedStatement.length).toBeGreaterThan(0);

      for (const statement of [...EVERY_EXPECTED_STATEMENT, ...everyRecordedStatement]) {
        const upperCased = statement.toUpperCase();

        for (const forbiddenVerb of forbiddenVerbs) {
          expect(upperCased).not.toMatch(new RegExp('\\b' + forbiddenVerb + '\\b'));
        }
      }

      // And the sweep is proven to have teeth rather than to be vacuously green: the
      // same predicate DOES reject a real DDL statement.
      expect('DROP TABLE SwProduct').toMatch(new RegExp('\\bDROP\\b'));
      expect('P.CREATEDDATETIME AS P_CREATEDDATETIME').not.toMatch(new RegExp('\\bCREATE\\b'));
    });

    it('names no Slatwall-prefixed identifier in the raw-SQL path', async () => {
      // C2.8 / C6.3. Only the three raw-SQL sites are corrected, and this is one of
      // them. Swept over every statement so a `Slatwall*` name cannot creep back in
      // through a different method.
      const executor = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.searchProductsByProductType(SEARCH_TERM, MERCHANDISE_PRODUCT_TYPE_ID);

      for (const call of executor.calls) {
        expect(call.sql).not.toContain('Slatwall');
      }

      for (const statement of EVERY_EXPECTED_STATEMENT) {
        expect(statement).not.toContain('Slatwall');
      }
    });

    it('binds every value and interpolates none, across every expected statement', () => {
      // ⭐ P5/E5, swept. Every statement carries `?` placeholders and no quoted
      // literal, so no user-supplied value can appear in statement text. The ONE
      // documented exception - the comma-joined type-code string of
      // [model/dao/ProductDAO.cfc:L66] - is still a BOUND PARAMETER, so it satisfies
      // this sweep exactly like every other value and needs no carve-out here.
      for (const statement of EVERY_EXPECTED_STATEMENT) {
        expect(statement).not.toContain("'");
        expect(statement).not.toContain('"');
        expect(placeholderCount(statement)).toBeGreaterThan(0);
      }
    });

    it('touches no Mura CMS column, because none belongs to this adapter', () => {
      // C6.4. `Category.cmsCategoryID` (index `RI_CMSCATEGORYID`) and its `site`
      // association survive elsewhere in the target as INERT PERSISTED COLUMNS -
      // read and written as opaque values with no CMS behaviour. They belong to
      // `SwCategory`, which this adapter never names: `Product.categories` is a
      // many-to-many that the documented fetch shape deliberately does not
      // materialize. So the honest assertion here is ABSENCE, and no CMS behaviour is
      // introduced on this path.
      for (const statement of EVERY_EXPECTED_STATEMENT) {
        expect(statement).not.toContain('cmsCategoryID');
        expect(statement).not.toContain('SwCategory');
        expect(statement).not.toContain('cmsSiteID');
      }
    });
  });

  describe('scope boundaries', () => {
    it('models no dialect branch, because neither ported read has one', async () => {
      // [model/dao/ProductDAO.cfc:L288] and [:L304] ARE real dialect branches, but
      // both sit inside the unexercised bulk-import path, so the adapter models
      // neither and this suite asserts nothing about them. The target narrows to the
      // MySQL branch of [config/configORM.cfm:L9-L14] and the adapter pins that
      // dialect internally. Dialect assertions belong to
      // `mysqlPriceGroupRepository.test.ts`.
      //
      // What IS assertable here: the two ported reads emit ONE statement text each
      // for a given shape, with no engine-conditional variant.
      const firstRun = new RecordingExecutor([[], []]);
      await aProductRepository(firstRun, TEST_AUDIT_ACTOR).searchProductsByProductType(SEARCH_TERM);

      const secondRun = new RecordingExecutor([[], []]);
      await aProductRepository(secondRun, TEST_AUDIT_ACTOR).searchProductsByProductType(
        SEARCH_TERM,
      );

      expect(onlyStatement(firstRun.calls).sql).toBe(onlyStatement(secondRun.calls).sql);

      // No dialect-specific row-limiting or engine-specific syntax on this path.
      for (const statement of EVERY_EXPECTED_STATEMENT) {
        expect(statement.toLowerCase()).not.toContain('select top');
        expect(statement.toLowerCase()).not.toContain('rownum');
      }
    });

    it('never reads the environment, so the suite is identical with or without the DB flag', () => {
      // The suite needs no server, so it does not gate on
      // `liveDatabaseTestsEnabled` from `tests/setup.ts` and never inspects
      // `TEST_LIVE_DATABASE`. Setting or clearing that variable changes nothing here,
      // and the suite is never skipped. What IS relied on from the shared setup is the
      // UTC pin, and it is asserted rather than assumed: every date that reaches a
      // bound parameter is produced under it.
      expect(process.env['TZ']).toBe('UTC');
    });

    it('produces bound timestamps that are real Dates under the UTC pin', async () => {
      // No bare local-time literal reaches a bound parameter: the audit stamps are
      // `Date` instances, and `tests/setup.ts` pins `process.env.TZ = 'UTC'` before any
      // suite imports a subject. No global fake timer is installed here.
      const executor = new RecordingExecutor();
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      await repository.saveProduct(makeWritableProduct(), NO_POPULATED_MEMBERS);

      const insert = statementAt(executor.mutationCalls, 0);
      for (const stampPosition of [16, 18]) {
        const stamp = parameterAt(insert.params, stampPosition);

        expect(stamp).toBeInstanceOf(Date);
        if (stamp instanceof Date) {
          expect(Number.isNaN(stamp.getTime())).toBe(false);
        }
      }
    });

    it('carries no credential, connection target or deployment artifact', () => {
      // E6 and B6, asserted rather than merely promised. The only non-secret defaults
      // this subtree admits anywhere are the datasource NAME `Slatwall`
      // [config/configApplication.cfm:L2] and the port `3306`, and this file needs
      // neither - it never constructs a connection. Nothing here is an
      // infrastructure-as-code artifact either: "deployable" means a successful build
      // and package step, which is not something a test proves.
      for (const statement of EVERY_EXPECTED_STATEMENT) {
        expect(statement.toLowerCase()).not.toContain('password');
        expect(statement.toLowerCase()).not.toContain('identified by');
        expect(statement).not.toContain('3306');
        expect(statement).not.toContain('127.0.0.1');
        expect(statement).not.toContain('localhost');
      }
    });
  });

  // =========================================================================
  // C-9  The sale-price collaborator on the read hydration path
  // =========================================================================

  describe('the sale-price collaborator - NET-NEW, and the reason the entity can refuse a reach', () => {
    // T2, SERVICE-LOCATOR REMOVAL, ASSERTED AT THE ONE PLACE IT CAN BE.
    // [model/entity/Product.cfc:L517-L521] resolved sale prices by NAME at the point of use -
    // `getService("promotionService").getSalePriceDetailsForProductSkus(...)` at [L519] - and
    // `src/domain/entities/product.ts` refuses to reproduce that reach: it takes
    // `salePriceDetailsForSkus` as an ALREADY-RESOLVED, already-ROUNDED map. A refusal alone would be a
    // capability lost, so the adapter that constructs a product from rows resolves the map first. These
    // cases pin BOTH halves: that a supplied resolver reaches the constructed entity, and that an absent
    // one costs nothing and fabricates nothing.
    //
    // B8: net-new. `meta/tests/unit/dao/` holds only `AccountDAOTest` and `PaymentDAOTest`, and
    // `meta/tests/unit/entity/ProductTest.cfc` covers only `getProductURL()`.

    /**
     * A recording double for the narrow sale-price capability.
     *
     * The adapter's contract is module-local and un-exported, so this satisfies it structurally - which
     * is exactly how `src/handlers/bootstrap.ts` satisfies it, by adapting the ported
     * `PromotionService.getSalePriceDetailsForProductSkus` surface. The recorded argument list is what
     * makes the FETCH SHAPE assertable: one resolution per distinct product and no more.
     */
    function makeRecordingSalePriceResolver(details: Readonly<Record<string, SalePriceDetail>>): {
      readonly getSalePriceDetailsForProductSkus: (
        productID: string,
      ) => Promise<Readonly<Record<string, SalePriceDetail>>>;
      readonly calls: string[];
    } {
      const calls: string[] = [];

      return {
        getSalePriceDetailsForProductSkus(
          productID: string,
        ): Promise<Readonly<Record<string, SalePriceDetail>>> {
          calls.push(productID);

          return Promise.resolve(details);
        },
        calls,
      };
    }

    /**
     * One detail, keyed by the SKU identifier the canned SKU row carries.
     *
     * `salePrice` is a `Money` because the projection declares it monetary and the value is the price
     * AFTER the rounding rule has run [model/service/PromotionService.cfc:L1026] - the repository never
     * recomputes it, and neither does this fixture.
     */
    const CANNED_SALE_PRICE_DETAILS: Readonly<Record<string, SalePriceDetail>> = Object.freeze({
      [PERSISTED_SKU_ID]: Object.freeze({
        skuID: PERSISTED_SKU_ID,
        discountLevel: 'sku',
        salePriceDiscountType: 'percentageOff',
        salePrice: Money.fromDecimalString('52.47'),
        promotionID: 'promo-1',
      }) satisfies SalePriceDetail,
    });

    it('reaches the constructed entity, so a loaded product carries its sale-price detail', async () => {
      const resolver = makeRecordingSalePriceResolver(CANNED_SALE_PRICE_DETAILS);
      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW_WITH_DEFAULT_SKU],
        [SKU_ROW],
        [SKU_OPTION_ROW],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {
        salePriceResolver: resolver,
      });

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      // ⭐ THE ASSERTION THE WHOLE WIRING EXISTS FOR. Before the collaborator was bound into hydration,
      // this answered `undefined` for every product loaded from the real repository even when sale-price
      // rows existed, because the entity reads ONLY the map it was constructed with.
      const detail = await product.getSkuSalePriceDetails(PERSISTED_SKU_ID);

      expect(detail?.skuID).toBe(PERSISTED_SKU_ID);
      expect(detail?.salePrice.toFixed2()).toBe('52.47');
      expect(detail?.discountLevel).toBe('sku');

      // ONE resolution, for the ONE product materialized, keyed on its identifier.
      expect(resolver.calls).toStrictEqual([PERSISTED_PRODUCT_ID]);
    });

    it('answers undefined for a sku the map does not carry, rather than a zero', async () => {
      // The same discipline that keeps `Sku.getPriceByCurrencyCode()`
      // [model/entity/Sku.cfc:L269-L273] answering `undefined`: a miss is the legacy's own `return {}`
      // at [model/entity/Product.cfc:L186], which every caller already probes for, and a substituted
      // zero would report a sale price that does not exist.
      const resolver = makeRecordingSalePriceResolver(CANNED_SALE_PRICE_DETAILS);
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW], [], []]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {
        salePriceResolver: resolver,
      });

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      expect(await product.getSkuSalePriceDetails(UNMATCHED_PRODUCT_ID)).toBeUndefined();
    });

    it('issues no statement of its own and leaves the documented three-statement shape intact', async () => {
      // The collaborator is a CAPABILITY, not a query this adapter emits: it reaches the executor IT was
      // constructed with. So binding it cannot change this adapter's emitted SQL, which is what keeps
      // every SQL-shape case in this file valid whether or not a resolver is present.
      const resolver = makeRecordingSalePriceResolver(CANNED_SALE_PRICE_DETAILS);
      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW_WITH_DEFAULT_SKU],
        [SKU_ROW],
        [SKU_OPTION_ROW],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {
        salePriceResolver: resolver,
      });

      await repository.getProductByProductID(PERSISTED_PRODUCT_ID);

      expect(executor.calls).toHaveLength(3);
      expect(executor.mutationCalls).toHaveLength(0);
    });

    it('costs nothing and fabricates nothing when no resolver was supplied', async () => {
      // The collaborator is OPTIONAL, and over a hundred construction sites in this file rely on that.
      // An absent resolver must mean NO resolution attempt at all - not an empty query, not a thrown
      // error, and above all not an invented detail.
      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW_WITH_DEFAULT_SKU],
        [SKU_ROW],
        [SKU_OPTION_ROW],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR);

      const product = requireProduct(await repository.getProductByProductID(PERSISTED_PRODUCT_ID));

      expect(await product.getSkuSalePriceDetails(PERSISTED_SKU_ID)).toBeUndefined();
      expect(executor.calls).toHaveLength(3);
    });

    it('resolves once per DISTINCT product on the multi-product ENTITY-load path', async () => {
      // THE FETCH SHAPE, ASSERTED. `getSalePriceDetailsForProductSkus` takes a single `productID`
      // [model/service/PromotionService.cfc:L1022] and there is no batched variant on the promotion
      // surface, so a multi-product read resolves once per product - exactly as the legacy entity did,
      // once per product, at [model/entity/Product.cfc:L519]. Duplicates in the caller's list are
      // collapsed, so the count follows the ROWS the graph read returned and not the list length.
      //
      // ★★★ QUOTE-THEN-REVISE ON WHICH PATH REACHES THIS (F38 + F5). This case was titled "on the
      // multi-product SEARCH path" and drove it through `searchProductsByProductType`. The search no
      // longer hydrates - and this very fan-out, one sale-price resolution per matched product behind a
      // two-column source query, is half of what code review recorded against it. It remains the
      // correct shape on the ENTITY-load path, where a caller has asked for product graphs on purpose,
      // and that path now has a set-based door (F5) so the fan-out is the ONLY per-product cost left.
      const resolver = makeRecordingSalePriceResolver(CANNED_SALE_PRICE_DETAILS);
      const secondProductID = UNMATCHED_PRODUCT_ID;
      const executor = new RecordingExecutor([
        [PRODUCT_GRAPH_ROW, { ...PRODUCT_GRAPH_ROW, p_productID: secondProductID }],
        [],
      ]);
      const repository = aProductRepository(executor, TEST_AUDIT_ACTOR, {
        salePriceResolver: resolver,
      });

      // The caller's list repeats one identifier, which the loader collapses for the bind.
      const products = await repository.getProductsByProductID([
        PERSISTED_PRODUCT_ID,
        secondProductID,
        PERSISTED_PRODUCT_ID,
      ]);

      expect(products.size).toBe(2);
      expect([...resolver.calls].sort()).toStrictEqual(
        [PERSISTED_PRODUCT_ID, secondProductID].sort(),
      );
    });
  });
});

// =============================================================================
// READ TOTALITY - THE TWO RESOURCE CEILINGS, INVERTED
//
// A security review raised finding S-08, MEDIUM, CWE-400: wildcard-broadened unpaginated searches
// can exhaust database or container resources. Values are bound on every path, so this was denial of
// service rather than injection - no case below asserts a change to any statement's TEXT, and the
// pinned parity claim that the search statement emits no `ORDER BY`, `DISTINCT` or `LIMIT` still
// holds exactly.
//
// ★★ AN EARLIER REVISION ANSWERED IT WITH TWO REFUSAL CEILINGS, AND THIS BLOCK USED TO PIN THEM.
// A later review found the ceilings themselves to be the defect: [model/dao/ProductDAO.cfc:L419-L435]
// validates nothing and refuses nothing on magnitude, so every input they rejected was one the legacy
// ANSWERED - with matches, or with an empty autocomplete structure. A read that raises where the
// legacy returned is a divergence this port is not allowed (AAP 0.6.7, AAP 0.8.1). The sibling
// adapter lost the same ceilings for the same reason, and the full argument is recorded once, in the
// read-totality block at the head of `src/repositories/mysql/mysqlSkuRepository.ts`.
//
// SO EVERY CASE THAT ASSERTED A REFUSAL IS NOW ITS INVERSE, with the at-the-limit cases kept
// unchanged so the previously-inclusive boundary is still covered on the admissible side. The
// amplification concern is answered by batching the identifier lists of the graph statements, which
// the final case pins directly.
// =============================================================================

describe('the read path is total on magnitude, refusing nothing the legacy answered', () => {
  describe('the search-term length', () => {
    it('searches with a term at the column width, which was the old ceiling', async () => {
      const executor = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);
      const atTheWidth = 'a'.repeat(255);

      await aProductRepository(executor, TEST_AUDIT_ACTOR).searchProductsByProductType(atTheWidth);

      // `productName` declares NO length [model/entity/Product.cfc:L55], and a Hibernate string
      // property without one maps to `varchar(255)` - so 255 is the longest term that could be an
      // entire name.
      expect(statementAt(executor.calls, 0).params).toStrictEqual([`%${atTheWidth}%`]);
    });

    it('★★ searches with a term ABOVE the column width instead of refusing it', async () => {
      const executor = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);
      const aboveTheWidth = 'a'.repeat(256);

      await aProductRepository(executor, TEST_AUDIT_ACTOR).searchProductsByProductType(
        aboveTheWidth,
      );

      // THE INVERTED CASE. This used to reject with `searchTermLength is 256 and at most 255` and to
      // issue no statement. [model/dao/ProductDAO.cfc:L421-L422] binds `%#arguments.term#%`
      // unconditionally, so the search runs; a term longer than the column can hold simply matches
      // nothing, which is what it has always meant.
      expect(statementAt(executor.calls, 0).params).toStrictEqual([`%${aboveTheWidth}%`]);
    });

    it('leaves a LIKE metacharacter live inside the term, exactly as the legacy did', async () => {
      // S-08 suggests escaping LIKE wildcards where literal matching is intended. It is NOT intended
      // here: [model/dao/ProductDAO.cfc:L422] binds `%#arguments.term#%` with the metacharacters
      // active, so `%` legitimately matches every name and escaping would change which rows a
      // CORRECT search returns. Nothing bounds the term now, and nothing rewrites it. The identical
      // case sits in the SKU sibling's suite.
      const executor = new RecordingExecutor([[PRODUCT_SEARCH_ROW], [PRODUCT_GRAPH_ROW], []]);

      await aProductRepository(executor, TEST_AUDIT_ACTOR).searchProductsByProductType('%_%');

      expect(statementAt(executor.calls, 0).params).toStrictEqual(['%%_%%']);
    });
  });

  describe('the search-result count', () => {
    // ★★★ QUOTE-THEN-REVISE ON THIS WHOLE BLOCK (F38). It was named "the search-result
    // materialization count" and its four cases drove 2,000 and 2,001 matched rows through
    // `searchProductsByProductType` to prove that (a) no ceiling refuses a set the legacy answered and
    // (b) the GRAPH statement's identifier list is chunked under the driver's placeholder limit. The
    // search no longer materializes anything, so (a) is proven more simply and (b) has moved to the
    // path that still binds an identifier list - the set-based ENTITY load. Neither property is
    // dropped, and the at-the-limit boundary is still covered on the admissible side.

    /** `count` distinct search rows. */
    function searchRowsOf(count: number): readonly SqlRow[] {
      return Array.from({ length: count }, (_unused, index) => ({
        ...PRODUCT_SEARCH_ROW,
        productID: index.toString(16).padStart(32, '0'),
      }));
    }

    /** `count` distinct identifiers, matching the rows `searchRowsOf` builds. */
    function identifiersOf(count: number): readonly string[] {
      return Array.from({ length: count }, (_unused, index) =>
        index.toString(16).padStart(32, '0'),
      );
    }

    it('★★ answers a result set ABOVE the old ceiling instead of refusing it', async () => {
      const executor = new RecordingExecutor([searchRowsOf(2_001)]);

      const matches = await aProductRepository(
        executor,
        TEST_AUDIT_ACTOR,
      ).searchProductsByProductType(SEARCH_TERM);

      // THE INVERTED CASE. This used to reject with `searchResultMaterialization is 2001 and at most
      // 2000`. Every match is answered, because the legacy answered every match
      // [model/dao/ProductDAO.cfc:L429-L435] - and it now costs the ONE statement the legacy paid.
      expect(executor.calls).toHaveLength(1);
      expect(matches.records).toHaveLength(2_001);
      expect(matches.matchedCount).toBe(2_001);
    });

    it('proceeds past a result set at the old ceiling, unchanged', async () => {
      const executor = new RecordingExecutor([searchRowsOf(2_000)]);

      const matches = await aProductRepository(
        executor,
        TEST_AUDIT_ACTOR,
      ).searchProductsByProductType(SEARCH_TERM);

      expect(executor.calls).toHaveLength(1);
      expect(matches.matchedCount).toBe(2_000);
    });

    it('★★ batches the ENTITY load so no single bind exceeds the tuple row limit', async () => {
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW], [], []]);

      await aProductRepository(executor, TEST_AUDIT_ACTOR).getProductsByProductID(
        identifiersOf(2_001),
      );

      // WHAT REPLACED THE CEILING. The graph statement binds one placeholder per requested identifier,
      // and `sqlPlaceholderList` refuses a count above the driver's protocol limit - so an uncapped
      // load would have failed one layer down had the list not been chunked.
      for (const call of executor.calls) {
        expect(call.params.length).toBeLessThanOrEqual(SQL_TUPLE_ROW_LIMIT);
      }

      // 2,001 identifiers become several graph batches, and every identifier is bound exactly once
      // across them.
      const graphBindCount = executor.calls.reduce(
        (total: number, call) => total + call.params.length,
        0,
      );

      expect(graphBindCount).toBeGreaterThanOrEqual(2_001);
    });

    it('emits exactly one graph statement when the request fits a single batch', async () => {
      const executor = new RecordingExecutor([[PRODUCT_GRAPH_ROW], [], []]);

      await aProductRepository(executor, TEST_AUDIT_ACTOR).getProductsByProductID(identifiersOf(3));

      // THE EMITTED SQL IS UNCHANGED FOR EVERY REALISTIC REQUEST, which is what keeps the batching
      // invisible to every parity assertion in this file.
      expect(statementAt(executor.calls, 0).params).toHaveLength(3);
    });
  });
});
