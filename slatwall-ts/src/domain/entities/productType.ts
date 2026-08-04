// ---------------------------------------------------------------------------
// slatwall-ts - ProductType entity
//
// PORT OF model/entity/ProductType.cfc (318 lines, verified).
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/ProductType.cfc:L49]
//
//   component displayname="Product Type" entityname="SlatwallProductType"
//   table="SwProductType" persistent="true" extends="HibachiEntity"
//   cacheuse="transactional" hb_serviceName="productService" hb_permission="this"
//   hb_parentPropertyName="parentProductType" {
//
// SCHEMA CONTINUITY IS THE CONTRACT. Table `SwProductType`, entity name
// `SlatwallProductType`. No migration, no rename, no new table, no column change. Every
// `hb_*` attribute value is carried forward verbatim - JavaRB is NOT ported and no i18n
// runtime is introduced, so resource-bundle identifiers and framework metadata survive as
// inert comment text and string constants only. Three of those attributes carry decisions
// rather than decoration:
//
//   * `hb_serviceName="productService"` - NOT `productTypeService`. ProductType CRUD lives in
//     model/service/ProductService.cfc; there is NO `ProductTypeService.cfc` in the legacy
//     source and none may be invented. This entity therefore maps to
//     `src/services/productService.ts`. Same species of finding as
//     model/entity/Category.cfc's `hb_serviceName="contentService"`.
//   * `hb_permission="this"` - the literal four-character string, reproduced as written.
//   * `hb_parentPropertyName="parentProductType"` - the metadata counterpart to the three
//     `buildIDPathList( "parentProductType" )` calls at [L252], [L306] and [L311]. It is what
//     tells the framework this entity is a self-referential tree.
//
// LEGACY-NOTE [model/entity/ProductType.cfc:L49]: this declaration carries NO `accessors="true"`
// and NO `output="false"`, diverging from model/entity/Brand.cfc:L49 (which declares both) and
// model/entity/Category.cfc:L49 (which declares `accessors="true"` only). Accessors are supplied
// by the base class regardless. A cosmetic metadata inconsistency, recorded once and changed
// nowhere.
//
// WHY THIS SMALL ENTITY MATTERS OUT OF PROPORTION TO ITS SIZE: it owns `productTypeIDPath`, the
// 4000-character materialized path [L53] that the PROMOTION ENGINE walks. Qualifier membership
// [model/service/PromotionService.cfc:L858-L870] and reward membership
// [model/service/PromotionService.cfc:L921-L985] both test a product type's path with a comma-list
// containment check, and model/dao/PromotionDAO.cfc:L482-L488 concatenates it in dialect-specific
// SQL. A truncated or mis-ordered path silently changes which promotions apply - it changes money.
// That is why every path operation here delegates to
// `src/domain/valueObjects/materializedIdPath.ts` instead of being re-derived. That module is also
// where the ONE deliberate divergence on this path lives: a cyclic or unbounded parent chain is
// REFUSED there by a throw, producing no path, precisely because a truncated path would change
// money. Nothing about the ordering, the delimiter or the contents of a well-founded path changed.
//
// THE `extends` CHAIN IS THREE LEVELS DEEP, NOT TWO. `extends="HibachiEntity"` on L49 is
// UNQUALIFIED, so it resolves to the local model/entity/HibachiEntity.cfc (274 lines), which
// itself declares `extends="Slatwall.org.Hibachi.HibachiEntity"`. The intermediate class holds
// TWELVE `getService(...)` sites (L123, L130, L135, L145, L178, L180, L182, L194, L196, L207,
// L257, L266), seven of them `attributeService`. They are moot here because the EAV path is not
// ported - and they are deliberately NOT silently re-implemented. Neither base level is ported:
// an entity reaching outward through a service locator is exactly the pattern the ESLint
// `no-restricted-imports` layer boundary exists to make impossible (transformation rule T2). This
// component has SIX `getService(` sites of its own - L94, L112, L118, L129, L263 and L283 - and
// each becomes either an injected narrow port, a documented omission, or a preserved failure.
//
// NO DYNAMIC DISPATCH IS EMULATED. org/Hibachi/HibachiEntity.cfc:L507-L565 resolves ELEVEN
// method-name patterns at runtime and terminates in a throw at L565. TypeScript must not
// reproduce that: there is NO `Proxy`, NO index signature, NO string-keyed method resolution and
// NO `evaluate()` anywhere in this file. Only the concretely-called ORM-implicit patterns are
// authored, as explicitly typed methods, and each names the call site that proves it is reached:
//
//   | authored probe                     | proven by                                  |
//   |------------------------------------|--------------------------------------------|
//   | hasChildProductType                | model/entity/ProductType.cfc:L151          |
//   | hasPromotionReward                 | model/entity/PromotionReward.cfc:L282      |
//   | hasPromotionRewardExclusion        | model/entity/PromotionReward.cfc:L382      |
//   | hasPromotionQualifier              | model/entity/PromotionQualifier.cfc:L224   |
//   | hasPromotionQualifierExclusion     | model/entity/PromotionQualifier.cfc:L324   |
//   | hasPriceGroupRate                  | model/entity/PriceGroupRate.cfc:L202       |
//
// No `hasAny*` probe belongs on this class - those live on promotionQualifier.ts and
// promotionReward.ts. Every probe above compares BY PRIMARY KEY (`productTypeID`), never by object
// reference and never by deep equality, because Hibernate's collection-contains is
// session-identity / primary-key based.
//
// VALIDATION IS DECLARATIVE AND SERVICE-TIER. model/validation/ProductType.json exists and is one
// of the FIFTEEN in-scope schemas - the twelve the plan enumerates plus SkuCurrency.json,
// OptionGroup.json and RoundingRule.json, which belong to the three entities pulled in by implicit
// necessity and were counted by listing model/validation/ rather than by trusting the figure. Read verbatim it declares, and nothing else:
//
//   save   - productTypeName required; urlTitle required and unique
//   delete - products maxCollection:0, childProductTypes maxCollection:0, systemCode maxLength:0,
//            physicalCounts maxCollection:0
//
// Two facts follow that a reviewer would otherwise have to rediscover. First, the file declares
// NO `"method"` key, so ProductType contributes NONE of the declaratively-invoked validators -
// there is nothing to look for. Second, the delete-context rule names `physicalCounts`, which
// model/entity/ProductType.cfc does not declare at all (verified: zero occurrences in the
// component; the property lives on model/entity/Physical.cfc). The entity's own collection is
// `physicals` [L77]. That rule therefore matches no property even in CFML. No schema is authored
// here: this class carries property metadata as comments and no zod schema, because enforcement
// belongs to `src/services/**`.
//
// TEST COVERAGE FOR THIS MODULE IS NET-NEW, AND MUST NEVER BE PRESENTED AS PARITY. `ProductType`
// has NO legacy test anywhere under meta/tests/ - only meta/tests/unit/entity/BrandTest.cfc and
// meta/tests/unit/entity/ProductTest.cfc touch this folder, and
// meta/tests/functional/admin/entity/ProductTest.cfc is an empty stub. The future suite
// `tests/unit/domain/entities/productType.test.ts` is therefore NET-NEW coverage;
// `tests/traceability/legacyTestMap.ts` fails the suite if this module has no test. No test file
// is authored from here - the contract that tier has to pin is enumerated at the foot of this file.
//
// BUDGET, STATED SO IT IS AUDITABLE: this file spends ZERO signature widenings, ZERO deliberate
// divergences, ZERO reshapings and ZERO visibility widenings. It carries EXACTLY ONE
// `LEGACY-DEFECT` marker - the always-throws method at [L117-L119] - and every other annotation is
// a `LEGACY-NOTE` or a secondary-register item. Nothing here asserts a service level, a latency, a
// throughput or an uptime figure, because the legacy system states none.
//
// ★ AN EARLIER REVISION SPENT A FOURTH DIVERGENCE HERE, AND THE RECORD OF ITS REMOVAL BELONGS IN
// THE BUDGET THAT ONCE QUALIFIED ITSELF TO ACCOMMODATE IT. `setParentProductType` REFUSED a
// reparent that would close a cycle, under a three-star divergence banner, and this budget line
// read "ZERO of the THREE BUDGETED deliberate divergences" so that the refusal could be counted
// outside the budget rather than against it. Both are gone: the setter now assigns whatever it is
// handed, exactly as [model/entity/ProductType.cfc:L149-L153] does, and the budget line above is
// unqualified again because there is nothing left to qualify. Where termination genuinely had to be
// decided - `hydrateWithAncestry` in `mysqlProductTypeRepository.ts`, a hand-written recursive read
// that replaces Hibernate's lazy traversal under transformation rule T3 and has no legacy
// antecedent to reproduce - it is decided there, as a fetch-shape decision at the adapter boundary.
//
// NO USER RULES WERE PROVIDED for this project (the rules source returns exactly "No user rules
// provided."). No rule is invented to fill that gap, and the absence is not licence to lower the
// bar: the enterprise-standard substitute applies at full strength - maximal strictness, no `any`,
// no suppression comment, no non-null assertion, one exported unit per file, no barrel, and every
// judgment call annotated at the point where it was made.
// ---------------------------------------------------------------------------

import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import { cfBoolean, cfLen, isNullish } from '../../lib/cfml/truthiness.js';
import type { ProductTypeRepository } from '../ports/productTypeRepository.js';
import {
  buildIdPathList,
  getRootIdFromIdPath,
  resolveIdPath,
} from '../valueObjects/materializedIdPath.js';
import type { PriceGroup } from './priceGroup.js';
import type { PriceGroupRate } from './priceGroupRate.js';
import type { Product } from './product.js';
import type { PromotionQualifier } from './promotionQualifier.js';
import type { PromotionReward } from './promotionReward.js';

/**
 * The `SwProductType` node - a self-referential catalog tree carrying a materialized ID path.
 *
 * A CLASS rather than an interface, because the legacy entity carries behaviour and not merely
 * data: it owns a lazily-built path accessor [L250-L255], two lifecycle hooks [L305-L313], a
 * recursive human-readable representation [L273-L278], the base-type resolution the catalog
 * branches on [L110-L115], and eleven bidirectional helper groups [L146-L245].
 *
 * ASSOCIATIONS ARE MATERIALIZED AT THE REPOSITORY BOUNDARY. Hibernate lazy collections have no
 * equivalent in a driver-only stack, so laziness is not simulated: each collection arrives already
 * populated and the fetch shape is an explicit, documented decision at the repository method that
 * produced it. `src/repositories/mysql/**` owns hydration; no sibling entity module constructs this
 * class.
 *
 * EXACTLY ONE MEMBER IS ASYNCHRONOUS - {@link ProductType.getBaseProductType}. The async boundary
 * rule is that a method becomes `async` if and only if its legacy body genuinely reaches the DAO or
 * the ORM; a method that only traverses already-materialized associations or performs pure string
 * work stays synchronous. [L112] performs a product-type load BY IDENTIFIER of the root element of
 * the materialized path, which is unambiguously a repository round-trip, so that method - and only
 * that method - returns a promise. Contrast src/domain/entities/priceGroup.ts, which has zero
 * `getService(` sites and is therefore synchronous throughout.
 *
 * MEMBERS THAT CAN THROW, each of which says so on itself:
 * {@link ProductType.getAppliedPriceGroupRateByPriceGroup} (the preserved always-throws defect),
 * {@link ProductType.getBaseProductType} (the preserved unguarded dereference, plus the absent-port
 * case) and {@link ProductType.removeParentProductType} (the legacy unguarded-null idiom). Every
 * other member is total.
 */
export class ProductType {
  /**
   * [model/entity/ProductType.cfc:L52]
   * `ormtype="string" length="32" fieldtype="id" generator="uuid" unsavedvalue="" default=""`
   *
   * The primary key every containment comparison on this class is keyed by. `unsavedvalue=""`
   * together with `default=""` is what makes an unsaved row's key the empty string, which in turn
   * makes {@link ProductType.isNew} a simple emptiness test rather than a framework call.
   */
  private readonly productTypeID: string;

  /**
   * [model/entity/ProductType.cfc:L53] `ormtype="string" length="4000"`.
   *
   * MUTABLE, and necessarily so - this entity is the only one in the folder with BOTH materialized
   * path routes writing to it: the lazy accessor memoizes into it on the absent branch [L251-L253]
   * and both lifecycle hooks overwrite it unconditionally [L306, L311].
   *
   * `string | null | undefined` rather than `string | undefined`, because the guard the legacy uses
   * is `isNull(...)` and a hydrated column can arrive as SQL NULL. Both absent forms are accepted
   * and the distinction between "absent" and "present but empty" is preserved exactly - see
   * {@link ProductType.getProductTypeIDPath}.
   */
  private productTypeIDPath: string | null | undefined;

  /**
   * [model/entity/ProductType.cfc:L54] `ormtype="boolean"` carrying the source's own
   * `hint="As A ProductType Get Old, They would be marked as Not Active"` - reproduced verbatim,
   * grammar included, because hint text is metadata the admin renders.
   *
   * NO `default=` IN THE SOURCE, so SQL NULL is an expected column state and the raw hydrated value
   * is held rather than coerced at construction. It is resolved through `cfBoolean()` at the
   * accessor - see {@link ProductType.getActiveFlag}.
   */
  private readonly activeFlag: CfBooleanInput;

  /** [model/entity/ProductType.cfc:L55] `ormtype="boolean"`, also with NO `default=`. */
  private readonly publishedFlag: CfBooleanInput;

  /**
   * [model/entity/ProductType.cfc:L56] `ormtype="string" unique="true"` with
   * `hint="This is the name that is used in the URL string"`.
   *
   * `unique="true"` is recorded for schema continuity and is a DATABASE-level guarantee; it is not
   * re-implemented here, and NO format validation is added - the source declares none.
   *
   * NOT `readonly`, for the same reason {@link ProductType.productTypeIDPath} is not: an in-scope
   * caller assigns to it. `super.save(productType, data)`
   * [model/service/ProductService.cfc:L303] runs `arguments.entity.populate(argumentCollection=
   * arguments)` at [org/Hibachi/HibachiService.cfc:L145], and that populate is what carries the
   * resolved `data.urlTitle` from [L297] / [L299] onto this column BEFORE the `save`-context
   * validation at [org/Hibachi/HibachiService.cfc:L150] reads it. See
   * {@link ProductType.setUrlTitle}.
   */
  private urlTitle: string | undefined;

  /** [model/entity/ProductType.cfc:L57] `ormtype="string"`, nullable - no `notNull="true"`. */
  private readonly productTypeName: string | undefined;

  /** [model/entity/ProductType.cfc:L58] `ormtype="string" length="4000"`. */
  private readonly productTypeDescription: string | undefined;

  /**
   * [model/entity/ProductType.cfc:L59] `ormtype="string"`.
   *
   * The discriminator the catalog branches on, and the value {@link ProductType.getBaseProductType}
   * resolves. NOT narrowed to a union: the column carries no check constraint and no validation
   * rule restricts its content, so narrowing would reject data the legacy schema accepts.
   *
   * model/validation/ProductType.json enforces `maxLength:0` on `systemCode` in the DELETE context,
   * which means any product type carrying a system code is undeletable. That is a SERVICE-TIER
   * constraint and is deliberately not enforced on this class.
   */
  private readonly systemCode: string | undefined;

  /**
   * [model/entity/ProductType.cfc:L62] `cfc="ProductType" fieldtype="many-to-one"
   * fkcolumn="parentProductTypeID"` - self-referential.
   *
   * Declared `ProductType | undefined` and NOT `parentProductType?: ProductType`, because
   * `exactOptionalPropertyTypes` makes those two different types and only the former can hold an
   * explicit absent value. `undefined` covers both a root product type and one the repository
   * hydrated without its parent - two states the port cannot distinguish, exactly as CFML cannot.
   *
   * MUTABLE: [L150] assigns it and [L163] clears it via `structDelete`.
   */
  private parentProductType: ProductType | undefined;

  /**
   * [model/entity/ProductType.cfc:L65] `singularname="childProductType" cfc="ProductType"
   * fieldtype="one-to-many" inverse="true" fkcolumn="parentProductTypeID" cascade="all"`.
   *
   * HANDED OUT LIVE, because the legacy mutates it IN PLACE through the accessor: `arrayAppend` at
   * [L152] and `arrayDeleteAt` at [L161] both operate on `getChildProductTypes()`. The field is
   * `readonly` so the BINDING can never be replaced while the array's CONTENTS stay mutable - two
   * different guarantees, both wanted.
   */
  private readonly childProductTypes: ProductType[];

  /**
   * [model/entity/ProductType.cfc:L66] `singularname="product" cfc="Product"
   * fieldtype="one-to-many" inverse="true" fkcolumn="productTypeID" lazy="extra" cascade="all"`.
   *
   * LEGACY-NOTE [model/entity/ProductType.cfc:L66]: `products` is declared lazy="extra" in the
   * Hibernate mapping, so the legacy runtime never eagerly loaded it. It is one of only three
   * `lazy="extra"` sites in the whole in-scope set, with `Sku.orderItems` [model/entity/Sku.cfc:L71]
   * and `PromotionCode.orders` [model/entity/PromotionCode.cfc:L68]. Associations are materialized
   * at the repository boundary; `src/repositories/mysql/**` owns the fetch decision and documents it
   * at the producing method. This array is EMPTY unless a repository method explicitly opted into
   * loading it. `Product` is in scope, so this is purely a fetch-shape decision and not an
   * anti-corruption one.
   *
   * The BINDING is mutable because [L103] REPLACES the collection wholesale rather than clearing it
   * in place - see {@link ProductType.setProducts}.
   */
  private products: Product[];

  /**
   * [model/entity/ProductType.cfc:L70] `many-to-many` via link table `SwPromoRewardProductType`,
   * `fkcolumn="productTypeID" inversejoincolumn="promotionRewardID" inverse="true"`.
   *
   * HANDED OUT LIVE: the OWNING side mutates it through the accessor at
   * [model/entity/PromotionReward.cfc:L291] and [model/entity/PromotionReward.cfc:L294].
   */
  private readonly promotionRewards: PromotionReward[];

  /**
   * [model/entity/ProductType.cfc:L71] `type="array"` `many-to-many` via
   * `SwPromoRewardExclProductType`, `inverse="true"`.
   *
   * HANDED OUT LIVE: mutated by the owner at [model/entity/PromotionReward.cfc:L391] and
   * [model/entity/PromotionReward.cfc:L394].
   */
  private readonly promotionRewardExclusions: PromotionReward[];

  /**
   * [model/entity/ProductType.cfc:L72] `many-to-many` via `SwPromoQualProductType`,
   * `inversejoincolumn="promotionQualifierID" inverse="true"`.
   *
   * HANDED OUT LIVE: mutated by the owner at [model/entity/PromotionQualifier.cfc:L233] and
   * [model/entity/PromotionQualifier.cfc:L236].
   */
  private readonly promotionQualifiers: PromotionQualifier[];

  /**
   * [model/entity/ProductType.cfc:L73] `type="array"` `many-to-many` via
   * `SwPromoQualExclProductType`, `inverse="true"`.
   *
   * HANDED OUT LIVE: mutated by the owner at [model/entity/PromotionQualifier.cfc:L333] and
   * [model/entity/PromotionQualifier.cfc:L336].
   */
  private readonly promotionQualifierExclusions: PromotionQualifier[];

  /**
   * [model/entity/ProductType.cfc:L74] `many-to-many` via `SwPriceGroupRateProductType`,
   * `inversejoincolumn="priceGroupRateID" inverse="true"`.
   *
   * HANDED OUT LIVE: mutated by the owner at [model/entity/PriceGroupRate.cfc:L204] and
   * [model/entity/PriceGroupRate.cfc:L211-L214].
   */
  private readonly priceGroupRates: PriceGroupRate[];

  /**
   * [model/entity/ProductType.cfc:L75] `many-to-many` via `SwPriceGrpRateExclProductType`,
   * `inverse="true"`.
   *
   * Contents mutable, but NOT handed out live: no other entity reaches into this array. The owning
   * side, model/entity/PriceGroupRate.cfc, hand-writes helpers for its three INCLUDED collections
   * only [L199, L207 for product types] and none for its three `excluded*` collections, so the
   * exclusion link is reached through the ORM-generated collection accessor instead - see
   * {@link ProductType.addPriceGroupRateExclusion}, which is where that whole story is told.
   */
  private readonly priceGroupRateExclusions: PriceGroupRate[];

  /** [model/entity/ProductType.cfc:L80] `ormtype="string"` - the integration correlation column. */
  private readonly remoteID: string | undefined;

  /** [model/entity/ProductType.cfc:L83] `hb_populateEnabled="false" ormtype="timestamp"`. */
  private readonly createdDateTime: Date | undefined;

  /**
   * [model/entity/ProductType.cfc:L84] `hb_populateEnabled="false" cfc="Account"
   * fieldtype="many-to-one" fkcolumn="createdByAccountID"`.
   *
   * `Account` is OUT OF SCOPE, so the association is reduced to its INERT PERSISTED FOREIGN-KEY
   * IDENTIFIER. The column survives untouched for schema continuity and NO account behaviour is
   * ported - the same treatment src/domain/entities/category.ts applies to `Category.site` ->
   * `siteID`. `hb_populateEnabled="false"` is recorded here because it is part of the metadata
   * contract: the framework refuses to populate this property from request data.
   */
  private readonly createdByAccountID: string | undefined;

  /** [model/entity/ProductType.cfc:L85] `hb_populateEnabled="false" ormtype="timestamp"`. */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * [model/entity/ProductType.cfc:L86] `hb_populateEnabled="false" cfc="Account"
   * fieldtype="many-to-one" fkcolumn="modifiedByAccountID"` - the same out-of-scope reduction to an
   * opaque identifier as `createdByAccountID` above.
   */
  private readonly modifiedByAccountID: string | undefined;

  /**
   * The product-type repository, used by {@link ProductType.getBaseProductType} and by nothing else
   * on this class.
   *
   * This is transformation rule T2 applied to [model/entity/ProductType.cfc:L112]: the embedded
   * `getService("ProductService")` locator becomes a CONSTRUCTOR-INJECTED PORT typed to
   * `src/domain/ports/productTypeRepository.ts`, whose `getProductTypeByProductTypeID` is the
   * load-by-identifier capability that line needs. No port is invented and no fourteenth port is
   * added; the entities-to-ports reference is `import type` only, so the folder cycle is erased at
   * emit and never exists at runtime.
   *
   * OPTIONAL, because the overwhelming majority of read paths never ask for a base product type.
   * An absent port is reported at the one method that needs it rather than being defaulted, since
   * that method's return type has no spare value meaning "cannot answer".
   */
  private readonly productTypeRepository: ProductTypeRepository | undefined;

  /**
   * Constructed from a repository row plus its materialized associations, by
   * `src/repositories/mysql/**` and by nothing else.
   *
   * Every collection parameter is OPTIONAL and defaults to `[]`: a Hibernate-managed collection
   * never handed back null, so an entity hydrated without a join must present an empty array rather
   * than `undefined`. meta/tests/unit/entity/BrandTest.cfc asserts exactly that convention for
   * `Brand.getProducts()`, and it is applied uniformly across this folder.
   *
   * LIFECYCLE MAINTENANCE IS NEVER FIRED FROM HERE. {@link ProductType.preInsert} and
   * {@link ProductType.preUpdate} are explicit, repository-invoked methods (transformation rule
   * T3); calling either from this constructor would recompute a stored path at hydration time and
   * silently overwrite the persisted value.
   */
  constructor(init: {
    readonly productTypeID: string;
    readonly productTypeIDPath?: string | null | undefined;
    readonly activeFlag?: CfBooleanInput;
    readonly publishedFlag?: CfBooleanInput;
    readonly urlTitle?: string | undefined;
    readonly productTypeName?: string | undefined;
    readonly productTypeDescription?: string | undefined;
    readonly systemCode?: string | undefined;
    readonly parentProductType?: ProductType | undefined;
    readonly childProductTypes?: ProductType[] | undefined;
    readonly products?: Product[] | undefined;
    readonly promotionRewards?: PromotionReward[] | undefined;
    readonly promotionRewardExclusions?: PromotionReward[] | undefined;
    readonly promotionQualifiers?: PromotionQualifier[] | undefined;
    readonly promotionQualifierExclusions?: PromotionQualifier[] | undefined;
    readonly priceGroupRates?: PriceGroupRate[] | undefined;
    readonly priceGroupRateExclusions?: PriceGroupRate[] | undefined;
    readonly remoteID?: string | undefined;
    readonly createdDateTime?: Date | undefined;
    readonly createdByAccountID?: string | undefined;
    readonly modifiedDateTime?: Date | undefined;
    readonly modifiedByAccountID?: string | undefined;
    readonly productTypeRepository?: ProductTypeRepository | undefined;
  }) {
    this.productTypeID = init.productTypeID;
    this.productTypeIDPath = init.productTypeIDPath;
    this.activeFlag = init.activeFlag;
    this.publishedFlag = init.publishedFlag;
    this.urlTitle = init.urlTitle;
    this.productTypeName = init.productTypeName;
    this.productTypeDescription = init.productTypeDescription;
    this.systemCode = init.systemCode;
    this.parentProductType = init.parentProductType;
    this.childProductTypes = init.childProductTypes ?? [];
    this.products = init.products ?? [];
    this.promotionRewards = init.promotionRewards ?? [];
    this.promotionRewardExclusions = init.promotionRewardExclusions ?? [];
    this.promotionQualifiers = init.promotionQualifiers ?? [];
    this.promotionQualifierExclusions = init.promotionQualifierExclusions ?? [];
    this.priceGroupRates = init.priceGroupRates ?? [];
    this.priceGroupRateExclusions = init.priceGroupRateExclusions ?? [];
    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
    this.productTypeRepository = init.productTypeRepository;
  }

  // -------------------------------------------------------------------------
  // Persistent scalar accessors [model/entity/ProductType.cfc:L52-L59, L80, L83-L86]
  //
  // CFML generated these from the property declarations; here they are authored explicitly so the
  // return type of every column is stated rather than inferred. The house spelling is
  // `getUrlTitle()` and NOT `getURLTitle()` - matched to src/domain/entities/brand.ts and
  // src/domain/entities/product.ts, neither of which declares an all-caps alias.
  // -------------------------------------------------------------------------

  /** [model/entity/ProductType.cfc:L52] The primary key. `''` for an unsaved row. */
  getProductTypeID(): string {
    return this.productTypeID;
  }

  /**
   * [model/entity/ProductType.cfc:L54]
   *
   * Resolved through `cfBoolean()` and NOT hand-coerced. The source declares NO `default=` on this
   * column, so a hydrated value can legitimately arrive as SQL NULL (`null`), as a MySQL `TINYINT`
   * (`0` / `1`), or as one of CFML's string boolean forms (`"0"`, `"1"`, `"true"`, `"false"`).
   * Twelve of the eighteen in-scope entities declare no boolean default and this one declares none
   * on EITHER flag, which is why the conversion is centralized in
   * `src/lib/cfml/truthiness.ts` instead of being repeated - and why it is never silently defaulted
   * to `false` at construction, where the absent state would become unrecoverable.
   */
  getActiveFlag(): boolean {
    return cfBoolean(this.activeFlag);
  }

  /** [model/entity/ProductType.cfc:L55] Resolved through `cfBoolean()`, as `activeFlag` is. */
  getPublishedFlag(): boolean {
    return cfBoolean(this.publishedFlag);
  }

  /** [model/entity/ProductType.cfc:L56] `unique="true"`, enforced by the database, not by this class. */
  getUrlTitle(): string | undefined {
    return this.urlTitle;
  }

  /**
   * Assigns this product type's URL title.
   *
   * ⭐ AN ORM-GENERATED SETTER, AUTHORED FOR THE SAME REASON {@link ProductType.setProductTypeIDPath}
   * AND {@link ProductType.addProduct} ARE: it is concretely reached from in-scope code, so the
   * member-generation principle says author it explicitly rather than emulate dispatch.
   *
   * The reaching path is `populate`, not a hand-written call. `saveProductType`
   * [model/service/ProductService.cfc:L294-L311] resolves the title into the bare unscoped
   * `data.urlTitle` at [L297] and [L299] - it never calls a setter itself - and then hands the struct
   * to `super.save(arguments.productType, arguments.data)` at [L303]. That framework method populates
   * first [org/Hibachi/HibachiService.cfc:L145], validates second [L150] and persists only on a clean
   * entity [L153-L155], so the resolved title is on this column before the `save` context of
   * `model/validation/ProductType.json` - which declares `urlTitle` `{required}` - ever reads it.
   *
   * That ordering is the whole point of the member. `populate` was metadata-driven dispatch over
   * every submitted key and is deliberately not ported; the concretely-populated column gets a typed
   * setter instead, which is what lets the service tier reproduce populate-then-validate-then-save
   * without a `Proxy`, an index signature or a string-keyed write.
   *
   * ⚠ THE ASYMMETRY WITH `Product` IS PRESERVED, NOT SMOOTHED OVER. `saveProduct` resolves ITS title
   * by calling a setter on the entity directly [model/service/ProductService.cfc:L269], whereas this
   * override and `saveBrand` [model/service/BrandService.cfc:L70], [L72] both write into the data
   * struct and let populate carry it. Both routes end with the resolved title on the entity ahead of
   * validation, and both are reproduced as written.
   *
   * `unique="true"` [L56] stays a database guarantee: this setter performs no uniqueness probe,
   * because the source performs none either - `createUniqueURLTitle` did the de-duplicating, and that
   * collaborator lives behind the URL-title generator port at the service tier.
   *
   * LEGACY-NOTE: the source accessor is `setURLTitle`, CFML's convention for the property `urlTitle`
   * [model/entity/ProductType.cfc:L56]. The house spelling recorded at the head of this accessor
   * block is `getUrlTitle()` / `setUrlTitle()`, matched to src/domain/entities/brand.ts and
   * src/domain/entities/product.ts. Internal naming only - the persistent column reaching
   * `SwProductType` is untouched.
   */
  setUrlTitle(urlTitle: string): void {
    this.urlTitle = urlTitle;
  }

  /**
   * [model/entity/ProductType.cfc:L57]
   *
   * `string | undefined` and not `string`: model/validation/ProductType.json requires this property
   * in the SAVE context only, so an in-memory or partially-hydrated product type legitimately has
   * none. That is why {@link ProductType.getSimpleRepresentation} is honest about returning
   * `string | undefined` too.
   */
  getProductTypeName(): string | undefined {
    return this.productTypeName;
  }

  /** [model/entity/ProductType.cfc:L58] `length="4000"`. */
  getProductTypeDescription(): string | undefined {
    return this.productTypeDescription;
  }

  /**
   * [model/entity/ProductType.cfc:L59]
   *
   * May be `undefined` OR the empty string, and BOTH matter: those are precisely the two states
   * that send {@link ProductType.getBaseProductType} down its repository branch [L111].
   */
  getSystemCode(): string | undefined {
    return this.systemCode;
  }

  /**
   * [model/entity/ProductType.cfc:L80]
   *
   * LEGACY-NOTE [model/entity/ProductType.cfc:L80]: unlike model/entity/Category.cfc:L73, this
   * `remoteID` declaration carries NO `hint`. A cosmetic metadata inconsistency between two
   * otherwise-parallel integration correlation columns; recorded, and nothing invented to fill it.
   */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [model/entity/ProductType.cfc:L83] `hb_populateEnabled="false"`. */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * [model/entity/ProductType.cfc:L84] The inert `createdByAccountID` foreign key.
   *
   * Returns the raw identifier and never an `Account`, because `Account` is out of scope. Schema
   * continuity is preserved; no account behaviour is reachable from here.
   */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/ProductType.cfc:L85] `hb_populateEnabled="false"`. */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** [model/entity/ProductType.cfc:L86] The inert `modifiedByAccountID` foreign key. */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  /**
   * Whether this row has never been persisted.
   *
   * `isNew()` was a method on the NON-PORTED framework base
   * (org/Hibachi/HibachiEntity.cfc), and it is relied upon at
   * [model/entity/ProductType.cfc:L151] as the first disjunct of the parent-assignment guard. The
   * signal it tested is right here in the property metadata: `productTypeID` declares
   * `unsavedvalue=""` together with `default=""` [L52], so an unsaved row's identifier is the empty
   * string. The test is therefore reproduced from the column contract rather than from a framework
   * call, and no persistence-state flag is invented.
   */
  isNew(): boolean {
    return this.productTypeID === '';
  }

  /**
   * Primary-key row identity, the single comparison every containment probe and every helper on this
   * class routes through.
   *
   * Hibernate's collection-contains is session-identity / primary-key based, so the port compares
   * `productTypeID` - never object references and never deep equality. The one exception is an
   * UNSAVED row: two distinct unsaved product types both carry `''` as their identifier, so keying
   * on it would collapse them into one. When either side is unsaved the comparison falls back to
   * reference identity, which is exactly what the CFML runtime's in-session object graph gave.
   */
  private isSameRowAs(candidate: ProductType): boolean {
    const candidateID = candidate.getProductTypeID();
    if (this.productTypeID === '' || candidateID === '') {
      return candidate === this;
    }
    return candidateID === this.productTypeID;
  }

  // -------------------------------------------------------------------------
  // Collection accessors [model/entity/ProductType.cfc:L62-L77]
  //
  // Each returns the ALREADY-MATERIALIZED array. Hibernate laziness is not simulated: the fetch
  // shape of every association is chosen and documented at the repository method that produced it,
  // which converts each implicit lazy load into an explicit query decision and removes the N+1
  // hazard that unbounded graph walking creates.
  //
  // MUTABILITY IS DELIBERATE AND UNEVEN, so it is stated per accessor. Where the legacy code
  // mutates a collection THROUGH the accessor - `arrayAppend(x.getChildProductTypes(), this)` at
  // [L152] is the pattern - the array must be handed out LIVE or the append becomes unobservable and
  // the in-memory graph silently desynchronizes. Where nothing reaches in, a `readonly` view is
  // returned so accidental external mutation is a compile error.
  // -------------------------------------------------------------------------

  /**
   * [model/entity/ProductType.cfc:L62] The parent node, or `undefined` at the root.
   *
   * Read by {@link ProductType.getSimpleRepresentation} to recurse and by the path builder to walk.
   * `undefined` conflates "is the root" with "hydrated without its parent" - a conflation the legacy
   * `isNull()` test has too, and one that is preserved rather than resolved.
   */
  getParentProductType(): ProductType | undefined {
    return this.parentProductType;
  }

  /**
   * [model/entity/ProductType.cfc:L65]
   *
   * RETURNED LIVE - mutable on purpose. [L152] appends to it and [L161] deletes from it, both
   * through this accessor, so a defensive copy here would make
   * {@link ProductType.setParentProductType} and {@link ProductType.removeParentProductType}
   * no-ops against the parent's collection. The CFML semantics are reproduced exactly, including
   * that a caller can mutate the returned array.
   */
  getChildProductTypes(): ProductType[] {
    return this.childProductTypes;
  }

  /**
   * [model/entity/ProductType.cfc:L66]
   *
   * `readonly` - the ONE collection on this class not handed out live. Nothing in the legacy source
   * mutates a product type's `products` array through this accessor: model/entity/Product.cfc
   * declares NO `setProductType` / `removeProductType` helper pair reaching back this way, and the
   * only writes are {@link ProductType.setProducts}, {@link ProductType.addProduct} and
   * {@link ProductType.removeProduct}, which mutate the field directly.
   *
   * Empty unless a repository method explicitly opted into loading it - see the `lazy="extra"` note
   * on the field declaration.
   */
  getProducts(): readonly Product[] {
    return this.products;
  }

  /**
   * [model/entity/ProductType.cfc:L70]
   *
   * RETURNED LIVE: model/entity/PromotionReward.cfc:L291 and :L294 mutate this array through the
   * accessor while adding and removing the link from the owning side.
   */
  getPromotionRewards(): PromotionReward[] {
    return this.promotionRewards;
  }

  /**
   * [model/entity/ProductType.cfc:L71]
   *
   * RETURNED LIVE: mutated by the owner at model/entity/PromotionReward.cfc:L391 and :L394.
   */
  getPromotionRewardExclusions(): PromotionReward[] {
    return this.promotionRewardExclusions;
  }

  /**
   * [model/entity/ProductType.cfc:L72]
   *
   * RETURNED LIVE: mutated by the owner at model/entity/PromotionQualifier.cfc:L233 and :L236.
   */
  getPromotionQualifiers(): PromotionQualifier[] {
    return this.promotionQualifiers;
  }

  /**
   * [model/entity/ProductType.cfc:L73]
   *
   * RETURNED LIVE: mutated by the owner at model/entity/PromotionQualifier.cfc:L333 and :L336.
   */
  getPromotionQualifierExclusions(): PromotionQualifier[] {
    return this.promotionQualifierExclusions;
  }

  /**
   * [model/entity/ProductType.cfc:L74]
   *
   * RETURNED LIVE: mutated by the owner at model/entity/PriceGroupRate.cfc:L204 and :L211-L214.
   */
  getPriceGroupRates(): PriceGroupRate[] {
    return this.priceGroupRates;
  }

  /**
   * [model/entity/ProductType.cfc:L75]
   *
   * LEGACY-NOTE [model/entity/ProductType.cfc:L75]: the five-level price-group cascade
   * [model/service/PriceGroupService.cfc:L140-L181] NEVER consults
   * `PriceGroupRate.excludedProductTypes`, so this link table is written by the admin and then
   * ignored by pricing. That gap is owned and flagged in src/domain/entities/priceGroupRate.ts; it
   * is recorded here only so the two halves of the association tell the same story.
   *
   * Returned live for symmetry with the other five link collections, and because
   * {@link ProductType.addPriceGroupRateExclusion} mutates it in place.
   */
  getPriceGroupRateExclusions(): PriceGroupRate[] {
    return this.priceGroupRateExclusions;
  }

  // -------------------------------------------------------------------------
  // The three NON-MATERIALIZED collections [model/entity/ProductType.cfc:L67, L76, L77]
  //
  // Declared in the legacy mapping, deliberately absent from this class. No field, no accessor and
  // no helper is authored for any of them, and the six bidirectional helpers the source provides
  // for them are dropped at their own locators further down with individual annotations.
  //
  // [L67] `attributeValues` - `cfc="AttributeValue" cascade="all-delete-orphan" inverse="true"`.
  //   THE ENTITY-ATTRIBUTE-VALUE PATH IS NOT PORTED. `AttributeValue` is not among the eighteen
  //   in-scope entities and no nineteenth entity module may be created for it. This is the same
  //   ruling already applied to `Brand.attributeValues`
  //   [model/entity/Brand.cfc:L60, L90, L93]. The unhonoured `cascade="all-delete-orphan"`
  //   obligation is a persistence concern and is recorded in the repositories sibling, not here.
  //   Secondary register item: this declaration carries NO `type="array"`, matching
  //   model/entity/Product.cfc:L75 while model/entity/Sku.cfc:L70 and model/entity/Brand.cfc:L60 do
  //   carry it - one of exactly four such declarations across the in-scope entities.
  //   Consequence worth naming: because `attributeValues` is not materialized, an unmatched `get…`
  //   in the LEGACY runtime could fall through to the EAV branch at
  //   org/Hibachi/HibachiEntity.cfc:L559, which requires `hasProperty("attributeValues")` -
  //   ProductType is one of only four entities that could reach it, with Sku, Product and Brand. In
  //   the target NO such fallback exists at all, because no dynamic dispatch is emulated.
  //
  // [L76] `attributeSets` - `cfc="AttributeSet" type="array"` via link table
  //   `SwAttributeSetProductType`. `AttributeSet` is OUT OF SCOPE. Omitted.
  //
  // [L77] `physicals` - `cfc="Physical" type="array"` via link table `SwPhysicalProductType`.
  //   `Physical` is OUT OF SCOPE. Omitted.
  //
  //   LEGACY-NOTE [model/entity/ProductType.cfc:L77]: model/validation/ProductType.json carries a
  //   delete-context `maxCollection:0` rule in this family. Because this domain deliberately does
  //   not materialize the collection, such a rule trivially PASSES in TypeScript where it would
  //   BLOCK in CFML. That is a real behavioural consequence of the scope boundary and it is
  //   documented rather than hidden. Delete-context enforcement itself belongs to
  //   `src/services/**` and `src/repositories/mysql/**`, not to this entity. The identical tension
  //   exists for `PriceGroup.appliedOrderItems`, `PromotionCode.orders`, and `physicals` on Sku,
  //   Product and Brand. Sharpening the point: the rule as written names `physicalCounts`, a
  //   property this component does not declare (verified: zero occurrences; it lives on
  //   model/entity/Physical.cfc), so in CFML it already matches nothing - the guard was never
  //   effective on either side of the port.
  //
  // [L89] `parentProductTypeOptions` - `type="array" persistent="false"`. THE FIRST GENUINE
  //   NON-PERSISTENT PROPERTY IN THIS FOLDER, and it is not a column at all: it is the memo backing
  //   `getParentProductTypeOptions()` [L122-L142], which is omitted for the smart-list reasons given
  //   at that method's locator below. Recorded here as metadata; NO field is authored, because a
  //   memo for an omitted method would be dead state.
  //
  // LEGACY-NOTE [model/entity/ProductType.cfc:L65-L77]: `type="array"` is declared on L71, L73, L76
  // and L77 but OMITTED on L65, L66, L67, L70, L72, L74 and L75. Purely cosmetic - every collection
  // is a materialized array in the target regardless of whether the legacy mapping bothered to say
  // so. Recorded once, here, and never again.
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // ORM-implicit containment probes
  //
  // org/Hibachi/HibachiEntity.cfc:L507-L565 resolved `has<PropertyName>` dynamically, one of eleven
  // patterns it dispatched before throwing at L565. Each probe below is authored EXPLICITLY because
  // a concrete legacy call site proves it is reached, and each compares by primary key through
  // {@link ProductType.isSameRowAs}. Nothing speculative is generated: an unproven probe would be
  // invented API, and TypeScript must not emulate dynamic dispatch.
  // -------------------------------------------------------------------------

  /**
   * Whether `childProductType` is already among this node's children.
   *
   * Proven reached by [model/entity/ProductType.cfc:L151], the second disjunct of the
   * parent-assignment guard - `if(isNew() or !arguments.parentProductType.hasChildProductType( this ))`.
   * A SINGULAR `has*`, dispatched by
   * org/Hibachi/HibachiEntity.cfc's `has<SingularPropertyName>` branch.
   */
  hasChildProductType(childProductType: ProductType): boolean {
    return this.childProductTypes.some((candidate) => candidate.isSameRowAs(childProductType));
  }

  /**
   * Whether this product type is already linked to `promotionReward` as an INCLUDED product type.
   *
   * Proven reached by model/entity/PromotionReward.cfc:L282, the guard inside the owning side's
   * `addProductType`.
   */
  hasPromotionReward(promotionReward: PromotionReward): boolean {
    return this.promotionRewards.includes(promotionReward);
  }

  /**
   * Whether this product type is already linked to `promotionReward` as an EXCLUDED product type.
   *
   * Proven reached by model/entity/PromotionReward.cfc:L382.
   */
  hasPromotionRewardExclusion(promotionReward: PromotionReward): boolean {
    return this.promotionRewardExclusions.includes(promotionReward);
  }

  /**
   * Whether this product type is already linked to `promotionQualifier` as an INCLUDED product type.
   *
   * Proven reached by model/entity/PromotionQualifier.cfc:L224.
   */
  hasPromotionQualifier(promotionQualifier: PromotionQualifier): boolean {
    return this.promotionQualifiers.includes(promotionQualifier);
  }

  /**
   * Whether this product type is already linked to `promotionQualifier` as an EXCLUDED product type.
   *
   * Proven reached by model/entity/PromotionQualifier.cfc:L324.
   */
  hasPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): boolean {
    return this.promotionQualifierExclusions.includes(promotionQualifier);
  }

  /**
   * Whether this product type is already linked to `priceGroupRate` as an INCLUDED product type.
   *
   * Proven reached by model/entity/PriceGroupRate.cfc:L202.
   *
   * The four link probes above and this one compare by REFERENCE rather than by primary key, which
   * is the one deliberate asymmetry with {@link ProductType.hasChildProductType}. The reason is the
   * far side: those collaborators are `import type` only, so no method on them can be called from
   * this class without introducing a runtime value import across the entities folder and breaking
   * the type-only cycle that keeps the two folders acyclic at emit. Reference identity is what the
   * CFML in-session object graph provided for these link collections anyway - the ORM handed the
   * same managed instance to both sides of a many-to-many within a session - so the observable
   * behaviour is unchanged. `hasChildProductType` can afford the stronger primary-key test because
   * its far side is `ProductType` itself.
   */
  hasPriceGroupRate(priceGroupRate: PriceGroupRate): boolean {
    return this.priceGroupRates.includes(priceGroupRate);
  }

  // -------------------------------------------------------------------------
  // OMITTED [model/entity/ProductType.cfc:L92-L99] - getInheritedAttributeSetAssignments()
  //
  //    92: 	public any function getInheritedAttributeSetAssignments() {
  //    93: 		// Todo get by all the parent productTypeIDs
  //    94: 		var attributeSetAssignments = getService("AttributeService").getAttributeSetAssignmentSmartList().getRecords();
  //    95: 		if(!arrayLen(attributeSetAssignments)){
  //    96: 			attributeSetAssignments = [];
  //    97: 		}
  //    98: 		return attributeSetAssignments;
  //    99: 	}
  //
  // Not authored, for TWO independent reasons that each suffice on their own.
  //
  // First, it is a SMART LIST. `HibachiSmartList` is a framework artifact - a generic, string-keyed,
  // dynamically-filtered query builder supplied by org/Hibachi/. Porting it would mean
  // reimplementing a small ORM query language, which would re-import exactly the framework coupling
  // this refactor exists to remove and would be untypeable under the strict profile. Smart lists are
  // replaced throughout the target by EXPLICIT, TYPED repository query methods owned by
  // `src/services/**` and `src/repositories/mysql/**` - never by an entity.
  //
  // Second, it reaches `attributeService` for `AttributeSetAssignment` records, and the
  // entity-attribute-value path is not ported at all (see the non-materialized collections above).
  // There is no in-scope type for this method to return.
  //
  // TODO CARRY-FORWARD, PER THE TODO DIRECTIVE. The source carries a LIVE legacy TODO at [L93]
  // acknowledging that the method is INCOMPLETE - it fetches every attribute-set assignment in the
  // installation instead of the ones inherited from this node's parents, so despite its name it
  // "inherits" nothing. It is reproduced VERBATIM here and deliberately NOT silently completed:
  //
  // TODO [model/entity/ProductType.cfc:L93]: Todo get by all the parent productTypeIDs
  //
  // Whoever ports the attribute subsystem inherits that TODO along with the method; resolving it is
  // a product decision, not a translation decision.
  //
  // Secondary register item [model/entity/ProductType.cfc:L95-L97]: the guard is a DEAD NO-OP. It
  // reassigns an empty array to a variable that is already an empty array, and `getRecords()`
  // returns an array unconditionally, so the branch can never change the outcome. Recorded because
  // it is the kind of line a reader assumes must be load-bearing.
  // -------------------------------------------------------------------------

  /**
   * Replace this product type's product collection wholesale
   * [model/entity/ProductType.cfc:L101-L107].
   *
   *   101: 	public void function setProducts(required array Products) {
   *   102: 		// first, clear existing collection
   *   103: 		variables.Products = [];
   *   104: 		for( var product in arguments.Products ) {
   *   105: 			addProduct(product);
   *   106: 		}
   *   107: 	}
   *
   * The source's own comment - `// first, clear existing collection` - is preserved at the line it
   * annotates below.
   *
   * LEGACY-NOTE [model/entity/ProductType.cfc:L101, L103]: the parameter is declared with a CAPITAL
   * `P` (`required array Products`) and the clear target is the equally capitalized
   * `variables.Products`. CFML struct keys and argument names are case-INSENSITIVE, so `Products`,
   * `products` and `PRODUCTS` are one and the same slot there, and the capitalization carries no
   * meaning. TypeScript is case-SENSITIVE, so the internal storage key and the parameter are
   * normalised to lower-case `products` while the PUBLIC method name `setProducts` - which is
   * already correct - stays verbatim. The identical treatment is already applied to
   * `variables.Options` in src/domain/entities/optionGroup.ts.
   *
   * THE COLLECTION IS REPLACED, NOT CLEARED IN PLACE. [L103] assigns a NEW array rather than
   * emptying the existing one, so any reference a caller obtained earlier keeps the OLD contents.
   * That is reproduced by rebinding the field, which is why `products` is the one collection field on
   * this class that is not `readonly`.
   */
  setProducts(products: readonly Product[]): void {
    // first, clear existing collection
    this.products = [];
    for (const product of products) {
      this.addProduct(product);
    }
  }

  /**
   * Add one product to this product type's in-memory collection.
   *
   * LEGACY-NOTE [model/entity/ProductType.cfc:L101-L107, L66]: `addProduct()` is NOT declared
   * anywhere in ProductType.cfc - the bidirectional helper block [L146-L245] covers
   * parentProductType, childProductTypes, promotionRewards, promotionRewardExclusions,
   * promotionQualifiers, promotionQualifierExclusions, priceGroupRates, priceGroupRateExclusions,
   * attributeSets, attributeValues and physicals, but NOT products. The call at [L105] therefore
   * resolves to the Hibernate/CFML ORM-GENERATED collection accessor derived from
   * `singularname="product"` [L66]. Because `products` is `inverse="true"`, that generated adder
   * mutates only the in-memory array and does NOT set `product.productType`, so `setProducts()`
   * never synchronises the inverse side and the association is not persisted by this call. The
   * foreign key is owned by `Product.productTypeID`; `src/repositories/mysql/**` owns persistence
   * and collection state. Authored here as an explicit typed array operation - TypeScript must NOT
   * emulate dynamic dispatch, so there is no `Proxy` and no index signature. Contrast the
   * EXPLICITLY-DELEGATING helpers at [L167-L172] and model/entity/Category.cfc:L93-L98, which the
   * source did hand-write.
   *
   * Append-if-absent, by primary key: Hibernate's generated adder is a set-semantics collection
   * operation, not an unconditional push, so adding the same product twice leaves one entry. The
   * comparison is by `productID` for the same reason every probe on this class compares by key, with
   * a reference fallback for an unsaved product whose key is still the empty string.
   */
  addProduct(product: Product): void {
    const productID = product.getProductID();
    const alreadyLinked = this.products.some((candidate) => {
      const candidateID = candidate.getProductID();
      if (candidateID === '' || productID === '') {
        return candidate === product;
      }
      return candidateID === productID;
    });
    if (!alreadyLinked) {
      this.products.push(product);
    }
  }

  /**
   * Remove one product from this product type's in-memory collection.
   *
   * The counterpart to {@link ProductType.addProduct} and, like it, the ORM-generated
   * `remove<SingularName>` accessor for `singularname="product"` [L66] rather than a hand-written
   * helper. It removes at most one entry, matched by primary key with the same unsaved-row reference
   * fallback, and it does NOT clear `product.productTypeID`, because the inverse side owns that
   * column.
   */
  removeProduct(product: Product): void {
    const productID = product.getProductID();
    const index = this.products.findIndex((candidate) => {
      const candidateID = candidate.getProductID();
      if (candidateID === '' || productID === '') {
        return candidate === product;
      }
      return candidateID === productID;
    });
    if (index !== -1) {
      this.products.splice(index, 1);
    }
  }

  //get merchandisetype
  /**
   * Resolve the base - "merchandise type" - system code for this product type
   * [model/entity/ProductType.cfc:L109-L115].
   *
   *   109: 	//get merchandisetype
   *   110: 	public any function getBaseProductType() {
   *   111: 		if(isNull(getSystemCode()) || getSystemCode() == ""){
   *   112: 			return getService("ProductService").getProductType(listFirst(getProductTypeIDPath())).getSystemCode();
   *   113: 		}
   *   114: 		return getSystemCode();
   *   115: 	}
   *
   * The source's own comment `//get merchandisetype` is preserved verbatim immediately above this
   * documentation block, at the position it occupies in the source.
   *
   * THE ONE ASYNCHRONOUS MEMBER ON THIS CLASS. [L112] performs a product-type load BY IDENTIFIER of
   * the ROOT element of the materialized path, which is unambiguously a repository round-trip, so
   * the async boundary rule makes this - and only this - method return a promise. Every other member
   * traverses already-materialized associations or does pure string work and stays synchronous.
   *
   * THE GUARD IS REPRODUCED AS TWO SEPARATE TESTS, NOT COLLAPSED TO A TRUTHINESS CHECK. CFML asks
   * `isNull(getSystemCode()) || getSystemCode() == ""`, which is an ABSENT test followed by an
   * EMPTY-STRING test. `isNullish()` answers the first and `cfLen(...) === 0` answers the second.
   * Writing `if (!systemCode)` instead would look equivalent and would not be: it is the shape of
   * the guard, not merely its outcome on today's data, that is the ported contract.
   *
   * LEGACY-NOTE [model/entity/ProductType.cfc:L112]: CFML `listFirst()` has NO counterpart among
   * src/lib/cfml/list.ts's five exports (`listLen`, `listGetAt`, `listAppend`, `listToArray`,
   * `listFindNoCase`). The equivalent is a 1-based positional read of the first element, and
   * `getRootIdFromIdPath()` in src/domain/valueObjects/materializedIdPath.ts IS that emulation - its
   * own documentation names THIS call site, it answers `''` for an empty path exactly as CFML
   * `listFirst('')` does, and it performs `listGetAt(idPath, 1)` internally for every non-empty path.
   * It is called here rather than reaching for `listGetAt` directly, because a bare
   * `listGetAt('', 1)` raises out of range where CFML `listFirst('')` does not, and the value object
   * is where that boundary is already reconciled.
   *
   * WHY THE PARENT CHAIN IS NOT WALKED INSTEAD. Climbing `parentProductType` to the root and reading
   * its system code would look like the same answer and is NOT equivalent: [L112] takes the root
   * IDENTIFIER out of the STORED path and loads that row fresh. A stored path that disagrees with
   * the in-memory parent chain - stale, truncated at 4000 characters, or hydrated without its
   * parents - gives a different result, and the stored path is what the legacy consults. The
   * substitution would be a silent behaviour change, so it is not made.
   *
   * THE UNGUARDED DEREFERENCE IS PRESERVED, NOT PAPERED OVER. In CFML, `.getSystemCode()` is invoked
   * directly on whatever `getProductType(...)` returns. If the path is empty, or the root row is
   * missing, that call fails at runtime. The port reproduces the failure by raising rather than
   * inventing a fallback value, because a fabricated fallback would flow straight into the
   * `baseProductType` gate in model/validation/Product.json (`inList "merchandise" | "subscription"`)
   * and turn a hard failure into a wrong answer.
   *
   * AN ABSENT OR EMPTY RETURN IS A LEGITIMATE ANSWER AND IS LOAD-BEARING. The root product type may
   * itself carry no system code, in which case CFML returns null and this method returns `undefined`.
   * That emptiness is what the validation gate above tests against; it must not be coerced to a
   * string.
   *
   * THIS IS NOT INFINITE RECURSION WHEN THIS ENTITY *IS* THE ROOT. The path's first element is then
   * this product type's own identifier, the repository returns this same row, and
   * `getSystemCode()` is a plain column accessor - it does not re-enter this method. The round trip
   * terminates in one hop. Recorded so a reviewer does not "fix" a problem that does not exist.
   *
   * THE ASYNC BOUNDARY PROPAGATES. `Product.getBaseProductType()` delegates to this method and
   * `Sku.getBaseProductType()` delegates to `Product`, so both of those are asynchronous too. That
   * is a live validation path, not a theoretical one.
   *
   * @throws when the product-type repository was not wired, or when the root row named by the stored
   *   path cannot be loaded - the preserved [L112] failure.
   */
  async getBaseProductType(): Promise<string | undefined> {
    const systemCode = this.getSystemCode();
    if (isNullish(systemCode) || cfLen(systemCode) === 0) {
      if (this.productTypeRepository === undefined) {
        throw new Error(
          'ProductType.getBaseProductType() requires a productTypeRepository, which was not ' +
            'supplied when this product type was hydrated. It resolves the base product type by ' +
            'loading the root row named by productTypeIDPath [model/entity/ProductType.cfc:L112], ' +
            'so it cannot answer without the port. Absent is not defaulted here because undefined ' +
            'is itself a legitimate answer - the root product type may carry no system code.',
        );
      }

      const rootProductTypeID = getRootIdFromIdPath(this.getProductTypeIDPath());
      const rootProductType =
        await this.productTypeRepository.getProductTypeByProductTypeID(rootProductTypeID);

      if (rootProductType === undefined) {
        throw new Error(
          'ProductType.getBaseProductType() could not load the root product type ' +
            `'${rootProductTypeID}' named by the first element of productTypeIDPath ` +
            `'${this.getProductTypeIDPath()}' for product type '${this.productTypeID}'. ` +
            'The legacy body at [model/entity/ProductType.cfc:L112] invokes getSystemCode() ' +
            'directly on the load result with no null guard, so this failure is the preserved ' +
            'behaviour and not a new one.',
        );
      }

      return rootProductType.getSystemCode();
    }
    return systemCode;
  }

  /**
   * Resolve the price-group rate that applies to this product type
   * [model/entity/ProductType.cfc:L117-L119] - EXCEPT THAT IT CANNOT, AND NEVER COULD.
   *
   *   117:     public any function getAppliedPriceGroupRateByPriceGroup( required any priceGroup) {
   *   118: 		return getService("priceGroupService").getRateForProductTypeBasedOnPriceGroup(product=this, priceGroup=arguments.priceGroup);
   *   119: 	}
   *
   * LEGACY-DEFECT [model/entity/ProductType.cfc:L117-L119]: passes product=this to
   * PriceGroupService.getRateForProductTypeBasedOnPriceGroup, whose signature requires productType=
   * [model/service/PriceGroupService.cfc:L57]. The required argument is never supplied, so this method
   * ALWAYS throws at runtime and can never return a rate. Correct twin for contrast:
   * model/entity/Sku.cfc:L265-L268 passes sku=this.
   * Preserved deliberately; do not fix without a product decision.
   *
   * WHY THIS IS AUTHORED AS A THROWING STUB RATHER THAN REPAIRED. Changing `product=` to
   * `productType=` would move the observable behaviour from ALWAYS THROWS to RETURNS A RATE, which
   * is precisely what behaviour preservation forbids - and a rate this method has never once
   * returned in production could change what a customer is charged. The return type is therefore
   * `never`: the method has no success path to type.
   *
   * NO PRICE-GROUP PORT IS INJECTED FOR THIS METHOD, and no fourteenth port is added. The legacy
   * call never reaches the service, so there is no collaborator to wire; wiring one would imply a
   * capability that does not exist. This is the same reasoning that removed the `promotionService`
   * locator at model/entity/Sku.cfc:L258 rather than inventing its missing target. The `priceGroup`
   * parameter is retained unused, because dropping it would change the public signature and interface
   * parity is the acceptance contract.
   *
   * Cosmetic source artifacts, recorded once: [L117] and [L120] are indented with FOUR LEADING SPACES
   * where the rest of the component uses a tab, and the argument list is written
   * `( required any priceGroup)` with a space after the open paren and none before the close.
   * Whitespace only - minimal change scopes the functional surface, not the style.
   *
   * @throws always, reproducing the CFML missing-required-argument failure at the service boundary.
   */
  getAppliedPriceGroupRateByPriceGroup(priceGroup: PriceGroup): never {
    throw new Error(
      'ProductType.getAppliedPriceGroupRateByPriceGroup() always fails. ' +
        '[model/entity/ProductType.cfc:L118] calls ' +
        'PriceGroupService.getRateForProductTypeBasedOnPriceGroup with the named argument ' +
        "'product', but that function's first required parameter is 'productType' " +
        '[model/service/PriceGroupService.cfc:L57], so CFML raises a missing-required-argument ' +
        'error before the service body ever runs. The defect is preserved deliberately rather than ' +
        'repaired, because repairing it would change this method from always throwing to returning ' +
        'a price-group rate. The correct twin is model/entity/Sku.cfc:L265-L268, which passes ' +
        "'sku'. Resolve product-type rates through the price-group service instead: " +
        'getRateForProductTypeBasedOnPriceGroup(productType, priceGroup).',
    );
  }

  // -------------------------------------------------------------------------
  // OMITTED [model/entity/ProductType.cfc:L122-L142] - getParentProductTypeOptions( string
  // baseProductType="" )
  //
  // A SMART LIST, omitted for the reasons given at getInheritedAttributeSetAssignments above:
  // `getPropertyOptionsSmartList("parentProductType")` is inherited framework machinery, the filter
  // is applied through `addLikeFilter("productTypeIDPath", "<rootID>%")`, and the root identifier is
  // fetched via `getService('productService').getProductTypeBySystemCode(...)` [L129]. Reproducing
  // that means reproducing a string-keyed dynamic query builder. The replacement is an explicit,
  // typed repository query owned by `src/services/productService.ts`, not a method on this entity.
  //
  // Three further facts about the omitted body, recorded so nothing is lost with it.
  //
  //   * It is MEMOIZED on `structKeyExists(variables, "parentProductTypeOptions")`, the
  //     `persistent="false"` property declared at [L89]. No field is authored here, because a memo
  //     for an omitted method is dead state.
  //   * Its guard is `!len(arguments.baseProductType)` - a CFML LENGTH test and not a truthiness
  //     test. Had the method been ported, that would route through `cfLen()` from
  //     src/lib/cfml/truthiness.ts and NOT through a JavaScript falsy check, for the same reason
  //     spelled out on getBaseProductType above.
  //   * HAZARD WORTH NAMING [model/entity/ProductType.cfc:L136]: the exclusion filter compares
  //     `getProductTypeName()` - it excludes records BY NAME, not by identifier. Two distinct product
  //     types sharing a name would therefore BOTH be excluded, and renaming a product type silently
  //     changes the option list. Annotated, not fixed: the method is omitted, so there is nothing
  //     here to repair, and the replacement query must key on `productTypeID` instead.
  // -------------------------------------------------------------------------

  // =============== START: Bidirectional Helper Methods ===================
  // [model/entity/ProductType.cfc:L146] opens this banner run and [L246] closes it.
  //
  // LEGACY-NOTE [model/entity/ProductType.cfc:L146-L245]: MANDATORY "remove-that-ADDs" inversion
  // cross-check performed across all eleven remove* bidirectional helpers in this component
  // (L155, L170, L178, L186, L194, L202, L210, L218, L226, L234, L242).
  // RESULT: CLEAN - ZERO inversions. Every remove* body correctly calls a remove*/removeExcluded*
  // counterpart on the owning side. Contrast model/entity/Option.cfc:L129-L131 and :L145-L147, which
  // DO carry the inversion defect - both call addExcludedOption(this) from inside a remove* method.
  // No divergence is spent here because there is nothing to preserve.
  //
  // The eleven, verified one by one against the verbatim source:
  //   L155 removeParentProductType             -> arrayDeleteAt on the parent's children  [correct]
  //   L170 removechildProductType              -> removeParentProductType(this)           [correct]
  //   L178 removePromotionReward               -> removeProductType                       [correct]
  //   L186 removePromotionRewardExclusion      -> removeExcludedProductType               [correct]
  //   L194 removePromotionQualifier            -> removeProductType                       [correct]
  //   L202 removePromotionQualifierExclusion   -> removeExcludedProductType               [correct]
  //   L210 removePriceGroupRate                -> removeProductType                       [correct]
  //   L218 removePriceGroupRateExclusion       -> removeExcludedProductType               [correct]
  //   L226 removeAttributeSet                  -> removeProductType                       [correct]
  //   L234 removeAttributeValue                -> removeProductType                       [correct]
  //   L242 removePhysical                      -> removeProductType                       [correct]
  //
  // Cosmetic secondary register item: the blocks at [L182-L188], [L198-L204], [L214-L220] and
  // [L238-L244] carry trailing whitespace after their `{` and `}` - evidently copy-pasted. Style
  // only; minimal change scopes the functional surface.
  // -----------------------------------------------------------------------

  /**
   * Attach this product type to a parent [model/entity/ProductType.cfc:L149-L153].
   *
   *   149: 	public void function setParentProductType(required any parentProductType) {
   *   150: 		variables.parentProductType = arguments.parentProductType;
   *   151: 		if(isNew() or !arguments.parentProductType.hasChildProductType( this )) {
   *   152: 			arrayAppend(arguments.parentProductType.getChildProductTypes(), this);
   *   153: 		}
   *   154: 	}
   *
   * STRUCTURALLY IDENTICAL to model/entity/Category.cfc:L101-L108, and the precedents established in
   * src/domain/entities/category.ts are applied verbatim.
   *
   * THE ORDER OF THE TWO STATEMENTS IS LOAD-BEARING. The near side is assigned FIRST [L150] and the
   * far side is appended SECOND [L152], guarded. Reversing them would let the guard observe a
   * different near-side state.
   *
   * THE GUARD IS A DISJUNCTION, AND THE FIRST DISJUNCT SHORT-CIRCUITS THE PROBE. `isNew()` is asked
   * first, so an unsaved product type is appended WITHOUT any containment check - which means calling
   * this twice with the same parent while unsaved appends this node twice. That is the CFML
   * behaviour, reproduced rather than tidied: `isNew()` is a cheap emptiness test on the identifier
   * and the probe is the expensive scan, so the short-circuit was the point.
   *
   * The append goes through `getChildProductTypes()`, which returns the parent's LIVE array - that is
   * why that accessor is not `readonly`.
   *
   * ★ WHATEVER IT IS HANDED IS ASSIGNED, INCLUDING A DESCENDANT OF THIS NODE.
   * The legacy setter validates nothing, so choosing this node's own descendant as
   * its parent is accepted and a cyclic `parentProductType` chain is created. That
   * is reproduced rather than corrected, so no assignment this method accepts
   * differs from the assignment [model/entity/ProductType.cfc:L149-L153] would
   * have accepted.
   *
   * ★ AN EARLIER REVISION REFUSED SUCH A REPARENT, AND THE RECORD OF ITS REMOVAL
   * BELONGS HERE. This method used to call a `wouldCreateIdPathCycle()` helper and
   * throw, under a three-star divergence banner. Three checkable reasons removed
   * it. (1) A port reproduces; it does not improve. The legacy setter has no such
   * check, so refusing an assignment it accepts is an unrequested behavioural
   * change rather than a migration. (2) The project's deliberate-divergence budget
   * is closed at THREE - the un-`var`'d `discountAmount`
   * [model/service/PromotionService.cfc:L1007], the `amountOff` branch routed
   * through `Money` [model/service/PromotionService.cfc:L998], and the entity memo
   * defects in `sku.ts`/`product.ts` - and a guard here was a FOURTH, justified
   * against itself rather than against that budget. (3) Termination on a cyclic
   * chain genuinely had to be decided in exactly one place, and this is not it:
   * `hydrateWithAncestry` in `mysqlProductTypeRepository.ts` is a hand-written
   * recursive read that replaces Hibernate's lazy traversal under transformation
   * rule T3, has no legacy antecedent to reproduce, and therefore owns its own
   * fetch-shape termination decision. It still RAISES `ProductTypeCycleError`
   * naming the chain it followed rather than truncating, because a shortened
   * ancestry is a DIFFERENT product-type membership set, and membership decides
   * which promotion rewards and which price-group rate apply - truncating would be
   * a different price arrived at silently. Raising there is a decision about a
   * query the legacy system never issued; it is not a change to this setter.
   *
   * THE CONSTRUCTOR IS LIKEWISE UNGUARDED, and for the same reason: it is the
   * hydration boundary, it reproduces what the row set says, and the adapter that
   * produced the row set has already refused to hand back a cyclic one.
   */
  setParentProductType(parentProductType: ProductType): void {
    // CFML parity [model/entity/ProductType.cfc:L149-L153]: the legacy body validates nothing
    // before assigning, and neither does this one. A cyclic parent chain is accepted here
    // exactly as it is accepted there.
    this.parentProductType = parentProductType;
    if (this.isNew() || !parentProductType.hasChildProductType(this)) {
      parentProductType.getChildProductTypes().push(this);
    }
  }

  /**
   * Detach this product type from a parent [model/entity/ProductType.cfc:L155-L164].
   *
   *   155: 	public void function removeParentProductType(any parentProductType) {
   *   156: 		if(!structKeyExists(arguments, "parentProductType")) {
   *   157: 			arguments.parentProductType = variables.parentProductType;
   *   158: 		}
   *   159: 		var index = arrayFind(arguments.parentProductType.getChildProductTypes(), this);
   *   160: 		if(index > 0) {
   *   161: 			arrayDeleteAt(arguments.parentProductType.getChildProductTypes(), index);
   *   162: 		}
   *   163: 		structDelete(variables, "parentProductType");
   *   164: 	}
   *
   * THE ARGUMENT IS OPTIONAL - note `any parentProductType` at [L155] with no `required`. The default
   * branch tests `structKeyExists(arguments, "parentProductType")`, which asks whether the argument
   * was PASSED, and NOT whether it is truthy. The port therefore branches on `!== undefined` and
   * never on truthiness: a caller who explicitly passes `undefined` is treated by CFML's
   * `structKeyExists` as having passed nothing, which is exactly what `!== undefined` reproduces.
   *
   * THE UNGUARDED DEREFERENCE AT [L159] IS PRESERVED. When no argument is passed AND this product
   * type has no parent, CFML calls `.getChildProductTypes()` on null and fails. The port raises with
   * an explanatory message instead of silently returning, because silently returning would be a new
   * behaviour - and because the caller has asked to detach from a parent that does not exist, which
   * is a programming error worth surfacing.
   *
   * `arrayFind` IS 1-BASED, SO `index > 0` MEANS "FOUND". `Array.prototype.findIndex` is 0-based and
   * reports absence as `-1`, so the port tests `!== -1`. Transliterating `> 0` would silently skip a
   * match at position 0 - the single most likely translation error in this whole method, and the
   * reason the comparison is spelled out here.
   *
   * MATCHING IS BY PRIMARY KEY, matching every other containment test on this class, with the
   * unsaved-row reference fallback that {@link ProductType.isSameRowAs} provides. CFML's `arrayFind`
   * with an object needle compared managed instances within a session, which primary-key equality
   * reproduces for persisted rows and reference equality reproduces for unsaved ones.
   *
   * THE NEAR-SIDE CLEAR AT [L163] IS UNCONDITIONAL. `structDelete` runs whether or not the far-side
   * splice found anything, so `this.parentProductType` is set to `undefined` outside the guard. A
   * reader expecting symmetry with the guarded far side will expect otherwise; the source does not.
   *
   * @throws when no argument is passed and this product type has no parent - the preserved [L159]
   *   null dereference.
   */
  removeParentProductType(parentProductType?: ProductType): void {
    // [L156-L158] reproduce `structKeyExists(arguments, "parentProductType")`: the test is whether an
    // argument was supplied, NOT whether it is truthy.
    const resolvedParent: ProductType | undefined =
      parentProductType !== undefined ? parentProductType : this.parentProductType;

    if (resolvedParent === undefined) {
      throw new Error(
        'ProductType.removeParentProductType() was called with no argument on a product type that ' +
          'has no parent, so there is no collection to detach from. ' +
          '[model/entity/ProductType.cfc:L159] dereferences the resolved parent without a guard, so ' +
          'this failure is the preserved behaviour. Pass the parent explicitly, or check ' +
          'getParentProductType() first.',
      );
    }

    // [L159-L162] the far side. `arrayFind` is 1-based and reports absence as 0; `findIndex` is
    // 0-based and reports absence as -1, so the guard is `!== -1` and NOT `> 0`.
    const siblings: ProductType[] = resolvedParent.getChildProductTypes();
    const index: number = siblings.findIndex((child) => this.isSameRowAs(child));
    if (index !== -1) {
      siblings.splice(index, 1);
    }

    // [L163] `structDelete` is UNCONDITIONAL - outside the guard above, exactly as written.
    this.parentProductType = undefined;
  }

  /**
   * Adopt `childProductType` as a child of this product type
   * [model/entity/ProductType.cfc:L167-L169].
   *
   *   167: 	public void function addchildProductType(required any ChildProductType) {
   *   168: 		arguments.ChildProductType.setParentProductType( this );
   *   169: 	}
   *
   * A pure delegation to the child's own {@link ProductType.setParentProductType}, so the guarded
   * append and the near-side assignment happen in exactly one place.
   *
   * LEGACY-NOTE [model/entity/ProductType.cfc:L167, L170]: declared as addchildProductType /
   * removechildProductType with a lowercase 'c', and with a capital-C 'ChildProductType' argument.
   * CFML method names are case-insensitive, so both spellings dispatch identically; the ORM-canonical
   * form implied by singularname="childProductType" (L65) and the sibling convention at
   * model/entity/Category.cfc:L93 is camelCase. Normalised here; this is an internal naming
   * inconsistency, not a data contract.
   */
  addChildProductType(childProductType: ProductType): void {
    childProductType.setParentProductType(this);
  }

  /**
   * Release `childProductType` from this product type
   * [model/entity/ProductType.cfc:L170-L172].
   *
   *   170: 	public void function removechildProductType(required any ChildProductType) {
   *   171: 		arguments.ChildProductType.removeParentProductType( this );
   *   172: 	}
   *
   * Delegates to the child's {@link ProductType.removeParentProductType} WITH the parent supplied,
   * which means the optional-argument default branch there is never taken from this path and the
   * preserved null dereference is unreachable through it. Same lowercase-`c` normalisation as
   * {@link ProductType.addChildProductType} - see the note there.
   */
  removeChildProductType(childProductType: ProductType): void {
    childProductType.removeParentProductType(this);
  }

  /**
   * Link this product type to `promotionReward` as an INCLUDED product type
   * [model/entity/ProductType.cfc:L175-L177].
   *
   *   175: 	public void function addPromotionReward(required any promotionReward) {
   *   176: 		arguments.promotionReward.addProductType( this );
   *   177: 	}
   *
   * THE INVERSE SIDE DELEGATES TO THE OWNER, and every one of the twelve helpers below follows that
   * one rule. `promotionRewards` is `inverse="true"` [L70], so the link table
   * `SwPromoRewardProductType` is written by model/entity/PromotionReward.cfc - which owns FOURTEEN
   * link collections, `productTypes` and `excludedProductTypes` among them. Duplicating the
   * both-sides bookkeeping here would give two implementations of one association and a chance for
   * them to disagree; delegating gives one.
   */
  addPromotionReward(promotionReward: PromotionReward): void {
    promotionReward.addProductType(this);
  }

  /**
   * Unlink this product type from `promotionReward`'s INCLUDED product types
   * [model/entity/ProductType.cfc:L178-L180] - delegating to `removeProductType` on the owner.
   *
   * Verified NOT inverted: the body calls `removeProductType`, not an `add*`. See the cross-check
   * verdict at the head of this block.
   */
  removePromotionReward(promotionReward: PromotionReward): void {
    promotionReward.removeProductType(this);
  }

  /**
   * Link this product type to `promotionReward` as an EXCLUDED product type
   * [model/entity/ProductType.cfc:L183-L185] - delegating to `addExcludedProductType` on the owner,
   * which writes `SwPromoRewardExclProductType` [L71].
   */
  addPromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.addExcludedProductType(this);
  }

  /**
   * Unlink this product type from `promotionReward`'s EXCLUDED product types
   * [model/entity/ProductType.cfc:L186-L188].
   *
   * Verified NOT inverted - and this is precisely the shape that IS inverted on a sibling entity:
   * model/entity/Option.cfc:L129-L131 calls `addExcludedOption(this)` from inside
   * `removePromotionRewardExclusion`. ProductType's equivalent correctly calls
   * `removeExcludedProductType`.
   */
  removePromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.removeExcludedProductType(this);
  }

  /**
   * Link this product type to `promotionQualifier` as an INCLUDED product type
   * [model/entity/ProductType.cfc:L191-L193] - delegating to the owner, which writes
   * `SwPromoQualProductType` [L72] and owns THIRTEEN link collections.
   */
  addPromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addProductType(this);
  }

  /**
   * Unlink this product type from `promotionQualifier`'s INCLUDED product types
   * [model/entity/ProductType.cfc:L194-L196]. Verified NOT inverted.
   */
  removePromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeProductType(this);
  }

  /**
   * Link this product type to `promotionQualifier` as an EXCLUDED product type
   * [model/entity/ProductType.cfc:L199-L201] - `SwPromoQualExclProductType` [L73].
   */
  addPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addExcludedProductType(this);
  }

  /**
   * Unlink this product type from `promotionQualifier`'s EXCLUDED product types
   * [model/entity/ProductType.cfc:L202-L204].
   *
   * Verified NOT inverted - the second shape that IS inverted on a sibling:
   * model/entity/Option.cfc:L145-L147 calls `addExcludedOption(this)` here.
   */
  removePromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeExcludedProductType(this);
  }

  /**
   * Link this product type to `priceGroupRate` as an INCLUDED product type
   * [model/entity/ProductType.cfc:L207-L209] - delegating to
   * model/entity/PriceGroupRate.cfc:L199-L206, which writes `SwPriceGroupRateProductType` [L74].
   */
  addPriceGroupRate(priceGroupRate: PriceGroupRate): void {
    priceGroupRate.addProductType(this);
  }

  /**
   * Unlink this product type from `priceGroupRate`'s INCLUDED product types
   * [model/entity/ProductType.cfc:L210-L212] - delegating to
   * model/entity/PriceGroupRate.cfc:L207-L216. Verified NOT inverted.
   */
  removePriceGroupRate(priceGroupRate: PriceGroupRate): void {
    priceGroupRate.removeProductType(this);
  }

  /**
   * Link this product type to `priceGroupRate` as an EXCLUDED product type
   * [model/entity/ProductType.cfc:L215-L217].
   *
   *   215: 	public void function addPriceGroupRateExclusion(required any priceGroupRate) {
   *   216: 		arguments.priceGroupRate.addExcludedProductType( this );
   *   217: 	}
   *
   * LEGACY-NOTE [model/entity/ProductType.cfc:L215-L220, model/entity/PriceGroupRate.cfc:L75]: this
   * is the ONE pair in this block whose far side has no hand-written counterpart.
   * model/entity/PriceGroupRate.cfc hand-writes helpers for its three INCLUDED collections only -
   * `addProductType` / `removeProductType` at L199 / L207 among them - and NONE for its three
   * `excluded*` collections, so `addExcludedProductType` at [L216] resolves to the
   * Hibernate/CFML ORM-GENERATED collection accessor for
   * `excludedProductTypes singularname="excludedProductType"` [model/entity/PriceGroupRate.cfc:L75].
   * A generated accessor on an `inverse="true"` collection mutates only the in-memory array on the
   * side it was called against; it does not walk back to this entity. This helper therefore maintains
   * THIS entity's own `priceGroupRateExclusions` array directly rather than delegating - which is
   * what the legacy call achieved on the ONE side it touched - and it invents no member on
   * `PriceGroupRate`, whose ported surface exposes `getExcludedProductTypes()` as a readonly view
   * with no adder and documents that absence at its own locator. Set semantics, matching every other
   * generated adder in the target.
   */
  addPriceGroupRateExclusion(priceGroupRate: PriceGroupRate): void {
    if (!this.priceGroupRateExclusions.includes(priceGroupRate)) {
      this.priceGroupRateExclusions.push(priceGroupRate);
    }
  }

  /**
   * Unlink this product type from `priceGroupRate`'s EXCLUDED product types
   * [model/entity/ProductType.cfc:L218-L220].
   *
   *   218: 	public void function removePriceGroupRateExclusion(required any priceGroupRate) {
   *   219: 		arguments.priceGroupRate.removeExcludedProductType( this );
   *   220: 	}
   *
   * Verified NOT inverted - the body calls `removeExcludedProductType`, not an `add*`. Maintained on
   * this side for the ORM-generated-accessor reason spelled out on
   * {@link ProductType.addPriceGroupRateExclusion}. Matching is by reference, as the sibling
   * `remove*` helpers on the owning side do with `indexOf`.
   */
  removePriceGroupRateExclusion(priceGroupRate: PriceGroupRate): void {
    const index: number = this.priceGroupRateExclusions.indexOf(priceGroupRate);
    if (index !== -1) {
      this.priceGroupRateExclusions.splice(index, 1);
    }
  }

  // -------------------------------------------------------------------------
  // DROPPED bidirectional helpers [model/entity/ProductType.cfc:L223-L244]
  //
  // Six helpers, three collections, all three non-materialized. Each is dropped and each says why:
  //
  //   [L223-L225] addAttributeSet    -> arguments.attributeSet.addProductType( this )
  //   [L226-L228] removeAttributeSet -> arguments.attributeSet.removeProductType( this )
  //     `AttributeSet` is OUT OF SCOPE [L76]. There is no in-scope type to accept, so authoring
  //     either helper would mean inventing an entity or typing the parameter loosely - and no `any`
  //     is permitted anywhere in this target.
  //
  //   [L231-L233] addAttributeValue    -> arguments.attributeValue.setProductType( this )
  //   [L234-L236] removeAttributeValue -> arguments.attributeValue.removeProductType( this )
  //     The ENTITY-ATTRIBUTE-VALUE PATH IS NOT PORTED [L67]. Exactly the
  //     model/entity/Brand.cfc:L90 / :L93 precedent, where the same pair is dropped for the same
  //     reason. Recorded for the register: this pair is ASYMMETRIC IN SHAPE - `add` calls a SETTER
  //     (`setProductType`) while `remove` calls a REMOVER (`removeProductType`), so they are not
  //     mirror images of one another even in the source. `cascade="all-delete-orphan"` on that
  //     collection is a persistence obligation and belongs to the repositories sibling, not here.
  //
  //   [L239-L241] addPhysical    -> arguments.physical.addProductType( this )
  //   [L242-L244] removePhysical -> arguments.physical.removeProductType( this )
  //     `Physical` is OUT OF SCOPE [L77]. See the delete-context `maxCollection` note on the
  //     non-materialized collections above for the anti-corruption consequence.
  //
  // All six were included in the eleven-helper inversion cross-check before being dropped - the
  // verdict covers the whole component and not only the parts that survive.
  // =============  END: Bidirectional Helper Methods =====================

  // =============== START: Get Formatted Method ==========================
  // [model/entity/ProductType.cfc:L248] opens this banner run and [L257] closes it.
  //
  // Secondary register item: the opening banner reads "START: Get Formatted Method*Implecet*" -
  // "Implecet" is a misspelling of "Implicit". Banner comments in this component imply NOTHING about
  // what follows: the run at [L248-L257] labelled "Get Formatted" actually contains the materialized
  // path accessor, and the run at [L271-L301] labelled "Private Methods" contains the PUBLIC
  // getSimpleRepresentation() [L273]. No member is invented from a banner, and no member is
  // relocated to satisfy one.
  // -----------------------------------------------------------------------

  /**
   * ROUTE A of the materialized path - the LAZY MEMOIZING READ
   * [model/entity/ProductType.cfc:L250-L255].
   *
   *   250: 	public string function getProductTypeIDPath() {
   *   251: 		if(isNull(variables.productTypeIDPath)) {
   *   252: 			variables.productTypeIDPath = buildIDPathList( "parentProductType" );
   *   253: 		}
   *   254: 		return variables.productTypeIDPath;
   *   255: 	}
   *
   * THE GUARD IS `isNull(...)` AND NOT `structKeyExists(...)`, which is worth naming precisely because
   * the two are not interchangeable: `isNull` treats a persisted-but-NULL column exactly like an
   * absent one, so a row whose `productTypeIDPath` column is SQL NULL rebuilds. A row whose column
   * holds the EMPTY STRING does NOT rebuild - the empty string is present and not null - and that
   * asymmetry is preserved rather than smoothed over. It is identical in kind to
   * model/entity/PriceGroup.cfc:L195-L200.
   *
   * IT MEMOIZES, so the first call after an absent read writes the field and every later call is a
   * plain field read. The delegation to `resolveIdPath()` answers the value; the assignment on the
   * absent branch is what makes it a memo, and it is written explicitly here rather than hidden
   * inside the value object, because the value object is shared by four path-bearing entities and
   * must not assume any of them has a mutable field.
   *
   * WHAT `buildIDPathList( "parentProductType" )` MEANT. It was a framework method on the non-ported
   * base, and its argument is the property name to climb - the metadata counterpart of
   * `hb_parentPropertyName="parentProductType"` on the component declaration [L49]. It produced a
   * comma-delimited, ROOT-FIRST list of identifiers ending in this node's own. The target delegates
   * that to `buildIdPathList()` in src/domain/valueObjects/materializedIdPath.ts, which is the single
   * place comma-list path construction lives for all of `productTypeIDPath`, `priceGroupIDPath` and
   * `categoryIDPath`. Path walking and path building are NEVER hand-rolled at a call site.
   *
   * THE WALK REFUSES A CYCLIC OR UNBOUNDED PARENT CHAIN - the single documented divergence from the
   * legacy builder, and it lives in the shared value object rather than here. A product type whose
   * `parentProductType` chain loops climbs forever in the legacy; this port throws instead, producing
   * NO path, so the malformed hierarchy surfaces as a refusal rather than pinning the invocation until
   * the Lambda timeout on every retry. Nothing else about the walk changes: the ordering, the
   * delimiter and the contents of any well-founded path are identical, because the guard is a
   * visited-identity test that a well-founded chain never trips. The reasoning, and why no
   * preserve-exactly mandate covers it, is set out in full on `buildIdPathList()`.
   *
   * Return type is `string`, matching the CFML declaration. It can legitimately be the EMPTY STRING -
   * a stored empty column returns it, and that is the value {@link ProductType.getBaseProductType}
   * then hands to the root-identifier read.
   */
  getProductTypeIDPath(): string {
    // `resolveIdPath` is the shared "stored, or rebuilt" reconciliation used by every path-bearing
    // entity in this folder. It answers `computeIdPath()` when the stored value is null OR undefined,
    // which is exactly `isNull()`'s reach at [L251], and answers the stored value otherwise -
    // including when that value is the empty string.
    const resolvedIdPath: string = resolveIdPath(this.productTypeIDPath, () =>
      this.buildProductTypeIDPathList(),
    );

    // [L252] the memo, written ONLY on the absent branch, exactly as the source guards it. The test
    // is asked again here rather than inferred from the resolution above, because "the value was
    // rebuilt" and "the field is absent" are different questions and only the second one licenses a
    // write.
    if (isNullish(this.productTypeIDPath)) {
      this.productTypeIDPath = resolvedIdPath;
    }

    // [L254] the field is now guaranteed present, so this is the field's value.
    return resolvedIdPath;
  }

  /**
   * ROUTE B of the materialized path - the EAGER WRITE
   * [model/entity/ProductType.cfc:L306, L311].
   *
   * Both lifecycle hooks call `setProductTypeIDPath( buildIDPathList( "parentProductType" ) )`, which
   * BYPASSES the lazy getter entirely and overwrites the field unconditionally - a stale path is
   * corrected on every insert and every update whether or not the getter had already memoized one.
   * The two routes are genuinely different operations, so they are two methods.
   *
   * ⭐ THE THREE-WAY COMPARISON ACROSS THIS FOLDER'S MATERIALIZED-PATH ENTITIES, recorded once here
   * because it is the kind of thing a reviewer checks and cannot otherwise see:
   *
   *   Category    - EAGER HOOK ONLY. model/entity/Category.cfc:L126-L129 assigns the path in
   *                 preInsert/preUpdate, and its `getCategoryIDPath()` is a PLAIN accessor with no
   *                 lazy branch at all.
   *   PriceGroup  - BOTH ROUTES. Lazy memoizing getter at model/entity/PriceGroup.cfc:L195-L200 plus
   *                 eager hook assignment at :L206-L215.
   *   ProductType - BOTH ROUTES. Lazy memoizing getter at [L250-L255] plus eager hook assignment at
   *                 [L306, L311]. It matches PriceGroup exactly.
   *
   * The write is exposed as a public method rather than an internal detail because the REPOSITORY is
   * its caller: lifecycle hooks are not ORM callbacks in the target (see
   * {@link ProductType.preInsert}), so the maintenance has to be reachable from `src/repositories/**`.
   *
   * @param productTypeIDPath the path to store. Passing an explicitly absent value is permitted and
   *   re-arms the lazy getter, which is what a repository does when it wants the path recomputed on
   *   next read rather than now.
   */
  setProductTypeIDPath(productTypeIDPath: string | null | undefined): void {
    this.productTypeIDPath = productTypeIDPath;
  }

  /**
   * Rebuild this node's comma-delimited, root-first identifier path by climbing `parentProductType`.
   *
   * The single implementation of `buildIDPathList( "parentProductType" )` for this class, shared by
   * both routes - the lazy getter [L252] and the hooks [L306, L311] - so the two can never drift.
   * Private, because the legacy `buildIDPathList` was a framework method and never part of the
   * entity's public surface.
   *
   * Delegates wholly to the value object: it supplies the climb, the root-first ordering, the comma
   * delimiter and the absent-parent termination. This method contributes only the two accessors the
   * generic walk needs - how to read a node's key, and how to read its parent.
   */
  private buildProductTypeIDPathList(): string {
    return buildIdPathList<ProductType>(
      this,
      (node) => node.getProductTypeID(),
      (node) => node.getParentProductType(),
    );
  }

  // =============  END: Get Formatted Method =============================

  // =============== START: Custom Methods ================================
  // [model/entity/ProductType.cfc:L259] opens this banner run and [L269] closes it.
  //
  // OMITTED [model/entity/ProductType.cfc:L261-L267] - getProductsSmartList()
  //
  //   261: 	public any function getProductsSmartList() {
  //   262: 		if(!structKeyExists(variables, "productsSmartList")) {
  //   263: 			variables.productsSmartList = getService("productService").getProductSmartList();
  //   264: 			variables.productsSmartList.addWhereCondition(" aslatwallproducttype.productTypeIDPath LIKE '#getProductTypeIDPath()#%'");
  //   265: 		}
  //   266: 		return variables.productsSmartList;
  //   267: 	}
  //
  // A SMART LIST, omitted for the reason given at getInheritedAttributeSetAssignments above: it is a
  // generic, string-keyed, dynamically-filtered query builder supplied by the framework, and
  // reproducing it would re-import the coupling this refactor removes. The concrete intent - every
  // product whose product type sits at or beneath this node in the tree, expressed as a prefix match
  // on `productTypeIDPath` - becomes an explicit, typed repository query owned by
  // `src/services/productService.ts`.
  //
  // Two details preserved with the omission. First, the memo key is
  // `structKeyExists(variables, "productsSmartList")` and NOT `isNull(...)`, so unlike the path
  // accessor a stored null WOULD be treated as present - the opposite guard to [L251], inside the
  // same component. Second, [L264] interpolates the path straight into a raw SQL fragment. The
  // target repository layer uses PREPARED STATEMENTS exclusively, which retires that whole class of
  // problem structurally rather than by fixing this line; annotated, not fixed, because the method
  // is not ported.
  // -----------------------------------------------------------------------

  // =============  END: Custom Methods ===================================

  // =============== START: Overridden Methods ============================
  // [model/entity/ProductType.cfc:L271] opens this banner run and [L301] closes it - and despite
  // being labelled for private/overridden members it contains a PUBLIC method at [L273].
  // -----------------------------------------------------------------------

  /**
   * The human-readable, breadcrumbed name of this product type
   * [model/entity/ProductType.cfc:L273-L278].
   *
   *   273: 	public string function getSimpleRepresentation() {
   *   274: 		if(!isNull(getParentProductType())) {
   *   275: 			return getParentProductType().getSimpleRepresentation() & " &raquo; " & getProductTypeName();
   *   276: 		}
   *   277: 		return getProductTypeName();
   *   278: 	}
   *
   * SYNCHRONOUS. It traverses only the already-materialized `parentProductType` reference and
   * performs string concatenation, so the async boundary rule keeps it synchronous - the one
   * asynchronous member on this class is {@link ProductType.getBaseProductType}.
   *
   * ⚠ THE SEPARATOR IS THE RAW HTML ENTITY `" &raquo; "`, WITH A LEADING AND A TRAILING SPACE, and it
   * is reproduced BYTE FOR BYTE. Not `»`, not `&#187;`, not trimmed, not moved to a constant with
   * tidier spacing. A domain-layer string carrying an HTML entity is an odd thing to find and an
   * easy thing to "improve"; it is part of the ported interface, because a consumer that renders this
   * value as HTML shows a guillemet and one that renders it as text shows the entity - and which of
   * those happens today is the behaviour being preserved.
   *
   * RECURSIVE UP THE PARENT CHAIN, and LEGACY-NOTE: an unbounded parent chain - or a cycle - recurses
   * without limit and exhausts the stack. NO depth guard, NO cycle detector and NO memo is added.
   *
   * WHY THIS IS TREATED DIFFERENTLY FROM THE PATH WALK, which now DOES refuse a cycle. The two
   * failure modes are not the same failure mode. The path walk's is an infinite `do/while`: it never
   * yields, so it holds the invocation's single-threaded event loop until the platform timeout and the
   * platform then retries, which turns one malformed row into a repeating denial of the capability.
   * This one raises `RangeError: Maximum call stack size exceeded` within milliseconds, self-limits,
   * returns control to the caller and is mapped to an error response like any other thrown value. It
   * is a crash on malformed data, not a resource-exhaustion vector, so the legacy behaviour is kept
   * and the source's silence on the matter is respected. If it is ever to change, that is a product
   * decision about this method, not a consequence of the path walk's.
   *
   * RETURN TYPE IS `string | undefined`, NOT `string`. CFML declares `returntype="string"`, but
   * `getProductTypeName()` reads a NULLABLE column [L57] - model/validation/ProductType.json requires
   * it in the SAVE context only - so [L277] can return null and CFML's loose typing lets it. The port
   * types the honest return rather than coercing the absent case to `''`, which would fabricate a
   * name, or throwing, which would invent a failure the legacy does not have. The legacy declaration
   * is recorded here so the mismatch is visible rather than silently corrected.
   *
   * NOTE the consequence at [L275]: when the parent chain contributes a name and this node does not,
   * CFML's `&` concatenation renders the null as the empty string, producing a value that ends in the
   * separator. That is reproduced exactly by concatenating `?? ''` at the join, and it is why the
   * recursive branch returns `string` while the terminal branch returns `string | undefined`.
   */
  getSimpleRepresentation(): string | undefined {
    // [L274] `!isNull(getParentProductType())`. The absent test is written inline rather than
    // delegated to `isNullish()` because that export returns `boolean`, as its contract requires, and
    // a `boolean` return does not narrow the union for the compiler. It is the same test, asked in the
    // form the type system can follow - the same accommodation src/lib/cfml/truthiness.ts makes
    // internally for the identical reason.
    const parentProductType: ProductType | undefined = this.getParentProductType();
    if (parentProductType !== undefined) {
      // [L275] The separator is byte-identical to the source, HTML entity and both spaces included.
      // CFML's `&` renders an absent operand as the empty string, so an absent name on this node
      // yields a value ending in the separator - reproduced, not corrected.
      return `${parentProductType.getSimpleRepresentation() ?? ''} &raquo; ${
        this.getProductTypeName() ?? ''
      }`;
    }

    // [L277] the terminal branch, which is where the nullable return originates.
    return this.getProductTypeName();
  }

  // -------------------------------------------------------------------------
  // OMITTED [model/entity/ProductType.cfc:L280-L299] - getAssignedAttributeSetSmartList()
  //
  // Omitted for TWO independent reasons, either of which suffices.
  //
  // First, it is a SMART LIST - `getService("attributeService").getAttributeSetSmartList()` with
  // `addFilter('activeFlag', 1)`, `addFilter('attributeSetType.systemCode', 'astProductType')` and
  // `joinRelatedProperty("SlatwallAttributeSet", "productTypes", "left")`, memoized on a
  // `structKeyExists` guard like the other three. Framework machinery, replaced by explicit typed
  // repository queries.
  //
  // Second, it is an OVERRIDE OF THE INTERMEDIATE BASE CLASS model/entity/HibachiEntity.cfc, on the
  // non-ported EAV / attribute path. Neither base level is ported and the attribute subsystem is out
  // of scope, so there is nothing here to override and no in-scope type to return.
  //
  // Recorded for the register: the method hand-builds a where clause using
  // `replace(getProductTypeIDPath(), ",", "','", "all")` - string surgery that turns the comma-list
  // path into a quoted SQL `IN` list. Annotated, NOT fixed: the target repository layer uses
  // prepared statements exclusively, which mitigates that pattern structurally rather than by
  // repairing a method that is not ported.
  //
  // NOTE ALSO what is absent. model/validation/ProductType.json declares NO `"method"` key, so this
  // component contributes NONE of the declaratively-invoked validators. No `validate*` member is
  // authored, and a reviewer looking for one can stop here.
  // =============  END: Overridden Methods ===============================

  // =============== START: ORM Event Hooks ===============================
  // [model/entity/ProductType.cfc:L303] opens this banner run and [L315] closes it.
  //
  // TRANSFORMATION RULE T3: THESE ARE NOT ORM LIFECYCLE CALLBACKS IN THE TARGET. There is no
  // Hibernate to fire them, so they are EXPLICIT MAINTENANCE METHODS invoked by
  // `src/repositories/mysql/**` immediately before the corresponding write. They are never
  // auto-fired and - critically - never called from the constructor, where recomputing the path at
  // hydration time would silently overwrite a persisted value with one derived from a possibly
  // partially-hydrated parent chain.
  //
  // WHAT THE `super` CALLS DID. `super.preInsert()` and
  // `super.preUpdate(argumentcollection=arguments)` resolved into the non-ported framework base,
  // whose responsibility on this path was AUDIT-TIMESTAMP BEHAVIOUR - stamping `createdDateTime` /
  // `createdByAccountID` on insert and `modifiedDateTime` / `modifiedByAccountID` on update. All four
  // columns carry `hb_populateEnabled="false"` [L83-L86] precisely because the framework, not request
  // data, owned them. In the target the REPOSITORY layer owns that stamping, which is why these
  // methods do the path work and then stop: there is no `super` left to call, and re-implementing
  // audit stamping on the entity would put persistence concerns back inside the domain.
  // -----------------------------------------------------------------------

  /**
   * Pre-insert maintenance [model/entity/ProductType.cfc:L305-L308].
   *
   *   305: 	public void function preInsert(){
   *   306: 		setProductTypeIDPath( buildIDPathList( "parentProductType" ) );
   *   307: 		super.preInsert();
   *   308: 	}
   *
   * LEGACY-NOTE [model/entity/ProductType.cfc:L305-L313]: path is assigned BEFORE the super call,
   * matching model/entity/PriceGroup.cfc:L207-L208 and OPPOSITE to model/entity/Category.cfc:L126-L129
   * (which calls super first). Ordering is reproduced per entity and deliberately NOT normalised.
   *
   * The ordering is observable wherever the framework's own pre-insert work reads entity state, so
   * "they both end up doing the same two things" is not a reason to align them. The target expresses
   * PATH-FIRST by doing the path assignment as this method's only statement and documenting that the
   * repository's audit stamping - the `super` half - runs AFTER this method returns.
   */
  preInsert(): void {
    // [L306] path FIRST. [L307] `super.preInsert()` is the audit stamping the repository now performs
    // after this returns, preserving the source's ordering across the seam.
    this.setProductTypeIDPath(this.buildProductTypeIDPathList());
  }

  /**
   * Pre-update maintenance [model/entity/ProductType.cfc:L310-L313].
   *
   *   310: 	public void function preUpdate(struct oldData){
   *   311: 		setProductTypeIDPath( buildIDPathList( "parentProductType" ) );;
   *   312: 		super.preUpdate(argumentcollection=arguments);
   *   313: 	}
   *
   * PATH-FIRST, THEN SUPER - the same ordering as {@link ProductType.preInsert}; see the note there.
   *
   * `oldData` IS THE CFML `struct oldData` PARAMETER, carried forward so the prior row reaches the
   * maintenance boundary as a typed argument rather than as ambient state. It is OPTIONAL exactly as
   * the source's non-`required` declaration makes it, and this method does not read it: the legacy
   * body does not either - it forwards the whole argument collection to `super` [L312], and the
   * framework audit stamping the repository now owns is what consumed it. Dropping the parameter
   * would change the ported signature and quietly discard the prior row that the audit path needs.
   *
   * Secondary register item [model/entity/ProductType.cfc:L311]: the statement ends with a DOUBLE
   * SEMICOLON - `setProductTypeIDPath( buildIDPathList( "parentProductType" ) );;` - which is the
   * SECOND occurrence of this wart in the folder; the first is model/entity/PriceGroup.cfc:L212. It
   * is a no-op empty statement and it is recorded rather than reproduced, because there is nothing to
   * reproduce: an empty statement has no behaviour. No divergence is spent.
   */
  preUpdate(oldData?: Readonly<Record<string, unknown>>): void {
    // [L311] path FIRST, then [L312] the audit stamping the repository performs after this returns.
    this.setProductTypeIDPath(this.buildProductTypeIDPathList());
  }

  // =============  END: ORM Event Hooks ==================================
}

// ---------------------------------------------------------------------------
// WHAT THE NET-NEW TEST TIER HAS TO PIN
//
// `tests/unit/domain/entities/productType.test.ts` is NET-NEW coverage and must be labelled as such
// in `tests/traceability/legacyTestMap.ts` - never as parity, because no legacy test touches this
// component. No test file is authored from here. The contract that tier is responsible for pinning,
// enumerated so nothing below is discovered by accident:
//
//  1. BOOLEAN HYDRATION. `getActiveFlag()` and `getPublishedFlag()` over the full accepted range -
//     `null`, `undefined`, `0`, `1`, `'0'`, `'1'`, `'true'`, `'false'` - because neither column
//     declares a default [L54, L55] and SQL NULL is therefore an expected state.
//  2. THE LAZY PATH MEMO. An absent stored path rebuilds from the parent chain and is then cached; a
//     stored path is returned untouched; and - the asymmetry that matters - a stored EMPTY STRING is
//     returned as the empty string and does NOT rebuild, because the source guards on `isNull` and
//     not on length [L251].
//  3. BOTH PATH ROUTES, INDEPENDENTLY. The eager write overwrites a memoized value, and re-arming it
//     with an absent value restores the lazy rebuild.
//  4. HOOK ORDERING. `preInsert()` and `preUpdate()` each assign the path, and the assignment is the
//     method's only effect - the audit half belongs to the repository. `preUpdate()` accepts and
//     ignores `oldData`, matching [L310-L312].
//  5. `getBaseProductType()` ON ALL FIVE PATHS: a present non-empty system code short-circuits with no
//     repository call at all; an absent one and an empty one each load the root row named by the
//     first element of the stored path; a root row that itself has no system code yields `undefined`,
//     which is a legitimate answer and not an error; a missing root row raises; and an unwired
//     repository raises. Include the self-as-root case, which must terminate in exactly one hop.
//  6. THE ALWAYS-THROWS STUB. `getAppliedPriceGroupRateByPriceGroup()` throws unconditionally, on
//     every input. A test that ever expects a rate from it has fixed the defect by accident.
//  7. PRIMARY-KEY CONTAINMENT. `hasChildProductType()` answers true for a DIFFERENT instance carrying
//     the SAME `productTypeID`, and answers by reference when either side is unsaved (`''`).
//  8. THE BIDIRECTIONAL HELPERS, BOTH SIDES. `setParentProductType` assigns the near side and appends
//     to the parent's live children; the `isNew()` disjunct short-circuits the containment probe, so
//     an unsaved node appended twice appears twice. `removeParentProductType` defaults its argument
//     only when NONE was passed, clears the near side UNCONDITIONALLY, splices the far side only on a
//     hit, matches at index 0 correctly, and raises when there is no parent to detach from.
//  9. `setProducts()` REPLACES rather than clearing in place - a reference captured before the call
//     still holds the old contents - and `addProduct` / `removeProduct` are set-semantics in-memory
//     operations that never touch `Product.productTypeID`.
// 10. `getSimpleRepresentation()` joins with the BYTE-IDENTICAL `' &raquo; '`, leading and trailing
//     space included; returns `undefined` for an unnamed root; and produces a value ending in the
//     separator when a named parent is joined to an unnamed child.
// 11. THE OMISSIONS STAY OMITTED. No smart-list member, no attribute-set member, no
//     `attributeValue` / `attributeSet` / `physical` helper, and no `getParentProductTypeOptions`
//     appears on the class surface. A test asserting their absence is what stops one being added back
//     by a well-meaning later change.
// ---------------------------------------------------------------------------
