/**
 * The module-scope MySQL connection pool for the extracted Catalog slice.
 *
 * The pool is built once, when this module is first evaluated, and exported as a typed value that
 * collaborators receive by constructor injection. This module issues no statement, holds no cache,
 * shapes no result and knows nothing about the domain; every choice it makes is a lifecycle or a
 * boundary choice, and each is recorded below as a lettered DECISION A through H.
 *
 * There is no legacy counterpart to port. config/configApplication.cfm:L2 names a datasource and
 * the ColdFusion/Railo server resolves that name out of band to a driver, a URL, a schema and
 * credentials (DECISION F); AAP §0.5.4 records that no JDBC driver is vendored. Two consequences
 * follow: the construction decisions here are new rather than transliterated, and the behaviour
 * that is carried across is failing fast on an unusable connection target while pinning no capacity
 * figure the source does not state (DECISION C).
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
 *   - The only intra-subtree imports are ./env and the shared error base, and the only package
 *     import is the driver. Nothing else is imported: no Node builtin, no sibling layer, no
 *     handler.
 *   - The process environment is never read here. src/config/env.ts is the single permitted
 *     reader of it in this entire subtree (AAP 0.4.3.5), it has already validated every value
 *     eagerly, and duplicating that validation would create a second source of truth.
 *   - No AWS type, client, event, result, invocation context, region, account identifier or
 *     resource identifier is named here. All AWS coupling is confined to src/handlers (S4), and
 *     the AWS SDK is deliberately absent from the dependency set because the Lambda runtime
 *     already ships it (AAP 0.5.2.1).
 *   - No statement text, table name or column name appears here, and no identifier-quoting or
 *     string-interpolation helper is exported (DECISION D). What IS exported is the statement
 *     DESCRIPTOR every execution is expressed as — a value that cannot be built from an assembled
 *     string and cannot carry a value it has not bound (DECISION J).
 *   - Nothing is logged and no diagnostic output is produced. No logger is in the dependency set,
 *     and the legacy framework's logging call is not carried across.
 *   - No dependency is added. The runtime dependency set stays at exactly one package (S5).
 */

import {
  createPool,
  type FieldPacket,
  type Pool,
  type PoolConnection,
  type PoolOptions,
  type QueryResult,
  type SslOptions,
} from 'mysql2/promise';

import { DomainError } from '../errors/DomainError';
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
 * What the legacy source records, in three steps:
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
 *     intended: every figure the pool is built with below is read from src/config/env.ts, which
 *     requires the operator to state it and defaults none of it. There is consequently no literal
 *     capacity or timing figure in this file at all, and inventing one to stand in for an absent
 *     variable would violate S9 in a second way.
 *   - AAP 0.4.1.3 dictates the shape of the change whenever such a knob IS genuinely required:
 *     "it arrives through src/config/env.ts as an operator-supplied value with no default invented
 *     in source, and the environment template declares it. It does not arrive as a literal here."
 *
 * THE THREE CASES WHERE THAT REQUIREMENT WAS SUBSEQUENTLY MET, AND WHY
 * -------------------------------------------------------------------
 * Three bounds now arrive by exactly that route — a connection limit, a queue limit and a
 * connection timeout — together with the transport mode of DECISION I. src/config/env.ts holds the
 * full reasoning as its DECISION E; the part that belongs here is why the original "set nothing"
 * reading of this decision did not survive contact with the driver's defaults.
 *
 * The premise of that reading was that leaving an option unset defers to the driver, which is the
 * closest available analogue to the legacy arrangement where the application named a datasource
 * and the application server decided everything else. For most options that premise holds. For two
 * it does not, because the driver's unset behaviour is not a neutral default but a specific and
 * worse one: no transport encryption is negotiated at all, and the queue of waiting connection
 * requests is unlimited — the driver documents zero as its no-limit sentinel, and zero is what
 * applies when nothing is set. Declining to configure those two therefore SELECTS the unencrypted
 * and the unbounded arrangement rather than declining to choose, which is a decision made silently
 * and the one thing AAP 0.8.2 Guideline 6 exists to prevent.
 *
 * S9 is satisfied in the strongest available form rather than bent: this file states no figure, and
 * neither does src/config/env.ts. The operator states all four, the validator enforces only
 * arithmetic floors and the driver's own documented sentinel, and no ceiling is imposed anywhere
 * because a ceiling would be a capacity figure with no source. The distinction that makes this
 * sound is that a REQUIRED, OPERATOR-SUPPLIED value invents nothing, whereas an unset option
 * silently accepts whatever the driver chose.
 *
 * Everything else remains exactly as this decision originally set out. No idle timeout, maximum
 * idle count, keep-alive interval, statement bound, reset-on-release setting or connection-lifetime
 * figure is configured or exposed, and the driver's documented behaviour continues to govern each
 * of them — because for those the original premise still holds: an unset option there defers a
 * choice rather than making a poor one.
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
 * Withholding the unsafe member was, however, only half of what the boundary needs, and the half
 * that was missing is the subject of DECISION J. The member that IS exposed was originally derived
 * with `Pick` from the driver's own declarations, on the reasoning that restating a signature by
 * hand lets it drift on any upgrade and that standard S1 requires consuming published types as they
 * are. That reasoning is sound about RESULT types and is still applied to them below — the result
 * and field-metadata types are the driver's own, imported rather than restated. It does not hold
 * for the INPUT side, because the driver's prepared-execution signature takes a plain string and an
 * optional value list, so inheriting it kept a fully assembled statement type-legal and let a call
 * bind nothing at all. Inheriting a signature inherits its holes as faithfully as its safety, so
 * the input is now this port's own (DECISION J) while the output stays the driver's (S1).
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
 * takes an already-assembled statement string. Its whole contribution to standard S2 is to make the
 * safe path the only reachable one.
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

/* ==============================================================================================
 * DECISION I — the connection is encrypted and the server verified, unless the target is a loopback
 * host (security finding SEC-12).
 *
 * WHY THIS IS A CHOICE THIS PORT HAS TO MAKE, RATHER THAN ONE IT INHERITS
 * ---------------------------------------------------------------------
 * The legacy application expressed no transport security in source, and could not have: the
 * datasource alias of DECISION F hid the whole connection, so whether the JDBC link used TLS was a
 * setting in the application server's administrator rather than a fact in the repository. There is
 * consequently nothing to preserve. AAP 0.8.2 Guideline 2 requires preserving "existing
 * functionality and behavior exactly as-is for the in-scope modules", and there is no in-scope
 * module here that behaves any particular way — a search of config/configApplication.cfm,
 * config/configORM.cfm, Application.cfc and org/Hibachi/Hibachi.cfc turns up no TLS, SSL,
 * certificate, truststore or `useSSL` reference at any of the four datasource reference sites.
 *
 * So the choice is unavoidable, and the driver decides it if this module does not. That is what
 * makes silence the wrong answer: with no `ssl` option the driver negotiates no encryption at all,
 * which would put the credential of DECISION F and every Sw* row on the wire in cleartext. The
 * closest precedent in this port is AAP 0.6.7.7 defect D18, where the same reasoning applies to a
 * different mechanism — the port declines to reproduce a class of flaw when the target idiom
 * eliminates it structurally, and declares the divergence rather than making it quietly. Here it is
 * weaker than a divergence, because there is no legacy behaviour on the other side of it.
 *
 * WHAT IS SET, AND WHY EACH FIELD
 * ------------------------------
 * In the verified mode, and only there, three fields:
 *   - certificate-chain verification is required, so a server whose chain the runtime cannot verify
 *     is refused rather than trusted;
 *   - server-identity verification is required, so a verifiable certificate issued for a DIFFERENT
 *     host is refused too. The driver documents this one as OFF by default for backward
 *     compatibility, which makes setting it explicitly the difference between checking that the
 *     certificate is valid and checking that it belongs to the server actually connected to;
 *   - the minimum protocol version is stated at the driver's own documented default rather than
 *     left implicit, so that a future change to that default cannot silently lower it.
 *
 * WHAT IS DELIBERATELY NOT SET
 * ---------------------------
 *   - No field that disables either verification appears anywhere in this file. There is no mode
 *     that keeps TLS while skipping verification, because an unverified session is
 *     indistinguishable from an intercepted one.
 *   - No certificate, private key, passphrase, revocation list or cipher list is configured, and no
 *     certificate authority is read from a file: this module opens no file, imports no Node builtin
 *     and parses no certificate. A deployment behind a private authority supplies the root to the
 *     Node runtime through the runtime's own documented trusted-roots mechanism and still runs in
 *     the verified mode with no code change and no new variable.
 *   - No named vendor SSL profile is used. The driver accepts a profile string that bundles one
 *     cloud provider's authority set, and using it would couple this file to that provider — which
 *     AAP 0.8.3.9 and the S4 boundary both rule out, since no AWS or vendor resource identifier is
 *     named in this subtree outside src/handlers.
 *
 * The unencrypted mode exists for one arrangement only, the local development database, and
 * src/config/env.ts refuses it for any host that is not a loopback literal — so cleartext across a
 * network is not discouraged here but inexpressible upstream, and this module can act on the mode
 * it is handed without re-checking it (its DECISION E holds the reasoning and the host rules).
 *
 * The option is OMITTED rather than set to a false or undefined value in that mode.
 * `exactOptionalPropertyTypes` is enabled, so an absent option and an option explicitly set to
 * `undefined` are different things here, and the conditional spread below expresses the first.
 * ============================================================================================ */

/* ==============================================================================================
 * DECISION J — every execution is expressed as a STATEMENT DESCRIPTOR, so an assembled statement
 * string cannot be executed and a bound value cannot be omitted (standard S2; AAP 0.4.3.4 rule R4;
 * security finding SEC-10).
 *
 * THE HOLE THIS CLOSES, WHICH DECISION D DID NOT
 * ---------------------------------------------
 * DECISION D withholds the driver's client-side text-substituting member, and that remains
 * necessary. It is not sufficient. The member it exposes instead is published as taking a plain
 * statement string and an OPTIONAL value list, and an exported view derived from that declaration
 * inherits both properties:
 *   1. A fully assembled statement is a `string`, so it satisfies the parameter and type-checks.
 *      The prepared path then executes it verbatim — server-side preparation protects the values
 *      that are BOUND, and protects nothing about text that was concatenated before the driver ever
 *      saw it. Withholding the substituting member removes one route to injection; it does not
 *      remove this one.
 *   2. Because the value list is optional, "prepare a statement and bind nothing" is a legal call.
 *      The safe path could therefore be used in the unsafe way, which is the same defect AAP 0.6.7.7
 *      registers as D18 in model/dao/ProductDAO.cfc — 21 statements assembled by interpolation from
 *      file-supplied values — reachable through the very member introduced to eliminate it.
 *
 * WHAT REPLACES IT
 * ---------------
 * {@link PreparedStatement} is a class whose constructor is private, which makes it nominally
 * rather than structurally typed: no string, no object literal and no other shape is assignable to
 * it. Since {@link DatabasePool.execute} accepts only that type, an assembled statement is a
 * COMPILE error at the call site rather than a finding in a later review — and the only route to an
 * instance is the {@link sql} tagged template, where each interpolation becomes a placeholder and
 * contributes its value in the same position. Binding is therefore not something a caller can
 * forget: writing an interpolation IS binding, and there is no other way to write one.
 *
 * That is precisely the contract AAP 0.4.3.4 rule R4 and TR-4 require — "pool.execute(sql, params)
 * with the parameter array assembled in exactly the legacy sequence" — expressed so that the
 * sequence cannot come apart. Composition preserves it too: interpolating one descriptor into
 * another splices its text at that position and its values in that order, which is what the
 * N-clause `EXISTS` conjunction of AAP 0.3.3.1 needs, one clause per selected option with the
 * option identifiers ahead of the product identifier.
 *
 * WHY THERE IS STILL NO IDENTIFIER MECHANISM
 * -----------------------------------------
 * Deliberately no identifier interpolation, no identifier-quoting helper and no raw-fragment escape
 * hatch is offered, so an identifier cannot become a runtime string by any route this module
 * provides. AAP 0.4.3.4 requires identifiers to be built "from a validated whitelist, never by
 * interpolation", and the shape that satisfies it is a closed token mapped to a fragment written
 * out literally — the token selects a fragment, it never becomes part of one. The two cases that
 * force the issue are the dialect-branching sorted-SKU ordering at model/dao/SkuDAO.cfc:L172-L204
 * and the dynamically built exclusion list at model/dao/OptionDAO.cfc:L93-L116; neither is served by
 * a general-purpose escaper, and providing one here would invite its misuse. Building the fragment
 * table belongs to src/adapters/mysql/QueryRunner.ts and
 * src/adapters/mysql/SmartListQueryBuilder.ts, as DECISION D already records.
 *
 * THE LIMIT OF THE GUARANTEE, STATED RATHER THAN OVERSOLD
 * -----------------------------------------------------
 * A caller determined to defeat this can fabricate a template-strings object and assert its type.
 * What the boundary makes impossible is the ACCIDENTAL and the IDIOMATIC form — the interpolated
 * template literal that reads like ordinary code and is how this class of defect actually arrives —
 * and a type assertion is both visible in review and ruled out by standard S1. No boundary in a
 * structurally typed language does better than that, and claiming otherwise would be the kind of
 * overstatement AAP 0.8.5 exists to keep out of this trail.
 *
 * RESULTS ARE NOT RESHAPED
 * -----------------------
 * The result and field-metadata types are the driver's own, imported rather than restated, and the
 * generic parameter is passed straight through so a caller can still name the result shape it
 * expects. Only the INPUT is this port's (S1). Row mapping stays where AAP 0.4.1.7 puts it, in
 * src/adapters/mysql/rowMappers.ts, and nothing here interprets a row.
 * ============================================================================================ */

/**
 * The placeholder the driver binds a value to.
 *
 * Value binding only: the driver's prepared path cannot substitute an identifier for it, which is
 * the property DECISION J's identifier rule rests on.
 */
const PLACEHOLDER = '?';

/**
 * A value that may be bound to a placeholder.
 *
 * Narrower than the set the driver accepts, and each exclusion is a decision:
 *   - 64-bit integers are excluded because no identifier in this slice is one. AAP IR-6 records
 *     that 107 of 113 entities declare a 32-character string primary key, and the Sw* columns this
 *     port reads and writes carry no 64-bit integer key.
 *   - Binary values are excluded because the slice stores none: an image is a file NAME on
 *     model/entity/Sku.cfc and the bytes live outside the database entirely.
 *   - Nested arrays and objects are excluded because the driver would expand or name-map them,
 *     turning one placeholder into an unpredictable number of bound values. AAP 0.3.3.1 requires
 *     the opposite — one explicitly written placeholder per value, in the legacy order — and
 *     model/dao/OptionDAO.cfc:L93-L116 is exactly the case that would otherwise be tempting to
 *     hand to the driver as a list.
 *   - `undefined` is excluded because the driver rejects it at bind time. Excluding it from the type
 *     turns a run-time failure into a compile error, and `exactOptionalPropertyTypes` keeps the
 *     distinction between an absent value and an explicitly undefined one meaningful.
 *
 * A column that legitimately holds no value is bound as `null`, which is the value MySQL stores;
 * that is the only way to express absence here, and it is deliberately the explicit one.
 */
export type BoundValue = string | number | boolean | Date | null;

/**
 * What may appear inside an interpolation of the {@link sql} tag.
 *
 * Either a value, which becomes one placeholder, or another descriptor, which splices in its text
 * and its values. There is no third case on purpose: a bare string is NOT accepted, because
 * accepting one would reopen the assembled-statement hole DECISION J closes.
 */
export type StatementInterpolation = BoundValue | PreparedStatement;

/**
 * A statement and the complete, ordered list of values bound to its placeholders.
 *
 * The unit every execution in this subtree is expressed as. Instances are built only by the
 * {@link sql} tagged template — the constructor is private, so no other shape is assignable and no
 * caller can produce one from an assembled string (DECISION J).
 *
 * Both members are read-only in the types and frozen at run time, so a descriptor that has been
 * validated cannot be altered before it is executed. A descriptor may equally be a FRAGMENT rather
 * than a whole statement; the type is the same, and interpolating one into another is how fragments
 * compose while keeping the bound order intact.
 */
export class PreparedStatement {
  /**
   * The statement text, with one `?` placeholder for each entry of {@link values}.
   *
   * Assembled exclusively from the literal portions of a tagged template plus one placeholder per
   * interpolation, so no caller-supplied value is ever part of it.
   */
  public readonly sql: string;

  /**
   * The values bound to the placeholders, in placeholder order.
   *
   * Mandatory rather than optional, and empty only for a statement that genuinely has no
   * placeholder. Frozen, and copied on construction so that a caller's array cannot be mutated
   * afterwards to change what a validated descriptor will bind.
   */
  public readonly values: readonly BoundValue[];

  /**
   * The nominal marker that makes this descriptor unforgeable.
   *
   * A private CONSTRUCTOR alone is not enough, and the gap is easy to miss. TypeScript is
   * structurally typed, so a class whose every member is public stays satisfiable by any object
   * literal of the same shape — measured rather than assumed: before this field existed,
   * `const forged: PreparedStatement = { sql: assembledFromCallerData, values: [] }` type-checked
   * cleanly and could be executed, which would have left DECISION J's guarantee resting on a
   * private constructor that nobody needed to call. A class carrying a private member is assignable
   * only from instances of that same class, so the literal is now refused and the {@link sql} tag
   * is genuinely the only route to a value of this type.
   *
   * Declared rather than initialised, so it is a fact about the type and contributes no runtime
   * property, no emitted assignment and no serialized key. It is never read, and that is not an
   * omission: its presence in the type IS its purpose, and deleting it would silently reopen the
   * hole it closes.
   */
  declare private readonly nominal: undefined;

  private constructor(sql: string, values: readonly BoundValue[]) {
    this.sql = sql;
    this.values = Object.freeze([...values]);
    Object.freeze(this);
  }

  /**
   * Builds a descriptor from the parts of a tagged template.
   *
   * Reachable only through {@link sql}, which is the documented entry point; it is a member rather
   * than a free function solely because the constructor is private. Calling it directly offers no
   * capability the tag does not, since it requires the same template-strings input.
   *
   * @param fragments the literal portions of the template, as the runtime supplies them
   * @param interpolations the interpolated parts, in template order
   * @returns the composed, frozen descriptor
   * @throws DomainError when a literal portion contains a placeholder character, which would bind
   *   nothing and silently shift every value that follows it
   */
  public static compose(
    fragments: TemplateStringsArray,
    interpolations: readonly StatementInterpolation[],
  ): PreparedStatement {
    let text = '';
    const values: BoundValue[] = [];

    fragments.forEach((fragment, index) => {
      // A placeholder written into the template rather than interpolated is always a mistake: the
      // value list is built from the interpolations alone, so a literal one would consume a bound
      // value belonging to a later placeholder and shift the whole sequence. Rule R4 makes that
      // ordering load-bearing, so it is refused at construction rather than mis-bound at execution.
      if (fragment.includes(PLACEHOLDER)) {
        throw new DomainError(
          'A prepared statement template must not contain a literal placeholder character. ' +
            'Every bound value is written as an interpolation, which supplies its own placeholder ' +
            'in the right position.',
          { context: { fragmentIndex: index } },
        );
      }

      text += fragment;

      // The literal portions always outnumber the interpolations by one, so the final fragment has
      // no interpolation after it. Tested against the LENGTH rather than against an undefined
      // lookup, so that the end of the template and an out-of-type `undefined` interpolation stay
      // distinguishable: the first is normal and the second is refused below.
      if (index >= interpolations.length) {
        return;
      }

      const interpolation = interpolations[index];

      if (interpolation === undefined) {
        // Unreachable from typed code — {@link BoundValue} excludes `undefined` precisely so this
        // is a compile error at the call site — and refused rather than skipped anyway. Skipping it
        // would drop a placeholder and shift every value after it, which is the ordering rule R4
        // makes load-bearing; the driver rejects an undefined bind for the same reason.
        throw new DomainError(
          'A prepared statement cannot bind an undefined value. A column that holds no value is ' +
            'bound as null, which is what the database stores.',
          { context: { interpolationIndex: index } },
        );
      }

      if (interpolation instanceof PreparedStatement) {
        text += interpolation.sql;
        values.push(...interpolation.values);

        return;
      }

      text += PLACEHOLDER;
      values.push(interpolation);
    });

    return new PreparedStatement(text, values);
  }
}

/**
 * Builds a {@link PreparedStatement} from a tagged template.
 *
 * The single construction route, and the reason an assembled statement cannot be executed: a
 * template literal that interpolates a value produces a descriptor in which that value is BOUND,
 * never text. Used as a tag, never called with parentheses.
 *
 * @param fragments the literal portions of the template, supplied by the runtime
 * @param interpolations values to bind, and descriptors to splice, in template order
 * @returns the composed, frozen descriptor
 * @throws DomainError when a literal portion of the template contains a placeholder character
 *
 * @example
 * ```ts
 * // src/adapters/mysql/MySqlSkuRepository.ts — one EXISTS clause per selected option, appended in
 * // list order, then the product last. The bound array therefore comes out as the option
 * // identifiers followed by the product identifier, which is exactly the legacy sequence
 * // (AAP 0.3.3.1, rule R4, TR-4), and the seed mirrors the legacy `where 0 = 0` at
 * // model/dao/SkuDAO.cfc:L107 that the appended clauses attach to.
 * const optionClauses = optionIds.reduce(
 *   (accumulated, optionId) =>
 *     sql`${accumulated} AND EXISTS (SELECT 1 FROM SwSkuOption so
 *                                    WHERE so.skuID = s.skuID AND so.optionID = ${optionId})`,
 *   sql`SELECT DISTINCT s.* FROM SwSku s WHERE 0 = 0`,
 * );
 * const statement = sql`${optionClauses} AND s.productID = ${productId}`;
 * const [rows] = await pool.execute<RowDataPacket[]>(statement);
 * ```
 */
export function sql(
  fragments: TemplateStringsArray,
  ...interpolations: StatementInterpolation[]
): PreparedStatement {
  return PreparedStatement.compose(fragments, interpolations);
}

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
 * Declared by this port rather than derived from the driver's pooled-connection type, for the
 * reason DECISION J sets out: the driver's prepared-execution signature takes a statement string
 * and an optional value list, so a view derived from it would accept an assembled statement and
 * permit a call that binds nothing. Execution here therefore takes a {@link PreparedStatement} and
 * nothing else. The result and field-metadata types remain the driver's own, and the generic
 * parameter is passed straight through, so a caller still names the result shape it expects (S1).
 *
 * The text-substituting execution member, the identifier-quoting helpers and everything else the
 * driver's connection publishes — changing user, destroying, pausing, preparing, unpreparing,
 * pinging, resetting and ending — are outside this interface and unreachable through it
 * (DECISION D). Nothing acquired from the pool widens the boundary the pool holds.
 *
 * The release is the caller's responsibility and belongs in a `finally`, so that a connection is
 * returned whether the transaction committed or rolled back. This module deliberately provides no
 * wrapper that would take that responsibility on, because doing so would be the transaction
 * orchestration DECISION E assigns elsewhere.
 */
export interface TransactionalConnection {
  /**
   * Runs one statement on this connection, inside whatever transaction it has begun.
   *
   * @param statement the descriptor to execute, values already bound in order
   * @returns the driver's result together with its field metadata
   */
  execute<TResult extends QueryResult = QueryResult>(
    statement: PreparedStatement,
  ): Promise<[TResult, FieldPacket[]]>;

  /** Opens a transaction on this connection. */
  beginTransaction(): Promise<void>;

  /** Commits the transaction opened on this connection. */
  commit(): Promise<void>;

  /** Rolls back the transaction opened on this connection. */
  rollback(): Promise<void>;

  /** Returns this connection to the pool. Belongs in a `finally`. */
  release(): void;
}

/**
 * The injectable database surface: prepared execution, plus checkout of a connection for an
 * explicit transaction.
 *
 * This is the type every collaborator below the config layer declares as a constructor parameter —
 * src/adapters/mysql/QueryRunner.ts for single statements, src/adapters/mysql/UnitOfWork.ts for
 * transactional work — rather than importing this module (standard S3, standard S4). Depending on
 * this narrow type instead of the driver's own pool type gives four properties worth having:
 *
 *   1. The unsafe path is unreachable. Only prepared execution is exposed, so client-side text
 *      substitution cannot be reached through an injected dependency at all (DECISION D).
 *   2. An assembled statement is unreachable as well, because execution takes a descriptor rather
 *      than a string and a bound value list is not optional (DECISION J). Property 1 alone left
 *      this open.
 *   3. The pool cannot be closed by a consumer, preserving the warm reuse DECISION A exists for.
 *   4. Substituting a test double means implementing two members, not the driver's entire pool
 *      interface — which matters because the legacy repository has no mocking library at all
 *      (AAP 0.4.3.6), so doubles are written by hand.
 *
 * `getConnection` yields the narrowed {@link TransactionalConnection} rather than the driver's
 * fully featured pooled connection. Without that, the withheld members would be reachable one call
 * away, and the boundary would hold on the pool while leaking on everything acquired from it.
 */
export interface DatabasePool {
  /**
   * Runs one statement on a connection drawn from the pool.
   *
   * Suitable for work that stands alone. Work that must run inside a transaction goes through
   * {@link getConnection} instead, because the pool would otherwise route it to an arbitrary
   * connection and silently place it outside the transaction.
   *
   * @param statement the descriptor to execute, values already bound in order
   * @returns the driver's result together with its field metadata
   */
  execute<TResult extends QueryResult = QueryResult>(
    statement: PreparedStatement,
  ): Promise<[TResult, FieldPacket[]]>;

  /**
   * Checks out a connection for the caller to run one explicit transaction on.
   *
   * @returns a pooled connection the caller must release when the transaction has finished
   */
  getConnection(): Promise<TransactionalConnection>;
}

/**
 * Builds the transport options applied in the verified mode, and only there.
 *
 * Three fields, each for the reason DECISION I records: the certificate chain must verify, the
 * certificate must belong to the host actually connected to, and the minimum protocol version is
 * stated at the driver's own documented default so a future change to that default cannot lower it.
 *
 * No field that disables either verification appears here or anywhere else in this file.
 *
 * A FUNCTION returning a fresh object, and deliberately NOT a frozen module constant, which is the
 * one thing about this value that is not obvious. The driver keeps the object by reference and then
 * NORMALISES IT IN PLACE — it writes its own `rejectUnauthorized` default back into the very object
 * it was handed — so a frozen one raises `TypeError: Cannot assign to read only property
 * 'rejectUnauthorized'` while the pool is being constructed, at module load, before anything can
 * catch it. That was measured against the installed driver rather than reasoned about, and it is
 * recorded here because freezing is the house pattern everywhere else in this subtree and the next
 * reader would otherwise "restore" it. A fresh object per call also means no caller can retain a
 * reference and weaken the settings afterwards, which is what the freeze was reaching for.
 *
 * @returns transport options requiring a verified, identity-checked TLS session
 */
function verifiedTransportOptions(): SslOptions {
  return { rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2' };
}

/**
 * The options the pool is built with, assembled from validated configuration alone.
 *
 * Every value here comes from src/config/env.ts, which requires the operator to supply it and
 * defaults none of it; there is no literal capacity or timing figure in this file (DECISION C).
 *
 * `waitForConnections` is stated explicitly even though it matches the driver's default, because
 * the queue bound below is only meaningful while it is true — with it false there is no queue for a
 * limit to apply to, and the bound would be dead configuration that reads as if it were live.
 *
 * ON THE ABSENCE OF A SEPARATE ACQUISITION TIMEOUT
 * -----------------------------------------------
 * There is no acquisition-timeout option to set. The installed driver's pool options declare
 * exactly six members — wait-for-connections, connection limit, maximum idle, idle timeout, queue
 * limit and reset-on-release — and no acquisition timeout among them; the option existed in an
 * earlier generation of the driver and does not in this one. Verified against the installed package
 * rather than assumed, because the alternative would be to configure a name the driver silently
 * ignores, which is worse than configuring nothing: it reads as a live bound while doing nothing.
 *
 * The bounded queue is what stands in for it, and it is a stronger guarantee rather than a weaker
 * one. A request that arrives when the connection limit is reached and the queue is full is
 * rejected IMMEDIATELY with the driver's own queue-limit error, so no caller waits without bound —
 * which is the property an acquisition timeout is reached for. The connection timeout above bounds
 * the other half, the establishment of a connection once a slot is free.
 *
 * The transport option is SPREAD IN rather than assigned, so that the unencrypted mode omits it
 * entirely instead of setting it to `undefined`. With `exactOptionalPropertyTypes` enabled those are
 * different things, and only the omission means "the driver's own behaviour applies" (DECISION I).
 *
 * Not frozen, for the reason {@link verifiedTransportOptions} records: the driver takes ownership of
 * the options it is handed and normalises parts of them in place. Nothing in this subtree writes to
 * it — it is built once at load, passed once, and never read again — so it is not the kind of
 * mutable module-scope state AAP 0.6.6 mismatch M7 warns about, which is a cache that accumulates
 * across invocations.
 */
const poolOptions: PoolOptions = {
  host: config.database.host,
  port: config.database.port,
  database: config.database.database,
  user: config.database.user,
  password: config.database.password,
  connectionLimit: config.database.connectionLimit,
  queueLimit: config.database.queueLimit,
  waitForConnections: true,
  connectTimeout: config.database.connectTimeoutMs,
  ...(config.database.tlsMode === 'verified' ? { ssl: verifiedTransportOptions() } : {}),

  /* ------------------------------------------------------------------------------------------
   * ⚠️⚠️ F16 — EXACT NUMERIC TRANSPORT. These three options are not tuning; they are a
   * CORRECTNESS CONTRACT that `../adapters/mysql/rowMappers.ts` depends on, and two of them fix a
   * loss that happens INSIDE THE DRIVER where no amount of mapper-side validation could ever
   * detect it.
   *
   * WHY IT MATTERS HERE. The catalog's monetary columns are declared `ormtype="big_decimal"` —
   * `listPrice`, `price` and `renewalPrice` at [model/entity/Sku.cfc:L55-L57] and
   * `calculatedSalePrice` at [model/entity/Product.cfc:L62]. Hibernate mapped those to Java
   * `BigDecimal`, an EXACT arbitrary-precision type. An IEEE-754 double is not one, so the
   * transport has to hand the port the exact digits and let the port decide what is representable.
   *
   * MEASURED against the MySQL 8.4 this subtree targets, with `CAST` literals:
   *
   *   default (all three unset)
   *     DECIMAL(19,2)  '100.00'                  -> string "100.00"        exact
   *     DECIMAL(30,2)  '12345678901234567890.12' -> string "...890.12"     exact
   *     BIGINT          9007199254740993         -> number 9007199254740992  ❌ OFF BY ONE
   *
   *   decimalNumbers: true
   *     DECIMAL(19,2)  '100.00'                  -> number 100             ❌ scale lost
   *     DECIMAL(30,2)  '12345678901234567890.12' -> number 12345678901234567000  ❌ 5 digits lost
   *
   *   supportBigNumbers + bigNumberStrings
   *     DECIMAL        (as above)                -> exact strings          ✅
   *     BIGINT          9007199254740993         -> string "9007199254740993"  ✅ exact
   *
   * THE BIGINT ROW IS THE WHOLE POINT. Under the driver default a BIGINT beyond 2^53 is silently
   * rounded before the mapper is called, and what the mapper receives is a finite, safe-looking
   * number carrying no evidence that a digit was changed. That class of corruption is undetectable
   * downstream BY CONSTRUCTION, which is why it has to be prevented at the pool.
   *
   * `decimalNumbers` IS PINNED FALSE EXPLICITLY EVEN THOUGH FALSE IS THE DEFAULT. Relying on the
   * default would leave the port's exactness resting on a driver behaviour that a future edit, or a
   * driver major, could flip — and flipping it would silently re-introduce exactly the loss the
   * measurements above record. Stating it makes the dependency reviewable, and
   * `readOptionalExactDecimal` in the row mappers additionally REFUSES a monetary column that
   * arrives as a JavaScript number, so a regression here fails loudly instead of quietly.
   *
   * ⛔ THIS GROUP IS ORTHOGONAL TO THE TRANSPORT-SECURITY AND POOL-BOUND OPTIONS ABOVE, AND NEITHER
   * GROUP SUPERSEDES THE OTHER. `ssl`, `connectionLimit`, `queueLimit`, `waitForConnections` and
   * `connectTimeout` govern HOW the bytes travel and how many connections may be in flight; these
   * three govern WHAT the bytes mean once they arrive. An earlier revision of this file carried
   * only one of the two groups at a time, so both are spelled out here together with the reason
   * each exists — deleting either group re-opens a defect the other cannot cover.
   * ------------------------------------------------------------------------------------------ */
  supportBigNumbers: true,
  bigNumberStrings: true,
  decimalNumbers: false,
};

/**
 * The driver's own pool, created once when this module is first evaluated.
 *
 * Deliberately NOT exported. Everything below the config layer receives {@link pool} instead, the
 * narrowed surface that withholds client-side text substitution, identifier quoting, shutdown and
 * connectivity probing (DECISION D) and accepts only statement descriptors (DECISION J). Keeping
 * this value module-private is what makes those boundaries hold: an exported driver pool would let
 * any consumer reach straight past them.
 */
const driverPool: Pool = createPool(poolOptions);

/**
 * Narrows a pooled connection to the transaction surface, and to descriptor-only execution.
 *
 * The bound values are copied out of the frozen descriptor because the driver's parameter type is a
 * mutable array; the copy is what lets the descriptor stay read-only without a type assertion
 * (standard S1). Nothing else is translated — the driver's result is returned exactly as it comes
 * back, since result shaping belongs to src/adapters/mysql/rowMappers.ts (AAP 0.4.1.7).
 *
 * @param connection the pooled connection just checked out of the driver's pool
 * @returns the same connection seen through {@link TransactionalConnection}
 */
function asTransactionalConnection(connection: PoolConnection): TransactionalConnection {
  return Object.freeze({
    execute: <TResult extends QueryResult = QueryResult>(statement: PreparedStatement) =>
      connection.execute<TResult>(statement.sql, [...statement.values]),
    beginTransaction: () => connection.beginTransaction(),
    commit: () => connection.commit(),
    rollback: () => connection.rollback(),
    release: () => {
      connection.release();
    },
  });
}

/**
 * The connection pool for this service, built once when this module is first evaluated.
 *
 * Consumed by constructor injection only: src/config/container.ts passes this value to the MySQL
 * adapters, and nothing below the config layer imports this module (standard S3, standard S4).
 *
 * Only the nine connection facts src/config/env.ts validated are passed to the driver, and each one
 * is operator-supplied — this file states no capacity, timing or transport figure of its own
 * (DECISION C, DECISION I). Everything the driver leaves at its documented behaviour is left there
 * deliberately; read DECISION C before configuring anything further.
 *
 * The value is a narrowing wrapper rather than the driver's pool itself, so that execution accepts
 * only a {@link PreparedStatement} and the withheld members stay unreachable, on the pool and on
 * every connection drawn from it alike (DECISION D, DECISION J). It is frozen, so a consumer cannot
 * substitute its own execution behaviour after load.
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
export const pool: DatabasePool = Object.freeze({
  execute: <TResult extends QueryResult = QueryResult>(statement: PreparedStatement) =>
    driverPool.execute<TResult>(statement.sql, [...statement.values]),
  getConnection: async (): Promise<TransactionalConnection> =>
    asTransactionalConnection(await driverPool.getConnection()),
});
