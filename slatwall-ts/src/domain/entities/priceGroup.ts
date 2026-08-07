// slatwall-ts - the PriceGroup entity.
//
// LEGACY-NOTE [model/entity/PriceGroup.cfc:L49]: this component declaration omits
// hb_parentPropertyName, even though the entity is self-referential through parentPriceGroup (L59)
// and both lifecycle hooks call buildIDPathList("parentPriceGroup") (L207, L212).

// ZERO `getService(` sites in the whole component. It is the only materialized-path entity here
// with no outward reach at all, so it injects no port and every method on this class is
// synchronous.
// no `@ts-ignore`, no `@ts-expect-error` and no `!` assertion. Where the

import { buildIdPathList, resolveIdPath } from '../valueObjects/materializedIdPath.js';
import { cfEquals } from '../../lib/cfml/struct.js';
import { cfBoolean, cfLen, isNullish } from '../../lib/cfml/truthiness.js';
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import type { PriceGroupRate } from './priceGroupRate.js';
import type { PromotionReward } from './promotionReward.js';

/**
 * One `{name, value}` row of the parent-price-group option list.
 * [model/entity/PriceGroup.cfc:L79, L94-L103]
 *
 * That prepended blank row is why the source tests `len(...)` first.
 */
type ParentPriceGroupOption = {
  /**
   * Display text. Resource-bundle output for the prepended blank row.
   */
  readonly name: string;
  /**
   * The `priceGroupID`, or `''` for the prepended null option.
   */
  readonly value: string;
};

/**
 * A price group: a named, hierarchical grouping of accounts and subscription benefits that carries
 * a set of rates used to derive a SKU's price.
 */
export class PriceGroup {
  /**
   * The primary key. [model/entity/PriceGroup.cfc:L52]
   *
   * Comparison basis for a Hibernate collection membership test is session identity, which is the
   * primary key, so `hasChildPriceGroup`, `hasPriceGroupRate`, `hasPromotionReward` and the
   * `arrayFind` equivalent in `removeParentPriceGroup` all compare this value.
   *
   * `unsavedvalue=""` together with `default=""` is also the unsaved signal that `isNew()` reads;
   * see that method.
   */
  private readonly priceGroupID: string;

  /**
   * The materialized comma-delimited ancestor path, root first and self last.
   * [model/entity/PriceGroup.cfc:L53]
   *
   * The `length="4000"` limit is a persistence constraint recorded here for schema continuity.
   */
  private priceGroupIDPath: string | undefined;

  /**
   * Whether this price group is active. [model/entity/PriceGroup.cfc:L54]
   *
   * Stored as {@link CfBooleanInput} rather than `boolean` and read through `cfBoolean()` in its
   * accessor, because the column declares no `default=`.
   */
  private readonly activeFlag: CfBooleanInput;

  /**
   * The display name. [model/entity/PriceGroup.cfc:L55]
   */
  private readonly priceGroupName: string | undefined;

  /**
   * The business code. [model/entity/PriceGroup.cfc:L56]
   *
   * No `unique="true"`, no regex and no length constraint is declared, so none is added: not a
   * format check, not a uniqueness check, nothing.
   */
  private readonly priceGroupCode: string | undefined;

  /**
   * The parent price group in the hierarchy, or `undefined` at a root.
   * [model/entity/PriceGroup.cfc:L59]
   *
   * The KEY is inert here in one specific sense only: no i18n runtime is introduced to resolve it.
   */
  private parentPriceGroup: PriceGroup | undefined;

  // Hibernate lazy collections have no equivalent in a driver-only stack, so each collection below
  // arrives already populated and the fetch shape is an explicit.
  //
  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L62, L128-L133]: appliedOrderItems is a one-to-many
  // onto the OUT-OF-SCOPE OrderItem aggregate (fkcolumn appliedPriceGroupID).

  /**
   * The materialized child price groups. [model/entity/PriceGroup.cfc:L63]
   *
   * The FIELD is `readonly`, so the reference can never be reassigned; only the contents move.
   *
   * `cascade` is absent from this declaration - note the contrast with `priceGroupRates` below,
   * and with the `cascade="all"` on [model/entity/ProductType.cfc:L65].
   */
  private readonly childPriceGroups: PriceGroup[];

  /**
   * The materialized rates that belong to this price group. [model/entity/PriceGroup.cfc:L64]
   *
   * This is the collection `getGlobalPriceGroupRate()` searches, and it is the most-read member of
   * this entity anywhere in the legacy tree.
   *
   * `cascade="all-delete-orphan"` is a persistence instruction with no representation in this
   * class.
   */
  private readonly priceGroupRates: PriceGroupRate[];

  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L66]: the banner reads "// Related Object Properties
  // (many-to-many - invers)" - "invers", missing the trailing "e". Comment-only source wart;
  // recorded, not corrected.
  //
  // The framework would also have synthesised `hasAccount`, `hasSubscriptionBenefit` and
  // `hasSubscriptionUsageBenefit` on this class.
  //
  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L168, L171]: both usage-benefit helpers name their
  // argument `subsciptionUsageBenefit`, missing the `r`. Quoted rather than corrected, because a
  // CFML named argument is part of the calling contract.

  /**
   * The materialized promotion rewards for which this price group is eligible.
   * [model/entity/PriceGroup.cfc:L70]
   *
   * The inverse side of `PromotionReward.eligiblePriceGroups`
   * [model/entity/PromotionReward.cfc:L74], which is the owning side.
   */
  private readonly promotionRewards: PromotionReward[];

  // The two Account many-to-ones become opaque fk ID columns: schema continuity with no Account
  // behaviour ported, and no nineteenth entity file created to hold an Account.

  /**
   * `createdDateTime`, or `undefined`. [model/entity/PriceGroup.cfc:L73]
   *
   * Written by the inherited lifecycle step - `super.preInsert()` at
   * [org/Hibachi/HibachiEntity.cfc:L598] stamps it - which this port relocates to the repository
   * on save.
   */
  private readonly createdDateTime: Date | undefined;

  /**
   * The `createdByAccountID` column, opaque. [model/entity/PriceGroup.cfc:L74]
   */
  private readonly createdByAccountID: string | undefined;

  /**
   * `modifiedDateTime`, or `undefined`. [model/entity/PriceGroup.cfc:L75]
   */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * The `modifiedByAccountID` column, opaque. [model/entity/PriceGroup.cfc:L76]
   */
  private readonly modifiedByAccountID: string | undefined;

  // Two consequences follow, and both are recorded because they change how the port must be built.
  //
  // Unlike model/entity/ProductType.cfc:L89, which declares `type="array" persistent="false"`,
  // this declaration omits `type="array"`.

  /**
   * The candidate rows the parent-price-group option list is filtered from, materialized at the
   * repository boundary. Backs {@link PriceGroup.getParentPriceGroupOptions}.
   *
   * This field stands in for `getPropertyOptions("parentPriceGroup")` and for nothing else.
   */
  private readonly parentPriceGroupOptionCandidates: readonly ParentPriceGroupOption[];

  /**
   * The memo for {@link PriceGroup.getParentPriceGroupOptions}.
   *
   * Present because the legacy is effectively memoized, per consequence (1) on the L79 note above:
   * repeated legacy calls return the same array identity.
   *
   * Mutable, and the only mutable non-association field on this class other than
   * `parentPriceGroup` / `priceGroupIDPath`.
   */
  private parentPriceGroupOptions: readonly ParentPriceGroupOption[] | undefined;

  /**
   * Hydrates one `SwPriceGroup` row.
   *
   * Every nullable field is a REQUIRED slot typed `T | undefined` rather than an optional `?:`
   * slot.
   *
   * The two `parent`/`child` sides are hydrated independently and this constructor performs no
   * reconciliation between them - it does not append `this` to its parent's `childPriceGroups`.
   */
  constructor(init: {
    readonly priceGroupID: string;
    readonly priceGroupIDPath: string | undefined;
    readonly activeFlag: CfBooleanInput;
    readonly priceGroupName: string | undefined;
    readonly priceGroupCode: string | undefined;
    readonly parentPriceGroup: PriceGroup | undefined;
    readonly childPriceGroups: PriceGroup[];
    readonly priceGroupRates: PriceGroupRate[];
    readonly promotionRewards: PromotionReward[];
    readonly parentPriceGroupOptionCandidates?: readonly ParentPriceGroupOption[] | undefined;
    readonly createdDateTime: Date | undefined;
    readonly createdByAccountID: string | undefined;
    readonly modifiedDateTime: Date | undefined;
    readonly modifiedByAccountID: string | undefined;
  }) {
    this.priceGroupID = init.priceGroupID;
    this.priceGroupIDPath = init.priceGroupIDPath;
    this.activeFlag = init.activeFlag;
    this.priceGroupName = init.priceGroupName;
    this.priceGroupCode = init.priceGroupCode;
    this.parentPriceGroup = init.parentPriceGroup;
    this.childPriceGroups = init.childPriceGroups;
    this.priceGroupRates = init.priceGroupRates;
    this.promotionRewards = init.promotionRewards;

    // [model/entity/PriceGroup.cfc:L95] Defaults to empty rather than `undefined`: the accessor is
    // TOTAL and an empty candidate list is the same answer the legacy smart list gave when it
    // matched nothing.
    this.parentPriceGroupOptionCandidates = init.parentPriceGroupOptionCandidates ?? [];

    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
  }

  // ColdFusion's `accessors=true` [model/entity/PriceGroup.cfc:L49] auto-generated these from the
  // property metadata.
  getPriceGroupID(): string {
    return this.priceGroupID;
  }

  /**
   * Whether this price group is active. [model/entity/PriceGroup.cfc:L54]
   *
   * Reads through `cfBoolean`, which is REQUIRED here rather than a convenience, because the
   * column declares no `default=` at all.
   */
  getActiveFlag(): boolean {
    return cfBoolean(this.activeFlag);
  }

  /**
   * [model/entity/PriceGroup.cfc:L55] Read at PriceGroupRate.cfc:L275 and
   * PriceGroupService.cfc:L249.
   */
  getPriceGroupName(): string | undefined {
    return this.priceGroupName;
  }

  /**
   * [model/entity/PriceGroup.cfc:L56] No format, length or uniqueness constraint is declared.
   */
  getPriceGroupCode(): string | undefined {
    return this.priceGroupCode;
  }

  /**
   * [model/entity/PriceGroup.cfc:L59] `undefined` at a hierarchy root; see the field.
   */
  getParentPriceGroup(): PriceGroup | undefined {
    return this.parentPriceGroup;
  }

  /**
   * The LIVE array of child price groups. [model/entity/PriceGroup.cfc:L63]
   *
   * Returns the in-memory array itself, not a copy, because it is a mutation target:
   * `setParentPriceGroup` appends to it and `removeParentPriceGroup` splices from it, exactly as
   * [model/entity/PriceGroup.cfc:L113].
   *
   * Also read - without mutation - at [model/service/PriceGroupService.cfc:L463], inside
   * `deletePriceGroup`.
   */
  getChildPriceGroups(): PriceGroup[] {
    return this.childPriceGroups;
  }

  /**
   * The LIVE array of rates. [model/entity/PriceGroup.cfc:L64]
   *
   * The most-read member of this entity in the legacy tree, at 24 call sites.
   */
  getPriceGroupRates(): PriceGroupRate[] {
    return this.priceGroupRates;
  }

  /**
   * The LIVE array of promotion rewards eligible to this price group.
   * [model/entity/PriceGroup.cfc:L70]
   */
  getPromotionRewards(): PromotionReward[] {
    return this.promotionRewards;
  }
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * [model/entity/PriceGroup.cfc:L74] `hb_populateEnabled="false"`; opaque Account FK.
   */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * [model/entity/PriceGroup.cfc:L76] `hb_populateEnabled="false"`; opaque Account FK.
   */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L82-L90]: two cosmetic properties of this region,
  // recorded once.

  // Loop over all Price Group Rates and pull the one that is global.
  /**
   * The rate on this price group that carries `globalFlag`, or `undefined` when there is none.
   * [model/entity/PriceGroup.cfc:L82-L90]
   *
   * LEGACY-NOTE [model/entity/PriceGroup.cfc:L85-L88]: if MORE than one rate carries globalFlag,
   * the legacy loop returns the FIRST in collection order, and the legacy query applies no ORDER
   * by.
   */
  getGlobalPriceGroupRate(): PriceGroupRate | undefined {
    return this.priceGroupRates.find((rate) => rate.getGlobalFlag());
  }
  /**
   * The parent-price-group option list, with this price group's own record removed.
   * [model/entity/PriceGroup.cfc:L94-L103]
   *
   * The filter is reproduced exactly, and every clause matters: * `cfLen(value)` first,
   * short-circuiting.
   *
   * Source splices the array in PLACE, and that array is the framework cache
   * `variables["parentPriceGroupOptions"]` (see the L79 note).
   */
  getParentPriceGroupOptions(): readonly ParentPriceGroupOption[] {
    // [model/entity/PriceGroup.cfc:L95] The legacy memo lives in the framework accessor; here it
    // is explicit. Assigned exactly once, so the array identity is stable across calls.
    if (this.parentPriceGroupOptions !== undefined) {
      return this.parentPriceGroupOptions;
    }

    // [model/entity/PriceGroup.cfc:L96-L101] The 1-based `for` loop with a delete-then-break.
    const options: ParentPriceGroupOption[] = [];
    let removed = false;

    for (const option of this.parentPriceGroupOptionCandidates) {
      // [model/entity/PriceGroup.cfc:L97]
      // `len(options[i]['value']) && options[i]['value'] == getPriceGroupID()`.
      //
      // With `===`, a stored option value spelled in another case than the entity's own identifier
      // column failed to match, this price group was left in its own parent-option list.
      if (!removed && cfLen(option.value) > 0 && cfEquals(option.value, this.priceGroupID)) {
        // [model/entity/PriceGroup.cfc:L98-L99] `arrayDeleteAt(options, i); break;` - skip this
        // row and stop testing. `removed` reproduces the `break` without abandoning the copy.
        removed = true;
        continue;
      }

      options.push(option);
    }

    this.parentPriceGroupOptions = options;

    // [model/entity/PriceGroup.cfc:L102] `return options;`
    return this.parentPriceGroupOptions;
  }

  // Two deliberate contrasts with its sibling model/entity/ProductType.cfc:L122-L142 are worth
  // recording, because they run in opposite directions: (1) memoization is present in both, but at
  // different levels.

  // `model/entity/PriceGroup.cfc:L49` declares `extends="HibachiEntity"` UNQUALIFIED, which
  // resolves to `model/entity/HibachiEntity.cfc` (274 lines).
  //
  // `org/Hibachi/HibachiEntity.cfc:L507-L565` is an `onMissingMethod` dispatcher that resolves
  // ELEVEN method-name patterns at runtime - re-counted branch by branch.

  /**
   * Whether this price group has never been persisted. [org/Hibachi/HibachiEntity.cfc:L707-L709]
   *
   * Generated because it is concretely called on a price group.
   *
   * LEGACY-NOTE [org/Hibachi/HibachiEntity.cfc:L707-L709]: `isNew()` lives inside the framework
   * base's "Deprecated Methods" banner block and is a thin alias for `getNewFlag()`.
   */
  isNew(): boolean {
    return this.priceGroupID === '';
  }

  /**
   * Whether `childPriceGroup` is already a member of this group's materialized children.
   * [org/Hibachi/HibachiEntity.cfc:L507-L565]
   *
   * LEGACY-NOTE [org/Hibachi/HibachiEntity.cfc:L507-L565]: this member has no hand-written body
   * and no branch in that dispatcher either - re-read, it handles `hasUniqueOrNull`, `hasUnique`
   * and `hasAny` but has no `has<Singular>` branch.
   */
  hasChildPriceGroup(childPriceGroup: PriceGroup): boolean {
    const candidatePriceGroupID = childPriceGroup.getPriceGroupID();

    return this.childPriceGroups.some((child) => child.getPriceGroupID() === candidatePriceGroupID);
  }

  /**
   * Whether `priceGroupRate` is already a member of this group's materialized rates.
   * [org/Hibachi/HibachiEntity.cfc:L507-L565]
   *
   * That caller is `PriceGroupRate.setPriceGroup`, and `PriceGroupRate` is in scope, so without
   * this member `priceGroupRate.ts` could not port its bidirectional helper faithfully.
   */
  hasPriceGroupRate(priceGroupRate: PriceGroupRate): boolean {
    const candidatePriceGroupRateID = priceGroupRate.getPriceGroupRateID();

    return this.priceGroupRates.some(
      (rate) => rate.getPriceGroupRateID() === candidatePriceGroupRateID,
    );
  }

  /**
   * Whether `promotionReward` is already a member of this group's materialized eligible-reward
   * collection. [org/Hibachi/HibachiEntity.cfc:L507-L565]
   *
   * `PromotionReward` is in scope, so the same reasoning applies as for `hasPriceGroupRate`:
   * omitting this member would leave `promotionReward.ts` unable to port `addEligiblePriceGroup`.
   */
  hasPromotionReward(promotionReward: PromotionReward): boolean {
    const candidatePromotionRewardID = promotionReward.getPromotionRewardID();

    return this.promotionRewards.some(
      (reward) => reward.getPromotionRewardID() === candidatePromotionRewardID,
    );
  }

  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L107-L183]: MANDATORY "remove-that-ADDs" inversion
  // cross-check performed across all EIGHT remove* bidirectional helpers in this component (L116,
  // L131, L139, L147, L155, L163, L171, L179).
  //
  // That verdict was re-verified locator by locator against the source before being reproduced.

  /**
   * Sets this price group's parent and keeps the parent's child collection in step.
   * [model/entity/PriceGroup.cfc:L110-L115]
   *
   * Structurally identical to [model/entity/ProductType.cfc:L149-L153] and
   * [model/entity/Category.cfc:L101-L105], and the established precedents are applied verbatim
   * rather than re-derived.
   *
   * Both halves of the disjunct are preserved, in order and with CFML's short-circuit semantics,
   * which JavaScript's `||` reproduces exactly.
   */
  setParentPriceGroup(parentPriceGroup: PriceGroup): void {
    // CFML parity [model/entity/PriceGroup.cfc:L110-L115]: the legacy body validates nothing
    // before assigning, and neither does this one. A cyclic parent chain is accepted here exactly
    // as it is accepted there.
    this.parentPriceGroup = parentPriceGroup;

    if (this.isNew() || !parentPriceGroup.hasChildPriceGroup(this)) {
      parentPriceGroup.getChildPriceGroups().push(this);
    }
  }

  /**
   * Detaches this price group from a parent, removing it from that parent's child collection and
   * clearing its own reference. [model/entity/PriceGroup.cfc:L116-L125]
   *
   * LEGACY-NOTE [model/entity/PriceGroup.cfc:L116-L122]: when the argument is omitted and this
   * price group has no stored parent, the legacy body assigns null into
   * `arguments.parentPriceGroup` at L118 and then invokes `.getChildPriceGroups()` on it at L120 -
   * a method call on null.
   */
  removeParentPriceGroup(parentPriceGroup?: PriceGroup): void {
    const targetParentPriceGroup =
      parentPriceGroup !== undefined ? parentPriceGroup : this.parentPriceGroup;

    if (targetParentPriceGroup === undefined) {
      throw new Error(
        'PriceGroup.removeParentPriceGroup was called with no argument on a price group that has ' +
          'no parentPriceGroup. This reproduces the legacy runtime failure at ' +
          'model/entity/PriceGroup.cfc:L118-L120, where the omitted argument defaults to a null ' +
          'parent and getChildPriceGroups() is then invoked on it.',
      );
    }

    // Row identity is decided by {@link isSameRow} - the key for a stored group, the instance for
    // an unsaved one.
    const siblingPriceGroups = targetParentPriceGroup.getChildPriceGroups();
    const index = siblingPriceGroups.findIndex((child) =>
      isSameRow(child.getPriceGroupID(), this.priceGroupID, child, this),
    );

    if (index !== -1) {
      siblingPriceGroups.splice(index, 1);
    }

    this.parentPriceGroup = undefined;
  }

  /**
   * Adds a child price group, by telling the child which parent it belongs to.
   * [model/entity/PriceGroup.cfc:L136-L138]
   */
  addChildPriceGroup(childPriceGroup: PriceGroup): void {
    childPriceGroup.setParentPriceGroup(this);
  }

  /**
   * Removes a child price group, by telling the child to drop its parent.
   * [model/entity/PriceGroup.cfc:L139-L141]
   *
   * Pure delegation to the far side's `remove*`, which is the correct pattern - and the one
   * [model/entity/Option.cfc:L129-L131] and [model/entity/Option.cfc:L145-L147] fail to follow.
   */
  removeChildPriceGroup(childPriceGroup: PriceGroup): void {
    childPriceGroup.removeParentPriceGroup(this);
  }

  /**
   * Adds a rate to this price group, by telling the rate which group it belongs to.
   * [model/entity/PriceGroup.cfc:L144-L146]
   */
  addPriceGroupRate(priceGroupRate: PriceGroupRate): void {
    priceGroupRate.setPriceGroup(this);
  }

  /**
   * Removes a rate from this price group, by telling the rate to drop its group.
   * [model/entity/PriceGroup.cfc:L147-L149]
   */
  removePriceGroupRate(priceGroupRate: PriceGroupRate): void {
    priceGroupRate.removePriceGroup(this);
  }

  /**
   * Marks this price group eligible for a promotion reward, from the inverse side.
   * [model/entity/PriceGroup.cfc:L176-L178]
   *
   * Note the asymmetric member names, preserved verbatim: the owning side's collection is
   * `eligiblePriceGroups` [model/entity/PromotionReward.cfc:L74], not `priceGroups`.
   */
  addPromotionReward(promotionReward: PromotionReward): void {
    promotionReward.addEligiblePriceGroup(this);
  }

  /**
   * Removes this price group's eligibility for a promotion reward, from the inverse side.
   * [model/entity/PriceGroup.cfc:L179-L181]
   *
   * Pure delegation to the far side's `remove*`, correctly, and again to the asymmetrically-named
   * member.
   */
  removePromotionReward(promotionReward: PromotionReward): void {
    promotionReward.removeEligiblePriceGroup(this);
  }

  // LEGACY-NOTE [model/entity/PriceGroup.cfc:L193, L202]: both banner comments delimiting this
  // section read "Overridden Implecet Getters" - "Implecet", for "Implicit".
  //
  // The materialized path has two independent routes, and both exist here.
  //
  // Route a, immediately below: the lazy memoized getter at
  // [model/entity/PriceGroup.cfc:L195-L200].

  /**
   * This price group's materialized ancestor path, computed and memoized on first read.
   * [model/entity/PriceGroup.cfc:L195-L200]
   *
   * LEGACY-NOTE [model/entity/PriceGroup.cfc:L195]: this accessor has ZERO call sites in the
   * legacy tree outside its own declaration - re-verified by searching for both the method name
   * and the property name across model/, admin/.
   */
  getPriceGroupIDPath(): string {
    const resolvedPriceGroupIDPath = resolveIdPath(this.priceGroupIDPath, () =>
      this.buildPriceGroupIDPathList(),
    );

    // Memoize exactly as L197 does - on the absent branch only.
    if (isNullish(this.priceGroupIDPath)) {
      this.priceGroupIDPath = resolvedPriceGroupIDPath;
    }

    return resolvedPriceGroupIDPath;
  }

  // Per the port's transformation rule for the ORM, the two persistence lifecycle hooks below
  // become explicit maintenance methods that the repository invokes on save.
  //
  // What the SUPER CALL did, so the ordering obligation is actionable rather than abstract.

  /**
   * Recomputes and stores the materialized ancestor path ahead of an INSERT.
   * [model/entity/PriceGroup.cfc:L206-L209]
   *
   * The legacy name is kept so the correspondence is unmistakable, but this is not an ORM hook: it
   * is a maintenance step the repository calls explicitly before it writes the row.
   *
   * Differs per entity in the source and is preserved differing.
   */
  preInsert(): void {
    this.priceGroupIDPath = this.buildPriceGroupIDPathList();
  }

  /**
   * Recomputes and stores the materialized ancestor path ahead of an UPDATE.
   * [model/entity/PriceGroup.cfc:L211-L214]
   *
   * `oldData` mirrors the legacy `struct oldData` parameter and is optional, because the legacy
   * declaration carries no `required`.
   *
   * Typed as a readonly bag of unknown-valued columns rather than a `PriceGroup`: the legacy
   * `oldData` is the raw pre-update property struct the ORM hands the hook, not a hydrated entity.
   */
  preUpdate(oldData?: Readonly<Record<string, unknown>>): void {
    this.priceGroupIDPath = this.buildPriceGroupIDPathList();
  }

  /**
   * Walks this price group's parent chain and builds the comma-delimited path.
   *
   * PRIVATE, because it is not part of the legacy public surface: it stands for the
   * `buildIDPathList( "parentPriceGroup" )` calls at [model/entity/PriceGroup.cfc:L197],
   * [model/entity/PriceGroup.cfc:L207] and [model/entity/PriceGroup.cfc:L212].
   */
  private buildPriceGroupIDPathList(): string {
    return buildIdPathList<PriceGroup>(
      this,
      (node) => node.getPriceGroupID(),
      (node) => node.getParentPriceGroup(),
    );
  }
}

/**
 * Whether two entity instances are the same ROW, by the rule Hibernate's session identity actually
 * followed - which is not the same rule as "their primary keys are equal".
 *
 * @param heldKey the primary key of the member already in the collection.
 * @param candidateKey the primary key of the member being sought.
 * @param heldInstance the collection member itself.
 * @param candidateInstance the sought member itself.
 * @returns whether the two refer to the same row.
 */
function isSameRow(
  heldKey: string,
  candidateKey: string,
  heldInstance: object,
  candidateInstance: object,
): boolean {
  if (heldKey === '' || candidateKey === '') {
    return heldInstance === candidateInstance;
  }

  return heldKey === candidateKey;
}

// These record what other modules must provide for this file to compile and behave, and what they
// must not do.
//
// For whoever authors the MySQL repository that hydrates a PriceGroup: * Call `preInsert()` before
// the validate-and-stamp step on insert, and `preUpdate(oldData)` before it on update.
