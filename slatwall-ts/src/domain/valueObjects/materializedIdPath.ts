// MaterializedIdPath - the comma-delimited materialized ID path, written and read.
//
// Two independent halves, because the three path-bearing entities reach the value by different
// routes.
//
// All six are behaviour, not decoration, and all six come straight out of
// [org/Hibachi/HibachiEntity.cfc:L308-L324].
//
// No legacy TODO falls inside this module's scope. That is worth saying because the port carries
// known source TODOs forward as flagged TODOs rather than completing them silently; there is
// simply none to carry here.

import { listAppend, listFindNoCase, listGetAt, listLen } from '../../lib/cfml/list.js';
import { isNullish } from '../../lib/cfml/truthiness.js';

/**
 * Is this value absent in CFML's sense - `null` or `undefined`, and nothing else?
 *
 * JUDGMENT CALL: a narrowing wrapper, so CFML's null rule lives in one place in this file.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L316]: the parent test inside the walk is an
 * `isNull()` test, and so is the lazy getter's guard [model/entity/PriceGroup.cfc:L195-L200],
 * [model/entity/ProductType.cfc:L250-L255].
 */
function isAbsent<TValue>(value: TValue | null | undefined): value is null | undefined {
  return isNullish(value);
}

/**
 * Reads the primary identifier of one node in the hierarchy.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L315]: stands for `thisEntity.getPrimaryIDValue()`,
 * prepended on every iteration of the legacy walk. The identifier becomes one element of a
 * persisted comma-delimited list, so nothing here rewrites it.
 */
export type PrimaryIdAccessor<TNode> = (node: TNode) => string;

/**
 * Reads the parent of one node, or reports that the node has no parent.
 *
 * JUDGMENT CALL: an explicit typed callback replaces the `evaluate()` string dispatch the legacy
 * walk uses to resolve the parent ([org/Hibachi/HibachiEntity.cfc:L316, L319]).
 *
 * `null` and `undefined` are both accepted as "no parent", read through the same CFML `isNull()`
 * rule.
 */
export type ParentNodeAccessor<TNode> = (node: TNode) => TNode | null | undefined;

/**
 * Rebuild a materialized ID path by climbing from one node to its root.
 *
 * @param node the node to start from.
 * @param getPrimaryIdValue reads one node's identifier; see {@link PrimaryIdAccessor}.
 * @param getParentNode reads one node's parent, or reports none; see {@link ParentNodeAccessor}.
 * @returns a comma-delimited path, root first and `node` last, holding at least one element and
 * carrying neither a leading nor a trailing delimiter.
 */
export function buildIdPathList<TNode>(
  node: TNode,
  getPrimaryIdValue: PrimaryIdAccessor<TNode>,
  getParentNode: ParentNodeAccessor<TNode>,
): string {
  // Collected starting-node-first as the walk climbs, then reversed on the way out. `push` onto an
  // array plus one reversal is the local resolution of the missing prepend primitive described
  // above.
  const idsFromNodeUpward: string[] = [];

  let cursor: TNode = node;
  let hasParent = true;

  // A do/while, so the starting node's identifier is always collected: this is both the "includes
  // self" and the "never empty" property, and they are the same line of legacy code.
  //
  // CFML parity [org/Hibachi/HibachiEntity.cfc:L314-L321]: there is no visited set and no
  // iteration bound, exactly as in the legacy loop.
  do {
    idsFromNodeUpward.push(getPrimaryIdValue(cursor));

    const parent = getParentNode(cursor);

    if (isAbsent(parent)) {
      hasParent = false;
    } else {
      cursor = parent;
    }
  } while (hasParent);

  let idPathList = '';

  // Iterated with `for...of` rather than by index: `noUncheckedIndexedAccess` types an indexed
  // read as possibly absent, and handling an absent element would mean inventing a rule for a case
  // that cannot occur.
  for (const id of idsFromNodeUpward.reverse()) {
    idPathList = listAppend(idPathList, id);
  }

  return idPathList;
}

/**
 * Return the stored path when it is present, and compute it when it is not.
 *
 * CFML parity [model/entity/PriceGroup.cfc:L196], [model/entity/ProductType.cfc:L251]: an empty
 * string is PRESENT, not absent.
 *
 * @param storedIdPath the entity's stored path: absent as `null` or `undefined`, present as a
 * string, INCLUDING the empty string.
 * @param computeIdPath produces the path when it is absent.
 * @returns the stored path when present, otherwise the computed one.
 */
export function resolveIdPath(
  storedIdPath: string | null | undefined,
  computeIdPath: () => string,
): string {
  if (isAbsent(storedIdPath)) {
    return computeIdPath();
  }

  return storedIdPath;
}

/**
 * Read the root identifier out of a path - its first element.
 *
 * CFML parity [model/entity/ProductType.cfc:L110-L115]: the one legacy consumer is
 * `getBaseProductType()`, which reads the first element of `getProductTypeIDPath()` at L112 to
 * resolve a product type and take its system code.
 *
 * @param idPath a comma-delimited, root-first path.
 * @returns the root identifier, or `''` when the path holds no element.
 */
export function getRootIdFromIdPath(idPath: string): string {
  // CFML `listFirst('')` is `''`, so the empty path is answered here rather than handed to the
  // positional read, which raises out of range exactly as CFML's `listGetAt` does.
  if (listLen(idPath) === 0) {
    return '';
  }

  // 1, not 0: the list module's positional read is 1-based, matching CFML.
  return listGetAt(idPath, 1);
}

/**
 * Does this path contain this identifier, at whatever position?
 *
 * Case-INSENSITIVE by construction, because the underlying lookup is CFML's case-insensitive one:
 * tightening it would reject an identifier the legacy platform accepts.
 *
 * @param idPath a comma-delimited path.
 * @param id the identifier to look for.
 * @returns `true` when `id` appears at some position in `idPath`.
 */
export function idPathContainsId(idPath: string, id: string): boolean {
  return listFindNoCase(idPath, id) > 0;
}

/**
 * Does this path have any element in common with this candidate list?
 *
 * CFML parity [model/service/PromotionService.cfc:L865, L900, L935, L966]: all four sites read the
 * positional lookup as a boolean, and all four are corrected to an explicit `> 0` here.
 *
 * @param idPath a comma-delimited, root-first path.
 * @param candidateIdList a comma-delimited list of identifiers to match against.
 * @returns `true` when some element of `idPath` appears in `candidateIdList`.
 */
export function idPathContainsAnyId(idPath: string, candidateIdList: string): boolean {
  // The legacy loop re-reads the element count on every iteration through the full accessor chain.
  // Read once here: the path arrives as an immutable string parameter, so the count cannot change
  // between iterations.
  const segmentCount = listLen(idPath);

  for (let position = 1; position <= segmentCount; position += 1) {
    if (listFindNoCase(candidateIdList, listGetAt(idPath, position)) > 0) {
      return true;
    }
  }

  return false;
}
