// slatwall-ts - Characterization suite for `src/services/promotion/salePriceSeeding.ts`.
//
// Net-new coverage (AAP 0.6.6) is measured rather than asserted: `meta/tests/unit/service/`
// contains only `AccountServiceTest.cfc`, `HibachiServiceTest.cfc`, `PaymentServiceTest.cfc` and
// `UtilityRBServiceTest.cfc`.
//
// P5 - parameterized SQL: not applicable, and here is why.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L542-L544]: the preserved return-and-exchange
// no-op carrying `TODO [issue #1766]` belongs to `../promotionService.test.ts`, which owns the
// facade.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Promotion } from '../../../../src/domain/entities/promotion.js';
import type { Sku } from '../../../../src/domain/entities/sku.js';
import type { SalePriceDetail } from '../../../../src/domain/ports/promotionRepository.js';
import type {
  OrderItemQualifiedDiscounts,
  QualifiedDiscount,
} from '../../../../src/domain/promotionEngine/qualifiedDiscountTypes.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import type { OrderItemView } from '../../../../src/domain/views/orderItemView.js';
import type { OrderView } from '../../../../src/domain/views/orderView.js';
import { structKeyExists } from '../../../../src/lib/cfml/struct.js';
import { SalePriceSeeder } from '../../../../src/services/promotion/salePriceSeeding.js';
import { makeOrderViewFixture } from '../../../fixtures/orderViewFixtures.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';
import { makeSkuFixture } from '../../../fixtures/skuFixtures.js';

// The published member names, written out so an unexpected fourth key fails a test rather than
// passing unnoticed. Both lists are spelled from the published contracts, not invented here.

/**
 * The three members `QualifiedDiscount` declares, sorted.
 */
const QUALIFIED_DISCOUNT_MEMBERS: readonly string[] = [
  'discountAmount',
  'promotion',
  'promotionRewardID',
];
const REWARD_USAGE_LEDGER_MEMBERS: readonly string[] = [
  'maximumUsePerItem',
  'maximumUsePerOrder',
  'maximumUsePerQualification',
  'orderItemsUsage',
  'usedInOrder',
];

/**
 * The two members the docblock at [model/service/PromotionService.cfc:L127-L128] promises and no
 * construction site ever writes.
 */
const PHANTOM_DOCBLOCK_MEMBERS: readonly string[] = ['discountQuantity', 'discountPerUseValue'];

/**
 * The key an order item would have to be identified by for a plain assignment to be swallowed.
 *
 * Held in a constant rather than written as a literal property access anywhere, because the lint
 * configuration forbids `__proto__` member access outright.
 */
const PROTOTYPE_KEY_ORDER_ITEM_ID = '__proto__';

// The collaborator doubles - hand-written, in-memory, declared in this file.
//
// No mocking, spying, faking or data-generation library is introduced: the dependency set is
// pinned exactly and this suite adds nothing to it.
//
// Both doubles are DETERMINISTIC: no randomness, no clock read, no counter that survives a test.

/**
 * Answers promotion lookups immediately from a registered table, recording every identifier asked
 * for in call order.
 *
 * Stands in for `this.getPromotion(salePriceDetails.promotionID)`
 * [model/service/PromotionService.cfc:L157], an inherited framework entity getter resolved at
 * request time.
 *
 * An unregistered identifier THROWS rather than answering something plausible.
 */
class RecordingPromotionResolver {
  public readonly getPromotionCalls: string[] = [];

  private readonly answers: Map<string, Promotion>;

  constructor(answers: readonly (readonly [string, Promotion])[]) {
    this.answers = new Map(answers);
  }

  public getPromotion(promotionID: string): Promise<Promotion> {
    this.getPromotionCalls.push(promotionID);

    const answer: Promotion | undefined = this.answers.get(promotionID);

    if (answer === undefined) {
      throw new Error(
        `this scenario registered no promotion for '${promotionID}'; register one before seeding`,
      );
    }

    return Promise.resolve(answer);
  }
}

/**
 * Holds every promotion lookup open until the case releases it.
 *
 * The only way to observe when the accumulator is written relative to the awaited resolution.
 */
class DeferringPromotionResolver {
  public readonly getPromotionCalls: string[] = [];

  private readonly waiting: ((promotion: Promotion) => void)[] = [];

  public getPromotion(promotionID: string): Promise<Promotion> {
    this.getPromotionCalls.push(promotionID);

    return new Promise<Promotion>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  /**
   * Releases every lookup taken so far with the same promotion.
   */
  public settleAll(promotion: Promotion): void {
    const released: ((promotion: Promotion) => void)[] = this.waiting.splice(
      0,
      this.waiting.length,
    );

    for (const resolve of released) {
      resolve(promotion);
    }
  }
}

// Scenario builders. Fixtures are CONSUMED, never authored: the three factories below are the
// project's own, and no fixture module is created or edited by this file.

/**
 * One sale-price detail row, carrying the five required members and omitting the three optional
 * ones.
 *
 * The optional members are OMITTED rather than assigned `undefined`, because
 * `exactOptionalPropertyTypes` distinguishes an absent key from a present one holding `undefined`.
 */
function makeSalePriceDetailRow(
  salePrice: string,
  promotionID: string,
  skuID: string,
): SalePriceDetail {
  return {
    skuID,
    discountLevel: 'sku',
    salePriceDiscountType: 'amount',
    salePrice: Money.fromDecimalString(salePrice),
    promotionID,
  };
}

/**
 * A sku priced at `price` whose pre-materialised sale-price row offers `salePrice`.
 */
function makeSkuWithSalePrice(
  idPrefix: string,
  price: string,
  salePrice: string,
  promotionID: string,
): Sku {
  return makeSkuFixture({
    idPrefix,
    price: Money.fromDecimalString(price),
    salePriceDetail: makeSalePriceDetailRow(salePrice, promotionID, `${idPrefix}sku`),
  });
}

/**
 * A sku priced at `price` with no sale-price row at all.
 *
 * The fixture's documented default already omits the row, so this is the absent state exactly as
 * hydration produces it - `getSalePriceDetails()` answers `undefined`.
 */
function makeSkuWithoutSalePrice(idPrefix: string, price: string): Sku {
  return makeSkuFixture({ idPrefix, price: Money.fromDecimalString(price) });
}

/**
 * One order item to place into the golden order, positionally.
 */
interface SeedingItemSpec {
  readonly orderItemID: string;
  readonly sku: Sku;
  readonly quantity: number;
  /**
   * The item's own price, as a decimal string, where a case needs it to differ from the sku.
   */
  readonly price?: string;
}

/**
 * The golden order with its leading items replaced positionally.
 *
 * Fewer than three specs leaves the fixture's remaining default items in place, and those defaults
 * carry no sale-price row.
 */
function makeOrderWithItems(items: readonly SeedingItemSpec[]): OrderView {
  return makeOrderViewFixture({
    itemOverrides: items.map((spec) =>
      spec.price === undefined
        ? { orderItemID: spec.orderItemID, sku: spec.sku, quantity: spec.quantity }
        : {
            orderItemID: spec.orderItemID,
            sku: spec.sku,
            quantity: spec.quantity,
            price: Money.fromDecimalString(spec.price),
          },
    ),
  });
}

// Narrowing helpers. `noUncheckedIndexedAccess` makes every indexed read a `T | undefined`, and
// each one is narrowed by an explicit throw - never by a postfix `!` and never by a cast.

/**
 * One order item by position.
 */
function itemAt(order: OrderView, index: number): OrderItemView {
  const item: OrderItemView | undefined = order.orderItems[index];

  if (item === undefined) {
    throw new Error(`this test scenario built no order item at index ${String(index)}`);
  }

  return item;
}

/**
 * One accumulator bucket by opaque order-item identifier.
 */
function bucketOf(
  accumulator: OrderItemQualifiedDiscounts,
  orderItemID: string,
): QualifiedDiscount[] {
  const bucket: QualifiedDiscount[] | undefined = accumulator[orderItemID];

  if (bucket === undefined) {
    throw new Error(`this test scenario produced no accumulator bucket for '${orderItemID}'`);
  }

  return bucket;
}

/**
 * One qualified-discount record by position within a bucket.
 */
function recordAt(bucket: readonly QualifiedDiscount[], index: number): QualifiedDiscount {
  const record: QualifiedDiscount | undefined = bucket[index];

  if (record === undefined) {
    throw new Error(`this test scenario expected an accumulator record at index ${String(index)}`);
  }

  return record;
}

/**
 * The member names a record actually carries, sorted, for comparison against a published list.
 */
function memberNamesOf(record: QualifiedDiscount): string[] {
  return Object.keys(record).sort();
}

/**
 * Renders one bucket as plain strings.
 *
 * A string projection rather than a deep clone, so a comparison observes exactly the three things
 * the subject can decide - which records exist, in what order, and at what amount.
 */
function describeBucket(bucket: readonly QualifiedDiscount[]): string[] {
  return bucket.map(
    (record) =>
      `${record.promotionRewardID}|${record.promotion.getPromotionID()}|` +
      `${record.discountAmount.toDecimalString()}`,
  );
}

/**
 * The whole accumulator rendered the same way, keys included.
 */
function describeAccumulator(accumulator: OrderItemQualifiedDiscounts): Record<string, string[]> {
  const described: Record<string, string[]> = {};

  for (const [orderItemID, bucket] of Object.entries(accumulator)) {
    described[orderItemID] = describeBucket(bucket);
  }

  return described;
}

/**
 * A reward-path accumulator record, for the one case that has to show what the facade's insertion
 * sort would do with a seeded record already in place.
 *
 * It carries a REAL reward identifier, which is the whole contrast with the seeded record's empty
 * string: a record with a real identifier is reachable by the over-use stripping pass.
 */
function makeRewardDiscountRecord(
  promotionRewardID: string,
  discountAmount: Money,
  promotion: Promotion,
): QualifiedDiscount {
  return { promotionRewardID, promotion, discountAmount };
}

describe('SalePriceSeeder - the ported sale-price seeding pass', () => {
  let promotionGraph: ReturnType<typeof makePromotionFixtures>;
  let salePromotion: Promotion;
  let salePromotionID: string;
  let resolver: RecordingPromotionResolver;
  let seeder: SalePriceSeeder;
  let accumulator: OrderItemQualifiedDiscounts;

  beforeEach(() => {
    promotionGraph = makePromotionFixtures({ idPrefix: 'sale-price-seeding-' });
    salePromotion = promotionGraph.promotion;
    salePromotionID = salePromotion.getPromotionID();
    resolver = new RecordingPromotionResolver([[salePromotionID, salePromotion]]);
    seeder = new SalePriceSeeder(resolver);
    accumulator = {};
  });

  // The runner's single setup file already registers a global hook that restores mocks and real
  // timers after every test.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('the shipped surface, confirmed before anything is asserted about behaviour', () => {
    it('is a one-parameter class whose seeding method takes the order and the accumulator', () => {
      expect(SalePriceSeeder.length).toBe(1);
      expect(seeder.seedSalePriceDiscounts.length).toBe(2);
    });

    it('returns a promise that settles to nothing', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-surface',
          sku: makeSkuWithSalePrice('surface-', '10.00', '9.00', salePromotionID),
          quantity: 1,
        },
      ]);

      const returned: Promise<void> = seeder.seedSalePriceDiscounts(order, accumulator);

      // JUDGMENT CALL: the async boundary is asserted at the SHIPPED site rather than the
      // anticipated one - see the header note.
      expect(returned).toBeInstanceOf(Promise);

      // Settles to nothing, exactly as the legacy fragment produces no value.
      expect(await returned).toBeUndefined();
    });

    it('writes nothing that carries a reward-usage ledger member', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-not-a-ledger',
          sku: makeSkuWithSalePrice('not-ledger-', '10.00', '4.00', salePromotionID),
          quantity: 2,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      const record: QualifiedDiscount = recordAt(bucketOf(accumulator, 'oi-not-a-ledger'), 0);

      // The presence test runs through the CFML struct helper rather than `in` or `Object.hasOwn`.
      for (const ledgerMember of REWARD_USAGE_LEDGER_MEMBERS) {
        expect(structKeyExists(record, ledgerMember)).toBe(false);
      }

      expect(REWARD_USAGE_LEDGER_MEMBERS.length).toBe(5);
    });
  });

  describe('the target is the qualified-discount accumulator, keyed by opaque order-item ID', () => {
    it('stores an array of qualified discounts under the item identifier, verbatim', async () => {
      // The identifier is deliberately shaped like nothing this port would generate.
      const opaqueOrderItemID = 'OI-9f3b/Weird Key.42';

      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: opaqueOrderItemID,
          sku: makeSkuWithSalePrice('opaque-', '10.00', '7.50', salePromotionID),
          quantity: 2,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L142, L152, L155]: the structure is a
      // struct keyed by `orderItem.getOrderItemID()` whose values are ARRAYS of records.
      expect(Object.keys(accumulator)).toStrictEqual([opaqueOrderItemID]);

      const bucket: QualifiedDiscount[] = bucketOf(accumulator, opaqueOrderItemID);

      expect(Array.isArray(bucket)).toBe(true);
      expect(bucket.length).toBe(1);
      expect(memberNamesOf(recordAt(bucket, 0))).toStrictEqual(QUALIFIED_DISCOUNT_MEMBERS);
    });

    it('leaves the accumulator untouched for an order with no items at all', async () => {
      const order: OrderView = makeOrderViewFixture({ orderItems: [] });

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L145]: a CFML for-in over an empty array
      // executes its body zero times. No key is created, and - because the resolution at
      // [model/service/PromotionService.cfc:L157] sits inside the loop and inside the gate -
      // nothing is resolved either.
      expect(describeAccumulator(accumulator)).toStrictEqual({});
      expect(resolver.getPromotionCalls).toStrictEqual([]);
      expect(order.orderItems.length).toBe(0);
    });
  });

  describe('the L148 gate: case-insensitive key presence AND a STRICT less-than', () => {
    it('★ seeds NOTHING when the sale price is exactly EQUAL to the sku price', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-equal',
          sku: makeSkuWithSalePrice('equal-', '10.00', '10.00', salePromotionID),
          quantity: 3,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L148]: the comparison is
      // `salePriceDetails.salePrice < orderItem.getSku().getPrice()`, a STRICT less-than.
      expect(describeAccumulator(accumulator)).toStrictEqual({});
      expect(resolver.getPromotionCalls).toStrictEqual([]);
    });

    it('seeds nothing when the sale price is GREATER than the sku price', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-greater',
          sku: makeSkuWithSalePrice('greater-', '10.00', '11.00', salePromotionID),
          quantity: 3,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // A sale price ABOVE the shelf price would yield a NEGATIVE discount, and the legacy gate is
      // what keeps it out. Note what is not here: no absolute value, no sign check, no clamp to
      // zero.
      expect(describeAccumulator(accumulator)).toStrictEqual({});
      expect(resolver.getPromotionCalls).toStrictEqual([]);
    });

    it('seeds when the sale price is LESS than the sku price', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-less',
          sku: makeSkuWithSalePrice('less-', '10.00', '9.00', salePromotionID),
          quantity: 3,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // (10.00 x 3) - (9.00 x 3) = 3. Rendered canonically: the value object drops trailing zeros
      // on the way out, so the extended delta of three dollars reads as `3`, not `3.00`.
      expect(describeAccumulator(accumulator)).toStrictEqual({
        'oi-less': [`|${salePromotionID}|3`],
      });
      expect(resolver.getPromotionCalls).toStrictEqual([salePromotionID]);
    });

    it('seeds nothing, and resolves nothing, when the sale-price row is absent entirely', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-no-row',
          sku: makeSkuWithoutSalePrice('no-row-', '10.00'),
          quantity: 3,
        },
      ]);

      // CFML parity [model/service/PromotionService.cfc:L148]: the first half of the conjunction
      // is `structKeyExists(salePriceDetails, "salePrice")`.
      await seeder.seedSalePriceDiscounts(order, accumulator);

      expect(describeAccumulator(accumulator)).toStrictEqual({});
      expect(resolver.getPromotionCalls).toStrictEqual([]);
      expect(itemAt(order, 0).sku.getSalePriceDetails()).toBeUndefined();
    });

    it('never compares prices for an absent row, because the gate short-circuits', async () => {
      // Three items, and only the MIDDLE one carries a sale-price row. The two either side are the
      // fixture's own defaults in every respect except their absent rows.
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-absent-first',
          sku: makeSkuWithoutSalePrice('absent-first-', '10.00'),
          quantity: 1,
        },
        {
          orderItemID: 'oi-present-middle',
          sku: makeSkuWithSalePrice('present-middle-', '10.00', '6.00', salePromotionID),
          quantity: 1,
        },
        {
          orderItemID: 'oi-absent-last',
          sku: makeSkuWithoutSalePrice('absent-last-', '10.00'),
          quantity: 1,
        },
      ]);

      // Installed after the fixtures are built, so the count observes the subject alone.
      const comparisonSpy = vi.spyOn(Money.prototype, 'isLessThan');

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L148]: `&&` short-circuits, so for an item
      // whose row is absent the comparison is never REACHED. Once across three items, not three
      // times.
      expect(comparisonSpy.mock.calls.length).toBe(1);
      expect(Object.keys(accumulator)).toStrictEqual(['oi-present-middle']);
    });

    it('answers the key-presence term case-insensitively, as a CFML struct does', () => {
      // CFML parity [model/service/PromotionService.cfc:L148]: CFML struct keys match
      // CASE-INSENSITIVELY and TypeScript object keys do not, so the shipped gate routes its
      // presence test through the CFML struct helper rather than through `in` or `Object.hasOwn`.
      //
      // JUDGMENT CALL: the helper is asserted directly rather than through a differently-cased
      // detail row, because the published `SalePriceDetail` spells `salePrice` exactly and
      // declares it REQUIRED.
      expect(structKeyExists({ SALEPRICE: 'a stored value' }, 'salePrice')).toBe(true);
      expect(structKeyExists({ SalePrice: 'a stored value' }, 'salePrice')).toBe(true);
      expect(structKeyExists({ salePrice: 'a stored value' }, 'salePrice')).toBe(true);

      // Case-insensitive is not the same as fuzzy: a genuinely different key still misses.
      expect(structKeyExists({ salesPrice: 'a stored value' }, 'salePrice')).toBe(false);
      expect(structKeyExists({}, 'salePrice')).toBe(false);
    });

    it('gates on the SKU price, not on the order item price', async () => {
      // The item's own price is BELOW its sale price, while the sku's price is above it. If the
      // gate consulted the item, this would seed nothing.
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-item-price-differs',
          sku: makeSkuWithSalePrice('item-price-', '10.00', '9.00', salePromotionID),
          quantity: 2,
          price: '1.00',
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L148, L150]: both the gate and the
      // arithmetic read `orderItem.getSku().getPrice()`. `orderItem.getPrice()` - which may be a
      // price-group price - is read by the REWARD path at
      // [model/service/PromotionService.cfc:L244], never here.
      expect(describeAccumulator(accumulator)).toStrictEqual({
        'oi-item-price-differs': [`|${salePromotionID}|2`],
      });
      expect(itemAt(order, 0).price.toDecimalString()).toBe('1');
      expect(itemAt(order, 0).sku.getPrice().toDecimalString()).toBe('10');
    });
  });

  describe('L150 multiplies TWICE and subtracts ONCE, and is never algebraically simplified', () => {
    it('★ takes two extended amounts and subtracts them, not one delta scaled by quantity', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-shape',
          sku: makeSkuWithSalePrice('shape-', '0.07', '0.01', salePromotionID),
          quantity: 3,
        },
      ]);

      // Counting the value object's own operations is what makes the SHAPE of the expression
      // observable rather than merely readable. Installed after the fixtures are built, so only
      // the subject's arithmetic is counted.
      const multiplicationSpy = vi.spyOn(Money.prototype, 'times');
      const subtractionSpy = vi.spyOn(Money.prototype, 'minus');

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L150]: the source expression is
      // '(orderItem.getSku().getPrice() * orderItem.getQuantity()) - (salePriceDetails.salePrice *
      // orderItem.getQuantity())' - two multiplications by the same quantity.
      expect(multiplicationSpy.mock.calls).toStrictEqual([[3], [3]]);
      expect(subtractionSpy.mock.calls.length).toBe(1);

      const subtractionCall: readonly [subtrahend: Money | string] | undefined =
        subtractionSpy.mock.calls[0];

      if (subtractionCall === undefined) {
        throw new Error('this test scenario recorded no subtraction to inspect');
      }

      const subtrahend: Money | string = subtractionCall[0];

      if (!(subtrahend instanceof Money)) {
        throw new Error('this test scenario expected the subtrahend to be a monetary value');
      }

      // 0.01 x 3 - the extended SALE amount. Under the simplified form this would be 0.06, the
      // unit delta, and that single figure is the difference between the two implementations.
      expect(subtrahend.toDecimalString()).toBe('0.03');

      // CFML parity [model/entity/OrderItem.cfc:L56]: the quantity column is `ormtype="integer"`,
      // so the quantity is a COUNT and never money. It enters the arithmetic as a plain multiplier
      // and is never wrapped in the value object.
      for (const multiplicationCall of multiplicationSpy.mock.calls) {
        expect(typeof multiplicationCall[0]).toBe('number');
      }
    });

    it('pins the exact decimal result where binary floating point would drift', async () => {
      // Both cases are chosen because IEEE-754 double arithmetic gets them wrong in the fifteenth
      // significant digit, and either formulation of the expression drifts differently.
      const cases: readonly {
        readonly label: string;
        readonly skuPrice: string;
        readonly salePrice: string;
        readonly quantity: number;
        readonly expected: string;
      }[] = [
        // (19.99 x 3) - (19.98 x 3): 59.97 - 59.94. As doubles the difference lands near
        // 0.029999999999994, and the persisted `big_decimal` would carry that noise forward.
        {
          label: 'oi-drift-a',
          skuPrice: '19.99',
          salePrice: '19.98',
          quantity: 3,
          expected: '0.03',
        },
        // (0.07 x 3) - (0.01 x 3): 0.21 - 0.03, where 0.07 x 3 is itself inexact as a double.
        { label: 'oi-drift-b', skuPrice: '0.07', salePrice: '0.01', quantity: 3, expected: '0.18' },
      ];

      expect(cases.length).toBe(2);

      for (const testCase of cases) {
        const caseAccumulator: OrderItemQualifiedDiscounts = {};
        const order: OrderView = makeOrderWithItems([
          {
            orderItemID: testCase.label,
            sku: makeSkuWithSalePrice(
              `${testCase.label}-`,
              testCase.skuPrice,
              testCase.salePrice,
              salePromotionID,
            ),
            quantity: testCase.quantity,
          },
        ]);

        await seeder.seedSalePriceDiscounts(order, caseAccumulator);

        const record: QualifiedDiscount = recordAt(bucketOf(caseAccumulator, testCase.label), 0);

        expect(record.discountAmount.toDecimalString()).toBe(testCase.expected);
        expect(record.discountAmount.equals(Money.fromDecimalString(testCase.expected))).toBe(true);
      }
    });
  });

  describe('L152 assigns a FRESH array UNCONDITIONALLY, and the asymmetry is preserved', () => {
    it('discards whatever the accumulator slot already held for that order item', async () => {
      const orderItemID = 'oi-preoccupied';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('preoccupied-', '10.00', '4.00', salePromotionID),
          quantity: 2,
        },
      ]);

      // A record already sitting in the slot, carrying a REAL reward identifier and a large
      // amount, so its disappearance is unmistakable.
      const preExisting: QualifiedDiscount = makeRewardDiscountRecord(
        'reward-that-was-already-here',
        Money.fromDecimalString('999.00'),
        salePromotion,
      );

      accumulator[orderItemID] = [preExisting];

      const preExistingBucket: QualifiedDiscount[] = bucketOf(accumulator, orderItemID);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L152]: the assignment is
      // `orderItemQulifiedDiscounts[ orderItem.getOrderItemID() ] = [];` with no `structKeyExists`
      // guard of any kind. Whatever the slot held is gone.
      //
      // And the asymmetry with the reward path must not be normalised.
      const bucket: QualifiedDiscount[] = bucketOf(accumulator, orderItemID);

      expect(describeBucket(bucket)).toStrictEqual([`|${salePromotionID}|12`]);
      expect(bucket.length).toBe(1);
      expect(bucket).not.toContain(preExisting);

      // A genuinely NEW array, not the pre-existing one emptied and refilled. The distinction is
      // observable, because a holder of the old array keeps seeing the old contents.
      expect(bucket).not.toBe(preExistingBucket);

      // The projector renders the CANONICAL decimal, and the value object drops trailing zeros in
      // that rendering: `999.00` is stored and reads back as `999`.
      expect(describeBucket(preExistingBucket)).toStrictEqual([
        `reward-that-was-already-here|${salePromotionID}|999`,
      ]);
    });

    it('creates a key ONLY for items that pass the gate, never a pre-seeded empty bucket', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-qualifies',
          sku: makeSkuWithSalePrice('qualifies-', '10.00', '9.00', salePromotionID),
          quantity: 1,
        },
        {
          orderItemID: 'oi-does-not-qualify',
          sku: makeSkuWithSalePrice('does-not-', '10.00', '10.00', salePromotionID),
          quantity: 1,
        },
        {
          orderItemID: 'oi-has-no-row',
          sku: makeSkuWithoutSalePrice('has-no-row-', '10.00'),
          quantity: 1,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L152]: the assignment sits INSIDE the L148
      // gate, so a non-qualifying item gets no key rather than an empty array.
      expect(Object.keys(accumulator)).toStrictEqual(['oi-qualifies']);
      expect(structKeyExists(accumulator, 'oi-does-not-qualify')).toBe(false);
      expect(structKeyExists(accumulator, 'oi-has-no-row')).toBe(false);
      expect(order.orderItems.length).toBe(3);
    });

    it('stores the array BEFORE the promotion resolves, so a pending bucket is empty', async () => {
      const orderItemID = 'oi-deferred';
      const deferringResolver = new DeferringPromotionResolver();
      const deferringSeeder = new SalePriceSeeder(deferringResolver);
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('deferred-', '10.00', '6.00', salePromotionID),
          quantity: 2,
        },
      ]);

      const pending: Promise<void> = deferringSeeder.seedSalePriceDiscounts(order, accumulator);

      // One microtask is enough to carry the pass as far as its first suspension point, which is
      // the awaited resolution.
      await Promise.resolve();

      // CFML parity [model/service/PromotionService.cfc:L152 versus L155-L159]: legacy completes
      // the array assignment on L152 before it evaluates the record literal that begins on L155.
      expect(deferringResolver.getPromotionCalls).toStrictEqual([salePromotionID]);
      expect(describeAccumulator(accumulator)).toStrictEqual({ [orderItemID]: [] });

      deferringResolver.settleAll(salePromotion);
      await pending;

      // And the AWAITED result is what lands in the record. (10.00 x 2) - (6.00 x 2) =.
      expect(describeAccumulator(accumulator)).toStrictEqual({
        [orderItemID]: [`|${salePromotionID}|8`],
      });
      expect(recordAt(bucketOf(accumulator, orderItemID), 0).promotion).toBe(salePromotion);
    });

    it('writes the key as an OWN property, so an item identified as the prototype key survives', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: PROTOTYPE_KEY_ORDER_ITEM_ID,
          sku: makeSkuWithSalePrice('proto-', '10.00', '3.00', salePromotionID),
          quantity: 1,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L152]: a CFML struct has no prototype
      // chain and no reserved key names, so the legacy assignment stored this order item's array
      // like any other.
      expect(Object.hasOwn(accumulator, PROTOTYPE_KEY_ORDER_ITEM_ID)).toBe(true);
      expect(Object.getOwnPropertyNames(accumulator)).toStrictEqual([PROTOTYPE_KEY_ORDER_ITEM_ID]);
      expect(describeBucket(bucketOf(accumulator, PROTOTYPE_KEY_ORDER_ITEM_ID))).toStrictEqual([
        `|${salePromotionID}|7`,
      ]);

      const descriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(
        accumulator,
        PROTOTYPE_KEY_ORDER_ITEM_ID,
      );

      if (descriptor === undefined) {
        throw new Error('this test scenario produced no own property to inspect');
      }
      expect(descriptor.enumerable).toBe(true);
      expect(descriptor.writable).toBe(true);
      expect(descriptor.configurable).toBe(true);
    });
  });

  describe('the seeded record carries EXACTLY three members, though the docblock promises five', () => {
    it('is the three published members and nothing else', async () => {
      const orderItemID = 'oi-three-members';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('three-', '19.99', '19.98', salePromotionID),
          quantity: 3,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      const record: QualifiedDiscount = recordAt(bucketOf(accumulator, orderItemID), 0);

      // CFML parity [model/service/PromotionService.cfc:L155-L159]: the record literal has three
      // entries - `promotionRewardID`, `promotion` and `discountAmount`.
      expect(memberNamesOf(record)).toStrictEqual(QUALIFIED_DISCOUNT_MEMBERS);
      expect(record).toStrictEqual({
        promotionRewardID: '',
        promotion: salePromotion,
        discountAmount: Money.fromDecimalString('0.03'),
      });

      // LEGACY-NOTE [model/service/PromotionService.cfc:L127-L128]: `discountQuantity` and
      // `discountPerUseValue` are PHANTOM KEYS - promised by the illustrative docblock above the
      // function and written by no construction site anywhere in the accumulator.
      for (const phantomMember of PHANTOM_DOCBLOCK_MEMBERS) {
        expect(structKeyExists(record, phantomMember)).toBe(false);
      }

      expect(PHANTOM_DOCBLOCK_MEMBERS.length).toBe(2);
    });

    it('carries the discount as a Money whose slot is deliberately MUTABLE', async () => {
      const orderItemID = 'oi-mutable-slot';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('mutable-', '10.00', '2.50', salePromotionID),
          quantity: 4,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      const record: QualifiedDiscount = recordAt(bucketOf(accumulator, orderItemID), 0);

      expect(record.discountAmount).toBeInstanceOf(Money);
      expect(record.discountAmount.toDecimalString()).toBe('30');
      record.discountAmount = Money.fromDecimalString('7.50');

      const rewritten: Money = recordAt(bucketOf(accumulator, orderItemID), 0).discountAmount;

      // Compared by monetary value, not by rendered text: the value object canonicalises `7.50` to
      // `7.5`, and `toFixed2()` is the separate presentation surface.
      expect(rewritten.equals(Money.fromDecimalString('7.50'))).toBe(true);
      expect(rewritten.toFixed2()).toBe('7.50');
    });
  });

  describe('the empty-string promotionRewardID is a SENTINEL that confers stripping immunity', () => {
    it('★★★ is the LITERAL empty string, present as an own member, never a substitute for it', async () => {
      const orderItemID = 'oi-sentinel';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('sentinel-', '10.00', '9.00', salePromotionID),
          quantity: 1,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      const record: QualifiedDiscount = recordAt(bucketOf(accumulator, orderItemID), 0);

      // CFML parity [model/service/PromotionService.cfc:L156]: `promotionRewardID = ""`. Read as a
      // placeholder this looks like a field nobody bothered to fill in.
      //
      // A sale price is a property of the sku, not a promotion entitlement drawn against a use
      // limit, so it is right that no limit can revoke it.
      expect(record.promotionRewardID).toBe('');
      expect(typeof record.promotionRewardID).toBe('string');
      expect(record.promotionRewardID.length).toBe(0);

      // Present as an own member holding the empty string - not omitted, and not present holding
      // something absent-shaped.
      expect(Object.hasOwn(record, 'promotionRewardID')).toBe(true);
      expect(structKeyExists(record, 'promotionRewardID')).toBe(true);
      expect(record.promotionRewardID).not.toBeUndefined();
      expect(record.promotionRewardID).not.toBeNull();
      expect(typeof record.promotionRewardID).not.toBe('symbol');
      expect(typeof record.promotionRewardID).not.toBe('object');
    });

    it('is unreachable by every real reward identifier the promotion graph can produce', async () => {
      const orderItemID = 'oi-unreachable';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('unreachable-', '10.00', '8.00', salePromotionID),
          quantity: 1,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      const record: QualifiedDiscount = recordAt(bucketOf(accumulator, orderItemID), 0);
      const rewardIdentifiers: readonly string[] = [
        ...promotionGraph.promotionRewards.map((reward) => reward.getPromotionRewardID()),
        promotionGraph.overusedRewardID,
        promotionGraph.leakedRewardID,
      ];

      // Guards the loop below against passing vacuously, which is exactly how the legacy
      // `issue_1296` case at [meta/tests/unit/IssuesTest.cfc:L73-L89] manages to pass while
      // asserting nothing.
      expect(rewardIdentifiers.length).toBeGreaterThan(0);
      expect(rewardIdentifiers).not.toContain('');

      for (const rewardIdentifier of rewardIdentifiers) {
        expect(rewardIdentifier.length).toBeGreaterThan(0);
        expect(record.promotionRewardID).not.toBe(rewardIdentifier);
      }

      // LEGACY-NOTE [model/service/PromotionService.cfc:L1033-L1036]: the same `""` sentinel idiom
      // appears again in the shipping-discount details struct,
      // `var details = { promotionID="", discountAmount=0 }`, whose winner is captured at
      // [model/service/PromotionService.cfc:L1073-L1075].
      expect(record.promotion.getPromotionID()).toBe(salePromotionID);
    });
  });

  describe('the seeded entry holds position 1 until a STRICTLY LARGER reward discount displaces it', () => {
    it('★ is not displaced by an EQUAL reward discount', async () => {
      const orderItemID = 'oi-incumbent-equal';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('incumbent-equal-', '10.00', '6.00', salePromotionID),
          quantity: 1,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      const bucket: QualifiedDiscount[] = bucketOf(accumulator, orderItemID);
      const incumbent: QualifiedDiscount = recordAt(bucket, 0);

      // Seeding leaves the sale-price entry at position 1 - CFML's `[1]`, this language's `[0]` -
      // because it is the only entry there is.
      expect(incumbent.promotionRewardID).toBe('');
      expect(incumbent.discountAmount.toDecimalString()).toBe('4');
      expect(bucket.length).toBe(1);

      const equalRewardDiscount: QualifiedDiscount = makeRewardDiscountRecord(
        promotionGraph.leakedRewardID,
        Money.fromDecimalString('4.00'),
        salePromotion,
      );

      // CFML parity [model/service/PromotionService.cfc:L271]: the facade's descending insertion
      // sort tests `orderItemQulifiedDiscounts[...][d].discountAmount < discountAmount` - a STRICT
      // `<`.
      //
      // LEGACY-NOTE: the sort is FACADE-owned and is asserted by `../promotionService.test.ts`.
      // What is reproduced here is the predicate's verdict on a seeded incumbent and the resulting
      // order, because that verdict is the seeding pass's own ordering consequence.
      expect(incumbent.discountAmount.isLessThan(equalRewardDiscount.discountAmount)).toBe(false);
      expect(incumbent.discountAmount.compare(equalRewardDiscount.discountAmount)).toBe(0);

      bucket.push(equalRewardDiscount);

      expect(describeBucket(bucket)).toStrictEqual([
        `|${salePromotionID}|4`,
        `${promotionGraph.leakedRewardID}|${salePromotionID}|4`,
      ]);
      expect(recordAt(bucket, 0)).toBe(incumbent);
      expect(recordAt(bucket, 0).promotionRewardID).toBe('');
    });

    it('IS displaced by a strictly larger reward discount', async () => {
      const orderItemID = 'oi-incumbent-larger';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('incumbent-larger-', '10.00', '6.00', salePromotionID),
          quantity: 1,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      const bucket: QualifiedDiscount[] = bucketOf(accumulator, orderItemID);
      const incumbent: QualifiedDiscount = recordAt(bucket, 0);
      const largerRewardDiscount: QualifiedDiscount = makeRewardDiscountRecord(
        promotionGraph.leakedRewardID,
        Money.fromDecimalString('4.01'),
        salePromotion,
      );

      // One cent more is enough: the strict test passes, so the candidate is inserted before the
      // incumbent and the seeded entry drops to position 2, where nothing reads it.
      expect(incumbent.discountAmount.isLessThan(largerRewardDiscount.discountAmount)).toBe(true);

      bucket.splice(0, 0, largerRewardDiscount);

      expect(describeBucket(bucket)).toStrictEqual([
        `${promotionGraph.leakedRewardID}|${salePromotionID}|4.01`,
        `|${salePromotionID}|4`,
      ]);
      expect(recordAt(bucket, 1)).toBe(incumbent);
    });
  });

  describe('nothing is sorted, rounded, quantized or clamped by this pass', () => {
    it('retains full decimal precision and applies no two-place quantization', async () => {
      const orderItemID = 'oi-full-precision';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('full-precision-', '10.0001', '5.00005', salePromotionID),
          quantity: 3,
        },
      ]);

      const presentationSpy = vi.spyOn(Money.prototype, 'toFixed2');

      await seeder.seedSalePriceDiscounts(order, accumulator);

      const record: QualifiedDiscount = recordAt(bucketOf(accumulator, orderItemID), 0);

      // (10.0001 x 3) - (5.00005 x 3) = 30.0003 - 15.00015 = 15.00015, carried at FULL precision.
      //
      // CFML parity [model/service/PromotionService.cfc:L150]: the seeded amount is the raw
      // `precisionEvaluate` result.
      expect(record.discountAmount.toDecimalString()).toBe('15.00015');
      expect(record.discountAmount.equals(Money.fromDecimalString('15.00015'))).toBe(true);
      expect(record.discountAmount.toFixed2()).toBe('15.00');
      expect(record.discountAmount.equals(Money.fromDecimalString('15.00'))).toBe(false);

      // The subject itself performed no presentation call; the only recorded one is the
      // assertion's own, three lines above.
      expect(presentationSpy.mock.calls.length).toBe(1);
    });

    it('consults no rounding collaborator, because it holds none', async () => {
      const orderItemID = 'oi-no-rounding';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('no-rounding-', '9.99', '3.33', salePromotionID),
          quantity: 7,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // The shipped class takes exactly one constructor parameter, the promotion resolver, so
      // there is no rounding rule service to reach and no `roundingRuleID` to honour.
      expect(SalePriceSeeder.length).toBe(1);
      expect(recordAt(bucketOf(accumulator, orderItemID), 0).discountAmount.toDecimalString()).toBe(
        '46.62',
      );

      // The single collaborator was consulted only for the promotion, once.
      expect(resolver.getPromotionCalls).toStrictEqual([salePromotionID]);
    });

    it('applies no clamp, so a seeded discount may exceed the order item extended price', async () => {
      const orderItemID = 'oi-unclamped';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('unclamped-', '100.00', '1.00', salePromotionID),
          quantity: 2,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      const record: QualifiedDiscount = recordAt(bucketOf(accumulator, orderItemID), 0);

      // (100.00 x 2) - (1.00 x 2) = 198, against an order item whose own extended price is far
      // smaller, because the gate compares against the SKU price and the arithmetic uses it too.
      //
      // CFML parity [model/service/PromotionService.cfc:L150]: there is no bound of any kind on
      // this line. The bidirectional clamp lives on the REWARD path, in `getDiscountAmount` at
      // [model/service/PromotionService.cfc:L1013-L1015], and is AAP defect 14, owned by
      // `discountAmount.test.ts`.
      expect(record.discountAmount.toDecimalString()).toBe('198');
      expect(record.discountAmount.isGreaterThan(itemAt(order, 0).extendedPrice)).toBe(true);
    });

    it('keys buckets in ORDER-ITEM order, never in discount order', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-first-and-smaller',
          sku: makeSkuWithSalePrice('first-smaller-', '10.00', '9.00', salePromotionID),
          quantity: 1,
        },
        {
          orderItemID: 'oi-second-and-larger',
          sku: makeSkuWithSalePrice('second-larger-', '10.00', '1.00', salePromotionID),
          quantity: 1,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L145]: the pass walks
      // `arguments.order.getOrderItems()` in the collection's own order and writes each key as it
      // goes.
      expect(Object.keys(accumulator)).toStrictEqual([
        'oi-first-and-smaller',
        'oi-second-and-larger',
      ]);
      expect(describeAccumulator(accumulator)).toStrictEqual({
        'oi-first-and-smaller': [`|${salePromotionID}|1`],
        'oi-second-and-larger': [`|${salePromotionID}|9`],
      });
    });
  });

  describe('the promotion resolution the pass awaits', () => {
    it('is asked for the sale-price row identifier verbatim, once per qualifying row', async () => {
      const awkwardPromotionID = 'PROMO/9f3b Sale.2024';
      const awkwardPromotion: Promotion = makePromotionFixtures({ idPrefix: 'awkward-' }).promotion;
      const awkwardResolver = new RecordingPromotionResolver([
        [awkwardPromotionID, awkwardPromotion],
      ]);
      const awkwardSeeder = new SalePriceSeeder(awkwardResolver);
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-awkward-identifier',
          sku: makeSkuWithSalePrice('awkward-id-', '10.00', '5.00', awkwardPromotionID),
          quantity: 1,
        },
      ]);

      await awkwardSeeder.seedSalePriceDiscounts(order, accumulator);

      // CFML parity [model/service/PromotionService.cfc:L157]: the argument is
      // `salePriceDetails.promotionID`, passed through untouched - not trimmed, cased, encoded or
      // validated. The identifier is opaque to this pass.
      expect(awkwardResolver.getPromotionCalls).toStrictEqual([awkwardPromotionID]);

      // And the AWAITED result is what lands in the record - the reason the method is asynchronous
      // at all, since the promotion is fetched rather than already materialised on the row.
      const record: QualifiedDiscount = recordAt(bucketOf(accumulator, 'oi-awkward-identifier'), 0);

      expect(record.promotion).toBe(awkwardPromotion);
      expect(record.promotion).not.toBe(salePromotion);
    });

    it('resolves each distinct identifier once within a pass and reuses the same instance', async () => {
      const secondPromotion: Promotion = makePromotionFixtures({ idPrefix: 'second-' }).promotion;
      const secondPromotionID: string = secondPromotion.getPromotionID();
      const twoPromotionResolver = new RecordingPromotionResolver([
        [salePromotionID, salePromotion],
        [secondPromotionID, secondPromotion],
      ]);
      const twoPromotionSeeder = new SalePriceSeeder(twoPromotionResolver);
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-shared-promotion-a',
          sku: makeSkuWithSalePrice('shared-a-', '10.00', '9.00', salePromotionID),
          quantity: 1,
        },
        {
          orderItemID: 'oi-shared-promotion-b',
          sku: makeSkuWithSalePrice('shared-b-', '10.00', '8.00', salePromotionID),
          quantity: 1,
        },
        {
          orderItemID: 'oi-other-promotion',
          sku: makeSkuWithSalePrice('other-', '10.00', '7.00', secondPromotionID),
          quantity: 1,
        },
      ]);

      await twoPromotionSeeder.seedSalePriceDiscounts(order, accumulator);

      expect(secondPromotionID).not.toBe(salePromotionID);

      // Two order items sharing one promotion produce one resolution, and the distinct one
      // produces its own.
      expect(twoPromotionResolver.getPromotionCalls).toStrictEqual([
        salePromotionID,
        secondPromotionID,
      ]);

      const sharedA: QualifiedDiscount = recordAt(
        bucketOf(accumulator, 'oi-shared-promotion-a'),
        0,
      );
      const sharedB: QualifiedDiscount = recordAt(
        bucketOf(accumulator, 'oi-shared-promotion-b'),
        0,
      );
      const other: QualifiedDiscount = recordAt(bucketOf(accumulator, 'oi-other-promotion'), 0);

      expect(sharedA.promotion).toBe(salePromotion);
      expect(sharedB.promotion).toBe(salePromotion);
      expect(sharedB.promotion).toBe(sharedA.promotion);
      expect(other.promotion).toBe(secondPromotion);
      expect(other.promotion).not.toBe(sharedA.promotion);
    });

    it('is not consulted at all when no order item passes the gate', async () => {
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-equal-price',
          sku: makeSkuWithSalePrice('gate-equal-', '10.00', '10.00', salePromotionID),
          quantity: 1,
        },
        {
          orderItemID: 'oi-higher-price',
          sku: makeSkuWithSalePrice('gate-higher-', '10.00', '11.00', salePromotionID),
          quantity: 1,
        },
        {
          orderItemID: 'oi-absent-row',
          sku: makeSkuWithoutSalePrice('gate-absent-', '10.00'),
          quantity: 1,
        },
      ]);

      await seeder.seedSalePriceDiscounts(order, accumulator);

      expect(resolver.getPromotionCalls).toStrictEqual([]);
      expect(describeAccumulator(accumulator)).toStrictEqual({});
    });
  });

  describe('A2 - the pass holds no state across invocations', () => {
    it('does not let one seeding run reach another run accumulator', async () => {
      const firstAccumulator: OrderItemQualifiedDiscounts = {};
      const secondAccumulator: OrderItemQualifiedDiscounts = {};
      const firstOrder: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-run-one',
          sku: makeSkuWithSalePrice('run-one-', '10.00', '9.00', salePromotionID),
          quantity: 1,
        },
      ]);
      const secondOrder: OrderView = makeOrderWithItems([
        {
          orderItemID: 'oi-run-two',
          sku: makeSkuWithSalePrice('run-two-', '10.00', '4.00', salePromotionID),
          quantity: 1,
        },
      ]);

      await seeder.seedSalePriceDiscounts(firstOrder, firstAccumulator);
      await seeder.seedSalePriceDiscounts(secondOrder, secondAccumulator);

      // Each run wrote only into the structure it was handed.
      expect(describeAccumulator(firstAccumulator)).toStrictEqual({
        'oi-run-one': [`|${salePromotionID}|1`],
      });
      expect(describeAccumulator(secondAccumulator)).toStrictEqual({
        'oi-run-two': [`|${salePromotionID}|6`],
      });
      expect(structKeyExists(firstAccumulator, 'oi-run-two')).toBe(false);
      expect(structKeyExists(secondAccumulator, 'oi-run-one')).toBe(false);

      // The invocation-local identity map is what makes the second run resolve again rather than
      // answer from the first run - one call per run, two in total.
      expect(resolver.getPromotionCalls).toStrictEqual([salePromotionID, salePromotionID]);
    });

    it('leaves the order view it was handed unmodified', async () => {
      const orderItemID = 'oi-read-only-input';
      const order: OrderView = makeOrderWithItems([
        {
          orderItemID,
          sku: makeSkuWithSalePrice('read-only-', '10.00', '2.00', salePromotionID),
          quantity: 5,
        },
      ]);
      const itemsBefore: string[] = order.orderItems.map(
        (item) =>
          `${item.orderItemID}|${String(item.quantity)}|${item.price.toDecimalString()}|` +
          `${item.sku.getPrice().toDecimalString()}`,
      );

      await seeder.seedSalePriceDiscounts(order, accumulator);
      expect(
        order.orderItems.map(
          (item) =>
            `${item.orderItemID}|${String(item.quantity)}|${item.price.toDecimalString()}|` +
            `${item.sku.getPrice().toDecimalString()}`,
        ),
      ).toStrictEqual(itemsBefore);
      expect(order.appliedPromotions).toStrictEqual([]);
      expect(Object.isFrozen(itemAt(order, 0))).toBe(true);
      expect(recordAt(bucketOf(accumulator, orderItemID), 0).discountAmount.toDecimalString()).toBe(
        '40',
      );
    });
  });
});
