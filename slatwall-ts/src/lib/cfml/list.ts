// slatwall-ts - CFML comma-list primitives.
//
// Five CFML list functions re-expressed in TypeScript with their CFML semantics intact: listLen,
// listGetAt, listAppend, listToArray, listFindNoCase.
//
// The port RETAINS comma-delimited parameters and `string` returns for signature parity:
// `getUnusedProductOptions(productID, existingOptionGroupIDList)` keeps its `string` parameter and
// parses internally, and `getPromotionPeriodQualifiedFulfillmentIDList(...)` keeps its comma-list
// `string` return.
//
// Adding a sixth export - listQualify, listSort, listDeleteAt, listPrepend, listSetAt,
// listContains, valueList or any other - is a gate failure.

/**
 * The delimiter CFML assumes when a list function is called without one.
 *
 * A module-scope `const` holding a string primitive: immutable, so not the module-scope mutable
 * state this subtree forbids.
 */
const DEFAULT_DELIMITER = ',';

/**
 * Split a CFML list into its elements. The single shared boundary rule.
 *
 * JUDGMENT CALL: no regular expression is built from the caller's delimiter.
 *
 * JUDGMENT CALL: an empty delimiter argument yields an empty set, so nothing is a delimiter and a
 * non-empty list is one element. No in-scope call site passes one.
 */
function splitOnDelimiters(list: string, delimiters: string): string[] {
  const delimiterSet = new Set<string>(delimiters);
  const elements: string[] = [];
  let element = '';

  for (const character of list) {
    if (delimiterSet.has(character)) {
      // An empty run between two delimiters contributes no element, which is what makes
      // `listLen('a,,b')` 2 rather than.
      if (element !== '') {
        elements.push(element);
      }
      element = '';
      continue;
    }

    element += character;
  }

  if (element !== '') {
    elements.push(element);
  }

  return elements;
}

/**
 * Raised when a list is indexed outside `1..listLen(list)`.
 *
 * Four of the five exports are still total: `listLen`, `listAppend`, `listToArray` and
 * `listFindNoCase` cannot fail.
 *
 * The message names the offending position, the list length and the list itself, because these
 * lists are structural identifiers - comma lists of `optionGroupID`s and `productTypeID`s.
 */
export class CfmlListIndexError extends Error {
  /**
   * @param list the list that was indexed.
   * @param position the rejected 1-based position.
   * @param length the number of non-empty elements the list actually has.
   */
  public constructor(list: string, position: number, length: number) {
    const shown =
      list.length > MAX_REPORTED_LIST_LENGTH
        ? `${list.slice(0, MAX_REPORTED_LIST_LENGTH)}...`
        : list;

    super(
      `listGetAt received the position ${String(position)}, which is not an integer in ` +
        `1..${String(length)}; the list has ${String(length)} element(s) and ` +
        `${String(list.length)} character(s): "${shown}". CFML raises for an invalid list index, ` +
        'and returning the empty string here would be indistinguishable from an element that is ' +
        'genuinely empty.',
    );
    this.name = 'CfmlListIndexError';
  }
}

/**
 * How much of an offending list the error message reproduces.
 *
 * Long enough to identify a realistic comma list of four 32-character UUID identifiers with their
 * delimiters, short enough that a pathological value cannot dominate a log line.
 */
const MAX_REPORTED_LIST_LENGTH = 132;

/**
 * Count the elements of a CFML list.
 *
 * The four `PromotionService` sites walk `getProductTypeIDPath()`, a materialized path held as a
 * comma-delimited string.
 *
 * The THIRTEENTH is a VARIANT: [model/service/ProductService.cfc:L86-L91], private
 * `buildSkuCombinations`, where `listLen` is both a bare gate at L86, `if(listlen(keys))`, and an
 * equality bound at L88.
 *
 * @returns the number of non-empty elements.
 */
export function listLen(list: string, delimiters: string = DEFAULT_DELIMITER): number {
  return splitOnDelimiters(list, delimiters).length;
}

/**
 * Read one element of a CFML list by position. The position is 1-BASED.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L94]: indexed from 1, driven by a loop from
 * `i=1` to `i<=listLen(...)`.
 *
 * CFML parity [model/service/ProductService.cfc:L87, L89, L91]: the result is also used directly
 * as a struct key, `arguments.data[listGetAt(keys, position)]`, so it must be the element string
 * itself, unmodified and untrimmed.
 *
 * @returns the element at `position`.
 * @throws {CfmlListIndexError} if `position` is not an integer in `1..listLen(list)`.
 */
export function listGetAt(
  list: string,
  position: number,
  delimiters: string = DEFAULT_DELIMITER,
): string {
  // Checked before the scan starts.
  if (!Number.isInteger(position) || position < 1) {
    throw new CfmlListIndexError(list, position, listLen(list, delimiters));
  }

  // The `Set` constructor consumes the string iterator, so its members are whole code points; see
  // the no-regular-expression note on `splitOnDelimiters`.
  const delimiterSet = new Set<string>(delimiters);
  let completed = 0;
  let element = '';

  for (const character of list) {
    if (!delimiterSet.has(character)) {
      element += character;
      continue;
    }

    // An empty run between two delimiters contributes no element, which is what makes
    // `listGetAt('a,,b', 2)` return `'b'` rather than `''`.
    if (element === '') {
      continue;
    }

    completed += 1;
    if (completed === position) {
      return element;
    }

    element = '';
  }

  // A non-empty trailing run is the last element, numbered one past the last completed one.
  if (element !== '' && completed + 1 === position) {
    return element;
  }

  throw new CfmlListIndexError(list, position, element === '' ? completed : completed + 1);
}

/**
 * Append one value to a CFML list, returning the new list.
 *
 * CFML parity [model/entity/Sku.cfc:L234-L238]: the accumulator starts empty and the first append
 * must not emit a leading delimiter.
 *
 * CFML parity [model/entity/Sku.cfc:L236, L581, L888]: the optional third delimiter argument is
 * real.
 *
 * CFML parity [model/entity/Sku.cfc:L578-L584]: never TRIM, normalize or collapse whitespace. That
 * site appends `" #optionGroupName#: #optionName#"`, a value that DELIBERATELY BEGINS with A SPACE
 * and contains a colon, and it is preserved byte-for-byte.
 *
 * @returns a new list string.
 */
export function listAppend(
  list: string,
  value: string,
  delimiter: string = DEFAULT_DELIMITER,
): string {
  if (list === '') {
    return value;
  }

  return list + delimiter + value;
}

/**
 * Convert a CFML list into an array of its elements.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L52-L53, L126, L129, L131]: this is the comma-list to
 * bind-parameter boundary converter, and the chain is verified end to end.
 *
 * @returns a NEW array on every call; the caller may mutate it freely.
 */
export function listToArray(list: string, delimiters: string = DEFAULT_DELIMITER): string[] {
  return splitOnDelimiters(list, delimiters);
}

/**
 * Find a value in a CFML list, case-insensitively.
 *
 * CFML parity [model/service/PromotionService.cfc:L774] is the decisive proof:
 * `ListDeleteAt(qualifiedFulfillmentIDs, listFindNoCase(qualifiedFulfillmentIDs,...))` consumes
 * the return DIRECTLY as a 1-based position, so a boolean-returning implementation would corrupt
 * that call site silently - `true` deleting element.
 *
 * CFML parity [model/service/PromotionService.cfc:L61, L774, L865, L900, L935, L966]: the ARGUMENT
 * ORDER is (list, value), LIST FIRST - uniform across every site, in the literal-haystack form
 * (L61 searches `"otSalesOrder,otExchangeOrder"`) and the variable-haystack form alike.
 *
 * @returns the 1-based position of the first match, or `0` if there is none.
 */
export function listFindNoCase(
  list: string,
  value: string,
  delimiters: string = DEFAULT_DELIMITER,
): number {
  const elements = splitOnDelimiters(list, delimiters);
  const wanted = value.toLowerCase();

  const matchIndex = elements.findIndex((element) => element.toLowerCase() === wanted);

  // `findIndex` yields -1 when nothing matches, and -1 + 1 is 0 - CFML's "absent" sentinel.
  return matchIndex + 1;
}
