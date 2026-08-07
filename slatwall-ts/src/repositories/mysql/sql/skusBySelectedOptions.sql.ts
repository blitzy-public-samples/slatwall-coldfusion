// slatwall-ts - extracted SQL: the SKUs that match all selected options.
//
// A SKU matches only when it satisfies an EXISTS predicate for every option in the list.
//
// JUDGMENT CALL: the one documented per-element-binding exception in this migration is not
// cross-applied here.

import { listToArray } from '../../../lib/cfml/list.js';
import { MAX_PLACEHOLDER_COUNT, isPreparablePlaceholderCount } from '../connection.js';

/**
 * One prepared statement: its text, and the values to bind to it.
 *
 * The port does not declare a statement contract - `skuRepository.ts` describes method signatures
 * and contains no SQL of any kind - so the shape is declared here.
 *
 * JUDGMENT CALL: the ARRAY is deliberately not `readonly` and is deliberately not frozen, even
 * though freezing it was the first instinct and the enclosing object is frozen.
 */
export interface SkusBySelectedOptionsStatement {
  /**
   * The statement text. Contains one positional `?` per element of `params`.
   */
  readonly sql: string;

  /**
   * The bind values, in the order their placeholders appear in `sql`: one entry per selected
   * option in list order, then `productID` last when present.
   */
  readonly params: readonly string[];
}

// The emitted statement, fragment by fragment.
//
// Two properties of that text are easy to miss and both are load-bearing.
//
// The fragments keep the legacy's line breaks, clause order, alias names (`sku`, `opt`, `o`, `s`)
// and lower-case keywords exactly as the source writes them.

// CFML parity [model/dao/SkuDAO.cfc:L111-L112]: the `0 = 0` seed is the accumulator idiom that
// makes every appended clause unconditionally prefixable with `and`.
//
// CFML parity [model/dao/SkuDAO.cfc:L109-L112]: the `opt` alias is declared and never referenced.
// The join is load-bearing twice: it excludes SKUs with zero options, and it is what makes SELECT
// DISTINCT necessary.
//
// JUDGMENT CALL: the projection is `sku.*` because the legacy `select distinct sku` selects the
// ENTITY, and `sku.*` is the whole SwSku row an entity is hydrated from.
/**
 * The statement opener: projection, table, the options join, and the seed.
 */
const STATEMENT_SEED =
  'select distinct sku.* from SwSku as sku \n' +
  '\t\t\t\t\tinner join SwSkuOption as opt on opt.skuID = sku.skuID \n' +
  '\t\t\t\t\twhere \n' +
  '\t\t\t\t\t0 = 0 ';

// CFML parity [model/dao/SkuDAO.cfc:L115-L119]: one correlated EXISTS per selected option, ANDed
// onto the WHERE clause. This is the must-preserve AND-of-EXISTS semantics in its physical form.
//
// JUDGMENT CALL: the subquery stays two tables.
/**
 * One selected option: a correlated EXISTS carrying exactly one placeholder.
 */
const OPTION_EXISTS_PREDICATE = `and exists (
						select * from SwOption o
						join SwSkuOption s on s.optionID = o.optionID where s.skuID = sku.skuID
						and o.optionID = ?
					) `;

// CFML parity [model/dao/SkuDAO.cfc:L124]: the closing conjunct, appended last and therefore bound
// last.
/**
 * The optional product narrowing: the last conjunct, with the last placeholder.
 */
const PRODUCT_PREDICATE = 'and sku.productID = ?';

// Carried forward verbatim from [model/dao/SkuDAO.cfc:L106].
/**
 * The selected-options list would need more placeholders than a statement can carry.
 *
 * A module-local class rather than a shared one: `../connection.ts` raises its own
 * `SqlPlaceholderCountError` for the same protocol fact.
 */
class SkusBySelectedOptionsPlaceholderCountError extends Error {
  /**
   * How many placeholders the statement would have carried. Kept for inspection.
   */
  public readonly placeholderCount: number;

  public constructor(placeholderCount: number) {
    super(
      [
        `A selected-options statement would carry ${String(placeholderCount)} placeholders,`,
        `and MySQL cannot prepare more than ${String(MAX_PLACEHOLDER_COUNT)}:`,
        'COM_STMT_PREPARE_OK reports the count in a two-byte field, so the server could not',
        'accept this statement however it was sent. The list is refused on its COUNT alone -',
        'no element is trimmed, sorted, deduplicated, case-folded, reordered or dropped to fit,',
        'because each of those would change which rows the statement matches.',
      ].join(' '),
    );
    this.name = 'SkusBySelectedOptionsPlaceholderCountError';
    this.placeholderCount = placeholderCount;
  }
}

/**
 * Builds the AND-of-EXISTS statement that resolves a selected-option list to its skus.
 *
 * @param selectedOptions A CFML comma-delimited list of option IDs.
 * @param productID Optional, exactly as `string productID` [model/dao/SkuDAO.cfc:L107] is declared
 * with neither `required` nor a default.
 * @returns The frozen statement text and its positional bind values, with one `params` element per
 * `?` in `sql`.
 * @throws {SkusBySelectedOptionsPlaceholderCountError} ONLY when the statement could not be
 * PREPARED BY THE SERVER at all.
 */
export function buildSkusBySelectedOptionsStatement(
  selectedOptions: string,
  productID?: string,
): SkusBySelectedOptionsStatement {
  // Fragments and bind values are accumulated in lockstep: every branch below that pushes a
  // fragment pushes exactly one value with it.
  const parts: string[] = [STATEMENT_SEED];
  const params: string[] = [];

  // CFML parity [model/dao/SkuDAO.cfc:L113]: `listLen('')` is 0, so an empty list runs the loop
  // body zero times and appends no EXISTS clause at all. The statement then degenerates to "every
  // SKU that has at least one option", courtesy of the inner join in the seed.
  //
  // JUDGMENT CALL: the legacy loop is `for(i=1; i<=listLen(list); i++)` with a
  // `listGetAt(list, i)` body [model/dao/SkuDAO.cfc:L113-L114], re-evaluating both per iteration.
  const selectedOptionIDs = listToArray(selectedOptions);

  // The loop below appends one fragment and one bind per element, and `parts.join('')` then
  // materializes the whole statement as a single string - so a check placed after it would already
  // have committed the memory.
  const placeholderCount = selectedOptionIDs.length + (productID === undefined ? 0 : 1);

  if (!isPreparablePlaceholderCount(placeholderCount)) {
    throw new SkusBySelectedOptionsPlaceholderCountError(placeholderCount);
  }

  // Nothing else stands between the parse and the emit.
  for (const optionID of selectedOptionIDs) {
    parts.push(OPTION_EXISTS_PREDICATE);
    params.push(optionID);
  }

  // CFML parity [model/dao/SkuDAO.cfc:L122-L126]: the legacy guard is structKeyExists() with no
  // len()/trim() test, and `productID` is declared with no `required` and no default (L107).
  if (productID !== undefined) {
    parts.push(PRODUCT_PREDICATE);
    params.push(productID);
  }

  // Both the statement and its bind array are frozen.
  return Object.freeze({ sql: parts.join(''), params: Object.freeze(params) });
}
