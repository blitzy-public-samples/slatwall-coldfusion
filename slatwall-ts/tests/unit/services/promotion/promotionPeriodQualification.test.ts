// slatwall-ts - characterization suite pinning
// `src/services/promotion/promotionPeriodQualification.ts`
//
// `meta/tests/unit/service/` holds exactly four components - `AccountServiceTest.cfc`,
// `HibachiServiceTest.cfc`, `PaymentServiceTest.cfc` and `UtilityRBServiceTest.cfc`.
//
// Both orphans fall outside every other decomposition module's cited range, so the shipped module
// hosts all three.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L549, L752, L783]: the shipped module names its
// first parameter `promotionPeriod`, not `period`, because the legacy declares
// `required any promotionPeriod` at all three sites.

import { beforeEach, describe, expect, it } from 'vitest';

import { Brand } from '../../../../src/domain/entities/brand.js';
import { Product } from '../../../../src/domain/entities/product.js';
import { ProductType } from '../../../../src/domain/entities/productType.js';
import { PromotionPeriod } from '../../../../src/domain/entities/promotionPeriod.js';
import { PromotionQualifier } from '../../../../src/domain/entities/promotionQualifier.js';
import { listFindNoCase, listLen, listToArray } from '../../../../src/lib/cfml/list.js';
import { isNullish } from '../../../../src/lib/cfml/truthiness.js';
import { OrderItemMembership } from '../../../../src/services/promotion/orderItemMembership.js';
import { PromotionPeriodQualificationEvaluator } from '../../../../src/services/promotion/promotionPeriodQualification.js';
import { QualifierQualificationEvaluator } from '../../../../src/services/promotion/qualifierQualification.js';
import { makeOrderViewFixture } from '../../../fixtures/orderViewFixtures.js';

import type { RewardMatchingType } from '../../../../src/domain/entities/promotionQualifier.js';
import type { Sku } from '../../../../src/domain/entities/sku.js';
import type { PromotionRepository } from '../../../../src/domain/ports/promotionRepository.js';
import type {
  PeriodQualification,
  QualifierQualification,
} from '../../../../src/domain/promotionEngine/qualificationTypes.js';
import type { OrderFulfillmentView } from '../../../../src/domain/views/orderFulfillmentView.js';
import type { OrderItemView } from '../../../../src/domain/views/orderItemView.js';
import type { OrderView } from '../../../../src/domain/views/orderView.js';

// Explicit UTC ISO-8601 literals.

const NOW_UTC = '2024-06-15T12:00:00.000Z';
const PERIOD_START_UTC = '2024-06-01T00:00:00.000Z';
const PERIOD_END_UTC = '2024-07-01T00:00:00.000Z';
const CREATED_DATE_TIME_UTC = '2024-05-01T08:30:00.000Z';
const MODIFIED_DATE_TIME_UTC = '2024-05-15T09:45:00.000Z';

/**
 * A deterministic clock handing back a fresh instance of the same fixed instant.
 */
function fixedNow(): Date {
  return new Date(NOW_UTC);
}

// The golden order's identifiers, as the fixture composes them.

const SHIPPING_FULFILLMENT_ID = 'of-shipping-1';
const PICKUP_FULFILLMENT_ID = 'of-pickup-1';

/**
 * `of-shipping-1` carries this weight; `of-pickup-1` carries `0`. Plain WEIGHT, never money.
 */
const SHIPPING_TOTAL_WEIGHT = 12.5;
const PICKUP_TOTAL_WEIGHT = 0;

/**
 * 3 + 2 + 4 over the three golden `oitSale` items [model/entity/Order.cfc:L624]. A plain COUNT.
 */
const GOLDEN_TOTAL_SALE_QUANTITY = 9;
const GOLDEN_ITEM_QUANTITIES: readonly number[] = [3, 2, 4];

// The repository port double.
//
// JUDGMENT CALL: declared inline in this file as an OBJECT LITERAL annotated with the published
// port type, so every member is contextually typed and no parameter annotation and no unsafe
// escape hatch is needed anywhere.

/**
 * Which of the two reached members was called, and with what.
 */
interface RecordedUseCountCall {
  readonly member: 'getPromotionPeriodUseCount' | 'getPromotionPeriodAccountUseCount';
  readonly promotionPeriodID: string;
  readonly accountID: string | undefined;
}

/**
 * The counts the double answers. Both default to `0`, i.e. "never used".
 */
interface UseCountProgram {
  readonly periodUseCount?: number;
  readonly periodAccountUseCount?: number;
}

interface PromotionRepositoryDouble {
  readonly repository: PromotionRepository;
  readonly calls: readonly RecordedUseCountCall[];
}

function unreachedPortMember(member: string): never {
  throw new Error(
    `PromotionRepository.${member} is not reached by ` +
      'getPromotionPeriodQualificationDetails; the only two repository interactions in ' +
      'model/service/PromotionService.cfc:L549-L627 are getPromotionPeriodUseCount at L567 ' +
      'and getPromotionPeriodAccountUseCount at L576.',
  );
}

function createPromotionRepositoryDouble(program: UseCountProgram = {}): PromotionRepositoryDouble {
  const calls: RecordedUseCountCall[] = [];
  const periodUseCount = program.periodUseCount ?? 0;
  const periodAccountUseCount = program.periodAccountUseCount ?? 0;

  const repository: PromotionRepository = {
    getPromotionPeriodUseCount: (promotionPeriod) => {
      calls.push({
        member: 'getPromotionPeriodUseCount',
        promotionPeriodID: promotionPeriod.getPromotionPeriodID(),
        accountID: undefined,
      });
      return Promise.resolve(periodUseCount);
    },

    getPromotionPeriodAccountUseCount: (promotionPeriod, accountID) => {
      calls.push({
        member: 'getPromotionPeriodAccountUseCount',
        promotionPeriodID: promotionPeriod.getPromotionPeriodID(),
        accountID,
      });
      return Promise.resolve(periodAccountUseCount);
    },

    getActivePromotionRewards: () => unreachedPortMember('getActivePromotionRewards'),
    getPromotionCodeUseCount: () => unreachedPortMember('getPromotionCodeUseCount'),
    getPromotionCodeAccountUseCount: () => unreachedPortMember('getPromotionCodeAccountUseCount'),
    getSalePricePromotionRewardsQuery: () =>
      unreachedPortMember('getSalePricePromotionRewardsQuery'),
    getRoundingRuleQuery: () => unreachedPortMember('getRoundingRuleQuery'),
  };

  return { repository, calls };
}

// The two sibling collaborators.
//
// JUDGMENT CALL, stated as the brief requires. `OrderItemMembership` is used as the REAL shipped
// class everywhere below: it declares zero constructor dependencies and is stateless, so a double
// would add indirection and prove less.
//
// JUDGMENT CALL: the double is a SUBCLASS rather than an object literal because
// `QualifierQualificationEvaluator` carries private fields, which makes the class nominally typed
// a structurally identical literal is not assignable to it.

/**
 * The address-zone port, derived from the SHIPPED constructor rather than imported separately, so
 * this suite adds no dependency of its own and cannot drift from the collaborator's real first
 * parameter.
 */
type AddressZoneEvaluatorPort = ConstructorParameters<typeof QualifierQualificationEvaluator>[0];

/**
 * An address-zone evaluator that raises if consulted.
 *
 * Every configuration used below is chosen so the zone path is unreachable - the `order` arm never
 * consults zones at all, and the fulfillment configurations here declare no
 * `shippingAddressZoneIDs`.
 */
function createUnreachedAddressZoneEvaluator(): AddressZoneEvaluatorPort {
  return {
    isAddressInZone: () => {
      throw new Error(
        'AddressZoneEvaluator.isAddressInZone is not reached by any configuration in this ' +
          'suite; model/service/PromotionService.cfc:L684 is only reached when a qualifier ' +
          'configures shipping address zones.',
      );
    },
  };
}

/**
 * What a programmed qualifier verdict answers.
 */
interface QualifierVerdictProgram {
  /**
   * [model/service/PromotionService.cfc:L593] gates on this being greater than zero.
   */
  readonly qualificationCount: number;
  /**
   * [model/service/PromotionService.cfc:L599] reads these when the qualifier is a fulfillment one.
   */
  readonly qualifiedFulfillmentIDs?: readonly string[];
}

/**
 * A recording, programmable stand-in for the qualifier-level evaluator.
 *
 * It answers a verdict per `promotionQualifierID` and records every invocation, so a test can
 * prove both what the PRIMARY function did with a verdict and that a qualifier was - or was not.
 */
class RecordingQualifierQualificationEvaluator extends QualifierQualificationEvaluator {
  private readonly verdicts = new Map<string, QualifierQualification>();

  private readonly visitedQualifierIDs: string[] = [];

  private readonly visitedOrderIDs: string[] = [];

  /**
   * The qualifier IDs the subject asked about, in invocation order.
   */
  public get visited(): readonly string[] {
    return this.visitedQualifierIDs;
  }

  /**
   * The order IDs the subject passed through, in invocation order.
   */
  public get visitedOrders(): readonly string[] {
    return this.visitedOrderIDs;
  }

  /**
   * Registers the verdict this double will answer for one qualifier, and returns the exact object
   * it will hand back so a test can assert wholesale attachment by identity
   * [model/service/PromotionService.cfc:L609].
   */
  public program(
    qualifier: PromotionQualifier,
    program: QualifierVerdictProgram,
  ): QualifierQualification {
    const verdict: QualifierQualification = {
      qualifier,
      qualificationCount: program.qualificationCount,
      qualifiedFulfillmentIDs: [...(program.qualifiedFulfillmentIDs ?? [])],
      qualifiedOrderItemDetails: [],
    };

    this.verdicts.set(qualifier.getPromotionQualifierID(), verdict);

    return verdict;
  }

  public override getQualifierQualificationDetails(
    qualifier: PromotionQualifier,
    order: OrderView,
  ): QualifierQualification {
    const promotionQualifierID = qualifier.getPromotionQualifierID();

    this.visitedQualifierIDs.push(promotionQualifierID);
    this.visitedOrderIDs.push(order.orderID);

    const verdict = this.verdicts.get(promotionQualifierID);

    if (verdict === undefined) {
      throw new Error(
        `No verdict is programmed for promotionQualifierID '${promotionQualifierID}'. Program ` +
          'every qualifier the subject will reach, so an unvisited qualifier is provable rather ' +
          'than masked by a default.',
      );
    }

    return verdict;
  }
}

// Inline entity construction.
//
// Permitted and intended: the two published factories cover the order view and the promotion
// family, and everything else this suite needs - a period carrying an exact pair of use limits.

/**
 * Only the slots any test below varies; every other column gets an honest fixed value.
 */
interface PromotionPeriodBag {
  readonly promotionPeriodID?: string;
  readonly maximumUseCount?: number | undefined;
  readonly maximumAccountUseCount?: number | undefined;
  readonly promotionQualifiers?: readonly PromotionQualifier[];
}

function makePeriod(bag: PromotionPeriodBag = {}): PromotionPeriod {
  return new PromotionPeriod({
    promotionPeriodID: bag.promotionPeriodID ?? 'period-under-test',
    startDateTime: new Date(PERIOD_START_UTC),
    endDateTime: new Date(PERIOD_END_UTC),
    maximumUseCount: bag.maximumUseCount,
    maximumAccountUseCount: bag.maximumAccountUseCount,
    // The promotion association is absent on purpose: none of the three subjects dereferences it,
    // and the repository double is handed the PERIOD.
    promotion: undefined,
    promotionID: 'promotion-under-test',
    remoteID: undefined,
    createdDateTime: new Date(CREATED_DATE_TIME_UTC),
    createdByAccountID: undefined,
    modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: undefined,
    now: fixedNow,
    promotionQualifiers: [...(bag.promotionQualifiers ?? [])],
  });
}

/**
 * Only the slots any test below varies. Every gate left out stays absent, i.e. "no bound".
 */
interface PromotionQualifierBag {
  readonly promotionQualifierID?: string;
  readonly qualifierType?: string | undefined;
  readonly minimumOrderQuantity?: number | undefined;
  readonly minimumItemQuantity?: number | undefined;
  readonly minimumFulfillmentWeight?: number | undefined;
  readonly maximumFulfillmentWeight?: number | undefined;
  readonly rewardMatchingType?: RewardMatchingType | undefined;
  readonly fulfillmentMethodIDs?: readonly string[] | undefined;
  readonly skus?: readonly Sku[] | undefined;
}

function makeQualifier(bag: PromotionQualifierBag = {}): PromotionQualifier {
  return new PromotionQualifier({
    promotionQualifierID: bag.promotionQualifierID ?? 'qualifier-1',
    qualifierType: bag.qualifierType,
    minimumOrderQuantity: bag.minimumOrderQuantity,
    minimumItemQuantity: bag.minimumItemQuantity,
    minimumFulfillmentWeight: bag.minimumFulfillmentWeight,
    maximumFulfillmentWeight: bag.maximumFulfillmentWeight,
    rewardMatchingType: bag.rewardMatchingType,
    fulfillmentMethodIDs: bag.fulfillmentMethodIDs,
    skus: bag.skus === undefined ? undefined : [...bag.skus],
  });
}

// Under `noUncheckedIndexedAccess` and `strict`, every indexed read and every nullable accessor
// below is captured into a local and narrowed with an explicit check.

function itemAt(order: OrderView, index: number): OrderItemView {
  const orderItem = order.orderItems[index];

  if (orderItem === undefined) {
    throw new Error(
      `The order view has no item at index ${String(index)}; the golden order composes three.`,
    );
  }

  return orderItem;
}

function fulfillmentAt(order: OrderView, index: number): OrderFulfillmentView {
  const orderFulfillment = order.orderFulfillments[index];

  if (orderFulfillment === undefined) {
    throw new Error(
      `The order view has no fulfillment at index ${String(index)}; the golden order composes two.`,
    );
  }

  return orderFulfillment;
}

function fulfillmentIDsOf(order: OrderView): readonly string[] {
  return order.orderFulfillments.map(
    (orderFulfillment: OrderFulfillmentView) => orderFulfillment.orderFulfillmentID,
  );
}

function skusOf(order: OrderView): readonly Sku[] {
  return order.orderItems.map((orderItem: OrderItemView) => orderItem.sku);
}

function productOf(sku: Sku): Product {
  const product = sku.getProduct();

  if (product === undefined) {
    throw new Error(
      `Sku '${sku.getSkuID()}' has no product; the golden order builds one product per item.`,
    );
  }

  return product;
}

function brandIDOf(sku: Sku): string {
  const brand = productOf(sku).getBrand();

  if (brand === undefined) {
    throw new Error(
      `Product '${productOf(sku).getProductID()}' has no brand; the golden products carry one.`,
    );
  }

  return brand.getBrandID();
}

function productTypeIDOf(sku: Sku): string {
  const productType = productOf(sku).getProductType();

  if (productType === undefined) {
    throw new Error(
      `Product '${productOf(sku).getProductID()}' has no product type; the golden products ` +
        'carry a two-level chain.',
    );
  }

  return productType.getProductTypeID();
}

// Giving the identity clauses something to discriminate on.
//
// JUDGMENT CALL: rather than weaken those three assertions to "does not exclude", this helper
// swaps a purpose-built product onto one sku through the entities' own published API -
// `Sku.setProduct`, plus the `Product`, `ProductType` and `Brand` constructors.
interface DistinctProductBag {
  /**
   * Omit to leave the product BRANDLESS, which is what clauses 5 and 6 need.
   */
  readonly withBrand?: boolean;
}

function giveDistinctProduct(sku: Sku, suffix: string, bag: DistinctProductBag = {}): Product {
  const brand: Brand | undefined =
    bag.withBrand === false
      ? undefined
      : new Brand({ brandID: `brand-${suffix}`, brandName: `Brand ${suffix}` });

  const product: Product = new Product({
    productID: `product-${suffix}`,
    productType: new ProductType({ productTypeID: `producttype-${suffix}` }),
    ...(brand === undefined ? {} : { brand }),
  });

  sku.setProduct(product);

  return product;
}

function firstQualifierDetail(record: PeriodQualification): QualifierQualification {
  const detail = record.qualifierDetails[0];

  if (detail === undefined) {
    throw new Error('The qualification record carries no qualifier detail at position 0.');
  }

  return detail;
}

/**
 * The dead field's contents, narrowed.
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L621-L623]: the key is
 * `qualifiedFulfillments`, without the `IDs` suffix the caller reads, and it is optional because
 * [model/service/PromotionService.cfc:L621] writes it only when the local accumulator is
 * non-empty.
 * Preserved deliberately; do not fix without a product decision.
 */
function deadFieldOf(record: PeriodQualification): readonly string[] {
  const qualifiedFulfillments = record.qualifiedFulfillments;

  if (qualifiedFulfillments === undefined) {
    throw new Error(
      'The orphaned qualifiedFulfillments key is absent, so the L621-L623 write did not run.',
    );
  }

  return qualifiedFulfillments;
}

describe('PromotionPeriodQualificationEvaluator', () => {
  // A fresh evaluator, fresh collaborator doubles and a fresh order graph for every single test.
  //
  // No `vi.spyOn` is used anywhere in this file, so no suite-local `afterEach` restoration is
  // needed beyond the global one `tests/setup.ts` registers.

  let orderItemMembership: OrderItemMembership;
  let qualifierEvaluator: RecordingQualifierQualificationEvaluator;
  let repositoryDouble: PromotionRepositoryDouble;
  let evaluator: PromotionPeriodQualificationEvaluator;
  let order: OrderView;

  /**
   * Rebuilds the subject over a repository double programmed with specific counts.
   */
  function armUseCounts(program: UseCountProgram): void {
    repositoryDouble = createPromotionRepositoryDouble(program);
    evaluator = new PromotionPeriodQualificationEvaluator(
      repositoryDouble.repository,
      qualifierEvaluator,
      orderItemMembership,
    );
  }

  /**
   * The subject wired to the REAL qualifier-level evaluator instead of the double.
   */
  function withRealQualifierEvaluator(): PromotionPeriodQualificationEvaluator {
    return new PromotionPeriodQualificationEvaluator(
      repositoryDouble.repository,
      new QualifierQualificationEvaluator(
        createUnreachedAddressZoneEvaluator(),
        orderItemMembership,
      ),
      orderItemMembership,
    );
  }

  beforeEach(() => {
    orderItemMembership = new OrderItemMembership();
    qualifierEvaluator = new RecordingQualifierQualificationEvaluator(
      createUnreachedAddressZoneEvaluator(),
      orderItemMembership,
    );
    repositoryDouble = createPromotionRepositoryDouble();
    evaluator = new PromotionPeriodQualificationEvaluator(
      repositoryDouble.repository,
      qualifierEvaluator,
      orderItemMembership,
    );
    order = makeOrderViewFixture({ now: new Date(NOW_UTC) });
  });

  describe('the shipped surface, and widenings #1, #3 and #4 of exactly five', () => {
    it('takes exactly three constructor collaborators, all replacing DI/1 properties', () => {
      // Transformation rule T1: `promotionRepository` replaces `getPromotionDAO()` at
      // [model/service/PromotionService.cfc:L567] and [model/service/PromotionService.cfc:L576],
      // the qualifier evaluator replaces the same-component call at
      // [model/service/PromotionService.cfc:L590].
      expect(PromotionPeriodQualificationEvaluator.length).toBe(3);
    });

    it('publishes exactly the three frozen legacy method names, and no fourth', () => {
      expect(
        Object.getOwnPropertyNames(PromotionPeriodQualificationEvaluator.prototype),
      ).toStrictEqual([
        'constructor',
        'getPromotionPeriodQualificationDetails',
        'getPromotionPeriodQualifiedFulfillmentIDList',
        'getPromotionPeriodOrderItemQualificationCount',
      ]);
    });

    it('keeps the three legacy arities, so a silently added parameter fails here', () => {
      expect(typeof evaluator.getPromotionPeriodQualificationDetails).toBe('function');
      expect(typeof evaluator.getPromotionPeriodQualifiedFulfillmentIDList).toBe('function');
      expect(typeof evaluator.getPromotionPeriodOrderItemQualificationCount).toBe('function');

      // [model/service/PromotionService.cfc:L549] and [model/service/PromotionService.cfc:L752]
      // take (promotionPeriod, order); [model/service/PromotionService.cfc:L783] takes
      // (promotionPeriod, orderItem, order) and the legacy parameter order is not rearranged.
      expect(evaluator.getPromotionPeriodQualificationDetails.length).toBe(2);
      expect(evaluator.getPromotionPeriodQualifiedFulfillmentIDList.length).toBe(2);
      expect(evaluator.getPromotionPeriodOrderItemQualificationCount.length).toBe(3);
    });

    it('makes the PRIMARY async and BOTH orphans synchronous, exactly as the DAO reach dictates', async () => {
      const promotionPeriod = makePeriod();

      // [model/service/PromotionService.cfc:L567] and [model/service/PromotionService.cfc:L576]
      // are the only DAO reaches in the three ported ranges, and both sit in the PRIMARY body - so
      // it alone returns a promise.
      const pending = evaluator.getPromotionPeriodQualificationDetails(promotionPeriod, order);
      expect(pending).toBeInstanceOf(Promise);
      const record = await pending;
      expect(record.qualificationsMeet).toBe(true);

      // ORPHAN #1 answers a comma-delimited STRING immediately - never awaited.
      const list = evaluator.getPromotionPeriodQualifiedFulfillmentIDList(promotionPeriod, order);
      expect(typeof list).toBe('string');

      // ORPHAN #2 answers a plain NUMBER immediately - never awaited, never `Money`.
      const count = evaluator.getPromotionPeriodOrderItemQualificationCount(
        promotionPeriod,
        itemAt(order, 0),
        order,
      );
      expect(typeof count).toBe('number');
    });
  });

  describe('getPromotionPeriodQualificationDetails - the four-live-key seed [L552-L557]', () => {
    it('seeds exactly four live keys in source order, with the conditional fifth OMITTED', async () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L552-L557]: the initializer creates four
      // keys - L553 `qualificationsMeet`, L554 `qualifiedFulfillmentIDs`, L555 `qualifierDetails`,
      // L556 `orderItems`.
      const record = await evaluator.getPromotionPeriodQualificationDetails(makePeriod(), order);

      expect(Object.keys(record)).toStrictEqual([
        'qualificationsMeet',
        'qualifiedFulfillmentIDs',
        'qualifierDetails',
        'orderItems',
      ]);

      expect(record).toStrictEqual({
        qualificationsMeet: true,
        qualifiedFulfillmentIDs: [SHIPPING_FULFILLMENT_ID, PICKUP_FULFILLMENT_ID],
        qualifierDetails: [],
        orderItems: {},
      });
    });

    it('leaves the orphaned key genuinely ABSENT rather than present-and-undefined', async () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L621-L623]: no initializer ever creates
      // `qualifiedFulfillments`, so on a normal result the key does not exist at all.
      // Preserved deliberately; do not fix without a product decision.
      const record = await evaluator.getPromotionPeriodQualificationDetails(makePeriod(), order);

      expect('qualifiedFulfillments' in record).toBe(false);
      expect(Object.hasOwn(record, 'qualifiedFulfillments')).toBe(false);
    });

    it('pins the golden fixture identifiers this suite reads against', async () => {
      // Opaque strings, carried verbatim and never parsed. Pinned once here so every other test
      // may derive them from the view it was handed.
      expect(fulfillmentIDsOf(order)).toStrictEqual([
        SHIPPING_FULFILLMENT_ID,
        PICKUP_FULFILLMENT_ID,
      ]);
      expect(fulfillmentAt(order, 0).totalShippingWeight).toBe(SHIPPING_TOTAL_WEIGHT);
      expect(fulfillmentAt(order, 1).totalShippingWeight).toBe(PICKUP_TOTAL_WEIGHT);
      expect(order.totalSaleQuantity).toBe(GOLDEN_TOTAL_SALE_QUANTITY);
      expect(order.orderItems.map((orderItem: OrderItemView) => orderItem.quantity)).toStrictEqual(
        GOLDEN_ITEM_QUANTITIES,
      );

      const record = await evaluator.getPromotionPeriodQualificationDetails(makePeriod(), order);
      expect(record.qualifiedFulfillmentIDs).toStrictEqual(fulfillmentIDsOf(order));
    });

    it('keeps qualificationsMeet MUTABLE, because three legacy lines clear it', async () => {
      // [model/service/PromotionService.cfc:L569], [model/service/PromotionService.cfc:L578] and
      // [model/service/PromotionService.cfc:L613] each assign `false`, so a `readonly` marking
      // would make the port inexpressible.
      const record = await evaluator.getPromotionPeriodQualificationDetails(makePeriod(), order);

      expect(record.qualificationsMeet).toBe(true);
      record.qualificationsMeet = false;
      expect(record.qualificationsMeet).toBe(false);
    });

    it('holds both collections as readonly properties over MUTABLE arrays', async () => {
      // [model/service/PromotionService.cfc:L560] pushes into `qualifiedFulfillmentIDs`,
      // [model/service/PromotionService.cfc:L609] pushes into `qualifierDetails`, and
      // [model/service/PromotionService.cfc:L614-L615] empty both - contents mutate while the
      // bindings stay fixed.
      const record = await evaluator.getPromotionPeriodQualificationDetails(makePeriod(), order);
      const fulfillmentIDs = record.qualifiedFulfillmentIDs;
      const qualifierDetails = record.qualifierDetails;

      fulfillmentIDs.push('appended-by-the-test');
      expect(record.qualifiedFulfillmentIDs).toHaveLength(3);
      expect(record.qualifiedFulfillmentIDs).toBe(fulfillmentIDs);

      qualifierDetails.length = 0;
      expect(record.qualifierDetails).toBe(qualifierDetails);
    });

    it('exposes orderItems as a LIVE, WRITABLE memo keyed by opaque orderItemID', async () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L556, L212-L222]: this function never
      // writes the memo - the CALLER does, one order item at a time, after the record has been
      // memoized - so what is assertable here is that the key is seeded, present and writable.
      const record = await evaluator.getPromotionPeriodQualificationDetails(makePeriod(), order);
      const orderItemID = itemAt(order, 0).orderItemID;

      expect(record.orderItems).toStrictEqual({});

      record.orderItems[orderItemID] = 4;
      const memoized = record.orderItems[orderItemID];
      expect(memoized).toBe(4);
    });
  });

  describe('qualifiedFulfillmentIDs is ALL-OR-NOTHING [L554, L560, L614-L615]', () => {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L560, L614-L615]: a mechanism correction
    // recorded from the source. An older reading of this function describes
    // `qualifiedFulfillmentIDs` as progressively narrowed by each qualifier.

    it('carries EVERY fulfillment ID, so by default every fulfillment qualifies', async () => {
      const record = await evaluator.getPromotionPeriodQualificationDetails(makePeriod(), order);

      expect(record.qualifiedFulfillmentIDs).toStrictEqual([
        SHIPPING_FULFILLMENT_ID,
        PICKUP_FULFILLMENT_ID,
      ]);

      // How the caller probes it at [model/service/PromotionService.cfc:L209] and
      // [model/service/PromotionService.cfc:L351]: `arrayFind` answers a ONE-BASED index or 0,
      // never -1, so the only correct test is `> 0`.
      const shippingPosition = record.qualifiedFulfillmentIDs.indexOf(SHIPPING_FULFILLMENT_ID) + 1;
      expect(shippingPosition).toBeGreaterThan(0);
    });

    it('tracks the order it was handed rather than any remembered shape', async () => {
      const singleFulfillmentOrder = makeOrderViewFixture({
        now: new Date(NOW_UTC),
        includePickupFulfillment: false,
      });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod(),
        singleFulfillmentOrder,
      );

      expect(record.qualifiedFulfillmentIDs).toStrictEqual([SHIPPING_FULFILLMENT_ID]);
    });

    it('is empty for an order with no fulfillments at all, WITHOUT failing qualification', async () => {
      // An empty list means "nothing qualifies" to the caller's `arrayFind` probe, but the boolean
      // is untouched: [model/service/PromotionService.cfc:L560] simply had nothing to append.
      const fulfillmentlessOrder = makeOrderViewFixture({
        now: new Date(NOW_UTC),
        orderFulfillments: [],
      });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod(),
        fulfillmentlessOrder,
      );

      expect(record.qualifiedFulfillmentIDs).toStrictEqual([]);
      expect(record.qualificationsMeet).toBe(true);
    });

    it('goes to EMPTY - never to a subset - when a qualifier fails, and empty means NOTHING qualifies', async () => {
      const qualifier = makeQualifier({ qualifierType: 'order' });
      qualifierEvaluator.program(qualifier, { qualificationCount: 0 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      expect(record.qualifiedFulfillmentIDs).toStrictEqual([]);
      expect(record.qualifiedFulfillmentIDs).toHaveLength(0);
      expect(record.qualificationsMeet).toBe(false);
    });

    it('never lands on an intermediate subset, even when a verdict narrows to ONE ID', async () => {
      // The verdict deliberately names a SINGLE fulfillment. If narrowing reached the
      // caller-visible member this would answer one ID; the source answers both.
      const qualifier = makeQualifier({
        promotionQualifierID: 'qualifier-fulfillment-narrowing',
        qualifierType: 'fulfillment',
      });
      qualifierEvaluator.program(qualifier, {
        qualificationCount: 1,
        qualifiedFulfillmentIDs: [SHIPPING_FULFILLMENT_ID],
      });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      expect(record.qualifiedFulfillmentIDs).toStrictEqual([
        SHIPPING_FULFILLMENT_ID,
        PICKUP_FULFILLMENT_ID,
      ]);
    });
  });

  describe('GATE 1 - the period use-limit gate [L566-L571]', () => {
    // C2, must-preserve area (i): "promotion discount math TOGETHER with USE-LIMIT ENFORCEMENT".
    // This gate and gate 2 below are that enforcement, so every boundary is pinned rather than
    // sampled.

    it('qualifies while the recorded count is BELOW the limit, and reaches the port exactly once', async () => {
      armUseCounts({ periodUseCount: 2 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ maximumUseCount: 3 }),
        order,
      );

      expect(record.qualificationsMeet).toBe(true);
      expect(repositoryDouble.calls).toHaveLength(1);

      const call = repositoryDouble.calls[0];
      expect(call).toBeDefined();
      expect(call?.member).toBe('getPromotionPeriodUseCount');
      expect(call?.promotionPeriodID).toBe('period-under-test');
      expect(call?.accountID).toBeUndefined();
    });

    it('FAILS at EXACTLY the limit, because [L568] compares with a NON-STRICT >=', async () => {
      // The single most consequential boundary in this file: a strict `>` would grant one extra
      // use of every capped promotion period in the catalogue.
      armUseCounts({ periodUseCount: 3 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ maximumUseCount: 3 }),
        order,
      );

      expect(record.qualificationsMeet).toBe(false);
    });

    it('fails above the limit', async () => {
      armUseCounts({ periodUseCount: 4 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ maximumUseCount: 3 }),
        order,
      );

      expect(record.qualificationsMeet).toBe(false);
    });

    it('pins the boundary at the smallest armed limit, where 0 uses pass and 1 use fails', async () => {
      armUseCounts({ periodUseCount: 0 });
      const unused = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ maximumUseCount: 1 }),
        order,
      );
      expect(unused.qualificationsMeet).toBe(true);

      armUseCounts({ periodUseCount: 1 });
      const usedOnce = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ maximumUseCount: 1 }),
        order,
      );
      expect(usedOnce.qualificationsMeet).toBe(false);
    });

    it('treats a persisted maximum of exactly 0 as UNLIMITED and never reaches the port', async () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L566]: the guard is
      // `!isNull(maximumUseCount) AND maximumUseCount gt 0`, so a stored `0` is not "no uses
      // allowed" - it disarms the gate entirely.
      armUseCounts({ periodUseCount: 99 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ maximumUseCount: 0 }),
        order,
      );

      expect(record.qualificationsMeet).toBe(true);
      expect(repositoryDouble.calls).toHaveLength(0);
    });

    it('treats an absent maximum as UNLIMITED and never reaches the port', async () => {
      armUseCounts({ periodUseCount: 99 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ maximumUseCount: undefined }),
        order,
      );

      expect(record.qualificationsMeet).toBe(true);
      expect(repositoryDouble.calls).toHaveLength(0);
    });

    it('treats a negative maximum as UNLIMITED, because the guard tests > 0 rather than presence alone', async () => {
      armUseCounts({ periodUseCount: 99 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ maximumUseCount: -1 }),
        order,
      );

      expect(record.qualificationsMeet).toBe(true);
      expect(repositoryDouble.calls).toHaveLength(0);
    });
  });

  describe('GATE 2 - the account use-limit gate [L574-L581]', () => {
    it('qualifies below the limit and passes the opaque accountID straight through', async () => {
      armUseCounts({ periodAccountUseCount: 1 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ maximumAccountUseCount: 2 }),
        order,
      );

      expect(record.qualificationsMeet).toBe(true);
      expect(repositoryDouble.calls).toHaveLength(1);

      const call = repositoryDouble.calls[0];
      expect(call).toBeDefined();
      expect(call?.member).toBe('getPromotionPeriodAccountUseCount');
      expect(call?.accountID).toBe('account-golden-1');
      expect(call?.accountID).toBe(order.accountID);
    });

    it('FAILS at EXACTLY the limit, because [L577] also compares with a NON-STRICT >=', async () => {
      armUseCounts({ periodAccountUseCount: 2 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ maximumAccountUseCount: 2 }),
        order,
      );

      expect(record.qualificationsMeet).toBe(false);
    });

    it('fails above the limit', async () => {
      armUseCounts({ periodAccountUseCount: 3 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ maximumAccountUseCount: 2 }),
        order,
      );

      expect(record.qualificationsMeet).toBe(false);
    });

    it('SILENTLY SKIPS the whole gate when the order carries NO account [L575]', async () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L574-L581]: the account limit is nested
      // inside a presence test on the order's account, with no `else`, no fallback account and no
      // failure.
      // Preserved deliberately; do not fix without a product decision.
      const guestOrder = makeOrderViewFixture({ now: new Date(NOW_UTC), accountID: undefined });
      expect(isNullish(guestOrder.accountID)).toBe(true);

      armUseCounts({ periodAccountUseCount: 99 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ maximumAccountUseCount: 1 }),
        guestOrder,
      );

      expect(record.qualificationsMeet).toBe(true);
      expect(repositoryDouble.calls).toHaveLength(0);
    });

    it('treats an EMPTY-STRING accountID as PRESENT, so the gate arms and the empty ID is passed on', async () => {
      // CFML parity [model/service/PromotionService.cfc:L575]: the source tests
      // `isNull(order.getAccount())`, an identity test, not `len()`.
      const emptyAccountOrder = makeOrderViewFixture({ now: new Date(NOW_UTC), accountID: '' });
      armUseCounts({ periodAccountUseCount: 0 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ maximumAccountUseCount: 1 }),
        emptyAccountOrder,
      );

      expect(record.qualificationsMeet).toBe(true);
      expect(repositoryDouble.calls).toHaveLength(1);
      expect(repositoryDouble.calls[0]?.accountID).toBe('');
    });

    it('treats a persisted maximum of exactly 0 as UNLIMITED even with an account present', async () => {
      armUseCounts({ periodAccountUseCount: 99 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ maximumAccountUseCount: 0 }),
        order,
      );

      expect(record.qualificationsMeet).toBe(true);
      expect(repositoryDouble.calls).toHaveLength(0);
    });
  });

  describe('repository interaction - the ONLY two reaches are [L567] and [L576]', () => {
    it('makes exactly two calls, in source order, when BOTH gates are armed', async () => {
      armUseCounts({ periodUseCount: 0, periodAccountUseCount: 0 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ maximumUseCount: 5, maximumAccountUseCount: 5 }),
        order,
      );

      expect(record.qualificationsMeet).toBe(true);
      expect(repositoryDouble.calls.map((call) => call.member)).toStrictEqual([
        'getPromotionPeriodUseCount',
        'getPromotionPeriodAccountUseCount',
      ]);
    });

    it('does NOT short-circuit gate 2 when gate 1 has already failed', async () => {
      // Neither gate is guarded on the boolean, so a period breaching both limits still makes both
      // reads and still answers a single `false`. Skipping the second read would depart from what
      // the source does.
      armUseCounts({ periodUseCount: 9, periodAccountUseCount: 9 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ maximumUseCount: 1, maximumAccountUseCount: 1 }),
        order,
      );

      expect(record.qualificationsMeet).toBe(false);
      expect(repositoryDouble.calls).toHaveLength(2);
    });

    it('makes NO call at all when neither gate is armed, and touches no other port member', async () => {
      // The double raises from all six unreached members, so a completed run is itself the proof
      // that nothing beyond the two use-count reads was consulted.
      const record = await evaluator.getPromotionPeriodQualificationDetails(makePeriod(), order);

      expect(record.qualificationsMeet).toBe(true);
      expect(repositoryDouble.calls).toStrictEqual([]);
    });

    it('re-reads the counts on every invocation rather than memoizing them', async () => {
      armUseCounts({ periodUseCount: 0, periodAccountUseCount: 0 });
      const promotionPeriod = makePeriod({ maximumUseCount: 5, maximumAccountUseCount: 5 });

      await evaluator.getPromotionPeriodQualificationDetails(promotionPeriod, order);
      await evaluator.getPromotionPeriodQualificationDetails(promotionPeriod, order);

      expect(repositoryDouble.calls).toHaveLength(4);
    });
  });

  describe('TWO DISTINCT FAILURE SHAPES from one boolean outcome', () => {
    it('a USE-COUNT failure clears the boolean but leaves qualifiedFulfillmentIDs FULL', async () => {
      // Neither gate resets anything, and [model/service/PromotionService.cfc:L560] has already
      // populated the list, so the failure shape here is "false, but every ID still listed".
      const qualifier = makeQualifier({ qualifierType: 'order' });
      qualifierEvaluator.program(qualifier, { qualificationCount: 1 });
      armUseCounts({ periodUseCount: 5 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ maximumUseCount: 5, promotionQualifiers: [qualifier] }),
        order,
      );

      expect(record.qualificationsMeet).toBe(false);
      expect(record.qualifiedFulfillmentIDs).toStrictEqual([
        SHIPPING_FULFILLMENT_ID,
        PICKUP_FULFILLMENT_ID,
      ]);
      expect(record.qualifierDetails).toStrictEqual([]);
      expect('qualifiedFulfillments' in record).toBe(false);

      // [model/service/PromotionService.cfc:L584] gates the whole qualifier loop on the boolean,
      // so a use-count failure means the qualifier was never even examined.
      expect(qualifierEvaluator.visited).toStrictEqual([]);
    });

    it('a QUALIFIER failure clears the boolean AND empties both collections [L613-L616]', async () => {
      const qualifier = makeQualifier({ qualifierType: 'order' });
      qualifierEvaluator.program(qualifier, { qualificationCount: 0 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      expect(record.qualificationsMeet).toBe(false);
      expect(record.qualifiedFulfillmentIDs).toStrictEqual([]);
      expect(record.qualifierDetails).toStrictEqual([]);
      expect('qualifiedFulfillments' in record).toBe(false);
      expect(qualifierEvaluator.visited).toStrictEqual(['qualifier-1']);
    });

    it('the two shapes agree on the boolean and DISAGREE on the fulfillment list', async () => {
      const failingQualifier = makeQualifier({ qualifierType: 'order' });
      qualifierEvaluator.program(failingQualifier, { qualificationCount: 0 });
      const fromQualifier = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [failingQualifier] }),
        order,
      );

      armUseCounts({ periodUseCount: 5 });
      const fromUseCount = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ maximumUseCount: 5 }),
        order,
      );

      expect(fromQualifier.qualificationsMeet).toBe(fromUseCount.qualificationsMeet);
      expect(fromQualifier.qualifiedFulfillmentIDs).toHaveLength(0);
      expect(fromUseCount.qualifiedFulfillmentIDs).toHaveLength(2);
    });

    it('DISCARDS an already-appended qualifier detail when a later qualifier fails', async () => {
      const passing = makeQualifier({
        promotionQualifierID: 'qualifier-passes',
        qualifierType: 'order',
      });
      const failing = makeQualifier({
        promotionQualifierID: 'qualifier-fails',
        qualifierType: 'order',
      });
      qualifierEvaluator.program(passing, { qualificationCount: 2 });
      qualifierEvaluator.program(failing, { qualificationCount: 0 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [passing, failing] }),
        order,
      );

      expect(record.qualifierDetails).toStrictEqual([]);
      expect(qualifierEvaluator.visited).toStrictEqual(['qualifier-passes', 'qualifier-fails']);
    });

    it('RETURNS IMMEDIATELY on the failing qualifier, never examining the one after it', async () => {
      // [model/service/PromotionService.cfc:L617] returns from inside the loop. The third
      // qualifier is programmed but must stay unvisited; had the loop continued, the double would
      // have recorded it.
      const passing = makeQualifier({
        promotionQualifierID: 'qualifier-1st',
        qualifierType: 'order',
      });
      const failing = makeQualifier({
        promotionQualifierID: 'qualifier-2nd',
        qualifierType: 'order',
      });
      const unreached = makeQualifier({
        promotionQualifierID: 'qualifier-3rd',
        qualifierType: 'order',
      });
      qualifierEvaluator.program(passing, { qualificationCount: 1 });
      qualifierEvaluator.program(failing, { qualificationCount: 0 });
      qualifierEvaluator.program(unreached, { qualificationCount: 1 });

      await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [passing, failing, unreached] }),
        order,
      );

      expect(qualifierEvaluator.visited).toStrictEqual(['qualifier-1st', 'qualifier-2nd']);
    });

    it('attaches a passing verdict WHOLESALE, by identity, rather than copying it [L609]', async () => {
      const qualifier = makeQualifier({ qualifierType: 'order' });
      const verdict = qualifierEvaluator.program(qualifier, { qualificationCount: 7 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      expect(record.qualifierDetails).toHaveLength(1);
      const attached = firstQualifierDetail(record);
      expect(attached).toBe(verdict);
      expect(attached.qualifier).toBe(qualifier);
      expect(attached.qualificationCount).toBe(7);
    });
  });

  describe('the early-return reset SPARES orderItems [L613-L616]', () => {
    it('leaves the orderItems memo present and intact after a qualifier failure', async () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L613-L616]: the reset names three keys and
      // stops. `orderItems` is not among them, is not deleted and is not replaced, so the memo
      // survives a failure with whatever it holds.
      const qualifier = makeQualifier({ qualifierType: 'order' });
      qualifierEvaluator.program(qualifier, { qualificationCount: 0 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      expect(record.qualificationsMeet).toBe(false);
      expect(Object.hasOwn(record, 'orderItems')).toBe(true);
      expect(record.orderItems).toStrictEqual({});
    });

    it('leaves the surviving memo WRITABLE, so the caller can still ratchet into it', async () => {
      const qualifier = makeQualifier({ qualifierType: 'order' });
      qualifierEvaluator.program(qualifier, { qualificationCount: 0 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      const orderItemID = itemAt(order, 1).orderItemID;
      record.orderItems[orderItemID] = 2;
      const memoized = record.orderItems[orderItemID];
      expect(memoized).toBe(2);
    });
  });

  describe('DEFECT 10 - the orphaned qualifiedFulfillments write [L621-L623]', () => {
    // LEGACY-DEFECT [model/service/PromotionService.cfc:L621-L623]: this write is wrong in three
    // independent ways, and the consequence is larger than the typo.
    // Preserved deliberately; do not fix without a product decision.

    it('omits the orphaned key entirely when no fulfillment qualifier contributes', async () => {
      const qualifier = makeQualifier({ qualifierType: 'order' });
      qualifierEvaluator.program(qualifier, { qualificationCount: 3 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      expect(record.qualificationsMeet).toBe(true);
      expect(Object.hasOwn(record, 'qualifiedFulfillments')).toBe(false);
      expect(Object.keys(record)).toHaveLength(4);
    });

    it('writes ID STRINGS - not entities - once a fulfillment qualifier contributes', async () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L93, L622]: the docblock promises
      // entities and the assignment delivers strings. The port keeps the strings, because the
      // strings are the behaviour.
      // Preserved deliberately; do not fix without a product decision.
      const qualifier = makeQualifier({ qualifierType: 'fulfillment' });
      qualifierEvaluator.program(qualifier, {
        qualificationCount: 1,
        qualifiedFulfillmentIDs: [SHIPPING_FULFILLMENT_ID],
      });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      expect(Object.hasOwn(record, 'qualifiedFulfillments')).toBe(true);

      const deadField = deadFieldOf(record);
      expect(deadField).toStrictEqual([SHIPPING_FULFILLMENT_ID]);

      const firstEntry = deadField[0];
      expect(firstEntry).toBeDefined();
      expect(typeof firstEntry).toBe('string');
    });

    it('leaves qualifiedFulfillmentIDs UNAFFECTED by the dead write - the orphanhood proof', async () => {
      const qualifier = makeQualifier({ qualifierType: 'fulfillment' });
      qualifierEvaluator.program(qualifier, {
        qualificationCount: 1,
        qualifiedFulfillmentIDs: [SHIPPING_FULFILLMENT_ID],
      });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      // The live member still holds both IDs while the dead one holds a single ID: two different
      // values, two different arrays, and nothing reads the second.
      expect(record.qualifiedFulfillmentIDs).toStrictEqual([
        SHIPPING_FULFILLMENT_ID,
        PICKUP_FULFILLMENT_ID,
      ]);
      expect(deadFieldOf(record)).not.toBe(record.qualifiedFulfillmentIDs);
      expect(deadFieldOf(record)).not.toStrictEqual(record.qualifiedFulfillmentIDs);
    });

    it('proves the narrowing NEVER reaches the caller-visible result', async () => {
      // The verdict excludes the pickup fulfillment outright.
      const qualifier = makeQualifier({ qualifierType: 'fulfillment' });
      qualifierEvaluator.program(qualifier, {
        qualificationCount: 1,
        qualifiedFulfillmentIDs: [PICKUP_FULFILLMENT_ID],
      });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      expect(deadFieldOf(record)).toStrictEqual([PICKUP_FULFILLMENT_ID]);
      expect(record.qualifiedFulfillmentIDs).toContain(SHIPPING_FULFILLMENT_ID);
      expect(record.qualifiedFulfillmentIDs).toHaveLength(2);
    });

    it('omits the key when a fulfillment qualifier qualifies but names NO fulfillment [L621]', async () => {
      // [model/service/PromotionService.cfc:L621] guards the write on the accumulator being
      // non-empty, so an empty verdict leaves the key absent rather than present-and-empty.
      const qualifier = makeQualifier({ qualifierType: 'fulfillment' });
      qualifierEvaluator.program(qualifier, {
        qualificationCount: 1,
        qualifiedFulfillmentIDs: [],
      });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      expect(record.qualificationsMeet).toBe(true);
      expect(Object.hasOwn(record, 'qualifiedFulfillments')).toBe(false);
    });

    it('ignores fulfillment IDs on a NON-fulfillment qualifier [L596]', async () => {
      // The union is gated on the qualifier's own type, so IDs attached to an `order`-type verdict
      // are discarded and the key stays absent.
      const qualifier = makeQualifier({ qualifierType: 'order' });
      qualifierEvaluator.program(qualifier, {
        qualificationCount: 1,
        qualifiedFulfillmentIDs: [SHIPPING_FULFILLMENT_ID],
      });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      expect(Object.hasOwn(record, 'qualifiedFulfillments')).toBe(false);
    });

    it('folds the qualifier-type comparison, so a capitalised "Fulfillment" takes the branch', async () => {
      // CFML parity [model/service/PromotionService.cfc:L596]: `eq` is case-insensitive, so
      // persisted casing cannot change which arm runs. The port folds the comparison rather than
      // relying on stored data being lowercase.
      const qualifier = makeQualifier({ qualifierType: 'Fulfillment' });
      qualifierEvaluator.program(qualifier, {
        qualificationCount: 1,
        qualifiedFulfillmentIDs: [SHIPPING_FULFILLMENT_ID],
      });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      expect(deadFieldOf(record)).toStrictEqual([SHIPPING_FULFILLMENT_ID]);
    });

    it('de-duplicates at [L602], the SOLE !arrayFind site in the component', async () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L602]: a locator correction. An older
      // brief lists L865, L900, L935 and L966 as `!arrayFind` sites; those are UN-NEGATED
      // `listFindNoCase` calls over comma lists and they belong to `orderItemMembership.test.ts`.
      const first = makeQualifier({
        promotionQualifierID: 'qualifier-fulfillment-a',
        qualifierType: 'fulfillment',
      });
      const second = makeQualifier({
        promotionQualifierID: 'qualifier-fulfillment-b',
        qualifierType: 'fulfillment',
      });
      qualifierEvaluator.program(first, {
        qualificationCount: 1,
        qualifiedFulfillmentIDs: [SHIPPING_FULFILLMENT_ID],
      });
      qualifierEvaluator.program(second, {
        qualificationCount: 1,
        qualifiedFulfillmentIDs: [SHIPPING_FULFILLMENT_ID],
      });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [first, second] }),
        order,
      );

      expect(deadFieldOf(record)).toStrictEqual([SHIPPING_FULFILLMENT_ID]);
      expect(deadFieldOf(record)).toHaveLength(1);
    });

    it('unions distinct IDs across qualifiers in FIRST-SEEN order', async () => {
      const first = makeQualifier({
        promotionQualifierID: 'qualifier-names-pickup',
        qualifierType: 'fulfillment',
      });
      const second = makeQualifier({
        promotionQualifierID: 'qualifier-names-shipping',
        qualifierType: 'fulfillment',
      });
      qualifierEvaluator.program(first, {
        qualificationCount: 1,
        qualifiedFulfillmentIDs: [PICKUP_FULFILLMENT_ID],
      });
      qualifierEvaluator.program(second, {
        qualificationCount: 1,
        qualifiedFulfillmentIDs: [SHIPPING_FULFILLMENT_ID],
      });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [first, second] }),
        order,
      );

      // First-seen order, which is the reverse of the order the fulfillments occupy on the order
      // view - so the accumulator's ordering is genuinely its own.
      expect(deadFieldOf(record)).toStrictEqual([PICKUP_FULFILLMENT_ID, SHIPPING_FULFILLMENT_ID]);
    });

    it('never performs the dead write on the early-return path, however much was accumulated', async () => {
      const contributing = makeQualifier({
        promotionQualifierID: 'qualifier-contributes',
        qualifierType: 'fulfillment',
      });
      const failing = makeQualifier({
        promotionQualifierID: 'qualifier-then-fails',
        qualifierType: 'order',
      });
      qualifierEvaluator.program(contributing, {
        qualificationCount: 1,
        qualifiedFulfillmentIDs: [SHIPPING_FULFILLMENT_ID],
      });
      qualifierEvaluator.program(failing, { qualificationCount: 0 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [contributing, failing] }),
        order,
      );

      expect(record.qualificationsMeet).toBe(false);
      expect(Object.hasOwn(record, 'qualifiedFulfillments')).toBe(false);
    });

    it('never performs the dead write when a use-limit gate has already failed', async () => {
      const qualifier = makeQualifier({ qualifierType: 'fulfillment' });
      qualifierEvaluator.program(qualifier, {
        qualificationCount: 1,
        qualifiedFulfillmentIDs: [SHIPPING_FULFILLMENT_ID],
      });
      armUseCounts({ periodUseCount: 2 });

      const record = await evaluator.getPromotionPeriodQualificationDetails(
        makePeriod({ maximumUseCount: 2, promotionQualifiers: [qualifier] }),
        order,
      );

      expect(record.qualificationsMeet).toBe(false);
      expect(Object.hasOwn(record, 'qualifiedFulfillments')).toBe(false);
    });
  });

  describe('the shipped composition, driven through the REAL qualifier evaluator [L590]', () => {
    // JUDGMENT CALL: the recording double proves what this module does with a verdict; these two
    // tests prove the module is wired to the real collaborator at all, using the one qualifier arm
    // whose outcome is predictable without re-deriving the sibling's behaviour.

    it('qualifies through an unbounded order-level qualifier, consulting no address zone', async () => {
      const qualifier = makeQualifier({ qualifierType: 'order' });

      const record = await withRealQualifierEvaluator().getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      expect(record.qualificationsMeet).toBe(true);
      expect(record.qualifierDetails).toHaveLength(1);
      expect(firstQualifierDetail(record).qualifier).toBe(qualifier);
      expect(firstQualifierDetail(record).qualificationCount).toBeGreaterThan(0);
      expect(Object.hasOwn(record, 'qualifiedFulfillments')).toBe(false);
      // A completed run is the assertion: the unreached address-zone double raises.
      expect(record.qualifiedFulfillmentIDs).toHaveLength(2);
    });

    it('fails through a real order-level qualifier whose minimum quantity outruns the order', async () => {
      const qualifier = makeQualifier({
        qualifierType: 'order',
        minimumOrderQuantity: GOLDEN_TOTAL_SALE_QUANTITY + 1,
      });

      const record = await withRealQualifierEvaluator().getPromotionPeriodQualificationDetails(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      expect(record.qualificationsMeet).toBe(false);
      expect(record.qualifiedFulfillmentIDs).toStrictEqual([]);
      expect(record.qualifierDetails).toStrictEqual([]);
    });
  });

  describe('A2 - two records produced by one evaluator SHARE NO STATE', () => {
    it('hands back distinct records over distinct arrays, so mutating one cannot leak', async () => {
      // `qualificationsMeet` and `orderItems` are mutable by contract, so a shared record would
      // leak one order's verdict into another's on a warm container.
      const promotionPeriod = makePeriod();
      const first = await evaluator.getPromotionPeriodQualificationDetails(promotionPeriod, order);
      const second = await evaluator.getPromotionPeriodQualificationDetails(promotionPeriod, order);

      expect(first).not.toBe(second);
      expect(first.qualifiedFulfillmentIDs).not.toBe(second.qualifiedFulfillmentIDs);
      expect(first.qualifierDetails).not.toBe(second.qualifierDetails);
      expect(first.orderItems).not.toBe(second.orderItems);

      first.qualificationsMeet = false;
      first.qualifiedFulfillmentIDs.length = 0;
      first.orderItems[itemAt(order, 0).orderItemID] = 5;

      expect(second.qualificationsMeet).toBe(true);
      expect(second.qualifiedFulfillmentIDs).toHaveLength(2);
      expect(second.orderItems).toStrictEqual({});
    });

    it('holds no state across invocations, answering each order from that order alone', async () => {
      const promotionPeriod = makePeriod();
      const fulfillmentlessOrder = makeOrderViewFixture({
        now: new Date(NOW_UTC),
        orderFulfillments: [],
      });

      const fromGolden = await evaluator.getPromotionPeriodQualificationDetails(
        promotionPeriod,
        order,
      );
      const fromFulfillmentless = await evaluator.getPromotionPeriodQualificationDetails(
        promotionPeriod,
        fulfillmentlessOrder,
      );
      const fromGoldenAgain = await evaluator.getPromotionPeriodQualificationDetails(
        promotionPeriod,
        order,
      );

      expect(fromGolden.qualifiedFulfillmentIDs).toHaveLength(2);
      expect(fromFulfillmentless.qualifiedFulfillmentIDs).toHaveLength(0);
      expect(fromGoldenAgain.qualifiedFulfillmentIDs).toStrictEqual(
        fromGolden.qualifiedFulfillmentIDs,
      );
    });
  });

  describe('ORPHAN #1 getPromotionPeriodQualifiedFulfillmentIDList [L752-L781]', () => {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L752-L781]: this helper is PROVABLY DEAD -
    // nothing in the component, and nothing in the ported slice, invokes it.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L769-L771 versus L695-L714]: it is a
    // strictly weaker, divergent duplicate of the live fulfillment arm.

    it('returns a COMMA-DELIMITED STRING - never an array - carrying every fulfillment ID', () => {
      const list = evaluator.getPromotionPeriodQualifiedFulfillmentIDList(makePeriod(), order);

      expect(typeof list).toBe('string');
      expect(Array.isArray(list)).toBe(false);
      expect(list).toBe(`${SHIPPING_FULFILLMENT_ID},${PICKUP_FULFILLMENT_ID}`);
      expect(listLen(list)).toBe(2);
      expect(listToArray(list)).toStrictEqual([SHIPPING_FULFILLMENT_ID, PICKUP_FULFILLMENT_ID]);
    });

    it('emits NO leading delimiter, because listAppend("", v) === v [L756]', () => {
      // A leading comma would shift every later `listFindNoCase` position by one, and
      // [model/service/PromotionService.cfc:L774] feeds exactly that position into a deletion - so
      // the absence of a prefix is load-bearing rather than cosmetic.
      const list = evaluator.getPromotionPeriodQualifiedFulfillmentIDList(makePeriod(), order);

      expect(list.startsWith(',')).toBe(false);
      expect(listFindNoCase(list, SHIPPING_FULFILLMENT_ID)).toBe(1);
      expect(listFindNoCase(list, PICKUP_FULFILLMENT_ID)).toBe(2);
    });

    it('answers 0 - never -1 - for an ID absent from the list, so a ported probe must read > 0', () => {
      const list = evaluator.getPromotionPeriodQualifiedFulfillmentIDList(makePeriod(), order);

      expect(listFindNoCase(list, 'of-never-created')).toBe(0);
      expect(listFindNoCase(list, SHIPPING_FULFILLMENT_ID)).toBeGreaterThan(0);
    });

    it('returns the EMPTY LIST for an order with no fulfillments', () => {
      const fulfillmentlessOrder = makeOrderViewFixture({
        now: new Date(NOW_UTC),
        orderFulfillments: [],
      });

      const list = evaluator.getPromotionPeriodQualifiedFulfillmentIDList(
        makePeriod(),
        fulfillmentlessOrder,
      );

      expect(list).toBe('');
      expect(listLen(list)).toBe(0);
    });

    it('IGNORES a non-fulfillment qualifier entirely [L764]', () => {
      const qualifier = makeQualifier({
        qualifierType: 'merchandise',
        minimumFulfillmentWeight: 100,
      });

      const list = evaluator.getPromotionPeriodQualifiedFulfillmentIDList(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      expect(list).toBe(`${SHIPPING_FULFILLMENT_ID},${PICKUP_FULFILLMENT_ID}`);
    });

    it('folds the qualifier-type comparison at [L764], so "Fulfillment" takes the branch', () => {
      // CFML parity [model/service/PromotionService.cfc:L764]: `==` on strings folds case, and
      // `SwPromoQual.qualifierType` carries no check constraint, so the fold is required rather
      // than defensive.
      const qualifier = makeQualifier({
        qualifierType: 'Fulfillment',
        minimumFulfillmentWeight: 5,
      });

      const list = evaluator.getPromotionPeriodQualifiedFulfillmentIDList(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      expect(list).toBe(SHIPPING_FULFILLMENT_ID);
    });

    it('keeps a fulfillment weighing EXACTLY the minimum, because [L769] is STRICT', () => {
      // The shipping fulfillment weighs exactly the configured minimum and survives; the pickup
      // fulfillment, at zero, is genuinely below it and is removed. One configuration pins both
      // the strictness and the removal.
      const qualifier = makeQualifier({
        qualifierType: 'fulfillment',
        minimumFulfillmentWeight: SHIPPING_TOTAL_WEIGHT,
      });

      const list = evaluator.getPromotionPeriodQualifiedFulfillmentIDList(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      expect(list).toBe(SHIPPING_FULFILLMENT_ID);
    });

    it('keeps a fulfillment weighing EXACTLY the maximum, because [L771] is STRICT', () => {
      const qualifier = makeQualifier({
        qualifierType: 'fulfillment',
        maximumFulfillmentWeight: SHIPPING_TOTAL_WEIGHT,
      });

      const list = evaluator.getPromotionPeriodQualifiedFulfillmentIDList(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      expect(list).toBe(`${SHIPPING_FULFILLMENT_ID},${PICKUP_FULFILLMENT_ID}`);
    });

    it('removes a fulfillment heavier than the maximum, leaving the lighter one in place', () => {
      const qualifier = makeQualifier({
        qualifierType: 'fulfillment',
        maximumFulfillmentWeight: 10,
      });

      const list = evaluator.getPromotionPeriodQualifiedFulfillmentIDList(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      expect(list).toBe(PICKUP_FULFILLMENT_ID);
    });

    it('lets ONE qualifier remove BOTH fulfillments without throwing', () => {
      // Within a single qualifier's inner loop each fulfillment is visited exactly once, so no ID
      // is ever looked up twice and the [model/service/PromotionService.cfc:L774] hazard cannot
      // fire.
      const qualifier = makeQualifier({
        qualifierType: 'fulfillment',
        minimumFulfillmentWeight: 100,
      });
      const promotionPeriod = makePeriod({ promotionQualifiers: [qualifier] });

      expect(evaluator.getPromotionPeriodQualifiedFulfillmentIDList(promotionPeriod, order)).toBe(
        '',
      );
    });

    it('lets TWO qualifiers remove DIFFERENT fulfillments without throwing', () => {
      const removesPickup = makeQualifier({
        promotionQualifierID: 'qualifier-removes-pickup',
        qualifierType: 'fulfillment',
        minimumFulfillmentWeight: 5,
      });
      const removesShipping = makeQualifier({
        promotionQualifierID: 'qualifier-removes-shipping',
        qualifierType: 'fulfillment',
        maximumFulfillmentWeight: 10,
      });

      const list = evaluator.getPromotionPeriodQualifiedFulfillmentIDList(
        makePeriod({ promotionQualifiers: [removesPickup, removesShipping] }),
        order,
      );

      expect(list).toBe('');
    });

    it('THROWS at [L774] when TWO fulfillment qualifiers exclude the SAME fulfillment', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L774]: the expression is
      // `ListDeleteAt(list, listFindNoCase(list, id))`, so a miss passes position 0 to
      // `ListDeleteAt`.
      // Preserved deliberately; do not fix without a product decision.
      //
      // CFML parity [model/service/PromotionService.cfc:L774]: the source spells one expression
      // `ListDeleteAt` with a capital L and `listFindNoCase` with a lowercase l, which CFML
      // tolerates because its function names fold case.
      const firstExcludesPickup = makeQualifier({
        promotionQualifierID: 'qualifier-excludes-pickup-first',
        qualifierType: 'fulfillment',
        minimumFulfillmentWeight: 5,
      });
      const secondExcludesPickup = makeQualifier({
        promotionQualifierID: 'qualifier-excludes-pickup-again',
        qualifierType: 'fulfillment',
        minimumFulfillmentWeight: 5,
      });
      const promotionPeriod = makePeriod({
        promotionQualifiers: [firstExcludesPickup, secondExcludesPickup],
      });

      expect(() =>
        evaluator.getPromotionPeriodQualifiedFulfillmentIDList(promotionPeriod, order),
      ).toThrow(RangeError);
      expect(() =>
        evaluator.getPromotionPeriodQualifiedFulfillmentIDList(promotionPeriod, order),
      ).toThrow(/L774/);
    });

    it('keeps the list-deletion primitive MODULE-LOCAL, since list.ts is closed at five exports', () => {
      // `src/lib/cfml/list.ts` publishes exactly `listLen`, `listGetAt`, `listAppend`,
      // `listToArray` and `listFindNoCase`, and deliberately no `listDeleteAt` - a sixth export
      // would put a throwing.
      const first = makeQualifier({
        promotionQualifierID: 'qualifier-a',
        qualifierType: 'fulfillment',
        minimumFulfillmentWeight: 5,
      });
      const second = makeQualifier({
        promotionQualifierID: 'qualifier-b',
        qualifierType: 'fulfillment',
        minimumFulfillmentWeight: 5,
      });

      let raised: unknown;
      try {
        evaluator.getPromotionPeriodQualifiedFulfillmentIDList(
          makePeriod({ promotionQualifiers: [first, second] }),
          order,
        );
      } catch (error: unknown) {
        raised = error;
      }

      expect(raised).toBeInstanceOf(RangeError);
      expect(raised instanceof RangeError ? raised.message : '').toContain('L774');
    });

    it('is STRICTLY WEAKER than the live fulfillment arm - the two-versus-six clause proof', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L769-L771]: one configuration, two
      // verdicts. The qualifier names a fulfillment method that no fulfillment on the order uses
      // and sets no weight bound at all.
      const qualifier = makeQualifier({
        qualifierType: 'fulfillment',
        fulfillmentMethodIDs: ['fm-used-by-no-fulfillment-on-this-order'],
      });

      const liveVerdict = new QualifierQualificationEvaluator(
        createUnreachedAddressZoneEvaluator(),
        orderItemMembership,
      ).getQualifierQualificationDetails(qualifier, order);

      expect(liveVerdict.qualificationCount).toBe(0);
      expect(liveVerdict.qualifiedFulfillmentIDs).toStrictEqual([]);

      const weakerList = evaluator.getPromotionPeriodQualifiedFulfillmentIDList(
        makePeriod({ promotionQualifiers: [qualifier] }),
        order,
      );

      expect(weakerList).toBe(`${SHIPPING_FULFILLMENT_ID},${PICKUP_FULFILLMENT_ID}`);
      expect(listLen(weakerList)).toBe(2);
    });

    it('reaches no repository member at all, because the body touches no DAO', () => {
      evaluator.getPromotionPeriodQualifiedFulfillmentIDList(
        makePeriod({ maximumUseCount: 5, maximumAccountUseCount: 5 }),
        order,
      );

      expect(repositoryDouble.calls).toStrictEqual([]);
    });
  });

  describe('ORPHAN #2 getPromotionPeriodOrderItemQualificationCount [L783-L849]', () => {
    /**
     * Every SKU on the order, so `getOrderItemInQualifier` admits all three items.
     */
    function includingEverySku(bag: PromotionQualifierBag = {}): PromotionQualifier {
      return makeQualifier({
        qualifierType: 'merchandise',
        skus: skusOf(order),
        ...bag,
      });
    }

    it('SEEDS FROM THE WHOLE ORDER, so with no qualifiers a single item reports the ORDER quantity', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L785, L848]: the most surprising behaviour
      // in the function, and a genuine money lever.
      const promotionPeriod = makePeriod();

      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          promotionPeriod,
          itemAt(order, 0),
          order,
        ),
      ).toBe(GOLDEN_TOTAL_SALE_QUANTITY);
      expect(itemAt(order, 0).quantity).toBe(3);

      // Every item answers the same number, which is the point: the answer does not depend on
      // which item was asked about.
      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          promotionPeriod,
          itemAt(order, 1),
          order,
        ),
      ).toBe(GOLDEN_TOTAL_SALE_QUANTITY);
      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          promotionPeriod,
          itemAt(order, 2),
          order,
        ),
      ).toBe(GOLDEN_TOTAL_SALE_QUANTITY);
    });

    it('returns a PLAIN INTEGER NUMBER - never a Money - at [L848]', () => {
      // P4 is not applicable to this module: every quantity here is a COUNT, so no `Money` is
      // constructed, consumed or returned and no decimal arithmetic occurs.
      const count = evaluator.getPromotionPeriodOrderItemQualificationCount(
        makePeriod(),
        itemAt(order, 0),
        order,
      );

      expect(typeof count).toBe('number');
      expect(Number.isInteger(count)).toBe(true);
    });

    it('reaches no repository member, because the body touches no DAO', () => {
      evaluator.getPromotionPeriodOrderItemQualificationCount(
        makePeriod({ maximumUseCount: 5, maximumAccountUseCount: 5 }),
        itemAt(order, 0),
        order,
      );

      expect(repositoryDouble.calls).toStrictEqual([]);
    });

    it('SKIPS a qualifier whose type is outside the [L794] order-item vocabulary', () => {
      // CFML parity [model/service/PromotionService.cfc:L794]: the gate list is written
      // `"merchandise,subscription,contentAccess"` here and at the facade's
      // [model/service/PromotionService.cfc:L200].
      //
      // Observable because the qualifier below would return 0 if the gate admitted it: it includes
      // no SKU, so every item would be excluded on clause.
      const skipped = makeQualifier({ qualifierType: 'order' });

      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          makePeriod({ promotionQualifiers: [skipped] }),
          itemAt(order, 0),
          order,
        ),
      ).toBe(GOLDEN_TOTAL_SALE_QUANTITY);

      const alsoSkipped = makeQualifier({ qualifierType: 'fulfillment' });

      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          makePeriod({ promotionQualifiers: [alsoSkipped] }),
          itemAt(order, 0),
          order,
        ),
      ).toBe(GOLDEN_TOTAL_SALE_QUANTITY);
    });

    it('ADMITS each of the three vocabulary entries, and folds their case', () => {
      for (const qualifierType of [
        'merchandise',
        'subscription',
        'contentAccess',
        'Merchandise',
        'CONTENTACCESS',
      ]) {
        const admitted = makeQualifier({ qualifierType });

        expect(
          evaluator.getPromotionPeriodOrderItemQualificationCount(
            makePeriod({ promotionQualifiers: [admitted] }),
            itemAt(order, 0),
            order,
          ),
        ).toBe(0);
      }
    });

    it('is RESTRICTIVE on clause 1: a qualifier including nothing excludes every item [L805]', () => {
      // CFML parity [model/service/PromotionService.cfc:L805]: the membership call is made with
      // keyword arguments and NEGATED polarity, in contrast with
      // [model/service/PromotionService.cfc:L727]'s positive call in `qualifierQualification.ts`
      // and [model/service/PromotionService.cfc:L220]'s positional call in the facade.
      const includesNothing = makeQualifier({ qualifierType: 'merchandise' });

      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          makePeriod({ promotionQualifiers: [includesNothing] }),
          itemAt(order, 0),
          order,
        ),
      ).toBe(0);
    });

    it('FALLS THROUGH PERMISSIVELY when rewardMatchingType is "any" - the FIRST admin option', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L808-L818]: the vocabulary is
      // `any | sku | product | productType | brand`, and `any` matches none of the six literal
      // comparisons, so clauses 2-7 all answer false and every member item qualifies on clause 1
      // alone.
      const matchingAny = includingEverySku({ rewardMatchingType: 'any' });

      // 3 + 2 + 4, every item admitted and none excluded.
      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          makePeriod({ promotionQualifiers: [matchingAny] }),
          itemAt(order, 0),
          order,
        ),
      ).toBe(GOLDEN_TOTAL_SALE_QUANTITY);
    });

    it('FALLS THROUGH PERMISSIVELY when rewardMatchingType is ABSENT', () => {
      const matchingAbsent = includingEverySku({ rewardMatchingType: undefined });

      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          makePeriod({ promotionQualifiers: [matchingAbsent] }),
          itemAt(order, 0),
          order,
        ),
      ).toBe(GOLDEN_TOTAL_SALE_QUANTITY);
    });

    it('EXCLUDES on SKU identity [L808], counting only the target item quantity', () => {
      const bySku: RewardMatchingType = 'sku';
      const qualifier = includingEverySku({ rewardMatchingType: bySku });
      const promotionPeriod = makePeriod({ promotionQualifiers: [qualifier] });
      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          promotionPeriod,
          itemAt(order, 0),
          order,
        ),
      ).toBe(3);
      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          promotionPeriod,
          itemAt(order, 1),
          order,
        ),
      ).toBe(2);
      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          promotionPeriod,
          itemAt(order, 2),
          order,
        ),
      ).toBe(4);
    });

    it('EXCLUDES on PRODUCT identity [L810] over genuinely distinct products', () => {
      const swapped: Product = giveDistinctProduct(itemAt(order, 0).sku, 'identity-a');
      expect(swapped.getProductID()).toBe('product-identity-a');
      expect(productOf(itemAt(order, 0).sku)).toBe(swapped);
      expect(productOf(itemAt(order, 0).sku).getProductID()).not.toBe(
        productOf(itemAt(order, 1).sku).getProductID(),
      );

      const qualifier = includingEverySku({ rewardMatchingType: 'product' });

      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          makePeriod({ promotionQualifiers: [qualifier] }),
          itemAt(order, 0),
          order,
        ),
      ).toBe(3);
    });

    it('EXCLUDES on PRODUCT-TYPE identity [L812] over genuinely distinct product types', () => {
      giveDistinctProduct(itemAt(order, 0).sku, 'identity-b');
      expect(productTypeIDOf(itemAt(order, 0).sku)).not.toBe(productTypeIDOf(itemAt(order, 1).sku));

      const qualifier = includingEverySku({ rewardMatchingType: 'productType' });

      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          makePeriod({ promotionQualifiers: [qualifier] }),
          itemAt(order, 0),
          order,
        ),
      ).toBe(3);
    });

    it('EXCLUDES on BRAND identity [L818] over genuinely distinct brands', () => {
      giveDistinctProduct(itemAt(order, 0).sku, 'identity-c');
      expect(brandIDOf(itemAt(order, 0).sku)).toBe('brand-identity-c');
      expect(brandIDOf(itemAt(order, 0).sku)).not.toBe(brandIDOf(itemAt(order, 1).sku));

      const qualifier = includingEverySku({ rewardMatchingType: 'brand' });

      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          makePeriod({ promotionQualifiers: [qualifier] }),
          itemAt(order, 0),
          order,
        ),
      ).toBe(3);
    });

    it('survives a BRANDLESS examined item without throwing, because [L814] short-circuits first', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L814-L818]: the sharpest cascade proof
      // available.
      const brandlessOrder = makeOrderViewFixture({ now: new Date(NOW_UTC) });
      giveDistinctProduct(itemAt(brandlessOrder, 0).sku, 'has-no-brand', { withBrand: false });
      giveDistinctProduct(itemAt(brandlessOrder, 2).sku, 'has-another-brand');

      expect(productOf(itemAt(brandlessOrder, 0).sku).getBrand()).toBeUndefined();
      expect(productOf(itemAt(brandlessOrder, 1).sku).getBrand()).toBeDefined();
      expect(brandIDOf(itemAt(brandlessOrder, 2).sku)).not.toBe(
        brandIDOf(itemAt(brandlessOrder, 1).sku),
      );

      const qualifier = makeQualifier({
        qualifierType: 'merchandise',
        skus: skusOf(brandlessOrder),
        rewardMatchingType: 'brand',
      });

      // Target = the second item, which has a brand: itself counted, the brandless item zeroed by
      // clause 5, the third item zeroed by clause 7 on a differing brand.
      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          makePeriod({ promotionQualifiers: [qualifier] }),
          itemAt(brandlessOrder, 1),
          brandlessOrder,
        ),
      ).toBe(2);
    });

    it('zeroes everything when the TARGET item is brandless, via clause 6 at [L816]', () => {
      const brandlessOrder = makeOrderViewFixture({ now: new Date(NOW_UTC) });
      giveDistinctProduct(itemAt(brandlessOrder, 0).sku, 'target-has-no-brand', {
        withBrand: false,
      });
      expect(productOf(itemAt(brandlessOrder, 0).sku).getBrand()).toBeUndefined();

      const qualifier = makeQualifier({
        qualifierType: 'merchandise',
        skus: skusOf(brandlessOrder),
        rewardMatchingType: 'brand',
      });

      // Clause 5 zeroes the brandless item itself; clause 6 - which tests the TARGET, not the
      // examined item - then zeroes every other item too. No throw.
      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          makePeriod({ promotionQualifiers: [qualifier] }),
          itemAt(brandlessOrder, 0),
          brandlessOrder,
        ),
      ).toBe(0);
    });

    it('is PERMISSIVE at [L830] when minimumItemQuantity is absent, unlike [L742]', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L830 versus L742]: two structurally
      // parallel presence guards with reciprocally opposite polarity.
      const permissive = includingEverySku({ minimumItemQuantity: undefined });

      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          makePeriod({ promotionQualifiers: [permissive] }),
          itemAt(order, 0),
          order,
        ),
      ).toBe(GOLDEN_TOTAL_SALE_QUANTITY);
    });

    it('THROWS on a ZERO minimumItemQuantity at [L831] rather than yielding Infinity', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L831]: the divisor is guarded by
      // presence only - there is no `gt 0` test here, in deliberate contrast with the `gt 0`
      // overrides at [model/service/PromotionService.cfc:L566] and
      // [model/service/PromotionService.cfc:L574] - so a persisted `0` reaches the division.
      // Preserved deliberately; do not fix without a product decision.
      const zeroDivisor = includingEverySku({ minimumItemQuantity: 0 });
      const promotionPeriod = makePeriod({ promotionQualifiers: [zeroDivisor] });

      expect(() =>
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          promotionPeriod,
          itemAt(order, 0),
          order,
        ),
      ).toThrow(RangeError);
      expect(() =>
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          promotionPeriod,
          itemAt(order, 0),
          order,
        ),
      ).toThrow(/L831/);
    });

    it('TRUNCATES toward zero at [L831] - Math.trunc, never Math.round', () => {
      // The distinction is directly observable: 9 divided by 2 truncates to 4, while rounding
      // would answer.
      const halving = includingEverySku({ minimumItemQuantity: 2 });

      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          makePeriod({ promotionQualifiers: [halving] }),
          itemAt(order, 0),
          order,
        ),
      ).toBe(4);

      // LEGACY-NOTE [model/service/PromotionService.cfc:L831]: `Math.trunc` versus `Math.floor` is
      // not observable through this function, and that is recorded honestly rather than dressed up
      // as a passing assertion.
      const exact = includingEverySku({ minimumItemQuantity: 3 });

      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          makePeriod({ promotionQualifiers: [exact] }),
          itemAt(order, 0),
          order,
        ),
      ).toBe(3);
    });

    it('keeps the INCUMBENT at exact equality, because [L835] compares STRICTLY', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L835]: at exact equality the strict `<`
      // and a non-strict `<=` write the same value, so the strictness is observationally identical
      // here - recorded plainly rather than claimed as proven.
      const equalToSeed = includingEverySku({ rewardMatchingType: 'any' });

      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          makePeriod({ promotionQualifiers: [equalToSeed] }),
          itemAt(order, 0),
          order,
        ),
      ).toBe(GOLDEN_TOTAL_SALE_QUANTITY);
    });

    it('LOWERS the running minimum when a qualifier counts less [L835-L836]', () => {
      const lowers = includingEverySku({ rewardMatchingType: 'sku' });

      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          makePeriod({ promotionQualifiers: [lowers] }),
          itemAt(order, 1),
          order,
        ),
      ).toBe(2);
    });

    it('NEVER RAISES the running minimum, however generous a later qualifier is', () => {
      const restrictive = includingEverySku({
        promotionQualifierID: 'qualifier-restrictive',
        rewardMatchingType: 'sku',
      });
      const generous = includingEverySku({
        promotionQualifierID: 'qualifier-generous',
        rewardMatchingType: 'any',
      });

      // The first qualifier lowers the minimum to 3; the second counts 9, which is not less than
      // 3, so the incumbent survives and 3 is returned.
      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          makePeriod({ promotionQualifiers: [restrictive, generous] }),
          itemAt(order, 0),
          order,
        ),
      ).toBe(3);
    });

    it('RETURNS 0 EARLY at exactly zero, because [L840] compares NON-STRICTLY', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L835 versus L840]: the strictness is MIXED
      // in adjacent lines - [model/service/PromotionService.cfc:L835] is strict `<` while
      // [model/service/PromotionService.cfc:L840] is non-strict `<=` - and both forms are
      // reproduced rather than harmonised.
      const zeroCounting = makeQualifier({
        promotionQualifierID: 'qualifier-counts-zero',
        qualifierType: 'merchandise',
      });
      const wouldThrow = includingEverySku({
        promotionQualifierID: 'qualifier-would-throw',
        minimumItemQuantity: 0,
      });

      expect(
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          makePeriod({ promotionQualifiers: [zeroCounting, wouldThrow] }),
          itemAt(order, 0),
          order,
        ),
      ).toBe(0);
    });

    it('CONTINUES past a positive count, reaching the qualifier the early return would have skipped', () => {
      // The contrast that makes the previous test meaningful: with a POSITIVE first count the loop
      // proceeds, the second qualifier is evaluated, and its zero divisor raises exactly as
      // [model/service/PromotionService.cfc:L831] dictates.
      const positiveCounting = includingEverySku({
        promotionQualifierID: 'qualifier-counts-three',
        rewardMatchingType: 'sku',
      });
      const wouldThrow = includingEverySku({
        promotionQualifierID: 'qualifier-would-throw',
        minimumItemQuantity: 0,
      });
      const promotionPeriod = makePeriod({
        promotionQualifiers: [positiveCounting, wouldThrow],
      });

      expect(() =>
        evaluator.getPromotionPeriodOrderItemQualificationCount(
          promotionPeriod,
          itemAt(order, 0),
          order,
        ),
      ).toThrow(RangeError);
    });

    it('never answers a negative number on any returning path', () => {
      // The [model/service/PromotionService.cfc:L840] test admits a negative, but the return
      // substitutes a plain `0`, so a returning zero is a genuine zero and no negative
      // qualification count can reach the ratchet.
      const zeroCounting = makeQualifier({ qualifierType: 'merchandise' });
      const count = evaluator.getPromotionPeriodOrderItemQualificationCount(
        makePeriod({ promotionQualifiers: [zeroCounting] }),
        itemAt(order, 0),
        order,
      );

      expect(count).toBe(0);
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});
