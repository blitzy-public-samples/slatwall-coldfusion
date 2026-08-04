// ---------------------------------------------------------------------------
// slatwall-ts - the SwOptionGroup domain entity
//
// PROVENANCE
//   A 1:1 logic extraction of model/entity/OptionGroup.cfc (109 lines), which is
//   the sole authority for every behaviour reproduced below. Entity name
//   `SlatwallOptionGroup`, physical table `SwOptionGroup`
//   [model/entity/OptionGroup.cfc:L49].
//
//   SCHEMA CONTINUITY. No migration, no rename and no new column: the property
//   metadata IS the contract, and each field below cites the declaration it
//   serves so a reviewer can diff this file against the CFC line by line.
//
//   The component's two `hb_*` attributes are carried forward as documentation
//   rather than as exported constants, because neither needs a runtime
//   representation to stay auditable: `hb_serviceName="optionService"` and
//   `hb_permission="this"` [model/entity/OptionGroup.cfc:L49]. The service name
//   is `optionService`, not an `optionGroupService`: Option and OptionGroup CRUD
//   are both served by model/service/OptionService.cfc.
//
// WHY THIS ENTITY IS IN SCOPE
//   It is not named in the migration prompt. Two consumers require it.
//
//     * [model/entity/Option.cfc:L59] declares `optionGroup` as a many-to-one
//       onto this entity, so every ported Option needs this type.
//     * [model/dao/SkuDAO.cfc:L172-L202] `getSortedProductSkusID` joins
//       `SwOptionGroup` and weights its ORDER BY with
//       `SUM(SwOption.sortOrder * POWER(10, <next> - SwOptionGroup.sortOrder))`.
//       That expression is why `sortOrder` is `required="true"`
//       [model/entity/OptionGroup.cfc:L58] and is modelled here as a required
//       `number`: a NULL would poison POWER().
//
// NO BASE CLASS, BY DESIGN
//   The legacy component extends `HibachiEntity`, and none of that chain is
//   ported or emulated: this is a standalone class with no ambient scope and no
//   service locator. The framework's `onMissingMethod` dispatcher
//   [org/Hibachi/HibachiEntity.cfc:L507-L565] is not reproduced either - there is
//   no `Proxy`, no index signature and no string dispatch here, and only
//   concretely-called members are declared, as explicitly-typed methods.
//   `OptionGroup` declares no `attributeValues` collection, so this file has no
//   EAV read path.
//
// ASSOCIATIONS ARRIVE ALREADY MATERIALIZED
//   Hibernate lazy collections have no equivalent in a driver-only stack, so
//   `src/repositories/mysql/**` owns row-to-entity hydration and documents the
//   fetch shape at the producing method. This class receives what it is given and
//   never simulates laziness.
//
// NO COLLABORATOR PORT IS INJECTED
//   The component has exactly one `getService(` site - `sortObjectArray` on the
//   utility service [model/entity/OptionGroup.cfc:L77] - and it is replaced by an
//   explicit in-memory sort in this file rather than by a port. Nothing is
//   imported from `../ports/`.
//
// THE SORT THIS ENTITY REACHES IS PART OF THE CONTRACT
//   `getOptions` returns the result of `sortObjectArray`
//   [model/service/HibachiUtilityService.cfc:L514-L531] straight out of a public
//   entity method, so that utility's observable behaviour is reproduced here
//   rather than improved: random tie-breaking, a case-insensitive struct-key
//   collision that can silently drop an element, key text taken from the first
//   insertion, and a `numeric` mode that orders by the random tail and raises on
//   a non-numeric composed key. The tie-breaking random source is injected
//   through the constructor, so each of those is characterizable with plain
//   inputs and no clock, database or environment.
//
// TEST COVERAGE
//   `slatwall-ts/tests/unit/domain/entities/optionGroup.test.ts` covers this
//   entity, and all of it is net-new: no legacy test under `meta/tests/**`
//   touches OptionGroup, so nothing here may be presented as parity.
// ---------------------------------------------------------------------------

import { cfNumberToString } from '../../lib/cfml/numberFormat.js';
import { cfBoolean } from '../../lib/cfml/truthiness.js';
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import type { Option } from './option.js';

// `option.ts` <-> `optionGroup.ts` is an UNAVOIDABLE MUTUAL TYPE CYCLE, and it
// is safe. [model/entity/OptionGroup.cfc:L70] declares the `options`
// one-to-many while [model/entity/Option.cfc:L59] declares the `optionGroup`
// many-to-one, so each side genuinely names the other. Both
// directions use `import type` ONLY, which TypeScript erases at emit, so the
// emitted JavaScript contains no `require`/`import` of the sibling module and
// no initialisation-order hazard exists. Entity classes never construct
// siblings - hydration is a `src/repositories/mysql/**` responsibility - so a
// VALUE import between these two files is never needed and must never be
// introduced.

/**
 * The `optionCode` / `optionGroupCode` / `productCode` format constraint.
 *
 * ONE constant for THREE consumers, because the legacy regex is byte-identical
 * at all three sites. Verified by extracting every `"regex"` value under
 * model/validation/ and counting: this pattern occurs exactly three times and
 * the three strings are identical.
 *
 *   * `optionCode`       [model/validation/Option.json:L3]
 *   * `optionGroupCode`  [model/validation/OptionGroup.json:L4]
 *   * `productCode`      [model/validation/Product.json:L10]
 *
 * All three rules read alike - a `save` context that is `required`, `unique`,
 * and constrained by a `regex` whose value is the pattern declared below. The
 * pattern string is deliberately NOT reproduced a second time in this comment:
 * the declaration on the next line is the single place it appears in this
 * folder, and quoting it here as well would create exactly the second copy this
 * constant exists to prevent. Compare it against any of the three locators above
 * to confirm the match.
 *
 * The literal is therefore written once, HERE, and `option.ts` and `product.ts`
 * import it from `./optionGroup.js`. Duplicating it into three files would
 * create three things that can drift apart, and this folder deliberately has no
 * barrel and no shared `types.ts` for it to live in instead. This module is the
 * natural home because it is authored first of the three in the locked file
 * sequence.
 *
 * Reading the character class precisely, since it is easy to misread: after the
 * `0-9` range the `-` is a LITERAL hyphen, not the start of a range, and `.`,
 * `|`, `^` and `~` are all literal inside a character class. So the permitted
 * set is exactly the ASCII alphanumerics plus `- _ . | : ~ ^`, one or more of
 * them, anchored at both ends - which means the empty string does NOT match.
 *
 * Carries no flags, deliberately. A `RegExp` with `g` or `y` would hold mutable
 * `lastIndex` state, and a single shared instance mutated by one caller would
 * then change another caller's result. Without those flags this instance is
 * stateless and safe to share across modules and across warm invocations.
 *
 * The `unique` and `required` halves of those rules are NOT expressed here.
 * Uniqueness is a repository concern - it needs the database - and requiredness
 * belongs to the ported zod schema at the service tier. This constant carries
 * the format constraint only.
 */
export const ENTITY_CODE_PATTERN = /^[a-zA-Z0-9-_.|:~^]+$/;

/**
 * The `sortType` argument of {@link OptionGroup.getOptions}.
 *
 * These are CFML `arraySort`'s sort types, reached through
 * [model/service/HibachiUtilityService.cfc:L526]. `'text'` is the legacy
 * default declared at [model/entity/OptionGroup.cfc:L73]; `'textnocase'` is
 * accepted because it is CFML's own case-insensitive mode and a caller that
 * asks for it must not be rejected. `'binary'` is deliberately absent: CFML
 * accepts no such sort type.
 *
 * Typed as a union rather than as `string`, which is a deliberate, documented
 * narrowing of an untyped legacy argument. Two reasons. It makes an
 * unsupported sort type a compile error at the call site instead of a silent
 * runtime fallback, and it leaves no unreachable default branch in the
 * comparator - a branch that could never execute would be dead code.
 */
export type OptionSortType = 'text' | 'textnocase' | 'numeric';

/**
 * The `direction` argument of {@link OptionGroup.getOptions}.
 *
 * CFML `arraySort`'s directions, `'asc'` being the legacy default declared at
 * [model/entity/OptionGroup.cfc:L73]. Narrowed from the untyped legacy argument
 * for the same two reasons given on {@link OptionSortType}.
 */
export type OptionSortDirection = 'asc' | 'desc';

/**
 * Every SCALAR persistent property `Option` declares, in declaration order.
 *
 * These are the values an Option can be sorted by: the scalars declared at
 * [model/entity/Option.cfc:L52-L56], plus `remoteID`
 * [model/entity/Option.cfc:L73] and the two audit timestamps
 * [model/entity/Option.cfc:L76-L78]. Everything else Option declares is an
 * association and carries no scalar sort key, so no `orderby` naming one is
 * accepted here.
 *
 * Declared `as const` so the union below has exactly one source of truth: add
 * a name here and the exhaustive switch in `readOptionSortKey` stops compiling
 * until it is handled, which is the property that keeps the two in step.
 */
const SORTABLE_OPTION_PROPERTY_NAMES = [
  'optionID',
  'optionCode',
  'optionName',
  'optionDescription',
  'sortOrder',
  'remoteID',
  'createdDateTime',
  'modifiedDateTime',
] as const;

type SortableOptionProperty = (typeof SORTABLE_OPTION_PROPERTY_NAMES)[number];

/**
 * Lookup backing the resolution in `sortOptionsByProperty`, keyed by FOLDED name.
 *
 * CFML METHOD NAMES ARE CASE-INSENSITIVE, so the legacy
 * `evaluate("obj.get#orderby#()")` at
 * [model/service/HibachiUtilityService.cfc:L523] resolved `getoptionname()`,
 * `getOptionName()` and `GETOPTIONNAME()` to the one generated accessor. The
 * lookup therefore folds with `toLowerCase()` - never `toLocaleLowerCase()`,
 * for the reason `src/lib/cfml/` documents - and hands back the CANONICAL
 * property name so the exhaustive switch in `readOptionSortKey` keeps its
 * narrow type. Frozen membership, no mutation, so nothing here carries state
 * between two invocations sharing a container.
 */
const SORTABLE_OPTION_PROPERTIES_BY_FOLDED_NAME: ReadonlyMap<string, SortableOptionProperty> =
  new Map(SORTABLE_OPTION_PROPERTY_NAMES.map((name) => [name.toLowerCase(), name]));

/**
 * A value read off an `Option` for the purpose of ordering.
 *
 * The three shapes Option's scalar accessors can return - `string` for the id,
 * code, name, description and remoteID columns, `number` for the `sortOrder`
 * integer, `Date` for the two timestamps - plus `undefined` for a column that
 * hydrated as SQL NULL or that the repository did not populate.
 */
type OptionSortKey = string | number | Date | undefined;

/**
 * Resolves an arbitrary `orderby` string to the property this module can read.
 *
 * Returns the canonical property name, or `undefined` when the string names no
 * accessor at all. A resolver rather than a type predicate, because the caller
 * needs the CANONICAL spelling to hand to `readOptionSortKey`: a predicate would
 * narrow the caller's own (possibly differently-cased) string, which is not a
 * key of the exhaustive switch. The return type is the map's VALUE type, derived
 * from `SORTABLE_OPTION_PROPERTY_NAMES`, so the two cannot drift.
 */
function resolveSortableOptionProperty(name: string): SortableOptionProperty | undefined {
  return SORTABLE_OPTION_PROPERTIES_BY_FOLDED_NAME.get(name.toLowerCase());
}

/**
 * Reads one sort key off an `Option`, through the Option accessor the legacy
 * utility would have reached by name.
 *
 * WHY ACCESSORS AND NOT FIELDS. The legacy sort resolved its `orderby` argument
 * by building an accessor call, verbatim at
 * [model/service/HibachiUtilityService.cfc:L523]:
 *
 *   var sortedStruct[ evaluate("arguments.objects[i].get#property#() & '.' & rn") ] = objects[i];
 *
 * So `orderby="sortOrder"` meant `getSortOrder()`. This function reproduces that
 * resolution with an exhaustive switch instead of `evaluate`, which is what
 * makes it statically checkable: no string is ever turned into a member access.
 *
 * FAR-SIDE CONTRACT ON `option.ts`. This switch is the complete list of members
 * this file requires `slatwall-ts/src/domain/entities/option.ts` to expose, and
 * every one of them is an accessor that CFML's `accessors=true` generated from a
 * scalar persistent property of model/entity/Option.cfc. Nothing beyond them is
 * required, and in particular this file needs no setter on `Option`, no
 * collection accessor, and nothing derived.
 */
function readOptionSortKey(option: Option, property: SortableOptionProperty): OptionSortKey {
  switch (property) {
    case 'optionID':
      return option.getOptionID();
    case 'optionCode':
      return option.getOptionCode();
    case 'optionName':
      return option.getOptionName();
    case 'optionDescription':
      return option.getOptionDescription();
    case 'sortOrder':
      return option.getSortOrder();
    case 'remoteID':
      return option.getRemoteID();
    case 'createdDateTime':
      return option.getCreatedDateTime();
    case 'modifiedDateTime':
      return option.getModifiedDateTime();
  }
}

/**
 * Renders a sort key exactly as CFML string concatenation would render it, so
 * that the composed struct key below is the one the legacy engine built.
 *
 * The legacy expression at [model/service/HibachiUtilityService.cfc:L523] is
 * `evaluate("arguments.objects[i].get#property#() & '.' & rn")`, so the accessor
 * result reaches the key through CFML's implicit number/date-to-string
 * conversion, never through a comparator. Three conversions matter:
 *
 *   * A NUMBER renders through `cfNumberToString`, which reproduces CFML's
 *     trailing-zero dropping - the same mechanism that corrupts
 *     `RoundingRuleService.roundValue` for values whose cents end in zero. It
 *     matters here for the identical reason: `sortOrder` 10 renders `"10"`, not
 *     `"10.0"`, and that string is what gets ordered.
 *   * A NULL renders as the empty string. CFML concatenation of a null accessor
 *     result yields `''` rather than raising, so `getOptions('remoteID')` over
 *     rows with a NULL `remoteID` composes keys of the form `".57"` - which is
 *     precisely how the legacy numeric mode ends up sorting by the random suffix
 *     alone.
 *   * A DATE renders ISO-8601. This is the ONE conversion this port chooses
 *     rather than inherits: CFML's date-to-string form is engine-specific
 *     (Lucee emits `{ts '...'}`, Adobe ColdFusion a locale-formatted string), so
 *     no single rendering can claim byte parity. ISO-8601 is chosen because its
 *     lexicographic order equals chronological order, which is the property the
 *     legacy text sort had on whichever form its engine produced. An invalid
 *     date renders as the empty string rather than raising, because
 *     `toISOString()` throws `RangeError` on a NaN time value and this function
 *     must be total.
 */
function optionSortKeyAsCfmlString(value: OptionSortKey): string {
  if (value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isNaN(value) ? '' : cfNumberToString(String(value));
  }

  return Number.isNaN(value.getTime()) ? '' : value.toISOString();
}

/**
 * The tie-breaking random source the legacy sort used.
 *
 * [model/service/HibachiUtilityService.cfc:L521] draws `randRange(1,100)` once
 * per element and concatenates it onto the struct key, so it participates in the
 * ordering and it decides ties. Reproducing the algorithm means reproducing that
 * draw, and a defect this port PRESERVES depends on it (see
 * `sortOptionsByLegacyStructKey`).
 *
 * It is a named type so a hydrating repository can supply a deterministic
 * generator and pin the otherwise non-deterministic behaviour in a
 * characterization test. The `getOptions` PUBLIC SIGNATURE is untouched by this
 * - the source is injected through the constructor, the same way this folder
 * injects a clock or a collaborator port, because interface parity at the method
 * boundary is the acceptance contract and the entity-layer widening budget is
 * fully spent.
 *
 * @returns An integer in the inclusive range 1..100, matching `randRange(1,100)`.
 */
export type OptionSortTieBreaker = () => number;

/**
 * The default tie breaker.
 *
 * Supplies an inclusive, non-cryptographic draw over 1..100, which is the range
 * the legacy tie-break draws from [model/service/HibachiUtilityService.cfc:L522].
 * No claim is made that the two generators share an algorithm. No security
 * decision is taken with this value - it exists only to reproduce the legacy
 * tie-break and its key-collision behaviour - so a CSPRNG would add a dependency
 * on `node:crypto` inside a domain entity to buy nothing.
 */
function randRangeOneToOneHundred(): number {
  return Math.floor(Math.random() * 100) + 1;
}

/**
 * Composes one legacy struct key: the rendered accessor value, a literal `.`,
 * and the tie-breaking random number.
 *
 * Verbatim from [model/service/HibachiUtilityService.cfc:L523], whose key format
 * the source comment at L518-L520 documents as `{VALUE}.{RAND NUMBER}`.
 */
function composeLegacySortKey(valueText: string, tieBreak: number): string {
  return `${valueText}.${String(tieBreak)}`;
}

/**
 * Orders the composed struct keys, exactly as
 * `arraySort(keyArray, sorttype, direction)`
 * [model/service/HibachiUtilityService.cfc:L526] orders them.
 *
 * THE WHOLE COMPOSED KEY IS THE SORT INPUT, not the underlying value: the random
 * suffix is inside the string being compared, which is what makes the legacy
 * ordering of equal values non-deterministic and, under `numeric`, what makes an
 * integer value sort by its random tail.
 *
 * `'text'` IS CASE-SENSITIVE AND `'textnocase'` IS NOT. CFML `arraySort`
 * distinguishes the two, and `'text'` is the default declared at
 * [model/entity/OptionGroup.cfc:L73], so a caller that omits `sortType` gets the
 * case-SENSITIVE ordering. `<` and `>` on strings compare by UTF-16 code unit,
 * which is what CFML's underlying Java string comparison does;
 * `String.prototype.localeCompare` is deliberately NOT used, because it applies
 * locale collation and its result would then depend on the locale the Lambda
 * container happens to boot with.
 *
 * THE NUMERIC MODE READS EVERY KEY BEFORE IT ORDERS ANY OF THEM, and that is a
 * deliberate structural choice rather than an optimisation. `arraySort` with sort
 * type `numeric` requires the whole array to be numeric, so its refusal does not
 * depend on which pairs a comparison algorithm happens to visit - a
 * single-element array of a non-numeric key fails there, and it fails here.
 * Validating inside a comparator instead would make the refusal depend on
 * `Array.prototype.sort`'s internals, which is not a contract anything should
 * rest on.
 *
 * Keys are unique by construction - they are the keys of a struct - so no tie of
 * the comparator's own ever has to be broken.
 */
function sortLegacySortKeys(
  keyArray: readonly string[],
  sortType: OptionSortType,
  direction: OptionSortDirection,
): readonly string[] {
  const directionMultiplier = direction === 'desc' ? -1 : 1;

  if (sortType === 'numeric') {
    const numericKeys = keyArray.map((key) => ({
      key,
      numericValue: legacyNumericKeyValue(key),
    }));

    numericKeys.sort((left, right) => {
      if (left.numericValue < right.numericValue) {
        return -directionMultiplier;
      }

      return left.numericValue > right.numericValue ? directionMultiplier : 0;
    });

    return numericKeys.map((entry) => entry.key);
  }

  const foldCase = sortType === 'textnocase';

  return [...keyArray].sort((left, right) => {
    const leftText = foldCase ? left.toLowerCase() : left;
    const rightText = foldCase ? right.toLowerCase() : right;

    if (leftText < rightText) {
      return -directionMultiplier;
    }

    return leftText > rightText ? directionMultiplier : 0;
  });
}

/**
 * Reads a composed key as the number a `numeric` sort orders it by, raising when
 * it has no numeric reading.
 *
 * REPRODUCES A REAL FAILURE RATHER THAN PAPERING OVER IT. CFML `arraySort` with
 * sort type `numeric` raises when an element is not numeric, and the composed key
 * makes that reachable in two ordinary situations, both of them consequences of
 * the key format at [model/service/HibachiUtilityService.cfc:L523]:
 *
 *   * A TEXT value - `getOptions('optionName', 'numeric')` composes
 *     `"Large.42"`, which is not a number.
 *   * A value that ALREADY CONTAINS A DECIMAL POINT - the random suffix turns it
 *     into a second one, so `"1.5"` composes `"1.5.42"`.
 *
 * `parseFloat` is not used: it would silently accept the `"1.5.42"` prefix as
 * 1.5 and read `"Large.42"` as NaN, inventing an ordering the legacy engine
 * never produced. `Number` over the whole string is the faithful test, and it
 * also matches CFML's `isNumeric` on the two shapes that MUST keep working: an
 * empty value composes `".42"`, which CFML and `Number` agree is 0.42, and an
 * integer value composes `"7.42"`.
 */
function legacyNumericKeyValue(key: string): number {
  const numericValue = Number(key);

  if (Number.isNaN(numericValue)) {
    // LEGACY-NOTE [model/service/HibachiUtilityService.cfc:L526]: arraySort with sorttype="numeric"
    // raises on a non-numeric element; reproduced rather than degraded to a text or NaN ordering.
    throw new Error(
      `OptionGroup.getOptions cannot apply a numeric sort: the composed sort key "${key}" is not ` +
        'numeric. The legacy sort composed each key as "<value>.<randRange(1,100)>" ' +
        '[model/service/HibachiUtilityService.cfc:L523] and then called ' +
        'arraySort(keyArray,"numeric") [model/service/HibachiUtilityService.cfc:L526], which ' +
        'raises for a non-numeric element - so a text-valued property, or a value that already ' +
        'contains a decimal point, fails here exactly as it failed there. Sort by "text" or ' +
        '"textnocase" instead.',
    );
  }

  return numericValue;
}

/**
 * The legacy sort, reproduced: struct-key composition, key sort, array rebuild.
 *
 * Legacy [model/entity/OptionGroup.cfc:L77]:
 * `getService("hibachiUtilityService").sortObjectArray(variables.Options,
 * arguments.orderby, arguments.sortType, arguments.direction)`. The utility is
 * framework code that is not ported as a module - there is no 14th port and
 * `hibachiUtilityService` is not a collaborator here - but its OBSERVABLE
 * BEHAVIOUR is part of what `getOptions` returns, so the algorithm is reproduced
 * in place rather than replaced by a better one. Verified verbatim,
 * [model/service/HibachiUtilityService.cfc:L514-L531]:
 *
 *   public array function sortObjectArray(required array objects, required string orderby,
 *       string sorttype="text", string direction = "asc") {
 *       var property = arguments.orderby;
 *       var sortedStruct = {};
 *       var sortedArray = [];
 *       for (var i=1; i <= arrayLen(arguments.objects); i++) {
 *               // Each key in the struct is in the format of
 *               // {VALUE}.{RAND NUMBER} This is important otherwise any objects
 *               // with the same value would be lost.
 *               var rn = randRange(1,100);
 *               var sortedStruct[ evaluate("arguments.objects[i].get#property#() & '.' & rn") ] = objects[i];
 *       }
 *       var keyArray = structKeyArray(sortedStruct);
 *       arraySort(keyArray,arguments.sorttype,arguments.direction);
 *       for(var i=1; i<=arrayLen(keyArray);i++) {
 *           arrayAppend(sortedArray, sortedStruct[keyArray[i]]);
 *       }
 *       return sortedArray;
 *   }
 *
 * FOUR OBSERVABLE PROPERTIES ARE REPRODUCED, NOT REPAIRED. Each one is visible
 * in the array a caller receives, which is why none of them is treated as an
 * internal detail of unported framework code:
 *
 *   1. TIES ARE BROKEN RANDOMLY. The random suffix sits inside the sorted key, so
 *      two options with equal values come back in a non-deterministic order
 *      between two calls on identical data.
 *   2. AN ELEMENT CAN BE LOST. Two options sharing a rendered value AND a drawn
 *      random number collide on one struct key; the later assignment overwrites
 *      the earlier, so the returned array is SHORTER than the input. The source
 *      comment at L518-L520 shows the suffix was introduced to make this
 *      unlikely, with only 100 values to draw from - it does not make it
 *      impossible. CFML struct keys are also CASE-INSENSITIVE, so `"Red.7"` and
 *      `"red.7"` are the same key and collide too.
 *   3. THE KEY TEXT COMES FROM THE FIRST INSERTION. Assigning to an existing
 *      struct key replaces the value and leaves the key as first spelled, so
 *      after a case-insensitive collision the ordering uses the earlier
 *      spelling while the surviving element is the later one.
 *   4. `numeric` ORDERS BY THE RANDOM TAIL. The suffix becomes the fractional
 *      part of the key, so integer values are ordered by their random tails, and
 *      a value that already contains a decimal point produces a non-numeric key
 *      and raises (see `legacyNumericKeyValue`).
 *
 * A `Map` keyed by the UPPERCASED key text reproduces CFML's case-insensitive
 * struct-key semantics: lookup ignores case, the stored `keyText` is the first
 * spelling seen, and the stored `option` is the last written. The key ORDER of
 * the map is irrelevant, because the keys are sorted before the array is
 * rebuilt - which also means CFML's unordered `structKeyArray` introduces no
 * difference here.
 *
 * NEVER SORTS IN PLACE. The keys are sorted, not the association; the returned
 * array is freshly built, exactly as the legacy `sortedArray` is. The
 * materialized association is `readonly` so that this cannot regress into
 * mutating shared request-scoped state.
 */
function sortOptionsByLegacyStructKey(
  options: readonly Option[],
  property: SortableOptionProperty,
  sortType: OptionSortType,
  direction: OptionSortDirection,
  tieBreaker: OptionSortTieBreaker,
): Option[] {
  const sortedStruct = new Map<string, { readonly keyText: string; option: Option }>();

  for (const option of options) {
    const keyText = composeLegacySortKey(
      optionSortKeyAsCfmlString(readOptionSortKey(option, property)),
      tieBreaker(),
    );
    const structKey = keyText.toUpperCase();
    const existing = sortedStruct.get(structKey);

    if (existing === undefined) {
      sortedStruct.set(structKey, { keyText, option });
    } else {
      // LEGACY-DEFECT [model/service/HibachiUtilityService.cfc:L523]: a colliding key overwrites the
      // earlier element, so the returned array is shorter than the input. Preserved deliberately; do
      // not fix without a product decision.
      existing.option = option;
    }
  }

  const keyArray = sortLegacySortKeys(
    [...sortedStruct.values()].map((entry) => entry.keyText),
    sortType,
    direction,
  );

  const sortedArray: Option[] = [];

  for (const key of keyArray) {
    const entry = sortedStruct.get(key.toUpperCase());

    if (entry !== undefined) {
      sortedArray.push(entry.option);
    }
  }

  return sortedArray;
}

/**
 * Resolves the `orderby` argument to a readable property, then sorts.
 *
 * AN UNSUPPORTED `orderby` RAISES, because that is what the legacy did. The
 * accessor was resolved dynamically through `evaluate()`
 * [model/service/HibachiUtilityService.cfc:L523], so an `orderby` naming no
 * accessor threw at runtime - it did not degrade to an unsorted array, and this
 * port does not either. Returning the association unsorted would answer a
 * question the caller did not ask and would hide a programming error at exactly
 * the layer that can still name it. The error is a deterministic domain error
 * carrying the offending name and the supported set, which is strictly more
 * useful than CFML's `evaluate` failure while failing on the same inputs.
 *
 * This is also why `getOptions('')` throws rather than behaving like the
 * no-argument call: the empty string IS an argument, so the legacy took the sort
 * branch with it and `evaluate("....get()")` failed there too.
 */
function sortOptionsByProperty(
  options: readonly Option[],
  orderby: string,
  sortType: OptionSortType,
  direction: OptionSortDirection,
  tieBreaker: OptionSortTieBreaker,
): Option[] {
  const property: SortableOptionProperty | undefined = resolveSortableOptionProperty(orderby);

  if (property === undefined) {
    // LEGACY-NOTE [model/service/HibachiUtilityService.cfc:L523]: evaluate() raised for an accessor
    // that does not exist; the failure contract is reproduced instead of degrading to unsorted data.
    //
    // The message OPENS with the legacy terminal sentence from
    // [org/Hibachi/HibachiEntity.cfc:L565] verbatim - grammatical error included - because
    // `src/handlers/errorMapper.ts` recognises that anchored template and classifies the failure by
    // it. The diagnostic detail follows in parentheses; the caller's spelling is interpolated exactly
    // as it appeared in the evaluated source text, and the supported set is listed because the match
    // is case-insensitive and the reader needs the canonical spellings.
    throw new Error(
      `You have called a method get${orderby}() which does not exists in the Option entity. ` +
        `(OptionGroup.getOptions cannot order by "${orderby}": Option declares no such sortable ` +
        `property. The legacy sort resolved the accessor dynamically with evaluate() ` +
        `[model/service/HibachiUtilityService.cfc:L523] and raised when it did not exist. ` +
        'Supported properties, matched case-insensitively as CFML matches method names: ' +
        `${SORTABLE_OPTION_PROPERTY_NAMES.join(', ')}.)`,
    );
  }

  return sortOptionsByLegacyStructKey(options, property, sortType, direction, tieBreaker);
}

/**
 * A group of selectable options - Size, Colour, and so on - and the `SwOptionGroup` row behind it.
 *
 * A class rather than an interface, because the legacy entity carries behaviour and not merely
 * data - `getOptions` at [model/entity/OptionGroup.cfc:L73-L79] overrides the generated collection
 * accessor with a sorting variant - and because interface parity is the acceptance contract: a
 * reviewer diffs this public surface against the CFC method by method. Method names are therefore
 * the legacy CFML names verbatim, in camelCase.
 *
 * Every method below is SYNCHRONOUS. The async boundary rule in this port is per-method - a method
 * becomes async if and only if it reaches a port or a repository - and nothing on this entity does.
 * `getOptions` traverses an already-materialized association and performs pure comparison, and the
 * two bidirectional helpers only call back into the other entity's own API.
 *
 * `getOptions` is the one method that can THROW, and both throws are reproductions rather than
 * additions: an `orderby` naming no accessor raised through `evaluate()`
 * [model/service/HibachiUtilityService.cfc:L523], and `arraySort(...,"numeric")` raised on a
 * non-numeric element [model/service/HibachiUtilityService.cfc:L526].
 */
export class OptionGroup {
  // --- Persistent Properties [model/entity/OptionGroup.cfc:L52-L58] ---------------------------

  /**
   * Primary key. [model/entity/OptionGroup.cfc:L52]
   *
   *   property name="optionGroupID" ormtype="string" length="32" fieldtype="id"
   *   generator="uuid" unsavedvalue="" default="";
   *
   * `string` and never `string | undefined`: `default=""` means the column always holds a string,
   * possibly the empty one, and `unsavedvalue=""` makes that empty string load-bearing - it is
   * what the legacy framework's `isNew()` keys on. Read-only with no setter, matching the legacy
   * id property.
   */
  private readonly optionGroupID: string;

  /**
   * Display name of the group. [model/entity/OptionGroup.cfc:L53]
   *
   *   property name="optionGroupName" ormtype="string";
   *
   * No ORM default and no `required` attribute, so the column can hydrate as SQL NULL and this is
   * `string | undefined`. The validation schema requires it on the `save` context only
   * [model/validation/OptionGroup.json:L3], which constrains what may be WRITTEN and says nothing
   * about what an existing row may contain - so the type stays honest about the read side.
   */
  private readonly optionGroupName: string | undefined;

  /**
   * Business code of the group. [model/entity/OptionGroup.cfc:L54]
   *
   *   property name="optionGroupCode" ormtype="string";
   *
   * `string | undefined` for the same reason as `optionGroupName`. Its format constraint is
   * {@link ENTITY_CODE_PATTERN}, and its `required` and `unique` rules
   * [model/validation/OptionGroup.json:L4] are enforced at the service tier and the repository
   * respectively, not here.
   */
  private readonly optionGroupCode: string | undefined;

  /**
   * Image filename for the group. [model/entity/OptionGroup.cfc:L55]
   *
   *   property name="optionGroupImage" ormtype="string";
   *
   * Preserved as an inert persisted column. It has zero accessor call sites anywhere in the legacy
   * tree - verified by a repository-wide census - so nothing in this port reads it; the legacy
   * admin populates it and schema continuity requires it to survive.
   */
  private readonly optionGroupImage: string | undefined;

  /**
   * Long description. [model/entity/OptionGroup.cfc:L56]
   *
   *   property name="optionGroupDescription" ormtype="string" length="4000";
   *
   * The declared `length="4000"` is recorded here because it is part of the schema contract; it is
   * NOT enforced as a runtime constraint in this class, since the legacy entity did not enforce it
   * either - the database column length did. Like `optionGroupImage`, this column has zero accessor
   * call sites in the legacy tree and is preserved for schema continuity.
   */
  private readonly optionGroupDescription: string | undefined;

  /**
   * Whether options in this group participate in image-filename generation, as the RAW persisted
   * column value. [model/entity/OptionGroup.cfc:L57]
   *
   *   property name="imageGroupFlag" ormtype="boolean" default="0";
   *
   * Held raw and coerced on read by {@link OptionGroup.getImageGroupFlag}, rather than coerced once
   * in the constructor. Two reasons, both deliberate. It keeps the persisted value un-lossy, so
   * what this object holds is what `SwOptionGroup` holds; and it places the coercion exactly where
   * CFML placed it, at the boolean-context read site rather than at hydration.
   *
   * The type is `CfBooleanInput` - the input domain `cfBoolean` itself declares - and NOT the
   * narrower literal union `0 | 1 | '0' | '1' | 'true' | 'false' | null | undefined` that a
   * `default="0"` column suggests. That narrower union is the one this column produces in practice
   * and is recorded here for the reader, but it is not the type, because it OMITS a real `boolean`:
   * `slatwall-ts/src/lib/cfml/truthiness.ts` documents that a driver may hand a `TINYINT(1)` back
   * as a genuine `boolean`, as `0`/`1`, as one of those strings, or not at all. Reusing that
   * module's own input type also keeps a single decision table for the coercion instead of two that
   * could disagree.
   */
  private readonly imageGroupFlag: CfBooleanInput;

  /**
   * Ordering position among option groups. [model/entity/OptionGroup.cfc:L58]
   *
   *   property name="sortOrder" ormtype="integer" required="true";
   *
   * THE ONLY `required="true"` PROPERTY ON THIS ENTITY, so it is modelled as a required `number`
   * with no `| undefined`. That is not a stylistic choice: [model/dao/SkuDAO.cfc:L195-L197] weights
   * its ORDER BY with `POWER(10, <next> - SwOptionGroup.sortOrder)`, and a NULL there would poison
   * the exponent and scramble the sorted-SKU ordering. Typing it required forces a hydrating
   * repository to resolve the absent case at the boundary instead of letting it leak inward.
   */
  private readonly sortOrder: number;

  // --- Remote Properties [model/entity/OptionGroup.cfc:L60-L61] -------------------------------

  /**
   * External-system identifier. [model/entity/OptionGroup.cfc:L61]
   *
   *   property name="remoteID" ormtype="string";
   *
   * Present on this entity, under its own `// Remote properties` banner. Worth stating explicitly
   * because it is not universal in this folder - several in-scope entities declare no `remoteID` at
   * all, so its presence here is a real schema difference rather than boilerplate.
   */
  private readonly remoteID: string | undefined;

  // --- Audit Properties [model/entity/OptionGroup.cfc:L63-L67] --------------------------------
  //
  // All four declare `hb_populateEnabled="false"`, meaning the legacy framework refused to populate
  // them from request data; they are written by the persistence layer. That attribute has no
  // runtime representation here - this class exposes no setter for any of them, which is the same
  // guarantee expressed structurally.
  //
  // The two account associations are `cfc="Account" fieldtype="many-to-one"`, and
  // model/entity/Account.cfc is explicitly out of scope for this port - the whole account module
  // is - so each collapses to its OPAQUE foreign-key id. No `Account` type is imported, no
  // `Account` instance is ever constructed, and the columns themselves are preserved rather than
  // dropped so the schema contract stays auditable.

  /** `createdDateTime`, or `undefined`. [model/entity/OptionGroup.cfc:L64] */
  private readonly createdDateTime: Date | undefined;

  private readonly createdByAccountID: string | undefined;

  private readonly modifiedDateTime: Date | undefined;

  private readonly modifiedByAccountID: string | undefined;

  // --- Related Object Properties [model/entity/OptionGroup.cfc:L69-L70] -----------------------

  /**
   * The materialized `options` one-to-many. [model/entity/OptionGroup.cfc:L70]
   *
   * ALREADY POPULATED; laziness is not simulated.
   *
   * `readonly` PINS THE FIELD REFERENCE, NOT THE COLLECTION CONTENTS, and the distinction is
   * load-bearing here. The reference can never be reassigned, so this entity always speaks about one
   * array for its whole lifetime. The CONTENTS are intentionally mutable: `getOptions()` with no
   * argument hands back this very array, and `option.ts` pushes into it and splices out of it when
   * maintaining the far side of the association, exactly as [model/entity/Option.cfc:L95] and
   * [model/entity/Option.cfc:L102-L105] do through the live Hibernate collection. Nothing in this
   * class copies or freezes it.
   *
   * PRE-SORTED BY `sortOrder` ASCENDING. The Hibernate-level `orderby="sortOrder"` is part of the
   * mapping, so the producing repository method delivers this array already in that order, and
   * `getOptions()` with no argument therefore returns options in `sortOrder` order without doing
   * any work. That is precisely what lets the override's sort branch be a re-sort of an
   * already-ordered array rather than the only thing imposing an order.
   *
   * An EMPTY array is indistinguishable from "the repository did not fetch the association", and
   * that is an accepted consequence of not simulating laziness rather than an oversight. The fetch
   * shape is documented at the producing repository method, never here.
   *
   * `cascade="all-delete-orphan"` is a persistence instruction with no representation in this
   * class; it is honoured by the repository on delete. It pairs with the `maxCollection: 0` rule on
   * the `delete` context [model/validation/OptionGroup.json:L5], which blocks deleting a group that
   * still has options - enforced at the service tier, not here.
   */
  private readonly options: Option[];

  // --- Injected collaborator ------------------------------------------------------------------

  /**
   * The tie-breaking random source the reproduced legacy sort draws from.
   *
   * NOT A PERSISTENT PROPERTY and not part of the schema. It stands in for
   * `randRange(1,100)` at [model/service/HibachiUtilityService.cfc:L521], which is ambient in CFML
   * and must therefore become explicit here, exactly as ambient request scope becomes an explicit
   * context parameter and an ambient clock becomes an explicit `now`. Injecting it is what makes the
   * preserved non-determinism and the preserved key-collision element loss characterizable instead
   * of untestable, and it does so WITHOUT touching `getOptions`'s public signature - interface
   * parity at the method boundary is the acceptance contract.
   *
   * `undefined` means "use `randRange(1,100)`", which is the legacy behaviour, so a repository that
   * states nothing gets the legacy sort.
   */
  private readonly optionSortTieBreaker: OptionSortTieBreaker;

  /**
   * Hydrates one `SwOptionGroup` row.
   *
   * A single readonly parameter object, matching the convention this folder already established: an
   * inline object type rather than a second exported interface, because this module's runtime export
   * surface is fixed at the class plus {@link ENTITY_CODE_PATTERN}.
   *
   * Every nullable field is a REQUIRED slot typed `T | undefined` rather than an optional `?:` slot.
   * `exactOptionalPropertyTypes` is enabled, so "absent" and "present-but-undefined" are genuinely
   * different types, and requiring the key forces a hydrating repository to state "I looked and
   * found nothing" instead of silently omitting it. `options` is required on the same terms: a
   * repository must pass `[]` deliberately rather than leave the association unstated, and
   * `optionSortTieBreaker` on the same terms again - passing `undefined` is the deliberate statement
   * "use the legacy random source".
   *
   * There is no repository or service port parameter, because the single legacy `getService(` site
   * is `hibachiUtilityService`, framework code this port does not treat as a collaborator, and no
   * clock parameter, because this entity performs no date comparison of any kind - contrast
   * `promotionPeriod.ts`, whose `isCurrent` takes an explicit `now` so the UTC policy is visible and
   * the method is deterministically testable.
   */
  constructor(init: {
    readonly optionGroupID: string;
    readonly optionGroupName: string | undefined;
    readonly optionGroupCode: string | undefined;
    readonly optionGroupImage: string | undefined;
    readonly optionGroupDescription: string | undefined;
    readonly imageGroupFlag: CfBooleanInput;
    readonly sortOrder: number;
    readonly remoteID: string | undefined;
    readonly createdDateTime: Date | undefined;
    readonly createdByAccountID: string | undefined;
    readonly modifiedDateTime: Date | undefined;
    readonly modifiedByAccountID: string | undefined;
    readonly options: Option[];
    readonly optionSortTieBreaker: OptionSortTieBreaker | undefined;
  }) {
    this.optionGroupID = init.optionGroupID;
    this.optionGroupName = init.optionGroupName;
    this.optionGroupCode = init.optionGroupCode;
    this.optionGroupImage = init.optionGroupImage;
    this.optionGroupDescription = init.optionGroupDescription;
    this.imageGroupFlag = init.imageGroupFlag;
    this.sortOrder = init.sortOrder;
    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
    this.options = init.options;
    this.optionSortTieBreaker = init.optionSortTieBreaker ?? randRangeOneToOneHundred;
  }

  // --- Accessors --------------------------------------------------------------------------------
  //
  // `accessors=true` [model/entity/OptionGroup.cfc:L49] generated these from the property metadata,
  // so there is no legacy body to port and the locator on each one cites the property declaration it
  // serves. The only members the component declares by hand are the collection override
  // [model/entity/OptionGroup.cfc:L73-L79], the smart list [model/entity/OptionGroup.cfc:L81-L83] and
  // the two bidirectional helpers [model/entity/OptionGroup.cfc:L92-L97].
  //
  // GETTER-ONLY IS A DELIBERATE READ-ONLY NARROWING, NOT PARITY. `accessors=true` generates a
  // `set<Property>` for every persistent property as well, so the legacy surface is read AND write;
  // this class exposes reads only. Population is a repository and service-tier concern in this port -
  // rows are hydrated through the constructor - so a domain setter would offer a second, unvalidated
  // way to mutate persistent state. Any caller that genuinely needs to write reaches the owning
  // service, and adding a setter here would be a surface change rather than a fix.
  //
  // The set is COMPLETE with respect to the persistent properties rather than trimmed to current
  // call sites, because interface parity is judged against the property metadata.

  /** [model/entity/OptionGroup.cfc:L52] */
  getOptionGroupID(): string {
    return this.optionGroupID;
  }

  getOptionGroupName(): string | undefined {
    return this.optionGroupName;
  }

  getOptionGroupCode(): string | undefined {
    return this.optionGroupCode;
  }

  getOptionGroupImage(): string | undefined {
    return this.optionGroupImage;
  }

  getOptionGroupDescription(): string | undefined {
    return this.optionGroupDescription;
  }

  /**
   * Whether options in this group participate in image-filename generation.
   * [model/entity/OptionGroup.cfc:L57]
   *
   * Reads through `cfBoolean`, which is REQUIRED here and not a convenience. The column declares
   * `default="0"`, and `'0'` is a non-empty and therefore JavaScript-TRUTHY string: a naive
   * `Boolean(this.imageGroupFlag)` would turn the column's own default into `true` and invert the
   * flag on every unset row. An undefaulted read - a SQL NULL, or a column the repository did not
   * populate - resolves to `false`, which is the same answer the legacy engine gave a flag it had no
   * value for. It must never resolve to `true`.
   *
   * WHAT DEPENDS ON THIS. The single legacy consumer is [model/entity/Sku.cfc:L134], inside
   * `generateImageFileName()`:
   *
   *   if(option.getOptionGroup().getImageGroupFlag()){
   *
   * The flag decides whether an option's code is appended to the generated image filename, so
   * getting the coercion wrong does not merely flip a boolean - it changes the filename a SKU
   * resolves its image by.
   *
   * Always returns a `boolean`, never the raw column value, so no caller has to repeat the coercion
   * and no caller can accidentally skip it.
   */
  getImageGroupFlag(): boolean {
    return cfBoolean(this.imageGroupFlag);
  }

  getSortOrder(): number {
    return this.sortOrder;
  }

  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // --- Overridden Collection Accessor ---------------------------------------------------------

  /**
   * The group's options, optionally re-ordered.
   *
   * This is an OVERRIDE of the collection accessor `accessors=true` would otherwise have generated,
   * and it is the one piece of real behaviour on this entity. Verified verbatim,
   * [model/entity/OptionGroup.cfc:L73-L79]:
   *
   *   public array function getOptions(orderby, sortType="text", direction="asc") {
   *       if(!structKeyExists(arguments,"orderby")) {
   *           return variables.Options;
   *       } else {
   *           return getService("hibachiUtilityService").sortObjectArray(
   *               variables.Options,arguments.orderby,arguments.sortType,arguments.direction);
   *       }
   *   }
   *
   * THE BRANCH IS ON PRESENCE, NOT ON TRUTHINESS. `orderby` is declared with no type, no default
   * and no `required` attribute for exactly one purpose: so that
   * `structKeyExists(arguments,"orderby")` can distinguish "the caller passed something" from "the
   * caller passed nothing". This port therefore tests `orderby !== undefined`. Writing
   * `if (orderby)` - or `if (orderby.length)`, or any other truthiness test - would send the EMPTY
   * STRING down the wrong branch, because `getOptions('')` passes an argument and must take the sort
   * branch, where the legacy `evaluate("....get() & '.' & rn")` raised. It must not silently behave
   * like the no-argument call.
   *
   * THE DEFAULTS ARE LOAD-BEARING and are reproduced with the exact legacy literals: `sortType`
   * defaults to `'text'` - which is CASE-SENSITIVE, as CFML `arraySort`'s `'text'` is - and
   * `direction` to `'asc'`, both declared at [model/entity/OptionGroup.cfc:L73].
   *
   * THE SORT BRANCH REPRODUCES THE LEGACY UTILITY, INCLUDING ITS DEFECTS: random tie-breaking, a
   * key collision that can drop an element, and a `numeric` mode that orders by the random tail. See
   * `sortOptionsByLegacyStructKey` for the full enumeration and the reasoning.
   *
   * SYNCHRONOUS. The body traverses an already-materialized association and performs pure
   * comparison; it reaches no port and no repository.
   *
   * Returns `Option[]` in both branches. The no-argument branch hands back the materialized
   * association ITSELF - live and mutable in content, which the folder's association/ownership
   * contract requires because the far side reaches back through it: [model/entity/Option.cfc:L95]
   * does `arrayAppend(arguments.optionGroup.getOptions(), this)` and L102-L105 does `arrayFind` then
   * `arrayDeleteAt` on the same array. The sort branch hands back a FRESH array, so ordering never
   * disturbs the association, and typing both alike means a caller never has to know which branch
   * produced its value.
   *
   * @param orderby - An `Option` property name to order by. Omit it entirely to get the association
   *   as materialized.
   * @param sortType - `'text'` (the legacy default, case-sensitive), `'textnocase'` or `'numeric'`.
   * @param direction - `'asc'` (the legacy default) or `'desc'`.
   * @throws When `orderby` names no sortable `Option` property, reproducing the legacy `evaluate()`
   *   failure at [model/service/HibachiUtilityService.cfc:L523] rather than degrading to unsorted
   *   data, and when a `'numeric'` sort meets a composed key that is not numeric, reproducing
   *   `arraySort`'s own failure at [model/service/HibachiUtilityService.cfc:L526].
   */
  getOptions(
    orderby?: string,
    sortType: OptionSortType = 'text',
    direction: OptionSortDirection = 'asc',
  ): Option[] {
    if (orderby === undefined) {
      // LEGACY-NOTE [model/entity/OptionGroup.cfc:L75]: the source reads `variables.Options` with a
      // capital `O`, while the property itself is declared `options` at L70. CFML identifiers are
      // case-insensitive so both spellings named the same variable there; TypeScript is not, so the
      // reference is normalised to the DECLARED property name. A cosmetic source artifact only -
      // there is no second collection, nothing is shadowed, and no behaviour turns on it, which is
      // why it carries no `LEGACY-DEFECT` marker.
      return this.options;
    }

    return sortOptionsByProperty(
      this.options,
      orderby,
      sortType,
      direction,
      this.optionSortTieBreaker,
    );
  }

  // OMITTED [model/entity/OptionGroup.cfc:L81-L83]: getOptionsSmartList() returned
  // getPropertySmartList(propertyName="options"). HibachiSmartList is a framework query-builder
  // artifact replaced by explicit typed repository queries (AAP 0.6.2), and a domain entity must not
  // host a dynamic query builder.
  //
  // THE LEGACY SURFACE IS CALLED, SO THE OMISSION IS DELIBERATE RATHER THAN INCIDENTAL:
  // [admin/views/entity/optiongrouptabs/options.cfm:L53] renders a listing from
  // `rc.optionGroup.getOptionsSmartList()`. That caller is admin presentation, which this port
  // excludes, so the dynamic smart-list surface is intentionally left out. TARGET callers read the
  // materialized association through `getOptions()` instead.
  //
  // "OMITTED" means this member is not authored in the TypeScript file and the reason is recorded
  // where it would have gone; it never means a legacy file was edited or deleted.

  // --- Bidirectional Helper Methods [model/entity/OptionGroup.cfc:L89-L99] --------------------
  //
  // THIS IS THE CORRECT, NON-DEFECTIVE PATTERN, and it is worth saying so explicitly because the
  // sibling entity gets it wrong. Verified verbatim, [model/entity/OptionGroup.cfc:L91-L97]:
  //
  //   // Options (one-to-many)
  //   public void function addOption(required any option) {
  //       arguments.option.setOptionGroup( this );
  //   }
  //   public void function removeOption(required any option) {
  //       arguments.option.removeOptionGroup( this );
  //   }
  //
  // `add*` delegates to the far side's `set*` and `remove*` delegates to the far side's `remove*`,
  // which is the pattern as intended. Contrast [model/entity/Option.cfc:L129-L131] and
  // [model/entity/Option.cfc:L145-L147], where `removePromotionRewardExclusion` and
  // `removePromotionQualifierExclusion` both call `addExcludedOption(this)` - so asking to remove
  // ADDS. Those are preserved defects owned by `option.ts`; this entity has none to preserve, and
  // that absence is a verified fact rather than an assumption.
  //
  // Neither helper touches `this.options`. The association is `readonly` and materialization is a
  // repository responsibility, so these methods mutate only the OTHER entity's state, through its
  // own API - which is exactly what the legacy bodies do. There is no array splicing here.
  //
  // FAR-SIDE CONTRACT ON `option.ts`, from the legacy bodies above: `Option` must expose
  // `setOptionGroup(optionGroup)` [model/entity/Option.cfc:L92-L97] and
  // `removeOptionGroup(optionGroup?)` [model/entity/Option.cfc:L98-L107]. Note the legacy
  // `removeOptionGroup` declares its argument WITHOUT `required` and falls back to
  // `variables.optionGroup` when it is absent, so its TypeScript parameter is optional - this file
  // always passes `this`, so it is compatible either way.
  //
  // NOTE ON THE FAR SIDE in `option.ts`. The legacy far side reaches back through this entity's
  // collection and MUTATES it: [model/entity/Option.cfc:L95] does
  // `arrayAppend(arguments.optionGroup.getOptions(), this)` and L102-L105 does `arrayFind` then
  // `arrayDeleteAt` on the same array. Those worked because CFML handed back the live Hibernate
  // collection by reference, and this port reproduces that: `getOptions()` with no argument returns
  // the LIVE `Option[]`, so `option.ts` ports `setOptionGroup`/`removeOptionGroup` faithfully by
  // pushing into and splicing out of it. The array is therefore mutable IN CONTENT and must stay so;
  // what it is not is REASSIGNABLE, which is what the `private readonly` field declaration pins. The
  // sorted branch deliberately hands back a fresh array so ordering can never disturb the
  // association.

  /**
   * Whether `option` is already a member of this group's materialized options.
   *
   * DECLARED BECAUSE IT IS CONCRETELY CALLED: [model/entity/Option.cfc:L94] guards its append with
   * `if(isNew() or !arguments.optionGroup.hasOption( this ))`, so without this member `option.ts`
   * cannot port `setOptionGroup` faithfully. Dispatcher patterns that no caller uses are not
   * declared at all.
   *
   * The component declares no hand-written `hasOption` body, and the framework's `onMissingMethod`
   * dispatcher [org/Hibachi/HibachiEntity.cfc:L507-L565] declares no `has<Singular>` case either -
   * it handles `hasUniqueOrNull`, `hasUnique` and `hasAny` only. It is the collection accessor the
   * CFML ORM generates for a one-to-many carrying `singularname="option"`
   * [model/entity/OptionGroup.cfc:L70], and it tests membership of that collection.
   *
   * MEMBERSHIP IS BY PRIMARY KEY. Under Hibernate the legacy `arrayFind(collection, component)`
   * [model/entity/Option.cfc:L102] compared references, but a session returned one instance per row,
   * so reference identity WAS row identity. A driver-only stack has no session and guarantees no
   * such uniqueness - `getOptions()` may hold options materialized by a different query than the
   * argument came from - so a key comparison is what preserves the legacy MEANING, and a `hasOption`
   * answering `false` for a row it already holds would make [model/entity/Option.cfc:L94]'s guard
   * append a DUPLICATE.
   *
   * WHAT THE UNSAVED BRANCH ACTUALLY DOES, STATED PLAINLY BECAUSE IT IS NOT REFERENCE-ONLY. Every
   * unsaved `Option` carries `optionID === ''`. When the candidate's key is empty, or the collection
   * holds an unsaved row, the predicate WIDENS to "same object OR same key" rather than narrowing to
   * object identity. So for an unsaved candidate, ANY unsaved member matches on the empty key, and
   * two DISTINCT unsaved options are reported as the same member. That is the behaviour; it is not
   * hidden here.
   *
   * It is reachable only by calling this method directly, and never through the one legacy caller:
   * [model/entity/Option.cfc:L94] evaluates `isNew()` first and short-circuits, so an unsaved option
   * never reaches `hasOption` on that path. When the candidate IS saved the widened predicate is
   * equivalent to the narrow one, because an empty member key cannot equal a non-empty candidate key.
   * Narrowing the unsaved case to reference identity alone would be a behaviour change to a public
   * entity member, so it is documented rather than quietly altered.
   */
  hasOption(option: Option): boolean {
    const candidateOptionID: string = option.getOptionID();

    // An empty primary key on EITHER side means at least one of the two rows has never been
    // persisted. The test then widens to "same object OR same key" - it does not narrow to object
    // identity, so unsaved members all match each other on the empty key.
    if (candidateOptionID === '' || this.optionsContainUnsavedRow()) {
      return this.options.some(
        (member) => member === option || member.getOptionID() === candidateOptionID,
      );
    }

    return this.options.some((member) => member.getOptionID() === candidateOptionID);
  }

  /**
   * Whether this group's materialized options include at least one row that has never been
   * persisted.
   *
   * Private, and it exists only to keep {@link OptionGroup.hasOption} readable. It carries no legacy
   * counterpart: the legacy membership test was `arrayFind(collection, this)`
   * [model/entity/Option.cfc:L102], which needed no key inspection at all.
   */
  private optionsContainUnsavedRow(): boolean {
    return this.options.some((member) => member.getOptionID() === '');
  }

  /**
   * Adds `option` to this group, by telling the option which group it belongs to.
   * [model/entity/OptionGroup.cfc:L92-L94]
   *
   *   public void function addOption(required any option) {
   *       arguments.option.setOptionGroup( this );
   *   }
   *
   * Pure delegation, reproduced exactly. `void` return, matching the legacy declaration.
   */
  addOption(option: Option): void {
    option.setOptionGroup(this);
  }

  /**
   * Removes `option` from this group, by telling the option to drop its group.
   * [model/entity/OptionGroup.cfc:L95-L97]
   *
   *   public void function removeOption(required any option) {
   *       arguments.option.removeOptionGroup( this );
   *   }
   *
   * Pure delegation to the far side's `remove*`, which is the correct pattern - and the one
   * [model/entity/Option.cfc:L129-L131] and [model/entity/Option.cfc:L145-L147] fail to follow.
   * `this` is passed explicitly even though the legacy far side would have fallen back to its own
   * stored group when the argument was omitted, because the legacy body passes it explicitly too.
   */
  removeOption(option: Option): void {
    option.removeOptionGroup(this);
  }

  // --- Overridden Methods [model/entity/OptionGroup.cfc:L101-L103] -----------------------------
  //
  // EMPTY in the source: the banner is present but the section contains nothing. Recorded because a
  // reviewer diffing this file against the CFC will look for it, and because an empty banner implies
  // nothing whatsoever - some sibling entities do not even carry this one.

  // --- ORM Event Hooks [model/entity/OptionGroup.cfc:L105-L107] -------------------------------
  //
  // EMPTY in the source. This entity has no `preInsert`, no `preUpdate` and no other lifecycle hook,
  // so there is no explicit path-maintenance or timestamp step for a repository to invoke on save.
  // Only Category, PriceGroup, ProductType and PromotionCode carry hooks in this port; for contrast,
  // `PriceGroup.getPriceGroupIDPath()` [model/entity/PriceGroup.cfc:L195] is maintained by exactly
  // such hooks at L206 and L211. Nothing equivalent applies here.
}
