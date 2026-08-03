// ---------------------------------------------------------------------------
// slatwall-ts - PromotionPeriod entity
//
// Port of model/entity/PromotionPeriod.cfc (163 lines): the bounded, use-limited window during
// which a promotion's rewards may apply. The most defect-dense entity in this folder relative to
// its size, and the file that spends the project's one entity-layer signature widening.
//
// SEVEN PRESERVED DEFECTS LIVE IN 163 LINES, six of them inside the 38-line window L95-L132. Every
// one is REPRODUCED, never repaired - a method that throws at runtime today throws in the target.
// Each carries its own marker at the exact locator a reviewer can check it against:
//
//   L80          isCurrent() dereferences both bounds with NO null guard.
//   L80 vs L140  isCurrent() and getCurrentFlag() answer the same question with OPPOSITE
//                end-boundary semantics.
//   L110         removePromotion() dereferences the UNDECLARED `arguments.account` - and unlike the
//                identical leak at PromotionAccount.cfc:L103, this one is REACHABLE.
//   L117         addPromotionReward() calls setPromotion() on a child that has none.
//   L121         removePromotionReward() calls removePromotion() on a child that has none.
//   L126         addPromotionQualifier() calls setPromotion() on a child that has none.
//   L129         removePromotionQualifier() calls removePromotion() on a child that has none.
//
// Two members that LOOK defective are not, and are deliberately unmarked so the register stays
// honest: `setPromotion` [L98-L103] is sound, because model/entity/Promotion.cfc:L62 genuinely
// declares `promotionPeriods`; and `getCurrentFlag` [L137-L146] is a CORRECT instance of the
// memoized-accessor seed/guard pattern - the control case proving the pattern works when written
// properly.
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/PromotionPeriod.cfc:L49]
//
//   component displayname="Promotion Period" entityname="SlatwallPromotionPeriod"
//   table="SwPromotionPeriod" persistent="true" extends="HibachiEntity"
//   cacheuse="transactional" hb_serviceName="promotionService"
//   hb_permission="promotion.promotionPeriods" {
//
// Schema continuity is binding: entity property metadata IS the contract. Table
// `SwPromotionPeriod`, entity name `SlatwallPromotionPeriod`, no migration, no rename, no column
// change. Every declared attribute is carried forward verbatim below as an inert comment, and
// out-of-scope foreign keys are preserved as inert columns rather than dropped.
//
// `hb_permission="promotion.promotionPeriods"` is dotted and CORRECTLY SPELLED - contrast
// model/entity/PromotionReward.cfc:L57, whose `hb_permission="promotionPeriod.promtionRewards"`
// carries a typo requiring a documented rename in THAT file. Nothing needs renaming here.
// `hb_serviceName="promotionService"` points at model/service/PromotionService.cfc; there is no
// `PromotionPeriodService` in the legacy tree and none is invented.
//
// THE `extends` CHAIN IS THREE LEVELS DEEP, NOT TWO. `extends="HibachiEntity"` on L49 is
// unqualified, so it resolves to the local model/entity/HibachiEntity.cfc (274 lines), which itself
// extends `Slatwall.org.Hibachi.HibachiEntity`. That intermediate class reaches outward through
// exactly 12 `getService(...)` sites and none of them is ported. This entity needs none of them:
// `grep -c 'getService('` over all 163 lines returns ZERO, which is why no collaborator port
// appears in its constructor and why every method below is SYNCHRONOUS.
//
// WHAT THE FRAMEWORK BASE CONTRIBUTES, AND WHY ALMOST NONE OF IT IS AUTHORED.
// org/Hibachi/HibachiEntity.cfc:L507-L565 is an `onMissingMethod` dispatcher matching eleven
// `has*`- or `get*`-prefixed method-name patterns and terminating in a THROW AT L565. Dynamic
// dispatch is not emulated here; only concretely called members are authored, and the only
// framework member this entity uses on itself is `isNew()`, at L100. THAT PREFIX RULE IS THE
// MECHANISM BEHIND FOUR OF THE SEVEN DEFECTS: `set*` and `remove*` match nothing, so the four
// one-to-many helpers at L117, L121, L126 and L129 fall straight through to the L565 throw. The
// `getAttributeValue` EAV fallback at L559 cannot catch them either, because it requires an
// `attributeValues` property, and the whole in-scope census is four declarations -
// model/entity/Sku.cfc:L70, model/entity/Product.cfc:L75, model/entity/ProductType.cfc:L67 and
// model/entity/Brand.cfc:L60. This entity is not among them.
//
// `hasPromotionReward` and `hasPromotionQualifier` are authored below because they are IMPLICIT
// ORM-GENERATED accessors rather than dispatcher hits, and the framework says so in its own words
// at org/Hibachi/HibachiEntity.cfc:L343, inside `hasAnyInProperty` (L340-L350): "evaluate is used
// instead of invokeMethod() because hasXXX() is an implicit orm function". Both are concretely
// called on a PromotionPeriod receiver, at model/entity/PromotionReward.cfc:L142 and
// model/entity/PromotionQualifier.cfc:L124.
//
// THE EXPLICIT UTC POLICY. CFML `now()` and CFML date comparison both depend on the server
// timezone; the target must not. Every comparison below is performed on `Date.prototype.getTime()`,
// epoch milliseconds in UTC and therefore timezone independent, and the clock itself is INJECTED
// rather than read from the ambient environment. Nothing here calls `Date.now()`, constructs
//   `new Date()`,
// or reads a local-time component. Referenced at `isCurrent` [L78-L81], `isExpired` [L83-L85] and
// `getCurrentFlag` [L137-L146].
//
// THE VALIDATION SCHEMA IS DOCUMENTED HERE AND ENFORCED ELSEWHERE.
// model/validation/PromotionPeriod.json exists - this entity is not one of the four in-scope
// entities lacking a schema (Category, PromotionQualifier, PromotionApplied, PromotionAccount,
// whose absent files must never be invented). It declares a CROSS-FIELD rule:
//
//   "conditions": { "needsEndAfterStart": { "startDateTime": {"required":true},
//                                           "endDateTime":   {"required":true} } }
//   "endDateTime": [ {"contexts":"save","dataType":"date"},
//                    {"contexts":"save","conditions":"needsEndAfterStart",
//                     "gtProperty":"startDateTime"} ]
//
// The identical rule appears in model/validation/PromotionCode.json. It is recorded as
// documentation only: enforcement is a service-tier concern, and asserting it during hydration
// would reject rows the legacy ORM happily loads - both bounds are legitimately null.
//
// WHY THE L80 DEFECT SURVIVED: `isCurrent()` IS DEAD CODE UPSTREAM. A repository-wide grep for
// `isCurrent()` returns exactly one hit - its own declaration at
// model/entity/PromotionPeriod.cfc:L78. Nothing in admin/, frontend/, public/, model/, org/ or
// integrationServices/ ever calls it. Its memoized twin `getCurrentFlag()` IS called, at
// model/entity/Promotion.cfc:L98 inside `getCurrentPromotionPeriodFlag()`. That asymmetry is why
// the missing null guard at L80 has never surfaced in production, and it changes nothing about the
// obligation to reproduce it.
// ---------------------------------------------------------------------------

import { isNullish } from '../../lib/cfml/truthiness.js';
import type { Promotion } from './promotion.js';
import type { PromotionQualifier } from './promotionQualifier.js';
import type { PromotionReward } from './promotionReward.js';

// LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L100, L101, L108, L88, L92]: the far-side contract
// this file requires of `src/domain/entities/promotion.ts`, published here as canonical because
// that file is authored separately. Four members, all of which resolve in the legacy tree:
//   * `getPromotionPeriods(): PromotionPeriod[]` - the generated accessor for
//     model/entity/Promotion.cfc:L62. It MUST return the LIVE array reference and never a copy,
//     because L101 `arrayAppend`s into it and L110 `arrayDeleteAt`s from it in place.
//   * `hasPromotionPeriod(promotionPeriod: PromotionPeriod): boolean` - the implicit ORM accessor
//     for that same collection (see org/Hibachi/HibachiEntity.cfc:L343). It MUST compare by
//     PRIMARY KEY (`promotionPeriodID`), never by reference and never by deep equality, matching
//     Hibernate's session-identity semantics, and returns `false` on an empty array.
//   * `isDeletable(): boolean` - hand-written at model/entity/Promotion.cfc:L170, whose body at
//     L171 is `return arrayLen( getAppliedPromotions() ) == 0;`. Consumed by `isDeletable` below.
//   * `getPromotionName(): string` - the generated accessor for model/entity/Promotion.cfc:L53.
//     Consumed by `getSimpleRepresentation` below.
// The naming shape is load-bearing and must survive verbatim: the collection is PLURAL
// (`promotionPeriods`) while the predicate is SINGULAR (`hasPromotionPeriod`), exactly as
// promotionApplied.ts preserves `appliedPromotions` / `hasAppliedPromotion`.

// LEGACY-NOTE [model/entity/Promotion.cfc:L62-L64]: THE OPPOSITE ANTI-CONTRACT, WHICH THIS FILE
// MUST NOT BREAK. model/entity/Promotion.cfc declares exactly three collections - L62
// `promotionPeriods` (cascade `all-delete-orphan`, inverse), L63 `promotionCodes` (same) and L64
// `appliedPromotions` (cascade `all`, inverse) - and `promotionAccounts` is NOT one of them. That
// absence is exactly what makes `PromotionAccount.setPromotion` / `removePromotion` throwing
// defects, as recorded in promotionAccount.ts, and it must STAY absent: nothing here adds a
// `promotionAccounts` collection, a `getPromotionAccounts()` or a `hasPromotionAccount()` to
// Promotion. The two contracts are exact opposites and both are correct.

// LEGACY-NOTE [model/entity/PromotionReward.cfc:L70, L140] and
// [model/entity/PromotionQualifier.cfc:L68, L122]: THE CHILD-SIDE ANTI-CONTRACT. Both children
// declare their parent property as `promotionPeriod` (proved by `fkcolumn="promotionPeriodID"` at
// model/entity/PromotionPeriod.cfc:L62-L63) and both declare `setPromotionPeriod` -
// PromotionReward.cfc:L140 and PromotionQualifier.cfc:L122, with `removePromotionPeriod` at L146
// and L128. NEITHER declares a `promotion` property. promotionReward.ts and promotionQualifier.ts
// must therefore expose `setPromotionPeriod` / `removePromotionPeriod` and must NOT expose
// `setPromotion` / `removePromotion`: adding a `promotion` member to either child would corrupt the
// schema contract AND silently repair the four throwing defects at L117, L121, L126 and L129.
//
// Their `setPromotionPeriod` bodies call back into THIS entity - `hasPromotionReward( this )` at
// PromotionReward.cfc:L142 with `getPromotionRewards()` at L143, and
//   `hasPromotionQualifier( this )`
// at PromotionQualifier.cfc:L124 with `getPromotionQualifiers()` at L125 - which is why all four of
// those members are authored below and why both collection getters return the LIVE array. Both
// `has*` predicates also require each child to expose its own primary-key accessor -
// `getPromotionRewardID(): string` for model/entity/PromotionReward.cfc:L60 and
// `getPromotionQualifierID(): string` for model/entity/PromotionQualifier.cfc:L52 - both `string`
// rather than `string | undefined`, because both id properties carry `default=""`.
//
// NOTE WHAT THE CHILDREN GET RIGHT THAT THE PARENT GETS WRONG: their `removePromotionPeriod` bodies
// (PromotionReward.cfc:L146-L155 and PromotionQualifier.cfc:L128-L137) search AND delete against
// the SAME resolved object, which is the correct form of the idiom `removePromotion` [L104-L113]
// botches at L110 - the clearest proof that L110 is a copy-paste leak, not intent.

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
 * Three details are load-bearing and must never be "corrected": "does not exists" is grammatically
 * wrong in the source and is reproduced verbatim; the trailing " entity." is present even for the
 * service-tier copy, so the two tiers are byte-identical and one recognizer covers both; and
 * `getClassName()` is `listLast(getClassFullname(), ".")` [org/Hibachi/HibachiObject.cfc:L136], so
 * the class slot carries the BARE component name - `PromotionReward`, never
 * `Slatwall.model.entity.PromotionReward`.
 *
 * src/handlers/errorMapper.ts recognizes this exact shape with an anchored pattern and preserves
 * the message verbatim in the response body, so prose explaining the defect would fall through to
 * the generic arm and lose the contract; that prose lives in the LEGACY-DEFECT markers instead.
 *
 * NOT EVERY THROW IN THIS FILE USES THIS TEMPLATE, AND THAT IS DELIBERATE. Six other throws here
 * reproduce CFML null-reference and undefined-variable failures - the two `isCurrent` date guards,
 * `isDeletable`, `getSimpleRepresentation`, and both arms of `removePromotion`. None is a
 * missing-method contract, so giving them this message would have the error mapper publish a
 * contract the legacy never emitted on those paths.
 *
 * @param methodName The dead call target, without parentheses - they are added here.
 * @param className  The bare component name of the entity the call was made ON.
 */
function hibachiMissingMethodMessage(methodName: string, className: string): string {
  return `You have called a method ${methodName}() which does not exists in the ${className} entity.`;
}

/**
 * The `SwPromotionPeriod` row: one bounded, use-limited window during which a promotion's rewards
 * may apply.
 *
 * A class rather than an interface, because the legacy entities carry behaviour and not merely
 * data, and because interface parity is the acceptance contract: a reviewer diffs this public
 * surface against the CFC method by method. Method names are therefore the legacy CFML names
 * verbatim in camelCase, which is why eslint.config.mjs enables no `naming-convention`, `camelcase`
 * or `id-match` rule and no complexity or max-lines rule.
 *
 * ASSOCIATIONS ARRIVE ALREADY MATERIALIZED OR ABSENT, AND LAZINESS IS NEVER SIMULATED.
 * `src/repositories/mysql/**` owns row-to-entity hydration, the clock injection and the association
 * materialization, and documents the chosen fetch shape at the producing repository method. This
 * class performs no loading, no querying and no lazy resolution.
 *
 * THE `fetch="join"` RULING. [model/entity/PromotionPeriod.cfc:L59] is one of only FOUR eager
 * `fetch="join"` sites in the entire in-scope entity set; the complete census is
 * model/entity/Product.cfc:L68 `brand`, model/entity/Product.cfc:L69 `productType`,
 * model/entity/Product.cfc:L70 `defaultSku` (which also carries `cascade="delete"`), and this one.
 * In the target the eager/lazy distinction disappears, because every association is materialized at
 * the repository boundary on identical terms - which converts each implicit lazy load into an
 * explicit, documented query decision and removes the N+1 hazard. The eager marker is nonetheless
 * retained as evidence that `promotion` is expected to be PRESENT IN PRACTICE, which is what makes
 * the unguarded `getPromotion()` reach-throughs at L88 and L92 survivable in the legacy system. For
 * contrast, the only in-scope `lazy="extra"` collections - never materialized at all - are
 * model/entity/ProductType.cfc:L66 `products`, model/entity/PromotionCode.cfc:L68 `orders` and
 * model/entity/Sku.cfc:L71 `orderItems`. Neither of this entity's collections is `lazy="extra"`.
 *
 * NO PROMOTION-QUALIFICATION SEMANTICS ARE DECIDED HERE. This entity exposes no include/exclude
 * link table and has no legacy test asserting a default; its two collections are ordinary owned
 * one-to-many arrays defaulting to `[]`. Empty-collection polarity is settled in
 * `src/services/promotion/**`.
 */
export class PromotionPeriod {
  // --- Persistent Properties [model/entity/PromotionPeriod.cfc:L52-L56]
  //
  // Exactly five, and the boolean census across the whole property window L49-L75 is ZERO of either
  // casing - re-verified case-insensitively, because a case-sensitive grep for `ormtype="boolean"`
  // under-counts: model/entity/PriceGroupRate.cfc:L53 writes `ormType="boolean"` with a capital T.
  // The only boolean in this component is the non-persistent `currentFlag` at L75, never hydrated
  // from a row, which is why `cfBoolean()` from src/lib/cfml/truthiness.ts is deliberately not
  // imported - it exists to read persisted flag columns that can arrive as SQL NULL. The only
  // `default=` in the property block is the primary key's `default=""` at L52.

  /**
   * Primary key. [model/entity/PromotionPeriod.cfc:L52]
   *
   *   property name="promotionPeriodID" ormtype="string" length="32" fieldtype="id"
   *   generator="uuid" unsavedvalue="" default="";
   *
   * `string` and never `string | undefined`: `default=""` means the column always holds a string,
   * possibly the empty one. That empty string is load-bearing - it is what `isNew()` keys on, and
   * the identity used by both `has*` predicates and by `removePromotion`. Read-only, no setter.
   */
  private readonly promotionPeriodID: string;

  // THE THIRD ABSENCE CONVENTION, AND THIS ENTITY'S ORM METADATA IS ITS STRONGEST PROOF.
  //
  // [model/entity/PromotionPeriod.cfc:L53-L56] All four properties below are nullable, none
  // declares an ORM `default=`, and all four declare an `hb_nullRBKey` spelling the semantics out
  // in the schema itself: `define.forever` for the two dates, `define.unlimited` for the two
  // counts. `undefined` therefore means FOREVER / UNLIMITED - the permissive extreme - and must NOT
  // be coerced to `0`, `new Date(0)`, the Unix epoch, `Number.MAX_SAFE_INTEGER`, a fresh clock
  // reading or any other sentinel. There is no `?? 0`, no `|| 0`, no runtime default and no zod
  // default anywhere in this file. A downstream `undefined` use-limit means NO LIMIT.
  //
  // This is the third of three OPPOSITE absence conventions in this folder, none of which may be
  // collapsed into another: `Sku.getPriceByCurrencyCode()` must return `Money | undefined` and
  // never `0`, because model/entity/Sku.cfc:L269-L273 has no `else` and no fallback, and
  // substituting 0 would silently sell products for free; `Product.getSalePrice()` must return `0`
  // and never `undefined`, because model/entity/Product.cfc:L598 is a bare statement with no
  // `return` and execution falls through to `return 0`; and this file owns the third - period
  // bounds and use-limits stay `undefined`. Convention 3 is the only one encoded in the ORM
  // metadata rather than inferred from behaviour.

  /**
   * Start of the active window, or `undefined` for NO LOWER BOUND.
   * [model/entity/PromotionPeriod.cfc:L53]
   *
   *   property name="startDateTime" ormtype="timestamp" hb_formatType="dateTime"
   *   hb_nullRBKey="define.forever";
   *
   * `hb_formatType` and `hb_nullRBKey` are carried forward as inert strings only. JavaRB is not
   * ported and no i18n runtime is introduced; the resource-bundle key is preserved verbatim so the
   * legacy admin can still resolve it.
   */
  private readonly startDateTime: Date | undefined;

  /**
   * End of the active window, or `undefined` for NO UPPER BOUND.
   * [model/entity/PromotionPeriod.cfc:L54]
   *
   *   property name="endDateTime" ormtype="timestamp" hb_formatType="dateTime"
   *   hb_nullRBKey="define.forever";
   *
   * The most consequential nullable slot here: `isCurrent` [L80] dereferences it with no guard and
   * therefore throws, while `isExpired` [L84] and `getCurrentFlag` [L140] both guard it and treat
   * absence as permissive. All three behaviours are reproduced as written.
   */
  private readonly endDateTime: Date | undefined;

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L55-L56]: both count properties contain a DOUBLE
  // SPACE between `notnull="false"` and `hb_nullRBKey=` in the source. Cosmetic; not reproduced.

  /**
   * Period-wide use ceiling, or `undefined` for UNLIMITED. [model/entity/PromotionPeriod.cfc:L55]
   *
   *   property name="maximumUseCount" ormtype="integer" notnull="false"
   *   hb_nullRBKey="define.unlimited";
   *
   * `ormtype="integer"` is a plain COUNT, not money, which is why neither the Money value object
   * nor decimal.js is imported here and why no float arithmetic appears in this file. Consumed by
   * the promotion engine at model/service/PromotionService.cfc:L566 and L568, both of which pair
   * `!isNull(...)` with a `gt 0` test - so `undefined` and `0` both mean "no ceiling" to that
   * caller, and neither may be substituted for the other here.
   */
  private readonly maximumUseCount: number | undefined;

  /**
   * Per-account use ceiling, or `undefined` for UNLIMITED. [model/entity/PromotionPeriod.cfc:L56]
   *
   *   property name="maximumAccountUseCount" ormtype="integer" notnull="false"
   *   hb_nullRBKey="define.unlimited";
   *
   * Consumed at model/service/PromotionService.cfc:L574 and L577 on the same `!isNull(...)` plus
   * `gt 0` terms as `maximumUseCount`.
   */
  private readonly maximumAccountUseCount: number | undefined;

  // --- Related Object Properties (many-to-one) [model/entity/PromotionPeriod.cfc:L59]

  /**
   * The owning promotion. [model/entity/PromotionPeriod.cfc:L59]
   *
   *   property name="promotion" cfc="Promotion" fieldtype="many-to-one" fkcolumn="promotionID"
   *   fetch="join";
   *
   * MUTABLE, and the only mutable association on this class: `setPromotion` assigns it at L99 and
   * `removePromotion` clears it at L112. Every other field here is `readonly`.
   *
   * No `hb_cascadeCalculate` here - contrast model/entity/PromotionApplied.cfc:L59 `orderItem` and
   * model/entity/Sku.cfc:L65 `product`, which both declare it. The attribute is part of the schema
   * contract, so its absence is a real difference.
   */
  private promotion: Promotion | undefined;

  /**
   * The `promotionID` foreign-key column backing the association above.
   * [model/entity/PromotionPeriod.cfc:L59]
   *
   * Held alongside the materialized association so the key stays readable even when the repository
   * chose not to fetch the far side - something the legacy proxy-based `get*ID` dispatch at
   * org/Hibachi/HibachiEntity.cfc:L530 could not do, because it invoked the association getter and
   * fell back to the EMPTY STRING when the association was null. The target reads the COLUMN and
   * returns `undefined` on a miss; the `""`-on-miss detail is recorded so it stays auditable.
   */
  private readonly promotionID: string | undefined;

  // --- Related Object Properties (one-to-many) [model/entity/PromotionPeriod.cfc:L62-L63] -----
  //
  // Both collections are `cascade="all-delete-orphan" inverse="true"` on
  // `fkcolumn="promotionPeriodID"`, matching model/entity/Promotion.cfc:L62-L63 and contrasting
  // model/entity/Promotion.cfc:L64 `appliedPromotions`, which is `cascade="all"`. The orphan-delete
  // obligation belongs to `src/repositories/mysql/**`, which owns persistence.
  //
  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L62-L63]: neither collection declares
  // `type="array"`, where model/entity/Sku.cfc:L72 `skuCurrencies` and model/entity/Brand.cfc:L60
  // `attributeValues` do. Metadata inconsistency only; both are arrays either way.
  //
  // The array REFERENCE is `readonly` while its CONTENTS are mutable: `arrayAppend` /
  // `arrayDeleteAt` from the child side mutate the live array in place
  // (model/entity/PromotionReward.cfc:L143, L152 and model/entity/PromotionQualifier.cfc:L125,
  // L134), and rebinding the field would break that.

  /** [model/entity/PromotionPeriod.cfc:L62] `singularname="promotionReward"`. Defaults to `[]`. */
  private readonly promotionRewards: PromotionReward[];

  /** [model/entity/PromotionPeriod.cfc:L63] `singularname="promotionQualifier"`; defaults `[]`. */
  private readonly promotionQualifiers: PromotionQualifier[];

  // --- Remote Properties [model/entity/PromotionPeriod.cfc:L66]

  /**
   * [model/entity/PromotionPeriod.cfc:L66] `property name="remoteID" ormtype="string";`
   *
   * Present on this entity, which is a real schema difference: contrast
   * model/entity/PromotionAccount.cfc, which declares no `remoteID` at all.
   */
  private readonly remoteID: string | undefined;

  // --- Audit properties [model/entity/PromotionPeriod.cfc:L69-L72]
  //
  // All four carry `hb_populateEnabled="false"`, the legacy mechanism for excluding them from mass
  // assignment. The TypeScript equivalent needs none: they are `readonly`, set once during
  // hydration and exposed through getters with no setter anywhere.

  /** [model/entity/PromotionPeriod.cfc:L69] `createdDateTime`, `ormtype="timestamp"`. */
  private readonly createdDateTime: Date | undefined;

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L70]: `createdByAccount` is a many-to-one on
  // `fkcolumn="createdByAccountID"` targeting the out-of-scope model/entity/Account.cfc, so the
  // association collapses to the inert persisted ID column under the out-of-scope FK ID-accessor
  // ruling applied identically in promotionApplied.ts and promotionAccount.ts. No `Account` type is
  // imported and none may be created. The COLUMN is preserved rather than dropped, so schema
  // continuity stays auditable: no migration, no rename, no column change.

  /** The `createdByAccountID` column, opaque. [model/entity/PromotionPeriod.cfc:L70] */
  private readonly createdByAccountID: string | undefined;

  /** [model/entity/PromotionPeriod.cfc:L71] `modifiedDateTime`, `ormtype="timestamp"`. */
  private readonly modifiedDateTime: Date | undefined;

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L72]: `property name="modifiedByAccount"
  // hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one"
  // fkcolumn="modifiedByAccountID";`
  // - identical out-of-scope collapse to an opaque ID column, on identical terms to L70 above.

  /** The `modifiedByAccountID` column, opaque. [model/entity/PromotionPeriod.cfc:L72] */
  private readonly modifiedByAccountID: string | undefined;

  // --- The injected clock

  /**
   * The instant source every date comparison on this entity reads.
   *
   * A plain locally-typed function injected through the constructor, deliberately NOT a port: this
   * project has exactly thirteen ports and no fourteenth may be invented, so nothing is imported
   * from `../ports/`, and src/lib/config.ts is not read either - that file is static process
   * configuration, never a request-scoped instant.
   *
   * Injecting it is what lets `isExpired()` [L83] and `getCurrentFlag()` [L137] keep their
   * zero-argument legacy signatures verbatim while staying deterministically testable, confining
   * the single widening this file spends to `isCurrent`. Nothing here calls `Date.now()`.
   */
  private readonly now: () => Date;

  // --- Non-persistent properties [model/entity/PromotionPeriod.cfc:L74-L75]

  /**
   * Memo backing `getCurrentFlag()`. [model/entity/PromotionPeriod.cfc:L75]
   *
   *   property name="currentFlag" type="boolean" persistent="false";
   *
   * Not a column and not a constructor input. It is never hydrated from a row, which is precisely
   * what distinguishes the `structKeyExists(variables, "currentFlag")` probe at L138 from a
   * lazy-load probe - see the annotation on `getCurrentFlag()` below.
   *
   * Instance-scoped, and instances are request-scoped; never module-scoped, which would persist
   * across warm Lambda invocations. `undefined` is the "not computed yet" state and the only reason
   * this field is not `readonly`.
   */
  private currentFlag: boolean | undefined;

  /**
   * Hydrates one `SwPromotionPeriod` row.
   *
   * A single readonly parameter object as an inline object type rather than a second exported
   * interface, because this module exports exactly one unit and keeps no barrel files.
   *
   * Every nullable column is a REQUIRED slot typed `T | undefined` rather than an optional `?:`
   * slot. `exactOptionalPropertyTypes` is enabled, so absent and present-but-undefined are
   * genuinely different types, and requiring the key forces a hydrating repository to state "I
   * looked and found nothing". The only two `?:` slots are the collections, which default to `[]`.
   *
   * There is no collaborator port parameter, because this entity has zero `getService(` sites
   * across all 163 lines of the source. `currentFlag` is absent: it is a computed memo.
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

    // `?? []` here is NOT a defaulting coalesce on a nullable COLUMN - it is the empty-collection
    // default the plan prescribes for an owned one-to-many that the repository did not populate,
    // and it is applied identically in every shipped sibling. The four nullable columns above
    // receive no coalesce of any kind, per the third absence convention.
    this.promotionRewards = init.promotionRewards ?? [];
    this.promotionQualifiers = init.promotionQualifiers ?? [];

    // The memo starts uncomputed. Assigned explicitly rather than left implicitly `undefined` so
    // the "not computed yet" state is visible in the constructor a reviewer reads.
    this.currentFlag = undefined;
  }

  // --- Accessors
  //
  // ColdFusion auto-generated these from the property metadata, so there is no legacy body to port;
  // the locator on each cites the property declaration it serves. GETTERS ONLY - the legacy
  // component declares no setter for any persistent property. Concrete legacy call sites are cited
  // where they exist, so a reviewer can confirm each accessor is part of the exercised surface.

  /**
   * [model/entity/PromotionPeriod.cfc:L52] Heavily exercised: the promotion engine keys its
   * per-period qualification cache on this value at model/service/PromotionService.cfc:L192, L193,
   * L197, L209, L212, L213, L217, L222, L351, L1048, L1049 and L1053.
   */
  getPromotionPeriodID(): string {
    return this.promotionPeriodID;
  }

  /**
   * [model/entity/PromotionPeriod.cfc:L53] `undefined` means NO LOWER BOUND - forever. Never epoch,
   * never `0`, never a sentinel. Read by model/dao/PromotionDAO.cfc:L173-L174 and L240-L241, both
   * guarded with `not isNull(...)`.
   */
  getStartDateTime(): Date | undefined {
    return this.startDateTime;
  }

  /**
   * [model/entity/PromotionPeriod.cfc:L54] `undefined` means NO UPPER BOUND - forever. Never epoch,
   * never `0`, never a sentinel.
   *
   * Read by model/dao/PromotionDAO.cfc:L178 and L245, both of which sit under a condition testing
   * `getStartDateTime()` rather than `getEndDateTime()` - a duplicated-guard defect at
   * model/dao/PromotionDAO.cfc:L177 and L244 owned by the repository port, cross-referenced here.
   */
  getEndDateTime(): Date | undefined {
    return this.endDateTime;
  }

  /** [model/entity/PromotionPeriod.cfc:L55] `undefined` means UNLIMITED. Never `0`. */
  getMaximumUseCount(): number | undefined {
    return this.maximumUseCount;
  }

  /** [model/entity/PromotionPeriod.cfc:L56] `undefined` means UNLIMITED. Never `0`. */
  getMaximumAccountUseCount(): number | undefined {
    return this.maximumAccountUseCount;
  }

  /**
   * The materialized far side of the `promotion` many-to-one.
   * [model/entity/PromotionPeriod.cfc:L59]
   *
   * `undefined` when the repository did not fetch it, or after `removePromotion` cleared it.
   * Concretely called at model/service/PromotionService.cfc:L276, L290, L388, L403, L434, L449 and
   * L1075, and at model/entity/PromotionReward.cfc:L418 and
   * model/entity/PromotionQualifier.cfc:L360.
   */
  getPromotion(): Promotion | undefined {
    return this.promotion;
  }

  /** The `promotionID` column. [model/entity/PromotionPeriod.cfc:L59] */
  getPromotionID(): string | undefined {
    return this.promotionID;
  }

  /**
   * The LIVE `promotionRewards` array. [model/entity/PromotionPeriod.cfc:L62]
   *
   * Returns the array REFERENCE and never a copy, because the child side mutates it in place -
   * `arrayAppend` at model/entity/PromotionReward.cfc:L143 and `arrayDeleteAt` at L152, index at
   * L150. Handing back a copy would make both silently no-ops.
   */
  getPromotionRewards(): PromotionReward[] {
    return this.promotionRewards;
  }

  /**
   * The LIVE `promotionQualifiers` array. [model/entity/PromotionPeriod.cfc:L63]
   *
   * Same live-reference requirement as `getPromotionRewards`: `arrayAppend` at
   * model/entity/PromotionQualifier.cfc:L125 and `arrayDeleteAt` at L134. Also read by the
   * promotion engine at model/service/PromotionService.cfc:L587, L760, L762, L788 and L790.
   */
  getPromotionQualifiers(): PromotionQualifier[] {
    return this.promotionQualifiers;
  }

  /** [model/entity/PromotionPeriod.cfc:L66] */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [model/entity/PromotionPeriod.cfc:L69] */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /** The `createdByAccountID` column, opaque. [model/entity/PromotionPeriod.cfc:L70] */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/PromotionPeriod.cfc:L71] */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** The `modifiedByAccountID` column, opaque. [model/entity/PromotionPeriod.cfc:L72] */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // --- Implicit ORM collection predicates
  //
  // Not dispatcher branches and not inventions. ColdFusion generates a `has<singularname>()`
  // accessor for every one-to-many property, and the framework relies on exactly that:
  // org/Hibachi/HibachiEntity.cfc:L343, inside `hasAnyInProperty` (L340-L350), reaches for
  // `evaluate()` instead of `invokeMethod()` with the comment "because hasXXX() is an implicit orm
  // function". Both predicates below are concretely called on a PromotionPeriod receiver from the
  // child side.
  //
  // BOTH COMPARE BY PRIMARY KEY, never by object reference and never by deep equality. The legacy
  // containment test underneath is `arrayFind(collection, this)`, which in CFML/Hibernate is
  // session identity; the project-wide rule reproduces that as a primary-key comparison, stable
  // across two hydrations of the same row. Both return `false` on an empty array.

  /**
   * Does this period already hold the given reward? [model/entity/PromotionPeriod.cfc:L62]
   *
   * Called at model/entity/PromotionReward.cfc:L142, inside `setPromotionPeriod`, as the guard that
   * decides whether to append to the live array at L143.
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

  // --- Framework members

  /**
   * Whether this instance has been persisted yet.
   *
   * Inherited from the framework base in the legacy tree and concretely called at exactly one site
   * in this component - [model/entity/PromotionPeriod.cfc:L100], inside `setPromotion`. It is the
   * only framework member this entity uses on itself.
   *
   * The empty-string test is literally what the framework does: `isNew()` at
   * [org/Hibachi/HibachiEntity.cfc:L707-L709] returns `getNewFlag()`, and `getNewFlag()` at
   * [org/Hibachi/HibachiEntity.cfc:L571-L576] is
   *   `if(getPrimaryIDValue() == "") { return true; } return false;`.
   * The empty string it compares against is the `unsavedvalue=""` / `default=""` on the id property
   * at [model/entity/PromotionPeriod.cfc:L52].
   *
   * Nothing else the dispatcher at [org/Hibachi/HibachiEntity.cfc:L507-L565] can synthesise is
   * concretely called here, so no `hasAny*`, `hasUnique*`, `get*Options`, `get*SmartList`,
   * `get*Struct`, `get*Count`, `get*AssignedIDList` or `getAttributeValue` member is authored.
   */
  isNew(): boolean {
    return this.promotionPeriodID === '';
  }

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L78-L93]: these four methods sit OUTSIDE EVERY
  // BANNER BLOCK in the source - the first banner does not open until L95 - including
  // `isCurrent()`, whose semantic twin `getCurrentFlag()` does live inside a banner, at L135-L148.
  // Two methods answering one question from two different structural locations, which is very
  // likely how their behavioural divergence survived unnoticed. Secondary register item; the
  // TypeScript below is organised idiomatically rather than mirroring the source layout, because
  // minimal change scopes the functional surface and never the code style.

  // LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L80]: isCurrent() dereferences startDateTime
  // AND endDateTime with NO NULL GUARD OF ANY KIND, even though both columns are nullable and both
  // declare hb_nullRBKey="define.forever" at L53/L54 - metadata which says a null bound means
  // FOREVER, the permissive extreme. Contrast its two siblings in this same file: isExpired() at
  // L84 guards with isDate(), and getCurrentFlag() at L140 guards with !isNull() on BOTH bounds. So
  // a null bound makes this method blow up where the schema's own intent, and both sibling methods,
  // would return the permissive result. Reproduced by throwing: returning `true` would invent the
  // permissive behaviour the method does not have, `false` the opposite, and coalescing to a
  // sentinel date would violate the third absence convention recorded on the properties above. Same
  // treatment as the throwing stub for Sku.getPriceByPromotion() [model/entity/Sku.cfc:L258], and
  // it costs no divergence - reproducing the arm the port always takes IS the parity-correct
  // outcome.
  //
  // Preserved deliberately; do not fix without a product decision.

  // LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L80 vs L140]: isCurrent() and getCurrentFlag()
  // answer the same question - "is this period active right now?" - with OPPOSITE END-BOUNDARY
  // SEMANTICS. isCurrent() tests `getEndDateTime() > currentDateTime`, making the end bound
  // EXCLUSIVE, so at exactly now === endDateTime it returns FALSE. getCurrentFlag() tests
  // `getEndDateTime() < now()` and flips the flag false only then, making the end bound INCLUSIVE,
  // so at that same instant it returns TRUE. They diverge in three further ways: null handling
  // (none, versus !isNull() on both bounds), now() invocation count (one, captured into a local,
  // versus two separate textual calls on L140) and memoization (none, versus memoized). With both
  // bounds null, isCurrent() throws and getCurrentFlag() returns true. Every difference is
  // reproduced as written: neither method is normalised, neither is implemented in terms of the
  // other, and no shared helper is extracted.
  //
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Is this period active at the given instant? [model/entity/PromotionPeriod.cfc:L78-L81]
   *
   * THE SOLE SPEND OF THE PROJECT'S ENTITY-LAYER SIGNATURE-WIDENING BUDGET. The legacy signature is
   * `public boolean function isCurrent()` with no parameters, and spending the widening here
   * EXHAUSTS the budget: no further widening may be spent anywhere in `src/domain/entities/**`.
   * Every other date-dependent method in this folder keeps its zero-argument signature and reads
   * the injected clock internally - `isExpired()` [L83] and `getCurrentFlag()` [L137] here, plus
   * `Promotion.getCurrentFlag` [model/entity/Promotion.cfc:L83], `getCurrentPromotionPeriodFlag`
   * [L95], `getCurrentPromotionCodeFlag` [L109] and `PromotionCode.getCurrentFlag`
   * [model/entity/PromotionCode.cfc:L85].
   *
   * THE PARAMETER IS REQUIRED, NOT OPTIONAL, AND THAT IS THE POINT OF THE WIDENING. AAP 0.4.2
   * specifies `isCurrent(now: Date)`, "signature widened by one parameter so the UTC policy is
   * explicit and the method is deterministically testable". Defaulting it to the injected clock
   * would defeat both purposes: a no-argument call reads a clock the caller cannot see, which is
   * the ambient-state coupling AAP transformation rule T6 exists to remove, and it makes the
   * determinism opt-in when these boundaries genuinely need pinning - the start bound is INCLUSIVE,
   * the end bound is EXCLUSIVE, and the end bound DISAGREES with `getCurrentFlag()`. Dropping the
   * zero-argument call form costs nothing: `isCurrent()` has no legacy caller.
   *
   * The comparison is on `getTime()`, epoch milliseconds and therefore timezone independent, and
   * the instant is captured once and reused for both comparisons, reproducing
   *   `var currentDateTime = now();`
   * at L79 - which matters because `getCurrentFlag()` does not.
   *
   * @param now The instant to evaluate against. Required, with no default, so the caller always
   *   states which instant it means.
   * @throws Error when either bound is `undefined`, reproducing the L80 defect above.
   */
  isCurrent(now: Date): boolean {
    // Bound to a local named after the legacy local: `var currentDateTime = now();` at L79 captures
    // the instant ONCE and reuses it for both comparisons, which the parameter reproduces for free.
    // Contrast `getCurrentFlag()` below, which performs TWO separate textual `now()` reads at L140.
    const currentDateTime: Date = now;

    const startDateTime: Date | undefined = this.startDateTime;
    const endDateTime: Date | undefined = this.endDateTime;

    // The L80 defect, reproduced. In CFML, comparing a null against a date is a runtime error, so
    // the target raises one too rather than inventing an outcome. `isNullish` is deliberately NOT
    // used at this site: the legacy body performs NO absence test, and routing through an absence
    // helper would misrepresent the source as having a guard it does not have. The two sibling
    // methods below DO test for absence and DO use the helper - that contrast is the point.
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

    // START INCLUSIVE (`<=`), END EXCLUSIVE (`>`), exactly as written at L80. At the instant now
    // === endDateTime this returns FALSE, while getCurrentFlag() returns TRUE.
    return (
      startDateTime.getTime() <= currentDateTime.getTime() &&
      endDateTime.getTime() > currentDateTime.getTime()
    );
  }

  /**
   * Has this period's end bound already passed? [model/entity/PromotionPeriod.cfc:L83-L85]
   *
   *   return isDate(getEndDateTime()) && getEndDateTime() < now();
   *
   * SIGNATURE UNCHANGED - zero arguments, reading the injected clock internally.
   *
   * ONLY THE END BOUND IS EXAMINED: `startDateTime` is never consulted, so a period whose start is
   * in the future is not "expired". A null `endDateTime` yields `false` - not expired, i.e. forever
   * - which does match the `hb_nullRBKey="define.forever"` intent declared at
   * [model/entity/PromotionPeriod.cfc:L54], and that is precisely what makes `isCurrent()`'s
   * omission of the same guard a defect rather than a house style.
   *
   * `now()` is invoked inside the expression rather than captured into a local, and CFML `&&`
   * short-circuits, so the clock is not read at all when the end bound is absent.
   *
   * Concretely called at model/entity/PromotionReward.cfc:L418 and
   * model/entity/PromotionQualifier.cfc:L360, and internally by `isDeletable()`.
   */
  isExpired(): boolean {
    const endDateTime: Date | undefined = this.endDateTime;

    // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L84]: CFML `isDate(...)` applied to a slot that
    // is either a timestamp or null is exactly an absence test, so it maps to `isNullish(...)` from
    // src/lib/cfml/truthiness.ts, used here rather than a hand-rolled `=== undefined` so the CFML
    // semantics stay auditable. The trailing `endDateTime === undefined` is a type-narrowing step
    // only - `isNullish` returns `boolean`, not a type predicate - and changes no outcome.
    if (isNullish(endDateTime) || endDateTime === undefined) {
      return false;
    }

    // The clock is read only on this branch, reproducing CFML `&&` short-circuiting. UTC policy:
    // the comparison is on epoch milliseconds.
    return endDateTime.getTime() < this.now().getTime();
  }

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L87]: the legacy declaration is
  //   `public boolean function isDeletable ()`,
  // with a space before the parentheses. Not reproduced.

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L88]: counter-intuitive polarity, flagged rather
  // than "corrected". A period is deletable IF IT IS NOT EXPIRED. Intuition runs the other way, but
  // the polarity is plausibly intentional - it guards against deleting historical records that have
  // already applied discounts to real orders, which is what the parent's own rule protects too
  // (`Promotion.isDeletable()` at model/entity/Promotion.cfc:L170-L171 is
  //   `return arrayLen( getAppliedPromotions() ) == 0;`).
  // Net semantics: deletable if and only if NOT EXPIRED and the parent promotion has no applied
  // promotions.

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L88, L92]: both `isDeletable()` and
  // `getSimpleRepresentation()` call `getPromotion()` with no null guard and immediately
  // dereference the result. With `promotion` typed `Promotion | undefined` TypeScript forces the
  // absent case to be handled, and the parity-correct handling is to THROW - a CFML null-reference
  // error - rather than coalesce to `true`, `false` or `''`. Absence is unlikely, because L59 marks
  // the association `fetch="join"`, but the repository may legitimately hydrate a period without
  // its parent.

  /**
   * May this period be deleted? [model/entity/PromotionPeriod.cfc:L87-L89]
   *
   *   return !isExpired() && getPromotion().isDeletable();
   *
   * NOT MEMOIZED, because the legacy is not - `getCurrentFlag()` is the only memoized member here.
   *
   * The `&&` short-circuit is load-bearing and is reproduced by the early return below: when the
   * period IS expired CFML never evaluates the second operand, so `getPromotion()` is never called
   * and the method returns `false` WITHOUT throwing even when the parent association is absent.
   * Collapsing this into one boolean expression that touched `promotion` first would introduce a
   * throw the legacy does not have.
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
   *   return getPromotion().getPromotionName();
   *
   * THIS ENTITY OVERRIDES `getSimpleRepresentation()` DIRECTLY, the framework's documented
   * alternative to declaring `getSimpleRepresentationPropertyName()`: the base implementation at
   * [org/Hibachi/HibachiEntity.cfc:L59] invokes whatever L74's property-name accessor names, and
   * L87 throws when neither is supplied. Contrast [model/entity/PriceGroupRate.cfc:L270] and
   * [model/entity/PromotionCode.cfc:L171], which declare the property-name variant. The override
   * form is preserved and no property-name variant is added. The `override` keyword is absent
   * because there is no TypeScript base class in this folder.
   *
   * Same unguarded reach-through as `isDeletable()` - see the shared LEGACY-NOTE above.
   *
   * TWO DISTINCT RAISES, NOT ONE, AND CFML RAISES ON BOTH. The first is the unguarded
   * `getPromotion()` dereference. The second was surfaced by typing `Promotion.getPromotionName()`
   * honestly: [model/entity/Promotion.cfc:L53] declares `promotionName` with NO `notNull="true"` -
   * contrast [model/entity/Product.cfc:L55], which carries it - so the column is nullable and the
   * generated accessor can answer null. Requiredness is imposed only by
   * [model/validation/Promotion.json] and only in the `save` context, which says nothing about a
   * row already in the table. L91 nonetheless declares `returntype="string"`, and CFML enforces a
   * declared return type, so returning null is a runtime coercion failure rather than a silent
   * `''`. Substituting an empty string would invent a successful return the legacy runtime does not
   * produce, on a label that reaches the admin UI. Both raises carry distinct messages.
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
  // identically-titled banners, with inline sub-banners at L97, L115 and L124. Six methods, and
  // FIVE OF THE FILE'S SEVEN DEFECTS live in this 38-line window.
  //
  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L95-L132]: the remove-that-adds inversion
  // cross-check, re-run against the verbatim source. `arrayAppend` occurs exactly once in the whole
  // component, at L101 inside `setPromotion`, and no `remove*` body contains any append. VERDICT:
  // ZERO ADD-INVERSIONS. `removePromotion` [L104-L113] is a genuine arrayFind/arrayDeleteAt delete
  // carrying the separate, reachable `arguments.account` leak at L110; `removePromotionReward`
  // [L120-L122] and `removePromotionQualifier` [L128-L130] both delegate a remove-shaped call to
  // the child and throw only because the method name is wrong. The reference instances of the
  // genuine inversion defect are elsewhere - model/entity/Option.cfc:L129-L131 and
  // model/entity/Option.cfc:L145-L147, where `removePromotionRewardExclusion()` and
  // `removePromotionQualifierExclusion()` both call `addExcludedOption(this)`.

  // Promotion (many-to-one) [model/entity/PromotionPeriod.cfc:L97]

  /**
   * Bidirectional helper for the `promotion` many-to-one.
   * [model/entity/PromotionPeriod.cfc:L98-L103]
   *
   *   variables.promotion = arguments.promotion;
   *   if(isNew() or !arguments.promotion.hasPromotionPeriod( this )) {
   *       arrayAppend(arguments.promotion.getPromotionPeriods(), this);
   *   }
   *
   * SOUND, AND THEREFORE UNMARKED. It resolves cleanly because model/entity/Promotion.cfc:L62
   * genuinely declares the `promotionPeriods` collection - the same resolution as
   * `PromotionApplied.setPromotion` and the exact opposite of `PromotionAccount.setPromotion`
   * [model/entity/PromotionAccount.cfc:L90-L95], which throws on every path. The throwing-stub
   * treatment applied in promotionAccount.ts must NOT be copied here.
   *
   * Three behaviours are preserved precisely: the near-side assignment runs FIRST, since L99
   * precedes the guard at L100, so this instance's field is updated even when the far-side array is
   * untouched; the guard tests THIS instance's newness rather than the argument's, contrasting
   * `PriceGroupRate.addProductType`, which guards the argument instead; and CFML `or`
   * short-circuits, so when `isNew()` is true `hasPromotionPeriod` is never called. The append
   * targets the LIVE array returned by `getPromotionPeriods()`, matching `arrayAppend` at L101.
   */
  setPromotion(promotion: Promotion): void {
    // [model/entity/PromotionPeriod.cfc:L99] - before the guard, always.
    this.promotion = promotion;

    // [model/entity/PromotionPeriod.cfc:L100] - `isNew()` first, so the far-side membership test is
    // skipped entirely for an unsaved period.
    if (this.isNew() || !promotion.hasPromotionPeriod(this)) {
      // [model/entity/PromotionPeriod.cfc:L101] - mutates the parent's live array in place.
      promotion.getPromotionPeriods().push(this);
    }
  }

  // LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L110]: removePromotion() references
  // `arguments.account`, not a declared argument of this method - the signature at L104 is
  // `removePromotion(any promotion)` and `promotion` is its only argument. A copy-paste leak, and
  // in CFML an undefined-variable error. UNLIKE THE IDENTICAL LEAK AT
  // model/entity/PromotionAccount.cfc:L103, THIS ONE IS REACHABLE: there the preceding line threw
  // first, because Promotion has no `promotionAccounts` collection, so the first defect masked the
  // second. Here L108's `arguments.promotion.getPromotionPeriods()` SUCCEEDS, because
  // model/entity/Promotion.cfc:L62 declares `promotionPeriods`; the index is computed correctly,
  // and whenever it is greater than zero L110 executes and throws. The method therefore fails in
  // the normal, expected case - the period actually being present in its parent's collection - and
  // "succeeds" only when the period is absent. Two consequences follow and are both reproduced: the
  // parent's array is NEVER mutated by this method, and the near-side clear at L112 is UNREACHABLE
  // on the found path. That the leak is accidental is confirmed by the children, whose equivalents
  // get it right - model/entity/PromotionReward.cfc:L150/L152 and
  // model/entity/PromotionQualifier.cfc:L132/L134 search AND delete against the same object.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Bidirectional helper for the `promotion` many-to-one.
   * [model/entity/PromotionPeriod.cfc:L104-L113]
   *
   *   if(!structKeyExists(arguments, "promotion")) { arguments.promotion = variables.promotion; }
   *   var index = arrayFind(arguments.promotion.getPromotionPeriods(), this);
   *   if(index > 0) { arrayDeleteAt(arguments.account.getPromotionPeriods(), index); }
   *   structDelete(variables, "promotion");
   *
   * A partially-throwing port, reproducing the legacy failure on exactly the path that fails there.
   * Not "fixed" by substituting `promotion` for `account`: that would change which side of the
   * association is mutated.
   *
   * @throws Error when this period IS found in the parent's collection - the L110 leak.
   * @throws Error when no promotion can be resolved at all, because L108 dereferences the resolved
   *         value unconditionally.
   */
  removePromotion(promotion?: Promotion): void {
    // [model/entity/PromotionPeriod.cfc:L105-L107]: CFML probes
    //   `structKeyExists(arguments, "promotion")`
    // and defaults the absent argument to `variables.promotion`; the TypeScript form is an optional
    // parameter with a nullish fallback. `structKeyExists` from src/lib/cfml/struct.ts is not used;
    // this is an argument-presence test, not a struct lookup.
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
    // comparison, stable across two hydrations of the same row. Note the base change that forces:
    // CFML `arrayFind` is 1-based and returns 0 when absent, which is why L109 gates on
    //   `index > 0`,
    // while `findIndex` is 0-based and returns -1, so the gate is `index !== -1`. The callback
    // parameter is annotated explicitly so this file carries no implicit `any` through the sibling
    // `Promotion` type.
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

    // [model/entity/PromotionPeriod.cfc:L112]: `structDelete(variables, "promotion")`. Reached ONLY
    // on the not-found path, exactly as in the legacy, where L110 throws first on the found path.
    // The ordering is preserved deliberately: the clear is NOT hoisted above the throw, and the
    // throw is NOT wrapped so that the clear still runs.
    this.promotion = undefined;
  }

  // Promotion Rewards (one-to-many) [model/entity/PromotionPeriod.cfc:L115]
  //
  // BOTH HELPERS IN THIS PAIR THROW, and so do both in the Qualifiers pair below: all four call the
  // wrong method name on the child. The children's parent property is `promotionPeriod` - proved by
  // `fkcolumn="promotionPeriodID"` at model/entity/PromotionPeriod.cfc:L62-L63 - so the correct
  // calls are `setPromotionPeriod(this)` and `removePromotionPeriod(this)`, both of which the
  // children declare (model/entity/PromotionReward.cfc:L140/L146 and
  // model/entity/PromotionQualifier.cfc:L122/L128). Each is authored with its legacy name and
  // signature verbatim, returning `void` to match the legacy declaration and deliberately not
  // `never`, which is reserved for `Sku.getPriceByPromotion()` whose legacy declaration is
  // `numeric`. The retained parameters are never read - they exist for interface parity, which is
  // why tsconfig.json omits `noUnusedParameters` and eslint.config.mjs sets `args: 'none'`.

  // LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L117]: addPromotionReward() calls
  // `arguments.promotionReward.setPromotion(this)`. model/entity/PromotionReward.cfc declares its
  // parent property as `promotionPeriod` at L70 and declares `setPromotionPeriod` at L140; it
  // declares no `promotion` property, so there is no generated `setPromotion` to call. The call
  // matches none of the eleven onMissingMethod patterns at org/Hibachi/HibachiEntity.cfc:L507-L565
  // and throws at L565. The intended call was `setPromotionPeriod(this)`. (The source line is also
  // indented with a tab plus three spaces where L121 uses a single tab - cosmetic only.)
  //
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Bidirectional helper for the `promotionRewards` collection.
   * [model/entity/PromotionPeriod.cfc:L116-L118]
   *
   * A throwing stub mirroring the legacy runtime failure rather than repairing it, following the
   * precedent set for `Sku.getPriceByPromotion()` [model/entity/Sku.cfc:L258], whose body calls a
   * method that does not exist and which the plan ports as a throwing stub carrying the TODO. The
   * throw carries the framework's terminal missing-method text byte for byte - see
   * `hibachiMissingMethodMessage` above for why that is an observable contract.
   *
   * @throws Error always - the terminal missing-method message for `setPromotion()` on
   *         `PromotionReward`.
   */
  addPromotionReward(promotionReward: PromotionReward): void {
    // [model/entity/PromotionPeriod.cfc:L117]: `arguments.promotionReward.setPromotion(this)`. The
    // dead target is `setPromotion` and it is called ON a PromotionReward, so those are the two
    // slots the framework's terminal message carries.
    throw new Error(hibachiMissingMethodMessage('setPromotion', 'PromotionReward'));
  }

  // LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L121]: removePromotionReward() calls
  // `arguments.promotionReward.removePromotion(this)`. model/entity/PromotionReward.cfc declares no
  // `promotion` property and no hand-written `removePromotion`, so - `remove*` matching none of the
  // eleven onMissingMethod patterns at org/Hibachi/HibachiEntity.cfc:L507-L565 - the call throws at
  // L565. The intended call was `removePromotionPeriod(this)`, declared at
  // model/entity/PromotionReward.cfc:L146.
  //
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Bidirectional helper for the `promotionRewards` collection.
   * [model/entity/PromotionPeriod.cfc:L120-L122]
   *
   * A throwing stub. Per the inversion cross-check above this body IS remove-shaped, so it is not
   * an inversion defect; its defect is the wrong method name.
   *
   * @throws Error always - the terminal missing-method message for `removePromotion()` on
   *         `PromotionReward`.
   */
  removePromotionReward(promotionReward: PromotionReward): void {
    // [model/entity/PromotionPeriod.cfc:L121]: `arguments.promotionReward.removePromotion(this)`.
    // The dead target is `removePromotion` and it is called ON a PromotionReward.
    throw new Error(hibachiMissingMethodMessage('removePromotion', 'PromotionReward'));
  }

  // LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L126]: addPromotionQualifier() calls
  // `arguments.promotionQualifier.setPromotion( this )`. model/entity/PromotionQualifier.cfc
  // declares its parent property as `promotionPeriod` at L68 and declares `setPromotionPeriod` at
  // L122; it declares no `promotion` property, so there is no generated `setPromotion`. The call
  // matches none of the eleven onMissingMethod patterns at org/Hibachi/HibachiEntity.cfc:L507-L565
  // and throws at L565. The intended call was `setPromotionPeriod(this)`.
  //
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Bidirectional helper for the `promotionQualifiers` collection.
   * [model/entity/PromotionPeriod.cfc:L125-L127]
   *
   * A throwing stub on identical terms to `addPromotionReward`.
   *
   * @throws Error always - the terminal missing-method message for `setPromotion()` on
   *         `PromotionQualifier`.
   */
  addPromotionQualifier(promotionQualifier: PromotionQualifier): void {
    // [model/entity/PromotionPeriod.cfc:L126]: `arguments.promotionQualifier.setPromotion( this )`.
    // The dead target is `setPromotion` and it is called ON a PromotionQualifier.
    throw new Error(hibachiMissingMethodMessage('setPromotion', 'PromotionQualifier'));
  }

  // LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L129]: removePromotionQualifier() calls
  // `removePromotion( this )` on the qualifier. model/entity/PromotionQualifier.cfc declares no
  // `promotion` property and no hand-written `removePromotion`, so the call matches none of the
  // eleven onMissingMethod patterns at org/Hibachi/HibachiEntity.cfc:L507-L565 and throws at L565.
  // The intended call was `removePromotionPeriod(this)`, at
  // model/entity/PromotionQualifier.cfc:L128.
  //
  // Preserved deliberately; do not fix without a product decision.

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L129]: a second, independent wart on the same
  // line - the source reads `arguments.PromotionQualifier` with a capital P while the argument
  // declared at L128 is `promotionQualifier`. CFML's `arguments` scope is case-insensitive so the
  // mismatch resolves harmlessly there; TypeScript is case-sensitive, so the parameter below
  // matches the declaration. Same wart class as `skusList` / `SkusList` inside
  // `PriceGroupRate.getAppliesTo()`. Secondary item, and not the throwing defect.

  /**
   * Bidirectional helper for the `promotionQualifiers` collection.
   * [model/entity/PromotionPeriod.cfc:L128-L130]
   *
   * A throwing stub on identical terms to `removePromotionReward`. Remove-shaped, so not an
   * inversion defect; the defect is the wrong method name.
   *
   * @throws Error always - the terminal missing-method message for `removePromotion()` on
   *         `PromotionQualifier`.
   */
  removePromotionQualifier(promotionQualifier: PromotionQualifier): void {
    // [model/entity/PromotionPeriod.cfc:L129]:
    //   `arguments.PromotionQualifier.removePromotion( this )` -
    // capital P in the source, harmless because CFML's `arguments` scope is case-insensitive. The
    // dead target is `removePromotion` and it is called ON a PromotionQualifier.
    throw new Error(hibachiMissingMethodMessage('removePromotion', 'PromotionQualifier'));
  }

  /**
   * Memoized "is this period active?" flag. [model/entity/PromotionPeriod.cfc:L137-L146]
   *
   *   if(!structKeyExists(variables, "currentFlag")) {
   *       variables.currentFlag = true;
   *       if( ( !isNull(getStartDateTime()) && getStartDateTime() > now() )
   *           || ( !isNull(getEndDateTime()) && getEndDateTime() < now() ) ) {
   *           variables.currentFlag = false;
   *       }
   *   }
   *   return variables.currentFlag;
   *
   * A CORRECT instance of the memoized-accessor seed/guard pattern, and therefore unmarked: seed
   * key, write key and return key are all `currentFlag`. Contrast the two defective instances -
   * `Product.getBrandName` [model/entity/Product.cfc:L524-L532] seeds with `""` then returns
   * without assigning, and `Sku.getOptionsByOptionGroupIDStruct` [model/entity/Sku.cfc:L512-L522]
   * populates `variables.OptionsByGroupIDStruct` but returns
   * `variables.optionsByOptionGroupIDStruct`.
   *
   * Signature unchanged - zero arguments, reading the injected clock internally. The seed is
   * `true`, matching the `define.forever` / `define.unlimited` intent, so both bounds absent yields
   * `true`.
   *
   * BOTH BOUNDS ARE INCLUSIVE here (`start > now` and `end < now` flip the flag), so at
   *   `now === endDateTime`
   * this returns `true` where `isCurrent()` returns `false` - see the L80-vs-L140 marker above. Two
   * separate clock reads are preserved at the two positions L140 uses, with identical
   * short-circuiting, so the runtime read count matches the legacy.
   *
   * Concretely called at model/entity/Promotion.cfc:L98, in `getCurrentPromotionPeriodFlag()`.
   */
  getCurrentFlag(): boolean {
    // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L138]: a true memo guard, not a lazy-load
    // probe. `currentFlag` is `persistent="false"` at L75 and never hydrated from a row, so
    // `structKeyExists(variables, "currentFlag")` genuinely asks "have I computed this yet?".
    // Contrast model/entity/Product.cfc:L617, whose `structKeyExists(variables, "defaultSku")`
    // probes Hibernate lazy-load state on a money-critical path. Implemented as `=== undefined` on
    // the private memo field: `structKeyExists` from src/lib/cfml/struct.ts models case-insensitive
    // access on a data struct including the present-but-undefined state, which has no analogue for
    // a private field, and `isNullish` would erase the distinction from `isNull`.
    if (this.currentFlag === undefined) {
      // [model/entity/PromotionPeriod.cfc:L139] - seed permissive.
      this.currentFlag = true;

      const startDateTime: Date | undefined = this.startDateTime;
      const endDateTime: Date | undefined = this.endDateTime;

      // [model/entity/PromotionPeriod.cfc:L140] - the two `!isNull(...)` guards map to
      // `!isNullish(...)`; each trailing `!== undefined` is a type-narrowing step only, since
      // `isNullish` returns `boolean` rather than a type predicate. The two `this.now()` reads sit
      // at exactly the two positions the legacy line uses, so `&&` / `||` short-circuiting
      // reproduces the legacy read count on every path.
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

    // [model/entity/PromotionPeriod.cfc:L145]. The memo is instance-scoped and instances are
    // request-scoped, so a second call within one request will not recompute even if the injected
    // clock has since moved past the end bound. Never module-scoped, which would leak state across
    // warm Lambda invocations.
    return this.currentFlag;
  }
}

// ---------------------------------------------------------------------------------------------
// Source layout notes, recorded rather than reproduced
// ---------------------------------------------------------------------------------------------
//
// LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L150-L152]: the `Custom Formatting Methods` banner
// pair is empty, consistent with the property census - no monetary column, no `currencyCode`, no
// formatted-output accessor - so no `getAmountFormatted` member is invented.
//
// LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L154-L156]: a duplicate, empty second
// `Bidirectional Helper Methods` banner pair, 22 lines after the first closed at L132. The same
// wart appears at model/entity/PromotionAccount.cfc:L117/L119, pointing at a shared component
// template rather than an isolated slip. Secondary item.
//
// LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L158-L160]: the `ORM Event Hooks` banner pair is
// empty - no `preInsert`, no `preUpdate`. The four hook-bearing in-scope entities are `Category`
// (model/entity/Category.cfc:L126/L131), `PriceGroup` (model/entity/PriceGroup.cfc:L206/L211),
// `ProductType` (model/entity/ProductType.cfc:L305/L310) and `PromotionCode`
// (model/entity/PromotionCode.cfc:L179, insert-only). This entity is not one of them, so there is
// no hook-equivalent maintenance for a repository to invoke on save.
//
// LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L95-L148]: the banner order is inverted relative to
// most siblings - `Bidirectional Helper Methods` (L95-L132) precedes
//   `Non-Persistent Property Methods`
// (L135-L148). model/entity/PromotionAccount.cfc carries the identical inversion. The L52-L78
// region is also CRLF-terminated while L98 onward is LF only; this file uses LF per
// .prettierrc.json (`endOfLine: "lf"`).
//
// Absences that must not be filled in: no materialized-path column; no `attributeValues`
// collection, which makes the `getAttributeValue` EAV fallback at
// org/Hibachi/HibachiEntity.cfc:L559 unreachable from here so an unmatched `get...` throws directly
// at L565; no monetary column, so no ../valueObjects/money.js and no arithmetic at all; no
// `getSimpleRepresentationPropertyName()`, because L91 overrides `getSimpleRepresentation()`
// directly; and no zod schema, because enforcing model/validation/PromotionPeriod.json during
// hydration would reject rows the legacy ORM loads happily - both bounds are legitimately null.
