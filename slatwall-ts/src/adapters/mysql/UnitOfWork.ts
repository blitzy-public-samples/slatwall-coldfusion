/* ================================================================================================
 * UnitOfWork — THE EXPLICIT TRANSACTION BOUNDARY THAT REPLACED AN IMPLICIT REQUEST-END FLUSH
 * ================================================================================================
 * AAP 0.4.1.7, row 7, is the authority for this file: "The implicit request-end double-flush commit
 * gate becomes an explicit transaction boundary; also the mechanism that preserves the read-back
 * ordering behaviour of 0.6.2 and the per-row commit semantics of 0.6.6." AAP 0.3.3 names the pattern
 * and states the same obligation from the other side — "explicit boundaries per handler invocation,
 * and the mechanism that resolves the read-back ordering hazard of 0.6.2".
 *
 * This file therefore OWNS three of the eight execution-model mismatches, is BOUND BY a fourth, and
 * implements one work item. Each is discharged at the member where the judgment is made, as AAP 0.8.2
 * Guideline 6 requires, and each is summarised here so a reader meets the whole picture first.
 *
 * ------------------------------------------------------------------------------------------------
 * M5 — THE COMMIT GATE IS ERROR-CONDITIONAL, AND THAT IS THE WHOLE POINT
 * ------------------------------------------------------------------------------------------------
 * The legacy application tells the engine not to flush on its own and then flushes explicitly at
 * request end, BUT ONLY WHEN THE REQUEST ACCUMULATED NO ERRORS. Byte-verified:
 *
 *   org/Hibachi/Hibachi.cfc:L455        endHibachiLifecycle() declared
 *   org/Hibachi/Hibachi.cfc:L456        `if(!getHibachiScope().getORMHasErrors())` — THE GATE
 *   org/Hibachi/Hibachi.cfc:L457        the flush, reached only through that negative condition
 *   org/Hibachi/HibachiDAO.cfc:L92-L96  the flush runs TWICE — ormFlush() at :L93 and again at :L95,
 *                                       the second pass commented in source as being there to
 *                                       persist changes made during an ORM event handler
 *
 * THREE call sites reach it, not two: org/Hibachi/Hibachi.cfc:L413 (response setup),
 * org/Hibachi/Hibachi.cfc:L463 (an exact redirect) and Application.cfc:L177 (a setting redirect).
 *
 * The subclass adds a SECOND, INDEPENDENT gate in front of the superclass one.
 * Application.cfc:L113 overrides the hook, re-evaluates the same error state at :L115, and dispatches
 * a different side effect on each branch — :L116 on the error path, :L118 otherwise — before
 * delegating at :L122. So the observable legacy shape is: error state decides side-effect dispatch
 * first, then error state decides whether anything is flushed at all.
 *
 * IF THE ORM HAD ERRORS, NOTHING WAS FLUSHED. That is reproduced here as an explicit
 * commit-versus-roll-back decision keyed on an error-state predicate the CALLER supplies, never as an
 * unconditional commit. The predicate is a parameter rather than an inspection because the error state
 * lives in src/validation/** and AAP 0.7.3 S4 forbids this layer importing it — see
 * src/validation/Validator.ts, which records the same division from its side.
 *
 * The reporting key that predicate answers for is worth stating, because a caller must not narrow it:
 * org/Hibachi/HibachiValidationService.cfc:L224, :L228 and :L232 all report against the full property
 * identifier, so both method-based SKU rules — attached to the `options` property on the `save`
 * context — surface under `options` and never under a method name. The legacy accumulate-then-check
 * gates that consume it are model/service/SkuService.cfc:L152 and :L180, both spelled
 * `if(!arguments.product.hasErrors())`.
 *
 * ------------------------------------------------------------------------------------------------
 * M6 — THE VALIDATION READ-BACK LOOP. THE SINGLE MOST DANGEROUS THING IN THE SLICE
 * ------------------------------------------------------------------------------------------------
 * AAP 0.6.2, verbatim: "the single most dangerous thing in the slice, because a faithful-looking port
 * can produce different results with no error and no compile failure."
 *
 * The cycle:
 *   model/service/SkuService.cfc:L58-L211  the combination engine saves a SKU
 *     -> the save selects the `save` validation context
 *       -> the method rule reaches model/entity/Sku.cfc:L756-L769
 *         -> :L763 calls the product's option-resolution member — WHICH EXECUTES A QUERY
 *           -> a statement over the SKU and SKU-option tables
 *             -> back into the save that is still in flight
 *
 * Under CFML and Hibernate the rule observes only siblings already visible to the ORM session, so
 * correctness depended on flush-before-query behaviour and on the order the batch was persisted in.
 * There is no ORM session here and no automatic flush, so — AAP 0.6.2 again — "a naive port that
 * inserts every combination and then validates, or that validates before any insert, produces
 * different results, silently."
 *
 * The mandate, verbatim: this file "must make each SKU's insert visible to the next SKU's uniqueness
 * read within the same transaction." Three structural consequences, all load-bearing:
 *
 *   1. A boundary is ONE ACQUIRED CONNECTION, and every read and every write inside it runs on that
 *      connection. THE DEFENCE IS STRUCTURAL, NOT DISCIPLINARY: {@link TransactionScope} carries a
 *      connection-bound {@link ReadWriteSqlExecutor} and nothing else, the pooled connection itself is
 *      never handed out, and no member of this class returns one. THE READ AND THE WRITE ARE BOTH ON
 *      THAT ONE EXECUTOR, deliberately, because an executor that could not write would push every
 *      insert onto some other connection and put it outside the very transaction the read has to see
 *      it in. A read issued against the pool from inside a boundary would compile, type-check, pass
 *      every test that does not specifically probe uncommitted-sibling visibility, and silently change
 *      which SKUs the combination engine accepts.
 *   2. WRITE ORDER IS BEHAVIOUR. The odometer enumeration order of the combination engine determines
 *      both the generated SKU set and, through this loop, the order uniqueness validation observes
 *      its siblings in. Nothing here reorders, coalesces, batches or defers a write; there is no
 *      write buffer, no flush-at-end and no concurrent settlement of anything, anywhere in this file.
 *   3. THE BOUNDARY IS SUBSTITUTABLE. AAP 0.4.1.12 requires slatwall-ts/test/services/SkuService.test.ts
 *      to carry a combination-batch test that would fail under either naive ordering, and AAP 0.6.5.2
 *      records that every such test is NET-NEW with no mocking library available. Both are only
 *      possible because a caller depends on {@link ReadWriteSqlExecutor}, a two-member contract a plain
 *      object literal can satisfy, so the call sequence is inspectable without a database.
 *
 * THE ASYMMETRY IS DELIBERATE AND MUST NOT BE TIDIED. Its sibling rule at
 * model/entity/Sku.cfc:L772-L784 is PURE: it walks the SKU's options in memory and returns false at
 * :L777 on the first repeated option-group identifier. It performs no data access at all, so it needs
 * no boundary, no connection and no visibility guarantee. Nothing in this file wraps it "for
 * symmetry", and a future reader should not add such a wrapper.
 *
 * ------------------------------------------------------------------------------------------------
 * M3 — THE IMPORTER COMMITS ONCE PER ROW, THEN RUNS TWO STATEMENTS OUTSIDE ANY TRANSACTION
 * ------------------------------------------------------------------------------------------------
 * model/dao/ProductDAO.cfc:L176 opens the record loop and `transaction{` opens INSIDE it at :L177;
 * the brace cascade closes the row transaction at :L284 and the loop at :L285. ONE TRANSACTION PER
 * ROW. AAP 0.6.6, verbatim: "Each row commits independently, so a mid-file failure leaves a partially
 * imported catalog. This is one transaction per row, not one per import."
 *
 * Then, after the loop and its transaction have both closed, TWO BULK STATEMENTS RUN WITH NO
 * TRANSACTION AT ALL: model/dao/ProductDAO.cfc:L287-L302 back-fills the default SKU and :L303-L325
 * back-fills the SKU image file, and `loadDataFromFile` ends at :L326. The importer's real shape is
 * therefore N single-row transactions followed by two untransacted statements, and
 * {@link UnitOfWork.runWithoutTransaction} exists for no other reason.
 *
 * ------------------------------------------------------------------------------------------------
 * M7 — NO STATE SURVIVES A BOUNDARY, AND NONE SURVIVES AN INVOCATION
 * ------------------------------------------------------------------------------------------------
 * AAP 0.6.6 records that a second-level entity cache on 111 of 113 entities, the lazy per-instance
 * caches in entity scope and the memoised option-group sort order at model/dao/SkuDAO.cfc:L204-L228
 * have no clean single-invocation equivalent, and requires memoisation to be "scoped to the request
 * object rather than the module, to avoid cross-tenant bleed on a warm container".
 *
 * This file holds NO MUTABLE STATE OF ANY KIND. Its module scope is one string constant, one frozen
 * scalar-shape predicate helper set, the exported types and the class; the class holds exactly one
 * field, the injected pool, and it is `readonly`. Nothing accumulates across a boundary, nothing
 * accumulates across an invocation, and there is no ambient "current transaction" a second caller on
 * a warm container could observe. Should a transaction-scoped memo ever be needed, it hangs off the
 * {@link TransactionScope} object and dies with it.
 *
 * ------------------------------------------------------------------------------------------------
 * THE ORDERING FACT THAT CONSTRAINS EVERY BOUNDARY SHAPE HERE
 * ------------------------------------------------------------------------------------------------
 * Read from source at model/service/ProductService.cfc:L264-L292, the product save runs:
 *   :L266  populate
 *   :L268  assign a unique URL title when none is set (against the SwProduct table)
 *   :L273  validate in the `save` context
 *   :L276  when the product is new AND has no errors: :L279 create the SKUs, :L282 regenerate the
 *          default image file names
 *   :L286  when the product still has no errors: :L287 persist it
 *
 * SO THE SKUs ARE CREATED AFTER PRODUCT VALIDATION AND BEFORE THE PRODUCT IS PERSISTED, WHILE THE
 * PRODUCT IS STILL TRANSIENT. A boundary that assumed the parent row already existed before children
 * were written would fail, and a boundary that committed the parent early would change the observable
 * failure semantics. That is why {@link UnitOfWork.run} takes the WHOLE unit of work as one callback
 * and settles once, at the end, rather than exposing begin and commit as separate members a caller
 * could interleave.
 *
 * ------------------------------------------------------------------------------------------------
 * WHAT THIS FILE DELIBERATELY IS NOT, AND WHAT IT DELIBERATELY DOES NOT INVENT (AAP 0.7.3 S9)
 * ------------------------------------------------------------------------------------------------
 *   - NOT a pool owner. The pool is injected (AAP 0.7.3 S3). Nothing here builds one, reads a
 *     credential or resolves a connection target; contrast model/dao/ProductDAO.cfc:L155-L158,
 *     :L329-L332 and :L420, which construct a credential-reading connection three separate times
 *     inside the data-access layer itself.
 *   - NO POOL SIZING OR TIMING FIGURE OF ANY KIND. AAP 0.4.1.3, verbatim: "pool sizing is not carried
 *     over because the legacy application delegates pooling to the CF/Railo server and pins nothing
 *     in source." So no connection limit, no queue limit, no acquire, idle or connect timeout.
 *   - NO TRANSACTION-VISIBILITY LEVEL IS CHOSEN OR DECLARED. The legacy `<cftransaction>` at
 *     model/dao/ProductDAO.cfc:L177 carries no such attribute, so no such statement is emitted here
 *     and no such driver option is passed. Whatever the server is configured to do is what happens,
 *     exactly as before.
 *   - NO TRANSACTION OR LOCK BUDGET, NO PARTIAL-UNDO MARKER, NO NESTED-TRANSACTION EMULATION, NO
 *     ADVISORY OR TABLE LOCK. org/Hibachi/HibachiDAO.cfc:L182 does hold a named lock, but only inside
 *     the re-ordering member this file formally excludes below — never on the path this file replaces.
 *   - NO REPEATED ATTEMPT AFTER A FAILURE, NO GROWING PAUSE BETWEEN ATTEMPTS AND NO RECOVERY LOOP FOR
 *     A CONTENDED WRITE. That family is the most tempting invention in a transaction manager and none
 *     of it is here: the legacy code had none, and adding any of it would change which writes survive
 *     a contended import.
 *   - NO BATCHING, NO CONCURRENCY AND NO PARALLEL SETTLEMENT. Required by M3 and M6 both; see
 *     {@link UnitOfWork.runPerItem}.
 *   - NO SESSION FLUSH AND NO SESSION CLEAR AS PUBLIC MEMBERS. `flushORMSession` at
 *     org/Hibachi/HibachiDAO.cfc:L92-L96 and `clearORMSession` at :L98-L100 are the two primitives
 *     this file CONCEPTUALLY REPLACES; they are cited by name and locator so a reviewer can read them
 *     in the legacy tree, and are never reproduced, because there is no session to flush and no
 *     session to clear.
 *   - NO STATEMENT TEXT beyond the one read this file owns (see {@link UnitOfWork.getTableTopSortOrder}).
 *     It composes no query on a caller's behalf, and it is not a mapper: rows leave as
 *     {@link MySqlRow}.
 *   - NO LOGGING, METRICS OR TRACING DEPENDENCY, and no addition to the dependency set at all
 *     (AAP 0.7.3 S5). mysql2 3.23.2 stays the sole runtime dependency, and only its TYPES are
 *     imported here.
 *   - NO SERVICE-LEVEL OBJECTIVE OF ANY KIND (AAP IR-12). The only numeric literals in this file are
 *     the zero the legacy COALESCE guarantees for an empty table and the one that follows from it.
 *     M1 (the importer's one-hour request budget at model/service/ProductService.cfc:L65-L68, which
 *     Lambda's fifteen-minute ceiling makes unrepresentable in one invocation) and M2 (the feed's
 *     360-second render budget at integrationServices/google/views/feed/product.cfm:L9) are owned by
 *     src/handlers/**; neither is translated into a timeout here. M8 keeps the setting resolver
 *     synchronous, and nothing in this file awaits a setting.
 *
 * ------------------------------------------------------------------------------------------------
 * NEGATIVE MANDATE — `updateRecordSortOrder` IS NOTED HERE AND IMPLEMENTED NOWHERE
 * ------------------------------------------------------------------------------------------------
 * org/Hibachi/HibachiDAO.cfc:L170-L215 declares `updateRecordSortOrder` with six untyped,
 * non-required arguments (:L171 through :L176) and implements it with a named lock at :L182 wrapping a
 * transaction at :L183: it reads the dragged row's current position at :L186-L189 and then shifts a
 * whole band of neighbours through one of two `UPDATE` branches, :L194-L207 or :L209-L220. A service
 * wrapper resolving an entity name to a table sits at org/Hibachi/HibachiService.cfc:L781-L785.
 *
 * IT IS FORMALLY EXCLUDED, ON THREE GROUNDS:
 *   1. No port declares it. The port contracts name only the sort-order READ, and none of the five
 *      repository ports declares a re-ordering member.
 *   2. No in-scope caller invokes it. Re-ordering is an administrative-interface concern, and
 *      admin/** — 352 files — is explicitly out of scope (AAP 0.2.2.2).
 *   3. Implementing it would import behaviour the slice never exercises, against AAP 0.8.2
 *      Guideline 4 and against the instruction to create only what the plan lists.
 *
 * It is therefore NOT implemented, NOT stubbed, and carries no annotation implying it is owed. This
 * paragraph exists so a later reader sees a decision rather than an oversight.
 *
 * ------------------------------------------------------------------------------------------------
 * THIS FILE MINTS NO NEW IDENTIFIER, AND MAKES NO GLOBAL CLOSURE CLAIM
 * ------------------------------------------------------------------------------------------------
 * the register is stated canonically, and only once, in the header of
 * `src/ports/repositories/SkuRepository.ts` (AAP 0.6.7's frozen source range D1-D21, plus the
 * source extension D22 and the three contract corrections D23, D24 and D25, with no D26 or beyond;
 * and AAP 0.6.6's M1-M8 plus M9, with no M10 or beyond). This file mints no new defect or mismatch
 * identifier. It owns M3, M5 and M6, is bound by M7, cites
 * D22, M1, M2 and M8, and records every other finding by `path:Lnnn` locator alone. D18 — the single
 * declared parameterization-hardening exception — belongs exclusively to
 * src/adapters/mysql/MySqlProductRepository.ts and is not claimed here.
 * ============================================================================================== */

import { DataIntegrityError, DomainError } from '../../errors/DomainError';
import {
  assertColumnName,
  assertTableName,
  readAffectedRows,
  rethrowTranslatingDuplicateEntry,
} from './QueryRunner';
import { toRows } from './rowMappers';

import type {
  BoundParameterValue,
  SqlExecutor,
  StatementPool,
  StatementRunner,
  TransactionalStatementRunner,
} from './QueryRunner';
import type { MySqlRow } from './rowMappers';

/* ================================================================================================
 * TODO(parity) D22 — org/Hibachi/HibachiEntity.cfc:L642 AND :L644 HAND THIS FILE A TABLE NAME IN THE
 * PHYSICAL VOCABULARY, AND IT IS STILL VALIDATED RATHER THAN TRUSTED
 * ================================================================================================
 * The legacy tree speaks two table vocabularies at once and both are correct; the full account, the
 * six entity rows and the five framework prefixing sites are documented in ./QueryRunner, which
 * holds the name-mapping table. D22's register home is ../../ports/repositories/SkuRepository, and
 * neither that adapter nor this one owns the entry. What matters at THIS file's one
 * statement-composing member is which vocabulary arrives:
 *
 *   org/Hibachi/HibachiEntity.cfc:L642 and :L644 pass `getMetaData(this).table` into the sort-order
 *   helper — the PHYSICAL name, `SwOption` or `SwOptionGroup` for the two in-scope entities.
 *   org/Hibachi/HibachiService.cfc:L781-L785 resolves an entity name to `entityMetaData.table` before
 *   delegating, so the same call arrives PHYSICAL one layer down and LOGICAL one layer up.
 *
 * A physical name arriving is therefore the expected case, not a special one — and it is still routed
 * through {@link assertTableName} rather than trusted, because the parameter is typed `string` and a
 * caller reaching this member from a handler path could carry any of the three legacy spellings.
 * Resolution there is a whitelist lookup and never a prefix concatenation; applying the framework's
 * prefixing rule to a physical name would synthesise a table that does not exist.
 * ============================================================================================== */

/**
 * The projection alias the legacy sort-order statement gives its single computed column.
 *
 * `org/Hibachi/HibachiDAO.cfc:L158` writes `COALESCE(max(sortOrder), 0) as topSortOrder` and :L167
 * reads the result back by that alias. The name is therefore part of the ported statement rather than
 * a local convenience, and it is declared once so the text that emits it and the read that consumes
 * it cannot drift apart.
 *
 * It is a table-independent alias, not a column, so it is deliberately NOT routed through
 * {@link assertColumnName}: nothing in the schema is named after it.
 */
const TOP_SORT_ORDER_ALIAS = 'topSortOrder';

/**
 * The locking clause appended to the sort-order read — see {@link UnitOfWork.getTableTopSortOrder}.
 *
 * ⭐ SEC-HARDENING (D18-CLASS) — F8. A module constant rather than a literal appended inline, so the
 * clause that closes the finding is greppable by name and so the whole-table and scoped variants — which
 * share one builder but differ in their `WHERE` — cannot end up disagreeing about whether they lock. The
 * leading space is part of the constant because it is always appended to a complete statement.
 *
 * `./UniquePropertyChecker` declares its own copy for its own two probes rather than importing this one.
 * That is deliberate: the two files close the same finding class on different statements, and a shared
 * constant would imply a shared policy that a future change to one could silently apply to the other.
 */
const LOCKING_READ_SUFFIX = ' FOR UPDATE';

/**
 * The error-state predicate for a boundary that has no error gate of its own.
 *
 * Used by {@link UnitOfWork.runPerItem} and by nothing else. The importer's per-row transaction at
 * model/dao/ProductDAO.cfc:L177 carries NO error condition: a row either completes and commits, or a
 * failure propagates and the transaction is abandoned. Passing an always-false predicate states that
 * absence explicitly instead of duplicating the settle-and-release skeleton for a second shape, and
 * it keeps the connection-release invariant in exactly one place.
 *
 * It is a pure function with no captured state, so sharing one instance across every item and every
 * invocation cannot leak anything (M7).
 */
const NO_ACCUMULATED_ERRORS = (): boolean => false;

/**
 * The scalar shapes a `?` placeholder in this file's statements may bind.
 *
 * This restates the driver's own bindable-scalar contract, and the restatement is deliberate rather
 * than duplicated by accident. ./QueryRunner narrows the same way at the POOL boundary and keeps its
 * narrowing module-private on purpose, so that no caller can pre-narrow and put a second copy of the
 * decision in the folder. This file is a SECOND, INDEPENDENT driver boundary — the transaction
 * connection — and the driver's parameter type admits nested lists and plain objects, neither of which
 * a prepared statement expands. Narrowing at each boundary that actually speaks to the driver is what
 * keeps both boundaries closed; importing a narrowing across them is not possible and would not be
 * better if it were.
 *
 * Only ONE value is ever bound from inside this file — the sort-order context identifier at
 * org/Hibachi/HibachiDAO.cfc:L163, a thirty-two-character string. The other bound values that travel
 * through a {@link TransactionScope} belong to the repositories that compose those statements, so the
 * check exists for them as much as for the one statement here.
 *
 * @param candidate - Any value a caller placed in a parameter list.
 * @returns `true` when the value can be bound to a single placeholder.
 */
function isBindableValue(candidate: unknown): candidate is BoundParameterValue {
  return (
    candidate === null ||
    typeof candidate === 'string' ||
    typeof candidate === 'number' ||
    typeof candidate === 'bigint' ||
    typeof candidate === 'boolean' ||
    candidate instanceof Date
  );
}

/**
 * Narrows a whole parameter list for the driver, preserving order exactly.
 *
 * ORDER IS THE POINT (TR-4). The legacy form is `ormExecuteQuery(hql, positionalParams)`, and the
 * option-to-SKU resolver at model/dao/SkuDAO.cfc:L106-L128 appends one placeholder and one parameter
 * inside the same loop before appending the product identifier last. A list travelling through a
 * boundary is positional in exactly that sense, so this copies it index for index: it never sorts,
 * de-duplicates, compacts, reorders or drops an element, because every one of those would silently
 * rebind the statement.
 *
 * A single indexed pass rather than `map`, so a refusal can name the position that failed without a
 * second traversal.
 *
 * @param params - The caller's parameter list, in legacy positional order.
 * @returns A new list of the same length and order, typed for the driver.
 * @throws {DomainError} When any element is not a bindable scalar. The position, the list length and
 *   the offending value's runtime type travel on `context`; THE VALUE ITSELF DELIBERATELY DOES NOT,
 *   because a bound parameter can hold data that has no business in an error object.
 */
function toBoundParameters(params: readonly unknown[]): BoundParameterValue[] {
  const bound: BoundParameterValue[] = [];

  for (let index = 0; index < params.length; index += 1) {
    const candidate = params[index];

    if (!isBindableValue(candidate)) {
      throw new DomainError(
        'A bound parameter is not one of the scalar shapes a placeholder accepts, so the statement ' +
          'was not prepared. Bind one value per placeholder; expand a list in the caller.',
        {
          context: {
            position: index,
            parameterCount: params.length,
            valueType: candidate === undefined ? 'undefined' : typeof candidate,
          },
        },
      );
    }

    bound.push(candidate);
  }

  return bound;
}

/*
 * ⛔ A THIRD DECLARATION OF THIS SHAPE STOOD HERE UNDER A DIFFERENT NAME, AND IT IS REMOVED.
 * `export interface ScopedSqlExecutor extends SqlExecutor { executeMutation(...) }` occupied this
 * position — structurally identical to {@link TransactionalSqlExecutor} below, member for member.
 * Being differently NAMED, it did not merge with its twin the way the two same-named copies recorded
 * on that interface did, so it simply sat here unreferenced: `tsc` cannot report an exported type as
 * unused and neither can the linter, so nothing flagged it. Every consumer in this subtree names
 * `TransactionalSqlExecutor` — this file's `createExecutor`, `TransactionScope.executor` and
 * `runWithoutTransaction`, then `./MySqlProductTypeRepository` and the test double — and that is
 * therefore the surviving name. (No count is given for those references deliberately: a count in a
 * comment is a fact that drifts the next time one is added, and `grep` answers it exactly.)
 * The two arguments the removed declaration carried alone are folded into its doc rather than dropped
 * with it: why the writing member EXTENDS the read-only contract instead of replacing it, and what
 * the affected-row count is for.
 */

/**
 * Builds the only execution surface this file ever hands out.
 *
 * THIS FUNCTION IS THE M6 DEFENCE, EXPRESSED STRUCTURALLY. The driver object it closes over is either
 * a pooled connection with a transaction open on it or the pool itself, and in neither case does it
 * escape: the returned value exposes the two statement members and carries no reference a caller can
 * reach the driver through. A repository handed this object cannot begin, commit or roll back
 * anything, cannot release the connection under the boundary that owns it, and — crucially — cannot
 * route a read back through the pool and out of the transaction it is supposed to be inside.
 *
 * ⭐ IT HANDS OUT BOTH A READ AND A WRITE MEMBER, ON ONE CONNECTION, AND THAT IS A REQUIREMENT RATHER
 * THAN A CONVENIENCE. M6 is the obligation that "each SKU's insert [is] visible to the next SKU's
 * uniqueness read within the same transaction", so the insert and the read must BOTH be issuable
 * through this object; an executor that could only read would make the guarantee unreachable, because
 * the write would have to be issued somewhere else — which means on another connection, outside this
 * transaction, exactly the silent divergence M6 exists to prevent. The same holds for the importer:
 * `model/dao/ProductDAO.cfc:L177` opens a transaction per row and every statement inside it writes.
 *
 * The two members are the ONE shared pair {@link ReadWriteSqlExecutor} publishes, so this object is
 * structurally the executor the three writing adapters in this folder each declare as their
 * dependency, and a composition root injects THIS and nothing else for the statements inside a
 * boundary.
 *
 *   model/dao/ProductDAO.cfc:L177   `transaction{` opens once PER ROW and the body INSERTs and UPDATEs
 *                                   (M3). A per-row boundary whose scope cannot write cannot import.
 *   AAP 0.6.2 / M6                  each SKU's INSERT must be visible to the NEXT SKU's uniqueness
 *                                   read inside the same transaction. The write is half of the cycle;
 *                                   without it there is nothing for the read to observe.
 *   org/Hibachi/HibachiDAO.cfc:L149 the sort-order maximum is read so a row can be written with the
 *                                   next value, in the same unit of work.
 *
 * Concretely, ./MySqlProductRepository declares `ProductImportTransactionScope` requiring an executor
 * with both members, and a read-only scope was not assignable to it — so nothing could legally consume
 * this class at all. The two ways to close that gap were to widen here or to assert at the consumer;
 * asserting would have meant claiming a capability the object did not have, and the first write inside
 * a boundary would have failed at run time on a member that does not exist. Widening is the honest fix,
 * and the containment that mattered is untouched: transaction CONTROL is still absent from this
 * surface, so a repository still cannot commit, roll back, release, or escape to the pool. What it can
 * now do is the work — under a boundary this file opens and closes.
 *
 * PREPARED EXECUTION ONLY. Both members describe the statement through the injected binder and then
 * execute the description, so the driver's text-substituting member is unreachable from here — not as a
 * fallback, not behind a flag and not for a statement that happens to bind nothing (AAP 0.7.3 S2).
 * Transaction control is issued through the connection's own transaction members and never as
 * hand-built statement text.
 *
 * WHY THE DRIVER AND THE BINDER ARRIVE AS TWO SEPARATE ARGUMENTS. The driver parameter is the narrowest
 * shape that does the job — just the `execute` member — which both a {@link TransactionalConnection}
 * and a {@link DatabasePool} satisfy, so the same body serves the transacted and untransacted paths and
 * nothing in it depends on which arrived. Binding, by contrast, is a pure function that touches no
 * connection, and only the pool publishes it; passing it separately keeps it off the connection
 * interface, where a sixth member would have implied a per-connection capability that it is not.
 *
 * The result is frozen so a consumer cannot substitute its own execution behaviour after receiving
 * it, and it is created per boundary rather than cached, so nothing outlives the transaction it
 * belongs to (M7).
 *
 * ⭐ IT EXPOSES TWO MEMBERS, NOT ONE, AND THE SECOND IS WHAT MAKES A BOUNDARY USABLE AT ALL. An earlier
 * revision returned a read-only `SqlExecutor`. That made every transaction structurally incapable of
 * WRITING through the connection it had just begun a transaction on, which is a contradiction in terms:
 * `run` existed to settle writes and handed out an object that could not perform one. The consequence
 * was concrete and was reported as review finding 2 — rollback-on-errors and M6 read-back visibility
 * were unreachable no matter how a caller was wired — and as finding 8, because
 * `MySqlProductRepository`'s `ProductImportTransactionScope` requires a writing member and this class
 * could not satisfy it. Both members bind to the SAME driver object, so a read inside a boundary
 * observes that boundary's own writes, which is the whole of M6.
 *
 * WHY A WRITE CANNOT BE EXPRESSED THROUGH THE READ MEMBER. `execute` normalises the driver's answer
 * through `rowMappers.ts` `toRows`, which RAISES when the driver returns a write acknowledgement rather
 * than a row list. The two answers are different shapes, so they need different readers; the write
 * reader is `readAffectedRows`, imported from `./QueryRunner` rather than copied, so the driver's
 * acknowledgement shape is described in exactly one place.
 *
 * @param driver - The pooled connection the transaction was begun on, or the pool for the untransacted
 *   path.
 * @param bind - The pool's statement binder, which validates that the statement writes exactly one
 *   placeholder per bound value before anything reaches the wire.
 * @returns An executor bound to that driver object, and nothing else.
 */
function createExecutor(driver: StatementRunner): TransactionalSqlExecutor {
  /*
   * ONE PATH TO THE DRIVER, so the guard and the binding cannot diverge between the two members. The
   * blank-statement precondition itself lives in `requireStatementText` below, shared with nothing else
   * in this module: two copies of one guard are two places for it to drift.
   */
  const runStatement = async (sql: string, params: readonly unknown[]): Promise<unknown> => {
    requireStatementText(sql, params.length);

    try {
      const [driverResult] = await driver.execute(sql, toBoundParameters(params));

      return driverResult;
    } catch (cause: unknown) {
      /*
       * ⭐ SEC-HARDENING (D18-CLASS) — THE TRANSACTION-SCOPED HALF OF THE F6 DUPLICATE-KEY REPORT.
       * `QueryRunner.runStatement` is the pool-bound half. Both apply the SAME imported helper, so a
       * collision looks identical whether the write happened inside a boundary or outside one, and
       * `./QueryRunner` carries the adjudication once rather than this file restating it.
       *
       * ⚠️ IT DOES NOT SETTLE THE BOUNDARY. Translating an error changes what the caller catches and
       * nothing else; the rollback decision still belongs entirely to the members below, which see a
       * rejection here as the rejection it is and roll back exactly as they would have. That matters
       * on the importer's per-row path (M3), where one row losing a race must abandon THAT row's
       * transaction and no other.
       *
       * The catch wraps only the driver call, so the blank-statement guard above and the parameter
       * narrowing inside `toBoundParameters` are never re-examined as driver failures.
       */
      rethrowTranslatingDuplicateEntry(cause, params.length);
    }
  };

  return Object.freeze({
    execute: async (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> =>
      toRows(await runStatement(sql, params)),

    executeMutation: async (sql: string, params: readonly unknown[]): Promise<number> => {
      const affectedRows = readAffectedRows(await runStatement(sql, params));

      /*
       * Refused rather than reported as zero. A read statement routed into this member returns a row
       * list, and a row list is an object, so degrading to zero here would report "affected nothing"
       * for a statement that never wrote anything — and `model/dao/ProductDAO.cfc:L247` BRANCHES on
       * this count, so a manufactured zero would silently take the wrong branch.
       */
      if (affectedRows === undefined) {
        throw new DataIntegrityError(
          'A writing statement inside a transaction boundary did not produce a write ' +
            'acknowledgement, so the number of rows it affected could not be read.',
          { context: { parameterCount: params.length } },
        );
      }

      return affectedRows;
    },
  });
}

/**
 * Refuses a blank statement, for both members of the executor above.
 *
 * Factored out rather than written twice: the two members share this precondition exactly, and two
 * copies of one guard are two places for it to drift.
 *
 * @param sql - The statement text as supplied.
 * @param parameterCount - How many values the caller intended to bind, for the diagnostic record.
 * @throws {DomainError} When the statement text is blank.
 */
function requireStatementText(sql: string, parameterCount: number): void {
  if (sql.trim().length === 0) {
    throw new DomainError(
      'A blank statement reached a transaction-scoped execution boundary, so there was nothing ' +
        'to prepare.',
      { context: { parameterCount } },
    );
  }
}

/**
 * Reads the sort-order maximum out of the row the ported statement produced.
 *
 * `org/Hibachi/HibachiDAO.cfc:L158` wraps the aggregate in `COALESCE(max(sortOrder), 0)`, so THE
 * EMPTY-TABLE ANSWER IS ZERO RATHER THAN NULL — which is why the first seeded position is one, at
 * org/Hibachi/HibachiEntity.cfc:L646. That zero is a VALUE the statement guarantees, not a fallback
 * for a result this function could not read, so an unreadable result RAISES instead of defaulting to
 * it: manufacturing a zero from a malformed row would restart a table's numbering from one and
 * collide with every position already stored.
 *
 * A NEGATIVE MAXIMUM IS ACCEPTED, DELIBERATELY. The legacy read at :L167 returns whatever the
 * aggregate produced and the assignment at :L646 adds one to it, so a table whose stored positions are
 * all negative seeds a negative-plus-one. Rejecting that here would invent a constraint the legacy
 * column never had (AAP 0.8.2 Guideline 4).
 *
 * @param row - The single row the statement produced.
 * @returns The stored maximum, or zero when the scope held no rows.
 * @throws {DataIntegrityError} When the row does not carry the projection alias, or carries it as
 *   something other than a whole number the runtime can hold exactly.
 */
function readTopSortOrder(row: MySqlRow): number {
  if (!(TOP_SORT_ORDER_ALIAS in row)) {
    throw new DataIntegrityError(
      'The sort-order statement produced a row without its projected column, so the current ' +
        'maximum could not be read.',
      { context: { alias: TOP_SORT_ORDER_ALIAS, columns: Object.keys(row) } },
    );
  }

  const projected: unknown = row[TOP_SORT_ORDER_ALIAS];

  if (typeof projected === 'number' && Number.isInteger(projected)) {
    return projected;
  }

  /*
   * A wide integer column can arrive as a bigint when the driver is configured to preserve it. It is
   * converted only when the runtime can hold it exactly; a value beyond that range would lose
   * precision on conversion, and a silently rounded position is worse than a refusal.
   */
  if (
    typeof projected === 'bigint' &&
    projected >= BigInt(Number.MIN_SAFE_INTEGER) &&
    projected <= BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return Number(projected);
  }

  throw new DataIntegrityError(
    'The sort-order statement produced a value that is not a whole number, so the current maximum ' +
      'could not be read.',
    { context: { alias: TOP_SORT_ORDER_ALIAS, valueType: typeof projected } },
  );
}

/**
 * Why a boundary was abandoned, for the diagnostic record only.
 *
 * Module-private and never part of the public surface: it distinguishes the two paths that reach a
 * roll-back so an operator reading a failed rollback can tell which one it was. It carries no
 * behaviour — both paths roll back identically — and nothing branches on it.
 */
type RollbackCause = 'accumulatedErrors' | 'workFailure';

/* ==========================================================================================
 * WHAT MAY BE SAID ABOUT AN ABANDONED FAILURE — AN ALLOWLIST, NOT THE VALUE ITSELF
 * ==========================================================================================
 *
 * TRANSLATION DECISION (AAP 0.8.2 Guideline 6). ⛔ THIS REVERSES AN EARLIER DECISION IN THIS FILE, and
 * the reversal is recorded rather than quietly applied.
 *
 * WHAT THE EARLIER RULE WAS. {@link rollBack} attached the ENTIRE abandoned failure object to the
 * raised error's `context`, so that a failed roll-back could not swallow the reason the work stopped.
 *
 * WHY IT WAS WRONG. `context` is a LOGGABLE bag. Anything placed in it is rendered by whatever writes
 * the error out, so embedding a raw thrown value there re-exports that value's `message`, its `stack`
 * (absolute file paths and the internal call shape), its own nested `cause`, and its own `context` —
 * which across this port legitimately holds statement text, schema identifiers and the exact stored
 * value a row mapper refused. That is CWE-532, and because a message frequently contains caller text,
 * an embedded CR or LF also forges log lines (CWE-117). The intent was diagnosability; the effect was
 * a second, unbounded disclosure channel opened at the worst possible moment.
 *
 * THE RULE NOW IN FORCE. Only the abandoned failure's CLASS NAME travels, neutralized. A class name is
 * declared by this port or by the driver, never composed from caller input, and it is exactly the fact
 * an operator needs to tell "the work threw a DataIntegrityError" from "the work threw a driver
 * connection error" while the roll-back was failing. Nothing else about it is recorded here.
 *
 * ⭐ AND THE REASON THE WORK STOPPED IS STILL NOT SWALLOWED. That guarantee never depended on the
 * `context` bag: {@link runWorkInside} re-throws the work's own failure unchanged on every path where the
 * roll-back SUCCEEDS, which is the overwhelmingly common case. The bag only ever mattered for the
 * narrow case where the roll-back ITSELF failed, and for that case the class name plus the
 * roll-back's own failure as `cause` says what an operator can act on.
 *
 * ⛔ WHY THIS IS DUPLICATED RATHER THAN SHARED WITH `src/handlers/httpResponse.ts`, WHICH SOLVES THE
 * SAME PROBLEM AT ITS OWN SINK. An adapter may not import from the handler layer — AAP 0.7.3 S4 keeps
 * the hexagonal direction one-way, and a data-access module that reached into an AWS-facing boundary
 * for a string helper would invert it. Extracting a shared utility instead would mean creating a file
 * the AAP's target inventory does not list (AAP 0.4.1), so the honest choice is a local, deliberately
 * tiny implementation with the duplication stated at both sites rather than hidden.
 * ========================================================================================== */

/** The upper bound on the length of the one diagnostic string this module composes. A redaction
 * control, not a capacity figure (AAP 0.7.3 S9): it exists so a hostile or corrupt class name cannot
 * make a diagnostic record unbounded. */
const DIAGNOSTIC_TEXT_LIMIT = 200;

/** Replaces a character a diagnostic record must not carry. Inert in every log viewer. */
const DIAGNOSTIC_REDACTED_CHARACTER = '.';

/** Appended when {@link DIAGNOSTIC_TEXT_LIMIT} cut a value short, so truncation is never silent. */
const DIAGNOSTIC_TRUNCATION_MARKER = '[truncated]';

/** Stands in for a class name when the abandoned value is not an `Error` and therefore has none. */
const UNKNOWN_FAILURE_CLASS = 'unknown';

/** The highest C0 control code point. Everything at or below it is neutralized. */
const LAST_C0_CONTROL_CODE_POINT = 0x1f;

/** The delete character, and the first of the C1 range that follows it. */
const FIRST_C1_CONTROL_CODE_POINT = 0x7f;

/** The last C1 control code point. */
const LAST_C1_CONTROL_CODE_POINT = 0x9f;

/**
 * Reduces an abandoned failure to the single fact it is safe to record: its neutralized class name.
 *
 * Every C0 code point — CR, LF and TAB included — the delete character and every C1 code point is
 * replaced, so the value cannot forge a line break or emit a terminal escape sequence wherever the
 * diagnostic is eventually rendered (CWE-117). Iteration is by code point, so an astral character is
 * copied whole rather than split into lone surrogates by the length bound.
 *
 * @param failure - The value that abandoned the work, of any shape.
 * @returns Its class name, neutralized and bounded, or {@link UNKNOWN_FAILURE_CLASS}.
 */
function describeAbandonedFailure(failure: unknown): string {
  const declared = failure instanceof Error ? failure.constructor.name : '';
  const source = declared.length > 0 ? declared : UNKNOWN_FAILURE_CLASS;

  let sanitized = '';
  let retained = 0;

  for (const character of source) {
    if (retained >= DIAGNOSTIC_TEXT_LIMIT) {
      return sanitized + DIAGNOSTIC_TRUNCATION_MARKER;
    }

    const codePoint = character.codePointAt(0) ?? 0;
    const isControl =
      codePoint <= LAST_C0_CONTROL_CODE_POINT ||
      (codePoint >= FIRST_C1_CONTROL_CODE_POINT && codePoint <= LAST_C1_CONTROL_CODE_POINT);

    sanitized += isControl ? DIAGNOSTIC_REDACTED_CHARACTER : character;
    retained += 1;
  }

  return sanitized;
}

/**
 * Whether a checked-out connection is still fit to hand back to the pool.
 *
 * Module-private, mutable by design, and created per checkout — never per class, so nothing here is
 * the accumulating state M7 rules out. It exists because the answer is decided in one place (a
 * settlement either succeeded or it did not) and acted on in another (the `finally` that disposes of
 * the connection), and threading a boolean through the return type of every settle path would make
 * the failure paths, which cannot return anything, unable to report it.
 *
 * It starts `true`: a connection the pool has just handed over has had nothing done to it.
 */
interface ConnectionState {
  knownClean: boolean;
}

/**
 * Disposes of a checked-out connection according to what is known about its transaction state.
 *
 * THIS IS THE WHOLE OF THE FIX FOR A REAL DEFECT, AND IT IS NOT INVENTED RESILIENCE. Returning a
 * connection whose commit or roll-back itself failed puts a connection of UNKNOWN transaction state
 * back into a warm pool, where the next invocation checks it out and begins its own work on top of
 * whatever was left open. On a warm container that is precisely the cross-invocation bleed M7 exists
 * to prevent, and it is silent: the next caller sees no error, just a transaction that was already
 * open or rows that were already there.
 *
 * A connection is therefore released ONLY when its state is known — as handed over, after a
 * successful commit, or after a successful roll-back. On every other path it is destroyed, which
 * takes it permanently out of service and lets the pool open a fresh one. Destroying costs one
 * reconnection; releasing costs correctness.
 *
 * NOTHING IS SWALLOWED HERE AND NOTHING IS RAISED HERE. This function runs from a `finally`, so
 * raising would replace the failure the caller is already propagating — the settlement failure or the
 * work's own failure — with a disposal failure, and the original reason would be lost. The driver's
 * disposal members do not reject; the decision is expressed in WHICH one is called.
 *
 * @param connection - The connection to dispose of.
 * @param state - What is known about its transaction state.
 */
function returnConnection(connection: TransactionalStatementRunner, state: ConnectionState): void {
  if (state.knownClean) {
    connection.release();

    return;
  }

  connection.destroy();
}

/**
 * What a completed unit of work produced, together with how it must be settled.
 *
 * Module-private, and it exists so the settle decision is computed in ONE place, immediately after the
 * work finishes, rather than being recomputed at each settle site. Returning both together also means
 * the compiler can see that a result exists whenever a commit is chosen.
 *
 * @typeParam T - Whatever the unit of work produced.
 */
interface CompletedWork<T> {
  readonly decision: CommitDecision;
  readonly result: T;
}

/**
 * Rolls a boundary back, and refuses to fail silently if the roll-back itself fails.
 *
 * TODO(parity) org/Hibachi/Hibachi.cfc:L455-L459 — THE EXPLICIT ROLL-BACK IS A DOCUMENTED
 * TRANSLATION, NOT A PORT, AND THIS IS THE ONE PLACE THE DIFFERENCE MATTERS. There is no `rollback`
 * anywhere on the legacy path. What :L456 does on the error branch is DECLINE TO FLUSH: it takes the
 * negative of the gate, skips the flush at :L457, and the CF/Railo request teardown then discards the
 * ORM session with the pending changes still in it. Application.cfc:L113-L123 wraps that in a second
 * gate and changes nothing about it.
 *
 * A stateless handler has no equivalent teardown. It holds a real MySQL transaction on a real pooled
 * connection, and that connection goes back to the pool for the next caller, so declining to commit
 * would leave the writes pending on a connection somebody else is about to use — the exact
 * cross-invocation bleed M7 exists to prevent. AN EXPLICIT ROLL-BACK IS THEREFORE REQUIRED, and it is
 * introduced here as a deliberate translation rather than carried over from anything. The two are
 * observably equivalent ONLY because the legacy session was discarded at request end; on a warm
 * container, doing nothing would not be equivalent at all.
 *
 * A SUCCESSFUL ROLL-BACK RESTORES THE CONNECTION'S KNOWN-CLEAN STANDING, and a failed one withdraws
 * it. That is recorded on the shared state object rather than returned, because the failure path
 * throws and so cannot return anything, and it is the disposal decision in {@link returnConnection}
 * that needs the answer.
 *
 * @param connection - The connection the transaction was begun on.
 * @param cause - Which path reached the roll-back, for the diagnostic record only.
 * @param abandonedFailure - The failure that abandoned the work, when there was one. Only its
 *   neutralized CLASS NAME reaches the error's `context`; the value itself is never embedded there.
 *   See {@link describeAbandonedFailure}.
 * @throws {DomainError} When the roll-back itself fails. The roll-back failure becomes the error's
 *   `cause` and the abandoned failure's class travels on `context`, so an operator can tell what kind
 *   of failure was in flight without the record carrying that failure's message, stack or context.
 */
async function rollBack(
  connection: TransactionalStatementRunner,
  cause: RollbackCause,
  state: ConnectionState,
  abandonedFailure?: unknown,
): Promise<void> {
  try {
    await connection.rollback();

    state.knownClean = true;
  } catch (rollbackFailure) {
    throw new DomainError(
      'The transaction could not be rolled back after the work inside it was abandoned, so nothing ' +
        'can be reported about what the database retained.',
      {
        cause: rollbackFailure,
        /*
         * ⛔ THE ABANDONED FAILURE IS SUMMARISED, NEVER EMBEDDED. Only its neutralized class name
         * travels — see the section note on {@link describeAbandonedFailure} for why attaching the
         * object itself was a disclosure (CWE-532) and log-injection (CWE-117) channel, and for why
         * the reason the work stopped is still not swallowed.
         *
         * The summary is attached only when there WAS an abandoned failure, rather than assigned as
         * `undefined`, because `exactOptionalPropertyTypes` makes "absent" and "present and
         * undefined" different things and the honest statement here is "absent".
         */
        context:
          abandonedFailure === undefined
            ? { rolledBackBecause: cause }
            : {
                rolledBackBecause: cause,
                abandonedFailureClass: describeAbandonedFailure(abandonedFailure),
              },
      },
    );
  }
}

/**
 * Runs a caller's work inside an already-open boundary and decides how the boundary must settle.
 *
 * THE ERROR GATE IS EVALUATED HERE, INSIDE THE GUARD, AND THAT IS DELIBERATE. The predicate belongs to
 * the caller and can itself fail — it walks an entity graph in the general case — so evaluating it
 * outside the guard would leave a path where an open transaction is released back to the pool. Both a
 * failing predicate and failing work therefore reach the same roll-back.
 *
 * The scope object is frozen and built here, once, so the boundary's executor cannot be swapped after
 * the caller receives it, and so nothing that could outlive the transaction is retained anywhere.
 *
 * @typeParam T - Whatever the unit of work produces.
 * @param connection - The connection the transaction was begun on.
 * @param work - The caller's unit of work. It receives the scope and nothing else.
 * @param hasErrors - The M5 gate: the caller's own error-state predicate.
 * @param state - The connection's disposition record, so a failed roll-back on this path withdraws
 *   the connection's known-clean standing rather than letting it be recycled.
 * @returns The work's result together with the settle decision.
 * @throws The work's own failure, unchanged, after the boundary has been rolled back. Nothing is
 *   wrapped, re-typed or re-messaged on this path: a caller catching a specific failure from its own
 *   work must still catch the same value.
 */
async function runWorkInside<T>(
  connection: TransactionalStatementRunner,
  work: (scope: TransactionScope) => Promise<T>,
  hasErrors: () => boolean,
  state: ConnectionState,
): Promise<CompletedWork<T>> {
  try {
    const result = await work(Object.freeze({ executor: createExecutor(connection) }));

    return { decision: hasErrors() ? 'rollback' : 'commit', result };
  } catch (failure) {
    await rollBack(connection, 'workFailure', state, failure);

    throw failure;
  }
}

/**
 * Opens one transaction on an ALREADY CHECKED-OUT connection, runs the work and settles it.
 *
 * Extracted so that the acquire-and-dispose invariant lives in exactly one place per boundary shape
 * while the begin-work-settle sequence lives in exactly one place FULL STOP. The single-boundary
 * member checks a connection out, calls this once and disposes of it; the per-item member checks a
 * connection out, calls this once PER ITEM on that same connection, and disposes of it once at the
 * end. Neither duplicates the sequence, so neither can drift from the other.
 *
 * IT DELIBERATELY DOES NOT ACQUIRE, RELEASE OR DESTROY ANYTHING. A function that both borrowed a
 * connection and opened a transaction on it could not be reused across items without borrowing one
 * per item, which is exactly the churn the per-item member exists to avoid.
 *
 * The connection's known-clean standing is withdrawn immediately before the transaction is begun and
 * restored only by a settlement that actually succeeded. So a failure anywhere between those two
 * points — in `beginTransaction`, in the work, in the roll-back or in the commit — leaves the
 * connection marked as unknown, and the caller's `finally` destroys it rather than recycling it.
 *
 * @typeParam T - Whatever the unit of work produces.
 * @param connection - The already checked-out connection.
 * @param state - The connection's disposition record, updated in place.
 * @param work - The unit of work.
 * @param hasErrors - The M5 gate.
 * @returns The work's result, once the transaction has committed.
 * @throws {DomainError} When `hasErrors()` answers `true`; the transaction is rolled back first.
 * @throws {DomainError} When the roll-back itself fails; see {@link rollBack}.
 * @throws The work's own failure, unchanged, after the transaction has been rolled back.
 */
async function runTransaction<T>(
  connection: TransactionalStatementRunner,
  state: ConnectionState,
  work: (scope: TransactionScope) => Promise<T>,
  hasErrors: () => boolean,
): Promise<T> {
  state.knownClean = false;

  await connection.beginTransaction();

  const completed = await runWorkInside(connection, work, hasErrors, state);

  if (completed.decision === 'rollback') {
    await rollBack(connection, 'accumulatedErrors', state);

    throw new DomainError(
      'The unit of work was rolled back because the caller reported accumulated validation ' +
        'errors, so nothing it wrote was kept.',
      { context: { settledAs: completed.decision } },
    );
  }

  await connection.commit();

  state.knownClean = true;

  return completed.result;
}

/* ================================================================================================
 * THE PUBLIC SURFACE
 * ============================================================================================== */

/**
 * Everything a unit of work is allowed to reach while its transaction is open.
 *
 * ONE MEMBER, AND THE NARROWNESS IS THE FEATURE — the narrowness of the SCOPE, that is, not of the
 * executor on it. AAP 0.6.2's mandate is that "each SKU's insert [is] visible to the next SKU's
 * uniqueness read within the same transaction", and that guarantee only holds while every statement
 * runs on the connection the transaction was begun on. Carrying the executor and nothing else means a
 * caller inside a boundary has no way to reach the pool, no way to settle the transaction early and no
 * way to return the connection while work is still in flight — so the guarantee is a property of the
 * type rather than of the caller's care.
 *
 * ⭐ THE EXECUTOR CARRIES BOTH A READ AND A WRITE MEMBER, BECAUSE THE MANDATE IS UNREACHABLE OTHERWISE.
 * The read member's answer is normalised into rows by `rowMappers.ts` `toRows`, which RAISES on a write
 * acknowledgement, so a read-shaped executor cannot carry a write at all. A boundary that handed one
 * out would force every insert to be issued somewhere else — which means on another connection, outside
 * this transaction — and the uniqueness read inside the boundary would then never see its siblings. It
 * is therefore typed {@link ReadWriteSqlExecutor}: the SAME pair the three writing adapters in this
 * folder each declare as their dependency, and a superset of the read-only {@link SqlExecutor} the
 * read-only adapters declare. IDENTICAL REPOSITORY CODE THEREFORE RUNS INSIDE A BOUNDARY AND OUTSIDE
 * ONE, which is what makes M6 testable at all: a plain object literal satisfies the contract, so a test
 * can record the exact statement sequence a combination batch produces without a database
 * (AAP 0.6.5.2 — every repository test in this port is net-new and no mocking library is available).
 *
 * ⚠️ WHAT IS STILL DELIBERATELY ABSENT, and none of it becomes admissible because a write member is
 * present: no connection, no transaction handle, no identifier, no started-at stamp, no nesting depth,
 * no settle member and no scratch space. Adding mutable space here would reintroduce exactly the
 * accumulating state M7 rules out; if a transaction-scoped memo is ever genuinely needed, it belongs
 * on this object precisely BECAUSE this object is discarded when the boundary closes.
 *
 * @example
 * ```ts
 * // A repository member is written once and works in both places.
 * await unitOfWork.run(async (scope) => {
 *   await skuRepository.insert(scope.executor, sku);
 *   // The uniqueness read below observes the insert above: same connection, same transaction.
 *   return skuRepository.findSkusBySelectedOptions(scope.executor, optionIds, productId);
 * }, () => product.hasErrors());
 * ```
 */
/**
 * The execution surface a boundary hands out: one connection, reads AND writes.
 *
 * `SqlExecutor` from `./QueryRunner` is deliberately ONE member wide so a test can substitute a plain
 * object literal, and that width is preserved — this EXTENDS it rather than replacing it, and adds
 * exactly one member. The pattern is the one three sibling adapters already use for the same reason:
 * `SkuStatementExecutor`, `BrandStatementExecutor` and `ProductStatementExecutor` each extend
 * `SqlExecutor` with this same writing member, and `QueryRunner` satisfies all of them structurally.
 * This is the fourth declaration of that seam and the first that is bound to a TRANSACTION rather than
 * to a pool.
 *
 * ⭐ WHY IT HAS TO EXIST RATHER THAN REUSING ONE OF THE THREE. Each of those three names the adapter it
 * serves, and none of them may be imported here: they live in files that import `TransactionScope` FROM
 * this one, so reaching back for one of their types would close an import cycle. Declaring the shape
 * where the boundary is owned keeps the dependency pointing one way — adapters depend on the boundary,
 * never the reverse — and structural typing means a scope executor satisfies all three without any of
 * them being mentioned here.
 *
 * ⭐ WHY THE WRITE MEMBER IS PART OF THE BOUNDARY CONTRACT AND NOT A SEPARATE OBJECT. The importer
 * writes and reads inside the same row transaction: `model/dao/ProductDAO.cfc:L177` opens its
 * per-row transaction inside the record loop, and everything the row does — the brand and
 * product-type lookups at `:L179-L186`, the product and SKU writes, the option and link writes —
 * happens inside it. If a write had to be issued through anything other than the object the
 * boundary handed over, it would necessarily be issued outside that transaction, which is the
 * precise failure M6 exists to prevent. `./MySqlProductRepository`'s `ProductStatementExecutor`
 * declares exactly this pair, and this type is what satisfies it, so the importer's transaction
 * boundary is {@link UnitOfWork} itself rather than a second adapter holding a second reference
 * to the pool.
 *
 * ⛔ THIS WAS DECLARED TWICE, IDENTICALLY, AND ONE COPY IS REMOVED. Two `export interface`
 * declarations of this exact shape stood in this file. TypeScript MERGES same-named interfaces in
 * one scope, so neither the compiler nor the linter reported it and both declarations were live.
 * The surviving declaration is this one, and the argument the removed copy carried — the one
 * immediately above — is kept rather than dropped with it.
 *
 * ⛔ AND A THIRD, DIFFERENTLY-NAMED TWIN IS REMOVED TOO. `ScopedSqlExecutor` declared this same pair
 * earlier in the file; the note left at its position records the removal. Because it was differently
 * named it did not merge with these two, so it was simply dead, and an exported type cannot be
 * reported as unused. Its two surviving arguments are the next two paragraphs.
 *
 * ⭐ IT EXTENDS THE READ-ONLY CONTRACT RATHER THAN RESTATING A FRESH PAIR OF SIGNATURES. A repository
 * that already accepts an `SqlExecutor` keeps working unchanged, and one that needs to write inside a
 * transaction says so by asking for this type instead — so widening a collaborator's requirement is a
 * one-word change at the point that needs it, and no reader has to compare two signature lists to see
 * that the read member is the same read member.
 *
 * ⭐ WHY THE WRITING MEMBER ANSWERS A COUNT AT ALL. It is the only signal a stateless caller gets that
 * a targeted write matched anything: the legacy relied on the ORM session noticing, and there is no
 * session here to notice. `./QueryRunner` records the same reasoning for its own mutation member.
 *
 * ⚠️ NOTHING ON IT CAN SETTLE A TRANSACTION. There is no `commit`, no `rollback`, no `beginTransaction`
 * and no way to reach the driver object it closes over. A repository handed one of these can read and
 * write inside the boundary that owns it and can do nothing else — which is what stops a repository
 * routing a read back through the pool and out of the transaction it is supposed to be inside (M6).
 */
export interface TransactionalSqlExecutor extends SqlExecutor {
  /**
   * Run a data-modifying statement on this boundary's connection and return the rows it affected.
   *
   * Matches `QueryRunner.executeMutation` member for member, so a repository written against either
   * one runs unchanged against the other. The affected-row count is not decoration:
   * `model/dao/ProductDAO.cfc:L247` branches on it.
   *
   * @param sql - The writing statement text, with a `?` in every value position.
   * @param params - The values to bind, in legacy positional order (TR-4).
   * @returns The number of rows affected, which may legitimately be zero.
   */
  executeMutation(sql: string, params: readonly unknown[]): Promise<number>;
}

export interface TransactionScope {
  /**
   * The only execution surface inside the boundary. Every read and every write goes through it.
   *
   * ⭐ WIDENED FROM THE READ-ONLY `SqlExecutor` TO CLOSE REVIEW FINDINGS 2 AND 8. While this was typed
   * as a read-only executor, no write could be performed inside any boundary this class opened, which
   * made rollback-on-errors and M6 read-back visibility structurally unreachable and left
   * `MySqlProductRepository`'s `ProductImportTransactionScope` — which narrows this very member to a
   * writing executor — impossible to satisfy. That narrowing is now satisfied by construction: the two
   * shapes are structurally identical, so `UnitOfWork` meets
   * `ProductImportTransactionBoundary` without either file importing the other's types.
   */
  readonly executor: TransactionalSqlExecutor;
}

/**
 * How a boundary settled: the ported form of the legacy commit gate's two outcomes.
 *
 * `'commit'` is the legacy `!getORMHasErrors()` branch at org/Hibachi/Hibachi.cfc:L456, which reaches
 * the flush at :L457. `'rollback'` is the other branch — the one where the legacy code simply DID
 * NOTHING and the request ended with nothing persisted.
 *
 * It exists as a named, exported type rather than an inline boolean because "did this unit of work
 * commit?" is the single most consequential fact about a boundary, and a boolean at a call site does
 * not say which way round it reads. A test asserting on a recorded settlement, and a sibling adapter
 * describing what a boundary did, both name the outcome in the same vocabulary.
 */
export type CommitDecision = 'commit' | 'rollback';

/**
 * Where the per-item boundary members take their items from: a materialised list, or a lazy source.
 *
 * ⚠️ IT CARRIES NO LEGACY ORIGIN, BECAUSE THE LEGACY HAD NO CHOICE TO MAKE.
 * `model/dao/ProductDAO.cfc:L87` retrieves the whole delimited file into a single CFML query object and
 * `:L176` then loops `from 1 to data.recordcount`, so the legacy's items are always fully materialised
 * before the first transaction opens. This union does not model a legacy variation; it models the fact
 * that a port CAN avoid holding a whole catalog file in memory while producing byte-for-byte the same
 * sequence of transactions, and that avoiding it is structural (AAP §0.8.2 Guideline 4) because it
 * changes only WHEN a row becomes known.
 *
 * ⚠⚠️ WHAT IT DOES NOT LICENSE. Supplying a lazy source does NOT relax any guarantee
 * {@link UnitOfWork.runPerItem} and {@link UnitOfWork.runPerItemWithoutResults} make. The items must
 * still arrive in the order they must be processed, because both M3 (independent ordered commits) and
 * M6 (write order is behaviour) depend on that order and neither member sorts, filters or reorders.
 * A source that yields items concurrently, out of order, or more than once is a defect in the source.
 *
 * ⚠️ AND A LAZY SOURCE MUST NOT PERFORM DATABASE WORK OF ITS OWN. The loop advances the source BETWEEN
 * transactions, on the same connection the previous item's transaction just settled on. A source that
 * issued its own statements would interleave them with the per-item boundaries, which is precisely the
 * interleaving M6 exists to forbid. Reading bytes, parsing text and yielding parsed values are all
 * safe; querying is not.
 *
 * `readonly TItem[]` is retained as a member of the union rather than being replaced by
 * `Iterable<TItem>` so that every existing caller — and every existing test double — keeps its exact
 * declared parameter type and its read-only guarantee.
 *
 * @typeParam TItem - The item type, one per independent transaction.
 */
export type PerItemSource<TItem> = readonly TItem[] | AsyncIterable<TItem>;

/**
 * Explicit transaction boundaries for the extracted Catalog slice.
 *
 * The replacement for a commit that used to be implicit, request-scoped and error-gated. Read the
 * module header first: it records the three mismatches this class owns (M3, M5, M6), the fourth that
 * binds it (M7), the ordering fact that constrains every boundary shape, the long list of things it
 * deliberately does not invent, and the formal exclusion of the re-ordering member.
 *
 * A SINGLETON THAT HOLDS NOTHING. DI/1 registered services and data-access components as singletons
 * while entities and process objects stayed transient, so the composition root wires ONE of these and
 * injects it downwards. It is safe to share precisely because it accumulates nothing: every boundary's
 * connection, executor and scope object are created when the boundary opens and unreachable once it
 * closes, and there is no ambient current-transaction slot for a second caller on a warm container to
 * observe (M7, AAP 0.7.3 S3).
 *
 * THREE BOUNDARY SHAPES, ALL EXPLICIT, BECAUSE THE LEGACY HAD THREE:
 *   - {@link UnitOfWork.run} — one boundary per handler invocation, settled on the caller's error
 *     state. The port of the request-end gate.
 *   - {@link UnitOfWork.runPerItem} — one independent boundary per item, strictly in order. The port
 *     of the importer's per-row transaction.
 *   - {@link UnitOfWork.runWithoutTransaction} — no boundary at all. The port of the importer's two
 *     bulk back-fills, which run after the loop's transaction has closed.
 *
 * Plus {@link UnitOfWork.runScoped}, which is NOT a fourth shape — it is `run` with the collaborator
 * graph built FROM the scope instead of captured from outside it, and the gate asked about the work's
 * own result instead of about ambient state. It exists because repositories in this folder take their
 * executor at construction, so a caller cannot otherwise guarantee that the inserts and the uniqueness
 * read-back AAP 0.6.2 requires to share a transaction actually do. It is the member the writing routes
 * call; `run` remains the mechanism underneath it and the one place the settle sequence lives.
 *
 * Plus one read this class owns outright, {@link UnitOfWork.getTableTopSortOrder}, because the
 * entity-lifecycle block that used it has no other home in the port.
 *
 * ⭐ THIS CLASS IS THE PRODUCTION IMPLEMENTATION OF THE IMPORTER'S BOUNDARY CONTRACT, AND THAT IS
 * CHECKED RATHER THAN CLAIMED. `MySqlProductRepository.ts` declares what the importer needs —
 * `ProductImportTransactionBoundary`, two members wide, one per legacy boundary kind — as a LOCAL
 * structural interface so a test can record what a boundary did. It is declared locally rather than
 * imported from here for that reason alone; it is not a second contract, and nothing in this port
 * implements it except this class. The last two members below satisfy it member for member: the
 * per-item boundary hands each row its own transaction and its own scope, and the untransacted member
 * hands the two bulk back-fills a pool-bound executor. Both hand out the same
 * {@link ReadWriteSqlExecutor} pair the importer's own executor interface names, so the composition
 * root injects THIS OBJECT and never has to reach the connection a boundary is holding — it cannot,
 * because no member of this class returns one. `test/adapters/MySqlProductRepository.test.ts` pins the
 * assignability at compile time, so re-narrowing the scope executor breaks the build rather than the
 * import.
 *
 * @example
 * ```ts
 * // src/config/container.ts — wired once, then injected downwards.
 * const unitOfWork = new UnitOfWork(pool);
 * // The importer takes the same object as its boundary: no shim, no adapter, no recovered connection.
 * const productRepository = new MySqlProductRepository({ transactions: unitOfWork, ... });
 * ```
 */
/* ================================================================================================
 * THE FIRST-SORT-ORDER SEEDING CONTRACT — REVIEW FINDING 18
 * ================================================================================================
 * `model/entity/OptionGroup.cfc:L58` declares `property name="sortOrder" ormtype="integer"
 * required="true"`, and `model/validation/OptionGroup.json` says NOTHING about the property. The
 * requiredness is therefore enforced by the COLUMN and by the ORM lifecycle, never by validation — which
 * is why `test/domain/OptionGroup.test.ts` correctly asserts that a group with `sortOrder` unset
 * validates clean, and why that assertion is not the whole story.
 *
 * WHAT FILLS THE VALUE IN THE LEGACY. `org/Hibachi/HibachiEntity.cfc:L637-L647`, inside `preInsert()`:
 * when the entity has a `setSortOrder` accessor it reads the current maximum through
 * `getService("hibachiService").getTableTopSortOrder(...)` and assigns `topSortOrder + 1`. `:L642`
 * takes the SCOPED read when the property's metadata declares a `sortContext` AND that context property
 * is set; `:L644` takes the WHOLE-TABLE read otherwise. `OptionGroup` declares no `sortContext`, so it
 * seeds across its entire table; `model/entity/Option.cfc:L56` declares `sortContext="optionGroup"`, so
 * it seeds within its group. Both domain files name THIS MODULE as the port's owner of that block,
 * because it needs a `MAX()` aggregate and the domain layer performs no data access (S2/S4).
 *
 * ⛔ AND UNTIL NOW THE OWNER OWNED ONLY HALF OF IT. {@link UnitOfWork.getTableTopSortOrder} ported the
 * READ at `org/Hibachi/HibachiDAO.cfc:L149-L168` faithfully, and nothing ported the ASSIGNMENT that
 * consumes it — so no code path anywhere seeded the value, and an entity could reach a writable-value
 * collector with the slot still absent. That is the gap review finding 18 names: "UnitOfWork currently
 * fills the value; any bypass reaches the database with a non-writable object." The two members below
 * close it — one performs the assignment, the other refuses the bypass.
 *
 * ⚠️ NOTHING HERE INVENTS A DEFAULT. In particular `sortOrder` is never defaulted to `0` or to `1`: the
 * seed is always `topSortOrder + 1` read from the table, and an entity that was never seeded RAISES
 * rather than acquiring a fabricated position (S9). A fabricated position would be worse than a refusal,
 * because `SwOptionGroup.sortOrder` is an EXPONENT in the sorted-SKU ordering — `model/dao/SkuDAO.cfc:L195`
 * computes `SUM(SwOption.sortOrder * POWER(10, next - SwOptionGroup.sortOrder))` — so a wrong position
 * silently reorders SKUs rather than failing.
 * ============================================================================================== */

/**
 * The minimum shape the seeding step needs: a mutable `sortOrder` slot.
 *
 * Structural rather than nominal, and deliberately so. `org/Hibachi/HibachiEntity.cfc:L639` gates the
 * whole block on `structKeyExists(this,"setSortOrder")` — the presence of the ACCESSOR, not the identity
 * of the entity — so any entity carrying the property participates and any entity without one is skipped.
 * A union of the two in-scope entity types would port that gate as a closed list, which is exactly the
 * invented closedness S9 forbids.
 */
export interface SortOrderSeedTarget {
  sortOrder?: number;
}

/**
 * The `sortContext` scope, when the entity declares one.
 *
 * PORT OF `org/Hibachi/HibachiEntity.cfc:L642`, which passes
 * `contextIDColumn=variables[metaData.sortContext].getPrimaryIDPropertyName()` and
 * `contextIDValue=variables[metaData.sortContext].getPrimaryIDValue()` — the parent's primary-key COLUMN
 * NAME and its VALUE, both drawn from the parent object the context names.
 *
 * The two travel together in one object for the same reason
 * {@link UnitOfWork.getTableTopSortOrder}'s overloads admit them only together: `:L641` guards on BOTH
 * keys existing, so a half-supplied scope silently reads the whole table. Making the pair inseparable
 * turns that into a compile error without changing any runtime outcome.
 */
export interface SortOrderSeedScope {
  /** The parent's primary-key column — `getPrimaryIDPropertyName()` at `:L642`. */
  readonly contextIDColumn: string;
  /** The parent's primary-key value — `getPrimaryIDValue()` at `:L642`. */
  readonly contextIDValue: string;
}

/**
 * Refuses an entity that would reach the database with no `sortOrder` — review finding 18.
 *
 * ⭐ THIS IS THE INVARIANT'S ONLY ENFORCEMENT POINT, AND IT IS AT THE PERSISTENCE BOUNDARY BY DESIGN.
 * `model/validation/OptionGroup.json` declares no rule, so validation cannot catch this and must not be
 * taught to — inventing a presence rule there would report a validation error the legacy never reports,
 * on a save the legacy completes. The column is `NOT NULL` and the ORM lifecycle fills it, so the honest
 * port of that arrangement is: fill it here, and refuse here if something bypassed the fill.
 *
 * ⚠️ WHY IT RAISES RATHER THAN SEEDING. Seeding needs a `MAX()` read and therefore an executor; a guard
 * that quietly performed one would hide the bypass instead of reporting it, and would issue a statement
 * from whatever call site forgot to seed — possibly outside the transaction the write belongs to. The
 * guard is deliberately incapable of repair.
 *
 * @param entity - the entity about to be written.
 * @param tableName - the table it is being written to, for the diagnostic.
 * @returns the same entity, with `sortOrder` known to be present.
 * @throws {DataIntegrityError} when `sortOrder` is absent.
 */
export function assertSortOrderAssigned<TEntity extends SortOrderSeedTarget>(
  entity: TEntity,
  tableName: string,
): TEntity & { sortOrder: number } {
  const { sortOrder } = entity;

  if (sortOrder === undefined) {
    throw new DataIntegrityError(
      'A sortOrder-bearing entity reached the persistence boundary with no sort order assigned, so ' +
        'it cannot be written: the column is declared required and no default may be invented for it.',
      { context: { table: assertTableName(tableName), member: 'assertSortOrderAssigned' } },
    );
  }

  return { ...entity, sortOrder };
}

export class UnitOfWork {
  /**
   * The injected connection pool.
   *
   * `private readonly`: nothing in this class replaces it and nothing outside can reach it, so a
   * consumer cannot end the pool, resize it, or borrow a connection around a boundary that owns one.
   * Its lifetime belongs to the composition root that supplied it, which is what preserves reuse
   * across warm invocations — a pool built per invocation would reconnect on every call.
   *
   * It is the ONLY field on this class, and it never changes after construction. That is the whole of
   * this class's state (M7).
   *
   * Typed as the driver port `./QueryRunner` declares rather than as the driver's own pool type, so
   * the composition root's single exported pool serves this class and the query runner alike. There is
   * ONE pool in this subtree and neither adapter imports the configuration layer to reach it.
   */
  private readonly pool: StatementPool;

  /**
   * @param pool - The pool to draw transactional connections from, supplied by the composition root.
   *   This class never builds one, never reads a credential and never resolves a connection target;
   *   contrast model/dao/ProductDAO.cfc:L155-L158, :L329-L332 and :L420, which each construct a
   *   credential-reading connection inside the data-access layer itself.
   */
  public constructor(pool: StatementPool) {
    this.pool = pool;
  }

  /**
   * Runs one unit of work inside one transaction and settles it on the caller's error state.
   *
   * THE PORT OF THE REQUEST-END COMMIT GATE (M5). The legacy sequence was: accumulate errors through
   * the request, then at request end flush ONLY IF there are none (org/Hibachi/Hibachi.cfc:L456-L457,
   * with the subclass's own gate in front of it at Application.cfc:L115-L122). AAP 0.4.1.7 states the
   * problem in one line — "There is no request-end hook in a stateless handler" — so the boundary
   * becomes explicit and per invocation, and the gate becomes a predicate the caller supplies.
   *
   * The sequence is the one AAP 0.3.2 prescribes for this driver: ACQUIRE, BEGIN, COMMIT-OR-ROLL-BACK,
   * RELEASE. The release runs in a `finally`, so a connection is never leaked on the error path; that
   * is a correctness requirement of the driver's contract and not invented resilience.
   *
   * WHY IT TAKES THE WHOLE UNIT OF WORK AS ONE CALLBACK rather than exposing begin and commit as
   * separate members. model/service/ProductService.cfc:L264-L292 creates a product's SKUs at :L279 —
   * after validation at :L273 and BEFORE the product itself is persisted at :L287, while the product is
   * still transient. A caller that could commit at will would be able to commit the parent early and
   * change the observable failure semantics; a single callback makes the whole graph settle once.
   *
   * WHEN THE GATE REPORTS ERRORS THIS MEMBER ROLLS BACK AND REJECTS, AND THE CHOICE IS VISIBLE IN THE
   * TYPE. The declared return is `Promise<T>`, which can be fulfilled only WITH a `T`; there is no
   * value that means "nothing was persisted". Discarding the work's result is therefore expressible
   * only as a rejection, and returning the result after a roll-back would tell a caller a `T` was
   * produced while silently withholding that none of it survives. The rejection carries a
   * {@link DomainError} authored for this file. The other branch — the work itself failing — rolls back
   * and RE-THROWS THE ORIGINAL VALUE UNCHANGED, so a caller catching its own failure still catches the
   * same value.
   *
   * A FAILING COMMIT PROPAGATES AND IS NOT FOLLOWED BY A ROLL-BACK ATTEMPT. Once the commit has been
   * issued the transaction's disposition is the server's, and a second settle statement on a connection
   * in that state would be recovery behaviour with no legacy counterpart (AAP 0.8.2 Guideline 4). The
   * connection is still DISPOSED OF on this path as on every other — but it is destroyed rather than
   * released, because its transaction state is no longer known; see {@link returnConnection}.
   *
   * ==================================================================================================
   * HOW A CALLER ROUTES REPOSITORY WORK THROUGH `scope.executor` — AND WHY IT PREVIOUSLY COULD NOT
   * ==================================================================================================
   * Every MySQL repository in this folder captures its execution surface at construction, so a graph
   * built by a composition root is necessarily POOL-bound. Handing such a repository to a callback and
   * asking it to take part in this transaction used to be impossible: the callback received a
   * `scope.executor` the repository had no way to adopt, so its reads and writes went to the pool —
   * outside the very boundary meant to contain them. That made both roll-back-on-errors and the M6
   * same-connection visibility STRUCTURALLY UNREACHABLE rather than merely unwired, which is the more
   * serious of the two failures: a caller writing the obvious code would have got silent
   * non-participation rather than an error.
   *
   * The gap is closed by a `withExecutor` member on every transaction-sensitive adapter —
   * `MySqlSkuRepository`, `MySqlOptionRepository`, `MySqlProductTypeRepository`, `MySqlBrandRepository`,
   * `MySqlProductRepository` and `UniquePropertyChecker` — each returning a NEW instance bound to the
   * supplied executor rather than mutating the instance it was called on. A caller re-binds inside the
   * callback:
   *
   * ```ts
   * await unitOfWork.run(
   *   async (scope) => {
   *     const skus = skuRepository.withExecutor(scope.executor);
   *     const unique = uniqueProperties.withExecutor(scope.executor);
   *     // Every read and write below now shares this boundary's single connection, which is what
   *     // lets each SKU's uniqueness read observe the siblings written before it (M6, AAP 0.6.2).
   *     return createTheBatch(skus, unique);
   *   },
   *   () => product.hasErrors(),
   * );
   * ```
   *
   * Returning a new instance rather than mutating is deliberate, and it is what keeps this class
   * stateless: an in-place re-bind would be an ambient current-transaction slot in all but name, the
   * one thing M7 and AAP 0.7.3 S3 forbid. Two concurrent boundaries on a warm container get two
   * instances and cannot observe each other's connection.
   *
   * ⚠️ `withExecutor` IS ON NO PORT INTERFACE, WHICH IS WHY THE RE-BIND HAPPENS AT THE COMPOSING CALLER
   * AND NOT INSIDE A SERVICE. A service may not know that a statement executor exists at all — AAP
   * 0.7.3 S2 inverted, stated as a prohibition at src/services/BaseService.ts:270-292 — so it can
   * neither be handed a scope nor re-bind its own collaborators. That is the same conclusion
   * src/ports/repositories/SkuRepository.ts reaches from the opposite direction, where `persistSku`
   * records that the write "must not be committed here" and that demarcation "stays with the caller".
   *
   * ⛔ THE CALLER MUST CATCH THE ERROR-GATE REJECTION AND RETURN THE ENTITY, NOT PROPAGATE IT. When
   * `hasErrors()` answers `true` this member rejects, for the return-type reason given above — but the
   * legacy did NOT raise in that situation. org/Hibachi/Hibachi.cfc:L456-L457 simply never reached the
   * flush, and model/service/HibachiService.cfc returns `arguments.entity` on BOTH branches, so a
   * caller received an entity carrying its error bag either way. Allowing this rejection to travel on
   * to a handler would turn a legacy "entity with errors" into an exception — an OUTCOME change, not a
   * representation one. The rejection is an artefact of this layer's `Promise<T>` return type, and
   * converting it back to the legacy's shape is the composing caller's obligation.
   *
   * ⚠️ WHERE THE PRODUCTION CALL SITE BELONGS, AND WHY IT IS NOT IN THIS MILESTONE. Nothing in the
   * delivered subtree calls this member, and that is a sequencing fact rather than an oversight. The
   * artefact that would write the wiring above is src/config/container.ts, which belongs to a LATER
   * milestone and is deliberately not authored here. Neither of the two layers that exist can host the
   * call in its place: a service is barred by the prohibition cited above, and a handler receives a
   * service SURFACE — a `Pick<>` of the service's members — rather than a repository, an executor or
   * this class. What this milestone does deliver is the part that must exist first and cannot be
   * supplied by a composition root at all: the boundary itself, a mutation-capable scope executor, and
   * a re-bind on every adapter that participates. Wiring is then a call, not a redesign.
   *
   * @typeParam T - Whatever the unit of work produces.
   * @param work - The unit of work. It receives a {@link TransactionScope} and must route EVERY read
   *   and EVERY write through `scope.executor`; see M6 in the module header for what happens if it
   *   does not.
   * @param hasErrors - The M5 gate. Answer `true` when the caller has accumulated validation errors,
   *   exactly as model/service/SkuService.cfc:L152 and :L180 do before they proceed. It is a predicate
   *   rather than an inspection because the error state lives in src/validation/**, which this layer
   *   may not import (AAP 0.7.3 S4).
   * @returns The unit of work's result, once the transaction has committed.
   * @throws {DomainError} When `hasErrors()` answers `true`. The transaction is rolled back first and
   *   the result is discarded.
   * @throws {DomainError} When the roll-back itself fails; see {@link rollBack}.
   * @throws The work's own failure, unchanged, after the transaction has been rolled back.
   */
  public async run<T>(
    work: (scope: TransactionScope) => Promise<T>,
    hasErrors: () => boolean,
  ): Promise<T> {
    const connection = await this.pool.getConnection();
    const state: ConnectionState = { knownClean: true };

    try {
      return await runTransaction(connection, state, work, hasErrors);
    } finally {
      /*
       * The last step of AAP 0.3.2's sequence, and it runs on EVERY path: after a commit, after a
       * roll-back, after a failed commit, after a failed roll-back and after a failure raised by the
       * work itself. A connection that is not returned is a connection the pool cannot re-use, and on
       * a warm container that is permanent — which is why the disposal is unconditional and only the
       * CHOICE of disposal depends on what is known about the connection's state.
       */
      returnConnection(connection, state);
    }
  }

  /**
   * Runs one unit of work inside one transaction over collaborators BUILT FOR THAT TRANSACTION, and
   * settles it on the error state of whatever the work produced.
   *
   * ⭐ WHY {@link UnitOfWork.run} ALONE WAS NOT ENOUGH, AND WHY THIS MEMBER IS THE FIX RATHER THAN A
   * CONVENIENCE. Every repository in this folder takes its {@link SqlExecutor} AT CONSTRUCTION, which is
   * what lets identical repository code run inside a boundary and outside one. The consequence is that a
   * caller cannot honour M6 by wrapping an ALREADY-CONSTRUCTED service graph in `run`: the graph it
   * captured is bound to some other executor, so the inserts and the uniqueness read-back that AAP 0.6.2
   * requires to share one transaction would quietly run on two connections — no error, no compile
   * failure, and a different set of SKUs. The graph therefore has to be built FROM the scope, and that is
   * the one thing `run`'s signature cannot express on its own. This member closes that gap: `buildGraph`
   * receives the scope, so nothing inside the boundary can reach an executor the transaction does not own.
   *
   * ⭐ AND IT SETTLES ON THE RESULT RATHER THAN ON AMBIENT STATE. `run` takes the M5 gate as a
   * PREDICATE OVER NOTHING, which suits a caller holding the entity already but not one whose entity is
   * produced inside the boundary — a product resolved from an identifier is exactly that case. Here the
   * gate is a function OF the work's own result, so the caller answers "did this end with accumulated
   * findings?" about the very object the transaction produced. That is the shape
   * `model/service/ProductService.cfc:L286-L288` has: re-read `hasErrors()` on the product AFTER SKU
   * creation has had its chance to record findings on it, then keep the work only if it is still clean.
   *
   * ⛔ IT ADDS NO SECOND SETTLEMENT MECHANISM. The whole body is a delegation to `run`: the acquire,
   * begin, commit-or-roll-back and release sequence, the roll-back-and-reject on accumulated errors, the
   * re-throw of the work's own failure unchanged, and the release-on-every-path guarantee are all
   * `run`'s, unmodified. Nothing here retries, nothing here recovers, and no boundary state is retained
   * after it closes (M7).
   *
   * ⚠️ THE GATE IS BRIDGED THROUGH A CLOSURE, AND A GATE CONSULTED BEFORE THE WORK SETTLED RAISES
   * RATHER THAN DEFAULTING TO "CLEAN". `run` invokes its predicate only after the work has resolved, so
   * the slot below is always filled by then; if that ever stopped being true, defaulting to `commit`
   * would keep writes the caller never approved. Raising instead lands inside `run`'s own failure path,
   * which rolls back — the safe direction — and no legacy message is reused for it.
   *
   * @typeParam TGraph - The collaborator graph this transaction's work runs against.
   * @typeParam TResult - Whatever the unit of work produces.
   * @param buildGraph - Constructs the collaborators from the scope. It must pass `scope.executor` to
   *   every repository it builds and must capture no executor from anywhere else; that is the single
   *   obligation on which M6's visibility guarantee rests.
   * @param work - The unit of work, run against the graph just built.
   * @param reportErrors - The M5 gate, asked about the work's own result. Answer `true` when the produced
   *   entity carries accumulated validation findings.
   * @returns The unit of work's result, once the transaction has committed.
   * @throws {DomainError} When `reportErrors` answers `true`; the transaction is rolled back first.
   * @throws The work's own failure, unchanged, after the transaction has been rolled back.
   */
  public async runScoped<TGraph, TResult>(
    buildGraph: (scope: TransactionScope) => TGraph,
    work: (graph: TGraph) => Promise<TResult>,
    reportErrors: (result: TResult) => boolean,
  ): Promise<TResult> {
    /* Written as a one-member holder rather than a bare `TResult | undefined`, so a work that legitimately
     * produces `undefined` is still distinguishable from a work that has not settled yet. */
    let settled: { readonly result: TResult } | undefined;

    return this.run(
      async (scope) => {
        const result = await work(buildGraph(scope));

        settled = { result };

        return result;
      },
      () => {
        if (settled === undefined) {
          throw new DomainError(
            'The commit gate was consulted before the unit of work settled, so the error state it ' +
              'reports on does not exist yet and nothing may be committed.',
            { context: { member: 'UnitOfWork.runScoped' } },
          );
        }

        return reportErrors(settled.result);
      },
    );
  }

  /**
   * Runs one independent transaction per item, strictly sequentially, in the order given.
   *
   * TODO(parity) model/dao/ProductDAO.cfc:L176-L177 — THE IMPORTER COMMITS ONCE PER ROW AND THAT IS
   * PRESERVED, NOT IMPROVED. :L176 opens the record loop and `transaction{` opens INSIDE it at :L177;
   * the brace cascade closes the row transaction at :L284 and the loop at :L285. AAP 0.6.6: "Each row
   * commits independently, so a mid-file failure leaves a partially imported catalog."
   *
   * SO A MID-LIST FAILURE LEAVES THE EARLIER ITEMS COMMITTED. That partial outcome is OBSERVABLE
   * LEGACY BEHAVIOUR and it is required. Collapsing this into one atomic import would be an
   * enhancement, which AAP 0.8.2 Guideline 4 forbids, and it would change what an operator finds in
   * the catalog after a bad file.
   *
   * STRICTLY SEQUENTIAL, WITH NO EXCEPTIONS. One item's transaction is begun only after the previous
   * item's has settled. There is no concurrent settlement of any kind, no concurrency limit to tune,
   * no batching and no coalescing of items into a shared transaction. Sequencing is required twice
   * over: by M3, because each row's commit must be independent and ordered, and by M6, because write
   * order is behaviour — the combination engine's odometer order determines both the SKU set and the
   * order uniqueness validation observes its siblings in.
   *
   * ONE CONNECTION IS CHECKED OUT FOR THE WHOLE LIST, NOT ONE PER ITEM — AND THAT IS A FIDELITY
   * IMPROVEMENT AS WELL AS A COST ONE. Each item still gets its OWN transaction, begun and settled
   * independently, so M3 is untouched: a mid-list failure still leaves the earlier items committed and
   * still attempts no further item. What changes is that the connection is borrowed once and disposed
   * of once instead of being returned to the pool and re-borrowed between every pair of rows. A
   * thousand-row import stops making a thousand checkout/release round trips against a pool that
   * `.env.example` documents as holding a single connection, and — because every item now
   * demonstrably runs on the SAME connection — the read-back ordering M6 requires becomes a property
   * of the boundary rather than something a one-connection pool happened to provide.
   *
   * THE SEQUENCE ITSELF IS NOT DUPLICATED. Both this member and {@link UnitOfWork.run} settle through
   * the one module-private {@link runTransaction}, with an always-false gate here because the legacy
   * per-row transaction carries NO error condition — a row either completes and commits, or a failure
   * propagates and the transaction is abandoned.
   *
   * @typeParam TItem - The item type, one per independent transaction.
   * @typeParam TResult - What each item's work produces.
   * @param items - The items, in the order they must be processed — a materialised read-only list or a
   *   lazy {@link PerItemSource}. This member never sorts, filters or reorders them, which is why a
   *   list is accepted read-only and why a lazy source must already be in order.
   * @param work - The per-item unit of work. It receives the item and that item's own
   *   {@link TransactionScope}; a scope is never shared between items, because their transactions are
   *   not shared either.
   * @returns One result per item, in item order — for a list that completed in full.
   * @throws Whatever an item's work threw, unchanged, after that item's transaction has been rolled
   *   back. Items already committed stay committed and no further item is attempted.
   */
  public async runPerItem<TItem, TResult>(
    items: PerItemSource<TItem>,
    work: (item: TItem, scope: TransactionScope) => Promise<TResult>,
  ): Promise<TResult[]> {
    const results: TResult[] = [];

    await this.runEachItem(items, work, (result) => {
      results.push(result);
    });

    return results;
  }

  /**
   * Runs one independent transaction per item, sequentially, and collects NOTHING.
   *
   * THE SAME BOUNDARY AS {@link UnitOfWork.runPerItem} AND A DIFFERENT MEMORY PROFILE, WHICH IS WHY IT
   * IS A SEPARATE MEMBER RATHER THAN AN OPTION. The importer's per-row work produces no value —
   * `model/dao/ProductDAO.cfc:L177-L284` writes the row and moves on, returning nothing — so calling
   * the collecting member would build an array holding one discarded entry per row of the file and
   * keep it alive until the whole import finished. Over a large catalog file that array is pure
   * overhead proportional to the row count, and it exists only because the collecting member's return
   * type promises a result per item.
   *
   * Behaviour is otherwise IDENTICAL, deliberately and by construction: the same single checkout, the
   * same independent transaction per item, the same strict ordering, the same first-failure semantics
   * and the same partial commits (M3). Both members run through the same private loop, so the two
   * cannot diverge.
   *
   * ⭐ AND THIS IS THE MEMBER THE IMPORTER STREAMS INTO. Because it retains nothing per item, pairing it
   * with a lazy {@link PerItemSource} means neither the boundary nor the caller holds the file: the row
   * currently in its transaction is the only row alive. The collecting sibling cannot offer that, since
   * its return type promises one result per item and therefore an array as long as the source.
   *
   * @typeParam TItem - The item type, one per independent transaction.
   * @param items - The items, in the order they must be processed — a materialised read-only list or a
   *   lazy {@link PerItemSource}.
   * @param work - The per-item unit of work, whose result is not retained.
   * @throws Whatever an item's work threw, unchanged, after that item's transaction has been rolled
   *   back. Items already committed stay committed and no further item is attempted.
   */
  public async runPerItemWithoutResults<TItem>(
    items: PerItemSource<TItem>,
    work: (item: TItem, scope: TransactionScope) => Promise<void>,
  ): Promise<void> {
    await this.runEachItem(items, work, undefined);
  }

  /**
   * The one per-item loop, shared by the collecting and non-collecting members.
   *
   * ⚠️ AN EMPTY SOURCE CHECKS NOTHING OUT AT ALL, AND THAT PROPERTY IS NOW STRUCTURAL RATHER THAN A
   * LENGTH TEST. It used to be obtained by returning early on `items.length === 0`, which a lazy source
   * cannot answer without being consumed. The checkout is therefore performed ON DEMAND, immediately
   * before the FIRST item's transaction begins, so a source that yields nothing still borrows nothing:
   * borrowing a connection in order to run zero transactions on it would be a pool round trip for no
   * statement, and the importer legitimately reaches this member with no rows at all — a header-only
   * file, or the `.xls` branch that reads none. The `finally` releases only when a connection was
   * actually obtained, for the same reason.
   *
   * ⚠️ EVERY OTHER GUARANTEE IS UNCHANGED, AND DELIBERATELY SO. Still ONE checkout for the whole source
   * rather than one per item; still one independent transaction per item; still strictly sequential,
   * each transaction begun only after the previous has settled; still first-failure, with earlier items
   * committed and no later item attempted (M3); still one release. Widening the parameter changes WHEN
   * an item becomes known, never what happens to it.
   *
   * The collector runs AFTER the item's transaction has committed, mirroring
   * {@link UnitOfWork.run}'s guarantee that a result is only ever handed back for work that was kept.
   *
   * @typeParam TItem - The item type.
   * @typeParam TResult - What each item's work produces; discarded when no collector is supplied.
   * @param items - The items, in order. Either a materialised read-only list or a lazy source.
   * @param work - The per-item unit of work.
   * @param collect - Receives each committed item's result, or `undefined` to retain nothing.
   */
  private async runEachItem<TItem, TResult>(
    items: PerItemSource<TItem>,
    work: (item: TItem, scope: TransactionScope) => Promise<TResult>,
    collect: ((result: TResult) => void) | undefined,
  ): Promise<void> {
    let connection: TransactionalStatementRunner | undefined;
    const state: ConnectionState = { knownClean: true };

    try {
      /*
       * `for await` consumes a materialised array and a lazy source through the same statement, so the
       * two cases cannot drift apart into two loops with two sets of settlement semantics. A synchronous
       * iterable yields synchronously here; the `await` per step is what a lazy source needs, and it
       * introduces no concurrency for either.
       */
      for await (const item of items) {
        // The first item pays for the checkout; every later item reuses it. See the note above.
        connection ??= await this.pool.getConnection();

        /*
         * Awaited inside the loop on purpose. This is the whole point of the member, and it is the one
         * place in this file where a well-meant concurrent settlement would destroy both M3's per-row
         * commit semantics and M6's insert ordering in a single stroke.
         */
        const result = await runTransaction(
          connection,
          state,
          (scope) => work(item, scope),
          NO_ACCUMULATED_ERRORS,
        );

        if (collect !== undefined) {
          collect(result);
        }
      }
    } finally {
      if (connection !== undefined) {
        returnConnection(connection, state);
      }
    }
  }

  /**
   * Runs work with NO transaction at all, on the pool rather than on a checked-out connection.
   *
   * TODO(parity) model/dao/ProductDAO.cfc:L287-L325 — THIS MEMBER EXISTS FOR EXACTLY TWO LEGACY
   * STATEMENTS AND FOR NOTHING ELSE. After the import loop and its per-row transaction have both
   * closed at :L284-L285, the importer runs two bulk back-fills before `loadDataFromFile` ends at
   * :L326: :L287-L302 sets the default SKU on every product that still lacks one, and :L303-L325 sets
   * each SKU's image file from its product. NEITHER IS INSIDE A TRANSACTION. The importer's real shape
   * is therefore N single-row transactions followed by two untransacted statements, and preserving that
   * means NOT wrapping the back-fills — wrapping them would make the import partially atomic in a way
   * the legacy never was.
   *
   * IT IS NOT A SHORTCUT AND MUST NEVER BE USED AS ONE. Anything that needs the read-back visibility
   * M6 requires — anything at all in the SKU-creation path — belongs in {@link UnitOfWork.run}. Work
   * routed through here runs each statement on whichever pooled connection is free, so two statements
   * are not even guaranteed to share a connection, let alone a transaction.
   *
   * No connection is checked out and none is released, because none is borrowed: the executor is bound
   * to the pool, which is also why nothing here begins, commits or rolls back anything.
   *
   * IT HANDS OUT THE SAME READ-AND-WRITE PAIR A BOUNDARY DOES, and it has to: both back-fills are
   * `UPDATE` statements. `model/dao/ProductDAO.cfc:L302` executes the first and `:L325` the second, and
   * the affected-row count each returns is the only signal a caller gets that the statement matched
   * anything. What differs here is not the executor's shape but what it is bound to — the pool rather
   * than a checked-out connection — which is precisely why nothing routed through here has the
   * visibility guarantee {@link UnitOfWork.run} provides.
   *
   * @typeParam T - Whatever the work produces.
   * @param work - The untransacted work. It receives a pool-bound {@link ReadWriteSqlExecutor}.
   * @returns Whatever the work produced.
   * @throws Whatever the work threw, unchanged. There is no transaction to settle, so nothing is
   *   rolled back and nothing needs to be.
   */
  public async runWithoutTransaction<T>(
    work: (executor: TransactionalSqlExecutor) => Promise<T>,
  ): Promise<T> {
    /*
     * Awaited rather than returned bare so that a callback which throws SYNCHRONOUSLY surfaces as a
     * rejection, exactly as it would from the two transactional members. Uniform failure semantics
     * across the three boundary shapes is worth one microtask.
     */
    return await work(createExecutor(this.pool));
  }

  /**
   * Assigns an entity its FIRST sort order — the missing half of the block this class owns.
   *
   * PORT OF `org/Hibachi/HibachiEntity.cfc:L637-L647`, the `preInsert()` seeding step:
   *
   *   if(structKeyExists(this,"setSortOrder")) {
   *     var metaData = getPropertyMetaData("sortOrder");
   *     var topSortOrder = 0;
   *     if(structKeyExists(metaData, "sortContext") && structKeyExists(variables, metaData.sortContext)) {
   *       topSortOrder = ...getTableTopSortOrder( tableName=..., contextIDColumn=..., contextIDValue=... );
   *     } else {
   *       topSortOrder = ...getTableTopSortOrder( tableName=... );
   *     }
   *     setSortOrder( topSortOrder + 1 );
   *   }
   *
   * ⭐ `topSortOrder + 1`, AND THE `+ 1` IS WHY THE FIRST ROW GETS 1 RATHER THAN 0. `:L153-L157` projects
   * `COALESCE(max(sortOrder), 0)`, so an EMPTY table reads zero and the first entity seeds to 1. That
   * arithmetic is reproduced rather than re-derived, because `sortOrder` is an exponent in the sorted-SKU
   * ordering at `model/dao/SkuDAO.cfc:L195` and an off-by-one there reorders SKUs silently.
   *
   * ⭐ WHICH BRANCH IS TAKEN IS THE CALLER'S DECLARATION, NOT A LOOKUP HERE. `:L641` decides by reading
   * the property's ORM metadata for a `sortContext` attribute and checking that the named context
   * property is SET. There is no property metadata to read at runtime in the port, so the scope arrives
   * as an argument: supplied means the scoped read at `:L642`, absent means the whole-table read at
   * `:L644`. `OptionGroup` declares no `sortContext` and therefore passes none — it seeds across its
   * entire table; `Option` declares `sortContext="optionGroup"` and passes its group's identifier.
   *
   * ⚠️ IT ASSIGNS UNCONDITIONALLY, EXACTLY AS `:L646` DOES. `:L637-L647` runs inside `preInsert()` and
   * carries no "only if absent" guard, so an entity that somehow arrived with a value has it REPLACED on
   * insert. Adding an idempotency guard here would be an enhancement the legacy does not have, and it
   * would also mask the one case where a caller seeded from the wrong table. Callers must therefore invoke
   * this on INSERT only — which is what `preInsert` means — and never on update.
   *
   * ⚠️ AND IT RUNS ON THE EXECUTOR IT IS GIVEN. The read must share the connection and the transaction of
   * the insert it is seeding, or two concurrent inserts read the same maximum and collide (M6). Passing an
   * executor rather than reaching for the pool is what makes that the caller's guarantee.
   *
   * @param executor - the transaction-scoped executor the insert itself will use.
   * @param tableName - the entity's physical table, whitelisted by {@link assertTableName}.
   * @param entity - the entity to seed; its `sortOrder` slot is written in place.
   * @param scope - the `sortContext` scope when the entity declares one; omitted for a whole-table seed.
   * @returns the assigned position, which is also now on the entity.
   * @throws {DataIntegrityError} when the maximum could not be read — see
   *   {@link UnitOfWork.getTableTopSortOrder}.
   */
  public async seedFirstSortOrder(
    executor: SqlExecutor,
    tableName: string,
    entity: SortOrderSeedTarget,
    scope?: SortOrderSeedScope,
  ): Promise<number> {
    /* `:L640` initialises `topSortOrder` to zero and then overwrites it from one of the two reads, so the
     * zero is never the value that reaches `:L646` — it is dead in the source and is not reproduced. */
    const topSortOrder =
      scope === undefined
        ? // `:L644` — no `sortContext`, so the maximum is taken across the WHOLE table.
          await this.getTableTopSortOrder(executor, tableName)
        : // `:L642` — scoped to the parent the context names.
          await this.getTableTopSortOrder(
            executor,
            tableName,
            scope.contextIDColumn,
            scope.contextIDValue,
          );

    // `:L646` — `setSortOrder( topSortOrder + 1 )`.
    const assigned = topSortOrder + 1;
    entity.sortOrder = assigned;

    return assigned;
  }

  /**
   * Reads the highest sort-order value in a table, optionally scoped to one parent.
   *
   * WORK ITEM W1, AND THIS FILE IS ITS ONLY HOME. `org/Hibachi/HibachiEntity.cfc:L637-L647` seeds a new
   * record's position from the current maximum during the ORM insert lifecycle, and both in-scope
   * entities that carry a position — the option and its group — assign that seeding here, while the
   * shared audit base explicitly excludes it. There is nowhere else for it to live.
   *
   * The legacy member is `org/Hibachi/HibachiDAO.cfc:L149-L168`, reached through the service delegate at
   * `org/Hibachi/HibachiService.cfc:L777-L779`:
   *   :L150      `tableName`, required
   *   :L151-L152 `contextIDColumn` and `contextIDValue`, BOTH optional
   *   :L157-L160 `SELECT COALESCE(max(sortOrder), 0) as topSortOrder FROM <tableName>`
   *   :L161-L164 an optional `WHERE`, guarded by a presence test on BOTH context arguments, whose value
   *              is the one thing in the statement that is BOUND rather than interpolated
   *   :L167      returns the aliased column
   *
   * TWO INTERPOLATED IDENTIFIERS AND ONE BOUND VALUE. A `?` binds a value and can never substitute an
   * identifier, so the table and the scoping column are validated against the schema whitelist
   * ({@link assertTableName}, then {@link assertColumnName} against that table) and the scoping value is
   * bound. `sortOrder` and the projection alias are literals in the legacy statement rather than
   * interpolations, so they stay literals here; naming a table that has no such column fails at the
   * database exactly as the legacy statement did.
   *
   * THE EMPTY-TABLE ANSWER IS ZERO, NOT NULL — that is what the `COALESCE` at :L158 is for — so the
   * first position a table ever seeds is ONE, from the `+ 1` at `org/Hibachi/HibachiEntity.cfc:L646`.
   * See {@link readTopSortOrder} for why an unreadable result raises instead of defaulting to that zero.
   *
   * WHICH VARIANT EACH IN-SCOPE ENTITY USES, byte-verified:
   *   - `model/entity/Option.cfc:L56` declares `sortContext="optionGroup"`, so an option's position is
   *     scoped BY ITS PARENT GROUP: `org/Hibachi/HibachiEntity.cfc:L642` passes all three arguments,
   *     taking the column from the parent's primary-identifier property name and the value from the
   *     parent's primary-identifier value. It is the ONLY `sortContext` in scope, of five repository-wide.
   *   - `model/entity/OptionGroup.cfc` declares none, so a group's position is a WHOLE-TABLE maximum:
   *     `org/Hibachi/HibachiEntity.cfc:L644` passes the table name alone.
   *
   * There is no `setSortOrder` function to look for anywhere in the legacy tree: the assignment at
   * :L646 reaches an accessor the framework generates from the property declaration. Noted so nobody
   * hunts for a missing implementation.
   *
   * ⭐ SEC-HARDENING (D18-CLASS) — THE READ IS LOCKING, WHICH CLOSES REVIEW FINDING F8 (CWE-367).
   * ------------------------------------------------------------------------------------------------
   * THE DEFECT. This is the READ half of a read-then-write: the caller reads the current maximum and
   * then writes `maximum + 1` (`org/Hibachi/HibachiEntity.cfc:L646`). Two invocations that interleave
   * between the read and the write both observe the same maximum and both seed the SAME position, so
   * two options — or two option groups — silently share a place in the ordering. Nothing anywhere
   * detects it: `sortOrder` carries no unique constraint in either entity, so there is no second
   * mechanism behind the read, and the duplicate simply persists.
   *
   * ⛔ AN EARLIER REVISION OF THIS BLOCK DECLARED THE RACE UNREPAIRABLE HERE — "no lock, no advisory
   * lock, no locking read, no second attempt" — ON AAP §0.8.2 GUIDELINE 4 AND AAP §0.7.3 S9 GROUNDS.
   * That reading is WITHDRAWN, and it was wrong in one specific way: it treated a locking read as an
   * ENHANCEMENT, when a locking read changes no result. `FOR UPDATE` returns precisely the row the
   * same aggregate returns without it — same projection, same `COALESCE`, same scope, same number. Its
   * only effect is that a second transaction asking the same question WAITS for the first to settle
   * rather than reading past it. Nothing single-threaded can observe the difference, and that is the
   * exact licensing property D18 (AAP §0.6.7.7) establishes: a divergence that removes a defect class
   * without changing an outcome for any input the legacy accepted.
   *
   * ⭐ AND THE LEGACY CODEBASE ALREADY SERIALIZES THIS EXACT KIND OF PATH. `updateRecordSortOrder`, the
   * member three functions below the origin in the same file, wraps its own read-then-write over the
   * same column in `<cflock timeout="60" name="updateSortOrder#arguments.tableName#">` at
   * `org/Hibachi/HibachiDAO.cfc:L182`, around a `<cftransaction>` at `:L183`, closing at `:L263-L264`.
   * An exclusive lock keyed by TABLE NAME over a sort-order read-then-write is therefore this
   * codebase's own idiom, not something imported from outside it. The earlier revision cited that same
   * `:L182` lock as evidence that its ABSENCE here was faithful; the citation is kept and the
   * inference reversed, because reproducing a codebase's own concurrency idiom on the path that needs
   * it is closer to the original than declining to.
   *
   * ⚠️ WHAT IS DELIBERATELY *NOT* CARRIED ACROSS FROM `:L182`: THE NUMBER. The legacy `timeout="60"` is
   * a CFML application-scope lock timeout with no MySQL counterpart, and AAP §0.7.3 S9 and IR-12 forbid
   * inventing a numeric control the source does not state for this path. No timeout, no retry count and
   * no backoff appears here. Whatever lock-wait behaviour the database is configured with applies,
   * unnamed and unmodified, and a lock-wait failure surfaces as the driver's own error — see
   * {@link createExecutor}, which translates ONLY a duplicate key and passes every other driver failure
   * through untouched.
   *
   * ⚠️ IT IS UNCONDITIONAL, AND THAT DIFFERS DELIBERATELY FROM THE SIBLING FIX IN
   * `./UniquePropertyChecker`, WHERE LOCKING IS OPT-IN. Two reasons, both about this member specifically.
   * First, it has exactly ONE purpose: seeding a position during an insert
   * (`org/Hibachi/HibachiEntity.cfc:L637-L647`), so every real call is the read half of a write and
   * there is no read-only use to hold at byte parity. Second, that class had a free signal available —
   * `withExecutor` exists for no purpose other than adopting a boundary — whereas this member takes its
   * executor as a parameter, so an opt-in would have to be a new argument that a caller could quietly
   * omit and thereby opt out of the fix. For a member with one purpose, an opt-out is a worse posture
   * than a lock the degenerate case does not need.
   *
   * ⚠️ THE CONSEQUENCE FOR A POOL-BOUND CALL, STATED PLAINLY RATHER THAN GLOSSED. Outside any
   * transaction the lock is acquired and released at statement end, so it protects nothing — it is
   * neither harmful nor useful there, and the returned number is identical. Serialization is real only
   * when the executor is a boundary's `scope.executor` and the write follows inside that same boundary,
   * which is how every seeding call is meant to be issued.
   *
   * IT TAKES AN EXECUTOR RATHER THAN USING THE POOL, and that is the point. Seeding happens during an
   * insert, so passing a boundary's `scope.executor` both makes this read observe the sibling rows that
   * boundary has already written — the same visibility guarantee M6 turns on — and makes the lock above
   * span the read and the write. Passing a pool-bound executor remains legal, with the caveat above.
   *
   * @param executor - Where to run the read. Inside a boundary this MUST be the boundary's
   *   `scope.executor`.
   * @param tableName - The table to read, in any of the three vocabularies the whitelist accepts. The
   *   lifecycle sites pass the physical name; see the D22 note above.
   * @returns The highest stored position, or zero when the table — or the scope — holds no rows.
   */
  public getTableTopSortOrder(executor: SqlExecutor, tableName: string): Promise<number>;

  /**
   * Reads the highest sort-order value within one parent's scope.
   *
   * The context-scoped variant, used by `model/entity/Option.cfc:L56` through
   * `org/Hibachi/HibachiEntity.cfc:L642`. See the overload above for the full account.
   *
   * @param executor - Where to run the read. Inside a boundary this MUST be the boundary's
   *   `scope.executor`.
   * @param tableName - The table to read.
   * @param contextIDColumn - The scoping column, validated against that table's declared columns.
   * @param contextIDValue - The scoping value, BOUND to a placeholder and never interpolated.
   * @returns The highest stored position within the scope, or zero when the scope holds no rows.
   */
  public getTableTopSortOrder(
    executor: SqlExecutor,
    tableName: string,
    contextIDColumn: string,
    contextIDValue: string,
  ): Promise<number>;

  public async getTableTopSortOrder(
    executor: SqlExecutor,
    tableName: string,
    contextIDColumn?: string,
    contextIDValue?: string,
  ): Promise<number> {
    const table = assertTableName(tableName);

    const columnSupplied = contextIDColumn !== undefined;

    /*
     * TODO(parity) org/Hibachi/HibachiDAO.cfc:L159-L164 — A HALF-SUPPLIED SCOPE READS THE WHOLE TABLE,
     * SILENTLY, AND THAT IS THE LEGACY BEHAVIOUR REPRODUCED RATHER THAN REPAIRED. Both context
     * arguments are declared OPTIONAL at :L150-L151, and :L159 guards the `WHERE` clause with
     * `structKeyExists(arguments, "contextIDColumn") && structKeyExists(arguments, "contextIDValue")`.
     * The `&&` is the whole point: supplying ONE alone emits no clause at all and returns a WHOLE-TABLE
     * maximum under the appearance of a scoped read. For the one in-scope scoped entity that would seed
     * an option's position from the highest position in the entire table, with no error anywhere.
     *
     * ⛔ AN EARLIER REVISION RAISED HERE INSTEAD, AND DESCRIBED ITSELF AS "A DELIBERATE, DECLARED
     * TIGHTENING". It is WITHDRAWN (F12). Refusing a read the legacy performed is a DIFFERENT OUTCOME,
     * and D18 (AAP 0.6.7.7) is the SOLE declared behaviour-hardening exception — a precedent only for a
     * divergence that removes a flaw class WITHOUT changing an outcome. AAP 0.8.2 Guideline 4 forbids
     * enhancement beyond what the migration requires, and AAP 0.6.7 governs with "preserve and
     * annotate, do not repair".
     *
     * ⭐ WHAT PREVENTS A HALF-SUPPLIED SCOPE NOW IS THE TYPE SYSTEM RATHER THAN A RUNTIME REFUSAL, AND
     * THAT IS WHY NOTHING OBSERVABLE CHANGED. The two declared overloads above admit the scoping column
     * and its value only TOGETHER, so a half-supplied call does not compile. A compile-time guarantee
     * has no runtime behaviour to diverge from the legacy's; the raise did.
     *
     * ⚠️ THE RESIDUAL EXPOSURE IS FLAGGED, NOT CLOSED (AAP 0.7.3 S8). A caller arriving without types
     * would receive the legacy's silent whole-table maximum, which is exactly what the legacy gave it.
     */

    /*
     * Composed exactly as org/Hibachi/HibachiDAO.cfc:L157-L164 composes it, including the `COALESCE`
     * that turns an empty scope into a zero, and including the fact that the `WHERE` clause is present
     * only when a scope was supplied.
     */
    let sql = `SELECT COALESCE(max(sortOrder), 0) as ${TOP_SORT_ORDER_ALIAS} FROM ${table}`;
    const params: unknown[] = [];

    if (contextIDColumn !== undefined && contextIDValue !== undefined) {
      sql += ` WHERE ${assertColumnName(table, contextIDColumn)} = ?`;
      params.push(contextIDValue);
    }

    /*
     * ⭐ SEC-HARDENING (D18-CLASS) — F8. Appended LAST, after the optional `WHERE`, because MySQL
     * requires the locking clause at the end of the statement. Both variants lock: a scoped read locks
     * the scope it read, a whole-table read locks the table it read, and each is the span the following
     * write needs held. See the block on the first overload for the adjudication in full.
     */
    sql += LOCKING_READ_SUFFIX;

    const rows = await executor.execute(sql, params);

    /*
     * Checked rather than trusted because `noUncheckedIndexedAccess` types an indexed read as possibly
     * absent — which is the honest type of "the first row of a result set that may be empty". An
     * aggregate without a `GROUP BY` always produces exactly one row, so no row at all means the
     * statement did not run as composed, and that RAISES rather than degrading to the zero the
     * `COALESCE` would have produced.
     */
    const topRow: MySqlRow | undefined = rows[0];

    if (topRow === undefined) {
      throw new DataIntegrityError(
        'The sort-order statement produced no row, so there was no current maximum to read.',
        { context: { table, scoped: columnSupplied } },
      );
    }

    return readTopSortOrder(topRow);
  }
}
