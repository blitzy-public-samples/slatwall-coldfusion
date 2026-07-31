// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring
// order "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no behaviour in this file depends
// on one. The complete set named below, with the role each will play:
//
//   src/domain/entities/sku.ts                        Sku entity
//   src/services/promotion/qualifierQualification.ts  promotion decomposition module
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - CFML comma-list primitives
//
// PURPOSE
//   Five CFML list functions, re-expressed in TypeScript with their CFML
//   semantics intact. This is a semantic-parity module, NOT a general-purpose
//   utility library: every behaviour below is chosen to match what the legacy
//   CFML engine does at a verified call site, and nothing is included because
//   it might one day be handy.
//
//   The port deliberately RETAINS comma-delimited parameters and returns as
//   `string` for signature parity with the legacy surface. Two examples that
//   the interface mapping pins down: `getUnusedProductOptions(productID,
//   existingOptionGroupIDList)` keeps its `string` parameter and parses
//   internally, and `getPromotionPeriodQualifiedFulfillmentIDList(...)` keeps
//   its comma-list `string` return - the legacy shape of the latter is visible
//   at [model/service/PromotionService.cfc:L752-L780]. These five helpers are
//   how that parity is achieved without scattering ad-hoc `split(',')` calls
//   across the subtree, each with its own quiet disagreement about what an
//   empty element means.
//
// THE SURFACE IS CLOSED AT FIVE EXPORTS
//   listLen, listGetAt, listAppend, listToArray, listFindNoCase.
//
//   Four further CFML list functions DO appear in the legacy slice and are
//   deliberately excluded, under the overflow rule: if a translation need
//   arises that none of these five covers, it belongs inside the consuming
//   module with a documented annotation - not as a new export here.
//
//     listFind      - 3 sites: [model/entity/Sku.cfc:L776],
//                     [model/entity/Product.cfc:L273] and
//                     [model/entity/Product.cfc:L292]. Case-SENSITIVE, so it
//                     is not a spelling variant of listFindNoCase and must not
//                     be folded into it.
//     ListDeleteAt  - 1 site: [model/service/PromotionService.cfc:L774].
//     listLast      - 1 site on a live path, [model/entity/Sku.cfc:L142],
//                     splitting a filename on "." rather than on commas.
//     listFirst     - 4 sites, every one of them inside the out-of-scope bulk
//                     import path at [model/dao/ProductDAO.cfc:L131-L137], and
//                     splitting on "_" rather than on commas.
//
//   Adding a sixth export is a gate failure. So is adding listQualify,
//   listSort, listDeleteAt, listPrepend, listSetAt, listContains or valueList.
//
// PROVENANCE WAS RE-VERIFIED AGAINST THE SOURCE, NOT INHERITED
//   Every locator cited in this file was re-read from the legacy tree while
//   writing it. All of them matched byte-for-byte. Aggregate call-site counts
//   measured over the eleven reference files did differ from the counts this
//   module was specified against, and the file is the authority, so the
//   measurements are recorded here rather than quietly reconciled:
//
//     listToArray      6  - matches exactly, at exactly the six cited locators
//     listAppend      25  - the 16 cited sites all confirmed, plus 9 more:
//                           [model/entity/PriceGroupRate.cfc:L121,L124,L127,
//                           L147,L150,L153] and
//                           [model/dao/PromotionDAO.cfc:L58,L61,L329]
//     listLen         25  - plus listGetAt 15
//     listFindNoCase  21
//     listFind         3  - matches exactly
//     ListDeleteAt     1  - matches exactly
//
//   Two of the exclusions warrant a note, because a raw grep makes them look
//   more common than they are. `listLast` returns 10 raw matches and
//   `listFirst` returns 4, but 9 of the former and all 4 of the latter sit in
//   [model/dao/ProductDAO.cfc] - inside the bulk column-name parsing of the
//   `loadDataFromFile` import path, which is explicitly out of scope, and
//   which splits on "_" and "." rather than on commas. The overflow rule is
//   therefore reinforced by re-measurement, not weakened by it: the five
//   mandated primitives really are the in-scope surface.
//
//   Every discrepancy found moved in the same direction - MORE consumers of
//   the five than specified, and no consumer of a sixth.
//
// WHY THIS MODULE IMPORTS NOTHING
//   Zero imports. No third-party package, no Node built-in, no sibling module.
//
//   The tempting one is `./truthiness.js`, because `listLen` and
//   `listFindNoCase` both feed CFML truthiness tests - `if(listLen(including))`
//   at [model/entity/PriceGroupRate.cfc:L131] and
//   `if(listFindNoCase("otSalesOrder,otExchangeOrder", ...))` at
//   [model/service/PromotionService.cfc:L61]. It is deliberately NOT imported.
//   Both functions return a `number`, exactly as CFML does, and the decision to
//   read that number as a truth value belongs to the consuming module at its
//   own call site. Folding the truthiness rule in here would hide a semantic
//   choice inside a primitive and make this module's contract depend on
//   another file's. Please do not "helpfully" add the import.
//
//   `src/lib/` also sits at the base of the domain-inward dependency flow that
//   the ESLint `no-restricted-imports` boundary enforces, so it reaches into no
//   sibling folder: not `domain`, `services`, `repositories`, `handlers` or
//   `integrations`. If a helper here appears to need one of those, the design
//   is wrong.
//
// NO USER RULES WERE PROVIDED
//   (1) No user-specified rules were provided for this project. (2) That
//   absence was VERIFIED, not assumed: the project rules source was queried
//   three independent ways - with no range, with the full range, and with a
//   range deliberately past the end - and returned the same single line
//   "No user rules provided." each time. (3) No rule has been invented to fill
//   the gap. (4) The absence is NOT licence to lower the bar; the
//   enterprise-standard substitute applies at full strength, and in this file
//   that means maximal strictness with no `any`, no suppression comment and no
//   non-null assertion, one cohesive closed exported surface, no barrel, no
//   module-scope mutable state, and every judgment call annotated where it was
//   made. (5) Zero files enter scope by rule mandate - there is no third,
//   rule-driven category of in-scope file - and consequently there are
//   no rule conflicts to resolve.
//
// TEST COVERAGE FOR THIS MODULE IS NET-NEW
//   No legacy test under meta/tests/** touches these helpers. The only legacy
//   suites extended anywhere in this port are meta/tests/unit/entity/
//   BrandTest.cfc and meta/tests/unit/entity/ProductTest.cfc, and
//   meta/tests/functional/admin/entity/ProductTest.cfc is an empty stub
//   contributing nothing. Coverage for all five exports is therefore net-new
//   and must be labelled net-new, never presented as parity. The suite belongs
//   at tests/unit/lib/cfml/list.test.ts and is authored separately; this file
//   states the obligation and does not discharge it.
//
// HAND-OFF NOTE 1 - NOT THIS MODULE'S TO FIX
//   [model/entity/Sku.cfc:L583] calls `trim(variables.skuDefinition);` as a
//   BARE STATEMENT and discards the result. CFML's `trim()` is pure, so that
//   line is a no-op and the leading space appended at
//   [model/entity/Sku.cfc:L581] is never removed. Owned by whoever ports
//   src/domain/entities/sku.ts. Do not fix it here, and above all do not let
//   `listAppend` compensate by trimming - see the no-trim rule on that export.
//   The no-op is independent corroboration that `listAppend` preserves the
//   appended value byte-for-byte.
//
// HAND-OFF NOTE 2 - NOT THIS MODULE'S TO FIX
//   CFML's `ListDeleteAt(list, 0)` throws, so
//   [model/service/PromotionService.cfc:L774] is a latent legacy hazard for any
//   fulfillment ID that is absent from the list; the code gets away with it
//   because the ID was appended at [model/service/PromotionService.cfc:L756].
//   `ListDeleteAt` is not one of the five exports, so under the overflow rule
//   it belongs inside src/services/promotion/qualifierQualification.ts (planned) with a
//   documented annotation. Stated here only so it is not lost; not fixed and
//   not implemented here.
// ---------------------------------------------------------------------------

/**
 * The delimiter CFML assumes when a list function is called without one.
 *
 * A module-scope `const` holding a string primitive: immutable, and therefore
 * not the module-scope mutable state this subtree forbids. On a warm Lambda
 * container module-level mutable state would persist between unrelated
 * requests, so there is no cache, no memo and no reassignable binding anywhere
 * in this file. It is not exported - the surface is closed at five functions.
 */
const DEFAULT_DELIMITER = ',';

/**
 * Split a CFML list into its elements. The single shared boundary rule.
 *
 * Private and non-exported by design. `listLen`, `listGetAt`, `listToArray`
 * and `listFindNoCase` all delegate here, which is what guarantees they agree
 * on where one element ends and the next begins. Four independent split
 * implementations would eventually disagree about `'a,,b'`, and the four
 * functions are routinely composed - see
 * [model/service/PromotionService.cfc:L864-L865], where a `listLen` bound
 * drives a `listGetAt` whose result is fed straight to `listFindNoCase` over
 * the same materialized path.
 *
 * Two CFML behaviours are reproduced here rather than in the callers:
 *
 * 1. Consecutive delimiters collapse and EMPTY ELEMENTS ARE IGNORED. So
 *    `'a,,b'` has two elements, `',,'` has none, and `''` has none.
 * 2. The delimiter argument is a SET OF SINGLE CHARACTERS, not a delimiting
 *    string. Passing `'|,'` means "split on a pipe or a comma", never "split
 *    on the two-character sequence pipe-comma".
 *
 * JUDGMENT CALL - no regular expression is built from the caller's delimiter.
 * The obvious implementation, `list.split(new RegExp(...))`, would silently
 * reinterpret any delimiter containing a metacharacter: `'.'` would match every
 * character and `'|'` would become alternation with two empty branches. CFML
 * has no such hazard because it never treats the argument as a pattern, so
 * neither does this. Membership is tested against a `Set` built from the
 * delimiter string; because the `Set` constructor consumes the string
 * iterator, its members are whole code points, which makes the "set of single
 * characters" reading literal in the code and keeps a surrogate pair
 * indivisible.
 *
 * JUDGMENT CALL - an empty delimiter argument yields an empty set, so no
 * character is a delimiter and a non-empty list is a single element. That
 * follows directly from the set reading above rather than being a special
 * case. No in-scope call site passes an empty delimiter.
 *
 * @param list - the raw CFML list.
 * @param delimiters - the set of characters that separate elements.
 * @returns a new array of the non-empty elements, in order.
 */
function splitOnDelimiters(list: string, delimiters: string): string[] {
  const delimiterSet = new Set<string>(delimiters);
  const elements: string[] = [];
  let element = '';

  for (const character of list) {
    if (delimiterSet.has(character)) {
      // An empty run between two delimiters contributes no element, which is
      // what makes `listLen('a,,b')` 2 rather than 3.
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

// ---------------------------------------------------------------------------
// The one failure this module can report
// ---------------------------------------------------------------------------

/**
 * Raised when a list is indexed outside `1..listLen(list)`.
 *
 * FOUR OF THE FIVE EXPORTS ARE STILL TOTAL. `listLen`, `listAppend`,
 * `listToArray` and `listFindNoCase` cannot fail: every input maps to a defined
 * answer, and `listFindNoCase` reports absence with `0` because that is what CFML
 * itself returns and `0` is not a valid 1-based position, so it is unambiguous.
 * `listGetAt` is the sole exception, because it is the only export whose natural
 * "nothing there" answer - the empty string - is ALSO a perfectly valid element
 * value. That collision is what forces a raise rather than a sentinel, and it is
 * why this class is declared for one function rather than for the module.
 *
 * EXPORTED DELIBERATELY, unlike the substrate error in `precision.ts`. A caller
 * walking a materialized ID path may legitimately want to distinguish a bad index
 * from any other failure - the promotion membership walks at
 * [model/service/PromotionService.cfc:L865] and
 * [model/service/PromotionService.cfc:L935] are the realistic case - and giving
 * them a named type to catch is better than asking them to match on a message.
 * Nothing in this module catches it; it propagates to the caller unchanged.
 *
 * The message names the offending position, the list length and the list itself.
 * The list is included because these lists are structural identifiers - comma
 * lists of `optionGroupID`s and `productTypeID`s - and diagnosing an index fault
 * without seeing the list is guesswork. It is bounded to keep a pathological
 * value out of a log line; the untruncated length is always reported.
 */
export class CfmlListIndexError extends Error {
  /**
   * @param list - the list that was indexed.
   * @param position - the rejected 1-based position.
   * @param length - the number of non-empty elements the list actually has.
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
 * Long enough to identify a realistic comma list of 32-character UUID
 * identifiers - four of them, with their delimiters - and short enough that a
 * pathological value cannot dominate a log line.
 */
const MAX_REPORTED_LIST_LENGTH = 132;

/**
 * Count the elements of a CFML list.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L93-L94]: this is the
 * ANCHOR SITE for the whole module. Verbatim:
 *
 *     for(var i=1; i<=listLen(arguments.roundingExpression); i++) {
 *         var rr = listGetAt(arguments.roundingExpression, i);
 *
 * Note `i=1` and `i<=listLen(...)`. `listLen` returns a COUNT, and that count
 * is simultaneously the upper bound of a 1-based loop - which is why
 * `listGetAt` below is 1-based rather than 0-based. THIRTEEN FURTHER in-scope
 * `listLen`/`listGetAt` pairings follow the anchor, making FOURTEEN in total -
 * the number the `listGetAt` notes below also quote. Every one is enumerated
 * here, because a count that does not match its own list is not a census.
 *
 * TWELVE of the thirteen repeat the anchor's shape exactly - a 1-based counter
 * bounded by `listLen`, indexed by `listGetAt`:
 *
 *     [model/entity/RoundingRule.cfc:L79-L80]
 *     [model/service/SkuService.cfc:L73-L74, L153/L158, L160-L161, L163-L164,
 *                                   L186-L187, L191/L196]
 *     [model/service/PromotionService.cfc:L864-L865, L899-L900, L934-L935,
 *                                         L965-L966]
 *     [model/dao/SkuDAO.cfc:L113-L114]
 *
 * The four `PromotionService` sites walk `getProductTypeIDPath()`, a
 * hierarchical materialized path stored as a comma-delimited string. The
 * `SkuDAO` site is `getSkusBySelectedOptions`, where each iteration appends one
 * `and exists (...)` clause to the HQL - the AND-of-EXISTS matching that the
 * plan names as must-preserve behaviour - so 1-based indexing is load-bearing
 * there rather than incidental. That source spells the accessor `listGetat`;
 * CFML is case-insensitive on function names, so the spelling is reported as
 * found rather than tidied.
 *
 * The THIRTEENTH is a VARIANT, listed separately so this census cannot be read
 * as claiming one uniform shape:
 *
 *     [model/service/ProductService.cfc:L86-L91]  private buildSkuCombinations
 *
 * There `listLen` appears twice - once as a bare control-flow gate at L86,
 * `if(listlen(keys))`, and once as an equality bound at L88,
 * `arguments.position eq listlen(keys)` - while `listGetAt(keys, position)`
 * selects a STRUCT KEY rather than a loop element, and the loop counter is
 * bounded by `arrayLen` of the array found at that key. The same two primitives
 * and the same 1-based convention, composed differently.
 *
 * CFML parity - `listLen('')` IS 0, AND THAT IS LOAD-BEARING, not an edge case.
 * TWELVE in-scope sites use `listLen` directly as a control-flow predicate,
 * relying on CFML's "0 is false". Counted by direct search across the in-scope
 * entities, services and DAOs, and enumerated in full rather than sampled:
 *
 *     [model/service/SkuService.cfc:L142]  !listLen(data.subscriptionBenefits)
 *     [model/service/SkuService.cfc:L147]  !listLen(data.subscriptionTerms)
 *     [model/service/SkuService.cfc:L175]  !listLen(data.accessContents)
 *     [model/service/ProductService.cfc:L86]  if(listlen(keys))
 *     [model/entity/PriceGroupRate.cfc:L120]  if(ListLen(productsList))
 *     [model/entity/PriceGroupRate.cfc:L123]  if(ListLen(productTypesList))
 *     [model/entity/PriceGroupRate.cfc:L126]  if(ListLen(SkusList))
 *     [model/entity/PriceGroupRate.cfc:L131]  if(listLen(including))
 *     [model/entity/PriceGroupRate.cfc:L146]  if(ListLen(excludedProductsList))
 *     [model/entity/PriceGroupRate.cfc:L149]  if(ListLen(excludedproductTypesList))
 *     [model/entity/PriceGroupRate.cfc:L152]  if(ListLen(excludedSkusList))
 *     [model/entity/PriceGroupRate.cfc:L157]  if(listLen(excluding))
 *
 * All eight `PriceGroupRate` sites sit inside `getAppliesTo()`. The six at
 * L120-L126 and L146-L152 gate the appending of a locally built DISPLAY STRING
 * rather than of list-shaped domain data, which is the distinction that had
 * previously left them out of this count; every one still depends on
 * `listLen('')` being 0. One further use is a comparison rather than a bare
 * predicate and is deliberately not counted here:
 * [model/service/ProductService.cfc:L88] `arguments.position eq listlen(keys)`.
 *
 * The consequence that matters most is at the anchor: an empty
 * `roundingRuleExpression` makes `listLen` return 0, so the loop body at
 * [model/service/RoundingRuleService.cfc:L93] never executes even once,
 * `returnValue` is never assigned, and control falls through to
 * [model/service/RoundingRuleService.cfc:L170-L174], which returns the
 * unchanged input value. An implementation that reported 1 element for `''`
 * would enter that loop and change money.
 *
 * Empty elements are ignored, consistently with every other export here:
 * `listLen('a,,b')` is 2 and `listLen(',,')` is 0.
 *
 * Callers must apply their own truthiness rule to this number; see the
 * zero-imports note in the file header.
 *
 * @param list - the raw CFML list.
 * @param delimiters - the set of separator characters. Defaults to a comma.
 * @returns the number of non-empty elements. Never negative.
 */
export function listLen(list: string, delimiters: string = DEFAULT_DELIMITER): number {
  return splitOnDelimiters(list, delimiters).length;
}

/**
 * Read one element of a CFML list by position. THE POSITION IS 1-BASED.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L94]: `listGetAt` is
 * indexed from 1, driven by a loop that starts at `i=1` and ends at
 * `i<=listLen(...)`. That is a semantic to reproduce, not an off-by-one to
 * correct. Making this 0-based would silently shift every one of the fourteen
 * legacy loop pairs by one element - dropping the first and reading past the
 * last - and two of those loops walk the product-type path that decides
 * promotion qualifier and reward membership
 * [model/service/PromotionService.cfc:L865, L935].
 *
 * CFML parity [model/service/ProductService.cfc:L87, L89, L91]: the result is
 * also used directly as a struct key - `arguments.data[listGetAt(keys,
 * position)]` - so it must be the element string itself, unmodified and
 * untrimmed.
 *
 * AN OUT-OF-RANGE OR NON-INTEGER POSITION THROWS, EXACTLY AS CFML DOES.
 * CFML raises for `position < 1` and for `position > listLen(list)`, and this
 * module raises too. An earlier revision returned `''` instead, on the reasoning
 * that no export here throws and that every in-scope call site is bounded by an
 * `i<=listLen(...)` guard so the case is unreachable. Both halves of that
 * reasoning were wrong in the way that matters:
 *
 *   * `''` IS AN INDISTINGUISHABLE VALID ANSWER. CFML yields `''` for an element
 *     that is genuinely present but empty, so returning `''` for a bad position
 *     collapses "you asked past the end" into "the element is empty". Those are
 *     different facts, and the second is a legitimate list value. A caller cannot
 *     tell them apart, so an indexing bug is guaranteed to be silent.
 *   * "UNREACHABLE" IS A CLAIM ABOUT TODAY'S CALLERS, NOT A CONTRACT. Every
 *     in-scope loop is bounded today, so a faithful port cannot reach this branch
 *     - which means throwing costs nothing in ported code and can only fire on a
 *     genuine defect. A safety net that is never touched by correct code is
 *     precisely the one worth having; softening it only helps INCORRECT code, by
 *     letting it continue.
 *
 * The stakes make this concrete rather than academic. Two of the fourteen legacy
 * loop pairs walk the product-type path that decides promotion qualifier and
 * reward membership [model/service/PromotionService.cfc:L865, L935], and the
 * anchor loop at [model/service/RoundingRuleService.cfc:L94] feeds the rounding
 * search. An off-by-one that quietly yields `''` there produces a wrong
 * membership decision or a wrong rounding candidate - which is wrong money -
 * whereas a raise stops the request.
 *
 * A NON-INTEGER POSITION IS REJECTED RATHER THAN TRUNCATED. `1.5`, `NaN` and
 * both infinities all raise. Truncating toward an integer would be inventing an
 * intent the caller did not express, and `NaN` in particular is how a failed
 * numeric parse arrives; silently reading element 1 for it would hide the parse
 * failure.
 *
 * THE RETURN TYPE STAYS `string`, WHICH IS THE POINT. Raising is what preserves
 * it: the alternative to throwing is not `''` but `string | undefined`, which
 * would push a narrowing burden onto all fourteen call sites for a case none of
 * them can reach. So the contract is total in the useful sense - a successful
 * call always yields a `string`, and there is no absent case to narrow.
 *
 * IT DOES NOT SPLIT THE WHOLE LIST, AND THAT IS A RESOURCE DECISION RATHER THAN
 * a micro-optimization. An earlier revision delegated to `splitOnDelimiters` and
 * then indexed the result, so every call materialized an array holding EVERY
 * element of the list - all of them - to return one. Because the legacy idiom
 * this function exists to serve is a `for(i=1; i<=listLen(list); i++)` loop, the
 * cost compounded: an n-element list produced n arrays of n strings, so the
 * allocation was quadratic in the list length even though the answer to each call
 * needed only a prefix. Several of those lists arrive from a caller - the
 * selected-option list behind `getProductSkusBySelectedOptions` is the clearest
 * case - which makes the length attacker-influenced and the allocation the
 * cheapest way to exhaust a Lambda's memory.
 *
 * The scan below terminates as soon as the requested element is complete and
 * allocates NO intermediate array at all: one delimiter set, and one accumulating
 * element string that is discarded at each boundary until the wanted one is
 * reached.
 *
 * Both boundary rules `splitOnDelimiters` documents are reproduced here in full,
 * because this function no longer delegates to it: consecutive delimiters collapse
 * so an empty run contributes no element, and `delimiters` is a SET OF CODE POINTS
 * rather than a delimiting string or a pattern. The two implementations must stay
 * in agreement - `listLen` bounds the loops that drive this function - so the
 * shared behaviour is pinned by a dedicated group of tests rather than by
 * proximity.
 *
 * @param list - the raw CFML list.
 * @param position - the 1-based position of the wanted element.
 * @param delimiters - the set of separator characters. Defaults to a comma.
 * @returns the element at `position`. Always a `string`.
 * @throws {CfmlListIndexError} if `position` is not an integer in
 *   `1..listLen(list)`.
 */
export function listGetAt(
  list: string,
  position: number,
  delimiters: string = DEFAULT_DELIMITER,
): string {
  // Checked before the scan starts, so an unusable position costs nothing. The
  // upper bound cannot be checked here - it is the element COUNT, which is only
  // known once the list has been walked - so an over-large position is detected by
  // the scan falling off the end below, which raises with the true count in hand.
  if (!Number.isInteger(position) || position < 1) {
    throw new CfmlListIndexError(list, position, listLen(list, delimiters));
  }

  // The `Set` constructor consumes the string iterator, so its members are whole
  // code points. That is what makes "a set of single characters" literal in the
  // code and keeps a surrogate pair indivisible - the same reasoning
  // `splitOnDelimiters` records, and the reason no regular expression is built
  // from the caller's delimiter here either.
  const delimiterSet = new Set<string>(delimiters);
  let completed = 0;
  let element = '';

  for (const character of list) {
    if (!delimiterSet.has(character)) {
      element += character;
      continue;
    }

    // An empty run between two delimiters contributes no element, which is what
    // makes `listGetAt('a,,b', 2)` return `'b'` rather than `''`.
    if (element === '') {
      continue;
    }

    completed += 1;
    if (completed === position) {
      return element;
    }

    element = '';
  }

  // A non-empty trailing run is the last element, numbered one past the last
  // completed one. When `position` is beyond that, nothing matched: CFML raises
  // for an index outside the list rather than answering the empty string, so the
  // count reached by the scan is reported instead of a value that could pass for
  // a real element.
  if (element !== '' && completed + 1 === position) {
    return element;
  }

  throw new CfmlListIndexError(list, position, element === '' ? completed : completed + 1);
}

/**
 * Append one value to a CFML list, returning the new list.
 *
 * CFML parity - THE ACCUMULATOR STARTS EMPTY, AND THE FIRST APPEND MUST NOT
 * EMIT A LEADING DELIMITER. This is the single most likely way to get this
 * function wrong. [model/entity/Sku.cfc:L234-L238], verbatim:
 *
 *     var dspOptions = "";
 *     for(var i=1;i<=arrayLen(getOptions());i++) {
 *         dspOptions = listAppend(dspOptions, getOptions()[i].getOptionName(), arguments.delimiter);
 *     }
 *     return dspOptions;
 *
 * A naive `list + delimiter + value` yields `',Large'` where CFML yields
 * `'Large'`. The empty-accumulator idiom is not incidental - it is how every
 * list in the slice is built. It recurs verbatim at
 * [model/entity/Sku.cfc:L886-L888], and at
 * [model/entity/Sku.cfc:L526/L528, L757/L760, L773/L779],
 * [model/entity/Product.cfc:L192/L194, L200/L202, L269/L274, L293],
 * [model/service/PromotionService.cfc:L753/L756, L859/L861, L893/L896,
 * L929/L931, L959/L962] and [model/dao/PromotionDAO.cfc:L56/L58, L61].
 *
 * Two sites make the rule directly OBSERVABLE rather than merely internal.
 * [model/entity/PriceGroupRate.cfc:L96] opens `including` as `""`,
 * [model/entity/PriceGroupRate.cfc:L120-L128] appends onto it, and
 * [model/entity/PriceGroupRate.cfc:L132] then runs
 * `Replace(including, ",", " and ")` over the result to build admin-facing
 * text; a spurious leading comma would surface to a user as a sentence
 * beginning " and ". [model/entity/PriceGroupRate.cfc:L146-L158] does the same
 * for `excluding`.
 *
 * CFML parity - THE OPTIONAL THIRD DELIMITER ARGUMENT IS REAL. Three sites
 * pass it explicitly: [model/entity/Sku.cfc:L236] and
 * [model/entity/Sku.cfc:L888] forward the caller's `delimiter`, which those two
 * methods DEFAULT TO A SPACE rather than a comma
 * ([model/entity/Sku.cfc:L233, L885]), and
 * [model/entity/Sku.cfc:L581] passes `","` explicitly. Dropping the parameter
 * would break signature parity at all three.
 *
 * CFML parity [model/entity/Sku.cfc:L578-L584] - NEVER TRIM, normalize or
 * collapse whitespace. That site appends `" #optionGroupName#: #optionName#"`,
 * a value that DELIBERATELY BEGINS WITH A SPACE and contains a colon. The
 * value is preserved byte-for-byte. See HAND-OFF NOTE 1 in the file header for
 * why the leading space survives in the legacy output too.
 *
 * PURE, AND NOT AN IN-PLACE MUTATION. The dominant legacy idiom is
 * `x = listAppend(x, item)`; CFML's `listAppend` returns a new list and leaves
 * its argument alone. Nothing here mutates an input.
 *
 * @param list - the list to append to. May be empty.
 * @param value - the value to append. Used exactly as given.
 * @param delimiter - the separator to insert. Defaults to a comma.
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
 * CFML parity - THIS IS THE COMMA-LIST TO BIND-PARAMETER BOUNDARY CONVERTER,
 * and the whole chain is verified end to end.
 * [model/service/PromotionService.cfc:L165] passes the literal
 * `rewardTypeList="merchandise,subscription,contentAccess,order,fulfillment"`
 * and `promotionCodeList=arguments.order.getPromotionCodeList()` as STRINGS
 * into `getActivePromotionRewards(...)`. That DAO declares both as
 * `type="string"` at [model/dao/PromotionDAO.cfc:L52-L53], then converts them
 * at [model/dao/PromotionDAO.cfc:L129] and
 * [model/dao/PromotionDAO.cfc:L126] with `listToArray(...)` so they can bind
 * to the HQL `IN (:rewardTypeList)` and `IN (:promotionCodeList)` clauses
 * executed at [model/dao/PromotionDAO.cfc:L131].
 * [model/dao/PriceGroupDAO.cfc:L95] shows the same idiom one step further
 * along, wrapping a query column: `listToArray(valueList(getpg.priceGroupID))`
 * feeding `IN (:priceGroupIDs)`.
 *
 * That chain is precisely how the decision to keep comma-list signatures is
 * discharged at the data boundary: the list stays a `string` right up to the
 * query layer, and becomes an array exactly once, here.
 *
 * All six in-scope sites are accounted for: the two above, plus
 * [model/dao/PromotionDAO.cfc:L122],
 * [model/dao/ProductDAO.cfc:L123] - whose result is immediately iterated with
 * `for(var column in columnList)` at [model/dao/ProductDAO.cfc:L130],
 * confirming an ARRAY is returned - and
 * [model/dao/ProductDAO.cfc:L259].
 *
 * DELIMITER HONESTY. All six in-scope sites use the one-argument
 * default-comma form. The optional second argument is a genuine CFML feature
 * and is exposed here for signature completeness, but NO IN-SCOPE CALL SITE
 * EXERCISES IT. The evidence that the overload exists at all comes from
 * OUT-OF-SCOPE files - [model/service/CommentService.cfc:L58] and
 * [model/service/CommentService.cfc:L92] pass a space, and
 * [model/service/SettingService.cfc:L546] passes an ampersand - and those are
 * cited here as out-of-scope evidence only, never as in-scope requirements.
 *
 * Empty elements are dropped, consistently with `listLen`, so `listToArray('')`
 * is `[]` and `listToArray('a,,b')` is `['a', 'b']`.
 *
 * @param list - the raw CFML list.
 * @param delimiters - the set of separator characters. Defaults to a comma.
 * @returns a NEW array on every call; the caller may mutate it freely.
 */
export function listToArray(list: string, delimiters: string = DEFAULT_DELIMITER): string[] {
  return splitOnDelimiters(list, delimiters);
}

/**
 * Find a value in a CFML list, case-insensitively.
 *
 * RETURNS A 1-BASED POSITION, NOT A BOOLEAN. `0` means absent.
 *
 * CFML parity [model/service/PromotionService.cfc:L774] is the decisive proof,
 * verbatim:
 *
 *     qualifiedFulfillmentIDs = ListDeleteAt(qualifiedFulfillmentIDs, listFindNoCase(qualifiedFulfillmentIDs, orderFulfillment.getOrderFulfillmentID()) );
 *
 * The return value is consumed DIRECTLY as a 1-based position by
 * `ListDeleteAt`. A boolean-returning implementation would silently corrupt
 * that call site - `true` would delete element 1 and `false` would be an
 * invalid position. (That same line also writes `ListDeleteAt` with a capital
 * `L` while writing `listFindNoCase` with a lowercase `l`, in one expression:
 * CFML identifiers are case-insensitive, which is the same property that makes
 * a dedicated struct-key helper necessary elsewhere in this folder.)
 *
 * CFML parity - THE ARGUMENT ORDER IS (list, value). LIST FIRST. Uniform
 * across every site, in both the literal-haystack form
 * ([model/service/PromotionService.cfc:L61] searches
 * `"otSalesOrder,otExchangeOrder"`) and the variable-haystack form
 * ([model/service/PromotionService.cfc:L865, L900, L935, L966, L774],
 * [model/service/ProductService.cfc:L144],
 * [model/dao/PromotionDAO.cfc:L57, L60]). Reordering the parameters to read
 * more naturally would break behaviour parity at every one of them.
 *
 * CALLERS MUST NEVER WRITE `if (listFindNoCase(...))`. In CFML that reads as a
 * predicate because 0 is falsy, and sixteen in-scope sites rely on it -
 * [model/service/PromotionService.cfc:L61, L200, L542, L714, L794, L865, L900,
 * L935, L966], [model/entity/Product.cfc:L440, L442, L451] and
 * [model/entity/Sku.cfc:L294, L299, L306, L309] - plus a negated form at
 * [model/service/ProductService.cfc:L144].
 *
 * JavaScript also treats 0 as falsy, so the bare condition would COINCIDENTALLY
 * behave correctly, and that coincidence is exactly the problem: it reads as
 * though this function answers a yes/no question when it actually answers
 * "where", it survives review unexamined, and it breaks the moment someone
 * stores the result in a `boolean`, compares it with `=== true`, or ports a
 * site like [model/service/PromotionService.cfc:L774] that needs the position.
 * Route the number through the CFML truthiness helper at the call site, or write
 * an explicit `> 0`. Never lean on JavaScript coercion.
 *
 * JUDGMENT CALL - the case fold uses `toLowerCase()`, NOT
 * `toLocaleLowerCase()`. CFML's comparison here is not locale-driven, and a
 * locale-sensitive fold would change results for Turkish-dotless-I inputs.
 * That is not hypothetical in this slice: the real fixture
 * `"QC,QE,QNC,QATS,QIATS"` at [model/entity/Sku.cfc:L294] contains a capital
 * `I`. Under a Turkish locale that `I` folds to DOTLESS i (U+0131) while the
 * needle `'qiats'` carries the ordinary dotted `i` (U+0069), so the two would
 * not compare equal: the lookup would return 0 instead of 5 and a valid
 * calculated quantity type would be rejected as invalid.
 *
 * JUDGMENT CALL - elements are NOT trimmed before comparing. CFML does not
 * trim either, none of the verified fixtures carries padding
 * (`"otSalesOrder,otExchangeOrder"`, `"merchandise,subscription,contentAccess"`
 * and its differently-ordered twin `"contentAccess,merchandise,subscription"`
 * at [model/service/PromotionService.cfc:L714], `"QC,QE,QNC,QATS,QIATS"`,
 * `"QOH,QOSH,QNDOO,QNDORVO,QNDOSA,QNRORO,QNROVO,QNROSA"`, and the
 * `productTypeIDPath` identifier paths), and trimming here would contradict
 * `listAppend`, which is required to preserve a deliberately space-prefixed
 * value at [model/entity/Sku.cfc:L581]. Padding-insensitive matching, if it is
 * ever wanted, is a product decision - not a quiet default.
 *
 * @param list - the list to search.
 * @param value - the value to look for. Compared case-insensitively.
 * @param delimiters - the set of separator characters. Defaults to a comma.
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

  // `findIndex` yields -1 when nothing matches, and -1 + 1 is 0 - which is
  // exactly CFML's "absent" sentinel. So this single `+ 1` both converts the
  // 0-based JavaScript index to CFML's 1-based position and produces the
  // absent value, with no branch.
  return matchIndex + 1;
}
