// slatwall-ts - static, environment-driven process configuration.
//
// It reads eighteen of the nineteen keys in the committed environment contract - the thirteen `DB_*`
// keys, `ECB_REFERENCE_RATES`, `ECB_RATES_RETRIEVED_AT`, `FEED_ALLOWED_HOSTS`, `LOG_LEVEL` and
// `NODE_ENV` - and is the only module under `src/**` that reads more than one of them. The nineteenth,
// `TEST_LIVE_DATABASE`, is read by the integration suites and never by shipped code.
//
// [config/configApplication.cfm:L2] pins the datasource name to the literal `Slatwall`, which is
// therefore the documented default for DB_NAME.
//
// [config/configORM.cfm:L1-L15] did not configure the dialect - it PROBED for it - and that probe
// becomes explicit configuration here.

/**
 * A read-only view of an environment-variable source.
 */
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

/**
 * The canonical ORM dialect spellings, exactly as the legacy host wrote them at
 * [config/configORM.cfm:L10], [config/configORM.cfm:L12] and [config/configORM.cfm:L14].
 *
 * Held as a runtime tuple, and not merely as a type, so that validation and the text of the
 * failure message are driven by one list and cannot drift apart.
 */
const DATABASE_DIALECTS = ['MySQL', 'MicrosoftSQLServer', 'Oracle10g'] as const;

/**
 * The ORM dialect, restricted to the three spellings the legacy host could produce. Supplied by
 * this module; interpreted by `src/repositories/mysql/dialect.ts`.
 */
export type DatabaseDialect = (typeof DATABASE_DIALECTS)[number];

/**
 * The accepted values of the standard Node environment selector, taken from the `NODE_ENV` entry
 * in `slatwall-ts/.env.example`.
 */
const RUNTIME_ENVIRONMENTS = ['development', 'test', 'production'] as const;

/**
 * The resolved Node environment selector.
 */
export type RuntimeEnvironment = (typeof RUNTIME_ENVIRONMENTS)[number];

/**
 * The accepted values of `LOG_LEVEL`, ordered least to most severe, taken from the `LOG_LEVEL`
 * entry in `slatwall-ts/.env.example`.
 */
const LOG_THRESHOLDS = ['debug', 'info', 'warn', 'error'] as const;

/**
 * The resolved emission threshold. Structurally identical to the logger's `LogLevel`.
 */
export type LogThreshold = (typeof LOG_THRESHOLDS)[number];

/**
 * How the resolved threshold was arrived at.
 *
 * The classifier exists so that the one-time operator warning about a mistyped `LOG_LEVEL` can be
 * emitted from a FIXED vocabulary.
 */
export type LogThresholdSource =
  /**
   * `LOG_LEVEL` named one of the four accepted values; that value is in force.
   */
  | 'configured'
  /**
   * `LOG_LEVEL` was unset or blank, which is the documented way to accept the default.
   */
  | 'defaulted-unset'
  /**
   * `LOG_LEVEL` held something else. The default is in force and the value is discarded.
   */
  | 'defaulted-unrecognized';

/**
 * The TLS protocol versions this port is willing to floor at.
 */
const TLS_MINIMUM_VERSIONS = ['TLSv1.2', 'TLSv1.3'] as const;

/**
 * One of the two accepted TLS protocol floors.
 */
export type TlsMinimumVersion = (typeof TLS_MINIMUM_VERSIONS)[number];

/**
 * The accepted values of `DB_TLS_MODE`, exactly as `slatwall-ts/.env.example` documents them.
 *
 * Held as a runtime tuple for the same reason as the dialect list: validation and the text of the
 * failure message are driven by one list and cannot drift apart.
 */
const DATABASE_TLS_MODES = ['disabled', 'verify-ca', 'verify-identity'] as const;

/**
 * How the connection to the MySQL server is protected.
 *
 * `verify-identity` - certificate chain verified against the trusted authority and the
 * certificate's host name matched against `DB_HOST`; under `verify-ca` the chain is verified and the
 * host name is not checked.
 *
 * Certificate verification is never disabled in either verifying mode.
 */
export type DatabaseTlsMode = (typeof DATABASE_TLS_MODES)[number];

/**
 * How to reach the MySQL server that holds the existing `Sw*` schema.
 *
 * `password` is deliberately absent from anything this object serializes to, and every other
 * member - host, port, schema name and account - is redacted from it.
 */
export interface DatabaseConnectionConfig {
  /**
   * Server host name. Required; no default, and never echoed in diagnostics.
   */
  readonly host: string;
  /**
   * Server TCP port. Defaults to the registered MySQL port.
   */
  readonly port: number;
  /**
   * Schema name. Defaults to the literal `Slatwall`, verbatim from
   * [config/configApplication.cfm:L2].
   */
  readonly database: string;
  /**
   * Connecting account. Required; no default, and never echoed in diagnostics.
   */
  readonly user: string;
  /**
   * That account's credential. Required, with no default.
   */
  readonly password: string;
  /**
   * A projection safe to log or serialize: every member is replaced by a redaction marker, so the
   * shape is visible and no value is.
   */
  toJSON(): Readonly<Record<string, string>>;
}

/**
 * Operational settings for the connection pool that `src/repositories/mysql/connection.ts`
 * creates. Each maps one-to-one onto a driver pool option.
 *
 * These are configurable operational values with conservative starting points, to be tuned per
 * environment.
 */
export interface DatabasePoolConfig {
  /**
   * Upper bound on how many connections the pool may open (`connectionLimit`).
   */
  readonly connectionLimit: number;
  /**
   * How long to wait for a TCP connection, in milliseconds (`connectTimeout`).
   */
  readonly connectTimeout: number;
  /**
   * Upper bound on idle connections the pool retains (`maxIdle`).
   */
  readonly maxIdle: number;
  /**
   * How long an idle connection is retained, in milliseconds (`idleTimeout`).
   */
  readonly idleTimeout: number;
}

/**
 * The resolved transport-security settings for the database connection.
 *
 * `mode` and `certificateAuthority` state WHETHER the channel is protected and what it trusts;
 * `minimumVersion` states how WEAK the negotiated protocol may be.
 *
 * The earlier form of this interface carried `enabled: boolean` in place of `mode`.
 */
export interface DatabaseTlsConfig {
  /**
   * The stated posture. Required, with no default.
   */
  readonly mode: DatabaseTlsMode;
  /**
   * The authority to trust, as PEM text, or `undefined` to trust the runtime's built-in public
   * root store.
   *
   * Always `undefined` when `mode` is `disabled`, because there is then no handshake for a trust
   * anchor to participate in.
   *
   * Typed `string | undefined` rather than declared optional on purpose:
   * `exactOptionalPropertyTypes` is on, and an explicitly present `undefined` states "resolved.
   */
  readonly certificateAuthority: string | undefined;
  /**
   * Lowest acceptable TLS protocol version, defaulting to `TLSv1.2`. Passed to the driver, which
   * forwards it into the secure context [node_modules/mysql2/lib/base/connection.js:L389].
   *
   * Its type is a closed two-member union, so this cannot floor the channel below 1.2 whatever the
   * environment says - the floor is enforced by the type.
   */
  readonly minimumVersion: TlsMinimumVersion;
}

/**
 * The fully resolved, validated and frozen process configuration.
 *
 * The members mirror the groups of `slatwall-ts/.env.example` that name this module as their
 * reader, one for one.
 */
export interface AppConfig {
  /**
   * Node environment selector.
   */
  readonly environment: RuntimeEnvironment;
  /**
   * Database connection settings.
   */
  readonly database: DatabaseConnectionConfig;
  /**
   * ORM dialect, validated and normalized to its canonical spelling.
   */
  readonly dialect: DatabaseDialect;
  readonly pool: DatabasePoolConfig;
  /**
   * Transport-security settings for that connection.
   */
  readonly tls: DatabaseTlsConfig;
  /**
   * Product-feed publication settings.
   */
  readonly feed: FeedConfig;
  /**
   * Currency-conversion reference data.
   */
  readonly currency: CurrencyConfig;
  /**
   * Emission threshold for `src/lib/logger.ts`, and how it was arrived at.
   */
  readonly logging: LoggingConfig;
}

/**
 * The resolved emission threshold, and the classification of how it was resolved.
 *
 * This member exists to make this module's own header true.
 */
export interface LoggingConfig {
  /**
   * The threshold in force. `info` whenever `LOG_LEVEL` was unset, blank or unrecognized.
   */
  readonly level: LogThreshold;
  /**
   * Which of the three resolution outcomes produced {@link LoggingConfig.level}.
   */
  readonly levelSource: LogThresholdSource;
}

/**
 * The European Central Bank reference rates, and when they were retrieved.
 *
 * The legacy service fetched the table itself, over plain HTTP, from
 * `http://www.ecb.int/stats/eurofxref/eurofxref-daily.xml`
 * [model/service/CurrencyService.cfc:L109], memoized it on the component.
 */
export interface CurrencyConfig {
  /**
   * Per-euro reference rates, keyed by upper-cased three-letter currency code.
   *
   * Values are plain decimal numerals, held as STRINGS and never as numbers - every rate reaches
   * `Money`/`Decimal` arithmetic.
   *
   * EMPTY is the DEFAULT, and it preserves the behaviour of a deployment that configures nothing:
   * every non-pivot conversion passes through.
   */
  readonly europeanCentralBankRates: Readonly<Record<string, string>>;

  /**
   * When the supplied rates were retrieved, or `undefined` when none were supplied.
   *
   * The legacy analogue is the `retrieved` key it wrote into its own memo
   * [model/service/CurrencyService.cfc:L124] and compared against `now() - 1` at
   * `config/configORM.cfm`.
   */
  readonly ratesRetrievedAt: Date | undefined;
}

/**
 * Which hosts this deployment is permitted to publish a product feed for.
 *
 * The candidate is still observed on the request, because that is the legacy behaviour and a
 * deployment may legitimately answer on more than one authority.
 *
 * The host half of the origin is not aap-constrained, because it was never a fixed value in the
 * legacy to preserve.
 */
export interface FeedConfig {
  /**
   * The hosts a product feed may be published for, normalized and de-duplicated. Never
   * `undefined`, and an EMPTY list means this deployment publishes no feed.
   *
   * The variable remains optional in the environment contract, deliberately.
   */
  readonly allowedHosts: readonly string[];
}

// Only two literal defaults in this file are permitted to be non-generic, and both are non-secret
// by nature: the schema name and the registered port.

/**
 * The TLS floor when `DB_TLS_MIN_VERSION` is unset.
 */
const DEFAULT_TLS_MINIMUM_VERSION: TlsMinimumVersion = 'TLSv1.2';

/**
 * Verbatim from [config/configApplication.cfm:L2]; the capital S is significant.
 */
const DEFAULT_DATABASE_NAME = 'Slatwall';

/**
 * The registered port for MySQL: a protocol default, not a credential.
 */
const DEFAULT_DATABASE_PORT = 3306;

/**
 * Conservative starting point for the pool's connection ceiling.
 */
const DEFAULT_CONNECTION_LIMIT = 10;

/**
 * Conservative starting point for the TCP connect wait, in milliseconds.
 */
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;

/**
 * Conservative starting point for retained idle connections.
 */
const DEFAULT_MAX_IDLE = 10;

/**
 * Conservative starting point for idle-connection retention, in milliseconds.
 */
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;

/**
 * Matches the template value of `NODE_ENV` in `slatwall-ts/.env.example`.
 */
const DEFAULT_RUNTIME_ENVIRONMENT: RuntimeEnvironment = 'development';

/**
 * Matches the template value of `LOG_LEVEL` in `slatwall-ts/.env.example`, and the fallback
 * `src/lib/logger.ts` applies when no threshold has been adopted.
 */
const DEFAULT_LOG_THRESHOLD: LogThreshold = 'info';

/**
 * Highest port number expressible in a 16-bit TCP port field.
 */
const MAX_TCP_PORT = 65_535;

/**
 * Upper bound for the pool integers: the largest exactly representable integer.
 */
const MAX_POOL_INTEGER = Number.MAX_SAFE_INTEGER;

/**
 * An unsigned base-10 integer and nothing else.
 *
 * Deliberately stricter than `Number.parseInt`, which would accept `12abc` as 12, and than
 * `Number`, which would accept `1e3`, ` 12 ` and `0x0c`.
 */
const UNSIGNED_INTEGER_PATTERN = /^\d+$/;

/**
 * How much of an offending value is echoed back in a failure message.
 */
const MAX_ECHOED_VALUE_LENGTH = 40;

/**
 * The opening delimiter every PEM certificate carries.
 */
const PEM_CERTIFICATE_MARKER = '-----BEGIN CERTIFICATE-----';

/**
 * Literal two-character `\n` sequences, converted to real newlines in the CA.
 *
 * Some deployment tooling cannot carry a multi-line environment value, so the escaped form is
 * accepted and normalized.
 */
const ESCAPED_NEWLINE_PATTERN = /\\n/g;

/**
 * The marker substituted for the credential in every serializable projection.
 */
const REDACTED_MARKER = '[REDACTED]';

/**
 * The single error this module ever throws.
 *
 * Not exported, because this module exposes exactly one unit.
 */
class ConfigurationError extends Error {
  /**
   * Every problem found in a single pass, in the order the variables are read.
   */
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(formatProblems(problems));
    // Set here rather than as a class field so that no `override` modifier is needed on a property
    // the base class declares as mutable.
    this.name = 'ConfigurationError';
    this.problems = problems;
  }
}

/**
 * Renders the accumulated problems as one operator-facing message.
 *
 * Aggregating every problem into a single throw, instead of failing on the first.
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
 */
function describeReceived(raw: string): string {
  const clipped =
    raw.length > MAX_ECHOED_VALUE_LENGTH ? `${raw.slice(0, MAX_ECHOED_VALUE_LENGTH)}...` : raw;

  return JSON.stringify(clipped);
}

/**
 * Reads a variable, treating absent, empty and whitespace-only as one state.
 *
 * This mirrors CFML `len()`-based truthiness, under which `''` and "not set" are indistinguishable
 * the semantics the legacy configuration was written against.
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
 */
function readCredential(source: EnvironmentSource, key: string): string | undefined {
  const raw = source[key];
  if (raw === undefined || raw.length === 0) {
    return undefined;
  }

  return raw;
}

/**
 * Matches a configured value against a canonical list, case-insensitively, and returns the
 * canonical spelling.
 *
 * Case folding is locale-invariant `toLowerCase`, which is correct here because every canonical
 * literal is ASCII; a locale-sensitive fold would misbehave in a Turkish locale on the letter `I`.
 */
function matchCanonical<T extends string>(candidates: readonly T[], raw: string): T | undefined {
  const folded = raw.toLowerCase();
  return candidates.find((candidate) => candidate.toLowerCase() === folded);
}

/**
 * Resolves an optional operational integer, or records why it could not be.
 *
 * On a problem the caller's fallback is returned so that reading can continue and every remaining
 * variable can be reported in the same pass.
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
 * Kept separate from `resolveRequired` for one reason: it must not trim.
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

/**
 * Resolves DB_DIALECT, or records why the process must not start.
 *
 * Branch on the dialect - the product-type path concatenation at
 * [model/dao/PromotionDAO.cfc:L482-L488] and the row-limiting clause in
 * `model/dao/PriceGroupDAO.cfc`.
 */
function resolveDatabaseDialect(
  source: EnvironmentSource,
  problems: string[],
): DatabaseDialect | undefined {
  const accepted = DATABASE_DIALECTS.join(', ');
  const guidance = `Accepted values are ${accepted} (matched without regard to case, then normalized to that exact spelling). There is deliberately no default and no fallback: the legacy dialect chain at config/configORM.cfm:L9-L15 ends with no <cfelse>, so an unrecognized product name left the dialect unset and the request continued. Refusing the value outright here is a deliberate improvement on that silent state rather than a port of the abort at config/configORM.cfm:L4-L7, which guarded only the datasource probe.`;

  const raw = readTrimmed(source, 'DB_DIALECT');
  if (raw === undefined) {
    problems.push(`DB_DIALECT is required, but was not set (or was blank). ${guidance}`);
    return undefined;
  }

  const canonical = matchCanonical(DATABASE_DIALECTS, raw);
  if (canonical === undefined) {
    // The rejected dialect is echoed because it is not a credential: an operator needs to see the
    // typo. Contrast the credential group, whose values are never echoed at all.
    problems.push(
      `DB_DIALECT is not a recognized dialect; received ${describeReceived(raw)}. ${guidance}`,
    );
    return undefined;
  }

  return canonical;
}

/**
 * It is optional because the contract supplies a default, and because the test runner sets it to
 * `test` on its own.
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

// That is a hard platform limit rather than a style preference.
//
// Two of the nineteen contract variables had no upper bound of any kind: `DB_TLS_CA` accepts "one
// or more PEM blocks" and `ECB_REFERENCE_RATES` accepts an arbitrarily long rate list.

/**
 * The platform ceiling on the whole environment map, in bytes: AWS Lambda's 4 KB quota.
 *
 * Not adjustable through Service Quotas, which is why the contract is written to fit inside it
 * rather than to request more.
 */
const MAX_DELIVERABLE_ENVIRONMENT_BYTES = 4_096;

/**
 * Bytes charged per delivered variable beyond its key and value, as a conservative allowance.
 *
 * AWS does not publish the exact accounting of its 4 KB quota beyond "the total size of all
 * environment variables".
 */
const ENVIRONMENT_ENTRY_OVERHEAD_BYTES = 1;

/**
 * The documented maximum value size of every variable in the contract, in UTF-8 bytes.
 *
 * Nineteen key names total 250 bytes and the per-entry allowance adds 19, so 269 bytes are spoken
 * for before any value.
 *
 * `DB_HOST` - RFC 1035's 253-character host. * `DB_NAME` and `DB_USER` - MySQL's own identifier
 * and account-name limits. * `DB_PASSWORD` - 128, far beyond any credential policy in practice.
 */
const CONTRACT_KEY_MAX_VALUE_BYTES: Readonly<Record<string, number>> = Object.freeze({
  DB_HOST: 253,
  DB_PORT: 16,
  DB_NAME: 64,
  DB_USER: 32,
  DB_PASSWORD: 128,
  DB_TLS_MODE: 24,
  DB_TLS_MIN_VERSION: 16,
  DB_TLS_CA: 2_048,
  DB_DIALECT: 24,
  DB_CONNECTION_LIMIT: 16,
  DB_CONNECT_TIMEOUT_MS: 16,
  DB_MAX_IDLE: 16,
  DB_IDLE_TIMEOUT_MS: 16,
  NODE_ENV: 24,
  LOG_LEVEL: 16,
  FEED_ALLOWED_HOSTS: 512,
  ECB_REFERENCE_RATES: 512,
  ECB_RATES_RETRIEVED_AT: 32,
  TEST_LIVE_DATABASE: 16,
});

/**
 * The one contract key whose size is budgeted but never individually refused.
 *
 * `LOG_LEVEL` may not be able to abort a cold start - see {@link LoggingConfig} for why that is
 * structural rather than a preference - so a per-variable size refusal is not available for it.
 */
const UNREFUSABLE_CONTRACT_KEY = 'LOG_LEVEL';

/**
 * Measure a string in UTF-8 bytes, which is the unit the platform quota is expressed in.
 *
 * `TextEncoder` is a global in the `nodejs20.x` runtime and in every browser, so this needs no
 * import - which matters here more than usual.
 */
function measureUtf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Refuse a configuration that cannot be delivered, and say which variable is at fault.
 *
 * Two independent refusals, because a set can fail either way round: every variable is held to its
 * own documented maximum, and the total is held to the platform cap.
 *
 * @param source the environment being resolved.
 * @param problems the aggregate problem list; one entry per over-size variable, plus one for the
 * aggregate.
 */
function assertDeliverableEnvironment(source: EnvironmentSource, problems: string[]): void {
  let totalBytes = 0;

  for (const [key, maxValueBytes] of Object.entries(CONTRACT_KEY_MAX_VALUE_BYTES)) {
    const value = source[key];

    if (value === undefined) {
      continue;
    }

    const valueBytes = measureUtf8Bytes(value);
    totalBytes += measureUtf8Bytes(key) + valueBytes + ENVIRONMENT_ENTRY_OVERHEAD_BYTES;

    if (valueBytes > maxValueBytes && key !== UNREFUSABLE_CONTRACT_KEY) {
      problems.push(
        `${key} is ${String(valueBytes)} bytes, over its documented maximum of ${String(maxValueBytes)}. The whole environment must fit in the ${String(MAX_DELIVERABLE_ENVIRONMENT_BYTES)}-byte quota AWS Lambda applies to the entire variable map, keys included, and that quota is not adjustable - so an over-size value makes the deployment undeployable rather than merely unusual. Its value is never echoed here; see slatwall-ts/.env.example for the per-variable maxima and, for an over-size certificate authority or rate table, the alternatives to shipping it in the environment.`,
      );
    }
  }

  if (totalBytes > MAX_DELIVERABLE_ENVIRONMENT_BYTES) {
    problems.push(
      `The configured environment is ${String(totalBytes)} bytes across the ${String(Object.keys(CONTRACT_KEY_MAX_VALUE_BYTES).length)} contract variables, over the ${String(MAX_DELIVERABLE_ENVIRONMENT_BYTES)}-byte quota AWS Lambda applies to the entire variable map, keys included. Every variable may be individually within its maximum and the set still not fit. Reduce the largest values - DB_TLS_CA, ECB_REFERENCE_RATES and FEED_ALLOWED_HOSTS are the three that can grow - or deliver them outside the environment. No value is echoed here.`,
    );
  }
}

/**
 * IPv4 addresses in `127.0.0.0/8`, the block reserved for loopback.
 *
 * The whole `/8` rather than only `127.0.0.1`, because the entire block is loopback by definition
 * and a developer binding a second local server to `127.0.0.2` is doing something ordinary.
 */
const IPV4_LOOPBACK_HOST =
  /^127\.(?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])(?:\.(?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])){2}$/;

/**
 * The non-IPv4 spellings of a loopback host, matched after case-folding and after any surrounding
 * IPv6 brackets are removed.
 *
 * `::1` is the IPv6 loopback address and `0:0:0:0:0:0:0:1` is the same address written out, both
 * of which `mysql2` accepts.
 */
const NAMED_LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '::1', '0:0:0:0:0:0:0:1']);

/**
 * Whether `host` names the local machine over a loopback interface.
 *
 * This is a syntactic test, deliberately, and it resolves nothing.
 *
 * `localhost` is accepted with a known caveat, and the caveat is recorded rather than quietly
 * tolerated.
 */
function isLoopbackHost(host: string): boolean {
  const bare = host.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  return NAMED_LOOPBACK_HOSTS.has(bare) || IPV4_LOOPBACK_HOST.test(bare);
}

/**
 * Resolves `LOG_LEVEL`, and never records a problem.
 *
 * Case folding matches every other enumeration here, so `INFO`, `Warn` and ` error ` are all
 * accepted - `readTrimmed` removes surrounding whitespace and reports a blank value as absent.
 */
function resolveLogging(source: EnvironmentSource): LoggingConfig {
  const raw = readTrimmed(source, 'LOG_LEVEL');
  if (raw === undefined) {
    return Object.freeze({ level: DEFAULT_LOG_THRESHOLD, levelSource: 'defaulted-unset' });
  }

  const canonical = matchCanonical(LOG_THRESHOLDS, raw);
  if (canonical === undefined) {
    return Object.freeze({
      level: DEFAULT_LOG_THRESHOLD,
      levelSource: 'defaulted-unrecognized',
    });
  }

  return Object.freeze({ level: canonical, levelSource: 'configured' });
}

/**
 * A dotted-quad IPv4 literal, in the shape a host variable can carry.
 *
 * `\d{1,3}` four times over would classify `999.1.1.1` as an address, and the consequence is not
 * cosmetic: the `verify-identity` rule below refuses IP literals.
 *
 * Anchored at both ends so nothing may precede or follow the quad.
 */
const IPV4_LITERAL_SHAPE =
  /^(?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])(?:\.(?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])){3}$/;

/**
 * Whether a host string is an IP LITERAL rather than a name.
 */
function isIpLiteralHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();

  return IPV4_LITERAL_SHAPE.test(normalized) || normalized.includes(':');
}

/**
 * Resolves `DB_TLS_MODE`, `DB_TLS_MIN_VERSION` and `DB_TLS_CA`, or records why the process must
 * not start.
 *
 * A verified certificate says nothing about the strength of the protocol carrying it, so
 * `DB_TLS_MIN_VERSION` is read on every verifying path.
 *
 * The CA is read as PEM TEXT, never as a path: this module performs no filesystem access - it has
 * no imports at all - and the deployed runtime injects environment variables natively.
 */
function resolveDatabaseTls(
  source: EnvironmentSource,
  environment: RuntimeEnvironment | undefined,
  host: string | undefined,
  problems: string[],
): DatabaseTlsConfig | undefined {
  const accepted = DATABASE_TLS_MODES.join(', ');
  const guidance = `Accepted values are ${accepted} (matched without regard to case). verify-identity is recommended and requires a NAMED host, because a certificate binds to names; verify-ca omits the host-name check and therefore REQUIRES a pinned trust anchor in DB_TLS_CA; disabled is permitted only when DB_HOST provably names the loopback interface, whatever NODE_ENV says. There is deliberately no default and no opportunistic mode.`;

  const rawMode = readTrimmed(source, 'DB_TLS_MODE');
  if (rawMode === undefined) {
    problems.push(`DB_TLS_MODE is required, but was not set (or was blank). ${guidance}`);
    return undefined;
  }

  const mode = matchCanonical(DATABASE_TLS_MODES, rawMode);
  if (mode === undefined) {
    // Echoed because a transport mode is an enumeration rather than a credential, and an operator
    // who mistyped it needs to see the typo. The echo is clipped by `describeReceived` like every
    // other non-credential one.
    problems.push(
      `DB_TLS_MODE is not a recognized transport mode; received ${describeReceived(rawMode)}. ${guidance}`,
    );
    return undefined;
  }

  // Rule here was `mode === 'disabled' && environment === 'production'`, with the message
  // "DB_TLS_MODE is disabled while NODE_ENV is production, which would send the account.
  //
  // So the test is now on the DESTINATION and applies in every environment: `disabled` is admitted
  // only when `DB_HOST` provably names the loopback interface.
  if (mode === 'disabled' && environment === 'production') {
    problems.push(
      'DB_TLS_MODE is disabled while NODE_ENV is production, which would send the account, the credential and every statement over an unprotected connection. Set verify-identity, or verify-ca with a pinned trust anchor in DB_TLS_CA when the host name cannot be checked.',
    );
    return undefined;
  }

  // The plaintext rule that does not depend on NODE_ENV, and the reason the check above is not
  // sufficient on its own.
  if (mode === 'disabled' && host !== undefined && !isLoopbackHost(host)) {
    problems.push(
      'DB_TLS_MODE is disabled while DB_HOST is not a loopback address, which would send the account, the credential and every statement in clear text over a network link this process does not control. Plaintext is accepted only for a server reached through the local interface - 127.0.0.0/8, ::1, 0:0:0:0:0:0:0:1 or the name localhost - and NODE_ENV is not consulted for this decision, so the rule holds in every environment: NODE_ENV is defaulted, a deployment label cannot make a remote connection local, and an unset variable must not be what stands between a credential and the wire. The rejected host is deliberately NOT quoted here, because this module states that no value of DB_HOST, DB_USER or DB_PASSWORD is echoed in a refusal; the variable, the rule and the accepted spellings are named instead. Set verify-identity for a named host, or verify-ca when the host is an IP literal or fronted by a proxy whose certificate names a different host, and supply the trust anchor through DB_TLS_CA if the authority is not a public root.',
    );
    return undefined;
  }
  if (mode === 'verify-identity' && host !== undefined && isIpLiteralHost(host)) {
    problems.push(
      'DB_TLS_MODE is verify-identity while DB_HOST is an IP literal. TLS identity verification compares the requested host NAME against the names the certificate presents, and Server Name Indication cannot carry an address, so the driver sends none and the host-name check is silently skipped - the connection would verify the certificate chain only, while reporting itself as fully verified. Use a host name the certificate names, or state the weaker position explicitly with verify-ca, which verifies the chain and documents that identity is unchecked.',
    );
    return undefined;
  }

  const rawMinimumVersion = readTrimmed(source, 'DB_TLS_MIN_VERSION');
  let minimumVersion: TlsMinimumVersion = DEFAULT_TLS_MINIMUM_VERSION;
  if (rawMinimumVersion !== undefined) {
    const canonical = matchCanonical(TLS_MINIMUM_VERSIONS, rawMinimumVersion);
    if (canonical === undefined) {
      problems.push(
        `DB_TLS_MIN_VERSION is not a recognized TLS version; received ${describeReceived(rawMinimumVersion)}. Accepted values are ${TLS_MINIMUM_VERSIONS.join(', ')} (matched without regard to case). TLS 1.0 and 1.1 are deprecated and are deliberately not accepted. Leave it unset to use ${DEFAULT_TLS_MINIMUM_VERSION}.`,
      );
      return undefined;
    }
    minimumVersion = canonical;
  }

  const rawCertificateAuthority = readTrimmed(source, 'DB_TLS_CA');

  if (mode === 'disabled') {
    // Documented in `slatwall-ts/.env.example` as ignored rather than rejected: there is no
    // handshake for a trust anchor to participate in.
    return Object.freeze({ mode, certificateAuthority: undefined, minimumVersion });
  }

  if (rawCertificateAuthority === undefined) {
    if (mode === 'verify-ca') {
      problems.push(
        "DB_TLS_MODE is verify-ca but DB_TLS_CA is not set. verify-ca omits the host-name check, so the trust anchor is the ONLY thing binding the connection to the intended server; trusting the runtime's public root store instead would accept any certificate signed by any public authority. Supply the provider's or your private authority's PEM text in DB_TLS_CA, or use verify-identity with the database's DNS name, where the host name performs that binding.",
      );
      return undefined;
    }

    // Reached only by `verify-identity`, where it is correct: the host-name check binds the
    // certificate to the intended server.
    return Object.freeze({ mode, certificateAuthority: undefined, minimumVersion });
  }

  const certificateAuthority = rawCertificateAuthority.replace(ESCAPED_NEWLINE_PATTERN, '\n');

  if (!certificateAuthority.includes(PEM_CERTIFICATE_MARKER)) {
    problems.push(
      `DB_TLS_CA does not look like PEM certificate text: no ${PEM_CERTIFICATE_MARKER} delimiter was found. Supply the certificate text itself, not a file path - one or more PEM blocks, optionally with literal \\n sequences in place of newlines. Its value is never echoed here. Leave it blank to trust the runtime's built-in public root store.`,
    );
    return undefined;
  }

  return Object.freeze({ mode, certificateAuthority, minimumVersion });
}

/**
 * What {@link resolveFeedAllowedHosts} answers when it did not record a problem.
 *
 * A one-member wrapper, and the wrapper is still the point even though the member no longer admits
 * `undefined`.
 */
interface ResolvedFeedAllowedHosts {
  readonly allowedHosts: readonly string[];
}

/**
 * The authorized-host list of a deployment that authorized none.
 *
 * Frozen once at module scope rather than built per call, so every unconfigured deployment shares
 * one immutable value and no consumer can extend the list it is checked against.
 */
const EMPTY_FEED_ALLOWED_HOSTS: readonly string[] = Object.freeze([]);

/**
 * The one accepted shape of a bare host authority in this subtree: a host, optionally followed by
 * `:` and a port. A bracketed literal `[...]` holding only hex digits, colons and dots is accepted,
 * so an IPv6 deployment is not refused.
 *
 * It refuses a scheme, a path, credentials, a query, a fragment, whitespace anywhere, control
 * characters including CR and LF, and emptiness.
 */
const HOST_AUTHORITY_SHAPE =
  /^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?)*)(?::(\d{1,5}))?$/;

/**
 * A port with no leading zero, so a single spelling means a single value.
 *
 * `065535` and `65535` denote the same port to a resolver and are different strings to every
 * comparison this subtree makes.
 */
const UNPADDED_PORT_SHAPE = /^[1-9]\d{0,4}$/;

/**
 * The highest port number a TCP authority can name.
 */
const MAX_HOST_AUTHORITY_PORT = 65_535;

/**
 * The longest accepted host authority: RFC 1035's 253-character host plus `:65535`.
 *
 * Enforced here as well as at the rendering boundary, so a value too long to be a host authority is
 * refused before it can reach a rendered document.
 */
const MAX_HOST_AUTHORITY_LENGTH = 259;

/**
 * A parsed bare host authority.
 */
export interface HostAuthority {
  /**
   * The host half, exactly as written, brackets retained for an IPv6 literal.
   */
  readonly host: string;
  /**
   * The port half as a number, or `undefined` when none was written.
   */
  readonly port: number | undefined;
}

/**
 * Parse a bare host authority - a host with an optional port - or answer `undefined`.
 *
 * What the port check adds over the pattern, and why it is a function rather than more regex.
 *
 * @param candidate the value to parse, taken exactly as supplied.
 * @returns the parsed authority, or `undefined` when the value is not a bare host authority, is
 * longer than {@link MAX_HOST_AUTHORITY_LENGTH}.
 */
export function parseHostAuthority(candidate: string): HostAuthority | undefined {
  if (candidate.length === 0 || candidate.length > MAX_HOST_AUTHORITY_LENGTH) {
    return undefined;
  }

  const matched = HOST_AUTHORITY_SHAPE.exec(candidate);

  if (matched === null) {
    return undefined;
  }

  const rawPort = matched[1];

  if (rawPort === undefined) {
    return Object.freeze({ host: candidate, port: undefined });
  }

  if (!UNPADDED_PORT_SHAPE.test(rawPort)) {
    return undefined;
  }

  const port = Number(rawPort);

  if (port > MAX_HOST_AUTHORITY_PORT) {
    return undefined;
  }

  return Object.freeze({
    host: candidate.slice(0, candidate.length - rawPort.length - 1),
    port,
  });
}

/**
 * Resolves `FEED_ALLOWED_HOSTS`, a comma-separated list of bare host authorities.
 *
 * Place this file does not draw the absent-versus-empty distinction, because both states mean the
 * same thing about deployment intent: no authority has been authorized.
 *
 * Each member is trimmed and lower-cased before validation, because DNS names are case-insensitive
 * and the membership check in `src/handlers/bootstrap.ts` compares lower-cased.
 */
function resolveFeedAllowedHosts(
  source: EnvironmentSource,
  problems: string[],
): ResolvedFeedAllowedHosts | undefined {
  const raw = source['FEED_ALLOWED_HOSTS'];

  if (raw === undefined) {
    return Object.freeze({ allowedHosts: EMPTY_FEED_ALLOWED_HOSTS });
  }

  const members = raw
    .split(',')
    .map((member) => member.trim().toLowerCase())
    .filter((member) => member.length > 0);

  const malformed = members.filter((member) => parseHostAuthority(member) === undefined);

  if (malformed.length > 0) {
    problems.push(
      `FEED_ALLOWED_HOSTS contains ${malformed.length} entr${malformed.length === 1 ? 'y' : 'ies'} that ${malformed.length === 1 ? 'is' : 'are'} not a bare host authority: ${malformed.map(describeReceived).join(', ')}. Supply hosts only - no scheme, credentials, path, query or fragment - separated by commas, for example "shop.example.com,shop.example.com:8443". A port, when written, must be 1 to ${String(MAX_HOST_AUTHORITY_PORT)} with no leading zero, and the whole entry at most ${String(MAX_HOST_AUTHORITY_LENGTH)} characters. Leave it UNSET only if this deployment publishes no product feed: an unset or empty value authorizes no host, and the feed route then refuses every request rather than trusting the one it carries.`,
    );
    return undefined;
  }

  return Object.freeze({ allowedHosts: Object.freeze([...new Set(members)]) });
}

/**
 * A three-letter ISO currency code, the only key shape a rate entry may carry.
 */
const CURRENCY_CODE_SHAPE = /^[A-Z]{3}$/;

/**
 * A plain, unsigned decimal numeral - no sign, no exponent, no thousands separator.
 */
const RATE_NUMERAL_SHAPE = /^\d+(\.\d+)?$/;

// Both of their stages.
//
// What was withdrawn is the DUPLICATION, not either check.

/**
 * A complete ISO-8601 instant in extended format, with a mandatory zone designator.
 *
 * Groups, in order: year, month, day, hour, minute, optional second, optional fractional second,
 * and the zone - `Z` or `±HH:MM`.
 *
 * `T` and `Z` are matched case-insensitively because V8 accepts either and refusing a lowercase
 * designator would reject a value that is unambiguous.
 */
const ISO_INSTANT_SHAPE =
  /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[Tt]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,9}))?)?([Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

/**
 * How far ahead of this host's clock a retrieval instant may sit before it is refused.
 */
const MAX_RETRIEVAL_CLOCK_SKEW_MS = 5 * 60 * 1_000;

/**
 * Field widths used when validating that a matched date is a real calendar date.
 */
const ISO_FRACTION_DIGITS = 3;

/**
 * Resolves a strict ISO-8601 instant, or records why it cannot be trusted.
 *
 * This is the one clock read in this module, and it is confined to this refusal.
 *
 * @param raw the trimmed environment value.
 * @param problems the aggregate problem list; exactly one entry is added on refusal.
 * @returns the resolved instant, or `undefined` when a problem was recorded.
 */
function resolveIsoInstant(raw: string, problems: string[]): Date | undefined {
  const guidance =
    'Supply a complete ISO-8601 instant with an explicit zone - "2026-08-04T00:00:00Z", or an offset such as "2026-08-04T02:00:00+02:00". A date alone, or a date and time with no zone, is refused: its meaning would depend on the timezone of whichever machine read it.';

  const matched = ISO_INSTANT_SHAPE.exec(raw);

  if (matched === null) {
    problems.push(
      `ECB_RATES_RETRIEVED_AT is not an ISO-8601 instant in the extended form this contract publishes; received ${describeReceived(raw)}. ${guidance}`,
    );
    return undefined;
  }

  // Every group below is guaranteed by a successful match, but the type is `string | undefined`
  // under the compiler's index rules.
  const year = Number(matched[1] ?? 'NaN');
  const month = Number(matched[2] ?? 'NaN');
  const day = Number(matched[3] ?? 'NaN');
  const hour = Number(matched[4] ?? 'NaN');
  const minute = Number(matched[5] ?? 'NaN');
  const second = Number(matched[6] ?? '0');
  const fraction = Number(
    (matched[7] ?? '').padEnd(ISO_FRACTION_DIGITS, '0').slice(0, ISO_FRACTION_DIGITS) || '0',
  );

  const asWritten = new Date(Date.UTC(year, month - 1, day, hour, minute, second, fraction));

  if (
    asWritten.getUTCFullYear() !== year ||
    asWritten.getUTCMonth() !== month - 1 ||
    asWritten.getUTCDate() !== day
  ) {
    problems.push(
      `ECB_RATES_RETRIEVED_AT names no real calendar instant - the shape is right but the date does not exist, and a date parser would roll it silently forward into the following month rather than reject it; received ${describeReceived(raw)}. ${guidance}`,
    );
    return undefined;
  }

  const instant = new Date(raw);

  if (Number.isNaN(instant.getTime())) {
    // Unreachable through the pattern above, which is stricter than the parser.
    problems.push(
      `ECB_RATES_RETRIEVED_AT is not a parsable instant; received ${describeReceived(raw)}. ${guidance}`,
    );
    return undefined;
  }

  if (instant.getTime() > Date.now() + MAX_RETRIEVAL_CLOCK_SKEW_MS) {
    problems.push(
      `ECB_RATES_RETRIEVED_AT is in the future; received ${describeReceived(raw)}. Rates cannot have been retrieved after now, and a future instant makes the table's age negative - which every staleness check reads as fresh, so the value whose purpose is to expose a stale table would instead guarantee it looked current. Supply the instant the rates were actually captured, in UTC or with an explicit offset.`,
    );
    return undefined;
  }

  return instant;
}

/**
 * Resolves `ECB_REFERENCE_RATES` and `ECB_RATES_RETRIEVED_AT`.
 *
 * Rates are not parsed to numbers here, and must not be: they are carried as strings straight
 * through to `Money`/`Decimal`, which is the target's single arithmetic surface.
 *
 * Unset yields an empty table and an undefined retrieval instant, which is the documented
 * no-conversion-configured state.
 *
 * @param source the environment the two keys are read from.
 * @param problems the accumulator every refusal is appended to.
 * @returns the resolved rate table, or `undefined` when the pair does not resolve.
 */
function resolveCurrencyRates(
  source: EnvironmentSource,
  problems: string[],
): CurrencyConfig | undefined {
  const raw = readTrimmed(source, 'ECB_REFERENCE_RATES');
  const rawRetrievedAt = readTrimmed(source, 'ECB_RATES_RETRIEVED_AT');

  if (raw === undefined) {
    if (rawRetrievedAt !== undefined) {
      problems.push(
        'ECB_RATES_RETRIEVED_AT is set but ECB_REFERENCE_RATES is not. A retrieval instant with no rates describes nothing; supply both, or neither to publish no conversion rates at all.',
      );
      return undefined;
    }

    return Object.freeze({
      europeanCentralBankRates: Object.freeze({}),
      ratesRetrievedAt: undefined,
    });
  }

  const rates: Record<string, string> = {};
  const malformed: string[] = [];

  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();

    if (trimmed.length === 0) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    const code = separator < 0 ? '' : trimmed.slice(0, separator).trim().toUpperCase();
    const numeral = separator < 0 ? '' : trimmed.slice(separator + 1).trim();

    if (
      separator < 0 ||
      !CURRENCY_CODE_SHAPE.test(code) ||
      !RATE_NUMERAL_SHAPE.test(numeral) ||
      !/[1-9]/.test(numeral)
    ) {
      malformed.push(trimmed);
      continue;
    }

    rates[code] = numeral;
  }

  if (malformed.length > 0) {
    problems.push(
      `ECB_REFERENCE_RATES contains ${malformed.length} malformed entr${malformed.length === 1 ? 'y' : 'ies'}: ${malformed.map(describeReceived).join(', ')}. Each entry must read CODE=RATE, where CODE is exactly three letters and RATE is a plain positive decimal numeral with no sign and no exponent, for example "USD=1.0850". A zero rate is refused because conversion divides by the source rate.`,
    );
    return undefined;
  }

  if (Object.keys(rates).length === 0) {
    problems.push(
      'ECB_REFERENCE_RATES is set but yielded no usable entries. Leave it unset to publish no conversion rates at all, rather than setting it to a value that resolves to none.',
    );
    return undefined;
  }

  if (rawRetrievedAt === undefined) {
    problems.push(
      'ECB_RATES_RETRIEVED_AT is required whenever ECB_REFERENCE_RATES is set, and was not set (or was blank). Supply the ISO-8601 instant the rates were retrieved, for example "2026-08-04T00:00:00Z", so that their age can be assessed. Rates of unknown age cannot be reported as stale.',
    );
    return undefined;
  }

  const retrievedAt = resolveIsoInstant(rawRetrievedAt, problems);

  if (retrievedAt === undefined) {
    return undefined;
  }

  return Object.freeze({
    europeanCentralBankRates: Object.freeze({ ...rates }),
    ratesRetrievedAt: retrievedAt,
  });
}

/**
 * Database connection settings that keep the credential out of every ACCIDENTAL disclosure route,
 * while leaving it readable as a plain typed property.
 *
 * The credential lives in a private field, so enumeration, object spread, `Object.keys`,
 * `util.inspect` and `JSON.stringify` cannot reach it, and {@link toJSON} redacts every member
 * explicitly. A DIRECT read through the `password` getter is still possible and is how the pool
 * receives it: that read is intentional, and it is the one route a caller must treat as sensitive.
 */
class DatabaseConnectionSettings implements DatabaseConnectionConfig {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly user: string;

  /**
   * Assigned once, by this constructor, and readable only through the getter.
   */
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
   * A projection safe to log or serialize: every member is replaced by the redaction marker, so the
   * shape is visible and no value is.
   *
   * @returns the frozen, fully redacted projection.
   */
  toJSON(): Readonly<Record<string, string>> {
    return Object.freeze({
      host: REDACTED_MARKER,
      port: REDACTED_MARKER,
      database: REDACTED_MARKER,
      user: REDACTED_MARKER,
      password: REDACTED_MARKER,
    });
  }
}

/**
 * Reads every variable, reports every problem at once, and returns a frozen configuration - or
 * throws.
 *
 * Every variable is read before anything is thrown, on purpose: an operator fixing a cold start
 * should be told about all of the missing values, not rediscover them one deployment at a time.
 */
function buildConfiguration(source: EnvironmentSource): AppConfig {
  const problems: string[] = [];

  // First, and over the whole set at once.
  assertDeliverableEnvironment(source, problems);

  const environment = resolveRuntimeEnvironment(source, problems);
  const host = resolveRequired(source, 'DB_HOST', problems);
  const user = resolveRequired(source, 'DB_USER', problems);
  const password = resolveCredential(source, 'DB_PASSWORD', problems);
  const dialect = resolveDatabaseDialect(source, problems);

  const port = resolveInteger(source, 'DB_PORT', DEFAULT_DATABASE_PORT, 1, MAX_TCP_PORT, problems);
  const database = readTrimmed(source, 'DB_NAME') ?? DEFAULT_DATABASE_NAME;
  const tls = resolveDatabaseTls(source, environment, host, problems);

  // Optional in the environment, fail-closed in effect.
  const feedAllowedHosts = resolveFeedAllowedHosts(source, problems);

  // Optional, and empty when unset. See {@link CurrencyConfig} for why a rate table is
  // configuration at all, and `src/handlers/bootstrap.ts` for what an empty one means at
  // conversion time.
  const currency = resolveCurrencyRates(source, problems);

  // Deliberately passed no `problems` array: the threshold cannot fail the process, for the reason
  // stated on {@link LoggingConfig}.
  const logging = resolveLogging(source);

  // The pool integers are operational knobs. `DB_MAX_IDLE` alone accepts zero, because retaining
  // no idle connection is a legitimate operational choice; the other three must be at least one to
  // mean anything.
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
    dialect === undefined ||
    tls === undefined ||
    feedAllowedHosts === undefined ||
    currency === undefined
  ) {
    // Unreachable. Each of these resolvers records a problem whenever it returns undefined, and a
    // non-empty problem list has already thrown above.
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
    tls,
    feed: Object.freeze({ allowedHosts: feedAllowedHosts.allowedHosts }),
    currency,
    logging,
  });
}

/**
 * Cached result of the last successful read of the real process environment.
 *
 * This is module-scope mutable state, so it is worth being precise about what it is not.
 */
let memoizedConfiguration: AppConfig | undefined;

/**
 * The configuration accessor: this module's single exported unit.
 */
export const appConfig = Object.freeze({
  /**
   * Resolves the configuration, throwing if it is invalid.
   *
   * @param source Optional environment source.
   * @returns The frozen configuration.
   * @throws An error named `ConfigurationError`, listing every problem found in one pass, when any
   * required variable is missing or any value is malformed.
   */
  load(source?: EnvironmentSource): AppConfig {
    if (source !== undefined) {
      return buildConfiguration(source);
    }

    memoizedConfiguration ??= buildConfiguration(process.env);
    return memoizedConfiguration;
  },

  /**
   * Discards the memoized result so the next `load()` re-reads the process environment.
   *
   * Provided for tests that need to exercise the real `process.env` path more than once.
   */
  reset(): void {
    memoizedConfiguration = undefined;
  },
});
