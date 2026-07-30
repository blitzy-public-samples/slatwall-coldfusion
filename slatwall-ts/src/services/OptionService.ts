/**
 * `OptionService` — the Catalog's option and option-group service.
 *
 * Legacy origin: `model/service/OptionService.cfc`, 99 lines of which 15 are executable. AAP
 * §0.4.1.8 mandates this file, §0.4.2.4 fixes the three DECLARED members, and §0.4.2.5 fixes the
 * four SYNTHESIZED members that had no declaration anywhere in the legacy tree. Interface parity is
 * therefore checkable member by member against those two tables, which is exactly what AAP §0.8.3.1
 * asks for.
 *
 * WHY THIS FILE IS SEVEN MEMBERS AND NOT THREE. A reader who opens
 * `model/service/OptionService.cfc` finds three `public` declarations and might reasonably conclude
 * that the port is three methods long. It is not, and the reason is IR-1. `onMissingMethod` at
 * [org/Hibachi/HibachiService.cfc:L255-L281] fabricated an entire implicit surface by prefix,
 * dispatching on a `get`-prefixed name at [:L258] and splitting on the `smartlist` suffix at
 * [:L259-L260]. That is why four calls resolve at run time against a component that declares none
 * of them:
 *   - `optionService.getOption(id)`            — [model/service/SkuService.cfc:L75]
 *   - `optionService.getOptionGroup(id)`       — [model/service/ProductService.cfc:L115]
 *   - `optionService.getOptionSmartList()`     — [model/entity/Product.cfc:L341]
 *   - `optionService.getOptionGroupSmartList()`— [model/entity/Product.cfc:L254]
 * TypeScript under `strict` has no equivalent facility, so under IR-1 and TR-3 each of those four
 * becomes an explicitly declared, typed member below. ⛔ The dispatcher itself is NEVER ported: no
 * `Proxy`, no `Reflect`, no string dispatcher, no index signature, no decorator and no service
 * locator appears in this file, and `org/Hibachi/**` is read for contract only and never imported
 * (AAP §0.8.3.2).
 *
 * ⛔ SYNTHESIS IS REPRODUCED ONLY WHERE IT IS USED. The legacy dispatcher would have answered
 * `newOption`, `saveOption`, `deleteOption`, `countOption`, `listOption`, `exportOption` and
 * `processOption*` just as readily — [org/Hibachi/HibachiService.cfc:L264-L277] routes every one of
 * those prefixes. None of them has a call site in this slice, so none is declared here. AAP §0.4.2.5
 * states the rule plainly: "synthesis is not reproduced wholesale, only where used". Declaring the
 * unused remainder would manufacture a public API the legacy never exercised, and the five empty
 * banner pairs in the legacy source — Logical Methods [:L66-L68], Process Methods [:L82-L84], Save
 * Overrides [:L86-L88], Smart List Overrides [:L90-L92] and Get Overrides [:L94-L96] — are the
 * source's own confirmation that this component overrides nothing in any of those categories.
 *
 * ⛔ NO SAVE OR DELETE MEMBER EXISTS HERE, AND THAT IS NOT AN OVERSIGHT. `model/validation/Option.json`
 * and `model/validation/OptionGroup.json` were both read for contract awareness: the first requires
 * `optionCode` (unique, pattern-matched), `optionName` and `optionGroup` in the `save` context and
 * guards deletion on an empty `skus` collection; the second requires `optionGroupName` and
 * `optionGroupCode` (unique, pattern-matched) and guards deletion on an empty `options` collection.
 * Those rule sets are owned by `src/validation/rules/option.rules.ts` and
 * `src/validation/rules/optionGroup.rules.ts`, and the save and delete behaviour they gate is owned
 * by `src/services/BaseService.ts` — the port of the LOCAL overrides at
 * [model/service/HibachiService.cfc:L68] and [:L86] (IR-8). Reading the rules established what this
 * file must NOT invent.
 *
 * DEPENDENCY UNTANGLING (AAP §0.6.3.4). The legacy component declares exactly two injected
 * properties, and only one of them is real:
 *   - `optionDAO` [model/service/OptionService.cfc:L51] — LIVE, two call sites at [:L73] and
 *     [:L77]. It becomes the injected {@link OptionRepository} constructor parameter, replacing both
 *     the DI/1 property declaration and the `getOptionDAO()` accessor DI/1 synthesized for it
 *     (import rules R1 and R2, AAP §0.4.3.1-§0.4.3.2).
 *   - `productService` [model/service/OptionService.cfc:L53] — ⛔ DEAD INJECTION, verified ZERO call
 *     sites in the component. It is deliberately absent from the constructor, from the imports and
 *     from this file entirely. AAP §0.6.3.4 records it as one of the four dead injections the port
 *     drops, and dropping it is what keeps this service ACYCLIC: `ProductService` consumes
 *     `OptionService`, so wiring the reverse edge would recreate a cycle for a collaborator nothing
 *     ever called.
 * The second constructor parameter, {@link SmartListQueryPort}, has no legacy property to
 * correspond to precisely BECAUSE the members that need it were synthesized rather than declared —
 * the legacy reached its smart-list factory through inherited framework plumbing at
 * [org/Hibachi/HibachiService.cfc:L26], not through an injected DAO.
 *
 * ⭐ M7 — STATELESS BY CONSTRUCTION. AAP §0.6.6 mismatch M7 records that "nothing survives between
 * Lambda invocations except module-scope state", so a service held as a warm-container singleton
 * must own no per-request state. This one owns none: both fields are `private readonly` collaborator
 * references, there is no cache, no memoized result, no last-query or last-input field, no current
 * entity, no counter and no lazily-initialised member anywhere in the class. The only module-scope
 * values are the two frozen entity-name constants and the pure helper functions below, none of which
 * can accumulate anything. This is a genuine improvement in kind over the legacy — `variables` on a
 * CFC singleton is exactly where the unscoped loop counter of [model/service/OptionService.cfc:L58]
 * leaked to — and it is recorded rather than assumed because a later maintainer adding a cache here
 * would silently reintroduce cross-request bleed on a warm container.
 *
 * ⭐ TEST PROVENANCE — ENTIRELY NET-NEW. AAP §0.6.5.2 verified that NO legacy `OptionServiceTest`
 * exists; the legacy suite contains no service test for any of the four in-scope services, so all
 * seven members below are NET-NEW coverage and no parity with a legacy test is implied or claimed
 * (AAP §0.8.3.7). The class is deliberately constructible from two plain object literals so
 * `test/support/inMemoryRepositories.ts` can satisfy both ports by hand — necessary because the
 * legacy repository vendors NO mocking library at all (AAP §0.4.3.6).
 *
 * SOURCE-LAYOUT ARTIFACTS, NOT CARRIED. Two quirks of the legacy file's shape are deliberately not
 * reproduced, because they are layout rather than behaviour: the `START: DAO Passthrough` banner is
 * duplicated at [model/service/OptionService.cfc:L70] and again at [:L80] with no matching `END`,
 * and `getOptionsForSelect` sits ABOVE the first logical-method banner rather than inside any
 * section. Normal TypeScript organisation is used instead. No defect identifier is minted for
 * either: they change nothing observable, and the carried-defect register of AAP §0.6.7 is closed.
 *
 * `model/service/OptionService.cfc` is REFERENCE-ONLY and is never modified (AAP §0.4.1.1, TR-6:
 * every target file is a creation, every legacy file a reference, and there are zero updates).
 * Behaviour is preserved exactly while the idiom changes freely — the two halves of the Minimal
 * Change Clause (AAP §0.8.1) — and every judgement the translation required is annotated inline with
 * the locator that justifies it (AAP §0.8.2, Guideline 6).
 *
 * NO USER-SPECIFIED RULES GOVERN THIS FILE. `review_rules` returns exactly one line, and that line
 * reads, verbatim: "No user rules provided." No ancillary rule-bearing file exists anywhere in the
 * repository either (AAP §0.7.1). Per UR4 that is not permission to lower the bar: the nine binding
 * standards of AAP §0.7.3 govern instead, and this file turns on standard 1 (strict type safety),
 * standard 2 (no statement text in a service — all data access is through the two ports), standard 3
 * (explicit constructor injection), standard 4 (hexagonal separation — this module imports only from
 * `../domain/**` and `../ports/**`), standard 6 (a surface small enough to hand-stub), standard 7
 * (preserve and annotate, do not repair), standard 8 (flag mismatches) and standard 9 (invent
 * nothing). No design system applies: this is a headless service with no user-interface surface
 * (AAP §0.3.4) and there are zero attachments and zero Figma files (AAP §0.9.1).
 */

import type { Option } from '../domain/option/Option';
import type { OptionGroup } from '../domain/option/OptionGroup';
import type {
  SmartListFilter,
  SmartListInput,
  SmartListOrder,
  SmartListOrderDirection,
  SmartListPagination,
  SmartListQuery,
  SmartListQueryPort,
  SmartListRange,
  SmartListResult,
  SmartListWhereGroup,
} from '../ports/SmartListQueryPort';
import type { OptionRepository } from '../ports/repositories/OptionRepository';

/**
 * One entry of a select projection — a display label paired with the value that is submitted.
 *
 * PRODUCED BY THIS SERVICE, THEREFORE DECLARED BY THIS SERVICE. The type is owned by
 * {@link OptionService.getOptionsForSelect}, whose legacy body builds the pair inline at
 * [model/service/OptionService.cfc:L59] as `{name=..., value=...}`. It is declared here rather than
 * in a shared location because AAP §0.4.3.5 forbids module path aliases and a barrel, and the folder
 * inventory of AAP §0.4.1.8 admits no `types.ts` or `common.ts` in `src/services/` (S5 — add
 * nothing).
 *
 * ⭐ THE TWO KEY NAMES ARE OBSERVABLE OUTPUT, NOT A LOCAL CONVENTION. The legacy rows are consumed
 * as drop-down entries whose renderer keys on the literal lowercase strings `name` and `value`, so
 * renaming either one would yield an entry with an empty label or an empty submitted value. The same
 * constraint is recorded, with its framework locators, on `UnusedOptionRow` in
 * `../ports/repositories/OptionRepository` — which is precisely why this type and that one are
 * STRUCTURALLY COMPATIBLE by design rather than by coincidence. See the OP-1 note on
 * {@link OptionService.getUnusedProductOptions} for why that compatibility is load-bearing.
 *
 * Both members are `readonly`: an entry is a projection computed for display, never an object
 * written back. That also means an `UnusedOptionRow[]` or an `UnusedOptionGroupRow[]` satisfies a
 * `SelectOption[]` without any conversion step, which is the whole point.
 */
export interface SelectOption {
  readonly name: string;
  readonly value: string;
}

/**
 * The ORM logical entity name for an option — `SwOption` rows.
 *
 * Declared at [model/entity/Option.cfc:L49] as `entityname="SlatwallOption"`. The legacy arrives at
 * the same string by a longer route: `onMissingGetSmartListMethod`
 * [org/Hibachi/HibachiService.cfc:L340-L351] strips the `get` prefix and the `SmartList` suffix from
 * the invoked member name to recover `Option`, then `HibachiDAO` prepends the application key to any
 * name not already carrying it, at [org/Hibachi/HibachiDAO.cfc:L104-L106] for the smart-list path
 * and [:L8-L10] for the get path. The application key is `Slatwall`, so the effective name is
 * `SlatwallOption`. Stated as a literal here because the prefixing was a run-time string operation
 * with no purpose other than reconstructing a name the entity metadata already declares (TR-3).
 *
 * ⛔ This is the LOGICAL entity name, not the physical table name. `SmartListQuery.entityName` is
 * documented as "the ORM logical entity name being queried", and mapping it to a table is the
 * adapter's job; no table name appears anywhere in this file (S2).
 */
const OPTION_ENTITY_NAME = 'SlatwallOption';

/**
 * The ORM logical entity name for an option group — `SwOptionGroup` rows.
 *
 * Declared at [model/entity/OptionGroup.cfc:L49] as `entityname="SlatwallOptionGroup"`, and reached
 * by the legacy through the same prefix reconstruction described on {@link OPTION_ENTITY_NAME}.
 */
const OPTION_GROUP_ENTITY_NAME = 'SlatwallOptionGroup';

/**
 * The primary-identifier property of an option, as declared at [model/entity/Option.cfc:L52]
 * (`fieldtype="id"`). Used as the filter property for the identifier lookup in
 * {@link OptionService.getOption}.
 */
const OPTION_ID_PROPERTY = 'optionID';

/**
 * The primary-identifier property of an option group, as declared at
 * [model/entity/OptionGroup.cfc:L52] (`fieldtype="id"`). Used as the filter property for the
 * identifier lookup in {@link OptionService.getOptionGroup}.
 */
const OPTION_GROUP_ID_PROPERTY = 'optionGroupID';

/* ================================================================================================
 * CALLER-INPUT PROJECTION — turning a `SmartListInput` into a `SmartListQuery`.
 *
 * WHY THIS SECTION EXISTS AT ALL, STATED UP FRONT BECAUSE IT LOOKS LIKE SCOPE CREEP OTHERWISE. The
 * two synthesized smart-list members are declared by AAP §0.4.2.5 to accept a `SmartListInput` — the
 * typed form of the untyped data structure the legacy passes as the first argument at
 * [org/Hibachi/HibachiService.cfc:L346-L350] — while the only execution member the port exposes,
 * `SmartListQueryPort.execute`, accepts a `SmartListQuery`. Those are two different shapes on
 * purpose: one is the flat prefix-keyed map a caller submits, the other is the structured
 * description an adapter compiles. Something has to project the first onto the second, and the
 * member whose signature accepts the input is the only place that holds both types. Skipping the
 * projection would silently DISCARD every filter, order and page bound a caller supplied, which is a
 * real behavioural loss rather than a simplification.
 *
 * ⛔ WHAT THIS SECTION IS NOT. It is not a port of `org/Hibachi/HibachiSmartList.cfc`, and no line of
 * that component is carried over (AAP §0.8.3.2). The functions below are a DECLARATIVE PROJECTION
 * only: they translate key prefixes into typed members and stop. Everything the legacy did on top of
 * that stays with the adapter, exactly as `../ports/SmartListQueryPort` allocates it —
 * property-identifier and alias resolution, related-property join creation, absent-pagination
 * resolution (the source-declared first record of one and page size of ten at
 * [org/Hibachi/HibachiSmartList.cfc:L39], applied at [:L65-L66]), page-declaration coercion at
 * [:L793-L794], the fallback ordering of [:L729-L741], statement emission and parameter binding. No
 * statement text, table name, column name or placeholder appears anywhere in this file (S2).
 *
 * ⛔ NO DEFAULT IS INVENTED (S9). When no input is supplied — which is what BOTH real call sites do,
 * at [model/entity/Product.cfc:L254] and [:L341] — the produced query carries its entity name and
 * NOTHING else: no filter, no order, no page size, no distinct flag. That is the exact post-setup
 * state of the legacy object, whose collections are all seeded empty at
 * [org/Hibachi/HibachiSmartList.cfc:L44-L59].
 *
 * ⭐ S8 — THREE INPUT CONCERNS CANNOT BE MAPPED, AND ARE FLAGGED RATHER THAN FAKED:
 *
 *   1. `savedStateID` IS UNMAPPABLE. The legacy handles it first, ahead of the prefix scan, at
 *      [org/Hibachi/HibachiSmartList.cfc:L93-L95], by loading a previously stored query state out of
 *      SESSION scope — the containers are established as `session.entitySmartList.savedStates` at
 *      [:L41-L42] and read back by the loader at [:L999]. `SmartListQuery` declares no member for it,
 *      and correctly so: a stateless invocation has no session, which is mismatch M7's core
 *      consequence. The key is therefore RECOGNISED (it is part of `SmartListInput`) and DELIBERATELY
 *      NOT ACTED ON here. It is not silently dropped in the sense of being unnoticed — it is
 *      unimplementable above the port, and inventing a session substitute would be inventing
 *      infrastructure the source does not have. A caller supplying it gets an unrestored query.
 *
 *   2. KEYWORD PHRASES ARE NOT MODELLED BY THE PORT. The legacy derives, in addition to the term
 *      array, a cross-product of adjacent-term phrases at [org/Hibachi/HibachiSmartList.cfc:L153-L163]
 *      and stores it separately. `SmartListQuery` carries `keywords` and `keywordProperties` and no
 *      phrase collection, so the phrase derivation is the adapter's to perform from the terms if it
 *      performs it at all. The term array IS projected below, faithfully.
 *
 *   3. THE DISTINCT FLAG IS NOT EXPRESSIBLE THROUGH `SmartListInput`, AND IS THEREFORE NOT SET. Both
 *      in-scope callers switch it on imperatively — [model/entity/Product.cfc:L255] and [:L342] — but
 *      they do so on the smart-list OBJECT the legacy factory returns, whereas the AAP-declared
 *      target signature returns an already-executed `SmartListResult`. `SmartListInput` declares no
 *      member for the flag, so it is left ABSENT here, which `SmartListQuery` documents as meaning
 *      the legacy's seeded false of [org/Hibachi/HibachiSmartList.cfc:L59]. ⛔ Setting it on the
 *      caller's behalf would be inventing behaviour this service never had: in the legacy the flag is
 *      the CALLER's decision, made after the factory returns. The mandated signature is preserved
 *      exactly as §0.4.2.5 states it rather than widened to accommodate the flag, because interface
 *      parity is the deliverable (AAP §0.8.3.1). Flagged here so the consequence is visible to
 *      whoever ports `model/entity/Product.cfc`.
 * ============================================================================================== */

/**
 * The key delimiter of the caller-input grammar, declared at
 * [org/Hibachi/HibachiSmartList.cfc:L36]. Composed into the prefix constants below rather than
 * inlined, so the correspondence with the source is visible.
 */
const DATA_KEY_DELIMITER = ':';

/** Multi-value delimiter within a single entry — [org/Hibachi/HibachiSmartList.cfc:L33]. */
const VALUE_DELIMITER = ',';

/** Separates an ordering property from its direction — [org/Hibachi/HibachiSmartList.cfc:L34]. */
const ORDER_DIRECTION_DELIMITER = '|';

/** Separates successive ordering terms — [org/Hibachi/HibachiSmartList.cfc:L35]. */
const ORDER_PROPERTY_DELIMITER = ',';

/** Separates the two bounds of a range — [org/Hibachi/HibachiSmartList.cfc:L36]. */
const RANGE_DELIMITER = '^';

/** Wildcard used to wrap each element of a pattern entry — [org/Hibachi/HibachiSmartList.cfc:L111]. */
const PATTERN_WILDCARD = '%';

/** Adds an equality filter — [org/Hibachi/HibachiSmartList.cfc:L100-L101]. */
const FILTER_PREFIX = `F${DATA_KEY_DELIMITER}`;

/** Removes an equality filter when the value reads as true — [:L102-L103]. */
const FILTER_REMOVAL_PREFIX = `FR${DATA_KEY_DELIMITER}`;

/** Adds a set-membership filter — [:L104-L105]. */
const IN_FILTER_PREFIX = `FI${DATA_KEY_DELIMITER}`;

/** Removes a set-membership filter when the value reads as true — [:L106-L107]. */
const IN_FILTER_REMOVAL_PREFIX = `FIR${DATA_KEY_DELIMITER}`;

/** Adds a pattern filter, wildcard-wrapped — [:L108-L113]. */
const LIKE_FILTER_PREFIX = `FK${DATA_KEY_DELIMITER}`;

/** Removes a pattern filter when the value reads as true — [:L114-L115]. */
const LIKE_FILTER_REMOVAL_PREFIX = `FKR${DATA_KEY_DELIMITER}`;

/** Adds a range filter — [:L116-L117]. */
const RANGE_PREFIX = `R${DATA_KEY_DELIMITER}`;

/** Ordering statement key, matched exactly — [:L118]. */
const ORDER_BY_KEY = 'OrderBy';

/** Page-size key — [:L123]. */
const PAGE_SHOW_KEY = `P${DATA_KEY_DELIMITER}Show`;

/** First-record key — [:L129]. */
const PAGE_START_KEY = `P${DATA_KEY_DELIMITER}Start`;

/** Requested-page key — [:L131]. */
const PAGE_CURRENT_KEY = `P${DATA_KEY_DELIMITER}Current`;

/** Search-term key, aliased onto its plural form — [:L136-L138]. */
const KEYWORD_KEY = 'keyword';

/** Search-term key in its plural spelling — [:L140]. */
const KEYWORDS_KEY = 'keywords';

/**
 * The literal page-size request that means "every record", tested at
 * [org/Hibachi/HibachiSmartList.cfc:L124].
 */
const PAGE_RECORDS_SHOW_ALL_KEYWORD = 'ALL';

/**
 * The page size the legacy writes when "every record" is requested —
 * [org/Hibachi/HibachiSmartList.cfc:L125]. Reproduced because it is a SOURCE-DECLARED value with a
 * locator, not a capacity figure chosen here (IR-12, S9).
 */
const PAGE_RECORDS_SHOW_ALL = 1000000000;

/**
 * The inclusive upper bound every page figure is tested against — [:L126], [:L129] and [:L131] all
 * apply the same ceiling. Source-declared, like {@link PAGE_RECORDS_SHOW_ALL}.
 */
const PAGE_VALUE_CEILING = 1000000000;

/**
 * The two spellings that select a descending sort, tested case-insensitively at
 * [org/Hibachi/HibachiSmartList.cfc:L476].
 */
const DESCENDING_SPELLINGS: readonly string[] = ['D', 'DESC'];

/**
 * Splits a delimited string the way a CFML list is split: EMPTY ELEMENTS ARE DISCARDED.
 *
 * ⭐ THIS IS THE SINGLE MOST IMPORTANT TRANSLATION DETAIL IN THIS SECTION, and getting it wrong
 * changes results silently. CFML list functions treat consecutive delimiters as one and ignore
 * leading and trailing delimiters, so `listLen('a,,b', ',')` is 2, `listFirst('1^', '^')` is `'1'`
 * and `listLast('^5', '^')` is `'5'`. A plain `String.prototype.split` keeps the empty elements and
 * would make the first of those 3 and the second `''`, which would invert the open-ended range
 * parsing of {@link parseRangeValue} and mis-count ordering terms. Every list read below therefore
 * goes through this helper.
 *
 * @param value - The delimited string as the caller supplied it.
 * @param delimiter - The single-character delimiter to split on.
 * @returns The non-empty elements, in order. Possibly empty when the value is empty or consists only
 *          of delimiters.
 */
function cfmlListToArray(value: string, delimiter: string): string[] {
  return value.split(delimiter).filter((element) => element.length > 0);
}

/**
 * Decides whether a caller-supplied removal flag reads as true, mirroring the legacy guard
 * `isBoolean(value) && value` applied at [org/Hibachi/HibachiSmartList.cfc:L102], [:L106] and
 * [:L114].
 *
 * The legacy test has two halves — the value must be boolean-convertible AND must evaluate true —
 * and CFML admits the boolean literals, the yes/no spellings and numbers as convertible. This
 * reproduces that set: the boolean `true`, any non-zero number, and the strings `true`, `yes` and
 * `1` compared case-insensitively after trimming. Anything else leaves the corresponding entry in
 * place, which is exactly what the legacy does when the guard fails.
 *
 * The parameter is typed as the union of the three simple types rather than as `unknown`, because
 * the only caller has already applied the legacy's own `isSimpleValue` guard from
 * [org/Hibachi/HibachiSmartList.cfc:L99] before reaching here. Declaring the narrower type makes the
 * function total over its input with no unreachable defensive branch.
 *
 * @param value - The raw entry value, already narrowed to a simple type.
 * @returns `true` when the entry should trigger a removal.
 */
function readsAsTrue(value: string | number | boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) && value !== 0;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === '1';
}

/**
 * Reads a page figure, mirroring the legacy guard `isNumeric(value) && value <= ceiling && value > 0`
 * applied identically at [org/Hibachi/HibachiSmartList.cfc:L126], [:L129] and [:L131].
 *
 * A value failing any part of that test is SILENTLY IGNORED by the legacy — the surrounding branch
 * simply does not assign — so this returns `undefined` for it rather than throwing or substituting a
 * default (S7, S9).
 *
 * A boolean entry is rejected for the same reason CFML rejects one: `isNumeric` is false for the
 * boolean spellings, so `Number('true')` yielding `NaN` reproduces the outcome rather than
 * approximating it. An all-whitespace or empty entry is rejected explicitly, because `Number('')`
 * evaluates to zero and would otherwise reach the bounds test as a number the caller never wrote.
 *
 * @param value - The raw entry value, already narrowed to a simple type.
 * @returns The accepted figure, or `undefined` when the legacy would have ignored the entry.
 */
function readAcceptablePageValue(value: string | number | boolean): number | undefined {
  if (typeof value === 'string' && value.trim().length === 0) {
    return undefined;
  }
  const candidate = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(candidate) || candidate <= 0 || candidate > PAGE_VALUE_CEILING) {
    return undefined;
  }
  return candidate;
}

/**
 * Parses one ordering statement into its property-and-direction pair, reproducing
 * [org/Hibachi/HibachiSmartList.cfc:L474-L478].
 *
 * The legacy takes the property as the FIRST list element of the statement [:L474], starts from
 * ascending [:L475], and switches to descending only when the statement carries more than one
 * element AND the LAST element matches one of the two descending spellings case-insensitively
 * [:L476]. A statement such as `sortOrder|` therefore sorts ASCENDING, because the trailing
 * delimiter contributes no element to a CFML list.
 *
 * The legacy additionally declines to record a term whose property cannot be resolved against the
 * entity's metadata, via the `len(aliasedProperty)` guard at [:L480]. Metadata-driven resolution is
 * the ADAPTER's responsibility (see the section header), so only the purely syntactic half of that
 * guard is applied here: a statement contributing no property element yields no term.
 *
 * @param statement - One ordering statement, such as the ascending sort-order term both in-scope
 *                    callers use at [model/entity/Product.cfc:L257] and [:L345].
 * @returns The ordering term, or `undefined` when the statement names no property.
 */
function parseOrderStatement(statement: string): SmartListOrder | undefined {
  const elements = cfmlListToArray(statement, ORDER_DIRECTION_DELIMITER);
  const propertyIdentifier = elements[0];
  if (propertyIdentifier === undefined) {
    return undefined;
  }

  let direction: SmartListOrderDirection = 'ASC';
  if (elements.length > 1) {
    const trailing = elements[elements.length - 1];
    if (trailing !== undefined && DESCENDING_SPELLINGS.includes(trailing.toUpperCase())) {
      direction = 'DESC';
    }
  }

  return { propertyIdentifier, direction };
}

/**
 * Parses one range entry into the structured bound pair `SmartListRange` declares, reproducing the
 * three-way split the legacy performs at emission time in [org/Hibachi/HibachiSmartList.cfc:L634-L656].
 *
 * The three cases, each with its legacy locator:
 *   - the value STARTS with the delimiter — [:L635] — upper bound only, taken from the last element
 *     at [:L638];
 *   - the value ENDS with the delimiter — [:L642] — lower bound only, taken from the first element at
 *     [:L645]; this is the shape of the feed's availability gate;
 *   - neither — [:L649] — both bounds, first and last respectively at [:L653-L654].
 * Absence of a bound is how open-endedness is expressed, which is why the pair is built with
 * conditional members rather than with explicit `undefined` values: under
 * `exactOptionalPropertyTypes` an absent bound and a bound present-but-undefined are different
 * types, and only the former means unbounded.
 *
 * ⭐ THE LENGTH GUARD IS APPLIED HERE BECAUSE THIS IS THE LAST POINT AT WHICH IT CAN BE. The legacy
 * skips a range whose RAW value is one character or shorter, at [:L632], and the query then runs
 * unfiltered on that property. Structuring the value into two bounds destroys the raw string, so an
 * adapter receiving the pair could not reproduce the skip even in principle. Applying it here
 * preserves the observable outcome; deferring it would change results for a one-character entry.
 *
 * ⭐ S8 — MISMATCH FLAGGED, NOT FAKED: the legacy ALSO discards a range failing the well-formedness
 * test at [:L446], which requires each side to be a delimiter edge, a CFML-numeric value or a
 * CFML-date value. The numeric half is reproducible; the DATE half is not, because CFML's date
 * recognition accepts a broad, engine-dependent set of spellings that the source nowhere enumerates,
 * so reproducing it would mean inventing a date grammar (S9). Discarding everything non-numeric
 * instead would be worse than the divergence it fixes: it would drop the legitimate DATE ranges the
 * legacy accepts. A structurally well-formed but semantically malformed entry is therefore passed
 * through as bounds, and the discard is recorded here so the divergence is visible rather than
 * hidden. `../ports/SmartListQueryPort` records the same behaviour as carried with no validation
 * added at the port.
 *
 * @param propertyIdentifier - The property the range constrains, taken from the entry key.
 * @param value - The raw range entry as the caller supplied it.
 * @returns The structured bounds, or `undefined` when the legacy would have skipped the entry.
 */
function parseRangeValue(propertyIdentifier: string, value: string): SmartListRange | undefined {
  if (value.length <= 1) {
    return undefined;
  }

  const elements = cfmlListToArray(value, RANGE_DELIMITER);
  const first = elements[0];
  const last = elements[elements.length - 1];
  if (first === undefined || last === undefined) {
    return undefined;
  }

  if (value.startsWith(RANGE_DELIMITER)) {
    return { propertyIdentifier, upperBound: last };
  }
  if (value.endsWith(RANGE_DELIMITER)) {
    return { propertyIdentifier, lowerBound: first };
  }
  return { propertyIdentifier, lowerBound: first, upperBound: last };
}

/**
 * Wraps every element of a pattern entry in the wildcard and re-joins them, reproducing
 * [org/Hibachi/HibachiSmartList.cfc:L109-L112].
 *
 * The legacy walks the entry as a multi-value list, prepends and appends the wildcard to each
 * element, and appends the results back into one delimited value which it hands to the accumulator
 * at [:L113]. The wildcards therefore belong to the VALUE and travel with it, which is why
 * `SmartListWhereGroup.likeFilters` documents an arriving value as already carrying whatever
 * wildcards were intended.
 *
 * @param value - The raw pattern entry, possibly carrying several comma-separated terms.
 * @returns The wildcard-wrapped, re-joined value.
 */
function buildPatternFilterValue(value: string): string {
  return cfmlListToArray(value, VALUE_DELIMITER)
    .map((element) => `${PATTERN_WILDCARD}${element}${PATTERN_WILDCARD}`)
    .join(VALUE_DELIMITER);
}

/**
 * Splits a search string into terms, reproducing [org/Hibachi/HibachiSmartList.cfc:L145-L151].
 *
 * The legacy normalises three separators to the value delimiter before splitting — a literal space
 * [:L146], its percent-encoded form [:L147] and the plus sign [:L148] — then reads the result as a
 * list, which discards empty elements. All three normalisations produce the same delimiter, so their
 * relative order is immaterial to the outcome.
 *
 * @param value - The raw search string.
 * @returns The search terms, in order. Possibly empty.
 */
function parseKeywords(value: string): string[] {
  const normalized = value
    .split(' ')
    .join(VALUE_DELIMITER)
    .split('%20')
    .join(VALUE_DELIMITER)
    .split('+')
    .join(VALUE_DELIMITER);
  return cfmlListToArray(normalized, VALUE_DELIMITER);
}

/**
 * The mutable accumulator the projection fills before composing the immutable query.
 *
 * A mutable draft is used for the same reason the legacy accumulates into instance state: entries
 * are processed one at a time and a later entry can REMOVE what an earlier one added. It is a
 * function-local value that never escapes {@link buildSmartListQuery}, so it introduces no
 * service-level or module-level state and cannot survive a warm invocation (M7).
 */
interface SmartListQueryDraft {
  readonly filters: SmartListFilter[];
  readonly likeFilters: SmartListFilter[];
  readonly inFilters: SmartListFilter[];
  readonly ranges: SmartListRange[];
  readonly orders: SmartListOrder[];
  keywords: string[];
  pageRecordsShow?: number;
  pageRecordsStart?: number;
  currentPageDeclaration?: string;
}

/**
 * Removes every accumulated entry naming a property, reproducing the removal members at
 * [org/Hibachi/HibachiSmartList.cfc:L374], [:L400] and [:L426].
 *
 * Each legacy member deletes the property's key from the corresponding group collection, so at most
 * one entry per property could exist to delete. This clears every matching entry, which is
 * equivalent for the one-entry case the legacy can reach and is the safe generalisation for the
 * array form the port declares.
 *
 * The collection is rebuilt and written back IN PLACE rather than reassigned, because the draft holds
 * the reference and the four group collections are declared `readonly` on it. Retaining what does not
 * match is preferred over deleting what does, because it needs no indexed access — which under
 * `noUncheckedIndexedAccess` would force a `undefined` guard that can never fire (S1).
 *
 * @param entries - The accumulated collection, mutated in place.
 * @param propertyIdentifier - The property whose entry is being removed.
 */
function removeEntriesForProperty(
  entries: { propertyIdentifier: string }[],
  propertyIdentifier: string,
): void {
  const retained = entries.filter((entry) => entry.propertyIdentifier !== propertyIdentifier);
  entries.length = 0;
  for (const entry of retained) {
    entries.push(entry);
  }
}

/**
 * Applies one caller-supplied entry to the draft, reproducing one pass of the legacy prefix chain at
 * [org/Hibachi/HibachiSmartList.cfc:L100-L133].
 *
 * The branches appear in the legacy's own order so the correspondence is checkable line by line. The
 * prefixes are mutually unambiguous because each carries the key delimiter, so the ordering is for
 * traceability rather than for correctness.
 *
 * VALUES ARE PASSED THROUGH UNCHANGED WHERE THE PORT ACCEPTS THEM UNCHANGED. `SmartListFilter.value`
 * is declared as the union of the three simple types, so an equality or set-membership value reaches
 * the adapter exactly as the caller wrote it. Only the entries whose legacy handling is textual —
 * the pattern wrapping, the range split and the ordering split — are read as strings, which is what
 * the legacy list functions do to them too.
 *
 * @param draft - The accumulator, mutated in place.
 * @param key - The entry key, including its prefix.
 * @param value - The entry value, already narrowed to a simple type by the caller.
 */
function applyInputEntry(
  draft: SmartListQueryDraft,
  key: string,
  value: string | number | boolean,
): void {
  if (key.startsWith(FILTER_PREFIX)) {
    draft.filters.push({ propertyIdentifier: key.slice(FILTER_PREFIX.length), value });
    return;
  }
  if (key.startsWith(FILTER_REMOVAL_PREFIX) && readsAsTrue(value)) {
    removeEntriesForProperty(draft.filters, key.slice(FILTER_REMOVAL_PREFIX.length));
    return;
  }
  if (key.startsWith(IN_FILTER_PREFIX)) {
    draft.inFilters.push({ propertyIdentifier: key.slice(IN_FILTER_PREFIX.length), value });
    return;
  }
  if (key.startsWith(IN_FILTER_REMOVAL_PREFIX) && readsAsTrue(value)) {
    removeEntriesForProperty(draft.inFilters, key.slice(IN_FILTER_REMOVAL_PREFIX.length));
    return;
  }
  if (key.startsWith(LIKE_FILTER_PREFIX)) {
    draft.likeFilters.push({
      propertyIdentifier: key.slice(LIKE_FILTER_PREFIX.length),
      value: buildPatternFilterValue(String(value)),
    });
    return;
  }
  if (key.startsWith(LIKE_FILTER_REMOVAL_PREFIX) && readsAsTrue(value)) {
    removeEntriesForProperty(draft.likeFilters, key.slice(LIKE_FILTER_REMOVAL_PREFIX.length));
    return;
  }
  if (key.startsWith(RANGE_PREFIX)) {
    const range = parseRangeValue(key.slice(RANGE_PREFIX.length), String(value));
    if (range !== undefined) {
      draft.ranges.push(range);
    }
    return;
  }
  if (key === ORDER_BY_KEY) {
    applyOrderByEntry(draft, String(value));
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
      /* `SmartListPagination.currentPageDeclaration` is deliberately declared as a STRING, carrying
       * the loose typing of [org/Hibachi/HibachiSmartList.cfc:L26]; the coercion back to a number
       * happens in the adapter at the point [:L793-L794] performs it. The value is stringified here
       * rather than narrowed, so no page-declaration spelling the legacy accepts is lost. */
      draft.currentPageDeclaration = String(current);
    }
  }
}

/**
 * Applies an ordering statement, reproducing [org/Hibachi/HibachiSmartList.cfc:L118-L122].
 *
 * ⭐ TODO(parity): THE ACCUMULATED ORDERING IS CLEARED INSIDE THE PER-TERM LOOP, at [:L120], not
 * before it. The consequence is that a multi-term statement retains ONLY ITS FINAL TERM, and any
 * ordering registered earlier by other means is discarded as well. That is reproduced exactly: the
 * collection is emptied on every iteration. It looks like a bug and it is one, but it is CARRIED, not
 * repaired — moving the clear outside the loop would make a two-term statement sort by two columns
 * where the legacy sorts by one, which is a change in observable output (S7, AAP §0.8.2 Guideline 4).
 * `../ports/SmartListQueryPort` records the same quirk on `SmartListInput.OrderBy`.
 *
 * A further consequence worth stating because it is easy to misread as a bug in the port: when the
 * FINAL term names no property, the clear has already happened and no term replaces it, so the query
 * ends up with no ordering at all even though earlier terms were well formed. That, too, is the
 * legacy outcome.
 *
 * @param draft - The accumulator, mutated in place.
 * @param value - The raw ordering statement, possibly carrying several terms.
 */
function applyOrderByEntry(draft: SmartListQueryDraft, value: string): void {
  for (const term of cfmlListToArray(value, ORDER_PROPERTY_DELIMITER)) {
    draft.orders.length = 0;
    const order = parseOrderStatement(term);
    if (order !== undefined) {
      draft.orders.push(order);
    }
  }
}

/**
 * Applies a page-size entry, reproducing [org/Hibachi/HibachiSmartList.cfc:L123-L128].
 *
 * The legacy tests the "every record" keyword first at [:L124] and writes its source-declared page
 * size at [:L125]; otherwise it accepts the value only when it passes the numeric-and-bounded test at
 * [:L126]. A value failing both is silently ignored.
 *
 * @param draft - The accumulator, mutated in place.
 * @param value - The entry value, already narrowed to a simple type.
 */
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

/**
 * Projects a caller-supplied input onto a complete query description for one entity.
 *
 * This is the target counterpart of `getSmartList(entityName, data)` at
 * [org/Hibachi/HibachiService.cfc:L26-L35] together with the setup-and-interpret pass at
 * [org/Hibachi/HibachiSmartList.cfc:L39-L166]. It performs the DECLARATIVE half of that work only;
 * see the section header for the full list of concerns that remain the adapter's.
 *
 * ⭐ A DOCUMENTED TRANSLATION CONSEQUENCE — ENTRY ORDER IS NOW DETERMINISTIC. The legacy iterates the
 * caller's structure with `for(var i in arguments.data)` at [:L98], and CFML structure iteration order
 * is engine-dependent, so whether a removal entry was seen before or after the addition it removes was
 * never guaranteed. `Object.keys` preserves insertion order for string keys, so a removal here always
 * takes effect against exactly the additions the caller declared before it. The legacy behaviour is a
 * superset that includes this one; making it deterministic removes an ordering hazard rather than
 * changing a defined outcome, and it is recorded rather than left implicit.
 *
 * ⭐ ONLY SIMPLE VALUES ARE PROCESSED, reproducing the `isSimpleValue` guard at [:L99]. An entry whose
 * value is not a string, number or boolean is skipped exactly as the legacy skips it. The value is
 * read through an `unknown`-typed view of the input rather than through `Object.entries`, because the
 * latter widens to `any` for a type carrying pattern-keyed index signatures and would defeat strict
 * typing at the one place a caller's data enters this module (S1).
 *
 * @param entityName - The ORM logical entity name being queried.
 * @param input - The caller-supplied input, or `undefined` when the member was called with no
 *                argument — which is what both real call sites do.
 * @returns The immutable query description. When `input` is absent it carries the entity name and
 *          nothing else.
 */
function buildSmartListQuery(entityName: string, input?: SmartListInput): SmartListQuery {
  if (input === undefined) {
    return { entityName };
  }

  const draft: SmartListQueryDraft = {
    filters: [],
    likeFilters: [],
    inFilters: [],
    ranges: [],
    orders: [],
    keywords: [],
  };

  const entries = input as Readonly<Record<string, unknown>>;
  for (const key of Object.keys(entries)) {
    const value = entries[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      applyInputEntry(draft, key, value);
    }
  }

  /* The singular search-term key is an alias for the plural one — [:L136-L138] copies the former onto
   * the latter BEFORE the plural is read at [:L140], so a caller supplying both effectively supplies
   * only the singular. That precedence is reproduced by reading the singular first. */
  const singularKeyword = entries[KEYWORD_KEY];
  const pluralKeywords = entries[KEYWORDS_KEY];
  const rawKeywords = typeof singularKeyword === 'string' ? singularKeyword : pluralKeywords;
  if (typeof rawKeywords === 'string') {
    draft.keywords = parseKeywords(rawKeywords);
  }

  return composeSmartListQuery(entityName, draft);
}

/**
 * Composes the immutable query from the accumulated draft, omitting every group the caller left
 * empty.
 *
 * OMISSION IS THE FAITHFUL ENCODING OF EMPTINESS. The legacy skips a where group whose four
 * collections are all empty, at [org/Hibachi/HibachiSmartList.cfc:L563], so an absent collection and
 * an empty one are indistinguishable in its output — which is exactly why every member of
 * `SmartListWhereGroup` and of `SmartListQuery` is optional. Members are added conditionally rather
 * than assigned `undefined` because `exactOptionalPropertyTypes` treats those as different types, and
 * the absent form is the one that means "nothing was asked for" (S1).
 *
 * ⛔ NO PAGINATION, ORDERING OR DISTINCT DEFAULT IS SUPPLIED. See the section header.
 *
 * @param entityName - The ORM logical entity name being queried.
 * @param draft - The accumulated projection.
 * @returns The immutable query description.
 */
function composeSmartListQuery(entityName: string, draft: SmartListQueryDraft): SmartListQuery {
  const whereGroup: SmartListWhereGroup = {
    ...(draft.filters.length > 0 ? { filters: draft.filters } : {}),
    ...(draft.likeFilters.length > 0 ? { likeFilters: draft.likeFilters } : {}),
    ...(draft.inFilters.length > 0 ? { inFilters: draft.inFilters } : {}),
    ...(draft.ranges.length > 0 ? { ranges: draft.ranges } : {}),
  };
  const hasWhereGroup = Object.keys(whereGroup).length > 0;

  const pagination: SmartListPagination = {
    ...(draft.pageRecordsStart !== undefined ? { pageRecordsStart: draft.pageRecordsStart } : {}),
    ...(draft.pageRecordsShow !== undefined ? { pageRecordsShow: draft.pageRecordsShow } : {}),
    ...(draft.currentPageDeclaration !== undefined
      ? { currentPageDeclaration: draft.currentPageDeclaration }
      : {}),
  };
  const hasPagination = Object.keys(pagination).length > 0;

  return {
    entityName,
    ...(hasWhereGroup ? { whereGroups: [whereGroup] } : {}),
    ...(draft.keywords.length > 0 ? { keywords: draft.keywords } : {}),
    ...(draft.orders.length > 0 ? { orders: draft.orders } : {}),
    ...(hasPagination ? { pagination } : {}),
  };
}

/**
 * Builds the query that loads a single entity by its primary identifier.
 *
 * This is the target counterpart of the legacy identifier load. `onMissingGetMethod`
 * [org/Hibachi/HibachiService.cfc:L305-L328] resolves a `get`-prefixed member to
 * `get(entityName, id, isReturnNewOnNotFound)` at [:L326], which delegates through
 * [org/Hibachi/HibachiService.cfc:L22-L24] to [org/Hibachi/HibachiDAO.cfc:L6-L26], where the load
 * itself happens by primary key at [:L13]. Expressed through the one execution member the port
 * offers, that becomes a query filtered on the identifier property — which is why
 * {@link OptionService.getOption} and {@link OptionService.getOptionGroup} need no repository member
 * of their own, and why no statement text, driver reference or query runner is imported here (S2).
 *
 * THE UNPAGED COLLECTION IS THE ONE TO READ. `SmartListResult` exposes both the full record set and
 * the current page, mirroring [org/Hibachi/HibachiSmartList.cfc:L751] and [:L759]. A primary-key
 * filter can match at most one row either way, but the unpaged collection is the faithful analogue:
 * the legacy load is a direct primary-key fetch with no paging applied, and reading the paged slice
 * would make the result depend on a page size this member never sets.
 *
 * @param entityName - The ORM logical entity name to load from.
 * @param propertyIdentifier - The entity's primary-identifier property.
 * @param value - The identifier to match.
 * @returns The query description.
 */
function buildIdentifierQuery(
  entityName: string,
  propertyIdentifier: string,
  value: string,
): SmartListQuery {
  return { entityName, whereGroups: [{ filters: [{ propertyIdentifier, value }] }] };
}

/**
 * The Catalog's option and option-group service.
 *
 * Seven public members: the three declared by `model/service/OptionService.cfc` and the four the
 * legacy synthesized at run time. See the module header for the full provenance, for the dependency
 * untangling that reduced two injected properties to one, and for the M7 statelessness guarantee.
 */
export class OptionService {
  /**
   * Constructs the service from its two collaborators.
   *
   * EXPLICIT CONSTRUCTOR INJECTION, REPLACING TWO SEPARATE RUN-TIME MECHANISMS (S3). The first
   * parameter replaces the DI/1 property at [model/service/OptionService.cfc:L51] together with the
   * `getOptionDAO()` accessor DI/1 synthesized for it (import rule R1). The second replaces the
   * framework plumbing the synthesized smart-list members reached through inheritance at
   * [org/Hibachi/HibachiService.cfc:L26] — never a string-keyed lookup (import rule R2). There is no
   * container, no service locator, no dynamic resolution and no DI library.
   *
   * ⛔ THE DEAD `productService` INJECTION AT [model/service/OptionService.cfc:L53] IS ABSENT. It has
   * zero call sites in the component (AAP §0.6.3.4), and omitting it keeps this service acyclic —
   * `ProductService` and `SkuService` both consume this one, so the reverse edge would close a cycle
   * for a collaborator nothing ever called.
   *
   * Both fields are `private readonly`, so the instance is immutable after construction and carries
   * no per-request state (M7). Both parameters are declared as INTERFACES, so a plain object literal
   * satisfies either one — which is what makes the NET-NEW unit tests possible without a mocking
   * library (S6).
   *
   * @param optionRepository - The two option queries of `model/dao/OptionDAO.cfc`.
   * @param smartListQueryPort - The paginated dynamic-query abstraction.
   */
  public constructor(
    private readonly optionRepository: OptionRepository,
    private readonly smartListQueryPort: SmartListQueryPort,
  ) {}

  /**
   * Projects options into select entries — label and submitted value, one entry per input option.
   *
   * PORT OF [model/service/OptionService.cfc:L55-L63]:
   *
   *     public array function getOptionsForSelect(required any options){
   *         var sortedOptions = [];
   *         for(i=1; i <= arrayLen(arguments.options); i++){
   *             arrayAppend(sortedOptions,{name=arguments.options[i].getOptionName(),
   *                                        value=arguments.options[i].getOptionID()});
   *         }
   *         return sortedOptions;
   *     }
   *
   * ⭐ SYNCHRONOUS AND I/O-FREE, AND THE ONLY MEMBER OF THIS SERVICE THAT IS. The legacy body touches
   * neither the data-access object nor any collaborator: it reads two accessors off objects the caller
   * already holds. There is nothing to await, so the target signature returns the array directly
   * rather than a promise. That is a deliberate asymmetry with the other six members, not an
   * oversight — wrapping this in a promise would change the call shape of a pure transformation.
   *
   * ⭐ `sortedOptions` DOES NOT SORT. The local name is preserved above and below because it is part
   * of the source's own record, but there is NO sort in the legacy body — no `arraySort`, no
   * comparator, no ordered query, nothing. The name is a misnomer, and it is CARRIED rather than
   * corrected in either direction: no sorting is introduced (that would add behaviour, S9), and no
   * deduplication, filtering, locale comparison, case normalisation or trimming either. The input
   * array is not mutated. Input ORDER and CARDINALITY are preserved exactly, so N options in yields N
   * entries out in the same sequence — including duplicates, if the caller passes them.
   *
   * ⭐ INDEX TRANSLATION, RECORDED. CFML arrays are ONE-BASED and the legacy loop runs
   * `for(i=1; i <= arrayLen(...); i++)` reading `arguments.options[i]`; TypeScript arrays are
   * ZERO-BASED. The target iterates the elements directly with `for...of`, which sidesteps the index
   * entirely while visiting the same elements in the same order. The observable result is identical;
   * only the traversal idiom changes, which the Minimal Change Clause explicitly licenses (AAP
   * §0.8.1).
   *
   * ⭐ THE UNSCOPED LOOP COUNTER BECOMES BLOCK-SCOPED — A LANGUAGE-LEVEL SAFETY TRANSLATION. The
   * legacy declares its counter WITHOUT `var` at [model/service/OptionService.cfc:L58], so `i` lands
   * in the component's shared `variables` scope. On a DI/1 singleton that scope is shared across
   * concurrent requests, making it the same class of hazard as carried defect D10 in
   * `model/service/ProductService.cfc`. The `for...of` binding here cannot leak: it is scoped to the
   * loop and there is no shared mutable state to leak into (M7). ⛔ NO NEW DEFECT IDENTIFIER IS MINTED
   * for this, and none is implied — the carried register of AAP §0.6.7 is closed at its final entry,
   * D21, and this file introduces nothing beyond it. The change is recorded instead as a deliberate
   * translation decision in the manner AAP §0.8.2 Guideline 6 requires, exactly as the plan itself
   * treats D10.
   *
   * ⭐ THE LABEL IS THE PLAIN OPTION NAME. `name` comes from the option's own name and nothing else —
   * contrast {@link OptionService.getUnusedProductOptions}, whose label is composed from two names by
   * the repository. The two members produce the same SHAPE with different label SEMANTICS, and
   * harmonising them would change output.
   *
   * ⭐ A JUDGEMENT CALL ON THE ABSENT NAME, MADE EXPLICITLY. `Option.optionName` is optional in the
   * domain port, because [model/entity/Option.cfc:L54] declares a nullable column and CFML models a
   * null column as a key ABSENT from the object. In the legacy, `{name=<null>}` simply does not create
   * the key, and the drop-down renderer then emits an entry with an EMPTY label — it does not fail and
   * it does not skip the entry. The empty string reproduces that outcome while satisfying
   * `SelectOption.name`, whose type is fixed as a required string. ⛔ The alternatives were rejected
   * deliberately: skipping such an option would change cardinality, and substituting the identifier or
   * the option code as a fallback label would invent a display rule the source does not have (S9). The
   * identifier needs no such treatment — [model/entity/Option.cfc:L52] declares `unsavedvalue=""
   * default=""`, so it is always a string.
   *
   * TR-1 TIGHTENING, RECORDED RATHER THAN MADE SILENTLY. The legacy parameter is declared
   * `required any options` at [model/service/OptionService.cfc:L55], but the body reads exactly two
   * accessors off each element — the option's name and its identifier — so the observed contract is an
   * array of options. AAP §0.4.2.4 fixes the tightened signature, and it is noted here because a
   * tightening is a narrowing of what callers may pass.
   *
   * TEST PROVENANCE: NET-NEW. No legacy `OptionServiceTest` exists (AAP §0.6.5.2).
   *
   * @param options - The options to project, in the order they should appear. Not mutated.
   * @returns One entry per input option, in input order. Empty when the input is empty.
   */
  public getOptionsForSelect(options: Option[]): SelectOption[] {
    const sortedOptions: SelectOption[] = [];

    for (const option of options) {
      sortedOptions.push({ name: option.optionName ?? '', value: option.optionID });
    }

    return sortedOptions;
  }

  /**
   * Lists the options a product may still be offered, as select entries.
   *
   * PORT OF [model/service/OptionService.cfc:L72-L74]:
   *
   *     public array function getUnusedProductOptions(required string productID,
   *                                                  required string existingOptionGroupIDList){
   *         return getOptionDAO().getUnusedProductOptions(argumentCollection=arguments);
   *     }
   *
   * A PURE PASS-THROUGH IN THE LEGACY, AND A PURE PASS-THROUGH HERE. The legacy body is one
   * statement, forwarding its whole argument collection to the data-access object. Every rule worth
   * preserving therefore lives in `model/dao/OptionDAO.cfc:L51-L92` and is documented on
   * `OptionRepository.findUnusedOptions`: the set-membership filter on the supplied group list, the
   * correlated non-existence guard against the product's SKU options, the two-level row ordering, and
   * the fact that an empty group list legitimately yields an empty result.
   *
   * ⭐⭐ OP-1 — THE REPOSITORY ROWS ARE RETURNED DIRECTLY, WITH NO RE-PROJECTION. This is the single
   * most important instruction on this member, and the failure mode is silent. The label was already
   * COMPOSED by the data-access object at [model/dao/OptionDAO.cfc:L88], as
   * `{name="#rs.optionGroupName# - #rs.optionName#", value=rs.optionID}` — the owning group's name,
   * then a SPACE, then a HYPHEN-MINUS, then a SPACE, then the option's own name. ⛔ There is therefore
   * NO `map` call here, no rebuilt object literal and no reach for `optionName`. Mapping the rows
   * would replace a composed two-part label with a bare option name, producing a drop-down in which
   * every group's "Large" looks identical — a change no type check could catch, because
   * `UnusedOptionRow` and {@link SelectOption} are structurally identical BY DESIGN precisely so that
   * the rows pass through untouched.
   *
   * ⭐ THE PUBLIC ARGUMENT ORDER IS PRESERVED EVEN THOUGH THE STATEMENT BINDS THE OTHER WAY ROUND. The
   * legacy declares `productID` first and `existingOptionGroupIDList` second, at
   * [model/service/OptionService.cfc:L72] and again at [model/dao/OptionDAO.cfc:L52-L53], while the
   * statement binds the group list at [model/dao/OptionDAO.cfc:L68] BEFORE the product identifier at
   * [:L78]. The signature order is what callers depend on and is what AAP §0.4.2.4 fixes, so it is
   * preserved here and the delegation is positional in that same order; reconciling the two orders is
   * the adapter's obligation, recorded on the port. Both parameters are same-typed strings, so
   * swapping them would compile cleanly and return wrong rows — which is why the order is called out
   * rather than assumed.
   *
   * TEST PROVENANCE: NET-NEW. No legacy `OptionServiceTest` exists (AAP §0.6.5.2).
   *
   * @param productID - The product whose SKUs determine what already counts as used.
   * @param existingOptionGroupIDList - Comma-delimited option-group identifiers already on that
   *        product. An empty string is a legal and ordinary input.
   * @returns The qualifying options as select entries, ordered by group name then option name.
   */
  public getUnusedProductOptions(
    productID: string,
    existingOptionGroupIDList: string,
  ): Promise<SelectOption[]> {
    return this.optionRepository.findUnusedOptions(productID, existingOptionGroupIDList);
  }

  /**
   * Lists the option groups not yet present on a product, as select entries.
   *
   * PORT OF [model/service/OptionService.cfc:L76-L78]:
   *
   *     public array function getUnusedProductOptionGroups(required string existingOptionGroupIDList){
   *         return getOptionDAO().getUnusedProductOptionGroups(argumentCollection=arguments);
   *     }
   *
   * A one-statement pass-through, ported as a one-statement delegation. The rows are returned
   * DIRECTLY — no `map`, no sort, no filter, no relabelling — for the same reason spelled out under
   * OP-1 on {@link OptionService.getUnusedProductOptions}.
   *
   * ⭐ THE LABEL SEMANTICS DIFFER FROM THE SIBLING MEMBER, AND THE DIFFERENCE IS DELIBERATE. Here
   * `name` is the PLAIN group name and `value` is the group's own identifier —
   * [model/dao/OptionDAO.cfc:L113] builds `{name=rs.optionGroupName, value=rs.optionGroupID}` with no
   * composition of any kind. Contrast [:L88], which composes two names into one label. The two
   * members return the same shape carrying different meanings, so neither the labels nor the
   * identifier kinds may be harmonised.
   *
   * ⭐ AND SO DOES THE SET POLARITY. Both members receive the same group list, and they filter on it
   * with INVERTED predicates: the sibling keeps rows whose group IS IN the list [:L68], this one keeps
   * rows whose group is NOT IN it [:L107]. One token of difference, opposite questions. The
   * consequence for empty input is opposite too: the sibling resolves to no rows, this member resolves
   * to EVERY option group — which is correct, since a product with no groups yet has none used. The
   * asymmetry is carried, not reconciled; the reasoning is recorded on the port.
   *
   * TEST PROVENANCE: NET-NEW. No legacy `OptionServiceTest` exists (AAP §0.6.5.2).
   *
   * @param existingOptionGroupIDList - Comma-delimited option-group identifiers already on the
   *        product. An empty string is a legal and ordinary input, and yields every group.
   * @returns The qualifying option groups as select entries, ordered by group name.
   */
  public getUnusedProductOptionGroups(existingOptionGroupIDList: string): Promise<SelectOption[]> {
    return this.optionRepository.findUnusedOptionGroups(existingOptionGroupIDList);
  }

  /**
   * Loads one option by its identifier, or resolves `null` when no such option exists.
   *
   * ⭐ IR-1 — EXPLICITLY DECLARED, PREVIOUSLY SYNTHESIZED. There is NO declaration of this member
   * anywhere in `model/service/OptionService.cfc`. It resolved at run time through
   * `onMissingMethod` [org/Hibachi/HibachiService.cfc:L255-L281], which routed the `get` prefix at
   * [:L258] to `onMissingGetMethod` [:L305-L328], which called `get(entityName, id, ...)` at [:L326].
   * The real call sites are [model/service/SkuService.cfc:L75] and
   * [model/service/ProductService.cfc:L130]. AAP §0.4.2.5 mandates the explicit declaration; TR-3
   * mandates that the dispatcher itself never be reproduced.
   *
   * ⭐ POSITIONAL, SINGLE-ARGUMENT, AND NULL ON NOT FOUND. The dispatcher's docblock states "Ordered
   * arguments only--named arguments not supported" [:L253], and its signature convention is
   * `getXXX(required any ID, boolean isReturnNewOnNotFound = false)` [:L234]. Both real call sites
   * pass the identifier ALONE, so the second argument takes its default of `false`, and
   * [org/Hibachi/HibachiDAO.cfc:L18-L25] then returns nothing at all when the load misses — the
   * new-instance branch at [:L23] is unreachable on this path. ⛔ This member therefore NEVER creates
   * an option on a miss, and no `isReturnNewOnNotFound` parameter is offered, because no caller in the
   * slice supplies one and offering it would widen the surface beyond the observed contract.
   *
   * The lookup runs through {@link buildIdentifierQuery}; see that function for why a primary-key
   * filter through the query port is the faithful analogue of the legacy primary-key load, and why the
   * unpaged collection is the one read.
   *
   * TEST PROVENANCE: NET-NEW. No legacy `OptionServiceTest` exists (AAP §0.6.5.2).
   *
   * @param optionID - The 32-character identifier of the option to load.
   * @returns The option, or `null` when none matches.
   */
  public async getOption(optionID: string): Promise<Option | null> {
    const result = await this.smartListQueryPort.execute<Option>(
      buildIdentifierQuery(OPTION_ENTITY_NAME, OPTION_ID_PROPERTY, optionID),
    );

    return result.records[0] ?? null;
  }

  /**
   * Loads one option group by its identifier, or resolves `null` when no such group exists.
   *
   * ⭐ IR-1 — EXPLICITLY DECLARED, PREVIOUSLY SYNTHESIZED, by the same mechanism described on
   * {@link OptionService.getOption}. The real call site is [model/service/ProductService.cfc:L115],
   * inside `processProduct_addOptionGroup`, which resolves the group through this service before
   * attaching it to the product.
   *
   * Identical contract to {@link OptionService.getOption} in every respect that matters: one
   * positional identifier, `null` on a miss, and never a newly created entity. Declared separately
   * rather than generalised into one identifier-typed member, because the legacy surface is
   * per-entity — the dispatcher recovered the entity name from the member name at [:L308] — and
   * because a single generic member would let an option identifier be handed to a group lookup with
   * no compile error.
   *
   * TEST PROVENANCE: NET-NEW. No legacy `OptionServiceTest` exists (AAP §0.6.5.2).
   *
   * @param optionGroupID - The 32-character identifier of the option group to load.
   * @returns The option group, or `null` when none matches.
   */
  public async getOptionGroup(optionGroupID: string): Promise<OptionGroup | null> {
    const result = await this.smartListQueryPort.execute<OptionGroup>(
      buildIdentifierQuery(OPTION_GROUP_ENTITY_NAME, OPTION_GROUP_ID_PROPERTY, optionGroupID),
    );

    return result.records[0] ?? null;
  }

  /**
   * Runs a dynamic query over options and returns its materialised outcome.
   *
   * ⭐ IR-1 — EXPLICITLY DECLARED, PREVIOUSLY SYNTHESIZED. No declaration of this member exists in
   * `model/service/OptionService.cfc`; the legacy resolved it through `onMissingMethod`
   * [org/Hibachi/HibachiService.cfc:L255-L281], whose suffix test at [:L259-L260] routed it to
   * `onMissingGetSmartListMethod` [:L340-L351] and thence to `getSmartList(entityName, data)` at
   * [:L350]. The real call site is `Product.getOptionsByOptionGroup()` at
   * [model/entity/Product.cfc:L340-L347].
   *
   * ⭐ THE CALLER'S INPUT IS PRESERVED UNCHANGED AND NOTHING IS ADDED TO IT. The input is projected
   * onto the query description by {@link buildSmartListQuery}, which maps exactly the keys
   * `SmartListInput` declares and adds no filter, no ordering, no page size, no distinct flag and no
   * current-URL behaviour of its own. Called with NO argument — which is precisely what the real call
   * site does at [model/entity/Product.cfc:L341] — the query carries the entity name and nothing
   * else, matching the all-collections-empty state the legacy object is left in by
   * [org/Hibachi/HibachiSmartList.cfc:L44-L59].
   *
   * ⭐ S8 — ONE CONSEQUENCE FLAGGED FOR WHOEVER PORTS `model/entity/Product.cfc`. The legacy call site
   * receives a mutable smart-list OBJECT and then configures it — distinct at
   * [model/entity/Product.cfc:L342], two filters at [:L343-L344] and an ordering at [:L345] — before
   * reading records at [:L346]. The AAP-declared target signature returns an ALREADY-EXECUTED result,
   * so a caller must express those choices through the input instead. The filters and the ordering are
   * expressible; the distinct flag is NOT, because `SmartListInput` declares no member for it. That
   * gap is recorded in the projection section header rather than closed by widening this signature,
   * because the signature is the parity contract (AAP §0.8.3.1), and rather than closed by switching
   * the flag on here, because in the legacy the flag is the caller's decision and setting it
   * unilaterally would invent behaviour (S9).
   *
   * TEST PROVENANCE: NET-NEW. No legacy `OptionServiceTest` exists (AAP §0.6.5.2).
   *
   * @param input - The caller-supplied query input. Optional, because the real call site supplies
   *        none.
   * @returns The records, the current page, and the count and paging figures derived from them.
   */
  public getOptionSmartList(input?: SmartListInput): Promise<SmartListResult<Option>> {
    return this.smartListQueryPort.execute<Option>(buildSmartListQuery(OPTION_ENTITY_NAME, input));
  }

  /**
   * Runs a dynamic query over option groups and returns its materialised outcome.
   *
   * ⭐ IR-1 — EXPLICITLY DECLARED, PREVIOUSLY SYNTHESIZED, by the same mechanism described on
   * {@link OptionService.getOptionSmartList}. The real call site is `Product.getOptionGroups()` at
   * [model/entity/Product.cfc:L251-L261], which is also the member that populates the group struct at
   * [:L241-L249] and therefore feeds the group list both unused-option members take as input.
   *
   * The caller's input is preserved unchanged and nothing is added to it, exactly as on
   * {@link OptionService.getOptionSmartList}; the same S8 note about the distinct flag applies, since
   * this call site sets it too, at [model/entity/Product.cfc:L255].
   *
   * TEST PROVENANCE: NET-NEW. No legacy `OptionServiceTest` exists (AAP §0.6.5.2).
   *
   * @param input - The caller-supplied query input. Optional, because the real call site supplies
   *        none.
   * @returns The records, the current page, and the count and paging figures derived from them.
   */
  public getOptionGroupSmartList(input?: SmartListInput): Promise<SmartListResult<OptionGroup>> {
    return this.smartListQueryPort.execute<OptionGroup>(
      buildSmartListQuery(OPTION_GROUP_ENTITY_NAME, input),
    );
  }
}
