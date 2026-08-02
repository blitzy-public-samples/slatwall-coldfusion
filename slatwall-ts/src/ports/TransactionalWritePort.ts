/**
 * The transaction boundary a write path runs inside — the port that replaces the legacy's request-end
 * commit.
 *
 * AAP authority: AAP §0.3.3 lists **Unit of Work** as the pattern that replaces "the implicit
 * request-end commit gated on `getORMHasErrors()`", and AAP §0.4.4 authorises
 * `slatwall-ts/src/ports/**` | CREATE. `src/adapters/mysql/UnitOfWork.ts` already implements the
 * mechanism; this file is the DECLARATION that lets a handler reach it without importing an adapter.
 *
 * =================================================================================================
 * WHY A PORT AND NOT A DIRECT CALL TO `UnitOfWork`
 * =================================================================================================
 * ⛔ A HANDLER MUST NOT IMPORT FROM `../adapters/**`. AAP §0.3.3 places `handlers` and `adapters` in
 * different layers of the hexagon and confines all AWS coupling to the handler layer; a handler that
 * imported `UnitOfWork` would couple the AWS boundary to MySQL and to `mysql2`'s `PoolConnection`, which
 * is the one direction the architecture exists to prevent. AAP §0.5.5 depends on that separation
 * concretely: it states a runtime migration touches four artefacts "with no change to `src/domain/**`,
 * `src/services/**`, `src/ports/**` or `src/adapters/**`", which only holds while the handler layer knows
 * nothing about the driver.
 *
 * ⭐ THE GRAPH IS A TYPE PARAMETER BECAUSE A TRANSACTION-SCOPED SERVICE IS A DIFFERENT OBJECT. This is
 * the part that a "just wrap the call in a transaction" reading gets wrong. A service holds its
 * repository, and a repository holds its executor, from the moment it is constructed — so the service a
 * handler captured at start-up is bound to the POOL, and calling it inside an open transaction would run
 * its statements on a DIFFERENT connection, outside that transaction. Nothing would fail; the writes
 * would simply not be part of the unit being committed, and a roll-back would leave them behind. The work
 * function therefore receives a graph BUILT FOR THAT TRANSACTION rather than closing over an ambient one,
 * and `TGraph` is generic so each handler declares only the capabilities its write path uses.
 *
 * =================================================================================================
 * WHAT THE TWO ARGUMENTS CORRESPOND TO IN THE LEGACY
 * =================================================================================================
 * The legacy commit is not a statement anyone wrote. Per AAP §0.6.6 M5, `flushAtRequestEnd=false` and
 * `Hibachi.cfc` performs a double `ormFlush()` at request end ONLY when the ORM reports no errors, so
 * every write in a request was kept or discarded together, decided by a predicate evaluated after the
 * work finished. `runWrite` is that shape made explicit: `work` is the request's writes and `hasErrors`
 * is the gate, evaluated once, after the work and before the commit.
 *
 * ⚠️ THE GATE IS A CALLBACK RATHER THAN A RETURNED FLAG, AND THAT IS FORCED BY WHERE ERRORS LIVE. In
 * this slice a batch's findings do NOT accumulate onto a single object: `src/services/SkuService.ts`
 * records at length that per-SKU rule findings stay on the SKU that produced them while branch
 * preconditions go to the product's bag, and that a product-level merge must not be reinstated because it
 * re-keys a SKU's `skuCode` finding onto the product and loses which SKU failed. A caller must therefore
 * be free to inspect the whole graph it just mutated, which a boolean returned from `work` cannot express
 * — the work's return value is the operation's own result, and for `createSkus` that result is `true`
 * unconditionally even when the batch failed.
 */

/**
 * Runs one unit of work inside one transaction, against a graph built for that transaction.
 *
 * ⚠️ IMPLEMENTATIONS OWN THE WHOLE LIFECYCLE AND MUST NOT LEAK IT. Acquire, begin, commit or roll back,
 * and DISPOSE OF the connection on every path — including when the work throws.
 * `src/adapters/mysql/UnitOfWork.ts` holds that sequence, and this contract deliberately exposes none of
 * it: a caller cannot commit early, cannot roll back explicitly and cannot reach the connection.
 *
 * ⛔ DISPOSAL IS NOT ALWAYS A RELEASE, and an implementation that made it one would be wrong rather than
 * merely simple. A connection whose begin, commit or roll-back ITSELF failed carries a transaction state
 * nobody can describe, so returning it to a warm pool hands the next invocation whatever was left open —
 * precisely the cross-invocation bleed M7 exists to prevent, and silent, because the next caller sees no
 * error. Such a connection must be taken out of service instead. Both branches are asserted against the
 * MySQL implementation in `test/adapters/UnitOfWork.test.ts`, and the structural double in
 * `test/support/inMemoryRepositories.ts` reproduces the same rule so a consumer suite cannot disagree
 * with the class about it.
 *
 * @typeParam TGraph - The transaction-scoped capabilities the work needs. Declared by the caller, so a
 *   write path depends on nothing wider than it uses.
 */
export interface TransactionalWriteRunner<TGraph> {
  /**
   * @param work - The writes, run inside an open transaction against a graph bound to it.
   * @param hasErrors - The commit gate, evaluated ONCE after `work` settles successfully. `true` rolls
   *   the transaction back and reports the roll-back to the caller as a failure; `false` commits. It must
   *   be free of side effects, and it must read the state `work` accumulated rather than re-deriving it.
   * @returns Whatever `work` produced — for a unit that was COMMITTED.
   * @throws When `work` throws, after rolling back; and when `hasErrors` reports accumulated findings,
   *   because a caller that received the work's value would otherwise be unable to tell a committed
   *   result from a discarded one. `createSkus` makes that concrete: it returns `true` even for a batch
   *   whose SKUs all failed validation, so its return value cannot distinguish the two outcomes.
   * @throws When a SETTLEMENT itself fails — the begin, the commit, or the roll-back that either of the
   *   two cases above asked for. A commit failure reaches the caller as the driver reported it, because
   *   that failure is the whole story; a roll-back failure is compound, so it is reported as the more
   *   serious fact — that nothing can be said about what the database retained — carrying the roll-back's
   *   own failure as `cause`. On every one of these paths the connection is taken out of service rather
   *   than returned to the pool, per the disposal rule above.
   */
  runWrite<TResult>(
    work: (graph: TGraph) => Promise<TResult>,
    hasErrors: () => boolean,
  ): Promise<TResult>;
}
