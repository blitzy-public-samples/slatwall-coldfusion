/**
 * Database dialect resolution and the dialect-specific SQL fragments.
 *
 * Replaces the runtime probe at [config/configORM.cfm:L3-L15], which read the datasource product
 * name and mapped it to a Hibernate dialect, with explicit configuration. Only the MySQL arm is
 * implemented; the other arms exist in the legacy source and are rejected rather than approximated.
 */
import type { DatabaseDialect as ConfiguredDatabaseDialect } from '../../lib/config.js';
import { appConfig } from '../../lib/config.js';

/** The dialect spellings, verbatim from [config/configORM.cfm:L10], [:L12] and [:L14]. */
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

// LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L483]: the reward join matches a product-type
// identifier against `productTypeIDPath` with an unanchored, delimiter-unaware `LIKE`, so any
// substring occurrence in the path counts as membership.
// Preserved deliberately; do not fix without a product decision.
const MATERIALIZED_ID_PATH_SITE =
  'model/dao/PromotionDAO.cfc:L482-L488 (productTypeIDPath LIKE concatenation)';

// LEGACY-NOTE [model/dao/PriceGroupDAO.cfc:L57-L89]: the MySQL arm limits the subquery with a
// trailing `LIMIT 1` while the other arm uses a leading `SELECT TOP 1`, so the two are not
// textually interchangeable and the fragment is returned as a prefix/suffix pair.
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
        'config/configORM.cfm:L9-L15 ends with no <cfelse>, so an unrecognized product name left',
        'the dialect unset and execution continued. Refusing it outright here is a deliberate',
        'improvement on that silent state, not a port of the abort at config/configORM.cfm:L4-L7,',
        'which guarded only the datasource probe.',
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

// SECURITY CONSTRAINT: no fragment in this module accepts arbitrary SQL EXPRESSION TEXT, and none
// may be added. A character allowlist is not an injection guard when it admits spaces and
// parentheses: `POWER(10, <caller text>)` guarded that way still spells a nested `SELECT`, a
// `CASE`, a `UNION` subquery, `SLEEP(...)`, `LOAD_FILE` or `BENCHMARK(...)`, none of which needs a
// quote, a semicolon or a comment marker. Fragments therefore take an IDENTIFIER validated by
// `SQL_IDENTIFIER_REFERENCE_PATTERN`, which admits no space and no parenthesis, and compose the
// operator and the `?` placeholder themselves. A site needing a different expression SHAPE gets
// another narrow fragment function, never a text parameter with a character-class guard.

// JUDGMENT CALL: a fragment argument is SQL text and cannot be bound, so it is constrained by
// pattern; every value is bound as a `?` placeholder instead.
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
 * Matching ignores case and then normalizes to the legacy spelling. There is deliberately no
 * default, and the refusal is stronger than the legacy in one stated respect: the legacy chain ends
 * without an `<cfelse>` [config/configORM.cfm:L9-L15], so an unrecognized product name left
 * `this.ormSettings.dialect` UNSET and the request CONTINUED. Only the datasource probe aborted
 * [config/configORM.cfm:L4-L7], and that abort is a different failure. What is carried over is the
 * absence of a guess; refusing the value outright is a deliberate target improvement on a silent
 * unset state, recorded here in the same terms `src/handlers/bootstrap.ts` uses at its one dialect
 * decision.
 *
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
 * Backs a must-preserve behaviour: the option-group odometer ordering that
 * `getSortedProductSkus` depends on, where each option group contributes a digit
 * whose significance is its distance from the highest option-group sort order.
 *
 * CFML parity [model/dao/SkuDAO.cfc:L194-L198]: inside `getSortedProductSkusID`,
 * whose true span is L172-L202, the `ORDER BY` has two arms differing only in
 * casting:
 *
 *     MicrosoftSQLServer  SUM(SwOption.sortOrder
 *                             * POWER(CAST(10 as bigint),
 *                                     CAST((<next> - SwOptionGroup.sortOrder) as bigint))) ASC
 *     otherwise           SUM(SwOption.sortOrder
 *                             * POWER(10, <next> - SwOptionGroup.sortOrder)) ASC
 *
 * This returns the `POWER(...)` call of the second arm: base `10` and exponent
 * both unwrapped, with NEITHER `CAST` applied. `assertMySqlDialect` refuses the
 * SQL Server dialect rather than emitting this plain form under its name, which
 * would silently change the ordering on that engine.
 *
 * Locator correction: `getSortedProductSkusID` spans L172-L202, not L172-L220;
 * L204 onward is `getNextOptionGroupSortOrder` and L222 onward is
 * `clearNextOptionGroupSortOrder`.
 *
 * TODO [model/dao/SkuDAO.cfc:L177]: the legacy source carries this comment
 * immediately above the query - "test to see if this query works with DB's
 * other than MSSQL and MySQL". It is carried forward here verbatim and NOT
 * completed: the untested engines are exactly the ones this port does not
 * implement, so closing it would require implementing and testing an arm that
 * is out of scope. Do not delete it without doing that work.
 *
 * THE EXPONENT IS COMPOSED HERE, NOT SUPPLIED AS TEXT: its shape is fixed by the
 * legacy source, a bound value minus one column, so the caller supplies only the
 * column while the operator and the placeholder are literals in this function.
 * The legacy interpolated that number directly via
 * `#getNextOptionGroupSortOrder()#`; binding it instead is what carries the
 * `cfqueryparam` guarantee across to every value in this port.
 *
 * @param sortOrderColumnReference - The option-group sort-order COLUMN, as a bare
 *   or dot-qualified identifier; the composing repository passes
 *   `SwOptionGroup.sortOrder`.
 * @returns The MySQL `POWER` term, to be multiplied by the option sort order
 *   inside the caller's `SUM(...)`. Its single `?` is bound by the caller.
 * @throws `UnsupportedDialectError` for a non-MySQL dialect, or
 *   `SqlFragmentInputError` when the column reference is not an identifier.
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
