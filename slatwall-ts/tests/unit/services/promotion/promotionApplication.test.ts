// slatwall-ts - Characterization suite for `src/services/promotion/promotionApplication.ts`.
//
// SUBJECT: the ported final best-discount application loop,
// [model/service/PromotionService.cfc:L523-L537] - the terminal step of the promotion engine's
// sales branch. It reads the qualified-discount accumulator the earlier passes built, takes the
// FIRST record on each order item's list, and emits one applied-promotion intent per order item
// that has one. It sorts nothing, computes nothing, removes nothing and writes nothing.
//
// This suite owns NO numbered defect-register entry. What it owns is the single-winner rule, and
// that rule is a MONEY OUTCOME rather than a detail of housekeeping: must-preserve area (i) is
// promotion discount math together with use-limit enforcement, and this module decides WHICH ONE
// discount out of many actually reaches the customer. Emitting the wrong record, emitting more
// than one, or filtering out a legitimate winner each change the amount charged.
//
// ★ LOCATOR CORRECTION, RECORDED BECAUSE THE SOURCE IS AUTHORITATIVE.
// LEGACY-NOTE [model/service/PromotionService.cfc:L523-L537]: the range issued for this module is
// "L523-L536" and it is ONE LINE SHORT. Verified line by line against the component:
//
//   L523  // Loop over the orderItems one last time, and look for the top 1 discounts ...  (comment)
//   L524  for(var i=1; i<=arrayLen(arguments.order.getOrderItems()); i++) {               (loop OPENS)
//   L526  var orderItem = arguments.order.getOrderItems()[i];                             (element)
//   L529  if(structKeyExists(...) && arrayLen(...))                                       (DOUBLE guard)
//   L530  var newAppliedPromotion = this.newPromotionApplied();
//   L531  newAppliedPromotion.setAppliedType('orderItem');
//   L532  newAppliedPromotion.setPromotion( ...[1].promotion );
//   L533  newAppliedPromotion.setOrderItem( orderItem );
//   L534  newAppliedPromotion.setDiscountAmount( ...[1].discountAmount );
//   L535  }                                                                              (closes the if)
//   L536  <FOUR TAB CHARACTERS, WHITESPACE-ONLY - BLANK>
//   L537  }                                                                              (loop CLOSES)
//
// So the true range is L523-L537, and the "L523-L536" citation would leave a reviewer diffing an
// UNBALANCED BRACE and concluding the port had dropped a statement. The shipped module's own
// docblock already carries this correction; this suite corroborates it rather than contradicting
// it, and the superseded citation is named here so the discrepancy is visibly settled.
//
// NET-NEW COVERAGE - NOT PARITY WITH ANY LEGACY TEST. There is no legacy antecedent for this
// suite and none is implied. `meta/tests/unit/service/` holds only `AccountServiceTest.cfc`,
// `HibachiServiceTest.cfc`, `PaymentServiceTest.cfc` and `UtilityRBServiceTest.cfc`; a
// case-insensitive search of `meta/tests/` for "promotion" returns ZERO files. The only two
// legacy-extended suites in the whole project are `tests/unit/domain/entities/brand.test.ts` and
// `tests/unit/domain/entities/product.test.ts`, which carry forward `defaults_are_correct()` and
// `productUrlIsCorrectlyFormatted()` respectively. Nothing here is presented as carried forward.
//
// PARAMETERIZED SQL - NOT APPLICABLE, AND HERE IS WHY. The subject is a pure in-memory pass over
// a read-only view and a plain record of arrays: it opens no connection, issues no statement and
// binds no placeholder, and the module it tests imports no driver. Every SQL-shape and
// placeholder-binding assertion in this project therefore lives in
// `tests/integration/repositories/`, the one tier that owns a statement's text and its bound
// values. Asserting SQL here would assert it in a place that cannot observe it.
//
// ★ THIS MODULE PERFORMS NO ARITHMETIC AT ALL. It copies a `discountAmount` off the winning
// record onto an intent. Every money assertion below therefore checks PASS-THROUGH rather than
// computation: no rounding, no quantization, no clamping, no re-formatting, no `toFixed2` in the
// emitted value. The arithmetic that produced the amount belongs to `./discountAmount.test.ts`,
// and the partial-strip rewrite that can shrink it belongs to `./overUseStripping.test.ts`.
//
// LEGACY-NOTE [model/entity/PromotionApplied.cfc:L53]: `discountAmount ormtype="big_decimal"` is
// declared with NO `default="0"` - one of exactly FOUR no-default money columns in the slice, with
// `SkuCurrency.price` [model/entity/SkuCurrency.cfc:L53], `PriceGroupRate.amount`
// [model/entity/PriceGroupRate.cfc:L54] and `PromotionReward.amount`
// [model/entity/PromotionReward.cfc:L61]. ABSENCE IS NOT ZERO. No assertion below substitutes
// `Money.zero` for an absent amount, and no `??` or `||` fallback appears anywhere in this file:
// an order item with no surviving discount must stay observably WITHOUT an intent, never acquire
// one worth nothing.
//
// C4 - INTERFACE PARITY DOES NOT BIND THIS NAME. None of the frozen legacy method names appears
// here. The ported block is INLINE CODE inside a 489-line CFML function and has no legacy method
// signature of its own, so `applyBestOrderItemDiscounts` is a target-only name that displaces no
// legacy identifier. This suite uses the SHIPPED name exactly as exported and never renames,
// re-exports, wraps or shims it.
//
// JUDGMENT CALL: the intent-returning shape is NOT a new liberty taken by this module. The legacy
// method returns `void` and mutates the Order aggregate in place; the target consumes a read-only
// view and returns instructions. That inversion is signature reshaping #1 of exactly three
// project-wide - the other two being the smart-list renames (`findProducts`, `findSkus`) and the
// feed adapter's `generateProductFeed` - and it is ALREADY SPENT. It is required because
// `model/service/OrderService.cfc` and every order entity are out of scope, so the aggregate can
// only ever be an INPUT here. This suite consumes that budgeted reshaping and introduces no
// fourth: it asserts the shipped signature and adapts to it in every particular.
//
// ★ ONE ADAPTATION TO THE SHIPPED SURFACE, RECORDED RATHER THAN WORKED AROUND.
// LEGACY-NOTE [model/entity/PromotionApplied.cfc:L55]: `currencyCode ormtype="string" length="3"`
// is a real persisted column, and `setCurrencyCode` has ZERO occurrences in the whole of
// `model/service/PromotionService.cfc` (verified by census, as does a case-insensitive search for
// `currencyCode` itself), so every row the engine writes leaves it null. The shipped
// `PromotionAppliedIntent` therefore declares `currencyCode` NOWHERE, at any level or any
// operation, rather than declaring it optional. Absence is asserted below at runtime by
// key-presence; the type makes a populated currency unrepresentable rather than merely
// discouraged. This suite does not redeclare, widen or reintroduce that member.
//
// ---------------------------------------------------------------------------
// WHAT IS DELIBERATELY NOT TESTED HERE, AND WHERE IT LIVES INSTEAD
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L266-L294]: the DESCENDING insertion sort that
// puts the best discount at the head of each list is the facade's, not this module's - strict `<`
// at L271, `arrayInsertAt` at L274-L278, `break` at L281, `arrayAppend` at L285-L294. It is
// deliberately NOT re-tested here; `../promotionService.test.ts` owns it. What IS tested here is
// the complement: that this module RESPECTS whatever order it is handed and imposes none.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L502]: the `arrayDeleteAt` that can empty a
// list while leaving its key in place belongs to `./overUseStripping.test.ts`. This suite tests
// only the STATE that removal produces, because that state is what the L529 guard defends
// against.
//
// C3 - the `TODO [issue #1766]` no-op at [model/service/PromotionService.cfc:L542-L544] belongs to
// `../promotionService.test.ts` and is not restated here.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it } from 'vitest';

import { Money } from '../../../../src/domain/valueObjects/money.js';
import { applyBestOrderItemDiscounts } from '../../../../src/services/promotion/promotionApplication.js';
import { makeOrderViewFixture } from '../../../fixtures/orderViewFixtures.js';

import type { Promotion } from '../../../../src/domain/entities/promotion.js';
import type {
  OrderItemQualifiedDiscounts,
  PromotionAppliedIntent,
  QualifiedDiscount,
} from '../../../../src/domain/promotionEngine/qualifiedDiscountTypes.js';
import type { OrderItemView } from '../../../../src/domain/views/orderItemView.js';
import type { OrderView } from '../../../../src/domain/views/orderView.js';

// ---------------------------------------------------------------------------
// LOCAL SCAFFOLDING
//
// The fixture's overrides and capture interfaces are deliberately NOT exported by
// `tests/fixtures/orderViewFixtures.ts`, so the sink type is DERIVED STRUCTURALLY from the
// exported factory's own parameter rather than redeclared. Deriving it keeps this suite honest: if
// the fixture's capture surface ever changes, this file stops compiling instead of quietly
// asserting against a stale hand-written copy.
// ---------------------------------------------------------------------------

type OrderViewFixtureCaptureSink = NonNullable<
  NonNullable<Parameters<typeof makeOrderViewFixture>[0]>['capture']
>;

/**
 * One qualified-discount record, built inline.
 *
 * Inline construction inside the consuming suite is the intended arrangement here, and no shared
 * helper module is introduced for it: several tests below must control the EXACT ordering of the
 * array they hand the subject, which is the whole point of proving that the subject imposes no
 * ordering of its own. A shared builder would hide the one variable those tests manipulate.
 *
 * The three members are exactly the three the published `QualifiedDiscount` declares - the same
 * three both legacy construction sites build, at [model/service/PromotionService.cfc:L274-L278]
 * and L288-L292. Nothing is added and the type is not redeclared.
 */
function qualifiedDiscount(
  promotionRewardID: string,
  promotion: Promotion,
  decimalAmount: string,
): QualifiedDiscount {
  return {
    promotionRewardID,
    promotion,
    discountAmount: Money.fromDecimalString(decimalAmount),
  };
}

/**
 * A compact, exhaustive digest of every emitted intent, in emission order.
 *
 * Used wherever a test must assert the WHOLE result rather than a sampled member, so a stray extra
 * intent - the precise failure the single-winner rule exists to prevent - fails the assertion
 * instead of slipping past it.
 */
function digestIntents(
  intents: readonly PromotionAppliedIntent[],
): readonly Record<string, string>[] {
  return intents.map((intent) => {
    const digest: Record<string, string> = {
      appliedType: intent.appliedType,
      operation: intent.operation,
    };

    // `promotionID` used to be read unconditionally here, on the reading that every intent carries
    // one. It is a `string` on add, on update and on a provisional cancellation, but NULLABLE on a
    // persisted-row removal alone - the FK it mirrors declares no `notnull`
    // [model/entity/PromotionApplied.cfc:L58] and the legacy produces promotion-less rows itself
    // [:L85-L94]. Recorded when present, so such a row digests as a row with no promotion rather
    // than being defaulted into looking like one that has a promotion.
    const promotionID = intent.promotionID;
    if (promotionID !== undefined) {
      digest.promotionID = promotionID;
    }

    // The ROW's own identity, present only on a persisted-row removal. Recorded so that a
    // whole-result assertion observes WHICH ROW an intent named - the distinction that
    // `(appliedType, target ID, promotionID)` could not draw when two rows share a promotion.
    const promotionAppliedID = intent.promotionAppliedID;
    if (promotionAppliedID !== undefined) {
      digest.promotionAppliedID = promotionAppliedID;
    }

    // Narrowed on the discriminant rather than asserted: `discountAmount` is declared `?: never`
    // on the remove arm, so it is genuinely absent there and reading it unconditionally would be
    // asserting a member the type forbids.
    if (intent.operation !== 'remove') {
      digest.discountAmount = intent.discountAmount.toDecimalString();
    }

    // The three target identifiers are each present on exactly one level and typed `?: never` on
    // the other two, so presence is read rather than assumed.
    const orderItemID = intent.orderItemID;
    if (orderItemID !== undefined) {
      digest.orderItemID = orderItemID;
    }
    const orderID = intent.orderID;
    if (orderID !== undefined) {
      digest.orderID = orderID;
    }
    const orderFulfillmentID = intent.orderFulfillmentID;
    if (orderFulfillmentID !== undefined) {
      digest.orderFulfillmentID = orderFulfillmentID;
    }

    return digest;
  });
}

/** One order item's observable state, projected onto primitives. */
interface OrderItemStateSnapshot {
  readonly orderItemID: string;
  readonly quantity: number;
  readonly price: string;
  readonly skuPrice: string;
  readonly extendedPrice: string;
  readonly extendedSkuPrice: string;
  readonly appliedPriceGroupID: string | undefined;
  readonly orderItemTypeSystemCode: string;
  readonly orderFulfillmentID: string;
}

/** The whole order view's observable state, projected onto primitives. */
interface OrderStateSnapshot {
  readonly orderID: string;
  readonly accountID: string | undefined;
  readonly currencyCode: string;
  readonly promotionCodeList: string;
  readonly totalSaleQuantity: number;
  readonly subtotal: string;
  readonly subtotalAfterItemDiscounts: string;
  readonly fulfillmentChargeAfterDiscountTotal: string;
  readonly orderTypeSystemCode: string;
  readonly appliedPromotionDigests: readonly string[];
  readonly orderFulfillmentIDs: readonly string[];
  readonly orderItems: readonly OrderItemStateSnapshot[];
}

/**
 * An EXPLICITLY CONSTRUCTED deep copy of everything the order view observably exposes.
 *
 * Built member by member, deliberately, rather than by a structural clone helper: the view holds
 * live `Sku` and `PriceGroup` entity instances, and a generic clone would either fail on them or
 * silently compare object identity where the interesting question is whether any VALUE moved.
 * Taking one of these before the call and one after, then comparing them, is how this suite proves
 * the negative in §11.7 - that the subject writes nothing back into its input.
 */
function snapshotOrderState(order: OrderView): OrderStateSnapshot {
  return {
    orderID: order.orderID,
    accountID: order.accountID,
    currencyCode: order.currencyCode,
    promotionCodeList: order.promotionCodeList,
    totalSaleQuantity: order.totalSaleQuantity,
    subtotal: order.subtotal.toDecimalString(),
    subtotalAfterItemDiscounts: order.subtotalAfterItemDiscounts.toDecimalString(),
    fulfillmentChargeAfterDiscountTotal:
      order.fulfillmentChargeAfterDiscountTotal.toDecimalString(),
    orderTypeSystemCode: order.orderType.systemCode,
    // Both members are NULLABLE on a persisted row [model/entity/PromotionApplied.cfc:L53, L58], so
    // absence digests as an explicit sentinel rather than as a defaulted value. A `0.00` in place of
    // a missing amount would make this immutability digest unable to tell "recorded no amount" from
    // "recorded zero", which are different rows. The row id leads, because it is what identifies one.
    appliedPromotionDigests: order.appliedPromotions.map(
      (applied) =>
        `${applied.promotionAppliedID}:${applied.promotion?.promotionID ?? '<no-promotion>'}@${applied.discountAmount?.toDecimalString() ?? '<no-amount>'}`,
    ),
    orderFulfillmentIDs: order.orderFulfillments.map(
      (fulfillment) => fulfillment.orderFulfillmentID,
    ),
    orderItems: order.orderItems.map((item) => ({
      orderItemID: item.orderItemID,
      quantity: item.quantity,
      price: item.price.toDecimalString(),
      skuPrice: item.skuPrice.toDecimalString(),
      extendedPrice: item.extendedPrice.toDecimalString(),
      extendedSkuPrice: item.extendedSkuPrice.toDecimalString(),
      appliedPriceGroupID: item.appliedPriceGroup?.getPriceGroupID(),
      orderItemTypeSystemCode: item.orderItemType.systemCode,
      orderFulfillmentID: item.orderFulfillmentID,
    })),
  };
}

/**
 * The order item at `index`, narrowed.
 *
 * `noUncheckedIndexedAccess` types every indexed read as possibly absent, and this project forbids
 * both the postfix `!` and a cast, so the absent case is turned into a thrown error rather than
 * silenced. A throw here would be a defect in the FIXTURE, never a legitimate outcome of the
 * subject, so it is deliberately not an `expect` - it must never be mistaken for a soft assertion.
 */
function orderItemAt(order: OrderView, index: number): OrderItemView {
  const item = order.orderItems[index];
  if (item === undefined) {
    throw new Error(`fixture defect: the golden order has no order item at index ${index}`);
  }
  return item;
}

/** The qualified-discount list stored under `orderItemID`, narrowed for the same reason. */
function listFor(
  accumulator: OrderItemQualifiedDiscounts,
  orderItemID: string,
): QualifiedDiscount[] {
  const records = accumulator[orderItemID];
  if (records === undefined) {
    throw new Error(`fixture defect: no qualified-discount list is keyed by '${orderItemID}'`);
  }
  return records;
}

/** The record at `index` of a qualified-discount list, narrowed for the same reason. */
function recordAt(records: readonly QualifiedDiscount[], index: number): QualifiedDiscount {
  const record = records[index];
  if (record === undefined) {
    throw new Error(`fixture defect: the qualified-discount list has no record at index ${index}`);
  }
  return record;
}

/** The single emitted intent, when a test has established that exactly one was emitted. */
function soleIntent(intents: readonly PromotionAppliedIntent[]): PromotionAppliedIntent {
  const intent = intents[0];
  if (intent === undefined) {
    throw new Error('expected exactly one applied-promotion intent, and none was emitted');
  }
  return intent;
}

describe('applyBestOrderItemDiscounts', () => {
  // A2 - REQUEST-SCOPED STATE. Every one of these is rebuilt from scratch in `beforeEach`, and this
  // file holds NO mutable state at module level. That is not tidiness: on a warm Lambda container
  // module-level state survives between unrelated requests, so a cached order or a shared
  // accumulator here could let one test's discount leak into the next exactly as it would let one
  // customer's discount leak into another customer's order.
  let capture: OrderViewFixtureCaptureSink;
  let order: OrderView;
  let accumulator: OrderItemQualifiedDiscounts;
  let promotion: Promotion;

  /** The golden item carrying THREE qualified discounts with distinct amounts. */
  let itemWithThreeDiscounts: OrderItemView;

  /** The golden item carrying exactly ONE qualified discount, seeded as a sale price. */
  let itemWithOneDiscount: OrderItemView;

  /** The golden item with NO accumulator key at all - the first L529 state, for free. */
  let itemWithNoKey: OrderItemView;

  beforeEach(() => {
    capture = {};
    order = makeOrderViewFixture({ capture });

    const capturedAccumulator = capture.orderItemQualifiedDiscounts;
    if (capturedAccumulator === undefined) {
      throw new Error(
        'fixture defect: the capture sink published no qualified-discount accumulator',
      );
    }
    accumulator = capturedAccumulator;

    itemWithThreeDiscounts = orderItemAt(order, 0);
    itemWithOneDiscount = orderItemAt(order, 1);
    itemWithNoKey = orderItemAt(order, 2);

    promotion = recordAt(listFor(accumulator, itemWithThreeDiscounts.orderItemID), 0).promotion;
  });

  // -------------------------------------------------------------------------
  // §11.5 - THE SHIPPED SURFACE, AND THE COLLABORATOR THAT IS NOT THERE
  // -------------------------------------------------------------------------
  describe('the shipped surface takes data only, and no collaborator', () => {
    // JUDGMENT CALL: [model/service/PromotionService.cfc:L530] calls `this.newPromotionApplied()`,
    // an entity factory inherited from `HibachiService`. There is no equivalent in the locked
    // THIRTEEN-port set and none was invented for it: the intent is constructed directly as a
    // plain object. A fourteenth port would model removed framework plumbing rather than retained
    // business logic, and instantiating the `PromotionApplied` entity would reintroduce the write
    // path the anti-corruption boundary exists to remove. This suite imports no port, constructs
    // no container and injects nothing.
    it('is a plain function taking exactly the two data arguments, with no third for a collaborator', () => {
      expect(typeof applyBestOrderItemDiscounts).toBe('function');

      // Arity 2: the order view and the accumulator. A repository, a factory port, an injected
      // builder or a bootstrap container would each have to arrive as a further parameter.
      expect(applyBestOrderItemDiscounts.length).toBe(2);
    });

    it('is synchronous, returning an array rather than a promise', () => {
      // Not an `AsyncFunction`: the ported block reaches no DAO, no ORM and nothing that awaits,
      // so making it async would invent an asynchronous boundary the legacy never had.
      expect(applyBestOrderItemDiscounts.constructor.name).toBe('Function');

      const result = applyBestOrderItemDiscounts(order, accumulator);

      expect(Array.isArray(result)).toBe(true);
      expect('then' in result).toBe(false);
    });

    // CFML parity [model/service/PromotionService.cfc:L530]: the legacy line is `this`-bound - it
    // reaches the framework factory through the service instance. Calling the target through a
    // detached reference, with no receiver at all, therefore proves positively that the factory
    // dependency did not survive the port in any form: no `this`, no service locator, no inherited
    // base class, nothing to be bound to.
    it('produces its full result when called detached from any receiver', () => {
      const detached = applyBestOrderItemDiscounts;

      const throughDetachedReference = detached(order, accumulator);
      const throughDirectCall = applyBestOrderItemDiscounts(order, accumulator);

      expect(digestIntents(throughDetachedReference)).toStrictEqual(
        digestIntents(throughDirectCall),
      );
      expect(throughDetachedReference).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // §11.1 - ONLY THE FIRST RECORD IS EVER READ. THE REST ARE DISCARDED.
  //
  // [model/service/PromotionService.cfc:L532] and [L534] both index `[1]`, and CFML arrays are
  // 1-based, so `[1]` is the FIRST element - index `0` here. No other index is read anywhere in
  // the block. This is the module's defining behaviour and it is a CORRECTNESS statement about
  // which discount a customer receives: every qualified discount after the first was computed,
  // ordered and possibly stripped, and is then silently discarded.
  // -------------------------------------------------------------------------
  describe('only the first qualified discount on an order item is ever applied', () => {
    it('emits exactly one intent for an item holding three distinct-amount discounts', () => {
      const records = listFor(accumulator, itemWithThreeDiscounts.orderItemID);

      // The premise, asserted rather than assumed: three records, three DISTINCT amounts.
      expect(records).toHaveLength(3);
      const first = recordAt(records, 0);
      const second = recordAt(records, 1);
      const third = recordAt(records, 2);
      expect(first.discountAmount.equals(second.discountAmount)).toBe(false);
      expect(second.discountAmount.equals(third.discountAmount)).toBe(false);
      expect(first.discountAmount.equals(third.discountAmount)).toBe(false);

      const intents = applyBestOrderItemDiscounts(order, accumulator);

      const forThatItem = intents.filter(
        (intent) => intent.orderItemID === itemWithThreeDiscounts.orderItemID,
      );
      expect(forThatItem).toHaveLength(1);

      // The emitted amount is the FIRST record's, value-equal and unmodified.
      const emitted = soleIntent(forThatItem);
      expect(emitted.operation).toBe('add');
      if (emitted.operation === 'remove') {
        throw new Error('this module emits add intents only');
      }
      expect(emitted.discountAmount.equals(first.discountAmount)).toBe(true);
    });

    it('discards the second and third records entirely, emitting nothing for them', () => {
      const records = listFor(accumulator, itemWithThreeDiscounts.orderItemID);
      const second = recordAt(records, 1);
      const third = recordAt(records, 2);

      const intents = applyBestOrderItemDiscounts(order, accumulator);

      // Exhaustive rather than sampled: the WHOLE result is compared, so a stray fourth intent -
      // or a second intent for this item - fails here instead of slipping past.
      expect(digestIntents(intents)).toStrictEqual([
        {
          appliedType: 'orderItem',
          operation: 'add',
          promotionID: promotion.getPromotionID(),
          discountAmount: recordAt(records, 0).discountAmount.toDecimalString(),
          orderItemID: itemWithThreeDiscounts.orderItemID,
        },
        {
          appliedType: 'orderItem',
          operation: 'add',
          promotionID: promotion.getPromotionID(),
          discountAmount: recordAt(
            listFor(accumulator, itemWithOneDiscount.orderItemID),
            0,
          ).discountAmount.toDecimalString(),
          orderItemID: itemWithOneDiscount.orderItemID,
        },
      ]);

      // Stated positively as well: neither discarded amount reaches the customer.
      const emittedAmounts = intents.map((intent) =>
        intent.operation === 'remove' ? '' : intent.discountAmount.toDecimalString(),
      );
      expect(emittedAmounts).not.toContain(second.discountAmount.toDecimalString());
      expect(emittedAmounts).not.toContain(third.discountAmount.toDecimalString());
    });

    it('still emits exactly one intent when the list is much longer than three', () => {
      const itemID = itemWithThreeDiscounts.orderItemID;
      const longList: OrderItemQualifiedDiscounts = {
        [itemID]: [
          qualifiedDiscount('reward-a', promotion, '40.00'),
          qualifiedDiscount('reward-b', promotion, '30.00'),
          qualifiedDiscount('reward-c', promotion, '20.00'),
          qualifiedDiscount('reward-d', promotion, '10.00'),
          qualifiedDiscount('reward-e', promotion, '5.00'),
          qualifiedDiscount('reward-f', promotion, '1.00'),
        ],
      };

      const intents = applyBestOrderItemDiscounts(order, longList);

      expect(intents).toHaveLength(1);
      const emitted = soleIntent(intents);
      if (emitted.operation === 'remove') {
        throw new Error('this module emits add intents only');
      }
      expect(emitted.discountAmount.equals(Money.fromDecimalString('40.00'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // §11.2 - THIS MODULE PERFORMS NO SORT. IT RESPECTS THE ORDER IT IS HANDED.
  //
  // LEGACY-NOTE [model/service/PromotionService.cfc:L266-L294]: the head of each list is the
  // largest discount only because the accumulator is insert-sorted DESCENDING by `discountAmount`
  // upstream - strict `<` at L271 so a tie leaves the incumbent in front, `arrayInsertAt` at
  // L274-L278, `break` at L281, and `arrayAppend` at L285-L294 when no smaller entry was found.
  // That sort belongs to `../promotionService.test.ts` and is deliberately NOT re-tested here.
  // What is tested here is the complement, and it is the only way to prove a negative about
  // sorting: hand the subject a list ordered the WRONG way and confirm it still takes position one.
  // Two tests, the same function, opposite inputs.
  // -------------------------------------------------------------------------
  describe('the given order is respected and never re-imposed', () => {
    it('emits the FIRST record even when the list is ordered ascending, so the smallest wins', () => {
      const itemID = itemWithThreeDiscounts.orderItemID;

      // Deliberately "wrong": smallest first. A module that sorted, scanned for a maximum or
      // compared at all would emit 99.00 here.
      const ascending: OrderItemQualifiedDiscounts = {
        [itemID]: [
          qualifiedDiscount('reward-smallest', promotion, '1.00'),
          qualifiedDiscount('reward-middle', promotion, '50.00'),
          qualifiedDiscount('reward-largest', promotion, '99.00'),
        ],
      };

      const intents = applyBestOrderItemDiscounts(order, ascending);

      expect(intents).toHaveLength(1);
      const emitted = soleIntent(intents);
      if (emitted.operation === 'remove') {
        throw new Error('this module emits add intents only');
      }
      expect(emitted.discountAmount.equals(Money.fromDecimalString('1.00'))).toBe(true);
      expect(emitted.discountAmount.equals(Money.fromDecimalString('99.00'))).toBe(false);
    });

    it('emits the FIRST record when the list is ordered descending, so the largest wins', () => {
      const itemID = itemWithThreeDiscounts.orderItemID;

      // The production ordering, which the upstream insert-sort establishes.
      const descending: OrderItemQualifiedDiscounts = {
        [itemID]: [
          qualifiedDiscount('reward-largest', promotion, '99.00'),
          qualifiedDiscount('reward-middle', promotion, '50.00'),
          qualifiedDiscount('reward-smallest', promotion, '1.00'),
        ],
      };

      const intents = applyBestOrderItemDiscounts(order, descending);

      expect(intents).toHaveLength(1);
      const emitted = soleIntent(intents);
      if (emitted.operation === 'remove') {
        throw new Error('this module emits add intents only');
      }
      expect(emitted.discountAmount.equals(Money.fromDecimalString('99.00'))).toBe(true);
    });

    it('does not reorder, extend or shorten the list it was handed', () => {
      const itemID = itemWithThreeDiscounts.orderItemID;
      const handed: QualifiedDiscount[] = [
        qualifiedDiscount('reward-smallest', promotion, '1.00'),
        qualifiedDiscount('reward-largest', promotion, '99.00'),
        qualifiedDiscount('reward-middle', promotion, '50.00'),
      ];
      const before = handed.map(
        (record) => `${record.promotionRewardID}@${record.discountAmount.toDecimalString()}`,
      );

      applyBestOrderItemDiscounts(order, { [itemID]: handed });

      // The accumulator is READ, never written: no sort in place, no splice, no push.
      expect(
        handed.map(
          (record) => `${record.promotionRewardID}@${record.discountAmount.toDecimalString()}`,
        ),
      ).toStrictEqual(before);
      expect(before).toStrictEqual(['reward-smallest@1', 'reward-largest@99', 'reward-middle@50']);
    });
  });

  // -------------------------------------------------------------------------
  // §11.3 - THE EMITTED INTENT, FIELD BY FIELD, AND THE EXACT `appliedType` LITERAL
  //
  // [model/service/PromotionService.cfc:L530-L534] performs four operations: construct, then set
  // the applied type, the promotion and the order item, then set the discount amount.
  // -------------------------------------------------------------------------
  describe('the emitted intent carries exactly the four ported facts', () => {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L402, L448, L531]: `setAppliedType` has
    // EXACTLY THREE call sites in the whole component and therefore exactly three literals -
    // `'orderFulfillment'` at L402, `'order'` at L448 and `'orderItem'` at L531. This module is the
    // port of the L531 site alone, so `'orderItem'` is the ONLY literal it can ever emit. The
    // persisted column is `appliedType ormtype="string"`
    // [model/entity/PromotionApplied.cfc:L54], with no database-side constraint, so the literal is
    // the target's whole guarantee.
    it("sets appliedType to the exact literal 'orderItem'", () => {
      const intents = applyBestOrderItemDiscounts(order, accumulator);

      expect(intents).toHaveLength(2);
      for (const intent of intents) {
        expect(intent.appliedType).toBe('orderItem');
      }
    });

    it("never emits the 'order' or 'orderFulfillment' literals", () => {
      const intents = applyBestOrderItemDiscounts(order, accumulator);

      const emittedTypes = intents.map((intent) => intent.appliedType);
      expect(emittedTypes).not.toContain('order');
      expect(emittedTypes).not.toContain('orderFulfillment');
      expect(new Set(emittedTypes)).toStrictEqual(new Set(['orderItem']));
    });

    it('carries the promotion, the order item and the amount, and nothing else', () => {
      const winning = recordAt(listFor(accumulator, itemWithThreeDiscounts.orderItemID), 0);

      const intents = applyBestOrderItemDiscounts(order, accumulator);
      const intent = soleIntent(intents);

      // `toStrictEqual` on the WHOLE object, so an unexpected extra key fails here. The promotion
      // arrives as an opaque `promotionID` rather than the entity: a write-side instruction must
      // not transport a domain entity across the repository boundary, and the identifier is all
      // the legacy write path took from it - the foreign key at
      // [model/entity/PromotionApplied.cfc:L58].
      expect(intent).toStrictEqual({
        appliedType: 'orderItem',
        operation: 'add',
        promotionID: winning.promotion.getPromotionID(),
        orderItemID: itemWithThreeDiscounts.orderItemID,
        discountAmount: winning.discountAmount,
      });

      // Restated as an exact key census, so a future member cannot be added unnoticed.
      expect(Object.keys(intent).sort()).toStrictEqual([
        'appliedType',
        'discountAmount',
        'operation',
        'orderItemID',
        'promotionID',
      ]);
    });

    // `exactOptionalPropertyTypes` makes an OMITTED key and a present-but-`undefined` key genuinely
    // different states, so absence is asserted by key presence and never by comparing to
    // `undefined`. On the shipped type both of these are declared `?: never` on the order-item
    // variant, so a populated value would not even compile - the runtime check below confirms the
    // key is not materialised as an explicit `undefined` either.
    it('omits orderID and orderFulfillmentID entirely rather than setting them undefined', () => {
      const intents = applyBestOrderItemDiscounts(order, accumulator);

      expect(intents).toHaveLength(2);
      for (const intent of intents) {
        expect('orderID' in intent).toBe(false);
        expect('orderFulfillmentID' in intent).toBe(false);
      }
    });

    // ★ ADAPTED TO THE SHIPPED SURFACE.
    // LEGACY-NOTE [model/entity/PromotionApplied.cfc:L55]: `currencyCode ormtype="string"
    // length="3"` is a real persisted column, and the promotion engine NEVER populates it -
    // `setCurrencyCode` has zero occurrences in `model/service/PromotionService.cfc`, as does a
    // case-insensitive search for `currencyCode` itself - so every row it writes leaves the column
    // null. The shipped `PromotionAppliedIntent` consequently declares the member NOWHERE rather
    // than declaring it optional, which makes a synthesised currency unrepresentable instead of
    // merely discouraged. Absence is asserted here at runtime as well, because a consumer
    // "completing" the row would write a value the legacy engine never chose.
    it('never populates a currencyCode, which the engine does not set at all', () => {
      const intents = applyBestOrderItemDiscounts(order, accumulator);

      expect(intents).toHaveLength(2);
      for (const intent of intents) {
        expect('currencyCode' in intent).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // §11.4 - NEITHER L529 CONDITION IS REDUNDANT. THEY DEFEND TWO DIFFERENT STATES.
  //
  // [model/service/PromotionService.cfc:L529] reads, verbatim:
  //
  //   if(structKeyExists(orderItemQulifiedDiscounts, orderItem.getOrderItemID())
  //      && arrayLen(orderItemQulifiedDiscounts[ orderItem.getOrderItemID() ]) ) {
  //
  // `structKeyExists` guards ABSENCE OF THE KEY - an order item that qualified for no reward
  // discount and received no sale-price seed has no key at all. `arrayLen(...)`, used BARE as a
  // boolean by the source, guards EMPTINESS UNDER AN EXISTING KEY.
  //
  // LEGACY-NOTE [model/service/PromotionService.cfc:L502]: the second state is not hypothetical.
  // `arrayDeleteAt(orderItemQulifiedDiscounts[ orderItemID ], y)` in the over-use stripping pass
  // can remove the LAST surviving record and leave the key present holding an empty array. The
  // removal itself is owned by `./overUseStripping.test.ts`; what is tested here is only the state
  // it produces, because that state is precisely what this guard defends against. Collapsing the
  // two conditions into one would change behaviour in one of the two cases, so they are covered in
  // SEPARATE tests and neither is removed.
  // -------------------------------------------------------------------------
  describe('both halves of the L529 guard are load-bearing', () => {
    it('emits nothing for an order item whose key is absent from the accumulator, and does not throw', () => {
      const missingID = itemWithNoKey.orderItemID;

      // The premise: the golden accumulator genuinely has no key for the third item.
      expect(Object.keys(accumulator)).not.toContain(missingID);
      expect(missingID in accumulator).toBe(false);

      const intents = applyBestOrderItemDiscounts(order, accumulator);

      expect(intents.map((intent) => intent.orderItemID)).not.toContain(missingID);
      expect(intents).toHaveLength(2);
    });

    it('emits nothing for an order item whose key is present but holds an empty array, and does not throw', () => {
      const itemID = itemWithThreeDiscounts.orderItemID;

      // The post-stripping state: key present, list emptied.
      const emptiedUnderExistingKey: OrderItemQualifiedDiscounts = { [itemID]: [] };
      expect(itemID in emptiedUnderExistingKey).toBe(true);
      expect(listFor(emptiedUnderExistingKey, itemID)).toHaveLength(0);

      const intents = applyBestOrderItemDiscounts(order, emptiedUnderExistingKey);

      expect(intents).toStrictEqual([]);
    });

    it('distinguishes the two states rather than collapsing them, within a single order', () => {
      const emptied = itemWithThreeDiscounts.orderItemID;
      const populated = itemWithOneDiscount.orderItemID;
      const absent = itemWithNoKey.orderItemID;

      // One item emptied under an existing key, one populated, one with no key at all - all three
      // states present at once, so a guard that handled only one of them would be visible here.
      const mixed: OrderItemQualifiedDiscounts = {
        [emptied]: [],
        [populated]: [qualifiedDiscount('reward-survivor', promotion, '9.00')],
      };

      const intents = applyBestOrderItemDiscounts(order, mixed);

      expect(digestIntents(intents)).toStrictEqual([
        {
          appliedType: 'orderItem',
          operation: 'add',
          promotionID: promotion.getPromotionID(),
          discountAmount: '9',
          orderItemID: populated,
        },
      ]);
      const emittedIDs = intents.map((intent) => intent.orderItemID);
      expect(emittedIDs).not.toContain(emptied);
      expect(emittedIDs).not.toContain(absent);
    });

    // ★ THE GUARD ASYMMETRY, RECORDED AND NOT NORMALISED.
    // LEGACY-NOTE [model/service/PromotionService.cfc:L482, L498, L529]: two structurally parallel
    // accumulator accesses, one defended and one not. The stripping pass indexes
    // `orderItemQulifiedDiscounts[ orderItemID ]` at L482 and again at L498 with NO
    // `structKeyExists` test of any kind, while this module's L529 access is DOUBLE-guarded. On the
    // normal path the key is created alongside the usage entry, so the unguarded form is safe only
    // by an invariant the author evidently did not trust at this site. The asymmetry is preserved
    // exactly: no guard is added to the stripping side and neither guard is removed here. This test
    // pins the guarded side, which is the only side this module owns.
    it('tolerates an entirely empty accumulator, which the unguarded stripping accesses would not', () => {
      const intents = applyBestOrderItemDiscounts(order, {});

      expect(intents).toStrictEqual([]);
      expect(() => applyBestOrderItemDiscounts(order, {})).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // §11.6 - THE ORDER-ITEM LEVEL IS ADD-ONLY
  //
  // `PromotionAppliedIntent` is a discriminated union on `readonly operation: 'add' | 'update' |
  // 'remove'`, and the three levels are NOT symmetric:
  //
  //   | level            | update | remove | add        |
  //   | ---------------- | ------ | ------ | ---------- |
  //   | orderFulfillment | L389   | L393   | L400-L405  |
  //   | order            | L435   | L439   | L446-L451  |
  //   | orderItem        | none   | none   | L529-L535  |
  //
  // LEGACY-NOTE [model/service/PromotionService.cfc:L389, L393, L435, L439]: the other two levels
  // DO have all three operations - the fulfillment branch raises an existing discount at L389 and
  // detaches at L393, and the order branch does the same at L435 and L439, each as the arms of a
  // same-promotion test at L388 and L434. Those belong to the facade. The consequence for a
  // consumer is concrete and worth stating: A DESIGN THAT EMITTED ONLY `'add'` INTENTS COULD NOT
  // REPRODUCE L435 OR L439 AND WOULD SILENTLY CHANGE THE MONEY at the other two levels. That is why
  // the union carries all three arms even though this module only ever uses one - and, on the
  // shipped type, why `{ appliedType: 'orderItem', operation: 'update' }` and its `'remove'`
  // counterpart are uninhabited and do not compile at all.
  // -------------------------------------------------------------------------
  describe('every emitted intent is an add, and nothing is merged or removed', () => {
    it("marks every intent with operation 'add'", () => {
      const intents = applyBestOrderItemDiscounts(order, accumulator);

      expect(intents).toHaveLength(2);
      for (const intent of intents) {
        expect(intent.operation).toBe('add');
      }
    });

    it("never emits an 'update' or a 'remove' intent", () => {
      const intents = applyBestOrderItemDiscounts(order, accumulator);

      const operations = intents.map((intent) => intent.operation);
      expect(operations).not.toContain('update');
      expect(operations).not.toContain('remove');
      expect(new Set(operations)).toStrictEqual(new Set(['add']));
    });

    it('emits two separate add intents for two items sharing one promotion, with no merging', () => {
      const firstID = itemWithThreeDiscounts.orderItemID;
      const secondID = itemWithOneDiscount.orderItemID;

      // The SAME promotion instance on both items - the state a de-duplicating consumer would
      // collapse. Add-only semantics mean no merge, no de-duplication and no combining of amounts.
      const sharedPromotion: OrderItemQualifiedDiscounts = {
        [firstID]: [qualifiedDiscount('reward-one', promotion, '4.00')],
        [secondID]: [qualifiedDiscount('reward-two', promotion, '6.00')],
      };

      const intents = applyBestOrderItemDiscounts(order, sharedPromotion);

      expect(intents).toHaveLength(2);
      expect(digestIntents(intents)).toStrictEqual([
        {
          appliedType: 'orderItem',
          operation: 'add',
          promotionID: promotion.getPromotionID(),
          discountAmount: '4',
          orderItemID: firstID,
        },
        {
          appliedType: 'orderItem',
          operation: 'add',
          promotionID: promotion.getPromotionID(),
          discountAmount: '6',
          orderItemID: secondID,
        },
      ]);

      // Both name the same promotion, and neither amount was combined into the other.
      const promotionIDs = new Set(intents.map((intent) => intent.promotionID));
      expect(promotionIDs.size).toBe(1);
    });

    // ★ THE THREE BACKWARDS CLEAR-OUT LOOPS ARE REPLACED, NOT REPRODUCED.
    // JUDGMENT CALL: [model/service/PromotionService.cfc:L64-L68] walks each order item's already
    // applied promotions backwards and detaches them with `removeOrderItem()` at L66, reaching them
    // through `order.getOrderItems()[oi].getAppliedPromotions()` at L65-L66; L71-L75 does the same
    // for fulfillments with `removeOrderFulfillment()`, and L78-L80 for the order itself with
    // `removeOrder()`. The intent model REPLACES all three rather than reproducing any of them:
    // the input is a read-only view and the output a fresh list of instructions, so there is no
    // prior state reachable to detach. This module therefore offers NO REMOVAL AFFORDANCE AT ALL -
    // no remove intent, no deletion path, no mutable applied-promotions array - and that absence is
    // asserted rather than assumed.
    it('offers no removal affordance, emitting only additions even when the order already has applied promotions', () => {
      // A separate graph, and deliberately NOT routed through the shared capture sink: overwriting
      // it mid-test would replace the accumulator this test is still using.
      const alreadyApplied = makeOrderViewFixture({
        appliedPromotions: [
          {
            // A PERSISTED row, so it carries the generated identity its mapping requires
            // [model/entity/PromotionApplied.cfc:L52] - which is precisely what makes it a row a
            // clear could name. This module still names none, which is what the test asserts.
            promotionAppliedID: 'applied-pre-existing',
            discountAmount: Money.fromDecimalString('99.00'),
            promotion: { promotionID: 'pre-existing-promotion' },
          },
        ],
      });
      expect(alreadyApplied.appliedPromotions).toHaveLength(1);

      const intents = applyBestOrderItemDiscounts(alreadyApplied, accumulator);

      // Not one instruction to clear the pre-existing record, and the record itself is untouched.
      expect(intents.map((intent) => intent.operation)).toStrictEqual(['add', 'add']);
      expect(intents.map((intent) => intent.promotionID)).not.toContain('pre-existing-promotion');
      expect(alreadyApplied.appliedPromotions).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // §11.7 - THERE IS NO SAVE, AND THE TARGET PERSISTS NOTHING
  //
  // CFML parity [model/service/PromotionService.cfc:L533]: the legacy block reads as dead code and
  // is not. It constructs a record, calls four setters and then performs NO explicit write - there
  // is no persistence call of any kind and no collection append anywhere in L524-L537, verified by
  // searching the whole method. `setOrderItem( orderItem )` at L533 IS THE ATTACHMENT
  // MECHANISM: [model/entity/PromotionApplied.cfc:L97-L101] shows the setter itself performing
  // `arrayAppend(arguments.orderItem.getAppliedPromotions(), this)`, so assigning the association
  // is what makes the row reachable from the order item and persistable by Hibernate cascade. That
  // machinery lives in `org/Hibachi/**`, a boundary to extract FROM and never modify, so the target
  // neither reproduces nor depends on it: the amount and the opaque identifier travel out on a
  // returned intent and nothing is written. That substitution is signature reshaping #1, already
  // budgeted, and it is the reason this module can be tested without a database at all.
  // -------------------------------------------------------------------------
  describe('nothing is persisted and the order view is never mutated', () => {
    it('leaves every observable value on the order view identical', () => {
      // An explicitly constructed deep copy, taken before the call.
      const before = snapshotOrderState(order);

      applyBestOrderItemDiscounts(order, accumulator);

      const after = snapshotOrderState(order);
      expect(after).toStrictEqual(before);
    });

    it("does not grow the order's applied-promotions collection", () => {
      expect(order.appliedPromotions).toHaveLength(0);
      const collectionBefore = order.appliedPromotions;

      const intents = applyBestOrderItemDiscounts(order, accumulator);

      // Two intents were produced, and not one of them landed anywhere. In the legacy this is
      // exactly where the L533 cascade would have appended two rows.
      expect(intents).toHaveLength(2);
      expect(order.appliedPromotions).toHaveLength(0);

      // The array was not replaced either, only left alone.
      expect(order.appliedPromotions).toBe(collectionBefore);
    });

    it('retains no reference to the order view or to any of its items on the returned intents', () => {
      const intents = applyBestOrderItemDiscounts(order, accumulator);
      const intent = soleIntent(intents);

      // The target is named by opaque identifier, never by a live view. A held reference is what
      // would let a consumer reach back through an intent and mutate order persistence.
      const values = Object.values(intent);
      expect(values).not.toContain(order);
      expect(values).not.toContain(itemWithThreeDiscounts);
      expect(values).not.toContain(order.orderItems);
      expect(values).not.toContain(order.appliedPromotions);
    });

    it('exposes no save, persist, flush or delete affordance on anything it returns', () => {
      const intents = applyBestOrderItemDiscounts(order, accumulator);
      const intent = soleIntent(intents);

      // Asserted as an exhaustive key census rather than a probe for particular names: the intent's
      // whole surface is five data members, so there is nowhere for a persistence hook to hide.
      expect(Object.keys(intent).sort()).toStrictEqual([
        'appliedType',
        'discountAmount',
        'operation',
        'orderItemID',
        'promotionID',
      ]);
      for (const value of Object.values(intent)) {
        expect(typeof value).not.toBe('function');
      }
    });
  });

  // -------------------------------------------------------------------------
  // §11.8 - THE IDENTIFIERS ARE OPAQUE
  //
  // `orderItemID` is never parsed, never validated as a UUID and never resolved back to an entity.
  // [model/entity/PromotionApplied.cfc:L59] holds it as a foreign key into the out-of-scope
  // `OrderItem` - `fkcolumn="orderItemID"`, alongside `promotion` at L58, `orderFulfillment` at L60
  // and `order` at L61 - and the anti-corruption boundary models all four as plain strings.
  // -------------------------------------------------------------------------
  describe('the order item identifier travels through untransformed', () => {
    it('emits the identifier byte-identically, with no normalisation or case change', () => {
      const sourceID = itemWithThreeDiscounts.orderItemID;

      const intents = applyBestOrderItemDiscounts(order, accumulator);
      const intent = soleIntent(intents);

      // `toBe` on the string: identical value, not merely equivalent.
      expect(intent.orderItemID).toBe(sourceID);
      expect(intent.orderItemID).toHaveLength(sourceID.length);
    });

    // CFML parity [model/service/PromotionService.cfc:L529]: CFML struct keys are
    // CASE-INSENSITIVE and TypeScript object keys are not, so the shipped module routes the key
    // test and the key read through the CFML-matching accessors in `src/lib/cfml/struct.ts`. The
    // behavioural consequence is worth pinning in both directions: a key stored under a different
    // case STILL MATCHES, and the identifier the intent carries is nonetheless the order item's own
    // spelling rather than the accumulator key's.
    it('matches an accumulator key case-insensitively yet emits the item’s own spelling', () => {
      const sourceID = itemWithThreeDiscounts.orderItemID;
      const shoutedKey = sourceID.toUpperCase();

      // The premise: the two spellings genuinely differ.
      expect(shoutedKey).not.toBe(sourceID);

      const keyedByDifferentCase: OrderItemQualifiedDiscounts = {
        [shoutedKey]: [qualifiedDiscount('reward-case', promotion, '3.00')],
      };

      const intents = applyBestOrderItemDiscounts(order, keyedByDifferentCase);

      expect(intents).toHaveLength(1);
      const intent = soleIntent(intents);
      expect(intent.orderItemID).toBe(sourceID);
      expect(intent.orderItemID).not.toBe(shoutedKey);
    });
  });

  // -------------------------------------------------------------------------
  // §11.9 - THE EMPTY AND PARTIAL CASES
  // -------------------------------------------------------------------------
  describe('empty and partially qualifying orders', () => {
    it('returns an empty array, not undefined and not a throw, for an order with no items', () => {
      const emptyOrder = makeOrderViewFixture({ orderItems: [] });
      expect(emptyOrder.orderItems).toHaveLength(0);

      // "Not a throw" asserted explicitly, because an order with nothing to price is a legitimate
      // input rather than an error: the legacy `for` at [model/service/PromotionService.cfc:L524]
      // simply never enters its body.
      expect(() => applyBestOrderItemDiscounts(emptyOrder, accumulator)).not.toThrow();

      const intents = applyBestOrderItemDiscounts(emptyOrder, accumulator);

      expect(Array.isArray(intents)).toBe(true);
      expect(intents).toStrictEqual([]);
      expect(intents).not.toBeUndefined();
    });

    it('returns an empty array for an entirely empty accumulator', () => {
      const intents = applyBestOrderItemDiscounts(order, {});

      expect(Array.isArray(intents)).toBe(true);
      expect(intents).toStrictEqual([]);
    });

    it('emits exactly one intent per qualifying item, in order-item iteration order', () => {
      const intents = applyBestOrderItemDiscounts(order, accumulator);

      // Two of the three golden items carry a key; the third carries none. The mapping is
      // deterministic and follows the order items, not the accumulator's key insertion order.
      expect(intents).toHaveLength(2);
      expect(intents.map((intent) => intent.orderItemID)).toStrictEqual([
        itemWithThreeDiscounts.orderItemID,
        itemWithOneDiscount.orderItemID,
      ]);
      expect(order.orderItems).toHaveLength(3);
    });

    it('follows order-item order rather than accumulator key order', () => {
      const firstID = itemWithThreeDiscounts.orderItemID;
      const secondID = itemWithOneDiscount.orderItemID;

      // Keys inserted in the REVERSE of the order-item sequence. Iteration is driven by
      // `order.orderItems` [model/service/PromotionService.cfc:L524, L526], so the emission order
      // must follow the items and ignore this.
      const reversedKeyOrder: OrderItemQualifiedDiscounts = {
        [secondID]: [qualifiedDiscount('reward-second', promotion, '2.00')],
        [firstID]: [qualifiedDiscount('reward-first', promotion, '1.00')],
      };

      const intents = applyBestOrderItemDiscounts(order, reversedKeyOrder);

      expect(intents.map((intent) => intent.orderItemID)).toStrictEqual([firstID, secondID]);
    });
  });

  // -------------------------------------------------------------------------
  // A2 - A FRESH RESULT ON EVERY INVOCATION
  //
  // The intent list is function-local and freshly allocated per call. Module-level mutable state is
  // forbidden in the subject for the same reason it is forbidden in this suite: on a warm Lambda
  // container it survives between unrelated requests, so a shared or cached result array could
  // carry one customer's discount into another customer's order.
  // -------------------------------------------------------------------------
  describe('each invocation returns its own array', () => {
    it('returns a distinct array instance for two successive identical calls', () => {
      const first = applyBestOrderItemDiscounts(order, accumulator);
      const second = applyBestOrderItemDiscounts(order, accumulator);

      expect(first).not.toBe(second);
      expect(digestIntents(first)).toStrictEqual(digestIntents(second));
    });

    it('does not let a change to one result affect another', () => {
      const first = applyBestOrderItemDiscounts(order, accumulator);
      const second = applyBestOrderItemDiscounts(order, accumulator);
      expect(first).toHaveLength(2);
      expect(second).toHaveLength(2);

      // The returned array is a fresh mutable list the caller owns outright.
      first.push(soleIntent(first));

      expect(first).toHaveLength(3);
      expect(second).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // P4 - NO ARITHMETIC IS PERFORMED ON THE AMOUNT
  //
  // The whole of this module's money handling is [model/service/PromotionService.cfc:L534]:
  // `setDiscountAmount( ...[1].discountAmount )` hands the accumulated amount straight through. The
  // arithmetic that produced it belongs to `./discountAmount.test.ts`; the partial-strip rewrite
  // that can shrink it belongs to `./overUseStripping.test.ts`.
  // -------------------------------------------------------------------------
  describe('the discount amount is passed through, never recomputed', () => {
    it('carries the very same Money instance the accumulator held', () => {
      const winning = recordAt(listFor(accumulator, itemWithThreeDiscounts.orderItemID), 0);

      const intents = applyBestOrderItemDiscounts(order, accumulator);
      const intent = soleIntent(intents);
      if (intent.operation === 'remove') {
        throw new Error('this module emits add intents only');
      }

      // Reference identity is the strongest available statement of "no arithmetic": a rounding, a
      // re-format or a clamp would each have produced a NEW `Money`.
      expect(intent.discountAmount).toBe(winning.discountAmount);
    });

    it('preserves an amount with more than two decimal places, applying no rounding', () => {
      const itemID = itemWithThreeDiscounts.orderItemID;

      // 7.49625 is the reference figure from the migration's verified discount calculation - a unit
      // price of 19.99 at quantity 3, less 12.5 percent. Presenting it to two decimals is a
      // downstream concern; this module must not do it.
      const unrounded: OrderItemQualifiedDiscounts = {
        [itemID]: [qualifiedDiscount('reward-precise', promotion, '7.49625')],
      };

      const intents = applyBestOrderItemDiscounts(order, unrounded);
      const intent = soleIntent(intents);
      if (intent.operation === 'remove') {
        throw new Error('this module emits add intents only');
      }

      expect(intent.discountAmount.equals(Money.fromDecimalString('7.49625'))).toBe(true);
      expect(intent.discountAmount.toDecimalString()).toBe('7.49625');

      // Explicitly NOT the two-decimal presentation, and explicitly not truncated.
      expect(intent.discountAmount.equals(Money.fromDecimalString('7.50'))).toBe(false);
      expect(intent.discountAmount.equals(Money.fromDecimalString('7.49'))).toBe(false);
    });

    it('does not clamp a discount larger than the order item price', () => {
      const itemID = itemWithThreeDiscounts.orderItemID;
      const itemPrice = itemWithThreeDiscounts.price;

      const oversized: OrderItemQualifiedDiscounts = {
        [itemID]: [qualifiedDiscount('reward-oversized', promotion, '100000.00')],
      };
      expect(Money.fromDecimalString('100000.00').isGreaterThan(itemPrice)).toBe(true);

      const intents = applyBestOrderItemDiscounts(order, oversized);
      const intent = soleIntent(intents);
      if (intent.operation === 'remove') {
        throw new Error('this module emits add intents only');
      }

      // No clamp, no floor at the price, no correction of any kind. Any such adjustment would be
      // this module inventing a rule the ported block does not contain.
      expect(intent.discountAmount.equals(Money.fromDecimalString('100000.00'))).toBe(true);
    });

    // LEGACY-NOTE [model/entity/PromotionApplied.cfc:L53]: `discountAmount ormtype="big_decimal"`
    // carries NO `default="0"`, one of exactly four no-default money columns in the slice with
    // `SkuCurrency.price` [model/entity/SkuCurrency.cfc:L53], `PriceGroupRate.amount`
    // [model/entity/PriceGroupRate.cfc:L54] and `PromotionReward.amount`
    // [model/entity/PromotionReward.cfc:L61]. ABSENCE IS NOT ZERO: an order item with no surviving
    // discount must end with NO INTENT, never an intent worth nothing. A zero-valued default
    // anywhere on this path would turn "this customer receives no promotion" into "this customer
    // receives a promotion of zero", which is a different row in `SwPromotionApplied`.
    it('emits no intent at all - not a zero-amount one - for an item with no surviving discount', () => {
      const emptied = itemWithThreeDiscounts.orderItemID;

      const intents = applyBestOrderItemDiscounts(order, { [emptied]: [] });

      // The whole assertion: NO intent. A zero-valued default on this path would instead have
      // produced one intent carrying zero, turning "this customer receives no promotion" into "this
      // customer receives a promotion of zero" - a different row in `SwPromotionApplied`.
      expect(intents).toStrictEqual([]);
      expect(intents).toHaveLength(0);
    });

    // The same distinction from the OTHER direction, which is what makes the pair non-vacuous: a
    // discount that genuinely IS zero is still a discount the accumulator holds, and this module
    // must emit it rather than filter it out. Absence and zero are different states, and neither is
    // allowed to impersonate the other.
    it('still emits an intent for a discount whose amount is legitimately zero', () => {
      const itemID = itemWithThreeDiscounts.orderItemID;

      const genuinelyZero: OrderItemQualifiedDiscounts = {
        [itemID]: [qualifiedDiscount('reward-zero', promotion, '0.00')],
      };

      const intents = applyBestOrderItemDiscounts(order, genuinelyZero);

      expect(intents).toHaveLength(1);
      const intent = soleIntent(intents);
      if (intent.operation === 'remove') {
        throw new Error('this module emits add intents only');
      }
      expect(intent.discountAmount.equals(Money.zero)).toBe(true);
      expect(intent.orderItemID).toBe(itemID);
    });
  });
});
