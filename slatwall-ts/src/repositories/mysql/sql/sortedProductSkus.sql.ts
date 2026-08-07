// slatwall-ts - extracted SQL: the sorted product-SKU identifier statement.
//
// JUDGMENT CALL: the plan cites this statement as `model/dao/SkuDAO.cfc:L172-L220`. Read against
// the file, that span is DRIFT, and it is deliberately not used here.
//
// This is stated so that nobody "corrects" what is already right.
import type { DatabaseDialect } from '../dialect.js';
import { optionGroupOdometerPowerFragment } from '../dialect.js';

/**
 * The option-group sort-order COLUMN of the place-value term, as a dot-qualified identifier.
 *
 * CFML parity [model/dao/SkuDAO.cfc:L197]: the legacy exponent is
 * `#getNextOptionGroupSortOrder()# - SwOptionGroup.sortOrder`.
 */
const ODOMETER_SORT_ORDER_COLUMN = 'SwOptionGroup.sortOrder';

/**
 * A statement ready to hand to a prepared-statement call: the text, and the values to bind to its
 * placeholders in order.
 */
interface SortedProductSkusStatement {
  /**
   * The statement text, with one `?` placeholder per bound value and no interpolated value of any
   * kind.
   */
  readonly sql: string;

  /**
   * The values to bind, in the order their placeholders appear in `sql`.
   *
   * A fixed-length tuple rather than an open array, deliberately: the arity and the order are part
   * of this statement's contract.
   *
   * Frozen at construction as well as typed `readonly`, because the type alone is a compile-time
   * claim that erases at emit - and the two elements have DIFFERENT meanings.
   */
  readonly params: readonly [string, number];
}

/**
 * @param productID The product whose SKUs are ordered.
 * @param nextOptionGroupSortOrder The next available option-group sort order, already resolved,
 * which sets the place value of each odometer digit.
 * @param dialect The ALREADY-RESOLVED database dialect, used for one purpose only: selecting the
 * odometer place-value term through `optionGroupOdometerPowerFragment`.
 * @returns The statement text and the two values to bind to it, in order.
 * @throws An error named `UnsupportedDialectError` when the supplied `dialect` is
 * `MicrosoftSQLServer` or `Oracle10g`.
 */
export function buildSortedProductSkusStatement(
  productID: string,
  nextOptionGroupSortOrder: number,
  dialect: DatabaseDialect,
): SortedProductSkusStatement {
  // Runtime testing measured the cost, which was concrete rather than theoretical.
  //
  // Ambient state replaced by an explicit argument passed down the call chain, with AAP 0.4.3
  // asking for exactly this.

  // JUDGMENT CALL: the legacy dialect test at model/dao/SkuDAO.cfc:L194 is
  // `databaseType eq "MicrosoftSQLServer"`, so MySQL falls through to the <cfelse> arm at L197 -
  // the plain, uncast POWER(10,...) form.
  //
  // JUDGMENT CALL: the odometer weight is float arithmetic inside an ORDER by expression, not a
  // monetary value, so E4 (single arithmetic surface / no raw float on money) does not reach it.
  // Money and decimal.js are deliberately absent here.
  const odometerPowerTerm = optionGroupOdometerPowerFragment(dialect, ODOMETER_SORT_ORDER_COLUMN);

  // CFML parity [model/dao/SkuDAO.cfc:L179-L180]: the projection is exactly one column,
  // `SwSku.skuID`, and it stays one column.
  //
  // CFML parity [model/dao/SkuDAO.cfc:L181-L188]: the three INNER JOINs are load-bearing - a SKU
  // with no option rows is excluded from the result entirely. Do not convert any join to an outer
  // join.
  //
  // CFML parity [model/dao/SkuDAO.cfc:L190]: the product predicate was already a `<cfqueryparam>`
  // with `cfsqltype="cf_sql_varchar"`, so it carries straight across as a bound placeholder.
  //
  // CFML parity [model/dao/SkuDAO.cfc:L191-L198]: the grouping is the same single column as the
  // projection, and the `SUM(...)` aggregate appears only in `ORDER BY`, never in the select list.

  // TODO [model/dao/SkuDAO.cfc:L177] carried forward CHARACTER for CHARACTER, and deliberately not
  // discharged: the engines it names are the ones this port does not implement, so completing it
  // would mean building and testing an arm the migration excludes.
  //
  // TODO: test to see if this query works with DB's other than MSSQL and MySQL.
  const sql = `SELECT
    SwSku.skuID
FROM
    SwSku
  INNER JOIN
    SwSkuOption on SwSku.skuID = SwSkuOption.skuID
  INNER JOIN
    SwOption on SwSkuOption.optionID = SwOption.optionID
  INNER JOIN
    SwOptionGroup on SwOption.optionGroupID = SwOptionGroup.optionGroupID
WHERE
    SwSku.productID = ?
GROUP BY
    SwSku.skuID
ORDER BY
    SUM(SwOption.sortOrder * ${odometerPowerTerm}) ASC`;

  // JUDGMENT CALL: legacy string-interpolated #getNextOptionGroupSortOrder()#; bound as a
  // parameter per E5. Identical semantics - the value is a computed integer, not user input.
  //
  // JUDGMENT CALL: resolving that value, including the fallback its legacy accessor applies when
  // the aggregate finds no row, belongs to the adapter [model/dao/SkuDAO.cfc:L204-L220] and not to
  // this module, which accepts the resolved integer as an argument.
  const params: readonly [string, number] = Object.freeze([
    productID,
    nextOptionGroupSortOrder,
  ] as const);

  return Object.freeze({ sql, params });
}
