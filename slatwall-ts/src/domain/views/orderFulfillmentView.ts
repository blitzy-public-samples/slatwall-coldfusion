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
 * A promotion already applied to the fulfillment - one persisted `SwPromotionApplied` ROW.
 *
 * ★★ THIS SHAPE IS A ROW, AND IT NOW CARRIES THE ROW'S OWN IDENTITY. Read
 * [model/entity/PromotionApplied.cfc:L52-L58] as the authority for all three members below:
 *
 *     property name="promotionAppliedID" ormtype="string" length="32" fieldtype="id"
 *              generator="uuid" unsavedvalue="" default="";
 *     property name="discountAmount" ormtype="big_decimal";
 *     property name="promotion" cfc="Promotion" fieldtype="many-to-one" fkcolumn="promotionID";
 *
 * The id field is REQUIRED and generated; the other two declare no `notnull`, so both are NULLABLE
 * in the schema this port must keep reading and writing unchanged [AAP 0.8.1, schema continuity].
 *
 * ★ QUOTE-THEN-REVISE. This interface previously declared exactly two members - a non-nullable
 * `discountAmount: Money` and a non-nullable `promotion` - and documented the second one like this:
 * "Opaque identifier for the promotion association declared at
 * [model/entity/PromotionApplied.cfc:L58]; the mapping does not declare it required." That sentence
 * was correct and the type contradicted it in the same breath: it recorded that the mapping permits
 * absence and then required presence anyway. The omission of `promotionAppliedID` was never
 * justified at all.
 *
 * WHAT THE CONTRADICTION COST, CONCRETELY. The blanket clear at
 * [model/service/PromotionService.cfc:L61-L80] detaches EVERY previously applied row before any
 * qualification runs, and it does so by calling `removeOrderItem()` / `removeOrderFulfillment()` /
 * `removeOrder()` ON THE ROW OBJECT ITSELF, reached by reverse index. It reads neither
 * `getPromotion()` nor `getDiscountAmount()` while doing it - the row's own identity is the entire
 * address. A projection that omitted the id therefore forced the ported clear to re-derive an
 * address from `(appliedType, target ID, promotionID)`, which is strictly weaker than what it
 * replaced in two ways that both leave money on the order:
 *
 *   * TWO ROWS FOR THE SAME PROMOTION ON THE SAME TARGET collapse into two indistinguishable
 *     instructions. Legacy detaches both, because it visits both elements.
 *   * A ROW WHOSE `promotion` FK IS NULL cannot be addressed at all, and could not even be
 *     REPRESENTED here - so no fixture could build one and no consumer could clear one. Such a row
 *     is not hypothetical: `removePromotion` at [model/entity/PromotionApplied.cfc:L85-L94] ends with
 *     `structDelete(variables, "promotion")`, which is the legacy itself producing one.
 *
 * Either way a stale discount survives a recalculation that no longer qualifies it. Carrying the id
 * is therefore not an enhancement over the legacy contract - it is a return to it.
 */
export interface AppliedPromotionView {
  /**
   * The row's own opaque identity [model/entity/PromotionApplied.cfc:L52].
   *
   * REQUIRED, because every row a read projection publishes has been persisted and so has been
   * assigned its generated uuid. The mapping's `unsavedvalue=""` / `default=""` names the sentinel an
   * UNSAVED entity carries before Hibernate assigns one; a row that reached this view is by
   * construction not in that state. The distinction is load-bearing one layer out - see
   * `PromotionAppliedIntent` in `../promotionEngine/qualifiedDiscountTypes.ts`, where an unsaved row
   * is exactly what separates a persisted-row removal from a provisional cancellation.
   *
   * Opaque: compared and carried, never parsed.
   */
  readonly promotionAppliedID: string;

  /**
   * The amount already discounted, or `undefined` when the row records none.
   *
   * NULLABLE [model/entity/PromotionApplied.cfc:L53]: `ormtype="big_decimal"` with no `notnull`, and
   * `Money` offers no zero fallback - defaulting an absent amount to zero would assert that the row
   * discounted nothing, which is a different claim from recording no amount.
   *
   * The reader that matters is the same-promotion comparison at
   * [model/service/PromotionService.cfc:L385, L431], which dereferences
   * `getAppliedPromotions()[1].getDiscountAmount()` UNGUARDED. Legacy therefore fails on a null
   * amount reaching that comparison, and a consumer reproducing it must narrow rather than default:
   * substituting zero would silently make the existing discount look smaller than every candidate
   * and hand the target a discount legacy never applied.
   */
  readonly discountAmount: Money | undefined;

  /**
   * Opaque identifier for the promotion association declared at
   * [model/entity/PromotionApplied.cfc:L58], or `undefined` when the row has no promotion.
   *
   * NULLABLE, because the mapping declares no `notnull` AND because
   * [model/entity/PromotionApplied.cfc:L85-L94] `removePromotion` explicitly `structDelete`s the
   * association - the legacy produces such rows itself.
   *
   * The identifier is compared for equality at [model/service/PromotionService.cfc:L388] and never
   * dereferenced into a Promotion. That comparison is likewise unguarded in the source, so a null
   * promotion reaching it fails in legacy too.
   */
  readonly promotion:
    | {
        readonly promotionID: string;
      }
    | undefined;
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
