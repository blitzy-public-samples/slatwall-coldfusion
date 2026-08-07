// slatwall-ts - the mutable qualified-discount accumulator `updateOrderAmountsWithPromotions`
// builds while deciding which discount wins on each order item, and the applied-promotion intents
// the ported engine returns in place of mutating the order aggregate.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L82-L133]: that range is the illustrative block
// comment describing the accumulator, and the misspelled key appears inside it at L121. The live
// declaration is L142, populated at L152, L155 and L262.
import type { Promotion } from '../entities/promotion.js';
import type { Money } from '../valueObjects/money.js';

/**
 * One potential discount on one order item, as the engine accumulates it.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L82-L133]: the legacy accumulator this record
 * lives in is spelled `orderItemQulifiedDiscounts`, missing the `a` in "Qualified"; the target
 * uses the corrected spelling.
 */
export interface QualifiedDiscount {
  /**
   * The reward that produced this discount, or the empty string for a sale price.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L155-L159]: the sale-price seed appends a
   * record whose `promotionRewardID` is the EMPTY STRING (L156), because a sale price comes from a
   * promotion but from no reward.
   *
   * Typed as a plain `string` that admits `''` - not branded, not optional, not
   * `string | undefined`.
   */
  readonly promotionRewardID: string;

  /**
   * The promotion this discount belongs to - the ENTITY, not an identifier.
   *
   * Read back at [model/service/PromotionService.cfc:L532] to populate the applied-promotion
   * record.
   */
  readonly promotion: Promotion;
  discountAmount: Money;
}

/**
 * The accumulator itself: every potential discount on every order item, keyed by order item.
 *
 * CFML parity [model/service/PromotionService.cfc:L152, L260-L263]: the assign-versus-lazy-init
 * asymmetry between modes 1 and 2 is reproduced as written.
 *
 * CFML parity [model/service/PromotionService.cfc:L271]: the comparison is strictly `<`, so on an
 * exact tie the incumbent keeps its earlier position - first-in wins.
 */
export type OrderItemQualifiedDiscounts = Record<string, QualifiedDiscount[]>;

/**
 * The one member every applied-promotion intent carries, whatever its target level and whatever
 * its operation.
 *
 * Deliberately not exported: consumers work with `PromotionAppliedIntent` and the three operation
 * unions below, and the project keeps its exported surface to exactly what a consumer needs.
 */
interface PromotionAppliedIntentPromotion {
  /**
   * The promotion being applied, as an OPAQUE identifier.
   *
   * JUDGMENT CALL: the legacy calls `setPromotion(entity)` with a live Promotion
   * [model/service/PromotionService.cfc:L403, L449, L532], but a write-side instruction crossing
   * into the repository layer must not carry a live domain entity - it would drag an object graph,
   * and lazy-load expectations with it.
   */
  readonly promotionID: string;
}

// The three target shapes.
//
// Each pairs one `appliedType` literal with the one opaque identifier that names a target at that
// level, and forbids the other two identifiers outright by typing them `?: never`.
//
// The UNION of the three literals is owned by `src/domain/entities/promotionApplied.ts`, which
// declares `PromotionAppliedType` for the `SwPromotionApplied.appliedType` column. It is not
// re-declared here: the literals below are what the discriminated union needs, and a second
// declaration of the same union would leave the type with no single owner.

/**
 * The ORDER level: `appliedType: 'order'`, addressed by `orderID`.
 *
 * CFML parity [model/service/PromotionService.cfc:L448, L450]: `setAppliedType('order')` is
 * immediately followed by `setOrder( arguments.order )`, so the literal and the target arrive
 * together and neither is meaningful without the other.
 */
interface OrderTargetedIntent {
  readonly appliedType: 'order';

  /**
   * The order this intent addresses. Required at this level.
   */
  readonly orderID: string;

  readonly orderItemID?: never;
  readonly orderFulfillmentID?: never;
}

/**
 * The order-item level: `appliedType: 'orderItem'`, addressed by `orderItemID`.
 *
 * CFML parity [model/service/PromotionService.cfc:L531, L533]: `setAppliedType('orderItem')` is
 * paired with `setOrderItem( orderItem )` in the same construction block.
 */
interface OrderItemTargetedIntent {
  readonly appliedType: 'orderItem';

  /**
   * The order item this intent addresses. Required at this level.
   */
  readonly orderItemID: string;

  readonly orderID?: never;
  readonly orderFulfillmentID?: never;
}

/**
 * The fulfillment level: `appliedType: 'orderFulfillment'`, addressed by `orderFulfillmentID`.
 *
 * CFML parity [model/service/PromotionService.cfc:L402, L404]:
 * `setAppliedType('orderFulfillment')` is paired with `setOrderFulfillment( orderFulfillment )`.
 */
interface OrderFulfillmentTargetedIntent {
  readonly appliedType: 'orderFulfillment';

  /**
   * The fulfillment this intent addresses. Required at this level.
   */
  readonly orderFulfillmentID: string;

  readonly orderID?: never;
  readonly orderItemID?: never;
}

// The three operation shapes.
//
// LEGACY-NOTE [model/entity/PromotionApplied.cfc:L55]: `currencyCode ormtype="string" length="3"`
// is a real persisted column, yet `setCurrencyCode` has ZERO occurrences in the whole of
// model/service/PromotionService.cfc (verified by census).

/**
 * Create a new applied-promotion record.
 */
interface AddOperationIntent {
  readonly operation: 'add';

  /**
   * REQUIRED on an add: the legacy calls `setDiscountAmount` on all three construction paths
   * (L405, L451, L534), so an add without an amount is not expressible.
   */
  readonly discountAmount: Money;

  /**
   * FORBIDDEN on an add: the row does not exist yet, so there is no row identity to name.
   */
  readonly promotionAppliedID?: never;
}

/**
 * Raise the discount on the applied-promotion record already on the target, because the same
 * promotion now yields more.
 */
interface UpdateOperationIntent {
  readonly operation: 'update';

  /**
   * REQUIRED on an update: raising the discount is the entire operation.
   */
  readonly discountAmount: Money;

  /**
   * FORBIDDEN on an update, and this is the one `?: never` here that is a genuine JUDGMENT CALL
   * rather than a restatement of the schema. The row an update raises is persisted, so it does
   * have a `promotionAppliedID` - but the legacy does not address it by one.
   */
  readonly promotionAppliedID?: never;
}

/**
 * Detach an applied-promotion record from the target - either because a DIFFERENT promotion now
 * yields more and will be added in its place.
 *
 * The blanket clear, at the very top of the engine [model/service/PromotionService.cfc:L61-L80].
 *
 * `discountAmount` is FORBIDDEN on this operation, declared `?: never` rather than simply left
 * out.
 */
interface RemoveOperationIntent {
  readonly operation: 'remove';

  readonly discountAmount?: never;
}

/**
 * A remove that detaches a row ALREADY in the DATABASE, addressed by that row's own identity.
 *
 * This is origin 1 - the blanket clear at [model/service/PromotionService.cfc:L61-L80].
 *
 * DUPLICATE ROWS - two rows for one promotion on one target produce two identical triples, and a
 * consumer cannot tell it was asked to detach two things.
 */
interface PersistedRowRemovalIntent extends RemoveOperationIntent {
  /**
   * The row to detach [model/entity/PromotionApplied.cfc:L52]. Opaque; carried, never parsed.
   */
  readonly promotionAppliedID: string;

  /**
   * The promotion the row points at, or `undefined` when it points at none.
   */
  readonly promotionID: string | undefined;
}

/**
 * A remove that CANCELS A ROW this same PASS CREATED and has not persisted - no durable identity
 * to address, because none has been assigned yet.
 *
 * This is origin 2 - the same-promotion else-arm at
 * [model/service/PromotionService.cfc:L393, L439], each immediately followed by `addNew = true`
 * (L394, L440).
 *
 * A consumer distinguishes the two kinds by presence -
 * `if (intent.promotionAppliedID !== undefined)` - with no extra discriminant field.
 */
interface ProvisionalCancellationIntent extends RemoveOperationIntent {
  readonly promotionAppliedID?: never;
}

/**
 * Create a new applied-promotion record at one of the three levels.
 */
export type AddPromotionAppliedIntent = PromotionAppliedIntentPromotion &
  AddOperationIntent &
  (OrderTargetedIntent | OrderItemTargetedIntent | OrderFulfillmentTargetedIntent);

/**
 * Raise the discount on an existing applied-promotion record.
 *
 * Do not infer from this that the item level is add-only - it also has a `remove`, reproducing the
 * blanket clear at L64-L68.
 */
export type UpdatePromotionAppliedIntent = PromotionAppliedIntentPromotion &
  UpdateOperationIntent &
  (OrderTargetedIntent | OrderFulfillmentTargetedIntent);

/**
 * Detach an existing applied-promotion record.
 *
 * Three exact variants - order, order item and fulfillment - carrying no amount at any of them.
 *
 * Asymmetry is not an inconsistency; the two operations answer to different legacy code.
 */
export type RemovePromotionAppliedIntent =
  | (PersistedRowRemovalIntent &
      (OrderTargetedIntent | OrderItemTargetedIntent | OrderFulfillmentTargetedIntent))
  | (PromotionAppliedIntentPromotion &
      ProvisionalCancellationIntent &
      (OrderTargetedIntent | OrderItemTargetedIntent | OrderFulfillmentTargetedIntent));

/**
 * One instruction from the promotion engine to whatever owns applied-promotion persistence - the
 * write-side output of
 * `updateOrderAmountsWithPromotions(order: OrderView): Promise<PromotionAppliedIntent[]>`.
 *
 * LEGACY-NOTE
 * [model/service/PromotionService.cfc:L389, L393, L400-L405, L435, L439, L446-L451, L529-L535]:
 * `operation` is the one member name in this file with no legacy antecedent, and it is named here
 * rather than left to inference.
 */
export type PromotionAppliedIntent =
  AddPromotionAppliedIntent | UpdatePromotionAppliedIntent | RemovePromotionAppliedIntent;
