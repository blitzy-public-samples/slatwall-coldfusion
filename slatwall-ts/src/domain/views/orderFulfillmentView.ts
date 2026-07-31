/**
 * Read-only order-fulfillment shapes: the anti-corruption boundary between the ported
 * promotion engine and the Order aggregate, which stays in CFML.
 *
 * `PromotionService.updateOrderAmountsWithPromotions` takes an Order
 * [model/service/PromotionService.cfc:L58], but the Order, OrderItem and
 * OrderFulfillment entities are out of scope. These interfaces carry exactly the
 * fulfillment state the engine reads, and nothing that would let it write.
 *
 * JUDGMENT CALL: a value the legacy schema permits to be absent is modelled as a
 * REQUIRED member whose type includes `undefined`, not as an optional member, because
 * `exactOptionalPropertyTypes` is enabled and the caller must state the absence rather
 * than omit the key.
 */

import type { Money } from '../valueObjects/money.js';

/**
 * The four address fields the promotion qualifiers read, plus the unsaved flag.
 *
 * The CFML ORM mapping does not declare these values required
 * [model/entity/Address.cfc:L59-L62], so the target projection permits `undefined` for
 * each of them.
 */
export interface ShippingAddressView {
  readonly postalCode: string | undefined;

  readonly city: string | undefined;

  readonly stateCode: string | undefined;

  readonly countryCode: string | undefined;

  /**
   * Whether the address is unsaved.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L360, L678, L703]: the legacy code reads this flag through two framework accessors - `isNew()` [org/Hibachi/HibachiEntity.cfc:L707] in the reward branch and `getNewFlag()` [org/Hibachi/HibachiEntity.cfc:L571] in the qualifier branches - and only the reward branch first tests that the address exists at all.
   * Retained to preserve the cited legacy behavior.
   */
  readonly isNew: boolean;
}

/**
 * The fulfillment method's identity and type.
 */
export interface FulfillmentMethodView {
  readonly fulfillmentMethodID: string;

  // CFML parity [model/service/PromotionService.cfc:L678]: compared against the literal
  // "shipping", so the raw type string is carried rather than a narrowed union.
  readonly fulfillmentMethodType: string;
}

/**
 * The shipping method, reduced to its identifier: the legacy code only ever tests
 * membership of a reward's or qualifier's shipping-method collection
 * [model/service/PromotionService.cfc:L355, L701].
 */
export interface ShippingMethodView {
  readonly shippingMethodID: string;
}

/**
 * A promotion already applied to the fulfillment.
 */
export interface AppliedPromotionView {
  readonly discountAmount: Money;

  /**
   * Opaque identifier for the promotion association declared at
   * [model/entity/PromotionApplied.cfc:L58]; the mapping does not declare it required.
   * The identifier is compared for equality at
   * [model/service/PromotionService.cfc:L388] and never dereferenced into a Promotion.
   */
  readonly promotion: {
    readonly promotionID: string;
  };
}

/**
 * One fulfillment, as the promotion engine reads it.
 */
export interface OrderFulfillmentView {
  // Opaque identifier [model/entity/OrderFulfillment.cfc:L52]. The engine collects and
  // compares these IDs [model/service/PromotionService.cfc:L351, L560, L666] and emits
  // them on its applied-promotion intents; it never loads the entity behind one.
  readonly orderFulfillmentID: string;

  /**
   * The fulfillment charge, and the base the fulfillment-level discount is computed from
   * at [model/service/PromotionService.cfc:L373].
   *
   * The ORM mapping permits absence [model/entity/OrderFulfillment.cfc:L53]; no
   * independent physical DDL is available in this repository. The member is non-nullable
   * here because every in-scope reader dereferences it unguarded, and `Money` offers no
   * zero fallback: a defaulted amount would discount from a base of nothing.
   */
  readonly fulfillmentCharge: Money;

  // Non-nullable: read unguarded at [model/service/PromotionService.cfc:L678].
  readonly fulfillmentMethod: FulfillmentMethodView;

  // The CFML ORM mapping does not declare this value required
  // [model/entity/OrderFulfillment.cfc:L65], so the target projection permits `undefined`;
  // the legacy reads test for absence explicitly
  // [model/service/PromotionService.cfc:L355, L701].
  readonly shippingMethod: ShippingMethodView | undefined;

  // LEGACY-NOTE [model/service/PromotionService.cfc:L388]: the legacy code indexes element 1 of this collection without first checking that it has any members.
  // Retained to preserve the cited legacy behavior.
  readonly appliedPromotions: readonly AppliedPromotionView[];

  /**
   * Total shipping weight, as the minimum and maximum fulfillment-weight qualifiers read
   * it [model/service/PromotionService.cfc:L695, L697, L769, L771].
   *
   * CFML parity [model/entity/OrderFulfillment.cfc:L317-L326]: a derived accessor that
   * sums each item's converted weight, not a column. It is a plain `number` because it is
   * a weight rather than an amount of money.
   */
  readonly totalShippingWeight: number;

  /**
   * The fulfillment's address, or `undefined` when the view's producer resolved none.
   *
   * CFML parity [model/entity/OrderFulfillment.cfc:L125-L144]: legacy `getAddress()`
   * returns the shipping address, else copies the account address, else creates a new
   * Address; it does not return undefined. Its middle arm WRITES the copied address back
   * onto the fulfillment, which is exactly the hidden mutation a read-only view exists to
   * exclude - so resolving the address belongs to whatever constructs this view, and the
   * legacy "no real address yet" case surfaces here either as `undefined` or as a view
   * whose `isNew` is true.
   */
  readonly address: ShippingAddressView | undefined;
}
