// ---------------------------------------------------------------------------
// PORT OF model/entity/PromotionReward.cfc (426 lines, confirmed by `wc -l`)
//
// SOURCE COMPONENT DECLARATION, verbatim [model/entity/PromotionReward.cfc:L57]:
//
//   component displayname="Promotion Reward" entityname="SlatwallPromotionReward"
//             table="SwPromoReward" persistent="true" extends="HibachiEntity"
//             cacheuse="transactional" hb_serviceName="promotionService"
//             hb_permission="promotionPeriod.promtionRewards" {
//
// ★ THE PERMISSION KEY IS MISSPELLED IN THE SOURCE: `promotionPeriod.promtionRewards`, missing the
//   `o` in "promotion". The AAP registers this in the defect register (§0.6.7, secondary items) and
//   directs that identifier typos which form part of a DATA CONTRACT be preserved verbatim with an
//   explanatory comment, and that purely internal ones be renamed with a comment. A permission key is
//   looked up by exact string against the legacy admin's permission tree, so it is a data contract:
//   the string is reproduced byte-for-byte below and is NOT corrected.
//
// ★ THE PHYSICAL TABLE IS `SwPromoReward`, NOT `SwPromotionReward`. The abbreviation is not
//   cosmetic - this entity owns FOURTEEN many-to-many link tables, and their names are built from
//   the owner prefix. `SwPromoRewardExclProductType` is already 28 characters; spelling the prefix
//   out in full would push several past what the abbreviated form keeps comfortable inside MySQL's
//   64-character identifier limit, and two of them (`SwPromoRewardEligiblePriceGrp`,
//   `SwPromoRewardShipAddressZone`) are additionally abbreviated in their own right. Schema
//   continuity is a binding AAP constraint (§0.8.1): every one of the fifteen table names below is
//   reproduced exactly as the source declares it, and none is renamed.
//
// ★ WHAT THIS ENTITY IS FOR. `PromotionQualifier` is the GATE half of the promotion engine - it
//   decides WHETHER a promotion period applies. This is the OTHER half: it decides WHAT the discount
//   is and WHICH order items receive it. Its `amount`/`amountType` pair drives
//   `getDiscountAmount()` [model/service/PromotionService.cfc:L987-L1018], which the AAP names as
//   must-preserve behaviour (§0.8.1, "Preserve Exactly"); its three `maximumUse*` limits drive the
//   mutable usage ledger [model/service/PromotionService.cfc:L173-L188] whose statefulness is
//   hotspot 1 (§0.6.1); and its include/exclude collections drive `getOrderItemInReward()`
//   [model/service/PromotionService.cfc:L921-L985]. A wrong value on any of those changes the amount
//   a customer is charged.
//
// ★ THE FIVE VALID REWARD TYPES are documented in the source's own header comment
//   [model/entity/PromotionReward.cfc:L46-L56]:
//
//     merchandise · subscription · contentAccess · fulfillment · order
//
//   The engine branches on exactly those:
//     - `listFindNoCase("merchandise,subscription,contentAccess", reward.getRewardType())` gates the
//       ITEM-level pass [model/service/PromotionService.cfc:L200];
//     - `reward.getRewardType() eq "fulfillment"` gates the FULFILLMENT pass [L345];
//     - `reward.getRewardType() eq "order"` gates the ORDER-level pass [L415], which is the SECOND
//       of the two passes described in §0.6.1 vector 2.
//   `rewardType` is nonetheless a plain nullable `ormType="string"` with no database constraint and
//   no enumeration, so it is typed `string | undefined` here rather than narrowed to a union. A
//   union would be a schema guarantee this port cannot honestly make: a sixth value already sitting
//   in `SwPromoReward.rewardType` would silently fail every branch in the legacy engine too, and
//   that is the behaviour to preserve.
//
// RECEIVER-QUALIFIED LIVENESS CENSUS - ALL SIXTEEN ACCESSORS ARE READONLY.
//
//   The project rule: an accessor returns the LIVE mutable array if and only if some entity under
//   `model/entity/*.cfc` performs `arrayAppend`/`arrayDeleteAt` on it IN PLACE THROUGH THAT
//   ACCESSOR, receiver-qualified. Two greps settle it for this class:
//
//     grep -rE "array(Append|DeleteAt)\(\s*(arguments\.)?(promotionReward|reward)\.get" model/
//       -> ZERO HITS
//     grep -rE "array(Append|DeleteAt)\([^,)]*\.(getEligiblePriceGroups|getFulfillmentMethods|
//        getShippingAddressZones|getShippingMethods|getBrands|getOptions|getSkus|getProducts|
//        getProductTypes|getExcluded...)\(" model/
//       -> 14 hits, EVERY ONE on a different receiver (brand, optionGroup, fulfillmentMethod,
//          product, subscriptionTerm, accessContent, subscriptionBenefit). NONE on a reward.
//
//   | source property [locator]                  | far side              | verdict  |
//   |--------------------------------------------|-----------------------|----------|
//   | promotionPeriod           [L70]            | PromotionPeriod       | scalar   |
//   | roundingRule              [L71]            | RoundingRule          | scalar   |
//   | eligiblePriceGroups       [L74]            | PriceGroup            | readonly |
//   | fulfillmentMethods        [L76]            | FulfillmentMethod *   | readonly |
//   | shippingAddressZones      [L77]            | AddressZone *         | readonly |
//   | shippingMethods           [L78]            | ShippingMethod *      | readonly |
//   | brands                    [L80]            | Brand                 | readonly |
//   | options                   [L81]            | Option                | readonly |
//   | skus                      [L82]            | Sku                   | readonly |
//   | products                  [L83]            | Product               | readonly |
//   | productTypes              [L84]            | ProductType           | readonly |
//   | excludedBrands            [L86]            | Brand                 | readonly |
//   | excludedOptions           [L87]            | Option                | readonly |
//   | excludedSkus              [L88]            | Sku                   | readonly |
//   | excludedProducts          [L89]            | Product               | readonly |
//   | excludedProductTypes      [L90]            | ProductType           | readonly |
//                                                  (* out of scope - projected, see below)
//
//   THE OWNER/INVERSE INVERSION, CONFIRMED AGAIN. Every one of these fourteen is the many-to-many
//   OWNER side, and this class's own thirteen `add*`/`remove*` pairs mutate `variables.<x>` directly
//   - 24 in-place mutations of private storage, never through a public accessor. The far sides are
//   the INVERSE side, and THEIR accessors are the live ones: `brand.getPromotionRewards()`,
//   `option.getPromotionRewardExclusions()`, `priceGroup.getPromotionRewards()` and so on are all
//   mutated from inside this component. This is the same shape as priceGroupRate.ts (6/6 readonly)
//   and promotionQualifier.ts (13/13 readonly), and it is now established as universal across the
//   folder rather than incidental.
//
// FOUR DEFECTS AND ONE ANTI-CONTRACT ARE PRESERVED HERE. Each is marked at its site:
//
//   D1. The misspelled `hb_permission` key [L57], described above.
//   D2. `ShippingMethod.cfc:L105` and `:L108` call `promotionReward.addShipppingMethod(...)` and
//       `removeShipppingMethod(...)` - with THREE p's - while this component declares the two-p
//       spelling at [L178] and [L186]. Both far-side calls therefore miss and land on the
//       `onMissingMethod` throw at [org/Hibachi/HibachiEntity.cfc:L565]. The reward -> shippingMethod
//       direction WORKS; the shippingMethod -> reward direction is dead. Recorded as an
//       anti-contract on the projection below rather than repaired.
//   D3. NO `add*`/`remove*` PAIR EXISTS FOR `fulfillmentMethods` OR `shippingAddressZones`, even
//       though both are read by the engine. `FulfillmentMethod.cfc:L107` calls
//       `addFulfillmentMethods(...)` (PLURAL) and `AddressZone.cfc:L102` calls `addAddressZone(...)`
//       - a name that would not match the `shippingAddressZones` property even if a helper existed.
//       Both reach the L565 throw. Neither pair is authored here; see the anti-contract note in the
//       bidirectional-helper section.
//   D4. `getAmountTypeOptions()` [L120-L134] returns `{name=rbKey("define.fixedAmount"),
//       value="amount"}` - the resource key says "fixedAmount" and the stored value is "amount".
//       Byte-identical to the same mismatch in `PriceGroupRate.getAmountTypeOptions()`
//       [model/entity/PriceGroupRate.cfc:L91], so it is a shared copy rather than a local slip.
//       Preserved: `getDiscountAmount()`'s switch at [model/service/PromotionService.cfc:L998] cases
//       on `"amount"`, so changing the value would break discount dispatch.
//
// ★ ONE PLACE WHERE THIS CLASS IS CORRECT AND ITS SIBLING IS NOT. The reward's shipping-address-zone
//   gate at [model/service/PromotionService.cfc:L358-L362] and again at [L1060-L1063] iterates
//   `reward.getShippingAddressZones()` and calls `isAddressInZone(address, zone)` on each element -
//   which is exactly what a zone gate should do. The QUALIFIER's equivalent at
//   [model/service/PromotionService.cfc:L703] instead re-tests `hasShippingMethod(...)`, which is
//   defect 11 of the AAP register and means the qualifier's zone gate never evaluates a zone at all.
//   The consequence for this port is concrete and is reflected in the projections below: the reward's
//   zone elements are handed to the `AddressZoneEvaluator` port, so they must carry
//   `addressZoneLocations`; the qualifier's never are, so its projection needs only a primary key.
//   That asymmetry is defect-derived, not an inconsistency between the two files.
//
// THE `extends` CHAIN IS THREE LEVELS DEEP, NOT TWO. `extends="HibachiEntity"` on L57 is
//   UNQUALIFIED, so it resolves to the local model/entity/HibachiEntity.cfc (274 lines), whose own
//   L49 reads `component output="false" accessors="true" persistent="false"
//   extends="Slatwall.org.Hibachi.HibachiEntity"` - and that in turn extends HibachiTransient, which
//   extends HibachiObject. The intermediate Slatwall-level class is where `setting()` [L129],
//   `populate()` [L56] and `getAttributeValue()` [L151] actually live, so it is not an irrelevant
//   link in the chain; 112 of the 113 components under model/entity/ pass through it.
//   The framework is a boundary to extract from and never modify (AAP §0.2.2). What it supplied is
//   redistributed explicitly: `isNew()` becomes the empty-key test below, the implicit ORM `has*`
//   accessors become the containment probes, `hasAnyInProperty` becomes the two aggregate probes,
//   `getFormattedValue`/`formatValue`/`rbKey` become injected label and formatter contracts, and
//   persistence moves entirely to the repository layer.
//
// SMART LISTS ARE NOT PORTED (AAP §0.6.2). Nothing in this component builds one.
//
// VALIDATION: `model/validation/PromotionReward.json` EXISTS, so the constraint set for this entity
//   is ported from that file by the validation tier. Contrast `PromotionQualifier`, which has no
//   validation file at all - which is why nothing in the legacy system validates its ten gates.
//
// TEST COVERAGE IS ENTIRELY NET-NEW. `meta/tests/` contains no PromotionRewardTest of any kind; the
//   only two legacy test files touching the in-scope slice are BrandTest and ProductTest
//   (AAP §0.6.6). The obligations are enumerated in the footer and are labelled net-new, never
//   presented as parity.
//
// NO USER RULES WERE PROVIDED for this project (AAP §0.7), so enterprise-standard practice applies:
//   maximal strictness, one exported unit per file, no barrel re-exports, all money through `Money`,
//   and every judgement call annotated where it was made.
// ---------------------------------------------------------------------------

import type { Money } from '../valueObjects/money.js';
import type { Brand } from './brand.js';
import type { Option } from './option.js';
import type { PriceGroup } from './priceGroup.js';
import type { Product } from './product.js';
import type { ProductType } from './productType.js';
import type { PromotionPeriod } from './promotionPeriod.js';
import type { RoundingRule } from './roundingRule.js';
import type { Sku } from './sku.js';

/**
 * The `fulfillmentMethods` far side.
 * [model/entity/PromotionReward.cfc:L76] `cfc="FulfillmentMethod"
 * linktable="SwPromoRewardFulfillmentMethod" inversejoincolumn="fulfillmentMethodID"`, and
 * [model/entity/FulfillmentMethod.cfc:L49] for the primary key.
 *
 * `SlatwallFulfillmentMethod` is out of scope (AAP §0.2.2 excludes the whole
 * order/checkout/fulfillment pipeline), so it is projected structurally rather than imported. ONE
 * MEMBER, and that is everything the entity needs: `hasFulfillmentMethod()` below compares primary
 * keys, and no helper pair exists on this side to reach any further (defect D3).
 *
 * Declared module-local and UN-EXPORTED. The AAP locks the port inventory at THIRTEEN exported
 * contracts under `src/domain/ports/` (§0.3.1, §0.4.1) and that inventory counts EXPORTED
 * CONTRACTS rather than files, so an exported collaborator interface is a budget violation wherever
 * it sits. Same treatment as `QualifierFulfillmentMethodLink` in
 * src/domain/entities/promotionQualifier.ts.
 */
interface RewardFulfillmentMethodLink {
  getFulfillmentMethodID(): string;
}

/**
 * One location of an address zone.
 * [model/entity/AddressZoneLocation.cfc], reached through
 * `getAddressZoneLocations()` [model/service/AddressService.cfc:L60-L61].
 *
 * ★ A DELIBERATE STRUCTURAL MIRROR of `AddressZoneLocationProjection` in
 * src/domain/ports/addressZoneEvaluator.ts, kept field-for-field identical - including the
 * `?: string | null` shape, where BOTH absence and `null` mean "no constraint on this field",
 * because the legacy test is `!isNull(...)` and treats the two alike.
 *
 * It is MIRRORED RATHER THAN IMPORTED on purpose. No entity module in this folder imports from
 * `src/domain/ports/**`, and that is a deliberate layering choice, not an oversight: a port is a
 * contract the SERVICE tier depends on, and giving an entity a compile-time edge to one would
 * couple the innermost layer to a collaborator it never calls. This entity never calls
 * `isAddressInZone` - [model/service/PromotionService.cfc:L362] and [L1063] do, from the service
 * tier where the port is injected. All this entity does is hold the zones and hand them back.
 *
 * Structural typing is what makes the mirror sufficient: an element of
 * `getShippingAddressZones()` is assignable to `AddressZoneProjection` at the service call site with
 * no cast. If the port's shape ever changes, that assignment becomes a compile error in the service
 * - which is the correct place to discover it.
 */
interface RewardAddressZoneLocationLink {
  readonly postalCode?: string | null;
  readonly city?: string | null;
  readonly stateCode?: string | null;
  readonly countryCode?: string | null;
}

/**
 * The `shippingAddressZones` far side.
 * [model/entity/PromotionReward.cfc:L77] `cfc="AddressZone"
 * linktable="SwPromoRewardShipAddressZone" inversejoincolumn="addressZoneID"`, and
 * [model/entity/AddressZone.cfc:L49] for the primary key.
 *
 * TWO MEMBERS, and each earns its place from a distinct call site:
 *
 *   - `getAddressZoneID()` backs `hasShippingAddressZone()` below.
 *   - `addressZoneLocations` is what the engine hands to the `AddressZoneEvaluator` port at
 *     [model/service/PromotionService.cfc:L362] and [L1063]. See
 *     {@link RewardAddressZoneLocationLink} for why it is mirrored rather than imported.
 *
 * ★ THIS IS WHERE THIS CLASS DIVERGES FROM `promotionQualifier.ts`, and the divergence is derived
 * from a defect rather than from taste. `QualifierAddressZoneLink` carries the primary key ALONE,
 * because the qualifier's zone gate at [model/service/PromotionService.cfc:L703] re-tests
 * `hasShippingMethod(...)` instead of testing the zone - AAP defect 11 - so a qualifier's zones are
 * never handed to the evaluator and never need locations. The reward's zone gate is correct, so its
 * zones do. Two different shapes because the two legacy code paths genuinely differ.
 */
interface RewardAddressZoneLink {
  getAddressZoneID(): string;
  readonly addressZoneLocations: readonly RewardAddressZoneLocationLink[];
}

/**
 * The `shippingMethods` far side.
 * [model/entity/PromotionReward.cfc:L78] `cfc="ShippingMethod"
 * linktable="SwPromoRewardShippingMethod" inversejoincolumn="shippingMethodID"`, and
 * [model/entity/ShippingMethod.cfc:L49] for the primary key.
 *
 * THREE MEMBERS - the widest of the three out-of-scope projections in this file, and every member is
 * forced by a verbatim call site inside `addShippingMethod`/`removeShippingMethod`
 * [model/entity/PromotionReward.cfc:L178-L195]:
 *
 *   public void function addShippingMethod(required any shippingMethod) {
 *     if(arguments.shippingMethod.isNew() or !hasShippingMethod(arguments.shippingMethod)) {   <- key
 *       arrayAppend(variables.shippingMethods, arguments.shippingMethod);
 *     }
 *     if(isNew() or !arguments.shippingMethod.hasPromotionReward( this )) {          <- probe
 *       arrayAppend(arguments.shippingMethod.getPromotionRewards(), this);           <- LIVE array
 *     }
 *   }
 *
 * ★ `getPromotionRewards()` RETURNS A MUTABLE ARRAY on this projection, and that is not a leak in the
 * abstraction - it is the abstraction. The legacy line appends INTO the array the far-side accessor
 * hands back, so a `readonly` return type here would make the inverse half of the relationship
 * unimplementable. Every LIVE accessor in this folder exists for exactly this reason.
 *
 * ★ NOTE WHAT IS ABSENT: `isNew()`. The near-side guard at L179 calls
 * `arguments.shippingMethod.isNew()`, but this port reproduces the newness test as
 * `getShippingMethodID() === ''` inside `hasShippingMethod` instead of asking the far side, because
 * `unsavedvalue=""` makes those two tests identical and the narrower projection is the honest one -
 * an out-of-scope entity should not be required to expose framework machinery to satisfy this file.
 *
 * ★ ANTI-CONTRACT ON THE OTHER DIRECTION - DEFECT D2. `ShippingMethod.cfc:L105` and `:L108` call
 * `promotionReward.addShipppingMethod(...)` / `removeShipppingMethod(...)` with THREE p's, while this
 * component declares the two-p spelling. Both calls miss and reach the `onMissingMethod` throw at
 * [org/Hibachi/HibachiEntity.cfc:L565]. The misspelling is NOT added to this class as an alias:
 * doing so would make two dead call sites in an out-of-scope entity start working and would begin
 * populating `SwPromoRewardShippingMethod` from a direction that has never populated it.
 */
interface RewardShippingMethodLink {
  getShippingMethodID(): string;
  hasPromotionReward(promotionReward: PromotionReward): boolean;
  getPromotionRewards(): PromotionReward[];
}

/**
 * One row of `getAmountTypeOptions()` [model/entity/PromotionReward.cfc:L120-L134] or of
 * `getApplicableTermOptions()` [model/entity/PromotionReward.cfc:L112-L118].
 *
 * A `type` alias rather than an `interface`, and that is load-bearing rather than stylistic: an
 * `interface` is NOT assignable to `Readonly<Record<string, unknown>>` (TS2322) because it carries no
 * implicit index signature, whereas a type alias IS. The same decision is recorded on
 * `ParentPriceGroupOption` in src/domain/entities/priceGroup.ts, `ParentProductTypeOption` in
 * src/domain/entities/productType.ts and `RewardMatchingTypeOption` in
 * src/domain/entities/promotionQualifier.ts.
 *
 * `name` holds a RESOURCE-BUNDLE IDENTIFIER, not a translated label. JavaRB is not ported
 * (AAP §0.5.3) and resource keys are preserved verbatim as string constants so the contract travels
 * intact to whoever owns localisation. Inventing English labels would fabricate translations the
 * legacy system resolves at runtime.
 */
type RewardSelectOption = {
  readonly name: string;
  readonly value: string;
};

/**
 * The two resolved labels `getSimpleRepresentation()` needs.
 * [model/entity/PromotionReward.cfc:L106-L108]
 *
 *   public string function getSimpleRepresentation() {
 *     return "#rbKey('entity.promotionReward')# - #getFormattedValue('rewardType')#";
 *   }
 *
 * TWO MEMBERS RATHER THAN ONE GENERIC RESOLVER, because the two halves of that string come from two
 * genuinely different framework mechanisms and collapsing them would hide that:
 *
 *   - `rbKey('entity.promotionReward')` is a direct resource lookup of a fixed key.
 *   - `getFormattedValue('rewardType')` is the `hb_formatType="rbKey"` branch of
 *     [org/Hibachi/HibachiTransient.cfc:L493-L510], which BUILDS its key from the entity name and
 *     the stored value:
 *
 *       return rbKey('entity.#replace(getEntityName(),
 *                     getApplicationValue('applicationKey'),"")#.#propertyName#.#value#');
 *
 *     With `getEntityName()` = `"SlatwallPromotionReward"` and `applicationKey` = `"Slatwall"` that
 *     resolves to `entity.PromotionReward.rewardType.<value>` - so the key is DATA-DEPENDENT and
 *     cannot be a constant. Hence a method taking the value.
 *
 * ★ AND NOTE THE CASE INCONSISTENCY IN THE SOURCE, which is preserved rather than tidied: the fixed
 * key at L107 is lower-camel `entity.promotionReward`, while the key `getFormattedValue` derives is
 * upper-camel `entity.PromotionReward.rewardType.<value>`. Both are passed through unchanged; if the
 * resource lookup is case-sensitive, one of them misses in the legacy system too.
 *
 * Declared module-local and UN-EXPORTED, per the thirteen-exported-port budget. Same treatment as
 * `PromotionQualifierLabelProvider` in src/domain/entities/promotionQualifier.ts and
 * `CurrencyValueFormatter` in src/domain/entities/priceGroupRate.ts.
 */
interface PromotionRewardLabelProvider {
  /** `rbKey('entity.promotionReward')` [model/entity/PromotionReward.cfc:L107]. */
  getPromotionRewardEntityLabel(): string;

  /**
   * The `hb_formatType="rbKey"` resolution of `rewardType`
   * [org/Hibachi/HibachiTransient.cfc:L500-L502], i.e. the label for
   * `entity.PromotionReward.rewardType.<rewardType>`.
   *
   * ★ CALLED ONLY WHEN `rewardType` IS PRESENT. The framework's own rbKey branch short-circuits on a
   * null value and returns the EMPTY STRING at [org/Hibachi/HibachiTransient.cfc:L503-L504] - and
   * critically it returns BEFORE the `hb_nullRBKey` fallback at [L513-L519] is ever reached, so the
   * `define.unlimited`-style null handling that other properties get does not apply. That
   * short-circuit is reproduced in `getSimpleRepresentation()` and is why this method never receives
   * `undefined`.
   */
  getRewardTypeLabel(rewardType: string): string;
}

/**
 * The currency half of `getAmountFormatted()`.
 * [model/entity/PromotionReward.cfc:L406] `formatValue(getAmount(), "currency")`
 *
 * `formatValue` lives on the non-ported `org/Hibachi/HibachiUtilityService.cfc` (AAP §0.6.2 lists
 * `hibachiUtilityService` among the framework artifacts deliberately not ported) and its currency
 * implementation reaches ambient request state:
 *
 *   [org/Hibachi/HibachiUtilityService.cfc:L34-L40]
 *   if(structKeyExists(arguments.formatDetails, "currencyCode")) {
 *     return LSCurrencyFormat(arguments.value, arguments.formatDetails.currencyCode,
 *                             getHibachiScope().getRBLocale());
 *   }
 *   // If no currency code was passed in then we can default to USD
 *   return LSCurrencyFormat(arguments.value, "USD", getHibachiScope().getRBLocale());
 *
 * Transformation rule T6 replaces ambient scope with an explicit dependency, so the locale becomes
 * the implementation's business and this class passes only the amount. The legacy call at L406
 * supplies NO format details, so it always took the `"USD"` default above - recorded because it is a
 * real fallback rather than an accident.
 *
 * Declared module-local and UN-EXPORTED, and deliberately shaped identically to
 * `CurrencyValueFormatter` in src/domain/entities/priceGroupRate.ts. Two structurally identical
 * module-local contracts is the correct outcome of the port budget, not duplication to be factored
 * out: hoisting them into a shared exported interface would spend one of the thirteen exported port
 * slots on a one-method formatter.
 */
interface RewardCurrencyFormatter {
  /** [org/Hibachi/HibachiUtilityService.cfc:L34-L40] `LSCurrencyFormat(value, "USD", <locale>)`. */
  formatCurrency(amount: Money): string;
}

/**
 * A single promotion reward - the "what is the discount" half of the promotion engine.
 *
 * A class rather than an interface, because the legacy entity carries behaviour and not merely data:
 * two option-list builders, thirteen bidirectional helper pairs, a custom money formatter, and a
 * two-level deletability climb.
 *
 * ASSOCIATIONS ARE MATERIALIZED AT THE REPOSITORY BOUNDARY. Hibernate lazy collections have no
 * equivalent in a driver-only stack, so every association arrives already populated and its fetch
 * shape is an explicit, documented decision at the repository method that produced it (AAP §0.3.1).
 * That is what removes the implicit N+1 the legacy graph walking created - and it matters
 * disproportionately here, since `getActivePromotionRewards()`
 * [model/dao/PromotionDAO.cfc:L51-L132] loads rewards in bulk at the top of every order recalculation
 * and the engine then reads their include/exclude collections per order item.
 *
 * EVERY MEMBER IS SYNCHRONOUS. The async boundary rule (AAP §0.4.2) is that a method becomes `async`
 * if and only if its legacy body reaches the DAO or ORM, and no body in this component does: the
 * option lists are literals, the helpers splice materialized arrays, `getAmountFormatted()` calls an
 * injected formatter, and `isDeletable()` walks materialized associations. Keeping them synchronous
 * preserves the legacy accessor shape exactly - the same reasoning applied to
 * `Sku.getPriceByCurrencyCode()`.
 *
 * ALL MONEY PASSES THROUGH `Money`. `amount` is `ormType="big_decimal"` [L61] and feeds
 * `getDiscountAmount()` [model/service/PromotionService.cfc:L987-L1018], where `precisionEvaluate`
 * guards two of the three branches. No raw floating-point operation on this value exists anywhere in
 * the target - which also closes AAP defect 12, the `amountOff` branch at
 * [model/service/PromotionService.cfc:L998] that uses raw float multiplication. That closure is one
 * of the three DOCUMENTED DELIBERATE DIVERGENCES of §0.6.7, not an accident, and it is annotated at
 * the service site rather than here. Persistence uses `Money.toDecimalString()` - never
 * `toFixed2()`, which is presentation-only and would silently truncate scale into a `big_decimal`
 * column.
 *
 * FOUR MEMBERS OF THIS CLASS CAN THROW, and each says so on itself: `getSimpleRepresentation()` (no
 * injected label provider), `getAmountFormatted()` (no amount, or no formatter on the currency
 * branch), `isDeletable()` (two unguarded association dereferences), and `removePromotionPeriod()`
 * (the framework-wide unguarded-null idiom). Every other member is total.
 */
export class PromotionReward {
  /**
   * [model/entity/PromotionReward.cfc:L60]
   * `ormtype="string" length="32" fieldtype="id" generator="uuid" unsavedvalue="" default=""`
   *
   * `unsavedvalue=""` with `default=""` is what makes an unsaved row's key the empty string, which is
   * in turn what makes `isNew()` a simple emptiness test.
   */
  private readonly promotionRewardID: string;

  /**
   * [model/entity/PromotionReward.cfc:L61] `ormType="big_decimal" hb_formatType="custom"`.
   *
   * `hb_formatType="custom"` is what routes admin rendering through `getAmountFormatted()` below
   * rather than through a generic formatter - the attribute and the method are two halves of one
   * mechanism, and both are preserved.
   *
   * NULLABLE: no `notNull="true"`. `getDiscountAmount()` dereferences it in all three of its switch
   * branches [model/service/PromotionService.cfc:L995, L998, L1001] with no guard, and
   * `getAmountFormatted()` does the same, so absence is a raise rather than a substituted zero.
   * Substituting `0` would compute a zero discount and quietly charge full price where the legacy
   * system would have failed loudly.
   */
  private readonly amount: Money | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L62] `ormType="string" hb_formatType="rbKey"`.
   *
   * The switch selector of `getDiscountAmount()` [model/service/PromotionService.cfc:L992-L1003],
   * whose three cases are `percentageOff`, `amountOff` and `amount`. Typed `string | undefined`
   * rather than a union for the same reason as `rewardType`: the column carries no constraint, and a
   * fourth value falls through the legacy switch leaving `discountAmountPreRounding` at its `0`
   * initialiser [L988] - a real, reachable behaviour that a union would make unrepresentable.
   */
  private readonly amountType: string | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L63] `ormType="string" hb_formatType="rbKey"`.
   *
   * The pass selector. See the five valid values in the module header. Also the property
   * `getSimpleRepresentationPropertyName()` names, and the branch selector of
   * `getAmountTypeOptions()`.
   */
  private readonly rewardType: string | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L64] `ormType="string" hb_formatType="rbKey"`.
   *
   * ★ NEVER READ ANYWHERE IN THE IN-SCOPE SLICE. A repository-wide grep for `getApplicableTerm()`
   * returns no hit in `model/`. It is persisted, it is offered as a three-way select by
   * `getApplicableTermOptions()`, and no engine path consults it - the same class of finding as
   * `PriceGroupRate`'s three never-consulted exclusion collections. Ported because the column exists
   * and schema continuity is binding (AAP §0.8.1); flagged so its inertness is a recorded fact
   * rather than a later surprise.
   */
  private readonly applicableTerm: string | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L65] `ormType="integer" hb_nullRBKey="define.unlimited"`.
   *
   * ★ NULL MEANS UNLIMITED, NOT ZERO - that is what `hb_nullRBKey="define.unlimited"` declares, and
   * the engine implements it by seeding the usage ledger with a sentinel and only overriding when a
   * real limit is present [model/service/PromotionService.cfc:L173-L182]:
   *
   *   promotionRewardUsageDetails[ ... ] = { usedInOrder = 0, maximumUsePerOrder = 1000000, ... };
   *   if( !isNull(reward.getMaximumUsePerOrder()) && reward.getMaximumUsePerOrder() > 0) {
   *     promotionRewardUsageDetails[ ... ].maximumUsePerOrder = reward.getMaximumUsePerOrder();
   *   }
   *
   * ★ AND A STORED `0` ALSO MEANS UNLIMITED, because of the `> 0` half of that guard - a zero fails
   * it and the 1,000,000 sentinel survives. So `null`, absent and `0` are three spellings of the same
   * outcome, and only a positive integer is a real cap. Substituting `0` for a missing value in this
   * port would therefore be harmless by luck rather than by design; substituting `1` would silently
   * cap every unlimited reward at a single use. `number | undefined` keeps the distinction visible
   * and leaves the sentinel where it belongs, in the engine.
   */
  private readonly maximumUsePerOrder: number | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L66] `ormtype="integer" hb_nullRBKey="define.unlimited"`.
   * Same null/zero/unlimited semantics as `maximumUsePerOrder`; seeded at
   * [model/service/PromotionService.cfc:L176] and overridden at [L183-L185].
   */
  private readonly maximumUsePerItem: number | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L67] `ormtype="integer" hb_nullRBKey="define.unlimited"`.
   * Same null/zero/unlimited semantics; seeded at [model/service/PromotionService.cfc:L177] and
   * overridden at [L186-L188].
   */
  private readonly maximumUsePerQualification: number | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L70]
   * `cfc="PromotionPeriod" fieldtype="many-to-one" fkcolumn="promotionPeriodID"`
   *
   * NOT `readonly`: `setPromotionPeriod()` reassigns it [L141] and `removePromotionPeriod()` deletes
   * it [L154], so the field is mutable while the collections around it are not. The 22 engine reads
   * of `reward.getPromotionPeriod()` make this the most-consulted association on the class.
   */
  private promotionPeriod: PromotionPeriod | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L71]
   * `cfc="RoundingRule" fieldtype="many-to-one" fkcolumn="roundingRuleID"
   *  hb_optionsNullRBKey="define.none"`
   *
   * ★ THE ROUNDING SWITCH OF THE DISCOUNT CALCULATION. Its presence or absence chooses between two
   * different arithmetic paths at [model/service/PromotionService.cfc:L1005-L1011]:
   *
   *   if(!isNull(reward.getRoundingRule())) {
   *     roundedFinalAmount = getRoundingRuleService().roundValueByRoundingRule(
   *       value=precisionEvaluate('originalAmount - discountAmountPreRounding'),
   *       roundingRule=reward.getRoundingRule());
   *     discountAmount = precisionEvaluate('originalAmount - roundedFinalAmount');
   *   } else {
   *     discountAmount = discountAmountPreRounding;
   *   }
   *
   * `undefined` here is therefore not a missing value to be defaulted - it IS the "no rounding"
   * instruction, and `hb_optionsNullRBKey="define.none"` says so in the source's own metadata. A
   * substituted identity rule would not be equivalent either, because
   * `RoundingRuleService.roundValue`'s default expression `"0.00"` is famously NOT a no-op: it rounds
   * 12.3456 down to 10.00 (AAP §0.6.4 finding B).
   */
  private readonly roundingRule: RoundingRule | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L74] `singularname="eligiblePriceGroup" cfc="PriceGroup"
   * type="array" linktable="SwPromoRewardEligiblePriceGrp"`
   *
   * READONLY per the census. Mutated only through `addEligiblePriceGroup`/`removeEligiblePriceGroup`,
   * which splice `variables.eligiblePriceGroups` directly.
   *
   * Read by the engine at [model/service/PromotionService.cfc:L241] through
   * `hasEligiblePriceGroup(...)` - the branch that decides whether the discount base is the order
   * item's (possibly price-group) `getPrice()` or its `getSkuPrice()` with a correction term. That is
   * the cross-service ordering dependency of AAP §0.6.1: the price-group pass must have run first.
   */
  private readonly eligiblePriceGroups: readonly PriceGroup[];

  /**
   * [model/entity/PromotionReward.cfc:L76] `singularname="fulfillmentMethod"
   * cfc="FulfillmentMethod" linktable="SwPromoRewardFulfillmentMethod"`
   *
   * READONLY. No helper pair exists to mutate it (defect D3). Read by the engine at
   * [model/service/PromotionService.cfc:L353] and [L1055], both times as
   * `!arrayLen(...) || hasFulfillmentMethod(...)` - so an EMPTY collection means "no fulfillment
   * restriction", not "no fulfillment qualifies".
   */
  private readonly fulfillmentMethods: readonly RewardFulfillmentMethodLink[];

  /**
   * [model/entity/PromotionReward.cfc:L77] `singularname="shippingAddressZone" cfc="AddressZone"
   * linktable="SwPromoRewardShipAddressZone"`
   *
   * READONLY. No helper pair exists (defect D3). Read by the engine at
   * [model/service/PromotionService.cfc:L358-L362] and [L1060-L1063], where each element is handed to
   * `isAddressInZone(...)` - the correct zone gate, in contrast with the qualifier's defective one.
   */
  private readonly shippingAddressZones: readonly RewardAddressZoneLink[];

  /**
   * [model/entity/PromotionReward.cfc:L78] `singularname="shippingMethod" cfc="ShippingMethod"
   * linktable="SwPromoRewardShippingMethod"`
   *
   * READONLY. Mutated only through this class's own `addShippingMethod`/`removeShippingMethod` - the
   * one out-of-scope association that DOES have a helper pair here. Read by the engine at
   * [model/service/PromotionService.cfc:L355] and [L1057], again as `!arrayLen(...) || has...(...)`.
   */
  private readonly shippingMethods: readonly RewardShippingMethodLink[];

  /**
   * [model/entity/PromotionReward.cfc:L80] `singularname="brand" cfc="Brand"
   * linktable="SwPromoRewardBrand"`
   *
   * READONLY. Read by the engine at [model/service/PromotionService.cfc:L977] through `hasBrand(...)`
   * - guarded by a null-brand test, since a product need not have one.
   */
  private readonly brands: readonly Brand[];

  /**
   * [model/entity/PromotionReward.cfc:L81] `singularname="option" cfc="Option"
   * linktable="SwPromoRewardOption"`
   *
   * READONLY. Read by the engine at [model/service/PromotionService.cfc:L980] through the AGGREGATE
   * probe `hasAnyOption(orderItem.getSku().getOptions())`, not through `hasOption` directly.
   */
  private readonly options: readonly Option[];

  /**
   * [model/entity/PromotionReward.cfc:L82] `singularname="sku" cfc="Sku"
   * linktable="SwPromoRewardSku"`
   *
   * READONLY. Read by the engine at [model/service/PromotionService.cfc:L974] through `hasSku(...)`.
   */
  private readonly skus: readonly Sku[];

  /**
   * [model/entity/PromotionReward.cfc:L83] `singularname="product" cfc="Product"
   * linktable="SwPromoRewardProduct"`
   *
   * READONLY. Read by the engine at [model/service/PromotionService.cfc:L971] through
   * `hasProduct(...)`.
   */
  private readonly products: readonly Product[];

  /**
   * [model/entity/PromotionReward.cfc:L84] `singularname="productType" cfc="ProductType"
   * linktable="SwPromoRewardProductType"`
   *
   * READONLY. ★ READ BY THE ENGINE WITHOUT A `has*` PROBE. `getOrderItemInReward()` at
   * [model/service/PromotionService.cfc:L957-L969] flattens this collection into a comma-list of IDs
   * and then walks the order item's `productTypeIDPath` against it with `listFindNoCase`, so that an
   * inclusion on a PARENT product type matches a CHILD product. A `hasProductType` containment test
   * would only ever match the exact node and would silently narrow which products a reward covers -
   * which is why `ProductType.productTypeIDPath` is described in productType.ts as walking straight
   * into the money path.
   */
  private readonly productTypes: readonly ProductType[];

  /**
   * [model/entity/PromotionReward.cfc:L86] `singularname="excludedBrand" cfc="Brand" type="array"
   * linktable="SwPromoRewardExclBrand"`
   *
   * READONLY. ★ READ WITH AN INVERTED-LOOKING GUARD at
   * [model/service/PromotionService.cfc:L949]:
   *
   *   ( arrayLen( reward.getExcludedBrands() )
   *     && ( isNull( ...getBrand() ) || reward.hasExcludedBrand( ...getBrand() ) ) )
   *
   * so once ANY brand exclusion exists, a product with NO brand at all is excluded too. That is not
   * a defect - it is a deliberate "if you are filtering by brand, an unbranded product cannot pass"
   * rule - but it is surprising enough to record here, because a reimplementation that only tested
   * `hasExcludedBrand` would let unbranded products through.
   */
  private readonly excludedBrands: readonly Brand[];

  /**
   * [model/entity/PromotionReward.cfc:L87] `singularname="excludedOption" cfc="Option" type="array"
   * linktable="SwPromoRewardExclOption"`
   *
   * READONLY. Read by the engine at [model/service/PromotionService.cfc:L951] through the AGGREGATE
   * probe `hasAnyExcludedOption(orderItem.getSku().getOptions())`.
   */
  private readonly excludedOptions: readonly Option[];

  /**
   * [model/entity/PromotionReward.cfc:L88] `singularname="excludedSku" cfc="Sku"
   * linktable="SwPromoRewardExclSku"`
   *
   * READONLY. Read by the engine at [model/service/PromotionService.cfc:L947] through
   * `hasExcludedSku(...)`.
   */
  private readonly excludedSkus: readonly Sku[];

  /**
   * [model/entity/PromotionReward.cfc:L89] `singularname="excludedProduct" cfc="Product"
   * linktable="SwPromoRewardExclProduct"`
   *
   * READONLY. Read by the engine at [model/service/PromotionService.cfc:L945] through
   * `hasExcludedProduct(...)`.
   */
  private readonly excludedProducts: readonly Product[];

  /**
   * [model/entity/PromotionReward.cfc:L90] `singularname="excludedProductType" cfc="ProductType"
   * linktable="SwPromoRewardExclProductType"`
   *
   * READONLY. ★ LIKE `productTypes`, READ WITHOUT A `has*` PROBE - flattened to an ID list and walked
   * against the order item's `productTypeIDPath` at [model/service/PromotionService.cfc:L928-L940],
   * so an exclusion on a parent type excludes every descendant. This is the FIRST test
   * `getOrderItemInReward()` performs, and a `break` leaves the loop on the first match.
   */
  private readonly excludedProductTypes: readonly ProductType[];

  /**
   * [model/entity/PromotionReward.cfc:L93] `ormtype="string"`.
   *
   * The remote-system correlation column. Opaque to this slice: nothing in `model/` reads it, and it
   * exists so an external system can find its own row again. Preserved as a persisted column under
   * the schema-continuity constraint.
   */
  private readonly remoteID: string | undefined;

  /** [model/entity/PromotionReward.cfc:L96] `hb_populateEnabled="false" ormtype="timestamp"`. */
  private readonly createdDateTime: Date | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L97] `cfc="Account" fieldtype="many-to-one"
   * fkcolumn="createdByAccountID"`
   *
   * REDUCED TO AN OPAQUE IDENTIFIER. `SlatwallAccount` is out of scope (AAP §0.2.2), and nothing in
   * this slice reads anything of the auditing account beyond the fact that a row records one. The
   * same reduction is applied to every audit association across the folder.
   */
  private readonly createdByAccountID: string | undefined;

  /** [model/entity/PromotionReward.cfc:L98] `hb_populateEnabled="false" ormtype="timestamp"`. */
  private readonly modifiedDateTime: Date | undefined;

  /** [model/entity/PromotionReward.cfc:L99] Opaque, as `createdByAccountID`. */
  private readonly modifiedByAccountID: string | undefined;

  /**
   * The injected label resolver for `getSimpleRepresentation()`. Optional, because the engine never
   * calls that method - only the admin display path does - and a reward hydrated for a promotion
   * recalculation has no need of a localiser.
   */
  private readonly labelProvider: PromotionRewardLabelProvider | undefined;

  /**
   * The injected currency formatter for `getAmountFormatted()`. Optional for the same reason as
   * `labelProvider`: `getAmountFormatted` exists to satisfy `hb_formatType="custom"` on the admin
   * screen, and no engine path calls it.
   */
  private readonly currencyFormatter: RewardCurrencyFormatter | undefined;

  /**
   * Construct from a repository row plus its materialized associations.
   *
   * EVERY COLLECTION IS OPTIONAL and defaults to an empty array, because that is what the CFML ORM
   * hands a freshly constructed entity and because every legacy body indexes these arrays without a
   * null check. Defaulting here rather than at each read site is what keeps `arrayLen(...)`-shaped
   * logic - and, critically, the `!arrayLen(...) ||` "no restriction" idiom the engine leans on for
   * fulfillment methods and shipping methods - a faithful `length === 0` test.
   *
   * Both injected collaborators are optional; each dependent method raises with a full explanation if
   * it is reached without the one it needs.
   */
  constructor(init: {
    readonly promotionRewardID: string;
    readonly amount?: Money | undefined;
    readonly amountType?: string | undefined;
    readonly rewardType?: string | undefined;
    readonly applicableTerm?: string | undefined;
    readonly maximumUsePerOrder?: number | undefined;
    readonly maximumUsePerItem?: number | undefined;
    readonly maximumUsePerQualification?: number | undefined;
    readonly promotionPeriod?: PromotionPeriod | undefined;
    readonly roundingRule?: RoundingRule | undefined;
    readonly eligiblePriceGroups?: readonly PriceGroup[] | undefined;
    readonly fulfillmentMethods?: readonly RewardFulfillmentMethodLink[] | undefined;
    readonly shippingAddressZones?: readonly RewardAddressZoneLink[] | undefined;
    readonly shippingMethods?: readonly RewardShippingMethodLink[] | undefined;
    readonly brands?: readonly Brand[] | undefined;
    readonly options?: readonly Option[] | undefined;
    readonly skus?: readonly Sku[] | undefined;
    readonly products?: readonly Product[] | undefined;
    readonly productTypes?: readonly ProductType[] | undefined;
    readonly excludedBrands?: readonly Brand[] | undefined;
    readonly excludedOptions?: readonly Option[] | undefined;
    readonly excludedSkus?: readonly Sku[] | undefined;
    readonly excludedProducts?: readonly Product[] | undefined;
    readonly excludedProductTypes?: readonly ProductType[] | undefined;
    readonly remoteID?: string | undefined;
    readonly createdDateTime?: Date | undefined;
    readonly createdByAccountID?: string | undefined;
    readonly modifiedDateTime?: Date | undefined;
    readonly modifiedByAccountID?: string | undefined;
    readonly labelProvider?: PromotionRewardLabelProvider | undefined;
    readonly currencyFormatter?: RewardCurrencyFormatter | undefined;
  }) {
    this.promotionRewardID = init.promotionRewardID;
    this.amount = init.amount;
    this.amountType = init.amountType;
    this.rewardType = init.rewardType;
    this.applicableTerm = init.applicableTerm;
    this.maximumUsePerOrder = init.maximumUsePerOrder;
    this.maximumUsePerItem = init.maximumUsePerItem;
    this.maximumUsePerQualification = init.maximumUsePerQualification;
    this.promotionPeriod = init.promotionPeriod;
    this.roundingRule = init.roundingRule;
    this.eligiblePriceGroups = init.eligiblePriceGroups ?? [];
    this.fulfillmentMethods = init.fulfillmentMethods ?? [];
    this.shippingAddressZones = init.shippingAddressZones ?? [];
    this.shippingMethods = init.shippingMethods ?? [];
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
    this.currencyFormatter = init.currencyFormatter;
  }

  // ============ START: Persistent Property Accessors ====================

  /** [model/entity/PromotionReward.cfc:L60] The primary key. `''` on an unsaved row. */
  getPromotionRewardID(): string {
    return this.promotionRewardID;
  }

  /** [model/entity/PromotionReward.cfc:L61] Nullable `big_decimal`. See the field doc. */
  getAmount(): Money | undefined {
    return this.amount;
  }

  /** [model/entity/PromotionReward.cfc:L62] The `getDiscountAmount()` switch selector. */
  getAmountType(): string | undefined {
    return this.amountType;
  }

  /** [model/entity/PromotionReward.cfc:L63] The engine's pass selector; five valid values. */
  getRewardType(): string | undefined {
    return this.rewardType;
  }

  /** [model/entity/PromotionReward.cfc:L64] Persisted and never read in this slice. */
  getApplicableTerm(): string | undefined {
    return this.applicableTerm;
  }

  /**
   * [model/entity/PromotionReward.cfc:L65] `undefined` and `0` both mean UNLIMITED - see the field
   * doc for the ledger seeding that implements it.
   */
  getMaximumUsePerOrder(): number | undefined {
    return this.maximumUsePerOrder;
  }

  /** [model/entity/PromotionReward.cfc:L66] Same unlimited semantics. */
  getMaximumUsePerItem(): number | undefined {
    return this.maximumUsePerItem;
  }

  /** [model/entity/PromotionReward.cfc:L67] Same unlimited semantics. */
  getMaximumUsePerQualification(): number | undefined {
    return this.maximumUsePerQualification;
  }

  /** [model/entity/PromotionReward.cfc:L93] Opaque remote correlation column. */
  getRemoteID(): string | undefined {
    return this.remoteID;
  }

  /** [model/entity/PromotionReward.cfc:L96] */
  getCreatedDateTime(): Date | undefined {
    return this.createdDateTime;
  }

  /** [model/entity/PromotionReward.cfc:L97] Opaque account identifier. */
  getCreatedByAccountID(): string | undefined {
    return this.createdByAccountID;
  }

  /** [model/entity/PromotionReward.cfc:L98] */
  getModifiedDateTime(): Date | undefined {
    return this.modifiedDateTime;
  }

  /** [model/entity/PromotionReward.cfc:L99] Opaque account identifier. */
  getModifiedByAccountID(): string | undefined {
    return this.modifiedByAccountID;
  }

  // ============  END: Persistent Property Accessors =====================

  // ============ START: Association Accessors ============================
  // ALL FOURTEEN COLLECTION ACCESSORS ARE `readonly`. See the census in the module header: zero
  // in-place mutations exist through any of them, in any file, under any receiver alias.

  /**
   * [model/entity/PromotionReward.cfc:L70] The owning period. 22 engine read sites - the
   * most-consulted association on this class.
   */
  getPromotionPeriod(): PromotionPeriod | undefined {
    return this.promotionPeriod;
  }

  /**
   * [model/entity/PromotionReward.cfc:L71] The rounding switch of the discount calculation.
   * `undefined` IS the "no rounding" instruction - see the field doc.
   */
  getRoundingRule(): RoundingRule | undefined {
    return this.roundingRule;
  }

  /** [model/entity/PromotionReward.cfc:L74] READONLY - owner side, zero census sites. */
  getEligiblePriceGroups(): readonly PriceGroup[] {
    return this.eligiblePriceGroups;
  }

  /** [model/entity/PromotionReward.cfc:L76] READONLY. Engine reads: L353, L1055. */
  getFulfillmentMethods(): readonly RewardFulfillmentMethodLink[] {
    return this.fulfillmentMethods;
  }

  /** [model/entity/PromotionReward.cfc:L77] READONLY. Engine reads: L358-L362, L1060-L1063. */
  getShippingAddressZones(): readonly RewardAddressZoneLink[] {
    return this.shippingAddressZones;
  }

  /** [model/entity/PromotionReward.cfc:L78] READONLY. Engine reads: L355, L1057. */
  getShippingMethods(): readonly RewardShippingMethodLink[] {
    return this.shippingMethods;
  }

  /** [model/entity/PromotionReward.cfc:L80] READONLY. Engine read: L977. */
  getBrands(): readonly Brand[] {
    return this.brands;
  }

  /** [model/entity/PromotionReward.cfc:L81] READONLY. Engine read: L980, via `hasAnyOption`. */
  getOptions(): readonly Option[] {
    return this.options;
  }

  /** [model/entity/PromotionReward.cfc:L82] READONLY. Engine read: L974. */
  getSkus(): readonly Sku[] {
    return this.skus;
  }

  /** [model/entity/PromotionReward.cfc:L83] READONLY. Engine read: L971. */
  getProducts(): readonly Product[] {
    return this.products;
  }

  /**
   * [model/entity/PromotionReward.cfc:L84] READONLY. Engine reads: L957, L960, L961 - flattened to an
   * ID list and walked against `productTypeIDPath`, never probed for containment.
   */
  getProductTypes(): readonly ProductType[] {
    return this.productTypes;
  }

  /** [model/entity/PromotionReward.cfc:L86] READONLY. Engine read: L949, with the unbranded rule. */
  getExcludedBrands(): readonly Brand[] {
    return this.excludedBrands;
  }

  /**
   * [model/entity/PromotionReward.cfc:L87] READONLY. Engine read: L951, via `hasAnyExcludedOption`.
   */
  getExcludedOptions(): readonly Option[] {
    return this.excludedOptions;
  }

  /** [model/entity/PromotionReward.cfc:L88] READONLY. Engine read: L947. */
  getExcludedSkus(): readonly Sku[] {
    return this.excludedSkus;
  }

  /** [model/entity/PromotionReward.cfc:L89] READONLY. Engine read: L945. */
  getExcludedProducts(): readonly Product[] {
    return this.excludedProducts;
  }

  /**
   * [model/entity/PromotionReward.cfc:L90] READONLY. Engine reads: L928, L930, L931 - flattened to an
   * ID list and walked against `productTypeIDPath`, so a parent-type exclusion excludes every
   * descendant.
   */
  getExcludedProductTypes(): readonly ProductType[] {
    return this.excludedProductTypes;
  }

  // ============  END: Association Accessors =============================

  // ============ START: Containment Probes ===============================
  // None has a hand-written legacy body: ColdFusion's ORM generates a `has<singularname>()` accessor
  // for every collection property, and the framework relies on exactly that - see the comment at
  // [org/Hibachi/HibachiEntity.cfc:L342-L343], "evaluate is used instead of invokeMethod() because
  // hasXXX() is an implicit orm function".
  //
  // FOURTEEN PLAIN PROBES ARE AUTHORED HERE, and thirteen of them have a real caller. Two AGGREGATE
  // probes follow in their own section, on a different dispatcher branch. Sixteen in total.
  //
  //   Called by this class's own helpers: `hasEligiblePriceGroup` [L159], `hasShippingMethod` [L179],
  //   `hasBrand` [L199], `hasOption` [L219], `hasSku` [L239], `hasProduct` [L259],
  //   `hasProductType` [L279], and the five `hasExcluded*` at [L299], [L319], [L339], [L359], [L379].
  //
  //   Called by the ENGINE: `hasEligiblePriceGroup` again at
  //   [model/service/PromotionService.cfc:L241]; `hasFulfillmentMethod` at [L353] and [L1055];
  //   `hasShippingMethod` again at [L355] and [L1057]; `hasExcludedProduct` at [L945];
  //   `hasExcludedSku` at [L947]; `hasExcludedBrand` at [L949]; `hasProduct` at [L971]; `hasSku` at
  //   [L974]; `hasBrand` at [L977].
  //
  //   `hasShippingAddressZone` HAS NO CALLER ANYWHERE, and unlike the identically-named member on
  //   `promotionQualifier.ts` that is NOT the consequence of a defect: the reward's zone gate is
  //   correct and simply does not need a containment test, because it evaluates each zone through
  //   `isAddressInZone` instead. Authored for surface completeness with its two siblings and recorded
  //   as unexercised, so the absence of a caller is not mistaken for an omission here.
  //
  // THE PROJECT-WIDE CONTAINMENT RULE: compare by PRIMARY KEY, with a REFERENCE fallback when the
  // candidate is unsaved. The fallback is not optional - every unsaved row's key is `''`
  // (`unsavedvalue=""`), so a pure key comparison would report two DIFFERENT unsaved rows as the same
  // one and the near-side guard would skip a legitimate append.
  //
  // THE THREE OUT-OF-SCOPE PROBES COMPARE BY PRIMARY KEY ONLY, and that is a real difference rather
  // than an inconsistency: their far sides are structural projections, so for two of them there is no
  // `isNew()` to consult at all. For `hasShippingMethod` the projection does expose enough to test
  // newness, and it does so directly - `getShippingMethodID() === ''` - rather than by asking the far
  // side, keeping the projection as narrow as the call sites require.

  /**
   * Called by this class's own `addEligiblePriceGroup`
   * [model/entity/PromotionReward.cfc:L159] AND by the ENGINE at
   * [model/service/PromotionService.cfc:L241], where it selects the discount base price.
   */
  hasEligiblePriceGroup(priceGroup: PriceGroup): boolean {
    const candidateID: string = priceGroup.getPriceGroupID();
    if (candidateID === '') {
      return this.eligiblePriceGroups.includes(priceGroup);
    }
    return this.eligiblePriceGroups.some(
      (held: PriceGroup) => held.getPriceGroupID() === candidateID,
    );
  }

  /**
   * Called by the ENGINE at [model/service/PromotionService.cfc:L353] and [L1055], in both cases as
   * the right half of `!arrayLen(reward.getFulfillmentMethods()) || reward.hasFulfillmentMethod(...)`
   * - so an empty collection short-circuits to "no restriction" before this method is reached.
   *
   * PRIMARY KEY ONLY - the far side is a one-member structural projection with no `isNew()` to
   * consult. See the section note.
   */
  hasFulfillmentMethod(fulfillmentMethod: RewardFulfillmentMethodLink): boolean {
    const candidateID: string = fulfillmentMethod.getFulfillmentMethodID();
    return this.fulfillmentMethods.some(
      (held: RewardFulfillmentMethodLink) => held.getFulfillmentMethodID() === candidateID,
    );
  }

  /**
   * NO CALLER EXISTS ANYWHERE - see the section note for why that is by design here and by defect on
   * `promotionQualifier.ts`.
   *
   * PRIMARY KEY ONLY.
   */
  hasShippingAddressZone(addressZone: RewardAddressZoneLink): boolean {
    const candidateID: string = addressZone.getAddressZoneID();
    return this.shippingAddressZones.some(
      (held: RewardAddressZoneLink) => held.getAddressZoneID() === candidateID,
    );
  }

  /**
   * Called by this class's own `addShippingMethod` [model/entity/PromotionReward.cfc:L179] AND by the
   * ENGINE at [model/service/PromotionService.cfc:L355] and [L1057].
   *
   * PRIMARY KEY, with the unsaved test taken from the key itself rather than from a far-side
   * `isNew()`. `unsavedvalue=""` makes the two equivalent; see the section note.
   */
  hasShippingMethod(shippingMethod: RewardShippingMethodLink): boolean {
    const candidateID: string = shippingMethod.getShippingMethodID();
    if (candidateID === '') {
      return this.shippingMethods.includes(shippingMethod);
    }
    return this.shippingMethods.some(
      (held: RewardShippingMethodLink) => held.getShippingMethodID() === candidateID,
    );
  }

  /**
   * Called by this class's own `addBrand` [model/entity/PromotionReward.cfc:L199] AND by the ENGINE at
   * [model/service/PromotionService.cfc:L977], guarded there by a null-brand test.
   */
  hasBrand(brand: Brand): boolean {
    const candidateID: string = brand.getBrandID();
    if (candidateID === '') {
      return this.brands.includes(brand);
    }
    return this.brands.some((held: Brand) => held.getBrandID() === candidateID);
  }

  /**
   * Called by this class's own `addExcludedBrand` [model/entity/PromotionReward.cfc:L299] AND by the
   * ENGINE at [model/service/PromotionService.cfc:L949] - where the surrounding clause also excludes
   * products that have NO brand at all, once any brand exclusion exists. See the field doc.
   */
  hasExcludedBrand(brand: Brand): boolean {
    const candidateID: string = brand.getBrandID();
    if (candidateID === '') {
      return this.excludedBrands.includes(brand);
    }
    return this.excludedBrands.some((held: Brand) => held.getBrandID() === candidateID);
  }

  /** Called by this class's own `addOption` [model/entity/PromotionReward.cfc:L219]. */
  hasOption(option: Option): boolean {
    const candidateID: string = option.getOptionID();
    if (candidateID === '') {
      return this.options.includes(option);
    }
    return this.options.some((held: Option) => held.getOptionID() === candidateID);
  }

  /** Called by this class's own `addExcludedOption` [model/entity/PromotionReward.cfc:L319]. */
  hasExcludedOption(option: Option): boolean {
    const candidateID: string = option.getOptionID();
    if (candidateID === '') {
      return this.excludedOptions.includes(option);
    }
    return this.excludedOptions.some((held: Option) => held.getOptionID() === candidateID);
  }

  /**
   * Called by this class's own `addSku` [model/entity/PromotionReward.cfc:L239] AND by the ENGINE at
   * [model/service/PromotionService.cfc:L974].
   */
  hasSku(sku: Sku): boolean {
    const candidateID: string = sku.getSkuID();
    if (candidateID === '') {
      return this.skus.includes(sku);
    }
    return this.skus.some((held: Sku) => held.getSkuID() === candidateID);
  }

  /**
   * Called by this class's own `addExcludedSku` [model/entity/PromotionReward.cfc:L339] AND by the
   * ENGINE at [model/service/PromotionService.cfc:L947].
   */
  hasExcludedSku(sku: Sku): boolean {
    const candidateID: string = sku.getSkuID();
    if (candidateID === '') {
      return this.excludedSkus.includes(sku);
    }
    return this.excludedSkus.some((held: Sku) => held.getSkuID() === candidateID);
  }

  /**
   * Called by this class's own `addProduct` [model/entity/PromotionReward.cfc:L259] AND by the ENGINE
   * at [model/service/PromotionService.cfc:L971].
   */
  hasProduct(product: Product): boolean {
    const candidateID: string = product.getProductID();
    if (candidateID === '') {
      return this.products.includes(product);
    }
    return this.products.some((held: Product) => held.getProductID() === candidateID);
  }

  /**
   * Called by this class's own `addExcludedProduct` [model/entity/PromotionReward.cfc:L359] AND by
   * the ENGINE at [model/service/PromotionService.cfc:L945].
   */
  hasExcludedProduct(product: Product): boolean {
    const candidateID: string = product.getProductID();
    if (candidateID === '') {
      return this.excludedProducts.includes(product);
    }
    return this.excludedProducts.some((held: Product) => held.getProductID() === candidateID);
  }

  /**
   * Called by this class's own `addProductType` [model/entity/PromotionReward.cfc:L279].
   *
   * ★ THE ENGINE DOES NOT USE THIS. Its product-type inclusion test flattens `getProductTypes()` to
   * an ID list and walks the order item's `productTypeIDPath`
   * [model/service/PromotionService.cfc:L957-L969], so a parent-type inclusion matches descendants.
   * Substituting this containment probe there would silently narrow coverage to exact matches.
   */
  hasProductType(productType: ProductType): boolean {
    const candidateID: string = productType.getProductTypeID();
    if (candidateID === '') {
      return this.productTypes.includes(productType);
    }
    return this.productTypes.some((held: ProductType) => held.getProductTypeID() === candidateID);
  }

  /**
   * Called by this class's own `addExcludedProductType` [model/entity/PromotionReward.cfc:L379].
   *
   * ★ THE ENGINE DOES NOT USE THIS EITHER - same ID-path walk, at
   * [model/service/PromotionService.cfc:L928-L940].
   */
  hasExcludedProductType(productType: ProductType): boolean {
    const candidateID: string = productType.getProductTypeID();
    if (candidateID === '') {
      return this.excludedProductTypes.includes(productType);
    }
    return this.excludedProductTypes.some(
      (held: ProductType) => held.getProductTypeID() === candidateID,
    );
  }

  // ============ START: Aggregate Containment Probes ======================
  //
  // TWO MORE PROBES, ON A DIFFERENT DISPATCHER BRANCH. The fourteen above are the plain
  // `has<singularname>()` accessors the ORM generates per collection. The two below are
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
  // FOUR POINTS OF FIDELITY, each read off that body rather than off what "any" ought to mean.
  //
  //   (1) THE DERIVED PROPERTY NAME IS SINGULAR. `right(name, len - 6)` strips exactly the six
  //       characters of `hasAny`, so `hasAnyOption` derives `"Option"` and `hasAnyExcludedOption`
  //       derives `"ExcludedOption"`, composing to `hasOption` and `hasExcludedOption` - the two
  //       singular probes already authored above. Both members below are therefore pure fan-outs with
  //       no matching logic of their own; reimplementing the comparison here would risk the two paths
  //       drifting apart, which is exactly the class of divergence this port exists to avoid.
  //   (2) IT SHORT-CIRCUITS ON THE FIRST HIT - `return true` is inside the loop. `some()` matches.
  //   (3) AN EMPTY ARRAY ANSWERS FALSE, not true and not a raise: the loop runs zero times and control
  //       reaches `return false`. Load-bearing at the exclusion site - a SKU with no options must NOT
  //       be excluded by an option-based exclusion.
  //   (4) `entityArray` IS DECLARED OPTIONAL IN THE FRAMEWORK (`array entityArray`, no `required`),
  //       but if it were omitted `missingMethodArguments[1]` at L521 would raise before
  //       `hasAnyInProperty` was entered. Both legacy call sites pass it, so the parameter is
  //       required here; making it optional would invent a reachable state the source does not have.
  //
  // The same two members exist on `promotionQualifier.ts` for the same reason, called from the
  // qualifier half of the same two tests.

  /**
   * Does ANY of the given options participate in this reward's `options` inclusion set?
   *
   * Called by the ENGINE at [model/service/PromotionService.cfc:L980], inside
   * `getOrderItemInReward`, as the LAST inclusion test:
   *
   *   if(arguments.reward.hasAnyOption( arguments.orderItem.getSku().getOptions() )) {
   *     return true;
   *   }
   *
   * Delegates to `hasOption` per point (1) of the section note, inheriting the
   * primary-key-with-reference-fallback rule rather than restating it.
   */
  hasAnyOption(options: readonly Option[]): boolean {
    return options.some((option: Option) => this.hasOption(option));
  }

  /**
   * Does ANY of the given options participate in this reward's `excludedOptions` set?
   *
   * Called by the ENGINE at [model/service/PromotionService.cfc:L951], as the last clause of the
   * exclusion disjunction - so a `true` here disqualifies the order item outright:
   *
   *   ( arguments.reward.hasAnyExcludedOption( arguments.orderItem.getSku().getOptions() ) )
   *
   * Delegates to `hasExcludedOption` per point (1) of the section note.
   */
  hasAnyExcludedOption(options: readonly Option[]): boolean {
    return options.some((option: Option) => this.hasExcludedOption(option));
  }

  // ============  END: Containment Probes ================================

  /**
   * Whether this instance has been persisted yet.
   *
   * [org/Hibachi/HibachiEntity.cfc:L707-L709] `isNew()` returns `getNewFlag()`, and
   * [org/Hibachi/HibachiEntity.cfc:L571-L576] `getNewFlag()` is
   * `if(getPrimaryIDValue() == "") { return true; } return false;`. With `unsavedvalue="" default=""`
   * on [model/entity/PromotionReward.cfc:L60] that reduces exactly to the test below - it is
   * literally what the framework does, not an approximation of it.
   *
   * Called by all fourteen `set`/`add` helpers in this class, always as the left half of
   * `isNew() or !<farSide>.has<This>( this )`: an unsaved reward is appended to the far side
   * unconditionally, because a key-based containment probe cannot recognise it yet.
   *
   * Of the eleven patterns the dispatcher at [org/Hibachi/HibachiEntity.cfc:L507-L565] can
   * synthesise, exactly two are concretely reached on this entity - the implicit ORM `has*` probes
   * above and the `hasAny*` branch - so there is no `hasUnique*`, no `get*Options`,
   * `get*OptionsSmartList`, `get*SmartList`, `get*Struct`, `get*Count` or `get*AssignedIDList`, and no
   * `getAttributeValue` (unreachable in any case: the L559 guard requires an `attributeValues`
   * property this entity does not declare).
   */
  isNew(): boolean {
    return this.promotionRewardID === '';
  }

  // ============ START: Pre-Banner Member ================================
  // [model/entity/PromotionReward.cfc:L106-L108] sits ABOVE the
  // `// ============ START: Non-Persistent Property Methods` banner at L110. The source's own
  // organisation is preserved rather than tidied: reordering members to make the banners line up
  // would make a reviewer's line-by-line diff against the CFC harder, which is the opposite of the
  // point. The same pre-banner situation exists in model/entity/PromotionQualifier.cfc:L101-L103 and
  // model/entity/ProductType.cfc:L92-L119.

  /**
   * The admin-facing one-line description of this reward.
   * [model/entity/PromotionReward.cfc:L106-L108]
   *
   *   public string function getSimpleRepresentation() {
   *     return "#rbKey('entity.promotionReward')# - #getFormattedValue('rewardType')#";
   *   }
   *
   * FOUR POINTS OF FIDELITY.
   *
   *   * THE SEPARATOR IS `' - '` - space, hyphen, space - and it is emitted UNCONDITIONALLY, before
   *     the second half is known to be non-empty.
   *   * ★ A NULL `rewardType` THEREFORE LEAVES A TRAILING SEPARATOR. `getFormattedValue` takes its
   *     `hb_formatType="rbKey"` branch [org/Hibachi/HibachiTransient.cfc:L500-L505], finds the value
   *     null, and returns the EMPTY STRING - and it returns there, BEFORE the `hb_nullRBKey` fallback
   *     at [L513-L519] can be consulted. So the legacy output is `"<label> - "` with a dangling
   *     separator, and that is reproduced exactly rather than trimmed. Trimming would be a cosmetic
   *     improvement to a string that may well be compared or keyed on elsewhere. The identical shape
   *     is preserved on `PromotionQualifier.getSimpleRepresentation()`.
   *   * THE TWO HALVES COME FROM TWO DIFFERENT MECHANISMS and are resolved through two separate
   *     members of the injected provider - see {@link PromotionRewardLabelProvider}, including the
   *     lower-camel/upper-camel key inconsistency in the source that is passed through unchanged.
   *   * THIS OVERRIDE COEXISTS WITH `getSimpleRepresentationPropertyName()` [L413], and the second is
   *     NOT dead code even though this override displaces the base implementation at
   *     [org/Hibachi/HibachiEntity.cfc:L59-L71]. Two further framework callers read it directly:
   *     [org/Hibachi/HibachiEntity.cfc:L390] passes it to `smartList.addSelect(..., alias="name")`,
   *     and [org/Hibachi/HibachiService.cfc:L31] passes it to
   *     `smartList.addKeywordProperty(..., weight=1)`. Both are preserved as a contract even though
   *     smart lists themselves are not ported.
   *
   * ★ RAISES RATHER THAN SUBSTITUTING when no label provider was injected. The return type is
   * `string` and has no spare value: emitting the raw resource key, or an English guess, would put a
   * plausible-looking wrong label on an administrator's screen - and this same string feeds keyword
   * search in the legacy admin. That is the dividing line recorded across this port: substitute only
   * where the return type has a spare value that already means "absent".
   *
   * @throws Error when no {@link PromotionRewardLabelProvider} was injected.
   */
  getSimpleRepresentation(): string {
    const provider: PromotionRewardLabelProvider | undefined = this.labelProvider;
    if (provider === undefined) {
      throw new Error(
        'PromotionReward.getSimpleRepresentation was called on a reward hydrated without a label ' +
          "provider. model/entity/PromotionReward.cfc:L107 composes rbKey('entity.promotionReward') " +
          "with getFormattedValue('rewardType'), both of which resolve through JavaRB - which is " +
          'not ported (AAP 0.5.3), so localisation is supplied as an explicit collaborator. No ' +
          'default is substituted: a raw resource key or an invented English label is a ' +
          'plausible-looking WRONG label on an admin screen, and this same string feeds keyword ' +
          'search through getSimpleRepresentationPropertyName().',
      );
    }

    // [L107] `#rbKey('entity.promotionReward')#` then the literal ' - ' then
    // `#getFormattedValue('rewardType')#`. The separator is unconditional.
    const entityLabel: string = provider.getPromotionRewardEntityLabel();

    // The rbKey branch of getFormattedValue returns '' for a null value
    // [org/Hibachi/HibachiTransient.cfc:L503-L504], short-circuiting before the hb_nullRBKey
    // fallback at L513-L519. Hence the empty string here rather than any "unknown type" wording.
    const rewardTypeLabel: string =
      this.rewardType === undefined ? '' : provider.getRewardTypeLabel(this.rewardType);

    return `${entityLabel} - ${rewardTypeLabel}`;
  }

  // ============ START: Non-Persistent Property Methods ==================
  // [model/entity/PromotionReward.cfc:L110] opens this block and L135 closes it.
  //
  // ★ ONE NON-PERSISTENT PROPERTY IS DECLARED AND HAS NO GETTER HERE.
  // [model/entity/PromotionReward.cfc:L104] declares `property name="rewards" type="string"
  // persistent="false"`, and a repository-wide grep for `getRewards()` outside `org/` returns ZERO
  // hits. It is vestigial metadata with no reader and no hand-written body, so no accessor is
  // authored for it - the same treatment given to `qualifierApplicationTypeOptions`
  // [model/entity/PromotionQualifier.cfc:L99], whose grep returns exactly one hit, its own
  // declaration. The two properties that DO have hand-written bodies, `amountTypeOptions` [L102] and
  // `applicableTermOptions` [L103], are ported below.

  /**
   * The three-way select backing `applicableTerm`.
   * [model/entity/PromotionReward.cfc:L112-L118]
   *
   *   return [
   *     {name=rbKey("define.both"),    value="both"},
   *     {name=rbKey("define.initial"), value="initial"},
   *     {name=rbKey("define.renewal"), value="renewal"}
   *   ];
   *
   * RETURNS A READONLY THREE-TUPLE, not an array. The count and the order become part of the type, so
   * a future edit that adds, drops or reorders a row is a compile error rather than a silent change
   * to an admin dropdown. The same convention is used for every option list in this folder.
   *
   * `name` carries the RESOURCE KEY VERBATIM. JavaRB is not ported (AAP §0.5.3), so keys travel intact
   * to whoever owns localisation. Contrast `RoundingRule.getRoundingRuleDirectionOptions()`, whose
   * three labels are hardcoded ENGLISH in the source - that port keeps English and this one keeps
   * keys, each matching its own source.
   *
   * PURE AND SYNCHRONOUS, returning a FRESH array on every call, exactly as the CFML literal was
   * re-evaluated per call. Hoisting it to module scope would create shared state on a warm Lambda
   * container for no benefit, and `readonly` on the tuple and on both keys means a caller cannot
   * mutate its own copy either.
   *
   * ★ AND NOTE that `applicableTerm` itself is never read anywhere in the in-scope slice (see the
   * field doc), so this list populates a control whose value no engine path consults.
   */
  getApplicableTermOptions(): readonly [
    RewardSelectOption,
    RewardSelectOption,
    RewardSelectOption,
  ] {
    return [
      { name: 'define.both', value: 'both' },
      { name: 'define.initial', value: 'initial' },
      { name: 'define.renewal', value: 'renewal' },
    ];
  }

  /**
   * The select backing `amountType` - TWO rows for an order-level reward, THREE otherwise.
   * [model/entity/PromotionReward.cfc:L120-L134]
   *
   *   if(getRewardType() == "order") {
   *     return [ {name=rbKey("define.percentageOff"), value="percentageOff"},
   *              {name=rbKey("define.amountOff"),     value="amountOff"} ];
   *   } else {
   *     return [ {name=rbKey("define.percentageOff"), value="percentageOff"},
   *              {name=rbKey("define.amountOff"),     value="amountOff"},
   *              {name=rbKey("define.fixedAmount"),   value="amount"} ];
   *   }
   *
   * ★ THE `amount` TYPE IS OFFERED ONLY FOR NON-ORDER REWARDS, and that is coherent with the engine:
   * `getDiscountAmount()`'s `"amount"` case computes
   * `(arguments.price - reward.getAmount()) * arguments.quantity`
   * [model/service/PromotionService.cfc:L1001], which needs a per-unit price and a quantity. An
   * order-level reward has neither, so the option is withheld rather than validated against.
   *
   * ★ DEFECT D4 IS PRESERVED IN THE THIRD ROW: the resource key says `define.fixedAmount` while the
   * stored value is `amount`. The mismatch is byte-identical to
   * [model/entity/PriceGroupRate.cfc:L91], so it is a shared copy rather than a local slip. It is NOT
   * corrected: `getDiscountAmount()`'s switch cases on the literal `"amount"`
   * [model/service/PromotionService.cfc:L1000], so renaming the value would break discount dispatch
   * and silently leave `discountAmountPreRounding` at its `0` initialiser.
   *
   * THE COMPARISON IS CASE-INSENSITIVE, because CFML `==` on strings is. A case-sensitive `===` would
   * send a stored `"Order"` down the three-row branch and offer an amount type the engine cannot
   * compute for it.
   *
   * ★ A NULL `rewardType` FALLS TO THE THREE-ROW BRANCH. In CFML the behaviour of `null == "order"`
   * is engine-dependent and the legacy runtime was never stood up (AAP §0.10.3), so rather than
   * invent a measurement this port applies ONE uniform rule everywhere: a null string operand in a
   * CFML `==` comparison is normalised to `''` and therefore does not match. The identical rule is
   * applied and documented at `PriceGroupRate.getAmountFormatted()`
   * [model/entity/PriceGroupRate.cfc:L263], so the two files agree and a reviewer sees one rule
   * rather than two conventions. Here it also happens to be the inclusive direction: the three-row
   * branch is the superset.
   *
   * The return type is a UNION OF TWO READONLY TUPLES, which makes the arity difference visible to
   * the compiler. A caller that indexes `[2]` must first narrow on `length`.
   */
  getAmountTypeOptions():
    | readonly [RewardSelectOption, RewardSelectOption]
    | readonly [RewardSelectOption, RewardSelectOption, RewardSelectOption] {
    // [L121] CFML `==` on strings is CASE-INSENSITIVE; a null operand is normalised to '' and does
    // not match. See the doc above for why that rule is uniform across this port.
    if ((this.rewardType ?? '').toLowerCase() === 'order') {
      return [
        { name: 'define.percentageOff', value: 'percentageOff' },
        { name: 'define.amountOff', value: 'amountOff' },
      ];
    }

    return [
      { name: 'define.percentageOff', value: 'percentageOff' },
      { name: 'define.amountOff', value: 'amountOff' },
      // DEFECT D4: key says fixedAmount, value says amount. Preserved - see the doc above.
      { name: 'define.fixedAmount', value: 'amount' },
    ];
  }

  // ============  END: Non-Persistent Property Methods ===================

  // ============= START: Bidirectional Helper Methods ====================
  // [model/entity/PromotionReward.cfc:L137] opens this block and L397 closes it. Fourteen members:
  // one many-to-one pair and thirteen many-to-many pairs.
  //
  // ALL THIRTEEN MANY-TO-MANY PAIRS ARE STRUCTURALLY IDENTICAL in the source, and the uniformity is
  // reproduced rather than abstracted away - a generic helper would hide which far-side accessor each
  // pair reaches, and that is precisely the detail a reviewer checks:
  //
  //   add:    if(arguments.X.isNew() or !hasX(arguments.X)) { arrayAppend(variables.Xs, arguments.X); }
  //           if(isNew() or !arguments.X.hasPromotionReward( this )) {
  //             arrayAppend(arguments.X.getPromotionRewards(), this); }
  //   remove: var thisIndex = arrayFind(variables.Xs, arguments.X);
  //           if(thisIndex > 0) { arrayDeleteAt(variables.Xs, thisIndex); }
  //           var thatIndex = arrayFind(arguments.X.getPromotionRewards(), this);
  //           if(thatIndex > 0) { arrayDeleteAt(arguments.X.getPromotionRewards(), thatIndex); }
  //
  // FOUR INVARIANTS ARE LOAD-BEARING AND ARE PRESERVED IN EVERY PAIR:
  //
  //   (1) THE TWO NEWNESS TESTS ARE DIFFERENT AND NEITHER IS REDUNDANT. The near-side guard tests the
  //       ARGUMENT's newness; the far-side guard tests `this`. An unsaved entity has key `''`, so a
  //       key-based probe cannot recognise it - hence "append unconditionally when either side is
  //       new".
  //   (2) THE TWO REMOVAL SPLICES ARE INDEPENDENTLY GUARDED. A link recorded on one side only must
  //       still be removed from that side. Combining them under one condition would leak.
  //   (3) `arrayFind` MATCHES BY REFERENCE when the needle is an object, and is 1-BASED with 0 for a
  //       miss - hence `if(thisIndex > 0)`. The port uses `indexOf` / `!== -1`, never truthiness,
  //       which would treat a legitimate index 0 as a miss. Note the deliberate asymmetry with the
  //       `has*` probes above, which match by KEY: two different legacy mechanisms
  //       (`arrayFind` identity versus Hibernate collection-contains), reproduced as two different
  //       ports and never normalised together.
  //   (4) THE ORDER OF THE FOUR STATEMENTS IN `remove*` IS PRESERVED. Near side first, then far side,
  //       each read fresh.
  //
  // BECAUSE THE FIELDS ARE `readonly` AT THE TYPE LEVEL BUT THE LEGACY SPLICES ARE IN-PLACE, each
  // helper below narrows its own storage once, locally, to a mutable alias. `readonly` here documents
  // "no consumer may mutate this"; it never claimed the owner cannot.
  //
  // ★ ANTI-CONTRACT - DEFECT D3. NO `addFulfillmentMethod`/`removeFulfillmentMethod` AND NO
  //   `addShippingAddressZone`/`removeShippingAddressZone` ARE AUTHORED, because the source declares
  //   neither, even though both collections are read by the engine. Three far-side call sites reach
  //   for them and all three miss:
  //     - [model/entity/FulfillmentMethod.cfc:L107] `promotionReward.addFulfillmentMethods( this )`
  //       - PLURAL, so it would miss even if a singular helper existed;
  //     - [model/entity/AddressZone.cfc:L102] `promotionReward.addAddressZone( this )` - a name that
  //       does not match the `shippingAddressZones` property at all;
  //     - and their `remove*` counterparts alongside.
  //   Each lands on the `onMissingMethod` throw at [org/Hibachi/HibachiEntity.cfc:L565]. AUTHORING
  //   THESE PAIRS WOULD SILENTLY REPAIR THOSE DEFECTS AND MAKE TWO PROMOTION GATES POPULATABLE FROM A
  //   DIRECTION THAT HAS NEVER POPULATED THEM - a change to which orders a reward applies to, i.e. a
  //   change to money. No stub is authored either, because every caller is out of scope. The absence
  //   is pinned by a test, exactly like the `getPromotionAccounts()` anti-contract in
  //   src/domain/entities/promotionAccount.ts.
  //
  // ★ AND ONE MORE ANTI-CONTRACT - DEFECT D2. NO `addShipppingMethod`/`removeShipppingMethod` ALIAS
  //   (three p's) IS AUTHORED, even though [model/entity/ShippingMethod.cfc:L105] and [:L108] call
  //   exactly those names. Adding the misspelling would resurrect two dead call sites in an
  //   out-of-scope entity.

  /**
   * Attach this reward to a promotion period, maintaining the inverse.
   * [model/entity/PromotionReward.cfc:L140-L145]
   *
   *   variables.promotionPeriod = arguments.promotionPeriod;
   *   if(isNew() or !arguments.promotionPeriod.hasPromotionReward( this )) {
   *     arrayAppend(arguments.promotionPeriod.getPromotionRewards(), this);
   *   }
   *
   * THE NEAR-SIDE ASSIGNMENT IS UNCONDITIONAL - there is no guard on it at all, so calling this twice
   * with two different periods simply rebinds, and only the far-side append is conditional. That
   * asymmetry is the source's, and it is reproduced.
   *
   * ★ THIS IS ONE OF THE TWO WORKING PATHS BETWEEN A PERIOD AND ITS REWARDS. `PromotionPeriod`'s own
   * `addPromotionReward`/`removePromotionReward` are throwing stubs in the port, mirroring the source
   * where they are absent entirely, so the relationship is established from THIS side. The same
   * situation holds for qualifiers, from `PromotionQualifier.setPromotionPeriod()`.
   *
   * TOTAL - never throws. The argument is `required` in the source and non-optional here.
   */
  setPromotionPeriod(promotionPeriod: PromotionPeriod): void {
    // [L141] unconditional near-side assignment.
    this.promotionPeriod = promotionPeriod;

    // [L142-L144] far side, guarded on THIS entity's newness.
    if (this.isNew() || !promotionPeriod.hasPromotionReward(this)) {
      promotionPeriod.getPromotionRewards().push(this);
    }
  }

  /**
   * Detach this reward from a promotion period.
   * [model/entity/PromotionReward.cfc:L146-L156]
   *
   *   public void function removePromotionPeriod(any promotionPeriod) {
   *     if(!structKeyExists(arguments, "promotionPeriod")) {
   *       arguments.promotionPeriod = variables.promotionPeriod;
   *     }
   *     var index = arrayFind(arguments.promotionPeriod.getPromotionRewards(),this);
   *     if(index > 0) { arrayDeleteAt(arguments.promotionPeriod.getPromotionRewards(), index); }
   *     structDelete(variables,"promotionPeriod");
   *   }
   *
   * THREE POINTS OF FIDELITY.
   *
   *   * THE ARGUMENT IS OPTIONAL - note `any promotionPeriod`, with no `required` - and when omitted
   *     it defaults to the currently-held period. That is the framework-wide "remove me from whatever
   *     I am attached to" idiom, and it is why the parameter is optional here too.
   *   * ★ IT RAISES WHEN OMITTED ON AN UNATTACHED REWARD, and that is the source's behaviour rather
   *     than an addition: `variables.promotionPeriod` is undefined, so `arguments.promotionPeriod`
   *     becomes undefined and `arrayFind(undefined.getPromotionRewards(), this)` fails. This is the
   *     unguarded-null idiom that appears in every `remove<ManyToOne>` across the folder, and it is
   *     preserved rather than softened to a silent no-op: a caller who detaches nothing while
   *     believing it detached something has a bug the legacy system reported loudly.
   *   * THE NEAR-SIDE CLEAR HAPPENS LAST AND UNCONDITIONALLY, after the far-side splice, exactly as
   *     `structDelete` sits at L155 below the `if`. It runs even when the far-side index missed.
   *
   * @throws Error when called with no argument on a reward that holds no period.
   */
  removePromotionPeriod(promotionPeriod?: PromotionPeriod): void {
    // [L147-L149] default the argument from current state.
    const target: PromotionPeriod | undefined = promotionPeriod ?? this.promotionPeriod;

    if (target === undefined) {
      throw new Error(
        'PromotionReward.removePromotionPeriod was called with no argument on a reward that holds ' +
          'no promotion period. model/entity/PromotionReward.cfc:L147-L149 defaults the argument ' +
          'from variables.promotionPeriod, and L150 then dereferences it with no guard - CFML ' +
          'raises there too. Preserved rather than softened to a no-op: silently detaching nothing ' +
          'hides the caller bug the legacy system reported.',
      );
    }

    // [L150-L153] far side, spliced by REFERENCE. arrayFind is 1-based with 0 for a miss; indexOf is
    // 0-based with -1, hence the explicit `!== -1` rather than any truthiness test.
    const farSide: PromotionReward[] = target.getPromotionRewards();
    const index: number = farSide.indexOf(this);
    if (index !== -1) {
      farSide.splice(index, 1);
    }

    // [L155] `structDelete(variables,"promotionPeriod")` - last, and unconditional.
    this.promotionPeriod = undefined;
  }

  /**
   * Add an eligible price group. [model/entity/PromotionReward.cfc:L158-L165]
   *
   * The far side is `priceGroup.getPromotionRewards()`, which is LIVE on
   * src/domain/entities/priceGroup.ts for exactly this append
   * [model/entity/PriceGroup.cfc:L61 property, mutated from here at L163].
   *
   * TOTAL - never throws.
   */
  addEligiblePriceGroup(priceGroup: PriceGroup): void {
    // [L159-L161] near side, guarded on the ARGUMENT's newness.
    if (priceGroup.isNew() || !this.hasEligiblePriceGroup(priceGroup)) {
      (this.eligiblePriceGroups as PriceGroup[]).push(priceGroup);
    }
    // [L162-L164] far side, guarded on THIS entity's newness.
    if (this.isNew() || !priceGroup.hasPromotionReward(this)) {
      priceGroup.getPromotionRewards().push(this);
    }
  }

  /**
   * Remove an eligible price group. [model/entity/PromotionReward.cfc:L166-L175]
   *
   * Two independently-guarded reference splices - invariant (2) of the section note.
   *
   * TOTAL - never throws. The argument is `required` in the source.
   */
  removeEligiblePriceGroup(priceGroup: PriceGroup): void {
    const near: PriceGroup[] = this.eligiblePriceGroups as PriceGroup[];
    const thisIndex: number = near.indexOf(priceGroup);
    if (thisIndex !== -1) {
      near.splice(thisIndex, 1);
    }
    const far: PromotionReward[] = priceGroup.getPromotionRewards();
    const thatIndex: number = far.indexOf(this);
    if (thatIndex !== -1) {
      far.splice(thatIndex, 1);
    }
  }

  /**
   * Add a shipping method. [model/entity/PromotionReward.cfc:L178-L195]
   *
   * ★ THE ONLY OUT-OF-SCOPE ASSOCIATION ON THIS CLASS WITH A HELPER PAIR - contrast
   * `fulfillmentMethods` and `shippingAddressZones`, which have none (defect D3). The reverse
   * direction is nonetheless dead, because [model/entity/ShippingMethod.cfc:L105] misspells the call
   * with three p's (defect D2).
   *
   * The near-side newness test reads the projection's key directly rather than calling a far-side
   * `isNew()`; `unsavedvalue=""` makes those equivalent and keeps the projection narrow.
   *
   * TOTAL - never throws.
   */
  addShippingMethod(shippingMethod: RewardShippingMethodLink): void {
    // [L179-L181] `arguments.shippingMethod.isNew()` reproduced as the empty-key test.
    if (shippingMethod.getShippingMethodID() === '' || !this.hasShippingMethod(shippingMethod)) {
      (this.shippingMethods as RewardShippingMethodLink[]).push(shippingMethod);
    }
    // [L182-L184]
    if (this.isNew() || !shippingMethod.hasPromotionReward(this)) {
      shippingMethod.getPromotionRewards().push(this);
    }
  }

  /**
   * Remove a shipping method. [model/entity/PromotionReward.cfc:L186-L195]
   *
   * TOTAL - never throws.
   */
  removeShippingMethod(shippingMethod: RewardShippingMethodLink): void {
    const near: RewardShippingMethodLink[] = this.shippingMethods as RewardShippingMethodLink[];
    const thisIndex: number = near.indexOf(shippingMethod);
    if (thisIndex !== -1) {
      near.splice(thisIndex, 1);
    }
    const far: PromotionReward[] = shippingMethod.getPromotionRewards();
    const thatIndex: number = far.indexOf(this);
    if (thatIndex !== -1) {
      far.splice(thatIndex, 1);
    }
  }

  /**
   * Add an included brand. [model/entity/PromotionReward.cfc:L198-L205]
   * Far side: `brand.getPromotionRewards()`, LIVE on src/domain/entities/brand.ts.
   *
   * TOTAL - never throws.
   */
  addBrand(brand: Brand): void {
    if (brand.isNew() || !this.hasBrand(brand)) {
      (this.brands as Brand[]).push(brand);
    }
    if (this.isNew() || !brand.hasPromotionReward(this)) {
      brand.getPromotionRewards().push(this);
    }
  }

  /**
   * Remove an included brand. [model/entity/PromotionReward.cfc:L206-L215]
   *
   * TOTAL - never throws.
   */
  removeBrand(brand: Brand): void {
    const near: Brand[] = this.brands as Brand[];
    const thisIndex: number = near.indexOf(brand);
    if (thisIndex !== -1) {
      near.splice(thisIndex, 1);
    }
    const far: PromotionReward[] = brand.getPromotionRewards();
    const thatIndex: number = far.indexOf(this);
    if (thatIndex !== -1) {
      far.splice(thatIndex, 1);
    }
  }

  /**
   * Add an included option. [model/entity/PromotionReward.cfc:L218-L225]
   * Far side: `option.getPromotionRewards()`, LIVE on src/domain/entities/option.ts.
   *
   * TOTAL - never throws.
   */
  addOption(option: Option): void {
    if (option.isNew() || !this.hasOption(option)) {
      (this.options as Option[]).push(option);
    }
    if (this.isNew() || !option.hasPromotionReward(this)) {
      option.getPromotionRewards().push(this);
    }
  }

  /**
   * Remove an included option. [model/entity/PromotionReward.cfc:L226-L235]
   *
   * TOTAL - never throws.
   */
  removeOption(option: Option): void {
    const near: Option[] = this.options as Option[];
    const thisIndex: number = near.indexOf(option);
    if (thisIndex !== -1) {
      near.splice(thisIndex, 1);
    }
    const far: PromotionReward[] = option.getPromotionRewards();
    const thatIndex: number = far.indexOf(this);
    if (thatIndex !== -1) {
      far.splice(thatIndex, 1);
    }
  }

  /**
   * Add an included SKU. [model/entity/PromotionReward.cfc:L238-L245]
   * Far side: `sku.getPromotionRewards()` - LIVE, and part of the canonical far-side contract
   * src/domain/entities/sku.ts must honour.
   *
   * TOTAL - never throws.
   */
  addSku(sku: Sku): void {
    if (sku.isNew() || !this.hasSku(sku)) {
      (this.skus as Sku[]).push(sku);
    }
    if (this.isNew() || !sku.hasPromotionReward(this)) {
      sku.getPromotionRewards().push(this);
    }
  }

  /**
   * Remove an included SKU. [model/entity/PromotionReward.cfc:L246-L255]
   *
   * TOTAL - never throws.
   */
  removeSku(sku: Sku): void {
    const near: Sku[] = this.skus as Sku[];
    const thisIndex: number = near.indexOf(sku);
    if (thisIndex !== -1) {
      near.splice(thisIndex, 1);
    }
    const far: PromotionReward[] = sku.getPromotionRewards();
    const thatIndex: number = far.indexOf(this);
    if (thatIndex !== -1) {
      far.splice(thatIndex, 1);
    }
  }

  /**
   * Add an included product. [model/entity/PromotionReward.cfc:L258-L265]
   * Far side: `product.getPromotionRewards()` - LIVE, part of the contract
   * src/domain/entities/product.ts must honour.
   *
   * TOTAL - never throws.
   */
  addProduct(product: Product): void {
    if (product.isNew() || !this.hasProduct(product)) {
      (this.products as Product[]).push(product);
    }
    if (this.isNew() || !product.hasPromotionReward(this)) {
      product.getPromotionRewards().push(this);
    }
  }

  /**
   * Remove an included product. [model/entity/PromotionReward.cfc:L266-L275]
   *
   * TOTAL - never throws.
   */
  removeProduct(product: Product): void {
    const near: Product[] = this.products as Product[];
    const thisIndex: number = near.indexOf(product);
    if (thisIndex !== -1) {
      near.splice(thisIndex, 1);
    }
    const far: PromotionReward[] = product.getPromotionRewards();
    const thatIndex: number = far.indexOf(this);
    if (thatIndex !== -1) {
      far.splice(thatIndex, 1);
    }
  }

  /**
   * Add an included product type. [model/entity/PromotionReward.cfc:L278-L285]
   * Far side: `productType.getPromotionRewards()`, LIVE on src/domain/entities/productType.ts.
   *
   * TOTAL - never throws.
   */
  addProductType(productType: ProductType): void {
    if (productType.isNew() || !this.hasProductType(productType)) {
      (this.productTypes as ProductType[]).push(productType);
    }
    if (this.isNew() || !productType.hasPromotionReward(this)) {
      productType.getPromotionRewards().push(this);
    }
  }

  /**
   * Remove an included product type. [model/entity/PromotionReward.cfc:L286-L295]
   *
   * TOTAL - never throws.
   */
  removeProductType(productType: ProductType): void {
    const near: ProductType[] = this.productTypes as ProductType[];
    const thisIndex: number = near.indexOf(productType);
    if (thisIndex !== -1) {
      near.splice(thisIndex, 1);
    }
    const far: PromotionReward[] = productType.getPromotionRewards();
    const thatIndex: number = far.indexOf(this);
    if (thatIndex !== -1) {
      far.splice(thatIndex, 1);
    }
  }

  /**
   * Add an excluded brand. [model/entity/PromotionReward.cfc:L298-L305]
   *
   * ★ NOTE THE FAR-SIDE ACCESSOR CHANGES for every `Excluded*` pair: it is
   * `getPromotionRewardExclusions()`, not `getPromotionRewards()`, and the probe is
   * `hasPromotionRewardExclusion`. The two roles are stored in two different link tables
   * (`SwPromoRewardBrand` versus `SwPromoRewardExclBrand`) and are two independent relationships, so
   * crossing them would silently turn an inclusion into an exclusion.
   *
   * ★ AND NOTE THE ARGUMENT NAME: the source calls it `brand`, not `excludedBrand`
   * [model/entity/PromotionReward.cfc:L298]. Contrast `addEligiblePriceGroup`, whose argument IS
   * named for its role. Reproduced as the source has it.
   *
   * TOTAL - never throws.
   */
  addExcludedBrand(brand: Brand): void {
    if (brand.isNew() || !this.hasExcludedBrand(brand)) {
      (this.excludedBrands as Brand[]).push(brand);
    }
    if (this.isNew() || !brand.hasPromotionRewardExclusion(this)) {
      brand.getPromotionRewardExclusions().push(this);
    }
  }

  /**
   * Remove an excluded brand. [model/entity/PromotionReward.cfc:L306-L315]
   *
   * TOTAL - never throws.
   */
  removeExcludedBrand(brand: Brand): void {
    const near: Brand[] = this.excludedBrands as Brand[];
    const thisIndex: number = near.indexOf(brand);
    if (thisIndex !== -1) {
      near.splice(thisIndex, 1);
    }
    const far: PromotionReward[] = brand.getPromotionRewardExclusions();
    const thatIndex: number = far.indexOf(this);
    if (thatIndex !== -1) {
      far.splice(thatIndex, 1);
    }
  }

  /**
   * Add an excluded option. [model/entity/PromotionReward.cfc:L318-L325]
   *
   * TOTAL - never throws.
   */
  addExcludedOption(option: Option): void {
    if (option.isNew() || !this.hasExcludedOption(option)) {
      (this.excludedOptions as Option[]).push(option);
    }
    if (this.isNew() || !option.hasPromotionRewardExclusion(this)) {
      option.getPromotionRewardExclusions().push(this);
    }
  }

  /**
   * Remove an excluded option. [model/entity/PromotionReward.cfc:L326-L335]
   *
   * TOTAL - never throws.
   */
  removeExcludedOption(option: Option): void {
    const near: Option[] = this.excludedOptions as Option[];
    const thisIndex: number = near.indexOf(option);
    if (thisIndex !== -1) {
      near.splice(thisIndex, 1);
    }
    const far: PromotionReward[] = option.getPromotionRewardExclusions();
    const thatIndex: number = far.indexOf(this);
    if (thatIndex !== -1) {
      far.splice(thatIndex, 1);
    }
  }

  /**
   * Add an excluded SKU. [model/entity/PromotionReward.cfc:L338-L345]
   *
   * TOTAL - never throws.
   */
  addExcludedSku(sku: Sku): void {
    if (sku.isNew() || !this.hasExcludedSku(sku)) {
      (this.excludedSkus as Sku[]).push(sku);
    }
    if (this.isNew() || !sku.hasPromotionRewardExclusion(this)) {
      sku.getPromotionRewardExclusions().push(this);
    }
  }

  /**
   * Remove an excluded SKU. [model/entity/PromotionReward.cfc:L346-L355]
   *
   * TOTAL - never throws.
   */
  removeExcludedSku(sku: Sku): void {
    const near: Sku[] = this.excludedSkus as Sku[];
    const thisIndex: number = near.indexOf(sku);
    if (thisIndex !== -1) {
      near.splice(thisIndex, 1);
    }
    const far: PromotionReward[] = sku.getPromotionRewardExclusions();
    const thatIndex: number = far.indexOf(this);
    if (thatIndex !== -1) {
      far.splice(thatIndex, 1);
    }
  }

  /**
   * Add an excluded product. [model/entity/PromotionReward.cfc:L358-L365]
   *
   * TOTAL - never throws.
   */
  addExcludedProduct(product: Product): void {
    if (product.isNew() || !this.hasExcludedProduct(product)) {
      (this.excludedProducts as Product[]).push(product);
    }
    if (this.isNew() || !product.hasPromotionRewardExclusion(this)) {
      product.getPromotionRewardExclusions().push(this);
    }
  }

  /**
   * Remove an excluded product. [model/entity/PromotionReward.cfc:L366-L375]
   *
   * TOTAL - never throws.
   */
  removeExcludedProduct(product: Product): void {
    const near: Product[] = this.excludedProducts as Product[];
    const thisIndex: number = near.indexOf(product);
    if (thisIndex !== -1) {
      near.splice(thisIndex, 1);
    }
    const far: PromotionReward[] = product.getPromotionRewardExclusions();
    const thatIndex: number = far.indexOf(this);
    if (thatIndex !== -1) {
      far.splice(thatIndex, 1);
    }
  }

  /**
   * Add an excluded product type. [model/entity/PromotionReward.cfc:L378-L385]
   *
   * TOTAL - never throws.
   */
  addExcludedProductType(productType: ProductType): void {
    if (productType.isNew() || !this.hasExcludedProductType(productType)) {
      (this.excludedProductTypes as ProductType[]).push(productType);
    }
    if (this.isNew() || !productType.hasPromotionRewardExclusion(this)) {
      productType.getPromotionRewardExclusions().push(this);
    }
  }

  /**
   * Remove an excluded product type. [model/entity/PromotionReward.cfc:L386-L395]
   *
   * TOTAL - never throws.
   */
  removeExcludedProductType(productType: ProductType): void {
    const near: ProductType[] = this.excludedProductTypes as ProductType[];
    const thisIndex: number = near.indexOf(productType);
    if (thisIndex !== -1) {
      near.splice(thisIndex, 1);
    }
    const far: PromotionReward[] = productType.getPromotionRewardExclusions();
    const thatIndex: number = far.indexOf(this);
    if (thatIndex !== -1) {
      far.splice(thatIndex, 1);
    }
  }

  // =============  END:  Bidirectional Helper Methods ====================

  // =============== START: Custom Formatting Methods =====================
  // [model/entity/PromotionReward.cfc:L399] opens this block and L409 closes it.

  /**
   * The admin display form of `amount`.
   * [model/entity/PromotionReward.cfc:L401-L407]
   *
   *   if(getAmountType() == "percentageOff") {
   *     return formatValue(getAmount(), "percentage");
   *   }
   *   return formatValue(getAmount(), "currency");
   *
   * THIS METHOD IS WHAT `hb_formatType="custom"` ON [L61] ROUTES TO, through the `custom` branch of
   * [org/Hibachi/HibachiTransient.cfc:L497-L499] which delegates to `get<Property>Formatted`. The
   * attribute and the method are two halves of one mechanism and both are preserved.
   *
   * FOUR POINTS OF FIDELITY.
   *
   *   * THE PERCENTAGE BRANCH IS `value & "%"`, EXACTLY. `formatValue` dispatches on a whitelist
   *     [org/Hibachi/HibachiUtilityService.cfc:L7-L12] that contains `percentage`, and
   *     `formatValue_percentage` [org/Hibachi/HibachiUtilityService.cfc:L62-L64] is a one-liner:
   *     `return arguments.value & "%";`. So this is byte-identical to
   *     `PriceGroupRate.getAmountFormatted()`'s hand-written `getAmount() & "%"`
   *     [model/entity/PriceGroupRate.cfc:L264] - one routes through the dispatcher and one does not,
   *     and the output is the same. Recorded because the two source spellings invite the assumption
   *     that they differ.
   *   * ★ THAT CONCATENATION IS CFML NUMERIC STRINGIFICATION, WHICH DROPS TRAILING ZEROS: a stored
   *     `10.50` renders `"10.5%"`, NOT `"10.50%"`. `Money.toDecimalString()` reproduces that exactly -
   *     every significant digit, no imposed scale, canonicalised. `toFixed2()` would emit `"10.50%"`
   *     and be wrong; it is presentation-only for two-decimal money and documents itself as such.
   *     This is the same trap recorded on `PriceGroupRate.getAmountFormatted()`.
   *   * THE COMPARISON IS CASE-INSENSITIVE, because CFML `==` on strings is. A case-sensitive `===`
   *     would send `"PercentageOff"` down the currency branch and format a percentage as money.
   *   * THE CURRENCY BRANCH GOES THROUGH AN INJECTED PORT - see
   *     {@link RewardCurrencyFormatter} for the ambient-scope reasoning and the `"USD"` default the
   *     legacy call always took.
   *
   * ★ RAISES RATHER THAN SUBSTITUTING, on both missing inputs, and note that the source raises on
   * BOTH branches too: `formatValue` declares `required string value`
   * [org/Hibachi/HibachiUtilityService.cfc:L7], so passing a null `getAmount()` fails argument
   * validation before either formatter is entered. The return type is `string` and has no spare
   * value: every candidate default - `""`, `"0%"`, a zero currency string - is a well-formed WRONG
   * price on an administrator's screen, which is strictly worse than a loud failure. That is the
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
        'PromotionReward.getAmountFormatted has no amount to format. ' +
          'model/entity/PromotionReward.cfc:L61 declares amount without notNull, so the column is ' +
          'nullable, and L402/L406 hand it to formatValue - which declares `required string value` ' +
          'at org/Hibachi/HibachiUtilityService.cfc:L7 and therefore raises on a null in CFML too. ' +
          'No default is substituted: every candidate ("", "0%", a zero currency string) is a ' +
          'well-formed but WRONG price on an admin screen.',
      );
    }

    // [L402] CFML `==` on strings is CASE-INSENSITIVE; a null operand normalises to '' and does not
    // match, per the uniform rule documented on getAmountTypeOptions().
    if ((this.amountType ?? '').toLowerCase() === 'percentageoff') {
      // [L403] `formatValue(getAmount(), "percentage")` resolves to
      // `arguments.value & "%"` [org/Hibachi/HibachiUtilityService.cfc:L63]. CFML numeric
      // stringification drops trailing zeros, which toDecimalString() reproduces. NOT toFixed2().
      return `${amount.toDecimalString()}%`;
    }

    // [L406] `formatValue(getAmount(), "currency")`.
    const formatter: RewardCurrencyFormatter | undefined = this.currencyFormatter;
    if (formatter === undefined) {
      throw new Error(
        'PromotionReward.getAmountFormatted reached its currency branch on a reward hydrated ' +
          'without a currency formatter. model/entity/PromotionReward.cfc:L406 calls ' +
          'formatValue(getAmount(),"currency"), which lives on the non-ported ' +
          'org/Hibachi/HibachiUtilityService.cfc and reaches getHibachiScope().getRBLocale() for ' +
          'its locale - ambient request state replaced by an explicit dependency under ' +
          'transformation rule T6. The legacy call supplies no format details and therefore always ' +
          'took the "USD" default at org/Hibachi/HibachiUtilityService.cfc:L38-L39.',
      );
    }

    return formatter.formatCurrency(amount);
  }

  // ===============  END: Custom Formatting Methods ======================

  // ================== START: Overridden Methods =========================
  // [model/entity/PromotionReward.cfc:L411] opens this block and L421 closes it.

  /**
   * Which property the framework uses to label this entity generically.
   * [model/entity/PromotionReward.cfc:L413-L415] `return "rewardType";`
   *
   * ★ THIS IS NOT DEAD CODE, even though `getSimpleRepresentation()` above overrides the base
   * implementation that would otherwise be this method's only consumer. Three consumers exist and two
   * of them survive the override:
   *
   *   1. [org/Hibachi/HibachiEntity.cfc:L59-L71] - the base `getSimpleRepresentation()`, which calls
   *      `this.invokeMethod("get#getSimpleRepresentationPropertyName()#")`. DISPLACED here.
   *   2. [org/Hibachi/HibachiEntity.cfc:L390] - `getPropertyOptions`, which does
   *      `smartList.addSelect(propertyIdentifier=exampleEntity.getSimpleRepresentationPropertyName(),
   *      alias="name")`. NOT displaced.
   *   3. [org/Hibachi/HibachiService.cfc:L31] - `smartList.addKeywordProperty(
   *      propertyIdentifier=example.getSimpleRepresentationPropertyName(), weight=1)`. NOT displaced.
   *
   * So the string below still determines which column a generic option list selects and which column
   * keyword search weights, in both cases for THIS entity. Smart lists themselves are not ported
   * (AAP §0.6.2), but the method is a contract two framework call sites read, so it is preserved.
   *
   * NOTE THE CASING: plain lower-camel `"rewardType"`, matching the property name at [L63].
   * Contrast `PriceGroupRate.getSimpleRepresentationPropertyName()`, which returns `"DisplayName"`
   * with a CAPITAL D [model/entity/PriceGroupRate.cfc:L271] - the framework composes
   * `"get" & <this string>` so both work, and each is reproduced exactly as its own source spells it.
   *
   * TOTAL - never throws. A constant.
   */
  getSimpleRepresentationPropertyName(): string {
    return 'rewardType';
  }

  /**
   * Whether this reward may be deleted.
   * [model/entity/PromotionReward.cfc:L417-L419]
   *
   *   return !getPromotionPeriod().isExpired() && getPromotionPeriod().getPromotion().isDeletable();
   *
   * THREE POINTS OF FIDELITY.
   *
   *   * ★ THE `&&` SHORT-CIRCUIT IS LOAD-BEARING AND IS WRITTEN AS TWO STATEMENTS SO IT CANNOT BE
   *     ACCIDENTALLY LOST. An EXPIRED period answers `false` WITHOUT ever touching
   *     `getPromotion()` - so a reward whose period is expired is undeletable even if its promotion
   *     association was never materialized. Collapsing this into a single expression that
   *     dereferences both sides first would turn that safe path into a raise.
   *   * BOTH DEREFERENCES ARE UNGUARDED IN THE SOURCE. `getPromotionPeriod()` is nullable (no
   *     `notNull="true"` at [L70]) and `getPromotion()` on the period is too, so CFML raises on
   *     either absence. Preserved as two raises with distinct messages rather than softened to a
   *     `false`: answering "not deletable" for a reward whose graph was under-fetched would hide a
   *     hydration bug behind a plausible answer.
   *   * THE CLIMB IS TWO LEVELS AND ENDS AT `Promotion.isDeletable()`
   *     [model/entity/Promotion.cfc:L170], so deletability is ultimately a property of the promotion,
   *     not of the reward. Identical in shape to `PromotionQualifier.isDeletable()`
   *     [model/entity/PromotionQualifier.cfc:L359].
   *
   * @throws Error when the promotion period is not materialized, or when its promotion is not.
   */
  isDeletable(): boolean {
    const period: PromotionPeriod | undefined = this.promotionPeriod;
    if (period === undefined) {
      throw new Error(
        'PromotionReward.isDeletable requires a materialized promotion period. ' +
          'model/entity/PromotionReward.cfc:L418 calls getPromotionPeriod().isExpired() with no ' +
          'guard, and L70 declares the association without notNull, so CFML raises here too. Not ' +
          'softened to `false`: reporting "not deletable" for an under-fetched reward would hide a ' +
          'hydration bug behind a plausible answer.',
      );
    }

    // [L418] FIRST HALF OF THE `&&`. An expired period answers false WITHOUT reaching getPromotion().
    // Written as an early return so the short-circuit survives any later edit.
    if (period.isExpired()) {
      return false;
    }

    const promotion = period.getPromotion();
    if (promotion === undefined) {
      throw new Error(
        'PromotionReward.isDeletable reached its second clause with an unmaterialized promotion. ' +
          'model/entity/PromotionReward.cfc:L418 calls getPromotionPeriod().getPromotion()' +
          '.isDeletable() with no guard, so CFML raises here too. Note that this state is only ' +
          'reachable for a NON-expired period: an expired one returns false above, exactly as the ' +
          'CFML `&&` short-circuit does.',
      );
    }

    // [L418] SECOND HALF OF THE `&&`.
    return promotion.isDeletable();
  }

  // ==================  END:  Overridden Methods =========================

  // =================== START: ORM Event Hooks  ==========================
  //
  // ★ THE SOURCE'S HOOK BANNER IS EMPTY - [model/entity/PromotionReward.cfc:L423] opens it and L425
  // closes it with nothing between. NO `preInsert` AND NO `preUpdate` ARE AUTHORED HERE, and the
  // empty banner is recorded rather than omitted so a reader can see the absence was verified against
  // the source rather than overlooked.
  //
  // Three entities in this folder DO carry lifecycle hooks - `Category`, `PriceGroup` and
  // `ProductType` - and every one of them has a concrete reason: a materialized ID path to maintain.
  // This entity has no such derived column, so it needs no hook. The same empty banner appears at
  // [model/entity/PriceGroupRate.cfc:L280-L282] and
  // [model/entity/PromotionQualifier.cfc:L341-L351].
  //
  // ===================  END:  ORM Event Hooks  ==========================
}

// ---------------------------------------------------------------------------
// WHAT THE TEST TIER MUST PIN FOR THIS MODULE (all NET-NEW - `PromotionReward` has no legacy test)
//
//   1. Construction from a bare row: every collection defaults to EMPTY, `amount` and both injected
//      collaborators default to `undefined`, and `getPromotionRewardID()` round-trips.
//   2. ★ ALL THREE `maximumUse*` ACCESSORS RETURN `undefined` WHEN ABSENT, never `0` and never a
//      sentinel. `hb_nullRBKey="define.unlimited"` [L65-L67] makes absence mean UNLIMITED, and the
//      1,000,000 sentinel belongs to the engine's ledger [model/service/PromotionService.cfc:L174-L177],
//      not to this class. A test that accepts `0` here would let a future edit move the sentinel into
//      the entity and change every unlimited reward.
//   3. ★ `getAmount()` RETURNS `undefined` FOR A NULL COLUMN, never `Money(0)`. A zero amount computes
//      a zero discount and charges full price silently; the legacy system raises.
//   4. `getRoundingRule()` returns `undefined` when absent, and a test names WHY: `undefined` IS the
//      "no rounding" instruction at [model/service/PromotionService.cfc:L1005-L1011], not a missing
//      value. Assert that no identity rule is substituted.
//   5. All sixteen association accessors are typed `readonly`; assert that the fourteen collection
//      returns are not the private arrays by attempting a mutation through the accessor at the type
//      level (a `@ts-expect-error`-free compile-time check belongs in the type-test tier; at runtime,
//      assert the accessor result is reference-equal to the stored array, which it is - the guarantee
//      is `readonly`, not a copy).
//   6. ★ ALL THIRTEEN `add*` HELPERS APPEND TO BOTH SIDES, and each is checked against the CORRECT far
//      side: the five `Excluded*` pairs must touch `get<X>PromotionRewardExclusions()` and NEVER
//      `getPromotionRewards()`. Crossing them would turn an inclusion into an exclusion.
//   7. Every `add*` is IDEMPOTENT for a SAVED argument already present, on both sides.
//   8. ★ Every `add*` APPENDS UNCONDITIONALLY for an UNSAVED argument (key `''`), even when an
//      identical-key element is already held - because a key-based probe cannot distinguish two
//      unsaved rows. Two distinct unsaved brands must both land.
//   9. ★ Every `remove*` SPLICES BY REFERENCE, not by key: a DIFFERENT object with the SAME primary
//      key must NOT be removed. This is the `arrayFind` identity semantics of invariant (3), and it is
//      deliberately different from the `has*` probes.
//  10. Every `remove*` guards its two splices INDEPENDENTLY: a link recorded on the far side only is
//      still removed from that side, and vice versa.
//  11. `setPromotionPeriod` REBINDS UNCONDITIONALLY - call it twice with two periods and assert the
//      near side holds the second while both far sides recorded their append.
//  12. ★ `removePromotionPeriod()` WITH NO ARGUMENT RAISES on a reward holding no period, and CLEARS
//      the near side unconditionally when it does hold one - even when the far-side index missed.
//  13. ★ `getSimpleRepresentation()` EMITS A TRAILING `' - '` WHEN `rewardType` IS NULL. Assert the
//      dangling separator POSITIVELY, with the expected string written out in full, so a future
//      "tidy-up" that trims it fails. This is the `getFormattedValue` rbKey short-circuit at
//      [org/Hibachi/HibachiTransient.cfc:L503-L504] returning `''` BEFORE the `hb_nullRBKey` fallback.
//  14. `getSimpleRepresentation()` RAISES with no injected label provider, and the message names the
//      resource keys.
//  15. `getApplicableTermOptions()` returns exactly THREE rows, in order both/initial/renewal, with
//      RESOURCE KEYS in `name` and not English. Assert a FRESH array per call (two calls, not
//      reference-equal).
//  16. ★ `getAmountTypeOptions()` returns TWO rows for `rewardType === 'order'` and THREE otherwise.
//      Assert the arity difference explicitly, and assert the ORDER-level list OMITS the `amount`
//      option - the engine's `"amount"` branch needs a per-unit price and a quantity an order-level
//      reward does not have.
//  17. ★ THE THIRD ROW'S KEY/VALUE MISMATCH IS PINNED POSITIVELY: `{ name: 'define.fixedAmount',
//      value: 'amount' }`. Defect D4. `getDiscountAmount()` cases on the literal `"amount"`
//      [model/service/PromotionService.cfc:L1000], so a "corrected" value breaks discount dispatch.
//  18. `getAmountTypeOptions()` and `getAmountFormatted()` both fold CASE: `'ORDER'`, `'Order'` and
//      `'order'` behave identically, as do `'PercentageOff'` and `'percentageoff'`.
//  19. ★ A NULL `rewardType` FALLS TO THE THREE-ROW BRANCH and a null `amountType` falls to the
//      CURRENCY branch - the one uniform "null normalises to `''` and does not match" rule shared with
//      `PriceGroupRate.getAmountFormatted()`. Pin it in both files so the rule cannot drift in one.
//  20. ★ `getAmountFormatted()` DROPS TRAILING ZEROS ON THE PERCENTAGE BRANCH: a stored `10.50`
//      renders `'10.5%'`, NOT `'10.50%'`. Assert the exact string. This is CFML numeric
//      stringification via `formatValue_percentage` [org/Hibachi/HibachiUtilityService.cfc:L62-L64],
//      and it is the single easiest place in this file to reintroduce `toFixed2()` by accident.
//  21. `getAmountFormatted()` RAISES with no amount (both branches) and RAISES on the currency branch
//      with no formatter; the percentage branch does NOT need a formatter.
//  22. `getAmountFormatted()` delegates the currency branch to the injected formatter and returns its
//      output verbatim - no wrapping, no trimming.
//  23. ★ `isDeletable()` RETURNS `false` FOR AN EXPIRED PERIOD WITHOUT TOUCHING `getPromotion()`.
//      Construct the period with a spy/throwing `getPromotion` and assert `false` is returned rather
//      than a raise. This is the `&&` short-circuit, and it is the reason the method is written as two
//      statements.
//  24. `isDeletable()` RAISES with no period, and RAISES with a non-expired period whose promotion is
//      unmaterialized - two distinct messages.
//  25. ★ THE FOURTEEN PLAIN PROBES MATCH BY PRIMARY KEY across two distinct objects representing the
//      same saved row, and fall back to REFERENCE identity when the candidate's key is `''`.
//  26. The three out-of-scope probes - `hasFulfillmentMethod`, `hasShippingAddressZone`,
//      `hasShippingMethod` - match by PRIMARY KEY; assert that two distinct objects with the same ID
//      DO match. Record in the test name that the first two have no `isNew()` to consult.
//  27. ★ `hasAnyOption` / `hasAnyExcludedOption` SHORT-CIRCUIT on the first match: pass an array whose
//      FIRST element matches and whose second would record being read, and assert the second was never
//      touched. `hasAnyInProperty`'s `return true` is INSIDE the loop
//      [org/Hibachi/HibachiEntity.cfc:L343-L345].
//  28. ★ BOTH AGGREGATE PROBES ANSWER `false` FOR AN EMPTY ARRAY. Load-bearing at
//      [model/service/PromotionService.cfc:L951]: a SKU with NO options must NOT be excluded by an
//      option-based exclusion. `true` - or a raise - would disqualify every optionless SKU.
//  29. Both aggregate probes DELEGATE: an UNSAVED option present by REFERENCE in `options` is found by
//      `hasAnyOption`, because `hasOption` supplies the reference fallback. Assert through the
//      aggregate, so a future inlined key-only comparison is caught.
//  30. ★ THE ANTI-CONTRACT, PART 1 (defect D3): assert the ABSENCE of `addFulfillmentMethod`,
//      `addFulfillmentMethods`, `removeFulfillmentMethod`, `removeFulfillmentMethods`,
//      `addShippingAddressZone`, `removeShippingAddressZone`, `addAddressZone` and `removeAddressZone`
//      on the prototype. Authoring any of them would repair defects in two out-of-scope entities and
//      make two promotion gates populatable for the first time.
//  31. ★ THE ANTI-CONTRACT, PART 2 (defect D2): assert the ABSENCE of `addShipppingMethod` and
//      `removeShipppingMethod` (THREE p's) while `addShippingMethod`/`removeShippingMethod` (two p's)
//      are present. [model/entity/ShippingMethod.cfc:L105/L108] call the three-p spelling and both
//      calls are dead; an alias would resurrect them.
//  32. `getRewards` is ABSENT - the [L104] non-persistent property is vestigial with zero readers
//      outside `org/`. Pin the absence so a future "every property needs a getter" sweep must read the
//      note.
//  33. `preInsert` and `preUpdate` are ABSENT - the source's ORM hook banner [L423-L425] is empty.
//  34. `getSimpleRepresentationPropertyName()` returns exactly `'rewardType'` - lower-camel, matching
//      [L63]. Contrast `PriceGroupRate`'s `'DisplayName'`; a test naming both keeps the two from being
//      "normalised" to one convention.
// ---------------------------------------------------------------------------
