// ---------------------------------------------------------------------------
// slatwall-ts - ProductType entity
//
// PORT OF model/entity/ProductType.cfc (318 lines, confirmed by `wc -l`).
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/ProductType.cfc:L49]
//
//   component displayname="Product Type" entityname="SlatwallProductType"
//   table="SwProductType" persistent="true" extends="HibachiEntity"
//   cacheuse="transactional" hb_serviceName="productService" hb_permission="this"
//   hb_parentPropertyName="parentProductType" {
//
// Schema continuity is a binding constraint: entity property metadata IS the
// contract. Table `SwProductType`, entity name `SlatwallProductType`. No
// migration, no rename, no new table, no column change. Every `hb_*` attribute
// value is carried forward verbatim so the legacy admin can still resolve it -
// including `hb_parentPropertyName="parentProductType"`, which is the attribute
// that tells the framework this entity is a self-referential tree and drives the
// admin's hierarchy rendering.
//
// ★ WHY THIS ENTITY MATTERS OUT OF PROPORTION TO ITS SIZE: it owns
// `productTypeIDPath`, the 4000-character materialized path
// [model/entity/ProductType.cfc:L53] that the PROMOTION ENGINE walks. Both
// qualifier membership [model/service/PromotionService.cfc:L858-L870] and reward
// membership [model/service/PromotionService.cfc:L921-L985] test a product type's
// path with a comma-list containment check, and
// model/dao/PromotionDAO.cfc:L482-L488 concatenates it in dialect-specific SQL. A
// truncated or mis-ordered path silently changes which promotions apply, i.e. it
// changes money. That is why the path walk here delegates to
// `src/domain/valueObjects/materializedIdPath.ts` rather than being re-derived,
// and why it carries NO cycle guard and NO depth limit - see
// `buildProductTypeIDPathList()`.
//
// THE ASSOCIATION CENSUS, receiver-qualified against every
// `arrayAppend`/`arrayDeleteAt` site in model/entity/*.cfc. This is the project's
// ONE association-ownership rule and it is mechanical, not a judgment call: an
// accessor returns the LIVE mutable array iff some entity mutates it IN PLACE
// THROUGH that accessor with the receiver resolving to a product type.
//
//   | locator | property                        | fieldtype    | inverse | accessor | mutated at |
//   |---------|---------------------------------|--------------|---------|----------|------------|
//   | L65     | childProductTypes               | one-to-many  | true    | LIVE     | ProductType.cfc:L152, L161 |
//   | L66     | products                        | one-to-many  | true    | readonly | (no site)  |
//   | L67     | attributeValues                 | one-to-many  | true    | LIVE     | AttributeValue.cfc:L260, L269 |
//   | L70     | promotionRewards                | many-to-many | true    | LIVE     | PromotionReward.cfc:L283, L293 |
//   | L71     | promotionRewardExclusions       | many-to-many | true    | LIVE     | PromotionReward.cfc:L383, L393 |
//   | L72     | promotionQualifiers             | many-to-many | true    | LIVE     | PromotionQualifier.cfc:L225, L235 |
//   | L73     | promotionQualifierExclusions    | many-to-many | true    | LIVE     | PromotionQualifier.cfc:L325, L335 |
//   | L74     | priceGroupRates                 | many-to-many | true    | LIVE     | PriceGroupRate.cfc:L204, L214 |
//   | L75     | priceGroupRateExclusions        | many-to-many | true    | readonly | (no site)  |
//   | L76     | attributeSets                   | many-to-many | true    | LIVE     | AttributeSet.cfc:L115, L125 |
//   | L77     | physicals                       | many-to-many | true    | LIVE     | Physical.cfc:L144, L154 |
//
// TWO ROWS IN THAT TABLE DESERVE COMMENT, BECAUSE THEY LOOK WRONG AND ARE NOT.
//
//   * `products` is `readonly` even though it is a real, heavily-used association.
//     model/entity/Product.cfc declares `productType` many-to-one at its L69 but
//     hand-writes NO `setProductType`/`removeProductType` pair - re-verified by
//     grep - so the far side never reaches into this array. It is an
//     ORM-generated one-sided association on both halves. `lazy="extra"` on L66
//     is preserved as metadata only; the port materializes at the repository
//     boundary and has no lazy tier to configure.
//   * `priceGroupRateExclusions` is `readonly` while its sibling `priceGroupRates`
//     is LIVE. The asymmetry is real: model/entity/PriceGroupRate.cfc declares
//     `addProductType`/`removeProductType` at L151/L159 (which mutate
//     `productType.getPriceGroupRates()`), but declares NO
//     `addExcludedProductType`/`removeExcludedProductType` at all. That absence is
//     itself a defect on THIS class - see the LEGACY-DEFECT marker on
//     `addPriceGroupRateExclusion()` below.
//
// FOUR DISTINCT DEFECTS LIVE IN THIS COMPONENT, all reproduced, all marked:
//   1. `setProducts()` calls a method that does not exist [L105].
//   2. `getAppliedPriceGroupRateByPriceGroup()` passes the wrong argument name [L118].
//   3. `getParentProductTypeOptions()` excludes the self-record BY NAME, not by key [L136].
//   4. `addPriceGroupRateExclusion()`/`removePriceGroupRateExclusion()` call
//      methods `PriceGroupRate` does not declare [L216, L219].
// Plus a fifth, cosmetic: the `;;` double semicolon at L311.
//
// THE `extends` CHAIN IS THREE LEVELS DEEP, NOT TWO. `extends="HibachiEntity"` on
// L49 is UNQUALIFIED, so it resolves to the local model/entity/HibachiEntity.cfc
// (274 lines), whose own L49 reads `component output="false" accessors="true"
// persistent="false" extends="Slatwall.org.Hibachi.HibachiEntity"`. Neither level
// is ported: an entity reaching outward through a service locator is exactly the
// pattern the ESLint `no-restricted-imports` layer boundary exists to make
// impossible. This component has FIVE `getService(` sites of its own - L94, L112,
// L118, L129 and L263 - and every one becomes either an injected narrow port or a
// documented non-port, never a direct import. That is transformation rule T2.
//
// SMART LISTS ARE NOT PORTED, BY EXPLICIT PLAN DECISION. `getProductsSmartList()`
// [L261-L267] and `getAssignedAttributeSetSmartList()` [L280-L299] build a
// `HibachiSmartList` - a generic, string-keyed, dynamically-filtered query builder
// supplied by the framework. Reproducing it faithfully would mean reimplementing a
// small ORM query language, importing exactly the framework coupling this refactor
// exists to remove, and it would be untypeable under the strict profile. The plan
// records the decision explicitly and replaces smart lists with typed repository
// query methods. Both are recorded at their locators below rather than silently
// dropped.
//
// VALIDATION: model/validation/ProductType.json EXISTS and is one of the twelve
// in-scope schemas. It is ported as a typed zod schema by the owner of the
// validation tier; this class carries no validator method, exactly as the source
// carries none.
//
// TEST COVERAGE FOR THIS MODULE IS NET-NEW. `ProductType` has no legacy test. Only
// brand.ts and product.ts have legacy antecedents. The contract the test tier has
// to pin is enumerated at the foot of this file.
//
// NO USER RULES WERE PROVIDED. The enterprise substitute standard applies at full
// strength - maximal strictness, no `any` and no suppression comment, one exported
// unit per file, no barrel, and every judgment call annotated where it was made.
// ---------------------------------------------------------------------------

import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import { cfBoolean, cfLen } from '../../lib/cfml/truthiness.js';
import {
  buildIdPathList,
  getRootIdFromIdPath,
  resolveIdPath,
} from '../valueObjects/materializedIdPath.js';
import type { PriceGroupRate } from './priceGroupRate.js';
import type { Product } from './product.js';
import type { PromotionQualifier } from './promotionQualifier.js';
import type { PromotionReward } from './promotionReward.js';

// LEGACY-NOTE THE FOUR OUT-OF-SCOPE FAR SIDES, MATERIALIZED THROUGH NARROW STRUCTURAL PROJECTIONS
// RATHER THAN DROPPED. `AttributeValue` [L67], `AttributeSet` [L76] and `Physical` [L77] are all
// out of scope, and so is the `AttributeSetAssignment` that L94 fetches. The out-of-scope entity is
// the FAR SIDE; the ASSOCIATION is part of `SwProductType`'s persisted contract, and suppressing it
// would make this class assert something false about the schema. The approved mechanism - a
// module-local, un-exported structural interface naming only the members anything in scope can
// actually reach - is used for each, following the `*Link` precedent established by
// src/domain/entities/brand.ts.
//
// Each projection carries the join key its own declaration names, plus the far-side helper the
// legacy bidirectional pair genuinely calls, and NOTHING ELSE. Speculating additional members would
// be inventing a contract; each one below is derivable from a verbatim locator.

/** [model/entity/ProductType.cfc:L67] `fkcolumn="productTypeID"`, and AttributeValue.cfc:L259/L268. */
interface ProductTypeAttributeValueLink {
  getAttributeValueID(): string;
  setProductType(productType: ProductType): void;
  removeProductType(productType: ProductType): void;
}

/** [model/entity/ProductType.cfc:L76] `inversejoincolumn="attributeSetID"`, and AttributeSet.cfc:L114/L124. */
interface ProductTypeAttributeSetLink {
  getAttributeSetID(): string;
  addProductType(productType: ProductType): void;
  removeProductType(productType: ProductType): void;
}

/** [model/entity/ProductType.cfc:L77] `inversejoincolumn="physicalID"`, and Physical.cfc:L143/L153. */
interface ProductTypePhysicalLink {
  getPhysicalID(): string;
  addProductType(productType: ProductType): void;
  removeProductType(productType: ProductType): void;
}

/**
 * The `SwAttributeSetAssignment` rows `getInheritedAttributeSetAssignments()` returns.
 * [model/entity/ProductType.cfc:L94]
 *
 * ONE MEMBER ONLY, and deliberately so: the legacy body returns the smart-list records UNTOUCHED
 * and reads nothing off them, so no member beyond the primary key is derivable from the source.
 */
interface AttributeSetAssignmentLink {
  getAttributeSetAssignmentID(): string;
}

/**
 * The narrow port standing for `getService("AttributeService").getAttributeSetAssignmentSmartList()`
 * [model/entity/ProductType.cfc:L94] and for `getService("ProductService").getProductType(...)`
 * [model/entity/ProductType.cfc:L112].
 *
 * Two unrelated reach-outs share one port because both are single-value lookups the repository can
 * satisfy during hydration, and because a second module-local interface would add a name without
 * adding a distinction. Declared module-local and UN-EXPORTED: the AAP locks the port inventory at
 * THIRTEEN exported contracts under `src/domain/ports/`, and the inventory counts EXPORTED
 * CONTRACTS rather than files, so a fourteenth exported collaborator interface is a budget violation
 * wherever it sits. This follows `RoundingRuleValueRounder` in src/domain/entities/roundingRule.ts
 * and `PromotionCodeDeletableEvaluator` in src/domain/entities/promotion.ts.
 */
interface ProductTypeHydrationSupport {
  /**
   * [model/entity/ProductType.cfc:L94] the UNFILTERED assignment list. See the TODO carried forward
   * on `getInheritedAttributeSetAssignments()`: the legacy smart list has no filter at all, which
   * is exactly what its own TODO admits.
   */
  getAllAttributeSetAssignments(): AttributeSetAssignmentLink[];

  /**
   * [model/entity/ProductType.cfc:L112] `getService("ProductService").getProductType( <rootID> )`,
   * where `<rootID>` is `listFirst(getProductTypeIDPath())`.
   */
  getProductTypeByProductTypeID(productTypeID: string): ProductType | undefined;
}

/**
 * A single option row from `getParentProductTypeOptions()`.
 * [model/entity/ProductType.cfc:L137]
 *
 * A `type` alias rather than an `interface`, and that is load-bearing rather than stylistic: an
 * `interface` is NOT assignable to `Readonly<Record<string, unknown>>` (TS2322) because it has no
 * implicit index signature, whereas a type alias IS. The same decision is recorded on
 * `ParentPriceGroupOption` in src/domain/entities/priceGroup.ts. The two keys are the framework's
 * own [org/Hibachi/HibachiEntity.cfc:L375-L417] `alias="name"` / `alias="value"` pair, reproduced
 * verbatim rather than renamed.
 */
type ParentProductTypeOption = {
  readonly name: string;
  readonly value: string;
};

/**
 * The `SwProductType` node - a self-referential tree carrying a materialized ID path.
 *
 * A class rather than an interface, because the legacy entity carries behaviour and not merely
 * data: it owns a lazily-built path accessor [L250-L255], two lifecycle hooks [L305-L313], a
 * recursive human-readable representation [L273-L278], and eleven bidirectional helper pairs.
 *
 * ASSOCIATIONS ARE MATERIALIZED AT THE REPOSITORY BOUNDARY. Hibernate lazy collections have no
 * equivalent in a driver-only stack, so each collection arrives already populated and the fetch
 * shape is an explicit, documented decision at the repository method that produced it.
 *
 * EVERY MEMBER IS SYNCHRONOUS. The async boundary rule is that a method becomes `async` if and
 * only if its legacy body reaches the DAO or ORM. The two members whose legacy bodies DO reach a
 * service - `getBaseProductType()` and `getParentProductTypeOptions()` - take their collaborator as
 * an injected port materialized during hydration, so neither becomes a promise. That keeps the
 * accessor shape identical to the legacy contract, which is the same reasoning applied to
 * `Sku.getPriceByCurrencyCode()`.
 *
 * FIVE MEMBERS OF THIS CLASS CAN THROW, and each says so on itself:
 * `setProducts()` (a preserved defect), `getBaseProductType()` (unmaterialized port),
 * `getAppliedPriceGroupRateByPriceGroup()` (a preserved defect),
 * `getInheritedAttributeSetAssignments()` (unmaterialized port),
 * `removeParentProductType()` (the framework-wide unguarded-null idiom), plus the two
 * `PriceGroupRateExclusion` helpers (preserved defects). Every other member is total.
 */
export class ProductType {
  /**
   * [model/entity/ProductType.cfc:L52]
   * `ormtype="string" length="32" fieldtype="id" generator="uuid" unsavedvalue="" default=""`
   *
   * `unsavedvalue=""` with `default=""` is what makes an unsaved row's key the empty string, which
   * is in turn what makes `isNew()` a simple emptiness test.
   */
  private readonly productTypeID: string;

  /**
   * [model/entity/ProductType.cfc:L53] `ormtype="string" length="4000"`.
   *
   * MUTABLE, and deliberately so: `getProductTypeIDPath()` memoizes into it on the absent branch
   * [L251-L253] and both lifecycle hooks overwrite it [L306, L311].
   */
  private productTypeIDPath: string | null | undefined;

  /**
   * [model/entity/ProductType.cfc:L54] `ormtype="boolean"` with NO `default`, plus the source's own
   * `hint="As A ProductType Get Old, They would be marked as Not Active"` - reproduced verbatim,
   * grammar and all, because hint text is part of the metadata contract the admin renders.
   *
   * One of the nine undefaulted `ormtype="boolean"` columns across the in-scope entities that make
   * SQL NULL an expected column state, which is precisely the boundary `cfBoolean()` documents.
   */
  private readonly activeFlag: CfBooleanInput;

  /** [model/entity/ProductType.cfc:L55] `ormtype="boolean"`, also undefaulted. */
  private readonly publishedFlag: CfBooleanInput;

  /**
   * [model/entity/ProductType.cfc:L56] `ormtype="string" unique="true"` with
   * `hint="This is the name that is used in the URL string"`. The uniqueness constraint is a
   * database-level guarantee and is not re-implemented here.
   */
  private readonly urlTitle: string | undefined;

  /** [model/entity/ProductType.cfc:L57] `ormtype="string"`, nullable - no `notNull="true"`. */
  private readonly productTypeName: string | undefined;

  /** [model/entity/ProductType.cfc:L58] `ormtype="string" length="4000"`. */
  private readonly productTypeDescription: string | undefined;

  /**
   * [model/entity/ProductType.cfc:L59] `ormtype="string"`.
   *
   * The discriminator the whole catalog branches on - `merchandise`, `subscription`,
   * `contentAccess`, `fulfillment`, `order` are the five values enumerated in the header comment of
   * model/entity/PromotionReward.cfc:L49-L55. It is NOT typed as a union here, because the column
   * carries no check constraint and no validation rule restricts it: narrowing it would reject data
   * the legacy schema accepts.
   */
  private readonly systemCode: string | undefined;

  /**
   * [model/entity/ProductType.cfc:L62] many-to-one onto itself, `fkcolumn="parentProductTypeID"`.
   *
   * MUTABLE: `setParentProductType` assigns it [L150] and `removeParentProductType` clears it
   * [L163]. `undefined` for a root product type, and also for one the repository hydrated without
   * its parent - two states the port cannot distinguish, exactly as CFML cannot.
   */
  private parentProductType: ProductType | undefined;

  /**
   * [model/entity/ProductType.cfc:L65] `one-to-many` onto itself, `inverse="true"`,
   * `fkcolumn="parentProductTypeID"`, `cascade="all"`.
   *
   * LIVE per ProductType.cfc:L152 (`arrayAppend`) and L161 (`arrayDeleteAt`). The field is
   * `readonly` so the binding can never be replaced while the array's CONTENTS stay mutable - two
   * different guarantees, both wanted.
   */
  private readonly childProductTypes: ProductType[];

  /**
   * [model/entity/ProductType.cfc:L66] `one-to-many` onto `Product`, `inverse="true"`,
   * `fkcolumn="productTypeID"`, `lazy="extra"`, `cascade="all"`.
   *
   * READONLY - zero census sites. See the header table: `Product` hand-writes no
   * `setProductType`/`removeProductType`, so nothing reaches into this array from outside.
   *
   * MUTABLE FIELD nonetheless, because `setProducts()` [L101-L107] replaces the collection wholesale
   * with `variables.Products = []`. The accessor still hands out a `readonly` view; the two facts
   * are compatible and both are faithful.
   */
  private products: readonly Product[];

  /** [model/entity/ProductType.cfc:L67] `one-to-many`, `cascade="all-delete-orphan"`, `inverse="true"`. LIVE. */
  private readonly attributeValues: ProductTypeAttributeValueLink[];

  /** [model/entity/ProductType.cfc:L70] `many-to-many` via `SwPromoRewardProductType`, `inverse="true"`. LIVE. */
  private readonly promotionRewards: PromotionReward[];

  /** [model/entity/ProductType.cfc:L71] `many-to-many` via `SwPromoRewardExclProductType`, `inverse="true"`. LIVE. */
  private readonly promotionRewardExclusions: PromotionReward[];

  /** [model/entity/ProductType.cfc:L72] `many-to-many` via `SwPromoQualProductType`, `inverse="true"`. LIVE. */
  private readonly promotionQualifiers: PromotionQualifier[];

  /** [model/entity/ProductType.cfc:L73] `many-to-many` via `SwPromoQualExclProductType`, `inverse="true"`. LIVE. */
  private readonly promotionQualifierExclusions: PromotionQualifier[];

  /** [model/entity/ProductType.cfc:L74] `many-to-many` via `SwPriceGroupRateProductType`, `inverse="true"`. LIVE. */
  private readonly priceGroupRates: PriceGroupRate[];

  /**
   * [model/entity/ProductType.cfc:L75] `many-to-many` via `SwPriceGrpRateExclProductType`,
   * `inverse="true"`.
   *
   * READONLY, and the asymmetry against its LIVE sibling `priceGroupRates` is real rather than an
   * oversight: `PriceGroupRate` declares `addProductType` but no `addExcludedProductType`. See the
   * defect marker on `addPriceGroupRateExclusion()`.
   */
  private readonly priceGroupRateExclusions: readonly PriceGroupRate[];

  /** [model/entity/ProductType.cfc:L76] `many-to-many` via `SwAttributeSetProductType`, `inverse="true"`. LIVE. */
  private readonly attributeSets: ProductTypeAttributeSetLink[];

  /** [model/entity/ProductType.cfc:L77] `many-to-many` via `SwPhysicalProductType`, `inverse="true"`. LIVE. */
  private readonly physicals: ProductTypePhysicalLink[];

  /** [model/entity/ProductType.cfc:L80] the integration correlation column. */
  private readonly remoteID: string | undefined;

  /** [model/entity/ProductType.cfc:L83] `hb_populateEnabled="false" ormtype="timestamp"`. */
  private readonly createdDateTime: Date | undefined;

  /**
   * [model/entity/ProductType.cfc:L84] many-to-one onto the out-of-scope `Account`,
   * `fkcolumn="createdByAccountID"`. Reduced to the opaque identifier, as every in-scope entity does.
   */
  private readonly createdByAccountID: string | undefined;

  /** [model/entity/ProductType.cfc:L85] `hb_populateEnabled="false" ormtype="timestamp"`. */
  private readonly modifiedDateTime: Date | undefined;

  /** [model/entity/ProductType.cfc:L86] many-to-one onto `Account`, `fkcolumn="modifiedByAccountID"`. */
  private readonly modifiedByAccountID: string | undefined;

  /**
   * The candidate rows `getParentProductTypeOptions()` filters, standing for the smart-list records
   * at [model/entity/ProductType.cfc:L128-L131].
   *
   * MATERIALIZED AT THE REPOSITORY BOUNDARY, already projected to `{name, value}`. The legacy builds
   * each row from `records[i].getSimpleRepresentation()` and `records[i].getProductTypeID()` [L137],
   * both of which the repository can compute; the FILTERING is the behaviour and stays here.
   */
  private readonly parentProductTypeOptionCandidates: readonly ParentProductTypeOption[];

  /**
   * The narrow hydration-support port. `undefined` on every read path that does not ask for a base
   * product type or a parent-option list, which is the overwhelming majority of them.
   */
  private readonly hydrationSupport: ProductTypeHydrationSupport | undefined;

  /**
   * [model/entity/ProductType.cfc:L89] `property name="parentProductTypeOptions" type="array"
   * persistent="false";` - the memo behind `getParentProductTypeOptions()`.
   *
   * REQUEST-SCOPED, NOT MODULE-SCOPED. The legacy memo lives in the component's `variables` scope,
   * which on a warm Lambda container would persist between unrelated invocations. Entity instances
   * here are created per request by the repository, so the hazard does not arise.
   *
   * ★ UNLIKE `PriceGroup`, THIS ENTITY'S MEMO GUARD IS IN ITS OWN BODY. L123 tests
   * `!structKeyExists(variables, "parentProductTypeOptions")` explicitly, where
   * model/entity/PriceGroup.cfc:L94-L103 has no guard of its own and is memoized only incidentally,
   * by the framework's `getPropertyOptions` cache at org/Hibachi/HibachiEntity.cfc:L375-L417. Both
   * end up memoized; only one says so.
   */
  private parentProductTypeOptions: readonly ParentProductTypeOption[] | undefined;

  /**
   * Constructed from a repository row plus its materialized associations. Never constructed from a
   * sibling entity module: row-to-entity hydration belongs entirely to `src/repositories/mysql/**`.
   *
   * Every collection parameter is OPTIONAL and defaults to `[]`, because a Hibernate-managed
   * collection never handed back null - an entity hydrated without a join must present an empty
   * array rather than `undefined`. meta/tests/unit/entity/BrandTest.cfc asserts exactly that
   * convention for `Brand.getProducts()` and it is applied uniformly across the folder.
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
    readonly products?: readonly Product[] | undefined;
    readonly attributeValues?: ProductTypeAttributeValueLink[] | undefined;
    readonly promotionRewards?: PromotionReward[] | undefined;
    readonly promotionRewardExclusions?: PromotionReward[] | undefined;
    readonly promotionQualifiers?: PromotionQualifier[] | undefined;
    readonly promotionQualifierExclusions?: PromotionQualifier[] | undefined;
    readonly priceGroupRates?: PriceGroupRate[] | undefined;
    readonly priceGroupRateExclusions?: readonly PriceGroupRate[] | undefined;
    readonly attributeSets?: ProductTypeAttributeSetLink[] | undefined;
    readonly physicals?: ProductTypePhysicalLink[] | undefined;
    readonly remoteID?: string | undefined;
    readonly createdDateTime?: Date | undefined;
    readonly createdByAccountID?: string | undefined;
    readonly modifiedDateTime?: Date | undefined;
    readonly modifiedByAccountID?: string | undefined;
    readonly parentProductTypeOptionCandidates?: readonly ParentProductTypeOption[] | undefined;
    readonly hydrationSupport?: ProductTypeHydrationSupport | undefined;
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
    this.attributeValues = init.attributeValues ?? [];
    this.promotionRewards = init.promotionRewards ?? [];
    this.promotionRewardExclusions = init.promotionRewardExclusions ?? [];
    this.promotionQualifiers = init.promotionQualifiers ?? [];
    this.promotionQualifierExclusions = init.promotionQualifierExclusions ?? [];
    this.priceGroupRates = init.priceGroupRates ?? [];
    this.priceGroupRateExclusions = init.priceGroupRateExclusions ?? [];
    this.attributeSets = init.attributeSets ?? [];
    this.physicals = init.physicals ?? [];
    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
    this.parentProductTypeOptionCandidates = init.parentProductTypeOptionCandidates ?? [];
    this.hydrationSupport = init.hydrationSupport;
  }

  // ============ START: Persistent Property Accessors ===================
  // Legacy names carried over verbatim in CFML camelCase; interface parity is the acceptance
  // contract for this port.

  /** [model/entity/ProductType.cfc:L52] */
  getProductTypeID(): string {
    return this.productTypeID;
  }

  /** [model/entity/ProductType.cfc:L54] Resolved through the persisted-flag boundary `cfBoolean()`. */
  getActiveFlag(): boolean {
    return cfBoolean(this.activeFlag);
  }

  /** [model/entity/ProductType.cfc:L55] Resolved through the persisted-flag boundary `cfBoolean()`. */
  getPublishedFlag(): boolean {
    return cfBoolean(this.publishedFlag);
  }

  /** [model/entity/ProductType.cfc:L56] */
  getURLTitle(): string | undefined {
    return this.urlTitle;
  }

  /** [model/entity/ProductType.cfc:L57] */
  getProductTypeName(): string | undefined {
    return this.productTypeName;
  }

  /** [model/entity/ProductType.cfc:L58] */
  getProductTypeDescription(): string | undefined {
    return this.productTypeDescription;
  }

  /** [model/entity/ProductType.cfc:L59] */
  getSystemCode(): string | undefined {
    return this.systemCode;
  }

  /** [model/entity/ProductType.cfc:L62] `undefined` for a root, or for an unjoined hydration. */
  getParentProductType(): ProductType | undefined {
    return this.parentProductType;
  }

  /** [model/entity/ProductType.cfc:L80] */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [model/entity/ProductType.cfc:L83] */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /** [model/entity/ProductType.cfc:L84] */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/ProductType.cfc:L85] */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** [model/entity/ProductType.cfc:L86] */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // ============  END: Persistent Property Accessors ====================

  // ============ START: Collection Accessors ============================
  // Liveness per the header census table. Every LIVE accessor has a receiver-qualified mutation
  // site in model/entity/*.cfc; every `readonly` one has none.

  /** [model/entity/ProductType.cfc:L65] LIVE - ProductType.cfc:L152, L161. */
  getChildProductTypes(): ProductType[] {
    return this.childProductTypes;
  }

  /** [model/entity/ProductType.cfc:L66] READONLY - no census site; `Product` hand-writes no `setProductType`. */
  getProducts(): readonly Product[] {
    return this.products;
  }

  /** [model/entity/ProductType.cfc:L67] LIVE - AttributeValue.cfc:L260, L269. */
  getAttributeValues(): ProductTypeAttributeValueLink[] {
    return this.attributeValues;
  }

  /** [model/entity/ProductType.cfc:L70] LIVE - PromotionReward.cfc:L283, L293. */
  getPromotionRewards(): PromotionReward[] {
    return this.promotionRewards;
  }

  /** [model/entity/ProductType.cfc:L71] LIVE - PromotionReward.cfc:L383, L393. */
  getPromotionRewardExclusions(): PromotionReward[] {
    return this.promotionRewardExclusions;
  }

  /** [model/entity/ProductType.cfc:L72] LIVE - PromotionQualifier.cfc:L225, L235. */
  getPromotionQualifiers(): PromotionQualifier[] {
    return this.promotionQualifiers;
  }

  /** [model/entity/ProductType.cfc:L73] LIVE - PromotionQualifier.cfc:L325, L335. */
  getPromotionQualifierExclusions(): PromotionQualifier[] {
    return this.promotionQualifierExclusions;
  }

  /** [model/entity/ProductType.cfc:L74] LIVE - PriceGroupRate.cfc:L204, L214. */
  getPriceGroupRates(): PriceGroupRate[] {
    return this.priceGroupRates;
  }

  /** [model/entity/ProductType.cfc:L75] READONLY - `PriceGroupRate` declares no excluded-side helpers. */
  getPriceGroupRateExclusions(): readonly PriceGroupRate[] {
    return this.priceGroupRateExclusions;
  }

  /** [model/entity/ProductType.cfc:L76] LIVE - AttributeSet.cfc:L115, L125. */
  getAttributeSets(): ProductTypeAttributeSetLink[] {
    return this.attributeSets;
  }

  /** [model/entity/ProductType.cfc:L77] LIVE - Physical.cfc:L144, L154. */
  getPhysicals(): ProductTypePhysicalLink[] {
    return this.physicals;
  }

  // ============  END: Collection Accessors =============================

  // ============ START: Containment Probes ==============================
  // None has a hand-written legacy body: all are synthesised by the dispatcher at
  // org/Hibachi/HibachiEntity.cfc:L507-L565, whose CFML semantics are Hibernate's
  // collection-contains - session identity, i.e. primary key for a persistent row. Each is
  // authored because a far side genuinely calls it across a module boundary.
  //
  // THE PROJECT-WIDE CONTAINMENT RULE: compare by PRIMARY KEY, with a REFERENCE fallback when the
  // candidate is unsaved. The fallback is not optional - every unsaved row's key is `''`
  // (`unsavedvalue=""`), so a pure key comparison would report two DIFFERENT unsaved rows as the
  // same one and the far side's guard would skip a legitimate append.

  /** Called by `setParentProductType` [model/entity/ProductType.cfc:L151]. */
  hasChildProductType(childProductType: ProductType): boolean {
    const candidateID: string = childProductType.getProductTypeID();
    if (candidateID === '') {
      return this.childProductTypes.includes(childProductType);
    }
    return this.childProductTypes.some(
      (held: ProductType) => held.getProductTypeID() === candidateID,
    );
  }

  /** Called by `PromotionReward.addProductType` [model/entity/PromotionReward.cfc:L282]. */
  hasPromotionReward(promotionReward: PromotionReward): boolean {
    const candidateID: string = promotionReward.getPromotionRewardID();
    if (candidateID === '') {
      return this.promotionRewards.includes(promotionReward);
    }
    return this.promotionRewards.some(
      (held: PromotionReward) => held.getPromotionRewardID() === candidateID,
    );
  }

  /** Called by `PromotionReward.addExcludedProductType` [model/entity/PromotionReward.cfc:L382]. */
  hasPromotionRewardExclusion(promotionReward: PromotionReward): boolean {
    const candidateID: string = promotionReward.getPromotionRewardID();
    if (candidateID === '') {
      return this.promotionRewardExclusions.includes(promotionReward);
    }
    return this.promotionRewardExclusions.some(
      (held: PromotionReward) => held.getPromotionRewardID() === candidateID,
    );
  }

  /** Called by `PromotionQualifier.addProductType` [model/entity/PromotionQualifier.cfc:L224]. */
  hasPromotionQualifier(promotionQualifier: PromotionQualifier): boolean {
    const candidateID: string = promotionQualifier.getPromotionQualifierID();
    if (candidateID === '') {
      return this.promotionQualifiers.includes(promotionQualifier);
    }
    return this.promotionQualifiers.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === candidateID,
    );
  }

  /** Called by `PromotionQualifier.addExcludedProductType` [model/entity/PromotionQualifier.cfc:L324]. */
  hasPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): boolean {
    const candidateID: string = promotionQualifier.getPromotionQualifierID();
    if (candidateID === '') {
      return this.promotionQualifierExclusions.includes(promotionQualifier);
    }
    return this.promotionQualifierExclusions.some(
      (held: PromotionQualifier) => held.getPromotionQualifierID() === candidateID,
    );
  }

  /** Called by `PriceGroupRate.addProductType` [model/entity/PriceGroupRate.cfc:L203]. */
  hasPriceGroupRate(priceGroupRate: PriceGroupRate): boolean {
    const candidateID: string = priceGroupRate.getPriceGroupRateID();
    if (candidateID === '') {
      return this.priceGroupRates.includes(priceGroupRate);
    }
    return this.priceGroupRates.some(
      (held: PriceGroupRate) => held.getPriceGroupRateID() === candidateID,
    );
  }

  // ============  END: Containment Probes ===============================

  /**
   * [org/Hibachi/HibachiEntity.cfc:L707-L709] `isNew()` returns `getNewFlag()`, and
   * [org/Hibachi/HibachiEntity.cfc:L571-L576] `getNewFlag()` returns `getPrimaryIDValue() == ""`.
   * With `unsavedvalue="" default=""` on [model/entity/ProductType.cfc:L52] that reduces exactly to
   * the test below.
   */
  isNew(): boolean {
    return this.productTypeID === '';
  }

  // ============ START: Pre-Banner Members ==============================
  // [model/entity/ProductType.cfc:L92-L119] - four members that sit ABOVE the
  // `// ============ START: Non-Persistent Property Methods` banner at L121. The source's own
  // organisation is preserved rather than tidied: reordering members to make the banners tidy would
  // make a reviewer's line-by-line diff against the CFC harder, which is the opposite of the point.

  // *** LEGACY-TODO [model/entity/ProductType.cfc:L93], CARRIED FORWARD VERBATIM AND NOT COMPLETED:
  //     // Todo get by all the parent productTypeIDs
  // The plan is explicit that known source TODOs are carried over as explicitly flagged TODOs and
  // are NOT silently completed. What the TODO admits is real and severe: the smart list built at
  // L94 has NO FILTER OF ANY KIND, so the method returns EVERY attribute-set assignment in the
  // installation rather than the ones inherited down this product type's parent chain. The
  // correctly-filtered version would use `productTypeIDPath` - which this entity already owns -
  // but implementing it here would be inventing behaviour the legacy system does not have.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * `getInheritedAttributeSetAssignments` [model/entity/ProductType.cfc:L92-L99]
   *
   * The legacy body verbatim:
   *
   *   // Todo get by all the parent productTypeIDs
   *   var attributeSetAssignments = getService("AttributeService").getAttributeSetAssignmentSmartList().getRecords();
   *   if(!arrayLen(attributeSetAssignments)){
   *     attributeSetAssignments = [];
   *   }
   *   return attributeSetAssignments;
   *
   * THE `if(!arrayLen(...))` NORMALISATION IS REPRODUCED even though it looks like a no-op in
   * TypeScript, and the reason is worth stating: in CFML a smart list's `getRecords()` can hand back
   * a query object rather than an array, in which case `arrayLen` is 0 and the guard substitutes a
   * real empty array. The port's port returns an array by contract, so the guard is expressed as
   * an explicit re-materialisation of the empty case - preserving the shape without pretending the
   * CFML hazard exists here.
   *
   * ★ RAISES when the hydration-support port is absent, rather than answering `[]`. The dividing
   * line the port applies uniformly is whether the return type has a SPARE value to mean "cannot
   * answer", and here it does not: `[]` is a completely legitimate answer produced by the legacy
   * body itself on the no-records path, so returning it for "no port" would make the two states
   * indistinguishable. That is the same reasoning recorded on `listGetAt` - where `''` is a valid
   * element - and on `Option.getImageDirectory()`.
   *
   * OUT-OF-SCOPE FEATURE REACHED FROM AN IN-SCOPE FILE. The whole `AttributeSet`/`AttributeValue`
   * EAV subsystem is out of scope, and `AttributeService` is not one of the thirteen ports. This
   * member is therefore ported as a thin pass-through to a narrow injected port and is flagged
   * UNEXERCISED by the in-scope slice: no in-scope service or DAO calls it.
   */
  getInheritedAttributeSetAssignments(): AttributeSetAssignmentLink[] {
    const support: ProductTypeHydrationSupport | undefined = this.hydrationSupport;
    if (support === undefined) {
      throw new Error(
        'ProductType.getInheritedAttributeSetAssignments was called on a product type hydrated ' +
          'without hydration support. model/entity/ProductType.cfc:L94 reaches ' +
          'getService("AttributeService").getAttributeSetAssignmentSmartList(), which becomes an ' +
          'injected port under transformation rule T2. No default is substituted: the legacy body ' +
          'itself returns [] on the no-records path, so [] is a valid answer and cannot also mean ' +
          '"unable to answer". Note the carried-forward TODO at ' +
          'model/entity/ProductType.cfc:L93 - the legacy query is unfiltered and returns every ' +
          'assignment in the installation.',
      );
    }

    const attributeSetAssignments: AttributeSetAssignmentLink[] =
      support.getAllAttributeSetAssignments();

    // [model/entity/ProductType.cfc:L95-L97] the empty-case normalisation, preserved.
    if (attributeSetAssignments.length === 0) {
      return [];
    }

    return attributeSetAssignments;
  }

  // *** LEGACY-DEFECT [model/entity/ProductType.cfc:L101-L107]: setProducts() CALLS A METHOD THIS
  // ENTITY DOES NOT DECLARE. The body clears `variables.Products` and then, for each element, calls
  // `addProduct(product)` - but model/entity/ProductType.cfc declares NO `addProduct` anywhere,
  // re-verified by grep across all 318 lines. Traced through the framework: `add*` matches NONE of
  // the eleven `onMissingMethod` patterns at org/Hibachi/HibachiEntity.cfc:L507-L565 - every pattern
  // is `has*`- or `get*`-prefixed - and the `getAttributeValue` fallback at L559 is `get`-only too,
  // so the call falls straight through to the throw at L565. The method therefore CLEARS THE
  // COLLECTION AND THEN THROWS on the first element, leaving the entity with an empty `products`
  // array. That destructive-then-failing order is itself observable and is preserved.
  //
  // An EMPTY input array is the one path that succeeds, because the loop body never runs. So
  // `setProducts([])` is a working collection-clear and `setProducts([anything])` is a throw. Both
  // are reproduced.
  //
  // (Two cosmetic notes on the same lines: the parameter is declared `required array Products` with
  // a capital P, and `variables.Products` is written with a capital P too, where every other member
  // of this component uses `variables.products`. CFML is case-insensitive for both, so it is
  // cosmetic; TypeScript parameter names are not observable to callers, so the identifier here uses
  // the conventional casing while this note records the source's.)
  // Preserved deliberately; do not fix without a product decision.

  /**
   * `setProducts` [model/entity/ProductType.cfc:L101-L107]
   *
   * @throws Error on any non-empty input, AFTER the collection has already been cleared.
   */
  setProducts(products: readonly Product[]): void {
    // [model/entity/ProductType.cfc:L103] `variables.Products = [];` - runs FIRST and
    // UNCONDITIONALLY, before the throw below. The clear is the observable half of the defect.
    this.products = [];

    // [model/entity/ProductType.cfc:L104-L106] the loop that calls the non-existent adder.
    if (products.length > 0) {
      throw new Error(
        'ProductType.setProducts is inoperable on a non-empty input in Slatwall 3.1.39: ' +
          'model/entity/ProductType.cfc:L105 calls addProduct(product), and ' +
          'model/entity/ProductType.cfc declares no addProduct at all. `add*` matches none of the ' +
          'eleven onMissingMethod patterns at org/Hibachi/HibachiEntity.cfc:L507-L565, so the call ' +
          'reaches the throw at L565. Note that L103 has already cleared the products collection ' +
          'by the time this raises - that ordering is part of the preserved behaviour. ' +
          'setProducts([]) succeeds and clears.',
      );
    }
  }

  /**
   * `getBaseProductType` - the system code at the ROOT of this product type's chain.
   * [model/entity/ProductType.cfc:L109-L115]
   *
   * The legacy body verbatim, comment included:
   *
   *   //get merchandisetype
   *   public any function getBaseProductType() {
   *     if(isNull(getSystemCode()) || getSystemCode() == ""){
   *       return getService("ProductService").getProductType(listFirst(getProductTypeIDPath())).getSystemCode();
   *     }
   *     return getSystemCode();
   *   }
   *
   * FOUR POINTS OF FIDELITY.
   *
   *   1. THE SHORT PATH NEEDS NO PORT AT ALL. When this product type has its own non-empty system
   *      code, the service is never consulted. That ordering is preserved, so the overwhelmingly
   *      common case never touches the injected collaborator and never risks its raise.
   *   2. `isNull(x) || x == ""` is the CFML emptiness idiom, expressed here through `cfLen()` - the
   *      port's `len()` equivalent, which is TOTAL over nullish and returns 0 for it. Deliberately
   *      NOT `cfTruthy()`, which raises on nullish, and deliberately not a bare `!this.systemCode`,
   *      which would also swallow a legitimate `'0'`.
   *   3. `listFirst(getProductTypeIDPath())` becomes `getRootIdFromIdPath()` from
   *      `src/domain/valueObjects/materializedIdPath.ts`, which reproduces CFML `listFirst`
   *      exactly - including that `listFirst('')` is `''` rather than a raise. Reading element 1
   *      directly would raise on an empty path, which CFML does not do here.
   *   4. THE LEGACY REACH-THROUGH IS UNGUARDED, and that is reproduced. L112 calls
   *      `.getSystemCode()` on whatever the service returned, with no null check, so a root ID that
   *      resolves to nothing is a CFML null-reference error. Returning `undefined` instead would be
   *      a different behaviour by a different route, not the same behaviour.
   *
   * @throws Error when the hydration-support port is absent, or when the root ID resolves to no
   *   product type (the preserved unguarded dereference).
   */
  getBaseProductType(): string | undefined {
    // [model/entity/ProductType.cfc:L111] the short path - no service, no port, no raise.
    if (cfLen(this.systemCode) > 0) {
      return this.systemCode;
    }

    const support: ProductTypeHydrationSupport | undefined = this.hydrationSupport;
    if (support === undefined) {
      throw new Error(
        'ProductType.getBaseProductType needs to resolve its root product type but was hydrated ' +
          'without hydration support. model/entity/ProductType.cfc:L112 reaches ' +
          'getService("ProductService").getProductType(listFirst(getProductTypeIDPath())), which ' +
          'becomes an injected port under transformation rule T2. This branch is reached only when ' +
          'this product type has no systemCode of its own.',
      );
    }

    const rootProductTypeID: string = getRootIdFromIdPath(this.getProductTypeIDPath());
    const rootProductType: ProductType | undefined =
      support.getProductTypeByProductTypeID(rootProductTypeID);

    if (rootProductType === undefined) {
      throw new Error(
        'ProductType.getBaseProductType could not resolve the root of its productTypeIDPath ' +
          `(root id ${JSON.stringify(rootProductTypeID)}). ` +
          'model/entity/ProductType.cfc:L112 calls .getSystemCode() on the service result with no ' +
          'null guard, so an unresolvable root is a CFML null-reference error there. Reproduced ' +
          'rather than smoothed into an undefined return, which would be different behaviour.',
      );
    }

    return rootProductType.getSystemCode();
  }

  // *** LEGACY-DEFECT [model/entity/ProductType.cfc:L117-L119]:
  // getAppliedPriceGroupRateByPriceGroup() PASSES THE WRONG ARGUMENT NAME. The body is
  //   return getService("priceGroupService").getRateForProductTypeBasedOnPriceGroup(product=this, priceGroup=arguments.priceGroup);
  // but model/service/PriceGroupService.cfc:L57 declares
  //   public any function getRateForProductTypeBasedOnPriceGroup(required any productType, required any priceGroup)
  // - so the REQUIRED `productType` argument is never supplied, and an unexpected `product`
  // argument is. CFML raises "The PRODUCTTYPE parameter to the getRateForProductTypeBasedOnPriceGroup
  // function is required but was not passed in." before the callee's first statement executes.
  //
  // The mistake is a copy-paste from the sku-shaped sibling: model/entity/Sku.cfc:L266 writes
  // `getRateForSkuBasedOnPriceGroup(sku=this, ...)`, which is correct because that callee's
  // parameter IS named `sku`. This one changed the method name but not the argument name.
  //
  // Reproduced as an unconditional throwing stub. There is no argument-name dispatch in TypeScript
  // to mis-target, so the raise is authored directly, with the parameter retained for interface
  // parity - `tsconfig.json` omits `noUnusedParameters` and eslint.config.mjs sets `args: 'none'`
  // precisely so verbatim legacy signatures can be preserved. The return type is
  // `PriceGroupRate | undefined` rather than `never`, matching the legacy `any` declaration; `never`
  // is reserved for `Sku.getPriceByPromotion()`, whose legacy declaration is `numeric`.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * `getAppliedPriceGroupRateByPriceGroup` [model/entity/ProductType.cfc:L117-L119]
   *
   * @throws Error on every call - see the LEGACY-DEFECT marker above.
   */
  getAppliedPriceGroupRateByPriceGroup(priceGroup: unknown): PriceGroupRate | undefined {
    throw new Error(
      'ProductType.getAppliedPriceGroupRateByPriceGroup is inoperable in Slatwall 3.1.39: ' +
        'model/entity/ProductType.cfc:L118 calls ' +
        'getRateForProductTypeBasedOnPriceGroup(product=this, priceGroup=...), but ' +
        'model/service/PriceGroupService.cfc:L57 declares that function with a REQUIRED parameter ' +
        'named productType and no parameter named product. CFML raises a missing-required-argument ' +
        'error before the callee runs. The intended call was ' +
        'getRateForProductTypeBasedOnPriceGroup(productType=this, priceGroup=...); compare the ' +
        'correct sku-shaped sibling at model/entity/Sku.cfc:L266.',
    );
  }

  // ============  END: Pre-Banner Members ===============================

  // ============ START: Non-Persistent Property Methods =================
  // [model/entity/ProductType.cfc:L121] opens this block and L144 closes it. It contains exactly
  // one member.

  // *** LEGACY-DEFECT [model/entity/ProductType.cfc:L136]: getParentProductTypeOptions() EXCLUDES
  // THE SELF-RECORD BY NAME, NOT BY PRIMARY KEY. The filter reads
  //   if(records[i].getProductTypeName() != getProductTypeName())
  // where the correct test - and the one model/entity/PriceGroup.cfc:L97 actually uses for the
  // identical purpose - compares primary keys. Two consequences, both real:
  //
  //   1. TWO PRODUCT TYPES SHARING A NAME EXCLUDE EACH OTHER. Nothing prevents that: L57 declares
  //      `productTypeName` with no `unique="true"` (contrast `urlTitle` at L56, which has it), so
  //      duplicate names are schema-legal. Both rows vanish from the option list, one of them
  //      wrongly.
  //   2. RENAMING A PRODUCT TYPE CHANGES ITS OWN OPTION LIST. Under the correct key-based test the
  //      list is rename-invariant; here it is not.
  //
  // ★ THE CONTRAST WITH PriceGroup IS THE POINT, and it is recorded from both sides:
  // src/domain/entities/priceGroup.ts carries the reciprocal note on
  // `getParentPriceGroupOptions()`. PriceGroup gets this right by comparing
  // `options[i]['value']` to `getPriceGroupID()`; ProductType gets it wrong by comparing display
  // names. Same intent, same shape, different correctness - which is exactly why the defect
  // register exists rather than a blanket "the two are equivalent" assumption.
  //
  // A THIRD, SEPARATE DIFFERENCE THAT IS NOT A DEFECT: this version has NO `len(value)` guard,
  // where PriceGroup.cfc:L97 does. PriceGroup needs one because
  // `hb_optionsNullRBKey="define.none"` at its L59 makes the framework PREPEND a blank
  // `{value:'', name:...}` row that an unsaved price group's empty key would otherwise match.
  // model/entity/ProductType.cfc:L62 declares NO `hb_optionsNullRBKey`, so no blank row is
  // prepended and no guard is needed. Two different-looking implementations, both correct on that
  // specific point.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * `getParentProductTypeOptions` - candidate parents for this product type, minus itself.
   * [model/entity/ProductType.cfc:L122-L142]
   *
   * The legacy body memoizes on `variables.parentProductTypeOptions` IN ITS OWN BODY [L123], builds
   * a `getPropertyOptionsSmartList("parentProductType")` filtered by a `productTypeIDPath` LIKE
   * prefix derived from the base product type [L128-L129], and then copies every record whose NAME
   * differs from this one's into `{name, value}` rows [L135-L139].
   *
   * WHAT IS PORTED HERE AND WHAT IS NOT, stated precisely so the boundary is auditable:
   *
   *   * THE FILTERING IS THE BEHAVIOUR AND IT IS PORTED. Which rows survive is what the caller
   *     observes, and it is the half that carries the defect.
   *   * THE SMART-LIST CONSTRUCTION IS AN INPUT, NOT THE BEHAVIOUR. The candidate rows arrive
   *     already projected and already prefix-filtered from the repository, for the same reason the
   *     plan gives for not porting smart lists at all: reproducing a generic string-keyed query
   *     builder would import exactly the framework coupling this refactor removes.
   *   * THE `baseProductType` PARAMETER IS RETAINED for interface parity, including its `""`
   *     default [L122]. In the legacy it feeds the prefix filter; here the prefix filter has
   *     already been applied by the repository, so the parameter is accepted and not read. That is
   *     recorded rather than hidden, and it is why the signature keeps it instead of dropping it.
   *
   * TOTAL: it never throws. An empty candidate list yields an empty result, which is truthful
   * rather than a substituted default - there genuinely are no candidate parents.
   *
   * ONE DELIBERATE DIVERGENCE, of exactly the kind already recorded for
   * `PriceGroup.getParentPriceGroupOptions()`: the filter builds a NEW array rather than splicing
   * the candidate array in place. The legacy `arrayAppend` into a fresh
   * `variables.parentProductTypeOptions` [L133, L137] does the same thing, so here the two forms
   * agree; the note is kept for symmetry with its sibling, where they do not.
   */
  getParentProductTypeOptions(baseProductType: string = ''): readonly ParentProductTypeOption[] {
    // [model/entity/ProductType.cfc:L123] the memo guard, testing PRESENCE and not truthiness. An
    // empty array is a legitimate memoized answer that must not re-trigger the computation.
    if (this.parentProductTypeOptions !== undefined) {
      return this.parentProductTypeOptions;
    }

    const options: ParentProductTypeOption[] = [];

    // [model/entity/ProductType.cfc:L135-L139]: copy every candidate whose NAME differs from this
    // one's. The comparison is `!=`, which in CFML is CASE-INSENSITIVE for strings, so the port
    // folds both sides before comparing - a case-sensitive `!==` would keep a row CFML drops.
    // Reproducing the case-insensitivity is not the same as endorsing the by-name comparison: that
    // remains the preserved defect marked above.
    const ownName: string = (this.productTypeName ?? '').toLowerCase();
    for (const candidate of this.parentProductTypeOptionCandidates) {
      if (candidate.name.toLowerCase() !== ownName) {
        options.push(candidate);
      }
    }

    this.parentProductTypeOptions = options;
    return this.parentProductTypeOptions;
  }

  // ============  END: Non-Persistent Property Methods ==================

  // ============= START: Bidirectional Helper Methods ===================
  // [model/entity/ProductType.cfc:L146] opens this block and L246 closes it. Eleven pairs.

  /**
   * Attaches this product type to a parent, adding it to that parent's child collection.
   * [model/entity/ProductType.cfc:L149-L154]
   *
   *   variables.parentProductType = arguments.parentProductType;
   *   if(isNew() or !arguments.parentProductType.hasChildProductType( this )) {
   *     arrayAppend(arguments.parentProductType.getChildProductTypes(), this);
   *   }
   *
   * BOTH HALVES OF THE DISJUNCT ARE PRESERVED, in order, with CFML's short-circuit semantics that
   * JavaScript's `||` reproduces exactly. `isNew()` first: an unsaved product type is appended
   * unconditionally, because its `''` key makes the membership test meaningless. Only then is
   * `hasChildProductType` consulted, which keeps a saved child from being appended twice.
   *
   * Note WHOSE newness is tested - `this`, the child. Contrast
   * model/entity/PromotionCode.cfc:L123, where the near-side guard tests the ARGUMENT's newness
   * instead. The two polarities are not interchangeable and neither is normalised.
   *
   * `arrayAppend` becomes `push` onto the LIVE array from `getChildProductTypes()`; the mutation
   * must be observable through that accessor on the parent, which is why the collection is not
   * `readonly`.
   */
  setParentProductType(parentProductType: ProductType): void {
    this.parentProductType = parentProductType;

    if (this.isNew() || !parentProductType.hasChildProductType(this)) {
      parentProductType.getChildProductTypes().push(this);
    }
  }

  /**
   * Detaches this product type from a parent.
   * [model/entity/ProductType.cfc:L155-L164]
   *
   * THE ARGUMENT IS OPTIONAL, exactly as the legacy declaration is - `any parentProductType` with
   * no `required`. The default branch tests `!== undefined`, reproducing
   * `structKeyExists(arguments, "parentProductType")` and NEVER truthiness: an argument that was
   * passed is a different state from one that was not.
   *
   * `arrayFind` IS 1-BASED AND RETURNS 0 ON A MISS, which is why the legacy guard is `index > 0`.
   * `Array.prototype.findIndex` is 0-BASED and returns `-1`, so the equivalent guard is an explicit
   * `!== -1` - never a truthiness test, which would wrongly treat the valid index 0 as "not found".
   *
   * `structDelete(variables, "parentProductType")` becomes assigning `undefined`, and it runs
   * UNCONDITIONALLY - outside the index guard - just as at L163.
   *
   * LEGACY-NOTE [model/entity/ProductType.cfc:L155-L159]: when the argument is omitted AND this
   * product type has no stored parent, the legacy assigns null into `arguments.parentProductType`
   * at L157 and then invokes `.getChildProductTypes()` on it at L159 - a method call on null, which
   * throws under every CFML engine. Reproduced rather than smoothed over: returning early would
   * silently skip the L163 field clear as well, so it would not be the same behaviour by a
   * different route. The identical unguarded shape appears at model/entity/PriceGroup.cfc:L116-L122,
   * model/entity/Category.cfc:L107-L112 and model/entity/PriceGroupRate.cfc:L139-L143, so it is the
   * framework-wide idiom rather than a local slip.
   *
   * @throws Error when called with no argument on a product type that has no parent.
   */
  removeParentProductType(parentProductType?: ProductType): void {
    const targetParentProductType: ProductType | undefined =
      parentProductType !== undefined ? parentProductType : this.parentProductType;

    if (targetParentProductType === undefined) {
      throw new Error(
        'ProductType.removeParentProductType was called with no argument on a product type that ' +
          'has no parentProductType. This reproduces the legacy runtime failure at ' +
          'model/entity/ProductType.cfc:L157-L159, where the omitted argument defaults to a null ' +
          'parent and getChildProductTypes() is then invoked on it.',
      );
    }

    const siblingProductTypes: ProductType[] = targetParentProductType.getChildProductTypes();
    const index: number = siblingProductTypes.findIndex(
      (child: ProductType) => child.getProductTypeID() === this.productTypeID,
    );

    if (index !== -1) {
      siblingProductTypes.splice(index, 1);
    }

    this.parentProductType = undefined;
  }

  // LEGACY-NOTE [model/entity/ProductType.cfc:L167, L170]: the source declares these two as
  // `addchildProductType` and `removechildProductType` - LOWER-CASE `c` - while every sibling pair
  // in the file capitalises. CFML method names are case-INSENSITIVE, so callers write
  // `addChildProductType` and it resolves; the source casing is cosmetic. TypeScript member names
  // are case-SENSITIVE and ARE observable to callers, so the conventional casing is used here and
  // the source's is recorded in this note. Choosing the source's literal casing would make the
  // TypeScript surface harder to call than the CFML one, which inverts the parity goal.
  // (The same lines also declare their parameter as `required any ChildProductType` with a capital
  // C - likewise cosmetic and likewise not reproduced in the identifier.)

  /** [model/entity/ProductType.cfc:L167-L169] `arguments.ChildProductType.setParentProductType( this );` */
  addChildProductType(childProductType: ProductType): void {
    childProductType.setParentProductType(this);
  }

  /** [model/entity/ProductType.cfc:L170-L172] `arguments.ChildProductType.removeParentProductType( this );` */
  removeChildProductType(childProductType: ProductType): void {
    childProductType.removeParentProductType(this);
  }

  // The eight inverse-side pairs below are all PURE DELEGATIONS: this entity is the
  // `inverse="true"` half of each association, so the OWNER performs both halves of the update -
  // appending to its own private collection and reaching back into this entity's live array.
  // Nothing is appended or spliced here, and adding such a step would double-append.

  /** [model/entity/ProductType.cfc:L175-L177] `arguments.promotionReward.addProductType( this );` */
  addPromotionReward(promotionReward: PromotionReward): void {
    promotionReward.addProductType(this);
  }

  /** [model/entity/ProductType.cfc:L178-L180] `arguments.promotionReward.removeProductType( this );` */
  removePromotionReward(promotionReward: PromotionReward): void {
    promotionReward.removeProductType(this);
  }

  /** [model/entity/ProductType.cfc:L183-L185] `arguments.promotionReward.addExcludedProductType( this );` */
  addPromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.addExcludedProductType(this);
  }

  /** [model/entity/ProductType.cfc:L186-L188] `arguments.promotionReward.removeExcludedProductType( this );` */
  removePromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.removeExcludedProductType(this);
  }

  /** [model/entity/ProductType.cfc:L191-L193] `arguments.promotionQualifier.addProductType( this );` */
  addPromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addProductType(this);
  }

  /** [model/entity/ProductType.cfc:L194-L196] `arguments.promotionQualifier.removeProductType( this );` */
  removePromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeProductType(this);
  }

  /** [model/entity/ProductType.cfc:L199-L201] `arguments.promotionQualifier.addExcludedProductType( this );` */
  addPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addExcludedProductType(this);
  }

  /** [model/entity/ProductType.cfc:L202-L204] `arguments.promotionQualifier.removeExcludedProductType( this );` */
  removePromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeExcludedProductType(this);
  }

  /** [model/entity/ProductType.cfc:L207-L209] `arguments.priceGroupRate.addProductType( this );` */
  addPriceGroupRate(priceGroupRate: PriceGroupRate): void {
    priceGroupRate.addProductType(this);
  }

  /** [model/entity/ProductType.cfc:L210-L212] `arguments.priceGroupRate.removeProductType( this );` */
  removePriceGroupRate(priceGroupRate: PriceGroupRate): void {
    priceGroupRate.removeProductType(this);
  }

  // *** LEGACY-DEFECT [model/entity/ProductType.cfc:L215-L220]: BOTH PriceGroupRateExclusion
  // HELPERS CALL METHODS `PriceGroupRate` DOES NOT DECLARE. L216 calls
  // `arguments.priceGroupRate.addExcludedProductType( this )` and L219 calls
  // `removeExcludedProductType`, but model/entity/PriceGroupRate.cfc declares NEITHER - re-verified
  // by grep across all 284 lines. That file hand-writes exactly four owner-side pairs -
  // `setPriceGroup`/`removePriceGroup` [L133/L139], `addProductType`/`removeProductType`
  // [L151/L159], `addProduct`/`removeProduct` [L171/L179] and `addSku`/`removeSku` [L191/L199] -
  // and NOTHING for its three `excluded*` collections [L27-L29], even though those collections are
  // declared and persisted.
  //
  // Traced through the framework: `add*` and `remove*` match NONE of the eleven `onMissingMethod`
  // patterns at org/Hibachi/HibachiEntity.cfc:L507-L565 (all are `has*`- or `get*`-prefixed), and
  // the `getAttributeValue` fallback at L559 is `get`-only, so both calls reach the throw at L565.
  //
  // ★ THIS IS THE ROOT CAUSE OF AN ASYMMETRY VISIBLE ELSEWHERE IN THIS FILE. It is exactly why
  // `getPriceGroupRateExclusions()` above is `readonly` while `getPriceGroupRates()` is LIVE: with
  // no far-side helper to reach in, no census site exists. The same defect appears from two more
  // callers - model/entity/Product.cfc:L740/L743 and model/entity/Sku.cfc:L680/L683 both call the
  // same two non-existent methods for their own excluded-side pairs - so it is a systematic
  // omission in PriceGroupRate rather than a local slip here. Whether the three `excluded*`
  // collections are reachable AT ALL in the legacy runtime is therefore: only through direct
  // population, never through a bidirectional helper.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * `addPriceGroupRateExclusion` [model/entity/ProductType.cfc:L215-L217]
   *
   * @throws Error on every call - see the LEGACY-DEFECT marker above.
   */
  addPriceGroupRateExclusion(priceGroupRate: PriceGroupRate): void {
    throw new Error(
      'ProductType.addPriceGroupRateExclusion is inoperable in Slatwall 3.1.39: ' +
        'model/entity/ProductType.cfc:L216 calls priceGroupRate.addExcludedProductType(this), and ' +
        'model/entity/PriceGroupRate.cfc declares no addExcludedProductType. `add*` matches none ' +
        'of the eleven onMissingMethod patterns at org/Hibachi/HibachiEntity.cfc:L507-L565, so the ' +
        'call reaches the throw at L565. PriceGroupRate hand-writes helpers for its three included ' +
        'collections only, never for its three excluded ones.',
    );
  }

  /**
   * `removePriceGroupRateExclusion` [model/entity/ProductType.cfc:L218-L220]
   *
   * @throws Error on every call - see the LEGACY-DEFECT marker above.
   */
  removePriceGroupRateExclusion(priceGroupRate: PriceGroupRate): void {
    throw new Error(
      'ProductType.removePriceGroupRateExclusion is inoperable in Slatwall 3.1.39: ' +
        'model/entity/ProductType.cfc:L219 calls ' +
        'priceGroupRate.removeExcludedProductType(this), and ' +
        'model/entity/PriceGroupRate.cfc declares no removeExcludedProductType. `remove*` matches ' +
        'none of the eleven onMissingMethod patterns at ' +
        'org/Hibachi/HibachiEntity.cfc:L507-L565, so the call reaches the throw at L565.',
    );
  }

  /** [model/entity/ProductType.cfc:L223-L225] `arguments.attributeSet.addProductType( this );` */
  addAttributeSet(attributeSet: ProductTypeAttributeSetLink): void {
    attributeSet.addProductType(this);
  }

  /** [model/entity/ProductType.cfc:L226-L228] `arguments.attributeSet.removeProductType( this );` */
  removeAttributeSet(attributeSet: ProductTypeAttributeSetLink): void {
    attributeSet.removeProductType(this);
  }

  /** [model/entity/ProductType.cfc:L231-L233] `arguments.attributeValue.setProductType( this );` */
  addAttributeValue(attributeValue: ProductTypeAttributeValueLink): void {
    attributeValue.setProductType(this);
  }

  /** [model/entity/ProductType.cfc:L234-L236] `arguments.attributeValue.removeProductType( this );` */
  removeAttributeValue(attributeValue: ProductTypeAttributeValueLink): void {
    attributeValue.removeProductType(this);
  }

  /** [model/entity/ProductType.cfc:L239-L241] `arguments.physical.addProductType( this );` */
  addPhysical(physical: ProductTypePhysicalLink): void {
    physical.addProductType(this);
  }

  /** [model/entity/ProductType.cfc:L242-L244] `arguments.physical.removeProductType( this );` */
  removePhysical(physical: ProductTypePhysicalLink): void {
    physical.removeProductType(this);
  }

  // =============  END:  Bidirectional Helper Methods ===================

  // ============== START: Overridden Implicet Getters ===================
  // [model/entity/ProductType.cfc:L248] opens this block and L257 closes it. The source's own
  // spelling of the banner - "Implicet" - is reproduced above rather than corrected, because a
  // reviewer diffing this file against the CFC should find the same words.

  /**
   * `getProductTypeIDPath` - the comma-delimited materialized path from the root to this node.
   * [model/entity/ProductType.cfc:L250-L255]
   *
   *   if(isNull(variables.productTypeIDPath)) {
   *     variables.productTypeIDPath = buildIDPathList( "parentProductType" );
   *   }
   *   return variables.productTypeIDPath;
   *
   * MEMOIZES ON THE ABSENT BRANCH ONLY. A PRESENT path - INCLUDING an empty string - is left
   * untouched and returned as-is, because `isNull()` tests absence rather than emptiness. That
   * distinction is preserved through `resolveIdPath()` and the explicit write guard below, exactly
   * as src/domain/entities/priceGroup.ts does for `priceGroupIDPath`.
   *
   * SYNCHRONOUS. The walk traverses `parentProductType` references the repository already
   * materialized; it issues no query and reaches no port.
   *
   * ★ THIS VALUE DECIDES WHICH PROMOTIONS APPLY. It is read by the promotion engine's qualifier and
   * reward membership tests [model/service/PromotionService.cfc:L858-L870, L921-L985] and
   * concatenated into dialect-specific SQL at model/dao/PromotionDAO.cfc:L482-L488. A truncated or
   * mis-ordered path changes money, which is why the walk below carries no guard that could shorten
   * it - see `buildProductTypeIDPathList()`.
   */
  getProductTypeIDPath(): string {
    const resolvedProductTypeIDPath: string = resolveIdPath(this.productTypeIDPath, () =>
      this.buildProductTypeIDPathList(),
    );

    // [model/entity/ProductType.cfc:L251-L253] the conditional write. A present path, including
    // `''`, is left alone; only the absent case is memoized.
    if (this.productTypeIDPath === null || this.productTypeIDPath === undefined) {
      this.productTypeIDPath = resolvedProductTypeIDPath;
    }

    return resolvedProductTypeIDPath;
  }

  /**
   * The setter the two lifecycle hooks call.
   * [model/entity/ProductType.cfc:L306, L311] `setProductTypeIDPath( buildIDPathList(...) )`
   *
   * Generated by `accessors=true` in the legacy rather than hand-written, and authored here because
   * both hooks call it by name. Public for exactly that reason and no other.
   */
  setProductTypeIDPath(productTypeIDPath: string): void {
    this.productTypeIDPath = productTypeIDPath;
  }

  // ==============  END: Overridden Implicet Getters ====================

  // ============= START: Overridden Smart List Getters ==================
  // [model/entity/ProductType.cfc:L259] opens this block and L269 closes it, and its single member
  // `getProductsSmartList()` [L261-L267] IS DELIBERATELY NOT PORTED.
  //
  // The body memoizes a `getService("productService").getProductSmartList()` and then adds a raw
  // where-condition string interpolating this product type's path:
  //   variables.productsSmartList.addWhereCondition(" aslatwallproducttype.productTypeIDPath LIKE '#getProductTypeIDPath()#%'");
  //
  // Porting it faithfully would mean reimplementing `HibachiSmartList` - a generic, string-keyed,
  // dynamically-filtered query builder - which would import exactly the framework coupling this
  // refactor exists to remove and would be untypeable under the strict profile. The plan records
  // that decision explicitly for `getProductSmartList()` and `getSkuSmartList()`, and the same
  // reasoning applies verbatim here: the concrete filter callers actually rely on - "every product
  // whose product type is at or below this one" - becomes a TYPED REPOSITORY QUERY, not a
  // smart-list clone. The `productTypeIDPath` prefix that filter needs is available from
  // `getProductTypeIDPath()` above, so nothing is lost from the entity's surface.
  //
  // Recorded rather than silently dropped, so the omission is auditable.
  // =============  END: Overridden Smart List Getters ===================

  // ================== START: Overridden Methods ========================
  // [model/entity/ProductType.cfc:L271] opens this block and L301 closes it.

  /**
   * `getSimpleRepresentation` - the breadcrumb label, built by climbing the parent chain.
   * [model/entity/ProductType.cfc:L273-L278]
   *
   *   if(!isNull(getParentProductType())) {
   *     return getParentProductType().getSimpleRepresentation() & " &raquo; " & getProductTypeName();
   *   }
   *   return getProductTypeName();
   *
   * THREE POINTS OF FIDELITY.
   *
   *   1. THE SEPARATOR IS THE HTML ENTITY `&raquo;`, NOT THE CHARACTER `»`. It is emitted
   *      pre-escaped because the legacy value flows straight into an admin template. Substituting
   *      the literal character would change the bytes a consumer receives, so the entity is
   *      preserved verbatim - surrounding single spaces included.
   *   2. THIS IS AN OVERRIDE OF THE METHOD ITSELF, not a declaration of
   *      `getSimpleRepresentationPropertyName()`. The framework's base at
   *      org/Hibachi/HibachiEntity.cfc:L59 invokes whatever the property-name variant returns and
   *      throws at L87 when neither is supplied; this entity supplies the override form. Contrast
   *      model/entity/PriceGroupRate.cfc:L222 and model/entity/Product.cfc:L791, which declare the
   *      property-name variant instead. No `getSimpleRepresentationPropertyName()` is added here.
   *   3. THE RECURSION HAS NO CYCLE GUARD AND NO DEPTH LIMIT, matching the source. A cyclic parent
   *      chain overflows the stack in both languages. Adding a guard would be an unrequested
   *      behavioural change, and the same decision is recorded on the path walk.
   *
   * `returntype="string"` with a nullable `productTypeName` [L57, no `notNull`] means a nameless
   * product type is a CFML return-type coercion failure rather than a silent empty string - the
   * same situation, and the same treatment, as `PromotionPeriod.getSimpleRepresentation()`.
   *
   * @throws Error when this product type, or any ancestor reached by the climb, has no name.
   */
  getSimpleRepresentation(): string {
    const ownName: string | undefined = this.productTypeName;

    if (ownName === undefined) {
      throw new Error(
        'ProductType.getSimpleRepresentation has no productTypeName to return. ' +
          'model/entity/ProductType.cfc:L57 declares productTypeName without notNull, so the ' +
          'column is nullable, while L273 declares returntype="string" - CFML raises on the ' +
          'return-type coercion rather than yielding an empty string.',
      );
    }

    const parentProductType: ProductType | undefined = this.parentProductType;

    if (parentProductType !== undefined) {
      // [model/entity/ProductType.cfc:L275] the `&raquo;` entity and its surrounding single spaces,
      // byte for byte.
      return `${parentProductType.getSimpleRepresentation()} &raquo; ${ownName}`;
    }

    return ownName;
  }

  // LEGACY-NOTE [model/entity/ProductType.cfc:L280-L299] `getAssignedAttributeSetSmartList()` IS
  // DELIBERATELY NOT PORTED, for the same reason as `getProductsSmartList()` above. Its body
  // memoizes an `attributeService` smart list, adds two filters, joins a related property, and then
  // assembles a raw where-condition by string-interpolating
  // `replace(getProductTypeIDPath(),",","','","all")` into an SQL `IN` list. Every one of those
  // steps is a `HibachiSmartList` operation, and the whole `AttributeSet` EAV subsystem is out of
  // scope besides. Recorded so the omission is auditable rather than invisible; the
  // `productTypeIDPath` the query needs remains available from `getProductTypeIDPath()`.

  // ==================  END:  Overridden Methods ========================

  // =================== START: ORM Event Hooks  =========================
  // [model/entity/ProductType.cfc:L303] opens this block and L315 closes it. UNLIKE
  // model/entity/PriceGroup.cfc - which declares its two equivalents inside the "Overridden
  // Methods" banner at L204-L216 and leaves its ORM-hook banner empty - this entity declares them
  // HERE, inside the hook banner. A per-entity organisational inconsistency in the legacy tree,
  // recorded and not normalised.
  //
  // ONE LIFECYCLE CONTRACT ACROSS THE FOLDER: `preInsert(): void` and
  // `preUpdate(oldData?: Readonly<Record<string, unknown>>): void`, invoked BY THE REPOSITORY ON
  // SAVE. Per the port's ORM transformation rule, Hibernate lifecycle callbacks become explicit
  // maintenance methods; they are never auto-fired, never called from the constructor, and never
  // called from an accessor on this class.
  //
  // ★ WHAT THE CONTRACT DELIBERATELY DOES NOT UNIFY IS THE SUPER-CALL ORDERING, because the source
  // does not. Category.cfc:L127/L132 calls `super` FIRST, then maintains its path; ProductType here
  // and PriceGroup.cfc:L207/L212 maintain the path FIRST, then call `super`. There is no TypeScript
  // base class in this folder so no `super` call is authored either way, but the ordering is
  // recorded at each hook so the difference survives the port and can be honoured if a base class
  // is ever introduced. Normalising it would be inventing a uniformity the legacy does not have.

  /**
   * `preInsert` [model/entity/ProductType.cfc:L305-L308]
   *
   *   setProductTypeIDPath( buildIDPathList( "parentProductType" ) );
   *   super.preInsert();
   *
   * PATH MAINTENANCE FIRST, `super` SECOND - the ProductType/PriceGroup ordering, not Category's.
   * The path is written UNCONDITIONALLY here, unlike `getProductTypeIDPath()`, which only writes on
   * the absent branch: an insert must always recompute, because the parent chain is only final at
   * save time.
   */
  preInsert(): void {
    this.setProductTypeIDPath(this.buildProductTypeIDPathList());
    // [model/entity/ProductType.cfc:L307] `super.preInsert();` - no base class exists in this
    // folder, so nothing is called. The ordering marker is the point of this comment.
  }

  /**
   * `preUpdate` [model/entity/ProductType.cfc:L310-L313]
   *
   *   setProductTypeIDPath( buildIDPathList( "parentProductType" ) );;
   *   super.preUpdate(argumentcollection=arguments);
   *
   * SECONDARY REGISTER ITEM: L311 ends in a DOUBLE SEMICOLON. It is a harmless empty statement in
   * CFML and model/entity/PriceGroup.cfc:L212 carries the identical wart. Recorded, not reproduced -
   * an empty statement is not observable behaviour, and Prettier would remove it anyway.
   *
   * `oldData` IS ACCEPTED AND NOT READ, exactly as the legacy hook does not read it either: L312
   * forwards it wholesale via `argumentcollection=arguments` and nothing in this class inspects it.
   * The parameter is retained for signature parity, which `tsconfig.json` permits by leaving
   * `noUnusedParameters` off and ESLint permits through `args: 'none'` - both settings exist
   * precisely so verbatim legacy signatures can be preserved.
   *
   * Typed as a readonly bag of unknown-valued columns rather than a `ProductType`: the legacy
   * `oldData` is the raw pre-update property struct the ORM hands the hook, not a hydrated entity,
   * and `unknown` values force any future reader to narrow before use instead of trusting a shape
   * nothing validated. It is not `any`, which is forbidden.
   */
  preUpdate(oldData?: Readonly<Record<string, unknown>>): void {
    this.setProductTypeIDPath(this.buildProductTypeIDPathList());
    // [model/entity/ProductType.cfc:L312] `super.preUpdate(argumentcollection=arguments);`
  }

  // ===================  END:  ORM Event Hooks  =========================

  /**
   * Walks this product type's parent chain and builds the comma-delimited path.
   *
   * PRIVATE, because it is not part of the legacy public surface: it stands for the
   * `buildIDPathList( "parentProductType" )` calls at [model/entity/ProductType.cfc:L252], [L306]
   * and [L311], and `buildIDPathList` was a method on the NON-PORTED framework base at
   * [org/Hibachi/HibachiEntity.cfc:L308-L322]. Introducing it as one private helper is what lets all
   * three legacy call sites share a single delegation point, so they can never drift apart.
   *
   * The string property name the legacy passes - `"parentProductType"` - is resolved there by
   * `evaluate("thisEntity.get#arguments.parentPropertyName#()")`
   * [org/Hibachi/HibachiEntity.cfc:L316, L319]. TypeScript has no equivalent and must not
   * manufacture one, so the two explicit typed callbacks below replace that string dispatch:
   * `getProductTypeID` stands for `getPrimaryIDValue()`
   * [org/Hibachi/HibachiEntity.cfc:L244-L246], which for this entity resolves to exactly that
   * accessor, and `getParentProductType` is the association the legacy string named.
   *
   * NO CYCLE GUARD AND NO DEPTH LIMIT, matching the legacy walk at
   * [org/Hibachi/HibachiEntity.cfc:L314-L321], which carries neither. Adding one would be an
   * unrequested behavioural change to a value that decides which promotions apply and which
   * price-group rate wins, and a TRUNCATING guard would quietly shorten a path and change a price.
   * The value object documents the same decision at its own walk.
   */
  private buildProductTypeIDPathList(): string {
    return buildIdPathList<ProductType>(
      this,
      (node: ProductType) => node.getProductTypeID(),
      (node: ProductType) => node.getParentProductType(),
    );
  }
}

// ---------------------------------------------------------------------------
// WHAT THE TEST TIER MUST PIN FOR THIS MODULE (all NET-NEW - `ProductType` has no legacy test)
//
//   1. `getChildProductTypes()`, `getPromotionRewards()`, `getPromotionRewardExclusions()`,
//      `getPromotionQualifiers()`, `getPromotionQualifierExclusions()`, `getPriceGroupRates()`,
//      `getAttributeValues()`, `getAttributeSets()` and `getPhysicals()` each return the SAME ARRAY
//      IDENTITY on repeated calls, and a push on the returned reference is visible through a later
//      call. Asserting contents alone would pass against a defensive copy.
//   2. `getProducts()` and `getPriceGroupRateExclusions()` are the two `readonly` collections. Pin
//      that they are NOT handed out live, and pin WHY in the test name, so a future "consistency"
//      change has to argue with the census rather than with a style preference.
//   3. Every collection defaults to `[]` when the constructor omits it - never `undefined`.
//   4. `getProductTypeIDPath()` returns a stored path verbatim, INCLUDING the empty string, and
//      builds one only when the stored value is null/undefined. The empty-string case is the one a
//      truthiness-based implementation gets wrong.
//   5. The built path is ROOT-FIRST and includes this node last: for `root -> mid -> leaf` the leaf
//      answers `rootID,midID,leafID`. Order is what the promotion engine's containment test depends on.
//   6. `getProductTypeIDPath()` memoizes only on the absent branch: a second call after a build
//      returns the built value, and a stored value is never overwritten.
//   7. `preInsert()` and `preUpdate()` both OVERWRITE the path unconditionally, even when one was
//      already stored - the opposite of the accessor's conditional write.
//   8. `preUpdate()` accepts zero arguments AND one argument. Test optionality BEHAVIOURALLY, never
//      via `Function.prototype.length`: TypeScript emits `oldData?` as a plain parameter, so the
//      arity reads 1, not 0.
//   9. One generic `{ preInsert(): void; preUpdate(oldData?): void }` value must accept this class
//      alongside category.ts and priceGroup.ts. That is the whole point of the unified lifecycle
//      contract, and it is worth an explicit assignability test.
//  10. `getBaseProductType()` returns this entity's own `systemCode` WITHOUT consulting the port
//      when the code is non-empty - assert the port is never called on that path.
//  11. `getBaseProductType()` consults the port when `systemCode` is `undefined` AND when it is
//      `''`, and passes the FIRST element of the path. For a path of `''` it passes `''` rather
//      than raising, which is CFML `listFirst('')`.
//  12. `getBaseProductType()` RAISES when the port is absent, and RAISES when the port resolves the
//      root to `undefined` - two distinct messages, both asserted.
//  13. `getParentProductTypeOptions()` drops the candidate whose NAME matches this one's - including
//      a case-DIFFERING match, since CFML `!=` is case-insensitive - and keeps every other,
//      INCLUDING a candidate whose `value` equals this product type's own ID but whose name differs.
//      That last case is the preserved by-name defect and must be asserted positively.
//  14. `getParentProductTypeOptions()` memoizes: the returned array identity is stable, and a later
//      mutation of the candidate array is not reflected.
//  15. `getParentProductTypeOptions()` leaves the candidate array UNMUTATED.
//  16. `setProducts([])` clears the collection and does NOT raise. `setProducts([oneProduct])`
//      RAISES *and* leaves the collection cleared - assert both halves; the clear-then-throw
//      ordering is the defect.
//  17. `getAppliedPriceGroupRateByPriceGroup()`, `addPriceGroupRateExclusion()` and
//      `removePriceGroupRateExclusion()` RAISE on every call. Three separate assertions, three
//      distinct messages.
//  18. `getInheritedAttributeSetAssignments()` RAISES with no port, returns `[]` for an empty port
//      result, and passes non-empty results through unchanged.
//  19. `getSimpleRepresentation()` joins ancestors with the literal seven characters ` &raquo; `
//      and NOT with `»`. Assert the entity form explicitly - this is the assertion that catches a
//      well-meaning "unescape" later.
//  20. `getSimpleRepresentation()` RAISES when this node or any ancestor has no name.
//  21. `setParentProductType()` appends to the parent's LIVE child array, and does so
//      unconditionally when this node is new, and at most once when it is saved.
//  22. `removeParentProductType()` splices the parent's live array by PRIMARY KEY, clears the local
//      reference EVEN WHEN the node was not found, and RAISES when called with no argument on a
//      parentless node.
//  23. All sixteen delegating helpers perform NO local mutation: after `addPromotionReward(stub)`
//      against a stub whose `addProductType` does nothing, this entity's `promotionRewards` is
//      still empty. This is what proves the inverse side is not double-writing.
//  24. `getActiveFlag()` and `getPublishedFlag()` resolve `undefined`, `null`, `0`, `1`, `'0'`,
//      `'1'`, `'true'` and `'false'` exactly as `cfBoolean()` specifies - both columns are
//      undefaulted in the schema, so NULL is a real state.
//  25. `isNew()` is TRUE for `productTypeID: ''` and FALSE otherwise.
//  26. The six `has*` probes match by PRIMARY KEY across two distinct objects representing the same
//      saved row, and fall back to REFERENCE identity when the candidate's key is `''`.
// ---------------------------------------------------------------------------
