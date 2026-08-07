// slatwall-ts - the SwOption domain entity.
// Schema contract [model/entity/Option.cfc:L49]: table `SwOption`, ORM entity name `SlatwallOption`; no
// migration, no rename, no column change.
//
// A 1:1 logic extraction of model/entity/Option.cfc (160 lines), which is the sole authority for
// every behaviour reproduced below.
//
// Neither attribute is normalised, and the second is the one a reader is likely to normalise by
// accident.

import type { OptionGroup } from './optionGroup.js';
import type { PromotionQualifier } from './promotionQualifier.js';
import type { PromotionReward } from './promotionReward.js';
import type { Sku } from './sku.js';

// LEGACY-NOTE [model/entity/Option.cfc:L59, L66-L70] - far-side contract for the four sibling
// entity modules imported above.
//
// The four mutual type cycles are unavoidable and all four are safe.

/**
 * The anti-corruption projection of one `SwImage` row owned by this option.
 * [model/entity/Option.cfc:L63]
 *
 * `src/domain/entities/brand.ts`, which names five out-of-scope far sides the same way, and by
 * `src/domain/entities/category.ts` for its `contents` many-to-many.
 */
interface OptionImageLink {
  /**
   * The `SwImage.imageID` primary key. [model/entity/Image.cfc:L52]
   */
  getImageID(): string;
  /**
   * The stored filename. [model/entity/Image.cfc:L55]
   */
  getImageFile(): string | undefined;
  /**
   * The per-row directory column. [model/entity/Image.cfc:L56]
   */
  getDirectory(): string | undefined;
}

/**
 * One selectable option - Small, Large, Red, Blue - and the `SwOption` row behind it.
 *
 * {@link Option.removeOptionGroup} raises when called with no argument on an option that has no
 * group.
 *
 * Contrast `promotionAccount.ts`, whose `setPromotion` is a throwing stub because the legacy body
 * calls a collection accessor that does not resolve.
 */
export class Option {
  /**
   * Primary key. [model/entity/Option.cfc:L52]
   *
   * `string` and never `string | undefined`: `default=""` means the column always holds a string,
   * possibly the empty one, and `unsavedvalue=""` makes that empty string load-bearing.
   *
   * The declared `length="32"` is recorded because it is part of the schema contract; it is not
   * enforced as a runtime constraint here, because the legacy entity did not enforce it either.
   */
  private readonly optionID: string;

  /**
   * Business code of the option. [model/entity/Option.cfc:L53]
   *
   * All three halves of that rule are enforced OUTSIDE this class and each in the layer that can
   * actually enforce it: `required` and the format constraint by the ported zod schema at the
   * service tier.
   *
   * The format constraint is the shared `ENTITY_CODE_PATTERN` declared in `./optionGroup.ts`, and
   * it is referenced by name here rather than reproduced.
   */
  private readonly optionCode: string | undefined;

  /**
   * Display name of the option. [model/entity/Option.cfc:L54]
   *
   * `string | undefined` for the same reason as `optionCode`: no ORM default, no `required`
   * attribute, so the column can hydrate as SQL NULL.
   *
   * Validation [model/validation/Option.json:L4]: `[{"contexts":"save","required":true}]` -
   * required on WRITE only, enforced at the service tier.
   */
  private readonly optionName: string | undefined;

  /**
   * Long description of the option. [model/entity/Option.cfc:L55]
   *
   * This column has zero accessor call sites in the legacy tree beyond the framework's own
   * generated admin surface, and it is still exposed below - `accessors=true` generated a getter
   * for it.
   */
  private readonly optionDescription: string | undefined;

  /**
   * Ordering position of this option within its owning option group. [model/entity/Option.cfc:L56]
   *
   * `sortContext="optionGroup"` is the point of this field and it is preserved as inert metadata.
   *
   * LEGACY-NOTE [model/dao/SkuDAO.cfc:L192-L197]: that asymmetry has a consequence worth
   * recording, because it is invisible from this file alone.
   */
  private readonly sortOrder: number | undefined;

  /**
   * The owning option group. [model/entity/Option.cfc:L59]
   *
   * `exactOptionalPropertyTypes` is enabled, and under it an optional property cannot be ASSIGNED
   * `undefined` explicitly - only omitted at construction.
   *
   * No `fetch="join"` on the legacy declaration, so this association is lazy in the legacy mapping
   * and the port draws no eager-load conclusion from it.
   */
  private optionGroup: OptionGroup | undefined;

  /**
   * The `defaultImageID` foreign-key column, preserved INERT. [model/entity/Option.cfc:L60]
   *
   * This is exactly the precedent set by `Category.cmsCategoryID` and `Category.site`, whose Mura
   * CMS bridge is likewise unported: the column is preserved so the schema contract is unbroken.
   */
  private readonly defaultImageID: string | undefined;

  /**
   * The materialized `images` one-to-many. [model/entity/Option.cfc:L63]
   *
   * The earlier note was RIGHT that a permanently-empty `readonly []` would state something false,
   * reading as "this option has no images" when the truth is "images are not modelled here".
   *
   * Note that `defaultImage` (L60) and `images` (L63) remain INDEPENDENT declarations over two
   * different columns.
   */
  private readonly images: readonly OptionImageLink[];

  /**
   * The already-resolved assets image base URL, materialized at the repository boundary. Backs
   * {@link Option.getImageDirectory}.
   *
   * So the WHOLE of `getURLFromPath(setting('globalAssetsImageFolderPath'))` is resolved OUTSIDE
   * the domain and handed in already in URL form.
   *
   * OPTIONAL, because an unpopulated value is a REAL hydration state rather than an error - a
   * repository reading `SwOption` for the promotion engine has no reason to resolve an assets
   * path.
   */
  private readonly assetsImageBaseUrl: string | undefined;

  // Five collections, and this entity is the inverse side of every one.
  //
  // Each is an already-populated array and laziness is not simulated.
  //
  // LEGACY-NOTE [model/entity/Option.cfc:L63, L66-L70]: a metadata inconsistency, recorded and
  // deliberately not "fixed".

  /**
   * The materialized `skus` many-to-many. [model/entity/Option.cfc:L66]
   *
   * `SwSkuOption` is OWNED by `Sku`, not by this entity: [model/entity/Sku.cfc:L76] declares the
   * same link table with `fkcolumn="skuID" inversejoincolumn="optionID"` and no `inverse`
   * attribute.
   */
  private readonly skus: readonly Sku[];

  /**
   * The materialized `promotionRewards` many-to-many - the INCLUSION side.
   * [model/entity/Option.cfc:L67]
   */
  private readonly promotionRewards: PromotionReward[];

  /**
   * The materialized `promotionRewardExclusions` many-to-many - the EXCLUSION side.
   * [model/entity/Option.cfc:L68]
   *
   * A different link table from `promotionRewards` - `SwPromoRewardExclOption`, owned by
   * [model/entity/PromotionReward.cfc:L87] as `excludedOptions`.
   */
  private readonly promotionRewardExclusions: PromotionReward[];

  /**
   * The materialized `promotionQualifiers` many-to-many - the INCLUSION side.
   * [model/entity/Option.cfc:L69]
   */
  private readonly promotionQualifiers: PromotionQualifier[];

  /**
   * The materialized `promotionQualifierExclusions` many-to-many - the EXCLUSION side.
   * [model/entity/Option.cfc:L70]
   */
  private readonly promotionQualifierExclusions: PromotionQualifier[];

  /**
   * External-system identifier. [model/entity/Option.cfc:L73]
   */
  private readonly remoteID: string | undefined;

  // All four declare `hb_populateEnabled="false"`, meaning the legacy framework refused to
  // populate them from request data; they are written by the persistence layer.
  //
  // The two account associations are `cfc="Account" fieldtype="many-to-one"`, and
  // model/entity/Account.cfc is explicitly out of scope - the whole account module is.

  /**
   * `createdDateTime`, or `undefined`. [model/entity/Option.cfc:L76]
   */
  private readonly createdDateTime: Date | undefined;

  /**
   * The `createdByAccountID` column, opaque. [model/entity/Option.cfc:L77]
   */
  private readonly createdByAccountID: string | undefined;

  /**
   * `modifiedDateTime`, or `undefined`. [model/entity/Option.cfc:L78]
   */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * The `modifiedByAccountID` column, opaque. [model/entity/Option.cfc:L79]
   */
  private readonly modifiedByAccountID: string | undefined;

  /**
   * Hydrates one `SwOption` row.
   *
   * A single readonly parameter object, matching the convention this folder already established:
   * an inline object type rather than a second exported interface.
   */
  constructor(init: {
    readonly optionID: string;
    readonly optionCode: string | undefined;
    readonly optionName: string | undefined;
    readonly optionDescription: string | undefined;
    readonly sortOrder: number | undefined;
    readonly optionGroup: OptionGroup | undefined;
    readonly defaultImageID: string | undefined;
    readonly remoteID: string | undefined;
    readonly createdDateTime: Date | undefined;
    readonly createdByAccountID: string | undefined;
    readonly modifiedDateTime: Date | undefined;
    readonly modifiedByAccountID: string | undefined;
    readonly images?: readonly OptionImageLink[] | undefined;
    readonly assetsImageBaseUrl?: string | undefined;
    readonly skus?: readonly Sku[] | undefined;
    readonly promotionRewards?: PromotionReward[] | undefined;
    readonly promotionRewardExclusions?: PromotionReward[] | undefined;
    readonly promotionQualifiers?: PromotionQualifier[] | undefined;
    readonly promotionQualifierExclusions?: PromotionQualifier[] | undefined;
  }) {
    this.optionID = init.optionID;
    this.optionCode = init.optionCode;
    this.optionName = init.optionName;
    this.optionDescription = init.optionDescription;
    this.sortOrder = init.sortOrder;
    this.optionGroup = init.optionGroup;
    this.defaultImageID = init.defaultImageID;
    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;

    // [model/entity/Option.cfc:L63] An unpopulated one-to-many read as an empty array under
    // Hibernate and never as null, so `[]` is the parity-correct default.
    this.images = init.images ?? [];

    // [model/entity/Option.cfc:L81-L83] Left `undefined` when unresolved rather than defaulted to
    // `''`, because `''` would make `getImageDirectory()` return the plausible-looking but wrong
    // `'/option/'`.
    this.assetsImageBaseUrl = init.assetsImageBaseUrl;

    this.skus = init.skus ?? [];
    this.promotionRewards = init.promotionRewards ?? [];
    this.promotionRewardExclusions = init.promotionRewardExclusions ?? [];
    this.promotionQualifiers = init.promotionQualifiers ?? [];
    this.promotionQualifierExclusions = init.promotionQualifierExclusions ?? [];
  }

  // ColdFusion's `accessors=true` [model/entity/Option.cfc:L49] auto-generated every one of these
  // from the property metadata.
  //
  // The set is COMPLETE with respect to the persistent properties rather than trimmed to what the
  // legacy tree happens to call, and that is deliberate for two reasons.
  getOptionID(): string {
    return this.optionID;
  }

  /**
   * [model/entity/Option.cfc:L53] Format constraint: the shared `ENTITY_CODE_PATTERN` declared in
   * `./optionGroup.ts`, enforced at the service tier and not here.
   */
  getOptionCode(): string | undefined {
    return this.optionCode;
  }
  getOptionName(): string | undefined {
    return this.optionName;
  }

  /**
   * [model/entity/Option.cfc:L55] Declared `length="4000"` and `hb_formFieldType="wysiwyg"` in the
   * mapping; both are inert metadata and neither is enforced or interpreted here.
   */
  getOptionDescription(): string | undefined {
    return this.optionDescription;
  }

  /**
   * [model/entity/Option.cfc:L56] Scoped by `sortContext="optionGroup"`, so this ordinal is
   * comparable only against other options in the same group. Nullable, unlike
   * [model/entity/OptionGroup.cfc:L58].
   */
  getSortOrder(): number | undefined {
    return this.sortOrder;
  }

  /**
   * `OptionGroup | undefined` rather than `OptionGroup`, because the field is genuinely clearable
   * see the `structDelete` at [model/entity/Option.cfc:L106].
   */
  getOptionGroup(): OptionGroup | undefined {
    return this.optionGroup;
  }

  /**
   * The inert `defaultImageID` foreign-key column. [model/entity/Option.cfc:L60]
   *
   * Returns the raw opaque id and never an entity: `Image` is out of scope and is not ported, so
   * there is nothing to resolve this id against inside the domain.
   */
  getDefaultImageID(): string | undefined {
    return this.defaultImageID;
  }

  /**
   * The materialized `skus` association. [model/entity/Option.cfc:L66]
   *
   * The array is handed back as materialized: this accessor never sorts, filters or copies,
   * because the legacy generated accessor did none of those either.
   */
  getSkus(): readonly Sku[] {
    return this.skus;
  }

  /**
   * The materialized `promotionRewards` association - the INCLUSION side.
   * [model/entity/Option.cfc:L67]
   */
  getPromotionRewards(): PromotionReward[] {
    return this.promotionRewards;
  }

  /**
   * The materialized `promotionRewardExclusions` association - the EXCLUSION side.
   * [model/entity/Option.cfc:L68]
   *
   * LIVE: [model/entity/PromotionReward.cfc:L323] appends and
   * [model/entity/PromotionReward.cfc:L331-L333] removes through this accessor.
   */
  getPromotionRewardExclusions(): PromotionReward[] {
    return this.promotionRewardExclusions;
  }

  /**
   * The materialized `promotionQualifiers` association - the INCLUSION side.
   * [model/entity/Option.cfc:L69]
   *
   * LIVE: `PromotionQualifier.addOption` / `removeOption` append and remove through this accessor,
   * mirroring the `PromotionReward` pair exactly.
   */
  getPromotionQualifiers(): PromotionQualifier[] {
    return this.promotionQualifiers;
  }

  /**
   * The materialized `promotionQualifierExclusions` association - the EXCLUSION side.
   * [model/entity/Option.cfc:L70]
   *
   * LIVE: `PromotionQualifier.addExcludedOption` / `removeExcludedOption` append and remove
   * through this accessor.
   */
  getPromotionQualifierExclusions(): PromotionQualifier[] {
    return this.promotionQualifierExclusions;
  }
  getRemoteID(): string | undefined {
    return this.remoteID;
  }
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * [model/entity/Option.cfc:L77] The `createdByAccountID` column, opaque.
   */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * [model/entity/Option.cfc:L79] The `modifiedByAccountID` column, opaque.
   */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  /**
   * The materialized `images` one-to-many, projected across `SwImage.optionID`.
   * [model/entity/Option.cfc:L63]
   *
   * `accessors=true` on [model/entity/Option.cfc:L49] generated this in CFML, so the name and the
   * array-returning shape are the source's and not this port's.
   *
   * An empty result is a fetch-shape statement, not a domain claim, exactly as for the five
   * collections below it.
   */
  getImages(): readonly OptionImageLink[] {
    return this.images;
  }

  /**
   * The default directory that this option's images live in. [model/entity/Option.cfc:L81-L83]
   *
   * Note this is not the legacy reproducing a source failure - `setting()` always resolved in
   * CFML, so this branch has no legacy counterpart.
   */
  getImageDirectory(): string {
    if (this.assetsImageBaseUrl === undefined) {
      throw new Error(
        'Option.getImageDirectory was called on an option hydrated without an assets image base ' +
          'URL. The legacy body at model/entity/Option.cfc:L81-L83 resolved its base through ' +
          "getURLFromPath(setting('globalAssetsImageFolderPath')), and both of those calls are " +
          'outside the domain in this port, so the resolved base must be supplied at construction. ' +
          'No default is substituted because every candidate value would be a well-formed wrong ' +
          'path rather than a detectable marker.',
      );
    }

    // [model/entity/Option.cfc:L82] verbatim: `<base> & '/option/'`. The separator is
    // unconditional in the source and stays unconditional here - see the doc block on the
    // doubling.
    return `${this.assetsImageBaseUrl}/option/`;
  }

  // Twelve methods, six pairs, and they are not all the same shape.
  //
  // Every one is `void` and every one is synchronous, matching the legacy declarations exactly.
  //
  // The disjunct cannot be dropped from those guards instead, because it is load-bearing: it makes
  // the append UNCONDITIONAL for an unsaved option.

  // Option Group (many-to-one) [model/entity/Option.cfc:L91]

  // [model/entity/Option.cfc:L94-L96] appends this option to the owning group's array under a
  // guard, and [model/entity/Option.cfc:L102-L105] removes it again.
  //
  // `OptionGroup.hasOption` and in `removeOptionGroup` below, and it is the same basis
  // `priceGroup.ts`, `promotionCode.ts`, `promotionApplied.ts` and `promotionPeriod.ts` use.

  /**
   * Points this option at its owning group. [model/entity/Option.cfc:L92-L97]
   *
   * LOAD-BEARING in both DIRECTIONS: [model/entity/OptionGroup.cfc:L92-L94] `addOption` delegates
   * straight into this method, so it is the only way the far side can establish the link.
   *
   * Both STATEMENTS are REPRODUCED, in the source's order: the near-side assignment at L93 runs
   * FIRST and unconditionally, then the guarded append at L94-L96.
   */
  setOptionGroup(optionGroup: OptionGroup): void {
    // [model/entity/Option.cfc:L93] - before the guard, always.
    this.optionGroup = optionGroup;

    // [model/entity/Option.cfc:L94-L96] - the guarded append onto the owning group's LIVE array.
    if (this.isNew() || !optionGroup.hasOption(this)) {
      optionGroup.getOptions().push(this);
    }
  }

  /**
   * Clears this option's owning group. [model/entity/Option.cfc:L98-L107]
   *
   * LOAD-BEARING: [model/entity/OptionGroup.cfc:L95-L97] `removeOption` delegates straight into
   * it, passing `this` explicitly.
   *
   * @param optionGroup The group to unlink from.
   * @throws Error when the argument is omitted and this option has no group set, reproducing the
   * null dereference at [model/entity/Option.cfc:L102].
   */
  removeOptionGroup(optionGroup?: OptionGroup): void {
    const resolvedOptionGroup: OptionGroup | undefined =
      optionGroup !== undefined ? optionGroup : this.optionGroup;

    if (resolvedOptionGroup === undefined) {
      throw new Error(
        'Option.removeOptionGroup was called with no argument on an option that has no ' +
          'optionGroup. This reproduces the legacy runtime failure at ' +
          'model/entity/Option.cfc:L99-L102, where the omitted argument defaults to a null group ' +
          'and getOptions() is then invoked on it before any index guard runs.',
      );
    }

    // [model/entity/Option.cfc:L102] array index base change: CFML `arrayFind` returns a 1-BASED
    // index, or 0 for "not found", which is why the source guards with `index > 0` at L103.
    //
    // Containment is by PRIMARY KEY, matching `OptionGroup.hasOption` and the rest of this folder.
    const siblingOptions: Option[] = resolvedOptionGroup.getOptions();
    const index: number = siblingOptions.findIndex((member: Option) => this.isSameRowAs(member));
    if (index !== -1) {
      siblingOptions.splice(index, 1);
    }

    // [model/entity/Option.cfc:L106] - `structDelete(variables, "optionGroup")`, unconditional and
    // outside the found-branch above.
    this.optionGroup = undefined;
  }

  /**
   * Whether `candidate` denotes the same `SwOption` row as this instance.
   *
   * Identical in shape to `promotionCode.ts`'s and `promotionApplied.ts`'s helpers of the same
   * name, deliberately: one containment rule across the folder.
   */
  private isSameRowAs(candidate: Option): boolean {
    const candidateOptionID: string = candidate.getOptionID();

    if (candidateOptionID === '' || this.optionID === '') {
      return candidate === this;
    }

    return candidateOptionID === this.optionID;
  }

  /**
   * Whether this option has never been persisted. [org/Hibachi/HibachiEntity.cfc:L571-L576] via
   * [org/Hibachi/HibachiEntity.cfc:L707-L709]
   *
   * The framework base defines `isNew()` as `getNewFlag()`, and `getNewFlag()` as
   * `getPrimaryIDValue() == ""`.
   *
   * The empty-string comparison is exact rather than approximate: `unsavedvalue=""` and
   * `default=""` on [model/entity/Option.cfc:L52] are what make an unsaved row's key empty in the
   * first place.
   */
  isNew(): boolean {
    return this.optionID === '';
  }

  // four probes, none with a
  // hand-written legacy body: all are synthesised by the dispatcher at
  // [org/Hibachi/HibachiEntity.cfc:L507-L565].
  //
  // The project-wide containment rule: compare by primary key, with a reference fallback when the
  // candidate is unsaved.

  /**
   * Called by `PromotionReward.addOption` [model/entity/PromotionReward.cfc:L222]:
   * `if(isNew() or !arguments.option.hasPromotionReward( this ))`.
   */
  hasPromotionReward(promotionReward: PromotionReward): boolean {
    const candidateID: string = promotionReward.getPromotionRewardID();
    if (candidateID === '') {
      return this.promotionRewards.includes(promotionReward);
    }
    return this.promotionRewards.some(
      (held: PromotionReward) => held.getPromotionRewardID() === candidateID,
    );
  }

  /**
   * Called by `PromotionReward.addExcludedOption` [model/entity/PromotionReward.cfc:L322]:
   * `if(isNew() or !arguments.option.hasPromotionRewardExclusion( this ))`.
   *
   * A different link table from its sibling above - `SwPromoRewardExclOption` rather than
   * `SwPromoRewardOption` - so it probes a different collection.
   */
  hasPromotionRewardExclusion(promotionReward: PromotionReward): boolean {
    const candidateID: string = promotionReward.getPromotionRewardID();
    if (candidateID === '') {
      return this.promotionRewardExclusions.includes(promotionReward);
    }
    return this.promotionRewardExclusions.some(
      (held: PromotionReward) => held.getPromotionRewardID() === candidateID,
    );
  }

  /**
   * Called by `PromotionQualifier.addOption` [model/entity/PromotionQualifier.cfc:L164]:
   * `if(isNew() or !arguments.option.hasPromotionQualifier( this ))`.
   */
  hasPromotionQualifier(promotionQualifier: PromotionQualifier): boolean {
    const candidateID: string = promotionQualifier.getPromotionQualifierID();
    if (candidateID === '') {
      return this.promotionQualifiers.includes(promotionQualifier);
    }
    return this.promotionQualifiers.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === candidateID,
    );
  }

  /**
   * Called by `PromotionQualifier.addExcludedOption` [model/entity/PromotionQualifier.cfc:L264]:
   * `if(isNew() or !arguments.option.hasPromotionQualifierExclusion( this ))`.
   *
   * A different link table from its sibling above - `SwPromoQualExclOption` rather than
   * `SwPromoQualOption`.
   */
  hasPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): boolean {
    const candidateID: string = promotionQualifier.getPromotionQualifierID();
    if (candidateID === '') {
      return this.promotionQualifierExclusions.includes(promotionQualifier);
    }
    return this.promotionQualifierExclusions.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === candidateID,
    );
  }

  // Skus (many-to-many - inverse) [model/entity/Option.cfc:L109]
  //
  // The remaining ten helpers are pure delegations to the owning side's API.

  /**
   * Links this option to a sku. [model/entity/Option.cfc:L110-L112]
   */
  addSku(sku: Sku): void {
    sku.addOption(this);
  }

  /**
   * Unlinks this option from a sku. [model/entity/Option.cfc:L113-L115]
   *
   * Delegates to the owning side's `remove*`, which is the pattern as intended - contrast the two
   * exclusion `remove*` methods further down, which do not.
   *
   * LEGACY-NOTE [model/validation/Option.json:L6]:
   * `"skus": [{"contexts":"delete", "maxCollection":0}]` - an Option may not be DELETED while any
   * sku still references it.
   */
  removeSku(sku: Sku): void {
    sku.removeOption(this);
  }

  // Promotion Rewards (many-to-many - inverse) [model/entity/Option.cfc:L117]

  /**
   * Adds this option to a reward's INCLUSION set. [model/entity/Option.cfc:L118-L120]
   *
   * Delegates to [model/entity/PromotionReward.cfc:L218], the owning side of `SwPromoRewardOption`
   * declared at [model/entity/PromotionReward.cfc:L81].
   */
  addPromotionReward(promotionReward: PromotionReward): void {
    promotionReward.addOption(this);
  }

  /**
   * Removes this option from a reward's INCLUSION set. [model/entity/Option.cfc:L121-L123]
   */
  removePromotionReward(promotionReward: PromotionReward): void {
    promotionReward.removeOption(this);
  }

  // Promotion Reward Exclusions (many-to-many - inverse) [model/entity/Option.cfc:L125]

  /**
   * Adds this option to a reward's EXCLUSION set. [model/entity/Option.cfc:L126-L128]
   *
   * A different link table from {@link Option.addPromotionReward} - `SwPromoRewardExclOption`,
   * owned by [model/entity/PromotionReward.cfc:L87] as `excludedOptions`.
   *
   * Declares `required any promotionReward`, so this method takes a *promotionReward*, not an
   * *exclusion*, despite what "Exclusion" in the method name suggests.
   */
  addPromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.addExcludedOption(this);
  }

  // LEGACY-DEFECT [model/entity/Option.cfc:L129-L131]: removePromotionRewardExclusion calls
  // addExcludedOption(this) instead of removeExcludedOption(this) - the "remove" method ADDS.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Declared to remove this option from a reward's exclusion set; actually adds it.
   * [model/entity/Option.cfc:L129-L131]
   */
  removePromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.addExcludedOption(this);
  }

  // Promotion Qualifiers (many-to-many - inverse) [model/entity/Option.cfc:L133]

  /**
   * Adds this option to a qualifier's INCLUSION set. [model/entity/Option.cfc:L134-L136]
   *
   * Delegates to [model/entity/PromotionQualifier.cfc:L160], the owning side of
   * `SwPromoQualOption` declared at [model/entity/PromotionQualifier.cfc:L78].
   */
  addPromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addOption(this);
  }

  /**
   * Removes this option from a qualifier's INCLUSION set. [model/entity/Option.cfc:L137-L139]
   */
  removePromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeOption(this);
  }

  // Promotion Qualifier Exclusions (many-to-many - inverse) [model/entity/Option.cfc:L141]

  /**
   * Adds this option to a qualifier's EXCLUSION set. [model/entity/Option.cfc:L142-L144]
   */
  addPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addExcludedOption(this);
  }

  // LEGACY-DEFECT [model/entity/Option.cfc:L145-L147]: removePromotionQualifierExclusion calls
  // addExcludedOption(this) instead of removeExcludedOption(this) - the "remove" method ADDS.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Declared to remove this option from a qualifier's exclusion set; actually adds it.
   * [model/entity/Option.cfc:L145-L147]
   */
  removePromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addExcludedOption(this);
  }

  // EMPTY in the source: the banner is present but the section contains nothing.
}
