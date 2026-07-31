// ---------------------------------------------------------------------------
// slatwall-ts - PriceGroupRate entity
//
// PORT OF model/entity/PriceGroupRate.cfc (284 lines, confirmed by `wc -l`).
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/PriceGroupRate.cfc:L49]
//
//   component displayname="Price Group Rate" entityname="SlatwallPriceGroupRate"
//   table="SwPriceGroupRate" persistent=true output=false accessors=true
//   extends="HibachiEntity" cacheuse="transactional" hb_serviceName="priceGroupService"
//   hb_permission="priceGroup.priceGroupRates" {
//
// Schema continuity is a binding constraint: entity property metadata IS the
// contract. Table `SwPriceGroupRate`, entity name `SlatwallPriceGroupRate`. No
// migration, no rename, no new table, no column change. Every `hb_*` attribute is
// carried forward verbatim so the legacy admin can still resolve it - including
// `hb_permission="priceGroup.priceGroupRates"`, which nests this entity's
// permissions under its parent rather than under itself, and
// `hb_serviceName="priceGroupService"`, which is why there is no
// `PriceGroupRateService` to port and no such omission to explain.
//
// ★ THIS IS THE LEAF THE PRICE-GROUP CASCADE RESOLVES TO. All three of
// `getRateForProductTypeBasedOnPriceGroup`, `getRateForProductBasedOnPriceGroup` and
// `getRateForSkuBasedOnPriceGroup` [model/service/PriceGroupService.cfc:L57, L102,
// L140] return an instance of THIS class, and `calculateSkuPriceBasedOnPriceGroupRate`
// [model/service/PriceGroupService.cfc:L316-L340] then reads `getAmountType()`,
// `getAmount()` and `getRoundingRule()` off it to compute a price. Which means the
// price-group half of the must-preserve pricing behaviour terminates here, and the
// two documented cascade asymmetries are both visible from this file:
//
//   * ONLY THE `percentageOff` BRANCH APPLIES THE ROUNDING RULE
//     [model/service/PriceGroupService.cfc:L316-L340]. `amountOff` and `amount` skip
//     it entirely, even though `roundingRule` is declared on THIS entity and is
//     equally available to all three branches. That is a defect in the SERVICE, not
//     here; it is registered against the service and noted on `getRoundingRule()`
//     below so a reader of this file is not misled into thinking the association is
//     uniformly consulted.
//   * `getGlobalFlag()` IS THE CASCADE'S LEVEL-4 FALLBACK. `PriceGroup.cfc:L83`
//     scans its rates for the one whose `globalFlag` is set, and
//     src/domain/entities/priceGroup.ts:L948 reproduces that scan verbatim. This
//     class is where the flag it scans for lives.
//
// THE ASSOCIATION CENSUS, receiver-qualified against every
// `arrayAppend`/`arrayDeleteAt` site in model/entity/*.cfc. This is the project's ONE
// association-ownership rule and it is mechanical: an accessor returns the LIVE
// mutable array iff some entity mutates it IN PLACE THROUGH that accessor.
//
//   | locator | property             | fieldtype    | link table                    | accessor |
//   |---------|----------------------|--------------|-------------------------------|----------|
//   | L71     | productTypes         | many-to-many | SwPriceGroupRateProductType   | readonly |
//   | L72     | products             | many-to-many | SwPriceGroupRateProduct       | readonly |
//   | L73     | skus                 | many-to-many | SwPriceGroupRateSku           | readonly |
//   | L75     | excludedProductTypes | many-to-many | SwPriceGrpRateExclProductType | readonly |
//   | L76     | excludedProducts     | many-to-many | SwPriceGroupRateExclProduct   | readonly |
//   | L77     | excludedSkus         | many-to-many | SwPriceGroupRateExclSku       | readonly |
//
// ★ ALL SIX ARE `readonly`, AND THE UNIFORMITY IS ITSELF THE FINDING. None of the six
// declares `inverse="true"`, so this entity is the OWNER of all six link tables, and
// an owner mutates its own `variables.<x>` directly rather than reaching through its
// own accessor. Nothing outside this class ever appends to
// `priceGroupRate.getProductTypes()` - zero census sites for any of the six, verified
// by an exhaustive receiver-qualified scan. That is the exact mirror image of the
// eleven collections on ProductType/Product/Sku, every one of which is `inverse="true"`
// and LIVE precisely BECAUSE this class reaches into them. The owner/inverse liveness
// inversion is the single most load-bearing structural fact in the entity folder, and
// this file is its cleanest example.
//
// THREE OF THOSE SIX COLLECTIONS ARE UNREACHABLE THROUGH ANY HELPER. This component
// hand-writes bidirectional pairs for `productTypes` [L199/L207], `products` [L219/L227]
// and `skus` [L239/L247] - and NOTHING AT ALL for `excludedProductTypes`,
// `excludedProducts` or `excludedSkus`. Verified by grep: there is no
// `addExcluded*`/`removeExcluded*` anywhere in the 284 lines. Three separate entities
// call the methods that absence implies -
// model/entity/ProductType.cfc:L216/L219, model/entity/Product.cfc:L740/L743 and
// model/entity/Sku.cfc:L680/L683 - and all six of those calls reach the
// `onMissingMethod` throw at org/Hibachi/HibachiEntity.cfc:L565. So the three excluded
// collections are declared, persisted, read by `getAppliesTo()`, and populatable ONLY
// by direct framework population - never by a bidirectional helper. Registered as a
// defect on those three callers and recorded here at the root cause.
//
// AND THE THREE EXCLUDED COLLECTIONS ARE NEVER CONSULTED BY THE CASCADE EITHER. The
// plan is explicit that they are retained with the gap flagged:
// model/service/PriceGroupService.cfc's five-level resolution
// [model/service/PriceGroupService.cfc:L140-L181] reads only the INCLUDED sides, so a
// SKU explicitly listed in `excludedSkus` still receives the rate. Retained because
// they are part of `SwPriceGroupRate`'s persisted contract and dropping them would
// break schema continuity; flagged because a reader would otherwise reasonably assume
// an exclusion excludes.
//
// TWO DEFECTS LIVE IN THIS COMPONENT'S OWN BODY, both reproduced, both marked:
//   1. `getAppliesTo()` replaces only the FIRST comma despite a comment saying "all"
//      [L129-L131, L157-L159].
//   2. `removePriceGroup()` dereferences null when called with no argument on a rate
//      that has no price group [L187-L196] - the framework-wide idiom.
// Plus the absence described above, which is a defect on this class observed from three
// other files.
//
// THE `extends` CHAIN IS THREE LEVELS DEEP, NOT TWO. `extends="HibachiEntity"` on L49
// is UNQUALIFIED, so it resolves to the local model/entity/HibachiEntity.cfc (274
// lines), whose own L49 reads `component output="false" accessors="true"
// persistent="false" extends="Slatwall.org.Hibachi.HibachiEntity"`. Neither level is
// ported: an entity reaching outward through a service locator is exactly the pattern
// the ESLint `no-restricted-imports` layer boundary exists to make impossible.
//
// VALIDATION: model/validation/PriceGroupRate.json EXISTS and is one of the twelve
// in-scope schemas. It is ported as a typed zod schema by the owner of the validation
// tier; this class carries no validator method, exactly as the source carries none.
//
// TEST COVERAGE FOR THIS MODULE IS NET-NEW. `PriceGroupRate` has no legacy test. Only
// brand.ts and product.ts have legacy antecedents. The contract the test tier has to
// pin is enumerated at the foot of this file.
//
// NO USER RULES WERE PROVIDED. The enterprise substitute standard applies at full
// strength - maximal strictness, no `any` and no suppression comment, one exported unit
// per file, no barrel, and every judgment call annotated where it was made.
// ---------------------------------------------------------------------------

import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import { cfBoolean } from '../../lib/cfml/truthiness.js';
import type { Money } from '../valueObjects/money.js';
import type { PriceGroup } from './priceGroup.js';
import type { Product } from './product.js';
import type { ProductType } from './productType.js';
import type { RoundingRule } from './roundingRule.js';
import type { Sku } from './sku.js';

/**
 * One row of `getAmountTypeOptions()`.
 * [model/entity/PriceGroupRate.cfc:L87-L93]
 *
 * A `type` alias rather than an `interface`, and that is load-bearing rather than stylistic: an
 * `interface` is NOT assignable to `Readonly<Record<string, unknown>>` (TS2322) because it has no
 * implicit index signature, whereas a type alias IS. The same decision is recorded on
 * `ParentPriceGroupOption` in src/domain/entities/priceGroup.ts.
 *
 * The two keys are the framework's own `name`/`value` option pair, reproduced verbatim.
 */
type AmountTypeOption = {
  readonly name: string;
  readonly value: 'percentageOff' | 'amountOff' | 'amount';
};

/**
 * The narrow port standing for `formatValue(getAmount(),"currency")`
 * [model/entity/PriceGroupRate.cfc:L266].
 *
 * WHY A PORT AND NOT A LOCAL IMPLEMENTATION. `formatValue` is a method on
 * org/Hibachi/HibachiUtilityService.cfc, which is NOT PORTED by explicit plan decision, and its
 * currency branch at [org/Hibachi/HibachiUtilityService.cfc:L34-L40] does two things this subtree
 * cannot do locally: it calls the CFML built-in `LSCurrencyFormat`, and it reaches
 * `getHibachiScope().getRBLocale()` for the locale. The second is ambient request state, which
 * transformation rule T6 replaces with an explicit dependency rather than reproduces. So the
 * formatter is injected, and the locale it uses is the caller's problem rather than a hidden global.
 *
 * The legacy default is worth recording because it is a real fallback rather than an accident:
 * when no currency code is supplied, [org/Hibachi/HibachiUtilityService.cfc:L38-L39] defaults to
 * `"USD"`, with the source's own comment `// If no currency code was passed in then we can default
 * to USD`. `getAmountFormatted()` here supplies NO format details at all, so the legacy always took
 * that USD default for this call site.
 *
 * Declared module-local and UN-EXPORTED: the AAP locks the port inventory at THIRTEEN exported
 * contracts under `src/domain/ports/`, and the inventory counts EXPORTED CONTRACTS rather than
 * files, so a fourteenth exported collaborator interface is a budget violation wherever it sits.
 * This follows `RoundingRuleValueRounder` in src/domain/entities/roundingRule.ts and
 * `PromotionCodeDeletableEvaluator` in src/domain/entities/promotion.ts.
 */
interface CurrencyValueFormatter {
  /**
   * [org/Hibachi/HibachiUtilityService.cfc:L34-L40] `LSCurrencyFormat(value, "USD", <locale>)`.
   * The implementation owns the locale; this class passes only the amount.
   */
  formatCurrency(amount: Money): string;
}

/**
 * A single price-group rate - the leaf the price-group cascade resolves to.
 *
 * A class rather than an interface, because the legacy entity carries behaviour and not merely
 * data: `getAppliesTo()` alone is eighty lines of string assembly [L95-L174], and there are four
 * bidirectional helper pairs plus three overridden representation methods.
 *
 * ASSOCIATIONS ARE MATERIALIZED AT THE REPOSITORY BOUNDARY. Hibernate lazy collections have no
 * equivalent in a driver-only stack, so each collection arrives already populated and the fetch
 * shape is an explicit, documented decision at the repository method that produced it.
 *
 * EVERY MEMBER IS SYNCHRONOUS. The async boundary rule is that a method becomes `async` if and only
 * if its legacy body reaches the DAO or ORM, and no body in this component does: `getAppliesTo()`
 * counts already-materialized arrays, `getAmountFormatted()` calls an injected formatter, and
 * `getDisplayName()` reads a materialized association. That keeps the accessor shape identical to
 * the legacy contract - the same reasoning applied to `Sku.getPriceByCurrencyCode()`.
 *
 * ALL MONEY PASSES THROUGH `Money`. `amount` is `ormType="big_decimal"` [L54] and feeds
 * `calculateSkuPriceBasedOnPriceGroupRate` [model/service/PriceGroupService.cfc:L316-L340], where
 * `precisionEvaluate` guards the arithmetic. No raw floating-point operation on this value exists
 * anywhere in the target, and persistence uses `Money.toDecimalString()` - never `toFixed2()`,
 * which is presentation-only and would silently truncate scale on the way to a `big_decimal`
 * column.
 *
 * FOUR MEMBERS OF THIS CLASS CAN THROW, and each says so on itself: `getAppliesTo()` (only on the
 * global branch, and only without the injected label), `getAmountFormatted()` (no formatter, or no
 * amount), `getDisplayName()` (unmaterialized price group, or no amount), and
 * `removePriceGroup()` (the framework-wide unguarded-null idiom). Every other member is total.
 */
export class PriceGroupRate {
  /**
   * [model/entity/PriceGroupRate.cfc:L52]
   * `ormtype="string" length="32" fieldtype="id" generator="uuid" unsavedvalue="" default=""`
   *
   * `unsavedvalue=""` with `default=""` is what makes an unsaved row's key the empty string, which
   * is in turn what makes `isNew()` a simple emptiness test.
   */
  private readonly priceGroupRateID: string;

  /**
   * [model/entity/PriceGroupRate.cfc:L53] `ormType="boolean" default="false"`.
   *
   * ★ THIS COLUMN HAS AN EXPLICIT `default="false"`, unlike the nine undefaulted `ormtype="boolean"`
   * columns elsewhere in the folder. It is still typed `CfBooleanInput` and still resolved through
   * `cfBoolean()`, because a default constrains what the ORM WRITES on insert and says nothing about
   * what a row already in `SwPriceGroupRate` holds - a row inserted before the default existed, or
   * by any writer other than this ORM, can still be NULL. Narrowing the field to `boolean` on the
   * strength of a default would be trusting the schema to enforce something it does not.
   *
   * The value is the price-group cascade's LEVEL-4 FALLBACK selector: `PriceGroup.cfc:L83` scans a
   * price group's rates for the one whose flag is set.
   */
  private readonly globalFlag: CfBooleanInput;

  /**
   * [model/entity/PriceGroupRate.cfc:L54] `ormType="big_decimal" hb_formatType="custom"`.
   *
   * `hb_formatType="custom"` is what routes admin rendering through `getAmountFormatted()` below
   * rather than through a generic formatter - the attribute and the method are two halves of one
   * mechanism, and both are preserved.
   *
   * NULLABLE: no `notNull="true"`. Both `getAmountFormatted()` and `getDisplayName()` dereference it
   * with no guard, so absence is a raise rather than a substituted zero - see each method.
   */
  private readonly amount: Money | undefined;

  /**
   * [model/entity/PriceGroupRate.cfc:L55] `ormType="string" hb_formFieldType="select"`.
   *
   * NOT typed as a union of the three `getAmountTypeOptions()` values, deliberately. The column
   * carries no check constraint and model/validation/PriceGroupRate.json imposes no value
   * restriction, so narrowing it would reject data the legacy schema accepts. The union lives on
   * `AmountTypeOption.value` above, where it describes the OPTIONS the admin offers rather than the
   * COLUMN's domain - which is the honest place for it.
   */
  private readonly amountType: string | undefined;

  /** [model/entity/PriceGroupRate.cfc:L58] the integration correlation column. */
  private readonly remoteID: string | undefined;

  /** [model/entity/PriceGroupRate.cfc:L61] `hb_populateEnabled="false" ormtype="timestamp"`. */
  private readonly createdDateTime: Date | undefined;

  /**
   * [model/entity/PriceGroupRate.cfc:L62] many-to-one onto the out-of-scope `Account`,
   * `fkcolumn="createdByAccountID"`. Reduced to the opaque identifier, as every in-scope entity does.
   */
  private readonly createdByAccountID: string | undefined;

  /** [model/entity/PriceGroupRate.cfc:L63] `hb_populateEnabled="false" ormtype="timestamp"`. */
  private readonly modifiedDateTime: Date | undefined;

  /** [model/entity/PriceGroupRate.cfc:L64] many-to-one onto `Account`, `fkcolumn="modifiedByAccountID"`. */
  private readonly modifiedByAccountID: string | undefined;

  /**
   * [model/entity/PriceGroupRate.cfc:L67] many-to-one, `fkcolumn="priceGroupID"`.
   *
   * MUTABLE: `setPriceGroup` assigns it [L182] and `removePriceGroup` clears it [L195]. `undefined`
   * both for an unattached rate and for one the repository hydrated without its parent - two states
   * the port cannot distinguish, exactly as CFML cannot.
   */
  private priceGroup: PriceGroup | undefined;

  /**
   * [model/entity/PriceGroupRate.cfc:L68] many-to-one, `fkcolumn="roundingRuleID"`,
   * `hb_optionsNullRBKey="define.none"`.
   *
   * `hb_optionsNullRBKey="define.none"` makes the framework PREPEND a blank
   * `{value:'', name:<resolved "define.none">}` row to this property's option list
   * [org/Hibachi/HibachiEntity.cfc:L375-L417], which is how the admin offers "no rounding rule" as a
   * selectable choice. Preserved as metadata; the port introduces no option-list generator for it,
   * for the same reason smart lists are not ported.
   *
   * ★ CONSULTED BY ONLY ONE OF THE THREE AMOUNT-TYPE BRANCHES. See the header note: the
   * `percentageOff` branch of `calculateSkuPriceBasedOnPriceGroupRate`
   * [model/service/PriceGroupService.cfc:L316-L340] applies this rule and the `amountOff` and
   * `amount` branches skip it. The asymmetry is a defect in the service, registered there; it is
   * noted here so nobody reading this declaration assumes uniform use.
   */
  private readonly roundingRule: RoundingRule | undefined;

  /** [model/entity/PriceGroupRate.cfc:L71] `many-to-many` OWNER via `SwPriceGroupRateProductType`. */
  private readonly productTypes: ProductType[];

  /** [model/entity/PriceGroupRate.cfc:L72] `many-to-many` OWNER via `SwPriceGroupRateProduct`. */
  private readonly products: Product[];

  /** [model/entity/PriceGroupRate.cfc:L73] `many-to-many` OWNER via `SwPriceGroupRateSku`. */
  private readonly skus: Sku[];

  /**
   * [model/entity/PriceGroupRate.cfc:L75] `many-to-many` OWNER via `SwPriceGrpRateExclProductType`.
   *
   * NO BIDIRECTIONAL HELPER EXISTS FOR THIS COLLECTION - see the header. Populatable only by direct
   * framework population, and never consulted by the price-group cascade. Both facts are flagged
   * rather than corrected.
   */
  private readonly excludedProductTypes: ProductType[];

  /** [model/entity/PriceGroupRate.cfc:L76] `many-to-many` OWNER via `SwPriceGroupRateExclProduct`. No helper. */
  private readonly excludedProducts: Product[];

  /** [model/entity/PriceGroupRate.cfc:L77] `many-to-many` OWNER via `SwPriceGroupRateExclSku`. No helper. */
  private readonly excludedSkus: Sku[];

  /**
   * The already-resolved text for `rbKey('admin.pricegroup.edit.priceGroupRateAppliesToAllProducts')`
   * [model/entity/PriceGroupRate.cfc:L107].
   *
   * JavaRB IS NOT PORTED, by explicit plan decision, and resource-bundle identifiers are preserved
   * verbatim as string constants so the legacy admin can still resolve them. This field is how that
   * decision is honoured WITHOUT inventing an i18n runtime: the resolved label is supplied at
   * hydration by whoever owns localisation, and the KEY it came from is recorded in this doc and in
   * the raise message. Defaulting it to the key string would emit a raw identifier into an admin
   * screen, and defaulting it to English would fabricate a translation - so it is neither, and
   * `getAppliesTo()` raises on the global branch when it is absent.
   */
  private readonly appliesToAllProductsLabel: string | undefined;

  /** The injected currency formatter. `undefined` on every path that never formats an amount. */
  private readonly currencyValueFormatter: CurrencyValueFormatter | undefined;

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
    readonly priceGroupRateID: string;
    readonly globalFlag?: CfBooleanInput;
    readonly amount?: Money | undefined;
    readonly amountType?: string | undefined;
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
    readonly appliesToAllProductsLabel?: string | undefined;
    readonly currencyValueFormatter?: CurrencyValueFormatter | undefined;
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
    this.appliesToAllProductsLabel = init.appliesToAllProductsLabel;
    this.currencyValueFormatter = init.currencyValueFormatter;
  }

  // ============ START: Persistent Property Accessors ===================
  // Legacy names carried over verbatim in CFML camelCase; interface parity is the acceptance
  // contract for this port.

  /** [model/entity/PriceGroupRate.cfc:L52] */
  getPriceGroupRateID(): string {
    return this.priceGroupRateID;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L53] The cascade's level-4 selector.
   *
   * Resolved through `cfBoolean()` despite the column's `default="false"` - see the field doc for
   * why a default is not a guarantee about existing rows.
   */
  getGlobalFlag(): boolean {
    return cfBoolean(this.globalFlag);
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L54]
   *
   * `undefined` for a NULL column, and that is load-bearing rather than incidental: both
   * `getAmountFormatted()` and `getDisplayName()` dereference this value with no guard in the legacy,
   * so a substituted zero would be a silently different price rather than a faithful port.
   */
  getAmount(): Money | undefined {
    return this.amount;
  }

  /** [model/entity/PriceGroupRate.cfc:L55] */
  getAmountType(): string | undefined {
    return this.amountType;
  }

  /** [model/entity/PriceGroupRate.cfc:L58] */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [model/entity/PriceGroupRate.cfc:L61] */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /** [model/entity/PriceGroupRate.cfc:L62] */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/PriceGroupRate.cfc:L63] */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** [model/entity/PriceGroupRate.cfc:L64] */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  /** [model/entity/PriceGroupRate.cfc:L67] `undefined` for an unattached or unjoined rate. */
  getPriceGroup(): PriceGroup | undefined {
    return this.priceGroup;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L68]
   *
   * Read by `calculateSkuPriceBasedOnPriceGroupRate` [model/service/PriceGroupService.cfc:L322] on
   * the `percentageOff` branch ONLY - see the field doc.
   */
  getRoundingRule(): RoundingRule | undefined {
    return this.roundingRule;
  }

  // ============  END: Persistent Property Accessors ====================

  // ============ START: Collection Accessors ============================
  // ALL SIX ARE `readonly`, because this entity OWNS all six link tables and nothing reaches into
  // any of them from outside - zero census sites across model/entity/*.cfc. The owner writes its own
  // `variables.<x>` directly; see the header for why that inverts the liveness of the eleven
  // `inverse="true"` collections on ProductType/Product/Sku.
  //
  // THE FIELDS THEMSELVES ARE MUTABLE ARRAYS while the ACCESSORS hand out `readonly` views. Those
  // are two different guarantees and both are wanted: the helper pairs below must be able to splice
  // the backing array, and no caller may.

  /** [model/entity/PriceGroupRate.cfc:L71] READONLY - owner side, zero census sites. */
  getProductTypes(): readonly ProductType[] {
    return this.productTypes;
  }

  /** [model/entity/PriceGroupRate.cfc:L72] READONLY - owner side, zero census sites. */
  getProducts(): readonly Product[] {
    return this.products;
  }

  /** [model/entity/PriceGroupRate.cfc:L73] READONLY - owner side, zero census sites. */
  getSkus(): readonly Sku[] {
    return this.skus;
  }

  /**
   * [model/entity/PriceGroupRate.cfc:L75] READONLY - owner side, zero census sites.
   *
   * NO HELPER EXISTS TO POPULATE THIS, and the cascade never reads it. See the header.
   */
  getExcludedProductTypes(): readonly ProductType[] {
    return this.excludedProductTypes;
  }

  /** [model/entity/PriceGroupRate.cfc:L76] READONLY. No helper exists; cascade never reads it. */
  getExcludedProducts(): readonly Product[] {
    return this.excludedProducts;
  }

  /** [model/entity/PriceGroupRate.cfc:L77] READONLY. No helper exists; cascade never reads it. */
  getExcludedSkus(): readonly Sku[] {
    return this.excludedSkus;
  }

  // ============  END: Collection Accessors =============================

  // ============ START: Containment Probes ==============================
  // None has a hand-written legacy body: all are synthesised by the dispatcher at
  // org/Hibachi/HibachiEntity.cfc:L507-L565, whose CFML semantics are Hibernate's
  // collection-contains - session identity, i.e. primary key for a persistent row. Each is
  // authored because THIS class's own helpers call it: `hasProductType` at [L200],
  // `hasProduct` at [L220] and `hasSku` at [L240].
  //
  // THE PROJECT-WIDE CONTAINMENT RULE: compare by PRIMARY KEY, with a REFERENCE fallback when the
  // candidate is unsaved. The fallback is not optional - every unsaved row's key is `''`
  // (`unsavedvalue=""`), so a pure key comparison would report two DIFFERENT unsaved rows as the
  // same one and the guard would skip a legitimate append.

  /** Called by this class's own `addProductType` [model/entity/PriceGroupRate.cfc:L200]. */
  hasProductType(productType: ProductType): boolean {
    const candidateID: string = productType.getProductTypeID();
    if (candidateID === '') {
      return this.productTypes.includes(productType);
    }
    return this.productTypes.some((held: ProductType) => held.getProductTypeID() === candidateID);
  }

  /** Called by this class's own `addProduct` [model/entity/PriceGroupRate.cfc:L220]. */
  hasProduct(product: Product): boolean {
    const candidateID: string = product.getProductID();
    if (candidateID === '') {
      return this.products.includes(product);
    }
    return this.products.some((held: Product) => held.getProductID() === candidateID);
  }

  /** Called by this class's own `addSku` [model/entity/PriceGroupRate.cfc:L240]. */
  hasSku(sku: Sku): boolean {
    const candidateID: string = sku.getSkuID();
    if (candidateID === '') {
      return this.skus.includes(sku);
    }
    return this.skus.some((held: Sku) => held.getSkuID() === candidateID);
  }

  // ============  END: Containment Probes ===============================

  /**
   * [org/Hibachi/HibachiEntity.cfc:L707-L709] `isNew()` returns `getNewFlag()`, and
   * [org/Hibachi/HibachiEntity.cfc:L571-L576] `getNewFlag()` returns `getPrimaryIDValue() == ""`.
   * With `unsavedvalue="" default=""` on [model/entity/PriceGroupRate.cfc:L52] that reduces exactly
   * to the test below.
   *
   * Called by all four `set`/`add` helpers in this class - [L183], [L203], [L223], [L243].
   */
  isNew(): boolean {
    return this.priceGroupRateID === '';
  }

  // ============ START: Non-Persistent Property Methods =================
  // [model/entity/PriceGroupRate.cfc:L85] opens this block and L176 closes it.

  /**
   * `getAmountTypeOptions` - the three amount types the admin offers.
   * [model/entity/PriceGroupRate.cfc:L87-L93]
   *
   * The legacy body verbatim:
   *
   *   return [
   *     {name=rbKey("define.percentageOff"), value="percentageOff"},
   *     {name=rbKey("define.amountOff"), value="amountOff"},
   *     {name=rbKey("define.fixedAmount"), value="amount"}
   *   ];
   *
   * ★ NOTE THE THIRD PAIR: the display key is `define.fixedAmount` but the stored value is plain
   * `amount`. That mismatch is deliberate in the source and is preserved exactly, because `amount`
   * is the value `calculateSkuPriceBasedOnPriceGroupRate` switches on
   * [model/service/PriceGroupService.cfc:L316-L340] - renaming it to match the label would break the
   * pricing switch.
   *
   * THE RETURN TYPE IS A READONLY THREE-TUPLE, not a readonly array, precisely so the count and the
   * order are part of the type: adding a fourth amount type, dropping one, or reordering them
   * becomes a compile error rather than a silent behavioural change. Order is not cosmetic - it is
   * the order the option appears in the admin select. Same decision as
   * `RoundingRule.getRoundingRuleDirectionOptions()`.
   *
   * THE THREE `name` VALUES ARE THE RESOURCE-BUNDLE KEYS THEMSELVES, NOT ENGLISH TEXT. JavaRB is
   * not ported and resource-bundle identifiers are preserved verbatim as string constants, so the
   * key travels intact to whoever owns localisation. Inventing English labels here would fabricate
   * translations the legacy system resolves at runtime; emitting them as keys keeps the contract
   * honest and lossless. Contrast `RoundingRule.getRoundingRuleDirectionOptions()`, whose three
   * labels ARE hardcoded English in the source - so that port keeps English and this one keeps keys,
   * each matching its own source.
   *
   * PURE AND SYNCHRONOUS. A fresh array on every call, exactly as the CFML literal was re-evaluated
   * on every call, so a caller can never mutate a shared instance - and `readonly` on the tuple and
   * on both keys means a caller cannot mutate its own copy either. Hoisting the literal to module
   * scope would create shared state on a warm Lambda container for no benefit.
   */
  getAmountTypeOptions(): readonly [AmountTypeOption, AmountTypeOption, AmountTypeOption] {
    return [
      { name: 'define.percentageOff', value: 'percentageOff' },
      { name: 'define.amountOff', value: 'amountOff' },
      { name: 'define.fixedAmount', value: 'amount' },
    ];
  }

  // *** LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L129-L131, L157-L159]: getAppliesTo()
  // REPLACES ONLY THE FIRST COMMA, DESPITE A COMMENT SAYING "ALL". Both replace steps read
  //
  //     // Replace all commas with " and ".
  //     if(listLen(including)) {
  //         including = Replace(including, ",", " and ");
  //     }
  //
  // and CFML's `Replace(string, substring1, substring2 [, scope])` DEFAULTS ITS SCOPE TO `"one"`.
  // Proven from the codebase rather than asserted from memory: model/service/BrandService.cfc and
  // model/service/ProductService.cfc both write `Replace(urlTitle, "[ ]+", "-", "all")` with the
  // scope SPELLED OUT, which is only necessary because the default is not "all".
  //
  // THE OBSERVABLE CONSEQUENCE. `ListAppend` joins the fragments with commas, so with all three
  // included collections populated `including` is
  //     "3 Products,2 Product Types,1 SKU"
  // and one replace yields
  //     "3 Products and 2 Product Types,1 SKU"
  // - the SECOND comma survives into the admin display. With exactly two of the three populated the
  // string has a single comma and the method looks correct, which is why the defect has survived:
  // it is invisible until a rate targets products AND product types AND SKUs at once. The excluding
  // half at L157-L159 is character-for-character the same code and fails identically.
  //
  // Reproduced by replacing only the first occurrence - `String.prototype.replace` with a STRING
  // pattern replaces exactly one occurrence, which is the same semantic, so the port needs no
  // special construction to be faithful. A `replaceAll` here would silently repair a defect that
  // changes what an administrator reads about which products a price rate covers.
  // Preserved deliberately; do not fix without a product decision.

  /**
   * `getAppliesTo` - the human-readable summary of what this rate covers.
   * [model/entity/PriceGroupRate.cfc:L95-L174]
   *
   * Eighty lines of string assembly in the source, reproduced step for step. The structure:
   *
   *   1. [L106-L108] if `getGlobalFlag()`, return the "all products" resource-bundle text and stop.
   *      Nothing below runs, and none of the six collections is consulted.
   *   2. [L111-L119] build one fragment per INCLUDED collection - `"N Product"`, `"N Product Type"`,
   *      `"N SKU"` - each pluralised by `IIF(count GT 1, DE('s'), DE(''))`.
   *   3. [L120-L128] `ListAppend` the non-empty fragments together, comma-delimited, in the fixed
   *      order products then product types then SKUs.
   *   4. [L129-L131] replace the FIRST comma with `" and "` - the preserved defect above.
   *   5. [L134-L159] repeat 2-4 for the three EXCLUDED collections.
   *   6. [L162-L172] assemble: `"Including: X"`, then `". "` if both halves exist, then
   *      `"Excluding: Y"`.
   *
   * FOUR POINTS OF FIDELITY WORTH STATING.
   *
   *   * THE PLURAL BOUNDARY IS `GT 1`, so a count of 1 is singular and 0 never reaches the
   *     pluraliser at all (the `arrayLen` guard skips it). Reproduced exactly.
   *   * THE FRAGMENT ORDER IS FIXED AND NOT SORTED: products, then product types, then SKUs.
   *     Observable in the output string, so it is part of the behaviour.
   *   * THE LABELS ARE HARDCODED ENGLISH, NOT `rbKey`s - `"Product"`, `"Product Type"`, `"SKU"`,
   *     `"Including: "`, `"Excluding: "` and `". "` are all literals in the source. Only the
   *     global-flag branch localises. That inconsistency is the source's, and it is preserved rather
   *     than smoothed: introducing keys for the literals would fabricate a mechanism this method
   *     does not have, and hardcoding English for the global branch would fabricate a translation.
   *   * `""` IS A LEGITIMATE RETURN. A non-global rate with all six collections empty returns the
   *     empty `finalString` initialised at [L97]. That is why this method does NOT raise for the
   *     empty case - only for a missing global label, where the return type has no spare value.
   *
   * TOTAL ON EVERY NON-GLOBAL PATH: it never throws unless `getGlobalFlag()` is set and no resolved
   * label was injected.
   *
   * @throws Error when `getGlobalFlag()` is true and no `appliesToAllProductsLabel` was supplied.
   */
  getAppliesTo(): string {
    // [model/entity/PriceGroupRate.cfc:L106-L108] the global short-circuit. Checked FIRST, before any
    // collection is counted, exactly as the source does.
    if (this.getGlobalFlag()) {
      const label: string | undefined = this.appliesToAllProductsLabel;
      if (label === undefined) {
        throw new Error(
          'PriceGroupRate.getAppliesTo needs the resolved text for the resource-bundle key ' +
            "'admin.pricegroup.edit.priceGroupRateAppliesToAllProducts' " +
            '[model/entity/PriceGroupRate.cfc:L107] because globalFlag is set, and this rate was ' +
            'hydrated without it. JavaRB is not ported, so the resolved label is supplied at ' +
            'hydration. No default is substituted: emitting the raw key would leak an identifier ' +
            'into an admin screen and emitting English would fabricate a translation.',
        );
      }
      return label;
    }

    // ---------- [model/entity/PriceGroupRate.cfc:L111-L131] Including ----------
    const includingFragments: string[] = [];

    // [L112-L114] products first.
    if (this.products.length > 0) {
      includingFragments.push(
        `${String(this.products.length)} Product${plural(this.products.length)}`,
      );
    }
    // [L115-L117] then product types.
    if (this.productTypes.length > 0) {
      includingFragments.push(
        `${String(this.productTypes.length)} Product Type${plural(this.productTypes.length)}`,
      );
    }
    // [L118-L120] then SKUs. (The source writes `SkusList` with a capital S here and at L127-L128
    // where every other fragment variable is lower-cased; CFML is case-insensitive so it is
    // cosmetic, and local identifiers are not observable to callers.)
    if (this.skus.length > 0) {
      includingFragments.push(`${String(this.skus.length)} SKU${plural(this.skus.length)}`);
    }

    // [L121-L128] `ListAppend` joins with the default comma delimiter, then [L129-L131] replaces
    // only the FIRST one - the preserved defect. `replace` with a STRING pattern is exactly CFML's
    // default `scope="one"`; `replaceAll` would repair the defect.
    const including: string = includingFragments.join(',').replace(',', ' and ');

    // ---------- [model/entity/PriceGroupRate.cfc:L134-L159] Excluding ----------
    // Character-for-character the same construction, over the three excluded collections. Note that
    // this half reads collections NO BIDIRECTIONAL HELPER CAN POPULATE - see the header - so in
    // practice it is almost always empty in a legacy installation.
    const excludingFragments: string[] = [];

    if (this.excludedProducts.length > 0) {
      excludingFragments.push(
        `${String(this.excludedProducts.length)} Product${plural(this.excludedProducts.length)}`,
      );
    }
    if (this.excludedProductTypes.length > 0) {
      excludingFragments.push(
        `${String(this.excludedProductTypes.length)} Product Type${plural(
          this.excludedProductTypes.length,
        )}`,
      );
    }
    if (this.excludedSkus.length > 0) {
      excludingFragments.push(
        `${String(this.excludedSkus.length)} SKU${plural(this.excludedSkus.length)}`,
      );
    }

    const excluding: string = excludingFragments.join(',').replace(',', ' and ');

    // ---------- [model/entity/PriceGroupRate.cfc:L161-L173] Assembly ----------
    let finalString: string = '';

    // [L162-L164] `if(len(including))` - an emptiness test, which for a plain string is exactly a
    // length test. Not `cfTruthy`, which raises on nullish and is a boolean coercion rather than an
    // emptiness check.
    if (including.length > 0) {
      finalString = `Including: ${including}`;
    }

    // [L166-L171] the `". "` separator is emitted ONLY when BOTH halves are present, which is why
    // the inner `if(len(including))` is nested inside the outer `if(len(excluding))` rather than
    // sitting beside it.
    if (excluding.length > 0) {
      if (including.length > 0) {
        finalString += '. ';
      }
      finalString += `Excluding: ${excluding}`;
    }

    // [L173] `""` when non-global with all six collections empty - a legitimate return, not a
    // failure.
    return finalString;
  }

  // ============  END: Non-Persistent Property Methods ==================

  // ============= START: Bidirectional Helper Methods ===================
  // [model/entity/PriceGroupRate.cfc:L178] opens this block and L258 closes it. Four pairs.

  /**
   * Attaches this rate to a price group, adding it to that price group's rate collection.
   * [model/entity/PriceGroupRate.cfc:L181-L186]
   *
   *   variables.priceGroup = arguments.priceGroup;
   *   if(isNew() or !arguments.priceGroup.hasPriceGroupRate( this )) {
   *     arrayAppend(arguments.priceGroup.getPriceGroupRates(), this);
   *   }
   *
   * BOTH HALVES OF THE DISJUNCT ARE PRESERVED, in order, with CFML's short-circuit semantics that
   * JavaScript's `||` reproduces exactly. `isNew()` first: an unsaved rate is appended
   * unconditionally, because its `''` key makes the membership test meaningless. Only then is
   * `hasPriceGroupRate` consulted, which keeps a saved rate from being appended twice.
   *
   * Note WHOSE newness is tested - `this`, the rate. Contrast
   * model/entity/PromotionCode.cfc:L123, where the near-side guard tests the ARGUMENT's newness
   * instead, and contrast this class's own `addProductType` [L200], which tests the ARGUMENT for its
   * near side and `this` for its far side. The polarities differ per site and none is normalised.
   *
   * `arrayAppend` becomes `push` onto the LIVE array from `PriceGroup.getPriceGroupRates()`. The
   * mutation must be observable through that accessor, which is exactly why priceGroup.ts declares
   * that collection LIVE and cites THIS line as its census site.
   */
  setPriceGroup(priceGroup: PriceGroup): void {
    this.priceGroup = priceGroup;

    if (this.isNew() || !priceGroup.hasPriceGroupRate(this)) {
      priceGroup.getPriceGroupRates().push(this);
    }
  }

  /**
   * Detaches this rate from a price group.
   * [model/entity/PriceGroupRate.cfc:L187-L196]
   *
   * THE ARGUMENT IS OPTIONAL, exactly as the legacy declaration is - `any priceGroup` with no
   * `required`. The default branch tests `!== undefined`, reproducing
   * `structKeyExists(arguments, "priceGroup")` and NEVER truthiness: an argument that was passed is
   * a different state from one that was not.
   *
   * `arrayFind` IS 1-BASED AND RETURNS 0 ON A MISS, which is why the legacy guard is `index > 0`.
   * `Array.prototype.findIndex` is 0-BASED and returns `-1`, so the equivalent guard is an explicit
   * `!== -1` - never a truthiness test, which would wrongly treat the valid index 0 as "not found".
   *
   * ★ THE LEGACY SPLICE MATCHES BY REFERENCE, NOT BY KEY. [L192] is
   * `arrayFind(arguments.priceGroup.getPriceGroupRates(), this)`, and CFML `arrayFind` with an object
   * needle compares object identity. Reproduced with `indexOf`, deliberately, rather than upgraded
   * to a primary-key comparison: a key comparison would ALSO remove a different in-memory object
   * representing the same saved row, which is a strictly wider behaviour. Contrast the CONTAINMENT
   * probes above, which are key-based because the framework dispatcher's `has*` is Hibernate
   * collection-contains rather than `arrayFind`. Two different legacy mechanisms, two different
   * ports - not an inconsistency in this file.
   *
   * `structDelete(variables, "priceGroup")` becomes assigning `undefined`, and it runs
   * UNCONDITIONALLY - outside the index guard - just as at [L195].
   *
   * LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L187-L192]: when the argument is omitted AND this
   * rate has no stored price group, the legacy assigns null into `arguments.priceGroup` at [L189] and
   * then invokes `.getPriceGroupRates()` on it at [L192] - a method call on null, which throws under
   * every CFML engine. Reproduced rather than smoothed over: returning early would silently skip the
   * [L195] field clear as well, so it would not be the same behaviour by a different route. The
   * identical unguarded shape appears at model/entity/PriceGroup.cfc:L116-L122,
   * model/entity/Category.cfc:L107-L112 and model/entity/ProductType.cfc:L155-L159, so it is the
   * framework-wide idiom rather than a local slip.
   *
   * @throws Error when called with no argument on a rate that has no price group.
   */
  removePriceGroup(priceGroup?: PriceGroup): void {
    const targetPriceGroup: PriceGroup | undefined =
      priceGroup !== undefined ? priceGroup : this.priceGroup;

    if (targetPriceGroup === undefined) {
      throw new Error(
        'PriceGroupRate.removePriceGroup was called with no argument on a rate that has no ' +
          'priceGroup. This reproduces the legacy runtime failure at ' +
          'model/entity/PriceGroupRate.cfc:L189-L192, where the omitted argument defaults to a null ' +
          'price group and getPriceGroupRates() is then invoked on it.',
      );
    }

    const siblingRates: PriceGroupRate[] = targetPriceGroup.getPriceGroupRates();
    const index: number = siblingRates.indexOf(this);

    if (index !== -1) {
      siblingRates.splice(index, 1);
    }

    this.priceGroup = undefined;
  }

  /**
   * Adds a product type to this rate, on BOTH sides.
   * [model/entity/PriceGroupRate.cfc:L199-L206]
   *
   *   if(arguments.productType.isNew() or !hasProductType(arguments.productType)) {
   *     arrayAppend(variables.productTypes, arguments.productType);
   *   }
   *   if(isNew() or !arguments.productType.hasPriceGroupRate( this )) {
   *     arrayAppend(arguments.productType.getPriceGroupRates(), this);
   *   }
   *
   * ★ NOTE THE TWO DIFFERENT NEWNESS TESTS, and that they are NOT the same entity. The NEAR-side
   * guard tests `arguments.productType.isNew()` - the thing being added - while the FAR-side guard
   * tests `isNew()`, i.e. THIS rate. That is correct in both cases and is preserved verbatim: each
   * guard asks about the entity whose key would make the corresponding membership probe meaningless.
   * Reversing either would change which appends are skipped.
   *
   * THE NEAR SIDE MUTATES `variables.productTypes` DIRECTLY, not through the accessor. That is why
   * `getProductTypes()` can safely hand out a `readonly` view: the only writer is inside this class.
   *
   * THE FAR SIDE PUSHES ONTO `ProductType.getPriceGroupRates()`, which productType.ts declares LIVE
   * and cites THIS line as its census site.
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
   * Removes a product type from this rate, on BOTH sides.
   * [model/entity/PriceGroupRate.cfc:L207-L216]
   *
   * TWO INDEPENDENT SPLICES WITH TWO INDEPENDENT GUARDS, exactly as the source has them: a miss on
   * one side does not prevent the other side's removal. Both match BY REFERENCE (`arrayFind` with an
   * object needle), so both use `indexOf` - see `removePriceGroup()` for why that is deliberate
   * rather than an oversight.
   *
   * TOTAL: it never throws. `required any productType` means the argument is always present, so there
   * is no null-default branch to reproduce.
   */
  removeProductType(productType: ProductType): void {
    // [L208-L211] the near side.
    const thisIndex: number = this.productTypes.indexOf(productType);
    if (thisIndex !== -1) {
      this.productTypes.splice(thisIndex, 1);
    }

    // [L212-L215] the far side, guarded separately.
    const farSideRates: PriceGroupRate[] = productType.getPriceGroupRates();
    const thatIndex: number = farSideRates.indexOf(this);
    if (thatIndex !== -1) {
      farSideRates.splice(thatIndex, 1);
    }
  }

  /**
   * Adds a product to this rate, on BOTH sides.
   * [model/entity/PriceGroupRate.cfc:L219-L226]
   *
   * Structurally identical to `addProductType()` - near-side guard on the ARGUMENT's newness,
   * far-side guard on THIS rate's newness. See that method for the reasoning.
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
   * Removes a product from this rate, on BOTH sides.
   * [model/entity/PriceGroupRate.cfc:L227-L236]
   *
   * Two independent reference-based splices with two independent guards. TOTAL.
   */
  removeProduct(product: Product): void {
    const thisIndex: number = this.products.indexOf(product);
    if (thisIndex !== -1) {
      this.products.splice(thisIndex, 1);
    }

    const farSideRates: PriceGroupRate[] = product.getPriceGroupRates();
    const thatIndex: number = farSideRates.indexOf(this);
    if (thatIndex !== -1) {
      farSideRates.splice(thatIndex, 1);
    }
  }

  /**
   * Adds a SKU to this rate, on BOTH sides.
   * [model/entity/PriceGroupRate.cfc:L239-L246]
   *
   * Structurally identical to `addProductType()`. See that method for the reasoning.
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
   * Removes a SKU from this rate, on BOTH sides.
   * [model/entity/PriceGroupRate.cfc:L247-L256]
   *
   * Two independent reference-based splices with two independent guards. TOTAL.
   */
  removeSku(sku: Sku): void {
    const thisIndex: number = this.skus.indexOf(sku);
    if (thisIndex !== -1) {
      this.skus.splice(thisIndex, 1);
    }

    const farSideRates: PriceGroupRate[] = sku.getPriceGroupRates();
    const thatIndex: number = farSideRates.indexOf(this);
    if (thatIndex !== -1) {
      farSideRates.splice(thatIndex, 1);
    }
  }

  // NO HELPERS EXIST FOR THE THREE EXCLUDED COLLECTIONS, and none is authored here. See the header:
  // model/entity/PriceGroupRate.cfc declares `addProductType`/`removeProductType`,
  // `addProduct`/`removeProduct` and `addSku`/`removeSku` and NOTHING for `excludedProductTypes`,
  // `excludedProducts` or `excludedSkus`. Three other entities call the absent methods -
  // model/entity/ProductType.cfc:L216/L219, model/entity/Product.cfc:L740/L743 and
  // model/entity/Sku.cfc:L680/L683 - and each of those six calls reaches the `onMissingMethod` throw
  // at org/Hibachi/HibachiEntity.cfc:L565, which is reproduced as a throwing stub in each of those
  // three modules.
  //
  // AUTHORING THE MISSING PAIRS HERE WOULD SILENTLY REPAIR SIX PRESERVED DEFECTS AT ONCE, turning
  // three throwing stubs in three other files into working code and quietly making the three
  // excluded collections populatable for the first time. That is a behavioural change to what a
  // price rate covers, so it is not made. This absence is a CONTRACT, exactly like the
  // `getPromotionAccounts()` anti-contract recorded in src/domain/entities/promotionAccount.ts.

  // =============  END:  Bidirectional Helper Methods ===================

  // ================== START: Overridden Methods ========================
  // [model/entity/PriceGroupRate.cfc:L260] opens this block and L278 closes it.

  /**
   * `getAmountFormatted` - the admin display form of `amount`.
   * [model/entity/PriceGroupRate.cfc:L262-L268]
   *
   *   if(getAmountType() == "percentageOff") {
   *     return getAmount() & "%";
   *   } else {
   *     return formatValue(getAmount(),"currency");
   *   }
   *
   * THIS METHOD IS WHAT `hb_formatType="custom"` ON [L54] ROUTES TO. The attribute and the method are
   * two halves of one mechanism and both are preserved.
   *
   * THREE POINTS OF FIDELITY.
   *
   *   * `getAmountType() == "percentageOff"` IS A CASE-INSENSITIVE CFML COMPARISON, so the port folds
   *     the left side before comparing. A case-sensitive `===` would send `"PercentageOff"` down the
   *     currency branch, formatting a percentage as money - a wrong number on an admin screen.
   *   * `getAmount() & "%"` IS CFML NUMERIC STRINGIFICATION, which DROPS TRAILING ZEROS: a stored
   *     `10.50` renders `"10.5%"`, not `"10.50%"`. `Money.toDecimalString()` reproduces that exactly -
   *     every significant digit, no imposed scale, canonicalised. Using `toFixed2()` would emit
   *     `"10.50%"` and be wrong; that method is presentation-only for two-decimal money and is
   *     documented as such.
   *   * THE CURRENCY BRANCH GOES THROUGH AN INJECTED PORT, because `formatValue` lives on the
   *     non-ported org/Hibachi/HibachiUtilityService.cfc and its currency implementation reaches
   *     `getHibachiScope().getRBLocale()` [org/Hibachi/HibachiUtilityService.cfc:L36, L39] - ambient
   *     request state that transformation rule T6 replaces with an explicit dependency. The legacy
   *     call passes no format details, so it always took the `"USD"` default at
   *     [org/Hibachi/HibachiUtilityService.cfc:L38-L39].
   *
   * ★ RAISES RATHER THAN SUBSTITUTING, on both missing inputs. The return type is `string` and it has
   * no spare value: every possible default - `""`, `"0%"`, `"$0.00"` - is a well-formed WRONG price
   * on an administrator's screen, which is strictly worse than a loud failure. That is the same
   * dividing line recorded on `listGetAt` (where `''` is a valid element) and on
   * `Option.getImageDirectory()` (where every default is a well-formed wrong path).
   *
   * @throws Error when `amount` is absent, or when the currency branch is reached with no injected
   *   formatter.
   */
  getAmountFormatted(): string {
    const amount: Money | undefined = this.amount;

    if (amount === undefined) {
      throw new Error(
        'PriceGroupRate.getAmountFormatted has no amount to format. ' +
          'model/entity/PriceGroupRate.cfc:L54 declares amount without notNull, so the column is ' +
          'nullable, and L263/L266 dereference it with no guard - CFML raises there too. No default ' +
          'is substituted: every candidate ("", "0%", a zero currency string) is a well-formed but ' +
          'WRONG price on an admin screen.',
      );
    }

    // [model/entity/PriceGroupRate.cfc:L263] CFML `==` on strings is CASE-INSENSITIVE.
    if ((this.amountType ?? '').toLowerCase() === 'percentageoff') {
      // [L264] `getAmount() & "%"` - CFML numeric stringification drops trailing zeros, which
      // `toDecimalString()` reproduces. NOT `toFixed2()`.
      return `${amount.toDecimalString()}%`;
    }

    // [L266] `formatValue(getAmount(),"currency")`.
    const formatter: CurrencyValueFormatter | undefined = this.currencyValueFormatter;
    if (formatter === undefined) {
      throw new Error(
        'PriceGroupRate.getAmountFormatted reached its currency branch on a rate hydrated without ' +
          'a currency formatter. model/entity/PriceGroupRate.cfc:L266 calls ' +
          'formatValue(getAmount(),"currency"), which lives on the non-ported ' +
          'org/Hibachi/HibachiUtilityService.cfc and reaches getHibachiScope().getRBLocale() for ' +
          'its locale - ambient request state replaced by an explicit dependency under ' +
          'transformation rule T6. The legacy call supplies no format details and therefore always ' +
          'took the "USD" default at org/Hibachi/HibachiUtilityService.cfc:L38-L39.',
      );
    }

    return formatter.formatCurrency(amount);
  }

  /**
   * `getSimpleRepresentationPropertyName` [model/entity/PriceGroupRate.cfc:L270-L272]
   *
   * Returns the literal `"DisplayName"` - WITH A CAPITAL D, exactly as the source writes it.
   *
   * WHY THE CASING IS PRESERVED VERBATIM RATHER THAN NORMALISED. The framework base uses this value
   * to BUILD A METHOD NAME: `org/Hibachi/HibachiEntity.cfc:L59` invokes
   * `get#getSimpleRepresentationPropertyName()#()`, so `"DisplayName"` yields `getDisplayName()` and
   * resolves only because CFML method names are case-insensitive. The value is therefore a
   * COMPONENT OF A DATA CONTRACT the admin reads, not an internal identifier, and changing it -
   * even to the more consistent `"displayName"` - would change a string the legacy framework
   * consumes. Preserved as-is; the TypeScript method it names is `getDisplayName()` below.
   *
   * ★ THIS ENTITY DECLARES THE PROPERTY-NAME VARIANT, NOT THE OVERRIDE VARIANT. Contrast
   * model/entity/ProductType.cfc:L273, which overrides `getSimpleRepresentation()` itself. The base
   * throws at [org/Hibachi/HibachiEntity.cfc:L87] when NEITHER is supplied; this component supplies
   * the property-name form, so no `getSimpleRepresentation()` is authored here.
   */
  getSimpleRepresentationPropertyName(): string {
    return 'DisplayName';
  }

  /**
   * `getDisplayName` - the label `getSimpleRepresentationPropertyName()` names.
   * [model/entity/PriceGroupRate.cfc:L274-L276]
   *
   *   return getPriceGroup().getPriceGroupName() & " - " & getAmount() & " - " & getAmountType();
   *
   * THREE UNGUARDED DEREFERENCES IN ONE EXPRESSION, and all three are preserved:
   *
   *   * `getPriceGroup()` is nullable [L67, no `notNull`] and `.getPriceGroupName()` is called on it
   *     directly - a CFML null-reference error for an unattached or unjoined rate. Raised here.
   *   * `getAmount()` is nullable [L54] and is string-concatenated - raised here for the same reason
   *     `getAmountFormatted()` raises.
   *   * `getAmountType()` is nullable [L55] and is string-concatenated. CFML concatenating null
   *     yields the empty string rather than raising, so this one is reproduced as `?? ''` rather
   *     than as a raise. Three nullable reads, two raises and one empty-string fallback - the
   *     difference is CFML's, not a choice made here.
   *
   * `getPriceGroupName()` IS ITSELF NULLABLE on the far side, and its `undefined` is folded to the
   * empty string for the same CFML-concatenation reason. Note the asymmetry with
   * `PromotionPeriod.getSimpleRepresentation()`, which RAISES on a null name - because that method
   * RETURNS the name directly under a `returntype="string"` declaration, where CFML enforces the
   * coercion. Here the name is only CONCATENATED, and concatenation is total. Same nullable column,
   * two different faithful outcomes, decided by what the legacy does with the value.
   *
   * THE SEPARATOR IS THE THREE CHARACTERS `" - "`, space-hyphen-space, twice. Preserved byte for
   * byte.
   *
   * @throws Error when this rate has no materialized price group, or no amount.
   */
  getDisplayName(): string {
    const priceGroup: PriceGroup | undefined = this.priceGroup;

    if (priceGroup === undefined) {
      throw new Error(
        'PriceGroupRate.getDisplayName was called on a rate with no materialized priceGroup. ' +
          'model/entity/PriceGroupRate.cfc:L275 calls getPriceGroup().getPriceGroupName() with no ' +
          'null guard, so an unattached or unjoined rate is a CFML null-reference error there too. ' +
          'Reproduced rather than smoothed into a partial label.',
      );
    }

    const amount: Money | undefined = this.amount;

    if (amount === undefined) {
      throw new Error(
        'PriceGroupRate.getDisplayName has no amount to include. ' +
          'model/entity/PriceGroupRate.cfc:L54 declares amount without notNull and L275 ' +
          'concatenates it with no guard. No default is substituted: a label reading " - 0 - " ' +
          'misstates the rate.',
      );
    }

    // [L275] CFML concatenation folds a null string to `''`; only the two dereferences above raise.
    // `toDecimalString()` reproduces CFML numeric stringification - trailing zeros dropped.
    return `${priceGroup.getPriceGroupName() ?? ''} - ${amount.toDecimalString()} - ${
      this.amountType ?? ''
    }`;
  }

  // ==================  END:  Overridden Methods ========================

  // =================== START: ORM Event Hooks  =========================
  // [model/entity/PriceGroupRate.cfc:L280] opens this block and L282 closes it, and IT IS EMPTY -
  // the two lines are adjacent with nothing between them.
  //
  // SO NEITHER `preInsert()` NOR `preUpdate()` IS DECLARED HERE, deliberately. The folder's lifecycle
  // contract is `preInsert(): void` / `preUpdate(oldData?): void` on the three entities that maintain
  // derived state on save - category.ts, priceGroup.ts and productType.ts, each maintaining a
  // materialized ID path. This entity maintains none, so authoring empty hooks would assert a
  // maintenance obligation the source does not have and would make a reader look for the path this
  // class does not own.
  //
  // The empty banner is recorded rather than omitted so a reviewer diffing this file against the CFC
  // finds the same structure, and so the absence reads as a decision rather than an oversight.
  // ===================  END:  ORM Event Hooks  =========================
}

/**
 * `IIF(count GT 1, DE('s'), DE(''))` - the pluraliser used six times in `getAppliesTo()`.
 * [model/entity/PriceGroupRate.cfc:L113, L116, L119, L136, L139, L142]
 *
 * Module-local and UN-EXPORTED. It is not a CFML semantic-parity helper - `src/lib/cfml/` holds
 * those, and this is not one: it is one entity's display convention, appearing nowhere else in the
 * in-scope slice. Promoting it to the shared library would imply a generality it does not have.
 *
 * THE BOUNDARY IS `GT 1`, so 1 is singular. A count of 0 never reaches here at all, because every
 * call site is inside an `arrayLen(...)` guard - which means the `''` branch is only ever taken for
 * exactly 1. That is worth stating because it makes the function look more permissive than its
 * reachable domain.
 *
 * `DE()` is CFML's delayed-evaluation wrapper, required because `IIF` evaluates its branches as
 * expressions rather than as literals. It has no semantic effect on the returned string and needs no
 * equivalent here.
 */
function plural(count: number): string {
  return count > 1 ? 's' : '';
}

// ---------------------------------------------------------------------------
// WHAT THE TEST TIER MUST PIN FOR THIS MODULE (all NET-NEW - `PriceGroupRate` has no legacy test)
//
//   1. ALL SIX collection accessors are `readonly` views and NOT live: a push through the returned
//      reference must be impossible at compile time, and the census reason must be named in the test
//      so a future "consistency" change has to argue with the census rather than with a style
//      preference. This is the mirror image of assertion 1 in productType.ts, and pinning both sides
//      is what makes the owner/inverse inversion regression-proof.
//   2. Every collection defaults to `[]` when the constructor omits it - never `undefined`.
//   3. `getAppliesTo()` on a global rate returns the injected label VERBATIM and consults NONE of
//      the six collections - assert with all six populated, so a leaked count would be visible.
//   4. `getAppliesTo()` on a global rate with NO injected label RAISES, and the message names the
//      resource-bundle key.
//   5. `getAppliesTo()` on a non-global rate with all six collections empty returns `''` and does
//      NOT raise. This is the assertion that stops a well-meaning "surely this should throw".
//   6. ★ THE PRESERVED `Replace` DEFECT, asserted POSITIVELY. With products AND product types AND
//      SKUs all populated, the result must be exactly `"Including: 3 Products and 2 Product Types,1 SKU"`
//      - the SECOND comma SURVIVES. A test asserting `" and "` twice would be asserting the repaired
//      behaviour and must not be written.
//   7. `getAppliesTo()` with exactly TWO included collections yields a single `" and "` and no
//      surviving comma - the case that makes the defect invisible, worth pinning so the contrast in
//      assertion 6 is unmistakable.
//   8. The plural boundary: a count of 1 yields `"1 Product"` and a count of 2 yields `"2 Products"`.
//      Assert all three nouns - `Product`, `Product Type`, `SKU`.
//   9. Fragment ORDER is products, then product types, then SKUs - assert the exact string, not a
//      set membership.
//  10. The excluding half reproduces assertions 6-9 identically, and the `". "` joiner appears ONLY
//      when both halves are non-empty. Assert `Including` alone, `Excluding` alone, and both.
//  11. `getAmountTypeOptions()` returns exactly three rows, in order, with values
//      `percentageOff`/`amountOff`/`amount` and names `define.percentageOff`/`define.amountOff`/
//      `define.fixedAmount`. ★ Assert the third pair's name/value MISMATCH explicitly - that is the
//      preserved source quirk most likely to be "tidied" later.
//  12. `getAmountTypeOptions()` returns a FRESH array each call - two calls must not share identity.
//  13. `getAmountFormatted()` on `percentageOff` renders CFML numeric stringification: a stored
//      `10.50` yields `"10.5%"` and NOT `"10.50%"`. This is the assertion that catches a `toFixed2()`
//      regression.
//  14. `getAmountFormatted()` matches `amountType` CASE-INSENSITIVELY: `"PercentageOff"` and
//      `"PERCENTAGEOFF"` both take the percentage branch.
//  15. `getAmountFormatted()` delegates to the injected formatter on every non-percentage branch -
//      `amountOff`, `amount`, an unrecognised value, and `undefined`.
//  16. `getAmountFormatted()` RAISES with no `amount`, and RAISES on the currency branch with no
//      formatter - two distinct messages, both asserted.
//  17. `getSimpleRepresentationPropertyName()` returns exactly `"DisplayName"` with a CAPITAL D.
//      Assert the literal; the casing is part of the framework data contract.
//  18. `getDisplayName()` joins with the three characters `" - "` twice, and renders the amount with
//      trailing zeros DROPPED.
//  19. `getDisplayName()` folds an `undefined` `amountType` to `''` (CFML concatenation is total) but
//      RAISES on a missing price group and on a missing amount. All three behaviours in one suite -
//      the asymmetry is the point.
//  20. `getGlobalFlag()` resolves `undefined`, `null`, `0`, `1`, `'0'`, `'1'`, `'true'` and `'false'`
//      exactly as `cfBoolean()` specifies, DESPITE the column's `default="false"`.
//  21. `isNew()` is TRUE for `priceGroupRateID: ''` and FALSE otherwise.
//  22. `setPriceGroup()` appends to the price group's LIVE rate array unconditionally when THIS rate
//      is new, and at most once when it is saved.
//  23. `removePriceGroup()` splices BY REFERENCE - a distinct object with the SAME primary key must
//      NOT be removed. That is the assertion that documents the arrayFind-vs-Hibernate-contains
//      distinction, and it must not be "fixed" to a key comparison.
//  24. `removePriceGroup()` clears the local reference EVEN WHEN the rate was not found in the
//      collection, and RAISES when called with no argument on an unattached rate.
//  25. All three `add*` pairs guard the NEAR side on the ARGUMENT's newness and the FAR side on THIS
//      rate's newness. Construct the four combinations and assert which appends happen - reversing
//      either polarity must fail a test.
//  26. All three `remove*` methods splice BOTH sides with INDEPENDENT guards: a needle present on one
//      side only must still be removed from that side.
//  27. The three `has*` probes match by PRIMARY KEY across two distinct objects representing the same
//      saved row, and fall back to REFERENCE identity when the candidate's key is `''`.
//  28. ★ THE ANTI-CONTRACT: assert the ABSENCE of `addExcludedProductType`,
//      `removeExcludedProductType`, `addExcludedProduct`, `removeExcludedProduct`, `addExcludedSku`
//      and `removeExcludedSku` on the prototype. Adding any of the six would silently repair six
//      preserved defects in three other modules, so the absence is pinned the same way
//      `promotionAccount.ts`'s anti-contract is.
//  29. `preInsert` and `preUpdate` are ABSENT from this class - the source's ORM hook banner is
//      empty. Assert that too, so a future "every entity needs hooks" sweep has to read this note.
// ---------------------------------------------------------------------------
