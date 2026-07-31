// ---------------------------------------------------------------------------
// slatwall-ts - PromotionQualifier entity
//
// PORT OF model/entity/PromotionQualifier.cfc (373 lines, re-read in full while authoring
// this file; every locator below was verified against the source rather than inherited).
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/PromotionQualifier.cfc:L49]
//
//   component displayname="Promotion Qualifier" entityname="SlatwallPromotionQualifier"
//   table="SwPromoQual" persistent="true" extends="HibachiEntity" cacheuse="transactional"
//   hb_serviceName="promotionService" hb_permission="promotionPeriod.promotionQualifiers" {
//
// Read that attribute list as an exhaustive one. `persistent="true"` is QUOTED here - the
// same shape Promotion, PromotionCode, PromotionPeriod, PromotionApplied and
// PromotionAccount use, and the direct contrast to PriceGroup / PriceGroupRate, whose
// declarations read `persistent=true output=false accessors=true` UNQUOTED. There is NO
// `accessors=`, NO `output=` and NO `hb_processContexts` on this line. Recorded precisely
// because a paraphrase that adds them would misstate the contract this file exists to
// carry forward.
//
// Schema continuity is a binding constraint: entity property metadata IS the contract.
// * NOTE THE ABBREVIATED PHYSICAL TABLE NAME - `SwPromoQual`, NOT `SwPromotionQualifier`,
// matching PromotionReward's `SwPromoReward`. Five of the thirteen link tables are
// abbreviated further still (`SwPromoQualExclBrand`, `SwPromoQualShipAddressZone`, and so
// on). Every one of the fourteen names is carried forward verbatim below. No migration, no
// rename, no new table, no column change - and no "correcting" the abbreviation.
//
// `hb_serviceName="promotionService"` is why there is no `PromotionQualifierService` to
// port and no such omission to explain: CRUD for this entity lives in the promotion
// service.
//
// * `hb_permission="promotionPeriod.promotionQualifiers"` IS SPELLED CORRECTLY. That is
// worth stating explicitly, because it is the direct contrast to
// [model/entity/PromotionReward.cfc:L49], whose equivalent attribute reads
// `hb_permission="promotionPeriod.promtionRewards"` - missing the `o` in "promotion". The
// sibling's misspelling is the one identifier in that file requiring a documented rename;
// THIS FILE REQUIRES NONE, and none is invented.
//
// THE `extends` CHAIN IS THREE LEVELS DEEP, NOT TWO. `extends="HibachiEntity"` on L49 is
// UNQUALIFIED, so it resolves to the LOCAL model/entity/HibachiEntity.cfc (274 lines),
// which itself extends `Slatwall.org.Hibachi.HibachiEntity`. The intermediate class holds
// twelve `getService(...)` sites - L123, L130, L135, L145, L178, L180, L182, L194, L196,
// L207, L257, L266, seven of them `attributeService`. All twelve are MOOT here because the
// EAV/attribute path is not ported, but they are recorded rather than silently
// re-implemented: an entity reaching outward through a service locator is exactly the
// pattern the ESLint `no-restricted-imports` layer boundary exists to make impossible.
// Neither base level is ported.
//
// * WHAT THIS ENTITY IS FOR. It is the GATE half of the promotion engine:
// `Promotion` -> `PromotionPeriod` -> { QUALIFIERS decide WHETHER a promotion applies,
// REWARDS decide WHAT it gives }. `getQualifierQualificationDetails()`
// [model/service/PromotionService.cfc:L629-L750] reads the ten numeric gates and the
// thirteen collections to answer that question, and `getOrderItemInQualifier()`
// [model/service/PromotionService.cfc:L852-L919] walks the membership collections. Both
// sit inside the must-preserve discount pipeline, so every property below is load-bearing
// rather than decorative. The two planned consumers are
// src/services/promotion/qualifierQualification.ts (planned) and
// src/services/promotion/orderItemMembership.ts (planned).
//
// EVERY MEMBER OF THIS FILE IS SYNCHRONOUS. The async boundary rule is that a method
// becomes `async` if and only if its legacy body reaches the DAO or ORM, and no body in
// this component does: a full read of all 373 lines finds ZERO `getService(` sites, so no
// port is injected, the constructor takes data only, and the words `async`, `await` and
// `Promise` do not appear anywhere below.
//
// THE SOURCE'S BANNER MAP, recorded once so the structure is auditable without reopening
// the CFC, and so the 27-line L328 -> L355 gap is definitively closed - there are NO
// hidden declarations in it, only the four banner pairs listed here.
//
//   | banner pair                      | lines     | state                                  |
//   |----------------------------------|-----------|----------------------------------------|
//   | (no banner - floats free)        | L101-L103 | getSimpleRepresentation                |
//   | Non-Persistent Property Methods  | L105/L117 | POPULATED - getRewardMatchingTypeOptions |
//   | Bidirectional Helper Methods     | L119/L339 | POPULATED - the eleven pairs           |
//   | Custom Validation Methods        | L341/L343 | EMPTY                                  |
//   | Custom Formatting Methods        | L345/L347 | EMPTY                                  |
//   | Overridden Implicet Getters      | L349/L351 | EMPTY (source misspells "Implicit")    |
//   | Overridden Methods               | L353/L363 | POPULATED - two members                |
//   | ORM Event Hooks                  | L365/L367 | EMPTY                                  |
//   | Deprecated Methods               | L369/L371 | EMPTY                                  |
//
// Two structural facts from that map are load-bearing rather than cosmetic and are
// annotated again at the members they govern: `getSimpleRepresentation()` sits OUTSIDE
// every banner section, which is unique among the promotion-cluster entities; and the ORM
// Event Hooks pair is EMPTY, so this entity declares neither `preInsert` nor `preUpdate`.
// Unlike PromotionAccount (L117/L119), PromotionPeriod (L154/L156) and PromotionCode
// (L153/L155), there are NO duplicate banner pairs here and no missing END banner. L54 is
// a blank line inside the property block - there is no declaration hiding there either.
// The banner comments are NOT reproduced as decoration; the structural facts are recorded
// once, here, and TypeScript section comments are used below.
//
// * VALIDATION: THERE IS NO model/validation/PromotionQualifier.json, AND THAT ABSENCE IS
// DELIBERATE RATHER THAN AN OVERSIGHT TO CORRECT. Twelve in-scope entities have a
// validation file and six do not - Category, PromotionQualifier, PromotionApplied,
// PromotionAccount, Product_AddOption and Product_AddOptionGroup. Validation coverage is
// ported AS IT IS rather than completed, so no schema is invented here and NO zod schema
// is authored in this file: schema enforcement belongs to the service tier, while entities
// carry the property metadata. In practical terms NOTHING validates the ten numeric gates -
// a negative minimum, or a maximum below its own minimum, is accepted by the legacy system
// and must be accepted here. There is also no length constraint on `qualifierType`,
// because L53 declares none. Contrast model/validation/PromotionReward.json, which DOES
// exist, so the sibling file carries obligations this one does not.
//
// Consequently there are ZERO declaratively-invoked entity methods on this class. The
// exhaustive `"method"` census across the in-scope schemas yields exactly five, and none
// belongs here: Sku.hasUniqueOptions, Sku.hasOneOptionPerOptionGroup,
// RoundingRule.hasExpressionWithListOfNumericValuesOnly,
// Promotion.getPromotionCodesDeletableFlag and PromotionCode.hasUniquePromotionCode.
//
// JavaRB IS NOT PORTED AND NO i18n RUNTIME IS INTRODUCED. Every `rbKey` / `hb_rbKey` /
// `hb_nullRBKey` identifier is preserved verbatim as an inert string constant so the
// legacy admin can still resolve it, and no resolver is invented to consume them.
//
// TEST COVERAGE FOR THIS MODULE IS NET-NEW. `PromotionQualifier` has no legacy test:
// meta/tests/unit/entity/ contains no PromotionQualifierTest.cfc. Only two of the eighteen
// entity suites extend legacy coverage - brand.test.ts and product.test.ts. The contract
// the test tier must pin is enumerated at the foot of this file, and it must be labelled
// net-new rather than presented as parity.
//
// NO USER RULES WERE PROVIDED for this project - `review_rules` returns exactly
// "No user rules provided." That absence is not licence to lower the bar: the enterprise
// substitute standard applies at full strength (maximal strictness, no `any`, no
// suppression comment, one exported runtime unit per file, no barrel, parameterised
// nothing-outward imports, and every judgment call annotated where it was made), and no
// rule is invented to fill the gap.
//
// THIS FILE SPENDS NOTHING FROM THE FOLDER'S FOUR BUDGETS, and each zero is verifiable
// against the members below rather than merely asserted here:
//
//   * SIGNATURE WIDENINGS: 0. Every method keeps its legacy arity. The entity layer's single
//     widening - `isCurrent(now?: Date)` on promotionPeriod.ts - is already spent, and none
//     is spent again. `removePromotionPeriod(promotionPeriod?)` is NOT a widening: the source
//     parameter at [model/entity/PromotionQualifier.cfc:L128] is already optional (`any
//     promotionPeriod`, no `required`), which is exactly what L129-L131 defaults.
//   * DELIBERATE DIVERGENCES: 0. Not one legacy finding is repaired. The three genuine
//     LEGACY-DEFECT markers in this file are all reproductions, and reproducing the source's
//     exact member set - authoring `getRewardMatchingTypeOptions()` while NOT authoring
//     `getQualifierApplicationTypeOptions()` - is fidelity, not repair. The folder's one
//     divergence allowance (defects 17/18/19, in sku.ts and product.ts) is left untouched.
//   * SIGNATURE RESHAPINGS: 0. The plan's three permitted reshapings all live in
//     src/services and src/integrations; the ORM-hook-to-repository reshaping is vacuous
//     here because the ORM Event Hooks banner pair [L365/L367] is empty.
//   * VISIBILITY WIDENINGS: 0. The five permitted promotions are all in promotionService;
//     nothing private in this component is promoted. `indexOfEntity` moves the other way -
//     it is `private static` and adds no public surface.
// ---------------------------------------------------------------------------

import { isNullish } from '../../lib/cfml/truthiness.js';
import type { Money } from '../valueObjects/money.js';
import type { Brand } from './brand.js';
import type { Option } from './option.js';
import type { Product } from './product.js';
import type { ProductType } from './productType.js';
import type { PromotionPeriod } from './promotionPeriod.js';
import type { Sku } from './sku.js';

// THE IMPORT LEDGER, AND WHY IT IS CLOSED AT EIGHT SPECIFIERS.
//
//   * `isNullish` is the project's CFML `isNull()` parity helper and is the ONLY value
//     import. It is used at three load-bearing sites below - the `qualifierType` presence
//     test inside `getSimpleRepresentation()`, and the two-level unguarded climb in
//     `isDeletable()` plus the resolved-target test in `removePromotionPeriod()`.
//   * `Money` is imported as a TYPE. The agent contract lists it as a value import, and
//     that anticipated arithmetic which this entity does not perform: the four currency
//     gates are inert threshold columns, so `Money` appears only in type positions and
//     `@typescript-eslint/consistent-type-imports` (prefer type-imports,
//     separate-type-imports) therefore REQUIRES `import type`. The module imported is
//     exactly the one prescribed; only the import kind follows the lint rule, and nothing
//     type-only survives into the Lambda bundle.
//   * The six sibling entities are all `import type`. The entities <-> entities cycles
//     here are TYPE-ONLY and are erased at emit, so they never exist at runtime. A value
//     import to a sibling entity must never be introduced.
//
// DELIBERATELY ABSENT, each for a stated reason:
//   * `decimal.js` - only src/lib/cfml/precision.ts and src/lib/cfml/numberFormat.ts may
//     import it, and `Money` is the sole arithmetic surface regardless.
//   * `../../lib/cfml/numberFormat.ts`, `list.ts`, `precision.ts` - this file formats
//     nothing, parses no comma list and evaluates no expression.
//   * `../../lib/cfml/struct.ts` - the only struct operations in the source are
//     `structKeyExists(arguments, "promotionPeriod")` [L129] and
//     `structDelete(variables, "promotionPeriod")` [L136]. Both manipulate CFML ARGUMENT
//     SCOPE and PRIVATE INSTANCE STATE, not a domain-data struct with case-insensitive
//     keys, so they become a TypeScript optional parameter and a field assignment of
//     `undefined` respectively. Importing case-insensitive struct access here would be
//     wrong.
//   * `cfBoolean` / `cfLen` / `cfTruthy` - this entity declares ZERO persistent booleans
//     of either casing (L52-L99 re-read line by line: no `ormtype="boolean"`, no
//     `ormType="boolean"`, and no `default=` attribute anywhere except the PK's
//     `default=""` on L52), and there is no `len()` call and no empty-string truthiness
//     test in the file.
//   * `../valueObjects/currencyCode.ts` - THIS ENTITY HAS NO `currencyCode` COLUMN.
//   * `../valueObjects/materializedIdPath.ts` - this entity has no path column. The
//     qualifier's `productTypes` membership test DOES walk `productTypeIDPath`, but that
//     walk lives in src/services/promotion/orderItemMembership.ts (planned), not here.
//   * `../ports/*.ts`, `../../lib/config.ts`, `../../lib/logger.ts` - zero
//     `getService(` sites means zero injected collaborators; entities do not log and do
//     not read static process configuration.

/**
 * The authoritative vocabulary of `rewardMatchingType`
 * [model/entity/PromotionQualifier.cfc:L65].
 *
 * These are not five plausible values - they are the exact five that
 * `getRewardMatchingTypeOptions()` [model/entity/PromotionQualifier.cfc:L107-L115] offers,
 * in the source's own order, and L65 declares `hb_formFieldType="select"`, so the option
 * list IS the admin form's domain. No sixth member may be added, none renamed, none
 * reordered.
 *
 * WHY THIS COLUMN IS NARROWED WHILE `qualifierType` [L53] IS NOT: the difference is
 * evidence, not taste. This property has a self-declared option list on the entity;
 * `qualifierType` has none - there is no `getQualifierTypeOptions()` anywhere in the file -
 * and the engine tests it with a CASE-INSENSITIVE comma-list membership check
 * [model/service/PromotionService.cfc:L714], so narrowing it would reject data the legacy
 * schema accepts.
 *
 * Exported as a TYPE ALIAS ALONGSIDE the class, which keeps the one-exported-runtime-unit
 * rule intact because a type alias is erased at emit. This is the pattern
 * `PromotionAppliedType` already ships with in src/domain/entities/promotionApplied.ts. A
 * separate `types.ts` is deliberately NOT created, and there is no barrel in this folder.
 */
export type RewardMatchingType = 'any' | 'sku' | 'product' | 'productType' | 'brand';

/**
 * One row of `getRewardMatchingTypeOptions()`.
 * [model/entity/PromotionQualifier.cfc:L107-L115]
 *
 * A `type` alias rather than an `interface`, and that is load-bearing rather than
 * stylistic: an `interface` is NOT assignable to `Readonly<Record<string, unknown>>`
 * (TS2322) because it has no implicit index signature, whereas a type alias IS. The same
 * decision is recorded on `ParentPriceGroupOption` in src/domain/entities/priceGroup.ts.
 *
 * `name` carries the resource-bundle KEY, unresolved. JavaRB is not ported, so the key is
 * preserved verbatim as an inert string rather than replaced by English text or by a
 * resolver this port does not introduce.
 */
type RewardMatchingTypeOption = {
  readonly name: string;
  readonly value: RewardMatchingType;
};

/**
 * A single promotion qualifier - the GATE that decides whether a promotion period applies.
 *
 * A CLASS rather than an interface, because the legacy entity carries BEHAVIOUR and not
 * merely data: it owns an overridden `getSimpleRepresentation()`, a self-declared option
 * list, an `isDeletable()` that climbs two levels of parent, and eleven bidirectional
 * helper pairs. Collapsing that behaviour into free functions would break interface parity,
 * and interface parity is the acceptance contract - the public method names below are the
 * legacy CFML names verbatim, in camelCase, and not one has been "improved".
 *
 * ASSOCIATIONS ARE MATERIALIZED AT THE REPOSITORY BOUNDARY, AND LAZINESS IS NOT SIMULATED.
 * Hibernate lazy collections have no equivalent in a driver-only stack, so each collection
 * arrives already populated and the fetch shape is an explicit, documented decision at the
 * repository method that produced it. For this entity that matters more than usual: the
 * promotion engine reads several of the thirteen collections for EVERY order item on EVERY
 * qualifier, so a lazy-shaped port would have produced a textbook N+1 inside the pricing
 * path.
 *
 * ALL MONEY PASSES THROUGH `Money`. The four `hb_formatType="currency"` gates are `Money`;
 * no raw floating-point operation on any of them exists anywhere in the target. The two
 * `hb_formatType="weight"` gates are deliberately NOT `Money` - see the gate group below.
 *
 * THREE MEMBERS OF THIS CLASS CAN THROW, and each says so on itself: `isDeletable()` (the
 * two-level unguarded climb, two distinct raises) and `removePromotionPeriod()` (the
 * framework-wide unguarded-null idiom when neither an argument nor a stored period is
 * available). Every other member is total - in particular `getSimpleRepresentation()`,
 * which resolves nothing and therefore cannot fail.
 */
export class PromotionQualifier {
  // ============ START: Persistent Properties ===========================
  // [model/entity/PromotionQualifier.cfc:L51-L96]

  /**
   * [model/entity/PromotionQualifier.cfc:L52]
   * `ormtype="string" length="32" fieldtype="id" generator="uuid" unsavedvalue="" default=""`
   *
   * A 32-character UUID. `unsavedvalue=""` together with `default=""` is what makes an
   * unsaved row's key the empty string, which is in turn what makes `isNew()` a simple
   * emptiness test - see the LEGACY-NOTE on that member.
   *
   * This is the primary key every containment predicate in this class compares on, and it
   * is read across the module boundary by `PromotionPeriod.hasPromotionQualifier` and by
   * the `hasPromotionQualifier` / `hasPromotionQualifierExclusion` pairs on brand, option,
   * sku, product and productType.
   */
  private readonly promotionQualifierID: string;

  /**
   * [model/entity/PromotionQualifier.cfc:L53] `ormtype="string" hb_formatType="rbKey"`.
   * No `length`, no `notnull`, no `default`.
   *
   * THE DISCRIMINATOR THE ENGINE BRANCHES ON, and also the property that
   * `getSimpleRepresentationPropertyName()` names.
   * `getQualifierQualificationDetails()` switches on it at
   * [model/service/PromotionService.cfc:L678] for the fulfillment branch and at
   * [model/service/PromotionService.cfc:L714] via
   * `listFindNoCase("contentAccess,merchandise,subscription", getQualifierType())` for the
   * item branch.
   *
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L53]: DELIBERATELY NOT NARROWED TO A
   * UNION. The second test above is CASE-INSENSITIVE and comma-list based, the column
   * carries no check constraint, there is no `getQualifierTypeOptions()` method anywhere in
   * the component, and no validation file exists for this entity at all. A union would
   * fabricate a constraint the source does not impose and would reject data the legacy
   * schema accepts. Contrast `rewardMatchingType` below, which DOES have a self-declared
   * vocabulary and IS narrowed.
   */
  private readonly qualifierType: string | undefined;

  // --- THE TEN NUMERIC GATES [model/entity/PromotionQualifier.cfc:L55-L64] -------------
  //
  //   | locator | property                 | ormtype     | hb_formatType | hb_nullRBKey     | TS type |
  //   |---------|--------------------------|-------------|---------------|------------------|---------|
  //   | L55     | minimumOrderQuantity     | integer     | -             | define.0         | number  |
  //   | L56     | maximumOrderQuantity     | integer     | -             | define.unlimited | number  |
  //   | L57     | minimumOrderSubtotal     | big_decimal | currency      | define.0         | Money   |
  //   | L58     | maximumOrderSubtotal     | big_decimal | currency      | define.unlimited | Money   |
  //   | L59     | minimumItemQuantity      | integer     | -             | define.0         | number  |
  //   | L60     | maximumItemQuantity      | integer     | -             | define.unlimited | number  |
  //   | L61     | minimumItemPrice         | big_decimal | currency      | define.0         | Money   |
  //   | L62     | maximumItemPrice         | big_decimal | currency      | define.unlimited | Money   |
  //   | L63     | minimumFulfillmentWeight | big_decimal | weight        | define.0         | number  |
  //   | L64     | maximumFulfillmentWeight | big_decimal | weight        | define.unlimited | number  |
  //
  // EXACTLY TEN, verified by reading L55-L64 individually. L54 is a blank line, so nothing
  // is hiding above L55.
  //
  // * THE THREE ABSENCE CONVENTIONS OF THIS FOLDER, STATED SIDE BY SIDE AND NEVER
  // COLLAPSED. They point in opposite directions, and each collapse is a money bug:
  //
  //   1. `Sku.getPriceByCurrencyCode()` must return `Money | undefined`, NEVER `0`
  //      [model/entity/Sku.cfc:L269-L273] - that accessor has no `else` and no fallback, so
  //      substituting `0` would silently sell products for free. Owned by sku.ts; it is the
  //      single highest-consequence parity check in the plan.
  //   2. `Product.getSalePrice()` must return `0`, NEVER `undefined` -
  //      [model/entity/Product.cfc:L598] omits a `return` and falls through to `return 0`.
  //      Owned by product.ts.
  //   3. PROMOTION USE-LIMITS AND GATE BOUNDS MUST STAY `undefined`, NEVER `0`, because
  //      `undefined` means UNLIMITED / NO BOUND - the PERMISSIVE extreme. THIS ENTITY IS
  //      CONVENTION #3'S CANONICAL HOME.
  //
  // * CONVENTION #3 IS MADE LITERAL IN THIS ENTITY'S METADATA, and the pairing is
  // systematic: EVERY `minimum*` carries `hb_nullRBKey="define.0"` and EVERY `maximum*`
  // carries `hb_nullRBKey="define.unlimited"`. There is NO `default=` attribute on any of
  // the ten, so the database stores NULL and the entity must surface `undefined`.
  //
  // THE CONSEQUENCE, SPELLED OUT: coalescing any `maximum*` gate to `0` would turn
  // "unlimited" into "nothing qualifies" and silently suppress every discount that gate
  // governs. Coalescing any `minimum*` gate to `0` is ALSO wrong - `hb_nullRBKey` is a
  // DISPLAY directive for the admin UI, not a storage default, and the promotion engine's
  // own `isNull()` tests are what decide whether a gate applies at all: every comparison at
  // [model/service/PromotionService.cfc:L769, L771] is guarded by `!isNull(...)` first, so
  // an absent gate imposes no constraint. Presence tests therefore use `isNullish`, and the
  // `??` operator is NEVER used to inject a numeric default for any of the ten.
  //
  // * AND NOTE: THIS ENTITY HAS NO `currencyCode` COLUMN. The four `Money` gates therefore
  // carry no currency of their own - they are compared against order and item amounts whose
  // currency is resolved elsewhere (Sku's four-step cascade, and the read-only order view).
  // Recorded so no one later "fixes" it by adding a currency column, which schema
  // continuity forbids.

  /**
   * [model/entity/PromotionQualifier.cfc:L55] `ormtype="integer" hb_nullRBKey="define.0"`.
   * `undefined` means NO MINIMUM.
   */
  private readonly minimumOrderQuantity: number | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L56]
   * `ormtype="integer" hb_nullRBKey="define.unlimited"`.
   * `undefined` means UNLIMITED - never `0`.
   */
  private readonly maximumOrderQuantity: number | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L57]: `ormtype="big_decimal"` with
   * `hb_formatType="currency"` and `hb_nullRBKey="define.0"`, so this gate is `Money` and
   * never a `number`. A `big_decimal` column compared against an order subtotal is currency
   * by both metadata and use, and all currency in the target flows through the single
   * arithmetic surface.
   */
  private readonly minimumOrderSubtotal: Money | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L58]: `ormtype="big_decimal"` with
   * `hb_formatType="currency"` and `hb_nullRBKey="define.unlimited"`. `Money`, and
   * `undefined` means UNLIMITED - coalescing this one to zero would disqualify every order.
   */
  private readonly maximumOrderSubtotal: Money | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L59] `ormtype="integer" hb_nullRBKey="define.0"`.
   */
  private readonly minimumItemQuantity: number | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L60]
   * `ormtype="integer" hb_nullRBKey="define.unlimited"`.
   */
  private readonly maximumItemQuantity: number | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L61]: `ormtype="big_decimal"` with
   * `hb_formatType="currency"` and `hb_nullRBKey="define.0"`. `Money`, compared against an
   * order item's price.
   */
  private readonly minimumItemPrice: Money | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L62]: `ormtype="big_decimal"` with
   * `hb_formatType="currency"` and `hb_nullRBKey="define.unlimited"`. `Money`, and
   * `undefined` means UNLIMITED.
   */
  private readonly maximumItemPrice: Money | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L63]: `ormtype="big_decimal"` with
   * `hb_formatType="weight"` and `hb_nullRBKey="define.0"` - MODELLED AS `number`, NOT AS
   * `Money`, AND THAT IS DELIBERATE.
   *
   * WEIGHT IS NOT CURRENCY. `Money` carries currency semantics and currency formatting, so
   * typing a shipping weight as `Money` would be a category error: it would assert a
   * currency this column does not have and would hand the value formatting it must never
   * receive. This is NOT a breach of the single-arithmetic-surface rule, which governs
   * MONEY - and weight is not money.
   *
   * There is no `Weight` value object in ../valueObjects/ (that folder holds exactly
   * money.ts, currencyCode.ts and materializedIdPath.ts) and none is created here.
   *
   * THIS ENTITY PERFORMS ZERO ARITHMETIC ON EITHER WEIGHT GATE. They are inert threshold
   * columns, read and compared by src/services/promotion/qualifierQualification.ts
   * (planned) against `orderFulfillment.getTotalShippingWeight()` at
   * [model/service/PromotionService.cfc:L769, L771], each behind a `!isNull(...)` guard. If
   * the service tier ever requires exact decimal comparison at that boundary it must
   * implement it there, at the point of comparison - not by re-typing an inert column here.
   */
  private readonly minimumFulfillmentWeight: number | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L64]: `ormtype="big_decimal"` with
   * `hb_formatType="weight"` and `hb_nullRBKey="define.unlimited"`. `number`, for the
   * reasons given on `minimumFulfillmentWeight`, and `undefined` means UNLIMITED.
   */
  private readonly maximumFulfillmentWeight: number | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L65]
   * `ormtype="string" hb_formatType="rbKey" hb_formFieldType="select"`.
   *
   * Narrowed to {@link RewardMatchingType} because L107-L115 declares the vocabulary on the
   * entity itself and `hb_formFieldType="select"` makes that option list the admin form's
   * domain. Nullable, because the column has no `notnull` and no `default`.
   */
  private readonly rewardMatchingType: RewardMatchingType | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L68]
   * `cfc="PromotionPeriod" fieldtype="many-to-one" fkcolumn="promotionPeriodID"`
   *
   * The ONE many-to-one on this entity, and `PromotionPeriod` is one of the eighteen
   * in-scope entities, so this is a real materialized association rather than an opaque
   * identifier.
   *
   * NOT `readonly`: `setPromotionPeriod()` [L122] assigns it and
   * `removePromotionPeriod()` [L128] clears it.
   *
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L68]: THE DECLARATION CARRIES NO
   * `fetch="join"`, NO `lazy=` AND NO `hb_cascadeCalculate`. Recorded because it confirms
   * the project-wide eager-fetch census stays at exactly four sites - `Product.brand`
   * [model/entity/Product.cfc:L68], `Product.productType` [L69], `Product.defaultSku` [L70]
   * and `PromotionPeriod.promotion` [model/entity/PromotionPeriod.cfc:L59] - and THIS FILE
   * ADDS NO FIFTH.
   *
   * It is also NULLABLE, because L68 declares no `notnull`. That nullability is
   * load-bearing rather than incidental: it is what makes `isDeletable()` [L359-L361] a
   * preserved runtime failure rather than a total function.
   */
  private promotionPeriod: PromotionPeriod | undefined;

  // LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L70-L71]: THE
  // `// Related Entities (one-to-many)` BANNER IS PRESENT WITH NOTHING UNDER IT. Recorded as
  // a cosmetic structural fact with a real consequence: THIS ENTITY OWNS NO ONE-TO-MANY
  // COLLECTIONS AT ALL. Every collection below is many-to-many.

  // --- THE THIRTEEN MANY-TO-MANY COLLECTIONS [L73-L87] --------------------------------
  //
  // EXACTLY THIRTEEN, in the source's own three groups, which are separated by blank lines
  // at L76 and L82 and are semantically meaningful. Every one declares
  // `fkcolumn="promotionQualifierID"`, and every `linktable` and `inversejoincolumn` name is
  // reproduced verbatim because those names ARE the schema contract.
  //
  //   GROUP A - fulfillment/shipping (3). ALL THREE FAR SIDES ARE OUT OF SCOPE.
  //   | locator | property             | singularname        | cfc               | linktable                    | inversejoincolumn   |
  //   |---------|----------------------|---------------------|-------------------|------------------------------|---------------------|
  //   | L73     | fulfillmentMethods   | fulfillmentMethod   | FulfillmentMethod | SwPromoQualFulfillmentMethod | fulfillmentMethodID |
  //   | L74     | shippingMethods      | shippingMethod      | ShippingMethod    | SwPromoQualShippingMethod    | shippingMethodID    |
  //   | L75     | shippingAddressZones | shippingAddressZone | AddressZone       | SwPromoQualShipAddressZone   | addressZoneID       |
  //
  //   GROUP B - INCLUDE lists (5). ALL FIVE FAR SIDES ARE IN SCOPE.
  //   | locator | property     | singularname | cfc         | linktable              | inversejoincolumn |
  //   |---------|--------------|--------------|-------------|------------------------|-------------------|
  //   | L77     | brands       | brand        | Brand       | SwPromoQualBrand       | brandID           |
  //   | L78     | options      | option       | Option      | SwPromoQualOption      | optionID          |
  //   | L79     | skus         | sku          | Sku         | SwPromoQualSku         | skuID             |
  //   | L80     | products     | product      | Product     | SwPromoQualProduct     | productID         |
  //   | L81     | productTypes | productType  | ProductType | SwPromoQualProductType | productTypeID     |
  //
  //   GROUP C - EXCLUDE lists (5). ALL FIVE FAR SIDES ARE IN SCOPE.
  //   | locator | property             | singularname        | cfc         | type=   | linktable                  | inversejoincolumn |
  //   |---------|----------------------|---------------------|-------------|---------|----------------------------|-------------------|
  //   | L83     | excludedBrands       | excludedBrand       | Brand       | array   | SwPromoQualExclBrand       | brandID           |
  //   | L84     | excludedOptions      | excludedOption      | Option      | array   | SwPromoQualExclOption      | optionID          |
  //   | L85     | excludedSkus         | excludedSku         | Sku         | -       | SwPromoQualExclSku         | skuID             |
  //   | L86     | excludedProducts     | excludedProduct     | Product     | -       | SwPromoQualExclProduct     | productID         |
  //   | L87     | excludedProductTypes | excludedProductType | ProductType | -       | SwPromoQualExclProductType | productTypeID     |
  //
  // 3 + 5 + 5 = 13.
  //
  // LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L83-L84]: A METADATA INCONSISTENCY,
  // ANNOTATED RATHER THAN NORMALISED. `type="array"` appears on ONLY 2 OF THE 13 -
  // `excludedBrands` [L83] and `excludedOptions` [L84] - and is omitted on the other eleven.
  // This is cosmetically identical to the `attributeValues` inconsistency (declared on Sku
  // and Brand, omitted on Product and ProductType) and is harmless in CFML: all thirteen
  // behave identically as arrays. The attribute is NOT added to the other eleven and the two
  // are NOT stripped - the target simply types all thirteen as arrays, which is what the
  // legacy runtime does.
  //
  // * FIVE DISTINCT EMPTY-COLLECTION SEMANTICS EXIST IN THIS SLICE. COLLAPSING ANY OF THEM
  // IS A MONEY BUG, so all five are recorded here and the polarity flip is the crux:
  //
  //   1. PERMISSIVE IN THE CALLER'S LOOP - an empty `addressZones` collection on a REWARD
  //      means NO RESTRICTION.
  //   2. RESTRICTIVE IN THE EVALUATOR - an empty `locations` collection on an ADDRESS ZONE
  //      means NOT IN ZONE.
  //   3. `hasAnyInProperty` [org/Hibachi/HibachiEntity.cfc:L340-L350] returns `false` for an
  //      empty `entityArray`, AND THAT SAME `false` MEANS OPPOSITE THINGS DEPENDING ON
  //      POLARITY: PERMISSIVE on an EXCLUDE list (nothing is excluded, so the item still
  //      qualifies) and RESTRICTIVE on an INCLUDE list (nothing is included, so the item
  //      does not qualify). THIS IS THE CONVENTION THAT GOVERNS GROUPS B AND C DIRECTLY, and
  //      the two must NEVER be normalised into one another.
  //   4. THE FULFILLMENT THREE-WAY GATE [model/service/PromotionService.cfc:L333-L420] - an
  //      empty collection means NO RESTRICTION, with a single-promotion-per-fulfillment `[1]`
  //      assumption.
  //   5. `Brand.getProducts()` must default to `[]` - asserted by the one legacy entity test
  //      that touches this slice.
  //
  // * THE TEN IN-SCOPE COLLECTION ACCESSORS RETURN THE LIVE ARRAY REFERENCE, NEVER A
  // DEFENSIVE COPY. Every one of the ten `add*` methods mutates its own collection AND the
  // far side's via `arrayAppend(arguments.X.getPromotionQualifiers(), this)`, and every one
  // of the ten `remove*` methods mutates both sides via `arrayDeleteAt`. A defensive copy on
  // either side would make the far-side half of all twenty helpers a silent no-op and break
  // bidirectional synchronisation across the aggregate. The same structural ruling already
  // ships in src/domain/entities/promotion.ts and in
  // src/domain/entities/promotionPeriod.ts - whose `getPromotionQualifiers()` this class
  // pushes into, and which is therefore mutable by necessity. Note the contrast with
  // src/domain/entities/promotionReward.ts, which types its owner-side accessors `readonly`;
  // the mutable form is used here because the repository layer populates these arrays in
  // place and because the aggregate's symmetry is what the eleven helper pairs rely on.

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L73]: THE OUT-OF-SCOPE FAR SIDE IS
   * COLLAPSED TO OPAQUE IDENTIFIERS. The legacy `fulfillmentMethods` collection targets
   * `cfc="FulfillmentMethod"` through link table `SwPromoQualFulfillmentMethod`
   * (`inversejoincolumn="fulfillmentMethodID"`), and the entire checkout / cart / payment /
   * shipping / fulfillment pipeline is out of scope. Neither a `FulfillmentMethod` module
   * nor a `getFulfillmentMethods()` entity-array accessor is authored: the ASSOCIATION is
   * part of `SwPromoQual`'s persisted contract, so it survives as a list of opaque string
   * identifiers, while the far-side ENTITY does not enter the domain. This is the same
   * anti-corruption treatment src/domain/entities/promotionApplied.ts applies to its order,
   * orderItem and orderFulfillment foreign keys.
   */
  private readonly fulfillmentMethodIDs: readonly string[];

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L74]: as above. Legacy member
   * `shippingMethods`, `cfc="ShippingMethod"`, link table `SwPromoQualShippingMethod`,
   * `inversejoincolumn="shippingMethodID"`. Out-of-scope subsystem; the schema contract is
   * preserved as opaque identifiers and no `getShippingMethods()` entity-array accessor is
   * authored.
   */
  private readonly shippingMethodIDs: readonly string[];

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L75]: as above. Legacy member
   * `shippingAddressZones`, `cfc="AddressZone"`, link table `SwPromoQualShipAddressZone`,
   * `inversejoincolumn="addressZoneID"`. `AddressZone` is reachable in this slice ONLY
   * through the narrow `addressZoneEvaluator` port (`isAddressInZone` alone, from
   * [model/service/AddressService.cfc:L57]), so it is emphatically not an entity of this
   * domain; the schema contract is preserved as opaque identifiers.
   */
  private readonly shippingAddressZoneIDs: readonly string[];

  // * A STRUCTURAL FINDING THAT INDEPENDENTLY JUSTIFIES THE GROUP A COLLAPSE, AND IT IS THE
  // STRONGEST ARGUMENT FOR IT: THE SOURCE DECLARES ELEVEN `remove*` HELPERS FOR FOURTEEN
  // RELATIONSHIPS, and the three without any helper at all are EXACTLY Group A.
  // `fulfillmentMethods` [L73], `shippingMethods` [L74] and `shippingAddressZones` [L75]
  // have NO `add*` and NO `remove*` member anywhere in the component - verified by reading
  // all of L119-L339, which contains the eleven pairs and nothing else. They rely entirely
  // on the framework's generated accessors, SO THERE IS NO HAND-WRITTEN BEHAVIOUR TO
  // PRESERVE FOR THEM, which makes the identifier collapse lossless with respect to authored
  // logic.
  //
  // THE FAR-SIDE CONTRACT, PUBLISHED HERE FOR THE UNWRITTEN CONSUMER:
  // src/services/promotion/qualifierQualification.ts (planned) evaluates the
  // fulfillment-method, shipping-method and shipping-address-zone gates
  // [model/service/PromotionService.cfc:L699, L701, L703] and MUST do so against these
  // opaque identifier lists, resolving zone semantics only through the `addressZoneEvaluator`
  // port.
  //
  // LEGACY-DEFECT [model/service/PromotionService.cfc:L703]: the shipping-address-zones
  // clause re-tests `hasShippingMethod` instead of testing the zone condition, so
  // `shippingAddressZones` is effectively never evaluated as a zone gate.
  // Preserved deliberately; do not fix without a product decision. It is owned by
  // src/services, NOT by this file, and no compensation for it is attempted here - it is
  // named only so a reader of this file is not misled into thinking the collection is
  // consulted as intended.

  /**
   * [model/entity/PromotionQualifier.cfc:L77] INCLUDE list. `singularname="brand"`,
   * link table `SwPromoQualBrand`, `inversejoincolumn="brandID"`.
   */
  private readonly brands: Brand[];

  /**
   * [model/entity/PromotionQualifier.cfc:L78] INCLUDE list. `singularname="option"`,
   * link table `SwPromoQualOption`, `inversejoincolumn="optionID"`. Read by
   * `hasAnyOption()` at [model/service/PromotionService.cfc:L885].
   */
  private readonly options: Option[];

  /**
   * [model/entity/PromotionQualifier.cfc:L79] INCLUDE list. `singularname="sku"`,
   * link table `SwPromoQualSku`, `inversejoincolumn="skuID"`.
   */
  private readonly skus: Sku[];

  /**
   * [model/entity/PromotionQualifier.cfc:L80] INCLUDE list. `singularname="product"`,
   * link table `SwPromoQualProduct`, `inversejoincolumn="productID"`.
   */
  private readonly products: Product[];

  /**
   * [model/entity/PromotionQualifier.cfc:L81] INCLUDE list. `singularname="productType"`,
   * link table `SwPromoQualProductType`, `inversejoincolumn="productTypeID"`. The membership
   * test for this collection walks `productTypeIDPath`
   * [model/service/PromotionService.cfc:L858-L870], and that walk lives in
   * src/services/promotion/orderItemMembership.ts (planned) rather than here.
   */
  private readonly productTypes: ProductType[];

  /**
   * [model/entity/PromotionQualifier.cfc:L83] EXCLUDE list. `singularname="excludedBrand"`,
   * `type="array"`, link table `SwPromoQualExclBrand`, `inversejoincolumn="brandID"`.
   */
  private readonly excludedBrands: Brand[];

  /**
   * [model/entity/PromotionQualifier.cfc:L84] EXCLUDE list. `singularname="excludedOption"`,
   * `type="array"`, link table `SwPromoQualExclOption`, `inversejoincolumn="optionID"`. Read
   * by `hasAnyExcludedOption()` at [model/service/PromotionService.cfc:L914].
   */
  private readonly excludedOptions: Option[];

  /**
   * [model/entity/PromotionQualifier.cfc:L85] EXCLUDE list. `singularname="excludedSku"`,
   * link table `SwPromoQualExclSku`, `inversejoincolumn="skuID"`.
   */
  private readonly excludedSkus: Sku[];

  /**
   * [model/entity/PromotionQualifier.cfc:L86] EXCLUDE list.
   * `singularname="excludedProduct"`, link table `SwPromoQualExclProduct`,
   * `inversejoincolumn="productID"`.
   */
  private readonly excludedProducts: Product[];

  /**
   * [model/entity/PromotionQualifier.cfc:L87] EXCLUDE list.
   * `singularname="excludedProductType"`, link table `SwPromoQualExclProductType`,
   * `inversejoincolumn="productTypeID"`.
   */
  private readonly excludedProductTypes: ProductType[];

  /**
   * [model/entity/PromotionQualifier.cfc:L90] `ormtype="string"`, under the
   * `// Remote Properties` banner at L89. An inert integration identifier; nothing in the
   * in-scope slice reads it, and it is carried because the column exists.
   */
  private readonly remoteID: string | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L93]
   * `hb_populateEnabled="false" ormtype="timestamp"`.
   *
   * `hb_populateEnabled="false"` is an inert fact here: it tells the legacy framework not to
   * populate the column from request data. Audit-column MAINTENANCE belongs to
   * src/repositories/mysql/** and is not performed by this entity.
   */
  private readonly createdDateTime: Date | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L94]: the declaration is
   * `hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one"
   * fkcolumn="createdByAccountID"`, and `Account` IS OUT OF SCOPE, so the association
   * COLLAPSES to the inert foreign-key column itself. No `Account` type is imported and no
   * `getCreatedByAccount()` entity accessor is authored - the identical treatment applied in
   * all the already-shipped entity files, where Account, Order, OrderItem,
   * OrderFulfillment, Image and Site all collapse the same way.
   */
  private readonly createdByAccountID: string | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L95]
   * `hb_populateEnabled="false" ormtype="timestamp"`.
   */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L96]: `hb_populateEnabled="false"
   * cfc="Account" fieldtype="many-to-one" fkcolumn="modifiedByAccountID"`. Collapsed to the
   * inert foreign-key column for the same reason as `createdByAccountID`.
   */
  private readonly modifiedByAccountID: string | undefined;

  // LEGACY-DEFECT [model/entity/PromotionQualifier.cfc:L99,L107]: A DOUBLE ORPHAN, and both
  // halves are reproduced exactly as the source has them.
  //   * L99 declares `property name="qualifierApplicationTypeOptions" type="array"
  //     persistent="false"` - the ONLY non-persistent property in the whole component - and
  //     there is NO `getQualifierApplicationTypeOptions()` method anywhere in the file and no
  //     reference to the property at all. It is a DEAD DECLARED PROPERTY, structurally
  //     identical to the never-read `qualifiedFulfillments` key at
  //     [model/service/PromotionService.cfc:L621-L623] and to
  //     model/validation/PriceGroupRate.json's declared-but-never-referenced `isNotGlobal`
  //     condition.
  //   * L107 is the mirror image: `getRewardMatchingTypeOptions()` exists as a METHOD with
  //     NO matching declared non-persistent property. The explicit method shadows the
  //     framework's `get*Options` dispatch branch, so it works, but the property metadata is
  //     missing.
  // Preserved deliberately; do not fix without a product decision. Neither
  // `getQualifierApplicationTypeOptions()` nor a `rewardMatchingTypeOptions` property is
  // authored: reproducing the source's exact member set is faithful reproduction, not
  // repair, and it costs no divergence.

  // ============  END:  Persistent Properties ===========================

  /**
   * Constructs a qualifier from a repository row plus its materialized associations.
   *
   * A SINGLE PARAMETER OBJECT, matching the convention of the already-shipped sibling
   * entities: every column is a named member, every optional column is `?: T | undefined`
   * so that `exactOptionalPropertyTypes` keeps "key absent" and "key present and undefined"
   * both expressible, and every collection defaults to `[]` rather than to `undefined`.
   *
   * NO PORT IS INJECTED, and the constructor takes DATA ONLY. A full read of all 373 source
   * lines finds zero `getService(` sites on this component, so there is no collaborator to
   * inject and nothing here can reach outward.
   *
   * WHAT THE REPOSITORY LAYER OWNS, stated so it is not re-implemented here:
   * src/repositories/mysql/mysqlPromotionRepository.ts owns row-to-entity hydration from
   * `SwPromoQual`, materializing the ten in-scope collections from their link tables,
   * populating the three opaque identifier lists from `SwPromoQualFulfillmentMethod`,
   * `SwPromoQualShippingMethod` and `SwPromoQualShipAddressZone`, audit-column maintenance,
   * and documenting the fetch shape at the producing method. As context only, and owned by
   * src/services rather than by this file: `getActivePromotionRewards`
   * [model/dao/PromotionDAO.cfc:L51] has NO `ORDER BY`, which is what makes reward iteration
   * order non-deterministic. None of that is implemented here.
   */
  constructor(init: {
    readonly promotionQualifierID: string;
    readonly qualifierType?: string | undefined;
    readonly minimumOrderQuantity?: number | undefined;
    readonly maximumOrderQuantity?: number | undefined;
    readonly minimumOrderSubtotal?: Money | undefined;
    readonly maximumOrderSubtotal?: Money | undefined;
    readonly minimumItemQuantity?: number | undefined;
    readonly maximumItemQuantity?: number | undefined;
    readonly minimumItemPrice?: Money | undefined;
    readonly maximumItemPrice?: Money | undefined;
    readonly minimumFulfillmentWeight?: number | undefined;
    readonly maximumFulfillmentWeight?: number | undefined;
    readonly rewardMatchingType?: RewardMatchingType | undefined;
    readonly promotionPeriod?: PromotionPeriod | undefined;
    readonly fulfillmentMethodIDs?: readonly string[] | undefined;
    readonly shippingMethodIDs?: readonly string[] | undefined;
    readonly shippingAddressZoneIDs?: readonly string[] | undefined;
    readonly brands?: Brand[] | undefined;
    readonly options?: Option[] | undefined;
    readonly skus?: Sku[] | undefined;
    readonly products?: Product[] | undefined;
    readonly productTypes?: ProductType[] | undefined;
    readonly excludedBrands?: Brand[] | undefined;
    readonly excludedOptions?: Option[] | undefined;
    readonly excludedSkus?: Sku[] | undefined;
    readonly excludedProducts?: Product[] | undefined;
    readonly excludedProductTypes?: ProductType[] | undefined;
    readonly remoteID?: string | undefined;
    readonly createdDateTime?: Date | undefined;
    readonly createdByAccountID?: string | undefined;
    readonly modifiedDateTime?: Date | undefined;
    readonly modifiedByAccountID?: string | undefined;
  }) {
    this.promotionQualifierID = init.promotionQualifierID;
    this.qualifierType = init.qualifierType;

    // THE TEN GATES ARE ASSIGNED THROUGH, NEVER DEFAULTED. No `??` appears on any of the ten
    // lines below, deliberately: `undefined` IS the value that means "no bound", and
    // injecting `0` for a maximum would turn "unlimited" into "nothing qualifies".
    this.minimumOrderQuantity = init.minimumOrderQuantity;
    this.maximumOrderQuantity = init.maximumOrderQuantity;
    this.minimumOrderSubtotal = init.minimumOrderSubtotal;
    this.maximumOrderSubtotal = init.maximumOrderSubtotal;
    this.minimumItemQuantity = init.minimumItemQuantity;
    this.maximumItemQuantity = init.maximumItemQuantity;
    this.minimumItemPrice = init.minimumItemPrice;
    this.maximumItemPrice = init.maximumItemPrice;
    this.minimumFulfillmentWeight = init.minimumFulfillmentWeight;
    this.maximumFulfillmentWeight = init.maximumFulfillmentWeight;

    this.rewardMatchingType = init.rewardMatchingType;
    this.promotionPeriod = init.promotionPeriod;

    this.fulfillmentMethodIDs = init.fulfillmentMethodIDs ?? [];
    this.shippingMethodIDs = init.shippingMethodIDs ?? [];
    this.shippingAddressZoneIDs = init.shippingAddressZoneIDs ?? [];

    // The ten in-scope collections are ADOPTED BY REFERENCE rather than copied, which is
    // what keeps the accessors below live for the bidirectional helpers.
    this.brands = init.brands ?? [];
    this.options = init.options ?? [];
    this.skus = init.skus ?? [];
    this.products = init.products ?? [];
    this.productTypes = init.productTypes ?? [];
    this.excludedBrands = init.excludedBrands ?? [];
    this.excludedOptions = init.excludedOptions ?? [];
    this.excludedSkus = init.excludedSkus ?? [];
    this.excludedProducts = init.excludedProducts ?? [];
    this.excludedProductTypes = init.excludedProductTypes ?? [];

    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
  }

  // ============ START: Column Accessors ================================
  // The ORM-generated `get<Property>()` surface, authored explicitly. TypeScript does not
  // emulate dynamic dispatch: there is no `Proxy`, no index signature and no string-keyed
  // method lookup anywhere in this file.

  /** [model/entity/PromotionQualifier.cfc:L52] */
  getPromotionQualifierID(): string {
    return this.promotionQualifierID;
  }

  /** [model/entity/PromotionQualifier.cfc:L53] `undefined` when the column is NULL. */
  getQualifierType(): string | undefined {
    return this.qualifierType;
  }

  /** [model/entity/PromotionQualifier.cfc:L55] `undefined` means NO MINIMUM, never `0`. */
  getMinimumOrderQuantity(): number | undefined {
    return this.minimumOrderQuantity;
  }

  /** [model/entity/PromotionQualifier.cfc:L56] `undefined` means UNLIMITED, never `0`. */
  getMaximumOrderQuantity(): number | undefined {
    return this.maximumOrderQuantity;
  }

  /** [model/entity/PromotionQualifier.cfc:L57] `undefined` means NO MINIMUM. */
  getMinimumOrderSubtotal(): Money | undefined {
    return this.minimumOrderSubtotal;
  }

  /** [model/entity/PromotionQualifier.cfc:L58] `undefined` means UNLIMITED. */
  getMaximumOrderSubtotal(): Money | undefined {
    return this.maximumOrderSubtotal;
  }

  /** [model/entity/PromotionQualifier.cfc:L59] `undefined` means NO MINIMUM. */
  getMinimumItemQuantity(): number | undefined {
    return this.minimumItemQuantity;
  }

  /** [model/entity/PromotionQualifier.cfc:L60] `undefined` means UNLIMITED. */
  getMaximumItemQuantity(): number | undefined {
    return this.maximumItemQuantity;
  }

  /** [model/entity/PromotionQualifier.cfc:L61] `undefined` means NO MINIMUM. */
  getMinimumItemPrice(): Money | undefined {
    return this.minimumItemPrice;
  }

  /** [model/entity/PromotionQualifier.cfc:L62] `undefined` means UNLIMITED. */
  getMaximumItemPrice(): Money | undefined {
    return this.maximumItemPrice;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L63] `hb_formatType="weight"`, so a `number` and
   * not `Money`. `undefined` means NO MINIMUM.
   */
  getMinimumFulfillmentWeight(): number | undefined {
    return this.minimumFulfillmentWeight;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L64] `hb_formatType="weight"`, so a `number` and
   * not `Money`. `undefined` means UNLIMITED.
   */
  getMaximumFulfillmentWeight(): number | undefined {
    return this.maximumFulfillmentWeight;
  }

  /** [model/entity/PromotionQualifier.cfc:L65] one of the five {@link RewardMatchingType}. */
  getRewardMatchingType(): RewardMatchingType | undefined {
    return this.rewardMatchingType;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L68] the one many-to-one.
   *
   * `undefined` when the nullable `promotionPeriodID` foreign key is unset or when
   * `removePromotionPeriod()` has cleared it. Callers must handle that: `isDeletable()`
   * below dereferences it WITHOUT a guard, exactly as the source does.
   */
  getPromotionPeriod(): PromotionPeriod | undefined {
    return this.promotionPeriod;
  }

  /** [model/entity/PromotionQualifier.cfc:L90] */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [model/entity/PromotionQualifier.cfc:L93] `hb_populateEnabled="false"`. */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L94] the inert `createdByAccountID` column;
   * `Account` is out of scope, so no entity is returned.
   */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/PromotionQualifier.cfc:L95] `hb_populateEnabled="false"`. */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L96] the inert `modifiedByAccountID` column;
   * `Account` is out of scope, so no entity is returned.
   */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // ============  END:  Column Accessors ================================

  // ============ START: Association Accessors ===========================

  /**
   * [model/entity/PromotionQualifier.cfc:L73] the opaque identifiers behind
   * `SwPromoQualFulfillmentMethod`. `readonly string[]` because the far-side entity is out of
   * scope and nothing in the domain may reconstruct it; empty by default.
   */
  getFulfillmentMethodIDs(): readonly string[] {
    return this.fulfillmentMethodIDs;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L74] the opaque identifiers behind
   * `SwPromoQualShippingMethod`; empty by default.
   */
  getShippingMethodIDs(): readonly string[] {
    return this.shippingMethodIDs;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L75] the opaque identifiers behind
   * `SwPromoQualShipAddressZone`; empty by default. Zone semantics are resolved only through
   * the `addressZoneEvaluator` port, at the service tier.
   */
  getShippingAddressZoneIDs(): readonly string[] {
    return this.shippingAddressZoneIDs;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L77] the LIVE include list. Mutating the returned
   * array is observable on this entity, and that is required rather than tolerated - see the
   * live-reference ruling above the collection group.
   */
  getBrands(): Brand[] {
    return this.brands;
  }

  /** [model/entity/PromotionQualifier.cfc:L78] the LIVE include list. */
  getOptions(): Option[] {
    return this.options;
  }

  /** [model/entity/PromotionQualifier.cfc:L79] the LIVE include list. */
  getSkus(): Sku[] {
    return this.skus;
  }

  /** [model/entity/PromotionQualifier.cfc:L80] the LIVE include list. */
  getProducts(): Product[] {
    return this.products;
  }

  /** [model/entity/PromotionQualifier.cfc:L81] the LIVE include list. */
  getProductTypes(): ProductType[] {
    return this.productTypes;
  }

  /** [model/entity/PromotionQualifier.cfc:L83] the LIVE exclude list. */
  getExcludedBrands(): Brand[] {
    return this.excludedBrands;
  }

  /** [model/entity/PromotionQualifier.cfc:L84] the LIVE exclude list. */
  getExcludedOptions(): Option[] {
    return this.excludedOptions;
  }

  /** [model/entity/PromotionQualifier.cfc:L85] the LIVE exclude list. */
  getExcludedSkus(): Sku[] {
    return this.excludedSkus;
  }

  /** [model/entity/PromotionQualifier.cfc:L86] the LIVE exclude list. */
  getExcludedProducts(): Product[] {
    return this.excludedProducts;
  }

  /** [model/entity/PromotionQualifier.cfc:L87] the LIVE exclude list. */
  getExcludedProductTypes(): ProductType[] {
    return this.excludedProductTypes;
  }

  // ============  END:  Association Accessors ===========================

  // ============ START: Framework-Implicit Members =======================
  //
  // `org/Hibachi/HibachiEntity.cfc:L507-L565` dynamically dispatches eleven method-name
  // patterns - `hasUniqueOrNull*`, `hasUnique*`, `hasAny*`, `get*AssignedIDList`, `get*ID`,
  // `get*Options`, `get*OptionsSmartList`, `get*SmartList`, `get*Struct`, `get*Count`, plus a
  // `getAttributeValue` fallback - and terminates in a THROW at L565 when nothing matches.
  //
  // TYPESCRIPT DOES NOT EMULATE DYNAMIC DISPATCH. Only the CONCRETELY-CALLED patterns are
  // generated below, each as an explicitly-typed method annotated with the branch it
  // replaces. No `Proxy`, no index signature, no string-keyed lookup, and no smart-list
  // member - `get*SmartList` is a Hibachi artifact replaced project-wide by typed repository
  // queries. There is likewise no `attributeValues` member and no EAV accessor: this entity
  // declares zero `attributeValues` (the census finds exactly four declarations project-wide,
  // on Sku, Product, ProductType and Brand) and the EAV path is not ported.
  //
  // * THE ENTITY-COMPARISON RULE FOR EVERY PREDICATE BELOW. Hibernate's implicit
  // collection-contains resolves through SESSION IDENTITY, which for a persisted row is its
  // PRIMARY KEY - so these compare BY PRIMARY KEY, never by deep equality. The one nuance is
  // an UNSAVED candidate: `unsavedvalue=""` [L52 here, and the equivalent on every far side]
  // means every transient instance shares the empty-string key, so a key comparison would
  // report any transient as present as soon as one transient were held. For that case alone
  // the comparison falls back to REFERENCE identity, which is what the Hibernate session does
  // for a transient instance. This is the project-wide rule honoured by the already-shipped
  // entity files.

  /**
   * `isNew` - whether this qualifier has never been persisted.
   *
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L52]: `isNew()` IS NOT DECLARED IN THIS
   * COMPONENT - it is inherited from the Hibachi base and is called in every `add*` guard
   * [L141, L161, L181, L201, L221, L241, L261, L281, L301, L321] and in
   * `setPromotionPeriod()` [L124]. It is authored explicitly here from the unsaved-value
   * contract on L52: `unsavedvalue=""` together with `default=""` makes an unsaved row's key
   * the empty string. The shape below - a bare comparison against `''` - is the convention
   * already shipped verbatim by promotionPeriod.ts, promotionCode.ts, priceGroupRate.ts,
   * promotionReward.ts, promotionApplied.ts and brand.ts; consistency across the eighteen
   * outranks any local preference, so no divergent convention is invented here.
   */
  isNew(): boolean {
    return this.promotionQualifierID === '';
  }

  /**
   * `hasBrand` - is this brand already in the INCLUDE list?
   *
   * Framework-generated by [org/Hibachi/HibachiEntity.cfc:L507-L565]; not declared in the
   * source. Guards the near-side append of `addBrand()`
   * [model/entity/PromotionQualifier.cfc:L141]. Tests `brands` [L77] on `brandID`, and
   * answers `false` for an empty collection.
   */
  hasBrand(brand: Brand): boolean {
    return (
      PromotionQualifier.indexOfEntity(this.brands, brand, (held: Brand) => held.getBrandID()) !==
      -1
    );
  }

  /**
   * `hasExcludedBrand` - is this brand already in the EXCLUDE list?
   *
   * Framework-generated by [org/Hibachi/HibachiEntity.cfc:L507-L565]. Guards
   * `addExcludedBrand()` [model/entity/PromotionQualifier.cfc:L241]. Tests `excludedBrands`
   * [L83] on `brandID`, and answers `false` for an empty collection.
   */
  hasExcludedBrand(brand: Brand): boolean {
    return (
      PromotionQualifier.indexOfEntity(this.excludedBrands, brand, (held: Brand) =>
        held.getBrandID(),
      ) !== -1
    );
  }

  /**
   * `hasOption` - is this option already in the INCLUDE list?
   *
   * Framework-generated by [org/Hibachi/HibachiEntity.cfc:L507-L565]. Guards `addOption()`
   * [model/entity/PromotionQualifier.cfc:L161]. Tests `options` [L78] on `optionID`, and
   * answers `false` for an empty collection.
   */
  hasOption(option: Option): boolean {
    return (
      PromotionQualifier.indexOfEntity(this.options, option, (held: Option) =>
        held.getOptionID(),
      ) !== -1
    );
  }

  /**
   * `hasExcludedOption` - is this option already in the EXCLUDE list?
   *
   * Framework-generated by [org/Hibachi/HibachiEntity.cfc:L507-L565]. Guards
   * `addExcludedOption()` [model/entity/PromotionQualifier.cfc:L261]. Tests `excludedOptions`
   * [L84] on `optionID`, and answers `false` for an empty collection.
   */
  hasExcludedOption(option: Option): boolean {
    return (
      PromotionQualifier.indexOfEntity(this.excludedOptions, option, (held: Option) =>
        held.getOptionID(),
      ) !== -1
    );
  }

  /**
   * `hasSku` - is this SKU already in the INCLUDE list?
   *
   * Framework-generated by [org/Hibachi/HibachiEntity.cfc:L507-L565]. Guards `addSku()`
   * [model/entity/PromotionQualifier.cfc:L181]. Tests `skus` [L79] on `skuID`, and answers
   * `false` for an empty collection.
   */
  hasSku(sku: Sku): boolean {
    return PromotionQualifier.indexOfEntity(this.skus, sku, (held: Sku) => held.getSkuID()) !== -1;
  }

  /**
   * `hasExcludedSku` - is this SKU already in the EXCLUDE list?
   *
   * Framework-generated by [org/Hibachi/HibachiEntity.cfc:L507-L565]. Guards
   * `addExcludedSku()` [model/entity/PromotionQualifier.cfc:L281]. Tests `excludedSkus` [L85]
   * on `skuID`, and answers `false` for an empty collection.
   */
  hasExcludedSku(sku: Sku): boolean {
    return (
      PromotionQualifier.indexOfEntity(this.excludedSkus, sku, (held: Sku) => held.getSkuID()) !==
      -1
    );
  }

  /**
   * `hasProduct` - is this product already in the INCLUDE list?
   *
   * Framework-generated by [org/Hibachi/HibachiEntity.cfc:L507-L565]. Guards `addProduct()`
   * [model/entity/PromotionQualifier.cfc:L201]. Tests `products` [L80] on `productID`, and
   * answers `false` for an empty collection.
   */
  hasProduct(product: Product): boolean {
    return (
      PromotionQualifier.indexOfEntity(this.products, product, (held: Product) =>
        held.getProductID(),
      ) !== -1
    );
  }

  /**
   * `hasExcludedProduct` - is this product already in the EXCLUDE list?
   *
   * Framework-generated by [org/Hibachi/HibachiEntity.cfc:L507-L565]. Guards
   * `addExcludedProduct()` [model/entity/PromotionQualifier.cfc:L301]. Tests
   * `excludedProducts` [L86] on `productID`, and answers `false` for an empty collection.
   */
  hasExcludedProduct(product: Product): boolean {
    return (
      PromotionQualifier.indexOfEntity(this.excludedProducts, product, (held: Product) =>
        held.getProductID(),
      ) !== -1
    );
  }

  /**
   * `hasProductType` - is this product type already in the INCLUDE list?
   *
   * Framework-generated by [org/Hibachi/HibachiEntity.cfc:L507-L565]. Guards
   * `addProductType()` [model/entity/PromotionQualifier.cfc:L221]. Tests `productTypes` [L81]
   * on `productTypeID`, and answers `false` for an empty collection.
   *
   * NOTE the boundary this method does NOT cross: membership of an ORDER ITEM in this
   * collection is decided by walking `productTypeIDPath`
   * [model/service/PromotionService.cfc:L858-L870], and that walk belongs to
   * src/services/promotion/orderItemMembership.ts (planned). This method answers only the
   * direct-containment question the `add*` guard asks.
   */
  hasProductType(productType: ProductType): boolean {
    return (
      PromotionQualifier.indexOfEntity(this.productTypes, productType, (held: ProductType) =>
        held.getProductTypeID(),
      ) !== -1
    );
  }

  /**
   * `hasExcludedProductType` - is this product type already in the EXCLUDE list?
   *
   * Framework-generated by [org/Hibachi/HibachiEntity.cfc:L507-L565]. Guards
   * `addExcludedProductType()` [model/entity/PromotionQualifier.cfc:L321]. Tests
   * `excludedProductTypes` [L87] on `productTypeID`, and answers `false` for an empty
   * collection.
   */
  hasExcludedProductType(productType: ProductType): boolean {
    return (
      PromotionQualifier.indexOfEntity(
        this.excludedProductTypes,
        productType,
        (held: ProductType) => held.getProductTypeID(),
      ) !== -1
    );
  }

  /**
   * `hasAnyOption` - does ANY option in the supplied array appear in the INCLUDE list?
   *
   * Dispatched by [org/Hibachi/HibachiEntity.cfc:L517-L519], implemented by
   * `hasAnyInProperty` at [org/Hibachi/HibachiEntity.cfc:L340-L350].
   *
   * CALL SITE: [model/service/PromotionService.cfc:L885], inside `getOrderItemInQualifier()`,
   * passing the order item's SKU options - `Sku.options`
   * [model/entity/Sku.cfc:L76, many-to-many owner, link table `SwSkuOption`,
   * `fkcolumn="skuID"`, `inversejoincolumn="optionID"`]. The reward-side equivalents at
   * [model/service/PromotionService.cfc:L951, L980] are promotionReward.ts's obligation, not
   * this file's.
   *
   * SEMANTICS, REPRODUCED EXACTLY:
   *   * PRIMARY-KEY comparison, delegated to `hasOption()` so the transient-identity nuance is
   *     decided in exactly one place.
   *   * `false` FOR AN EMPTY INPUT ARRAY - `hasAnyInProperty` runs its loop zero times and
   *     falls through to `return false` [org/Hibachi/HibachiEntity.cfc:L348]. That is the
   *     load-bearing case at L885: a SKU with NO options must not be excluded by an
   *     option-based gate.
   *   * SHORT-CIRCUITS on the first match, matching the in-loop `return true` at
   *     [org/Hibachi/HibachiEntity.cfc:L343-L345], rather than scanning the whole array.
   *
   * POLARITY DETERMINES WHAT `false` MEANS - see empty-collection convention #3 above. On
   * this INCLUDE list `false` is RESTRICTIVE (nothing included, so the item does not
   * qualify); on `hasAnyExcludedOption` the identical `false` is PERMISSIVE (nothing
   * excluded, so the item still qualifies). The two must never be normalised.
   *
   * The parameter is `readonly Option[]` rather than `Option[]`: `Sku.getOptions()` returns
   * `readonly Option[]`, so the documented call site above could not otherwise be typed
   * without forcing every caller to copy the array. It accepts a mutable `Option[]` too, so
   * no caller loses anything, and the arity is unchanged from the legacy.
   */
  hasAnyOption(options: readonly Option[]): boolean {
    return options.some((option: Option) => this.hasOption(option));
  }

  /**
   * `hasAnyExcludedOption` - does ANY option in the supplied array appear in the EXCLUDE list?
   *
   * Dispatched by [org/Hibachi/HibachiEntity.cfc:L517-L519], implemented by
   * `hasAnyInProperty` at [org/Hibachi/HibachiEntity.cfc:L340-L350].
   *
   * CALL SITE: [model/service/PromotionService.cfc:L914], the exclusion half of
   * `getOrderItemInQualifier()`. Tests `excludedOptions` [L84].
   *
   * Same three semantics as `hasAnyOption` - primary-key comparison, `false` on an empty
   * input array, and short-circuit on first match - but the OPPOSITE POLARITY: here `false`
   * is PERMISSIVE, because an item excluded by nothing still qualifies.
   */
  hasAnyExcludedOption(options: readonly Option[]): boolean {
    return options.some((option: Option) => this.hasExcludedOption(option));
  }

  /**
   * Locates an entity inside one of this qualifier's collections, or `-1` when it is absent.
   *
   * * THE `findIndex` BASE-CHANGE RULE, CENTRALISED HERE BECAUSE IT IS A REAL OFF-BY-ONE
   * TRAP. All eleven `remove*` bodies in the source use CFML `arrayFind(...)` guarded by
   * `if(index > 0)` / `if(thisIndex > 0)` / `if(thatIndex > 0)`. CFML `arrayFind` is 1-BASED
   * and returns 0 for "not found"; `Array.prototype.findIndex` is 0-BASED and returns `-1`.
   * Every caller of this helper therefore tests `!== -1`. Writing `> 0` against a
   * `findIndex` result would silently skip a legitimate match at index 0 - the FIRST element
   * of every collection - and `listFindNoCase`, which likewise returns a 1-based index or 0,
   * is never used as a boolean anywhere in this file.
   *
   * The comparison rule is the one stated at the top of this section: primary key for a
   * persisted candidate, reference identity for a transient one whose key is still the
   * `unsavedvalue=""` empty string.
   *
   * `private static` and generic so the rule is decided once rather than twenty-one times;
   * it adds no exported unit, since only the class is exported from this module.
   */
  private static indexOfEntity<TEntity>(
    collection: readonly TEntity[],
    candidate: TEntity,
    primaryKeyOf: (entity: TEntity) => string,
  ): number {
    const candidateID: string = primaryKeyOf(candidate);

    if (candidateID === '') {
      return collection.indexOf(candidate);
    }

    return collection.findIndex((held: TEntity) => primaryKeyOf(held) === candidateID);
  }

  // ============  END:  Framework-Implicit Members =======================

  // ------------------------------------------------------------------------------------
  // A STRUCTURAL WART, RECORDED RATHER THAN NORMALISED.
  //
  // LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L101-L103]: `getSimpleRepresentation()`
  // sits BEFORE the `// ============ START: Non-Persistent Property Methods` banner at L105 -
  // that is, it floats OUTSIDE EVERY BANNER SECTION, in the gap between the property block and
  // the first banner. That placement is unique among the promotion-cluster entities: in
  // PromotionPeriod and PromotionCode the simple-representation members sit inside banners.
  // Purely cosmetic, and reproduced here as a positional fact only - the method is authored at
  // the same point in the file, ahead of the non-persistent section, so the reading order
  // matches the source.
  // ------------------------------------------------------------------------------------

  /**
   * `getSimpleRepresentation` - the qualifier's human label for the admin UI.
   *
   * CFML parity [model/entity/PromotionQualifier.cfc:L101-L103], the body VERBATIM:
   *
   *   public string function getSimpleRepresentation() {
   *       return "#rbKey('entity.promotionQualifier')# - #getFormattedValue('qualifierType')#";
   *   }
   *
   * TWO FRAMEWORK COLLABORATORS APPEAR HERE, AND BOTH ARE HANDLED HONESTLY RATHER THAN GUESSED.
   *
   * 1. `rbKey('entity.promotionQualifier')` is JavaRB. JavaRB IS NOT PORTED AND NO i18n RUNTIME
   *    IS INTRODUCED - the project-wide rule is that resource-bundle identifiers behind `rbKey`,
   *    `hb_rbKey` and `hb_nullRBKey` are PRESERVED VERBATIM AS INERT STRING CONSTANTS so the
   *    legacy admin can still resolve them. The key is therefore emitted literally below.
   *
   * 2. `getFormattedValue('qualifierType')` resolves to
   *    [org/Hibachi/HibachiTransient.cfc:L493], not to a method on this component. Its behaviour
   *    was READ rather than assumed. `getPropertyFormatType` [L534] returns the property's
   *    `hb_formatType`, which for `qualifierType` is `"rbKey"` [L53], so control reaches the
   *    rbKey branch at [org/Hibachi/HibachiTransient.cfc:L504-L510]:
   *
   *      } else if(arguments.formatType eq "rbKey") {
   *          if(!isNull(arguments.value)) {
   *              return rbKey('entity.#replace(getEntityName(),
   *                            getApplicationValue('applicationKey'),"")#
   *                            .#arguments.propertyName#.#arguments.value#');
   *          } else {
   *              return '';
   *          }
   *      }
   *
   *    `getEntityName()` is `"SlatwallPromotionQualifier"` [L49] and the application key is
   *    `"Slatwall"` [config/configFramework.cfm:L1], so `replace(...)` - CFML's default
   *    single-occurrence scope, which is all that is needed for one leading occurrence - yields
   *    `"PromotionQualifier"`, and the composed key is
   *    `entity.PromotionQualifier.qualifierType.<value>`. Both keys are emitted verbatim below.
   *
   * ★ THIS METHOD IS TOTAL - IT NEVER THROWS, AND THAT IS A READ FACT RATHER THAN A CHOICE.
   * `qualifierType` is nullable [L53 declares no `notnull`], but the null path is explicitly
   * handled inside the framework: [org/Hibachi/HibachiTransient.cfc:L508] returns `''`. So the
   * legacy result for an unset qualifier type is the prefix, the separator, and nothing -
   * INCLUDING THE TRAILING SPACE, because CFML `"#a# - #b#"` with an empty `b` still emits the
   * separator. Contrast `PromotionPeriod.getSimpleRepresentation()`, which DOES throw: it
   * dereferences a nullable ASSOCIATION and calls a method on it, whereas this body only reads
   * one of its own columns. Neither the throw nor the totality is invented - each matches its
   * own source.
   *
   * ★ NOTE THE CASING DISAGREEMENT BETWEEN THE TWO KEYS, which is in the source and is not a
   * porting artefact: L102 hand-writes `entity.promotionQualifier` with a LOWERCASE initial
   * letter, while the key the framework composes for the formatted value is derived from
   * `getEntityName()` and therefore carries an INITIAL CAPITAL - `entity.PromotionQualifier...`.
   * Both are reproduced exactly as the legacy produces them; normalising either would change a
   * resource-bundle lookup.
   *
   * NO LABEL PROVIDER IS INJECTED to resolve these keys. This entity has ZERO `getService(`
   * sites, the import ledger is closed at two value imports, and a translation port would add a
   * collaborator the source does not have. Resolution is the admin tier's concern.
   *
   * PURE AND SYNCHRONOUS.
   */
  getSimpleRepresentation(): string {
    const qualifierType: string | undefined = this.qualifierType;

    // The rbKey branch of `getFormattedValue`
    // [org/Hibachi/HibachiTransient.cfc:L504-L510]: a composed key when the value is present,
    // and the empty string when it is not. `isNullish` from src/lib/cfml/truthiness.ts carries
    // the CFML `isNull(...)` semantics at the site that had them; the trailing
    // `qualifierType === undefined` is a TYPE-NARROWING step only, because `isNullish` returns
    // `boolean` rather than a TypeScript type predicate and the compiler still needs an explicit
    // comparison to narrow `string | undefined` to `string`. It is redundant at runtime and
    // changes no outcome.
    const formattedQualifierType: string =
      isNullish(qualifierType) || qualifierType === undefined
        ? ''
        : `entity.PromotionQualifier.qualifierType.${qualifierType}`;

    return `entity.promotionQualifier - ${formattedQualifierType}`;
  }

  // ============ START: Non-Persistent Property Methods ==================
  // [model/entity/PromotionQualifier.cfc:L105] opens this block and L117 closes it. It is
  // POPULATED, and it holds EXACTLY ONE MEMBER: `getRewardMatchingTypeOptions()`
  // [L107-L115].

  // *** LEGACY-DEFECT [model/entity/PromotionQualifier.cfc:L99, L107]: THE DOUBLE ORPHAN -
  // A DEAD DECLARED PROPERTY AND AN UNDECLARED METHOD, POINTING IN OPPOSITE DIRECTIONS.
  //
  // HALF ONE - A NON-PERSISTENT PROPERTY WITH NO METHOD AND NO READER. L99 declares
  //
  //     property name="qualifierApplicationTypeOptions" type="array" persistent="false";
  //
  // and it is THE ONLY non-persistent property declared in the entire 373-line component. There
  // is NO `getQualifierApplicationTypeOptions()` method anywhere in the file, and the property
  // name appears NOWHERE else in it - not in a body, not in a comment, not in the (nonexistent)
  // validation schema. It is dead metadata. Structurally this is the same shape as DEFECT 10's
  // never-initialised, never-read `qualificationDetails.qualifiedFulfillments` key
  // [model/service/PromotionService.cfc:L621-L623], and as the declared-but-never-referenced
  // `isNotGlobal` condition in model/validation/PriceGroupRate.json.
  //
  // HALF TWO - A METHOD WITH NO DECLARED PROPERTY. Conversely, `getRewardMatchingTypeOptions()`
  // [L107-L115] exists as a hand-written method with NO matching
  // `property name="rewardMatchingTypeOptions" ... persistent="false"` declaration. It happens
  // to work: the explicit method shadows the `get<Property>Options` branch of the dynamic
  // dispatcher [org/Hibachi/HibachiEntity.cfc:L507-L565], so the dispatcher never runs for that
  // name and the missing property metadata is never consulted. But the metadata IS missing, and
  // any consumer that reflects over the non-persistent property list to discover option
  // providers would find the dead one and miss the live one - which is precisely the pairing
  // that makes this worth recording rather than shrugging at.
  //
  // THE PORT REPRODUCES THE SOURCE'S EXACT MEMBER SET: `getRewardMatchingTypeOptions()` IS
  // authored below; `getQualifierApplicationTypeOptions()` IS NOT authored, and no
  // `rewardMatchingTypeOptions` property is invented. Reproducing a member set faithfully is not
  // repair, so this costs none of the (zero) divergence budget available to this file.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * `getRewardMatchingTypeOptions` - the five reward-matching modes the admin offers.
   *
   * CFML parity [model/entity/PromotionQualifier.cfc:L107-L115], the body VERBATIM:
   *
   *   public array function getRewardMatchingTypeOptions() {
   *       return [
   *           {name=rbKey('entity.promotionQualifier.rewardMatchingType.any'),         value="any"},
   *           {name=rbKey('entity.promotionQualifier.rewardMatchingType.sku'),         value="sku"},
   *           {name=rbKey('entity.promotionQualifier.rewardMatchingType.product'),     value="product"},
   *           {name=rbKey('entity.promotionQualifier.rewardMatchingType.productType'), value="productType"},
   *           {name=rbKey('entity.promotionQualifier.rewardMatchingType.brand'),       value="brand"}
   *       ];
   *   }
   *
   * ★ THIS BODY IS THE AUTHORITATIVE VOCABULARY FOR `rewardMatchingType` [L65], AND IT IS WHY
   * THAT COLUMN IS THE ONE NARROWED COLUMN ON THIS ENTITY. Five values, these exact spellings,
   * this exact order: `any`, `sku`, `product`, `productType`, `brand`. `hb_formFieldType="select"`
   * on L65 makes this list the admin form's domain. No sixth member may be added, none renamed,
   * none reordered - see {@link RewardMatchingType}. Contrast `qualifierType` [L53], which is
   * deliberately NOT narrowed because the source declares no vocabulary for it and there is no
   * `getQualifierTypeOptions()` anywhere in the component.
   *
   * The five `name` values are JAVARB KEYS, not English labels, and are emitted verbatim as
   * inert strings for the same reason as in `getSimpleRepresentation()` above: JavaRB is not
   * ported and no i18n runtime is introduced. Contrast
   * `RoundingRule.getRoundingRuleDirectionOptions()`, whose three labels ARE hardcoded English
   * in its source - each port keeps whatever its own source held.
   *
   * A FIXED-ARITY `readonly` TUPLE, RETURNED FRESH ON EVERY CALL. The arity is a fact about the
   * source, so the type states it. A fresh array each call reproduces the CFML literal being
   * re-evaluated per invocation, and hoisting it to module scope would create state shared
   * across warm-container invocations for no benefit. `readonly` here does NOT collide with the
   * live-reference ruling on the ten association accessors: this is a computed option list for a
   * form control, not one side of a bidirectional association, so nothing depends on mutating it.
   *
   * This method OVERRIDES what the dispatcher would otherwise have synthesised for a
   * `get<Property>Options` name [org/Hibachi/HibachiEntity.cfc:L507-L565]; because the component
   * hand-writes it, that branch never runs, which is why a hand-written method is the faithful
   * port and no dynamic dispatch is needed to explain it.
   *
   * PURE AND SYNCHRONOUS.
   */
  getRewardMatchingTypeOptions(): readonly [
    RewardMatchingTypeOption,
    RewardMatchingTypeOption,
    RewardMatchingTypeOption,
    RewardMatchingTypeOption,
    RewardMatchingTypeOption,
  ] {
    return [
      { name: 'entity.promotionQualifier.rewardMatchingType.any', value: 'any' },
      { name: 'entity.promotionQualifier.rewardMatchingType.sku', value: 'sku' },
      { name: 'entity.promotionQualifier.rewardMatchingType.product', value: 'product' },
      { name: 'entity.promotionQualifier.rewardMatchingType.productType', value: 'productType' },
      { name: 'entity.promotionQualifier.rewardMatchingType.brand', value: 'brand' },
    ];
  }

  // ============  END:  Non-Persistent Property Methods ==================

  // ============= START: Bidirectional Helper Methods ===================
  // [model/entity/PromotionQualifier.cfc:L119] opens this block and L339 closes it - 221 lines,
  // the largest section in the component. It holds ELEVEN HELPER PAIRS, twenty-two methods in
  // total, under twelve inline sub-banners: `// Promotion Period (many-to-one)` at L121, then ten
  // `// <Name> (many-to-many - owner)` banners at L139, L159, L179, L199, L219, L239, L259, L279,
  // L299 and L319.
  //
  // ★ AN ASYMMETRY WORTH STATING BEFORE THE MEMBERS: ELEVEN HELPER PAIRS FOR FOURTEEN
  // RELATIONSHIPS. The component has one many-to-one [L68] plus thirteen many-to-many [L73-L87],
  // and hand-writes helpers for only eleven of the fourteen. The three with NO `add*` and NO
  // `remove*` anywhere in the file are EXACTLY Group A - `fulfillmentMethods` [L73],
  // `shippingMethods` [L74] and `shippingAddressZones` [L75] - which rely entirely on the
  // framework's generated accessors. See the Group A LEGACY-NOTEs above: that absence of
  // hand-written behaviour is what makes their collapse to opaque identifier arrays LOSSLESS with
  // respect to authored logic, rather than merely convenient.
  //
  // ★ EVERY MEMBER BELOW KEEPS THE LEGACY PARAMETER NAME, NOT THE PROPERTY NAME. The source
  // writes `addExcludedBrand(required any brand)` - the argument is `brand`, not `excludedBrand` -
  // and the same holds for all five exclude pairs. Preserved verbatim.
  //
  // ★ THE TWO FAR-SIDE MEMBER FAMILIES ARE NEVER MIXED. The five INCLUDE pairs reach
  // `hasPromotionQualifier` / `getPromotionQualifiers` on the far side; the five EXCLUDE pairs
  // reach `hasPromotionQualifierExclusion` / `getPromotionQualifierExclusions`. All twenty of
  // those far-side members were confirmed present in the already-shipped sibling files before this
  // file was authored - brand.ts, option.ts, sku.ts, product.ts and productType.ts each declare
  // all four - so no member is invented on a file this one does not own, and no call is widened to
  // `any` or silently dropped to make anything compile.

  // ------------------------------------------------------------------------------------
  // Promotion Period (many-to-one) [model/entity/PromotionQualifier.cfc:L121]
  // ------------------------------------------------------------------------------------

  /**
   * `setPromotionPeriod` - point this qualifier at a promotion period and synchronise the far side.
   *
   * CFML parity [model/entity/PromotionQualifier.cfc:L122-L127], the body VERBATIM:
   *
   *   public void function setPromotionPeriod(required any promotionPeriod) {
   *       variables.promotionPeriod = arguments.promotionPeriod;
   *       if(isNew() or !arguments.promotionPeriod.hasPromotionQualifier( this )) {
   *           arrayAppend(arguments.promotionPeriod.getPromotionQualifiers(), this);
   *       }
   *   }
   *
   * THREE ORDERING FACTS ARE PRESERVED EXACTLY.
   *
   * 1. THE NEAR-SIDE ASSIGNMENT HAPPENS FIRST [L123], before the guard is evaluated. It is
   *    unconditional: the field is overwritten even when the far side already holds this
   *    qualifier, and even when the far side is the same period it already pointed at.
   * 2. THE GUARD IS `isNew() or !hasPromotionQualifier(this)`, IN THAT ORDER, AND CFML `or`
   *    SHORT-CIRCUITS [L124]. So for an UNSAVED qualifier the containment probe is NEVER RUN and
   *    the far-side append is unconditional - two `setPromotionPeriod()` calls on the same
   *    transient qualifier append it TWICE. That is the legacy outcome and it is reproduced, not
   *    smoothed over; `isNew()` is the reason, and it is exactly why the containment rule
   *    documented in the framework-implicit section falls back to reference identity for
   *    transients.
   * 3. THE FAR-SIDE APPEND MUTATES THE LIVE ARRAY [L125]. `arrayAppend` in CFML mutates in place,
   *    and `PromotionPeriod.getPromotionQualifiers()` returns its live `PromotionQualifier[]`
   *    (confirmed in the shipped promotionPeriod.ts), so `.push(this)` is the exact analogue. A
   *    defensive copy on either side of this call would make the far-side half of this method a
   *    silent no-op and break bidirectional synchronisation across the aggregate.
   *
   * The parameter is REQUIRED, matching `required any promotionPeriod` on L122, and is typed to
   * the concrete entity rather than to CFML's `any`. Arity is unchanged: no signature widening is
   * spent here, and none is available.
   *
   * SYNCHRONOUS - this reaches no port and performs no I/O.
   */
  setPromotionPeriod(promotionPeriod: PromotionPeriod): void {
    // [L123] Unconditional near-side assignment, ahead of the guard.
    this.promotionPeriod = promotionPeriod;

    // [L124] `isNew() or !hasPromotionQualifier(this)`, short-circuiting on the left operand
    // exactly as CFML `or` does - so a transient qualifier never runs the containment probe.
    if (this.isNew() || !promotionPeriod.hasPromotionQualifier(this)) {
      // [L125] In-place mutation of the far side's LIVE array.
      promotionPeriod.getPromotionQualifiers().push(this);
    }
  }

  /**
   * `removePromotionPeriod` - detach this qualifier from a promotion period, both sides.
   *
   * CFML parity [model/entity/PromotionQualifier.cfc:L128-L137], the body VERBATIM:
   *
   *   public void function removePromotionPeriod(any promotionPeriod) {
   *       if(!structKeyExists(arguments, "promotionPeriod")) {
   *           arguments.promotionPeriod = variables.promotionPeriod;
   *       }
   *       var index = arrayFind(arguments.promotionPeriod.getPromotionQualifiers(), this);
   *       if(index > 0) {
   *           arrayDeleteAt(arguments.promotionPeriod.getPromotionQualifiers(), index);
   *       }
   *       structDelete(variables, "promotionPeriod");
   *   }
   *
   * NOTE THE PARAMETER IS OPTIONAL - `any promotionPeriod` WITH NO `required` [L128] - and this is
   * the only optional parameter in the entire component. L129-L131 then defaults it from the
   * current field, which is what lets a caller write `qualifier.removePromotionPeriod()` and mean
   * "detach from whatever you are attached to". `structKeyExists(arguments, "promotionPeriod")` is
   * an ARGUMENT-SCOPE presence test, not a domain-data struct lookup with case-insensitive keys,
   * so it maps to a TypeScript optional parameter and NOT to any helper in src/lib/cfml/struct.ts.
   *
   * ★ THE THROW IS PRESERVED. When the argument is omitted AND the field is already empty, L132
   * calls `getPromotionQualifiers()` on null and CFML raises a null-reference error. The FK is
   * genuinely nullable - L68 declares no `notnull` - so this is reachable, not theoretical. AN
   * EARLY RETURN IS NOT ADDED: behaviour preservation extends to defects, and a member that
   * throws at runtime today must throw in the target. Silently returning would also leave the
   * caller believing a detach succeeded. The message names the cause so the failure is
   * diagnosable rather than merely faithful.
   *
   * ★ THE CLEAR HAPPENS AFTER THE THROW POINT AND IS UNCONDITIONAL. L136 runs whether or not the
   * far-side deletion found anything, but it is downstream of L132, so a raise leaves the field
   * INTACT. Both properties are reproduced. The clear is an assignment of `undefined`, not
   * `delete this.promotionPeriod`: the field is declared as an explicit `PromotionPeriod |
   * undefined` union precisely so this is legal under `exactOptionalPropertyTypes`, and `delete`
   * on a class field is neither idiomatic nor necessary.
   *
   * ★ THE `findIndex` BASE CHANGE APPLIES HERE. L133 guards with `if(index > 0)` because CFML
   * `arrayFind` is 1-based; the port routes through `indexOfEntity` and tests `!== -1`. Writing
   * `> 0` would skip a qualifier sitting at index 0 of the period's collection - the common case
   * for a period with a single qualifier.
   *
   * SYNCHRONOUS.
   *
   * @throws Error when no argument is supplied and `promotionPeriod` is already absent.
   */
  removePromotionPeriod(promotionPeriod?: PromotionPeriod): void {
    // [L129-L131] Default the target from the current field when the caller omitted it.
    // `isNullish` carries the CFML absence semantics; the `=== undefined` operand that follows is
    // a TYPE-NARROWING step only, because `isNullish` returns `boolean` rather than a type
    // predicate. Redundant at runtime, and it changes no outcome.
    const target: PromotionPeriod | undefined = promotionPeriod ?? this.promotionPeriod;

    if (isNullish(target) || target === undefined) {
      throw new Error(
        'PromotionQualifier.removePromotionPeriod has no promotion period to detach from: ' +
          'model/entity/PromotionQualifier.cfc:L129-L132 defaults the omitted argument from ' +
          'variables.promotionPeriod and then calls getPromotionQualifiers() on it with no null ' +
          'guard, so an already-empty association is a CFML null-reference error. The foreign key ' +
          'is nullable - model/entity/PromotionQualifier.cfc:L68 declares no notnull - which is ' +
          'what makes this reachable. Note that the legacy clear at L136 sits AFTER this raise, ' +
          'so the association is left intact, exactly as here.',
      );
    }

    // [L132-L135] Locate and delete on the FAR side, against its live array.
    const index: number = PromotionQualifier.indexOfEntity(
      target.getPromotionQualifiers(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (index !== -1) {
      target.getPromotionQualifiers().splice(index, 1);
    }

    // [L136] `structDelete(variables, "promotionPeriod")` - unconditional, and downstream of the
    // raise above.
    this.promotionPeriod = undefined;
  }

  // ------------------------------------------------------------------------------------
  // THE TEN MANY-TO-MANY OWNER PAIRS [model/entity/PromotionQualifier.cfc:L139-L337]
  //
  // ALL TEN `add*` BODIES SHARE ONE IDENTICAL TWO-GUARD SHAPE, and all ten `remove*` bodies
  // share one identical two-deletion shape. Both are stated ONCE here and referenced from each
  // member, so the ported logic can be checked against the source without twenty repetitions of
  // the same prose. `addBrand` / `removeBrand` [L140-L157] is the template, quoted VERBATIM:
  //
  //     public void function addBrand(required any brand) {
  //         if(arguments.brand.isNew() or !hasBrand(arguments.brand)) {
  //             arrayAppend(variables.brands, arguments.brand);
  //         }
  //         if(isNew() or !arguments.brand.hasPromotionQualifier( this )) {
  //             arrayAppend(arguments.brand.getPromotionQualifiers(), this);
  //         }
  //     }
  //     public void function removeBrand(required any brand) {
  //         var thisIndex = arrayFind(variables.brands, arguments.brand);
  //         if(thisIndex > 0) {
  //             arrayDeleteAt(variables.brands, thisIndex);
  //         }
  //         var thatIndex = arrayFind(arguments.brand.getPromotionQualifiers(), this);
  //         if(thatIndex > 0) {
  //             arrayDeleteAt(arguments.brand.getPromotionQualifiers(), thatIndex);
  //         }
  //     }
  //
  // THE `add*` SHAPE - TWO INDEPENDENT GUARDS, NOT ONE, AND THEY ARE NOT SYMMETRIC.
  //   * GUARD ONE (near side) tests the ARGUMENT'S newness: `arguments.X.isNew() or !hasX(...)`.
  //   * GUARD TWO (far side) tests THIS QUALIFIER'S newness: `isNew() or !X.hasPromotionQualifier...`.
  //     The subject of `isNew()` differs between the two guards, and mixing them up would change
  //     which side accepts duplicates. Preserved exactly as written.
  //   * CFML `or` SHORT-CIRCUITS, so a NEW entity is appended WITHOUT the containment probe
  //     running - two `add*` calls with the same transient argument append it twice on the near
  //     side, and two `add*` calls on a transient qualifier append it twice on the far side. That
  //     is the legacy outcome and it is reproduced, not smoothed over.
  //   * BOTH APPENDS ARE UNCONDITIONALLY EVALUATED IN SEQUENCE - the second guard is NOT nested
  //     inside the first, so a near-side skip does not skip the far side.
  //
  // THE `remove*` SHAPE - TWO INDEPENDENT DELETIONS, near side then far side, each guarded by its
  // own index test, neither conditional on the other. `if(thisIndex > 0)` / `if(thatIndex > 0)` is
  // CFML's 1-based `arrayFind` idiom; the port routes both through `indexOfEntity` and tests
  // `!== -1`. See the base-change rule on `indexOfEntity` above: `> 0` against a `findIndex`
  // result would silently skip a match at index 0, which is the FIRST element of every collection.
  //
  // MUTATION IS IN PLACE ON BOTH SIDES. `arrayAppend` and `arrayDeleteAt` mutate the CFML array
  // they are handed, and every far-side accessor in the shipped sibling files returns its LIVE
  // `PromotionQualifier[]`, so `.push(...)` and `.splice(index, 1)` are the exact analogues. A
  // defensive copy anywhere in this block would turn the far-side half of all twenty helpers into
  // a silent no-op.
  //
  // PARAMETER NAMES ARE THE LEGACY NAMES, INCLUDING ON THE FIVE EXCLUDE PAIRS where the argument
  // is named after the ENTITY rather than the property - `addExcludedBrand(required any brand)`.
  //
  // EVERY MEMBER BELOW IS SYNCHRONOUS: no port, no I/O, no `async`.
  // ------------------------------------------------------------------------------------

  // Brands (many-to-many - owner) [model/entity/PromotionQualifier.cfc:L139]

  /**
   * `addBrand` - add a brand to the INCLUDE list and synchronise the far side.
   *
   * [model/entity/PromotionQualifier.cfc:L140-L147]. Near side `brands` [L77], link table
   * `SwPromoQualBrand`. Far side `Brand.getPromotionQualifiers()`. Guards per the shared `add*`
   * shape documented above.
   */
  addBrand(brand: Brand): void {
    // [L141-L143] Near side: the ARGUMENT's newness short-circuits the containment probe.
    if (brand.isNew() || !this.hasBrand(brand)) {
      this.brands.push(brand);
    }

    // [L144-L146] Far side: THIS qualifier's newness short-circuits the far-side probe.
    if (this.isNew() || !brand.hasPromotionQualifier(this)) {
      brand.getPromotionQualifiers().push(this);
    }
  }

  /**
   * `removeBrand` - remove a brand from the INCLUDE list, both sides.
   *
   * [model/entity/PromotionQualifier.cfc:L148-L157]. Two independent guarded deletions per the
   * shared `remove*` shape; `findIndex(...) !== -1` replaces CFML's 1-based `if(thisIndex > 0)` /
   * `if(thatIndex > 0)`.
   */
  removeBrand(brand: Brand): void {
    // [L149-L152] Near side.
    const thisIndex: number = PromotionQualifier.indexOfEntity(this.brands, brand, (held: Brand) =>
      held.getBrandID(),
    );

    if (thisIndex !== -1) {
      this.brands.splice(thisIndex, 1);
    }

    // [L153-L156] Far side.
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      brand.getPromotionQualifiers(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      brand.getPromotionQualifiers().splice(thatIndex, 1);
    }
  }

  // Options (many-to-many - owner) [model/entity/PromotionQualifier.cfc:L159]

  /**
   * `addOption` - add an option to the INCLUDE list and synchronise the far side.
   *
   * [model/entity/PromotionQualifier.cfc:L160-L167]. Near side `options` [L78], link table
   * `SwPromoQualOption`. Far side `Option.getPromotionQualifiers()`.
   */
  addOption(option: Option): void {
    // [L161-L163]
    if (option.isNew() || !this.hasOption(option)) {
      this.options.push(option);
    }

    // [L164-L166]
    if (this.isNew() || !option.hasPromotionQualifier(this)) {
      option.getPromotionQualifiers().push(this);
    }
  }

  /**
   * `removeOption` - remove an option from the INCLUDE list, both sides.
   *
   * [model/entity/PromotionQualifier.cfc:L168-L177].
   */
  removeOption(option: Option): void {
    // [L169-L172]
    const thisIndex: number = PromotionQualifier.indexOfEntity(
      this.options,
      option,
      (held: Option) => held.getOptionID(),
    );

    if (thisIndex !== -1) {
      this.options.splice(thisIndex, 1);
    }

    // [L173-L176]
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      option.getPromotionQualifiers(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      option.getPromotionQualifiers().splice(thatIndex, 1);
    }
  }

  // Skus (many-to-many - owner) [model/entity/PromotionQualifier.cfc:L179]
  //
  // LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L179-L197]: NEARLY EVERY LINE OF THIS BLOCK
  // CARRIES TRAILING WHITESPACE in the source, including the sub-banner comment itself -
  // `// Skus (many-to-many - owner)    `. The same wart runs through the Excluded Brands
  // [L239-L257] and Excluded Options [L259-L277] blocks. Cosmetic only, invisible to CFML, and not
  // reproduced: prettier normalises trailing whitespace in the target and the wart carries no
  // behaviour.

  /**
   * `addSku` - add a SKU to the INCLUDE list and synchronise the far side.
   *
   * [model/entity/PromotionQualifier.cfc:L180-L187]. Near side `skus` [L79], link table
   * `SwPromoQualSku`. Far side `Sku.getPromotionQualifiers()`.
   */
  addSku(sku: Sku): void {
    // [L181-L183]
    if (sku.isNew() || !this.hasSku(sku)) {
      this.skus.push(sku);
    }

    // [L184-L186]
    if (this.isNew() || !sku.hasPromotionQualifier(this)) {
      sku.getPromotionQualifiers().push(this);
    }
  }

  /**
   * `removeSku` - remove a SKU from the INCLUDE list, both sides.
   *
   * [model/entity/PromotionQualifier.cfc:L188-L197].
   */
  removeSku(sku: Sku): void {
    // [L189-L192]
    const thisIndex: number = PromotionQualifier.indexOfEntity(this.skus, sku, (held: Sku) =>
      held.getSkuID(),
    );

    if (thisIndex !== -1) {
      this.skus.splice(thisIndex, 1);
    }

    // [L193-L196]
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      sku.getPromotionQualifiers(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      sku.getPromotionQualifiers().splice(thatIndex, 1);
    }
  }

  // Products (many-to-many - owner) [model/entity/PromotionQualifier.cfc:L199]

  /**
   * `addProduct` - add a product to the INCLUDE list and synchronise the far side.
   *
   * [model/entity/PromotionQualifier.cfc:L200-L207]. Near side `products` [L80], link table
   * `SwPromoQualProduct`. Far side `Product.getPromotionQualifiers()`.
   */
  addProduct(product: Product): void {
    // [L201-L203]
    if (product.isNew() || !this.hasProduct(product)) {
      this.products.push(product);
    }

    // [L204-L206]
    if (this.isNew() || !product.hasPromotionQualifier(this)) {
      product.getPromotionQualifiers().push(this);
    }
  }

  /**
   * `removeProduct` - remove a product from the INCLUDE list, both sides.
   *
   * [model/entity/PromotionQualifier.cfc:L208-L217].
   */
  removeProduct(product: Product): void {
    // [L209-L212]
    const thisIndex: number = PromotionQualifier.indexOfEntity(
      this.products,
      product,
      (held: Product) => held.getProductID(),
    );

    if (thisIndex !== -1) {
      this.products.splice(thisIndex, 1);
    }

    // [L213-L216]
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      product.getPromotionQualifiers(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      product.getPromotionQualifiers().splice(thatIndex, 1);
    }
  }

  // Product Types (many-to-many - owner) [model/entity/PromotionQualifier.cfc:L219]

  /**
   * `addProductType` - add a product type to the INCLUDE list and synchronise the far side.
   *
   * [model/entity/PromotionQualifier.cfc:L220-L227]. Near side `productTypes` [L81], link table
   * `SwPromoQualProductType`. Far side `ProductType.getPromotionQualifiers()`.
   */
  addProductType(productType: ProductType): void {
    // [L221-L223]
    if (productType.isNew() || !this.hasProductType(productType)) {
      this.productTypes.push(productType);
    }

    // [L224-L226]
    if (this.isNew() || !productType.hasPromotionQualifier(this)) {
      productType.getPromotionQualifiers().push(this);
    }
  }

  /**
   * `removeProductType` - remove a product type from the INCLUDE list, both sides.
   *
   * [model/entity/PromotionQualifier.cfc:L228-L237].
   */
  removeProductType(productType: ProductType): void {
    // [L229-L232]
    const thisIndex: number = PromotionQualifier.indexOfEntity(
      this.productTypes,
      productType,
      (held: ProductType) => held.getProductTypeID(),
    );

    if (thisIndex !== -1) {
      this.productTypes.splice(thisIndex, 1);
    }

    // [L233-L236]
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      productType.getPromotionQualifiers(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      productType.getPromotionQualifiers().splice(thatIndex, 1);
    }
  }

  // Excluded Brands (many-to-many - owner) [model/entity/PromotionQualifier.cfc:L239]
  //
  // FROM HERE THE FAR-SIDE FAMILY CHANGES. The five EXCLUDE pairs reach
  // `hasPromotionQualifierExclusion` / `getPromotionQualifierExclusions` - NOT the
  // `hasPromotionQualifier` / `getPromotionQualifiers` pair the five INCLUDE pairs above use. The
  // two families address different link tables (`SwPromoQualExcl*` rather than `SwPromoQual*`) and
  // must never be mixed.

  /**
   * `addExcludedBrand` - add a brand to the EXCLUDE list and synchronise the far side.
   *
   * [model/entity/PromotionQualifier.cfc:L240-L247]. Near side `excludedBrands` [L83], link table
   * `SwPromoQualExclBrand`. Far side `Brand.getPromotionQualifierExclusions()`. The parameter is
   * named `brand`, not `excludedBrand`, matching L240 verbatim.
   */
  addExcludedBrand(brand: Brand): void {
    // [L241-L243]
    if (brand.isNew() || !this.hasExcludedBrand(brand)) {
      this.excludedBrands.push(brand);
    }

    // [L244-L246]
    if (this.isNew() || !brand.hasPromotionQualifierExclusion(this)) {
      brand.getPromotionQualifierExclusions().push(this);
    }
  }

  /**
   * `removeExcludedBrand` - remove a brand from the EXCLUDE list, both sides.
   *
   * [model/entity/PromotionQualifier.cfc:L248-L257].
   */
  removeExcludedBrand(brand: Brand): void {
    // [L249-L252]
    const thisIndex: number = PromotionQualifier.indexOfEntity(
      this.excludedBrands,
      brand,
      (held: Brand) => held.getBrandID(),
    );

    if (thisIndex !== -1) {
      this.excludedBrands.splice(thisIndex, 1);
    }

    // [L253-L256]
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      brand.getPromotionQualifierExclusions(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      brand.getPromotionQualifierExclusions().splice(thatIndex, 1);
    }
  }

  // Excluded Options (many-to-many - owner) [model/entity/PromotionQualifier.cfc:L259]

  /**
   * `addExcludedOption` - add an option to the EXCLUDE list and synchronise the far side.
   *
   * [model/entity/PromotionQualifier.cfc:L260-L267]. Near side `excludedOptions` [L84], link table
   * `SwPromoQualExclOption`. Far side `Option.getPromotionQualifierExclusions()`. Parameter named
   * `option`, matching L260.
   *
   * ★ THIS IS THE METHOD THE `Option` DEFECT CALLS. `Option.removePromotionQualifierExclusion()`
   * [model/entity/Option.cfc:L145-L147] calls `addExcludedOption(this)` - a "remove" that ADDS -
   * and that defect is preserved in the shipped option.ts. See the inversion verdict table below
   * for the full mirror-image contrast; nothing is compensated for here.
   */
  addExcludedOption(option: Option): void {
    // [L261-L263]
    if (option.isNew() || !this.hasExcludedOption(option)) {
      this.excludedOptions.push(option);
    }

    // [L264-L266]
    if (this.isNew() || !option.hasPromotionQualifierExclusion(this)) {
      option.getPromotionQualifierExclusions().push(this);
    }
  }

  /**
   * `removeExcludedOption` - remove an option from the EXCLUDE list, both sides.
   *
   * [model/entity/PromotionQualifier.cfc:L268-L277]. CORRECT on both sides - see the verdict table
   * below, and note that it disagrees with `Option.removePromotionQualifierExclusion()`. Both
   * behaviours are preserved and neither is reconciled with the other.
   */
  removeExcludedOption(option: Option): void {
    // [L269-L272]
    const thisIndex: number = PromotionQualifier.indexOfEntity(
      this.excludedOptions,
      option,
      (held: Option) => held.getOptionID(),
    );

    if (thisIndex !== -1) {
      this.excludedOptions.splice(thisIndex, 1);
    }

    // [L273-L276]
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      option.getPromotionQualifierExclusions(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      option.getPromotionQualifierExclusions().splice(thatIndex, 1);
    }
  }

  // Excluded Skus (many-to-many - owner) [model/entity/PromotionQualifier.cfc:L279]

  /**
   * `addExcludedSku` - add a SKU to the EXCLUDE list and synchronise the far side.
   *
   * [model/entity/PromotionQualifier.cfc:L280-L287]. Near side `excludedSkus` [L85], link table
   * `SwPromoQualExclSku`. Far side `Sku.getPromotionQualifierExclusions()`. Parameter named `sku`,
   * matching L280.
   */
  addExcludedSku(sku: Sku): void {
    // [L281-L283]
    if (sku.isNew() || !this.hasExcludedSku(sku)) {
      this.excludedSkus.push(sku);
    }

    // [L284-L286]
    if (this.isNew() || !sku.hasPromotionQualifierExclusion(this)) {
      sku.getPromotionQualifierExclusions().push(this);
    }
  }

  /**
   * `removeExcludedSku` - remove a SKU from the EXCLUDE list, both sides.
   *
   * [model/entity/PromotionQualifier.cfc:L288-L297].
   */
  removeExcludedSku(sku: Sku): void {
    // [L289-L292]
    const thisIndex: number = PromotionQualifier.indexOfEntity(
      this.excludedSkus,
      sku,
      (held: Sku) => held.getSkuID(),
    );

    if (thisIndex !== -1) {
      this.excludedSkus.splice(thisIndex, 1);
    }

    // [L293-L296]
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      sku.getPromotionQualifierExclusions(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      sku.getPromotionQualifierExclusions().splice(thatIndex, 1);
    }
  }

  // Excluded Products (many-to-many - owner) [model/entity/PromotionQualifier.cfc:L299]

  /**
   * `addExcludedProduct` - add a product to the EXCLUDE list and synchronise the far side.
   *
   * [model/entity/PromotionQualifier.cfc:L300-L307]. Near side `excludedProducts` [L86], link
   * table `SwPromoQualExclProduct`. Far side `Product.getPromotionQualifierExclusions()`.
   * Parameter named `product`, matching L300.
   */
  addExcludedProduct(product: Product): void {
    // [L301-L303]
    if (product.isNew() || !this.hasExcludedProduct(product)) {
      this.excludedProducts.push(product);
    }

    // [L304-L306]
    if (this.isNew() || !product.hasPromotionQualifierExclusion(this)) {
      product.getPromotionQualifierExclusions().push(this);
    }
  }

  /**
   * `removeExcludedProduct` - remove a product from the EXCLUDE list, both sides.
   *
   * [model/entity/PromotionQualifier.cfc:L308-L317].
   */
  removeExcludedProduct(product: Product): void {
    // [L309-L312]
    const thisIndex: number = PromotionQualifier.indexOfEntity(
      this.excludedProducts,
      product,
      (held: Product) => held.getProductID(),
    );

    if (thisIndex !== -1) {
      this.excludedProducts.splice(thisIndex, 1);
    }

    // [L313-L316]
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      product.getPromotionQualifierExclusions(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      product.getPromotionQualifierExclusions().splice(thatIndex, 1);
    }
  }

  // Excluded Product Types (many-to-many - owner) [model/entity/PromotionQualifier.cfc:L319]

  /**
   * `addExcludedProductType` - add a product type to the EXCLUDE list and synchronise the far side.
   *
   * [model/entity/PromotionQualifier.cfc:L320-L327]. Near side `excludedProductTypes` [L87], link
   * table `SwPromoQualExclProductType`. Far side
   * `ProductType.getPromotionQualifierExclusions()`. Parameter named `productType`, matching L320.
   */
  addExcludedProductType(productType: ProductType): void {
    // [L321-L323]
    if (productType.isNew() || !this.hasExcludedProductType(productType)) {
      this.excludedProductTypes.push(productType);
    }

    // [L324-L326]
    if (this.isNew() || !productType.hasPromotionQualifierExclusion(this)) {
      productType.getPromotionQualifierExclusions().push(this);
    }
  }

  /**
   * `removeExcludedProductType` - remove a product type from the EXCLUDE list, both sides.
   *
   * [model/entity/PromotionQualifier.cfc:L328-L337] - the LAST member of the section, and the last
   * row of the inversion verdict table below.
   */
  removeExcludedProductType(productType: ProductType): void {
    // [L329-L332]
    const thisIndex: number = PromotionQualifier.indexOfEntity(
      this.excludedProductTypes,
      productType,
      (held: ProductType) => held.getProductTypeID(),
    );

    if (thisIndex !== -1) {
      this.excludedProductTypes.splice(thisIndex, 1);
    }

    // [L333-L336]
    const thatIndex: number = PromotionQualifier.indexOfEntity(
      productType.getPromotionQualifierExclusions(),
      this,
      (held: PromotionQualifier) => held.getPromotionQualifierID(),
    );

    if (thatIndex !== -1) {
      productType.getPromotionQualifierExclusions().splice(thatIndex, 1);
    }
  }

  // =============  END:  Bidirectional Helper Methods ===================
  // [model/entity/PromotionQualifier.cfc:L339]. Exactly one START/END pair for this section -
  // there is NO duplicate banner here, unlike PromotionAccount [L117/L119], PromotionPeriod
  // [L154/L156] and PromotionCode [L153/L155], and no missing END banner, unlike
  // PromotionCode [L98].

  //
  // ★★★ THE MANDATORY "REMOVE-THAT-ADDS" INVERSION CROSS-CHECK, RE-RUN INDEPENDENTLY AGAINST THE
  // VERBATIM SOURCE RATHER THAN TAKEN ON TRUST. All eleven `remove*` bodies in
  // model/entity/PromotionQualifier.cfc were read line by line and each was checked for the
  // failure mode that a sibling entity DOES exhibit: a `remove*` whose body calls an `add*`.
  //
  //  #  | remove*                    | Line | Near-side action              | Far-side action    | Verdict
  // ----+----------------------------+------+-------------------------------+--------------------+--------
  //   1 | removePromotionPeriod      | L128 | clears field, structDelete L136| arrayDeleteAt L134| CLEAN
  //   2 | removeBrand                | L148 | arrayDeleteAt L151            | arrayDeleteAt L155 | CLEAN
  //   3 | removeOption               | L168 | arrayDeleteAt L171            | arrayDeleteAt L175 | CLEAN
  //   4 | removeSku                  | L188 | arrayDeleteAt L191            | arrayDeleteAt L195 | CLEAN
  //   5 | removeProduct              | L208 | arrayDeleteAt L211            | arrayDeleteAt L215 | CLEAN
  //   6 | removeProductType          | L228 | arrayDeleteAt L231            | arrayDeleteAt L235 | CLEAN
  //   7 | removeExcludedBrand        | L248 | arrayDeleteAt L251            | arrayDeleteAt L255 | CLEAN
  //   8 | removeExcludedOption       | L268 | arrayDeleteAt L271            | arrayDeleteAt L275 | CLEAN
  //   9 | removeExcludedSku          | L288 | arrayDeleteAt L291            | arrayDeleteAt L295 | CLEAN
  //  10 | removeExcludedProduct      | L308 | arrayDeleteAt L311            | arrayDeleteAt L315 | CLEAN
  //  11 | removeExcludedProductType  | L328 | arrayDeleteAt L331            | arrayDeleteAt L335 | CLEAN
  //
  // RESULT = CLEAN. ZERO INVERSIONS ACROSS ALL ELEVEN. Every `remove*` in this component deletes
  // on BOTH sides, and not one of them calls an `add*`. There is therefore NO inversion defect to
  // preserve in this file, and none is invented to match the sibling pattern.
  //
  // ★★★ AND THE MIRROR-IMAGE CONTRAST, WHICH IS THE GENUINELY ILLUMINATING PART. The far side of
  // one of these very relationships IS inverted. model/entity/Option.cfc:L145-L147 reads:
  //
  //     public void function removePromotionQualifierExclusion(required any promotionQualifier) {
  //         arguments.promotionQualifier.addExcludedOption( this );
  //     }
  //
  // - a "remove" that ADDS, preserved as a LEGACY-DEFECT in the already-shipped option.ts,
  // alongside its twin at model/entity/Option.cfc:L129-L131, which inverts
  // `removePromotionRewardExclusion` the same way. Note the precision of the failure: Option's
  // INCLUDE side is correct - L137-L138 `removePromotionQualifier()` properly calls
  // `removeOption(this)` - and ONLY the two EXCLUSION removers are inverted.
  //
  // SO THE TWO SIDES OF THE SAME RELATIONSHIP DISAGREE, AND OBSERVABLY SO:
  //   * `option.removePromotionQualifierExclusion(q)`  ADDS    the option to `q.excludedOptions`.
  //   * `q.removeExcludedOption(option)`               REMOVES the option from `q.excludedOptions`.
  //
  // BOTH BEHAVIOURS ARE PRESERVED EXACTLY AS WRITTEN AND ARE NOT RECONCILED. Repairing either
  // would change which SKUs a promotion qualifier excludes, which changes which orders qualify,
  // which changes money. This file's correct `removeExcludedOption` is left correct and option.ts's
  // inverted remover is left inverted - each faithful to its own source.

  // =============== START: Custom Validation Methods ====================
  // [model/entity/PromotionQualifier.cfc:L341] opens this block and L343 closes it, and IT IS
  // COMPLETELY EMPTY. That emptiness is consequential rather than incidental: there is also no
  // model/validation/PromotionQualifier.json (see the header note), so this entity has ZERO
  // hand-written validators AND ZERO declaratively-invoked ones. NO zod schema is authored here -
  // schema enforcement is the service tier's concern - and the absent JSON file is not invented.
  // ===============  END: Custom Validation Methods =====================

  // =============== START: Custom Formatting Methods ====================
  // [model/entity/PromotionQualifier.cfc:L345] opens this block and L347 closes it, and IT IS
  // COMPLETELY EMPTY. No `get<Property>Formatted` member exists, which is why
  // `getFormattedValue('qualifierType')` [L102] resolves to the framework's generic rbKey branch
  // rather than to a `custom` delegation [org/Hibachi/HibachiTransient.cfc:L502-L503].
  // ===============  END: Custom Formatting Methods =====================

  // ============== START: Overridden Implicet Getters ===================
  // [model/entity/PromotionQualifier.cfc:L349] opens this block and L351 closes it, and IT IS
  // COMPLETELY EMPTY.
  //
  // LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L349, L351]: the banner text misspells
  // "Implicit" as "IMPLECET" in the source, identically to PromotionCode.cfc. Recorded verbatim
  // here because banner text is source evidence, and normalising it would erase a marker that
  // helps a reviewer confirm which component a section was copied from. Cosmetic only.
  // ==============  END: Overridden Implicet Getters ====================

  // ================== START: Overridden Methods ========================
  // [model/entity/PromotionQualifier.cfc:L353] opens this block and L363 closes it. POPULATED with
  // exactly two members: `getSimpleRepresentationPropertyName()` [L355-L357] and `isDeletable()`
  // [L359-L361].
  //
  // BOTH GENUINELY OVERRIDE a base implementation on the Hibachi chain, and NEITHER carries the
  // TypeScript `override` keyword. That is deliberate and required: `noImplicitOverride` asks for
  // the keyword only where a member overrides a member of an actual base class, and this class
  // extends nothing - the three-level CFML inheritance chain described in the header is replaced by
  // explicit composition, not reproduced. Writing `override` here would not compile. The override
  // relationship is therefore recorded in prose, matching the convention already shipped by the
  // sibling entity files.

  /**
   * `getSimpleRepresentationPropertyName` - which property carries this entity's display label.
   *
   * CFML parity [model/entity/PromotionQualifier.cfc:L355-L357], the body VERBATIM:
   *
   *   public string function getSimpleRepresentationPropertyName() {
   *       return "qualifierType";
   *   }
   *
   * It names `qualifierType` [L53] - the same property `getSimpleRepresentation()` formats above,
   * and the same property whose `hb_formatType="rbKey"` selects the rbKey branch of
   * `getFormattedValue` [org/Hibachi/HibachiTransient.cfc:L504-L510]. The three are consistent in
   * the source and stay consistent here.
   *
   * PURE AND SYNCHRONOUS.
   */
  getSimpleRepresentationPropertyName(): string {
    return 'qualifierType';
  }

  /**
   * `isDeletable` - may this qualifier be deleted?
   *
   * CFML parity [model/entity/PromotionQualifier.cfc:L359-L361], the body VERBATIM:
   *
   *   public boolean function isDeletable() {
   *       return !getPromotionPeriod().isExpired()
   *              && getPromotionPeriod().getPromotion().isDeletable();
   *   }
   *
   * A THREE-LEVEL CROSS-ENTITY CHAIN, AND EVERY FAR-SIDE MEMBER WAS VERIFIED PRESENT BEFORE THIS
   * BODY WAS AUTHORED, so there is no framework-inheritance gap to record here - unlike the
   * `PromotionCode.isDeletable()` case that promotion.ts had to probe for:
   *   * `PromotionPeriod.isExpired()` is declared at [model/entity/PromotionPeriod.cfc:L83] and is
   *     authored in the shipped promotionPeriod.ts.
   *   * `PromotionPeriod.getPromotion()` is the many-to-one accessor for
   *     [model/entity/PromotionPeriod.cfc:L59] and is present in promotionPeriod.ts, typed
   *     `Promotion | undefined`.
   *   * `Promotion.isDeletable()` is declared at [model/entity/Promotion.cfc:L170] and is authored
   *     in the shipped promotion.ts.
   *
   * ★ OPERAND ORDER AND SHORT-CIRCUITING ARE PRESERVED. CFML `&&` short-circuits exactly as
   * TypeScript's does, so when the period IS expired the right-hand operand is never evaluated and
   * `Promotion.isDeletable()` is NEVER REACHED. That is observable - a period whose promotion is
   * unreachable still answers `false` rather than raising, provided the period itself is present -
   * so the order is load-bearing and is not rearranged.
   *
   * ★ `getPromotionPeriod()` IS CALLED TWICE IN THE SOURCE. That is a legacy inefficiency, NOT a
   * defect, and it carries no LEGACY-DEFECT marker. It is bound to a local below for readability.
   * The rewrite is behaviour-preserving because the accessor is a pure field read with no side
   * effect and the field cannot change between the two reads inside this method, and because the
   * local is taken BEFORE the expiry test - so the evaluation ORDER is unchanged.
   *
   * ★★ TWO DISTINCT RAISES ARE PRESERVED, NOT ONE. THE CHAIN HAS TWO NULLABLE LINKS.
   *   1. `getPromotionPeriod()` can be `undefined`: the foreign key is nullable because
   *      [model/entity/PromotionQualifier.cfc:L68] declares no `notnull`, and
   *      `removePromotionPeriod()` clears it outright. CFML dereferencing it is a null-reference
   *      error - and note the ORDERING CONSEQUENCE: this raise happens BEFORE the expiry
   *      short-circuit can spare it, because the dereference is the first thing L360 evaluates. An
   *      absent period therefore RAISES rather than answering `false`.
   *   2. `getPromotion()` can be `undefined` too - promotionPeriod.ts types it
   *      `Promotion | undefined` honestly, because [model/entity/PromotionPeriod.cfc:L59] is a
   *      nullable many-to-one that a repository may not have materialised. CFML calling
   *      `.isDeletable()` on it is the same class of null-reference error.
   *
   * NEITHER RAISE IS SOFTENED. NO OPTIONAL CHAIN (`?.`) IS ADDED AND NO FALLBACK BOOLEAN IS
   * RETURNED, because either would answer a DIFFERENT QUESTION than the legacy does: `?.` would
   * yield `undefined` and coerce to a falsy "not deletable", silently reporting that a deletable
   * qualifier cannot be deleted whenever its graph was fetched shallowly. Behaviour preservation
   * extends to defects - a member that throws at runtime today throws in the target - and the two
   * messages are distinguishable so a reviewer can tell which link failed.
   *
   * COSMETIC CONTRAST, recorded for completeness: [model/entity/PromotionPeriod.cfc:L87] spells its
   * own declaration `isDeletable ()` WITH A SPACE before the parenthesis, whereas L359 here has
   * none. Harmless CFML whitespace; not reproduced.
   *
   * SYNCHRONOUS - the whole chain traverses already-materialised associations.
   *
   * @throws Error when `promotionPeriod` is absent, or when the reached period has no promotion.
   */
  isDeletable(): boolean {
    // [L360] The FIRST `getPromotionPeriod()` dereference, evaluated ahead of everything else -
    // which is why an absent period raises rather than short-circuiting to `false`. `isNullish`
    // carries the CFML absence semantics; the `=== undefined` operand is a TYPE-NARROWING step
    // only, since `isNullish` returns `boolean` rather than a type predicate.
    const promotionPeriod: PromotionPeriod | undefined = this.promotionPeriod;

    if (isNullish(promotionPeriod) || promotionPeriod === undefined) {
      throw new Error(
        'PromotionQualifier.isDeletable cannot reach its promotion period: ' +
          'model/entity/PromotionQualifier.cfc:L360 calls getPromotionPeriod().isExpired() with ' +
          'no null guard, so an unmaterialized or cleared promotion period is a CFML ' +
          'null-reference error. The foreign key is nullable - ' +
          'model/entity/PromotionQualifier.cfc:L68 declares no notnull - and ' +
          'removePromotionPeriod() clears it outright, which is what makes this reachable.',
      );
    }

    // [L360] `!getPromotionPeriod().isExpired() && ...` - the short-circuit arm. On this path the
    // right-hand operand is never evaluated, so the promotion is NOT reached and cannot raise.
    if (promotionPeriod.isExpired()) {
      return false;
    }

    // [L360] The SECOND nullable link. Deliberately left to type inference rather than annotated:
    // the import ledger for this file is closed at two value imports and six type-only entity
    // imports, and `Promotion` is not among them, so naming the type here would require a seventh
    // import that this entity does not otherwise need. Inference gives the same
    // `Promotion | undefined` with no import at all.
    const promotion = promotionPeriod.getPromotion();

    if (isNullish(promotion) || promotion === undefined) {
      throw new Error(
        'PromotionQualifier.isDeletable reached its promotion period but the period has no ' +
          'promotion: model/entity/PromotionQualifier.cfc:L360 calls ' +
          'getPromotionPeriod().getPromotion().isDeletable() with no null guard, and ' +
          'model/entity/PromotionPeriod.cfc:L59 is a nullable many-to-one that a repository may ' +
          'not have materialized. CFML raises a null-reference error here rather than answering ' +
          'false, and that answer is preserved.',
      );
    }

    return promotion.isDeletable();
  }

  // ==================  END:  Overridden Methods ========================

  // =================== START: ORM Event Hooks  =========================
  // [model/entity/PromotionQualifier.cfc:L365] opens this block and L367 closes it, and IT IS
  // COMPLETELY EMPTY.
  //
  // ★ NOTHING IS AUTHORED HERE: no `preInsert`, no `preUpdate`, no path-maintenance method, no UUID
  // seeding. This entity has NO materialized-path column of any kind, so there is no path to
  // maintain.
  //
  // THE CONSEQUENCE FOR THE PROJECT-WIDE PLAN IS WORTH STATING: the Agent Action Plan's mandate to
  // reshape ORM lifecycle hooks into repository-invoked maintenance methods is VACUOUS FOR THIS
  // FILE - there is nothing to reshape, so no reshaping budget is touched. The hook census stays
  // final at four in-scope entities - Category [model/entity/Category.cfc:L126 preInsert, L131
  // preUpdate], PriceGroup [model/entity/PriceGroup.cfc:L206, L211], ProductType
  // [model/entity/ProductType.cfc:L305, L310] and PromotionCode [model/entity/PromotionCode.cfc:L179,
  // insert-only]. PromotionQualifier ADDS NO FIFTH, exactly as Promotion [L176/L178, also empty]
  // added none.
  // ===================  END:  ORM Event Hooks  =========================

  // ================== START: Deprecated Methods ========================
  // [model/entity/PromotionQualifier.cfc:L369] opens this block and L371 closes it, and IT IS
  // COMPLETELY EMPTY. A section also present-and-empty in PromotionCode.cfc. Nothing is authored.
  // ==================  END:  Deprecated Methods ========================
}

// =========================================================================================
// ANTI-CONTRACTS - MEMBERS THAT DELIBERATELY DO NOT EXIST ON THIS CLASS
//
// Recorded because their ABSENCE is a decision with consequences, and an absence is invisible
// unless it is written down. A future agent reaching for any of these should read this block
// first.
//
// ★★★ 1. NO `setPromotion` AND NO `removePromotion`. THIS IS THE MOST IMPORTANT ENTRY.
// model/entity/PromotionPeriod.cfc:L126 and :L129 call `setPromotion(...)` and
// `removePromotion(...)` ON A PromotionQualifier:
//
//     public void function addPromotionQualifier(required any promotionQualifier) {
//         arguments.promotionQualifier.setPromotion( this );
//     }
//     public void function removePromotionQualifier(required any promotionQualifier) {
//         arguments.PromotionQualifier.removePromotion( this );
//     }
//
// THOSE TWO CALLS ARE CONFIRMED THROWING DEFECTS, and they throw PRECISELY BECAUSE THIS ENTITY
// HAS NO SUCH MEMBERS. `setPromotion` matches NO branch of the dynamic dispatcher - the eleven
// patterns at [org/Hibachi/HibachiEntity.cfc:L507-L565] are all `has*`/`get*` shapes, none
// beginning `set` - so control falls through to the THROW at
// [org/Hibachi/HibachiEntity.cfc:L565]. `removePromotion` likewise. The relationship this entity
// actually owns is to a PROMOTION PERIOD [L68], not to a promotion, so the correct members are
// `setPromotionPeriod` / `removePromotionPeriod` above and nothing else.
//
// AUTHORING `setPromotion`/`removePromotion` HERE TO MAKE THOSE CALLS RESOLVE WOULD BE A DOUBLE
// VIOLATION: it would repair a defect the plan requires preserved, and it would imply a
// qualifier-to-promotion foreign key that the schema does not have - contradicting the
// schema-continuity constraint. The shipped promotionPeriod.ts already publishes this
// anti-contract from its side; this is the matching half.
//
// 2. NO `getQualifierApplicationTypeOptions()`. The property is declared at
// model/entity/PromotionQualifier.cfc:L99 and the method does not exist - see the DOUBLE ORPHAN
// LEGACY-DEFECT above. Reproducing the source's member set exactly is faithful, not lazy.
//
// 3. NO `rewardMatchingTypeOptions` PROPERTY. The other half of the same orphan pair: the method
// exists at L107 with no declared property. Neither half is normalised.
//
// 4. NO `preInsert`, NO `preUpdate`, NO path-maintenance method. The ORM Event Hooks banner pair
// at L365/L367 is empty and this entity carries no materialized-path column.
//
// 5. NO `attributeValues` MEMBER AND NO EAV ACCESSOR. This component declares zero
// `attributeValues`; the project-wide census finds exactly four declarations - Sku.cfc:L70,
// Product.cfc:L75, ProductType.cfc:L67 and Brand.cfc:L60 - and the EAV path is not ported. The
// twelve `getService(...)` sites on the intermediate model/entity/HibachiEntity.cfc [L123, L130,
// L135, L145, L178, L180, L182, L194, L196, L207, L257, L266], seven of them `attributeService`,
// are moot for that reason and must not be silently re-implemented.
//
// 6. NO SMART-LIST MEMBER. `get*SmartList` and `get*OptionsSmartList` are Hibachi query-builder
// artifacts replaced project-wide by typed repository queries.
//
// 7. NO ZOD SCHEMA. model/validation/PromotionQualifier.json does not exist - it is one of the six
// confirmed deliberate absences alongside Category.json, PromotionApplied.json,
// PromotionAccount.json, Product_AddOption.json and Product_AddOptionGroup.json - and the absent
// file is not invented. Contrast model/validation/PromotionReward.json, which DOES exist, giving
// the sibling entity obligations this one does not have. No length constraint is added to
// `qualifierType` [L53 declares none] and no range constraint to any of the ten gates.
//
// 8. NO ENTITY-TYPED Group A ACCESSORS. There is no `getFulfillmentMethods()`,
// `getShippingMethods()` or `getShippingAddressZones()` returning entity arrays, and no
// `FulfillmentMethod`, `ShippingMethod` or `AddressZone` type is imported or referenced - those
// subsystems are out of scope. The link-table contract survives as the three opaque identifier
// arrays above.
//
// 9. NO `Account` TYPE. The two audit foreign keys are inert identifier columns, matching the
// treatment in every already-shipped entity file.
//
// 10. NO INJECTED PORT OF ANY KIND. This component has ZERO `getService(` sites, so there is no
// collaborator to inject, no `async` member, and no reason for this module to import from
// src/domain/ports/**.
// =========================================================================================

// =========================================================================================
// WHAT THE REPOSITORY LAYER OWNS - STATED SO THE BOUNDARY IS AUDITABLE, NOT IMPLEMENTED HERE
//
// Associations are MATERIALIZED AT THE REPOSITORY BOUNDARY and laziness is NOT simulated: there
// is no proxy, no deferred loader and no lazy-collection emulation anywhere in this file. That
// converts every implicit Hibernate lazy load into an explicit query decision and removes the
// N+1 hazard that unbounded graph walking creates.
//
// src/repositories/mysql/mysqlPromotionRepository.ts (planned) owns:
//   * row -> entity hydration from `SwPromoQual`, including the four currency gates as `Money`
//     and the two weight gates as plain numbers;
//   * materializing the ten in-scope collections from `SwPromoQualBrand`, `SwPromoQualOption`,
//     `SwPromoQualSku`, `SwPromoQualProduct`, `SwPromoQualProductType`, `SwPromoQualExclBrand`,
//     `SwPromoQualExclOption`, `SwPromoQualExclSku`, `SwPromoQualExclProduct` and
//     `SwPromoQualExclProductType`;
//   * populating the three opaque identifier arrays from `SwPromoQualFulfillmentMethod`,
//     `SwPromoQualShippingMethod` and `SwPromoQualShipAddressZone`;
//   * maintaining `createdDateTime`, `createdByAccountID`, `modifiedDateTime` and
//     `modifiedByAccountID`, which are `hb_populateEnabled="false"` and therefore never
//     caller-supplied;
//   * documenting the FETCH SHAPE at each producing method, because with no ORM the eager-load
//     decision is an explicit, reviewable choice rather than an emergent one.
//
// CONTEXT ONLY, IMPLEMENTED NOWHERE HERE: model/dao/PromotionDAO.cfc:L51
// `getActivePromotionRewards` has NO `ORDER BY`, which is what makes reward iteration order
// non-deterministic in the promotion engine. That fact belongs to src/services and is recorded
// here purely so nobody looks for the cause inside this entity.
// =========================================================================================

// =========================================================================================
// THE DELETE-CONTEXT ANTI-CORRUPTION TENSION - RECORDED SO THE PATTERN STAYS VISIBLE
//
// Elsewhere in the project, delete-context validation rules of the `maxCollection: 0` shape assert
// that a row may only be deleted when some collection is empty. Because Group A is exposed here as
// three opaque identifier arrays that DEFAULT TO EMPTY, any such rule written over
// `fulfillmentMethods`, `shippingMethods` or `shippingAddressZones` would TRIVIALLY PASS in
// TypeScript where it could legitimately BLOCK in CFML - the domain object simply would not be
// holding the rows the rule counts.
//
// No such rule targets this entity today: model/validation/PromotionQualifier.json does not exist
// at all, so the tension is latent rather than live. It is recorded because the shape recurs, and
// because the correct resolution is unambiguous - DELETE-CONTEXT ENFORCEMENT BELONGS TO THE
// SERVICE AND REPOSITORY TIERS, which can count link-table rows directly, and NOT to an entity
// that deliberately does not materialize them.
// =========================================================================================

// =========================================================================================
// THE TEST OBLIGATION FOR THIS MODULE - DECLARED HERE, AUTHORED ELSEWHERE
//
// Every converted method requires a test. NO TEST FILE IS CREATED BY THIS MODULE: slatwall-ts/tests
// is owned by a different agent, and creating a suite here would breach the single-file scope.
// This block is the contract that agent inherits.
//
// TARGET SUITE: slatwall-ts/tests/unit/domain/entities/promotionQualifier.test.ts
//
// ★★★ THIS SUITE IS NET-NEW AND MUST BE LABELLED NET-NEW. IT MUST NEVER BE PRESENTED AS PARITY
// WITH LEGACY COVERAGE. There is NO legacy test for this entity: meta/tests/unit/entity/ contains
// no PromotionQualifierTest.cfc. Only TWO of the eighteen entity suites extend legacy coverage -
// brand.test.ts, carrying forward `defaults_are_correct()` from
// meta/tests/unit/entity/BrandTest.cfc, and product.test.ts, carrying forward
// `productUrlIsCorrectlyFormatted()` from meta/tests/unit/entity/ProductTest.cfc. A third legacy
// file, meta/tests/functional/admin/entity/ProductTest.cfc, is an EMPTY STUB acknowledged as a gap
// and never counted as coverage. slatwall-ts/tests/traceability/legacyTestMap.ts must record this
// module as NET-NEW, and will fail the suite if the module has no test at all - mirroring the
// structural floor that `EntityCoverageTest.all_entities_have_test_cases()` enforces in the legacy
// suite.
//
// CASES THE SUITE MUST COVER:
//   1. ALL TEN GATES DEFAULT TO `undefined`, AND NOT ONE DEFAULTS TO `0`. The highest-value
//      assertion in the file: `undefined` on a `maximum*` gate means UNLIMITED, so coalescing it
//      to `0` would turn "unlimited" into "nothing qualifies" and silently suppress every discount
//      that gate governs.
//   2. The four currency gates [L57, L58, L61, L62] round-trip as `Money`; the two weight gates
//      [L63, L64] round-trip as plain `number` and are NOT `Money`.
//   3. `rewardMatchingType` accepts exactly the five `RewardMatchingType` values and no sixth.
//   4. `getRewardMatchingTypeOptions()` returns five entries IN SOURCE ORDER with the exact
//      `value` strings `any`, `sku`, `product`, `productType`, `brand`, and the exact rbKey
//      `name` strings. Two calls must not share array identity.
//   5. `getSimpleRepresentationPropertyName()` returns `'qualifierType'`.
//   6. `getSimpleRepresentation()` composition, BOTH BRANCHES: the composed rbKey suffix when
//      `qualifierType` is present, and the prefix-plus-separator-plus-nothing result when it is
//      absent - including the trailing space, and asserting that it does NOT throw.
//   7. `hasAnyOption` / `hasAnyExcludedOption`: `false` for an empty input array; `true` for a
//      primary-key match; `false` for a distinct primary key. Crucially, a DIFFERENT INSTANCE
//      CARRYING THE SAME PRIMARY KEY must match, proving the comparison is not by reference.
//   8. All ten singular `has*` predicates: `false` on an empty collection; `true` on a
//      primary-key match.
//   9. Each of the ten `add*`: appends near-side once, appends far-side once, and is idempotent
//      for a PERSISTED argument. Also assert the non-idempotent transient path, since
//      `isNew()` short-circuits the containment probe and a transient IS appended twice.
//  10. Each of the eleven `remove*`: deletes on BOTH sides - AND INCLUDING THE INDEX-0 CASE,
//      which is the specific regression that catches a `> 0` guard written against a `findIndex`
//      result.
//  11. `setPromotionPeriod` assigns the field unconditionally and appends far-side under the
//      guard.
//  12. `removePromotionPeriod` with NO argument defaults from the field and clears it; and THROWS
//      when both the argument and the field are absent.
//  13. `isDeletable()` returns `false` when the period is expired WITHOUT consulting the promotion
//      (assert the short-circuit by supplying a period whose promotion is absent and expecting
//      `false`, not a raise); returns `true` only when the period is unexpired and the promotion
//      is deletable; THROWS when `promotionPeriod` is absent; and THROWS when the period's
//      promotion is absent on the unexpired path.
//  14. The three opaque identifier arrays default to `[]` and round-trip string identifiers.
//  15. All ten in-scope collections default to `[]`.
//  16. THE TEN COLLECTION ACCESSORS RETURN LIVE REFERENCES - mutating the returned array must be
//      observable through the entity - while the three Group A accessors and
//      `getRewardMatchingTypeOptions()` are `readonly`.
//  17. `isNew()` is `true` for an unsaved primary key and `false` for a populated one.
//  18. Regression tests follow the `issue_<ticket#>` naming convention carried over from
//      meta/tests/unit/IssuesTest.cfc.
//
// The suite must run NON-INTERACTIVELY - slatwall-ts/vitest.config.ts disables watch mode - so the
// gate is usable in an automated refine loop.
// =========================================================================================
