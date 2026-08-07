// slatwall-ts - Promotion order-item membership.
//
// A reward has no item-price gate at all, and that is a schema fact rather than a call-site
// accident: `PromotionReward.cfc` declares neither bound.
//
// The one thing they legitimately share is the mechanical comma-list product-type path scan, which
// is byte-identical in both, carries no include/exclude polarity.
//
// CFML parity [model/service/PromotionService.cfc:L727, L805, L220]: the two qualifier call sites
// use CFML's KEYWORD argument form and the reward call site the POSITIONAL form; all three
// collapse onto one positional shape.

import type { Brand } from '../../domain/entities/brand.js';
import type { Product } from '../../domain/entities/product.js';
import type { ProductType } from '../../domain/entities/productType.js';
import type { PromotionQualifier } from '../../domain/entities/promotionQualifier.js';
import type { PromotionReward } from '../../domain/entities/promotionReward.js';
import { idPathContainsAnyId } from '../../domain/valueObjects/materializedIdPath.js';
import type { OrderItemView } from '../../domain/views/orderItemView.js';
import { listAppend } from '../../lib/cfml/list.js';
import { isNullish } from '../../lib/cfml/truthiness.js';

// JUDGMENT CALL: this module exports exactly one unit - the class `OrderItemMembership` - carrying
// both verbatim-named methods.
//
// The class has no CONSTRUCTOR DEPENDENCIES: both methods are pure over their arguments, reaching
// no DAO, ORM, port or setting, so there is nothing to inject.

// CFML parity [model/entity/OrderItem.cfc:L53, L63] - how the legacy order-item reads map onto the
// view. Both twins read exactly two things from the order item, `getSku()` and `getPrice()`.

/**
 * A narrowing wrapper over the shared `isNullish()` CFML `isNull()` port. Module-local.
 *
 * CFML parity [model/service/PromotionService.cfc:L875, L877, L883, L911, L949, L977]: the six
 * `isNull()` / `!isNull()` tests across the two twins - two item-price bounds, two excluded-brand
 * clauses and two brand-inclusion clauses.
 */
function isAbsent(value: unknown): value is null | undefined {
  return isNullish(value);
}

/**
 * The order item's product, reproducing the legacy UNGUARDED dereference.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L864, L879, L883, L899, L905, L911]: the legacy
 * walks `arguments.orderItem.getSku().getProduct()` at six sites in the qualifier twin, and at the
 * matching reward sites, without a single null guard.
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
 * dereferenced with no null guard at any of its four sites -
 * [model/service/PromotionService.cfc:L864-L865], [model/service/PromotionService.cfc:L899-L900].
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
 * The one thing the two twins share: the mechanical comma-list product-type path scan.
 *
 * @param orderItem the order item whose product-type ancestry is walked.
 * @param configuredProductTypes the configured product types, LIVE and treated as read-only.
 * @returns `true` when some element of the item's product-type path is in the configured set.
 */
function productTypeIdPathIntersects(
  orderItem: OrderItemView,
  configuredProductTypes: readonly ProductType[],
): boolean {
  // [model/service/PromotionService.cfc:L859] / [model/service/PromotionService.cfc:L893] /
  // [model/service/PromotionService.cfc:L929] / [model/service/PromotionService.cfc:L959]: the
  // accumulator starts empty.
  let configuredProductTypeIDList = '';

  // [model/service/PromotionService.cfc:L860-L862] /
  // [model/service/PromotionService.cfc:L895-L897] /
  // [model/service/PromotionService.cfc:L930-L932] /
  // [model/service/PromotionService.cfc:L961-L963].
  for (const configuredProductType of configuredProductTypes) {
    configuredProductTypeIDList = listAppend(
      configuredProductTypeIDList,
      configuredProductType.getProductTypeID(),
    );
  }

  // [model/service/PromotionService.cfc:L864] loop bound and
  // [model/service/PromotionService.cfc:L865] loop body, collapsed into one read.
  const productTypeIDPath = requireProductType(orderItem).getProductTypeIDPath();

  // [model/service/PromotionService.cfc:L864-L869] /
  // [model/service/PromotionService.cfc:L899-L903] /
  // [model/service/PromotionService.cfc:L934-L939] /
  // [model/service/PromotionService.cfc:L965-L969]: the walk itself, delegated.
  return idPathContainsAnyId(productTypeIDPath, configuredProductTypeIDList);
}

// CFML parity [model/service/PromotionService.cfc:L883, L911] and the reward twin's equivalents at
// [model/service/PromotionService.cfc:L949] and [model/service/PromotionService.cfc:L977].
//
// CFML parity [model/service/PromotionService.cfc:L883, L949]: the legacy reads `...getBrand()`
// twice inside the clause; it is read once below (habit 1).

/**
 * The compound excluded-brand exclusion operand of the QUALIFIER twin. Ports
 * [model/service/PromotionService.cfc:L883] and nothing else.
 *
 * @param qualifier the promotion qualifier whose excluded brands are consulted.
 * @param orderItem the order item under test.
 * @returns `true` when this operand excludes the item.
 */
function qualifierExcludesByBrand(
  qualifier: PromotionQualifier,
  orderItem: OrderItemView,
): boolean {
  // [model/service/PromotionService.cfc:L883] first operand:
  // `arrayLen( arguments.qualifier.getExcludedBrands() )`, as an explicit emptiness test rather
  // than the legacy's bare numeric truthiness. No excluded brands means the brand is never read.
  const excludedBrands: readonly Brand[] = qualifier.getExcludedBrands();
  if (excludedBrands.length === 0) {
    return false;
  }

  const brand = requireProduct(orderItem).getBrand();

  // [model/service/PromotionService.cfc:L883] second operand: `isNull(...getBrand() )`. A
  // brandless product is excluded.
  if (isAbsent(brand)) {
    return true;
  }

  // [model/service/PromotionService.cfc:L883] third operand:
  // `arguments.qualifier.hasExcludedBrand(...getBrand() )`, reached only because the brand is
  // present.
  return qualifier.hasExcludedBrand(brand);
}

/**
 * The compound excluded-brand exclusion operand of the REWARD twin. Ports
 * [model/service/PromotionService.cfc:L949] and nothing else.
 *
 * @param reward the promotion reward whose excluded brands are consulted.
 * @param orderItem the order item under test.
 * @returns `true` when this operand excludes the item.
 */
function rewardExcludesByBrand(reward: PromotionReward, orderItem: OrderItemView): boolean {
  // [model/service/PromotionService.cfc:L949] first operand:
  // `arrayLen( arguments.reward.getExcludedBrands() )`.
  const excludedBrands: readonly Brand[] = reward.getExcludedBrands();
  if (excludedBrands.length === 0) {
    return false;
  }

  const brand = requireProduct(orderItem).getBrand();

  // [model/service/PromotionService.cfc:L949] second operand: `isNull(...getBrand() )`. A
  // brandless product is excluded.
  if (isAbsent(brand)) {
    return true;
  }

  // [model/service/PromotionService.cfc:L949] third operand:
  // `arguments.reward.hasExcludedBrand(...getBrand() )`.
  return reward.hasExcludedBrand(brand);
}

// Exclude side [model/service/PromotionService.cfc:L879, L881, L883, L885] and
// [model/service/PromotionService.cfc:L945, L947, L949, L951] "not on the exclusion list" =>
// permissive: the item survives.
//
// `matchesAny(collection, candidate)` HELPER, which would make the asymmetry above invisible.

/**
 * Which order items a promotion qualifier or reward applies to.
 *
 * Both METHODS are SYNCHRONOUS, a deliberate application of the async boundary rule: neither body
 * reaches the DAO, the ORM or a collaborator that does.
 *
 * The legacy `any` parameter types are replaced by the concrete entity and view types, a
 * refinement rather than a widening; the `boolean` return, parameter names.
 */
export class OrderItemMembership {
  /**
   * Does this qualifier apply to this order item?
   *
   * Ports
   * `public boolean function getOrderItemInQualifier(required any qualifier, required any orderItem)`
   * [model/service/PromotionService.cfc:L852-L919].
   *
   * @param qualifier the promotion qualifier being tested.
   * @param orderItem the order item being tested, read-only.
   * @returns `true` when the item is a member of this qualifier's scope.
   */
  public getOrderItemInQualifier(qualifier: PromotionQualifier, orderItem: OrderItemView): boolean {
    // Exclusions are evaluated first and short-circuit the whole function: if any operand matches,
    // [model/service/PromotionService.cfc:L887] answers `false` and the inclusion block is never
    // reached.

    // [model/service/PromotionService.cfc:L856] the flag, declared false before the disjunction
    // that consumes it.
    let hasExcludedProductType = false;

    // [model/service/PromotionService.cfc:L857-L870] the product-type exclusion scan, computed
    // before the big `if` and consumed as its FIRST operand.
    const excludedProductTypes: readonly ProductType[] = qualifier.getExcludedProductTypes();
    if (excludedProductTypes.length > 0) {
      // [model/service/PromotionService.cfc:L864-L869] the legacy loop sets the flag and `break`s
      // on the first hit; the delegated scan stops at the first hit too, and a `false` answer
      // restores what [model/service/PromotionService.cfc:L856] established.
      hasExcludedProductType = productTypeIdPathIntersects(orderItem, excludedProductTypes);
    }

    // CFML parity [model/service/PromotionService.cfc:L875, L877] - the BARE-`qualifier` scope
    // artifact.
    const minimumItemPrice = qualifier.getMinimumItemPrice();
    const maximumItemPrice = qualifier.getMaximumItemPrice();

    // [model/service/PromotionService.cfc:L873-L888] the seven-operand exclusion disjunction, in
    // legacy operand order.
    //
    // Both bounds are nullable and INDEPENDENT, and an absent bound imposes no constraint at all.
    if (
      hasExcludedProductType ||
      (!isAbsent(minimumItemPrice) && minimumItemPrice.isGreaterThan(orderItem.price)) ||
      (!isAbsent(maximumItemPrice) && maximumItemPrice.isLessThan(orderItem.price)) ||
      qualifier.hasExcludedProduct(requireProduct(orderItem)) ||
      qualifier.hasExcludedSku(orderItem.sku) ||
      qualifierExcludesByBrand(qualifier, orderItem) ||
      qualifier.hasAnyExcludedOption(orderItem.sku.getOptions())
    ) {
      return false;
    }

    // [model/service/PromotionService.cfc:L892-L904] the product-type inclusion scan.
    const includedProductTypes: readonly ProductType[] = qualifier.getProductTypes();
    if (includedProductTypes.length > 0) {
      if (productTypeIdPathIntersects(orderItem, includedProductTypes)) {
        return true;
      }
    }

    // [model/service/PromotionService.cfc:L905-L916] four sequential inclusion tests, each with
    // its own early `return true` - four separate `if` statements in the legacy, not an
    // `if`/`else if` chain and not a single `||` disjunction.
    if (qualifier.hasProduct(requireProduct(orderItem))) {
      return true;
    }
    if (qualifier.hasSku(orderItem.sku)) {
      return true;
    }
    const brand = requireProduct(orderItem).getBrand();
    if (!isAbsent(brand) && qualifier.hasBrand(brand)) {
      return true;
    }
    if (qualifier.hasAnyOption(orderItem.sku.getOptions())) {
      return true;
    }

    // CFML parity [model/service/PromotionService.cfc:L918, L984] - the final `return false` is a
    // restrictive default and it is load-bearing.
    return false;
  }

  /**
   * Does this reward apply to this order item?
   *
   * Ports
   * `public boolean function getOrderItemInReward(required any reward, required any orderItem)`
   * [model/service/PromotionService.cfc:L921-L985].
   *
   * @param reward the promotion reward being tested.
   * @param orderItem the order item being tested, read-only.
   * @returns `true` when the item is a member of this reward's scope.
   */
  public getOrderItemInReward(reward: PromotionReward, orderItem: OrderItemView): boolean {
    // EXCLUSIONS FIRST, short-circuiting the whole function at
    // [model/service/PromotionService.cfc:L953], as in the qualifier twin.
    let hasExcludedProductType = false;

    // [model/service/PromotionService.cfc:L927-L940] the product-type exclusion scan, computed
    // before the disjunction and consumed as its first operand.
    // [model/service/PromotionService.cfc:L928] `arrayLen(...)` as an explicit emptiness test.
    const excludedProductTypes: readonly ProductType[] = reward.getExcludedProductTypes();
    if (excludedProductTypes.length > 0) {
      // [model/service/PromotionService.cfc:L934-L939] flag-and-break in the legacy; the delegated
      // scan's boolean answer records it.
      hasExcludedProductType = productTypeIdPathIntersects(orderItem, excludedProductTypes);
    }

    // [model/service/PromotionService.cfc:L943-L954] the five-operand exclusion disjunction, in
    // legacy operand order. There is no item-price gate in this twin - a reward cannot be scoped
    // to a price band.
    if (
      hasExcludedProductType ||
      reward.hasExcludedProduct(requireProduct(orderItem)) ||
      reward.hasExcludedSku(orderItem.sku) ||
      rewardExcludesByBrand(reward, orderItem) ||
      reward.hasAnyExcludedOption(orderItem.sku.getOptions())
    ) {
      return false;
    }

    // [model/service/PromotionService.cfc:L958-L970] the product-type inclusion scan - same loop
    // shape as the exclusion scan, exiting by `return true` at
    // [model/service/PromotionService.cfc:L967] rather than by flag-and-break.
    const includedProductTypes: readonly ProductType[] = reward.getProductTypes();
    if (includedProductTypes.length > 0) {
      if (productTypeIdPathIntersects(orderItem, includedProductTypes)) {
        return true;
      }
    }

    // [model/service/PromotionService.cfc:L971-L982] four sequential inclusion tests, each with
    // its own early `return true` - four separate `if` statements in the legacy, not a chain and
    // not a disjunction.
    if (reward.hasProduct(requireProduct(orderItem))) {
      return true;
    }
    if (reward.hasSku(orderItem.sku)) {
      return true;
    }

    // [model/service/PromotionService.cfc:L977-L979] the brand inclusion, null test negated - the
    // polarity inversion against [model/service/PromotionService.cfc:L949]. A brandless product
    // can never be included.
    const brand = requireProduct(orderItem).getBrand();
    if (!isAbsent(brand) && reward.hasBrand(brand)) {
      return true;
    }
    if (reward.hasAnyOption(orderItem.sku.getOptions())) {
      return true;
    }

    // CFML parity [model/service/PromotionService.cfc:L918, L984] - the RESTRICTIVE DEFAULT. A
    // reward with no product types, no products, no skus, no brands and no options matches
    // nothing, so an "empty" reward discounts ZERO items.
    return false;
  }
}
