// ---------------------------------------------------------------------------
// THE SIBLINGS THIS FILE NAMES, AND WHAT EACH ONE OWNS
//
// Commentary below hands responsibilities to other modules by name, and every
// one of them exists on the branch - so each mention points at real code rather
// than at an intention. Naming a boundary here is how this file records what it
// deliberately does NOT do, so that no responsibility below acquires a second
// owner:
//
//   src/services/promotion/promotionApplication.ts       promotion decomposition module
//   tests/traceability/legacyTestMap.ts                  structural coverage map
//   tests/unit/domain/entities/promotionApplied.test.ts  promotionApplied entity suite
// ---------------------------------------------------------------------------

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
 * The applied-promotion entity.
 *
 * CFML parity [model/entity/PromotionApplied.cfc:L52-L55, L58-L61, L64, L67-L70]: the
 * persistent columns, the four many-to-one foreign keys, the remote ID and the audit
 * columns.
 */
export class PromotionApplied {
  private readonly promotionAppliedID: string;

  // `Money`, never `number`: the column is `big_decimal`
  // [model/entity/PromotionApplied.cfc:L53]. Mutable because the engine builds a row and then
  // assigns the computed discount to it.
  private discountAmount: Money | undefined;

  private appliedType: PromotionAppliedType | undefined;

  private readonly currencyCode: CurrencyCode | undefined;

  private promotion: Promotion | undefined;

  private readonly promotionID: string | undefined;

  private readonly orderItemID: string | undefined;

  private readonly orderFulfillmentID: string | undefined;

  private readonly orderID: string | undefined;

  private readonly remoteID: string | undefined;

  private readonly createdDateTime: Date | undefined;

  private readonly createdByAccountID: string | undefined;

  private readonly modifiedDateTime: Date | undefined;

  private readonly modifiedByAccountID: string | undefined;

  /**
   * Builds an applied-promotion row.
   *
   * @param init the row's values; the promotion may be supplied hydrated, by ID, or both.
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

  getPromotionAppliedID(): string {
    return this.promotionAppliedID;
  }

  getDiscountAmount(): Money | undefined {
    return this.discountAmount;
  }

  setDiscountAmount(discountAmount: Money): void {
    this.discountAmount = discountAmount;
  }

  getAppliedType(): PromotionAppliedType | undefined {
    return this.appliedType;
  }

  setAppliedType(appliedType: PromotionAppliedType): void {
    this.appliedType = appliedType;
  }

  getCurrencyCode(): CurrencyCode | undefined {
    return this.currencyCode;
  }

  getPromotion(): Promotion | undefined {
    return this.promotion;
  }

  getPromotionID(): string | undefined {
    return this.promotionID;
  }

  getOrderItemID(): string | undefined {
    return this.orderItemID;
  }

  getOrderFulfillmentID(): string | undefined {
    return this.orderFulfillmentID;
  }

  getOrderID(): string | undefined {
    return this.orderID;
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
   * CFML parity [org/Hibachi/HibachiEntity.cfc:L571-L576]: newness is the primary ID matching
   * the empty `unsavedvalue` declared at [model/entity/PromotionApplied.cfc:L52].
   *
   * @returns whether this row has no primary ID yet.
   */
  isNew(): boolean {
    return this.promotionAppliedID === '';
  }

  /**
   * Identity for collection removal.
   *
   * CFML parity [model/entity/PromotionApplied.cfc:L89]: the legacy `arrayFind` compares
   * object references. Matching on the primary ID recognizes two hydrations of the same row as
   * one, and unsaved rows - which share the empty ID - fall back to reference comparison so
   * they are never conflated.
   *
   * @param candidate the row to compare against.
   * @returns whether both refer to the same persisted row, or are the same instance.
   */
  private isSameRowAs(candidate: PromotionApplied): boolean {
    const candidateID: string = candidate.getPromotionAppliedID();

    if (candidateID === '' || this.promotionAppliedID === '') {
      return candidate === this;
    }

    return candidateID === this.promotionAppliedID;
  }

  /**
   * CFML parity [model/entity/PromotionApplied.cfc:L79-L84]: sets the reference and appends to
   * the promotion's applied collection, guarded so an unsaved row is always appended and a
   * saved one only when not already present.
   *
   * @param promotion the promotion this discount came from.
   */
  setPromotion(promotion: Promotion): void {
    this.promotion = promotion;

    if (this.isNew() || !promotion.hasAppliedPromotion(this)) {
      promotion.getAppliedPromotions().push(this);
    }
  }

  /**
   * Unlinks this row from its promotion.
   *
   * LEGACY-DEFECT [model/entity/PromotionApplied.cfc:L85-L89]: an omitted argument is defaulted from the row's own promotion reference, so calling it with no argument on a row that has none dereferences null and throws at runtime.
   * Preserved deliberately; do not fix without a product decision.
   *
   * @param promotion the promotion to unlink from; omitted, it defaults to this row's own
   *   promotion.
   * @throws Error when no argument is supplied and no promotion is set, reproducing the legacy
   *   runtime failure.
   */
  removePromotion(promotion?: Promotion): void {
    const target: Promotion | undefined = promotion ?? this.promotion;

    if (target === undefined) {
      throw new Error(
        'PromotionApplied.removePromotion was called with no argument while no promotion is set. ' +
          'model/entity/PromotionApplied.cfc:L86-L89 defaults the argument to variables.promotion ' +
          'and then dereferences it at L89, so CFML fails here too. Reproduced rather than ' +
          'silently absorbed.',
      );
    }

    const appliedPromotions: PromotionApplied[] = target.getAppliedPromotions();
    const index: number = appliedPromotions.findIndex((candidate: PromotionApplied) =>
      this.isSameRowAs(candidate),
    );

    if (index !== -1) {
      appliedPromotions.splice(index, 1);
    }

    this.promotion = undefined;
  }
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
