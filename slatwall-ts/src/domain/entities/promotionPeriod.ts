// slatwall-ts - PromotionPeriod entity.
// Schema contract [model/entity/PromotionPeriod.cfc:L49]: table `SwPromotionPeriod`, ORM entity name `SlatwallPromotionPeriod`; no migration,
// no rename, no column change.
//
// Port of model/entity/PromotionPeriod.cfc (163 lines): the bounded, use-limited window during
// which a promotion's rewards may apply.
//
// Two members that LOOK defective are not, and are deliberately unmarked so the register stays
// honest: `setPromotion` [model/entity/PromotionPeriod.cfc:L98-L103] is sound, because
// model/entity/Promotion.cfc:L62 genuinely declares `promotionPeriods`.
//
// Schema continuity is binding: entity property metadata is the contract.

import { isNullish } from '../../lib/cfml/truthiness.js';
import type { Promotion } from './promotion.js';
import type { PromotionQualifier } from './promotionQualifier.js';
import type { PromotionReward } from './promotionReward.js';

// LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L100, L101, L108, L88, L92]: the far-side contract
// this file requires of `src/domain/entities/promotion.ts`, published here as canonical because
// that file is authored separately.

// LEGACY-NOTE [model/entity/Promotion.cfc:L62-L64]: the opposite anti-contract, which this file
// must not break. model/entity/Promotion.cfc declares exactly three collections - L62
// `promotionPeriods` (cascade `all-delete-orphan`, inverse), L63 `promotionCodes` (same) and L64
// `appliedPromotions` (cascade `all`, inverse).

// LEGACY-NOTE [model/entity/PromotionReward.cfc:L70, L140] and
// [model/entity/PromotionQualifier.cfc:L68, L122]: the child-side anti-contract.

/**
 * Build the framework's terminal missing-method message, BYTE for BYTE.
 *
 * Three details are load-bearing and must never be "corrected": "does not exists" is grammatically
 * wrong in the source and is reproduced verbatim.
 *
 * Not every throw in this file uses this template, and that is deliberate.
 *
 * @param methodName The dead call target, without parentheses - they are added here.
 * @param className The bare component name of the entity the call was made ON.
 */
function hibachiMissingMethodMessage(methodName: string, className: string): string {
  return `You have called a method ${methodName}() which does not exists in the ${className} entity.`;
}

/**
 * The `SwPromotionPeriod` row: one bounded, use-limited window during which a promotion's rewards
 * may apply.
 *
 * `src/repositories/mysql/**` owns row-to-entity hydration, the clock injection and the
 * association materialization, and documents the chosen fetch shape at the producing repository
 * method.
 */
export class PromotionPeriod {
  // Persistent Properties [model/entity/PromotionPeriod.cfc:L52-L56]
  //
  // Exactly five, and the boolean census across the whole property window L49-L75 is ZERO of
  // either casing - re-verified case-insensitively.

  /**
   * Primary key. [model/entity/PromotionPeriod.cfc:L52]
   *
   * `string` and never `string | undefined`: `default=""` means the column always holds a string,
   * possibly the empty one.
   */
  private readonly promotionPeriodID: string;

  // The third absence convention, and this entity's ORM metadata is its strongest proof.
  //
  // [model/entity/PromotionPeriod.cfc:L53-L56] All four properties below are nullable, none
  // declares an ORM `default=`, and all four declare an `hb_nullRBKey` spelling the semantics out
  // in the schema itself: `define.forever` for the two dates.

  /**
   * Start of the active window, or `undefined` for no lower bound.
   * [model/entity/PromotionPeriod.cfc:L53]
   *
   * `hb_formatType` and `hb_nullRBKey` are carried forward as inert strings only.
   */
  private readonly startDateTime: Date | undefined;

  /**
   * End of the active window, or `undefined` for no upper bound.
   * [model/entity/PromotionPeriod.cfc:L54]
   *
   * The most consequential nullable slot here: `isCurrent` [model/entity/PromotionPeriod.cfc:L80]
   * dereferences it with no guard and therefore throws.
   */
  private readonly endDateTime: Date | undefined;

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L55-L56]: both count properties contain a DOUBLE
  // SPACE between `notnull="false"` and `hb_nullRBKey=` in the source. Cosmetic; not reproduced.

  /**
   * Period-wide use ceiling, or `undefined` for UNLIMITED. [model/entity/PromotionPeriod.cfc:L55]
   *
   * `ormtype="integer"` is a plain COUNT, not money, which is why neither the Money value object
   * nor decimal.js is imported here and why no float arithmetic appears in this file.
   */
  private readonly maximumUseCount: number | undefined;

  /**
   * Per-account use ceiling, or `undefined` for UNLIMITED. [model/entity/PromotionPeriod.cfc:L56]
   *
   * Consumed at model/service/PromotionService.cfc:L574 and L577 on the same `!isNull(...)` plus
   * `gt 0` terms as `maximumUseCount`.
   */
  private readonly maximumAccountUseCount: number | undefined;

  // Related Object Properties (many-to-one) [model/entity/PromotionPeriod.cfc:L59]

  /**
   * The owning promotion. [model/entity/PromotionPeriod.cfc:L59]
   *
   * MUTABLE, and the only mutable association on this class: `setPromotion` assigns it at L99 and
   * `removePromotion` clears it at L112.
   *
   * No `hb_cascadeCalculate` here - contrast model/entity/PromotionApplied.cfc:L59 `orderItem` and
   * model/entity/Sku.cfc:L65 `product`, which both declare it.
   */
  private promotion: Promotion | undefined;

  /**
   * The `promotionID` foreign-key column backing the association above.
   * [model/entity/PromotionPeriod.cfc:L59]
   *
   * Held alongside the materialized association so the key stays readable even when the repository
   * chose not to fetch the far side.
   */
  private readonly promotionID: string | undefined;

  // Both collections are `cascade="all-delete-orphan" inverse="true"` on
  // `fkcolumn="promotionPeriodID"`, matching model/entity/Promotion.cfc:L62-L63 and contrasting
  // model/entity/Promotion.cfc:L64 `appliedPromotions`.

  /**
   * [model/entity/PromotionPeriod.cfc:L62] `singularname="promotionReward"`. Defaults to `[]`.
   */
  private readonly promotionRewards: PromotionReward[];

  /**
   * [model/entity/PromotionPeriod.cfc:L63] `singularname="promotionQualifier"`; defaults `[]`.
   */
  private readonly promotionQualifiers: PromotionQualifier[];

  // Remote Properties [model/entity/PromotionPeriod.cfc:L66]

  /**
   * [model/entity/PromotionPeriod.cfc:L66] `property name="remoteID" ormtype="string";`
   *
   * Present on this entity, which is a real schema difference: contrast
   * model/entity/PromotionAccount.cfc, which declares no `remoteID` at all.
   */
  private readonly remoteID: string | undefined;

  // Audit properties [model/entity/PromotionPeriod.cfc:L69-L72]
  //
  // All four carry `hb_populateEnabled="false"`, the legacy mechanism for excluding them from mass
  // assignment.

  /**
   * [model/entity/PromotionPeriod.cfc:L69] `createdDateTime`, `ormtype="timestamp"`.
   */
  private readonly createdDateTime: Date | undefined;

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L70]: `createdByAccount` is a many-to-one on
  // `fkcolumn="createdByAccountID"` targeting the out-of-scope model/entity/Account.cfc.

  /**
   * The `createdByAccountID` column, opaque. [model/entity/PromotionPeriod.cfc:L70]
   */
  private readonly createdByAccountID: string | undefined;

  /**
   * [model/entity/PromotionPeriod.cfc:L71] `modifiedDateTime`, `ormtype="timestamp"`.
   */
  private readonly modifiedDateTime: Date | undefined;

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L72]:
  // `property name="modifiedByAccount" hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one" fkcolumn="modifiedByAccountID";`
  // identical out-of-scope collapse to an opaque ID column.

  /**
   * The `modifiedByAccountID` column, opaque. [model/entity/PromotionPeriod.cfc:L72]
   */
  private readonly modifiedByAccountID: string | undefined;

  // The injected clock.

  /**
   * The instant source every date comparison on this entity reads.
   *
   * A plain locally-typed function injected through the constructor, deliberately not a port: this
   * project has exactly thirteen ports and no fourteenth may be invented.
   */
  private readonly now: () => Date;

  // Non-persistent properties [model/entity/PromotionPeriod.cfc:L74-L75]

  /**
   * Memo backing `getCurrentFlag()`. [model/entity/PromotionPeriod.cfc:L75]
   *
   * Instance-scoped, and instances are request-scoped; never module-scoped, which would persist
   * across warm Lambda invocations.
   */
  private currentFlag: boolean | undefined;

  /**
   * Hydrates one `SwPromotionPeriod` row.
   *
   * Every nullable column is a REQUIRED slot typed `T | undefined` rather than an optional `?:`
   * slot.
   *
   * There is no collaborator port parameter, because this entity has zero `getService(` sites
   * across all 163 lines of the source.
   */
  constructor(init: {
    readonly promotionPeriodID: string;
    readonly startDateTime: Date | undefined;
    readonly endDateTime: Date | undefined;
    readonly maximumUseCount: number | undefined;
    readonly maximumAccountUseCount: number | undefined;
    readonly promotion: Promotion | undefined;
    readonly promotionID: string | undefined;
    readonly remoteID: string | undefined;
    readonly createdDateTime: Date | undefined;
    readonly createdByAccountID: string | undefined;
    readonly modifiedDateTime: Date | undefined;
    readonly modifiedByAccountID: string | undefined;
    readonly now: () => Date;
    readonly promotionRewards?: PromotionReward[];
    readonly promotionQualifiers?: PromotionQualifier[];
  }) {
    this.promotionPeriodID = init.promotionPeriodID;
    this.startDateTime = init.startDateTime;
    this.endDateTime = init.endDateTime;
    this.maximumUseCount = init.maximumUseCount;
    this.maximumAccountUseCount = init.maximumAccountUseCount;
    this.promotion = init.promotion;
    this.promotionID = init.promotionID;
    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
    this.now = init.now;

    // `?? []` here is not a defaulting coalesce on a nullable COLUMN - it is the empty-collection
    // default the plan prescribes for an owned one-to-many that the repository did not populate.
    this.promotionRewards = init.promotionRewards ?? [];
    this.promotionQualifiers = init.promotionQualifiers ?? [];
    this.currentFlag = undefined;
  }

  /**
   * [model/entity/PromotionPeriod.cfc:L52] Heavily exercised: the promotion engine keys its
   * per-period qualification cache on this value at model/service/PromotionService.cfc:L192, L193,
   * L197, L209, L212, L213, L217, L222, L351, L1048.
   */
  getPromotionPeriodID(): string {
    return this.promotionPeriodID;
  }

  /**
   * [model/entity/PromotionPeriod.cfc:L53] `undefined` means no LOWER BOUND - forever. Never
   * epoch, never `0`, never a sentinel.
   */
  getStartDateTime(): Date | undefined {
    return this.startDateTime;
  }

  /**
   * [model/entity/PromotionPeriod.cfc:L54] `undefined` means no UPPER BOUND - forever. Never
   * epoch, never `0`, never a sentinel.
   *
   * Read by model/dao/PromotionDAO.cfc:L178 and L245, both of which sit under a condition testing
   * `getStartDateTime()` rather than `getEndDateTime()`.
   */
  getEndDateTime(): Date | undefined {
    return this.endDateTime;
  }

  /**
   * [model/entity/PromotionPeriod.cfc:L55] `undefined` means unlimited. Never `0`.
   */
  getMaximumUseCount(): number | undefined {
    return this.maximumUseCount;
  }

  /**
   * [model/entity/PromotionPeriod.cfc:L56] `undefined` means unlimited. Never `0`.
   */
  getMaximumAccountUseCount(): number | undefined {
    return this.maximumAccountUseCount;
  }

  /**
   * The materialized far side of the `promotion` many-to-one.
   * [model/entity/PromotionPeriod.cfc:L59]
   *
   * `undefined` when the repository did not fetch it, or after `removePromotion` cleared it.
   */
  getPromotion(): Promotion | undefined {
    return this.promotion;
  }

  /**
   * The `promotionID` column. [model/entity/PromotionPeriod.cfc:L59]
   */
  getPromotionID(): string | undefined {
    return this.promotionID;
  }

  /**
   * The live `promotionRewards` array. [model/entity/PromotionPeriod.cfc:L62]
   *
   * Returns the array REFERENCE and never a copy, because the child side mutates it in place -
   * `arrayAppend` at model/entity/PromotionReward.cfc:L143 and `arrayDeleteAt` at L152, index at
   * L150.
   */
  getPromotionRewards(): PromotionReward[] {
    return this.promotionRewards;
  }

  /**
   * The live `promotionQualifiers` array. [model/entity/PromotionPeriod.cfc:L63]
   *
   * Same live-reference requirement as `getPromotionRewards`: `arrayAppend` at
   * model/entity/PromotionQualifier.cfc:L125 and `arrayDeleteAt` at L134.
   */
  getPromotionQualifiers(): PromotionQualifier[] {
    return this.promotionQualifiers;
  }
  getRemoteID(): string | undefined {
    return this.remoteID;
  }
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * The `createdByAccountID` column, opaque. [model/entity/PromotionPeriod.cfc:L70]
   */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * The `modifiedByAccountID` column, opaque. [model/entity/PromotionPeriod.cfc:L72]
   */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // Implicit ORM collection predicates.
  //
  // Both compare by primary key, never by object reference and never by deep equality.

  /**
   * Does this period already hold the given reward? [model/entity/PromotionPeriod.cfc:L62]
   *
   * Called at model/entity/PromotionReward.cfc:L142, inside `setPromotionPeriod`, as the guard
   * that decides whether to append to the live array at L143.
   */
  hasPromotionReward(promotionReward: PromotionReward): boolean {
    const candidateID: string = promotionReward.getPromotionRewardID();

    return this.promotionRewards.some(
      (existing) => existing.getPromotionRewardID() === candidateID,
    );
  }

  /**
   * Does this period already hold the given qualifier? [model/entity/PromotionPeriod.cfc:L63]
   *
   * Called at model/entity/PromotionQualifier.cfc:L124, inside `setPromotionPeriod`, as the guard
   * that decides whether to append to the live array at L125.
   */
  hasPromotionQualifier(promotionQualifier: PromotionQualifier): boolean {
    const candidateID: string = promotionQualifier.getPromotionQualifierID();

    return this.promotionQualifiers.some(
      (existing) => existing.getPromotionQualifierID() === candidateID,
    );
  }

  /**
   * Whether this instance has been persisted yet.
   *
   * Inherited from the framework base in the legacy tree and concretely called at exactly one site
   * in this component - [model/entity/PromotionPeriod.cfc:L100], inside `setPromotion`.
   *
   * The empty-string test is literally what the framework does: `isNew()` at
   * [org/Hibachi/HibachiEntity.cfc:L707-L709] returns `getNewFlag()`.
   */
  isNew(): boolean {
    return this.promotionPeriodID === '';
  }

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L78-L93]: these four methods sit outside every
  // section marker in the source, whose first one opens at L95, while `getCurrentFlag()` - the
  // semantic twin of `isCurrent()` - sits inside one.

  // LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L80 vs L140]: `isCurrent()` and
  // `getCurrentFlag()` answer the same question with opposite end-boundary semantics, because
  // `isCurrent()` tests `getEndDateTime() > currentDateTime` and so treats the end bound as
  // exclusive.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Is this period active at the given instant? [model/entity/PromotionPeriod.cfc:L78-L81]
   *
   * The comparison is on `getTime()`, epoch milliseconds and therefore timezone independent, and
   * the instant is captured once and reused for both comparisons, reproducing
   * `var currentDateTime = now();` at L79.
   *
   * @param now The instant to evaluate against.
   * @throws Error when either bound is `undefined`, reproducing the L80 defect above.
   */
  isCurrent(now?: Date): boolean {
    // Bound to a local named after the legacy local: `var currentDateTime = now();` at L79
    // captures the instant once and reuses it for both comparisons - which an argument reproduces
    // for free.
    const currentDateTime: Date = now ?? this.now();

    const startDateTime: Date | undefined = this.startDateTime;
    const endDateTime: Date | undefined = this.endDateTime;

    // The L80 defect, reproduced. In CFML, comparing a null against a date is a runtime error, so
    // the target raises one too rather than inventing an outcome.
    if (startDateTime === undefined) {
      throw new Error(
        'PromotionPeriod.isCurrent cannot evaluate a null startDateTime: ' +
          'model/entity/PromotionPeriod.cfc:L80 dereferences getStartDateTime() with no null ' +
          'guard, even though model/entity/PromotionPeriod.cfc:L53 declares the column nullable ' +
          'with hb_nullRBKey="define.forever". Contrast isExpired() at ' +
          'model/entity/PromotionPeriod.cfc:L84 and getCurrentFlag() at ' +
          'model/entity/PromotionPeriod.cfc:L140, both of which guard. Preserved defect.',
      );
    }

    if (endDateTime === undefined) {
      throw new Error(
        'PromotionPeriod.isCurrent cannot evaluate a null endDateTime: ' +
          'model/entity/PromotionPeriod.cfc:L80 dereferences getEndDateTime() with no null ' +
          'guard, even though model/entity/PromotionPeriod.cfc:L54 declares the column nullable ' +
          'with hb_nullRBKey="define.forever". Contrast isExpired() at ' +
          'model/entity/PromotionPeriod.cfc:L84 and getCurrentFlag() at ' +
          'model/entity/PromotionPeriod.cfc:L140, both of which guard. Preserved defect.',
      );
    }

    // Start inclusive (`<=`), end exclusive (`>`), exactly as written at L80. At the instant now
    // endDateTime this returns false, while getCurrentFlag() returns true.
    return (
      startDateTime.getTime() <= currentDateTime.getTime() &&
      endDateTime.getTime() > currentDateTime.getTime()
    );
  }

  /**
   * Has this period's end bound already passed? [model/entity/PromotionPeriod.cfc:L83-L85]
   *
   * SIGNATURE UNCHANGED - zero arguments, reading the injected clock internally.
   *
   * Only the END BOUND is EXAMINED: `startDateTime` is never consulted, so a period whose start is
   * in the future is not "expired".
   */
  isExpired(): boolean {
    const endDateTime: Date | undefined = this.endDateTime;

    // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L84]: CFML `isDate(...)` applied to a slot
    // that is either a timestamp or null is exactly an absence test, so it maps to
    // `isNullish(...)` from src/lib/cfml/truthiness.ts.
    if (isNullish(endDateTime) || endDateTime === undefined) {
      return false;
    }

    // The clock is read only on this branch, reproducing CFML `&&` short-circuiting. UTC policy:
    // the comparison is on epoch milliseconds.
    return endDateTime.getTime() < this.now().getTime();
  }

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L87]: the legacy declaration is
  // `public boolean function isDeletable ()`, with a space before the parentheses. Not reproduced.

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L88]: counter-intuitive polarity, flagged rather
  // than "corrected". A period is deletable if it is not EXPIRED.

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L88, L92]: both `isDeletable()` and
  // `getSimpleRepresentation()` call `getPromotion()` with no null guard and immediately
  // dereference the result.

  /**
   * May this period be deleted? [model/entity/PromotionPeriod.cfc:L87-L89]
   *
   * Not MEMOIZED, because the legacy is not - `getCurrentFlag()` is the only memoized member here.
   *
   * @throws Error when the period is not expired and `promotion` is `undefined`.
   */
  isDeletable(): boolean {
    // Short-circuit arm: no reach-through to the parent on this path.
    if (this.isExpired()) {
      return false;
    }

    const promotion: Promotion | undefined = this.promotion;

    if (promotion === undefined) {
      throw new Error(
        'PromotionPeriod.isDeletable cannot reach its promotion: ' +
          'model/entity/PromotionPeriod.cfc:L88 calls getPromotion().isDeletable() with no null ' +
          'guard, so an unmaterialized or cleared promotion is a CFML null-reference error. The ' +
          'association is declared fetch="join" at model/entity/PromotionPeriod.cfc:L59, which is ' +
          'why the legacy code gets away with it in practice.',
      );
    }

    return promotion.isDeletable();
  }

  /**
   * Human-readable label for this period. [model/entity/PromotionPeriod.cfc:L91-L93]
   *
   * Same unguarded reach-through as `isDeletable()` - see the shared LEGACY-NOTE above.
   *
   * @throws Error when `promotion` is `undefined`, or when the reached promotion has no name.
   */
  getSimpleRepresentation(): string {
    const promotion: Promotion | undefined = this.promotion;

    if (promotion === undefined) {
      throw new Error(
        'PromotionPeriod.getSimpleRepresentation cannot reach its promotion: ' +
          'model/entity/PromotionPeriod.cfc:L92 calls getPromotion().getPromotionName() with no ' +
          'null guard, so an unmaterialized or cleared promotion is a CFML null-reference error. ' +
          'The association is declared fetch="join" at model/entity/PromotionPeriod.cfc:L59.',
      );
    }

    const promotionName: string | undefined = promotion.getPromotionName();

    if (promotionName === undefined) {
      throw new Error(
        'PromotionPeriod.getSimpleRepresentation reached its promotion but the promotion has no ' +
          'name. model/entity/Promotion.cfc:L53 declares promotionName without notNull, so the ' +
          'column is nullable, while model/entity/PromotionPeriod.cfc:L91 declares ' +
          'returntype="string" - CFML raises on the return-type coercion rather than yielding an ' +
          'empty string. model/validation/Promotion.json requires promotionName only in the save ' +
          'context, so a persisted or partially hydrated promotion can legitimately lack one.',
      );
    }

    return promotionName;
  }

  // Bidirectional helpers [model/entity/PromotionPeriod.cfc:L95-L132], the first of two
  // identically-titled banners, with inline sub-banners at L97, L115 and L124.
  //
  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L95-L132]: the remove-that-adds inversion
  // cross-check, re-run against the verbatim source.

  // Promotion (many-to-one) [model/entity/PromotionPeriod.cfc:L97]

  /**
   * Bidirectional helper for the `promotion` many-to-one.
   * [model/entity/PromotionPeriod.cfc:L98-L103]
   *
   * Three behaviours are preserved precisely: the near-side assignment runs FIRST, since L99
   * precedes the guard at L100.
   */
  setPromotion(promotion: Promotion): void {
    // [model/entity/PromotionPeriod.cfc:L99] - before the guard, always.
    this.promotion = promotion;

    // [model/entity/PromotionPeriod.cfc:L100] - `isNew()` first, so the far-side membership test
    // is skipped entirely for an unsaved period.
    if (this.isNew() || !promotion.hasPromotionPeriod(this)) {
      // [model/entity/PromotionPeriod.cfc:L101] - mutates the parent's live array in place.
      promotion.getPromotionPeriods().push(this);
    }
  }

  // LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L110]: removePromotion() references
  // `arguments.account`, not a declared argument of this method - the signature at L104 is
  // `removePromotion(any promotion)` and `promotion` is its only argument.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Bidirectional helper for the `promotion` many-to-one.
   * [model/entity/PromotionPeriod.cfc:L104-L113]
   *
   * A partially-throwing port, reproducing the legacy failure on exactly the path that fails
   * there.
   *
   * @throws Error when this period IS found in the parent's collection - the L110 leak.
   */
  removePromotion(promotion?: Promotion): void {
    // [model/entity/PromotionPeriod.cfc:L105-L107]: CFML probes
    // `structKeyExists(arguments, "promotion")` and defaults the absent argument to
    // `variables.promotion`.
    const target: Promotion | undefined = promotion ?? this.promotion;

    if (target === undefined) {
      throw new Error(
        'PromotionPeriod.removePromotion cannot resolve a promotion: ' +
          'model/entity/PromotionPeriod.cfc:L108 calls getPromotionPeriods() on the resolved ' +
          'promotion unconditionally, so when neither the argument nor the near-side field holds ' +
          'one, CFML raises a null-reference error before any index guard runs.',
      );
    }

    // [model/entity/PromotionPeriod.cfc:L108]: the legacy `arrayFind(collection, this)` is
    // reference / session identity in CFML/Hibernate, reproduced project-wide as a PRIMARY-KEY
    // comparison.
    const index: number = target
      .getPromotionPeriods()
      .findIndex(
        (candidate: PromotionPeriod) => candidate.getPromotionPeriodID() === this.promotionPeriodID,
      );

    // [model/entity/PromotionPeriod.cfc:L109-L111]: the FOUND path. L110 throws, so the parent's
    // array is deliberately left UNMUTATED and control never reaches the near-side clear below.
    if (index !== -1) {
      throw new Error(
        'PromotionPeriod.removePromotion is inoperable on the found path in Slatwall 3.1.39: ' +
          'model/entity/PromotionPeriod.cfc:L110 calls ' +
          'arrayDeleteAt(arguments.account.getPromotionPeriods(), index), dereferencing ' +
          '`arguments.account` - an argument this method never declares. Its only argument is ' +
          '`promotion` (model/entity/PromotionPeriod.cfc:L104), so CFML raises an ' +
          'undefined-variable error. Unlike the identical leak at ' +
          'model/entity/PromotionAccount.cfc:L103, this one is REACHABLE, because L108 succeeds ' +
          'against the promotionPeriods collection declared at model/entity/Promotion.cfc:L62. ' +
          'The parent collection is therefore never mutated and the near-side clear at ' +
          'model/entity/PromotionPeriod.cfc:L112 never runs. Preserved defect.',
      );
    }

    // [model/entity/PromotionPeriod.cfc:L112]: `structDelete(variables, "promotion")`. Reached
    // only on the not-found path, exactly as in the legacy, where L110 throws first on the found
    // path.
    this.promotion = undefined;
  }

  // Promotion Rewards (one-to-many) [model/entity/PromotionPeriod.cfc:L115]
  //
  // Both HELPERS in this PAIR THROW, and so do both in the Qualifiers pair below: all four call
  // the wrong method name on the child.

  /**
   * Bidirectional helper for the `promotionRewards` collection.
   * [model/entity/PromotionPeriod.cfc:L116-L118]
   *
   * A throwing stub mirroring the legacy runtime failure rather than repairing it, following the
   * precedent set for `Sku.getPriceByPromotion()` [model/entity/Sku.cfc:L258].
   *
   * @throws Error always - the terminal missing-method message for `setPromotion()` on
   * `PromotionReward`.
   */
  addPromotionReward(promotionReward: PromotionReward): void {
    throw new Error(hibachiMissingMethodMessage('setPromotion', 'PromotionReward'));
  }

  /**
   * Bidirectional helper for the `promotionRewards` collection.
   * [model/entity/PromotionPeriod.cfc:L120-L122]
   *
   * @throws Error always - the terminal missing-method message for `removePromotion()` on
   * `PromotionReward`.
   */
  removePromotionReward(promotionReward: PromotionReward): void {
    // [model/entity/PromotionPeriod.cfc:L121]: `arguments.promotionReward.removePromotion(this)`.
    // The dead target is `removePromotion` and it is called on a PromotionReward.
    throw new Error(hibachiMissingMethodMessage('removePromotion', 'PromotionReward'));
  }

  /**
   * Bidirectional helper for the `promotionQualifiers` collection.
   * [model/entity/PromotionPeriod.cfc:L125-L127]
   *
   * @throws Error always - the terminal missing-method message for `setPromotion()` on
   * `PromotionQualifier`.
   */
  addPromotionQualifier(promotionQualifier: PromotionQualifier): void {
    // [model/entity/PromotionPeriod.cfc:L126]:
    // `arguments.promotionQualifier.setPromotion( this )`. The dead target is `setPromotion` and
    // it is called on a PromotionQualifier.
    throw new Error(hibachiMissingMethodMessage('setPromotion', 'PromotionQualifier'));
  }

  // LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L129]: removePromotionQualifier() calls
  // `removePromotion( this )` on the qualifier. model/entity/PromotionQualifier.cfc declares no
  // `promotion` property and no hand-written `removePromotion`.
  // Preserved deliberately; do not fix without a product decision.

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L129]: a second, independent wart on the same
  // line - the source reads `arguments.PromotionQualifier` with a capital P while the argument
  // declared at L128 is `promotionQualifier`.

  /**
   * Bidirectional helper for the `promotionQualifiers` collection.
   * [model/entity/PromotionPeriod.cfc:L128-L130]
   *
   * @throws Error always - the terminal missing-method message for `removePromotion()` on
   * `PromotionQualifier`.
   */
  removePromotionQualifier(promotionQualifier: PromotionQualifier): void {
    // [model/entity/PromotionPeriod.cfc:L129]:
    // `arguments.PromotionQualifier.removePromotion( this )` - capital P in the source, harmless
    // because CFML's `arguments` scope is case-insensitive.
    throw new Error(hibachiMissingMethodMessage('removePromotion', 'PromotionQualifier'));
  }

  /**
   * Memoized "is this period active?" flag. [model/entity/PromotionPeriod.cfc:L137-L146]
   *
   * A CORRECT instance of the memoized-accessor seed/guard pattern, and therefore unmarked: seed
   * key, write key and return key are all `currentFlag`.
   *
   * Signature unchanged - zero arguments, reading the injected clock internally.
   */
  getCurrentFlag(): boolean {
    // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L138]: a true memo guard, not a lazy-load
    // probe.
    if (this.currentFlag === undefined) {
      // [model/entity/PromotionPeriod.cfc:L139] - seed permissive.
      this.currentFlag = true;

      const startDateTime: Date | undefined = this.startDateTime;
      const endDateTime: Date | undefined = this.endDateTime;

      // [model/entity/PromotionPeriod.cfc:L140] - the two `!isNull(...)` guards map to
      // `!isNullish(...)`; each trailing `!== undefined` is a type-narrowing step only.
      if (
        (!isNullish(startDateTime) &&
          startDateTime !== undefined &&
          startDateTime.getTime() > this.now().getTime()) ||
        (!isNullish(endDateTime) &&
          endDateTime !== undefined &&
          endDateTime.getTime() < this.now().getTime())
      ) {
        // [model/entity/PromotionPeriod.cfc:L141] - same key as the seed and the return.
        this.currentFlag = false;
      }
    }
    return this.currentFlag;
  }
}

// Source layout notes, recorded rather than reproduced.
//
// LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L150-L152]: the `Custom Formatting Methods` banner
// pair is empty, consistent with the property census - no monetary column, no `currencyCode`, no
// formatted-output accessor.
