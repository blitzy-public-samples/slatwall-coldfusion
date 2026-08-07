/**
 * `PromotionService` - the ported façade over the decomposed promotion engine.
 *
 * `meta/tests/` contains 32 components and 98 public test methods, and exactly three of them touch
 * the in-scope slice at all - `unit/entity/BrandTest.cfc`, `unit/entity/ProductTest.cfc`.
 *
 * `issue_1766` is a source todo/comment, not an existing legacy test.
 *
 * Legacy `public void function updateOrderAmountsWithPromotions(required any order)`
 * [model/service/PromotionService.cfc:L58] returns void and mutates the order aggregate in place.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { Promotion } from '../../../src/domain/entities/promotion.js';
import type { PromotionCode } from '../../../src/domain/entities/promotionCode.js';
import type { PromotionPeriod } from '../../../src/domain/entities/promotionPeriod.js';
import type { PromotionQualifier } from '../../../src/domain/entities/promotionQualifier.js';
import type { PromotionReward } from '../../../src/domain/entities/promotionReward.js';
import type { AddressZoneEvaluator } from '../../../src/domain/ports/addressZoneEvaluator.js';
import type {
  PromotionRepository,
  SalePriceDetail,
  SalePricePromotionRewardRow,
} from '../../../src/domain/ports/promotionRepository.js';
import type {
  PeriodQualification,
  QualifierQualification,
} from '../../../src/domain/promotionEngine/qualificationTypes.js';
import type { PromotionAppliedIntent } from '../../../src/domain/promotionEngine/qualifiedDiscountTypes.js';
import type { UnlimitedUseSentinel } from '../../../src/domain/promotionEngine/rewardUsageTypes.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import type { AppliedPromotionView } from '../../../src/domain/views/orderFulfillmentView.js';
import type { OrderItemView } from '../../../src/domain/views/orderItemView.js';
import type { OrderView, ShippingMethodOptionView } from '../../../src/domain/views/orderView.js';
import { PriceGroupService } from '../../../src/services/priceGroupService.js';
import { PromotionService } from '../../../src/services/promotionService.js';
import type { ShippingDiscountDetails } from '../../../src/services/promotionService.js';
import { RoundingRuleService } from '../../../src/services/roundingRuleService.js';
import type { RoundingRuleFrameworkWrites } from '../../../src/services/roundingRuleService.js';
import { makeOrderViewFixture } from '../../fixtures/orderViewFixtures.js';
import { makePriceGroupFixtures } from '../../fixtures/priceGroupFixtures.js';
import { makePromotionFixtures } from '../../fixtures/promotionFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

// Types recovered from the shipped surface rather than re-declared.
//
// The rounding-value resolver and the framework-reads collaborator are MODULE-LOCAL and
// deliberately UNEXPORTED in `src/services/promotionService.ts`.

type RoundingRuleValueResolver = ConstructorParameters<typeof PromotionService>[2];
type PromotionFrameworkReads = ConstructorParameters<typeof PromotionService>[3];
type PriceGroupRepositoryPort = ConstructorParameters<typeof PriceGroupService>[0];
type ProductRepositoryPort = ConstructorParameters<typeof PriceGroupService>[1];
type PriceGroupFrameworkReadsPort = ConstructorParameters<typeof PriceGroupService>[2];

type RoundingRuleEntity = NonNullable<
  Awaited<ReturnType<PromotionRepository['getRoundingRuleQuery']>>
>;
type AddressProjectionArg = Parameters<AddressZoneEvaluator['isAddressInZone']>[0];
type AddressZoneProjectionArg = Parameters<AddressZoneEvaluator['isAddressInZone']>[1];

type PromotionFixtureOverrides = NonNullable<Parameters<typeof makePromotionFixtures>[0]>;
type PromotionFixtureGraph = ReturnType<typeof makePromotionFixtures>;
type PriceGroupFixtureGraph = ReturnType<typeof makePriceGroupFixtures>;
type PriceGroupEntity = PriceGroupFixtureGraph['childPriceGroup'];
type RewardOrderingName = PromotionFixtureGraph['rewardOrderings'][number]['name'];

/**
 * The fixture's capture sink, recovered STRUCTURALLY from the fixture's own parameter type.
 *
 * The sibling fixture declares the interface locally and does not export it, and this suite may
 * not edit a fixture file, so the type is derived rather than re-declared.
 */
type OrderViewFixtureCapture = NonNullable<
  NonNullable<Parameters<typeof makeOrderViewFixture>[0]>['capture']
>;

/**
 * The literal one million, as the shipped engine types publish it.
 */
const UNLIMITED_USE_SENTINEL: UnlimitedUseSentinel = 1000000;

// In-memory doubles. One per collaborator, hand-written, recording every argument it receives.

interface ActivePromotionRewardsCall {
  readonly rewardTypeList: string;
  readonly promotionCodeList: string;
  readonly qualificationRequired: boolean | undefined;
}

interface PromotionCodeAccountUseCountCall {
  readonly promotionCode: PromotionCode;
  readonly accountID: string;
}

/**
 * The seven-member `PromotionRepository` surface, and not a member more.
 */
class RecordingPromotionRepository implements PromotionRepository {
  public rewards: readonly PromotionReward[] = [];
  public salePriceRows: readonly SalePricePromotionRewardRow[] = [];
  public promotionPeriodUseCount = 0;
  public promotionPeriodAccountUseCount = 0;

  /**
   * Every `accountID` the per-account use-count gate was actually asked about.
   */
  public readonly promotionPeriodAccountUseCountCalls: string[] = [];
  public promotionCodeUseCount = 0;
  public promotionCodeAccountUseCount = 0;
  public roundingRule: RoundingRuleEntity | undefined = undefined;

  public readonly activePromotionRewardsCalls: ActivePromotionRewardsCall[] = [];
  public readonly salePriceQueryCalls: Array<string | undefined> = [];
  public readonly promotionCodeUseCountCalls: PromotionCode[] = [];
  public readonly promotionCodeAccountUseCountCalls: PromotionCodeAccountUseCountCall[] = [];
  public readonly roundingRuleQueryCalls: string[] = [];

  public getActivePromotionRewards(
    rewardTypeList: string,
    promotionCodeList: string,
    qualificationRequired?: boolean,
  ): Promise<PromotionReward[]> {
    this.activePromotionRewardsCalls.push({
      rewardTypeList,
      promotionCodeList,
      qualificationRequired,
    });

    // LEGACY-NOTE [model/dao/PromotionDAO.cfc:L51-L132]: getActivePromotionRewards applies no
    // ORDER by, so legacy reward iteration order is whatever the ORM returns and is genuinely
    // non-deterministic at a tie.
    return Promise.resolve([...this.rewards]);
  }

  public getPromotionPeriodUseCount(promotionPeriod: PromotionPeriod): Promise<number> {
    // The identifier is read so the parameter is genuinely consumed rather than ignored.
    void promotionPeriod.getPromotionPeriodID();
    return Promise.resolve(this.promotionPeriodUseCount);
  }

  public getPromotionPeriodAccountUseCount(
    promotionPeriod: PromotionPeriod,
    accountID: string,
  ): Promise<number> {
    void promotionPeriod.getPromotionPeriodID();
    // RECORDED, not merely consumed: [model/service/PromotionService.cfc:L575] wraps this call in
    // an account-presence test.
    this.promotionPeriodAccountUseCountCalls.push(accountID);
    return Promise.resolve(this.promotionPeriodAccountUseCount);
  }

  public getPromotionCodeUseCount(promotionCode: PromotionCode): Promise<number> {
    this.promotionCodeUseCountCalls.push(promotionCode);
    return Promise.resolve(this.promotionCodeUseCount);
  }

  public getPromotionCodeAccountUseCount(
    promotionCode: PromotionCode,
    accountID: string,
  ): Promise<number> {
    this.promotionCodeAccountUseCountCalls.push({ promotionCode, accountID });
    return Promise.resolve(this.promotionCodeAccountUseCount);
  }

  public getSalePricePromotionRewardsQuery(
    productID?: string,
  ): Promise<SalePricePromotionRewardRow[]> {
    this.salePriceQueryCalls.push(productID);
    return Promise.resolve([...this.salePriceRows]);
  }

  public getRoundingRuleQuery(roundingRuleID: string): Promise<RoundingRuleEntity | undefined> {
    this.roundingRuleQueryCalls.push(roundingRuleID);
    return Promise.resolve(this.roundingRule);
  }

  // And there is no WRITE. `implements PromotionRepository` does not by itself keep an extra
  // member out - a class may widen what it implements - so the absence is deliberate rather than
  // compiler- enforced.
}

/**
 * The one-member `AddressZoneEvaluator` surface. `isAddressInZone` is SYNCHRONOUS - it returns a
 * boolean, not a promise - and the façade consumes it synchronously.
 */
class RecordingAddressZoneEvaluator implements AddressZoneEvaluator {
  public answer = false;
  public readonly calls: Array<{
    readonly address: AddressProjectionArg;
    readonly addressZone: AddressZoneProjectionArg;
  }> = [];

  public isAddressInZone(
    address: AddressProjectionArg,
    addressZone: AddressZoneProjectionArg,
  ): boolean {
    this.calls.push({ address, addressZone });
    return this.answer;
  }
}

/**
 * The framework-reads collaborator.
 */
class RecordingPromotionFrameworkReads implements PromotionFrameworkReads {
  public promotion: Promotion | undefined = undefined;
  public readonly calls: string[] = [];

  public getPromotion(promotionID: string): Promise<Promotion> {
    this.calls.push(promotionID);
    const seeded = this.promotion;

    if (seeded === undefined) {
      throw new Error(`double not seeded: no promotion for ${promotionID}`);
    }

    return Promise.resolve(seeded);
  }
}

// Narrowing and snapshot helpers.
//
// `requirePresent` exists so that not one indexed access below needs a postfix `!`.

function requirePresent<TValue>(value: TValue | undefined, description: string): TValue {
  if (value === undefined) {
    throw new Error(`fixture invariant violated: ${description} is absent`);
  }

  return value;
}

/**
 * One order item reduced to comparable primitives, for the no-mutation proof.
 */
interface OrderItemSnapshot {
  readonly orderItemID: string;
  readonly quantity: number;
  readonly price: string;
  readonly skuPrice: string;
  readonly extendedPrice: string;
  readonly extendedSkuPrice: string;
  readonly appliedPriceGroupID: string | null;
  readonly orderItemTypeSystemCode: string;
  readonly orderFulfillmentID: string;
  readonly skuID: string;
}

function snapshotOrderItems(order: OrderView): readonly OrderItemSnapshot[] {
  return order.orderItems.map((orderItem) => ({
    orderItemID: orderItem.orderItemID,
    quantity: orderItem.quantity,
    price: orderItem.price.toDecimalString(),
    skuPrice: orderItem.skuPrice.toDecimalString(),
    extendedPrice: orderItem.extendedPrice.toDecimalString(),
    extendedSkuPrice: orderItem.extendedSkuPrice.toDecimalString(),
    appliedPriceGroupID: orderItem.appliedPriceGroup?.getPriceGroupID() ?? null,
    orderItemTypeSystemCode: orderItem.orderItemType.systemCode,
    orderFulfillmentID: orderItem.orderFulfillmentID,
    skuID: orderItem.sku.getSkuID(),
  }));
}

/**
 * The order's own scalar read surface, reduced to comparable primitives.
 */
interface OrderHeaderSnapshot {
  readonly orderID: string;
  readonly orderTypeSystemCode: string;
  readonly accountID: string | null;
  readonly promotionCodeList: string;
  readonly currencyCode: string;
  readonly totalSaleQuantity: number;
  readonly subtotal: string;
  readonly subtotalAfterItemDiscounts: string;
  readonly fulfillmentChargeAfterDiscountTotal: string;
  readonly appliedPromotionCount: number;
  readonly orderItemCount: number;
  readonly orderFulfillmentCount: number;
}

function snapshotOrderHeader(order: OrderView): OrderHeaderSnapshot {
  return {
    orderID: order.orderID,
    orderTypeSystemCode: order.orderType.systemCode,
    accountID: order.accountID ?? null,
    promotionCodeList: order.promotionCodeList,
    currencyCode: order.currencyCode,
    totalSaleQuantity: order.totalSaleQuantity,
    subtotal: order.subtotal.toDecimalString(),
    subtotalAfterItemDiscounts: order.subtotalAfterItemDiscounts.toDecimalString(),
    fulfillmentChargeAfterDiscountTotal:
      order.fulfillmentChargeAfterDiscountTotal.toDecimalString(),
    appliedPromotionCount: order.appliedPromotions.length,
    orderItemCount: order.orderItems.length,
    orderFulfillmentCount: order.orderFulfillments.length,
  };
}

/**
 * One intent flattened to a stable string of `operation/appliedType/target`. Used for whole-array
 * comparisons of which intents were emitted and in what order.
 */
function describeIntent(intent: PromotionAppliedIntent): string {
  const target =
    intent.appliedType === 'order'
      ? intent.orderID
      : intent.appliedType === 'orderItem'
        ? intent.orderItemID
        : intent.orderFulfillmentID;

  return `${intent.operation}/${intent.appliedType}/${target}`;
}

function describeIntents(intents: readonly PromotionAppliedIntent[]): readonly string[] {
  return intents.map(describeIntent);
}

/**
 * The discount an add/update intent carries, in `Money`.
 */
function intentDiscount(intent: PromotionAppliedIntent): Money {
  if (intent.operation === 'remove') {
    throw new Error(`a remove intent carries no discount: ${describeIntent(intent)}`);
  }

  return intent.discountAmount;
}

/**
 * The sole intent for one order item, narrowed. Fails loudly when there is not exactly one.
 */
function soleOrderItemIntent(
  intents: readonly PromotionAppliedIntent[],
  orderItemID: string,
): PromotionAppliedIntent {
  const matches = intentsForOrderItem(intents, orderItemID);

  if (matches.length !== 1) {
    throw new Error(`expected exactly one intent for ${orderItemID}, found ${matches.length}`);
  }

  return requirePresent(matches[0], `the sole intent for ${orderItemID}`);
}

function intentsForOrderItem(
  intents: readonly PromotionAppliedIntent[],
  orderItemID: string,
): readonly PromotionAppliedIntent[] {
  return intents.filter(
    (intent) => intent.appliedType === 'orderItem' && intent.orderItemID === orderItemID,
  );
}

// The subject, and the fixture graph that makes it produce real output.

interface Subject {
  readonly service: PromotionService;
  readonly repository: RecordingPromotionRepository;
  readonly addressZones: RecordingAddressZoneEvaluator;
  readonly frameworkReads: RecordingPromotionFrameworkReads;
  readonly roundingRuleValues: RoundingRuleValueResolver;
}

/**
 * The durable-write collaborator every `RoundingRuleService` in this file is handed, which
 * REFUSES.
 *
 * `saveRoundingRule` genuinely persists now, through a single-method contract the service declares
 * and `src/handlers/bootstrap.ts` satisfies over the request's executor.
 */
const refusingRoundingRuleFrameworkWrites: RoundingRuleFrameworkWrites = {
  saveRoundingRule: (): never => {
    throw new Error(
      'a rounding-rule WRITE was reached from this suite. Only the synchronous rounding pair is ' +
        'exercised here; saveRoundingRule is covered by tests/unit/services/roundingRuleService.test.ts.',
    );
  },
};

/**
 * The third slot is a real `RoundingRuleService` over the same repository double, because the
 * shipped resolver type is nominal (see the shipped-surface adaptations in the header).
 */
function makeSubject(): Subject {
  const repository = new RecordingPromotionRepository();
  const addressZones = new RecordingAddressZoneEvaluator();
  const frameworkReads = new RecordingPromotionFrameworkReads();
  const roundingRuleValues: RoundingRuleValueResolver = new RoundingRuleService(
    repository,
    refusingRoundingRuleFrameworkWrites,
  );
  const service = new PromotionService(
    repository,
    addressZones,
    roundingRuleValues,
    frameworkReads,
  );

  return { service, repository, addressZones, frameworkReads, roundingRuleValues };
}

/**
 * The promotion graph tailored so that the GOLDEN ORDER actually qualifies.
 *
 * `skus` is pointed at the order's own SKUs, so reward and qualifier membership can match. - every
 * exclusion collection is emptied.
 *
 * Nothing here changes a shipped module, and no fixture file is created or edited.
 */
function buildQualifyingGraph(
  idPrefix: string,
  order: OrderView,
  acceptedPriceGroup: PriceGroupEntity | undefined,
  extra: PromotionFixtureOverrides = {},
): PromotionFixtureGraph {
  return makePromotionFixtures({
    idPrefix,
    skus: order.orderItems.map((orderItem) => orderItem.sku),
    eligiblePriceGroups: acceptedPriceGroup === undefined ? [] : [acceptedPriceGroup],
    excludedBrands: [],
    excludedOptions: [],
    excludedSkus: [],
    excludedProducts: [],
    excludedProductTypes: [],
    fulfillmentMethodIDs: [],
    shippingMethodIDs: [],
    shippingAddressZoneIDs: [],
    qualifierGates: {
      minimumItemPrice: Money.fromDecimalString('1.00'),
      minimumFulfillmentWeight: 0,
    },
    ...extra,
  });
}

/**
 * The named reward sequence, taken from the graph and never re-sorted.
 */
function rewardSequence(
  graph: PromotionFixtureGraph,
  name: RewardOrderingName,
): readonly PromotionReward[] {
  const ordering = requirePresent(
    graph.rewardOrderings.find((candidate) => candidate.name === name),
    `the '${name}' reward ordering`,
  );

  return ordering.rewards;
}

/**
 * Wires a subject to a graph and an explicit reward sequence, and returns the subject. The reward
 * sequence is always supplied by the caller: see the missing-`ORDER BY` note on the repository
 * double.
 */
function armSubject(
  subject: Subject,
  graph: PromotionFixtureGraph,
  rewards: readonly PromotionReward[],
  addressIsInZone = true,
): Subject {
  subject.repository.rewards = rewards;
  subject.repository.roundingRule = graph.roundingRule;
  subject.frameworkReads.promotion = graph.promotion;
  subject.addressZones.answer = addressIsInZone;

  return subject;
}

/**
 * A `PriceGroupService` wired to in-memory doubles, used only by §2.
 */
function makePriceGroupSubject(accountPriceGroups: readonly PriceGroupEntity[]): PriceGroupService {
  const accountAssociation: PriceGroupEntity[] = [...accountPriceGroups];
  const priceGroupRepository: PriceGroupRepositoryPort = {
    getAccountSubscriptionPriceGroups: () => Promise.resolve([]),
    getPriceGroup: () => Promise.resolve(undefined),
    getPriceGroupRate: () => Promise.resolve(undefined),
    savePriceGroup: (priceGroup) => Promise.resolve(priceGroup),
    savePriceGroupRate: (priceGroupRate) => Promise.resolve(priceGroupRate),
    deletePriceGroup: () => Promise.resolve(true),
  };
  const productRepository: ProductRepositoryPort = {
    getAttributeSets: () => Promise.resolve([]),
    loadDataFromFile: () => Promise.resolve(undefined),
    searchProductsByProductType: () => Promise.resolve({ records: [], matchedCount: 0 }),
    getProductByProductID: () => Promise.resolve(undefined),
    saveProduct: (product) => Promise.resolve(product),
    deleteProduct: () => Promise.resolve(true),
  };
  const frameworkReads: PriceGroupFrameworkReadsPort = {
    getAccountPriceGroups: () => Promise.resolve(accountAssociation),
    getPriceGroupPageRecords: () => Promise.resolve([]),
  };

  return new PriceGroupService(priceGroupRepository, productRepository, frameworkReads);
}

describe('PromotionService', () => {
  let subject: Subject;

  beforeEach(() => {
    subject = makeSubject();
  });

  // TRACEABILITY: `meta/tests/` carries no PromotionServiceTest of any kind, so every assertion in
  // this file is net-new.

  // §1 the golden pipeline, driven end to end.

  describe('★★★ updateOrderAmountsWithPromotions: the golden pipeline', () => {
    it('★★★ drives the golden multi-item, multi-reward order end to end', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('golden-', order, capture.acceptedPriceGroup);
      const rewards = rewardSequence(graph, 'orderRewardLast');
      armSubject(subject, graph, rewards);

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);

      // SIGNATURE RESHAPING #1. Legacy [model/service/PromotionService.cfc:L58] declares `void`
      // and writes into the order aggregate; the target RETURNS the writes it would have made.
      expect(Array.isArray(intents)).toBe(true);

      const shippingFulfillment = requirePresent(
        order.orderFulfillments[0],
        'the golden shipping fulfillment',
      );
      const firstItem = requirePresent(order.orderItems[0], 'golden order item 0');
      const secondItem = requirePresent(order.orderItems[1], 'golden order item 1');

      // The emission order is a structural fact of the ported pipeline: fulfillment slots first
      // (their arm runs in pass one), then the order slot (pass two only).
      expect(describeIntents(intents)).toStrictEqual([
        `add/orderFulfillment/${shippingFulfillment.orderFulfillmentID}`,
        `add/order/${order.orderID}`,
        `add/orderItem/${firstItem.orderItemID}`,
        `add/orderItem/${secondItem.orderItemID}`,
      ]);

      const promotionID = graph.promotion.getPromotionID();
      expect(intents.map((intent) => intent.promotionID)).toStrictEqual([
        promotionID,
        promotionID,
        promotionID,
        promotionID,
      ]);

      const fulfillmentIntent = requirePresent(intents[0], 'the fulfillment intent');
      const orderIntent = requirePresent(intents[1], 'the order-level intent');
      const firstItemIntent = requirePresent(intents[2], 'the first order-item intent');
      const secondItemIntent = requirePresent(intents[3], 'the second order-item intent');

      expect(intentDiscount(fulfillmentIntent).equals(Money.fromDecimalString('4.51'))).toBe(true);
      expect(intentDiscount(orderIntent).equals(Money.fromDecimalString('16.95'))).toBe(true);
      expect(intentDiscount(firstItemIntent).equals(Money.fromDecimalString('2.00'))).toBe(true);
      expect(intentDiscount(secondItemIntent).equals(Money.fromDecimalString('2.00'))).toBe(true);

      // LEGACY-NOTE [model/service/PromotionService.cfc:L417, L419]: the order-level base is
      // `getSubtotalAfterItemDiscounts() + getFulfillmentChargeAfterDiscountTotal()` summed with a
      // PLAIN `+` - a precision gap distinct from the `amountOff` float gap at
      // [model/service/PromotionService.cfc:L998].
      const derivedOrderBase = Money.fromDecimalString('129.95').plus(
        shippingFulfillment.fulfillmentCharge.minus(intentDiscount(fulfillmentIntent)),
      );
      expect(derivedOrderBase.equals(Money.fromDecimalString('134.94'))).toBe(true);

      // Regression guard for the stale-snapshot defect.
      expect(
        order.subtotalAfterItemDiscounts
          .plus(order.fulfillmentChargeAfterDiscountTotal)
          .equals(Money.fromDecimalString('127.45')),
      ).toBe(true);
      expect(derivedOrderBase.isGreaterThan(Money.fromDecimalString('127.45'))).toBe(true);
      expect(intentDiscount(orderIntent).equals(Money.fromDecimalString('15.46'))).toBe(false);
    });

    it('★★ mutates NOTHING on the order view - the input is read-only at this boundary', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('nomut-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));

      const itemsBefore = snapshotOrderItems(order);
      const headerBefore = snapshotOrderHeader(order);
      const itemsArray = order.orderItems;
      const fulfillmentsArray = order.orderFulfillments;

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);

      expect(intents.length).toBe(4);

      // JUDGMENT CALL: the order aggregate is out of scope, so the anti-corruption boundary is
      // proven by showing the input is byte-identical afterwards rather than by inspecting a
      // persistence layer that does not exist in this slice.
      expect(snapshotOrderItems(order)).toStrictEqual(itemsBefore);
      expect(snapshotOrderHeader(order)).toStrictEqual(headerBefore);
      expect(order.orderItems).toBe(itemsArray);
      expect(order.orderFulfillments).toBe(fulfillmentsArray);
      expect(order.appliedPromotions).toStrictEqual([]);
    });

    it('★ takes the reward sequence EXACTLY as supplied, because the DAO supplies no order', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('rewardorder-', order, capture.acceptedPriceGroup);
      const supplied = rewardSequence(graph, 'orderRewardLast');
      armSubject(subject, graph, supplied);

      await subject.service.updateOrderAmountsWithPromotions(order);

      // LEGACY-NOTE [model/dao/PromotionDAO.cfc:L51-L132]: getActivePromotionRewards applies no
      // ORDER by - the whole component contains zero ORDER by clauses (verified).
      const call = requirePresent(
        subject.repository.activePromotionRewardsCalls[0],
        'the active-promotion-rewards call',
      );
      expect(subject.repository.activePromotionRewardsCalls.length).toBe(1);
      expect(call.promotionCodeList).toBe(order.promotionCodeList);
      expect(call.qualificationRequired).toBe(true);

      // CFML parity [model/service/PromotionService.cfc:L165]: the reward-type list is passed as a
      // single comma-delimited string covering both passes' vocabularies, exactly as legacy does.
      expect(call.rewardTypeList).toBe('merchandise,subscription,contentAccess,order,fulfillment');
      expect(supplied.map((reward) => reward.getRewardType())).toStrictEqual([
        'merchandise',
        'fulfillment',
        'order',
      ]);
    });

    it('★★ emits ONLY the best discount per order item, discarding every other candidate', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('best-', order, undefined);
      const firstItem = requirePresent(order.orderItems[0], 'golden order item 0');

      // Three item-level rewards whose discounts on the same item are distinct. Each is measured
      // on its own first, so the winner is established from evidence rather than asserted by fiat.
      const trio: readonly PromotionReward[] = [
        graph.percentageOffReward,
        graph.amountOffReward,
        graph.fixedAmountReward,
      ];
      const soloAmounts: Money[] = [];

      for (const reward of trio) {
        const soloSubject = makeSubject();
        armSubject(soloSubject, graph, [reward]);
        const soloIntents = await soloSubject.service.updateOrderAmountsWithPromotions(order);
        soloAmounts.push(intentDiscount(soleOrderItemIntent(soloIntents, firstItem.orderItemID)));
      }

      const percentageOffAmount = requirePresent(soloAmounts[0], 'the percentageOff discount');
      const amountOffAmount = requirePresent(soloAmounts[1], 'the amountOff discount');
      const fixedAmountAmount = requirePresent(soloAmounts[2], 'the fixed-amount discount');

      expect(percentageOffAmount.equals(Money.fromDecimalString('7.98'))).toBe(true);
      expect(amountOffAmount.equals(Money.fromDecimalString('14.98'))).toBe(true);
      expect(fixedAmountAmount.equals(Money.fromDecimalString('43.98'))).toBe(true);

      // Three genuinely DISTINCT candidates, which is the precondition without which this case is
      // vacuous.
      expect(percentageOffAmount.equals(amountOffAmount)).toBe(false);
      expect(amountOffAmount.equals(fixedAmountAmount)).toBe(false);

      armSubject(subject, graph, trio);
      const intents = await subject.service.updateOrderAmountsWithPromotions(order);

      // CFML parity [model/service/PromotionService.cfc:L523-L537]: the accumulator is
      // insert-sorted DESCENDING by discount at [model/service/PromotionService.cfc:L266-L294] and
      // the application pass reads index `[1]` and nothing else.
      const winner = soleOrderItemIntent(intents, firstItem.orderItemID);
      expect(intentDiscount(winner).equals(fixedAmountAmount)).toBe(true);
      expect(intentsForOrderItem(intents, firstItem.orderItemID).length).toBe(1);

      // Reversing the supplied sequence cannot change which candidate wins, because the winner is
      // the maximum.
      const reversedSubject = makeSubject();
      armSubject(reversedSubject, graph, [...trio].reverse());
      const reversed = await reversedSubject.service.updateOrderAmountsWithPromotions(order);
      expect(
        intentDiscount(soleOrderItemIntent(reversed, firstItem.orderItemID)).equals(
          fixedAmountAmount,
        ),
      ).toBe(true);
    });

    it('carries the promotion identifier, an OPAQUE order-item id, Money and the orderItem literal', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('shape-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'noOrderReward'));
      const firstItem = requirePresent(order.orderItems[0], 'golden order item 0');

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);
      const itemIntent = soleOrderItemIntent(intents, firstItem.orderItemID);

      // An unexpected key fails here: the shipped item-level intent carries exactly five.
      expect(Object.keys(itemIntent).sort()).toStrictEqual([
        'appliedType',
        'discountAmount',
        'operation',
        'orderItemID',
        'promotionID',
      ]);
      expect(itemIntent.appliedType).toBe('orderItem');
      expect(itemIntent.operation).toBe('add');
      expect(itemIntent.promotionID).toBe(graph.promotion.getPromotionID());
      expect(typeof itemIntent.promotionID).toBe('string');
      expect(intentDiscount(itemIntent)).toBeInstanceOf(Money);

      // The target is the OPAQUE identifier, never a live view reference. `Order`, `OrderItem` and
      // `OrderFulfillment` are out of scope, so the intent may not hold one.
      expect(itemIntent.appliedType === 'orderItem' && itemIntent.orderItemID).toBe(
        firstItem.orderItemID,
      );
      expect(Object.values(itemIntent)).not.toContain(firstItem);
      expect(Object.values(itemIntent)).not.toContain(firstItem.sku);

      // LEGACY-NOTE [model/service/PromotionService.cfc:L402, L448, L531]: the legacy method
      // writes exactly three applied types - `'orderFulfillment'` at
      // [model/service/PromotionService.cfc:L402], `'order'` at
      // [model/service/PromotionService.cfc:L448] and `'orderItem'` at
      // [model/service/PromotionService.cfc:L531] - and the fixture graph publishes the same
      // vocabulary.
      expect(capture.appliedTypes).toStrictEqual(['orderItem', 'order', 'orderFulfillment']);
    });

    it('★ gates on the order type: sales and exchange proceed, anything else yields no intents', async () => {
      const outcomes = new Map<string, readonly string[]>();

      for (const systemCode of [
        'otSalesOrder',
        'otExchangeOrder',
        'otReturnOrder',
        'otQuote',
      ] as const) {
        const capture: OrderViewFixtureCapture = {};
        const order = makeOrderViewFixture({ capture, orderTypeSystemCode: systemCode });
        const graph = buildQualifyingGraph(
          `gate-${systemCode}-`,
          order,
          capture.acceptedPriceGroup,
        );
        const gateSubject = makeSubject();
        armSubject(gateSubject, graph, rewardSequence(graph, 'orderRewardLast'));

        const intents = await gateSubject.service.updateOrderAmountsWithPromotions(order);
        outcomes.set(systemCode, describeIntents(intents));
      }

      // CFML parity [model/service/PromotionService.cfc:L61]: the gate is
      // `listFindNoCase("otSalesOrder,otExchangeOrder", order.getOrderType().getSystemCode())`, a
      // MEMBERSHIP test rather than an equality test, so exactly two system codes proceed.
      expect(requirePresent(outcomes.get('otSalesOrder'), 'the sales-order outcome').length).toBe(
        4,
      );
      expect(
        requirePresent(outcomes.get('otExchangeOrder'), 'the exchange-order outcome').length,
      ).toBe(4);
      expect(
        requirePresent(outcomes.get('otReturnOrder'), 'the return-order outcome'),
      ).toStrictEqual([]);
      expect(requirePresent(outcomes.get('otQuote'), 'the quote outcome')).toStrictEqual([]);

      // CFML parity [model/service/PromotionService.cfc:L61, L542]: `otExchangeOrder` appears in
      // both order-type gates and the two `if`s are SEQUENTIAL, not `else if`.
      expect(requirePresent(outcomes.get('otExchangeOrder'), 'the exchange-order outcome')).toEqual(
        requirePresent(outcomes.get('otSalesOrder'), 'the sales-order outcome'),
      );
    });

    it('reads the order through at least five of its own accessors', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture, promotionCodes: ['SPRING24', 'VIP'] });
      const graph = buildQualifyingGraph('reads-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);

      // `orderType.systemCode` - the gate. Covered by its own case above; asserted here as the
      // reason this order was processed at all.
      expect(order.orderType.systemCode).toBe('otSalesOrder');

      // `promotionCodeList` - forwarded verbatim to the repository as a comma-delimited string.
      const call = requirePresent(
        subject.repository.activePromotionRewardsCalls[0],
        'the active-promotion-rewards call',
      );
      expect(order.promotionCodeList).toBe('SPRING24,VIP');
      expect(call.promotionCodeList).toBe('SPRING24,VIP');

      // `orderID` - the order-level intent's target.
      const orderIntent = requirePresent(
        intents.find((intent) => intent.appliedType === 'order'),
        'the order-level intent',
      );
      expect(orderIntent.appliedType === 'order' && orderIntent.orderID).toBe(order.orderID);

      // Accessors 4 and 5 pin their partition before they walk it.
      //
      // A membership check written as `for (... Of intents) { if (appliedType === X) {... } }`
      // asserts nothing when the pipeline emits no intent of type X - the body never runs, the
      // case still passes.

      // `orderFulfillments` - every emitted fulfillment target is one of the order's own.
      const fulfillmentIDs = order.orderFulfillments.map(
        (fulfillment) => fulfillment.orderFulfillmentID,
      );
      const emittedFulfillmentIDs = intents.flatMap((intent) =>
        intent.appliedType === 'orderFulfillment' ? [intent.orderFulfillmentID] : [],
      );
      expect(emittedFulfillmentIDs).toHaveLength(1);

      for (const emitted of emittedFulfillmentIDs) {
        expect(fulfillmentIDs).toContain(emitted);
      }

      // `orderItems` - every emitted item target is one of the order's own.
      const orderItemIDs = order.orderItems.map((orderItem) => orderItem.orderItemID);
      const emittedOrderItemIDs = intents.flatMap((intent) =>
        intent.appliedType === 'orderItem' ? [intent.orderItemID] : [],
      );
      expect(emittedOrderItemIDs).toHaveLength(2);
      expect(new Set(emittedOrderItemIDs).size).toBe(2);

      for (const emitted of emittedOrderItemIDs) {
        expect(orderItemIDs).toContain(emitted);
      }

      // The three target partitions EXHAUST the emission, so no intent slipped past accessors 3, 4
      // and 5 unexamined.
      const emittedOrderIDs = intents.flatMap((intent) =>
        intent.appliedType === 'order' ? [intent.orderID] : [],
      );
      expect(emittedOrderIDs).toStrictEqual([order.orderID]);
      expect(
        emittedFulfillmentIDs.length + emittedOrderItemIDs.length + emittedOrderIDs.length,
      ).toBe(intents.length);

      // `orderItems[].extendedPrice` - term 1 of the order-level base at
      // [model/service/PromotionService.cfc:L417], read per ITEM rather than as a pre-summed
      // total. Raising only the item prices must raise the order-level discount.
      const richerCapture: OrderViewFixtureCapture = {};
      const richerOrder = makeOrderViewFixture({
        capture: richerCapture,
        promotionCodes: ['SPRING24', 'VIP'],
        itemOverrides: [
          { extendedPrice: Money.fromDecimalString('400.00') },
          { extendedPrice: Money.fromDecimalString('400.00') },
          { extendedPrice: Money.fromDecimalString('400.00') },
        ],
      });
      const richerGraph = buildQualifyingGraph(
        'reads-rich-',
        richerOrder,
        richerCapture.acceptedPriceGroup,
      );
      const richerSubject = makeSubject();
      armSubject(richerSubject, richerGraph, rewardSequence(richerGraph, 'orderRewardLast'));
      const richerIntents =
        await richerSubject.service.updateOrderAmountsWithPromotions(richerOrder);
      const richerOrderIntent = requirePresent(
        richerIntents.find((intent) => intent.appliedType === 'order'),
        'the richer order-level intent',
      );
      expect(intentDiscount(richerOrderIntent).isGreaterThan(intentDiscount(orderIntent))).toBe(
        true,
      );

      // `orderFulfillments[].fulfillmentCharge` - term 2 of the same base, and read per
      // fulfillment rather than as a pre-summed total.
      const chargeCapture: OrderViewFixtureCapture = {};
      const richerChargeOrder = makeOrderViewFixture({
        capture: chargeCapture,
        promotionCodes: ['SPRING24', 'VIP'],
        fulfillmentOverrides: [{ fulfillmentCharge: Money.fromDecimalString('250.00') }],
      });
      const richerChargeGraph = buildQualifyingGraph(
        'reads-charge-',
        richerChargeOrder,
        chargeCapture.acceptedPriceGroup,
      );
      const richerChargeSubject = makeSubject();
      armSubject(
        richerChargeSubject,
        richerChargeGraph,
        rewardSequence(richerChargeGraph, 'orderRewardLast'),
      );
      const richerChargeIntents =
        await richerChargeSubject.service.updateOrderAmountsWithPromotions(richerChargeOrder);
      const richerChargeOrderIntent = requirePresent(
        richerChargeIntents.find((intent) => intent.appliedType === 'order'),
        'the richer-charge order-level intent',
      );
      expect(
        intentDiscount(richerChargeOrderIntent).isGreaterThan(intentDiscount(orderIntent)),
      ).toBe(true);
      const staleCapture: OrderViewFixtureCapture = {};
      const staleOrder = makeOrderViewFixture({
        capture: staleCapture,
        promotionCodes: ['SPRING24', 'VIP'],
        subtotalAfterItemDiscounts: Money.fromDecimalString('400.00'),
        fulfillmentChargeAfterDiscountTotal: Money.fromDecimalString('50.00'),
      });
      const staleGraph = buildQualifyingGraph(
        'reads-stale-',
        staleOrder,
        staleCapture.acceptedPriceGroup,
      );
      const staleSubject = makeSubject();
      armSubject(staleSubject, staleGraph, rewardSequence(staleGraph, 'orderRewardLast'));
      const staleIntents = await staleSubject.service.updateOrderAmountsWithPromotions(staleOrder);
      const staleOrderIntent = requirePresent(
        staleIntents.find((intent) => intent.appliedType === 'order'),
        'the stale-snapshot order-level intent',
      );
      expect(intentDiscount(staleOrderIntent).equals(intentDiscount(orderIntent))).toBe(true);

      // `totalSaleQuantity` - the qualification count starts from it, so it is read on every
      // order-item qualification test.
      expect(order.totalSaleQuantity).toBe(9);
    });

    it('★ is add-only for an order arriving with no applied promotions', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('addonly-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);

      // The COMMON case, and the reason it is add-only is the input rather than the algebra:
      // legacy [model/service/PromotionService.cfc:L64-L68],
      // [model/service/PromotionService.cfc:L71-L75] and
      // [model/service/PromotionService.cfc:L78-L80] walk the items'.
      expect(intents.every((intent) => intent.operation === 'add')).toBe(true);
      expect(intents.some((intent) => intent.operation === 'remove')).toBe(false);
      expect(intents.some((intent) => intent.operation === 'update')).toBe(false);
      expect(order.appliedPromotions).toStrictEqual([]);
      expect(order.orderFulfillments.every((f) => f.appliedPromotions.length === 0)).toBe(true);
    });

    it('★★ REPRODUCES the clear-out: a persisted promotion is never left standing', async () => {
      // Seeding the mirror from `OrderView.appliedPromotions` instead would install the persisted
      // row as an incumbent the legacy had already thrown away, and case 1 would keep charging the
      // old.
      const capture: OrderViewFixtureCapture = {};

      // A persisted discount FAR larger than anything this reward set can compute, so "the reward
      // still wins" cannot be explained by the comparison at
      // [model/service/PromotionService.cfc:L385] / [model/service/PromotionService.cfc:L431].
      const stalePromotionID = 'promotion-persisted-by-a-previous-run';
      const staleAmount = Money.fromDecimalString('9999.00');
      const staleRow: AppliedPromotionView = Object.freeze({
        // A row a PREVIOUS invocation persisted, so it carries the generated identity its mapping
        // requires [model/entity/PromotionApplied.cfc:L52].
        promotionAppliedID: 'applied-stale-row',
        discountAmount: staleAmount,
        promotion: Object.freeze({ promotionID: stalePromotionID }),
      });

      // CASE 1 + 2 together: the SHIPPING fulfillment and the order both carry a stale row, and
      // the PICKUP fulfillment carries one too.
      const order = makeOrderViewFixture({
        capture,
        appliedPromotions: [staleRow],
        fulfillmentOverrides: [
          { appliedPromotions: [staleRow] },
          { appliedPromotions: [staleRow] },
        ],
      });
      const orderGraph = buildQualifyingGraph('clearout-o-', order, capture.acceptedPriceGroup);
      const rewardPromotionID = orderGraph.promotion.getPromotionID();
      armSubject(subject, orderGraph, rewardSequence(orderGraph, 'orderRewardLast'));

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);

      const shipping = requirePresent(order.orderFulfillments[0], 'the shipping fulfillment');
      const pickup = requirePresent(order.orderFulfillments[1], 'the pickup fulfillment');

      // CASE 1 - shipping: the stale row is unlinked and the reward's smaller discount is
      // attached.
      const shippingIntents = intents.filter(
        (intent) =>
          intent.appliedType === 'orderFulfillment' &&
          intent.orderFulfillmentID === shipping.orderFulfillmentID,
      );
      expect(shippingIntents.map((intent) => intent.operation)).toStrictEqual(['remove', 'add']);
      expect(requirePresent(shippingIntents[0], 'the shipping remove').promotionID).toBe(
        stalePromotionID,
      );
      const shippingAdd = requirePresent(shippingIntents[1], 'the shipping add');
      expect(shippingAdd.promotionID).toBe(rewardPromotionID);
      expect(intentDiscount(shippingAdd).isGreaterThan(Money.zero)).toBe(true);
      expect(intentDiscount(shippingAdd).isGreaterThan(staleAmount)).toBe(false);

      // CASE 2 - pickup: nothing could be applied, so the stale row is removed and nothing
      // replaces it.
      const pickupIntents = intents.filter(
        (intent) =>
          intent.appliedType === 'orderFulfillment' &&
          intent.orderFulfillmentID === pickup.orderFulfillmentID,
      );
      expect(pickupIntents.map((intent) => intent.operation)).toStrictEqual(['remove']);
      expect(requirePresent(pickupIntents[0], 'the pickup remove').promotionID).toBe(
        stalePromotionID,
      );

      // The order level behaves identically - its arm reads the same mirror algebra at
      // [model/service/PromotionService.cfc:L427-L451].
      const orderIntents = intents.filter((intent) => intent.appliedType === 'order');
      expect(orderIntents.map((intent) => intent.operation)).toStrictEqual(['remove', 'add']);
      expect(requirePresent(orderIntents[0], 'the order remove').promotionID).toBe(
        stalePromotionID,
      );
      expect(requirePresent(orderIntents[1], 'the order add').promotionID).toBe(rewardPromotionID);

      // CASE 3: the persisted row carries the promotion the reward itself will re-apply.
      const sameCapture: OrderViewFixtureCapture = {};
      const sameOrder = makeOrderViewFixture({
        capture: sameCapture,
        appliedPromotions: [
          Object.freeze({
            promotionAppliedID: 'applied-same-promotion-row',
            discountAmount: Money.fromDecimalString('0.01'),
            promotion: Object.freeze({ promotionID: rewardPromotionID }),
          }),
        ],
      });
      const sameGraph = buildQualifyingGraph(
        'clearout-same-',
        sameOrder,
        sameCapture.acceptedPriceGroup,
      );
      // The reward graph must carry the same promotion identifier the persisted row names, which
      // the shared prefix cannot guarantee - so the case is built from the graph that produced it.
      const sameSubject = makeSubject();
      const sameOrderWithMatchingRow = makeOrderViewFixture({
        capture: sameCapture,
        appliedPromotions: [
          Object.freeze({
            promotionAppliedID: 'applied-matching-row',
            discountAmount: Money.fromDecimalString('0.01'),
            promotion: Object.freeze({ promotionID: sameGraph.promotion.getPromotionID() }),
          }),
        ],
      });
      armSubject(sameSubject, sameGraph, rewardSequence(sameGraph, 'orderRewardLast'));
      const sameIntents =
        await sameSubject.service.updateOrderAmountsWithPromotions(sameOrderWithMatchingRow);
      const sameOrderIntents = sameIntents.filter((intent) => intent.appliedType === 'order');
      expect(sameOrderIntents.map((intent) => intent.operation)).toStrictEqual(['remove', 'add']);

      // Both intents name the one promotion, which is what makes this the re-won case rather than
      // a displacement - and the removal is still emitted, because the clear-out does not ask.
      const reWonRemove = requirePresent(sameOrderIntents[0], 'the order remove');
      const reWonAdd = requirePresent(sameOrderIntents[1], 'the order add');
      expect(reWonRemove.promotionID).toBe(sameGraph.promotion.getPromotionID());
      expect(reWonAdd.promotionID).toBe(sameGraph.promotion.getPromotionID());

      // And the surviving amount is the RECOMPUTED one, not the 0.01 that was persisted.
      expect(intentDiscount(reWonAdd).isGreaterThan(Money.fromDecimalString('0.01'))).toBe(true);
    });
  });

  // §1a the blanket clear - [model/service/PromotionService.cfc:L61-L80]
  //
  // Every case above starts from an order carrying no applied promotions, which is the ordinary
  // state and the one under which the clear emits nothing.

  describe('★★★ the blanket clear detaches every pre-existing applied promotion', () => {
    /**
     * One prior applied-promotion row, as a view.
     *
     * `promotionAppliedID` is REQUIRED of every row [model/entity/PromotionApplied.cfc:L52] and is
     * what the clear names, so it is a parameter rather than derived from the promotion: two rows
     * can share a promotion.
     */
    function priorRow(
      promotionID: string,
      discount: string,
      promotionAppliedID = `applied-${promotionID}`,
    ): AppliedPromotionView {
      return {
        promotionAppliedID,
        discountAmount: Money.fromDecimalString(discount),
        promotion: { promotionID },
      };
    }

    /**
     * Only the remove intents, in emission order.
     */
    function removals(intents: readonly PromotionAppliedIntent[]): readonly string[] {
      return describeIntents(intents).filter((description) => description.startsWith('remove/'));
    }

    it('★★★ emits one remove per prior row at all three levels, in the source traversal order', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({
        capture,
        // Items carry rows; both fulfillments carry rows; the order itself carries a row.
        itemOverrides: [
          { appliedPromotions: [priorRow('stale-item-0', '3.00')] },
          { appliedPromotions: [priorRow('stale-item-1', '4.00')] },
        ],
        fulfillmentOverrides: [
          { appliedPromotions: [priorRow('stale-ship', '5.00')] },
          { appliedPromotions: [priorRow('stale-pickup', '6.00')] },
        ],
        appliedPromotions: [priorRow('stale-order', '7.00')],
      });
      const graph = buildQualifyingGraph('clear-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);

      const firstItem = requirePresent(order.orderItems[0], 'order item 0');
      const secondItem = requirePresent(order.orderItems[1], 'order item 1');
      const shipping = requirePresent(order.orderFulfillments[0], 'the shipping fulfillment');
      const pickup = requirePresent(order.orderFulfillments[1], 'the pickup fulfillment');

      // CFML parity [model/service/PromotionService.cfc:L64-L80]: items first, then fulfillments,
      // then the order - and within each level the LAST element first, because all three loops
      // count down from `arrayLen(...)` to `1`.
      expect(removals(intents)).toStrictEqual([
        `remove/orderItem/${secondItem.orderItemID}`,
        `remove/orderItem/${firstItem.orderItemID}`,
        `remove/orderFulfillment/${pickup.orderFulfillmentID}`,
        `remove/orderFulfillment/${shipping.orderFulfillmentID}`,
        `remove/order/${order.orderID}`,
      ]);

      // Each remove names the promotion the prior row carried, never the reward's - that is the
      // row being detached.
      const removeIntents = intents.filter((intent) => intent.operation === 'remove');
      expect(removeIntents.map((intent) => intent.promotionID)).toStrictEqual([
        'stale-item-1',
        'stale-item-0',
        'stale-pickup',
        'stale-ship',
        'stale-order',
      ]);
      for (const intent of removeIntents) {
        expect(() => intentDiscount(intent)).toThrow(/carries no discount/);
      }

      // The clear comes first, exactly as it does in the source.
      const operations = intents.map((intent) => intent.operation);
      const lastRemoval = operations.lastIndexOf('remove');
      const firstAddition = operations.indexOf('add');
      expect(lastRemoval).toBeGreaterThanOrEqual(0);
      expect(firstAddition).toBeGreaterThan(lastRemoval);
    });

    it('★★ removes EVERY row on a target, not just the first the reward arms can see', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({
        capture,
        appliedPromotions: [
          priorRow('stale-order-a', '7.00'),
          priorRow('stale-order-b', '8.00'),
          priorRow('stale-order-c', '9.00'),
        ],
      });
      const graph = buildQualifyingGraph('clear-many-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);

      // CFML parity [model/service/PromotionService.cfc:L78-L80] versus
      // [model/service/PromotionService.cfc:L427-L431]: the CLEAR walks `arrayLen(...)` down to
      // `1`, so it detaches all three, while the order-level reward arm only ever reads index
      // `[1]`.
      expect(removals(intents)).toStrictEqual([
        `remove/order/${order.orderID}`,
        `remove/order/${order.orderID}`,
        `remove/order/${order.orderID}`,
      ]);
      expect(
        intents.filter((intent) => intent.operation === 'remove').map((i) => i.promotionID),
      ).toStrictEqual(['stale-order-c', 'stale-order-b', 'stale-order-a']);

      // And each NAMES its own ROW. Three distinct promotions make the promotion identifiers
      // sufficient here; the sibling case below removes that crutch.
      expect(
        intents.filter((intent) => intent.operation === 'remove').map((i) => i.promotionAppliedID),
      ).toStrictEqual(['applied-stale-order-c', 'applied-stale-order-b', 'applied-stale-order-a']);
    });

    // ROW IDENTITY. The three cases below are the ones that a removal addressed only by
    // `(appliedType, target ID, promotionID)` could not express at all, which is why they are
    // here.
    //
    // Coverage here is NET-NEW: no legacy test constructs an applied-promotion row at all.

    it('★★★ two rows sharing ONE promotion on ONE target are removed as TWO DISTINCT rows', async () => {
      // Without row identity this case is unanswerable. Both rows carry the same promotion on the
      // same target, so both produce the identical triple `(order, orderID, 'stale-duplicate')`.
      const capture: OrderViewFixtureCapture = {};
      const duplicatedPromotionID = 'stale-duplicate';
      const order = makeOrderViewFixture({
        capture,
        appliedPromotions: [
          priorRow(duplicatedPromotionID, '11.00', 'applied-duplicate-first'),
          priorRow(duplicatedPromotionID, '12.00', 'applied-duplicate-second'),
        ],
      });
      const graph = buildQualifyingGraph('clear-dupe-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);
      const removeIntents = intents.filter((intent) => intent.operation === 'remove');

      // Two removals, and the promotion identifier alone cannot tell them apart - which is the
      // point.
      expect(removeIntents).toHaveLength(2);
      expect(removeIntents.map((intent) => intent.promotionID)).toStrictEqual([
        duplicatedPromotionID,
        duplicatedPromotionID,
      ]);

      // The ROW identities do tell them apart, in the source's reverse traversal order.
      expect(removeIntents.map((intent) => intent.promotionAppliedID)).toStrictEqual([
        'applied-duplicate-second',
        'applied-duplicate-first',
      ]);
      expect(new Set(removeIntents.map((intent) => intent.promotionAppliedID)).size).toBe(2);
    });

    it('★★★ a row with NO promotion is representable, and is CLEARED rather than skipped', async () => {
      // The legacy produces this row itself. `removePromotion`
      // [model/entity/PromotionApplied.cfc:L85-L94] ends in
      // `structDelete(variables, "promotion")`, and the fk declares no `notnull`
      // [model/entity/PromotionApplied.cfc:L58].
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({
        capture,
        appliedPromotions: [
          {
            promotionAppliedID: 'applied-orphan-row',
            discountAmount: Money.fromDecimalString('31.00'),
            promotion: undefined,
          },
        ],
      });
      const graph = buildQualifyingGraph('clear-orphan-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);
      const removeIntents = intents.filter((intent) => intent.operation === 'remove');

      // It is cleared - one removal, naming the row.
      expect(removeIntents).toHaveLength(1);
      const orphanRemoval = requirePresent(removeIntents[0], 'the orphan-row removal');
      expect(orphanRemoval.promotionAppliedID).toBe('applied-orphan-row');
      expect(orphanRemoval.appliedType).toBe('order');
      expect(orphanRemoval.orderID).toBe(order.orderID);

      // And the absent promotion surfaces as absent, not as some borrowed identifier.
      expect(orphanRemoval.promotionID).toBeUndefined();
    });

    it('★★ a row with NO discountAmount is representable, and is cleared naming the row', async () => {
      // `discountAmount ormtype="big_decimal"` carries no `notnull`
      // [model/entity/PromotionApplied.cfc:L53]. The clear never reads it, so a row recording no
      // amount is detached exactly like one recording an amount.
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({
        capture,
        appliedPromotions: [
          {
            promotionAppliedID: 'applied-amountless-row',
            discountAmount: undefined,
            promotion: { promotionID: 'stale-amountless' },
          },
        ],
      });
      const graph = buildQualifyingGraph('clear-amountless-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);
      const removeIntents = intents.filter((intent) => intent.operation === 'remove');

      expect(removeIntents).toHaveLength(1);
      const removal = requirePresent(removeIntents[0], 'the amountless-row removal');
      expect(removal.promotionAppliedID).toBe('applied-amountless-row');
      expect(removal.promotionID).toBe('stale-amountless');

      // A removal still carries no amount of its own - `discountAmount` is `?: never` on every
      // remove shape, so the member is genuinely absent rather than present-and-undefined.
      expect('discountAmount' in removal).toBe(false);
    });

    it('★★ EVERY removal the clear emits names a row, at all three levels', async () => {
      // The invariant behind the three cases above, asserted over the full three-level output
      // rather than one target at a time: a removal without a row identity is one the consumer
      // cannot apply faithfully.
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({
        capture,
        itemOverrides: [
          { appliedPromotions: [priorRow('stale-i0', '1.00', 'applied-i0')] },
          { appliedPromotions: [priorRow('stale-i1', '2.00', 'applied-i1')] },
        ],
        fulfillmentOverrides: [
          { appliedPromotions: [priorRow('stale-f0', '3.00', 'applied-f0')] },
          { appliedPromotions: [priorRow('stale-f1', '4.00', 'applied-f1')] },
        ],
        appliedPromotions: [priorRow('stale-o', '5.00', 'applied-o')],
      });
      const graph = buildQualifyingGraph('clear-allnamed-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);
      const removeIntents = intents.filter((intent) => intent.operation === 'remove');

      expect(removeIntents).toHaveLength(5);
      for (const removal of removeIntents) {
        expect(typeof removal.promotionAppliedID).toBe('string');
        expect(removal.promotionAppliedID).not.toBe('');
      }
      expect(new Set(removeIntents.map((intent) => intent.promotionAppliedID)).size).toBe(5);
    });

    it('★★★ a SMALLER qualifying discount still displaces a larger stale one - the money case', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({
        capture,
        appliedPromotions: [priorRow('stale-generous', '50.00')],
      });
      const graph = buildQualifyingGraph('clear-money-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);

      const orderIntents = intents.filter((intent) => intent.appliedType === 'order');
      expect(describeIntents(orderIntents)).toStrictEqual([
        `remove/order/${order.orderID}`,
        `add/order/${order.orderID}`,
      ]);

      const removal = requirePresent(orderIntents[0], 'the stale order-level removal');
      const addition = requirePresent(orderIntents[1], 'the fresh order-level addition');
      expect(removal.promotionID).toBe('stale-generous');
      expect(addition.promotionID).toBe(graph.promotion.getPromotionID());

      // The freshly qualified figure is the same 16.95 the golden case computes - the stale row
      // never entered the comparison, so its 50.00 had no influence on the outcome at all.
      expect(intentDiscount(addition).equals(Money.fromDecimalString('16.95'))).toBe(true);
      expect(intentDiscount(addition).isGreaterThan(Money.fromDecimalString('50.00'))).toBe(false);
    });

    it('★★ when NOTHING qualifies, the stale rows are still removed', async () => {
      // The other half of the same defect. With no rewards at all the engine reaches no arm and
      // wins no slot, so there is nothing to add - but
      // [model/service/PromotionService.cfc:L61-L80] has already run, so every prior row goes.
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({
        capture,
        itemOverrides: [{ appliedPromotions: [priorRow('stale-item', '3.00')] }],
        appliedPromotions: [priorRow('stale-order', '50.00')],
      });
      const graph = buildQualifyingGraph('clear-none-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, []);

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);

      const firstItem = requirePresent(order.orderItems[0], 'order item 0');
      expect(describeIntents(intents)).toStrictEqual([
        `remove/orderItem/${firstItem.orderItemID}`,
        `remove/order/${order.orderID}`,
      ]);
      expect(intents.every((intent) => intent.operation === 'remove')).toBe(true);
    });

    it('★ an order carrying nothing emits no removals, and the golden output is unchanged', async () => {
      // The clear is unconditional but not unconditionally NOISY: with nothing to detach it
      // contributes no intent, which is why every other case in this suite reads as it did before.
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('clear-empty-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);

      expect(removals(intents)).toStrictEqual([]);
      expect(intents.every((intent) => intent.operation === 'add')).toBe(true);
    });

    it('★★ no `update` intent is ever emitted, at any level', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({
        capture,
        // A prior row carrying the same promotion the rewards belong to would be the one case an
        // update could plausibly describe. It is still a remove-then-add.
        appliedPromotions: [priorRow('clear-same-promotion', '1.00')],
      });
      const graph = buildQualifyingGraph('clear-same-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);

      expect(intents.some((intent) => intent.operation === 'update')).toBe(false);
      expect(new Set(intents.map((intent) => intent.operation))).toStrictEqual(
        new Set(['remove', 'add']),
      );
    });
  });

  // §1c the pass-two base - [model/service/PromotionService.cfc:L417]

  describe("★★★ the order-level base reflects THIS invocation's fulfillment winner", () => {
    /**
     * The order-level discount for one arming of the golden order.
     */
    async function orderDiscountFor(
      idPrefix: string,
      extra: Parameters<typeof buildQualifyingGraph>[3],
    ): Promise<{ readonly order: Money; readonly fulfillment: Money | undefined }> {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph(idPrefix, order, capture.acceptedPriceGroup, extra);
      const armed = makeSubject();
      armSubject(armed, graph, rewardSequence(graph, 'orderRewardLast'));

      const intents = await armed.service.updateOrderAmountsWithPromotions(order);
      const orderIntent = requirePresent(
        intents.find((intent) => intent.appliedType === 'order'),
        `the order-level intent for ${idPrefix}`,
      );
      const fulfillmentIntent = intents.find((intent) => intent.appliedType === 'orderFulfillment');

      return {
        order: intentDiscount(orderIntent),
        fulfillment:
          fulfillmentIntent === undefined ? undefined : intentDiscount(fulfillmentIntent),
      };
    }

    it('★★★ suppressing the fulfillment discount RAISES the order-level discount', async () => {
      const withFulfillmentDiscount = await orderDiscountFor('base-with-', {});

      // The gate at [model/service/PromotionService.cfc:L353]: a reward listing fulfillment
      // methods that the order's fulfillments do not have skips every fulfillment, so pass one
      // wins nothing there.
      const withoutFulfillmentDiscount = await orderDiscountFor('base-without-', {
        fulfillmentMethodIDs: ['fm-that-no-fulfillment-uses'],
      });

      expect(withFulfillmentDiscount.fulfillment).toBeDefined();
      expect(withoutFulfillmentDiscount.fulfillment).toBeUndefined();

      // Base with a 4.51 fulfillment discount = 129.95 + (9.50 - 4.51) + 0.00 = 134.94 Base
      // without one = 129.95 + 9.50 + 0.00 = 139.45 A larger base yields a larger discount.
      expect(withoutFulfillmentDiscount.order.isGreaterThan(withFulfillmentDiscount.order)).toBe(
        true,
      );
      expect(withoutFulfillmentDiscount.order.equals(withFulfillmentDiscount.order)).toBe(false);
    });

    it('★★ every fulfillment contributes its charge, discounted or not', async () => {
      // CFML parity [model/entity/Order.cfc:L356-L363]: the sum runs across
      // `getOrderFulfillments()` unconditionally.
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({
        capture,
        // Give the pickup fulfillment a real charge. It still wins nothing in the golden arming,
        // so its full 40.00 must land in the base and raise the order-level discount.
        fulfillmentOverrides: [{}, { fulfillmentCharge: Money.fromDecimalString('40.00') }],
      });
      const graph = buildQualifyingGraph('base-all-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);
      const orderIntent = requirePresent(
        intents.find((intent) => intent.appliedType === 'order'),
        'the order-level intent',
      );

      const baseline = await orderDiscountFor('base-all-baseline-', {});
      expect(intentDiscount(orderIntent).isGreaterThan(baseline.order)).toBe(true);
    });

    it('★★ a stale fulfillment row does NOT reduce the base - the clear removed it first', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({
        capture,
        fulfillmentOverrides: [
          {
            appliedPromotions: [
              {
                promotionAppliedID: 'applied-stale-ship',
                discountAmount: Money.fromDecimalString('25.00'),
                promotion: { promotionID: 'stale-ship' },
              },
            ],
          },
        ],
      });
      const graph = buildQualifyingGraph('base-stale-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);

      const shipping = requirePresent(order.orderFulfillments[0], 'the shipping fulfillment');
      const fulfillmentIntents = intents.filter(
        (intent) =>
          intent.appliedType === 'orderFulfillment' &&
          intent.orderFulfillmentID === shipping.orderFulfillmentID,
      );

      // Removed, then re-won at the freshly computed 4.51 - not retained at 25.00 despite 25.00
      // being the larger figure. The strictly-greater test at
      // [model/service/PromotionService.cfc:L385] never saw it.
      expect(describeIntents(fulfillmentIntents)).toStrictEqual([
        `remove/orderFulfillment/${shipping.orderFulfillmentID}`,
        `add/orderFulfillment/${shipping.orderFulfillmentID}`,
      ]);
      const addition = requirePresent(fulfillmentIntents[1], 'the fresh fulfillment addition');
      expect(intentDiscount(addition).equals(Money.fromDecimalString('4.51'))).toBe(true);

      // And the order-level figure is the golden 16.95, proving the base subtracted 4.51 rather
      // than the stale 25.00.
      const orderIntent = requirePresent(
        intents.find((intent) => intent.appliedType === 'order'),
        'the order-level intent',
      );
      expect(intentDiscount(orderIntent).equals(Money.fromDecimalString('16.95'))).toBe(true);
    });
  });

  describe('★★ sale-price seeding competes inside the qualified-discount accumulator', () => {
    /**
     * An order whose first item carries a sale price, everything else golden.
     *
     * The sale price is expressed as a `SalePriceDetail` on the SKU because that is what the
     * shipped seeder reads - `orderItem.sku.getSalePriceDetails()`.
     */
    function makeSalePricedOrder(
      idPrefix: string,
      salePrice: string,
      capture: OrderViewFixtureCapture,
    ): OrderView {
      const salePriceDetail: SalePriceDetail = {
        skuID: `${idPrefix}sale-sku`,
        discountLevel: 'sku',
        salePriceDiscountType: 'amount',
        salePrice: Money.fromDecimalString(salePrice),
        promotionID: `${idPrefix}sale-promotion`,
      };
      const salePricedSku = makeSkuFixture({
        idPrefix: `${idPrefix}sale-sku-`,
        price: Money.fromDecimalString('19.99'),
        salePriceDetail,
      });

      return makeOrderViewFixture({
        idPrefix,
        capture,
        itemOverrides: [
          {
            sku: salePricedSku,
            price: Money.fromDecimalString('19.99'),
            skuPrice: Money.fromDecimalString('19.99'),
            extendedPrice: Money.fromDecimalString('59.97'),
            extendedSkuPrice: Money.fromDecimalString('59.97'),
            quantity: 3,
            appliedPriceGroup: undefined,
          },
        ],
      });
    }

    it("★★★ pass ONE's fulfillment discount LOWERS the pass-two order-reward base", async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('interpass-', order, capture.acceptedPriceGroup);

      const runWith = async (rewards: readonly PromotionReward[]): Promise<Money> => {
        const intents = await armSubject(
          makeSubject(),
          graph,
          rewards,
        ).service.updateOrderAmountsWithPromotions(order);

        return intentDiscount(
          requirePresent(
            intents.find((intent) => intent.appliedType === 'order'),
            'the order-level intent',
          ),
        );
      };

      // With the fulfillment reward: pass one discounts the 9.50 shipping charge by 4.51, so the
      // base is 129.95 + 4.99 = 134.94 and the order-level discount is 16.95.
      const withFulfillmentDiscount = await runWith([
        graph.merchandiseReward,
        graph.fulfillmentReward,
        graph.orderReward,
      ]);
      expect(withFulfillmentDiscount.equals(Money.fromDecimalString('16.95'))).toBe(true);

      // Without it: nothing discounts the shipping charge, so the base is 129.95 + 9.50 = 139.45
      // and the order-level discount is 17.46.
      const withoutFulfillmentDiscount = await runWith([
        graph.merchandiseReward,
        graph.orderReward,
      ]);
      expect(withoutFulfillmentDiscount.equals(Money.fromDecimalString('17.46'))).toBe(true);

      // The direction is the assertion that survives any future change to the fixture's amounts: a
      // fulfillment discount can only ever LOWER what remains discountable at the order level.
      expect(withoutFulfillmentDiscount.isGreaterThan(withFulfillmentDiscount)).toBe(true);
    });

    it('★★ a sale price larger than every reward discount WINS the item slot', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeSalePricedOrder('winseed-', '4.00', capture);
      const graph = buildQualifyingGraph('winseed-g-', order, capture.acceptedPriceGroup);
      const firstItem = requirePresent(order.orderItems[0], 'the sale-priced order item');
      armSubject(subject, graph, rewardSequence(graph, 'noOrderReward'));

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);
      const itemIntent = soleOrderItemIntent(intents, firstItem.orderItemID);

      // CFML parity [model/service/PromotionService.cfc:L145-L162]: seeding runs FIRST, before the
      // reward iteration at [model/service/PromotionService.cfc:L165], and writes into
      // `orderItemQulifiedDiscounts` - the accumulator declared at
      // [model/service/PromotionService.cfc:L142] - not into `promotionRewardUsageDetails`.
      expect(intentDiscount(itemIntent).equals(Money.fromDecimalString('47.97'))).toBe(true);
      const seedOnlySubject = makeSubject();
      armSubject(seedOnlySubject, graph, []);
      const seedOnly = await seedOnlySubject.service.updateOrderAmountsWithPromotions(order);
      expect(
        intentDiscount(soleOrderItemIntent(seedOnly, firstItem.orderItemID)).equals(
          Money.fromDecimalString('47.97'),
        ),
      ).toBe(true);
    });

    it('★★ a STRICTLY LARGER reward discount DISPLACES the sale-price seed', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeSalePricedOrder('lostseed-', '19.50', capture);
      const graph = buildQualifyingGraph('lostseed-g-', order, capture.acceptedPriceGroup);
      const firstItem = requirePresent(order.orderItems[0], 'the sale-priced order item');

      // With no rewards at all the seed is the only candidate, so its own value is established
      // first rather than inferred: (19.99 - 19.50) x.
      const seedOnlySubject = makeSubject();
      armSubject(seedOnlySubject, graph, []);
      const seedOnly = await seedOnlySubject.service.updateOrderAmountsWithPromotions(order);
      const seedAmount = intentDiscount(soleOrderItemIntent(seedOnly, firstItem.orderItemID));
      expect(seedAmount.equals(Money.fromDecimalString('1.47'))).toBe(true);

      armSubject(subject, graph, rewardSequence(graph, 'noOrderReward'));
      const intents = await subject.service.updateOrderAmountsWithPromotions(order);
      const itemIntent = soleOrderItemIntent(intents, firstItem.orderItemID);

      // CFML parity [model/service/PromotionService.cfc:L266-L294]: the accumulator's insertion
      // sort is STRICTLY greater-than, so a seed keeps position 1 against a tie and yields it only
      // to a strictly larger reward discount.
      expect(intentDiscount(itemIntent).equals(Money.fromDecimalString('2.00'))).toBe(true);
      expect(intentDiscount(itemIntent).isGreaterThan(seedAmount)).toBe(true);
      expect(intentsForOrderItem(intents, firstItem.orderItemID).length).toBe(1);
    });

    it('★★ a seed is IMMUNE to over-use stripping, because its reward identifier is the empty string', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeSalePricedOrder('immuneseed-', '19.50', capture);
      const graph = buildQualifyingGraph('immuneseed-g-', order, capture.acceptedPriceGroup, {
        rewardMaximumUsePerOrder: 1,
      });
      const firstItem = requirePresent(order.orderItems[0], 'the sale-priced order item');

      // The reward sequence is reversed so the merchandise reward is the LAST one processed and is
      // therefore the leaked identifier the stripping loop reads.
      const reversed = [...rewardSequence(graph, 'noOrderReward')].reverse();
      armSubject(subject, graph, reversed);

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);
      const itemIntent = soleOrderItemIntent(intents, firstItem.orderItemID);

      // LEGACY-NOTE [model/service/PromotionService.cfc:L145-L162, L468-L521]: seeded entries
      // carry `promotionRewardID = ""`, and the usage ledger never holds a key for the empty
      // string, so the stripping loop can never select a sale-price entry.
      expect(intentDiscount(itemIntent).equals(Money.fromDecimalString('1.47'))).toBe(true);
    });
  });

  // §2 the cross-service ordering constraint, proven in both directions.

  describe('★★★ the cross-service ordering constraint', () => {
    interface OrderingWorld {
      readonly order: OrderView;
      readonly capture: OrderViewFixtureCapture;
      readonly priceGroupGraph: PriceGroupFixtureGraph;
      readonly winningPriceGroup: PriceGroupEntity;
      readonly promotionGraph: PromotionFixtureGraph;
      readonly rewards: readonly PromotionReward[];
    }

    /**
     * The world in which the two passes genuinely interact.
     *
     * `roundValueAnswer` is supplied to the price-group fixture family because its rates are all
     * `percentageOff` and therefore all route through a rounding rule; the fixture's rounder is a
     * caller-controlled double.
     */
    function buildOrderingWorld(idPrefix: string): OrderingWorld {
      const priceGroupGraph = makePriceGroupFixtures({
        idPrefix: `${idPrefix}pg-`,
        roundValueAnswer: '19.00',
      });
      const winningPriceGroup = priceGroupGraph.childPriceGroup;
      const orderSku = makeSkuFixture({
        idPrefix: `${idPrefix}sku-`,
        price: Money.fromDecimalString('30.00'),
        priceGroupRates: [priceGroupGraph.skuLevelRateFirstMatch],
      });
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({
        idPrefix,
        capture,
        itemOverrides: [
          {
            sku: orderSku,
            price: Money.fromDecimalString('30.00'),
            skuPrice: Money.fromDecimalString('31.00'),
            extendedPrice: Money.fromDecimalString('30.00'),
            extendedSkuPrice: Money.fromDecimalString('31.00'),
            quantity: 1,
            appliedPriceGroup: undefined,
          },
        ],
      });
      // `eligiblePriceGroups: []` is the third property: the reward rejects every price group, so
      // an applied one pushes the item onto the correction arm.
      const promotionGraph = buildQualifyingGraph(`${idPrefix}g-`, order, undefined);

      return {
        order,
        capture,
        priceGroupGraph,
        winningPriceGroup,
        promotionGraph,
        rewards: rewardSequence(promotionGraph, 'noOrderReward'),
      };
    }

    /**
     * Applies price-group intents to a COPY of the view. Nothing mutates the original.
     */
    function applyPriceGroupIntents(
      order: OrderView,
      intents: ReadonlyArray<{
        readonly orderItemID: string;
        readonly price: Money;
        readonly priceGroupID: string;
      }>,
      winningPriceGroup: PriceGroupEntity,
    ): OrderView {
      const byOrderItemID = new Map(intents.map((intent) => [intent.orderItemID, intent]));
      const orderItems: readonly OrderItemView[] = order.orderItems.map((orderItem) => {
        const intent = byOrderItemID.get(orderItem.orderItemID);

        if (intent === undefined) {
          return orderItem;
        }

        // Legacy [model/service/PromotionService.cfc:L370-L371] assigns `setPrice(...)` and
        // `setAppliedPriceGroup(...)` into the live aggregate. The target reports them as an
        // intent, so a caller composing the two passes performs exactly this substitution.
        return { ...orderItem, price: intent.price, appliedPriceGroup: winningPriceGroup };
      });

      return { ...order, orderItems };
    }

    it('★ PRECONDITION: the eligible item diverges in skuPrice and price, and the price-group pass produces an intent', async () => {
      const world = buildOrderingWorld('precond-');
      const firstItem = requirePresent(world.order.orderItems[0], 'the price-group-eligible item');

      // The vacuity guard.
      expect(firstItem.skuPrice.equals(firstItem.price)).toBe(false);
      expect(firstItem.skuPrice.equals(Money.fromDecimalString('31.00'))).toBe(true);
      expect(firstItem.price.equals(Money.fromDecimalString('30.00'))).toBe(true);
      expect(firstItem.appliedPriceGroup).toBeUndefined();

      // The extended amounts are consistent with the unit amounts, so the
      // [model/service/PromotionService.cfc:L252] correction term is a real 1.00 rather than
      // fixture noise.
      expect(firstItem.extendedPrice.equals(Money.fromDecimalString('30.00'))).toBe(true);
      expect(firstItem.extendedSkuPrice.equals(Money.fromDecimalString('31.00'))).toBe(true);
      expect(
        firstItem.extendedSkuPrice
          .minus(firstItem.extendedPrice)
          .equals(Money.fromDecimalString('1.00')),
      ).toBe(true);

      const priceGroupIntents = await makePriceGroupSubject([
        world.winningPriceGroup,
      ]).updateOrderAmountsWithPriceGroups(world.order);

      expect(priceGroupIntents).toStrictEqual([
        {
          orderItemID: firstItem.orderItemID,
          price: Money.fromDecimalString('19.00'),
          priceGroupID: world.winningPriceGroup.getPriceGroupID(),
        },
      ]);
    });

    it('★★★ the price-group pass FIRST, then the promotion pass, yields one discount', async () => {
      const world = buildOrderingWorld('forward-');
      const firstItem = requirePresent(world.order.orderItems[0], 'the price-group-eligible item');
      const priceGroupIntents = await makePriceGroupSubject([
        world.winningPriceGroup,
      ]).updateOrderAmountsWithPriceGroups(world.order);
      const orderAfterPriceGroups = applyPriceGroupIntents(
        world.order,
        priceGroupIntents,
        world.winningPriceGroup,
      );
      armSubject(subject, world.promotionGraph, world.rewards);

      const intents = await subject.service.updateOrderAmountsWithPromotions(orderAfterPriceGroups);
      const itemIntent = soleOrderItemIntent(intents, firstItem.orderItemID);

      // LEGACY-NOTE [model/service/PromotionService.cfc:L241-L252]: the discount base depends on
      // applied-price-group state that PriceGroupService.updateOrderAmountsWithPriceGroups writes.
      expect(intentDiscount(itemIntent).equals(Money.fromDecimalString('3.01'))).toBe(true);
    });

    it('★★★ REVERSING the two passes produces a DIFFERENT discount', async () => {
      const world = buildOrderingWorld('reverse-');
      const firstItem = requirePresent(world.order.orderItems[0], 'the price-group-eligible item');

      const forwardSubject = makeSubject();
      armSubject(forwardSubject, world.promotionGraph, world.rewards);
      const forwardIntents = await forwardSubject.service.updateOrderAmountsWithPromotions(
        applyPriceGroupIntents(
          world.order,
          await makePriceGroupSubject([world.winningPriceGroup]).updateOrderAmountsWithPriceGroups(
            world.order,
          ),
          world.winningPriceGroup,
        ),
      );
      const forwardAmount = intentDiscount(
        soleOrderItemIntent(forwardIntents, firstItem.orderItemID),
      );

      // REVERSED: the promotion pass runs against the untouched order, so it never sees the price
      // or the applied price group the price-group pass would have written.
      const reverseSubject = makeSubject();
      armSubject(reverseSubject, world.promotionGraph, world.rewards);
      const reverseIntents = await reverseSubject.service.updateOrderAmountsWithPromotions(
        world.order,
      );
      const latePriceGroupIntents = await makePriceGroupSubject([
        world.winningPriceGroup,
      ]).updateOrderAmountsWithPriceGroups(world.order);
      const reverseAmount = intentDiscount(
        soleOrderItemIntent(reverseIntents, firstItem.orderItemID),
      );

      // The whole point. If these were equal the test would be worthless.
      expect(forwardAmount.equals(reverseAmount)).toBe(false);
      expect(forwardAmount.equals(Money.fromDecimalString('3.01'))).toBe(true);
      expect(reverseAmount.equals(Money.fromDecimalString('4.01'))).toBe(true);
      expect(reverseAmount.isGreaterThan(forwardAmount)).toBe(true);

      // The late pass produced exactly the same intents it would have produced first - it is not
      // the price-group pass that is order-sensitive, it is the promotion pass's READ of what the
      // price-group pass wrote.
      expect(latePriceGroupIntents.length).toBe(1);
    });

    it('★ the [L241-L252] discriminator: no price group and an ACCEPTED one take the uncorrected arm', () => {
      const capture: OrderViewFixtureCapture = {};
      makeOrderViewFixture({ capture, priceGroupEligibility: 'mixed' });

      const arms = requirePresent(capture.itemPriceArmSelections, 'the item price-arm selections');
      expect(arms.length).toBe(3);

      const noPriceGroupArm = requirePresent(arms[0], 'the no-price-group arm selection');
      const acceptedArm = requirePresent(arms[1], 'the accepted-price-group arm selection');
      const rejectedArm = requirePresent(arms[2], 'the rejected-price-group arm selection');

      // CFML parity [model/service/PromotionService.cfc:L241-L252]. The `if` at
      // [model/service/PromotionService.cfc:L241] is taken when the item has no applied price
      // group or the reward lists the item's group as eligible, and it uses `getPrice()` at
      // [model/service/PromotionService.cfc:L244] with no correction.
      expect(noPriceGroupArm.appliedPriceGroupIsNull).toBe(true);
      expect(noPriceGroupArm.rewardAcceptsAppliedPriceGroup).toBe(false);
      expect(noPriceGroupArm.selectedArm).toBe('price');
      expect(noPriceGroupArm.correctionTerm.equals(Money.zero)).toBe(true);

      expect(acceptedArm.appliedPriceGroupIsNull).toBe(false);
      expect(acceptedArm.rewardAcceptsAppliedPriceGroup).toBe(true);
      expect(acceptedArm.selectedArm).toBe('price');
      expect(acceptedArm.correctionTerm.equals(Money.zero)).toBe(true);

      expect(rejectedArm.appliedPriceGroupIsNull).toBe(false);
      expect(rejectedArm.rewardAcceptsAppliedPriceGroup).toBe(false);
      expect(rejectedArm.selectedArm).toBe('skuPriceWithCorrection');
      expect(rejectedArm.correctionTerm.equals(Money.fromDecimalString('14.00'))).toBe(true);
    });

    it('★ an item whose appliedPriceGroup is undefined takes the no-price-group path', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture, priceGroupEligibility: 'none' });
      const graph = buildQualifyingGraph('nopg-', order, undefined);
      armSubject(subject, graph, rewardSequence(graph, 'noOrderReward'));

      // Every item on this order has no applied price group, so
      // [model/service/PromotionService.cfc:L241]'s first disjunct is what carries each of them -
      // the reward's eligibility list is never consulted.
      for (const orderItem of order.orderItems) {
        expect(orderItem.appliedPriceGroup).toBeUndefined();
      }

      const intents = await subject.service.updateOrderAmountsWithPromotions(order);
      const arms = requirePresent(capture.itemPriceArmSelections, 'the item price-arm selections');

      expect(arms.every((arm) => arm.appliedPriceGroupIsNull)).toBe(true);
      expect(arms.every((arm) => arm.selectedArm === 'price')).toBe(true);
      expect(arms.every((arm) => arm.correctionTerm.equals(Money.zero))).toBe(true);
      expect(intents.length).toBeGreaterThan(0);
    });

    it('keeps the two services independent, which is why the seam belongs at this boundary', () => {
      // LEGACY-NOTE [model/service/OrderService.cfc:L51-L67]: OrderService - explicitly out of
      // scope - declares its DAO plus fifteen service properties, sixteen injected collaborators
      // in all.
      expect(PromotionService.length).toBe(4);
      expect(PriceGroupService.length).toBe(3);

      const promotionMembers = Object.getOwnPropertyNames(PromotionService.prototype);
      expect(
        promotionMembers.some((member) => member.toLowerCase().includes('pricegroupservice')),
      ).toBe(false);

      const priceGroupMembers = Object.getOwnPropertyNames(PriceGroupService.prototype);
      expect(
        priceGroupMembers.some((member) => member.toLowerCase().includes('promotionservice')),
      ).toBe(false);
      expect(priceGroupMembers).toContain('updateOrderAmountsWithPriceGroups');
      expect(promotionMembers).toContain('updateOrderAmountsWithPromotions');
    });
  });

  // §3 DEFECT 15 - the two use-count methods return NUMBERS despite `boolean` declarations.

  describe('★ the two promotion-code use-count methods', () => {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L1094-L1100]: getPromotionCodeUseCount and
    // getPromotionCodeAccountUseCount both declare returntype="boolean" while returning the DAO's
    // numeric count. Recorded, not reproduced: AAP 0.4.2 types both as `Promise<number>`.

    it('★★ getPromotionCodeUseCount lets a count GREATER THAN ONE survive as that number', async () => {
      const graph = makePromotionFixtures({ idPrefix: 'usecount-' });
      subject.repository.promotionCodeUseCount = 7;

      const count = await subject.service.getPromotionCodeUseCount(graph.promotionCode);

      // The assertion that actually catches a wrong port: `true`, `1` and `7` are three different
      // answers, and only the third is faithful.
      expect(count).toBe(7);
      expect(typeof count).toBe('number');
      expect(count).not.toBe(true);
      expect(count).not.toBe(1);
      expect(subject.repository.promotionCodeUseCountCalls).toStrictEqual([graph.promotionCode]);
    });

    it('★ a ZERO count surfaces as 0, not as false', async () => {
      const graph = makePromotionFixtures({ idPrefix: 'usecount-zero-' });
      subject.repository.promotionCodeUseCount = 0;

      const count = await subject.service.getPromotionCodeUseCount(graph.promotionCode);

      expect(count).toBe(0);
      expect(typeof count).toBe('number');
      expect(count).not.toBe(false);
    });

    it('★★ getPromotionCodeAccountUseCount takes an OPAQUE accountID and returns a number', async () => {
      const graph = makePromotionFixtures({ idPrefix: 'usecount-acct-' });
      subject.repository.promotionCodeAccountUseCount = 4;

      // CFML parity [model/service/PromotionService.cfc:L1098]: the legacy parameter is
      // `required any account`, an Account ENTITY.
      const count = await subject.service.getPromotionCodeAccountUseCount(
        graph.promotionCode,
        'account-opaque-1',
      );

      expect(count).toBe(4);
      expect(typeof count).toBe('number');
      expect(count).not.toBe(true);
      expect(subject.repository.promotionCodeAccountUseCountCalls).toStrictEqual([
        { promotionCode: graph.promotionCode, accountID: 'account-opaque-1' },
      ]);
    });

    it('answers a zero account count as 0, and both members are asynchronous', async () => {
      const graph = makePromotionFixtures({ idPrefix: 'usecount-async-' });
      subject.repository.promotionCodeUseCount = 3;
      subject.repository.promotionCodeAccountUseCount = 0;

      const usePromise = subject.service.getPromotionCodeUseCount(graph.promotionCode);
      const accountPromise = subject.service.getPromotionCodeAccountUseCount(
        graph.promotionCode,
        'account-opaque-2',
      );

      expect(usePromise).toBeInstanceOf(Promise);
      expect(accountPromise).toBeInstanceOf(Promise);
      expect(await usePromise).toBe(3);
      expect(await accountPromise).toBe(0);
    });
  });

  // §4 all five visibility widenings, and the proof that there is no sixth.

  describe('★★ the five visibility widenings', () => {
    // JUDGMENT CALL: five legacy private helpers (L549, L629, L752, L783, L987) are promoted to
    // exported members so they are directly testable.

    it('widening 1 [L549]: getPromotionPeriodQualificationDetails is ASYNC and callable', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('w1-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));

      const pending = subject.service.getPromotionPeriodQualificationDetails(
        graph.promotionPeriod,
        order,
      );
      expect(pending).toBeInstanceOf(Promise);

      const details: PeriodQualification = await pending;

      expect(details.qualificationsMeet).toBe(true);
      expect(details.qualifiedFulfillmentIDs).toStrictEqual(['of-shipping-1', 'of-pickup-1']);
      expect(details.qualifierDetails.length).toBe(1);
      expect(typeof details.orderItems).toBe('object');
    });

    it('widening 2 [L629]: getQualifierQualificationDetails is SYNCHRONOUS and callable', () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('w2-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));

      const details: QualifierQualification = subject.service.getQualifierQualificationDetails(
        graph.promotionQualifier,
        order,
      );

      expect(details).not.toBeInstanceOf(Promise);
      expect(details.qualifier).toBe(graph.promotionQualifier);
      expect(details.qualificationCount).toBe(9);
      expect(details.qualifiedOrderItemDetails.length).toBe(3);
    });

    it('★ widening 3 [L752]: getPromotionPeriodQualifiedFulfillmentIDList returns a COMMA-DELIMITED STRING', () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('w3-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));

      const list = subject.service.getPromotionPeriodQualifiedFulfillmentIDList(
        graph.promotionPeriod,
        order,
      );
      expect(typeof list).toBe('string');
      expect(list).toBe('of-shipping-1,of-pickup-1');
      expect(Array.isArray(list)).toBe(false);
      expect(list.split(',').length).toBe(2);
      expect(list).toBe(
        order.orderFulfillments.map((fulfillment) => fulfillment.orderFulfillmentID).join(','),
      );

      // LEGACY-NOTE [model/service/PromotionService.cfc:L752]: this helper has zero call sites
      // anywhere in the legacy codebase - a search returns only its own definition line.
      expect(capture.qualifiedFulfillmentIDCount).toBe(2);
    });

    it('widening 4 [L783]: getPromotionPeriodOrderItemQualificationCount is SYNCHRONOUS and returns a count', () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('w4-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));
      const firstItem = requirePresent(order.orderItems[0], 'golden order item 0');
      const secondItem = requirePresent(order.orderItems[1], 'golden order item 1');
      const thirdItem = requirePresent(order.orderItems[2], 'golden order item 2');

      const first = subject.service.getPromotionPeriodOrderItemQualificationCount(
        graph.promotionPeriod,
        firstItem,
        order,
      );
      const second = subject.service.getPromotionPeriodOrderItemQualificationCount(
        graph.promotionPeriod,
        secondItem,
        order,
      );
      const third = subject.service.getPromotionPeriodOrderItemQualificationCount(
        graph.promotionPeriod,
        thirdItem,
        order,
      );

      // A plain count, never money.
      expect(typeof first).toBe('number');
      expect([first, second, third]).toStrictEqual([3, 2, 4]);
      expect([first, second, third]).toStrictEqual(
        order.orderItems.map((orderItem) => orderItem.quantity),
      );
    });

    it('widening 5 [L987]: getDiscountAmount is SYNCHRONOUS and returns Money', () => {
      const graph = makePromotionFixtures({ idPrefix: 'w5-' });

      const unrounded = subject.service.getDiscountAmount(
        graph.unroundedReward,
        Money.fromDecimalString('19.99'),
        3,
      );

      expect(unrounded).not.toBeInstanceOf(Promise);
      expect(unrounded).toBeInstanceOf(Money);

      // The migration's published reference calculation: 19.99 x 3 = 59.97, 12.5% of which is
      // 7.49625, presented at two decimals as 7.50.
      expect(unrounded.equals(Money.fromDecimalString('7.50'))).toBe(true);
      expect(graph.referenceCalculation.discountAmount).toBe('7.49625');
      expect(graph.referenceCalculation.presentedDiscountAmount).toBe('7.50');

      // The quantity is a PLAIN COUNT on the way in, and the result is Money on the way out. The
      // amountType strategies and the rounding branch belong to promotion/discountAmount.test.ts
      // and are not restated here.
      const rounded = subject.service.getDiscountAmount(
        graph.percentageOffReward,
        Money.fromDecimalString('19.99'),
        3,
      );
      expect(rounded.equals(Money.fromDecimalString('7.98'))).toBe(true);
      expect(rounded.equals(unrounded)).toBe(false);
    });

    it('★★ the CLAMP does not hold: a discount can exceed the amount it discounts', () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L1013-L1015]: the guard reads
      // `if(discountAmountPreRounding > originalAmount) { discountAmount = originalAmount; }` - it
      // tests the pre-rounding figure and overwrites the post-rounding one.
      // Preserved deliberately; do not fix without a product decision.
      const graph = makePromotionFixtures({
        idPrefix: 'clamp-',
        roundingRule: makePriceGroupFixtures({ idPrefix: 'clamp-pg-' }).roundDownRoundingRule,
      });
      const price = Money.fromDecimalString('0.42');

      const discount = subject.service.getDiscountAmount(graph.percentageOffReward, price, 1);

      // 0.42 at 12.5 % gives a pre-rounding discount of 0.0525 and a net of 0.3675.
      expect(discount.toFixed2()).toBe('1.41');
      expect(discount.isGreaterThan(price)).toBe(true);

      // The postcondition a caller would reasonably assume, shown not to hold.
      expect(price.minus(discount).isLessThan(Money.zero)).toBe(true);

      // And it is the CLAMP that is ineffective rather than the arithmetic being unreachable: the
      // same reward on a larger amount stays comfortably inside the bound.
      const largerPrice = Money.fromDecimalString('59.97');
      const largerDiscount = subject.service.getDiscountAmount(
        graph.percentageOffReward,
        largerPrice,
        1,
      );
      expect(largerDiscount.isGreaterThan(largerPrice)).toBe(false);
    });

    it('★★ promotes NO SIXTH private helper: the prototype surface is exactly what is documented', () => {
      const members = Object.getOwnPropertyNames(PromotionService.prototype).sort();

      // The twelve documented public methods, all carrying their legacy CFML names verbatim.
      const documentedPublicSurface = [
        'getDiscountAmount',
        'getOrderItemInQualifier',
        'getOrderItemInReward',
        'getPromotionCodeAccountUseCount',
        'getPromotionCodeUseCount',
        'getPromotionPeriodOrderItemQualificationCount',
        'getPromotionPeriodQualificationDetails',
        'getPromotionPeriodQualifiedFulfillmentIDList',
        'getQualifierQualificationDetails',
        'getSalePriceDetailsForProductSkus',
        'getShippingMethodOptionsDiscountAmountDetails',
        'updateOrderAmountsWithPromotions',
      ];

      // The six target-internal helpers.
      const targetInternalHelpers = [
        'applyFulfillmentReward',
        'applyOrderItemReward',
        'applyOrderReward',
        'insertQualifiedDiscountDescending',
        'resolveOrderItemDiscountAmount',
        'visitReward',
      ];

      expect(members).toStrictEqual(
        ['constructor', ...documentedPublicSurface, ...targetInternalHelpers].sort(),
      );
      expect(documentedPublicSurface.length).toBe(12);

      for (const member of documentedPublicSurface) {
        expect(typeof Reflect.get(PromotionService.prototype, member)).toBe('function');
      }

      // The five widenings, and no more.
      const widenings = [
        'getPromotionPeriodQualificationDetails',
        'getQualifierQualificationDetails',
        'getPromotionPeriodQualifiedFulfillmentIDList',
        'getPromotionPeriodOrderItemQualificationCount',
        'getDiscountAmount',
      ];
      expect(widenings.length).toBe(5);
      expect(widenings.every((member) => documentedPublicSurface.includes(member))).toBe(true);
      const alreadyPublic = [
        'getOrderItemInQualifier',
        'getOrderItemInReward',
        'getSalePriceDetailsForProductSkus',
        'getShippingMethodOptionsDiscountAmountDetails',
        'getPromotionCodeUseCount',
        'getPromotionCodeAccountUseCount',
      ];
      expect(alreadyPublic.length).toBe(6);
      expect(alreadyPublic.some((member) => widenings.includes(member))).toBe(false);

      // Five widenings + six already-public + the entry point
      // [model/service/PromotionService.cfc:L58] = the whole twelve, with nothing left over and
      // nothing counted twice.
      expect(
        [...widenings, ...alreadyPublic, 'updateOrderAmountsWithPromotions'].sort(),
      ).toStrictEqual([...documentedPublicSurface].sort());
    });
  });

  // §5 mandatory regression - `issue_1766`

  describe('★★ issue_1766 - the preserved return/exchange no-op', () => {
    // If( listFindNoCase("otReturnOrder,otExchangeOrder",
    // arguments.order.getOrderType().getSystemCode()) ) { //
    // TODO [issue #1766]: In the future allow for return Items to have negative promotions //
    // applied.
    //
    // LEGACY-NOTE [model/service/PromotionService.cfc:L541-L544]:
    // TODO [issue #1766] - the return/exchange branch is empty in the source.

    it('issue_1766: the return and exchange branch is present and still does nothing', async () => {
      const returnCapture: OrderViewFixtureCapture = {};
      const returnOrder = makeOrderViewFixture({
        capture: returnCapture,
        orderTypeSystemCode: 'otReturnOrder',
      });
      const returnGraph = buildQualifyingGraph(
        'i1766-return-',
        returnOrder,
        returnCapture.acceptedPriceGroup,
      );
      armSubject(subject, returnGraph, rewardSequence(returnGraph, 'orderRewardLast'));

      const returnIntents = await subject.service.updateOrderAmountsWithPromotions(returnOrder);

      // A return order fails the [model/service/PromotionService.cfc:L61] gate, so no promotion
      // work happens at all, and then reaches the [model/service/PromotionService.cfc:L542] branch
      // which does nothing.
      expect(returnIntents).toStrictEqual([]);
      expect(returnCapture.reachesReturnExchangeNoOp).toBe(true);
    });

    it('issue_1766: an EXCHANGE order satisfies BOTH sequential gates and still gets no negative promotion', async () => {
      const exchangeCapture: OrderViewFixtureCapture = {};
      const exchangeOrder = makeOrderViewFixture({
        capture: exchangeCapture,
        orderTypeSystemCode: 'otExchangeOrder',
      });
      const exchangeGraph = buildQualifyingGraph(
        'i1766-exchange-',
        exchangeOrder,
        exchangeCapture.acceptedPriceGroup,
      );
      armSubject(subject, exchangeGraph, rewardSequence(exchangeGraph, 'orderRewardLast'));

      const exchangeIntents = await subject.service.updateOrderAmountsWithPromotions(exchangeOrder);

      // CFML parity [model/service/PromotionService.cfc:L61, L542]: `otExchangeOrder` appears in
      // both order-type gates and the two `if`s are SEQUENTIAL, not `else if`. An exchange order
      // therefore runs the FULL promotion pipeline and then reaches the no-op branch.
      expect(exchangeCapture.reachesReturnExchangeNoOp).toBe(true);
      expect(exchangeIntents.length).toBe(4);
      expect(exchangeIntents.every((intent) => intent.operation === 'add')).toBe(true);

      // Nothing the no-op branch could have added is present: every discount is positive, and no
      // intent targets a return item with a negative amount.
      for (const intent of exchangeIntents) {
        expect(intentDiscount(intent).isLessThan(Money.zero)).toBe(false);
      }

      // A sales order - which satisfies only the FIRST gate - produces the same intents, which is
      // how "the branch does nothing" is observable at all.
      const salesCapture: OrderViewFixtureCapture = {};
      const salesOrder = makeOrderViewFixture({
        capture: salesCapture,
        orderTypeSystemCode: 'otSalesOrder',
      });
      const salesGraph = buildQualifyingGraph(
        'i1766-sales-',
        salesOrder,
        salesCapture.acceptedPriceGroup,
      );
      const salesSubject = makeSubject();
      armSubject(salesSubject, salesGraph, rewardSequence(salesGraph, 'orderRewardLast'));
      const salesIntents = await salesSubject.service.updateOrderAmountsWithPromotions(salesOrder);

      expect(salesCapture.reachesReturnExchangeNoOp).toBe(false);
      expect(describeIntents(exchangeIntents)).toStrictEqual(describeIntents(salesIntents));
    });
  });

  // §6 use-limit enforcement - preserved, not corrected.

  describe('★★ use-limit enforcement is preserved, not corrected', () => {
    it('★★ the MUTABLE usage ledger makes the outcome depend on which rewards ran first', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('ledger-', order, capture.acceptedPriceGroup, {
        rewardMaximumUsePerOrder: 1,
      });

      const forwardSequence = rewardSequence(graph, 'orderRewardLast');
      const reversedSequence = [...forwardSequence].reverse();
      const forwardIntents = await armSubject(
        makeSubject(),
        graph,
        forwardSequence,
      ).service.updateOrderAmountsWithPromotions(order);
      const reversedIntents = await armSubject(
        makeSubject(),
        graph,
        reversedSequence,
      ).service.updateOrderAmountsWithPromotions(order);

      // ORDER DEPENDENCE, at the pipeline level. The reward SET is identical; only the sequence
      // differs, and the money differs with it.
      expect(reversedSequence.length).toBe(forwardSequence.length);
      expect(
        [...reversedSequence].sort((left, right) =>
          left.getPromotionRewardID().localeCompare(right.getPromotionRewardID()),
        ),
      ).toStrictEqual(
        [...forwardSequence].sort((left, right) =>
          left.getPromotionRewardID().localeCompare(right.getPromotionRewardID()),
        ),
      );
      expect(describeIntents(forwardIntents)).not.toStrictEqual(describeIntents(reversedIntents));
      expect(forwardIntents.length).toBe(4);
      expect(reversedIntents.length).toBe(3);
    });

    it('a limit high enough for every reward makes the two sequences agree, which is the control', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('ledger-control-', order, capture.acceptedPriceGroup, {
        rewardMaximumUsePerOrder: 2,
      });

      const forwardSequence = rewardSequence(graph, 'orderRewardLast');
      const reversedSequence = [...forwardSequence].reverse();

      const forwardIntents = await armSubject(
        makeSubject(),
        graph,
        forwardSequence,
      ).service.updateOrderAmountsWithPromotions(order);
      const reversedIntents = await armSubject(
        makeSubject(),
        graph,
        reversedSequence,
      ).service.updateOrderAmountsWithPromotions(order);

      // With the allowance wide enough, order dependence is INVISIBLE. That is exactly why the
      // previous case has to constrain the limit: an unconstrained fixture would let a broken port
      // pass.
      expect(describeIntents(forwardIntents)).toStrictEqual(describeIntents(reversedIntents));
      expect(forwardIntents.length).toBe(4);
      expect(reversedIntents.length).toBe(4);
    });

    it('★ the 1000000 unlimited sentinel survives as that literal, and takes part in arithmetic', () => {
      const graph = makePromotionFixtures({ idPrefix: 'sentinel-' });

      expect(UNLIMITED_USE_SENTINEL).toBe(1000000);
      expect(graph.unlimitedUseSentinel).toBe(UNLIMITED_USE_SENTINEL);

      // CFML parity [model/service/PromotionService.cfc:L223, L224, L228, L236, L472]: the
      // sentinel is a NUMBER that participates in live subtraction and comparison, so it cannot be
      // modelled as `Infinity`, `Number.MAX_SAFE_INTEGER`, `null`, `undefined`.
      expect(UNLIMITED_USE_SENTINEL - UNLIMITED_USE_SENTINEL).toBe(0);
      expect(Number.isNaN(Number.POSITIVE_INFINITY - Number.POSITIVE_INFINITY)).toBe(true);
      expect(Number.isFinite(UNLIMITED_USE_SENTINEL)).toBe(true);
      expect(UNLIMITED_USE_SENTINEL).not.toBe(Number.POSITIVE_INFINITY);
      expect(UNLIMITED_USE_SENTINEL).not.toBe(Number.MAX_SAFE_INTEGER);
    });

    it('★★ a persisted maximum of exactly 0 - or a NEGATIVE one - means UNLIMITED', async () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L180, L183, L186]: the use-limit
      // override guard is `!isNull(x) && x > 0`, so a persisted maximum of exactly 0 - or a
      // negative value - fails the guard and the 1000000 unlimited sentinel survives.
      // Preserved deliberately; do not fix without a product decision.
      const graph = makePromotionFixtures({ idPrefix: 'limits-' });

      // The four persisted shapes, straight off the entities.
      expect([
        graph.unlimitedUseLimitsReward.getMaximumUsePerOrder(),
        graph.unlimitedUseLimitsReward.getMaximumUsePerItem(),
        graph.unlimitedUseLimitsReward.getMaximumUsePerQualification(),
      ]).toStrictEqual([undefined, undefined, undefined]);
      expect([
        graph.zeroUseLimitsReward.getMaximumUsePerOrder(),
        graph.zeroUseLimitsReward.getMaximumUsePerItem(),
        graph.zeroUseLimitsReward.getMaximumUsePerQualification(),
      ]).toStrictEqual([0, 0, 0]);
      expect([
        graph.negativeUseLimitsReward.getMaximumUsePerOrder(),
        graph.negativeUseLimitsReward.getMaximumUsePerItem(),
        graph.negativeUseLimitsReward.getMaximumUsePerQualification(),
      ]).toStrictEqual([-1, -1, -1]);
      expect([
        graph.boundedUseLimitsReward.getMaximumUsePerOrder(),
        graph.boundedUseLimitsReward.getMaximumUsePerItem(),
        graph.boundedUseLimitsReward.getMaximumUsePerQualification(),
      ]).toStrictEqual([2, 1, 3]);

      // And the pipeline consequence: 0 and -1 both behave like "no limit was persisted at all".
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });

      const runWithLimit = async (
        idPrefix: string,
        overrides: PromotionFixtureOverrides,
      ): Promise<readonly string[]> => {
        const limitedGraph = buildQualifyingGraph(
          idPrefix,
          order,
          capture.acceptedPriceGroup,
          overrides,
        );
        const reversedSequence = [...rewardSequence(limitedGraph, 'orderRewardLast')].reverse();
        const intents = await armSubject(
          makeSubject(),
          limitedGraph,
          reversedSequence,
        ).service.updateOrderAmountsWithPromotions(order);

        return describeIntents(intents);
      };

      const absent = await runWithLimit('limits-absent-', {});
      const zero = await runWithLimit('limits-zero-', { rewardMaximumUsePerOrder: 0 });
      const negative = await runWithLimit('limits-negative-', { rewardMaximumUsePerOrder: -1 });
      const bounded = await runWithLimit('limits-bounded-', { rewardMaximumUsePerOrder: 1 });

      expect(zero).toStrictEqual(absent);
      expect(negative).toStrictEqual(absent);

      // The guard stays `>` and gains no zero branch: a genuinely positive limit is the only thing
      // that overrides the sentinel, and it does change the outcome.
      expect(bounded).not.toStrictEqual(absent);
    });

    it('★★ a GUEST order is never blocked by maximumAccountUseCount, however high the count', async () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L574-L581]: the per-account use-limit
      // check is wrapped in `if(!isNull(arguments.order.getAccount()))` at L575.
      // Preserved deliberately; do not fix without a product decision.
      const capture: OrderViewFixtureCapture = {};

      // A per-account limit of 1, and a persisted account use count FAR above it. An identified
      // order must be refused; a guest order must not be.
      const overrides: PromotionFixtureOverrides = { promotionPeriodMaximumAccountUseCount: 1 };

      const runFor = async (
        idPrefix: string,
        accountID: string | undefined,
      ): Promise<{
        readonly qualifies: boolean;
        readonly intents: readonly string[];
        readonly accountCountCalls: number;
      }> => {
        const order = makeOrderViewFixture({ capture, accountID });
        const graph = buildQualifyingGraph(idPrefix, order, capture.acceptedPriceGroup, overrides);
        const subjectForRun = armSubject(
          makeSubject(),
          graph,
          rewardSequence(graph, 'orderRewardLast'),
        );
        subjectForRun.repository.promotionPeriodAccountUseCount = 99;

        const qualification = await subjectForRun.service.getPromotionPeriodQualificationDetails(
          graph.promotionPeriod,
          order,
        );
        const intents = await subjectForRun.service.updateOrderAmountsWithPromotions(order);

        return {
          qualifies: qualification.qualificationsMeet,
          intents: describeIntents(intents),
          accountCountCalls: subjectForRun.repository.promotionPeriodAccountUseCountCalls.length,
        };
      };

      const identified = await runFor('guest-identified-', 'account-with-exhausted-limit');
      const guest = await runFor('guest-anonymous-', undefined);

      // The identified order is refused, and the count really was consulted - without this the
      // guest result could pass for the wrong reason.
      expect(identified.qualifies).toBe(false);
      expect(identified.accountCountCalls).toBeGreaterThan(0);
      expect(identified.intents).toStrictEqual([]);

      // The guest order qualifies, and [model/service/PromotionService.cfc:L575] means the
      // repository is never even asked.
      expect(guest.qualifies).toBe(true);
      expect(guest.accountCountCalls).toBe(0);
      expect(guest.intents.length).toBeGreaterThan(0);
    });

    it('★★ a FULFILLMENT reward ignores maximumUsePerOrder - the arm never touches the ledger', async () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L345-L412]: no line in the fulfillment
      // arm reads, seeds or increments `promotionRewardUsageDetails`.
      // Preserved deliberately; do not fix without a product decision.
      const capture: OrderViewFixtureCapture = {};

      // Three qualifying fulfillments against a reward limited to two uses per order.
      const seedOrder = makeOrderViewFixture({ capture });
      const baseFulfillment = requirePresent(
        seedOrder.orderFulfillments[0],
        'the golden shipping fulfillment',
      );
      const order = makeOrderViewFixture({
        capture,
        orderFulfillments: [
          {
            ...baseFulfillment,
            orderFulfillmentID: 'of-limit-probe-1',
            fulfillmentCharge: Money.fromDecimalString('40.00'),
          },
          {
            ...baseFulfillment,
            orderFulfillmentID: 'of-limit-probe-2',
            fulfillmentCharge: Money.fromDecimalString('30.00'),
          },
          {
            ...baseFulfillment,
            orderFulfillmentID: 'of-limit-probe-3',
            fulfillmentCharge: Money.fromDecimalString('20.00'),
          },
        ],
      });
      const graph = buildQualifyingGraph('fulfil-limit-', order, capture.acceptedPriceGroup);

      // PRECONDITION: the fulfillment reward really does carry a positive per-order limit BELOW
      // the number of fulfillments. Without this the case could pass because no limit was set at
      // all.
      const fulfillmentUseLimit = requirePresent(
        graph.fulfillmentReward.getMaximumUsePerOrder(),
        "the fulfillment reward's per-order use limit",
      );
      expect(fulfillmentUseLimit).toBe(2);
      expect(order.orderFulfillments.length).toBeGreaterThan(2);

      const intents = await armSubject(
        makeSubject(),
        graph,
        rewardSequence(graph, 'orderRewardLast'),
      ).service.updateOrderAmountsWithPromotions(order);

      const fulfillmentIntents = intents.filter(
        (intent) => intent.appliedType === 'orderFulfillment',
      );

      // Three distinct fulfillment discounts from a reward limited to two uses per order.
      expect(fulfillmentIntents.length).toBe(3);
      expect(fulfillmentIntents.length).toBeGreaterThan(fulfillmentUseLimit);
      expect(
        fulfillmentIntents.every((intent) => intentDiscount(intent).isGreaterThan(Money.zero)),
      ).toBe(true);
      expect(
        new Set(
          fulfillmentIntents.map((intent) =>
            intent.appliedType === 'orderFulfillment' ? intent.orderFulfillmentID : '',
          ),
        ).size,
      ).toBe(3);
    });

    it('★★ the pipeline money reflects DEFECT 9 - stripping enforced against the last reward processed', async () => {
      // LEGACY-DEFECT [model/service/PromotionService.cfc:L468-L521]: over-use stripping reads the
      // maximum and the usage list from the `reward` variable left over from the previous loop
      // rather than from `prID`, so maximum-use-per-order is enforced against whichever reward
      // happened to be processed last.
      // Preserved deliberately; do not fix without a product decision.
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('defect9-', order, capture.acceptedPriceGroup, {
        rewardMaximumUsePerOrder: 1,
      });
      expect(graph.opaqueOrderReferences.orderItemID).not.toBe(
        graph.opaqueOrderReferences.secondOrderItemID,
      );
      expect(order.orderItems.length).toBeGreaterThanOrEqual(2);
      expect(rewardSequence(graph, 'orderRewardLast').length).toBeGreaterThanOrEqual(2);

      const forwardSequence = rewardSequence(graph, 'orderRewardLast');
      const reversedSequence = [...forwardSequence].reverse();
      const firstItemID = requirePresent(order.orderItems[0], 'golden order item 0').orderItemID;

      const forwardIntents = await armSubject(
        makeSubject(),
        graph,
        forwardSequence,
      ).service.updateOrderAmountsWithPromotions(order);
      const reversedIntents = await armSubject(
        makeSubject(),
        graph,
        reversedSequence,
      ).service.updateOrderAmountsWithPromotions(order);
      const survives = intentsForOrderItem(forwardIntents, firstItemID);
      const stripped = intentsForOrderItem(reversedIntents, firstItemID);

      expect(survives.length).toBe(1);
      expect(
        intentDiscount(requirePresent(survives[0], 'the surviving intent')).isGreaterThan(
          Money.zero,
        ),
      ).toBe(true);
      expect(stripped.length).toBe(0);

      // The rest of the order is untouched, so the effect is genuinely per-key and not a wholesale
      // suppression of the run.
      expect(reversedIntents.length).toBeGreaterThan(0);
    });

    it('★ an EMPTY reward collection produces no order-level pass at all', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('twopass-empty-', order, capture.acceptedPriceGroup);
      const emptyOrdering = requirePresent(
        graph.rewardOrderings.find((candidate) => candidate.name === 'empty'),
        "the 'empty' reward ordering",
      );

      expect(emptyOrdering.rewards).toStrictEqual([]);
      expect(emptyOrdering.reachesPassTwo).toBe(false);

      const intents = await armSubject(
        makeSubject(),
        graph,
        emptyOrdering.rewards,
      ).service.updateOrderAmountsWithPromotions(order);

      // CFML parity [model/service/PromotionService.cfc:L166, L458-L461]: the
      // `pr = 0; orderRewards = true;` reset sits INSIDE the reward loop, so with nothing to
      // iterate the second pass never starts.
      expect(intents).toStrictEqual([]);
    });

    it('★ a NON-QUALIFYING LAST reward suppresses the whole order-reward pass', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('twopass-', order, capture.acceptedPriceGroup);

      // A reward whose period cannot qualify: its minimum item price sits far above every price in
      // the golden order, so no item qualifies, the qualifier's qualification count is zero.
      const nonQualifyingGraph = buildQualifyingGraph(
        'twopass-bad-',
        order,
        capture.acceptedPriceGroup,
        {
          qualifierGates: {
            minimumItemPrice: Money.fromDecimalString('999999.00'),
            minimumFulfillmentWeight: 0,
          },
        },
      );

      // PRECONDITION: the reward really does fail qualification.
      const badQualification = await subject.service.getPromotionPeriodQualificationDetails(
        nonQualifyingGraph.promotionPeriod,
        order,
      );
      expect(badQualification.qualificationsMeet).toBe(false);

      const goodSequence = rewardSequence(graph, 'orderRewardLast');
      const badLast = [...goodSequence, nonQualifyingGraph.merchandiseReward];
      const badFirst = [nonQualifyingGraph.merchandiseReward, ...goodSequence];

      const badLastIntents = await armSubject(
        makeSubject(),
        graph,
        badLast,
      ).service.updateOrderAmountsWithPromotions(order);
      const badFirstIntents = await armSubject(
        makeSubject(),
        graph,
        badFirst,
      ).service.updateOrderAmountsWithPromotions(order);

      // CFML parity [model/service/PromotionService.cfc:L458-L463]: the pass-two reset sits inside
      // the reward loop and inside the qualification gate that closes at L463.
      expect(badLastIntents.some((intent) => intent.appliedType === 'order')).toBe(false);
      expect(badFirstIntents.some((intent) => intent.appliedType === 'order')).toBe(true);

      // The same non-qualifying reward, moved to the front, costs nothing: the pass runs and the
      // order-level discount appears. Only its POSITION mattered.
      const orderIntent = requirePresent(
        badFirstIntents.find((intent) => intent.appliedType === 'order'),
        'the order-level intent',
      );
      expect(intentDiscount(orderIntent).equals(Money.fromDecimalString('16.95'))).toBe(true);

      // LEGACY-NOTE [model/service/PromotionService.cfc:L417, L419]: the order-level branch sums
      // getSubtotalAfterItemDiscounts() and getFulfillmentChargeAfterDiscountTotal() with a PLAIN
      // `+` rather than through precisionEvaluate - a precision gap distinct from the `amountOff`
      // gap at L998.
      expect(
        order.subtotalAfterItemDiscounts
          .plus(order.fulfillmentChargeAfterDiscountTotal)
          .equals(Money.fromDecimalString('127.45')),
      ).toBe(true);
    });
  });

  // §7 the remaining facade methods.

  describe('the remaining façade methods', () => {
    it('getOrderItemInQualifier and getOrderItemInReward are SYNCHRONOUS and answer booleans', () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('membership-', order, capture.acceptedPriceGroup);
      const orderItem: OrderItemView = requirePresent(order.orderItems[0], 'golden order item 0');

      // Annotated with the shipped parameter types on purpose: the façade takes the QUALIFIER
      // ENTITY and the order-item VIEW, and a port that flattened either into a bag of primitives
      // would fail to compile here.
      const qualifier: PromotionQualifier = graph.promotionQualifier;
      const inQualifier = subject.service.getOrderItemInQualifier(qualifier, orderItem);
      const inReward = subject.service.getOrderItemInReward(graph.merchandiseReward, orderItem);

      expect(inQualifier).not.toBeInstanceOf(Promise);
      expect(inReward).not.toBeInstanceOf(Promise);
      expect(typeof inQualifier).toBe('boolean');
      expect(typeof inReward).toBe('boolean');
      expect(inQualifier).toBe(true);
      expect(inReward).toBe(true);

      // LEGACY-NOTE [model/service/PromotionService.cfc:L852, L921]: both helpers were ALREADY
      // public in the legacy component, so neither is a visibility widening.
      expect(graph.qualifierManyToManyCollectionCount).toBeGreaterThan(0);
    });

    it('★ getSalePriceDetailsForProductSkus keys by SKU ID and rounds ONLY for a non-empty rounding-rule ID', async () => {
      const graph = makePromotionFixtures({ idPrefix: 'salemap-' });
      subject.repository.roundingRule = graph.roundingRule;

      // Two rows over the same sale price. The first carries no rounding-rule identifier at all,
      // so its value must survive verbatim; the second names one, so its value must come back
      // rounded.
      subject.repository.salePriceRows = [
        {
          skuID: 'sku-row-1',
          discountLevel: 'sku',
          salePriceDiscountType: 'amount',
          salePrice: Money.fromDecimalString('12.3456'),
          promotionID: 'promotion-unrounded',
        },
        {
          skuID: 'sku-row-2',
          discountLevel: 'global',
          salePriceDiscountType: 'amount',
          salePrice: Money.fromDecimalString('12.3456'),
          roundingRuleID: 'rr-1',
          promotionID: 'promotion-rounded',
        },
      ];

      const details = await subject.service.getSalePriceDetailsForProductSkus('product-1');

      // A map keyed by SKU identifier, not an array.
      expect(Object.keys(details).sort()).toStrictEqual(['sku-row-1', 'sku-row-2']);

      const unrounded = requirePresent(details['sku-row-1'], "the 'sku-row-1' detail");
      const rounded = requirePresent(details['sku-row-2'], "the 'sku-row-2' detail");

      // CFML parity [model/service/PromotionService.cfc:L1025-L1026]: the legacy body tests the
      // rounding-rule identifier against `!= ""` before rounding, so a row without one is stored
      // exactly as the query returned it.
      expect(unrounded.salePrice.equals(Money.fromDecimalString('12.3456'))).toBe(true);
      expect(unrounded.skuID).toBe('sku-row-1');
      expect(unrounded.promotionID).toBe('promotion-unrounded');

      // And the rounded row goes through the rounding rule: 12.3456 against the `.99` expression,
      // Closest, is 11.99 - one of the migration's verified rounding cases.
      expect(rounded.salePrice.equals(Money.fromDecimalString('11.99'))).toBe(true);
      expect(rounded.roundingRuleID).toBe('rr-1');

      // Exactly one rounding-rule lookup happened, which is how "only when non-empty" is
      // observable.
      expect(subject.repository.roundingRuleQueryCalls).toStrictEqual(['rr-1']);
      expect(subject.repository.salePriceQueryCalls).toStrictEqual(['product-1']);
    });

    it('★ getShippingMethodOptionsDiscountAmountDetails uses the SYNCHRONOUS isAddressInZone', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });

      // A fulfillment reward that does restrict by shipping address zone, so the evaluator is
      // actually consulted. Fulfillment- and shipping-method filters stay open so the zone test is
      // the only thing that can reject.
      const graph = buildQualifyingGraph('shipzone-', order, capture.acceptedPriceGroup, {
        shippingAddressZoneIDs: ['zone-in-area'],
      });
      const option: ShippingMethodOptionView = requirePresent(
        capture.shippingMethodOption,
        'the captured shipping method option',
      );

      const inZoneSubject = armSubject(makeSubject(), graph, [graph.fulfillmentReward], true);
      const inZone: ShippingDiscountDetails =
        await inZoneSubject.service.getShippingMethodOptionsDiscountAmountDetails(option);

      expect(inZone.promotionID).toBe(graph.promotion.getPromotionID());
      expect(inZone.discountAmount.equals(Money.fromDecimalString('4.51'))).toBe(true);
      const rawAnswer = inZoneSubject.addressZones.isAddressInZone(
        { countryCode: 'US', stateCode: 'CA', postalCode: '94105', city: 'San Francisco' },
        { addressZoneID: 'zone-in-area', addressZoneLocations: [] },
      );
      expect(typeof rawAnswer).toBe('boolean');
      expect(rawAnswer).not.toBeInstanceOf(Promise);
      expect(inZoneSubject.addressZones.calls.length).toBeGreaterThan(1);

      // LEGACY-NOTE [model/service/PromotionService.cfc:L1057-L1069]: this method performs the
      // shipping-address-zone test CORRECTLY - it evaluates the zone condition itself.
      const outOfZoneSubject = armSubject(makeSubject(), graph, [graph.fulfillmentReward], false);
      const outOfZone =
        await outOfZoneSubject.service.getShippingMethodOptionsDiscountAmountDetails(option);

      // Rejected by the zone test alone: no promotion wins, and the amount falls back to the
      // initial zero the legacy body starts from - not to a null, and not to an absent key.
      expect(outOfZone.promotionID).toBe('');
      expect(outOfZone.discountAmount.equals(Money.zero)).toBe(true);
      expect(outOfZoneSubject.addressZones.calls.length).toBeGreaterThan(0);

      // The weight the fulfillment carries is a PLAIN NUMBER, never Money - it is a measure, not
      // an amount - and the charge the discount is computed from is Money.
      const fulfillment = requirePresent(order.orderFulfillments[0], 'golden fulfillment 0');
      expect(typeof fulfillment.totalShippingWeight).toBe('number');
      expect(option.totalCharge).toBeInstanceOf(Money);
    });
  });

  describe('★ request-scoped state', () => {
    it('★★ two independent invocations of ONE instance do not share ledger state', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('scoped-', order, capture.acceptedPriceGroup, {
        rewardMaximumUsePerOrder: 1,
      });
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));

      const first = await subject.service.updateOrderAmountsWithPromotions(order);
      const second = await subject.service.updateOrderAmountsWithPromotions(order);

      expect(describeIntents(second)).toStrictEqual(describeIntents(first));
      expect(second.length).toBe(first.length);

      for (const [index, intent] of second.entries()) {
        const counterpart = requirePresent(first[index], `the first run's intent at ${index}`);
        expect(intentDiscount(intent).equals(intentDiscount(counterpart))).toBe(true);
      }

      // CFML parity [model/service/PromotionService.cfc:L173-L188]: the legacy ledger is a local
      // struct rebuilt per call.
      expect(first.length).toBeGreaterThan(0);
    });
  });

  // §9 the ASYNC BOUNDARY - six async, six synchronous, enforced by invocation.

  describe('the async boundary is exactly six and six', () => {
    it('invokes every one of the twelve methods as shipped', async () => {
      const capture: OrderViewFixtureCapture = {};
      const order = makeOrderViewFixture({ capture });
      const graph = buildQualifyingGraph('async-', order, capture.acceptedPriceGroup);
      armSubject(subject, graph, rewardSequence(graph, 'orderRewardLast'));
      subject.repository.roundingRule = graph.roundingRule;
      subject.repository.promotionCodeUseCount = 2;
      subject.repository.promotionCodeAccountUseCount = 1;
      const orderItem = requirePresent(order.orderItems[0], 'golden order item 0');
      const option: ShippingMethodOptionView = requirePresent(
        capture.shippingMethodOption,
        'the captured shipping method option',
      );
      const asyncCalls: readonly [string, Promise<unknown>][] = [
        [
          'updateOrderAmountsWithPromotions',
          subject.service.updateOrderAmountsWithPromotions(order),
        ],
        [
          'getPromotionPeriodQualificationDetails',
          subject.service.getPromotionPeriodQualificationDetails(graph.promotionPeriod, order),
        ],
        [
          'getSalePriceDetailsForProductSkus',
          subject.service.getSalePriceDetailsForProductSkus('product-async'),
        ],
        [
          'getShippingMethodOptionsDiscountAmountDetails',
          subject.service.getShippingMethodOptionsDiscountAmountDetails(option),
        ],
        ['getPromotionCodeUseCount', subject.service.getPromotionCodeUseCount(graph.promotionCode)],
        [
          'getPromotionCodeAccountUseCount',
          subject.service.getPromotionCodeAccountUseCount(graph.promotionCode, 'account-async'),
        ],
      ];

      expect(asyncCalls.length).toBe(6);

      for (const [name, pending] of asyncCalls) {
        expect(pending, name).toBeInstanceOf(Promise);
        // Awaited rather than left floating: an unhandled rejection here would be a real defect.
        expect(await pending, name).toBeDefined();
      }
      const syncResults: readonly [string, unknown][] = [
        [
          'getQualifierQualificationDetails',
          subject.service.getQualifierQualificationDetails(graph.promotionQualifier, order),
        ],
        [
          'getPromotionPeriodQualifiedFulfillmentIDList',
          subject.service.getPromotionPeriodQualifiedFulfillmentIDList(
            graph.promotionPeriod,
            order,
          ),
        ],
        [
          'getPromotionPeriodOrderItemQualificationCount',
          subject.service.getPromotionPeriodOrderItemQualificationCount(
            graph.promotionPeriod,
            orderItem,
            order,
          ),
        ],
        [
          'getOrderItemInQualifier',
          subject.service.getOrderItemInQualifier(graph.promotionQualifier, orderItem),
        ],
        [
          'getOrderItemInReward',
          subject.service.getOrderItemInReward(graph.merchandiseReward, orderItem),
        ],
        [
          'getDiscountAmount',
          subject.service.getDiscountAmount(
            graph.percentageOffReward,
            Money.fromDecimalString('19.99'),
            3,
          ),
        ],
      ];

      expect(syncResults.length).toBe(6);

      for (const [name, result] of syncResults) {
        expect(result, name).not.toBeInstanceOf(Promise);
        expect(result, name).toBeDefined();
      }

      // JUDGMENT CALL: the split is derived from the legacy bodies, not from convenience.
      expect(asyncCalls.length + syncResults.length).toBe(12);
    });
  });
});
