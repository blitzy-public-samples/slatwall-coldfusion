// ---------------------------------------------------------------------------
// slatwall-ts - GOLDEN ORDER-VIEW TEST DATA
//
// WHAT THIS FILE IS
// A single deterministic factory returning one fully-formed, read-only
// `OrderView` - the multi-item, multi-reward "golden order" that drives the
// decomposed promotion pipeline end to end. Nothing here asserts anything,
// nothing here is registered as a global, and nothing here touches a database, a
// connection pool, a network socket or the filesystem.
//
// IT IS MODULE #5 OF FIVE, AND THE TOP OF AN ACYCLIC FIXTURE ORDER
//   priceGroupFixtures -> productFixtures -> skuFixtures -> promotionFixtures
//   -> orderViewFixtures
// All four lower modules may be imported from here, and are. Nothing inside
// `tests/fixtures/` imports THIS module, which is what keeps the folder a DAG.
// Nothing under `tests/unit/**`, `tests/integration/**`, `tests/traceability/**`
// or `../setup` is imported from here, and neither is anything under
// `src/handlers/**`, `src/repositories/**` or `src/integrations/**`: the test
// tier is not a back door around the domain layer boundary that
// `eslint.config.mjs` enforces on `src/domain/**`.
//
// WHY IT EXISTS AT ALL - THE ANTI-CORRUPTION BOUNDARY, EXPRESSED AS DATA
// `PromotionService.updateOrderAmountsWithPromotions(required any order)`
// [model/service/PromotionService.cfc:L58] takes an Order, and
// `PriceGroupService.updateOrderAmountsWithPriceGroups(required any order)`
// [model/service/PriceGroupService.cfc:L364] takes one too - yet
// `model/entity/Order.cfc`, `model/entity/OrderItem.cfc`,
// `model/entity/OrderFulfillment.cfc`, `model/service/OrderService.cfc` and the
// whole cart, checkout and payment pipeline are OUT OF SCOPE. The target
// therefore consumes read-only, order-shaped INPUT VIEWS and returns
// applied-promotion INTENTS instead of mutating an ORM graph. That inversion is
// the seam that makes this slice independently deployable, and this factory is
// what makes the seam testable.
//
// THE SHAPES ARE NOT DECLARED HERE. `src/domain/views/orderView.ts`,
// `orderItemView.ts` and `orderFulfillmentView.ts` own them; this file only
// populates them. Every member below traces to a member of one of those three
// modules, and no member is invented.
//
// ===========================================================================
// THE GOLDEN ORDER, AS COMPOSED BY DEFAULT
//
//   orderType.systemCode  'otSalesOrder'  - so the L61 gate admits the order and
//                                           the whole discount body runs.
//   accountID             present         - so the price-group pass is not
//                                           short-circuited at
//                                           [model/service/PriceGroupService.cfc:L365].
//   currencyCode          'USD'           - the branded three-character type.
//   promotionCodeList     one code        - built with `listAppend` from `''`.
//   appliedPromotions     []              - so the order-level branch takes the
//                                           first-writer-wins arm at L427.
//   orderItems            THREE, all 'oitSale', covering ALL THREE arms of the
//                         L241 discriminator (see below).
//   orderFulfillments     TWO - one shipping (shipping method AND address
//                         present), one pickup (both absent).
//
// THE THREE ITEMS EXIST BECAUSE THE L241 DISCRIMINATOR HAS THREE ARMS, NOT TWO
//   1. `noPriceGroup`       appliedPriceGroup undefined
//                           -> FIRST arm, `getPrice()`, via `isNull(...)`.
//                           price 19.99 x quantity 3, which is the pre-verified
//                           reference calculation.
//   2. `priceGroupAccepted` appliedPriceGroup present AND named among the
//                           reward's eligible price groups
//                           -> FIRST arm, `getPrice()`, via the second disjunct.
//   3. `priceGroupRejected` appliedPriceGroup present and NOT eligible
//                           -> SECOND arm, `getSkuPrice()` plus the correction
//                           term. Its `skuPrice` deliberately differs from its
//                           `price`, and its `extendedSkuPrice` from its
//                           `extendedPrice`, so the correction term is NON-ZERO
//                           and the ordering dependency is visible.
//
// WHICH OVERRIDE REACHES WHICH CHARACTERIZATION SCENARIO
//   orderTypeSystemCode: 'otReturnOrder' | 'otExchangeOrder'
//                                   -> the preserved `issue #1766` no-op branch.
//   nonSaleOrderItemTypeSystemCode  -> an item the L206 `oitSale` gate skips.
//   priceGroupEligibility: 'none'   -> every item takes the `getPrice()` arm,
//                                      which is also the state a guest order is
//                                      left in when the price-group pass is
//                                      short-circuited.
//   accountID: undefined            -> the guest order that short-circuits the
//                                      price-group pass entirely.
//   inconsistentExtendedPrices      -> an extended/unit price pair that cannot
//                                      arise in production, for pinning what the
//                                      engine does with one anyway.
//   rewardOrdering: 'empty'         -> the reward array is EMPTY, so pass two
//                                      never runs at all.
//   rewardOrdering: 'orderRewardFirst' | 'noOrderReward' | 'orderRewardLast'
//                                   -> the same rewards threaded in a different
//                                      order through the mutable ledger.
//   lastRewardPeriodQualifies: false-> the LAST reward sits in a period whose
//                                      `qualificationsMeet` is false, so the
//                                      L458-L461 reset never fires.
//   ledgerSharesOrderItems: true    -> the defect-9 contrast: leaked reward and
//                                      `prID` touching the SAME item.
//   zeroDiscountQuantity: true      -> a `discountQuantity` of 0, which reaches
//                                      the unguarded divisions at L299 and L486.
//   shippingMethodPresent: false    -> reaches defect 11 and the L355 guard.
//   addressIsInZone                 -> the caller-controlled answer of the
//                                      address-zone evaluator double.
//   capture                         -> the caller-owned sink described below.
// ===========================================================================
//
// JUDGMENT CALL: THE ENGINE-SIDE SCAFFOLDING IS HANDED BACK THROUGH A
// CALLER-OWNED `capture` SINK RATHER THAN THROUGH A SECOND EXPORT. This module
// has exactly ONE export and its return type is `OrderView`, which by
// construction cannot carry the reward array, the mutable usage ledger, the
// qualified-discount accumulator, the period qualifications, the comma-delimited
// qualified-fulfillment list or the address-zone evaluator double - none of
// which are order state. Adding a second export would break the one-unit-per-
// file rule the whole subtree is built on, and returning a wider graph type
// would contradict the declared signature. So a caller that needs any of that
// scaffolding passes an empty object as `overrides.capture` and reads it back
// afterwards. The sink is the caller's object: this factory writes into it and
// keeps no reference of its own.
//
// THE LEGACY REFERENCE PATTERN, AND WHAT IS DELIBERATELY DROPPED
// [meta/tests/unit/Helper.cfc:L49-L77] is the only fixture-construction artefact
// in the legacy tree. Its SHAPE is carried over: one named function, a small
// literal data bag with documented defaults, one fully-formed subject returned,
// disposable by dropping the reference. Its MECHANISM is dropped entirely -
// `entityNew`, `ormFlush`, `entityDelete`, `javaCast("null","")`,
// `request.slatwallScope` and every `getService(...)` lookup go away, because
// there is no ORM, no DI container and no ambient request scope here. There is
// deliberately NO `destroy*` export: nothing is persisted, so there is nothing
// to tear down, and a suite wanting teardown symmetry uses the runner's own
// per-test hook.
//
// CFML parity [meta/tests/unit/Helper.cfc:L53]: the legacy helper assigned
// `productData` without `var`, leaking it into component scope. That is a
// harness hygiene defect, not one of the preserved business-logic defects, and
// is deliberately NOT reproduced here.
//
// THE ANTI-PATTERN THIS FILE IS THE OPPOSITE OF
// [meta/tests/unit/SlatwallUnitTestBase.cfc:L52] instantiates the whole
// `Slatwall.Application`, L60 calls `bootstrap()` to raise the ORM and the DI/1
// container before EVERY test, L62 elevates the request account to superuser,
// and the teardown at L53 and L70 is commented out. Every legacy "unit" test
// boots the real application, so the legacy suite is integration-style at every
// level. This factory constructs plain objects and ported entity instances and
// nothing else.
//
// TEST COVERAGE BUILT ON THIS FIXTURE IS NET-NEW, NOT PARITY. No legacy test
// touches the promotion engine, the order aggregate or any order-shaped input:
// `meta/tests/unit/service/` holds only AccountServiceTest, HibachiServiceTest,
// PaymentServiceTest and UtilityRBServiceTest, none of them in scope. Every
// suite consuming this module must therefore be labelled NET-NEW in
// `tests/traceability/legacyTestMap.ts` and none of it may be presented as
// carried-forward coverage. Regression suites follow the `issue_<ticket#>`
// convention from [meta/tests/unit/IssuesTest.cfc], including `issue_1766` for
// the preserved no-op recorded below.
//
// THE BINDING STANDARD: NO USER RULES WERE PROVIDED FOR THIS PROJECT. The rules
// document returns exactly "No user rules provided.", so zero rules govern this
// file and none is invented. Their absence is not licence to lower the bar:
// enterprise-standard best practice applies in their place - maximal strictness
// with no `any`, no `@ts-ignore` and no non-null assertion; a single arithmetic
// surface, so every monetary value here is `Money` and no floating-point
// operation is ever applied to one; no credential, no `process.env` read and no
// I/O of any kind; one exported unit and no barrel file; and an in-code
// annotation on every judgment call and every preserved defect.
//
// MONEY IS `Money`, COUNTS AND WEIGHTS ARE `number`. `price`, `skuPrice`,
// `extendedPrice`, `extendedSkuPrice`, `fulfillmentCharge`, `discountAmount`,
// `subtotal`, `subtotalAfterItemDiscounts`, `fulfillmentChargeAfterDiscountTotal`
// and `discountPerUseValue` are all `Money`, constructed only from decimal
// STRING literals through `Money.fromDecimalString` - the class constructor is
// private, so there is no numeric path into it. `quantity`,
// `totalSaleQuantity`, `totalShippingWeight`, `discountQuantity`, `usedInOrder`
// and the three `maximumUse*` limits are plain `number`s, and none of them may
// be promoted to `Money` for symmetry.
//
// EVERY INSTANT IS AN EXPLICIT UTC ISO-8601 STRING LITERAL. There is no
// `new Date()` without an argument, no `Date.now()` and no offset from the
// wall clock anywhere in this file, so two runs a month apart produce the same
// graph.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// LOCAL TYPES - none of them exported
//
// One exported unit per file, so every type below stays private to this module.
// Where a sibling's type is needed it is DERIVED structurally rather than
// re-declared, exactly as the four sibling fixtures do, so a change to the owner
// breaks the build here instead of drifting silently.
// ---------------------------------------------------------------------------

/** The whole graph the promotion fixture hands back, reached without an import. */
type PromotionFixtureGraphRef = ReturnType<typeof makePromotionFixtures>;

/**
 * The four named reward arrangements, taken from the owner rather than retyped.
 *
 * `'empty'` is a first-class member: with no rewards the loop body at
 * [model/service/PromotionService.cfc:L167-L465] never executes.
 */
type RewardOrderingName = PromotionFixtureGraphRef['rewardOrderings'][number]['name'];

/** The pre-verified 19.99 x 3 at 12.5% reference figures, from their owner. */
type ReferenceCalculationRef = PromotionFixtureGraphRef['referenceCalculation'];

/**
 * The order item's type shape, reached STRUCTURALLY.
 *
 * `orderItemView.ts` declares `OrderItemTypeView` beside its exported unit and
 * deliberately does not export it, recording that a consumer which needs to name
 * the shape reaches it through this indexed access. This is that consumer.
 */
type OrderItemTypeViewRef = OrderItemView['orderItemType'];

/**
 * The `Promotion` entity, reached through the accumulator that already names it.
 *
 * `src/domain/entities/promotion.ts` is not in this module's dependency set, and
 * inventing an import to a file the plan did not authorise would be a scope
 * violation. `QualifiedDiscount` already declares the member, so an indexed access
 * gets the type with no new edge in the graph.
 */
type PromotionRef = QualifiedDiscount['promotion'];

/** The `PromotionQualifier` entity, reached the same way, through its qualification. */
type PromotionQualifierRef = QualifierQualification['qualifier'];

/**
 * How the golden order's items relate to the reward's eligible price groups.
 *
 * `'mixed'` is the default and is the only value under which all three arms of
 * the L241 discriminator are reachable from one order.
 */
type PriceGroupEligibility = 'mixed' | 'none' | 'allAccepted' | 'allRejected';

/** One recorded call against the address-zone evaluator double. */
interface RecordedAddressZoneCall {
  readonly address: AddressProjection;

  readonly addressZone: AddressZoneProjection;
}

/**
 * Which arm of the L241 discriminator an item selects, and why.
 *
 * Published so a suite can pin the POLARITY rather than re-derive it. The two
 * boolean columns are the two disjuncts of the legacy condition, evaluated with
 * the same null semantics the legacy `isNull` has, and `correctionTerm` is the
 * `extendedSkuPrice - extendedPrice` difference the second arm subtracts.
 */
interface ItemPriceArmSelection {
  readonly orderItemID: string;

  /** The first disjunct: `isNull(orderItem.getAppliedPriceGroup())`. */
  readonly appliedPriceGroupIsNull: boolean;

  /** The second disjunct: `reward.hasEligiblePriceGroup(...)`. */
  readonly rewardAcceptsAppliedPriceGroup: boolean;

  readonly selectedArm: 'price' | 'skuPriceWithCorrection';

  /** Zero on the first arm, and deliberately NON-ZERO on the second. */
  readonly correctionTerm: Money;
}

/**
 * The caller-owned sink for everything the `OrderView` return type cannot carry.
 *
 * MUTABLE BY DESIGN, and the only mutable surface this module produces apart
 * from the ledger and the accumulator it holds. The caller creates an empty
 * object, passes it as `overrides.capture`, and reads the members back after the
 * call; this factory writes each member exactly once per call and retains no
 * reference to the sink, so two calls with two sinks share nothing.
 *
 * Every member is optional because the caller starts from `{}`. All of them are
 * populated on every call.
 */
interface OrderViewFixtureCapture {
  /**
   * The reward array IN THE CALLER'S ORDER.
   *
   * LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L51-L132]: getActivePromotionRewards applies no
   * ORDER BY, so reward iteration order - which the mutable usage ledger at
   * model/service/PromotionService.cfc:L297 makes outcome-affecting - is non-deterministic.
   * Preserved deliberately; do not fix without a product decision.
   *
   * This array is therefore handed back exactly as it was assembled and is never
   * sorted, re-ordered or normalised here. A suite asserts behaviour GIVEN an
   * order, and selects that order by name through `overrides.rewardOrdering`.
   */
  promotionRewards?: readonly PromotionReward[];

  /** Which named arrangement produced `promotionRewards`. */
  rewardOrderingName?: RewardOrderingName;

  /**
   * Whether that arrangement reaches pass two.
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L457-L461]: the two-pass reset mutates the
   * loop counter from inside the loop body, so pass two never runs when the reward collection is
   * empty, and only runs when the LAST reward belongs to a qualifying period.
   * Preserved deliberately; do not fix without a product decision.
   */
  rewardOrderingReachesPassTwo?: boolean;

  /**
   * The FRESH, MUTABLE reward usage ledger, keyed by promotion reward ID.
   *
   * Mutable because the engine increments `usedInOrder` IN PLACE at
   * [model/service/PromotionService.cfc:L297]; fresh per call because on a warm
   * Lambda container module-level state would persist between unrelated
   * requests, which is exactly the hazard the four legacy component-level caches
   * present (AAP 0.6.5).
   */
  rewardUsageDetails?: PromotionRewardUsageDetails;

  /** The ledger key whose `usedInOrder` exceeds its own `maximumUsePerOrder`. */
  overusedRewardID?: string;

  /**
   * The ledger key the stripping loop reads by mistake - the LAST reward the
   * preceding loop touched. Deliberately different from `overusedRewardID`.
   */
  leakedRewardID?: string;

  /** The `1000000` stand-in for "unlimited", from its owner. */
  unlimitedUseSentinel?: number;

  /** The FRESH, MUTABLE qualified-discount accumulator, keyed by order item ID. */
  orderItemQualifiedDiscounts?: OrderItemQualifiedDiscounts;

  /** The FRESH, MUTABLE period qualifications, keyed by promotion period ID. */
  promotionPeriodQualifications?: PromotionPeriodQualifications;

  /** The period every default reward belongs to. */
  promotionPeriod?: PromotionPeriod;

  /**
   * A period whose `qualificationsMeet` is false, present only when
   * `overrides.lastRewardPeriodQualifies` is false.
   */
  nonQualifyingPromotionPeriod?: PromotionPeriod;

  /**
   * The qualified fulfillment identifiers as a COMMA-DELIMITED STRING.
   *
   * CFML parity [model/service/PromotionService.cfc:L752-L757]:
   * `getPromotionPeriodQualifiedFulfillmentIDList` starts from `""` and
   * `listAppend`s, so an order with no fulfillments yields the EMPTY STRING and
   * never an absent value. Built here with the `src/lib/cfml/list.ts` helpers
   * rather than `Array.prototype.join`, so the empty-list convention is applied
   * deliberately instead of by accident.
   */
  qualifiedFulfillmentIDList?: string;

  /** `listLen` of the list above - `0` for the empty list, never `1`. */
  qualifiedFulfillmentIDCount?: number;

  /** `cfLen(promotionCodeList) === 0`, evaluated with CFML `len()` semantics. */
  promotionCodeListIsEmpty?: boolean;

  /**
   * The minimal in-memory address-zone evaluator double.
   *
   * Its answer is entirely caller-controlled through `overrides.addressIsInZone`.
   * No zone logic is implemented here: the real predicate is
   * [model/service/AddressService.cfc:L57] and porting it belongs to
   * `src/services/**`, not to a fixture.
   */
  addressZoneEvaluator?: AddressZoneEvaluator;

  /** Every call the double received, in call order. */
  addressZoneEvaluatorCalls?: readonly RecordedAddressZoneCall[];

  /** A single-location zone to hand the double as its second argument. */
  addressZone?: AddressZoneProjection;

  /**
   * The shipping fulfillment's address already projected onto the port's shape.
   *
   * Absent columns are projected as `null`, which is both what
   * `AddressProjection` permits and the honest projection of a NULL column.
   * Published so a suite hands the port a ready argument instead of re-deriving
   * the projection - and so the projection lives in exactly one place.
   */
  shippingAddressProjection?: AddressProjection;

  /**
   * The item-type code that is NOT `oitSale`, so a suite need not hardcode it.
   *
   * Pass it through `itemOverrides[n].orderItemTypeSystemCode` to prove the item
   * is skipped by [model/service/PromotionService.cfc:L206].
   */
  nonSaleOrderItemTypeSystemCode?: string;

  /** The single largest seeded discount - the only one L534 ever applies. */
  bestQualifiedDiscountAmount?: Money;

  /** The price group the reward NAMES as eligible - shared identity, see below. */
  acceptedPriceGroup?: PriceGroup;

  /** A price group the reward does NOT name, so the second arm is reachable. */
  rejectedPriceGroup?: PriceGroup;

  /** Which arm each item selects, and the correction term it carries. */
  itemPriceArmSelections?: readonly ItemPriceArmSelection[];

  /**
   * The three `appliedType` values the engine writes, and no fourth.
   *
   * Taken from the union `src/domain/entities/promotionApplied.ts` declares:
   * `'orderItem'` at [model/service/PromotionService.cfc:L531], `'order'` at
   * [model/service/PromotionService.cfc:L448] and the fulfillment-level value at
   * [model/service/PromotionService.cfc:L402].
   */
  appliedTypes?: readonly PromotionAppliedType[];

  /** One shipping-method option over this order, for the shipping-discount path. */
  shippingMethodOption?: ShippingMethodOptionView;

  /** The rate that option carries. */
  shippingMethodRate?: ShippingMethodRateView;

  /** `listFindNoCase("otSalesOrder,otExchangeOrder", systemCode) > 0` - the L61 gate. */
  reachesDiscountBody?: boolean;

  /** `listFindNoCase("otReturnOrder,otExchangeOrder", systemCode) > 0` - the L542 gate. */
  reachesReturnExchangeNoOp?: boolean;

  /** The ticket the preserved no-op cites, for an `issue_<ticket#>` suite name. */
  preservedReturnExchangeNoOpTicket?: string;

  /** The pre-verified reference figures the golden first item lines up with. */
  referenceCalculation?: ReferenceCalculationRef;

  /** The fixed instant every date in this graph is derived from. */
  now?: Date;
}

// ---------------------------------------------------------------------------
// The overrides surface
//
// EVERY variation this module supports flows through this ONE optional
// parameter. There is never a second export, so a suite cannot reach past the
// factory to a shared literal and mutate it.
//
// Every member is `?: T | undefined` rather than `?: T`. `exactOptionalPropertyTypes`
// is on, so "key absent" and "key present carrying undefined" are genuinely
// different types, and three members here depend on the distinction: an absent
// `accountID` means "use the documented default", while an explicitly-passed
// `undefined` means "the guest-checkout case, no account at all". Likewise for
// `appliedPriceGroup` on an item and `shippingMethod` / `address` on a
// fulfillment.
//
// ⭐ SOURCE-WINS CORRECTION (i). The folder requirements instruct "OMIT THE KEY
// ENTIRELY" to express an absent `appliedPriceGroup` / `shippingMethod`. That is
// the right rule for THIS interface and it is followed here - but it is NOT how
// the three view modules model absence. `orderItemView.ts`,
// `orderFulfillmentView.ts` and `orderView.ts` each carry an explicit JUDGMENT
// CALL recording that a value the legacy schema permits to be NULL is declared as
// a REQUIRED member whose type includes `undefined`, never as an optional `?:`
// member, precisely so that "absent" is one unambiguous state instead of two. The
// views are the authority for their own shape, so the returned graph writes
// `appliedPriceGroup: undefined` explicitly while the overrides bags below omit
// the key. The two conventions are deliberate and they meet at this factory.
// ---------------------------------------------------------------------------

/** Per-item overrides, applied POSITIONALLY over the golden order's items. */
interface OrderItemFixtureOverrides {
  /** Opaque [model/entity/OrderItem.cfc:L52]; never parsed, derived or validated. */
  readonly orderItemID?: string | undefined;

  /** [model/entity/OrderItem.cfc:L84] `fetch="join"`, so always materialised. */
  readonly sku?: Sku | undefined;

  /** [model/entity/OrderItem.cfc:L57] `integer`. A plain number - NOT money. */
  readonly quantity?: number | undefined;

  /** [model/entity/OrderItem.cfc:L55] `big_decimal`, therefore `Money`. */
  readonly price?: Money | undefined;

  /** [model/entity/OrderItem.cfc:L56] `big_decimal`, therefore `Money`. */
  readonly skuPrice?: Money | undefined;

  /**
   * ⭐ SOURCE-WINS CORRECTION (c): CALCULATED, not persistent.
   *
   * Overriding this INDEPENDENTLY of `price` and `quantity` produces a pair that
   * production cannot produce, because [model/entity/OrderItem.cfc:L200-L202]
   * derives it. That is the point: a suite can pin what the engine does with an
   * inconsistent pair without having to fake an ORM.
   */
  readonly extendedPrice?: Money | undefined;

  /** ⭐ Also CALCULATED, at [model/entity/OrderItem.cfc:L204-L206]. */
  readonly extendedSkuPrice?: Money | undefined;

  /**
   * OMIT this key for the documented default; write it as `undefined` to force
   * the price-group-ineligible state.
   *
   * [model/entity/OrderItem.cfc:L79] declares no `notnull`, so NULL is a real
   * column state, and it is the state `PriceGroupService` leaves an item in when
   * it declines to apply a group.
   */
  readonly appliedPriceGroup?: PriceGroup | undefined;

  /**
   * ⭐ SOURCE-WINS CORRECTION (b): the `oitSale` gate.
   *
   * [model/service/PromotionService.cfc:L206] admits an item into the discount
   * body only when this equals `'oitSale'`, so a non-`oitSale` value is how a
   * suite proves an item is skipped.
   */
  readonly orderItemTypeSystemCode?: string | undefined;

  /** Opaque; the fulfillment this item belongs to, for the L209 membership test. */
  readonly orderFulfillmentID?: string | undefined;
}

/** Per-fulfillment overrides, applied POSITIONALLY over the golden fulfillments. */
interface OrderFulfillmentFixtureOverrides {
  /** Opaque [model/entity/OrderFulfillment.cfc:L52]. */
  readonly orderFulfillmentID?: string | undefined;

  /** [model/entity/OrderFulfillment.cfc:L54] `big_decimal` - IS money. */
  readonly fulfillmentCharge?: Money | undefined;

  /** [model/entity/OrderFulfillment.cfc:L69] many-to-one, `notnull`. */
  readonly fulfillmentMethod?: FulfillmentMethodView | undefined;

  /**
   * OMIT for the documented default; write `undefined` for the NULL column.
   *
   * [model/entity/OrderFulfillment.cfc:L74] declares no `notnull`, and the NULL
   * case is what reaches LEGACY-DEFECT 11 at [model/service/PromotionService.cfc:L703].
   */
  readonly shippingMethod?: ShippingMethodView | undefined;

  /** [model/entity/OrderFulfillment.cfc:L79] `PromotionApplied`, `inverse`. */
  readonly appliedPromotions?: readonly AppliedPromotionView[] | undefined;

  /**
   * ⭐ SOURCE-WINS CORRECTION (h): WEIGHT, NOT MONEY.
   *
   * [model/entity/OrderFulfillment.cfc] declares it `hb_formatType="weight"`, and
   * it feeds the two weight gates at [model/entity/PromotionQualifier.cfc:L63-L64].
   * Routing it through `Money` would be a category error - no currency, no
   * rounding rule and no conversion applies to a weight.
   */
  readonly totalShippingWeight?: number | undefined;

  /**
   * The PRE-RESOLVED address. OMIT for the default; write `undefined` for none.
   *
   * See the JUDGMENT CALL at the builder: legacy `getAddress()` is not a pure
   * accessor and a read-only view cannot reproduce it.
   */
  readonly address?: ShippingAddressView | undefined;

  /** `Address.isNew()` [model/service/PromotionService.cfc:L359], as a flag. */
  readonly addressIsNew?: boolean | undefined;
}

interface OrderViewFixtureOverrides {
  /** Prefix for every generated identifier, so two graphs can be told apart. */
  readonly idPrefix?: string | undefined;

  /**
   * The instant every predicate in this graph is evaluated against.
   *
   * Defaults to a fixed UTC literal. `PromotionPeriod.isCurrent(now)` takes its
   * instant as a parameter precisely so a fixture never has to consult the wall
   * clock, and nothing here calls `new Date()` with no argument or `Date.now()`.
   */
  readonly now?: Date | undefined;

  /**
   * The caller-owned sink for the engine-side scaffolding.
   *
   * Pass `{}` and read the members back after the call. This factory writes each
   * member exactly once and keeps NO reference to the object, so two calls with
   * two sinks share nothing at all.
   */
  readonly capture?: OrderViewFixtureCapture | undefined;

  // --- Order-level ----------------------------------------------------------

  /** Opaque [model/entity/Order.cfc:L52]. */
  readonly orderID?: string | undefined;

  /**
   * OMIT for the documented default; write `undefined` for guest checkout.
   *
   * `Account` is out of scope, so this is an opaque identifier and never an
   * object [model/entity/PromotionAccount.cfc:L58].
   */
  readonly accountID?: string | undefined;

  /**
   * ⭐ SOURCE-WINS CORRECTION (a): `OrderView` MUST carry an order-type code.
   *
   * The folder requirements list three order-level accessors; there are at least
   * five, and this is the one they omit. Both gates in the engine read it:
   * [model/service/PromotionService.cfc:L61] admits the discount body, and
   * [model/service/PromotionService.cfc:L542] selects the preserved no-op.
   * Defaults to the sales-order code so the golden order actually flows.
   */
  readonly orderTypeSystemCode?: string | undefined;

  /** [model/entity/Order.cfc] `currencyCode`, length 3 - the branded type. */
  readonly currencyCode?: CurrencyCode | undefined;

  /**
   * The promotion codes, as an ARRAY here and a comma list on the view.
   *
   * Defaults to empty, which yields the CFML empty list `''` - never `undefined`
   * - matching `order.getPromotionCodeList()` as the DAO call at
   * [model/service/PromotionService.cfc:L165] consumes it.
   */
  readonly promotionCodes?: readonly string[] | undefined;

  /** [model/entity/Order.cfc:L624]; a plain COUNT, deliberately not money. */
  readonly totalSaleQuantity?: number | undefined;

  /** [model/entity/Order.cfc:L686]; IS money. */
  readonly subtotal?: Money | undefined;

  /** [model/entity/Order.cfc:L700], read at [model/service/PromotionService.cfc:L417]. */
  readonly subtotalAfterItemDiscounts?: Money | undefined;

  /** [model/entity/Order.cfc:L356], read at [model/service/PromotionService.cfc:L417]. */
  readonly fulfillmentChargeAfterDiscountTotal?: Money | undefined;

  /** Order-level applied promotions; empty by default, as an unpriced order is. */
  readonly appliedPromotions?: readonly AppliedPromotionView[] | undefined;

  // --- Items ----------------------------------------------------------------

  /**
   * Replace the item array WHOLESALE, for the narrow single-item variants.
   *
   * Supplying this bypasses `itemOverrides`, `priceGroupEligibility` and
   * `orderItemTypeSystemCode`, because the caller has taken ownership of the
   * array. The array is still COPIED before it reaches the frozen view.
   */
  readonly orderItems?: readonly OrderItemView[] | undefined;

  /** Positional per-item overrides over the three golden items. */
  readonly itemOverrides?: readonly OrderItemFixtureOverrides[] | undefined;

  /**
   * How the golden items relate to the reward's eligible price groups.
   *
   * `'mixed'` - the default - is the ONLY value under which all three arms of the
   * L241 discriminator are reachable from a single order.
   */
  readonly priceGroupEligibility?: PriceGroupEligibility | undefined;

  /** Applied to every default item; `'oitSale'` unless overridden. */
  readonly orderItemTypeSystemCode?: string | undefined;

  /**
   * Whether the two calculated extended amounts agree with `price x quantity`.
   *
   * `'consistent'` is the default and is the only state production can reach.
   * `'inconsistent'` exists so a suite can pin engine behaviour on a pair the ORM
   * could never have produced.
   */
  readonly extendedAmountConsistency?: 'consistent' | 'inconsistent' | undefined;

  // --- Fulfillments ---------------------------------------------------------

  /** Replace the fulfillment array WHOLESALE. Still copied before freezing. */
  readonly orderFulfillments?: readonly OrderFulfillmentView[] | undefined;

  /** Positional per-fulfillment overrides over the golden fulfillments. */
  readonly fulfillmentOverrides?: readonly OrderFulfillmentFixtureOverrides[] | undefined;

  /**
   * Keep the second, PICKUP fulfillment - no shipping method, no address.
   *
   * `true` by default. It is the only fulfillment that reaches the unguarded
   * `getAddress()` dereference at [model/service/PromotionService.cfc:L703].
   */
  readonly includePickupFulfillment?: boolean | undefined;

  // --- Rewards --------------------------------------------------------------

  /**
   * Which NAMED reward arrangement to hand back, in that exact order.
   *
   * `'empty'` is the explicit empty-reward-array variant. `'orderRewardLast'` is
   * the default and the only arrangement whose LAST reward is the order-level
   * one, which is what makes pass two reachable.
   */
  readonly rewardOrdering?: RewardOrderingName | undefined;

  /**
   * Replace the reward array WHOLESALE, IN THE CALLER'S ORDER.
   *
   * Never sorted, re-ordered or normalised here - see the no-`ORDER BY` defect on
   * the capture sink.
   */
  readonly promotionRewards?: readonly PromotionReward[] | undefined;

  /**
   * Does the period the LAST reward belongs to qualify?
   *
   * `true` by default. `false` builds a SECOND promotion graph under a distinct
   * `idPrefix`, so its period identifier differs, and marks that period's
   * `qualificationsMeet` false - which is how a suite proves pass two is skipped
   * even though the reward array is non-empty.
   */
  readonly lastRewardPeriodQualifies?: boolean | undefined;

  // --- The usage ledger -----------------------------------------------------

  /** Replace the ledger WHOLESALE. It stays MUTABLE - the engine writes to it. */
  readonly rewardUsageDetails?: PromotionRewardUsageDetails | undefined;

  /** `usedInOrder` for the entry that overruns its own per-order limit. */
  readonly overusedRewardUsedInOrder?: number | undefined;

  /**
   * OMIT for the documented default; write `undefined` for the NULL column.
   *
   * `undefined` is what routes the seeder down the `1000000` sentinel path at
   * [model/service/PromotionService.cfc:L175].
   */
  readonly rewardMaximumUsePerOrder?: number | undefined;

  /** As above, for [model/service/PromotionService.cfc:L176]. */
  readonly rewardMaximumUsePerItem?: number | undefined;

  /** As above, for [model/service/PromotionService.cfc:L177]. */
  readonly rewardMaximumUsePerQualification?: number | undefined;

  /**
   * Do the two over-used ledger entries reference the SAME order items?
   *
   * `'differentOrderItems'` is the default and is the ONLY layout under which
   * LEGACY-DEFECT 9 is observable. `'sameOrderItems'` is the contrast case, where
   * the cross-wired lookup happens to find a matching discount and strips a WRONG
   * AMOUNT rather than silently stripping nothing.
   */
  readonly usageLedgerLayout?: 'differentOrderItems' | 'sameOrderItems' | undefined;

  /**
   * `discountQuantity` on the seeded usage entries.
   *
   * Set it to `0` to reach the two unguarded divisions at
   * [model/service/PromotionService.cfc:L299] and [model/service/PromotionService.cfc:L486].
   */
  readonly usageDiscountQuantity?: number | undefined;

  // --- Qualified discounts --------------------------------------------------

  /**
   * The discount amounts seeded onto the FIRST golden item, as decimal strings.
   *
   * Three DISTINCT descending amounts by default, so both the descending
   * insert-sort and "only index [1] is applied" are observable at once. Supplied
   * as strings because a monetary value is never built from a JavaScript number.
   */
  readonly qualifiedDiscountAmounts?: readonly string[] | undefined;

  // --- Collaborator doubles -------------------------------------------------

  /**
   * The answer the address-zone evaluator double returns, for EVERY call.
   *
   * `false` by default. Caller-controlled precisely so no zone logic is
   * implemented here - the real predicate is [model/service/AddressService.cfc:L57].
   */
  readonly addressIsInZone?: boolean | undefined;

  /**
   * The price groups the reward NAMES as eligible.
   *
   * ⭐ SHARED IDENTITY IS REQUIRED, and it is the one deliberate exception to the
   * fresh-graph rule documented at the builder: `reward.hasEligiblePriceGroup(...)`
   * can only resolve if the instance the reward holds IS the instance an order
   * item's `appliedPriceGroup` references.
   */
  readonly eligiblePriceGroups?: readonly PriceGroup[] | undefined;
}

// ---------------------------------------------------------------------------
// Module-scope constants
//
// IMMUTABLE PRIMITIVES ONLY - strings, numbers and booleans. There is no
// counter, no identifier sequence with cross-call memory, no registry, no
// lazily-cached instance and no frozen object literal handed to two callers.
//
// That prohibition is not stylistic. Four legacy component-level caches show
// exactly what module state costs on a warm Lambda container, where it survives
// between UNRELATED requests: `SkuDAO.variables.nextOptionGroupSortOrder`
// [model/dao/SkuDAO.cfc:L204-L220], whose clear method at
// [model/dao/SkuDAO.cfc:L222-L226] has an inverted condition and can never fire;
// `RoundingRuleService.variables.roundingRuleDetails`
// [model/service/RoundingRuleService.cfc:L67-L77]; the un-`var`'d `discountAmount`
// leaking into component scope at [model/service/PromotionService.cfc:L1007]
// and [model/service/PromotionService.cfc:L1009]; and every entity memo. All four
// become request-scoped in the target, and a fixture that reintroduced shared
// state here would reintroduce the hazard the port exists to remove.
// ---------------------------------------------------------------------------

/**
 * The instant this graph is evaluated against, as an explicit UTC ISO-8601
 * literal.
 *
 * `PromotionPeriod.isCurrent(now: Date)` takes its instant as a parameter - the
 * one deliberate signature widening in the entity layer - precisely so a fixture
 * never consults the wall clock. The legacy pair calls `now()` independently in
 * `isCurrent()` [model/entity/PromotionPeriod.cfc:L78-L81], which is
 * start-inclusive and end-exclusive with no `isDate` guard, and in `isExpired()`
 * [model/entity/PromotionPeriod.cfc:L83-L85], which does guard.
 */
const FIXED_NOW_ISO = '2024-06-01T12:00:00.000Z';

/**
 * The two order-type gates, as the comma lists the legacy source spells them.
 *
 * ⭐ SOURCE-WINS CORRECTION (a). `otExchangeOrder` appears in BOTH lists, so an
 * exchange order runs the whole discount body AND then enters the preserved
 * no-op. Neither gate is the negation of the other.
 */
const SALE_OR_EXCHANGE_ORDER_TYPES = 'otSalesOrder,otExchangeOrder';

/** The second gate, at [model/service/PromotionService.cfc:L542]. */
const RETURN_OR_EXCHANGE_ORDER_TYPES = 'otReturnOrder,otExchangeOrder';

/** [model/entity/Order.cfc:L870] resolves NULL to this through the settings port. */
const SALES_ORDER_SYSTEM_CODE = 'otSalesOrder';

/**
 * ⭐ SOURCE-WINS CORRECTION (b): the item-type gate the folder requirements omit.
 *
 * [model/service/PromotionService.cfc:L206] admits an order item into the
 * discount body only when its type system code equals this value, and
 * [model/entity/Order.cfc:L686] adds an item's extended price to the subtotal
 * only for the same code - throwing outright for any code it does not recognise.
 */
const SALE_ORDER_ITEM_SYSTEM_CODE = 'oitSale';

/** A deliberately non-`oitSale` code, so "this item is skipped" is assertable. */
const RETURN_ORDER_ITEM_SYSTEM_CODE = 'oitReturn';

/** Opaque identifiers. Stable and readable, never parsed and never derived from. */
const GOLDEN_ORDER_ID = 'order-golden-1';
const GOLDEN_ACCOUNT_ID = 'account-golden-1';
const ITEM_ID_NO_PRICE_GROUP = 'oi-merch-no-price-group';
const ITEM_ID_PRICE_GROUP_ACCEPTED = 'oi-merch-price-group-accepted';
const ITEM_ID_PRICE_GROUP_REJECTED = 'oi-merch-price-group-rejected';
const FULFILLMENT_ID_SHIPPING = 'of-shipping-1';
const FULFILLMENT_ID_PICKUP = 'of-pickup-1';

/**
 * Item 1 - the REFERENCE item, and the reason its numbers are not negotiable.
 *
 * 19.99 x 3 = 59.97; less 12.5% = 7.49625; net 52.47375; presented "52.47".
 * That chain was verified end to end during planning and it is what proves an
 * arbitrary-precision decimal plus an explicit two-decimal presentation step
 * reproduces `numberFormat(discountAmount,"0.00")`
 * [model/service/PromotionService.cfc:L1017] with no IEEE-754 drift.
 *
 * This item carries NO applied price group, so `PriceGroupService` never lowered
 * its price and `skuPrice` therefore equals `price`.
 */
const ITEM_1_PRICE = '19.99';
const ITEM_1_QUANTITY = 3;

/**
 * Item 2 - a price group the reward ACCEPTS.
 *
 * `price` sits BELOW `skuPrice` because that is the only state
 * [model/service/PriceGroupService.cfc:L370-L372] will write: it applies a group
 * only when the computed price is strictly less than the item's current price.
 */
const ITEM_2_PRICE = '17.99';
const ITEM_2_SKU_PRICE = '22.49';
const ITEM_2_QUANTITY = 2;

/**
 * Item 3 - a price group the reward REJECTS, and the ONLY item that reaches the
 * second arm of the L241 discriminator.
 *
 * The gap between the two extended amounts is 14.00, deliberately non-zero: a
 * zero correction term would make the cross-service ordering dependency
 * invisible, which is the whole point of this item.
 */
const ITEM_3_PRICE = '8.50';
const ITEM_3_SKU_PRICE = '12.00';
const ITEM_3_QUANTITY = 4;

/**
 * The deliberately WRONG extended price for the inconsistent-pair variant.
 *
 * Production cannot reach this state, because both extended amounts are derived
 * [model/entity/OrderItem.cfc:L200-L206]. It exists so a suite can pin what the
 * engine does when handed a pair that disagrees with `price x quantity` - the
 * correction term at [model/service/PromotionService.cfc:L252] is computed from
 * these two values and from nothing else, so a disagreement is money.
 */
const INCONSISTENT_EXTENDED_PRICE = '1.00';

/** 59.97 + 35.98 + 34.00, over the three `oitSale` items only. */
const GOLDEN_SUBTOTAL = '129.95';

/** The subtotal less the single largest discount applied to item 1. */
const GOLDEN_SUBTOTAL_AFTER_ITEM_DISCOUNTS = '117.95';

/** 9.50 shipping plus 0.00 pickup. */
const GOLDEN_FULFILLMENT_CHARGE_AFTER_DISCOUNT_TOTAL = '9.50';
const SHIPPING_FULFILLMENT_CHARGE = '9.50';
const PICKUP_FULFILLMENT_CHARGE = '0.00';

/** 3 + 2 + 4, a plain COUNT [model/entity/Order.cfc:L624]. */
const GOLDEN_TOTAL_SALE_QUANTITY = 9;

/**
 * ⭐ WEIGHT, NOT MONEY - see SOURCE-WINS CORRECTION (h).
 *
 * `hb_formatType="weight"` on the fulfillment, feeding
 * [model/entity/PromotionQualifier.cfc:L63-L64]. A plain number.
 */
const SHIPPING_TOTAL_WEIGHT = 12.5;
const PICKUP_TOTAL_WEIGHT = 0;

/**
 * THREE DISTINCT amounts, already in descending order.
 *
 * Distinct because equal amounts make an insert-sort's tie behaviour the thing
 * under test rather than the ordering itself; three because two cannot
 * distinguish "sorted descending" from "reversed". The middle value is the
 * reference discount, so one figure ties the accumulator to the money suite.
 */
const GOLDEN_QUALIFIED_DISCOUNT_AMOUNTS: readonly string[] = ['12.00', '7.49625', '3.25'];

/** The largest of the three - the only one [model/service/PromotionService.cfc:L534] applies. */
const GOLDEN_BEST_DISCOUNT_AMOUNT = '12.00';

/** `discountQuantity` on each seeded usage entry; `0` reaches the unguarded divisions. */
const DEFAULT_USAGE_DISCOUNT_QUANTITY = 2;

/** Above the over-used entry's own `maximumUsePerOrder`, so L471 is satisfied. */
const DEFAULT_OVERUSED_USED_IN_ORDER = 5;

/** A small, genuinely exceedable per-order limit for the over-used entry. */
const DEFAULT_OVERUSED_MAXIMUM_USE_PER_ORDER = 2;

/** The default per-item and per-qualification limits for a bounded entry. */
const DEFAULT_BOUNDED_MAXIMUM_USE_PER_ITEM = 3;
const DEFAULT_BOUNDED_MAXIMUM_USE_PER_QUALIFICATION = 4;

/** The pre-resolved shipping address, as plain projected columns. */
const SHIPPING_ADDRESS_POSTAL_CODE = '94105';
const SHIPPING_ADDRESS_CITY = 'San Francisco';
const SHIPPING_ADDRESS_STATE_CODE = 'CA';
const SHIPPING_ADDRESS_COUNTRY_CODE = 'US';

/** The three-character default from [model/service/SettingService.cfc:L221]. */
const DEFAULT_CURRENCY_CODE = 'USD';

/** The sale-price seed's reward key. See the builder for why it is EMPTY. */
const SALE_PRICE_SEED_REWARD_ID = '';

/** The amount seeded by the sale-price pass at [model/service/PromotionService.cfc:L145-L162]. */
const SALE_PRICE_SEED_AMOUNT = '5.00';

/** The shipping method the golden shipping fulfillment carries. */
const SHIPPING_METHOD_ID = 'sm-ground';

/** The two fulfillment methods, by [model/entity/OrderFulfillment.cfc:L69] type. */
const SHIPPING_FULFILLMENT_METHOD_ID = 'fm-shipping';
const SHIPPING_FULFILLMENT_METHOD_TYPE = 'shipping';
const PICKUP_FULFILLMENT_METHOD_ID = 'fm-pickup';
const PICKUP_FULFILLMENT_METHOD_TYPE = 'pickup';

// ---------------------------------------------------------------------------
// Overrides plumbing
//
// Two helpers, and the reason there are two rather than one `??`.
//
// `exactOptionalPropertyTypes` makes "key absent" and "key present carrying
// undefined" distinct types, and several members here need both states to be
// reachable: an absent `accountID` means "use the documented default", while an
// explicit `undefined` means "guest checkout, no account at all". `??` cannot
// express that difference - it would silently replace the caller's `undefined`
// with the default and make the absent state unreachable. `Object.hasOwn`
// separates the two intents exactly.
//
// `??` remains the right operator wherever absence carries no distinct meaning,
// and it is used directly at those sites rather than routed through here.
// ---------------------------------------------------------------------------

/** Was `key` written by the caller at all, whatever value it carries? */
function hasOverride(
  overrides: OrderViewFixtureOverrides | undefined,
  key: keyof OrderViewFixtureOverrides,
): boolean {
  return overrides !== undefined && Object.hasOwn(overrides, key);
}

/** The caller's value when the key was written, and the documented default otherwise. */
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

/** The per-item equivalent, for the positional bags. */
function hasItemOverride(
  itemOverrides: OrderItemFixtureOverrides | undefined,
  key: keyof OrderItemFixtureOverrides,
): boolean {
  return itemOverrides !== undefined && Object.hasOwn(itemOverrides, key);
}

/** The per-fulfillment equivalent, for the positional bags. */
function hasFulfillmentOverride(
  fulfillmentOverrides: OrderFulfillmentFixtureOverrides | undefined,
  key: keyof OrderFulfillmentFixtureOverrides,
): boolean {
  return fulfillmentOverrides !== undefined && Object.hasOwn(fulfillmentOverrides, key);
}

/**
 * The positional bag at `index`, or `undefined`.
 *
 * Written as an explicit read rather than `bags[index]` with a non-null
 * assertion, because `noUncheckedIndexedAccess` is on and `!` is not used in
 * this file at all.
 */
function bagAt<TBag>(bags: readonly TBag[] | undefined, index: number): TBag | undefined {
  if (bags === undefined || index < 0 || index >= bags.length) {
    return undefined;
  }
  return bags[index];
}

// ---------------------------------------------------------------------------
// Module-scope pure builders
//
// FUNCTIONS, NEVER DATA. Each returns a freshly constructed value on every call,
// so no array, no object, no `Date`, no `Money` and no double is ever shared
// between two graphs.
//
// ⭐ DEFENSIVE COPYING IS MANDATORY, and the reason is a CFML/TypeScript
// divergence that silently changes behaviour. [model/service/PriceGroupService.cfc:L276]
// does `var priceGroups = account.getPriceGroups();` and then `arrayAppend`s to it
// at [model/service/PriceGroupService.cfc:L282]. CFML COPIES ARRAYS BY VALUE, so
// the account's own collection is untouched. The direct TypeScript transliteration
// holds a REFERENCE and would mutate it. Every collection this module hands out is
// therefore a fresh array, never an alias of an input.
// ---------------------------------------------------------------------------

/** A fresh, independent copy of a read-only array. */
function copyOf<TElement>(source: readonly TElement[]): TElement[] {
  return source.slice();
}

/**
 * The item type shape, freshly built.
 *
 * ⭐ SOURCE-WINS CORRECTION (b), as data. `orderItemView.ts` declares
 * `OrderItemTypeView` beside its exported unit and deliberately does not export
 * it, recording that a consumer needing to name the shape reaches it through an
 * indexed access. This is that consumer, and `OrderItemTypeViewRef` is that
 * indexed access - so a change to the owner breaks this build instead of drifting.
 */
function buildOrderItemType(systemCode: string): OrderItemTypeViewRef {
  return Object.freeze({ systemCode });
}

/**
 * The PRE-RESOLVED shipping address.
 *
 * JUDGMENT CALL [model/entity/OrderFulfillment.cfc:L125+]: legacy getAddress() is not a pure
 * accessor - it falls back to copying the account address via setShippingAddress(...) and, when
 * both are null, constructs a new Address through getService("addressService"). A read-only
 * anti-corruption view cannot reproduce a mutating, service-locating accessor, so this fixture
 * supplies a single PRE-RESOLVED address plus an explicit isNew boolean for the
 * Address.isNew() call at model/service/PromotionService.cfc:L359.
 *
 * The persistent column is `shippingAddress` and there is no `address` column at
 * all; `address` is the name the ENGINE uses, at
 * [model/service/PromotionService.cfc:L358-L360], and the view is shaped to the
 * call site rather than to the table because the call site is what it feeds.
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
 *
 * Absent columns become `null` rather than an omitted key, because
 * `AddressProjection` declares each column `?: string | null` and
 * `exactOptionalPropertyTypes` forbids writing an explicit `undefined` into an
 * optional member. `null` is also the honest projection of a NULL column.
 */
function toAddressProjection(address: ShippingAddressView): AddressProjection {
  return Object.freeze({
    postalCode: address.postalCode ?? null,
    city: address.city ?? null,
    stateCode: address.stateCode ?? null,
    countryCode: address.countryCode ?? null,
  });
}

/** A single-location zone, to hand the evaluator double as its second argument. */
function buildAddressZone(): AddressZoneProjection {
  return Object.freeze({
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
 * The answer is CALLER-CONTROLLED and constant: whatever `answer` says, for every
 * call. No zone logic is implemented here, deliberately. The real predicate is
 * [model/service/AddressService.cfc:L57] and porting it belongs to
 * `src/services/**`; a fixture that reimplemented it would be asserting its own
 * arithmetic instead of the engine's behaviour.
 *
 * The call log exists because the address-zone qualifier is the one place a suite
 * needs to prove a collaborator was CONSULTED - and, at the L703 defect below,
 * that it was NOT.
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
 * One usage-ledger entry, seeded exactly as [model/service/PromotionService.cfc:L173-L188] seeds it.
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L173-L188]: null max-use limits are seeded
 * with the magic number 1000000 as a stand-in for "unlimited"
 * [model/entity/PromotionReward.cfc:L65-L67 hb_nullRBKey="define.unlimited"]. An explicit limit
 * of 0 is falsy but not null and therefore does NOT take the sentinel path.
 * Preserved deliberately; do not fix without a product decision.
 *
 * ⭐ THE ZERO TRAP, precisely. The legacy guards are
 * `!isNull(reward.getMaximumUsePerOrder()) && reward.getMaximumUsePerOrder() > 0`
 * at [model/service/PromotionService.cfc:L180], so a limit of `0` fails the SECOND
 * conjunct, never overwrites the sentinel, and leaves the entry effectively
 * unlimited - the exact opposite of what "maximum use: 0" reads as. That is
 * reproduced here: `0` keeps the sentinel.
 *
 * `usedInOrder` and `maximumUsePerOrder` are left MUTABLE because the engine
 * writes both - `usedInOrder` at [model/service/PromotionService.cfc:L297] and
 * `maximumUsePerOrder` through the over-use correction. `orderItemsUsage` is a
 * mutable array for the same reason: [model/service/PromotionService.cfc:L502]
 * deletes from it in place.
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
    // [L175] then [L180]: the sentinel first, overwritten only by a non-null POSITIVE limit.
    maximumUsePerOrder: applySeededLimit(sentinel, limits.maximumUsePerOrder),
    // [L176] then [L183].
    maximumUsePerItem: applySeededLimit(sentinel, limits.maximumUsePerItem),
    // [L177] then [L186].
    maximumUsePerQualification: applySeededLimit(sentinel, limits.maximumUsePerQualification),
    orderItemsUsage: copyOf(orderItemsUsage),
  };
}

/** The `!isNull(x) && x > 0` guard, as one place rather than three. */
function applySeededLimit(sentinel: number, limit: number | undefined): number {
  // The absent test is written in the form the compiler can follow rather than
  // delegated to `isNullish()`, whose `boolean` return - correct for its own
  // contract - does not narrow the union. It is the same test asked differently,
  // and `src/lib/cfml/truthiness.ts` records the identical trade-off in `cfLen`.
  if (limit === undefined) {
    // [L175]/[L176]/[L177]: a NULL limit leaves the sentinel standing.
    return sentinel;
  }
  if (limit > 0) {
    // [L180]/[L183]/[L186]: only a non-null POSITIVE limit overwrites it.
    return limit;
  }
  // An explicit 0 - or a negative - is falsy but NOT null, so it fails the second
  // conjunct and the sentinel stands. That is the trap, reproduced.
  return sentinel;
}

/**
 * One `orderItemsUsage` entry.
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L299]: discountAmount / discountQuantity has
 * no zero check on the divisor. Same at L486.
 * Preserved deliberately; do not fix without a product decision.
 *
 * ⭐ The fixture SUPPLIES the zero divisor and deliberately does NOT perform the
 * division itself. `Money.dividedBy` refuses a zero divisor outright and lets the
 * refusal propagate - by design, because returning zero would silently invent
 * money. Whether the CALL SITE at L299 wants a guard is a decision owned by
 * `src/services/promotion/rewardUsageLedger.ts`, not by a fixture, so a
 * `discountQuantity` of 0 yields `Money.zero` here and leaves the engine to meet
 * the unguarded division on its own terms.
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
 * LEGACY-DEFECT [model/entity/OrderItem.cfc:L200-L206]: getExtendedPrice() wraps quantity in
 * val() (null coerces to 0) but getExtendedSkuPrice() does not, so a null quantity yields 0
 * from one accessor and fails in the other.
 * Preserved deliberately; do not fix without a product decision.
 *
 * ⭐ SOURCE-WINS CORRECTION (c) and (d). The folder requirements treat both
 * extended amounts as persistent columns of equal standing. They are neither:
 * both are NON-PERSISTENT CALCULATED properties, `extendedSkuPrice` does not
 * appear in the property block at all, and the two derivations DIFFER -
 * `precisionEvaluate('getPrice() * val(getQuantity())')` at
 * [model/entity/OrderItem.cfc:L200-L202] against
 * `precisionEvaluate('getSkuPrice() * getQuantity()')` at
 * [model/entity/OrderItem.cfc:L204-L206]. The asymmetry is reproduced here as two
 * separate functions rather than one shared multiply, so it cannot be lost to a
 * later tidy-up.
 *
 * The view carries both as PRE-COMPUTED values, which is correct for an
 * anti-corruption view: neither the view nor the engine recomputes them, exactly
 * as neither recomputes a column.
 */
function computeExtendedPrice(price: Money, quantity: number): Money {
  // The `val()` coercion: a non-numeric quantity becomes 0 rather than propagating.
  return price.times(Number.isFinite(quantity) ? quantity : 0);
}

/** `getExtendedSkuPrice()` - deliberately WITHOUT the `val()` coercion. */
function computeExtendedSkuPrice(skuPrice: Money, quantity: number): Money {
  return skuPrice.times(quantity);
}

/**
 * One order item view.
 *
 * LEGACY ORDERING CONSTRAINT [model/service/PromotionService.cfc:L241-L254 reads state written
 * by model/service/PriceGroupService.cfc:L371]: the price-group pass MUST run before the
 * promotion pass. The legacy code leaves this implicit - it holds only because OrderService
 * happens to call them in that sequence [model/service/OrderService.cfc:L60-L61]. This fixture
 * deliberately mixes eligible and ineligible items so the dependency is provable.
 *
 * ⭐ THE POLARITY, VERIFIED IN THE SOURCE AND NOT ASSUMED. The folder
 * requirements state it BACKWARDS. Read at [model/service/PromotionService.cfc:L241]:
 *
 *   if( isNull(orderItem.getAppliedPriceGroup())
 *       || reward.hasEligiblePriceGroup( orderItem.getAppliedPriceGroup() ) ) {
 *       -> getDiscountAmount(reward, orderItem.getPrice(), discountQuantity)   [L244]
 *   } else {
 *       -> originalDiscountAmount = getDiscountAmount(reward, orderItem.getSkuPrice(), ...) [L249]
 *       -> discountAmount = originalDiscountAmount
 *                           - (getExtendedSkuPrice() - getExtendedPrice())     [L252]
 *   }
 *
 * So `getPrice()` is the arm taken when there is NO applied price group OR the
 * reward ACCEPTS the one there is; the `getSkuPrice()`-plus-correction arm
 * requires a PRESENT group the reward REJECTS. That is a three-state
 * discriminator over two disjuncts, not the two-state one the requirements
 * describe, which is why the golden order carries THREE items rather than two:
 * absent, present-and-accepted, present-and-rejected.
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
}): OrderItemView {
  return Object.freeze({
    orderItemID: spec.orderItemID,
    sku: spec.sku,
    quantity: spec.quantity,
    price: spec.price,
    skuPrice: spec.skuPrice,
    extendedPrice: spec.extendedPrice,
    extendedSkuPrice: spec.extendedSkuPrice,
    // ⭐ SOURCE-WINS CORRECTION (i): written EXPLICITLY as `undefined`, never omitted.
    // `orderItemView.ts` declares this a REQUIRED member whose type includes
    // `undefined`, so that "no applied price group" is one unambiguous state.
    appliedPriceGroup: spec.appliedPriceGroup,
    orderItemType: buildOrderItemType(spec.orderItemTypeSystemCode),
    orderFulfillmentID: spec.orderFulfillmentID,
  });
}

/**
 * Which arm the item selects, evaluated with the legacy null semantics.
 *
 * Published on the capture sink so a suite can pin the POLARITY as data rather
 * than re-deriving it from the source every time. `isNullish` supplies the
 * `isNull()` semantics of the first disjunct; `hasEligiblePriceGroup` is the
 * entity's own predicate and is called, not reimplemented.
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

  // [L241] The first disjunct OR the second selects `getPrice()`; only when BOTH
  // fail does the `getSkuPrice()`-plus-correction arm run.
  const takesPriceArm = appliedPriceGroupIsNull || rewardAcceptsAppliedPriceGroup;

  return Object.freeze({
    orderItemID: item.orderItemID,
    appliedPriceGroupIsNull,
    rewardAcceptsAppliedPriceGroup,
    selectedArm: takesPriceArm ? 'price' : 'skuPriceWithCorrection',
    // [L252] `- (getExtendedSkuPrice() - getExtendedPrice())`; zero where unused.
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
 * ⭐ A SECOND, SHARPER PROBLEM AT THE SAME LINE, and the reason the pickup
 * fulfillment exists. L703 also dereferences `orderFulfillment.getAddress()`
 * UNGUARDED, in pointed contrast with [model/service/PromotionService.cfc:L358-L360],
 * which guards the identical call with `!isNull(getAddress()) && !getAddress().isNew()`.
 * The legacy accessor could never return null - its third branch CONSTRUCTS an
 * Address - so the unguarded form was safe by accident. A read-only view that
 * pre-resolves the address to `undefined` removes that accident, which makes the
 * pickup fulfillment the only place the difference between the two call sites is
 * observable.
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
    // ⭐ SOURCE-WINS CORRECTION (i): explicit `undefined`, never an omitted key.
    shippingMethod: spec.shippingMethod,
    appliedPromotions: Object.freeze(copyOf(spec.appliedPromotions)),
    // ⭐ SOURCE-WINS CORRECTION (h): WEIGHT, so a plain number and never `Money`.
    totalShippingWeight: spec.totalShippingWeight,
    address: spec.address,
  });
}

/**
 * Inserts one candidate into the DESCENDING accumulator, by the legacy algorithm.
 *
 * LEGACY BEHAVIOUR [model/service/PromotionService.cfc:L523-L537]: only index [1] - the single
 * largest discount after the descending insert-sort at L266-L294 - is ever applied per order
 * item. Every other qualified discount is discarded.
 *
 * The ordering is produced by an actual insert-sort rather than by writing an
 * already-ordered literal, so what a suite observes is the algorithm's output and
 * not the fixture author's arithmetic. The legacy loop walks from the front and
 * splices ahead of the first strictly-smaller entry, which is reproduced exactly -
 * including that a TIE lands AFTER the incumbent, so the first-inserted of two
 * equal discounts wins index [1].
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
 * CFML parity [model/service/PromotionService.cfc:L82-L133]: the legacy accumulator key is
 * spelled `orderItemQulifiedDiscounts` (sic). The target symbol is renamed; the original
 * spelling is recorded here so the two surfaces can be diffed.
 *
 * `discountAmount` is the ONE mutable member, because
 * [model/service/PromotionService.cfc:L486] rewrites it in place on a partial
 * strip. The other two are readonly, as the owner declares them.
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
 * The FRESH, MUTABLE qualified-discount accumulator.
 *
 * Not frozen, and deliberately so: the engine splices entries out of these arrays
 * at [model/service/PromotionService.cfc:L502] and rewrites `discountAmount` at
 * [model/service/PromotionService.cfc:L486]. A frozen accumulator would make the
 * over-use correction untestable, which is the opposite of this fixture's purpose.
 *
 * ⭐ SOURCE-WINS CORRECTION (f): THE GUARD ASYMMETRY. The inner searches at
 * [model/service/PromotionService.cfc:L482] and [model/service/PromotionService.cfc:L498]
 * index this record by order item ID with NO `structKeyExists` test, while the
 * application loop at [model/service/PromotionService.cfc:L529] DOES guard with
 * `structKeyExists` and `arrayLen`. On the normal path the key is created alongside
 * the usage entry, so the unguarded form is safe by construction - but it is safe
 * only because of an invariant the author evidently did not trust at the other site.
 * This is stated as an unguarded index whose safety rests on that invariant, NOT as
 * a certain crash. The seeding below can be pointed at an item that has no usage
 * entry, so a suite can probe the difference deliberately.
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

  // [L145-L162] The sale-price seeding pass runs BEFORE the main reward loop and
  // creates the accumulator array at [L152] with an EMPTY reward identifier at
  // [L156] - a sale price is not attributable to a promotion reward, so the key
  // carries no reward. Reproduced verbatim: the empty string is data, not a gap.
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
 * CFML parity [model/service/PromotionService.cfc:L752-L757]:
 * `getPromotionPeriodQualifiedFulfillmentIDList` starts from `""` and `listAppend`s,
 * so an order with no fulfillments yields the EMPTY STRING and never an absent
 * value. Built with the `src/lib/cfml/list.ts` helpers rather than
 * `Array.prototype.join`, so the empty-list convention and the `listFindNoCase`
 * de-duplication are applied deliberately instead of by accident. Note that
 * `listFindNoCase` returns a ONE-BASED position, so `0` - not `-1` - means absent.
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
 * The dead key is populated whenever the owner declares it, so the field survives
 * as documented dead weight rather than being quietly dropped - and a suite can
 * assert that nothing reads it. Note the legacy member spelling `qualificationsMeet`
 * (not "Met"), carried over verbatim for interface parity.
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
    // The dead key, written with the same value the live one carries - which is
    // what [L621-L623] does, from `explicitlyQualifiedFulfillmentIDs`.
    qualifiedFulfillments: copyOf(qualifiedFulfillmentIDs),
  };
}

/**
 * Applies one positional item bag over one item's documented defaults.
 *
 * `??` is used for every member whose view type EXCLUDES `undefined`, because for
 * those an explicit `undefined` from the caller cannot be honoured and the
 * documented default is the only correct answer. `hasItemOverride` is used for the
 * single member whose view type INCLUDES `undefined` - `appliedPriceGroup` - where
 * "omit the key" and "write the key as undefined" must stay distinguishable,
 * because the second is how a caller forces the price-group-ineligible state.
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

  // Consistent by default: the two calculated amounts agree with `price x quantity`,
  // which is the ONLY state [model/entity/OrderItem.cfc:L200-L206] can produce.
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
  });
}

/**
 * Applies one positional fulfillment bag over one fulfillment's defaults.
 *
 * Two members need the presence test rather than `??`: `shippingMethod`, whose
 * NULL state reaches LEGACY-DEFECT 11, and `address`, whose absent state is the
 * only way the unguarded dereference at [model/service/PromotionService.cfc:L703]
 * becomes observable at all.
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

  // `addressIsNew` re-resolves the address rather than mutating it, because
  // `Address.isNew()` is an ORM lifecycle call with no read-only-view equivalent
  // and the view carries it as a plain flag.
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

// ---------------------------------------------------------------------------
// THE SINGLE EXPORT
// ---------------------------------------------------------------------------

/**
 * Builds the golden multi-item, multi-reward read-only `OrderView`.
 *
 * EVERY CALL RETURNS A COMPLETELY FRESH OBJECT GRAPH - fresh order, fresh item
 * array, fresh fulfillment array, fresh usage ledger, fresh accumulator, fresh
 * qualification map, fresh `Money` instances, fresh collaborator double. Two calls
 * share nothing that either can mutate, so a suite can prove that a second,
 * independent invocation does not observe the first invocation's mutations. That
 * property is not decoration: the engine increments `usedInOrder` in place at
 * [model/service/PromotionService.cfc:L297] and splices arrays at
 * [model/service/PromotionService.cfc:L502], and on a warm Lambda container shared
 * state would carry one request's discounts into the next.
 *
 * ⭐ THE ONE DELIBERATE EXCEPTION TO THE FRESH-GRAPH RULE, and the trade-off it
 * buys. `reward.hasEligiblePriceGroup(priceGroup)` can only resolve when the
 * `PriceGroup` INSTANCE the reward holds IS the instance an order item's
 * `appliedPriceGroup` references. Identity is therefore SHARED between the reward
 * and the item - there is no way to exercise the L241 discriminator without it.
 * What is still fresh per call is the price group itself (a new instance every
 * call, because the price-group graph is rebuilt) and every ARRAY that contains
 * it, so the sharing is confined to a single call's graph and never spans calls.
 *
 * @param overrides the single variation channel; see the interface above.
 * @returns a frozen `OrderView` whose engine-side scaffolding is written into
 *   `overrides.capture` when a sink was supplied.
 */
export function makeOrderViewFixture(overrides?: OrderViewFixtureOverrides): OrderView {
  const idPrefix = overrides?.idPrefix ?? '';

  // An explicit UTC instant, never the wall clock. `new Date(literal)` is a fresh
  // object each call, so no two graphs share a mutable date.
  const now = overrides?.now ?? new Date(FIXED_NOW_ISO);

  // --- Opaque identifiers ---------------------------------------------------
  const orderID = overrides?.orderID ?? `${idPrefix}${GOLDEN_ORDER_ID}`;
  const accountID = resolveOverride(overrides, 'accountID', `${idPrefix}${GOLDEN_ACCOUNT_ID}`);
  const itemIDNoPriceGroup = `${idPrefix}${ITEM_ID_NO_PRICE_GROUP}`;
  const itemIDPriceGroupAccepted = `${idPrefix}${ITEM_ID_PRICE_GROUP_ACCEPTED}`;
  const itemIDPriceGroupRejected = `${idPrefix}${ITEM_ID_PRICE_GROUP_REJECTED}`;
  const fulfillmentIDShipping = `${idPrefix}${FULFILLMENT_ID_SHIPPING}`;
  const fulfillmentIDPickup = `${idPrefix}${FULFILLMENT_ID_PICKUP}`;

  // --- Price groups, and the shared identity the discriminator needs --------
  const priceGroupGraph = makePriceGroupFixtures({ idPrefix: `${idPrefix}pg-` });
  const acceptedPriceGroup: PriceGroup = priceGroupGraph.childPriceGroup;
  const rejectedPriceGroup: PriceGroup = priceGroupGraph.siblingPriceGroup;

  const eligiblePriceGroups: readonly PriceGroup[] = overrides?.eligiblePriceGroups ?? [
    acceptedPriceGroup,
  ];

  // --- The promotion graph -------------------------------------------------
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

  // --- SKUs, one per item, each with its own product -----------------------
  const skuNoPriceGroup: Sku = makeSkuFixture({
    idPrefix: `${idPrefix}sku-a-`,
    price: Money.fromDecimalString(ITEM_1_PRICE),
    product: makeProductFixture({ idPrefix: `${idPrefix}prod-a-` }),
  });
  const skuPriceGroupAccepted: Sku = makeSkuFixture({
    idPrefix: `${idPrefix}sku-b-`,
    price: Money.fromDecimalString(ITEM_2_SKU_PRICE),
    product: makeProductFixture({ idPrefix: `${idPrefix}prod-b-` }),
  });
  const skuPriceGroupRejected: Sku = makeSkuFixture({
    idPrefix: `${idPrefix}sku-c-`,
    price: Money.fromDecimalString(ITEM_3_SKU_PRICE),
    product: makeProductFixture({ idPrefix: `${idPrefix}prod-c-` }),
  });

  // --- The three items, one per arm of the L241 discriminator --------------
  //
  // `'mixed'` is the default because it is the ONLY arrangement under which all
  // three states are reachable from a single order: no applied group at all, a
  // group the reward accepts, and a group the reward rejects. The other three
  // values collapse the order onto one arm, which is useful for a narrow suite
  // and useless for proving the ordering dependency.
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
        // No price group was applied, so nothing lowered the price and
        // `skuPrice` equals `price`. The correction term is consequently zero -
        // which is exactly why this item alone could not prove the dependency.
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

  // --- The two fulfillments ------------------------------------------------
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

  // The PICKUP fulfillment: no shipping method and no address. It is the only
  // fulfillment that reaches the unguarded `getAddress()` dereference at
  // [model/service/PromotionService.cfc:L703] and the guarded one at
  // [model/service/PromotionService.cfc:L358-L360], so it is what makes the
  // difference between those two call sites observable.
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

// ---------------------------------------------------------------------------
// The second half of the factory
//
// Split out purely so neither half is unreadably long, and declared AFTER the
// export because the export is what a reader opens this file for. It is a plain
// module-scope function, not a second export, and it holds no state: everything
// it needs arrives in `context` and everything it produces is returned or written
// into the caller's sink.
// ---------------------------------------------------------------------------

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

  // --- Rewards, IN THE CALLER'S ORDER --------------------------------------
  //
  // LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L51-L132]: getActivePromotionRewards applies no
  // ORDER BY, so reward iteration order - which the mutable usage ledger at
  // model/service/PromotionService.cfc:L297 makes outcome-affecting - is non-deterministic.
  // Preserved deliberately; do not fix without a product decision.
  //
  // The absence was proven programmatically during planning, not assumed. The
  // consequence for a fixture is a prohibition: this array is handed back exactly
  // as assembled and is NEVER sorted, re-ordered or normalised, and no default
  // here is correct only because of an incidental ordering. A suite selects an
  // ordering BY NAME and then asserts behaviour given that ordering.
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

  // The non-qualifying-last-reward variant. A SECOND promotion graph is built under
  // a distinct `idPrefix` so its period identifier genuinely differs, and its
  // order-level reward replaces the last element - which is the only way to make
  // the LAST reward belong to a non-qualifying period without reaching inside an
  // entity the sibling fixture owns. Built lazily, because it is not cheap and the
  // default never needs it.
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

  // --- The usage ledger, and the layout LEGACY-DEFECT 9 depends on ---------
  //
  // LEGACY-DEFECT [model/service/PromotionService.cfc:L468-L521]: the over-use stripping loop
  // cross-wires its indices. Detection (L471) and the inner discount match (L483/L499) correctly
  // use `prID`, but the amount to remove (L472) and the order-item list walked (L475-L477) come
  // from the `reward` variable LEAKED from the loop closed at L465 - i.e. the LAST reward
  // processed. When the leaked reward and `prID` touched different order items the inner match
  // finds nothing and the over-use is never corrected. Repairing this changes the money charged.
  // Preserved deliberately; do not fix without a product decision.
  //
  // ⭐ SOURCE-WINS CORRECTION (e). The AAP describes this as a simple wrong-key
  // lookup; it is a CROSS-WIRING, and the difference decides what a test can see.
  // Detection is CORRECT, so the loop always notices the over-use. What is wrong is
  // the SUBTRAHEND and the ITEM LIST. So the layout below is load-bearing:
  //
  //   - `overusedRewardID` is the FIRST reward, over its own `maximumUsePerOrder`,
  //     with usage entries on items 1 and 2.
  //   - `leakedRewardID` is the LAST reward - the one the closed loop leaves behind -
  //     with its usage entry on item 3 by default.
  //
  // Walking the leaked reward's item list (item 3) hunting for the over-used
  // reward's discount entries (which live under item 1) finds NOTHING, so the
  // over-use is SILENTLY NEVER CORRECTED. Pass `usageLedgerLayout: 'sameOrderItems'`
  // for the contrast case, where the search does find an entry and strips a WRONG
  // AMOUNT instead. With one reward, or with two rewards on the same items, the
  // defect is completely invisible - which is why two rewards on different items is
  // the default rather than an option.
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

  // The over-used entry gets a small, genuinely exceedable per-order limit. EVERY
  // OTHER entry gets a NULL limit, which is what routes it down the 1000000
  // sentinel path - so a single order exercises the real limit and the sentinel at
  // the same time, and a caller passing an explicit 0 exercises the falsy-but-not-null
  // trap without any further setup.
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

      // [L172] The legacy seeding is wrapped in `structKeyExists`, so it is
      // IDEMPOTENT and first-reward-wins: a reward appearing twice in the array
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

  // --- The qualified-discount accumulator ----------------------------------
  const orderItemQualifiedDiscounts = buildOrderItemQualifiedDiscounts({
    bestDiscountOrderItemID: context.itemIDNoPriceGroup,
    discountAmounts: overrides?.qualifiedDiscountAmounts ?? GOLDEN_QUALIFIED_DISCOUNT_AMOUNTS,
    promotion: promotionGraph.promotion,
    // Keyed to the OVER-USED reward, so the inner match at [L483]/[L499] has
    // something to find when the cross-wired item list happens to point at it.
    promotionRewardID: overusedRewardID,
    salePriceSeedOrderItemID: context.itemIDPriceGroupAccepted,
    salePriceSeedAmount: SALE_PRICE_SEED_AMOUNT,
  });

  // --- Period qualifications ----------------------------------------------
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

  // Registered unconditionally so the EMPTY-reward variant still hands a suite a
  // qualification map to inspect rather than an empty record it cannot distinguish
  // from a bug.
  registerPeriodQualification(promotionGraph.promotionPeriod, true);

  // --- Order-level scalars -------------------------------------------------
  //
  // LEGACY-DEFECT [model/service/PromotionService.cfc:L417]: the order-level subtotal is combined
  // with a plain `+` rather than precisionEvaluate, unlike the ten other money sites in this file.
  // Preserved deliberately; do not fix without a product decision.
  //
  // Both operands are supplied here as separate `Money` values and are deliberately
  // NOT pre-summed, so whatever the engine does with them at L417 is the engine's
  // observable behaviour and not an arithmetic the fixture performed on its behalf.
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

  // The comma list, built from `''` with `listAppend` so the CFML empty-list
  // convention holds: no promotion codes yields `''`, never `undefined`.
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
    // ⭐ SOURCE-WINS CORRECTION (i): explicit `undefined` for guest checkout.
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
 * JUDGMENT CALL - WHY A SINK AT ALL. The mandated return type is `OrderView`, and
 * one exported unit per file forbids a second export, so there is nowhere else to
 * put the engine-side scaffolding a promotion suite needs: the reward array in the
 * caller's order, the mutable usage ledger, the qualified-discount accumulator, the
 * period qualifications, the comma-delimited fulfillment list and the collaborator
 * double. Widening the return type would contradict the interface the views
 * declare; exporting a second symbol would contradict the one-unit rule; and
 * rebuilding all of it inside every suite would duplicate the very invariants this
 * fixture exists to hold in one place. A caller-owned sink satisfies all three
 * constraints: the caller creates it, this function writes each member exactly
 * once, and NO reference is retained - so two calls with two sinks share nothing,
 * and a caller that passes no sink pays nothing.
 *
 * Returns early when no sink was supplied, so the plain `OrderView` case does no
 * extra work.
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
  // `listLen('')` is 0, not 1 - the CFML empty-list convention, asserted rather
  // than assumed, because a naive `split(',')` would report 1.
  capture.qualifiedFulfillmentIDCount = listLen(context.qualifiedFulfillmentIDList);
  // CFML `len()` semantics, so an empty promotion-code list reads as empty exactly
  // as `if(len(x))` reads it in the legacy source.
  capture.promotionCodeListIsEmpty = cfLen(context.promotionCodeList) === 0;

  const addressZoneDouble = buildAddressZoneEvaluatorDouble(
    context.overrides?.addressIsInZone ?? false,
  );
  capture.addressZoneEvaluator = addressZoneDouble.evaluator;
  capture.addressZoneEvaluatorCalls = addressZoneDouble.calls;
  capture.addressZone = buildAddressZone();

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
  // [model/service/PromotionService.cfc:L448] and
  // [model/service/PromotionService.cfc:L402] write, and NO fourth. Taken from the
  // union `src/domain/entities/promotionApplied.ts` declares rather than invented.
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

  // --- The two order-type gates, and the preserved no-op between them ------
  //
  // LEGACY-DEFECT [model/service/PromotionService.cfc:L541-L544]: the return/exchange branch
  // contains a live `// TODO [issue #1766]` and does nothing at all.
  // Preserved deliberately; do not fix without a product decision.
  //
  // ⭐ SOURCE-WINS CORRECTION (a), as evaluated data. `otExchangeOrder` is a member
  // of BOTH lists, so an exchange order runs the whole discount body AND THEN
  // enters the no-op; the second gate is not the negation of the first. Both are
  // evaluated with `listFindNoCase`, which returns a ONE-BASED position, so `> 0`
  // is the membership test and `0` means absent.
  capture.reachesDiscountBody =
    listFindNoCase(SALE_OR_EXCHANGE_ORDER_TYPES, context.orderTypeSystemCode) > 0;
  capture.reachesReturnExchangeNoOp =
    listFindNoCase(RETURN_OR_EXCHANGE_ORDER_TYPES, context.orderTypeSystemCode) > 0;
  capture.preservedReturnExchangeNoOpTicket =
    context.promotionGraph.preservedReturnExchangeNoOpTicket;

  capture.nonSaleOrderItemTypeSystemCode = RETURN_ORDER_ITEM_SYSTEM_CODE;
  capture.referenceCalculation = context.promotionGraph.referenceCalculation;
  capture.now = context.now;
}
