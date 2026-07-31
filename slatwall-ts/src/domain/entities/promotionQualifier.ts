// ---------------------------------------------------------------------------
// slatwall-ts - PromotionQualifier entity
//
// PORT OF model/entity/PromotionQualifier.cfc (373 lines, confirmed by `wc -l`).
//
// THE COMPONENT DECLARATION, VERBATIM [model/entity/PromotionQualifier.cfc:L49]
//
//   component displayname="Promotion Qualifier" entityname="SlatwallPromotionQualifier"
//   table="SwPromoQual" persistent="true" output="false" accessors="true"
//   extends="HibachiEntity" cacheuse="transactional" hb_serviceName="promotionService"
//   hb_permission="promotionPeriod.promotionQualifiers" {
//
// Schema continuity is a binding constraint: entity property metadata IS the contract.
// ★ NOTE THE ABBREVIATED PHYSICAL TABLE NAME - `SwPromoQual`, NOT `SwPromotionQualifier`.
// The abbreviation is not cosmetic: it exists because this entity owns THIRTEEN
// many-to-many link tables whose names must fit MySQL's 64-character identifier limit,
// and five of those link tables are abbreviated further still (`SwPromoQualExclBrand`,
// `SwPromoQualShipAddressZone`, and so on). Every one of the fourteen names below is
// carried forward verbatim. No migration, no rename, no new table, no column change.
//
// `hb_permission="promotionPeriod.promotionQualifiers"` nests this entity's permissions
// under its parent rather than under itself, and `hb_serviceName="promotionService"` is
// why there is no `PromotionQualifierService` to port and no such omission to explain.
// ★ CONTRAST model/entity/PromotionReward.cfc:L49, whose equivalent attribute reads
// `hb_permission="promotionPeriod.promtionRewards"` - MISSPELLED. This entity's is
// spelled correctly, which is what makes the sibling's misspelling identifiable as a
// defect rather than a convention.
//
// ★ WHAT THIS ENTITY IS FOR. It is the GATE half of the promotion engine: `Promotion` ->
// `PromotionPeriod` -> { qualifiers decide WHETHER a promotion applies, rewards decide
// WHAT it gives }. `getQualifierQualificationDetails()`
// [model/service/PromotionService.cfc:L629-L750] reads this entity's ten numeric gates
// and thirteen collections to answer that question, and
// `getOrderItemInQualifier()` [model/service/PromotionService.cfc:L852-L919] walks the
// membership collections. Both sit inside the must-preserve discount pipeline, so every
// property below is load-bearing rather than decorative.
//
// THE TEN NUMERIC GATES, and why they are three different TypeScript types:
//
//   | locator | property                 | ormtype     | hb_formatType | hb_nullRBKey      | TS type    |
//   |---------|--------------------------|-------------|---------------|-------------------|------------|
//   | L55     | minimumOrderQuantity     | integer     | -             | define.0          | number     |
//   | L56     | maximumOrderQuantity     | integer     | -             | define.unlimited  | number     |
//   | L57     | minimumOrderSubtotal     | big_decimal | currency      | define.0          | Money      |
//   | L58     | maximumOrderSubtotal     | big_decimal | currency      | define.unlimited  | Money      |
//   | L59     | minimumItemQuantity      | integer     | -             | define.0          | number     |
//   | L60     | maximumItemQuantity      | integer     | -             | define.unlimited  | number     |
//   | L61     | minimumItemPrice         | big_decimal | currency      | define.0          | Money      |
//   | L62     | maximumItemPrice         | big_decimal | currency      | define.unlimited  | Money      |
//   | L63     | minimumFulfillmentWeight | big_decimal | weight        | define.0          | DecimalString |
//   | L64     | maximumFulfillmentWeight | big_decimal | weight        | define.unlimited  | DecimalString |
//
// THE THREE-WAY TYPE SPLIT IS DERIVED FROM `hb_formatType`, NOT GUESSED. Four gates are
// integer counts. Four are `hb_formatType="currency"` and are compared against order
// subtotals and item prices, so they are `Money` - which is also what keeps them inside
// the project's single-arithmetic-surface rule. The last two are `hb_formatType="weight"`
// and are compared against `orderFulfillment.getTotalShippingWeight()`
// [model/service/PromotionService.cfc:L695, L697]; typing a WEIGHT as `Money` would
// assert a currency it does not have and would hand it currency formatting it must never
// receive, so they are the branded plain-decimal string instead - arbitrary precision
// preserved, currency semantics correctly absent.
//
// ★ EVERY ONE OF THE TEN IS NULLABLE, AND NULL IS THE "NO GATE" SIGNAL. That is exactly
// what the `hb_nullRBKey` attributes encode: a null MINIMUM displays as `define.0` and a
// null MAXIMUM displays as `define.unlimited`. The engine reads it the same way -
// [model/service/PromotionService.cfc:L695, L697] guards every comparison with
// `!isNull(...)` first, so an absent gate imposes no constraint. Substituting `0` for a
// null minimum would be harmless; substituting `0` for a null MAXIMUM would disqualify
// every order. All ten map to `... | undefined` and no default is ever supplied.
//
// THE ASSOCIATION CENSUS, receiver-qualified against every
// `arrayAppend`/`arrayDeleteAt` site in model/entity/*.cfc.
//
//   | locator | property                | far side          | link table                    | accessor |
//   |---------|-------------------------|-------------------|-------------------------------|----------|
//   | L73     | fulfillmentMethods      | FulfillmentMethod | SwPromoQualFulfillmentMethod  | readonly |
//   | L74     | shippingMethods         | ShippingMethod    | SwPromoQualShippingMethod     | readonly |
//   | L75     | shippingAddressZones    | AddressZone       | SwPromoQualShipAddressZone    | readonly |
//   | L77     | brands                  | Brand             | SwPromoQualBrand              | readonly |
//   | L78     | options                 | Option            | SwPromoQualOption             | readonly |
//   | L79     | skus                    | Sku               | SwPromoQualSku                | readonly |
//   | L80     | products                | Product           | SwPromoQualProduct            | readonly |
//   | L81     | productTypes            | ProductType       | SwPromoQualProductType        | readonly |
//   | L83     | excludedBrands          | Brand             | SwPromoQualExclBrand          | readonly |
//   | L84     | excludedOptions         | Option            | SwPromoQualExclOption         | readonly |
//   | L85     | excludedSkus            | Sku               | SwPromoQualExclSku            | readonly |
//   | L86     | excludedProducts        | Product           | SwPromoQualExclProduct        | readonly |
//   | L87     | excludedProductTypes    | ProductType       | SwPromoQualExclProductType    | readonly |
//
// ★ ALL THIRTEEN ARE `readonly`, and the uniformity is the finding. NONE declares
// `inverse="true"`, so this entity OWNS all thirteen link tables, and an owner mutates
// its own `variables.<x>` directly rather than reaching through its own accessor.
// Nothing outside this class ever appends to `promotionQualifier.getBrands()` - zero
// census sites for any of the thirteen. That is the exact mirror image of
// `Brand.promotionQualifiers`, `Option.promotionQualifiers`,
// `ProductType.promotionQualifiers` and their four exclusion siblings, every one of
// which is `inverse="true"` and LIVE precisely BECAUSE this class reaches into them. The
// owner/inverse liveness inversion is the single most load-bearing structural fact in
// the entity folder, and this file - with thirteen owned collections and not one
// exception - is its most emphatic instance.
//
// ★ THREE OF THE THIRTEEN HAVE NO BIDIRECTIONAL HELPER AT ALL, AND THREE OUT-OF-SCOPE
// ENTITIES CALL THE HELPERS THAT ABSENCE IMPLIES. This component hand-writes ten pairs -
// for brands, options, skus, products, productTypes and their five excluded siblings -
// plus the promotionPeriod pair, and NOTHING for `fulfillmentMethods`, `shippingMethods`
// or `shippingAddressZones`. Verified by grep across all 373 lines. Meanwhile:
//
//   * model/entity/FulfillmentMethod.cfc:L107 calls `addFulfillmentMethods( this )` -
//     NOTE THE PLURAL. No such method exists here under either spelling.
//   * model/entity/ShippingMethod.cfc:L97 calls `addShippingMethod( this )`. No such
//     method exists here.
//   * model/entity/AddressZone.cfc:L102 calls `addAddressZone( this )` - and the
//     property is named `shippingAddressZones`, so even the intended name would have
//     been `addShippingAddressZone`. No such method exists here under any spelling.
//
// `add*` and `remove*` match NONE of the eleven `onMissingMethod` patterns at
// [org/Hibachi/HibachiEntity.cfc:L507-L565] - every pattern is `has*`- or `get*`-prefixed
// - and the `getAttributeValue` fallback at L559 is `get`-only, so all six calls reach
// the throw at L565. So those three collections are declared, persisted, READ BY THE
// ENGINE [model/service/PromotionService.cfc:L699, L701, L703], and populatable ONLY by
// direct framework population - never by a bidirectional helper.
//
// THE THREE MISSING PAIRS ARE DELIBERATELY NOT AUTHORED HERE. All three callers are
// out-of-scope entities, so no throwing stub is needed anywhere in scope; the absence is
// recorded as a CONTRACT at the collection accessors, exactly like the
// `getPromotionAccounts()` anti-contract in src/domain/entities/promotionAccount.ts and
// the excluded-helper anti-contract in src/domain/entities/priceGroupRate.ts. Authoring
// them would silently repair six preserved defects and make three collections reachable
// for the first time, changing which orders qualify for a promotion - i.e. changing
// money.
//
// ONE FURTHER DEFECT IS VISIBLE FROM THIS ENTITY BUT LIVES IN THE SERVICE: the
// shipping-address-zones clause at [model/service/PromotionService.cfc:L703] re-tests
// `hasShippingMethod(...)` instead of testing the zone condition, so
// `shippingAddressZones` is effectively never evaluated as a zone gate. Registered
// against the service; noted at `getShippingAddressZones()` below so a reader of this
// file is not misled into thinking the collection is consulted as intended.
//
// THE `extends` CHAIN IS THREE LEVELS DEEP, NOT TWO. `extends="HibachiEntity"` on L49 is
// UNQUALIFIED, so it resolves to the local model/entity/HibachiEntity.cfc (274 lines),
// whose own L49 reads `component output="false" accessors="true" persistent="false"
// extends="Slatwall.org.Hibachi.HibachiEntity"`. Neither level is ported: an entity
// reaching outward through a service locator is exactly the pattern the ESLint
// `no-restricted-imports` layer boundary exists to make impossible.
//
// ★ VALIDATION: THERE IS NO model/validation/PromotionQualifier.json, AND THAT ABSENCE
// IS DELIBERATE RATHER THAN AN OVERSIGHT TO CORRECT. Twelve of the in-scope entities have
// a validation file and six do not - `Category`, `PromotionQualifier`, `PromotionApplied`,
// `PromotionAccount`, `Product_AddOption` and `Product_AddOptionGroup`. Validation
// coverage is ported AS IT IS rather than completed, so no schema is invented for this
// entity. In practical terms that means NOTHING validates the ten numeric gates: a
// negative minimum, or a maximum below its own minimum, is accepted by the legacy system
// and must be accepted here.
//
// TEST COVERAGE FOR THIS MODULE IS NET-NEW. `PromotionQualifier` has no legacy test. Only
// brand.ts and product.ts have legacy antecedents. The contract the test tier has to pin
// is enumerated at the foot of this file.
//
// NO USER RULES WERE PROVIDED. The enterprise substitute standard applies at full
// strength - maximal strictness, no `any` and no suppression comment, one exported unit
// per file, no barrel, and every judgment call annotated where it was made.
// ---------------------------------------------------------------------------

import type { DecimalString } from '../../lib/cfml/numberFormat.js';
import type { Money } from '../valueObjects/money.js';
import type { Brand } from './brand.js';
import type { Option } from './option.js';
import type { Product } from './product.js';
import type { ProductType } from './productType.js';
import type { PromotionPeriod } from './promotionPeriod.js';
import type { Sku } from './sku.js';

// LEGACY-NOTE THE THREE OUT-OF-SCOPE FAR SIDES, MATERIALIZED THROUGH NARROW STRUCTURAL PROJECTIONS
// RATHER THAN DROPPED. `FulfillmentMethod` [L73], `ShippingMethod` [L74] and `AddressZone` [L75]
// all belong to the out-of-scope fulfillment/shipping pipeline. The out-of-scope entity is the FAR
// SIDE; the ASSOCIATION is part of `SwPromoQual`'s persisted contract, and suppressing it would
// make this class assert something false about the schema - and would delete a gate the promotion
// engine reads. The approved mechanism - a module-local, un-exported structural interface naming
// only the members anything in scope can actually reach - is used for each, following the `*Link`
// precedent established by src/domain/entities/brand.ts.
//
// EACH CARRIES EXACTLY ONE MEMBER: its primary key, taken from the `inversejoincolumn` its own
// declaration names and confirmed against the far-side `fieldtype="id"` line. NO `add*`/`remove*`
// member is declared on any of the three, and that is the point rather than an omission - this
// class has no helper that would call one, because the source has none. Speculating further members
// would be inventing a contract.

/** [model/entity/PromotionQualifier.cfc:L73] `inversejoincolumn="fulfillmentMethodID"`, and FulfillmentMethod.cfc:L52. */
interface QualifierFulfillmentMethodLink {
  getFulfillmentMethodID(): string;
}

/** [model/entity/PromotionQualifier.cfc:L74] `inversejoincolumn="shippingMethodID"`, and ShippingMethod.cfc:L52. */
interface QualifierShippingMethodLink {
  getShippingMethodID(): string;
}

/** [model/entity/PromotionQualifier.cfc:L75] `inversejoincolumn="addressZoneID"`, and AddressZone.cfc:L52. */
interface QualifierAddressZoneLink {
  getAddressZoneID(): string;
}

/**
 * One row of `getRewardMatchingTypeOptions()`.
 * [model/entity/PromotionQualifier.cfc:L107-L115]
 *
 * A `type` alias rather than an `interface`, and that is load-bearing rather than stylistic: an
 * `interface` is NOT assignable to `Readonly<Record<string, unknown>>` (TS2322) because it has no
 * implicit index signature, whereas a type alias IS. The same decision is recorded on
 * `ParentPriceGroupOption` in src/domain/entities/priceGroup.ts.
 */
type RewardMatchingTypeOption = {
  readonly name: string;
  readonly value: 'any' | 'sku' | 'product' | 'productType' | 'brand';
};

/**
 * The narrow port standing for the two `rbKey(...)` resolutions inside `getSimpleRepresentation()`
 * [model/entity/PromotionQualifier.cfc:L101-L103].
 *
 * WHY TWO MEMBERS AND NOT ONE GENERIC RESOLVER. The legacy body is
 *
 *   return "#rbKey('entity.promotionQualifier')# - #getFormattedValue('qualifierType')#";
 *
 * and `getFormattedValue` [org/Hibachi/HibachiTransient.cfc:L493-L510] resolves through the
 * `hb_formatType="rbKey"` attribute on [L53] to a SECOND, value-dependent key:
 * `rbKey('entity.promotionQualifier.qualifierType.<value>')`. So the method needs exactly two
 * resolutions - one fixed and one parameterised by the stored qualifier type - and the port names
 * both explicitly. A single `resolve(key: string)` member would be a general-purpose i18n runtime,
 * which is precisely what is NOT being introduced: JavaRB is not ported, and resource-bundle
 * identifiers are preserved verbatim as string constants rather than resolved by new machinery.
 *
 * Declared module-local and UN-EXPORTED: the AAP locks the port inventory at THIRTEEN exported
 * contracts under `src/domain/ports/`, and the inventory counts EXPORTED CONTRACTS rather than
 * files, so a fourteenth exported collaborator interface is a budget violation wherever it sits.
 * This follows `RoundingRuleValueRounder` in src/domain/entities/roundingRule.ts,
 * `PromotionCodeDeletableEvaluator` in src/domain/entities/promotion.ts and
 * `CurrencyValueFormatter` in src/domain/entities/priceGroupRate.ts.
 */
interface PromotionQualifierLabelProvider {
  /** [model/entity/PromotionQualifier.cfc:L102] `rbKey('entity.promotionQualifier')`. */
  getPromotionQualifierEntityLabel(): string;

  /**
   * [org/Hibachi/HibachiTransient.cfc:L506] the value-dependent key
   * `entity.promotionQualifier.qualifierType.<value>`, reached through
   * `getFormattedValue('qualifierType')` and the `hb_formatType="rbKey"` attribute on
   * [model/entity/PromotionQualifier.cfc:L53].
   */
  getQualifierTypeLabel(qualifierType: string): string;
}

/**
 * A single promotion qualifier - the GATE that decides whether a promotion period applies.
 *
 * A class rather than an interface, because the legacy entity carries behaviour and not merely
 * data: it owns an overridden `getSimpleRepresentation()`, an option list, an `isDeletable()` that
 * climbs two levels of parent, and eleven bidirectional helper pairs.
 *
 * ASSOCIATIONS ARE MATERIALIZED AT THE REPOSITORY BOUNDARY. Hibernate lazy collections have no
 * equivalent in a driver-only stack, so each collection arrives already populated and the fetch
 * shape is an explicit, documented decision at the repository method that produced it. For this
 * entity that decision matters more than usual: the promotion engine reads several of the thirteen
 * collections for EVERY order item on EVERY qualifier, so a lazy-shaped port would have produced a
 * textbook N+1 inside the pricing hot path.
 *
 * EVERY MEMBER IS SYNCHRONOUS. The async boundary rule is that a method becomes `async` if and only
 * if its legacy body reaches the DAO or ORM, and no body in this component does.
 *
 * ALL MONEY PASSES THROUGH `Money`. The four `hb_formatType="currency"` gates are `Money`; no raw
 * floating-point operation on any of them exists anywhere in the target, and persistence uses
 * `Money.toDecimalString()` - never `toFixed2()`, which is presentation-only and would silently
 * truncate scale on the way to a `big_decimal` column.
 *
 * TWO MEMBERS OF THIS CLASS CAN THROW, and each says so on itself: `getSimpleRepresentation()` (no
 * injected label provider) and `isDeletable()` (the two-level unguarded climb). `removePromotionPeriod()`
 * can also throw, via the framework-wide unguarded-null idiom. Every other member is total.
 */
export class PromotionQualifier {
  /**
   * [model/entity/PromotionQualifier.cfc:L52]
   * `ormtype="string" length="32" fieldtype="id" generator="uuid" unsavedvalue="" default=""`
   *
   * `unsavedvalue=""` with `default=""` is what makes an unsaved row's key the empty string, which
   * is in turn what makes `isNew()` a simple emptiness test. Read across the module boundary by
   * `ProductType.hasPromotionQualifier` and its siblings on brand, option, product and sku.
   */
  private readonly promotionQualifierID: string;

  /**
   * [model/entity/PromotionQualifier.cfc:L53] `ormtype="string" hb_formatType="rbKey"`.
   *
   * THE DISCRIMINATOR THE ENGINE BRANCHES ON. `getQualifierQualificationDetails()` switches on it
   * at [model/service/PromotionService.cfc:L678] for the fulfillment branch and at
   * [model/service/PromotionService.cfc:L714] via
   * `listFindNoCase("contentAccess,merchandise,subscription", getQualifierType())` for the item
   * branch - note that the second test is CASE-INSENSITIVE and comma-list based, which is why this
   * value must not be narrowed to a union: the column carries no check constraint, no validation
   * file exists for this entity at all, and narrowing would reject data the legacy schema accepts.
   *
   * `hb_formatType="rbKey"` is what makes `getFormattedValue('qualifierType')` resolve this value
   * as part of a resource-bundle key rather than display it raw - see
   * `PromotionQualifierLabelProvider`.
   */
  private readonly qualifierType: string | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L55] `ormtype="integer" hb_nullRBKey="define.0"`.
   *
   * `undefined` means NO GATE, displayed as `define.0`. Never defaulted - see the header.
   */
  private readonly minimumOrderQuantity: number | undefined;

  /** [model/entity/PromotionQualifier.cfc:L56] `ormtype="integer" hb_nullRBKey="define.unlimited"`. `undefined` means unlimited. */
  private readonly maximumOrderQuantity: number | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L57]
   * `ormtype="big_decimal" hb_formatType="currency" hb_nullRBKey="define.0"`.
   */
  private readonly minimumOrderSubtotal: Money | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L58]
   * `ormtype="big_decimal" hb_formatType="currency" hb_nullRBKey="define.unlimited"`.
   *
   * ★ A SUBSTITUTED `0` HERE WOULD DISQUALIFY EVERY ORDER, which is why `undefined` is preserved
   * rather than defaulted. The engine guards with `!isNull(...)` first.
   */
  private readonly maximumOrderSubtotal: Money | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L59] `ormtype="integer" hb_nullRBKey="define.0"`.
   *
   * ★ ALSO A DIVISOR, NOT ONLY A GATE. [model/service/PromotionService.cfc:L744] computes
   * `int(qualifiedItemsQuantity / qualifier.getMinimumItemQuantity())` to derive the qualification
   * COUNT, guarded only by `!isNull(...)` - so a stored ZERO is a division by zero in the legacy
   * too, and nothing validates against it because this entity has no validation file. Preserved:
   * the port does not add a zero check the source lacks.
   */
  private readonly minimumItemQuantity: number | undefined;

  /** [model/entity/PromotionQualifier.cfc:L60] `ormtype="integer" hb_nullRBKey="define.unlimited"`. */
  private readonly maximumItemQuantity: number | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L61]
   * `ormtype="big_decimal" hb_formatType="currency" hb_nullRBKey="define.0"`.
   */
  private readonly minimumItemPrice: Money | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L62]
   * `ormtype="big_decimal" hb_formatType="currency" hb_nullRBKey="define.unlimited"`.
   */
  private readonly maximumItemPrice: Money | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L63]
   * `ormtype="big_decimal" hb_formatType="weight" hb_nullRBKey="define.0"`.
   *
   * ★ A WEIGHT, NOT MONEY - hence `DecimalString` rather than `Money`. Compared against
   * `orderFulfillment.getTotalShippingWeight()` at [model/service/PromotionService.cfc:L695]. Typing
   * it as `Money` would assert a currency it does not have and would hand it currency formatting it
   * must never receive; `DecimalString` preserves the `big_decimal` column's arbitrary precision
   * with no currency semantics attached.
   */
  private readonly minimumFulfillmentWeight: DecimalString | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L64]
   * `ormtype="big_decimal" hb_formatType="weight" hb_nullRBKey="define.unlimited"`.
   * Compared at [model/service/PromotionService.cfc:L697]. A weight, not money.
   */
  private readonly maximumFulfillmentWeight: DecimalString | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L65]
   * `ormtype="string" hb_formatType="rbKey" hb_formFieldType="select"`.
   *
   * The five values `getRewardMatchingTypeOptions()` offers are `any`, `sku`, `product`,
   * `productType` and `brand`. NOT narrowed to that union, for the same reason as `qualifierType`:
   * the column has no check constraint and this entity has no validation file, so narrowing would
   * reject data the legacy schema accepts. The union lives on `RewardMatchingTypeOption.value`,
   * where it describes the OPTIONS the admin offers rather than the COLUMN's domain.
   */
  private readonly rewardMatchingType: string | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L68] many-to-one, `fkcolumn="promotionPeriodID"`.
   *
   * MUTABLE: `setPromotionPeriod` assigns it [L123] and `removePromotionPeriod` clears it [L136].
   * `undefined` both for an unattached qualifier and for one the repository hydrated without its
   * parent - two states the port cannot distinguish, exactly as CFML cannot.
   */
  private promotionPeriod: PromotionPeriod | undefined;

  /** [model/entity/PromotionQualifier.cfc:L73] OWNER via `SwPromoQualFulfillmentMethod`. NO helper exists. */
  private readonly fulfillmentMethods: QualifierFulfillmentMethodLink[];

  /** [model/entity/PromotionQualifier.cfc:L74] OWNER via `SwPromoQualShippingMethod`. NO helper exists. */
  private readonly shippingMethods: QualifierShippingMethodLink[];

  /** [model/entity/PromotionQualifier.cfc:L75] OWNER via `SwPromoQualShipAddressZone`. NO helper exists. */
  private readonly shippingAddressZones: QualifierAddressZoneLink[];

  /** [model/entity/PromotionQualifier.cfc:L77] OWNER via `SwPromoQualBrand`. */
  private readonly brands: Brand[];

  /** [model/entity/PromotionQualifier.cfc:L78] OWNER via `SwPromoQualOption`. */
  private readonly options: Option[];

  /** [model/entity/PromotionQualifier.cfc:L79] OWNER via `SwPromoQualSku`. */
  private readonly skus: Sku[];

  /** [model/entity/PromotionQualifier.cfc:L80] OWNER via `SwPromoQualProduct`. */
  private readonly products: Product[];

  /** [model/entity/PromotionQualifier.cfc:L81] OWNER via `SwPromoQualProductType`. */
  private readonly productTypes: ProductType[];

  /**
   * [model/entity/PromotionQualifier.cfc:L83] OWNER via `SwPromoQualExclBrand`.
   *
   * The declaration carries a redundant `type="array"` that its four exclusion siblings on L85-L87
   * do not - preserved as a metadata observation; `fieldtype="many-to-many"` already implies array.
   */
  private readonly excludedBrands: Brand[];

  /** [model/entity/PromotionQualifier.cfc:L84] OWNER via `SwPromoQualExclOption`. Also carries the redundant `type="array"`. */
  private readonly excludedOptions: Option[];

  /** [model/entity/PromotionQualifier.cfc:L85] OWNER via `SwPromoQualExclSku`. */
  private readonly excludedSkus: Sku[];

  /** [model/entity/PromotionQualifier.cfc:L86] OWNER via `SwPromoQualExclProduct`. */
  private readonly excludedProducts: Product[];

  /** [model/entity/PromotionQualifier.cfc:L87] OWNER via `SwPromoQualExclProductType`. */
  private readonly excludedProductTypes: ProductType[];

  /** [model/entity/PromotionQualifier.cfc:L90] the integration correlation column. */
  private readonly remoteID: string | undefined;

  /** [model/entity/PromotionQualifier.cfc:L93] `hb_populateEnabled="false" ormtype="timestamp"`. */
  private readonly createdDateTime: Date | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L94] many-to-one onto the out-of-scope `Account`,
   * `fkcolumn="createdByAccountID"`. Reduced to the opaque identifier, as every in-scope entity does.
   */
  private readonly createdByAccountID: string | undefined;

  /** [model/entity/PromotionQualifier.cfc:L95] `hb_populateEnabled="false" ormtype="timestamp"`. */
  private readonly modifiedDateTime: Date | undefined;

  /** [model/entity/PromotionQualifier.cfc:L96] many-to-one onto `Account`, `fkcolumn="modifiedByAccountID"`. */
  private readonly modifiedByAccountID: string | undefined;

  /** The injected label provider. `undefined` on every path that never builds a simple representation. */
  private readonly labelProvider: PromotionQualifierLabelProvider | undefined;

  /**
   * Constructed from a repository row plus its materialized associations. Never constructed from a
   * sibling entity module: row-to-entity hydration belongs entirely to `src/repositories/mysql/**`.
   *
   * Every collection parameter is OPTIONAL and defaults to `[]`, because a Hibernate-managed
   * collection never handed back null - an entity hydrated without a join must present an empty
   * array rather than `undefined`. meta/tests/unit/entity/BrandTest.cfc asserts exactly that
   * convention for `Brand.getProducts()` and it is applied uniformly across the folder.
   *
   * NONE OF THE TEN NUMERIC GATES HAS A DEFAULT, deliberately. `undefined` is the "no gate" signal
   * the engine relies on, and supplying `0` for a maximum would disqualify every order.
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
    readonly minimumFulfillmentWeight?: DecimalString | undefined;
    readonly maximumFulfillmentWeight?: DecimalString | undefined;
    readonly rewardMatchingType?: string | undefined;
    readonly promotionPeriod?: PromotionPeriod | undefined;
    readonly fulfillmentMethods?: QualifierFulfillmentMethodLink[] | undefined;
    readonly shippingMethods?: QualifierShippingMethodLink[] | undefined;
    readonly shippingAddressZones?: QualifierAddressZoneLink[] | undefined;
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
    readonly labelProvider?: PromotionQualifierLabelProvider | undefined;
  }) {
    this.promotionQualifierID = init.promotionQualifierID;
    this.qualifierType = init.qualifierType;
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
    this.fulfillmentMethods = init.fulfillmentMethods ?? [];
    this.shippingMethods = init.shippingMethods ?? [];
    this.shippingAddressZones = init.shippingAddressZones ?? [];
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
    this.labelProvider = init.labelProvider;
  }

  // ============ START: Persistent Property Accessors ===================
  // Legacy names carried over verbatim in CFML camelCase; interface parity is the acceptance
  // contract for this port. All ten numeric gates return `undefined` for a NULL column and NEVER a
  // substituted zero - see the header.

  /** [model/entity/PromotionQualifier.cfc:L52] */
  getPromotionQualifierID(): string {
    return this.promotionQualifierID;
  }

  /** [model/entity/PromotionQualifier.cfc:L53] The discriminator the engine branches on. */
  getQualifierType(): string | undefined {
    return this.qualifierType;
  }

  /** [model/entity/PromotionQualifier.cfc:L55] `undefined` means no gate. */
  getMinimumOrderQuantity(): number | undefined {
    return this.minimumOrderQuantity;
  }

  /** [model/entity/PromotionQualifier.cfc:L56] `undefined` means unlimited. */
  getMaximumOrderQuantity(): number | undefined {
    return this.maximumOrderQuantity;
  }

  /** [model/entity/PromotionQualifier.cfc:L57] `undefined` means no gate. */
  getMinimumOrderSubtotal(): Money | undefined {
    return this.minimumOrderSubtotal;
  }

  /** [model/entity/PromotionQualifier.cfc:L58] `undefined` means unlimited - a `0` here would disqualify every order. */
  getMaximumOrderSubtotal(): Money | undefined {
    return this.maximumOrderSubtotal;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L59] `undefined` means no gate.
   *
   * Also the divisor at [model/service/PromotionService.cfc:L744]; a stored zero divides by zero
   * there, and nothing validates against it. See the field doc.
   */
  getMinimumItemQuantity(): number | undefined {
    return this.minimumItemQuantity;
  }

  /** [model/entity/PromotionQualifier.cfc:L60] `undefined` means unlimited. */
  getMaximumItemQuantity(): number | undefined {
    return this.maximumItemQuantity;
  }

  /** [model/entity/PromotionQualifier.cfc:L61] `undefined` means no gate. */
  getMinimumItemPrice(): Money | undefined {
    return this.minimumItemPrice;
  }

  /** [model/entity/PromotionQualifier.cfc:L62] `undefined` means unlimited. */
  getMaximumItemPrice(): Money | undefined {
    return this.maximumItemPrice;
  }

  /** [model/entity/PromotionQualifier.cfc:L63] A WEIGHT, not money. `undefined` means no gate. */
  getMinimumFulfillmentWeight(): DecimalString | undefined {
    return this.minimumFulfillmentWeight;
  }

  /** [model/entity/PromotionQualifier.cfc:L64] A WEIGHT, not money. `undefined` means unlimited. */
  getMaximumFulfillmentWeight(): DecimalString | undefined {
    return this.maximumFulfillmentWeight;
  }

  /** [model/entity/PromotionQualifier.cfc:L65] */
  getRewardMatchingType(): string | undefined {
    return this.rewardMatchingType;
  }

  /** [model/entity/PromotionQualifier.cfc:L68] `undefined` for an unattached or unjoined qualifier. */
  getPromotionPeriod(): PromotionPeriod | undefined {
    return this.promotionPeriod;
  }

  /** [model/entity/PromotionQualifier.cfc:L90] */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [model/entity/PromotionQualifier.cfc:L93] */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /** [model/entity/PromotionQualifier.cfc:L94] */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/PromotionQualifier.cfc:L95] */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** [model/entity/PromotionQualifier.cfc:L96] */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // ============  END: Persistent Property Accessors ====================

  // ============ START: Collection Accessors ============================
  // ALL THIRTEEN ARE `readonly`, because this entity OWNS all thirteen link tables and nothing
  // reaches into any of them from outside - zero census sites across model/entity/*.cfc. The owner
  // writes its own `variables.<x>` directly; see the header for why that inverts the liveness of
  // the seven `inverse="true"` collections on brand, option, product, productType and sku.
  //
  // THE FIELDS THEMSELVES ARE MUTABLE ARRAYS while the ACCESSORS hand out `readonly` views. Those
  // are two different guarantees and both are wanted: the ten helper pairs below must be able to
  // splice the backing array, and no caller may.
  //
  // THE FIRST THREE HAVE NO BIDIRECTIONAL HELPER AT ALL. See the header - three out-of-scope
  // entities call helpers this component never declares, and all six of those calls reach the
  // `onMissingMethod` throw at org/Hibachi/HibachiEntity.cfc:L565. Authoring the missing pairs here
  // would silently repair those defects and change which orders qualify.

  /**
   * [model/entity/PromotionQualifier.cfc:L73] READONLY - owner side, zero census sites.
   *
   * Read by the engine at [model/service/PromotionService.cfc:L699] as an `arrayLen(...)` gate
   * before `hasFulfillmentMethod(...)`. NO `addFulfillmentMethod` EXISTS - and
   * model/entity/FulfillmentMethod.cfc:L107 calls the PLURAL `addFulfillmentMethods(...)`, which
   * does not exist either.
   */
  getFulfillmentMethods(): readonly QualifierFulfillmentMethodLink[] {
    return this.fulfillmentMethods;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L74] READONLY - owner side, zero census sites.
   *
   * Read by the engine at [model/service/PromotionService.cfc:L701]. NO `addShippingMethod` EXISTS,
   * and model/entity/ShippingMethod.cfc:L97 calls it anyway.
   */
  getShippingMethods(): readonly QualifierShippingMethodLink[] {
    return this.shippingMethods;
  }

  /**
   * [model/entity/PromotionQualifier.cfc:L75] READONLY - owner side, zero census sites.
   *
   * ★ EFFECTIVELY NEVER EVALUATED AS A ZONE GATE. The engine's clause at
   * [model/service/PromotionService.cfc:L703] tests `arrayLen(getShippingAddressZones())` and then
   * re-tests `hasShippingMethod(...)` instead of testing the zone condition - the defect registered
   * against the service. So populating this collection changes qualification only by way of the
   * shipping-method test. Noted here so a reader is not misled.
   *
   * NO `addShippingAddressZone` EXISTS, and model/entity/AddressZone.cfc:L102 calls
   * `addAddressZone(...)` - a name that would not match this property even if a helper existed.
   */
  getShippingAddressZones(): readonly QualifierAddressZoneLink[] {
    return this.shippingAddressZones;
  }

  /** [model/entity/PromotionQualifier.cfc:L77] READONLY - owner side, zero census sites. */
  getBrands(): readonly Brand[] {
    return this.brands;
  }

  /** [model/entity/PromotionQualifier.cfc:L78] READONLY - owner side, zero census sites. */
  getOptions(): readonly Option[] {
    return this.options;
  }

  /** [model/entity/PromotionQualifier.cfc:L79] READONLY - owner side, zero census sites. */
  getSkus(): readonly Sku[] {
    return this.skus;
  }

  /** [model/entity/PromotionQualifier.cfc:L80] READONLY - owner side, zero census sites. */
  getProducts(): readonly Product[] {
    return this.products;
  }

  /** [model/entity/PromotionQualifier.cfc:L81] READONLY - owner side, zero census sites. */
  getProductTypes(): readonly ProductType[] {
    return this.productTypes;
  }

  /** [model/entity/PromotionQualifier.cfc:L83] READONLY - owner side, zero census sites. */
  getExcludedBrands(): readonly Brand[] {
    return this.excludedBrands;
  }

  /** [model/entity/PromotionQualifier.cfc:L84] READONLY - owner side, zero census sites. */
  getExcludedOptions(): readonly Option[] {
    return this.excludedOptions;
  }

  /** [model/entity/PromotionQualifier.cfc:L85] READONLY - owner side, zero census sites. */
  getExcludedSkus(): readonly Sku[] {
    return this.excludedSkus;
  }

  /** [model/entity/PromotionQualifier.cfc:L86] READONLY - owner side, zero census sites. */
  getExcludedProducts(): readonly Product[] {
    return this.excludedProducts;
  }

  /** [model/entity/PromotionQualifier.cfc:L87] READONLY - owner side, zero census sites. */
  getExcludedProductTypes(): readonly ProductType[] {
    return this.excludedProductTypes;
  }

  // ============  END: Collection Accessors =============================

  // ============ START: Containment Probes ==============================
  // None has a hand-written legacy body: all are synthesised by the dispatcher at
  // org/Hibachi/HibachiEntity.cfc:L507-L565, whose CFML semantics are Hibernate's
  // collection-contains - session identity, i.e. primary key for a persistent row.
  //
  // THIRTEEN PLAIN PROBES ARE AUTHORED HERE, AND EACH HAS A REAL CALLER. Two further AGGREGATE
  // probes - `hasAnyOption` and `hasAnyExcludedOption` - sit in their own section immediately below,
  // because they arrive by a DIFFERENT dispatcher branch and delegate into these thirteen rather
  // than matching independently. Fifteen probes in total.
  //
  // Of the thirteen: ten are called by this class's own helpers -
  // `hasBrand` at [L141], `hasOption` at [L161], `hasSku` at [L181], `hasProduct` at [L201],
  // `hasProductType` at [L221], and the five `hasExcluded*` at [L241], [L261], [L281], [L301],
  // [L321]. Two more are called by the ENGINE: `hasFulfillmentMethod` at
  // [model/service/PromotionService.cfc:L699] and `hasShippingMethod` at
  // [model/service/PromotionService.cfc:L701] and again at [L703]. `hasShippingAddressZone` has NO
  // caller anywhere - because of the L703 defect that re-tests the shipping method instead - and it
  // is authored regardless, for surface completeness with its two siblings.
  //
  // THE PROJECT-WIDE CONTAINMENT RULE: compare by PRIMARY KEY, with a REFERENCE fallback when the
  // candidate is unsaved. The fallback is not optional - every unsaved row's key is `''`
  // (`unsavedvalue=""`), so a pure key comparison would report two DIFFERENT unsaved rows as the
  // same one and the guard would skip a legitimate append.
  //
  // THE THREE OUT-OF-SCOPE PROBES CANNOT USE A REFERENCE FALLBACK, and that is a real difference
  // rather than an inconsistency: their far sides are structural `*Link` projections carrying only
  // a primary key, so there is no `isNew()` to consult. An unsaved fulfillment method is not
  // something this class can recognise, exactly as the projection admits.

  /** Called by this class's own `addBrand` [model/entity/PromotionQualifier.cfc:L141]. */
  hasBrand(brand: Brand): boolean {
    const candidateID: string = brand.getBrandID();
    if (candidateID === '') {
      return this.brands.includes(brand);
    }
    return this.brands.some((held: Brand) => held.getBrandID() === candidateID);
  }

  /** Called by this class's own `addExcludedBrand` [model/entity/PromotionQualifier.cfc:L241]. */
  hasExcludedBrand(brand: Brand): boolean {
    const candidateID: string = brand.getBrandID();
    if (candidateID === '') {
      return this.excludedBrands.includes(brand);
    }
    return this.excludedBrands.some((held: Brand) => held.getBrandID() === candidateID);
  }

  /** Called by this class's own `addOption` [model/entity/PromotionQualifier.cfc:L161]. */
  hasOption(option: Option): boolean {
    const candidateID: string = option.getOptionID();
    if (candidateID === '') {
      return this.options.includes(option);
    }
    return this.options.some((held: Option) => held.getOptionID() === candidateID);
  }

  /** Called by this class's own `addExcludedOption` [model/entity/PromotionQualifier.cfc:L261]. */
  hasExcludedOption(option: Option): boolean {
    const candidateID: string = option.getOptionID();
    if (candidateID === '') {
      return this.excludedOptions.includes(option);
    }
    return this.excludedOptions.some((held: Option) => held.getOptionID() === candidateID);
  }

  /** Called by this class's own `addSku` [model/entity/PromotionQualifier.cfc:L181]. */
  hasSku(sku: Sku): boolean {
    const candidateID: string = sku.getSkuID();
    if (candidateID === '') {
      return this.skus.includes(sku);
    }
    return this.skus.some((held: Sku) => held.getSkuID() === candidateID);
  }

  /** Called by this class's own `addExcludedSku` [model/entity/PromotionQualifier.cfc:L281]. */
  hasExcludedSku(sku: Sku): boolean {
    const candidateID: string = sku.getSkuID();
    if (candidateID === '') {
      return this.excludedSkus.includes(sku);
    }
    return this.excludedSkus.some((held: Sku) => held.getSkuID() === candidateID);
  }

  /** Called by this class's own `addProduct` [model/entity/PromotionQualifier.cfc:L201]. */
  hasProduct(product: Product): boolean {
    const candidateID: string = product.getProductID();
    if (candidateID === '') {
      return this.products.includes(product);
    }
    return this.products.some((held: Product) => held.getProductID() === candidateID);
  }

  /** Called by this class's own `addExcludedProduct` [model/entity/PromotionQualifier.cfc:L301]. */
  hasExcludedProduct(product: Product): boolean {
    const candidateID: string = product.getProductID();
    if (candidateID === '') {
      return this.excludedProducts.includes(product);
    }
    return this.excludedProducts.some((held: Product) => held.getProductID() === candidateID);
  }

  /** Called by this class's own `addProductType` [model/entity/PromotionQualifier.cfc:L221]. */
  hasProductType(productType: ProductType): boolean {
    const candidateID: string = productType.getProductTypeID();
    if (candidateID === '') {
      return this.productTypes.includes(productType);
    }
    return this.productTypes.some((held: ProductType) => held.getProductTypeID() === candidateID);
  }

  /** Called by this class's own `addExcludedProductType` [model/entity/PromotionQualifier.cfc:L321]. */
  hasExcludedProductType(productType: ProductType): boolean {
    const candidateID: string = productType.getProductTypeID();
    if (candidateID === '') {
      return this.excludedProductTypes.includes(productType);
    }
    return this.excludedProductTypes.some(
      (held: ProductType) => held.getProductTypeID() === candidateID,
    );
  }

  /**
   * Called by the ENGINE at [model/service/PromotionService.cfc:L699].
   *
   * PRIMARY KEY ONLY - no reference fallback, because the far side is a structural projection with
   * no `isNew()` to consult. See the section note.
   */
  hasFulfillmentMethod(fulfillmentMethod: QualifierFulfillmentMethodLink): boolean {
    const candidateID: string = fulfillmentMethod.getFulfillmentMethodID();
    return this.fulfillmentMethods.some(
      (held: QualifierFulfillmentMethodLink) => held.getFulfillmentMethodID() === candidateID,
    );
  }

  /**
   * Called by the ENGINE at [model/service/PromotionService.cfc:L701], and AGAIN at
   * [model/service/PromotionService.cfc:L703] where the zone condition was intended - the defect
   * registered against the service.
   *
   * PRIMARY KEY ONLY - see the section note.
   */
  hasShippingMethod(shippingMethod: QualifierShippingMethodLink): boolean {
    const candidateID: string = shippingMethod.getShippingMethodID();
    return this.shippingMethods.some(
      (held: QualifierShippingMethodLink) => held.getShippingMethodID() === candidateID,
    );
  }

  /**
   * NO CALLER EXISTS ANYWHERE, and that is a consequence of the L703 defect rather than of this
   * method. Authored for surface completeness with its two siblings, and recorded as unexercised so
   * the absence of a caller is not mistaken for an omission here.
   *
   * PRIMARY KEY ONLY - see the section note.
   */
  hasShippingAddressZone(addressZone: QualifierAddressZoneLink): boolean {
    const candidateID: string = addressZone.getAddressZoneID();
    return this.shippingAddressZones.some(
      (held: QualifierAddressZoneLink) => held.getAddressZoneID() === candidateID,
    );
  }

  // ============ START: Aggregate Containment Probes =====================
  //
  // TWO MORE PROBES, ON A DIFFERENT DISPATCHER BRANCH. The thirteen above are the plain
  // `has<singularname>()` accessors ColdFusion's ORM generates per collection. The two below are
  // `hasAny<singularname>()`, which the ORM does NOT generate - they fall through to
  // `onMissingMethod` and are caught by the `hasAny` branch at
  // [org/Hibachi/HibachiEntity.cfc:L519-L521]:
  //
  //   } else if( left(arguments.missingMethodName, 6) == "hasAny") {
  //     return hasAnyInProperty(propertyName=right(arguments.missingMethodName,
  //                             len(arguments.missingMethodName) - 6),
  //                             entityArray=arguments.missingMethodArguments[1]);
  //
  // and then implemented at [org/Hibachi/HibachiEntity.cfc:L340-L350]:
  //
  //   public boolean function hasAnyInProperty( required string propertyName, array entityArray ) {
  //     for(var entity in arguments.entityArray) {
  //       // evaluate is used instead of invokeMethod() because hasXXX() is an implicit orm function
  //       if( evaluate("has#propertyName#( entity )") ){ return true; }
  //     }
  //     return false;
  //   }
  //
  // FOUR POINTS OF FIDELITY, each derived from that body rather than from what "any" ought to mean.
  //
  //   (1) THE DERIVED PROPERTY NAME IS SINGULAR, NOT THE COLLECTION NAME. `right(name, len - 6)`
  //       strips exactly the six characters of `hasAny`, so `hasAnyOption` derives `"Option"` and
  //       `hasAnyExcludedOption` derives `"ExcludedOption"`. Those then compose to `hasOption` and
  //       `hasExcludedOption` - the two singular probes already authored above. The delegation is
  //       therefore exact, and these two members are pure fan-outs with no independent matching
  //       logic of their own. Reimplementing the comparison here instead of delegating would risk
  //       the two paths drifting apart, which is precisely the class of divergence this port exists
  //       to avoid.
  //
  //   (2) IT SHORT-CIRCUITS ON THE FIRST HIT. `return true` is inside the loop, so a later element
  //       is never examined once an earlier one matches. `some()` has identical semantics.
  //
  //   (3) AN EMPTY ARRAY ANSWERS FALSE, not true and not a raise. `for(var entity in [])` executes
  //       zero times and control reaches `return false`. This matters at the exclusion call site:
  //       a SKU with no options is NOT excluded by an option-based exclusion.
  //
  //   (4) `entityArray` IS DECLARED OPTIONAL IN THE FRAMEWORK - `array entityArray`, with no
  //       `required`. If it were ever omitted, `missingMethodArguments[1]` at L521 would raise
  //       before `hasAnyInProperty` was even entered. Both legacy call sites pass it, so the
  //       parameter is `required` here; making it optional would invent a reachable state the
  //       source does not have.
  //
  // BOTH ARE ENGINE-CALLED, and both are on the hot path of the must-preserve reward/qualifier
  // membership test - which is exactly why the omission of these two from an earlier revision of
  // this module was a real gap rather than a cosmetic one.

  /**
   * Does ANY of the given options participate in this qualifier's `options` gate?
   *
   * Called by the ENGINE at [model/service/PromotionService.cfc:L914], inside
   * `getOrderItemInQualifier`, as the LAST inclusion test:
   *
   *   if(arguments.qualifier.hasAnyOption( arguments.orderItem.getSku().getOptions() )) {
   *     return true;
   *   }
   *
   * Delegates to `hasOption` per point (1) of the section note, so the primary-key-with-reference
   * fallback rule is inherited rather than restated.
   */
  hasAnyOption(options: readonly Option[]): boolean {
    return options.some((option: Option) => this.hasOption(option));
  }

  /**
   * Does ANY of the given options participate in this qualifier's `excludedOptions` gate?
   *
   * Called by the ENGINE at [model/service/PromotionService.cfc:L885], inside
   * `getOrderItemInQualifier`, as the last clause of the exclusion disjunction - so a `true` here
   * disqualifies the order item outright:
   *
   *   ( arguments.qualifier.hasAnyExcludedOption( arguments.orderItem.getSku().getOptions() ) )
   *
   * Delegates to `hasExcludedOption` per point (1) of the section note.
   */
  hasAnyExcludedOption(options: readonly Option[]): boolean {
    return options.some((option: Option) => this.hasExcludedOption(option));
  }

  // ============  END: Containment Probes ===============================

  /**
   * [org/Hibachi/HibachiEntity.cfc:L707-L709] `isNew()` returns `getNewFlag()`, and
   * [org/Hibachi/HibachiEntity.cfc:L571-L576] `getNewFlag()` returns `getPrimaryIDValue() == ""`.
   * With `unsavedvalue="" default=""` on [model/entity/PromotionQualifier.cfc:L52] that reduces
   * exactly to the test below.
   *
   * Called by all eleven `set`/`add` helpers in this class.
   */
  isNew(): boolean {
    return this.promotionQualifierID === '';
  }

  // ============ START: Pre-Banner Member ===============================
  // [model/entity/PromotionQualifier.cfc:L101-L103] sits ABOVE the
  // `// ============ START: Non-Persistent Property Methods` banner at L105. The source's own
  // organisation is preserved rather than tidied: reordering members to make the banners tidy would
  // make a reviewer's line-by-line diff against the CFC harder, which is the opposite of the point.
  // The same pre-banner situation exists in model/entity/ProductType.cfc:L92-L119.

  /**
   * `getSimpleRepresentation` - the admin label for this qualifier.
   * [model/entity/PromotionQualifier.cfc:L101-L103]
   *
   *   return "#rbKey('entity.promotionQualifier')# - #getFormattedValue('qualifierType')#";
   *
   * TWO RESOURCE-BUNDLE RESOLUTIONS IN ONE STRING, and the second one is not obvious from the source
   * line. `getFormattedValue('qualifierType')` [org/Hibachi/HibachiTransient.cfc:L493-L510] looks up
   * this property's `hb_formatType`, finds `"rbKey"` on [model/entity/PromotionQualifier.cfc:L53],
   * and takes the branch at [org/Hibachi/HibachiTransient.cfc:L505-L509] which returns
   *
   *   rbKey('entity.promotionQualifier.qualifierType.<value>')
   *
   * - a key built from the STORED VALUE. That is why the injected provider has two members rather
   * than one: one fixed key and one parameterised by the qualifier type.
   *
   * ★ AND WHEN `qualifierType` IS NULL, THAT BRANCH RETURNS `''` RATHER THAN A KEY.
   * [org/Hibachi/HibachiTransient.cfc:L507-L508] is an explicit `else { return ''; }`, so the label
   * becomes `"<entity label> - "` with a trailing separator and nothing after it. Reproduced exactly,
   * including the trailing space: the separator is emitted unconditionally by the source's string
   * interpolation, and trimming it would be a different output.
   *
   * NOTE WHAT DOES *NOT* HAPPEN HERE: the `hb_nullRBKey` fallback at
   * [org/Hibachi/HibachiTransient.cfc:L513-L519] is NOT reached, because the `rbKey` format branch
   * returns first. `qualifierType` has no `hb_nullRBKey` anyway - only the ten numeric gates do.
   *
   * ★ THIS METHOD OVERRIDES THE FRAMEWORK BASE, AND `getSimpleRepresentationPropertyName()` BELOW
   * IS STILL LIVE. The base's `getSimpleRepresentation()`
   * [org/Hibachi/HibachiEntity.cfc:L59-L71] is the only caller of the property-name variant along
   * THAT path, and this override displaces it - so it would be easy to conclude the property-name
   * method at [L355] is dead code. IT IS NOT: it has two further callers,
   * [org/Hibachi/HibachiEntity.cfc:L390] (which uses it as the `alias="name"` select when some other
   * entity builds a `promotionQualifier` option list) and
   * [org/Hibachi/HibachiService.cfc:L31] (keyword-search weighting). Both are ported surfaces'
   * concerns, so both members are authored. See the note on that method.
   *
   * @throws Error when no label provider was injected.
   */
  getSimpleRepresentation(): string {
    const provider: PromotionQualifierLabelProvider | undefined = this.labelProvider;

    if (provider === undefined) {
      throw new Error(
        'PromotionQualifier.getSimpleRepresentation needs resolved text for two resource-bundle ' +
          "keys - 'entity.promotionQualifier' [model/entity/PromotionQualifier.cfc:L102] and " +
          "'entity.promotionQualifier.qualifierType.<value>' " +
          '[org/Hibachi/HibachiTransient.cfc:L506] - and this qualifier was hydrated without a ' +
          'label provider. JavaRB is not ported, so resolved labels are supplied at hydration. No ' +
          'default is substituted: emitting the raw keys would leak identifiers into an admin ' +
          'screen and emitting English would fabricate translations.',
      );
    }

    // [org/Hibachi/HibachiTransient.cfc:L505-L509] the rbKey format branch: a key built from the
    // stored value, or `''` when the value is null. NOT the hb_nullRBKey fallback, which this branch
    // returns before.
    const qualifierTypeLabel: string =
      this.qualifierType === undefined ? '' : provider.getQualifierTypeLabel(this.qualifierType);

    // [model/entity/PromotionQualifier.cfc:L102] the `" - "` separator is emitted unconditionally by
    // the source's interpolation, so a null qualifier type leaves a trailing separator. Preserved.
    return `${provider.getPromotionQualifierEntityLabel()} - ${qualifierTypeLabel}`;
  }

  // ============  END: Pre-Banner Member ================================

  // ============ START: Non-Persistent Property Methods =================
  // [model/entity/PromotionQualifier.cfc:L105] opens this block and L117 closes it. It contains
  // exactly one member.
  //
  // LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L99]: the block is preceded by
  //   property name="qualifierApplicationTypeOptions" type="array" persistent="false";
  // and THAT PROPERTY IS VESTIGIAL. There is no `qualifierApplicationType` property on this entity,
  // no `getQualifierApplicationTypeOptions()` method anywhere, and no reader: a repository-wide grep
  // for the string `qualifierApplicationType` returns EXACTLY ONE HIT - the declaration itself.
  // It is dead metadata, presumably left behind by a renamed or abandoned feature. Recorded and NOT
  // ported: authoring an accessor for it would fabricate a surface the legacy system does not
  // expose, and the declaration itself carries no schema obligation because `persistent="false"`
  // means no column exists.

  /**
   * `getRewardMatchingTypeOptions` - the five reward-matching strategies the admin offers.
   * [model/entity/PromotionQualifier.cfc:L107-L115]
   *
   * The legacy body verbatim:
   *
   *   return [
   *     {name=rbKey('entity.promotionQualifier.rewardMatchingType.any'),         value="any"},
   *     {name=rbKey('entity.promotionQualifier.rewardMatchingType.sku'),         value="sku"},
   *     {name=rbKey('entity.promotionQualifier.rewardMatchingType.product'),     value="product"},
   *     {name=rbKey('entity.promotionQualifier.rewardMatchingType.productType'), value="productType"},
   *     {name=rbKey('entity.promotionQualifier.rewardMatchingType.brand'),       value="brand"}
   *   ];
   *
   * THE RETURN TYPE IS A READONLY FIVE-TUPLE, not a readonly array, precisely so the count and the
   * order are part of the type: adding a sixth strategy, dropping one, or reordering them becomes a
   * compile error rather than a silent behavioural change. Order is not cosmetic - it is the order
   * the option appears in the admin select. Same decision as
   * `PriceGroupRate.getAmountTypeOptions()` and `RoundingRule.getRoundingRuleDirectionOptions()`.
   *
   * ★ UNLIKE `PriceGroupRate.getAmountTypeOptions()`, EVERY NAME/VALUE PAIR HERE IS CONSISTENT -
   * each key's last segment is exactly its own value. That sibling's third pair pairs
   * `define.fixedAmount` with the value `amount`, a mismatch preserved there as a source quirk. The
   * contrast is worth recording: it is what makes that one identifiable as a quirk rather than a
   * convention.
   *
   * THE FIVE `name` VALUES ARE THE RESOURCE-BUNDLE KEYS THEMSELVES, NOT ENGLISH TEXT. JavaRB is not
   * ported and resource-bundle identifiers are preserved verbatim as string constants, so the key
   * travels intact to whoever owns localisation. Inventing English labels would fabricate
   * translations the legacy system resolves at runtime; emitting keys keeps the contract honest and
   * lossless. Contrast `RoundingRule.getRoundingRuleDirectionOptions()`, whose three labels ARE
   * hardcoded English in the source - so that port keeps English and this one keeps keys, each
   * matching its own source.
   *
   * PURE AND SYNCHRONOUS. A fresh array on every call, exactly as the CFML literal was re-evaluated
   * on every call, so a caller can never mutate a shared instance - and `readonly` on the tuple and
   * on both keys means a caller cannot mutate its own copy either. Hoisting the literal to module
   * scope would create shared state on a warm Lambda container for no benefit.
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

  // ============  END: Non-Persistent Property Methods ==================

  // ============= START: Bidirectional Helper Methods ===================
  // [model/entity/PromotionQualifier.cfc:L119] opens this block and L339 closes it. Eleven pairs -
  // one for `promotionPeriod` and ten for the owned membership collections. NOTHING for
  // `fulfillmentMethods`, `shippingMethods` or `shippingAddressZones`; see the header.

  /**
   * Attaches this qualifier to a promotion period, adding it to that period's qualifier collection.
   * [model/entity/PromotionQualifier.cfc:L122-L127]
   *
   *   variables.promotionPeriod = arguments.promotionPeriod;
   *   if(isNew() or !arguments.promotionPeriod.hasPromotionQualifier( this )) {
   *     arrayAppend(arguments.promotionPeriod.getPromotionQualifiers(), this);
   *   }
   *
   * BOTH HALVES OF THE DISJUNCT ARE PRESERVED, in order, with CFML's short-circuit semantics that
   * JavaScript's `||` reproduces exactly. `isNew()` first: an unsaved qualifier is appended
   * unconditionally, because its `''` key makes the membership test meaningless. Only then is
   * `hasPromotionQualifier` consulted, which keeps a saved qualifier from being appended twice.
   *
   * `arrayAppend` becomes `push` onto the LIVE array from
   * `PromotionPeriod.getPromotionQualifiers()`. The mutation must be observable through that
   * accessor, which is exactly why promotionPeriod.ts declares that collection LIVE and cites THIS
   * line as its census site.
   *
   * ★ THIS IS THE *ONLY* WORKING PATH BETWEEN A PERIOD AND ITS QUALIFIERS.
   * model/entity/PromotionPeriod.cfc's own `addPromotionQualifier` and `removePromotionQualifier`
   * delegate to `setPromotion`/`removePromotion` - method names that do not exist on this entity -
   * and therefore reach the `onMissingMethod` throw at [org/Hibachi/HibachiEntity.cfc:L565]. That
   * defect is registered and reproduced as throwing stubs in promotionPeriod.ts. The pair here is
   * unaffected and is what actually links the two.
   */
  setPromotionPeriod(promotionPeriod: PromotionPeriod): void {
    this.promotionPeriod = promotionPeriod;

    if (this.isNew() || !promotionPeriod.hasPromotionQualifier(this)) {
      promotionPeriod.getPromotionQualifiers().push(this);
    }
  }

  /**
   * Detaches this qualifier from a promotion period.
   * [model/entity/PromotionQualifier.cfc:L128-L137]
   *
   * THE ARGUMENT IS OPTIONAL, exactly as the legacy declaration is - `any promotionPeriod` with no
   * `required`. The default branch tests `!== undefined`, reproducing
   * `structKeyExists(arguments, "promotionPeriod")` and NEVER truthiness: an argument that was
   * passed is a different state from one that was not.
   *
   * `arrayFind` IS 1-BASED AND RETURNS 0 ON A MISS, which is why the legacy guard is `index > 0`.
   * `Array.prototype.findIndex` is 0-BASED and returns `-1`, so the equivalent guard is an explicit
   * `!== -1` - never a truthiness test, which would wrongly treat the valid index 0 as "not found".
   *
   * THE LEGACY SPLICE MATCHES BY REFERENCE, NOT BY KEY. [L132] is
   * `arrayFind(arguments.promotionPeriod.getPromotionQualifiers(), this)`, and CFML `arrayFind` with
   * an object needle compares object identity. Reproduced with `indexOf`, deliberately, rather than
   * upgraded to a primary-key comparison: a key comparison would ALSO remove a different in-memory
   * object representing the same saved row, which is a strictly wider behaviour. Contrast the
   * CONTAINMENT probes above, which are key-based because the framework dispatcher's `has*` is
   * Hibernate collection-contains rather than `arrayFind`. Two different legacy mechanisms, two
   * different ports - not an inconsistency in this file.
   *
   * `structDelete(variables, "promotionPeriod")` becomes assigning `undefined`, and it runs
   * UNCONDITIONALLY - outside the index guard - just as at [L136].
   *
   * LEGACY-NOTE [model/entity/PromotionQualifier.cfc:L129-L132]: when the argument is omitted AND
   * this qualifier has no stored period, the legacy assigns null into `arguments.promotionPeriod` at
   * [L130] and then invokes `.getPromotionQualifiers()` on it at [L132] - a method call on null,
   * which throws under every CFML engine. Reproduced rather than smoothed over: returning early
   * would silently skip the [L136] field clear as well, so it would not be the same behaviour by a
   * different route. The identical unguarded shape appears at
   * model/entity/PriceGroup.cfc:L116-L122, model/entity/Category.cfc:L107-L112,
   * model/entity/ProductType.cfc:L155-L159 and model/entity/PriceGroupRate.cfc:L187-L192, so it is
   * the framework-wide idiom rather than a local slip.
   *
   * @throws Error when called with no argument on a qualifier that has no promotion period.
   */
  removePromotionPeriod(promotionPeriod?: PromotionPeriod): void {
    const targetPromotionPeriod: PromotionPeriod | undefined =
      promotionPeriod !== undefined ? promotionPeriod : this.promotionPeriod;

    if (targetPromotionPeriod === undefined) {
      throw new Error(
        'PromotionQualifier.removePromotionPeriod was called with no argument on a qualifier that ' +
          'has no promotionPeriod. This reproduces the legacy runtime failure at ' +
          'model/entity/PromotionQualifier.cfc:L130-L132, where the omitted argument defaults to a ' +
          'null period and getPromotionQualifiers() is then invoked on it.',
      );
    }

    const siblingQualifiers: PromotionQualifier[] = targetPromotionPeriod.getPromotionQualifiers();
    const index: number = siblingQualifiers.indexOf(this);

    if (index !== -1) {
      siblingQualifiers.splice(index, 1);
    }

    this.promotionPeriod = undefined;
  }

  // THE TEN MEMBERSHIP PAIRS BELOW ARE STRUCTURALLY IDENTICAL, and the uniformity is verified rather
  // than assumed - all ten were read line by line in the source. Each `add*`:
  //
  //   if(arguments.<x>.isNew() or !has<X>(arguments.<x>)) { arrayAppend(variables.<xs>, arguments.<x>); }
  //   if(isNew() or !arguments.<x>.hasPromotionQualifier<Exclusion?>( this )) {
  //     arrayAppend(arguments.<x>.getPromotionQualifier<Exclusion?>s(), this);
  //   }
  //
  // and each `remove*` performs two INDEPENDENTLY GUARDED reference-based splices.
  //
  // ★ NOTE THE TWO DIFFERENT NEWNESS TESTS, and that they are NOT the same entity. The NEAR-side
  // guard tests the ARGUMENT's newness - the thing being added - while the FAR-side guard tests
  // `isNew()`, i.e. THIS qualifier. That is correct in both cases and is preserved verbatim: each
  // guard asks about the entity whose key would make the corresponding membership probe
  // meaningless. Reversing either would change which appends are skipped.
  //
  // THE NEAR SIDE MUTATES `variables.<xs>` DIRECTLY, not through the accessor. That is why every
  // collection accessor above can safely hand out a `readonly` view: the only writer is inside this
  // class.
  //
  // THE INCLUDED AND EXCLUDED PAIRS REACH TWO DIFFERENT FAR-SIDE COLLECTIONS -
  // `getPromotionQualifiers()` and `getPromotionQualifierExclusions()` respectively. Both are LIVE
  // on brand, option, sku, product and productType, and each of those modules cites the exact line
  // here as its census site.
  //
  // ALL TWENTY METHODS ARE TOTAL: every argument is `required`, so there is no null-default branch
  // to reproduce.

  /** [model/entity/PromotionQualifier.cfc:L140-L147] */
  addBrand(brand: Brand): void {
    if (brand.isNew() || !this.hasBrand(brand)) {
      this.brands.push(brand);
    }
    if (this.isNew() || !brand.hasPromotionQualifier(this)) {
      brand.getPromotionQualifiers().push(this);
    }
  }

  /** [model/entity/PromotionQualifier.cfc:L148-L157] */
  removeBrand(brand: Brand): void {
    const thisIndex: number = this.brands.indexOf(brand);
    if (thisIndex !== -1) {
      this.brands.splice(thisIndex, 1);
    }

    const farSide: PromotionQualifier[] = brand.getPromotionQualifiers();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /** [model/entity/PromotionQualifier.cfc:L160-L167] */
  addOption(option: Option): void {
    if (option.isNew() || !this.hasOption(option)) {
      this.options.push(option);
    }
    if (this.isNew() || !option.hasPromotionQualifier(this)) {
      option.getPromotionQualifiers().push(this);
    }
  }

  /** [model/entity/PromotionQualifier.cfc:L168-L177] */
  removeOption(option: Option): void {
    const thisIndex: number = this.options.indexOf(option);
    if (thisIndex !== -1) {
      this.options.splice(thisIndex, 1);
    }

    const farSide: PromotionQualifier[] = option.getPromotionQualifiers();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /** [model/entity/PromotionQualifier.cfc:L180-L187] */
  addSku(sku: Sku): void {
    if (sku.isNew() || !this.hasSku(sku)) {
      this.skus.push(sku);
    }
    if (this.isNew() || !sku.hasPromotionQualifier(this)) {
      sku.getPromotionQualifiers().push(this);
    }
  }

  /** [model/entity/PromotionQualifier.cfc:L188-L197] */
  removeSku(sku: Sku): void {
    const thisIndex: number = this.skus.indexOf(sku);
    if (thisIndex !== -1) {
      this.skus.splice(thisIndex, 1);
    }

    const farSide: PromotionQualifier[] = sku.getPromotionQualifiers();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /** [model/entity/PromotionQualifier.cfc:L200-L207] */
  addProduct(product: Product): void {
    if (product.isNew() || !this.hasProduct(product)) {
      this.products.push(product);
    }
    if (this.isNew() || !product.hasPromotionQualifier(this)) {
      product.getPromotionQualifiers().push(this);
    }
  }

  /** [model/entity/PromotionQualifier.cfc:L208-L217] */
  removeProduct(product: Product): void {
    const thisIndex: number = this.products.indexOf(product);
    if (thisIndex !== -1) {
      this.products.splice(thisIndex, 1);
    }

    const farSide: PromotionQualifier[] = product.getPromotionQualifiers();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /** [model/entity/PromotionQualifier.cfc:L220-L227] */
  addProductType(productType: ProductType): void {
    if (productType.isNew() || !this.hasProductType(productType)) {
      this.productTypes.push(productType);
    }
    if (this.isNew() || !productType.hasPromotionQualifier(this)) {
      productType.getPromotionQualifiers().push(this);
    }
  }

  /** [model/entity/PromotionQualifier.cfc:L228-L237] */
  removeProductType(productType: ProductType): void {
    const thisIndex: number = this.productTypes.indexOf(productType);
    if (thisIndex !== -1) {
      this.productTypes.splice(thisIndex, 1);
    }

    const farSide: PromotionQualifier[] = productType.getPromotionQualifiers();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /** [model/entity/PromotionQualifier.cfc:L240-L247] Far side is `getPromotionQualifierExclusions()`. */
  addExcludedBrand(brand: Brand): void {
    if (brand.isNew() || !this.hasExcludedBrand(brand)) {
      this.excludedBrands.push(brand);
    }
    if (this.isNew() || !brand.hasPromotionQualifierExclusion(this)) {
      brand.getPromotionQualifierExclusions().push(this);
    }
  }

  /** [model/entity/PromotionQualifier.cfc:L248-L257] */
  removeExcludedBrand(brand: Brand): void {
    const thisIndex: number = this.excludedBrands.indexOf(brand);
    if (thisIndex !== -1) {
      this.excludedBrands.splice(thisIndex, 1);
    }

    const farSide: PromotionQualifier[] = brand.getPromotionQualifierExclusions();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /** [model/entity/PromotionQualifier.cfc:L260-L267] */
  addExcludedOption(option: Option): void {
    if (option.isNew() || !this.hasExcludedOption(option)) {
      this.excludedOptions.push(option);
    }
    if (this.isNew() || !option.hasPromotionQualifierExclusion(this)) {
      option.getPromotionQualifierExclusions().push(this);
    }
  }

  /** [model/entity/PromotionQualifier.cfc:L268-L277] */
  removeExcludedOption(option: Option): void {
    const thisIndex: number = this.excludedOptions.indexOf(option);
    if (thisIndex !== -1) {
      this.excludedOptions.splice(thisIndex, 1);
    }

    const farSide: PromotionQualifier[] = option.getPromotionQualifierExclusions();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /** [model/entity/PromotionQualifier.cfc:L280-L287] */
  addExcludedSku(sku: Sku): void {
    if (sku.isNew() || !this.hasExcludedSku(sku)) {
      this.excludedSkus.push(sku);
    }
    if (this.isNew() || !sku.hasPromotionQualifierExclusion(this)) {
      sku.getPromotionQualifierExclusions().push(this);
    }
  }

  /** [model/entity/PromotionQualifier.cfc:L288-L297] */
  removeExcludedSku(sku: Sku): void {
    const thisIndex: number = this.excludedSkus.indexOf(sku);
    if (thisIndex !== -1) {
      this.excludedSkus.splice(thisIndex, 1);
    }

    const farSide: PromotionQualifier[] = sku.getPromotionQualifierExclusions();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /** [model/entity/PromotionQualifier.cfc:L300-L307] */
  addExcludedProduct(product: Product): void {
    if (product.isNew() || !this.hasExcludedProduct(product)) {
      this.excludedProducts.push(product);
    }
    if (this.isNew() || !product.hasPromotionQualifierExclusion(this)) {
      product.getPromotionQualifierExclusions().push(this);
    }
  }

  /** [model/entity/PromotionQualifier.cfc:L308-L317] */
  removeExcludedProduct(product: Product): void {
    const thisIndex: number = this.excludedProducts.indexOf(product);
    if (thisIndex !== -1) {
      this.excludedProducts.splice(thisIndex, 1);
    }

    const farSide: PromotionQualifier[] = product.getPromotionQualifierExclusions();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  /** [model/entity/PromotionQualifier.cfc:L320-L327] */
  addExcludedProductType(productType: ProductType): void {
    if (productType.isNew() || !this.hasExcludedProductType(productType)) {
      this.excludedProductTypes.push(productType);
    }
    if (this.isNew() || !productType.hasPromotionQualifierExclusion(this)) {
      productType.getPromotionQualifierExclusions().push(this);
    }
  }

  /** [model/entity/PromotionQualifier.cfc:L328-L337] */
  removeExcludedProductType(productType: ProductType): void {
    const thisIndex: number = this.excludedProductTypes.indexOf(productType);
    if (thisIndex !== -1) {
      this.excludedProductTypes.splice(thisIndex, 1);
    }

    const farSide: PromotionQualifier[] = productType.getPromotionQualifierExclusions();
    const thatIndex: number = farSide.indexOf(this);
    if (thatIndex !== -1) {
      farSide.splice(thatIndex, 1);
    }
  }

  // NO HELPERS EXIST FOR `fulfillmentMethods`, `shippingMethods` OR `shippingAddressZones`, and none
  // is authored here. See the header: three out-of-scope entities call
  // `addFulfillmentMethods` (plural), `addShippingMethod` and `addAddressZone`, and all six of those
  // calls reach the `onMissingMethod` throw at org/Hibachi/HibachiEntity.cfc:L565.
  //
  // AUTHORING THE THREE MISSING PAIRS HERE WOULD SILENTLY REPAIR SIX PRESERVED DEFECTS AND MAKE
  // THREE PROMOTION GATES POPULATABLE FOR THE FIRST TIME - a change to which orders qualify for a
  // promotion, i.e. a change to money. This absence is a CONTRACT, exactly like the
  // `getPromotionAccounts()` anti-contract in src/domain/entities/promotionAccount.ts and the
  // excluded-helper anti-contract in src/domain/entities/priceGroupRate.ts.

  // =============  END:  Bidirectional Helper Methods ===================

  // =============== START: Custom Validation Methods ====================
  // [model/entity/PromotionQualifier.cfc:L341] opens this block and L343 closes it, and IT IS EMPTY.
  // Consistent with the total absence of a model/validation/PromotionQualifier.json - see the
  // header. Nothing validates the ten numeric gates in the legacy system, and nothing is invented
  // here. The empty banner is recorded rather than omitted so a reviewer diffing this file against
  // the CFC finds the same structure.
  // ===============  END: Custom Validation Methods =====================

  // =============== START: Custom Formatting Methods ====================
  // [model/entity/PromotionQualifier.cfc:L345] opens this block and L347 closes it, and IT IS EMPTY.
  // Note that this is consistent rather than surprising: no property on this entity declares
  // `hb_formatType="custom"`, so there is no `get<Property>Formatted()` for the framework's
  // `getFormattedValue` to delegate back to [org/Hibachi/HibachiTransient.cfc:L502-L504]. Contrast
  // model/entity/PriceGroupRate.cfc:L54, which does, and therefore hand-writes
  // `getAmountFormatted()`.
  // ===============  END: Custom Formatting Methods =====================

  // ============== START: Overridden Implicet Getters ===================
  // [model/entity/PromotionQualifier.cfc:L349] opens this block and L351 closes it, and IT IS EMPTY.
  // The source's own spelling of the banner - "Implicet" - is reproduced above rather than
  // corrected, because a reviewer diffing this file against the CFC should find the same words.
  // ==============  END: Overridden Implicet Getters ====================

  // ================== START: Overridden Methods ========================
  // [model/entity/PromotionQualifier.cfc:L353] opens this block and L363 closes it.

  /**
   * `getSimpleRepresentationPropertyName` [model/entity/PromotionQualifier.cfc:L355-L357]
   *
   * Returns the literal `"qualifierType"`.
   *
   * ★ THIS IS NOT DEAD CODE, EVEN THOUGH `getSimpleRepresentation()` IS OVERRIDDEN ABOVE. The
   * natural conclusion is that it must be unreachable: the framework base's
   * `getSimpleRepresentation()` [org/Hibachi/HibachiEntity.cfc:L59-L71] is the caller that consults
   * this method, and this entity displaces that base method with its own version at [L101]. That
   * reasoning is correct as far as it goes and the conclusion is still WRONG, because the base
   * method is not the only caller. Two others exist, both verified by grep across
   * `org/Hibachi/**`:
   *
   *   1. [org/Hibachi/HibachiEntity.cfc:L390] - inside `getPropertyOptions`, where it supplies
   *      `smartList.addSelect(propertyIdentifier=..., alias="name")`. So when ANY OTHER entity
   *      builds a `promotionQualifier` option list, THIS value decides which column becomes the
   *      display name of each row.
   *   2. [org/Hibachi/HibachiService.cfc:L31] - inside keyword-search construction, where it
   *      supplies `addKeywordProperty(propertyIdentifier=..., weight=1)`. So this value also decides
   *      which column an admin keyword search matches against.
   *
   * Both members are therefore authored, and neither is redundant. Recording the reasoning matters
   * more than the conclusion: a future reader who repeats the shallow analysis would delete a live
   * framework contract.
   *
   * ★ CONTRAST THE THREE OTHER SHAPES IN THIS FOLDER. model/entity/ProductType.cfc:L273 overrides
   * `getSimpleRepresentation()` and does NOT declare the property-name variant.
   * model/entity/PriceGroupRate.cfc:L270 declares the property-name variant and does NOT override
   * the method. This entity declares BOTH. And the base throws at
   * [org/Hibachi/HibachiEntity.cfc:L87] when NEITHER is supplied. Four distinct legacy shapes, each
   * ported as it stands.
   */
  getSimpleRepresentationPropertyName(): string {
    return 'qualifierType';
  }

  /**
   * `isDeletable` - whether this qualifier may be deleted.
   * [model/entity/PromotionQualifier.cfc:L359-L361]
   *
   *   return !getPromotionPeriod().isExpired() && getPromotionPeriod().getPromotion().isDeletable();
   *
   * A TWO-LEVEL CLIMB WITH THREE UNGUARDED DEREFERENCES, all preserved:
   *
   *   * `getPromotionPeriod()` is nullable [L68, no `notNull`] and `.isExpired()` is called on it
   *     directly.
   *   * `getPromotionPeriod()` is dereferenced a SECOND time for `.getPromotion()`.
   *   * `.getPromotion()` is itself nullable on the far side and `.isDeletable()` is called on it
   *     directly.
   *
   * All three are CFML null-reference errors in the legacy, so all three raise here.
   *
   * ★ THE SHORT-CIRCUIT IS LOAD-BEARING, and it is why the second and third dereferences are
   * reached only conditionally. CFML `&&` short-circuits, so an EXPIRED period returns `false`
   * WITHOUT ever touching `getPromotion()`. That means an expired qualifier whose promotion is
   * unmaterialized answers `false` rather than raising - a real, observable difference from
   * evaluating both operands eagerly, and the reason the body below is written as two statements
   * rather than one expression.
   *
   * ★ AND THE OVERRIDE IS WHAT MAKES THIS METHOD EXIST AT ALL. The framework's own version
   * [org/Hibachi/HibachiEntity.cfc:L204-L206] drives deletability from the entity's validation file
   * in the `delete` context - and there is NO model/validation/PromotionQualifier.json, so the base
   * version would have had nothing to consult. This override is the entire deletability rule for
   * this entity. Contrast model/entity/PromotionCode.cfc, which declares NO `isDeletable()` and
   * relies on exactly that framework path through its own validation file's
   * `{"contexts":"delete","maxCollection":0}` rule.
   *
   * @throws Error when the promotion period is unmaterialized, or when a non-expired period's
   *   promotion is unmaterialized.
   */
  isDeletable(): boolean {
    const promotionPeriod: PromotionPeriod | undefined = this.promotionPeriod;

    if (promotionPeriod === undefined) {
      throw new Error(
        'PromotionQualifier.isDeletable was called on a qualifier with no materialized ' +
          'promotionPeriod. model/entity/PromotionQualifier.cfc:L360 calls ' +
          'getPromotionPeriod().isExpired() with no null guard, so an unattached or unjoined ' +
          'qualifier is a CFML null-reference error there too.',
      );
    }

    // [model/entity/PromotionQualifier.cfc:L360] the FIRST operand. CFML `&&` short-circuits, so an
    // expired period answers `false` WITHOUT the second dereference below - which is why this is a
    // separate statement rather than one expression.
    if (promotionPeriod.isExpired()) {
      return false;
    }

    // [L360] the SECOND operand: a second dereference of the period, then an unguarded call on its
    // promotion.
    const promotion = promotionPeriod.getPromotion();

    if (promotion === undefined) {
      throw new Error(
        'PromotionQualifier.isDeletable reached the second operand of its deletability test but ' +
          'the promotion period has no materialized promotion. ' +
          'model/entity/PromotionQualifier.cfc:L360 calls ' +
          'getPromotionPeriod().getPromotion().isDeletable() with no null guard. This branch is ' +
          'reached only when the period is NOT expired - an expired period short-circuits to false ' +
          'before touching the promotion.',
      );
    }

    return promotion.isDeletable();
  }

  // ==================  END:  Overridden Methods ========================

  // =================== START: ORM Event Hooks  =========================
  // [model/entity/PromotionQualifier.cfc:L365] opens this block and L367 closes it, and IT IS EMPTY.
  //
  // SO NEITHER `preInsert()` NOR `preUpdate()` IS DECLARED HERE, deliberately. The folder's lifecycle
  // contract is `preInsert(): void` / `preUpdate(oldData?): void` on the three entities that maintain
  // derived state on save - category.ts, priceGroup.ts and productType.ts, each maintaining a
  // materialized ID path. This entity maintains none, so authoring empty hooks would assert a
  // maintenance obligation the source does not have.
  // ===================  END:  ORM Event Hooks  =========================

  // ================== START: Deprecated Methods ========================
  // [model/entity/PromotionQualifier.cfc:L369] opens this block and L371 closes it, and IT IS EMPTY.
  // Contrast model/entity/Sku.cfc:L885-L910, which has four. Recorded so the absence reads as a fact
  // about the source rather than an omission here.
  // ==================  END:  Deprecated Methods ========================
}

// ---------------------------------------------------------------------------
// WHAT THE TEST TIER MUST PIN FOR THIS MODULE (all NET-NEW - `PromotionQualifier` has no legacy test)
//
//   1. ALL THIRTEEN collection accessors are `readonly` views and NOT live, and the census reason is
//      named in the test so a future "consistency" change has to argue with the census rather than
//      with a style preference. This is the mirror image of the LIVE assertions in brand.ts,
//      option.ts and productType.ts, and pinning both sides is what makes the owner/inverse
//      inversion regression-proof.
//   2. Every collection defaults to `[]` when the constructor omits it - never `undefined`.
//   3. ★ ALL TEN NUMERIC GATES return `undefined` when the constructor omits them - NEVER `0`, never
//      `Infinity`, never a `Money` of zero. Assert each of the ten individually; a substituted zero
//      on any of the five MAXIMA would disqualify every order, and that is the single
//      highest-consequence parity check in this file.
//   4. The three-way type split holds: the four quantity gates are plain numbers, the four currency
//      gates are `Money`, and the two fulfillment-weight gates are `DecimalString`. A test that
//      constructs a weight gate from a `Money` must not compile.
//   5. `getRewardMatchingTypeOptions()` returns exactly five rows, in the order
//      any/sku/product/productType/brand, with each name being
//      `entity.promotionQualifier.rewardMatchingType.<value>`. ★ Assert the key-to-value CONSISTENCY
//      explicitly - it is the property that distinguishes this option list from
//      `PriceGroupRate.getAmountTypeOptions()`, whose third pair deliberately mismatches.
//   6. `getRewardMatchingTypeOptions()` returns a FRESH array each call - two calls must not share
//      identity.
//   7. `getSimpleRepresentation()` composes `<entity label> - <qualifier-type label>` with the
//      separator being exactly three characters, space-hyphen-space.
//   8. ★ `getSimpleRepresentation()` on a qualifier with `qualifierType: undefined` emits the entity
//      label followed by the separator and NOTHING - a TRAILING space survives. Assert the exact
//      string. This is the `getFormattedValue` rbKey-branch `else { return ''; }` at
//      org/Hibachi/HibachiTransient.cfc:L507-L508, and a trimmed result would be a different output.
//   9. `getSimpleRepresentation()` passes the STORED qualifier type to the provider verbatim - assert
//      with a mixed-case value, since the key is built from the value as-is.
//  10. `getSimpleRepresentation()` RAISES with no injected provider, and the message names both keys.
//  11. `getSimpleRepresentationPropertyName()` returns exactly `"qualifierType"`. ★ Add a test whose
//      NAME records that this method is live via HibachiEntity.cfc:L390 and HibachiService.cfc:L31
//      despite getSimpleRepresentation() being overridden - the test is the guard against a future
//      "this is unreachable, delete it".
//  12. `isDeletable()` returns `false` for an EXPIRED period WITHOUT touching the promotion - assert
//      with the promotion deliberately unmaterialized, so an eager implementation raises and fails.
//      This is the short-circuit assertion and it is the reason the body is two statements.
//  13. `isDeletable()` returns the promotion's own answer for a non-expired period - assert both
//      `true` and `false`.
//  14. `isDeletable()` RAISES with no materialized period, and RAISES for a non-expired period with
//      no materialized promotion - two distinct messages, both asserted.
//  15. `isNew()` is TRUE for `promotionQualifierID: ''` and FALSE otherwise.
//  16. `setPromotionPeriod()` appends to the period's LIVE qualifier array unconditionally when THIS
//      qualifier is new, and at most once when it is saved.
//  17. `removePromotionPeriod()` splices BY REFERENCE - a distinct object with the SAME primary key
//      must NOT be removed. That is the assertion that documents the
//      arrayFind-vs-Hibachi-contains distinction, and it must not be "fixed" to a key comparison.
//  18. `removePromotionPeriod()` clears the local reference EVEN WHEN the qualifier was not found,
//      and RAISES when called with no argument on an unattached qualifier.
//  19. All ten `add*` pairs guard the NEAR side on the ARGUMENT's newness and the FAR side on THIS
//      qualifier's newness. Construct the four combinations for at least one included and one
//      excluded pair and assert which appends happen - reversing either polarity must fail.
//  20. The five INCLUDED pairs reach `getPromotionQualifiers()` on the far side and the five EXCLUDED
//      pairs reach `getPromotionQualifierExclusions()`. Assert the far-side collection each one
//      touches; crossing them would be invisible to a contents-only test.
//  21. All ten `remove*` methods splice BOTH sides with INDEPENDENT guards: a needle present on one
//      side only must still be removed from that side.
//  22. The ten entity-typed `has*` probes match by PRIMARY KEY across two distinct objects
//      representing the same saved row, and fall back to REFERENCE identity when the candidate's key
//      is `''`.
//  23. The three projection-typed probes - `hasFulfillmentMethod`, `hasShippingMethod`,
//      `hasShippingAddressZone` - match by PRIMARY KEY ONLY and have NO reference fallback. Assert
//      that two distinct objects with the same ID DO match, and record in the test name that the far
//      side has no `isNew()` to consult.
//  24. ★ THE ANTI-CONTRACT: assert the ABSENCE of `addFulfillmentMethod`, `addFulfillmentMethods`,
//      `removeFulfillmentMethod`, `addShippingMethod`, `removeShippingMethod`, `addAddressZone`,
//      `addShippingAddressZone`, `removeAddressZone` and `removeShippingAddressZone` on the
//      prototype. Adding any of them would silently repair six preserved defects in three
//      out-of-scope entities and make three promotion gates populatable for the first time, so the
//      absence is pinned the same way promotionAccount.ts's anti-contract is.
//  25. `getQualifierApplicationTypeOptions` is ABSENT - the L99 property is vestigial and has exactly
//      one occurrence in the whole repository. Pin the absence so a future "every options property
//      needs a getter" sweep has to read the note.
//  26. `preInsert` and `preUpdate` are ABSENT from this class - the source's ORM hook banner is empty.
//  27. ★ `hasAnyOption` and `hasAnyExcludedOption` SHORT-CIRCUIT on the first match. Pass an array
//      whose FIRST element is a member and whose second is a spy/getter that would record being
//      read; assert the second was never touched. This is `hasAnyInProperty`'s in-loop `return true`
//      [org/Hibachi/HibachiEntity.cfc:L343-L345], not a whole-array scan.
//  28. ★ BOTH aggregate probes answer FALSE for an EMPTY array - `hasAnyInProperty` runs its loop
//      zero times and falls to `return false` [org/Hibachi/HibachiEntity.cfc:L348]. This is the
//      load-bearing case at [model/service/PromotionService.cfc:L885]: a SKU with NO options must
//      NOT be excluded by an option-based exclusion gate. Asserting `true` here - or raising - would
//      disqualify every optionless SKU from every qualifier that carries an option exclusion.
//  29. Both aggregate probes DELEGATE: an unsaved candidate present by REFERENCE in `options` is
//      found by `hasAnyOption`, because `hasOption` supplies the reference fallback. Assert through
//      the aggregate rather than only through the singular probe, so a future reimplementation that
//      inlines a key-only comparison here is caught.
// ---------------------------------------------------------------------------
