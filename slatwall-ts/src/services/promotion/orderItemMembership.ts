// ---------------------------------------------------------------------------
// slatwall-ts - Promotion order-item membership
//
// PORTED FROM the two membership twins, as a 1:1 logic extraction:
//
//   public boolean function getOrderItemInQualifier(required any qualifier, required any orderItem)
//     [model/service/PromotionService.cfc:L852-L919]
//   public boolean function getOrderItemInReward(required any reward, required any orderItem)
//     [model/service/PromotionService.cfc:L921-L985]
//
// `model/service/PromotionService.cfc` is the SOLE BEHAVIOURAL AUTHORITY here;
// `model/entity/PromotionQualifier.cfc` and `model/entity/PromotionReward.cfc` were read only as
// accessor contracts. These two functions decide WHICH ORDER ITEMS a qualifier or reward applies
// to, placing them beneath MUST-PRESERVE AREA #1 (AAP 0.8.1): the arithmetic lives in
// `./discountAmount.ts`, so a wrong membership answer changes money just as surely as a wrong
// operator would.
//
// THE TWO TWINS ARE NEAR-IDENTICAL AND MUST NOT BE UNIFIED.
//
// CFML parity [model/service/PromotionService.cfc:L873-L886, L943-L952] - THE EXCLUSION CENSUS IS
// SEVEN OR-OPERANDS IN THE QUALIFIER TWIN AND FIVE IN THE REWARD TWIN:
//
//   #  exclusion operand                              qualifier      reward
//   1  hasExcludedProductType (materialized-path)     L873   yes     L943   yes
//   2  minimumItemPrice > orderItem price             L875   yes     ---    ABSENT
//   3  maximumItemPrice < orderItem price             L877   yes     ---    ABSENT
//   4  hasExcludedProduct(...)                        L879   yes     L945   yes
//   5  hasExcludedSku(...)                            L881   yes     L947   yes
//   6  compound excluded-brand clause                 L883   yes     L949   yes
//   7  hasAnyExcludedOption(...)                      L885   yes     L951   yes
//
// A REWARD HAS NO ITEM-PRICE GATE AT ALL, and that is a schema fact rather than a call-site
// accident: `PromotionReward.cfc` declares neither bound, whereas
// [model/entity/PromotionQualifier.cfc:L61-L62] declares both as `ormtype="big_decimal"` with
// `hb_nullRBKey="define.0"` and `hb_nullRBKey="define.unlimited"`. The twins are therefore authored
// SEPARATELY below and the duplication is DELIBERATE: unifying them would either apply the
// item-price gates to rewards or drop them from qualifiers, and both change money.
//
// The one thing they legitimately share is the mechanical comma-list product-type path scan, which
// is byte-identical in both, carries no include/exclude polarity, and which AAP 0.3.3 mandates
// centralising in `materializedIdPath`. See `productTypeIdPathIntersects`.
//
// THIS FILE OWNS NO NUMBERED DEFECT-REGISTER ENTRY. It owns six structural findings, each annotated
// at its site: the 7-versus-5 asymmetry above; the null-brand polarity inversion; the restrictive
// include-side default; the four `listFindNoCase` bare-truthiness sites; the
// `includedPropertyTypeIDList` misspelling; and the L875/L877 bare-scope artifact.
//
// THREE TRANSLATION HABITS APPLY THROUGHOUT, STATED ONCE HERE, so the sites below annotate them
// without re-arguing them. None is a divergence; this file has none.
//   1. READ-COUNT REDUCTION ON A PURE ACCESSOR. Where the legacy re-reads the same pure accessor
//      inside one expression or loop, the target reads it once into a local. Unobservable.
//   2. CFML BARE-SCOPE READS CANNOT BE EXPRESSED. Some operands read an unscoped
//      `qualifier`/`reward` where their neighbours read `arguments.`; CFML resolves both to the
//      same value and TypeScript has no `arguments` scope. Same family at [L727], [L743], [L875],
//      [L877], [L993] and [L998].
//   3. 1-BASED CFML INDEXING IS ELIMINATED, NOT EMULATED. Accumulation loops iterate by value;
//      legacy element `i` is `array[i - 1]`, and no indexed read survives to be narrowed.
//
// CFML parity [model/service/PromotionService.cfc:L727, L805, L220]: the two qualifier call sites
// use CFML's KEYWORD argument form and the reward call site the POSITIONAL form; all three collapse
// onto one positional shape. `getOrderItemInQualifier` is called positively at [L727] and NEGATED
// at [L805]; `getOrderItemInReward` only at [L220]. Every edge runs INTO this file, never outward,
// so the graph stays acyclic.
// ---------------------------------------------------------------------------

import type { Brand } from '../../domain/entities/brand.js';
import type { Product } from '../../domain/entities/product.js';
import type { ProductType } from '../../domain/entities/productType.js';
import type { PromotionQualifier } from '../../domain/entities/promotionQualifier.js';
import type { PromotionReward } from '../../domain/entities/promotionReward.js';
import { idPathContainsAnyId } from '../../domain/valueObjects/materializedIdPath.js';
import type { OrderItemView } from '../../domain/views/orderItemView.js';
import { listAppend } from '../../lib/cfml/list.js';
import { isNullish } from '../../lib/cfml/truthiness.js';

// ---------------------------------------------------------------------------
// JUDGMENT CALL: this module exports exactly ONE unit - the class `OrderItemMembership` - carrying
// BOTH verbatim-named methods. E7 permits one exported primary unit per file, while interface
// parity requires TWO methods whose names are the legacy CFML names character-for-character; a
// class satisfies both at once and keeps the shared path scan and the two narrowing helpers
// module-local. A barrel or namespace re-export is forbidden outright by the ESLint
// `no-restricted-imports` barrel pattern group.
//
// The class has NO CONSTRUCTOR DEPENDENCIES: both methods are pure over their arguments, reaching
// no DAO, ORM, port or setting, so there is nothing to inject.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CFML parity [model/entity/OrderItem.cfc:L53, L63] - HOW THE LEGACY ORDER-ITEM READS MAP ONTO THE
// VIEW. Both twins read exactly two things from the order item, `getSku()` and `getPrice()`. In the
// target it arrives as `OrderItemView`, the read-only anti-corruption shape, which publishes those
// as `readonly` PROPERTIES `orderItem.sku` and `orderItem.price`, both non-nullable, matching the
// legacy sites that dereference them without any guard. Nothing here mutates the view or writes to
// order persistence: membership is a question, and the write side is the applied-promotion intent
// emitted later by `./promotionApplication.ts`.
// ---------------------------------------------------------------------------

/**
 * A narrowing wrapper over the shared `isNullish()` CFML `isNull()` port. Module-local.
 *
 * CFML parity [model/service/PromotionService.cfc:L875, L877, L883, L911, L949, L977]: the six
 * `isNull()` / `!isNull()` tests across the two twins - two item-price bounds, two excluded-brand
 * clauses and two brand-inclusion clauses.
 *
 * The shared helper is declared `(value: unknown) => boolean`, giving the compiler nothing to
 * narrow with, so it is wrapped in a type predicate. Every nullable value below is NARROWED, never
 * asserted - `@typescript-eslint/no-non-null-assertion` is an error across `src/**`.
 */
function isAbsent(value: unknown): value is null | undefined {
  return isNullish(value);
}

/**
 * The order item's product, reproducing the legacy UNGUARDED dereference.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L864, L879, L883, L899, L905, L911]: the legacy
 * walks `arguments.orderItem.getSku().getProduct()` at six sites in the qualifier twin, and at the
 * matching reward sites, WITHOUT A SINGLE NULL GUARD. The ported `Sku.getProduct()` answers
 * `Product | undefined` because `Sku.remove*` can clear the association, so the strict profile
 * forces the absence to be acknowledged - a TYPE-LEVEL NECESSITY, NOT A BEHAVIOURAL CHANGE. An
 * absent product RAISES here, exactly as CFML raises on a dereference of nothing, and must never be
 * softened into a silent `false`, which would withhold a discount over a data fault.
 *
 * CALL THIS AT THE CLAUSE POSITION, NEVER HOISTED. The item-price gates at [L875] and [L877] can
 * short-circuit the exclusion disjunction BEFORE the first dereference at [L879], and [L858]
 * dereferences nothing when its collection is empty, so a hoisted resolution would raise where the
 * legacy answers `false`. Per-site calling is also exact read-count parity.
 */
function requireProduct(orderItem: OrderItemView): Product {
  const product = orderItem.sku.getProduct();

  if (isAbsent(product)) {
    throw new Error(
      `OrderItem '${orderItem.orderItemID}': promotion membership requires the sku's owning ` +
        `product, which [model/service/PromotionService.cfc:L879, L883, L905, L911] and their ` +
        `reward twins dereference unconditionally.`,
    );
  }

  return product;
}

/**
 * The order item's product type, reproducing the legacy UNGUARDED dereference.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L864]: the five-hop chain
 * `arguments.orderItem.getSku().getProduct().getProductType().getProductTypeIDPath()` is
 * dereferenced with no null guard at any of its four sites - [L864-L865], [L899-L900], [L934-L935]
 * and [L965-L966]. As with `requireProduct`, acknowledging the ported `ProductType | undefined` is
 * a typing necessity and an absent product type raises, never a silent `false`.
 *
 * No guard beyond that: the path string may legitimately be EMPTY, and an empty path is answered
 * `false` by the shared scan, because a path of no elements has nothing to look up.
 */
function requireProductType(orderItem: OrderItemView): ProductType {
  const productType = requireProduct(orderItem).getProductType();

  if (isAbsent(productType)) {
    throw new Error(
      `OrderItem '${orderItem.orderItemID}': promotion membership requires the product's product ` +
        `type, which [model/service/PromotionService.cfc:L864-L865, L899-L900, L934-L935, ` +
        `L965-L966] dereferences unconditionally.`,
    );
  }

  return productType;
}

/**
 * THE ONE THING THE TWO TWINS SHARE: the mechanical comma-list product-type path scan.
 *
 * MECHANICAL ONLY - it answers "does this item's product-type ancestry intersect this configured
 * set" and carries NO include/exclude polarity, which is why sharing it hides nothing: one caller
 * treats `true` as grounds for exclusion, the other as grounds for inclusion. It is shared because
 * the legacy is byte-identical at all four sites and AAP 0.3.3 mandates centralising comma-list
 * identifier-path logic.
 *
 * Legacy sites reproduced: [model/service/PromotionService.cfc:L859-L869] (qualifier exclusion),
 * [L893-L903] (qualifier inclusion), [L929-L939] (reward exclusion), [L959-L969] (reward
 * inclusion).
 *
 * CFML parity [model/service/PromotionService.cfc:L861, L896, L931, L962]: each legacy accumulator
 * starts as the EMPTY STRING, and `listAppend` onto an empty list yields the value alone with NO
 * LEADING DELIMITER, which the shared port reproduces exactly. The accumulation stays here because
 * the collection it is built from differs between the twins and between the two sides.
 *
 * CFML parity [model/service/PromotionService.cfc:L860, L864, L865]: the accumulation loops are
 * 1-BASED (habit 3), and the five-hop chain is evaluated TWICE PER LOOP ITERATION in the legacy -
 * loop bound and body - at all four sites, so it is read ONCE here before the scan (habit 1).
 *
 * CFML parity [model/service/PromotionService.cfc:L865, L900, L935, L966]: all four legacy lookups
 * are `if(listFindNoCase(list, element))`, and `listFindNoCase` answers a 1-BASED POSITION on a hit
 * or `0` on a miss - NOT a boolean, so every one is bare numeric truthiness. The comparison against
 * `0` is made EXPLICITLY inside `idPathContainsAnyId`, which is why this helper delegates: that
 * avoids both leaning on JavaScript's coincidental falsiness of `0` and substituting a
 * `findIndex`/`indexOf` result - which answers `-1` on a miss - where a miss would read as a hit
 * and index 0 would be lost. The convention is the 1-based one: position `> 0`. `listFindNoCase` is
 * also CASE-INSENSITIVE by contract, as CFML struct keys are, so the match goes through the shared
 * port and never a hand-rolled `===` that would reject a differently-cased stored identifier.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L865, L900, L935, L966]: cited as `!arrayFind`
 * sites; verified as un-negated `listFindNoCase` sites. Locator corrected against source. The sole
 * `!arrayFind` site in this method family is [model/service/PromotionService.cfc:L602], which
 * belongs to `./promotionPeriodQualification.ts`.
 *
 * THE `arrayLen(...)` GUARD DELIBERATELY STAYS WITH THE CALLER, at [L858], [L892], [L928] and
 * [L958]: while the configured collection is empty the legacy never touches the five-hop chain, so
 * folding the guard inward would move the product-type dereference - and the raise it can produce -
 * to a place the legacy never reaches.
 *
 * @param orderItem - the order item whose product-type ancestry is walked.
 * @param configuredProductTypes - the configured product types, LIVE and treated as read-only.
 * @returns `true` when some element of the item's product-type path is in the configured set.
 */
function productTypeIdPathIntersects(
  orderItem: OrderItemView,
  configuredProductTypes: readonly ProductType[],
): boolean {
  // [L859] / [L893] / [L929] / [L959]: the accumulator starts empty.
  let configuredProductTypeIDList = '';

  // [L860-L862] / [L895-L897] / [L930-L932] / [L961-L963].
  for (const configuredProductType of configuredProductTypes) {
    configuredProductTypeIDList = listAppend(
      configuredProductTypeIDList,
      configuredProductType.getProductTypeID(),
    );
  }

  // [L864] loop bound and [L865] loop body, collapsed into one read.
  const productTypeIDPath = requireProductType(orderItem).getProductTypeIDPath();

  // [L864-L869] / [L899-L903] / [L934-L939] / [L965-L969]: the walk itself, delegated.
  return idPathContainsAnyId(productTypeIDPath, configuredProductTypeIDList);
}

// ---------------------------------------------------------------------------
// THE NULL-BRAND POLARITY INVERSION. BOTH DIRECTIONS ARE RESTRICTIVE, THROUGH OPPOSITE LOGIC, AND
// BOTH ARE LOAD-BEARING.
//
// CFML parity [model/service/PromotionService.cfc:L883, L911] and the reward twin's equivalents at
// [L949] and [L977].
//
// EXCLUDE SIDE - [L883] / [L949] - A BRANDLESS PRODUCT IS EXCLUDED:
//
//   ( arrayLen( getExcludedBrands() ) && ( isNull( ...getBrand() )
//     || hasExcludedBrand( ...getBrand() ) ) )
//
// When the qualifier or reward names ANY excluded brand AND the product has NO brand at all, the
// item is EXCLUDED - a null brand is treated as though it were itself on the exclusion list.
//
// INCLUDE SIDE - [L911] / [L977] - A BRANDLESS PRODUCT CAN NEVER BE INCLUDED:
//
//   if(!isNull( ...getBrand() ) && hasBrand( ...getBrand() )) { return true; }
//
// THE POLARITY OF THE NULL TEST IS INVERTED BETWEEN THE TWO SIDES - `isNull(...) ||` against
// `!isNull(...) &&` - YET BOTH OUTCOMES POINT THE SAME WAY: RESTRICTIVE. Neither side is normalised
// into a shared brand-resolution helper; the exclude side does not skip brandless products, and the
// include side does not treat a brandless product as a wildcard. Both are counter-intuitive and
// both decide money, so both are reproduced exactly.
//
// THE NULL DEREFERENCE IS PROTECTED BY SHORT-CIRCUIT EVALUATION ALONE, NOT BY A SEPARATE GUARD:
// `hasExcludedBrand(getBrand())` is reached only once `isNull(getBrand())` answered false, and
// `hasBrand(getBrand())` only once `!isNull(getBrand())` answered true. TypeScript's `||` and `&&`
// short-circuit identically, so reordering the operands would introduce a dereference of a nullish
// value that the legacy never performs.
//
// TWO SEPARATE PREDICATES FOLLOW, ONE PER TWIN, AND THEY ARE NOT MERGED, for the same reason the
// twins themselves are not: one shared brand predicate would make qualifier and reward look
// interchangeable at the one clause where the surrounding censuses differ. Each predicate names its
// own legacy line, and each applies the length gate BEFORE reading the brand - the legacy operand
// order - because a brand local hoisted above the disjunction would dereference the product when
// `getExcludedBrands()` is empty, which `arrayLen(...)` prevents in the legacy.
//
// CFML parity [model/service/PromotionService.cfc:L883, L949]: the legacy reads `...getBrand()`
// TWICE inside the clause; it is read ONCE below (habit 1).
//
// CFML parity [org/Hibachi/HibachiEntity.cfc:L340-L350]: `hasExcludedBrand` and `hasBrand` belong
// to the framework's implicit collection-contains family, which answers `false` against an empty
// configured collection - PERMISSIVE on the exclude side, RESTRICTIVE on the include side. See the
// fuller note below.
// ---------------------------------------------------------------------------

/**
 * The compound excluded-brand exclusion operand of the QUALIFIER twin. Ports
 * [model/service/PromotionService.cfc:L883] and nothing else.
 *
 * @param qualifier - the promotion qualifier whose excluded brands are consulted.
 * @param orderItem - the order item under test.
 * @returns `true` when this operand excludes the item.
 */
function qualifierExcludesByBrand(
  qualifier: PromotionQualifier,
  orderItem: OrderItemView,
): boolean {
  // [L883] first operand: `arrayLen( arguments.qualifier.getExcludedBrands() )`, as an explicit
  // emptiness test rather than the legacy's bare numeric truthiness. No excluded brands means the
  // brand is never read.
  const excludedBrands: readonly Brand[] = qualifier.getExcludedBrands();
  if (excludedBrands.length === 0) {
    return false;
  }

  const brand = requireProduct(orderItem).getBrand();

  // [L883] second operand: `isNull( ...getBrand() )`. A BRANDLESS PRODUCT IS EXCLUDED.
  if (isAbsent(brand)) {
    return true;
  }

  // [L883] third operand: `arguments.qualifier.hasExcludedBrand( ...getBrand() )`, reached only
  // because the brand is present.
  return qualifier.hasExcludedBrand(brand);
}

/**
 * The compound excluded-brand exclusion operand of the REWARD twin. Ports
 * [model/service/PromotionService.cfc:L949] and nothing else. Deliberately a separate function from
 * the qualifier's [L883] equivalent - see the block comment above.
 *
 * @param reward - the promotion reward whose excluded brands are consulted.
 * @param orderItem - the order item under test.
 * @returns `true` when this operand excludes the item.
 */
function rewardExcludesByBrand(reward: PromotionReward, orderItem: OrderItemView): boolean {
  // [L949] first operand: `arrayLen( arguments.reward.getExcludedBrands() )`.
  const excludedBrands: readonly Brand[] = reward.getExcludedBrands();
  if (excludedBrands.length === 0) {
    return false;
  }

  const brand = requireProduct(orderItem).getBrand();

  // [L949] second operand: `isNull( ...getBrand() )`. A BRANDLESS PRODUCT IS EXCLUDED.
  if (isAbsent(brand)) {
    return true;
  }

  // [L949] third operand: `arguments.reward.hasExcludedBrand( ...getBrand() )`.
  return reward.hasExcludedBrand(brand);
}

// ---------------------------------------------------------------------------
// THE EMPTY-COLLECTION ANSWER MEANS TWO OPPOSITE THINGS, DEPENDING ONLY ON WHICH SIDE OF THE
// FUNCTION IT LANDS ON.
//
// CFML parity [org/Hibachi/HibachiEntity.cfc:L340-L350]:
//
//   public boolean function hasAnyInProperty( required string propertyName, array entityArray ) {
//     for(var entity in arguments.entityArray) {
//       if( evaluate("has#propertyName#( entity )") ){ return true; }
//     }
//     return false;
//   }
//
// An empty array never executes the loop body, so the method answers `false`; the singular family -
// `hasExcludedProduct`, `hasExcludedSku`, `hasExcludedBrand`, `hasProduct`, `hasSku`, `hasBrand` -
// behaves equivalently against an empty CONFIGURED collection. That single `false` then means:
//
//   EXCLUDE side  [L879, L881, L883, L885] and [L945, L947, L949, L951]
//     "not on the exclusion list"  => PERMISSIVE: the item SURVIVES.
//   INCLUDE side  [L905, L908, L911, L914] and [L971, L974, L977, L980]
//     "not on the inclusion list"  => RESTRICTIVE: the item is REJECTED.
//
// THE TWO PATHS ARE THEREFORE KEPT VISIBLY DISTINCT BELOW AND ARE NEVER FACTORED INTO ONE GENERIC
// `matchesAny(collection, candidate)` HELPER, which would make the asymmetry above invisible. The
// framework's SEMANTICS are reproduced here; no file under `org/Hibachi/**` is ported or modified.
// ---------------------------------------------------------------------------

/**
 * Which order items a promotion qualifier or reward applies to.
 *
 * ONE exported unit carrying the two membership twins, both with their legacy CFML names verbatim
 * in camelCase - `getOrderItemInQualifier`, not `isOrderItemInQualifier`; `getOrderItemInReward`,
 * not `orderItemMatchesReward` - so a reviewer can diff these surfaces against
 * [model/service/PromotionService.cfc:L852-L919, L921-L985] method for method.
 *
 * BOTH METHODS ARE SYNCHRONOUS, a deliberate application of the async boundary rule: neither body
 * reaches the DAO, the ORM or a collaborator that does - they traverse associations the repository
 * already materialized and walk a comma-delimited string - so making either `async` would add a
 * promise the legacy contract does not have and force every caller, including the negated site at
 * [model/service/PromotionService.cfc:L805], to await a pure predicate.
 *
 * The legacy `any` parameter types are replaced by the concrete entity and view types, a refinement
 * rather than a widening; the `boolean` return, parameter names, order and count are unchanged.
 *
 * Stateless and safe to share: no field, no cache and no collaborator, so one instance can be
 * constructed once and held by its consumers as a `readonly` field.
 */
export class OrderItemMembership {
  /**
   * Does this qualifier apply to this order item?
   *
   * Ports `public boolean function getOrderItemInQualifier(required any qualifier, required any
   * orderItem)` [model/service/PromotionService.cfc:L852-L919].
   *
   * SEVEN exclusion operands, including the two item-price gates the reward twin does not have. The
   * shape is: exclusions first with a single early `return false`, then inclusions as sequential
   * early `return true`s, then a restrictive final `return false`.
   *
   * @param qualifier - the promotion qualifier being tested.
   * @param orderItem - the order item being tested, read-only.
   * @returns `true` when the item is a member of this qualifier's scope.
   */
  public getOrderItemInQualifier(qualifier: PromotionQualifier, orderItem: OrderItemView): boolean {
    // ---- [L854] START: Check Exclusions ----
    //
    // EXCLUSIONS ARE EVALUATED FIRST AND SHORT-CIRCUIT THE WHOLE FUNCTION: if any operand matches,
    // [L887] answers `false` and the inclusion block is never reached. Evaluating inclusions first
    // would let an item that is both included and excluded slip through, which is different money.

    // [L856] the flag, declared false before the disjunction that consumes it.
    let hasExcludedProductType = false;

    // [L857-L870] the product-type exclusion scan, computed BEFORE the big `if` and consumed as its
    // FIRST operand, so it runs unconditionally subject only to its own emptiness gate while
    // operands 2 through 7 are short-circuited. That two-step shape is reproduced rather than
    // inlined as a lazily evaluated call in the disjunction, which would change when the path walk
    // happens. [L858] `arrayLen(...)` as an explicit emptiness test; see
    // `productTypeIdPathIntersects` for why the gate stays here.
    const excludedProductTypes: readonly ProductType[] = qualifier.getExcludedProductTypes();
    if (excludedProductTypes.length > 0) {
      // [L864-L869] the legacy loop sets the flag and `break`s on the first hit; the delegated scan
      // stops at the first hit too, and a `false` answer restores what [L856] established.
      hasExcludedProductType = productTypeIdPathIntersects(orderItem, excludedProductTypes);
    }

    // ---- The two item-price gates, QUALIFIER-ONLY ----
    //
    // CFML parity [model/service/PromotionService.cfc:L875, L877] - THE BARE-`qualifier` SCOPE
    // ARTIFACT. Both legacy operands read the UNSCOPED `qualifier.getMinimumItemPrice()` and
    // `qualifier.getMaximumItemPrice()` while their neighbours read `arguments.qualifier`; habit 2
    // applies. Each legacy operand reads its bound TWICE, for the null test and the comparison, and
    // each is read once here (habit 1) - safe because both are pure reads on the qualifier itself
    // and dereference nothing nullable.
    const minimumItemPrice = qualifier.getMinimumItemPrice();
    const maximumItemPrice = qualifier.getMaximumItemPrice();

    // [L873-L888] THE SEVEN-OPERAND EXCLUSION DISJUNCTION, in legacy operand order. Operands 2 and
    // 3 - the item-price gates - exist ONLY in this twin, and the duplication against the reward
    // twin is DELIBERATE; see the census table in the file header.
    //
    // CFML parity [model/service/PromotionService.cfc:L875, L877] - BOTH ITEM-PRICE COMPARISONS ARE
    // STRICT, so BOUNDARY EQUALITY IS INCLUSIVE: an item priced exactly at `minimumItemPrice` is
    // NOT excluded, nor is one priced exactly at `maximumItemPrice`, and `>=` or `<=` here would
    // exclude the boundary and charge a different price. The direction reads backwards but is
    // correct - the clause EXCLUDES when the configured minimum sits ABOVE the item price, meaning
    // the item is too cheap to qualify, and symmetrically when the maximum sits BELOW it.
    //
    // Both bounds are nullable and INDEPENDENT, and an absent bound imposes no constraint at all.
    // Nothing validates that the minimum does not exceed the maximum, nothing validates
    // non-negativity, and nothing raises on a nonsensical band: an inverted band that excludes
    // every item is legitimate legacy behaviour, not a fault to be caught. All three values are
    // MONETARY, so the comparisons go through `Money.isGreaterThan` and `Money.isLessThan`, and
    // `Money.zero` is never substituted for an absent bound - absence is no constraint, not zero.
    if (
      hasExcludedProductType ||
      (!isAbsent(minimumItemPrice) && minimumItemPrice.isGreaterThan(orderItem.price)) ||
      (!isAbsent(maximumItemPrice) && maximumItemPrice.isLessThan(orderItem.price)) ||
      qualifier.hasExcludedProduct(requireProduct(orderItem)) ||
      qualifier.hasExcludedSku(orderItem.sku) ||
      qualifierExcludesByBrand(qualifier, orderItem) ||
      qualifier.hasAnyExcludedOption(orderItem.sku.getOptions())
    ) {
      // [L887]
      return false;
    }

    // ---- [L890] START: Check Inclusions ----

    // [L892-L904] the product-type inclusion scan. Same loop shape as the exclusion scan above,
    // DIFFERENT EXIT: the exclusion loop sets a flag and `break`s, this one `return true`s straight
    // out of the function at [L901]. Both exits are mirrored faithfully.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L893, L959]: the legacy accumulator for both
    // inclusion scans is named `includedPropertyTypeIDList` - "Property" where it should read
    // "Product" - recurring at [L896]/[L900] and [L962]/[L966]. It is purely local with no data
    // contract, so the target spells it correctly and records the original here. Contrast
    // `hb_permission="promotionPeriod.promtionRewards"` at [model/entity/PromotionReward.cfc:L57],
    // which IS a persisted data contract and is preserved VERBATIM.
    const includedProductTypes: readonly ProductType[] = qualifier.getProductTypes();
    if (includedProductTypes.length > 0) {
      // [L899-L903]
      if (productTypeIdPathIntersects(orderItem, includedProductTypes)) {
        return true;
      }
    }

    // [L905-L916] FOUR SEQUENTIAL INCLUSION TESTS, each with its OWN early `return true` - four
    // separate `if` statements in the legacy, NOT an `if`/`else if` chain and NOT a single `||`
    // disjunction. Each answers `false` against an empty collection, RESTRICTIVE on this side.

    // [L905-L907]
    if (qualifier.hasProduct(requireProduct(orderItem))) {
      return true;
    }

    // [L908-L910]
    if (qualifier.hasSku(orderItem.sku)) {
      return true;
    }

    // [L911-L913] the brand inclusion, with the null test NEGATED - the polarity inversion against
    // [L883]. A BRANDLESS PRODUCT CAN NEVER BE INCLUDED.
    const brand = requireProduct(orderItem).getBrand();
    if (!isAbsent(brand) && qualifier.hasBrand(brand)) {
      return true;
    }

    // [L914-L916]
    if (qualifier.hasAnyOption(orderItem.sku.getOptions())) {
      return true;
    }

    // CFML parity [model/service/PromotionService.cfc:L918, L984] - THE FINAL `return false` IS A
    // RESTRICTIVE DEFAULT AND IT IS LOAD-BEARING. A qualifier with no product types, products,
    // skus, brands or options matches NOTHING, so an "empty" qualifier scopes ZERO items. It is
    // never inverted into a permissive default, and no "if no inclusion criteria are configured,
    // include all" convenience branch is added - that would widen every unconfigured promotion to
    // the whole order. [L918]
    return false;
  }

  /**
   * Does this reward apply to this order item?
   *
   * Ports
   *   `public boolean function getOrderItemInReward(required any reward, required any orderItem)`
   * [model/service/PromotionService.cfc:L921-L985].
   *
   * FIVE exclusion operands. THE QUALIFIER TWIN'S TWO ITEM-PRICE GATES ARE ABSENT HERE AND MUST NOT
   * BE ADDED: adding them would invent enforcement the legacy does not perform. See the census in
   * the file header.
   *
   * @param reward - the promotion reward being tested.
   * @param orderItem - the order item being tested, read-only.
   * @returns `true` when the item is a member of this reward's scope.
   */
  public getOrderItemInReward(reward: PromotionReward, orderItem: OrderItemView): boolean {
    // ---- [L924] START: Check Exclusions ----
    //
    // EXCLUSIONS FIRST, short-circuiting the whole function at [L953], as in the qualifier twin.

    // [L926]
    let hasExcludedProductType = false;

    // [L927-L940] the product-type exclusion scan, computed before the disjunction and consumed as
    // its first operand. [L928] `arrayLen(...)` as an explicit emptiness test.
    const excludedProductTypes: readonly ProductType[] = reward.getExcludedProductTypes();
    if (excludedProductTypes.length > 0) {
      // [L934-L939] flag-and-break in the legacy; the delegated scan's boolean answer records it.
      hasExcludedProductType = productTypeIdPathIntersects(orderItem, excludedProductTypes);
    }

    // [L943-L954] THE FIVE-OPERAND EXCLUSION DISJUNCTION, in legacy operand order. THERE IS NO
    // ITEM-PRICE GATE IN THIS TWIN - a reward cannot be scoped to a price band. The body is
    // deliberately NOT shared with the qualifier twin: the difference is exactly the two operands
    // that decide which items get priced. See the census in the file header.
    if (
      hasExcludedProductType ||
      reward.hasExcludedProduct(requireProduct(orderItem)) ||
      reward.hasExcludedSku(orderItem.sku) ||
      rewardExcludesByBrand(reward, orderItem) ||
      reward.hasAnyExcludedOption(orderItem.sku.getOptions())
    ) {
      // [L953]
      return false;
    }

    // ---- [L956] START: Check Inclusions ----

    // [L958-L970] the product-type inclusion scan - same loop shape as the exclusion scan, exiting
    // by `return true` at [L967] rather than by flag-and-break. The legacy accumulator here is the
    // second `includedPropertyTypeIDList` site, at [L959]; see the note in the qualifier twin.
    const includedProductTypes: readonly ProductType[] = reward.getProductTypes();
    if (includedProductTypes.length > 0) {
      // [L965-L969]
      if (productTypeIdPathIntersects(orderItem, includedProductTypes)) {
        return true;
      }
    }

    // [L971-L982] FOUR SEQUENTIAL INCLUSION TESTS, each with its own early `return true` - four
    // separate `if` statements in the legacy, not a chain and not a disjunction.

    // [L971-L973]
    if (reward.hasProduct(requireProduct(orderItem))) {
      return true;
    }

    // [L974-L976]
    if (reward.hasSku(orderItem.sku)) {
      return true;
    }

    // [L977-L979] the brand inclusion, null test NEGATED - the polarity inversion against [L949]. A
    // BRANDLESS PRODUCT CAN NEVER BE INCLUDED.
    const brand = requireProduct(orderItem).getBrand();
    if (!isAbsent(brand) && reward.hasBrand(brand)) {
      return true;
    }

    // [L980-L982]
    if (reward.hasAnyOption(orderItem.sku.getOptions())) {
      return true;
    }

    // CFML parity [model/service/PromotionService.cfc:L918, L984] - THE RESTRICTIVE DEFAULT. A
    // reward with no product types, no products, no skus, no brands and no options matches NOTHING,
    // so an "empty" reward discounts ZERO items. Preserved, never inverted. [L984]
    return false;
  }
}
