// slatwall-ts - PromotionService: the thin facade over the ported promotion engine, and the surface
// AAP 0.4.2 holds to interface parity. Port of model/service/PromotionService.cfc (1,125 lines).

// Two of the three divergences AAP 0.6.7 permits are spent in `./promotion/discountAmount.ts` and
// recorded here so the budget is auditable from the service surface.
//
// LEGACY-DEFECT [model/service/PromotionService.cfc:L998]: the `amountOff` branch multiplies in raw
// floating point while both sibling branches use `precisionEvaluate`.
// DELIBERATE DIVERGENCE [model/service/PromotionService.cfc:L998]: closed, because all money
// arithmetic passes through `Money`.
//
// LEGACY-DEFECT [model/service/PromotionService.cfc:L1007, L1009, L1014]: `discountAmount` is
// assigned without `var` at three sites, leaking into the component `variables` scope.
// DELIBERATE DIVERGENCE [model/service/PromotionService.cfc:L1007]: made function-local, because
// state surviving a warm invocation could leak one customer's discount into another's order.

// LEGACY-NOTE [model/service/PromotionService.cfc:L401, L447, L530]: `this.newPromotionApplied()`
// is `HibachiService`'s generic `new<Entity>()` factory, not a declared collaborator.
import type { Promotion } from '../domain/entities/promotion.js';
import type { PromotionCode } from '../domain/entities/promotionCode.js';
import type { PromotionPeriod } from '../domain/entities/promotionPeriod.js';
import type { PromotionQualifier } from '../domain/entities/promotionQualifier.js';
import type { PromotionReward } from '../domain/entities/promotionReward.js';
import type {
  AddressProjection,
  AddressZoneEvaluator,
  AddressZoneProjection,
} from '../domain/ports/addressZoneEvaluator.js';
import type { PromotionRepository, SalePriceDetail } from '../domain/ports/promotionRepository.js';
import type {
  PeriodQualification,
  PromotionPeriodQualifications,
  QualifierQualification,
} from '../domain/promotionEngine/qualificationTypes.js';
import type {
  OrderItemQualifiedDiscounts,
  PromotionAppliedIntent,
  QualifiedDiscount,
} from '../domain/promotionEngine/qualifiedDiscountTypes.js';
import type { PromotionRewardUsageDetail } from '../domain/promotionEngine/rewardUsageTypes.js';
import { Money } from '../domain/valueObjects/money.js';
import type {
  OrderFulfillmentView,
  ShippingAddressView,
} from '../domain/views/orderFulfillmentView.js';
import type { OrderItemView } from '../domain/views/orderItemView.js';
import type { OrderView, ShippingMethodOptionView } from '../domain/views/orderView.js';
import { listFindNoCase } from '../lib/cfml/list.js';
import { cfEquals, structGet, structKeyExists } from '../lib/cfml/struct.js';
import { isNullish } from '../lib/cfml/truthiness.js';
import { DiscountAmountCalculator } from './promotion/discountAmount.js';
import { OrderItemMembership } from './promotion/orderItemMembership.js';
import { stripOverUsedRewardDiscounts } from './promotion/overUseStripping.js';
import { applyBestOrderItemDiscounts } from './promotion/promotionApplication.js';
import { PromotionPeriodQualificationEvaluator } from './promotion/promotionPeriodQualification.js';
import { QualifierQualificationEvaluator } from './promotion/qualifierQualification.js';
import { RewardUsageLedger } from './promotion/rewardUsageLedger.js';
import { SalePriceSeeder } from './promotion/salePriceSeeding.js';
import type { RewardVisitOutcome } from './promotion/twoPassRewardIterator.js';
import { TwoPassRewardIterator } from './promotion/twoPassRewardIterator.js';

// JUDGMENT CALL: this façade imports its nine `./promotion/*` decomposition modules directly -
// they are its own subtree, not sibling services, and delegating to them is the entire point of
// the decomposition.

/**
 * The two rounding-rule members this service reaches, as a narrow structural collaborator.
 *
 * JUDGMENT CALL: narrow structural collaborator, satisfied in `src/handlers/bootstrap.ts` by the
 * sibling `RoundingRuleService` instance.
 */
type RoundingRuleValueResolver = ConstructorParameters<typeof DiscountAmountCalculator>[0];

/**
 * The one framework-generic read this service still needs, as a narrow structural collaborator.
 */
interface PromotionFrameworkReads {
  /**
   * `HibachiService`'s generic `get<Entity>(id)`, narrowed to the one entity this service loads.
   */
  getPromotion(promotionID: string): Promise<Promotion>;
}

/**
 * What `getShippingMethodOptionsDiscountAmountDetails` returns.
 *
 * [model/service/PromotionService.cfc:L1033-L1036]
 * `var details = { promotionID="", discountAmount=0 };` - two members, seeded exactly as the
 * source seeds them.
 *
 * JUDGMENT CALL: `ShippingMethodOptionView` is IMPORTED from `../domain/views/orderView.js`, which
 * is its documented home and where its four members are declared; only `ShippingDiscountDetails`
 * is declared here.
 */
export interface ShippingDiscountDetails {
  /**
   * [model/service/PromotionService.cfc:L1034] seeded to the EMPTY STRING, and still the empty
   * string when nothing qualified.
   */
  readonly promotionID: string;

  /**
   * [model/service/PromotionService.cfc:L1035] seeded to zero.
   *
   * JUDGMENT CALL: `Money.zero` here is an accumulator seed for a maximum-search, not a fallback
   * for an absent price.
   */
  readonly discountAmount: Money;
}

/**
 * A local mirror of one applied-promotion slot on the live ORM graph, as it stands after the
 * blanket clear - which is to say, starting empty.
 *
 * The fulfillment arm [model/service/PromotionService.cfc:L345-L412] and the order arm
 * [model/service/PromotionService.cfc:L415-L454] are structurally identical and both operate on a
 * LIVE Hibernate graph: they read `getAppliedPromotions()[1]`.
 */
interface AppliedPromotionSlot {
  /**
   * This single member replaces the three the seeded design needed.
   */
  current: { promotionID: string; discountAmount: Money } | undefined;
}

/**
 * A mirror in its post-clear state.
 *
 * CFML parity [model/service/PromotionService.cfc:L64-L80]: the blanket clear has already detached
 * every applied promotion from this target, so the collection the legacy is about to read is
 * empty.
 *
 * CFML parity [model/service/PromotionService.cfc:L381, L385, L427, L431]: the source tests
 * `!arrayLen(getAppliedPromotions())` and then reads index `[1]`. CFML arrays are 1-based, so
 * `[1]` is the FIRST element.
 */
function createEmptyAppliedPromotionSlot(): AppliedPromotionSlot {
  return { current: undefined };
}

/**
 * Replays one reward's outcome against the mirror.
 *
 * CFML parity [model/service/PromotionService.cfc:L378, L424]: `if(discountAmount > 0)` gates the
 * whole comparison, so a reward computing a non-positive discount is skipped entirely and leaves
 * the mirror untouched.
 *
 * CFML parity [model/service/PromotionService.cfc:L385, L431]: the displacement test is STRICTLY
 * greater-than, so on a tie the incumbent is kept and the FIRST qualifying reward wins.
 */
function mirrorRewardApplication(
  slot: AppliedPromotionSlot,
  rewardPromotionID: string,
  discountAmount: Money,
): void {
  if (!discountAmount.isGreaterThan(Money.zero)) {
    return;
  }

  const current = slot.current;

  // [model/service/PromotionService.cfc:L381-L382, L427-L428] nothing applied yet, so apply this.
  // Post-clear this is the branch the FIRST winning reward always takes, at both levels.
  if (current === undefined) {
    slot.current = { promotionID: rewardPromotionID, discountAmount };
    return;
  }

  // [model/service/PromotionService.cfc:L385, L431] only a strictly greater discount displaces.
  // The incumbent here is necessarily a row this invocation created, never a persisted one.
  if (!discountAmount.isGreaterThan(current.discountAmount)) {
    return;
  }

  // [model/service/PromotionService.cfc:L388-L389, L434-L435] same promotion, so the legacy
  // revises the amount on the existing row in place.
  if (cfEquals(current.promotionID, rewardPromotionID)) {
    slot.current = { promotionID: current.promotionID, discountAmount };
    return;
  }

  // [model/service/PromotionService.cfc:L392-L394, L438-L440] a different promotion, so the legacy
  // unlinks the incumbent and attaches a new row.
  slot.current = { promotionID: rewardPromotionID, discountAmount };
}

/**
 * Which of the two arms a mirror belongs to, and the opaque identifier its intents carry.
 */
type AppliedPromotionSlotTarget =
  | { readonly appliedType: 'order'; readonly orderID: string }
  | { readonly appliedType: 'orderFulfillment'; readonly orderFulfillmentID: string };

/**
 * Emits what the mirror holds at the end of the invocation.
 */
function emitAppliedPromotionSlotIntents(
  slot: AppliedPromotionSlot,
  target: AppliedPromotionSlotTarget,
): PromotionAppliedIntent[] {
  const current = slot.current;

  // No reward ever won this slot, so the legacy created no row here.
  if (current === undefined) {
    return [];
  }

  if (target.appliedType === 'order') {
    return [
      {
        promotionID: current.promotionID,
        operation: 'add',
        discountAmount: current.discountAmount,
        appliedType: 'order',
        orderID: target.orderID,
      },
    ];
  }

  return [
    {
      promotionID: current.promotionID,
      operation: 'add',
      discountAmount: current.discountAmount,
      appliedType: 'orderFulfillment',
      orderFulfillmentID: target.orderFulfillmentID,
    },
  ];
}

/**
 * Reproduces the three backwards clear-out loops at [model/service/PromotionService.cfc:L61-L80]
 * as `remove` intents - one per applied-promotion row the view reported, at all three levels.
 *
 * No gate, no comparison, no same-promotion test: every row goes.
 *
 * Traversal order is preserved exactly, though nothing in the target depends on it.
 */
function buildBlanketClearIntents(order: OrderView): PromotionAppliedIntent[] {
  const intents: PromotionAppliedIntent[] = [];

  // [model/service/PromotionService.cfc:L64-L68] Order items, last item first, last row first.
  for (let itemIndex = order.orderItems.length - 1; itemIndex >= 0; itemIndex -= 1) {
    // Narrowed rather than asserted: `noUncheckedIndexedAccess` types an indexed read as possibly
    // absent even inside a bounded loop, and non-null assertions are unavailable by project
    // standard.
    const orderItem = order.orderItems[itemIndex];

    if (orderItem === undefined) {
      continue;
    }

    for (let rowIndex = orderItem.appliedPromotions.length - 1; rowIndex >= 0; rowIndex -= 1) {
      const appliedPromotion = orderItem.appliedPromotions[rowIndex];

      if (appliedPromotion !== undefined) {
        intents.push({
          // The row's own identity, not a re-derivation of it.
          promotionAppliedID: appliedPromotion.promotionAppliedID,
          promotionID: appliedPromotion.promotion?.promotionID,
          operation: 'remove',
          appliedType: 'orderItem',
          orderItemID: orderItem.orderItemID,
        });
      }
    }
  }

  // [model/service/PromotionService.cfc:L71-L75] Fulfillments, last fulfillment first, last row
  // first.
  for (
    let fulfillmentIndex = order.orderFulfillments.length - 1;
    fulfillmentIndex >= 0;
    fulfillmentIndex -= 1
  ) {
    const orderFulfillment = order.orderFulfillments[fulfillmentIndex];

    if (orderFulfillment === undefined) {
      continue;
    }

    for (
      let rowIndex = orderFulfillment.appliedPromotions.length - 1;
      rowIndex >= 0;
      rowIndex -= 1
    ) {
      const appliedPromotion = orderFulfillment.appliedPromotions[rowIndex];

      if (appliedPromotion !== undefined) {
        // Row identity and a nullable promotion, for the reasons given at the order-item loop
        // above; the legacy locator for this level is [model/service/PromotionService.cfc:L73].
        intents.push({
          promotionAppliedID: appliedPromotion.promotionAppliedID,
          promotionID: appliedPromotion.promotion?.promotionID,
          operation: 'remove',
          appliedType: 'orderFulfillment',
          orderFulfillmentID: orderFulfillment.orderFulfillmentID,
        });
      }
    }
  }

  // [model/service/PromotionService.cfc:L78-L80] The order itself, last row first.
  for (let rowIndex = order.appliedPromotions.length - 1; rowIndex >= 0; rowIndex -= 1) {
    const appliedPromotion = order.appliedPromotions[rowIndex];

    if (appliedPromotion !== undefined) {
      // Row identity and a nullable promotion, as at both loops above; the legacy locator for the
      // order level is [model/service/PromotionService.cfc:L79].
      intents.push({
        promotionAppliedID: appliedPromotion.promotionAppliedID,
        promotionID: appliedPromotion.promotion?.promotionID,
        operation: 'remove',
        appliedType: 'order',
        orderID: order.orderID,
      });
    }
  }

  return intents;
}

/**
 * Writes a key that an externally-sourced identifier may name, without letting a reserved name be
 * silently intercepted.
 *
 * A plain `target[key] = value` for the key `__proto__` stores nothing on the object: it walks the
 * inherited setter instead.
 */
function putOwnStructKey<TValue>(target: Record<string, TValue>, key: string, value: TValue): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * Reduces a fulfillment address view to the projection the address-zone port accepts.
 *
 * The port's projection members are nullable, and the view's are optional, so absence is
 * normalised to `null` rather than dropped.
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
 * Reduces the reward's configured address-zone identifiers to zone projections.
 *
 * LEGACY-NOTE [model/entity/PromotionReward.cfc:L77]: the legacy association is the many-to-many
 * link table `SwPromoRewardShipAddressZone`, and the ported entity deliberately publishes it as
 * `getShippingAddressZoneIDs(): readonly string[]` rather than as an array of `AddressZone`
 * entities.
 */
function toConfiguredShippingAddressZones(
  addressZoneIDs: readonly string[],
): readonly AddressZoneProjection[] {
  return addressZoneIDs.map((addressZoneID) => ({ addressZoneID, addressZoneLocations: [] }));
}

/**
 * Dereferences a reward's promotion period, reproducing the legacy unguarded dereference.
 *
 * CFML parity
 * [model/service/PromotionService.cfc:L192, L193, L197, L209, L212, L213, L222, L223, L276, L290, L351, L388, L403, L434, L449]:
 * the source writes `reward.getPromotionPeriod().getPromotionPeriodID()` and
 * `reward.getPromotionPeriod().getPromotion()` at every one of those sites with no null test.
 */
function dereferencePromotionPeriod(reward: PromotionReward, locator: string): PromotionPeriod {
  const promotionPeriod = reward.getPromotionPeriod();

  if (promotionPeriod === undefined) {
    throw new TypeError(
      `Unresolved promotionPeriod for promotionRewardID "${reward.getPromotionRewardID()}". ` +
        `Reproduces the unguarded legacy dereference at ` +
        `model/service/PromotionService.cfc:${locator}, which raises a null reference when the ` +
        `mandatory promotionPeriod association has not been resolved.`,
    );
  }

  return promotionPeriod;
}

/**
 * Reproduces `Order.getSubtotalAfterItemDiscounts()` as the order arm reads it in pass two.
 *
 * CFML parity [model/entity/Order.cfc:L689, L691]: the type-code comparisons are CFML `==` on
 * strings, which is CASE-INSENSITIVE, so they are routed through the case-folding helper rather
 * than `===`.
 */
function computeSubtotalAfterItemDiscounts(order: OrderView): Money {
  let subtotal = Money.zero;

  for (const orderItem of order.orderItems) {
    const typeCode = orderItem.orderItemType.systemCode;
    if (cfEquals(typeCode, 'oitSale')) {
      subtotal = subtotal.plus(orderItem.extendedPrice);
      continue;
    }
    if (cfEquals(typeCode, 'oitReturn')) {
      subtotal = subtotal.minus(orderItem.extendedPrice);
      continue;
    }

    // [model/entity/Order.cfc:L693-L694] the legacy `throw()`, message and all.
    throw new TypeError(
      'there was an issue calculating the subtotal because of a orderItemType associated with one ' +
        `of the items. Reproduces model/entity/Order.cfc:L694 for orderItemID ` +
        `"${orderItem.orderItemID}" carrying orderItemType systemCode "${typeCode}".`,
    );
  }

  return subtotal;
}

/**
 * Reproduces `Order.getFulfillmentChargeAfterDiscountTotal()` as the order arm reads it in pass
 * two.
 *
 * Which applied promotions those are is decided entirely by this invocation.
 *
 * CFML parity [model/entity/OrderFulfillment.cfc:L188-L191]: the subtrahend is a sum over the
 * whole collection, but only index `[1]` is ever written by the engine
 * [model/service/PromotionService.cfc:L381-L406].
 */
function computeFulfillmentChargeAfterDiscountTotal(
  order: OrderView,
  fulfillmentSlots: Record<string, AppliedPromotionSlot>,
): Money {
  let total = Money.zero;

  for (const orderFulfillment of order.orderFulfillments) {
    const slot = structGet(fulfillmentSlots, orderFulfillment.orderFulfillmentID);
    const appliedDiscount = slot?.current?.discountAmount;

    total = total.plus(
      appliedDiscount === undefined
        ? orderFulfillment.fulfillmentCharge
        : orderFulfillment.fulfillmentCharge.minus(appliedDiscount),
    );
  }

  return total;
}

/**
 * Dereferences a promotion period's promotion, reproducing the legacy unguarded dereference.
 *
 * CFML parity [model/service/PromotionService.cfc:L276, L290, L388, L403, L434, L449]: the source
 * writes `reward.getPromotionPeriod().getPromotion()` with no null test for the same reason, and
 * the resolution is the same - throw rather than invent.
 */
function dereferencePromotion(promotionPeriod: PromotionPeriod, locator: string): Promotion {
  const promotion = promotionPeriod.getPromotion();

  if (promotion === undefined) {
    throw new TypeError(
      `Unresolved promotion for promotionPeriodID "${promotionPeriod.getPromotionPeriodID()}". ` +
        `Reproduces the unguarded legacy dereference at ` +
        `model/service/PromotionService.cfc:${locator}, which raises a null reference when the ` +
        `mandatory promotion association has not been resolved.`,
    );
  }

  return promotion;
}

/**
 * Dereferences a fulfillment's address, reproducing the legacy unguarded dereference.
 *
 * Used only by `getShippingMethodOptionsDiscountAmountDetails`, whose address-zone loop at
 * [model/service/PromotionService.cfc:L1059-L1068] reads `getAddress()` with no `isNull` test and
 * no `isNew()` test - unlike the structurally similar fulfillment-arm loop at
 * [model/service/PromotionService.cfc:L360].
 */
function dereferenceFulfillmentAddress(
  orderFulfillment: OrderFulfillmentView,
  locator: string,
): ShippingAddressView {
  const address = orderFulfillment.address;

  if (address === undefined) {
    throw new TypeError(
      `Unresolved fulfillment address for orderFulfillmentID ` +
        `"${orderFulfillment.orderFulfillmentID}". Reproduces the unguarded legacy dereference at ` +
        `model/service/PromotionService.cfc:${locator}, which raises a null reference when no ` +
        `address has been resolved.`,
    );
  }

  return address;
}

/**
 * Everything one invocation of `updateOrderAmountsWithPromotions` mutates.
 *
 * The legacy body declares its state as three function-local structs
 * [model/service/PromotionService.cfc:L136, L139, L142] and reaches the rest through a live ORM
 * graph.
 */
interface PromotionEngineState {
  /**
   * The read-only order projection, already reflecting the price-group pass.
   */
  readonly order: OrderView;

  /**
   * [model/service/PromotionService.cfc:L136] the period-qualification memo, keyed by
   * `promotionPeriodID` and filled lazily at [model/service/PromotionService.cfc:L192-L194].
   */
  readonly promotionPeriodQualifications: PromotionPeriodQualifications;
  readonly rewardUsageLedger: RewardUsageLedger;

  /**
   * [model/service/PromotionService.cfc:L142] the qualified-discount accumulator - descending by
   * discount amount, of which only index `[1]` is ever applied.
   */
  readonly orderItemQualifiedDiscounts: OrderItemQualifiedDiscounts;

  /**
   * One applied-promotion mirror per fulfillment, keyed by `orderFulfillmentID` and seeded lazily
   * on first touch, standing in for `orderFulfillment.getAppliedPromotions()` on the live graph.
   */
  readonly fulfillmentSlots: Record<string, AppliedPromotionSlot>;

  /**
   * The single order-level mirror, standing in for `order.getAppliedPromotions()`. Seeded eagerly
   * because there is exactly one and the order arm reads it in pass two regardless.
   */
  readonly orderSlot: AppliedPromotionSlot;
}

/**
 * The ported surface of `model/service/PromotionService.cfc`.
 *
 * Twelve public methods, matching the component's twelve declarations name for name.
 *
 * @see the file header for the ordering constraint, the six order-dependence vectors, the
 * ownership split, the budget ledgers and the defect-register accounting.
 */
export class PromotionService {
  /**
   * [model/service/PromotionService.cfc:L145-L162] seeds sale-price discounts before the reward
   * traversal begins. Holds the promotion resolver, so it is constructed once.
   */
  private readonly salePriceSeeder: SalePriceSeeder;

  /**
   * [model/service/PromotionService.cfc:L549-L627, L752-L781, L783-L849] period-level
   * qualification and its two private helpers.
   */
  private readonly promotionPeriodQualificationEvaluator: PromotionPeriodQualificationEvaluator;

  /**
   * [model/service/PromotionService.cfc:L629-L750] qualifier evaluation across all gate types.
   */
  private readonly qualifierQualificationEvaluator: QualifierQualificationEvaluator;

  /**
   * [model/service/PromotionService.cfc:L852-L919, L921-L985] both membership tests.
   */
  private readonly orderItemMembership: OrderItemMembership;

  /**
   * [model/service/PromotionService.cfc:L987-L1018] the three amount-type strategies.
   */
  private readonly discountAmountCalculator: DiscountAmountCalculator;

  /**
   * [model/service/PromotionService.cfc:L165-L171, L458-L461] the two explicit ordered passes.
   */
  private readonly twoPassRewardIterator: TwoPassRewardIterator;

  /**
   * Every collaborator is an explicit constructor argument typed to a port or to a narrow
   * structural interface, wired once in `src/handlers/bootstrap.ts`.
   *
   * The first three arguments are the component's three declared properties.
   */
  public constructor(
    private readonly promotionRepository: PromotionRepository,
    private readonly addressZoneEvaluator: AddressZoneEvaluator,
    private readonly roundingRuleValues: RoundingRuleValueResolver,
    private readonly promotionFrameworkReads: PromotionFrameworkReads,
  ) {
    this.salePriceSeeder = new SalePriceSeeder(this.promotionFrameworkReads);
    this.orderItemMembership = new OrderItemMembership();
    this.qualifierQualificationEvaluator = new QualifierQualificationEvaluator(
      this.addressZoneEvaluator,
      this.orderItemMembership,
    );
    this.promotionPeriodQualificationEvaluator = new PromotionPeriodQualificationEvaluator(
      this.promotionRepository,
      this.qualifierQualificationEvaluator,
      this.orderItemMembership,
    );
    this.discountAmountCalculator = new DiscountAmountCalculator(this.roundingRuleValues);
    this.twoPassRewardIterator = new TwoPassRewardIterator(this.promotionRepository);
  }

  /**
   * Recomputes every promotion discount for an order and returns the applied-promotion intents.
   *
   * @param order A read-only projection of the order, already reflecting the price-group pass.
   * @returns The applied-promotion intents to persist, in the order the engine produced them: the
   * fulfillment and order arms' intents first, in traversal order, then the order-item winners.
   */
  public async updateOrderAmountsWithPromotions(
    order: OrderView,
  ): Promise<PromotionAppliedIntent[]> {
    const appliedIntents: PromotionAppliedIntent[] = [];

    // CFML parity [model/service/PromotionService.cfc:L61, L542]: `otExchangeOrder` appears in
    // both order-type gates and the two conditionals are SEQUENTIAL, not else-if.
    //
    // `listFindNoCase` returns a 1-based INDEX and `0` for absent, so it is compared explicitly
    // against `0` rather than used as a truth value.
    const orderTypeSystemCode = order.orderType.systemCode;

    // [model/service/PromotionService.cfc:L61] Sales and exchange orders.
    if (listFindNoCase('otSalesOrder,otExchangeOrder', orderTypeSystemCode) !== 0) {
      // [model/service/PromotionService.cfc:L61-L80] the blanket clear, reproduced, and first.
      //
      // What survives from that earlier reading: no `clearAppliedPromotions` method is published,
      // and the order views still expose no mutation affordance.
      appliedIntents.push(...buildBlanketClearIntents(order));

      // Every mutable structure the engine needs, created fresh for this call.
      const state: PromotionEngineState = {
        order,
        promotionPeriodQualifications: {},
        rewardUsageLedger: new RewardUsageLedger(),
        // The legacy identifier is misspelled `orderItemQulifiedDiscounts`
        // [model/service/PromotionService.cfc:L142]; renamed here, with the original recorded in
        // the file header.
        orderItemQualifiedDiscounts: {},
        fulfillmentSlots: {},
        // EMPTY, because the clear above has just detached whatever the order was carrying.
        // Seeding this from `order.appliedPromotions` is the defect documented on
        // `AppliedPromotionSlot`.
        orderSlot: createEmptyAppliedPromotionSlot(),
      };

      // [model/service/PromotionService.cfc:L145-L162] Sale-price rewards are seeded into the
      // qualified-discount accumulator before the reward traversal.
      await this.salePriceSeeder.seedSalePriceDiscounts(order, state.orderItemQualifiedDiscounts);
      const iterationResult = await this.twoPassRewardIterator.iterate(
        order,
        async (reward, isOrderRewardsPass) => this.visitReward(state, reward, isOrderRewardsPass),
      );
      for (const orderFulfillment of order.orderFulfillments) {
        const slot = structGet(state.fulfillmentSlots, orderFulfillment.orderFulfillmentID);

        if (slot !== undefined) {
          appliedIntents.push(
            ...emitAppliedPromotionSlotIntents(slot, {
              appliedType: 'orderFulfillment',
              orderFulfillmentID: orderFulfillment.orderFulfillmentID,
            }),
          );
        }
      }
      appliedIntents.push(
        ...emitAppliedPromotionSlotIntents(state.orderSlot, {
          appliedType: 'order',
          orderID: order.orderID,
        }),
      );
      stripOverUsedRewardDiscounts(
        state.rewardUsageLedger.promotionRewardUsageDetails,
        state.orderItemQualifiedDiscounts,
        iterationResult.lastProcessedRewardID,
      );

      // [model/service/PromotionService.cfc:L523-L536] Apply only the single best discount per
      // order item - index `[1]` of the descending list, and nothing else.
      appliedIntents.push(...applyBestOrderItemDiscounts(order, state.orderItemQualifiedDiscounts));
    }

    // [model/service/PromotionService.cfc:L541] Return & Exchange Orders.
    if (listFindNoCase('otReturnOrder,otExchangeOrder', orderTypeSystemCode) !== 0) {
      // TODO [issue #1766]: In the future allow for return Items to have negative promotions
      // applied. This isn't import right now because you can determine how much you would like to
      // refund ordersItems.
      //
      // The three lines above are carried forward verbatim from
      // [model/service/PromotionService.cfc:L542-L544], which is the entire body of that branch: it
      // does nothing in the source and does nothing here. The gap is tracked by the `issue_1766`
      // regression case rather than closed.
    }

    return appliedIntents;
  }

  /**
   * Everything the legacy reward loop's BODY does, for one reward.
   *
   * The three reward-level arms are then dispatched exactly as the source dispatches them, on the
   * pass flag and the reward type.
   */
  private async visitReward(
    state: PromotionEngineState,
    reward: PromotionReward,
    isOrderRewardsPass: boolean,
  ): Promise<RewardVisitOutcome> {
    const usage = state.rewardUsageLedger.ensureRewardEntry(reward);

    const promotionPeriod = dereferencePromotionPeriod(reward, 'L192-L193');
    const promotionPeriodID = promotionPeriod.getPromotionPeriodID();

    // OBLIGATION 2 - [model/service/PromotionService.cfc:L192-L194]. `structKeyExists` and the
    // read are routed through the CFML struct helpers so key case folds the way a CFML struct
    // folds it.
    if (!structKeyExists(state.promotionPeriodQualifications, promotionPeriodID)) {
      putOwnStructKey(
        state.promotionPeriodQualifications,
        promotionPeriodID,
        await this.getPromotionPeriodQualificationDetails(promotionPeriod, state.order),
      );
    }

    const periodQualification = structGet(state.promotionPeriodQualifications, promotionPeriodID);

    // Narrowed rather than asserted.
    if (periodQualification === undefined) {
      return { qualificationsMeet: false };
    }

    // OBLIGATION 3 - [model/service/PromotionService.cfc:L197]. The gate, and the value the
    // iterator needs back in order to honour the reset's placement.
    const qualificationsMeet = periodQualification.qualificationsMeet;

    if (!qualificationsMeet) {
      return { qualificationsMeet };
    }

    const rewardType = reward.getRewardType();

    // CFML parity [model/service/PromotionService.cfc:L200]: `listFindNoCase` against the three
    // item-level reward types, compared explicitly against `0` rather than used as a truth value.
    const rewardTypeForListTest = rewardType ?? '';
    if (
      !isOrderRewardsPass &&
      listFindNoCase('merchandise,subscription,contentAccess', rewardTypeForListTest) !== 0
    ) {
      this.applyOrderItemReward(state, reward, promotionPeriod, periodQualification, usage);

      // [model/service/PromotionService.cfc:L345-L412]. CFML `eq` on strings is case-insensitive,
      // so the type test folds case rather than using `===`.
    } else if (!isOrderRewardsPass && cfEquals(rewardType, 'fulfillment')) {
      this.applyFulfillmentReward(state, reward, promotionPeriod, periodQualification);
    } else if (isOrderRewardsPass && cfEquals(rewardType, 'order')) {
      this.applyOrderReward(state, reward, promotionPeriod);
    }

    return { qualificationsMeet };
  }

  /**
   * The order-item arm.
   */
  private applyOrderItemReward(
    state: PromotionEngineState,
    reward: PromotionReward,
    promotionPeriod: PromotionPeriod,
    periodQualification: PeriodQualification,
    usage: PromotionRewardUsageDetail,
  ): void {
    // [model/service/PromotionService.cfc:L203] read once into a local; the source calls
    // `getOrderItems()` afresh in the loop head and the view publishes the collection `readonly`.
    for (const orderItem of state.order.orderItems) {
      // CFML parity [model/service/PromotionService.cfc:L206]: `==` on two strings is
      // case-insensitive in CFML, so the sale-item test folds case.
      if (!cfEquals(orderItem.orderItemType.systemCode, 'oitSale')) {
        continue;
      }

      // CFML parity [model/service/PromotionService.cfc:L209]: `arrayFind` used as a boolean. The
      // target tests membership of a `string[]` directly, which is intrinsically boolean, so no
      // index is produced and no index comparison can be got wrong.
      if (!periodQualification.qualifiedFulfillmentIDs.includes(orderItem.orderFulfillmentID)) {
        continue;
      }

      const orderItemID = orderItem.orderItemID;

      // [model/service/PromotionService.cfc:L212-L214] memoise this order item's qualification
      // count against the PERIOD, not the reward - so two rewards sharing a period share the
      // count.
      if (!structKeyExists(periodQualification.orderItems, orderItemID)) {
        putOwnStructKey(
          periodQualification.orderItems,
          orderItemID,
          this.getPromotionPeriodOrderItemQualificationCount(
            promotionPeriod,
            orderItem,
            state.order,
          ),
        );
      }

      const qualificationQuantity = structGet(periodQualification.orderItems, orderItemID);

      // CFML parity [model/service/PromotionService.cfc:L217]: the source uses the count BARE as a
      // boolean.
      if (qualificationQuantity === undefined || qualificationQuantity <= 0) {
        continue;
      }

      // [model/service/PromotionService.cfc:L220] the reward's own inclusion and exclusion rules.
      if (!this.getOrderItemInReward(reward, orderItem)) {
        continue;
      }
      state.rewardUsageLedger.ratchetMaximumUsePerOrder(usage, qualificationQuantity);

      // [model/service/PromotionService.cfc:L228] the discount quantity, derived from the
      // ratcheted limit.
      let discountQuantity = qualificationQuantity * usage.maximumUsePerQualification;

      // [model/service/PromotionService.cfc:L231-L233] clamp to the order item's own quantity.
      if (discountQuantity > orderItem.quantity) {
        discountQuantity = orderItem.quantity;
      }

      // [model/service/PromotionService.cfc:L236-L238] clamp to the per-item maximum.
      if (discountQuantity > usage.maximumUsePerItem) {
        discountQuantity = usage.maximumUsePerItem;
      }

      const discountAmount = this.resolveOrderItemDiscountAmount(
        reward,
        orderItem,
        discountQuantity,
      );

      // [model/service/PromotionService.cfc:L257] only a positive discount is recorded. Expressed
      // through `Money`, never a numeric comparison on a monetary value.
      if (!discountAmount.isGreaterThan(Money.zero)) {
        continue;
      }

      // [model/service/PromotionService.cfc:L259-L294] VECTOR 4 - the descending insertion sort.
      this.insertQualifiedDiscountDescending(state.orderItemQualifiedDiscounts, orderItemID, {
        promotionRewardID: reward.getPromotionRewardID(),
        promotion: dereferencePromotion(promotionPeriod, 'L276, L290'),
        discountAmount,
      });
      state.rewardUsageLedger.recordOrderItemUsage(
        usage,
        orderItem,
        discountQuantity,
        discountAmount,
      );
    }
  }

  /**
   * Chooses the order item's discount base and computes the discount.
   *
   * [model/service/PromotionService.cfc:L240-L254], and the single most misread branch in the
   * component.
   *
   * This is also the method that makes the cross-service ordering constraint concrete: all five
   * values it reads are written by the price-group pass.
   */
  private resolveOrderItemDiscountAmount(
    reward: PromotionReward,
    orderItem: OrderItemView,
    discountQuantity: number,
  ): Money {
    const appliedPriceGroup = orderItem.appliedPriceGroup;

    // CFML parity [model/service/PromotionService.cfc:L241]: `isNull(...)` is a genuine null test,
    // so it is routed through the CFML null helper rather than a bare falsy check - which would
    // wrongly fold an empty string or a zero in with an absent value - and rather than a
    // `structKeyExists` probe.
    if (isNullish(appliedPriceGroup) || appliedPriceGroup === undefined) {
      // [model/service/PromotionService.cfc:L244] the uncorrected arm.
      return this.getDiscountAmount(reward, orderItem.price, discountQuantity);
    }

    if (reward.hasEligiblePriceGroup(appliedPriceGroup)) {
      // [model/service/PromotionService.cfc:L244] the uncorrected arm, reached by the guard's
      // second disjunct.
      return this.getDiscountAmount(reward, orderItem.price, discountQuantity);
    }

    // [model/service/PromotionService.cfc:L249] the discount the item would have received with no
    // price group at all.
    const originalDiscountAmount = this.getDiscountAmount(
      reward,
      orderItem.skuPrice,
      discountQuantity,
    );
    return originalDiscountAmount.minus(orderItem.extendedSkuPrice.minus(orderItem.extendedPrice));
  }

  /**
   * The descending insertion sort - order-dependence vector 4, first half.
   *
   * CFML parity [model/service/PromotionService.cfc:L271]: the scan inserts at the FIRST position
   * whose existing discount is STRICTLY LESS than the incoming one.
   */
  private insertQualifiedDiscountDescending(
    orderItemQualifiedDiscounts: OrderItemQualifiedDiscounts,
    orderItemID: string,
    qualifiedDiscount: QualifiedDiscount,
  ): void {
    // [model/service/PromotionService.cfc:L260-L263] create the list on first use. The sale-price
    // seeding step may already have created it, in which case its record is the incumbent this
    // discount has to beat.
    if (!structKeyExists(orderItemQualifiedDiscounts, orderItemID)) {
      // The type argument is explicit because an empty-array literal would otherwise infer the
      // helper's value type as `never[]`, which the accumulator's `QualifiedDiscount[]` rejects.
      putOwnStructKey<QualifiedDiscount[]>(orderItemQualifiedDiscounts, orderItemID, []);
    }

    const qualifiedDiscounts = structGet(orderItemQualifiedDiscounts, orderItemID);

    // Narrowed rather than asserted, for the reason given at the other narrowing sites: the create
    // above guarantees the key and both helpers fold key case identically.
    if (qualifiedDiscounts === undefined) {
      return;
    }

    // [model/service/PromotionService.cfc:L269-L283] the forward scan.
    for (let index = 0; index < qualifiedDiscounts.length; index += 1) {
      const existing = qualifiedDiscounts[index];

      if (existing === undefined) {
        continue;
      }

      // [model/service/PromotionService.cfc:L271] STRICTLY less than, expressed through `Money`.
      if (existing.discountAmount.isLessThan(qualifiedDiscount.discountAmount)) {
        // CFML parity [model/service/PromotionService.cfc:L274]: `arrayInsertAt(list, d, record)`
        // inserts before the element at 1-based position `d`, which is `splice` at 0-based
        // `index`.
        qualifiedDiscounts.splice(index, 0, qualifiedDiscount);
        // [model/service/PromotionService.cfc:L280-L281] the source sets its `discountAdded` flag
        // and breaks; returning here is the same control flow with no flag to carry.
        return;
      }
    }

    // [model/service/PromotionService.cfc:L285-L293] nothing was displaced, so append.
    qualifiedDiscounts.push(qualifiedDiscount);
  }

  /**
   * The fulfillment arm.
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L345-L412]: no line in this arm reads, seeds
   * or increments `promotionRewardUsageDetails`, unlike the order-item arm which seeds it at
   * L173-L188 and increments `usedInOrder` at L297. So per-order, per-item and per-qualification use
   * limits are not enforced against fulfillment discounts, and those discounts are invisible to the
   * over-use stripping loop at L468-L521.
   * Preserved deliberately; do not fix without a product decision.
   */
  private applyFulfillmentReward(
    state: PromotionEngineState,
    reward: PromotionReward,
    promotionPeriod: PromotionPeriod,
    periodQualification: PeriodQualification,
  ): void {
    for (const orderFulfillment of state.order.orderFulfillments) {
      // [model/service/PromotionService.cfc:L351-L355] the three-part gate, in the source's order
      // and joined by short-circuiting `&&`.
      //
      // CFML parity [model/service/PromotionService.cfc:L351]: `arrayFind` as a boolean becomes
      // direct membership of a `string[]`.
      if (
        !periodQualification.qualifiedFulfillmentIDs.includes(orderFulfillment.orderFulfillmentID)
      ) {
        continue;
      }

      // CFML parity [model/service/PromotionService.cfc:L353]: `!arrayLen(x) || hasX(...)` - an
      // empty collection means "no restriction", not "matches nothing". Expressed as an explicit
      // `length === 0`, never as a bare truthiness test on a length.
      const fulfillmentMethodIDs = reward.getFulfillmentMethodIDs();

      if (
        fulfillmentMethodIDs.length !== 0 &&
        !fulfillmentMethodIDs.includes(orderFulfillment.fulfillmentMethod.fulfillmentMethodID)
      ) {
        continue;
      }

      // CFML parity [model/service/PromotionService.cfc:L355]: this conjunct carries an extra null
      // test the fulfillment-method conjunct does not -
      // `!isNull(getShippingMethod()) && hasShippingMethod(...)` - so a restricted reward fails
      // the gate outright when the fulfillment has no shipping method.
      const shippingMethodIDs = reward.getShippingMethodIDs();
      const shippingMethod = orderFulfillment.shippingMethod;

      if (
        shippingMethodIDs.length !== 0 &&
        (shippingMethod === undefined ||
          !shippingMethodIDs.includes(shippingMethod.shippingMethodID))
      ) {
        continue;
      }

      // [model/service/PromotionService.cfc:L357-L368] the address-zone test.
      let addressIsInZone = true;
      const shippingAddressZoneIDs = reward.getShippingAddressZoneIDs();

      if (shippingAddressZoneIDs.length !== 0) {
        addressIsInZone = false;
        const address = orderFulfillment.address;

        // CFML parity [model/service/PromotionService.cfc:L360]: both preconditions are the
        // source's - the address must be resolved and must not be new. A new address has nothing
        // to match, so a zone-restricted reward simply fails here rather than throwing.
        if (address !== undefined && !address.isNew) {
          const addressProjection = toAddressProjection(address);

          for (const addressZone of toConfiguredShippingAddressZones(shippingAddressZoneIDs)) {
            // CFML parity [model/service/PromotionService.cfc:L362]: the source calls
            // `isAddressInZone(address=..., addressZone=...)` in KEYWORD form here, positionally
            // at [model/service/PromotionService.cfc:L684] and `IN` keyword form again at
            // [model/service/PromotionService.cfc:L1063].
            if (this.addressZoneEvaluator.isAddressInZone(addressProjection, addressZone)) {
              addressIsInZone = true;
              break;
            }
          }
        }
      }
      if (!addressIsInZone) {
        continue;
      }

      // CFML parity [model/service/PromotionService.cfc:L373]: `getDiscountAmount` is called
      // POSITIONALLY with the literal quantity `1` - a fulfillment charge is discounted once, not
      // per unit.
      const discountAmount = this.getDiscountAmount(reward, orderFulfillment.fulfillmentCharge, 1);

      // [model/service/PromotionService.cfc:L375-L406] replayed against the mirror, which starts
      // EMPTY on first touch - the blanket clear at L71-L75 having already detached whatever this
      // fulfillment was carrying.
      const orderFulfillmentID = orderFulfillment.orderFulfillmentID;

      if (!structKeyExists(state.fulfillmentSlots, orderFulfillmentID)) {
        putOwnStructKey(
          state.fulfillmentSlots,
          orderFulfillmentID,
          createEmptyAppliedPromotionSlot(),
        );
      }

      const slot = structGet(state.fulfillmentSlots, orderFulfillmentID);

      // Narrowed rather than asserted, as at the other narrowing sites.
      if (slot === undefined) {
        continue;
      }

      mirrorRewardApplication(
        slot,
        dereferencePromotion(promotionPeriod, 'L388, L403').getPromotionID(),
        discountAmount,
      );
    }
  }

  /**
   * The order arm - reachable in pass two only.
   *
   * TERM 1 - `getSubtotalAfterItemDiscounts()` reduces to `getSubtotal()`, EXACTLY, at this point
   * in the pass.
   *
   * The non-derivability premise was wrong on both terms, as the two derivations above show.
   */
  private applyOrderReward(
    state: PromotionEngineState,
    reward: PromotionReward,
    promotionPeriod: PromotionPeriod,
  ): void {
    // CFML parity [model/service/PromotionService.cfc:L417]: the discountable base is a sum of two
    // terms - `getSubtotalAfterItemDiscounts() + getFulfillmentChargeAfterDiscountTotal()`.
    const totalDiscountableAmount = computeSubtotalAfterItemDiscounts(state.order).plus(
      computeFulfillmentChargeAfterDiscountTotal(state.order, state.fulfillmentSlots),
    );

    // CFML parity [model/service/PromotionService.cfc:L419]: POSITIONAL, with the literal quantity
    // `1` - an order total is discounted once.
    const discountAmount = this.getDiscountAmount(reward, totalDiscountableAmount, 1);

    // [model/service/PromotionService.cfc:L421-L451] replayed against the single order-level
    // mirror.
    mirrorRewardApplication(
      state.orderSlot,
      dereferencePromotion(promotionPeriod, 'L434, L449').getPromotionID(),
      discountAmount,
    );
  }

  /**
   * Whether a promotion period qualifies for an order, and the qualification detail behind it.
   *
   * Asynchronous because the body reaches the DAO twice, for the period's general use count and
   * its per-account use count [model/service/PromotionService.cfc:L566-L581].
   *
   * The returned detail carries a `qualifiedFulfillments` member that this class never READS - it
   * is register entry 10's level confusion.
   */
  public async getPromotionPeriodQualificationDetails(
    promotionPeriod: PromotionPeriod,
    order: OrderView,
  ): Promise<PeriodQualification> {
    return this.promotionPeriodQualificationEvaluator.getPromotionPeriodQualificationDetails(
      promotionPeriod,
      order,
    );
  }

  /**
   * Whether a single qualifier is satisfied by an order, and how many times.
   *
   * SYNCHRONOUS, and deliberately so: the body reaches no DAO and no collaborator that does.
   *
   * Register entry 11 lives in this path: the shipping-address-zones clause at
   * [model/service/PromotionService.cfc:L703] re-tests `hasShippingMethod` instead of testing the
   * zone condition.
   */
  public getQualifierQualificationDetails(
    qualifier: PromotionQualifier,
    order: OrderView,
  ): QualifierQualification {
    return this.qualifierQualificationEvaluator.getQualifierQualificationDetails(qualifier, order);
  }

  /**
   * The comma-delimited list of fulfillment identifiers a promotion period qualifies.
   *
   * SYNCHRONOUS: the body only walks fulfillments and qualifiers already in memory.
   */
  public getPromotionPeriodQualifiedFulfillmentIDList(
    promotionPeriod: PromotionPeriod,
    order: OrderView,
  ): string {
    return this.promotionPeriodQualificationEvaluator.getPromotionPeriodQualifiedFulfillmentIDList(
      promotionPeriod,
      order,
    );
  }

  /**
   * How many times one order item qualifies under a promotion period's qualifiers.
   *
   * SYNCHRONOUS: pure traversal and integer arithmetic over materialised associations.
   */
  public getPromotionPeriodOrderItemQualificationCount(
    promotionPeriod: PromotionPeriod,
    orderItem: OrderItemView,
    order: OrderView,
  ): number {
    return this.promotionPeriodQualificationEvaluator.getPromotionPeriodOrderItemQualificationCount(
      promotionPeriod,
      orderItem,
      order,
    );
  }

  /**
   * Whether an order item falls inside a qualifier's inclusion and exclusion rules.
   *
   * SYNCHRONOUS: exclusions are evaluated first and short-circuit to `false`, then inclusions
   * short-circuit to `true`.
   */
  public getOrderItemInQualifier(qualifier: PromotionQualifier, orderItem: OrderItemView): boolean {
    return this.orderItemMembership.getOrderItemInQualifier(qualifier, orderItem);
  }

  /**
   * Whether an order item falls inside a reward's inclusion and exclusion rules.
   */
  public getOrderItemInReward(reward: PromotionReward, orderItem: OrderItemView): boolean {
    return this.orderItemMembership.getOrderItemInReward(reward, orderItem);
  }

  /**
   * The discount one reward yields for a given unit price and quantity.
   *
   * Visibility widening 5 of 5, and the last of the project's budget.
   *
   * Four register entries live in the delegated body, and their treatment is recorded in the file
   * header rather than repeated here: entry 12's `amountOff` float gap
   * [model/service/PromotionService.cfc:L998] is deliberate divergence (b), closed.
   */
  public getDiscountAmount(reward: PromotionReward, price: Money, quantity: number): Money {
    return this.discountAmountCalculator.getDiscountAmount(reward, price, quantity);
  }

  /**
   * The sale-price detail for every SKU of a product, with rounding rules applied.
   *
   * @param productID The product whose SKUs to resolve.
   * @returns One detail per SKU, keyed by `skuID`.
   */
  public async getSalePriceDetailsForProductSkus(
    productID: string,
  ): Promise<Record<string, SalePriceDetail>> {
    // [model/service/PromotionService.cfc:L1023] the six-branch UNION and its three
    // query-of-queries reduction steps [model/dao/PromotionDAO.cfc:L298-L591] are entirely the
    // repository's concern.
    const salePriceRows =
      await this.promotionRepository.getSalePricePromotionRewardsQuery(productID);

    // LEGACY-NOTE [model/service/PromotionService.cfc:L1023]: `getHibachiUtilityService()` is an
    // inherited `HibachiService` affordance, not one of this component's three declared
    // collaborators, and it has no TypeScript analogue.
    const priceDetails: Record<string, SalePriceDetail> = {};

    for (const salePriceRow of salePriceRows) {
      const roundingRuleID = salePriceRow.roundingRuleID;

      // CFML parity [model/service/PromotionService.cfc:L1025]: the guard is `!= ""` - a literal
      // empty-string comparison, not `len()` and not a null test - so it is reproduced as an
      // explicit comparison against `''` rather than routed through a truthiness helper.
      if (roundingRuleID === undefined || roundingRuleID === '') {
        putOwnStructKey(priceDetails, salePriceRow.skuID, salePriceRow);
        continue;
      }

      // LEGACY-NOTE [model/service/RoundingRuleService.cfc:L79 vs L88]:
      // `roundValueByRoundingRuleID` declares `returntype="numeric"` but returns `roundValue`'s
      // `string`, which the legacy then assigns straight back into a numeric field.
      const roundedSalePrice = await this.roundingRuleValues.roundValueByRoundingRuleID(
        salePriceRow.salePrice,
        roundingRuleID,
      );

      // JUDGMENT CALL: the legacy reassigns `priceDetails[key].salePrice` in PLACE while
      // iterating. The target builds a fresh record instead.
      putOwnStructKey(priceDetails, salePriceRow.skuID, {
        ...salePriceRow,
        salePrice: roundedSalePrice,
      });
    }

    return priceDetails;
  }

  /**
   * The best fulfillment discount available for one shipping-method option.
   *
   * @param option A read-only projection of the shipping-method option being priced.
   * @returns The winning promotion's identifier and discount, or the empty identifier and a zero
   * discount when nothing qualified.
   */
  public async getShippingMethodOptionsDiscountAmountDetails(
    option: ShippingMethodOptionView,
  ): Promise<ShippingDiscountDetails> {
    // [model/service/PromotionService.cfc:L1033-L1036] the accumulator, seeded exactly as the
    // source seeds it: the empty identifier and a zero amount.
    let bestPromotionID = '';
    let bestDiscountAmount = Money.zero;

    // [model/service/PromotionService.cfc:L1038] this method keeps its own period-qualification
    // memo, entirely separate from the main engine's, and it is function-local - never a field.
    const promotionPeriodQualifications: PromotionPeriodQualifications = {};

    // CFML parity [model/service/PromotionService.cfc:L1040 vs L165]: this call passes
    // `rewardTypeList="fulfillment"` alone and OMITS `qualificationRequired` entirely, while the
    // main engine passes five reward types and `qualificationRequired=true`.
    const promotionRewards = await this.promotionRepository.getActivePromotionRewards(
      'fulfillment',
      option.order.promotionCodeList,
    );
    for (const reward of promotionRewards) {
      const promotionPeriod = dereferencePromotionPeriod(reward, 'L1048-L1049');
      const promotionPeriodID = promotionPeriod.getPromotionPeriodID();
      if (!structKeyExists(promotionPeriodQualifications, promotionPeriodID)) {
        putOwnStructKey(
          promotionPeriodQualifications,
          promotionPeriodID,
          await this.getPromotionPeriodQualificationDetails(promotionPeriod, option.order),
        );
      }

      const periodQualification = structGet(promotionPeriodQualifications, promotionPeriodID);

      // [model/service/PromotionService.cfc:L1053] the gate reads only `qualificationsMeet` -
      // never `qualifiedFulfillmentIDs`, never `qualifierDetails`, and never the dead
      // `qualifiedFulfillments`.
      if (periodQualification === undefined || !periodQualification.qualificationsMeet) {
        continue;
      }

      // CFML parity [model/service/PromotionService.cfc:L1055]: `!arrayLen(x) || hasX(...)` - an
      // empty collection means "no restriction".
      const fulfillmentMethodIDs = reward.getFulfillmentMethodIDs();

      if (
        fulfillmentMethodIDs.length !== 0 &&
        !fulfillmentMethodIDs.includes(
          option.orderFulfillment.fulfillmentMethod.fulfillmentMethodID,
        )
      ) {
        continue;
      }

      // CFML parity [model/service/PromotionService.cfc:L1057]: the shipping method is read from
      // `getShippingMethodRate().getShippingMethod()` - the OPTION's rate - and not from the
      // fulfillment.
      const shippingMethodIDs = reward.getShippingMethodIDs();

      if (
        shippingMethodIDs.length !== 0 &&
        !shippingMethodIDs.includes(option.shippingMethodRate.shippingMethod.shippingMethodID)
      ) {
        continue;
      }

      // [model/service/PromotionService.cfc:L1059-L1068] the CORRECT address-zone loop - see the
      // register entry 11 proof above.
      let addressIsInZone = true;
      const shippingAddressZoneIDs = reward.getShippingAddressZoneIDs();

      if (shippingAddressZoneIDs.length !== 0) {
        addressIsInZone = false;

        // CFML parity [model/service/PromotionService.cfc:L1063]: this loop dereferences
        // `getAddress()` with neither an `isNull` test NOR an `isNew()` test, unlike the
        // fulfillment arm at [model/service/PromotionService.cfc:L360] which guards both.
        const addressProjection = toAddressProjection(
          dereferenceFulfillmentAddress(option.orderFulfillment, 'L1063'),
        );

        for (const addressZone of toConfiguredShippingAddressZones(shippingAddressZoneIDs)) {
          if (this.addressZoneEvaluator.isAddressInZone(addressProjection, addressZone)) {
            addressIsInZone = true;
            break;
          }
        }
      }
      if (!addressIsInZone) {
        continue;
      }

      // CFML parity [model/service/PromotionService.cfc:L1071]: positional, with the literal
      // quantity `1`, against the option's total charge.
      const discountAmount = this.getDiscountAmount(reward, option.totalCharge, 1);

      // CFML parity [model/service/PromotionService.cfc:L1073]: STRICT greater-than, so on a tie
      // the FIRST qualifying reward wins.
      if (discountAmount.isGreaterThan(bestDiscountAmount)) {
        // [model/service/PromotionService.cfc:L1074-L1075] both members are updated together.
        bestDiscountAmount = discountAmount;
        bestPromotionID = dereferencePromotion(promotionPeriod, 'L1075').getPromotionID();
      }
    }
    return { promotionID: bestPromotionID, discountAmount: bestDiscountAmount };
  }

  /**
   * How many placed orders have used a promotion code.
   *
   * LEGACY-NOTE [model/service/PromotionService.cfc:L1094, L1098]: both pass-throughs declare
   * `returntype="boolean"` while returning the DAO's numeric count, and both callers in
   * `model/service/OrderService.cfc` compare that count numerically. Recorded, not reproduced: AAP
   * 0.4.2 types the honest `Promise<number>` here, because a boolean return cannot carry the value
   * every caller uses.
   *
   * The legacy body forwards with `argumentcollection=arguments`; the port forwards the one
   * parameter explicitly.
   */
  public async getPromotionCodeUseCount(promotionCode: PromotionCode): Promise<number> {
    return this.promotionRepository.getPromotionCodeUseCount(promotionCode);
  }

  /**
   * How many placed orders belonging to one account have used a promotion code.
   *
   * The out-of-scope `Account` entity is reduced to an opaque `accountID`.
   */
  public async getPromotionCodeAccountUseCount(
    promotionCode: PromotionCode,
    accountID: string,
  ): Promise<number> {
    return this.promotionRepository.getPromotionCodeAccountUseCount(promotionCode, accountID);
  }
}
