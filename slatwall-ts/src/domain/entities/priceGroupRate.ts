// slatwall-ts - PriceGroupRate entity.
// Schema contract [model/entity/PriceGroupRate.cfc:L49]: table `SwPriceGroupRate`, ORM entity name `SlatwallPriceGroupRate`; no migration,
// no rename, no column change.
//
// LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L49]: the three boolean attributes are written
// UNQUOTED - `persistent=true output=false accessors=true` - whereas model/entity/Brand.cfc:L49
// and model/entity/Category.cfc:L49 quote the same three.
//
// LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L49]: `hb_serviceName="priceGroupService"` is
// SHARED with model/entity/PriceGroup.cfc:L49 - both entities resolve to the one real
// model/service/PriceGroupService.cfc.
//
// Everything else recorded in this file is a
// LEGACY-NOTE: an architecture consequence, a preserved cosmetic wart, or a preserved
// identifier/casing wart.

import { listAppend, listLen } from '../../lib/cfml/list.js';
import { cfNumberToString, numberFormat } from '../../lib/cfml/numberFormat.js';
import { cfEquals, cfFoldKey } from '../../lib/cfml/struct.js';
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import { cfBoolean, cfLen, isNullish } from '../../lib/cfml/truthiness.js';
import type { Money } from '../valueObjects/money.js';
import type { PriceGroup } from './priceGroup.js';
import type { Product } from './product.js';
import type { ProductType } from './productType.js';
import type { RoundingRule } from './roundingRule.js';
import type { Sku } from './sku.js';

/**
 * The three values the persisted `amountType` column [model/entity/PriceGroupRate.cfc:L55] is
 * allowed to hold, published verbatim by `getAmountTypeOptions()`
 * [model/entity/PriceGroupRate.cfc:L87-L93].
 */
export type PriceGroupRateAmountType = 'percentageOff' | 'amountOff' | 'amount';

/**
 * One row of `getAmountTypeOptions()` [model/entity/PriceGroupRate.cfc:L87-L93].
 *
 * A `type` alias rather than an `interface`, and that is load-bearing rather than stylistic: an
 * `interface` is not assignable to `Readonly<Record<string, unknown>>` (TS2322) because it has no
 * implicit index signature.
 *
 * The two keys are the framework's own `name`/`value` option pair, reproduced verbatim.
 */
type AmountTypeOption = {
  readonly name: string;
  readonly value: PriceGroupRateAmountType;
};

/**
 * LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L107]: `rbKey(...)` is a non-ported org/Hibachi/**
 * framework helper that resolves an identifier against a JavaRB resource bundle.
 *
 * Named rather than inlined so the one place the key is written is also the place its provenance
 * is recorded.
 */
const APPLIES_TO_ALL_PRODUCTS_RB_KEY = 'admin.pricegroup.edit.priceGroupRateAppliesToAllProducts';

/**
 * A single price-group rate - the leaf the price-group resolution cascade resolves to, and the
 * carrier of the `amount` / `amountType` / `roundingRule` triple the pricing switch reads.
 *
 * A class rather than an interface, because the legacy entity carries behaviour and not merely
 * data: `getAppliesTo()` alone is eighty lines of string assembly
 * [model/entity/PriceGroupRate.cfc:L95-L174].
 */
export class PriceGroupRate {
  // LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L52-L55, L58, L61, L63]: the `ormType` /
  // `ormtype` casing is inconsistent within this one component.

  /**
   * The primary key, and the comparison basis for every containment predicate on the far side of
   * this entity's four bidirectional pairs.
   */
  private readonly priceGroupRateID: string;

  /**
   * [model/entity/PriceGroupRate.cfc:L53] `ormType="boolean" default="false"`.
   *
   * Typed `CfBooleanInput` and resolved through `cfBoolean()`, despite the `default="false"`.
   *
   * The value is the price-group cascade's global fallback selector: `getGlobalPriceGroupRate()`
   * [model/entity/PriceGroup.cfc:L83-L90] scans a price group's rates for the one whose flag is
   * set.
   */
  private globalFlag: CfBooleanInput;

  /**
   * [model/entity/PriceGroupRate.cfc:L54] `ormType="big_decimal" hb_formatType="custom"`.
   *
   * This column declares no `default=`, and that is load-bearing.
   *
   * `hb_formatType="custom"` is precisely why `getAmountFormatted()` exists at
   * [model/entity/PriceGroupRate.cfc:L262] - it is the framework's custom-format hook.
   */
  private amount: Money | undefined;

  /**
   * [model/entity/PriceGroupRate.cfc:L55] `ormType="string" hb_formFieldType="select"`, no
   * default.
   */
  private amountType: PriceGroupRateAmountType | undefined;

  /**
   * A column the parent does not carry: `model/entity/PriceGroup.cfc` declares no `remoteID` while
   * `PriceGroupRate` does.
   */
  private remoteID: string | undefined;

  // All four declare `hb_populateEnabled="false"`, recorded here as inert metadata: population
  // control is a framework concern.

  /**
   * [model/entity/PriceGroupRate.cfc:L61] `hb_populateEnabled="false" ormtype="timestamp"`.
   */
  private readonly createdDateTime: Date | undefined;

  /**
   * `Account` is out of scope, so this many-to-one is reduced to its inert foreign-key column.
   */
  private readonly createdByAccountID: string | undefined;

  /**
   * [model/entity/PriceGroupRate.cfc:L63] `hb_populateEnabled="false" ormtype="timestamp"`.
   */
  private readonly modifiedDateTime: Date | undefined;

  /**
   * Same inert foreign-key treatment as `createdByAccountID` above, for the same reason.
   */
  private readonly modifiedByAccountID: string | undefined;

  // Neither declares `hb_cascadeCalculate`, so no calculated-property cascade is triggered from
  // this entity.

  /**
   * [model/entity/PriceGroupRate.cfc:L67]
   * `cfc="PriceGroup" fieldtype="many-to-one" fkcolumn="priceGroupID"` - and note it carries no
   * `hb_optionsNullRBKey`, unlike its sibling below.
   *
   * MUTABLE, uniquely among this entity's fields: `setPriceGroup` assigns it
   * [model/entity/PriceGroupRate.cfc:L182] and `removePriceGroup` clears it
   * [model/entity/PriceGroupRate.cfc:L195].
   */
  private priceGroup: PriceGroup | undefined;

  /**
   * [model/entity/PriceGroupRate.cfc:L68]
   * `cfc="RoundingRule" fieldtype="many-to-one" fkcolumn="roundingRuleID" hb_optionsNullRBKey="define.none"`.
   *
   * `hb_optionsNullRBKey="define.none"` - preserved verbatim as inert metadata - makes the
   * framework PREPEND a blank `{value:'', name:<resolved "define.none">}` row to this property's
   * option list.
   */
  private roundingRule: RoundingRule | undefined;

  // All six use `fkcolumn="priceGroupRateID"`; the inversejoincolumn is `productTypeID`,
  // `productID` or `skuID`.

  /**
   * HANDED out LIVE: mutated in place by this class's own helpers at
   * [model/entity/PriceGroupRate.cfc:L201] and [model/entity/PriceGroupRate.cfc:L208-L210].
   */
  private readonly productTypes: ProductType[];

  /**
   * [model/entity/PriceGroupRate.cfc:L72]
   * `singularname="product" cfc="Product" fieldtype="many-to-many" linktable="SwPriceGroupRateProduct" fkcolumn="priceGroupRateID" inversejoincolumn="productID"`.
   *
   * Handed out live: mutated in place at [model/entity/PriceGroupRate.cfc:L221] and
   * [model/entity/PriceGroupRate.cfc:L228-L230].
   */
  private readonly products: Product[];

  /**
   * [model/entity/PriceGroupRate.cfc:L73]
   * `singularname="sku" cfc="Sku" fieldtype="many-to-many" linktable="SwPriceGroupRateSku" fkcolumn="priceGroupRateID" inversejoincolumn="skuID"`.
   *
   * Handed out live: mutated in place at [model/entity/PriceGroupRate.cfc:L241] and
   * [model/entity/PriceGroupRate.cfc:L248-L250].
   */
  private readonly skus: Sku[];

  /**
   * LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L75]: this link table's name is abbreviated -
   * `SwPriceGrpRateExclProductType`, with `PriceGrp` rather than `PriceGroup` - while all five of
   * its siblings spell it out in full.
   */
  // The gap is only reachable on a non-global rate, which narrows it without excusing it:
  // [model/service/PriceGroupService.cfc:L436-L443] empties all three exclusion collections -
  // along with all three inclusion collections.
  private readonly excludedProductTypes: ProductType[];

  /**
   * [model/entity/PriceGroupRate.cfc:L76]
   * `singularname="excludedProduct" cfc="Product" fieldtype="many-to-many" linktable="SwPriceGroupRateExclProduct" fkcolumn="priceGroupRateID" inversejoincolumn="productID"`.
   *
   * Carries the same cascade-never-consults-it and no-bidirectional-helper gap flag as
   * `excludedProductTypes` above [model/entity/PriceGroupRate.cfc:L75-L77].
   */
  private readonly excludedProducts: Product[];

  /**
   * [model/entity/PriceGroupRate.cfc:L77]
   * `singularname="excludedSku" cfc="Sku" fieldtype="many-to-many" linktable="SwPriceGroupRateExclSku" fkcolumn="priceGroupRateID" inversejoincolumn="skuID"`.
   *
   * Carries the same cascade-never-consults-it and no-bidirectional-helper gap flag as
   * `excludedProductTypes` above [model/entity/PriceGroupRate.cfc:L75-L77].
   */
  private readonly excludedSkus: Sku[];

  // LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L80]: `amountTypeOptions` declares no `type=`
  // attribute, unlike its two siblings on L81 and L82 which both declare `type="string"`.

  /**
   * Constructed from a repository row plus its materialized associations.
   *
   * Every collection parameter is OPTIONAL and defaults to `[]`, because a Hibernate-managed
   * collection never handed back null.
   *
   * No collaborator port is injected, because the legacy component has zero `getService(` sites.
   */
  constructor(init: {
    readonly priceGroupRateID: string;
    readonly globalFlag?: CfBooleanInput;
    readonly amount?: Money | undefined;
    readonly amountType?: PriceGroupRateAmountType | undefined;
    readonly remoteID?: string | undefined;
    readonly createdDateTime?: Date | undefined;
    readonly createdByAccountID?: string | undefined;
    readonly modifiedDateTime?: Date | undefined;
    readonly modifiedByAccountID?: string | undefined;
    readonly priceGroup?: PriceGroup | undefined;
    readonly roundingRule?: RoundingRule | undefined;
    readonly productTypes?: ProductType[] | undefined;
    readonly products?: Product[] | undefined;
    readonly skus?: Sku[] | undefined;
    readonly excludedProductTypes?: ProductType[] | undefined;
    readonly excludedProducts?: Product[] | undefined;
    readonly excludedSkus?: Sku[] | undefined;
  }) {
    this.priceGroupRateID = init.priceGroupRateID;
    this.globalFlag = init.globalFlag;
    this.amount = init.amount;
    this.amountType = init.amountType;
    this.remoteID = init.remoteID;
    this.createdDateTime = init.createdDateTime;
    this.createdByAccountID = init.createdByAccountID;
    this.modifiedDateTime = init.modifiedDateTime;
    this.modifiedByAccountID = init.modifiedByAccountID;
    this.priceGroup = init.priceGroup;
    this.roundingRule = init.roundingRule;
    this.productTypes = init.productTypes ?? [];
    this.products = init.products ?? [];
    this.skus = init.skus ?? [];
    this.excludedProductTypes = init.excludedProductTypes ?? [];
    this.excludedProducts = init.excludedProducts ?? [];
    this.excludedSkus = init.excludedSkus ?? [];
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L52] the `uuid` primary key; `''` while unsaved.
   */
  getPriceGroupRateID(): string {
    return this.priceGroupRateID;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L53] the cascade's global fallback selector.
   *
   * Resolved through `cfBoolean()` rather than through a bare `??` or `Boolean()` - see the field
   * doc for why a `default="false"` is not a guarantee about the rows already in the table.
   */
  getGlobalFlag(): boolean {
    return cfBoolean(this.globalFlag);
  }

  /**
   * `undefined` for a NULL column, and that is load-bearing rather than incidental: the column
   * declares no `default=`, and substituting `0` would hand the pricing switch
   * [model/service/PriceGroupService.cfc:L321-L336] a zero discount.
   */
  getAmount(): Money | undefined {
    return this.amount;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L55] one of the three published values, or `undefined`.
   */
  getAmountType(): PriceGroupRateAmountType | undefined {
    return this.amountType;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L58] the inert integration correlation column.
   */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L61] an absolute instant; UTC policy per the field doc.
   */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L62] the inert `Account` foreign key, never an entity.
   */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L63] an absolute instant; UTC policy per the field doc.
   */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L64] the inert `Account` foreign key, never an entity.
   */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L67] the parent price group, or `undefined` for an unattached
   * or unjoined rate. `getDisplayName()` dereferences this without a guard - see that method.
   */
  getPriceGroup(): PriceGroup | undefined {
    return this.priceGroup;
  }
  getRoundingRule(): RoundingRule | undefined {
    return this.roundingRule;
  }

  // the three include
  // collections are handed out live and the three exclude collections are handed out readonly.

  /**
   * [model/entity/PriceGroupRate.cfc:L71] the LIVE included-product-type array.
   */
  getProductTypes(): ProductType[] {
    return this.productTypes;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L72] the LIVE included-product array.
   */
  getProducts(): Product[] {
    return this.products;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L73] the live included-SKU array.
   */
  getSkus(): Sku[] {
    return this.skus;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L75] the materialized excluded-product-type array, readonly.
   *
   * Read by `getAppliesTo()` below and by nothing else in the in-scope slice - the price-group
   * cascade never consults it, and no helper on this class can populate it.
   */
  getExcludedProductTypes(): readonly ProductType[] {
    return this.excludedProductTypes;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L76] readonly; same gap flag as `getExcludedProductTypes()`.
   */
  getExcludedProducts(): readonly Product[] {
    return this.excludedProducts;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L77] readonly; same gap flag as `getExcludedProductTypes()`.
   */
  getExcludedSkus(): readonly Sku[] {
    return this.excludedSkus;
  }

  // None of the four
  // members below has a hand-written legacy body.
  //
  // The containment probes compare by primary key - `productTypeID`, `productID`, `skuID` - never
  // by object reference and never by deep equality.

  /**
   * Whether `productType` is already among this rate's included product types.
   * [org/Hibachi/HibachiEntity.cfc:L507-L565], called from [model/entity/PriceGroupRate.cfc:L200].
   */
  hasProductType(productType: ProductType): boolean {
    const candidateProductTypeID: string = productType.getProductTypeID();

    return this.productTypes.some(
      (held: ProductType) => held.getProductTypeID() === candidateProductTypeID,
    );
  }

  /**
   * Whether `product` is already among this rate's included products.
   * [org/Hibachi/HibachiEntity.cfc:L507-L565], called from [model/entity/PriceGroupRate.cfc:L220].
   */
  hasProduct(product: Product): boolean {
    const candidateProductID: string = product.getProductID();

    return this.products.some((held: Product) => held.getProductID() === candidateProductID);
  }

  /**
   * Whether `sku` is already among this rate's included SKUs.
   * [org/Hibachi/HibachiEntity.cfc:L507-L565], called from [model/entity/PriceGroupRate.cfc:L240].
   */
  hasSku(sku: Sku): boolean {
    const candidateSkuID: string = sku.getSkuID();

    return this.skus.some((held: Sku) => held.getSkuID() === candidateSkuID);
  }

  /**
   * Whether this rate has never been persisted.
   *
   * [org/Hibachi/HibachiEntity.cfc:L707-L709] `isNew()` returns `getNewFlag()`, and
   * [org/Hibachi/HibachiEntity.cfc:L571-L576] `getNewFlag()` returns `getPrimaryIDValue() == ""`.
   *
   * The persisted-state flag is therefore the primary key itself, supplied by the repository at
   * hydration: a row read from `SwPriceGroupRate` carries its `uuid`.
   */
  isNew(): boolean {
    return this.priceGroupRateID === '';
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

  //
  // None of the eight members below has a hand-written legacy body, exactly like the four in the
  // region above.
  //
  // None of the six maintains a far side - exactly as a generated CFML setter does not, and in
  // deliberate contrast with the `remove*` helpers above, which do.

  /**
   * Replaces the rate amount.
   *
   * The population half of [model/service/PriceGroupService.cfc:L404]'s
   * `super.save(entity=, data=)`: [org/Hibachi/HibachiService.cfc:L143-L146] populates the entity
   * from the submitted payload before validating it, and `amount`
   * [model/entity/PriceGroupRate.cfc:L54] declares no `hb_populateEnabled="false"`.
   */
  setAmount(amount: Money | undefined): void {
    this.amount = amount;
  }

  /**
   * Sets or clears the global flag.
   *
   * [model/service/PriceGroupService.cfc:L429-L431]: when the rate just saved is global, every
   * other rate on the same price group is demoted with `rates[i].setGlobalFlag(false)`.
   *
   * The parameter is `boolean` while the field is {@link CfBooleanInput}, and the widening is
   * deliberate: a value arriving from a caller has already been decided.
   */
  setGlobalFlag(globalFlag: boolean): void {
    this.globalFlag = globalFlag;
  }

  // The remaining orm-generated scalar setters - the `populate` targets.
  //
  // The SET is four SCALARS PLUS one ASSOCIATION, taken from the entity's own metadata rather than
  // chosen: `globalFlag` [model/entity/PriceGroupRate.cfc:L53] (setter above, because the
  // reconciliation block also writes it).

  /**
   * [model/entity/PriceGroupRate.cfc:L55] The ORM-generated `setAmountType()`. Populate target.
   *
   * It is the property the save context requires, so without this setter no payload could produce
   * a valid new rate.
   */
  setAmountType(amountType: PriceGroupRateAmountType): void {
    this.amountType = amountType;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L58] The ORM-generated `setRemoteID()`. Populate target.
   */
  setRemoteID(remoteID: string): void {
    this.remoteID = remoteID;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L68] The ORM-generated `setRoundingRule()`. Populate target.
   *
   * It takes the resolved entity, not an identifier, and `undefined` clears it.
   *
   * CLEARING is EXPRESSIBLE because the legacy makes it so: the property declares
   * `hb_optionsNullRBKey="define.none"` [model/entity/PriceGroupRate.cfc:L68], which is the admin
   * form's "no rounding rule" option.
   */
  setRoundingRule(roundingRule: RoundingRule | undefined): void {
    this.roundingRule = roundingRule;
  }

  /**
   * [model/service/PriceGroupService.cfc:L438] replaces the included-product-type collection.
   */
  setProductTypes(productTypes: readonly ProductType[]): void {
    this.productTypes.splice(0, this.productTypes.length, ...productTypes);
  }

  /**
   * [model/service/PriceGroupService.cfc:L437] replaces the included-product collection.
   */
  setProducts(products: readonly Product[]): void {
    this.products.splice(0, this.products.length, ...products);
  }

  /**
   * [model/service/PriceGroupService.cfc:L439] replaces the included-SKU collection.
   *
   * The call site spells it `setSKUs`, and this method is `setSkus`.
   */
  setSkus(skus: readonly Sku[]): void {
    this.skus.splice(0, this.skus.length, ...skus);
  }

  /**
   * [model/service/PriceGroupService.cfc:L441] replaces the excluded-product-type collection.
   */
  setExcludedProductTypes(excludedProductTypes: readonly ProductType[]): void {
    this.excludedProductTypes.splice(0, this.excludedProductTypes.length, ...excludedProductTypes);
  }

  /**
   * [model/service/PriceGroupService.cfc:L440] replaces the excluded-product collection.
   */
  setExcludedProducts(excludedProducts: readonly Product[]): void {
    this.excludedProducts.splice(0, this.excludedProducts.length, ...excludedProducts);
  }

  /**
   * [model/service/PriceGroupService.cfc:L442] replaces the excluded-SKU collection.
   *
   * Spelled `setExcludedSKUs` at the call site; same casing rule as {@link
   * PriceGroupRate.setSkus}.
   */
  setExcludedSkus(excludedSkus: readonly Sku[]): void {
    this.excludedSkus.splice(0, this.excludedSkus.length, ...excludedSkus);
  }

  // [model/entity/PriceGroupRate.cfc:L85] opens this banner and L176 closes it.

  /**
   * The three amount types the admin offers, in the order it offers them.
   * [model/entity/PriceGroupRate.cfc:L87-L93]
   *
   * This is the authoritative `amountType` vocabulary backing the strategy dispatch at
   * [model/service/PriceGroupService.cfc:L316-L340].
   *
   * LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L89-L91]: the three `name` values are
   * resource-bundle keys, not display text.
   */
  getAmountTypeOptions(): readonly [AmountTypeOption, AmountTypeOption, AmountTypeOption] {
    return [
      { name: 'define.percentageOff', value: 'percentageOff' },
      { name: 'define.amountOff', value: 'amountOff' },
      { name: 'define.fixedAmount', value: 'amount' },
    ];
  }

  /**
   * The human-readable summary of what this rate covers.
   * [model/entity/PriceGroupRate.cfc:L95-L174]
   *
   * GLOBAL SHORT-CIRCUIT [model/entity/PriceGroupRate.cfc:L106-L108]: `globalFlag` set, so the
   * resource-bundle key is returned and none of the six collections is consulted.
   *
   * SYNCHRONOUS: it counts already-materialized arrays and does pure string work.
   */
  getAppliesTo(): string {
    // [model/entity/PriceGroupRate.cfc:L96-L104] all NINE locals, every one seeded to the empty
    // string exactly as the source seeds them, so the control flow below is traceable line for
    // line against the CFC.
    let including = '';
    let excluding = '';
    let finalString = '';
    let productsList = '';
    let productTypesList = '';
    let skusList = '';
    let excludedProductsList = '';
    let excludedProductTypesList = '';
    let excludedSkusList = '';

    // [model/entity/PriceGroupRate.cfc:L106-L108] the global short-circuit.
    if (this.getGlobalFlag()) {
      return APPLIES_TO_ALL_PRODUCTS_RB_KEY;
    }

    // [model/entity/PriceGroupRate.cfc:L110-L133]
    //
    // `IIF(arrayLen(...) GT 1, DE('s'), DE(''))` is CFML's inline conditional with delayed-
    // evaluation quoting; the faithful TypeScript is a plain ternary.

    // [model/entity/PriceGroupRate.cfc:L111-L113] products first.
    const productCount: number = this.products.length;
    if (productCount > 0) {
      productsList = `${String(productCount)} Product${plural(productCount)}`;
    }

    // [model/entity/PriceGroupRate.cfc:L114-L116] then product types.
    const productTypeCount: number = this.productTypes.length;
    if (productTypeCount > 0) {
      productTypesList = `${String(productTypeCount)} Product Type${plural(productTypeCount)}`;
    }

    // [model/entity/PriceGroupRate.cfc:L117-L119] then SKUs.
    //
    // LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L101, L118, L126, L127]: the local is declared
    // `skusList` but assigned and read as `SkusList` at three sites. CFML variable names are
    // case-insensitive so the legacy code functions correctly.
    const skuCount: number = this.skus.length;
    if (skuCount > 0) {
      skusList = `${String(skuCount)} SKU${plural(skuCount)}`;
    }

    // [model/entity/PriceGroupRate.cfc:L120-L128] accumulate the non-empty fragments,
    // comma-delimited.
    if (listLen(productsList) > 0) {
      including = listAppend(including, productsList);
    }
    if (listLen(productTypesList) > 0) {
      including = listAppend(including, productTypesList);
    }
    if (listLen(skusList) > 0) {
      including = listAppend(including, skusList);
    }

    // LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L131-L133]: the comment claims "Replace all
    // commas" but CFML Replace() defaults to scope "once", so only the FIRST comma becomes " and
    // ".
    // Preserved deliberately; do not fix without a product decision.
    //
    // The defect is invisible with fewer than three populated collections.
    if (listLen(including) > 0) {
      including = including.replace(',', ' and ');
    }

    // [model/entity/PriceGroupRate.cfc:L135-L159]
    //
    // LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L136]: this one source line is indented with
    // three spaces followed by two tabs, breaking the four-space-plus-tab pattern used everywhere
    // else in the method. Purely cosmetic; the TypeScript is formatted normally.

    // [model/entity/PriceGroupRate.cfc:L136-L138] excluded products first.
    const excludedProductCount: number = this.excludedProducts.length;
    if (excludedProductCount > 0) {
      excludedProductsList = `${String(excludedProductCount)} Product${plural(
        excludedProductCount,
      )}`;
    }

    // [model/entity/PriceGroupRate.cfc:L139-L141] then excluded product types.
    const excludedProductTypeCount: number = this.excludedProductTypes.length;
    if (excludedProductTypeCount > 0) {
      excludedProductTypesList = `${String(excludedProductTypeCount)} Product Type${plural(
        excludedProductTypeCount,
      )}`;
    }

    // [model/entity/PriceGroupRate.cfc:L142-L144] then excluded SKUs.
    const excludedSkuCount: number = this.excludedSkus.length;
    if (excludedSkuCount > 0) {
      excludedSkusList = `${String(excludedSkuCount)} SKU${plural(excludedSkuCount)}`;
    }

    // [model/entity/PriceGroupRate.cfc:L146-L154] accumulate, in the same fixed order.
    //
    // LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L103, L140, L149, L150]: the L149 guard reads
    // `ListLen(excludedproductTypesList)` with a LOWERCASE `p`, while the local is declared with a
    // capital P at L103.
    if (listLen(excludedProductsList) > 0) {
      excluding = listAppend(excluding, excludedProductsList);
    }
    if (listLen(excludedProductTypesList) > 0) {
      excluding = listAppend(excluding, excludedProductTypesList);
    }
    if (listLen(excludedSkusList) > 0) {
      excluding = listAppend(excluding, excludedSkusList);
    }

    // LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L156-L159]: the comment claims "Replace all
    // commas" but CFML Replace() defaults to scope "once", so only the FIRST comma becomes " and
    // ".
    // Preserved deliberately; do not fix without a product decision.
    if (listLen(excluding) > 0) {
      excluding = excluding.replace(',', ' and ');
    }

    // Assemble Including and Excluding strings [model/entity/PriceGroupRate.cfc:L161-L173].
    //
    // `cfLen` is the ported `len()`, and it returns a NUMBER, so both guards compare `> 0`.
    if (cfLen(including) > 0) {
      finalString = `Including: ${including}`;
    }

    if (cfLen(excluding) > 0) {
      // [model/entity/PriceGroupRate.cfc:L167-L169] the `". "` separator is emitted only when both
      // halves are present, which is why the inner `if(len(including))` is nested inside the outer
      // `if(len(excluding))` rather than sitting beside it.
      if (cfLen(including) > 0) {
        finalString += '. ';
      }
      finalString += `Excluding: ${excluding}`;
    }

    // LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L98, L173]: with globalFlag false and all six
    // collections empty this returns the EMPTY STRING, not undefined - the legacy declares
    // returntype="string" and finalString is seeded to "".
    return finalString;
  }

  // [model/entity/PriceGroupRate.cfc:L178] opens this banner and L258 closes it. Four pairs: one
  // many-to-one and three many-to-many owner pairs.

  /**
   * Attaches this rate to a price group, adding it to that price group's rate collection.
   * [model/entity/PriceGroupRate.cfc:L181-L186]
   *
   * This is one of the two methods `model/entity/PriceGroup.cfc` delegates to.
   *
   * Both halves of the disjunct are preserved, in order, with CFML's short-circuit semantics that
   * JavaScript's `||` reproduces exactly.
   */
  setPriceGroup(priceGroup: PriceGroup): void {
    this.priceGroup = priceGroup;

    if (this.isNew() || !priceGroup.hasPriceGroupRate(this)) {
      priceGroup.getPriceGroupRates().push(this);
    }
  }

  /**
   * Detaches this rate from a price group. [model/entity/PriceGroupRate.cfc:L187-L196]
   *
   * This is the second method `model/entity/PriceGroup.cfc` delegates to - `removePriceGroupRate`
   * at [model/entity/PriceGroup.cfc:L147] is `arguments.priceGroupRate.removePriceGroup( this )`.
   *
   * @throws Error when called with no argument on a rate that has no price group.
   */
  removePriceGroup(priceGroup?: PriceGroup): void {
    // [model/entity/PriceGroupRate.cfc:L188-L190] the `structKeyExists` default, as an explicit
    // `!== undefined` test.
    const targetPriceGroup: PriceGroup | undefined =
      priceGroup !== undefined ? priceGroup : this.priceGroup;

    if (targetPriceGroup === undefined) {
      throw new Error(
        'PriceGroupRate.removePriceGroup was called with no argument on a rate that has no ' +
          'priceGroup. This reproduces the legacy runtime failure at ' +
          'model/entity/PriceGroupRate.cfc:L189-L192, where the omitted argument defaults to a ' +
          'null price group and getPriceGroupRates() is then invoked on it.',
      );
    }

    // [model/entity/PriceGroupRate.cfc:L191-L194] find the row, then splice. The far-side array is
    // LIVE, so the splice is observable through `PriceGroup.getPriceGroupRates()`.
    const siblingRates: PriceGroupRate[] = targetPriceGroup.getPriceGroupRates();
    const index: number = siblingRates.findIndex((rate: PriceGroupRate) =>
      isSameRow(rate.getPriceGroupRateID(), this.priceGroupRateID, rate, this),
    );

    if (index !== -1) {
      siblingRates.splice(index, 1);
    }

    // [model/entity/PriceGroupRate.cfc:L195] unconditional, outside the guard.
    this.priceGroup = undefined;
  }

  // Product Types (many-to-many - owner) [model/entity/PriceGroupRate.cfc:L198-L216]

  /**
   * Adds a product type to this rate, on both sides. [model/entity/PriceGroupRate.cfc:L199-L206]
   *
   * Preserve the guard asymmetry: the NEAR-side guard tests the ARGUMENT's newness
   * (`arguments.productType.isNew()`) while the FAR-side guard tests this rate's newness
   * (`isNew()`).
   *
   * The near side mutates `variables.productTypes`, which this port reaches as
   * `this.productTypes`; the accessor hands out that same live array, so both writers agree.
   */
  addProductType(productType: ProductType): void {
    if (productType.isNew() || !this.hasProductType(productType)) {
      this.productTypes.push(productType);
    }
    if (this.isNew() || !productType.hasPriceGroupRate(this)) {
      productType.getPriceGroupRates().push(this);
    }
  }

  /**
   * Removes a product type from this rate, on both sides.
   * [model/entity/PriceGroupRate.cfc:L207-L216]
   *
   * The two guards are independent: a needle present on one side only is still removed from that
   * side.
   *
   * The argument is `required` here, unlike `removePriceGroup` above, so no `structKeyExists`
   * defaulting applies and no optional parameter is introduced.
   */
  removeProductType(productType: ProductType): void {
    const candidateProductTypeID: string = productType.getProductTypeID();
    const thisIndex: number = this.productTypes.findIndex((held: ProductType) =>
      isSameRow(held.getProductTypeID(), candidateProductTypeID, held, productType),
    );
    if (thisIndex !== -1) {
      this.productTypes.splice(thisIndex, 1);
    }

    const farSideRates: PriceGroupRate[] = productType.getPriceGroupRates();
    const thatIndex: number = farSideRates.findIndex((rate: PriceGroupRate) =>
      isSameRow(rate.getPriceGroupRateID(), this.priceGroupRateID, rate, this),
    );
    if (thatIndex !== -1) {
      farSideRates.splice(thatIndex, 1);
    }
  }

  // Products (many-to-many - owner) [model/entity/PriceGroupRate.cfc:L218-L236]

  /**
   * Adds a product to this rate, on both sides. [model/entity/PriceGroupRate.cfc:L219-L226]
   *
   * Structurally identical to `addProductType` above, including the preserved guard asymmetry -
   * argument's newness on the near side [model/entity/PriceGroupRate.cfc:L220], this rate's
   * newness on the far side [model/entity/PriceGroupRate.cfc:L223].
   */
  addProduct(product: Product): void {
    if (product.isNew() || !this.hasProduct(product)) {
      this.products.push(product);
    }
    if (this.isNew() || !product.hasPriceGroupRate(this)) {
      product.getPriceGroupRates().push(this);
    }
  }

  /**
   * Removes a product from this rate, on both sides. [model/entity/PriceGroupRate.cfc:L227-L236]
   *
   * Two independent guards, near side first, `required` argument - identical shape to
   * `removeProductType` above.
   */
  removeProduct(product: Product): void {
    const candidateProductID: string = product.getProductID();
    const thisIndex: number = this.products.findIndex((held: Product) =>
      isSameRow(held.getProductID(), candidateProductID, held, product),
    );
    if (thisIndex !== -1) {
      this.products.splice(thisIndex, 1);
    }

    const farSideRates: PriceGroupRate[] = product.getPriceGroupRates();
    const thatIndex: number = farSideRates.findIndex((rate: PriceGroupRate) =>
      isSameRow(rate.getPriceGroupRateID(), this.priceGroupRateID, rate, this),
    );
    if (thatIndex !== -1) {
      farSideRates.splice(thatIndex, 1);
    }
  }

  // Skus (many-to-many - owner) [model/entity/PriceGroupRate.cfc:L238-L256]

  /**
   * Adds a SKU to this rate, on both sides. [model/entity/PriceGroupRate.cfc:L239-L246]
   *
   * Structurally identical to the two `add*` helpers above, including the preserved guard
   * asymmetry - argument's newness on the near side [model/entity/PriceGroupRate.cfc:L240], this
   * rate's newness on the far side [model/entity/PriceGroupRate.cfc:L243].
   */
  addSku(sku: Sku): void {
    if (sku.isNew() || !this.hasSku(sku)) {
      this.skus.push(sku);
    }
    if (this.isNew() || !sku.hasPriceGroupRate(this)) {
      sku.getPriceGroupRates().push(this);
    }
  }

  /**
   * Removes a SKU from this rate, on both sides. [model/entity/PriceGroupRate.cfc:L247-L256]
   *
   * Two independent guards, near side first, `required` argument - identical shape to the two
   * `remove*` helpers above.
   */
  removeSku(sku: Sku): void {
    const candidateSkuID: string = sku.getSkuID();
    const thisIndex: number = this.skus.findIndex((held: Sku) =>
      isSameRow(held.getSkuID(), candidateSkuID, held, sku),
    );
    if (thisIndex !== -1) {
      this.skus.splice(thisIndex, 1);
    }

    const farSideRates: PriceGroupRate[] = sku.getPriceGroupRates();
    const thatIndex: number = farSideRates.findIndex((rate: PriceGroupRate) =>
      isSameRow(rate.getPriceGroupRateID(), this.priceGroupRateID, rate, this),
    );
    if (thatIndex !== -1) {
      farSideRates.splice(thatIndex, 1);
    }
  }

  // No bidirectional add*/remove* pair exists for the three exclude collections, and none is
  // invented.
  //
  // There is no `addExcludedProductType`, `removeExcludedProductType`, `addExcludedProduct`,
  // `removeExcludedProduct`, `addExcludedSku` or `removeExcludedSku` anywhere in the 284 lines of
  // model/entity/PriceGroupRate.cfc.

  // [model/entity/PriceGroupRate.cfc:L260] opens this banner and L278 closes it.

  /**
   * The admin display form of `amount`. [model/entity/PriceGroupRate.cfc:L262-L268]
   *
   * This METHOD is what `hb_formatType="custom"` on [model/entity/PriceGroupRate.cfc:L54] ROUTES
   * to - the attribute and the method are two halves of one mechanism, and both are preserved.
   *
   * LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L266]: formatValue(v,"currency") is a non-ported
   * org/Hibachi/** framework formatter.
   */
  getAmountFormatted(): string {
    const amount: Money | undefined = this.amount;
    if (isAmountType(this.amountType, 'percentageOff')) {
      return isAbsent(amount) ? '%' : `${cfNumberToString(amount.toDecimalString())}%`;
    }

    // [model/entity/PriceGroupRate.cfc:L266] the two-decimal presentation step, and nothing more.
    return isAbsent(amount) ? '' : numberFormat(amount.toDecimalString(), '0.00');
  }

  /**
   * The name of the property that stands for this entity in the admin.
   * [model/entity/PriceGroupRate.cfc:L270-L272]
   *
   * LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L271]: returns "DisplayName" with a capital D
   * while the property is declared `displayName` at L82 and the accessor is getDisplayName() at
   * L274.
   *
   * The mechanism that consumes it: the framework base builds a method name out of this string and
   * invokes `get#getSimpleRepresentationPropertyName()#()`.
   */
  getSimpleRepresentationPropertyName(): string {
    return 'DisplayName';
  }

  /**
   * The label `getSimpleRepresentationPropertyName()` names.
   * [model/entity/PriceGroupRate.cfc:L274-L276]
   *
   * The separator is the three characters `" - "`, space-hyphen-space, twice.
   *
   * Three nullable reads, one raise and two empty-string folds - and the difference is CFML's, not
   * a choice made here.
   *
   * @throws Error when this rate has no materialized price group.
   */
  getDisplayName(): string {
    // LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L275]: getPriceGroup() is dereferenced with
    // no null guard, so a rate whose priceGroup is unset throws at runtime in CFML.
    // Preserved deliberately; do not fix without a product decision.
    if (isAbsent(this.priceGroup)) {
      throw new Error(
        'PriceGroupRate.getDisplayName was called on a rate with no materialized priceGroup. ' +
          'model/entity/PriceGroupRate.cfc:L275 calls getPriceGroup().getPriceGroupName() with no ' +
          'null guard, so an unattached or unjoined rate is a CFML null-reference error there too. ' +
          'Reproduced rather than smoothed into a partial label.',
      );
    }

    const priceGroupName: string | undefined = this.priceGroup.getPriceGroupName();
    const amount: Money | undefined = this.amount;

    // CFML concatenation is total: each null operand contributes the empty string.
    const priceGroupNameText: string = isAbsent(priceGroupName) ? '' : priceGroupName;
    const amountText: string = isAbsent(amount) ? '' : cfNumberToString(amount.toDecimalString());
    const amountTypeText: string = isAbsent(this.amountType) ? '' : this.amountType;

    return `${priceGroupNameText} - ${amountText} - ${amountTypeText}`;
  }

  // [model/entity/PriceGroupRate.cfc:L280] opens this banner and L282 closes it, and it is
  // completely empty.
  //
  // So neither `preInsert()` nor `preUpdate()` is declared here, deliberately, and no materialized
  // path is maintained.
}

/**
 * `IIF(count GT 1, DE('s'), DE(''))` - the pluraliser `getAppliesTo()` applies six times.
 * [model/entity/PriceGroupRate.cfc:L112, L115, L118, L137, L140, L143]
 *
 * A plain ternary, which is the faithful translation: `IIF` is CFML's inline conditional and
 * `DE()` is its delayed-evaluation quoting wrapper.
 */
function plural(count: number): string {
  return count > 1 ? 's' : '';
}

/**
 * Whether two entity instances are the same ROW, by the rule Hibernate's session identity actually
 * followed - which is not the same rule as "their primary keys are equal".
 *
 * @param heldKey the primary key of the member already in the collection.
 * @param candidateKey the primary key of the member being sought.
 * @param heldInstance the collection member itself.
 * @param candidateInstance the sought member itself.
 * @returns whether the two refer to the same row.
 */
function isSameRow(
  heldKey: string,
  candidateKey: string,
  heldInstance: object,
  candidateInstance: object,
): boolean {
  if (heldKey === '' || candidateKey === '') {
    return heldInstance === candidateInstance;
  }

  return heldKey === candidateKey;
}

/**
 * A narrowing wrapper over the shared `isNullish()` CFML `isNull()` port.
 *
 * The shared helper is declared `(value: unknown) => boolean`, which is the right shape for a
 * general-purpose predicate but gives the compiler nothing to narrow with.
 *
 * Every site that uses it is reproducing one of the two CFML null semantics this entity depends
 * on: concatenation folding a null operand to the empty string
 * [model/entity/PriceGroupRate.cfc:L264, L275].
 */
function isAbsent(value: unknown): value is null | undefined {
  return isNullish(value);
}

/**
 * Does this rate's `amountType` select the given `switch` arm, with case folded as CFML folds it?
 *
 * @param subject the rate's persisted `amountType`, which may be absent.
 * @param arm the `case` label being tested, always written in the source's canonical spelling.
 * @returns `true` only when the subject is present and equals the arm with case folded.
 */
function isAmountType(subject: PriceGroupRateAmountType | undefined, arm: string): boolean {
  return !isAbsent(subject) && cfEquals(subject, arm);
}

// Deliberate omissions and the structural record.
//
// LEGACY-NOTE `model/validation/PriceGroupRate.json`: declares a condition `isNotGlobal`
// ({"getGlobalFlag":{"eq":0}}) that is declared but never referenced by any property - an orphan.
