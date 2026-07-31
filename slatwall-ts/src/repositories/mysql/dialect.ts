// ---------------------------------------------------------------------------
// slatwall-ts - database dialect interpretation and dialect-branching SQL text
//
// WHAT THIS MODULE IS
//   The foundation of the MySQL adapter layer. It has no intra-folder
//   dependency and every other module under `src/repositories/mysql/**` may
//   depend on it. It does exactly two things:
//
//     1. INTERPRETS the validated dialect value that `src/lib/config.ts`
//        supplies - canonicalizing any accepted spelling, refusing anything
//        unrecognized, and refusing the two branches this port does not
//        implement.
//     2. EMITS the dialect-branching SQL FRAGMENT TEXT that the ported
//        repositories need, so that the branch lives in one reviewable place
//        instead of being re-derived inside each repository.
//
//   It never opens a connection, never builds a pool, never reads the process
//   environment, and never executes a statement. It returns strings.
//
// WHAT IT REPLACES - THE VERIFIED LEGACY CHAIN
//   The legacy host never configured the dialect; it PROBED for it, and then
//   published the result as an application value that every branching query
//   read back.
//
//     [config/configORM.cfm:L3]      <cfdbinfo type="Version"> asked the
//                                    datasource for its version information.
//     [config/configORM.cfm:L4-L7]   On probe failure the <cfcatch> included
//                                    /admin/views/main/nodatasource.cfm and
//                                    then <cfabort/>ed outright.
//     [config/configORM.cfm:L9-L14]  findNoCase mapped the reported
//                                    DATABASE_PRODUCTNAME onto a dialect,
//                                    testing MySQL FIRST.
//     [config/configORM.cfm:L15]     </cfif> - with NO <cfelse>.
//     [Application.cfc:L87]          Published it as the "databaseType"
//                                    application value.
//
//   `src/lib/config.ts` replaces the probe with the DB_DIALECT environment
//   variable, whose contract is committed in `slatwall-ts/.env.example`. This
//   module replaces the read-back-and-branch half of the chain.
//
//   JUDGMENT CALL: replacing the runtime probe with validated configuration also
//   removes the probe's FAILURE PATH. There is no longer anything to probe, so
//   the `<cfcatch>` at [config/configORM.cfm:L4-L7] - which rendered
//   /admin/views/main/nodatasource.cfm into the response and then `<cfabort/>`ed
//   - has no counterpart here. Its two effects are separated deliberately: the
//   hard-stop semantics are preserved exactly, as a typed startup error thrown
//   before any work is done, while the rendered diagnostic page is not
//   reproduced at all. It could not be: that page belongs to the admin
//   subsystem, which is out of scope, and a headless service behind API Gateway
//   has no response to render it into. What replaces it is the message the
//   thrown error carries, which names the variable, lists the accepted values
//   and cites the legacy locators.
//
// THE SCOPE SPLIT WITH src/lib/config.ts - NEITHER DUPLICATES THE OTHER
//   `src/lib/config.ts` SUPPLIES the value: it reads DB_DIALECT, validates it,
//   and canonicalizes it to one of exactly three spellings. Its own
//   documentation states the division explicitly - all three spellings are
//   accepted there so that a misspelling stays distinguishable from a valid but
//   unimplemented choice, and refusing the unimplemented branches is this
//   module's job.
//
//   This module therefore does NOT re-read and does NOT re-validate the
//   environment. `resolveConfiguredDialect` consumes `appConfig.load().dialect`
//   and passes it through this module's own lookup as a narrow exhaustiveness
//   guard - nothing more.
//
// A CORRECTION TO PUBLISH: THREE LIVE DIALECT-BRANCH SITES, NOT TWO
//   The root manifests understate the count. `slatwall-ts/.env.example` names
//   two SQL sites that branch on the dialect - the productTypeIDPath
//   concatenation and the row-limiting clause in PriceGroupDAO. A complete
//   census of `getApplicationValue("databaseType")` across the legacy tree
//   found THREE live in-scope sites. All three are encoded below, and this note
//   exists so that no later reader narrows the set back to two.
//
//     LIVE, IN SCOPE, ENCODED HERE
//       [model/dao/PromotionDAO.cfc:L482-L488]  productTypeIDPath LIKE
//                                               concatenation, inside a JOIN
//                                               ON clause.
//       [model/dao/PriceGroupDAO.cfc:L57]       single-row limiting inside
//                                               getAccountSubscriptionPriceGroups.
//       [model/dao/SkuDAO.cfc:L194]             the option-group positional
//                                               weight ORDER BY in
//                                               getSortedProductSkusID. NOT
//                                               named by the root manifests,
//                                               and it backs a must-preserve
//                                               behaviour.
//
//     DIALECT BRANCHES DELIBERATELY NOT MODELLED HERE
//       [model/dao/ProductDAO.cfc:L288]  and  [model/dao/ProductDAO.cfc:L304]
//         Both sit inside the saveImportData / loadDataFromFile
//         post-processing path, which this port declares but does not
//         exercise. They are cited below only as the evidence for the
//         case-folding requirement, and no fragment is emitted for them.
//       [model/dao/PhysicalDAO.cfc:L121]
//         Out of scope, but cited on the LIKE fragment because it proves the
//         unanchored match there is a house pattern rather than a slip.
//       Every other census hit is out of scope for this port: the versioned
//       update scripts under config/scripts/**, the legacy content-bridge
//       handler, DataDAO, ReportDAO, SubscriptionDAO, UpdateService, the
//       framework's own reporting component under org/Hibachi/**, and the
//       admin diagnostics view.
//
// WHAT IS DELIBERATELY ABSENT
//   * The database driver. This module knows nothing of `mysql2`; connections
//     and pooling belong to `src/repositories/mysql/connection.ts`.
//   * Any `process.env` read. The environment is `src/lib/config.ts`'s alone.
//   * A schema-validation library, an environment loader, and the decimal
//     library. There is no value to validate beyond one enumeration, no file to
//     load, and no arithmetic here.
//   * A structured-logging call. `src/lib/logger.ts` exists and would have been
//     the only legal way to log, but it is not among this file's declared
//     dependencies, so nothing here logs. The failures below are thrown, and a
//     thrown error carries its own diagnosis - see the error classes.
//   * Any CREATE, ALTER or DROP text of any kind. Schema continuity is
//     absolute: this port reads and writes the existing `Sw*` tables exactly as
//     they already are, so this module emits no schema-management statement and
//     no migration helper.
//   * Any bound VALUE. Every fragment below is SQL text composed from
//     identifiers and placeholders only. A value reaches the database through a
//     `?` placeholder in a prepared statement, which is what preserves the
//     injection-safety property that the legacy `cfqueryparam` provided.
//
// LAYER POSITION
//   `src/repositories/mysql/**` is a secondary adapter. It may import from
//   `src/lib/**` and `src/domain/**`, and it does import from `src/lib/**`.
//   Nothing under `src/domain/**` may import this module: the domain imports
//   nothing outward, and that boundary is a lint error rather than a
//   convention.
//
// THE BINDING STANDARD
//   No user-specified rules were provided for this project - the rules source
//   returns "No user rules provided." Their absence is not licence to lower the
//   bar and no rule has been invented to fill it. The enterprise substitute
//   standard applies at full strength; the practices that bear on this file are
//   maximal TypeScript strictness (no `any`, no suppression comment, no
//   non-null assertion), one cohesive exported surface with no barrel and no
//   re-export, exclusively parameterized SQL, environment-driven configuration
//   with no hardcoded credential, and an in-code annotation at every judgment
//   call and every preserved defect.
//
// TEST COVERAGE
//   Net-new, and stated here rather than authored here. No legacy test touches
//   dialect resolution: the only legacy suites extended anywhere in this port
//   are `meta/tests/unit/entity/BrandTest.cfc` and
//   `meta/tests/unit/entity/ProductTest.cfc`. The obligations this module
//   carries are (a) all three legacy MySQL spellings canonicalize to `MySQL`,
//   (b) an unrecognized value throws and never falls back, (c) each of the two
//   unimplemented dialects is refused by name at each of the three fragment
//   accessors, and (d) each fragment's text matches its cited legacy arm
//   verbatim. Every branch here is reachable without a database and without
//   touching global state, because the dialect arrives as a parameter.
// ---------------------------------------------------------------------------

import type { DatabaseDialect as ConfiguredDatabaseDialect } from '../../lib/config.js';
import { appConfig } from '../../lib/config.js';

// --- The canonical dialect ---------------------------------------------------

/**
 * The ORM dialect, restricted to the three spellings the legacy host could
 * produce.
 *
 * CFML parity [config/configORM.cfm:L10,L12,L14]: the three literals are
 * verbatim from the three assignments the legacy probe made, and they match the
 * accepted values documented against DB_DIALECT in `slatwall-ts/.env.example`
 * exactly, capitalization included. The capitalization is significant to a
 * reader comparing the two trees, which is why it is preserved rather than
 * normalized to a TypeScript-idiomatic casing.
 *
 * JUDGMENT CALL: this union is declared here rather than re-exported from
 * `src/lib/config.ts`, because the project standard forbids re-exporting
 * another module's symbol - that is how barrels appear. Declaring it twice
 * would ordinarily invite drift, so `DialectRoster` below turns any divergence
 * between the two declarations into a compile error instead of a latent bug.
 */
export type DatabaseDialect = 'MySQL' | 'MicrosoftSQLServer' | 'Oracle10g';

/**
 * The roster type: simultaneously an exhaustiveness requirement and a
 * compile-time proof that this module's `DatabaseDialect` and the one exported
 * by `src/lib/config.ts` describe the SAME set of literals.
 *
 * Two properties do the work, and both directions are covered:
 *
 *   * The key is mapped over the UNION OF BOTH unions, so `DIALECT_ROSTER` must
 *     carry an entry for every member of either. Add a dialect on either side
 *     and the object literal below is missing a key.
 *   * The value is the INTERSECTION of the key with both unions. Remove or
 *     misspell a dialect on either side and that intersection collapses to
 *     `never`, so the literal below is no longer assignable.
 *
 * This is why `ConfiguredDatabaseDialect` is imported at all. It is a
 * type-only import, so nothing survives into the emitted bundle.
 */
type DialectRoster = {
  readonly [D in DatabaseDialect | ConfiguredDatabaseDialect]: D &
    DatabaseDialect &
    ConfiguredDatabaseDialect;
};

/**
 * The three canonical spellings, held once as values.
 *
 * Every other constant in this module is derived from this object, so the
 * accepted set, the text of the failure message and the MySQL comparison
 * literal cannot drift apart.
 */
const DIALECT_ROSTER: DialectRoster = {
  MySQL: 'MySQL',
  MicrosoftSQLServer: 'MicrosoftSQLServer',
  Oracle10g: 'Oracle10g',
};

/**
 * The canonical spellings in the order the legacy probe tested them:
 * MySQL FIRST, then Microsoft SQL Server, then Oracle.
 *
 * CFML parity [config/configORM.cfm:L9,L11,L13]: the probe's ordering was
 * load-bearing there, because `findNoCase` performed SUBSTRING matching and a
 * product name could in principle satisfy more than one test. This module
 * matches on equality, so ordering can no longer change an outcome; it is
 * preserved anyway because this list is what an operator reads in a failure
 * message, and reading it in the legacy order is what makes the two trees
 * comparable.
 */
const CANONICAL_DIALECTS: readonly DatabaseDialect[] = Object.values(DIALECT_ROSTER);

/**
 * Case-folded spelling to canonical spelling.
 *
 * JUDGMENT CALL: case folding is not a convenience here, it is a correctness
 * requirement, and the legacy source proves it. The dialect literal is spelled
 * THREE different ways across the comparison sites:
 *
 *     "MySQL"  [config/configORM.cfm:L10]      the setter, and
 *              [model/dao/PromotionDAO.cfc:L482]
 *     "mySQL"  [model/dao/PriceGroupDAO.cfc:L57]
 *     "mySql"  [model/dao/ProductDAO.cfc:L304]  a third spelling
 *
 * Every one of those comparisons succeeded in the legacy runtime only because
 * the CFML `eq` operator is case-INSENSITIVE. A TypeScript `===` against the
 * canonical spelling would fail on two of the three. Folding is therefore done
 * explicitly, through this map - never with a loose equality operator, which
 * the lint profile rejects outright and which would not help in any case.
 *
 * The fold is locale-invariant `toLowerCase`, which is correct because every
 * canonical literal is ASCII. A locale-sensitive fold would misbehave on the
 * letter `I` in a Turkish locale.
 */
const CANONICAL_DIALECT_BY_FOLDED_SPELLING: ReadonlyMap<string, DatabaseDialect> = new Map(
  CANONICAL_DIALECTS.map((dialect) => [dialect.toLowerCase(), dialect]),
);

/** The accepted set, rendered once for failure messages. */
const ACCEPTED_DIALECTS_TEXT = CANONICAL_DIALECTS.join(' | ');

/**
 * The environment variable this module's value ultimately comes from.
 *
 * Named in failure messages so that an operator is pointed at the thing they
 * can actually change. It matches `slatwall-ts/.env.example` exactly; this
 * module reads no variable itself and reads no variable that the committed
 * contract does not declare.
 */
const DIALECT_VARIABLE_NAME = 'DB_DIALECT';

// --- The legacy sites, named once --------------------------------------------
// Each fragment accessor refuses an unimplemented dialect by naming the exact
// legacy site whose SQL it would otherwise have had to emit. Holding the names
// as constants keeps the message and the citation from drifting apart.

/** Site 1: the materialized-path LIKE concatenation inside a JOIN ON clause. */
const MATERIALIZED_ID_PATH_SITE =
  'model/dao/PromotionDAO.cfc:L482-L488 (productTypeIDPath LIKE concatenation)';

/** Site 2: single-row limiting inside getAccountSubscriptionPriceGroups. */
const SINGLE_ROW_LIMIT_SITE =
  'model/dao/PriceGroupDAO.cfc:L57-L89 (getAccountSubscriptionPriceGroups row limiting)';

/** Site 3: the option-group positional-weight ORDER BY. */
const OPTION_GROUP_ODOMETER_SITE =
  'model/dao/SkuDAO.cfc:L194-L198 (getSortedProductSkusID option-group positional weight)';

// --- Failure reporting -------------------------------------------------------
// Three distinct faults, three distinct types, following the pattern already
// established by `src/lib/config.ts`: the classes are NOT exported, because
// this module exposes one cohesive surface and an error type is not part of a
// caller's vocabulary. Each is identifiable at runtime by `error.name`, and
// each carries its structured detail as a readonly property.
//
// No message produced by any of them can contain a credential or a connection
// string. That is structural rather than a matter of care. This module never
// reads, holds or is passed a host, account, password or DSN at all; the ONLY
// external input that reaches a message is the rejected dialect value, and it is
// clipped first. Caller-supplied SQL text is refused without being reproduced,
// so even a fragment argument cannot leak through a message.

/**
 * The configured dialect is not one of the three recognized spellings.
 *
 * CFML parity [config/configORM.cfm:L15]: the legacy conditional chain closed
 * with a bare `</cfif>` and NO `<cfelse>`, so an unrecognized product name left
 * the dialect UNSET rather than falling back to a guess; and the probe's own
 * failure path at [config/configORM.cfm:L4-L7] ended in an outright
 * `<cfabort/>`. Missing or invalid database configuration was a hard startup
 * error, never a degraded mode. Throwing here is what preserves that.
 */
class UnrecognizedDialectError extends Error {
  /** The rejected value, clipped and quoted exactly as it appears in `message`. */
  readonly received: string;

  constructor(received: string) {
    super(
      [
        `${DIALECT_VARIABLE_NAME} is not a recognized database dialect; received ${received}.`,
        `Accepted values are ${ACCEPTED_DIALECTS_TEXT}, matched without regard to case and then`,
        'normalized to that exact spelling.',
        'There is deliberately no default and no fallback: the legacy dialect chain at',
        'config/configORM.cfm:L9-L15 ends with no <cfelse>, and its datasource probe aborted',
        'outright at config/configORM.cfm:L4-L7.',
        `The contract for ${DIALECT_VARIABLE_NAME} is committed in slatwall-ts/.env.example.`,
      ].join(' '),
    );
    // Assigned here rather than as a class field so that no `override` modifier
    // is required on a property the base class declares as mutable.
    this.name = 'UnrecognizedDialectError';
    this.received = received;
  }
}

/**
 * The dialect is valid but its SQL arm is not implemented by this port.
 *
 * JUDGMENT CALL: the dialect stays PARAMETERIZED even though only one branch is
 * implemented. Hardcoding MySQL would erase the three live branch sites
 * enumerated in this file's header, and with them the evidence that the legacy
 * queries were dialect-sensitive at all. So all three spellings are recognized,
 * and the two unimplemented arms are refused loudly at the point of use rather
 * than stubbed with SQL that would be silently wrong for the engine it names.
 */
class UnsupportedDialectError extends Error {
  /** The recognized-but-unimplemented dialect that was requested. */
  readonly dialect: DatabaseDialect;

  /** The legacy site whose SQL arm would have been required. */
  readonly site: string;

  constructor(dialect: DatabaseDialect, site: string) {
    super(
      [
        `Dialect ${dialect} is recognized but not implemented by this port; only`,
        `${DIALECT_ROSTER.MySQL} is.`,
        `The SQL arm requested was ${site}.`,
        'The legacy source does carry that arm, so it is reproducible, but reproducing it is out',
        'of scope here and emitting the MySQL text under another dialect would be silently wrong.',
        `Set ${DIALECT_VARIABLE_NAME}=${DIALECT_ROSTER.MySQL}, or implement the arm explicitly.`,
      ].join(' '),
    );
    this.name = 'UnsupportedDialectError';
    this.dialect = dialect;
    this.site = site;
  }
}

/**
 * A caller passed something that is not admissible as SQL fragment input.
 *
 * This guards the one thing this module cannot verify by type alone: the SQL
 * text handed to it by a composing repository. The project standard is that
 * every VALUE reaches the database as a `?` placeholder in a prepared
 * statement - the direct equivalent of the legacy `cfqueryparam` - so the only
 * things a fragment may be given are identifiers and placeholders. The
 * validators below enforce that structurally, and this error reports a
 * violation as the programming fault it is.
 */
class SqlFragmentInputError extends Error {
  /** The parameter that was rejected. */
  readonly parameterName: string;

  /** The legacy site whose fragment was being composed. */
  readonly site: string;

  constructor(parameterName: string, site: string, requirement: string) {
    super(
      [
        `Cannot compose the SQL fragment for ${site}: the ${parameterName} argument is not`,
        `admissible. ${requirement}`,
        'A fragment argument is SQL TEXT, never a value: bind every value as a ? placeholder in',
        'the prepared statement instead.',
        'The rejected argument is not echoed here, because it is caller-supplied SQL text.',
      ].join(' '),
    );
    this.name = 'SqlFragmentInputError';
    this.parameterName = parameterName;
    this.site = site;
  }
}

// --- Bounded echo of a rejected configuration value --------------------------

/** How much of a rejected dialect value is echoed back in a failure message. */
const MAX_ECHOED_VALUE_LENGTH = 40;

/**
 * Quotes and clips a rejected dialect value for inclusion in a message.
 *
 * The echo is deliberate and bounded. DB_DIALECT is not a credential - it is an
 * enumeration - and an operator who mistyped it needs to see what was actually
 * read; `src/lib/config.ts` echoes the same variable for the same reason. The
 * clip is what keeps the echo bounded if something unexpected was pasted into
 * the variable, and it is the reason this helper exists rather than the value
 * being interpolated directly.
 *
 * Nothing else in this module is ever echoed. In particular the credential
 * group - DB_HOST, DB_USER, DB_PASSWORD - is not reachable from here at all,
 * and caller-supplied SQL text is refused without being reproduced.
 */
function describeRejectedValue(raw: string): string {
  const clipped =
    raw.length > MAX_ECHOED_VALUE_LENGTH ? `${raw.slice(0, MAX_ECHOED_VALUE_LENGTH)}...` : raw;

  return JSON.stringify(clipped);
}

// --- Structural admissibility of SQL fragment input --------------------------

/**
 * A bare or dot-qualified SQL identifier reference, and nothing else.
 *
 * Deliberately narrow: an unquoted identifier optionally qualified by table or
 * schema, as in `SwPromoRewardProductType.productTypeID`. No quoting, no
 * backtick, no whitespace, no operator, no literal, no statement separator and
 * no comment marker can satisfy it, so nothing that is not an identifier can
 * pass through the identifier slot of a fragment.
 */
const SQL_IDENTIFIER_REFERENCE_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]*(?:\.[A-Za-z_][A-Za-z0-9_$]*)*$/;

/**
 * The characters admissible in a numeric SQL expression handed to a fragment:
 * identifier characters, digits, `?` placeholders, parentheses, `+`, `-` and
 * spaces.
 *
 * Note what is excluded by construction. There is no quote character, so no
 * string literal can appear. There is no `;`, so no statement can be appended.
 * There is no `*` and no `/`, so the `/* ... *\/` comment form cannot be
 * spelled at all - which leaves `--` as the only comment marker to test for
 * separately.
 */
const SQL_NUMERIC_EXPRESSION_PATTERN = /^[A-Za-z0-9_$.?+() -]+$/;

/** The only comment marker spellable within the admissible character set. */
const SQL_LINE_COMMENT_MARKER = '--';

/**
 * Requires that `columnReference` is a bare or dot-qualified column reference.
 *
 * @param columnReference - SQL identifier text supplied by the composing
 *   repository. It is an IDENTIFIER, not a bound value, and it must never
 *   originate in a request: identifiers cannot be parameterized, so the only
 *   safe source is a literal in the repository that owns the query.
 * @param parameterName - The caller's parameter name, for the failure message.
 * @param site - The legacy site whose fragment is being composed.
 * @throws An error named `SqlFragmentInputError` when the text is not a bare or
 *   dot-qualified identifier.
 */
function requireSqlIdentifierReference(
  columnReference: string,
  parameterName: string,
  site: string,
): void {
  if (!SQL_IDENTIFIER_REFERENCE_PATTERN.test(columnReference)) {
    throw new SqlFragmentInputError(
      parameterName,
      site,
      'It must be a bare or dot-qualified SQL identifier, such as MyTable.myColumn, containing only letters, digits, underscore and dollar, with no quoting, whitespace, operator or literal.',
    );
  }
}

/**
 * Requires that `expression` is a numeric SQL expression over identifiers and
 * `?` placeholders.
 *
 * Be precise about what this does and does not prove. It confines the text to a
 * character set in which no string literal, statement separator or comment can
 * be spelled. It CANNOT tell a numeric literal apart from part of an
 * identifier, because digits are legitimate inside identifiers, so it does not
 * detect a value that was interpolated instead of bound. Binding every value as
 * a `?` placeholder therefore remains the composing repository's obligation;
 * this guard bounds the damage, it does not discharge that obligation.
 *
 * @param expression - SQL expression text supplied by the composing repository.
 *   Every VALUE inside it must already be a `?` placeholder.
 * @param parameterName - The caller's parameter name, for the failure message.
 * @param site - The legacy site whose fragment is being composed.
 * @throws An error named `SqlFragmentInputError` when the text falls outside
 *   the admissible character set or contains a line-comment marker.
 */
function requireSqlNumericExpression(
  expression: string,
  parameterName: string,
  site: string,
): void {
  const requirement =
    'It must be a numeric SQL expression built only from identifiers, digits, ? placeholders, parentheses, +, - and spaces, with no quoting, no statement separator and no comment marker.';

  if (!SQL_NUMERIC_EXPRESSION_PATTERN.test(expression)) {
    throw new SqlFragmentInputError(parameterName, site, requirement);
  }

  if (expression.includes(SQL_LINE_COMMENT_MARKER)) {
    throw new SqlFragmentInputError(parameterName, site, requirement);
  }
}

// --- Resolution ---------------------------------------------------------------

/**
 * Canonicalizes a dialect spelling, or refuses it.
 *
 * Accepts any casing of the three recognized spellings and returns the exact
 * canonical form. It NEVER returns a default: an unrecognized value throws.
 *
 * CFML parity [config/configORM.cfm:L9,L11,L13]: the legacy probe matched with
 * `findNoCase`, which is case-insensitive SUBSTRING matching against a
 * driver-reported product name - the right tool when the input was discovered
 * rather than stated, because a MySQL server reports something like a version
 * banner rather than the bare word.
 *
 * JUDGMENT CALL: this module compares against an exact, validated enumeration
 * instead. Because the value is now STATED in configuration rather than probed,
 * case-insensitive EQUALITY is the faithful port of the same intent, and it is
 * the stricter of the two readings in both directions: substring matching would
 * have accepted any string that merely contained `Oracle`, and this accepts the
 * exact spelling `MicrosoftSQLServer` in any casing. The narrowing removes a
 * class of accidental match and loses nothing that was reachable in practice.
 *
 * The input is trimmed before folding, matching how the environment contract is
 * read upstream, where a blank value and an unset variable are one state - the
 * CFML `len()`-based truthiness the legacy configuration was written against.
 *
 * @param rawDialect - A dialect spelling in any casing. This parameter accepts
 *   the raw legacy spellings too, which is the point: the legacy comparison
 *   sites spell the MySQL literal three different ways.
 * @returns The canonical spelling.
 * @throws An error named `UnrecognizedDialectError` when the value is not one of
 *   the three recognized dialects. There is no fallback.
 */
export function resolveDialect(rawDialect: string): DatabaseDialect {
  const canonical = CANONICAL_DIALECT_BY_FOLDED_SPELLING.get(rawDialect.trim().toLowerCase());

  if (canonical === undefined) {
    throw new UnrecognizedDialectError(describeRejectedValue(rawDialect));
  }

  return canonical;
}

/**
 * The dialect this process is configured for.
 *
 * Reads the validated value from `src/lib/config.ts` and passes it through
 * `resolveDialect`. That second pass is the narrow exhaustiveness guard the
 * scope split allows, and it is not redundant: `src/lib/config.ts` guarantees
 * only that the value is one of the spellings IT recognizes, so routing it
 * through this module's own roster is what turns a future divergence between
 * the two modules into a loud failure instead of an unhandled branch. The
 * `DialectRoster` proof makes such a divergence a compile error first; this is
 * the runtime backstop behind it.
 *
 * It performs no environment read of its own. `src/lib/config.ts` owns
 * `process.env`, validates on first access, and memoizes the result, so calling
 * this repeatedly re-reads nothing.
 *
 * CFML parity [Application.cfc:L87]: the legacy equivalent of this accessor was
 * `getApplicationValue("databaseType")`, read back from the value published
 * once per application start. This is the same read, with the ambient
 * application scope replaced by an explicit module boundary.
 *
 * @returns The canonical configured dialect. All three are returned here; the
 *   two unimplemented ones are refused by `assertMySqlDialect` at the point a
 *   fragment is actually needed, which is what keeps a misconfiguration
 *   distinguishable from an unimplemented feature.
 * @throws An error named `ConfigurationError`, raised by `src/lib/config.ts`,
 *   when the environment contract is unsatisfied; or one named
 *   `UnrecognizedDialectError` if a value it accepted is unknown here.
 */
export function resolveConfiguredDialect(): DatabaseDialect {
  return resolveDialect(appConfig.load().dialect);
}

/**
 * Narrows `dialect` to `MySQL`, or refuses the request.
 *
 * This is the MySQL-only guard, and it is the single place the port's engine
 * narrowing is enforced. Every fragment accessor below calls it first, so no
 * accessor can return text for an engine it does not implement, and callers
 * outside this module may call it directly to fail early.
 *
 * @param dialect - The resolved dialect to check.
 * @param site - The legacy site whose SQL arm is being requested. It appears
 *   verbatim in the failure message, so a refusal points at the exact query
 *   that would have needed the missing arm.
 * @throws An error named `UnsupportedDialectError` when `dialect` is
 *   `MicrosoftSQLServer` or `Oracle10g`. Those arms are neither implemented nor
 *   stubbed: emitting MySQL text under another dialect's name would be silently
 *   wrong, and a silently wrong query is worse than a refused one.
 */
export function assertMySqlDialect(
  dialect: DatabaseDialect,
  site: string,
): asserts dialect is 'MySQL' {
  if (dialect === DIALECT_ROSTER.MySQL) {
    return;
  }

  throw new UnsupportedDialectError(dialect, site);
}

// --- Site 1: the materialized-path LIKE pattern ------------------------------

/**
 * The MySQL pattern expression for a materialized-ID-path `LIKE` test.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L482-L488]: the legacy branch sits
 * inside a JOIN's `ON` clause - not a `WHERE` - and differs across engines only
 * in how the three pieces are concatenated:
 *
 *     MySQL      concat('%', SwPromoRewardProductType.productTypeID, '%')
 *     Oracle10g  ('%' || SwPromoRewardProductType.productTypeID || '%')
 *     otherwise  ('%' + SwPromoRewardProductType.productTypeID + '%')
 *
 * This returns the MySQL arm verbatim. The two literal `'%'` wildcards are part
 * of the SQL text, exactly as they are in the legacy source; they are not
 * values and are not parameterized, and the column reference is an identifier,
 * which cannot be parameterized either.
 *
 * LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L483]: the pattern is an UNANCHORED
 * substring match over a COMMA-DELIMITED materialized path, so a path segment
 * matches on any substring occurrence rather than on whole-element membership.
 * Preserved deliberately; do not fix without a product decision.
 *
 * Three things follow, and all three are deliberate:
 *
 *   * Do NOT substitute `FIND_IN_SET`, and do NOT anchor the wildcards with
 *     commas. Either change would alter which rows the JOIN produces, and this
 *     query feeds sale-price reward resolution, so a changed row set changes
 *     money.
 *   * The identical idiom appears at [model/dao/PhysicalDAO.cfc:L121], which is
 *     out of scope for this port. Two independent occurrences make this a house
 *     pattern rather than an isolated slip, which is the strongest argument for
 *     reproducing it faithfully rather than reading it as a typo.
 *   * It diverges on purpose from the TypeScript side. Path membership computed
 *     in `src/domain/valueObjects/materializedIdPath.ts` is DELIMITER-AWARE, so
 *     the two mechanisms are deliberately NOT equivalent. Neither is changed to
 *     match the other: the domain keeps the correct membership test, and this
 *     SQL keeps the legacy one.
 *
 * @param dialect - The resolved dialect. Passed explicitly rather than read
 *   from ambient state, so a caller cannot compose a fragment for one engine
 *   while believing it is configured for another.
 * @param columnReference - The path-segment column to match, as a bare or
 *   dot-qualified SQL IDENTIFIER - for this site,
 *   `SwPromoRewardProductType.productTypeID`. It must be a literal owned by the
 *   composing repository and must never originate in a request: an identifier
 *   cannot be bound as a `?` placeholder, so it is structurally validated
 *   instead.
 * @returns The MySQL pattern expression, ready to follow a `LIKE` keyword.
 * @throws An error named `UnsupportedDialectError` for a non-MySQL dialect, or
 *   one named `SqlFragmentInputError` when the column reference is not a bare or
 *   dot-qualified identifier.
 */
export function materializedIdPathLikePatternFragment(
  dialect: DatabaseDialect,
  columnReference: string,
): string {
  assertMySqlDialect(dialect, MATERIALIZED_ID_PATH_SITE);
  requireSqlIdentifierReference(columnReference, 'columnReference', MATERIALIZED_ID_PATH_SITE);

  return `concat('%', ${columnReference}, '%')`;
}

// --- Site 2: single-row limiting ---------------------------------------------

/**
 * The two positions in which single-row limiting is spelled.
 *
 * A pair rather than one string, because the engines put the limit in different
 * places: MySQL appends a trailing clause, whereas the fallback arm modifies
 * the SELECT list. Modelling both positions is what lets one statement template
 * serve either arm without the template being rewritten.
 */
export interface SingleRowLimitFragments {
  /**
   * Text to place immediately after `SELECT`, before the select list. Empty for
   * MySQL, which does not limit there.
   */
  readonly selectPrefix: string;

  /**
   * Text to append after the `ORDER BY` clause. `LIMIT 1` for MySQL.
   */
  readonly trailingClause: string;
}

/**
 * The MySQL arm, frozen so a caller cannot mutate the shared value.
 *
 * CFML parity [model/dao/PriceGroupDAO.cfc:L67-L71]: the MySQL query ends
 * `ORDER BY changeDateTime DESC LIMIT 1`, so the limit is a trailing clause and
 * the select list is untouched.
 */
const MYSQL_SINGLE_ROW_LIMIT_FRAGMENTS: SingleRowLimitFragments = Object.freeze({
  selectPrefix: '',
  trailingClause: 'LIMIT 1',
});

/**
 * Single-row limiting for the account-subscription price-group query.
 *
 * CFML parity [model/dao/PriceGroupDAO.cfc:L57-L89]: the function carries two
 * `<cfquery>` bodies whose text is otherwise identical - the ONLY difference
 * between them is how one row is taken from the correlated subquery:
 *
 *     MySQL      [L67-L71]  SELECT systemCode FROM ...
 *                           ORDER BY changeDateTime DESC LIMIT 1
 *     otherwise  [L83-L87]  SELECT TOP 1 systemCode FROM ...
 *                           ORDER BY changeDateTime DESC
 *
 * That is why this returns a pair: `TOP 1` is a select-list prefix while
 * `LIMIT 1` is a trailing clause, so the two arms occupy different positions in
 * the same statement.
 *
 * The row count is fixed at one and is deliberately not a parameter. Both
 * legacy arms hardcode it, so making it configurable would invent a capability
 * the source does not have - and a row count is a VALUE, which this module does
 * not emit.
 *
 * JUDGMENT CALL: the comparison at [model/dao/PriceGroupDAO.cfc:L57] tests the
 * literal `"mySQL"`, not the canonical `"MySQL"` that
 * [config/configORM.cfm:L10] assigned. That mismatch is invisible in CFML,
 * whose `eq` is case-insensitive, and is precisely why `resolveDialect` folds
 * case rather than comparing with `===` against the canonical spelling.
 *
 * The query this serves reaches subscription-owned tables, which are otherwise
 * outside this port. That reach-through is deliberate and read-only - account
 * price-group resolution is not reproducible without it - and no subscription
 * business logic is ported. It is documented at the repository port that owns
 * the query, not here; this module contributes only the limiting text.
 *
 * @param dialect - The resolved dialect.
 * @returns The MySQL limiting pair: no select-list prefix, and `LIMIT 1` as the
 *   trailing clause.
 * @throws An error named `UnsupportedDialectError` for a non-MySQL dialect. The
 *   `TOP 1` arm exists in the legacy source and is therefore reproducible, but
 *   it is not implemented here.
 */
export function singleRowLimitFragments(dialect: DatabaseDialect): SingleRowLimitFragments {
  assertMySqlDialect(dialect, SINGLE_ROW_LIMIT_SITE);

  return MYSQL_SINGLE_ROW_LIMIT_FRAGMENTS;
}

// --- Site 3: the option-group positional-weight odometer ---------------------

/**
 * The MySQL positional-weight term for sorted SKU retrieval.
 *
 * This is the third live dialect branch, and the one the root manifests do not
 * name. It backs a must-preserve behaviour: the option-group odometer ordering
 * that `getSortedProductSkus` depends on, where each option group contributes a
 * digit whose significance is its distance from the highest option-group sort
 * order. Get the term wrong and SKUs come back in a different order.
 *
 * CFML parity [model/dao/SkuDAO.cfc:L194-L198]: inside `getSortedProductSkusID`
 * - whose true span is L172-L202 - the `ORDER BY` has two arms that differ only
 * in casting:
 *
 *     MicrosoftSQLServer  SUM(SwOption.sortOrder
 *                             * POWER(CAST(10 as bigint),
 *                                     CAST((<next> - SwOptionGroup.sortOrder) as bigint))) ASC
 *     otherwise           SUM(SwOption.sortOrder
 *                             * POWER(10, <next> - SwOptionGroup.sortOrder)) ASC
 *
 * This returns the `POWER(...)` call of the second arm: base `10` unwrapped and
 * exponent unwrapped, with NEITHER `CAST` applied. The SQL Server arm exists in
 * the legacy source and is deliberately unreachable in a MySQL-only target -
 * `assertMySqlDialect` refuses it rather than this module emitting the plain
 * form under the SQL Server name, which would be the one mistake that silently
 * changes the ordering on that engine.
 *
 * A locator note, per the standing instruction to trust the file over a cited
 * line number: the plan cites this function as L172-L220. The function actually
 * ends at L202; L204 onward is `getNextOptionGroupSortOrder`, and L222 onward is
 * `clearNextOptionGroupSortOrder`. The branch itself is at L194-L198 as cited.
 *
 * TODO [model/dao/SkuDAO.cfc:L177]: the legacy source carries this comment
 * immediately above the query - "test to see if this query works with DB's
 * other than MSSQL and MySQL". It is carried forward here verbatim and NOT
 * completed: the untested engines are exactly the ones this port does not
 * implement, so closing it would require implementing and testing an arm that
 * is out of scope. Do not delete it without doing that work.
 *
 * @param dialect - The resolved dialect.
 * @param exponentExpression - The exponent, as SQL expression TEXT over
 *   identifiers and `?` placeholders. For this site the composing repository
 *   passes `? - SwOptionGroup.sortOrder`, binding the next option-group sort
 *   order as a placeholder. The legacy source interpolated that number directly
 *   into the statement via `#getNextOptionGroupSortOrder()#`; binding it
 *   instead is what carries the `cfqueryparam` guarantee across to every value
 *   in this port. The structural guard on this argument confines it to
 *   identifiers, digits, `?`, parentheses, `+`, `-` and spaces - it cannot tell
 *   an interpolated number from part of an identifier, so binding remains the
 *   caller's obligation rather than something this module can verify.
 * @returns The MySQL `POWER` term, to be multiplied by the option sort order
 *   inside the caller's `SUM(...)`.
 * @throws An error named `UnsupportedDialectError` for a non-MySQL dialect, or
 *   one named `SqlFragmentInputError` when the exponent expression falls outside
 *   the admissible character set or contains a comment marker.
 */
export function optionGroupOdometerPowerFragment(
  dialect: DatabaseDialect,
  exponentExpression: string,
): string {
  assertMySqlDialect(dialect, OPTION_GROUP_ODOMETER_SITE);
  requireSqlNumericExpression(exponentExpression, 'exponentExpression', OPTION_GROUP_ODOMETER_SITE);

  return `POWER(10, ${exponentExpression})`;
}
