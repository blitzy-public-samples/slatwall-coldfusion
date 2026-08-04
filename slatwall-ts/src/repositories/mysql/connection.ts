// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring
// order "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no behaviour in this file depends
// on one. The complete set named below, with the role each will play:
//
//   src/handlers/bootstrap.ts       composition root (wiring)
//   tests/integration/repositories  repository integration tier
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - the MySQL connection pool and the injectable query executor
//
// WHAT THIS MODULE IS
//   The one place this service opens a connection to the existing `Sw*` MySQL
//   schema. It owns exactly three things and nothing else:
//
//     1. THE POOL. A single `mysql2` pool, created once per execution container
//        and memoized. This is the ONLY sanctioned module-scope mutable state in
//        the whole target - see THE MODULE-SCOPE EXCEPTION below.
//     2. THE EXECUTOR. A deliberately narrow, injectable interface that exposes
//        server-side prepared-statement execution and nothing else. Every one of
//        the six MySQL repositories receives it as a constructor argument.
//     3. THE BOUNDARY GUARD. The single point at which driver-typed rows are
//        re-typed away from the driver's `any`-valued index signature, and at
//        which bound parameters are checked for admissibility.
//
//   It writes no SQL of its own, holds no credential of its own, reads no
//   environment variable of its own, and executes nothing on connect. It never
//   creates, alters or drops anything: the `Sw*` tables are consumed exactly as
//   they already exist.
//
// WHAT IT REPLACES - AND WHY THAT IS NOT APPLICATION CODE
//   The legacy datasource configuration is two lines long.
//
//     [config/configApplication.cfm:L1]  this.name = "slatwall" & hash(...)
//     [config/configApplication.cfm:L2]  this.datasource.name = "Slatwall"
//
//   `Application.cfc` then published the connection facts into application scope
//   once per application start, and every DAO read them back from there:
//
//     [Application.cfc:L78]  setApplicationValue("datasource",         ...)
//     [Application.cfc:L81]  setApplicationValue("datasourceUsername", ...)
//     [Application.cfc:L84]  setApplicationValue("datasourcePassword", ...)
//     [Application.cfc:L87]  setApplicationValue("databaseType",       ...)
//
//   JUDGMENT CALL: this module replaces an EXTERNAL DATASOURCE REGISTRY, not
//   application code, and that distinction explains the shape of everything
//   below. The username and password read at [Application.cfc:L81] and
//   [Application.cfc:L84], and passed to the probe at [config/configORM.cfm:L3],
//   are never given a real value anywhere in application source. The only
//   assignments that exist are EMPTY STRINGS in the vendored framework boundary
//   at [org/Hibachi/Hibachi.cfc:L12-L13] - a boundary this port extracts from and
//   never modifies - restated as empty `cfparam` defaults in an out-of-scope
//   update script at [config/scripts/preupdate/v3_1.cfm:L51-L52]. Supplying blank
//   credentials is what makes the CFML engine fall back to the credentials
//   registered against the datasource ALIAS inside the ColdFusion administrator.
//   The real credential therefore lived in server administration, outside the
//   repository, and there is consequently NO legacy credential to port. That is
//   also why `slatwall-ts/.env.example` ships DB_USER and DB_PASSWORD blank: a
//   placeholder in a committed template is indistinguishable from a real leak
//   during review.
//
//   `"Slatwall"` at [config/configApplication.cfm:L2] is the datasource alias. It
//   appears in this port only as the documented default of DB_NAME in
//   `slatwall-ts/.env.example`. It is not a literal anywhere in this file.
//
// THE OWNERSHIP SPLIT - THREE MODULES, NO OVERLAP
//   * `src/lib/config.ts` READS AND VALIDATES THE DATABASE AND RUNTIME KEYS. It
//     owns the three this file replaces - `datasource`, `datasourceUsername`,
//     `datasourcePassword` (DB_NAME, DB_USER, DB_PASSWORD) - plus DB_HOST,
//     DB_PORT, DB_DIALECT and the four pool variables DB_CONNECTION_LIMIT,
//     DB_MAX_IDLE, DB_IDLE_TIMEOUT_MS and DB_CONNECT_TIMEOUT_MS: ten keys, read
//     once through a single `process.env` access and memoized. This file reads
//     nothing from the environment directly.
//   * `src/repositories/mysql/dialect.ts` OWNS `databaseType` (DB_DIALECT). The
//     dialect is never re-derived here; it is imported, and used for exactly one
//     purpose - refusing to build a MySQL pool for a non-MySQL dialect.
//   * THIS FILE turns those validated values into a pool and an executor.
//
//   THE ENVIRONMENT AS A WHOLE IS NOT OWNED BY ONE MODULE, and this file does not
//   claim it is. `config.ts` is authoritative for the DATABASE AND RUNTIME keys
//   above and nothing wider. Two other owners exist, stated so no reader
//   generalizes the sentence above into a subtree-wide monopoly:
//     - `src/lib/logger.ts` reads LOG_LEVEL independently, on its own, because a
//       logger that had to wait for validated database configuration could not
//       report a configuration failure;
//     - `tests/setup.ts` owns the TEST-ONLY environment state - it assigns TZ and
//       reads TEST_LIVE_DATABASE - which never exists in a deployed bundle.
//   None of the three overlaps: no key is read by more than one of them.
//
//   `slatwallRootURL`, published from the FW/1 base URL at [Application.cfc:L75],
//   is a routing artifact replaced by API Gateway plus `src/handlers/router.ts`
//   under transformation rule T5. No base URL, root URL or route of any kind
//   appears here.
//
// THE MODULE-SCOPE EXCEPTION - SANCTIONED HERE, FORBIDDEN EVERYWHERE ELSE
//   JUDGMENT CALL: the pool below is the ONE deliberate module-scope-state
//   exception in the entire target, and it is a CORRECTNESS AND FIDELITY
//   decision, not a tuning decision. The legacy host held one datasource for the
//   lifetime of a long-lived CFML application; a pool created once per execution
//   container is the faithful analogue of that, and a pool created per invocation
//   would not be. Nothing in this file, and nothing in this comment, asserts any
//   target for how fast or how often that happens: the legacy system states no
//   such figure and none is invented here.
//
//   THE COROLLARY IS THE IMPORTANT HALF. Because a warm container keeps module
//   state alive across UNRELATED invocations, every OTHER memo in the ported code
//   MUST be request-scoped. Three concrete legacy caches are affected and none of
//   them may be reproduced at module scope:
//
//     * [model/dao/SkuDAO.cfc:L204-L220] `getNextOptionGroupSortOrder` memoizes
//       `variables.nextOptionGroupSortOrder` on the component. Worse, its own
//       reset is unreachable:
//
//       LEGACY-DEFECT [model/dao/SkuDAO.cfc:L222-L226]: `clearNextOptionGroupSortOrder`
//       guards with `<cfif not structKeyExists(variables, "nextOptionGroupSortOrder")>`
//       before calling `structDelete` on that same key, so it deletes only when the
//       key is already absent and can therefore never fire.
//       Preserved deliberately; do not fix without a product decision.
//
//       Preservation here means preserving the OBSERVABLE outcome - a value that
//       is never invalidated within its scope - while the scope becomes the
//       request. Reproducing the cache at module scope would let one request's
//       sort order decide another's, which is a different and unsafe behaviour.
//     * [model/service/RoundingRuleService.cfc:L67-L77] memoizes rounding-rule
//       details into `variables.roundingRuleDetails`. Request-scoped in the port.
//     * Every entity memo - `variables.currencyDetails`, `variables.livePrice`,
//       `variables.brandName` and the rest. Request-scoped in the port.
//
//   The one other module-scope memo that exists, in `src/lib/config.ts`, caches
//   only process-environment values, which are fixed for the container's lifetime
//   and derive from no request. Its own documentation draws the same distinction.
//
// LAYER POSITION
//   This is a secondary adapter. It may import `mysql2`, `src/lib/**` and
//   `src/domain/**`; nothing under `src/domain/**` may import it, and that is
//   enforced by the ESLint `no-restricted-imports` boundary rather than by
//   convention. It imports nothing from `src/handlers/**`, `src/services/**` or
//   `src/integrations/**`. It exports no barrel and re-exports nothing.
//
// THE BINDING STANDARD
//   No user-specified rules were provided for this project. That absence is not
//   licence to lower the bar, and no rule has been invented to fill it: the
//   enterprise substitute standard applies at full strength. The practices that
//   bear hardest on this file are environment-driven configuration with no
//   hardcoded credential, parameterized SQL exclusively, one arithmetic surface
//   for money, maximal TypeScript strictness with no `any` and no suppression
//   comment, and one cohesive exported unit per file with no barrel.
//
// TEST COVERAGE
//   Net-new. `meta/tests/unit/dao/` contains only AccountDAOTest and
//   PaymentDAOTest, neither of which is in scope, so no legacy test touches data
//   access for this slice and none of this coverage may be presented as parity.
//   The obligations this file creates for the suites that another author owns are
//   stated with `createPoolExecutor` and `getConnectionPool`: no live server is
//   required for any of them.
// ---------------------------------------------------------------------------

import { createPool } from 'mysql2/promise';
import type {
  Pool,
  PoolConnection,
  PoolOptions,
  ResultSetHeader,
  RowDataPacket,
  SslOptions,
} from 'mysql2/promise';
import type { DatabaseTlsConfig } from '../../lib/config.js';
import { appConfig } from '../../lib/config.js';
import { logger } from '../../lib/logger.js';
import { assertMySqlDialect, resolveConfiguredDialect } from './dialect.js';

// --- The row contract --------------------------------------------------------

/**
 * One row of a result set, keyed by column name.
 *
 * JUDGMENT CALL: values are `unknown`, and this type is deliberately NOT
 * generic. Both halves of that are load-bearing.
 *
 * The driver's own row type, `RowDataPacket`, declares `[column: string]: any`.
 * That `any` is the widest hole in the dependency set, and this module is the
 * boundary at which it is closed: the driver type is used once, inside
 * `createPoolExecutor`, and every row that leaves this file is typed `unknown`
 * per column. No `any` reaches any repository, service or entity as a result.
 *
 * There is no `<TRow>` parameter because a caller-supplied row type would be a
 * claim the driver cannot check. It would also be silently accepted: the `any`
 * index signature above makes `RowDataPacket[]` assignable to ANY array of
 * object type, so `execute<{ price: string }>(...)` would compile and then hand
 * back whatever the database actually returned. Under `noUncheckedIndexedAccess`
 * an `unknown` column forces the caller to narrow explicitly instead, which is
 * exactly where the decision belongs - the `Sw*` money columns are `big_decimal`
 * and must become `Money` from a decimal STRING, never from a number, and a
 * column that is SQL `NULL` must become `undefined` rather than zero.
 */
export type SqlRow = Readonly<Record<string, unknown>>;

// --- The parameter contract --------------------------------------------------

/**
 * A value that may be bound to a `?` placeholder.
 *
 * The union mirrors the driver's own bindable space, minus the shapes that are
 * always a mistake here (see `isSqlParameter`). For orientation, the six in-scope
 * DAOs bind only three CFML SQL types between them - `cf_sql_timestamp` (18
 * occurrences), `cf_sql_varchar` (17) and `cf_sql_bit` (1) - while the HQL call
 * sites additionally bind plain numbers such as `activeFlag = 1`
 * [model/dao/PromotionDAO.cfc:L118]. `bigint` and `Buffer` are admitted because
 * the driver admits them; refusing them would invent a restriction the contract
 * does not impose.
 *
 * CFML parity [model/dao/PriceGroupDAO.cfc:L65]: a legacy `<cfqueryparam>`
 * declared a `cfsqltype` and the engine checked the value against it. Binding
 * through this union, checked at the boundary, is that guarantee carried forward.
 */
export type SqlParameter = string | number | bigint | boolean | Date | Buffer | null;

/**
 * What a data-modifying statement reports back.
 *
 * JUDGMENT CALL: `insertId` is deliberately absent. Every in-scope entity
 * declares `fieldtype="id" generator="uuid"`, so a primary key is generated by
 * the application and written as a `varchar`, never by `AUTO_INCREMENT`. The
 * driver's insert id is therefore always zero for this schema, and exposing a
 * field that is structurally meaningless invites a caller to trust it.
 * `changedRows` is absent too: the driver marks it deprecated in favour of
 * `affectedRows`.
 */
export interface SqlMutationResult {
  /** Rows the statement affected. This is what a delete or update reports on. */
  readonly affectedRows: number;
  /** Server warning count for the statement. Non-zero deserves investigation. */
  readonly warningStatus: number;
}

/**
 * WHO is making a write, as the write boundary is permitted to know it.
 *
 * SECURITY REVIEW DISPOSITION - RAISED AS S-07, ACCEPTED.
 *
 * The finding: "Audit actor IDs are copied from caller-hydrated entities or omitted.
 * A future caller can spoof attribution or create unattributed writes" (CWE-345,
 * insufficient verification of data authenticity). Required resolution: "Remove audit
 * fields from request DTOs; thread immutable authenticated actor context; stamp audit
 * columns at the repository boundary."
 *
 * ★ THE LEGACY NEVER TOOK THESE FROM THE ENTITY, AND THAT IS THE WHOLE ARGUMENT.
 * `org/Hibachi/HibachiEntity.cfc` stamps them in its ORM lifecycle hooks, from the
 * ambient request scope, and never from anything a caller submitted:
 *
 *   preInsert  [L628-L630]  setCreatedByAccount( getHibachiScope().getAccount() )
 *              [L632-L635]  setModifiedByAccount( getHibachiScope().getAccount() )
 *   preUpdate  [L676-L678]  setModifiedByAccount( getHibachiScope().getAccount() )
 *
 * Each is guarded by `!getHibachiScope().getAccount().isNew() &&
 * getHibachiScope().getAccount().getAdminAccountFlag()` - note that `isNew()` is the
 * ACCOUNT's, not the entity's - and both blocks sit inside an
 * `hasApplicationValue("initialized")` gate [L622], [L670], so nothing is stamped
 * during application setup.
 *
 * So reading `product.getCreatedByAccountID()` to decide what to write was never a
 * port of that behaviour; it was a new trust relationship the legacy did not have.
 * Threading an explicit context is also not an invention: ambient request scope is
 * exactly what transformation rule T6 replaces with a parameter, and
 * `CurrentAccountContext` already does the same job for price-group resolution.
 *
 * ★ WHY IT IS A SEPARATE TYPE FROM `CurrentAccountContext`. That one is documented as
 * "DELIBERATELY MINIMAL, AND NOT A CONTEXT BAG", carrying one opaque account
 * identifier and explicitly refusing "session, locale, currency, timezone,
 * PERMISSION, request identifier or logger" members. The audit gate needs a
 * permission - the admin flag - so widening it would breach that contract and couple
 * price resolution to an authorization fact it has no business reading. Two
 * questions, two types.
 *
 * ★ WHY IT LIVES HERE. Every one of the five writing repositories already imports
 * this module, it is where `PreparedStatementExecutor`, `SqlRow` and
 * `SqlMutationResult` establish the write boundary's shared vocabulary, and an actor
 * is part of that vocabulary - it is what the boundary STAMPS. Keeping it out of
 * `src/domain/**` also keeps an authorization concern out of the domain, which the
 * layer-boundary lint rule and the AAP's domain-inward dependency rule both favour.
 *
 * IMMUTABLE AND REQUEST-SCOPED. Constructed once per invocation in
 * `src/handlers/bootstrap.ts` and handed to each repository as a CONSTRUCTOR
 * argument, never as a method parameter - so no port signature changes, interface
 * parity is untouched, and a caller has no channel through which to name an actor at
 * all. That is stronger than validating one: there is nothing to validate.
 */
export interface AuditActorContext {
  /**
   * The authenticated account, as an opaque identifier.
   *
   * ABSENT MEANS NO PERSISTED ACCOUNT, which is the target's representation of the
   * legacy `getAccount().isNew()` half of the gate: the CFML scope hands back a new,
   * empty account object when nobody is signed in, and a new account has no
   * identifier to stamp. Modelling the absence directly reproduces that without
   * reproducing the empty object.
   */
  readonly accountID?: string | undefined;

  /**
   * Whether that account carries the legacy admin flag.
   *
   * The second half of the gate, `getAccount().getAdminAccountFlag()`. It is
   * REQUIRED rather than optional so that a composition site cannot omit it and
   * accidentally stamp on behalf of a non-admin: the decision has to be made
   * explicitly somewhere, and the type is what forces it.
   */
  readonly adminAccountFlag: boolean;
}

/**
 * An actor context that stamps nothing - the shape a non-admin or anonymous request
 * has, and the safe default.
 */
export const UNATTRIBUTED_AUDIT_ACTOR: AuditActorContext = Object.freeze({
  adminAccountFlag: false,
});

/**
 * The account identifier a write may stamp, or `undefined` when the legacy gate
 * refuses.
 *
 * THE ONE PLACE THE GATE IS EVALUATED, so the four repositories cannot drift apart on
 * it. Both conditions must hold, exactly as [org/Hibachi/HibachiEntity.cfc:L628] and
 * [:L633] require them to: a persisted account AND the admin flag.
 *
 * ★ WHAT `undefined` MEANS TO EACH CALLER, BECAUSE IT IS NOT THE SAME THING. On an
 * INSERT it means the column is written null - which is what the legacy produced,
 * since a skipped `setCreatedByAccount` left the property unset and Hibernate
 * inserted null. On an UPDATE it must mean LEAVE THE STORED VALUE ALONE, because a
 * skipped `setModifiedByAccount` left the loaded entity's existing value in place and
 * Hibernate wrote that same value back. Writing null there would DESTROY an
 * attribution the legacy preserved, so the update statements resolve it in SQL
 * against the stored column rather than binding a null over it.
 */
export function resolveAuditActorAccountID(actor: AuditActorContext): string | undefined {
  if (!actor.adminAccountFlag) {
    return undefined;
  }

  const accountID = actor.accountID;
  if (accountID === undefined || accountID.length === 0) {
    return undefined;
  }

  return accountID;
}

/**
 * The columns whose UPDATE assignment must never overwrite a stored value with null.
 *
 * Exported so a test can name them without restating the literals, and so the helpers
 * below cannot disagree about which columns are special.
 */
export const AUDIT_ACTOR_COLUMNS: readonly string[] = Object.freeze([
  'createdByAccountID',
  'modifiedByAccountID',
]);

/**
 * Render one `SET` assignment for an UPDATE statement.
 *
 * Every column renders as `name = ?` - EXCEPT the two audit account columns, which
 * render as `name = COALESCE(?, name)`.
 *
 * ★ WHY THOSE COLUMNS ARE DIFFERENT, AND WHY IT IS SQL RATHER THAN TYPESCRIPT.
 * `HibachiEntity.preUpdate` [org/Hibachi/HibachiEntity.cfc:L651-L679] stamps ONE
 * account, and only when the actor gate passes:
 *
 *   - `setModifiedByAccount` [L676-L678] runs when the gate passes. When it does not,
 *     the setter is never reached, the loaded entity keeps the value it was loaded
 *     with, and Hibernate writes that same value back - so a non-admin save PRESERVES
 *     the previous attribution rather than erasing it.
 *   - `setCreatedByAccount` is ABSENT from `preUpdate` entirely. It exists only in
 *     `preInsert` [L628-L630], so an update NEVER restamps it, and Hibernate's
 *     whole-entity flush rewrote the loaded value unchanged.
 *
 * Binding a plain `?` cannot reproduce either. Where a repository keeps these columns
 * in its SET list, a refused gate would bind null and DESTROY provenance - a worse
 * outcome than the finding being fixed. Resolving against the stored column inside the
 * statement reproduces the legacy outcome with no extra round trip, no
 * read-modify-write race, and no second statement whose failure mode would need its own
 * handling. The stored value is read BY THE DATABASE, so a caller still cannot name it:
 * a hand-built entity carrying a forged account no longer reaches the statement at all.
 *
 * Repositories that exclude these columns from their SET list are unaffected - the
 * helper simply never sees them - so this is a floor rather than a requirement to
 * restructure a statement.
 *
 * MySQL evaluates a self-reference on the right of a `SET` against the value the row
 * held before the statement, and each column is assigned at most once, so the reference
 * is unambiguous.
 *
 * @param columnName the column being assigned.
 * @returns the assignment fragment, with its single placeholder.
 */
export function sqlUpdateAssignment(columnName: string): string {
  if (AUDIT_ACTOR_COLUMNS.includes(columnName)) {
    return `${columnName} = COALESCE(?, ${columnName})`;
  }

  return `${columnName} = ?`;
}

/**
 * The value an updated row will hold for `modifiedByAccountID` once the statement above
 * has run - the TypeScript mirror of its `COALESCE`.
 *
 * Repositories hand back a fresh entity describing the row they just wrote, and that
 * description has to agree with the row. Echoing the resolved actor alone would claim
 * null where the statement preserved a value; echoing the previous value alone would
 * claim the old actor where the statement stamped a new one.
 *
 * @param actor the request's audit actor.
 * @param previouslyStored the value the row held before this update.
 * @returns the value the row now holds.
 */
export function resolveStampedModifiedByAccountID(
  actor: AuditActorContext,
  previouslyStored: string | undefined,
): string | undefined {
  return resolveAuditActorAccountID(actor) ?? previouslyStored;
}

/**
 * The narrow execution surface every repository receives.
 *
 * THIS IS A MANDATORY DESIGN CONSTRAINT, NOT A CONVENIENCE. Each of the six
 * MySQL repositories MUST take this as a CONSTRUCTOR PARAMETER. No repository may
 * import the pool, or a pool-backed executor, as a module singleton and reach it
 * directly.
 *
 * JUDGMENT CALL: constructor injection exists for two reasons that both matter.
 * First, it makes the emitted SQL text and the bound parameter array assertable
 * WITHOUT A LIVE SERVER. This interface is three methods wide precisely so that a
 * suite can implement it outright - recording each `sql` string and each `params`
 * array and returning canned rows - which is how the integration suites under
 * `tests/integration/repositories/` verify statement shape and binding against no
 * database at all. A suite's `transaction` implementation is a one-liner that hands
 * the work function an executor recording onto the same log, so nothing there needs
 * to imitate a pool or a connection. Second,
 * it keeps the one sanctioned module-scope pool from leaking into six files; the
 * single wiring point is the composition root at `src/handlers/bootstrap.ts` (planned),
 * which is what replaces DI/1's runtime convention scan under transformation rule
 * T1.
 *
 * JUDGMENT CALL: there is no `query` method, and there is no way to reach one
 * through this interface. Everything here routes through the driver's
 * `execute`, which is a server-side prepared statement, so parameterization is
 * structural rather than a habit a reviewer has to police. That is the property
 * `<cfqueryparam>` provided in the legacy DAOs and it is preserved exactly.
 *
 * JUDGMENT CALL, REVISED TWICE, AND BOTH REVISIONS ARE RECORDED BECAUSE THE ERROR
 * EACH CORRECTED IS INSTRUCTIVE. There IS a transaction method. The reasoning that
 * once excluded one ran: the legacy bulk paths relied on an ambient CFML transaction
 * with a request timeout far beyond anything this runtime offers
 * [model/service/ProductService.cfc:L66], no such ambient scope exists here, so
 * offering a transaction would "imply a guarantee the surrounding execution model does
 * not provide".
 *
 * THE ERROR WAS TO ANSWER TWO DIFFERENT PROBLEMS WITH ONE POSITION.
 *
 *   BULK MULTI-ROW LOOPS - the SKU cartesian product
 *   [model/service/SkuService.cfc:L109-L121] and the per-SKU save loop
 *   [model/service/ProductService.cfc:L216-L233] - ran under that raised budget, and it
 *   genuinely does not exist here. Wrapping an unbounded loop in one transaction would
 *   hold locks past the platform timeout and would imply exactly the guarantee the
 *   execution model cannot keep. Bulk correctness is therefore still handled where AAP
 *   0.6.5 puts it: explicit batch limits, idempotency on retry, and a documented
 *   compensation story in the handlers. THAT POSITION IS UNCHANGED.
 *
 *   A SINGLE LOGICAL WRITE OVER SEVERAL STATEMENTS is a different problem, and refusing
 *   a transaction outright answered it wrongly. What a single MySQL connection
 *   absolutely does promise is that statements sent between `START TRANSACTION` and
 *   `COMMIT` either all apply or none do. That guarantee is the DATABASE'S, not the
 *   execution model's, and declining to expose it did not make anything safer - it made
 *   multi-statement writes silently non-atomic.
 *
 * THE COST WAS CONCRETE, AND THE LEGACY REALLY DID HAVE THE GUARANTEE. Saving a
 * price-group rate touches the rate row and six owner link tables
 * [model/entity/PriceGroupRate.cfc:L71-L77]; deleting a price group must null its
 * children's parent link before removing the parent row
 * [model/entity/PriceGroup.cfc:L195]; deleting a product must clear `defaultSkuID`
 * before deleting the SKU it points at [model/entity/Product.cfc:L70-L76]. The legacy
 * performed each of those as `removeAllManyToManyRelationships()` followed by
 * `entityDelete()` [org/Hibachi/HibachiService.cfc:L49-L80,
 * org/Hibachi/HibachiDAO.cfc:L68-L76] - BOTH ORM SESSION OPERATIONS. No SQL was emitted
 * until the session flushed, and Hibernate flushes inside one JDBC transaction, so the
 * link deletes, the rate deletes and the row delete either all landed or none did. The
 * framework also reaches for `<cftransaction>` explicitly where it drives raw SQL over
 * several statements [org/Hibachi/HibachiDAO.cfc:L183-L263].
 *
 * Reproducing that with autocommit statements does not preserve behaviour, it DISCARDS a
 * guarantee the source had: a failure part-way through leaves a price group whose link
 * rows are gone and whose row remains, which no legacy execution could produce. ADDING
 * THIS METHOD IS THEREFORE RESTORING PARITY, not inventing a capability - and it is
 * bounded to that use: a fixed, small, known statement count for ONE aggregate, never a
 * loop over caller-supplied rows.
 *
 * NESTING JOINS RATHER THAN NESTS - see `transaction`. MySQL has no nested transactions:
 * a second `START TRANSACTION` on the same connection IMPLICITLY COMMITS the first, so a
 * naive nested implementation would silently commit an outer unit of work halfway
 * through. The executor handed to the callback therefore treats a further `transaction`
 * call as PARTICIPATION in the unit already open.
 */
export interface PreparedStatementExecutor {
  /**
   * Runs a result-set statement and returns its rows.
   *
   * @param sql - The statement, owned by the calling repository or by a module
   *   under `src/repositories/mysql/sql/`. It must be a literal the repository
   *   controls: values belong in `params`, never interpolated into this string.
   *   The one construct that legitimately varies is the placeholder count of an
   *   `IN` list - see `sqlPlaceholderList`.
   * @param params - Values for the positional `?` placeholders, in order. Typed
   *   `readonly unknown[]` so that no caller can smuggle an unbindable value past
   *   the compiler by widening; each element is checked before it is bound.
   * @returns The rows, each keyed by column name with `unknown` values. An empty
   *   result is an empty array, never `undefined`.
   * @throws An error named `SqlParameterError` when any element of `params` is
   *   not bindable, raised before the statement is sent; or whatever the driver
   *   raises for a connection or statement failure.
   */
  execute(sql: string, params?: readonly unknown[]): Promise<readonly SqlRow[]>;

  /**
   * Runs a data-modifying statement and returns what it affected.
   *
   * This is the replacement for the legacy `super.save()`, `super.delete()` and
   * `getHibachiDAO().save()` calls, which an ORM used to perform implicitly. It
   * is a separate method rather than a flag because the two statement kinds
   * return fundamentally different things, and a single method returning a union
   * would push a discriminating branch into every caller.
   *
   * @param sql - An `INSERT`, `UPDATE` or `DELETE` statement. Schema-changing
   *   statements are out of the question: this port reads and writes the existing
   *   `Sw*` tables unchanged and performs no migration of any kind.
   * @param params - Values for the positional `?` placeholders, in order.
   * @returns The affected-row count and the server warning count.
   * @throws An error named `SqlParameterError` when any element of `params` is
   *   not bindable, raised before the statement is sent; or whatever the driver
   *   raises for a connection or statement failure.
   */
  executeMutation(sql: string, params?: readonly unknown[]): Promise<SqlMutationResult>;

  /**
   * Runs `work` as one all-or-nothing unit against a single connection.
   *
   * This is the replacement for the ambient `cftransaction` the ORM opened around the
   * legacy save and delete cascades. It exists so that a multi-statement write can
   * reproduce legacy behaviour: either every statement applies or none does.
   *
   * ★★★ ATOMICITY BOUNDARY, AND THE CALLBACK MUST USE THE EXECUTOR IT IS GIVEN. The
   * `tx` argument is pinned to the one connection carrying the transaction, and every
   * statement issued through it goes to that connection inside that transaction.
   * Resolving commits; throwing rolls back and re-raises. Reaching PAST `tx` to the
   * outer executor - the repository's own `this.executor`, say - sends that statement on
   * a DIFFERENT pooled connection, outside the transaction, where it commits immediately
   * and survives a rollback. That is the single most likely way to misuse this method
   * and the compiler cannot catch it, which is why the transactional executor is handed
   * in as a parameter rather than left for the caller to guess at, and why every call
   * site is responsible for threading `tx` through.
   *
   * ★ IT IS FOR A SINGLE LOGICAL WRITE OVER A FIXED, SMALL STATEMENT COUNT, and not for
   * bulk work. The interface docblock above explains the distinction and why it matters
   * under this runtime's timeout budget; wrapping an unbounded loop here would hold
   * locks past the platform timeout.
   *
   * ★★ JOINS, NEVER NESTS - AND THE ALTERNATIVE WAS CONSIDERED AND REJECTED ON EVIDENCE
   * RATHER THAN ON TASTE. Calling `transaction` on a `tx` executor does NOT open a
   * second transaction, because MySQL has none to open: a second `START TRANSACTION` on
   * a connection implicitly commits whatever was already open, which would silently
   * commit work the caller believes is still provisional - a corruption, not an
   * inconvenience. There are two honest answers to that, JOIN or REFUSE, and an earlier
   * revision chose REFUSE on the stated grounds that "nothing in this codebase needs
   * nesting, and inventing savepoint semantics for a caller that does not exist would be
   * speculative." Emulating savepoints would indeed be speculative and is still not
   * done. But the premise no longer holds: a caller that nests DOES exist, and it is
   * load-bearing. `mysqlProductRepository.saveProduct` opens a transaction and then, for
   * every transient SKU the product carries, calls
   * `MysqlSkuRepository.saveSku(draft, productID, tx)` - which funnels through
   * `persistSku` and opens `executor.transaction` of its own. That is the circular
   * foreign key between `SwSku.productID` [model/entity/Sku.cfc:L65] and
   * `SwProduct.defaultSkuID` [model/entity/Product.cfc:L70] being written atomically,
   * which is the whole reason the outer transaction exists. Refusing the inner call would
   * make every new product with a SKU fail.
   *
   * So the inner call runs `work` INLINE on the same connection: a repository method that
   * wraps its own writes composes correctly when another adapter calls it from inside a
   * larger unit, and the OUTERMOST caller owns the commit. Joining is what makes the two
   * adapters composable without either of them knowing whether it is the outer one.
   *
   * @param work - The unit of work. Receives an executor bound to the transaction's
   *   connection and returns the value the caller wants back. Every statement it issues
   *   through `tx` participates in the transaction.
   * @returns Whatever `work` resolves to, after the commit has succeeded. A value
   *   returned here is a value that is durably committed.
   * @throws Whatever `work` throws, after the transaction has been rolled back and the
   *   connection released; or whatever the driver raises acquiring the connection,
   *   beginning the transaction or committing it. The original failure is preserved and
   *   re-thrown: a rollback that itself fails is logged and deliberately does not mask
   *   it, because the caller needs to see why the work failed, not why the cleanup did.
   */
  transaction<T>(work: (tx: PreparedStatementExecutor) => Promise<T>): Promise<T>;
}

// --- Failure reporting -------------------------------------------------------
// Two distinct faults, two distinct types, following the pattern already
// established by `src/repositories/mysql/dialect.ts`: the class is local, it sets
// an explicit `name`, and callers identify it by that name rather than by
// importing the constructor. Keeping the constructors unexported keeps this
// module's surface to the connection contract itself.
//
// Neither message ever echoes a REJECTED VALUE. Only its position and its
// JavaScript type appear. A bound parameter can be a credential, an email address
// or a card number, and an error message is one of the easiest ways for such a
// value to reach a log stream. `src/lib/config.ts` takes the same position for
// the same reason, and `src/lib/logger.ts` enforces it independently on the
// context object.

/**
 * The largest `IN`-list placeholder count this port will render.
 *
 * NOT AN INVENTED LIMIT - it is the MySQL client/server protocol's own ceiling.
 * `COM_STMT_PREPARE_OK` reports the placeholder count of a prepared statement in
 * a two-byte little-endian field, so a statement cannot carry more than 65535
 * placeholders no matter what the client sends. Asking for more has exactly one
 * possible outcome at the server, which is a refusal; the only question is whether
 * this process allocates and joins a multi-megabyte string first.
 *
 * That question is the finding. `count` used to be admitted on
 * `Number.isSafeInteger(count) && count >= 1` alone, which admits 2^53 - 1: the
 * `new Array(count).fill('?').join(', ')` below would then attempt roughly three
 * bytes per element and abort the container on memory rather than on a bad request.
 * Every list that reaches here originates in a caller-supplied comma-list - the
 * seven named in the contract block above - so the count is attacker-influenced,
 * which makes the allocation the cheapest denial-of-service in the port. Refusing
 * ABOVE the protocol ceiling costs one comparison and cannot reject any request
 * the server would have accepted.
 */
const MAX_PLACEHOLDER_COUNT = 65535;

/** A caller asked for a placeholder list that cannot be rendered. */
class SqlPlaceholderCountError extends Error {
  /** The rejected count, kept for programmatic inspection. */
  readonly count: number;

  constructor(count: number) {
    super(
      [
        `An IN-list placeholder count must be a safe integer from 1 to ${String(MAX_PLACEHOLDER_COUNT)};`,
        `received ${String(count)}.`,
        'MySQL cannot parse IN (), so a zero-length list must be short-circuited by the caller',
        'rather than rendered: an empty list means the predicate contributes nothing. The legacy',
        'code branches the same way at model/dao/PromotionDAO.cfc:L121, :L125 and',
        'model/dao/ProductDAO.cfc:L65.',
        'The upper bound is the two-byte placeholder count of COM_STMT_PREPARE_OK, so a larger',
        'statement could not be prepared by the server in any case.',
      ].join(' '),
    );
    this.name = 'SqlPlaceholderCountError';
    this.count = count;
  }
}

/**
 * A caller passed something that cannot be bound to a `?` placeholder.
 *
 * THE STATEMENT IS DELIBERATELY NOT CARRIED. An earlier revision of this class
 * embedded a bounded preview of the SQL to help locate the call site, and that
 * was a disclosure defect rather than a convenience. This error is raised on the
 * request path, so it can reach the generic error mapper and from there a log
 * stream; statement text names tables and columns of the live `Sw*` schema, and a
 * driver-adjacent failure is exactly the sort an unauthenticated caller can
 * provoke. The position and the type of the offending parameter locate the fault
 * on their own - the parameter index identifies which bind is wrong, and the
 * type names the mistake - while the correlation identifier on the mapped
 * response joins the caller's response to the full context.
 */
class SqlParameterError extends Error {
  /** Zero-based position of the offending parameter within the array. */
  readonly parameterIndex: number;

  /** The offending value's JavaScript type or constructor name. Never its value. */
  readonly receivedType: string;

  constructor(parameterIndex: number, receivedType: string) {
    super(
      [
        `Parameter at index ${String(parameterIndex)} is not bindable: received ${receivedType}.`,
        'Bind a string, number, bigint, boolean, Date, Buffer or null.',
        'Use null for SQL NULL - undefined is not bindable, and the driver excludes it from the',
        'value type of a prepared statement deliberately.',
        'Convert a Money or Decimal to a decimal STRING first, so currency never round-trips',
        'through a floating-point number.',
        'Do not pass an array: a prepared statement does not expand IN (?), so build the',
        'placeholders with sqlPlaceholderList and bind one parameter per element.',
      ].join(' '),
    );
    this.name = 'SqlParameterError';
    this.parameterIndex = parameterIndex;
    this.receivedType = receivedType;
  }
}

// ---------------------------------------------------------------------------
// !! THE `IN (?)` CONTRACT - READ THIS BEFORE WRITING ANY REPOSITORY QUERY
//
// A MySQL PREPARED STATEMENT DOES NOT EXPAND `IN (?)` FROM A LIST. One
// placeholder binds one scalar, always, and the consequence is worse than losing
// the extra values: `WHERE x IN (?)` bound with `'a,b,c'` becomes an equality
// against the whole comma-joined STRING, so it matches NOTHING rather than
// matching `a`. Verified directly against MySQL 8.0 during implementation - the
// three-placeholder form returned all three rows and the single-placeholder form
// returned zero. There is no error and no warning; the query simply comes back
// empty. Because every statement in this port is a prepared statement, this
// applies to every one of them.
//
// THE RULE. Tokenize the comma-list at the boundary, render exactly as many
// placeholders as there are elements, and bind one parameter per element:
//
//     const ids = splitList(selectedOptions);              // n elements
//     const sql = `... WHERE o.optionID IN (${sqlPlaceholderList(ids.length)})`;
//     await executor.execute(sql, ids);                     // n parameters
//
// The legacy boundary converter is `listToArray`, and it appears at exactly six
// in-scope sites - [model/dao/ProductDAO.cfc:L123], [model/dao/ProductDAO.cfc:L259],
// [model/dao/PromotionDAO.cfc:L122], [model/dao/PromotionDAO.cfc:L126],
// [model/dao/PromotionDAO.cfc:L129] and [model/dao/PriceGroupDAO.cfc:L95]. Those
// arrays reached Hibernate, which expanded them into an `IN` list on the port's
// behalf. Nothing expands them here, so the expansion becomes explicit.
//
// THE LISTS THIS AFFECTS. `selectedOptions`, `existingOptionGroupIDList`,
// `productTypeIDs`, `rewardTypeList`, `promotionCodeList`, `noQualRequiredList`
// and `attributeSetTypeCode`.
//
// AN EMPTY LIST IS A SYNTAX ERROR. `IN ()` does not parse in MySQL, so
// `sqlPlaceholderList` refuses a count below one rather than emitting it. The
// caller must short-circuit first, and the legacy code already branches that way:
// [model/dao/PromotionDAO.cfc:L121] and [model/dao/PromotionDAO.cfc:L125] add the
// clause only `<cfif len(...)>`, and [model/dao/ProductDAO.cfc:L65] switches
// parameter sets on `arrayLen(arguments.productTypeIDs)`. An empty list means the
// predicate contributes nothing, not that it matches nothing.
//
// THE ONE DOCUMENTED EXCEPTION - PRESERVE IT, DO NOT REPAIR IT.
//   [model/dao/ProductDAO.cfc:L66] binds `attributeSetTypeCode` as
//   `arrayToList(arguments.attributeSetTypeCode)`, flattening the array into a
//   SINGLE comma-delimited scalar, while the sibling branch at
//   [model/dao/ProductDAO.cfc:L68] binds the same argument as an array. The
//   single-scalar binding is behaviour, so it is reproduced as a single bound
//   parameter and must NOT be turned into a placeholder list.
//
//   TODO [model/dao/ProductDAO.cfc:L64]: "Remove this conditional when railo and
//   ACF match how they handle arrays for 'IN' clause". Carried over verbatim as a
//   flagged TODO, not silently completed. Resolving it would mean choosing one of
//   the two bindings over the other, which changes which rows the query returns,
//   so it needs a product decision rather than a cleanup commit.
//
// SCOPE OF THIS BLOCK. Documentation, plus the one small shared helper below.
// Statement text itself belongs to the repositories and to the five extracted
// modules under `src/repositories/mysql/sql/`; this file is not a SQL builder and
// must not grow into one.
// ---------------------------------------------------------------------------

/**
 * The placeholder body of an `IN` list: `?` for one, `?, ?, ?` for three.
 *
 * Shared because seven distinct comma-lists across six repositories need it and
 * hand-rolling the join at each site is how an off-by-one between placeholder
 * count and parameter count gets introduced.
 *
 * @param count - How many values will be bound, which must equal the length of
 *   the array passed to `execute`. Must be a safe integer from 1 to
 *   `MAX_PLACEHOLDER_COUNT`.
 * @returns The comma-separated placeholder body, WITHOUT the surrounding
 *   parentheses, so the caller keeps the parentheses visible in its own SQL.
 * @throws An error named `SqlPlaceholderCountError` when `count` is not a safe
 *   integer in range - including zero, which would render the unparseable
 *   `IN ()` and must instead be short-circuited by the caller, and including any
 *   count above the protocol's own placeholder ceiling.
 */
export function sqlPlaceholderList(count: number): string {
  // The range check precedes the allocation deliberately: rejecting AFTER
  // `new Array(count)` would already have committed the memory this guard exists
  // to refuse.
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_PLACEHOLDER_COUNT) {
    throw new SqlPlaceholderCountError(count);
  }

  return new Array<string>(count).fill('?').join(', ');
}

// --- Multi-row tuple bodies --------------------------------------------------
//
// SECURITY REVIEW DISPOSITION - RAISED AS S-12, ACCEPTED. Two link-table writers
// built a multi-row `VALUES` body by repeating a two-placeholder tuple once per
// collection member: `buildSkuOptionInsertSql`
// (`./mysqlSkuRepository.ts`, reconciling `SwSkuOption` for
// [model/entity/Sku.cfc:L76]) and `buildRateLinkInsertSql`
// (`./mysqlPriceGroupRepository.ts`, reconciling the six link tables of
// [model/entity/PriceGroupRate.cfc:L71-L77]). Neither validated a row count, a row
// width or a total before allocating, so member-count growth turned straight into
// unbounded string and parameter allocation - the same class of defect
// `sqlPlaceholderList` above was already hardened against, in builders that had
// been missed because their placeholders are grouped rather than flat.
//
// WHY A CEILING HERE IS NOT A BEHAVIOUR CHANGE. AAP 0.6.5 requires exactly this of
// the bulk paths on Lambda - "explicit batch limits, idempotency on retry, and a
// documented compensation story" - because the legacy ran them under an ambient
// `cftransaction` and a one-hour request budget that Lambda does not offer. A
// collection larger than one batch is CHUNKED rather than refused, and the chunks
// run inside the transaction the caller already opened, so the observable end state
// is identical to the single statement it replaces. Nothing a legitimate write
// could ask for is rejected.

/**
 * The widest tuple this builder will render.
 *
 * Both current callers write two columns, and the widest link table in the whole
 * in-scope schema is a two-column join row - the tables carry no surrogate key, no
 * audit columns and no payload [model/entity/PriceGroupRate.cfc:L71-L77]. Sixty-four
 * is therefore far above any shape the schema can produce while still refusing a
 * width that could only come from a defect in the caller.
 */
export const MAX_TUPLE_ROW_WIDTH = 64;

/**
 * The application batch ceiling: how many tuples one statement may carry.
 *
 * This is the "lower application batch ceiling" the finding asks for, and it sits
 * far below the protocol's own `MAX_PLACEHOLDER_COUNT`. One thousand rows is orders
 * of magnitude above any real membership - a SKU's option rows are one per option
 * group [model/entity/Sku.cfc:L76], and a rate's exclusion lists are curated by
 * hand - so it cannot reject a legitimate write; what it does is put a bound on the
 * single allocation, leaving anything larger to arrive as successive chunks.
 */
export const SQL_TUPLE_ROW_LIMIT = 1000;

// A DERIVED INVARIANT, CHECKED ONCE AT MODULE LOAD RATHER THAN ONCE PER CALL.
// `MAX_TUPLE_ROW_WIDTH * SQL_TUPLE_ROW_LIMIT` is 64,000, which is below the 65,535
// placeholder ceiling of `COM_STMT_PREPARE_OK`, so no admissible width/count pair
// can exceed what the server could prepare. That is why `sqlTuplePlaceholderList`
// below carries no third per-call total check: it would be unreachable code
// pretending to be a guard. Asserting the relationship here instead means raising
// either constant without re-checking the product fails loudly at import, and the
// two exported constants let a test assert the same product independently.
if (MAX_TUPLE_ROW_WIDTH * SQL_TUPLE_ROW_LIMIT > MAX_PLACEHOLDER_COUNT) {
  throw new Error(
    `The tuple builder's own limits are inconsistent with the protocol ceiling: ` +
      `${String(MAX_TUPLE_ROW_WIDTH)} x ${String(SQL_TUPLE_ROW_LIMIT)} exceeds ` +
      `${String(MAX_PLACEHOLDER_COUNT)} bindable placeholders. Lower one of the two limits.`,
  );
}

/** Raised when a tuple body is asked for in a shape this builder refuses. */
class SqlTupleShapeError extends Error {
  /** Which dimension was rejected, for programmatic inspection. */
  readonly dimension: 'rowWidth' | 'rowCount';

  /** The rejected value. */
  readonly value: number;

  constructor(dimension: 'rowWidth' | 'rowCount', value: number, limit: number) {
    super(
      [
        `A multi-row VALUES body needs a ${dimension === 'rowWidth' ? 'row width' : 'row count'}`,
        `that is a safe integer from 1 to ${String(limit)}; received ${String(value)}.`,
        'Zero is refused rather than rendered because `VALUES` with no rows is a parse error, not',
        'an empty write - the caller must skip the collection instead.',
        dimension === 'rowCount'
          ? 'A collection larger than the batch ceiling must be chunked with `chunkTupleRows` and ' +
            'written as successive statements inside one transaction.'
          : 'No in-scope link table is this wide, so a width beyond the ceiling indicates a caller defect.',
      ].join(' '),
    );
    this.name = 'SqlTupleShapeError';
    this.dimension = dimension;
    this.value = value;
  }
}

/**
 * The `VALUES` body of a multi-row insert: `(?, ?)` for one row, `(?, ?), (?, ?)`
 * for two.
 *
 * Shared so that the row count, the tuple width and the bound-parameter count are
 * derived from the same two numbers at every call site, which is how a grouped
 * placeholder body and its flattened parameter array are kept from drifting apart.
 *
 * @param rowWidth - Columns per tuple. A safe integer from 1 to
 *   {@link MAX_TUPLE_ROW_WIDTH}.
 * @param rowCount - How many tuples to render. A safe integer from 1 to
 *   {@link SQL_TUPLE_ROW_LIMIT}; callers with more members chunk first.
 * @returns The comma-separated tuple bodies, parentheses included, ready to follow
 *   the `VALUES` keyword.
 * @throws An error named `SqlTupleShapeError` when either dimension is out of
 *   range. BOTH checks precede every allocation, which is the entire point: a
 *   rejection after `new Array(rowCount)` would already have committed the memory
 *   the guard exists to refuse.
 */
export function sqlTuplePlaceholderList(rowWidth: number, rowCount: number): string {
  if (!Number.isSafeInteger(rowWidth) || rowWidth < 1 || rowWidth > MAX_TUPLE_ROW_WIDTH) {
    throw new SqlTupleShapeError('rowWidth', rowWidth, MAX_TUPLE_ROW_WIDTH);
  }

  if (!Number.isSafeInteger(rowCount) || rowCount < 1 || rowCount > SQL_TUPLE_ROW_LIMIT) {
    throw new SqlTupleShapeError('rowCount', rowCount, SQL_TUPLE_ROW_LIMIT);
  }

  const rowBody = `(${sqlPlaceholderList(rowWidth)})`;

  return new Array<string>(rowCount).fill(rowBody).join(', ');
}

/**
 * Splits a collection into batches no larger than {@link SQL_TUPLE_ROW_LIMIT}.
 *
 * The counterpart to {@link sqlTuplePlaceholderList}: it is what lets a ceiling
 * bound the allocation without bounding what a caller may legitimately write. Each
 * returned batch is one statement's worth of rows, and writing them inside the
 * transaction the caller already holds keeps the delete-then-insert reconciliation
 * atomic - which is the compensation story AAP 0.6.5 asks to be documented, since
 * there is no ambient `cftransaction` to inherit. A failure part-way through rolls
 * every chunk back, so the collection is never left half-reconciled; and because
 * the reconciliation is a full rewrite rather than a diff, a retry after rollback
 * reaches the same end state, which is what makes it idempotent.
 *
 * @param rows - The members to write. Must not be empty: an empty collection means
 *   "emit no insert at all", a decision that belongs to the caller because it also
 *   governs whether the preceding delete is the whole operation.
 * @returns One or more batches, in the input's order, each of length 1 to
 *   {@link SQL_TUPLE_ROW_LIMIT}.
 * @throws An error named `SqlTupleShapeError` when `rows` is empty.
 */
export function chunkTupleRows<T>(rows: readonly T[]): readonly (readonly T[])[] {
  if (rows.length === 0) {
    throw new SqlTupleShapeError('rowCount', 0, SQL_TUPLE_ROW_LIMIT);
  }

  const batches: (readonly T[])[] = [];

  for (let offset = 0; offset < rows.length; offset += SQL_TUPLE_ROW_LIMIT) {
    batches.push(rows.slice(offset, offset + SQL_TUPLE_ROW_LIMIT));
  }

  return batches;
}

// --- Parameter admission -----------------------------------------------------

/** Reused for a call that binds nothing, so no array is allocated per call. */
const NO_PARAMETERS: readonly unknown[] = Object.freeze([]);

/**
 * Names the type of a rejected parameter without revealing the value itself.
 *
 * The constructor name is read through an optional shape rather than assumed to
 * exist, because a null-prototype object has no `constructor` at all. This is the
 * same technique `src/lib/logger.ts` uses in `describeOpaqueObject`, for the same
 * reason. Reporting `Decimal` or `Money` by name is the point: those are the two
 * most likely mistakes at this boundary, and a bare `object` would not say so.
 */
function describeRejectedType(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'an array';
  }

  const primitiveKind = typeof value;
  if (primitiveKind !== 'object') {
    return primitiveKind;
  }

  const { constructor } = value as { readonly constructor?: { readonly name?: unknown } };
  const constructorName = constructor?.name;

  if (typeof constructorName !== 'string' || constructorName.length === 0) {
    // A null-prototype object, or one whose constructor has been stripped.
    return 'an object';
  }

  // A plain object literal reports its constructor as `Object`, and saying "an
  // instance of Object" would be needlessly obscure about the commonest case.
  return constructorName === 'Object' ? 'an object' : `an instance of ${constructorName}`;
}

/**
 * Whether a value may be bound to a `?` placeholder.
 *
 * CFML parity [model/dao/PriceGroupDAO.cfc:L65]: `<cfqueryparam
 * cfsqltype="cf_sql_timestamp">` declared the type it expected and the engine
 * checked the value against it. Dropping that check entirely on the way to a
 * driver that accepts a much wider union would be a loss of fidelity, so it is
 * carried forward here as one explicit admission test.
 *
 * Four rejections are deliberate and each catches a specific, high-consequence
 * mistake rather than a hypothetical one:
 *
 *   * `undefined`. The driver's prepared-statement value type excludes it, while
 *     its unprepared counterpart includes it, so `undefined` is precisely the
 *     value that looks bindable and is not. SQL NULL is `null`.
 *   * An ARRAY. A prepared statement never expands `IN (?)`, so an array
 *     parameter is always the mistake the contract block above describes. This
 *     turns that documentation into a mechanical check.
 *   * ANY OTHER OBJECT, `Money` and `Decimal` above all. Money is `big_decimal`
 *     in the schema and must be bound as a decimal STRING; letting an arithmetic
 *     object reach the driver would leave its conversion to the driver's own
 *     coercion rules, which is exactly the floating-point exposure that
 *     `src/domain/valueObjects/money.ts` exists to eliminate.
 *   * A NON-FINITE number or an INVALID `Date`. `NaN` and an unparseable date are
 *     what a failed conversion produces, and binding either writes or matches
 *     nonsense silently. Rejecting them keeps a conversion bug at the boundary
 *     where it is diagnosable.
 */
function isSqlParameter(value: unknown): value is SqlParameter {
  if (value === null) {
    return true;
  }

  switch (typeof value) {
    case 'string':
    case 'bigint':
    case 'boolean':
      return true;
    case 'number':
      return Number.isFinite(value);
    default:
      break;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime());
  }

  return Buffer.isBuffer(value);
}

/**
 * Checks every parameter and returns them in the array shape the driver takes.
 *
 * The check runs BEFORE the statement is sent, so an unbindable value never
 * reaches the server and never occupies a pooled connection. The returned array
 * is a fresh mutable copy: the driver's parameter type is a mutable array, and
 * copying keeps the caller's `readonly` array genuinely read-only instead of
 * asserting the difference away.
 *
 * The statement is deliberately NOT a parameter. It is not needed to diagnose an
 * unbindable value - the index and the type do that - and taking it would invite
 * the disclosure defect that `SqlParameterError` documents.
 */
function toBoundParameters(params: readonly unknown[]): SqlParameter[] {
  const bound: SqlParameter[] = [];

  for (const [index, value] of params.entries()) {
    if (!isSqlParameter(value)) {
      throw new SqlParameterError(index, describeRejectedType(value));
    }

    bound.push(value);
  }

  return bound;
}

// --- Pool options - every one of them is a correctness decision --------------

/**
 * The site name reported if the configured dialect is not MySQL.
 *
 * Follows the constant-per-site convention of
 * `src/repositories/mysql/dialect.ts`, so the citation and the failure message
 * cannot drift apart.
 */
const POOL_CREATION_SITE =
  'config/configApplication.cfm:L2 (the configured datasource, opened here as a mysql2 pool)';

/**
 * The connection time zone, fixed at UTC.
 *
 * JUDGMENT CALL: THIS IS EXPLICIT ON PURPOSE, AND UTC IS THE PORT'S DOCUMENTED
 * POLICY. The driver's own default is `'local'`, which makes every `DATETIME`
 * bound and every `DATETIME` read depend on the container's clock configuration -
 * an implicit, environment-dependent answer to a question that decides money.
 *
 * The legacy behaviour it replaces was equally implicit but differently so: CFML
 * `now()` returns SERVER-LOCAL time, and the in-scope DAOs call it six times -
 * [model/dao/PromotionDAO.cfc:L117] and [model/dao/PromotionDAO.cfc:L306], plus
 * [model/dao/PriceGroupDAO.cfc:L65], [model/dao/PriceGroupDAO.cfc:L70],
 * [model/dao/PriceGroupDAO.cfc:L81] and [model/dao/PriceGroupDAO.cfc:L86]. Those
 * calls decide whether a promotion period is current, whether a promotion code is
 * still live, and whether a sale price has expired. Neither the legacy answer nor
 * an accidental one is acceptable in a port, so the policy is stated rather than
 * inherited: values cross this boundary in UTC, both directions.
 *
 * TWO OBLIGATIONS FOLLOW FOR REPOSITORY AUTHORS.
 *
 *   1. CAPTURE ONE TIMESTAMP PER INVOCATION AND BIND IT. Do not write SQL `NOW()`
 *      inline per branch. The legacy code is already careful about this and the
 *      port must stay at least as careful: [model/dao/PromotionDAO.cfc:L306]
 *      captures `timeNow` ONCE and then reuses that single value across the
 *      no-qualifier pre-query and all six branches of the UNION that follows. A
 *      per-branch `NOW()` could straddle a period boundary mid-statement and
 *      produce a self-inconsistent result set.
 *   2. NO CLOCK ABSTRACTION LIVES HERE. This constant makes the driver's
 *      conversion explicit; deciding what "now" is belongs to the caller, which
 *      is also why `isCurrent(now: Date)` takes its instant as a parameter on the
 *      domain side rather than reading a clock.
 */
const POOL_TIMEZONE = 'Z';

/**
 * Turns the resolved transport posture into the driver's `ssl` options, or
 * `undefined` when transport is deliberately off.
 *
 * WHY THIS EXISTS AT ALL. Without it the driver opens a plaintext socket, so the
 * MySQL handshake carries the account and its credential, and every statement
 * and every row travels unprotected. The MySQL protocol authenticates the CLIENT
 * to the server; nothing authenticates the SERVER to this client and nothing
 * protects the session unless TLS does it. The legacy host had no such gap to
 * inherit, because it never opened its own connection - it named a datasource
 * ALIAS at [config/configApplication.cfm:L2] and the ColdFusion administrator
 * owned the transport. Replacing that registry with a driver is what makes this
 * this file's responsibility; `src/lib/config.ts` explains the same seam from the
 * configuration side.
 *
 * THE MAPPING IS ONTO THE DRIVER'S OWN DOCUMENTED OPTIONS, not onto a
 * hand-rolled TLS callback:
 *
 *   verify-identity  { rejectUnauthorized: true, verifyIdentity: true }
 *   verify-ca        { rejectUnauthorized: true, verifyIdentity: false }
 *   disabled         no `ssl` key at all
 *
 * `rejectUnauthorized` makes the driver request the server certificate and
 * refuse a chain that does not verify against the trust anchor;
 * `verifyIdentity` additionally requires the certificate to name the host being
 * connected to. Note that the driver omits the TLS server name when the host is
 * an IP literal, which is exactly why `verify-ca` remains available: forcing
 * identity verification in that case would leave an operator with no option but
 * `disabled`, which is far worse than a verified chain without a host-name check.
 *
 * JUDGMENT CALL: `rejectUnauthorized` IS A LITERAL `true` IN BOTH ARMS AND IS
 * NEVER READ FROM CONFIGURATION. There is no variable for it, no override, and
 * no arm that sets it to false - a connection that encrypts without verifying is
 * defeated by any on-path actor able to present a certificate of its own, which
 * makes it strictly worse than the honest `disabled` mode it would be mistaken
 * for. `slatwall-ts/.env.example` records the same prohibition under
 * DELIBERATELY ABSENT. Do not add one.
 *
 * The trust anchor is optional: absent means the runtime's built-in public root
 * store, which is correct for a managed database signed by a public authority.
 * Verification is on either way - the anchor selects WHOM to trust, never
 * WHETHER to.
 *
 * THE PROTOCOL FLOOR COMES FROM THE RESOLVED POSTURE, NOT FROM A CONSTANT HERE.
 * An earlier form of this function pinned `minVersion` to a literal in this file,
 * on the argument that a floor should not be configurable. The floor is not
 * weakened by reading it from configuration, because the type that carries it
 * admits only `TLSv1.2` and `TLSv1.3` - `src/lib/config.ts` enforces the bound
 * with a closed union, so no environment value can select anything lower. What
 * reading it buys is the ability to RAISE the floor to 1.3 for a deployment whose
 * server supports it, which a literal made impossible.
 *
 * NOTHING ELSE ABOUT THE SECURE CONTEXT IS CONFIGURED. No `ciphers` override,
 * because hand-narrowing the suite list is how a deployment ends up weaker than
 * the platform default; and no `cert`/`key`, because client-certificate
 * authentication is not part of the legacy datasource contract
 * [config/configApplication.cfm:L1-L2] and adding it would invent one.
 *
 * @param tls - The resolved posture from `src/lib/config.ts`, already validated
 *   and already refused if it named `disabled` in production.
 * @returns The driver's `ssl` options, or `undefined` for `disabled`.
 */
function buildTlsOptions(tls: DatabaseTlsConfig): SslOptions | undefined {
  if (tls.mode === 'disabled') {
    return undefined;
  }

  const verification: SslOptions = {
    rejectUnauthorized: true,
    verifyIdentity: tls.mode === 'verify-identity',
    minVersion: tls.minimumVersion,
  };

  return tls.certificateAuthority === undefined
    ? verification
    : { ...verification, ca: tls.certificateAuthority };
}

/**
 * Builds the driver options from validated configuration.
 *
 * Every value comes from `src/lib/config.ts`, the owner of the database and
 * runtime keys and the only module this file consults for them - see the
 * ownership split in the module header, which also names the two other
 * environment owners (`src/lib/logger.ts` for LOG_LEVEL, `tests/setup.ts` for
 * TZ and TEST_LIVE_DATABASE). Nothing here has a fallback: a missing or
 * malformed value has already failed the process by the time this runs.
 *
 * PROPERTIES ARE READ ONE BY ONE, NOT SPREAD, AND THAT IS DELIBERATE. The
 * credential on `DatabaseConnectionConfig` is a prototype getter over a private
 * field, so it is not an own enumerable property; spreading the settings object
 * would silently drop the password and produce a pool that cannot authenticate.
 * `src/lib/config.ts` documents exactly this and asks callers to read the
 * properties they need.
 *
 * OPTIONS THAT ARE DELIBERATELY ABSENT are as much a part of this function as the
 * ones present:
 *
 *   * `decimalNumbers` - JUDGMENT CALL: THE MOST IMPORTANT LINE IN THIS FILE IS THE
 *     ONE THAT IS NOT HERE. Leaving it unset keeps the driver's default, so
 *     `DECIMAL` and `NEWDECIMAL` columns arrive as STRINGS. That is load-bearing
 *     for `src/domain/valueObjects/money.ts`, which is constructible only from a
 *     decimal string and never from a raw number, and it is what makes the
 *     `big_decimal` money columns - `SkuCurrency.price`
 *     [model/entity/SkuCurrency.cfc:L53], `PriceGroupRate.amount`
 *     [model/entity/PriceGroupRate.cfc:L54], `PromotionApplied.discountAmount`
 *     [model/entity/PromotionApplied.cfc:L53] and `PromotionReward.amount`
 *     [model/entity/PromotionReward.cfc:L61] - portable at all. Setting
 *     `decimalNumbers: true` would route every currency value through an
 *     IEEE-754 double and silently reintroduce exactly the drift that the single
 *     arithmetic surface exists to eliminate. DO NOT SET IT. It is not an
 *     optimization; it is a defect.
 *
 *     The hydration rule those columns imply belongs to the repositories, but it
 *     depends on this option so it is recorded here: the four columns above
 *     declare NO default, so SQL `NULL` must become `undefined`, never
 *     `Money.zero`. `Sku.listPrice`, `Sku.price` and `Sku.renewalPrice`
 *     [model/entity/Sku.cfc:L55-L57] do declare `default="0"` and are the
 *     exception. Substituting zero for the absent ones would sell products for
 *     free - the same reason `getPriceByCurrencyCode` has no `else` and no
 *     fallback [model/entity/Sku.cfc:L269-L273].
 *   * `namedPlaceholders` - JUDGMENT CALL: not enabled, so binding is POSITIONAL
 *     `?` with an ordered array everywhere. The legacy sites are named - HQL
 *     `:now` and `:activeFlag` [model/dao/PromotionDAO.cfc:L117-L118], and
 *     `<cfqueryparam>` elements - and they become positional in the port. One
 *     binding convention across six repositories is what lets the integration
 *     suites assert a parameter array positionally, and mixing the two
 *     conventions is how a statement ends up bound by name in one arm and by
 *     position in another.
 *   * `multipleStatements` - left off. Enabling it would let a single string
 *     carry more than one statement and would weaken the injection-safety
 *     property that parameterized execution exists to guarantee.
 *   * `supportBigNumbers` and `bigNumberStrings` - not set. Nothing in this slice
 *     needs them: the only large arithmetic is inside an `ORDER BY` expression -
 *     the option-group positional weight at [model/dao/SkuDAO.cfc:L194-L198] -
 *     which never appears in a result set, and the four use-count aggregates at
 *     [model/dao/PromotionDAO.cfc:L141], [model/dao/PromotionDAO.cfc:L196],
 *     [model/dao/PromotionDAO.cfc:L257] and [model/dao/PromotionDAO.cfc:L278]
 *     return values a JavaScript number represents exactly.
 *   * `dateStrings` - not set. `POOL_TIMEZONE` already makes the conversion
 *     policy explicit, and returning raw strings instead would push date parsing
 *     into six repositories.
 *   * `waitForConnections`, `queueLimit`, `charset`, `enableKeepAlive`,
 *     `resetOnRelease`, `typeCast`, `rowsAsArray`, `nestTables` - not set. The
 *     committed environment contract declares no variable for any of them, and
 *     this port adds none.
 *   * Anything that runs on connect. No `initSql`, no session `SET`, no probe
 *     statement. This module issues no SQL of its own at all, which is why there
 *     is no startup health check here either.
 */
function buildPoolOptions(): PoolOptions {
  const { database, pool, tls } = appConfig.load();
  const ssl = buildTlsOptions(tls);

  const options: PoolOptions = {
    host: database.host,
    port: database.port,
    database: database.database,
    user: database.user,
    password: database.password,
    connectionLimit: pool.connectionLimit,
    connectTimeout: pool.connectTimeout,
    maxIdle: pool.maxIdle,
    idleTimeout: pool.idleTimeout,
    timezone: POOL_TIMEZONE,
  };

  // The key is ADDED only when transport is on, rather than being present with an
  // `undefined` value. `exactOptionalPropertyTypes` is on, so an explicit
  // `ssl: undefined` would not type-check against the driver's optional member,
  // and the driver's own contract is "absent means plaintext"
  // [node_modules/mysql2/lib/connection_config.js:L146-L149].
  return ssl === undefined ? options : { ...options, ssl };
}

// --- The pool - one per container, and exactly one `createPool` call site -----

/**
 * The container's pool, once something has asked for it.
 *
 * This is the sanctioned module-scope state described in the file header, and it
 * is the only mutable module-level binding in this file that holds a resource.
 * `memoizedExecutor` below is derived from it and is reset with it.
 */
let memoizedPool: Pool | undefined;

/** The executor wrapping `memoizedPool`, so repeated wiring returns one object. */
let memoizedExecutor: PreparedStatementExecutor | undefined;

/**
 * The container's MySQL pool, created on first use and reused thereafter.
 *
 * JUDGMENT CALL: CREATION IS LAZY RATHER THAN AT MODULE EVALUATION, and this is
 * the same decision `src/lib/config.ts` documents for the same two reasons.
 * First, the Lambda artifact is a SINGLE BUNDLE, so a throw during module
 * evaluation would abort the evaluation of unrelated modules that merely share
 * that bundle. Second, module-evaluation side effects make a module impossible to
 * import in a test without a fully populated environment. The hard-failure
 * semantics are unchanged: the first thing a handler does is resolve
 * configuration and reach for a repository, so a misconfigured process still
 * fails during cold start, before it performs any work.
 *
 * CFML parity [config/configORM.cfm:L4-L7]: the legacy host treated an
 * unreachable datasource as fatal, not as a degraded mode - the `<cfcatch>` around
 * the `<cfdbinfo>` probe included `/admin/views/main/nodatasource.cfm` and then
 * `<cfabort/>`ed the request outright. That hard stop is preserved exactly: a
 * missing or malformed variable throws out of `appConfig.load()` and nothing here
 * substitutes a default, retries, or degrades. What is deliberately NOT
 * reproduced is the rendered diagnostic page, which belongs to the out-of-scope
 * admin subsystem and has no response to render into in a headless service; the
 * thrown error carries the diagnosis instead.
 *
 * Note that constructing a pool does not open a connection. The driver's pool
 * factory is synchronous and connects lazily on first use, which is why no
 * top-level `await` is needed anywhere in this module - and none may be added,
 * because the artifact is emitted as CommonJS and top-level `await` cannot be
 * lowered to it.
 *
 * @returns The one pool for this container. Calling this repeatedly is safe and
 *   never constructs a second pool.
 * @throws An error named `ConfigurationError`, raised by `src/lib/config.ts`, when
 *   the environment contract is unsatisfied; or one named `UnsupportedDialectError`
 *   when DB_DIALECT names a dialect this port does not implement.
 */
export function getConnectionPool(): Pool {
  if (memoizedPool !== undefined) {
    return memoizedPool;
  }

  // JUDGMENT CALL: the dialect is refused HERE, at the one place a pool is
  // built, rather than assumed. `src/repositories/mysql/dialect.ts` owns the
  // value - it is imported, never re-derived - and its own documentation invites
  // callers to assert early. The check is not ceremonial: this module builds a
  // MySQL driver pool, so opening one while DB_DIALECT says MicrosoftSQLServer or
  // Oracle10g would be silently wrong in the worst way, connecting successfully
  // and then failing on statement syntax deep inside a repository. The legacy
  // host could not make this mistake because it probed the live datasource for
  // its product name [config/configORM.cfm:L3]; replacing the probe with
  // configuration is what creates the possibility, so it is closed explicitly.
  const dialect = resolveConfiguredDialect();
  assertMySqlDialect(dialect, POOL_CREATION_SITE);

  memoizedPool = createPool(buildPoolOptions());

  // NO CONTEXT, AND THE ABSENCE IS THE POINT. An earlier revision passed the
  // port, the database name, the dialect and the connection limit, and that was a
  // disclosure defect rather than a diagnostic: every one of those values is
  // derived from the deployment environment, they name the topology of a live
  // datasource, and this line lands on stdout where a log stream is a far broader
  // audience than the operator who set the variables. A database name and a port
  // together are reconnaissance; a pool ceiling is capacity intelligence; the
  // dialect could only ever read `MySQL` here because `assertMySqlDialect` above
  // has already refused everything else, so it carried no information at all.
  //
  // What remains is the only fact this line was ever needed for: a pool was
  // constructed in this container, exactly once. An operator who needs to know
  // WHICH datasource reads the environment they configured; nothing about that
  // configuration is echoed back out. This matches the position `src/lib/config.ts`
  // already takes on the host and the position `src/lib/logger.ts` enforces
  // independently by redacting connection-shaped keys.
  logger.info('MySQL connection pool created');

  return memoizedPool;
}

/**
 * Adapts a pool to the narrow executor contract.
 *
 * Kept separate from `getConnectionPool` so that the adaptation - parameter
 * admission, the driver call, and the re-typing of rows - is a plain function
 * over its argument that reaches no module-scope state. It is the only place in
 * the port that names a driver type, and it is where the pool stops being visible.
 *
 * A test does NOT need this function: `PreparedStatementExecutor` is three methods
 * wide and a suite implements it directly rather than imitating a pool - including
 * `transaction`, whose test implementation is a one-liner that invokes the work
 * function with an executor recording onto the same log.
 *
 * @param pool - The pool every statement will be sent through. In production this
 *   is always `getConnectionPool()`; the parameter exists so that this function
 *   itself holds no reference to the singleton.
 * @returns A frozen executor. Freezing it means a caller cannot swap a method for
 *   one that reaches `query`, which is what makes the prepared-statement
 *   guarantee structural rather than advisory.
 */
export function createPoolExecutor(pool: Pool): PreparedStatementExecutor {
  return Object.freeze({
    async execute(
      sql: string,
      params: readonly unknown[] = NO_PARAMETERS,
    ): Promise<readonly SqlRow[]> {
      // The driver's row type is named here and nowhere else in the port. Its
      // `any`-valued index signature stops at this return: the annotation above
      // is `readonly SqlRow[]`, so every column leaves this file as `unknown`.
      const [rows] = await pool.execute<RowDataPacket[]>(sql, toBoundParameters(params));

      return rows;
    },

    async executeMutation(
      sql: string,
      params: readonly unknown[] = NO_PARAMETERS,
    ): Promise<SqlMutationResult> {
      const [header] = await pool.execute<ResultSetHeader>(sql, toBoundParameters(params));

      return Object.freeze({
        affectedRows: header.affectedRows,
        warningStatus: header.warningStatus,
      });
    },

    async transaction<T>(work: (tx: PreparedStatementExecutor) => Promise<T>): Promise<T> {
      // ONE CONNECTION FOR THE WHOLE UNIT - a pooled connection, not the pool.
      // `pool.execute` picks an arbitrary connection per call, so a transaction cannot be
      // expressed through it at all: `BEGIN` would land on one connection and the
      // statements that follow on others. Checking one out explicitly is the only correct
      // shape.
      const connection = await pool.getConnection();

      try {
        await connection.beginTransaction();

        const result = await work(createConnectionExecutor(connection));

        await connection.commit();

        return result;
      } catch (error: unknown) {
        await rollBackQuietly(connection);

        // RE-RAISED UNCHANGED. The caller's failure is the failure that matters, and
        // wrapping it here would hide the driver error a reviewer needs to read.
        throw error;
      } finally {
        // RELEASED ON EVERY PATH, including the one where the rollback itself failed.
        // A connection left checked out is a pool slot lost for the life of the
        // container, and a warm container that loses them all stops serving.
        connection.release();
      }
    },
  });
}

/**
 * Rolls back, and refuses to let a rollback failure mask the original one.
 *
 * ★ THE SWALLOW IS DELIBERATE AND IS NOT SILENT. If the transaction failed because
 * the connection died, the rollback will fail too - and throwing that second error
 * would replace the diagnostic the caller actually needs with a symptom of it. The
 * server also rolls back automatically when a connection drops, so the failure is
 * usually already handled. It is logged rather than discarded so an operator can see
 * that it happened.
 *
 * NOTHING IS LOGGED BUT THE FACT - no value, and NOT the driver error's own message.
 * A driver message is free text this module cannot police: `mysql2` composes it from
 * server output that can quote the offending statement and its literals, so forwarding
 * it as a context string would hand the log line exactly the SQL-and-binding material
 * that `src/lib/logger.ts` redacts by key everywhere else. The logger's own answer to
 * an error is `normalizeError`, which reduces one to its class name and error code and
 * replaces the message with a marker; passing the message across as a plain string
 * would route around that reduction rather than use it.
 *
 * ★ QUOTE-THEN-REVISE: an earlier revision inlined this and logged
 * `{ rollbackErrorName: rollbackError instanceof Error ? rollbackError.name : 'unknown' }`
 * alongside the message. The class name alone leaks nothing, so that was not a defect -
 * but it routed around `normalizeError` to say something the message already implies, and
 * it made this one call the only place in the file that attaches context to a lifecycle
 * failure. Carrying NO CONTEXT AT ALL is the same position the two pool lifecycle lines
 * take, and for the same reason. The message text names the operation, and the operation
 * is the whole diagnostic: a rollback failure is interesting because it happened, and the
 * error that caused the transaction to fail in the first place still reaches the caller
 * unwrapped on the line above.
 */
async function rollBackQuietly(connection: PoolConnection): Promise<void> {
  try {
    await connection.rollback();
  } catch {
    logger.error('MySQL transaction rollback failed');
  }
}

/**
 * An executor pinned to one connection, for the duration of one transaction.
 *
 * Not exported: the only way to obtain one is to be inside
 * `PreparedStatementExecutor.transaction`, which is what makes "this statement is
 * inside the transaction" a property of where the executor came from rather than
 * of a flag someone remembered to pass.
 *
 * `transaction` here JOINS rather than nests, for the MySQL reason documented on
 * the interface: a second `START TRANSACTION` on this connection would implicitly
 * commit the unit already in progress. Running the callback inline keeps the
 * outermost caller in charge of the commit and lets a repository method that
 * wraps its own writes compose inside a larger service-level unit.
 *
 * @param connection - The pooled connection carrying the open transaction. This
 *   function neither begins, commits, rolls back nor releases it; the caller in
 *   `transaction` owns that whole lifecycle.
 * @returns A frozen executor whose every statement runs on `connection`.
 */
function createConnectionExecutor(connection: PoolConnection): PreparedStatementExecutor {
  const boundExecutor: PreparedStatementExecutor = Object.freeze({
    async execute(
      sql: string,
      params: readonly unknown[] = NO_PARAMETERS,
    ): Promise<readonly SqlRow[]> {
      const [rows] = await connection.execute<RowDataPacket[]>(sql, toBoundParameters(params));

      return rows;
    },

    async executeMutation(
      sql: string,
      params: readonly unknown[] = NO_PARAMETERS,
    ): Promise<SqlMutationResult> {
      const [header] = await connection.execute<ResultSetHeader>(sql, toBoundParameters(params));

      return Object.freeze({
        affectedRows: header.affectedRows,
        warningStatus: header.warningStatus,
      });
    },

    transaction<T>(work: (tx: PreparedStatementExecutor) => Promise<T>): Promise<T> {
      return work(boundExecutor);
    },
  });

  return boundExecutor;
}

/**
 * The executor the composition root wires into every repository.
 *
 * This is the single line `src/handlers/bootstrap.ts` (planned) needs, and it is the only
 * place production code should turn a pool into an executor. A repository must
 * never call it: repositories receive an executor as a constructor argument, and
 * calling this from inside one would reintroduce the service-locator pattern that
 * replacing DI/1 exists to remove - the same pattern the legacy entities used at
 * [model/entity/Sku.cfc:L258] and [model/entity/Product.cfc:L519].
 *
 * @returns The one executor over the one pool. Repeated calls return the same
 *   object, so wiring several repositories shares a single instance.
 * @throws Whatever `getConnectionPool` throws on the first call.
 */
export function getPreparedStatementExecutor(): PreparedStatementExecutor {
  memoizedExecutor ??= createPoolExecutor(getConnectionPool());

  return memoizedExecutor;
}

/**
 * Closes the pool and returns this module to its pre-creation state.
 *
 * FOR LOCAL SCRIPTS AND TEST HARNESSES. A short-lived process that has opened
 * the pool will not exit while pooled sockets are still open, so anything with a
 * defined end of life must call this. THE DEPLOYED RUNTIME DOES NOT CALL IT, and
 * must not: keeping the pool open across warm invocations is the whole point of
 * the module-scope exception, and closing it at the end of an invocation would
 * defeat it.
 *
 * JUDGMENT CALL: teardown is explicit and caller-driven. No `process.on('SIGTERM')`
 * handler is registered, deliberately. A hidden signal handler that closes a
 * shared resource is exactly the kind of ambient behaviour this port removes
 * everywhere else, it would fire during a platform-initiated shutdown that the
 * application has no reason to participate in, and it would make the lifetime of
 * the pool depend on process signals rather than on the caller that owns it.
 *
 * The memoized bindings are cleared BEFORE the close is awaited, so the module is
 * left in a state a later call can rebuild from - which is what lets a harness
 * close and reopen. Shutdown must therefore not race in-flight work: it is an
 * end-of-life operation, not a way to recycle connections under load.
 *
 * @returns A promise that settles once the driver has closed the pool. Calling
 *   this when no pool was ever created resolves immediately and does nothing, so
 *   it is safe in an unconditional cleanup hook.
 */
export async function closeConnectionPool(): Promise<void> {
  const pool = memoizedPool;

  memoizedPool = undefined;
  memoizedExecutor = undefined;

  if (pool === undefined) {
    return;
  }

  await pool.end();

  logger.info('MySQL connection pool closed');
}
