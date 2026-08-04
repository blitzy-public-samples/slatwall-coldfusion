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
 * The TLS protocol versions this port is willing to floor at.
 *
 * Deliberately only the two current ones. TLS 1.0 and 1.1 are deprecated and are
 * not offered, so `DB_TLS_MIN_VERSION` cannot be used to weaken the channel below
 * 1.2 - the same closed-union technique the dialect and environment selectors use,
 * applied to a security parameter.
 */
const TLS_MINIMUM_VERSIONS = ['TLSv1.2', 'TLSv1.3'] as const;

/** One of the two accepted TLS protocol floors. */
export type TlsMinimumVersion = (typeof TLS_MINIMUM_VERSIONS)[number];

/**
 * The accepted values of `DB_TLS_MODE`, exactly as
 * `slatwall-ts/.env.example` documents them.
 *
 * Held as a runtime tuple for the same reason as the dialect list: validation
 * and the text of the failure message are driven by one list and cannot drift
 * apart.
 *
 * There is deliberately no opportunistic value. A mode that negotiates TLS when
 * it can and continues in plaintext when it cannot is indistinguishable from no
 * protection, because the party best placed to make the handshake fail is the
 * on-path actor the transport exists to defeat.
 */
const DATABASE_TLS_MODES = ['disabled', 'verify-ca', 'verify-identity'] as const;

/**
 * How the connection to the MySQL server is protected.
 *
 * * `verify-identity` - certificate chain verified against the trusted
 *   authority AND the certificate's host name matched against `DB_HOST`.
 * * `verify-ca` - chain verified, host name not checked. Strictly weaker, and
 *   present only for the structural cases where identity cannot be checked: an
 *   IP-literal host, or a proxy whose certificate names a different host.
 * * `disabled` - no TLS. Rejected outright in production; see
 *   `resolveDatabaseTls`.
 *
 * Certificate verification is never disabled in either verifying mode. This
 * module offers no value that would relax it, and none may be added.
 */
export type DatabaseTlsMode = (typeof DATABASE_TLS_MODES)[number];

/**
 * The URL schemes a product feed may publish, in ascending order of safety.
 *
 * `http` is retained as an ACCEPTED value rather than removed, because the legacy
 * template emitted exactly that and a local or loopback deployment can legitimately
 * serve plain HTTP. It is refused outright when `NODE_ENV` is production - see
 * {@link resolveFeedUrlScheme} - which is the same shape the transport mode already
 * uses for `DB_TLS_MODE=disabled`.
 */
const FEED_URL_SCHEMES = ['http', 'https'] as const;

/**
 * The scheme half of the canonical feed origin.
 *
 * ★ THIS TYPE IS DECLARED HERE, IN THE CONFIGURATION MODULE, ON PURPOSE. The scheme
 * is a DEPLOYMENT fact - which transport a host actually serves - not a rendering
 * choice, so it belongs beside the allow-list that governs the other half of the
 * origin. `src/integrations/google/rssFeedRenderer.ts` imports it as a TYPE ONLY,
 * which keeps that module's standing promise that it never reads the environment:
 * an erased type import pulls no runtime code and no `process.env` access with it.
 */
export type FeedUrlScheme = (typeof FEED_URL_SCHEMES)[number];

/**
 * How to reach the MySQL server that holds the existing `Sw*` schema.
 *
 * `password` is deliberately absent from anything this object serializes to, and
 * `host` and `user` are redacted from it; see `toJSON` and the implementing class
 * for how each of those is guaranteed rather than merely intended.
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
   * every member documented above as never echoed - the credential, the host and
   * the account - is replaced by a redaction marker. The port and the schema name
   * remain visible, because those two are what make a misconfiguration
   * diagnosable and neither carries a never-echoed promise. See the implementing
   * class for the three citations that fix which fields fall on which side.
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
 * The resolved transport-security settings for the database connection.
 *
 * THREE MEMBERS, FROM TWO INDEPENDENT REVIEWS, AND ALL THREE ARE LOAD-BEARING.
 * `mode` and `certificateAuthority` state WHETHER the channel is protected and
 * WHAT it trusts; `minimumVersion` states HOW WEAK the negotiated protocol may
 * be. Those are orthogonal questions - a `verify-identity` handshake carried over
 * TLS 1.0 verifies a certificate across a protocol with known weaknesses - so
 * neither member subsumes the other and both are resolved here.
 *
 * The earlier form of this interface carried `enabled: boolean` in place of
 * `mode`. A boolean cannot express the distinction that matters in practice:
 * chain verification and host-name verification are separate checks, and the
 * deployments that legitimately cannot perform the second (an IP-literal host, a
 * proxy whose certificate names a different host) were previously forced to
 * choose between full verification they could not satisfy and no TLS at all.
 * `mode` names that middle position explicitly instead of leaving it to be
 * reached by turning the flag off, and it is required rather than defaulted, so
 * the posture is always a decision someone wrote down.
 *
 * The absence of a setting is not neutral here: the installed driver resolves an
 * omitted `ssl` option to `false`
 * [node_modules/mysql2/lib/connection_config.js:L146-L149], which is plaintext.
 * Schema continuity is untouched by any of this; no table, column or query
 * changes.
 */
export interface DatabaseTlsConfig {
  /**
   * The stated posture. REQUIRED, WITH NO DEFAULT.
   *
   * There is no default on purpose. Defaulting to "on" silently downgrades when
   * the variable is misspelled, and defaulting to "off" is indefensible; making
   * the value required means a deployment cannot acquire a transport posture by
   * accident.
   */
  readonly mode: DatabaseTlsMode;
  /**
   * The authority to trust, as PEM text, or `undefined` to trust the runtime's
   * built-in public root store.
   *
   * Always `undefined` when `mode` is `disabled`, because there is then no
   * handshake for a trust anchor to participate in.
   *
   * Typed `string | undefined` rather than declared optional on purpose:
   * `exactOptionalPropertyTypes` is on, and an explicitly present `undefined`
   * states "resolved, and there is none" instead of "possibly not resolved".
   */
  readonly certificateAuthority: string | undefined;
  /**
   * Lowest acceptable TLS protocol version, defaulting to `TLSv1.2`. Passed to
   * the driver, which forwards it into the secure context
   * [node_modules/mysql2/lib/base/connection.js:L389].
   *
   * Its type is a closed two-member union, so this cannot floor the channel below
   * 1.2 whatever the environment says - the floor is enforced by the type, not by
   * a comparison someone has to remember to write. Ignored when `mode` is
   * `disabled`, where no protocol is negotiated at all.
   */
  readonly minimumVersion: TlsMinimumVersion;
}

/**
 * The fully resolved, validated and frozen process configuration.
 *
 * The members mirror the groups of `slatwall-ts/.env.example` that name this
 * module as their reader, one for one, so that the mapping from the committed
 * contract to the code that consumes it stays auditable.
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
  /** Transport-security settings for that connection. */
  readonly tls: DatabaseTlsConfig;
  /** Product-feed publication settings. */
  readonly feed: FeedConfig;
  /** Currency-conversion reference data. */
  readonly currency: CurrencyConfig;
}

/**
 * The European Central Bank reference rates, and when they were retrieved.
 *
 * ★ THIS EXISTS BECAUSE THE PORT HAD NO WAY AT ALL TO SUPPLY A RATE IN PRODUCTION.
 *
 * The legacy service fetched the table itself, over plain HTTP, from
 * `http://www.ecb.int/stats/eurofxref/eurofxref-daily.xml`
 * [model/service/CurrencyService.cfc:L109], memoized it on the component, and
 * refetched whenever the memo was absent or older than a day [L105]. None of that
 * survives the migration: an outbound fetch on a per-request Lambda path is a
 * different execution model, the memo would be cross-invocation state under a warm
 * container, and the legacy TODO at [L81] records that a conversion INTEGRATION was
 * the intended supply route all along.
 *
 * The port's first revision therefore left the table empty in production and
 * supplyable only through `CompositionOverrides`, which is a test seam. A security
 * review raised the consequence as finding S-20, HIGH, CWE-754 and CWE-840: with an
 * always-empty table, every cross-currency conversion takes the [L100-L101]
 * pass-through and returns the amount UNCHANGED, so a EUR price is published as the
 * same numeral in USD and JPY and the failure is indistinguishable from success.
 *
 * WHAT IS FIXED HERE, AND WHAT IS DELIBERATELY NOT. Fixed: a deployment can now
 * supply rates, they are integrity-checked before the process starts, and their age
 * is recorded so staleness is observable. NOT fixed, and declined on a cited
 * mandate: the pass-through itself. See the disposition on
 * `EUROPEAN_CENTRAL_BANK_RATE_MAX_AGE_DAYS` in `src/handlers/bootstrap.ts`.
 */
export interface CurrencyConfig {
  /**
   * Per-euro reference rates, keyed by upper-cased three-letter currency code.
   *
   * Values are plain decimal numerals, held as STRINGS and never as numbers -
   * every rate reaches `Money`/`Decimal` arithmetic, and parsing a rate to an
   * IEEE-754 double on the way in is exactly how drift enters a money path.
   *
   * EMPTY IS THE DEFAULT, and it preserves the behaviour of a deployment that
   * configures nothing: every non-pivot conversion passes through, exactly as the
   * legacy did when its empty `catch` [L127-L128] swallowed a fetch failure.
   */
  readonly europeanCentralBankRates: Readonly<Record<string, string>>;

  /**
   * When the supplied rates were retrieved, or `undefined` when none were supplied.
   *
   * The legacy analogue is the `retrieved` key it wrote into its own memo
   * [model/service/CurrencyService.cfc:L124] and compared against `now() - 1` at
   * [L105]. Required whenever rates ARE supplied: a rate table whose age is unknown
   * cannot be assessed, and silently treating it as current is the failure mode this
   * member exists to prevent.
   */
  readonly ratesRetrievedAt: Date | undefined;
}

/**
 * Which hosts this deployment is permitted to publish a product feed for.
 *
 * ★ THIS EXISTS BECAUSE THE ALLOW-LIST MUST NOT COME FROM THE REQUEST.
 *
 * The legacy template derived the feed origin from `CGI.HTTP_HOST` at render
 * time - the literal `http://#CGI.HTTP_HOST#` appears at five sites
 * [integrationServices/google/views/feed/product.cfm:L14, L15, L22, L23, L24] -
 * so the host published in a merchant feed was whatever authority the request
 * carried. An earlier revision of this port reproduced that shape faithfully but
 * moved BOTH halves of the decision into the request: `RequestScopeInput`
 * supplied a candidate host AND the allow-list it was checked against.
 *
 * A security review raised that as finding S-15, MEDIUM, CWE-346 and CWE-20: a
 * caller could submit `attacker.example` as the candidate and `['attacker.example']`
 * as the allow-list, and mint a trusted origin - the allow-list check passes
 * vacuously when the checked party writes the list. Its required resolution was to
 * "Remove `allowedHosts` from request scope; inject an immutable deployment-owned
 * canonical origin/allow-list", and that is what this member is.
 *
 * The candidate is still observed on the request, because that is the legacy
 * behaviour and a deployment may legitimately answer on more than one authority.
 * What changed is that the LIST it is checked against is now process
 * configuration, fixed for the lifetime of the container and unreachable from any
 * request.
 *
 * NOTHING HERE IS AAP-CONSTRAINED. AAP 0.4.1 specifies exactly three hardcodings
 * to preserve in the feed renderer - `g:condition="new"`, `g:availability="in
 * stock"` and the empty `g:google_product_category` - and the origin is not among
 * them. The origin was never hardcoded in the legacy either; it was a runtime
 * value. Making its provenance configuration rather than a request header is
 * therefore a change of provenance, not a change of the feed contract.
 */
export interface FeedConfig {
  /**
   * The hosts a product feed may be published for, normalized and de-duplicated.
   *
   * EMPTY IS THE SAFE DEFAULT AND THE DEFAULT: `toTrustedFeedHost` refuses every
   * candidate against an empty list, so a deployment that never configured a feed
   * cannot publish one. That is a refusal, not a bypass, and it is why this key is
   * optional - adding a sixth REQUIRED variable would break every existing
   * deployment and every test that supplies only the five the database needs.
   */
  readonly allowedHosts: readonly string[];

  /**
   * The scheme written into the five URL sites the legacy prefixed with `http://`.
   *
   * ★★ THIS MEMBER REVERSES AN EARLIER DECLINATION IN THIS PORT, and the reversal is
   * recorded rather than quietly applied. A previous revision hardcoded `http://` in
   * `rssFeedRenderer.ts` and declined the security review's CWE-319 finding (S-09) on
   * the ground that AAP 0.1.1 requires preserving "the Google product-feed integration
   * contract exactly". Re-reading the AAP settles it the other way, on the more
   * specific clause:
   *
   *   AAP 0.4.1 enumerates, for this exact file, the hardcodings that are preserved -
   *   `g:condition="new"`, `g:availability="in stock"`, and the empty
   *   `g:google_product_category` "preserved with the legacy TODO". THE SCHEME IS NOT
   *   AMONG THEM. A specific instruction about this renderer governs a general one
   *   about the integration, and the general clause is about the CONTRACT - the
   *   element set, their order and their semantics - all of which are untouched here.
   *
   * The decisive legacy fact is that the origin was NEVER a fixed value to preserve.
   * [integrationServices/google/views/feed/product.cfm:L14, L15, L22, L23, L24] read
   * `http://#CGI.HTTP_HOST#`: the authority varied per deployment and per request
   * already, so no two installations ever published the same URLs. Making the scheme
   * deployment-owned puts it on exactly the footing the host has always been on. What
   * would breach the contract is changing WHICH elements carry a URL, and nothing does.
   *
   * DEFAULTS TO `https`, WHICH IS A DELIBERATE CHANGE OF DEFAULT. An unconfigured
   * deployment now publishes secure URLs instead of cleartext ones; a deployment that
   * genuinely serves plain HTTP opts in explicitly, and cannot do so in production.
   * Byte-for-byte legacy parity remains reachable and is still pinned by the renderer
   * suite, which renders with `'http'` supplied explicitly and asserts the golden
   * legacy document - so parity is demonstrated by a test rather than by a hardcoded
   * literal nobody can override.
   */
  readonly scheme: FeedUrlScheme;
}

// --- Defaults ---------------------------------------------------------------
// Only two literal defaults in this file are permitted to be non-generic, and
// both are non-secret by nature: the schema name and the registered port. Host,
// account and credential deliberately have NO default, so a deployment cannot
// silently start against something other than what was intended.

/** The TLS floor when `DB_TLS_MIN_VERSION` is unset. */
const DEFAULT_TLS_MINIMUM_VERSION: TlsMinimumVersion = 'TLSv1.2';

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

/**
 * The scheme an unconfigured deployment publishes feed URLs with.
 *
 * `https`, NOT the legacy `http`. This is the one default in this file that is
 * deliberately not the legacy value; {@link FeedConfig.scheme} carries the AAP
 * reasoning and the reversal it records.
 */
const DEFAULT_FEED_URL_SCHEME: FeedUrlScheme = 'https';

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

/**
 * The opening delimiter every PEM certificate carries.
 *
 * Used as a shape check on `DB_TLS_CA`, not as a parse. The runtime's TLS
 * implementation is the only thing that can truly validate a bundle, and it will
 * do so at the handshake; the point of checking here is that a value which is
 * plainly not a certificate - a file path, a base64 blob, a stray comment - is
 * reported at startup with the variable named, rather than surfacing later as an
 * opaque handshake failure.
 */
const PEM_CERTIFICATE_MARKER = '-----BEGIN CERTIFICATE-----';

/**
 * Literal two-character `\n` sequences, converted to real newlines in the CA.
 *
 * Some deployment tooling cannot carry a multi-line environment value, so the
 * escaped form is accepted and normalized. Applied ONLY to `DB_TLS_CA`, whose
 * content is a public certificate; no other variable is rewritten, and the
 * credential in particular is never transformed at all.
 */
const ESCAPED_NEWLINE_PATTERN = /\\n/g;

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

/**
 * Resolves `DB_TLS_MODE`, `DB_TLS_MIN_VERSION` and `DB_TLS_CA`, or records why the
 * process must not start.
 *
 * WHY A MODE RATHER THAN A FLAG. The variable this replaced was a boolean, and a
 * boolean forces two unrelated questions through one answer. Chain verification
 * and host-name verification are separate checks, and a deployment that cannot
 * satisfy the second - an IP-literal host, or a proxy whose certificate names a
 * different host - previously had only one way out of a failing handshake, which
 * was to turn TLS off entirely. Naming `verify-ca` makes the weaker-but-still-
 * verified position reachable without abandoning the channel, and it makes the
 * choice legible in the environment rather than inferable from a failure.
 *
 * THERE IS NO DEFAULT AND NO OPPORTUNISTIC MODE. A default of "on" downgrades
 * silently when the variable is misspelled; a mode that negotiates TLS when it can
 * and continues in plaintext when it cannot is indistinguishable from no
 * protection at all, because the party best placed to make the handshake fail is
 * the on-path actor the transport exists to defeat. An unset variable is therefore
 * a startup failure, not a fallback.
 *
 * THE PROTOCOL FLOOR IS RESOLVED HERE TOO, AND IT IS NOT REDUNDANT WITH THE MODE.
 * A verified certificate says nothing about the strength of the protocol carrying
 * it, so `DB_TLS_MIN_VERSION` is read on every verifying path. Its accepted values
 * are a closed two-member union, which is what makes the floor unfalsifiable: the
 * type admits no value below TLS 1.2, so there is no comparison for a later edit
 * to get wrong. It is read even when the mode is `disabled` - one branch below
 * returns before using it - so that a malformed value is still reported rather
 * than hidden behind an unrelated setting.
 *
 * The CA is read as PEM TEXT, never as a path: this module performs no filesystem
 * access - it has no imports at all - and the deployed runtime injects environment
 * variables natively, so a path would have nothing to resolve against. A
 * certificate authority certificate is public by definition, so it is not treated
 * as a credential; it is nevertheless never echoed into a failure message, because
 * reproducing a multi-kilobyte bundle in an error would bury the diagnosis it is
 * meant to support.
 */
function resolveDatabaseTls(
  source: EnvironmentSource,
  environment: RuntimeEnvironment | undefined,
  problems: string[],
): DatabaseTlsConfig | undefined {
  const accepted = DATABASE_TLS_MODES.join(', ');
  const guidance = `Accepted values are ${accepted} (matched without regard to case). verify-identity is recommended; verify-ca omits the host-name check and suits only an IP-literal host or a proxy whose certificate names a different host; disabled is for a loopback development server and is rejected outright when NODE_ENV is production. There is deliberately no default and no opportunistic mode.`;

  const rawMode = readTrimmed(source, 'DB_TLS_MODE');
  if (rawMode === undefined) {
    problems.push(`DB_TLS_MODE is required, but was not set (or was blank). ${guidance}`);
    return undefined;
  }

  const mode = matchCanonical(DATABASE_TLS_MODES, rawMode);
  if (mode === undefined) {
    // Echoed because a transport mode is an enumeration rather than a credential,
    // and an operator who mistyped it needs to see the typo. The echo is clipped
    // by `describeReceived` like every other non-credential one.
    problems.push(
      `DB_TLS_MODE is not a recognized transport mode; received ${describeReceived(rawMode)}. ${guidance}`,
    );
    return undefined;
  }

  if (mode === 'disabled' && environment === 'production') {
    problems.push(
      'DB_TLS_MODE is disabled while NODE_ENV is production, which would send the account, the credential and every statement over an unprotected connection. Set verify-identity, or verify-ca when the host name cannot be checked, and supply the trust anchor through DB_TLS_CA if the authority is not a public root.',
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
    // Documented in `slatwall-ts/.env.example` as ignored rather than rejected:
    // there is no handshake for a trust anchor to participate in, and refusing a
    // leftover value would turn switching a development machine to `disabled` into
    // a two-variable edit for no security benefit. `minimumVersion` is carried
    // anyway so the resolved shape has no conditional members.
    return Object.freeze({ mode, certificateAuthority: undefined, minimumVersion });
  }

  if (rawCertificateAuthority === undefined) {
    // Not a problem. An unset anchor means the runtime's built-in public root store
    // is trusted, which is correct for a managed database whose certificate is
    // signed by a public authority, and verification remains on either way.
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
 * A bare host authority, for validating `FEED_ALLOWED_HOSTS` at start-up.
 *
 * ★ THIS IS A FAIL-FAST ON DEPLOYMENT CONFIGURATION, NOT A SECOND SOURCE OF TRUTH.
 * `toTrustedFeedHost` in `src/integrations/google/googleFeedService.ts` remains the
 * only mint for a trusted host, and it re-checks the same shape at the point of use.
 * Checking here as well means a typo in the deployment's own list is a start-up
 * failure with a named variable rather than a silent refusal of every feed request
 * later, and the two patterns are deliberately identical so a value cannot pass one
 * and fail the other. If they ever diverge, the mint wins by construction: it runs
 * last and its result is what gets published.
 *
 * A port is permitted, because the legacy `CGI.HTTP_HOST` carried one whenever the
 * request used a non-default port.
 */
const FEED_ALLOWED_HOST_AUTHORITY =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/;

/**
 * Resolves `FEED_ALLOWED_HOSTS`, a comma-separated list of bare host authorities.
 *
 * Unset or blank yields an EMPTY list, which refuses every feed candidate. That is
 * the safe default and is why no deployment is forced to configure a feed.
 *
 * Each member is trimmed and lower-cased before validation, because DNS names are
 * case-insensitive and the mint normalizes the same way; duplicates that differ only
 * in casing or surrounding space therefore collapse to one entry. Nothing else is
 * rewritten - no punycode conversion, no default-port stripping, no trailing-dot
 * removal - because each would make the configured host differ from the request host
 * it is matched against.
 *
 * A malformed member is a recorded problem rather than a silently dropped entry: a
 * deployment that meant to allow `shop.example.com` and wrote `https://shop.example.com`
 * must be told, not quietly left refusing every request.
 */
function resolveFeedAllowedHosts(
  source: EnvironmentSource,
  problems: string[],
): readonly string[] | undefined {
  const raw = readTrimmed(source, 'FEED_ALLOWED_HOSTS');

  if (raw === undefined) {
    return Object.freeze([]);
  }

  const members = raw
    .split(',')
    .map((member) => member.trim().toLowerCase())
    .filter((member) => member.length > 0);

  const malformed = members.filter((member) => !FEED_ALLOWED_HOST_AUTHORITY.test(member));

  if (malformed.length > 0) {
    problems.push(
      `FEED_ALLOWED_HOSTS contains ${malformed.length} entr${malformed.length === 1 ? 'y' : 'ies'} that ${malformed.length === 1 ? 'is' : 'are'} not a bare host authority: ${malformed.map(describeReceived).join(', ')}. Supply hosts only - no scheme, credentials, path, query or fragment - separated by commas, for example "shop.example.com,shop.example.com:8443". Leave it unset to publish no product feed at all.`,
    );
    return undefined;
  }

  return Object.freeze([...new Set(members)]);
}

/**
 * Resolves `FEED_URL_SCHEME`, the scheme half of the canonical feed origin.
 *
 * Unset yields `https`, which is the SAFE default and a deliberate departure from the
 * legacy literal - see {@link FeedConfig.scheme} for why AAP 0.4.1 permits it. An
 * operator who needs the legacy value sets `http` explicitly and thereby makes a
 * cleartext feed a recorded decision instead of an inherited accident.
 *
 * `http` IS REFUSED OUTRIGHT WHEN `NODE_ENV` IS PRODUCTION. That is the review's
 * "refuse insecure origin configuration" requirement, and it deliberately mirrors the
 * existing `DB_TLS_MODE=disabled` refusal in {@link resolveDatabaseTls}: the two are
 * the same judgment - a transport that is defensible on a developer's loopback is not
 * defensible for real traffic - so they are expressed the same way rather than each
 * inventing its own shape. The refusal is a startup problem, so a production
 * deployment cannot begin serving cleartext feed URLs and discover it later.
 *
 * A misspelled scheme is a recorded problem rather than a silent fallback to the
 * default: `htps` must be reported, not quietly upgraded to `https`, because an
 * operator who mistyped it needs to see the typo. The value is an enumeration and
 * never a credential, so it is echoed back like every other non-secret one.
 */
function resolveFeedUrlScheme(
  source: EnvironmentSource,
  environment: RuntimeEnvironment | undefined,
  problems: string[],
): FeedUrlScheme | undefined {
  const guidance = `Accepted values are ${FEED_URL_SCHEMES.join(', ')} (matched without regard to case). Leave it unset to use ${DEFAULT_FEED_URL_SCHEME}, which is the safe default; http is accepted only outside production, for a loopback or local host that genuinely serves plain HTTP.`;

  const raw = readTrimmed(source, 'FEED_URL_SCHEME');

  if (raw === undefined) {
    return DEFAULT_FEED_URL_SCHEME;
  }

  const scheme = matchCanonical(FEED_URL_SCHEMES, raw);

  if (scheme === undefined) {
    problems.push(
      `FEED_URL_SCHEME is not a recognized URL scheme; received ${describeReceived(raw)}. ${guidance}`,
    );
    return undefined;
  }

  if (scheme === 'http' && environment === 'production') {
    problems.push(
      'FEED_URL_SCHEME is http while NODE_ENV is production, which would publish every product, image and channel URL in the merchant feed over cleartext and let an on-path attacker rewrite the links a shopper follows. Set https, or leave it unset.',
    );
    return undefined;
  }

  return scheme;
}

/** A three-letter ISO currency code, the only key shape a rate entry may carry. */
const CURRENCY_CODE_SHAPE = /^[A-Z]{3}$/;

/**
 * A plain, unsigned decimal numeral - no sign, no exponent, no thousands separator.
 *
 * Exponent notation is refused rather than normalized. `1e-2` is a perfectly good
 * double and a perfectly bad configuration value: it reaches `Decimal` as a string,
 * and refusing it here means the one representation a reviewer can read is also the
 * only one a deployment can write.
 */
const RATE_NUMERAL_SHAPE = /^\d+(\.\d+)?$/;

/**
 * Resolves `ECB_REFERENCE_RATES` and `ECB_RATES_RETRIEVED_AT`.
 *
 * Format is a comma list of `CODE=RATE` pairs, matching the comma-list idiom the
 * rest of this contract uses rather than introducing a JSON payload:
 *
 *     ECB_REFERENCE_RATES=USD=1.0850,GBP=0.8520,JPY=163.41
 *
 * THREE INTEGRITY CHECKS, ALL BEFORE THE PROCESS STARTS, and each one guards a way
 * that a bad rate silently becomes a wrong price:
 *
 *   1. SHAPE. The key must be exactly three ASCII letters and the value a plain
 *      unsigned decimal numeral. A pair missing its `=`, or carrying a second one,
 *      is refused rather than half-read.
 *   2. STRICT POSITIVITY. A zero rate is refused. `convertCurrency` DIVIDES by the
 *      source rate [model/service/CurrencyService.cfc:L90], so a zero would raise
 *      mid-conversion; and a zero TARGET rate would price everything at nothing.
 *      Negative values cannot arrive at all, because the numeral shape admits no
 *      sign - which is stricter than a positivity test and is the point of using a
 *      shape that excludes the sign rather than one that accepts and then rejects it.
 *   3. AGE. `ECB_RATES_RETRIEVED_AT` is REQUIRED whenever any rate is supplied, and
 *      must be an ISO-8601 instant. Rates of unknown age cannot be assessed, and the
 *      legacy always knew the age of its own table - it wrote `retrieved` into the
 *      memo at [L124].
 *
 * Rates are NOT parsed to numbers here, and must not be: they are carried as strings
 * straight through to `Money`/`Decimal`, which is the target's single arithmetic
 * surface. Validating the string and keeping the string is what makes that possible.
 *
 * Unset yields an empty table and an undefined retrieval instant, which is the
 * documented no-conversion-configured state.
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

  const retrievedAt = new Date(rawRetrievedAt);

  if (Number.isNaN(retrievedAt.getTime())) {
    problems.push(
      `ECB_RATES_RETRIEVED_AT is not a parsable instant; received ${describeReceived(rawRetrievedAt)}. Supply an ISO-8601 instant, for example "2026-08-04T00:00:00Z".`,
    );
    return undefined;
  }

  return Object.freeze({
    europeanCentralBankRates: Object.freeze({ ...rates }),
    ratesRetrievedAt: retrievedAt,
  });
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
   * `JSON.stringify` of a configuration object is safe to log: every member this
   * file promises is never echoed is replaced by a fixed marker that cannot be
   * mistaken for a real value, while the members that are genuinely useful for
   * diagnosis remain visible.
   *
   * ★ THREE FIELDS ARE REDACTED, NOT ONE, AND THE TWO ADDITIONS ARE NOT A
   * JUDGEMENT CALL - THEY CLOSE A CONTRADICTION BETWEEN THIS METHOD AND THE
   * PROMISES MADE ABOUT IT. Redacting only the credential left this projection
   * disagreeing with three separate statements elsewhere, each of which is a
   * checkable citation rather than an opinion:
   *
   *   * The property documentation directly above `host` and `user` on
   *     `DatabaseConnectionConfig` says each is "never echoed in diagnostics".
   *     This method echoed both, so one of the two had to be wrong.
   *   * `src/lib/logger.ts` independently lists `host` in its never-log key set
   *     [`CONNECTION_KEYS`], so a caller who logged this projection got a
   *     redaction marker for a key named `host` from one code path and the real
   *     hostname from this one - the same field, two answers.
   *   * `src/repositories/mysql/connection.ts` omits the host from its
   *     pool-created log line and says in as many words that the account is
   *     "never passed at all", citing this file's promise as its reason. That
   *     omission was load-bearing on a promise this method broke.
   *
   * WHY `database` AND `port` STAY VISIBLE, which looks like an inconsistency
   * until the three authorities above are applied mechanically rather than by
   * feel. Neither is documented as never-echoed on its property above; neither
   * appears in the logger's never-log key set; and `connection.ts` logs both
   * DELIBERATELY, in the very line that omits the host. They are also what makes
   * a misconfiguration diagnosable at all - "connected to the wrong schema" and
   * "connected to the wrong port" are the two failures this projection exists to
   * surface. Redacting them would not close a contradiction, it would create a
   * fresh one with `connection.ts` and blind the diagnostic at the same time.
   *
   * They are REDACTED rather than OMITTED, matching the credential's existing
   * treatment, because a marker proves a deliberate decision was made where a
   * missing key is indistinguishable from a field nobody remembered to add.
   * `appConfig.load`'s documented guarantee - redacted, not merely omitted -
   * therefore stays true of all three.
   */
  toJSON(): Readonly<Record<string, string | number>> {
    return Object.freeze({
      host: REDACTED_MARKER,
      port: this.port,
      database: this.database,
      user: REDACTED_MARKER,
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

  // Resolved AFTER the environment, because the production rule inside it reads
  // the already-validated `environment` rather than re-reading NODE_ENV.
  const tls = resolveDatabaseTls(source, environment, problems);

  // Optional, and empty when unset - a deployment that publishes no product feed
  // configures nothing. See {@link FeedConfig} for why the list lives here at all
  // rather than arriving on the request that is being checked against it.
  const feedAllowedHosts = resolveFeedAllowedHosts(source, problems);

  // Also resolved AFTER the environment, and for the same reason as the transport
  // mode: its production rule reads the already-validated `environment`.
  const feedScheme = resolveFeedUrlScheme(source, environment, problems);

  // Optional, and empty when unset. See {@link CurrencyConfig} for why a rate table
  // is configuration at all, and `src/handlers/bootstrap.ts` for what an empty one
  // means at conversion time.
  const currency = resolveCurrencyRates(source, problems);

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
    dialect === undefined ||
    tls === undefined ||
    feedAllowedHosts === undefined ||
    feedScheme === undefined ||
    currency === undefined
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
    tls,
    feed: Object.freeze({ allowedHosts: feedAllowedHosts, scheme: feedScheme }),
    currency,
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
 *     this module must make impossible. The surface is fourteen variables of four
 *     primitive shapes, so nothing is lost by writing it out: five strings
 *     (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_TLS_CA`), five
 *     integers (`DB_PORT`, `DB_CONNECTION_LIMIT`, `DB_CONNECT_TIMEOUT_MS`,
 *     `DB_IDLE_TIMEOUT_MS`, `DB_MAX_IDLE`) and four closed enumerations
 *     (`DB_DIALECT`, `NODE_ENV`, `DB_TLS_MODE`, `DB_TLS_MIN_VERSION`). There is
 *     no boolean in the surface: the transport setting that used to be one is now
 *     `DB_TLS_MODE`, a required enumeration, because a boolean could not express
 *     the difference between chain verification and identity verification.
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
   * @returns The frozen configuration. `JSON.stringify` of it is safe to log: the
   *   credential, the host and the account are each redacted rather than merely
   *   omitted, so the output carries positive evidence of the redaction instead
   *   of an absence that cannot be told apart from an oversight.
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
