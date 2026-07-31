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
//   * `src/lib/config.ts` READS AND VALIDATES the environment. It is the only
//     module in this port that touches `process.env`, and it owns the three keys
//     this file replaces: `datasource`, `datasourceUsername`, `datasourcePassword`
//     (DB_NAME, DB_USER, DB_PASSWORD) plus the host, port and pool variables the
//     driver needs. This file reads nothing from the environment directly.
//   * `src/repositories/mysql/dialect.ts` OWNS `databaseType` (DB_DIALECT). The
//     dialect is never re-derived here; it is imported, and used for exactly one
//     purpose - refusing to build a MySQL pool for a non-MySQL dialect.
//   * THIS FILE turns those validated values into a pool and an executor.
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
import type { Pool, PoolOptions, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
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
 * The narrow execution surface every repository receives.
 *
 * THIS IS A MANDATORY DESIGN CONSTRAINT, NOT A CONVENIENCE. Each of the six
 * MySQL repositories MUST take this as a CONSTRUCTOR PARAMETER. No repository may
 * import the pool, or a pool-backed executor, as a module singleton and reach it
 * directly.
 *
 * JUDGMENT CALL: constructor injection exists for two reasons that both matter.
 * First, it makes the emitted SQL text and the bound parameter array assertable
 * WITHOUT A LIVE SERVER. This interface is two methods wide precisely so that a
 * suite can implement it outright - recording each `sql` string and each `params`
 * array and returning canned rows - which is how the integration suites under
 * `tests/integration/repositories/` verify statement shape and binding against no
 * database at all. Nothing there needs to imitate a pool or a connection. Second,
 * it keeps the one sanctioned module-scope pool from leaking into six files; the
 * single wiring point is the composition root at `src/handlers/bootstrap.ts`,
 * which is what replaces DI/1's runtime convention scan under transformation rule
 * T1.
 *
 * JUDGMENT CALL: there is no `query` method, and there is no way to reach one
 * through this interface. Everything here routes through the driver's
 * `execute`, which is a server-side prepared statement, so parameterization is
 * structural rather than a habit a reviewer has to police. That is the property
 * `<cfqueryparam>` provided in the legacy DAOs and it is preserved exactly.
 *
 * JUDGMENT CALL: there is no transaction method either. The legacy bulk paths ran
 * under an ambient CFML transaction, with a request timeout raised far beyond
 * anything this runtime offers [model/service/ProductService.cfc:L66], and no
 * such ambient scope exists here. Bulk correctness is therefore handled where the
 * plan puts it: explicit batch limits, idempotency on retry, and a documented
 * compensation story in the handlers. Adding a transaction here would imply a
 * guarantee the surrounding execution model does not provide.
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

/** A caller asked for a placeholder list that cannot be rendered. */
class SqlPlaceholderCountError extends Error {
  /** The rejected count, kept for programmatic inspection. */
  readonly count: number;

  constructor(count: number) {
    super(
      [
        `An IN-list placeholder count must be a positive safe integer; received ${String(count)}.`,
        'MySQL cannot parse IN (), so a zero-length list must be short-circuited by the caller',
        'rather than rendered: an empty list means the predicate contributes nothing. The legacy',
        'code branches the same way at model/dao/PromotionDAO.cfc:L121, :L125 and',
        'model/dao/ProductDAO.cfc:L65.',
      ].join(' '),
    );
    this.name = 'SqlPlaceholderCountError';
    this.count = count;
  }
}

/** A caller passed something that cannot be bound to a `?` placeholder. */
class SqlParameterError extends Error {
  /** Zero-based position of the offending parameter within the array. */
  readonly parameterIndex: number;

  /** The offending value's JavaScript type or constructor name. Never its value. */
  readonly receivedType: string;

  /** A bounded preview of the statement, for locating the call site. */
  readonly statementPreview: string;

  constructor(parameterIndex: number, receivedType: string, statementPreview: string) {
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
        `Statement: ${statementPreview}`,
      ].join(' '),
    );
    this.name = 'SqlParameterError';
    this.parameterIndex = parameterIndex;
    this.receivedType = receivedType;
    this.statementPreview = statementPreview;
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
 *   the array passed to `execute`. Must be a positive safe integer.
 * @returns The comma-separated placeholder body, WITHOUT the surrounding
 *   parentheses, so the caller keeps the parentheses visible in its own SQL.
 * @throws An error named `SqlPlaceholderCountError` when `count` is not a
 *   positive safe integer - including zero, which would render the unparseable
 *   `IN ()` and must instead be short-circuited by the caller.
 */
export function sqlPlaceholderList(count: number): string {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new SqlPlaceholderCountError(count);
  }

  return new Array<string>(count).fill('?').join(', ');
}

// --- Parameter admission -----------------------------------------------------

/** How much of a statement appears in a failure message. */
const STATEMENT_PREVIEW_LIMIT = 160;

/** Reused for a call that binds nothing, so no array is allocated per call. */
const NO_PARAMETERS: readonly unknown[] = Object.freeze([]);

/**
 * A single-line, length-bounded rendering of a statement, for a failure message.
 *
 * Safe to include: statement text in this port is always a literal owned by a
 * repository or by a module under `src/repositories/mysql/sql/`, never anything a
 * request supplied. It is bounded because the sale-price statement at
 * [model/dao/PromotionDAO.cfc:L298-L591] is a six-branch UNION and would
 * otherwise bury the diagnosis it is meant to support.
 */
function previewStatement(sql: string): string {
  const singleLine = sql.replace(/\s+/g, ' ').trim();

  return singleLine.length > STATEMENT_PREVIEW_LIMIT
    ? `${singleLine.slice(0, STATEMENT_PREVIEW_LIMIT)}...`
    : singleLine;
}

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
 */
function toBoundParameters(sql: string, params: readonly unknown[]): SqlParameter[] {
  const bound: SqlParameter[] = [];

  for (const [index, value] of params.entries()) {
    if (!isSqlParameter(value)) {
      throw new SqlParameterError(index, describeRejectedType(value), previewStatement(sql));
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
 * Builds the driver options from validated configuration.
 *
 * Every value comes from `src/lib/config.ts`, which is the only module in this
 * port that reads `process.env`. Nothing here has a fallback: a missing or
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
 *   * `ssl` - not set, because `slatwall-ts/.env.example` declares no variable
 *     for it and inventing one would break the contract that file defines.
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
  const { database, pool } = appConfig.load();

  return {
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

  const options = buildPoolOptions();
  memoizedPool = createPool(options);

  // Exactly four fields, and the omissions are the point. The host is left out
  // even though it is not secret: `src/lib/config.ts` documents it as never
  // echoed in diagnostics, and `src/lib/logger.ts` independently redacts the key
  // `host`, so passing it would emit a redaction marker and nothing more. The
  // account, the credential, the settings object and any composed connection
  // string are never passed at all.
  logger.info('MySQL connection pool created', {
    port: options.port,
    database: options.database,
    dialect,
    connectionLimit: options.connectionLimit,
  });

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
 * A test does NOT need this function: `PreparedStatementExecutor` is two methods
 * wide and a suite implements it directly rather than imitating a pool.
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
      const [rows] = await pool.execute<RowDataPacket[]>(sql, toBoundParameters(sql, params));

      return rows;
    },

    async executeMutation(
      sql: string,
      params: readonly unknown[] = NO_PARAMETERS,
    ): Promise<SqlMutationResult> {
      const [header] = await pool.execute<ResultSetHeader>(sql, toBoundParameters(sql, params));

      return Object.freeze({
        affectedRows: header.affectedRows,
        warningStatus: header.warningStatus,
      });
    },
  });
}

/**
 * The executor the composition root wires into every repository.
 *
 * This is the single line `src/handlers/bootstrap.ts` needs, and it is the only
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
