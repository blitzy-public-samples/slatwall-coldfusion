/**
 * Database dialect resolution and the dialect-specific SQL fragments.
 *
 * Replaces the runtime probe at [config/configORM.cfm:L3-L15], which read the datasource product
 * name and mapped it to a Hibernate dialect, with explicit configuration.
 */
import type { DatabaseDialect as ConfiguredDatabaseDialect } from '../../lib/config.js';
import { appConfig } from '../../lib/config.js';

/**
 * The dialect spellings, verbatim from [config/configORM.cfm:L10], [config/configORM.cfm:L12] and
 * [config/configORM.cfm:L14].
 *
 * `src/lib/config.ts` declares a union of the same name, derived from its own `DATABASE_DIALECTS`
 * array: it SUPPLIES the configured spelling and this module INTERPRETS it. The two declarations are
 * deliberately independent rather than shared, because that is what makes them reconcilable - the
 * `DialectRoster` below and the `connection.ts` seam turn any divergence between them into a compile
 * error instead of a silent agreement.
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

// LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L483]: the reward join matches a product-type
// identifier against `productTypeIDPath` with an unanchored, delimiter-unaware `LIKE`, so any
// substring occurrence in the path counts as membership.
// Preserved deliberately; do not fix without a product decision.
const MATERIALIZED_ID_PATH_SITE =
  'model/dao/PromotionDAO.cfc:L482-L488 (productTypeIDPath LIKE concatenation)';

// LEGACY-NOTE [model/dao/PriceGroupDAO.cfc:L57-L89]: the MySQL arm limits the subquery with a
// trailing `LIMIT 1` while the other arm uses a leading `SELECT TOP 1`, so the two are not
// textually interchangeable and the fragment is returned as a prefix/suffix pair.
const SINGLE_ROW_LIMIT_SITE =
  'model/dao/PriceGroupDAO.cfc:L57-L89 (getAccountSubscriptionPriceGroups row limiting)';

// CFML parity [model/dao/SkuDAO.cfc:L194-L198]: the SQL Server arm casts both `POWER` operands to
// bigint while every other dialect uses the bare call, which is the only difference between the
// two legacy branches.
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

// Security constraint: no fragment in this module accepts arbitrary SQL expression text, and none
// may be added.

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

/**
 * Resolve a configured dialect name.
 *
 * Matching ignores case and then normalizes to the legacy spelling
 * [config/configORM.cfm:L1-L15].
 *
 * @param rawDialect the configured dialect name, in any case.
 * @returns the canonical legacy spelling.
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
 * @param dialect the resolved dialect to narrow.
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
 * @param dialect the configured dialect; only MySQL is implemented.
 * @param columnReference the path column, bare or dot-qualified.
 * @returns the MySQL `concat` pattern, for use on the right of a `LIKE`.
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
 * @param dialect the configured dialect; only MySQL is implemented.
 * @returns the prefix to place after `SELECT` and the clause to append.
 * @throws when the dialect is not MySQL.
 */
export function singleRowLimitFragments(dialect: DatabaseDialect): SingleRowLimitFragments {
  assertMySqlDialect(dialect, SINGLE_ROW_LIMIT_SITE);

  return MYSQL_SINGLE_ROW_LIMIT_FRAGMENTS;
}

/**
 * TODO [model/dao/SkuDAO.cfc:L177]: the legacy source carries this comment immediately above the
 * query - "test to see if this query works with DB's other than MSSQL and MySQL".
 *
 * @param dialect the resolved dialect; only MySQL composes this fragment.
 * @param sortOrderColumnReference The option-group sort-order COLUMN, as a bare or dot-qualified
 * identifier; the composing repository passes `SwOptionGroup.sortOrder`.
 * @returns The MySQL `POWER` term, to be multiplied by the option sort order inside the caller's
 * `SUM(...)`.
 * @throws `UnsupportedDialectError` for a non-MySQL dialect, or `SqlFragmentInputError` when the
 * column reference is not an identifier.
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
