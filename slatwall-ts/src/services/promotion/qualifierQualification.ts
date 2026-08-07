/**
 * slatwall-ts - QUALIFIER QUALIFICATION: the three-way `qualifierType` dispatch that decides, for
 * one promotion qualifier, how MANY TIMES it qualifies and which fulfillments and order items it
 * qualifies.
 *
 * A one-to-one port of the private CFML helper `getQualifierQualificationDetails`
 * [model/service/PromotionService.cfc:L629-L750].
 *
 * ORDER [model/service/PromotionService.cfc:L638-L653] - assign 1, then revoke to 0. FULFILLMENT
 * [model/service/PromotionService.cfc:L656-L711] - count and append FIRST, then test and walk the
 * append back.
 *
 * The project standard is that every query uses prepared statements, preserving the injection
 * safety `cfqueryparam` provided.
 */

import type {
  AddressProjection,
  AddressZoneEvaluator,
  AddressZoneLocationProjection,
  AddressZoneProjection,
} from '../../domain/ports/addressZoneEvaluator.js';
import type { PromotionQualifier } from '../../domain/entities/promotionQualifier.js';
import type {
  QualifiedOrderItemDetail,
  QualifierQualification,
} from '../../domain/promotionEngine/qualificationTypes.js';
import type {
  OrderFulfillmentView,
  ShippingAddressView,
} from '../../domain/views/orderFulfillmentView.js';
import type { OrderItemView } from '../../domain/views/orderItemView.js';
import type { OrderView } from '../../domain/views/orderView.js';
import type { OrderItemMembership } from './orderItemMembership.js';
import { listFindNoCase } from '../../lib/cfml/list.js';
import { cfEquals } from '../../lib/cfml/struct.js';
import { isNullish } from '../../lib/cfml/truthiness.js';

// What is deliberately not imported, and why each omission is a decision.

// JUDGMENT CALL: the qualifier's shipping-address-zone collection reaches this module as OPAQUE
// IDENTIFIERS, so the value handed to the zone evaluator is modelled here rather than fetched.
//
// So the identifier is the only per-zone datum this module holds.
/**
 * One configured shipping address zone, as this module can address it.
 *
 * A zone that genuinely has no locations is not entered - the loop at
 * [model/service/AddressService.cfc:L60-L61] runs zero times.
 */
type ConfiguredShippingAddressZone = AddressZoneProjection;

/**
 * Project the qualifier's configured shipping-address-zone IDs onto the shape the evaluator port
 * accepts, preserving CARDINALITY and ORDER exactly.
 *
 * CFML parity [model/service/PromotionService.cfc:L672, L681, L703]: the source iterates
 * `arguments.qualifier.getShippingAddressZones()`, an array of `AddressZone` ENTITIES, and hands
 * each element straight to `isAddressInZone`.
 */
function toConfiguredShippingAddressZones(
  addressZoneIDs: readonly string[],
): readonly ConfiguredShippingAddressZone[] {
  return addressZoneIDs.map((addressZoneID) => {
    const addressZoneLocations: readonly AddressZoneLocationProjection[] = [];

    return { addressZoneID, addressZoneLocations };
  });
}

/**
 * A narrowing wrapper over the shared `isNullish()` port of CFML `isNull()`.
 *
 * The shared helper is declared `(value: unknown) => boolean`, which is right for a
 * general-purpose predicate but gives the compiler nothing to narrow with.
 *
 * A present value is a CONSTRAINT and an absent one imposes none - that polarity is the legacy's
 * at every bound, and it is why absence must be answered rather than defaulted away.
 */
function isPresent<TValue>(value: TValue | undefined): value is TValue {
  return !isNullish(value);
}

/**
 * Does the qualifier's type select the given dispatch arm, with case folded as CFML folds it?
 *
 * The subject is already coerced, which is why no absence guard appears here.
 *
 * @param qualifierType the qualifier's type, already coerced to `''` when absent.
 * @param arm the dispatch arm being tested, in the source's canonical spelling.
 * @returns `true` when the two are equal with case folded.
 */
function matchesQualifierType(qualifierType: string, arm: string): boolean {
  return cfEquals(qualifierType, arm);
}

/**
 * Project a fulfillment's shipping address onto the shape the zone evaluator declares.
 *
 * JUDGMENT CALL: the projection is built field by field instead of passing the view straight
 * through, because the two shipped contracts are not assignment-compatible under
 * `exactOptionalPropertyTypes`: `ShippingAddressView` declares each field `string | undefined`
 * while `AddressProjection` declares each one optional with type `string | null`.
 */
function toAddressProjection(address: ShippingAddressView): AddressProjection {
  return {
    postalCode: address.postalCode ?? null,
    city: address.city ?? null,
    stateCode: address.stateCode ?? null,
    countryCode: address.countryCode ?? null,
  };
}

/**
 * Read a fulfillment's address the way the legacy qualifier branch reads it: without A GUARD.
 *
 * CFML parity [model/service/PromotionService.cfc:L678, L684, L703]: the qualifier branch
 * dereferences `orderFulfillment.getAddress()` at three separate sites and guards it at none of
 * them.
 *
 * The `locator` argument names the legacy site being reproduced, so a raised error identifies
 * which of the three dereferences fired.
 */
function dereferenceFulfillmentAddress(
  orderFulfillment: OrderFulfillmentView,
  locator: string,
): ShippingAddressView {
  const address = orderFulfillment.address;

  if (!isPresent(address)) {
    throw new TypeError(
      `Unresolved fulfillment address for orderFulfillmentID ` +
        `"${orderFulfillment.orderFulfillmentID}". Reproduces the unguarded legacy dereference at ` +
        `model/service/PromotionService.cfc:${locator}, which raises a null reference when no ` +
        `address has been resolved.`,
    );
  }

  return address;
}

// JUDGMENT CALL: the exported unit is a class named `QualifierQualificationEvaluator`, not
// `QualifierQualification`.

// JUDGMENT CALL: the collaborating membership unit is received by CONSTRUCTOR INJECTION, and the
// sibling import that makes it possible is DIRECTIONAL rather than forbidden.
//
// `./orderItemMembership.ts` exports a single class carrying both verbatim-named membership
// methods and declares no constructor dependencies of its own.

/**
 * The qualifier-level qualification evaluator: one qualifier in, one verdict out.
 */
export class QualifierQualificationEvaluator {
  public constructor(
    /**
     * Address-zone membership. Replaces `getAddressService()` at
     * [model/service/PromotionService.cfc:L684].
     */
    private readonly addressZoneEvaluator: AddressZoneEvaluator,

    /**
     * Order-item membership. Replaces the same-component call at
     * [model/service/PromotionService.cfc:L727].
     */
    private readonly orderItemMembership: OrderItemMembership,
  ) {}

  /**
   * Decide how many times one promotion qualifier qualifies, and which fulfillments and order
   * items it qualifies.
   *
   * Ported from
   * `private struct function getQualifierQualificationDetails(required any qualifier, required any order)`
   * [model/service/PromotionService.cfc:L629].
   *
   * @param qualifier the qualifier being evaluated.
   * @param order the read-only order projection to evaluate it against.
   * @returns the qualifier's verdict, exactly as the legacy struct carried it.
   */
  public getQualifierQualificationDetails(
    qualifier: PromotionQualifier,
    order: OrderView,
  ): QualifierQualification {
    // The four-member seed [model/service/PromotionService.cfc:L630-L635], in source order.
    const qualifierDetails: QualifierQualification = {
      qualifier,
      qualificationCount: 0,
      qualifiedFulfillmentIDs: [],
      qualifiedOrderItemDetails: [],
    };

    // CFML parity [model/service/PromotionService.cfc:L638, L656, L714]: `getQualifierType()` is
    // read at all three dispatch sites and is captured once here.
    const qualifierType = qualifier.getQualifierType() ?? '';

    // `listFindNoCase` is kept for the third arm for the reason it always was: the source chose it
    // deliberately - `listFind` is case-sensitive in CFML, so the `NoCase` variant is a positive
    // instruction.
    if (matchesQualifierType(qualifierType, 'order')) {
      // CFML parity [model/service/PromotionService.cfc:L641, L652]: ASSIGN then REVOKE. The count
      // is set to 1 FIRST - the legacy comment reads "because that is the max for an order
      // qualifier" - and the four-clause disjunction then revokes it back to.
      qualifierDetails.qualificationCount = 1;

      // CFML parity [model/service/PromotionService.cfc:L644, L646, L648, L650]:
      // `getTotalSaleQuantity()` is read at L644 and L646 and `getSubtotal()` at L648 and L650;
      // each is captured once, before the disjunction, for determinism and readability.
      const totalSaleQuantity = order.totalSaleQuantity;
      const subtotal = order.subtotal;

      const minimumOrderQuantity = qualifier.getMinimumOrderQuantity();
      const maximumOrderQuantity = qualifier.getMaximumOrderQuantity();
      const minimumOrderSubtotal = qualifier.getMinimumOrderSubtotal();
      const maximumOrderSubtotal = qualifier.getMaximumOrderSubtotal();

      // CFML parity [model/service/PromotionService.cfc:L644, L646, L648, L650]: all four bounds
      // are strict and all four are null-guarded with `!isNull(x) &&...`.
      //
      // CFML parity [model/service/PromotionService.cfc:L644, L646, L648, L650]: the
      // money-versus-count census for this arm.
      if (
        (isPresent(minimumOrderQuantity) && minimumOrderQuantity > totalSaleQuantity) ||
        (isPresent(maximumOrderQuantity) && maximumOrderQuantity < totalSaleQuantity) ||
        (isPresent(minimumOrderSubtotal) && minimumOrderSubtotal.isGreaterThan(subtotal)) ||
        (isPresent(maximumOrderSubtotal) && maximumOrderSubtotal.isLessThan(subtotal))
      ) {
        qualifierDetails.qualificationCount = 0;
      }
    } else if (matchesQualifierType(qualifierType, 'fulfillment')) {
      this.evaluateFulfillmentArm(qualifier, order, qualifierDetails);

      // CFML parity [model/service/PromotionService.cfc:L714]: `listFindNoCase` returns a 1-BASED
      // INDEX or `0`, never A BOOLEAN, and L714 consumes it as bare CFML truthiness. The port
      // compares the index explicitly against `0`.
    } else if (listFindNoCase('contentAccess,merchandise,subscription', qualifierType) > 0) {
      this.evaluateOrderItemArm(qualifier, order, qualifierDetails);
    }

    // LEGACY-NOTE [model/service/PromotionService.cfc:L747]: there is no final `else`.

    return qualifierDetails;
  }

  /**
   * The fulfillment arm [model/service/PromotionService.cfc:L656-L711].
   *
   * Every fulfillment on the order is COUNTED and APPENDED FIRST and only afterwards tested; a
   * fulfillment that fails the test has its count and its ID walked back.
   *
   * @param qualifier the qualifier being evaluated.
   * @param order the read-only order projection.
   * @param qualifierDetails the verdict accumulator, mutated in place exactly as the source
   * mutates its struct.
   */
  private evaluateFulfillmentArm(
    qualifier: PromotionQualifier,
    order: OrderView,
    qualifierDetails: QualifierQualification,
  ): void {
    // The array is cleared by CONTENT rather than replaced by a fresh literal.
    qualifierDetails.qualificationCount = 0;
    qualifierDetails.qualifiedFulfillmentIDs.length = 0;
    const configuredShippingAddressZones = toConfiguredShippingAddressZones(
      qualifier.getShippingAddressZoneIDs(),
    );
    const configuredFulfillmentMethodIDs = qualifier.getFulfillmentMethodIDs();
    const configuredShippingMethodIDs = qualifier.getShippingMethodIDs();
    const minimumFulfillmentWeight = qualifier.getMinimumFulfillmentWeight();
    const maximumFulfillmentWeight = qualifier.getMaximumFulfillmentWeight();

    // [model/service/PromotionService.cfc:L663] A CFML `for(var x in array)` iterates VALUES, so
    // this is an ordinary `for...of`.
    for (const orderFulfillment of order.orderFulfillments) {
      // CFML parity [model/service/PromotionService.cfc:L665-L666, L707-L709]: count and append
      // before testing.
      qualifierDetails.qualificationCount++;
      qualifierDetails.qualifiedFulfillmentIDs.push(orderFulfillment.orderFulfillmentID);

      // CFML parity [model/service/PromotionService.cfc:L669, L675, L685, L693]: the source
      // declares this flag as `addressZoneOK` (capital K) at L669, then writes it at L675 and L685
      // and reads it at L693 as `addressZoneOk` (lower-case k).
      let addressZoneOk = true;
      if (configuredShippingAddressZones.length > 0) {
        // [model/service/PromotionService.cfc:L675] By default, if there were address zones then
        // the flag must start false.
        addressZoneOk = false;

        // CFML parity [model/service/PromotionService.cfc:L678]: the precondition is compound and
        // short-circuiting, and all four of its details matter.
        if (
          cfEquals(orderFulfillment.fulfillmentMethod.fulfillmentMethodType, 'shipping') &&
          !dereferenceFulfillmentAddress(orderFulfillment, 'L678').isNew
        ) {
          // [model/service/PromotionService.cfc:L681-L688] Loop over each configured zone and
          // check whether this address is in one.
          for (const shippingAddressZone of configuredShippingAddressZones) {
            // [model/service/PromotionService.cfc:L684] The port call is POSITIONAL with two
            // arguments, address first, zone second, exactly as
            // `getAddressService().isAddressInZone(...)` is called by the source.
            if (
              this.addressZoneEvaluator.isAddressInZone(
                toAddressProjection(dereferenceFulfillmentAddress(orderFulfillment, 'L684')),
                shippingAddressZone,
              )
            ) {
              // [model/service/PromotionService.cfc:L685-L686] If found, set to true and STOP
              // LOOPING. The early exit is the source's and is preserved: a later zone can neither
              // undo nor re-confirm a match.
              addressZoneOk = true;
              break;
            }
          }
        }
      }

      // [model/service/PromotionService.cfc:L693] Now that the address-zone verdict is known,
      // everything else is checked.
      //
      // CFML parity [model/service/PromotionService.cfc:L695, L697]: the fulfillment weight bounds
      // are plain numerics, not money.
      const totalShippingWeight = orderFulfillment.totalShippingWeight;

      // CFML parity [model/service/PromotionService.cfc:L701, L703]: `getShippingMethod()` is read
      // three times by the source - twice at L701 and once at L703 - and is captured once here for
      // DETERMINISM and READABILITY.
      const shippingMethod = orderFulfillment.shippingMethod;

      // CFML parity [model/service/PromotionService.cfc:L699, L701] and
      // [org/Hibachi/HibachiEntity.cfc:L340-L350]: the "configured list gates a negative
      // membership test" shape.
      //
      // CFML parity [model/service/PromotionService.cfc:L701, L703]: the null-guard asymmetry is
      // the source's and is preserved on both sides.
      if (
        !addressZoneOk ||
        (isPresent(minimumFulfillmentWeight) && minimumFulfillmentWeight > totalShippingWeight) ||
        (isPresent(maximumFulfillmentWeight) && maximumFulfillmentWeight < totalShippingWeight) ||
        // [model/service/PromotionService.cfc:L699] A configured fulfillment-method list that
        // omits this fulfillment's method excludes it.
        (configuredFulfillmentMethodIDs.length > 0 &&
          !configuredFulfillmentMethodIDs.includes(
            orderFulfillment.fulfillmentMethod.fulfillmentMethodID,
          )) ||
        // [model/service/PromotionService.cfc:L701] The shipping-method clause, with the source's
        // explicit absence guard: an absent shipping method on a fulfillment excludes it as surely
        // as a non-matching one does.
        (configuredShippingMethodIDs.length > 0 &&
          (!isPresent(shippingMethod) ||
            !configuredShippingMethodIDs.includes(shippingMethod.shippingMethodID))) ||
        // LEGACY-DEFECT [model/service/PromotionService.cfc:L703]: the shipping-address-ZONES
        // clause re-tests hasShippingMethod instead of a zone condition; because hasShippingMethod
        // returns false against an empty collection.
        // Preserved deliberately; do not fix without a product decision.
        (configuredShippingAddressZones.length > 0 &&
          (dereferenceFulfillmentAddress(orderFulfillment, 'L703').isNew ||
            !(
              isPresent(shippingMethod) &&
              configuredShippingMethodIDs.includes(shippingMethod.shippingMethodID)
            )))
      ) {
        // [model/service/PromotionService.cfc:L707] The decrement. The source's comment above it
        // reads "Set the qualification count to the total fulfillments"; see the artifact note on
        // this method.
        qualifierDetails.qualificationCount--;

        // CFML parity [model/service/PromotionService.cfc:L708-L709]: `arrayFind` returns a
        // 1-BASED index on a hit and `0` on a miss, and its result is consumed directly as a
        // position - it is never a boolean.
        const zeroBasedIndex = qualifierDetails.qualifiedFulfillmentIDs.indexOf(
          orderFulfillment.orderFulfillmentID,
        );
        const di = zeroBasedIndex + 1;

        if (di === 0) {
          throw new RangeError(
            `arrayDeleteAt index out of range for orderFulfillmentID ` +
              `"${orderFulfillment.orderFulfillmentID}". Reproduces the latent CFML failure at ` +
              `model/service/PromotionService.cfc:L708-L709, where arrayFind answers 0 for an ` +
              `absent element and arrayDeleteAt raises on index 0.`,
          );
        }

        qualifierDetails.qualifiedFulfillmentIDs.splice(di - 1, 1);
      }
    }
  }

  /**
   * The ORDER ITEM arm [model/service/PromotionService.cfc:L714-L745], reached for the
   * `contentAccess`, `merchandise` and `subscription` qualifier types.
   *
   * Every order item is offered to the membership test; only the ones that pass contribute a
   * record and a quantity.
   *
   * @param qualifier the qualifier being evaluated.
   * @param order the read-only order projection.
   * @param qualifierDetails the verdict accumulator, mutated in place.
   */
  private evaluateOrderItemArm(
    qualifier: PromotionQualifier,
    order: OrderView,
    qualifierDetails: QualifierQualification,
  ): void {
    // [model/service/PromotionService.cfc:L717] The count is re-zeroed.
    qualifierDetails.qualificationCount = 0;

    // [model/service/PromotionService.cfc:L718] The running total of qualifying item quantity. A
    // PLAIN COUNT: it is never routed through `Money`, and neither is `qualificationCount`.
    let qualifiedItemsQuantity = 0;

    // [model/service/PromotionService.cfc:L720] A CFML `for(var x in array)` over the order's
    // items, iterating VALUES.
    const orderItems: readonly OrderItemView[] = order.orderItems;

    for (const orderItem of orderItems) {
      // CFML parity [model/service/PromotionService.cfc:L727, L733]: only qualifying items are
      // appended. L733 sits inside the L727 gate, so a non-qualifying item produces a record that
      // is silently discarded.
      if (this.orderItemMembership.getOrderItemInQualifier(qualifier, orderItem)) {
        // CFML parity [model/service/PromotionService.cfc:L729-L730]: `getQuantity()` is read
        // twice by the source - once to set the record's count and once to add to the running
        // total - and is captured once here for DETERMINISM and READABILITY.
        const qualifyingQuantity = orderItem.quantity;

        // LEGACY-NOTE [model/service/PromotionService.cfc:L722-L725, L729]: two structural changes
        // here, both observationally identical, both deliberate.
        const orderItemDetail: QualifiedOrderItemDetail = {
          orderItem,
          qualificationCount: qualifyingQuantity,
        };
        qualifiedItemsQuantity += qualifyingQuantity;

        // [model/service/PromotionService.cfc:L733] Add this order item to the array.
        qualifierDetails.qualifiedOrderItemDetails.push(orderItemDetail);
      }
    }

    // [model/service/PromotionService.cfc:L740] The source's `gt` is the CFML word operator and
    // becomes strict `>` on a plain integer count, never a `Money` comparison.
    if (qualifiedItemsQuantity > 0) {
      const minimumItemQuantity = qualifier.getMinimumItemQuantity();

      // CFML parity [model/service/PromotionService.cfc:L742]: a null minimumItemQuantity leaves
      // qualificationCount at 0 (RESTRICTIVE). The structurally parallel guard at L830, owned
      // by./promotionPeriodQualification.ts, has the opposite PERMISSIVE polarity.
      if (isPresent(minimumItemQuantity)) {
        // CFML parity [model/service/PromotionService.cfc:L743]: CFML throws on division by zero;
        // JavaScript yields Infinity. The throw is reproduced so a zero minimumItemQuantity fails
        // as it does in legacy.
        if (minimumItemQuantity === 0) {
          throw new RangeError(
            `Division by zero computing qualifier qualification count: minimumItemQuantity is 0. ` +
              `Reproduces the CFML failure at model/service/PromotionService.cfc:L743, where a zero ` +
              `divisor raises rather than yielding Infinity.`,
          );
        }

        // [model/service/PromotionService.cfc:L743] `int()` truncates toward zero - it does not
        // round - so `Math.trunc` is the only correct translation.
        //
        // Both operands are plain integer counts, so E4 does not apply: this is plain arithmetic,
        // and it is deliberately not routed through `Money`, `precision.ts` or `numberFormat.ts`.
        qualifierDetails.qualificationCount = Math.trunc(
          qualifiedItemsQuantity / minimumItemQuantity,
        );
      }
    }
  }
}
