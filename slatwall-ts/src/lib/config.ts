// ---------------------------------------------------------------------------
// slatwall-ts - static, environment-driven process configuration
//
// WHAT THIS MODULE IS
//   The owner of SEVENTEEN of the nineteen keys in the committed environment
//   contract, and the only module under `src/**` that reads more than one of
//   them. It resolves, validates, freezes and memoizes the values needed to
//   reach the existing `Sw*` MySQL schema, and it fails the process outright the
//   moment any of them is missing or malformed. It contains no credential of its
//   own: every value originates in the environment, and the committed contract
//   for that environment is `slatwall-ts/.env.example`, which this module
//   consumes key-for-key - adding no variable and omitting none that is assigned
//   to it.
//
//   THE OTHER TWO KEYS ARE OWNED ELSEWHERE, AND SAYING SO EXACTLY MATTERS,
//   because an earlier revision of this header and of `slatwall-ts/README.md`
//   both claimed this module was the SOLE reader of `process.env` - a claim a
//   reviewer can falsify with one grep, and which would have made the two real
//   readers look like violations of a rule rather than the documented design
//   they are:
//
//     LOG_LEVEL           `src/lib/logger.ts`, which must be able to emit before
//                         configuration has resolved and therefore cannot depend
//                         on this module. See the note above `appConfig`.
//     TEST_LIVE_DATABASE  `tests/setup.ts`. Test-only, read by nothing under
//                         `src/**`, and deliberately absent from this module so
//                         that a unit test needs no populated environment.
//
//   Seventeen plus those two is the whole contract, and no other module under
//   `src/**` touches `process.env` at all.
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
//   * The test-only live-database flag `TEST_LIVE_DATABASE`, which
//     `slatwall-ts/.env.example` records as read by `tests/setup.ts` and by
//     nothing under `src/**`. It is the ONE key of the nineteen-key contract this
//     module does not resolve, and the reason is that it does not describe the
//     service: it selects whether an integration suite talks to a real server.
//     Resolving it here would put a test-harness switch on the production
//     configuration surface, where a handler could read it. `LOG_LEVEL` used to
//     be listed alongside it as a second exemption; it no longer is - see
//     `resolveLogging` and {@link LoggingConfig}.
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
 * The accepted values of `LOG_LEVEL`, ordered least to most severe, taken from the
 * `LOG_LEVEL` entry in `slatwall-ts/.env.example`.
 *
 * ★ THE UNION IS DELIBERATELY DUPLICATED, NOT IMPORTED. `src/lib/logger.ts` declares
 * the same four literals as its `LogLevel`, and neither file imports the other: this
 * module must be able to raise its own startup failure without anything else having
 * loaded, and the logger must be able to report THAT failure without depending on
 * configuration. Duplication is the price of that mutual independence, and it is not
 * a silent one - the two unions meet at the adoption call in
 * `src/handlers/bootstrap.ts`, where a divergence between them is a compile error
 * rather than a runtime surprise.
 */
const LOG_THRESHOLDS = ['debug', 'info', 'warn', 'error'] as const;

/** The resolved emission threshold. Structurally identical to the logger's `LogLevel`. */
export type LogThreshold = (typeof LOG_THRESHOLDS)[number];

/**
 * How the resolved threshold was arrived at.
 *
 * The classifier exists so that the one-time operator warning about a mistyped
 * `LOG_LEVEL` can be emitted from a FIXED vocabulary. It replaces an earlier
 * arrangement in which the logger echoed the raw configured token back onto the log
 * stream and retained it in a process-global set: any value shaped like an
 * identifier was published verbatim, and an access key, a short token or a password
 * pasted into the wrong variable fits that shape exactly. Nothing here carries the
 * rejected value - only which of three things happened to it.
 */
export type LogThresholdSource =
  /** `LOG_LEVEL` named one of the four accepted values; that value is in force. */
  | 'configured'
  /** `LOG_LEVEL` was unset or blank, which is the documented way to accept the default. */
  | 'defaulted-unset'
  /** `LOG_LEVEL` held something else. The default is in force and the value is discarded. */
  | 'defaulted-unrecognized';

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
 * * `disabled` - no TLS. Requires `DB_HOST` to be a loopback address, in EVERY
 *   environment, and is additionally rejected outright when `NODE_ENV` is
 *   `production`. The host rule is the one that carries the guarantee: `NODE_ENV`
 *   defaults to `development`, so the production rule alone let an environment that
 *   merely omitted it send credentials to a remote server in cleartext. See
 *   `resolveDatabaseTls` and `isLoopbackHost`.
 *
 * Certificate verification is never disabled in either verifying mode. This
 * module offers no value that would relax it, and none may be added.
 */
export type DatabaseTlsMode = (typeof DATABASE_TLS_MODES)[number];

/**
 * How to reach the MySQL server that holds the existing `Sw*` schema.
 *
 * `password` is deliberately absent from anything this object serializes to, and
 * every other member - host, port, schema name and account - is redacted from it;
 * see `toJSON` and the implementing class for how each of those is guaranteed
 * rather than merely intended, and for why the schema name and the port are on the
 * redacted side rather than published as diagnostics.
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
   * A projection safe to log or serialize: every member is replaced by a redaction
   * marker, so the shape is visible and no value is. See the implementing class for
   * why the schema name and the port joined the credential, the host and the
   * account rather than staying visible as "diagnostic".
   */
  toJSON(): Readonly<Record<string, string>>;
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
  /** Emission threshold for `src/lib/logger.ts`, and how it was arrived at. */
  readonly logging: LoggingConfig;
}

/**
 * The resolved emission threshold, and the classification of how it was resolved.
 *
 * ★ THIS MEMBER EXISTS TO MAKE THIS MODULE'S OWN HEADER TRUE. The header states that
 * this is "the one place this service reads its process environment", and for one
 * variable it used not to be: `src/lib/logger.ts` read `LOG_LEVEL` out of
 * `process.env` itself, on every emission, so the subtree had two configuration
 * authorities and the documented single-authority claim was false. The variable is
 * now resolved, validated and frozen here with every other one, and the logger reads
 * no environment at all - it is HANDED the resolved threshold by the composition
 * root.
 *
 * ★★ RESOLUTION IS LENIENT, AND THAT ASYMMETRY IS STRUCTURAL RATHER THAN A
 * CONCESSION. Every other value in this file fails the process closed when it is
 * malformed. This one must not, because this module reports its own fatal failure
 * THROUGH the logger: a threshold that could abort a cold start would produce a
 * service that can neither start nor say why. So a malformed `LOG_LEVEL` records no
 * problem, contributes nothing to the aggregate throw, and falls back to `info` -
 * exactly the behaviour the logger had before, relocated so that the value passes
 * through validation on its way to being used. The mistyped value is not silently
 * swallowed either: {@link LogThresholdSource} carries the fact of the coercion, and
 * `src/handlers/bootstrap.ts` announces it once per container.
 */
export interface LoggingConfig {
  /** The threshold in force. `info` whenever `LOG_LEVEL` was unset, blank or unrecognized. */
  readonly level: LogThreshold;
  /** Which of the three resolution outcomes produced {@link LoggingConfig.level}. */
  readonly levelSource: LogThresholdSource;
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
 * THE HOST HALF OF THE ORIGIN IS NOT AAP-CONSTRAINED, because it was never a fixed
 * value in the legacy to preserve. `CGI.HTTP_HOST` varied per deployment and per
 * request, so no two installations ever published the same authority. Moving the
 * ALLOW-LIST for that authority out of the request and into process configuration is
 * therefore a change of provenance, not a change of the feed contract.
 *
 * ★★ THE SCHEME HALF IS AAP-CONSTRAINED, AND THIS INTERFACE NO LONGER CARRIES IT.
 * An earlier revision declared a second member here:
 *
 *   "readonly scheme: FeedUrlScheme;" - "The scheme written into the five URL sites
 *   the legacy prefixed with `http://`" - defaulting to `https` and refusing `http`
 *   in production, argued on the ground that AAP 0.4.1 enumerates only
 *   `g:condition="new"`, `g:availability="in stock"` and the empty
 *   `g:google_product_category` as preserved hardcodings, so "THE SCHEME IS NOT
 *   AMONG THEM".
 *
 * That reading was wrong, and the member, its `FeedUrlScheme` type, its `https`
 * default and its `FEED_URL_SCHEME` resolver are all removed. AAP 0.4.1's list
 * enumerates the hardcodings that carry a KNOWN LEGACY DEFECT worth annotating - the
 * empty category element is the one the AAP's own defect register singles out - and
 * reading a non-exhaustive list of annotated defects as an exhaustive licence to change
 * everything absent from it inverts it. (AAP 0.6.7 describes that element as "carrying a
 * legacy TODO"; the template line is a bare empty element with no comment near it, which
 * `src/integrations/google/rssFeedRenderer.ts` records where the element is emitted.) The governing clauses are AAP 0.1.1, which
 * requires preserving "the Google product-feed integration contract exactly", and AAP
 * 0.8.1, which freezes that contract; neither admits a scheme change, and AAP 0.6.7
 * permits exactly three divergences in this port, none of them this one. A security
 * goal does not authorize AAP drift. The scheme is once again the legacy literal, in
 * `src/integrations/google/rssFeedRenderer.ts`, where the five URL sites are built.
 */
export interface FeedConfig {
  /**
   * The hosts a product feed may be published for, normalized and de-duplicated. NEVER
   * `undefined`, and an EMPTY list means this deployment publishes no feed.
   *
   * ★★★ THERE IS NO ALLOW-ALL STATE, AND ITS REMOVAL IS A SECURITY FINDING'S RESOLUTION
   * (CWE-346). This member was typed `readonly string[] | undefined`, where `undefined`
   * meant "no host policy is configured" and `assertAllowedFeedHost` then admitted
   * WHATEVER AUTHORITY THE REQUEST CARRIED. Because the variable is optional, that was the
   * DOCUMENTED DEFAULT deployment: a caller-supplied `Host` header reached the five URL
   * sites of a merchant feed, so an attacker able to reach the endpoint could have Google
   * Merchant Center fetch a catalog whose every link pointed at a host of their choosing.
   * Code review recorded it as Major; the previous revision's own handler comment already
   * claimed "an unconfigured deployment therefore serves no feed at all", so the code was
   * also contradicting its published contract.
   *
   * QUOTE-THEN-REVISE, BECAUSE THE READING THIS REPLACES IS NOT SILLY AND MUST NOT BE
   * RE-ARGUED FROM SCRATCH. It said: "`FEED_ALLOWED_HOSTS` is optional, so the OVERWHELMING
   * majority of deployments never set it - and resolving that absence to an empty list made
   * `assertAllowedFeedHost` refuse EVERY request, which turns a capability the source
   * publishes into one that answers nothing until an operator discovers a variable the legacy
   * never had. The legacy controller declares `this.publicMethods="product"`
   * [integrationServices/google/controllers/feed.cfc:L54] with NO allow-list of any kind, and
   * takes its authority from `CGI.HTTP_HOST` - that is, from the request. Defaulting to
   * deny-all is not a hardening of that contract, it is a withdrawal of it."
   *
   * Every factual claim there is true. What does not follow is the conclusion, for one
   * reason the legacy could not have had: CFML read `CGI.HTTP_HOST` from a request arriving
   * at a web server bound to the hostnames the deployment actually owns, so the header was
   * constrained by the deployment before the application ever saw it. An API Gateway proxy
   * event carries whatever `Host` the client wrote. Reproducing "take it from the request"
   * on this platform is therefore NOT reproducing the legacy's provenance - it is dropping
   * a check the legacy got from its host environment for free. The honest port of "the
   * deployment decides which authorities it answers on" is a deployment-owned list.
   *
   * SO THERE ARE TWO STATES, AND BOTH FAIL CLOSED ON AN UNLISTED HOST:
   *
   *   * an EMPTY list - the variable is unset, or set to a value naming no host. The feed
   *     publishes nothing: `assertAllowedFeedHost` refuses every candidate, so
   *     `productFeedPort` and `feedCriteria` are never published and the route answers a
   *     refusal that NAMES the configuration to set. That is the fail-closed default, and
   *     it is why the refusal is explicit rather than silent - an operator learns what to
   *     configure instead of debugging an empty document.
   *   * a NON-EMPTY list - only those authorities are served. This is the S-15 remedy,
   *     unchanged: the list is process configuration, fixed for the container's lifetime and
   *     unreachable from any request, so a caller cannot write the list it is checked
   *     against.
   *
   * THE VARIABLE REMAINS OPTIONAL IN THE ENVIRONMENT CONTRACT, deliberately. A deployment
   * that does not serve the feed must not be forced to configure it, and every existing test
   * that supplies only the five database variables still boots - it simply gets a deployment
   * with no feed, which is the honest description of a deployment that configured none.
   */
  readonly allowedHosts: readonly string[];
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
 * Matches the template value of `LOG_LEVEL` in `slatwall-ts/.env.example`, and the
 * fallback `src/lib/logger.ts` applies when no threshold has been adopted. The two
 * must agree: a process that fails before the composition root adopts a threshold
 * still logs, and it logs at this level.
 */
const DEFAULT_LOG_THRESHOLD: LogThreshold = 'info';

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
 *  1. REQUIRED, WITH NO FALLBACK - AND THE HARD REFUSAL IS A DELIBERATE
 *     IMPROVEMENT ON THE LEGACY RATHER THAN A PORT OF IT. The distinction is
 *     easy to blur and this paragraph used to blur it, so it is stated exactly.
 *     The legacy `<cfabort />` at [config/configORM.cfm:L6] guards the DATASOURCE
 *     PROBE's `<cfcatch>` [config/configORM.cfm:L2-L8] and nothing else. The
 *     DIALECT chain that follows runs from [config/configORM.cfm:L9] to
 *     [config/configORM.cfm:L15] and ends at a bare closing tag with NO
 *     `<cfelse>`, so an unrecognized product name left `this.ormSettings.dialect`
 *     SILENTLY UNSET and execution CONTINUED. What is carried over is the ABSENCE
 *     OF A GUESS - no fourth branch, no default; what is deliberately better is
 *     that the unset state cannot be reached at all: an unset or unrecognized
 *     value is a hard startup error here, never a default, never a fallback,
 *     never a warn-and-continue. `src/handlers/bootstrap.ts` records the same
 *     distinction at its one dialect decision, and the two must not drift apart.
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
  const guidance = `Accepted values are ${accepted} (matched without regard to case, then normalized to that exact spelling). There is deliberately no default and no fallback: the legacy dialect chain at config/configORM.cfm:L9-L15 ends with no <cfelse>, so an unrecognized product name left the dialect unset and the request continued. Refusing the value outright here is a deliberate improvement on that silent state rather than a port of the abort at config/configORM.cfm:L4-L7, which guarded only the datasource probe.`;

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

// --- The delivery-size contract --------------------------------------------
//
// ★★★ THE ENVIRONMENT THIS MODULE READS HAS TO FIT IN THE ONE THAT DELIVERS IT, AND
// THAT IS A HARD PLATFORM LIMIT RATHER THAN A STYLE PREFERENCE. AWS Lambda caps the
// ENTIRE environment-variable map at 4 KB - 4096 bytes, keys and values together - and
// the quota is not adjustable: a function whose configuration exceeds it is REFUSED at
// `UpdateFunctionConfiguration`, before a cold start ever happens, so the deployment
// simply does not go out.
//
// Two of the nineteen contract variables had no upper bound of any kind: `DB_TLS_CA`
// accepts "one or more PEM blocks" and `ECB_REFERENCE_RATES` accepts an arbitrarily long
// rate list. An otherwise perfectly valid configuration could therefore be undeployable,
// and the first anyone would learn of it is a deployment failure naming a byte count.
//
// SO THE BUDGET IS PART OF THE CONTRACT, AND IT IS CHECKED WHERE THE VALUES ARE AUTHORED.
// Every variable carries a documented maximum, the maxima provably sum to less than the
// platform cap (see {@link MAX_DELIVERABLE_ENVIRONMENT_BYTES} and the arithmetic on
// {@link CONTRACT_KEY_MAX_VALUE_BYTES}), and a configuration that breaches either the
// per-variable maximum or the aggregate is refused at start-up. That refusal is
// deliberately most useful OUTSIDE Lambda - locally and in CI, where a value is written
// and where a failure can still be fixed cheaply - because inside Lambda the platform has
// already refused the deployment and this code never runs.
//
// ONLY THE NINETEEN CONTRACT KEYS ARE MEASURED, AND THAT IS A CORRECTNESS REQUIREMENT
// RATHER THAN AN ECONOMY. Two categories of variable must not be counted: the `AWS_*`
// variables the Lambda runtime injects itself, which are not part of the function's
// configured map and which a caller cannot shrink; and everything else in a developer's
// shell, which numbers in the hundreds and would make the budget unreachable on every
// local run. The list below is exactly the contract `slatwall-ts/.env.example` publishes.

/**
 * The platform ceiling on the whole environment map, in bytes: AWS Lambda's 4 KB quota.
 *
 * Not adjustable through Service Quotas, which is why the contract is written to fit
 * inside it rather than to request more.
 */
const MAX_DELIVERABLE_ENVIRONMENT_BYTES = 4_096;

/**
 * Bytes charged per delivered variable beyond its key and value, as a conservative
 * allowance.
 *
 * AWS does not publish the exact accounting of its 4 KB quota beyond "the total size of
 * all environment variables", so one byte per entry is reserved for whatever separator or
 * per-entry overhead the encoding carries. Over-reserving is the safe direction: the
 * consequence is a contract marginally tighter than the platform's, not a configuration
 * that passes here and is refused at deployment.
 */
const ENVIRONMENT_ENTRY_OVERHEAD_BYTES = 1;

/**
 * The documented maximum value size of every variable in the contract, in UTF-8 bytes.
 *
 * ★ THE ARITHMETIC, WRITTEN OUT, BECAUSE A BUDGET NOBODY CAN CHECK IS NOT A BUDGET. The
 * nineteen key names total 250 bytes and the per-entry allowance adds 19, so 269 bytes are
 * spoken for before any value. The eighteen values other than `DB_TLS_CA` total 1,733,
 * bringing the fixed part to 2,002. With `DB_TLS_CA` at 2,048 the documented ceiling is
 * 4,050 bytes against a platform cap of 4,096 - 46 bytes of headroom. The assertion that
 * this still holds lives in `tests/traceability/legacyTestMap.ts`, so adding a variable or
 * raising a maximum past the cap fails CI rather than a deployment.
 *
 * Each figure is the smallest that cannot refuse a legitimate value:
 *
 *   * `DB_HOST` - RFC 1035's 253-character host.
 *   * `DB_NAME` and `DB_USER` - MySQL's own identifier and account-name limits.
 *   * `DB_PASSWORD` - 128, far beyond any credential policy in practice; RDS caps a MySQL
 *     master password at 41.
 *   * the enumerations and the four pool integers - 16 to 24 each. Deliberately NOT their
 *     longest accepted spelling: this is a DELIVERY bound, and a bound tight enough to
 *     catch a typo would turn a size check into a second, worse shape check. Their real
 *     vocabularies are enforced by their own resolvers, which produce a message naming
 *     the accepted values; a byte count would say nothing useful about `NODE_ENV=prod`.
 *   * `FEED_ALLOWED_HOSTS` and `ECB_REFERENCE_RATES` - 512 each, which is roughly two
 *     maximal hosts or forty rate entries; the ECB publishes about thirty currencies.
 *   * `DB_TLS_CA` - 2,048, which holds ONE ordinary PEM certificate authority. A full
 *     multi-certificate chain does not fit, and that is the constrained case the
 *     contract answers by pointing at the alternatives rather than by raising the number:
 *     leave it unset and trust the runtime's public root store, or supply only the single
 *     authority that signs the server's certificate.
 *
 * ⚠ `LOG_LEVEL`'s FIGURE IS A BUDGET ALLOCATION AND NOT A REFUSAL THRESHOLD, which is the
 * one asymmetry in this table and is required by an invariant stated elsewhere in this
 * file: an unset or unrecognized `LOG_LEVEL` MUST NOT be able to abort a cold start,
 * because this module reports its own fatal failure through the logger. Its bytes still
 * count toward the aggregate - an undeployable set is undeployable whatever made it so -
 * but no per-variable refusal is raised for it. See {@link assertDeliverableEnvironment}.
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
 * `LOG_LEVEL` may not be able to abort a cold start - see {@link LoggingConfig} for why
 * that is structural rather than a preference - so a per-variable size refusal is not
 * available for it. Its bytes still count toward the aggregate, where the failure is
 * about whether the SET can be delivered rather than about the logging threshold.
 */
const UNREFUSABLE_CONTRACT_KEY = 'LOG_LEVEL';

/**
 * Measure a string in UTF-8 bytes, which is the unit the platform quota is expressed in.
 *
 * `TextEncoder` is a global in the `nodejs20.x` runtime and in every browser, so this
 * needs no import - which matters here more than usual, because this module imports
 * nothing at all by design. Counting CHARACTERS instead would under-measure any non-ASCII
 * value: an internationalized host or a non-ASCII credential costs two to four bytes per
 * character, and a budget measured in the wrong unit is a budget that can be exceeded
 * while passing.
 */
function measureUtf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Refuse a configuration that cannot be delivered, and say which variable is at fault.
 *
 * Two independent refusals, because a set can fail either way round: every variable is
 * held to its own documented maximum, AND the total is held to the platform cap. A
 * configuration whose variables are each individually legal can still exceed the cap
 * together, which is exactly the case a per-variable rule alone would miss.
 *
 * NO VALUE IS EVER ECHOED, only its measured size. Two of the variables measured here are
 * a credential and a private host name, and the actionable diagnosis is the number of
 * bytes rather than the bytes themselves.
 *
 * @param source the environment being resolved.
 * @param problems the aggregate problem list; one entry per over-size variable, plus one
 *   for the aggregate.
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
 * The whole `/8` rather than only `127.0.0.1`, because the entire block is loopback by
 * definition and a developer binding a second local server to `127.0.0.2` is doing
 * something ordinary. Each octet is bounded so `127.0.0.999` is not mistaken for an
 * address, and the pattern is anchored at both ends so nothing may precede or follow
 * it.
 */
const IPV4_LOOPBACK_HOST =
  /^127\.(?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])(?:\.(?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])){2}$/;

/**
 * The non-IPv4 spellings of a loopback host, matched after case-folding and after any
 * surrounding IPv6 brackets are removed.
 *
 * `::1` is the IPv6 loopback address and `0:0:0:0:0:0:0:1` is the same address written
 * out, both of which `mysql2` accepts; a deployment that spelled it either way meant
 * the same thing and should not be refused over notation.
 */
const NAMED_LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '::1', '0:0:0:0:0:0:0:1']);

/**
 * Whether `host` names the local machine over a loopback interface.
 *
 * ★ THIS IS A SYNTACTIC TEST, DELIBERATELY, AND IT RESOLVES NOTHING. This module has
 * no imports and must not acquire one - it has to be able to raise its own startup
 * failure before anything else has loaded - so there is no DNS lookup here and there
 * will not be one. A name that merely RESOLVES to a loopback address is therefore
 * refused, which is the conservative direction: the only cost is that an operator who
 * invented a private alias for their local server must spell it `127.0.0.1`, while the
 * benefit is that whether a deployment starts on plaintext transport cannot depend on
 * a resolver's answer at startup.
 *
 * ⚠ `localhost` IS ACCEPTED WITH A KNOWN CAVEAT, and the caveat is recorded rather
 * than quietly tolerated. A hosts file can point `localhost` at a non-loopback
 * address, so accepting the name is not the same guarantee that accepting a literal
 * is. It is accepted because it is the spelling every local development environment
 * and every container-compose file actually uses, and refusing it would mean the rule
 * was routinely worked around instead of followed. An operator able to rewrite the
 * machine's hosts file can already redirect the connection whatever this function
 * says.
 *
 * The brackets an IPv6 literal is conventionally written in are stripped before
 * matching, because `[::1]` and `::1` name the same interface and a deployment should
 * not be refused over notation.
 */
function isLoopbackHost(host: string): boolean {
  const bare = host.replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  return NAMED_LOOPBACK_HOSTS.has(bare) || IPV4_LOOPBACK_HOST.test(bare);
}

/**
 * Resolves `LOG_LEVEL`, and NEVER records a problem.
 *
 * ★ THE ONLY RESOLVER IN THIS FILE THAT CANNOT FAIL, AND IT TAKES NO `problems`
 * ARRAY SO THAT IT CANNOT ACQUIRE ONE BY ACCIDENT. The reasoning is on
 * {@link LoggingConfig}: this module reports its own aggregate failure through
 * `src/lib/logger.ts`, so a threshold able to abort a cold start would leave a
 * misconfigured process unable to explain itself. A mistyped value is therefore
 * coerced to the default and classified, not rejected.
 *
 * Case folding matches every other enumeration here, so `INFO`, `Warn` and
 * ` error ` are all accepted - `readTrimmed` removes surrounding whitespace and
 * reports a blank value as absent, which is how a shell that exports the variable
 * empty spells "use the default".
 *
 * THE REJECTED VALUE IS DISCARDED HERE AND TRAVELS NOWHERE. It is not returned, not
 * stored, not interpolated into a message and not retained in any set. That is the
 * structural half of the fix for the disclosure defect described on
 * {@link LogThresholdSource}: there is no code path from a malformed `LOG_LEVEL` to
 * an emitted line, because after this function returns the value no longer exists.
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
 * ★ EACH OCTET IS BOUNDED, WHICH IS THE DIFFERENCE BETWEEN AN ADDRESS AND A NAME. A shape test of
 * `\d{1,3}` four times over would classify `999.1.1.1` as an address, and the consequence is not
 * cosmetic: the `verify-identity` rule below refuses IP literals, so a mis-classified NAME would be
 * refused with a message naming the wrong problem, and the operator would be told to supply a DNS
 * name they had already supplied. `999.1.1.1` is not an address, so it is a name - one that will
 * fail to RESOLVE, which is the right place and the right layer for it to fail.
 *
 * Anchored at both ends so nothing may precede or follow the quad.
 */
const IPV4_LITERAL_SHAPE =
  /^(?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])(?:\.(?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])){3}$/;

/**
 * Whether a host string is an IP LITERAL rather than a name.
 *
 * A dotted quad, or anything carrying a colon - which in a host position can only be an IPv6 address,
 * bracketed or bare, since the port is a separate variable in this contract. Used by the
 * `verify-identity` rule (F47): a certificate binds to NAMES through its subject-alternative-name
 * extension, and an IP literal takes a different code path in the driver's identity check whose
 * behaviour cannot be asserted from here.
 */
function isIpLiteralHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();

  return IPV4_LITERAL_SHAPE.test(normalized) || normalized.includes(':');
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
 * TWO RULES READ `DB_HOST` AS WELL AS THE MODE, because a transport posture is a
 * property of the PAIR and neither variable can be judged alone. Both were added after a
 * security review found documentation asserting protections the code did not enforce, and
 * each is annotated at its own refusal below:
 *
 *   * `disabled` REQUIRES A LOOPBACK HOST, in every environment. The earlier rule keyed
 *     plaintext to `NODE_ENV` alone, and `NODE_ENV` is DEFAULTED - so a production
 *     container that simply never set it passed the check and sent its credential over a
 *     link it did not own (CWE-319). What makes plaintext acceptable is the traffic never
 *     leaving the machine, so that property is what is checked now. The production
 *     refusal is kept alongside it as defence in depth.
 *   * `verify-identity` REFUSES AN IP-LITERAL HOST. Server Name Indication cannot carry
 *     an address, so the driver sends no `servername` and the runtime silently performs
 *     no host-name check while the connection still reports itself fully verified
 *     (CWE-295). `verify-ca` exists to state that weaker position honestly, and is what
 *     such a deployment must choose.
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
    // Echoed because a transport mode is an enumeration rather than a credential,
    // and an operator who mistyped it needs to see the typo. The echo is clipped
    // by `describeReceived` like every other non-credential one.
    problems.push(
      `DB_TLS_MODE is not a recognized transport mode; received ${describeReceived(rawMode)}. ${guidance}`,
    );
    return undefined;
  }

  // ★★★ CLEARTEXT IS BOUND TO THE DESTINATION, NOT TO A LABEL (F48, CWE-319). QUOTE-THEN-REVISE: the
  // rule here was `mode === 'disabled' && environment === 'production'`, with the message "DB_TLS_MODE
  // is disabled while NODE_ENV is production, which would send the account, the credential and every
  // statement over an unprotected connection." The diagnosis was exactly right and the CONDITION was
  // the wrong one. `NODE_ENV` is OPTIONAL and defaults to `development`
  // (`DEFAULT_RUNTIME_ENVIRONMENT`), so the single most likely deployment - one that never set it -
  // could send the account, the credential and every row to a REMOTE database in cleartext, and the
  // guard would not fire. A deployment label is a claim about intent; the host is a fact about where
  // the bytes go.
  //
  // So the test is now on the DESTINATION and applies in every environment: `disabled` is admitted
  // only when `DB_HOST` provably names the loopback interface, where there is no network segment for
  // an on-path actor to occupy. `NODE_ENV` is no longer consulted for this decision at all - which
  // also means `production` can no longer be the thing that saves a misconfigured deployment, and
  // `development` can no longer be the thing that excuses one.
  //
  // ★ AND THE PRODUCTION REFUSAL IS KEPT AS A SECOND, INDEPENDENT GUARD rather than replaced by the
  // one above. F48 asks that the loopback rule apply "regardless of NODE_ENV"; it does not ask that
  // production stop being refused, and holding both is strictly stronger than holding either. They
  // fail for different reasons and the messages say so: the guard above refuses a REMOTE cleartext
  // destination in any environment, and this one refuses cleartext in a deployment that declares
  // itself production even when the destination is local - because a production service talking to a
  // loopback database is a misconfiguration whether or not the transport is exposed.
  if (mode === 'disabled' && environment === 'production') {
    problems.push(
      'DB_TLS_MODE is disabled while NODE_ENV is production, which would send the account, the credential and every statement over an unprotected connection. Set verify-identity, or verify-ca with a pinned trust anchor in DB_TLS_CA when the host name cannot be checked.',
    );
    return undefined;
  }

  // ★ TWO INDEPENDENTLY-AUTHORED COPIES OF THE CLEARTEXT RULE WERE FOLDED INTO ONE, and this is the
  // survivor. Both refused the same destinations for the same reason (F48, CWE-319); this one is kept
  // because it satisfies two properties the other did not. It does NOT echo `DB_HOST` back - the
  // aggregate refusal states that no value of `DB_HOST`, `DB_USER` or `DB_PASSWORD` is echoed, and a
  // diagnostic that quoted the host would have been the one place this module published it. And it
  // STAYS QUIET WHEN `DB_HOST` IS ABSENT: `resolveRequired` has already recorded that omission, so
  // adding a transport complaint on top would point an operator at the wrong variable.
  //
  // ★★ THE PLAINTEXT RULE THAT DOES NOT DEPEND ON NODE_ENV, and the reason the check
  // above is not sufficient on its own. `NODE_ENV` is a DEFAULTED variable: omit it and
  // it resolves to `development`, so a production container that simply never set it
  // would pass the production test and go on to send its credential over a link it does
  // not own. A security review recorded that gap (CWE-319) together with the
  // documentation that claimed the opposite. The control is therefore the PROPERTY that
  // makes plaintext acceptable - the traffic never leaving the machine - rather than a
  // label a deployment can forget to apply. The production refusal above is retained as
  // defence in depth: it names the more obvious mistake more clearly, and a deployment
  // that trips both should be told about both.
  if (mode === 'disabled' && host !== undefined && !isLoopbackHost(host)) {
    problems.push(
      'DB_TLS_MODE is disabled while DB_HOST is not a loopback address, which would send the account, the credential and every statement in clear text over a network link this process does not control. Plaintext is accepted only for a server reached through the local interface - 127.0.0.0/8, ::1, 0:0:0:0:0:0:0:1 or the name localhost - and NODE_ENV is not consulted for this decision, so the rule holds in every environment: NODE_ENV is defaulted, a deployment label cannot make a remote connection local, and an unset variable must not be what stands between a credential and the wire. The rejected host is deliberately NOT quoted here, because this module states that no value of DB_HOST, DB_USER or DB_PASSWORD is echoed in a refusal; the variable, the rule and the accepted spellings are named instead. Set verify-identity for a named host, or verify-ca when the host is an IP literal or fronted by a proxy whose certificate names a different host, and supply the trust anchor through DB_TLS_CA if the authority is not a public root.',
    );
    return undefined;
  }

  // ★★ IDENTITY VERIFICATION AGAINST AN ADDRESS IS NOT IDENTITY VERIFICATION. See
  // {@link isIpLiteralHost}: the driver cannot send Server Name Indication for an IP
  // literal, so the runtime has no name to check the certificate's subject against and
  // the handshake verifies the chain while silently skipping the identity test. Accepting
  // the combination would leave a deployment believing it had the stronger mode while
  // running the weaker one - the failure direction this whole group exists to close - so
  // it is refused and the honest alternative is named.
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
    // Documented in `slatwall-ts/.env.example` as ignored rather than rejected:
    // there is no handshake for a trust anchor to participate in, and refusing a
    // leftover value would turn switching a development machine to `disabled` into
    // a two-variable edit for no security benefit. `minimumVersion` is carried
    // anyway so the resolved shape has no conditional members.
    return Object.freeze({ mode, certificateAuthority: undefined, minimumVersion });
  }

  if (rawCertificateAuthority === undefined) {
    // ★★★ verify-ca WITHOUT A PINNED ANCHOR VERIFIES ALMOST NOTHING (F47, CWE-295).
    // QUOTE-THEN-REVISE: this branch returned unconditionally, annotated "Not a problem. An unset
    // anchor means the runtime's built-in public root store is trusted, which is correct for a
    // managed database whose certificate is signed by a public authority, and verification remains on
    // either way." That is true of `verify-identity`, where the host name is what binds the
    // certificate to the intended server. It is FALSE of `verify-ca`, which is defined by omitting
    // that check: with identity verification off and the entire public root store trusted, ANY
    // certificate signed by ANY public authority satisfies the handshake, so an on-path actor holding
    // a certificate for a domain it does control impersonates the database. The trust anchor is the
    // only thing left binding the connection to the intended server, so it cannot be optional.
    if (mode === 'verify-ca') {
      problems.push(
        "DB_TLS_MODE is verify-ca but DB_TLS_CA is not set. verify-ca omits the host-name check, so the trust anchor is the ONLY thing binding the connection to the intended server; trusting the runtime's public root store instead would accept any certificate signed by any public authority. Supply the provider's or your private authority's PEM text in DB_TLS_CA, or use verify-identity with the database's DNS name, where the host name performs that binding.",
      );
      return undefined;
    }

    // Reached only by `verify-identity`, where it is correct: the host-name check binds the
    // certificate to the intended server, so the built-in public root store is a sound anchor for a
    // managed database whose certificate a public authority signed.
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
 * The one accepted shape of a bare host authority in this subtree: a host, optionally
 * followed by `:` and a port.
 *
 * ★★★ THIS PATTERN IS THE SINGLE SOURCE OF TRUTH AND IS SHARED, NOT COPIED.
 * `src/integrations/google/rssFeedRenderer.ts` validates the SAME value at the point
 * where it is concatenated into five URL sites, and it now reaches that decision through
 * {@link parseHostAuthority} below rather than through a pattern of its own.
 *
 * ⚠ IT USED TO BE COPIED, AND THE TWO COPIES DID NOT AGREE - which is why this is now
 * one function. The docblock here claimed "the two patterns are deliberately identical
 * so a value cannot pass one and fail the other". They were not identical. This one was
 * lowercase-only, admitted no underscore and had no bracketed-IPv6 alternative, while
 * the renderer's admitted all three; so `SHOP.example.com`, `internal_host` and `[::1]`
 * were rejected as deployment configuration and accepted at the point of use. The claim
 * was not merely stale - the ordering it relied on ("the mint wins by construction: it
 * runs last") had also been retired, because the mint was removed in an earlier revision
 * and membership is now checked in the composition root.
 *
 * THE UNION OF THE TWO IS ADOPTED, WHICH IS THE PERMISSIVE ONE, AND THAT IS THE SAFE
 * DIRECTION. The renderer's grammar is the security boundary: it decides what may be
 * written into a published feed. Configuration only decides which of those a deployment
 * has authorized. A configuration grammar STRICTER than the boundary's cannot make
 * anything safer - the boundary still refuses what it refuses - and it can refuse a
 * legitimate deployment, which is exactly what happened. A configuration grammar LOOSER
 * than the boundary's would be the dangerous asymmetry, and sharing one function makes
 * both impossible.
 *
 * The grammar, and what each alternative is for:
 *
 *   bracketed literal   `[...]` holding only hex digits, colons and dots, so an IPv6
 *                       deployment is not refused. Brackets are required, as RFC 3986
 *                       requires them, which is also what keeps the colon-rich form from
 *                       being confused with a host-and-port.
 *   registered name     one or more dot-separated LABELS, each STARTING and ENDING
 *                       alphanumeric with hyphens and underscores permitted between.
 *                       Composed per label rather than over the whole name, which is
 *                       what refuses a leading dot, a trailing dot, a leading or
 *                       trailing hyphen and an EMPTY LABEL (`a..b`) without a rule for
 *                       each. The underscore is not RFC 1123 for a public name but is
 *                       common in internal DNS, and it cannot change which authority a
 *                       URL resolves to.
 *   optional port       captured, and then RANGE-CHECKED by the function below rather
 *                       than by this pattern - see {@link parseHostAuthority}.
 *
 * It refuses a scheme, a path, credentials, a query, a fragment, whitespace anywhere,
 * control characters including CR and LF, and emptiness. Each of those would change
 * which authority a published URL points at.
 */
/**
 * What {@link resolveFeedAllowedHosts} answers when it did not record a problem.
 *
 * A ONE-MEMBER WRAPPER, AND THE WRAPPER IS STILL THE POINT even though the member no longer
 * admits `undefined`. Every resolver in this file uses a bare `undefined` return to mean "I
 * recorded a problem, do not build a configuration". The wrapper keeps that ONE meaning for
 * `undefined` at this resolver too: an absent wrapper is a failure, and a present wrapper
 * always carries a list - empty when no host is authorized.
 *
 * ★ IT USED TO CARRY `readonly string[] | undefined`, so that "the variable is not set"
 * could be a SUCCESS with an absent value distinct from a recorded problem. That third state
 * is gone with the allow-all behaviour it existed to express - see
 * {@link FeedConfig.allowedHosts} - so the member is total and only the failure/success
 * distinction remains.
 *
 * Not exported. `FeedConfig.allowedHosts` is the shape every consumer reads; this type
 * exists only to keep the failure absence apart from the resolved value.
 */
interface ResolvedFeedAllowedHosts {
  readonly allowedHosts: readonly string[];
}

/**
 * The authorized-host list of a deployment that authorized none.
 *
 * Frozen once at module scope rather than built per call, so every unconfigured deployment
 * shares one immutable value and no consumer can extend the list it is checked against.
 */
const EMPTY_FEED_ALLOWED_HOSTS: readonly string[] = Object.freeze([]);

const HOST_AUTHORITY_SHAPE =
  /^(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9_-]*[A-Za-z0-9])?)*)(?::(\d{1,5}))?$/;

/**
 * A port with no leading zero, so a single spelling means a single value.
 *
 * `065535` and `65535` denote the same port to a resolver and are different strings to
 * every comparison this subtree makes, so an allow-list entry written one way would not
 * match a request written the other. Refusing the padded form removes the ambiguity
 * rather than normalizing it away, because normalizing would silently change a value a
 * deployment wrote deliberately. It also refuses `0` and `00000`, which the range check
 * below would refuse anyway - two reasons, one refusal.
 */
const UNPADDED_PORT_SHAPE = /^[1-9]\d{0,4}$/;

/** The highest port number a TCP authority can name. */
const MAX_HOST_AUTHORITY_PORT = 65_535;

/**
 * The longest accepted host authority: RFC 1035's 253-character host plus `:65535`.
 *
 * Enforced here as well as at the rendering boundary, which it previously was not:
 * configuration applied no length bound at all, so a multi-kilobyte entry was accepted
 * as deployment configuration and then refused at the point of use.
 */
const MAX_HOST_AUTHORITY_LENGTH = 259;

/**
 * A parsed bare host authority.
 *
 * `host` retains the brackets of an IPv6 literal, because they are part of the authority
 * as it must be written into a URL; `port` is absent when none was supplied, which is
 * distinct from a port that was supplied and rejected - that case yields no
 * {@link HostAuthority} at all.
 */
export interface HostAuthority {
  /** The host half, exactly as written, brackets retained for an IPv6 literal. */
  readonly host: string;
  /** The port half as a number, or `undefined` when none was written. */
  readonly port: number | undefined;
}

/**
 * Parse a bare host authority - a host with an optional port - or answer `undefined`.
 *
 * ★★ THE SECOND EXPORTED UNIT OF THIS MODULE, AND THE ONLY ONE, RECORDED AS A DELIBERATE
 * EXCEPTION RATHER THAN AN OVERSIGHT. The standard this port holds itself to is one
 * exported unit per file, and that standard exists to keep a regenerated file's diff
 * small in the refine loop. It is set aside here for a reason that outweighs it: a
 * SECURITY GRAMMAR MUST NOT EXIST TWICE. The only two candidates for owning it are this
 * module, which validates the deployment's allow-list, and
 * `src/integrations/google/rssFeedRenderer.ts`, which validates the value it writes into
 * a published document - and this module CANNOT IMPORT, by a documented invariant with
 * its own justification (see the note above `appConfig`: it must be able to raise its own
 * startup failure before anything else has loaded, and its failure message must be
 * provably credential-free). If the shared code cannot be imported INTO here, it has to
 * be exported FROM here. The alternatives were a duplicated pattern - which is the defect
 * being fixed - or moving the check out of start-up validation, which would trade
 * fail-fast on a deployment typo for a refusal of every feed request at run time.
 *
 * WHAT THE PORT CHECK ADDS OVER THE PATTERN, and why it is a function rather than more
 * regex. `(?::(\d{1,5}))?` accepts one to five digits, which is `0` through `99999`: it
 * admits port 0, which names no port, and 65536 through 99999, which name nothing at all.
 * A regex CAN express the range, at the cost of a nine-alternative construction nobody
 * can read or verify; a comparison against {@link MAX_HOST_AUTHORITY_PORT} is
 * self-evidently right. The leading-zero refusal stays a pattern because that IS a
 * lexical property.
 *
 * @param candidate the value to parse, taken exactly as supplied. Nothing is trimmed,
 *   lower-cased or otherwise rewritten here: a caller that wants normalization does it
 *   before calling, so this function's answer describes the value the caller actually
 *   holds.
 * @returns the parsed authority, or `undefined` when the value is not a bare host
 *   authority, is longer than {@link MAX_HOST_AUTHORITY_LENGTH}, or names a port outside
 *   1 to {@link MAX_HOST_AUTHORITY_PORT} or written with a leading zero.
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
 * ★★★ UNSET YIELDS AN EMPTY LIST, WHICH SERVES NO FEED - THE FAIL-CLOSED DEFAULT (CWE-346).
 * This resolver has been written both ways and the whole record is on {@link FeedConfig},
 * because the question is a security one and re-deciding it from a one-line comment is
 * exactly what should not happen. The short form: an earlier revision mapped unset to an
 * empty list and refused everything; a second mapped it to `undefined`, which the
 * composition root read as ALLOW ANY REQUEST `Host`, putting a caller-authored authority
 * into a merchant feed's URLs by default; this one maps unset and blank alike to an empty
 * list, so a deployment that configured no feed serves none and a deployment that
 * configured one serves exactly the authorities it named.
 *
 * BLANK AND UNSET ARE THEREFORE THE SAME ANSWER, AND THAT IS DELIBERATE - it is the one
 * place this file does not draw the absent-versus-empty distinction, because both states
 * mean the same thing about deployment intent: no authority has been authorized. The RAW
 * source is still read rather than `readTrimmed`, so a whitespace-only value is parsed as a
 * list that names nothing rather than being folded into a different code path; the outcome
 * is identical either way and the parse stays honest about what it received.
 *
 * Each member is trimmed and lower-cased before validation, because DNS names are
 * case-insensitive and the membership check in `src/handlers/bootstrap.ts` compares
 * lower-cased; duplicates that differ only in casing or surrounding space therefore
 * collapse to one entry. Nothing else is rewritten - no punycode conversion, no
 * default-port stripping, no trailing-dot removal - because each would make the
 * configured host differ from the request host it is matched against.
 *
 * The shape itself is decided by {@link parseHostAuthority}, which is the SAME function
 * `src/integrations/google/rssFeedRenderer.ts` reaches at the point of use, so a value
 * this accepts cannot be refused there and a value it refuses cannot be authorized here.
 *
 * A malformed member is a recorded problem rather than a silently dropped entry: a
 * deployment that meant to allow `shop.example.com` and wrote `https://shop.example.com`
 * must be told, not quietly left refusing every request.
 */
function resolveFeedAllowedHosts(
  source: EnvironmentSource,
  problems: string[],
): ResolvedFeedAllowedHosts | undefined {
  const raw = source['FEED_ALLOWED_HOSTS'];

  if (raw === undefined) {
    // Fail closed. An UNSET policy authorizes no authority, so the feed publishes nothing
    // until an operator names the host(s) this deployment answers on - see
    // {@link FeedConfig.allowedHosts} for why "take it from the request `Host`" is not a
    // faithful port of `CGI.HTTP_HOST` on this platform.
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

// THERE IS NO `FEED_URL_SCHEME` RESOLVER, DELIBERATELY. An earlier revision read a
// `FEED_URL_SCHEME` variable here, defaulted it to `https`, and pushed a startup
// problem when a production deployment asked for `http`. The scheme is not a
// deployment choice: the legacy view hardcodes `http://` at all five URL sites
// [integrationServices/google/views/feed/product.cfm:L14, L15, L22, L23, L24], and AAP
// 0.1.1 and 0.8.1 freeze the product-feed integration contract. See {@link FeedConfig}
// for the full reversal record. The host allow-list resolver above stays, because the
// host genuinely was a runtime value in the legacy and only its ALLOW-LIST moved here.

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

// ★ TWO INDEPENDENTLY-AUTHORED ISO-INSTANT VALIDATORS WERE FOLDED INTO ONE, AND THE SURVIVOR KEEPS
// BOTH OF THEIR STAGES. A standalone shape pattern paired with a written-out Gregorian leap rule
// stood here, next to `resolveIsoInstant` below; both existed because the same measurement was made
// twice - `new Date('2026-02-31T00:00:00Z')` does NOT return an Invalid Date on this runtime, it
// rolls forward to 3 March, so a `NaN` check alone admits a date that does not exist.
//
// What was withdrawn is the DUPLICATION, not either check. `resolveIsoInstant` still refuses on the
// GRAMMAR first and on the CALENDAR second, and it still reports them as two different problems,
// because they are two different operator mistakes: a value in the wrong FORM, and a value in the
// right form naming a day that never happened. The leap rule itself is gone - a `Date.UTC` round
// trip decides the same question without a hand-written February length to keep correct.

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
 *   3. AGE. `ECB_RATES_RETRIEVED_AT` is REQUIRED whenever any rate is supplied, and its
 *      ISO-8601 shape is ENFORCED by grammar before it is parsed - see
 *      {@link ISO_8601_INSTANT_SHAPE}, and note that a bare `NaN` check would admit
 *      every locale spelling a date parser guesses at. Rates of unknown age cannot be
 *      assessed, and the legacy always knew the age of its own table - it wrote
 *      `retrieved` into the memo at [L124].
 *
 * Rates are NOT parsed to numbers here, and must not be: they are carried as strings
 * straight through to `Money`/`Decimal`, which is the target's single arithmetic
 * surface. Validating the string and keeping the string is what makes that possible.
 *
 * Unset yields an empty table and an undefined retrieval instant, which is the
 * documented no-conversion-configured state.
 */
/**
 * A complete ISO-8601 instant in extended format, WITH A MANDATORY ZONE DESIGNATOR.
 *
 * Groups, in order: year, month, day, hour, minute, optional second, optional
 * fractional second, and the zone - `Z` or `±HH:MM`. Every field is range-bounded here
 * rather than left to the parser, so `13:70` and month `13` never reach it.
 *
 * ★★ THE ZONE IS REQUIRED, AND THAT IS THE WHOLE REASON THIS PATTERN EXISTS. `new
 * Date()` accepts far more than ISO-8601 and silently assigns a meaning to what it
 * accepts: `2026-08-04` becomes UTC midnight, `Aug 4 2026` parses at all, and - the
 * dangerous one - `2026-08-04T00:00:00` with no zone is interpreted in the HOST'S LOCAL
 * TIME, so the same environment value denotes a different instant on two machines. This
 * port's explicit UTC policy cannot survive that, and a rate table's age is exactly the
 * quantity a silent whole-day or whole-hour shift corrupts.
 *
 * `T` and `Z` are matched case-insensitively because V8 accepts either and refusing a
 * lowercase designator would reject a value that is unambiguous. Nothing else is
 * relaxed.
 */
const ISO_INSTANT_SHAPE =
  /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[Tt]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,9}))?)?([Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

/**
 * How far ahead of this host's clock a retrieval instant may sit before it is refused.
 *
 * ★ THIS IS A CLOCK-SKEW ALLOWANCE, NOT A TOLERANCE FOR FUTURE-DATED DATA, and it is
 * deliberately small. The instant is captured on whichever machine fetched the rates and
 * evaluated on a Lambda host, so two unsynchronized clocks can legitimately disagree by
 * seconds to a couple of minutes; refusing a deployment over that would be a false
 * alarm. Anything beyond it is not skew - it is a wrong value, a wrong timezone
 * assumption, or a placeholder someone typed - and it matters because a future instant
 * yields a NEGATIVE age, which every "is this stale?" comparison reads as fresh.
 */
const MAX_RETRIEVAL_CLOCK_SKEW_MS = 5 * 60 * 1_000;

/** Field widths used when validating that a matched date is a real calendar date. */
const ISO_FRACTION_DIGITS = 3;

/**
 * Resolves a strict ISO-8601 instant, or records why it cannot be trusted.
 *
 * Three refusals, each answering a way the previous `new Date(raw)` accepted something
 * it should not have:
 *
 *   1. SHAPE. See {@link ISO_INSTANT_SHAPE} - a zone designator is mandatory, so no
 *      value's meaning depends on the host's timezone.
 *   2. CALENDAR. A shape-valid date can still be impossible, and `Date` rolls it over
 *      silently: `2026-02-30T00:00:00Z` becomes 2 March. The written fields are
 *      round-tripped through `Date.UTC` and compared, which rejects 30 February, 31
 *      April and 29 February in a common year. The comparison is done on the fields AS
 *      WRITTEN, independently of the offset, because a calendar date is either real or
 *      not regardless of which zone it was written in.
 *   3. THE FUTURE. Rates cannot have been retrieved after now. A future instant produces
 *      a negative age, and every staleness comparison downstream treats a negative age as
 *      fresh - so the one value whose purpose is to make a stale table visible would
 *      instead guarantee it looked current. {@link MAX_RETRIEVAL_CLOCK_SKEW_MS} allows for
 *      unsynchronized clocks and nothing more.
 *
 * ★ THIS IS THE ONE CLOCK READ IN THIS MODULE, and it is confined to this refusal.
 * Nothing else here depends on the current time, no resolved value is derived from it,
 * and it is read through `Date.now()` rather than held, so nothing is memoized against
 * it.
 *
 * NORMALIZATION IS A NO-OP BY CONSTRUCTION, WHICH IS WHY THERE IS NO CONVERSION STEP.
 * Once a zone designator is present the value denotes an absolute instant, and a `Date`
 * IS an absolute instant - milliseconds since the epoch, with no zone of its own. An
 * offset-carrying input and its `Z` equivalent therefore resolve to the SAME `Date`, and
 * `toISOString()` renders either in UTC. The zone requirement above is what makes that
 * true; converting afterwards would be converting something that has no zone to convert.
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

  // Every group below is guaranteed by a successful match, but the type is
  // `string | undefined` under the compiler's index rules. The two optional groups get
  // real defaults; the four mandatory ones fall back to a value that cannot pass the
  // calendar check, so a future edit to the pattern fails loudly instead of silently
  // resolving midnight on 1 January of year zero.
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
    // Unreachable through the pattern above, which is stricter than the parser. Kept as
    // an explicit invariant so that a relaxation of the pattern cannot produce an
    // `Invalid Date` that every downstream comparison then answers `false` to.
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
   * ★ ALL FIVE FIELDS ARE REDACTED, AND THE LAST TWO JOINED THE OTHER THREE
   * BECAUSE THE ARGUMENT FOR KEEPING THEM VISIBLE HAD EXPIRED. Redacting only the
   * credential first left this projection contradicting three checkable statements
   * elsewhere - the "never echoed in diagnostics" note on `host` and `user` above,
   * the logger's independent never-log key set, and the host omission in
   * `src/repositories/mysql/connection.ts` - so the host and the account were
   * redacted too. The schema name and the port were then kept visible on a stated
   * ground:
   *
   *   "neither appears in the logger's never-log key set; and `connection.ts` logs
   *    both DELIBERATELY, in the very line that omits the host."
   *
   * ⚠ THAT SECOND CLAUSE IS NO LONGER TRUE, AND IT WAS THE LOAD-BEARING HALF.
   * `connection.ts` removed the port, the database name, the dialect and the
   * connection limit from its pool-created line, and its own comment now names the
   * removal as a disclosure defect rather than a diagnostic - in its words, "a
   * database name and a port together are reconnaissance; a pool ceiling is capacity
   * intelligence". So the file cited here as the authority for publishing them now
   * classifies publishing them as the defect. Keeping them visible would leave this
   * method as the last publisher of exactly what that file went out of its way to
   * stop publishing.
   *
   * THE DIAGNOSTIC ARGUMENT DOES NOT SURVIVE THE MOVE EITHER. "Connected to the
   * wrong schema" is diagnosed from the environment the operator set, which is where
   * the value came from; nothing is learned by having the service read it back out to
   * a log stream whose audience is far wider than that operator. What this projection
   * is genuinely for is proving that a configuration object CAN be serialized safely,
   * and a shape of five markers proves that better than a shape of three.
   *
   * They are REDACTED rather than OMITTED, matching the credential's existing
   * treatment, because a marker proves a deliberate decision was made where a missing
   * key is indistinguishable from a field nobody remembered to add.
   * `appConfig.load`'s documented guarantee - redacted, not merely omitted - stays
   * true of all five, and the return type narrows to `string` accordingly: there is no
   * longer a numeric member for it to admit.
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

  // FIRST, AND OVER THE WHOLE SET AT ONCE. A configuration that cannot be delivered is
  // not worth resolving in detail, but it is reported ALONGSIDE every other problem
  // rather than instead of them - one restart should surface every mistake, which is
  // this module's contract everywhere else too. Nothing below depends on the outcome.
  assertDeliverableEnvironment(source, problems);

  const environment = resolveRuntimeEnvironment(source, problems);
  const host = resolveRequired(source, 'DB_HOST', problems);
  const user = resolveRequired(source, 'DB_USER', problems);
  const password = resolveCredential(source, 'DB_PASSWORD', problems);
  const dialect = resolveDatabaseDialect(source, problems);

  const port = resolveInteger(source, 'DB_PORT', DEFAULT_DATABASE_PORT, 1, MAX_TCP_PORT, problems);
  const database = readTrimmed(source, 'DB_NAME') ?? DEFAULT_DATABASE_NAME;

  // Resolved AFTER the environment AND after the host, because two of its rules read
  // already-validated values rather than re-reading the environment: the protocol floor still
  // reports against `environment`, and the transport rules (F47/F48) turn on the resolved `host` -
  // cleartext is admitted only for a provable loopback destination, and `verify-identity` requires a
  // named one. `host` may be `undefined` when DB_HOST itself failed; the resolver handles that
  // explicitly rather than treating an unresolved host as safe.
  const tls = resolveDatabaseTls(source, environment, host, problems);

  // Optional IN THE ENVIRONMENT, FAIL-CLOSED IN EFFECT. Unset and empty both resolve to an
  // EMPTY allow-list, which authorizes NO host: `assertAllowedFeedHost` then refuses every
  // candidate, `productFeedPort` and `feedCriteria` are never published, and the feed route
  // answers a refusal naming the variable to set. A present value naming hosts is the only
  // state that serves a feed, and only for those authorities.
  //
  // ★★★ QUOTE-THEN-REVISE, AND THIS ONE IS A SECURITY FINDING (SEC-H, INFO, CWE-1059). This
  // comment used to read: "Optional. UNSET means no host policy, which serves the feed on the
  // request's own authority exactly as the source did; a PRESENT value is a policy, empty or
  // not (F40)." That described the behaviour BEFORE finding F40's own remedy landed, and by
  // the time it was read the implementation had been the opposite for a revision: the resolver
  // below returns `EMPTY_FEED_ALLOWED_HOSTS` for an unset variable and {@link FeedConfig} states
  // there is NO allow-all state at all. No bypass ever followed from the prose - a comment
  // authorizes nothing - but a reader trusting it could "restore" the request-authority default
  // it described and reopen CWE-346, so the sentence is corrected rather than left as a trap.
  // The IMPLEMENTATION IS UNCHANGED by this correction, deliberately: it is already the
  // fail-closed one the finding asks the comment to describe.
  //
  // The resolver answers a WRAPPER so the "unset" state stays distinguishable from the
  // `undefined` that every resolver in this file uses to mean "problem recorded": the
  // wrapper is absent on failure and present with an EMPTY list when the variable is simply
  // not set. See {@link FeedConfig} for why the list lives here at all rather than arriving on
  // the request that is being checked against it.
  const feedAllowedHosts = resolveFeedAllowedHosts(source, problems);

  // Optional, and empty when unset. See {@link CurrencyConfig} for why a rate table
  // is configuration at all, and `src/handlers/bootstrap.ts` for what an empty one
  // means at conversion time.
  const currency = resolveCurrencyRates(source, problems);

  // Deliberately passed no `problems` array: the threshold cannot fail the process,
  // for the reason stated on {@link LoggingConfig}. It is resolved here anyway - and
  // not by `src/lib/logger.ts` reading the environment itself - so that this module
  // is genuinely the only reader of `process.env` under `src/**`.
  const logging = resolveLogging(source);

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
    feed: Object.freeze({ allowedHosts: feedAllowedHosts.allowedHosts }),
    currency,
    logging,
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
 *     path cannot be made contingent on logging having initialized. The
 *     dependency does not run the other way either: this module RESOLVES the
 *     logger's threshold (`resolveLogging`) but does not hand it over, because
 *     that would be an import. `src/handlers/bootstrap.ts` is the one place that
 *     holds both, and it performs the handover - which is also the one place a
 *     divergence between the duplicated level unions would be caught.
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
 *     this module must make impossible. The surface is the seventeen variables
 *     this module owns, in six shapes, so nothing is lost by writing it out: five
 *     strings (`DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_TLS_CA`), five
 *     integers (`DB_PORT`, `DB_CONNECTION_LIMIT`, `DB_CONNECT_TIMEOUT_MS`,
 *     `DB_IDLE_TIMEOUT_MS`, `DB_MAX_IDLE`), four closed enumerations
 *     (`DB_DIALECT`, `NODE_ENV`, `DB_TLS_MODE`, `DB_TLS_MIN_VERSION`), one
 *     comma-separated host list (`FEED_ALLOWED_HOSTS`), one comma-separated
 *     `CODE=RATE` table (`ECB_REFERENCE_RATES`) and one ISO-8601 instant
 *     (`ECB_RATES_RETRIEVED_AT`). The last three were missing from an earlier
 *     revision of this sentence, which counted fourteen while the module read
 *     seventeen. There is no boolean in the surface: the transport setting that
 *     used to be one is now `DB_TLS_MODE`, a required enumeration, because a
 *     boolean could not express the difference between chain verification and
 *     identity verification.
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
