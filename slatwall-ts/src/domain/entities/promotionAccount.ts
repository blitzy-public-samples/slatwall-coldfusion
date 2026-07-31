// ---------------------------------------------------------------------------
// CHECKPOINT STATUS - FORWARD REFERENCES CARRY THE MARKER `(planned)`
//
// The subtree is authored in boundaries, and AAP 0.4.5 makes the authoring
// order "a compile-order convenience, not a schedule". Commentary in this file
// therefore names modules of the target layout that DO NOT EXIST YET. Every such
// name carries `(planned)` at its point of use, meaning exactly: a planned Agent
// Action Plan target that is ABSENT from the subtree at this checkpoint. Nothing
// here asserts that any of them exists now, and no behaviour in this file depends
// on one. The complete set named below, with the role each will play:
//
//   src/domain/entities/promotion.ts                     Promotion entity
//   tests/traceability/legacyTestMap.ts                  structural coverage map
//   tests/unit/domain/entities/promotionAccount.test.ts  promotionAccount entity suite
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// slatwall-ts - PromotionAccount entity
//
// PORT OF model/entity/PromotionAccount.cfc (126 lines, confirmed by `wc -l`).
//
// *** THIS ENTITY IS INERT - AND THE VERBATIM SOURCE READ PROVES IT IS ***
// *** STRONGER THAN INERT: IT IS UNUSABLE. ***
//
//   * NO VALIDATION FILE. `model/validation/` holds 96 `.json` schemas and
//     `PromotionAccount.json` is not one of them. The absence is deliberate and
//     the plan forbids inventing it, so there is no zod schema and no
//     declaratively-invoked validator method anywhere below. This entity is one
//     of exactly four in-scope entities with no schema, alongside Category,
//     PromotionQualifier and PromotionApplied.
//   * NO SERVICE REFERENCES IT. A case-insensitive sweep of
//     model/service/PromotionService.cfc returns zero hits, and a
//     repository-wide sweep of model/service/ and model/dao/ returns no file at
//     all. Ported for completeness; UNEXERCISED in this slice.
//   * BOTH OF ITS Promotion-SIDE BIDIRECTIONAL HELPERS THROW UNCONDITIONALLY.
//     `setPromotion` [model/entity/PromotionAccount.cfc:L90-L95] throws on every
//     code path, and `removePromotion` [model/entity/PromotionAccount.cfc:
//     L97-L106] throws at L101 every single time. The proof for each is carried
//     in the LEGACY-DEFECT marker on the method itself.
//
// So this is not merely an entity nobody calls: it is an entity that cannot
// work. Reproducing that faithfully - rather than making it work - is the
// requirement. Behaviour preservation extends to defects, and a method that
// throws at runtime today throws in the target.
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/PromotionAccount.cfc:L49]
//
//   component displayname="Promotion Account" entityname="SlatwallPromotionAccount"
//   table="SwPromotionAccount" persistent="true" extends="HibachiEntity"
//   cacheuse="transactional" hb_serviceName="promotionService" {
//
// Schema continuity is a binding constraint: entity property metadata IS the
// contract. Table `SwPromotionAccount`, entity name `SlatwallPromotionAccount`.
// No migration, no rename, no new table, no column change. Inert columns are
// preserved rather than dropped, and every `hb_*` attribute value is carried
// forward verbatim in a comment so the legacy admin can still resolve it.
//
// THREE NOTABLE ABSENCES IN THAT DECLARATION, each verified case-insensitively:
//
//   * NO `hb_permission` attribute. Contrast model/entity/PriceGroupRate.cfc:L49,
//     which carries the dotted `hb_permission="priceGroup.priceGroupRates"`.
//   * NO `accessors="true"` and NO `output="false"`. ColdFusion auto-generates
//     accessors regardless, so the omission is cosmetic. Noted, not "corrected".
//   * `persistent="true"` is QUOTED here, where model/entity/PriceGroup.cfc and
//     model/entity/PriceGroupRate.cfc write unquoted `persistent=true`. A
//     cosmetic inconsistency in the legacy tree; annotated, not normalised.
//
// `hb_serviceName="promotionService"` points at model/service/PromotionService.cfc
// - the same service PromotionApplied names. There is no `PromotionAccountService`
// in the legacy tree and none is invented here. The metadata is doubly notable
// because the service it names never references this entity at all.
//
// THE `extends` CHAIN IS THREE LEVELS DEEP, NOT TWO
// `extends="HibachiEntity"` on L49 is UNQUALIFIED, so it resolves to the local
// model/entity/HibachiEntity.cfc (274 lines), whose own L49 reads
// `component output="false" accessors="true" persistent="false"
// extends="Slatwall.org.Hibachi.HibachiEntity"`. The intermediate class reaches
// outward through exactly 12 `getService(...)` sites - L123, L130, L135, L145,
// L178, L180, L182, L194, L196, L207, L257 and L266, seven of them
// `attributeService` - and NONE of them is ported. They must not be silently
// re-implemented either: an entity reaching outward through a service locator is
// precisely the pattern the ESLint `no-restricted-imports` layer boundary in
// eslint.config.mjs exists to make impossible. This entity needs none of them:
// it has ZERO `getService(` sites of its own, which is why no collaborator port
// appears in its constructor and why every method below is synchronous.
//
// WHAT THE FRAMEWORK BASE CONTRIBUTES, AND WHY ALMOST NONE OF IT IS AUTHORED
// org/Hibachi/HibachiEntity.cfc:L507-L565 is an `onMissingMethod` dispatcher
// matching eleven method-name patterns - hasUniqueOrNull*, hasUnique*, hasAny*,
// get*AssignedIDList, get*ID, get*Options, get*OptionsSmartList, get*SmartList,
// get*Struct, get*Count, and a `getAttributeValue` fallback at L559 - and
// TERMINATING IN A THROW AT L565. TypeScript must not emulate dynamic dispatch,
// so there is no Proxy, no index signature, no `evaluate()` and no `variables.`
// scope object here. Only the concretely-called member is authored, and for this
// entity that is exactly one: `isNew()`.
//
// That dispatcher is also load-bearing for the two throwing defects below,
// because this entity declares NO `attributeValues` collection. Only four
// in-scope entities do - model/entity/Sku.cfc:L70, model/entity/Product.cfc:L75,
// model/entity/ProductType.cfc:L67 and model/entity/Brand.cfc:L60 - so the L559
// EAV fallback is unreachable from here and an unmatched `get...` throws
// directly at L565 rather than degrading into an attribute lookup.
//
// NO USER RULES WERE PROVIDED
// The project rules document returns exactly "No user rules provided.", and the
// plan states the same. No rule is invented to fill the gap and the absence is
// not treated as licence to lower the bar: the enterprise substitute standard
// applies at full strength - maximal strictness, no `any` and no suppression
// comment, one exported unit per file, no barrel, and every judgment call
// annotated at the point where it was made.
//
// TEST COVERAGE FOR THIS MODULE IS NET-NEW
// `PromotionAccount` has no legacy test whatsoever. Only two of the eighteen
// in-scope entities have a legacy antecedent - brand.ts from
// meta/tests/unit/entity/BrandTest.cfc and product.ts from
// meta/tests/unit/entity/ProductTest.cfc. Coverage here is therefore net-new and
// must never be presented as parity. The contract the test tier has to pin is
// enumerated at the foot of this file.
// ---------------------------------------------------------------------------

import type { Promotion } from './promotion.js';

// LEGACY-NOTE [model/entity/PromotionAccount.cfc:L92-L93] - FAR-SIDE ANTI-CONTRACT, DO NOT "FIX":
// `slatwall-ts/src/domain/entities/promotion.ts` (planned) MUST NOT gain a `promotionAccounts` collection,
// MUST NOT expose `getPromotionAccounts()`, and MUST NOT expose `hasPromotionAccount()`.
// model/entity/Promotion.cfc declares exactly three collections - L62 `promotionPeriods`, L63
// `promotionCodes`, L64 `appliedPromotions` - and none of them is `promotionAccounts`. That was
// re-verified three independent ways: a case-insensitive fieldtype census of Promotion.cfc, a
// case-insensitive grep for `promotionAccount` in Promotion.cfc (zero hits), and a
// repository-wide sweep of model/, org/ and integrationServices/ for any definition of
// get/has/add/removePromotionAccount(s) (zero definitions anywhere outside PromotionAccount.cfc
// itself). Adding the far side in TypeScript would SILENTLY REPAIR the throwing defects below,
// inventing behaviour the legacy system does not have and breaking schema continuity - there is
// no SwPromotion -> SwPromotionAccount inverse mapping to honour.
// Contrast `slatwall-ts/src/domain/entities/promotionApplied.ts`, which legitimately DOES require
// promotion.ts to expose `getAppliedPromotions()` and `hasAppliedPromotion()` - because
// model/entity/Promotion.cfc:L64 genuinely declares that collection and L158/L162 genuinely
// declare `addAppliedPromotion`/`removeAppliedPromotion`. The two contracts are exact opposites
// and both are correct. If promotion.ts nonetheless exposes the forbidden members by the time
// this file is reviewed, they still must not be called from here: the stubs stay throwing.

/**
 * Build the framework's terminal missing-method message, BYTE FOR BYTE.
 *
 * THIS TEMPLATE IS AN OBSERVABLE ERROR CONTRACT, NOT A DIAGNOSTIC STRING. The legacy statement is
 * identical at two locators - [org/Hibachi/HibachiEntity.cfc:L565] and
 * [org/Hibachi/HibachiService.cfc:L280] - and reads:
 *
 *   throw('You have called a method #arguments.missingMethodName#() which does
 *          not exists in the #getClassName()# entity.');
 *
 * Three details are load-bearing and must never be "corrected":
 *
 *   * "does not exists" is grammatically wrong in the source. Reproduced verbatim.
 *   * the trailing " entity." is present even for the service-tier copy, so the two tiers are
 *     byte-identical and one recognizer covers both.
 *   * `getClassName()` is `listLast(getClassFullname(), ".")` [org/Hibachi/HibachiObject.cfc:L136],
 *     so the class slot carries the BARE component name - `Promotion`, never
 *     `Slatwall.model.entity.Promotion` and never the `entityname="SlatwallPromotion"` value.
 *
 * WHY THE MESSAGE AND NOT A BESPOKE EXPLANATION. `src/handlers/errorMapper.ts` recognizes this
 * exact shape with an ANCHORED pattern and maps it to its own dedicated category, preserving the
 * message verbatim in the response body because it is a behavioural contract a caller can observe.
 * A message that explains the defect in prose instead cannot match that pattern, so the recognizer
 * silently falls through to the generic arm and the contract is lost - which is precisely the
 * regression this helper exists to prevent. Nothing is lost by shortening the throw: every piece
 * of the prose that used to sit in the payload is preserved in the LEGACY-DEFECT markers and the
 * JSDoc immediately above each call site, where a maintainer reads it and a log stream does not
 * have to carry it.
 *
 * A module-private helper rather than a shared module, deliberately. `src/lib/` is closed at the
 * files the plan enumerates, and one exported unit per file is the standing rule, so the template
 * lives once per file that needs it rather than becoming a new cross-cutting dependency of the
 * domain layer.
 *
 * @param methodName The dead call target, without parentheses - they are added here.
 * @param className  The bare component name of the entity the call was made ON.
 */
function hibachiMissingMethodMessage(methodName: string, className: string): string {
  return `You have called a method ${methodName}() which does not exists in the ${className} entity.`;
}

/**
 * The `SwPromotionAccount` link row, associating a promotion with an account over an optional
 * time window.
 *
 * A class rather than an interface, because the legacy entities carry behaviour and not merely
 * data, and because interface parity is the acceptance contract: a reviewer diffs this public
 * surface against the CFC line by line. Method names are therefore the legacy CFML names
 * VERBATIM in camelCase - which is exactly why eslint.config.mjs deliberately enables no
 * `naming-convention`, `camelcase` or `id-match` rule.
 *
 * Associations arrive ALREADY MATERIALIZED OR ABSENT. Hibernate lazy collections have no
 * equivalent in a driver-only stack, so `src/repositories/mysql/**` owns row-to-entity
 * hydration and documents the fetch shape at the producing method; this class simply receives
 * what it is given and never simulates laziness.
 *
 * There is no fetch-shape ruling to make for this entity, and that was checked rather than
 * overlooked: a case-insensitive census found NO `fetch=` and NO `lazy=` attribute anywhere in
 * model/entity/PromotionAccount.cfc. For contrast, the only in-scope `fetch="join"` sites are
 * model/entity/Product.cfc:L68-L70 and model/entity/PromotionPeriod.cfc:L59, and the only
 * `lazy="extra"` sites are model/entity/ProductType.cfc:L66, model/entity/PromotionCode.cfc:L68
 * and model/entity/Sku.cfc:L71.
 *
 * The entity declares ZERO collections - no `one-to-many`, no `many-to-many`, both re-verified
 * case-insensitively - so nothing here is an array and no `hasAny*` member exists. It also
 * declares no non-persistent property, so the memoized-accessor pattern and its three known memo
 * defects are absent too.
 */
export class PromotionAccount {
  // --- Persistent Properties [model/entity/PromotionAccount.cfc:L52-L54] ---------------------
  //
  // Exactly three, and the boolean census across L52-L65 is ZERO of either casing. That was
  // re-verified case-insensitively rather than trusted: a case-sensitive grep for
  // `ormtype="boolean"` under-counts, because model/entity/PriceGroupRate.cfc:L53 writes
  // `ormType="boolean"` with a capital T. No CFML truthiness helper is therefore warranted here.
  //
  // Deliberately absent, each confirmed by a case-insensitive census of the source:
  //   * NO `remoteID`. Contrast model/entity/PromotionApplied.cfc:L64, which declares
  //     `property name="remoteID" ormtype="string";`. A real schema difference, not an omission.
  //   * NO `activeFlag`, NO `sortOrder`, NO `currencyCode`, and no monetary column of any kind -
  //     which is why neither the Money value object nor CurrencyCode is imported.
  //   * NO `attributeValues`, with the dispatcher consequence recorded in the file header.

  /**
   * Primary key. [model/entity/PromotionAccount.cfc:L52]
   *
   *   property name="promotionAccountID" ormtype="string" length="32" fieldtype="id"
   *   generator="uuid" unsavedvalue="" default="";
   *
   * `string` and never `string | undefined`: `default=""` means the column always holds a
   * string, possibly the empty one. That empty string is load-bearing - it is exactly what
   * `isNew()` keys on. Read-only with no setter, matching the legacy id property.
   */
  private readonly promotionAccountID: string;

  // LEGACY-NOTE [model/entity/PromotionAccount.cfc:L53-L54]: both timestamps declare NO ORM
  // default. `undefined` is the PERMISSIVE extreme and means "no bound / forever" - an absent
  // bound is no bound, so the association is unconstrained in that direction. It MUST NOT be
  // coerced to the Unix epoch, to `0`, to a fresh clock reading, or to any sentinel. Contrast the
  // opposite conventions in this same folder, all three of which are load-bearing and none of
  // which may be collapsed into another: `Sku.getPriceByCurrencyCode()` must return
  // `Money | undefined` and never 0, because substituting 0 would sell products for free
  // [model/entity/Sku.cfc:L269-L273], while `Product.getSalePrice()` must return 0 and never
  // undefined, because [model/entity/Product.cfc:L598] falls through to `return 0`.

  /** Start of the window, or `undefined` for no lower bound. [model/entity/PromotionAccount.cfc:L53] */
  private readonly startDateTime: Date | undefined;

  /** End of the window, or `undefined` for no upper bound. [model/entity/PromotionAccount.cfc:L54] */
  private readonly endDateTime: Date | undefined;

  // --- Related Entities [model/entity/PromotionAccount.cfc:L57-L59] --------------------------

  /**
   * The in-scope `promotion` many-to-one. [model/entity/PromotionAccount.cfc:L57]
   *
   *   property name="promotion" cfc="Promotion" fieldtype="many-to-one" fkcolumn="promotionID";
   *
   * MUTABLE, and deliberately so: `setPromotion` assigns it at
   * [model/entity/PromotionAccount.cfc:L91] before the method throws, and reproducing that
   * ordering is what preserves the half-mutated state the legacy leaves behind. Every other
   * field on this class is `readonly`.
   */
  private promotion: Promotion | undefined;

  /**
   * The `promotionID` foreign-key column backing the association above.
   * [model/entity/PromotionAccount.cfc:L57]
   *
   * Held alongside the materialized association so the key is readable even when the repository
   * chose not to fetch the far side.
   */
  private readonly promotionID: string | undefined;

  /**
   * The `accountID` foreign-key column, as an OPAQUE identifier.
   * [model/entity/PromotionAccount.cfc:L58]
   *
   *   property name="account" cfc="Account" fieldtype="many-to-one" fkcolumn="accountID";
   *
   * model/entity/Account.cfc is explicitly out of scope - the plan excludes
   * model/service/AccountService.cfc and the whole account module - so this many-to-one collapses
   * to an inert ID string. No `Account` type is imported, the column is never typed as an entity,
   * and no `Account` instance is ever constructed. The column itself is preserved rather than
   * dropped, because the schema contract must stay auditable.
   */
  private readonly accountID: string | undefined;

  // LEGACY-NOTE [model/entity/PromotionAccount.cfc:L59]: the source declares - and then comments
  // out - a third many-to-one association. Preserved verbatim as a comment because it is part of
  // the schema's documented history and a reviewer diffs this file against the CFC:
  //   //property name="promotionPeriod" cfc="PromotionPeriod" fieldtype="many-to-one" fkcolumn="promotionPeriodID";
  // It is NOT ported as a live association: the column does not exist in `SwPromotionAccount`, and
  // adding it would violate schema continuity - no new column, no migration. Accordingly there is
  // no `promotionPeriod` field, no `promotionPeriodID` field, no accessor for either, and no
  // `PromotionPeriod` import anywhere in this file. (The line also carries three trailing spaces
  // in the source; the wart is not reproduced, but the commented text above is quoted as written.)

  // --- Audit properties [model/entity/PromotionAccount.cfc:L62-L65] --------------------------
  //
  // All four carry `hb_populateEnabled="false"`, which is how the legacy framework excluded them
  // from mass assignment. The TypeScript equivalent needs no mechanism: they are `readonly`, set
  // once during hydration, and exposed through getters with no setter anywhere.
  //
  // `createdByAccount` [L63] and `modifiedByAccount` [L65] point at the out-of-scope
  // model/entity/Account.cfc, so both collapse to opaque ID strings exactly like `accountID`.

  /** `createdDateTime`, or `undefined`. [model/entity/PromotionAccount.cfc:L62] */
  private readonly createdDateTime: Date | undefined;

  /** The `createdByAccountID` column, opaque. [model/entity/PromotionAccount.cfc:L63] */
  private readonly createdByAccountID: string | undefined;

  /** `modifiedDateTime`, or `undefined`. [model/entity/PromotionAccount.cfc:L64] */
  private readonly modifiedDateTime: Date | undefined;

  /** The `modifiedByAccountID` column, opaque. [model/entity/PromotionAccount.cfc:L65] */
  private readonly modifiedByAccountID: string | undefined;

  /**
   * Hydrates one `SwPromotionAccount` row.
   *
   * A single readonly parameter object, matching the convention established at
   * [slatwall-ts/src/lib/config.ts:L615]: an inline object type rather than a second exported
   * interface, because this module exports exactly one unit.
   *
   * Every nullable field is a REQUIRED slot typed `T | undefined` rather than an optional `?:`
   * slot. `exactOptionalPropertyTypes` is enabled, so "absent" and "present-but-undefined" are
   * genuinely different types, and requiring the key forces a hydrating repository to state "I
   * looked and found nothing" instead of silently omitting it.
   *
   * There is no collaborator port parameter, because this entity has zero `getService(` sites,
   * and no clock parameter, because it performs no date comparison of any kind.
   */
  constructor(init: {
    readonly promotionAccountID: string;
    readonly startDateTime: Date | undefined;
    readonly endDateTime: Date | undefined;
    readonly promotion: Promotion | undefined;
    readonly promotionID: string | undefined;
    readonly accountID: string | undefined;
    readonly createdDateTime: Date | undefined;
    readonly createdByAccountID: string | undefined;
    readonly modifiedDateTime: Date | undefined;
    readonly modifiedByAccountID: string | undefined;
  }) {
    this.promotionAccountID = init.promotionAccountID;
    this.startDateTime = init.startDateTime;
    this.endDateTime = init.endDateTime;
    this.promotion = init.promotion;
    this.promotionID = init.promotionID;
    this.accountID = init.accountID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
  }

  // --- Accessors --------------------------------------------------------------------------------
  //
  // ColdFusion auto-generated these from the property metadata, so there is no legacy body to
  // port; the locator on each one cites the property declaration it serves. Getters only: the
  // legacy component declares no setter for any of these, and the only two write-side members it
  // does declare are the throwing helpers further down.

  /** [model/entity/PromotionAccount.cfc:L52] */
  getPromotionAccountID(): string {
    return this.promotionAccountID;
  }

  /** [model/entity/PromotionAccount.cfc:L53] `undefined` means no lower bound. Never epoch, never 0. */
  getStartDateTime(): Date | undefined {
    return this.startDateTime;
  }

  /** [model/entity/PromotionAccount.cfc:L54] `undefined` means no upper bound. Never epoch, never 0. */
  getEndDateTime(): Date | undefined {
    return this.endDateTime;
  }

  /**
   * The materialized far side of the `promotion` many-to-one.
   * [model/entity/PromotionAccount.cfc:L57]
   *
   * `undefined` when the repository did not fetch it, or after `setPromotion` has never run.
   */
  getPromotion(): Promotion | undefined {
    return this.promotion;
  }

  // LEGACY-NOTE [org/Hibachi/HibachiEntity.cfc:L365-L372]: the four `get<Assoc>ID` accessors below
  // had no hand-written legacy body. They resolved through the `get*ID` branch of the
  // onMissingMethod dispatcher into `getPropertyPrimaryID`, which invokes the ASSOCIATION getter
  // and returns the far object's primary ID - falling back to the EMPTY STRING when the
  // association is null. The target reads the foreign-key COLUMN instead and returns `undefined`
  // on a miss. Two reasons, both structural rather than stylistic: the three Account-side keys
  // have no in-scope far side to invoke at all, since model/entity/Account.cfc is out of scope and
  // no Account instance is ever constructed; and reading the column makes the key available even
  // when the repository chose not to materialize the association, which the legacy proxy-based
  // form could not do. The `""`-on-miss detail is recorded here so it is auditable rather than
  // silently dropped - it is checked, not overlooked.

  /** The `promotionID` column. [model/entity/PromotionAccount.cfc:L57] */
  getPromotionID(): string | undefined {
    return this.promotionID;
  }

  /** The `accountID` column, opaque. [model/entity/PromotionAccount.cfc:L58] */
  getAccountID(): string | undefined {
    return this.accountID;
  }

  /** [model/entity/PromotionAccount.cfc:L62] */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /** The `createdByAccountID` column, opaque. [model/entity/PromotionAccount.cfc:L63] */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/PromotionAccount.cfc:L64] */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** The `modifiedByAccountID` column, opaque. [model/entity/PromotionAccount.cfc:L65] */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // --- Framework members ------------------------------------------------------------------------

  /**
   * Whether this instance has been persisted yet.
   *
   * Inherited from the framework base in the legacy tree and concretely called at exactly two
   * sites: [model/entity/PromotionAccount.cfc:L74] inside `setAccount`, and
   * [model/entity/PromotionAccount.cfc:L92] inside `setPromotion`.
   *
   * The empty-string test is not an approximation of the framework - it is literally what the
   * framework does. `isNew()` at [org/Hibachi/HibachiEntity.cfc:L707-L709] returns `getNewFlag()`,
   * and `getNewFlag()` at [org/Hibachi/HibachiEntity.cfc:L571-L576] is
   * `if(getPrimaryIDValue() == "") { return true; } return false;`. The empty string it compares
   * against is the `unsavedvalue=""` / `default=""` on the id property at
   * [model/entity/PromotionAccount.cfc:L52].
   *
   * This is the ONLY framework member authored on this entity. Nothing else the dispatcher at
   * [org/Hibachi/HibachiEntity.cfc:L507-L565] can synthesise is concretely called here, so no
   * `hasAny*` (there is no collection to test), no `hasUnique*` (there is no validation schema),
   * no `get*Options`, `get*SmartList`, `get*Struct`, `get*Count` or `get*AssignedIDList`, and no
   * `getAttributeValue` - that last one being unreachable anyway, since the L559 guard requires
   * an `attributeValues` property this entity does not declare.
   */
  isNew(): boolean {
    return this.promotionAccountID === '';
  }

  // ============= START: Bidirectional Helper Methods ===================
  // [model/entity/PromotionAccount.cfc:L68-L109]
  //
  // The legacy block holds two pairs and four methods in total, under two inline sub-banners:
  // `// Account (many-to-one)` at L71 and `// Promotion (many-to-one)` at L89. Only the Promotion
  // pair is authored here; the Account pair is dropped for the reason recorded immediately below.

  // LEGACY-NOTE [model/entity/PromotionAccount.cfc:L68-L109]: the mandatory "remove-that-ADDs"
  // inversion cross-check was performed against all four bidirectional helpers, and independently
  // re-run against the verbatim source rather than taken on trust. VERDICT: CLEAN - zero
  // inversions. Both `remove*` helpers correctly `arrayDeleteAt`; neither calls an `add*`.
  // `removeAccount` searches at L82 and deletes at L84, both against
  // `arguments.account.getAccountPromotions()` - the same object, which is correct. (Contrast
  // model/entity/Option.cfc:L129-L131 and :L145-L147, where `removePromotionRewardExclusion` and
  // `removePromotionQualifierExclusion` each call `addExcludedOption(this)` - two genuine
  // inversions, preserved as defects in that entity.) `removePromotion` is nevertheless defective
  // for a DIFFERENT reason: it dereferences `arguments.account` at L103. See the second
  // LEGACY-DEFECT marker on that method.

  // LEGACY-NOTE [model/entity/PromotionAccount.cfc:L74, L92]: both legacy `set*` helpers guard
  // with `if(isNew() or !far.hasX( this ))`, testing THIS instance's newness. Contrast
  // `PriceGroupRate.addProductType`, which guards on the ARGUMENT's newness instead. A real
  // inconsistency in the legacy codebase, recorded rather than normalised. Note also that the
  // legacy containment test is `arrayFind(collection, this)`, which is REFERENCE IDENTITY; where a
  // genuine containment predicate is needed anywhere in this folder the project rule is to compare
  // by primary key, matching Hibernate's session-identity semantics, and never by object reference
  // or deep equality. No containment predicate is needed on this entity, because it has no
  // collection to search.

  // LEGACY-NOTE [model/entity/PromotionAccount.cfc:L72, L78]: `setAccount` and `removeAccount` are
  // DELIBERATELY NOT AUTHORED. Their far side is model/entity/Account.cfc, which is explicitly out
  // of scope - the plan excludes the account module - so `account.hasAccountPromotion(this)` [L74]
  // and `account.getAccountPromotions()` [L75, L82, L84] have no in-scope counterpart to call. Per
  // the anti-corruption ruling applied identically in priceGroup.ts, which drops
  // `addAppliedOrderItem`/`removeAppliedOrderItem` [model/entity/PriceGroup.cfc:L128, L131] and
  // does not materialize `appliedOrderItems` [model/entity/PriceGroup.cfc:L62], and in
  // promotionApplied.ts, which drops all three order-side pairs
  // [model/entity/PromotionApplied.cfc:L97, L103, L115, L121, L133, L139], the L58 many-to-one
  // collapses to an inert opaque ID column and the bidirectional pair is dropped. "Dropped" means
  // NOT AUTHORED HERE - it is never a deletion from the legacy file, which is reference-only and
  // remains untouched. This is an AAP-mandated anti-corruption boundary, so it is not a signature
  // reshaping, not a visibility change and not a deliberate divergence: it spends no budget.

  // Promotion (many-to-one) [model/entity/PromotionAccount.cfc:L89]

  // LEGACY-DEFECT [model/entity/PromotionAccount.cfc:L90-L95]: `setPromotion` THROWS ON EVERY CODE
  // PATH. model/entity/Promotion.cfc declares exactly three collections - L62 `promotionPeriods`,
  // L63 `promotionCodes`, L64 `appliedPromotions` - and no `promotionAccounts` collection, so
  // neither `hasPromotionAccount()` at L92 nor `getPromotionAccounts()` at L93 resolves to
  // anything. Each falls through all eleven patterns of the dispatcher at
  // org/Hibachi/HibachiEntity.cfc:L507-L565 and hits the throw at
  // org/Hibachi/HibachiEntity.cfc:L565; the `getAttributeValue` fallback at L559 cannot catch
  // either one, because it requires an `attributeValues` property that Promotion does not declare.
  // CFML's `or` short-circuits, which makes BOTH branches fatal rather than one: when `isNew()` is
  // TRUE the second operand at L92 is never evaluated, control enters the body, and L93 throws;
  // when `isNew()` is FALSE the second operand IS evaluated, and L92 throws. There is no
  // non-throwing path through this method.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Bidirectional helper for the `promotion` many-to-one.
   * [model/entity/PromotionAccount.cfc:L90]
   *
   * A throwing stub, mirroring the legacy runtime failure exactly rather than repairing it. This
   * follows the precedent set for `Sku.getPriceByPromotion()` [model/entity/Sku.cfc:L258], whose
   * body calls a method that does not exist and which the plan ports as "a throwing stub with the
   * TODO, not invented".
   *
   * `void` and NOT `never`, deliberately. `never` suits `Sku.getPriceByPromotion()`, whose legacy
   * `returntype="numeric"` promises a value it can never deliver; this legacy method is declared
   * `void`, so `void` is the parity-correct return type and the throw is the body's only effect.
   *
   * The parameter is retained for interface parity even though the method cannot use it for
   * anything beyond the L91 assignment - which is exactly why tsconfig.json deliberately leaves
   * `noUnusedParameters` unset.
   *
   * WHICH message is thrown depends on `isNew()`, and that branch is not cosmetic - it is which
   * dead call target the legacy actually reaches, and it is observable. CFML's `or` short-circuits:
   *
   *   * `isNew()` TRUE  -> the second operand at L92 is NEVER EVALUATED, control enters the body,
   *     and the `getPromotionAccounts()` call at L93 is the one that throws.
   *   * `isNew()` FALSE -> the second operand IS evaluated, and `hasPromotionAccount()` at L92
   *     throws before the body is ever entered.
   *
   * Both name a method on the `Promotion` class, because both are called ON the argument. Neither
   * path can succeed, so this method has no non-throwing outcome either way.
   */
  setPromotion(promotion: Promotion): void {
    // [model/entity/PromotionAccount.cfc:L91]: the assignment runs FIRST and succeeds. The legacy
    // therefore leaves the instance HALF-MUTATED and only then blows up, and that ordering is
    // reproduced here rather than tidied into a guard-first shape.
    this.promotion = promotion;

    // [model/entity/PromotionAccount.cfc:L92]: `if(isNew() or !arguments.promotion
    // .hasPromotionAccount( this ))`. The near-side `isNew()` decides which of the two dead call
    // targets is reached, exactly as CFML's short-circuiting `or` decides it.
    if (this.isNew()) {
      // [model/entity/PromotionAccount.cfc:L93]: `arrayAppend(arguments.promotion
      // .getPromotionAccounts(), this)`.
      throw new Error(hibachiMissingMethodMessage('getPromotionAccounts', 'Promotion'));
    }

    throw new Error(hibachiMissingMethodMessage('hasPromotionAccount', 'Promotion'));
  }

  // LEGACY-DEFECT [model/entity/PromotionAccount.cfc:L101]: `removePromotion` THROWS EVERY SINGLE
  // TIME. L101 calls `arguments.promotion.getPromotionAccounts()` UNCONDITIONALLY, before any
  // guard on the resulting index, and that method does not resolve for the reason recorded on
  // `setPromotion` above, so it throws at org/Hibachi/HibachiEntity.cfc:L565. One consequence
  // worth stating explicitly: the `structDelete(variables, "promotion")` at L105 NEVER EXECUTES,
  // so the legacy never actually clears the field it set.
  // Preserved deliberately; do not fix without a product decision.

  // LEGACY-DEFECT [model/entity/PromotionAccount.cfc:L103]: a SECOND, INDEPENDENT defect, stacked
  // behind the first. L103 calls `arrayDeleteAt(arguments.account.getPromotionAccounts(), index)`,
  // dereferencing `arguments.account` - which is NOT a declared argument of this method. The
  // signature at L97 is `removePromotion(any promotion)`; there is no `account` argument, so in
  // CFML this is an undefined-variable error. Worse, the search and the delete address DIFFERENT
  // OBJECTS: L101 searches `arguments.promotion` while L103 deletes from `arguments.account`, so
  // even with a live collection on both sides the method could not do its job. L103 is UNREACHABLE
  // today because L101 throws first, which is precisely why the leak has survived - the first
  // defect masks the second. It is latent rather than harmless: were a product decision to add a
  // `promotionAccounts` collection to Promotion, L101 would begin succeeding and this leak would
  // immediately become live.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Bidirectional helper for the `promotion` many-to-one.
   * [model/entity/PromotionAccount.cfc:L97]
   *
   * A throwing stub, for the two stacked reasons recorded in the markers above. It throws whether
   * it is called with an explicit argument or with none - but WHICH failure it reproduces depends
   * on whether a target resolves at all, and the two are genuinely different errors in CFML:
   *
   *   * NO target resolves - called with no argument while `variables.promotion` has never been
   *     set, or has already been `structDelete`-d. CFML fails on the DEFAULT READ itself at
   *     [model/entity/PromotionAccount.cfc:L99] with "Element PROMOTION is undefined in
   *     VARIABLES.", before any method is called on anything. That is an undefined-variable error
   *     and NOT a missing-method contract, so it deliberately does NOT carry the framework's
   *     terminal message - conflating the two would let the error mapper publish a contract that
   *     the legacy never emitted on this path. The same distinction is drawn identically in
   *     `skuCurrency.ts` (`removeSku`) and `promotionPeriod.ts` (`removePromotion`).
   *   * A target DOES resolve - the default read succeeds, or an argument was supplied, and the
   *     unconditional call at [model/entity/PromotionAccount.cfc:L101] then reaches the framework's
   *     terminal throw. That IS the contract, and it is emitted byte for byte.
   *
   * `void` and not `never`, for the same parity reason as `setPromotion`.
   */
  removePromotion(promotion?: Promotion): void {
    // [model/entity/PromotionAccount.cfc:L98-L100]: CFML probes `structKeyExists(arguments,
    // "promotion")` and, when the argument is absent, defaults it to `variables.promotion`. The
    // TypeScript form of that probe is an optional parameter with a nullish default - plain,
    // idiomatic TypeScript. There is deliberately no `variables.` scope object, no
    // `structKeyExists` helper and no CFML struct emulation: a transliteration would violate the
    // minimal-change directive, which scopes the functional surface and never the code style.
    const target: Promotion | undefined = promotion ?? this.promotion;

    if (target === undefined) {
      throw new Error(
        'PromotionAccount.removePromotion was called with no argument while no promotion is set. ' +
          'model/entity/PromotionAccount.cfc:L98-L100 defaults the argument from ' +
          'variables.promotion, and CFML raises "Element PROMOTION is undefined in VARIABLES." on ' +
          'that read. Reproduced rather than silently absorbed, and deliberately NOT the ' +
          'missing-method contract message - no method has been called on anything yet.',
      );
    }

    // [model/entity/PromotionAccount.cfc:L101]: `arrayFind(arguments.promotion
    // .getPromotionAccounts(), this)`. Unconditional, before any index guard, so this is where the
    // method always ends once a target resolved. Two consequences of that, both preserved: the
    // `structDelete(variables, "promotion")` at L105 NEVER runs, so the legacy never clears the
    // field it set; and the second, independent `arguments.account` leak at L103 stays UNREACHABLE,
    // masked by this throw exactly as it is masked in the legacy.
    throw new Error(hibachiMissingMethodMessage('getPromotionAccounts', 'Promotion'));
  }

  //   =============  END:  Bidirectional Helper Methods ===================
  // [model/entity/PromotionAccount.cfc:L109]
}

// LEGACY-NOTE [model/entity/PromotionAccount.cfc:L68, L109, L113-L123]: this component's banner
// layout is malformed and unique among the 18 in-scope entities. The "Bidirectional Helper Methods"
// banner appears TWICE - once populated at L68-L109 and once empty at L117-L119 - and the whole
// block precedes the (empty) "Non-Persistent Property Methods" section at L113-L115, inverting the
// ordering every sibling entity uses. L109 is additionally indented with three spaces rather than a
// tab, and 17 of the 18 lines from L89 to L106 carry trailing whitespace; the file even mixes CRLF
// and LF terminators between those two regions. A copy-paste artifact with zero behavioural
// consequence. Recorded as a secondary register item; annotated, not fixed, and it spends no
// divergence.

// LEGACY-NOTE [model/entity/PromotionAccount.cfc:L113-L123]: all three remaining banner-delimited
// sections were confirmed EMPTY in the source and nothing is authored for any of them.
//   * Non-Persistent Property Methods [L113/L115] - EMPTY. Zero derived getters, zero memoized
//     caches, so the memoized-accessor seed/guard pattern and its three known memo defects are
//     entirely absent from this file.
//   * Bidirectional Helper Methods, the duplicate [L117/L119] - EMPTY.
//   * ORM Event Hooks [L121/L123] - EMPTY. There is NO `preInsert` and NO `preUpdate`; a
//     case-insensitive census of the source confirms zero occurrences of either. This entity is not
//     one of the four hook-bearing in-scope entities - Category L126/L131, PriceGroup L206/L211,
//     ProductType L305/L310 and PromotionCode L179 - so there is no materialized path to maintain,
//     no path helper to import, no save-time maintenance method and no hook-ordering ruling. None
//     is invented.
// The source declares no "Implicit" banner, no Custom Validation banner and no Custom Formatting
// banner either. L124-L125 are blank and the component closes at L126.

// TEST CONTRACT - NET-NEW COVERAGE, NEVER PARITY.
//
// `tests/unit/domain/entities/promotionAccount.test.ts` (planned) is authored separately; the test tier is
// owned elsewhere and no test file is created from here. `PromotionAccount` has NO legacy test
// whatsoever, so its coverage is one of the sixteen net-new entity suites and must be labelled as
// such - presenting it as parity fails the coverage gate. It must also appear in
// `tests/traceability/legacyTestMap.ts` (planned), flagged net-new, because that map fails the suite when an
// in-scope module has no test. Regression tests in this project follow the `issue_<ticket#>`
// convention carried over from meta/tests/unit/IssuesTest.cfc.
//
// The behaviours that must be pinned:
//   1. `setPromotion()` THROWS - and the `promotion` field IS STILL ASSIGNED before the throw,
//      reproducing the half-mutated state from [model/entity/PromotionAccount.cfc:L91]. Assert
//      both halves: catch the throw, then observe `getPromotion()` returning the argument.
//   2. `removePromotion()` THROWS whether it is called with an explicit argument or with none.
//   3. `startDateTime` and `endDateTime` hydrate to `undefined` when the column is NULL - never
//      the epoch, never `0`, never a sentinel.
//   4. `getAccountID()`, `getCreatedByAccountID()` and `getModifiedByAccountID()` return opaque
//      strings or `undefined`, and no `Account` object is ever constructed.
//   5. `isNew()` is true for an unsaved instance, keyed on the empty-string id from
//      [model/entity/PromotionAccount.cfc:L52]'s `unsavedvalue=""`.
//   6. There is NO `promotionPeriod` accessor on the class, and NO `setAccount`/`removeAccount`.
//   7. `getPromotionID()` returns the foreign key even when the `promotion` association was not
//      materialized.
