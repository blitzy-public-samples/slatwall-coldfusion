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
 *      connection-bound {@link SqlExecutor} and nothing else, the pooled connection itself is never
 *      handed out, and no member of this class returns one. A read issued against the pool from
 *      inside a boundary would compile, type-check, pass every test that does not specifically probe
 *      uncommitted-sibling visibility, and silently change which SKUs the combination engine accepts.
 *   2. WRITE ORDER IS BEHAVIOUR. The odometer enumeration order of the combination engine determines
 *      both the generated SKU set and, through this loop, the order uniqueness validation observes
 *      its siblings in. Nothing here reorders, coalesces, batches or defers a write; there is no
 *      write buffer, no flush-at-end and no concurrent settlement of anything, anywhere in this file.
 *   3. THE BOUNDARY IS SUBSTITUTABLE. AAP 0.4.1.12 requires slatwall-ts/test/services/SkuService.test.ts
 *      to carry a combination-batch test that would fail under either naive ordering, and AAP 0.6.5.2
 *      records that every such test is NET-NEW with no mocking library available. Both are only
 *      possible because a caller depends on {@link SqlExecutor}, which a plain object literal can
 *      satisfy, so the call sequence is inspectable without a database.
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
 * THE REGISTERS ARE CLOSED
 * ------------------------------------------------------------------------------------------------
 * This file mints no new defect or mismatch identifier. It owns M3, M5 and M6, is bound by M7, cites
 * D22, M1, M2 and M8, and records every other finding by `path:Lnnn` locator alone. D18 — the single
 * declared parameterization-hardening exception — belongs exclusively to
 * src/adapters/mysql/MySqlProductRepository.ts and is not claimed here.
 * ============================================================================================== */

import { DataIntegrityError, DomainError } from '../../errors/DomainError';
import { assertColumnName, assertTableName } from './QueryRunner';
import { toRows } from './rowMappers';

import type { SqlExecutor } from './QueryRunner';
import type { MySqlRow } from './rowMappers';
import type { Connection, ExecuteValues, Pool, PoolConnection } from 'mysql2/promise';

/* ================================================================================================
 * TODO(parity) D22 — org/Hibachi/HibachiEntity.cfc:L642 AND :L644 HAND THIS FILE A TABLE NAME IN THE
 * PHYSICAL VOCABULARY, AND IT IS STILL VALIDATED RATHER THAN TRUSTED
 * ================================================================================================
 * The legacy tree speaks two table vocabularies at once and both are correct; the full account, the
 * six entity rows and the five framework prefixing sites are documented in ./QueryRunner, which owns
 * D22. What matters at THIS file's one statement-composing member is which vocabulary arrives:
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
function isBindableValue(
  candidate: unknown,
): candidate is string | number | bigint | boolean | Date | null {
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
function toBoundParameters(params: readonly unknown[]): ExecuteValues[] {
  const bound: ExecuteValues[] = [];

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

/**
 * Builds the only execution surface this file ever hands out.
 *
 * THIS FUNCTION IS THE M6 DEFENCE, EXPRESSED STRUCTURALLY. The driver object it closes over is either
 * a pooled connection with a transaction open on it or the pool itself, and in neither case does it
 * escape: the returned value exposes one member, `execute`, and carries no reference a caller can
 * reach the driver through. A repository handed this object cannot begin, commit or roll back
 * anything, cannot release the connection under the boundary that owns it, and — crucially — cannot
 * route a read back through the pool and out of the transaction it is supposed to be inside.
 *
 * PREPARED EXECUTION ONLY. The driver's other execution member performs client-side text
 * substitution and is never reached from here — not as a fallback, not behind a flag and not for a
 * statement that happens to bind nothing (AAP 0.7.3 S2). Transaction control is likewise issued
 * through the driver's own transaction members and never as hand-built statement text.
 *
 * The parameter is typed as the driver's base connection type because both a pool and a pooled
 * connection are one, and because a union of the two would leave the overloaded `execute` member
 * uncallable. Nothing in the body depends on which arrived: that is precisely the property that lets
 * the same repository code run inside a boundary and outside one.
 *
 * The result is frozen so a consumer cannot substitute its own execution behaviour after receiving
 * it, and it is created per boundary rather than cached, so nothing outlives the transaction it
 * belongs to (M7).
 *
 * @param driver - The pooled connection the transaction was begun on, or the pool for the untransacted
 *   path.
 * @returns An executor bound to that driver object, and nothing else.
 */
function createExecutor(driver: Connection): SqlExecutor {
  return Object.freeze({
    execute: async (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> => {
      if (sql.trim().length === 0) {
        throw new DomainError(
          'A blank statement reached a transaction-scoped execution boundary, so there was nothing ' +
            'to prepare.',
          { context: { parameterCount: params.length } },
        );
      }

      const [driverResult] = await driver.execute(sql, toBoundParameters(params));

      return toRows(driverResult);
    },
  });
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
 * @param connection - The connection the transaction was begun on.
 * @param cause - Which path reached the roll-back, for the diagnostic record only.
 * @param abandonedFailure - The failure that abandoned the work, when there was one. It travels on the
 *   error's `context` so that a failed roll-back cannot swallow the reason the work stopped.
 * @throws {DomainError} When the roll-back itself fails. The roll-back failure becomes the error's
 *   `cause` and the abandoned failure travels on `context`, so neither is lost.
 */
async function rollBack(
  connection: PoolConnection,
  cause: RollbackCause,
  abandonedFailure?: unknown,
): Promise<void> {
  try {
    await connection.rollback();
  } catch (rollbackFailure) {
    throw new DomainError(
      'The transaction could not be rolled back after the work inside it was abandoned, so nothing ' +
        'can be reported about what the database retained.',
      {
        cause: rollbackFailure,
        /*
         * The abandoned failure is attached only when there was one, rather than assigned as
         * `undefined`, because `exactOptionalPropertyTypes` makes "absent" and "present and
         * undefined" different things and the honest statement here is "absent".
         */
        context:
          abandonedFailure === undefined
            ? { rolledBackBecause: cause }
            : { rolledBackBecause: cause, abandonedFailure },
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
 * @returns The work's result together with the settle decision.
 * @throws The work's own failure, unchanged, after the boundary has been rolled back. Nothing is
 *   wrapped, re-typed or re-messaged on this path: a caller catching a specific failure from its own
 *   work must still catch the same value.
 */
async function runWorkInside<T>(
  connection: PoolConnection,
  work: (scope: TransactionScope) => Promise<T>,
  hasErrors: () => boolean,
): Promise<CompletedWork<T>> {
  try {
    const result = await work(Object.freeze({ executor: createExecutor(connection) }));

    return { decision: hasErrors() ? 'rollback' : 'commit', result };
  } catch (failure) {
    await rollBack(connection, 'workFailure', failure);

    throw failure;
  }
}

/* ================================================================================================
 * THE PUBLIC SURFACE
 * ============================================================================================== */

/**
 * Everything a unit of work is allowed to reach while its transaction is open.
 *
 * ONE MEMBER, AND THE NARROWNESS IS THE FEATURE. AAP 0.6.2's mandate is that "each SKU's insert
 * [is] visible to the next SKU's uniqueness read within the same transaction", and that guarantee
 * only holds while every statement runs on the connection the transaction was begun on. Carrying the
 * executor and nothing else means a caller inside a boundary has no way to reach the pool, no way to
 * settle the transaction early and no way to return the connection while work is still in flight —
 * so the guarantee is a property of the type rather than of the caller's care.
 *
 * The member is typed {@link SqlExecutor}, the same one-member contract every repository in this
 * folder declares as its dependency, so IDENTICAL REPOSITORY CODE RUNS INSIDE A BOUNDARY AND OUTSIDE
 * ONE. That is what makes M6 testable at all: a plain object literal satisfies the contract, so a
 * test can record the exact statement sequence a combination batch produces without a database
 * (AAP 0.6.5.2 — every repository test in this port is net-new and no mocking library is available).
 *
 * There is deliberately no transaction handle, no identifier, no started-at stamp, no nesting depth
 * and no scratch space on this object. Adding mutable space here would reintroduce exactly the
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
export interface TransactionScope {
  /** The only execution surface inside the boundary. Every read and every write goes through it. */
  readonly executor: SqlExecutor;
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
 * Plus one read this class owns outright, {@link UnitOfWork.getTableTopSortOrder}, because the
 * entity-lifecycle block that used it has no other home in the port.
 *
 * @example
 * ```ts
 * // src/config/container.ts — wired once, then injected downwards.
 * const unitOfWork = new UnitOfWork(pool);
 * ```
 */
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
   */
  private readonly pool: Pool;

  /**
   * @param pool - The pool to draw transactional connections from, supplied by the composition root.
   *   This class never builds one, never reads a credential and never resolves a connection target;
   *   contrast model/dao/ProductDAO.cfc:L155-L158, :L329-L332 and :L420, which each construct a
   *   credential-reading connection inside the data-access layer itself.
   */
  public constructor(pool: Pool) {
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
   * connection is still released, on this path as on every other.
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
    const connection: PoolConnection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const completed = await runWorkInside(connection, work, hasErrors);

      if (completed.decision === 'rollback') {
        await rollBack(connection, 'accumulatedErrors');

        throw new DomainError(
          'The unit of work was rolled back because the caller reported accumulated validation ' +
            'errors, so nothing it wrote was kept.',
          { context: { settledAs: completed.decision } },
        );
      }

      await connection.commit();

      return completed.result;
    } finally {
      /*
       * The last step of AAP 0.3.2's sequence, and it runs on EVERY path: after a commit, after a
       * roll-back, after a failed commit, after a failed roll-back and after a failure raised by the
       * work itself. A connection that is not returned is a connection the pool cannot re-use, and on
       * a warm container that is permanent.
       */
      connection.release();
    }
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
   * STRICTLY SEQUENTIAL, WITH NO EXCEPTIONS. One item is begun only after the previous item has
   * settled and its connection has been released. There is no concurrent settlement of any kind, no
   * concurrency limit to tune, no batching and no coalescing of items into a shared transaction.
   * Sequencing is required twice over: by M3, because each row's commit must be independent and
   * ordered, and by M6, because write order is behaviour — the combination engine's odometer order
   * determines both the SKU set and the order uniqueness validation observes its siblings in.
   *
   * IT DELEGATES TO {@link UnitOfWork.run} WITH AN ALWAYS-FALSE GATE, and the delegation is the honest
   * shape rather than a shortcut: the legacy per-row transaction carries NO error condition — a row
   * either completes and commits, or a failure propagates and the transaction is abandoned. Reusing
   * the same skeleton also keeps the acquire-and-release invariant in exactly one place.
   *
   * @typeParam TItem - The item type, one per independent transaction.
   * @typeParam TResult - What each item's work produces.
   * @param items - The items, in the order they must be processed. Read-only because this member never
   *   sorts, filters or reorders them.
   * @param work - The per-item unit of work. It receives the item and that item's own
   *   {@link TransactionScope}; a scope is never shared between items, because their transactions are
   *   not shared either.
   * @returns One result per item, in item order — for a list that completed in full.
   * @throws Whatever an item's work threw, unchanged, after that item's transaction has been rolled
   *   back. Items already committed stay committed and no further item is attempted.
   */
  public async runPerItem<TItem, TResult>(
    items: readonly TItem[],
    work: (item: TItem, scope: TransactionScope) => Promise<TResult>,
  ): Promise<TResult[]> {
    const results: TResult[] = [];

    for (const item of items) {
      /*
       * Awaited inside the loop on purpose. This is the whole point of the member, and it is the one
       * place in this file where a well-meant concurrent settlement would destroy both M3's per-row
       * commit semantics and M6's insert ordering in a single stroke.
       */
      results.push(await this.run((scope) => work(item, scope), NO_ACCUMULATED_ERRORS));
    }

    return results;
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
   * @typeParam T - Whatever the work produces.
   * @param work - The untransacted work. It receives a pool-bound {@link SqlExecutor}.
   * @returns Whatever the work produced.
   * @throws Whatever the work threw, unchanged. There is no transaction to settle, so nothing is
   *   rolled back and nothing needs to be.
   */
  public async runWithoutTransaction<T>(work: (executor: SqlExecutor) => Promise<T>): Promise<T> {
    /*
     * Awaited rather than returned bare so that a callback which throws SYNCHRONOUSLY surfaces as a
     * rejection, exactly as it would from the two transactional members. Uniform failure semantics
     * across the three boundary shapes is worth one microtask.
     */
    return await work(createExecutor(this.pool));
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
   * TODO(parity) org/Hibachi/HibachiDAO.cfc:L157-L164 — THIS IS A READ-THEN-WRITE SEQUENCE AND IS
   * THEREFORE INHERENTLY RACY. Two invocations that read the same maximum will seed the same position,
   * and the legacy code had exactly the same exposure. It is NOT repaired here: no lock, no advisory
   * lock, no locking read, no second attempt and no uniqueness constraint is added (AAP 0.8.2
   * Guideline 4, AAP 0.7.3 S9). Note that the legacy member's own sibling — the member at :L170-L215 —
   * DID take a named lock at :L182, which makes the absence of one here a faithful reproduction of the
   * read path rather than an omission.
   *
   * IT TAKES AN EXECUTOR RATHER THAN USING THE POOL, and that is the point. Seeding happens during an
   * insert, so passing a boundary's `scope.executor` makes this read observe the sibling rows that
   * boundary has already written — the same visibility guarantee M6 turns on. Passing a pool-bound
   * executor is equally legal for a read outside any boundary.
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
    const valueSupplied = contextIDValue !== undefined;

    /*
     * TODO(parity) org/Hibachi/HibachiDAO.cfc:L161-L164 — A HALF-SUPPLIED SCOPE RAISES HERE WHERE THE
     * LEGACY WAS SILENT, AND THAT IS A DELIBERATE, DECLARED TIGHTENING. The legacy guard tests both
     * context arguments together, so supplying one without the other simply emitted no `WHERE` clause
     * and returned a WHOLE-TABLE maximum under the appearance of a scoped read. For the one in-scope
     * scoped entity that would seed an option's position from the highest position in the entire table,
     * silently, with no error anywhere. The two declared overloads already make this unreachable from
     * typed code; this check closes the same door for a caller arriving without types.
     */
    if (columnSupplied !== valueSupplied) {
      throw new DomainError(
        'A scoped sort-order read needs both the scoping column and its value, or neither. Supplying ' +
          'one alone would silently read the whole table instead of the scope.',
        { context: { table, columnSupplied, valueSupplied } },
      );
    }

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
