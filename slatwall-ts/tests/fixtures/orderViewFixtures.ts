// slatwall-ts - golden order-view test data.
//
// A single deterministic factory returning one fully-formed, read-only `OrderView` - the
// multi-item, multi-reward "golden order" that drives the decomposed promotion pipeline end to
//
// The three items exist because the L241 discriminator has three arms, not two.
//
// CFML parity [meta/tests/unit/Helper.cfc:L53]: the legacy helper assigned `productData` without
// `var`, leaking it into component scope. A harness hygiene defect rather than a preserved
// business-logic defect, so not reproduced here.

import { makePriceGroupFixtures } from './priceGroupFixtures.js';
import { makeProductFixture } from './productFixtures.js';
import { makePromotionFixtures } from './promotionFixtures.js';
import { makeSkuFixture } from './skuFixtures.js';
import { toCurrencyCode } from '../../src/domain/valueObjects/currencyCode.js';
import { Money } from '../../src/domain/valueObjects/money.js';
import { listAppend, listFindNoCase, listLen, listToArray } from '../../src/lib/cfml/list.js';
import { cfLen, isNullish } from '../../src/lib/cfml/truthiness.js';

import type { PriceGroup } from '../../src/domain/entities/priceGroup.js';
import type { PromotionAppliedType } from '../../src/domain/entities/promotionApplied.js';
import type { PromotionPeriod } from '../../src/domain/entities/promotionPeriod.js';
import type { PromotionReward } from '../../src/domain/entities/promotionReward.js';
import type { Sku } from '../../src/domain/entities/sku.js';
import type {
  AddressProjection,
  AddressZoneEvaluator,
  AddressZoneProjection,
} from '../../src/domain/ports/addressZoneEvaluator.js';
import type {
  PeriodQualification,
  PromotionPeriodQualifications,
  QualifiedOrderItemDetail,
  QualifierQualification,
} from '../../src/domain/promotionEngine/qualificationTypes.js';
import type {
  OrderItemQualifiedDiscounts,
  QualifiedDiscount,
} from '../../src/domain/promotionEngine/qualifiedDiscountTypes.js';
import type {
  OrderItemUsage,
  PromotionRewardUsageDetail,
  PromotionRewardUsageDetails,
} from '../../src/domain/promotionEngine/rewardUsageTypes.js';
import type { CurrencyCode } from '../../src/domain/valueObjects/currencyCode.js';
import type {
  AppliedPromotionView,
  FulfillmentMethodView,
  OrderFulfillmentView,
  ShippingAddressView,
  ShippingMethodView,
} from '../../src/domain/views/orderFulfillmentView.js';
import type { OrderItemView } from '../../src/domain/views/orderItemView.js';
import type {
  OrderTypeView,
  OrderView,
  ShippingMethodOptionView,
  ShippingMethodRateView,
} from '../../src/domain/views/orderView.js';

// LOCAL TYPES - none exported. A sibling's type is DERIVED structurally rather than re-declared,
// so a change to the owner breaks this build.

/**
 * The whole graph the promotion fixture hands back, reached without an import.
 */
type PromotionFixtureGraphRef = ReturnType<typeof makePromotionFixtures>;

/**
 * The four named reward arrangements, taken from the owner rather than retyped. `'empty'` is a
 * first-class member: with no rewards the loop body at
 * [model/service/PromotionService.cfc:L167-L465] never executes.
 */
type RewardOrderingName = PromotionFixtureGraphRef['rewardOrderings'][number]['name'];

/**
 * The pre-verified 19.99 x 3 at 12.5% reference figures, from their owner.
 */
type ReferenceCalculationRef = PromotionFixtureGraphRef['referenceCalculation'];

/**
 * The order item's type shape, reached structurally.
 */
type OrderItemTypeViewRef = OrderItemView['orderItemType'];

/**
 * The `Promotion` entity, reached through the accumulator that already names it:
 * `src/domain/entities/promotion.ts` is not in this module's dependency set.
 */
type PromotionRef = QualifiedDiscount['promotion'];

/**
 * The `PromotionQualifier` entity, reached the same way, through its qualification.
 */
type PromotionQualifierRef = QualifierQualification['qualifier'];

/**
 * How the golden order's items relate to the reward's eligible price groups. `'mixed'` is the
 * default and the only value under which all three arms of the L241 discriminator are reachable
 * from one order.
 */
type PriceGroupEligibility = 'mixed' | 'none' | 'allAccepted' | 'allRejected';

/**
 * One recorded call against the address-zone evaluator double.
 */
interface RecordedAddressZoneCall {
  readonly address: AddressProjection;

  readonly addressZone: AddressZoneProjection;
}

/**
 * Which arm of the L241 discriminator an item selects, and why.
 */
interface ItemPriceArmSelection {
  readonly orderItemID: string;

  /**
   * The first disjunct: `isNull(orderItem.getAppliedPriceGroup())`.
   */
  readonly appliedPriceGroupIsNull: boolean;

  /**
   * The second disjunct: `reward.hasEligiblePriceGroup(...)`.
   */
  readonly rewardAcceptsAppliedPriceGroup: boolean;

  readonly selectedArm: 'price' | 'skuPriceWithCorrection';

  /**
   * Zero on the first arm, and deliberately NON-ZERO on the second.
   */
  readonly correctionTerm: Money;
}

/**
 * The caller-owned sink for everything the `OrderView` return type cannot carry.
 */
interface OrderViewFixtureCapture {
  /**
   * The reward array in the CALLER'S ORDER, never sorted, re-ordered or normalised - see the
   * no-`ORDER BY` defect at the builder. A suite selects an order by name through
   * `overrides.rewardOrdering`.
   */
  promotionRewards?: readonly PromotionReward[];

  /**
   * Which named arrangement produced `promotionRewards`.
   */
  rewardOrderingName?: RewardOrderingName;

  /**
   * Whether that arrangement reaches pass two; see the reset defect below.
   */
  rewardOrderingReachesPassTwo?: boolean;
  rewardUsageDetails?: PromotionRewardUsageDetails;
  overusedRewardID?: string;

  /**
   * The key the stripping loop reads by mistake - the LAST reward touched.
   */
  leakedRewardID?: string;

  /**
   * The `1000000` stand-in for "unlimited", from its owner.
   */
  unlimitedUseSentinel?: number;

  /**
   * The FRESH, MUTABLE qualified-discount accumulator, keyed by order item ID.
   */
  orderItemQualifiedDiscounts?: OrderItemQualifiedDiscounts;

  /**
   * The FRESH, MUTABLE period qualifications, keyed by promotion period ID.
   */
  promotionPeriodQualifications?: PromotionPeriodQualifications;

  /**
   * The period every default reward belongs to.
   */
  promotionPeriod?: PromotionPeriod;

  /**
   * A period whose `qualificationsMeet` is false; present only on demand.
   */
  nonQualifyingPromotionPeriod?: PromotionPeriod;

  /**
   * The qualified fulfillment identifiers as a comma-delimited string.
   *
   * CFML parity [model/service/PromotionService.cfc:L752-L757]: the legacy builder starts from
   * `""` and `listAppend`s, so no fulfillments yields the EMPTY STRING, never an absent value.
   */
  qualifiedFulfillmentIDList?: string;
  qualifiedFulfillmentIDCount?: number;

  /**
   * `cfLen(promotionCodeList) === 0`, evaluated with CFML `len()` semantics.
   */
  promotionCodeListIsEmpty?: boolean;

  /**
   * The minimal in-memory address-zone evaluator double, whose answer is entirely
   * caller-controlled through `overrides.addressIsInZone`.
   */
  addressZoneEvaluator?: AddressZoneEvaluator;

  /**
   * Every call the double received, in call order.
   */
  addressZoneEvaluatorCalls?: readonly RecordedAddressZoneCall[];

  /**
   * A single-location zone to hand the double as its second argument.
   */
  addressZone?: AddressZoneProjection;

  /**
   * The shipping fulfillment's address projected onto the port's shape, with absent columns as
   * `null` - both what `AddressProjection` permits and the honest projection of a NULL column.
   */
  shippingAddressProjection?: AddressProjection;

  /**
   * The item-type code that is not `oitSale`. Pass it through
   * `itemOverrides[n].orderItemTypeSystemCode` to prove the item is skipped by
   * [model/service/PromotionService.cfc:L206].
   */
  nonSaleOrderItemTypeSystemCode?: string;

  /**
   * The single largest seeded discount - the only one L534 ever applies.
   */
  bestQualifiedDiscountAmount?: Money;

  /**
   * The price group the reward NAMES as eligible - shared identity, see below.
   */
  acceptedPriceGroup?: PriceGroup;

  /**
   * A price group the reward does not name, so the second arm is reachable.
   */
  rejectedPriceGroup?: PriceGroup;

  /**
   * Which arm each item selects, and the correction term it carries.
   */
  itemPriceArmSelections?: readonly ItemPriceArmSelection[];

  /**
   * The three `appliedType` values the engine writes, and no fourth, taken from the union
   * `src/domain/entities/promotionApplied.ts` declares: `'orderItem'` at
   * [model/service/PromotionService.cfc:L531].
   */
  appliedTypes?: readonly PromotionAppliedType[];

  /**
   * One shipping-method option over this order, for the shipping-discount path.
   */
  shippingMethodOption?: ShippingMethodOptionView;

  /**
   * The rate that option carries.
   */
  shippingMethodRate?: ShippingMethodRateView;

  /**
   * `listFindNoCase("otSalesOrder,otExchangeOrder", systemCode) > 0` - the L61 gate.
   */
  reachesDiscountBody?: boolean;

  /**
   * `listFindNoCase("otReturnOrder,otExchangeOrder", systemCode) > 0` - the L542 gate.
   */
  reachesReturnExchangeNoOp?: boolean;

  /**
   * The pre-verified reference figures the golden first item lines up with.
   */
  referenceCalculation?: ReferenceCalculationRef;

  /**
   * The fixed instant every date in this graph is derived from.
   */
  now?: Date;
}

// The overrides surface.
//
// Every variation flows through this one optional parameter, so a suite cannot reach past the
// factory to a shared literal and mutate it.

/**
 * Per-item overrides, applied POSITIONALLY over the golden order's items.
 */
interface OrderItemFixtureOverrides {
  /**
   * Opaque [model/entity/OrderItem.cfc:L52]; never parsed, derived or validated.
   */
  readonly orderItemID?: string | undefined;

  /**
   * The rows a PREVIOUS invocation left on this item, which the engine's blanket clear
   * [model/service/PromotionService.cfc:L64-L68] must detach before it recalculates.
   *
   * Every persisted row state is expressible here, which was not always so.
   */
  readonly appliedPromotions?: readonly AppliedPromotionView[] | undefined;

  /**
   * [model/entity/OrderItem.cfc:L84] `fetch="join"`, so always materialised.
   */
  readonly sku?: Sku | undefined;

  /**
   * [model/entity/OrderItem.cfc:L57] `integer`. A plain number - not money.
   */
  readonly quantity?: number | undefined;

  /**
   * [model/entity/OrderItem.cfc:L55] `big_decimal`, therefore `Money`.
   */
  readonly price?: Money | undefined;

  /**
   * [model/entity/OrderItem.cfc:L56] `big_decimal`, therefore `Money`.
   */
  readonly skuPrice?: Money | undefined;

  /**
   * CALCULATED, not persistent: [model/entity/OrderItem.cfc:L200-L202] derives it. Overriding it
   * INDEPENDENTLY of `price` and `quantity` produces a pair production cannot, which is the point.
   */
  readonly extendedPrice?: Money | undefined;

  /**
   * Also calculated, at [model/entity/OrderItem.cfc:L204-L206].
   */
  readonly extendedSkuPrice?: Money | undefined;

  /**
   * OMIT for the default; write `undefined` to force the price-group-ineligible state.
   */
  readonly appliedPriceGroup?: PriceGroup | undefined;

  /**
   * The `oitSale` gate: [model/service/PromotionService.cfc:L206] admits an item into the discount
   * body only when this equals `'oitSale'`.
   */
  readonly orderItemTypeSystemCode?: string | undefined;

  /**
   * Opaque; the fulfillment this item belongs to, for the L209 membership test.
   */
  readonly orderFulfillmentID?: string | undefined;
}

/**
 * Per-fulfillment overrides, applied POSITIONALLY over the golden fulfillments.
 */
interface OrderFulfillmentFixtureOverrides {
  readonly orderFulfillmentID?: string | undefined;

  /**
   * [model/entity/OrderFulfillment.cfc:L54] `big_decimal` - is money.
   */
  readonly fulfillmentCharge?: Money | undefined;

  /**
   * [model/entity/OrderFulfillment.cfc:L69] many-to-one, `notnull`.
   */
  readonly fulfillmentMethod?: FulfillmentMethodView | undefined;

  /**
   * OMIT for the default; write `undefined` for the NULL column.
   * [model/entity/OrderFulfillment.cfc:L74] declares no `notnull`, and the NULL case reaches
   * LEGACY-DEFECT 11 at [model/service/PromotionService.cfc:L703] and the guard at
   * [model/service/PromotionService.cfc:L355].
   */
  readonly shippingMethod?: ShippingMethodView | undefined;

  /**
   * [model/entity/OrderFulfillment.cfc:L79] `PromotionApplied`, `inverse`.
   */
  readonly appliedPromotions?: readonly AppliedPromotionView[] | undefined;

  /**
   * WEIGHT, not MONEY: declared `hb_formatType="weight"` on the fulfillment and feeding the two
   * weight gates at [model/entity/PromotionQualifier.cfc:L63-L64].
   */
  readonly totalShippingWeight?: number | undefined;

  /**
   * The pre-resolved address. Omit for the default; write `undefined` for none.
   *
   * See the judgment call at the builder.
   */
  readonly address?: ShippingAddressView | undefined;

  /**
   * `Address.isNew()` [model/service/PromotionService.cfc:L359], as a flag.
   */
  readonly addressIsNew?: boolean | undefined;
}

interface OrderViewFixtureOverrides {
  /**
   * Prefix for every generated identifier, so two graphs can be told apart.
   */
  readonly idPrefix?: string | undefined;

  /**
   * The instant every predicate is evaluated against, defaulting to a fixed UTC literal.
   * `PromotionPeriod.isCurrent(now)` takes its instant as a parameter precisely so a fixture never
   * consults the wall clock.
   */
  readonly now?: Date | undefined;

  /**
   * The caller-owned sink. Pass `{}` and read the members back afterwards.
   */
  readonly capture?: OrderViewFixtureCapture | undefined;
  readonly orderID?: string | undefined;

  /**
   * OMIT for the default; write `undefined` for guest checkout. `Account` is out of scope, so this
   * is an opaque identifier and never an object [model/entity/PromotionAccount.cfc:L58].
   */
  readonly accountID?: string | undefined;

  /**
   * `OrderView` must carry an order-type code: both engine gates read it.
   * [model/service/PromotionService.cfc:L61] admits the discount body and
   * [model/service/PromotionService.cfc:L542] selects the preserved no-op.
   */
  readonly orderTypeSystemCode?: string | undefined;

  /**
   * `model/entity/Order.cfc` `currencyCode`, length 3 - the branded type.
   */
  readonly currencyCode?: CurrencyCode | undefined;

  /**
   * The promotion codes, an ARRAY here and a comma list on the view.
   */
  readonly promotionCodes?: readonly string[] | undefined;

  /**
   * [model/entity/Order.cfc:L624]; a plain COUNT, deliberately not money.
   */
  readonly totalSaleQuantity?: number | undefined;

  /**
   * [model/entity/Order.cfc:L686]; is money.
   */
  readonly subtotal?: Money | undefined;

  /**
   * [model/entity/Order.cfc:L700], read at [model/service/PromotionService.cfc:L417].
   */
  readonly subtotalAfterItemDiscounts?: Money | undefined;

  /**
   * [model/entity/Order.cfc:L356], read at [model/service/PromotionService.cfc:L417].
   */
  readonly fulfillmentChargeAfterDiscountTotal?: Money | undefined;

  /**
   * Order-level applied promotions; empty by default, as an unpriced order is.
   */
  readonly appliedPromotions?: readonly AppliedPromotionView[] | undefined;

  /**
   * Replace the item array WHOLESALE, which bypasses `itemOverrides`, `priceGroupEligibility` and
   * `orderItemTypeSystemCode` because the caller has taken ownership. Still COPIED before it
   * reaches the frozen view.
   */
  readonly orderItems?: readonly OrderItemView[] | undefined;

  /**
   * Positional per-item overrides over the three golden items.
   */
  readonly itemOverrides?: readonly OrderItemFixtureOverrides[] | undefined;

  /**
   * How the golden items relate to the reward's eligible price groups. `'mixed'`, the default, is
   * the only value under which all three arms of the L241 discriminator are reachable from a
   * single order.
   */
  readonly priceGroupEligibility?: PriceGroupEligibility | undefined;

  /**
   * Applied to every default item; `'oitSale'` unless overridden.
   */
  readonly orderItemTypeSystemCode?: string | undefined;

  /**
   * Whether the two calculated extended amounts agree with `price x quantity`. `'consistent'` is
   * the default and the only state production can reach.
   */
  readonly extendedAmountConsistency?: 'consistent' | 'inconsistent' | undefined;

  /**
   * Replace the fulfillment array WHOLESALE. Still copied before freezing.
   */
  readonly orderFulfillments?: readonly OrderFulfillmentView[] | undefined;

  /**
   * Positional per-fulfillment overrides over the golden fulfillments.
   */
  readonly fulfillmentOverrides?: readonly OrderFulfillmentFixtureOverrides[] | undefined;

  /**
   * Keep the second, PICKUP fulfillment - no shipping method, no address. `true` by default, and
   * the only fulfillment reaching the unguarded `getAddress()` dereference at
   * [model/service/PromotionService.cfc:L703].
   */
  readonly includePickupFulfillment?: boolean | undefined;

  /**
   * Which NAMED reward arrangement to hand back, in that exact order. `'orderRewardLast'` is the
   * default and the only arrangement whose LAST reward is the order-level one, which is what makes
   * pass two reachable.
   */
  readonly rewardOrdering?: RewardOrderingName | undefined;

  /**
   * Replace the reward array wholesale, in the caller's order. Never re-sorted.
   */
  readonly promotionRewards?: readonly PromotionReward[] | undefined;

  /**
   * Does the period the LAST reward belongs to qualify?
   */
  readonly lastRewardPeriodQualifies?: boolean | undefined;
  readonly rewardUsageDetails?: PromotionRewardUsageDetails | undefined;

  /**
   * `usedInOrder` for the entry that overruns its own per-order limit.
   */
  readonly overusedRewardUsedInOrder?: number | undefined;

  /**
   * OMIT for the default; write `undefined` for the NULL column, which routes the seeder down the
   * `1000000` sentinel path at [model/service/PromotionService.cfc:L175].
   */
  readonly rewardMaximumUsePerOrder?: number | undefined;
  readonly rewardMaximumUsePerItem?: number | undefined;
  readonly rewardMaximumUsePerQualification?: number | undefined;

  /**
   * Do the two over-used ledger entries reference the same order items?
   */
  readonly usageLedgerLayout?: 'differentOrderItems' | 'sameOrderItems' | undefined;

  /**
   * `discountQuantity` on the seeded usage entries. Set it to `0` to reach the unguarded divisions
   * at [model/service/PromotionService.cfc:L299] and [model/service/PromotionService.cfc:L486].
   */
  readonly usageDiscountQuantity?: number | undefined;

  /**
   * The discount amounts seeded onto the FIRST golden item, as decimal strings.
   */
  readonly qualifiedDiscountAmounts?: readonly string[] | undefined;

  /**
   * The answer the evaluator double returns for every call; `false` by default. Caller-controlled
   * precisely so no zone logic is implemented here - the real predicate is
   * [model/service/AddressService.cfc:L57].
   */
  readonly addressIsInZone?: boolean | undefined;

  /**
   * The price groups the reward NAMES as eligible.
   */
  readonly eligiblePriceGroups?: readonly PriceGroup[] | undefined;
}

// IMMUTABLE PRIMITIVES only - no counter, identifier sequence, registry, cached instance or frozen
// literal handed to two callers.

/**
 * The instant this graph is evaluated against, as an explicit UTC literal.
 *
 * `PromotionPeriod.isCurrent(now?: Date)` takes its instant as a parameter - the one deliberate
 * signature widening in the entity layer - so a fixture never consults the wall clock.
 */
const FIXED_NOW_ISO = '2024-06-01T12:00:00.000Z';

/**
 * The two order-type gates, as the comma lists the legacy source spells them.
 */
const SALE_OR_EXCHANGE_ORDER_TYPES = 'otSalesOrder,otExchangeOrder';

/**
 * The second gate, at [model/service/PromotionService.cfc:L542].
 */
const RETURN_OR_EXCHANGE_ORDER_TYPES = 'otReturnOrder,otExchangeOrder';

/**
 * [model/entity/Order.cfc:L870] resolves NULL to this through the settings port.
 */
const SALES_ORDER_SYSTEM_CODE = 'otSalesOrder';

/**
 * The item-type gate.
 */
const SALE_ORDER_ITEM_SYSTEM_CODE = 'oitSale';

/**
 * A deliberately non-`oitSale` code, so "this item is skipped" is assertable.
 */
const RETURN_ORDER_ITEM_SYSTEM_CODE = 'oitReturn';

/**
 * Opaque identifiers. Stable and readable, never parsed and never derived from.
 */
const GOLDEN_ORDER_ID = 'order-golden-1';
const GOLDEN_ACCOUNT_ID = 'account-golden-1';
const ITEM_ID_NO_PRICE_GROUP = 'oi-merch-no-price-group';
const ITEM_ID_PRICE_GROUP_ACCEPTED = 'oi-merch-price-group-accepted';
const ITEM_ID_PRICE_GROUP_REJECTED = 'oi-merch-price-group-rejected';
const FULFILLMENT_ID_SHIPPING = 'of-shipping-1';
const FULFILLMENT_ID_PICKUP = 'of-pickup-1';

/**
 * Item 1 - the REFERENCE item, and why its numbers are not negotiable.
 */
const ITEM_1_PRICE = '19.99';
const ITEM_1_QUANTITY = 3;

/**
 * Item 2 - a price group the reward ACCEPTS.
 */
const ITEM_2_PRICE = '17.99';
const ITEM_2_SKU_PRICE = '22.49';
const ITEM_2_QUANTITY = 2;

/**
 * Item 3 - a price group the reward REJECTS, and the only item reaching the second arm of the L241
 * discriminator.
 */
const ITEM_3_PRICE = '8.50';
const ITEM_3_SKU_PRICE = '12.00';
const ITEM_3_QUANTITY = 4;

/**
 * The deliberately WRONG extended price for the inconsistent-pair variant, which production cannot
 * reach because both extended amounts are derived [model/entity/OrderItem.cfc:L200-L206].
 */
const INCONSISTENT_EXTENDED_PRICE = '1.00';

/**
 * 59.97 + 35.98 + 34.00, over the three `oitSale` items only.
 */
const GOLDEN_SUBTOTAL = '129.95';

/**
 * The subtotal less the single largest discount applied to item.
 */
const GOLDEN_SUBTOTAL_AFTER_ITEM_DISCOUNTS = '117.95';

/**
 * 9.50 shipping plus 0.00 pickup.
 */
const GOLDEN_FULFILLMENT_CHARGE_AFTER_DISCOUNT_TOTAL = '9.50';
const SHIPPING_FULFILLMENT_CHARGE = '9.50';
const PICKUP_FULFILLMENT_CHARGE = '0.00';

/**
 * 3 + 2 + 4, a plain count [model/entity/Order.cfc:L624].
 */
const GOLDEN_TOTAL_SALE_QUANTITY = 9;

/**
 * Weight, not money: `hb_formatType="weight"` on the fulfillment, feeding
 * [model/entity/PromotionQualifier.cfc:L63-L64]. A plain number.
 */
const SHIPPING_TOTAL_WEIGHT = 12.5;
const PICKUP_TOTAL_WEIGHT = 0;

/**
 * Three DISTINCT amounts, already descending. Distinct because equal amounts make tie behaviour
 * the thing under test; three because two cannot distinguish "sorted descending" from "reversed".
 */
const GOLDEN_QUALIFIED_DISCOUNT_AMOUNTS: readonly string[] = ['12.00', '7.49625', '3.25'];

/**
 * The largest of the three - the only one [model/service/PromotionService.cfc:L534] applies.
 */
const GOLDEN_BEST_DISCOUNT_AMOUNT = '12.00';

/**
 * `discountQuantity` on each seeded usage entry; `0` reaches the unguarded divisions.
 */
const DEFAULT_USAGE_DISCOUNT_QUANTITY = 2;

/**
 * Above the over-used entry's own `maximumUsePerOrder`, so L471 is satisfied.
 */
const DEFAULT_OVERUSED_USED_IN_ORDER = 5;

/**
 * A small, genuinely exceedable per-order limit for the over-used entry.
 */
const DEFAULT_OVERUSED_MAXIMUM_USE_PER_ORDER = 2;

/**
 * The default per-item and per-qualification limits for a bounded entry.
 */
const DEFAULT_BOUNDED_MAXIMUM_USE_PER_ITEM = 3;
const DEFAULT_BOUNDED_MAXIMUM_USE_PER_QUALIFICATION = 4;

/**
 * The pre-resolved shipping address, as plain projected columns.
 */
const SHIPPING_ADDRESS_POSTAL_CODE = '94105';
const SHIPPING_ADDRESS_CITY = 'San Francisco';
const SHIPPING_ADDRESS_STATE_CODE = 'CA';
const SHIPPING_ADDRESS_COUNTRY_CODE = 'US';

/**
 * The zone identifier used only when a caller overrides the qualifier's `shippingAddressZoneIDs`
 * to an EMPTY list.
 *
 * `AddressZoneProjection.addressZoneID` is required, so the projection still needs an identifier
 * in that case; it is never the identifier of a zone the qualifier actually configures.
 */
const FALLBACK_ADDRESS_ZONE_ID = 'unconfigured-shipping-address-zone';

/**
 * The three-character default from [model/service/SettingService.cfc:L221].
 */
const DEFAULT_CURRENCY_CODE = 'USD';

/**
 * The sale-price seed's reward key. See the builder for why it is EMPTY.
 */
const SALE_PRICE_SEED_REWARD_ID = '';

/**
 * The amount seeded by the sale-price pass at [model/service/PromotionService.cfc:L145-L162].
 */
const SALE_PRICE_SEED_AMOUNT = '5.00';

/**
 * The shipping method the golden shipping fulfillment carries.
 */
const SHIPPING_METHOD_ID = 'sm-ground';

/**
 * The two fulfillment methods, by [model/entity/OrderFulfillment.cfc:L69] type.
 */
const SHIPPING_FULFILLMENT_METHOD_ID = 'fm-shipping';
const SHIPPING_FULFILLMENT_METHOD_TYPE = 'shipping';
const PICKUP_FULFILLMENT_METHOD_ID = 'fm-pickup';
const PICKUP_FULFILLMENT_METHOD_TYPE = 'pickup';

// Overrides plumbing - two presence helpers rather than one `??`, for the reason the header
// records. `??` stays right wherever absence carries no meaning.

/**
 * Was `key` written by the caller at all, whatever value it carries?
 */
function hasOverride(
  overrides: OrderViewFixtureOverrides | undefined,
  key: keyof OrderViewFixtureOverrides,
): boolean {
  return overrides !== undefined && Object.hasOwn(overrides, key);
}

/**
 * The caller's value when the key was written, and the documented default otherwise.
 */
function resolveOverride<TKey extends keyof OrderViewFixtureOverrides>(
  overrides: OrderViewFixtureOverrides | undefined,
  key: TKey,
  documentedDefault: OrderViewFixtureOverrides[TKey],
): OrderViewFixtureOverrides[TKey] {
  if (hasOverride(overrides, key)) {
    return overrides?.[key];
  }
  return documentedDefault;
}

/**
 * The per-item equivalent, for the positional bags.
 */
function hasItemOverride(
  itemOverrides: OrderItemFixtureOverrides | undefined,
  key: keyof OrderItemFixtureOverrides,
): boolean {
  return itemOverrides !== undefined && Object.hasOwn(itemOverrides, key);
}

/**
 * The per-fulfillment equivalent, for the positional bags.
 */
function hasFulfillmentOverride(
  fulfillmentOverrides: OrderFulfillmentFixtureOverrides | undefined,
  key: keyof OrderFulfillmentFixtureOverrides,
): boolean {
  return fulfillmentOverrides !== undefined && Object.hasOwn(fulfillmentOverrides, key);
}

/**
 * The positional bag at `index`, or `undefined`. An explicit read rather than `bags[index]` with a
 * non-null assertion, because `noUncheckedIndexedAccess` is on and `!` is not used in this file at
 * all.
 */
function bagAt<TBag>(bags: readonly TBag[] | undefined, index: number): TBag | undefined {
  if (bags === undefined || index < 0 || index >= bags.length) {
    return undefined;
  }
  return bags[index];
}

// Module-scope pure builders - FUNCTIONS, never DATA, so no array, object, `Date`, `Money` or
// double is shared between graphs.
//
// CFML parity [model/service/PriceGroupService.cfc:L276]: the legacy cascade takes
// `var priceGroups = account.getPriceGroups();` then `arrayAppend`s at
// [model/service/PriceGroupService.cfc:L282], leaving the account's own collection untouched
// because CFML copies arrays by VALUE.

/**
 * A fresh, independent copy of a read-only array.
 */
function copyOf<TElement>(source: readonly TElement[]): TElement[] {
  return source.slice();
}

/**
 * The item type shape, freshly built. `OrderItemTypeViewRef` is the indexed access
 * `orderItemView.ts` records for a consumer needing the unexported shape.
 */
function buildOrderItemType(systemCode: string): OrderItemTypeViewRef {
  return Object.freeze({ systemCode });
}

/**
 * The pre-resolved shipping address.
 *
 * JUDGMENT CALL [model/entity/OrderFulfillment.cfc:L125+]: legacy getAddress() is not a pure
 * accessor - it falls back to copying the account address via setShippingAddress(...) and, when
 * both are null.
 *
 * The persistent column is `shippingAddress`; `address` is the ENGINE's name at
 * [model/service/PromotionService.cfc:L358-L360].
 */
function buildShippingAddress(isNew: boolean): ShippingAddressView {
  return Object.freeze({
    postalCode: SHIPPING_ADDRESS_POSTAL_CODE,
    city: SHIPPING_ADDRESS_CITY,
    stateCode: SHIPPING_ADDRESS_STATE_CODE,
    countryCode: SHIPPING_ADDRESS_COUNTRY_CODE,
    isNew,
  });
}

/**
 * Projects a view address onto the port's input shape.
 */
function toAddressProjection(address: ShippingAddressView): AddressProjection {
  return Object.freeze({
    postalCode: address.postalCode ?? null,
    city: address.city ?? null,
    stateCode: address.stateCode ?? null,
    countryCode: address.countryCode ?? null,
  });
}

/**
 * A single-location zone, to hand the evaluator double as its second argument.
 *
 * `addressZoneID` is REQUIRED by `AddressZoneProjection` and is carried here verbatim from the
 * qualifier that configured the zone.
 */
function buildAddressZone(addressZoneID: string): AddressZoneProjection {
  return Object.freeze({
    addressZoneID,
    addressZoneLocations: Object.freeze([
      Object.freeze({
        postalCode: null,
        city: null,
        stateCode: SHIPPING_ADDRESS_STATE_CODE,
        countryCode: SHIPPING_ADDRESS_COUNTRY_CODE,
      }),
    ]),
  });
}

/**
 * The minimal in-memory address-zone evaluator double, plus its call log.
 *
 * The answer is caller-controlled and constant for every call.
 */
function buildAddressZoneEvaluatorDouble(answer: boolean): {
  readonly evaluator: AddressZoneEvaluator;
  readonly calls: readonly RecordedAddressZoneCall[];
} {
  const calls: RecordedAddressZoneCall[] = [];

  const evaluator: AddressZoneEvaluator = {
    isAddressInZone(address: AddressProjection, addressZone: AddressZoneProjection): boolean {
      calls.push(Object.freeze({ address, addressZone }));
      return answer;
    },
  };

  return Object.freeze({ evaluator, calls });
}

/**
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L173-L188]: null max-use limits are seeded
 * with the magic number 1000000 as a stand-in for "unlimited"
 * [model/entity/PromotionReward.cfc:L65-L67 hb_nullRBKey="define.unlimited"].
 * Preserved deliberately; do not fix without a product decision.
 */
function seedRewardUsageDetail(
  sentinel: number,
  limits: {
    readonly maximumUsePerOrder: number | undefined;
    readonly maximumUsePerItem: number | undefined;
    readonly maximumUsePerQualification: number | undefined;
  },
  usedInOrder: number,
  orderItemsUsage: readonly OrderItemUsage[],
): PromotionRewardUsageDetail {
  return {
    usedInOrder,
    // [model/service/PromotionService.cfc:L175] then [model/service/PromotionService.cfc:L180]:
    // the sentinel first, overwritten only by a non-null POSITIVE limit.
    maximumUsePerOrder: applySeededLimit(sentinel, limits.maximumUsePerOrder),
    // [model/service/PromotionService.cfc:L176] then [model/service/PromotionService.cfc:L183].
    maximumUsePerItem: applySeededLimit(sentinel, limits.maximumUsePerItem),
    // [model/service/PromotionService.cfc:L177] then [model/service/PromotionService.cfc:L186].
    maximumUsePerQualification: applySeededLimit(sentinel, limits.maximumUsePerQualification),
    orderItemsUsage: copyOf(orderItemsUsage),
  };
}

/**
 * The `!isNull(x) && x > 0` guard, as one place rather than three.
 */
function applySeededLimit(sentinel: number, limit: number | undefined): number {
  // Written in the form the compiler can follow rather than delegated to `isNullish()`, whose
  // `boolean` return does not narrow the union; `src/lib/cfml/truthiness.ts` records the identical
  // trade-off in `cfLen`.
  if (limit === undefined) {
    // [model/service/PromotionService.cfc:L175]/[model/service/PromotionService.cfc:L176]/[model/service/PromotionService.cfc:L177]:
    // a NULL limit leaves the sentinel standing.
    return sentinel;
  }
  if (limit > 0) {
    // [model/service/PromotionService.cfc:L180]/[model/service/PromotionService.cfc:L183]/[model/service/PromotionService.cfc:L186]:
    // only a non-null POSITIVE limit overwrites it.
    return limit;
  }
  // An explicit 0 - or a negative - is falsy but not null, so it fails the second conjunct and the
  // sentinel stands.
  return sentinel;
}

/**
 * One `orderItemsUsage` entry.
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L299]: discountAmount / discountQuantity has
 * no zero check on the divisor. Same at L486.
 * Preserved deliberately; do not fix without a product decision.
 */
function buildOrderItemUsage(
  orderItemID: string,
  discountQuantity: number,
  discountAmount: Money,
): OrderItemUsage {
  return Object.freeze({
    orderItemID,
    discountQuantity,
    discountPerUseValue:
      discountQuantity === 0 ? Money.zero : discountAmount.dividedBy(discountQuantity),
  });
}

/**
 * `getExtendedPrice()`, reproduced - INCLUDING the `val()` coercion.
 *
 * LEGACY-DEFECT [model/entity/OrderItem.cfc:L200-L206]: getExtendedPrice() wraps quantity in val()
 * (null coerces to 0) but getExtendedSkuPrice() does not, so a null quantity yields 0 from one
 * accessor and fails in the other.
 * Preserved deliberately; do not fix without a product decision.
 */
function computeExtendedPrice(price: Money, quantity: number): Money {
  // The `val()` coercion: a non-numeric quantity becomes 0 rather than propagating.
  return price.times(Number.isFinite(quantity) ? quantity : 0);
}

/**
 * `getExtendedSkuPrice()` - deliberately without the `val()` coercion.
 */
function computeExtendedSkuPrice(skuPrice: Money, quantity: number): Money {
  return skuPrice.times(quantity);
}

/**
 * One order item view.
 *
 * CFML parity [model/service/PromotionService.cfc:L241-L254]: this range reads state written by
 * [model/service/PriceGroupService.cfc:L371], so the price-group pass must run before the
 * promotion pass.
 */
function buildOrderItem(spec: {
  readonly orderItemID: string;
  readonly sku: Sku;
  readonly quantity: number;
  readonly price: Money;
  readonly skuPrice: Money;
  readonly extendedPrice: Money;
  readonly extendedSkuPrice: Money;
  readonly appliedPriceGroup: PriceGroup | undefined;
  readonly orderItemTypeSystemCode: string;
  readonly orderFulfillmentID: string;
  readonly appliedPromotions: readonly AppliedPromotionView[];
}): OrderItemView {
  return Object.freeze({
    orderItemID: spec.orderItemID,
    sku: spec.sku,
    quantity: spec.quantity,
    price: spec.price,
    skuPrice: spec.skuPrice,
    extendedPrice: spec.extendedPrice,
    extendedSkuPrice: spec.extendedSkuPrice,
    // Written EXPLICITLY as `undefined`, never omitted: `orderItemView.ts` declares this a
    // REQUIRED member whose type includes `undefined`, so that "no applied price group" is one
    // unambiguous state.
    appliedPriceGroup: spec.appliedPriceGroup,
    orderItemType: buildOrderItemType(spec.orderItemTypeSystemCode),
    orderFulfillmentID: spec.orderFulfillmentID,
    // Copied then frozen, exactly as the fulfillment and order equivalents are, so a caller cannot
    // reach back through its own array and mutate what the engine was handed.
    appliedPromotions: Object.freeze(copyOf(spec.appliedPromotions)),
  });
}

/**
 * Which arm the item selects, under the legacy null semantics, published on the capture sink so a
 * suite pins the POLARITY as data.
 */
function buildItemPriceArmSelection(
  item: OrderItemView,
  reward: PromotionReward | undefined,
): ItemPriceArmSelection {
  const appliedPriceGroup: PriceGroup | undefined = item.appliedPriceGroup;
  const appliedPriceGroupIsNull = isNullish(appliedPriceGroup);

  const rewardAcceptsAppliedPriceGroup =
    !appliedPriceGroupIsNull &&
    appliedPriceGroup !== undefined &&
    reward !== undefined &&
    reward.hasEligiblePriceGroup(appliedPriceGroup);

  // [model/service/PromotionService.cfc:L241] Either disjunct selects `getPrice()`; only when both
  // fail does the `getSkuPrice()`-plus-correction arm run.
  const takesPriceArm = appliedPriceGroupIsNull || rewardAcceptsAppliedPriceGroup;

  return Object.freeze({
    orderItemID: item.orderItemID,
    appliedPriceGroupIsNull,
    rewardAcceptsAppliedPriceGroup,
    selectedArm: takesPriceArm ? 'price' : 'skuPriceWithCorrection',
    // [model/service/PromotionService.cfc:L252] `- (getExtendedSkuPrice() - getExtendedPrice())`;
    // zero where unused.
    correctionTerm: takesPriceArm ? Money.zero : item.extendedSkuPrice.minus(item.extendedPrice),
  });
}

/**
 * One fulfillment view.
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L703]: the shipping-address-zones clause
 * re-tests hasShippingMethod instead of testing the zone condition.
 * Preserved deliberately; do not fix without a product decision.
 *
 * A second problem at the same line, and the reason the pickup fulfillment exists: L703 also
 * dereferences `getAddress()` unguarded, in pointed contrast with
 * [model/service/PromotionService.cfc:L358-L360].
 */
function buildOrderFulfillment(spec: {
  readonly orderFulfillmentID: string;
  readonly fulfillmentCharge: Money;
  readonly fulfillmentMethod: FulfillmentMethodView;
  readonly shippingMethod: ShippingMethodView | undefined;
  readonly appliedPromotions: readonly AppliedPromotionView[];
  readonly totalShippingWeight: number;
  readonly address: ShippingAddressView | undefined;
}): OrderFulfillmentView {
  return Object.freeze({
    orderFulfillmentID: spec.orderFulfillmentID,
    fulfillmentCharge: spec.fulfillmentCharge,
    fulfillmentMethod: spec.fulfillmentMethod,
    // Explicit `undefined`, never an omitted key.
    shippingMethod: spec.shippingMethod,
    appliedPromotions: Object.freeze(copyOf(spec.appliedPromotions)),
    // WEIGHT, so a plain number and never `Money`.
    totalShippingWeight: spec.totalShippingWeight,
    address: spec.address,
  });
}

/**
 * Inserts one candidate into the DESCENDING accumulator, by the legacy algorithm.
 *
 * CFML parity [model/service/PromotionService.cfc:L523-L537]: only index [1] - the single largest
 * discount after the descending insert-sort at L266-L294 - is ever applied per order item, and
 * every other qualified discount is discarded.
 *
 * The legacy loop splices ahead of the first strictly-smaller entry, so a TIE lands after the
 * incumbent and the first-inserted wins index [1].
 */
function insertQualifiedDiscountDescending(
  discounts: QualifiedDiscount[],
  candidate: QualifiedDiscount,
): void {
  for (let index = 0; index < discounts.length; index += 1) {
    const incumbent: QualifiedDiscount | undefined = discounts[index];
    if (
      incumbent !== undefined &&
      candidate.discountAmount.isGreaterThan(incumbent.discountAmount)
    ) {
      discounts.splice(index, 0, candidate);
      return;
    }
  }
  discounts.push(candidate);
}

/**
 * One qualified-discount entry.
 *
 * CFML parity [model/service/PromotionService.cfc:L82-L133]: the legacy accumulator key is spelled
 * `orderItemQulifiedDiscounts` (sic). The target symbol is renamed; the original spelling is
 * recorded here so the two surfaces can be diffed.
 *
 * `discountAmount` is the one mutable member: [model/service/PromotionService.cfc:L486] rewrites
 * it on a partial strip.
 */
function buildQualifiedDiscount(
  promotionRewardID: string,
  promotion: PromotionRef,
  discountAmount: Money,
): QualifiedDiscount {
  return {
    promotionRewardID,
    promotion,
    discountAmount,
  };
}

/**
 * The fresh, mutable qualified-discount accumulator.
 *
 * Not frozen, deliberately: the engine splices entries out of these arrays at
 * [model/service/PromotionService.cfc:L502] and rewrites `discountAmount` at
 * [model/service/PromotionService.cfc:L486].
 */
function buildOrderItemQualifiedDiscounts(spec: {
  readonly bestDiscountOrderItemID: string;
  readonly discountAmounts: readonly string[];
  readonly promotion: PromotionRef;
  readonly promotionRewardID: string;
  readonly salePriceSeedOrderItemID: string;
  readonly salePriceSeedAmount: string;
}): OrderItemQualifiedDiscounts {
  const accumulator: OrderItemQualifiedDiscounts = {};

  const primary: QualifiedDiscount[] = [];
  for (const amount of spec.discountAmounts) {
    insertQualifiedDiscountDescending(
      primary,
      buildQualifiedDiscount(
        spec.promotionRewardID,
        spec.promotion,
        Money.fromDecimalString(amount),
      ),
    );
  }
  accumulator[spec.bestDiscountOrderItemID] = primary;

  // [model/service/PromotionService.cfc:L145-L162] The sale-price seeding pass runs before the
  // main reward loop and creates the accumulator array at
  // [model/service/PromotionService.cfc:L152] with an EMPTY reward identifier at
  // [model/service/PromotionService.cfc:L156]: a sale price is not attributable to a reward.
  accumulator[spec.salePriceSeedOrderItemID] = [
    buildQualifiedDiscount(
      SALE_PRICE_SEED_REWARD_ID,
      spec.promotion,
      Money.fromDecimalString(spec.salePriceSeedAmount),
    ),
  ];

  return accumulator;
}

/**
 * The comma-delimited qualified-fulfillment identifier list.
 *
 * CFML parity [model/service/PromotionService.cfc:L752-L757]: the legacy builder starts from `""`
 * and `listAppend`s, so an order with no fulfillments yields the EMPTY STRING. `listFindNoCase`
 * positions are ONE-BASED, so `0` - not `-1` - means absent.
 */
function buildQualifiedFulfillmentIDList(fulfillments: readonly OrderFulfillmentView[]): string {
  let list = '';
  for (const fulfillment of fulfillments) {
    if (listFindNoCase(list, fulfillment.orderFulfillmentID) === 0) {
      list = listAppend(list, fulfillment.orderFulfillmentID);
    }
  }
  return list;
}

/**
 * One period qualification record.
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L621-L623]: qualifiedFulfillments is written
 * but never initialised and never read; the caller reads qualifiedFulfillmentIDs.
 * Preserved deliberately; do not fix without a product decision.
 *
 * The legacy member spelling `qualificationsMeet` (not "Met") is carried over verbatim.
 */
function buildPeriodQualification(spec: {
  readonly qualifier: PromotionQualifierRef;
  readonly qualificationsMeet: boolean;
  readonly qualifiedFulfillmentIDList: string;
  readonly qualifyingItems: readonly OrderItemView[];
  readonly qualificationCount: number;
}): PeriodQualification {
  const qualifiedFulfillmentIDs = listToArray(spec.qualifiedFulfillmentIDList);

  const qualifiedOrderItemDetails: QualifiedOrderItemDetail[] = spec.qualifyingItems.map(
    (orderItem: OrderItemView): QualifiedOrderItemDetail =>
      Object.freeze({ orderItem, qualificationCount: spec.qualificationCount }),
  );

  const orderItems: Record<string, number> = {};
  for (const orderItem of spec.qualifyingItems) {
    orderItems[orderItem.orderItemID] = spec.qualificationCount;
  }

  const qualifierDetails: QualifierQualification[] = [
    {
      qualifier: spec.qualifier,
      qualificationCount: spec.qualificationCount,
      qualifiedFulfillmentIDs: copyOf(qualifiedFulfillmentIDs),
      qualifiedOrderItemDetails: copyOf(qualifiedOrderItemDetails),
    },
  ];

  return {
    qualificationsMeet: spec.qualificationsMeet,
    qualifiedFulfillmentIDs,
    qualifierDetails,
    orderItems,
    // The dead key, written with the value the live one carries - which is what
    // [model/service/PromotionService.cfc:L621-L623] does, from
    // `explicitlyQualifiedFulfillmentIDs`.
    qualifiedFulfillments: copyOf(qualifiedFulfillmentIDs),
  };
}

/**
 * Applies one positional item bag over one item's documented defaults.
 */
function resolveOrderItem(
  defaults: {
    readonly orderItemID: string;
    readonly sku: Sku;
    readonly quantity: number;
    readonly price: Money;
    readonly skuPrice: Money;
    readonly appliedPriceGroup: PriceGroup | undefined;
    readonly orderItemTypeSystemCode: string;
    readonly orderFulfillmentID: string;
  },
  bag: OrderItemFixtureOverrides | undefined,
  extendedAmountConsistency: 'consistent' | 'inconsistent',
): OrderItemView {
  const quantity = bag?.quantity ?? defaults.quantity;
  const price = bag?.price ?? defaults.price;
  const skuPrice = bag?.skuPrice ?? defaults.skuPrice;

  // Consistent by default: the two calculated amounts agree with `price x quantity`, the only
  // state [model/entity/OrderItem.cfc:L200-L206] can produce.
  const consistentExtendedPrice = computeExtendedPrice(price, quantity);
  const consistentExtendedSkuPrice = computeExtendedSkuPrice(skuPrice, quantity);

  const defaultExtendedPrice =
    extendedAmountConsistency === 'inconsistent'
      ? Money.fromDecimalString(INCONSISTENT_EXTENDED_PRICE)
      : consistentExtendedPrice;

  return buildOrderItem({
    orderItemID: bag?.orderItemID ?? defaults.orderItemID,
    sku: bag?.sku ?? defaults.sku,
    quantity,
    price,
    skuPrice,
    extendedPrice: bag?.extendedPrice ?? defaultExtendedPrice,
    extendedSkuPrice: bag?.extendedSkuPrice ?? consistentExtendedSkuPrice,
    appliedPriceGroup: hasItemOverride(bag, 'appliedPriceGroup')
      ? bag?.appliedPriceGroup
      : defaults.appliedPriceGroup,
    orderItemTypeSystemCode: bag?.orderItemTypeSystemCode ?? defaults.orderItemTypeSystemCode,
    orderFulfillmentID: bag?.orderFulfillmentID ?? defaults.orderFulfillmentID,
    // Empty by default: an order arriving with no prior applied promotions is the ordinary case,
    // and it is the state under which the blanket clear at
    // [model/service/PromotionService.cfc:L64-L68] emits nothing.
    appliedPromotions: bag?.appliedPromotions ?? [],
  });
}

/**
 * Applies one positional fulfillment bag over one fulfillment's defaults.
 */
function resolveOrderFulfillment(
  defaults: {
    readonly orderFulfillmentID: string;
    readonly fulfillmentCharge: Money;
    readonly fulfillmentMethod: FulfillmentMethodView;
    readonly shippingMethod: ShippingMethodView | undefined;
    readonly totalShippingWeight: number;
    readonly address: ShippingAddressView | undefined;
  },
  bag: OrderFulfillmentFixtureOverrides | undefined,
): OrderFulfillmentView {
  const address = hasFulfillmentOverride(bag, 'address') ? bag?.address : defaults.address;

  // `addressIsNew` re-resolves the address rather than mutating it, because `Address.isNew()` is
  // an ORM lifecycle call with no read-only-view equivalent.
  const addressIsNew = bag?.addressIsNew;
  const resolvedAddress =
    address !== undefined && addressIsNew !== undefined && addressIsNew !== address.isNew
      ? buildShippingAddress(addressIsNew)
      : address;

  return buildOrderFulfillment({
    orderFulfillmentID: bag?.orderFulfillmentID ?? defaults.orderFulfillmentID,
    fulfillmentCharge: bag?.fulfillmentCharge ?? defaults.fulfillmentCharge,
    fulfillmentMethod: bag?.fulfillmentMethod ?? defaults.fulfillmentMethod,
    shippingMethod: hasFulfillmentOverride(bag, 'shippingMethod')
      ? bag?.shippingMethod
      : defaults.shippingMethod,
    appliedPromotions: bag?.appliedPromotions ?? [],
    totalShippingWeight: bag?.totalShippingWeight ?? defaults.totalShippingWeight,
    address: resolvedAddress,
  });
}

/**
 * Builds the golden multi-item, multi-reward read-only `OrderView`.
 *
 * Every call returns a completely fresh graph, for the reason the header records.
 *
 * @param overrides the single variation channel; see the interface above.
 * @returns a frozen `OrderView` whose engine-side scaffolding is written into `overrides.capture`
 * when a sink was supplied.
 */
export function makeOrderViewFixture(overrides?: OrderViewFixtureOverrides): OrderView {
  const idPrefix = overrides?.idPrefix ?? '';

  // An explicit UTC instant, never the wall clock, and a fresh object each call.
  const now = overrides?.now ?? new Date(FIXED_NOW_ISO);
  const orderID = overrides?.orderID ?? `${idPrefix}${GOLDEN_ORDER_ID}`;
  const accountID = resolveOverride(overrides, 'accountID', `${idPrefix}${GOLDEN_ACCOUNT_ID}`);
  const itemIDNoPriceGroup = `${idPrefix}${ITEM_ID_NO_PRICE_GROUP}`;
  const itemIDPriceGroupAccepted = `${idPrefix}${ITEM_ID_PRICE_GROUP_ACCEPTED}`;
  const itemIDPriceGroupRejected = `${idPrefix}${ITEM_ID_PRICE_GROUP_REJECTED}`;
  const fulfillmentIDShipping = `${idPrefix}${FULFILLMENT_ID_SHIPPING}`;
  const fulfillmentIDPickup = `${idPrefix}${FULFILLMENT_ID_PICKUP}`;
  const priceGroupGraph = makePriceGroupFixtures({ idPrefix: `${idPrefix}pg-` });
  const acceptedPriceGroup: PriceGroup = priceGroupGraph.childPriceGroup;
  const rejectedPriceGroup: PriceGroup = priceGroupGraph.siblingPriceGroup;

  const eligiblePriceGroups: readonly PriceGroup[] = overrides?.eligiblePriceGroups ?? [
    acceptedPriceGroup,
  ];
  const promotionGraph = makePromotionFixtures({
    idPrefix: `${idPrefix}promo-`,
    now,
    eligiblePriceGroups,
    orderID,
    orderItemID: itemIDNoPriceGroup,
    secondOrderItemID: itemIDPriceGroupRejected,
    orderFulfillmentID: fulfillmentIDShipping,
    accountID: `${idPrefix}${GOLDEN_ACCOUNT_ID}`,
  });
  const skuNoPriceGroup: Sku = makeSkuFixture({
    idPrefix: `${idPrefix}sku-a-`,
    price: Money.fromDecimalString(ITEM_1_PRICE),
    product: makeProductFixture({
      idPrefix: `${idPrefix}prod-a-`,
      productID: `${idPrefix}prod-a-product`,
    }),
  });
  const skuPriceGroupAccepted: Sku = makeSkuFixture({
    idPrefix: `${idPrefix}sku-b-`,
    price: Money.fromDecimalString(ITEM_2_SKU_PRICE),
    product: makeProductFixture({
      idPrefix: `${idPrefix}prod-b-`,
      productID: `${idPrefix}prod-b-product`,
    }),
  });
  const skuPriceGroupRejected: Sku = makeSkuFixture({
    idPrefix: `${idPrefix}sku-c-`,
    price: Money.fromDecimalString(ITEM_3_SKU_PRICE),
    product: makeProductFixture({
      idPrefix: `${idPrefix}prod-c-`,
      productID: `${idPrefix}prod-c-product`,
    }),
  });

  // `'mixed'` is the default because it is the only arrangement under which all three states are
  // reachable from a single order.
  const eligibility: PriceGroupEligibility = overrides?.priceGroupEligibility ?? 'mixed';
  const itemTypeSystemCode = overrides?.orderItemTypeSystemCode ?? SALE_ORDER_ITEM_SYSTEM_CODE;
  const extendedAmountConsistency = overrides?.extendedAmountConsistency ?? 'consistent';

  const item1PriceGroup: PriceGroup | undefined =
    eligibility === 'allAccepted'
      ? acceptedPriceGroup
      : eligibility === 'allRejected'
        ? rejectedPriceGroup
        : undefined;
  const item2PriceGroup: PriceGroup | undefined =
    eligibility === 'none'
      ? undefined
      : eligibility === 'allRejected'
        ? rejectedPriceGroup
        : acceptedPriceGroup;
  const item3PriceGroup: PriceGroup | undefined =
    eligibility === 'none'
      ? undefined
      : eligibility === 'allAccepted'
        ? acceptedPriceGroup
        : rejectedPriceGroup;

  const defaultItems: readonly OrderItemView[] = [
    resolveOrderItem(
      {
        orderItemID: itemIDNoPriceGroup,
        sku: skuNoPriceGroup,
        quantity: ITEM_1_QUANTITY,
        price: Money.fromDecimalString(ITEM_1_PRICE),
        // No price group applied, so nothing lowered the price and `skuPrice` equals `price`. The
        // correction term is zero, which is why this item alone could not prove the dependency.
        skuPrice: Money.fromDecimalString(ITEM_1_PRICE),
        appliedPriceGroup: item1PriceGroup,
        orderItemTypeSystemCode: itemTypeSystemCode,
        orderFulfillmentID: fulfillmentIDShipping,
      },
      bagAt(overrides?.itemOverrides, 0),
      extendedAmountConsistency,
    ),
    resolveOrderItem(
      {
        orderItemID: itemIDPriceGroupAccepted,
        sku: skuPriceGroupAccepted,
        quantity: ITEM_2_QUANTITY,
        price: Money.fromDecimalString(ITEM_2_PRICE),
        skuPrice: Money.fromDecimalString(ITEM_2_SKU_PRICE),
        appliedPriceGroup: item2PriceGroup,
        orderItemTypeSystemCode: itemTypeSystemCode,
        orderFulfillmentID: fulfillmentIDShipping,
      },
      bagAt(overrides?.itemOverrides, 1),
      extendedAmountConsistency,
    ),
    resolveOrderItem(
      {
        orderItemID: itemIDPriceGroupRejected,
        sku: skuPriceGroupRejected,
        quantity: ITEM_3_QUANTITY,
        price: Money.fromDecimalString(ITEM_3_PRICE),
        skuPrice: Money.fromDecimalString(ITEM_3_SKU_PRICE),
        appliedPriceGroup: item3PriceGroup,
        orderItemTypeSystemCode: itemTypeSystemCode,
        orderFulfillmentID: fulfillmentIDPickup,
      },
      bagAt(overrides?.itemOverrides, 2),
      extendedAmountConsistency,
    ),
  ];

  const orderItems: readonly OrderItemView[] = overrides?.orderItems ?? defaultItems;
  const includePickup = overrides?.includePickupFulfillment ?? true;

  const shippingFulfillmentDefaults = {
    orderFulfillmentID: fulfillmentIDShipping,
    fulfillmentCharge: Money.fromDecimalString(SHIPPING_FULFILLMENT_CHARGE),
    fulfillmentMethod: Object.freeze({
      fulfillmentMethodID: `${idPrefix}${SHIPPING_FULFILLMENT_METHOD_ID}`,
      fulfillmentMethodType: SHIPPING_FULFILLMENT_METHOD_TYPE,
    }),
    shippingMethod: Object.freeze({ shippingMethodID: `${idPrefix}${SHIPPING_METHOD_ID}` }),
    totalShippingWeight: SHIPPING_TOTAL_WEIGHT,
    address: buildShippingAddress(false),
  } as const;

  // The PICKUP fulfillment: no shipping method, no address. The only one reaching both the
  // unguarded `getAddress()` dereference at [model/service/PromotionService.cfc:L703] and the
  // guarded one at [model/service/PromotionService.cfc:L358-L360].
  const pickupFulfillmentDefaults = {
    orderFulfillmentID: fulfillmentIDPickup,
    fulfillmentCharge: Money.fromDecimalString(PICKUP_FULFILLMENT_CHARGE),
    fulfillmentMethod: Object.freeze({
      fulfillmentMethodID: `${idPrefix}${PICKUP_FULFILLMENT_METHOD_ID}`,
      fulfillmentMethodType: PICKUP_FULFILLMENT_METHOD_TYPE,
    }),
    shippingMethod: undefined,
    totalShippingWeight: PICKUP_TOTAL_WEIGHT,
    address: undefined,
  } as const;

  const defaultFulfillments: readonly OrderFulfillmentView[] = includePickup
    ? [
        resolveOrderFulfillment(
          shippingFulfillmentDefaults,
          bagAt(overrides?.fulfillmentOverrides, 0),
        ),
        resolveOrderFulfillment(
          pickupFulfillmentDefaults,
          bagAt(overrides?.fulfillmentOverrides, 1),
        ),
      ]
    : [
        resolveOrderFulfillment(
          shippingFulfillmentDefaults,
          bagAt(overrides?.fulfillmentOverrides, 0),
        ),
      ];

  const orderFulfillments: readonly OrderFulfillmentView[] =
    overrides?.orderFulfillments ?? defaultFulfillments;

  return finishOrderViewFixture({
    overrides,
    idPrefix,
    now,
    orderID,
    accountID,
    orderItems,
    orderFulfillments,
    promotionGraph,
    acceptedPriceGroup,
    rejectedPriceGroup,
    itemIDNoPriceGroup,
    itemIDPriceGroupAccepted,
    itemIDPriceGroupRejected,
    eligiblePriceGroups,
  });
}

// The second half of the factory - split out purely so neither half is unreadably long, and
// declared after the export because the export is what a reader opens this file for.

function finishOrderViewFixture(context: {
  readonly overrides: OrderViewFixtureOverrides | undefined;
  readonly idPrefix: string;
  readonly now: Date;
  readonly orderID: string;
  readonly accountID: string | undefined;
  readonly orderItems: readonly OrderItemView[];
  readonly orderFulfillments: readonly OrderFulfillmentView[];
  readonly promotionGraph: PromotionFixtureGraphRef;
  readonly acceptedPriceGroup: PriceGroup;
  readonly rejectedPriceGroup: PriceGroup;
  readonly itemIDNoPriceGroup: string;
  readonly itemIDPriceGroupAccepted: string;
  readonly itemIDPriceGroupRejected: string;
  readonly eligiblePriceGroups: readonly PriceGroup[];
}): OrderView {
  const { overrides, promotionGraph, orderItems, orderFulfillments } = context;

  // LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L51-L132]: getActivePromotionRewards applies no
  // ORDER by, so reward iteration order - which the mutable usage ledger at
  // model/service/PromotionService.cfc:L297 makes outcome-affecting - is non-deterministic.
  // Preserved deliberately; do not fix without a product decision.
  const orderingName: RewardOrderingName = overrides?.rewardOrdering ?? 'orderRewardLast';
  const selectedOrdering = promotionGraph.rewardOrderings.find(
    (candidate: { readonly name: RewardOrderingName }): boolean => candidate.name === orderingName,
  );
  const orderingRewards: readonly PromotionReward[] =
    selectedOrdering === undefined ? promotionGraph.promotionRewards : selectedOrdering.rewards;

  // LEGACY-DEFECT [model/service/PromotionService.cfc:L457-L461]: the two-pass reset mutates the
  // loop counter from inside the loop body, so pass two never runs when the reward collection is
  // empty, and only runs when the LAST reward belongs to a qualifying period.
  // Preserved deliberately; do not fix without a product decision.
  const orderingReachesPassTwo =
    selectedOrdering === undefined ? true : selectedOrdering.reachesPassTwo;

  const promotionRewards: PromotionReward[] = copyOf(
    overrides?.promotionRewards ?? orderingRewards,
  );

  // The non-qualifying-last-reward variant: a SECOND promotion graph under a distinct `idPrefix`
  // so its period identifier genuinely differs, whose order-level reward replaces the last
  // element. Built lazily.
  const lastRewardPeriodQualifies = overrides?.lastRewardPeriodQualifies ?? true;
  let nonQualifyingPromotionPeriod: PromotionPeriod | undefined;
  if (!lastRewardPeriodQualifies && promotionRewards.length > 0) {
    const nonQualifyingGraph = makePromotionFixtures({
      idPrefix: `${context.idPrefix}promo-nonqualifying-`,
      now: context.now,
      eligiblePriceGroups: context.eligiblePriceGroups,
      orderID: context.orderID,
      orderItemID: context.itemIDNoPriceGroup,
      secondOrderItemID: context.itemIDPriceGroupRejected,
    });
    const substituteReward: PromotionReward = nonQualifyingGraph.orderReward;
    promotionRewards[promotionRewards.length - 1] = substituteReward;
    nonQualifyingPromotionPeriod =
      substituteReward.getPromotionPeriod() ?? nonQualifyingGraph.promotionPeriod;
  }

  // LEGACY-DEFECT [model/service/PromotionService.cfc:L468-L521]: the over-use stripping loop
  // cross-wires its indices.
  // Preserved deliberately; do not fix without a product decision.
  const rewardCount = promotionRewards.length;
  const overusedReward: PromotionReward | undefined =
    rewardCount > 0 ? promotionRewards[0] : undefined;
  const leakedReward: PromotionReward | undefined =
    rewardCount > 0 ? promotionRewards[rewardCount - 1] : undefined;
  const overusedRewardID =
    overusedReward === undefined ? '' : overusedReward.getPromotionRewardID();
  const leakedRewardID = leakedReward === undefined ? '' : leakedReward.getPromotionRewardID();

  const usageDiscountQuantity = overrides?.usageDiscountQuantity ?? DEFAULT_USAGE_DISCOUNT_QUANTITY;
  const bestQualifiedDiscountAmount = Money.fromDecimalString(GOLDEN_BEST_DISCOUNT_AMOUNT);
  const usageLedgerLayout = overrides?.usageLedgerLayout ?? 'differentOrderItems';

  const overusedUsage: readonly OrderItemUsage[] = [
    buildOrderItemUsage(
      context.itemIDNoPriceGroup,
      usageDiscountQuantity,
      bestQualifiedDiscountAmount,
    ),
    buildOrderItemUsage(
      context.itemIDPriceGroupAccepted,
      usageDiscountQuantity,
      bestQualifiedDiscountAmount,
    ),
  ];
  const leakedUsage: readonly OrderItemUsage[] =
    usageLedgerLayout === 'sameOrderItems'
      ? [
          buildOrderItemUsage(
            context.itemIDNoPriceGroup,
            usageDiscountQuantity,
            bestQualifiedDiscountAmount,
          ),
        ]
      : [
          buildOrderItemUsage(
            context.itemIDPriceGroupRejected,
            usageDiscountQuantity,
            bestQualifiedDiscountAmount,
          ),
        ];

  // The over-used entry gets a small, genuinely exceedable per-order limit; every other entry gets
  // a NULL limit, routing it down the 1000000 sentinel path.
  const boundedMaximumUsePerOrder = hasOverride(overrides, 'rewardMaximumUsePerOrder')
    ? overrides?.rewardMaximumUsePerOrder
    : DEFAULT_OVERUSED_MAXIMUM_USE_PER_ORDER;
  const boundedMaximumUsePerItem = hasOverride(overrides, 'rewardMaximumUsePerItem')
    ? overrides?.rewardMaximumUsePerItem
    : DEFAULT_BOUNDED_MAXIMUM_USE_PER_ITEM;
  const boundedMaximumUsePerQualification = hasOverride(
    overrides,
    'rewardMaximumUsePerQualification',
  )
    ? overrides?.rewardMaximumUsePerQualification
    : DEFAULT_BOUNDED_MAXIMUM_USE_PER_QUALIFICATION;

  const unboundedMaximumUsePerOrder = hasOverride(overrides, 'rewardMaximumUsePerOrder')
    ? overrides?.rewardMaximumUsePerOrder
    : undefined;
  const unboundedMaximumUsePerItem = hasOverride(overrides, 'rewardMaximumUsePerItem')
    ? overrides?.rewardMaximumUsePerItem
    : undefined;
  const unboundedMaximumUsePerQualification = hasOverride(
    overrides,
    'rewardMaximumUsePerQualification',
  )
    ? overrides?.rewardMaximumUsePerQualification
    : undefined;

  const overusedUsedInOrder =
    overrides?.overusedRewardUsedInOrder ?? DEFAULT_OVERUSED_USED_IN_ORDER;

  const rewardUsageDetails: PromotionRewardUsageDetails = overrides?.rewardUsageDetails ?? {};
  if (overrides?.rewardUsageDetails === undefined) {
    for (const reward of promotionRewards) {
      const rewardID = reward.getPromotionRewardID();

      // [model/service/PromotionService.cfc:L172] The legacy seeding is wrapped in
      // `structKeyExists`, so it is IDEMPOTENT and first-reward-wins: a reward appearing twice
      // does not re-seed its entry. Reproduced with `Object.hasOwn`.
      if (Object.hasOwn(rewardUsageDetails, rewardID)) {
        continue;
      }

      const isOverused = rewardID === overusedRewardID;
      const isLeaked = !isOverused && rewardID === leakedRewardID;

      rewardUsageDetails[rewardID] = seedRewardUsageDetail(
        promotionGraph.unlimitedUseSentinel,
        {
          maximumUsePerOrder: isOverused ? boundedMaximumUsePerOrder : unboundedMaximumUsePerOrder,
          maximumUsePerItem: isOverused ? boundedMaximumUsePerItem : unboundedMaximumUsePerItem,
          maximumUsePerQualification: isOverused
            ? boundedMaximumUsePerQualification
            : unboundedMaximumUsePerQualification,
        },
        isOverused ? overusedUsedInOrder : isLeaked ? 1 : 0,
        isOverused ? overusedUsage : isLeaked ? leakedUsage : [],
      );
    }
  }
  const orderItemQualifiedDiscounts = buildOrderItemQualifiedDiscounts({
    bestDiscountOrderItemID: context.itemIDNoPriceGroup,
    discountAmounts: overrides?.qualifiedDiscountAmounts ?? GOLDEN_QUALIFIED_DISCOUNT_AMOUNTS,
    promotion: promotionGraph.promotion,
    // Keyed to the OVER-USED reward, so the inner match at
    // [model/service/PromotionService.cfc:L483]/[model/service/PromotionService.cfc:L499] has
    // something to find when the cross-wired item list points at it.
    promotionRewardID: overusedRewardID,
    salePriceSeedOrderItemID: context.itemIDPriceGroupAccepted,
    salePriceSeedAmount: SALE_PRICE_SEED_AMOUNT,
  });
  const qualifiedFulfillmentIDList = buildQualifiedFulfillmentIDList(orderFulfillments);
  const qualifyingItems: readonly OrderItemView[] = orderItems.filter(
    (item: OrderItemView): boolean => item.orderItemType.systemCode === SALE_ORDER_ITEM_SYSTEM_CODE,
  );

  const promotionPeriodQualifications: PromotionPeriodQualifications = {};
  const registerPeriodQualification = (period: PromotionPeriod, qualifies: boolean): void => {
    const periodID = period.getPromotionPeriodID();
    if (Object.hasOwn(promotionPeriodQualifications, periodID)) {
      return;
    }
    promotionPeriodQualifications[periodID] = buildPeriodQualification({
      qualifier: promotionGraph.promotionQualifier,
      qualificationsMeet: qualifies,
      qualifiedFulfillmentIDList,
      qualifyingItems,
      qualificationCount: 1,
    });
  };

  const nonQualifyingPeriodID =
    nonQualifyingPromotionPeriod === undefined
      ? undefined
      : nonQualifyingPromotionPeriod.getPromotionPeriodID();

  for (const reward of promotionRewards) {
    const period: PromotionPeriod | undefined = reward.getPromotionPeriod();
    const resolvedPeriod = period ?? promotionGraph.promotionPeriod;
    registerPeriodQualification(
      resolvedPeriod,
      resolvedPeriod.getPromotionPeriodID() !== nonQualifyingPeriodID,
    );
  }

  // Registered unconditionally so the EMPTY-reward variant still hands a suite a qualification map
  // rather than an empty record it cannot distinguish from a bug.
  registerPeriodQualification(promotionGraph.promotionPeriod, true);

  // LEGACY-DEFECT [model/service/PromotionService.cfc:L417]: the order-level subtotal is combined
  // with a plain `+` rather than precisionEvaluate, unlike the ten other money sites in this file.
  // Preserved deliberately; do not fix without a product decision.
  const subtotal = overrides?.subtotal ?? Money.fromDecimalString(GOLDEN_SUBTOTAL);
  const subtotalAfterItemDiscounts =
    overrides?.subtotalAfterItemDiscounts ??
    Money.fromDecimalString(GOLDEN_SUBTOTAL_AFTER_ITEM_DISCOUNTS);
  const fulfillmentChargeAfterDiscountTotal =
    overrides?.fulfillmentChargeAfterDiscountTotal ??
    Money.fromDecimalString(GOLDEN_FULFILLMENT_CHARGE_AFTER_DISCOUNT_TOTAL);

  // A plain COUNT [model/entity/Order.cfc:L624], never money.
  const totalSaleQuantity = overrides?.totalSaleQuantity ?? GOLDEN_TOTAL_SALE_QUANTITY;

  const orderTypeSystemCode = overrides?.orderTypeSystemCode ?? SALES_ORDER_SYSTEM_CODE;
  const orderType: OrderTypeView = Object.freeze({ systemCode: orderTypeSystemCode });

  // Built from `''` with `listAppend` so the CFML empty-list convention holds: no promotion codes
  // yields `''`, never `undefined`.
  let promotionCodeList = '';
  for (const promotionCode of overrides?.promotionCodes ?? []) {
    promotionCodeList = listAppend(promotionCodeList, promotionCode);
  }

  const order: OrderView = Object.freeze({
    orderID: context.orderID,
    orderItems: Object.freeze(copyOf(orderItems)),
    orderFulfillments: Object.freeze(copyOf(orderFulfillments)),
    appliedPromotions: Object.freeze(copyOf(overrides?.appliedPromotions ?? [])),
    totalSaleQuantity,
    subtotal,
    orderType,
    // Explicit `undefined` for guest checkout, never an omitted key.
    accountID: context.accountID,
    subtotalAfterItemDiscounts,
    promotionCodeList,
    fulfillmentChargeAfterDiscountTotal,
    currencyCode: overrides?.currencyCode ?? toCurrencyCode(DEFAULT_CURRENCY_CODE),
  });

  writeCaptureSink({
    overrides,
    order,
    orderFulfillments,
    orderItems,
    promotionGraph,
    promotionRewards,
    orderingName,
    orderingReachesPassTwo,
    rewardUsageDetails,
    overusedRewardID,
    leakedRewardID,
    orderItemQualifiedDiscounts,
    promotionPeriodQualifications,
    nonQualifyingPromotionPeriod,
    qualifiedFulfillmentIDList,
    promotionCodeList,
    overusedReward,
    acceptedPriceGroup: context.acceptedPriceGroup,
    rejectedPriceGroup: context.rejectedPriceGroup,
    orderTypeSystemCode,
    bestQualifiedDiscountAmount,
    now: context.now,
  });

  return order;
}

/**
 * Fills the caller-owned capture sink, then forgets it.
 *
 * JUDGMENT CALL: why a sink at all.
 */
function writeCaptureSink(context: {
  readonly overrides: OrderViewFixtureOverrides | undefined;
  readonly order: OrderView;
  readonly orderItems: readonly OrderItemView[];
  readonly orderFulfillments: readonly OrderFulfillmentView[];
  readonly promotionGraph: PromotionFixtureGraphRef;
  readonly promotionRewards: readonly PromotionReward[];
  readonly orderingName: RewardOrderingName;
  readonly orderingReachesPassTwo: boolean;
  readonly rewardUsageDetails: PromotionRewardUsageDetails;
  readonly overusedRewardID: string;
  readonly leakedRewardID: string;
  readonly orderItemQualifiedDiscounts: OrderItemQualifiedDiscounts;
  readonly promotionPeriodQualifications: PromotionPeriodQualifications;
  readonly nonQualifyingPromotionPeriod: PromotionPeriod | undefined;
  readonly qualifiedFulfillmentIDList: string;
  readonly promotionCodeList: string;
  readonly overusedReward: PromotionReward | undefined;
  readonly acceptedPriceGroup: PriceGroup;
  readonly rejectedPriceGroup: PriceGroup;
  readonly orderTypeSystemCode: string;
  readonly bestQualifiedDiscountAmount: Money;
  readonly now: Date;
}): void {
  const capture = context.overrides?.capture;
  if (capture === undefined) {
    return;
  }

  capture.promotionRewards = Object.freeze(copyOf(context.promotionRewards));
  capture.rewardOrderingName = context.orderingName;
  capture.rewardOrderingReachesPassTwo = context.orderingReachesPassTwo;

  capture.rewardUsageDetails = context.rewardUsageDetails;
  capture.overusedRewardID = context.overusedRewardID;
  capture.leakedRewardID = context.leakedRewardID;
  capture.unlimitedUseSentinel = context.promotionGraph.unlimitedUseSentinel;

  capture.orderItemQualifiedDiscounts = context.orderItemQualifiedDiscounts;
  capture.bestQualifiedDiscountAmount = context.bestQualifiedDiscountAmount;

  capture.promotionPeriodQualifications = context.promotionPeriodQualifications;
  capture.promotionPeriod = context.promotionGraph.promotionPeriod;
  if (context.nonQualifyingPromotionPeriod !== undefined) {
    capture.nonQualifyingPromotionPeriod = context.nonQualifyingPromotionPeriod;
  }

  capture.qualifiedFulfillmentIDList = context.qualifiedFulfillmentIDList;
  capture.qualifiedFulfillmentIDCount = listLen(context.qualifiedFulfillmentIDList);
  // CFML `len()` semantics, so an empty promotion-code list reads as empty exactly as `if(len(x))`
  // reads it in the legacy source.
  capture.promotionCodeListIsEmpty = cfLen(context.promotionCodeList) === 0;

  const addressZoneDouble = buildAddressZoneEvaluatorDouble(
    context.overrides?.addressIsInZone ?? false,
  );
  capture.addressZoneEvaluator = addressZoneDouble.evaluator;
  capture.addressZoneEvaluatorCalls = addressZoneDouble.calls;
  // The zone identifier is taken from the qualifier that configures it.
  capture.addressZone = buildAddressZone(
    context.promotionGraph.promotionQualifier.getShippingAddressZoneIDs()[0] ??
      FALLBACK_ADDRESS_ZONE_ID,
  );

  const addressedFulfillment = context.orderFulfillments.find(
    (candidate: OrderFulfillmentView): boolean => candidate.address !== undefined,
  );
  const resolvedAddress = addressedFulfillment?.address;
  if (resolvedAddress !== undefined) {
    capture.shippingAddressProjection = toAddressProjection(resolvedAddress);
  }

  capture.acceptedPriceGroup = context.acceptedPriceGroup;
  capture.rejectedPriceGroup = context.rejectedPriceGroup;

  capture.itemPriceArmSelections = Object.freeze(
    context.orderItems.map((item: OrderItemView): ItemPriceArmSelection =>
      buildItemPriceArmSelection(item, context.overusedReward),
    ),
  );

  // The three values [model/service/PromotionService.cfc:L531],
  // [model/service/PromotionService.cfc:L448] and [model/service/PromotionService.cfc:L402] write,
  // and no fourth, taken from the union `src/domain/entities/promotionApplied.ts` declares rather
  // than invented.
  const appliedTypes: readonly PromotionAppliedType[] = Object.freeze([
    'orderItem',
    'order',
    'orderFulfillment',
  ]);
  capture.appliedTypes = appliedTypes;

  const shippingMethodFulfillment = context.orderFulfillments.find(
    (candidate: OrderFulfillmentView): boolean => candidate.shippingMethod !== undefined,
  );
  const resolvedShippingMethod: ShippingMethodView | undefined =
    shippingMethodFulfillment?.shippingMethod;
  if (shippingMethodFulfillment !== undefined && resolvedShippingMethod !== undefined) {
    const shippingMethodRate: ShippingMethodRateView = Object.freeze({
      shippingMethod: resolvedShippingMethod,
    });
    capture.shippingMethodRate = shippingMethodRate;
    const shippingMethodOption: ShippingMethodOptionView = Object.freeze({
      orderFulfillment: shippingMethodFulfillment,
      order: context.order,
      shippingMethodRate,
      totalCharge: shippingMethodFulfillment.fulfillmentCharge,
    });
    capture.shippingMethodOption = shippingMethodOption;
  }

  // LEGACY-DEFECT [model/service/PromotionService.cfc:L541-L544]: the return/exchange branch
  // contains a live `//
  // Preserved deliberately; do not fix without a product decision.
  // TODO [issue #1766]` and does nothing at all.
  //
  // `otExchangeOrder` is in both lists, so an exchange order runs the whole discount body and then
  // enters the no-op.
  capture.reachesDiscountBody =
    listFindNoCase(SALE_OR_EXCHANGE_ORDER_TYPES, context.orderTypeSystemCode) > 0;
  capture.reachesReturnExchangeNoOp =
    listFindNoCase(RETURN_OR_EXCHANGE_ORDER_TYPES, context.orderTypeSystemCode) > 0;
  capture.nonSaleOrderItemTypeSystemCode = RETURN_ORDER_ITEM_SYSTEM_CODE;
  capture.referenceCalculation = context.promotionGraph.referenceCalculation;
  capture.now = context.now;
}
