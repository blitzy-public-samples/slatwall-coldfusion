/**
 * The module-scope MySQL connection pool for the extracted Catalog slice.
 *
 * This module has exactly one job: build the connection pool once, when the module is first
 * evaluated, and export it as a typed value that every collaborator below receives by constructor
 * injection. It issues no statement, holds no cache, shapes no result and knows nothing about the
 * domain. Everything it decides is a lifecycle or a boundary decision, and each one is recorded
 * below as a lettered DECISION so that it can be checked rather than taken on trust
 * (AAP 0.8.5 — the artifact trail a skeptical reviewer can follow end to end).
 *
 * LEGACY ORIGIN — and the absence that defines this file
 * -----------------------------------------------------
 * There is no legacy counterpart to port. The legacy application never established a connection
 * in source at all: config/configApplication.cfm:L2 names a datasource, and the ColdFusion/Railo
 * server resolves that name out of band to a driver, a URL, a schema and credentials
 * (DECISION F). AAP 0.5.4 records the consequence in as many words — the MySQL JDBC driver is
 * "NONE vendored", connection handling being "delegated entirely to the CF/Railo datasource".
 *
 * Two things follow, and both are stated rather than left implicit:
 *   - Every construction decision here is NEW, because there was no in-source original to
 *     transliterate. What IS carried across is behaviour: fail fast on an unusable connection
 *     target, and pin no capacity figure the source does not state (DECISION C).
 *   - Coverage for this module is entirely NET-NEW. It extends no legacy test, and no parity with
 *     one is claimed or implied (AAP 0.6.5.2, standard S6). The legacy suite contains no
 *     datasource test, no pooling test, and no mocking library of any kind.
 *
 * ARCHITECTURAL POSITION (standard S4 — hexagonal separation)
 * ----------------------------------------------------------
 * src/config sits above domain, ports, adapters, services, validation and integrations, and below
 * handlers. Dependency flow is one-way and deliberately asymmetric:
 *
 *     handlers  ->  config/container  ->  services  ->  ports  <-  adapters
 *                          |                                          ^
 *                          +----- injects the pool exported here -----+
 *
 * The direction matters more than it looks. src/adapters/mysql/QueryRunner.ts and
 * src/adapters/mysql/UnitOfWork.ts are the two consumers of this module, and neither one imports
 * it: they declare a constructor parameter of the exported type and are handed the value by
 * src/config/container.ts. That is what keeps the apparent config <-> adapters cycle from ever
 * forming, and it is why this module exports a value and a type but no accessor, no locator, no
 * registry and no factory function (standard S3 — constructor injection only, no service locator,
 * no string-keyed runtime resolution).
 *
 * Consequences of that position, all deliberate:
 *   - The only intra-subtree import is ./env, and the only package import is the driver. Nothing
 *     else is imported: no Node builtin, no sibling layer, no handler.
 *   - The process environment is never read here. src/config/env.ts is the single permitted
 *     reader of it in this entire subtree (AAP 0.4.3.5), it has already validated every value
 *     eagerly, and duplicating that validation would create a second source of truth.
 *   - No AWS type, client, event, result, invocation context, region, account identifier or
 *     resource identifier is named here. All AWS coupling is confined to src/handlers (S4), and
 *     the AWS SDK is deliberately absent from the dependency set because the Lambda runtime
 *     already ships it (AAP 0.5.2.1).
 *   - No statement text, table name or column name appears here, and no identifier-quoting or
 *     string-interpolation helper is exported (DECISION D).
 *   - Nothing is logged and no diagnostic output is produced. No logger is in the dependency set,
 *     and the legacy framework's logging call is not carried across.
 *   - No dependency is added. The runtime dependency set stays at exactly one package (S5).
 */

import { createPool, type Pool, type PoolConnection } from 'mysql2/promise';

import { config } from './env';

/* ==============================================================================================
 * DECISION A — the pool is constructed at MODULE SCOPE, outside every handler, and exactly once.
 *
 * AAP 0.3.2's packaging research states the requirement directly: "database clients and pools must
 * be created at module scope, outside the handler, so they are reused across warm invocations",
 * realised as "a module-scope mysql2 pool plus a memoized service-graph factory in
 * src/config/container.ts, with the per-invocation handler holding no state of its own."
 *
 * A Lambda container evaluates a module body once and then serves many invocations from it. So
 * construction placed here happens once per container, and the resulting pool — together with
 * whatever connections it has established — survives for every subsequent warm invocation.
 * Construction placed inside an exported function, or behind a lazily populated mutable binding
 * that the first invocation fills in, would rebuild per call and discard exactly the reuse this
 * placement exists to obtain. Both shapes are therefore avoided: the export below is a single
 * `const` initialised in the module body, and this module exposes no initialise, connect,
 * configure or reset entry point.
 *
 * Module evaluation performs NO asynchronous work, and that is a hard requirement rather than a
 * stylistic preference:
 *   - The emitted format is CommonJS (package.json declares "type": "commonjs", and
 *     build/esbuild.mjs:L99 emits format 'cjs'), so a top-level asynchronous suspension is not
 *     available to this module in the first place.
 *   - `createPool` is synchronous in the driver — it returns the pool itself, not a promise — and
 *     it establishes no socket at construction time. Connections are opened lazily, on first use.
 *   - Nothing here verifies connectivity: no probe, no ping, no round-trip, no health signal. That
 *     laziness is what allows a type-check, a bundle and the test suite to all succeed with no
 *     database reachable and no environment file present (AAP 0.8.3.10 — deployability is a
 *     property of the build, not of a deployed endpoint).
 *
 * Failure on an unusable target stays immediate and total, which is inherited behaviour rather
 * than an added feature. config/configORM.cfm:L2 opens a try around the datasource probe;
 * config/configORM.cfm:L4 catches a failure, config/configORM.cfm:L5 renders
 * admin/views/main/nodatasource.cfm and config/configORM.cfm:L6 aborts outright. The legacy
 * application does not re-attempt the connection, does not pause and reissue it, does not fall
 * back to a second datasource, does not degrade to a read-only mode and does not emit a health
 * signal — and neither does this module, because AAP 0.8.2 Guideline 4 forbids enhancing behaviour
 * beyond what the migration requires. The eager validation that produces that fail-fast contract
 * lives one module away, in src/config/env.ts, and is not duplicated here.
 * ============================================================================================ */

/* ==============================================================================================
 * DECISION B — this module is the ONE documented exception to mismatch M7, and the exception is
 * BOUNDED TO THE POOL (AAP 0.8.2 Guideline 6).
 *
 * AAP 0.6.6 mismatch M7 states the rule the rest of this subtree obeys: "Nothing survives between
 * Lambda invocations except module-scope state. Memoization is therefore scoped to the request
 * object rather than the module, to avoid cross-tenant bleed on a warm container." Every service
 * in src/services is consequently forbidden module-scope and instance-level mutable state, and
 * src/validation/Validator.ts must keep its rule-set memo request-scoped.
 *
 * A connection pool is the one thing that legitimately outlives an invocation, for a reason worth
 * stating precisely: it caches TRANSPORT, not DATA. It holds open sockets and the driver's own
 * prepared-statement bookkeeping for those sockets — nothing derived from a request, nothing
 * belonging to a caller, nothing that can be read back as a stale answer. A derived-value cache is
 * the opposite: it holds a computed answer, and a computed answer held across invocations is a
 * wrong answer waiting to be served.
 *
 * The hazard is not hypothetical, and the legacy tree demonstrates it. model/dao/SkuDAO.cfc:L204
 * declares getNextOptionGroupSortOrder(), which at model/dao/SkuDAO.cfc:L205 tests for a memo key
 * and at model/dao/SkuDAO.cfc:L206 and model/dao/SkuDAO.cfc:L214 stores the derived sort order
 * into `variables.nextOptionGroupSortOrder` — that is, into the variables scope of a DAO the
 * framework treats as a singleton — from an aggregate read of the option-group sort order at
 * model/dao/SkuDAO.cfc:L211. Its companion clearNextOptionGroupSortOrder() at
 * model/dao/SkuDAO.cfc:L222-L226 is meant to invalidate that memo and cannot: the guard at
 * model/dao/SkuDAO.cfc:L223 removes the key only when the key is ABSENT, so the stored value is
 * never actually discarded. AAP 0.6.7.4 registers that inverted guard as defect D7.
 *
 * Lifted verbatim to module scope in a warm container, that pattern would serve one container's
 * first-computed sort order to every later invocation, across callers, with no mechanism able to
 * clear it. So the rule and its single exception are drawn tightly:
 *   - PERMITTED here, and nowhere else in src/**: one module-scope binding holding the pool.
 *   - NOT permitted here either — no result cache, no row cache, no entity cache, no
 *     prepared-statement registry of this module's own, no counter, no accumulator and no
 *     last-error binding. There is exactly one binding in this module, it is a `const`, and it
 *     holds the pool.
 *
 * D7 is cited as evidence and is deliberately NOT repaired. Standard S7 is "preserve and annotate,
 * do not repair"; the defect belongs to src/adapters/mysql/MySqlSkuRepository.ts, which carries it
 * across as observed behaviour. Nothing in this module reads, writes, fixes or works around it.
 *
 * The same mismatch has a second dimension that this module also does not implement: AAP 0.6.6
 * records `cacheuse="transactional"` on 111 of 113 entities, so the legacy system leans on a
 * Hibernate second-level cache with no single-invocation equivalent — which is why the port
 * carries no entity cache at all, here or anywhere.
 * ============================================================================================ */

/* ==============================================================================================
 * DECISION C — NO capacity, timing or concurrency figure is configured, and the absence is the
 * decision (AAP 0.8.2 Guideline 6, standard S9, requirement IR-12).
 *
 * AAP 0.4.1.3 is explicit and binding on this exact file: "pool sizing is not carried over because
 * the legacy application delegates pooling to the CF/Railo server and pins nothing in source."
 *
 * The evidence, verified rather than assumed, in three steps:
 *   1. config/configApplication.cfm is two lines long, and the only connection fact it records is
 *      a datasource name at config/configApplication.cfm:L2. No driver, no URL, no capacity.
 *   2. Application.cfc:L77-L87 republishes every connection value the legacy bootstrap exposes,
 *      and there are exactly four: the datasource name at Application.cfc:L78, the username at
 *      Application.cfc:L81, the password at Application.cfc:L84 and the ORM dialect at
 *      Application.cfc:L87. There is no fifth. No pool size, no queue depth, no acquisition or
 *      idle bound, no keep-alive interval and no statement bound appears anywhere in that list —
 *      nor anywhere else under config/.
 *   3. AAP 0.5.4 closes the loop: the MySQL JDBC driver is "NONE vendored", so there is no driver
 *      configuration in the repository either. The same section records the MySQL, Lucee,
 *      Hibernate and Taffy versions as NOT DOCUMENTED.
 *
 * Therefore any figure written here would be invented, and standard S9 forbids exactly that: "No
 * SLAs, latency targets, throughput figures or capacity numbers that the source does not state."
 * AAP 0.9.3 adds the positive obligation — record the absence rather than supply a plausible
 * value. A round-looking default would be the most defensible-looking violation available in this
 * subtree, which is precisely why none is written.
 *
 * This is not an oversight in disguise, so the boundary is drawn explicitly:
 *   - AAP 0.3.2 does record a serverless pool-SHAPE observation, but it is framed there as
 *     "engineering rationale only — never restated as a performance commitment (IR-12)". A shape
 *     is not a number. A number is not licensed by an observation about shape.
 *   - The typed configuration this module consumes makes the rule structural rather than merely
 *     intended: src/config/env.ts exposes exactly five fields — host, port, schema, user and
 *     password — and not one capacity or timing field among them. There is consequently no
 *     operator-supplied figure available to pass on, and inventing a default to stand in for one
 *     would violate S9 in a second way.
 *   - Should such a knob ever be genuinely required, AAP 0.4.1.3 dictates the shape of the
 *     change: it arrives through src/config/env.ts as an operator-supplied value with no default
 *     invented in source, and the environment template declares it. It does not arrive as a
 *     literal here.
 *
 * What the driver does in the absence of these options is the driver's own documented behaviour,
 * and leaving it there is the point: it is the closest available analogue to the legacy
 * arrangement, where the application named a datasource and the application server decided
 * everything else.
 * ============================================================================================ */

/* ==============================================================================================
 * DECISION D — the exported surface offers prepared execution and transaction-scoped connection
 * acquisition, and WITHHOLDS the driver's text-substituting alternative (standard S2).
 *
 * AAP 0.3.2 draws the distinction this decision turns on. The driver's prepared path "produces
 * true server-side prepared statements", whereas its text-substituting counterpart "emulates them
 * client-side"; and the placeholders of the prepared path "bind values only and cannot substitute
 * identifiers". (The withheld member is described rather than named throughout this file, so that
 * a search for a call to it across this subtree returns only real call sites.)
 *
 * That is a security boundary, not a style preference. The driver's pool type inherits BOTH
 * members, so exporting the driver's own type unchanged would hand every downstream adapter the
 * client-side-substituting one — the same capability behind the 21 interpolated statements AAP
 * 0.6.7.7 registers as defect D18 in model/dao/ProductDAO.cfc. So the exported types below are
 * narrowed views over the driver's published types, and the narrowing is what makes the rule
 * enforceable: reaching for the withheld member through an injected dependency is a COMPILE error,
 * not a code-review finding.
 *
 * The narrowing is derived with `Pick` from the driver's own declarations rather than hand-copied.
 * Restating a signature by hand would let it drift from the driver on any upgrade, and standard S1
 * requires consuming the published types as they are — so the surface stays exactly compatible,
 * overloads and generic parameters included, while still excluding what must not be reachable.
 *
 * Withheld deliberately, and each for its own reason:
 *   - the client-side-substituting execution member, per the above;
 *   - `format`, `escape` and `escapeId`, the driver's text-assembly and identifier-quoting
 *     helpers. Identifier whitelisting belongs to src/adapters/mysql/QueryRunner.ts and
 *     src/adapters/mysql/SmartListQueryBuilder.ts, which AAP 0.4.3.4 (rule R4) requires to build
 *     identifiers "from a validated whitelist, never by interpolation". The two cases that force
 *     the issue are the dialect-branching sorted-SKU ordering at model/dao/SkuDAO.cfc:L172-L204
 *     and the dynamically built exclusion list at model/dao/OptionDAO.cfc:L93-L116. Neither is
 *     served by a general-purpose escaper, and exporting one here would invite its misuse;
 *   - the pool's shutdown member, so that no invocation path can close a pool that exists to be
 *     reused across invocations (DECISION A);
 *   - `connect`, `ping` and `reset`, which would reintroduce the connectivity probing DECISION A
 *     rules out.
 *
 * This module correspondingly contains no statement text of any kind, and exports no helper that
 * accepts a statement string. Its whole contribution to standard S2 is to make the safe path the
 * only reachable one.
 * ============================================================================================ */

/* ==============================================================================================
 * DECISION E — transaction demarcation is NOT implemented here; it belongs to
 * src/adapters/mysql/UnitOfWork.ts (standard S8 — point at the owner, do not restate).
 *
 * AAP 0.6.6 mismatch M5 records that the legacy commit boundary is implicit and request-scoped,
 * and that "There is no request-end hook in a stateless handler." The legacy chain, verified:
 *   org/Hibachi/Hibachi.cfc:L103        — `this.ormSettings.flushAtRequestEnd = false;`, so the
 *                                         engine is told not to flush on its own.
 *   org/Hibachi/Hibachi.cfc:L455-L459   — endHibachiLifecycle() instead flushes explicitly, and
 *                                         ONLY when the request accumulated no ORM errors. That
 *                                         negative condition IS the commit gate.
 *   org/Hibachi/HibachiDAO.cfc:L92-L96  — the flush it calls runs twice, the second pass
 *                                         commented in source as being there "to persist any
 *                                         changes done during ORM Event handler".
 *   Application.cfc:L113-L123           — the application overrides that lifecycle hook and
 *                                         delegates back to it at Application.cfc:L122.
 *
 * AAP 0.4.1.7 assigns the replacement to src/adapters/mysql/UnitOfWork.ts: "The implicit
 * request-end double-flush commit gate becomes an explicit transaction boundary." This module's
 * only obligation is to make that possible and then stay out of the way. So it exposes connection
 * acquisition — the first step of the explicit acquire, begin, commit-or-roll-back, release
 * sequence AAP 0.3.2 prescribes — and implements none of the rest: no flush, no commit or
 * roll-back orchestration, no savepoint, no error gate, no transaction helper and no wrapper that
 * runs work inside a transaction on a caller's behalf.
 *
 * One related behaviour is likewise owned elsewhere and is named here only so that its absence
 * reads as deliberate: the per-row commit boundary of mismatch M3, which opens a transaction
 * INSIDE the import loop at model/dao/ProductDAO.cfc:L176-L177 and belongs to UnitOfWork together
 * with src/adapters/mysql/MySqlProductRepository.ts. Nothing in this module influences it.
 * ============================================================================================ */

/* ==============================================================================================
 * DECISION F — "Slatwall" at config/configApplication.cfm:L2 is a DATASOURCE NAME, and is never
 * treated as a schema name here (AAP 0.8.2 Guideline 6).
 *
 * config/configApplication.cfm:L2 reads `<cfset this.datasource.name = "Slatwall" />`. That string
 * is a ColdFusion/Railo datasource alias: a key registered in the application server's
 * administrator, which the server resolves out of band into a driver, a JDBC URL, a schema, a user
 * and a password. It is NOT a schema name, NOT a host, NOT a port and NOT a user. It appears in
 * this module only in this comment, only with its locator, and never as a value — the schema this
 * service opens comes from the operator's environment by way of src/config/env.ts, and is not
 * defaulted to this alias or to anything else.
 *
 * The supporting evidence is an absence, which is why it is easy to miss: across
 * config/configApplication.cfm, config/configORM.cfm, Application.cfc and
 * org/Hibachi/Hibachi.cfc the datasource is referenced at four sites and not one of them declares
 * a host, a port or a schema, while org/Hibachi/Hibachi.cfc:L12 and org/Hibachi/Hibachi.cfc:L13
 * set the username and the password to the EMPTY STRING. So there is no credential in the legacy
 * tree to carry across, and none is hardcoded here — satisfying AAP 0.8.3.9's "environment-driven
 * DB configuration, no hardcoded credentials" by construction rather than by discipline.
 *
 * Handling of the credential in this module is correspondingly narrow: it is read from the frozen
 * configuration, handed straight to the driver, and never copied into another binding, embedded in
 * a message, attached to an error, serialized, or emitted as output. This module throws nothing of
 * its own and formats no message, so there is no site at which a value could leak.
 * ============================================================================================ */

/* ==============================================================================================
 * DECISION G — the target is fixed to MySQL, and that decision is documented in
 * src/config/env.ts rather than re-argued here.
 *
 * config/configORM.cfm:L9-L15 selects one of three ORM dialects at runtime from a product probe —
 * MySQL at config/configORM.cfm:L10, MicrosoftSQLServer at config/configORM.cfm:L12 and
 * Oracle10g at config/configORM.cfm:L14, with no fallback branch. AAP 0.4.1.3 collapses that to a
 * fixed MySQL target and places the reasoning in src/config/env.ts, which holds it as DECISION A.
 *
 * The consequence for this module is only that there is nothing to decide: it constructs one
 * MySQL pool. There is no dialect type, union, branch or strategy object here, no runtime product
 * probe, no capability detection and no engine version assertion of any kind.
 * ============================================================================================ */

/* ==============================================================================================
 * DECISION H — how the driver reaches the deployed artifact, and why the import below is an
 * ordinary static one.
 *
 * build/esbuild.mjs bundles the driver into each handler artifact by default: its external list at
 * build/esbuild.mjs:L38 covers the AWS SDK only, because AAP 0.5.2.1 records that the SDK already
 * ships inside the runtime and bundling it "would inflate the artifact for no gain".
 * build/esbuild.mjs:L17-L23 documents the driver's own treatment and the opt-out, an
 * ESBUILD_EXTERNAL setting read at build/esbuild.mjs:L41 that leaves the driver external instead —
 * the form used for the AAP 0.1.2.3 environment probe, and the form to use when the driver is
 * supplied by a layer alongside the bundle.
 *
 * Both arrangements are served by the same plain static import below, which is the point of
 * recording this: the import is deliberately NOT conditional, NOT deferred and NOT resolved
 * dynamically, because the bundler must be able to see it statically under either setting. For the
 * same reason every intra-subtree import in this subtree is a relative, extensionless path with no
 * alias (AAP 0.4.3.5) — an alias that type-checks can still fail to resolve at cold start.
 * ============================================================================================ */

/**
 * A pooled connection checked out for the span of one explicit transaction.
 *
 * Exactly the four transaction operations plus the release that returns the connection to the
 * pool, in the acquire, begin, commit-or-roll-back, release sequence AAP 0.3.2 prescribes and
 * src/adapters/mysql/UnitOfWork.ts implements (DECISION E). Prepared execution is included because
 * work inside a transaction has to run on the SAME connection the transaction was begun on —
 * routing it back through the pool would send it to an arbitrary connection and silently place it
 * outside the transaction.
 *
 * Derived with `Pick` from the driver's published pooled-connection type, so the members carry
 * their original signatures. The text-substituting execution member and the identifier-quoting
 * helpers are outside this view and are therefore unreachable through it (DECISION D).
 *
 * The release is the caller's responsibility and belongs in a `finally`, so that a connection is
 * returned whether the transaction committed or rolled back. This module deliberately provides no
 * wrapper that would take that responsibility on, because doing so would be the transaction
 * orchestration DECISION E assigns elsewhere.
 */
export type TransactionalConnection = Pick<
  PoolConnection,
  'execute' | 'beginTransaction' | 'commit' | 'rollback' | 'release'
>;

/**
 * The injectable database surface: prepared execution, plus checkout of a connection for an
 * explicit transaction.
 *
 * This is the type every collaborator below the config layer declares as a constructor parameter —
 * src/adapters/mysql/QueryRunner.ts for single statements, src/adapters/mysql/UnitOfWork.ts for
 * transactional work — rather than importing this module (standard S3, standard S4). Depending on
 * this narrow type instead of the driver's own pool type gives three properties worth having:
 *
 *   1. The unsafe path is unreachable. Only prepared execution is exposed, so client-side text
 *      substitution cannot be reached through an injected dependency at all (DECISION D).
 *   2. The pool cannot be closed by a consumer, preserving the warm reuse DECISION A exists for.
 *   3. Substituting a test double means implementing two members, not the driver's entire pool
 *      interface — which matters because the legacy repository has no mocking library at all
 *      (AAP 0.4.3.6), so doubles are written by hand.
 *
 * `getConnection` is re-declared rather than picked, so that the connection it yields is the
 * narrowed {@link TransactionalConnection} instead of the driver's fully featured pooled
 * connection. Without that, the withheld members would be reachable one call away, and the
 * boundary would hold on the pool while leaking on everything acquired from it.
 */
export interface DatabasePool extends Pick<Pool, 'execute'> {
  /**
   * Checks out a connection for the caller to run one explicit transaction on.
   *
   * @returns a pooled connection the caller must release when the transaction has finished
   */
  getConnection(): Promise<TransactionalConnection>;
}

/**
 * The connection pool for this service, built once when this module is first evaluated.
 *
 * Consumed by constructor injection only: src/config/container.ts passes this value to the MySQL
 * adapters, and nothing below the config layer imports this module (standard S3, standard S4).
 *
 * Only the five connection facts src/config/env.ts validated are passed to the driver. No
 * capacity, timing or concurrency option is set, and that omission is a documented decision with
 * its evidence, not an oversight — see DECISION C before adding one.
 *
 * Evaluating this module does not open a socket and does not verify that the server is reachable;
 * connections are established lazily on first use (DECISION A). It does inherit the eager
 * fail-fast validation of src/config/env.ts, so a deployment missing any required connection value
 * fails at load with that module's error naming the offending variable, rather than at first use
 * with a connection error that says less.
 *
 * @example
 * ```ts
 * // src/config/container.ts — wired once, then injected downwards.
 * import { pool } from './database';
 *
 * const queryRunner = new QueryRunner(pool);
 * const unitOfWork = new UnitOfWork(pool);
 * ```
 */
export const pool: DatabasePool = createPool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
});
