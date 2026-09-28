/**
 * Read-only order-item shape: the anti-corruption boundary between the ported promotion and
 * price-group engines and the Order aggregate, which stays in CFML.
 *
 * `model/entity/OrderItem.cfc` was read for its ORM type declarations and for nothing else.
 *
 * Parameterized SQL: not applicable here - stated rather than silently omitted.
 *
 * JUDGMENT CALL: a value the legacy schema permits to be absent is modelled as a REQUIRED member
 * whose type includes `undefined`, never as an optional `?:` member.
 */

import type { Money } from '../valueObjects/money.js';
import type { Sku } from '../entities/sku.js';
import type { PriceGroup } from '../entities/priceGroup.js';
import type { AppliedPromotionView } from './orderFulfillmentView.js';

/**
 * The order item's type, reduced to the single field the engine reads.
 *
 * CFML parity [model/entity/OrderItem.cfc:L61]: the legacy association is to the generic `Type`
 * entity, and its full declaration is.
 *
 * `Type` is out of scope, and the promotion engine reads exactly one field from it - the system
 * code, compared against the literal `"oitSale"` at [model/service/PromotionService.cfc:L206].
 */
interface OrderItemTypeView {
  /**
   * The type's system code.
   *
   * CFML parity [model/service/PromotionService.cfc:L206]:
   * `orderItem.getOrderItemType().getSystemCode() == "oitSale"` is the gate that admits an item to
   * the merchandise reward branch.
   */
  readonly systemCode: string;
}

/**
 * One order item, as the promotion and price-group engines read it.
 *
 * And the "REPLACES rather than reproduces" premise does not hold either.
 */
export interface OrderItemView {
  /**
   * The item's opaque identifier. [model/entity/OrderItem.cfc:L52]
   *
   * It is also what the applied-promotion intent is emitted against.
   */
  readonly orderItemID: string;

  /**
   * The SKU being sold, as the real `Sku` entity class - not a stand-in and not a projection.
   *
   * `fetch="join"` records that the legacy mapping resolved this association together with the
   * item, so carrying it already materialized is fidelity to the legacy shape rather than a
   * departure from it.
   *
   * The real class is required because the engine walks a deep graph through it and every hop is a
   * method on a ported entity.
   */
  readonly sku: Sku;

  /**
   * How many units of the SKU this item covers.
   *
   * Downstream it is the multiplicand on both sides of the discount arithmetic -
   * `precisionEvaluate('arguments.price * arguments.quantity')`
   * [model/service/PromotionService.cfc:L990] and `reward.getAmount() * quantity`
   * [model/service/PromotionService.cfc:L998].
   */
  readonly quantity: number;

  /**
   * The unit price actually charged, which may already be a price-group price.
   *
   * CFML parity [model/entity/OrderItem.cfc:L53-L54]: `price` and `skuPrice` are declared
   * `ormtype="big_decimal"` with no `default="0"`, whereas `listPrice`, `price` and `renewalPrice`
   * on the SKU all do declare `default="0"` [model/entity/Sku.cfc:L55-L57].
   */
  readonly price: Money;

  /**
   * The SKU's own unit price, before any price group was applied.
   */
  readonly skuPrice: Money;

  /**
   * The extended charged amount: unit price times quantity.
   *
   * The subtrahend of the second arm's correction term [model/service/PromotionService.cfc:L252].
   *
   * CFML parity [model/entity/OrderItem.cfc:L200]: computed on the legacy entity as
   * `precisionEvaluate('getPrice() * val(getQuantity())')`, declared non-persistent at
   * [model/entity/OrderItem.cfc:L89].
   */
  readonly extendedPrice: Money;

  /**
   * The extended SKU amount: SKU unit price times quantity.
   *
   * The minuend of the second arm's correction term [model/service/PromotionService.cfc:L252].
   *
   * CFML parity [model/entity/OrderItem.cfc:L204]: computed on the legacy entity as
   * `precisionEvaluate('getSkuPrice() * getQuantity()')`.
   */
  readonly extendedSkuPrice: Money;

  /**
   * The price group whose rate produced `price`, or `undefined` when none did.
   *
   * `undefined` means not price-group eligible, and this member is the discriminator at
   * [model/service/PromotionService.cfc:L241]: `isNull(orderItem.getAppliedPriceGroup())` selects
   * the `price` arm outright.
   *
   * Declared as a REQUIRED member whose type includes `undefined`, not as an optional `?:` member.
   */
  readonly appliedPriceGroup: PriceGroup | undefined;

  /**
   * The item's type, carrying only the system code the engine tests.
   */
  readonly orderItemType: OrderItemTypeView;

  /**
   * The owning fulfillment's opaque identifier.
   *
   * OPAQUE, and a deliberate structural decision rather than an omission.
   *
   * Because only the identifier is read, this member is a plain `string` and not a nested
   * `OrderFulfillmentView`.
   */
  readonly orderFulfillmentID: string;

  /**
   * The applied-promotion records this item is carrying when the engine receives it - that is,
   * whatever a PREVIOUS invocation left behind. Not the records this invocation will produce.
   *
   * `removeOrderItem()` [model/entity/PromotionApplied.cfc:L103] `arrayDeleteAt`s from this very
   * association, so in the legacy the clear is a side effect on a live ORM graph.
   */
  readonly appliedPromotions: readonly AppliedPromotionView[];
}
