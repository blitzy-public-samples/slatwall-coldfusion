// slatwall-ts - Promotion entity. Port of model/entity/Promotion.cfc (181 lines).
//
// The `SwPromotion` row: the hub of the promotion aggregate.
//
// Schema continuity is binding, so entity property metadata is the contract: table `SwPromotion`,
// entity name `SlatwallPromotion`, no migration, no rename, no new table, no column change.
//
// LEGACY-NOTE [model/entity/Promotion.cfc:L176-L178]: the ORM event hooks block is EMPTY, so this
// class authors no lifecycle-maintenance method of any kind - no `preInsert`, no `preUpdate`, no
// materialized-path column, no generated value to seed.

import { cfBoolean } from '../../lib/cfml/truthiness.js';
import type { PromotionApplied } from './promotionApplied.js';
import type { PromotionCode } from './promotionCode.js';
import type { PromotionPeriod } from './promotionPeriod.js';

/**
 * The shapes a hydrated `ormtype="boolean"` column may arrive in from the driver.
 *
 * Declared LOCALLY and UN-EXPORTED rather than imported, and that is a considered choice with two
 * reasons behind it.
 */
type PersistedBooleanColumn = string | number | boolean | null;

/**
 * The ORM default declared for `activeFlag` at [model/entity/Promotion.cfc:L56], carried over as
 * the literal `"1"` rather than as `true`.
 *
 * Keeping the raw literal means the coercion that the legacy engine applied to the default is the
 * same coercion this port applies, performed by the same helper.
 */
const ACTIVE_FLAG_ORM_DEFAULT = '1' as const;

/**
 * The `SwPromotion` row: the hub entity of the promotion aggregate.
 *
 * `src/repositories/mysql/**` owns hydration and documents the chosen fetch shape at the producing
 * method.
 *
 * Every member is synchronous - a method becomes `async` only where its legacy body reached the
 * DAO or the ORM, and nothing here does.
 */
export class Promotion {
  /**
   * `length="32"` is the `SwPromotion.promotionID` column width and is recorded rather than
   * enforced - length validation is a service-tier concern and belongs to the zod schema ported
   * from model/validation/Promotion.json.
   */
  private readonly promotionID: string;

  /**
   * [model/entity/Promotion.cfc:L53] `property name="promotionName" ormtype="string";`
   *
   * No `length`, no `default` and - decisively - no `notnull`, so the column is nullable.
   */
  private readonly promotionName: string | undefined;

  /**
   * [model/entity/Promotion.cfc:L54] `ormtype="string" length="1000"`, nullable.
   */
  private readonly promotionSummary: string | undefined;

  /**
   * [model/entity/Promotion.cfc:L55] `ormtype="string" length="4000"`, nullable.
   */
  private readonly promotionDescription: string | undefined;

  /**
   * [model/entity/Promotion.cfc:L56] `property name="activeFlag" ormtype="boolean" default="1";`
   *
   * The `default="1"` is honoured rather than dropped: a promotion constructed without the key
   * reads TRUE, exactly as a freshly-created CFML entity does.
   */
  private readonly activeFlag: boolean;

  /**
   * LEGACY-NOTE [model/entity/Promotion.cfc:L59]:
   * `property name="defaultImage" cfc="Image" fieldtype="many-to-one" fkcolumn="defaultImageID";`
   * `Image` is not one of the eighteen in-scope entities.
   */
  private readonly defaultImageID: string | undefined;
  private readonly promotionPeriods: PromotionPeriod[];

  /**
   * [model/entity/Promotion.cfc:L63]
   * `singularname="promotionCode" cfc="PromotionCode" fieldtype="one-to-many" fkcolumn="promotionID" cascade="all-delete-orphan" inverse="true"`.
   */
  private readonly promotionCodes: PromotionCode[];

  /**
   * [model/entity/Promotion.cfc:L64]
   * `singularname="appliedPromotion" cfc="PromotionApplied" fieldtype="one-to-many" fkcolumn="promotionID" cascade="all" inverse="true"`.
   *
   * LEGACY-NOTE [model/entity/Promotion.cfc:L62-L64]: the cascade asymmetry is real and is
   * preserved rather than normalised.
   */
  private readonly appliedPromotions: PromotionApplied[];

  /**
   * [model/entity/Promotion.cfc:L67] `remoteID` - the integration correlation column.
   */
  private readonly remoteID: string | undefined;

  /**
   * [model/entity/Promotion.cfc:L70] `hb_populateEnabled="false" ormtype="timestamp"`.
   */
  private readonly createdDateTime: Date | undefined;

  /**
   * LEGACY-NOTE [model/entity/Promotion.cfc:L71]:
   * `property name="createdByAccount" hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one" fkcolumn="createdByAccountID";`
   *
   * `Account` is explicitly out of SCOPE, so this many-to-one is collapsed to the inert opaque
   * identifier `createdByAccountID`.
   */
  private readonly createdByAccountID: string | undefined;

  /**
   * [model/entity/Promotion.cfc:L72] `hb_populateEnabled="false" ormtype="timestamp"`.
   */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * [model/entity/Promotion.cfc:L73]
   * `hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one" fkcolumn="modifiedByAccountID"`
   * collapsed exactly as `createdByAccountID` above, and for the same reason.
   */
  private readonly modifiedByAccountID: string | undefined;

  /**
   * [model/entity/Promotion.cfc:L76]
   * `property name="currentFlag" type="boolean" persistent="false";` - the memo behind
   * `getCurrentFlag()`.
   */
  private currentFlag: boolean | undefined;

  /**
   * [model/entity/Promotion.cfc:L77] memo behind `getCurrentPromotionPeriodFlag()`.
   */
  private currentPromotionPeriodFlag: boolean | undefined;

  /**
   * [model/entity/Promotion.cfc:L78] memo behind `getCurrentPromotionCodeFlag()`.
   */
  private currentPromotionCodeFlag: boolean | undefined;

  // [model/entity/Promotion.cfc:L79]
  // `property name="promotionCodesDeletableFlag" type="boolean" persistent="false";` deliberately
  // has no backing field.

  /**
   * Constructed from a repository row plus its materialized associations.
   *
   * Never constructed from a sibling entity module: row-to-entity hydration belongs entirely to
   * `src/repositories/mysql/**`.
   *
   * Every collection parameter is optional and defaults to `[]`, and that is not a convenience: a
   * Hibernate-managed collection never handed back null.
   */
  constructor(init: {
    readonly promotionID: string;
    readonly promotionName?: string | undefined;
    readonly promotionSummary?: string | undefined;
    readonly promotionDescription?: string | undefined;
    readonly activeFlag?: PersistedBooleanColumn | undefined;
    readonly defaultImageID?: string | undefined;
    readonly promotionPeriods?: PromotionPeriod[] | undefined;
    readonly promotionCodes?: PromotionCode[] | undefined;
    readonly appliedPromotions?: PromotionApplied[] | undefined;
    readonly remoteID?: string | undefined;
    readonly createdDateTime?: Date | undefined;
    readonly createdByAccountID?: string | undefined;
    readonly modifiedDateTime?: Date | undefined;
    readonly modifiedByAccountID?: string | undefined;
  }) {
    this.promotionID = init.promotionID;
    this.promotionName = init.promotionName;
    this.promotionSummary = init.promotionSummary;
    this.promotionDescription = init.promotionDescription;
    this.activeFlag = cfBoolean(
      init.activeFlag === undefined ? ACTIVE_FLAG_ORM_DEFAULT : init.activeFlag,
    );
    this.defaultImageID = init.defaultImageID;
    this.promotionPeriods = init.promotionPeriods ?? [];
    this.promotionCodes = init.promotionCodes ?? [];
    this.appliedPromotions = init.appliedPromotions ?? [];
    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
  }

  /**
   * [model/entity/Promotion.cfc:L52] The `SwPromotion` primary key. `''` on an unsaved row.
   */
  getPromotionID(): string {
    return this.promotionID;
  }

  /**
   * Returns `string | undefined`, and the `| undefined` is not optional.
   */
  getPromotionName(): string | undefined {
    return this.promotionName;
  }

  /**
   * [model/entity/Promotion.cfc:L54] `length="1000"` recorded, not enforced.
   */
  getPromotionSummary(): string | undefined {
    return this.promotionSummary;
  }

  /**
   * [model/entity/Promotion.cfc:L55] `length="4000"` recorded, not enforced.
   */
  getPromotionDescription(): string | undefined {
    return this.promotionDescription;
  }

  /**
   * [model/entity/Promotion.cfc:L56] `ormtype="boolean" default="1"`.
   *
   * TOTAL, and already coerced: the single `cfBoolean()` call happens once in the constructor, so
   * repeated reads cannot disagree with each other and no raw column shape survives past
   * hydration.
   */
  getActiveFlag(): boolean {
    return this.activeFlag;
  }

  /**
   * The `defaultImageID` FK column, opaque. [model/entity/Promotion.cfc:L59]
   *
   * This is the only member authored for that association: there is deliberately no
   * `getDefaultImage()`, because `Image` is out of scope and the FK is inert.
   */
  getDefaultImageID(): string | undefined {
    return this.defaultImageID;
  }
  getRemoteID(): string | undefined {
    return this.remoteID;
  }
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * The `createdByAccountID` FK column, opaque. [model/entity/Promotion.cfc:L71] Same `get<XXX>ID`
   * provenance as `getDefaultImageID()`, and the same reason no `Account` object is exposed.
   */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * The `modifiedByAccountID` FK column, opaque. [model/entity/Promotion.cfc:L73]
   */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // Persistent Property Accessors.

  // Collection Accessors legacy-note [model/entity/Promotion.cfc:L141-L164]: all three accessors
  // return the live internal array, and that is forced by the structure of this component rather
  // than chosen.

  /**
   * [model/entity/Promotion.cfc:L62] The LIVE array. See the note above before changing this.
   */
  getPromotionPeriods(): PromotionPeriod[] {
    return this.promotionPeriods;
  }

  /**
   * [model/entity/Promotion.cfc:L63] The LIVE array. Also read internally by `getCurrentFlag()`
   * [model/entity/Promotion.cfc:L86], `getCurrentPromotionCodeFlag()`
   * [model/entity/Promotion.cfc:L112] and `getPromotionCodesDeletableFlag()`
   * [model/entity/Promotion.cfc:L126].
   */
  getPromotionCodes(): PromotionCode[] {
    return this.promotionCodes;
  }

  /**
   * [model/entity/Promotion.cfc:L64] The LIVE array. Also read internally by `isDeletable()`
   * [model/entity/Promotion.cfc:L171], which is why its emptiness is load-bearing rather than
   * incidental.
   */
  getAppliedPromotions(): PromotionApplied[] {
    return this.appliedPromotions;
  }

  // Collection Accessors.

  // Containment Probes None of the three is declared in model/entity/Promotion.cfc, and all three
  // are nonetheless MANDATORY here.
  //
  // The comparison basis is the primary key, never deep equality and never object reference.

  /**
   * Containment probe for `promotionPeriods` [model/entity/Promotion.cfc:L62]. PK basis.
   */
  hasPromotionPeriod(promotionPeriod: PromotionPeriod): boolean {
    const candidateID: string = promotionPeriod.getPromotionPeriodID();
    if (candidateID === '') {
      return this.promotionPeriods.includes(promotionPeriod);
    }
    return this.promotionPeriods.some(
      (held: PromotionPeriod) => held.getPromotionPeriodID() === candidateID,
    );
  }

  /**
   * Containment probe for `promotionCodes` [model/entity/Promotion.cfc:L63]. PK basis.
   */
  hasPromotionCode(promotionCode: PromotionCode): boolean {
    const candidateID: string = promotionCode.getPromotionCodeID();
    if (candidateID === '') {
      return this.promotionCodes.includes(promotionCode);
    }
    return this.promotionCodes.some(
      (held: PromotionCode) => held.getPromotionCodeID() === candidateID,
    );
  }

  /**
   * Containment probe for `appliedPromotions` [model/entity/Promotion.cfc:L64]. PK basis.
   */
  hasAppliedPromotion(promotionApplied: PromotionApplied): boolean {
    const candidateID: string = promotionApplied.getPromotionAppliedID();
    if (candidateID === '') {
      return this.appliedPromotions.includes(promotionApplied);
    }
    return this.appliedPromotions.some(
      (held: PromotionApplied) => held.getPromotionAppliedID() === candidateID,
    );
  }

  // Containment Probes.

  // Non-Persistent Property Methods [model/entity/Promotion.cfc:L81-L136]
  //
  // A second note, on how the collections are read internally.
  //
  // LEGACY-NOTE [model/entity/Promotion.cfc:L83-L121]: the first three memos are correct, and that
  // is the evidence that the fourth is a defect.

  /**
   * The seed polarity is `false`, narrowed to `true` - the opposite of
   * `PromotionPeriod.getCurrentFlag()` and `PromotionCode.getCurrentFlag()`, which each seed
   * `true` and narrow to `false`.
   */
  getCurrentFlag(): boolean {
    if (this.currentFlag === undefined) {
      // [model/entity/Promotion.cfc:L85] - the seed, written before the test.
      this.currentFlag = false;
      // [model/entity/Promotion.cfc:L86] - operand order and short-circuit preserved verbatim.
      if (
        this.getCurrentPromotionPeriodFlag() &&
        (this.promotionCodes.length === 0 || this.getCurrentPromotionCodeFlag())
      ) {
        this.currentFlag = true;
      }
    }

    return this.currentFlag;
  }

  /**
   * LEGACY-NOTE [model/entity/Promotion.cfc:L98-L103]: the legacy loop is an indexed `for` from 1
   * to `arrayLen(getPromotionPeriods())` that flips the flag and `break`s on the first current
   * period.
   *
   * `PromotionPeriod.getCurrentFlag()` is called with no argument, its legacy arity at
   * [model/entity/PromotionPeriod.cfc:L137] and the arity the sibling keeps.
   */
  getCurrentPromotionPeriodFlag(): boolean {
    if (this.currentPromotionPeriodFlag === undefined) {
      this.currentPromotionPeriodFlag = this.promotionPeriods.some((period: PromotionPeriod) =>
        period.getCurrentFlag(),
      );
    }

    return this.currentPromotionPeriodFlag;
  }

  /**
   * That is not a contradiction of `getCurrentFlag()`'s permissive empty-codes gate: this method
   * asks "is some code current?", whose honest answer for no codes is no.
   */
  getCurrentPromotionCodeFlag(): boolean {
    if (this.currentPromotionCodeFlag === undefined) {
      this.currentPromotionCodeFlag = this.promotionCodes.some((code: PromotionCode) =>
        code.getCurrentFlag(),
      );
    }

    return this.currentPromotionCodeFlag;
  }

  // LEGACY-DEFECT [model/entity/Promotion.cfc:L124-L133]: four-way key mismatch - declared
  // property `promotionCodesDeletableFlag` (L79), guard key `promotionCodeDeletableFlag` (L124),
  // write/return key `promotionCodeDeleteableFlag` (L125/L128/L133).
  // Preserved deliberately; do not fix without a product decision.

  /**
   * `getPromotionCodesDeletableFlag` - are all of this promotion's codes deletable?
   * [model/entity/Promotion.cfc:L123-L134]
   *
   * The legacy body starts from `true` and flips to `false` on the first non-deletable code, with
   * a `break`. `Array.prototype.every` short-circuits on the same first `false`, so the number of
   * codes consulted matches.
   *
   * The member it reaches - `PromotionCode.isDeletable()` - is not declared on
   * `model/entity/PromotionCode.cfc`; it resolves in the legacy tree to
   * [org/Hibachi/HibachiEntity.cfc:L204-L206] and is reproduced on `promotionCode.ts` from that
   * entity's own `model/validation/PromotionCode.json` delete-context rule. See the docblock there.
   *
   * @returns `true` when every promotion code on this promotion is deletable, including when there
   * are none.
   */
  getPromotionCodesDeletableFlag(): boolean {
    return this.promotionCodes.every((promotionCode: PromotionCode): boolean =>
      // [model/entity/Promotion.cfc:L127] - the member is called exactly as the legacy calls it.
      promotionCode.isDeletable(),
    );
  }

  // Non-Persistent Property Methods.

  // Bidirectional Helper Methods [model/entity/Promotion.cfc:L138-L166]
  //
  // LEGACY-NOTE [model/entity/Promotion.cfc:L141-L145]: the period helpers declare and use a
  // capital-P argument name - `required any PromotionPeriod` at L141/L144, then
  // `arguments.PromotionPeriod.setPromotion( this )` at L142/L145.

  /**
   * `addPromotionPeriod` - attach a period to this promotion.
   * [model/entity/Promotion.cfc:L141-L143]
   *
   * No `isNew()` guard is authored on this side, because the legacy has none here: the guard lives
   * entirely in the callee and reads the CHILD's newness, never the parent's.
   */
  addPromotionPeriod(promotionPeriod: PromotionPeriod): void {
    promotionPeriod.setPromotion(this);
  }

  // LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L110]: the delegated-to `removePromotion`
  // references the undeclared `arguments.account`, so this always throws and can never remove a
  // period.
  // Preserved deliberately; do not fix without a product decision.
  //
  // The MECHANISM, because the throw originates in another file.

  /**
   * `removePromotionPeriod` - detach a period from this promotion.
   * [model/entity/Promotion.cfc:L144-L146]
   *
   * @throws Error propagated from `PromotionPeriod.removePromotion` - see the marker above.
   */
  removePromotionPeriod(promotionPeriod: PromotionPeriod): void {
    promotionPeriod.removePromotion(this);
  }

  /**
   * `addPromotionCode` - attach a code to this promotion. [model/entity/Promotion.cfc:L149-L151]
   */
  addPromotionCode(promotionCode: PromotionCode): void {
    promotionCode.setPromotion(this);
  }

  /**
   * `removePromotionCode` - detach a code from this promotion.
   * [model/entity/Promotion.cfc:L153-L155]
   *
   * A pure far-side delegation, and this one works: `PromotionCode.removePromotion`
   * [model/entity/PromotionCode.cfc:L109-L120] is correct, using the declared
   * `arguments.promotion` at L116.
   */
  removePromotionCode(promotionCode: PromotionCode): void {
    promotionCode.removePromotion(this);
  }

  /**
   * `addAppliedPromotion` - record an application of this promotion.
   * [model/entity/Promotion.cfc:L158-L160]
   */
  addAppliedPromotion(promotionApplied: PromotionApplied): void {
    promotionApplied.setPromotion(this);
  }

  /**
   * `removeAppliedPromotion` - drop a recorded application of this promotion.
   * [model/entity/Promotion.cfc:L162-L164]
   *
   * A pure far-side delegation, and this one WORKS TOO: `PromotionApplied.removePromotion`
   * [model/entity/PromotionApplied.cfc:L85-L94] is clean, verified free of the `arguments.account`
   * leak and of any add/remove inversion.
   */
  removeAppliedPromotion(promotionApplied: PromotionApplied): void {
    promotionApplied.removePromotion(this);
  }

  // The verdict is about delegation direction, not outcome: `removePromotionPeriod` is clean here
  // it correctly calls a `remove*` - and separately always throws.

  // Bidirectional Helper Methods.

  // Overridden Methods [model/entity/Promotion.cfc:L168] opens this block and L174 closes
  // it. Exactly one member.

  /**
   * `isDeletable` - may this promotion be deleted? [model/entity/Promotion.cfc:L170-L172]
   *
   * An override in the legacy, proved by its placement under the "Overridden Methods" banner.
   *
   * Reads through the LIVE collection, so it observes far-side mutations - including one made
   * after a previous call.
   */
  isDeletable(): boolean {
    return this.appliedPromotions.length === 0;
  }

  // Overridden Methods.

  // ORM Event Hooks [model/entity/Promotion.cfc:L176-L178] COMPLETELY EMPTY in the source, so
  // nothing is authored: no `preInsert`, no `preUpdate`, no path maintenance, no UUID seeding. See
  // the ORM-hooks LEGACY-NOTE in the header.
}

// (end of Promotion entity)
