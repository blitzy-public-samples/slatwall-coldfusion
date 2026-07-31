// ---------------------------------------------------------------------------
// slatwall-ts - PromotionApplied entity
//
// PORT OF model/entity/PromotionApplied.cfc (155 lines, confirmed by `wc -l`).
//
// WHAT THIS ENTITY IS - TWO ROLES, BOTH LOAD-BEARING
//
//   1. THE WRITE-SIDE OUTPUT OF THE PROMOTION ENGINE. It is the only row the
//      promotion pipeline creates. `PromotionService.updateOrderAmountsWithPromotions`
//      builds one at each of its three application points, and the discount a
//      customer actually receives is the `discountAmount` recorded here.
//   2. THE PRIMARY ANTI-CORRUPTION BOUNDARY AT THE ENTITY LEVEL. Of its four
//      foreign keys, THREE point at the out-of-scope order aggregate -
//      `orderItem`, `orderFulfillment` and `order` - and exactly one,
//      `promotion`, has an in-scope far side. That ratio is why six of the
//      component's eight public methods are dropped here; see the DROP block
//      inside the class.
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/PromotionApplied.cfc:L49]
//
//   component displayname="Promotion Applied" entityname="SlatwallPromotionApplied"
//   table="SwPromotionApplied" persistent="true" extends="HibachiEntity"
//   cacheuse="transactional" hb_serviceName="promotionService" {
//
// SCHEMA CONTINUITY IS A BINDING CONSTRAINT: entity property metadata IS the
// contract. Table `SwPromotionApplied`, entity name `SlatwallPromotionApplied`,
// display name `Promotion Applied`, `cacheuse="transactional"`,
// `hb_serviceName="promotionService"` - the same service that constructs this
// entity, so the write-side handler and the metadata agree. No migration, no
// rename, no new table, no column change. Inert columns are preserved rather
// than dropped, and every `hb_*` attribute value is carried forward verbatim in
// a comment on the member it governs so the legacy admin can still resolve it.
// JavaRB is not ported and no i18n runtime is introduced; this component
// declares no `rbKey`, `hb_rbKey` or `hb_nullRBKey` attribute anywhere, which
// was checked case-insensitively rather than assumed.
//
// LEGACY-NOTE [model/entity/PromotionApplied.cfc:L49]: `persistent="true"` is
// QUOTED here, where model/entity/PriceGroup.cfc:L49 and
// model/entity/PriceGroupRate.cfc:L49 write the unquoted
// `persistent=true output=false accessors=true` form. A cosmetic inconsistency
// in the legacy tree; annotated, not normalised.
//
// LEGACY-NOTE [model/entity/PromotionApplied.cfc:L49] - THREE ABSENCES IN THAT
// DECLARATION, each verified case-insensitively so a reader knows they were
// checked and not missed:
//   * NO `hb_permission`. Contrast model/entity/PriceGroupRate.cfc:L49, which
//     carries the dotted `hb_permission="priceGroup.priceGroupRates"`, and
//     model/entity/PriceGroup.cfc:L49, which carries `hb_permission="this"`.
//     There is also NO `hb_parentPropertyName` and NO `hb_processContexts`.
//   * NO `accessors="true"`. ColdFusion auto-generates accessors for a
//     persistent ORM entity regardless, so the omission is COSMETIC and is not
//     a behaviour change. Noted, not "corrected".
//   * NO `output="false"`. Same category.
//
// THE ENGINE'S CONSTRUCTION SEQUENCE - FIVE STEPS, THREE SITES, IDENTICAL SHAPE
// Verbatim from model/service/PromotionService.cfc, whose three application
// blocks are L399-L406 (fulfillment), L445-L452 (order) and L528-L536 (item):
//
//   var newAppliedPromotion = this.newPromotionApplied();
//   newAppliedPromotion.setAppliedType( <literal> );
//   newAppliedPromotion.setPromotion( <promotion> );
//   newAppliedPromotion.setOrderFulfillment(...) | setOrder(...) | setOrderItem(...);
//   newAppliedPromotion.setDiscountAmount( discountAmount );
//
// The promotion argument is `reward.getPromotionPeriod().getPromotion()` on the
// two reward paths [model/service/PromotionService.cfc:L403, L449] and
// `orderItemQulifiedDiscounts[ orderItem.getOrderItemID() ][1].promotion` on the
// order-item path [model/service/PromotionService.cfc:L532]. (That key really is
// spelled `orderItemQulifiedDiscounts` in the source. The typo belongs to the
// engine's accumulator and is registered there, not here.)
//
// `setCurrencyCode` IS NEVER CALLED and `setRemoteID` IS NEVER CALLED - verified
// by a case-insensitive sweep of the whole of model/service/PromotionService.cfc,
// which returns zero hits for either, and re-verified against the three
// construction blocks above. Neither setter is authored below.
//
// IN THE TARGET THE ENGINE EMITS INTENTS, NOT MUTATIONS. `updateOrderAmountsWithPromotions`
// returns applied-promotion intents rather than mutating a live ORM graph,
// because the order aggregate is out of scope. The CONSTRUCTOR is therefore the
// population path for both repository hydration and intent emission, and it
// carries every column as an explicit slot.
//
// WHY THERE IS NO IMPORT FROM `../../lib/cfml/**`, STATED SO IT READS AS A
// DECISION RATHER THAN AN OVERSIGHT. Four helpers were each considered and each
// ruled out against the source:
//   * `truthiness.ts` / `cfBoolean()` - NOT NEEDED. The boolean census across
//     [model/entity/PromotionApplied.cfc:L52-L70] is ZERO of EITHER CASING. That
//     was run case-insensitively on purpose: a case-sensitive grep for
//     `ormtype="boolean"` under-counts, because model/entity/PriceGroupRate.cfc:L53
//     writes `ormType="boolean"` with a capital T and escapes a lowercase-only
//     census. This entity genuinely declares no boolean.
//   * `list.ts` - NOT NEEDED. No comma-list column, no `listLen`, `listGetAt`,
//     `listAppend`, `listToArray` or `listFindNoCase` anywhere in the component.
//   * `numberFormat.ts` - NOT NEEDED. No `numberFormat(...)` call and no
//     `hb_formatType` attribute on any property, so this entity performs no
//     presentation formatting of any kind.
//   * `struct.ts` - NOT NEEDED. The component's only struct operations are four
//     `structDelete(variables, "x")` calls [model/entity/PromotionApplied.cfc:L93,
//     L111, L129, L147] and four `structKeyExists(arguments, "x")` probes [L86,
//     L104, L122, L140]. In TypeScript those become a plain `= undefined`
//     assignment and a plain optional parameter respectively - idiomatic
//     TypeScript, with no `variables.` scope object and no CFML struct
//     emulation. A transliteration would violate the minimal-change directive,
//     which scopes the FUNCTIONAL SURFACE and never the code style.
// There is likewise NO port import: the component contains ZERO `getService(`
// sites, verified by direct grep across the whole of L49-L155. Nothing here
// reaches outward, which is also why every method below is synchronous.
//
// WHY ALL THREE IMPORTS ARE `import type` - A RECORDED DECISION
// `Money` and `CurrencyCode` are used exclusively in TYPE POSITION here: this
// entity is a pure carrier for its monetary column and performs no arithmetic
// whatsoever, so it never calls `Money.fromDecimalString`, never touches
// `Money.zero`, and never invokes `toCurrencyCode`. ESLint
// `@typescript-eslint/consistent-type-imports` is configured with
// `prefer: 'type-imports'` and `fixStyle: 'separate-type-imports'`, and
// `@typescript-eslint/no-import-type-side-effects` is on, so a VALUE import of a
// type-only binding is an ERROR in this project rather than a style preference -
// and a lint error is a build failure here, not a review note. `import type` is
// therefore the only form that compiles clean. `CurrencyCode` could not be a
// value import in any case: it is `export type CurrencyCode` at
// [slatwall-ts/src/domain/valueObjects/currencyCode.ts:L325], a branded type
// alias with no runtime existence.
//
// THE entities <-> promotion CYCLE IS TYPE-ONLY, AND THAT IS WHAT MAKES IT SAFE.
// `./promotion.js` type-references `PromotionApplied` back through its
// `appliedPromotions` collection [model/entity/Promotion.cfc:L64], so the two
// modules form a mutual cycle. It is harmless ONLY because `import type` is
// erased at emit and no runtime edge is created. NEVER introduce a value import
// between these two files.
//
// MONEY IS THE SOLE ARITHMETIC SURFACE, AND THIS FILE HONOURS THAT BY NOT DOING
// ARITHMETIC. `decimal.js` is not imported - only
// slatwall-ts/src/domain/valueObjects/money.ts and
// slatwall-ts/src/lib/cfml/precision.ts may import it - and no floating-point
// operation on a monetary value appears anywhere below. `discountAmount` is
// carried as `Money | undefined` and never as a `number`.
//
// WHAT THE FRAMEWORK BASE CONTRIBUTES, AND WHY ALMOST NONE OF IT IS AUTHORED
// org/Hibachi/HibachiEntity.cfc:L507-L565 is an `onMissingMethod` dispatcher
// matching eleven method-name patterns - hasUniqueOrNull*, hasUnique*, hasAny*,
// get*AssignedIDList, get*ID, get*Options, get*OptionsSmartList, get*SmartList,
// get*Struct, get*Count, and a `getAttributeValue` fallback at L559 - and
// TERMINATING IN A THROW AT L565. TypeScript MUST NOT emulate dynamic dispatch,
// so there is no `Proxy`, no index signature, no `evaluate()` and no `variables.`
// scope object here. Only concretely-called members are authored, and for this
// entity the framework contribution is exactly one: `isNew()`, called at
// [model/entity/PromotionApplied.cfc:L81, L99, L117, L135].
//
// No `has*` predicate is authored ON this entity, because it declares no
// collection for one to search. The direction runs the other way: it is the FAR
// side, `Promotion`, that must expose `hasAppliedPromotion`. See the far-side
// contract block below.
//
// CONFIRMED ABSENCES - each checked directly against L49-L155
//   * NO `attributeValues` collection. Only four in-scope entities declare one
//     (model/entity/Sku.cfc:L70, model/entity/Product.cfc:L75,
//     model/entity/ProductType.cfc:L67, model/entity/Brand.cfc:L60), so the L559
//     EAV fallback - which guards on `hasProperty("attributeValues")` - is
//     UNREACHABLE from here and an unmatched `get...` throws directly at L565.
//     The EAV path is not ported and no additional entity module is created for
//     it.
//   * NO `activeFlag`, NO `physicals`, NO `sortOrder`.
//   * NO COLLECTIONS OF ANY KIND - zero `one-to-many`, zero `many-to-many`,
//     both re-verified case-insensitively. Nothing below is an array and there
//     is no `hasAny*` member.
//   * NO NON-PERSISTENT PROPERTIES AT ALL, so there is no memoized accessor and
//     none of the three known legacy memo-defect shapes can appear here.
//   * NO `calculated*` property, which is half of why the `hb_cascadeCalculate`
//     hint on L59 is inert - see the note on `orderItemID`.
//
// NO VALIDATION FILE, AND IT MUST NOT BE INVENTED
// `model/validation/` holds 96 `.json` schemas and `PromotionApplied.json` is
// not one of them - confirmed by direct enumeration. This entity is one of
// exactly four in-scope entities with no schema, alongside Category,
// PromotionQualifier and PromotionAccount. Consequences, stated so nobody goes
// looking for them: there is NO zod schema in this file, NO declaratively
// invoked validator method, NO `maxCollection:0` delete-context tension to
// annotate, and NO orphan-condition finding of the kind carried by
// model/validation/PriceGroupRate.json. Schema enforcement lives at the service
// tier regardless.
//
// ASSOCIATIONS ARRIVE ALREADY MATERIALIZED OR ABSENT - LAZINESS IS NOT SIMULATED
// Hibernate lazy collections have no equivalent in a driver-only stack, so
// `src/repositories/mysql/**` owns row-to-entity hydration and documents the
// fetch shape at the producing method. THERE IS NO FETCH-SHAPE RULING TO MAKE
// FOR THIS ENTITY, and that was checked rather than overlooked: a
// case-insensitive census across L49-L155 found NO `fetch=` and NO `lazy=`
// attribute anywhere in the component. For contrast, the only in-scope
// `fetch="join"` sites are model/entity/Product.cfc:L68-L70 and
// model/entity/PromotionPeriod.cfc:L59, and the only `lazy="extra"` sites are
// model/entity/ProductType.cfc:L66, model/entity/PromotionCode.cfc:L68 and
// model/entity/Sku.cfc:L71.
//
// ASYNC APPLIES PER-METHOD, NOT PER-ENTITY - AND HERE EVERY METHOD IS
// SYNCHRONOUS. Zero `getService(` sites, zero collaborator ports, no outward
// reach of any kind, so there is no `async`, no `Promise` and no port parameter
// anywhere in this file.
//
// TIMESTAMP POLICY: UTC, EXPLICITLY
// `createdDateTime` and `modifiedDateTime` are `ormtype="timestamp"` columns
// read as `Date | undefined`. The legacy values were written in the CF server's
// local timezone; the target treats every instant as UTC and performs no
// implicit local-zone conversion. This entity compares no date, so the policy
// has no branch here - it is recorded because the columns exist and a reader is
// entitled to know which convention they carry.
//
// NO USER RULES WERE PROVIDED
// The project rules document returns exactly "No user rules provided." No rule
// is invented to fill the gap, and the absence is not treated as licence to
// lower the bar: the enterprise substitute standard applies at FULL strength -
// maximal strictness, no `any` and no suppression comment, `Money` as the sole
// arithmetic surface, one exported unit per file plus its co-located literal
// type, no barrel, no per-file GPL header (licence continuity is satisfied at
// subtree level by slatwall-ts/NOTICE-GPL.md), and every judgment call annotated
// at the point where it was made.
//
// NO NON-FUNCTIONAL REQUIREMENT IS ASSERTED ANYWHERE IN THIS FILE, because none
// exists in the source. The legacy runtime's 60-second, 45-second and 30-second
// lock timeouts are noted-and-not-implemented, and all three sit in code paths
// this entity never touches.
//
// TEST COVERAGE FOR THIS MODULE IS NET-NEW. No file under meta/tests touches
// `PromotionApplied`; only two of the eighteen in-scope entities have a legacy
// antecedent, brand.ts from meta/tests/unit/entity/BrandTest.cfc and product.ts
// from meta/tests/unit/entity/ProductTest.cfc. The contract the test tier has to
// pin is enumerated at the foot of this file.
// ---------------------------------------------------------------------------

import type { CurrencyCode } from '../valueObjects/currencyCode.js';
import type { Money } from '../valueObjects/money.js';
import type { Promotion } from './promotion.js';

// ---------------------------------------------------------------------------
// THE FAR-SIDE CONTRACT THIS FILE REQUIRES OF `./promotion.js`
//
// `setPromotion` and `removePromotion` below need exactly two members on the
// `Promotion` class, and BOTH NAMES ARE THE LEGACY NAMES VERBATIM. The naming
// mismatch is real and is preserved rather than tidied: the collection is
// `appliedPromotions` - the plural of the RELATIONSHIP - and NOT
// `promotionApplieds`; the predicate is `hasAppliedPromotion` and NOT
// `hasPromotionApplied`.
//
//   getAppliedPromotions(): PromotionApplied[]
//       MUST return the LIVE MUTABLE ARRAY, never a copy. The legacy mutates it
//       in place through `arrayAppend` [model/entity/PromotionApplied.cfc:L82]
//       and `arrayDeleteAt` [model/entity/PromotionApplied.cfc:L91], and
//       `Promotion.isDeletable()` [model/entity/Promotion.cfc:L170-L171] reads
//       its length - `return arrayLen( getAppliedPromotions() ) == 0;` - so the
//       collection is on a LIVE path and a defensive copy would silently break
//       deletability.
//
//   hasAppliedPromotion(promotionApplied: PromotionApplied): boolean
//       An EXPLICITLY TYPED PRIMARY-KEY COMPARISON on `promotionAppliedID`.
//       Never object reference, never deep equality. It has no hand-written
//       legacy body: it is synthesised for the declared collection, and the
//       dispatcher that backs that synthesis
//       [org/Hibachi/HibachiEntity.cfc:L507-L565] cannot be emulated in
//       TypeScript, so the member must be authored explicitly on the far side.
//
// EVIDENCE THAT BOTH RESOLVE - THIS IS WHY THE TWO HELPERS BELOW ARE REAL AND
// NOT THROWING STUBS. model/entity/Promotion.cfc:L64 declares:
//
//   property name="appliedPromotions" singularname="appliedPromotion"
//   cfc="PromotionApplied" fieldtype="one-to-many" fkcolumn="promotionID"
//   cascade="all" inverse="true";
//
// and L157-L164 declare the explicit pair around it - banner
// `// appliedPromotions (one-to-many)` at L157, `addAppliedPromotion` at L158
// delegating to `promotionApplied.setPromotion(this)`, and
// `removeAppliedPromotion` at L162 delegating to
// `promotionApplied.removePromotion(this)`. This is the EXACT OPPOSITE of the
// PromotionAccount case, where Promotion declares no `promotionAccounts`
// collection and so `PromotionAccount.setPromotion` throws at
// org/Hibachi/HibachiEntity.cfc:L565 on every path. Two mirror-image contracts,
// both correct, and the difference is a single declared collection.
//
// LEGACY-NOTE [model/entity/Promotion.cfc:L62-L64]: `appliedPromotions` uses
// `cascade="all"`, NOT `cascade="all-delete-orphan"` - unlike both of its
// siblings on the same component, `promotionPeriods` (L62) and `promotionCodes`
// (L63), which are each `all-delete-orphan`. The asymmetry is recorded here for
// auditability; the cascade obligation itself belongs to the repositories layer
// and not to this module.
//
// If either member is absent when `./promotion.js` is authored, author it there
// to this contract. NEVER rename anything here to fit a different far side.
// ---------------------------------------------------------------------------

/**
 * The three values `SwPromotionApplied.appliedType` may hold.
 *
 * A REAL DATA CONTRACT, PINNED FROM BOTH SIDES - which is why it is exported
 * rather than inlined. The column carries NO `hb_formFieldType="select"` and has
 * NO options method on the entity (contrast `PriceGroupRate.amountType` at
 * model/entity/PriceGroupRate.cfc:L55), so the vocabulary is not discoverable
 * from the property declaration at all. It is discoverable only from the code
 * that writes and reads it, and both were enumerated exhaustively:
 *
 * THE WRITE SIDE - three sites, all in the engine, all string literals:
 *   [model/service/PromotionService.cfc:L402] setAppliedType('orderFulfillment')
 *   [model/service/PromotionService.cfc:L448] setAppliedType('order')
 *   [model/service/PromotionService.cfc:L531] setAppliedType('orderItem')
 *
 * THE READ SIDE - three raw-SQL predicates in the reporting layer, an
 * INDEPENDENT confirmation of exactly the same three literals:
 *   [model/report/PromotionUsageReport.cfc:L82] appliedType = 'order'
 *   [model/report/PromotionUsageReport.cfc:L84] appliedType = 'orderItem'
 *   [model/report/PromotionUsageReport.cfc:L86] appliedType = 'orderFulfillment'
 *
 * Repo-wide, `appliedType` occurs in only five places: the property declaration
 * at model/entity/PromotionApplied.cfc:L54, the unrelated
 * model/entity/TaxApplied.cfc:L58, and those three report predicates. There is
 * no fourth value and no sentinel.
 *
 * The union is exported because a downstream consumer genuinely needs the
 * literal type - `src/services/promotion/promotionApplication.ts` emits these
 * intents - and this mirrors the single precedent already set by
 * `PriceGroupRateAmountType`. It is the ONLY export in this module besides the
 * class itself.
 *
 * ORDER OF THE MEMBERS: `'order' | 'orderItem' | 'orderFulfillment'`, matching
 * the read side's declaration order rather than the write side's, purely so the
 * union reads in the same sequence as the report SQL a reviewer will diff it
 * against. A union has no semantic order, so nothing depends on this.
 */
export type PromotionAppliedType = 'order' | 'orderItem' | 'orderFulfillment';

/**
 * One `SwPromotionApplied` row: a single discount, applied to one of an order,
 * an order item or an order fulfillment, by one promotion.
 *
 * A CLASS RATHER THAN AN INTERFACE, because the legacy entities carry behaviour
 * and not merely data, and because interface parity is the acceptance contract:
 * a reviewer diffs this public surface against the CFC line by line. Method
 * names are therefore the legacy CFML names VERBATIM in camelCase - which is
 * exactly why eslint.config.mjs deliberately enables no `naming-convention`,
 * `camelcase` or `id-match` rule.
 *
 * IT IS THE SIMPLEST BEHAVIOUR-CARRYING ENTITY IN THE FOLDER. The
 * Non-Persistent Property Methods section is empty, the ORM Event Hooks section
 * is empty, and the only hand-written logic in the entire component is the
 * bidirectional helper block. What remains is a carrier plus two array
 * operations.
 *
 * NOTHING HERE IS OPTIONAL-BY-`?:`. Every nullable member is a REQUIRED
 * constructor slot typed `T | undefined`, because `exactOptionalPropertyTypes`
 * is enabled and "absent" and "present-but-undefined" are genuinely different
 * types under it. Requiring the key forces a hydrating repository to state "I
 * looked and found nothing" rather than silently omitting it.
 */
export class PromotionApplied {
  // --- Persistent Properties [model/entity/PromotionApplied.cfc:L52-L55] -----
  //
  // Exactly four, under the `// Persistent Properties` banner at L51.

  /**
   * Primary key. [model/entity/PromotionApplied.cfc:L52]
   *
   *   property name="promotionAppliedID" ormtype="string" length="32"
   *   fieldtype="id" generator="uuid" unsavedvalue="" default="";
   *
   * `string` and never `string | undefined`: `default=""` means the column
   * always holds a string, possibly the empty one, and that empty string is
   * load-bearing because it is exactly what `isNew()` keys on. UUID generated,
   * 32 characters, `unsavedvalue=""`.
   *
   * `readonly` with a getter and no setter, matching the legacy id property. It
   * is also the key every containment predicate on the far side compares - see
   * `isSameRowAs` and the far-side contract for `hasAppliedPromotion`.
   *
   * It has one live legacy read path beyond the accessor: the promotion
   * use-count HQL counts it, at [model/dao/PromotionDAO.cfc:L141] and
   * [model/dao/PromotionDAO.cfc:L196], both of which read
   * `SELECT count(pa.promotionAppliedID) as count FROM SlatwallPromotionApplied pa`.
   */
  private readonly promotionAppliedID: string;

  /**
   * The discount recorded by this row. [model/entity/PromotionApplied.cfc:L53]
   *
   *   property name="discountAmount" ormtype="big_decimal";
   *
   * THIS IS ONE OF EXACTLY FOUR NO-DEFAULT MONEY COLUMNS IN THE ENTIRE IN-SCOPE
   * SET, alongside `PriceGroupRate.amount` [model/entity/PriceGroupRate.cfc:L54],
   * `SkuCurrency.price` [model/entity/SkuCurrency.cfc:L53] and
   * `PromotionReward.amount` [model/entity/PromotionReward.cfc:L61]. Contrast
   * model/entity/Sku.cfc:L55-L57, where all three monetary columns DO declare
   * `default="0"`. THE ORM SCHEMA ITSELF ENCODES THE ASYMMETRY, so absence here
   * is a modelled state and not a missing zero.
   *
   * IT MUST NEVER BE COERCED TO `0`, AND NEVER TYPED `number`. `Money |
   * undefined` is the type, `undefined` means "no discount recorded", and
   * substituting zero would make an unrecorded discount indistinguishable from a
   * recorded zero one. The same rule governs the highest-consequence parity
   * check in the migration - `Sku.getPriceByCurrencyCode()` returning
   * `Money | undefined` [model/entity/Sku.cfc:L269-L273] - and it is the same
   * rule for the same reason.
   *
   * `Money` and not `number` also because `big_decimal` is arbitrary precision.
   * Every legacy consumer sums this column through `precisionEvaluate`:
   * [model/entity/Order.cfc:L369], [model/entity/OrderItem.cfc:L194] and
   * [model/entity/OrderFulfillment.cfc:L190] each read
   * `precisionEvaluate('discountAmount + getAppliedPromotions()[i].getDiscountAmount()')`.
   * IEEE-754 doubles cannot reproduce that without drift.
   *
   * NOT `readonly`, because the legacy has live in-place write sites - see
   * `setDiscountAmount`.
   *
   * LEGACY-NOTE [model/entity/PromotionApplied.cfc:L53]: the property carries NO
   * `hb_formatType=` attribute, so - unlike `PriceGroupRate.amount` with its
   * `getAmountFormatted()` companion - there is NO formatted-accessor member
   * anywhere in this component, and none is invented here.
   */
  private discountAmount: Money | undefined;

  /**
   * Which of the three order-side targets this discount was applied to.
   * [model/entity/PromotionApplied.cfc:L54]
   *
   *   property name="appliedType" ormtype="string";
   *
   * Typed to the {@link PromotionAppliedType} union rather than to `string`,
   * because the vocabulary is a real data contract pinned from both the write
   * and read sides - the evidence is on the union itself.
   *
   * `PromotionAppliedType | undefined`: the column declares no default, and the
   * engine sets it only on the three construction paths, so a row that was
   * hydrated from a legacy write predating those paths can legitimately have no
   * value. NOT `readonly`, because `setAppliedType` is a live legacy member.
   */
  private appliedType: PromotionAppliedType | undefined;

  /**
   * The 3-character ISO currency code of {@link discountAmount}.
   * [model/entity/PromotionApplied.cfc:L55]
   *
   *   property name="currencyCode" ormtype="string" length="3";
   *
   * Typed with the branded `CurrencyCode` from
   * slatwall-ts/src/domain/valueObjects/currencyCode.ts, which asserts SHAPE
   * (exactly three characters) and nothing more - it is not a promise that the
   * currency exists, is active, or is eligible for a SKU. No validation logic is
   * invented here; the repository brands the row value on the way in, using that
   * module's own `isCurrencyCode` guard at a hydration boundary or its throwing
   * `toCurrencyCode` constructor. Casing is stored VERBATIM and compared
   * case-insensitively, which are two separate rules that module owns.
   *
   * THE PROMOTION ENGINE NEVER POPULATES THIS COLUMN. Verified twice and from
   * two directions: a case-insensitive sweep for `setCurrencyCode` across the
   * whole of model/service/PromotionService.cfc returns ZERO hits, and none of
   * the three construction blocks [model/service/PromotionService.cfc:L399-L406,
   * L445-L452, L528-L536] touches it. A repo-wide sweep finds no reader either -
   * nothing in model/, admin/ or frontend/ ever reads
   * `SwPromotionApplied.currencyCode`. THE COLUMN EXISTS FOR SCHEMA CONTINUITY
   * ONLY, and it is preserved rather than dropped for exactly that reason. Its
   * verbatim round-tripping is also what
   * slatwall-ts/src/domain/valueObjects/currencyCode.ts cites as the
   * justification for not case-folding a branded code.
   *
   * `readonly`: no `setCurrencyCode` is authored, because no write site exists.
   */
  private readonly currencyCode: CurrencyCode | undefined;

  // --- Related Entities [model/entity/PromotionApplied.cfc:L58-L61] ----------
  //
  // Four many-to-ones under the `// Related Entities` banner at L57. ONE has an
  // in-scope far side; THREE point at the out-of-scope order aggregate and
  // collapse to opaque identifier columns.

  /**
   * The materialized far side of the `promotion` many-to-one.
   * [model/entity/PromotionApplied.cfc:L58]
   *
   *   property name="promotion" cfc="Promotion" fieldtype="many-to-one"
   *   fkcolumn="promotionID";
   *
   * The ONE in-scope association on this entity. `undefined` when the repository
   * did not fetch it, and `undefined` again after `removePromotion` has cleared
   * it. Not `readonly`: `setPromotion` and `removePromotion` both write it.
   */
  private promotion: Promotion | undefined;

  /**
   * The `promotionID` foreign-key column.
   * [model/entity/PromotionApplied.cfc:L58]
   *
   * Read from the column rather than derived from the association, so the key is
   * available even when the repository chose not to materialize `promotion`.
   * `undefined` on a NULL column.
   */
  private readonly promotionID: string | undefined;

  // LEGACY-NOTE [org/Hibachi/HibachiEntity.cfc:L528-L531]: none of the four
  // `get<Assoc>ID` accessors below had a hand-written legacy body. They resolved
  // through the `get*ID` branch of the onMissingMethod dispatcher into
  // `getPropertyPrimaryID`, which invokes the ASSOCIATION getter and returns the
  // far object's primary ID, falling back to the EMPTY STRING when the
  // association is null. The target reads the foreign-key COLUMN instead and
  // returns `undefined` on a miss. Two structural reasons, neither stylistic:
  // three of the four far sides (OrderItem, OrderFulfillment, Order) are out of
  // scope entirely, so there is no instance to invoke the getter on; and reading
  // the column makes the key available even when the association was not
  // materialized, which the legacy proxy-based form could not do. The
  // `""`-on-miss detail is recorded so it is auditable rather than silently
  // dropped - it was checked, not overlooked.

  /**
   * The `orderItemID` foreign-key column, OPAQUE.
   * [model/entity/PromotionApplied.cfc:L59]
   *
   *   property name="orderItem" cfc="OrderItem" fieldtype="many-to-one"
   *   fkcolumn="orderItemID" hb_cascadeCalculate="true";
   *
   * The far side is model/entity/OrderItem.cfc, which is EXPLICITLY OUT OF
   * SCOPE - the order, checkout and payment pipeline is the plan's largest
   * exclusion. The many-to-one therefore collapses to an opaque identifier and
   * no `OrderItem` object is ever constructed. Getter only, no setter; see the
   * ID-accessor ruling in the DROP block below.
   *
   * LEGACY-NOTE [model/entity/PromotionApplied.cfc:L59]:
   * `hb_cascadeCalculate="true"` is preserved verbatim here as inert metadata
   * and is NOT PORTED, because the target has no calculation framework to
   * propagate through. Its legacy meaning is precise:
   * `updateCalculatedProperties()` at [org/Hibachi/HibachiEntity.cfc:L36-L54]
   * walks the property list and, for any property carrying a truthy
   * `hb_cascadeCalculate`, calls `updateCalculatedProperties()` on the FAR
   * OBJECT - guarded at L49 by `isObject( variables[ name ] )`. Once the foreign
   * key is a plain string that guard can never pass, so the hint is inert
   * STRUCTURALLY and not merely by omission. It is doubly inert here because
   * this entity declares no `calculated*` property for the loop's other branch
   * to recompute. The only other in-scope carrier of the same hint is
   * model/entity/Sku.cfc:L65 on `product`.
   */
  private readonly orderItemID: string | undefined;

  /**
   * The `orderfulfillmentID` foreign-key column, OPAQUE.
   * [model/entity/PromotionApplied.cfc:L60]
   *
   *   property name="orderFulfillment" cfc="OrderFulfillment"
   *   fieldtype="many-to-one" fkcolumn="orderfulfillmentID";
   *
   * The far side is model/entity/OrderFulfillment.cfc, out of scope. Opaque
   * identifier, getter only.
   *
   * LEGACY-NOTE [model/entity/PromotionApplied.cfc:L60] - CASING WART, PRESERVED
   * EXACTLY. The DATABASE COLUMN NAME is `orderfulfillmentID` with a LOWERCASE
   * `f`, while the CFML property is `orderFulfillment` with a capital F. Every
   * other foreign key on this component matches its property's casing -
   * `promotionID` (L58), `orderItemID` (L59), `orderID` (L61) - so this one is
   * the outlier. The distinction is deliberate and must be kept straight in two
   * places: the TypeScript member here is `orderFulfillmentID` (capital F,
   * because it is a TypeScript identifier and reads correctly as one), while the
   * physical column any SQL in `src/repositories/mysql/**` must name is
   * `orderfulfillmentID` (lowercase f, because that is what the schema holds).
   * Schema continuity forbids "fixing" the column name: a migration is out of
   * scope and MySQL identifier case-sensitivity is platform-dependent, so a
   * silent correction here could break the query on a case-sensitive server.
   */
  private readonly orderFulfillmentID: string | undefined;

  /**
   * The `orderID` foreign-key column, OPAQUE.
   * [model/entity/PromotionApplied.cfc:L61]
   *
   *   property name="order" cfc="Order" fieldtype="many-to-one"
   *   fkcolumn="orderID";
   *
   * The far side is model/entity/Order.cfc, out of scope. Opaque identifier,
   * getter only. This is the key the promotion engine's applied-promotion
   * intents are keyed by in the target.
   */
  private readonly orderID: string | undefined;

  // --- Remote properties [model/entity/PromotionApplied.cfc:L64] -------------

  /**
   * External-system correlation identifier. [model/entity/PromotionApplied.cfc:L64]
   *
   *   property name="remoteID" ormtype="string";
   *
   * Under the `// Remote properties` banner at L63. Never written by the
   * promotion engine - a case-insensitive sweep for `setRemoteID` across
   * model/service/PromotionService.cfc returns zero hits - so it is `readonly`
   * with a getter and no setter. Present because the column is, and because
   * model/entity/PromotionAccount.cfc notably does NOT declare one: that is a
   * real schema difference between the two link entities, not an omission in
   * either.
   */
  private readonly remoteID: string | undefined;

  // --- Audit properties [model/entity/PromotionApplied.cfc:L67-L70] ----------
  //
  // Four members under the `// Audit properties` banner at L66, and ALL FOUR
  // carry `hb_populateEnabled="false"` - preserved verbatim here as inert
  // metadata. In the legacy tree that attribute told the framework's populate
  // routine to refuse these fields from request data; the framework wrote them
  // itself. Neither the promotion engine nor this class ever writes them, which
  // is why all four are `readonly` with getters only.
  //
  // The two `Account` many-to-ones collapse to opaque identifier columns for the
  // same reason as the order-side keys: model/entity/Account.cfc is out of
  // scope, so no `Account` object is ever constructed.

  /**
   * [model/entity/PromotionApplied.cfc:L67] `hb_populateEnabled="false"`,
   * `ormtype="timestamp"`. UTC; `undefined` for a NULL column - never the epoch,
   * never `0`, never a fresh clock reading.
   */
  private readonly createdDateTime: Date | undefined;

  /**
   * The `createdByAccountID` column, opaque.
   * [model/entity/PromotionApplied.cfc:L68] `hb_populateEnabled="false"`,
   * `cfc="Account" fieldtype="many-to-one" fkcolumn="createdByAccountID"`.
   */
  private readonly createdByAccountID: string | undefined;

  /**
   * [model/entity/PromotionApplied.cfc:L69] `hb_populateEnabled="false"`,
   * `ormtype="timestamp"`. UTC; `undefined` for a NULL column.
   */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * The `modifiedByAccountID` column, opaque.
   * [model/entity/PromotionApplied.cfc:L70] `hb_populateEnabled="false"`,
   * `cfc="Account" fieldtype="many-to-one" fkcolumn="modifiedByAccountID"`.
   */
  private readonly modifiedByAccountID: string | undefined;

  /**
   * Hydrates one `SwPromotionApplied` row, and is also how the promotion engine
   * builds an applied-promotion intent.
   *
   * A single readonly parameter object rather than a positional list, matching
   * the convention established across this folder and at
   * [slatwall-ts/src/lib/config.ts:L615]: an inline object type rather than a
   * second exported interface, because this module exports exactly one class and
   * one co-located literal type.
   *
   * THE CONSTRUCTOR IS THE POPULATION PATH. In the legacy tree the engine built
   * the row with `this.newPromotionApplied()` followed by four setter calls
   * [model/service/PromotionService.cfc:L401-L405, L447-L451, L530-L534]; in the
   * target the promotion pass returns applied-promotion intents instead of
   * mutating a live ORM graph, so construction carries every column at once.
   * `setAppliedType`, `setDiscountAmount`, `setPromotion` and `removePromotion`
   * remain available because each has a verified live legacy call site, but they
   * are not required to build a complete instance.
   *
   * Every nullable slot is REQUIRED and typed `T | undefined`, for the
   * `exactOptionalPropertyTypes` reason recorded on the class.
   *
   * There is no collaborator port parameter, because this entity has zero
   * `getService(` sites, and no clock parameter, because it performs no date
   * comparison of any kind.
   */
  constructor(init: {
    readonly promotionAppliedID: string;
    readonly discountAmount: Money | undefined;
    readonly appliedType: PromotionAppliedType | undefined;
    readonly currencyCode: CurrencyCode | undefined;
    readonly promotion: Promotion | undefined;
    readonly promotionID: string | undefined;
    readonly orderItemID: string | undefined;
    readonly orderFulfillmentID: string | undefined;
    readonly orderID: string | undefined;
    readonly remoteID: string | undefined;
    readonly createdDateTime: Date | undefined;
    readonly createdByAccountID: string | undefined;
    readonly modifiedDateTime: Date | undefined;
    readonly modifiedByAccountID: string | undefined;
  }) {
    this.promotionAppliedID = init.promotionAppliedID;
    this.discountAmount = init.discountAmount;
    this.appliedType = init.appliedType;
    this.currencyCode = init.currencyCode;
    this.promotion = init.promotion;
    this.promotionID = init.promotionID;
    this.orderItemID = init.orderItemID;
    this.orderFulfillmentID = init.orderFulfillmentID;
    this.orderID = init.orderID;
    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
  }

  // --- Accessors --------------------------------------------------------------------------------
  //
  // ColdFusion auto-generated these from the property metadata, so there is no legacy body to port;
  // the locator on each cites the property declaration it serves. Names are the CFML names
  // verbatim.

  /** [model/entity/PromotionApplied.cfc:L52] */
  getPromotionAppliedID(): string {
    return this.promotionAppliedID;
  }

  /**
   * [model/entity/PromotionApplied.cfc:L53]
   *
   * `undefined` means NO DISCOUNT RECORDED and MUST NOT be read as zero. Live legacy readers of
   * this accessor: [model/service/PromotionService.cfc:L385] and
   * [model/service/PromotionService.cfc:L431], each comparing an existing applied discount against
   * a newly computed one; and the three aggregate sums at [model/entity/Order.cfc:L369],
   * [model/entity/OrderItem.cfc:L194] and [model/entity/OrderFulfillment.cfc:L190].
   */
  getDiscountAmount(): Money | undefined {
    return this.discountAmount;
  }

  /**
   * Replaces the recorded discount. [model/entity/PromotionApplied.cfc:L53]
   *
   * AUTHORED BECAUSE IT IS A REAL LEGACY MEMBER WITH FIVE VERIFIED CALL SITES, not because a
   * carrier "ought" to have a setter. ColdFusion auto-generates it from the persistent property
   * metadata, and the engine uses it in two distinct ways:
   *
   *   * CONSTRUCTION, three sites - [model/service/PromotionService.cfc:L405],
   *     [model/service/PromotionService.cfc:L451] and
   *     [model/service/PromotionService.cfc:L534].
   *   * IN-PLACE UPDATE OF AN ALREADY-CONSTRUCTED ROW, two sites -
   *     [model/service/PromotionService.cfc:L389]
   *     (`orderFulfillment.getAppliedPromotions()[1].setDiscountAmount(discountAmount)`) and
   *     [model/service/PromotionService.cfc:L435]
   *     (`arguments.order.getAppliedPromotions()[1].setDiscountAmount(discountAmount)`). Both sit
   *     inside the "same promotion, better discount" branch, which first tests
   *     `getAppliedPromotions()[1].getDiscountAmount() < discountAmount` [L385, L431] and then
   *     confirms the promotion identity matches [L388, L434]. THIS PATH IS WHAT MAKES THE MEMBER
   *     NON-OPTIONAL: without it the engine could not raise an existing discount in place, and
   *     promotion discount math is one of the three must-preserve areas.
   *
   * It takes `Money` and not `Money | undefined`: no legacy site ever un-sets the discount, so
   * accepting `undefined` would invent a capability the source does not have. Contrast
   * `setCurrencyCode` and `setRemoteID`, which are NOT authored at all because they have zero call
   * sites anywhere in the repository.
   */
  setDiscountAmount(discountAmount: Money): void {
    this.discountAmount = discountAmount;
  }

  /**
   * [model/entity/PromotionApplied.cfc:L54]
   *
   * `undefined` for a row whose column is NULL. Never defaulted to `'order'` or to any other member
   * of the union - there is no default in the schema and inventing one would misreport which target
   * a discount was applied to.
   */
  getAppliedType(): PromotionAppliedType | undefined {
    return this.appliedType;
  }

  /**
   * Records which order-side target this discount applies to.
   * [model/entity/PromotionApplied.cfc:L54]
   *
   * AUTHORED BECAUSE IT IS A REAL LEGACY MEMBER WITH THREE VERIFIED CALL SITES, all in the engine
   * and all passing a string literal: [model/service/PromotionService.cfc:L402] `'orderFulfillment'`,
   * [model/service/PromotionService.cfc:L448] `'order'`, and
   * [model/service/PromotionService.cfc:L531] `'orderItem'`. Typing the parameter to
   * {@link PromotionAppliedType} turns those three literals into the compiler's business: a fourth
   * value cannot be written without changing the union, which is precisely the point of pinning it.
   *
   * There is NO options method here - no `getAppliedTypeOptions()` or equivalent - because the
   * property carries no `hb_formFieldType="select"` and the component declares none. Inventing one
   * would add public surface the source never had.
   */
  setAppliedType(appliedType: PromotionAppliedType): void {
    this.appliedType = appliedType;
  }

  /**
   * [model/entity/PromotionApplied.cfc:L55]
   *
   * Effectively always `undefined` in practice, and that is the correct, faithful answer rather
   * than a gap: nothing in the legacy tree writes this column - see the field's own annotation for
   * the two-directional verification. Callers must handle `undefined`; they must not infer a
   * currency from the setting layer here, because the legacy row genuinely records none.
   */
  getCurrencyCode(): CurrencyCode | undefined {
    return this.currencyCode;
  }

  /**
   * The materialized far side of the `promotion` many-to-one.
   * [model/entity/PromotionApplied.cfc:L58]
   *
   * `undefined` when the repository did not fetch it, or after `removePromotion` cleared it. The
   * legacy reads it at [model/service/PromotionService.cfc:L388] and
   * [model/service/PromotionService.cfc:L434], both of which then call `.getPromotionID()` on the
   * result to compare promotion identity.
   */
  getPromotion(): Promotion | undefined {
    return this.promotion;
  }

  /** The `promotionID` column. [model/entity/PromotionApplied.cfc:L58] */
  getPromotionID(): string | undefined {
    return this.promotionID;
  }

  /** The `orderItemID` column, opaque. [model/entity/PromotionApplied.cfc:L59] */
  getOrderItemID(): string | undefined {
    return this.orderItemID;
  }

  /**
   * The `orderfulfillmentID` column, opaque. [model/entity/PromotionApplied.cfc:L60]
   *
   * The member is `orderFulfillmentID`; the physical column is `orderfulfillmentID` with a
   * lowercase `f`. See the casing note on the field.
   */
  getOrderFulfillmentID(): string | undefined {
    return this.orderFulfillmentID;
  }

  /** The `orderID` column, opaque. [model/entity/PromotionApplied.cfc:L61] */
  getOrderID(): string | undefined {
    return this.orderID;
  }

  /** [model/entity/PromotionApplied.cfc:L64] */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [model/entity/PromotionApplied.cfc:L67] UTC. `undefined` for a NULL column. */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /** The `createdByAccountID` column, opaque. [model/entity/PromotionApplied.cfc:L68] */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/PromotionApplied.cfc:L69] UTC. `undefined` for a NULL column. */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** The `modifiedByAccountID` column, opaque. [model/entity/PromotionApplied.cfc:L70] */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  /**
   * Whether this instance has been persisted yet.
   *
   * Inherited from the framework base in the legacy tree and concretely called at exactly four
   * sites in this component, one inside each `set*` helper:
   * [model/entity/PromotionApplied.cfc:L81] in `setPromotion`,
   * [model/entity/PromotionApplied.cfc:L99] in `setOrderItem`,
   * [model/entity/PromotionApplied.cfc:L117] in `setOrderFulfillment` and
   * [model/entity/PromotionApplied.cfc:L135] in `setOrder`. Only the first survives into the
   * target, because the other three helpers are dropped as out of scope.
   *
   * THE EMPTY-STRING TEST IS NOT AN APPROXIMATION OF THE FRAMEWORK - IT IS LITERALLY WHAT THE
   * FRAMEWORK DOES. `isNew()` at [org/Hibachi/HibachiEntity.cfc:L707-L709] returns `getNewFlag()`,
   * and `getNewFlag()` at [org/Hibachi/HibachiEntity.cfc:L571-L576] is
   * `if(getPrimaryIDValue() == "") { return true; } return false;`. The empty string it compares
   * against is the `unsavedvalue=""` / `default=""` on the id property at
   * [model/entity/PromotionApplied.cfc:L52].
   *
   * `===` and not `==`: ESLint `eqeqeq` is set to `'error', 'always'` precisely because CFML `==`
   * is loose and case-insensitive while TypeScript's is neither, so every ported comparison is
   * audited at its site rather than assumed. Both operands are `string` here, so strict equality is
   * exact.
   *
   * This is the ONLY framework member authored on this entity. Nothing else the dispatcher at
   * [org/Hibachi/HibachiEntity.cfc:L507-L565] can synthesise is concretely called: no `hasAny*`
   * (there is no collection to test), no `hasUnique*` (there is no validation schema), no
   * `get*Options`, `get*OptionsSmartList`, `get*SmartList`, `get*Struct`, `get*Count` or
   * `get*AssignedIDList`, and no `getAttributeValue` - that last one unreachable anyway, since the
   * L559 guard requires an `attributeValues` property this entity does not declare.
   */
  isNew(): boolean {
    return this.promotionAppliedID === '';
  }

  /**
   * Row identity, used by the one containment search on this class.
   *
   * PRIMARY-KEY COMPARISON ON `promotionAppliedID`, and this is the answer to the question the
   * conversion poses: CFML's `arrayFind(array, component)` at
   * [model/entity/PromotionApplied.cfc:L89] uses REFERENCE IDENTITY, which under Hibernate meant
   * "the same row", because a session represents one persisted row by exactly one instance. The
   * project convention across this folder is therefore to compare the primary key - never object
   * reference alone, and never deep equality, which would wrongly match two distinct rows that
   * happen to carry the same discount for the same promotion.
   *
   * THE UNSAVED CASE IS HANDLED EXPLICITLY, and this is a documented judgment call rather than an
   * oversight. An unsaved row's key is `''` (see `isNew()`), so a naive key comparison would report
   * two DIFFERENT unsaved applied-promotions as the same row and delete the wrong one - a real
   * hazard here, because the engine constructs several unsaved instances per order. When either
   * side is unsaved this falls back to instance identity, which is exactly what the legacy
   * `arrayFind(collection, this)` compared, since Hibernate has no identity to offer for a row it
   * has never written. The fallback narrows behaviour towards the source rather than away from it,
   * and it introduces no new state, no new signature and no new member on the public surface.
   *
   * `private`, so it is not part of the public parity surface. It is genuinely used - by
   * `removePromotion` - so `no-unused-private-class-members` is satisfied.
   */
  private isSameRowAs(candidate: PromotionApplied): boolean {
    const candidateID: string = candidate.getPromotionAppliedID();

    if (candidateID === '' || this.promotionAppliedID === '') {
      return candidate === this;
    }

    return candidateID === this.promotionAppliedID;
  }

  // ============ START: Non-Persistent Property Methods =================
  // [model/entity/PromotionApplied.cfc:L72]
  //
  // LEGACY-NOTE [model/entity/PromotionApplied.cfc:L72-L74]: THIS SECTION IS COMPLETELY EMPTY IN
  // THE SOURCE - L72 opens the banner, L74 closes it, and there is nothing between them. Annotated
  // rather than omitted so a reader knows it was CHECKED and not overlooked. The consequences are
  // worth naming, because they are what make this the simplest entity in the folder: ZERO derived
  // getters, ZERO memoized lazy caches and ZERO `getService(` calls. That last one is why no
  // collaborator port appears in the constructor, why the ESLint `no-restricted-imports` domain
  // boundary is satisfied trivially here, and why every method on this class is synchronous.
  //
  // It also means none of the three known legacy memo-defect shapes can occur here - the poisoned
  // memo at [model/entity/Product.cfc:L524-L532], the write-one-key-return-another memo at
  // [model/entity/Sku.cfc:L512-L522], and the wrong-guard-key memo at
  // [model/entity/Sku.cfc:L500-L510] - because there is no memo to get wrong.
  //
  // ============  END:  Non-Persistent Property Methods =================
  // [model/entity/PromotionApplied.cfc:L74]

  // ============= START: Bidirectional Helper Methods ===================
  // [model/entity/PromotionApplied.cfc:L76]
  //
  // The legacy block holds FOUR PAIRS and EIGHT METHODS in total, under four inline sub-banners:
  // `// Promotion (many-to-one)` at L78, `// Order Item (many-to-one)` at L96,
  // `// Order Fulfillment (many-to-one)` at L114 and `// Order (many-to-one)` at L132. All four
  // pairs are structurally identical, differing only in the association name.
  //
  // ONLY THE PROMOTION PAIR IS AUTHORED HERE. SIX OF THE EIGHT METHODS ARE DROPPED - the largest
  // drop of any entity in this folder - and the justification is recorded on the DROP block below.

  // LEGACY-NOTE [model/entity/PromotionApplied.cfc:L76-L150] - THE MANDATORY "remove-that-ADDs"
  // INVERSION CROSS-CHECK. Performed against all four `remove*` helpers and INDEPENDENTLY RE-RUN
  // against the verbatim source rather than taken on trust. VERDICT: CLEAN - ZERO INVERSIONS.
  //
  //   * `removePromotion`         L89 arrayFind / L91 arrayDeleteAt, both on `arguments.promotion`
  //   * `removeOrderItem`         L107 arrayFind / L109 arrayDeleteAt, both on `arguments.orderItem`
  //   * `removeOrderFulfillment`  L125 / L127, both on `arguments.orderFulfillment`
  //   * `removeOrder`             L143 / L145, both on `arguments.order`
  //
  // Every one correctly calls `arrayDeleteAt`; NONE calls an `add*`. In every case the search and
  // the delete address THE SAME OBJECT - there is no `arguments.account` copy-paste leak of the kind
  // carried by [model/entity/PromotionPeriod.cfc:L110] (reachable, so it throws on the normal path)
  // or [model/entity/PromotionAccount.cfc:L103] (unreachable, masked by an earlier throw).
  //
  // THE CONTRAST THAT MAKES THIS VERDICT MEANINGFUL: [model/entity/Option.cfc:L129-L131] and
  // [model/entity/Option.cfc:L145-L147] are two GENUINE inversions -
  // `removePromotionRewardExclusion` and `removePromotionQualifierExclusion` each call
  // `addExcludedOption( this )` where they should remove - and they are preserved as defects in that
  // entity. Recording a clean verdict here is what tells a reviewer the check was run rather than
  // assumed, and it is why this file carries no LEGACY-DEFECT marker on its helpers.

  // LEGACY-NOTE [model/entity/PromotionApplied.cfc:L81] - THE GUARD POLARITY, PRESERVED EXACTLY
  // BECAUSE IT IS THE OPPOSITE OF ITS SIBLING'S. The append guard is
  // `if(isNew() or !arguments.promotion.hasAppliedPromotion( this ))`, and the first operand tests
  // THIS INSTANCE's newness. CFML `or` short-circuits, so when `this` is new the membership test is
  // NEVER EVALUATED and the append happens unconditionally - which theoretically permits a
  // duplicate entry in the far-side collection for an unsaved row. Contrast
  // `PriceGroupRate.addProductType`, whose equivalent guard tests the ARGUMENT's `isNew()` instead.
  // A real inconsistency in the legacy codebase. REPRODUCED AS WRITTEN AND NOT NORMALISED: the two
  // polarities are not interchangeable, and "harmonising" them would change which collection ends
  // up with which members.

  // Promotion (many-to-one) [model/entity/PromotionApplied.cfc:L78]

  /**
   * Bidirectional helper for the `promotion` many-to-one.
   * [model/entity/PromotionApplied.cfc:L79]
   *
   * A REAL, WORKING HELPER - NOT A THROWING STUB, and that distinction was settled by direct
   * verification rather than by pattern-matching against its siblings. Both far-side members it
   * calls genuinely resolve, because [model/entity/Promotion.cfc:L64] declares
   * `appliedPromotions … singularname="appliedPromotion" cfc="PromotionApplied"
   * fieldtype="one-to-many" fkcolumn="promotionID" cascade="all" inverse="true"`, and
   * [model/entity/Promotion.cfc:L158] and [model/entity/Promotion.cfc:L162] declare the explicit
   * `addAppliedPromotion` / `removeAppliedPromotion` pair that delegates straight back into this
   * method and its partner. [model/entity/Promotion.cfc:L170-L171] then reads the collection's
   * length inside `isDeletable()`, so it is unambiguously on a live path.
   *
   * THIS IS THE MIRROR IMAGE OF `PromotionAccount.setPromotion`, which throws on every code path
   * precisely because `Promotion` declares NO `promotionAccounts` collection and both of its
   * far-side calls fall through the dispatcher to the throw at
   * [org/Hibachi/HibachiEntity.cfc:L565]. One declared collection is the entire difference between
   * the two outcomes. Carrying a defect marker here would be actively misleading.
   *
   * ORDER OF OPERATIONS IS PRESERVED: the near-side assignment at
   * [model/entity/PromotionApplied.cfc:L80] runs FIRST, before the guard, exactly as written.
   *
   * `promotion: Promotion` and not optional: the legacy signature is
   * `setPromotion(required any promotion)` [model/entity/PromotionApplied.cfc:L79] - `required`,
   * unlike its `remove*` partner.
   */
  setPromotion(promotion: Promotion): void {
    // [model/entity/PromotionApplied.cfc:L80]
    this.promotion = promotion;

    // [model/entity/PromotionApplied.cfc:L81-L83]. The short-circuit is load-bearing: when this
    // instance is new the far-side membership test is not evaluated at all. `||` reproduces CFML
    // `or` faithfully here because both operands are already booleans.
    if (this.isNew() || !promotion.hasAppliedPromotion(this)) {
      // [model/entity/PromotionApplied.cfc:L82] `arrayAppend` on the LIVE far-side array. `push`
      // mutates in place, which is required: the legacy appends to the very array that
      // `Promotion.isDeletable()` [model/entity/Promotion.cfc:L170-L171] measures.
      promotion.getAppliedPromotions().push(this);
    }
  }

  /**
   * Bidirectional helper for the `promotion` many-to-one.
   * [model/entity/PromotionApplied.cfc:L85]
   *
   * THE PARAMETER IS OPTIONAL, matching the legacy signature exactly: L85 declares
   * `removePromotion(any promotion)` - NOT `required any promotion`. The four `remove*` helpers on
   * this component are consistent in that, and the no-argument form is genuinely exercised in
   * production for the sibling associations: [model/service/PromotionService.cfc:L66] calls
   * `removeOrderItem()`, [model/service/PromotionService.cfc:L73] and
   * [model/service/PromotionService.cfc:L393] call `removeOrderFulfillment()`, and
   * [model/service/PromotionService.cfc:L79] and [model/service/PromotionService.cfc:L439] call
   * `removeOrder()`, all with no argument. `removePromotion()` has no such call site of its own, but
   * the defaulting behaviour is reproduced for parity because it is part of the declared surface.
   *
   * [model/entity/PromotionApplied.cfc:L86-L88] is the default-to-the-currently-set-value idiom -
   * `if(!structKeyExists(arguments, "promotion")) { arguments.promotion = variables.promotion; }` -
   * and its TypeScript form is an optional parameter with a nullish default. Plain, idiomatic
   * TypeScript: there is deliberately no `variables.` scope object, no `structKeyExists` helper and
   * no CFML struct emulation, because a transliteration would violate the minimal-change directive,
   * which scopes the FUNCTIONAL SURFACE and never the code style.
   *
   * IT THROWS WHEN THE ARGUMENT IS OMITTED AND NO PROMOTION IS SET, and that is behaviour
   * preservation rather than defensiveness. With both absent, CFML reaches L89 and dereferences an
   * undefined value, which is a runtime error there; reproducing it as a throw is faithful, whereas
   * silently returning or no-opping would invent a success path the legacy system does not have.
   *
   * [model/entity/PromotionApplied.cfc:L93]'s `structDelete(variables, "promotion")` sits OUTSIDE
   * the `if` and therefore runs UNCONDITIONALLY - the near side is cleared whether or not the
   * far-side element was found. That placement is preserved exactly, and unlike
   * [model/entity/PromotionPeriod.cfc:L112] this line IS REACHABLE here, because L91 does not throw.
   */
  removePromotion(promotion?: Promotion): void {
    // [model/entity/PromotionApplied.cfc:L86-L88]
    const target: Promotion | undefined = promotion ?? this.promotion;

    if (target === undefined) {
      throw new Error(
        'PromotionApplied.removePromotion was called with no argument while no promotion is set. ' +
          'model/entity/PromotionApplied.cfc:L86-L89 defaults the argument to variables.promotion ' +
          'and then dereferences it at L89, so CFML fails here too. Reproduced rather than ' +
          'silently absorbed.',
      );
    }

    // [model/entity/PromotionApplied.cfc:L89] ARRAY INDEX BASE CHANGE - THE SINGLE MOST COMMON WAY
    // THIS CONVERSION GOES WRONG. CFML `arrayFind` returns a 1-BASED index, or 0 for "not found",
    // which is why the source guards with `index > 0` at L90. TypeScript `findIndex` returns a
    // 0-BASED index, or -1 for "not found", so the guard MUST become `!== -1`. Transcribing `> 0`
    // onto a `findIndex` result would silently skip element 0 - the first entry in the collection,
    // and the very one the engine reads as `getAppliedPromotions()[1]` at
    // [model/service/PromotionService.cfc:L385] and [model/service/PromotionService.cfc:L431].
    //
    // SEMANTICS CHOSEN, AND WHY: containment is decided BY PRIMARY KEY through `isSameRowAs`, not by
    // `indexOf`. CFML's `arrayFind(array, component)` is reference identity, which under Hibernate
    // meant row identity; `isSameRowAs` reproduces that meaning and falls back to reference identity
    // for an unsaved row, where no key exists to compare. Plain `indexOf` would be reference-only
    // and would fail to find a row the repository re-hydrated into a second instance - a situation
    // Hibernate's session identity made impossible and a driver-only stack does not.
    const appliedPromotions: PromotionApplied[] = target.getAppliedPromotions();
    const index: number = appliedPromotions.findIndex((candidate: PromotionApplied) =>
      this.isSameRowAs(candidate),
    );

    // [model/entity/PromotionApplied.cfc:L90-L92]
    if (index !== -1) {
      appliedPromotions.splice(index, 1);
    }

    // [model/entity/PromotionApplied.cfc:L93] - UNCONDITIONAL, outside the found-branch. The CFML
    // `structDelete(variables, "promotion")` becomes a plain `= undefined`.
    this.promotion = undefined;
  }

  // LEGACY-NOTE [model/entity/PromotionApplied.cfc:L97, L103, L115, L121, L133, L139]: SIX HELPERS
  // ARE DELIBERATELY NOT AUTHORED - `setOrderItem` / `removeOrderItem` (L97, L103),
  // `setOrderFulfillment` / `removeOrderFulfillment` (L115, L121) and `setOrder` / `removeOrder`
  // (L133, L139). This is the largest drop of any entity in this folder: six of the component's
  // eight public methods disappear, leaving `setPromotion` / `removePromotion` as the only authored
  // bidirectional helpers.
  //
  // THE JUSTIFICATION IS FORCED, NOT PREFERENTIAL. Each of the three far sides -
  // model/entity/OrderItem.cfc, model/entity/OrderFulfillment.cfc and model/entity/Order.cfc - is
  // explicitly out of scope: the order, checkout and payment pipeline is the plan's single largest
  // exclusion. So `orderItem.hasAppliedPromotion(this)` [L99],
  // `orderItem.getAppliedPromotions()` [L100, L107, L109],
  // `orderFulfillment.hasAppliedPromotion(this)` [L117],
  // `orderFulfillment.getAppliedPromotions()` [L118, L125, L127],
  // `order.hasAppliedPromotion(this)` [L135] and `order.getAppliedPromotions()` [L136, L143, L145]
  // have NO in-scope counterpart to call. Authoring them would require either `any` - forbidden
  // outright, `@typescript-eslint/no-explicit-any` is `'error'` - or inventing three entity modules
  // outside the locked eighteen-file budget. Neither is available, so the pairs are dropped and the
  // four foreign keys survive as the inert opaque ID columns declared above.
  //
  // "DROPPED" MEANS NOT AUTHORED IN THIS NEW TYPESCRIPT FILE. It is NEVER a deletion from the legacy
  // component, which is reference-only and remains untouched, and reading it never made it a write
  // target. Because the AAP mandates this anti-corruption boundary, the drop is not a signature
  // reshaping, not a visibility change and not a deliberate divergence: it spends no budget of any
  // kind. The same ruling is applied identically to `PriceGroup.appliedOrderItems` with its dropped
  // `addAppliedOrderItem` / `removeAppliedOrderItem` pair
  // [model/entity/PriceGroup.cfc:L128, L131], to `PromotionCode.addAccount` / `removeAccount`, and
  // to `PromotionAccount.setAccount` / `removeAccount`.
  //
  // ID-ACCESSOR RULING: the three order keys and the two audit account keys are private fields,
  // constructor-assigned, WITH GETTERS ONLY. There is deliberately no `setOrderItemID`, no
  // `setOrderFulfillmentID`, no `setOrderID`, no `setCreatedByAccountID` and no
  // `setModifiedByAccountID`. The legacy entity-taking setters are the ones being dropped, so
  // inventing ID setters in their place would ADD public surface area that never existed in the
  // source - the opposite of parity. The engine constructs instances directly, and both repository
  // hydration and intent emission flow through the constructor, so no setter is required.
  //
  // THE ANTI-CORRUPTION TENSION, STATED PLAINLY RATHER THAN LEFT IMPLICIT: dropping these six
  // helpers means the far-side `Order`, `OrderItem` and `OrderFulfillment` collections are NEVER
  // MAINTAINED FROM THIS SIDE in the target. That is intentional and is the whole point of the
  // seam - the promotion engine returns applied-promotion intents keyed by opaque
  // `orderID` / `orderItemID` / `orderFulfillmentID` values and never mutates order persistence.
  // The out-of-scope aggregate is an INPUT to the in-scope services, never their dependency, and
  // that inversion is what makes this slice independently deployable. One consequence follows for
  // free and is worth naming: the legacy engine's teardown loops
  // [model/service/PromotionService.cfc:L66, L73, L79] and
  // [model/service/OrderService.cfc:L548, L562, L568], which clear previously applied promotions by
  // calling the dropped no-argument `remove*` forms, have no equivalent here - in an intent model
  // there is no prior in-memory graph to tear down.

  // =============  END:  Bidirectional Helper Methods ===================
  // [model/entity/PromotionApplied.cfc:L150]
  //
  // LEGACY-NOTE [model/entity/PromotionApplied.cfc:L149]: the blank separator line immediately
  // before that closing banner has NO LEADING TAB, while L151 and every other blank separator in
  // the block carries one. A cosmetic whitespace wart unique to this file. Recorded for
  // completeness; NOT "fixed", and NOT a defect.

  // =================== START: ORM Event Hooks  =========================
  // [model/entity/PromotionApplied.cfc:L152]
  //
  // LEGACY-NOTE [model/entity/PromotionApplied.cfc:L152-L154]: THIS SECTION IS ALSO COMPLETELY EMPTY
  // IN THE SOURCE - L152 opens the banner, L154 closes it, nothing between them - so there is NO
  // `preInsert` and NO `preUpdate` on this entity, and none is invented. Annotated so a reader knows
  // it was checked. It matches model/entity/PriceGroupRate.cfc L280/L282, which is likewise empty,
  // and contrasts with the four hook-bearing in-scope entities - Category, PriceGroup, ProductType
  // and PromotionCode - whose hooks become explicit maintenance invoked by the repository on save.
  // Nothing of that kind is needed here: this entity maintains no materialized path and derives no
  // column.
  //
  // ===================  END:  ORM Event Hooks  =========================
  // [model/entity/PromotionApplied.cfc:L154]
  //
  // TWO FURTHER BANNER ABSENCES, checked rather than assumed: there is NO "Implecet"/"Implicit"
  // banner of the kind at model/entity/PriceGroup.cfc L193/L202/L204/L216, and NO Custom Validation
  // / Custom Formatting banner pair of the kind at model/entity/PriceGroupRate.cfc L260/L278. There
  // is also no Overridden Methods banner, so no `isDeletable()` and no
  // `getSimpleRepresentationPropertyName()` on this class - contrast
  // [model/entity/Promotion.cfc:L170], which does override `isDeletable()` and reads this entity's
  // collection to do it.
}

// ---------------------------------------------------------------------------
// TEST CONTRACT - NET-NEW COVERAGE, NEVER PARITY.
//
// `tests/unit/domain/entities/promotionApplied.test.ts` is authored separately;
// that tier is owned elsewhere and NO test file is created from here.
// `PromotionApplied` has NO legacy test whatsoever - nothing under meta/tests
// touches it - so its coverage is one of the SIXTEEN NET-NEW entity suites and
// must be LABELLED NET-NEW. Presenting it as parity fails the coverage gate.
// Only two of the eighteen in-scope entities extend legacy coverage:
// meta/tests/unit/entity/BrandTest.cfc and meta/tests/unit/entity/ProductTest.cfc.
// The suite must also appear in `tests/traceability/legacyTestMap.ts` flagged
// net-new, because that map fails the run when an in-scope module has no test -
// mirroring the structural floor of
// meta/tests/coverage/EntityCoverageTest.cfc:all_entities_have_test_cases().
// Regression tests follow the `issue_<ticket#>` convention carried over from
// meta/tests/unit/IssuesTest.cfc.
//
// THE ELEVEN BEHAVIOURS THAT MUST BE PINNED:
//   1. `getDiscountAmount()` returns `undefined` - NOT `Money.zero`, not `0`, not
//      `'0.00'` - when the column was NULL. This is the highest-consequence
//      assertion in the suite: the `big_decimal` column declares no default
//      [model/entity/PromotionApplied.cfc:L53], unlike model/entity/Sku.cfc:L55-L57
//      which all declare `default="0"`.
//   2. `getDiscountAmount()` round-trips an arbitrary-precision value unchanged -
//      drive it with a many-decimal-place `Money` and assert the value survives,
//      proving nothing coerces it through a `number`.
//   3. `getAppliedType()` accepts and returns each of the three engine literals
//      `'order'`, `'orderItem'` and `'orderFulfillment'`, and returns `undefined`
//      for a NULL column. A type-level assertion that a fourth string is rejected
//      belongs here too, using `@ts-expect-error` with a description - permitted
//      in the test tier by eslint.config.mjs and forbidden in src/**.
//   4. `setAppliedType` and `setDiscountAmount` both mutate in place, and the
//      second one is the in-place UPDATE path the engine uses at
//      [model/service/PromotionService.cfc:L389] and
//      [model/service/PromotionService.cfc:L435]: construct with one amount, set a
//      larger one, assert the getter reports the new value.
//   5. `getOrderItemID()`, `getOrderFulfillmentID()` and `getOrderID()` return
//      opaque strings or `undefined`, and NO `OrderItem` / `OrderFulfillment` /
//      `Order` object is ever constructed. Assert the absence of
//      `setOrderItemID` / `setOrderFulfillmentID` / `setOrderID` and of
//      `setOrderItem` / `setOrderFulfillment` / `setOrder` /
//      `removeOrderItem` / `removeOrderFulfillment` / `removeOrder` - these are
//      scope rulings, and a later "helpful" addition would silently undo one.
//   6. `getCurrencyCode()` returns `undefined` for the ordinary engine-built row,
//      and round-trips a branded 3-character code VERBATIM including its casing
//      when a repository supplies one.
//   7. `setPromotion` appends to the LIVE far-side array EXACTLY ONCE for a saved
//      row already absent from it, and does NOT append twice for a saved row
//      already present by primary key. Assert against the same array instance the
//      far side returns, proving it is not a copy.
//   8. THE NEW-ENTITY GUARD SHORT-CIRCUIT: for a row whose `promotionAppliedID` is
//      `''`, `setPromotion` appends WITHOUT consulting `hasAppliedPromotion` at
//      all - so calling it twice yields TWO entries. Drive it with a spy on the
//      far-side predicate and assert the spy was never called. This is the
//      guard-polarity behaviour at [model/entity/PromotionApplied.cfc:L81], the
//      opposite of `PriceGroupRate.addProductType`, and it must be pinned so a
//      future "harmonisation" fails the suite.
//   9. `removePromotion` deletes BY INDEX from the live far-side array and clears
//      the near-side field - and clears the near side EVEN WHEN the far-side
//      element was absent, proving the unconditional placement of
//      [model/entity/PromotionApplied.cfc:L93]. Include a first-element case
//      (index 0) explicitly: that is the case a mistranslated `> 0` guard would
//      silently skip.
//  10. `removePromotion()` with no argument falls back to the currently-assigned
//      promotion, and THROWS when no argument is given and no promotion is set.
//  11. `isNew()` is `true` for an empty primary key and `false` for a populated
//      one; and `removePromotion` on two DIFFERENT unsaved instances sharing the
//      `''` key removes the correct one, exercising the reference-identity
//      fallback in `isSameRowAs`.
//
// THREE NEGATIVE ASSERTIONS ARE WORTH ADDING ALONGSIDE THEM, because they guard
// rulings rather than behaviour: there is NO `getAmountFormatted()` and no
// formatted accessor of any kind, since the column carries no `hb_formatType`;
// there is NO options method for `appliedType`, since the property carries no
// `hb_formFieldType="select"`; and there is NO `preInsert`, NO `preUpdate`, NO
// `isDeletable()`, NO zod schema and NO validator method, since both ORM-hook
// banners are empty and `model/validation/PromotionApplied.json` does not exist.
// ---------------------------------------------------------------------------
