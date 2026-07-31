// ---------------------------------------------------------------------------
// slatwall-ts - static, environment-driven process configuration
//
// WHAT THIS MODULE IS
//   The one place this service reads its process environment. It resolves,
//   validates, freezes and memoizes the values needed to reach the existing
//   `Sw*` MySQL schema, and it fails the process outright the moment any of
//   them is missing or malformed. It contains no credential of its own: every
//   value originates in the environment, and the committed contract for that
//   environment is `slatwall-ts/.env.example`, which this module consumes
//   key-for-key - adding no variable and omitting none that is assigned to it.
//
// WHERE THE CONTRACT COMES FROM
//   The legacy CFML host published its datasource configuration as application
//   values. This module is the one-for-one replacement for exactly those four:
//
//     [Application.cfc:L78]  "datasource"          -> DB_NAME
//     [Application.cfc:L81]  "datasourceUsername"  -> DB_USER
//     [Application.cfc:L84]  "datasourcePassword"  -> DB_PASSWORD
//     [Application.cfc:L87]  "databaseType"        -> DB_DIALECT
//
//   [config/configApplication.cfm:L2] pins the datasource name to the literal
//   `Slatwall`, which is therefore the documented default for DB_NAME. Host and
//   port have no legacy counterpart at all: the CF administrator held them
//   inside its datasource definition, whereas a driver must be told them, so
//   DB_HOST and DB_PORT are additions the driver requires rather than values
//   carried over.
//
//   [config/configORM.cfm:L1-L15] did not configure the dialect - it PROBED for
//   it - and that probe becomes explicit configuration here. The three
//   semantics carried over from it are documented on `resolveDatabaseDialect`.
//
// WHAT IS DELIBERATELY NOT MODELLED HERE
//   Each omission below is a decision, not an oversight, and each is annotated
//   at the point it would otherwise have been introduced.
//
//   * The CFML application name at [config/configApplication.cfm:L1] -
//     `"slatwall" & hash(getCurrentTemplatePath())` - is an application-scope
//     identifier for a persistent CFML application. A Lambda invocation has no
//     analogue, so no application-name variable exists.
//   * The ORM component-location registration at [config/configORM.cfm:L1] has
//     no counterpart: this port has no ORM. Persistence is hand-written SQL over
//     prepared statements in `src/repositories/mysql/**`, so there is no
//     `cfclocation`, no Hibernate setting and no entity mapping here.
//   * `slatwallRootURL`, published from the FW/1 base URL at
//     [Application.cfc:L75], and the subsystem-prefix routing convention at
//     [Application.cfc:L129-L137] (`getSubsystemDirPrefix`) are routing
//     artifacts. API Gateway plus `src/handlers/router.ts` replace them under
//     transformation rule T5, so this module carries no base URL, no root URL
//     and no routing knowledge whatsoever.
//   * Dialect INTERPRETATION. This module supplies a validated dialect value;
//     `src/repositories/mysql/dialect.ts` decides what that value means for SQL
//     generation and rejects the branches this port does not implement. Keeping
//     the two apart is why a value this module accepts can still be refused
//     downstream.
//   * The log level. `src/lib/logger.ts` reads it directly and independently -
//     see the note on module independence above `appConfig`.
//   * The test-only live-database flag, which `slatwall-ts/.env.example` records
//     as read by `tests/setup.ts` and by nothing under `src/**`.
//   * Any cloud access key, session token or region variable; any product-feed
//     credential (that adapter is a stub and makes no outbound call); any
//     schema-management or data-loading switch (the `Sw*` tables are used
//     exactly as they already exist); any infrastructure-as-code value; any
//     legacy content-bridge value; any lock-duration value; and any package
//     registry token. `slatwall-ts/.env.example` records the same list under
//     DELIBERATELY ABSENT, with the reason for each.
//
// THIS IS NOT A REQUEST SCOPE, AND MUST NEVER BECOME ONE
//   The legacy code reached ambient per-request state through a scope accessor,
//   inconsistently enough that both spellings appear inside a single seven-line
//   method: `getSlatwallScope()` at [model/service/PriceGroupService.cfc:L263]
//   and `getHibachiScope()` at [model/service/PriceGroupService.cfc:L264].
//   Transformation rule T6 replaces both with an explicit context parameter
//   threaded down the call chain, owned by the service and domain layers.
//
//   Consequently this module holds STATIC PROCESS CONFIGURATION ONLY. It must
//   never grow a current account, a logged-in flag, a session, a request
//   identifier, per-invocation mutable state, an `AsyncLocalStorage`, or any
//   other ambient context. Anything that varies per invocation belongs in an
//   explicit parameter, not here.
//
// LAYER POSITION
//   `src/lib/` is the base of the dependency flow: the domain, service,
//   repository, integration and handler layers may import from it, and it
//   imports from none of them. This file goes further and has NO imports at
//   all - see the justification above `appConfig`.
//
// THE BINDING STANDARD
//   No user-specified rules were provided for this project. That absence is not
//   licence to lower the bar: the enterprise substitute standard applies at full
//   strength, and no rule has been invented to fill the gap. The practices it
//   imposes that bear directly on this file are maximal TypeScript strictness
//   (no `any`, no suppression comment, no non-null assertion), one exported unit
//   with no default export and no barrel, exact dependency pinning, and -
//   defining for this module - environment-driven configuration with no
//   hardcoded credential.
//
// TEST COVERAGE
//   Net-new. No legacy test touches configuration: the only legacy suites
//   extended anywhere in this port are `meta/tests/unit/entity/BrandTest.cfc`
//   and `meta/tests/unit/entity/ProductTest.cfc`. Coverage for this module is
//   therefore new work and must not be presented as parity. Every branch here
//   is reachable without touching global state, through the optional
//   environment-source parameter on `appConfig.load`.
// ---------------------------------------------------------------------------

/**
 * A read-only view of an environment-variable source.
 *
 * `process.env` satisfies this shape. Accepting it as a parameter rather than
 * reading the global directly is what lets every branch below be exercised
 * deterministically, without a test having to mutate - and then restore - real
 * process state.
 */
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

/**
 * The canonical ORM dialect spellings, exactly as the legacy host wrote them at
 * [config/configORM.cfm:L10], [config/configORM.cfm:L12] and
 * [config/configORM.cfm:L14].
 *
 * Held as a runtime tuple, and not merely as a type, so that validation and the
 * text of the failure message are driven by one list and cannot drift apart. It
 * is deliberately NOT exported: this module exposes a single unit, and a
 * consumer needing exhaustiveness should switch over `DatabaseDialect` and let
 * the compiler prove the switch total.
 */
const DATABASE_DIALECTS = ['MySQL', 'MicrosoftSQLServer', 'Oracle10g'] as const;

/**
 * The ORM dialect, restricted to the three spellings the legacy host could
 * produce. Supplied by this module; interpreted by
 * `src/repositories/mysql/dialect.ts`.
 */
export type DatabaseDialect = (typeof DATABASE_DIALECTS)[number];

/**
 * The accepted values of the standard Node environment selector, taken from the
 * `NODE_ENV` entry in `slatwall-ts/.env.example`.
 */
const RUNTIME_ENVIRONMENTS = ['development', 'test', 'production'] as const;

/** The resolved Node environment selector. */
export type RuntimeEnvironment = (typeof RUNTIME_ENVIRONMENTS)[number];

/**
 * How to reach the MySQL server that holds the existing `Sw*` schema.
 *
 * `password` is deliberately absent from anything this object serializes to;
 * see `toJSON` and the implementing class for how that is guaranteed rather
 * than merely intended.
 */
export interface DatabaseConnectionConfig {
  /** Server host name. Required; no default, and never echoed in diagnostics. */
  readonly host: string;
  /** Server TCP port. Defaults to the registered MySQL port. */
  readonly port: number;
  /**
   * Schema name. Defaults to the literal `Slatwall`, verbatim from
   * [config/configApplication.cfm:L2]. The capital S is significant.
   */
  readonly database: string;
  /** Connecting account. Required; no default, and never echoed in diagnostics. */
  readonly user: string;
  /**
   * That account's credential. Required, with no default.
   *
   * Read this property directly. It is intentionally not an own enumerable
   * property, so it survives neither object spread nor `Object.keys`, and it
   * never appears in `JSON.stringify` output or in default console inspection.
   */
  readonly password: string;
  /**
   * A projection safe to log or serialize: identical to this object except that
   * the credential is replaced by a redaction marker.
   */
  toJSON(): Readonly<Record<string, string | number>>;
}

/**
 * Operational settings for the connection pool that
 * `src/repositories/mysql/connection.ts` creates. Each maps one-to-one onto a
 * driver pool option.
 *
 * These are configurable operational values with conservative starting points,
 * to be tuned per environment. They are not targets of any kind, and none is
 * derived from a target: the legacy system states no such figure and none is
 * invented here.
 */
export interface DatabasePoolConfig {
  /** Upper bound on how many connections the pool may open (`connectionLimit`). */
  readonly connectionLimit: number;
  /** How long to wait for a TCP connection, in milliseconds (`connectTimeout`). */
  readonly connectTimeout: number;
  /** Upper bound on idle connections the pool retains (`maxIdle`). */
  readonly maxIdle: number;
  /** How long an idle connection is retained, in milliseconds (`idleTimeout`). */
  readonly idleTimeout: number;
}

/**
 * The fully resolved, validated and frozen process configuration.
 *
 * The four members mirror the four groups of `slatwall-ts/.env.example` that
 * name this module as their reader, one for one, so that the mapping from the
 * committed contract to the code that consumes it stays auditable.
 */
export interface AppConfig {
  /** Node environment selector. */
  readonly environment: RuntimeEnvironment;
  /** Database connection settings. */
  readonly database: DatabaseConnectionConfig;
  /** ORM dialect, validated and normalized to its canonical spelling. */
  readonly dialect: DatabaseDialect;
  /** Connection-pool settings. */
  readonly pool: DatabasePoolConfig;
}

// --- Defaults ---------------------------------------------------------------
// Only two literal defaults in this file are permitted to be non-generic, and
// both are non-secret by nature: the schema name and the registered port. Host,
// account and credential deliberately have NO default, so a deployment cannot
// silently start against something other than what was intended.

/** Verbatim from [config/configApplication.cfm:L2]; the capital S is significant. */
const DEFAULT_DATABASE_NAME = 'Slatwall';

/** The registered port for MySQL: a protocol default, not a credential. */
const DEFAULT_DATABASE_PORT = 3306;

/** Conservative starting point for the pool's connection ceiling. */
const DEFAULT_CONNECTION_LIMIT = 10;

/** Conservative starting point for the TCP connect wait, in milliseconds. */
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;

/** Conservative starting point for retained idle connections. */
const DEFAULT_MAX_IDLE = 10;

/** Conservative starting point for idle-connection retention, in milliseconds. */
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;

/** Matches the template value of `NODE_ENV` in `slatwall-ts/.env.example`. */
const DEFAULT_RUNTIME_ENVIRONMENT: RuntimeEnvironment = 'development';

/** Highest port number expressible in a 16-bit TCP port field. */
const MAX_TCP_PORT = 65_535;

/** Upper bound for the pool integers: the largest exactly representable integer. */
const MAX_POOL_INTEGER = Number.MAX_SAFE_INTEGER;

/**
 * An unsigned base-10 integer and nothing else.
 *
 * Deliberately stricter than `Number.parseInt`, which would accept `12abc` as
 * 12, and than `Number`, which would accept `1e3`, ` 12 ` and `0x0c`. A
 * misconfigured operational value must be reported, never silently reinterpreted.
 */
const UNSIGNED_INTEGER_PATTERN = /^\d+$/;

/**
 * How much of an offending value is echoed back in a failure message.
 *
 * Bounded on purpose. Echoing a rejected non-secret value is what makes a
 * failure diagnosable, but an unbounded echo would faithfully reproduce
 * whatever was pasted into the variable - so the echo is clipped, and is only
 * ever applied to the non-credential variables in the first place.
 */
const MAX_ECHOED_VALUE_LENGTH = 40;

/** The marker substituted for the credential in every serializable projection. */
const REDACTED_MARKER = '[REDACTED]';

// --- Failure reporting ------------------------------------------------------

/**
 * The single error this module ever throws.
 *
 * Not exported, because this module exposes exactly one unit. It is identifiable
 * at runtime by `error.name === 'ConfigurationError'`, and it carries the full
 * list of problems both in `message` and, structured, in `problems`.
 *
 * No value read from DB_HOST, DB_USER or DB_PASSWORD is ever passed to this
 * constructor. That is enforced structurally rather than by review: the
 * resolvers for those three variables build their problem text from the variable
 * NAME only and never receive the value into a message, so no credential, host
 * name or connection string can reach a message, a stack trace or a log line.
 */
class ConfigurationError extends Error {
  /** Every problem found in a single pass, in the order the variables are read. */
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(formatProblems(problems));
    // Set here rather than as a class field so that no `override` modifier is
    // needed on a property the base class declares as mutable.
    this.name = 'ConfigurationError';
    this.problems = problems;
  }
}

/**
 * Renders the accumulated problems as one operator-facing message.
 *
 * Aggregating every problem into a single throw, instead of failing on the
 * first, is a deliberate improvement in diagnosability: one cold start reports
 * everything that is wrong rather than one item per redeploy. It changes no
 * behavioural contract - a single problem is still a hard, immediate failure.
 */
function formatProblems(problems: readonly string[]): string {
  const heading =
    problems.length === 1
      ? 'slatwall-ts configuration is invalid (1 problem found):'
      : `slatwall-ts configuration is invalid (${String(problems.length)} problems found):`;

  const detail = problems.map((problem, index) => `  ${String(index + 1)}. ${problem}`).join('\n');

  return [
    heading,
    detail,
    '  Every variable in this contract is documented in slatwall-ts/.env.example.',
    '  No value of DB_HOST, DB_USER or DB_PASSWORD is echoed above, by design.',
  ].join('\n');
}

/**
 * Quotes and clips a rejected value for inclusion in a failure message.
 *
 * Applied only to non-credential variables. See `MAX_ECHOED_VALUE_LENGTH`.
 */
function describeReceived(raw: string): string {
  const clipped =
    raw.length > MAX_ECHOED_VALUE_LENGTH ? `${raw.slice(0, MAX_ECHOED_VALUE_LENGTH)}...` : raw;

  return JSON.stringify(clipped);
}

// --- Primitive readers ------------------------------------------------------

/**
 * Reads a variable, treating absent, empty and whitespace-only as one state.
 *
 * This mirrors CFML `len()`-based truthiness, under which `''` and "not set"
 * are indistinguishable - the semantics the legacy configuration was written
 * against. Returning `undefined` for a blank value is what makes
 * `DB_NAME=` fall through to its documented default instead of configuring an
 * empty schema name, and what makes a blank `DB_HOST` a reported problem rather
 * than an accepted value.
 *
 * The returned value is trimmed. That is safe for every variable this is used
 * for; it is emphatically NOT safe for the credential, which is why the
 * credential is read by `readCredential` instead.
 */
function readTrimmed(source: EnvironmentSource, key: string): string | undefined {
  const raw = source[key];
  if (raw === undefined) {
    return undefined;
  }

  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Reads a credential without transforming it in any way.
 *
 * Presence is the only thing checked. The value is never trimmed, case-folded
 * or normalized, because leading or trailing whitespace can be a legitimate
 * part of a credential and silently altering it would turn a working deployment
 * into an authentication failure that no message could explain.
 */
function readCredential(source: EnvironmentSource, key: string): string | undefined {
  const raw = source[key];
  if (raw === undefined || raw.length === 0) {
    return undefined;
  }

  return raw;
}

/**
 * Matches a configured value against a canonical list, case-insensitively, and
 * returns the canonical spelling.
 *
 * Case folding is locale-invariant `toLowerCase`, which is correct here because
 * every canonical literal is ASCII; a locale-sensitive fold would misbehave in
 * a Turkish locale on the letter `I`.
 */
function matchCanonical<T extends string>(candidates: readonly T[], raw: string): T | undefined {
  const folded = raw.toLowerCase();
  return candidates.find((candidate) => candidate.toLowerCase() === folded);
}

/**
 * Resolves an optional operational integer, or records why it could not be.
 *
 * On a problem the caller's fallback is returned so that reading can continue
 * and every remaining variable can be reported in the same pass. That returned
 * value is never observable: a recorded problem guarantees the aggregate throw
 * fires before any configuration object is built.
 */
function resolveInteger(
  source: EnvironmentSource,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
  problems: string[],
): number {
  const raw = readTrimmed(source, key);
  if (raw === undefined) {
    return fallback;
  }

  if (!UNSIGNED_INTEGER_PATTERN.test(raw)) {
    problems.push(
      `${key} must be an unsigned base-10 integer with no sign, separator, decimal point or exponent; received ${describeReceived(raw)}.`,
    );
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    problems.push(
      `${key} must be a whole number in the inclusive range ${String(minimum)}..${String(maximum)}; received ${describeReceived(raw)}.`,
    );
    return fallback;
  }

  return parsed;
}

/**
 * Resolves a required, non-credential-echoing string setting.
 *
 * Used for DB_HOST and DB_USER. The problem text names the variable and says
 * nothing else about it: no host name, account name or connection string is ever
 * interpolated, regardless of what the variable contained.
 */
function resolveRequired(
  source: EnvironmentSource,
  key: string,
  problems: string[],
): string | undefined {
  const value = readTrimmed(source, key);
  if (value === undefined) {
    problems.push(
      `${key} is required and has no default, but was not set (or was blank). Its value is never echoed here.`,
    );
    return undefined;
  }

  return value;
}

/**
 * Resolves the required credential, or records that it is missing.
 *
 * Kept separate from `resolveRequired` for one reason: it must not trim. See
 * `readCredential`.
 */
function resolveCredential(
  source: EnvironmentSource,
  key: string,
  problems: string[],
): string | undefined {
  const value = readCredential(source, key);
  if (value === undefined) {
    problems.push(
      `${key} is required and has no default, but was not set (or was empty). Supply it through the process environment or a managed secret store. Its value is never echoed here.`,
    );
    return undefined;
  }

  return value;
}

// --- The load-bearing behaviour: dialect resolution -------------------------

/**
 * Resolves DB_DIALECT, or records why the process must not start.
 *
 * Three semantics are carried over from [config/configORM.cfm:L1-L15], and all
 * three are load-bearing:
 *
 *  1. REQUIRED, WITH NO FALLBACK. The legacy conditional chain runs from
 *     [config/configORM.cfm:L9] to [config/configORM.cfm:L15] and ends at a bare
 *     closing tag with NO `<cfelse>`: an unrecognized product name left the
 *     dialect unset rather than guessing. The probe's own failure path was even
 *     blunter, ending in an outright abort at [config/configORM.cfm:L4-L7].
 *     Preserving that means an unset or unrecognized value is a hard startup
 *     error here - never a default, never a fallback, never a warn-and-continue.
 *
 *  2. CASE-INSENSITIVE ACCEPTANCE, CANONICAL RESULT. The legacy tests at
 *     [config/configORM.cfm:L9], [config/configORM.cfm:L11] and
 *     [config/configORM.cfm:L13] used `findNoCase`, so matching ignored case;
 *     the value assigned was always the canonical spelling. Both halves are
 *     kept: input is matched without regard to case, and the value handed on is
 *     exactly one of the three canonical spellings.
 *
 *     A judgment call sits inside that parity. `findNoCase` is SUBSTRING
 *     matching, which was right when the input was a probed product name such
 *     as a MySQL server's version banner. Here the value is stated explicitly
 *     rather than discovered, so the faithful port of the same intent is
 *     case-insensitive EQUALITY against the canonical literal. That is also the
 *     stricter reading: substring matching would accept an arbitrary string that
 *     merely contained `Oracle`, and would reject the exact spelling
 *     `MicrosoftSQLServer` in the wrong case, which equality accepts.
 *
 *  3. STILL PARAMETERIZED, EVEN THOUGH ONE BRANCH IS IMPLEMENTED. Two SQL sites
 *     branch on the dialect - the product-type path concatenation at
 *     [model/dao/PromotionDAO.cfc:L482-L488] and the row-limiting clause in
 *     [model/dao/PriceGroupDAO.cfc] - so the value stays configuration instead
 *     of being hardcoded. All three spellings are accepted HERE so that a
 *     misspelling stays distinguishable from a valid but unimplemented choice;
 *     refusing the unimplemented branches is `src/repositories/mysql/dialect.ts`,
 *     which is the module that interprets the value.
 */
function resolveDatabaseDialect(
  source: EnvironmentSource,
  problems: string[],
): DatabaseDialect | undefined {
  const accepted = DATABASE_DIALECTS.join(', ');
  const guidance = `Accepted values are ${accepted} (matched without regard to case, then normalized to that exact spelling). There is deliberately no default and no fallback: the legacy dialect chain at config/configORM.cfm:L9-L15 ends with no <cfelse>, and its datasource probe aborted outright at config/configORM.cfm:L4-L7.`;

  const raw = readTrimmed(source, 'DB_DIALECT');
  if (raw === undefined) {
    problems.push(`DB_DIALECT is required, but was not set (or was blank). ${guidance}`);
    return undefined;
  }

  const canonical = matchCanonical(DATABASE_DIALECTS, raw);
  if (canonical === undefined) {
    // The rejected dialect is echoed because it is not a credential: an operator
    // needs to see the typo. Contrast the credential group, whose values are
    // never echoed at all.
    problems.push(
      `DB_DIALECT is not a recognized dialect; received ${describeReceived(raw)}. ${guidance}`,
    );
    return undefined;
  }

  return canonical;
}

/**
 * Resolves NODE_ENV.
 *
 * `slatwall-ts/.env.example` names this module as the reader of `NODE_ENV` and
 * fixes its accepted values at `development`, `test` and `production`. Those
 * three are the contract's, not invented here, so an unrecognized value is
 * rejected rather than passed through: silently accepting `prod` as though it
 * were something meaningful is exactly the class of quiet misconfiguration the
 * no-fallback discipline above exists to prevent.
 *
 * It is optional because the contract supplies a default, and because the test
 * runner sets it to `test` on its own. Matching is case-insensitive for
 * consistency with the dialect rule.
 */
function resolveRuntimeEnvironment(
  source: EnvironmentSource,
  problems: string[],
): RuntimeEnvironment | undefined {
  const raw = readTrimmed(source, 'NODE_ENV');
  if (raw === undefined) {
    return DEFAULT_RUNTIME_ENVIRONMENT;
  }

  const canonical = matchCanonical(RUNTIME_ENVIRONMENTS, raw);
  if (canonical === undefined) {
    problems.push(
      `NODE_ENV is not a recognized environment; received ${describeReceived(raw)}. Accepted values are ${RUNTIME_ENVIRONMENTS.join(', ')} (matched without regard to case). Leave it unset to use ${DEFAULT_RUNTIME_ENVIRONMENT}.`,
    );
    return undefined;
  }

  return canonical;
}

// --- The connection settings, with a credential that cannot be serialized ---

/**
 * Database connection settings whose credential is unreachable by every
 * accidental disclosure route, while staying a plain typed property read.
 *
 * A class rather than an object literal, for one specific reason. The credential
 * is held in a true private field and exposed through a getter on the
 * PROTOTYPE, so it is not an own enumerable property of the instance. That single
 * fact is what makes disclosure structurally impossible rather than merely
 * discouraged:
 *
 *   * `JSON.stringify` walks own enumerable properties, so it cannot reach it -
 *     and `toJSON` below overrides the shape anyway, redacting explicitly.
 *   * Object spread and `Object.keys` copy own enumerable properties, so a
 *     spread of these settings silently drops the credential.
 *   * Default console inspection lists own properties and does not invoke
 *     prototype getters, so an accidental log of this object cannot print it.
 *   * The default `toString` yields no property values at all, so template
 *     interpolation cannot leak it either.
 *
 * Reading `settings.password` still works, is fully typed, and is how
 * `src/repositories/mysql/connection.ts` is expected to obtain it. The one
 * consequence worth knowing is the spread behaviour above: copy these settings
 * by reading the properties you need, not by spreading them.
 */
class DatabaseConnectionSettings implements DatabaseConnectionConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;

  /** Assigned once, by this constructor, and readable only through the getter. */
  readonly #password: string;

  constructor(init: {
    readonly host: string;
    readonly port: number;
    readonly database: string;
    readonly user: string;
    readonly password: string;
  }) {
    this.host = init.host;
    this.port = init.port;
    this.database = init.database;
    this.user = init.user;
    this.#password = init.password;
  }

  get password(): string {
    return this.#password;
  }

  /**
   * The only serializable projection of these settings, and the reason
   * `JSON.stringify` of a configuration object is safe to log: the credential is
   * replaced by a fixed marker that cannot be mistaken for a real value, while
   * the non-secret members remain visible for diagnosis.
   */
  toJSON(): Readonly<Record<string, string | number>> {
    return Object.freeze({
      host: this.host,
      port: this.port,
      database: this.database,
      user: this.user,
      password: REDACTED_MARKER,
    });
  }
}

// --- Assembly ---------------------------------------------------------------

/**
 * Reads every variable, reports every problem at once, and returns a frozen
 * configuration - or throws.
 *
 * Every variable is read before anything is thrown, on purpose: an operator
 * fixing a cold start should be told about all of the missing values, not
 * rediscover them one deployment at a time.
 */
function buildConfiguration(source: EnvironmentSource): AppConfig {
  const problems: string[] = [];

  const environment = resolveRuntimeEnvironment(source, problems);
  const host = resolveRequired(source, 'DB_HOST', problems);
  const user = resolveRequired(source, 'DB_USER', problems);
  const password = resolveCredential(source, 'DB_PASSWORD', problems);
  const dialect = resolveDatabaseDialect(source, problems);

  const port = resolveInteger(source, 'DB_PORT', DEFAULT_DATABASE_PORT, 1, MAX_TCP_PORT, problems);
  const database = readTrimmed(source, 'DB_NAME') ?? DEFAULT_DATABASE_NAME;

  // The pool integers are operational knobs. `DB_MAX_IDLE` alone accepts zero,
  // because retaining no idle connection is a legitimate operational choice;
  // the other three must be at least one to mean anything.
  //
  // `slatwall-ts/.env.example` advises keeping DB_MAX_IDLE at or below
  // DB_CONNECTION_LIMIT. That is stated there as guidance, so it is not enforced
  // here as a hard failure: turning guidance into a startup error would invent a
  // constraint the contract does not impose, and the pool itself is owned by
  // `src/repositories/mysql/connection.ts`.
  const pool: DatabasePoolConfig = {
    connectionLimit: resolveInteger(
      source,
      'DB_CONNECTION_LIMIT',
      DEFAULT_CONNECTION_LIMIT,
      1,
      MAX_POOL_INTEGER,
      problems,
    ),
    connectTimeout: resolveInteger(
      source,
      'DB_CONNECT_TIMEOUT_MS',
      DEFAULT_CONNECT_TIMEOUT_MS,
      1,
      MAX_POOL_INTEGER,
      problems,
    ),
    maxIdle: resolveInteger(source, 'DB_MAX_IDLE', DEFAULT_MAX_IDLE, 0, MAX_POOL_INTEGER, problems),
    idleTimeout: resolveInteger(
      source,
      'DB_IDLE_TIMEOUT_MS',
      DEFAULT_IDLE_TIMEOUT_MS,
      1,
      MAX_POOL_INTEGER,
      problems,
    ),
  };

  if (problems.length > 0) {
    throw new ConfigurationError(problems);
  }

  if (
    environment === undefined ||
    host === undefined ||
    user === undefined ||
    password === undefined ||
    dialect === undefined
  ) {
    // Unreachable. Each of these resolvers records a problem whenever it returns
    // undefined, and a non-empty problem list has already thrown above. The
    // guard is kept as an explicit invariant so that the types narrow without a
    // non-null assertion, and so that a future edit which forgot to record a
    // problem still fails loudly instead of producing a half-built object.
    throw new ConfigurationError([
      'Configuration resolution completed with an unresolved required value and no recorded problem. This is an internal invariant failure in src/lib/config.ts.',
    ]);
  }

  return Object.freeze({
    environment,
    database: Object.freeze(
      new DatabaseConnectionSettings({ host, port, database, user, password }),
    ),
    dialect,
    pool: Object.freeze(pool),
  });
}

/**
 * Cached result of the last successful read of the real process environment.
 *
 * This is module-scope mutable state, so it is worth being precise about what it
 * is not. It caches only values derived from the process environment, which is
 * fixed for the lifetime of an execution container, and it holds nothing derived
 * from a request. It is therefore neither an instance of the legacy
 * component-level cache hazard - the caches that had to become request-scoped
 * because a warm container would otherwise leak one request's data into the next
 * - nor the deliberate module-scope connection pool, which lives in
 * `src/repositories/mysql/connection.ts`. A failed read is never cached, so a
 * misconfigured process fails on every attempt rather than only the first.
 */
let memoizedConfiguration: AppConfig | undefined;

/**
 * The configuration accessor: this module's single exported unit.
 *
 * RESOLUTION TIMING. Validation happens on first access and the result is
 * memoized, rather than at module load. The legacy behaviour was an eager abort
 * at startup, and the hard-failure semantics of that are preserved exactly - the
 * first thing any handler does is resolve configuration, so a misconfigured
 * process still fails during cold start, before it does any work. What
 * first-access validation avoids is the two costs of throwing during module
 * evaluation: in a single bundled artifact it would abort the evaluation of
 * unrelated modules that merely happen to share the bundle, and it would make
 * every branch here untestable without mutating and restoring real process
 * state.
 *
 * NO IMPORTS, BY DESIGN. This file imports nothing at all.
 *
 *   * Not `src/lib/logger.ts`. The two are deliberately independent: a logger
 *     that depended on configuration could not report a configuration failure,
 *     and this module is required to fail hard. The thrown error carries the
 *     complete diagnosis itself, so nothing here needs a logger, and the fatal
 *     path cannot be made contingent on logging having initialized. The logger
 *     reads its own level directly and independently.
 *   * Not `dotenv`. It is a development-time dependency for loading a local
 *     `.env` file, and the deployed runtime injects environment variables
 *     natively, so importing it here would put a development-only dependency on
 *     the production path. Loading a `.env` file is the job of the local and test
 *     entry points, which is where it belongs. Do not add it here later.
 *   * Not the database driver. This module describes connection settings; it
 *     never opens a connection or builds a pool. That is
 *     `src/repositories/mysql/connection.ts`.
 *   * Not the decimal library. The numbers here are operational integers, not
 *     money, so the project's single-arithmetic-surface rule does not reach
 *     them; they are parsed strictly instead.
 *   * Not a schema-validation library, although `zod` is a pinned dependency of
 *     this project and is used elsewhere to port the declarative validation
 *     files. Validation is hand-written here for two reasons that outweigh the
 *     convenience. First, this module sits at the base of the dependency flow
 *     and must be able to raise its own startup failure without relying on
 *     anything else having loaded correctly. Second, and decisively, the failure
 *     message has to be provably free of credentials; a general-purpose
 *     validator reports the value it received, which is precisely the disclosure
 *     this module must make impossible. The surface is ten variables of three
 *     primitive shapes, so nothing is lost by writing it out.
 */
export const appConfig = Object.freeze({
  /**
   * Resolves the configuration, throwing if it is invalid.
   *
   * @param source - Optional environment source. Omit it in application code:
   *   the real process environment is then read and the validated result is
   *   memoized. Pass an explicit record - which tests do - and the read is
   *   validated fresh and NEVER memoized, so tests are order-independent and
   *   leave no residue in the cache.
   * @returns The frozen configuration. `JSON.stringify` of it is safe to log:
   *   the credential is redacted, not merely omitted.
   * @throws An error named `ConfigurationError`, listing every problem found in
   *   one pass, when any required variable is missing or any value is malformed.
   */
  load(source?: EnvironmentSource): AppConfig {
    if (source !== undefined) {
      return buildConfiguration(source);
    }

    memoizedConfiguration ??= buildConfiguration(process.env);
    return memoizedConfiguration;
  },

  /**
   * Discards the memoized result so the next `load()` re-reads the process
   * environment.
   *
   * Provided for tests that need to exercise the real `process.env` path more
   * than once. Application code has no reason to call it: process configuration
   * does not change while the process runs, and this must never become a way to
   * reconfigure a running service.
   */
  reset(): void {
    memoizedConfiguration = undefined;
  },
});
