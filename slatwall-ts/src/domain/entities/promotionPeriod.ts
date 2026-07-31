// ---------------------------------------------------------------------------
// slatwall-ts - PromotionPeriod entity
//
// PORT OF model/entity/PromotionPeriod.cfc (163 lines, confirmed by `wc -l`).
//
// *** THE MOST DEFECT-DENSE ENTITY IN THIS FOLDER RELATIVE TO ITS SIZE, AND ***
// *** THE FILE THAT SPENDS THE PROJECT'S ONE AND ONLY ENTITY-LAYER          ***
// *** SIGNATURE WIDENING.                                                   ***
//
// Seven preserved defects live in 163 lines, six of them inside the 38-line
// window L95-L132. Every one is REPRODUCED, never repaired: behaviour
// preservation extends to defects, and a method that throws at runtime today
// throws in the target. Each carries its own two-line LEGACY-DEFECT marker at
// the exact locator a reviewer can check it against:
//
//   L80          isCurrent() dereferences both bounds with NO null guard.
//   L80 vs L140  isCurrent() and getCurrentFlag() answer the same question with
//                OPPOSITE end-boundary semantics.
//   L110         removePromotion() dereferences the UNDECLARED `arguments.account`
//                - and unlike the identical leak at PromotionAccount.cfc:L103,
//                this one is REACHABLE.
//   L117         addPromotionReward() calls setPromotion() on a child that has none.
//   L121         removePromotionReward() calls removePromotion() on a child that has none.
//   L126         addPromotionQualifier() calls setPromotion() on a child that has none.
//   L129         removePromotionQualifier() calls removePromotion() on a child that has none.
//
// Two members that LOOK defective are NOT, and are deliberately unmarked so the
// register stays honest: `setPromotion` [L98-L103] is sound, because
// model/entity/Promotion.cfc:L62 genuinely declares `promotionPeriods`; and
// `getCurrentFlag` [L137-L146] is a CORRECT instance of the memoized-accessor
// seed/guard pattern - the control case that proves the pattern works when
// written properly. See the annotations on each.
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/PromotionPeriod.cfc:L49]
//
//   component displayname="Promotion Period" entityname="SlatwallPromotionPeriod"
//   table="SwPromotionPeriod" persistent="true" extends="HibachiEntity"
//   cacheuse="transactional" hb_serviceName="promotionService"
//   hb_permission="promotion.promotionPeriods" {
//
// Schema continuity is a binding constraint: entity property metadata IS the
// contract. Table `SwPromotionPeriod`, entity name `SlatwallPromotionPeriod`. No
// migration, no rename, no new table, no column change. Every `ormtype`,
// `length`, `notnull`, `fkcolumn`, `cascade`, `inverse`, `fetch`, `generator`,
// `unsavedvalue`, `default`, `hb_formatType`, `hb_nullRBKey` and
// `hb_populateEnabled` value is carried forward verbatim below as an inert
// comment, and out-of-scope foreign keys are preserved as inert columns rather
// than dropped.
//
// FOUR OBSERVATIONS ON THAT DECLARATION, each verified against the source:
//
//   * `persistent="true"` is QUOTED, matching model/entity/PromotionApplied.cfc:L49
//     and model/entity/PromotionAccount.cfc:L49, and contrasting the unquoted
//     `persistent=true output=false accessors=true` used by
//     model/entity/PriceGroup.cfc and model/entity/PriceGroupRate.cfc. A cosmetic
//     inconsistency in the legacy tree; annotated, not normalised.
//   * NO `accessors=` and NO `output=` attribute. ColdFusion supplies generated
//     accessors regardless, so the omission is cosmetic. Noted, not "corrected".
//   * NO `hb_processContexts`.
//   * `hb_permission="promotion.promotionPeriods"` is dotted and CORRECTLY SPELLED.
//     Contrast model/entity/PromotionReward.cfc:L57, whose
//     `hb_permission="promotionPeriod.promtionRewards"` carries a typo requiring a
//     documented rename in THAT file. NOTHING NEEDS RENAMING HERE.
//
// `hb_serviceName="promotionService"` points at model/service/PromotionService.cfc.
// There is no `PromotionPeriodService` in the legacy tree and none is invented.
//
// THE `extends` CHAIN IS THREE LEVELS DEEP, NOT TWO
// `extends="HibachiEntity"` on L49 is UNQUALIFIED, so it resolves to the local
// model/entity/HibachiEntity.cfc (274 lines), which itself extends
// `Slatwall.org.Hibachi.HibachiEntity`. That intermediate class reaches outward
// through exactly 12 `getService(...)` sites and NONE of them is ported. They
// must not be silently re-implemented either: an entity reaching outward through
// a service locator is precisely the pattern the ESLint `no-restricted-imports`
// layer boundary in eslint.config.mjs exists to make impossible. This entity
// needs none of them - `grep -c 'getService('` over all 163 lines returns ZERO,
// which is why no collaborator port appears in its constructor and why every
// method below is SYNCHRONOUS.
//
// WHAT THE FRAMEWORK BASE CONTRIBUTES, AND WHY ALMOST NONE OF IT IS AUTHORED
// org/Hibachi/HibachiEntity.cfc:L507-L565 is an `onMissingMethod` dispatcher
// matching eleven method-name patterns - hasUniqueOrNull*, hasUnique*, hasAny*,
// get*AssignedIDList, get*ID, get*Options, get*OptionsSmartList, get*SmartList,
// get*Struct, get*Count, and a `getAttributeValue` fallback at L559 - and
// TERMINATING IN A THROW AT L565. TypeScript must not emulate dynamic dispatch,
// so there is no Proxy, no index signature, no `evaluate()`, no `variables.`
// scope object and no string-keyed method table anywhere below. Only concretely
// called members are authored, and the only framework member this entity uses on
// itself is `isNew()`, at L100.
//
// EVERY PATTERN IN THAT DISPATCHER IS `has*`- OR `get*`-PREFIXED, WHICH IS THE
// MECHANISM BEHIND FOUR OF THE SEVEN DEFECTS. `set*` and `remove*` match
// nothing, so the four one-to-many helpers at L117, L121, L126 and L129 fall
// straight through to the L565 throw. The L559 EAV fallback cannot catch them
// either: it requires an `attributeValues` property, and only four in-scope
// entities declare one - model/entity/Sku.cfc:L70, model/entity/Product.cfc:L75,
// model/entity/ProductType.cfc:L67 and model/entity/Brand.cfc:L60. This entity
// is not among them, so the EAV path is unreachable from here and is NOT ported.
//
// WHY `hasPromotionReward` AND `hasPromotionQualifier` ARE AUTHORED BELOW
// They are not dispatcher hits and they are not inventions: they are IMPLICIT
// ORM-GENERATED accessors for the `promotionRewards` / `promotionQualifiers`
// collections, and the framework says so in its own words at
// org/Hibachi/HibachiEntity.cfc:L343, inside `hasAnyInProperty` (L340-L350):
// "evaluate is used instead of invokeMethod() because hasXXX() is an implicit orm
// function". Both are concretely called on a PromotionPeriod receiver -
// `hasPromotionReward( this )` at model/entity/PromotionReward.cfc:L142 and
// `hasPromotionQualifier( this )` at model/entity/PromotionQualifier.cfc:L124 -
// so authoring them is the exact mirror of the far-side contract this file
// requires of promotion.ts, and it spends no budget.
//
// THE EXPLICIT UTC POLICY (this file performs every date comparison in the port
// of this entity, so the policy is stated once here and referenced at each site)
// CFML `now()` and CFML date comparison both depend on the server timezone. The
// target must not. Every comparison below is performed on `Date.prototype
// .getTime()`, which is epoch milliseconds in UTC and therefore timezone
// independent, and the clock itself is INJECTED rather than read from the
// ambient environment. Nothing here calls `Date.now()`, constructs `new Date()`,
// or reads a local-time component such as `getHours()`. Referenced at
// `isCurrent` [L78-L81], `isExpired` [L83-L85] and `getCurrentFlag` [L137-L146].
//
// THE VALIDATION SCHEMA IS DOCUMENTED HERE AND ENFORCED ELSEWHERE
// model/validation/PromotionPeriod.json EXISTS - this entity is NOT one of the
// four in-scope entities lacking a schema (Category, PromotionQualifier,
// PromotionApplied, PromotionAccount, whose absent files must never be
// invented). It declares a CROSS-FIELD rule, not a simple field rule:
//
//   "conditions": { "needsEndAfterStart": { "startDateTime": {"required":true},
//                                           "endDateTime":   {"required":true} } }
//   "endDateTime": [ {"contexts":"save","dataType":"date"},
//                    {"contexts":"save","conditions":"needsEndAfterStart",
//                     "gtProperty":"startDateTime"} ]
//
// The identical rule appears in model/validation/PromotionCode.json. It is
// recorded here as documentation ONLY. There is deliberately no zod schema in
// this file and no constructor invariant asserting it: enforcement is a
// service-tier concern, and asserting it during hydration would reject rows the
// legacy ORM happily loads - both bounds are legitimately null, which is exactly
// what the absence convention below is about. This entity also declares NONE of
// the five declaratively-invoked validator methods in the slice
// (`hasUniqueOptions` / `hasOneOptionPerOptionGroup` from Sku.json,
// `hasExpressionWithListOfNumericValuesOnly` from RoundingRule.json,
// `getPromotionCodesDeletableFlag` from Promotion.json,
// `hasUniquePromotionCode` from PromotionCode.json), so none is authored - in
// particular no `hasUniquePromotionPeriod` and no date-range validator. It has
// no code column either, so none of the three
// `^[a-zA-Z0-9-_.|:~^]+$` code regexes applies.
//
// BUDGET LEDGER FOR THIS FILE
//   Entity-layer signature widenings ... 1 SPENT - `isCurrent(now?: Date)`.
//                                        THE PROJECT TOTAL IS EXACTLY 1, so the
//                                        budget is now EXHAUSTED: no further
//                                        widening may EVER be spent anywhere in
//                                        src/domain/entities/**.
//   Deliberate divergences ........... 0 spent (the entities budget of 1 is
//                                        reserved for sku.ts / product.ts).
//   Signature reshapings ............. 0 spent (all 3 belong to src/services).
//   Visibility widenings ............. 0 spent (all 5 belong to src/services).
//
// A NOTE ON WHY THE L80 DEFECT SURVIVED: `isCurrent()` IS DEAD CODE UPSTREAM.
// A repository-wide grep for `isCurrent()` returns exactly one hit - its own
// declaration at model/entity/PromotionPeriod.cfc:L78. Nothing in admin/,
// frontend/, public/, model/, org/ or integrationServices/ ever calls it. Its
// memoized twin `getCurrentFlag()` IS called, at model/entity/Promotion.cfc:L98
// inside `getCurrentPromotionPeriodFlag()`. That asymmetry is the reason the
// missing null guard at L80 has never surfaced in production, and it is recorded
// so a reviewer does not mistake the defect for something the legacy system
// exercises. It changes nothing about the obligation to reproduce it.
//
// NO USER RULES WERE PROVIDED
// The project rules document returns exactly "No user rules provided.", and the
// agent action plan states the same in 0.7. No rule is invented to fill the gap,
// no file enters scope by rule mandate, and there are no rule conflicts to
// resolve. The absence is NOT treated as licence to lower the bar: the
// enterprise substitute standard applies at full strength - maximal strictness
// with no `any`, no suppression comment and no non-null assertion; one exported
// unit per file and no barrel; no credential, no SQL and no environment read;
// and every judgment call annotated at the point where it was made.
//
// TEST COVERAGE FOR THIS MODULE IS NET-NEW
// `PromotionPeriod` has NO legacy test whatsoever. Only two of the eighteen
// in-scope entities have a legacy antecedent - brand.ts from
// meta/tests/unit/entity/BrandTest.cfc and product.ts from
// meta/tests/unit/entity/ProductTest.cfc - and
// meta/tests/functional/admin/entity/ProductTest.cfc is an empty stub
// contributing zero coverage. Coverage here is therefore net-new and must never
// be presented as parity. The contract the test tier has to pin is enumerated at
// the foot of this file. No test file is authored from here.
// ---------------------------------------------------------------------------

import { isNullish } from '../../lib/cfml/truthiness.js';
import type { Promotion } from './promotion.js';
import type { PromotionQualifier } from './promotionQualifier.js';
import type { PromotionReward } from './promotionReward.js';

// LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L100, L101, L108, L88, L92] - THE FAR-SIDE
// CONTRACT THIS FILE REQUIRES OF `slatwall-ts/src/domain/entities/promotion.ts`, PUBLISHED HERE
// AS CANONICAL BECAUSE THAT FILE IS AUTHORED SEPARATELY. Four members, all of which resolve in
// the legacy tree, so none of them is an invention:
//   * `getPromotionPeriods(): PromotionPeriod[]` - the generated accessor for
//     model/entity/Promotion.cfc:L62. It MUST return the LIVE array reference and never a copy,
//     because L101 `arrayAppend`s into it and L110 `arrayDeleteAt`s from it in place.
//   * `hasPromotionPeriod(promotionPeriod: PromotionPeriod): boolean` - the implicit ORM
//     accessor for that same collection (see the header note citing
//     org/Hibachi/HibachiEntity.cfc:L343). It MUST compare by PRIMARY KEY
//     (`promotionPeriodID`), never by object reference and never by deep equality, matching
//     Hibernate's session-identity semantics. It returns `false` on an empty array.
//   * `isDeletable(): boolean` - hand-written at model/entity/Promotion.cfc:L170, whose body at
//     L171 is `return arrayLen( getAppliedPromotions() ) == 0;`. Consumed by `isDeletable` below.
//   * `getPromotionName(): string` - the generated accessor for
//     model/entity/Promotion.cfc:L53. Consumed by `getSimpleRepresentation` below.
// The naming shape is load-bearing and must survive verbatim: the collection is PLURAL
// (`promotionPeriods`) while the predicate is SINGULAR (`hasPromotionPeriod`), exactly as
// promotionApplied.ts preserves `appliedPromotions` / `hasAppliedPromotion`.

// LEGACY-NOTE [model/entity/Promotion.cfc:L62-L64] - AND THE OPPOSITE ANTI-CONTRACT, WHICH THIS
// FILE MUST NOT BREAK. model/entity/Promotion.cfc declares EXACTLY THREE collections - L62
// `promotionPeriods` (cascade `all-delete-orphan`, inverse), L63 `promotionCodes` (cascade
// `all-delete-orphan`, inverse) and L64 `appliedPromotions` (cascade `all`, inverse) - and
// `promotionAccounts` is NOT one of them. That absence is exactly what makes
// `PromotionAccount.setPromotion` / `removePromotion` throwing defects, as recorded in
// promotionAccount.ts, and it must STAY absent: nothing in this file adds a `promotionAccounts`
// collection, a `getPromotionAccounts()` or a `hasPromotionAccount()` to Promotion. The two
// contracts are exact opposites and both are correct - `promotionPeriods` exists, so the helpers
// on THIS entity resolve; `promotionAccounts` does not, so the helpers on THAT entity throw.

// LEGACY-NOTE [model/entity/PromotionReward.cfc:L70, L140] and
// [model/entity/PromotionQualifier.cfc:L68, L122] - THE CHILD-SIDE ANTI-CONTRACT. Both children
// declare their parent property as `promotionPeriod` (proved by `fkcolumn="promotionPeriodID"` at
// model/entity/PromotionPeriod.cfc:L62-L63) and both declare `setPromotionPeriod` -
// PromotionReward.cfc:L140 and PromotionQualifier.cfc:L122, with `removePromotionPeriod` at L146
// and L128 respectively. NEITHER declares a `promotion` property, so neither has a generated
// `setPromotion` and neither has a hand-written `removePromotion`. When promotionReward.ts and
// promotionQualifier.ts are authored they MUST expose `setPromotionPeriod` /
// `removePromotionPeriod` and MUST NOT expose `setPromotion` / `removePromotion`: adding a
// `promotion` member to either child would corrupt the schema contract AND silently repair the
// four throwing defects at L117, L121, L126 and L129. Note that their `setPromotionPeriod`
// bodies call back into THIS entity - `hasPromotionReward( this )` at PromotionReward.cfc:L142
// with `getPromotionRewards()` at L143, and `hasPromotionQualifier( this )` at
// PromotionQualifier.cfc:L124 with `getPromotionQualifiers()` at L125 - which is why all four of
// those members are authored below and why both collection getters return the LIVE array.
// The two `has*` predicates below therefore also require each child to expose its own primary-key
// accessor: `getPromotionRewardID(): string` for model/entity/PromotionReward.cfc:L60 and
// `getPromotionQualifierID(): string` for model/entity/PromotionQualifier.cfc:L52. Both are `string`
// and not `string | undefined`, because both id properties carry `default=""`.
// FINALLY, NOTE WHAT THE CHILDREN GET RIGHT THAT THE PARENT GETS WRONG: their
// `removePromotionPeriod` bodies - PromotionReward.cfc:L146-L155 and
// PromotionQualifier.cfc:L128-L137 - search AND delete against the SAME resolved object, which is
// the correct form of the very idiom that `removePromotion` [L104-L113] botches at L110. That
// side-by-side comparison is the clearest available proof that L110 is a copy-paste leak rather
// than intent, and it is recorded on the defect marker itself.

/**
 * The `SwPromotionPeriod` row: one bounded, use-limited window during which a promotion's
 * rewards may apply.
 *
 * A class rather than an interface, because the legacy entities carry behaviour and not merely
 * data, and because interface parity is the acceptance contract: a reviewer diffs this public
 * surface against the CFC method by method. Method names are therefore the legacy CFML names
 * VERBATIM in camelCase - which is exactly why eslint.config.mjs deliberately enables no
 * `naming-convention`, `camelcase` or `id-match` rule, and no complexity or max-lines rule.
 *
 * ASSOCIATIONS ARRIVE ALREADY MATERIALIZED OR ABSENT, AND LAZINESS IS NEVER SIMULATED.
 * `src/repositories/mysql/**` owns row-to-entity hydration, the clock injection and the
 * association materialization, and documents the chosen fetch shape at the producing repository
 * method. This class performs NO loading, NO querying and NO lazy resolution of any kind.
 *
 * THE `fetch="join"` RULING. [model/entity/PromotionPeriod.cfc:L59] is one of only FOUR eager
 * `fetch="join"` sites in the entire in-scope entity set; the complete census is
 * model/entity/Product.cfc:L68 `brand`, model/entity/Product.cfc:L69 `productType`,
 * model/entity/Product.cfc:L70 `defaultSku` (which also carries `cascade="delete"`), and this
 * one. In the target the eager/lazy distinction DISAPPEARS, because every association is
 * materialized at the repository boundary on identical terms - which is what converts each
 * implicit lazy load into an explicit, documented query decision and removes the N+1 hazard that
 * unbounded graph walking creates. The eager marker is nonetheless retained as evidence that
 * `promotion` is expected to be PRESENT IN PRACTICE, which is what makes the unguarded
 * `getPromotion()` reach-throughs at L88 and L92 survivable in the legacy system.
 * For contrast, the only in-scope `lazy="extra"` collections - never materialized at all - are
 * model/entity/ProductType.cfc:L66 `products`, model/entity/PromotionCode.cfc:L68 `orders` and
 * model/entity/Sku.cfc:L71 `orderItems`. NEITHER of this entity's two collections is
 * `lazy="extra"`, so BOTH are materialized.
 *
 * NO PROMOTION-QUALIFICATION SEMANTICS ARE DECIDED HERE. The five distinct empty-collection
 * polarities in this port - the permissive empty reward `addressZones`, the restrictive empty
 * address-zone `locations`, `hasAnyInProperty` at org/Hibachi/HibachiEntity.cfc:L340-L350
 * returning `false` on an empty array, the fulfillment three-way gate, and
 * `Brand.getProducts()` defaulting to `[]` - are none of them settled by this entity. It exposes
 * no include/exclude link table and has no legacy test asserting a default. Its two collections
 * are ordinary owned one-to-many arrays that default to `[]`, and the engine's empty-collection
 * polarity lives in `src/services/promotion/**`.
 */
export class PromotionPeriod {
  // --- Persistent Properties [model/entity/PromotionPeriod.cfc:L52-L56] -----------------------
  //
  // Exactly five. THE BOOLEAN CENSUS ACROSS THE WHOLE PROPERTY WINDOW L49-L75 IS ZERO OF EITHER
  // CASING, and that was re-verified case-insensitively rather than trusted: a case-sensitive
  // grep for `ormtype="boolean"` UNDER-COUNTS, because model/entity/PriceGroupRate.cfc:L53 writes
  // `ormType="boolean"` with a capital T. The only boolean anywhere in this component is the
  // NON-PERSISTENT `currentFlag` at L75, which is never hydrated from a row. `cfBoolean()` from
  // src/lib/cfml/truthiness.ts is therefore deliberately NOT imported: it exists to read persisted
  // flag columns that can arrive as SQL NULL, and there is no such column here.
  //
  // The only `default=` attribute anywhere in the property block is the primary key's `default=""`
  // at L52. All four nullable columns declare NO ORM default, which is the whole point of the
  // absence convention recorded immediately below.

  /**
   * Primary key. [model/entity/PromotionPeriod.cfc:L52]
   *
   *   property name="promotionPeriodID" ormtype="string" length="32" fieldtype="id"
   *   generator="uuid" unsavedvalue="" default="";
   *
   * `string` and never `string | undefined`: `default=""` means the column always holds a string,
   * possibly the empty one. That empty string is load-bearing - it is exactly what `isNew()` keys
   * on, and it is also the identity used by both `has*` predicates and by `removePromotion`.
   * Read-only with no setter, matching the legacy id property.
   */
  private readonly promotionPeriodID: string;

  // *** THE THIRD ABSENCE CONVENTION - AND THIS ENTITY'S ORM METADATA IS ITS STRONGEST PROOF ***
  //
  // [model/entity/PromotionPeriod.cfc:L53-L56] All four of the properties below are nullable, none
  // declares an ORM `default=`, and ALL FOUR declare an `hb_nullRBKey` that spells the semantics
  // out in the schema itself: `define.forever` for the two dates, `define.unlimited` for the two
  // counts. `undefined` therefore means FOREVER / UNLIMITED - the PERMISSIVE extreme - and it MUST
  // NOT be coerced to `0`, to `new Date(0)`, to the Unix epoch, to `Number.MAX_SAFE_INTEGER`, to a
  // fresh clock reading, or to any other sentinel. There is no `?? 0` and no `|| 0` anywhere in
  // this file, no runtime default, and no zod default. A downstream `undefined` use-limit means NO
  // LIMIT, which is the permissive branch; it must not be "helpfully" clamped.
  //
  // This is the third of three OPPOSITE absence conventions in this folder, all load-bearing, none
  // of which may ever be collapsed into another:
  //   1. `Sku.getPriceByCurrencyCode()` must return `Money | undefined` and NEVER `0`, because
  //      model/entity/Sku.cfc:L269-L273 has no `else` and no fallback - substituting 0 would
  //      silently sell products for free. (Owned by sku.ts.)
  //   2. `Product.getSalePrice()` must return `0` and NEVER `undefined`, because
  //      model/entity/Product.cfc:L598 is a bare statement with no `return` and execution falls
  //      through to `return 0`. (Owned by product.ts.)
  //   3. THIS FILE OWNS THE THIRD: promotion-period BOUNDS and USE-LIMITS stay `undefined`.
  // Convention 3 is the only one of the three that is encoded in the ORM metadata rather than
  // inferred from behaviour, which makes it the strongest schema-level evidence in the slice.

  /**
   * Start of the active window, or `undefined` for NO LOWER BOUND. [model/entity/PromotionPeriod.cfc:L53]
   *
   *   property name="startDateTime" ormtype="timestamp" hb_formatType="dateTime"
   *   hb_nullRBKey="define.forever";
   *
   * `hb_formatType="dateTime"` and `hb_nullRBKey="define.forever"` are carried forward as inert
   * strings only. JavaRB is NOT ported and NO i18n runtime is introduced; the resource-bundle key
   * is preserved verbatim so the legacy admin can still resolve it.
   */
  private readonly startDateTime: Date | undefined;

  /**
   * End of the active window, or `undefined` for NO UPPER BOUND. [model/entity/PromotionPeriod.cfc:L54]
   *
   *   property name="endDateTime" ormtype="timestamp" hb_formatType="dateTime"
   *   hb_nullRBKey="define.forever";
   *
   * The single most consequential nullable slot on this entity: `isCurrent` [L80] dereferences it
   * with no guard and therefore throws, while `isExpired` [L84] and `getCurrentFlag` [L140] both
   * guard it and treat absence as permissive. All three behaviours are reproduced as written.
   */
  private readonly endDateTime: Date | undefined;

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L55-L56]: both count properties contain a DOUBLE
  // SPACE between `notnull="false"` and `hb_nullRBKey=` in the source. A cosmetic wart with zero
  // behavioural consequence; recorded once, and the whitespace itself is not reproduced.

  /**
   * Period-wide use ceiling, or `undefined` for UNLIMITED. [model/entity/PromotionPeriod.cfc:L55]
   *
   *   property name="maximumUseCount" ormtype="integer" notnull="false"
   *   hb_nullRBKey="define.unlimited";
   *
   * `ormtype="integer"` is a plain COUNT, not money, which is why neither the Money value object
   * nor decimal.js is imported here and why no float arithmetic appears anywhere in this file.
   * Consumed by the promotion engine at model/service/PromotionService.cfc:L566 and L568, both of
   * which pair `!isNull(...)` with a `gt 0` test - so `undefined` and `0` both mean "no ceiling"
   * to that caller, and neither may be substituted for the other here.
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

  // --- Related Object Properties (many-to-one) [model/entity/PromotionPeriod.cfc:L59] ---------

  /**
   * The owning promotion. [model/entity/PromotionPeriod.cfc:L59]
   *
   *   property name="promotion" cfc="Promotion" fieldtype="many-to-one" fkcolumn="promotionID"
   *   fetch="join";
   *
   * MUTABLE, and the only mutable association on this class: `setPromotion` assigns it at
   * [model/entity/PromotionPeriod.cfc:L99] and `removePromotion` clears it at
   * [model/entity/PromotionPeriod.cfc:L112]. Every other field here is `readonly`.
   *
   * NO `hb_cascadeCalculate` on this property - contrast model/entity/PromotionApplied.cfc:L59
   * `orderItem` and model/entity/Sku.cfc:L65 `product`, which both declare it. Recorded because
   * the attribute IS part of the schema contract and its absence is a real difference.
   */
  private promotion: Promotion | undefined;

  /**
   * The `promotionID` foreign-key column backing the association above.
   * [model/entity/PromotionPeriod.cfc:L59]
   *
   * Held alongside the materialized association so the key stays readable even when the
   * repository chose not to fetch the far side - something the legacy proxy-based `get*ID`
   * dispatch at org/Hibachi/HibachiEntity.cfc:L530 could not do, because it invoked the
   * association getter and returned the far object's primary ID, falling back to the EMPTY STRING
   * when the association was null. The target reads the COLUMN and returns `undefined` on a miss;
   * the `""`-on-miss detail is recorded here so it is auditable rather than silently dropped.
   */
  private readonly promotionID: string | undefined;

  // --- Related Object Properties (one-to-many) [model/entity/PromotionPeriod.cfc:L62-L63] -----
  //
  // Both collections are `cascade="all-delete-orphan" inverse="true"` on `fkcolumn=
  // "promotionPeriodID"`, matching model/entity/Promotion.cfc:L62-L63 and contrasting
  // model/entity/Promotion.cfc:L64 `appliedPromotions`, which is `cascade="all"`. The
  // orphan-delete obligation belongs to `src/repositories/mysql/**`, which owns persistence; it is
  // deliberately not simulated here, because this class performs no writes to the database.
  //
  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L62-L63]: NEITHER collection declares
  // `type="array"`, where model/entity/Sku.cfc:L72 `skuCurrencies` and
  // model/entity/Brand.cfc:L60 `attributeValues` do. A metadata inconsistency spread across the
  // legacy entity set; it changes nothing in TypeScript, where both are arrays either way.
  //
  // The array REFERENCE is `readonly` while its CONTENTS are mutable, which is deliberate and is
  // the standard pattern in this folder: `arrayAppend` / `arrayDeleteAt` from the child side
  // mutate the live array in place (model/entity/PromotionReward.cfc:L143, L152 and
  // model/entity/PromotionQualifier.cfc:L125, L134), and rebinding the field would break that.

  /** [model/entity/PromotionPeriod.cfc:L62] `singularname="promotionReward"`. Defaults to `[]`. */
  private readonly promotionRewards: PromotionReward[];

  /** [model/entity/PromotionPeriod.cfc:L63] `singularname="promotionQualifier"`. Defaults to `[]`. */
  private readonly promotionQualifiers: PromotionQualifier[];

  // --- Remote Properties [model/entity/PromotionPeriod.cfc:L66] -------------------------------

  /**
   * [model/entity/PromotionPeriod.cfc:L66] `property name="remoteID" ormtype="string";`
   *
   * PRESENT on this entity, and that is a real schema difference worth recording: contrast
   * model/entity/PromotionAccount.cfc, which declares no `remoteID` at all.
   */
  private readonly remoteID: string | undefined;

  // --- Audit properties [model/entity/PromotionPeriod.cfc:L69-L72] ----------------------------
  //
  // All four carry `hb_populateEnabled="false"`, which is how the legacy framework excluded them
  // from mass assignment. The TypeScript equivalent needs no mechanism: they are `readonly`, set
  // once during hydration, and exposed through getters with no setter anywhere.

  /**
   * [model/entity/PromotionPeriod.cfc:L69]
   * `property name="createdDateTime" hb_populateEnabled="false" ormtype="timestamp";`
   */
  private readonly createdDateTime: Date | undefined;

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L70]: `property name="createdByAccount"
  // hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one" fkcolumn="createdByAccountID";`
  // targets the OUT-OF-SCOPE model/entity/Account.cfc, so the association collapses to the inert
  // persisted `createdByAccountID` column under the locked out-of-scope FK ID-accessor ruling
  // applied identically in promotionApplied.ts and promotionAccount.ts. No `Account` type is
  // imported, no `Account` instance is ever constructed, there is no `account.ts` in the 18-file
  // entity budget and none may be created. The COLUMN is preserved rather than dropped, so schema
  // continuity stays auditable: no migration, no rename, no column change.

  /** The `createdByAccountID` column, opaque. [model/entity/PromotionPeriod.cfc:L70] */
  private readonly createdByAccountID: string | undefined;

  /**
   * [model/entity/PromotionPeriod.cfc:L71]
   * `property name="modifiedDateTime" hb_populateEnabled="false" ormtype="timestamp";`
   */
  private readonly modifiedDateTime: Date | undefined;

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L72]: `property name="modifiedByAccount"
  // hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one" fkcolumn="modifiedByAccountID";`
  // - identical out-of-scope collapse to an opaque ID column, on identical terms to L70 above.

  /** The `modifiedByAccountID` column, opaque. [model/entity/PromotionPeriod.cfc:L72] */
  private readonly modifiedByAccountID: string | undefined;

  // --- The injected clock ---------------------------------------------------------------------

  /**
   * The instant source every date comparison on this entity reads.
   *
   * A plain locally-typed function, INJECTED THROUGH THE CONSTRUCTOR. It is deliberately NOT a
   * port: this project has exactly THIRTEEN ports and no fourteenth may be invented, so there is no
   * "clock port", nothing is imported from `../ports/`, and `src/lib/config.ts` is not read either
   * - that file is static process configuration, never a request-scoped instant.
   *
   * Injecting it is what lets `isExpired()` [L83] and `getCurrentFlag()` [L137] keep their
   * ZERO-ARGUMENT legacy signatures verbatim while still being deterministically testable, so the
   * single widening this file spends is confined to `isCurrent`. It also honours the explicit UTC
   * policy stated in the file header: nothing here calls `Date.now()` or constructs `new Date()`.
   */
  private readonly now: () => Date;

  // --- Non-persistent properties [model/entity/PromotionPeriod.cfc:L74-L75] -------------------

  /**
   * Memo backing `getCurrentFlag()`. [model/entity/PromotionPeriod.cfc:L75]
   *
   *   property name="currentFlag" type="boolean" persistent="false";
   *
   * NOT A COLUMN and NOT A CONSTRUCTOR INPUT. It is never hydrated from a row, which is precisely
   * what distinguishes the `structKeyExists(variables, "currentFlag")` probe at
   * [model/entity/PromotionPeriod.cfc:L138] from a lazy-load probe - see the annotation on
   * `getCurrentFlag()` below.
   *
   * INSTANCE-SCOPED, and instances are REQUEST-SCOPED. Never module-scoped: a module-level cache
   * would persist across warm Lambda invocations and leak one request's computed state into an
   * unrelated one. `undefined` is the "not computed yet" state and is the only reason this field
   * is not `readonly`.
   */
  private currentFlag: boolean | undefined;

  /**
   * Hydrates one `SwPromotionPeriod` row.
   *
   * A single readonly parameter object as an INLINE object type rather than a second exported
   * interface, matching the convention established in promotionAccount.ts and
   * src/lib/config.ts, because this module exports exactly ONE unit and this subtree keeps no
   * barrel files.
   *
   * Every nullable column is a REQUIRED slot typed `T | undefined` rather than an optional `?:`
   * slot. `exactOptionalPropertyTypes` is enabled, so "absent" and "present-but-undefined" are
   * genuinely different types, and requiring the key forces a hydrating repository to state "I
   * looked and found nothing" instead of silently omitting it. The only two `?:` slots are the
   * collections, which are genuinely optional at construction and default to `[]`.
   *
   * There is no collaborator port parameter, because this entity has ZERO `getService(` sites
   * across all 163 lines of the source. The `now` clock is the one injected collaborator, and it
   * is a plain function type rather than a port.
   *
   * `currentFlag` is deliberately absent: it is a computed memo, not input.
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

  // --- Accessors --------------------------------------------------------------------------------
  //
  // ColdFusion auto-generated these from the property metadata, so there is no legacy body to
  // port; the locator on each one cites the property declaration it serves. GETTERS ONLY: the
  // legacy component declares no setter for any persistent property, and its only write-side
  // members are the bidirectional helpers further down.
  //
  // Concrete legacy call sites are cited where they exist, so a reviewer can confirm each accessor
  // is part of the exercised public surface rather than speculative API.

  /**
   * [model/entity/PromotionPeriod.cfc:L52]
   *
   * Heavily exercised: the promotion engine keys its per-period qualification cache on this value
   * at model/service/PromotionService.cfc:L192, L193, L197, L209, L212, L213, L217, L222, L351,
   * L1048, L1049 and L1053.
   */
  getPromotionPeriodID(): string {
    return this.promotionPeriodID;
  }

  /**
   * [model/entity/PromotionPeriod.cfc:L53] `undefined` means NO LOWER BOUND - forever. Never
   * epoch, never `0`, never a sentinel.
   *
   * Read by model/dao/PromotionDAO.cfc:L173-L174 and L240-L241, both guarded with `not isNull(...)`.
   */
  getStartDateTime(): Date | undefined {
    return this.startDateTime;
  }

  /**
   * [model/entity/PromotionPeriod.cfc:L54] `undefined` means NO UPPER BOUND - forever. Never
   * epoch, never `0`, never a sentinel.
   *
   * Read by model/dao/PromotionDAO.cfc:L178 and L245. Both of those sites sit under a condition
   * that tests `getStartDateTime()` rather than `getEndDateTime()` - a duplicated-guard defect at
   * model/dao/PromotionDAO.cfc:L177 and L244 that belongs to the repository port, not to this
   * entity. Recorded here only so the cross-reference is not lost.
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
   * `undefined` when the repository did not fetch it, or after `removePromotion` has cleared it.
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
   * Returns the array REFERENCE and never a copy, because the child side mutates it in place:
   * `arrayAppend` at model/entity/PromotionReward.cfc:L143 and `arrayDeleteAt` at
   * model/entity/PromotionReward.cfc:L152, with the index located at L150. Handing back a copy
   * would make both of those silently no-ops.
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

  // --- Implicit ORM collection predicates -------------------------------------------------------
  //
  // Not dispatcher branches and not inventions. ColdFusion generates a `has<singularname>()`
  // accessor for every one-to-many property, and the framework relies on exactly that:
  // org/Hibachi/HibachiEntity.cfc:L343, inside `hasAnyInProperty` (L340-L350), reaches for
  // `evaluate()` instead of `invokeMethod()` with the comment "because hasXXX() is an implicit orm
  // function". Both predicates below are concretely called on a PromotionPeriod receiver from the
  // child side, so both are part of the exercised legacy surface.
  //
  // BOTH COMPARE BY PRIMARY KEY, never by object reference and never by deep equality. The legacy
  // containment test underneath these is `arrayFind(collection, this)`, which in CFML/Hibernate is
  // session identity; the project-wide rule is to reproduce that as a primary-key comparison,
  // which is stable across two hydrations of the same row. Both return `false` on an empty array,
  // matching `hasAnyInProperty`'s own empty-array behaviour.

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

  // --- Framework members ------------------------------------------------------------------------

  /**
   * Whether this instance has been persisted yet.
   *
   * Inherited from the framework base in the legacy tree and concretely called at exactly ONE site
   * in this component: [model/entity/PromotionPeriod.cfc:L100], inside `setPromotion`. It is the
   * only framework member this entity uses on itself.
   *
   * The empty-string test is not an approximation of the framework - it is literally what the
   * framework does. `isNew()` at [org/Hibachi/HibachiEntity.cfc:L707-L709] returns `getNewFlag()`,
   * and `getNewFlag()` at [org/Hibachi/HibachiEntity.cfc:L571-L576] is
   * `if(getPrimaryIDValue() == "") { return true; } return false;`. The empty string it compares
   * against is the `unsavedvalue=""` / `default=""` on the id property at
   * [model/entity/PromotionPeriod.cfc:L52].
   *
   * Nothing else the dispatcher at [org/Hibachi/HibachiEntity.cfc:L507-L565] can synthesise is
   * concretely called here, so there is no `hasAny*`, no `hasUnique*`, no `get*Options`,
   * `get*OptionsSmartList`, `get*SmartList`, `get*Struct`, `get*Count` or `get*AssignedIDList`, no
   * `buildIDPathList`, no `getPropertyOptions`, no `formatValue`, no `rbKey(...)` and no
   * `getAttributeValue` - that last one being unreachable anyway, since the L559 guard requires an
   * `attributeValues` property this entity does not declare.
   */
  isNew(): boolean {
    return this.promotionPeriodID === '';
  }

  // --- Behavioural methods [model/entity/PromotionPeriod.cfc:L78-L93] -------------------------
  //
  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L78-L93]: these four methods sit OUTSIDE EVERY
  // BANNER BLOCK in the source - the first banner does not open until L95. That includes
  // `isCurrent()`, whose semantic twin `getCurrentFlag()` DOES live inside a banner, at L135-L148.
  // Two methods answering one question, in two different structural locations. A secondary register
  // item: annotated, and the TypeScript below is organised idiomatically rather than reorganised to
  // mirror the source's layout, because minimal change scopes the functional surface and never the
  // code style - a transliteration would violate that directive rather than satisfy it.

  // *** LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L80]: isCurrent() dereferences
  // startDateTime AND endDateTime with NO NULL GUARD OF ANY KIND, even though both columns are
  // nullable and both declare hb_nullRBKey="define.forever" at L53/L54 - metadata which says a null
  // bound means FOREVER, i.e. the permissive extreme. Contrast its two siblings in this same file:
  // isExpired() at L84 guards with isDate(), and getCurrentFlag() at L140 guards with !isNull() on
  // BOTH bounds. So a null bound makes THIS method blow up where the schema's own intent, and both
  // sibling methods, would return the permissive result. Reproduced by throwing: returning `true`
  // would invent the permissive behaviour the method does not have, returning `false` would invent
  // the opposite, and coalescing to a sentinel date would violate the third absence convention
  // recorded on the properties above. This follows the same treatment as the throwing stub for
  // Sku.getPriceByPromotion() [model/entity/Sku.cfc:L258] and costs no divergence: reproducing the
  // arm the port always takes IS the parity-correct outcome.
  // Preserved deliberately; do not fix without a product decision.

  // *** LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L80 vs L140]: isCurrent() and
  // getCurrentFlag() answer the same question - "is this period active right now?" - with OPPOSITE
  // END-BOUNDARY SEMANTICS. isCurrent() tests `getEndDateTime() > currentDateTime`, making the end
  // bound EXCLUSIVE, so at exactly now === endDateTime it returns FALSE. getCurrentFlag() tests
  // `getEndDateTime() < now()` and flips the flag to false only then, making the end bound
  // INCLUSIVE, so at exactly now === endDateTime it returns TRUE. They diverge in three further
  // ways: null handling (none, versus !isNull() on both bounds), now() invocation count (ONE,
  // captured into a local and reused, versus TWO separate textual calls on L140), and memoization
  // (none, versus memoized). With both bounds null, isCurrent() throws and getCurrentFlag() returns
  // true. Every one of those differences is reproduced exactly as written: neither method is
  // normalised, neither is implemented in terms of the other, and no shared helper is extracted.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Is this period active at the given instant? [model/entity/PromotionPeriod.cfc:L78-L81]
   *
   * *** THE SOLE SPEND OF THE PROJECT'S ENTITY-LAYER SIGNATURE-WIDENING BUDGET. ***
   *
   * The legacy signature is `public boolean function isCurrent()` with no parameters. This is the
   * ONE AND ONLY entity-layer widening the project permits, and spending it here EXHAUSTS that
   * budget: NO FURTHER SIGNATURE WIDENING MAY EVER BE SPENT ANYWHERE IN `src/domain/entities/**`.
   * Concretely, every other date-dependent method in this folder keeps its zero-argument signature
   * verbatim and reads the injected clock internally - `isExpired()` [L83] and `getCurrentFlag()`
   * [L137] here, plus `Promotion.getCurrentFlag` [model/entity/Promotion.cfc:L83],
   * `Promotion.getCurrentPromotionPeriodFlag` [L95], `Promotion.getCurrentPromotionCodeFlag` [L109]
   * and `PromotionCode.getCurrentFlag` [model/entity/PromotionCode.cfc:L85].
   *
   * The widening is one OPTIONAL parameter that DEFAULTS TO THE INJECTED CLOCK, so the
   * zero-argument call form every legacy caller uses is preserved exactly while the method becomes
   * deterministically testable at the boundaries. That testability is the entire justification, and
   * the boundaries genuinely need it: the start boundary is INCLUSIVE and the end boundary is
   * EXCLUSIVE, and the end boundary disagrees with `getCurrentFlag()`.
   *
   * UTC POLICY, per the file header: the comparison is performed on `getTime()`, which is epoch
   * milliseconds in UTC and therefore timezone independent, replacing CFML date comparison that
   * depended on the server timezone.
   *
   * THE INSTANT IS CAPTURED ONCE and reused for both comparisons, reproducing
   * `var currentDateTime = now();` at L79 exactly. That matters precisely because
   * `getCurrentFlag()` does the opposite - two separate reads - and each method's own call count is
   * reproduced faithfully rather than "improved".
   *
   * @param now Optional fixed instant. Omit it to read the injected clock exactly once.
   * @throws Error when either bound is `undefined`, reproducing the L80 defect above.
   */
  isCurrent(now?: Date): boolean {
    // `??` short-circuits, so the injected clock is read exactly once and only when no explicit
    // instant was supplied. `this.now` is the injected clock function; `now` is the parameter.
    const currentDateTime: Date = now ?? this.now();

    const startDateTime: Date | undefined = this.startDateTime;
    const endDateTime: Date | undefined = this.endDateTime;

    // The L80 defect, reproduced. In CFML, comparing a null against a date is a runtime error, so
    // the target raises one too rather than inventing an outcome. `isNullish` from the shared CFML
    // parity helper is deliberately NOT used at this site: the legacy body performs NO absence test
    // whatsoever, and routing through an absence helper here would misrepresent the source as
    // having a guard it does not have. The two sibling methods below DO test for absence, and they
    // DO use the helper - that contrast is the point.
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

    // START INCLUSIVE (`<=`), END EXCLUSIVE (`>`), exactly as written at L80. At the instant
    // now === endDateTime this returns FALSE, while getCurrentFlag() returns TRUE.
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
   * SIGNATURE UNCHANGED - zero arguments, verbatim. It reads the injected clock internally, which
   * is exactly why injecting the clock lets this file spend only one widening.
   *
   * ONLY THE END BOUND IS EXAMINED. `startDateTime` is never consulted, so a period whose start is
   * in the future is NOT "expired". Preserved as written.
   *
   * A NULL `endDateTime` YIELDS `false` - not expired, i.e. forever. This one DOES match the
   * `hb_nullRBKey="define.forever"` intent declared at [model/entity/PromotionPeriod.cfc:L54],
   * which is precisely what makes `isCurrent()`'s omission of the same guard a defect rather than a
   * house style.
   *
   * `now()` is invoked INSIDE the expression rather than captured into a local, and CFML `&&`
   * short-circuits, so the clock is not read at all when the end bound is absent. Both properties
   * are reproduced below.
   *
   * Concretely called at model/entity/PromotionReward.cfc:L418 and
   * model/entity/PromotionQualifier.cfc:L360, and internally by `isDeletable()`.
   */
  isExpired(): boolean {
    const endDateTime: Date | undefined = this.endDateTime;

    // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L84]: CFML `isDate(...)` applied to a slot that
    // is either a timestamp or null is exactly an absence test, so it maps to `isNullish(...)` from
    // src/lib/cfml/truthiness.ts - used here rather than a hand-rolled `=== undefined` so the CFML
    // semantics stay auditable at the site that had them. The trailing `endDateTime === undefined`
    // is a TYPE-NARROWING step only: `isNullish` returns `boolean` rather than a TypeScript type
    // predicate, so the compiler still needs the explicit comparison to narrow `Date | undefined`
    // to `Date`. It is provably redundant at runtime and changes no outcome.
    if (isNullish(endDateTime) || endDateTime === undefined) {
      return false;
    }

    // The clock is read only on this branch, reproducing CFML `&&` short-circuiting. UTC policy: the
    // comparison is on epoch milliseconds.
    return endDateTime.getTime() < this.now().getTime();
  }

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L87]: the legacy declaration is
  // `public boolean function isDeletable ()` - WITH A SPACE BEFORE THE PARENTHESES. Source
  // whitespace only; the TypeScript method is `isDeletable()` and the wart is not reproduced.

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L88]: COUNTER-INTUITIVE POLARITY, FLAGGED RATHER
  // THAN "CORRECTED". A period is deletable IF IT IS *NOT* EXPIRED. Intuition runs the other way -
  // one would expect an expired period to be MORE disposable, not less - but the polarity is
  // plausibly intentional: it guards against deleting historical records that have already applied
  // discounts to real orders, which is also what the parent's own rule protects
  // (`Promotion.isDeletable()` at model/entity/Promotion.cfc:L170-L171 is
  // `return arrayLen( getAppliedPromotions() ) == 0;`). Recorded as a note and not as a numbered
  // defect for exactly that reason. Net semantics: deletable if and only if NOT EXPIRED **AND** the
  // parent promotion has no applied promotions.

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L88, L92]: both `isDeletable()` and
  // `getSimpleRepresentation()` call `getPromotion()` WITH NO NULL GUARD and immediately dereference
  // the result. With `promotion` typed `Promotion | undefined`, TypeScript forces the absent case to
  // be handled, and the parity-correct handling is to THROW - a CFML null-reference error - rather
  // than to coalesce to `true`, `false` or `''`, any of which would invent behaviour the legacy
  // system does not have. Absence is unlikely in practice, because L59 marks the association
  // `fetch="join"` and the foreign key is populated for every persisted row, but "unlikely" is not
  // "impossible" and the repository may legitimately hydrate a period without its parent.

  /**
   * May this period be deleted? [model/entity/PromotionPeriod.cfc:L87-L89]
   *
   *   return !isExpired() && getPromotion().isDeletable();
   *
   * NOT MEMOIZED, because the legacy is not. `getCurrentFlag()` is the only memoized member here.
   *
   * The `&&` SHORT-CIRCUIT IS LOAD-BEARING and is reproduced by the early return below: when the
   * period IS expired, `!isExpired()` is already false and CFML never evaluates the second operand,
   * so `getPromotion()` is never called and the method returns `false` WITHOUT throwing even when
   * the parent association is absent. Restructuring this into a single boolean expression that
   * touched `promotion` first would introduce a throw the legacy does not have.
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
   * THIS ENTITY OVERRIDES `getSimpleRepresentation()` DIRECTLY, which is the framework's documented
   * alternative to declaring `getSimpleRepresentationPropertyName()`: the base implementation at
   * [org/Hibachi/HibachiEntity.cfc:L59] invokes whatever L74's
   * `getSimpleRepresentationPropertyName()` names, and L87 throws when neither is supplied.
   * Contrast [model/entity/PriceGroupRate.cfc:L270] and [model/entity/PromotionCode.cfc:L171],
   * which declare the property-name variant instead. The override form is preserved and NO
   * `getSimpleRepresentationPropertyName()` is added here - the source declares none.
   *
   * There is no TypeScript base class in this folder, so the `override` keyword is deliberately
   * absent; `noImplicitOverride` requires it only where a member genuinely overrides a base member,
   * and adding it without a base class would not compile.
   *
   * Same unguarded reach-through as `isDeletable()` - see the shared LEGACY-NOTE above.
   *
   * @throws Error when `promotion` is `undefined`.
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

    return promotion.getPromotionName();
  }

  // ============= START: Bidirectional Helper Methods ===================
  // [model/entity/PromotionPeriod.cfc:L95-L132] - the FIRST of two identically-titled banners.
  //
  // Three inline sub-banners live inside it: `// Promotion (many-to-one)` at L97,
  // `// Promotion Rewards (one-to-many)` at L115 and `// Promotion Qualifiers (one-to-many)` at
  // L124. Six methods in total, and FIVE OF THE FILE'S SEVEN DEFECTS are in this 38-line window.

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L95-L132]: THE MANDATORY "REMOVE-THAT-ADDS"
  // INVERSION CROSS-CHECK, RE-RUN INDEPENDENTLY AGAINST THE VERBATIM SOURCE RATHER THAN TAKEN ON
  // TRUST. Mechanical method: read L95 through L132 and locate every `arrayAppend` / `add*` call
  // reachable from a `remove*` body. Result - `arrayAppend` occurs EXACTLY ONCE in the whole
  // component, at L101, inside `setPromotion`; no `remove*` body contains any append.
  // VERDICT: ZERO ADD-INVERSIONS.
  //
  //   | remove* helper            | Source     | What it actually does                    | Inv? |
  //   |---------------------------|------------|------------------------------------------|------|
  //   | removePromotion           | L104-L113  | arrayFind then arrayDeleteAt - a genuine | NO   |
  //   |                           |            | delete (but with the separate, REACHABLE |      |
  //   |                           |            | `arguments.account` leak at L110)        |      |
  //   | removePromotionReward     | L120-L122  | delegates removePromotion(this) to the   | NO   |
  //   |                           |            | child - remove-shaped (but the wrong     |      |
  //   |                           |            | method name, so it throws)               |      |
  //   | removePromotionQualifier  | L128-L130  | delegates removePromotion( this ) to the | NO   |
  //   |                           |            | child - remove-shaped (wrong method      |      |
  //   |                           |            | name, so it throws; plus the capital-P   |      |
  //   |                           |            | casing wart)                             |      |
  //
  // The reference instances of the genuine inversion defect are elsewhere:
  // model/entity/Option.cfc:L129-L131, where `removePromotionRewardExclusion()` calls
  // `addExcludedOption(this)`, and model/entity/Option.cfc:L145-L147, where
  // `removePromotionQualifierExclusion()` does the same. Those are preserved as defects in THAT
  // entity. Neither pattern occurs here.

  // Promotion (many-to-one) [model/entity/PromotionPeriod.cfc:L97]

  /**
   * Bidirectional helper for the `promotion` many-to-one. [model/entity/PromotionPeriod.cfc:L98-L103]
   *
   *   variables.promotion = arguments.promotion;
   *   if(isNew() or !arguments.promotion.hasPromotionPeriod( this )) {
   *       arrayAppend(arguments.promotion.getPromotionPeriods(), this);
   *   }
   *
   * *** THIS METHOD IS SOUND AND CARRIES NO DEFECT MARKER. *** It resolves cleanly because
   * model/entity/Promotion.cfc:L62 genuinely declares the `promotionPeriods` collection, so both
   * `hasPromotionPeriod()` and `getPromotionPeriods()` exist on the far side. That makes it the same
   * resolution as `PromotionApplied.setPromotion` and the EXACT OPPOSITE of
   * `PromotionAccount.setPromotion` [model/entity/PromotionAccount.cfc:L90-L95], which throws on
   * every path because Promotion has no `promotionAccounts` collection. The throwing-stub treatment
   * applied in promotionAccount.ts must NOT be copied here.
   *
   * Three behaviours are preserved precisely:
   *
   *   1. THE NEAR-SIDE ASSIGNMENT RUNS FIRST. L99 precedes the guard at L100, so this instance's
   *      `promotion` field is always updated even when the far-side array is left untouched.
   *   2. THE GUARD TESTS *THIS* INSTANCE'S NEWNESS, not the argument's. That matches
   *      `PromotionApplied` and `PromotionAccount` and CONTRASTS `PriceGroupRate.addProductType`,
   *      which guards the ARGUMENT instead - a real inconsistency in the legacy codebase, recorded
   *      rather than normalised. This file's polarity is preserved exactly.
   *   3. CFML `or` SHORT-CIRCUITS, so when `isNew()` is true `hasPromotionPeriod` is NEVER CALLED.
   *      `||` reproduces that, and the operand order is identical to the source.
   *
   * The append targets the LIVE array returned by `getPromotionPeriods()`, matching `arrayAppend`
   * at L101; `Array.prototype.push` is its direct equivalent.
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

  // *** LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L110]: removePromotion() references
  // `arguments.account`, which is NOT A DECLARED ARGUMENT of this method - the signature at L104 is
  // `removePromotion(any promotion)` and `promotion` is its only argument. A copy-paste leak, and in
  // CFML an undefined-variable error. UNLIKE THE IDENTICAL LEAK AT
  // model/entity/PromotionAccount.cfc:L103, THIS ONE IS REACHABLE, WHICH MAKES IT MATERIALLY MORE
  // SEVERE. There, the preceding line threw first - Promotion has no `promotionAccounts` collection
  // - so the first defect masked the second and the leak stayed latent. Here, L108's
  // `arguments.promotion.getPromotionPeriods()` SUCCEEDS, because
  // model/entity/Promotion.cfc:L62 declares `promotionPeriods`; the index is computed correctly, and
  // whenever it is greater than zero L110 EXECUTES AND THROWS. So this method fails at runtime in
  // the NORMAL, EXPECTED CASE - the period actually being present in its parent's collection - and
  // "succeeds" only when the period is ABSENT, in which case it does nothing but clear the near
  // side. Two consequences follow and are both reproduced: the parent's array is NEVER mutated by
  // this method, and the near-side clear at L112 is UNREACHABLE on the found path. That the leak is
  // an accident rather than intent is confirmed by the children, whose equivalents get it right:
  // model/entity/PromotionReward.cfc:L150/L152 and model/entity/PromotionQualifier.cfc:L132/L134
  // both search AND delete against the same resolved object.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Bidirectional helper for the `promotion` many-to-one. [model/entity/PromotionPeriod.cfc:L104-L113]
   *
   *   if(!structKeyExists(arguments, "promotion")) { arguments.promotion = variables.promotion; }
   *   var index = arrayFind(arguments.promotion.getPromotionPeriods(), this);
   *   if(index > 0) { arrayDeleteAt(arguments.account.getPromotionPeriods(), index); }
   *   structDelete(variables, "promotion");
   *
   * A partially-throwing port, reproducing the legacy failure on exactly the path that fails there.
   * NOT "fixed" by substituting `promotion` for `account`: that would change WHICH SIDE OF THE
   * ASSOCIATION IS MUTATED, and no divergence may be spent in this file.
   *
   * @throws Error when this period IS found in the parent's collection - the L110 leak.
   * @throws Error when no promotion can be resolved at all, because L108 dereferences the resolved
   *         value unconditionally.
   */
  removePromotion(promotion?: Promotion): void {
    // [model/entity/PromotionPeriod.cfc:L105-L107]: CFML probes `structKeyExists(arguments,
    // "promotion")` and defaults the absent argument to `variables.promotion`. The TypeScript form
    // of that probe is an OPTIONAL PARAMETER with a nullish fallback - plain, idiomatic TypeScript,
    // and the same treatment already applied in promotionAccount.ts and promotionApplied.ts.
    // `structKeyExists` from src/lib/cfml/struct.ts is deliberately NOT used: this is a CFML
    // ARGUMENT-PRESENCE test on the `arguments` scope, not a case-insensitive lookup in a data
    // struct, and there is no `variables.` scope object anywhere in this file.
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
    // REFERENCE / SESSION IDENTITY in CFML/Hibernate. The project-wide rule reproduces it as a
    // PRIMARY-KEY comparison, which is stable across two hydrations of the same row. Note the BASE
    // CHANGE this forces: CFML `arrayFind` is 1-BASED and returns 0 when absent, which is why L109
    // gates on `index > 0`; `Array.prototype.findIndex` is 0-BASED and returns -1 when absent, so
    // the equivalent gate is `index !== -1`. `listFindNoCase` from src/lib/cfml/list.ts is NOT used
    // - that helper is for comma-delimited strings, not arrays.
    //
    // The callback parameter is annotated explicitly rather than left to contextual inference. The
    // inferred type would be correct, but it arrives THROUGH the sibling `Promotion` type, and the
    // annotation keeps this file free of an implicit `any` even while promotion.ts is still being
    // authored in parallel - the sibling reference is `import type`, so it costs nothing at emit.
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
  // BOTH HELPERS IN THIS PAIR THROW, and so do both in the Qualifiers pair below. All four call the
  // WRONG METHOD NAME on the child. The children's parent property is `promotionPeriod` - proved by
  // `fkcolumn="promotionPeriodID"` at model/entity/PromotionPeriod.cfc:L62-L63 - so the correct
  // calls are `setPromotionPeriod(this)` and `removePromotionPeriod(this)`, which both children do
  // declare: model/entity/PromotionReward.cfc:L140/L146 and
  // model/entity/PromotionQualifier.cfc:L122/L128. NEITHER child declares a `promotion` property,
  // so neither has a generated `setPromotion` and neither has a hand-written `removePromotion`.
  // Traced through the framework: `set*` and `remove*` match NONE of the eleven `onMissingMethod`
  // patterns at org/Hibachi/HibachiEntity.cfc:L507-L565 - every pattern is `has*`- or
  // `get*`-prefixed - and the `getAttributeValue` fallback at L559 is unreachable too, because it
  // requires an `attributeValues` property neither child declares. All four calls therefore fall
  // straight through to the throw at org/Hibachi/HibachiEntity.cfc:L565.
  //
  // Each of the four is authored with its legacy name and signature verbatim, with `void` as the
  // return type - matching the legacy `void` declaration, and deliberately NOT `never`, which is
  // reserved for `Sku.getPriceByPromotion()` whose legacy declaration is `numeric`. Each carries
  // ITS OWN two-line marker at its own locator so a reviewer can check each line independently, and
  // each `Error` names the method wrongly called and the method that should have been called.
  // The retained parameters are never read: they exist for interface parity, which is exactly why
  // tsconfig.json omits `noUnusedParameters` and eslint.config.mjs sets `args: 'none'`.

  // *** LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L117]: addPromotionReward() calls
  // `arguments.promotionReward.setPromotion(this)`. model/entity/PromotionReward.cfc declares its
  // parent property as `promotionPeriod` at L70 and declares `setPromotionPeriod` at L140; it
  // declares NO `promotion` property, so there is no generated `setPromotion` to call. The call
  // matches none of the eleven onMissingMethod patterns at org/Hibachi/HibachiEntity.cfc:L507-L565
  // and throws at L565. The intended call was `setPromotionPeriod(this)`. (The source line is also
  // indented with a tab plus three spaces where L121 uses a single tab - cosmetic only.)
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Bidirectional helper for the `promotionRewards` collection.
   * [model/entity/PromotionPeriod.cfc:L116-L118]
   *
   * A throwing stub, mirroring the legacy runtime failure exactly rather than repairing it. It
   * follows the precedent set for `Sku.getPriceByPromotion()` [model/entity/Sku.cfc:L258], whose
   * body calls a method that does not exist and which the plan ports as a throwing stub carrying the
   * TODO rather than as invented behaviour.
   *
   * @throws Error always.
   */
  addPromotionReward(promotionReward: PromotionReward): void {
    throw new Error(
      'PromotionPeriod.addPromotionReward is inoperable in Slatwall 3.1.39: ' +
        'model/entity/PromotionPeriod.cfc:L117 calls setPromotion(this) on the promotionReward, ' +
        'but model/entity/PromotionReward.cfc declares its parent property as `promotionPeriod` ' +
        '(L70) and therefore has NO setPromotion. The call matches none of the onMissingMethod ' +
        'patterns at org/Hibachi/HibachiEntity.cfc:L507-L565 and throws at L565. The intended ' +
        'call was setPromotionPeriod(this), declared at model/entity/PromotionReward.cfc:L140. ' +
        'Preserved defect.',
    );
  }

  // *** LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L121]: removePromotionReward() calls
  // `arguments.promotionReward.removePromotion(this)`. model/entity/PromotionReward.cfc declares no
  // `promotion` property and no hand-written `removePromotion`, so - `remove*` matching none of the
  // eleven onMissingMethod patterns at org/Hibachi/HibachiEntity.cfc:L507-L565 - the call throws at
  // L565. The intended call was `removePromotionPeriod(this)`, declared at
  // model/entity/PromotionReward.cfc:L146.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Bidirectional helper for the `promotionRewards` collection.
   * [model/entity/PromotionPeriod.cfc:L120-L122]
   *
   * A throwing stub. Note the inversion cross-check verdict recorded above: this body IS
   * remove-shaped - it delegates a `remove*` call to the child rather than an `add*` - so it is not
   * an inversion defect. Its defect is the wrong method NAME.
   *
   * @throws Error always.
   */
  removePromotionReward(promotionReward: PromotionReward): void {
    throw new Error(
      'PromotionPeriod.removePromotionReward is inoperable in Slatwall 3.1.39: ' +
        'model/entity/PromotionPeriod.cfc:L121 calls removePromotion(this) on the ' +
        'promotionReward, but model/entity/PromotionReward.cfc declares its parent property as ' +
        '`promotionPeriod` (L70) and therefore has NO removePromotion. The call matches none of ' +
        'the onMissingMethod patterns at org/Hibachi/HibachiEntity.cfc:L507-L565 and throws at ' +
        'L565. The intended call was removePromotionPeriod(this), declared at ' +
        'model/entity/PromotionReward.cfc:L146. Preserved defect.',
    );
  }

  // Promotion Qualifiers (one-to-many) [model/entity/PromotionPeriod.cfc:L124]

  // *** LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L126]: addPromotionQualifier() calls
  // `arguments.promotionQualifier.setPromotion( this )`. model/entity/PromotionQualifier.cfc
  // declares its parent property as `promotionPeriod` at L68 and declares `setPromotionPeriod` at
  // L122; it declares NO `promotion` property, so there is no generated `setPromotion`. The call
  // matches none of the eleven onMissingMethod patterns at org/Hibachi/HibachiEntity.cfc:L507-L565
  // and throws at L565. The intended call was `setPromotionPeriod(this)`.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * Bidirectional helper for the `promotionQualifiers` collection.
   * [model/entity/PromotionPeriod.cfc:L125-L127]
   *
   * A throwing stub, on identical terms to `addPromotionReward`.
   *
   * @throws Error always.
   */
  addPromotionQualifier(promotionQualifier: PromotionQualifier): void {
    throw new Error(
      'PromotionPeriod.addPromotionQualifier is inoperable in Slatwall 3.1.39: ' +
        'model/entity/PromotionPeriod.cfc:L126 calls setPromotion( this ) on the ' +
        'promotionQualifier, but model/entity/PromotionQualifier.cfc declares its parent property ' +
        'as `promotionPeriod` (L68) and therefore has NO setPromotion. The call matches none of ' +
        'the onMissingMethod patterns at org/Hibachi/HibachiEntity.cfc:L507-L565 and throws at ' +
        'L565. The intended call was setPromotionPeriod(this), declared at ' +
        'model/entity/PromotionQualifier.cfc:L122. Preserved defect.',
    );
  }

  // *** LEGACY-DEFECT [model/entity/PromotionPeriod.cfc:L129]: removePromotionQualifier() calls
  // `removePromotion( this )` on the qualifier. model/entity/PromotionQualifier.cfc declares no
  // `promotion` property and no hand-written `removePromotion`, so the call matches none of the
  // eleven onMissingMethod patterns at org/Hibachi/HibachiEntity.cfc:L507-L565 and throws at L565.
  // The intended call was `removePromotionPeriod(this)`, declared at
  // model/entity/PromotionQualifier.cfc:L128.
  // Preserved deliberately; do not fix without a product decision.

  // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L129]: A SECOND, INDEPENDENT WART ON THE SAME
  // LINE - the source reads `arguments.PromotionQualifier` with a CAPITAL P, while the argument
  // declared at L128 is `promotionQualifier` in lower camelCase. CFML's `arguments` scope is
  // CASE-INSENSITIVE, so the mismatch happens to resolve and is harmless there; TypeScript is
  // case-sensitive, so the parameter below is named `promotionQualifier` to match the declaration.
  // Same wart class as the `skusList` / `SkusList` casing inside `PriceGroupRate.getAppliesTo()`.
  // Registered as a SECONDARY item: it spends no divergence, and it is NOT the throwing defect -
  // the throwing defect is the wrong method NAME, recorded in the marker immediately above.

  /**
   * Bidirectional helper for the `promotionQualifiers` collection.
   * [model/entity/PromotionPeriod.cfc:L128-L130]
   *
   * A throwing stub, on identical terms to `removePromotionReward`. Remove-shaped, so not an
   * inversion defect; the defect is the wrong method name.
   *
   * @throws Error always.
   */
  removePromotionQualifier(promotionQualifier: PromotionQualifier): void {
    throw new Error(
      'PromotionPeriod.removePromotionQualifier is inoperable in Slatwall 3.1.39: ' +
        'model/entity/PromotionPeriod.cfc:L129 calls removePromotion( this ) on the ' +
        'promotionQualifier, but model/entity/PromotionQualifier.cfc declares its parent property ' +
        'as `promotionPeriod` (L68) and therefore has NO removePromotion. The call matches none of ' +
        'the onMissingMethod patterns at org/Hibachi/HibachiEntity.cfc:L507-L565 and throws at ' +
        'L565. The intended call was removePromotionPeriod(this), declared at ' +
        'model/entity/PromotionQualifier.cfc:L128. Preserved defect.',
    );
  }

  // =============  END:  Bidirectional Helper Methods ===================
  // [model/entity/PromotionPeriod.cfc:L132]

  // ============ START: Non-Persistent Property Methods =================
  // [model/entity/PromotionPeriod.cfc:L135-L148] - holds `getCurrentFlag` and nothing else.

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
   * *** THIS IS A *CORRECT* INSTANCE OF THE MEMOIZED-ACCESSOR SEED/GUARD PATTERN - the control case
   * that proves the pattern works when written properly, and it carries NO DEFECT MARKER. *** The
   * seed key, the write key and the return key are ALL `currentFlag`. There is no DEFECT-19-style
   * poisoning (`Product.getBrandName` at model/entity/Product.cfc:L524-L532 seeds the memo with `""`
   * and then returns without assigning the computed value) and no DEFECT-18-style key mismatch
   * (`Sku.getOptionsByOptionGroupIDStruct` at model/entity/Sku.cfc:L512-L522 populates
   * `variables.OptionsByGroupIDStruct` but returns `variables.optionsByOptionGroupIDStruct`).
   *
   * SIGNATURE UNCHANGED - zero arguments, verbatim. It reads the INJECTED CLOCK internally and does
   * NOT receive a `now` parameter; only `isCurrent` is widened, and that budget is now exhausted.
   *
   * THE SEED IS `true` - THE PERMISSIVE DEFAULT, matching the `define.forever` / `define.unlimited`
   * intent of the nullable columns. With both bounds absent this returns `true`.
   *
   * BOUNDARY SEMANTICS, WHICH DIFFER FROM `isCurrent()` - see the L80-vs-L140 defect marker above.
   * The start bound is INCLUSIVE (`start > now` flips the flag false, so equality keeps it true) and
   * the end bound is likewise INCLUSIVE (`end < now` flips it false, so equality keeps it TRUE).
   * `isCurrent()` treats the end bound as EXCLUSIVE and returns FALSE at that same instant.
   *
   * TWO SEPARATE CLOCK READS are preserved, at the same two positions L140 uses, with identical
   * `&&` / `||` short-circuiting - so the runtime read COUNT matches the legacy exactly rather than
   * being "improved" down to one. UTC policy: both comparisons are on epoch milliseconds.
   *
   * Concretely called at model/entity/Promotion.cfc:L98, inside `getCurrentPromotionPeriodFlag()`.
   */
  getCurrentFlag(): boolean {
    // LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L138]: THIS IS A TRUE MEMO GUARD, NOT A
    // LAZY-LOAD PROBE, and the distinction matters. `currentFlag` is declared
    // `persistent="false"` at L75 and is NEVER hydrated from a row, so
    // `structKeyExists(variables, "currentFlag")` genuinely asks "have I computed this yet?".
    // CONTRAST model/entity/Product.cfc:L617, whose `structKeyExists(variables, "defaultSku")`
    // probes Hibernate LAZY-LOAD STATE on a money-critical path - a different question with a
    // different answer under eager materialization. Implemented as `=== undefined` on the private
    // memo field: `structKeyExists` from src/lib/cfml/struct.ts is deliberately NOT used, because
    // that helper models case-insensitive key access on a DATA STRUCT including the
    // "present-but-undefined" state, which has no analogue for a private class field; and
    // `isNullish` is deliberately NOT used either, because the legacy guard here is
    // `structKeyExists`, not `isNull`, and collapsing the two would erase that distinction.
    if (this.currentFlag === undefined) {
      // [model/entity/PromotionPeriod.cfc:L139] - seed permissive.
      this.currentFlag = true;

      const startDateTime: Date | undefined = this.startDateTime;
      const endDateTime: Date | undefined = this.endDateTime;

      // [model/entity/PromotionPeriod.cfc:L140] - the two `!isNull(...)` guards map to
      // `!isNullish(...)` from src/lib/cfml/truthiness.ts, preserving the auditable CFML semantics;
      // each trailing `!== undefined` is a TYPE-NARROWING step only, required because `isNullish`
      // returns `boolean` rather than a TypeScript type predicate, and provably redundant at
      // runtime. The two `this.now()` reads sit at exactly the two positions the legacy line uses,
      // so `&&` / `||` short-circuiting reproduces the legacy read count on every path.
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
    // request-scoped, so a second call within one request will NOT recompute even if the injected
    // clock has since moved past the end bound - reproducing the legacy memo exactly. It is never
    // module-scoped, which would leak state across warm Lambda invocations.
    return this.currentFlag;
  }

  // ============  END:  Non-Persistent Property Methods =================
  // [model/entity/PromotionPeriod.cfc:L148]
}

// ---------------------------------------------------------------------------------------------
// TRAILING BANNER BLOCKS IN THE SOURCE - ALL THREE EMPTY, ONE OF THEM A DUPLICATE
// ---------------------------------------------------------------------------------------------
//
// LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L150-L152]: the `Custom Formatting Methods` banner
// pair is COMPLETELY EMPTY. Consistent with the property census - this entity has no monetary
// column, no `currencyCode`, no formatted-output accessor and nothing to format. Nothing is ported
// for it, and in particular no `getAmountFormatted`-style member is invented.
//
// LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L154-L156]: a DUPLICATE, COMPLETELY EMPTY SECOND
// `Bidirectional Helper Methods` banner pair, 22 lines after the first pair closed at L132. This is
// EXACTLY THE SAME WART AS model/entity/PromotionAccount.cfc:L117/L119 - two in-scope entities now
// share it, which points to a shared component template rather than an isolated slip. Recorded as a
// SECONDARY register item: no divergence is spent, and the TypeScript above is organised
// idiomatically rather than reproducing CFML banner structure (B1 - "minimal change" scopes the
// FUNCTIONAL surface, not code style; a transliteration would VIOLATE it).
//
// LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L158-L160]: the `ORM Event Hooks` banner pair is
// COMPLETELY EMPTY - there is NO `preInsert` and NO `preUpdate` on this entity. That is a positive
// finding, not an omission: the four hook-bearing in-scope entities are `Category`
// (model/entity/Category.cfc:L126/L131), `PriceGroup` (model/entity/PriceGroup.cfc:L206/L211),
// `ProductType` (model/entity/ProductType.cfc:L305/L310) and `PromotionCode`
// (model/entity/PromotionCode.cfc:L179, insert-only). THIS IS NOT ONE OF THEM, so no
// hook-equivalent maintenance method is authored here and no materialized-path maintenance exists
// to invoke from the repository on save.

// ---------------------------------------------------------------------------------------------
// STRUCTURAL WARTS IN THE SOURCE LAYOUT - RECORDED, NOT REPRODUCED
// ---------------------------------------------------------------------------------------------
//
// LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L78-L93]: FOUR BEHAVIOURAL METHODS SIT OUTSIDE
// EVERY BANNER BLOCK. `isCurrent` (L78), `isExpired` (L83), `isDeletable ` (L87) and
// `getSimpleRepresentation` (L91) are declared after the property block ends and before the first
// banner opens at L95. The consequence worth noting is semantic, not cosmetic: `isCurrent()` and
// `getCurrentFlag()` answer the same question about the same two columns, yet they live in two
// different structural locations - one outside every banner, the other inside
// `Non-Persistent Property Methods` - which is very likely how their behavioural divergence
// (registered as the L80-vs-L140 defect above) survived unnoticed.
//
// LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L95-L148]: THE BANNER ORDER IS INVERTED relative to
// most siblings - the `Bidirectional Helper Methods` block (L95-L132) PRECEDES the
// `Non-Persistent Property Methods` block (L135-L148). model/entity/PromotionAccount.cfc has the
// identical inversion. Cosmetic; the TypeScript above follows the source's own method order for
// reviewability without emulating its banner comments.
//
// LEGACY-NOTE [model/entity/PromotionPeriod.cfc:L52-L130]: COSMETIC SOURCE WHITESPACE, DELIBERATELY
// NOT REPRODUCED. `cat -A` shows the L52-L78 region terminated with CRLF while L98 onward uses LF
// only - genuinely MIXED line terminators inside one 163-line component. Also: a double space
// between `notnull="false"` and `hb_nullRBKey=` on L55 and L56; a leading space before the tab on
// L74 and L78; L75 trailing-space-terminated; L76 and L77 containing only a leading space; four
// trailing spaces on most of L98-L130; a trailing tab after the closing brace on L142; and a space
// before the parentheses in `isDeletable ()` at L87. This file is written with LF endings and
// Prettier-conformant whitespace per .prettierrc.json (`endOfLine: "lf"`).

// ---------------------------------------------------------------------------------------------
// CONFIRMED ABSENCES - VERIFIED AGAINST SOURCE, AND DELIBERATELY NOT INVENTED
// ---------------------------------------------------------------------------------------------
//
// Every item below was checked against model/entity/PromotionPeriod.cfc L49-L163 and found ABSENT.
// Each is listed because inventing it would be the easy mistake, and because the absence is itself
// the finding:
//
//   * NO `preInsert` / `preUpdate` - the ORM Event Hooks banner is empty (see above).
//   * NO materialized-path column, hence NO import of ../valueObjects/materializedIdPath.js. The
//     three path-bearing in-scope entities are `Category` (`categoryIDPath`), `PriceGroup`
//     (`priceGroupIDPath`, model/entity/PriceGroup.cfc:L53, 4000 chars) and `ProductType`
//     (`productTypeIDPath`).
//   * NO `attributeValues` collection. The in-scope EAV census is EXACTLY FOUR declarations -
//     model/entity/Sku.cfc:L70, model/entity/Product.cfc:L75, model/entity/ProductType.cfc:L67 and
//     model/entity/Brand.cfc:L60. Because this entity declares none, the `getAttributeValue` EAV
//     fallback at org/Hibachi/HibachiEntity.cfc:L559 is UNREACHABLE for it and an unmatched `get...`
//     throws directly at L565. The EAV path is not ported: no nineteenth entity file, no
//     `attributeValue.ts`, no EAV read path, no `addAttributeValue` / `removeAttributeValue`.
//   * NO monetary column, NO `currencyCode`, NO `roundingRule` association, NO `sortOrder`, NO
//     `activeFlag`. Hence no ../valueObjects/money.js, no ../valueObjects/currencyCode.js and no
//     `decimal.js` - and no float arithmetic anywhere, because there is no arithmetic at all.
//   * NO memo defects of the DEFECT-17 / 18 / 19 classes - the single memo here is correct, as
//     documented on `getCurrentFlag()`.
//   * NO `physicals` / `physicalCounts` collection, so the `maxCollection:0` delete-context tension
//     - where a delete rule references a collection the domain deliberately does not materialize,
//     so the rule trivially PASSES in TypeScript where it would BLOCK in CFML - does NOT arise at
//     this entity. That tension belongs to `PriceGroup.appliedOrderItems`, `PromotionCode.orders`
//     and the `physicalCounts` collections on Sku / Product / Brand / ProductType.
//   * NO `type="array"` on either one-to-many (contrast model/entity/Sku.cfc:L72 `skuCurrencies`
//     and model/entity/Brand.cfc:L60 `attributeValues`, which do declare it) - a metadata
//     inconsistency only; both are arrays here regardless.
//   * NO `hb_processContexts`, NO `accessors=` and NO `output=` attribute on the L49 component tag.
//   * NO `getSimpleRepresentationPropertyName()` - this entity OVERRIDES `getSimpleRepresentation()`
//     directly at L91. Contrast model/entity/PriceGroupRate.cfc:L270 and
//     model/entity/PromotionCode.cfc:L171, which declare the property-name variant instead.
//   * NO `getService(` site anywhere in all 163 lines (verified by `grep -c`, result 0). This is one
//     of the ten in-scope entities that need NO collaborator port at all - which is why nothing is
//     imported from ../ports/, why there are exactly THIRTEEN ports and no fourteenth, why the clock
//     is a plain constructor parameter rather than a port, and why EVERY method on this class is
//     SYNCHRONOUS: no `async`, no `Promise`, no `await`.
//   * NO code column, hence NO `^[a-zA-Z0-9-_.|:~^]+$` regex. Those three identical code regexes
//     govern `Product.productCode`, `Option.optionCode` and `OptionGroup.optionGroupCode` only.
//   * NO declaratively-invoked validator method. The complete in-scope census across all fifteen
//     schemas is: Sku.json -> `hasUniqueOptions` and `hasOneOptionPerOptionGroup`; RoundingRule.json
//     -> `hasExpressionWithListOfNumericValuesOnly`; Promotion.json ->
//     `getPromotionCodesDeletableFlag`; PromotionCode.json -> `hasUniquePromotionCode`. NONE belongs
//     here, so no `hasUniquePromotionPeriod` and no date-range validator is authored.
//   * NO zod schema in this file. Enforcement of model/validation/PromotionPeriod.json - including
//     its cross-field `needsEndAfterStart` + `gtProperty: "startDateTime"` rule - is a SERVICE-TIER
//     concern. Asserting it here as a constructor invariant would reject rows the legacy ORM loads
//     happily and would contradict the absence convention, since both bounds are legitimately null.

// ---------------------------------------------------------------------------------------------
// TEST CONTRACT - NET-NEW COVERAGE, NEVER PARITY.
// ---------------------------------------------------------------------------------------------
//
// `PromotionPeriod` HAS NO LEGACY TEST WHATSOEVER. Exactly two of the eighteen in-scope entities
// extend legacy coverage: `brand.test.ts`, from
// meta/tests/unit/entity/BrandTest.cfc::defaults_are_correct(), which asserts `getProducts()`
// returns an empty array; and `product.test.ts`, from
// meta/tests/unit/entity/ProductTest.cfc::productUrlIsCorrectlyFormatted(), which retains the
// `nike-air-jorden` fixture verbatim including BOTH the leading and the trailing slash.
// meta/tests/functional/admin/entity/ProductTest.cfc is an EMPTY STUB - acknowledged as a gap, never
// counted as coverage. Coverage for THIS module is therefore entirely NET-NEW and must be labelled
// NET-NEW in tests/traceability/legacyTestMap.ts; presenting it as parity would fail the coverage
// gate. Regression tests follow the `issue_<ticket#>` convention from meta/tests/unit/IssuesTest.cfc.
//
// No test file is authored here - slatwall-ts/tests/ is owned by another agent. The eleven
// behaviours that tests/unit/domain/entities/promotionPeriod.test.ts must pin are enumerated below
// so the test author inherits this analysis rather than re-deriving it:
//
//   1. `isCurrent(now)` boundary polarity - START INCLUSIVE: at `now === startDateTime` (with a
//      later end bound) it returns `true`. END EXCLUSIVE: at `now === endDateTime` it returns
//      `false`. Both must be asserted at the exact instant, not merely on either side of it.
//   2. `isCurrent()` THROWS when either bound is `undefined` - the model/entity/PromotionPeriod.cfc
//      :L80 defect. The test must assert the throw, and must NOT be relaxed to accept a boolean:
//      "fixing" it to return the permissive `true` that `hb_nullRBKey="define.forever"` implies
//      would spend a divergence this file does not own.
//   3. *** THE BOUNDARY DIVERGENCE *** - construct one period and read both methods at
//      `now === endDateTime`: `isCurrent()` returns `false` while `getCurrentFlag()` returns `true`.
//      PIN BOTH ANSWERS. This is the observable proof of the L80-vs-L140 defect, and any future
//      refactor that "aligns" the two methods must break this test loudly.
//   4. `getCurrentFlag()` returns `true` when both bounds are `undefined` (the permissive seed), and
//      MEMOIZES: a second call must return the same answer even after the injected clock has been
//      advanced past the end bound. Drive this with a mutable clock closure.
//   5. `isExpired()` returns `false` when `endDateTime` is `undefined` (never expired = forever),
//      `true` strictly after it, `false` at exactly that instant (the comparison is `<`), and
//      IGNORES `startDateTime` ENTIRELY - assert with a future start bound and a past end bound.
//   6. `isDeletable()` is `true` only when NOT expired AND the parent promotion reports
//      `isDeletable()` true (model/entity/Promotion.cfc:L170-L171 - no applied promotions); returns
//      `false` when expired WITHOUT reaching the promotion at all (short-circuit - assert with a
//      throwing stub promotion, or with `promotion` absent); and THROWS when `promotion` is
//      `undefined` and the period is not expired.
//   7. `setPromotion()` appends `this` to the parent's LIVE array exactly once; does NOT re-append
//      when `hasPromotionPeriod` already reports membership BY PRIMARY KEY; appends WITHOUT calling
//      `hasPromotionPeriod` at all when `isNew()` is `true` (assert the short-circuit with a spy);
//      and assigns the near-side field even on the no-append path.
//   8. `removePromotion()` THROWS when the period IS present in the parent collection - the
//      reachable model/entity/PromotionPeriod.cfc:L110 leak - and leaves the parent array
//      UNMUTATED and the near-side field UNCLEARED; clears the near side and does not throw when
//      the period is ABSENT; resolves the omitted argument from the near-side field; and throws a
//      distinct error when nothing can be resolved at all.
//   9. All four of `addPromotionReward`, `removePromotionReward`, `addPromotionQualifier` and
//      `removePromotionQualifier` THROW, each with a message naming its own locator, the wrong
//      method it calls and the correct `setPromotionPeriod` / `removePromotionPeriod`.
//  10. All four nullable columns round-trip as `undefined` - `startDateTime`, `endDateTime`,
//      `maximumUseCount`, `maximumAccountUseCount` - NEVER `0`, never `new Date(0)`, never a
//      sentinel. This is the third absence convention, and it is the reason a `undefined` use-limit
//      must reach the promotion engine as UNLIMITED rather than as a zero-valued cap.
//  11. `getSimpleRepresentation()` returns the parent's `promotionName`, and THROWS when `promotion`
//      is `undefined`.
//
// Two further assertions are cheap and worth having: both collections default to `[]` when the
// repository supplies nothing, and `isNew()` is `true` for the `unsavedvalue=""` primary key and
// `false` for any populated one.
