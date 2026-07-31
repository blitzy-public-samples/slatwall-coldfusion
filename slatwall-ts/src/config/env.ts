/**
 * Typed, eagerly validated environment reading for the extracted Catalog service.
 *
 * The legacy application held no connection details in source: config/configApplication.cfm:L2
 * names the `Slatwall` datasource and the application server resolves it out of band, while
 * org/Hibachi/Hibachi.cfc:L10-L13 supplies the framework defaults it overrides, including an empty
 * username and an empty password. Application.cfc:L78-L87 publishes the four resulting values, and
 * config/configORM.cfm:L4-L7 aborts when no datasource resolves — the fail-fast behaviour
 * reproduced here by validating every value once, at module load.
 *
 * Sole-reader invariant: this is the only file under src/** permitted to read the process
 * environment. Configuration flows one way (AAP §0.4.3.5) — this module reads it,
 * src/config/database.ts builds the pool, src/config/container.ts wires the graph, and every layer
 * below receives what it needs by constructor injection. Each read is written as a plain dotted
 * `process.env` access so the whole key set is enumerable in one pass.
 *
 * The exported value is frozen and built once: mismatch M7 (AAP §0.6.6) records that only
 * module-scope state survives between Lambda invocations, so a mutable cache here could bleed
 * across callers while a frozen constant cannot. That is why no reload, override or reset entry
 * point exists. Pool lifecycle belongs to src/config/database.ts and commit timing to
 * src/adapters/mysql/UnitOfWork.ts.
 */

import { DomainError } from '../errors/DomainError';

/* ==============================================================================================
 * DECISION A — the three-way runtime dialect probe is deliberately collapsed to a fixed MySQL
 * target (AAP §0.8.2 Guideline 6; the collapse is mandated by AAP §0.4.1.3, which specifies that
 * "the runtime `cfdbinfo` dialect probe [config/configORM.cfm:L8-L14] becomes a fixed MySQL
 * target with the branch documented").
 *
 * What the legacy code did, in four facts:
 *   1. It probed the database product AT RUNTIME. config/configORM.cfm:L3 issues
 *      `<cfdbinfo datasource="..." type="Version" name="dbVersion">` on every application start,
 *      then branches on `dbVersion.DATABASE_PRODUCTNAME`.
 *   2. It could select three ORM dialects: "MySQL" at config/configORM.cfm:L10,
 *      "MicrosoftSQLServer" at config/configORM.cfm:L12 and "Oracle10g" at
 *      config/configORM.cfm:L14.
 *   3. There is NO `<cfelse>`. The conditional closes at config/configORM.cfm:L15 with no
 *      fallback, so an unrecognised database product left `this.ormSettings.dialect` entirely
 *      unset and the application continued regardless. The fixed target chosen here is therefore
 *      NARROWER AND MORE HONEST than the legacy behaviour, not a feature added on top of it.
 *   4. Application.cfc:L87 republishes the selected dialect as the application value
 *      `databaseType`. That value IS the collapsed constant, which is precisely why it does not
 *      become a configuration variable here.
 *
 * What this port does instead: it targets MySQL only. AAP §0.1.2.1 maps persistence to "mysql2
 * prepared statements against the same Sw* tables", so the branch is resolved at DESIGN time
 * rather than at configuration time. Concretely, and so that none of this reads as an oversight:
 *   - There is no runtime product probe of any kind, and no capability detection.
 *   - There is no dialect type, enum, union, branch or strategy object anywhere in this subtree.
 *   - There is deliberately NO DB_DIALECT and NO DATABASE_TYPE environment variable. Offering one
 *     would advertise a portability this port does not have.
 *   - No database engine version is asserted. AAP §0.5.4 records the MySQL version as NOT
 *     DOCUMENTED — the legacy repository pins none, selecting a dialect at runtime instead — and
 *     AAP §0.9.3 requires recording that absence rather than supplying a plausible value (S9).
 *     The same applies to the Hibernate version, which has no in-repository pin either.
 * ============================================================================================ */

/* ==============================================================================================
 * DECISION B — "Slatwall" [config/configApplication.cfm:L2] is a DATASOURCE NAME, not a schema
 * name; and the connection facts this module reads are not declared anywhere in legacy source
 * (AAP §0.8.2 Guideline 6).
 *
 * config/configApplication.cfm:L2 sets `this.datasource.name = "Slatwall"`. That string is a
 * ColdFusion/Railo DATASOURCE NAME: an alias registered in the application server's
 * administrator, which the server resolves out of band to a JDBC URL, a schema, a user and a
 * password. It is NOT a schema name, NOT a host, NOT a port and NOT a user, and it is therefore
 * never used as one here. It appears in this file only in these comments, only with its locator.
 *
 * The evidence for treating it that way is the absence of everything else. Across
 * config/configApplication.cfm, config/configORM.cfm, Application.cfc and
 * org/Hibachi/Hibachi.cfc the datasource is referenced at four sites, and not one of them
 * declares a host, a port, a schema, a username or a password value:
 *   org/Hibachi/Hibachi.cfc:L10-L11 — the struct and the default name "hibachi".
 *   org/Hibachi/Hibachi.cfc:L12-L13 — username and password, BOTH set to the empty string.
 *   config/configApplication.cfm:L2  — overrides the name only.
 *   config/configORM.cfm:L3          — passes name, username and password straight to the probe.
 *
 * So host, port, schema, user and password are all supplied by the operator through the
 * environment, exactly as AAP §0.8.3.9 requires: "environment-driven DB configuration, no
 * hardcoded credentials". Two consequences are load-bearing and are stated so they cannot be
 * mistaken for omissions:
 *   - No value below is defaulted. Not the schema name, not the port, not the host, not the user.
 *     Defaulting any of them would assert a fact the legacy source does not state (S9), and the
 *     conventional MySQL port number in particular is nowhere in this file.
 *   - No credential exists in the legacy tree to carry across. Username and password are the
 *     empty string at org/Hibachi/Hibachi.cfc:L12-L13, so this port has nothing to inherit and
 *     hardcodes nothing.
 * ============================================================================================ */

/* ==============================================================================================
 * DECISION C — eager fail-fast validation is INHERITED behaviour, not an added safety feature
 * (AAP §0.8.2 Guidelines 2 and 6).
 *
 * The legacy application does not limp along with an unusable datasource. config/configORM.cfm:L2
 * opens a `<cftry>` around the probe; when the probe fails, config/configORM.cfm:L4 catches it,
 * config/configORM.cfm:L5 includes admin/views/main/nodatasource.cfm and config/configORM.cfm:L6
 * `<cfabort />`s the request outright. Failure is immediate, total and loud.
 *
 * Validating the whole configuration once at module load and throwing on the first problem is
 * therefore behaviour-consistent with config/configORM.cfm:L4-L7. It is the same contract in a
 * new idiom, not gold plating — which matters, because AAP §0.8.2 Guideline 4 forbids enhancing
 * behaviour beyond what the migration requires. What the legacy code did NOT do, and what is
 * correspondingly absent here, is retry, back off, fall back to a second datasource, degrade to a
 * read-only mode or emit a health signal.
 *
 * Two deliberate narrowings of that inheritance:
 *   - The legacy abort was triggered by an unreachable datasource, i.e. by a failed connection.
 *     This module never opens a connection: it validates only that the operator supplied the
 *     facts a connection needs. Connection establishment belongs to src/config/database.ts. That
 *     split is what lets a type-check, a test run and a bundle all succeed with no environment
 *     variable set and no database reachable.
 *   - A failure names the offending variable and never reveals its value. Reporting DB_PASSWORD
 *     as absent is required; echoing what it contained is forbidden under AAP §0.8.3.9. No
 *     validator below interpolates a value into a message, an error, a context payload or
 *     anything else, and there is no console call in this module at all.
 * ============================================================================================ */

/* ==============================================================================================
 * DECISION D — three legacy configuration behaviours have no target analogue and are recorded as
 * omissions rather than modelled (AAP §0.8.2 Guideline 6).
 *
 * 1. Application-instance naming. config/configApplication.cfm:L1 computes
 *    `this.name = "slatwall" & hash(getCurrentTemplatePath())`, deriving a per-deployment
 *    application name so that two copies on one server get separate application scopes. A
 *    stateless invocation has no application scope to name and no sibling deployment to
 *    disambiguate from, so the value has nothing to control. It is not modelled, and no
 *    application-name variable is introduced.
 *
 * 2. The ORM component-path append. config/configORM.cfm:L1 does
 *    `arrayAppend(this.ormsettings.cfclocation, "/Slatwall/integrationServices")`, which is how
 *    integrationServices/google/Integration.cfc came to be discovered at all: the framework
 *    scanned that path at start-up and picked up whatever implemented the integration contract
 *    (AAP IR-11). This port replaces discovery-by-path with an explicit typed import of
 *    src/integrations/google/GoogleIntegration.ts, per transformation rules R2 and TR-3 —
 *    framework magic becomes a compile-checked declaration. A search path is consequently not a
 *    configuration value here, and there is no variable for it.
 *
 * 3. The configuration-layering chain. org/Hibachi/Hibachi.cfc:L16 includes
 *    ../../config/configApplication.cfm inside a `try{}catch(any e){}` that swallows every error,
 *    and org/Hibachi/Hibachi.cfc:L18 then includes ../../custom/config/configApplication.cfm the
 *    same way, so a deployment could silently override any application setting. That chain is not
 *    reproduced: there is no override file, no layered merge, no fallback source and no silent
 *    catch. The evidence that nothing is lost is AAP §0.2.2.2, which verifies that custom/**
 *    contains "nothing but readme stubs, so there are zero catalog overrides to reconcile". One
 *    environment, read once, validated once.
 * ============================================================================================ */

/* ==============================================================================================
 * DECISION E — transport security and the pool's resource bounds are OPERATOR-SUPPLIED facts, and
 * no figure is invented for any of them (AAP §0.4.1.3; standard S9; requirement IR-12; security
 * finding SEC-12).
 *
 * WHY THESE FOUR VARIABLES EXIST AT ALL, WHEN THE LEGACY SOURCE DECLARES NONE
 * --------------------------------------------------------------------------
 * This is a driver-default problem, not a legacy-behaviour problem, and the distinction is what
 * licenses the change. The legacy application delegated the entire connection to the application
 * server (DECISION B), so there is no in-source original that says anything about transport
 * security or pool capacity. What makes "carry nothing over" the wrong reading here is that the
 * driver's behaviour in the ABSENCE of an explicit setting is not neutral:
 *   - no TLS is negotiated at all, so credentials and every Sw* row cross the network in
 *     cleartext; and
 *   - the queue of waiting connection requests is UNLIMITED, because the driver documents zero as
 *     the no-limit sentinel for it and zero is what applies when nothing is set.
 *
 * Omitting the settings therefore selects the insecure and the unbounded arrangement rather than
 * declining to choose. Four facts are consequently declared — and every one of them is supplied
 * by the operator, so this module still states no figure of its own.
 *
 * WHY THEY ARRIVE HERE, AND AS REQUIRED VALUES
 * -------------------------------------------
 * AAP §0.4.1.3 dictates the shape of precisely this change: pool sizing "is not carried over
 * because the legacy application delegates pooling to the CF/Railo server and pins nothing in
 * source". src/config/database.ts holds that same clause as its DECISION C and states the only
 * admissible form a knob may take — "it arrives through src/config/env.ts as an operator-supplied
 * value with no default invented in source, and the environment template declares it. It does not
 * arrive as a literal here." That is exactly the form used: four names read below, four values
 * required, no default substituted for any of them, and every one mirrored by name in
 * slatwall-ts/.env.example.
 *
 * Requiring them rather than defaulting them is the same fail-fast contract DECISION C inherits
 * from config/configORM.cfm:L4-L7, applied to the same class of fact as the other five: a
 * deployment that has not stated its transport mode or its capacity bounds is a deployment whose
 * operator has not yet decided, and it fails at load naming the variable rather than running with
 * a figure this port chose on their behalf.
 *
 * WHY NO UPPER BOUND IS IMPOSED ON THE THREE NUMBERS
 * -------------------------------------------------
 * Each of the three is validated as a plain base-ten integer of at least one, and no ceiling is
 * checked. The lower bound is arithmetic rather than invented — a pool that may hold fewer than
 * one connection can never connect, a queue that may hold fewer than one request cannot queue, and
 * a timeout of less than one millisecond cannot elapse — and rejecting zero is what actually
 * closes the finding, because zero is the driver's documented no-limit sentinel for the queue.
 * A ceiling, by contrast, would be a capacity figure with no source, and standard S9 forbids
 * exactly that: "No SLAs, latency targets, throughput figures or capacity numbers that the source
 * does not state." The security property the finding asks for is that this port ship no unbounded
 * default, and an operator-stated finite integer delivers it; choosing the magnitude is the
 * operator's decision, not this port's.
 *
 * WHY CLEARTEXT IS GATED ON A LOOPBACK HOST RATHER THAN MERELY DISCOURAGED
 * ----------------------------------------------------------------------
 * A transport mode that can be turned off by one environment variable is a control that will be
 * turned off. So {@link DatabaseTlsMode} carries two tokens and the unverified one is accepted
 * ONLY when the host is a loopback literal — which makes cleartext to a remote server not
 * discouraged but INEXPRESSIBLE, while leaving the local-development arrangement the setup log
 * describes (a container published on 127.0.0.1, presenting a self-signed certificate no public
 * trust store can verify) working unchanged. The check is a validation rule derived from the
 * addresses the platform reserves for loopback, not a policy figure, so it invents nothing.
 *
 * A private certificate authority needs no variable and no code here: Node reads additional
 * trusted roots from its own documented environment mechanism, so a deployment fronted by a
 * private CA supplies the root to the runtime and still runs in the verified mode. That is why
 * there is no certificate, key, passphrase or CA-path variable below — the port neither reads a
 * file nor parses a certificate, and src/config/env.ts imports no Node builtin.
 * ============================================================================================ */

/* ==============================================================================================
 * DECISION F — the Google feed's host authority is CONFIGURATION, not a request header
 * (security finding SEC-06; AAP §0.4.1.10; standard S9; requirement IR-12).
 *
 * WHY A TENTH VARIABLE EXISTS
 * ---------------------------
 * integrationServices/google/views/feed/product.cfm interpolates `CGI.HTTP_HOST` into all five of
 * its absolute URLs — :L14, :L15, :L22, :L23 and :L24 — with no validation. On a persistent CFML
 * server that value is whatever the caller sent in the request's `Host` header, and the target
 * platform is no different. Three routes open as a result, and none needs an unusual deployment:
 * XML markup in the header lands inside four element text nodes and can add or replace feed
 * fields; every product, image and additional-image URL in the document is rebased onto whatever
 * authority the caller names; and a single bare ampersand leaves the document with no defined XML
 * parse at all.
 *
 * A canonical host cannot come from the request, so it has to come from configuration, and the
 * sole-reader invariant above means it has to come from HERE. That is the whole reason this
 * variable exists.
 *
 * WHY IT IS REQUIRED RATHER THAN DEFAULTED
 * ----------------------------------------
 * Same fail-fast contract as the other nine, inherited from config/configORM.cfm:L4-L7. There is
 * no host to inherit — the legacy read one from the request and recorded none in source — so any
 * value this module supplied on the operator's behalf would be invented, which standard S9 forbids
 * outright. A deployment that renders a merchant feed without having stated its own host is a
 * deployment whose operator has not yet decided, and failing at load naming the variable is
 * strictly better than emitting a feed full of somebody else's links.
 *
 * WHY THE SYNTAX RULE IS NOT DUPLICATED HERE
 * ------------------------------------------
 * This module checks PRESENCE and NON-BLANKNESS only, exactly as it does for DB_HOST. The
 * authority-syntax rule — the character allowlist that closes the injection and rebasing routes —
 * lives in exactly one place, `validateFeedHostAuthority` in
 * src/integrations/google/ProductFeedBuilder.ts, as its DECISION G-1. Restating it here would put
 * the same rule in two files with no mechanism keeping them in step, and a drifted copy of a
 * security rule is worse than one copy: the branded type that rule produces is what the builder's
 * render context actually demands, so the rule cannot be bypassed by reading this value directly.
 *
 * Consequently the arrow direction is preserved and no new import appears in this file. Config does
 * NOT reach up into src/integrations/**; the deferred src/handlers/googleFeedHandler.ts reads
 * `config.googleFeed.host` from here, passes it through the builder's validator, and hands the
 * branded result to the render context. That handler owes one further obligation no type can
 * enforce — that it never substitutes a request header for this value — and DECISION G-1 states it.
 * ============================================================================================ */

/**
 * How the connection to MySQL is protected in transit.
 *
 * Two tokens and no third, because there is no third arrangement this port is willing to open:
 *
 *   `verified` — TLS is required, the server's certificate chain is verified against the
 *     runtime's trust store, and the server's identity is checked against the host connected to.
 *     The mode every deployment that is not a local database uses, and the only mode accepted for
 *     a non-loopback host.
 *
 *   `disabled` — no TLS. Accepted ONLY when {@link DatabaseConfig.host} is a loopback literal, so
 *     it cannot select cleartext across a network. Its whole purpose is the local development
 *     database, whose self-signed certificate no public trust store can verify.
 *
 * Deliberately absent is any token that would keep TLS while skipping verification. An unverified
 * session is indistinguishable from an intercepted one, so offering it would advertise protection
 * this port cannot provide, and no `SslOptions` field that disables verification is set anywhere
 * in src/config/database.ts.
 */
export type DatabaseTlsMode = 'verified' | 'disabled';

/**
 * The connection facts required to reach the existing Sw* schema.
 *
 * Field-by-field provenance, because only two of the nine have any legacy counterpart at all:
 *   `user`     — Application.cfc:L81 (`this.datasource.username`), empty at
 *                org/Hibachi/Hibachi.cfc:L12.
 *   `password` — Application.cfc:L84 (`this.datasource.password`), empty at
 *                org/Hibachi/Hibachi.cfc:L13.
 *   `host`, `port`, `database` — not declared anywhere in legacy source. See DECISION B: the
 *                legacy application named a datasource and let the application server resolve
 *                these out of band, so they are new here by necessity, not by choice.
 *   `tlsMode`, `connectionLimit`, `queueLimit`, `connectTimeoutMs` — likewise not declared
 *                anywhere in legacy source, and present for the reason DECISION E sets out: the
 *                driver's behaviour when they are unset is the unencrypted and the unbounded one,
 *                so declining to state them would select that arrangement rather than decline to
 *                choose. Each is supplied by the operator; none is defaulted here.
 *
 * Every member is `readonly`, and the value exposed as {@link config} is frozen at both levels,
 * so the shape is immutable at type level and at run time alike.
 */
export interface DatabaseConfig {
  /** Host name or address of the MySQL server. Never defaulted. */
  readonly host: string;
  /** TCP port of the MySQL server, validated as an integer in the addressable range. */
  readonly port: number;
  /**
   * Schema holding the Sw* tables.
   *
   * Deliberately NOT defaulted to the legacy datasource alias at
   * config/configApplication.cfm:L2 — that alias is a datasource name, not a schema name
   * (DECISION B).
   */
  readonly database: string;
  /** User the service authenticates as. Never defaulted; may legitimately be empty. */
  readonly user: string;
  /**
   * Password the service authenticates with. Never defaulted; may legitimately be empty, and
   * never logged, echoed, serialized or interpolated anywhere (AAP §0.8.3.9).
   */
  readonly password: string;
  /**
   * How the connection is protected in transit. Never defaulted, and `disabled` is accepted only
   * for a loopback {@link host} (DECISION E).
   */
  readonly tlsMode: DatabaseTlsMode;
  /**
   * Greatest number of connections the pool may open. Never defaulted; validated as an integer of
   * at least one, with no ceiling imposed because a ceiling would be an invented capacity figure
   * (DECISION E).
   */
  readonly connectionLimit: number;
  /**
   * Greatest number of connection requests the pool may hold waiting once {@link connectionLimit}
   * is reached; beyond it, a request fails instead of queueing indefinitely.
   *
   * Never defaulted, and zero is rejected: zero is the driver's documented no-limit sentinel, so
   * accepting it would reinstate the unbounded queue this value exists to close (DECISION E).
   */
  readonly queueLimit: number;
  /**
   * Milliseconds the driver may spend establishing a connection before failing. Never defaulted;
   * validated as an integer of at least one (DECISION E).
   */
  readonly connectTimeoutMs: number;
}

/**
 * The complete configuration surface of this service.
 *
 * It contains exactly one section because the Catalog slice needs exactly one: reaching the
 * existing MySQL schema. The Minimal Change Clause (AAP §0.8.1) is minimal in FUNCTIONAL SCOPE,
 * so no configuration is carried for any excluded domain family — account, order, vendor,
 * subscription, stock, promotion, physical, attribute, payment, content, price group, shipping,
 * location, tax, setting, inventory, currency, fulfillment or category. The same clause is
 * explicitly NOT minimal in idiom, which is what licenses replacing a runtime product probe and
 * a swallowed include chain with one typed, frozen object.
 */
export interface GoogleFeedConfig {
  /**
   * The host authority every absolute URL in the Google product feed is built on — the canonical
   * replacement for the legacy `CGI.HTTP_HOST` reads at
   * integrationServices/google/views/feed/product.cfm:L14, :L15, :L22, :L23 and :L24.
   *
   * Typed as a plain string HERE and validated ELSEWHERE, on purpose. This module checks presence
   * and non-blankness; the authority-syntax rule that closes the injection and origin-rebasing
   * routes lives once, in `validateFeedHostAuthority` in
   * src/integrations/google/ProductFeedBuilder.ts. See DECISION F for why the rule is not copied
   * into this file and why the arrow does not point upward from config into integrations.
   *
   * ⛔ NEVER a request header. The consumer's obligation, which no type can enforce, is stated as
   * the PROVENANCE OBLIGATION in that same builder's DECISION G-1.
   */
  readonly host: string;
}

export interface AppConfig {
  readonly database: DatabaseConfig;

  /**
   * The Google product feed section — see {@link GoogleFeedConfig} and DECISION F.
   *
   * Present as its own section rather than as a loose member so that the two concerns stay
   * separable: a deployment reading this section is rendering a merchant feed, and a deployment
   * reading {@link AppConfig.database} is reaching the Sw* schema. Nothing in the feed section is a
   * connection fact and nothing in the database section is a presentation fact.
   */
  readonly googleFeed: GoogleFeedConfig;
}

/* ==============================================================================================
 * VALIDATION HELPERS
 *
 * Three helpers, one shared shape, and three shared guarantees.
 *
 * Guarantee 1 — no unsound narrowing. An environment read is typed `string | undefined`, and
 * `noUncheckedIndexedAccess` means that stays true however the read is written. Each helper
 * narrows it with a real `typeof` test, so nothing here uses a non-null assertion, a type
 * assertion of any kind, an unsafe escape hatch or a suppression comment (standard S1). The
 * compiler contract in tsconfig.json is never weakened to admit code; the code is written to
 * satisfy it.
 *
 * Guarantee 2 — no value ever leaves a helper except as its return value. A message, and the
 * structured context attached to it, carry the VARIABLE NAME only. Naming DB_PASSWORD as absent
 * is required so an operator can fix the deployment; disclosing what it held is forbidden
 * (AAP §0.8.3.9, DECISION C).
 *
 * Guarantee 3 — values are returned exactly as supplied, never normalised. Whitespace is used to
 * DETECT a blank value, and for the numeric parse, but a surviving value is handed back verbatim.
 * Trimming would be a silent transformation of operator input, and it would be outright wrong for
 * a password, where leading or trailing whitespace can be significant.
 *
 * "Required" throughout means PRESENT. Absence of any of the TEN variables is fatal, and no
 * default is ever substituted for any of them (DECISION B, DECISION E, DECISION F, standard S9).
 * Nine of the ten are connection facts and the tenth is the Google feed host (DECISION F); the
 * same three helpers serve both sections, and the feed host uses the non-blank helper.
 * ============================================================================================ */

/**
 * Matches an unsigned base-ten integer and nothing else.
 *
 * This guard runs BEFORE the numeric conversion because numeric conversion in JavaScript is far
 * more permissive than a port number warrants, and every one of those permissions would silently
 * accept a misconfiguration: an empty string converts to zero, a `0x`-prefixed string is read as
 * hexadecimal, an `e`-notation string expands, a fractional string converts without complaint,
 * surrounding whitespace is ignored and an explicit sign is accepted. Rejecting anything that is
 * not a plain run of digits first makes the conversion total, so the parse below cannot produce a
 * surprising number and cannot produce `NaN`.
 */
const UNSIGNED_INTEGER_PATTERN = /^\d+$/;

/**
 * Lowest addressable TCP port. Port zero is reserved and cannot be connected to.
 *
 * This bound and {@link HIGHEST_ADDRESSABLE_TCP_PORT} are published platform limits — the TCP port
 * field is a 16-bit unsigned integer — which is the one category of number this port may state
 * without a source locator (standard S9). Neither is a default: no port value is ever supplied on
 * the operator's behalf, and the conventional MySQL port number appears nowhere in this file.
 */
const LOWEST_ADDRESSABLE_TCP_PORT = 1;

/** Highest addressable TCP port, the maximum of the protocol's 16-bit unsigned port field. */
const HIGHEST_ADDRESSABLE_TCP_PORT = 65535;

/**
 * Smallest value a pool bound or a timeout may take.
 *
 * Arithmetic rather than invented, which is what keeps it clear of standard S9: a pool that may
 * hold fewer than one connection can never connect, a queue that may hold fewer than one request
 * cannot queue, and a timeout shorter than one millisecond cannot elapse. Rejecting zero is the
 * substance of the bound, because zero is the driver's documented no-limit sentinel for the queue
 * (DECISION E). No corresponding ceiling exists here, deliberately — see DECISION E for why one
 * would be a capacity figure with no source.
 */
const LOWEST_PERMITTED_RESOURCE_BOUND = 1;

/**
 * Highest value an IPv4 dotted-quad octet may take, the maximum of its 8-bit unsigned field.
 *
 * A published protocol limit, like the TCP port bounds above, and therefore in the one category of
 * number this port may state without a source locator (standard S9). Used only to decide whether a
 * configured host is a loopback literal, never to build or normalise an address.
 */
const HIGHEST_IPV4_OCTET = 255;

/** Number of dotted-quad components in an IPv4 literal. */
const IPV4_OCTET_COUNT = 4;

/** First octet of the block reserved for IPv4 loopback, 127.0.0.0/8. */
const IPV4_LOOPBACK_PREFIX = '127';

/**
 * The non-dotted-quad spellings of the loopback host that are accepted as local.
 *
 * `localhost` is the name every platform reserves for the loopback interface; the remainder are
 * the IPv6 loopback address in its compressed and fully expanded forms, each also in the bracketed
 * form a host field may carry. Anything outside this list and outside 127.0.0.0/8 is treated as
 * remote, which is the fail-safe direction: an unrecognised spelling forces the verified transport
 * mode rather than permitting cleartext (DECISION E).
 */
const LOOPBACK_HOST_NAMES: readonly string[] = [
  'localhost',
  '::1',
  '[::1]',
  '0:0:0:0:0:0:0:1',
  '[0:0:0:0:0:0:0:1]',
];

/**
 * Reads a variable that must be present, and returns it verbatim.
 *
 * Presence is the only requirement, so the empty string is a legal value. That tolerance exists for
 * source parity with the two variables that have a legacy counterpart — org/Hibachi/Hibachi.cfc:L12
 * sets the datasource username to the empty string and org/Hibachi/Hibachi.cfc:L13 does the same for
 * the password — and rejecting them would invent a constraint the legacy source contradicts. It is
 * NOT a recommended production posture: a real deployment should supply an explicit account scoped
 * to least privilege on the Sw* schema, unless the database is intentionally and securely configured
 * for credentialless access. Absent and empty stay different states, and only absent is an error.
 *
 * @param variableName name of the environment variable, used verbatim in the failure message
 * @param rawValue the value read from the environment, still possibly absent
 * @returns the value exactly as supplied, including the empty string
 * @throws DomainError naming `variableName` when the variable is not set at all
 */
function requirePresentValue(variableName: string, rawValue: string | undefined): string {
  if (typeof rawValue !== 'string') {
    throw new DomainError(
      /* The second sentence is deliberately variable-agnostic. This helper began as a
       * database-only reader and its message said "Every database connection value"; the feed-host
       * variable of `loadGoogleFeedConfig` then began reading through the same helper, which left a
       * connection-flavoured sentence answering for a value that is not a connection setting at all.
       * The named variable already tells an operator which value is missing, so the sentence states
       * only the invariant that applies to every one of them: nothing is defaulted. */
      `Required environment variable ${variableName} is not set. ` +
        'Every configuration value this service reads must be supplied by the environment; it ' +
        'defaults none of them.',
      { context: { variable: variableName } },
    );
  }

  return rawValue;
}

/**
 * Reads a variable that must be present and must carry non-whitespace content.
 *
 * Applied to the two variables that identify the connection target — the host and the schema.
 * Neither one carries a legacy counterpart to inherit an empty value from (DECISION B), and
 * neither can identify anything when blank, so a blank one is a misconfiguration
 * indistinguishable in effect from an absent one. Failing on it here is the same fail-fast
 * contract the legacy `<cfcatch>` at config/configORM.cfm:L4-L7 applied to an unusable datasource.
 *
 * @param variableName name of the environment variable, used verbatim in the failure message
 * @param rawValue the value read from the environment, still possibly absent
 * @returns the value exactly as supplied, un-trimmed
 * @throws DomainError naming `variableName` when the variable is absent, or present but blank
 */
function requireNonBlankValue(variableName: string, rawValue: string | undefined): string {
  const value = requirePresentValue(variableName, rawValue);

  if (value.trim().length === 0) {
    throw new DomainError(
      `Environment variable ${variableName} is set but blank. It must name a real connection ` +
        'target.',
      { context: { variable: variableName } },
    );
  }

  return value;
}

/**
 * Reads a variable that must be present and must denote an addressable TCP port.
 *
 * The only non-string field in the configuration, and the only one that is converted rather than
 * passed through. The conversion is total: a value that is not a plain run of digits within the
 * addressable range throws, and no malformed input is ever coerced into a number that would fail
 * later, at connection time, with a far less useful diagnostic.
 *
 * @param variableName name of the environment variable, used verbatim in the failure message
 * @param rawValue the value read from the environment, still possibly absent
 * @returns the port as an integer
 * @throws DomainError naming `variableName` when the variable is absent, blank, not a plain
 *   base-ten integer, or outside the addressable port range
 */
function requireTcpPortValue(variableName: string, rawValue: string | undefined): number {
  const value = requireNonBlankValue(variableName, rawValue).trim();

  if (!UNSIGNED_INTEGER_PATTERN.test(value)) {
    throw new DomainError(
      `Environment variable ${variableName} must be a plain base-ten integer TCP port number. ` +
        'A sign, a decimal point, exponent notation, a radix prefix and any other non-digit ' +
        'character are all rejected.',
      { context: { variable: variableName } },
    );
  }

  const port = Number(value);

  // Belt and braces after the pattern test: a digit run long enough to exceed the exactly
  // representable integer range would convert to a non-integer, and any digit run at all can
  // still fall outside the addressable range.
  if (
    !Number.isInteger(port) ||
    port < LOWEST_ADDRESSABLE_TCP_PORT ||
    port > HIGHEST_ADDRESSABLE_TCP_PORT
  ) {
    throw new DomainError(
      `Environment variable ${variableName} must be a TCP port number between ` +
        `${LOWEST_ADDRESSABLE_TCP_PORT} and ${HIGHEST_ADDRESSABLE_TCP_PORT}.`,
      { context: { variable: variableName } },
    );
  }

  return port;
}

/**
 * Reads a variable that must be present and must denote a resource bound of at least one.
 *
 * Applied to the pool's connection limit, its queue limit and the connection timeout — the three
 * numbers DECISION E requires the operator to state so that this port does not have to invent
 * them. The validation is deliberately asymmetric: a floor is enforced because a bound below one
 * is not a bound at all, and no ceiling is enforced because any ceiling would be a capacity figure
 * with no source (standard S9).
 *
 * Zero is rejected by the floor, and that rejection is the point rather than a side effect: the
 * driver documents zero as the no-limit sentinel for its queue, so a deployment that set zero
 * would silently reinstate the unbounded queue these values exist to close.
 *
 * @param variableName name of the environment variable, used verbatim in the failure message
 * @param rawValue the value read from the environment, still possibly absent
 * @returns the bound as an integer of at least one
 * @throws DomainError naming `variableName` when the variable is absent, blank, not a plain
 *   base-ten integer, not exactly representable, or below one
 */
function requirePositiveIntegerValue(variableName: string, rawValue: string | undefined): number {
  const value = requireNonBlankValue(variableName, rawValue).trim();

  if (!UNSIGNED_INTEGER_PATTERN.test(value)) {
    throw new DomainError(
      `Environment variable ${variableName} must be a plain base-ten integer. A sign, a decimal ` +
        'point, exponent notation, a radix prefix and any other non-digit character are all ' +
        'rejected.',
      { context: { variable: variableName } },
    );
  }

  const bound = Number(value);

  // `Number.isSafeInteger` rather than `Number.isInteger`: a digit run long enough to leave the
  // exactly representable range converts to a value that no longer denotes the digits supplied,
  // and silently acting on a different number than the operator wrote is worse than refusing.
  if (!Number.isSafeInteger(bound) || bound < LOWEST_PERMITTED_RESOURCE_BOUND) {
    throw new DomainError(
      `Environment variable ${variableName} must be an exactly representable integer of at ` +
        `least ${LOWEST_PERMITTED_RESOURCE_BOUND}. Zero is rejected because the driver reads it ` +
        'as "no limit", which is the unbounded behaviour this value exists to prevent.',
      { context: { variable: variableName } },
    );
  }

  return bound;
}

/**
 * Decides whether a configured host names the loopback interface.
 *
 * Recognises the reserved names and IPv6 loopback spellings in {@link LOOPBACK_HOST_NAMES}, and
 * any IPv4 literal inside the reserved 127.0.0.0/8 block. Every octet is range-checked rather than
 * merely shape-checked, because a dotted string whose octets are out of range is not an address at
 * all — it is a host NAME, and a name can resolve anywhere. Treating one as local would be exactly
 * the bypass the loopback gate exists to prevent.
 *
 * Every unrecognised spelling — a decimal-packed address, a wildcard DNS name that happens to
 * embed a loopback quad, an address with more or fewer than four components — is reported as
 * remote. That is the fail-safe direction: an unrecognised host forces the verified transport mode
 * rather than permitting cleartext (DECISION E).
 *
 * @param host the configured host, exactly as the operator supplied it
 * @returns `true` when the host is a recognised loopback literal, `false` in every other case
 */
function isLoopbackHost(host: string): boolean {
  const candidate = host.trim();

  if (LOOPBACK_HOST_NAMES.includes(candidate)) {
    return true;
  }

  const octets = candidate.split('.');

  if (octets.length !== IPV4_OCTET_COUNT || octets[0] !== IPV4_LOOPBACK_PREFIX) {
    return false;
  }

  return octets.every(
    (octet) => UNSIGNED_INTEGER_PATTERN.test(octet) && Number(octet) <= HIGHEST_IPV4_OCTET,
  );
}

/**
 * Reads the transport mode, and refuses the one combination that would send cleartext over a
 * network.
 *
 * The token is matched exactly, with no case folding and no synonym: guarantee 3 above rules out
 * silently transforming operator input, and a closed two-token set with a message that names both
 * accepted spellings is more predictable than a lenient match. Surrounding whitespace is removed
 * for the comparison only, exactly as it is for the numeric readers.
 *
 * The cross-check against the host is what makes DECISION E enforceable rather than advisory. It
 * lives here, in the only module that holds both facts, so that no later layer has to remember to
 * apply it — src/config/database.ts receives a mode it can act on unconditionally.
 *
 * @param variableName name of the environment variable, used verbatim in the failure message
 * @param rawValue the value read from the environment, still possibly absent
 * @param host the already-validated host the mode is checked against
 * @returns the validated transport mode
 * @throws DomainError naming `variableName` when the variable is absent, blank, not one of the two
 *   accepted tokens, or requests cleartext for a host that is not a loopback literal
 */
function requireTlsModeValue(
  variableName: string,
  rawValue: string | undefined,
  host: string,
): DatabaseTlsMode {
  const mode = requireNonBlankValue(variableName, rawValue).trim();

  if (mode !== 'verified' && mode !== 'disabled') {
    throw new DomainError(
      `Environment variable ${variableName} must be exactly "verified" or "disabled". There is ` +
        'deliberately no mode that keeps TLS while skipping certificate or identity ' +
        'verification, because an unverified session is indistinguishable from an intercepted one.',
      { context: { variable: variableName } },
    );
  }

  if (mode === 'disabled' && !isLoopbackHost(host)) {
    throw new DomainError(
      `Environment variable ${variableName} may only be "disabled" when DB_HOST is a loopback ` +
        'literal. Unencrypted MySQL traffic to a host reached over a network would expose the ' +
        'credentials and every row in transit, so this combination is refused rather than warned ' +
        'about. Supply the server\'s certificate authority to the runtime and use "verified".',
      { context: { variable: variableName } },
    );
  }

  return mode;
}

/**
 * Reads and validates the database section, then freezes it.
 *
 * The nine environment reads below are the complete set for the DATABASE section — the service as a
 * whole reads ten, the tenth being the Google feed host in `loadGoogleFeedConfig()` (DECISION F).
 * They are written as literal dotted accesses so that the key set is statically visible in one
 * search and so that no key is resolved through a computed string (standard S3). They are evaluated
 * in the order host,
 * port, schema, user, password, transport mode, connection limit, queue limit, connection
 * timeout — so the first problem in that order is the one reported, which is deterministic and
 * reproducible for an operator debugging a deployment.
 *
 * The host is read into a local before the literal is built because the transport mode is
 * validated against it (DECISION E). That is the only cross-field rule in this module, and it is
 * applied here rather than deferred to src/config/database.ts so that an invalid combination can
 * never reach the pool at all.
 */
function loadDatabaseConfig(): DatabaseConfig {
  const host = requireNonBlankValue('DB_HOST', process.env.DB_HOST);

  return Object.freeze({
    host,
    port: requireTcpPortValue('DB_PORT', process.env.DB_PORT),
    database: requireNonBlankValue('DB_NAME', process.env.DB_NAME),
    user: requirePresentValue('DB_USER', process.env.DB_USER),
    password: requirePresentValue('DB_PASSWORD', process.env.DB_PASSWORD),
    tlsMode: requireTlsModeValue('DB_TLS_MODE', process.env.DB_TLS_MODE, host),
    connectionLimit: requirePositiveIntegerValue(
      'DB_CONNECTION_LIMIT',
      process.env.DB_CONNECTION_LIMIT,
    ),
    queueLimit: requirePositiveIntegerValue('DB_QUEUE_LIMIT', process.env.DB_QUEUE_LIMIT),
    connectTimeoutMs: requirePositiveIntegerValue(
      'DB_CONNECT_TIMEOUT_MS',
      process.env.DB_CONNECT_TIMEOUT_MS,
    ),
  });
}

/**
 * Reads and validates the Google feed section, then freezes it.
 *
 * One environment read, checked for presence and non-blankness only. A blank host cannot identify
 * an origin, so a blank one is a misconfiguration indistinguishable in effect from an absent one —
 * the same reasoning {@link requireNonBlankValue} applies to DB_HOST and DB_NAME.
 *
 * The authority-syntax rule deliberately does NOT run here. See DECISION F for the full reasoning
 * and `validateFeedHostAuthority` in src/integrations/google/ProductFeedBuilder.ts for the rule
 * itself.
 */
function loadGoogleFeedConfig(): GoogleFeedConfig {
  return Object.freeze({
    host: requireNonBlankValue('GOOGLE_FEED_HOST', process.env.GOOGLE_FEED_HOST),
  });
}

/**
 * Builds the whole configuration and freezes it at both levels.
 *
 * Freezing the outer object alone would leave the nested sections writable, so each section is
 * frozen by its own loader and the container is frozen second. The freeze refuses the write in every
 * case, and because every module in this subtree is emitted in strict mode — CommonJS output carries
 * a `'use strict'` prologue — a consumer's assignment raises a `TypeError` instead of failing
 * silently. So the immutability is enforced at run time by two independent mechanisms, not merely
 * advertised in the types by `readonly`.
 *
 * The database section is loaded first, so a deployment missing a connection fact reports that
 * before it reports a missing feed host. That ordering is arbitrary only in appearance: the
 * connection facts are required by every entry point, whereas the feed host is required by one, so
 * reporting the broader failure first is the more useful diagnostic.
 */
function loadConfig(): AppConfig {
  return Object.freeze({
    database: loadDatabaseConfig(),
    googleFeed: loadGoogleFeedConfig(),
  });
}

/**
 * The validated, immutable configuration for this service.
 *
 * Built exactly once, when this module is first loaded, and never rebuilt: there is no reload,
 * override, set or reset entry point, by design (see WHY THERE IS NO CROSS-INVOCATION CACHE in
 * the file header). Loading this module with any of the ten variables missing or malformed
 * throws a {@link DomainError} naming the offending variable — the fail-fast contract inherited
 * from config/configORM.cfm:L4-L7 and set out in DECISION C.
 *
 * Consumed by constructor injection only. src/config/database.ts reads it to create the
 * module-scope pool, src/config/container.ts wires the resulting collaborators, and the deferred
 * src/handlers/googleFeedHandler.ts reads {@link AppConfig.googleFeed} for the feed host
 * (DECISION F); nothing below the config layer imports this module, and nothing below it reads the
 * environment (AAP §0.4.3.5).
 *
 * @example
 * ```ts
 * import { config } from '../config/env';
 *
 * const { host, port, database, user, password } = config.database;
 *
 * // DECISION F — validated and branded by the builder before it reaches a render context.
 * const feedHost = validateFeedHostAuthority(config.googleFeed.host);
 * ```
 */
export const config: AppConfig = loadConfig();
