/**
 * Typed, eagerly validated environment reading for the extracted Catalog service.
 *
 * Legacy origin — every fact this module encodes, with its locator:
 *   config/configApplication.cfm:L2 — `<cfset this.datasource.name = "Slatwall" />`. The one
 *     and only connection fact the legacy application records anywhere in source.
 *   config/configORM.cfm:L3 — the `<cfdbinfo ... type="Version" name="dbVersion">` runtime probe
 *     of the database product.
 *   config/configORM.cfm:L4-L7 — the `<cfcatch>` that renders a no-datasource notice and then
 *     `<cfabort />`s. This is the fail-fast behaviour reproduced below.
 *   config/configORM.cfm:L9-L15 — the three-way ORM dialect branch.
 *   Application.cfc:L78, :L81, :L84, :L87 — the four values the legacy bootstrap publishes out of
 *     the two files above: `datasource`, `datasourceUsername`, `datasourcePassword` and
 *     `databaseType`.
 *   org/Hibachi/Hibachi.cfc:L10-L13 — the framework defaults those two files override: the
 *     datasource struct, its name, and an EMPTY username and an EMPTY password.
 *
 * There is no legacy counterpart to this module, and that absence is itself the finding: the
 * legacy application never held connection details in source at all — it named a datasource and
 * let the application server resolve it out of band. Coverage for this module is therefore
 * entirely NET-NEW. It extends no legacy test, and no parity with one is claimed or implied
 * (AAP §0.6.5.2, standard S6).
 *
 * THE SOLE-READER INVARIANT
 * -------------------------
 * This module is the one and only file under src/** permitted to read the process environment.
 * AAP §0.4.3.5 states both the rule and the direction of flow: "Configuration flows one way:
 * `src/config/env.ts` reads the environment, `src/config/database.ts` creates the module-scope
 * pool, and `src/config/container.ts` wires the graph; nothing below the config layer reads the
 * environment directly." Every module under src/domain, src/ports, src/adapters, src/services,
 * src/validation and src/integrations receives its configuration by constructor injection from
 * the container module, and never reaches for the environment itself (standard S3 — explicit
 * dependency injection, no service locator, no string-keyed runtime resolution).
 *
 * The invariant is deliberately greppable, which is why every environment read below is written
 * as a plain dotted property access rather than a computed lookup: a repository-wide search for
 * `process.env` under src/** that reports a read in any other file is a violation, and a search
 * for `process.env.` in this file enumerates the complete key set in one pass.
 *
 * ARCHITECTURAL POSITION (standard S4 — hexagonal separation)
 * ----------------------------------------------------------
 * src/config sits above domain, ports, adapters, services, validation and integrations, and
 * below handlers. Handlers import the container; nothing in the config layer ever imports a
 * handler. Consequences that follow, all deliberate:
 *   - The single import is the shared error base. Nothing else is imported — no package, no Node
 *     builtin, no sibling layer.
 *   - No AWS type, client, event, result, invocation context, region, account identifier or
 *     resource identifier is named here. All AWS coupling is confined to src/handlers (S4), and
 *     the AWS SDK is deliberately absent from the dependency set because the Lambda runtime
 *     already ships it (AAP §0.5.2.1).
 *   - No query text, table name or column name appears here, and this module exports no
 *     string-interpolation or identifier-quoting helper. Parameterized statements and identifier
 *     whitelisting belong to src/adapters/mysql/QueryRunner.ts and
 *     src/adapters/mysql/SmartListQueryBuilder.ts (S2).
 *   - No dependency is introduced. The runtime dependency set stays at exactly one package, and
 *     neither an environment-file loader nor a schema-validation package is used: the narrowing
 *     below is hand-written (S5). A `.env` file is a developer convenience that the shell or the
 *     test runner loads, never something bundled code loads for itself.
 *   - Nothing is logged. There is no logger in the dependency set, and the legacy `writeLog`
 *     calls are not carried across.
 *
 * WHY THERE IS NO CROSS-INVOCATION CACHE
 * -------------------------------------
 * The only module-scope state here is one immutable, frozen, validated-once value. AAP §0.6.6
 * mismatch M7 records that nothing survives between Lambda invocations except module-scope
 * state, which makes any mutable module-scope cache a bleed hazard across invocations that may
 * belong to different callers. A frozen constant cannot bleed, so it is safe; a mutable one is
 * not. That is why this module exports no reload, override or reset entry point, and why the
 * value is built once at load rather than lazily rebuilt per call. The pooling side of the same
 * mismatch is discussed where it is owned, in src/config/database.ts. The related commit-timing
 * mismatch M5 is owned by src/adapters/mysql/UnitOfWork.ts and is not re-argued here (S8 —
 * point at the owner rather than restate the mismatch).
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

/**
 * The connection facts required to reach the existing Sw* schema.
 *
 * Field-by-field provenance, because only two of the five have any legacy counterpart at all:
 *   `user`     — Application.cfc:L81 (`this.datasource.username`), empty at
 *                org/Hibachi/Hibachi.cfc:L12.
 *   `password` — Application.cfc:L84 (`this.datasource.password`), empty at
 *                org/Hibachi/Hibachi.cfc:L13.
 *   `host`, `port`, `database` — not declared anywhere in legacy source. See DECISION B: the
 *                legacy application named a datasource and let the application server resolve
 *                these out of band, so they are new here by necessity, not by choice.
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
export interface AppConfig {
  readonly database: DatabaseConfig;
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
 * "Required" throughout means PRESENT. Absence of any of the five variables is fatal, and no
 * default is ever substituted for any of them (DECISION B, standard S9).
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
 * Reads a variable that must be present, and returns it verbatim.
 *
 * Presence is the only requirement, so the empty string is a legal value. That is a deliberate
 * judgment call rather than a lenient default, and it applies to exactly the two variables that
 * have a legacy counterpart: org/Hibachi/Hibachi.cfc:L12 sets the datasource username to the
 * empty string and org/Hibachi/Hibachi.cfc:L13 sets the password to the empty string. Rejecting
 * an empty user or an empty password would invent a constraint the legacy source actively
 * contradicts, which standard S9 forbids. MySQL permits both, so a deployment that legitimately
 * uses them stays deployable.
 *
 * @param variableName name of the environment variable, used verbatim in the failure message
 * @param rawValue the value read from the environment, still possibly absent
 * @returns the value exactly as supplied, including the empty string
 * @throws DomainError naming `variableName` when the variable is not set at all
 */
function requirePresentValue(variableName: string, rawValue: string | undefined): string {
  if (typeof rawValue !== 'string') {
    throw new DomainError(
      `Required environment variable ${variableName} is not set. ` +
        'Every database connection value must be supplied by the environment; this service ' +
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
 * Reads and validates the database section, then freezes it.
 *
 * The five environment reads below are the complete set for this service, and they are written as
 * literal dotted accesses so that the key set is statically visible in one search and so that no
 * key is resolved through a computed string (standard S3). Property initialisers evaluate top to
 * bottom, so the first problem encountered in the order host, port, schema, user, password is the
 * one reported — deterministic, and reproducible for an operator debugging a deployment.
 */
function loadDatabaseConfig(): DatabaseConfig {
  return Object.freeze({
    host: requireNonBlankValue('DB_HOST', process.env.DB_HOST),
    port: requireTcpPortValue('DB_PORT', process.env.DB_PORT),
    database: requireNonBlankValue('DB_NAME', process.env.DB_NAME),
    user: requirePresentValue('DB_USER', process.env.DB_USER),
    password: requirePresentValue('DB_PASSWORD', process.env.DB_PASSWORD),
  });
}

/**
 * Builds the whole configuration and freezes it at both levels.
 *
 * Freezing the outer object alone would leave the nested section writable, so the section is frozen
 * first and the container second. The freeze refuses the write in every case, and because every
 * module in this subtree is emitted in strict mode — CommonJS output carries a `'use strict'`
 * prologue — a consumer's assignment raises a `TypeError` instead of failing silently. So the
 * immutability is enforced at run time by two independent mechanisms, not merely advertised in the
 * types by `readonly`.
 */
function loadConfig(): AppConfig {
  return Object.freeze({ database: loadDatabaseConfig() });
}

/**
 * The validated, immutable configuration for this service.
 *
 * Built exactly once, when this module is first loaded, and never rebuilt: there is no reload,
 * override, set or reset entry point, by design (see WHY THERE IS NO CROSS-INVOCATION CACHE in
 * the file header). Loading this module with any of the five variables missing or malformed
 * throws a {@link DomainError} naming the offending variable — the fail-fast contract inherited
 * from config/configORM.cfm:L4-L7 and set out in DECISION C.
 *
 * Consumed by constructor injection only. src/config/database.ts reads it to create the
 * module-scope pool and src/config/container.ts wires the resulting collaborators; nothing below
 * the config layer imports this module, and nothing below it reads the environment (AAP §0.4.3.5).
 *
 * @example
 * ```ts
 * import { config } from '../config/env';
 *
 * const { host, port, database, user, password } = config.database;
 * ```
 */
export const config: AppConfig = loadConfig();
