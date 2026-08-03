// ---------------------------------------------------------------------------
// slatwall-ts - CFML comma-list primitives
//
// Five CFML list functions re-expressed in TypeScript with their CFML semantics intact: listLen,
// listGetAt, listAppend, listToArray, listFindNoCase. A semantic-parity module, not a
// general-purpose utility library - every behaviour below matches what the legacy engine does at a
// verified call site.
//
// The port RETAINS comma-delimited parameters and `string` returns for signature parity:
// `getUnusedProductOptions(productID, existingOptionGroupIDList)` keeps its `string` parameter and
// parses internally, and `getPromotionPeriodQualifiedFulfillmentIDList(...)` keeps its comma-list
// `string` return, whose legacy shape is at [model/service/PromotionService.cfc:L752-L780].
//
// THE SURFACE IS CLOSED AT FIVE EXPORTS. Four further CFML list functions appear in the legacy
// slice and are deliberately excluded; a translation need none of the five covers belongs inside
// the consuming module with a documented annotation, never as a new export here:
//
//   listFind      3 sites - [model/entity/Sku.cfc:L776],
//                 [model/entity/Product.cfc:L273], [model/entity/Product.cfc:L292].
//                 Case-SENSITIVE, so not a spelling variant of listFindNoCase.
//   ListDeleteAt  1 site - [model/service/PromotionService.cfc:L774].
//   listLast      1 live site - [model/entity/Sku.cfc:L142], splitting a filename
//                 on "." rather than on commas. A raw grep returns 10, but 9 sit in
//                 the out-of-scope import path below.
//   listFirst     4 sites, all in the out-of-scope bulk import path at
//                 [model/dao/ProductDAO.cfc:L131-L137], splitting on "_".
//
// Adding a sixth export - listQualify, listSort, listDeleteAt, listPrepend, listSetAt,
// listContains, valueList or any other - is a gate failure.
//
// MEASURED IN-SCOPE CALL SITES: listToArray 6, listAppend 25, listLen 25, listGetAt 15,
// listFindNoCase 21, listFind 3, ListDeleteAt 1. Every discrepancy against the specified counts
// runs one way: more consumers of the five, never a consumer of a sixth.
//
// ZERO IMPORTS - no third-party package, no Node built-in, no sibling module. The tempting one is
// `./truthiness.js`, because `listLen` and `listFindNoCase` both feed CFML truthiness tests:
// `if(listLen(including))` at [model/entity/PriceGroupRate.cfc:L131] and
// `if(listFindNoCase("otSalesOrder,otExchangeOrder", ...))` at
// [model/service/PromotionService.cfc:L61]. It is deliberately not imported: both functions return
// a `number`, exactly as CFML does, and reading that number as a truth value belongs to the
// consuming call site.
//
// HAND-OFF NOTE 1 - NOT THIS MODULE'S TO FIX. [model/entity/Sku.cfc:L583] calls
// `trim(variables.skuDefinition);` as a BARE STATEMENT and discards the result. CFML's `trim()` is
// pure, so the line is a no-op and the leading space appended at [model/entity/Sku.cfc:L581] is
// never removed. Owned by whoever ports src/domain/entities/sku.ts; do not fix it here, and do not
// let `listAppend` compensate by trimming - the no-op independently corroborates that `listAppend`
// preserves the appended value byte-for-byte.
//
// HAND-OFF NOTE 2 - NOT THIS MODULE'S TO FIX. CFML's `ListDeleteAt(list, 0)` throws, so
// [model/service/PromotionService.cfc:L774] is a latent legacy hazard for any fulfillment ID absent
// from the list; the code gets away with it because the ID was appended at
// [model/service/PromotionService.cfc:L756]. `ListDeleteAt` is not one of the five exports, so
// under the overflow rule it belongs inside src/services/promotion/qualifierQualification.ts with a
// documented annotation. Stated here only so it is not lost.
// ---------------------------------------------------------------------------

/**
 * The delimiter CFML assumes when a list function is called without one.
 *
 * A module-scope `const` holding a string primitive: immutable, so not the module-scope mutable
 * state this subtree forbids - on a warm Lambda container such state would persist between
 * unrelated requests. Not exported.
 */
const DEFAULT_DELIMITER = ',';

/**
 * Split a CFML list into its elements. THE SINGLE SHARED BOUNDARY RULE.
 *
 * Private. `listLen`, `listToArray` and `listFindNoCase` delegate here, so they cannot drift apart
 * on `'a,,b'`, and they are routinely composed - at [model/service/PromotionService.cfc:L864-L865]
 * a `listLen` bound drives a `listGetAt` whose result feeds `listFindNoCase` over one materialized
 * path. TWO CFML BEHAVIOURS LIVE HERE rather than in the callers, which point at this note rather
 * than restating them: consecutive delimiters collapse and EMPTY ELEMENTS ARE IGNORED, so `'a,,b'`
 * has two elements while `',,'` and `''` have none; and `delimiters` is a SET OF SINGLE CHARACTERS
 * rather than a delimiting string, so `'|,'` means "a pipe or a comma", never the sequence
 * pipe-comma.
 *
 * JUDGMENT CALL: no regular expression is built from the caller's delimiter. Building a `RegExp`
 * from it would reinterpret a metacharacter - `'.'` matching every character, `'|'` becoming
 * alternation with two empty branches - and CFML never treats the argument as a pattern. Membership
 * is tested against a `Set`, whose constructor consumes the string iterator, so its members are
 * whole code points: the "set of single characters" reading is literal in the code and a surrogate
 * pair stays indivisible.
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
      // `listLen('a,,b')` 2 rather than 3.
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

// --- The one failure this module can report ---

/**
 * Raised when a list is indexed outside `1..listLen(list)`.
 *
 * FOUR OF THE FIVE EXPORTS ARE STILL TOTAL: `listLen`, `listAppend`, `listToArray` and
 * `listFindNoCase` cannot fail, and `listFindNoCase` reports absence with `0` because that is what
 * CFML returns and `0` is not a valid 1-based position. `listGetAt` is the sole exception, because
 * its natural "nothing there" answer - the empty string - is ALSO a perfectly valid element value,
 * which is why this class is declared for one function rather than for the module.
 *
 * EXPORTED DELIBERATELY, unlike the substrate error in `precision.ts`. A caller walking a
 * materialized ID path may legitimately want to distinguish a bad index from any other failure -
 * the promotion membership walks at [model/service/PromotionService.cfc:L865] and
 * [model/service/PromotionService.cfc:L935] are the realistic case - and a named type to catch
 * beats matching on a message. Nothing here catches it.
 *
 * The message names the offending position, the list length and the list itself, because these
 * lists are structural identifiers - comma lists of `optionGroupID`s and `productTypeID`s - and
 * diagnosing an index fault without seeing the list is guesswork. It is bounded to keep a
 * pathological value out of a log line; the untruncated length is always reported.
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
 * Long enough to identify a realistic comma list of four 32-character UUID identifiers with their
 * delimiters, short enough that a pathological value cannot dominate a log line.
 */
const MAX_REPORTED_LIST_LENGTH = 132;

/**
 * Count the elements of a CFML list.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L93-L94]: the ANCHOR SITE for the whole
 * module. Verbatim:
 *
 *     for(var i=1; i<=listLen(arguments.roundingExpression); i++) {
 *         var rr = listGetAt(arguments.roundingExpression, i);
 *
 * `listLen` returns a COUNT that is simultaneously the upper bound of a 1-based loop, which is why
 * `listGetAt` is 1-based. THIRTEEN FURTHER in-scope `listLen`/`listGetAt` pairings follow it,
 * making FOURTEEN in total - the number `listGetAt` also quotes. TWELVE of the thirteen repeat the
 * anchor's shape exactly, a 1-based counter bounded by `listLen` and indexed by `listGetAt`:
 *
 *     [model/entity/RoundingRule.cfc:L79-L80]
 *     [model/service/SkuService.cfc:L73-L74, L153/L158, L160-L161, L163-L164,
 *                                   L186-L187, L191/L196]
 *     [model/service/PromotionService.cfc:L864-L865, L899-L900, L934-L935,
 *                                         L965-L966]
 *     [model/dao/SkuDAO.cfc:L113-L114]
 *
 * The four `PromotionService` sites walk `getProductTypeIDPath()`, a materialized path held as a
 * comma-delimited string. The `SkuDAO` site is `getSkusBySelectedOptions`, where each iteration
 * appends one `and exists (...)` clause to the HQL - the AND-of-EXISTS matching the plan names as
 * must-preserve - so 1-based indexing is load-bearing there; that source spells the accessor
 * `listGetat`, reported as found because CFML is case-insensitive on function names.
 *
 * The THIRTEENTH is a VARIANT: [model/service/ProductService.cfc:L86-L91], private
 * `buildSkuCombinations`, where `listLen` is both a bare gate at L86, `if(listlen(keys))`, and an
 * equality bound at L88, while `listGetAt(keys, position)` selects a STRUCT KEY rather than a loop
 * element and the counter is bounded by `arrayLen` of the array at that key.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L93]: `listLen('')` IS 0, AND THAT IS
 * LOAD-BEARING. TWELVE in-scope sites use `listLen` directly as a control-flow predicate, relying
 * on CFML's "0 is false":
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
 * All eight `PriceGroupRate` sites sit inside `getAppliesTo()`, six of them gating the appending of
 * a locally built DISPLAY STRING rather than of list-shaped domain data, and every one still
 * depends on `listLen('')` being 0. [model/service/ProductService.cfc:L88] is a comparison rather
 * than a bare predicate and is deliberately not counted.
 *
 * The consequence that matters most is at the anchor: an empty `roundingRuleExpression` makes
 * `listLen` return 0, so the loop body never executes, `returnValue` is never assigned, and control
 * falls through to [model/service/RoundingRuleService.cfc:L170-L174], which returns the input
 * unchanged. Reporting 1 element for `''` would enter that loop and change money.
 *
 * Empty elements are ignored, per the boundary rules on `splitOnDelimiters`. Callers apply their
 * own truthiness rule to this number; see the zero-imports note in the file header.
 *
 * @returns the number of non-empty elements. Never negative.
 */
export function listLen(list: string, delimiters: string = DEFAULT_DELIMITER): number {
  return splitOnDelimiters(list, delimiters).length;
}

/**
 * Read one element of a CFML list by position. THE POSITION IS 1-BASED.
 *
 * CFML parity [model/service/RoundingRuleService.cfc:L94]: indexed from 1, driven by a loop from
 * `i=1` to `i<=listLen(...)`. That is a semantic to reproduce, not an off-by-one to correct -
 * 0-based would shift all fourteen legacy loop pairs, dropping the first element and reading past
 * the last, and two of them walk the product-type path deciding promotion qualifier and reward
 * membership [model/service/PromotionService.cfc:L865, L935].
 *
 * CFML parity [model/service/ProductService.cfc:L87, L89, L91]: the result is also used directly as
 * a struct key, `arguments.data[listGetAt(keys, position)]`, so it must be the element string
 * itself, unmodified and untrimmed.
 *
 * AN OUT-OF-RANGE OR NON-INTEGER POSITION THROWS, EXACTLY AS CFML DOES; `1.5`, `NaN` and both
 * infinities raise rather than being truncated toward an integer, because truncation would invent
 * an intent the caller did not express and `NaN` is how a failed numeric parse arrives. `''` cannot
 * serve as a sentinel, because CFML yields it for an element that is genuinely present but empty,
 * so returning it for a bad position would collapse "you asked past the end" into "the element is
 * empty" and make an indexing bug silent - on the membership path above, or at the anchor loop
 * feeding the rounding search, silently wrong money. Raising also keeps the return type `string`;
 * the alternative is `string | undefined`, narrowing at fourteen call sites for a case none of them
 * can reach.
 *
 * IT DOES NOT SPLIT THE WHOLE LIST. Delegating to `splitOnDelimiters` and indexing would
 * materialize every element to return one, and because the legacy idiom is a 1-based loop bounded
 * by `listLen(list)` the allocation would be quadratic in a length that is often caller-supplied -
 * the selected-option list behind `getProductSkusBySelectedOptions` is the clearest case. The scan
 * below stops once the requested element is complete and allocates no intermediate array, and it
 * reproduces both boundary rules `splitOnDelimiters` documents; the two are pinned in agreement by
 * a dedicated group of tests rather than by proximity.
 *
 * @returns the element at `position`. Always a `string`.
 * @throws {CfmlListIndexError} if `position` is not an integer in
 *   `1..listLen(list)`.
 */
export function listGetAt(
  list: string,
  position: number,
  delimiters: string = DEFAULT_DELIMITER,
): string {
  // Checked before the scan starts. The upper bound cannot be checked here - it is the element
  // COUNT, known only once the list has been walked - so an over-large position is caught by the
  // scan falling off the end, with the true count in hand.
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

  // A non-empty trailing run is the last element, numbered one past the last completed one. When
  // `position` is beyond that, the count reached by the scan is reported rather than a value that
  // could pass for a real element.
  if (element !== '' && completed + 1 === position) {
    return element;
  }

  throw new CfmlListIndexError(list, position, element === '' ? completed : completed + 1);
}

/**
 * Append one value to a CFML list, returning the new list.
 *
 * CFML parity [model/entity/Sku.cfc:L234-L238]: THE ACCUMULATOR STARTS EMPTY AND THE FIRST APPEND
 * MUST NOT EMIT A LEADING DELIMITER. That site opens `var dspOptions = "";` and then loops
 * `dspOptions = listAppend(dspOptions, ..., arguments.delimiter);`, so naively concatenating list,
 * delimiter and value yields `',Large'` where CFML yields `'Large'`. This is the likeliest way to
 * this function wrong, and the idiom is how every list in the slice is built: it recurs at
 * [model/entity/Sku.cfc:L886-L888], [model/entity/Sku.cfc:L526/L528, L757/L760, L773/L779],
 * [model/entity/Product.cfc:L192/L194, L200/L202, L269/L274, L293],
 * [model/service/PromotionService.cfc:L753/L756, L859/L861, L893/L896, L929/L931, L959/L962] and
 * [model/dao/PromotionDAO.cfc:L56/L58, L61, L329].
 *
 * Two sites make the rule OBSERVABLE rather than merely internal.
 * [model/entity/PriceGroupRate.cfc:L96] opens `including` as `""`,
 * [model/entity/PriceGroupRate.cfc:L120-L128] appends onto it, and
 * [model/entity/PriceGroupRate.cfc:L132] runs `Replace(including, ",", " and ")` over the result to
 * build admin-facing text, so a spurious leading comma would surface to a user as a sentence
 * beginning " and ". [model/entity/PriceGroupRate.cfc:L146-L158] does the same for `excluding`.
 *
 * CFML parity [model/entity/Sku.cfc:L236, L581, L888]: THE OPTIONAL THIRD DELIMITER ARGUMENT IS
 * REAL. Two of those forward the caller's `delimiter`, which those methods DEFAULT TO A SPACE
 * rather than a comma ([model/entity/Sku.cfc:L233, L885]); the third passes `","` explicitly.
 * Dropping the parameter would break signature parity at all three.
 *
 * CFML parity [model/entity/Sku.cfc:L578-L584]: NEVER TRIM, normalize or collapse whitespace. That
 * site appends `" #optionGroupName#: #optionName#"`, a value that DELIBERATELY BEGINS WITH A SPACE
 * and contains a colon, and it is preserved byte-for-byte. HAND-OFF NOTE 1 in the file header
 * records why the leading space survives in the legacy output too.
 *
 * PURE, NOT AN IN-PLACE MUTATION. The dominant legacy idiom is `x = listAppend(x, item)`; CFML
 * returns a new list and leaves its argument alone.
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
 * CFML parity [model/dao/PromotionDAO.cfc:L52-L53, L126, L129, L131]: THIS IS THE COMMA-LIST TO
 * BIND-PARAMETER BOUNDARY CONVERTER, and the chain is verified end to end.
 * [model/service/PromotionService.cfc:L165] passes the literal
 * `rewardTypeList="merchandise,subscription,contentAccess,order,fulfillment"` and
 * `promotionCodeList=arguments.order.getPromotionCodeList()` as STRINGS into
 * `getActivePromotionRewards(...)`; the DAO declares both as `type="string"`, then converts them
 * with `listToArray(...)` so they can bind to the HQL `IN (:rewardTypeList)` and
 *   `IN (:promotionCodeList)`
 * clauses it executes. [model/dao/PriceGroupDAO.cfc:L95] shows the same idiom one step further
 * along, wrapping a query column: `listToArray(valueList(getpg.priceGroupID))` feeding
 *   `IN (:priceGroupIDs)`.
 * That is how keeping comma-list signatures is discharged at the data boundary: the list stays a
 * `string` up to the query layer and becomes an array exactly once, here.
 *
 * All six in-scope sites are accounted for: the two above, plus [model/dao/PromotionDAO.cfc:L122],
 * [model/dao/ProductDAO.cfc:L123] - whose result is immediately iterated with
 *   `for(var column in columnList)`
 * at [model/dao/ProductDAO.cfc:L130], confirming an ARRAY is returned - and
 * [model/dao/ProductDAO.cfc:L259].
 *
 * DELIMITER HONESTY. All six use the one-argument default-comma form. The optional second argument
 * is a genuine CFML feature, exposed here for signature completeness, but NO IN-SCOPE CALL SITE
 * EXERCISES IT: the evidence that the overload exists comes from out-of-scope files -
 * [model/service/CommentService.cfc:L58] and [model/service/CommentService.cfc:L92] pass a space,
 * [model/service/SettingService.cfc:L546] an ampersand - cited as evidence only, never as in-scope
 * requirements.
 *
 * @returns a NEW array on every call; the caller may mutate it freely. Empty
 *   elements are dropped, per the boundary rules on `splitOnDelimiters`.
 */
export function listToArray(list: string, delimiters: string = DEFAULT_DELIMITER): string[] {
  return splitOnDelimiters(list, delimiters);
}

/**
 * Find a value in a CFML list, case-insensitively.
 *
 * RETURNS A 1-BASED POSITION, NOT A BOOLEAN. `0` means absent.
 *
 * CFML parity [model/service/PromotionService.cfc:L774] is the decisive proof:
 * `ListDeleteAt(qualifiedFulfillmentIDs, listFindNoCase(qualifiedFulfillmentIDs, ...))` consumes
 * the return DIRECTLY as a 1-based position, so a boolean-returning implementation would corrupt
 * that call site silently - `true` deleting element 1, `false` being an invalid position. That one
 * expression also writes `ListDeleteAt` capitalised and `listFindNoCase` not: CFML identifiers are
 * case-insensitive, the same property that makes a dedicated struct-key helper necessary in this
 * folder.
 *
 * CFML parity [model/service/PromotionService.cfc:L61, L774, L865, L900, L935, L966]: THE ARGUMENT
 * ORDER IS (list, value), LIST FIRST - uniform across every site, in the literal-haystack form (L61
 * searches `"otSalesOrder,otExchangeOrder"`) and the variable-haystack form alike, and at
 * [model/service/ProductService.cfc:L144] and [model/dao/PromotionDAO.cfc:L57, L60]. Reordering the
 * parameters to read more naturally would break parity at every one.
 *
 * CALLERS MUST NEVER WRITE `if (listFindNoCase(...))`. In CFML that reads as a predicate because 0
 * is falsy, and sixteen in-scope sites rely on it - [model/service/PromotionService.cfc:L61, L200,
 * L542, L714, L794, L865, L900, L935, L966], [model/entity/Product.cfc:L440, L442, L451] and
 * [model/entity/Sku.cfc:L294, L299, L306, L309] - plus a negated form at
 * [model/service/ProductService.cfc:L144]. JavaScript also treats 0 as falsy, so the bare condition
 * behaves correctly by COINCIDENCE, which is the problem: it reads as a yes/no question and breaks
 * the moment someone stores the result in a `boolean`, compares it with `=== true`, or ports a site
 * that needs the position. Route the number through the CFML truthiness helper at the call site, or
 * write `> 0`.
 *
 * JUDGMENT CALL: the case fold uses `toLowerCase()`, not `toLocaleLowerCase()`. CFML's comparison
 * here is not locale-driven, and the difference is not hypothetical: the real fixture
 * `"QC,QE,QNC,QATS,QIATS"` at [model/entity/Sku.cfc:L294] holds a capital `I`, which folds to
 * DOTLESS i (U+0131) under a Turkish locale while the needle `'qiats'` carries the dotted `i`
 * (U+0069), so the lookup would return 0 instead of 5 and reject a valid calculated quantity type
 * as invalid.
 *
 * JUDGMENT CALL: elements are NOT trimmed before comparing. CFML does not trim either, none of the
 * verified fixtures carries padding - `"otSalesOrder,otExchangeOrder"`,
 * `"merchandise,subscription,contentAccess"` and its differently-ordered twin at
 * [model/service/PromotionService.cfc:L714], `"QC,QE,QNC,QATS,QIATS"`,
 * `"QOH,QOSH,QNDOO,QNDORVO,QNDOSA,QNRORO,QNROVO,QNROSA"` and the `productTypeIDPath` identifier
 * paths - and trimming here would contradict `listAppend`, which must preserve a deliberately
 * space-prefixed value at [model/entity/Sku.cfc:L581]. Padding-insensitive matching, if it is ever
 * wanted, is a product decision.
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

  // `findIndex` yields -1 when nothing matches, and -1 + 1 is 0 - CFML's "absent" sentinel. So this
  // single `+ 1` both converts the 0-based JavaScript index to CFML's 1-based position and produces
  // the absent value, with no branch.
  return matchIndex + 1;
}
