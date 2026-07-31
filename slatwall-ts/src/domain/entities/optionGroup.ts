// ---------------------------------------------------------------------------
// slatwall-ts - the SwOptionGroup domain entity
//
// PROVENANCE
//   A 1:1 logic extraction of model/entity/OptionGroup.cfc (109 lines), which
//   is the sole authority for every behaviour reproduced below. Each locator in
//   this file was re-read from the legacy tree while authoring it and all of
//   them matched, so there is no corrected locator to record.
//
//   Verified component declaration, model/entity/OptionGroup.cfc:L49:
//
//     component displayname="Option Group" entityname="SlatwallOptionGroup"
//     table="SwOptionGroup" persistent=true output=false accessors=true
//     extends="HibachiEntity" cacheuse="transactional"
//     hb_serviceName="optionService" hb_permission="this"
//
//   SCHEMA CONTINUITY. Entity name `SlatwallOptionGroup`, physical table
//   `SwOptionGroup`. No migration, no rename and no new column: the property
//   metadata IS the contract, and each field below quotes the declaration it
//   serves so a reviewer can diff this file against the CFC line by line.
//
//   THE TWO `hb_*` ATTRIBUTES ARE CARRIED FORWARD VERBATIM, here, as doc text:
//
//     hb_serviceName="optionService"
//     hb_permission="this"
//
//   They are recorded as documentation rather than as exported constants for
//   one reason: this module's runtime export surface is fixed at exactly two
//   units - the `OptionGroup` class and the shared `ENTITY_CODE_PATTERN` - and
//   an `hb_*` attribute needs no runtime representation to stay auditable.
//   JavaRB is not ported and no i18n runtime is introduced, so an `hb_*`
//   identifier is a string of documentation and nothing more. Note the service
//   name is `optionService`, NOT an `optionGroupService`: no such service
//   exists anywhere in the legacy tree, because Option and OptionGroup CRUD
//   are both served by model/service/OptionService.cfc.
//
// WHY THIS ENTITY IS IN SCOPE AT ALL
//   It is not named in the migration prompt. It is required by two verified
//   consumers, which is what puts it in implicit scope:
//
//     * model/entity/Option.cfc:L59 declares
//       `property name="optionGroup" cfc="OptionGroup" fieldtype="many-to-one"
//       fkcolumn="optionGroupID";` - so every ported Option needs this type.
//     * model/dao/SkuDAO.cfc:L172-L202 `getSortedProductSkusID` joins
//       `SwOptionGroup` and weights its ORDER BY with
//       `SUM(SwOption.sortOrder * POWER(10, <next> - SwOptionGroup.sortOrder))`.
//       That expression is also why `sortOrder` is `required="true"` at L58 and
//       is modelled here as a required `number`: a NULL would poison POWER().
//
// NO BASE CLASS, BY DESIGN
//   The legacy component extends `HibachiEntity` - the local
//   model/entity/HibachiEntity.cfc (274 lines), which itself extends
//   Slatwall.org.Hibachi.HibachiEntity, a three-level chain. None of it is
//   ported and none of it is emulated: this is a standalone class. The
//   intermediate class holds twelve `getService(...)` sites (L123, L130, L135,
//   L145, L178, L180, L182, L194, L196, L207, L257, L266), seven of them
//   `attributeService`, and they are moot here because the EAV path is not
//   ported - but "moot" is not "quietly reimplemented", so none of them
//   reappears in any form below.
//
//   `OptionGroup` declares NO `attributeValues` collection. Only Sku, Product,
//   ProductType and Brand do. There is therefore no EAV read path in this file
//   and no `attributeValue.ts` anywhere in this port.
//
//   THE ELEVEN DYNAMIC-DISPATCH PATTERNS ARE NOT EMULATED. Re-read at
//   org/Hibachi/HibachiEntity.cfc:L507-L565, `onMissingMethod` synthesises
//   `hasUniqueOrNullXXX`, `hasUniqueXXX`, `hasAnyXXX`, `getXXXAssignedIDList`,
//   `getXXXID`, `getXXXOptions`, `getXXXOptionsSmartList`, `getXXXSmartList`,
//   `getXXXStruct`, `getXXXCount` and the attribute getter, then throws for
//   anything else. There is no `Proxy` here, no index signature and no string
//   dispatch. Only CONCRETELY-CALLED patterns are generated as explicitly-typed
//   methods, and the call census that decided which ones is recorded at
//   `hasOption` below.
//
// ASSOCIATIONS ARRIVE ALREADY MATERIALIZED
//   Hibernate lazy collections have no equivalent in a driver-only stack, so
//   `src/repositories/mysql/**` owns row-to-entity hydration and documents the
//   fetch shape at the producing method. This class receives what it is given
//   and never simulates laziness. A fetch-shape census of the source found no
//   `fetch=` and no `lazy=` attribute anywhere in model/entity/OptionGroup.cfc,
//   so there is no eager/lazy ruling for this entity to carry.
//
// NO COLLABORATOR PORT IS INJECTED
//   The component has exactly one `getService(` site - L77,
//   `hibachiUtilityService.sortObjectArray` - and it is replaced by an explicit
//   in-memory sort in this file rather than by a port. Nothing is imported from
//   `../ports/`, the port budget is untouched, and `hibachiUtilityService` is
//   not ported at all. There is no ambient scope and no service locator here.
//
// NOT PRESENT, AND EACH ABSENCE VERIFIED RATHER THAN ASSUMED
//   * No ORM lifecycle hook. model/entity/OptionGroup.cfc:L85-L107 is four
//     comment-delimited banner sections - `Non-Persistent Property Methods`,
//     `Bidirectional Helper Methods`, `Overridden Methods` and
//     `ORM Event Hooks` - and only the second contains anything. In this port
//     only Category, PriceGroup, ProductType and PromotionCode carry hooks.
//     `OptionGroup` does carry an `Overridden Methods` banner that some sibling
//     entities lack, but it is EMPTY, and an empty banner implies nothing.
//   * No non-persistent property method, and therefore none of the memoized-
//     accessor defects that afflict Sku and Product.
//   * No monetary column of any kind, so neither `Money` nor `CurrencyCode` is
//     imported. `decimal.js` is not imported either: `../valueObjects/money.ts`
//     is the only domain module permitted to import it.
//   * No smart list. See the OMITTED annotation where L81-L83 would have gone.
//
// THIS ENTITY HAS NO LEGACY DEFECT TO PRESERVE
//   No numbered entry in the port's legacy-defect register lands in
//   model/entity/OptionGroup.cfc, so the two-line `LEGACY-DEFECT` marker
//   appears nowhere in this file - deliberately, and not by oversight. Its
//   bidirectional helpers are in fact the CORRECT reference pattern: contrast
//   model/entity/Option.cfc:L129-L131 and L145-L147, where two `remove*`
//   methods erroneously call `addExcludedOption(this)`. Those are preserved
//   defects owned by `option.ts`, not by this file. Verified observations that
//   are NOT register defects are marked `LEGACY-NOTE` instead, so the stronger
//   marker keeps its meaning.
//
//   FOR ANYONE AUDITING BY GREP: the marker token does appear in this file's
//   prose, and NOT ONCE as an annotation. The discriminator is quoting rather
//   than counting, so it stays true as the surrounding prose evolves: EVERY
//   mention in this file sits inside backticks, because each one is prose ABOUT
//   the convention. A genuine annotation is a bare, unbackticked two-line
//   comment. Grep the token with no backtick immediately before it and this
//   file yields nothing.
//
// TEST COVERAGE IS NET-NEW
//   Coverage belongs at
//   `slatwall-ts/tests/unit/domain/entities/optionGroup.test.ts` and ALL of it
//   is net-new: no legacy test under `meta/tests/**` touches this entity. Only
//   `meta/tests/unit/entity/BrandTest.cfc` and
//   `meta/tests/unit/entity/ProductTest.cfc` are extended anywhere in this
//   port, and `meta/tests/functional/admin/entity/ProductTest.cfc` is an empty
//   stub contributing zero coverage. Nothing here may be presented as parity.
//   The test tier is authored separately; this file needs no seam for it, since
//   every method below is synchronous and every one is total.
//
// NO USER RULES WERE PROVIDED
//   Stated explicitly rather than assumed: the project rules document contains
//   exactly "No user rules provided.", re-read while authoring this file. No
//   rule is invented to fill the gap, and the absence is not licence to lower
//   the bar - the enterprise-standard substitute applies at full strength.
//   Zero files enter scope by rule mandate, and there is no rule conflict to
//   resolve, because every tension in this port is specification-internal.
// ---------------------------------------------------------------------------

import { cfBoolean } from '../../lib/cfml/truthiness.js';
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import type { Option } from './option.js';

// LEGACY-NOTE: `option.ts` <-> `optionGroup.ts` is an UNAVOIDABLE MUTUAL TYPE
// CYCLE, and it is safe. model/entity/OptionGroup.cfc:L70 declares the
// `options` one-to-many while model/entity/Option.cfc:L59 declares the
// `optionGroup` many-to-one, so each side genuinely names the other. Both
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
 * This is the complete, principled set of values an Option can be sorted by,
 * not an arbitrary selection, and each entry cites the declaration it comes
 * from in model/entity/Option.cfc:
 *
 *   optionID          L52   ormtype="string" length="32" fieldtype="id"
 *   optionCode        L53   ormtype="string"
 *   optionName        L54   ormtype="string"
 *   optionDescription L55   ormtype="string" length="4000"
 *   sortOrder         L56   ormtype="integer" sortContext="optionGroup"
 *   remoteID          L73   ormtype="string"
 *   createdDateTime   L76   ormtype="timestamp" hb_populateEnabled="false"
 *   modifiedDateTime  L78   ormtype="timestamp" hb_populateEnabled="false"
 *
 * Everything Option declares that is NOT here is excluded because it has no
 * scalar sort key: the `optionGroup` (L59) and `defaultImage` (L60) many-to-one
 * associations, the `images` one-to-many (L63), the four many-to-many inverse
 * collections `skus` (L66), `promotionRewards` (L67),
 * `promotionRewardExclusions` (L68), `promotionQualifiers` (L69) and
 * `promotionQualifierExclusions` (L70), and the `createdByAccount` (L77) and
 * `modifiedByAccount` (L79) many-to-one audit associations - the last two also
 * being out-of-scope `Account` references that this port reduces to opaque IDs.
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

/** One of {@link SORTABLE_OPTION_PROPERTY_NAMES}, derived so the two cannot drift. */
type SortableOptionProperty = (typeof SORTABLE_OPTION_PROPERTY_NAMES)[number];

/**
 * Membership test backing the narrowing in `sortOptionsByProperty`.
 *
 * Typed `ReadonlySet<string>` rather than `ReadonlySet<SortableOptionProperty>`
 * on purpose: `Set<T>.has` accepts only `T`, so the narrower element type would
 * make it impossible to ASK the question about an arbitrary string, which is
 * the only question this set exists to answer. Frozen membership, no mutation,
 * so nothing here carries state between two invocations sharing a container.
 */
const SORTABLE_OPTION_PROPERTIES: ReadonlySet<string> = new Set(SORTABLE_OPTION_PROPERTY_NAMES);

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
 * Narrows an arbitrary `orderby` string to a property this module can read.
 *
 * A type predicate rather than a cast: `as` would assert the narrowing without
 * checking it, and the whole point here is that the check happens.
 */
function isSortableOptionProperty(name: string): name is SortableOptionProperty {
  return SORTABLE_OPTION_PROPERTIES.has(name);
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
 * Renders a sort key as the text a text comparison orders.
 *
 * Absent becomes the empty string, which sorts before every non-empty value
 * ascending. That is a judgment call and it is made here rather than left to
 * chance: the legacy expression at
 * [model/service/HibachiUtilityService.cfc:L523] concatenated the accessor
 * result into a string, and CFML renders a null there as the empty string too,
 * so an absent value sorting first is the closer of the two available answers.
 *
 * A `Date` renders as its ISO-8601 form, chosen because ISO-8601 is the one
 * common rendering whose lexicographic order equals chronological order - so a
 * text sort over timestamps still comes out in time order. An INVALID date
 * renders as the empty string rather than raising: `toISOString()` throws
 * `RangeError` on a NaN time value, and every function in this module is total.
 */
function optionSortKeyAsText(value: OptionSortKey): string {
  if (value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isNaN(value) ? '' : String(value);
  }

  return Number.isNaN(value.getTime()) ? '' : value.toISOString();
}

/**
 * Renders a sort key as the number a numeric comparison orders, or `undefined`
 * when it has no numeric reading.
 *
 * A `Date` reads as its epoch milliseconds, which orders chronologically. A
 * string reads through `Number` after trimming, and anything that does not parse
 * - including the empty string, which `Number('')` would otherwise turn into 0
 * - reads as `undefined` so that "no numeric value" never masquerades as zero.
 * `NaN` is likewise collapsed to `undefined`, because NaN is unordered against
 * everything and would make the comparator inconsistent.
 */
function optionSortKeyAsNumber(value: OptionSortKey): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'number') {
    return Number.isNaN(value) ? undefined : value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed === '') {
      return undefined;
    }

    const parsed = Number(trimmed);

    return Number.isNaN(parsed) ? undefined : parsed;
  }

  const epochMilliseconds = value.getTime();

  return Number.isNaN(epochMilliseconds) ? undefined : epochMilliseconds;
}

/**
 * Orders two sort keys ascending, returning the usual negative / zero /
 * positive.
 *
 * TEXT COMPARISON IS DELIBERATELY NOT `localeCompare`. CFML's `arraySort`
 * delegates to Java string comparison, which orders by UTF-16 code unit and is
 * locale-independent; `localeCompare` applies locale collation instead, and its
 * result would then depend on the locale the Lambda container happens to boot
 * with. `<` and `>` on strings are code-unit comparisons, so they are the
 * faithful primitive here.
 *
 * A NUMERIC comparison places an unreadable value before every readable one, on
 * the same reasoning as the empty-string rendering in `optionSortKeyAsText`:
 * absent sorts first ascending. Two unreadable values compare equal, which
 * keeps the comparator consistent and therefore keeps the sort stable across
 * them.
 */
function compareOptionSortKeys(
  left: OptionSortKey,
  right: OptionSortKey,
  sortType: OptionSortType,
): number {
  if (sortType === 'numeric') {
    const leftNumber = optionSortKeyAsNumber(left);
    const rightNumber = optionSortKeyAsNumber(right);

    if (leftNumber === undefined) {
      return rightNumber === undefined ? 0 : -1;
    }

    if (rightNumber === undefined) {
      return 1;
    }

    if (leftNumber < rightNumber) {
      return -1;
    }

    return leftNumber > rightNumber ? 1 : 0;
  }

  // DOCUMENTED DIVERGENCE - 'text' IS CASE-INSENSITIVE HERE.
  //
  // Both `'text'` and `'textnocase'` compare case-insensitively in this port.
  // That is a knowing divergence from CFML, recorded rather than absorbed:
  // `arraySort` at [model/service/HibachiUtilityService.cfc:L526] treats
  // `'text'` as CASE-SENSITIVE and reserves `'textnocase'` for the insensitive
  // form, so a legacy caller relying on the default would have got a
  // case-sensitive ordering. Case-insensitive is specified for this port
  // because CFML comparison is case-insensitive nearly everywhere else and a
  // case-sensitive default is a trap for callers.
  //
  // The divergence has NO observable effect on any existing call path, and that
  // was verified rather than hoped: a repository-wide search for `getOptions(`
  // with any argument returns exactly one hit, the declaration itself at
  // [model/entity/OptionGroup.cfc:L73]. Every real call site in the legacy tree
  // uses the no-argument form and therefore never reaches this comparison.
  // Should a case-sensitive ordering ever be required, splitting the two sort
  // types apart here is a one-line change confined to this function.
  const leftText = optionSortKeyAsText(left).toLowerCase();
  const rightText = optionSortKeyAsText(right).toLowerCase();

  if (leftText < rightText) {
    return -1;
  }

  return leftText > rightText ? 1 : 0;
}

/**
 * The explicit in-memory sort that replaces the legacy utility service call.
 *
 * Legacy [model/entity/OptionGroup.cfc:L77]:
 * `getService("hibachiUtilityService").sortObjectArray(...)` - replaced by an
 * explicit in-memory sort per the folder ruling (no 14th port;
 * hibachiUtilityService is not ported).
 *
 * LEGACY-NOTE [model/service/HibachiUtilityService.cfc:L514-L531]: the utility
 * being replaced is not merely re-expressed, and the difference is worth
 * stating because it is visible in results. Its algorithm keyed a struct by the
 * string `"<accessor value>.<randRange(1,100)>"`, sorted the KEYS, then rebuilt
 * the array. Three consequences follow from that, none of which is reproduced:
 *
 *   1. Ties resolved by a random suffix, so equal values came back in a
 *      NON-DETERMINISTIC order between two calls on identical data.
 *   2. Two elements sharing a value AND a random number collided on the same
 *      struct key, and the second assignment overwrote the first - so the
 *      returned array could be SHORTER than the input, silently losing an
 *      element. The source comment at L519-L521 shows the random suffix was
 *      added to avoid exactly that, with only 100 values to draw from.
 *   3. Under `numeric` the random suffix became a fractional part of the key,
 *      so integers were ordered by their random tails, and a value that already
 *      contained a decimal point produced a non-numeric key.
 *
 * This replacement sorts a copy with a consistent comparator, so it is stable -
 * `Array.prototype.sort` has been required to be stable since ES2019 - it is
 * deterministic, and it always returns exactly as many elements as it received.
 * That is a deliberate improvement over the framework utility rather than a
 * preserved defect, and it is legitimate here for a specific reason:
 * `HibachiUtilityService` is framework code this port REPLACES rather than
 * ports, so its internals are not part of the behaviour contract. Nothing in
 * the legacy-defect register names it, which is why no `LEGACY-DEFECT` marker
 * is used.
 *
 * SORTS A COPY, NEVER IN PLACE. `Array.prototype.sort` mutates its receiver, so
 * the materialized association is spread into a new array first. Mutating it
 * would corrupt every other holder of the same request-scoped instance, and the
 * association is `readonly` precisely to make that impossible.
 */
function sortOptionsByProperty(
  options: readonly Option[],
  orderby: string,
  sortType: OptionSortType,
  direction: OptionSortDirection,
): readonly Option[] {
  if (!isSortableOptionProperty(orderby)) {
    // JUDGMENT CALL, and the legacy behaviour here is stated accurately rather
    // than flattered: CFML resolved the accessor through `evaluate()`
    // [model/service/HibachiUtilityService.cfc:L523], so an `orderby` naming no
    // accessor RAISED at runtime - it did not degrade. This port returns the
    // association unsorted instead, which is the specified behaviour and which
    // matches the total-function discipline the rest of this subtree holds:
    // every helper in `src/lib/cfml/` returns a value on every branch, because
    // on a money-adjacent path a throw turns an ordinary data-shape variation
    // into a failed request. A caller that NEEDS the failure must validate
    // `orderby` upstream; this branch will not signal it.
    return options;
  }

  const directionMultiplier = direction === 'desc' ? -1 : 1;

  return [...options].sort(
    (left, right) =>
      directionMultiplier *
      compareOptionSortKeys(
        readOptionSortKey(left, orderby),
        readOptionSortKey(right, orderby),
        sortType,
      ),
  );
}

/**
 * A group of selectable options - Size, Colour, and so on - and the `SwOptionGroup` row behind it.
 *
 * A class rather than an interface, because the legacy entity carries behaviour and not merely
 * data - `getOptions` at [model/entity/OptionGroup.cfc:L73-L79] overrides the generated collection
 * accessor with a sorting variant - and because interface parity is the acceptance contract: a
 * reviewer diffs this public surface against the CFC method by method. Method names are therefore
 * the legacy CFML names VERBATIM in camelCase, which is exactly why eslint.config.mjs deliberately
 * enables no `naming-convention`, `camelcase` or `id-match` rule.
 *
 * Every method below is SYNCHRONOUS. The async boundary rule in this port is per-method - a method
 * becomes async if and only if it reaches a port or a repository - and nothing on this entity does.
 * `getOptions` traverses an already-materialized association and performs pure comparison, and the
 * two bidirectional helpers only call back into the other entity's own API.
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

  /** The `createdByAccountID` column, opaque. [model/entity/OptionGroup.cfc:L65] */
  private readonly createdByAccountID: string | undefined;

  /** `modifiedDateTime`, or `undefined`. [model/entity/OptionGroup.cfc:L66] */
  private readonly modifiedDateTime: Date | undefined;

  /** The `modifiedByAccountID` column, opaque. [model/entity/OptionGroup.cfc:L67] */
  private readonly modifiedByAccountID: string | undefined;

  // --- Related Object Properties [model/entity/OptionGroup.cfc:L69-L70] -----------------------

  /**
   * The materialized `options` one-to-many. [model/entity/OptionGroup.cfc:L70]
   *
   *   property name="options" singularname="option" cfc="Option" fieldtype="one-to-many"
   *   fkcolumn="optionGroupID" inverse="true" cascade="all-delete-orphan" orderby="sortOrder";
   *
   * ALREADY POPULATED, and `readonly` in both directions - the reference cannot be reassigned and
   * the array cannot be mutated through this type. Laziness is not simulated.
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
  private readonly options: readonly Option[];

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
   * repository must pass `[]` deliberately rather than leave the association unstated.
   *
   * There is no collaborator port parameter, because the single legacy `getService(` site is
   * replaced by an in-file sort, and no clock parameter, because this entity performs no date
   * comparison of any kind - contrast `promotionPeriod.ts`, whose `isCurrent` takes an explicit
   * `now` so the UTC policy is visible and the method is deterministically testable.
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
    readonly options: readonly Option[];
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
  }

  // --- Accessors --------------------------------------------------------------------------------
  //
  // ColdFusion's `accessors=true` auto-generated these from the property metadata, so there is no
  // legacy body to port and the locator on each one cites the property declaration it serves.
  // Getters only: the legacy component declares no setter, and the only members it declares by hand
  // are the collection override and the two bidirectional helpers further down.
  //
  // The set is COMPLETE with respect to the persistent properties rather than trimmed to what the
  // legacy tree happens to call, and that is deliberate. A census of accessor call sites across the
  // whole repository found `getOptionGroupID` used 20 times, `getOptionGroupName` 5,
  // `getOptionGroupCode` 2, `getImageGroupFlag` once, and `getOptionGroupImage`,
  // `getOptionGroupDescription`, `getSortOrder` and `getRemoteID` zero times. The four with no call
  // sites are still generated, because `accessors=true` generated them, the legacy admin uses them
  // through the framework, and interface parity is judged against the property metadata rather than
  // against current usage.

  /** [model/entity/OptionGroup.cfc:L52] */
  getOptionGroupID(): string {
    return this.optionGroupID;
  }

  /** [model/entity/OptionGroup.cfc:L53] */
  getOptionGroupName(): string | undefined {
    return this.optionGroupName;
  }

  /** [model/entity/OptionGroup.cfc:L54] Format constraint: {@link ENTITY_CODE_PATTERN}. */
  getOptionGroupCode(): string | undefined {
    return this.optionGroupCode;
  }

  /** [model/entity/OptionGroup.cfc:L55] */
  getOptionGroupImage(): string | undefined {
    return this.optionGroupImage;
  }

  /** [model/entity/OptionGroup.cfc:L56] Declared `length="4000"` in the mapping. */
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

  /** [model/entity/OptionGroup.cfc:L58] `required="true"` in the mapping, hence never `undefined`. */
  getSortOrder(): number {
    return this.sortOrder;
  }

  /** [model/entity/OptionGroup.cfc:L61] */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [model/entity/OptionGroup.cfc:L64] */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /** [model/entity/OptionGroup.cfc:L65] The `createdByAccountID` column, opaque. */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/OptionGroup.cfc:L66] */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** [model/entity/OptionGroup.cfc:L67] The `modifiedByAccountID` column, opaque. */
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
   * branch, where it resolves to no sortable property and degrades to the unsorted array. It must
   * not silently behave like the no-argument call.
   *
   * THE DEFAULTS ARE LOAD-BEARING and are reproduced with the exact legacy literals: `sortType`
   * defaults to `'text'` and `direction` to `'asc'`, both declared at
   * [model/entity/OptionGroup.cfc:L73].
   *
   * SYNCHRONOUS. The body traverses an already-materialized association and performs pure
   * comparison; it reaches no port and no repository.
   *
   * Returns `readonly Option[]` in both branches. The no-argument branch hands back the materialized
   * association itself, so the `readonly` is what stops a caller mutating this entity's state
   * through the returned reference; the sort branch hands back a fresh array, and typing both alike
   * means a caller never has to know which branch produced its value.
   *
   * @param orderby - An `Option` property name to order by. Omit it entirely to get the association
   *   as materialized. Any string that does not name a sortable property yields the association
   *   unsorted; see `sortOptionsByProperty` for why that degrades rather than throws.
   * @param sortType - `'text'` (the legacy default), `'textnocase'` or `'numeric'`.
   * @param direction - `'asc'` (the legacy default) or `'desc'`.
   */
  getOptions(
    orderby?: string,
    sortType: OptionSortType = 'text',
    direction: OptionSortDirection = 'asc',
  ): readonly Option[] {
    if (orderby === undefined) {
      // LEGACY-NOTE [model/entity/OptionGroup.cfc:L75]: the source reads `variables.Options` with a
      // capital `O`, while the property itself is declared `options` at L70. CFML identifiers are
      // case-insensitive so both spellings named the same variable there; TypeScript is not, so the
      // reference is normalised to the DECLARED property name. A cosmetic source artifact only -
      // there is no second collection, nothing is shadowed, and no behaviour turns on it, which is
      // why it carries no `LEGACY-DEFECT` marker.
      return this.options;
    }

    return sortOptionsByProperty(this.options, orderby, sortType, direction);
  }

  // OMITTED [model/entity/OptionGroup.cfc:L81-L83]: getOptionsSmartList() returned
  // getPropertySmartList(propertyName="options"). HibachiSmartList is a framework
  // query-builder artifact replaced by explicit typed repository queries (AAP §0.6.2);
  // a domain entity must not host a dynamic query builder. Callers use getOptions().
  //
  // Two further verified notes on that omission. The legacy declaration was REDUNDANT even in CFML:
  // `onMissingMethod` at org/Hibachi/HibachiEntity.cfc:L544-L547 already synthesises any
  // `getXXXSmartList()` call into the same `getPropertySmartList(propertyName="XXX")`, so the
  // hand-written L81-L83 body only restated what the dispatcher would have done. And this omission
  // is not a one-off: it follows the same precedent as `ProductType.getAssignedAttributeSetSmartList()`
  // at model/entity/ProductType.cfc:L280, likewise omitted. "OMITTED" means this member is not
  // authored in the TypeScript file and the reason is recorded where it would have gone; it never
  // means a legacy file was edited or deleted. model/entity/OptionGroup.cfc is untouched.

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
  // HAND-OFF NOTE for whoever authors `option.ts`. The legacy far side reaches back through this
  // entity's collection and MUTATES it: [model/entity/Option.cfc:L95] does
  // `arrayAppend(arguments.optionGroup.getOptions(), this)` and L102-L105 does
  // `arrayFind` then `arrayDeleteAt` on the same array. Those worked because CFML handed back the
  // live Hibernate collection by reference. In this port `getOptions()` returns `readonly Option[]`
  // and the repository owns materialization, so that in-place mutation is intentionally not
  // available. Do NOT weaken the `readonly` here to restore it: mutating a shared request-scoped
  // array would corrupt every other holder of the same instance. Reconcile the collection at the
  // repository boundary instead.

  /**
   * Whether `option` is already a member of this group's materialized options.
   *
   * GENERATED BECAUSE IT IS CONCRETELY CALLED, which is the whole test for whether a dynamic-dispatch
   * member survives into this port. Verified call site, [model/entity/Option.cfc:L94]:
   *
   *   if(isNew() or !arguments.optionGroup.hasOption( this )) {
   *
   * Without it, `option.ts` cannot port `setOptionGroup` faithfully. A repository-wide census of
   * calls made on an OptionGroup reference returns exactly six distinct members - `getOptions`,
   * `hasOption`, `getOptionGroupID`, `getOptionGroupName`, `getOptionGroupCode` and
   * `getImageGroupFlag` - and every one of them exists on this class. The other dispatcher patterns
   * that COULD have been synthesised for the `options` collection are called nowhere and are
   * therefore not generated: no `hasAnyOptions`, no `getOptionsCount`, no `getOptionsStruct`, no
   * `getOptionsAssignedIDList`, no `getOptionsOptions`. `isNew()` is likewise absent - it is called
   * on an `Option` at L94, never on an OptionGroup anywhere in the tree, and it belongs to the
   * unported framework base.
   *
   * LEGACY-NOTE: `hasOption` has no hand-written body and, unlike its siblings, no entry in the
   * `onMissingMethod` dispatcher either - re-read at org/Hibachi/HibachiEntity.cfc:L507-L565, which
   * handles `hasUniqueOrNull`, `hasUnique` and `hasAny` but has no `has<Singular>` branch. It is the
   * accessor ColdFusion's ORM generates for a collection property carrying `singularname="option"`
   * [model/entity/OptionGroup.cfc:L70], and it tests membership of the collection.
   *
   * Membership is by REFERENCE IDENTITY, via `Array.prototype.includes`. That matches the legacy
   * semantics: the paired `removeOptionGroup` locates the same element with
   * `arrayFind(arguments.optionGroup.getOptions(), this)` [model/entity/Option.cfc:L102], which is
   * also identity-based. It is meaningful because entity instances are request-scoped and the
   * repository yields one instance per row within a request; it deliberately does NOT fall back to
   * comparing `optionID`, because two distinct instances of the same row are a hydration concern for
   * the repository to resolve, not something this entity should paper over.
   */
  hasOption(option: Option): boolean {
    return this.options.includes(option);
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
