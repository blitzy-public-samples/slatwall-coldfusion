// slatwall-ts - the MySQL adapter for the option select-list reads.
//
// JUDGMENT CALL: the entity classes `src/domain/entities/option.ts` and
// `src/domain/entities/optionGroup.ts` are read as PROVENANCE for the table and column names cited
// throughout this file, and are deliberately not imported.

import type { OptionRepository, SelectOption } from '../../domain/ports/optionRepository.js';
import { listToArray } from '../../lib/cfml/list.js';
import { isNullish } from '../../lib/cfml/truthiness.js';
import type { PreparedStatementExecutor, SqlRow } from './connection.js';
import {
  MAX_PLACEHOLDER_COUNT,
  isPreparablePlaceholderCount,
  sqlPlaceholderList,
} from './connection.js';

/**
 * The result set and the mapper disagree about a column.
 *
 * CFML parity [model/dao/OptionDAO.cfc:L88]: the legacy loop reads `rs.optionName` and friends
 * directly off the query object, and CFML raises when a name is not a column of that result set.
 */
class OptionProjectionError extends Error {
  /**
   * The column the mapper asked for, as the mapper spelled it.
   */
  readonly columnName: string;

  /**
   * What went wrong. Never the value itself.
   */
  readonly detail: string;

  constructor(columnName: string, detail: string) {
    super(
      [
        `Column "${columnName}" cannot be projected: ${detail}.`,
        'The statement and the row mapper must agree: every column a mapper reads has to be',
        'selected by the statement that produced the row, and has to arrive as a text, numeric,',
        'bigint or boolean value, or as SQL NULL.',
      ].join(' '),
    );
    this.name = 'OptionProjectionError';
    this.columnName = columnName;
    this.detail = detail;
  }
}

// Placeholder binds one scalar, always, and the failure is silent: `IN (?)` bound with `'g1,g2'`
// becomes an equality against the whole comma-joined string, so it matches nothing.
//
// CFML parity [model/dao/OptionDAO.cfc:L68] and [model/dao/OptionDAO.cfc:L107]: per-element
// binding is not a reshaping of the legacy, it is the same mechanism.
// LEGACY-DEFECT [model/dao/OptionDAO.cfc:L52-L53, L68, L95, L107]: both
// `existingOptionGroupIDList` arguments are declared `required="true"` and neither is
// length-checked, so an empty list reaches a bound list parameter unguarded.
// Preserved deliberately; do not fix without a product decision.
/**
 * What CFML bound when the list was empty: a single empty string.
 *
 * Named rather than inlined so that both statements bind the identical value and a reader can find
 * the whole empty-list path from one place.
 */
const EMPTY_LIST_ELEMENT = '';

/**
 * @param existingOptionGroupIDList the raw comma-delimited argument, exactly as the caller
 * supplied it.
 * @param parameterName the argument's own name, for the refusal message only.
 * @param additionalPlaceholderCount placeholders the surrounding statement adds after the list.
 * @returns at least one element, so the placeholder count is never zero.
 * @throws {OptionGroupIDListTooWideError} when the list would need more placeholders than a
 * prepared statement can carry.
 */
function bindGroupIDElements(
  existingOptionGroupIDList: string,
  parameterName: string,
  additionalPlaceholderCount = 0,
): readonly string[] {
  // `listToArray` carries CFML list semantics rather than re-inventing them with a bare `split`:
  // empty elements are DROPPED, so `''` becomes `[]` and `'a,,b'` becomes `['a', 'b']`.
  const elements = listToArray(existingOptionGroupIDList);
  const listPlaceholderCount = Math.max(1, elements.length);
  const placeholderCount = listPlaceholderCount + additionalPlaceholderCount;

  if (!isPreparablePlaceholderCount(placeholderCount)) {
    throw new OptionGroupIDListTooWideError(parameterName, elements.length, placeholderCount);
  }

  return elements.length > 0 ? elements : [EMPTY_LIST_ELEMENT];
}

/**
 * A comma-list argument would need more placeholders than a statement can carry.
 *
 * Carries the PARAMETER NAME and the COUNT, and never the list: the two together locate the fault,
 * and neither is caller content.
 */
class OptionGroupIDListTooWideError extends Error {
  /**
   * The argument at fault, by its published name.
   */
  public readonly parameterName: string;

  /**
   * How many elements the list carried.
   */
  public readonly elementCount: number;

  /**
   * How many placeholders the complete statement would have carried.
   */
  public readonly placeholderCount: number;

  public constructor(parameterName: string, elementCount: number, placeholderCount: number) {
    super(
      [
        `The ${parameterName} argument carries ${String(elementCount)} elements, so the complete`,
        `statement would carry ${String(placeholderCount)} placeholders, and MySQL cannot`,
        `prepare a statement with more than ${String(MAX_PLACEHOLDER_COUNT)} placeholders:`,
        'COM_STMT_PREPARE_OK reports the count in a two-byte field, so the server could not accept',
        'this statement however it was sent. The list is refused on its COUNT alone - no element is',
        'trimmed, sorted, deduplicated, case-folded, reordered or dropped to fit, because each of',
        'those would change which option groups the predicate excludes.',
      ].join(' '),
    );
    this.name = 'OptionGroupIDListTooWideError';
    this.parameterName = parameterName;
    this.elementCount = elementCount;
    this.placeholderCount = placeholderCount;
  }
}

// CFML parity [model/dao/OptionDAO.cfc:L88, L113]: query-column access in CFML is CASE-INSENSITIVE
// `rs.optionName`, `rs.OPTIONNAME` and `rs.optionname` are one and the same read - so this
// reader folds case rather than demanding an exact key.
//
// JUDGMENT CALL: that parity argument is reinforced by a measured driver fact, which is why an
// exact-key lookup is not used.
/**
 * Read one column of a row as the text CFML would have interpolated.
 *
 * CFML parity [model/dao/OptionDAO.cfc:L88]: a NULL query cell renders as the EMPTY STRING when
 * CFML interpolates it, so a row whose `optionName` is NULL composes the label `"<group> - "`
 * rather than failing or reading "null".
 *
 * @param row one result-set row, keyed by the label the driver reported.
 * @param columnName the column to read, in any casing.
 * @returns the column's text, or `''` when the cell is SQL NULL.
 * @throws An error named `OptionProjectionError` when no column of that name is present, or when
 * the cell holds a value that is not text-like.
 */
function readTextColumn(row: SqlRow, columnName: string): string {
  const foldedName = columnName.toLowerCase();

  for (const [label, value] of Object.entries(row)) {
    if (label.toLowerCase() !== foldedName) {
      continue;
    }

    if (isNullish(value)) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    // Every column either statement projects is a `varchar`, so the numeric branch exists only to
    // keep a widened column from becoming an outage.
    if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
      return value.toString();
    }

    throw new OptionProjectionError(columnName, `the cell holds a ${typeof value}`);
  }

  throw new OptionProjectionError(columnName, 'the result set has no column of that name');
}

// JUDGMENT CALL: the SQL below carries every token, every clause and every clause ORDER across
// from the `<cfquery>` bodies unaltered, while INDENTATION is NORMALIZED - spaces instead of the
// legacy tabs, and no line ending in whitespace.

// CFML parity [model/dao/OptionDAO.cfc:L70-L81]: the exclusion is a `NOT EXISTS` correlated
// subquery and it stays one.
//
// CFML parity [model/dao/OptionDAO.cfc:L71]: the inner `SELECT DISTINCT` is redundant.
//
// CFML parity [model/dao/OptionDAO.cfc:L82-L84]: the statement closes on a TWO-COLUMN `ORDER BY` -
// option group name first, then option name - with no direction keyword on either key, so both
// sort ascending.
/**
 * The statement behind `getUnusedProductOptions`, from [model/dao/OptionDAO.cfc:L58-L84].
 *
 * @param groupIDPlaceholders the rendered `IN`-list placeholder body, one `?` per bound group
 * identifier.
 * @returns the statement, carrying `groupIDPlaceholders.length + 1` placeholders: the group list
 * first, then `productID`.
 */
function buildUnusedProductOptionsStatement(groupIDPlaceholders: string): string {
  return `SELECT
  SwOption.optionID,
  SwOption.optionName,
  SwOptionGroup.optionGroupName
FROM
  SwOption
  INNER JOIN
  SwOptionGroup on SwOptionGroup.optionGroupID = SwOption.optionGroupID
WHERE
  SwOption.optionGroupID IN (${groupIDPlaceholders})
  AND
  NOT EXISTS(
    SELECT DISTINCT
      a.optionID
    FROM
      SwSkuOption a
      INNER JOIN
      SwSku b on a.skuID = b.skuID
    WHERE
      b.productID = ?
      AND
      a.optionID = SwOption.optionID
  )
ORDER BY
  SwOptionGroup.optionGroupName,
  SwOption.optionName`;
}

// CFML parity [model/dao/OptionDAO.cfc:L107]: this list is matched with `NOT IN` - the OPPOSITE
// polarity to the sibling statement's `IN` - because an unused group is one the product does not
// already carry.
//
// CFML parity [model/dao/OptionDAO.cfc:L108-L109]: a SINGLE-column `ORDER BY` on the option group
// name, with no direction keyword, so it sorts ascending. It stays one column: no second key and
// no tiebreaker is added, even though the sibling statement has two.
/**
 * The statement behind `getUnusedProductOptionGroups`, from [model/dao/OptionDAO.cfc:L100-L109].
 *
 * @param groupIDPlaceholders the rendered `NOT IN`-list placeholder body, one `?` per bound group
 * identifier.
 * @returns the statement, carrying exactly `groupIDPlaceholders.length` placeholders.
 */
function buildUnusedProductOptionGroupsStatement(groupIDPlaceholders: string): string {
  return `SELECT
  SwOptionGroup.optionGroupID,
  SwOptionGroup.optionGroupName
FROM
  SwOptionGroup
WHERE
  SwOptionGroup.optionGroupID NOT IN (${groupIDPlaceholders})
ORDER BY
  SwOptionGroup.optionGroupName`;
}

// CFML parity [model/dao/OptionDAO.cfc:L58-L92]: this projection is the whole of what
// `getUnusedProductOptions` produced - the `<cfquery>` at L58-L85 and the `<cfloop>` at L87-L89
// that turns each of its rows into one appended structure.
//
// CFML parity [model/dao/OptionDAO.cfc:L88]: the label separator is space-hyphen-space. The legacy
// composes `name="#rs.optionGroupName# - #rs.optionName#"`, so the separator is the three
// characters U+0020 U+002D U+0020 and nothing else.
//
// JUDGMENT CALL: the label is composed in TYPESCRIPT rather than in SQL, and that is forced rather
// than stylistic.
/**
 * One row of [model/dao/OptionDAO.cfc:L58-L84] as the legacy loop shapes it.
 *
 * @param row a row of the unused-options statement.
 * @returns `{ name: "<optionGroupName> - <optionName>", value: <optionID> }`.
 */
function toOptionSelectOption(row: SqlRow): SelectOption {
  return {
    name: `${readTextColumn(row, 'optionGroupName')} - ${readTextColumn(row, 'optionName')}`,
    value: readTextColumn(row, 'optionID'),
  };
}

// CFML parity [model/dao/OptionDAO.cfc:L113]: this projection is
// `name=rs.optionGroupName, value=rs.optionGroupID` - the group name ALONE, with no separator and
// no composition.
//
// JUDGMENT CALL: the member names are `name` and `value`, taken verbatim from the two legacy
// append sites and published by `SelectOption` on the port.
/**
 * One row of [model/dao/OptionDAO.cfc:L100-L109] as the legacy loop shapes it.
 *
 * @param row a row of the unused-option-groups statement.
 * @returns `{ name: <optionGroupName>, value: <optionGroupID> }`.
 */
function toOptionGroupSelectOption(row: SqlRow): SelectOption {
  return {
    name: readTextColumn(row, 'optionGroupName'),
    value: readTextColumn(row, 'optionGroupID'),
  };
}

/**
 * Reads the option and option-group select lists that back product option assignment.
 *
 * Both methods are `async`, which follows the project's rule mechanically: a method becomes
 * `async` if and only if its legacy body reaches the data store.
 *
 * @example
 */
export class MysqlOptionRepository implements OptionRepository {
  /**
   * The narrow prepared-statement surface every read goes through.
   *
   * JUDGMENT CALL: the executor is a CONSTRUCTOR PARAMETER and never a module singleton, and this
   * is a mandatory design constraint rather than a convenience.
   */
  private readonly executor: PreparedStatementExecutor;

  /**
   * @param executor the prepared-statement executor this repository reads through.
   */
  constructor(executor: PreparedStatementExecutor) {
    this.executor = executor;
  }

  /**
   * Options belonging to the product's existing option groups that none of its SKUs uses yet.
   *
   * An EMPTY RESULT is A LEGITIMATE OUTCOME and is returned as an empty array, never smoothed into
   * a default, a fallback or a synthesised row.
   *
   * @param productID product whose SKUs are checked for existing option use.
   * @param existingOptionGroupIDList comma-delimited option group identifiers to search within.
   * @returns rows ordered by option group name then option name.
   */
  async getUnusedProductOptions(
    productID: string,
    existingOptionGroupIDList: string,
  ): Promise<readonly SelectOption[]> {
    // This statement adds the trailing `productID` bind after the group-list placeholders.
    const groupIDs = bindGroupIDElements(existingOptionGroupIDList, 'existingOptionGroupIDList', 1);
    const statement = buildUnusedProductOptionsStatement(sqlPlaceholderList(groupIDs.length));

    // CFML parity [model/dao/OptionDAO.cfc:L68, L78]: the parameter order is the legacy order. The
    // group list is bound at L68 in the `WHERE` clause and `productID` at L78 inside the
    // `NOT EXISTS`, so the list placeholders come first and `productID` last.
    const rows = await this.executor.execute(statement, [...groupIDs, productID]);

    return rows.map(toOptionSelectOption);
  }

  /**
   * Option groups the product does not already carry.
   *
   * An empty result is a legitimate outcome and is returned as an empty array.
   *
   * @param existingOptionGroupIDList comma-delimited option group identifiers to exclude.
   * @returns rows ordered by option group name.
   */
  async getUnusedProductOptionGroups(
    existingOptionGroupIDList: string,
  ): Promise<readonly SelectOption[]> {
    const groupIDs = bindGroupIDElements(existingOptionGroupIDList, 'existingOptionGroupIDList');
    const statement = buildUnusedProductOptionGroupsStatement(sqlPlaceholderList(groupIDs.length));

    // CFML parity [model/dao/OptionDAO.cfc:L107]: the group list is the statement's only bound
    // input, so the parameter array is the list elements and nothing else.
    const rows = await this.executor.execute(statement, groupIDs);

    return rows.map(toOptionGroupSelectOption);
  }
}
