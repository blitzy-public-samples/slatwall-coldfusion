// slatwall-ts - characterization suite pinning `src/services/promotion/qualifierQualification.ts`
//
// So a qualifier that over-excludes does not compute a slightly different discount - it withholds
// the discount entirely and the customer is charged full price.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L633, L660]: `qualifiedFulfillmentIDs` has been
// cited as initialised at L656. L656 is the `else if` FULFILLMENT DISPATCH line; the initialiser
// is at L633 and the re-initialisation at L660.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L360, L678, L703]: the null-guard asymmetry is
// the source's and is not normalised.

import { beforeEach, describe, expect, it } from 'vitest';

import { PromotionQualifier } from '../../../../src/domain/entities/promotionQualifier.js';
import type {
  AddressProjection,
  AddressZoneEvaluator,
  AddressZoneProjection,
} from '../../../../src/domain/ports/addressZoneEvaluator.js';
import type {
  QualifiedOrderItemDetail,
  QualifierQualification,
} from '../../../../src/domain/promotionEngine/qualificationTypes.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import type {
  AppliedPromotionView,
  FulfillmentMethodView,
  OrderFulfillmentView,
  ShippingAddressView,
  ShippingMethodView,
} from '../../../../src/domain/views/orderFulfillmentView.js';
import type { OrderItemView } from '../../../../src/domain/views/orderItemView.js';
import type { OrderView } from '../../../../src/domain/views/orderView.js';
import { OrderItemMembership } from '../../../../src/services/promotion/orderItemMembership.js';
import { QualifierQualificationEvaluator } from '../../../../src/services/promotion/qualifierQualification.js';
import { makeOrderViewFixture } from '../../../fixtures/orderViewFixtures.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';

// What is deliberately not imported, each omission being a decision.

// The fixture graph types.
//
// Both factories publish one named export each and deliberately do not export the shapes they
// return, so the shapes are recovered from the functions rather than restated.
type PromotionFixtureGraph = ReturnType<typeof makePromotionFixtures>;

/**
 * The published constructor argument of `PromotionQualifier`, recovered from the class rather than
 * restated, for the same reason.
 */
type PromotionQualifierInit = ConstructorParameters<typeof PromotionQualifier>[0];

// The test bed, as explicit values.
//
// Every figure below is passed into the order fixture rather than read back out of it.

/**
 * The order's total sale quantity, compared against at
 * [model/service/PromotionService.cfc:L644, L646].
 */
const ORDER_TOTAL_SALE_QUANTITY = 9;

/**
 * One below {@link ORDER_TOTAL_SALE_QUANTITY}.
 */
const QUANTITY_BELOW = 8;

/**
 * One above {@link ORDER_TOTAL_SALE_QUANTITY}.
 */
const QUANTITY_ABOVE = 10;

/**
 * The order's subtotal, compared against at [model/service/PromotionService.cfc:L648, L650].
 */
const ORDER_SUBTOTAL = '129.95';

/**
 * One cent below {@link ORDER_SUBTOTAL}.
 */
const SUBTOTAL_BELOW = '129.94';

/**
 * One cent above {@link ORDER_SUBTOTAL}.
 */
const SUBTOTAL_ABOVE = '129.96';

/**
 * The shipping fulfillment's total shipping weight - a PLAIN NUMBER, never `Money`.
 *
 * Exactly representable in binary floating point, as are the two bounds either side of it.
 */
const FULFILLMENT_WEIGHT = 12.5;

/**
 * Below {@link FULFILLMENT_WEIGHT}.
 */
const WEIGHT_BELOW = 12;

/**
 * Above {@link FULFILLMENT_WEIGHT}.
 */
const WEIGHT_ABOVE = 13;

/**
 * An obviously-synthetic address-zone identifier the qualifier can be configured with.
 */
const ZONE_ID_WEST = 'az-west';

/**
 * A second synthetic zone identifier, used to prove the configured order and the early exit.
 */
const ZONE_ID_CENTRAL = 'az-central';

/**
 * A third synthetic zone identifier, never reached once an earlier zone has matched.
 */
const ZONE_ID_EAST = 'az-east';

/**
 * A fulfillment-method identifier no fulfillment in the order carries.
 */
const UNCONFIGURED_FULFILLMENT_METHOD_ID = 'fm-nowhere';

/**
 * A shipping-method identifier no fulfillment in the order carries.
 */
const UNCONFIGURED_SHIPPING_METHOD_ID = 'sm-nowhere';

/**
 * A `qualifierType` value that is in no arm of the dispatch.
 *
 * Not a typo of a real value and not a mixed-casing variant, because case folds and a near-miss
 * would prove nothing: this value is absent from the vocabulary altogether.
 */
const UNRECOGNISED_QUALIFIER_TYPE = 'wishlist';

// Collaborator double #1 - the address-zone port.

/**
 * One recorded call against the address-zone port.
 *
 * Recording the ARGUMENTS rather than only the call count is deliberate: it is the cleanest
 * available proof that the correct address and the correct zone reach the port.
 */
interface RecordedZoneCall {
  readonly address: AddressProjection;
  readonly addressZone: AddressZoneProjection;
}

/**
 * The hand-written address-zone evaluator, declared inline in this file and nowhere else.
 *
 * It implements EXACTLY the one member the port declares - `isAddressInZone`
 * [model/service/AddressService.cfc:L57], reached from [model/service/PromotionService.cfc:L684] -
 * and it is SYNCHRONOUS.
 */
class RecordingAddressZoneEvaluator implements AddressZoneEvaluator {
  /**
   * Every call, in call order. Per instance, never shared, never hoisted to module scope.
   */
  readonly calls: RecordedZoneCall[] = [];

  /**
   * @param matchingAddressZoneIDs the zone identifiers this double answers `true` for.
   */
  constructor(private readonly matchingAddressZoneIDs: readonly string[]) {}

  isAddressInZone(address: AddressProjection, addressZone: AddressZoneProjection): boolean {
    this.calls.push({ address, addressZone });

    return this.matchingAddressZoneIDs.includes(addressZone.addressZoneID);
  }
}

// Collaborator double #2 - the order-item membership unit.

/**
 * One recorded call against the membership collaborator.
 *
 * The qualifier is recorded alongside the item because the legacy call at
 * [model/service/PromotionService.cfc:L727] passes both.
 */
interface RecordedMembershipCall {
  readonly qualifier: PromotionQualifier;
  readonly orderItem: OrderItemView;
}

// JUDGMENT CALL: the membership double SUBCLASSES the real, shipped `OrderItemMembership` rather
// than standing in for it structurally.
//
// The shipped class carries no private member, so a plain object literal would in fact be
// assignable - the choice is therefore about evidence rather than about the compiler.
/**
 * The hand-written membership collaborator: a real `OrderItemMembership` whose one consulted
 * member is replaced by a recorder answering a caller-chosen verdict per order item.
 */
class RecordingOrderItemMembership extends OrderItemMembership {
  /**
   * Every call to `getOrderItemInQualifier`, in call order. Per instance, never shared.
   */
  readonly getOrderItemInQualifierCalls: RecordedMembershipCall[] = [];

  /**
   * @param qualifyingOrderItemIDs the opaque order-item identifiers this double reports as
   * members.
   */
  constructor(private readonly qualifyingOrderItemIDs: readonly string[]) {
    super();
  }

  override getOrderItemInQualifier(
    qualifier: PromotionQualifier,
    orderItem: OrderItemView,
  ): boolean {
    this.getOrderItemInQualifierCalls.push({ qualifier, orderItem });

    return this.qualifyingOrderItemIDs.includes(orderItem.orderItemID);
  }
}

// Under `noUncheckedIndexedAccess` every indexed read is possibly-absent, and this suite uses
// neither a non-null assertion nor a type assertion to sidestep that.

/**
 * Reads one element of a collection, failing loudly when it is absent.
 *
 * @param values the collection being indexed.
 * @param index the ZERO-BASED position wanted.
 * @param description what the caller was looking for, used in the failure message.
 * @returns the element at that position.
 * @throws Error when the position holds nothing.
 */
function elementAt<TValue>(values: readonly TValue[], index: number, description: string): TValue {
  const value = values[index];

  if (value === undefined) {
    throw new Error(
      `Expected ${description} at index ${String(index)}, but the collection holds ` +
        `${String(values.length)} element(s).`,
    );
  }

  return value;
}

/**
 * The fulfillment at a given position on an order view.
 *
 * @param order the read-only order projection.
 * @param index zero-based position in `order.orderFulfillments`.
 * @returns the fulfillment view.
 */
function orderFulfillmentAt(order: OrderView, index: number): OrderFulfillmentView {
  return elementAt(order.orderFulfillments, index, 'an order fulfillment');
}

/**
 * The order item at a given position on an order view.
 *
 * @param order the read-only order projection.
 * @param index zero-based position in `order.orderItems`.
 * @returns the order item view.
 */
function orderItemAt(order: OrderView, index: number): OrderItemView {
  return elementAt(order.orderItems, index, 'an order item');
}

/**
 * A fulfillment's resolved shipping address, failing loudly when the fixture supplied none.
 *
 * Used only by cases that deliberately work with a PRESENT address.
 *
 * @param orderFulfillment the fulfillment whose address is wanted.
 * @returns the address view.
 * @throws Error when no address was resolved.
 */
function resolvedAddressOf(orderFulfillment: OrderFulfillmentView): ShippingAddressView {
  const address = orderFulfillment.address;

  if (address === undefined) {
    throw new Error(
      `Expected fulfillment "${orderFulfillment.orderFulfillmentID}" to carry a resolved address.`,
    );
  }

  return address;
}

/**
 * A fulfillment's shipping method identifier, failing loudly when the fixture supplied no method.
 *
 * @param orderFulfillment the fulfillment whose shipping method is wanted.
 * @returns the opaque shipping-method identifier.
 * @throws Error when no shipping method is present.
 */
function shippingMethodIDOf(orderFulfillment: OrderFulfillmentView): string {
  const shippingMethod = orderFulfillment.shippingMethod;

  if (shippingMethod === undefined) {
    throw new Error(
      `Expected fulfillment "${orderFulfillment.orderFulfillmentID}" to carry a shipping method.`,
    );
  }

  return shippingMethod.shippingMethodID;
}

/**
 * One recorded zone call, narrowed.
 *
 * @param zones the address-zone double whose log is being read.
 * @param index zero-based position in the call log.
 * @returns the recorded call.
 */
function recordedZoneCallAt(zones: RecordingAddressZoneEvaluator, index: number): RecordedZoneCall {
  return elementAt(zones.calls, index, 'a recorded isAddressInZone call');
}

/**
 * One recorded membership call, narrowed.
 *
 * @param membership the membership double whose log is being read.
 * @param index zero-based position in the call log.
 * @returns the recorded call.
 */
function recordedMembershipCallAt(
  membership: RecordingOrderItemMembership,
  index: number,
): RecordedMembershipCall {
  return elementAt(membership.getOrderItemInQualifierCalls, index, 'a recorded membership call');
}

/**
 * One qualified order-item record off a verdict, narrowed.
 *
 * @param result the verdict returned by the subject.
 * @param index zero-based position in `qualifiedOrderItemDetails`.
 * @returns the record.
 */
function qualifiedOrderItemDetailAt(
  result: QualifierQualification,
  index: number,
): QualifiedOrderItemDetail {
  return elementAt(result.qualifiedOrderItemDetails, index, 'a qualified order item detail');
}

/**
 * Runs an invocation that is expected to raise, and hands back the raised `Error`.
 *
 * Capturing once rather than calling `expect(...).toThrow(...)` twice is not a style preference:
 * two of the cases below drive a view whose property getter advances a read counter.
 *
 * @param run the invocation under test.
 * @returns the raised error.
 * @throws Error when the invocation returned normally, or raised a non-`Error`.
 */
function captureThrown(run: () => unknown): Error {
  try {
    run();
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }

    throw new Error(`Expected an Error to be raised, observed ${String(error)}.`);
  }

  throw new Error('Expected the invocation to raise, but it returned normally.');
}

/**
 * A qualifier configured for exactly one dispatch arm and nothing else.
 *
 * Every one of the ten gates and all three identifier lists are left at their absent/empty state,
 * so a case can switch on exactly one gate and read the result as that gate's doing.
 *
 * @param qualifierType the `qualifierType` column value, verbatim.
 * @param overrides the gates and identifier lists this case actually cares about.
 * @returns a fresh qualifier.
 */
function makeQualifier(
  qualifierType: string,
  overrides: Omit<PromotionQualifierInit, 'promotionQualifierID' | 'qualifierType'> = {},
): PromotionQualifier {
  return new PromotionQualifier({
    promotionQualifierID: `pq-${qualifierType}`,
    qualifierType,
    ...overrides,
  });
}

/**
 * The opaque identifiers of every item on an order, in iteration order.
 *
 * @param order the read-only order projection.
 * @returns the identifier list, suitable for {@link RecordingOrderItemMembership}.
 */
function everyOrderItemID(order: OrderView): readonly string[] {
  return order.orderItems.map((orderItem: OrderItemView): string => orderItem.orderItemID);
}

// The read-observing fulfillment view.
//
// Two of this arm's obligations cannot be reached with constant data, because both concern what
// the source does when it re-reads the same accessor and gets a different answer.

/**
 * The seven property names an {@link ObservingFulfillmentView} can log.
 */
type ObservedFulfillmentProperty =
  | 'address'
  | 'appliedPromotions'
  | 'fulfillmentCharge'
  | 'fulfillmentMethod'
  | 'orderFulfillmentID'
  | 'shippingMethod'
  | 'totalShippingWeight';

/**
 * What an {@link ObservingFulfillmentView} scripts, if anything.
 */
interface ObservedFulfillmentScript {
  /**
   * The value each successive `orderFulfillmentID` read answers. The LAST entry answers every
   * further read, which matches how the CFML source would behave against a value that changed
   * once.
   */
  readonly orderFulfillmentIDsByRead?: readonly string[];

  /**
   * The value each successive `address` read answers, with the same last-entry-repeats rule. Omit
   * the key to answer the wrapped fixture value on every read.
   */
  readonly addressesByRead?: readonly (ShippingAddressView | undefined)[];
}

/**
 * A read-only `OrderFulfillmentView` that records its own reads and can answer a scripted
 * sequence.
 */
class ObservingFulfillmentView implements OrderFulfillmentView {
  /**
   * Every property read since the last reset, in read order.
   */
  readonly readLog: ObservedFulfillmentProperty[] = [];

  private orderFulfillmentIDReadCount = 0;

  private addressReadCount = 0;

  /**
   * @param base the frozen fixture fulfillment whose values are answered when nothing is scripted.
   * @param script the per-read sequences this case needs, if any.
   */
  constructor(
    private readonly base: OrderFulfillmentView,
    private readonly script: ObservedFulfillmentScript = {},
  ) {}

  /**
   * Forgets every read taken so far.
   *
   * Called immediately before the subject is invoked, because `makeOrderViewFixture` reads several
   * of these accessors while it assembles the order and those reads are the FIXTURE's.
   */
  resetObservations(): void {
    this.readLog.length = 0;
    this.orderFulfillmentIDReadCount = 0;
    this.addressReadCount = 0;
  }

  get orderFulfillmentID(): string {
    this.readLog.push('orderFulfillmentID');

    const scripted = this.script.orderFulfillmentIDsByRead;
    const readIndex = this.orderFulfillmentIDReadCount;
    this.orderFulfillmentIDReadCount += 1;

    if (scripted === undefined || scripted.length === 0) {
      return this.base.orderFulfillmentID;
    }

    return elementAt(
      scripted,
      Math.min(readIndex, scripted.length - 1),
      'a scripted orderFulfillmentID',
    );
  }

  get fulfillmentCharge(): Money {
    this.readLog.push('fulfillmentCharge');

    return this.base.fulfillmentCharge;
  }

  get fulfillmentMethod(): FulfillmentMethodView {
    this.readLog.push('fulfillmentMethod');

    return this.base.fulfillmentMethod;
  }

  get shippingMethod(): ShippingMethodView | undefined {
    this.readLog.push('shippingMethod');

    return this.base.shippingMethod;
  }

  get appliedPromotions(): readonly AppliedPromotionView[] {
    this.readLog.push('appliedPromotions');

    return this.base.appliedPromotions;
  }

  get totalShippingWeight(): number {
    this.readLog.push('totalShippingWeight');

    return this.base.totalShippingWeight;
  }

  get address(): ShippingAddressView | undefined {
    this.readLog.push('address');

    const scripted = this.script.addressesByRead;
    const readIndex = this.addressReadCount;
    this.addressReadCount += 1;

    if (scripted === undefined || scripted.length === 0) {
      return this.base.address;
    }

    return scripted[Math.min(readIndex, scripted.length - 1)];
  }
}

describe('QualifierQualificationEvaluator', () => {
  /**
   * The address-zone double. Constructed fresh in every `beforeEach` and REPLACED by the cases
   * that need a different verdict, so no case can inherit another's configuration (A2).
   */
  let addressZones: RecordingAddressZoneEvaluator;

  /**
   * The membership double, likewise fresh per test.
   */
  let membership: RecordingOrderItemMembership;

  /**
   * The subject, rebuilt per test over the two fresh doubles.
   */
  let evaluator: QualifierQualificationEvaluator;

  /**
   * The golden order projection, a fresh object graph per test.
   */
  let order: OrderView;

  /**
   * The shared promotion graph, a fresh object graph per test.
   */
  let promotionFixtures: PromotionFixtureGraph;

  /**
   * Rebuilds the subject over a specific pair of collaborators.
   *
   * Used by the cases that need a zone verdict or a membership verdict other than the default.
   *
   * @param zones the address-zone double to inject.
   * @param items the membership collaborator to inject.
   * @returns the rebuilt subject.
   */
  function buildEvaluator(
    zones: RecordingAddressZoneEvaluator,
    items: OrderItemMembership,
  ): QualifierQualificationEvaluator {
    return new QualifierQualificationEvaluator(zones, items);
  }

  beforeEach(() => {
    addressZones = new RecordingAddressZoneEvaluator([]);
    membership = new RecordingOrderItemMembership([]);
    evaluator = buildEvaluator(addressZones, membership);
    order = makeOrderViewFixture();
    promotionFixtures = makePromotionFixtures();
  });

  // Visibility widening #2 of exactly.
  describe('visibility widening #2 - the promoted qualifier evaluator', () => {
    it('exposes getQualifierQualificationDetails as a directly callable public member', () => {
      // The legacy declaration is
      // `private struct function getQualifierQualificationDetails(required any qualifier, required any order)`
      // [model/service/PromotionService.cfc:L629].
      expect(typeof evaluator.getQualifierQualificationDetails).toBe('function');

      // C4: the name is FROZEN verbatim from the legacy source. It is not renamed, not aliased and
      // not wrapped, and this suite reaches the behaviour through that exact name and no other.
      const qualifier = makeQualifier('order');
      const result = evaluator.getQualifierQualificationDetails(qualifier, order);

      expect(result.qualifier).toBe(qualifier);
    });

    it('answers synchronously, returning the verdict rather than a promise', () => {
      const result: QualifierQualification = evaluator.getQualifierQualificationDetails(
        makeQualifier('order'),
        order,
      );

      expect(result).not.toBeInstanceOf(Promise);
      expect(typeof result.qualificationCount).toBe('number');
    });
  });

  // §11.1 - the result struct has exactly four members.
  describe('the four-member verdict [model/service/PromotionService.cfc:L630-L635]', () => {
    it('seeds exactly the four published members and nothing else', () => {
      const qualifier = makeQualifier(UNRECOGNISED_QUALIFIER_TYPE);

      const result = evaluator.getQualifierQualificationDetails(qualifier, order);

      // `toStrictEqual` rather than `toMatchObject`, so an EXTRA member fails.
      expect(result).toStrictEqual({
        qualifier,
        qualificationCount: 0,
        qualifiedFulfillmentIDs: [],
        qualifiedOrderItemDetails: [],
      });
      expect(Object.keys(result)).toHaveLength(4);
    });

    it('carries the qualifier ENTITY itself as the verdict identity, not a copy', () => {
      // [model/service/PromotionService.cfc:L631] stores the qualifier in the struct it returns.
      // The member is the record's identity, so identity - not equality - is what is asserted.
      const qualifier = makeQualifier('order');

      const result = evaluator.getQualifierQualificationDetails(qualifier, order);

      expect(result.qualifier).toBe(qualifier);
    });

    it('exposes qualificationCount as the one MUTABLE member', () => {
      // [model/service/PromotionService.cfc:L641, L644-L653, L665, L729, L733, L740-L743] all
      // write this member in place.
      const result = evaluator.getQualifierQualificationDetails(makeQualifier('order'), order);

      expect(Object.isFrozen(result)).toBe(false);

      result.qualificationCount = 7;

      expect(result.qualificationCount).toBe(7);
    });

    it('exposes both collections as readonly PROPERTIES over MUTABLE arrays', () => {
      // The distinction matters to the port: [model/service/PromotionService.cfc:L660] empties
      // `qualifiedFulfillmentIDs` and
      // [model/service/PromotionService.cfc:L666]/[model/service/PromotionService.cfc:L709] push
      // into and splice out of it.
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier(UNRECOGNISED_QUALIFIER_TYPE),
        order,
      );

      expect(Array.isArray(result.qualifiedFulfillmentIDs)).toBe(true);
      expect(Array.isArray(result.qualifiedOrderItemDetails)).toBe(true);
      expect(Object.isFrozen(result.qualifiedFulfillmentIDs)).toBe(false);
      expect(Object.isFrozen(result.qualifiedOrderItemDetails)).toBe(false);

      result.qualifiedFulfillmentIDs.push('of-appended-by-the-test');

      expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-appended-by-the-test']);
    });

    it('returns a FRESH verdict, with fresh collections, on every call', () => {
      const qualifier = makeQualifier('fulfillment');

      const first = evaluator.getQualifierQualificationDetails(qualifier, order);
      const second = evaluator.getQualifierQualificationDetails(qualifier, order);

      expect(second).not.toBe(first);
      expect(second.qualifiedFulfillmentIDs).not.toBe(first.qualifiedFulfillmentIDs);
      expect(second.qualifiedOrderItemDetails).not.toBe(first.qualifiedOrderItemDetails);
      expect(second.qualificationCount).toBe(first.qualificationCount);
    });

    it('appends order-item records carrying exactly the two published members', () => {
      // [model/service/PromotionService.cfc:L722-L725] builds a TWO-member record. Nothing is
      // added to it and nothing is widened, so `toStrictEqual` is the assertion.
      const firstItem = orderItemAt(order, 0);
      membership = new RecordingOrderItemMembership([firstItem.orderItemID]);
      evaluator = buildEvaluator(addressZones, membership);

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('merchandise', { minimumItemQuantity: 1 }),
        order,
      );

      const detail: QualifiedOrderItemDetail = qualifiedOrderItemDetailAt(result, 0);

      expect(detail).toStrictEqual({
        orderItem: firstItem,
        qualificationCount: firstItem.quantity,
      });
      expect(Object.keys(detail)).toHaveLength(2);
    });
  });

  // §11.2 - three-arm dispatch with no final `else`
  describe('the three-arm dispatch [model/service/PromotionService.cfc:L638, L656, L714]', () => {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L747]: L747 closes the `if`/`else if` chain
    // with no final `else`, so an unrecognised qualifier type reaches no arm and the untouched
    // seed is returned.
    it('returns the UNTOUCHED SEED for an unrecognised qualifier type', () => {
      const qualifier = makeQualifier(UNRECOGNISED_QUALIFIER_TYPE, {
        // Every gate that any arm could consult is configured, so the verdict cannot be mistaken
        // for an arm that ran and happened to answer zero.
        minimumOrderQuantity: 1,
        maximumOrderQuantity: 1000,
        minimumOrderSubtotal: Money.fromDecimalString('0.01'),
        maximumOrderSubtotal: Money.fromDecimalString('10000.00'),
        minimumItemQuantity: 1,
        minimumFulfillmentWeight: 0,
        maximumFulfillmentWeight: 1000,
      });

      const result = evaluator.getQualifierQualificationDetails(qualifier, order);

      expect(result.qualificationCount).toBe(0);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      expect(result.qualifiedOrderItemDetails).toStrictEqual([]);

      // Neither collaborator is reached, which is the structural proof that no arm ran at all
      // rather than an arm running and declining.
      expect(addressZones.calls).toStrictEqual([]);
      expect(membership.getOrderItemInQualifierCalls).toStrictEqual([]);
    });

    it('returns the untouched seed when qualifierType is ABSENT', () => {
      // `qualifierType` is a nullable column [model/entity/PromotionQualifier.cfc:L53].
      const qualifier = new PromotionQualifier({ promotionQualifierID: 'pq-absent-type' });

      const result = evaluator.getQualifierQualificationDetails(qualifier, order);

      expect(qualifier.getQualifierType()).toBeUndefined();
      expect(result.qualificationCount).toBe(0);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      expect(result.qualifiedOrderItemDetails).toStrictEqual([]);
    });

    it('routes "order" to the ORDER arm [L638]', () => {
      const result = evaluator.getQualifierQualificationDetails(makeQualifier('order'), order);

      // The order arm's signature is a count of 1 with both collections untouched.
      expect(result.qualificationCount).toBe(1);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      expect(result.qualifiedOrderItemDetails).toStrictEqual([]);
      expect(addressZones.calls).toStrictEqual([]);
      expect(membership.getOrderItemInQualifierCalls).toStrictEqual([]);
    });

    it('routes "fulfillment" to the FULFILLMENT arm [L656]', () => {
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment'),
        order,
      );

      // The fulfillment arm's signature is one appended ID per surviving fulfillment.
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([
        orderFulfillmentAt(order, 0).orderFulfillmentID,
        orderFulfillmentAt(order, 1).orderFulfillmentID,
      ]);
      expect(result.qualificationCount).toBe(order.orderFulfillments.length);
      expect(membership.getOrderItemInQualifierCalls).toStrictEqual([]);
    });

    it.each(['contentAccess', 'merchandise', 'subscription'])(
      'routes "%s" to the ORDER ITEM arm [L714]',
      (qualifierType: string) => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier(qualifierType),
          order,
        );

        // The order-item arm's signature is one membership consultation per order item.
        expect(membership.getOrderItemInQualifierCalls).toHaveLength(order.orderItems.length);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
        expect(addressZones.calls).toStrictEqual([]);
      },
    );

    // CFML parity [model/service/PromotionService.cfc:L638, L656, L714]: CFML's `==` folds case
    // and `listFindNoCase` is case-insensitive by construction, so all three ARMS tolerate any
    // casing.
    it.each(['ORDER', 'Order', 'oRdEr'])(
      'routes the differently-cased "%s" to the ORDER arm',
      (storedType: string) => {
        const result = evaluator.getQualifierQualificationDetails(makeQualifier(storedType), order);

        expect(result.qualificationCount).toBe(1);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
        expect(membership.getOrderItemInQualifierCalls).toStrictEqual([]);
      },
    );

    it.each(['FULFILLMENT', 'Fulfillment'])(
      'routes the differently-cased "%s" to the FULFILLMENT arm',
      (storedType: string) => {
        const result = evaluator.getQualifierQualificationDetails(makeQualifier(storedType), order);

        expect(result.qualificationCount).toBe(order.orderFulfillments.length);
        expect(result.qualifiedFulfillmentIDs).toHaveLength(order.orderFulfillments.length);
        expect(membership.getOrderItemInQualifierCalls).toStrictEqual([]);
      },
    );

    it.each(['MERCHANDISE', 'ContentAccess', 'SUBSCRIPTION'])(
      'routes the differently-cased "%s" to the ORDER ITEM arm',
      (storedType: string) => {
        const result = evaluator.getQualifierQualificationDetails(makeQualifier(storedType), order);

        expect(membership.getOrderItemInQualifierCalls).toHaveLength(order.orderItems.length);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      },
    );

    // CFML parity [model/service/PromotionService.cfc:L200, L714, L794]: the list-order divergence
    // is preserved, not normalised.
    it('accepts all three L714 list members and no fourth', () => {
      const accepted = ['contentAccess', 'merchandise', 'subscription'];

      for (const qualifierType of accepted) {
        membership = new RecordingOrderItemMembership([]);
        evaluator = buildEvaluator(addressZones, membership);

        evaluator.getQualifierQualificationDetails(makeQualifier(qualifierType), order);

        expect(membership.getOrderItemInQualifierCalls).toHaveLength(order.orderItems.length);
      }

      // `"fulfillment"` is not a member of the L714 list even though it is a legal qualifier type:
      // it has its own arm at L656, and the order-item arm must never see it.
      membership = new RecordingOrderItemMembership([]);
      evaluator = buildEvaluator(addressZones, membership);

      evaluator.getQualifierQualificationDetails(makeQualifier('fulfillment'), order);

      expect(membership.getOrderItemInQualifierCalls).toStrictEqual([]);
    });
  });

  // §11.3 - the order arm is assign-then-revoke.
  describe('the ORDER arm [model/service/PromotionService.cfc:L638-L653]', () => {
    it('assigns 1 FIRST and leaves it when all four bounds are ABSENT', () => {
      // CFML parity [model/service/PromotionService.cfc:L641]: the count is set to 1 before any
      // bound is examined - the legacy comment reads "because that is the max for an order
      // qualifier" - and L644-L653 can only ever REVOKE it.
      //
      // Each of the four bounds is independently nullable and an ABSENT bound imposes no
      // constraint whatsoever.
      const qualifier = makeQualifier('order');

      const result = evaluator.getQualifierQualificationDetails(qualifier, order);

      expect(qualifier.getMinimumOrderQuantity()).toBeUndefined();
      expect(qualifier.getMaximumOrderQuantity()).toBeUndefined();
      expect(qualifier.getMinimumOrderSubtotal()).toBeUndefined();
      expect(qualifier.getMaximumOrderSubtotal()).toBeUndefined();
      expect(result.qualificationCount).toBe(1);
    });

    it('leaves both collections untouched', () => {
      // The arm writes only `qualificationCount`. It appends no fulfillment ID and no order-item
      // record, so a caller reading either collection off an order qualifier reads an empty one.
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('order', {
          minimumOrderQuantity: 1,
          maximumOrderSubtotal: Money.fromDecimalString('10000.00'),
        }),
        order,
      );

      expect(result.qualificationCount).toBe(1);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      expect(result.qualifiedOrderItemDetails).toStrictEqual([]);
    });

    it('compares a PLAIN COUNT against the order quantity and MONEY against the subtotal', () => {
      // [model/entity/PromotionQualifier.cfc:L55, L56] declare the two order-quantity gates
      // `ormtype="integer"` - PLAIN COUNTS - while [model/entity/PromotionQualifier.cfc:L57, L58]
      // declare the two subtotal gates `ormtype="big_decimal" hb_formatType="currency"`.
      expect(typeof order.totalSaleQuantity).toBe('number');
      expect(order.totalSaleQuantity).toBe(ORDER_TOTAL_SALE_QUANTITY);
      expect(order.subtotal).toBeInstanceOf(Money);
      expect(order.subtotal.toDecimalString()).toBe(ORDER_SUBTOTAL);
    });

    describe('the minimum order quantity bound [L644] - a PLAIN COUNT, STRICT', () => {
      it('does not revoke when the bound is BELOW the order quantity', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', { minimumOrderQuantity: QUANTITY_BELOW }),
          order,
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('does not revoke when the bound EQUALS the order quantity', () => {
        // CFML parity [model/service/PromotionService.cfc:L644]: the comparison is `gt`, so
        // boundary equality is inclusive.
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', { minimumOrderQuantity: ORDER_TOTAL_SALE_QUANTITY }),
          order,
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('REVOKES when the bound is ABOVE the order quantity', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', { minimumOrderQuantity: QUANTITY_ABOVE }),
          order,
        );

        expect(result.qualificationCount).toBe(0);
      });
    });

    describe('the maximum order quantity bound [L646] - a PLAIN COUNT, STRICT', () => {
      it('does not revoke when the bound is ABOVE the order quantity', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', { maximumOrderQuantity: QUANTITY_ABOVE }),
          order,
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('does not revoke when the bound EQUALS the order quantity', () => {
        // [model/service/PromotionService.cfc:L646] compares with `lt`, so equality is inclusive
        // on this side too.
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', { maximumOrderQuantity: ORDER_TOTAL_SALE_QUANTITY }),
          order,
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('REVOKES when the bound is BELOW the order quantity', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', { maximumOrderQuantity: QUANTITY_BELOW }),
          order,
        );

        expect(result.qualificationCount).toBe(0);
      });
    });

    describe('the minimum subtotal bound [L648] - MONETARY, STRICT', () => {
      it('does not revoke when the bound is BELOW the subtotal', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', {
            minimumOrderSubtotal: Money.fromDecimalString(SUBTOTAL_BELOW),
          }),
          order,
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('does not revoke when the bound EQUALS the subtotal to the cent', () => {
        // The one-cent granularity is the point: the comparison runs through `Money`, so no
        // floating-point representation can decide it.
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', {
            minimumOrderSubtotal: Money.fromDecimalString(ORDER_SUBTOTAL),
          }),
          order,
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('REVOKES when the bound is ONE CENT ABOVE the subtotal', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', {
            minimumOrderSubtotal: Money.fromDecimalString(SUBTOTAL_ABOVE),
          }),
          order,
        );

        expect(result.qualificationCount).toBe(0);
      });
    });

    describe('the maximum subtotal bound [L650] - MONETARY, STRICT', () => {
      it('does not revoke when the bound is ABOVE the subtotal', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', {
            maximumOrderSubtotal: Money.fromDecimalString(SUBTOTAL_ABOVE),
          }),
          order,
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('does not revoke when the bound EQUALS the subtotal to the cent', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', {
            maximumOrderSubtotal: Money.fromDecimalString(ORDER_SUBTOTAL),
          }),
          order,
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('REVOKES when the bound is ONE CENT BELOW the subtotal', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('order', {
            maximumOrderSubtotal: Money.fromDecimalString(SUBTOTAL_BELOW),
          }),
          order,
        );

        expect(result.qualificationCount).toBe(0);
      });
    });

    it('revokes on the FIRST violated bound even when the other three are satisfied', () => {
      // The four clauses form one disjunction at [model/service/PromotionService.cfc:L644-L651],
      // so any single violation revokes. The count cannot go below zero, because the assignment is
      // `= 0` rather than a decrement.
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('order', {
          minimumOrderQuantity: QUANTITY_BELOW,
          maximumOrderQuantity: QUANTITY_ABOVE,
          minimumOrderSubtotal: Money.fromDecimalString(SUBTOTAL_BELOW),
          maximumOrderSubtotal: Money.fromDecimalString(SUBTOTAL_BELOW),
        }),
        order,
      );

      expect(result.qualificationCount).toBe(0);
    });

    it('qualifies when all four bounds are satisfied together', () => {
      // Driven through the SHARED promotion fixture rather than an inline qualifier, so the gate
      // values are the ones the fixture publishes for the whole project: minimum quantity 2,
      // maximum 20, minimum subtotal 25.00.
      const orderArmFixtures = makePromotionFixtures({ qualifierType: 'order' });
      const qualifier = orderArmFixtures.promotionQualifier;

      const result = evaluator.getQualifierQualificationDetails(qualifier, order);

      expect(qualifier.getQualifierType()).toBe('order');
      expect(result.qualificationCount).toBe(1);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      expect(result.qualifiedOrderItemDetails).toStrictEqual([]);
    });

    it('revokes on an INVERTED band, and no validation error is raised', () => {
      // B5: nothing checks that the minimum does not exceed the maximum, nothing checks
      // non-negativity, and nothing raises on a nonsensical band.
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('order', {
          minimumOrderQuantity: QUANTITY_ABOVE,
          maximumOrderQuantity: QUANTITY_BELOW,
        }),
        order,
      );

      expect(result.qualificationCount).toBe(0);
    });

    it('consults NEITHER collaborator', () => {
      evaluator.getQualifierQualificationDetails(
        makeQualifier('order', { minimumOrderQuantity: 1 }),
        order,
      );

      expect(addressZones.calls).toStrictEqual([]);
      expect(membership.getOrderItemInQualifierCalls).toStrictEqual([]);
    });
  });

  // §11.4 - the fulfillment arm counts and appends *before* testing.
  describe('the FULFILLMENT arm [model/service/PromotionService.cfc:L656-L711]', () => {
    /**
     * An order carrying only the shipping fulfillment, so a single bound can be read in isolation.
     */
    function shippingOnlyOrder(): OrderView {
      return makeOrderViewFixture({ includePickupFulfillment: false });
    }

    // LEGACY-NOTE [model/service/PromotionService.cfc:L659-L660]: the arm RE-INITIALIZES
    // `qualificationCount` to 0 and empties `qualifiedFulfillmentIDs` even though L632 and L633
    // already seeded both, and nothing between the seed and the arm can have changed either - the
    // ORDER arm is a sibling branch of the same chain.
    it('counts and appends every fulfillment when the qualifier configures nothing', () => {
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment'),
        order,
      );

      expect(result.qualificationCount).toBe(2);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-shipping-1', 'of-pickup-1']);
    });

    it('appends the IDs in the order the fulfillments are iterated', () => {
      // [model/service/PromotionService.cfc:L663] iterates the collection's own order and
      // [model/service/PromotionService.cfc:L666] appends in that order. Nothing sorts, dedupes or
      // reorders, so the surviving list mirrors the order's own sequence.
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment'),
        order,
      );

      expect(result.qualifiedFulfillmentIDs).toStrictEqual(
        order.orderFulfillments.map(
          (orderFulfillment: OrderFulfillmentView): string => orderFulfillment.orderFulfillmentID,
        ),
      );
    });

    it('COUNTS AND APPENDS BEFORE any exclusion test is evaluated', () => {
      // CFML parity [model/service/PromotionService.cfc:L665-L666]: both statements run
      // UNCONDITIONALLY at the top of every iteration, before a single condition has been
      // examined.
      const observed = new ObservingFulfillmentView(orderFulfillmentAt(shippingOnlyOrder(), 0));
      const observedOrder = makeOrderViewFixture({ orderFulfillments: [observed] });

      // The fixture factory itself reads several of these accessors while assembling the order;
      // those reads belong to the fixture, not to the subject.
      observed.resetObservations();

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment'),
        observedOrder,
      );

      const firstRead = elementAt(observed.readLog, 0, 'the first observed property read');

      expect(firstRead).toBe('orderFulfillmentID');
      expect(observed.readLog).toContain('totalShippingWeight');
      expect(observed.readLog.indexOf('orderFulfillmentID')).toBeLessThan(
        observed.readLog.indexOf('totalShippingWeight'),
      );
      expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-shipping-1']);
    });

    it('counts and appends a fulfillment that is ULTIMATELY EXCLUDED, then walks both back', () => {
      // The same read order holds for a fulfillment that fails: the append is not conditional on
      // the outcome, so the ID is present in the array before the disjunction runs and is spliced
      // out afterwards.
      const observed = new ObservingFulfillmentView(orderFulfillmentAt(shippingOnlyOrder(), 0));
      const observedOrder = makeOrderViewFixture({ orderFulfillments: [observed] });

      observed.resetObservations();

      const result = evaluator.getQualifierQualificationDetails(
        // A weight minimum above the fulfillment's weight excludes it at
        // [model/service/PromotionService.cfc:L695].
        makeQualifier('fulfillment', { minimumFulfillmentWeight: WEIGHT_ABOVE }),
        observedOrder,
      );

      const firstRead = elementAt(observed.readLog, 0, 'the first observed property read');

      expect(firstRead).toBe('orderFulfillmentID');
      expect(
        observed.readLog.filter(
          (property: ObservedFulfillmentProperty): boolean => property === 'orderFulfillmentID',
        ),
      ).toHaveLength(2);
      expect(result.qualificationCount).toBe(0);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
    });

    describe('the address-zone gate [L669-L690]', () => {
      // CFML parity [model/service/PromotionService.cfc:L669, L675, L685, L693]: the source
      // DECLARES the flag as `addressZoneOK` (capital K) at L669 and then writes it at L675 and
      // L685 and reads it at L693 as `addressZoneOk` (lower-case k).
      it('DEFAULTS PERMISSIVE - no configured zones means no zone constraint', () => {
        // [model/service/PromotionService.cfc:L669, L672] The flag starts `true` and only a
        // configured zone set can flip it. A qualifier with no shipping address zones therefore
        // passes the zone check automatically, and the port is never consulted at all.
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment'),
          order,
        );

        expect(addressZones.calls).toStrictEqual([]);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-shipping-1', 'of-pickup-1']);
      });

      it('does not dereference an ABSENT address when no zones are configured', () => {
        // The pickup fulfillment carries no address, and the only three `getAddress()`
        // dereferences in the arm - L678, L684 and L703.
        const pickupOnlyOrder = makeOrderViewFixture({
          orderFulfillments: [orderFulfillmentAt(order, 1)],
        });

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment'),
          pickupOnlyOrder,
        );

        expect(orderFulfillmentAt(pickupOnlyOrder, 0).address).toBeUndefined();
        expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-pickup-1']);
        expect(result.qualificationCount).toBe(1);
      });

      it('hands the port EXACTLY the address projection and the zone, in that order', () => {
        // [model/service/PromotionService.cfc:L684]
        // `getAddressService().isAddressInZone(orderFulfillment.getAddress(), shippingAddressZone)`
        // positional, address first, zone second, and synchronous.
        addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
        evaluator = buildEvaluator(addressZones, membership);

        const singleFulfillmentOrder = shippingOnlyOrder();
        const address = resolvedAddressOf(orderFulfillmentAt(singleFulfillmentOrder, 0));

        evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            shippingAddressZoneIDs: [ZONE_ID_WEST],
            shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(singleFulfillmentOrder, 0))],
          }),
          singleFulfillmentOrder,
        );

        expect(addressZones.calls).toHaveLength(1);

        const call = recordedZoneCallAt(addressZones, 0);

        // The projection carries the four address fields `AddressService` actually compares -
        // [model/service/AddressService.cfc:L63, L66, L69, L72] - and nothing else.
        expect(call.address).toStrictEqual({
          postalCode: address.postalCode,
          city: address.city,
          stateCode: address.stateCode,
          countryCode: address.countryCode,
        });
        expect(Object.keys(call.address)).toHaveLength(4);
        expect(call.addressZone.addressZoneID).toBe(ZONE_ID_WEST);
        expect(call.addressZone.addressZoneLocations).toStrictEqual([]);
      });

      it('includes the fulfillment when the port answers TRUE for a configured zone', () => {
        addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
        evaluator = buildEvaluator(addressZones, membership);

        const singleFulfillmentOrder = shippingOnlyOrder();

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            shippingAddressZoneIDs: [ZONE_ID_WEST],
            // Configured and matching, so the L703 clause degrades to the new-address test alone
            // and the zone verdict is the only thing deciding the outcome.
            shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(singleFulfillmentOrder, 0))],
          }),
          singleFulfillmentOrder,
        );

        expect(addressZones.calls).toHaveLength(1);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-shipping-1']);
        expect(result.qualificationCount).toBe(1);
      });

      it('EXCLUDES the fulfillment when the port answers FALSE for every configured zone', () => {
        // The double is told to match nothing, EXPLICITLY. That is a positive instruction rather
        // than a default, because the two sides of this boundary disagree about empty collections
        // see the LEGACY-NOTE in §11.8.
        addressZones = new RecordingAddressZoneEvaluator([]);
        evaluator = buildEvaluator(addressZones, membership);

        const singleFulfillmentOrder = shippingOnlyOrder();

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            shippingAddressZoneIDs: [ZONE_ID_WEST],
            shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(singleFulfillmentOrder, 0))],
          }),
          singleFulfillmentOrder,
        );

        expect(addressZones.calls).toHaveLength(1);
        expect(result.qualificationCount).toBe(0);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      });

      it('STOPS LOOPING at the first matching zone [L685-L686]', () => {
        // The early exit is the source's and is preserved: a later zone can neither undo nor
        // re-confirm a match.
        addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_CENTRAL]);
        evaluator = buildEvaluator(addressZones, membership);

        const singleFulfillmentOrder = shippingOnlyOrder();

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            shippingAddressZoneIDs: [ZONE_ID_WEST, ZONE_ID_CENTRAL, ZONE_ID_EAST],
            shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(singleFulfillmentOrder, 0))],
          }),
          singleFulfillmentOrder,
        );

        expect(addressZones.calls).toHaveLength(2);
        expect(recordedZoneCallAt(addressZones, 0).addressZone.addressZoneID).toBe(ZONE_ID_WEST);
        expect(recordedZoneCallAt(addressZones, 1).addressZone.addressZoneID).toBe(ZONE_ID_CENTRAL);
        expect(result.qualificationCount).toBe(1);
      });

      it('offers EVERY configured zone when none matches', () => {
        addressZones = new RecordingAddressZoneEvaluator([]);
        evaluator = buildEvaluator(addressZones, membership);

        const singleFulfillmentOrder = shippingOnlyOrder();

        evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            shippingAddressZoneIDs: [ZONE_ID_WEST, ZONE_ID_CENTRAL, ZONE_ID_EAST],
            shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(singleFulfillmentOrder, 0))],
          }),
          singleFulfillmentOrder,
        );

        expect(
          addressZones.calls.map(
            (call: RecordedZoneCall): string => call.addressZone.addressZoneID,
          ),
        ).toStrictEqual([ZONE_ID_WEST, ZONE_ID_CENTRAL, ZONE_ID_EAST]);
      });

      it('EXCLUDES a NON-SHIPPING fulfillment without consulting any zone [L678]', () => {
        // CFML parity [model/service/PromotionService.cfc:L678]: the precondition is compound and
        // SHORT-CIRCUITING, and the failure path is silent.
        addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
        evaluator = buildEvaluator(addressZones, membership);

        const pickupOnlyOrder = makeOrderViewFixture({
          orderFulfillments: [orderFulfillmentAt(order, 1)],
        });

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { shippingAddressZoneIDs: [ZONE_ID_WEST] }),
          pickupOnlyOrder,
        );

        expect(orderFulfillmentAt(pickupOnlyOrder, 0).fulfillmentMethod.fulfillmentMethodType).toBe(
          'pickup',
        );
        expect(addressZones.calls).toStrictEqual([]);
        expect(result.qualificationCount).toBe(0);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      });

      it('folds case on the "shipping" method-type comparison [L678]', () => {
        // [model/service/PromotionService.cfc:L678] uses the CFML word operator `eq`, which is
        // case-insensitive on strings.
        addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
        evaluator = buildEvaluator(addressZones, membership);

        const baseFulfillment = orderFulfillmentAt(shippingOnlyOrder(), 0);
        const mixedCaseOrder = makeOrderViewFixture({
          fulfillmentOverrides: [
            {
              fulfillmentMethod: {
                fulfillmentMethodID: baseFulfillment.fulfillmentMethod.fulfillmentMethodID,
                fulfillmentMethodType: 'Shipping',
              },
            },
          ],
          includePickupFulfillment: false,
        });

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            shippingAddressZoneIDs: [ZONE_ID_WEST],
            shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(mixedCaseOrder, 0))],
          }),
          mixedCaseOrder,
        );

        expect(addressZones.calls).toHaveLength(1);
        expect(result.qualificationCount).toBe(1);
      });
    });

    describe('the fulfillment weight bounds [L695, L697] - PLAIN NUMERICS, never Money', () => {
      it('reads the fulfillment weight as a PLAIN NUMBER', () => {
        // A weight is not money.
        const singleFulfillmentOrder = shippingOnlyOrder();
        const totalShippingWeight = orderFulfillmentAt(
          singleFulfillmentOrder,
          0,
        ).totalShippingWeight;

        expect(typeof totalShippingWeight).toBe('number');
        expect(Number.isFinite(totalShippingWeight)).toBe(true);
        expect(totalShippingWeight).toBe(FULFILLMENT_WEIGHT);
      });

      it('does not exclude when the minimum is BELOW the weight', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { minimumFulfillmentWeight: WEIGHT_BELOW }),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('does not exclude when the minimum EQUALS the weight', () => {
        // [model/service/PromotionService.cfc:L695] compares with `gt`, so boundary equality is
        // inclusive on this side.
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { minimumFulfillmentWeight: FULFILLMENT_WEIGHT }),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('EXCLUDES when the minimum is ABOVE the weight', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { minimumFulfillmentWeight: WEIGHT_ABOVE }),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(0);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      });

      it('does not exclude when the maximum is ABOVE the weight', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { maximumFulfillmentWeight: WEIGHT_ABOVE }),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('does not exclude when the maximum EQUALS the weight', () => {
        // [model/service/PromotionService.cfc:L697] compares with `lt`, so boundary equality is
        // inclusive here too.
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { maximumFulfillmentWeight: FULFILLMENT_WEIGHT }),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('EXCLUDES when the maximum is BELOW the weight', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { maximumFulfillmentWeight: WEIGHT_BELOW }),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(0);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      });

      it('applies each bound per fulfillment, not per order', () => {
        // The golden order carries a 12.5-weight shipping fulfillment and a 0-weight pickup one.
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { minimumFulfillmentWeight: 1 }),
          order,
        );

        expect(orderFulfillmentAt(order, 1).totalShippingWeight).toBe(0);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-shipping-1']);
        expect(result.qualificationCount).toBe(1);
      });

      it('imposes no constraint when both bounds are ABSENT', () => {
        const qualifier = makeQualifier('fulfillment');

        const result = evaluator.getQualifierQualificationDetails(qualifier, shippingOnlyOrder());

        expect(qualifier.getMinimumFulfillmentWeight()).toBeUndefined();
        expect(qualifier.getMaximumFulfillmentWeight()).toBeUndefined();
        expect(result.qualificationCount).toBe(1);
      });
    });

    describe('the fulfillment-method gate [L699]', () => {
      it('imposes no constraint when the list is UNCONFIGURED (permissive)', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment'),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('includes a fulfillment whose method IS in a configured list', () => {
        const singleFulfillmentOrder = shippingOnlyOrder();

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            fulfillmentMethodIDs: [
              orderFulfillmentAt(singleFulfillmentOrder, 0).fulfillmentMethod.fulfillmentMethodID,
            ],
          }),
          singleFulfillmentOrder,
        );

        expect(result.qualificationCount).toBe(1);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-shipping-1']);
      });

      it('EXCLUDES a fulfillment whose method is NOT in a configured list (restrictive)', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            fulfillmentMethodIDs: [UNCONFIGURED_FULFILLMENT_METHOD_ID],
          }),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(0);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      });
    });

    describe('the shipping-method gate [L701] - GUARDED', () => {
      it('imposes no constraint when the list is UNCONFIGURED (permissive)', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment'),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('includes a fulfillment whose shipping method IS in a configured list', () => {
        const singleFulfillmentOrder = shippingOnlyOrder();

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(singleFulfillmentOrder, 0))],
          }),
          singleFulfillmentOrder,
        );

        expect(result.qualificationCount).toBe(1);
      });

      it('EXCLUDES a fulfillment whose shipping method is NOT in a configured list', () => {
        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { shippingMethodIDs: [UNCONFIGURED_SHIPPING_METHOD_ID] }),
          shippingOnlyOrder(),
        );

        expect(result.qualificationCount).toBe(0);
      });

      it('EXCLUDES a fulfillment with NO shipping method, WITHOUT raising [L701]', () => {
        // CFML parity [model/service/PromotionService.cfc:L701, L703]: the NULL-GUARD ASYMMETRY.
        // L701 guards its dereference with an explicit `isNull(...) ||` and therefore EXCLUDES an
        // absent shipping method gracefully.
        const pickupOnlyOrder = makeOrderViewFixture({
          orderFulfillments: [orderFulfillmentAt(order, 1)],
        });

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { shippingMethodIDs: [UNCONFIGURED_SHIPPING_METHOD_ID] }),
          pickupOnlyOrder,
        );

        expect(orderFulfillmentAt(pickupOnlyOrder, 0).shippingMethod).toBeUndefined();
        expect(result.qualificationCount).toBe(0);
        expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      });
    });
  });

  // §11.5 - defect 11 at L703, the headline of this suite.
  describe('DEFECT 11 - the shipping-address-zones clause [L703]', () => {
    /**
     * An order carrying only the shipping fulfillment.
     */
    function shippingOnlyOrder(): OrderView {
      return makeOrderViewFixture({ includePickupFulfillment: false });
    }

    it('EXCLUDES EVERY FULFILLMENT when zones are configured but shipping methods are NOT', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L703]: the shipping-address-ZONES clause
      // re-tests `hasShippingMethod` instead of testing a zone condition.
      // Preserved deliberately; do not fix without a product decision.
      addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
      evaluator = buildEvaluator(addressZones, membership);

      const singleFulfillmentOrder = shippingOnlyOrder();
      const qualifier = makeQualifier('fulfillment', {
        shippingAddressZoneIDs: [ZONE_ID_WEST],
        // No shipping methods. This single omission is the whole trigger.
      });

      const result = evaluator.getQualifierQualificationDetails(qualifier, singleFulfillmentOrder);

      // The zone was evaluated and it did answer `true` - the fulfillment's address really is in
      // the configured zone - and the verdict is discarded anyway. That is the defect, stated as
      // precisely as it can be stated.
      expect(qualifier.getShippingMethodIDs()).toStrictEqual([]);
      expect(addressZones.calls).toHaveLength(1);
      expect(recordedZoneCallAt(addressZones, 0).addressZone.addressZoneID).toBe(ZONE_ID_WEST);
      expect(result.qualificationCount).toBe(0);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
    });

    it('excludes every fulfillment of a MULTI-FULFILLMENT order under the same configuration', () => {
      // The over-exclusion is total rather than marginal: it is not one awkward fulfillment, it is
      // the entire order, including a fulfillment whose zone verdict was affirmative.
      addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
      evaluator = buildEvaluator(addressZones, membership);

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment', { shippingAddressZoneIDs: [ZONE_ID_WEST] }),
        order,
      );

      expect(order.orderFulfillments).toHaveLength(2);
      expect(result.qualificationCount).toBe(0);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
    });

    it('DEGRADES to the new-address test alone once shipping methods ARE configured', () => {
      // Reaching L703 at all means the L701 clause was FALSE, so the shipping method is present
      // and a member of the configured list.
      addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
      evaluator = buildEvaluator(addressZones, membership);

      const singleFulfillmentOrder = shippingOnlyOrder();

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment', {
          shippingAddressZoneIDs: [ZONE_ID_WEST],
          shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(singleFulfillmentOrder, 0))],
        }),
        singleFulfillmentOrder,
      );

      expect(addressZones.calls).toHaveLength(1);
      expect(result.qualificationCount).toBe(1);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-shipping-1']);
    });

    it('never reaches the new-address disjunct in isolation, because L678 gates it first', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L678, L703]: the new-address disjunct at
      // L703 is unreachable on its own.
      addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
      evaluator = buildEvaluator(addressZones, membership);

      const newAddressOrder = makeOrderViewFixture({
        includePickupFulfillment: false,
        fulfillmentOverrides: [{ addressIsNew: true }],
      });

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment', {
          shippingAddressZoneIDs: [ZONE_ID_WEST],
          shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(newAddressOrder, 0))],
        }),
        newAddressOrder,
      );

      expect(resolvedAddressOf(orderFulfillmentAt(newAddressOrder, 0)).isNew).toBe(true);
      // The zone was never consulted, which is the proof that the exclusion came from L678/L675
      // and not from the L703 new-address test.
      expect(addressZones.calls).toStrictEqual([]);
      expect(result.qualificationCount).toBe(0);
      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
    });

    it('RAISES on the UNGUARDED getAddress() dereference at L703', () => {
      // CFML parity [model/service/PromotionService.cfc:L701, L703]: the asymmetry, asserted from
      // the unguarded side.
      //
      // LEGACY-NOTE [model/service/PromotionService.cfc:L357-L360]: the reward-side sibling DOES
      // guard the same dereference - `!isNull(orderFulfillment.getAddress()) &&
      // !orderFulfillment.getAddress().isNew()` - so one component holds both a guarded and an
      // unguarded form. The guarded one is not backported here.
      addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
      evaluator = buildEvaluator(addressZones, membership);

      const baseFulfillment = orderFulfillmentAt(shippingOnlyOrder(), 0);
      const address = resolvedAddressOf(baseFulfillment);
      const observed = new ObservingFulfillmentView(baseFulfillment, {
        // Read 1 is the L678 precondition, read 2 is the L684 port call, read 3 is L703.
        addressesByRead: [address, address, undefined],
      });
      const observedOrder = makeOrderViewFixture({ orderFulfillments: [observed] });

      observed.resetObservations();

      const error = captureThrown(() =>
        evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            shippingAddressZoneIDs: [ZONE_ID_WEST],
            shippingMethodIDs: [shippingMethodIDOf(baseFulfillment)],
          }),
          observedOrder,
        ),
      );

      expect(error).toBeInstanceOf(TypeError);
      expect(error.message).toContain('model/service/PromotionService.cfc:L703');
      expect(error.message).toContain(baseFulfillment.orderFulfillmentID);
      // Three address reads: L678, L684 and L703 - the exact count the source performs.
      expect(
        observed.readLog.filter(
          (property: ObservedFulfillmentProperty): boolean => property === 'address',
        ),
      ).toHaveLength(3);
    });

    it('RAISES on the UNGUARDED getAddress() dereference at L678', () => {
      // The FIRST of the arm's three unguarded dereferences, reached with ordinary constant data:
      // a shipping-type fulfillment whose address was never resolved, against a zone-bearing
      // qualifier.
      addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
      evaluator = buildEvaluator(addressZones, membership);

      const addresslessOrder = makeOrderViewFixture({
        includePickupFulfillment: false,
        // The key is PRESENT and explicitly `undefined`, which the fixture's own-key check honours
        // as "no address" rather than "use the default".
        fulfillmentOverrides: [{ address: undefined }],
      });

      const error = captureThrown(() =>
        evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', { shippingAddressZoneIDs: [ZONE_ID_WEST] }),
          addresslessOrder,
        ),
      );

      expect(orderFulfillmentAt(addresslessOrder, 0).address).toBeUndefined();
      expect(error).toBeInstanceOf(TypeError);
      expect(error.message).toContain('model/service/PromotionService.cfc:L678');
      // The port is never reached, because the precondition raises before the zone loop starts.
      expect(addressZones.calls).toStrictEqual([]);
    });

    it('RAISES on the UNGUARDED getAddress() dereference at L684', () => {
      // The SECOND of the arm's three unguarded dereferences, completing the trio - L678, L684 and
      // L703 - each of which re-reads `getAddress()` afresh.
      //
      // The port is still never CALLED, because the dereference happens while its argument is
      // being evaluated.
      addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
      evaluator = buildEvaluator(addressZones, membership);

      const baseFulfillment = orderFulfillmentAt(shippingOnlyOrder(), 0);
      const observed = new ObservingFulfillmentView(baseFulfillment, {
        // Read 1 is the L678 precondition, read 2 is the L684 port argument.
        addressesByRead: [resolvedAddressOf(baseFulfillment), undefined],
      });
      const observedOrder = makeOrderViewFixture({ orderFulfillments: [observed] });

      observed.resetObservations();

      const error = captureThrown(() =>
        evaluator.getQualifierQualificationDetails(
          makeQualifier('fulfillment', {
            shippingAddressZoneIDs: [ZONE_ID_WEST],
            shippingMethodIDs: [shippingMethodIDOf(baseFulfillment)],
          }),
          observedOrder,
        ),
      );

      expect(error).toBeInstanceOf(TypeError);
      expect(error.message).toContain('model/service/PromotionService.cfc:L684');
      expect(addressZones.calls).toStrictEqual([]);
      expect(
        observed.readLog.filter(
          (property: ObservedFulfillmentProperty): boolean => property === 'address',
        ),
      ).toHaveLength(2);
    });
  });

  // §11.6 - the second latent throw hazard at L707-L709.
  describe('the indexed removal [model/service/PromotionService.cfc:L707-L709]', () => {
    it('removes exactly the excluded fulfillment and leaves the survivors in order', () => {
      // The removal is by INDEX, recovered with `arrayFind` over the array the append at L666
      // filled.
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment', { maximumFulfillmentWeight: 0 }),
        order,
      );

      expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-pickup-1']);
      expect(result.qualificationCount).toBe(1);
    });

    it('RAISES when the searched ID is absent, reproducing arrayDeleteAt(array, 0)', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L708-L709]:
      // `arrayDeleteAt(qualifiedFulfillmentIDs, arrayFind(qualifiedFulfillmentIDs,...))` consumes
      // `arrayFind`'s result directly as a position.
      // Preserved deliberately; do not fix without a product decision.
      //
      // No `di > 0` GUARD is ADDED, no defensive check is introduced, and no filter/splice
      // formulation that silently no-ops on a miss is used.
      const baseFulfillment = orderFulfillmentAt(
        makeOrderViewFixture({ includePickupFulfillment: false }),
        0,
      );
      const observed = new ObservingFulfillmentView(baseFulfillment, {
        // Read 1 is the L666 append, read 2 is the L708 search. They disagree, so `arrayFind`
        // misses.
        orderFulfillmentIDsByRead: ['of-appended-under-one-id', 'of-searched-under-another'],
      });
      const observedOrder = makeOrderViewFixture({ orderFulfillments: [observed] });

      observed.resetObservations();

      const error = captureThrown(() =>
        evaluator.getQualifierQualificationDetails(
          // Any exclusion will do; the weight minimum is the cheapest one that needs no
          // collaborator.
          makeQualifier('fulfillment', { minimumFulfillmentWeight: WEIGHT_ABOVE }),
          observedOrder,
        ),
      );

      expect(error).toBeInstanceOf(RangeError);
      expect(error.message).toContain('arrayDeleteAt index out of range');
      expect(error.message).toContain('of-searched-under-another');
      expect(error.message).toContain('model/service/PromotionService.cfc:L708-L709');
    });

    it('does not raise when the fulfillment is INCLUDED, because no removal is attempted', () => {
      // The removal sits inside the exclusion branch, so a divergent ID is harmless on the
      // inclusion path: the append happened, nothing searches, and the appended value survives
      // verbatim.
      const baseFulfillment = orderFulfillmentAt(
        makeOrderViewFixture({ includePickupFulfillment: false }),
        0,
      );
      const observed = new ObservingFulfillmentView(baseFulfillment, {
        orderFulfillmentIDsByRead: ['of-appended-under-one-id', 'of-searched-under-another'],
      });
      const observedOrder = makeOrderViewFixture({ orderFulfillments: [observed] });

      observed.resetObservations();

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment'),
        observedOrder,
      );

      expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-appended-under-one-id']);
      expect(result.qualificationCount).toBe(1);
      expect(
        observed.readLog.filter(
          (property: ObservedFulfillmentProperty): boolean => property === 'orderFulfillmentID',
        ),
      ).toHaveLength(1);
    });
  });

  describe('the ORDER ITEM arm [model/service/PromotionService.cfc:L714-L749]', () => {
    /**
     * Rebuilds the subject over a membership double that qualifies the named items.
     */
    function withQualifyingItems(orderItemIDs: readonly string[]): void {
      membership = new RecordingOrderItemMembership(orderItemIDs);
      evaluator = buildEvaluator(addressZones, membership);
    }

    it('offers EVERY order item to the membership test, once each, in iteration order', () => {
      evaluator.getQualifierQualificationDetails(makeQualifier('merchandise'), order);

      expect(
        membership.getOrderItemInQualifierCalls.map(
          (call: RecordedMembershipCall): string => call.orderItem.orderItemID,
        ),
      ).toStrictEqual(everyOrderItemID(order));
    });

    it('forwards the SAME qualifier instance and the respective item, with POSITIVE polarity', () => {
      // CFML parity [model/service/PromotionService.cfc:L727]: the source calls
      // `getOrderItemInQualifier(qualifier=qualifier, orderItem=orderItem)` with KEYWORD arguments
      // and consumes the answer POSITIVELY - a `true` includes the item.
      const firstItem = orderItemAt(order, 0);
      withQualifyingItems([firstItem.orderItemID]);

      const qualifier = makeQualifier('merchandise', { minimumItemQuantity: 1 });

      const result = evaluator.getQualifierQualificationDetails(qualifier, order);

      const call = recordedMembershipCallAt(membership, 0);

      expect(call.qualifier).toBe(qualifier);
      expect(call.orderItem).toBe(firstItem);
      expect(result.qualifiedOrderItemDetails).toHaveLength(1);
      expect(qualifiedOrderItemDetailAt(result, 0).orderItem).toBe(firstItem);
    });

    it('a FALSE membership answer excludes the item entirely - no record is appended', () => {
      // CFML parity [model/service/PromotionService.cfc:L727, L733]: L733 sits INSIDE the L727
      // gate, so a non-qualifying item's record is built and then silently discarded. No record
      // with a zero `qualificationCount` is ever appended.
      withQualifyingItems([]);

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('merchandise', { minimumItemQuantity: 1 }),
        order,
      );

      expect(membership.getOrderItemInQualifierCalls).toHaveLength(order.orderItems.length);
      expect(result.qualifiedOrderItemDetails).toStrictEqual([]);
      expect(result.qualificationCount).toBe(0);
    });

    it('appends a record only for the qualifying items, in iteration order', () => {
      const secondItem = orderItemAt(order, 1);
      const thirdItem = orderItemAt(order, 2);
      withQualifyingItems([secondItem.orderItemID, thirdItem.orderItemID]);

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('merchandise', { minimumItemQuantity: 1 }),
        order,
      );

      expect(
        result.qualifiedOrderItemDetails.map(
          (detail: QualifiedOrderItemDetail): string => detail.orderItem.orderItemID,
        ),
      ).toStrictEqual([secondItem.orderItemID, thirdItem.orderItemID]);
    });

    // JUDGMENT CALL: the record's FINAL SHAPE is what is asserted, because the target constructs
    // it once with its final value rather than building it at
    // [model/service/PromotionService.cfc:L722-L725] with a zero and mutating that member at
    // [model/service/PromotionService.cfc:L729].
    it('records each qualifying item with the item quantity as its qualification count', () => {
      const firstItem = orderItemAt(order, 0);
      withQualifyingItems([firstItem.orderItemID]);

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('merchandise', { minimumItemQuantity: 1 }),
        order,
      );

      expect(qualifiedOrderItemDetailAt(result, 0)).toStrictEqual({
        orderItem: firstItem,
        qualificationCount: firstItem.quantity,
      });
      // A plain count, never money.
      expect(typeof qualifiedOrderItemDetailAt(result, 0).qualificationCount).toBe('number');
    });

    it('leaves qualifiedFulfillmentIDs untouched and consults no address zone', () => {
      withQualifyingItems(everyOrderItemID(order));

      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('merchandise', { minimumItemQuantity: 1 }),
        order,
      );

      expect(result.qualifiedFulfillmentIDs).toStrictEqual([]);
      expect(addressZones.calls).toStrictEqual([]);
    });

    describe('the qualifying-quantity gate [L740] and the division [L742-L743]', () => {
      it('short-circuits before the division when NOTHING qualified', () => {
        // [model/service/PromotionService.cfc:L740] `gt 0` wraps L742-L744, so an order in which
        // nothing qualified never reaches the division at all. The proof is that a ZERO minimum -
        // which would otherwise raise - is harmless here.
        withQualifyingItems([]);

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('merchandise', { minimumItemQuantity: 0 }),
          order,
        );

        expect(result.qualificationCount).toBe(0);
        expect(result.qualifiedOrderItemDetails).toStrictEqual([]);
      });

      it('leaves the count at ZERO when minimumItemQuantity is ABSENT - RESTRICTIVE', () => {
        // CFML parity [model/service/PromotionService.cfc:L742]: the null polarity is restrictive.
        // There is no `else` and no fallback, so a qualifier that matched items but configures no
        // minimum qualifies nothing.
        //
        // LEGACY-NOTE [model/service/PromotionService.cfc:L742, L830]: L830 - the structurally
        // parallel guard inside `getPromotionPeriodOrderItemQualificationCount`, owned
        // by./promotionPeriodQualification.test.ts.
        const qualifier = promotionFixtures.permissivePromotionQualifier;
        withQualifyingItems(everyOrderItemID(order));

        const result = evaluator.getQualifierQualificationDetails(qualifier, order);

        expect(qualifier.getQualifierType()).toBe('merchandise');
        expect(qualifier.getMinimumItemQuantity()).toBeUndefined();
        expect(result.qualifiedOrderItemDetails).toHaveLength(order.orderItems.length);
        expect(result.qualificationCount).toBe(0);
      });

      it('divides the accumulated quantity by the configured minimum', () => {
        // Quantities 3, 2 and 4 accumulate to 9; a minimum of 1 divides to.
        withQualifyingItems(everyOrderItemID(order));

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('merchandise', { minimumItemQuantity: 1 }),
          order,
        );

        expect(result.qualificationCount).toBe(9);
      });

      it('TRUNCATES TOWARD ZERO on a positive non-integer quotient - not Math.round', () => {
        // [model/service/PromotionService.cfc:L743] wraps the division in CFML `int()`, which
        // TRUNCATES rather than rounds. 9 / 2 is 4.5: truncation answers 4 and rounding would
        // answer.
        withQualifyingItems(everyOrderItemID(order));

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('merchandise', { minimumItemQuantity: 2 }),
          order,
        );

        expect(result.qualificationCount).toBe(4);
      });

      it('TRUNCATES TOWARD ZERO on a negative quotient - not Math.floor', () => {
        withQualifyingItems(everyOrderItemID(order));

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('merchandise', { minimumItemQuantity: -2 }),
          order,
        );

        expect(result.qualificationCount).toBe(-4);
      });

      it('RAISES on a ZERO divisor rather than yielding Infinity', () => {
        withQualifyingItems(everyOrderItemID(order));

        const error = captureThrown(() =>
          evaluator.getQualifierQualificationDetails(
            makeQualifier('merchandise', { minimumItemQuantity: 0 }),
            order,
          ),
        );

        expect(error).toBeInstanceOf(RangeError);
        expect(error.message).toContain('minimumItemQuantity is 0');
        expect(error.message).toContain('model/service/PromotionService.cfc:L743');
      });

      it('answers zero when the quotient truncates below one', () => {
        // A single 3-unit item against a minimum of 4 truncates 0.75 to 0: the item matched, a
        // record was appended, and the qualifier still qualifies nothing.
        const firstItem = orderItemAt(order, 0);
        withQualifyingItems([firstItem.orderItemID]);

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('merchandise', { minimumItemQuantity: 4 }),
          order,
        );

        expect(firstItem.quantity).toBe(3);
        expect(result.qualifiedOrderItemDetails).toHaveLength(1);
        expect(result.qualificationCount).toBe(0);
      });
    });

    describe('driven through the REAL, shipped OrderItemMembership', () => {
      it('qualifies only the item whose SKU the qualifier includes', () => {
        // The complementary evidence for the JUDGMENT CALL on the membership double: an UNMODIFIED
        // `new OrderItemMembership()` is injected here, so the arm runs against the real
        // seven-operand exclusion-then-inclusion algorithm end to end.
        const firstItem = orderItemAt(order, 0);
        evaluator = buildEvaluator(addressZones, new OrderItemMembership());

        const result = evaluator.getQualifierQualificationDetails(
          makeQualifier('merchandise', {
            skus: [firstItem.sku],
            minimumItemQuantity: 1,
          }),
          order,
        );

        expect(result.qualifiedOrderItemDetails).toHaveLength(1);
        expect(qualifiedOrderItemDetailAt(result, 0).orderItem).toBe(firstItem);
        expect(result.qualificationCount).toBe(firstItem.quantity);
      });

      it('qualifies NOTHING for a qualifier with no inclusion criteria at all', () => {
        evaluator = buildEvaluator(addressZones, new OrderItemMembership());

        const result = evaluator.getQualifierQualificationDetails(
          promotionFixtures.permissivePromotionQualifier,
          order,
        );

        expect(result.qualifiedOrderItemDetails).toStrictEqual([]);
        expect(result.qualificationCount).toBe(0);
      });
    });
  });

  // §11.8 - addresses and orders are read-only views.
  describe('the read-only anti-corruption boundary', () => {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L357-L359] and
    // [model/service/AddressService.cfc:L58, L60-L61]: the empty-collection polarities on the two
    // sides of this port disagree, and collapsing them would be a money bug.
    it('carries only the four AddressService comparison fields across the port', () => {
      addressZones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
      evaluator = buildEvaluator(addressZones, membership);

      const singleFulfillmentOrder = makeOrderViewFixture({ includePickupFulfillment: false });
      const fulfillment = orderFulfillmentAt(singleFulfillmentOrder, 0);
      const address = resolvedAddressOf(fulfillment);

      evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment', {
          shippingAddressZoneIDs: [ZONE_ID_WEST],
          shippingMethodIDs: [shippingMethodIDOf(fulfillment)],
        }),
        singleFulfillmentOrder,
      );

      const projection = recordedZoneCallAt(addressZones, 0).address;

      expect(Object.keys(address)).toHaveLength(5);
      expect(address.isNew).toBe(false);
      expect(Object.keys(projection).sort()).toStrictEqual([
        'city',
        'countryCode',
        'postalCode',
        'stateCode',
      ]);
    });

    /**
     * Drives all three arms over one order graph and asserts every value the arms read is
     * unchanged.
     *
     * @param subjectOrder the frozen order projection to drive.
     */
    function withNoWriteAttempted(subjectOrder: OrderView): void {
      const beforeFulfillmentIDs = subjectOrder.orderFulfillments.map(
        (orderFulfillment: OrderFulfillmentView): string => orderFulfillment.orderFulfillmentID,
      );
      const beforeItemQuantities = subjectOrder.orderItems.map(
        (orderItem: OrderItemView): number => orderItem.quantity,
      );
      const beforeSubtotal = subjectOrder.subtotal.toDecimalString();
      const beforeTotalSaleQuantity = subjectOrder.totalSaleQuantity;
      const beforeAddress = resolvedAddressOf(orderFulfillmentAt(subjectOrder, 0));

      const zones = new RecordingAddressZoneEvaluator([ZONE_ID_WEST]);
      const items = new RecordingOrderItemMembership(everyOrderItemID(subjectOrder));
      const subject = buildEvaluator(zones, items);

      subject.getQualifierQualificationDetails(
        makeQualifier('order', { minimumOrderQuantity: 1 }),
        subjectOrder,
      );
      subject.getQualifierQualificationDetails(
        makeQualifier('fulfillment', {
          shippingAddressZoneIDs: [ZONE_ID_WEST],
          shippingMethodIDs: [shippingMethodIDOf(orderFulfillmentAt(subjectOrder, 0))],
        }),
        subjectOrder,
      );
      subject.getQualifierQualificationDetails(
        makeQualifier('merchandise', { minimumItemQuantity: 1 }),
        subjectOrder,
      );

      expect(
        subjectOrder.orderFulfillments.map(
          (orderFulfillment: OrderFulfillmentView): string => orderFulfillment.orderFulfillmentID,
        ),
      ).toStrictEqual(beforeFulfillmentIDs);
      expect(
        subjectOrder.orderItems.map((orderItem: OrderItemView): number => orderItem.quantity),
      ).toStrictEqual(beforeItemQuantities);
      expect(subjectOrder.subtotal.toDecimalString()).toBe(beforeSubtotal);
      expect(subjectOrder.totalSaleQuantity).toBe(beforeTotalSaleQuantity);
      expect(resolvedAddressOf(orderFulfillmentAt(subjectOrder, 0))).toBe(beforeAddress);
    }

    it('receives a deeply FROZEN order graph and does not need to write to it', () => {
      // The structural half of the no-mutation proof: the fixture freezes the order, its
      // collections, each fulfillment and each address, so any write the subject attempted would
      // raise here.
      const frozenOrder = makeOrderViewFixture();

      expect(Object.isFrozen(frozenOrder)).toBe(true);
      expect(Object.isFrozen(frozenOrder.orderFulfillments)).toBe(true);
      expect(Object.isFrozen(frozenOrder.orderItems)).toBe(true);
      expect(Object.isFrozen(orderFulfillmentAt(frozenOrder, 0))).toBe(true);
      expect(Object.isFrozen(resolvedAddressOf(orderFulfillmentAt(frozenOrder, 0)))).toBe(true);

      withNoWriteAttempted(frozenOrder);
    });

    it("never hands back one of the order graph's own arrays", () => {
      // The verdict's collections are the subject's, not the view's, so a caller splicing a
      // verdict cannot reach into order persistence through it.
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment'),
        order,
      );

      expect(result.qualifiedFulfillmentIDs).not.toBe(order.orderFulfillments);
      expect(result.qualifiedOrderItemDetails).not.toBe(order.orderItems);
      expect(Object.isFrozen(result.qualifiedFulfillmentIDs)).toBe(false);
    });

    it('emits opaque identifiers for the out-of-scope aggregate, never order entities', () => {
      // The seam that makes this slice independently deployable: the verdict names fulfillments by
      // opaque string ID rather than carrying an order-owned entity out of the engine.
      const result = evaluator.getQualifierQualificationDetails(
        makeQualifier('fulfillment'),
        order,
      );

      for (const qualifiedFulfillmentID of result.qualifiedFulfillmentIDs) {
        expect(typeof qualifiedFulfillmentID).toBe('string');
      }
      expect(result.qualifiedFulfillmentIDs).toStrictEqual(['of-shipping-1', 'of-pickup-1']);
    });
  });
});
