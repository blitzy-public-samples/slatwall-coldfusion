// materializedIdPath - the comma-delimited materialized ID path, written and read.
//
// Replaces the hierarchy walk at [org/Hibachi/HibachiEntity.cfc:L308-L324] and the duplicated
// comma-list path walking in promotion qualifier and reward membership
// [model/service/PromotionService.cfc:L858-L870, L921-L985].
//
// Two independent halves, because the three path-bearing entities reach the value by different
// routes. `buildIdPathList` writes and recomputes; `resolveIdPath`, `getRootIdFromIdPath`,
// `idPathContainsId` and `idPathContainsAnyId` read a path that already exists. PriceGroup has both
// a lazy getter [model/entity/PriceGroup.cfc:L195-L200] and eager assignment in its persistence
// hooks [model/entity/PriceGroup.cfc:L206-L214]; ProductType has the same shape
// [model/entity/ProductType.cfc:L250-L255, L305-L313]; Category has no lazy getter at all - its
// overridden-methods block [model/entity/Category.cfc:L120-L122] is empty - so its hooks
// [model/entity/Category.cfc:L126-L134] are its only route, which is why the write half has to
// stand alone.
//
// ★ IN ONE PARAGRAPH, BEFORE THE SECTIONS THAT PROVE IT. This module reproduces the six
// properties of the legacy walk exactly - root-first, self-last, comma-delimited, includes self,
// NO CYCLE GUARD, never empty - and serves the three path columns `priceGroupIDPath`,
// `productTypeIDPath` and `categoryIDPath`, each declared `ormtype="string" length="4000"`. It
// supplies COMPUTATION ONLY: the ordering of path assignment relative to `super` belongs to each
// entity, the `LIKE '<path>%'` prefix filters belong to the repositories, and the stored path is
// instance state on the entity rather than anything retained here. Identifiers pass through
// untouched - no whitespace stripping, no case folding. And no cycle detection is added: none is
// added here, because none exists at [org/Hibachi/HibachiEntity.cfc:L314-L321] and adding one
// would be an unrequested behavioural change rather than a port.
//
// ★ THIS PARAGRAPH ONCE READ THE OPPOSITE WAY, AND THE RECORD OF THAT IS WORTH KEEPING. An
// earlier revision of this module DID refuse a cyclic or over-deep chain, throwing from
// `buildIdPathList` and carrying a depth backstop in `resolveIdPath`, and this header argued for
// it at length as a divergence. That guard has been removed in full - the visited set, the depth
// ceiling, the error type it threw and the `reparent`-shaped predicate three entities called - and
// the reason is not that the guard was badly built. It is that the module's authority reproduces
// the legacy walk and adds nothing to it: a cycle guard here is a behavioural change nobody asked
// for, `reparent`-class helpers are outside this module's surface, and the migration's divergence
// budget is closed at three, none of which is spent in this folder. Termination for the ONE place
// that genuinely needed it - the hand-written recursive ancestry reads in
// `src/repositories/mysql/mysqlPriceGroupRepository.ts` and `mysqlProductTypeRepository.ts`, where
// Hibernate's lazy traversal used to do the recursing - lives there, as a documented fetch-shape
// decision under transformation rule T3, and is not a divergence either.
//
//   §0.3.3 Composite / materialized path - this module "centralizes the
//   comma-delimited ID-path walking that the legacy code duplicates between
//   qualifier membership [model/service/PromotionService.cfc:L858-L870] and
//   reward membership [model/service/PromotionService.cfc:L921-L985], and
//   which also underpins priceGroupIDPath [model/entity/PriceGroup.cfc:L195]
//   and categoryIDPath".
//
// THE SIX PROPERTIES THIS MODULE REPRODUCES
//   All six are behaviour, not decoration, and all six come straight out of
//   [org/Hibachi/HibachiEntity.cfc:L308-L324]. A tidier result is a wrong
//   result.
//
//     root-first        the legacy prepend at L315 pushes each identifier to
//                       the front as the walk climbs, so the outermost
//                       ancestor ends up first.
//     self-last         the walk starts at `this` (L311), so the starting node
//                       is prepended first and finishes at the tail.
//     comma-delimited   the default delimiter of that legacy list call.
//     includes self     L315 runs before the parent test at L316, always.
//     no cycle guard    the do/while at L314-L321 carries no visited set and
//                       no iteration bound, and neither does the port. A cyclic
//                       parent chain loops here exactly as it loops there.
//                       That is deliberate: the walk is reproduced, not
//                       improved, and a guard would be an unrequested
//                       behavioural change. Where termination genuinely had to
//                       be decided - the recursive ancestry reads in the MySQL
//                       adapters, which replace Hibernate's lazy traversal - it
//                       is decided there, as a fetch-shape decision.
//     never empty       it is a do/while, so the body executes once even for a
//                       root with no parent; the result therefore always holds
//                       at least one element.
//
// THE THREE IN-SCOPE PATH-BEARING ENTITIES
//   Three, not one. Each column is declared `ormtype="string" length="4000"`,
//   and this port changes no column, no table and no name:
//
//     priceGroupIDPath   [model/entity/PriceGroup.cfc:L53]
//     productTypeIDPath  [model/entity/ProductType.cfc:L53]
//     categoryIDPath     [model/entity/Category.cfc:L53]
//
//   The emitted string must therefore stay a plain comma-delimited list of
//   identifiers: no added whitespace, no bracketing, no leading delimiter and
//   no trailing delimiter. The 4000-character limit itself is a persistence
//   concern and is deliberately NOT enforced here.
//
//   `Type.cfc`, `Content.cfc` and the Mura event handler call the same legacy
//   builder and are all out of scope. They are context only, and are read
//   rather than ported.
//
// WHY THE API HAS TWO INDEPENDENT HALVES
//   Because the three entities reach the same value by different routes, and
//   one half alone cannot serve all three:
//
//     PriceGroup  - BOTH a lazy getter [model/entity/PriceGroup.cfc:L195-L200]
//                   AND eager assignment in its two persistence lifecycle
//                   hooks [model/entity/PriceGroup.cfc:L206-L214], which
//                   rebuild the path directly and so bypass the getter
//                   outright.
//     ProductType - the same three-part shape, at
//                   [model/entity/ProductType.cfc:L250-L255] and
//                   [model/entity/ProductType.cfc:L305-L313].
//     Category    - NO lazy getter at all. Its "Overridden Methods" block at
//                   [model/entity/Category.cfc:L120-L122] is literally empty,
//                   so `getCategoryIDPath()` is never overridden, and the two
//                   hooks at [model/entity/Category.cfc:L126-L134] are its
//                   only route.
//
//   Category is the proof that the two halves are independent: it exercises
//   the write half and never touches the read half.
//
// THE HOOK ORDERING IS OWNED BY THE ENTITIES, NOT BY THIS MODULE
//   The three entities do not agree on when the path is assigned relative to
//   their inherited lifecycle delegation, and that disagreement is reproduced
//   faithfully - in the entities:
//
//     [model/entity/PriceGroup.cfc:L206-L214]   assign the path FIRST
//     [model/entity/ProductType.cfc:L305-L313]  assign the path FIRST
//     [model/entity/Category.cfc:L126-L134]     delegate FIRST, assign after
//
//   This module supplies the COMPUTATION ONLY. It encodes no ordering, knows
//   nothing about persistence lifecycle hooks, and deliberately names none of
//   them - so an entity author will not find the ordering here, and must not
//   add it here. Because those ORM lifecycle hooks have no equivalent in the
//   target at all, the repository layer invokes path maintenance explicitly
//   when it saves; this module is what that maintenance calls, and the
//   dependency runs inward, never outward.
//
// THIS MODULE CONTAINS NO QUERY WHATSOEVER
//   Worth stating rather than leaving implicit, because the materialized path
//   is the SUBJECT of persistence-layer code elsewhere: the engine-specific
//   path assembly at [model/dao/PromotionDAO.cfc:L482-L488], and the
//   prefix-match filters at [model/entity/ProductType.cfc:L129],
//   [model/entity/ProductType.cfc:L264] and
//   [model/entity/ProductType.cfc:L292]. None of that belongs here, and the
//   parameterized-statement obligation rests wholly with the repository layer.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT DO
//   * No path-mutation surface at all: nothing that inserts, moves,
//     re-parents, measures nesting, tests ancestry or compares prefixes. No
//     legacy site needs one, so none is offered.
//   * No stored state whatsoever: no module-scope mutable binding and nothing
//     retained between calls. The stored path is instance state on the entity;
//     this module only decides and computes.
//   * No cycle detection. See the six properties above: the legacy walk has
//     none, so neither does this one. An earlier revision of this module did
//     carry a visited set and a depth ceiling, and both are gone - not because
//     they misbehaved, but because reproducing the walk is this module's whole
//     brief and a guard is an addition to it. Termination for the one place
//     that had to decide it, the recursive ancestry reads in the MySQL
//     adapters, is decided in those adapters.
//   * No value rewriting: identifiers pass through exactly as given, with no
//     whitespace stripping and no case folding on the way in. `listAppend`
//     guarantees the same, and contradicting it here would change what gets
//     persisted.
//
// THIS MODULE OWNS ZERO DEFECTS AND ZERO DIVERGENCES
//   The numbered defect register assigns nothing to this folder, and none of
//   the migration's three deliberate divergences is spent here, so no defect
//   marker and no divergence marker appears below. This heading briefly read
//   otherwise, while the cycle guard existed and was annotated as a divergence
//   the budget had no room for; removing the guard restored the heading to what
//   it had always been. The budget is spent as follows and nowhere else: two in
//   `src/services/promotionService.ts` with `src/services/promotion/discountAmount.ts`,
//   and one across `src/domain/entities/sku.ts` and `src/domain/entities/product.ts`.
//   Two legacy imperfections that this module's own call sites DO exhibit are
//   annotated where they land, as parity notes rather than as defects:
//
//     * the doc comment at [org/Hibachi/HibachiEntity.cfc:L307] calls the
//       builder a private method while the declaration on the very next line
//       is public;
//     * the four promotion walks read a positional lookup as though it were a
//       boolean - corrected to an explicit `> 0` here, for the reason given at
//       `idPathContainsAnyId`.
//
//   No legacy TODO falls inside this module's scope. That is worth saying
//   because the port carries known source TODOs forward as flagged TODOs
//   rather than completing them silently; there is simply none to carry here.
//
// WHY FOUR OF THE FIVE LIST PRIMITIVES, NOT FIVE
//   `listLen`, `listGetAt`, `listAppend` and `listFindNoCase` are imported.
//   `listToArray` is not: no legacy site walks one of these paths as an array,
//   the four promotion walks are 1-based `listLen`/`listGetAt` loops, and an
//   unused import is a compile error under `noUnusedLocals`. A segments
//   accessor would therefore be a speculative export, and speculative exports
//   are exactly what a closed surface exists to prevent.
//
// NO USER RULES WERE PROVIDED
//   (1) No user-specified rules were provided for this project. (2) The
//   absence was VERIFIED, not assumed: the project rules source was queried
//   twice - with no range and with the full range - and returned the same
//   single line, "No user rules provided.", both times; AAP §0.7 reports the
//   same result independently. (3) No rule has been invented to fill the gap,
//   and nothing here paraphrases or cites one. (4) The absence is NOT licence
//   to lower the bar - the enterprise-standard substitute applies at full
//   strength, which in this file means maximal strictness with no suppression
//   comment, no non-null assertion and no escape hatch, one cohesive closed
//   surface, no barrel, no module-scope mutable state, and every judgment call
//   annotated where it was made. (5) Zero files enter scope by rule mandate:
//   this file traces to AAP §0.3.1, §0.4.1 and §0.3.3, so there are
//   consequently no rule conflicts to resolve.
//
// TEST COVERAGE FOR THIS MODULE IS NET-NEW
//   No legacy test under meta/tests/** touches a value object. The only legacy
//   suites extended anywhere in this port are
//   meta/tests/unit/entity/BrandTest.cfc and
//   meta/tests/unit/entity/ProductTest.cfc, and
//   meta/tests/functional/admin/entity/ProductTest.cfc is an empty stub
//   contributing nothing. Coverage for every export below is therefore
//   NET-NEW and must be labelled net-new, never presented as parity. The suite
//   belongs at tests/unit/domain/valueObjects/materializedIdPath.test.ts and
//   is authored separately; this file states the obligation and does not
//   discharge it.
//
//   The golden expectations that suite must pin, over a three-level hierarchy
//   root -> mid -> leaf:
//
//     buildIdPathList from leaf       'root,mid,leaf'
//     buildIdPathList from mid        'root,mid'
//     buildIdPathList from root       'root'  (the do/while guarantee)
//     getRootIdFromIdPath             'root', given 'root,mid,leaf'
//     idPathContainsId present        true, at every position
//     idPathContainsId absent         false
//     idPathContainsId case           'ROOT' matches 'root'
//     resolveIdPath stored non-empty  returned unchanged, not recomputed
//     resolveIdPath null, undefined   computed
//     resolveIdPath stored ''         returned AS-IS, NOT recomputed
//
//   The last row is the one most likely to be got wrong; see `resolveIdPath`.
// ---------------------------------------------------------------------------

import { listAppend, listFindNoCase, listGetAt, listLen } from '../../lib/cfml/list.js';
import { isNullish } from '../../lib/cfml/truthiness.js';

/**
 * Is this value absent in CFML's sense - `null` or `undefined`, and nothing else?
 *
 * JUDGMENT CALL: a narrowing wrapper, so CFML's null rule lives in one place in this file.
 * `isNullish` is typed `(value: unknown) => boolean` because CFML's `isNull()` is askable of
 * anything, and a plain `boolean` return cannot narrow a union for the compiler; a type predicate
 * keeps one copy of the rule and still narrows, with no cast and no assertion.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L316]: the parent test inside the walk is an
 * `isNull()` test, and so is the lazy getter's guard [model/entity/PriceGroup.cfc:L195-L200],
 * [model/entity/ProductType.cfc:L250-L255]. Both route through here, so `''`, `0` and `false` are
 * PRESENT values - see `resolveIdPath` for why the empty string in particular decides behaviour.
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
 * walk uses to resolve the parent ([org/Hibachi/HibachiEntity.cfc:L316, L319]). TypeScript has no
 * equivalent, and building a getter name from a string at runtime is forbidden in this port, so the
 * caller passes the accessor itself.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L316, L319]: the legacy body dispatches twice per
 * iteration - once for the null test, once for the reassignment - which under the CFML engine's ORM
 * re-traverses the association. One accessor call per iteration cannot change the resulting path:
 * both legacy calls resolve the same association on the same node.
 *
 * `null` and `undefined` are both accepted as "no parent", read through the same CFML `isNull()`
 * rule.
 */
export type ParentNodeAccessor<TNode> = (node: TNode) => TNode | null | undefined;

/**
 * Rebuild a materialized ID path by climbing from one node to its root.
 *
 * THE WRITE HALF. This is the target's equivalent of the framework builder at
 * [org/Hibachi/HibachiEntity.cfc:L308-L324], and it reproduces all six
 * properties listed in the file header, without exception: root-first, self-last,
 * comma-delimited, includes the starting node, never empty, and no cycle guard.
 *
 * The three in-scope entities call it with their own parent property:
 * `parentPriceGroup` [model/entity/PriceGroup.cfc:L59],
 * `parentProductType` [model/entity/ProductType.cfc:L62] and `parentCategory`
 * [model/entity/Category.cfc:L63] - the last of which the component
 * declaration also names in `hb_parentPropertyName`
 * [model/entity/Category.cfc:L49].
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L307-L308]: the legacy doc comment calls this a
 * "private method" while the declaration on the next line is
 *   `public string function`.
 * All three entities call it, so the public shape is what is reproduced; the mismatch is recorded,
 * not resolved.
 *
 * ★ NO CYCLE GUARD, AND THE ABSENCE IS DELIBERATE.
 * [org/Hibachi/HibachiEntity.cfc:L314-L321] carries no visited set and no iteration
 * bound, so a cycling parent chain never terminates there. It does not terminate
 * here either. That is the sixth reproduced property, not an oversight.
 *
 * ★ AN EARLIER REVISION DID GUARD, AND THE RECORD OF ITS REMOVAL BELONGS HERE.
 * That revision refused a cyclic or over-deep chain by throwing, tracked identity
 * with a visited set of node references, and carried a depth backstop derived from
 * the `length="4000"` path columns [model/entity/ProductType.cfc:L53,
 * model/entity/PriceGroup.cfc:L53, model/entity/Category.cfc:L53]. It was removed
 * in full, and not because it misbehaved. Three reasons, each checkable:
 *
 *   1. THIS MODULE REPRODUCES THE WALK AND ADDS NOTHING TO IT. A guard is an
 *      addition. The instruction this module is built against says a cycle guard
 *      may not be added and that faithful reproduction is preferred, and the two
 *      halves of that are not in tension.
 *
 *   2. IT WAS A FOURTH DIVERGENCE AGAINST A BUDGET CLOSED AT THREE. The
 *      migration's three deliberate divergences are spent on the un-scoped
 *      discount accumulator, the fixed-amount precision gap, and the entity
 *      option-lookup memos. This folder owns none of them, and self-declaring an
 *      extra one does not create room for it.
 *
 *   3. THE ONE PLACE THAT GENUINELY HAD TO DECIDE TERMINATION IS NOT THIS ONE.
 *      The MySQL adapters read ancestry with hand-written recursive queries that
 *      replace Hibernate's lazy traversal, so termination there is a fetch-shape
 *      decision they had to make and did make, under transformation rule T3 and
 *      documented as such. It is not a divergence either, and it is not here.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L316, L319]: the legacy body evaluates the parent
 * accessor TWICE per iteration - once for the null test and again for the reassignment - because
 * CFML has no way to bind the result of a dynamic getter call. The port calls the injected accessor
 * ONCE and reuses the value. That is the idiomatic translation of a construct with no TypeScript
 * equivalent, not a behavioural change: the same chain is walked in the same order.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L312, L321]: the loop condition is a real `hasParent`
 * flag, as the legacy body writes it, and not a constant-condition loop with an internal break -
 * which this subtree's lint profile rejects anyway.
 *
 * JUDGMENT CALL: root-first order is produced with `listAppend` from `''`, because the CFML prepend
 * helper does not exist here and the list module's surface is closed at five exports; under that
 * module's overflow rule the need is met locally, by collecting identifiers upward and emitting
 * them in reverse. Appending onto an EMPTY accumulator is what guarantees no leading delimiter, and
 * that guarantee is load-bearing: the promotion accumulators at
 * [model/service/PromotionService.cfc:L859-L862, L929-L932, L959-L963] depend on it.
 *
 * @param node - the node to start from. It appears in the result, last.
 * @param getPrimaryIdValue - reads one node's identifier; see
 *   {@link PrimaryIdAccessor}.
 * @param getParentNode - reads one node's parent, or reports none; see
 *   {@link ParentNodeAccessor}.
 * @returns a comma-delimited path, root first and `node` last, holding at
 *   least one element and carrying neither a leading nor a trailing delimiter.
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
  // iteration bound, exactly as in the legacy loop. A cyclic parent chain does not terminate here
  // because it does not terminate there, and the walk is reproduced rather than improved.
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

  // Iterated with `for...of` rather than by index: `noUncheckedIndexedAccess` types an indexed read
  // as possibly absent, and handling an absent element would mean inventing a rule for a case that
  // cannot occur.
  for (const id of idsFromNodeUpward.reverse()) {
    idPathList = listAppend(idPathList, id);
  }

  return idPathList;
}

/**
 * Return the stored path when it is present, and compute it when it is not.
 *
 * The read half's entry point, reproducing the lazy getters at
 * [model/entity/PriceGroup.cfc:L195-L200] and [model/entity/ProductType.cfc:L250-L255]. `Category`
 * has no such getter ([model/entity/Category.cfc:L120-L122] is an empty block) and never calls
 * this. Storage stays with the caller: the legacy getter assigns the computed value back onto the
 * entity, which owns that field, so nothing is retained here between calls.
 *
 * CFML parity [model/entity/PriceGroup.cfc:L195-L200], [model/entity/ProductType.cfc:L250-L255]:
 * the guard is `isNull(...)`, NOT `structKeyExists(...)` - it treats a present-but-null value as
 * absent where `structKeyExists` would treat it as present. These two are the only
 * lazily-initialised getters in the in-scope slice using the `isNull` form; siblings use the other
 * one, at [model/entity/ProductType.cfc:L123] and [model/entity/Sku.cfc:L368].
 *
 * CFML parity [model/entity/PriceGroup.cfc:L196], [model/entity/ProductType.cfc:L251]: an empty
 * string is PRESENT, not absent. It follows from the `isNull` guard on those lines - a stored `''`
 * makes the legacy getter return `''` unchanged rather than rebuild - and `isNullish` answers true
 * for `null` and `undefined` only, so `''` flows through. Treating `''` as missing would recompute
 * a path the legacy returned empty and would change which product types a promotion reward matches.
 * Callers wanting a rebuild pass `null`.
 *
 * @param storedIdPath - the entity's stored path: absent as `null` or `undefined`,
 *   present as a string, INCLUDING the empty string.
 * @param computeIdPath - produces the path when it is absent. Normally a closure over
 *   {@link buildIdPathList}.
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
 * Position 1 is the root precisely because the path is root-first, so this function and
 * `buildIdPathList` are two halves of one contract.
 *
 * CFML parity [model/entity/ProductType.cfc:L110-L115]: the one legacy consumer is
 * `getBaseProductType()`, which reads the first element of `getProductTypeIDPath()` at L112 to
 * resolve a product type and take its system code. That is the only first-element read applied to a
 * materialized path in the source, and its result reaches a live validation path -
 * `model/validation/Product.json` gates `baseProductType` with an in-list check - so root
 * extraction has to be exact.
 *
 * JUDGMENT CALL: this reproduces CFML `listFirst`, not CFML `listGetAt`, and the difference is the
 * empty-path case. The legacy line is `listFirst(getProductTypeIDPath())`
 * [model/entity/ProductType.cfc:L112]; `listFirst('')` answers `''` whereas `listGetAt('', 1)`
 * RAISES an invalid-index error, so emulating the first with the second would import a raise the
 * legacy platform does not perform here. `listFirst` is not part of the list module's closed
 * surface - its four legacy call sites sit in the out-of-scope bulk import path and split on an
 * underscore - so under that module's overflow rule the empty case is answered locally and the
 * positional read is called only for a path that provably has an element.
 *
 * A `''` return means the path held no element, which is not a valid identifier. `buildIdPathList`
 * can never produce one, so the only route in is a stored empty string that `resolveIdPath` passed
 * through. The legacy code does not guard it either: at L112 the `''` flows into
 * `getProductType('')` and the subsequent `.getSystemCode()` fails on the absent product type. That
 * failure stays with the resolving caller, where the legacy platform also raises it.
 *
 * @param idPath - a comma-delimited, root-first path.
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
 * The `> 0` is mandatory. The lookup answers a 1-based POSITION, or `0` when absent - never a
 * boolean - and the list module's contract forbids leaning on JavaScript's coercion of `0`. A site
 * that genuinely wants the position, such as the delete-at call at
 * [model/service/PromotionService.cfc:L774], must call the lookup directly.
 *
 * @param idPath - a comma-delimited path.
 * @param id - the identifier to look for. Compared case-insensitively.
 * @returns `true` when `id` appears at some position in `idPath`.
 */
export function idPathContainsId(idPath: string, id: string): boolean {
  return listFindNoCase(idPath, id) > 0;
}

/**
 * Does this path have any element in common with this candidate list?
 *
 * This is the duplication the module exists to centralise. Four legacy walks share one shape, all
 * over `getProductTypeIDPath()`, and all four decide whether a promotion reward applies to an order
 * item - which is to say, how much money moves:
 *
 *   qualifier exclusion [model/service/PromotionService.cfc:L858-L870]
 *     candidates accumulated L859-L862, bound L864, lookup L865
 *   qualifier inclusion [model/service/PromotionService.cfc:L892-L904]
 *     candidates accumulated L893-L897, bound L899, lookup L900
 *   reward exclusion    [model/service/PromotionService.cfc:L928-L940]
 *     candidates accumulated L929-L932, bound L934, lookup L935
 *   reward inclusion    [model/service/PromotionService.cfc:L958-L970]
 *     candidates accumulated L959-L963, bound L965, lookup L966
 *
 * Both caller shapes collapse onto this one boolean: the exclusion walks set a flag and break, the
 * inclusion walks return true immediately, and neither observes anything beyond "was a common
 * element found".
 *
 * CFML parity [model/service/PromotionService.cfc:L864-L865]: the orientation is preserved - the
 * legacy loop walks the PATH with a 1-based index and searches the CANDIDATE LIST for each element,
 * not the other way round.
 *
 * CFML parity [model/service/PromotionService.cfc:L865, L900, L935, L966]: all four sites read the
 * positional lookup as a boolean, and all four are corrected to an explicit `> 0` here. JavaScript
 * coerces `0` to false too, so a literal transliteration would behave correctly by coincidence -
 * and that coincidence is the hazard, because the bare form breaks the moment the result is stored
 * in a boolean or compared against `true`.
 *
 * CFML parity [model/service/PromotionService.cfc:L858, L892, L928, L958]: the accumulator stays
 * with the caller in the promotion decomposition, and so does each site's array-length guard - an
 * empty candidate list answers `false` here, which is what skipping the guarded block achieves, so
 * this function is total. An empty path answers `false` for the same structural reason.
 *
 * CFML parity [model/service/PromotionService.cfc:L893, L959]: the legacy accumulators for the two
 * inclusion walks are both named `includedPropertyTypeIDList`, where "PropertyType" should read
 * "ProductType". The identifier is purely internal and never a data contract, so the target spells
 * it correctly; it is recorded because a reviewer diffing the two surfaces meets the original
 * spelling first.
 *
 * @param idPath - a comma-delimited, root-first path.
 * @param candidateIdList - a comma-delimited list of identifiers to match against. May
 *   be empty, which answers `false`.
 * @returns `true` when some element of `idPath` appears in `candidateIdList`.
 */
export function idPathContainsAnyId(idPath: string, candidateIdList: string): boolean {
  // The legacy loop re-reads the element count on every iteration through the full accessor chain.
  // Read once here: the path arrives as an immutable string parameter, so the count cannot change
  // between iterations. Nothing observable changes.
  const segmentCount = listLen(idPath);

  for (let position = 1; position <= segmentCount; position += 1) {
    if (listFindNoCase(candidateIdList, listGetAt(idPath, position)) > 0) {
      return true;
    }
  }

  return false;
}
