/**
 * Promotion-period and qualifier QUALIFICATION contracts: the gate that decides whether any
 * discount is computed at all.
 *
 * Qualification sits upstream of the money: an order item that fails to qualify never reaches the
 * discount arithmetic, and a period that fails its use-count gate never reaches the reward loop.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L136, L1038]: there are two consumers, each with
 * its own method-local memo.
 *
 * LEGACY-NOTE `src/lib/cfml/list.ts`: the shipped `listGetAt` THROWS `CfmlListIndexError` -
 * declared at `src/lib/cfml/list.ts` - rather than returning `''` out of range, mirroring CFML's
 * own `ListDeleteAt(list, 0)`.
 */
import type { PromotionPeriod } from '../entities/promotionPeriod.js';
import type { PromotionQualifier } from '../entities/promotionQualifier.js';
import type { OrderItemView } from '../views/orderItemView.js';
import type { OrderView } from '../views/orderView.js';

// LEGACY-NOTE [model/service/PromotionService.cfc:L554, L560, L633, L666]: every
// fulfillment-related member below is an opaque ID string, because that is what the legacy
// structures hold - L554 and L633 seed empty arrays.

/**
 * One order item's qualification count under one qualifier.
 *
 * Exactly two members: the single construction site [model/service/PromotionService.cfc:L722-L725]
 * builds these two keys and no others.
 *
 * CFML parity [model/service/PromotionService.cfc:L722-L735]: the record is built before the
 * membership test and appended only INSIDE it.
 */
export interface QualifiedOrderItemDetail {
  /**
   * The order item this count belongs to.
   *
   * The whole view, not an ID - the one place in this file where an association is held as an
   * object, because [model/service/PromotionService.cfc:L723] assigns the loop variable itself.
   */
  readonly orderItem: OrderItemView;

  /**
   * How many units of this order item qualified under this qualifier.
   *
   * A count, so `number` rather than `Money`: [model/service/PromotionService.cfc:L729] assigns
   * `orderItem.getQuantity()` verbatim once the membership test at L727 passes.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L730, L743]: this is not what
   * `QualifierQualification.qualificationCount` holds.
   */
  readonly qualificationCount: number;
}

/**
 * One qualifier's verdict on an order.
 *
 * A consumer cannot infer the branch from the members: an empty `qualifiedFulfillmentIDs` means
 * "no fulfillment qualified" after one branch and "not a fulfillment qualifier" after the others.
 *
 * CFML parity [model/service/PromotionService.cfc:L638, L656, L714, L747]: the dispatch has no
 * `else`.
 */
export interface QualifierQualification {
  /**
   * The qualifier this verdict is about.
   *
   * `readonly` - the identity of the record rather than part of its state:
   * [model/service/PromotionService.cfc:L631] assigns it and no line reassigns it.
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L703]: the shipping-address-zones clause of
   * the composite gate re-tests the shipping method instead of testing the zone condition.
   * Preserved deliberately; do not fix without a product decision.
   */
  readonly qualifier: PromotionQualifier;

  /**
   * How many times this qualifier qualifies.
   *
   * CFML parity [model/service/PromotionService.cfc:L593]: the caller's test is bare numeric
   * truthiness, so the ported consumer must write an explicit `> 0`.
   *
   * CFML parity [model/service/PromotionService.cfc:L743, L830-L831]: the order-item branch
   * derives the count with `int(...)`, which TRUNCATES toward zero - 7 items against a minimum of
   * 2 yields 3, not.
   */
  qualificationCount: number;

  /**
   * The fulfillments that survived this qualifier, as OPAQUE IDs.
   *
   * CFML parity [model/service/PromotionService.cfc:L707-L709]: the delete is positional and its
   * position comes from `arrayFind`, a 1-based index or `0`, never a boolean.
   */
  readonly qualifiedFulfillmentIDs: string[];

  /**
   * The order items this qualifier matched, one record each.
   *
   * A `readonly` property holding a MUTABLE array: created empty at
   * [model/service/PromotionService.cfc:L634], never reassigned, contents mutated by exactly one
   * line, the `arrayAppend` at L733.
   *
   * Only MATCHING items appear, and only the order-item branch populates it at all - see the
   * construct-then-conditionally-append note on {@link QualifiedOrderItemDetail}.
   */
  readonly qualifiedOrderItemDetails: QualifiedOrderItemDetail[];
}

/**
 * One promotion period's verdict on an order: the gate every discount passes through.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L556]: the initialization has four keys, not
 * three - L553 `qualificationsMeet`, L554 `qualifiedFulfillmentIDs`, L555 `qualifierDetails`, L556
 * `orderItems` - and the docblock omits the last.
 */
export interface PeriodQualification {
  /**
   * Whether this promotion period qualifies at all.
   *
   * CFML parity [model/service/PromotionService.cfc:L197, L1053]: this is the only member of this
   * type for which a bare truthiness test is the faithful port.
   *
   * CFML parity [model/service/PromotionService.cfc:L584, L619-L623]: when a use-count gate clears
   * this member the qualifier loop is skipped wholesale, yet execution still returns normally.
   */
  qualificationsMeet: boolean;

  /**
   * The fulfillments this period permits, as OPAQUE IDs. Seeded with all of them.
   *
   * CFML parity [model/service/PromotionService.cfc:L559-L561]: the default is "all fulfillments
   * qualify" - the loop appends every fulfillment ID before any qualifier is evaluated, and no
   * line ever appends again, so the array is only ever NARROWED.
   */
  readonly qualifiedFulfillmentIDs: string[];

  /**
   * Each qualifier's verdict, in the order the qualifiers were evaluated.
   *
   * A `readonly` property holding a MUTABLE array: created empty at
   * [model/service/PromotionService.cfc:L555], reassigned once by the early-return reset at L615.
   *
   * Either COMPLETE - one entry per qualifier - or EMPTY, never partial: the append sits in the
   * truthy arm of the bare test at L593 and the falsy arm at L612-L617 clears the array and
   * returns.
   */
  readonly qualifierDetails: QualifierQualification[];

  /**
   * The per-order-item qualification count, keyed by opaque `orderItemID`.
   *
   * The undocumented fourth key: created as `{}` at [model/service/PromotionService.cfc:L556] and
   * absent from the docblock at L86-L102 - see the LEGACY-NOTE on this interface.
   *
   * CFML parity [model/service/PromotionService.cfc:L613-L616]: the early-return reset clears
   * `qualificationsMeet`, `qualifiedFulfillmentIDs` and `qualifierDetails` and spares this member.
   */
  readonly orderItems: Record<string, number>;

  /**
   * DEAD FIELD. Written once, never initialized, never read.
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L621-L623]: a three-way mismatch.
   * `qualificationDetails.qualifiedFulfillments = explicitlyQualifiedFulfillmentIDs;` is wrong in
   * three independent ways at once.
   * Preserved deliberately; do not fix without a product decision.
   */
  qualifiedFulfillments?: string[];
}

/**
 * The memo's key: whatever {@link PromotionPeriod.getPromotionPeriodID} returns, which is
 * `string`, so `Record<PromotionPeriodQualificationKey, T>` is exactly `Record<string, T>`.
 *
 * JUDGMENT CALL: derived from the entity accessor rather than written as a bare `string`, because
 * every memo operation reaches the key through that accessor chain
 * [model/service/PromotionService.cfc:L192-L193, L197, L209, L212, L213, L217, L222, L1048-L1053].
 */
export type PromotionPeriodQualificationKey = ReturnType<PromotionPeriod['getPromotionPeriodID']>;

/**
 * The memo itself: every promotion period's verdict, keyed by `promotionPeriodID`.
 *
 * Mutable, deliberately - keys are ADDED lazily during the reward pass by the guarded assignments
 * at [model/service/PromotionService.cfc:L192-L193, L1048-L1049] onto structures that start as
 * `{}` at L136 and L1038.
 *
 * One memo per invocation, request-scoped: the two legacy memos are method-local `var`s that never
 * see each other.
 */
export type PromotionPeriodQualifications = Record<
  PromotionPeriodQualificationKey,
  PeriodQualification
>;

/**
 * The signature of the period-qualification producer.
 *
 * Parameter names and order mirror the legacy argument names, which the named-argument call sites
 * [model/service/PromotionService.cfc:L193, L1049] make part of the diffable surface.
 *
 * JUDGMENT CALL: the alias is PascalCase while the implementing function keeps the legacy
 * camelCase name, because tsc rejects a type alias and a function of the same name in one module
 * (TS2395).
 */
export type GetPromotionPeriodQualificationDetails = (
  promotionPeriod: PromotionPeriod,
  order: OrderView,
) => Promise<PeriodQualification>;

/**
 * The signature of the per-qualifier producer. Implemented by `getQualifierQualificationDetails`
 * in `src/services/promotion/qualifierQualification.ts`, from
 * [model/service/PromotionService.cfc:L629].
 *
 * The single call site passes both parameters POSITIONALLY
 * [model/service/PromotionService.cfc:L590], departing from the component's named-argument style,
 * so their order must not be swapped.
 */
export type GetQualifierQualificationDetails = (
  qualifier: PromotionQualifier,
  order: OrderView,
) => QualifierQualification;

/**
 * The signature of the comma-delimited qualified-fulfillment list builder. Implemented by
 * `getPromotionPeriodQualifiedFulfillmentIDList` in
 * `src/services/promotion/qualifierQualification.ts`, from
 * [model/service/PromotionService.cfc:L752].
 */
export type GetPromotionPeriodQualifiedFulfillmentIDList = (
  promotionPeriod: PromotionPeriod,
  order: OrderView,
) => string;

/**
 * The signature of the per-order-item qualification counter.
 *
 * Returns a count, never `Money`, and both parameters are load-bearing: the single named-argument
 * call site [model/service/PromotionService.cfc:L213] passes one `orderItem` and the whole
 * `order`.
 *
 * CFML parity [model/service/PromotionService.cfc:L830-L831]: `int()` TRUNCATES toward zero, so 7
 * units against a minimum of 2 yields.
 */
export type GetPromotionPeriodOrderItemQualificationCount = (
  promotionPeriod: PromotionPeriod,
  orderItem: OrderItemView,
  order: OrderView,
) => number;
