/**
 * smartListInput — the single translation of the FW/1 `rc` request grammar into the declarative
 * query description that `src/ports/SmartListQueryPort.ts` declares.
 *
 * Legacy origin:
 *   org/Hibachi/HibachiSmartList.cfc — `setup` at :L39 reads the caller's `data` structure and the
 *     `add*` / `remove*` members at :L362, :L389, :L416, :L445, :L476 and :L502 accumulate the
 *     filters, ranges, orders, keywords and paging figures this module now produces as data. Per AAP
 *     §0.8.3.2 that tree is "a boundary to extract from, never modify": its CONTRACT is read here and
 *     none of its implementation is carried over.
 *   model/service/ProductService.cfc:L342 — `getProductSmartList(struct data={}, currentURL="")`.
 *   model/service/SkuService.cfc:L309 — `getSkuSmartList(struct data={}, currentURL="")`.
 *   integrationServices/google/controllers/feed.cfc:L58 — `product(rc)`, which hands the framework's
 *     `rc` straight through to the SKU smart list.
 *
 * ⭐ WHY THIS MODULE EXISTS AT ALL — THE RELOCATION RECORD. Both translators below were previously
 * declared inside `src/ports/SmartListQueryPort.ts`, beside the shapes they produce. That placement
 * was wrong on the port's own terms. The port is a DECLARATION-ONLY module: its contract permits "a
 * `const` union or type guard" and forbids "a working function body", and its layer rule (AAP §0.7.3
 * standard 4) is what keeps `src/ports/**` importable by every layer above it at zero runtime cost. A
 * consumer that needs only shapes should be able to write `import type` and pay nothing; while the
 * grammar lived in the port, three services and the Google feed query each held a genuine RUNTIME
 * import of a file that is supposed to disappear at compile time. Moving the emitted code here — a
 * utility, not an adapter, because a service may depend on a port or a utility but never on an adapter
 * — restores that property without changing one rule of the grammar.
 *
 * ⛔ WHAT DID NOT MOVE, AND WHY IT CANNOT. `SMARTLIST_ENTITY_SCHEMA` and
 * {@link resolveSmartListPropertyIdentifier} stay in the port. They are not translation behaviour:
 * they are the runtime half of a nominal type. `ResolvedSmartListProperty<TEntity>` is branded with a
 * module-private `unique symbol` that the port declares and never exports, so the ONLY value of that
 * type which can ever exist is one the resolver returned. Relocating the resolver would force either
 * exporting the brand — making it forgeable by any module, which destroys the mechanism AAP §0.7.3
 * standard 2 relies on — or moving the branded type itself, which would make the port import a
 * utility and break "ALLOWED imports: NONE". The port's own contract sanctions exactly that shape: a
 * `const` whitelist and the type guard that reads it. The reconciliation is recorded at the schema's
 * declaration in the port, so the two records cannot drift apart.
 *
 * LAYER POSITION. `src/util/**` is a leaf: it may import `src/ports/**` and `src/domain/**` and
 * nothing else. This module imports exactly one module — the port — for its shapes and for the
 * resolver. It reads no environment variable (`src/config/env.ts` is the only file permitted to),
 * touches no database, holds no state between calls, and contains no SQL: every property path it
 * emits has already been validated against the port's whitelist, so the adapter receives identifiers
 * it can place in a statement without interpolating caller input (AAP §0.7.3 standard 2, TR-4).
 *
 * WHAT THIS DELIBERATELY IS NOT. It is not a query builder: it produces a `SmartListQuery`
 * description and never a statement. It is not a validator that raises: every rejection path omits a
 * section, exactly as the legacy `add*` members silently decline a value they do not accept. It
 * invents no default page size, no result cap, no sort default and no timeout (AAP §0.7.3 standard 9,
 * IR-12); the only numbers here are source-declared values carried with their locators.
 *
 * NO USER-SPECIFIED RULES GOVERN THIS FILE. AAP §0.7.1 records that verdict — `review_rules` returns
 * "No user rules provided." — and no ancillary rule-bearing file exists anywhere in the repository.
 * Per UR4 that is not permission to lower the bar: the nine binding standards of AAP §0.7.3 govern
 * instead.
 */

import { resolveSmartListPropertyIdentifier } from '../ports/SmartListQueryPort';

import type {
  SmartListEntityName,
  SmartListFilter,
  SmartListInput,
  SmartListJoin,
  SmartListKeywordProperty,
  SmartListOrder,
  SmartListPagination,
  SmartListPropertyIdentifier,
  SmartListQuery,
  SmartListRange,
  SmartListWhereGroup,
} from '../ports/SmartListQueryPort';

/* ================================================================================================
 * THE SHARED RANGE TRANSLATOR — THE ONE PLACE A CALLER-SUPPLIED RANGE STRING IS INTERPRETED
 * ================================================================================================
 *
 * WHY THERE IS EXACTLY ONE OF IT. `addRange` was a method ON the SmartList in the legacy system, so
 * its acceptance test and its predicate emission were written once and every caller inherited them.
 * Ported naively, each service ends up interpreting the range string for itself — and when that
 * happened, the two copies drifted apart in OPPOSITE directions, each reproducing the half the other
 * omitted. One carried the acceptance test but neither the length gate nor the delimiter-free case;
 * the other carried the length gate and the emission branches but no acceptance test at all. Two
 * callers therefore produced different predicates from the same input, which is precisely the class of
 * divergence a "matching public surface" port is supposed to rule out. Consolidating restores the
 * legacy property that there is one interpretation, not one per caller.
 *
 * WHY IT LIVES IN THIS UTILITY AND NOT IN THE PORT. {@link translateSmartListRange} is pure string
 * logic over its two parameters — no package, no Node builtin, no injected collaborator, no state —
 * and for a while it was declared inside `src/ports/SmartListQueryPort.ts` beside the
 * {@link SmartListRange} shape it produces. It cannot stay there: a working function body is emitted
 * code, and the port is a declaration-only module whose contract admits only "a `const` union or type
 * guard". Relocating it here keeps the single-interpretation property intact while restoring the
 * port's zero-runtime invariant. Nothing about the grammar changed in the move — see the relocation
 * record in this module's header.
 *
 * THE FULL CENSUS OF LEGACY CALL SITES, because it is small enough to state exhaustively and it is
 * what makes the date approximation below safe to reason about. A repository-wide search for
 * `addRange(` outside the framework file itself returns exactly four lines:
 *
 *   [integrationServices/google/controllers/feed.cfc:L72]  addRange('product.calculatedQATS','1^')
 *       IN SCOPE. Numeric, lower-bound-only. The feed's availability gate (AAP 0.6.4.1).
 *   [model/transient/HibachiScope.cfc:L146]               addRange('calculatedQATS','1^')
 *       Out of scope. Identical numeric shape.
 *   [model/entity/Account.cfc:L158]                       addRange('...expirationDate','#now()#^')
 *       Out of scope. THE ONLY DATE-VALUED RANGE ANYWHERE IN THE LEGACY TREE.
 *   [meta/tests/unit/IssuesTest.cfc:L95]                  addRange('calculatedQATS','XXX^')
 *       A LEGACY REGRESSION TEST, and the reason the acceptance test is load-bearing rather than
 *       decorative — see the next paragraph.
 *
 * ⭐ THE ACCEPTANCE TEST IS PINNED BY A LEGACY TEST, WHICH SETTLES A QUESTION THAT WAS PREVIOUSLY
 * ARGUED THE OTHER WAY. `issue_1329` at [meta/tests/unit/IssuesTest.cfc:L91-L99] builds a product
 * SmartList, calls `addRange('calculatedQATS','XXX^')` with a deliberately malformed value, and then
 * calls `getPageRecords()`. It asserts nothing explicitly, which makes it a "must not blow up"
 * regression: the guard at [org/Hibachi/HibachiSmartList.cfc:L446] SILENTLY DISCARDS the malformed
 * range, so no predicate is emitted and the query runs unfiltered. Omitting the acceptance test does
 * not merely admit odd input — it changes the outcome of a named legacy regression, because `'XXX^'`
 * would otherwise become a live `calculatedQATS >= 'XXX'` bound. The numeric half of the test is
 * therefore both exactly reproducible AND behaviourally required, and it is reproduced here.
 *
 * ⚠️ THE DATE HALF IS A FLAGGED APPROXIMATION (AAP 0.7.3 standard 8, "flag mismatches rather than
 * assume them away"; standard 9, "invent nothing"). CFML's `isDate` recognises a locale-sensitive,
 * engine-dependent set of spellings that the source nowhere enumerates, so reproducing it exactly
 * would mean inventing a grammar. `Date.parse` is the closest primitive available without taking a
 * dependency, narrowed by rejecting anything already numeric because CFML's `isDate("5")` is false
 * while some engines' `Date.parse` is permissive about bare numbers. The divergence is confined to
 * WHICH range strings are admitted; no admitted value is ever rewritten. Per the census above, no
 * in-scope caller reaches the date arm at all — the single date-valued range in the legacy tree is
 * `model/entity/Account.cfc:L158`, in the explicitly excluded Account domain (AAP 0.2.2.1) — so the
 * approximation cannot change an in-scope result. That is a bounded, stated limitation, not a
 * silently accepted one.
 * ============================================================================================== */

/**
 * The range delimiter, `variables.rangeDelimiter` at org/Hibachi/HibachiSmartList.cfc:L36.
 *
 * Exported because both consuming services previously declared their own private copy of the literal,
 * and two literals is one more than the number of places this character should be written.
 */
export const SMART_LIST_RANGE_DELIMITER = '^';

/**
 * CFML list semantics over the range delimiter: EMPTY ELEMENTS ARE IGNORED.
 *
 * This is why `listFirst('^10','^')` and `listLast('^10','^')` are BOTH `'10'`, and why `'10^'` yields
 * `'10'` from either end. The emission branches below rely on that, so the behaviour is reproduced
 * here rather than approximated with a plain `split`.
 */
function splitRangeValue(value: string): string[] {
  return value.split(SMART_LIST_RANGE_DELIMITER).filter((element) => element.length > 0);
}

/* THE CFML SCALAR PREDICATES `readsAsCfmlNumeric` AND `readsAsCfmlDate` ARE DECLARED ONCE, LOWER IN
 * THIS FILE, alongside the rest of the engine-semantics helpers the input translator needs. They were
 * briefly declared twice — once here in a string-only form for range acceptance and once below in an
 * `unknown`-accepting form for `rc` entries — which is precisely the duplication this port exists to
 * remove. The lower pair subsumes the upper one (every string the upper pair accepted the lower pair
 * accepts identically), so the upper pair was withdrawn rather than both being kept in step by hand.
 * Function declarations hoist, so the range translator below may call them freely. */

/**
 * Translates one caller-supplied range entry into bounds, reproducing
 * org/Hibachi/HibachiSmartList.cfc:L446 (acceptance) and org/Hibachi/HibachiSmartList.cfc:L632-L655
 * (emission) exactly.
 *
 * THE TWO REJECTION PATHS HAVE DIFFERENT LEGACY ORIGINS AND THE SAME OBSERVABLE EFFECT, which is why
 * one function can own both:
 *   - FAILING ACCEPTANCE at `:L446` means the value is never stored, so no predicate exists.
 *   - PASSING ACCEPTANCE BUT FAILING THE LENGTH GATE at `:L632` means the value IS stored, and the
 *     emission loop then skips it — so again no predicate exists. The stored-but-inert entry is
 *     readable in the legacy only through `getRanges()` at `:L461-L470`, which this port deliberately
 *     does not expose, so the two cases are indistinguishable to every consumer here.
 * The length gate must be applied at THIS point and nowhere later: structuring the value into bounds
 * destroys the raw string, so an adapter receiving the pair could not reproduce the skip even in
 * principle.
 *
 * ⚠️ TODO(parity) — THE ACCEPTANCE TEST'S LOWER CLAUSE TESTS `listLast`, NOT `listFirst`. Both halves
 * of `:L446` share the identical third term `isDate(listLast(value, delimiter))`. In the lower-bound
 * clause that is almost certainly a typo, and it has a real consequence: a value whose LAST element
 * reads as a date admits the entry outright, however malformed its FIRST element is, so
 * `'abc^2024-01-15'` is accepted and yields the literal lower bound `'abc'`. It is carried verbatim,
 * because it decides which strings the legacy admits and "correcting" it would silently narrow the
 * accepted set (AAP 0.7.3 standard 7, preserve and annotate).
 *
 * @param propertyIdentifier - The property the range constrains, taken from the entry key.
 * @param value - The raw range entry exactly as the caller supplied it.
 * @returns The structured bounds, or `undefined` when the legacy would emit no predicate.
 *
 * @example
 * ```ts
 * translateSmartListRange('p', '1^');        // { propertyIdentifier: 'p', lowerBound: '1' }
 * translateSmartListRange('p', '^10');       // { propertyIdentifier: 'p', upperBound: '10' }
 * translateSmartListRange('p', '5^10');      // both bounds
 * translateSmartListRange('p', '10');        // both bounds '10' — EXACT EQUALITY
 * translateSmartListRange('p', '5');         // undefined — length gate, NO predicate
 * translateSmartListRange('p', 'XXX^');      // undefined — rejected, pins issue_1329
 * ```
 */
export function translateSmartListRange(
  propertyIdentifier: SmartListPropertyIdentifier,
  value: string,
): SmartListRange | undefined {
  const elements = splitRangeValue(value);
  const first = elements[0] ?? '';
  const last = elements.length > 0 ? (elements[elements.length - 1] ?? '') : '';

  const startsWithDelimiter = value.startsWith(SMART_LIST_RANGE_DELIMITER);
  const endsWithDelimiter = value.endsWith(SMART_LIST_RANGE_DELIMITER);

  // [:L446] — the two clauses, with the shared `isDate(listLast(...))` term hoisted so the quirk
  // documented above is visible as a single value used by both rather than written out twice.
  const lastReadsAsDate = readsAsCfmlDate(last);
  const lowerAcceptable = startsWithDelimiter || readsAsCfmlNumeric(first) || lastReadsAsDate;
  const upperAcceptable = endsWithDelimiter || readsAsCfmlNumeric(last) || lastReadsAsDate;
  if (!lowerAcceptable || !upperAcceptable) {
    return undefined;
  }

  // [:L632] — the emission loop skips any stored value of one character or fewer.
  if (value.length <= 1) {
    return undefined;
  }

  // [:L635] Only a higher bound, taken from the LAST element at [:L638].
  if (startsWithDelimiter) {
    return { propertyIdentifier, upperBound: last };
  }
  // [:L642] Only a lower bound, taken from the FIRST element at [:L645].
  if (endsWithDelimiter) {
    return { propertyIdentifier, lowerBound: first };
  }
  // [:L649] Both bounds, first and last respectively at [:L653-L654]. For a DELIMITER-FREE value the
  // two elements are the same string, so this is exact equality — `>= v AND <= v`.
  return { propertyIdentifier, lowerBound: first, upperBound: last };
}

/* =================================================================================================
 * THE ONE SHARED SMARTLIST INPUT TRANSLATOR
 * =================================================================================================
 * ⚠️⚠️ F10 — WHY THERE IS EXACTLY ONE OF IT.
 *
 * `src/services/OptionService.ts` and `src/services/SkuService.ts` each carried their OWN complete
 * translation of the FW/1 `rc` data-key grammar into the query shapes declared above — roughly twenty
 * constants and a dozen functions apiece. The two implementations DISAGREED, so the same framework
 * input could produce two different query descriptions depending on which service received it. Every
 * divergence was measured against `org/Hibachi/HibachiSmartList.cfc` before this translator was
 * written, and the authority-faithful rule was taken in each case:
 *
 *   1. RANGE ACCEPTABILITY. `HibachiSmartList.cfc:L446` gates `addRange` on
 *      `(left(value,1) == delim || isNumeric(listFirst(value,delim)) || isDate(listLast(value,delim)))
 *      && (right(value,1) == delim || isNumeric(listLast(value,delim)) || isDate(listLast(value,delim)))`.
 *      One implementation reproduced that gate; the other had NO numeric/date test at all and so
 *      accepted ranges the legacy silently discards. The gate is kept.
 *      ⚠️ TODO(parity): the legacy tests `isDate(listLast(...))` in BOTH halves — the LOWER half asks
 *      about the LAST element, which is almost certainly meant to be `listFirst`. That asymmetry is
 *      reproduced verbatim below, NOT repaired: AAP 0.7.3 "preserve and annotate, do not repair", and
 *      AAP 0.6.7 governs which departures are permitted. No register identifier is minted, because
 *      AAP 0.6.7 closes its register and this line lies in `org/Hibachi/**`, outside the 21 in-scope
 *      files that register covers.
 *   2. RANGE LENGTH GUARD. One implementation rejected any value of length <= 1 before parsing.
 *      `:L446` has no such guard, so it is dropped — rule 1 already rejects the inputs it was
 *      shielding against, and it additionally rejected the legal single-character numeric range.
 *   3. EMPTY ORDER PROPERTIES. `:L480` appends an order only `if(len(aliasedProperty))`, and one
 *      implementation checked only for `undefined` while the other also checked for `''`. MEASURED
 *      RESULT: the two agree, and the review's concern does not reproduce. {@link cfmlListToArray}
 *      models CFML's list semantics, in which empty elements are skipped rather than preserved, so the
 *      first element of a parsed statement can never be `''` — `'|DESC'` parses to `['DESC']`, exactly
 *      as `listFirst('|DESC','|')` returns `'DESC'` and `listLen` returns 1. The `len()` test is
 *      therefore retained as faithful but UNREACHABLE defensive code, and this entry is recorded as a
 *      divergence that was checked and found not to exist rather than quietly dropped from the list.
 *      One consequence is worth naming because it looks like a bug and is not: `OrderBy=|DESC` orders
 *      by a property literally named `DESC`, ascending, in both the legacy and here.
 *   4. ORDER DIRECTION. `:L476` is `listFindNoCase("D,DESC", listLast(statement, delim))`. CFML's
 *      `listFindNoCase` compares elements case-insensitively but does NOT trim them, so a trailing
 *      `"brandName| DESC"` leaves the direction ASC. One implementation trimmed before comparing and
 *      would have returned DESC. The non-trimming legacy comparison is kept — the same reasoning F23
 *      applied when it matched `listFind` semantics exactly rather than approximating them.
 *   5. PAGE COERCION. One implementation used `Number(String(value).trim())` guarded by
 *      `Number.isFinite`, which accepts forms CFML's `isNumeric` rejects — `Number('0x10')` is 16 and
 *      `Number('')` is 0. {@link readAcceptablePageValue} goes through the CFML numeric predicate
 *      instead, so hexadecimal, empty and whitespace inputs are refused as the legacy refuses them.
 *   6. BOOLEAN-REMOVAL COERCION. The `FR:`, `FIR:` and `FKR:` removal keys are CFML booleans. One
 *      implementation folded "is this a boolean?" and "what is its value?" into a single truthiness
 *      test that treated any non-zero number as true while refusing the string `'false'` a meaning at
 *      all. The two-step CFML form is kept: {@link readsAsCfmlBoolean} then {@link toCfmlBoolean}, so
 *      `'no'`, `'false'` and `0` are recognised booleans that mean "do not remove".
 *   7. UNDEFINED INPUT. One implementation returned a bare `{ entityName }` for an absent input,
 *      DISCARDING the caller's joins and keyword properties — which are structural, not filter-driven,
 *      and must survive an empty request. The absent-input path now composes through the same
 *      function as every other path.
 *
 * PLACEMENT. The three consuming services already import `../ports/SmartListQueryPort` for
 * `SmartListInput` and `SmartListQuery`, so routing them through this module adds one import edge and
 * no new layer: `src/util/**` sits beneath `src/services/**` exactly as `src/ports/**` does, and this
 * module reaches DOWN to the port for its shapes and never sideways or up.
 * `src/adapters/mysql/SmartListQueryBuilder.ts` would be the wrong home, because a service may depend
 * on a port or a utility but never on an adapter (AAP §0.7.3 standard 4) — which is also why the
 * relocation record in this module's header settles on a utility rather than an adapter.
 * ============================================================================================== */

/** CFML's default list delimiter, used by every `list*` function that is not given one. */
const CFML_LIST_DELIMITER = ',';

/** The data-key delimiter of the FW/1 `rc` grammar: `F:propertyName`, `P:Show`, and so on. */
const SMART_LIST_DATA_KEY_DELIMITER = ':';

const FILTER_PREFIX = `F${SMART_LIST_DATA_KEY_DELIMITER}`;
const FILTER_REMOVAL_PREFIX = `FR${SMART_LIST_DATA_KEY_DELIMITER}`;
const IN_FILTER_PREFIX = `FI${SMART_LIST_DATA_KEY_DELIMITER}`;
const IN_FILTER_REMOVAL_PREFIX = `FIR${SMART_LIST_DATA_KEY_DELIMITER}`;
const LIKE_FILTER_PREFIX = `FK${SMART_LIST_DATA_KEY_DELIMITER}`;
const LIKE_FILTER_REMOVAL_PREFIX = `FKR${SMART_LIST_DATA_KEY_DELIMITER}`;
const RANGE_PREFIX = `R${SMART_LIST_DATA_KEY_DELIMITER}`;
const ORDER_BY_KEY = 'OrderBy';
const PAGE_SHOW_KEY = `P${SMART_LIST_DATA_KEY_DELIMITER}Show`;
const PAGE_START_KEY = `P${SMART_LIST_DATA_KEY_DELIMITER}Start`;
const PAGE_CURRENT_KEY = `P${SMART_LIST_DATA_KEY_DELIMITER}Current`;
const KEYWORD_KEY = 'keyword';
const KEYWORDS_KEY = 'keywords';

/** `HibachiSmartList.cfc` treats this literal as "no paging at all". */
const PAGE_RECORDS_SHOW_ALL_KEYWORD = 'ALL';

/** The row count `PAGE_RECORDS_SHOW_ALL_KEYWORD` resolves to, and the ceiling on any page figure. */
const PAGE_RECORDS_SHOW_ALL = 1000000000;

const ORDER_DIRECTION_DELIMITER = '|';
const LIKE_FILTER_WILDCARD = '%';

/* THE RANGE DELIMITER IS NOT RE-DECLARED HERE. It is exported once as
 * {@link SMART_LIST_RANGE_DELIMITER} above and used by {@link translateSmartListRange}, which is now
 * the single owner of the range grammar; a second private `'^'` literal at this point existed only to
 * feed the withdrawn local range parser and would be a silent drift risk if reinstated. */

/** The `"D,DESC"` list of `HibachiSmartList.cfc:L476`, compared case-insensitively and untrimmed. */
const DESCENDING_ORDER_TOKENS: readonly string[] = Object.freeze(['D', 'DESC']);

/** The three spellings of a keyword separator the legacy normalises before splitting. */
const KEYWORD_SEPARATORS: readonly string[] = Object.freeze([' ', '%20', '+']);

/** CFML `listToArray`, which drops empty elements rather than preserving them as `''`. */
function cfmlListToArray(list: string, delimiter: string = CFML_LIST_DELIMITER): string[] {
  return list.split(delimiter).filter((entry) => entry.length > 0);
}

/** CFML `isSimpleValue` for the three scalar kinds an `rc` entry can carry. */
function isCfmlSimpleValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** CFML `isNumeric` — deliberately narrower than `Number()`, which accepts hex and empty strings. */
function readsAsCfmlNumeric(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed);
}

/** CFML numeric coercion. Yields `NaN` for anything {@link readsAsCfmlNumeric} rejects. */
function toCfmlNumber(value: unknown): number {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (!readsAsCfmlNumeric(value)) {
    return Number.NaN;
  }
  return Number(typeof value === 'string' ? value.trim() : value);
}

/** CFML `isDate`. A numeric string is NOT a date here, matching the engine's precedence. */
function readsAsCfmlDate(value: string): boolean {
  if (value.trim().length === 0 || readsAsCfmlNumeric(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value.trim()));
}

/** CFML `isBoolean` — the first half of the two-step coercion of divergence 6. */
function readsAsCfmlBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'string') {
    return false;
  }
  const normalised = value.trim().toLowerCase();
  return (
    normalised === 'true' ||
    normalised === 'false' ||
    normalised === 'yes' ||
    normalised === 'no' ||
    readsAsCfmlNumeric(value)
  );
}

/**
 * CFML boolean coercion — the second half. Meaningful only after {@link readsAsCfmlBoolean}.
 *
 * ⚠️ THIS FUNCTION IS TRIPLICATED, AND THE THREE COPIES ONCE DISAGREED. The six coercion helpers
 * above are declared here, in `../services/SkuService` and in `../services/ProductService`,
 * module-private in each, because S5 admits no shared helper module for them. The arrangement is
 * only safe while the copies stay identical, and one did not: `ProductService` ended this chain with
 * `toCfmlNumber(normalised) !== 0` rather than `return false`, so for a value
 * {@link readsAsCfmlBoolean} REJECTS it answered TRUE where this copy answers FALSE. The three
 * callers below apply the predicate inline, so this module never reached the divergent input — but
 * the bodies are byte-identical again, and an edit to any of the six is an edit to three files.
 */
function toCfmlBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    if (normalised === 'true' || normalised === 'yes') {
      return true;
    }
    if (normalised === 'false' || normalised === 'no') {
      return false;
    }
    if (readsAsCfmlNumeric(value)) {
      return toCfmlNumber(value) !== 0;
    }
  }
  return false;
}

/** Wraps each comma-delimited element of a `FK:` value in the SQL `LIKE` wildcard. */
function buildPatternFilterValue(raw: string): string {
  return cfmlListToArray(raw)
    .map((element) => `${LIKE_FILTER_WILDCARD}${element}${LIKE_FILTER_WILDCARD}`)
    .join(CFML_LIST_DELIMITER);
}

/**
 * `HibachiSmartList.cfc:L446` — the range acceptability gate and the bound split.
 *
 * The `isDate(listLast(...))` appearing in the LOWER test is the legacy asymmetry recorded as
 * divergence 1 above; it is reproduced rather than corrected.
 */
/**
 * Range parsing for an `rc` entry DELEGATES to {@link translateSmartListRange} rather than repeating
 * it. This function previously carried a second, independent implementation of `:L446` acceptance and
 * `:L632-L655` emission, and the two had already drifted in two observable ways before they were
 * noticed:
 *
 *   1. THE `:L632` LENGTH GATE WAS MISSING HERE, so a one-character stored value such as `"5"`
 *      produced a predicate where the legacy emission loop skips it and produces none.
 *   2. THE BOUNDS WERE SLICED AROUND THE FIRST DELIMITER instead of taken from the FIRST and LAST
 *      list elements, so a three-element value like `"1^2^3"` yielded an upper bound of `"2^3"` where
 *      `:L638`/`:L654`'s `listLast` yields `"3"`.
 *
 * Both are gone by construction now that one function owns the grammar. Do not reintroduce a local
 * copy: the acceptance and emission rules are a single legacy behaviour and belong in a single place.
 */
function parseRangeValue(
  entityName: SmartListEntityName,
  rawProperty: string,
  raw: string,
): SmartListRange | undefined {
  const propertyIdentifier = resolveSmartListPropertyIdentifier(entityName, rawProperty);
  if (propertyIdentifier === undefined) {
    return undefined;
  }
  return translateSmartListRange(propertyIdentifier, raw);
}

/**
 * `HibachiSmartList.cfc:L473-L482` — property identifier, direction, and the `len()` guard.
 *
 * The direction comparison is case-insensitive and UNTRIMMED, which is what `listFindNoCase` does
 * (divergence 4).
 */
function parseOrderStatement(
  entityName: SmartListEntityName,
  statement: string,
): SmartListOrder | undefined {
  const parts = cfmlListToArray(statement, ORDER_DIRECTION_DELIMITER);
  const rawProperty = parts[0];
  if (rawProperty === undefined || rawProperty.length === 0) {
    return undefined;
  }
  const propertyIdentifier = resolveSmartListPropertyIdentifier(entityName, rawProperty);
  if (propertyIdentifier === undefined) {
    return undefined;
  }
  const lastPart = parts[parts.length - 1];
  const descending =
    parts.length > 1 &&
    lastPart !== undefined &&
    DESCENDING_ORDER_TOKENS.some((token) => token === lastPart.toUpperCase());
  return { propertyIdentifier, direction: descending ? 'DESC' : 'ASC' };
}

/** Normalises the three keyword separator spellings, then splits on the CFML list delimiter. */
function parseKeywords(raw: string): string[] {
  let keywordList = raw;
  for (const separator of KEYWORD_SEPARATORS) {
    keywordList = keywordList.split(separator).join(CFML_LIST_DELIMITER);
  }
  return cfmlListToArray(keywordList);
}

/** A page figure is acceptable only when CFML would read it as a number in `(0, ALL]`. */
function readAcceptablePageValue(value: string | number | boolean): number | undefined {
  if (!readsAsCfmlNumeric(value)) {
    return undefined;
  }
  const numeric = toCfmlNumber(value);
  return numeric > 0 && numeric <= PAGE_RECORDS_SHOW_ALL ? numeric : undefined;
}

/** `removeFilter` and friends drop EVERY entry for the property, not merely the first. */
function removeEntriesForProperty(entries: SmartListFilter[], propertyIdentifier: string): void {
  for (let index = entries.length - 1; index >= 0; index--) {
    if (entries[index]?.propertyIdentifier === propertyIdentifier) {
      entries.splice(index, 1);
    }
  }
}

/** The mutable accumulator the entry loop fills before {@link composeQuery} freezes it into shape. */
interface SmartListQueryDraft {
  readonly filters: SmartListFilter[];
  readonly likeFilters: SmartListFilter[];
  readonly inFilters: SmartListFilter[];
  readonly ranges: SmartListRange[];
  readonly orders: SmartListOrder[];
  keywords: string[];
  pageRecordsStart?: number;
  pageRecordsShow?: number;
  currentPageDeclaration?: string;
}

/** `OrderBy` carries a comma-delimited list of `property|direction` statements. */
function applyOrderByEntry(
  entityName: SmartListEntityName,
  draft: SmartListQueryDraft,
  raw: string,
): void {
  for (const statement of cfmlListToArray(raw, CFML_LIST_DELIMITER)) {
    const order = parseOrderStatement(entityName, statement);
    if (order !== undefined) {
      draft.orders.push(order);
    }
  }
}

/** `P:Show` accepts the literal `ALL` in addition to a numeric page size. */
function applyPageShowEntry(draft: SmartListQueryDraft, value: string | number | boolean): void {
  if (typeof value === 'string' && value.trim().toUpperCase() === PAGE_RECORDS_SHOW_ALL_KEYWORD) {
    draft.pageRecordsShow = PAGE_RECORDS_SHOW_ALL;
    return;
  }
  const show = readAcceptablePageValue(value);
  if (show !== undefined) {
    draft.pageRecordsShow = show;
  }
}

/** Dispatches one `rc` entry onto the draft by its data-key prefix. */
function applyInputEntry(
  entityName: SmartListEntityName,
  draft: SmartListQueryDraft,
  key: string,
  value: string | number | boolean,
): void {
  /* SEC-09 — EVERY PROPERTY PATH THAT REACHES A DRAFT IS RESOLVED AGAINST THE ENTITY SCHEMA FIRST.
   *
   * `resolveSmartListPropertyIdentifier` returns `undefined` for any path whose segments do not
   * resolve, and an unresolvable entry is DROPPED rather than reported. That is not a softened
   * check: it is the legacy behaviour. `HibachiSmartList.cfc` resolves filters at :L362, ranges at
   * :L449, orders at :L480 and keyword properties at :L487, and an unresolvable path there yields a
   * query with the entry MISSING and no error anywhere. Raising instead would turn a silently
   * ignored request key into a failed request — a behaviour change in the opposite direction, and
   * one AAP §0.8.2 Guideline 2 forbids.
   *
   * ⛔ THE VALIDATION LIVES HERE, IN THE ONE SHARED TRANSLATOR, AND NOT IN A PER-SERVICE COPY.
   * Every SmartList consumer — sku, option and optionGroup — is routed through this function, so
   * closing the surface here closes it for all of them at once. A per-service copy would harden
   * only the service that carried it and would leave its siblings open, which is precisely the
   * asymmetry that made a local translator the wrong home for this rule. */
  const resolve = (raw: string): SmartListPropertyIdentifier | undefined =>
    resolveSmartListPropertyIdentifier(entityName, raw);

  if (key.startsWith(FILTER_PREFIX)) {
    const propertyIdentifier = resolve(key.slice(FILTER_PREFIX.length));
    if (propertyIdentifier !== undefined) {
      draft.filters.push({ propertyIdentifier, value });
    }
    return;
  }
  if (key.startsWith(FILTER_REMOVAL_PREFIX) && readsAsCfmlBoolean(value) && toCfmlBoolean(value)) {
    removeEntriesForProperty(draft.filters, key.slice(FILTER_REMOVAL_PREFIX.length));
    return;
  }
  if (key.startsWith(IN_FILTER_PREFIX)) {
    const propertyIdentifier = resolve(key.slice(IN_FILTER_PREFIX.length));
    if (propertyIdentifier !== undefined) {
      draft.inFilters.push({ propertyIdentifier, value });
    }
    return;
  }
  if (
    key.startsWith(IN_FILTER_REMOVAL_PREFIX) &&
    readsAsCfmlBoolean(value) &&
    toCfmlBoolean(value)
  ) {
    removeEntriesForProperty(draft.inFilters, key.slice(IN_FILTER_REMOVAL_PREFIX.length));
    return;
  }
  if (key.startsWith(LIKE_FILTER_PREFIX)) {
    const propertyIdentifier = resolve(key.slice(LIKE_FILTER_PREFIX.length));
    if (propertyIdentifier !== undefined) {
      draft.likeFilters.push({
        propertyIdentifier,
        value: buildPatternFilterValue(String(value)),
      });
    }
    return;
  }
  if (
    key.startsWith(LIKE_FILTER_REMOVAL_PREFIX) &&
    readsAsCfmlBoolean(value) &&
    toCfmlBoolean(value)
  ) {
    removeEntriesForProperty(draft.likeFilters, key.slice(LIKE_FILTER_REMOVAL_PREFIX.length));
    return;
  }
  if (key.startsWith(RANGE_PREFIX)) {
    const range = parseRangeValue(entityName, key.slice(RANGE_PREFIX.length), String(value));
    if (range !== undefined) {
      draft.ranges.push(range);
    }
    return;
  }
  if (key === ORDER_BY_KEY) {
    applyOrderByEntry(entityName, draft, String(value));
    return;
  }
  if (key === PAGE_SHOW_KEY) {
    applyPageShowEntry(draft, value);
    return;
  }
  if (key === PAGE_START_KEY) {
    const start = readAcceptablePageValue(value);
    if (start !== undefined) {
      draft.pageRecordsStart = start;
    }
    return;
  }
  if (key === PAGE_CURRENT_KEY) {
    const current = readAcceptablePageValue(value);
    if (current !== undefined) {
      draft.currentPageDeclaration = String(current);
    }
  }
}

/** Folds the draft into a {@link SmartListQuery}, omitting every section the input did not populate. */
function composeQuery<TEntityName extends SmartListEntityName>(
  options: SmartListTranslationOptions<TEntityName>,
  draft: SmartListQueryDraft,
): SmartListQuery<TEntityName> {
  const whereGroup: SmartListWhereGroup = {
    ...(draft.filters.length > 0 ? { filters: draft.filters } : {}),
    ...(draft.likeFilters.length > 0 ? { likeFilters: draft.likeFilters } : {}),
    ...(draft.inFilters.length > 0 ? { inFilters: draft.inFilters } : {}),
    ...(draft.ranges.length > 0 ? { ranges: draft.ranges } : {}),
  };
  const pagination: SmartListPagination = {
    ...(draft.pageRecordsStart !== undefined ? { pageRecordsStart: draft.pageRecordsStart } : {}),
    ...(draft.pageRecordsShow !== undefined ? { pageRecordsShow: draft.pageRecordsShow } : {}),
    ...(draft.currentPageDeclaration !== undefined
      ? { currentPageDeclaration: draft.currentPageDeclaration }
      : {}),
  };

  // The caller's structural additions, applied AFTER the owning service's base joins — the legacy's
  // own order, since `integrationServices/google/controllers/feed.cfc:L64-L66` mutates the object the
  // service has already built at `:L63`. See `SmartListInput.additionalJoins`.
  const additionalJoins = options.input?.additionalJoins;
  const joins: readonly SmartListJoin[] | undefined =
    additionalJoins !== undefined && additionalJoins.length > 0
      ? [...(options.joins ?? []), ...additionalJoins]
      : options.joins;

  return {
    entityName: options.entityName,
    ...(joins !== undefined ? { joins } : {}),
    ...(options.keywordProperties !== undefined
      ? { keywordProperties: options.keywordProperties }
      : {}),
    ...(Object.keys(whereGroup).length > 0 ? { whereGroups: [whereGroup] } : {}),
    ...(draft.keywords.length > 0 ? { keywords: draft.keywords } : {}),
    ...(draft.orders.length > 0 ? { orders: draft.orders } : {}),
    ...(Object.keys(pagination).length > 0 ? { pagination } : {}),
  };
}

/**
 * The per-call inputs to {@link translateSmartListInput}.
 *
 * `joins` and `keywordProperties` are the only legitimate per-consumer variation: they are STRUCTURAL
 * declarations the calling service owns (`SkuService` declares four joins and its keyword properties;
 * `OptionService` declares none), whereas everything else in the grammar is framework behaviour and
 * must not vary by caller. Passing them in is what allows one translator to serve both without either
 * service re-deriving the grammar.
 *
 * ⭐ GENERIC IN THE ROOT ENTITY, SO THE LITERAL SURVIVES THE TRANSLATION. `SmartListQueryPort.execute`
 * derives its record type from `query.entityName` through `SmartListEntityRecordTypes`, which it can
 * only do while the particular name a caller wrote is still visible in the type. Were this member typed
 * as the bare union, every query this translator produced would arrive at the port having forgotten
 * which entity it selects from, and no caller could hand one straight to the port. The parameter
 * DEFAULTS to the full union, so the many places that describe a translation without caring which
 * entity it names are unaffected.
 *
 * @typeParam TEntityName - The root entity, inferred from the `entityName` supplied.
 */
export interface SmartListTranslationOptions<
  TEntityName extends SmartListEntityName = SmartListEntityName,
> {
  /**
   * The entity the query selects from, e.g. `SlatwallSku`.
   *
   * ⛔ TYPED AS `SmartListEntityName`, NOT `string`, AND THAT IS LOAD-BEARING FOR SEC-09. This is
   * the root every caller-supplied property path is resolved against by
   * {@link resolveSmartListPropertyIdentifier} below. A `string` here would leave the resolver with
   * no schema to consult and would reopen the identifier surface that the branded
   * {@link SmartListPropertyIdentifier} exists to close.
   */
  readonly entityName: TEntityName;

  /** The raw FW/1 `rc` data structure. An absent input still yields joins and keyword properties. */
  readonly input?: SmartListInput | undefined;

  /** Structural joins the calling service declares for every one of its SmartLists. */
  readonly joins?: readonly SmartListJoin[] | undefined;

  /** Weighted keyword properties the calling service declares for keyword search. */
  readonly keywordProperties?: readonly SmartListKeywordProperty[] | undefined;
}

/**
 * Translates an FW/1 `rc` data structure into a {@link SmartListQuery} — the single authority for the
 * data-key grammar, consumed by every service that exposes a SmartList member (F10).
 *
 * Only entries whose value is a CFML simple value participate, because the legacy `rc` reaches
 * `HibachiSmartList` through URL and form scopes that cannot carry anything else; a structure or array
 * arriving under a recognised key is ignored rather than coerced. Unrecognised keys are ignored too,
 * which is what lets `keyword`, `keywords` and any application-specific key coexist with the grammar.
 *
 * Pure and synchronous: it performs no data access, holds no state between calls, mutates neither the
 * input nor module scope, and cannot throw. Every rejection path returns a query with that section
 * omitted rather than raising, exactly as the legacy `add*` members silently decline a value they do
 * not accept.
 *
 * @param options - The entity name, the raw input, and the caller's structural declarations.
 * @returns The immutable query description, with every unpopulated section absent.
 */
export function translateSmartListInput<TEntityName extends SmartListEntityName>(
  options: SmartListTranslationOptions<TEntityName>,
): SmartListQuery<TEntityName> {
  const draft: SmartListQueryDraft = {
    filters: [],
    likeFilters: [],
    inFilters: [],
    ranges: [],
    orders: [],
    keywords: [],
  };

  if (options.input === undefined) {
    return composeQuery(options, draft);
  }

  const entries = options.input as Readonly<Record<string, unknown>>;
  for (const key of Object.keys(entries)) {
    const value = entries[key];
    if (isCfmlSimpleValue(value)) {
      applyInputEntry(options.entityName, draft, key, value);
    }
  }

  const singularKeyword = entries[KEYWORD_KEY];
  const pluralKeywords = entries[KEYWORDS_KEY];
  const rawKeywords = typeof singularKeyword === 'string' ? singularKeyword : pluralKeywords;
  if (typeof rawKeywords === 'string') {
    draft.keywords = parseKeywords(rawKeywords);
  }

  return composeQuery(options, draft);
}

/* ================================================================================================
 * THE JOIN MERGER — RELOCATED HERE WITH THE REST OF THE SMART-LIST INPUT GRAMMAR
 * ================================================================================================
 *
 * WHY IT MOVED, AND WHY IT MOVED HERE RATHER THAN STAYING BEHIND. This function was declared in
 * `src/ports/SmartListQueryPort.ts` alongside the `rc` grammar and the range grammar. All three are
 * working function bodies rather than contracts, and a port declares contracts; the other two were
 * relocated into this module and this one is the third. Nothing about it changed in the move — the
 * body, the first-declaration-wins polarity and the freeze are byte-for-byte what that module
 * declared — so no behaviour is at stake in the relocation, only where the code lives.
 *
 * ⛔ THE PORT NOW EMITS NO CALLABLE CODE BEYOND ITS ONE GUARD, WHICH IS WHAT ITS HEADER CLAIMS. That
 * header states consumers import the grammar from this module; leaving the merger behind would have
 * made that statement false for one identifier, and a header that is true for two of three callables
 * is a header a reader cannot rely on. `resolveSmartListPropertyIdentifier` stays there because it
 * resolves against `SMARTLIST_ENTITY_SCHEMA`, which is the port's own declared shape, and this module
 * imports it from there rather than copying it.
 * ---------------------------------------------------------------------------------------------- */

/**
 * Merge a caller's extra joins into a member's own base joins, keeping the base joins first and
 * dropping any duplicate.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHY A MEMBER NEEDS THIS AT ALL — THE LEGACY EXTENDS A SMART LIST FROM OUTSIDE THE SERVICE
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * `integrationServices/google/controllers/feed.cfc:L63` calls the SKU smart-list member with ZERO
 * arguments and then MUTATES the object it gets back, adding three related-property joins at
 * `:L64-L66`. The service's own joins are already on that object, so the controller's additions are
 * genuinely additive and the legacy's `addRelatedProperty` is idempotent per relationship.
 *
 * This port returns a materialised RESULT rather than a mutable smart-list object, so there is nothing
 * for a caller to mutate afterwards and the additions have to travel INTO the member. That is the
 * "structural channel" this function completes: the caller hands over joins, the member merges them
 * with its own and passes one list to {@link translateSmartListInput}.
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────────────
 * WHY DUPLICATES MUST BE DROPPED RATHER THAN CONCATENATED
 * ───────────────────────────────────────────────────────────────────────────────────────────────────
 * `feed.cfc:L64` joins `SlatwallSku -> product`, and the SKU service's own base joins ALREADY contain
 * that exact join (`model/service/SkuService.cfc:L314`). Concatenating would emit the same join twice,
 * which in the legacy is a no-op — `addRelatedProperty` keys on the relationship — but in emitted SQL
 * is a second join of the same table under a second alias. That changes the statement, and with a
 * fanning relationship it changes the row multiplicity too. So a join is admitted only when no earlier
 * entry already declares the same `parentEntityName` + `relatedProperty` pair.
 *
 * ⚠️ THE FIRST DECLARATION WINS, INCLUDING ITS `joinType`. If a base join omits `joinType` and an extra
 * join of the same relationship declares `left`, the base entry stands. That is the safe direction
 * here: the emitter resolves an absent `joinType` to a LEFT join anyway
 * (`org/Hibachi/HibachiSmartList.cfc:L539-L541`), so keeping the base entry cannot narrow a left join
 * into an inner one and cannot drop a row the caller expected to keep. Letting the LATER entry win
 * could do exactly that, which is why the polarity is stated rather than left to read off the loop.
 *
 * @param baseJoins - The member's own joins, emitted first and never dropped.
 * @param additionalJoins - A caller's joins. `undefined` returns `baseJoins` unchanged, so a member
 *   that no caller extends pays nothing and emits precisely the statement it emitted before.
 * @returns A frozen list. Frozen because a member's base joins are module-scope constants and a
 *   returned array that a caller could mutate would let one invocation edit the next one's selection on
 *   a warm container (M7).
 */
export function mergeSmartListJoins(
  baseJoins: readonly SmartListJoin[],
  additionalJoins?: readonly SmartListJoin[],
): readonly SmartListJoin[] {
  if (additionalJoins === undefined || additionalJoins.length === 0) {
    return baseJoins;
  }

  const merged: SmartListJoin[] = [];
  const seen = new Set<string>();
  for (const join of [...baseJoins, ...additionalJoins]) {
    const key = `${join.parentEntityName}.${join.relatedProperty}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(join);
  }
  return Object.freeze(merged);
}
