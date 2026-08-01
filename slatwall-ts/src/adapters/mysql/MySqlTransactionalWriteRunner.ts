/**
 * Binds {@link TransactionalWriteRunner} to {@link UnitOfWork} — the adapter that gives a handler a
 * transaction without giving it a driver.
 *
 * AAP authority: AAP §0.3.3 names **Unit of Work** as the replacement for "the implicit request-end
 * commit gated on `getORMHasErrors()`", and AAP §0.4.4 authorises `slatwall-ts/src/adapters/mysql/**` |
 * CREATE. `./UnitOfWork` already owns the acquire / begin / commit-or-roll-back / release sequence and is
 * not duplicated here; this class contributes exactly one thing, and it is the thing that was missing.
 *
 * =================================================================================================
 * THE ONE THING IT ADDS: A GRAPH BUILT FOR THE TRANSACTION
 * =================================================================================================
 * ⭐ `UnitOfWork.run` HANDS ITS WORK A `TransactionScope`, AND A SCOPE IS NOT A SERVICE. The scope carries
 * a single member — the transaction's {@link SqlExecutor} — because that is the only thing a transaction
 * really is at this layer. But a handler's write path needs a SERVICE, and a service holds its repository,
 * and a repository holds its executor from the moment it is constructed. So the missing step is not
 * "open a transaction"; it is "construct the service graph AGAINST THIS TRANSACTION'S EXECUTOR", once per
 * invocation, and hand that to the work.
 *
 * ⛔ WITHOUT THAT STEP THE TRANSACTION IS DECORATIVE, AND IT FAILS SILENTLY. A work function that closed
 * over a service captured at start-up would run its statements on the POOL — a different connection, with
 * its own implicit transaction. Every write would succeed, none would belong to the unit being committed,
 * and a roll-back would leave all of them behind. No error is raised on that path by anything: not by
 * `mysql2`, not by the compiler, not by a test that asserts the writes happened. The factory parameter is
 * what makes the mistake unrepresentable, because the work can only reach a graph the factory built.
 *
 * ⚠️ THE FACTORY RUNS ONCE PER TRANSACTION, INSIDE IT, AND ITS RESULT IS NEVER CACHED. Caching a graph
 * across invocations would rebind it to a released connection — and on a warm Lambda container that graph
 * would outlive the request that made it, which AAP §0.6.6 M7 identifies as the source of cross-request
 * bleed. Per-invocation construction is deliberate; the pool, not the graph, is the thing reused warm.
 */
import type { TransactionalWriteRunner } from '../../ports/TransactionalWritePort';

import type { SqlExecutor } from './QueryRunner';
import type { TransactionScope, UnitOfWork } from './UnitOfWork';

/**
 * The slice of {@link UnitOfWork} this adapter uses.
 *
 * Narrowed to one member for the reason every other seam in this layer is narrowed: a test supplies a
 * plain object that records how it was called, without a `mysql2` pool, a container or a live database.
 * `runPerItem`, `runWithoutTransaction` and `getTableTopSortOrder` are deliberately absent — a write path
 * that reached for the non-transactional variant would be defeating this class's only purpose.
 */
export type UnitOfWorkRunner = Pick<UnitOfWork, 'run'>;

/**
 * Builds the transaction-scoped capability graph a write path runs against.
 *
 * ⚠️ EVERYTHING IT CONSTRUCTS MUST BE REACHED THROUGH `scope.executor`, WITHOUT EXCEPTION. A repository
 * inside the returned graph that quietly used the pool instead would put part of the unit outside the
 * transaction, which is precisely the failure this whole file exists to prevent — and it would look
 * correct in review, because the graph would still be "built by the factory".
 *
 * @typeParam TGraph - The capability set the caller's write path declared.
 */
export type TransactionGraphFactory<TGraph> = (scope: TransactionScope) => TGraph;

/**
 * Runs a caller's unit of work in one MySQL transaction, against a graph built for it.
 *
 * ⚠️ IT ADDS NO LIFECYCLE OF ITS OWN, AND MUST NOT. There is no `beginTransaction`, `commit`, `rollback`,
 * `getConnection` or `release` in this file. `UnitOfWork.run` performs that sequence — including the
 * release in a `finally` that runs on every path — and re-implementing any part of it here would create a
 * second, divergent copy of the one invariant that must hold exactly once.
 *
 * @typeParam TGraph - The transaction-scoped capabilities the caller's write path uses.
 */
export class MySqlTransactionalWriteRunner<TGraph> implements TransactionalWriteRunner<TGraph> {
  /**
   * @param unitOfWork - Owns the transaction lifecycle. See {@link UnitOfWorkRunner}.
   * @param buildGraph - Constructs the capability graph from the transaction's scope. See
   *   {@link TransactionGraphFactory}.
   */
  public constructor(
    private readonly unitOfWork: UnitOfWorkRunner,
    private readonly buildGraph: TransactionGraphFactory<TGraph>,
  ) {}

  /**
   * @param work - The caller's writes, run against a graph bound to the open transaction.
   * @param hasErrors - The commit gate, forwarded UNCHANGED and UNWRAPPED. `UnitOfWork.run` evaluates it
   *   once after the work settles and rolls back when it reports findings; interpreting it here would put
   *   the decision in two places.
   * @returns Whatever `work` produced, for a unit that committed.
   */
  public async runWrite<TResult>(
    work: (graph: TGraph) => Promise<TResult>,
    hasErrors: () => boolean,
  ): Promise<TResult> {
    return this.unitOfWork.run<TResult>(
      /* The graph is built INSIDE the transaction, from its scope, and is discarded with it. */
      async (scope: TransactionScope): Promise<TResult> => work(this.buildGraph(scope)),
      hasErrors,
    );
  }
}

/**
 * A compile-time reminder that a scope carries an executor and nothing more.
 *
 * `TransactionScope` is `{ readonly executor: SqlExecutor }`, and every graph factory depends on that
 * being the whole of it. Should the scope ever grow a second member, this alias is where a reader looks
 * first to understand what a factory is now allowed to reach.
 */
export type TransactionScopeExecutor = TransactionScope['executor'] extends SqlExecutor
  ? SqlExecutor
  : never;
