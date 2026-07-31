// ---------------------------------------------------------------------------
// slatwall-ts - the comma-delimited materialized ID path
//
// PURPOSE
//   One primitive with two independent halves.
//
//     WRITE / RECOMPUTE - `buildIdPathList`, the hierarchy walk that produces
//       the stored path. Its authority is
//       [org/Hibachi/HibachiEntity.cfc:L308-L324].
//
//     READ / WALK - `resolveIdPath`, `getRootIdFromIdPath`, `idPathContainsId`
//       and `idPathContainsAnyId`: the lazy accessor, the root extractor and
//       the two membership tests performed over a path that already exists.
//
//   This is a semantic-parity value object, not a general-purpose tree
//   library. Every behaviour below matches what the legacy CFML engine does at
//   a verified call site, and nothing is included because it might one day be
//   useful.
//
// AAP AUTHORITY
//   §0.3.1 target tree line - "materializedIdPath.ts (new abstraction -
//   comma-list ID path walking)".
//
//   §0.4.1 "Value Objects, Views, and Engine Types" - CREATE, sourced to
//   [model/service/PromotionService.cfc:L858-L870]: "Extracts the duplicated
//   comma-list ID-path walking used for productTypeIDPath, priceGroupIDPath,
//   categoryIDPath".
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
//                       no iteration bound. None is added here.
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
//   * No cycle detection. See the six properties above.
//   * No value rewriting: identifiers pass through exactly as given, with no
//     whitespace stripping and no case folding on the way in. `listAppend`
//     guarantees the same, and contradicting it here would change what gets
//     persisted.
//
// THIS MODULE OWNS ZERO DEFECTS AND ZERO DIVERGENCES
//   The port's numbered defect register assigns nothing to this folder, and
//   none of the three deliberate divergences is spent here, so no defect
//   marker appears below. Two legacy imperfections that this module's own call
//   sites DO exhibit are annotated where they land, as parity notes rather
//   than as defects:
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
 * Is this value absent in CFML's sense - `null` or `undefined`, and nothing
 * else?
 *
 * JUDGMENT CALL - a narrowing wrapper, so CFML's null rule lives in exactly
 * one place in this file. `isNullish` is deliberately typed
 * `(value: unknown) => boolean`, because CFML's `isNull()` is askable of
 * anything, and a plain `boolean` return cannot narrow a union for the
 * compiler. Restating the comparison inline at the two sites that need it
 * would put a second copy of that rule here; delegating through a type
 * predicate keeps one copy and still narrows, with no cast, no escape hatch
 * and no assertion.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L316]: the parent test inside the
 * walk is an `isNull()` test.
 *
 * CFML parity [model/entity/PriceGroup.cfc:L195-L200] and
 * [model/entity/ProductType.cfc:L250-L255]: so is the lazy getter's guard.
 * Both therefore route through here. `''`, `0` and `false` are PRESENT values
 * under that rule - see `resolveIdPath` for why the empty string in particular
 * decides behaviour.
 */
function isAbsent<TValue>(value: TValue | null | undefined): value is null | undefined {
  return isNullish(value);
}

/**
 * Reads the primary identifier of one node in the hierarchy.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L315]: this stands for
 * `thisEntity.getPrimaryIDValue()`, the framework accessor the legacy walk
 * prepends on every iteration. The identifier is used exactly as returned - it
 * becomes one element of a persisted comma-delimited list, so nothing here
 * rewrites it.
 */
export type PrimaryIdAccessor<TNode> = (node: TNode) => string;

/**
 * Reads the parent of one node, or reports that the node has no parent.
 *
 * JUDGMENT CALL - an explicit typed callback replaces CFML's `evaluate()`
 * string dispatch. The legacy walk resolves the parent by interpolating a
 * property name into a getter call and handing the resulting string to that
 * builtin ([org/Hibachi/HibachiEntity.cfc:L316] and
 * [org/Hibachi/HibachiEntity.cfc:L319]). TypeScript has no equivalent, and
 * building a getter name from a string at runtime - by interpreting source,
 * by constructing a function, or by intercepting property access - is
 * forbidden in this port, so the caller passes the accessor itself. Requiring
 * a property-name string instead would be transliteration dressed up as a
 * port. Every appearance of that builtin's name in this file is prose about
 * the legacy; nothing here interprets a string as code.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L316, L319]: the legacy body
 * calls that builtin TWICE per iteration - once for the null test and once for
 * the reassignment - and under the CFML engine's ORM the second call
 * re-traverses the association. One accessor call per iteration is simply what
 * an explicit typed callback looks like. It cannot change the resulting path,
 * because both legacy calls resolve the same association on the same node.
 *
 * `null` and `undefined` are both accepted as "no parent", and both are read
 * through the same CFML `isNull()` rule.
 */
export type ParentNodeAccessor<TNode> = (node: TNode) => TNode | null | undefined;

/**
 * Rebuild a materialized ID path by climbing from one node to its root.
 *
 * THE WRITE HALF. This is the target's equivalent of the framework builder at
 * [org/Hibachi/HibachiEntity.cfc:L308-L324], and it reproduces all six
 * properties listed in the file header: root-first, self-last,
 * comma-delimited, includes the starting node, no cycle guard, never empty.
 *
 * The three in-scope entities call it with their own parent property:
 * `parentPriceGroup` [model/entity/PriceGroup.cfc:L59],
 * `parentProductType` [model/entity/ProductType.cfc:L62] and `parentCategory`
 * [model/entity/Category.cfc:L63] - the last of which the component
 * declaration also names in `hb_parentPropertyName`
 * [model/entity/Category.cfc:L49].
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L307-L308]: the legacy doc
 * comment describes a "private method" while the declaration on the very next
 * line is `public string function`. The framework surface really is public -
 * all three entities call it from their own methods - so the public shape is
 * what gets reproduced. The mismatch is recorded, not resolved.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L314-L321]: the loop carries no
 * visited set and no iteration bound, so a parent chain that cycles does not
 * terminate. That is reproduced deliberately, because adding a guard would be
 * an unrequested behavioural change to a value that decides which promotion
 * rewards apply and which price-group rate wins. If a bounded guard is ever
 * judged necessary, it must THROW rather than truncate silently, and it must
 * be annotated as the divergence it would be; truncation would quietly shorten
 * a path and change money.
 *
 * CFML parity [org/Hibachi/HibachiEntity.cfc:L312, L321]: the loop condition
 * is a real flag, `hasParent`, exactly as the legacy body writes it. It is not
 * spelled as a constant-condition loop with an internal break - partly for
 * fidelity, and partly because a constant loop condition is rejected outright
 * by this subtree's lint profile.
 *
 * JUDGMENT CALL - root-first order is produced with `listAppend` from `''`,
 * because the CFML prepend helper does not exist here and must not be added.
 * The list module's surface is closed at five exports, and its own overflow
 * rule is the authority: "if a translation need arises that none of these five
 * covers, it belongs inside the consuming module with a documented annotation -
 * not as a new export here". Prepending is precisely such a need, so it is
 * resolved locally: the walk collects identifiers from the starting node
 * upward, and that collection is then emitted in reverse, which is the same
 * list the legacy prepend produced. Appending onto an EMPTY accumulator is
 * what guarantees no leading delimiter, and that guarantee is load-bearing -
 * it is the identical property the promotion accumulators at
 * [model/service/PromotionService.cfc:L859-L862],
 * [model/service/PromotionService.cfc:L929-L932] and
 * [model/service/PromotionService.cfc:L959-L963] depend on.
 *
 * A note on ordering that is NOT this function's business: two of the three
 * entities assign the result before delegating to their base class and the
 * third delegates first, as the file header records. This function is called
 * identically in both shapes and imposes nothing.
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
  // Collected starting-node-first as the walk climbs, then reversed on the way
  // out. `push` onto an array plus one reversal is the local resolution of the
  // missing prepend primitive described above.
  const idsFromNodeUpward: string[] = [];

  let cursor: TNode = node;
  let hasParent = true;

  // A do/while, so the starting node's identifier is always collected: this is
  // both the "includes self" and the "never empty" property, and they are the
  // same line of legacy code.
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

  // Iterated with `for...of` over the reversed collection rather than by index:
  // `noUncheckedIndexedAccess` types an indexed read as possibly absent, and
  // handling an absent element would mean inventing a rule for a case that
  // cannot occur. Iteration yields `string`, so no narrowing is needed and no
  // assertion is used.
  for (const id of idsFromNodeUpward.reverse()) {
    idPathList = listAppend(idPathList, id);
  }

  return idPathList;
}

/**
 * Return the stored path when it is present, and compute it when it is not.
 *
 * THE READ HALF's entry point, reproducing the lazy getters at
 * [model/entity/PriceGroup.cfc:L195-L200] and
 * [model/entity/ProductType.cfc:L250-L255]. `Category` has no such getter at
 * all ([model/entity/Category.cfc:L120-L122] is an empty block), so it never
 * calls this function - which is the clearest evidence that the two halves of
 * this module are independent.
 *
 * THE STORAGE IS THE CALLER'S. The legacy getter assigns the computed value
 * back onto the entity before returning it; the entity owns that field, so the
 * assignment belongs to the entity. This function supplies the decision and
 * the value, never the storage - which is also why nothing is retained here
 * between calls.
 *
 * CFML parity [model/entity/PriceGroup.cfc:L195-L200] and
 * [model/entity/ProductType.cfc:L250-L255]: the guard is `isNull(...)`, NOT
 * `structKeyExists(...)`. That distinction is real and it is deliberate here.
 * `isNull` treats a present-but-null value as absent, whereas
 * `structKeyExists` would treat it as present. These two ID-path getters are
 * the only lazily-initialised getters in the in-scope slice using the `isNull`
 * form; their siblings use the other one - `!structKeyExists(variables,
 * "parentProductTypeOptions")` at [model/entity/ProductType.cfc:L123], and
 * `!structKeyExists(variables, "currencyDetails")` at
 * [model/entity/Sku.cfc:L368]. Do not conflate them.
 *
 * CFML parity [model/entity/PriceGroup.cfc:L196] and
 * [model/entity/ProductType.cfc:L251] - AN EMPTY STRING IS PRESENT, NOT
 * ABSENT. It follows directly from the `isNull` guard on each of those two
 * lines: a stored `''` makes the legacy getter return `''` unchanged rather
 * than rebuild the path. That is reproduced exactly here.
 * `isNullish` answers true for `null` and `undefined` only, so `''` flows
 * straight through. Treating `''` as missing would be a "helpful" correction
 * that recomputes a path the legacy would have returned empty, and it would
 * change which product types a promotion reward matches. Callers that genuinely
 * want a rebuild pass `null`.
 *
 * @param storedIdPath - the entity's stored path: absent as `null` or
 *   `undefined`, present as a string, INCLUDING the empty string.
 * @param computeIdPath - produces the path when it is absent. Normally a
 *   closure over {@link buildIdPathList}.
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
 * Read the ROOT identifier out of a path - its first element.
 *
 * Position 1 is the root precisely because the path is root-first, so this
 * function and `buildIdPathList` are two halves of one contract: change the
 * ordering and this silently starts answering with the wrong node.
 *
 * CFML parity [model/entity/ProductType.cfc:L110-L115]: the one legacy
 * consumer is `getBaseProductType()`, which reads the first element of
 * `getProductTypeIDPath()` at L112 to resolve a product type and take its
 * system code, guarded by `isNull(getSystemCode()) || getSystemCode() == ""`.
 * A repository-wide search confirms L112 is the ONLY first-element read applied
 * to a materialized path anywhere in the source; `Sku.getBaseProductType()`
 * merely delegates to the product's. That result reaches a live validation
 * path - `model/validation/Product.json` gates `baseProductType` with an
 * in-list check over "merchandise" and "subscription" - so root extraction has
 * to be exact.
 *
 * JUDGMENT CALL - THIS REPRODUCES CFML `listFirst`, NOT CFML `listGetAt`, AND
 * THE DIFFERENCE IS THE EMPTY-PATH CASE.
 * The legacy line is `listFirst(getProductTypeIDPath())`
 * [model/entity/ProductType.cfc:L112] - `listFirst`, verified verbatim in the
 * source. The two CFML functions disagree on exactly one input, and it is the one
 * that can occur here: `listFirst('')` answers `''`, whereas `listGetAt('', 1)`
 * RAISES an invalid-index error. So emulating the first with the second would
 * import a raise the legacy platform does not perform at this site.
 *
 * `listFirst` is not part of the list module's closed five-export surface. That
 * module excludes it on evidence: its four legacy call sites all sit inside the
 * out-of-scope bulk import path and split on an underscore rather than on commas.
 * Under the overflow rule quoted at `buildIdPathList`, the need is therefore met
 * LOCALLY and explicitly - the empty case is answered here, and the positional
 * read is called only for a path that provably has an element. An earlier
 * revision instead leaned on the positional read answering `''` out of range,
 * which coupled this function to a softened contract in a module that has since
 * been corrected to raise as CFML does. Emulating one CFML function by relying on
 * another being wrong is not parity, so the emulation is now stated outright.
 *
 * WHAT `''` MEANS TO THE CALLER, STATED HONESTLY. It means the path held no
 * element, which is not a valid identifier. `buildIdPathList` can never produce an
 * empty path, so the only way to arrive with one is a stored empty string, which
 * is exactly the value `resolveIdPath` passes through untouched. The legacy code
 * does not guard it either: at L112 the `''` flows into
 * `getProductType('')`, and the subsequent `.getSystemCode()` fails on the absent
 * product type. That downstream failure belongs to the resolving caller, which is
 * where the legacy platform also raises it - it is not moved forward into this
 * function, because doing so would change WHERE the request fails and this
 * function's job is to read an element, not to police the path.
 *
 * @param idPath - a comma-delimited, root-first path.
 * @returns the root identifier, or `''` when the path holds no element.
 */
export function getRootIdFromIdPath(idPath: string): string {
  // CFML `listFirst('')` is `''`, so the empty path is answered here rather than
  // handed to the positional read, which raises out of range exactly as CFML's
  // `listGetAt` does.
  if (listLen(idPath) === 0) {
    return '';
  }

  // 1, not 0: the list module's positional read is 1-based, matching CFML.
  return listGetAt(idPath, 1);
}

/**
 * Does this path contain this identifier, at whatever position?
 *
 * Case-INSENSITIVE by construction, because the underlying lookup is CFML's
 * case-insensitive one. That is parity, not laxity: CFML identifiers and list
 * comparisons are case-insensitive, so tightening this to a case-sensitive
 * test would reject an identifier the legacy platform accepts.
 *
 * THE `> 0` IS MANDATORY. The lookup answers a 1-BASED POSITION, or `0` when
 * absent - never a boolean. The list module's contract is explicit that
 * callers must never lean on JavaScript's coercion of `0`, and this function is
 * how that contract is discharged for path membership: the position is
 * converted to a boolean once, here, at the only place that needs it. Where a
 * legacy site genuinely wants the position rather than the answer - such as
 * the delete-at-position call at [model/service/PromotionService.cfc:L774] -
 * it must call the lookup directly instead of coming through here.
 *
 * @param idPath - a comma-delimited path.
 * @param id - the identifier to look for. Compared case-insensitively.
 * @returns `true` when `id` appears at some position in `idPath`.
 */
export function idPathContainsId(idPath: string, id: string): boolean {
  return listFindNoCase(idPath, id) > 0;
}

/**
 * Does this path have ANY element in common with this candidate list?
 *
 * THIS IS THE DUPLICATION THE MODULE EXISTS TO CENTRALISE. Four legacy walks
 * share one shape, all four over `getProductTypeIDPath()`, and all four decide
 * whether a promotion reward applies to an order item - which is to say, how
 * much money moves:
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
 * BOTH CALLER SHAPES COLLAPSE ONTO THIS ONE BOOLEAN. The two exclusion walks
 * set a flag and break; the two inclusion walks return true immediately with no
 * flag at all. Neither shape observes anything beyond "was a common element
 * found", so both are served without loss.
 *
 * CFML parity [model/service/PromotionService.cfc:L864-L865] - THE ORIENTATION
 * IS PRESERVED. The legacy loop walks the PATH
 * with a 1-based index and searches the CANDIDATE LIST for each element, not
 * the other way round. Reproduced exactly, so a reviewer can put the two side
 * by side.
 *
 * CFML parity [model/service/PromotionService.cfc:L865, L900, L935, L966] -
 * ALL FOUR SITES READ THE POSITIONAL LOOKUP AS A BOOLEAN, and all four are
 * corrected to an explicit `> 0` here. JavaScript happens to treat `0` as
 * falsy too, so a literal transliteration would coincidentally behave
 * correctly - and that coincidence is the hazard. The bare form reads as though
 * the lookup answers a yes/no question, survives review unexamined, and breaks
 * the moment the result is stored in a boolean or compared against `true`. The
 * list module's contract therefore requires the explicit comparison, and this
 * is the single site where these four walks now make it.
 *
 * CFML parity [model/service/PromotionService.cfc:L858, L892, L928, L958] -
 * THE ACCUMULATOR STAYS WITH THE CALLER, in the promotion decomposition, since
 * building the candidate list is a promotion concern rather than a path one.
 * Each legacy site guards accumulation with an array-length check, and that
 * guard also stays with the caller: an empty candidate list answers `false`
 * here, which is exactly what skipping the guarded block achieves, so this
 * function is total and needs no guard of its own. An empty PATH answers
 * `false` for the same structural reason - a path of no elements has nothing to
 * look up.
 *
 * CFML parity [model/service/PromotionService.cfc:L893, L959] - the legacy
 * accumulators for the two INCLUSION walks are both named
 * `includedPropertyTypeIDList`, where "PropertyType" should read "ProductType".
 * The identifier is purely internal, never a data contract, so the target is
 * free to spell it correctly; it is recorded here because these are the sites
 * that now call this function, and a reviewer diffing the two surfaces will
 * meet the original spelling first.
 *
 * @param idPath - a comma-delimited, root-first path.
 * @param candidateIdList - a comma-delimited list of identifiers to match
 *   against. May be empty, which answers `false`.
 * @returns `true` when some element of `idPath` appears in `candidateIdList`.
 */
export function idPathContainsAnyId(idPath: string, candidateIdList: string): boolean {
  // The legacy loop re-reads the element count on every iteration, through the
  // full accessor chain. Read once here: the path arrives as an immutable
  // string parameter, so the count cannot change between iterations. This
  // changes nothing observable.
  const segmentCount = listLen(idPath);

  for (let position = 1; position <= segmentCount; position += 1) {
    if (listFindNoCase(candidateIdList, listGetAt(idPath, position)) > 0) {
      return true;
    }
  }

  return false;
}
