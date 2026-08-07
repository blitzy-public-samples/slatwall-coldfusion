// slatwall-ts - the SwOptionGroup domain entity.
// Schema contract [model/entity/OptionGroup.cfc:L49]: table `SwOptionGroup`, ORM entity name `SlatwallOptionGroup`; no migration,
// no rename, no column change.
//
// A 1:1 logic extraction of model/entity/OptionGroup.cfc (109 lines), which is the sole authority
// for every behaviour reproduced below.
//
// The component's two `hb_*` attributes are carried forward as documentation rather than as
// exported constants.
//
// The legacy component extends `HibachiEntity`, and none of that chain is ported or emulated: this
// is a standalone class with no ambient scope and no service locator.

import { cfNumberToString } from '../../lib/cfml/numberFormat.js';
import { cfBoolean } from '../../lib/cfml/truthiness.js';
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import type { Option } from './option.js';

// `option.ts` <-> `optionGroup.ts` is an unavoidable mutual type cycle, and it is safe.

/**
 * The `optionCode` / `optionGroupCode` / `productCode` format constraint.
 *
 * One constant for three consumers, because the legacy regex is byte-identical at all three sites.
 *
 * All three rules read alike - a `save` context that is `required`, `unique`, and constrained by a
 * `regex` whose value is the pattern declared below.
 */
export const ENTITY_CODE_PATTERN = /^[a-zA-Z0-9-_.|:~^]+$/;

/**
 * The `sortType` argument of {@link OptionGroup.getOptions}.
 *
 * These are CFML `arraySort`'s sort types, reached through
 * [model/service/HibachiUtilityService.cfc:L526].
 *
 * Typed as a union rather than as `string`, which is a deliberate, documented narrowing of an
 * untyped legacy argument.
 */
export type OptionSortType = 'text' | 'textnocase' | 'numeric';

/**
 * The `direction` argument of {@link OptionGroup.getOptions}.
 *
 * CFML `arraySort`'s directions, `'asc'` being the legacy default declared at
 * [model/entity/OptionGroup.cfc:L73].
 */
export type OptionSortDirection = 'asc' | 'desc';

/**
 * Every SCALAR persistent property `Option` declares, in declaration order.
 *
 * These are the values an Option can be sorted by: the scalars declared at
 * [model/entity/Option.cfc:L52-L56].
 *
 * Declared `as const` so the union below has exactly one source of truth: add a name here and the
 * exhaustive switch in `readOptionSortKey` stops compiling until it is handled.
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
 * CFML method names are case-insensitive, so the legacy `evaluate("obj.get#orderby#()")` at
 * [model/service/HibachiUtilityService.cfc:L523] resolved `getoptionname()`.
 */
const SORTABLE_OPTION_PROPERTIES_BY_FOLDED_NAME: ReadonlyMap<string, SortableOptionProperty> =
  new Map(SORTABLE_OPTION_PROPERTY_NAMES.map((name) => [name.toLowerCase(), name]));

/**
 * A value read off an `Option` for the purpose of ordering.
 *
 * The three shapes Option's scalar accessors can return - `string` for the id, code, name,
 * description and remoteID columns, `number` for the `sortOrder` integer, `Date` for the two
 * timestamps.
 */
type OptionSortKey = string | number | Date | undefined;

/**
 * Resolves an arbitrary `orderby` string to the property this module can read.
 *
 * Returns the canonical property name, or `undefined` when the string names no accessor at all.
 */
function resolveSortableOptionProperty(name: string): SortableOptionProperty | undefined {
  return SORTABLE_OPTION_PROPERTIES_BY_FOLDED_NAME.get(name.toLowerCase());
}

/**
 * Reads one sort key off an `Option`, through the Option accessor the legacy utility would have
 * reached by name.
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
 * Renders a sort key exactly as CFML string concatenation would render it, so that the composed
 * struct key below is the one the legacy engine built.
 *
 * A NUMBER renders through `cfNumberToString`, which reproduces CFML's trailing-zero dropping.
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
 * [model/service/HibachiUtilityService.cfc:L521] draws `randRange(1,100)` once per element and
 * concatenates it onto the struct key, so it participates in the ordering and it decides ties.
 *
 * @returns An integer in the inclusive range 1..100, matching `randRange(1,100)`.
 */
export type OptionSortTieBreaker = () => number;

/**
 * The default tie breaker.
 *
 * Supplies an inclusive, non-cryptographic draw over 1..100, which is the range the legacy
 * tie-break draws from [model/service/HibachiUtilityService.cfc:L522].
 */
function randRangeOneToOneHundred(): number {
  return Math.floor(Math.random() * 100) + 1;
}

/**
 * Composes one legacy struct key: the rendered accessor value, a literal `.`, and the tie-breaking
 * random number.
 *
 * Verbatim from [model/service/HibachiUtilityService.cfc:L523], whose key format the source
 * comment at L518-L520 documents as `{VALUE}.{RAND NUMBER}`.
 */
function composeLegacySortKey(valueText: string, tieBreak: number): string {
  return `${valueText}.${String(tieBreak)}`;
}

/**
 * Orders the composed struct keys, exactly as `arraySort(keyArray, sorttype, direction)`
 * [model/service/HibachiUtilityService.cfc:L526] orders them.
 *
 * The whole composed key is the sort input, not the underlying value: the random suffix is inside
 * the string being compared.
 *
 * The numeric mode reads every key before it orders any of them, and that is a deliberate
 * structural choice rather than an optimisation.
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
 * Reads a composed key as the number a `numeric` sort orders it by, raising when it has no numeric
 * reading.
 *
 * A text value - `getOptions('optionName', 'numeric')` composes `"Large.42"`, which is not a
 * number. * a value that already contains a decimal point - the random suffix turns it into a
 * second one.
 */
function legacyNumericKeyValue(key: string): number {
  const numericValue = Number(key);

  if (Number.isNaN(numericValue)) {
    // LEGACY-NOTE [model/service/HibachiUtilityService.cfc:L526]: arraySort with
    // sorttype="numeric" raises on a non-numeric element; reproduced rather than degraded to a
    // text or NaN ordering.
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
 * A `Map` keyed by the UPPERCASED key text reproduces CFML's case-insensitive struct-key
 * semantics: lookup ignores case, the stored `keyText` is the first spelling seen.
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
      // LEGACY-DEFECT [model/service/HibachiUtilityService.cfc:L523]: a colliding key overwrites
      // the earlier element, so the returned array is shorter than the input.
      // Preserved deliberately; do not fix without a product decision.
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
 * An unsupported `orderby` raises, because that is what the legacy did.
 *
 * This is also why `getOptions('')` throws rather than behaving like the no-argument call: the
 * empty string is an argument.
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
    // LEGACY-NOTE [model/service/HibachiUtilityService.cfc:L523]: evaluate() raised for an
    // accessor that does not exist; the failure contract is reproduced instead of degrading to
    // unsorted data.
    //
    // The message OPENS with the legacy terminal sentence from
    // [org/Hibachi/HibachiEntity.cfc:L565] verbatim - grammatical error included.
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
 * `getOptions` is the one method that can THROW, and both throws are reproductions rather than
 * additions: an `orderby` naming no accessor raised through `evaluate()`
 * [model/service/HibachiUtilityService.cfc:L523].
 */
export class OptionGroup {
  /**
   * Primary key. [model/entity/OptionGroup.cfc:L52]
   *
   * `string` and never `string | undefined`: `default=""` means the column always holds a string,
   * possibly the empty one, and `unsavedvalue=""` makes that empty string load-bearing.
   */
  private readonly optionGroupID: string;

  /**
   * Display name of the group. [model/entity/OptionGroup.cfc:L53]
   *
   * No ORM default and no `required` attribute, so the column can hydrate as SQL NULL and this is
   * `string | undefined`.
   */
  private readonly optionGroupName: string | undefined;

  /**
   * Business code of the group. [model/entity/OptionGroup.cfc:L54]
   */
  private readonly optionGroupCode: string | undefined;

  /**
   * Image filename for the group. [model/entity/OptionGroup.cfc:L55]
   */
  private readonly optionGroupImage: string | undefined;

  /**
   * Long description. [model/entity/OptionGroup.cfc:L56]
   *
   * The declared `length="4000"` is recorded here because it is part of the schema contract; it is
   * not enforced as a runtime constraint in this class, since the legacy entity did not enforce it
   * either.
   */
  private readonly optionGroupDescription: string | undefined;

  /**
   * Whether options in this group participate in image-filename generation, as the RAW persisted
   * column value. [model/entity/OptionGroup.cfc:L57]
   *
   * Held raw and coerced on read by {@link OptionGroup.getImageGroupFlag}, rather than coerced
   * once in the constructor.
   */
  private readonly imageGroupFlag: CfBooleanInput;

  /**
   * Ordering position among option groups. [model/entity/OptionGroup.cfc:L58]
   *
   * The only `required="true"` property on this entity, so it is modelled as a required `number`
   * with no `| undefined`.
   */
  private readonly sortOrder: number;

  /**
   * External-system identifier. [model/entity/OptionGroup.cfc:L61]
   */
  private readonly remoteID: string | undefined;

  // All four declare `hb_populateEnabled="false"`, meaning the legacy framework refused to
  // populate them from request data; they are written by the persistence layer.
  //
  // The two account associations are `cfc="Account" fieldtype="many-to-one"`, and
  // model/entity/Account.cfc is explicitly out of scope for this port - the whole account module
  // is.

  /**
   * `createdDateTime`, or `undefined`. [model/entity/OptionGroup.cfc:L64]
   */
  private readonly createdDateTime: Date | undefined;

  private readonly createdByAccountID: string | undefined;

  private readonly modifiedDateTime: Date | undefined;

  private readonly modifiedByAccountID: string | undefined;

  /**
   * The materialized `options` one-to-many. [model/entity/OptionGroup.cfc:L70]
   *
   * `readonly` pins the field reference, not the collection contents, and the distinction is
   * load-bearing here.
   *
   * An EMPTY array is indistinguishable from "the repository did not fetch the association", and
   * that is an accepted consequence of not simulating laziness rather than an oversight.
   */
  private readonly options: Option[];

  /**
   * The tie-breaking random source the reproduced legacy sort draws from.
   *
   * `undefined` means "use `randRange(1,100)`", which is the legacy behaviour, so a repository
   * that states nothing gets the legacy sort.
   */
  private readonly optionSortTieBreaker: OptionSortTieBreaker;

  /**
   * Hydrates one `SwOptionGroup` row.
   *
   * A single readonly parameter object, matching the convention this folder already established:
   * an inline object type rather than a second exported interface.
   *
   * Every nullable field is a REQUIRED slot typed `T | undefined` rather than an optional `?:`
   * slot.
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

  // The set is COMPLETE with respect to the persistent properties rather than trimmed to current
  // call sites, because interface parity is judged against the property metadata.
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
   * Reads through `cfBoolean`, which is REQUIRED here and not a convenience.
   *
   * The flag decides whether an option's code is appended to the generated image filename, so
   * getting the coercion wrong does not merely flip a boolean.
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

  /**
   * @param orderby An `Option` property name to order by.
   * @param sortType `'text'` (the legacy default, case-sensitive), `'textnocase'` or `'numeric'`.
   * @param direction `'asc'` (the legacy default) or `'desc'`.
   * @throws When `orderby` names no sortable `Option` property, reproducing the legacy
   * `evaluate()` failure at [model/service/HibachiUtilityService.cfc:L523] rather than degrading
   * to unsorted data, and when a `'numeric'` sort meets a composed key that is not numeric.
   */
  getOptions(
    orderby?: string,
    sortType: OptionSortType = 'text',
    direction: OptionSortDirection = 'asc',
  ): Option[] {
    if (orderby === undefined) {
      // LEGACY-NOTE [model/entity/OptionGroup.cfc:L75]: the source reads `variables.Options` with
      // a capital `O`, while the property itself is declared `options` at L70.
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
  // getPropertySmartList(propertyName="options").
  //
  // "OMITTED" means this member is not authored in the TypeScript file and the reason is recorded
  // where it would have gone; it never means a legacy file was edited or deleted.

  // `add*` delegates to the far side's `set*` and `remove*` delegates to the far side's `remove*`,
  // which is the pattern as intended.

  /**
   * Whether `option` is already a member of this group's materialized options.
   *
   * Declared because it is concretely called: [model/entity/Option.cfc:L94] guards its append with
   * `if(isNew() or !arguments.optionGroup.hasOption( this ))`.
   *
   * The component declares no hand-written `hasOption` body, and the framework's `onMissingMethod`
   * dispatcher [org/Hibachi/HibachiEntity.cfc:L507-L565] declares no `has<Singular>` case either -
   * it handles `hasUniqueOrNull`.
   */
  hasOption(option: Option): boolean {
    const candidateOptionID: string = option.getOptionID();

    // An empty primary key on either side means at least one of the two rows has never been
    // persisted.
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
   * Private, and it exists only to keep {@link OptionGroup.hasOption} readable.
   */
  private optionsContainUnsavedRow(): boolean {
    return this.options.some((member) => member.getOptionID() === '');
  }

  /**
   * Adds `option` to this group, by telling the option which group it belongs to.
   * [model/entity/OptionGroup.cfc:L92-L94]
   */
  addOption(option: Option): void {
    option.setOptionGroup(this);
  }

  /**
   * Removes `option` from this group, by telling the option to drop its group.
   * [model/entity/OptionGroup.cfc:L95-L97]
   *
   * Pure delegation to the far side's `remove*`, which is the correct pattern - and the one
   * [model/entity/Option.cfc:L129-L131] and [model/entity/Option.cfc:L145-L147] fail to follow.
   */
  removeOption(option: Option): void {
    option.removeOptionGroup(this);
  }
}
