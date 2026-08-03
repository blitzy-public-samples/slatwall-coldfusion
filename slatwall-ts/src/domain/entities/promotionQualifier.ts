// ---------------------------------------------------------------------------
// slatwall-ts - PromotionQualifier entity
//
// Port of model/entity/PromotionQualifier.cfc (373 lines): the GATE half of the promotion engine.
// `Promotion` -> `PromotionPeriod` -> { QUALIFIERS decide WHETHER a promotion applies, REWARDS
// decide WHAT it gives }. `getQualifierQualificationDetails()`
// [model/service/PromotionService.cfc:L629-L750] reads the ten numeric gates and the thirteen
// collections to answer that question, and `getOrderItemInQualifier()`
// [model/service/PromotionService.cfc:L852-L919] walks the membership collections. Both sit inside
// the must-preserve discount pipeline, so every property below is load-bearing. Its consumers are
// src/services/promotion/qualifierQualification.ts and
// src/services/promotion/orderItemMembership.ts.
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/PromotionQualifier.cfc:L49]
//
//   component displayname="Promotion Qualifier" entityname="SlatwallPromotionQualifier"
//   table="SwPromoQual" persistent="true" extends="HibachiEntity" cacheuse="transactional"
//   hb_serviceName="promotionService" hb_permission="promotionPeriod.promotionQualifiers" {
//
// Read that attribute list as exhaustive: `persistent="true"` is QUOTED, as on Promotion,
// PromotionCode, PromotionPeriod, PromotionApplied and PromotionAccount, and in direct contrast to
// PriceGroup / PriceGroupRate, whose declarations read
//   `persistent=true output=false accessors=true`
// UNQUOTED. There is no `accessors=`, no `output=` and no `hb_processContexts`.
//
// Schema continuity is a binding constraint: entity property metadata IS the contract. NOTE THE
// ABBREVIATED PHYSICAL TABLE NAME - `SwPromoQual`, NOT `SwPromotionQualifier`, matching
// PromotionReward's `SwPromoReward` - and note that five of the thirteen link tables are
// abbreviated further still (`SwPromoQualExclBrand`, `SwPromoQualShipAddressZone`, and so on). All
// fourteen names are carried forward verbatim below: no migration, no rename, no new table, no
// column change, and no "correcting" the abbreviation.
//
// `hb_serviceName="promotionService"` is why there is no `PromotionQualifierService` to port and no
// such omission to explain: CRUD for this entity lives in the promotion service. And
// `hb_permission="promotionPeriod.promotionQualifiers"` IS SPELLED CORRECTLY, the direct contrast
// to [model/entity/PromotionReward.cfc:L57], whose equivalent reads
// `hb_permission="promotionPeriod.promtionRewards"` - missing the `o` in "promotion". The sibling's
// misspelling is the one identifier in that file requiring a documented rename; THIS FILE REQUIRES
// NONE, and none is invented.
//
// THE `extends` CHAIN IS THREE LEVELS DEEP, NOT TWO. `extends="HibachiEntity"` on L49 is
// UNQUALIFIED, so it resolves to the LOCAL model/entity/HibachiEntity.cfc (274 lines), which itself
// extends `Slatwall.org.Hibachi.HibachiEntity`. The intermediate class holds twelve
// `getService(...)` sites - L123, L130, L135, L145, L178, L180, L182, L194, L196, L207, L257, L266,
// seven of them `attributeService` - all MOOT here because the EAV path is not ported. Neither base
// level is ported.
//
// EVERY MEMBER OF THIS FILE IS SYNCHRONOUS. A method becomes `async` if and only if its legacy body
// reaches the DAO or ORM, and no body here does: all 373 lines read, ZERO `getService(` sites, so
// no port is injected, the constructor takes data only, and `async` / `await` / `Promise` do not
// appear below.
//
// THE SOURCE'S BANNER MAP, recorded once so the structure is auditable without reopening the CFC,
// and so the 27-line L328 -> L355 gap is definitively closed - there are NO hidden declarations in
// it, only the banner pairs listed here. Unlike PromotionAccount [L117/L119], PromotionPeriod
// [L154/L156] and PromotionCode [L153/L155] there are no duplicate pairs and no missing END banner,
// and L54 is a blank line inside the property block with no declaration hiding in it.
//
//   | banner pair                      | lines     | state                                    |
//   |
//   ----------------------------------
//   |
//   -----------
//   |
//   ------------------------------------------
//   |
//   | (no banner - floats free)        | L101-L103 | getSimpleRepresentation                  |
//   | Non-Persistent Property Methods  | L105/L117 | POPULATED - getRewardMatchingTypeOptions |
//   | Bidirectional Helper Methods     | L119/L339 | POPULATED - the eleven pairs             |
//   | Custom Validation Methods        | L341/L343 | EMPTY                                    |
//   | Custom Formatting Methods        | L345/L347 | EMPTY                                    |
//   | Overridden Implicet Getters      | L349/L351 | EMPTY (source misspells "Implicit")      |
//   | Overridden Methods               | L353/L363 | POPULATED - two members                  |
//   | ORM Event Hooks                  | L365/L367 | EMPTY                                    |
//   | Deprecated Methods               | L369/L371 | EMPTY                                    |
//
// VALIDATION: THERE IS NO model/validation/PromotionQualifier.json, AND THAT ABSENCE IS DELIBERATE
// RATHER THAN AN OVERSIGHT TO CORRECT. Fifteen in-scope entities and process objects have a
// validation file and six do not - Category, PromotionQualifier, PromotionApplied,
// PromotionAccount, Product_AddOption and Product_AddOptionGroup. Coverage is ported AS IT IS
// rather than completed, so no schema is invented here: enforcement belongs to the service tier,
// while entities carry the property metadata. In practical terms NOTHING validates the ten numeric
// gates - a negative minimum, or a maximum below its own minimum, is accepted by the legacy system
// and must be accepted here - and there is no length constraint on `qualifierType`, because L53
// declares none. Contrast model/validation/PromotionReward.json, which DOES exist, so the sibling
// carries obligations this file does not. Consequently there are ZERO declaratively-invoked entity
// methods on this class.
//
// JavaRB IS NOT PORTED AND NO i18n RUNTIME IS INTRODUCED. Every `rbKey` / `hb_rbKey` /
// `hb_nullRBKey` identifier is preserved verbatim as an inert string constant so the legacy admin
// can still resolve it, and no resolver is invented to consume them.
// ---------------------------------------------------------------------------

import { isNullish } from '../../lib/cfml/truthiness.js';
import type { Money } from '../valueObjects/money.js';
import type { Brand } from './brand.js';
import type { Option } from './option.js';
import type { Product } from './product.js';
import type { ProductType } from './productType.js';
import type { PromotionPeriod } from './promotionPeriod.js';
import type { Sku } from './sku.js';

// THE IMPORT LEDGER, AND WHY IT IS CLOSED AT EIGHT SPECIFIERS. `isNullish` is the project's CFML
// `isNull()` parity helper and the ONLY value import, used at three load-bearing sites: the
// `qualifierType` presence test inside `getSimpleRepresentation()`, the two-level unguarded climb
// in `isDeletable()`, and the resolved-target test in `removePromotionPeriod()`. `Money` is
// imported as a TYPE, not a value, because the four currency gates are inert threshold columns, so
// it appears only in type positions and `@typescript-eslint/consistent-type-imports` therefore
// REQUIRES `import type`. The six sibling entities are all `import type`: the entity-to-entity
// cycles here are TYPE-ONLY and erased at emit, so they never exist at runtime, and a value import
// to a sibling entity must never be introduced.
//
// DELIBERATELY ABSENT, each for a stated reason: `decimal.js`, because only
// src/lib/cfml/precision.ts and src/lib/cfml/numberFormat.ts may import it and `Money` is the sole
// arithmetic surface regardless; `numberFormat.ts`, `list.ts` and `precision.ts`, because this file
// formats nothing, parses no comma list and evaluates no expression; `struct.ts`, because the only
// struct operations in the source are `structKeyExists(arguments, "promotionPeriod")` [L129] and
// `structDelete(variables, "promotionPeriod")` [L136], both of which manipulate CFML ARGUMENT SCOPE
// and PRIVATE INSTANCE STATE rather than a domain-data struct with case-insensitive keys, so they
// become a TypeScript optional parameter and a field assignment of `undefined`; `cfBoolean` /
// `cfLen` / `cfTruthy`, because this entity declares ZERO persistent booleans of either casing
// (L52-L99 re-read line by line: no `ormtype="boolean"`, no `ormType="boolean"`, and no `default=`
// anywhere except the PK's `default=""` on L52) and there is no `len()` call and no empty-string
// truthiness test; `currencyCode.ts`, because THIS ENTITY HAS NO `currencyCode` COLUMN;
// `materializedIdPath.ts`, because this entity has no path column - the `productTypes` membership
// test DOES walk `productTypeIDPath`, but that walk lives in
// src/services/promotion/orderItemMembership.ts; and `../ports/*.ts`, `config.ts` and `logger.ts`,
// because zero `getService(` sites means zero injected collaborators.

/**
 * The authoritative vocabulary of `rewardMatchingType` [model/entity/PromotionQualifier.cfc:L65].
 *
 * These are not five plausible values - they are the exact five that
 * `getRewardMatchingTypeOptions()` [model/entity/PromotionQualifier.cfc:L107-L115] offers, in the
 * source's own order, and L65 declares `hb_formFieldType="select"`, so the option list IS the admin
 * form's domain. No sixth member may be added, none renamed, none reordered.
 *
 * WHY THIS COLUMN IS NARROWED WHILE `qualifierType` [L53] IS NOT: the difference is evidence, not
 * taste. This property has a self-declared option list on the entity; `qualifierType` has none -
 * there is no `getQualifierTypeOptions()` anywhere in the file - and the engine tests it with a
 * CASE-INSENSITIVE comma-list membership check [model/service/PromotionService.cfc:L714], so
 * narrowing it would reject data the legacy schema accepts.
 *
 * Exported as a TYPE ALIAS alongside the class, which keeps the one-exported-runtime-unit rule
 * intact because a type alias is erased at emit.
 */
export type RewardMatchingType = 'any' | 'sku' | 'product' | 'productType' | 'brand';

/**
 * One row of `getRewardMatchingTypeOptions()`. [model/entity/PromotionQualifier.cfc:L107-L115]
 *
 * A `type` alias rather than an `interface`, and that is load-bearing: an `interface` is NOT
 * assignable to `Readonly<Record<string, unknown>>` (TS2322) because it has no implicit index
 * signature, whereas a type alias is. The same decision is recorded on `ParentPriceGroupOption` in
 * src/domain/entities/priceGroup.ts.
 *
 * `name` carries the resource-bundle KEY, unresolved: JavaRB is not ported, so the key is preserved
 * verbatim as an inert string rather than replaced by English text.
 */
type RewardMatchingTypeOption = {
  readonly name: string;
  readonly value: RewardMatchingType;
};

/**
 * A single promotion qualifier - the GATE that decides whether a promotion period applies.
 *
 * A CLASS rather than an interface, because the legacy entity carries BEHAVIOUR and not merely
 * data: an overridden `getSimpleRepresentation()`, a self-declared option list, an `isDeletable()`
 * that climbs two levels of parent, and eleven bidirectional helper pairs. Collapsing that into
 * free functions would break interface parity, which is the acceptance contract - the public method
 * names below are the legacy CFML names verbatim.
 *
 * ASSOCIATIONS ARE MATERIALIZED AT THE REPOSITORY BOUNDARY AND LAZINESS IS NOT SIMULATED. That
 * matters more than usual here: the promotion engine reads several of the thirteen collections for
 * EVERY order item on EVERY qualifier, so a lazy-shaped port would have produced a textbook N+1
 * inside the pricing path.
 *
 * ALL MONEY PASSES THROUGH `Money`. The four `hb_formatType="currency"` gates are `Money`; the two
 * `hb_formatType="weight"` gates are deliberately NOT - see the gate group below.
 *
 * TWO MEMBERS CAN THROW, and each says so on itself: `isDeletable()` and `removePromotionPeriod()`.
 * Every other member is total, `getSimpleRepresentation()` included.
 */
export class PromotionQualifier {
  // ============
  // START: Persistent Properties
  // ===========================
  // [model/entity/PromotionQualifier.cfc:L51-L96]

  /**
   * [model/entity/PromotionQualifier.cfc:L52]
   *   `ormtype="string" length="32" fieldtype="id" generator="uuid" unsavedvalue="" default=""`
   *
   * A 32-character UUID. `unsavedvalue=""` with `default=""` makes an unsaved row's key the empty
   * string, which makes `isNew()` a simple emptiness test. This is the primary key every
   * containment predicate in this class compares on, and it is read across the module boundary by
   * `PromotionPeriod.hasPromotionQualifier` and by the `hasPromotionQualifier` /
   * `hasPromotionQualifierExclusion` pairs on brand, option, sku, product and productType.
   */
  private readonly promotionQualifierID: string;

  /**
   * [model/entity/PromotionQualifier.cfc:L53] `ormtype="string" hb_formatType="rbKey"`. No
   * `length`, no `notnull`, no `default`.
   *
   * THE DISCRIMINATOR THE ENGINE BRANCHES ON, and the property
   * `getSimpleRepresentationPropertyName()` names. `getQualifierQualificationDetails()` switches on
   * it at [model/service/PromotionService.cfc:L678] for the fulfillment branch and at
   * [model/service/PromotionService.cfc:L714] via
   * `listFindNoCase("contentAccess,merchandise,subscription", getQualifierType())` for the item
   * branch.
   *
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L53]: DELIBERATELY NOT NARROWED TO A UNION.
   * That second test is CASE-INSENSITIVE and comma-list based, the column carries no check
   * constraint, there is no `getQualifierTypeOptions()` anywhere in the component, and no
   * validation file exists for this entity. A union would fabricate a constraint the source does
   * not impose and reject data the legacy schema accepts. Contrast `rewardMatchingType` below,
   * which DOES have a self-declared vocabulary and IS narrowed.
   */
  private readonly qualifierType: string | undefined;

  // --- THE TEN NUMERIC GATES [model/entity/PromotionQualifier.cfc:L55-L64]
  //
  //   | loc | property                 | ormtype     | hb_formatType | hb_nullRBKey     | TS type |
  //   |-----|
  //   --------------------------
  //   |
  //   -------------
  //   |
  //   ---------------
  //   |
  //   ------------------
  //   |
  //   ---------
  //   |
  //   | L55 | minimumOrderQuantity     | integer     | -             | define.0         | number  |
  //   | L56 | maximumOrderQuantity     | integer     | -             | define.unlimited | number  |
  //   | L57 | minimumOrderSubtotal     | big_decimal | currency      | define.0         | Money   |
  //   | L58 | maximumOrderSubtotal     | big_decimal | currency      | define.unlimited | Money   |
  //   | L59 | minimumItemQuantity      | integer     | -             | define.0         | number  |
  //   | L60 | maximumItemQuantity      | integer     | -             | define.unlimited | number  |
  //   | L61 | minimumItemPrice         | big_decimal | currency      | define.0         | Money   |
  //   | L62 | maximumItemPrice         | big_decimal | currency      | define.unlimited | Money   |
  //   | L63 | minimumFulfillmentWeight | big_decimal | weight        | define.0         | number  |
  //   | L64 | maximumFulfillmentWeight | big_decimal | weight        | define.unlimited | number  |
  //
  // EXACTLY TEN, verified by reading L55-L64 individually; L54 is a blank line.
  //
  // THE THREE ABSENCE CONVENTIONS OF THIS FOLDER, STATED SIDE BY SIDE AND NEVER COLLAPSED. They
  // point in opposite directions, and each collapse is a money bug:
  //   1. `Sku.getPriceByCurrencyCode()` returns `Money | undefined`, NEVER `0`
  //      [model/entity/Sku.cfc:L269-L273] - no `else`, no fallback, so `0` would sell for free.
  //   2. `Product.getSalePrice()` returns `0`, NEVER `undefined` - [model/entity/Product.cfc:L598]
  //      omits a `return` and falls through to `return 0`.
  //   3. PROMOTION USE-LIMITS AND GATE BOUNDS STAY `undefined`, NEVER `0`, because `undefined`
  //      means UNLIMITED / NO BOUND - the PERMISSIVE extreme. THIS ENTITY IS #3'S CANONICAL HOME.
  //
  // CONVENTION #3 IS MADE LITERAL IN THIS ENTITY'S METADATA: EVERY `minimum*` carries
  // `hb_nullRBKey="define.0"` and EVERY `maximum*` carries `hb_nullRBKey="define.unlimited"`, with
  // NO `default=` on any of the ten, so the database stores NULL and the entity must surface
  // `undefined`. Coalescing any `maximum*` to `0` would turn "unlimited" into "nothing qualifies"
  // and silently suppress every discount that gate governs; coalescing any `minimum*` to `0` is
  // ALSO wrong, because `hb_nullRBKey` is a DISPLAY directive rather than a storage default and the
  // engine's own `isNull()` tests decide whether a gate applies at all - every comparison at
  // [model/service/PromotionService.cfc:L769, L771] is guarded by `!isNull(...)` first. Presence
  // tests therefore use `isNullish`, and `??` is NEVER used to inject a numeric default.
  //
  // AND NOTE: THIS ENTITY HAS NO `currencyCode` COLUMN, so the four `Money` gates carry no currency
  // of their own - they are compared against order and item amounts whose currency is resolved
  // elsewhere. Recorded so no one later "fixes" it by adding a currency column.
  private readonly minimumOrderQuantity: number | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L56] `ormtype="integer" hb_nullRBKey="define.unlimited"`.
   * `undefined` means UNLIMITED - never `0`.
   */
  private readonly maximumOrderQuantity: number | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L57]: `ormtype="big_decimal"` with
   * `hb_formatType="currency"` and `hb_nullRBKey="define.0"`, so this gate is `Money` and never a
   * `number`. A `big_decimal` column compared against an order subtotal is currency by both
   * metadata and use, and all currency in the target flows through the single arithmetic surface.
   */
  private readonly minimumOrderSubtotal: Money | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L58]: `ormtype="big_decimal"` with
   * `hb_formatType="currency"` and `hb_nullRBKey="define.unlimited"`. `Money`, and `undefined`
   * means UNLIMITED - coalescing this one to zero would disqualify every order.
   */
  private readonly maximumOrderSubtotal: Money | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L59] `ormtype="integer" hb_nullRBKey="define.0"`.
   */
  private readonly minimumItemQuantity: number | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L60] `ormtype="integer" hb_nullRBKey="define.unlimited"`.
   */
  private readonly maximumItemQuantity: number | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L61]: `ormtype="big_decimal"` with
   * `hb_formatType="currency"` and `hb_nullRBKey="define.0"`. `Money`, compared against an order
   * item's price.
   */
  private readonly minimumItemPrice: Money | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L62]: `ormtype="big_decimal"` with
   * `hb_formatType="currency"` and `hb_nullRBKey="define.unlimited"`. `Money`, and `undefined`
   * means UNLIMITED.
   */
  private readonly maximumItemPrice: Money | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L63]: `ormtype="big_decimal"` with
   * `hb_formatType="weight"` and `hb_nullRBKey="define.0"` - MODELLED AS `number`, NOT AS `Money`,
   * AND THAT IS DELIBERATE. WEIGHT IS NOT CURRENCY: `Money` carries currency semantics and currency
   * formatting, so typing a shipping weight as `Money` would assert a currency this column does not
   * have and hand the value formatting it must never receive. That is not a breach of the
   * single-arithmetic-surface rule, which governs MONEY. There is no `Weight` value object in
   * ../valueObjects/ (which holds exactly money.ts, currencyCode.ts and materializedIdPath.ts) and
   * none is created here.
   *
   * THIS ENTITY PERFORMS ZERO ARITHMETIC ON EITHER WEIGHT GATE. They are inert threshold columns,
   * read and compared by src/services/promotion/qualifierQualification.ts against
   * `orderFulfillment.getTotalShippingWeight()` at [model/service/PromotionService.cfc:L769, L771],
   * each behind a `!isNull(...)` guard. If exact decimal comparison is ever required at that
   * boundary it belongs at the point of comparison, not in a re-typed inert column here.
   */
  private readonly minimumFulfillmentWeight: number | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L64]: `ormtype="big_decimal"` with
   * `hb_formatType="weight"` and `hb_nullRBKey="define.unlimited"`. `number`, for the reasons given
   * on `minimumFulfillmentWeight`, and `undefined` means UNLIMITED.
   */
  private readonly maximumFulfillmentWeight: number | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L65]
   *   `ormtype="string" hb_formatType="rbKey" hb_formFieldType="select"`.
   *
   * Narrowed to {@link RewardMatchingType} because L107-L115 declares the vocabulary on the entity
   * itself and `hb_formFieldType="select"` makes that option list the admin form's domain.
   * Nullable, because the column has no `notnull` and no `default`.
   */
  private readonly rewardMatchingType: RewardMatchingType | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L68]
   *   `cfc="PromotionPeriod" fieldtype="many-to-one" fkcolumn="promotionPeriodID"`
   *
   * The ONE many-to-one on this entity, and `PromotionPeriod` is in scope, so this is a real
   * materialized association rather than an opaque identifier. NOT `readonly`:
   * `setPromotionPeriod()` [L122] assigns it and `removePromotionPeriod()` [L128] clears it.
   *
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L68]: the declaration carries no
   * `fetch="join"`, no `lazy=` and no `hb_cascadeCalculate`, which confirms the project-wide
   * eager-fetch census stays at exactly four sites - `Product.brand`
   * [model/entity/Product.cfc:L68], `Product.productType` [L69], `Product.defaultSku` [L70] and
   * `PromotionPeriod.promotion` [model/entity/PromotionPeriod.cfc:L59]. THIS FILE ADDS NO FIFTH.
   *
   * It is also NULLABLE, because L68 declares no `notnull`, and that nullability is load-bearing:
   * it is what makes `isDeletable()` [L359-L361] a preserved runtime failure rather than a total
   * function.
   */
  private promotionPeriod: PromotionPeriod | undefined;

  // LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L70-L71]: the
  //   `// Related Entities (one-to-many)`
  // BANNER IS PRESENT WITH NOTHING UNDER IT. A cosmetic structural fact with a real consequence:
  // THIS ENTITY OWNS NO ONE-TO-MANY COLLECTIONS AT ALL. Every collection below is many-to-many.

  // --- THE THIRTEEN MANY-TO-MANY COLLECTIONS [L73-L87]
  //
  // EXACTLY THIRTEEN, in the source's own three groups, separated by blank lines at L76 and L82 and
  // semantically meaningful. Every one declares `fkcolumn="promotionQualifierID"`, and every
  // `linktable` and `inversejoincolumn` name is reproduced verbatim because those names ARE the
  // schema contract. In all thirteen, `singularname` is the singular of the property name, so the
  // per-field notes below carry only what this table does not.
  //
  //   GROUP A - fulfillment/shipping (3), `cfc` FulfillmentMethod / ShippingMethod / AddressZone,
  //   all three far sides OUT OF SCOPE.
  //   | L73 | fulfillmentMethods   | SwPromoQualFulfillmentMethod | fulfillmentMethodID |
  //   | L74 | shippingMethods      | SwPromoQualShippingMethod    | shippingMethodID    |
  //   | L75 | shippingAddressZones | SwPromoQualShipAddressZone   | addressZoneID       |
  //
  //   GROUP B - INCLUDE lists (5), `cfc` Brand / Option / Sku / Product / ProductType, in scope.
  //   | L77 | brands       | SwPromoQualBrand       | brandID       |
  //   | L78 | options      | SwPromoQualOption      | optionID      |
  //   | L79 | skus         | SwPromoQualSku         | skuID         |
  //   | L80 | products     | SwPromoQualProduct     | productID     |
  //   | L81 | productTypes | SwPromoQualProductType | productTypeID |
  //
  //   GROUP C - EXCLUDE lists (5), the same five `cfc` values in the same order, in scope.
  //   | L83 | excludedBrands       | SwPromoQualExclBrand       | brandID       |
  //   | L84 | excludedOptions      | SwPromoQualExclOption      | optionID      |
  //   | L85 | excludedSkus         | SwPromoQualExclSku         | skuID         |
  //   | L86 | excludedProducts     | SwPromoQualExclProduct     | productID     |
  //   | L87 | excludedProductTypes | SwPromoQualExclProductType | productTypeID |
  //
  // LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L83-L84]: `type="array"` appears on ONLY 2 OF
  // THE 13 - `excludedBrands` [L83] and `excludedOptions` [L84]. Harmless in CFML, where all
  // thirteen behave identically as arrays, so the attribute is neither added to the eleven nor
  // stripped from the two.
  //
  // EMPTY-COLLECTION SEMANTICS, AND WHY COLLAPSING THEM IS A MONEY BUG. `hasAnyInProperty`
  // [org/Hibachi/HibachiEntity.cfc:L340-L350] returns `false` for an empty `entityArray`, AND THAT
  // SAME `false` MEANS OPPOSITE THINGS BY POLARITY - PERMISSIVE on an EXCLUDE list (nothing
  // excluded, the item still qualifies) and RESTRICTIVE on an INCLUDE list (nothing included, the
  // item does not qualify). Groups B and C must NEVER be normalised into one another.
  //
  // THE TEN IN-SCOPE COLLECTION ACCESSORS RETURN THE LIVE ARRAY REFERENCE, NEVER A DEFENSIVE COPY.
  // Every `add*` mutates its own collection AND the far side's via
  // `arrayAppend(arguments.X.getPromotionQualifiers(), this)`, and every `remove*` mutates both
  // sides via `arrayDeleteAt`, so a copy would make the far-side half of all twenty helpers a
  // silent no-op. Contrast promotionReward.ts, which types its owner-side accessors `readonly`.

  // THE OUT-OF-SCOPE GROUP A FAR SIDES ARE COLLAPSED TO OPAQUE IDENTIFIERS. The checkout / cart /
  // payment / shipping / fulfillment pipeline is out of scope, and `AddressZone` is reachable here
  // ONLY through the narrow `addressZoneEvaluator` port (`isAddressInZone` alone, from
  // [model/service/AddressService.cfc:L57]), so none of the three is an entity of this domain. Each
  // ASSOCIATION is part of `SwPromoQual`'s persisted contract, so it survives as a list of opaque
  // string identifiers while the far-side ENTITY does not enter the domain - the same
  // anti-corruption treatment promotionApplied.ts applies to its order, orderItem and
  // orderFulfillment foreign keys.
  //
  // A STRUCTURAL FINDING INDEPENDENTLY JUSTIFIES THAT COLLAPSE: THE SOURCE DECLARES ELEVEN HELPER
  // PAIRS FOR FOURTEEN RELATIONSHIPS, and the three without any helper are EXACTLY Group A -
  // `fulfillmentMethods` [L73], `shippingMethods` [L74] and `shippingAddressZones` [L75] have NO
  // `add*` and NO `remove*` anywhere in the component (all of L119-L339 read), so there is no
  // hand-written behaviour to preserve and the collapse is lossless.
  // src/services/promotion/qualifierQualification.ts evaluates the three gates
  // [model/service/PromotionService.cfc:L699, L701, L703] against these identifier lists, resolving
  // zone semantics only through the `addressZoneEvaluator` port.
  //
  // LEGACY-DEFECT [model/service/PromotionService.cfc:L703]: the shipping-address-zones clause
  // re-tests `hasShippingMethod` instead of testing the zone condition, so `shippingAddressZones`
  // is effectively never evaluated as a zone gate.
  //
  // Preserved deliberately; do not fix without a product decision.
  //
  // It is owned by src/services, not by this file; it is named only so a reader is not misled into
  // thinking the collection is consulted as intended.

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L73]: legacy member `fulfillmentMethods`,
   * `cfc="FulfillmentMethod"`, link table `SwPromoQualFulfillmentMethod`,
   * `inversejoincolumn="fulfillmentMethodID"`. Out-of-scope subsystem; the schema contract is
   * preserved as opaque identifiers and no `getFulfillmentMethods()` accessor is authored.
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
   * `inversejoincolumn="addressZoneID"`. `AddressZone` is reachable in this slice ONLY through the
   * narrow `addressZoneEvaluator` port (`isAddressInZone` alone, from
   * [model/service/AddressService.cfc:L57]), so it is emphatically not an entity of this domain;
   * the schema contract is preserved as opaque identifiers.
   */
  private readonly shippingAddressZoneIDs: readonly string[];

  /** [model/entity/PromotionQualifier.cfc:L77] INCLUDE list. */
  private readonly brands: Brand[];

  /**
   * [model/entity/PromotionQualifier.cfc:L78] INCLUDE list. Read by `hasAnyOption()` at
   * [model/service/PromotionService.cfc:L885].
   */
  private readonly options: Option[];

  /** [model/entity/PromotionQualifier.cfc:L79] INCLUDE list. */
  private readonly skus: Sku[];

  /** [model/entity/PromotionQualifier.cfc:L80] INCLUDE list. */
  private readonly products: Product[];

  /**
   * [model/entity/PromotionQualifier.cfc:L81] INCLUDE list. The membership test for this collection
   * walks `productTypeIDPath` [model/service/PromotionService.cfc:L858-L870], and that walk lives
   * in src/services/promotion/orderItemMembership.ts rather than here.
   */
  private readonly productTypes: ProductType[];

  /** [model/entity/PromotionQualifier.cfc:L83] EXCLUDE list, `type="array"`. */
  private readonly excludedBrands: Brand[];

  /**
   * [model/entity/PromotionQualifier.cfc:L84] EXCLUDE list, `type="array"`. Read by
   * `hasAnyExcludedOption()` at [model/service/PromotionService.cfc:L914].
   */
  private readonly excludedOptions: Option[];

  /** [model/entity/PromotionQualifier.cfc:L85] EXCLUDE list. */
  private readonly excludedSkus: Sku[];

  /** [model/entity/PromotionQualifier.cfc:L86] EXCLUDE list. */
  private readonly excludedProducts: Product[];

  /** [model/entity/PromotionQualifier.cfc:L87] EXCLUDE list. */
  private readonly excludedProductTypes: ProductType[];

  /**
   * [model/entity/PromotionQualifier.cfc:L90] `ormtype="string"`, under the `// Remote Properties`
   * banner at L89. An inert integration identifier; nothing in the in-scope slice reads it, and it
   * is carried because the column exists.
   */
  private readonly remoteID: string | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L93] `hb_populateEnabled="false" ormtype="timestamp"`.
   *
   * `hb_populateEnabled="false"` is an inert fact here: it tells the legacy framework not to
   * populate the column from request data. Audit-column MAINTENANCE belongs to
   * src/repositories/mysql/** and is not performed by this entity.
   */
  private readonly createdDateTime: Date | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L94]: the declaration is
   * `hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one"
   * fkcolumn="createdByAccountID"`, and `Account` IS OUT OF SCOPE, so the association COLLAPSES to
   * the inert foreign-key column itself. No `Account` type is imported and no
   * `getCreatedByAccount()` entity accessor is authored - the identical treatment applied in all
   * the already-shipped entity files, where Account, Order, OrderItem, OrderFulfillment, Image and
   * Site all collapse the same way.
   */
  private readonly createdByAccountID: string | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L95] `hb_populateEnabled="false" ormtype="timestamp"`.
   */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L96]: `hb_populateEnabled="false"
   * cfc="Account" fieldtype="many-to-one" fkcolumn="modifiedByAccountID"`. Collapsed to the inert
   * foreign-key column for the same reason as `createdByAccountID`.
   */
  private readonly modifiedByAccountID: string | undefined;

  // LEGACY-DEFECT [model/entity/PromotionQualifier.cfc:L99, L107]: A DOUBLE ORPHAN. L99 declares
  // `qualifierApplicationTypeOptions` (`type="array" persistent="false"`) - the only non-persistent
  // property in the component - and no `getQualifierApplicationTypeOptions()` method exists and
  // nothing reads the property; L107 is the mirror image, a `getRewardMatchingTypeOptions()` method
  // with no matching declared property. Detailed at the Non-Persistent Property Methods section
  // below.
  //
  // Preserved deliberately; do not fix without a product decision.

  // ============
  // END:  Persistent Properties
  // ===========================

  /**
   * Constructs a qualifier from a repository row plus its materialized associations.
   *
   * A SINGLE PARAMETER OBJECT, matching the sibling entities: every column is a named member, every
   * optional column is `?: T | undefined` so `exactOptionalPropertyTypes` keeps "key absent" and
   * "key present and undefined" both expressible, and every collection defaults to `[]`.
   *
   * NO PORT IS INJECTED AND THE CONSTRUCTOR TAKES DATA ONLY: a full read of all 373 source lines
   * finds zero `getService(` sites, so there is no collaborator to inject and nothing here can
   * reach outward. Hydration, link-table materialization, audit-column maintenance and fetch-shape
   * documentation all belong to src/repositories/mysql/mysqlPromotionRepository.ts - enumerated at
   * the foot of this file so the boundary is auditable without being re-implemented here.
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

    // THE TEN GATES ARE ASSIGNED THROUGH, NEVER DEFAULTED. No `??` appears on any of the ten lines
    // below, deliberately: `undefined` IS the value that means "no bound", and injecting `0` for a
    // maximum would turn "unlimited" into "nothing qualifies".
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

    // The ten in-scope collections are ADOPTED BY REFERENCE rather than copied, which keeps the
    // accessors below live for the bidirectional helpers.
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

  // ============
  // START: Column Accessors
  // ================================
  // The ORM-generated `get<Property>()` surface, authored explicitly. TypeScript does not emulate
  // dynamic dispatch: there is no `Proxy`, no index signature and no string-keyed method lookup
  // anywhere in this file.

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
   * [model/entity/PromotionQualifier.cfc:L63] `hb_formatType="weight"`, so a `number` and not
   * `Money`. `undefined` means NO MINIMUM.
   */
  getMinimumFulfillmentWeight(): number | undefined {
    return this.minimumFulfillmentWeight;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L64] `hb_formatType="weight"`, so a `number` and not
   * `Money`. `undefined` means UNLIMITED.
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
   * `removePromotionPeriod()` has cleared it. Callers must handle that: `isDeletable()` below
   * dereferences it WITHOUT a guard, exactly as the source does.
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
   * [model/entity/PromotionQualifier.cfc:L94] the inert `createdByAccountID` column; `Account` is
   * out of scope, so no entity is returned.
   */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/PromotionQualifier.cfc:L95] `hb_populateEnabled="false"`. */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L96] the inert `modifiedByAccountID` column; `Account` is
   * out of scope, so no entity is returned.
   */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // ============
  // END:  Column Accessors
  // ================================

  // ============
  // START: Association Accessors
  // ===========================

  /**
   * [model/entity/PromotionQualifier.cfc:L73] the opaque identifiers behind
   * `SwPromoQualFulfillmentMethod`. `readonly string[]` because the far-side entity is out of scope
   * and nothing in the domain may reconstruct it; empty by default.
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
   * `SwPromoQualShipAddressZone`; empty by default. Zone semantics are resolved only through the
   * `addressZoneEvaluator` port, at the service tier.
   */
  getShippingAddressZoneIDs(): readonly string[] {
    return this.shippingAddressZoneIDs;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L77] the LIVE include list. Mutating the returned array is
   * observable on this entity, and that is required rather than tolerated - see the live-reference
   * ruling above the collection group.
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

  // ============
  // START: Framework-Implicit Members
  // =======================
  //
  // [org/Hibachi/HibachiEntity.cfc:L507-L565] dynamically dispatches eleven method-name patterns -
  // `hasUniqueOrNull*`, `hasUnique*`, `hasAny*`, `get*AssignedIDList`, `get*ID`, `get*Options`,
  // `get*OptionsSmartList`, `get*SmartList`, `get*Struct`, `get*Count`, plus a `getAttributeValue`
  // fallback - and terminates in a THROW at L565 when nothing matches. Dynamic dispatch is not
  // emulated: only the CONCRETELY-CALLED patterns are generated below, each annotated with the
  // branch it replaces. No `Proxy`, no index signature, no string-keyed lookup, no smart-list
  // member, no EAV accessor.
  //
  // THE ENTITY-COMPARISON RULE FOR EVERY PREDICATE BELOW. Hibernate's implicit collection-contains
  // resolves through SESSION IDENTITY, which for a persisted row is its PRIMARY KEY - so these
  // compare BY PRIMARY KEY, never by deep equality. The one nuance is an UNSAVED candidate:
  // `unsavedvalue=""` [L52 here, and on every far side] means every transient instance shares the
  // empty-string key, so for that case alone the comparison falls back to REFERENCE identity, as
  // the Hibernate session does for a transient instance.

  /**
   * `isNew` - whether this qualifier has never been persisted.
   *
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L52]: `isNew()` IS NOT DECLARED IN THIS
   * COMPONENT - it is inherited from the Hibachi base and called in every `add*` guard [L141, L161,
   * L181, L201, L221, L241, L261, L281, L301, L321] and in `setPromotionPeriod()` [L124]. It is
   * authored explicitly from the unsaved-value contract on L52: `unsavedvalue=""` with `default=""`
   * makes an unsaved row's key the empty string. The bare `''` comparison is the convention the
   * sibling entity files already ship.
   */
  isNew(): boolean {
    return this.promotionQualifierID === '';
  }

  /**
   * `hasBrand` - is this brand already in the INCLUDE list?
   *
   * Framework-generated by [org/Hibachi/HibachiEntity.cfc:L507-L565]; not declared in the source.
   * Guards the near-side append of `addBrand()` [model/entity/PromotionQualifier.cfc:L141]. Tests
   * `brands` [L77] on `brandID`, and answers `false` for an empty collection.
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
   * Framework-generated by [org/Hibachi/HibachiEntity.cfc:L507-L565]. Guards `addExcludedBrand()`
   * [model/entity/PromotionQualifier.cfc:L241]. Tests `excludedBrands` [L83] on `brandID`, and
   * answers `false` for an empty collection.
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
   * [model/entity/PromotionQualifier.cfc:L161]. Tests `options` [L78] on `optionID`, and answers
   * `false` for an empty collection.
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
   * Framework-generated by [org/Hibachi/HibachiEntity.cfc:L507-L565]. Guards `addExcludedOption()`
   * [model/entity/PromotionQualifier.cfc:L261]. Tests `excludedOptions` [L84] on `optionID`, and
   * answers `false` for an empty collection.
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
   * [model/entity/PromotionQualifier.cfc:L181]. Tests `skus` [L79] on `skuID`, and answers `false`
   * for an empty collection.
   */
  hasSku(sku: Sku): boolean {
    return PromotionQualifier.indexOfEntity(this.skus, sku, (held: Sku) => held.getSkuID()) !== -1;
  }

  /**
   * `hasExcludedSku` - is this SKU already in the EXCLUDE list?
   *
   * Framework-generated by [org/Hibachi/HibachiEntity.cfc:L507-L565]. Guards `addExcludedSku()`
   * [model/entity/PromotionQualifier.cfc:L281]. Tests `excludedSkus` [L85] on `skuID`, and answers
   * `false` for an empty collection.
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
   * [model/entity/PromotionQualifier.cfc:L201]. Tests `products` [L80] on `productID`, and answers
   * `false` for an empty collection.
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
   * Framework-generated by [org/Hibachi/HibachiEntity.cfc:L507-L565]. Guards `addExcludedProduct()`
   * [model/entity/PromotionQualifier.cfc:L301]. Tests `excludedProducts` [L86] on `productID`, and
   * answers `false` for an empty collection.
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
   * Framework-generated by [org/Hibachi/HibachiEntity.cfc:L507-L565]. Guards `addProductType()`
   * [model/entity/PromotionQualifier.cfc:L221]. Tests `productTypes` [L81] on `productTypeID`, and
   * answers `false` for an empty collection. Note the boundary it does NOT cross: membership of an
   * ORDER ITEM in this collection is decided by walking `productTypeIDPath`
   * [model/service/PromotionService.cfc:L858-L870], which belongs to
   * src/services/promotion/orderItemMembership.ts. This method answers only the direct-containment
   * question the `add*` guard asks.
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
   * `excludedProductTypes` [L87] on `productTypeID`, and answers `false` for an empty collection.
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
   * `hasAnyOption` - does ANY supplied option appear in the INCLUDE list?
   *
   * Dispatched by [org/Hibachi/HibachiEntity.cfc:L517-L519], implemented by `hasAnyInProperty` at
   * [org/Hibachi/HibachiEntity.cfc:L340-L350]. Call site [model/service/PromotionService.cfc:L885],
   * inside `getOrderItemInQualifier()`, passing the order item's SKU options - `Sku.options`
   * [model/entity/Sku.cfc:L76]. The reward-side equivalents at
   * [model/service/PromotionService.cfc:L951, L980] are promotionReward.ts's obligation.
   *
   * SEMANTICS, REPRODUCED EXACTLY: PRIMARY-KEY comparison, delegated to `hasOption()` so the
   * transient-identity nuance is decided in one place; `false` FOR AN EMPTY INPUT ARRAY, because
   * `hasAnyInProperty` runs its loop zero times and falls through to `return false`
   * [org/Hibachi/HibachiEntity.cfc:L348] - the load-bearing case at L885, where a SKU with NO
   * options must not be excluded by an option-based gate; and SHORT-CIRCUIT on first match,
   * matching the in-loop `return true` at [org/Hibachi/HibachiEntity.cfc:L343-L345].
   *
   * POLARITY DETERMINES WHAT `false` MEANS - see empty-collection convention #3 above. On this
   * INCLUDE list `false` is RESTRICTIVE; on `hasAnyExcludedOption` the identical `false` is
   * PERMISSIVE, and the two must never be normalised. The parameter is `readonly Option[]` because
   * `Sku.getOptions()` returns `readonly Option[]`; a mutable `Option[]` is still accepted.
   */
  hasAnyOption(options: readonly Option[]): boolean {
    return options.some((option: Option) => this.hasOption(option));
  }

  /**
   * `hasAnyExcludedOption` - does ANY supplied option appear in the EXCLUDE list?
   *
   * Dispatched by [org/Hibachi/HibachiEntity.cfc:L517-L519], implemented by `hasAnyInProperty` at
   * [org/Hibachi/HibachiEntity.cfc:L340-L350]. Call site [model/service/PromotionService.cfc:L914],
   * the exclusion half of `getOrderItemInQualifier()`; tests `excludedOptions` [L84]. Same three
   * semantics as `hasAnyOption` but the OPPOSITE POLARITY: here `false` is PERMISSIVE, because an
   * item excluded by nothing still qualifies.
   */
  hasAnyExcludedOption(options: readonly Option[]): boolean {
    return options.some((option: Option) => this.hasExcludedOption(option));
  }

  /**
   * Locates an entity inside one of this qualifier's collections, or `-1` when it is absent.
   *
   * THE `findIndex` BASE-CHANGE RULE, CENTRALISED HERE BECAUSE IT IS A REAL OFF-BY-ONE TRAP. All
   * eleven `remove*` bodies in the source use CFML `arrayFind(...)` guarded by `if(index > 0)` /
   * `if(thisIndex > 0)` / `if(thatIndex > 0)`. CFML `arrayFind` is 1-BASED and returns 0 for "not
   * found"; `Array.prototype.findIndex` is 0-BASED and returns `-1`, so every caller tests
   *   `!== -1`.
   * Writing `> 0` against a `findIndex` result would silently skip a legitimate match at index 0 -
   * the FIRST element of every collection - and `listFindNoCase`, which likewise returns a 1-based
   * index or 0, is never used as a boolean anywhere in this file.
   *
   * Comparison follows the rule at the top of this section: primary key for a persisted candidate,
   * reference identity for a transient one whose key is still the `unsavedvalue=""` empty string.
   * `private static` so the rule is decided once rather than twenty-one times; it adds no exported
   * unit.
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

  // LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L101-L103]: `getSimpleRepresentation()` sits
  // BEFORE the `Non-Persistent Property Methods` banner at L105 - OUTSIDE EVERY BANNER SECTION, in
  // the gap between the property block and the first banner. Unique among the promotion-cluster
  // entities; in PromotionPeriod and PromotionCode the simple-representation members sit inside
  // banners. Reproduced only as a positional fact, so reading order matches the source.

  /**
   * `getSimpleRepresentation` - the qualifier's human label for the admin UI.
   *
   * CFML parity [model/entity/PromotionQualifier.cfc:L101-L103], the body VERBATIM:
   *
   *   return "#rbKey('entity.promotionQualifier')# - #getFormattedValue('qualifierType')#";
   *
   * TWO FRAMEWORK COLLABORATORS APPEAR HERE AND BOTH ARE HANDLED HONESTLY RATHER THAN GUESSED.
   * `rbKey('entity.promotionQualifier')` is JavaRB, which is not ported, so the key is emitted
   * literally as an inert string. `getFormattedValue('qualifierType')` resolves to
   * [org/Hibachi/HibachiTransient.cfc:L493], not to a method on this component, and its behaviour
   * was READ rather than assumed: `getPropertyFormatType` [L534] returns the property's
   * `hb_formatType`, which for `qualifierType` is `"rbKey"` [L53], so control reaches the rbKey
   * branch at [org/Hibachi/HibachiTransient.cfc:L504-L510], which composes
   * `entity.#replace(getEntityName(), applicationKey, "")#.#propertyName#.#value#`. With
   * `getEntityName()` = `"SlatwallPromotionQualifier"` [L49] and the application key `"Slatwall"`
   * [config/configFramework.cfm:L1], the composed key is
   * `entity.PromotionQualifier.qualifierType.<value>`. Both keys are emitted verbatim below.
   *
   * THIS METHOD IS TOTAL - IT NEVER THROWS, AND THAT IS A READ FACT RATHER THAN A CHOICE.
   * `qualifierType` is nullable [L53 declares no `notnull`], but the null path is handled inside
   * the framework: [org/Hibachi/HibachiTransient.cfc:L508] returns `''`. So the legacy result for
   * an unset qualifier type is the prefix, the separator, and nothing - INCLUDING THE TRAILING
   * SPACE, because CFML `"#a# - #b#"` with an empty `b` still emits the separator. Contrast
   * `PromotionPeriod.getSimpleRepresentation()`, which DOES throw, because it dereferences a
   * nullable ASSOCIATION; this body only reads one of its own columns.
   *
   * NOTE THE CASING DISAGREEMENT BETWEEN THE TWO KEYS, which is in the source: L102 hand-writes
   * `entity.promotionQualifier` with a LOWERCASE initial letter, while the framework-composed key
   * derives from `getEntityName()` and carries an INITIAL CAPITAL. Both are reproduced exactly;
   * normalising either would change a resource-bundle lookup. Pure and synchronous.
   */
  getSimpleRepresentation(): string {
    const qualifierType: string | undefined = this.qualifierType;

    // The rbKey branch of `getFormattedValue` [org/Hibachi/HibachiTransient.cfc:L504-L510]: a
    // composed key when the value is present, the empty string when it is not. `isNullish` carries
    // the CFML `isNull(...)` semantics; the trailing `=== undefined` is a TYPE-NARROWING step only,
    // because `isNullish` returns `boolean` rather than a type predicate. Redundant at runtime.
    const formattedQualifierType: string =
      isNullish(qualifierType) || qualifierType === undefined
        ? ''
        : `entity.PromotionQualifier.qualifierType.${qualifierType}`;

    return `entity.promotionQualifier - ${formattedQualifierType}`;
  }

  // ============
  // START: Non-Persistent Property Methods
  // ==================
  // [model/entity/PromotionQualifier.cfc:L105-L117] POPULATED, holding EXACTLY ONE MEMBER:
  // `getRewardMatchingTypeOptions()` [L107-L115].

  // LEGACY-DEFECT [model/entity/PromotionQualifier.cfc:L99, L107]: THE DOUBLE ORPHAN - a dead
  // declared property and an undeclared method, pointing in opposite directions. L99 declares
  // `property name="qualifierApplicationTypeOptions" type="array" persistent="false";` - THE ONLY
  // non-persistent property in the 373-line component - and no
  // `getQualifierApplicationTypeOptions()` exists anywhere in the file, with no reference to the
  // property at all. It is dead metadata, structurally the same shape as the never-initialised,
  // never-read `qualificationDetails.qualifiedFulfillments` key at
  // [model/service/PromotionService.cfc:L621-L623] and as the declared-but-never-referenced
  // `isNotGlobal` condition in model/validation/PriceGroupRate.json. Conversely
  // `getRewardMatchingTypeOptions()` [L107-L115] is hand-written with NO matching
  // `persistent="false"` declaration; it works, because the explicit method shadows the
  // `get<Property>Options` dispatcher branch [org/Hibachi/HibachiEntity.cfc:L507-L565] so the
  // missing metadata is never consulted, but a consumer reflecting over the non-persistent property
  // list to discover option providers would find the dead one and miss the live one. The port
  // reproduces the source's exact member set: `getRewardMatchingTypeOptions()` IS authored below,
  // `getQualifierApplicationTypeOptions()` is NOT, and no `rewardMatchingTypeOptions` property is
  // invented.
  //
  // Preserved deliberately; do not fix without a product decision.

  /**
   * `getRewardMatchingTypeOptions` - the five reward-matching modes the admin offers.
   * [model/entity/PromotionQualifier.cfc:L107-L115]
   *
   * THIS BODY IS THE AUTHORITATIVE VOCABULARY FOR `rewardMatchingType` [L65] and is why that column
   * is the one narrowed column on this entity - see {@link RewardMatchingType} for the five values,
   * their spellings and their order.
   *
   * The five `name` values are JAVARB KEYS, not English labels, emitted verbatim as inert strings
   * because JavaRB is not ported. Contrast `RoundingRule.getRoundingRuleDirectionOptions()`, whose
   * three labels ARE hardcoded English in its own source - each port keeps what its source held.
   *
   * A FIXED-ARITY `readonly` TUPLE, RETURNED FRESH ON EVERY CALL: the arity is a fact about the
   * source, and a fresh array per call reproduces the CFML literal being re-evaluated per
   * invocation, where hoisting it to module scope would create state shared across warm-container
   * invocations. `readonly` here does not collide with the live-reference ruling on the ten
   * association accessors, because this is a computed option list for a form control rather than
   * one side of a bidirectional association. Pure and synchronous.
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

  // ============
  // END:  Non-Persistent Property Methods
  // ==================

  // =============
  // START: Bidirectional Helper Methods
  // ===================
  // [model/entity/PromotionQualifier.cfc:L119-L339] - 221 lines, the largest section in the
  // component: ELEVEN HELPER PAIRS, twenty-two methods, under twelve inline sub-banners
  //   (`// Promotion Period (many-to-one)`
  // at L121, then ten `// <Name> (many-to-many - owner)` banners at L139, L159, L179, L199, L219,
  // L239, L259, L279, L299 and L319).
  //
  // ELEVEN HELPER PAIRS FOR FOURTEEN RELATIONSHIPS - one many-to-one [L68] plus thirteen
  // many-to-many [L73-L87], with hand-written helpers for only eleven. The three with NO `add*` and
  // NO `remove*` anywhere in the file are EXACTLY Group A, which relies entirely on the framework's
  // generated accessors.
  //
  // The five INCLUDE pairs reach `hasPromotionQualifier` / `getPromotionQualifiers` on the far
  // side; the five EXCLUDE pairs reach `hasPromotionQualifierExclusion` /
  // `getPromotionQualifierExclusions`. The two families are never mixed, and all twenty far-side
  // members were confirmed present in brand.ts, option.ts, sku.ts, product.ts and productType.ts
  // before this file was authored.

  // ------------------------------------------------------------------------------------
  // Promotion Period (many-to-one) [model/entity/PromotionQualifier.cfc:L121]
  // ------------------------------------------------------------------------------------

  /**
   * `setPromotionPeriod` - point this qualifier at a period and synchronise the far side.
   * [model/entity/PromotionQualifier.cfc:L122-L127]
   *
   * THREE ORDERING FACTS ARE PRESERVED EXACTLY.
   *
   * 1. THE NEAR-SIDE ASSIGNMENT HAPPENS FIRST [L123], before the guard is evaluated, and it is
   *    unconditional - the field is overwritten even when the far side already holds this
   *    qualifier, and even when it is the same period the field already pointed at.
   * 2. THE GUARD IS `isNew() or !hasPromotionQualifier(this)`, IN THAT ORDER, AND CFML `or`
   *    SHORT-CIRCUITS [L124]. For an UNSAVED qualifier the containment probe is never run and the
   *    far-side append is unconditional: two calls on the same transient qualifier append it
   *    TWICE. That is also why the containment rule above falls back to reference identity for
   *    transients.
   * 3. THE FAR-SIDE APPEND MUTATES THE LIVE ARRAY [L125], so `.push(this)` is the exact analogue
   *    of `arrayAppend`; a defensive copy on either side would make this half a silent no-op.
   *
   * The parameter is REQUIRED, matching `required any promotionPeriod` on L122, and is typed to the
   * concrete entity rather than to CFML's `any`. Arity is unchanged. Synchronous.
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
   * [model/entity/PromotionQualifier.cfc:L128-L137]
   *
   * THE PARAMETER IS OPTIONAL - `any promotionPeriod` with no `required` [L128] - and it is the
   * only optional parameter in the component. L129-L131 defaults it from the current field, which
   * is what lets a caller write `qualifier.removePromotionPeriod()` and mean "detach from whatever
   * you are attached to". `structKeyExists(arguments, "promotionPeriod")` is an ARGUMENT-SCOPE
   * presence test, not a domain-data struct lookup, so it maps to a TypeScript optional parameter
   * and NOT to any helper in src/lib/cfml/struct.ts.
   *
   * THE THROW IS PRESERVED. When the argument is omitted AND the field is already empty, L132 calls
   * `getPromotionQualifiers()` on null and CFML raises. The FK is genuinely nullable - L68 declares
   * no `notnull` - so this is reachable, not theoretical. No early return is added: behaviour
   * preservation extends to defects, and returning silently would leave the caller believing a
   * detach succeeded.
   *
   * THE CLEAR HAPPENS AFTER THE THROW POINT AND IS UNCONDITIONAL. L136 runs whether or not the
   * far-side deletion found anything, but it is downstream of L132, so a raise leaves the field
   * INTACT. Both properties are reproduced. The clear assigns `undefined` rather than using
   * `delete`: the field is declared as an explicit union precisely so that is legal under
   * `exactOptionalPropertyTypes`.
   *
   * The `findIndex` base change applies: L133 guards with `if(index > 0)` because CFML `arrayFind`
   * is 1-based, and `> 0` here would skip a qualifier at index 0 of the period's collection - the
   * common case for a period with a single qualifier. Synchronous.
   *
   * @throws Error when no argument is supplied and `promotionPeriod` is already absent.
   */
  removePromotionPeriod(promotionPeriod?: PromotionPeriod): void {
    // [L129-L131] Default the target from the current field when the caller omitted it. `isNullish`
    // carries the CFML absence semantics; the `=== undefined` operand that follows is a
    // TYPE-NARROWING step only, because `isNullish` returns `boolean` rather than a type predicate.
    // Redundant at runtime, and it changes no outcome.
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
  // All ten `add*` bodies share one identical two-guard shape and all ten `remove*` bodies one
  // identical two-deletion shape, so both are stated once here and referenced from each member.
  // `addBrand` / `removeBrand` [L140-L157] is the template.
  //
  // THE `add*` SHAPE - TWO INDEPENDENT GUARDS, AND THEY ARE NOT SYMMETRIC. Guard one (near side)
  // tests the ARGUMENT'S newness, `arguments.X.isNew() or !hasX(...)`; guard two (far side) tests
  // THIS QUALIFIER'S newness, `isNew() or !X.hasPromotionQualifier(this)`. The SUBJECT of `isNew()`
  // differs between them, and mixing them up would change which side accepts duplicates. CFML `or`
  // SHORT-CIRCUITS, so a NEW entity is appended WITHOUT the containment probe running - two `add*`
  // calls with the same transient argument append it twice near-side, and two on a transient
  // qualifier append it twice far-side. Both appends are evaluated in sequence: the second guard is
  // NOT nested inside the first, so a near-side skip does not skip the far side.
  //
  // THE `remove*` SHAPE - TWO INDEPENDENT DELETIONS, near side then far side, each guarded by its
  // own index test and neither conditional on the other. `if(thisIndex > 0)` / `if(thatIndex > 0)`
  // is CFML's 1-based `arrayFind` idiom; the port routes both through `indexOfEntity` and tests
  // `!== -1`, because `> 0` against a `findIndex` result would silently skip a match at index 0.
  //
  // MUTATION IS IN PLACE ON BOTH SIDES, so a defensive copy anywhere in this block would turn the
  // far-side half of all twenty helpers into a silent no-op. Parameter names are the legacy names,
  // including on the five EXCLUDE pairs where the argument is named after the ENTITY rather than
  // the property - `addExcludedBrand(required any brand)`. Every member below is synchronous.
  // ------------------------------------------------------------------------------------
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
  // LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L179-L197]: nearly every line of this block
  // carries trailing whitespace in the source, including the sub-banner comment itself, and the
  // same wart runs through Excluded Brands [L239-L257] and Excluded Options [L259-L277]. Cosmetic
  // only, invisible to CFML, and not reproduced - prettier normalises it in the target.

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
   * THIS IS THE METHOD THE `Option` DEFECT CALLS. `Option.removePromotionQualifierExclusion()`
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
   * [model/entity/PromotionQualifier.cfc:L300-L307]. Near side `excludedProducts` [L86], link table
   * `SwPromoQualExclProduct`. Far side `Product.getPromotionQualifierExclusions()`. Parameter named
   * `product`, matching L300.
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
   * table `SwPromoQualExclProductType`. Far side `ProductType.getPromotionQualifierExclusions()`.
   * Parameter named `productType`, matching L320.
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

  // =============
  // END:  Bidirectional Helper Methods
  // ===================
  // [model/entity/PromotionQualifier.cfc:L339]. Exactly one START/END pair - no duplicate banner,
  // unlike PromotionAccount [L117/L119], PromotionPeriod [L154/L156] and PromotionCode [L153/L155],
  // and no missing END banner, unlike PromotionCode [L98].
  //
  // LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L128-L337]: the remove-that-adds inversion
  // cross-check, re-run line by line. VERDICT: CLEAN - all eleven `remove*` bodies delete on BOTH
  // sides and not one calls an `add*`. `removePromotionPeriod` [L128] clears the field at L136 and
  // deletes far-side at L134; the ten collection removers at L148, L168, L188, L208, L228, L248,
  // L268, L288, L308 and L328 each pair a near-side `arrayDeleteAt` (L151, L171, L191, L211, L231,
  // L251, L271, L291, L311, L331) with a far-side one (L155, L175, L195, L215, L235, L255, L275,
  // L295, L315, L335). No inversion defect exists here, and none is invented to match the sibling.
  //
  // AND THE MIRROR-IMAGE CONTRAST: the far side of one of these very relationships IS inverted.
  // model/entity/Option.cfc:L145-L147 declares `removePromotionQualifierExclusion(...)` whose
  // single body statement is `arguments.promotionQualifier.addExcludedOption( this );` - a "remove"
  // that ADDS - preserved as a LEGACY-DEFECT in option.ts alongside its twin at
  // model/entity/Option.cfc:L129-L131. Option's INCLUDE side is correct (L137-L138 properly calls
  // `removeOption(this)`) and ONLY the two EXCLUSION removers are inverted, so the two sides of one
  // relationship disagree observably. Both are preserved and NOT reconciled - repairing either
  // would change which SKUs a qualifier excludes, hence which orders qualify, hence money.

  // ===============
  // START: Custom Validation Methods
  // ====================
  // [model/entity/PromotionQualifier.cfc:L341-L343] EMPTY, and consequentially so: with no
  // model/validation/PromotionQualifier.json either, this entity has ZERO hand-written validators
  // AND ZERO declaratively-invoked ones. No zod schema is authored here.
  // ===============
  // END: Custom Validation Methods
  // =====================

  // ===============
  // START: Custom Formatting Methods
  // ====================
  // [model/entity/PromotionQualifier.cfc:L345-L347] EMPTY. No `get<Property>Formatted` member
  // exists, which is why `getFormattedValue('qualifierType')` [L102] resolves to the framework's
  // generic rbKey branch rather than to a `custom` delegation
  // [org/Hibachi/HibachiTransient.cfc:L502-L503].
  // ===============
  // END: Custom Formatting Methods
  // =====================

  // ==============
  // START: Overridden Implicet Getters
  // ===================
  // LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L349, L351]: EMPTY, and the banner misspells
  // "Implicit" - identically to PromotionCode.cfc. Reproduced verbatim because banner text is
  // source evidence for which component a section was copied from. Cosmetic only.
  // ==============
  // END: Overridden Implicet Getters
  // ====================

  // ==================
  // START: Overridden Methods
  // ========================
  // [model/entity/PromotionQualifier.cfc:L353-L363] POPULATED with exactly two members:
  // `getSimpleRepresentationPropertyName()` [L355-L357] and `isDeletable()` [L359-L361]. Both
  // genuinely override a base implementation on the Hibachi chain, and NEITHER carries the
  // TypeScript `override` keyword - required rather than sloppy, because `noImplicitOverride` asks
  // for it only where a member overrides a member of an actual base class, and this class extends
  // nothing.
  getSimpleRepresentationPropertyName(): string {
    return 'qualifierType';
  }

  /**
   * `isDeletable` - may this qualifier be deleted?
   *
   * CFML parity [model/entity/PromotionQualifier.cfc:L359-L361], the body VERBATIM:
   *
   *   return !getPromotionPeriod().isExpired()
   *          && getPromotionPeriod().getPromotion().isDeletable();
   *
   * A three-level cross-entity chain whose far-side members were all verified present before this
   * body was authored: `PromotionPeriod.isExpired()` [model/entity/PromotionPeriod.cfc:L83],
   * `PromotionPeriod.getPromotion()` (the many-to-one accessor for
   * [model/entity/PromotionPeriod.cfc:L59], typed `Promotion | undefined`) and
   * `Promotion.isDeletable()` [model/entity/Promotion.cfc:L170].
   *
   * OPERAND ORDER AND SHORT-CIRCUITING ARE PRESERVED, so when the period IS expired the right-hand
   * operand is never evaluated and `Promotion.isDeletable()` is never reached - observable, because
   * a period whose promotion is unreachable still answers `false` rather than raising.
   * `getPromotionPeriod()` is called TWICE in the source, a legacy inefficiency rather than a
   * defect; binding it to a local is behaviour-preserving because the accessor is a pure field read
   * and the local is taken BEFORE the expiry test.
   *
   * TWO DISTINCT RAISES ARE PRESERVED, NOT ONE, BECAUSE THE CHAIN HAS TWO NULLABLE LINKS.
   * `getPromotionPeriod()` can be `undefined` - [model/entity/PromotionQualifier.cfc:L68] declares
   * no `notnull` and `removePromotionPeriod()` clears it outright - and that dereference is the
   * FIRST thing L360 evaluates, so an absent period raises before the expiry short-circuit can
   * spare it. `getPromotion()` can be `undefined` too. Neither raise is softened: `?.` would yield
   * `undefined`, coerce to a falsy "not deletable", and silently report that a deletable qualifier
   * cannot be deleted whenever its graph was fetched shallowly. The two messages are
   * distinguishable so a reviewer can tell which link failed. Synchronous.
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
    //   `Promotion | undefined`
    // with no import at all.
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

  // ==================
  // END:  Overridden Methods
  // ========================

  // ===================
  // START: ORM Event Hooks
  // =========================
  // [model/entity/PromotionQualifier.cfc:L365-L367] EMPTY. Nothing is authored: no `preInsert`, no
  // `preUpdate`, no path maintenance, no UUID seeding - this entity has no materialized-path
  // column. The hook census stays final at four in-scope entities: Category
  // [model/entity/Category.cfc:L126, L131], PriceGroup [model/entity/PriceGroup.cfc:L206, L211],
  // ProductType [model/entity/ProductType.cfc:L305, L310] and PromotionCode
  // [model/entity/PromotionCode.cfc:L179, insert-only].
  // ===================
  // END:  ORM Event Hooks
  // =========================

  // ==================
  // START: Deprecated Methods
  // ========================
  // [model/entity/PromotionQualifier.cfc:L369-L371] EMPTY, as in PromotionCode.cfc.
  // ==================
  // END:  Deprecated Methods
  // ========================
}

// =========================================================================================
// ANTI-CONTRACTS - MEMBERS THAT DELIBERATELY DO NOT EXIST ON THIS CLASS
//
// 1. NO `setPromotion` AND NO `removePromotion`, AND THIS IS THE MOST IMPORTANT ENTRY.
// model/entity/PromotionPeriod.cfc:L126 and :L129 call `setPromotion(...)` and
// `removePromotion(...)` ON a PromotionQualifier, and those two calls are confirmed THROWING
// DEFECTS precisely because this entity has no such members: the eleven dispatcher patterns at
// org/Hibachi/HibachiEntity.cfc:L507-L565 are all `has*`/`get*` shapes, none beginning `set`, so
// control falls through to the THROW at L565. The relationship this entity owns is to a promotion
// PERIOD [model/entity/PromotionQualifier.cfc:L68]. Authoring those members would repair a
// preserved defect AND imply a qualifier-to-promotion foreign key the schema does not have.
//
// 2. NO `getQualifierApplicationTypeOptions()` and NO `rewardMatchingTypeOptions` property - the
// two halves of the double-orphan LEGACY-DEFECT above. Neither half is normalised.
//
// 3. NO `preInsert`, NO `preUpdate`, no path-maintenance method: the ORM Event Hooks pair at
// L365/L367 is empty and this entity carries no materialized-path column.
//
// 4. NO `attributeValues` member and no EAV accessor - the project-wide census is exactly four
// (model/entity/Sku.cfc:L70, Product.cfc:L75, ProductType.cfc:L67, Brand.cfc:L60) and the EAV path
// is not ported, which is why model/entity/HibachiEntity.cfc's twelve `getService(...)` sites are
// moot here. NO smart-list member either: `get*SmartList` and `get*OptionsSmartList` are Hibachi
// query-builder artifacts replaced project-wide by typed repository queries.
//
// 5. NO zod schema, because model/validation/PromotionQualifier.json does not exist and is not
// invented - so no length constraint on `qualifierType` and no range constraint on any of the ten
// gates.
//
// 6. NO entity-typed Group A accessors and no `FulfillmentMethod`, `ShippingMethod` or
// `AddressZone` type - out-of-scope subsystems whose link-table contract survives as the three
// opaque identifier arrays above. Likewise NO `Account` type: the two audit foreign keys are inert
// identifier columns.
//
// 7. NO injected port of any kind. Zero `getService(` sites means no collaborator to inject, no
// `async` member, and no reason to import from src/domain/ports/**.
// =========================================================================================

// =========================================================================================
// WHAT THE REPOSITORY LAYER OWNS - THE BOUNDARY, STATED SO IT IS NOT RE-IMPLEMENTED HERE
//
// src/repositories/mysql/mysqlPromotionRepository.ts owns row-to-entity hydration from
// `SwPromoQual` (the four currency gates as `Money`, the two weight gates as plain numbers);
// materializing the ten in-scope collections and the three opaque identifier arrays from their link
// tables; maintaining the four `hb_populateEnabled="false"` audit columns; and documenting the
// FETCH SHAPE at each producing method, because with no ORM the eager-load decision is an explicit,
// reviewable choice rather than an emergent one. Delete-context rules of the `maxCollection: 0`
// shape belong to that tier too, which can count link-table rows directly; none targets this entity
// today.
//
// CONTEXT ONLY, IMPLEMENTED NOWHERE HERE: model/dao/PromotionDAO.cfc:L51
// `getActivePromotionRewards` has NO `ORDER BY`, which is what makes reward iteration order
// non-deterministic in the promotion engine.
// =========================================================================================

// =========================================================================================
// TEST OBLIGATION: tests/unit/domain/entities/promotionQualifier.test.ts, NET-NEW COVERAGE.
//
// meta/tests/unit/entity/ contains no PromotionQualifierTest.cfc, so the suite must be labelled
// net-new and never presented as parity. Only two of the eighteen entity suites extend legacy
// coverage: brand.test.ts (`defaults_are_correct()`) and product.test.ts
// (`productUrlIsCorrectlyFormatted()`). Regression tests follow the `issue_<ticket#>` convention
// from meta/tests/unit/IssuesTest.cfc.
//
// The assertions that guard a money outcome: all ten gates default to `undefined` and not one to
// `0`; the four currency gates round-trip as `Money` while the two weight gates round-trip as plain
// `number`; `hasAny*` answers `false` for an empty input array and matches a DIFFERENT INSTANCE
// carrying the same primary key; every `remove*` deletes on both sides INCLUDING AT INDEX 0, the
// regression that catches a `> 0` guard written against a `findIndex` result; `add*` is idempotent
// for a persisted argument but NOT for a transient one; `isDeletable()` answers `false` for an
// expired period WITHOUT consulting the promotion and throws on each of its two absent links; and
// `removePromotionPeriod()` throws when both the argument and the field are absent.
// =========================================================================================
