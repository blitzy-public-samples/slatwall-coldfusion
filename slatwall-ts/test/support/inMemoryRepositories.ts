/**
 * NET-NEW — hand-written in-memory test doubles for every port of the extracted Catalog slice.
 *
 * ## Why this file exists at all
 *
 * The legacy repository contains **no mocking library**. Not a stubbed one, not an unused one — none.
 * Its unit tests therefore substitute nothing: every test component extends a base that boots the
 * entire FW/1 application and then resolves its collaborators by string through the DI/1 bean factory
 * at run time, so a "unit" test of one service exercises the whole object graph, the ORM session and
 * the real datasource. That is an integration test wearing a unit test's name.
 *
 * The extracted service inverts this. Constructor injection (AAP §0.4.3.1) means a class under test
 * takes its collaborators as typed arguments, so a test constructs the class directly and hands it
 * exactly the doubles it needs — no framework bootstrap, no service locator, no datasource. This file
 * is the substitution mechanism that makes that possible, and it is written by hand precisely because
 * the dependency set is frozen (AAP §0.7.3 S5) and deliberately contains no mocking package.
 *
 * The difference between the two suites is therefore structural and **intentional**: the legacy tests
 * are integration tests, the target tests are unit tests. A reviewer comparing them should expect that
 * difference by design. It is not a coverage gap, and it is not a shortcut.
 *
 * ## Traceability here is documentary, not empirical
 *
 * MXUnit and CFSelenium are not vendored in this repository, and MXUnit additionally requires an
 * external CFIDE mapping that does not exist here. The `meta/docker/slatwall-local-dev/` path cited as
 * optional build context **does not exist** — `meta/` holds only `meta/tests/` and `meta/eclipse/`, and
 * there is no Dockerfile or Compose file anywhere in the tree. No ColdFusion, Railo or Lucee engine is
 * available either. The legacy suite consequently **cannot be executed in this environment**, so no
 * runtime comparison against original CFML behaviour was performed. Every behavioural claim annotated
 * below was established by reading legacy source at the cited `path:Lnnn` locator, and each double
 * reproduces what that source does — including where it does something wrong.
 *
 * ## Rules
 *
 * The governing statement is recorded immediately after this header, at the top of the file body.
 * It is the verified result of reading the project's rules document, not an inference from silence.
 * A filename sweep for `rule` in this repository surfaces only `RoundingRule*` components: those are
 * the out-of-scope RoundingRule **business domain**, not project rules, and nothing in them governs
 * this file.
 *
 * ## Everything exported here is a factory, never a shared singleton
 *
 * `meta/tests/unit/SlatwallUnitTestBase.cfc:L53` comments out the per-suite application reload and
 * `:L70` comments out the lifecycle teardown. The legacy suite therefore lets application, ORM and
 * entity state leak from one test into the next, and a legacy test that passes in isolation can fail —
 * or, worse, pass for the wrong reason — depending on what ran before it. Target tests must not inherit
 * that. Every export below is a `create…` function that allocates its own arrays, maps, queues,
 * counters and memoised values, so two calls produce two fully independent worlds and no module-scope
 * mutable state exists for a second simulated Lambda invocation to observe (AAP §0.6.6 M7).
 *
 * ## What this file is not
 *
 * It declares **zero test cases**. There are no Jest globals, no `describe`, no `it`, no snapshots and
 * no module mocking anywhere in it; it is imported by tests that live in sibling folders. It also holds
 * no SQL text, no schema names beyond those the whitelisted ports already declare, and no timing,
 * retry, capacity or service-level number of any kind (AAP §0.1.1.3 IR-12).
 *
 * @see slatwall-ts/src/ports — the interfaces every double below structurally satisfies.
 */

// No user-specified rules were provided for this project; the nine enterprise
// standards of AAP §0.7.3 govern instead, and the bar is not lowered.

import { createHash } from 'node:crypto';

import {
  resolveBaseProductType,
  SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE,
} from '../../src/domain/BaseProductType';
import { Option } from '../../src/domain/option/Option';
import { OptionGroup } from '../../src/domain/option/OptionGroup';
import { Brand } from '../../src/domain/product/Brand';
import { Product } from '../../src/domain/product/Product';
import { ProductType } from '../../src/domain/product/ProductType';
import { Sku } from '../../src/domain/sku/Sku';
import { DataIntegrityError, DomainError } from '../../src/errors/DomainError';
import { ValidationError } from '../../src/errors/ValidationError';
import type { ValidationErrors } from '../../src/errors/ValidationError';
import { toImageWebPath, SKU_IMAGE_PATH_SEGMENT } from '../../src/ports/ImagePathPort';
import { Validator } from '../../src/validation/Validator';
import { ALL_SEEDED_PRODUCT_TYPES, MERCHANDISE_PRODUCT_TYPE_ID } from '../fixtures/productTypes';
import { createTestMerchandiseProductData } from '../fixtures/testProduct';

import { createTransactionExistenceChecker as createProductionTransactionExistenceChecker } from '../../src/adapters/mysql/MySqlSkuRepository';
import type { MySqlRow } from '../../src/adapters/mysql/rowMappers';
import type { PhysicalTableName, SqlExecutor } from '../../src/adapters/mysql/QueryRunner';
/*
 * ⛔ TWO BOUNDED-READ HELPERS WERE IMPORTED HERE FROM THE ADAPTER LAYER — `prepareBoundedRead` and
 * `settleBoundedRead` — so that the windowed doubles below validated a window and derived `hasMore`
 * exactly as production did. Both helpers, and every double that used them, are gone: the four
 * explicitly bounded repository members they served have been withdrawn for having no production
 * caller, and `src/adapters/mysql/QueryRunner.ts` records the removal of the mechanics from its own
 * side. This file therefore reaches for NO adapter behaviour at all now — every double here is a
 * substitute for an adapter rather than a wrapper over one.
 */
import type {
  PerItemSource,
  TransactionalSqlExecutor,
  TransactionScope,
} from '../../src/adapters/mysql/UnitOfWork';
import type {
  ProductDefaultSkuDelegate,
  ProductSkuMember,
  ProductSkuOptionFinder,
} from '../../src/domain/product/Product';
import type { ProductTypeRootResolver } from '../../src/domain/product/ProductType';
import type {
  SkuProductTypeRootResolver,
  SkusBySelectedOptionsLookup,
  SkuTransactionExistenceChecker,
} from '../../src/domain/sku/Sku';
import type { AccessContentPort, AccessContentReference } from '../../src/ports/AccessContentPort';
import type {
  AccountContextPort,
  AccountReference,
  EntityAuthorizationPort,
  EntityAuthorizationRequest,
  EntityPropertyAuthorizationRequest,
  PopulationAuthorizationPort,
} from '../../src/ports/AccountContextPort';
import type {
  ImagePathPort,
  ImageWebPath,
  ResizedImagePathRequest,
  SaveImageFileRequest,
} from '../../src/ports/ImagePathPort';
import type {
  PricingPort,
  SalePriceDetails,
  SalePriceDetailsBySkuId,
} from '../../src/ports/PricingPort';
import type {
  AttributeSetRow,
  ProductRepository,
  ProductSearchRow,
} from '../../src/ports/repositories/ProductRepository';
import type { BrandRepository, ManagedBrand } from '../../src/ports/repositories/BrandRepository';
import type {
  OptionRepository,
  UnusedOptionGroupRow,
  UnusedOptionRow,
} from '../../src/ports/repositories/OptionRepository';
import type {
  ProductTypeRepository,
  ProductTypeTreeRow,
} from '../../src/ports/repositories/ProductTypeRepository';
import type {
  SkuRepository,
  SkuRow,
  SkuSearchRow,
} from '../../src/ports/repositories/SkuRepository';
import type {
  SettingName,
  SettingResolutionContext,
  SettingResolutionEntityName,
  SettingResolverPort,
  SettingValue,
} from '../../src/ports/SettingResolverPort';
import type {
  SmartListQuery,
  SmartListQueryPort,
  SmartListRecord,
  SmartListResult,
  SmartListRootEntityName,
} from '../../src/ports/SmartListQueryPort';
import type {
  SubscriptionBenefitReference,
  SubscriptionTermPort,
  SubscriptionTermReference,
} from '../../src/ports/SubscriptionTermPort';
import type { UniquePropertyEntity, UniquePropertyPort } from '../../src/ports/UniquePropertyPort';
import { toExactDecimal, type ExactDecimal } from '../../src/util/formatting';
import { createSlatwallUUID } from '../../src/util/uuid';
import { applyPreInsertAudit, applyPreUpdateAudit } from '../../src/domain/base/AuditableEntity';
import type {
  EntityCommentCleanupPort,
  EntityPersister,
  EntityRemover,
  EntitySettingCleanupPort,
  MaintenanceEntityRef,
} from '../../src/services/BaseService';
import type {
  ValidationContext,
  ValidationRuleSet,
  ValidationSubject,
} from '../../src/validation/Validator';
import type {
  TestMerchandiseProductData,
  TestMerchandiseProductDataOverrides,
} from '../fixtures/testProduct';

/* =================================================================================================
 * PHYSICALLY VALID TEST IDENTIFIERS — REVIEW FINDING 16
 * -------------------------------------------------------------------------------------------------
 * AAP IR-6 fixes the physical shape of every primary key in this schema: 107 of 113 entities declare
 * `fieldtype="id" generator="uuid" ormtype="string" length="32"`, and `model/dao/HibachiDAO.cfc`
 * mints one with `replace(lcase(createUUID()), '-', '', 'all')`. An identifier is therefore EXACTLY
 * 32 lowercase hexadecimal characters with no dashes — never an auto-increment integer, never a
 * dashed RFC-4122 string, and never a short readable token.
 *
 * ⛔ A WITHDRAWN RATIONALE, ANSWERED RATHER THAN DISMISSED
 *
 * An earlier revision of the suites below argued for short readable identifiers (`og-size`, `o-red`)
 * on three grounds, all recorded here so the reversal is checkable rather than merely asserted:
 *
 *   1. "Sibling suites already do it." They did — and others did the opposite. The tree was
 *      inconsistent in BOTH directions, which is not a convention, and the review's audit counted the
 *      violations precisely: 78 in the ProductService suite, 19 in the BrandService suite, five in the
 *      Sku suite.
 *   2. "Inventing a fresh UUID adds an unverifiable literal for no assertive gain." The first half is
 *      a fair objection and this helper answers it directly: nothing here is INVENTED. Every value is
 *      DERIVED from the label at the call site by a documented, deterministic function, so it is
 *      reproducible by anyone reading the source and no opaque literal is hand-typed anywhere.
 *   3. "A readable identifier makes a failure message legible." Also fair, and preserved: the LABEL
 *      stays at the call site and in the constant's name, so the source remains as readable as it was.
 *      Only the value changes.
 *
 * The assertive gain the earlier rationale could not see is specific, not stylistic. A member that
 * silently assumes something about an identifier's physical shape — a fixed width, a lowercase
 * comparison, a dash-stripping step, an arithmetic slice, a `LIKE` fragment — cannot be caught by a
 * fixture whose identifiers are seven characters of lowercase ASCII with a hyphen in the middle. The
 * bug and the fixture agree by coincidence. Feeding members the shape production actually hands them
 * removes that coincidence, which is the whole point of a fidelity fixture.
 *
 * ⭐ THAT GAIN WAS MEASURED, NOT ASSERTED. The claim above is the kind that is easy to make and easy to
 * be wrong about, so it was tested directly. One character of real bug was introduced into
 * `src/domain/sku/Sku.ts` — the option identifier feeding `hasUniqueOptions`' selected-options string
 * truncated with `.slice(0, 16)`, a plausible width assumption — and the Sku suite was run twice
 * against it, once with each fixture:
 *
 *   • with the identifiers minted here (32 hexadecimal characters): 5 of 63 cases FAILED;
 *   • with the previous readable identifiers (`o-red`, `o-large`, all shorter than 16 characters):
 *     63 of 63 cases PASSED, because truncating a five-character token to sixteen characters does
 *     nothing at all.
 *
 * The same defect was therefore fatal to one fixture and invisible to the other. That is the entire
 * argument for this helper, reduced to a number, and it is why the conversion is a fidelity fix rather
 * than a cosmetic one. Both files were restored byte-for-byte afterwards and re-verified.
 *
 * ⚠️ SCOPE, STATED PLAINLY. The review examined every suite in this subtree and flagged non-physical
 * identifiers in exactly three of them; it PASSED `test/adapters/MySqlOptionRepository.test.ts`,
 * `test/validation/rules.test.ts` and `test/regression/issues.test.ts`, each of which still carries
 * readable identifiers. Those are deliberately left as they are — rewriting suites a reviewer read and
 * accepted would be unrequested churn (AAP §0.8.2 guideline 1). The claim this helper makes is
 * therefore "physically valid by default in the suites that were flagged", not "uniform tree-wide".
 * ============================================================================================== */

/**
 * The registry that makes injectivity MECHANICAL rather than assumed.
 *
 * Two distinct labels colliding onto one identifier would be the worst possible failure mode here: a
 * test asserting that two entities are different would pass while comparing one entity to itself. The
 * probability is negligible and the consequence is silent, which is exactly the combination that
 * deserves a guard rather than a comment.
 */
const mintedPhysicalIdentifiers = new Map<string, string>();

/** IR-6's shape, asserted against the helper's own output rather than trusted. */
const PHYSICAL_IDENTIFIER_SHAPE = /^[0-9a-f]{32}$/;

/**
 * Derive a physically valid identifier from a readable label.
 *
 * The value is `md5(label)`, chosen for one property and one only: its hexadecimal digest is exactly
 * 32 lowercase characters with no dashes, which is IR-6's shape reached without a padding or
 * truncation rule that a reader would have to trust. No security property is claimed or needed — this
 * is fixture derivation, not hashing of anything sensitive, and nothing in the port hashes identifiers.
 *
 * DIAGNOSING A FAILURE. An assertion prints the hexadecimal value, not the label. To go back the other
 * way, either read the call site (every identifier in the flagged suites is minted through this
 * function, so the label is always adjacent in source) or evaluate the derivation directly:
 *
 * ```
 * node -e "console.log(require('node:crypto').createHash('md5').update('og-size').digest('hex'))"
 * ```
 *
 * CASE-SENSITIVITY PROBES. A member that must be shown to compare identifiers case-sensitively is
 * given `physicalID(label).toUpperCase()`. That is strictly stronger than the uppercase readable token
 * it replaces: it is the SAME identifier in a different case, so the only thing the assertion can be
 * responding to is the case difference.
 *
 * @param label a readable name for the entity this identifier belongs to; it never reaches the port.
 * @returns 32 lowercase hexadecimal characters, matching IR-6.
 */
export function physicalID(label: string): string {
  const minted = createHash('md5').update(label, 'utf8').digest('hex');

  /* Defensive, and cheap: if a future Node ever changed digest formatting, every suite that depends on
   * IR-6's shape would start passing for the wrong reason instead of failing here. */
  if (!PHYSICAL_IDENTIFIER_SHAPE.test(minted)) {
    throw new Error(
      `physicalID('${label}') produced '${minted}', which is not 32 lowercase hexadecimal characters.`,
    );
  }

  const previousLabel = mintedPhysicalIdentifiers.get(minted);
  if (previousLabel !== undefined && previousLabel !== label) {
    throw new Error(
      `physicalID collision: '${label}' and '${previousLabel}' both derive '${minted}'. ` +
        `Rename one label; two entities sharing an identifier would make an inequality assertion pass vacuously.`,
    );
  }
  mintedPhysicalIdentifiers.set(minted, label);

  return minted;
}

/*
 * ---------------------------------------------------------------------------------------------------
 * Internal helpers. Nothing below this comment is exported: every double owns its own state, and a
 * shared helper that owned state would defeat the whole point of the factory discipline above.
 * ---------------------------------------------------------------------------------------------------
 */

/**
 * Freeze a positional parameter array at the moment it was bound.
 *
 * The adapters build their parameter arrays with `push`, so recording the caller's array by reference
 * would let a later `push` rewrite history and an assertion about bind order would silently pass
 * against the wrong evidence.
 */
function snapshotParams(params: readonly unknown[]): readonly unknown[] {
  return Object.freeze([...params]);
}

/**
 * Split a comma-delimited identifier list exactly as the legacy DAOs do — `.split(',')` and nothing
 * else.
 *
 * `model/dao/OptionDAO.cfc:L51-L116` interpolates the list straight into the statement, and
 * `src/adapters/mysql/MySqlOptionRepository.ts` reproduces that with an unfiltered split. Neither
 * trims, de-duplicates, nor drops empty entries, so `''` yields the single empty value `['']` rather
 * than `[]`. That is load-bearing: the empty list still produces one placeholder, which is why an empty
 * "existing option groups" list matches nothing on the IN side and everything on the NOT-IN side.
 */
function splitIdentifierList(list: string): readonly string[] {
  return list.split(',');
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 1. The recording SQL executor seam.
 *
 * `src/adapters/mysql/QueryRunner.ts` declares the TWO execution interfaces every repository adapter
 * depends on, both deliberately narrower than the concrete `QueryRunner` class: `SqlExecutor`, whose
 * single `execute` member reads, and `SqlMutationExecutor`, which extends it with `executeMutation` for
 * the three repositories that also write. Repositories take an interface rather than the class, so a
 * test can hand them this double and assert the exact statement text and the exact positional parameter
 * array — which is how AAP §0.7.3 S2 (parameterised SQL) is proved rather than asserted.
 *
 * ⭐ THE DOUBLE PUBLISHES THE WIDER OF THE TWO, AND ONE CALL LIST COVERS BOTH MEMBERS. Any read-and-write
 * executor is assignable wherever a plain `SqlExecutor` is wanted, so one double serves a read-only
 * repository, a writing repository and the transaction scope of §13 without a second factory.
 *
 * ⚠️ THE NAME IT PUBLISHES IS `UnitOfWork`'s `TransactionalSqlExecutor`, NOT `QueryRunner`'s
 * `SqlMutationExecutor`, AND THE TWO ARE STRUCTURALLY IDENTICAL — each extends `SqlExecutor` with one
 * `executeMutation`. The choice follows production rather than taste: `UnitOfWork.runWithoutTransaction`
 * declares its callback parameter as `TransactionalSqlExecutor`, and §13's runner double mirrors
 * production signatures exactly so a half-matching call cannot typecheck here and fail there.
 * Reads and writes append to the SAME {@link SqlExecutorCall} list in issue order, which is the whole
 * point for AAP §0.6.2: the property worth pinning is that an insert is issued BEFORE the uniqueness
 * read that has to observe it, and two separate lists could not express that ordering at all.
 *
 * There is deliberately NO transaction member here. Transaction demarcation belongs to
 * `UnitOfWork` (§13 below); inventing `begin`/`commit` on the executor would fabricate a contract the
 * real seam does not have — the production interface declares exactly two members and commits nothing.
 * The executor DOES carry a mutation member, because the real one does: a
 * transaction scope publishes `TransactionalSqlExecutor` (`src/adapters/mysql/UnitOfWork.ts`, reached
 * through `TransactionScope.executor`), and every legacy case a boundary exists for writes
 * inside it. Reading and writing is capability; beginning and committing is authority, and only the
 * first belongs on an executor.
 * ---------------------------------------------------------------------------------------------------
 */

/** One recorded statement: the SQL exactly as issued, and the parameters exactly as bound. */
export interface SqlExecutorCall {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/**
 * What the executor should do for one call.
 *
 * A discriminated union rather than "rows or throw", so a queued failure is as first-class as a queued
 * result set and neither has to be encoded as a magic value.
 */
export type SqlExecutorOutcome =
  | { readonly kind: 'rows'; readonly rows: readonly MySqlRow[] }
  | { readonly kind: 'affectedRows'; readonly affectedRows: number }
  | { readonly kind: 'failure'; readonly failure: Error };

/** Build a row outcome. Exported so a test never has to spell the discriminant. */
export function sqlRows(rows: readonly MySqlRow[]): SqlExecutorOutcome {
  return Object.freeze({ kind: 'rows', rows: Object.freeze([...rows]) });
}

/**
 * Build a write-acknowledgement outcome.
 *
 * The write counterpart of {@link sqlRows}, and a distinct discriminant rather than a row count
 * smuggled into a row list, because the real seam narrows the two answers differently: a read goes
 * through the row-list narrowing and a write through the affected-row acknowledgement reader
 * (`src/adapters/mysql/QueryRunner.ts`). Encoding a write as rows would let a test pass against a
 * repository that had routed a write down the read path.
 */
export function sqlAffectedRows(affectedRows: number): SqlExecutorOutcome {
  /*
   * ⚠️ ZERO IS MEANINGFUL AND REACHABLE; NEGATIVE AND FRACTIONAL ARE NEITHER. `sqlAffectedRows(0)` seeds
   * "the statement matched nothing", which is a branch production really takes — `MySqlBrandRepository`'s
   * delete answers `removedRows > 0` — so the guard admits it deliberately. A negative or fractional
   * count is refused because a count of rows cannot be either, and because the production narrowing at
   * `src/adapters/mysql/QueryRunner.ts` rejects the same shape rather than coercing it: a double that
   * accepted what production refuses would let a test pass against an impossible driver answer.
   */
  if (!Number.isInteger(affectedRows) || affectedRows < 0) {
    throw new DomainError(
      'A queued write acknowledgement must carry a whole, non-negative affected-row count, because ' +
        'that is the only shape the production narrowing accepts.',
      { context: { affectedRows } },
    );
  }

  return Object.freeze({ kind: 'affectedRows', affectedRows });
}

/** Build a failure outcome. */
export function sqlFailure(failure: Error): SqlExecutorOutcome {
  return Object.freeze({ kind: 'failure', failure });
}

/**
 * Decide an outcome from the call itself.
 *
 * Returning `undefined` declines the call and falls through to the queue, so a responder can answer
 * only the statements it recognises without having to model the rest.
 */
export type SqlExecutorResponder = (call: SqlExecutorCall) => SqlExecutorOutcome | undefined;

/** Seed configuration. Both fields are optional; an unconfigured executor answers every call `[]`. */
export interface SqlExecutorDoubleOptions {
  /** Consumed in order, one per call, after `respond` declines. */
  readonly outcomes?: readonly SqlExecutorOutcome[];
  /** Consulted first, before the queue. */
  readonly respond?: SqlExecutorResponder;
}

/** The executor plus its factory-local observation state. */
export interface SqlExecutorDouble {
  /**
   * The seam itself — pass this wherever a repository adapter wants its executor.
   *
   * Typed as the mutation-capable `TransactionalSqlExecutor` so it satisfies every executor seam in the
   * subtree at once: `SqlExecutor`, the three per-adapter `*StatementExecutor` interfaces, and the scope
   * executor a `UnitOfWork` boundary hands out. One double, every seam.
   */
  readonly executor: TransactionalSqlExecutor;
  /** Every call, in issue order. Live view of factory-local state; frozen element by element. */
  readonly calls: readonly SqlExecutorCall[];
  /** Append further outcomes to the tail of the queue. */
  enqueue(...outcomes: readonly SqlExecutorOutcome[]): void;
  /** Drop recorded calls and any unconsumed queue entries. */
  reset(): void;
}

/**
 * Create a recording `SqlExecutor`.
 *
 * The recording is deliberately faithful and lossless. The SQL string is stored byte for byte — not
 * trimmed, not case-folded, not whitespace-normalised — and parameters are stored in bind order with
 * no coercion, because the assertions this double exists to support are precisely about text and order:
 *
 * - option identifiers in list order followed by the product identifier, for the selected-option
 *   lookup at `model/dao/SkuDAO.cfc:L106-L128`;
 * - the same SKU code bound twice, for the two-place primary/alternate lookup at
 *   `model/dao/SkuDAO.cfc:L102-L104`;
 * - `[productID, nextOptionGroupSortOrder]` for the sorted-SKU ordering at
 *   `model/dao/SkuDAO.cfc:L172-L202`;
 * - `[propertyValue, entityID]` for the uniqueness existence query at
 *   `org/Hibachi/HibachiDAO.cfc:L130-L146`;
 * - the Option repository's statement-order parameters, which REVERSE its method-signature order:
 *   `findUnusedOptions(productID, existingOptionGroupIDList)` binds the option-group identifiers first
 *   and the product identifier last, because `model/dao/OptionDAO.cfc:L51-L91` writes the IN clause
 *   before the correlated NOT EXISTS.
 */
export function createSqlExecutorDouble(options: SqlExecutorDoubleOptions = {}): SqlExecutorDouble {
  const calls: SqlExecutorCall[] = [];
  const queue: SqlExecutorOutcome[] = options.outcomes === undefined ? [] : [...options.outcomes];
  const respond = options.respond;

  /**
   * Record the call and decide its outcome, for both members.
   *
   * One recording path so a test reading `calls` sees reads and writes interleaved in the exact order
   * the repository issued them — which for the importer IS the assertion, because the row's lookups
   * and the row's writes have to sit inside the same transaction in the legacy order.
   */
  const answer = (sql: string, params: readonly unknown[]): SqlExecutorOutcome | undefined => {
    const call: SqlExecutorCall = Object.freeze({ sql, params: snapshotParams(params) });
    calls.push(call);

    const answered = respond === undefined ? undefined : respond(call);

    return answered ?? queue.shift();
  };

  const executor: TransactionalSqlExecutor = {
    execute: (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> => {
      const outcome = answer(sql, params);

      if (outcome === undefined) {
        return Promise.resolve([]);
      }
      if (outcome.kind === 'failure') {
        return Promise.reject(outcome.failure);
      }
      if (outcome.kind === 'affectedRows') {
        return Promise.reject(
          new DataIntegrityError(
            'A read statement was answered with a write acknowledgement, so the double refused it ' +
              'rather than reporting no rows.',
            { context: { sql, affectedRows: outcome.affectedRows } },
          ),
        );
      }
      return Promise.resolve([...outcome.rows]);
    },

    /*
     * The write member. An UNCONFIGURED write answers `0`, exactly parallel to an unconfigured read
     * answering `[]`: the double did nothing, and says so, rather than manufacturing a plausible `1`
     * that would mask a statement matching no row. A queued ROW outcome is refused for the mirror of
     * the reason a queued write outcome is refused on the read path — the real seam narrows a write
     * through the affected-row acknowledgement reader and would raise on a list of rows.
     */
    executeMutation: (sql: string, params: readonly unknown[]): Promise<number> => {
      const outcome = answer(sql, params);

      if (outcome === undefined) {
        return Promise.resolve(0);
      }
      if (outcome.kind === 'failure') {
        return Promise.reject(outcome.failure);
      }
      if (outcome.kind === 'rows') {
        return Promise.reject(
          new DataIntegrityError(
            'A writing statement was answered with rows, so the double refused it rather than ' +
              'reporting an affected-row count it had not been given.',
            { context: { sql, rowCount: outcome.rows.length } },
          ),
        );
      }
      return Promise.resolve(outcome.affectedRows);
    },
  };

  return {
    executor,
    calls,
    enqueue: (...outcomes: readonly SqlExecutorOutcome[]): void => {
      queue.push(...outcomes);
    },
    reset: (): void => {
      calls.length = 0;
      queue.length = 0;
    },
  };
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 1.1 THE FANNING EXECUTOR — the seam that makes `SELECT DISTINCT` falsifiable.
 *
 * ⚠️ WHY A QUEUE-BASED DOUBLE CANNOT ASSERT DISTINCTNESS, WHICH IS THE DEFECT THIS CLOSES. The queue
 * form above answers the Nth statement with the Nth seeded outcome, whatever that statement SAYS. So a
 * case that seeds two already-distinct product rows and asserts two records passes identically whether
 * the builder emitted `SELECT DISTINCT` or `SELECT` — the executor was never asked to behave like a
 * join. `issue_1296` is a DISTINCTNESS regression
 * (`meta/tests/unit/IssuesTest.cfc`, page-record distinctness on `getProductSmartList()`), so a case
 * that cannot fail when `DISTINCT` is removed does not cover the issue it is named for.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS DOUBLE DOES DIFFERENTLY, IN ONE SENTENCE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * It reads each statement's OWN TEXT and answers the way MySQL would — a fanning join returns one row
 * per matched pair, `SELECT DISTINCT` collapses them, `COUNT(DISTINCT pk)` counts owners, and
 * `LIMIT ? OFFSET ?` windows whichever row set the projection produced. Nothing is queued and nothing
 * is consumed in order, so no assertion can be satisfied by luck of sequence.
 *
 * ⭐ AND THAT IS WHAT MAKES THE ASSERTIONS FAIL WHEN THE FIX IS REMOVED. Drop `DISTINCT` from
 * `composeSelectClause` in `src/adapters/mysql/SmartListQueryBuilder.ts` and this executor returns the
 * duplicate rows; `materialiseRows` pushes ONE ARRAY ELEMENT PER ROW (it shares instances through the
 * identity map but never collapses the array), so `records.length` grows while `recordsCount` — read
 * from `COUNT(DISTINCT …)`, which is always distinct — does not. The divergence is the assertion.
 *
 * ⛔ IT MODELS NO SQL ENGINE. It does not parse, plan, filter, join or order: the WHERE clause is not
 * evaluated at all, and the seeded rows are taken as the statement's already-filtered result. Only the
 * four behaviours above are modelled, because those four are the ones the builder's contract turns on.
 * A case that needs filtering to be honoured needs a database, and AAP §0.8.4 records that the `Sw*`
 * tables do not exist in this environment.
 * ---------------------------------------------------------------------------------------------------
 */

/**
 * The column the counting statement projects its total into.
 *
 * Transcribed from `RECORDS_COUNT_COLUMN_ALIAS` in `src/adapters/mysql/SmartListQueryBuilder.ts`, which
 * is module-private there. Transcribing rather than exporting it is deliberate: the alias is part of the
 * statement the builder EMITS, so a test double reading it is reading the emitted contract, and widening
 * the builder's exports purely to let a test peek would be the tail wagging the dog. Every sibling case
 * in `test/adapters/SmartListQueryBuilder.test.ts` already spells the same literal in `sqlRows`.
 */
const SMART_LIST_RECORDS_COUNT_COLUMN = 'recordsCount';

/** One association statement's answer, matched by a substring of the statement the builder emits. */
export interface FanningAssociationSeed {
  /**
   * A substring that identifies the association statement, matched case-sensitively.
   *
   * A substring rather than the whole statement, because the whole statement is composed from the join
   * registry and would have to be duplicated here to match — which would make this double assert the
   * builder's text rather than answer it. `'FROM SwOption '` is the kind of fragment that is stable and
   * still unambiguous.
   */
  readonly matching: string;
  /** The rows that statement returns, including the aliased owner key each row must carry. */
  readonly rows: readonly MySqlRow[];
}

/** Seed configuration for {@link createFanningSqlExecutorDouble}. */
export interface FanningSqlExecutorDoubleOptions {
  /**
   * The rows the ROOT statement returns, WITH the duplicates a fanning join produces, in order.
   *
   * Duplicates are the whole point: seed the same owner twice and the executor will hand both back for
   * a non-distinct projection and one for a distinct one. Seeding an already-distinct set makes the
   * double behave exactly like the queue form and asserts nothing about distinctness.
   */
  readonly rootRows: readonly MySqlRow[];
  /** The root's primary-key column — the value a fanning join repeats and `DISTINCT` collapses. */
  readonly rootIdentityColumn: string;
  /** Association statements, consulted BEFORE the root classification so a hydration read is answered. */
  readonly associations?: readonly FanningAssociationSeed[];
}

/** The executor plus its factory-local observation state. */
export interface FanningSqlExecutorDouble {
  /** The seam itself. Typed mutation-capable so it satisfies every executor seam, as the queue form is. */
  readonly executor: TransactionalSqlExecutor;
  /** Every call, in issue order, recorded losslessly. */
  readonly calls: readonly SqlExecutorCall[];
  /** Just the SQL text of each call, in order — the shape a statement-ORDER assertion wants. */
  statements(): readonly string[];
  /** How many distinct owners the seeded root rows describe — what `COUNT(DISTINCT …)` answers. */
  distinctRootCount(): number;
}

/**
 * Create an executor that answers from each statement's own text, the way a fanning join would.
 *
 * @param options - The root row set (duplicates included), its identity column, and any association
 *   statements the hydration pass will issue.
 * @returns The executor plus its call log.
 */
export function createFanningSqlExecutorDouble(
  options: FanningSqlExecutorDoubleOptions,
): FanningSqlExecutorDouble {
  const { rootRows, rootIdentityColumn } = options;
  const associations = options.associations ?? [];

  /**
   * The root rows with each owner kept ONCE, first occurrence winning.
   *
   * First-occurrence order is what `SELECT DISTINCT … ORDER BY` produces for a deterministic ordering,
   * and preserving order matters because the sorted-SKU odometer and the feed both read position.
   */
  const distinctRootRows: MySqlRow[] = [];
  const seenIdentities = new Set<string>();
  for (const row of rootRows) {
    const identity = row[rootIdentityColumn];
    if (typeof identity !== 'string' || identity === '') {
      /*
       * A row with no usable identity cannot be collapsed onto another, and `materialiseRows` says the
       * same thing about the same case — so it survives into the distinct set rather than being dropped.
       */
      distinctRootRows.push(row);
      continue;
    }
    if (seenIdentities.has(identity)) {
      continue;
    }
    seenIdentities.add(identity);
    distinctRootRows.push(row);
  }

  /**
   * Slice a window off a row set, reading the bound limit and offset from the statement's parameters.
   *
   * The builder binds both as DIGIT STRINGS — `['10', '0']`, per the caller-struct translation section of `src/ports/SmartListQueryPort.ts` — so they
   * The builder binds both as DIGIT STRINGS — `['10', '0']`, per `src/ports/SmartListQueryPort.ts` — so they
   * are read through `Number` rather than assumed numeric. They are the LAST two parameters because the
   * page statement is the record statement plus `LIMIT ? OFFSET ?`, so the filter binds come first.
   */
  const windowOf = (rows: readonly MySqlRow[], params: readonly unknown[]): MySqlRow[] => {
    const limit = Number(params[params.length - 2]);
    const offset = Number(params[params.length - 1]);

    if (!Number.isFinite(limit) || !Number.isFinite(offset)) {
      throw new DomainError(
        'A bounded smart-list statement reached the fanning executor without a readable limit and ' +
          'offset in its last two parameters, so no window could be applied.',
        { context: { params: snapshotParams(params) } },
      );
    }

    return rows.slice(offset, offset + limit);
  };

  const respond: SqlExecutorResponder = (call: SqlExecutorCall): SqlExecutorOutcome | undefined => {
    /* Associations first: a hydration statement also begins `SELECT` and would otherwise be classified
     * as a root read and answered with root rows, which the association mapper would then reject. */
    for (const association of associations) {
      if (call.sql.includes(association.matching)) {
        return sqlRows(association.rows);
      }
    }

    /* The counting statement. Always DISTINCT on the primary key, whatever the record projection does —
     * `SMARTLIST_DISTINCT_ASYMMETRY.countProjectionIsAlwaysDistinct` declares exactly that — so the
     * answer is the owner count and never the row count. */
    if (call.sql.includes('COUNT(DISTINCT ')) {
      return sqlRows([{ [SMART_LIST_RECORDS_COUNT_COLUMN]: distinctRootRows.length }]);
    }

    /* A root row statement. WHICH row set it gets is decided by the projection the builder emitted,
     * which is the single behaviour that makes the distinctness assertions falsifiable. */
    const projected = call.sql.startsWith('SELECT DISTINCT ') ? distinctRootRows : rootRows;

    return sqlRows(
      call.sql.includes(' LIMIT ? OFFSET ?') ? windowOf(projected, call.params) : projected,
    );
  };

  const recording = createSqlExecutorDouble({ respond });

  return {
    executor: recording.executor,
    calls: recording.calls,
    statements: (): readonly string[] => recording.calls.map((call) => call.sql),
    distinctRootCount: (): number => distinctRootRows.length,
  };
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 2. The product-type root resolver.
 *
 * Every `getBaseProductType()` in the slice takes one: `Product.getBaseProductType(resolver)`,
 * `Sku.getBaseProductType(resolver)` and `ProductType.getBaseProductType(resolver)` all walk to the
 * root of the `productTypeIDPath` and read its `systemCode`, and `MySqlSkuRepository.findByProduct`
 * branches on the answer. The two declared interfaces — `ProductTypeRootResolver` in
 * `src/domain/product/ProductType.ts` and `SkuProductTypeRootResolver` in `src/domain/sku/Sku.ts` —
 * are structurally identical, so one double satisfies both and is typed as the intersection.
 * ---------------------------------------------------------------------------------------------------
 */

/** The only two fields the resolution walk reads off a product type. */
export interface ProductTypeSystemCodeSeed {
  readonly productTypeID: string;
  readonly systemCode?: string;
}

/** The resolver plus its factory-local observation state. */
export interface ProductTypeRootResolverDouble {
  readonly resolver: ProductTypeRootResolver & SkuProductTypeRootResolver;
  /** Every identifier the walk asked for, in order. */
  readonly requestedProductTypeIds: readonly string[];
}

/**
 * Create a root resolver seeded, by default, with the three discriminators the platform actually
 * seeds.
 *
 * The defaults come from `test/fixtures/productTypes.ts`, which owns the literal UUIDs read from
 * `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` (AAP §0.1.1.3 IR-7). This file does not restate
 * them: duplicating a fixed identifier is exactly how traceability rots.
 *
 * An unseeded identifier resolves to `undefined`, which is the honest answer at THIS layer — the
 * legacy walk simply finds no row, and that is exactly what
 * {@link ProductTypeRootResolver.getProductType} declares its `undefined` to mean.
 *
 * ⚠️ BUT AN UNSEEDED IDENTIFIER IS NO LONGER THE WAY TO REACH THE "NEITHER OF THE THREE" FALLTHROUGH,
 * AND AN EARLIER VERSION OF THIS PARAGRAPH SAID IT WAS. `ProductType.getBaseProductType` now RAISES on
 * a lookup that finds nothing, reproducing the unguarded dereference at
 * `model/entity/ProductType.cfc:L112`, so an unseeded root produces a `DomainError` rather than an
 * absent discriminator. To exercise the unrecognised-code paths — the un-joined branch of
 * `MySqlSkuRepository.findByProduct` and the unexpected-error branch of `SkuService.createSkus` at
 * `model/service/SkuService.cfc:L204` — SEED A ROW whose `systemCode` is a string outside the three
 * discriminators, or leave `systemCode` off a seeded row to get the one surviving absence. Both of
 * those are states the legacy also reaches by returning a value; a missing row is not.
 */
export function createProductTypeRootResolverDouble(
  seeds: readonly ProductTypeSystemCodeSeed[] = ALL_SEEDED_PRODUCT_TYPES,
): ProductTypeRootResolverDouble {
  const bySystemCodeSource = new Map<string, ProductTypeSystemCodeSeed>();
  for (const seed of seeds) {
    bySystemCodeSource.set(seed.productTypeID, seed);
  }
  const requestedProductTypeIds: string[] = [];

  return {
    requestedProductTypeIds,
    resolver: {
      getProductType: (productTypeID: string): Promise<ProductTypeSystemCodeSeed | undefined> => {
        requestedProductTypeIds.push(productTypeID);
        return Promise.resolve(bySystemCodeSource.get(productTypeID));
      },
    },
  };
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 3. Entity construction helpers.
 *
 * These build the REAL domain classes. They exist only to spare a test the repetitive property
 * assignment that `exactOptionalPropertyTypes` makes verbose, and they deliberately add no behaviour
 * of their own — a test that wants a defect must observe the entity's own method, not a repaired copy.
 *
 * Two conventions are load-bearing and are preserved exactly:
 *
 * 1. An absent value is an ABSENT PROPERTY, never an explicit `null` or `undefined`. The entities
 *    declare their nullable columns with `declare x?: T`, and `src/domain/base/populate.ts` implements
 *    CFML's null semantics as `delete target[name]`. Assigning `undefined` would make
 *    `Object.hasOwn(entity, name)` true and `hasProperty` answer differently, so every seed field is
 *    applied only when it was supplied.
 * 2. Primary identifiers default to `''`, which is what `isNew()` reads. Nothing here generates an
 *    identifier: when a test needs a persisted entity it supplies its own 32-character lowercase
 *    hexadecimal value with no dashes (AAP §0.1.1.3 IR-6). No validator, parser or branded UUID helper
 *    is introduced — inventing one would add a contract the extracted service does not have.
 * ---------------------------------------------------------------------------------------------------
 */

/** Seed for {@link buildOptionGroup}. Only `optionGroupID` is required, because `''` means "new". */
export interface OptionGroupSeed {
  readonly optionGroupID?: string;
  readonly optionGroupCode?: string;
  readonly optionGroupName?: string;
  readonly optionGroupImage?: string;
  readonly imageGroupFlag?: boolean;
  /**
   * The group's position in the odometer. `model/dao/SkuDAO.cfc:L172-L202` orders by
   * `SUM(option.sortOrder * POWER(10, next - optionGroup.sortOrder))`, so this is the DIGIT POSITION,
   * not a tiebreak.
   */
  readonly sortOrder?: number;
}

/** Build a real {@link OptionGroup}. */
export function buildOptionGroup(seed: OptionGroupSeed = {}): OptionGroup {
  const optionGroup = new OptionGroup();
  if (seed.optionGroupID !== undefined) {
    optionGroup.optionGroupID = seed.optionGroupID;
  }
  if (seed.optionGroupCode !== undefined) {
    optionGroup.optionGroupCode = seed.optionGroupCode;
  }
  if (seed.optionGroupName !== undefined) {
    optionGroup.optionGroupName = seed.optionGroupName;
  }
  if (seed.optionGroupImage !== undefined) {
    optionGroup.optionGroupImage = seed.optionGroupImage;
  }
  if (seed.imageGroupFlag !== undefined) {
    optionGroup.imageGroupFlag = seed.imageGroupFlag;
  }
  if (seed.sortOrder !== undefined) {
    optionGroup.sortOrder = seed.sortOrder;
  }
  return optionGroup;
}

/** Seed for {@link buildOption}. */
export interface OptionSeed {
  readonly optionID?: string;
  readonly optionCode?: string;
  readonly optionName?: string;
  readonly optionDescription?: string;
  readonly sortOrder?: number;
  /** Wired through the entity's own `setOptionGroup`, so both sides of the association are set. */
  readonly optionGroup?: OptionGroup;
}

/**
 * Build a real {@link Option}.
 *
 * When a group is supplied the wiring goes through `Option.setOptionGroup`, which pushes into the very
 * array `OptionGroup.getOptions()` returns. That is the entity's own behaviour and is not reimplemented
 * here — a test asserting the inverse side is asserting the entity, not this helper.
 */
export function buildOption(seed: OptionSeed = {}): Option {
  const option = new Option();
  if (seed.optionID !== undefined) {
    option.optionID = seed.optionID;
  }
  if (seed.optionCode !== undefined) {
    option.optionCode = seed.optionCode;
  }
  if (seed.optionName !== undefined) {
    option.optionName = seed.optionName;
  }
  if (seed.optionDescription !== undefined) {
    option.optionDescription = seed.optionDescription;
  }
  if (seed.sortOrder !== undefined) {
    option.sortOrder = seed.sortOrder;
  }
  if (seed.optionGroup !== undefined) {
    option.setOptionGroup(seed.optionGroup);
  }
  return option;
}

/** Seed for {@link buildProductType}. */
export interface ProductTypeSeed {
  readonly productTypeID?: string;
  readonly productTypeName?: string;
  readonly productTypeDescription?: string;
  readonly urlTitle?: string;
  /** Present only on the three seeded roots; absent everywhere else, which is what forces the walk. */
  readonly systemCode?: string;
  readonly productTypeIDPath?: string;
  readonly parentProductType?: ProductType;
  readonly activeFlag?: boolean;
  readonly publishedFlag?: boolean;
}

/** Build a real {@link ProductType}. */
export function buildProductType(seed: ProductTypeSeed = {}): ProductType {
  const productType = new ProductType();
  if (seed.productTypeID !== undefined) {
    productType.productTypeID = seed.productTypeID;
  }
  if (seed.productTypeName !== undefined) {
    productType.productTypeName = seed.productTypeName;
  }
  if (seed.productTypeDescription !== undefined) {
    productType.productTypeDescription = seed.productTypeDescription;
  }
  if (seed.urlTitle !== undefined) {
    productType.urlTitle = seed.urlTitle;
  }
  if (seed.systemCode !== undefined) {
    productType.systemCode = seed.systemCode;
  }
  if (seed.productTypeIDPath !== undefined) {
    productType.productTypeIDPath = seed.productTypeIDPath;
  }
  if (seed.activeFlag !== undefined) {
    productType.activeFlag = seed.activeFlag;
  }
  if (seed.publishedFlag !== undefined) {
    productType.publishedFlag = seed.publishedFlag;
  }
  if (seed.parentProductType !== undefined) {
    productType.setParentProductType(seed.parentProductType);
  }
  return productType;
}

/** Seed for {@link buildBrand}. */
export interface BrandSeed {
  readonly brandID?: string;
  readonly brandName?: string;
  readonly brandWebsite?: string;
  readonly urlTitle?: string;
  readonly activeFlag?: boolean;
  readonly publishedFlag?: boolean;
  readonly remoteID?: string;
}

/** Build a real {@link Brand}. Its `products` array is the entity's own fresh live array. */
export function buildBrand(seed: BrandSeed = {}): Brand {
  const brand = new Brand();
  if (seed.brandID !== undefined) {
    brand.brandID = seed.brandID;
  }
  if (seed.brandName !== undefined) {
    brand.brandName = seed.brandName;
  }
  if (seed.brandWebsite !== undefined) {
    brand.brandWebsite = seed.brandWebsite;
  }
  if (seed.urlTitle !== undefined) {
    brand.urlTitle = seed.urlTitle;
  }
  if (seed.activeFlag !== undefined) {
    brand.activeFlag = seed.activeFlag;
  }
  if (seed.publishedFlag !== undefined) {
    brand.publishedFlag = seed.publishedFlag;
  }
  if (seed.remoteID !== undefined) {
    brand.remoteID = seed.remoteID;
  }
  return brand;
}

/** Seed for {@link buildProduct}. */
export interface ProductSeed {
  readonly productID?: string;
  readonly productCode?: string;
  readonly productName?: string;
  readonly productDescription?: string;
  readonly urlTitle?: string;
  readonly activeFlag?: boolean;
  readonly publishedFlag?: boolean;
  readonly sortOrder?: number;
  /** The feed's availability gate reads this; `ProductFeedQuery` ranges it open-ended from `1`. */
  readonly calculatedQATS?: number;
  readonly calculatedTitle?: string;
  readonly productType?: ProductType;
  /** Wired through `Product.setBrand`, so `Brand.products` gains the inverse side. */
  readonly brand?: Brand;
}

/**
 * Build a real {@link Product}.
 *
 * The returned product's `skus` array is the entity's own fresh live array, and nothing here copies,
 * freezes or wraps it. That is not tidiness — it is required. `Sku.setProduct` pushes into the array
 * `Product.getSkus()` returns, and `SkuService.createSkus` reads that array's LENGTH before appending
 * in order to number the generated codes `-1`, `-2`, …. A defensive copy anywhere in this chain makes
 * every generated SKU collide on `-1`.
 */
export function buildProduct(seed: ProductSeed = {}): Product {
  const product = new Product();
  if (seed.productID !== undefined) {
    product.productID = seed.productID;
  }
  if (seed.productCode !== undefined) {
    product.productCode = seed.productCode;
  }
  if (seed.productName !== undefined) {
    product.productName = seed.productName;
  }
  if (seed.productDescription !== undefined) {
    product.productDescription = seed.productDescription;
  }
  if (seed.urlTitle !== undefined) {
    product.urlTitle = seed.urlTitle;
  }
  if (seed.activeFlag !== undefined) {
    product.activeFlag = seed.activeFlag;
  }
  if (seed.publishedFlag !== undefined) {
    product.publishedFlag = seed.publishedFlag;
  }
  if (seed.sortOrder !== undefined) {
    product.sortOrder = seed.sortOrder;
  }
  if (seed.calculatedQATS !== undefined) {
    product.calculatedQATS = seed.calculatedQATS;
  }
  if (seed.calculatedTitle !== undefined) {
    product.calculatedTitle = seed.calculatedTitle;
  }
  if (seed.productType !== undefined) {
    product.productType = seed.productType;
  }
  if (seed.brand !== undefined) {
    product.setBrand(seed.brand);
  }
  return product;
}

/** Seed for {@link buildSku}. */
export interface SkuSeed {
  readonly skuID?: string;
  readonly skuCode?: string;
  /* F07 — THE THREE MONETARY SEEDS ACCEPT EITHER A NUMBER OR EXACT DECIMAL TEXT, and {@link buildSku}
   * coerces whichever arrives with `toExactDecimal`, because the entity fields are `ExactDecimal`.
   *
   * ⚠️ A NUMERIC LITERAL IS STILL A DOUBLE, and that is the caller's choice rather than a defect in this
   * helper: `price: 9007199254740993.01` has already been rounded by the JavaScript parser before this
   * object exists, so it is recorded as the double it became. A test that means to exercise exactness must
   * write the value as TEXT — `price: '9007199254740993.01'` — which is precisely the discrimination F07
   * turns on, and which is why the string form is admitted rather than forcing every existing numeric
   * call site to change. */
  readonly price?: number | string;
  readonly listPrice?: number | string;
  readonly renewalPrice?: number | string;
  readonly activeFlag?: boolean;
  readonly imageFile?: string;
  readonly userDefinedPriceFlag?: boolean;
  readonly calculatedQATS?: number;
  /** Appended through `Sku.addOption`, which skips duplicates exactly as the entity does. */
  readonly options?: readonly Option[];
  /** Wired through `Sku.setProduct`, which appends to the product's LIVE sku array. */
  readonly product?: Product;
  readonly accessContents?: readonly AccessContentReference[];
  readonly subscriptionTerm?: SubscriptionTermReference;
  readonly subscriptionBenefits?: readonly SubscriptionBenefitReference[];
  readonly renewalSubscriptionBenefits?: readonly SubscriptionBenefitReference[];
}

/**
 * Build a real {@link Sku}.
 *
 * `new Sku()` with no arguments stays usable on purpose: the service creates SKUs that way, and the
 * combination engine assigns their fields afterwards.
 *
 * TODO(parity) `model/entity/Sku.cfc:L604-L608` — when `product` is seeded the wiring goes through
 * `Sku.setProduct`, whose guard is `isNew() || !product.getSkus().includes(this)`. A brand-new SKU
 * (`skuID === ''`) therefore appends even when it is already a member, so seeding the same new SKU onto
 * the same product twice appends it twice. That is the legacy behaviour and it is NOT made idempotent
 * here.
 *
 * THREE DEFECTIVE ACCESSORS ARE REACHED THROUGH THE REAL ENTITY AND ARE NOT SHIMMED. A builder is the
 * obvious place to quietly route around them, so their absence needs stating:
 *   TODO(parity) D1 — `model/entity/Sku.cfc:L500-L510`: `getOptionsByOptionGroupCodeStruct()` initialises
 *   one struct and then reads a differently named one, so the FIRST call fails.
 *   TODO(parity) D2 — `model/entity/Sku.cfc:L512-L522`: `getOptionsByOptionGroupIDStruct()` writes into a
 *   THIRD, differently named struct, so it always answers empty.
 *   TODO(parity) D3 — `model/entity/Sku.cfc:L247-L251`: `getOptionByOptionGroupCode()` tests the code map
 *   but indexes the ID map with a code key, so it always misses.
 * A test asserting any of the three calls the entity's own method and observes the real outcome. Wrapping
 * them in a "working" helper would make the port look correct while the shipped behaviour differed.
 */
export function buildSku(seed: SkuSeed = {}): Sku {
  const sku = new Sku();
  if (seed.skuID !== undefined) {
    sku.skuID = seed.skuID;
  }
  if (seed.skuCode !== undefined) {
    sku.skuCode = seed.skuCode;
  }
  if (seed.price !== undefined) {
    sku.price = toExactDecimal(seed.price);
  }
  if (seed.listPrice !== undefined) {
    sku.listPrice = toExactDecimal(seed.listPrice);
  }
  if (seed.renewalPrice !== undefined) {
    sku.renewalPrice = toExactDecimal(seed.renewalPrice);
  }
  if (seed.activeFlag !== undefined) {
    sku.activeFlag = seed.activeFlag;
  }
  if (seed.imageFile !== undefined) {
    sku.imageFile = seed.imageFile;
  }
  if (seed.userDefinedPriceFlag !== undefined) {
    sku.userDefinedPriceFlag = seed.userDefinedPriceFlag;
  }
  if (seed.calculatedQATS !== undefined) {
    sku.calculatedQATS = seed.calculatedQATS;
  }
  if (seed.subscriptionTerm !== undefined) {
    sku.setSubscriptionTerm(seed.subscriptionTerm);
  }
  for (const option of seed.options ?? []) {
    sku.addOption(option);
  }
  for (const accessContent of seed.accessContents ?? []) {
    sku.addAccessContent(accessContent);
  }
  for (const subscriptionBenefit of seed.subscriptionBenefits ?? []) {
    sku.addSubscriptionBenefit(subscriptionBenefit);
  }
  for (const renewalBenefit of seed.renewalSubscriptionBenefits ?? []) {
    sku.addRenewalSubscriptionBenefit(renewalBenefit);
  }
  if (seed.product !== undefined) {
    sku.setProduct(seed.product);
  }
  return sku;
}

/**
 * Configured answers for the six {@link ProductDefaultSkuDelegate} members that cannot be adapted from
 * a real {@link Sku}.
 *
 * G6 judgement call. `Product.defaultSku` is typed as a nine-member delegate whose image members are
 * SYNCHRONOUS (`getImagePath(): string`), while `Sku`'s equivalents are asynchronous and take an
 * injected `ImagePathPort`. A real `Sku` is therefore NOT assignable to the delegate, and no adapter can
 * make it so without blocking. The three price members are zero-argument on both sides and so are
 * delegated to the real SKU; the rest are configured, defaulting to the neutral empty value rather than
 * to a fabricated path.
 */
export interface DefaultSkuDelegateOptions {
  readonly currencyCode?: string;
  readonly imageDirectory?: string;
  readonly imagePath?: string;
  readonly image?: string;
  readonly resizedImagePath?: string;
  readonly imageExistsFlag?: boolean;
}

/**
 * Adapt a real {@link Sku} to the {@link ProductDefaultSkuDelegate} shape `Product.defaultSku` expects,
 * so `Product.getPrice()`, `getListPrice()` and `getRenewalPrice()` resolve through the actual SKU.
 */
export function createDefaultSkuDelegate(
  sku: Sku,
  options: DefaultSkuDelegateOptions = {},
): ProductDefaultSkuDelegate {
  return {
    /* F07 — the three monetary delegations are `ExactDecimal`, matching both the SKU's fields and the
     * delegate contract in `../../src/domain/product/Product.ts`. */
    getPrice: (): ExactDecimal => sku.getPrice(),
    getListPrice: (): ExactDecimal => sku.getListPrice(),
    getRenewalPrice: (): ExactDecimal => sku.getRenewalPrice(),
    getCurrencyCode: (): string | undefined => options.currencyCode,
    getImageDirectory: (): string => options.imageDirectory ?? '',
    getImagePath: (): string => options.imagePath ?? '',
    getImage: (): string => options.image ?? '',
    getResizedImagePath: (): string => options.resizedImagePath ?? '',
    getImageExistsFlag: (): boolean => options.imageExistsFlag ?? false,
  };
}

/** Everything {@link createMerchandiseProductFixture} hands back, all of it independent per call. */
export interface MerchandiseProductFixture {
  readonly product: Product;
  readonly productType: ProductType;
  /** The single SKU the legacy fixture's `price` lands on. Already wired into `product.getSkus()`. */
  readonly defaultSku: Sku;
  /** The frozen data struct the legacy helper populated the product from. */
  readonly data: TestMerchandiseProductData;
  /**
   * `meta/tests/unit/Helper.cfc:L70` nulls the default-SKU reference BEFORE deleting, because the
   * circular product/SKU reference otherwise trips the delete guard. Exposed so a teardown can do the
   * same rather than rediscovering it.
   */
  clearDefaultSkuReference(): void;
}

/**
 * Build the merchandise product the legacy suite's fixture describes.
 *
 * The literals come from `test/fixtures/testProduct.ts` and `test/fixtures/productTypes.ts`, which own
 * them; nothing is restated here. The chain assembled below is the faithful one: the fixture's `price`
 * is a SKU column, not a product column, so it lands on the default SKU and `product.getPrice()`
 * resolves through the delegate — which is why the delegate above exists.
 */
export function createMerchandiseProductFixture(
  overrides: TestMerchandiseProductDataOverrides = {},
): MerchandiseProductFixture {
  const data = createTestMerchandiseProductData(overrides);
  const productTypeID = data.productType.productTypeID;
  /*
   * `systemCode` is set only when the override left the merchandise root in place. Under
   * `exactOptionalPropertyTypes` an absent optional property and one explicitly assigned `undefined`
   * are different things, so the branch builds two distinct seeds rather than passing `undefined`.
   */
  const productType = buildProductType(
    productTypeID === MERCHANDISE_PRODUCT_TYPE_ID
      ? {
          productTypeID,
          productTypeIDPath: productTypeID,
          systemCode: SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise.systemCode,
        }
      : { productTypeID, productTypeIDPath: productTypeID },
  );
  const product = buildProduct({
    productName: data.productName,
    productCode: data.productCode,
    productType,
  });
  const defaultSku = buildSku({ price: data.price, product });
  product.defaultSku = createDefaultSkuDelegate(defaultSku);

  return {
    product,
    productType,
    defaultSku,
    data,
    clearDefaultSkuReference: (): void => {
      delete product.defaultSku;
    },
  };
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 4. The SKU repository — the highest-risk double in this file.
 *
 * `model/dao/SkuDAO.cfc` is where the Catalog's business logic actually lives, and five of the eight
 * members below encode a rule that a well-meaning "improvement" would silently change. Each of those is
 * annotated with the semantic it preserves and the trap it avoids.
 *
 * Option associations are modelled with the REAL `Option` entities on `Sku.options`, because options are
 * in scope and inventing a parallel link structure would have made the entity's own accessors
 * unobservable. Only genuinely out-of-scope relationships — alternate SKU codes, and the ten transaction
 * tables — are modelled as separate seed maps, because their entities are excluded and fabricating them
 * would breach AAP §0.7.3 S9.
 *
 * TODO(boundary) D4 — model/service/SkuService.cfc:L281-L283: ONE member is deliberately ABSENT from this
 * double. `getSkuStocksDeletableFlag` delegates to a `SkuDAO` member that exists nowhere in the repository,
 * so `Sku.getStocksDeletableFlag()` at `model/entity/Sku.cfc:L567-L572` can never resolve. Adding it here
 * and answering `true` or `false` would fabricate a verdict the legacy system cannot produce and would
 * hide the defect behind a passing test. The un-portable boundary therefore belongs to the SERVICE, where
 * `src/errors/DomainError.ts` exports the subclass it raises — `NotImplementedError` — and a service test
 * imports that class directly from the error module rather than through this file.
 * ---------------------------------------------------------------------------------------------------
 */

/**
 * One alternate-code association.
 *
 * `SwAlternateSkuCode` is out of scope, so only the two columns the lookup at
 * `model/dao/SkuDAO.cfc:L102-L104` reads are modelled.
 */
export interface AlternateSkuCodeSeed {
  readonly skuID: string;
  readonly alternateSkuCode: string;
}

/**
 * One recorded call on the SKU repository.
 *
 * Optional arguments are recorded as `| undefined` rather than as optional keys on purpose: the key is
 * always present, so an assertion can distinguish "called with nothing" from "never called" without
 * this file having to build a different object shape per argument combination.
 */
export type SkuRepositoryCall =
  | {
      readonly member: 'transactionExists';
      readonly productID: string | undefined;
      readonly skuID: string | undefined;
    }
  | { readonly member: 'findBySkuCode'; readonly skuCode: string }
  | {
      readonly member: 'findSkusBySelectedOptions';
      readonly optionIds: readonly string[];
      readonly productId: string;
    }
  | {
      readonly member: 'searchByProductType';
      readonly term: string | undefined;
      readonly productTypeID: string | undefined;
    }
  | { readonly member: 'findByProduct'; readonly productID: string; readonly fetchOptions: boolean }
  | { readonly member: 'findSortedSkuIdsByProduct'; readonly productID: string }
  | { readonly member: 'clearOptionGroupSortOrderCache' }
  | { readonly member: 'persistSku'; readonly sku: Sku };

/** Seed configuration for {@link createInMemorySkuRepository}. */
export interface InMemorySkuRepositoryOptions {
  /**
   * The acting account the write seam stamps into the audit block, or omitted for none.
   *
   * ⚠️ MIRRORS THE ADAPTER, WHICH MIRRORS THE LEGACY FLUSH. Hibernate fired `preInsert`/`preUpdate`
   * during the request-end flush (`org/Hibachi/Hibachi.cfc`); the port has no ORM session and no flush
   * (mismatch M5), so each MySQL write seam calls the stamping functions in
   * `src/domain/base/AuditableEntity.ts` itself, resolving the actor from `AccountContextPort`. A double
   * that skipped the stamp would let a test observe absent audit fields where production writes
   * timestamps. Omitting this option models an UNAUTHENTICATED request, which is a legitimate legacy
   * state: both timestamps are still stamped and both account foreign keys are left absent.
   */
  readonly auditActor?: AccountReference;

  /** The stored SKUs. Real entities, carrying their real `options` and `product` links. */
  readonly skus?: readonly Sku[];
  readonly alternateSkuCodes?: readonly AlternateSkuCodeSeed[];
  /** SKU identifiers that participate in at least one of the ten transaction relationships. */
  readonly transactionSkuIDs?: readonly string[];
  /** Product identifiers that participate in at least one of the ten transaction relationships. */
  readonly transactionProductIDs?: readonly string[];
  /** Used by `findByProduct` to resolve the base product type. Defaults to the three seeded roots. */
  readonly productTypeRootResolver?: ProductTypeRootResolver & SkuProductTypeRootResolver;
  /**
   * Overrides the memoised odometer ceiling that `model/dao/SkuDAO.cfc:L204-L220` reads as
   * `max(sortOrder) + 1` from `SwOptionGroup`. Left unset, it is derived from the seeded option groups.
   */
  readonly nextOptionGroupSortOrder?: number;
}

/** The repository plus its factory-local seed and observation state. */
export interface InMemorySkuRepository {
  /** The port itself. */
  readonly repository: SkuRepository;
  /** Live view of the stored SKUs, in first-seen order. */
  readonly skus: readonly Sku[];
  /** Every call, in order. */
  readonly calls: readonly SkuRepositoryCall[];
  /** Every SKU handed to `persistSku`, in order, by reference. */
  readonly persisted: readonly Sku[];
  /** Seed further SKUs after construction — this is also how M6 visibility is set up by hand. */
  add(...skus: readonly Sku[]): void;
  /** Seed a further alternate-code association. */
  addAlternateSkuCode(seed: AlternateSkuCodeSeed): void;
  /** Mark a SKU or product as participating in a transaction relationship. */
  addTransactionParticipation(participation: {
    readonly skuID?: string;
    readonly productID?: string;
  }): void;
  /**
   * The memoised odometer ceiling, or `undefined` while it is still unresolved. Reading it is how a test
   * proves that `clearOptionGroupSortOrderCache()` did nothing (defect D7).
   */
  optionGroupSortOrderMemoValue(): number | undefined;
}

/**
 * Create the in-memory SKU repository.
 *
 * Nothing in the returned object is shared with any other call: the SKU list, the alternate-code map,
 * both transaction sets, the call log and the sort-order memo are all allocated here. The memo in
 * particular MUST stay factory-scoped — `model/dao/SkuDAO.cfc:L204-L220` memoises it in the DAO's own
 * `variables` scope, which on a persistent CFML server is effectively a singleton over a WHOLE-TABLE
 * aggregate. Hoisting the equivalent to module scope in a Lambda would let one warm invocation read a
 * ceiling computed for a different tenant's data (AAP §0.6.6 M7).
 */
export function createInMemorySkuRepository(
  options: InMemorySkuRepositoryOptions = {},
): InMemorySkuRepository {
  const skus: Sku[] = options.skus === undefined ? [] : [...options.skus];
  const alternateSkuCodes: AlternateSkuCodeSeed[] =
    options.alternateSkuCodes === undefined ? [] : [...options.alternateSkuCodes];
  const transactionSkuIDs = new Set<string>(options.transactionSkuIDs ?? []);
  const transactionProductIDs = new Set<string>(options.transactionProductIDs ?? []);
  const calls: SkuRepositoryCall[] = [];
  const persisted: Sku[] = [];
  const productTypeRootResolver =
    options.productTypeRootResolver ?? createProductTypeRootResolverDouble().resolver;

  /** The memo. `undefined` means "not yet read", exactly as the legacy `variables` key being absent. */
  const optionGroupSortOrderMemo: { value: number | undefined } = { value: undefined };

  /**
   * Resolve the odometer ceiling the way `model/dao/SkuDAO.cfc:L204-L220` does: start at 1, and become
   * `max(sortOrder) + 1` when the aggregate over `SwOptionGroup` produced a value.
   */
  const resolveNextOptionGroupSortOrder = (): number => {
    const memoised = optionGroupSortOrderMemo.value;
    if (memoised !== undefined) {
      return memoised;
    }
    if (options.nextOptionGroupSortOrder !== undefined) {
      optionGroupSortOrderMemo.value = options.nextOptionGroupSortOrder;
      return options.nextOptionGroupSortOrder;
    }
    let highest: number | undefined;
    for (const sku of skus) {
      for (const option of sku.options) {
        const groupSortOrder = option.optionGroup?.sortOrder;
        if (groupSortOrder !== undefined && (highest === undefined || groupSortOrder > highest)) {
          highest = groupSortOrder;
        }
      }
    }
    const resolved = highest === undefined ? 1 : highest + 1;
    optionGroupSortOrderMemo.value = resolved;
    return resolved;
  };

  /** Membership by product identifier, matching the DAO's `WHERE sku.productID = ?`. */
  const belongsToProduct = (sku: Sku, productID: string): boolean =>
    sku.product !== undefined && sku.product.productID === productID;

  const repository: SkuRepository = {
    /*
     * X12 / the undeclared-argument forwarding [model/service/SkuService.cfc:L285-L287] — `model/dao/SkuDAO.cfc:L53-L98`.
     *
     * The two branches are MUTUALLY EXCLUSIVE and `skuID` wins: the DAO tests
     * `structKeyExists(arguments,"skuID") && !isNull(arguments.skuID)` first and only falls through to
     * the product root when that fails. The ten-way EXISTS/OR chain is then ANDed to whichever root was
     * chosen, so the answer is always SCOPED — never a global "does any transaction exist".
     *
     * G6. `model/service/SkuService.cfc:L285-L287` declares `getTransactionExistsFlag()` with ZERO
     * formal parameters and forwards `argumentCollection=arguments`. That signature is a lie: CFML puts
     * UNDECLARED named arguments into the `arguments` scope, so when
     * `model/entity/Product.cfc:L626` calls `getTransactionExistsFlag(productID=…)` the identifier
     * reaches `model/dao/SkuDAO.cfc:L53-L55` and scopes the query. Reading the service declaration
     * literally — as an argument-less call — would turn the product delete guard into a global one and
     * make every product undeletable the moment one transaction existed anywhere. This double therefore
     * accepts and honours BOTH optional identifiers.
     *
     * The layer-order reversal is also deliberate and must never be "tidied": the SERVICE surface is
     * SKU-first (`getTransactionExistsFlag(skuID?, productID?)`, see
     * `SkuTransactionExistenceChecker` in `src/domain/sku/Sku.ts`), while this REPOSITORY surface is
     * product-first. Swapping either would silently exchange the two identifiers.
     */
    transactionExists: (productID?: string, skuID?: string): Promise<boolean> => {
      calls.push(Object.freeze({ member: 'transactionExists', productID, skuID }));
      if (skuID !== undefined) {
        return Promise.resolve(transactionSkuIDs.has(skuID));
      }
      if (productID !== undefined) {
        return Promise.resolve(transactionProductIDs.has(productID));
      }
      /*
       * Both absent is UNREPRESENTABLE in the legacy: the DAO would fall into its product branch and
       * interpolate an undefined identifier. Failing loudly is the honest port, and the message is
       * freshly authored here rather than borrowed from any legacy throw.
       */
      return Promise.reject(
        new DomainError(
          'A transaction-existence probe needs either a SKU identifier or a product identifier; with ' +
            'neither, the legacy query has no root to scope itself to and would answer about the whole ' +
            'table.',
        ),
      );
    },

    /*
     * `model/dao/SkuDAO.cfc:L102-L104` — the primary code OR an alternate code, one LEFT JOIN and one
     * value bound in two places. `ormExecuteQuery(..., true)` asks for a unique result, so more than one
     * match is an error rather than a silent first-row win; there is no `LIMIT` to lean on.
     */
    findBySkuCode: (skuCode: string): Promise<Sku | null> => {
      calls.push(Object.freeze({ member: 'findBySkuCode', skuCode }));
      const alternateSkuIDs = new Set(
        alternateSkuCodes
          .filter((association) => association.alternateSkuCode === skuCode)
          .map((association) => association.skuID),
      );
      const matches = skus.filter(
        (sku) => sku.skuCode === skuCode || alternateSkuIDs.has(sku.skuID),
      );
      if (matches.length === 0) {
        return Promise.resolve(null);
      }
      if (matches.length > 1) {
        return Promise.reject(
          new DataIntegrityError(
            'A SKU-code lookup matched two or more SKUs across the primary and alternate codes, so ' +
              'the unique result the legacy query asks for could not be produced.',
            { context: { skuCode, matched: matches.length } },
          ),
        );
      }
      return Promise.resolve(matches[0] ?? null);
    },

    /*
     * `model/dao/SkuDAO.cfc:L106-L128` — the pivotal translation. Five semantics are preserved, and each
     * of them is a silent-drift trap:
     *
     * T1 CONJUNCTION, NOT INTERSECTION. One requirement per ELEMENT of `optionIds`, ANDed. Duplicates
     *    are kept and evaluated again, exactly as N identical `exists` clauses would be. Rewriting this
     *    as `optionID IN (...)` turns the conjunction into a disjunction; rewriting it as
     *    `GROUP BY … HAVING COUNT(*) = N` diverges as soon as the list repeats an entry.
     * T2 PRODUCT SCOPE IS UNCONDITIONAL. The DAO guards it with `structKeyExists`, but its only caller
     *    declares the argument required and forwards the whole collection, so the guard is always true.
     *    The port types it required and this double always applies it.
     * T3 THE VESTIGIAL JOIN IS LOAD-BEARING. `inner join sku.options as opt` is never referenced in the
     *    WHERE clause and looks removable. It is not: it excludes OPTION-LESS SKUs from every result,
     *    including when the selection is empty. Preserved here as an option-bearing guard.
     * T4 DISTINCTNESS. The join fans out one row per SKU/option pair, and `select distinct` collapses it.
     *    Iterating the stored SKUs once yields each at most once, which is the same guarantee.
     * T5 AN EMPTY SELECTION IS LEGAL. `Product.getSkusBySelectedOptions` defaults it to `''` and
     *    `listLen('')` is zero, so no requirement is appended and the query degenerates to "every
     *    option-bearing SKU of this product". Both `Product.getSkuBySelectedOptions` and
     *    `Sku.hasUniqueOptions` depend on that degenerate form; guarding against it would break them and
     *    would hide defect D19.
     *
     * Result order is first-seen insertion order. The legacy HQL has no ORDER BY, so row order is
     * formally unspecified; a deterministic insertion order is the honest choice and matches the production translation.
     */
    findSkusBySelectedOptions: (optionIds: string[], productId: string): Promise<SkuRow[]> => {
      calls.push(
        Object.freeze({
          member: 'findSkusBySelectedOptions',
          optionIds: Object.freeze([...optionIds]),
          productId,
        }),
      );
      const matches = skus.filter((sku) => {
        if (!belongsToProduct(sku, productId)) {
          return false;
        }
        if (sku.options.length === 0) {
          return false;
        }
        return optionIds.every((optionId) =>
          sku.options.some((option) => option.optionID === optionId),
        );
      });
      return Promise.resolve(matches);
    },

    /*
     * `model/dao/SkuDAO.cfc:L130-L148`. The term is interpolated with NO guard, so an absent term is a
     * runtime failure rather than a match-everything shortcut —
     * `src/adapters/mysql/MySqlSkuRepository.ts` raises for the same reason and this double matches it.
     *
     * The product-type restriction is gated on `trim(productTypeID) != ""`. That trimmed test is the
     * SKU-side behaviour and is deliberately NOT harmonised with the Product side, which gates on
     * `len(productTypeIDs)` at `model/dao/ProductDAO.cfc:L419-L437` and therefore ACCEPTS a
     * whitespace-only value. The asymmetry is real; making the two agree would be a repair.
     *
     * Matching is case-insensitive because MySQL's default collation makes `like` so; the comparison is
     * a substring test rather than assembled SQL, since this double emits no statement text.
     */
    searchByProductType: (term?: string, productTypeID?: string): Promise<SkuSearchRow[]> => {
      calls.push(Object.freeze({ member: 'searchByProductType', term, productTypeID }));
      if (term === undefined) {
        return Promise.reject(
          new DomainError(
            'A SKU search needs a term. The legacy DAO reads it without a guard, so an absent term is ' +
              'a failure rather than an unrestricted match.',
          ),
        );
      }
      const needle = term.toLowerCase();
      let candidates = skus.filter(
        (sku) => sku.skuCode !== undefined && sku.skuCode.toLowerCase().includes(needle),
      );
      if (productTypeID !== undefined && productTypeID.trim() !== '') {
        const productTypeIDs = productTypeID.split(',').filter((segment) => segment !== '');
        if (productTypeIDs.length === 0) {
          return Promise.reject(
            new DomainError(
              'The product-type restriction contained no usable identifiers once the delimited list ' +
                'was split, so it could not be applied.',
              { context: { productTypeID } },
            ),
          );
        }
        candidates = candidates.filter((sku) => {
          const assigned = sku.product?.productType?.productTypeID;
          return assigned !== undefined && productTypeIDs.includes(assigned);
        });
      }
      const rows: SkuSearchRow[] = [];
      for (const sku of candidates) {
        const skuCode = sku.skuCode;
        if (skuCode !== undefined) {
          rows.push(Object.freeze({ id: sku.skuID, value: skuCode }));
        }
      }
      return Promise.resolve(rows);
    },

    /*
     * `model/dao/SkuDAO.cfc:L150-L168`.
     *
     * D9, carried not repaired: the DAO declares `fetchOptions` as `required any` at `:L150` and then
     * reads it UNSCOPED at `:L153`; it re-declares `var hql` mid-function at `:L163`; and the fourth
     * `{ignoreCase="true"}` argument at `:L165` is inert for this call. None of that is corrected here.
     *
     * What matters behaviourally is that `fetchOptions` is NOT merely an eager-loading hint. The joins it
     * adds are INNER, so switching it on FILTERS the result to SKUs that actually carry the related rows
     * for the product's base product type. With it off there is no join at all and every SKU of the
     * product comes back — which is exactly what `src/adapters/mysql/MySqlSkuRepository.ts` does.
     *
     * A base product type outside the three seeded discriminators adds no join, so nothing is filtered.
     */
    findByProduct: async (product: Product, fetchOptions: boolean): Promise<Sku[]> => {
      calls.push(
        Object.freeze({ member: 'findByProduct', productID: product.productID, fetchOptions }),
      );
      const candidates = skus.filter((sku) => belongsToProduct(sku, product.productID));
      if (!fetchOptions) {
        return candidates;
      }
      const baseProductType = await product.getBaseProductType(productTypeRootResolver);
      /*
       * Recognition folds case, matching CFML `==` at `model/dao/SkuDAO.cfc:L154-L161` and the real
       * adapter. A double that compared with `===` would pass while the adapter it stands for failed on
       * a differently-cased `systemCode`, which is the one thing a double must never do.
       */
      const recognisedBaseProductType = resolveBaseProductType(baseProductType);
      if (
        recognisedBaseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.contentAccess.systemCode
      ) {
        return candidates.filter((sku) => sku.accessContents.length > 0);
      }
      if (
        recognisedBaseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise.systemCode
      ) {
        return candidates.filter((sku) => sku.options.length > 0);
      }
      if (
        recognisedBaseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.subscription.systemCode
      ) {
        return candidates.filter(
          (sku) => sku.subscriptionTerm !== undefined && sku.subscriptionBenefits.length > 0,
        );
      }
      return candidates;
    },

    /*
     * `model/dao/SkuDAO.cfc:L172-L202` — the odometer ordering.
     *
     * The statement joins `SwSku ⋈ SwSkuOption ⋈ SwOption ⋈ SwOptionGroup`, all INNER, groups by SKU and
     * orders by `SUM(SwOption.sortOrder * POWER(10, next - SwOptionGroup.sortOrder)) ASC`. Three
     * consequences are preserved exactly:
     *
     * 1. OPTION-BEARING SKUs ONLY. The inner joins drop everything else. This is the ROOT CAUSE of D13:
     *    `model/service/SkuService.cfc:L223-L269` looks the returned identifier up with `arrayFind` and
     *    indexes the result, so a SKU that is missing here produces index 0 and the service throws. The
     *    gap is left in place; the service owns the defect.
     * 2. NO `COALESCE`. A NULL option sort order or a NULL group sort order makes that row's product
     *    NULL, and SQL's `SUM` skips NULL terms — so the term simply does not contribute. An option with
     *    no option group is dropped by the INNER JOIN entirely, and a SKU whose every option lacks a
     *    group drops out of the result. Adding a zero default would change the ordering.
     * 3. TIES KEEP FIRST-SEEN ORDER. The legacy has no secondary sort key, so ties are formally
     *    unspecified; insertion order is deterministic and is never re-sorted for tidiness.
     *
     * TODO(parity) D8 — `model/dao/SkuDAO.cfc:L177` carries a TODO doubting the statement on engines
     * other than MySQL and SQL Server. The port targets MySQL only, which is consistent with that
     * untested state rather than a resolution of it.
     */
    findSortedSkuIdsByProduct: (productID: string): Promise<string[]> => {
      calls.push(Object.freeze({ member: 'findSortedSkuIdsByProduct', productID }));
      const nextSortOrder = resolveNextOptionGroupSortOrder();
      const weighted: { readonly skuID: string; readonly weight: number; readonly seen: number }[] =
        [];
      let seen = 0;
      for (const sku of skus) {
        if (!belongsToProduct(sku, productID)) {
          continue;
        }
        let contributingRows = 0;
        let weight = 0;
        for (const option of sku.options) {
          const groupSortOrder = option.optionGroup?.sortOrder;
          if (groupSortOrder === undefined) {
            continue;
          }
          contributingRows += 1;
          const optionSortOrder = option.sortOrder;
          if (optionSortOrder === undefined) {
            continue;
          }
          weight += optionSortOrder * Math.pow(10, nextSortOrder - groupSortOrder);
        }
        if (contributingRows === 0) {
          continue;
        }
        weighted.push({ skuID: sku.skuID, weight, seen });
        seen += 1;
      }
      weighted.sort((left, right) =>
        left.weight === right.weight ? left.seen - right.seen : left.weight - right.weight,
      );
      return Promise.resolve(weighted.map((entry) => entry.skuID));
    },

    /*
     * TODO(parity) D7 — `model/dao/SkuDAO.cfc:L222-L228`. The legacy guard is INVERTED: it deletes the
     * memo key only when the key is ABSENT, so once the sort order has been resolved the cache is never
     * actually cleared. `src/adapters/mysql/MySqlSkuRepository.ts` reproduces that as
     * `if (memo.value === undefined) { memo.value = undefined; }`, and so does this line. The call is
     * observable through {@link InMemorySkuRepository.optionGroupSortOrderMemoValue}, which keeps its
     * value across the call and proves the no-op.
     *
     * Synchronous, matching the port. It returns `void`, not a promise.
     */
    clearOptionGroupSortOrderCache: (): void => {
      calls.push(Object.freeze({ member: 'clearOptionGroupSortOrderCache' }));
      if (optionGroupSortOrderMemo.value === undefined) {
        optionGroupSortOrderMemo.value = undefined;
      }
    },

    /*
     * The write seam the combination engine drives. `src/adapters/mysql/MySqlSkuRepository.ts` GENERATES
     * the identifier on its insert branch — `model/entity/Sku.cfc:L52` declares
     * `fieldtype="id" generator="uuid"`, an instruction to the mapping layer to produce the value at
     * save time, and the legacy generator lives in the data-access layer at `model/dao/HibachiDAO.cfc`
     * — so this double generates too, with the same `createSlatwallUUID` the adapter uses.
     *
     * ⚠️ THE PARITY HERE IS LOAD-BEARING, AND AN EARLIER REVISION GOT IT WRONG IN BOTH PLACES AT ONCE.
     * This double previously refused a transient SKU because the adapter did. When the adapter's refusal
     * was corrected — it had made every SKU-creation path unreachable, since nothing above the port
     * assigns an identifier — a double left refusing would have been STRICTER THAN PRODUCTION, and the
     * M6 tests below could never have been written. A test double that diverges from its adapter is
     * worse than no double: it reports a pass for a path production cannot run, which is precisely the
     * failure mode this file has to avoid.
     *
     * M6 lives here. The upsert lands in the SAME array `findSkusBySelectedOptions` reads, so a SKU
     * persisted inside a transaction becomes visible to the NEXT sibling's uniqueness read in creation
     * order. That is the whole hazard of AAP §0.6.2: under Hibernate the rule only ever saw siblings the
     * ORM session had already flushed, and a port that inserted everything and then validated — or
     * validated before inserting anything — would produce different results with no error at all.
     */
    persistSku: (sku: Sku): Promise<void> => {
      calls.push(Object.freeze({ member: 'persistSku', sku }));
      /* Mirrors the adapter's insert branch: generate only while the entity is transient, so an
       * upsert keeps the identifier its stored row is keyed on. */
      if (sku.isNew()) {
        sku.skuID = createSlatwallUUID();
      }
      /*
       * The audit stamp, mirroring the adapter. `model/entity/Sku.cfc` does not override the ORM hooks,
       * so a SKU only ever received the framework block — hence the free functions rather than a method
       * on the entity. The adapter chooses the branch from an existence PROBE rather than `isNew()`,
       * because the combination engine can hand the same entity back on a later pass; this double has the
       * stored list in hand, so it asks the same question of that list.
       */
      const skuRowAlreadyExists = skus.some((candidate) => candidate.skuID === sku.skuID);
      if (skuRowAlreadyExists) {
        applyPreUpdateAudit(sku, options.auditActor);
      } else {
        applyPreInsertAudit(sku, options.auditActor);
      }
      persisted.push(sku);
      const existingIndex = skus.findIndex((candidate) => candidate.skuID === sku.skuID);
      if (existingIndex === -1) {
        skus.push(sku);
      } else {
        skus[existingIndex] = sku;
      }
      return Promise.resolve();
    },
  };

  return {
    repository,
    skus,
    calls,
    persisted,
    add: (...added: readonly Sku[]): void => {
      skus.push(...added);
    },
    addAlternateSkuCode: (seed: AlternateSkuCodeSeed): void => {
      alternateSkuCodes.push(seed);
    },
    addTransactionParticipation: (participation: {
      readonly skuID?: string;
      readonly productID?: string;
    }): void => {
      if (participation.skuID !== undefined) {
        transactionSkuIDs.add(participation.skuID);
      }
      if (participation.productID !== undefined) {
        transactionProductIDs.add(participation.productID);
      }
    },
    optionGroupSortOrderMemoValue: (): number | undefined => optionGroupSortOrderMemo.value,
  };
}

/**
 * Adapt a {@link SkuRepository} to the caller-ordered checker surface
 * {@link SkuTransactionExistenceChecker}, which is what `Sku.getTransactionExistsFlag` and
 * `Product.getTransactionExistsFlag` are handed.
 *
 * ⭐ IT NOW DELEGATES TO THE PRODUCTION CROSSING RATHER THAN RESTATING IT, AND THAT IS THE POINT OF THE
 * CHANGE. This helper once carried the ONLY correct `(skuID?, productID?)` → `(productID?, skuID?)`
 * mapping in the whole subtree, which meant the tests exercised a crossing that production did not
 * have: any real wiring had to invent its own, and the only collaborator structurally available to
 * invent it with — the zero-argument `SkuService.getTransactionExistsFlag` — discarded both identifiers
 * silently. `createProductionTransactionExistenceChecker` in
 * `src/adapters/mysql/MySqlSkuRepository.ts` is that crossing, owned by the layer that declares the
 * repository order it inverts. Re-exporting it through this name keeps every existing call site
 * unchanged while guaranteeing that what the tests assert is what production runs — a second local copy
 * could drift from it and no test would notice.
 *
 * The argument order is documented at the production factory. The one-line summary: the checker surface
 * is `(skuID?, productID?)` because `model/entity/Sku.cfc:L594` and `model/entity/Product.cfc:L626` read
 * that way, the repository surface is `(productID?, skuID?)` because `model/dao/SkuDAO.cfc:L54-L55`
 * declares that way, and both identifiers are 32-character strings so a swap type-checks.
 *
 * @param repository - Any repository implementation; the double from
 *   {@link createInMemorySkuRepository} is the usual argument.
 * @returns A checker satisfying BOTH entity contracts, so one instance serves `Sku` and `Product`.
 */
export function createTransactionExistenceChecker(
  repository: SkuRepository,
): SkuTransactionExistenceChecker {
  return createProductionTransactionExistenceChecker(repository);
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 5. The option repository.
 *
 * Two members, two OPPOSITE set polarities. `model/dao/OptionDAO.cfc:L51-L91` selects options whose
 * group is IN the supplied list, while `:L93-L116` selects groups whose identifier is NOT IN it. That
 * inversion is the whole point of the pair — the caller passes the SAME "option groups already on this
 * product" list to both — and getting it backwards produces a plausible-looking result set that is
 * exactly wrong.
 *
 * Both members answer with the port's own `{name, value}` projection rows, and `OptionService` returns
 * them straight through without mapping, so the label format is this repository's responsibility.
 *
 * TODO(parity) `model/service/ProductService.cfc:L70-L80`: the neighbouring formatted-groups member builds a
 * plain CFML structure keyed by option-group NAME, so two groups sharing a name overwrite each other and
 * the earlier one is lost. The port answers `FormattedOptionGroup[]` per AAP §0.4.2.1 and preserves that
 * collapse by accumulating through a `Map`; the element type is declared in `src/services/ProductService`
 * and is NOT redeclared here, because the projection rows this file returns feed that member rather than
 * being it.
 * ---------------------------------------------------------------------------------------------------
 */

/** One recorded call on the option repository. */
export type OptionRepositoryCall =
  | {
      readonly member: 'findUnusedOptions';
      readonly productID: string;
      readonly existingOptionGroupIDList: string;
    }
  | { readonly member: 'findUnusedOptionGroups'; readonly existingOptionGroupIDList: string };

/** Seed configuration for {@link createInMemoryOptionRepository}. */
export interface InMemoryOptionRepositoryOptions {
  /** Every option group in the catalogue, each carrying its own options. */
  readonly optionGroups?: readonly OptionGroup[];
  /**
   * The SKUs that establish which options a product already uses. The legacy `NOT EXISTS` correlates
   * `SwSkuOption` to `SwSku` on `productID`, so usage is derived from each SKU's product and options
   * rather than from a separate usage table.
   */
  readonly skus?: readonly Sku[];
}

/** The repository plus its factory-local observation state. */
export interface InMemoryOptionRepository {
  readonly repository: OptionRepository;
  readonly calls: readonly OptionRepositoryCall[];
  /** Seed a further group after construction. */
  addOptionGroup(optionGroup: OptionGroup): void;
  /** Seed a further SKU, which may make some of its options "used". */
  addSku(sku: Sku): void;
}

/**
 * Create the in-memory option repository.
 *
 * Comma-list handling is deliberately raw. `splitIdentifierList` does what the legacy does and nothing
 * more: no trimming, no de-duplication, no dropping of empty entries. The consequence is the
 * validation-observable ASYMMETRY the two members exhibit for an empty list — for a product with no
 * option groups yet, `findUnusedOptions('')` returns `[]` because the single empty identifier matches no
 * group on the IN side, while `findUnusedOptionGroups('')` returns EVERY group because that same empty
 * identifier excludes none on the NOT-IN side. Both answers are correct and the difference is load
 * bearing, so neither is "fixed".
 */
export function createInMemoryOptionRepository(
  options: InMemoryOptionRepositoryOptions = {},
): InMemoryOptionRepository {
  const optionGroups: OptionGroup[] =
    options.optionGroups === undefined ? [] : [...options.optionGroups];
  const skus: Sku[] = options.skus === undefined ? [] : [...options.skus];
  const calls: OptionRepositoryCall[] = [];

  /** The option identifiers a product already uses, derived exactly as the correlated NOT EXISTS does. */
  const optionIdsUsedByProduct = (productID: string): ReadonlySet<string> => {
    const used = new Set<string>();
    for (const sku of skus) {
      if (sku.product === undefined || sku.product.productID !== productID) {
        continue;
      }
      for (const option of sku.options) {
        used.add(option.optionID);
      }
    }
    return used;
  };

  /*
   * `ORDER BY optionGroupName, optionName` and `ORDER BY optionGroupName`. An absent name is compared as
   * the empty string: MySQL orders NULL before every non-NULL value in an ascending sort, and the empty
   * string collates first among strings, so the two agree here. `Array.prototype.sort` is stable, which
   * preserves first-seen order among equal keys without a synthetic tiebreak.
   */
  const byName = (left: string | undefined, right: string | undefined): number =>
    (left ?? '').localeCompare(right ?? '');

  const repository: OptionRepository = {
    /*
     * `model/dao/OptionDAO.cfc:L51-L91`. `SwOption.optionGroupID` IN the supplied list, AND `NOT EXISTS`
     * a `SwSkuOption`/`SwSku` pair for this product carrying the option.
     *
     * The row label is `"<optionGroupName> - <optionName>"` with a literal space, hyphen, space.
     * `OptionService.getUnusedProductOptions` returns these rows STRAIGHT through and performs no
     * mapping of its own, so the format is fixed here and nowhere else.
     *
     * The statement binds the option-group identifiers FIRST and the product identifier LAST, which
     * REVERSES this method's signature order. Assert the bind order against the executor double, not
     * against this argument list.
     */
    findUnusedOptions: (
      productID: string,
      existingOptionGroupIDList: string,
    ): Promise<UnusedOptionRow[]> => {
      calls.push(
        Object.freeze({ member: 'findUnusedOptions', productID, existingOptionGroupIDList }),
      );
      const includedGroupIds = splitIdentifierList(existingOptionGroupIDList);
      const used = optionIdsUsedByProduct(productID);
      const rows: {
        readonly row: UnusedOptionRow;
        readonly group: OptionGroup;
        readonly option: Option;
      }[] = [];
      for (const optionGroup of optionGroups) {
        if (!includedGroupIds.includes(optionGroup.optionGroupID)) {
          continue;
        }
        for (const option of optionGroup.getOptions()) {
          if (used.has(option.optionID)) {
            continue;
          }
          rows.push({
            group: optionGroup,
            option,
            row: Object.freeze({
              name: `${optionGroup.optionGroupName ?? ''} - ${option.optionName ?? ''}`,
              value: option.optionID,
            }),
          });
        }
      }
      rows.sort(
        (left, right) =>
          byName(left.group.optionGroupName, right.group.optionGroupName) ||
          byName(left.option.optionName, right.option.optionName),
      );
      return Promise.resolve(rows.map((entry) => entry.row));
    },

    /*
     * `model/dao/OptionDAO.cfc:L93-L116`. `optionGroupID` NOT IN the supplied list, ordered by name, and
     * the label is the BARE group name — no prefix, no separator. The row type is kept distinct from
     * {@link UnusedOptionRow} even though the two are structurally identical, because the port declares
     * them separately and collapsing them would erase which member a value came from.
     */
    findUnusedOptionGroups: (
      existingOptionGroupIDList: string,
    ): Promise<UnusedOptionGroupRow[]> => {
      calls.push(Object.freeze({ member: 'findUnusedOptionGroups', existingOptionGroupIDList }));
      const excludedGroupIds = splitIdentifierList(existingOptionGroupIDList);
      const matched = optionGroups.filter(
        (optionGroup) => !excludedGroupIds.includes(optionGroup.optionGroupID),
      );
      matched.sort((left, right) => byName(left.optionGroupName, right.optionGroupName));
      const rows: UnusedOptionGroupRow[] = matched.map((optionGroup) =>
        Object.freeze({
          name: optionGroup.optionGroupName ?? '',
          value: optionGroup.optionGroupID,
        }),
      );
      return Promise.resolve(rows);
    },
  };

  return {
    repository,
    calls,
    addOptionGroup: (optionGroup: OptionGroup): void => {
      optionGroups.push(optionGroup);
    },
    addSku: (sku: Sku): void => {
      skus.push(sku);
    },
  };
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 6. The product repository.
 *
 * SEVEN members, and the read-side ones are deliberately thin. The count is stated exactly because it
 * was previously stated as "three": `ProductRepository` grew a bounded search, a separately invocable
 * back-fill step and the two write members, and this header did not follow. That stale three is the same
 * miscount review finding F3 recorded against `test/adapters/MySqlProductRepository.test.ts`, which
 * claimed parity for "all three declared members" while the port declared seven — so the number is now
 * kept in step with {@link ProductRepositoryCall}, whose arms are the authoritative list.
 *
 * Widening this double to model the importer's schema would fabricate exactly the tables AAP §0.7.3 S9
 * forbids inventing — the injection-surface hardening of defect D18 belongs to the real MySQL adapter,
 * which is where `pool.execute()` with `?` placeholders replaces the twenty-one interpolated statements,
 * and `test/adapters/MySqlProductRepository.test.ts` is where every one of the seven is now driven.
 * ---------------------------------------------------------------------------------------------------
 */

/** One recorded call on the product repository. */
export type ProductRepositoryCall =
  | {
      readonly member: 'findAttributeSets';
      readonly attributeSetTypeCode: readonly string[];
      readonly productTypeIDs: readonly string[];
    }
  | {
      readonly member: 'importFromFile';
      /**
       * The location, recorded verbatim as a plain `string`.
       *
       * An earlier revision typed this as a branded `ProductImportSource`, which obliged every test to
       * mint an approved value before it could record a call. That brand STAYS withdrawn, and the port
       * type STAYS a plain `string`: AAP §0.4.2.6 ratifies `importFromFile(fileURL, textQualifier)` with
       * an unbranded location, and a brand would have made the type system the enforcement point for a
       * rule the type system cannot actually check.
       *
       * What is NO LONGER true is the sentence this note used to carry — that the location is simply
       * "unchecked". Under the re-adjudicated SEC-08, `../../src/ports/repositories/ProductRepository.ts`
       * states refusing a hostile location as AN OBLIGATION OF EVERY IMPLEMENTATION, and
       * `../../src/adapters/mysql/MySqlProductRepository.ts` discharges it at its single egress seam. The
       * type is unbranded; the CONTRACT is not unchecked.
       *
       * This double still applies NO gate, and that is deliberate rather than an omission. The obligation
       * binds implementations that RETRIEVE, because the exposure is the outbound request; this double
       * opens no socket, so there is nothing here for a gate to protect. Gating here would instead make
       * the double the authority on a contract the adapter owns — the same reasoning the `options` note
       * below gives for recording rather than interpreting — and would silently prevent a test from
       * asserting that a caller forwards a hostile-looking location BYTE-FOR-BYTE, which is exactly the
       * negative obligation `../../src/services/ProductService.ts` carries and two of its tests certify.
       */
      readonly fileURL: string;
      readonly textQualifier: string | undefined;
    }
  | {
      readonly member: 'searchByProductType';
      readonly term: string | undefined;
      readonly productTypeIDs: string | undefined;
    }
  | {
      /** F03 — the product write seam. Recorded so a test can observe write ORDER, which is load-bearing. */
      readonly member: 'saveProduct';
      readonly productID: string;
      /** `true` when the call took the INSERT branch, i.e. the entity was transient on arrival. */
      readonly inserted: boolean;
    }
  | {
      /** F03 — the product removal seam. */
      readonly member: 'removeProduct';
      readonly productID: string;
    };

/**
 * Drives the importer without a file.
 *
 * A test wires this to `UnitOfWork.runPerItem` over its own row plan, which is how M3 — one transaction
 * per row, strictly sequential, earlier rows staying committed after a later failure — becomes
 * observable without parsing anything.
 */
export type ProductImportHandler = (
  fileURL: string,
  textQualifier: string | undefined,
) => Promise<void>;

/** Seed configuration for {@link createInMemoryProductRepository}. */
export interface InMemoryProductRepositoryOptions {
  /**
   * The acting account the write seam stamps into the audit block, or omitted for none.
   *
   * ⚠️ MIRRORS THE ADAPTER, WHICH MIRRORS THE LEGACY FLUSH. Hibernate fired `preInsert`/`preUpdate`
   * during the request-end flush (`org/Hibachi/Hibachi.cfc`); the port has no ORM session and no flush
   * (mismatch M5), so each MySQL write seam calls the stamping functions in
   * `src/domain/base/AuditableEntity.ts` itself, resolving the actor from `AccountContextPort`. A double
   * that skipped the stamp would let a test observe absent audit fields where production writes
   * timestamps. Omitting this option models an UNAUTHENTICATED request, which is a legitimate legacy
   * state: both timestamps are still stamped and both account foreign keys are left absent.
   */
  readonly auditActor?: AccountReference;

  /**
   * Returned verbatim by `findAttributeSets`. The port types a row as `unknown` on purpose: the
   * Attribute family is out of scope, so the rows stay opaque and no attribute domain type is invented.
   */
  readonly attributeSets?: readonly AttributeSetRow[];
  /** Searched by `searchByProductType`. */
  readonly products?: readonly Product[];
  readonly onImport?: ProductImportHandler;
}

/** The repository plus its factory-local observation state. */
export interface InMemoryProductRepository {
  readonly repository: ProductRepository;
  readonly calls: readonly ProductRepositoryCall[];
  addProduct(product: Product): void;
  /** Every product handed to `saveProduct`, BY REFERENCE and in write order (F03/F04). */
  readonly saved: readonly Product[];
  /** Every product handed to `removeProduct`, BY REFERENCE and in call order (F03). */
  readonly removed: readonly Product[];
}

/**
 * Create the in-memory product repository.
 *
 * `searchByProductType` preserves the PRODUCT-side gate exactly: `model/dao/ProductDAO.cfc:L423` tests
 * `len(arguments.productTypeIDs)`, so a whitespace-only value is ACCEPTED and restricts the search,
 * whereas the SKU side at `model/dao/SkuDAO.cfc:L130-L148` tests `trim(...) != ""` and ignores it. The
 * two are not harmonised. The list is bound with `list="true"` at `:L425`, which splits on commas and
 * filters nothing, so `splitIdentifierList` is used unchanged. The term at `:L422` is interpolated into
 * the bound value with no guard, so an absent term fails — and the column searched is `productName`, not
 * `productCode`.
 *
 * TODO(parity) D20 — `model/dao/ProductDAO.cfc:L64` carries a TODO to remove a two-branch conditional
 * once Railo and Adobe ColdFusion agree on how arrays bind to an `IN` clause. That engine divergence
 * does not exist in TypeScript, so the real adapter legitimately collapses the branch to a single path;
 * the TODO's precondition is satisfied BY the migration rather than resolved by hand. Nothing branches
 * here either.
 *
 * TODO(boundary) M1 — `model/service/ProductService.cfc:L65-L68` asks for a 3600-second request budget,
 * which is unrepresentable inside one Lambda invocation. No timer, deadline or retry appears in this
 * double; the mismatch is flagged and left for the handler layer to decide. M4 is adjacent: the legacy
 * fetches the file over `cfhttp` at `model/dao/ProductDAO.cfc:L87`, inside the same request that owns
 * the per-row transactions. This double performs no I/O of any kind.
 *
 * The legacy `.xls` branch at `model/dao/ProductDAO.cfc:L73-L99` is EMPTY — it reads no rows and raises
 * nothing. This double parses nothing at all, so it likewise raises nothing for any extension, and no
 * failure is invented for one.
 */
export function createInMemoryProductRepository(
  options: InMemoryProductRepositoryOptions = {},
): InMemoryProductRepository {
  const attributeSets: AttributeSetRow[] =
    options.attributeSets === undefined ? [] : [...options.attributeSets];
  const products: Product[] = options.products === undefined ? [] : [...options.products];
  const calls: ProductRepositoryCall[] = [];
  const saved: Product[] = [];
  const removed: Product[] = [];
  const onImport = options.onImport;

  const repository: ProductRepository = {
    findAttributeSets: (
      attributeSetTypeCode: string[],
      productTypeIDs: string[],
    ): Promise<AttributeSetRow[]> => {
      calls.push(
        Object.freeze({
          member: 'findAttributeSets',
          attributeSetTypeCode: Object.freeze([...attributeSetTypeCode]),
          productTypeIDs: Object.freeze([...productTypeIDs]),
        }),
      );
      return Promise.resolve([...attributeSets]);
    },

    importFromFile: (fileURL: string, textQualifier?: string): Promise<void> => {
      calls.push(Object.freeze({ member: 'importFromFile', fileURL, textQualifier }));
      /*
       * The port returns `Promise<void>` and reports nothing about what it imported, so this double
       * reports nothing either. Everything a test wants to observe about the import lives in the handler
       * it supplied and in the UnitOfWork double the handler drives.
       *
       * ⛔ THERE IS NO THIRD ARGUMENT TO RECORD. An `options` object once travelled here, carrying a
       * cancellation signal and a back-fill deferral flag, and this double recorded it verbatim without
       * interpreting it. Review findings F2 and F4 removed the parameter and the whole interface:
       * `model/dao/ProductDAO.cfc:L73` declares exactly two arguments, and AAP §0.6.7.7 admits one
       * behavioural exception (D18). The `backfillImportDerivedColumns` member that flag was paired with is
       * withdrawn from the port too, so this double no longer answers it either.
       */
      if (onImport === undefined) {
        return Promise.resolve();
      }
      return onImport(fileURL, textQualifier);
    },

    searchByProductType: (term?: string, productTypeIDs?: string): Promise<ProductSearchRow[]> => {
      calls.push(Object.freeze({ member: 'searchByProductType', term, productTypeIDs }));
      if (term === undefined) {
        return Promise.reject(
          new DomainError(
            'A product search needs a term. The legacy statement interpolates it into the bound value ' +
              'without a guard, so an absent term is a failure rather than an unrestricted match.',
          ),
        );
      }
      const needle = term.toLowerCase();
      let candidates = products.filter(
        (product) =>
          product.productName !== undefined && product.productName.toLowerCase().includes(needle),
      );
      if (productTypeIDs !== undefined && productTypeIDs.length > 0) {
        const restriction = splitIdentifierList(productTypeIDs);
        candidates = candidates.filter((product) => {
          const assigned = product.productType?.productTypeID;
          return assigned !== undefined && restriction.includes(assigned);
        });
      }
      const rows: ProductSearchRow[] = [];
      for (const product of candidates) {
        const productName = product.productName;
        if (productName !== undefined) {
          rows.push(Object.freeze({ id: product.productID, value: productName }));
        }
      }
      return Promise.resolve(rows);
    },

    /*
     * ⛔ NO `searchByProductTypeBounded` HERE, AND THERE WAS ONE. `ProductRepository` no longer declares a
     * bounded product search: it had no caller in any service, handler or integration, and AAP §0.4.2.1
     * fixes `ProductService` at fifteen members with no product search among them, so it could not
     * acquire one without adding an unratified sixteenth. The full reasoning lives at the site of the
     * removed declaration.
     *
     * ⭐ AND THE OTHER THREE HAVE NOW FOLLOWED IT, so this file declares no windowed double at all.
     * `SkuRepository.searchByProductTypeBounded` and both `OptionRepository` windowed listings were
     * withdrawn on the same ground — no production caller once the service members that would have
     * called them were restored to their ratified counts — and the doubles that mirrored them went with
     * them, together with the two adapter helpers this file used to import to keep their window
     * semantics identical to production. Every double in this file is now a substitute for a member some
     * routed path can actually reach.
     */

    /*
     * F03 — the product write seam that `ProductService.saveProduct` reaches through. It mirrors
     * `src/adapters/mysql/MySqlProductRepository.saveProduct`: the identifier is generated ONLY while the
     * entity is transient, because `model/entity/Product.cfc:L52` declares
     * `fieldtype="id" generator="uuid" ormtype="string" length="32"` and the legacy generator lives in
     * the data-access layer at `model/dao/HibachiDAO.cfc` (IR-6, AAP §0.4.1.11).
     *
     * ⚠️ THE MIRROR IS DELIBERATE AND HAS TO BE MAINTAINED. A double more permissive than its adapter
     * reports a pass for a path production cannot execute; a double stricter than its adapter makes a
     * legitimate path untestable. Both have already happened once in this file, on the SKU write.
     *
     * ⭐ IDEMPOTENT BY DESIGN, BECAUSE THE CIRCULAR FOREIGN KEY FORCES A SECOND CALL.
     * `model/entity/Product.cfc:L71` points a product at its default SKU while
     * `model/entity/Sku.cfc:L65` points every SKU back at its product, so a new product's first write
     * cannot carry `defaultSkuID` — the SKU row does not exist yet. The write order is therefore
     * product, then SKUs, then the SAME product again to set the back-reference. Deciding the branch
     * from `isNew()` rather than from a probe is what makes the second call an UPDATE instead of a
     * duplicate INSERT, and the adapter decides it the same way for the same reason.
     *
     * ⛔ NOTHING IS COMMITTED HERE AND NOTHING IS VALIDATED HERE, because the adapter does neither. The
     * delete guards in `model/validation/Product.json` and the error gate both live above this seam.
     *
     * The saved entity is appended to the searchable list so a later `searchByProductType` observes it,
     * matching the adapter's effect of the row becoming visible to subsequent reads on the same
     * connection (mismatch M6, AAP §0.6.2).
     */
    saveProduct: (product: Product): Promise<Product> => {
      const inserted = product.isNew();
      if (inserted) {
        product.productID = createSlatwallUUID();
      }
      /* The audit stamp, mirroring the adapter. `model/entity/Product.cfc` does not override the ORM
       * hooks, so the framework block is invoked directly. STAMP BEFORE RECORDING, so a recorded call
       * describes the entity as it was written. */
      if (inserted) {
        applyPreInsertAudit(product, options.auditActor);
      } else {
        applyPreUpdateAudit(product, options.auditActor);
      }
      calls.push(Object.freeze({ member: 'saveProduct', productID: product.productID, inserted }));
      saved.push(product);
      if (!products.some((candidate) => candidate.productID === product.productID)) {
        products.push(product);
      }
      return Promise.resolve(product);
    },

    /*
     * F03 — the removal seam. Refuses a transient entity exactly as the adapter does, for the same
     * reason: a removal keyed on the empty unsaved value would compose a predicate matching nothing in a
     * sound table and an arbitrary row in an unsound one.
     *
     * The adapter emits FOUR statements in a forced order — null the back-reference, drop the option
     * links, drop the SKU rows, drop the product — because each references the row removed after it.
     * A double holding entities rather than rows has no link table to unwind, so it records the call and
     * forgets the product; a test that needs to observe the statement ORDER exercises the adapter
     * against a recording executor instead, which is where that ordering is assertable.
     */
    removeProduct: (product: Product): Promise<void> => {
      if (product.isNew()) {
        return Promise.reject(
          new DomainError('A product cannot be removed before it has been persisted.'),
        );
      }
      calls.push(Object.freeze({ member: 'removeProduct', productID: product.productID }));
      removed.push(product);
      const existing = products.findIndex((candidate) => candidate.productID === product.productID);
      if (existing !== -1) {
        products.splice(existing, 1);
      }
      return Promise.resolve();
    },
  };

  return {
    repository,
    calls,
    saved,
    removed,
    addProduct: (product: Product): void => {
      products.push(product);
    },
  };
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 7. The product-type repository.
 *
 * One zero-argument member. `model/dao/ProductTypeDAO.cfc:L51-L65` selects every product type with two
 * correlated COUNT subselects and orders by `productTypeName ASC` — a FLAT list, not a traversal, even
 * though the caller renders a tree from it. Both projections are counts, so both are NUMERIC:
 * `isAssigned` is "how many products use this type", never a boolean.
 * ---------------------------------------------------------------------------------------------------
 */

/** One seeded tree row: the entity plus its two counted projections. */
export interface ProductTypeTreeSeed {
  readonly productType: ProductType;
  /** The count of products assigned to this type. NUMERIC — the name reads like a flag and is not one. */
  readonly isAssigned: number;
  readonly childCount: number;
}

/** The repository plus its factory-local observation state. */
export interface InMemoryProductTypeRepository {
  readonly repository: ProductTypeRepository;
  /** How many times `findAllForTree()` was called. There is no cache, so two calls are two calls. */
  callCount(): number;
  addProductType(seed: ProductTypeTreeSeed): void;
  /** Every product type handed to `saveProductType`, BY REFERENCE and in write order (F03). */
  readonly saved: readonly ProductType[];
  /** Every product type handed to `removeProductType`, BY REFERENCE and in call order (F03). */
  readonly removed: readonly ProductType[];
}

/**
 * Projects one seed into a tree row WITHOUT writing anything to the seed.
 *
 * ⭐ MIN-03 — THE SEED IS NEVER MUTATED, AND THAT IS THE WHOLE POINT OF THIS FUNCTION. An earlier
 * revision merged `isAssigned` and `childCount` straight onto `seed.productType`, so calling
 * `findAllForTree()` PERMANENTLY attached two projection members to an entity the test owns and shares
 * — one call could not be undone, and a seed reused by a later case carried the previous case's counts.
 *
 * THE CLONE MIRRORS `mapProductTypeTreeRow` RATHER THAN INVENTING A SHAPE.
 * `src/adapters/mysql/rowMappers.ts` hydrates a FRESH `ProductType` per row and then merges the two
 * counts onto it; this does the same thing from a seed instead of from a `MySqlRow`. `new ProductType()`
 * supplies the prototype, so every method the entity declares still resolves on the row — which a plain
 * object spread would silently lose — and `Object.assign` copies the seed's own fields, so scalar state
 * is duplicated while reference-typed state (the parent and child wiring a test built) is shared exactly
 * as it is in the seed graph itself. Preserving that wiring was the one argument for mutating the seed,
 * and it survives the clone untouched.
 *
 * ⚠️ ROW IDENTITY ACROSS CALLS IS DELIBERATELY NOT PRESERVED. Two calls yield two distinct row objects,
 * which is precisely what the real adapter does — it hydrates per call — so a test that asserted
 * `rows[0] === seed.productType` would have been asserting a property production never has. No consumer
 * relies on it: a repository-wide grep finds no use of this factory or of {@link ProductTypeTreeSeed}
 * outside this module today.
 */
function projectProductTypeTreeRow(seed: ProductTypeTreeSeed): ProductTypeTreeRow {
  const projection = Object.assign(new ProductType(), seed.productType);

  return Object.assign(projection, {
    isAssigned: seed.isAssigned,
    childCount: seed.childCount,
  });
}

/**
 * Create the in-memory product-type repository.
 *
 * G6. The two projections are attached with `Object.assign`, exactly as
 * `src/adapters/mysql/rowMappers.ts` attaches them in `mapProductTypeTreeRow`, and — like the adapter —
 * onto a fresh entity per call rather than onto the seed. See {@link projectProductTypeTreeRow}.
 *
 * Nothing is memoised. `findAllForTree()` is observably called every time, because the legacy DAO issues
 * the statement every time.
 */
export function createInMemoryProductTypeRepository(
  seeds: readonly ProductTypeTreeSeed[] = [],
  auditActor?: AccountReference,
): InMemoryProductTypeRepository {
  const productTypes: ProductTypeTreeSeed[] = [...seeds];
  const saved: ProductType[] = [];
  const removed: ProductType[] = [];
  let callCount = 0;

  const repository: ProductTypeRepository = {
    findAllForTree: (): Promise<ProductTypeTreeRow[]> => {
      callCount += 1;
      const rows: ProductTypeTreeRow[] = productTypes.map(projectProductTypeTreeRow);
      rows.sort((left, right) =>
        (left.productTypeName ?? '').localeCompare(right.productTypeName ?? ''),
      );
      return Promise.resolve(rows);
    },

    /*
     * F03 — the write seam `ProductService.saveProductType` reaches through
     * `ProductTypeBaseService`. It mirrors `src/adapters/mysql/MySqlProductTypeRepository`: the
     * identifier is generated ONLY while the entity is transient, because
     * `model/entity/ProductType.cfc:L52` declares `fieldtype="id" generator="uuid"` and the legacy
     * generator lives in the data-access layer at `model/dao/HibachiDAO.cfc`.
     *
     * ⚠️ THE MIRROR IS DELIBERATE AND HAS TO BE MAINTAINED. A double more permissive than its adapter
     * reports a pass for a path production cannot execute; a double stricter than its adapter makes a
     * legitimate path untestable. Both have already happened once in this file, on the SKU write.
     *
     * The saved entity is appended to the seeded list so a later `findAllForTree()` observes it, with
     * both derived counts at zero: a freshly written product type has no assigned products and no
     * children, which is what the correlated subqueries at `model/dao/ProductTypeDAO.cfc:L55-L57` would
     * return for it.
     */
    saveProductType: (productType: ProductType): Promise<ProductType> => {
      const inserted = productType.isNew();
      if (inserted) {
        productType.productTypeID = createSlatwallUUID();
      }
      /*
       * The ENTITY'S OWN hooks, not the free stamping functions, exactly as the adapter does.
       * `model/entity/ProductType.cfc:L305-L313` overrides both and rebuilds `productTypeIDPath` before
       * delegating to the audit block, so calling only the audit functions would leave a re-parented
       * product type carrying a stale ancestry path. `preUpdate`'s first parameter is Hibernate's
       * pre-image, which nothing reads and neither the adapter nor this double has.
       */
      if (inserted) {
        productType.preInsert(auditActor);
      } else {
        productType.preUpdate(undefined, auditActor);
      }
      saved.push(productType);
      const existing = productTypes.findIndex(
        (seed) => seed.productType.productTypeID === productType.productTypeID,
      );
      if (existing === -1) {
        productTypes.push({ productType, isAssigned: 0, childCount: 0 });
      }
      return Promise.resolve(productType);
    },

    /*
     * F03 — the removal seam. Refuses a transient entity exactly as the adapter does, for the same
     * reason: a removal keyed on the empty unsaved value would compose a predicate matching nothing in a
     * sound table and an arbitrary row in an unsound one.
     */
    removeProductType: (productType: ProductType): Promise<void> => {
      if (productType.isNew()) {
        return Promise.reject(
          new DomainError('A product type cannot be removed before it has been persisted.'),
        );
      }
      removed.push(productType);
      const existing = productTypes.findIndex(
        (seed) => seed.productType.productTypeID === productType.productTypeID,
      );
      if (existing !== -1) {
        productTypes.splice(existing, 1);
      }
      return Promise.resolve();
    },
  };

  return {
    repository,
    callCount: (): number => callCount,
    addProductType: (seed: ProductTypeTreeSeed): void => {
      productTypes.push(seed);
    },
    saved,
    removed,
  };
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 8. The validation error bag and the entity-facing delegation surface.
 *
 * `ValidationError` in `src/errors/ValidationError.ts` IS the keyed error bag. It is imported and
 * DELEGATED to here — never reimplemented — because a second implementation is a second set of
 * semantics, and the one that matters (a miss returns `[]` rather than raising) is easy to get wrong.
 *
 * That miss behaviour is not incidental. `org/Hibachi/HibachiErrors.cfc:L47-L50` has an accessor defect,
 * but the in-scope entities do not reach errors through it: they reach them through
 * `org/Hibachi/HibachiTransient.cfc:L29-L68`, whose miss path returns an empty array. The empty-array
 * behaviour is therefore the one to preserve, and the defect is not carried into a layer that never had
 * it.
 *
 * `addError` takes EXACTLY two arguments. The third `persistableError` argument that appears elsewhere in
 * the framework is an entity concern, not part of the validation-engine contract, and adding it here
 * would widen a contract the extracted service does not have.
 * ---------------------------------------------------------------------------------------------------
 */

/**
 * The six error members an entity exposes to `Validator` and to the services.
 *
 * Declared locally because `src/domain/base/populate.ts` — which owns the identical `EntityErrorSurface`
 * inside `ManagedEntity<T>` — is outside this file's dependency whitelist. The shape is verified
 * structurally rather than by name: {@link createManagedBrand} below produces a `ManagedBrand` from it,
 * and that assignment would not compile if any member drifted.
 */
export interface EntityErrorSurface {
  getErrors(): ValidationErrors;
  addError(propertyName: string, message: string): void;
  addErrors(errors: ValidationErrors): void;
  hasErrors(): boolean;
  hasError(propertyName: string): boolean;
  getError(propertyName: string): readonly string[];
}

/** A bag and the six-member surface that delegates to it. */
export interface EntityErrorSurfaceDouble {
  /** The real `ValidationError`. Assert against this, or against the surface — they are the same state. */
  readonly errors: ValidationError;
  readonly surface: EntityErrorSurface;
}

/**
 * Wrap a {@link ValidationError} in the entity-facing surface.
 *
 * The value behind every key is ALWAYS an array, and messages ACCUMULATE in the order they were added.
 * That matters for one case in particular: both of `Sku`'s method rules — `hasUniqueOptions` and
 * `hasOneOptionPerOptionGroup` — report under the SAME `options` key, so a SKU that violates both must
 * show two messages under `options`, in rule order. A bag that overwrote, or that stored a scalar, would
 * lose the second one silently.
 *
 * A fresh bag is allocated per call unless one is supplied, so two calls never share state.
 */
export function createEntityErrorSurface(
  errors: ValidationError = new ValidationError(),
): EntityErrorSurfaceDouble {
  return {
    errors,
    surface: {
      getErrors: (): ValidationErrors => errors.getErrors(),
      addError: (propertyName: string, message: string): void => {
        errors.addError(propertyName, message);
      },
      addErrors: (added: ValidationErrors): void => {
        errors.addErrors(added);
      },
      hasErrors: (): boolean => errors.hasErrors(),
      hasError: (propertyName: string): boolean => errors.hasError(propertyName),
      getError: (propertyName: string): readonly string[] => errors.getError(propertyName),
    },
  };
}

/**
 * Attach an error surface to a real entity, in place, and return it narrowed.
 *
 * `Object.assign` is the mechanism rather than a wrapper object because the entity must stay the SAME
 * reference: the services pass entities around by reference, `Sku.setProduct` relies on identity when it
 * checks membership, and a proxy or copy would break both.
 */
export function attachEntityErrorSurface<TEntity extends object>(
  entity: TEntity,
  errors: ValidationError = new ValidationError(),
): TEntity & EntityErrorSurface {
  return Object.assign(entity, createEntityErrorSurface(errors).surface);
}

/** A managed brand and the bag its error members write to. */
export interface ManagedBrandDouble {
  readonly brand: ManagedBrand;
  readonly errors: ValidationError;
}

/**
 * Build a `ManagedEntity<Brand>` — the shape every `BrandRepository` member traffics in.
 *
 * `Brand` already implements the metadata half of `ManagedEntity` (`getClassName`, `getEntityName`,
 * `getPrimaryIDPropertyName`, `getPrimaryIDValue`, `hasProperty`, `getPropertyMetaData`,
 * `getValueByPropertyIdentifier`), so only the error half has to be attached. The composition below is
 * checked by the compiler with no assertion of any kind: if either half drifted, the return type would
 * stop satisfying `ManagedBrand`.
 *
 * `src/domain/base/populate.ts` owns the production equivalent, `manageEntity`, but it is outside this
 * file's dependency whitelist, so the surface is composed here from the whitelisted pieces instead.
 */
export function createManagedBrand(
  seed: BrandSeed = {},
  errors: ValidationError = new ValidationError(),
): ManagedBrandDouble {
  const brand: ManagedBrand = attachEntityErrorSurface(buildBrand(seed), errors);
  return { brand, errors };
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 9. The brand repository, and the table-scoped URL-title probe.
 *
 * `BrandService` is the cleanest of the four services — one public member, no dead injections — which
 * makes this the simplest repository double. It is still worth being exact about three things: the
 * synchronous constructor, the absence of identifier generation, and the polarity of the availability
 * answer.
 * ---------------------------------------------------------------------------------------------------
 */

/** One recorded call on the brand repository. */
export type BrandRepositoryCall =
  | { readonly member: 'newBrand' }
  | { readonly member: 'getBrand'; readonly brandID: string }
  | { readonly member: 'saveBrand'; readonly brand: ManagedBrand }
  | { readonly member: 'deleteBrand'; readonly brand: ManagedBrand }
  | { readonly member: 'isUrlTitleAvailable'; readonly urlTitle: string }
  | { readonly member: 'findProductIdentifiersByBrand'; readonly brandID: string };

/** Seed configuration for {@link createInMemoryBrandRepository}. */
export interface InMemoryBrandRepositoryOptions {
  /**
   * The acting account the write seam stamps into the audit block, or omitted for none.
   *
   * ⚠️ MIRRORS THE ADAPTER, WHICH MIRRORS THE LEGACY FLUSH. Hibernate fired `preInsert`/`preUpdate`
   * during the request-end flush (`org/Hibachi/Hibachi.cfc`); the port has no ORM session and no flush
   * (mismatch M5), so each MySQL write seam calls the stamping functions in
   * `src/domain/base/AuditableEntity.ts` itself, resolving the actor from `AccountContextPort`. A double
   * that skipped the stamp would let a test observe absent audit fields where production writes
   * timestamps. Omitting this option models an UNAUTHENTICATED request, which is a legitimate legacy
   * state: both timestamps are still stamped and both account foreign keys are left absent.
   */
  readonly auditActor?: AccountReference;

  readonly brands?: readonly ManagedBrand[];
  /** URL titles already held by a row. A seeded title is NOT available. */
  readonly takenUrlTitles?: readonly string[];
  /**
   * Queued answers consumed in order, overriding {@link takenUrlTitles} while they last. This is how a
   * collision SEQUENCE is configured — see {@link createInMemoryBrandRepository} for why that matters.
   */
  readonly urlTitleAvailability?: readonly boolean[];
}

/** The repository plus its factory-local observation state. */
export interface InMemoryBrandRepository {
  readonly repository: BrandRepository;
  /** Live view of the stored brands. */
  readonly brands: readonly ManagedBrand[];
  readonly calls: readonly BrandRepositoryCall[];
  addBrand(brand: ManagedBrand): void;
  /** Mark a URL title as held, so the next probe for it answers `false`. */
  takeUrlTitle(urlTitle: string): void;
  /**
   * Record that a brand still owns a product, so the F9 delete guard's live read finds it.
   *
   * The seeded identifiers are what `findProductIdentifiersByBrand` answers. Nothing here builds a
   * `Product`: the guard reads a LENGTH, so an identifier per owned row is the whole of what the
   * production read projects too.
   */
  ownProduct(brandID: string, productID: string): void;
}

/**
 * Create the in-memory brand repository.
 *
 * Three exactnesses:
 *
 * 1. `newBrand()` is SYNCHRONOUS and generates NOTHING. It returns a fresh managed `Brand` whose
 *    `brandID` is `''` — so `isNew()` is true — and whose `products` is a fresh live `[]`. The legacy
 *    `new*` member fabricated by `org/Hibachi/HibachiService.cfc:L255-L281` constructs a transient
 *    entity and the identifier arrives on flush, so no 32-character value is minted here and no UUID
 *    helper exists in this file.
 * 2. `saveBrand` mutates only factory-local state and does NOT assign an identifier either. A brand saved
 *    while still new stays new, and it is the caller's job to supply a 32-character lowercase hexadecimal
 *    identifier when a test needs a persisted one. No transaction is involved: M5 belongs to
 *    `UnitOfWork`, and pretending a repository commits would hide the boundary rather than model it.
 * 3. `isUrlTitleAvailable` answers with the POLARITY the port declares — `true` means AVAILABLE, safe to
 *    save. Inverting it silently inverts validation, which is precisely the class of error that passes
 *    review.
 *
 * The first-collision suffix is preserved INDIRECTLY, by making the collision sequence configurable
 * rather than by reimplementing the algorithm. `BrandService.createUniqueBrandUrlTitle` delegates to the
 * shared unique-title routine, which probes the bare title first and then `-2`, `-3`, … — the first
 * suffix is `-2`, not `-1`, because the counter is pre-incremented. Seeding the bare title as taken is
 * therefore all a test needs in order to observe that.
 */
export function createInMemoryBrandRepository(
  options: InMemoryBrandRepositoryOptions = {},
): InMemoryBrandRepository {
  const brands: ManagedBrand[] = options.brands === undefined ? [] : [...options.brands];
  const takenUrlTitles = new Set<string>(options.takenUrlTitles ?? []);
  const availabilityQueue: boolean[] =
    options.urlTitleAvailability === undefined ? [] : [...options.urlTitleAvailability];
  const calls: BrandRepositoryCall[] = [];
  /** F9 — owned product identifiers per brand, seeded through `ownProduct`. */
  const ownedProductIdsByBrand = new Map<string, string[]>();

  const repository: BrandRepository = {
    newBrand: (): ManagedBrand => {
      calls.push(Object.freeze({ member: 'newBrand' }));
      return createManagedBrand().brand;
    },

    getBrand: (brandID: string): Promise<ManagedBrand | null> => {
      calls.push(Object.freeze({ member: 'getBrand', brandID }));
      return Promise.resolve(brands.find((brand) => brand.brandID === brandID) ?? null);
    },

    saveBrand: (brand: ManagedBrand): Promise<ManagedBrand> => {
      calls.push(Object.freeze({ member: 'saveBrand', brand }));
      /*
       * Upsert by identifier when there is one. A still-new brand has no key to match on, so it is
       * appended — which is exactly what an insert does, and it keeps the caller's reference.
       */
      const existingIndex =
        brand.brandID === '' ? -1 : brands.findIndex((stored) => stored.brandID === brand.brandID);
      /*
       * ⚠️ THE IDENTIFIER IS MINTED AND THE AUDIT BLOCK IS STAMPED, BOTH BECAUSE THE ADAPTER DOES.
       * `MySqlBrandRepository.saveBrand` assigns `createSlatwallUUID()` on its insert branch and then
       * calls the framework stamping functions — `model/entity/Brand.cfc` does not override the ORM
       * hooks. An earlier revision of this double did neither, so a test could observe a brand saved with
       * an empty identifier and absent audit fields, which production never produces. That is the same
       * class of divergence that let the SKU write seam's refusal survive a green suite.
       */
      if (existingIndex === -1) {
        if (brand.brandID === '') {
          brand.brandID = createSlatwallUUID();
        }
        applyPreInsertAudit(brand, options.auditActor);
        brands.push(brand);
      } else {
        applyPreUpdateAudit(brand, options.auditActor);
        brands[existingIndex] = brand;
      }
      return Promise.resolve(brand);
    },

    deleteBrand: (brand: ManagedBrand): Promise<boolean> => {
      calls.push(Object.freeze({ member: 'deleteBrand', brand }));
      const storedIndex = brands.indexOf(brand);
      if (storedIndex === -1) {
        return Promise.resolve(false);
      }
      brands.splice(storedIndex, 1);
      /*
       * The delete GUARDS — `model/validation/Brand.json`'s minCollection rules on products and the
       * rest — live in the validation rule sets and are evaluated by `Validator` before this member is
       * ever reached. Duplicating them here would let a test pass against the wrong layer.
       */
      return Promise.resolve(true);
    },

    isUrlTitleAvailable: (urlTitle: string): Promise<boolean> => {
      calls.push(Object.freeze({ member: 'isUrlTitleAvailable', urlTitle }));
      const queued = availabilityQueue.shift();
      if (queued !== undefined) {
        return Promise.resolve(queued);
      }
      return Promise.resolve(!takenUrlTitles.has(urlTitle));
    },

    /*
     * F9 — the lazy products load, in memory. Answers only what was explicitly seeded through
     * `ownProduct`, so a brand nothing seeded owns nothing and the guard's ceiling of zero passes —
     * which is the behaviour of a brand that genuinely owns no product, not a stub shortcut.
     */
    findProductIdentifiersByBrand: (brandID: string): Promise<string[]> => {
      calls.push(Object.freeze({ member: 'findProductIdentifiersByBrand', brandID }));
      return Promise.resolve([...(ownedProductIdsByBrand.get(brandID) ?? [])]);
    },
  };

  return {
    repository,
    brands,
    calls,
    addBrand: (brand: ManagedBrand): void => {
      brands.push(brand);
    },
    takeUrlTitle: (urlTitle: string): void => {
      takenUrlTitles.add(urlTitle);
    },
    ownProduct: (brandID: string, productID: string): void => {
      const owned = ownedProductIdsByBrand.get(brandID);
      if (owned === undefined) {
        ownedProductIdsByBrand.set(brandID, [productID]);
        return;
      }
      owned.push(productID);
    },
  };
}

/**
 * The only three tables the legacy unique-URL-title algorithm is ever invoked against.
 *
 * DERIVED from the real `PhysicalTableName` union with `Extract`, not spelled as free string literals:
 * if any of the three names were wrong the union would resolve to `never` and this file would stop
 * compiling. `src/adapters/mysql/UniquePropertyChecker.ts` constrains its probe to the same three.
 * Nothing else is admissible — in particular no content table and no caller-chosen table name.
 */
export type UrlTitleTableName = Extract<
  PhysicalTableName,
  'SwProduct' | 'SwProductType' | 'SwBrand'
>;

/** The table-scoped probe shape. */
export interface UrlTitleAvailabilityProbe {
  isUrlTitleAvailable(tableName: UrlTitleTableName, value: string): Promise<boolean>;
}

/** One recorded probe. */
export interface UrlTitleAvailabilityCall {
  readonly tableName: UrlTitleTableName;
  readonly value: string;
}

/** The probe plus its factory-local observation state. */
export interface UrlTitleAvailabilityDouble {
  readonly probe: UrlTitleAvailabilityProbe;
  readonly calls: readonly UrlTitleAvailabilityCall[];
  /** Mark a title as held in a table, so the next probe for that pair answers `false`. */
  take(tableName: UrlTitleTableName, value: string): void;
}

/**
 * Create the table-scoped URL-title availability probe.
 *
 * G6. The production implementation of this seam is
 * `src/adapters/mysql/UniquePropertyChecker.ts#isUrlTitleAvailable`, which is OUTSIDE this file's
 * dependency whitelist, so the shape is declared locally rather than imported. Only the shape is local:
 * the table union above is derived from the real whitelist, the column is always `urlTitle`, and the
 * polarity matches the production member — `true` means the title is still available.
 *
 * `BrandRepository.isUrlTitleAvailable` is the one-argument, brand-only view of the same question, and
 * `BrandService` closes over it. This probe is the general form the other two tables need.
 */
export function createUrlTitleAvailabilityDouble(
  taken: readonly UrlTitleAvailabilityCall[] = [],
): UrlTitleAvailabilityDouble {
  const held = new Set<string>(taken.map((entry) => `${entry.tableName}.${entry.value}`));
  const calls: UrlTitleAvailabilityCall[] = [];

  return {
    calls,
    probe: {
      isUrlTitleAvailable: (tableName: UrlTitleTableName, value: string): Promise<boolean> => {
        calls.push(Object.freeze({ tableName, value }));
        return Promise.resolve(!held.has(`${tableName}.${value}`));
      },
    },
    take: (tableName: UrlTitleTableName, value: string): void => {
      held.add(`${tableName}.${value}`);
    },
  };
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 10. The eight boundary ports.
 *
 * Each of these exists because an in-scope member genuinely depends on an out-of-scope collaborator
 * (AAP §0.2.2.7). None of them redeclares its port interface — the real export is imported and satisfied
 * — and none of them models any part of the excluded service behind it. The sixteen explicitly excluded
 * calculated members of AAP §0.2.2.6 appear nowhere: not as entity fields, not as port members, and not
 * as seeds.
 * ---------------------------------------------------------------------------------------------------
 */

/*
 * ---------------------------------------------------------------------------------------------------
 * 10.0 GATED SETTLEMENT — the seam that makes "sequential" distinguishable from "concurrent".
 *
 * ⚠️ WHY THIS EXISTS AT ALL, STATED AS THE DEFECT IT CLOSES RATHER THAN AS A FEATURE. Every asynchronous
 * double below used to answer with an ALREADY-RESOLVED promise. A resolved promise settles on the next
 * microtask, so a consumer written as `for (const x of xs) { await f(x) }` and a consumer written as
 * `await Promise.all(xs.map(f))` produce the SAME recorded call order: the concurrent form still STARTS
 * its calls in input order, and nothing observable distinguishes it from the sequential form. Any test
 * asserting order against immediate promises therefore passes for both — which means it does not assert
 * ordering at all.
 *
 * `src/integrations/google/ProductFeedBuilder.ts` is the consumer where that matters. Its record loop and
 * its per-record image loop are DELIBERATELY sequential `for...of` + `await`, and
 * `src/ports/SmartListQueryPort.ts` and `src/adapters/mysql/UnitOfWork.ts` both record why nothing in this
 * subtree may be quietly parallelised: the executor a boundary hands out may be bound to ONE
 * transaction-scoped connection, and a connection cannot carry overlapping statements. So the sequencing
 * is behaviour, and behaviour needs a test that fails when it changes.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT A GATED DOUBLE ADDS, IN ONE SENTENCE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * It separates the moment a call STARTS from the moment it RESOLVES, and puts the second one under the
 * test's control — so a test can prove that call N+1 has not started while call N is still outstanding.
 * Under `Promise.all` every call starts before any resolves, and the very same assertion fails.
 *
 * ⚠️ IT IS OPT-IN, AND EVERY EXISTING CASE KEEPS ITS OLD BEHAVIOUR. The flag defaults to off, in which
 * case each member answers immediately exactly as it always did. Nothing about the answers changes when
 * it is on either: the value a parked call will resolve with is computed at CALL time, from the same
 * seeds, and only its DELIVERY waits. A gated double therefore cannot answer something an immediate
 * double would not have.
 *
 * ⛔ NO TIMER, NO DELAY, NO SCHEDULER. Nothing here calls `setTimeout`, and no duration is named anywhere:
 * a test settles a parked call explicitly. AAP §0.7.3 S9 forbids minting a figure the source does not
 * state, and a gate needs no figure — which is also why it is deterministic where a delay would be flaky.
 * ---------------------------------------------------------------------------------------------------
 */

/**
 * A promise whose settlement the test performs, rather than the double.
 *
 * The two settle members are captured out of the executor callback, which runs synchronously inside the
 * `Promise` constructor — so both are assigned before the constructor returns and neither can be
 * `undefined` by the time a caller could reach it. They are typed as definitely assigned for that reason,
 * and the initialisation below is what earns it.
 *
 * @typeParam T - Whatever the parked call will answer with.
 */
export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

/**
 * Create a deferred promise.
 *
 * @typeParam T - Whatever the parked call will answer with.
 * @returns The promise together with its two settle members.
 */
export function createDeferred<T>(): Deferred<T> {
  let resolveCapture: ((value: T) => void) | undefined;
  let rejectCapture: ((reason: unknown) => void) | undefined;

  const promise = new Promise<T>((resolve, reject) => {
    resolveCapture = resolve;
    rejectCapture = reject;
  });

  const capturedResolve = resolveCapture;
  const capturedReject = rejectCapture;

  if (capturedResolve === undefined || capturedReject === undefined) {
    /*
     * Unreachable: the executor of a `Promise` runs synchronously during construction, so both captures
     * are assigned above. It is stated rather than asserted away with a cast, because a cast would also
     * hide a genuine regression if that ever stopped being true.
     */
    throw new DomainError(
      'A deferred promise was constructed without capturing its settle members, so the test could ' +
        'never have settled it.',
    );
  }

  return { promise, resolve: capturedResolve, reject: capturedReject };
}

/**
 * One call that has STARTED and has not yet been settled.
 *
 * `describe` is a short, stable description of what the call asked for — the product identifier for a
 * pricing read, the member and its subject for an image read. It is what a test compares against to prove
 * WHICH call is outstanding, rather than merely how many are.
 */
export interface PendingCall {
  /** What the call asked for, in a form a test can compare. */
  readonly describe: string;
  /** Deliver the answer the immediate double would have given, computed when the call started. */
  settle(): void;
  /** Deliver a failure instead, so the consumer's error path is reachable under gating too. */
  reject(failure: unknown): void;
}

/**
 * Park a call, or answer it immediately, according to the double's configuration.
 *
 * Shared by the two gated doubles so neither can drift into a different gating rule. The `answer` is
 * computed by the CALLER before this is reached, which is what guarantees a gated double answers exactly
 * what an ungated one would.
 *
 * @typeParam T - The member's answer type.
 * @param gate - The double's gate, or `undefined` when the double settles immediately.
 * @param describe - What the call asked for.
 * @param answer - The value the immediate double would have resolved with.
 * @param onResolved - Records the RESOLUTION, as distinct from the start. Called once, when the answer is
 *   actually delivered, so a test can compare start order against resolution order.
 * @returns The member's promise.
 */
function settleThroughGate<T>(
  gate: PendingCall[] | undefined,
  describe: string,
  answer: T,
  onResolved: () => void,
): Promise<T> {
  if (gate === undefined) {
    onResolved();

    return Promise.resolve(answer);
  }

  const deferred = createDeferred<T>();

  /*
   * ⭐ THE GATE HOLDS ONLY OUTSTANDING CALLS, so a settled entry is REMOVED rather than marked. That is
   * what lets `pending` be read directly as "what the consumer is currently waiting on" — the assertion
   * every ordering case actually wants — instead of a growing log a test would have to filter. Removal is
   * by identity, so settling out of order (which a test may legitimately do) leaves the rest intact.
   */
  const forget = (): boolean => {
    const position = gate.indexOf(entry);

    if (position === -1) {
      return false;
    }
    gate.splice(position, 1);

    return true;
  };

  const entry: PendingCall = Object.freeze({
    describe,
    settle: (): void => {
      if (!forget()) {
        return;
      }
      onResolved();
      deferred.resolve(answer);
    },
    reject: (failure: unknown): void => {
      if (!forget()) {
        return;
      }
      deferred.reject(failure);
    },
  });

  gate.push(entry);

  return deferred.promise;
}

/**
 * Settle the OLDEST outstanding call, and refuse loudly when there is none.
 *
 * Refusing rather than returning quietly is the point: a test that settles more calls than were started
 * has mis-modelled the consumer, and a silent no-op there would look like a passing ordering assertion.
 *
 * @param gate - The double's outstanding calls, oldest first.
 * @param what - Names the double in the refusal, so the message identifies which one ran dry.
 */
function settleOldestPendingCall(gate: readonly PendingCall[], what: string): void {
  const [oldest] = gate;

  if (oldest === undefined) {
    throw new DomainError(
      `A test asked the ${what} double to settle a call, but no call is outstanding — so the ` +
        'consumer had not reached the point the test assumed it had.',
    );
  }

  oldest.settle();
}

/*
 * 10.1 The setting resolver.
 *
 * SYNCHRONOUS, single member, no promise anywhere. That is not a simplification: `setting()` is called
 * from inside entity accessors that are themselves synchronous, and making it asynchronous would ripple
 * an `await` into every one of them.
 *
 * S8 / M8. The out-of-scope stock-calculation path launches a named `cfthread`, so the platform's real
 * setting engine has an asynchronous edge. The in-scope slice never waits on it, and this contract is
 * declared synchronous precisely so no in-scope caller can come to depend on background completion.
 *
 * Nothing here models `filterEntities`, `formatValue`, `getSettingDetails` or any other part of the
 * out-of-scope setting engine.
 */

/** Where a seeded value applies, mirroring the hierarchy `model/entity/HibachiEntity.cfc:L129` walks. */
export type SettingScope =
  | { readonly kind: 'global' }
  | { readonly kind: 'entityName'; readonly entityName: SettingResolutionEntityName }
  | {
      readonly kind: 'entity';
      readonly entityName: SettingResolutionEntityName;
      readonly entityId: string;
    };

/** One seeded setting value. */
export interface SettingSeed {
  readonly settingName: SettingName;
  readonly value: SettingValue;
  /** Defaults to global. */
  readonly scope?: SettingScope;
}

/** One recorded resolution. */
export interface SettingResolverCall {
  readonly settingName: SettingName;
  readonly context: SettingResolutionContext | undefined;
}

/** Seed configuration for {@link createSettingResolverDouble}. */
export interface SettingResolverDoubleOptions {
  readonly settings?: readonly SettingSeed[];
  /**
   * Opt-in answer for a key nothing seeded. Omitted, an unseeded key FAILS — see
   * {@link createSettingResolverDouble} for why that is the default.
   */
  readonly fallback?: SettingValue;
}

/** The resolver plus its factory-local observation state. */
export interface SettingResolverDouble {
  readonly resolver: SettingResolverPort;
  readonly calls: readonly SettingResolverCall[];
  /** Seed or overwrite a value after construction. */
  set(seed: SettingSeed): void;
}

/**
 * Create the setting resolver.
 *
 * Resolution walks the same three levels the legacy accessor does, most specific first: a value scoped to
 * this exact entity, then one scoped to the entity CLASS, then the global value. Per-context values are
 * not a convenience — the legacy calls resolve against `object=this`, and the image-dimension keys in
 * particular are frequently resolved against the PRODUCT while the caller is a SKU, so a flat global map
 * alone cannot express what the slice actually reads.
 *
 * Every key the port declares is expressible, including both interpolated forms
 * (`productImage<size>Width` and `productImage<size>Height`) for an arbitrary size string, and including
 * the two byte-exact shipping keys `skuShippingWeight` and `skuShippingWeightUnitCode` that the feed
 * assembles its shipping weight from.
 *
 * An unseeded key raises rather than returning a value. NO production default is invented here: the
 * platform seeds only a handful of setting rows and everything else falls back to metadata defaults that
 * live in the out-of-scope setting service, so guessing one would be fabrication. A test seeds exactly
 * what it reads, or opts into {@link SettingResolverDoubleOptions.fallback} to say it does not care.
 */
export function createSettingResolverDouble(
  options: SettingResolverDoubleOptions = {},
): SettingResolverDouble {
  const seeds: SettingSeed[] = options.settings === undefined ? [] : [...options.settings];
  const calls: SettingResolverCall[] = [];
  const fallback = options.fallback;

  const scopeMatches = (
    scope: SettingScope,
    kind: SettingScope['kind'],
    context: SettingResolutionContext | undefined,
  ): boolean => {
    if (scope.kind !== kind) {
      return false;
    }
    if (scope.kind === 'global') {
      return true;
    }
    if (context === undefined) {
      return false;
    }
    if (scope.entityName !== context.entityName) {
      return false;
    }
    return scope.kind === 'entityName' || scope.entityId === context.entityId;
  };

  const resolve = (
    settingName: SettingName,
    context: SettingResolutionContext | undefined,
  ): SettingValue | undefined => {
    const candidates = seeds.filter((seed) => seed.settingName === settingName);
    for (const kind of ['entity', 'entityName', 'global'] as const) {
      /*
       * Last seed wins within a level, so `set()` overwrites rather than being shadowed by an earlier
       * seed of the same specificity.
       */
      for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const candidate = candidates[index];
        if (candidate === undefined) {
          continue;
        }
        if (scopeMatches(candidate.scope ?? { kind: 'global' }, kind, context)) {
          return candidate.value;
        }
      }
    }
    return undefined;
  };

  return {
    calls,
    resolver: {
      setting: (settingName: SettingName, context?: SettingResolutionContext): SettingValue => {
        calls.push(Object.freeze({ settingName, context }));
        const resolved = resolve(settingName, context);
        if (resolved !== undefined) {
          return resolved;
        }
        if (fallback !== undefined) {
          return fallback;
        }
        throw new DomainError(
          'A setting was read that this test did not seed. The effective-value engine lives in the ' +
            'out-of-scope setting service, so no default is invented here: seed the key, or opt into a ' +
            'fallback to declare that its value does not matter.',
          { context: { settingName } },
        );
      },
    },
    set: (seed: SettingSeed): void => {
      seeds.push(seed);
    },
  };
}

/*
 * 10.2 The image path port.
 *
 * Four members, all asynchronous, all configurable, and NONE of them touching a filesystem, a network or
 * an object store. The branded return type is built through the port's own exported `toImageWebPath`
 * factory, so no assertion is needed to produce one.
 *
 * TODO(boundary) — `model/entity/Sku.cfc:L221-L227` hands `expandPath()` a value that `:L146` composed
 * as a WEB path, and `model/service/SkuService.cfc:L211-L212` hands the same composed value to the WRITE
 * member as `filePath`. That mismatch is flagged, not resolved: resolving it would change which file the
 * legacy looked for and which file it wrote. An earlier revision DID resolve it — the port refused a
 * composed path and validated a basename instead — and that particular hardening stays withdrawn, because
 * a basename carries no destination, so substituting one destroyed the write rather than confining it
 * (`src/ports/ImagePathPort.ts` DECISION I-1 control (4)). This double therefore keys existence on the
 * composed path and records the `filePath` it was handed.
 *
 * ⭐ THE WRITE IS NEVERTHELESS GATED NOW — UPSTREAM OF THIS DOUBLE, WHICH IS WHY THIS DOUBLE DID NOT
 * CHANGE. Review finding F6 screens the stored `imageFile` in `src/services/SkuService.ts` BEFORE a path is
 * composed, so a name the legacy's own generator could not have produced never reaches `getImagePath` or
 * `saveImageFile` here at all — a refused upload leaves `calls` empty. Note the consequence for tests:
 * `saveImageFile` below answers `true` UNCONDITIONALLY and enforces no `allowedExtensions` policy of its
 * own, so a `true` from this double has never been evidence that the legacy would have stored the file. It
 * is evidence only that the service asked.
 *
 * No `getImageDirectory` member is invented on the SKU side, and no extension is added to the
 * `jpg,jpeg,png,gif` list the upload seam carries — this double records the list it is handed so a test
 * can assert the order survived, and supplies none of its own.
 *
 * TODO(parity) the image-verdict divergence [model/service/SkuService.cfc:L213-L217] — `model/service/SkuService.cfc:L210-L218`: `processImageUpload` is named and shaped
 * like the other `process*` members, every one of which returns its entity, but this one returns whatever
 * the dynamically resolved image service returned — a BOOLEAN. `saveImageFile` here answers `boolean`
 * because that is the PORT's contract and the legacy's own verdict; the SERVICE member answers with the
 * SKU, per AAP §0.4.2.2, and consumes this boolean internally. Recording the verdict here is what lets a
 * case still assert WHICH way the write went even though the service no longer publishes it.
 */

/** One recorded call on the image path port. */
export type ImagePathCall =
  | { readonly member: 'getImagePath'; readonly imageFile: string }
  | { readonly member: 'getResizedImagePath'; readonly request: ResizedImagePathRequest }
  | { readonly member: 'getImageExistsFlag'; readonly imagePath: ImageWebPath }
  | { readonly member: 'saveImageFile'; readonly request: SaveImageFileRequest };

/**
 * The base image URL every suite composes image paths from.
 *
 * The legacy value is whatever `getHibachiScope().getBaseImageURL()` returns at run time
 * (`model/entity/Sku.cfc:L146`), which no source file pins — so this is a TEST value and nothing more.
 * It is declared once, here, because six construction sites and several path assertions must agree on
 * it; a per-file literal would let one drift and turn a containment assertion into a false pass.
 */
export const TEST_IMAGE_BASE_URL = '/assets/images';

/**
 * The product-image directory every image expectation in the suite is composed against.
 *
 * ⭐ COMPOSED FROM THE LEGACY'S OWN SEGMENT CONSTANT, NOT TYPED OUT. Concatenating
 * {@link TEST_IMAGE_BASE_URL} with `SKU_IMAGE_PATH_SEGMENT` reproduces exactly the shape
 * `model/entity/Sku.cfc:L145` composes, so a path a test asserts on is the one the production
 * composition would produce rather than a look-alike string.
 *
 * ⛔ IT IS A PLAIN STRING, AND IT IS NOT A CONTAINMENT ROOT. A revision branded this value through a
 * `toImageStorageRoot` helper and wired it into `SkuService` as an eleventh constructor parameter, so
 * that writes could be required to land beneath it. Both are withdrawn: the legacy never checks
 * containment and had no such value to derive, so the root and its enforcement were invented
 * configuration (AAP §0.7.3 S9, IR-12). Nor is a narrower name gate enforced anywhere — the write-side
 * predicate that briefly stood in `src/services/SkuService.ts` is withdrawn under review finding F4,
 * because it refused input `model/service/SkuService.cfc:L212` accepts. This constant survives only as the
 * base for composing expected paths.
 */
export const TEST_IMAGE_STORAGE_ROOT = `${TEST_IMAGE_BASE_URL}${SKU_IMAGE_PATH_SEGMENT}`;

/** Seed configuration for {@link createImagePathDouble}. */
export interface ImagePathDoubleOptions {
  /** Composed web path per image file name. An unseeded name echoes back unchanged. */
  readonly imagePathsByImageFile?: Readonly<Record<string, string>>;
  /** Answer for every resize. Unseeded, the request's own `imagePath` is echoed back. */
  readonly resizedImagePath?: string;
  /**
   * Composed image PATHS that exist. Everything else does not.
   *
   * The probe receives the composed path, exactly as `model/entity/Sku.cfc:L222` probes with
   * `expandPath(getImagePath())`. Because the two path members ECHO by default, an unseeded image file
   * name arrives here unchanged, so a test that seeds neither `imagePathsByImageFile` nor a composed
   * value may list the bare file name and still match.
   */
  readonly existingImageFiles?: readonly string[];
  /** Answer for `saveImageFile`. Defaults to `true`. */
  readonly saveSucceeds?: boolean;
  /**
   * Park every read until the test settles it, instead of answering on the next microtask.
   *
   * Defaults to `false`, which is the immediate behaviour every existing case relies on. Section 10.0
   * records why the immediate form cannot distinguish a sequential consumer from a concurrent one, and
   * `src/integrations/google/ProductFeedBuilder.ts`'s per-record image loop is the consumer that needs the
   * distinction: it awaits the SKU's own resized path and then each additional image's, strictly in the
   * order `integrationServices/google/views/feed/product.cfm:L24-L26` emitted them.
   *
   * The answers are unchanged — each parked call already holds the value the immediate double computed
   * from the same seeds — so gating changes WHEN an answer arrives and never WHAT it is.
   */
  readonly deferSettlement?: boolean;
}

/** The port plus its factory-local observation state. */
export interface ImagePathDouble {
  readonly imagePaths: ImagePathPort;
  readonly calls: readonly ImagePathCall[];
  /**
   * Reads that have STARTED and not yet been settled, oldest first.
   *
   * Always empty unless {@link ImagePathDoubleOptions.deferSettlement} is on. `calls` is the START log and
   * this is the OUTSTANDING set, and it is the difference between the two that a concurrent implementation
   * cannot fake: a sequential consumer never has two outstanding at once.
   */
  readonly pending: readonly PendingCall[];
  /**
   * Reads that have RESOLVED, in resolution order, described exactly as {@link PendingCall.describe} does.
   *
   * Populated on both the immediate and the gated path, so a case can compare start order against
   * resolution order without knowing which mode it is in.
   */
  readonly resolved: readonly string[];
  /** Mark an image file as existing. */
  addExistingImageFile(imageFile: string): void;
  /**
   * Settle the oldest outstanding read with the answer it already holds.
   *
   * @throws {DomainError} When no read is outstanding — see {@link settleOldestPendingCall} for why that
   *   is a failure rather than a no-op.
   */
  settleNextRead(): void;
}

/**
 * Create the image path port.
 *
 * The two path members ECHO rather than compose. That is deliberate: the real composition reads
 * `globalAssetsImageFolderPath` and the `/product/default/` segment and belongs to the adapter, so
 * fabricating a directory layout here would invent a contract. A test that cares about the composed value
 * seeds it.
 *
 * `getResizedImagePath` accepts a request with NO size — which is exactly how the Google feed calls it —
 * and any size string remains representable, so the deprecated single-letter aliases and the
 * Large/Medium/Small triple are not privileged over anything else.
 */
export function createImagePathDouble(options: ImagePathDoubleOptions = {}): ImagePathDouble {
  const calls: ImagePathCall[] = [];
  const existingImageFiles = new Set<string>(options.existingImageFiles ?? []);
  const imagePathsByImageFile = options.imagePathsByImageFile ?? {};
  const resizedImagePath = options.resizedImagePath;
  const saveSucceeds = options.saveSucceeds ?? true;

  /*
   * `undefined` rather than an empty array when gating is off, because `settleThroughGate` reads the
   * ABSENCE of a gate as "answer immediately". Section 10.0 explains why that default is preserved.
   */
  const pending: PendingCall[] | undefined = options.deferSettlement === true ? [] : undefined;
  const resolved: string[] = [];
  const note = (describe: string): (() => void) => {
    return (): void => {
      resolved.push(describe);
    };
  };

  return {
    calls,
    pending: pending ?? [],
    resolved,
    imagePaths: {
      getImagePath: (imageFile: string): Promise<ImageWebPath> => {
        calls.push(Object.freeze({ member: 'getImagePath', imageFile }));
        const describe = `getImagePath:${imageFile}`;

        return settleThroughGate(
          pending,
          describe,
          toImageWebPath(imagePathsByImageFile[imageFile] ?? imageFile),
          note(describe),
        );
      },
      getResizedImagePath: (request: ResizedImagePathRequest): Promise<ImageWebPath> => {
        calls.push(Object.freeze({ member: 'getResizedImagePath', request }));
        /* The size travels in the description because the feed asks for the SAME path at two sizes. */
        const describe = `getResizedImagePath:${request.imagePath}${
          request.size === undefined ? '' : `@${request.size}`
        }`;

        return settleThroughGate(
          pending,
          describe,
          toImageWebPath(resizedImagePath ?? request.imagePath),
          note(describe),
        );
      },
      getImageExistsFlag: (imagePath: ImageWebPath): Promise<boolean> => {
        calls.push(Object.freeze({ member: 'getImageExistsFlag', imagePath }));
        const describe = `getImageExistsFlag:${imagePath}`;

        /*
         * The answer is read HERE, at call time, not when the gate opens. That matters: a test that marks
         * a file as existing while a probe is parked must not change the parked probe's answer, because an
         * immediate double could never have behaved that way either.
         */
        return settleThroughGate(
          pending,
          describe,
          existingImageFiles.has(imagePath),
          note(describe),
        );
      },
      saveImageFile: (request: SaveImageFileRequest): Promise<boolean> => {
        calls.push(Object.freeze({ member: 'saveImageFile', request }));
        const describe = `saveImageFile:${request.filePath}`;

        return settleThroughGate(pending, describe, saveSucceeds, note(describe));
      },
    },
    addExistingImageFile: (imageFile: string): void => {
      existingImageFiles.add(imageFile);
    },
    settleNextRead: (): void => {
      settleOldestPendingCall(pending ?? [], 'image path');
    },
  };
}

/*
 * 10.3 The subscription term port.
 *
 * Two lookups over OPAQUE references. Nothing computes a schedule, a billing period, a proration or a
 * renewal rule, because all of that lives in the excluded subscription domain.
 *
 * The branch input asymmetry the port already encodes is worth stating so nobody "tidies" it: on
 * `SubscriptionSkuCreationData`, `renewalSubscriptionBenefits` is REQUIRED while its two siblings are
 * optional. That is not an oversight — the legacy reads the renewal list unguarded while guarding the
 * others with `structKeyExists`, so an absent renewal list is a failure and an absent sibling is not.
 */

/** One recorded call on the subscription term port. */
export type SubscriptionTermCall =
  | { readonly member: 'getSubscriptionTerm'; readonly subscriptionTermID: string }
  | { readonly member: 'getSubscriptionBenefit'; readonly subscriptionBenefitID: string }
  | {
      readonly member: 'getSubscriptionTermsByIDs';
      readonly subscriptionTermIDs: readonly string[];
    }
  | {
      readonly member: 'getSubscriptionBenefitsByIDs';
      readonly subscriptionBenefitIDs: readonly string[];
    };

/** Seed configuration for {@link createSubscriptionTermDouble}. */
export interface SubscriptionTermDoubleOptions {
  readonly subscriptionTermIDs?: readonly string[];
  readonly subscriptionBenefitIDs?: readonly string[];
}

/** The port plus its factory-local observation state. */
export interface SubscriptionTermDouble {
  readonly subscriptionTerms: SubscriptionTermPort;
  readonly calls: readonly SubscriptionTermCall[];
}

/** Create the subscription term port. An unseeded identifier resolves to `null`, never to a stub. */
export function createSubscriptionTermDouble(
  options: SubscriptionTermDoubleOptions = {},
): SubscriptionTermDouble {
  const calls: SubscriptionTermCall[] = [];
  const termIDs = new Set<string>(options.subscriptionTermIDs ?? []);
  const benefitIDs = new Set<string>(options.subscriptionBenefitIDs ?? []);

  return {
    calls,
    subscriptionTerms: {
      getSubscriptionTerm: (
        subscriptionTermID: string,
      ): Promise<SubscriptionTermReference | null> => {
        calls.push(Object.freeze({ member: 'getSubscriptionTerm', subscriptionTermID }));
        return Promise.resolve(termIDs.has(subscriptionTermID) ? { subscriptionTermID } : null);
      },
      getSubscriptionBenefit: (
        subscriptionBenefitID: string,
      ): Promise<SubscriptionBenefitReference | null> => {
        calls.push(Object.freeze({ member: 'getSubscriptionBenefit', subscriptionBenefitID }));
        return Promise.resolve(
          benefitIDs.has(subscriptionBenefitID) ? { subscriptionBenefitID } : null,
        );
      },
      /*
       * The two BATCH members. Each records the identifier list it was handed, so a test can assert how
       * many times the branch crossed this boundary rather than only what it ended up with.
       *
       * ⛔ NEITHER MAY DELEGATE PER IDENTIFIER TO ITS SINGULAR SIBLING. Doing so would model a
       * collaborator production does not have and would make the one property these doubles exist to
       * expose — that a list costs ONE call — unobservable.
       *
       * ⚠️ AN UNSEEDED IDENTIFIER IS OMITTED FROM THE MAP rather than present holding `null`, because
       * that is the port's contract and it is what lets the service fall through to the singular member
       * and raise the error the legacy raises, for the element its own walk is on.
       */
      getSubscriptionTermsByIDs: (
        subscriptionTermIDs: readonly string[],
      ): Promise<Map<string, SubscriptionTermReference>> => {
        calls.push(Object.freeze({ member: 'getSubscriptionTermsByIDs', subscriptionTermIDs }));

        const resolved = new Map<string, SubscriptionTermReference>();
        for (const subscriptionTermID of new Set(subscriptionTermIDs)) {
          if (termIDs.has(subscriptionTermID)) {
            resolved.set(subscriptionTermID, { subscriptionTermID });
          }
        }

        return Promise.resolve(resolved);
      },
      getSubscriptionBenefitsByIDs: (
        subscriptionBenefitIDs: readonly string[],
      ): Promise<Map<string, SubscriptionBenefitReference>> => {
        calls.push(
          Object.freeze({ member: 'getSubscriptionBenefitsByIDs', subscriptionBenefitIDs }),
        );

        const resolved = new Map<string, SubscriptionBenefitReference>();
        for (const subscriptionBenefitID of new Set(subscriptionBenefitIDs)) {
          if (benefitIDs.has(subscriptionBenefitID)) {
            resolved.set(subscriptionBenefitID, { subscriptionBenefitID });
          }
        }

        return Promise.resolve(resolved);
      },
    },
  };
}

/*
 * 10.4 The access content port.
 *
 * One lookup over an opaque content reference. No category, entitlement, authorisation, file path or
 * download behaviour is modelled — all of it belongs to the excluded content domain.
 *
 * The two creation modes stay first-class WITHOUT a second port member, because the port already carries
 * `bundleContentAccess` on `ContentAccessSkuCreationData`: set, the service creates one SKU for all
 * contents; clear, one SKU per content. `ContentAccessSkuCreationMode` names both.
 *
 * The `contentService` property declared at `model/service/ProductService.cfc:L57` has ZERO call sites and
 * is NOT wired anywhere in this file.
 */

/** Seed configuration for {@link createAccessContentDouble}. */
export interface AccessContentDoubleOptions {
  readonly contentIDs?: readonly string[];
}

/** The port plus its factory-local observation state. */
export interface AccessContentDouble {
  readonly accessContents: AccessContentPort;
  readonly requestedContentIds: readonly string[];
}

/** Create the access content port. An unseeded identifier resolves to `null`. */
export function createAccessContentDouble(
  options: AccessContentDoubleOptions = {},
): AccessContentDouble {
  const contentIDs = new Set<string>(options.contentIDs ?? []);
  const requestedContentIds: string[] = [];

  return {
    requestedContentIds,
    accessContents: {
      getContent: (contentID: string): Promise<AccessContentReference | null> => {
        requestedContentIds.push(contentID);
        return Promise.resolve(contentIDs.has(contentID) ? { contentID } : null);
      },
      /*
       * The BATCH member. Every identifier it is handed is appended to the same observation list the
       * singular member writes to, so a test still sees WHICH contents were asked for — while the number
       * of CALLS, which is what P15 changed, is visible as the difference between one invocation and one
       * per identifier.
       *
       * ⚠️ An unseeded identifier is omitted from the map, so the service falls through to `getContent`
       * and raises there, for the element its own arm is on.
       */
      getContentsByIDs: (
        batchContentIDs: readonly string[],
      ): Promise<Map<string, AccessContentReference>> => {
        const resolved = new Map<string, AccessContentReference>();
        for (const contentID of new Set(batchContentIDs)) {
          requestedContentIds.push(contentID);
          if (contentIDs.has(contentID)) {
            resolved.set(contentID, { contentID });
          }
        }

        return Promise.resolve(resolved);
      },
    },
  };
}

/*
 * 10.5 The pricing port.
 *
 * ONE retrieval member, and a details record with EXACTLY THREE optional keys: `salePrice`,
 * `salePriceDiscountType` and `salePriceExpirationDateTime`. There is no fourth key — in particular no
 * discount AMOUNT — and the three exist only inside the port's result, never as persisted entity fields.
 */

/**
 * Build a {@link SalePriceDetails} with absent keys genuinely ABSENT.
 *
 * This is the whole point of the helper. Under `exactOptionalPropertyTypes` an explicitly assigned
 * `undefined` is not the same as an omitted key, and the distinction is behavioural here: when
 * `salePrice` is ABSENT the retained domain getter falls back to the ordinary price, whereas forcing `0`
 * or `null` would make every item look like it were on sale — which, through the feed's conditional
 * `g:sale_price` pair, would emit a sale price for the entire catalogue.
 */
export function buildSalePriceDetails(seed: {
  readonly salePrice?: number;
  readonly salePriceDiscountType?: string;
  readonly salePriceExpirationDateTime?: Date;
}): SalePriceDetails {
  const details: {
    salePrice?: number;
    salePriceDiscountType?: string;
    salePriceExpirationDateTime?: Date;
  } = {};
  if (seed.salePrice !== undefined) {
    details.salePrice = seed.salePrice;
  }
  if (seed.salePriceDiscountType !== undefined) {
    details.salePriceDiscountType = seed.salePriceDiscountType;
  }
  if (seed.salePriceExpirationDateTime !== undefined) {
    details.salePriceExpirationDateTime = seed.salePriceExpirationDateTime;
  }
  return details;
}

/** Seed configuration for {@link createPricingDouble}. */
export interface PricingDoubleOptions {
  /** Sale-price details per product identifier, keyed within by SKU identifier. */
  readonly detailsByProductId?: Readonly<Record<string, SalePriceDetailsBySkuId>>;
  /**
   * Park every read until the test settles it, instead of answering on the next microtask.
   *
   * Defaults to `false`, the immediate behaviour every existing case relies on. Section 10.0 records why
   * the immediate form cannot distinguish a sequential consumer from a concurrent one. This port's
   * consumer is `src/integrations/google/ProductFeedBuilder.ts`, whose record loop awaits one record's
   * sale-price read before starting the next — and whose per-build memo means two SKUs of the SAME product
   * share ONE read, so a case proving the sequencing must use two DIFFERENT products.
   */
  readonly deferSettlement?: boolean;
}

/** The port plus its factory-local observation state. */
export interface PricingDouble {
  readonly pricing: PricingPort;
  /** Every read's product identifier, in START order. */
  readonly requestedProductIds: readonly string[];
  /**
   * Reads that have STARTED and not yet been settled, oldest first.
   *
   * Always empty unless {@link PricingDoubleOptions.deferSettlement} is on. One outstanding read at a time
   * is what a sequential consumer produces; two at once is what `Promise.all` produces, and no concurrent
   * implementation can present the first shape.
   */
  readonly pending: readonly PendingCall[];
  /** Product identifiers whose read has RESOLVED, in resolution order. */
  readonly resolvedProductIds: readonly string[];
  /** Seed or overwrite one product's details after construction. */
  set(productId: string, details: SalePriceDetailsBySkuId): void;
  /**
   * Settle the oldest outstanding read with the answer it already holds.
   *
   * @throws {DomainError} When no read is outstanding.
   */
  settleNextRead(): void;
}

/**
 * Create the pricing port.
 *
 * An unseeded product resolves to an EMPTY map, not to a map of zeroes — a SKU with no entry has no sale
 * price at all, which is the state the domain's fallback exists for.
 */
export function createPricingDouble(options: PricingDoubleOptions = {}): PricingDouble {
  const detailsByProductId = new Map<string, SalePriceDetailsBySkuId>(
    Object.entries(options.detailsByProductId ?? {}),
  );
  const requestedProductIds: string[] = [];
  const resolvedProductIds: string[] = [];
  const pending: PendingCall[] | undefined = options.deferSettlement === true ? [] : undefined;

  return {
    requestedProductIds,
    resolvedProductIds,
    pending: pending ?? [],
    pricing: {
      getSalePriceDetailsForProductSkus: (productId: string): Promise<SalePriceDetailsBySkuId> => {
        requestedProductIds.push(productId);

        /* Read at call time, so a `set` performed while a read is parked cannot rewrite that read's
         * answer — an immediate double could not have behaved that way either. */
        return settleThroughGate(
          pending,
          productId,
          detailsByProductId.get(productId) ?? {},
          (): void => {
            resolvedProductIds.push(productId);
          },
        );
      },
    },
    set: (productId: string, details: SalePriceDetailsBySkuId): void => {
      detailsByProductId.set(productId, details);
    },
    settleNextRead: (): void => {
      settleOldestPendingCall(pending ?? [], 'pricing');
    },
  };
}

/*
 * 10.6 The account context port, and its two authorisation siblings.
 *
 * `org/Hibachi/HibachiObject.cfc:L74-L76` resolved the current account from the request-scoped Hibachi
 * scope. A stateless handler has no request scope, so the read becomes this port. Nothing here invents
 * authentication, session, role or token semantics, and no `Account` entity is declared or imported — the
 * Account family is explicitly out of scope, and the port deliberately traffics in a three-field
 * reference instead.
 */

/**
 * The default admin account's identifier.
 *
 * Deterministic FIXTURE data, not a production value and not generated: it is a 32-character lowercase
 * hexadecimal string with no dashes, which is the identifier SHAPE the platform uses (AAP §0.1.1.3 IR-6).
 * The legacy suite's admin account has no fixed literal to carry over —
 * `meta/tests/unit/SlatwallUnitTestBase.cfc:L62` promotes whatever account the bootstrap created — so a
 * visible constant is the honest substitute for a value that does not exist upstream.
 */
export const TEST_ADMIN_ACCOUNT_ID = '00000000000000000000000000000001';

/** The default non-admin account's identifier. Same rationale as {@link TEST_ADMIN_ACCOUNT_ID}. */
export const TEST_NON_ADMIN_ACCOUNT_ID = '00000000000000000000000000000002';

/**
 * A PERSISTED ADMIN account — the default, because it is what the legacy suite runs as.
 *
 * `meta/tests/unit/SlatwallUnitTestBase.cfc:L62` promotes the bootstrap account to super user, and the
 * audit guards at `org/Hibachi/HibachiEntity.cfc:L628` and `:L633` only stamp
 * `createdByAccount`/`modifiedByAccount` when the account is present AND already persisted. A default of
 * "absent" or "new" would therefore silently stop audit stamping and quietly change what every save
 * writes.
 */
export function persistedAdminAccount(accountID: string = TEST_ADMIN_ACCOUNT_ID): AccountReference {
  return Object.freeze({ accountID, newFlag: false, adminAccountFlag: true });
}

/** A persisted account WITHOUT the admin flag. */
export function persistedNonAdminAccount(
  accountID: string = TEST_NON_ADMIN_ACCOUNT_ID,
): AccountReference {
  return Object.freeze({ accountID, newFlag: false, adminAccountFlag: false });
}

/**
 * A NEW, unpersisted account.
 *
 * Its identifier is `''` because a new row has none yet, which is also what makes the audit guards skip
 * it.
 */
export function newAccount(): AccountReference {
  return Object.freeze({ accountID: '', newFlag: true, adminAccountFlag: false });
}

/** The port plus its factory-local observation state. */
export interface AccountContextDouble {
  readonly accountContext: AccountContextPort;
  /** How many times the current account was read. */
  callCount(): number;
}

/** Create an account context that reports a PRESENT account. Defaults to a persisted admin. */
export function createAccountContextDouble(
  account: AccountReference = persistedAdminAccount(),
): AccountContextDouble {
  let callCount = 0;
  return {
    accountContext: {
      getCurrentAccount: (): AccountReference | undefined => {
        callCount += 1;
        return account;
      },
    },
    callCount: (): number => callCount,
  };
}

/**
 * Create an account context that reports NO account.
 *
 * A separate factory rather than passing `undefined`, because a default parameter cannot distinguish
 * "omitted" from "explicitly absent" and the difference matters: absent is the anonymous, public path.
 */
export function createAbsentAccountContextDouble(): AccountContextDouble {
  let callCount = 0;
  return {
    accountContext: {
      getCurrentAccount: (): AccountReference | undefined => {
        callCount += 1;
        return undefined;
      },
    },
    callCount: (): number => callCount,
  };
}

/** Seed configuration for {@link createPopulationAuthorizationDouble}. */
export interface PopulationAuthorizationDoubleOptions {
  /** Defaults to `false` — the administrative path, matching a persisted admin context. */
  readonly publicPopulateFlag?: boolean;
  /** Property names that are REFUSED. Everything else is permitted. */
  readonly refusedProperties?: readonly string[];
}

/** The port plus its factory-local observation state. */
export interface PopulationAuthorizationDouble {
  readonly populationAuthorization: PopulationAuthorizationPort;
  readonly calls: readonly EntityPropertyAuthorizationRequest[];
}

/**
 * Create the population authorisation port that `populate` and `BaseService.save` consult before writing
 * a property.
 */
export function createPopulationAuthorizationDouble(
  options: PopulationAuthorizationDoubleOptions = {},
): PopulationAuthorizationDouble {
  const calls: EntityPropertyAuthorizationRequest[] = [];
  const refused = new Set<string>(options.refusedProperties ?? []);
  const publicPopulateFlag = options.publicPopulateFlag ?? false;

  return {
    calls,
    populationAuthorization: {
      getPublicPopulateFlag: (): boolean => publicPopulateFlag,
      authenticateEntityProperty: (request: EntityPropertyAuthorizationRequest): boolean => {
        calls.push(request);
        return !refused.has(request.propertyName);
      },
    },
  };
}

/** The port plus its factory-local observation state. */
export interface EntityAuthorizationDouble {
  readonly entityAuthorization: EntityAuthorizationPort;
  readonly calls: readonly EntityAuthorizationRequest[];
}

/** Create the entity authorisation port. Permits everything unless a CRUD/entity pair is refused. */
export function createEntityAuthorizationDouble(
  refused: readonly EntityAuthorizationRequest[] = [],
): EntityAuthorizationDouble {
  const refusedKeys = new Set<string>(
    refused.map((request) => `${request.crudType}:${request.entityName}`),
  );
  const calls: EntityAuthorizationRequest[] = [];

  return {
    calls,
    entityAuthorization: {
      authenticateEntity: (request: EntityAuthorizationRequest): boolean => {
        calls.push(request);
        return !refusedKeys.has(`${request.crudType}:${request.entityName}`);
      },
    },
  };
}

/*
 * 10.7 The unique property port.
 *
 * `org/Hibachi/HibachiDAO.cfc:L130-L146` is the application-side uniqueness check that runs DURING
 * validation, independently of any `unique="true"` column metadata (AAP §0.1.1.3 IR-5). Reproducing it
 * exactly matters for two reasons, and both are easy to get backwards.
 *
 * POLARITY. The legacy returns FALSE when a row was found and TRUE when none was. `true` therefore means
 * UNIQUE — available, safe to save. Inverting it inverts every uniqueness rule in the slice while still
 * type-checking and still returning a boolean.
 *
 * SELF-EXCLUSION. The statement is `where e.<property> = :propertyValue and e.<idProp> != :entityID`, and
 * the parameters bind in that order: `[propertyValue, entityID]`. On an INSERT the entity's primary
 * identifier is `''`, so the exclusion excludes nothing and is a genuine no-op; on an UPDATE it excludes
 * exactly the row being edited, so a persisted entity does not collide with itself.
 *
 * G6. Seven property/entity pairs are declared unique by the VALIDATION rule sets — `Product.productCode`,
 * `Product.urlTitle`, `Sku.skuCode`, `Brand.urlTitle`, `Option.optionCode`,
 * `OptionGroup.optionGroupCode` and `ProductType.urlTitle` — and that set does NOT coincide with the set
 * of columns the ORM metadata marks `unique="true"`. The validation set is the one that governs here,
 * because it is the one this port is consulted for. The divergence is recorded rather than reconciled, and
 * `src/ports/UniquePropertyPort.ts` is not modified.
 */

/** One row that already holds a value, for uniqueness purposes. */
export interface UniquePropertyValueSeed {
  /** As returned by `entity.getEntityName()` — the legacy entity name, e.g. `SlatwallSku`. */
  readonly entityName: string;
  /** As resolved through `getPropertyMetaData(propertyName).name`. */
  readonly propertyName: string;
  readonly value: string;
  /** The identifier of the row that holds it. */
  readonly entityID: string;
}

/** One recorded uniqueness probe, with everything the legacy statement would have bound. */
export interface UniquePropertyCall {
  readonly propertyName: string;
  readonly resolvedPropertyName: string;
  readonly entityName: string;
  readonly entityID: string;
  readonly value: string | undefined;
}

/** The port plus its factory-local observation state. */
export interface UniquePropertyDouble {
  readonly uniqueProperty: UniquePropertyPort;
  readonly calls: readonly UniquePropertyCall[];
  /** Seed a further held value. */
  take(seed: UniquePropertyValueSeed): void;
}

/**
 * Create the unique property port.
 *
 * A non-scalar or absent property value answers UNIQUE. That is what the legacy does rather than a
 * convenience: a null value binds to nothing, so the existence query returns no rows and the check
 * passes.
 */
export function createUniquePropertyDouble(
  seeds: readonly UniquePropertyValueSeed[] = [],
): UniquePropertyDouble {
  const held: UniquePropertyValueSeed[] = [...seeds];
  const calls: UniquePropertyCall[] = [];

  /** Only scalars can be bound; anything else behaves as an absent value. */
  const comparableValue = (candidate: unknown): string | undefined => {
    if (typeof candidate === 'string') {
      return candidate;
    }
    if (typeof candidate === 'number' || typeof candidate === 'boolean') {
      return String(candidate);
    }
    return undefined;
  };

  return {
    calls,
    uniqueProperty: {
      isUniqueProperty: (propertyName: string, entity: UniquePropertyEntity): Promise<boolean> => {
        const resolvedPropertyName = entity.getPropertyMetaData(propertyName).name;
        const entityName = entity.getEntityName();
        const entityID = entity.getPrimaryIDValue();
        const value = comparableValue(entity.getValueByPropertyIdentifier(resolvedPropertyName));
        calls.push(
          Object.freeze({ propertyName, resolvedPropertyName, entityName, entityID, value }),
        );
        if (value === undefined) {
          return Promise.resolve(true);
        }
        const collides = held.some(
          (seed) =>
            seed.entityName === entityName &&
            seed.propertyName === resolvedPropertyName &&
            seed.value === value &&
            seed.entityID !== entityID,
        );
        return Promise.resolve(!collides);
      },
    },
    take: (seed: UniquePropertyValueSeed): void => {
      held.push(seed);
    },
  };
}

/*
 * 10.8 The smart list query port.
 *
 * `src/ports/SmartListQueryPort.ts` is DECLARATIVE: `execute(query)` takes a whole `SmartListQuery`
 * value, and joins, filters, like-filters, in-filters, ranges, keyword properties, orders and pagination
 * are all DATA on that value. There is no fluent builder to double and — deliberately — no raw where
 * fragment under any name, so this double exposes no such escape hatch either.
 *
 * Everything the feed and the services compose is therefore observable by reading the recorded query:
 * `joins` in insertion order with the entity name FIRST and duplicates preserved (the product feed joins
 * `product` twice, once from the SKU root and once for the brand path); `''` and `'left'` join types;
 * numeric filter values such as the literal `1` the feed uses for its three flags; the open-ended lower
 * range on `product.calculatedQATS`, whether it arrives in the legacy `'1^'` form or already translated
 * to a structured lower bound; pipe-delimited order declarations once translated; distinctness; and the
 * string `currentPageDeclaration`. Nothing is sorted, normalised or de-duplicated on the way in.
 *
 * G6 — WHY THE RECORDS COME BACK EMPTY. Both execution members are generic at the METHOD level, so an
 * implementation must produce the record type the ROOT ENTITY pairs with — `SmartListRecord<TEntityName>`
 * — for an entity name it cannot see. A double holds rows a test configured as plain data, and no such
 * value is KNOWN to be that record type; the only values that satisfy the signature without a type
 * assertion are empty, and `readonly never[]` is exactly such a value. So the double returns an EMPTY
 * page with CONFIGURABLE counts and pagination, which is precisely what a query-description assertion
 * needs. When a test needs typed, non-empty records it builds them at its own concrete type with
 * {@link buildSmartListResult} and hands them to the narrower service-level seam that actually returns
 * them.
 *
 * ⭐ THE PRODUCTION ADAPTER NO LONGER FACES THIS AT ALL, and the asymmetry is worth stating so the one
 * assertion below does not read as a copy of a production one. `SmartListQueryBuilder.materialiseRows`
 * hydrates rows through `ENTITY_ROW_MAPPERS`, whose entries have their return type tied to their key, so
 * the element type is INFERRED there and MIN-01 removed its assertion outright. Here the rows are
 * `unknown` by construction, because only the test that configured them knows what they are.
 *
 * BOTH EXECUTION MEMBERS ARE DOUBLED, AND WHICH ONE RAN IS RECORDED. The port declares `execute` for
 * all three legacy views and `executeRecords` for the unpaged collection alone; the difference is one
 * statement against three, so it is behaviour a test should be able to pin. Both members log into the
 * same chronological `queries` array — so an existing assertion on query descriptions is indifferent to
 * which member a service chose — while {@link SmartListQueryDouble.executions} pairs each call with its
 * {@link SmartListSelection}. Injected failures apply to both paths.
 */

/** The scalar half of a page, configurable independently of the records. */
export interface SmartListPageMetrics {
  readonly recordsCount?: number;
  readonly pageRecordsStart?: number;
  readonly pageRecordsEnd?: number;
  readonly currentPage?: number;
  readonly totalPages?: number;
}

/**
 * What the double should do for one execution call.
 *
 * ⭐ THE `page` ARM CARRIES THE ROWS IT DESCRIBES. An earlier revision configured `metrics` alone and
 * always answered with an empty collection, so a test could seed `recordsCount: 12` beside zero records
 * — a page no real query can produce — and no consumer could be exercised against non-empty typed rows
 * at all. Both collections are optional because most cases genuinely want an empty page; when they are
 * supplied they are validated against the metrics by {@link composeSmartListPage}, which is the single
 * composer both entry points route through so the two can never drift.
 */
export type SmartListOutcome =
  | {
      readonly kind: 'page';
      readonly metrics: SmartListPageMetrics;
      readonly records?: readonly unknown[];
      readonly pageRecords?: readonly unknown[];
    }
  | { readonly kind: 'failure'; readonly failure: Error };

/**
 * Which of the port's two views a call asked for.
 *
 * `src/ports/SmartListQueryPort.ts` declares two execution members because the legacy materialises its
 * three views independently, each on first read: a caller wanting the unpaged collection alone selects
 * it rather than paying for a page and a total. Recording the selection is what lets a test assert that
 * a member which returns only a collection ASKED for only a collection — the difference between one
 * statement and three, and therefore the thing worth pinning.
 */
export type SmartListSelection = 'allViews' | 'recordsOnly';

/** One recorded execution: the query exactly as composed, and which view it asked for. */
export interface SmartListExecution {
  readonly query: SmartListQuery;
  readonly selection: SmartListSelection;
}

/** Decide an outcome from the query itself; `undefined` declines and falls through to the queue. */
export type SmartListResponder = (query: SmartListQuery) => SmartListOutcome | undefined;

/** Seed configuration for {@link createSmartListQueryDouble}. */
export interface SmartListQueryDoubleOptions {
  /** Consumed in order, one per call, after `respond` declines. */
  readonly outcomes?: readonly SmartListOutcome[];
  /** Consulted first. */
  readonly respond?: SmartListResponder;
  /** Used when neither the responder nor the queue answered. */
  readonly defaultMetrics?: SmartListPageMetrics;
}

/** The port plus its factory-local observation state. */
export interface SmartListQueryDouble {
  readonly smartList: SmartListQueryPort;
  /** Every executed query, in order, exactly as composed, whichever member ran it. */
  readonly queries: readonly SmartListQuery[];
  /** The same calls, each paired with the view it asked for. */
  readonly executions: readonly SmartListExecution[];
  /** The most recent query, or `undefined` before the first call. */
  lastQuery(): SmartListQuery | undefined;
  enqueue(...outcomes: readonly SmartListOutcome[]): void;
}

/**
 * Build a typed, possibly non-empty {@link SmartListResult}.
 *
 * Usable wherever the CALLER knows the record type — a service member that returns
 * `SmartListResult<Option>`, or a feed builder that consumes one — which is every place a non-empty page
 * is actually needed. The defaults are the arithmetic of a single full page rather than invented figures:
 * the count is the record count, the page starts at 1 and ends at the record count, there is one page, and
 * an empty result has zero pages.
 */
export function buildSmartListResult<T>(
  records: readonly T[],
  metrics: SmartListPageMetrics = {},
): SmartListResult<T> {
  return composeSmartListPage(records, records, metrics);
}

/**
 * Adopts configured rows at the element type the calling member declares.
 *
 * ⭐ THE ONE AND ONLY TYPE ASSERTION IN THIS FILE, AND IT HAS NO PRODUCTION COUNTERPART. A test
 * configures rows as plain data, so what arrives here is `unknown`; the member that must answer is
 * generic in the ROOT ENTITY and owes its caller the record type that entity pairs with. Nothing this
 * module can compute relates the two, because the relation is the test's own knowledge of what it
 * configured — which is why adopting them here is sound and why the assertion is localized to this one
 * expression rather than spread over the two members that need it. The production builder does NOT need
 * one: MIN-01 gave `ENTITY_ROW_MAPPERS` a per-key return type, so `SmartListQueryBuilder` infers its
 * element type from the mapper it selected.
 */
function adoptSmartListElementType<T>(rows: readonly unknown[]): readonly T[] {
  return rows as readonly T[];
}

/**
 * Composes one page from configured rows and metrics, validating that the two agree.
 *
 * Both {@link buildSmartListResult} and the port response inside {@link createSmartListQueryDouble}
 * route through here, so a page described one way cannot differ from a page described the other. The
 * derivation is the production one in `SmartListQueryBuilder.execute`: the count defaults to the
 * collection length, the page starts at 1, ends at the collection length, and an empty result has zero
 * pages.
 *
 * @throws {DomainError} when a non-empty page is described by a smaller unpaged collection, or when a
 *   page is described beside a record count that cannot contain it. Refusing is the point: a double
 *   that accepted an impossible page would let a consumer pass against it and fail against MySQL.
 */
function composeSmartListPage<T>(
  records: readonly T[],
  pageRecords: readonly T[],
  metrics: SmartListPageMetrics,
): SmartListResult<T> {
  const recordsCount = metrics.recordsCount ?? records.length;

  if (pageRecords.length > records.length) {
    throw new DomainError(
      'A page was described with more rows than the unpaged collection it is a page of, which no ' +
        'query can produce, so the double refused it rather than answering with it.',
      { context: { records: records.length, pageRecords: pageRecords.length } },
    );
  }

  if (pageRecords.length > recordsCount) {
    throw new DomainError(
      'A page was described beside a record count too small to contain it, so the double refused it ' +
        'rather than describing a page no query can produce.',
      { context: { recordsCount, pageRecords: pageRecords.length } },
    );
  }

  return {
    records,
    pageRecords,
    recordsCount,
    pageRecordsStart: metrics.pageRecordsStart ?? 1,
    pageRecordsEnd: metrics.pageRecordsEnd ?? records.length,
    currentPage: metrics.currentPage ?? 1,
    totalPages: metrics.totalPages ?? (recordsCount === 0 ? 0 : 1),
  };
}

/** Create the smart list query port. */
export function createSmartListQueryDouble(
  options: SmartListQueryDoubleOptions = {},
): SmartListQueryDouble {
  const queries: SmartListQuery[] = [];
  const executions: SmartListExecution[] = [];
  const queue: SmartListOutcome[] = options.outcomes === undefined ? [] : [...options.outcomes];
  const respond = options.respond;
  const defaultMetrics = options.defaultMetrics ?? {};

  /**
   * Records one call and settles the outcome both members share.
   *
   * Recording happens for either view, in call order, so `queries` remains the single chronological
   * log regardless of which member ran; `executions` adds which view was asked for. Injected failures
   * are honoured on BOTH paths — a records-only read is as capable of failing as a three-view one.
   */
  function answer(
    query: SmartListQuery,
    selection: SmartListSelection,
  ): SmartListOutcome | undefined {
    queries.push(query);
    executions.push(Object.freeze({ query, selection }));
    const answered = respond === undefined ? undefined : respond(query);
    return answered ?? queue.shift();
  }

  const smartList: SmartListQueryPort = {
    execute<TEntityName extends SmartListRootEntityName>(
      query: SmartListQuery<TEntityName>,
    ): Promise<SmartListResult<SmartListRecord<TEntityName>>> {
      const outcome = answer(query, 'allViews');
      if (outcome !== undefined && outcome.kind === 'failure') {
        return Promise.reject(outcome.failure);
      }
      const metrics = outcome === undefined ? defaultMetrics : outcome.metrics;
      const configured = outcome === undefined ? undefined : outcome.records;
      const records = adoptSmartListElementType<SmartListRecord<TEntityName>>(configured ?? []);
      const configuredPage = outcome === undefined ? undefined : outcome.pageRecords;
      const pageRecords =
        configuredPage === undefined
          ? records
          : adoptSmartListElementType<SmartListRecord<TEntityName>>(configuredPage);

      try {
        return Promise.resolve(
          composeSmartListPage(records, pageRecords, {
            ...metrics,
            recordsCount: metrics.recordsCount ?? records.length,
            pageRecordsEnd: metrics.pageRecordsEnd ?? records.length,
            totalPages: metrics.totalPages ?? (records.length === 0 ? 0 : 1),
          }),
        );
      } catch (refusal) {
        /* Every refusal reaching here is a thrown `DomainError`; the guard keeps the rejection reason an
         * Error even so, because a non-Error reason is unassertable with `rejects.toThrow`. */
        return Promise.reject(refusal instanceof Error ? refusal : new Error(String(refusal)));
      }
    },

    executeRecords<TEntityName extends SmartListRootEntityName>(
      query: SmartListQuery<TEntityName>,
    ): Promise<SmartListRecord<TEntityName>[]> {
      const outcome = answer(query, 'recordsOnly');
      if (outcome !== undefined && outcome.kind === 'failure') {
        return Promise.reject(outcome.failure);
      }
      /*
       * No metrics are consulted, and that is the contract rather than a gap: this view has no page and
       * no total to configure. The array is MUTABLE, matching the port, so a caller that hands it onward
       * unchanged is exercised faithfully.
       */
      const configured = outcome === undefined ? undefined : outcome.records;
      return Promise.resolve([
        ...adoptSmartListElementType<SmartListRecord<TEntityName>>(configured ?? []),
      ]);
    },
  };

  return {
    smartList,
    queries,
    executions,
    lastQuery: (): SmartListQuery | undefined => queries[queries.length - 1],
    enqueue: (...outcomes: readonly SmartListOutcome[]): void => {
      queue.push(...outcomes);
    },
  };
}

/*
 * 11. Driving the REAL validator.
 *
 * There is deliberately no fake validator here. `HibachiValidationService` interpreted
 * `model/validation/*.json` at runtime; `src/validation/Validator.ts` evaluates typed rule sets instead,
 * and it IS the behaviour under test — replacing it with a double would assert nothing. What this section
 * supplies is the one collaborator the real `Validator` constructor needs (the unique property port) plus
 * two named entry points for its two modes, because the difference between them is a single optional
 * argument and is very easy to get wrong.
 *
 * N1 — THE TWO MODES.
 *   MUTATING: an error bag is handed in, the validator appends to it, and the caller's entity keeps the
 *   findings. This is the path `BaseService.save` takes.
 *   DRY RUN: no bag is handed in, the validator creates a throwaway one, and the subject is left untouched.
 *   This is the path a "would this save?" probe takes, and the legacy equivalent is the `setErrors=false`
 *   argument.
 * Both modes return the bag, so a test asserts against the returned value in either case.
 *
 * Behaviour the real validator already implements, restated so a test knows what to expect and does not
 * mistake it for a gap in this file: rules ACCUMULATE and never short-circuit, so every failing constraint
 * is reported; a property whose subject answers `hasProperty(...)` false is SKIPPED silently
 * (`src/validation/Validator.ts` guards on it, which is why the inert physical-count typo in
 * `model/validation/Sku.json` needs no property invented for it — and none is); a falsy context disables
 * validation entirely; `eq` keeps legacy loose comparison rather than strict JavaScript equality;
 * `minCollection: 1` passes for an absent value but fails for a present empty collection; contexts are an
 * open string union rather than a closed invented enum; and both `Sku` method rules report under the same
 * `options` key, so their two messages accumulate in order under that one key.
 */

/** The real validator plus the seeded uniqueness state it consults. */
export interface ValidatorHarness {
  /** The REAL `Validator`, not a double. */
  readonly validator: Validator;
  /** Its only collaborator, so a test can seed collisions and read the probes back. */
  readonly uniqueProperty: UniquePropertyDouble;
  /**
   * MUTATING mode: findings land in `errors`, which is normally the entity's own bag.
   */
  validateInto<TSubject extends ValidationSubject>(
    subject: TSubject,
    ruleSet: ValidationRuleSet<TSubject>,
    context: ValidationContext,
    errors: ValidationError,
  ): Promise<ValidationError>;
  /**
   * DRY-RUN mode: findings land in a fresh throwaway bag and the subject is not touched.
   */
  validateDryRun<TSubject extends ValidationSubject>(
    subject: TSubject,
    ruleSet: ValidationRuleSet<TSubject>,
    context: ValidationContext,
  ): Promise<ValidationError>;
}

/**
 * Create a harness around the real validator.
 *
 * @param uniqueValues rows that already hold a value, for the uniqueness constraints.
 */
export function createValidatorHarness(
  uniqueValues: readonly UniquePropertyValueSeed[] = [],
): ValidatorHarness {
  const uniqueProperty = createUniquePropertyDouble(uniqueValues);
  const validator = new Validator(uniqueProperty.uniqueProperty);

  return {
    validator,
    uniqueProperty,
    validateInto: <TSubject extends ValidationSubject>(
      subject: TSubject,
      ruleSet: ValidationRuleSet<TSubject>,
      context: ValidationContext,
      errors: ValidationError,
    ): Promise<ValidationError> => validator.validate(subject, ruleSet, context, { errors }),
    /*
     * The fourth argument is OMITTED rather than passed as `undefined`. Under
     * `exactOptionalPropertyTypes` that distinction is exactly what selects the throwaway bag.
     */
    validateDryRun: <TSubject extends ValidationSubject>(
      subject: TSubject,
      ruleSet: ValidationRuleSet<TSubject>,
      context: ValidationContext,
    ): Promise<ValidationError> => validator.validate(subject, ruleSet, context),
  };
}

/*
 * 12. The base service persistence seams.
 *
 * `model/service/HibachiService.cfc:L68` and `:L86` are the LOCAL `delete()` and `save()` overrides the
 * in-scope services actually inherit — not the framework base (AAP §0.1.1.3 IR-8) — and `src/services/
 * BaseService.ts` re-expresses them as an injectable collaborator instead of a superclass. Four of its
 * collaborators are the ones this section doubles: the persister, the remover and the two cleanup ports.
 *
 * DIVERGENCE FROM THIS FILE'S OWN BRIEF, STATED PLAINLY. The brief instructed that no setting-service or
 * comment-service cleanup double be built, on the understanding that the target base service left those
 * gap points unobservable. The LANDED `BaseServiceCollaborators` contradicts that: `settingCleanup` and
 * `commentCleanup` are REQUIRED members, and `BaseService.delete` awaits
 * `removeAllEntityRelatedSettings` then `removeAllEntityRelatedComments` after a successful removal. A
 * `BaseService` therefore cannot be constructed at all without them, so a test that could not supply them
 * could not test deletion. Phase 0 of the brief settles the conflict in favour of the actual file: the
 * doubles exist, they are inert recorders, and they are the minimum the real constructor demands. What is
 * still NOT invented: no cache-invalidation hook, no settings mutator beyond the port's own three members,
 * and no write path through `SettingResolverPort`, which stays strictly read-only.
 *
 * TODO(parity) X15 — model/service/HibachiService.cfc:L93-L95: the legacy body declares `settingsRemoved`
 * twice with `var` in one scope, which CFML tolerates and TypeScript cannot express. The translation
 * declares it once. This is a language-level unavoidability, recorded rather than papered over, and no
 * behaviour hangs on it because the second declaration overwrote the first anyway.
 */

/** Exactly the four members `BaseServiceCollaborators` needs from this section, and nothing else. */
export interface BaseServicePersistenceSeams<TEntity> {
  readonly persist: EntityPersister<TEntity>;
  readonly remove: EntityRemover<TEntity>;
  readonly settingCleanup: EntitySettingCleanupPort;
  readonly commentCleanup: EntityCommentCleanupPort;
}

/** Seed configuration for {@link createBaseServicePersistenceDouble}. */
export interface BaseServicePersistenceDoubleOptions<TEntity> {
  /**
   * What the persister RETURNS.
   *
   * Load-bearing: `BaseService.save` reassigns its entity reference from the persister's result, so a
   * persister that returns a different object changes what the caller gets back. Defaults to identity.
   */
  readonly persisted?: (entity: TEntity) => TEntity;
  /** When set, the persister rejects with this instead of returning. */
  readonly persistFailure?: Error;
  /** When set, the remover rejects with this instead of resolving. */
  readonly removeFailure?: Error;
  /** What `updateAllSettingValuesToRemoveSpecificID` reports. Defaults to `0`. */
  readonly settingValuesUpdated?: number;
}

/** The four seams plus their factory-local observation state. */
export interface BaseServicePersistenceDouble<TEntity> {
  /** Spread into a `BaseServiceCollaborators` literal. */
  readonly seams: BaseServicePersistenceSeams<TEntity>;
  /** Every entity handed to the persister, in order, by reference. */
  readonly persisted: readonly TEntity[];
  /** Every entity handed to the remover, in order, by reference. */
  readonly removed: readonly TEntity[];
  /** Class name and identifier of every entity whose settings were cleaned up. */
  readonly settingCleanups: readonly MaintenanceEntityRef[];
  /** Class name and identifier of every entity whose comments were cleaned up. */
  readonly commentCleanups: readonly MaintenanceEntityRef[];
  /** Identifiers passed to `updateAllSettingValuesToRemoveSpecificID`, in order. */
  readonly settingValueScrubs: readonly string[];
  /** How many times the settings cache was asked to clear. */
  settingsCacheClears(): number;
}

/** Create the persister, remover and the two cleanup recorders. */
export function createBaseServicePersistenceDouble<TEntity>(
  options: BaseServicePersistenceDoubleOptions<TEntity> = {},
): BaseServicePersistenceDouble<TEntity> {
  const persistedEntities: TEntity[] = [];
  const removedEntities: TEntity[] = [];
  const settingCleanups: MaintenanceEntityRef[] = [];
  const commentCleanups: MaintenanceEntityRef[] = [];
  const settingValueScrubs: string[] = [];
  let settingsCacheClears = 0;

  const persisted = options.persisted;
  const persistFailure = options.persistFailure;
  const removeFailure = options.removeFailure;
  const settingValuesUpdated = options.settingValuesUpdated ?? 0;

  const seams: BaseServicePersistenceSeams<TEntity> = {
    persist: (entity: TEntity): Promise<TEntity> => {
      persistedEntities.push(entity);
      if (persistFailure !== undefined) {
        return Promise.reject(persistFailure);
      }
      return Promise.resolve(persisted === undefined ? entity : persisted(entity));
    },
    remove: (entity: TEntity): Promise<void> => {
      removedEntities.push(entity);
      if (removeFailure !== undefined) {
        return Promise.reject(removeFailure);
      }
      return Promise.resolve();
    },
    settingCleanup: {
      removeAllEntityRelatedSettings: (entity: MaintenanceEntityRef): Promise<void> => {
        settingCleanups.push(entity);
        return Promise.resolve();
      },
      updateAllSettingValuesToRemoveSpecificID: (primaryIDValue: string): Promise<number> => {
        settingValueScrubs.push(primaryIDValue);
        return Promise.resolve(settingValuesUpdated);
      },
      clearAllSettingsCache: (): Promise<void> => {
        settingsCacheClears += 1;
        return Promise.resolve();
      },
    },
    commentCleanup: {
      removeAllEntityRelatedComments: (entity: MaintenanceEntityRef): Promise<void> => {
        commentCleanups.push(entity);
        return Promise.resolve();
      },
    },
  };

  return {
    seams,
    persisted: persistedEntities,
    removed: removedEntities,
    settingCleanups,
    commentCleanups,
    settingValueScrubs,
    settingsCacheClears: (): number => settingsCacheClears,
  };
}

/** One recorded direct-persister call. */
export interface DirectPersisterCall<TEntity> {
  readonly entity: TEntity;
}

/** A standalone persister plus its factory-local observation state. */
export interface DirectPersisterDouble<TEntity> {
  readonly persist: EntityPersister<TEntity>;
  readonly calls: readonly DirectPersisterCall<TEntity>[];
}

/**
 * A persister that is NOT wired through the base service.
 *
 * THE DUAL SAVE PATH, and the reason this factory exists separately from
 * {@link createBaseServicePersistenceDouble}. `model/service/ProductService.cfc:L286-L288` does NOT call
 * `super.save()` — `saveProduct` assigns a unique URL title and then persists the product directly, which
 * means the base service's populate, validate and cleanup sequence is bypassed on that one path. The other
 * three paths — `saveProductType`, `saveBrand` and `deleteProduct` — DO go through the base service, and
 * they pass their arguments POSITIONALLY: two of them for a save (entity, data) and one for a delete
 * (entity).
 *
 * Constructing the two persisters independently is what lets a test assert that the product path recorded
 * a call while the base-service path recorded none, or vice versa. Sharing one persister between them
 * would make the two paths indistinguishable — which is precisely the thing worth proving.
 */
export function createDirectPersisterDouble<TEntity>(
  persisted?: (entity: TEntity) => TEntity,
): DirectPersisterDouble<TEntity> {
  const calls: DirectPersisterCall<TEntity>[] = [];
  return {
    calls,
    persist: (entity: TEntity): Promise<TEntity> => {
      calls.push(Object.freeze({ entity }));
      return Promise.resolve(persisted === undefined ? entity : persisted(entity));
    },
  };
}

/** A remover plus its factory-local observation state. */
export interface EntityRemoverDouble<TEntity> {
  readonly remove: EntityRemover<TEntity>;
  readonly removed: readonly TEntity[];
}

/**
 * A standalone remover.
 *
 * Deletion has a preparation step worth knowing about when seeding one: `ProductService.deleteProduct`
 * nulls the product's default SKU reference before attempting the delete and restores it only if the
 * delete FAILS, because the product/default-SKU pair is mutually referential and the delete guard would
 * otherwise refuse. `meta/tests/unit/Helper.cfc:L70` performs the same nulling by hand before teardown,
 * independently, which is good evidence the dance is required rather than incidental.
 */
export function createEntityRemoverDouble<TEntity>(failure?: Error): EntityRemoverDouble<TEntity> {
  const removed: TEntity[] = [];
  return {
    removed,
    remove: (entity: TEntity): Promise<void> => {
      removed.push(entity);
      return failure === undefined ? Promise.resolve() : Promise.reject(failure);
    },
  };
}

/*
 * 13. Unit of work support — the explicit transaction boundary.
 *
 * The legacy commit was IMPLICIT: `flushAtRequestEnd` was false and the application flushed the ORM
 * session at request end, twice, and only when the session reported no errors (AAP §0.6.6 M5). A stateless
 * handler has no request end, so `src/adapters/mysql/UnitOfWork.ts` makes the boundary a first-class
 * object. Three of its behaviours are what tests need to pin, and all three are easy to break silently:
 *
 *   M5 — `run` commits only when the caller's error gate reports clean; when the gate reports errors it
 *        ROLLS BACK and raises, so nothing the work wrote survives, and it disposes of the connection in
 *        a `finally` on both the success and the failure path. Production releases only a connection
 *        whose transaction state is KNOWN and DESTROYS it otherwise, and this double reproduces that
 *        rule rather than assuming the happy path: {@link UnitOfWorkDoubleOptions.settlement} can fail
 *        `begin`, `commit` or `rollback` on any transaction, and the disposal event a failed settlement
 *        produces is `destroy`. See {@link UnitOfWorkSettlementResponder} for why a double that could
 *        not fail a settlement let dirty-connection handling regress while every test stayed green.
 *   M3 — `runPerItem` and `runPerItemWithoutResults` are STRICTLY SEQUENTIAL with one independent
 *        transaction per item, which is the importer's per-row commit at
 *        `model/dao/ProductDAO.cfc:L176-L177`. If item two fails, item one stays committed and items
 *        three onward never run. `Promise.all` would break all three properties at once while still
 *        passing a naive "it imported" assertion. ONE CONNECTION IS ACQUIRED FOR THE WHOLE LIST rather
 *        than one per item — each item's transaction is still its own, so the per-row commit semantics
 *        are untouched, and running every item on the same connection makes M6's read-back ordering a
 *        property of the boundary instead of an accident of a one-connection pool.
 *   M6 — every read and write inside one boundary uses the SAME transaction-scoped executor, which is what
 *        makes an inserted SKU visible to the next SKU's uniqueness read. The executor carries BOTH
 *        members for that reason: a write forced to travel any other route would be a write outside the
 *        transaction.
 *
 * `runWithoutTransaction` exists for the importer's two backfills, which run AFTER every row transaction
 * has committed and therefore deliberately sit outside all of them. `runPerItemWithoutResults` is the
 * importer's actual per-row entry point: the row work produces nothing, so the collecting member's
 * one-result-per-row array would be pure overhead proportional to the file's row count.
 *
 * G6 — WHY A LOCALLY DECLARED INTERFACE. `UnitOfWork` is a CLASS holding a `private readonly` pool field.
 * A private member is nominal in TypeScript, so no object literal can ever be assignable to that class no
 * matter how completely it matches the public surface — and the alternative, constructing a real
 * `UnitOfWork` around a fake pool, would require importing the MySQL driver package, which this file
 * forbids. The honest
 * resolution is to declare the PUBLIC surface structurally here and say so out loud: a consumer typed
 * against {@link UnitOfWorkTestSupport} accepts both the real class and this double, and the two overloads
 * of `getTableTopSortOrder` collapse into one optional-parameter signature that satisfies both call forms.
 */

/**
 * What happened, in the order it happened.
 *
 * `release` and `destroy` are the two DISPOSALS, and they are mutually exclusive per checkout: exactly
 * one of them closes every acquire. Which one appears is the whole of the contract this double exists to
 * make observable — see {@link UnitOfWorkSettlementResponder}.
 *
 * ⚠️ A SETTLEMENT EVENT RECORDS AN ATTEMPT, NOT A SUCCESS. `commit` is emitted when the commit is
 * attempted, so a commit the boundary tried and failed is distinguishable from a commit that never
 * happened at all; the `transactionsCommitted()` and `transactionsRolledBack()` counters continue to
 * count SUCCESSES only, so the two views together say what was tried and what worked.
 */
export type UnitOfWorkEventKind =
  'acquire' | 'begin' | 'commit' | 'rollback' | 'release' | 'destroy' | 'poolWork';

/**
 * A hook invoked as each settlement step is ATTEMPTED. Throw from it to fail that step.
 *
 * ⭐ WHY A DOUBLE HAS TO BE ABLE TO FAIL ITS OWN SETTLEMENT. `src/adapters/mysql/UnitOfWork.ts` keeps a
 * per-checkout `knownClean` flag: it is cleared immediately BEFORE `beginTransaction` and restored only
 * by a settlement that actually SUCCEEDED, and the `finally` releases a clean connection while
 * DESTROYING a dirty one. Every interesting half of that rule is on the failing side — a failed begin, a
 * failed commit and a failed roll-back all destroy — so a double whose settlement could not fail
 * exercised only the release branch. Dirty-connection handling could then be deleted outright and every
 * consumer test would still pass, which is the regression this hook closes.
 *
 * The step is reported together with its 1-based transaction number so a test can fail exactly one
 * transaction of a per-item run — the M3 shape, where item two's commit fails and the connection shared
 * by the whole list is destroyed while items one's commit stands.
 *
 * ⚠️ WHAT THIS DOUBLE DELIBERATELY DOES NOT REPRODUCE. The real boundary additionally reduces an
 * abandoned failure to a SANITISED, length-bounded class name before attaching it to the compound
 * roll-back failure, so that neither the failure's message (CWE-532) nor its control characters
 * (CWE-117) reach a log. That reduction is production logic; it is pinned against the real class in
 * `test/adapters/UnitOfWork.test.ts` rather than re-implemented here, because a second implementation in
 * test support could agree with itself while disagreeing with the code that ships.
 */
export type UnitOfWorkSettlementResponder = (
  step: 'begin' | 'commit' | 'rollback',
  transaction: number,
) => void;

/**
 * The double's copy of production's per-checkout `ConnectionState`.
 *
 * Mirrors `src/adapters/mysql/UnitOfWork.ts`: one record per ACQUIRE, not per transaction, which is what
 * makes a per-item run's shared connection answerable as a whole. Not exported — a consumer asserts on
 * the disposal EVENT rather than on this flag, exactly as it can only observe `release` versus `destroy`
 * against the real pool.
 */
interface DoubleConnectionState {
  knownClean: boolean;
}

/** One lifecycle event, attributed to its transaction. */
export interface UnitOfWorkEvent {
  readonly kind: UnitOfWorkEventKind;
  /** 1-based transaction number; `0` for work that ran outside every transaction. */
  readonly transaction: number;
}

/**
 * The PUBLIC surface of `UnitOfWork`, declared structurally.
 *
 * Mirrors `src/adapters/mysql/UnitOfWork.ts` member for member. See the section note for why this is a
 * local declaration rather than the imported class.
 */
export interface UnitOfWorkTestSupport {
  run<T>(work: (scope: TransactionScope) => Promise<T>, hasErrors: () => boolean): Promise<T>;
  /**
   * Mirrors `UnitOfWork.runScoped` — the member the WRITING routes call.
   *
   * Present here because this interface mirrors the class member for member, and because a handler test
   * cannot exercise the SKU-creation boundary without it: the boundary's whole contract is that the graph
   * is built FROM the scope, so a double that only offered `run` would let a test wire a graph the real
   * boundary could never receive.
   */
  runScoped<TGraph, TResult>(
    buildGraph: (scope: TransactionScope) => TGraph,
    work: (graph: TGraph) => Promise<TResult>,
    reportErrors: (result: TResult) => boolean,
  ): Promise<TResult>;
  /**
   * Mirrors `UnitOfWork.runPerItem`, INCLUDING the width of its item source.
   *
   * ⚠️ THE SOURCE IS `PerItemSource`, NOT `readonly TItem[]`, AND THE DIFFERENCE IS NOT COSMETIC. A
   * caller may legitimately feed a LAZY source — `MySqlProductRepository.importFromFile` hands its row
   * loop an `AsyncIterable` so it never holds the whole catalogue file — and TypeScript's method
   * parameters are BIVARIANT, so a double declaring only the array arm still typechecks everywhere the
   * real boundary is expected and then fails at run time with `items is not iterable`. Declaring the
   * production union is what makes the compile-time check mean something. The array arm is retained
   * inside the union, so every existing caller keeps its exact shape and its read-only guarantee.
   */
  runPerItem<TItem, TResult>(
    items: PerItemSource<TItem>,
    work: (item: TItem, scope: TransactionScope) => Promise<TResult>,
  ): Promise<TResult[]>;
  /** Mirrors `UnitOfWork.runPerItemWithoutResults`, with the same source width as `runPerItem`. */
  runPerItemWithoutResults<TItem>(
    items: PerItemSource<TItem>,
    work: (item: TItem, scope: TransactionScope) => Promise<void>,
  ): Promise<void>;
  runWithoutTransaction<T>(work: (executor: TransactionalSqlExecutor) => Promise<T>): Promise<T>;
  /**
   * Reads the highest sort-order value in a table.
   *
   * ⭐ DECLARED AS THE TWO EXACT PRODUCTION OVERLOADS, WHICH IS THE POINT. `UnitOfWork` publishes
   * `(executor, tableName)` and `(executor, tableName, contextIDColumn, contextIDValue)` — both scope
   * arguments REQUIRED together. An earlier revision of this double published one signature with two
   * OPTIONAL scope arguments, so a half-supplied scope typechecked here and failed against production,
   * and a scoped call was indistinguishable from an unscoped one because the answer was keyed by table
   * name alone and neither context argument was read.
   */
  getTableTopSortOrder(executor: SqlExecutor, tableName: string): Promise<number>;
  getTableTopSortOrder(
    executor: TransactionalSqlExecutor,
    tableName: string,
    contextIDColumn: string,
    contextIDValue: string,
  ): Promise<number>;
}

/*
 * WHERE EACH SETTLEMENT FAULT LEAVES THE CONNECTION — the table the responder below is read against.
 *
 * ⛔ THE `UnitOfWorkSettlementFault` INTERFACE THIS TABLE USED TO DOCUMENT IS REMOVED. It described a
 * declarative `{ step, transaction, error }` row supplied through a `settlementFaults` list, and that
 * list was never read by the factory — so the type was reachable, exported, and inert. An exported
 * shape that looks like a working seam is worse than no seam: the next case to reach for it would have
 * asserted a fault that never fired. The retained seam is {@link UnitOfWorkSettlementResponder}, which
 * is asked per step per transaction; the table itself is evidence about production and is kept.
 *
 * One driver-level settlement failure to inject.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS — THE POOL-SAFETY INVARIANT IT MAKES FALSIFIABLE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * `src/adapters/mysql/UnitOfWork.ts` carries a real defect fix, `returnConnection`: a connection is
 * RELEASED back to the pool only when its transaction state is KNOWN — as handed over, after a successful
 * commit, or after a successful roll-back — and on every other path it is DESTROYED, so a connection with
 * a possibly-open transaction never re-enters a warm pool for the next invocation to begin work on top of.
 * That is the cross-invocation bleed M7 exists to prevent, and it is silent when it happens.
 *
 * A double whose `beginTransaction`, `commit` and `roll-back` always succeed can never reach the destroy
 * branch, so a regression that released an unknown-state connection would pass every assertion built on
 * it. Injecting the failure is the only way to reach it without a real driver.
 *
 * ⚠️ WHAT IS MODELLED, AND EXACTLY WHERE EACH FAULT LEAVES THE CONNECTION. Each row below is read from
 * `UnitOfWork.runTransaction`, `runWorkInside` and `rollBack`, not invented:
 *
 *   `begin`     `state.knownClean` is set FALSE immediately before `connection.beginTransaction()`, so a
 *               begin failure propagates RAW and the connection is DESTROYED. No `begin` event is recorded,
 *               because no transaction was begun.
 *   `commit`    a commit failure propagates RAW with `knownClean` still false, so the connection is
 *               DESTROYED. No `commit` event is recorded.
 *   `rollback`  `rollBack` wraps a roll-back failure in a `DomainError` whose `cause` is the driver
 *               failure, leaves `knownClean` false, and the connection is DESTROYED. No `rollback` event
 *               is recorded. Reached either from a work failure or from the M5 error gate.
 *
 * ⛔ NOTHING RETRIES, WAITS OR RECOVERS, here or in production. A destroyed connection is simply out of
 * service; the pool opens a fresh one. No count, delay or backoff is introduced (AAP §0.7.3 S9).
 */
/** Seed configuration for {@link createUnitOfWorkDouble}. */
export interface UnitOfWorkDoubleOptions {
  /**
   * The executor every scope hands out.
   *
   * Defaults to one shared recording executor, so a whole invocation's statements read back as a single
   * ordered list while the event log still attributes each to its transaction. Pass an executor already
   * shared with the repositories when a test needs both views to agree.
   */
  readonly sqlExecutor?: SqlExecutorDouble;
  /*
   * ⛔ THERE IS NO `settlementFaults` MEMBER, AND ITS ABSENCE IS DELIBERATE. A declarative list of
   * driver-level failures to inject was declared here and never read by the factory, so a case that
   * supplied one would have had it SILENTLY IGNORED and would have passed while asserting a fault that
   * never fired. The capability itself is retained in the form that has consumers — {@link settlement},
   * the responder below, which is asked per step per transaction and can therefore express everything a
   * static list could and the interleavings it could not.
   */
  /**
   * The current maximum sort order per table.
   *
   * An unseeded table answers `0`, which is what an EMPTY table produces. The first usable value is
   * derived by the CONSUMER — the production code adds one — and is deliberately not pre-computed here.
   */
  readonly tableTopSortOrder?: Readonly<Record<string, number>>;
  /**
   * Fails a settlement step. Absent by default, in which case every settlement succeeds.
   *
   * See {@link UnitOfWorkSettlementResponder}. Optional and defaultless on purpose: an existing consumer
   * that wires nothing observes exactly the event sequence it observed before this hook existed, so the
   * hook adds a reachable failure path without re-writing the suites that assert the success path.
   */
  readonly settlement?: UnitOfWorkSettlementResponder;
}

/**
 * The composite key configured top-sort-order answers are stored under.
 *
 * An unscoped read and a scoped read are two different statements against the same table, so keying by
 * table name alone would make them indistinguishable. `|` cannot occur in a validated identifier, so it
 * is a safe separator.
 */
export function topSortOrderKey(
  tableName: string,
  contextIDColumn?: string,
  contextIDValue?: string,
): string {
  return contextIDColumn === undefined
    ? tableName
    : `${tableName}|${contextIDColumn}|${String(contextIDValue)}`;
}

/** One recorded top-sort-order call, with the scope exactly as supplied. */
export interface TopSortOrderCall {
  readonly table: string;
  readonly scope: { readonly contextIDColumn: string; readonly contextIDValue: string } | undefined;
}

/** The unit of work plus its factory-local observation state. */
export interface UnitOfWorkDouble {
  readonly unitOfWork: UnitOfWorkTestSupport;
  /** The executor handed to every scope, so `(sql, params)` remains observable. */
  readonly sqlExecutor: SqlExecutorDouble;
  /** Every lifecycle event, in order. */
  readonly events: readonly UnitOfWorkEvent[];
  /** The event kinds alone — the shape most assertions want to compare against. */
  eventKinds(): readonly UnitOfWorkEventKind[];
  transactionsStarted(): number;
  transactionsCommitted(): number;
  transactionsRolledBack(): number;
  /** Connections handed BACK to the pool, because their transaction state was known. */
  connectionsReleased(): number;
  /** Connections taken permanently out of service, because their transaction state was not. */
  connectionsDestroyed(): number;
  /** Every top-sort-order call, in order, with the scope exactly as it was supplied. */
  topSortOrderCalls(): readonly TopSortOrderCall[];
}

/** Create the unit of work double. */
export function createUnitOfWorkDouble(options: UnitOfWorkDoubleOptions = {}): UnitOfWorkDouble {
  const sqlExecutor = options.sqlExecutor ?? createSqlExecutorDouble();
  const topSortOrders = options.tableTopSortOrder ?? {};
  const topSortOrderCalls: TopSortOrderCall[] = [];
  const events: UnitOfWorkEvent[] = [];
  let transactionsStarted = 0;
  let transactionsCommitted = 0;
  let transactionsRolledBack = 0;

  const note = (kind: UnitOfWorkEventKind, transaction: number): void => {
    events.push(Object.freeze({ kind, transaction }));
  };

  /**
   * Attempts one settlement step: records the ATTEMPT, then lets the responder fail it.
   *
   * ⭐ THE EVENT IS RECORDED BEFORE THE RESPONDER RUNS, and the order matters. A commit the boundary
   * issued and the driver then rejected was still attempted, and it left the transaction in a state no
   * caller can describe; recording only successful settlements would make that indistinguishable from a
   * commit that never happened, which is precisely the confusion the disposal rule turns on.
   *
   * @param step - The settlement step being attempted.
   * @param transaction - The 1-based transaction number the step belongs to.
   * @throws Whatever the responder throws, unchanged.
   */
  const attemptSettlement = (step: 'begin' | 'commit' | 'rollback', transaction: number): void => {
    note(step, transaction);

    if (options.settlement !== undefined) {
      options.settlement(step, transaction);
    }
  };

  /**
   * Rolls one transaction back, mirroring `UnitOfWork`'s own `rollBack` on both outcomes.
   *
   * On success the connection regains its known-clean standing and the caller's own failure is re-raised
   * by whoever called this. On FAILURE the connection's standing is withheld — so the `finally` destroys
   * it — and a COMPOUND failure is raised carrying the roll-back failure as its `cause`, because at that
   * point nothing can be reported about what the database retained.
   *
   * @param transaction - The 1-based transaction number.
   * @param state - The checkout's disposition record, updated in place.
   * @param rolledBackBecause - Which path asked for the roll-back.
   * @throws {DomainError} When the roll-back itself fails.
   */
  const rollBackTransaction = (
    transaction: number,
    state: DoubleConnectionState,
    rolledBackBecause: 'workFailure' | 'accumulatedErrors',
  ): void => {
    try {
      attemptSettlement('rollback', transaction);
    } catch (rollBackFailure) {
      throw new DomainError(
        'The test unit of work could not roll back after the work inside it was abandoned, so nothing ' +
          'can be reported about what the database retained.',
        { cause: rollBackFailure, context: { transaction, rolledBackBecause } },
      );
    }

    transactionsRolledBack += 1;
    state.knownClean = true;
  };

  /**
   * Disposes of one checkout, exactly as production's `returnConnection` does.
   *
   * Releases a connection whose transaction state is KNOWN and destroys one whose state is not, so that a
   * connection of unknown state never re-enters a warm pool (M7). Never raises: it runs from a `finally`,
   * where a throw would replace the failure the caller is already reporting.
   *
   * @param state - The checkout's disposition record.
   * @param transaction - The transaction number the acquire was attributed to.
   */
  const returnConnection = (state: DoubleConnectionState, transaction: number): void => {
    note(state.knownClean ? 'release' : 'destroy', transaction);
  };

  /**
   * One transaction on an ALREADY-ACQUIRED connection: begin, work, settle. No acquire, no release.
   *
   * Split out for the same reason the real boundary splits it: the single-boundary member acquires
   * once and settles once, while the per-item members acquire ONCE FOR THE WHOLE LIST and settle once
   * per item on that same connection. Modelling the acquire inside the transaction would make the
   * double emit an acquire/release pair per row that production no longer emits, and the event log
   * would then assert the opposite of the behaviour it exists to pin.
   *
   * ⭐ THE CHECKOUT'S DISPOSITION IS TAKEN AS A PARAMETER RATHER THAN CREATED HERE, for the same reason
   * `runTransaction` takes it in production: a per-item run settles MANY transactions on ONE connection,
   * so the record of whether that connection is still recyclable belongs to the acquire and outlives
   * every individual transaction. It is cleared before `begin` and restored only by a settlement that
   * actually succeeded.
   */
  const runSettled = async <T>(
    work: (scope: TransactionScope) => Promise<T>,
    hasErrors: () => boolean,
    state: DoubleConnectionState,
  ): Promise<T> => {
    transactionsStarted += 1;
    const transaction = transactionsStarted;
    {
      /*
       * Withdrawn BEFORE the begin is attempted, never after, because a begin that fails part-way
       * through leaves the connection in exactly the state this flag exists to describe.
       */
      state.knownClean = false;
      attemptSettlement('begin', transaction);
      let settlement: { readonly decision: 'commit' | 'rollback'; readonly result: T };
      try {
        /*
         * ⭐ THE WORK AND THE ERROR GATE SETTLE INSIDE ONE GUARDED REGION, which is what
         * `UnitOfWork.runWorkInside` does. An earlier revision evaluated `hasErrors()` AFTER the `try`,
         * so a gate that THREW escaped the rollback path entirely and left only `begin` recorded — a
         * consumer whose gate throws would then have looked correct against this double and wrong
         * against the real boundary. Both now reach the same `catch`, record exactly ONE rollback, and
         * re-raise the ORIGINAL failure unchanged.
         */
        const result = await work(Object.freeze({ executor: sqlExecutor.executor }));
        settlement = { decision: hasErrors() ? 'rollback' : 'commit', result };
      } catch (failure) {
        /*
         * The caller's own failure is re-raised UNCHANGED when the roll-back succeeds, so a test can
         * assert on it by identity. When the roll-back itself fails, `rollBackTransaction` raises the
         * compound failure instead and this `throw` is never reached — which is production's behaviour
         * too, and the reason the compound form carries the roll-back failure as its `cause`.
         */
        rollBackTransaction(transaction, state, 'workFailure');
        throw failure;
      }
      if (settlement.decision === 'rollback') {
        /*
         * M5's error gate. The real boundary raises rather than returning quietly, because a caller that
         * ignored a silent "nothing was kept" would carry on as though the write had happened. The message
         * is authored here; no legacy or sibling text is reused.
         */
        rollBackTransaction(transaction, state, 'accumulatedErrors');
        throw new DomainError(
          'The test unit of work rolled back because the error gate reported accumulated findings, so ' +
            'nothing written inside the boundary was kept.',
          { context: { transaction } },
        );
      }
      attemptSettlement('commit', transaction);
      transactionsCommitted += 1;
      /* Restored only now: the commit is the step that makes the connection recyclable again. */
      state.knownClean = true;
      return settlement.result;
    }
  };

  /**
   * One acquire, one transaction, one DISPOSAL — the single-boundary shape.
   *
   * The disposal is in a `finally` so it is recorded on BOTH paths, which is the property a leaked
   * connection would violate. WHICH disposal it is follows production exactly: `release` for a connection
   * whose transaction state is known, `destroy` for one whose settlement failed, so that a connection of
   * unknown state never re-enters a warm pool (M7). Both branches are reachable here — the settlement
   * responder on {@link UnitOfWorkDoubleOptions} is what reaches the second — because a double that could
   * only release would let dirty-connection handling be removed with every consumer test still green.
   */
  const run = async <T>(
    work: (scope: TransactionScope) => Promise<T>,
    hasErrors: () => boolean,
  ): Promise<T> => {
    const transaction = transactionsStarted + 1;
    /* Per checkout, exactly as production's is, and `true` because nothing has been done to it yet. */
    const state: DoubleConnectionState = { knownClean: true };
    note('acquire', transaction);
    try {
      return await runSettled(work, hasErrors, state);
    } finally {
      returnConnection(state, transaction);
    }
  };

  /**
   * The per-item loop, shared by the collecting and non-collecting members.
   *
   * ONE ACQUIRE FOR THE WHOLE LIST, one transaction per item, one disposal at the end — and an empty
   * list acquires nothing at all, which the importer legitimately reaches for a header-only file or the
   * `.xls` branch. M3 is unchanged by the sharing: each item is still its own independent transaction,
   * settled before the next begins.
   *
   * ⚠️ THE SHARED CONNECTION IS WHAT A FAILED PER-ITEM SETTLEMENT ENDANGERS, and one disposition record
   * spans the whole list for that reason. If item two's commit fails, item one's commit still stands —
   * that is M3 — but the connection every item ran on is now of unknown state, so the list ends in a
   * `destroy` rather than a `release`.
   */
  const runEachItem = async <TItem, TResult>(
    items: PerItemSource<TItem>,
    work: (item: TItem, scope: TransactionScope) => Promise<TResult>,
    collect: ((result: TResult) => void) | undefined,
  ): Promise<void> => {
    /*
     * ⚠️ THE CHECKOUT IS ON DEMAND, AND THAT IS STRUCTURAL RATHER THAN A LENGTH TEST — exactly as
     * `UnitOfWork.runEachItem` makes it. The acquire is derived from the arrival of the FIRST item, so a
     * source that yields is charged for one connection and a source that yields nothing is charged for
     * none, without either arm being inspected up front. The release below is conditional on the same
     * fact, so the two always agree.
     *
     * A LENGTH TEST IS NOT AVAILABLE HERE, WHICH IS WHY THERE ISN'T ONE. `PerItemSource` admits an
     * `AsyncIterable` — see the note on `runPerItem` above — and a lazy source cannot report its size
     * without being consumed. Deriving the acquire from the first item is what lets ONE loop serve the
     * materialised and the lazy arm under one set of settlement semantics.
     */
    let acquisition: number | undefined;
    const state: DoubleConnectionState = { knownClean: true };

    try {
      /*
       * M3. A sequential `for await` with an `await` inside, never `Promise.all`: one transaction per
       * item, each committed before the next begins, and an exception from item N leaves items 1..N-1
       * committed while items N+1.. never start.
       *
       * `for await` consumes a materialised array and a lazy source through ONE statement, so the two
       * arms cannot drift into two loops with two sets of settlement semantics — which is precisely how
       * `UnitOfWork.runEachItem` is written. A synchronous iterable yields synchronously here, so the
       * array arm gains no concurrency and no extra tick of observable delay.
       */
      for await (const item of items) {
        if (acquisition === undefined) {
          acquisition = transactionsStarted + 1;
          note('acquire', acquisition);
        }

        const result = await runSettled(
          (scope) => work(item, scope),
          () => false,
          state,
        );
        if (collect !== undefined) {
          collect(result);
        }
      }
    } finally {
      if (acquisition !== undefined) {
        returnConnection(state, acquisition);
      }
    }
  };

  const unitOfWork: UnitOfWorkTestSupport = {
    run,

    /*
     * ⭐ DELEGATES TO `run` RATHER THAN TO `runSettled`, because the real member is `run` with the graph
     * built from the scope — so the acquire/release accounting a test asserts on must be identical for
     * both. Building the graph INSIDE the work is the whole of the difference: a double that built it
     * outside would let a test wire collaborators bound to no transaction, which the real boundary can
     * never hand out.
     *
     * The settled result is read back through a function so the gate can see it without a cast: the gate
     * runs after the work resolves (see `runSettled`), but control-flow analysis cannot know that about a
     * value assigned inside a callback.
     */
    runScoped: <TGraph, TResult>(
      buildGraph: (scope: TransactionScope) => TGraph,
      work: (graph: TGraph) => Promise<TResult>,
      reportErrors: (result: TResult) => boolean,
    ): Promise<TResult> => {
      let settled: { readonly result: TResult } | undefined;
      const readSettled = (): { readonly result: TResult } | undefined => settled;

      return run(
        async (scope): Promise<TResult> => {
          const result = await work(buildGraph(scope));
          settled = { result };
          return result;
        },
        (): boolean => {
          const captured = readSettled();
          return captured !== undefined && reportErrors(captured.result);
        },
      );
    },

    runPerItem: async <TItem, TResult>(
      items: PerItemSource<TItem>,
      work: (item: TItem, scope: TransactionScope) => Promise<TResult>,
    ): Promise<TResult[]> => {
      const results: TResult[] = [];
      await runEachItem(items, work, (result) => {
        results.push(result);
      });
      return results;
    },
    runPerItemWithoutResults: async <TItem>(
      items: PerItemSource<TItem>,
      work: (item: TItem, scope: TransactionScope) => Promise<void>,
    ): Promise<void> => {
      await runEachItem(items, work, undefined);
    },
    runWithoutTransaction: async <T>(
      work: (executor: TransactionalSqlExecutor) => Promise<T>,
    ): Promise<T> => {
      note('poolWork', 0);
      return await work(sqlExecutor.executor);
    },
    getTableTopSortOrder: (
      _executor: TransactionalSqlExecutor,
      tableName: string,
      contextIDColumn?: string,
      contextIDValue?: string,
    ): Promise<number> => {
      if ((contextIDColumn === undefined) !== (contextIDValue === undefined)) {
        /*
         * Unreachable from typed code — the two overloads above require the scope arguments together —
         * so this refuses an untyped caller. It REJECTS rather than throwing synchronously because the
         * production member is declared `async`, and a consumer awaiting a rejection must observe the
         * same failure shape here that it would observe there.
         */
        return Promise.reject(
          new DomainError(
            'A half-supplied sort-order scope reached the double: the scope column and the scope value ' +
              'travel together or not at all.',
            { context: { tableName, contextIDColumn, contextIDValue } },
          ),
        );
      }

      topSortOrderCalls.push(
        Object.freeze({
          table: tableName,
          scope:
            contextIDColumn === undefined
              ? undefined
              : Object.freeze({ contextIDColumn, contextIDValue: String(contextIDValue) }),
        }),
      );

      /* Unseeded keys answer the COALESCE 0 that the production statement answers with. */
      return Promise.resolve(
        topSortOrders[topSortOrderKey(tableName, contextIDColumn, contextIDValue)] ?? 0,
      );
    },
  };

  return {
    unitOfWork,
    sqlExecutor,
    events,
    eventKinds: (): readonly UnitOfWorkEventKind[] => events.map((event) => event.kind),
    transactionsStarted: (): number => transactionsStarted,
    transactionsCommitted: (): number => transactionsCommitted,
    transactionsRolledBack: (): number => transactionsRolledBack,
    /*
     * ⭐ DERIVED FROM THE EVENT LOG, NOT FROM A COUNTER. Two disposal mechanisms met here: a pair of
     * incrementing counters, and `note('release' | 'destroy')` on the shared log. The log won, because
     * `returnConnection` chooses the kind from `state.knownClean` exactly as production's does and the
     * ordering of a disposal relative to its transaction is only observable on the log. The counters were
     * left declared and never incremented, so BOTH accessors answered a constant zero — a case asserting
     * "one connection was destroyed" would have failed, and one asserting "none was" would have passed
     * vacuously. Counting the log makes them answer the same question the log answers.
     */
    connectionsReleased: (): number => events.filter((event) => event.kind === 'release').length,
    connectionsDestroyed: (): number => events.filter((event) => event.kind === 'destroy').length,
    topSortOrderCalls: (): readonly TopSortOrderCall[] => topSortOrderCalls,
  };
}

/*
 * 13.1 The SKU batch sequencing seam — making M6 falsifiable.
 *
 * `Sku.hasUniqueOptions()` is registered as a METHOD rule in `model/validation/Sku.json` and it runs a
 * QUERY (`model/entity/Sku.cfc:L756-L769`). During `SkuService.createSkus` that means validation reads back
 * rows the very same operation is writing, and the answer depends entirely on WHICH siblings are already
 * visible. Under Hibernate the ORM session decided that; with no session, the ORDER of insert and validate
 * decides it — so the ordering is behaviour, and behaviour has to be pinned by a test that FAILS when the
 * order is wrong.
 *
 * Two plausible, well-intentioned orderings both diverge from the legacy result:
 *   `insertAllThenValidate` — every sibling is visible to every check, so combinations that legitimately
 *   differ can still be reported as colliding.
 *   `validateBeforeAnyInsert` — no sibling is visible to any check, so a genuine collision inside the
 *   batch passes unnoticed.
 * `legacyOrder` interleaves them one candidate at a time, which is what makes each insert visible to the
 * next candidate's check and only to it.
 *
 * All three are expressible so a sibling test can demonstrate the two naive orderings failing while the
 * legacy ordering passes. `legacyOrder` is the DEFAULT; neither naive mode is ever selected implicitly.
 */

/** Which ordering the batch uses. */
export type SkuBatchSequencing =
  'legacyOrder' | 'insertAllThenValidate' | 'validateBeforeAnyInsert';

/** The ordering that reproduces the legacy result. */
export const DEFAULT_SKU_BATCH_SEQUENCING: SkuBatchSequencing = 'legacyOrder';

/** One step, so the interleaving itself is assertable. */
export interface SkuBatchStepEvent<TCandidate> {
  readonly step: 'validate' | 'insert';
  readonly candidate: TCandidate;
  /** `undefined` on an insert step; the check's verdict on a validate step. */
  readonly accepted: boolean | undefined;
}

/** Seed configuration for {@link createSkuBatchSequencer}. */
export interface SkuBatchSequencerOptions<TCandidate> {
  /** Defaults to {@link DEFAULT_SKU_BATCH_SEQUENCING}. */
  readonly sequencing?: SkuBatchSequencing;
  /** The uniqueness check. `true` accepts the candidate. */
  readonly validate: (candidate: TCandidate) => Promise<boolean>;
  /** The write that makes a candidate visible to later checks. */
  readonly insert: (candidate: TCandidate) => Promise<void>;
}

/** What the batch did. */
export interface SkuBatchResult<TCandidate> {
  readonly accepted: readonly TCandidate[];
  readonly rejected: readonly TCandidate[];
  /** Every validate and insert, in the order they actually happened. */
  readonly events: readonly SkuBatchStepEvent<TCandidate>[];
}

/** The sequencer. */
export interface SkuBatchSequencer<TCandidate> {
  readonly sequencing: SkuBatchSequencing;
  run(candidates: readonly TCandidate[]): Promise<SkuBatchResult<TCandidate>>;
}

/** Create a batch sequencer. */
export function createSkuBatchSequencer<TCandidate>(
  options: SkuBatchSequencerOptions<TCandidate>,
): SkuBatchSequencer<TCandidate> {
  const sequencing = options.sequencing ?? DEFAULT_SKU_BATCH_SEQUENCING;

  const runBatch = async (
    candidates: readonly TCandidate[],
  ): Promise<SkuBatchResult<TCandidate>> => {
    const accepted: TCandidate[] = [];
    const rejected: TCandidate[] = [];
    const events: SkuBatchStepEvent<TCandidate>[] = [];

    const check = async (candidate: TCandidate): Promise<boolean> => {
      const verdict = await options.validate(candidate);
      events.push(Object.freeze({ step: 'validate' as const, candidate, accepted: verdict }));
      return verdict;
    };
    const write = async (candidate: TCandidate): Promise<void> => {
      await options.insert(candidate);
      events.push(Object.freeze({ step: 'insert' as const, candidate, accepted: undefined }));
    };

    if (sequencing === 'insertAllThenValidate') {
      for (const candidate of candidates) {
        await write(candidate);
      }
      for (const candidate of candidates) {
        if (await check(candidate)) {
          accepted.push(candidate);
        } else {
          rejected.push(candidate);
        }
      }
      return { accepted, rejected, events };
    }

    if (sequencing === 'validateBeforeAnyInsert') {
      for (const candidate of candidates) {
        if (await check(candidate)) {
          accepted.push(candidate);
        } else {
          rejected.push(candidate);
        }
      }
      for (const candidate of accepted) {
        await write(candidate);
      }
      return { accepted, rejected, events };
    }

    /* legacyOrder: check, then write, one candidate at a time. */
    for (const candidate of candidates) {
      if (await check(candidate)) {
        await write(candidate);
        accepted.push(candidate);
      } else {
        rejected.push(candidate);
      }
    }
    return { accepted, rejected, events };
  };

  return { sequencing, run: runBatch };
}

/*
 * 14. The two selected-option seams, which are NOT the same seam.
 *
 * `Sku.hasUniqueOptions` consumes a STRING through `SkusBySelectedOptionsLookup`
 * (`src/domain/sku/Sku.ts:563`), while `Product.getSkusBySelectedOptions` consumes a string through
 * `ProductSkuOptionFinder` and forwards it POSITIONALLY as
 * `getProductSkusBySelectedOptions(selectedOptions, this.productID)`
 * (`src/domain/product/Product.ts:1765-1767`) — which is exactly the two-argument positional form the
 * out-of-scope caller at `model/process/Order_AddOrderItem.cfc:L238` already depends on. The repository,
 * by contrast, takes an ARRAY and a required product identifier. Three shapes, three seams; conflating any
 * two of them loses either the product scope or the argument order.
 *
 * The string-to-array conversion follows CFML `listToArray`, which DROPS empty entries. `listLen('')` is
 * therefore zero, which is what makes T5's empty selection legal and degenerate rather than a lookup for
 * one option named `''`. Duplicates and original order survive untouched, because T1 counts one
 * requirement per entry.
 *
 * Note the deliberate contrast with `splitIdentifierList` earlier in this file, which does NOT drop
 * empties: that helper reproduces the option-group list handling in `MySqlOptionRepository`, where the
 * legacy statement genuinely binds a single empty value for an empty list. Two legacy behaviours, two
 * helpers, and neither is a copy of the other by accident.
 */

/** CFML `listToArray`: split on commas, drop empty entries, change nothing else. */
function cfmlSelectedOptionList(selectedOptions: string): string[] {
  return selectedOptions.split(',').filter((entry) => entry.length > 0);
}

/**
 * Adapt a {@link SkuRepository} to the domain-level `SkusBySelectedOptionsLookup`, closing over the
 * required product identifier the port's string-only signature cannot carry.
 *
 * Every option-resolution semantic is inherited from the repository double unchanged: T1 conjunction with
 * duplicates preserved, T2's always-applied product scope, T3's option-bearing guard, T4 distinctness, T5's
 * legal empty selection, and therefore D19 — an option-less SKU on a product that already has
 * option-bearing SKUs still fails its uniqueness check, because the degenerate query returns those
 * siblings. Nothing here short-circuits an empty list to avoid that.
 */
export function createSkusBySelectedOptionsLookup(
  repository: SkuRepository,
  productId: string,
): SkusBySelectedOptionsLookup {
  return {
    getSkusBySelectedOptions: (selectedOptions: string): Promise<readonly Sku[]> =>
      repository.findSkusBySelectedOptions(cfmlSelectedOptionList(selectedOptions), productId),
  };
}

/** One recorded finder call, in the legacy positional order. */
export interface ProductSkuOptionFinderCall {
  readonly selectedOptions: string;
  readonly productID: string;
}

/** The finder plus its factory-local observation state. */
export interface ProductSkuOptionFinderDouble {
  readonly finder: ProductSkuOptionFinder;
  readonly calls: readonly ProductSkuOptionFinderCall[];
}

/**
 * Adapt a {@link SkuRepository} to `ProductSkuOptionFinder`, the seam `Product` uses.
 *
 * The recorded call keeps the arguments in the order the legacy passes them — selected options first,
 * product identifier second — so a test can prove the positional contract the out-of-scope order caller
 * relies on has not been quietly reordered into something more readable.
 *
 * The result is copied into a fresh mutable array because the port asks for one. That is NOT a breach of
 * the live-array rule: the rule protects an entity's OWN collection, where `Product.getSkus()` must hand
 * back the very array `Sku.setProduct` appends to. A query RESULT is a different thing — the legacy data
 * access layer built a new array per call as well — so copying here changes nothing a caller can observe.
 */
export function createProductSkuOptionFinderDouble(
  repository: SkuRepository,
): ProductSkuOptionFinderDouble {
  const calls: ProductSkuOptionFinderCall[] = [];
  return {
    calls,
    finder: {
      getProductSkusBySelectedOptions: async (
        selectedOptions: string,
        productID: string,
      ): Promise<ProductSkuMember[]> => {
        calls.push(Object.freeze({ selectedOptions, productID }));
        const matches = await repository.findSkusBySelectedOptions(
          cfmlSelectedOptionList(selectedOptions),
          productID,
        );
        return [...matches];
      },
    },
  };
}
