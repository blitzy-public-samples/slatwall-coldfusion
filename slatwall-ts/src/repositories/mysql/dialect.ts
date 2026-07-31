/**
 * Database dialect resolution and the dialect-specific SQL fragments.
 *
 * Replaces the runtime probe at [config/configORM.cfm:L3-L15], which read the datasource product
 * name and mapped it to a Hibernate dialect, with explicit configuration. Only the MySQL arm is
 * implemented; the other arms exist in the legacy source and are rejected rather than approximated.
 */

import type { DatabaseDialect as ConfiguredDatabaseDialect } from '../../lib/config.js';
import { appConfig } from '../../lib/config.js';

/**
 * The dialect spellings, carried over verbatim from the legacy mapping
 * [config/configORM.cfm:L10], [config/configORM.cfm:L12] and [config/configORM.cfm:L14].
 */
export type DatabaseDialect = 'MySQL' | 'MicrosoftSQLServer' | 'Oracle10g';

type DialectRoster = {
  readonly [D in DatabaseDialect | ConfiguredDatabaseDialect]: D &
    DatabaseDialect &
    ConfiguredDatabaseDialect;
};

const DIALECT_ROSTER: DialectRoster = {
  MySQL: 'MySQL',
  MicrosoftSQLServer: 'MicrosoftSQLServer',
  Oracle10g: 'Oracle10g',
};

const CANONICAL_DIALECTS: readonly DatabaseDialect[] = Object.values(DIALECT_ROSTER);

const CANONICAL_DIALECT_BY_FOLDED_SPELLING: ReadonlyMap<string, DatabaseDialect> = new Map(
  CANONICAL_DIALECTS.map((dialect) => [dialect.toLowerCase(), dialect]),
);

const ACCEPTED_DIALECTS_TEXT = CANONICAL_DIALECTS.join(' | ');

const DIALECT_VARIABLE_NAME = 'DB_DIALECT';

// LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L483]: the reward join matches a product-type identifier against `productTypeIDPath` with an unanchored, delimiter-unaware `LIKE`, so any substring occurrence in the path counts as membership.
// Preserved deliberately; do not fix without a product decision.
const MATERIALIZED_ID_PATH_SITE =
  'model/dao/PromotionDAO.cfc:L482-L488 (productTypeIDPath LIKE concatenation)';

// LEGACY-NOTE [model/dao/PriceGroupDAO.cfc:L57-L89]: the MySQL arm limits the subquery with a trailing `LIMIT 1` while the other arm uses a leading `SELECT TOP 1`, so the two are not textually interchangeable and the fragment is returned as a prefix/suffix pair.
// Retained to preserve the cited legacy behavior.
const SINGLE_ROW_LIMIT_SITE =
  'model/dao/PriceGroupDAO.cfc:L57-L89 (getAccountSubscriptionPriceGroups row limiting)';

// CFML parity [model/dao/SkuDAO.cfc:L194-L198]: the SQL Server arm casts both `POWER` operands to
// bigint while every other dialect uses the bare call, which is the only difference between the two
// legacy branches.
const OPTION_GROUP_ODOMETER_SITE =
  'model/dao/SkuDAO.cfc:L194-L198 (getSortedProductSkusID option-group positional weight)';

class UnrecognizedDialectError extends Error {
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
    this.name = 'UnrecognizedDialectError';
    this.received = received;
  }
}

class UnsupportedDialectError extends Error {
  readonly dialect: DatabaseDialect;

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

class SqlFragmentInputError extends Error {
  readonly parameterName: string;

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

const MAX_ECHOED_VALUE_LENGTH = 40;

function describeRejectedValue(raw: string): string {
  const clipped =
    raw.length > MAX_ECHOED_VALUE_LENGTH ? `${raw.slice(0, MAX_ECHOED_VALUE_LENGTH)}...` : raw;

  return JSON.stringify(clipped);
}

const SQL_IDENTIFIER_REFERENCE_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]*(?:\.[A-Za-z_][A-Za-z0-9_$]*)*$/;

// THERE IS DELIBERATELY NO GENERIC SQL-EXPRESSION INPUT IN THIS MODULE, AND NONE
// MAY BE ADDED.
//
// An earlier revision exported a fragment that accepted arbitrary numeric SQL
// EXPRESSION TEXT, guarded by a character allowlist
// (`/^[A-Za-z0-9_$.?+() -]+$/`) plus a check for the `--` comment marker. The
// allowlist reasoning was that it admits no quote, no `;`, no `*` and no `/`, so
// no string literal, statement separator or block comment can be spelled inside
// it. All of that was true, and all of it was beside the point: SPACES AND
// PARENTHESES WERE ADMITTED, so the character set spells SQL keywords and
// function calls freely. `POWER(10, <caller text>)` with that guard accepts a
// nested `SELECT`, a `CASE`, a `UNION` in a subquery, `SLEEP(...)`, a call to
// `LOAD_FILE`, or `BENCHMARK(...)` - none of which contains a quote, a semicolon
// or a comment marker. A guard that permits arbitrary function invocation inside
// a statement is not an injection guard, it is a syntax filter that reads like
// one, and that is more dangerous than no guard at all because it invites callers
// to trust it.
//
// The replacement is structural rather than lexical: the one fragment that needed
// an exponent now takes an IDENTIFIER (validated by
// `SQL_IDENTIFIER_REFERENCE_PATTERN`, which admits no space and no parenthesis,
// so no keyword or call can be spelled at all) and composes the operator and the
// `?` placeholder itself. The emitted text is byte-identical to what the single
// caller produced before, and the caller no longer has a way to produce anything
// else.
//
// If a future site genuinely needs a different expression SHAPE, add another
// narrow fragment function that composes that shape from validated identifiers -
// do not reintroduce a text parameter with a character-class guard.

// JUDGMENT CALL: A fragment argument is SQL text and cannot be bound, so it is constrained by pattern; every value is bound as a `?` placeholder instead.
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

// --- Resolution ---------------------------------------------------------------

/**
 * Resolve a configured dialect name.
 *
 * Matching ignores case and then normalizes to the legacy spelling. There is deliberately no default:
 * the legacy chain ends without an `<cfelse>` [config/configORM.cfm:L9-L15] and its probe aborted the
 * request outright when the datasource could not be read [config/configORM.cfm:L4-L7].
 *
 * @param rawDialect the configured value.
 * @returns the canonical dialect.
 * @throws when the value names no known dialect.
 */
export function resolveDialect(rawDialect: string): DatabaseDialect {
  const canonical = CANONICAL_DIALECT_BY_FOLDED_SPELLING.get(rawDialect.trim().toLowerCase());

  if (canonical === undefined) {
    throw new UnrecognizedDialectError(describeRejectedValue(rawDialect));
  }

  return canonical;
}

export function resolveConfiguredDialect(): DatabaseDialect {
  return resolveDialect(appConfig.load().dialect);
}

/**
 * Narrow a dialect to MySQL or refuse to continue.
 *
 * @param dialect the resolved dialect.
 * @param site the legacy SQL arm being composed, named in the failure so the gap is attributable.
 * @throws when the dialect is recognized but not implemented here.
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

/**
 * Compose the pattern that tests membership of an identifier in a materialized path.
 *
 * @param dialect the resolved dialect.
 * @param columnReference the path column, as a bare or dot-qualified identifier.
 * @returns the SQL pattern expression.
 * @throws when the dialect is not MySQL, or the reference is not a plain identifier.
 */
export function materializedIdPathLikePatternFragment(
  dialect: DatabaseDialect,
  columnReference: string,
): string {
  assertMySqlDialect(dialect, MATERIALIZED_ID_PATH_SITE);
  requireSqlIdentifierReference(columnReference, 'columnReference', MATERIALIZED_ID_PATH_SITE);

  return `concat('%', ${columnReference}, '%')`;
}

export interface SingleRowLimitFragments {
  readonly selectPrefix: string;

  readonly trailingClause: string;
}

const MYSQL_SINGLE_ROW_LIMIT_FRAGMENTS: SingleRowLimitFragments = Object.freeze({
  selectPrefix: '',
  trailingClause: 'LIMIT 1',
});

/**
 * Compose the fragments that limit a subquery to one row.
 *
 * @param dialect the resolved dialect.
 * @returns the prefix to place after `SELECT` and the clause to append.
 * @throws when the dialect is not MySQL.
 */
export function singleRowLimitFragments(dialect: DatabaseDialect): SingleRowLimitFragments {
  assertMySqlDialect(dialect, SINGLE_ROW_LIMIT_SITE);

  return MYSQL_SINGLE_ROW_LIMIT_FRAGMENTS;
}

/**
 * Compose the positional-weight term that orders SKUs by their option groups.
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
 * THE EXPONENT IS COMPOSED HERE, NOT SUPPLIED AS TEXT. This function used to take
 * the whole exponent as SQL expression text - the caller passed the literal string
 * `? - SwOptionGroup.sortOrder` - guarded only by a character allowlist. That
 * signature was the vulnerability, not the guard: the admitted character set
 * included spaces and parentheses, so it spelled arbitrary function calls and
 * subqueries. The exponent's SHAPE is fixed by the legacy source anyway - a bound
 * value minus one column - so there was never a reason for the caller to describe
 * it in SQL. It now supplies only the column, the operator and the placeholder are
 * literals in this function, and the emitted string is byte-for-byte what the
 * caller produced before.
 *
 * @param dialect - The resolved dialect.
 * @param sortOrderColumnReference - The option-group sort-order COLUMN, as a bare
 *   or dot-qualified identifier; the composing repository passes
 *   `SwOptionGroup.sortOrder`. It is an identifier, not a value, so it cannot be
 *   parameterized and must be a literal in the repository that owns the query.
 *   `requireSqlIdentifierReference` admits no space, no parenthesis, no operator
 *   and no literal, so nothing but an identifier can reach the emitted text.
 *
 *   The value that IS a value - the next option-group sort order - is emitted as a
 *   `?` placeholder by this function and bound by the caller. The legacy source
 *   interpolated that number directly into the statement via
 *   `#getNextOptionGroupSortOrder()#`; binding it instead is what carries the
 *   `cfqueryparam` guarantee across to every value in this port.
 * @returns The MySQL `POWER` term, to be multiplied by the option sort order
 *   inside the caller's `SUM(...)`. The single `?` it contains must be bound by
 *   the caller, in statement order.
 * @throws An error named `UnsupportedDialectError` for a non-MySQL dialect, or
 *   one named `SqlFragmentInputError` when the column reference is not a bare or
 *   dot-qualified identifier.
 */
export function optionGroupOdometerPowerFragment(
  dialect: DatabaseDialect,
  sortOrderColumnReference: string,
): string {
  assertMySqlDialect(dialect, OPTION_GROUP_ODOMETER_SITE);
  requireSqlIdentifierReference(
    sortOrderColumnReference,
    'sortOrderColumnReference',
    OPTION_GROUP_ODOMETER_SITE,
  );

  return `POWER(10, ? - ${sortOrderColumnReference})`;
}
