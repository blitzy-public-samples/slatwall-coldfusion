// slatwall-ts - ProductType entity.
// Schema contract [model/entity/ProductType.cfc:L49]: table `SwProductType`, ORM entity name
// `SlatwallProductType`; no migration, no rename, no column change.
//
// LEGACY-NOTE [model/entity/ProductType.cfc:L77]: the `physicals` inverse collection declares
// link table `SwPhysicalProductType`. The physical module is out of scope, so the name is
// recorded for schema continuity and never queried.
//
// LEGACY-NOTE [model/entity/ProductType.cfc:L49]: this declaration carries no `accessors="true"`
// and no `output="false"`, diverging from model/entity/Brand.cfc:L49 (which declares both) and
// model/entity/Category.cfc:L49 (which declares `accessors="true"` only).
//
// Why this small entity matters out of proportion to its size: it owns `productTypeIDPath`, the
// 4000-character materialized path [model/entity/ProductType.cfc:L53] that the promotion engine
// walks.
//
// What actually happens, and the residual risk, stated plainly.

import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import { cfFoldKey } from '../../lib/cfml/struct.js';
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
 * data: it owns a lazily-built path accessor [model/entity/ProductType.cfc:L250-L255], two
 * lifecycle hooks [model/entity/ProductType.cfc:L305-L313].
 */
export class ProductType {
  /**
   * The primary key every containment comparison on this class is keyed by.
   */
  private readonly productTypeID: string;

  /**
   * [model/entity/ProductType.cfc:L53] `ormtype="string" length="4000"`.
   */
  private productTypeIDPath: string | null | undefined;

  /**
   * [model/entity/ProductType.cfc:L54] `ormtype="boolean"` carrying the source's own
   * `hint="As A ProductType Get Old, They would be marked as Not Active"` - reproduced verbatim,
   * grammar included.
   *
   * No `default=` in the SOURCE, so SQL NULL is an expected column state and the raw hydrated
   * value is held rather than coerced at construction.
   */
  private activeFlag: CfBooleanInput;

  /**
   * [model/entity/ProductType.cfc:L55] `ormtype="boolean"`, also with no `default=`.
   */
  private publishedFlag: CfBooleanInput;

  /**
   * [model/entity/ProductType.cfc:L56] `ormtype="string" unique="true"` with
   * `hint="This is the name that is used in the URL string"`.
   *
   * `unique="true"` is recorded for schema continuity and is a DATABASE-level guarantee; it is not
   * re-implemented here, and no format validation is added - the source declares none.
   */
  private urlTitle: string | undefined;

  /**
   * [model/entity/ProductType.cfc:L57] `ormtype="string"`, nullable - no `notNull="true"`.
   */
  private productTypeName: string | undefined;

  /**
   * [model/entity/ProductType.cfc:L58] `ormtype="string" length="4000"`.
   */
  private productTypeDescription: string | undefined;

  /**
   * The discriminator the catalog branches on, and the value {@link
   * ProductType.getBaseProductType} resolves.
   *
   * model/validation/ProductType.json enforces `maxLength:0` on `systemCode` in the DELETE
   * context, which means any product type carrying a system code is undeletable.
   */
  private systemCode: string | undefined;

  /**
   * [model/entity/ProductType.cfc:L62]
   * `cfc="ProductType" fieldtype="many-to-one" fkcolumn="parentProductTypeID"` - self-referential.
   *
   * MUTABLE: [model/entity/ProductType.cfc:L150] assigns it and
   * [model/entity/ProductType.cfc:L163] clears it via `structDelete`.
   */
  private parentProductType: ProductType | undefined;

  /**
   * [model/entity/ProductType.cfc:L65]
   * `singularname="childProductType" cfc="ProductType" fieldtype="one-to-many" inverse="true" fkcolumn="parentProductTypeID" cascade="all"`.
   *
   * HANDED out LIVE, because the legacy mutates it in PLACE through the accessor: `arrayAppend` at
   * [model/entity/ProductType.cfc:L152] and `arrayDeleteAt` at [model/entity/ProductType.cfc:L161]
   * both operate on `getChildProductTypes()`.
   */
  private readonly childProductTypes: ProductType[];

  /**
   * [model/entity/ProductType.cfc:L66]
   * `singularname="product" cfc="Product" fieldtype="one-to-many" inverse="true" fkcolumn="productTypeID" lazy="extra" cascade="all"`.
   *
   * LEGACY-NOTE [model/entity/ProductType.cfc:L66]: `products` is declared lazy="extra" in the
   * Hibernate mapping, so the legacy runtime never eagerly loaded it.
   */
  private products: Product[];

  /**
   * [model/entity/ProductType.cfc:L70] `many-to-many` via link table `SwPromoRewardProductType`,
   * `fkcolumn="productTypeID" inversejoincolumn="promotionRewardID" inverse="true"`.
   *
   * Handed out live: the owning side mutates it through the accessor at
   * [model/entity/PromotionReward.cfc:L291] and [model/entity/PromotionReward.cfc:L294].
   */
  private readonly promotionRewards: PromotionReward[];

  /**
   * [model/entity/ProductType.cfc:L71] `type="array"` `many-to-many` via
   * `SwPromoRewardExclProductType`, `inverse="true"`.
   *
   * Handed out live: mutated by the owner at [model/entity/PromotionReward.cfc:L391] and
   * [model/entity/PromotionReward.cfc:L394].
   */
  private readonly promotionRewardExclusions: PromotionReward[];

  /**
   * [model/entity/ProductType.cfc:L72] `many-to-many` via `SwPromoQualProductType`,
   * `inversejoincolumn="promotionQualifierID" inverse="true"`.
   *
   * Handed out live: mutated by the owner at [model/entity/PromotionQualifier.cfc:L233] and
   * [model/entity/PromotionQualifier.cfc:L236].
   */
  private readonly promotionQualifiers: PromotionQualifier[];

  /**
   * [model/entity/ProductType.cfc:L73] `type="array"` `many-to-many` via
   * `SwPromoQualExclProductType`, `inverse="true"`.
   *
   * Handed out live: mutated by the owner at [model/entity/PromotionQualifier.cfc:L333] and
   * [model/entity/PromotionQualifier.cfc:L336].
   */
  private readonly promotionQualifierExclusions: PromotionQualifier[];

  /**
   * [model/entity/ProductType.cfc:L74] `many-to-many` via `SwPriceGroupRateProductType`,
   * `inversejoincolumn="priceGroupRateID" inverse="true"`.
   *
   * Handed out live: mutated by the owner at [model/entity/PriceGroupRate.cfc:L204] and
   * [model/entity/PriceGroupRate.cfc:L211-L214].
   */
  private readonly priceGroupRates: PriceGroupRate[];

  /**
   * [model/entity/ProductType.cfc:L75] `many-to-many` via `SwPriceGrpRateExclProductType`,
   * `inverse="true"`.
   */
  private readonly priceGroupRateExclusions: PriceGroupRate[];

  /**
   * [model/entity/ProductType.cfc:L80] `ormtype="string"` - the integration correlation column.
   */
  private readonly remoteID: string | undefined;

  /**
   * [model/entity/ProductType.cfc:L83] `hb_populateEnabled="false" ormtype="timestamp"`.
   */
  private readonly createdDateTime: Date | undefined;

  /**
   * [model/entity/ProductType.cfc:L84]
   * `hb_populateEnabled="false" cfc="Account" fieldtype="many-to-one" fkcolumn="createdByAccountID"`.
   *
   * `Account` is out of scope, so the association is reduced to its inert persisted foreign-key
   * identifier.
   */
  private readonly createdByAccountID: string | undefined;

  /**
   * [model/entity/ProductType.cfc:L85] `hb_populateEnabled="false" ormtype="timestamp"`.
   */
  private readonly modifiedDateTime: Date | undefined;
  private readonly modifiedByAccountID: string | undefined;

  /**
   * The product-type repository, used by {@link ProductType.getBaseProductType} and by nothing
   * else on this class.
   *
   * This is transformation rule T2 applied to [model/entity/ProductType.cfc:L112]: the embedded
   * `getService("ProductService")` locator becomes a CONSTRUCTOR-INJECTED PORT typed to
   * `src/domain/ports/productTypeRepository.ts`.
   *
   * OPTIONAL, because the overwhelming majority of read paths never ask for a base product type.
   */
  private readonly productTypeRepository: ProductTypeRepository | undefined;

  /**
   * Constructed from a repository row plus its materialized associations, by
   * `src/repositories/mysql/**` and by nothing else.
   *
   * Every collection parameter is OPTIONAL and defaults to `[]`: a Hibernate-managed collection
   * never handed back null.
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

  // Persistent scalar accessors [model/entity/ProductType.cfc:L52-L59, L80, L83-L86]

  /**
   * [model/entity/ProductType.cfc:L52] The primary key. `''` for an unsaved row.
   */
  getProductTypeID(): string {
    return this.productTypeID;
  }
  getActiveFlag(): boolean {
    return cfBoolean(this.activeFlag);
  }

  /**
   * [model/entity/ProductType.cfc:L55] Resolved through `cfBoolean()`, as `activeFlag` is.
   */
  getPublishedFlag(): boolean {
    return cfBoolean(this.publishedFlag);
  }

  /**
   * [model/entity/ProductType.cfc:L56] `unique="true"`, enforced by the database, not by this
   * class.
   */
  getUrlTitle(): string | undefined {
    return this.urlTitle;
  }

  /**
   * Assigns this product type's URL title.
   *
   * an orm-generated setter, authored for the same reason {@link
   * ProductType.setProductTypeIDPath} and {@link ProductType.addProduct} are: it is concretely
   * reached from in-scope code.
   *
   * LEGACY-NOTE: the source accessor is `setURLTitle`, CFML's convention for the property
   * `urlTitle` [model/entity/ProductType.cfc:L56].
   */
  setUrlTitle(urlTitle: string): void {
    this.urlTitle = urlTitle;
  }

  // The remaining orm-generated scalar setters - the `populate` targets.

  /**
   * [model/entity/ProductType.cfc:L57] The ORM-generated `setProductTypeName()`. Populate target.
   */
  setProductTypeName(productTypeName: string): void {
    this.productTypeName = productTypeName;
  }

  /**
   * [model/entity/ProductType.cfc:L58] The ORM-generated `setProductTypeDescription()`.
   */
  setProductTypeDescription(productTypeDescription: string): void {
    this.productTypeDescription = productTypeDescription;
  }

  /**
   * [model/entity/ProductType.cfc:L59] The ORM-generated `setSystemCode()`.
   */
  setSystemCode(systemCode: string): void {
    this.systemCode = systemCode;
  }

  /**
   * [model/entity/ProductType.cfc:L53] The ORM-generated `setActiveFlag()`.
   */
  setActiveFlag(activeFlag: boolean): void {
    this.activeFlag = activeFlag;
  }

  /**
   * [model/entity/ProductType.cfc:L54] The ORM-generated `setPublishedFlag()`.
   */
  setPublishedFlag(publishedFlag: boolean): void {
    this.publishedFlag = publishedFlag;
  }

  /**
   * `string | undefined` and not `string`: model/validation/ProductType.json requires this
   * property in the SAVE context only.
   */
  getProductTypeName(): string | undefined {
    return this.productTypeName;
  }
  getProductTypeDescription(): string | undefined {
    return this.productTypeDescription;
  }

  /**
   * May be `undefined` or the empty string, and both matter: those are precisely the two states
   * that send {@link ProductType.getBaseProductType} down its repository branch
   * [model/entity/ProductType.cfc:L111].
   */
  getSystemCode(): string | undefined {
    return this.systemCode;
  }

  /**
   * LEGACY-NOTE [model/entity/ProductType.cfc:L80]: unlike model/entity/Category.cfc:L73, this
   * `remoteID` declaration carries no `hint`.
   */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * [model/entity/ProductType.cfc:L84] The inert `createdByAccountID` foreign key.
   *
   * Returns the raw identifier and never an `Account`, because `Account` is out of scope.
   */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * [model/entity/ProductType.cfc:L86] The inert `modifiedByAccountID` foreign key.
   */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  /**
   * Whether this row has never been persisted.
   *
   * `isNew()` was a method on the NON-PORTED framework base (org/Hibachi/HibachiEntity.cfc).
   */
  isNew(): boolean {
    return this.productTypeID === '';
  }

  // The error register - the framework's refusal channel.

  /**
   * The accumulated errors, keyed by FOLDED error name and carrying each name's ORIGINAL spelling.
   *
   * Two pieces of state per entry, because a CFML struct carries both.
   */
  private readonly errors = new Map<
    string,
    { readonly name: string; readonly messages: string[] }
  >();

  /**
   * Every error, keyed by error name [org/Hibachi/HibachiTransient.cfc:L30-L32]. Frozen
   * projection.
   */
  getErrors(): Readonly<Record<string, readonly string[]>> {
    const projected: Record<string, readonly string[]> = {};

    for (const entry of this.errors.values()) {
      // `defineProperty` rather than assignment: an error name is server-authored here, but the
      // projection is a plain object and `__proto__` must never be interceptable on one.
      Object.defineProperty(projected, entry.name, {
        value: Object.freeze([...entry.messages]),
        enumerable: true,
        writable: false,
        configurable: false,
      });
    }

    return Object.freeze(projected);
  }

  /**
   * Whether this entity carries any error [org/Hibachi/HibachiTransient.cfc:L47-L53].
   */
  hasErrors(): boolean {
    return this.errors.size > 0;
  }

  /**
   * Whether one named error is present [org/Hibachi/HibachiTransient.cfc:L57-L59].
   */
  hasError(errorName: string): boolean {
    return this.errors.has(cfFoldKey(errorName));
  }

  /**
   * The messages under one name, or an EMPTY ARRAY [org/Hibachi/HibachiTransient.cfc:L34-L43].
   */
  getError(errorName: string): readonly string[] {
    return Object.freeze([...(this.errors.get(cfFoldKey(errorName))?.messages ?? [])]);
  }

  /**
   * Record one error; messages accumulate [org/Hibachi/HibachiTransient.cfc:L61-L64].
   */
  addError(errorName: string, errorMessage: string): void {
    const key = cfFoldKey(errorName);
    const existing = this.errors.get(key);

    if (existing === undefined) {
      this.errors.set(key, { name: errorName, messages: [errorMessage] });
      return;
    }

    existing.messages.push(errorMessage);
  }

  /**
   * Primary-key row identity, the single comparison every containment probe and every helper on
   * this class routes through.
   *
   * Hibernate's collection-contains is session-identity / primary-key based, so the port compares
   * `productTypeID` - never object references and never deep equality.
   */
  private isSameRowAs(candidate: ProductType): boolean {
    const candidateID = candidate.getProductTypeID();
    if (this.productTypeID === '' || candidateID === '') {
      return candidate === this;
    }
    return candidateID === this.productTypeID;
  }

  // Collection accessors [model/entity/ProductType.cfc:L62-L77]
  //
  // Mutability is deliberate and uneven, so it is stated per accessor.

  /**
   * [model/entity/ProductType.cfc:L62] The parent node, or `undefined` at the root.
   *
   * Read by {@link ProductType.getSimpleRepresentation} to recurse and by the path builder to
   * walk.
   */
  getParentProductType(): ProductType | undefined {
    return this.parentProductType;
  }
  getChildProductTypes(): ProductType[] {
    return this.childProductTypes;
  }

  /**
   * Empty unless a repository method explicitly opted into loading it - see the `lazy="extra"`
   * note on the field declaration.
   */
  getProducts(): readonly Product[] {
    return this.products;
  }

  /**
   * RETURNED LIVE: model/entity/PromotionReward.cfc:L291 and:L294 mutate this array through the
   * accessor while adding and removing the link from the owning side.
   */
  getPromotionRewards(): PromotionReward[] {
    return this.promotionRewards;
  }

  /**
   * RETURNED LIVE: mutated by the owner at model/entity/PromotionReward.cfc:L391 and:L394.
   */
  getPromotionRewardExclusions(): PromotionReward[] {
    return this.promotionRewardExclusions;
  }

  /**
   * RETURNED LIVE: mutated by the owner at model/entity/PromotionQualifier.cfc:L233 and:L236.
   */
  getPromotionQualifiers(): PromotionQualifier[] {
    return this.promotionQualifiers;
  }

  /**
   * RETURNED LIVE: mutated by the owner at model/entity/PromotionQualifier.cfc:L333 and:L336.
   */
  getPromotionQualifierExclusions(): PromotionQualifier[] {
    return this.promotionQualifierExclusions;
  }

  /**
   * RETURNED LIVE: mutated by the owner at model/entity/PriceGroupRate.cfc:L204 and:L211-L214.
   */
  getPriceGroupRates(): PriceGroupRate[] {
    return this.priceGroupRates;
  }

  /**
   * LEGACY-NOTE [model/entity/ProductType.cfc:L75]: the five-level price-group cascade
   * [model/service/PriceGroupService.cfc:L140-L181] never consults
   * `PriceGroupRate.excludedProductTypes`, so this link table is written by the admin and then
   * ignored by pricing.
   */
  getPriceGroupRateExclusions(): PriceGroupRate[] {
    return this.priceGroupRateExclusions;
  }

  // The three non-materialized collections [model/entity/ProductType.cfc:L67, L76, L77]
  //
  // Declared in the legacy mapping, deliberately absent from this class.
  //
  // LEGACY-NOTE [model/entity/ProductType.cfc:L77]: model/validation/ProductType.json carries a
  // delete-context `maxCollection:0` rule in this family.

  // ORM-implicit containment probes.

  /**
   * Whether `childProductType` is already among this node's children.
   *
   * Proven reached by [model/entity/ProductType.cfc:L151], the second disjunct of the
   * parent-assignment guard -
   * `if(isNew() or !arguments.parentProductType.hasChildProductType( this ))`.
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
   */
  hasPromotionRewardExclusion(promotionReward: PromotionReward): boolean {
    return this.promotionRewardExclusions.includes(promotionReward);
  }

  /**
   * Whether this product type is already linked to `promotionQualifier` as an INCLUDED product
   * type.
   */
  hasPromotionQualifier(promotionQualifier: PromotionQualifier): boolean {
    return this.promotionQualifiers.includes(promotionQualifier);
  }

  /**
   * Whether this product type is already linked to `promotionQualifier` as an EXCLUDED product
   * type.
   */
  hasPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): boolean {
    return this.promotionQualifierExclusions.includes(promotionQualifier);
  }

  /**
   * Whether this product type is already linked to `priceGroupRate` as an INCLUDED product type.
   *
   * The four link probes above and this one compare by REFERENCE rather than by primary key, which
   * is the one deliberate asymmetry with {@link ProductType.hasChildProductType}.
   */
  hasPriceGroupRate(priceGroupRate: PriceGroupRate): boolean {
    return this.priceGroupRates.includes(priceGroupRate);
  }

  // OMITTED [model/entity/ProductType.cfc:L92-L99] - getInheritedAttributeSetAssignments()
  //
  // TODO carry-forward, per the TODO directive.
  //
  // TODO [model/entity/ProductType.cfc:L93]: Todo get by all the parent productTypeIDs.

  /**
   * Replace this product type's product collection wholesale
   * [model/entity/ProductType.cfc:L101-L107].
   *
   * The source's own comment - `// first, clear existing collection` - is preserved at the line it
   * annotates below.
   *
   * LEGACY-NOTE [model/entity/ProductType.cfc:L101, L103]: the parameter is declared with a
   * CAPITAL `P` (`required array Products`) and the clear target is the equally capitalized
   * `variables.Products`.
   */
  setProducts(products: readonly Product[]): void {
    // First, clear existing collection.
    this.products = [];
    for (const product of products) {
      this.addProduct(product);
    }
  }

  /**
   * Add one product to this product type's in-memory collection.
   *
   * LEGACY-NOTE [model/entity/ProductType.cfc:L101-L107, L66]: `addProduct()` is not declared
   * anywhere in ProductType.cfc - the bidirectional helper block
   * [model/entity/ProductType.cfc:L146-L245] covers parentProductType, childProductTypes,
   * promotionRewards, promotionRewardExclusions, promotionQualifiers,
   * promotionQualifierExclusions, priceGroupRates.
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
   * `remove<SingularName>` accessor for `singularname="product"`
   * [model/entity/ProductType.cfc:L66] rather than a hand-written helper.
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
  /**
   * Resolve the base - "merchandise type" - system code for this product type
   * [model/entity/ProductType.cfc:L109-L115].
   *
   * The source's own comment `//get merchandisetype` is preserved verbatim immediately above this
   * documentation block, at the position it occupies in the source.
   *
   * @throws when the product-type repository was not wired, or when the root row named by the
   * stored path cannot be loaded - the preserved [model/entity/ProductType.cfc:L112] failure.
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
   * Resolve the price-group rate that applies to this product type - except that it cannot.
   *
   * LEGACY-DEFECT [model/entity/ProductType.cfc:L117-L119]: the call names its argument `product`
   * while `getRateForProductTypeBasedOnPriceGroup` requires `productType`
   * [model/service/PriceGroupService.cfc:L57], so CFML raises a missing-required-argument error
   * before the service body runs. Authored as a throwing stub rather than repaired: repairing it
   * would turn a method that always fails into one that returns a rate.
   * Preserved deliberately; do not fix without a product decision.
   *
   * @param priceGroup retained for interface parity; the body cannot reach it.
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

  // OMITTED [model/entity/ProductType.cfc:L122-L142] - getParentProductTypeOptions( string
  // baseProductType="" )
  //
  // Three further facts about the omitted body, recorded so nothing is lost with it.

  // [model/entity/ProductType.cfc:L146] opens this banner run and
  // [model/entity/ProductType.cfc:L246] closes it.

  /**
   * Attach this product type to a parent [model/entity/ProductType.cfc:L149-L153].
   *
   * STRUCTURALLY IDENTICAL to model/entity/Category.cfc:L101-L108, and the precedents established
   * in src/domain/entities/category.ts are applied verbatim.
   *
   * First, so an unsaved product type is appended without any containment check - which means
   * calling this twice with the same parent while unsaved appends this node twice.
   */
  setParentProductType(parentProductType: ProductType): void {
    // CFML parity [model/entity/ProductType.cfc:L149-L153]: the legacy body validates nothing
    // before assigning, and neither does this one. A cyclic parent chain is accepted here exactly
    // as it is accepted there.
    this.parentProductType = parentProductType;
    if (this.isNew() || !parentProductType.hasChildProductType(this)) {
      parentProductType.getChildProductTypes().push(this);
    }
  }

  /**
   * Detach this product type from a parent [model/entity/ProductType.cfc:L155-L164].
   *
   * The argument is optional - note `any parentProductType` at [model/entity/ProductType.cfc:L155]
   * with no `required`.
   *
   * @throws when no argument is passed and this product type has no parent - the preserved
   * [model/entity/ProductType.cfc:L159] null dereference.
   */
  removeParentProductType(parentProductType?: ProductType): void {
    // [model/entity/ProductType.cfc:L156-L158] reproduce
    // `structKeyExists(arguments, "parentProductType")`: the test is whether an argument was
    // supplied, not whether it is truthy.
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

    // [model/entity/ProductType.cfc:L159-L162] the far side. `arrayFind` is 1-based and reports
    // absence as 0; `findIndex` is 0-based and reports absence as -1, so the guard is `!== -1` and
    // not `> 0`.
    const siblings: ProductType[] = resolvedParent.getChildProductTypes();
    const index: number = siblings.findIndex((child) => this.isSameRowAs(child));
    if (index !== -1) {
      siblings.splice(index, 1);
    }

    // [model/entity/ProductType.cfc:L163] `structDelete` is UNCONDITIONAL - outside the guard
    // above, exactly as written.
    this.parentProductType = undefined;
  }

  /**
   * Adopt `childProductType` as a child of this product type
   * [model/entity/ProductType.cfc:L167-L169].
   *
   * A pure delegation to the child's own {@link ProductType.setParentProductType}, so the guarded
   * append and the near-side assignment happen in exactly one place.
   *
   * LEGACY-NOTE [model/entity/ProductType.cfc:L167, L170]: declared as addchildProductType /
   * removechildProductType with a lowercase 'c', and with a capital-C 'ChildProductType' argument.
   */
  addChildProductType(childProductType: ProductType): void {
    childProductType.setParentProductType(this);
  }

  /**
   * The exact source spelling of {@link ProductType.addChildProductType}, lowercase `c`
   * [model/entity/ProductType.cfc:L167].
   *
   * An alias, not a second implementation, and that distinction is the whole design.
   *
   * Why it exists at all, since CFML would not have needed it.
   *
   * @param childProductType the product type to adopt.
   */
  addchildProductType(childProductType: ProductType): void {
    this.addChildProductType(childProductType);
  }

  /**
   * Release `childProductType` from this product type [model/entity/ProductType.cfc:L170-L172].
   */
  removeChildProductType(childProductType: ProductType): void {
    childProductType.removeParentProductType(this);
  }

  /**
   * The exact source spelling of {@link ProductType.removeChildProductType}, lowercase `c`
   * [model/entity/ProductType.cfc:L170].
   *
   * An alias on exactly the terms recorded on {@link ProductType.addchildProductType}: one
   * delegation, no second implementation.
   *
   * @param childProductType the product type to release.
   */
  removechildProductType(childProductType: ProductType): void {
    this.removeChildProductType(childProductType);
  }

  /**
   * Link this product type to `promotionReward` as an INCLUDED product type
   * [model/entity/ProductType.cfc:L175-L177].
   *
   * The inverse side delegates to the owner, and every one of the twelve helpers below follows
   * that one rule.
   */
  addPromotionReward(promotionReward: PromotionReward): void {
    promotionReward.addProductType(this);
  }

  /**
   * Unlink this product type from `promotionReward`'s INCLUDED product types
   * [model/entity/ProductType.cfc:L178-L180] - delegating to `removeProductType` on the owner.
   *
   * Verified not inverted: the body calls `removeProductType`, not an `add*`.
   */
  removePromotionReward(promotionReward: PromotionReward): void {
    promotionReward.removeProductType(this);
  }

  /**
   * Link this product type to `promotionReward` as an EXCLUDED product type
   * [model/entity/ProductType.cfc:L183-L185] - delegating to `addExcludedProductType` on the
   * owner.
   */
  addPromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.addExcludedProductType(this);
  }

  /**
   * Unlink this product type from `promotionReward`'s EXCLUDED product types
   * [model/entity/ProductType.cfc:L186-L188].
   */
  removePromotionRewardExclusion(promotionReward: PromotionReward): void {
    promotionReward.removeExcludedProductType(this);
  }

  /**
   * Link this product type to `promotionQualifier` as an INCLUDED product type
   * [model/entity/ProductType.cfc:L191-L193] - delegating to the owner.
   */
  addPromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addProductType(this);
  }

  /**
   * Unlink this product type from `promotionQualifier`'s INCLUDED product types
   * [model/entity/ProductType.cfc:L194-L196]. Verified not inverted.
   */
  removePromotionQualifier(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeProductType(this);
  }

  /**
   * Link this product type to `promotionQualifier` as an EXCLUDED product type
   * [model/entity/ProductType.cfc:L199-L201] - `SwPromoQualExclProductType`
   * [model/entity/ProductType.cfc:L73].
   */
  addPromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.addExcludedProductType(this);
  }

  /**
   * Unlink this product type from `promotionQualifier`'s EXCLUDED product types
   * [model/entity/ProductType.cfc:L202-L204].
   *
   * Verified not inverted - the second shape that is inverted on a sibling:
   * model/entity/Option.cfc:L145-L147 calls `addExcludedOption(this)` here.
   */
  removePromotionQualifierExclusion(promotionQualifier: PromotionQualifier): void {
    promotionQualifier.removeExcludedProductType(this);
  }

  /**
   * Link this product type to `priceGroupRate` as an INCLUDED product type
   * [model/entity/ProductType.cfc:L207-L209] - delegating to
   * model/entity/PriceGroupRate.cfc:L199-L206.
   */
  addPriceGroupRate(priceGroupRate: PriceGroupRate): void {
    priceGroupRate.addProductType(this);
  }

  /**
   * Unlink this product type from `priceGroupRate`'s INCLUDED product types
   * [model/entity/ProductType.cfc:L210-L212] - delegating to
   * model/entity/PriceGroupRate.cfc:L207-L216. Verified not inverted.
   */
  removePriceGroupRate(priceGroupRate: PriceGroupRate): void {
    priceGroupRate.removeProductType(this);
  }

  /**
   * Link this product type to `priceGroupRate` as an EXCLUDED product type
   * [model/entity/ProductType.cfc:L215-L217].
   *
   * LEGACY-NOTE [model/entity/ProductType.cfc:L215-L220, model/entity/PriceGroupRate.cfc:L75]:
   * this is the one pair in this block whose far side has no hand-written counterpart.
   * model/entity/PriceGroupRate.cfc hand-writes helpers for its three INCLUDED collections only -
   * `addProductType` / `removeProductType` at L199 / L207 among them.
   */
  addPriceGroupRateExclusion(priceGroupRate: PriceGroupRate): void {
    if (!this.priceGroupRateExclusions.includes(priceGroupRate)) {
      this.priceGroupRateExclusions.push(priceGroupRate);
    }
  }

  /**
   * Unlink this product type from `priceGroupRate`'s EXCLUDED product types
   * [model/entity/ProductType.cfc:L218-L220].
   */
  removePriceGroupRateExclusion(priceGroupRate: PriceGroupRate): void {
    const index: number = this.priceGroupRateExclusions.indexOf(priceGroupRate);
    if (index !== -1) {
      this.priceGroupRateExclusions.splice(index, 1);
    }
  }

  // DROPPED bidirectional helpers [model/entity/ProductType.cfc:L223-L244]
  //
  // All six were included in the eleven-helper inversion cross-check before being dropped.

  // [model/entity/ProductType.cfc:L248] opens this banner run and
  // [model/entity/ProductType.cfc:L257] closes it.
  //
  // Secondary register item: the opening banner reads "START: Get Formatted Method*Implecet*" -
  // "Implecet" is a misspelling of "Implicit".

  /**
   * Route a of the materialized path - the lazy memoizing read
   * [model/entity/ProductType.cfc:L250-L255].
   *
   * The GUARD is `isNull(...)` and not `structKeyExists(...)`, which is worth naming precisely
   * because the two are not interchangeable: `isNull` treats a persisted-but-NULL column exactly
   * like an absent one.
   *
   * It MEMOIZES, so the first call after an absent read writes the field and every later call is a
   * plain field read.
   */
  getProductTypeIDPath(): string {
    // `resolveIdPath` is the shared "stored, or rebuilt" reconciliation used by every path-bearing
    // entity in this folder.
    const resolvedIdPath: string = resolveIdPath(this.productTypeIDPath, () =>
      this.buildProductTypeIDPathList(),
    );

    // [model/entity/ProductType.cfc:L252] the memo, written only on the absent branch, exactly as
    // the source guards it.
    if (isNullish(this.productTypeIDPath)) {
      this.productTypeIDPath = resolvedIdPath;
    }

    // [model/entity/ProductType.cfc:L254] the field is now guaranteed present, so this is the
    // field's value.
    return resolvedIdPath;
  }

  /**
   * Route b of the materialized path - the eager write [model/entity/ProductType.cfc:L306, L311].
   *
   * Both lifecycle hooks call `setProductTypeIDPath( buildIDPathList( "parentProductType" ) )`,
   * which BYPASSES the lazy getter entirely and overwrites the field unconditionally.
   *
   * @param productTypeIDPath the path to store.
   */
  setProductTypeIDPath(productTypeIDPath: string | null | undefined): void {
    this.productTypeIDPath = productTypeIDPath;
  }

  /**
   * Rebuild this node's comma-delimited, root-first identifier path by climbing
   * `parentProductType`.
   *
   * The single implementation of `buildIDPathList( "parentProductType" )` for this class, shared
   * by both routes - the lazy getter [model/entity/ProductType.cfc:L252] and the hooks
   * [model/entity/ProductType.cfc:L306, L311] - so the two can never drift.
   */
  private buildProductTypeIDPathList(): string {
    return buildIdPathList<ProductType>(
      this,
      (node) => node.getProductTypeID(),
      (node) => node.getParentProductType(),
    );
  }

  // [model/entity/ProductType.cfc:L259] opens this banner run and
  // [model/entity/ProductType.cfc:L269] closes it.

  // [model/entity/ProductType.cfc:L271] opens this banner run and
  // [model/entity/ProductType.cfc:L301] closes it.

  /**
   * The human-readable, breadcrumbed name of this product type
   * [model/entity/ProductType.cfc:L273-L278].
   *
   * RECURSIVE up the PARENT CHAIN, and
   * LEGACY-NOTE: an unbounded parent chain - or a cycle - recurses without limit and exhausts the
   * stack. No depth guard, no cycle detector and no memo is added.
   */
  getSimpleRepresentation(): string | undefined {
    const parentProductType: ProductType | undefined = this.getParentProductType();
    if (parentProductType !== undefined) {
      // [model/entity/ProductType.cfc:L275] The separator is byte-identical to the source, HTML
      // entity and both spaces included.
      return `${parentProductType.getSimpleRepresentation() ?? ''} &raquo; ${
        this.getProductTypeName() ?? ''
      }`;
    }

    // [model/entity/ProductType.cfc:L277] the terminal branch, which is where the nullable return
    // originates.
    return this.getProductTypeName();
  }

  // Omitted [model/entity/ProductType.cfc:L280-L299] - getAssignedAttributeSetSmartList()
  //
  // Omitted for two independent reasons, either of which suffices.
  //
  // Second, it is an override of the intermediate base class model/entity/HibachiEntity.cfc, on
  // the non-ported eav / attribute path.

  // [model/entity/ProductType.cfc:L303] opens this banner run and
  // [model/entity/ProductType.cfc:L315] closes it.
  //
  // Hibernate to fire them, so they are explicit maintenance methods invoked by
  // `src/repositories/mysql/**` immediately before the corresponding write.

  /**
   * Pre-insert maintenance [model/entity/ProductType.cfc:L305-L308].
   *
   * LEGACY-NOTE [model/entity/ProductType.cfc:L305-L313]: path is assigned before the super call,
   * matching model/entity/PriceGroup.cfc:L207-L208 and OPPOSITE to
   * model/entity/Category.cfc:L126-L129 (which calls super first).
   *
   * The ordering is observable wherever the framework's own pre-insert work reads entity state, so
   * "they both end up doing the same two things" is not a reason to align them.
   */
  preInsert(): void {
    // [model/entity/ProductType.cfc:L306] path FIRST. [model/entity/ProductType.cfc:L307]
    // `super.preInsert()` is the audit stamping the repository now performs after this returns,
    // preserving the source's ordering across the seam.
    this.setProductTypeIDPath(this.buildProductTypeIDPathList());
  }

  /**
   * Pre-update maintenance [model/entity/ProductType.cfc:L310-L313].
   *
   * PATH-FIRST, then SUPER - the same ordering as {@link ProductType.preInsert}; see the note
   * there.
   *
   * `oldData` is the CFML `struct oldData` PARAMETER, carried forward so the prior row reaches the
   * maintenance boundary as a typed argument rather than as ambient state.
   */
  preUpdate(oldData?: Readonly<Record<string, unknown>>): void {
    // [model/entity/ProductType.cfc:L311] path FIRST, then [model/entity/ProductType.cfc:L312] the
    // audit stamping the repository performs after this returns.
    this.setProductTypeIDPath(this.buildProductTypeIDPathList());
  }
}

// What the net-new test tier has to pin.
