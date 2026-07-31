// ---------------------------------------------------------------------------
// slatwall-ts - Promotion entity
//
// PORT OF model/entity/Promotion.cfc (181 lines, confirmed by `wc -l`).
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/Promotion.cfc:L49]
//
//   component displayname="Promotion" entityname="SlatwallPromotion"
//   table="SwPromotion" persistent="true" extends="HibachiEntity"
//   cacheuse="transactional" hb_serviceName="promotionService" hb_permission="this" {
//
// Schema continuity is a binding constraint: entity property metadata IS the
// contract. Table `SwPromotion`, entity name `SlatwallPromotion`. No migration,
// no rename, no new table, no column change. Every `hb_*` attribute value is
// carried forward verbatim in a comment so the legacy admin can still resolve it.
// `hb_permission="this"` is the self-referential form (contrast the dotted
// `hb_permission="promotionPeriod.promotionQualifiers"` on
// model/entity/PromotionQualifier.cfc:L49).
//
// THIS ENTITY IS THE ROOT OF THE PROMOTION AGGREGATE, AND IT OWNS EXACTLY THREE
// COLLECTIONS - no more. Verified by a fieldtype census of the verbatim source:
//
//   | locator | property           | fieldtype    | fkcolumn    | cascade           | inverse |
//   |---------|--------------------|--------------|-------------|-------------------|---------|
//   | L62     | promotionPeriods   | one-to-many  | promotionID | all-delete-orphan | true    |
//   | L63     | promotionCodes     | one-to-many  | promotionID | all-delete-orphan | true    |
//   | L64     | appliedPromotions  | one-to-many  | promotionID | all               | true    |
//
// ★ THE ANTI-CONTRACT IS AS BINDING AS THE CONTRACT. There is NO
// `promotionAccounts` collection, and this class must never gain one. A
// case-insensitive grep of model/entity/Promotion.cfc for `promotionAccount`
// returns ZERO hits, and a repository-wide sweep of model/, org/ and
// integrationServices/ finds no definition of get/has/add/removePromotionAccount
// anywhere outside model/entity/PromotionAccount.cfc itself. That absence is
// precisely WHY model/entity/PromotionAccount.cfc:L90-L95 and L97-L106 are
// confirmed throwing defects, and adding the far side here in TypeScript would
// SILENTLY REPAIR them - inventing behaviour the legacy system does not have and
// breaking schema continuity, since there is no `SwPromotion` ->
// `SwPromotionAccount` inverse mapping to honour. The requirement is published
// from the other side too, at src/domain/entities/promotionAccount.ts:L107-L124,
// and both statements are deliberate duplicates of one rule.
//
// ALL THREE COLLECTION ACCESSORS RETURN THE LIVE MUTABLE ARRAY. That is not a
// style choice; it is the mechanical output of the project's ONE
// association-ownership rule, which asks a single question of the verbatim
// source: does any entity in model/entity/*.cfc perform
// `arrayAppend`/`arrayDeleteAt` THROUGH that accessor, with the receiver
// resolving to THIS entity? Census result, receiver-qualified:
//
//   getPromotionPeriods()  <- PromotionPeriod.cfc:L101 (arrayAppend) and L108/L110 (arrayFind
//                             then arrayDeleteAt, on the reachable found path)
//   getPromotionCodes()    <- PromotionCode.cfc:L105 (arrayAppend), L116 (arrayDeleteAt)
//   getAppliedPromotions() <- PromotionApplied.cfc:L82 (arrayAppend), L91 (arrayDeleteAt)
//
// Three hits, three LIVE accessors, and no judgment exercised. A defensive copy
// on any of the three would silently break bidirectional synchronization: the
// far side's append would land on a throwaway array and the two halves of the
// graph would drift apart with no error anywhere. The return types are therefore
// the mutable `T[]` and NOT `readonly T[]`, so the contract is visible in the
// type rather than only in prose.
//
// THE `extends` CHAIN IS THREE LEVELS DEEP, NOT TWO. `extends="HibachiEntity"` on
// L49 is UNQUALIFIED, so it resolves to the local model/entity/HibachiEntity.cfc
// (274 lines), whose own L49 reads `component output="false" accessors="true"
// persistent="false" extends="Slatwall.org.Hibachi.HibachiEntity"`. The
// intermediate class reaches outward through twelve `getService(...)` sites and
// NONE of them is ported; an entity reaching outward through a service locator is
// exactly the pattern the ESLint `no-restricted-imports` layer boundary in
// eslint.config.mjs exists to make impossible. This entity has ZERO
// `getService(` sites of its own, which is why every method below is synchronous
// and why the single injected collaborator is a NARROW STRUCTURAL PORT rather
// than a service handle - see `PromotionCodeDeletableEvaluator` below.
//
// WHAT THE FRAMEWORK BASE CONTRIBUTES, AND WHY ALMOST NONE OF IT IS AUTHORED.
// org/Hibachi/HibachiEntity.cfc:L507-L565 is an `onMissingMethod` dispatcher
// matching eleven method-name patterns - hasUniqueOrNull*, hasUnique*, hasAny*,
// get*AssignedIDList, get*ID, get*Options, get*OptionsSmartList, get*SmartList,
// get*Struct, get*Count, and a `getAttributeValue` fallback at L559 - and
// TERMINATING IN A THROW AT L565. TypeScript must not emulate dynamic dispatch,
// so there is no Proxy, no index signature, no `evaluate()` and no `variables.`
// scope object here. Only concretely-called members are authored. For this entity
// that means the three `has*` containment probes its own children call, plus
// `isNew()`; the EAV `getAttributeValue` fallback is unreachable because
// `Promotion` declares no `attributeValues` collection (only four in-scope
// entities do - Sku.cfc:L70, Product.cfc:L75, ProductType.cfc:L67, Brand.cfc:L60).
//
// VALIDATION: model/validation/Promotion.json EXISTS and is one of the twelve
// in-scope schemas. It is ported as a typed zod schema by the owner of the
// validation tier, not from here; this class carries no validator method, exactly
// as the source carries none.
//
// TEST COVERAGE FOR THIS MODULE IS NET-NEW. Only two of the eighteen in-scope
// entities have a legacy antecedent - brand.ts from
// meta/tests/unit/entity/BrandTest.cfc and product.ts from
// meta/tests/unit/entity/ProductTest.cfc. `Promotion` has no legacy test
// whatsoever, so its coverage must never be presented as parity. The contract the
// test tier has to pin is enumerated at the foot of this file.
//
// NO USER RULES WERE PROVIDED. The project rules document returns exactly "No
// user rules provided." No rule is invented to fill the gap and the absence is
// not treated as licence to lower the bar: the enterprise substitute standard
// applies at full strength - maximal strictness, no `any` and no suppression
// comment, one exported unit per file, no barrel, and every judgment call
// annotated at the point where it was made.
// ---------------------------------------------------------------------------

import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import { cfBoolean } from '../../lib/cfml/truthiness.js';
import type { PromotionApplied } from './promotionApplied.js';
import type { PromotionCode } from './promotionCode.js';
import type { PromotionPeriod } from './promotionPeriod.js';

// LEGACY-NOTE [model/entity/Promotion.cfc:L59] - `defaultImage` IS MATERIALIZED THROUGH A NARROW
// STRUCTURAL PROJECTION, NOT DROPPED. The declaration is
// `property name="defaultImage" cfc="Image" fieldtype="many-to-one" fkcolumn="defaultImageID";`
// and `Image` is out of scope. The out-of-scope entity is the FAR SIDE; the ASSOCIATION itself is
// part of this entity's persisted contract, and suppressing it would make the class assert
// something false about `SwPromotion`. The approved mechanism already exists and is used
// throughout this folder - a module-local, un-exported structural interface naming only the
// members anything in scope can actually reach - so it is used here.
//
// WHY THE SHAPE IS EXACTLY ONE MEMBER: the declaration names its own join key,
// `fkcolumn="defaultImageID"`, and NOTHING in the in-scope slice reads any other member of a
// promotion's default image. model/entity/Promotion.cfc itself never mentions `defaultImage`
// again after L59 - no accessor override, no helper, no use in any of the four non-persistent
// property methods - and no in-scope service or DAO touches it either. Declaring `getImageFile()`
// or `getDirectory()` here would be speculation; `getImageID()` is derivable from the source and
// nothing else is. Contrast src/domain/entities/option.ts, whose `OptionImageLink` legitimately
// carries three members because admin/controllers/main.cfc:L118-L131 genuinely reaches them.
interface PromotionDefaultImageLink {
  getImageID(): string;
}

// LEGACY-NOTE [model/entity/Promotion.cfc:L123-L135] and [org/Hibachi/HibachiEntity.cfc:L204-L206]
// - WHY `getPromotionCodesDeletableFlag()` NEEDS AN INJECTED COLLABORATOR, AND WHY IT IS THIS
// SHAPE. The legacy body loops the promotion's codes and calls `promotionCode.isDeletable()`.
// Traced through the source, that call does NOT resolve to anything on
// model/entity/PromotionCode.cfc - that file declares no `isDeletable()` at all, re-verified by
// grep - so it resolves to the framework's inherited version at
// org/Hibachi/HibachiEntity.cfc:L204-L206, whose body is
// `!getService("hibachiValidationService").validate(object=this, context="delete",
// setErrors=false).hasErrors()`. In other words `PromotionCode.isDeletable()` IS the
// delete-context validation rule, which for that entity is exactly one rule:
// model/validation/PromotionCode.json declares `"orders": [{"contexts":"delete",
// "maxCollection":0}]`.
//
// That is a `getService(...)` reach-out, i.e. rule T2, and the transformation rule for T2 is
// explicit: a service-locator call inside an entity becomes a CONSTRUCTOR-INJECTED PORT on the
// entity. It cannot become a direct import - the validation service is a Hibachi artifact that is
// deliberately not ported - and it cannot be inlined here, because this class has no access to the
// `SwOrderPromotionCode` link table. `src/domain/entities/promotionCode.ts` states the same
// conclusion from its own side at L1625-L1631 and deliberately does NOT author `isDeletable()`.
//
// The port is declared module-local and un-exported, following the `*Link` precedent set by
// src/domain/entities/brand.ts and the identical treatment of `RoundingRuleValueRounder` in
// src/domain/entities/roundingRule.ts. That placement is load-bearing rather than cosmetic: the
// AAP locks the port inventory at THIRTEEN exported contracts under src/domain/ports/, and a
// fourteenth exported collaborator interface is a budget violation regardless of which file it
// sits in. The inventory counts EXPORTED CONTRACTS, not files.
interface PromotionCodeDeletableEvaluator {
  isDeletable(promotionCode: PromotionCode): boolean;
}

/**
 * The `SwPromotion` root of the promotion aggregate.
 *
 * A class rather than an interface, because the legacy entities carry behaviour and not merely
 * data: four of this component's members are non-persistent property methods with real bodies
 * [model/entity/Promotion.cfc:L83-L134], and one is an override of the framework's deletability
 * rule [model/entity/Promotion.cfc:L170-L172]. Collapsing them into free functions would break the
 * method-for-method interface parity that is this port's acceptance contract.
 *
 * ASSOCIATIONS ARE MATERIALIZED AT THE REPOSITORY BOUNDARY. Hibernate lazy collections have no
 * equivalent in a driver-only stack, so rather than simulate laziness each collection arrives
 * already populated and the fetch shape is an explicit, documented decision at the repository
 * method that produced it. This converts every implicit lazy load into a visible query choice and
 * removes the N+1 hazard that unbounded graph walking creates.
 *
 * EVERY MEMBER IS SYNCHRONOUS. The async boundary rule for this port is that a method becomes
 * `async` if and only if its legacy body reaches the DAO or ORM. Nothing here does: all four
 * non-persistent property methods and `isDeletable()` traverse already-materialized associations
 * and perform no arithmetic at all.
 *
 * EXACTLY ONE MEMBER OF THIS CLASS CAN THROW - `getPromotionCodesDeletableFlag()`, and only when
 * the promotion was hydrated without a delete-context evaluator. Every other member is total. The
 * reasoning for that single raise is carried on the method itself.
 */
export class Promotion {
  /**
   * [model/entity/Promotion.cfc:L52]
   * `property name="promotionID" ormtype="string" length="32" fieldtype="id" generator="uuid"
   * unsavedvalue="" default="";`
   *
   * `unsavedvalue=""` combined with `default=""` is what makes an unsaved row's primary key the
   * empty string, which is in turn what makes `isNew()` below a simple emptiness test.
   */
  private readonly promotionID: string;

  /** [model/entity/Promotion.cfc:L53] `ormtype="string"`, no length attribute, so `varchar(255)`. */
  private readonly promotionName: string | undefined;

  /** [model/entity/Promotion.cfc:L54] `ormtype="string" length="1000"`. */
  private readonly promotionSummary: string | undefined;

  /** [model/entity/Promotion.cfc:L55] `ormtype="string" length="4000"`. */
  private readonly promotionDescription: string | undefined;

  /**
   * [model/entity/Promotion.cfc:L56] `ormtype="boolean" default="1"`.
   *
   * Stored in its raw persisted form and coerced only in the accessor, matching
   * src/domain/entities/priceGroup.ts:L308. The ORM `default="1"` applies at INSERT time in the
   * database, not in the hydrated object, so a row written before the default existed can still
   * arrive as SQL NULL - which is exactly the boundary `cfBoolean()` documents and resolves.
   */
  private readonly activeFlag: CfBooleanInput;

  /** [model/entity/Promotion.cfc:L59] many-to-one onto the out-of-scope `Image`, `fkcolumn="defaultImageID"`. */
  private readonly defaultImage: PromotionDefaultImageLink | undefined;

  /**
   * [model/entity/Promotion.cfc:L62] `one-to-many` onto `PromotionPeriod`, `fkcolumn="promotionID"`,
   * `cascade="all-delete-orphan"`, `inverse="true"`.
   *
   * MUTABLE ARRAY, HANDED OUT LIVE. `inverse="true"` means `PromotionPeriod` owns the foreign key,
   * and PromotionPeriod.cfc:L101 mutates THIS array in place through `getPromotionPeriods()`. The
   * field is `readonly` so the binding can never be replaced, while the array's CONTENTS stay
   * mutable - those are two different guarantees and both are wanted.
   */
  private readonly promotionPeriods: PromotionPeriod[];

  /**
   * [model/entity/Promotion.cfc:L63] `one-to-many` onto `PromotionCode`, `fkcolumn="promotionID"`,
   * `cascade="all-delete-orphan"`, `inverse="true"`. LIVE, per PromotionCode.cfc:L105 and L116.
   */
  private readonly promotionCodes: PromotionCode[];

  /**
   * [model/entity/Promotion.cfc:L64] `one-to-many` onto `PromotionApplied`, `fkcolumn="promotionID"`,
   * `cascade="all"`, `inverse="true"`. LIVE, per PromotionApplied.cfc:L82 and L91.
   *
   * Note the cascade differs from its two siblings - `all` rather than `all-delete-orphan` - and
   * that difference is preserved in this comment rather than normalised, because it is part of the
   * schema contract. This is also the collection `isDeletable()` counts.
   */
  private readonly appliedPromotions: PromotionApplied[];

  /** [model/entity/Promotion.cfc:L67] `remoteID`, the integration correlation column. */
  private readonly remoteID: string | undefined;

  /** [model/entity/Promotion.cfc:L70] `hb_populateEnabled="false" ormtype="timestamp"`. */
  private readonly createdDateTime: Date | undefined;

  /**
   * [model/entity/Promotion.cfc:L71] many-to-one onto the out-of-scope `Account`,
   * `fkcolumn="createdByAccountID"`. Reduced to the opaque identifier, exactly as
   * src/domain/entities/skuCurrency.ts:L583 and every other in-scope entity does: `Account` is
   * explicitly out of scope, and an audit column needs no behaviour from it.
   */
  private readonly createdByAccountID: string | undefined;

  /** [model/entity/Promotion.cfc:L72] `hb_populateEnabled="false" ormtype="timestamp"`. */
  private readonly modifiedDateTime: Date | undefined;

  /** [model/entity/Promotion.cfc:L73] many-to-one onto `Account`, `fkcolumn="modifiedByAccountID"`. */
  private readonly modifiedByAccountID: string | undefined;

  /**
   * The delete-context evaluator required by `getPromotionCodesDeletableFlag()`. `undefined` when
   * the promotion was hydrated without one, which is a legitimate state for every read path that
   * does not ask the deletable question. See the note on `PromotionCodeDeletableEvaluator`.
   */
  private readonly promotionCodeDeletableEvaluator: PromotionCodeDeletableEvaluator | undefined;

  /**
   * [model/entity/Promotion.cfc:L76] `property name="currentFlag" type="boolean"
   * persistent="false";` - the memo behind `getCurrentFlag()`.
   *
   * REQUEST-SCOPED, NOT MODULE-SCOPED. The legacy memo lives in the component's `variables` scope,
   * which on a warm Lambda container would persist between unrelated invocations and could leak
   * one request's answer into another's. Entity instances in this port are created per request by
   * the repository, so the memo is instance-scoped and the hazard does not arise.
   */
  private currentFlag: boolean | undefined;

  /** [model/entity/Promotion.cfc:L77] memo behind `getCurrentPromotionPeriodFlag()`. */
  private currentPromotionPeriodFlag: boolean | undefined;

  /** [model/entity/Promotion.cfc:L78] memo behind `getCurrentPromotionCodeFlag()`. */
  private currentPromotionCodeFlag: boolean | undefined;

  /**
   * [model/entity/Promotion.cfc:L79] declares the non-persistent property as
   * `promotionCodesDeletableFlag`, and L124-L134 uses TWO FURTHER SPELLINGS of it. See the
   * LEGACY-DEFECT marker on `getPromotionCodesDeletableFlag()`; this single field reproduces the
   * observable outcome of that three-way mismatch.
   */
  private promotionCodeDeleteableFlag: boolean | undefined;

  /**
   * Constructed from a repository row plus its materialized associations. Never constructed from a
   * sibling entity module: row-to-entity hydration belongs entirely to
   * `src/repositories/mysql/**`, which is why no `new Promotion(...)` appears anywhere under
   * `src/domain/`.
   *
   * Every collection parameter is OPTIONAL and defaults to `[]`. That default is not a convenience:
   * a Hibernate-managed collection never handed back null, so an entity hydrated without a join
   * must present an empty array rather than `undefined`. The legacy test
   * meta/tests/unit/entity/BrandTest.cfc asserts exactly that convention for `Brand.getProducts()`,
   * and it is applied uniformly across the folder.
   */
  constructor(init: {
    readonly promotionID: string;
    readonly promotionName?: string | undefined;
    readonly promotionSummary?: string | undefined;
    readonly promotionDescription?: string | undefined;
    readonly activeFlag?: CfBooleanInput;
    readonly defaultImage?: PromotionDefaultImageLink | undefined;
    readonly promotionPeriods?: PromotionPeriod[] | undefined;
    readonly promotionCodes?: PromotionCode[] | undefined;
    readonly appliedPromotions?: PromotionApplied[] | undefined;
    readonly remoteID?: string | undefined;
    readonly createdDateTime?: Date | undefined;
    readonly createdByAccountID?: string | undefined;
    readonly modifiedDateTime?: Date | undefined;
    readonly modifiedByAccountID?: string | undefined;
    readonly promotionCodeDeletableEvaluator?: PromotionCodeDeletableEvaluator | undefined;
  }) {
    this.promotionID = init.promotionID;
    this.promotionName = init.promotionName;
    this.promotionSummary = init.promotionSummary;
    this.promotionDescription = init.promotionDescription;
    this.activeFlag = init.activeFlag;
    this.defaultImage = init.defaultImage;
    this.promotionPeriods = init.promotionPeriods ?? [];
    this.promotionCodes = init.promotionCodes ?? [];
    this.appliedPromotions = init.appliedPromotions ?? [];
    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
    this.promotionCodeDeletableEvaluator = init.promotionCodeDeletableEvaluator;
  }

  // ============ START: Persistent Property Accessors ===================
  // Legacy names carried over verbatim in CFML camelCase. Interface parity is the acceptance
  // contract for this port, so a reviewer can diff the two surfaces directly; renaming any of
  // these to something more idiomatic would break exactly the property that makes the port
  // checkable.

  /** [model/entity/Promotion.cfc:L52] */
  getPromotionID(): string {
    return this.promotionID;
  }

  /** [model/entity/Promotion.cfc:L53] */
  getPromotionName(): string | undefined {
    return this.promotionName;
  }

  /** [model/entity/Promotion.cfc:L54] */
  getPromotionSummary(): string | undefined {
    return this.promotionSummary;
  }

  /** [model/entity/Promotion.cfc:L55] */
  getPromotionDescription(): string | undefined {
    return this.promotionDescription;
  }

  /**
   * [model/entity/Promotion.cfc:L56] `ormtype="boolean" default="1"`.
   *
   * Resolved through `cfBoolean()` rather than returned raw. That helper is the documented
   * persisted-flag boundary: SQL NULL resolves to `false` there, because nine undefaulted
   * `ormtype="boolean"` columns across the in-scope entities make NULL an expected column state
   * rather than a programming error. It is deliberately NOT `cfTruthy()`, which raises on nullish.
   */
  getActiveFlag(): boolean {
    return cfBoolean(this.activeFlag);
  }

  /** [model/entity/Promotion.cfc:L59] `undefined` when the repository did not join `SwImage`. */
  getDefaultImage(): PromotionDefaultImageLink | undefined {
    return this.defaultImage;
  }

  /** [model/entity/Promotion.cfc:L67] */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [model/entity/Promotion.cfc:L70] */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /** [model/entity/Promotion.cfc:L71] */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/Promotion.cfc:L72] */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** [model/entity/Promotion.cfc:L73] */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // ============  END: Persistent Property Accessors ====================

  // ============ START: Collection Accessors ============================

  /**
   * [model/entity/Promotion.cfc:L62]
   *
   * RETURNS THE LIVE ARRAY. `PromotionPeriod.setPromotion` appends to it in place at
   * PromotionPeriod.cfc:L101 and `PromotionPeriod.removePromotion` searches and splices it at
   * L108/L110, both through this accessor. Returning a copy would break the far side silently.
   */
  getPromotionPeriods(): PromotionPeriod[] {
    return this.promotionPeriods;
  }

  /**
   * [model/entity/Promotion.cfc:L63]
   *
   * RETURNS THE LIVE ARRAY, per PromotionCode.cfc:L105 (`arrayAppend`) and L116
   * (`arrayDeleteAt`). Also read by `getCurrentFlag()`, `getCurrentPromotionCodeFlag()` and
   * `getPromotionCodesDeletableFlag()` below.
   */
  getPromotionCodes(): PromotionCode[] {
    return this.promotionCodes;
  }

  /**
   * [model/entity/Promotion.cfc:L64]
   *
   * RETURNS THE LIVE ARRAY, per PromotionApplied.cfc:L82 (`arrayAppend`) and L91
   * (`arrayDeleteAt`). This is the collection `isDeletable()` counts, which is why its emptiness
   * is load-bearing rather than incidental.
   */
  getAppliedPromotions(): PromotionApplied[] {
    return this.appliedPromotions;
  }

  // ============  END: Collection Accessors =============================

  // ============ START: Containment Probes ==============================
  // None of the three has a hand-written legacy body: all are synthesised by the `hasAny*` /
  // implicit-collection dispatcher at org/Hibachi/HibachiEntity.cfc:L507-L565, whose CFML
  // semantics are Hibernate's collection-contains - session identity, i.e. primary key for a
  // persistent row. All three are called from across a module boundary by the child that owns the
  // foreign key, so all three must exist here even though the source declares none of them.
  //
  // THE PROJECT-WIDE CONTAINMENT RULE, applied uniformly: compare by PRIMARY KEY, with a
  // REFERENCE fallback when either side is unsaved. The fallback is not optional. Every unsaved
  // row's key is the empty string (`unsavedvalue=""`), so a pure key comparison would report two
  // DIFFERENT unsaved children as the same row and the far side's guard would skip a legitimate
  // append.

  /** Containment probe for `promotionPeriods` [model/entity/Promotion.cfc:L62]. */
  hasPromotionPeriod(promotionPeriod: PromotionPeriod): boolean {
    const candidateID: string = promotionPeriod.getPromotionPeriodID();
    if (candidateID === '') {
      return this.promotionPeriods.includes(promotionPeriod);
    }
    return this.promotionPeriods.some(
      (held: PromotionPeriod) => held.getPromotionPeriodID() === candidateID,
    );
  }

  /** Containment probe for `promotionCodes` [model/entity/Promotion.cfc:L63]. */
  hasPromotionCode(promotionCode: PromotionCode): boolean {
    const candidateID: string = promotionCode.getPromotionCodeID();
    if (candidateID === '') {
      return this.promotionCodes.includes(promotionCode);
    }
    return this.promotionCodes.some(
      (held: PromotionCode) => held.getPromotionCodeID() === candidateID,
    );
  }

  /** Containment probe for `appliedPromotions` [model/entity/Promotion.cfc:L64]. */
  hasAppliedPromotion(promotionApplied: PromotionApplied): boolean {
    const candidateID: string = promotionApplied.getPromotionAppliedID();
    if (candidateID === '') {
      return this.appliedPromotions.includes(promotionApplied);
    }
    return this.appliedPromotions.some(
      (held: PromotionApplied) => held.getPromotionAppliedID() === candidateID,
    );
  }

  // ============  END: Containment Probes ===============================

  /**
   * [org/Hibachi/HibachiEntity.cfc:L707-L709] `isNew()` returns `getNewFlag()`, and
   * [org/Hibachi/HibachiEntity.cfc:L571-L576] `getNewFlag()` returns
   * `getPrimaryIDValue() == ""`. With `unsavedvalue="" default=""` on
   * [model/entity/Promotion.cfc:L52], that reduces exactly to the test below.
   *
   * Read by every child's `set<Parent>` guard, which is why it is public rather than private.
   */
  isNew(): boolean {
    return this.promotionID === '';
  }

  // ============ START: Non-Persistent Property Methods =================
  // [model/entity/Promotion.cfc:L81] opens this block and L136 closes it. All four members are
  // ported; all four are memoized in the source and all four are memoized here.
  //
  // ONE STRUCTURAL NOTE THAT APPLIES TO ALL FOUR. The legacy guard is
  // `if(!structKeyExists(variables, "<name>"))`, which tests KEY PRESENCE, not truthiness. The
  // faithful TypeScript equivalent is `if (this.<field> === undefined)`, because these memos hold
  // `boolean` and `false` is a legitimate memoized answer that must NOT re-trigger the
  // computation. Writing `if (!this.<field>)` would recompute on every call after a `false`
  // result, which changes nothing observable for three of the four but is wrong in principle and
  // is avoided uniformly.

  /**
   * `getCurrentFlag` - is this promotion currently in force?
   * [model/entity/Promotion.cfc:L83-L92]
   *
   * The legacy body, verbatim:
   *
   *   variables.currentFlag = false;
   *   if( getCurrentPromotionPeriodFlag() && ( !arrayLen(getPromotionCodes()) || getCurrentPromotionCodeFlag() ) ) {
   *     variables.currentFlag = true;
   *   }
   *
   * TWO SEMANTIC POINTS, both preserved deliberately.
   *
   *   1. THE CODE TEST IS PERMISSIVE ON AN EMPTY COLLECTION. `!arrayLen(getPromotionCodes())`
   *      means a promotion with NO codes is current purely on the strength of its periods - a code
   *      is a restriction, not a requirement. This is one instance of the project's five distinct
   *      empty-collection semantics, and collapsing it into the restrictive reading would silently
   *      stop every codeless promotion from ever applying.
   *   2. `&&` AND `||` SHORT-CIRCUIT IN CFML EXACTLY AS THEY DO IN TYPESCRIPT, so the operand
   *      order is meaningful and is preserved: `getCurrentPromotionCodeFlag()` is not evaluated at
   *      all when the collection is empty, and neither code-side call is evaluated when no period
   *      is current. Since both callees are themselves memoized, that ordering is observable only
   *      through which memos get populated - but it is preserved anyway, because "observable only
   *      indirectly" is not the same as "not observable".
   */
  getCurrentFlag(): boolean {
    if (this.currentFlag === undefined) {
      this.currentFlag = false;
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
   * `getCurrentPromotionPeriodFlag` - does ANY period currently apply?
   * [model/entity/Promotion.cfc:L95-L107]
   *
   * The legacy loop is an indexed `for` from 1 to `arrayLen(getPromotionPeriods())` with a `break`
   * on the first hit; `Array.prototype.some` is the exact equivalent, including the
   * short-circuit, and is used because it removes the 1-based/0-based translation risk entirely
   * rather than merely handling it.
   *
   * `PromotionPeriod.getCurrentFlag()` takes NO argument. That is deliberate and is the reason
   * this method needs no clock: PromotionPeriod owns its own injected clock for `getCurrentFlag()`
   * and `isExpired()`, and the AAP licenses exactly one entity-layer signature widening -
   * `isCurrent(now: Date)` - which this call path does not use.
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
   * `getCurrentPromotionCodeFlag` - does ANY code currently apply?
   * [model/entity/Promotion.cfc:L109-L121]
   *
   * Structurally identical to `getCurrentPromotionPeriodFlag()`, over `promotionCodes` and
   * `PromotionCode.getCurrentFlag()`. The source's own trailing-whitespace difference at L117
   * versus L103 is cosmetic and is not reproduced.
   */
  getCurrentPromotionCodeFlag(): boolean {
    if (this.currentPromotionCodeFlag === undefined) {
      this.currentPromotionCodeFlag = this.promotionCodes.some((code: PromotionCode) =>
        code.getCurrentFlag(),
      );
    }
    return this.currentPromotionCodeFlag;
  }

  // *** LEGACY-DEFECT [model/entity/Promotion.cfc:L123-L134]: getPromotionCodesDeletableFlag()
  // USES THREE DIFFERENT SPELLINGS OF ONE MEMO KEY. The non-persistent property is declared
  // `promotionCodesDeletableFlag` at L79; the presence guard at L124 tests
  // `variables.promotionCodeDeletableFlag` (singular "Code", "Deletable"); and the writes and the
  // return at L125, L128 and L133 all use `variables.promotionCodeDeleteableFlag` (singular
  // "Code", "DeletEable"). The guarded key is therefore NEVER THE KEY THAT GETS WRITTEN, so
  // MEMOIZATION NEVER TAKES EFFECT and the loop re-runs on every single call. This is the same
  // class of defect as register entry 18 in model/entity/Sku.cfc:L512-L522, where a struct is
  // populated under one name and returned under another.
  //
  // The observable consequence is confined to redundant recomputation: the value RETURNED is
  // always freshly computed and always correct for the current collection state, because the
  // write and the return agree with each other even though neither agrees with the guard. That is
  // why this is reproduced rather than spent as one of the port's three documented divergences -
  // there is no behavioural difference to preserve, only a cost, and the cost is bounded by the
  // number of promotion codes.
  //
  // HOW IT IS REPRODUCED: the memo field exists and is written, but the guard is deliberately
  // absent, which yields exactly the legacy behaviour - recompute every call, memo written but
  // never consulted. Adding the guard would be the silent repair.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * `getPromotionCodesDeletableFlag` - are ALL of this promotion's codes deletable?
   * [model/entity/Promotion.cfc:L123-L134]
   *
   * The legacy body starts from `true` and flips to `false` on the first non-deletable code, with
   * a `break`. An EMPTY collection therefore answers `true`, which is correct: a promotion with no
   * codes has no code blocking its deletion.
   *
   * ★ RAISES when the promotion was hydrated without a delete-context evaluator, and that choice
   * is deliberate rather than defensive. The return type is `boolean`, so there is no spare value
   * to signal "cannot answer": BOTH answers are meaningful, and both are destructive if wrong. A
   * default of `true` would report a promotion as safely deletable while its codes are still
   * attached to real orders - the exact outcome model/validation/PromotionCode.json's
   * `{"contexts":"delete","maxCollection":0}` rule exists to prevent. A default of `false` would
   * permanently block a legitimate deletion. This mirrors the identical reasoning already recorded
   * on `Option.getImageDirectory()`, whose return type is `string` and whose every possible
   * default is a well-formed WRONG path handed to file-deletion code.
   *
   * The evaluator is asked per code rather than for the collection as a whole, because that is
   * what the legacy loop does: `promotionCode.isDeletable()` is evaluated one code at a time and
   * the loop stops at the first `false`. `Array.prototype.every` reproduces both the accumulation
   * and the short-circuit.
   */
  getPromotionCodesDeletableFlag(): boolean {
    const evaluator: PromotionCodeDeletableEvaluator | undefined =
      this.promotionCodeDeletableEvaluator;
    if (evaluator === undefined) {
      throw new Error(
        'Promotion.getPromotionCodesDeletableFlag was called on a promotion hydrated without a ' +
          'promotion-code delete-context evaluator. model/entity/Promotion.cfc:L127 calls ' +
          'promotionCode.isDeletable(), which resolves to ' +
          'org/Hibachi/HibachiEntity.cfc:L204-L206 and evaluates the delete context of ' +
          'model/validation/PromotionCode.json against the SwOrderPromotionCode link table. That ' +
          'is a service reach-out an entity cannot perform, so it arrives as an injected port ' +
          '(transformation rule T2). No default is substituted: this method returns boolean, ' +
          'both answers are meaningful, and both are destructive when wrong - true would report a ' +
          'promotion as deletable while its codes are attached to live orders, and false would ' +
          'block a legitimate deletion permanently.',
      );
    }

    // The memo is written to reproduce the legacy write at L125/L128, and is deliberately NOT read
    // back, because the legacy guard at L124 tests a different key and therefore never matches.
    // See the LEGACY-DEFECT marker directly above.
    this.promotionCodeDeleteableFlag = this.promotionCodes.every((promotionCode: PromotionCode) =>
      evaluator.isDeletable(promotionCode),
    );

    return this.promotionCodeDeleteableFlag;
  }

  // ============  END: Non-Persistent Property Methods ==================

  // ============= START: Bidirectional Helper Methods ===================
  // [model/entity/Promotion.cfc:L138] opens this block and L166 closes it. All six members are
  // PURE DELEGATIONS: this side is the `inverse="true"` half of all three associations, so the
  // child owns the foreign key and the child's own `set<Parent>` / `remove<Parent>` performs BOTH
  // halves of the update - assigning its own field and reaching back into this entity's live
  // array. Nothing is appended or spliced here, and adding such a step would double-append.
  //
  // Each retains its legacy name and `void` return exactly. Note the source's own casing
  // inconsistency, preserved in these comments and NOT reproduced in the TypeScript identifiers,
  // since CFML argument names are case-insensitive and TypeScript parameter names are not
  // observable to callers: L141/L144 declare `required any PromotionPeriod` with a capital P,
  // while L149/L153 and L158/L162 use lower-case first letters.

  /** [model/entity/Promotion.cfc:L141-L143] `arguments.PromotionPeriod.setPromotion( this );` */
  addPromotionPeriod(promotionPeriod: PromotionPeriod): void {
    promotionPeriod.setPromotion(this);
  }

  /** [model/entity/Promotion.cfc:L144-L146] `arguments.PromotionPeriod.removePromotion( this );` */
  removePromotionPeriod(promotionPeriod: PromotionPeriod): void {
    promotionPeriod.removePromotion(this);
  }

  /** [model/entity/Promotion.cfc:L149-L151] `arguments.promotionCode.setPromotion(this);` */
  addPromotionCode(promotionCode: PromotionCode): void {
    promotionCode.setPromotion(this);
  }

  /** [model/entity/Promotion.cfc:L153-L155] `arguments.promotionCode.removePromotion(this);` */
  removePromotionCode(promotionCode: PromotionCode): void {
    promotionCode.removePromotion(this);
  }

  /** [model/entity/Promotion.cfc:L158-L160] `arguments.promotionApplied.setPromotion(this);` */
  addAppliedPromotion(promotionApplied: PromotionApplied): void {
    promotionApplied.setPromotion(this);
  }

  /** [model/entity/Promotion.cfc:L162-L164] `arguments.promotionApplied.removePromotion(this);` */
  removeAppliedPromotion(promotionApplied: PromotionApplied): void {
    promotionApplied.removePromotion(this);
  }

  // =============  END:  Bidirectional Helper Methods ===================

  // ================== START: Overridden Methods ========================

  /**
   * `isDeletable` [model/entity/Promotion.cfc:L170-L172]
   *
   * `return arrayLen( getAppliedPromotions() ) == 0;`
   *
   * ★ THIS IS AN OVERRIDE, AND THE DISTINCTION MATTERS. It REPLACES the framework's
   * validation-driven version at org/Hibachi/HibachiEntity.cfc:L204-L206, which reaches out
   * through `getService("hibachiValidationService")`. Because `Promotion` overrides it with a body
   * that only counts a materialized collection, this method needs no injected collaborator and
   * stays synchronous and total - unlike `getPromotionCodesDeletableFlag()` above, which needs
   * `PromotionCode`'s INHERITED validation-driven version and therefore does.
   *
   * Two methods with the same name and completely different mechanisms; conflating them is the
   * mistake this note exists to prevent. src/domain/entities/promotionCode.ts:L1941 records the
   * same distinction from its own side.
   *
   * A note on fetch shape: this answer is only as good as the join that produced
   * `appliedPromotions`. A promotion hydrated without `SwPromotionApplied` reads as deletable.
   * That is a repository obligation, documented at the producing method, and it is the same class
   * of consideration as the `maxCollection:0` note in promotionCode.ts - recorded so it is
   * auditable rather than hidden.
   */
  isDeletable(): boolean {
    return this.appliedPromotions.length === 0;
  }

  // ==================  END:  Overridden Methods ========================

  // =================== START: ORM Event Hooks  =========================
  // [model/entity/Promotion.cfc:L176] opens this block and L178 closes it, AND THE SOURCE BLOCK IS
  // COMPLETELY EMPTY. `Promotion` declares neither `preInsert()` nor `preUpdate()`, so this class
  // declares neither either. That is a deliberate absence, not an omission: three in-scope
  // entities DO carry hooks - Category.cfc:L126/L131, PriceGroup.cfc:L206/L211 and
  // ProductType.cfc:L305/L310, all three maintaining a materialized ID path - plus
  // PromotionCode.cfc:L179 which carries `preInsert()` only. `Promotion` has no path column and no
  // generated value to seed, so it needs no hook. Adding one to "standardise" the folder would
  // invent lifecycle behaviour the source does not have.
  // ===================  END:  ORM Event Hooks  =========================
}

// ---------------------------------------------------------------------------
// WHAT THE TEST TIER MUST PIN FOR THIS MODULE (all of it NET-NEW - `Promotion` has no legacy test)
//
//   1. `getPromotionPeriods()`, `getPromotionCodes()` and `getAppliedPromotions()` each return the
//      SAME ARRAY IDENTITY on repeated calls, and a push performed on the returned reference is
//      visible through a subsequent call. This is the LIVE contract the three child modules
//      depend on; asserting only the contents would pass against a defensive copy.
//   2. All three default to `[]` when the constructor omits them - never `undefined`.
//   3. `getCurrentFlag()` is TRUE for a promotion with a current period and NO codes (the
//      permissive empty-collection reading), TRUE with a current period and at least one current
//      code, and FALSE with a current period and only non-current codes.
//   4. `getCurrentFlag()` is FALSE whenever no period is current, regardless of the codes.
//   5. All three flag methods memoize: a second call does not re-consult the children. Pin this by
//      counting calls on a stub child, since the memo is private.
//   6. `getCurrentPromotionPeriodFlag()` and `getCurrentPromotionCodeFlag()` short-circuit on the
//      first current child rather than visiting the whole collection.
//   7. `getPromotionCodesDeletableFlag()` RAISES when no evaluator was supplied - assert the raise,
//      not a fallback value.
//   8. With an evaluator supplied it is TRUE for an empty collection, TRUE when every code is
//      deletable, FALSE on the first non-deletable code, and it SHORT-CIRCUITS there.
//   9. `getPromotionCodesDeletableFlag()` DOES NOT MEMOIZE - two calls consult the evaluator twice.
//      This is the preserved defect at model/entity/Promotion.cfc:L124 and must be asserted
//      positively, or a future "optimisation" will silently change behaviour.
//  10. `isDeletable()` is TRUE for an empty `appliedPromotions` and FALSE for a non-empty one.
//  11. `isNew()` is TRUE for `promotionID: ''` and FALSE otherwise.
//  12. The three `has*` probes match by PRIMARY KEY across two distinct objects representing the
//      same saved row, and fall back to REFERENCE identity when the candidate's key is `''` - so
//      two DIFFERENT unsaved children are not reported as the same row.
//  13. All six bidirectional helpers delegate and perform NO local mutation: after
//      `addPromotionCode(code)` against a stub whose `setPromotion` does nothing, this entity's
//      `promotionCodes` is still empty. This is what proves the inverse side is not double-writing.
//  14. `getActiveFlag()` resolves `undefined`, `null`, `0`, `1`, `'0'`, `'1'`, `'true'` and
//      `'false'` exactly as `cfBoolean()` specifies.
//  15. The class exposes NO `getPromotionAccounts()` and NO `hasPromotionAccount()`. Assert their
//      absence explicitly - this is the anti-contract, and an accidental future addition would
//      silently repair two throwing defects in promotionAccount.ts.
// ---------------------------------------------------------------------------
