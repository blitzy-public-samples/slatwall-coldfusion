// `src/services/priceGroupService.ts` ports THIRTEEN public methods from
// `model/service/PriceGroupService.cfc`, and this suite covers all thirteen.
//
// Both surround `super.save()` / `super.delete()`, and both are where the framework used to supply
// behaviour that has to be authored explicitly now.
//
// The slice's one subscription-price-group statement - `PriceGroupDAO.cfc` declares EXACTLY one
// function, `getAccountSubscriptionPriceGroups` at [model/dao/PriceGroupDAO.cfc:L52].
//
// No visibility widening is claimed here (all five are in the promotion slice) and no signature
// widening is claimed here (the one is spent on a sibling entity).

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PriceGroup } from '../../../src/domain/entities/priceGroup.js';
import { PriceGroupRate } from '../../../src/domain/entities/priceGroupRate.js';
import { Product } from '../../../src/domain/entities/product.js';
import { ProductType } from '../../../src/domain/entities/productType.js';
import { RoundingRule } from '../../../src/domain/entities/roundingRule.js';
import { Sku } from '../../../src/domain/entities/sku.js';
import type { SkuPriceGroupResolver } from '../../../src/domain/entities/sku.js';
import type {
  AttributeSetSummary,
  ProductRepository,
  ProductSearchMatches,
} from '../../../src/domain/ports/productRepository.js';
import type {
  CurrentAccountContext,
  PriceGroupRepository,
} from '../../../src/domain/ports/priceGroupRepository.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import type { OrderItemView } from '../../../src/domain/views/orderItemView.js';
import type { OrderView } from '../../../src/domain/views/orderView.js';
import { PriceGroupService } from '../../../src/services/priceGroupService.js';
import { makeOrderViewFixture } from '../../fixtures/orderViewFixtures.js';
import { makePriceGroupFixtures } from '../../fixtures/priceGroupFixtures.js';
import { makeProductFixture } from '../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

/**
 * The service's one module-local collaborator contract, recovered from the constructor.
 *
 * JUDGMENT CALL: `PriceGroupFrameworkReads` is deliberately not exported - it is the service's own
 * contract for the two framework affordances that none of the thirteen ports carries.
 */
type PriceGroupFrameworkReads = ConstructorParameters<typeof PriceGroupService>[2];

/**
 * The recorded shape of one rounding-rule delegation, read off the fixture double.
 */
type RecordedRoundValueCall = ReturnType<
  typeof makePriceGroupFixtures
>['roundingRuleValueRounder']['calls'][number];

/**
 * The rate under save on every write path below.
 */
const SAVED_RATE_ID = 'pgr-saved';

/**
 * A sibling rate of the same price group.
 */
const SIBLING_RATE_ID = 'pgr-sibling';

/**
 * A second sibling, for the ordering and selection cases.
 */
const OTHER_SIBLING_RATE_ID = 'pgr-sibling-2';

/**
 * The price group both rates belong to.
 */
const PRICE_GROUP_ID = 'pg-1';

/**
 * The identifier of the price group that inherits from `PRICE_GROUP_ID`.
 */
const CHILD_PRICE_GROUP_ID = 'pg-child';

/**
 * The `unsavedvalue=""` key from [model/entity/PriceGroupRate.cfc:L52].
 */
const UNSAVED_RATE_ID = '';

/**
 * The amount every fixture rate carries unless a case states otherwise.
 *
 * Present so the save-context `amount` rule passes; the VALUE is arbitrary and no case reads it
 * except the two that assert population, which supply their own.
 */
const FIXTURE_RATE_AMOUNT = '5.00';

/**
 * The account identifier every account-scoped read is issued for.
 */
const ACCOUNT_ID = 'acc-1';

/**
 * The base price every SKU fixture carries, as a decimal STRING.
 *
 * P4: there is no float anywhere in this file, in an input or in an expected value.
 */
const SKU_BASE_PRICE = '19.99';

/**
 * The pre-rounding result of the `percentageOff` arm on the base price.
 *
 * `19.99 - (19.99 x (12.5 / 100))` = `19.99 - 2.49875` = `17.49125`, computed by
 * `Money.minus`/`times`/`dividedBy` over an arbitrary-precision decimal rather than by IEEE-754.
 */
const PERCENTAGE_OFF_PRE_ROUNDING = '17.49125';

/**
 * The quantized result of that same arm, after [model/service/PriceGroupService.cfc:L339] applies
 * `numberFormat(_, "0.00")`.
 */
const PERCENTAGE_OFF_QUANTIZED = '17.49';

/**
 * `19.99 - 5.00`, the `amountOff` arm's result on the base price.
 */
const AMOUNT_OFF_RESULT = '14.99';

/**
 * The `amount` arm returns the rate's own amount verbatim.
 */
const FIXED_AMOUNT_RESULT = '9.99';

/**
 * A canned rounding answer BELOW the base price, so a price-group win is observable.
 */
const ROUNDED_BELOW_BASE = '9.00';

/**
 * A canned rounding answer ABOVE the base price - the fixture default.
 */
const ROUNDED_ABOVE_BASE = '77.77';

/**
 * A canned rounding answer EQUAL to the base price, for the strict-comparison arms.
 */
const ROUNDED_EQUAL_TO_BASE = '19.99';

/**
 * One recorded `savePriceGroupRate` call, with the sibling set it carried.
 */
interface RecordedRateSave {
  readonly rate: PriceGroupRate;
  readonly reconciledSiblings: readonly PriceGroupRate[];
}

/**
 * A `PriceGroupRepository` that captures its calls and answers from canned values.
 *
 * `implements PriceGroupRepository` is what makes this double honest: the compiler rejects it the
 * moment the port gains, loses or reshapes a member, which no runtime mock can do.
 */
class RecordingPriceGroupRepository implements PriceGroupRepository {
  /**
   * Every subscription-price-group read, in call order, by account identifier.
   */
  readonly subscriptionReads: string[] = [];

  /**
   * Every rate lookup, in call order, by rate identifier.
   */
  readonly rateLookups: string[] = [];

  /**
   * Every rate save, in call order.
   */
  readonly rateSaves: RecordedRateSave[] = [];

  /**
   * Every price-group delete, in call order.
   */
  readonly deletes: PriceGroup[] = [];

  /**
   * How many children the entity still held at each DELEGATION, in call order.
   *
   * Captured here rather than reconstructed afterwards, because the assertion that matters is
   * about the state at the MOMENT of the call: the collection is empty by then either way.
   */
  readonly deleteChildCounts: number[] = [];

  /**
   * What the next subscription read reports.
   *
   * Handed out by REFERENCE and deliberately so: the append case asserts that this exact array -
   * the READ SIDE of [model/service/PriceGroupService.cfc:L277-L284].
   */
  subscriptionPriceGroups: PriceGroup[] = [];

  /**
   * What the next rate lookup reports.
   */
  rateLookupResult: PriceGroupRate | undefined = undefined;

  /**
   * What the next delete reports.
   */
  deleteResult = true;

  getAccountSubscriptionPriceGroups(accountID: string): Promise<PriceGroup[]> {
    this.subscriptionReads.push(accountID);

    return Promise.resolve(this.subscriptionPriceGroups);
  }

  getPriceGroup(): Promise<PriceGroup | undefined> {
    return Promise.reject(new Error('getPriceGroup is not exercised here'));
  }

  getPriceGroupRate(priceGroupRateID: string): Promise<PriceGroupRate | undefined> {
    this.rateLookups.push(priceGroupRateID);

    return Promise.resolve(this.rateLookupResult);
  }

  savePriceGroup(): Promise<PriceGroup> {
    return Promise.reject(new Error('savePriceGroup is not exercised here'));
  }

  /**
   * Records the save and hands back the same instance.
   *
   * The real adapter returns a new instance on an insert, because the minted identifier and the
   * audit stamps are immutable on the ported entity.
   */
  savePriceGroupRate(
    priceGroupRate: PriceGroupRate,
    reconciledSiblings?: readonly PriceGroupRate[],
  ): Promise<PriceGroupRate> {
    this.rateSaves.push({ rate: priceGroupRate, reconciledSiblings: reconciledSiblings ?? [] });

    return Promise.resolve(priceGroupRate);
  }

  deletePriceGroup(priceGroup: PriceGroup): Promise<boolean> {
    this.deletes.push(priceGroup);
    this.deleteChildCounts.push(priceGroup.getChildPriceGroups().length);

    return Promise.resolve(this.deleteResult);
  }
}

/**
 * A `ProductRepository` whose single exercised member records and answers from a canned value; the
 * other five reject.
 *
 * Only `updatePriceGroupSKUSettings` reaches this port at all, and only through
 * `getProductByProductID` [model/service/PriceGroupService.cfc:L206].
 */
class RecordingProductRepository implements ProductRepository {
  /**
   * Every product lookup, in call order, by product identifier.
   */
  readonly productLookups: string[] = [];

  /**
   * What the next product lookup reports.
   */
  productLookupResult: Product | undefined = undefined;

  getAttributeSets(): Promise<AttributeSetSummary[]> {
    return Promise.reject(new Error('getAttributeSets is not exercised here'));
  }

  loadDataFromFile(): Promise<void> {
    return Promise.reject(new Error('loadDataFromFile is not exercised here'));
  }

  searchProductsByProductType(): Promise<ProductSearchMatches> {
    return Promise.reject(new Error('searchProductsByProductType is not exercised here'));
  }

  getProductByProductID(productID: string): Promise<Product | undefined> {
    this.productLookups.push(productID);

    return Promise.resolve(this.productLookupResult);
  }

  saveProduct(): Promise<Product> {
    return Promise.reject(new Error('saveProduct is not exercised here'));
  }

  deleteProduct(): Promise<boolean> {
    return Promise.reject(new Error('deleteProduct is not exercised here'));
  }
}

/**
 * The two framework reads the service declares for itself, recorded.
 */
class RecordingFrameworkReads implements PriceGroupFrameworkReads {
  /**
   * Every direct-association read, in call order, by account identifier.
   */
  readonly accountPriceGroupReads: string[] = [];

  /**
   * How many times the paged listing was read.
   */
  pageRecordReads = 0;

  /**
   * The account's LIVE association, handed out by REFERENCE on every read.
   *
   * The same ARRAY INSTANCE every TIME, which is what the port contract now requires and what
   * makes the request-lifetime mutation at [model/service/PriceGroupService.cfc:L276-L284]
   * observable: the service appends into what it is handed.
   */
  accountPriceGroups: PriceGroup[] = [];

  /**
   * What the next paged listing reports.
   */
  pageRecords: PriceGroup[] = [];

  getAccountPriceGroups(accountID: string): Promise<PriceGroup[]> {
    this.accountPriceGroupReads.push(accountID);

    return Promise.resolve(this.accountPriceGroups);
  }

  getPriceGroupPageRecords(): Promise<readonly PriceGroup[]> {
    this.pageRecordReads += 1;

    return Promise.resolve(this.pageRecords);
  }
}

/**
 * The subject and all three collaborators, so any of them can be asserted on.
 */
interface Subject {
  readonly service: PriceGroupService;
  readonly repository: RecordingPriceGroupRepository;
  readonly productRepository: RecordingProductRepository;
  readonly frameworkReads: RecordingFrameworkReads;
}

/**
 * A fresh subject, wired by hand - no container, no locator, no ambient scope.
 *
 * Constructed per case rather than once per module: every double carries mutable recorders.
 */
function makeSubject(): Subject {
  const repository = new RecordingPriceGroupRepository();
  const productRepository = new RecordingProductRepository();
  const frameworkReads = new RecordingFrameworkReads();

  return {
    repository,
    productRepository,
    frameworkReads,
    service: new PriceGroupService(repository, productRepository, frameworkReads),
  };
}

/**
 * A price group under the supplied identifier, holding the supplied rates.
 */
function aPriceGroupNamed(priceGroupID: string, ...rates: readonly PriceGroupRate[]): PriceGroup {
  const priceGroup = new PriceGroup({
    priceGroupID,
    priceGroupIDPath: priceGroupID,
    activeFlag: true,
    priceGroupName: 'Trade',
    priceGroupCode: 'trade-' + priceGroupID,
    parentPriceGroup: undefined,
    childPriceGroups: [],
    priceGroupRates: [...rates],
    promotionRewards: [],
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  });

  for (const rate of rates) {
    rate.setPriceGroup(priceGroup);
  }

  return priceGroup;
}

/**
 * One `RoundingRule` for the population cases, with the fixed `.99` / `Closest` shape.
 *
 * The VALUE ROUNDER is the IDENTITY, and that is deliberate rather than lazy: these cases assert
 * that the rule ARRIVES on the rate through populate, never that it rounds.
 */
function aRoundingRuleNamed(roundingRuleID: string): RoundingRule {
  return new RoundingRule(
    {
      roundingRuleID,
      roundingRuleName: 'Nine ninety nine',
      roundingRuleExpression: '.99',
      roundingRuleDirection: 'Closest',
      createdDateTime: undefined,
      createdByAccountID: undefined,
      modifiedDateTime: undefined,
      modifiedByAccountID: undefined,
      priceGroupRates: [],
    },
    { roundValueByRoundingRule: (value: Money): Money => value },
  );
}

/**
 * A price group holding the supplied rates, with the far side of each rate wired.
 */
function aPriceGroupHolding(...rates: readonly PriceGroupRate[]): PriceGroup {
  return aPriceGroupNamed(PRICE_GROUP_ID, ...rates);
}

/**
 * A persisted child of the supplied parent, wired through the bidirectional setter.
 *
 * `setParentPriceGroup` is used rather than seeding `childPriceGroups` in the constructor, and
 * that is deliberate: it is the accessor `addChildPriceGroup`
 * [model/entity/PriceGroup.cfc:L136-L138] delegates to.
 */
function aChildOf(parent: PriceGroup, childID = CHILD_PRICE_GROUP_ID): PriceGroup {
  const child = new PriceGroup({
    priceGroupID: childID,
    priceGroupIDPath: PRICE_GROUP_ID + ',' + childID,
    activeFlag: true,
    priceGroupName: 'Trade child',
    priceGroupCode: 'trade-child-' + childID,
    parentPriceGroup: undefined,
    childPriceGroups: [],
    priceGroupRates: [],
    promotionRewards: [],
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  });

  child.setParentPriceGroup(parent);

  return child;
}

/**
 * A rate, defaulting to a persisted key, empty collections and a valid save-context shape.
 *
 * The `amountType` `AND` `amount` defaults are not decoration - they are what makes the write
 * reachable.
 *
 * Both defaults are overridable, and `'percentageOff'` is chosen for `amountType` because it is
 * the one arm of the strategy switch [model/service/PriceGroupService.cfc:L316-L340] that applies
 * the rounding rule.
 */
function aRate(
  overrides: Partial<ConstructorParameters<typeof PriceGroupRate>[0]> = {},
): PriceGroupRate {
  return new PriceGroupRate({
    amountType: 'percentageOff',
    amount: Money.fromDecimalString(FIXTURE_RATE_AMOUNT),
    ...overrides,
    priceGroupRateID: overrides.priceGroupRateID ?? SAVED_RATE_ID,
  });
}

/**
 * A price group whose one global rate is a flat `amount`, so every SKU resolves to it.
 *
 * The `amount` arm neither multiplies nor rounds [model/service/PriceGroupService.cfc:L333-L334],
 * which makes it the only arm whose output is fully determined by the fixture with no rounding
 * collaborator in the picture.
 */
function aFlatPriceGroup(priceGroupID: string, flatAmount: string, rateID?: string): PriceGroup {
  return aPriceGroupNamed(
    priceGroupID,
    aRate({
      priceGroupRateID: rateID ?? priceGroupID + '-rate',
      globalFlag: true,
      amountType: 'amount',
      amount: Money.fromDecimalString(flatAmount),
    }),
  );
}

/**
 * The payload shape the method reads, with the sentinel deliberately not matched.
 */
function aPayload(amount?: string): {
  readonly priceGroupRateId: string;
  readonly amount?: string;
} {
  return amount === undefined
    ? { priceGroupRateId: SAVED_RATE_ID }
    : { priceGroupRateId: SAVED_RATE_ID, amount };
}

// Narrowing helpers - `noUncheckedIndexedAccess` is on and postfix `!` is banned.

/**
 * Narrows a fixture association the cascade depends on, failing loudly if it is absent.
 */
function requirePresent<TValue>(value: TValue | undefined, description: string): TValue {
  if (value === undefined) {
    throw new Error(`fixture invariant violated: ${description} is absent`);
  }

  return value;
}

/**
 * The single recorded rounding delegation, narrowed.
 */
function onlyRoundValueCall(calls: readonly RecordedRoundValueCall[]): RecordedRoundValueCall {
  const [first] = calls;

  return requirePresent(first, 'a recorded roundValueByRoundingRule call');
}

/**
 * What an order item looked like before the pass ran, for the read-only proof.
 */
interface OrderItemSnapshot {
  readonly orderItemID: string;
  readonly price: Money;
  readonly skuPrice: Money;
  readonly appliedPriceGroup: PriceGroup | undefined;
}

/**
 * Captures the mutable-looking surface of every order item.
 *
 * `OrderItemView` is declared `readonly` throughout, so this cannot detect a compile-time
 * violation - it detects a RUNTIME one.
 */
function snapshotOrderItems(order: OrderView): readonly OrderItemSnapshot[] {
  return order.orderItems.map((orderItem: OrderItemView) => ({
    orderItemID: orderItem.orderItemID,
    price: orderItem.price,
    skuPrice: orderItem.skuPrice,
    appliedPriceGroup: orderItem.appliedPriceGroup,
  }));
}

/**
 * A SKU whose base price is the suite-wide control value, with its product graph wired.
 */
function aPricedSku(idPrefix: string): Sku {
  return makeSkuFixture({
    idPrefix,
    price: Money.fromDecimalString(SKU_BASE_PRICE),
    product: makeProductFixture({ idPrefix: `${idPrefix}prod-` }),
  });
}

// The five-level cascade - must-preserve area (ii)
//
// Three sibling resolvers, all SYNCHRONOUS, and the async-boundary contract is why: each one
// traverses associations that are already materialized, so nothing about it reaches a port.

describe('the five-level cascade: last-match-wins', () => {
  // CFML parity [model/service/PriceGroupService.cfc:L146-L150, L163-L170]: not one candidate loop
  // breaks on a match.
  //
  // ⇒ when two `OR` more rates match, the last one encountered wins.

  it('★★ resolves the LAST matching SKU rate, not the first', () => {
    const sku = aPricedSku('lmw-sku-');
    const graph = makePriceGroupFixtures({ idPrefix: 'lmw-', skuLevelRateSkus: [sku] });
    const { service } = makeSubject();
    expect(graph.skuLevelRateFirstMatch.hasSku(sku)).toBe(true);
    expect(graph.skuLevelRateLastMatch.hasSku(sku)).toBe(true);
    expect(graph.skuLevelRateFirstMatch).not.toBe(graph.skuLevelRateLastMatch);

    const resolved = service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup);

    expect(resolved).toBe(graph.skuLevelRateLastMatch);
  });

  it('★★ resolves the LAST matching GLOBAL rate, where the ENTITY resolves the first', () => {
    // The contrast is the point and is drawn in one case. `PriceGroup.getGlobalPriceGroupRate()`
    // [model/entity/PriceGroup.cfc:L83-L90] returns from inside its loop, so it is first-match.
    const sku = aPricedSku('lmwg-sku-');
    const graph = makePriceGroupFixtures({ idPrefix: 'lmwg-' });
    const { service } = makeSubject();

    expect(graph.globalRateFirstMatch.getGlobalFlag()).toBe(true);
    expect(graph.globalRateLastMatch.getGlobalFlag()).toBe(true);

    expect(graph.globalRatePriceGroup.getGlobalPriceGroupRate()).toBe(graph.globalRateFirstMatch);
    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.globalRatePriceGroup)).toBe(
      graph.globalRateLastMatch,
    );
  });

  it('resolves the LAST matching product rate', () => {
    const product = makeProductFixture({ idPrefix: 'lmwp-prod-' });
    const graph = makePriceGroupFixtures({
      idPrefix: 'lmwp-',
      productLevelRateProducts: [product],
      productTypeLevelRateProductTypes: [
        requirePresent(product.getProductType(), 'the fixture product type'),
      ],
    });
    const { service } = makeSubject();

    // Two rates on the same price group match this product's graph - one by product membership
    // [model/service/PriceGroupService.cfc:L108-L112] and one by product-type membership through
    // [model/service/PriceGroupService.cfc:L115-L117].
    expect(graph.productLevelRate.hasProduct(product)).toBe(true);
    expect(graph.productTypeLevelRate.getProductTypes()).toHaveLength(1);

    expect(service.getRateForProductBasedOnPriceGroup(product, graph.childPriceGroup)).toBe(
      graph.productLevelRate,
    );
  });
});

describe('the five-level cascade: every level, in order', () => {
  it('level 1 - a SKU-level rate on the price group itself', () => {
    const sku = aPricedSku('l1-sku-');
    const graph = makePriceGroupFixtures({ idPrefix: 'l1-', skuLevelRateSkus: [sku] });
    const { service } = makeSubject();

    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup)).toBe(
      graph.skuLevelRateLastMatch,
    );
  });

  it('level 2 - a PRODUCT-level rate, reached through the SKU variant [L153-L155]', () => {
    const product = makeProductFixture({ idPrefix: 'l2-prod-' });
    const sku = makeSkuFixture({
      idPrefix: 'l2-sku-',
      price: Money.fromDecimalString(SKU_BASE_PRICE),
      product,
    });
    const graph = makePriceGroupFixtures({ idPrefix: 'l2-', productLevelRateProducts: [product] });
    const { service } = makeSubject();

    // No SKU-level rate matches, so [model/service/PriceGroupService.cfc:L145-L151] leaves
    // `returnRate` unset and [model/service/PriceGroupService.cfc:L153-L155] delegates to the
    // product variant.
    expect(graph.skuLevelRateLastMatch.hasSku(sku)).toBe(false);

    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup)).toBe(
      graph.productLevelRate,
    );
  });

  it('level 3 - a PRODUCT-TYPE rate on the type the product carries directly', () => {
    const product = makeProductFixture({ idPrefix: 'l3-prod-' });
    const productType = requirePresent(product.getProductType(), 'the fixture product type');
    const sku = makeSkuFixture({
      idPrefix: 'l3-sku-',
      price: Money.fromDecimalString(SKU_BASE_PRICE),
      product,
    });
    const graph = makePriceGroupFixtures({
      idPrefix: 'l3-',
      productTypeLevelRateProductTypes: [productType],
    });
    const { service } = makeSubject();

    // CFML parity [model/service/PriceGroupService.cfc:L115-L117 vs L158-L160]: the SKU variant
    // declares its own product-type step at [model/service/PriceGroupService.cfc:L158-L160], and
    // that step is TRANSITIVELY PRE-EMPTED - level 2
    // [model/service/PriceGroupService.cfc:L153-L155] calls the product variant.
    expect(service.getRateForProductTypeBasedOnPriceGroup(productType, graph.childPriceGroup)).toBe(
      graph.productTypeLevelRate,
    );
    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup)).toBe(
      graph.productTypeLevelRate,
    );
  });

  it('★ level 3 - the ancestor walk climbs PAST the parent to a grandparent [L65-L77]', () => {
    // The inner `while(!isNull(currentProductType))` at
    // [model/service/PriceGroupService.cfc:L65-L77] ascends one generation per pass and breaks
    // only on a hit [model/service/PriceGroupService.cfc:L72].
    const product = makeProductFixture({ idPrefix: 'anc-prod-' });
    const childType = requirePresent(product.getProductType(), 'the fixture product type');
    const parentType = requirePresent(
      childType.getParentProductType(),
      'the fixture product type parent',
    );
    const grandparentType = new ProductType({ productTypeID: 'anc-grandparent' });

    grandparentType.addChildProductType(parentType);

    expect(childType.getParentProductType()).toBe(parentType);
    expect(parentType.getParentProductType()).toBe(grandparentType);
    expect(grandparentType.getParentProductType()).toBeUndefined();

    const graph = makePriceGroupFixtures({
      idPrefix: 'anc-',
      productTypeLevelRateProductTypes: [grandparentType],
    });
    const { service } = makeSubject();

    // The rate is registered against the GRANDPARENT only.
    expect(graph.productTypeLevelRate.hasProductType(grandparentType)).toBe(true);
    expect(graph.productTypeLevelRate.hasProductType(childType)).toBe(false);
    expect(graph.productTypeLevelRate.hasProductType(parentType)).toBe(false);

    expect(service.getRateForProductTypeBasedOnPriceGroup(childType, graph.childPriceGroup)).toBe(
      graph.productTypeLevelRate,
    );
  });

  it('level 4 - the GLOBAL rate, when nothing more specific matches', () => {
    const sku = aPricedSku('l4-sku-');
    const graph = makePriceGroupFixtures({ idPrefix: 'l4-' });
    const { service } = makeSubject();

    // `globalRatePriceGroup` has no parent, so its global loop is the last step that can answer -
    // which is exactly what makes it a clean level-4 exhibit.
    expect(graph.globalRatePriceGroup.getParentPriceGroup()).toBeUndefined();

    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.globalRatePriceGroup)).toBe(
      graph.globalRateLastMatch,
    );
  });

  it('★ level 4 - an ANCESTOR price group global rate answers before level 5 is reached', () => {
    // Worth pinning because it is counter-intuitive and it is load-bearing for the two cases that
    // follow.
    const sku = aPricedSku('l4a-sku-');
    const graph = makePriceGroupFixtures({ idPrefix: 'l4a-' });
    const { service } = makeSubject();

    expect(graph.rootGlobalRate.getGlobalFlag()).toBe(true);
    expect(graph.childPriceGroup.getParentPriceGroup()).toBe(graph.parentPriceGroup);
    expect(graph.parentPriceGroup.getParentPriceGroup()).toBe(graph.rootPriceGroup);

    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup)).toBe(
      graph.rootGlobalRate,
    );
  });

  it('★★ level 5 - the PARENT price group, once no ancestor global rate can answer', () => {
    // The parent recursion [model/service/PriceGroupService.cfc:L173-L175] is only reachable when
    // every earlier level came back empty, and the ancestor global rate is what normally prevents
    // that - see the case above.
    const product = makeProductFixture({ idPrefix: 'l5-prod-' });
    const sku = makeSkuFixture({
      idPrefix: 'l5-sku-',
      price: Money.fromDecimalString(SKU_BASE_PRICE),
      product,
    });
    const graph = makePriceGroupFixtures({
      idPrefix: 'l5-',
      parentProductLevelRateProducts: [product],
    });
    const { service } = makeSubject();

    graph.rootPriceGroup.removePriceGroupRate(graph.rootGlobalRate);

    expect(graph.rootPriceGroup.getPriceGroupRates()).toStrictEqual([]);
    expect(graph.parentProductLevelRate.hasProduct(product)).toBe(true);

    // A PRODUCT-level rate on the parent price group is consulted, because the parent recursion
    // asks the product variant - which is the same variant that can see product membership.
    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup)).toBe(
      graph.parentProductLevelRate,
    );
  });
});

describe('the five-level cascade: DEFECT 7, the parent-recursion asymmetry', () => {
  it('★★ NEVER consults a SKU-level rate defined on a PARENT price group', () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L173-L175]: the SKU cascade's parent
    // recursion calls getRateForProductBasedOnPriceGroup rather than the SKU variant, so a
    // SKU-level rate on a parent price group is never consulted.
    // Preserved deliberately; do not fix without a product decision.
    const product = makeProductFixture({ idPrefix: 'd7-prod-' });
    const sku = makeSkuFixture({
      idPrefix: 'd7-sku-',
      price: Money.fromDecimalString(SKU_BASE_PRICE),
      product,
    });
    const graph = makePriceGroupFixtures({ idPrefix: 'd7-', parentSkuLevelRateSkus: [sku] });
    const { service } = makeSubject();

    graph.rootPriceGroup.removePriceGroupRate(graph.rootGlobalRate);

    // The rate exists, it is on the parent, and it matches this exact sku.
    expect(graph.parentSkuLevelRate.hasSku(sku)).toBe(true);
    expect(graph.parentPriceGroup.getPriceGroupRates()).toContain(graph.parentSkuLevelRate);
    expect(graph.childPriceGroup.getParentPriceGroup()).toBe(graph.parentPriceGroup);

    // And the cascade resolves nothing, because level 5 asks the product variant, and the product
    // variant has no step that reads sku membership.
    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup)).toBeUndefined();
    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.parentPriceGroup)).toBe(
      graph.parentSkuLevelRate,
    );
  });

  it('★ the PRODUCT variant is symmetric where the SKU variant is not [L130-L132]', () => {
    // The contrast is what makes defect 7 legible: the product variant's own parent recursion at
    // [model/service/PriceGroupService.cfc:L130-L132] calls the same variant, so product
    // membership survives the climb.
    const product = makeProductFixture({ idPrefix: 'sym-prod-' });
    const graph = makePriceGroupFixtures({
      idPrefix: 'sym-',
      parentProductLevelRateProducts: [product],
    });
    const { service } = makeSubject();

    graph.rootPriceGroup.removePriceGroupRate(graph.rootGlobalRate);

    expect(service.getRateForProductBasedOnPriceGroup(product, graph.childPriceGroup)).toBe(
      graph.parentProductLevelRate,
    );
  });
});

describe('the five-level cascade: nothing matches', () => {
  it('★ answers `undefined` - never null, never a zero-amount rate, never a throw', () => {
    // Legacy [model/service/PriceGroupService.cfc:L96-L98] tests
    // `if(!isNull(returnRate)) return returnRate;` and then falls off the end of the function,
    // which in CFML returns null.
    const product = makeProductFixture({ idPrefix: 'none-prod-' });
    const productType = requirePresent(product.getProductType(), 'the fixture product type');
    const sku = makeSkuFixture({
      idPrefix: 'none-sku-',
      price: Money.fromDecimalString(SKU_BASE_PRICE),
      product,
    });
    const graph = makePriceGroupFixtures({ idPrefix: 'none-' });
    const { service } = makeSubject();

    expect(graph.isolatedPriceGroup.getPriceGroupRates()).toStrictEqual([]);
    expect(graph.isolatedPriceGroup.getParentPriceGroup()).toBeUndefined();

    // All three variants, because all three end the same way.
    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.isolatedPriceGroup)).toBeUndefined();
    expect(
      service.getRateForProductBasedOnPriceGroup(product, graph.isolatedPriceGroup),
    ).toBeUndefined();
    expect(
      service.getRateForProductTypeBasedOnPriceGroup(productType, graph.isolatedPriceGroup),
    ).toBeUndefined();

    // `toBeUndefined` already excludes `null`; this states the other two wrong answers explicitly,
    // because both are plausible ports and both change money.
    const resolved: unknown = service.getRateForSkuBasedOnPriceGroup(sku, graph.isolatedPriceGroup);

    expect(resolved instanceof PriceGroupRate).toBe(false);
  });
});

describe('the five-level cascade: the exclusion collections are never consulted', () => {
  it('★ resolves a rate that lists the SKU, the product AND the type as EXCLUDED', () => {
    // LEGACY-NOTE [model/entity/PriceGroupRate.cfc:L75-L77]: the rate declares
    // `excludedProductTypes`, `excludedProducts` and `excludedSkus` as three many-to-many link
    // collections.
    const product = makeProductFixture({ idPrefix: 'excl-prod-' });
    const productType = requirePresent(product.getProductType(), 'the fixture product type');
    const sku = makeSkuFixture({
      idPrefix: 'excl-sku-',
      price: Money.fromDecimalString(SKU_BASE_PRICE),
      product,
    });
    const graph = makePriceGroupFixtures({
      idPrefix: 'excl-',
      skuLevelRateSkus: [sku],
      excludedSkus: [sku],
      excludedProducts: [product],
      excludedProductTypes: [productType],
    });
    const { service } = makeSubject();

    // The collections are present and populated on the exhibit rate.
    expect(graph.appliesToIncludingAndExcludingRate.getExcludedSkus()).toStrictEqual([sku]);
    expect(graph.appliesToIncludingAndExcludingRate.getExcludedProducts()).toStrictEqual([product]);
    expect(graph.appliesToIncludingAndExcludingRate.getExcludedProductTypes()).toStrictEqual([
      productType,
    ]);
    expect(graph.appliesToIncludingAndExcludingRate.hasSku(sku)).toBe(true);

    // And the SKU resolves to it anyway.
    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.siblingPriceGroup)).toBe(
      graph.appliesToIncludingAndExcludingRate,
    );
  });

  it('★★ PRICES the excluded SKU through the excluding rate - the gap reaches money', () => {
    // Rate resolution is where the gap lives, but resolution is not the consequence.
    const product = makeProductFixture({ idPrefix: 'exclmoney-prod-' });
    const productType = requirePresent(product.getProductType(), 'the fixture product type');
    const sku = makeSkuFixture({
      idPrefix: 'exclmoney-sku-',
      price: Money.fromDecimalString(SKU_BASE_PRICE),
      product,
    });
    const graph = makePriceGroupFixtures({
      idPrefix: 'exclmoney-',
      skuLevelRateSkus: [sku],
      excludedSkus: [sku],
      excludedProducts: [product],
      excludedProductTypes: [productType],
    });
    const { service } = makeSubject();
    const excludingRate = graph.appliesToIncludingAndExcludingRate;

    // The rate excludes this SKU three times over - by SKU, by product and by product type.
    expect(excludingRate.getExcludedSkus()).toStrictEqual([sku]);
    expect(excludingRate.getExcludedProducts()).toStrictEqual([product]);
    expect(excludingRate.getExcludedProductTypes()).toStrictEqual([productType]);

    const pricedThroughGroup = service.calculateSkuPriceBasedOnPriceGroup(
      sku,
      graph.siblingPriceGroup,
    );

    // The price-group price is the excluding rate's price.
    expect(pricedThroughGroup.toDecimalString()).toBe(ROUNDED_ABOVE_BASE);
    expect(pricedThroughGroup.toDecimalString()).toBe(
      service.calculateSkuPriceBasedOnPriceGroupRate(sku, excludingRate).toDecimalString(),
    );

    // And it is not the SKU's own price, which is what honouring the exclusion would have
    // produced.
    expect(pricedThroughGroup.toDecimalString()).not.toBe(SKU_BASE_PRICE);
    expect(sku.getPrice().toDecimalString()).toBe(SKU_BASE_PRICE);
  });
});

describe('the five-level cascade issues no query at all', () => {
  it('★ reads only the materialized graph - no port, no page, no lookup', () => {
    // This is what the synchronous signature MEANS, stated as an assertion rather than left to the
    // type.
    const sku = aPricedSku('noq-sku-');
    const graph = makePriceGroupFixtures({ idPrefix: 'noq-', skuLevelRateSkus: [sku] });
    const { service, repository, productRepository, frameworkReads } = makeSubject();

    service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup);
    service.calculateSkuPriceBasedOnPriceGroup(sku, graph.childPriceGroup);

    expect(repository.subscriptionReads).toStrictEqual([]);
    expect(repository.rateLookups).toStrictEqual([]);
    expect(repository.rateSaves).toStrictEqual([]);
    expect(repository.deletes).toStrictEqual([]);
    expect(productRepository.productLookups).toStrictEqual([]);
    expect(frameworkReads.accountPriceGroupReads).toStrictEqual([]);
    expect(frameworkReads.pageRecordReads).toBe(0);
  });
});

// The amount-type dispatch - defect 8, and the other half of must-preserve area (ii)
//
// CFML parity [model/service/PriceGroupService.cfc:L319, L323, L331, L334]: the legacy body
// re-declares `var newPrice` four times in the same function scope. TypeScript expresses this as a
// single binding.
//
// CFML parity [model/service/PriceGroupService.cfc:L326-L327]: the legacy calls
// `getRoundingRule()` twice on the percentageOff arm - once for the null guard and once for the
// use.

describe('the amount-type dispatch: DEFECT 8, only percentageOff rounds', () => {
  it('★★ percentageOff APPLIES the rate rounding rule, and hands it the pre-rounding value', () => {
    const sku = aPricedSku('pct-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'pct-',
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service } = makeSubject();

    const result = service.calculateSkuPriceBasedOnPriceGroupRate(
      sku,
      graph.percentageOffRateWithRoundingRule,
    );

    // The collaborator was reached, exactly once, and the value it was handed is the
    // precisionEvaluate result of [model/service/PriceGroupService.cfc:L323] -
    // `19.99 - (19.99 x (12.5 / 100))` - before [model/service/PriceGroupService.cfc:L339]
    // quantizes anything.
    expect(graph.roundingRuleValueRounder.calls).toHaveLength(1);

    const call = onlyRoundValueCall(graph.roundingRuleValueRounder.calls);

    expect(call.value.equals(Money.fromDecimalString(PERCENTAGE_OFF_PRE_ROUNDING))).toBe(true);
    expect(call.rule).toBe(graph.closestRoundingRule);

    // And the rule's answer is what comes back.
    expect(result.equals(graph.roundValueDoubleAnswer)).toBe(true);
    expect(result.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);
  });

  it('★★ amountOff does NOT apply the rounding rule, even though the rate carries one', () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L316-L340]: only the percentageOff branch
    // applies the rate's rounding rule (L326-L327). AmountOff (L331) and amount (L334) skip it
    // entirely, even when a rounding rule is configured on the rate.
    // Preserved deliberately; do not fix without a product decision.
    const sku = aPricedSku('amtoff-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'amtoff-',
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service } = makeSubject();

    // The PREMISE: this rate does carry a rounding rule. The skip is the dispatch's choice, not
    // missing data.
    expect(graph.amountOffRateWithRoundingRule.getRoundingRule()).toBe(graph.closestRoundingRule);

    const result = service.calculateSkuPriceBasedOnPriceGroupRate(
      sku,
      graph.amountOffRateWithRoundingRule,
    );
    expect(graph.roundingRuleValueRounder.calls).toStrictEqual([]);

    // `19.99 - 5.00`, unrounded.
    expect(result.equals(Money.fromDecimalString(AMOUNT_OFF_RESULT))).toBe(true);
  });

  it('★★ amount does NOT apply the rounding rule AND uses no precision helper [L334]', () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L316-L340]: only the percentageOff branch
    // applies the rate's rounding rule (L326-L327). AmountOff (L331) and amount (L334) skip it
    // entirely, even when a rounding rule is configured on the rate.
    // Preserved deliberately; do not fix without a product decision.
    const sku = aPricedSku('amt-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'amt-',
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service } = makeSubject();

    expect(graph.fixedAmountRateWithRoundingRule.getRoundingRule()).toBe(graph.closestRoundingRule);

    const rateAmount = requirePresent(
      graph.fixedAmountRateWithRoundingRule.getAmount(),
      'the fixed-amount rate amount',
    );
    const result = service.calculateSkuPriceBasedOnPriceGroupRate(
      sku,
      graph.fixedAmountRateWithRoundingRule,
    );

    expect(graph.roundingRuleValueRounder.calls).toStrictEqual([]);

    // The rate's own amount, verbatim - neither the SKU price nor the rounding answer plays any
    // part.
    expect(result.equals(rateAmount)).toBe(true);
    expect(result.equals(Money.fromDecimalString(FIXED_AMOUNT_RESULT))).toBe(true);
    expect(result.equals(sku.getPrice())).toBe(false);
    expect(result.equals(graph.roundValueDoubleAnswer)).toBe(false);
  });

  it('★★ an UNRECOGNISED amountType matches nothing and returns the SEEDED BASE PRICE', () => {
    // Legacy [model/service/PriceGroupService.cfc:L321-L336] is a `switch` with three `case` arms
    // and no `default`, so an out-of-vocabulary value leaves the
    // [model/service/PriceGroupService.cfc:L319] seed untouched and
    // [model/service/PriceGroupService.cfc:L339] returns the SKU's own price.
    const sku = aPricedSku('unrec-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'unrec-',
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service } = makeSubject();

    // The premise: the exhibit's stored column value really is outside the vocabulary the entity
    // publishes.
    expect(graph.recognisedAmountTypes).toStrictEqual(['percentageOff', 'amountOff', 'amount']);
    expect(graph.recognisedAmountTypes).not.toContain(graph.unrecognisedAmountTypeColumnValue);
    expect(graph.unrecognisedAmountTypeRate.getAmountType()).toBeUndefined();
    expect(graph.unrecognisedAmountTypeRate.getAmount()).toBeDefined();
    expect(graph.unrecognisedAmountTypeRate.getRoundingRule()).toBe(graph.closestRoundingRule);

    const result = service.calculateSkuPriceBasedOnPriceGroupRate(
      sku,
      graph.unrecognisedAmountTypeRate,
    );

    expect(graph.roundingRuleValueRounder.calls).toStrictEqual([]);
    expect(result.equals(sku.getPrice())).toBe(true);
    expect(result.equals(Money.fromDecimalString(SKU_BASE_PRICE))).toBe(true);
  });

  it('★ a percentageOff rate with NO rounding rule is safe - the [L326] guard is real', () => {
    // The rounding-rule branch normally hides that, because the rule's own answer is already
    // two-place.
    const sku = aPricedSku('norule-sku-');
    const graph = makePriceGroupFixtures({ idPrefix: 'norule-' });
    const { service } = makeSubject();

    expect(graph.percentageOffRateWithoutRoundingRule.getRoundingRule()).toBeUndefined();

    const result = service.calculateSkuPriceBasedOnPriceGroupRate(
      sku,
      graph.percentageOffRateWithoutRoundingRule,
    );

    // No throw, no collaborator call, and the pre-rounding value quantized by
    // [model/service/PriceGroupService.cfc:L339].
    expect(graph.roundingRuleValueRounder.calls).toStrictEqual([]);
    expect(result.equals(Money.fromDecimalString(PERCENTAGE_OFF_QUANTIZED))).toBe(true);

    // Stated the other way round so the truncation is unmistakable: the five-place intermediate is
    // not what comes back.
    expect(result.equals(Money.fromDecimalString(PERCENTAGE_OFF_PRE_ROUNDING))).toBe(false);
    expect(result.toFixed2()).toBe(PERCENTAGE_OFF_QUANTIZED);
  });

  it('the dispatch is synchronous and touches no collaborator but the rounding rule', () => {
    const sku = aPricedSku('sync-sku-');
    const graph = makePriceGroupFixtures({ idPrefix: 'sync-' });
    const { service, repository, productRepository, frameworkReads } = makeSubject();

    // Invoked without `await`: the returned value is a `Money`, not a promise, and
    // `await-thenable` would reject an `await` here.
    const result: Money = service.calculateSkuPriceBasedOnPriceGroupRate(
      sku,
      graph.percentageOffRateWithRoundingRule,
    );

    expect(result).toBeInstanceOf(Money);
    expect(repository.rateLookups).toStrictEqual([]);
    expect(productRepository.productLookups).toStrictEqual([]);
    expect(frameworkReads.accountPriceGroupReads).toStrictEqual([]);
  });
});

describe('calculateSkuPriceBasedOnPriceGroup: resolve, then dispatch', () => {
  it('resolves a rate through the cascade and returns its calculated price [L304-L310]', () => {
    const sku = aPricedSku('cspg-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'cspg-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service } = makeSubject();

    // The rate the cascade picks is the last-match SKU rate, and its price is the rounding answer
    // so this asserts the two halves are wired to each other, not merely present.
    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup)).toBe(
      graph.skuLevelRateLastMatch,
    );

    const price = service.calculateSkuPriceBasedOnPriceGroup(sku, graph.childPriceGroup);

    expect(price.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);
    expect(
      price.equals(
        service.calculateSkuPriceBasedOnPriceGroupRate(sku, graph.skuLevelRateLastMatch),
      ),
    ).toBe(true);
  });

  it('★ falls through to the SKU price when the cascade resolves nothing [L307, L312]', () => {
    // [model/service/PriceGroupService.cfc:L307] is `if(!isNull(priceGroupRate))` and
    // [model/service/PriceGroupService.cfc:L312] is the bare `return sku.getPrice()`. No zero
    // default, no throw, no last-known price: an account with no applicable rate simply pays list.
    const sku = aPricedSku('csnr-sku-');
    const graph = makePriceGroupFixtures({ idPrefix: 'csnr-' });
    const { service } = makeSubject();

    expect(service.getRateForSkuBasedOnPriceGroup(sku, graph.isolatedPriceGroup)).toBeUndefined();

    const price = service.calculateSkuPriceBasedOnPriceGroup(sku, graph.isolatedPriceGroup);

    expect(price).toBe(sku.getPrice());
    expect(price.equals(Money.fromDecimalString(SKU_BASE_PRICE))).toBe(true);
    expect(graph.roundingRuleValueRounder.calls).toStrictEqual([]);
  });
});

// GetPriceGroupDataJSON - defect 5 and defect 29, kept apart.
//
// `getPriceGroupDataJSON(): Promise<string>` is ASYNC: it reads the paged listing, which is a
// framework affordance and therefore a port call.

describe('getPriceGroupDataJSON: DEFECT 5, the loop variable that is never assigned', () => {
  // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L236]: the loop declares its counter as `i`
  // at [model/service/PriceGroupService.cfc:L235] but the body indexes getPageRecords()[local.i],
  // reaching the counter through the implicit function scope instead of by name.
  // Preserved deliberately; do not fix without a product decision.

  it('★★ serialises EVERY page record, under its own key, in PAGE ORDER', () => {
    const graph = makePriceGroupFixtures({ idPrefix: 'json-' });
    const third = aPriceGroupNamed('pg-json-third');
    const { service, frameworkReads } = makeSubject();

    // All three are rate-less, which is the only shape this method can serialise at all - see
    // DEFECT 29 below.
    expect(graph.isolatedPriceGroup.getPriceGroupRates()).toStrictEqual([]);
    expect(graph.unpathedPriceGroup.getPriceGroupRates()).toStrictEqual([]);
    expect(third.getPriceGroupRates()).toStrictEqual([]);

    frameworkReads.pageRecords = [graph.isolatedPriceGroup, graph.unpathedPriceGroup, third];

    return service.getPriceGroupDataJSON().then((json: string) => {
      const parsed: unknown = JSON.parse(json);

      expect(Object.keys(parsed as Record<string, unknown>)).toStrictEqual([
        graph.isolatedPriceGroup.getPriceGroupID(),
        graph.unpathedPriceGroup.getPriceGroupID(),
        third.getPriceGroupID(),
      ]);

      // The struct shape [model/service/PriceGroupService.cfc:L248-L253] is exactly two keys per
      // record, and `priceGroupRates` is an ARRAY even when empty - a caller iterating it must not
      // have to null-check.
      expect(parsed).toStrictEqual({
        [graph.isolatedPriceGroup.getPriceGroupID()]: {
          priceGroupName: 'Isolated price group',
          priceGroupRates: [],
        },
        [graph.unpathedPriceGroup.getPriceGroupID()]: {
          priceGroupName: 'Price group with no stored path',
          priceGroupRates: [],
        },
        ['pg-json-third']: { priceGroupName: 'Trade', priceGroupRates: [] },
      });

      // One page read, not one per record.
      expect(frameworkReads.pageRecordReads).toBe(1);
    });
  });

  it('★ returns an EMPTY document when the page is empty - the loop body never runs', () => {
    // The degenerate case is the one shape that reaches the end of the method with the defect
    // present but unexercised, so it is pinned separately: `serializeJSON({})`
    // [model/service/PriceGroupService.cfc:L256] on an untouched struct.
    const { service, frameworkReads } = makeSubject();

    expect(frameworkReads.pageRecords).toStrictEqual([]);

    return service.getPriceGroupDataJSON().then((json: string) => {
      expect(json).toBe('{}');
      expect(frameworkReads.pageRecordReads).toBe(1);
    });
  });

  it('★ omits priceGroupName entirely when the column is null [L249]', () => {
    // CFML parity [model/service/PriceGroupService.cfc:L249]: assigning a null value to a CFML
    // struct key leaves the key UNSET rather than storing a null, and `serializeJSON` then emits
    // no such property.
    const nameless = new PriceGroup({
      priceGroupID: 'pg-nameless',
      priceGroupIDPath: 'pg-nameless',
      activeFlag: true,
      priceGroupName: undefined,
      priceGroupCode: 'nameless',
      parentPriceGroup: undefined,
      childPriceGroups: [],
      priceGroupRates: [],
      promotionRewards: [],
      createdDateTime: undefined,
      createdByAccountID: undefined,
      modifiedDateTime: undefined,
      modifiedByAccountID: undefined,
    });
    const { service, frameworkReads } = makeSubject();

    frameworkReads.pageRecords = [nameless];

    return service.getPriceGroupDataJSON().then((json: string) => {
      expect(JSON.parse(json)).toStrictEqual({ 'pg-nameless': { priceGroupRates: [] } });
      expect(json).not.toContain('priceGroupName');
    });
  });
});

describe('getPriceGroupDataJSON: DEFECT 29, the absent rate accessor', () => {
  it('★★ THROWS as soon as a page record carries a rate, because [L243] calls nothing', async () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L243]: the body calls
    // thisRate.getAmountRepresentation(), a method that exists NOWHERE in the repository, so it
    // reaches the ENTITY-level missing-method throw at org/Hibachi/HibachiEntity.cfc:L565 -
    // `PriceGroupRate` declares no `attributeValues`.
    // Preserved deliberately; do not fix without a product decision.
    const graph = makePriceGroupFixtures({ idPrefix: 'd29-' });
    const { service, frameworkReads } = makeSubject();

    // The premise: this group does hold rates, which is the ordinary case in a real install.
    expect(graph.childPriceGroup.getPriceGroupRates().length).toBeGreaterThan(0);

    frameworkReads.pageRecords = [graph.childPriceGroup];

    // The locator in the message is what distinguishes this from defect.
    await expect(service.getPriceGroupDataJSON()).rejects.toThrow(/getAmountRepresentation/);
    await expect(service.getPriceGroupDataJSON()).rejects.toThrow(/L243/);
  });

  it('★ throws on the FIRST rate-bearing record, after the rate-less ones were already read', async () => {
    // The order is worth pinning because it explains the symptom an operator saw: the grid did not
    // fail "sometimes", it failed as soon as any price group in the page had a rate, which in
    // practice is always.
    const graph = makePriceGroupFixtures({ idPrefix: 'd29b-' });
    const { service, frameworkReads } = makeSubject();

    frameworkReads.pageRecords = [graph.isolatedPriceGroup, graph.childPriceGroup];

    await expect(service.getPriceGroupDataJSON()).rejects.toThrow(/getAmountRepresentation/);

    // Reading the page is not what fails; walking a rate is.
    expect(frameworkReads.pageRecordReads).toBe(1);
  });
});

// ACCOUNT PRICING - lowest wins, the caller's collection survives, and the ambient scope is gone.
//
// All three are ASYNC: each one reads the account's price-group association, which is a port call.

describe('calculateSkuPriceBasedOnAccount: the account price can never EXCEED the base price', () => {
  it('★★ returns the SKU price when every price group would charge MORE', () => {
    // [model/service/PriceGroupService.cfc:L274] seeds the candidate array with `sku.getPrice()`
    // before any price group is considered, [model/service/PriceGroupService.cfc:L294] sorts
    // numerically ascending and [model/service/PriceGroupService.cfc:L297] returns `prices[1]`.
    const sku = aPricedSku('acch-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'acch-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_ABOVE_BASE,
    });
    const { service, frameworkReads } = makeSubject();

    // The premise: this price group really does resolve a HIGHER price for this SKU.
    expect(
      service
        .calculateSkuPriceBasedOnPriceGroup(sku, graph.childPriceGroup)
        .isGreaterThan(sku.getPrice()),
    ).toBe(true);

    frameworkReads.accountPriceGroups = [graph.childPriceGroup];

    return service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID).then((price: Money) => {
      expect(price.equals(sku.getPrice())).toBe(true);
      expect(price.isGreaterThan(sku.getPrice())).toBe(false);
      expect(frameworkReads.accountPriceGroupReads).toStrictEqual([ACCOUNT_ID]);
    });
  });

  it('★★ returns the LOWEST candidate, and the answer does not depend on candidate order', () => {
    // [model/service/PriceGroupService.cfc:L294] is `arraySort(prices, "numeric")` and
    // [model/service/PriceGroupService.cfc:L297] takes the FIRST element, so the method is
    // order-independent by construction.
    const sku = aPricedSku('accl-sku-');
    const high = makePriceGroupFixtures({
      idPrefix: 'accl-high-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_ABOVE_BASE,
    });
    const low = makePriceGroupFixtures({
      idPrefix: 'accl-low-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const middle = makePriceGroupFixtures({
      idPrefix: 'accl-mid-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: '15.00',
    });
    const forward = makeSubject();
    const reversed = makeSubject();

    forward.frameworkReads.accountPriceGroups = [
      high.childPriceGroup,
      low.childPriceGroup,
      middle.childPriceGroup,
    ];
    reversed.frameworkReads.accountPriceGroups = [
      middle.childPriceGroup,
      low.childPriceGroup,
      high.childPriceGroup,
    ];

    return Promise.all([
      forward.service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID),
      reversed.service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID),
    ]).then(([forwardPrice, reversedPrice]: readonly [Money, Money]) => {
      expect(forwardPrice.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);
      expect(reversedPrice.equals(forwardPrice)).toBe(true);
      expect(forwardPrice.compare(Money.fromDecimalString('15.00'))).toBe(-1);
    });
  });
});

describe("calculateSkuPriceBasedOnAccount: the subscription groups are APPENDED to the account's live association", () => {
  // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L276, L282]: the legacy body binds the
  // account's price-group collection by REFERENCE at [model/service/PriceGroupService.cfc:L276]
  // with no defensive copy, and `arrayAppend` at [model/service/PriceGroupService.cfc:L282]
  // mutates it.
  // Preserved deliberately; do not fix without a product decision.
  it('★★★ APPENDS the subscription group into the very array the port handed out', async () => {
    const sku = aPricedSku('copy-sku-');
    const direct = makePriceGroupFixtures({
      idPrefix: 'copy-direct-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: '15.00',
    });
    const viaSubscription = makePriceGroupFixtures({
      idPrefix: 'copy-subs-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service, repository, frameworkReads } = makeSubject();

    const association = [direct.childPriceGroup];

    frameworkReads.accountPriceGroups = association;
    repository.subscriptionPriceGroups = [viaSubscription.childPriceGroup];

    const price = await service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);

    // The subscription group took part in the selection, so the append happened.
    expect(price.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);

    // And it landed in the exact array instance the double handed out, not in a copy the service
    // kept to itself.
    expect(frameworkReads.accountPriceGroups).toBe(association);
    expect(association).toHaveLength(2);
    expect(association).toStrictEqual([direct.childPriceGroup, viaSubscription.childPriceGroup]);

    // The SOURCE collection is a different matter: the subscription statement's own result array
    // is read and never written, so it stays exactly as it was.
    expect(repository.subscriptionPriceGroups).toHaveLength(1);
    expect(repository.subscriptionPriceGroups).toStrictEqual([viaSubscription.childPriceGroup]);
  });

  it('★★★ the append is observable by getBestPriceGroupDetailsBasedOnSkuAndAccount [L351]', async () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L343-L362 vs L271-L298]:
    // [model/service/PriceGroupService.cfc:L351] reads only `account.getPriceGroups()` and never
    // issues the subscription statement.
    // Preserved deliberately; do not fix without a product decision.
    const sku = aPricedSku('leak-best-');
    const viaSubscription = makePriceGroupFixtures({
      idPrefix: 'leak-best-subs-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service, repository, frameworkReads } = makeSubject();

    // The direct association is EMPTY, so on its own [model/service/PriceGroupService.cfc:L351]
    // can find nothing.
    frameworkReads.accountPriceGroups = [];
    repository.subscriptionPriceGroups = [viaSubscription.childPriceGroup];

    const before = await service.getBestPriceGroupDetailsBasedOnSkuAndAccount(sku, ACCOUNT_ID);

    expect(before.priceGroup).toBeUndefined();
    expect(before.price.equals(sku.getPrice())).toBe(true);

    // One intervening call on the other method - the only one that consults the subscription
    // statement - and the association is no longer empty.
    await service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);

    const after = await service.getBestPriceGroupDetailsBasedOnSkuAndAccount(sku, ACCOUNT_ID);

    // Same method, same sku, same account, different answer - so the intervening subscription
    // read changes the pricing output rather than leaving it untouched.
    expect(after.priceGroup).toBe(viaSubscription.childPriceGroup);
    expect(after.price.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);
    expect(after.price.equals(before.price)).toBe(false);

    // And [model/service/PriceGroupService.cfc:L351] still never issued the subscription statement
    // itself - exactly one such read occurred, and it belongs to the intervening
    // `calculateSkuPriceBasedOnAccount` call.
    expect(repository.subscriptionReads).toStrictEqual([ACCOUNT_ID]);
  });

  it('★★★ the append is observable by updateOrderAmountsWithPriceGroups [L365]', async () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L365 vs L271-L298]:
    // [model/service/PriceGroupService.cfc:L365] gates the whole order pass on
    // `arrayLen(order.getAccount().getPriceGroups())`, the DIRECT association only.
    // Preserved deliberately; do not fix without a product decision.
    const order = makeOrderViewFixture({ idPrefix: 'leak-ord-', accountID: ACCOUNT_ID });
    const flat = aFlatPriceGroup('pg-leak-order-flat', ROUNDED_BELOW_BASE);
    const { service, repository, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [];
    repository.subscriptionPriceGroups = [flat];

    // The gate at [model/service/PriceGroupService.cfc:L365] closes: nothing in the direct
    // association.
    expect(await service.updateOrderAmountsWithPriceGroups(order)).toStrictEqual([]);

    const firstItem = requirePresent(order.orderItems[0], 'golden order item 0');

    // One call that does consult the subscription statement, for one of the order's own SKUs.
    await service.calculateSkuPriceBasedOnAccount(firstItem.sku, ACCOUNT_ID);

    const afterPollution = await service.updateOrderAmountsWithPriceGroups(order);

    // The gate now opens and the ORDER is REPRICED. The golden order's first two items are priced
    // above 9.00 and the third below it, so two intents appear - the same split the
    // direct-association case asserts.
    expect(afterPollution).toHaveLength(2);
    expect(afterPollution.map((intent) => intent.orderItemID)).toContain(firstItem.orderItemID);
    expect(afterPollution.every((intent) => intent.priceGroupID === flat.getPriceGroupID())).toBe(
      true,
    );
  });

  it('★★ repeated calls do NOT compound: the [L281] guard holds across calls', async () => {
    // CFML parity [model/service/PriceGroupService.cfc:L281]: `arrayFind` is consulted before
    // every append, so a second call finds the member already present and adds nothing.
    const sku = aPricedSku('nocompound-');
    const viaSubscription = makePriceGroupFixtures({
      idPrefix: 'nocompound-subs-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service, repository, frameworkReads } = makeSubject();

    const association: PriceGroup[] = [];

    frameworkReads.accountPriceGroups = association;
    repository.subscriptionPriceGroups = [viaSubscription.childPriceGroup];

    await service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);
    await service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);
    await service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);

    expect(association).toHaveLength(1);
    expect(association).toStrictEqual([viaSubscription.childPriceGroup]);

    // Three calls, three subscription reads - the guard suppresses the APPEND, not the statement.
    expect(repository.subscriptionReads).toStrictEqual([ACCOUNT_ID, ACCOUNT_ID, ACCOUNT_ID]);
  });

  it('★★★ a NEW request starts clean: the pollution does not survive the scope', async () => {
    // The other half of the safety argument.
    //
    // `makeSubject()` builds a fresh service over fresh doubles, which is this suite's stand-in
    // for a new request scope.
    const sku = aPricedSku('fresh-scope-');
    const viaSubscription = makePriceGroupFixtures({
      idPrefix: 'fresh-scope-subs-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });

    const first = makeSubject();

    first.frameworkReads.accountPriceGroups = [];
    first.repository.subscriptionPriceGroups = [viaSubscription.childPriceGroup];

    await first.service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);

    const polluted = await first.service.getBestPriceGroupDetailsBasedOnSkuAndAccount(
      sku,
      ACCOUNT_ID,
    );

    expect(polluted.priceGroup).toBe(viaSubscription.childPriceGroup);

    // A SECOND scope, same account identifier, same SKU, and no intervening
    // `calculateSkuPriceBasedOnAccount`.
    const second = makeSubject();

    second.frameworkReads.accountPriceGroups = [];
    second.repository.subscriptionPriceGroups = [viaSubscription.childPriceGroup];

    const clean = await second.service.getBestPriceGroupDetailsBasedOnSkuAndAccount(
      sku,
      ACCOUNT_ID,
    );

    expect(clean.priceGroup).toBeUndefined();
    expect(clean.price.equals(sku.getPrice())).toBe(true);
    expect(second.repository.subscriptionReads).toStrictEqual([]);
  });
});

describe('calculateSkuPriceBasedOnAccount: how a duplicate price group is detected', () => {
  it('★★ collapses two DISTINCT instances that name the SAME stored row', async () => {
    // CFML parity [model/service/PriceGroupService.cfc:L281]: the legacy guard is
    // `!arrayFind(priceGroups, obj)`, which compares OBJECTS.
    //
    // With the session gone that guarantee is gone, and the two readings diverge: a subscription
    // read and a direct read are separate queries and produce separate instances.
    const sku = aPricedSku('dup-sku-');
    const first = makePriceGroupFixtures({
      idPrefix: 'dup-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: '15.00',
    });
    const second = makePriceGroupFixtures({
      idPrefix: 'dup-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: '3.00',
    });
    const { service, repository, frameworkReads } = makeSubject();

    // Same stored row, two instances, two different resolved prices.
    expect(second.childPriceGroup.getPriceGroupID()).toBe(first.childPriceGroup.getPriceGroupID());
    expect(second.childPriceGroup).not.toBe(first.childPriceGroup);

    frameworkReads.accountPriceGroups = [first.childPriceGroup];
    repository.subscriptionPriceGroups = [second.childPriceGroup];

    const price = await service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);

    // The DIRECT instance's price stands and the duplicate never contributes, so the cheaper
    // `3.00` is not reachable.
    expect(price.equals(Money.fromDecimalString('15.00'))).toBe(true);
    expect(price.equals(Money.fromDecimalString('3.00'))).toBe(false);
  });

  it('★ keeps BOTH of two UNSAVED price groups, because neither carries a key to compare', async () => {
    // The fallback arm. `unsavedvalue=""` [model/entity/PriceGroup.cfc:L52] means an unpersisted
    // price group has no identity to match on, so key comparison would wrongly collapse every
    // unsaved group into one.
    const sku = aPricedSku('unsaved-sku-');
    const firstUnsaved = aFlatPriceGroup(UNSAVED_RATE_ID, '3.00', 'pgr-unsaved-a');
    const secondUnsaved = aFlatPriceGroup(UNSAVED_RATE_ID, '1.00', 'pgr-unsaved-b');
    const { service, repository, frameworkReads } = makeSubject();

    expect(firstUnsaved.getPriceGroupID()).toBe('');
    expect(secondUnsaved.getPriceGroupID()).toBe('');
    expect(firstUnsaved).not.toBe(secondUnsaved);

    frameworkReads.accountPriceGroups = [firstUnsaved];
    repository.subscriptionPriceGroups = [secondUnsaved];

    const price = await service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);

    // Both took part, so the cheaper of the two wins.
    expect(price.equals(Money.fromDecimalString('1.00'))).toBe(true);
  });
});

describe('calculateSkuPriceBasedOnAccount: the subscription reach-through', () => {
  it('★★ reads the ONE subscription statement, read-only, and lets its groups price the SKU', async () => {
    // LEGACY-NOTE [model/dao/PriceGroupDAO.cfc:L52]: this is a documented, read-only reach-through
    // into out-of-scope subscription tables - `SwSubsUsageBenefitAccount`, `SwSubsUsageBenefit`,
    // `SwSubsUsageBenefitPriceGroup`, `SwSubsUsage`.
    const sku = aPricedSku('subs-sku-');
    const viaSubscription = makePriceGroupFixtures({
      idPrefix: 'subs-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service, repository, frameworkReads } = makeSubject();

    // The account holds no direct price group at all, so anything but the base price can only have
    // come through the subscription read.
    frameworkReads.accountPriceGroups = [];
    repository.subscriptionPriceGroups = [viaSubscription.childPriceGroup];

    const price = await service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);

    expect(price.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);

    // Read once, for this account, and nothing was written anywhere.
    expect(repository.subscriptionReads).toStrictEqual([ACCOUNT_ID]);
    expect(repository.rateSaves).toStrictEqual([]);
    expect(repository.deletes).toStrictEqual([]);
  });
});

describe('calculateSkuPriceBasedOnCurrentAccount: the ambient scope is an explicit parameter', () => {
  // CFML parity [model/service/PriceGroupService.cfc:L262-L268]: the legacy body reads ambient
  // request state through the Slatwall-scope accessor at L263 and the Hibachi-scope accessor at
  // L264 - two differently-named accessors for the same scope.
  //
  // Neither accessor name is transcribed here; see the note at the head of this file for why.

  it('★★ delegates to the account path when the context carries an identifier', async () => {
    const sku = aPricedSku('ctx-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'ctx-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service, repository, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [graph.childPriceGroup];

    const context: CurrentAccountContext = { accountID: ACCOUNT_ID };
    const price = await service.calculateSkuPriceBasedOnCurrentAccount(sku, context);

    expect(price.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);

    // The identifier the CALLER supplied is the one both reads were issued for.
    expect(frameworkReads.accountPriceGroupReads).toStrictEqual([ACCOUNT_ID]);
    expect(repository.subscriptionReads).toStrictEqual([ACCOUNT_ID]);
  });

  it('★★ falls back to the SKU price for a guest, issuing NO read at all [L266]', async () => {
    // Legacy [model/service/PriceGroupService.cfc:L263] gates the whole body on the logged-in flag
    // and [model/service/PriceGroupService.cfc:L266] returns `sku.getPrice()` otherwise.
    const sku = aPricedSku('guest-sku-');
    const { service, repository, frameworkReads } = makeSubject();

    const context: CurrentAccountContext = {};
    const price = await service.calculateSkuPriceBasedOnCurrentAccount(sku, context);

    expect(price).toBe(sku.getPrice());
    expect(frameworkReads.accountPriceGroupReads).toStrictEqual([]);
    expect(repository.subscriptionReads).toStrictEqual([]);
  });
});

describe('getBestPriceGroupDetailsBasedOnSkuAndAccount: the empty-string sentinel and the strict <', () => {
  it('★★ answers the base price with NO price group when nothing beats it [L347-L348]', async () => {
    // Legacy [model/service/PriceGroupService.cfc:L347-L348] seeds
    // `{price = sku.getPrice(), priceGroup = ""}` - an EMPTY STRING, not a null and not a price
    // group.
    const sku = aPricedSku('best-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'best-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_ABOVE_BASE,
    });
    const { service, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [graph.childPriceGroup];

    const details = await service.getBestPriceGroupDetailsBasedOnSkuAndAccount(sku, ACCOUNT_ID);

    expect(details).toStrictEqual({ price: sku.getPrice(), priceGroup: undefined });
    expect(Object.keys(details)).toStrictEqual(['price', 'priceGroup']);
  });

  it('★★ an EQUAL price does NOT displace the base, because [L355] is a strict <', async () => {
    // The distinction is not cosmetic.
    const sku = aPricedSku('besteq-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'besteq-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_EQUAL_TO_BASE,
    });
    const { service, frameworkReads } = makeSubject();

    // The premise: the price group resolves EXACTLY the base price.
    expect(
      service
        .calculateSkuPriceBasedOnPriceGroup(sku, graph.childPriceGroup)
        .equals(Money.fromDecimalString(SKU_BASE_PRICE)),
    ).toBe(true);

    frameworkReads.accountPriceGroups = [graph.childPriceGroup];

    const details = await service.getBestPriceGroupDetailsBasedOnSkuAndAccount(sku, ACCOUNT_ID);

    expect(details.priceGroup).toBeUndefined();
    expect(details.price.equals(Money.fromDecimalString(SKU_BASE_PRICE))).toBe(true);
  });

  it('reports the winning price group when one genuinely undercuts the base', async () => {
    const sku = aPricedSku('bestwin-sku-');
    const graph = makePriceGroupFixtures({
      idPrefix: 'bestwin-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [graph.childPriceGroup];

    const details = await service.getBestPriceGroupDetailsBasedOnSkuAndAccount(sku, ACCOUNT_ID);

    expect(details.priceGroup).toBe(graph.childPriceGroup);
    expect(details.price.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);
  });

  it('★ consults ONLY the direct association - no subscription reach-through here', async () => {
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L343-L362 vs L271-L298]: this method reads
    // `account.getPriceGroups()` and STOPS. Its sibling `calculateSkuPriceBasedOnAccount` also
    // reads the subscription statement at [model/service/PriceGroupService.cfc:L277].
    const sku = aPricedSku('bestsub-sku-');
    const viaSubscription = makePriceGroupFixtures({
      idPrefix: 'bestsub-',
      skuLevelRateSkus: [sku],
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const { service, repository, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [];
    repository.subscriptionPriceGroups = [viaSubscription.childPriceGroup];

    const details = await service.getBestPriceGroupDetailsBasedOnSkuAndAccount(sku, ACCOUNT_ID);

    // The cheaper subscription group is invisible from here.
    expect(details.priceGroup).toBeUndefined();
    expect(details.price.equals(sku.getPrice())).toBe(true);
    expect(repository.subscriptionReads).toStrictEqual([]);

    // And the sibling method, on the same doubles, does see it.
    const accountPrice = await service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID);

    expect(accountPrice.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);
    expect(repository.subscriptionReads).toStrictEqual([ACCOUNT_ID]);
  });
});

// UpdateOrderAmountsWithPriceGroups - the anti-corruption boundary.
//
// LEGACY-NOTE [model/service/PromotionService.cfc:L241-L252]: the promotion pass selects its
// discount base from applied-price-group state that this pass writes.

describe('updateOrderAmountsWithPriceGroups: intents, not mutation', () => {
  it('★★ returns intents carrying the new price and the applied price group, keyed by order item', async () => {
    const flat = aFlatPriceGroup('pg-order-flat', ROUNDED_BELOW_BASE);
    const order = makeOrderViewFixture({ idPrefix: 'ord1-', accountID: ACCOUNT_ID });
    const { service, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [flat];

    const intents = await service.updateOrderAmountsWithPriceGroups(order);

    // The golden order's three items are priced 19.99, 17.99 and 8.50 [orderViewFixtures], and the
    // flat group resolves 9.00 for every SKU.
    expect(intents).toHaveLength(2);

    const [firstIntent, secondIntent] = intents;
    const first = requirePresent(firstIntent, 'the first applied-price-group intent');
    const second = requirePresent(secondIntent, 'the second applied-price-group intent');
    const [item0, item1, item2] = order.orderItems;
    const firstItem = requirePresent(item0, 'golden order item 0');
    const secondItem = requirePresent(item1, 'golden order item 1');
    const thirdItem = requirePresent(item2, 'golden order item 2');

    // The intent carries both halves of what [model/service/PriceGroupService.cfc:L370-L371] used
    // to write, and the order item is named by an opaque identifier rather than by a reference to
    // an out-of-scope entity.
    expect(first).toStrictEqual({
      orderItemID: firstItem.orderItemID,
      price: Money.fromDecimalString(ROUNDED_BELOW_BASE),
      priceGroupID: flat.getPriceGroupID(),
    });
    expect(second.orderItemID).toBe(secondItem.orderItemID);
    expect(second.priceGroupID).toBe(flat.getPriceGroupID());
    expect(second.price.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);

    // The item whose price is already below the group price gets nothing at all.
    expect(intents.map((intent) => intent.orderItemID)).not.toContain(thirdItem.orderItemID);
    expect(thirdItem.price.isLessThan(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);
  });

  it('★★ mutates NOTHING on the order view - it is read-only at this boundary', async () => {
    const flat = aFlatPriceGroup('pg-order-readonly', ROUNDED_BELOW_BASE);
    const order = makeOrderViewFixture({ idPrefix: 'ord2-', accountID: ACCOUNT_ID });
    const { service, repository, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [flat];

    const before = snapshotOrderItems(order);
    const itemsArray = order.orderItems;

    const intents = await service.updateOrderAmountsWithPriceGroups(order);

    // Intents were produced, so the pass definitely did its work rather than returning early.
    expect(intents).toHaveLength(2);

    // And not one order-item field moved. `price` and `skuPrice` are the two the legacy touched
    // [model/service/PriceGroupService.cfc:L370] and read
    // [model/service/PromotionService.cfc:L241-L252]; `appliedPriceGroup` is the one
    // [model/service/PromotionService.cfc:L371] set.
    expect(snapshotOrderItems(order)).toStrictEqual(before);
    expect(order.orderItems).toBe(itemsArray);
    expect(order.orderItems).toHaveLength(3);

    // No order persistence of any kind was attempted either - there is no port for it, and this
    // states that the pass did not reach for a price-group write as a substitute.
    expect(repository.rateSaves).toStrictEqual([]);
    expect(repository.deletes).toStrictEqual([]);
  });
});

describe('updateOrderAmountsWithPriceGroups: prices only ever move DOWN', () => {
  it('★★ an EQUAL resolved price produces NO intent, because [L369] is a strict <', async () => {
    const flat = aFlatPriceGroup('pg-order-equal', ROUNDED_EQUAL_TO_BASE);
    const order = makeOrderViewFixture({ idPrefix: 'ord3-', accountID: ACCOUNT_ID });
    const { service, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [flat];

    const [item0] = order.orderItems;
    const firstItem = requirePresent(item0, 'golden order item 0');

    // The premise: item 0's price is EXACTLY what the group resolves.
    expect(firstItem.price.equals(Money.fromDecimalString(ROUNDED_EQUAL_TO_BASE))).toBe(true);

    const intents = await service.updateOrderAmountsWithPriceGroups(order);

    // Nothing for item 0 because it is equal, and nothing for items 1 and 2 because 19.99 is ABOVE
    // their prices of 17.99 and 8.50. Both wrong-direction arms in one assertion.
    expect(intents).toStrictEqual([]);
  });

  it('★★ a resolved price with NO winning price group produces no intent [L369 isObject]', async () => {
    const rateless = aPriceGroupNamed('pg-order-rateless');
    const order = makeOrderViewFixture({
      idPrefix: 'ord4-',
      accountID: ACCOUNT_ID,
      // Item 0's own price is raised ABOVE its SKU price, so the comparison passes on price alone.
      itemOverrides: [{ price: Money.fromDecimalString('30.00') }],
    });
    const { service, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [rateless];

    const [item0] = order.orderItems;
    const firstItem = requirePresent(item0, 'golden order item 0');

    // The first conjunct WOULD pass.
    expect(firstItem.sku.getPrice().isLessThan(firstItem.price)).toBe(true);
    expect(service.getRateForSkuBasedOnPriceGroup(firstItem.sku, rateless)).toBeUndefined();

    expect(await service.updateOrderAmountsWithPriceGroups(order)).toStrictEqual([]);

    // And the same order does produce an intent once a group can actually win, so the empty result
    // above is attributable to the object check rather than to the fixture.
    frameworkReads.accountPriceGroups = [aFlatPriceGroup('pg-order-wins', ROUNDED_BELOW_BASE)];

    const withWinner = await service.updateOrderAmountsWithPriceGroups(order);

    expect(withWinner.map((intent) => intent.orderItemID)).toContain(firstItem.orderItemID);
  });
});

describe('updateOrderAmountsWithPriceGroups: what it refuses to process', () => {
  it('★★ SKIPS an account whose price groups arrive ONLY via the subscription reach-through', async () => {
    // LEGACY-NOTE [model/service/PriceGroupService.cfc:L365 vs L271-L298]:
    // [model/service/PriceGroupService.cfc:L365] gates the whole method on
    // `arrayLen(order.getAccount().getPriceGroups())` - the DIRECT association only. The
    // subscription statement at [model/service/PriceGroupService.cfc:L277] is never consulted from
    // here.
    const viaSubscription = makePriceGroupFixtures({
      idPrefix: 'subsonly-',
      roundValueAnswer: ROUNDED_BELOW_BASE,
    });
    const flat = aFlatPriceGroup('pg-subsonly-flat', ROUNDED_BELOW_BASE);
    const order = makeOrderViewFixture({ idPrefix: 'ord5-', accountID: ACCOUNT_ID });
    const { service, repository, frameworkReads } = makeSubject();

    // Direct association EMPTY; subscription read would answer a cheaper group.
    frameworkReads.accountPriceGroups = [];
    repository.subscriptionPriceGroups = [flat];

    expect(await service.updateOrderAmountsWithPriceGroups(order)).toStrictEqual([]);

    // It read the direct association and then STOPPED - the subscription statement was never
    // issued, which is the observable form of the asymmetry.
    expect(frameworkReads.accountPriceGroupReads).toStrictEqual([ACCOUNT_ID]);
    expect(repository.subscriptionReads).toStrictEqual([]);

    // The other side of the contrast, on the same doubles and the same SKU.
    const [item0] = order.orderItems;
    const firstItem = requirePresent(item0, 'golden order item 0');
    const accountPrice = await service.calculateSkuPriceBasedOnAccount(firstItem.sku, ACCOUNT_ID);

    expect(accountPrice.equals(Money.fromDecimalString(ROUNDED_BELOW_BASE))).toBe(true);
    expect(repository.subscriptionReads).toStrictEqual([ACCOUNT_ID]);

    // Referenced so the unused-locals gate cannot mask a fixture that stopped building the cheaper
    // graph this case depends on.
    expect(viaSubscription.roundValueDoubleAnswer.toFixed2()).toBe(ROUNDED_BELOW_BASE);
  });

  it('★ returns an empty intent list for a guest order, issuing NO read', async () => {
    // An order with no account cannot have a price group.
    const order = makeOrderViewFixture({ idPrefix: 'ord6-', accountID: undefined });
    const { service, repository, frameworkReads } = makeSubject();

    expect(order.accountID).toBeUndefined();

    expect(await service.updateOrderAmountsWithPriceGroups(order)).toStrictEqual([]);
    expect(frameworkReads.accountPriceGroupReads).toStrictEqual([]);
    expect(repository.subscriptionReads).toStrictEqual([]);
  });

  it('reads the account association ONCE for the whole order, not once per item', async () => {
    // Not a claim about cost - it is a claim about CONSISTENCY.
    const flat = aFlatPriceGroup('pg-order-once', ROUNDED_BELOW_BASE);
    const order = makeOrderViewFixture({ idPrefix: 'ord7-', accountID: ACCOUNT_ID });
    const { service, frameworkReads } = makeSubject();

    frameworkReads.accountPriceGroups = [flat];

    await service.updateOrderAmountsWithPriceGroups(order);

    expect(order.orderItems).toHaveLength(3);
    expect(frameworkReads.accountPriceGroupReads).toStrictEqual([ACCOUNT_ID]);
  });
});

// UpdatePriceGroupSKUSettings - the admin grid's one write path.

/**
 * The settings payload, with `resolvedSku` supplied because the shape requires the key.
 */
function aSettingsPayload(
  priceGroupRateId: string,
  skuId: string,
  resolvedSku: Sku | undefined,
  amount?: string,
): {
  readonly priceGroupRateId: string;
  readonly productId: string;
  readonly skuId: string;
  readonly resolvedSku: Sku | undefined;
  readonly amount?: string;
} {
  const base = {
    priceGroupRateId,
    productId: 'prd-settings',
    skuId,
    resolvedSku,
  } as const;

  // `amount` is OMITTED rather than assigned `undefined`: `exactOptionalPropertyTypes` treats the
  // two as different types, and the shipped `buildRateSavePayload` distinguishes them.
  return amount === undefined ? base : { ...base, amount };
}

describe('updatePriceGroupSKUSettings: the gates that do nothing', () => {
  it('★ an EMPTY priceGroupRateId short-circuits before any read [L194]', async () => {
    const { service, repository, productRepository } = makeSubject();

    await service.updatePriceGroupSKUSettings(aSettingsPayload('', '', undefined));

    expect(repository.rateLookups).toStrictEqual([]);
    expect(repository.rateSaves).toStrictEqual([]);
    expect(productRepository.productLookups).toStrictEqual([]);
  });

  it('★ the "inherit" sentinel on the PRODUCT shape does nothing [L199]', async () => {
    // "Inherit" means the product is to take whatever its price group's parent offers, which is
    // expressed by the ABSENCE of a rate row - so the correct action is no action.
    const { service, repository, productRepository } = makeSubject();

    await service.updatePriceGroupSKUSettings(aSettingsPayload('inherit', '', undefined));

    expect(repository.rateLookups).toStrictEqual([]);
    expect(repository.rateSaves).toStrictEqual([]);
    expect(productRepository.productLookups).toStrictEqual([]);
  });

  it('the "inherit" sentinel does NOT short-circuit the SKU shape', async () => {
    // [model/service/PriceGroupService.cfc:L199] sits INSIDE the `skuId EQ ""` branch
    // [model/service/PriceGroupService.cfc:L197], so it governs only the product shape.
    const sku = aPricedSku('inh-sku-');
    const rate = aRate();
    const { service, repository } = makeSubject();

    aPriceGroupHolding(rate);
    repository.rateLookupResult = rate;

    await service.updatePriceGroupSKUSettings(aSettingsPayload('inherit', 'sku-1', sku));

    expect(repository.rateLookups).toStrictEqual(['inherit']);
    expect(repository.rateSaves).toHaveLength(1);
  });
});

describe('updatePriceGroupSKUSettings: the PRODUCT shape [L205-L206]', () => {
  it('★★ loads the rate and the product, attaches the product, and saves once', async () => {
    const product = makeProductFixture({ idPrefix: 'setprod-' });
    const rate = aRate();
    const { service, repository, productRepository } = makeSubject();

    aPriceGroupHolding(rate);
    repository.rateLookupResult = rate;
    productRepository.productLookupResult = product;

    await service.updatePriceGroupSKUSettings(aSettingsPayload(SAVED_RATE_ID, '', undefined));

    expect(repository.rateLookups).toStrictEqual([SAVED_RATE_ID]);
    expect(productRepository.productLookups).toStrictEqual(['prd-settings']);
    expect(repository.rateSaves).toHaveLength(1);

    const written = requirePresent(repository.rateSaves[0], 'the recorded rate save').rate;

    expect(written).toBe(rate);
    expect(written.getProducts()).toStrictEqual([product]);
    expect(written.getSkus()).toStrictEqual([]);
  });

  it('★ raises when the product cannot be found [L206]', async () => {
    // CFML parity [model/service/PriceGroupService.cfc:L206]: the framework accessor answers null
    // on a miss and `addProduct(null)` then raises inside the entity.
    const rate = aRate();
    const { service, repository, productRepository } = makeSubject();

    aPriceGroupHolding(rate);
    repository.rateLookupResult = rate;
    productRepository.productLookupResult = undefined;

    await expect(
      service.updatePriceGroupSKUSettings(aSettingsPayload(SAVED_RATE_ID, '', undefined)),
    ).rejects.toThrow(/prd-settings/);

    expect(repository.rateSaves).toStrictEqual([]);
  });
});

describe('updatePriceGroupSKUSettings: the SKU shape [L219-L221]', () => {
  it('★★ attaches the SKU and saves, without reaching the product repository at all', async () => {
    const sku = aPricedSku('setsku-');
    const rate = aRate();
    const { service, repository, productRepository } = makeSubject();

    aPriceGroupHolding(rate);
    repository.rateLookupResult = rate;

    await service.updatePriceGroupSKUSettings(aSettingsPayload(SAVED_RATE_ID, 'sku-1', sku));

    expect(repository.rateLookups).toStrictEqual([SAVED_RATE_ID]);
    expect(productRepository.productLookups).toStrictEqual([]);

    const written = requirePresent(repository.rateSaves[0], 'the recorded rate save').rate;

    expect(written.getSkus()).toStrictEqual([sku]);
    expect(written.getProducts()).toStrictEqual([]);
  });

  it('★ raises when the SKU cannot be resolved [L219, L221]', async () => {
    // The SKU arrives as a BOUNDARY INPUT rather than through a port, because no port in the slice
    // publishes a SKU load-by-primary-key and none was invented for this one call (dependency
    // discipline D4).
    const rate = aRate();
    const { service, repository } = makeSubject();

    aPriceGroupHolding(rate);
    repository.rateLookupResult = rate;

    await expect(
      service.updatePriceGroupSKUSettings(
        aSettingsPayload(SAVED_RATE_ID, 'sku-missing', undefined),
      ),
    ).rejects.toThrow(/sku-missing/);

    expect(repository.rateSaves).toStrictEqual([]);
  });

  it('creates a fresh unsaved rate when the identifier matches nothing, and the save is REFUSED', async () => {
    // Legacy [model/service/PriceGroupService.cfc:L220] used the framework entity accessor, which
    // MINTS a new transient entity on a miss rather than answering null.
    const sku = aPricedSku('setnew-');
    const { service, repository } = makeSubject();

    repository.rateLookupResult = undefined;

    await service.updatePriceGroupSKUSettings(aSettingsPayload('pgr-unknown', 'sku-1', sku));

    expect(repository.rateLookups).toStrictEqual(['pgr-unknown']);
    expect(repository.rateSaves).toStrictEqual([]);
  });
});

describe('updatePriceGroupSKUSettings: the amount key, and DEFECT 30 from this entry point', () => {
  it('★★ DELETES a submitted amount unless the sentinel matches [L189-L190]', async () => {
    // The deletion is protective, not incidental: the admin grid posts its whole row, so a stale
    // `amount` field would otherwise overwrite the persisted rate on every unrelated edit.
    const sku = aPricedSku('setamt-');
    const rate = aRate({ amount: Money.fromDecimalString(FIXTURE_RATE_AMOUNT) });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(rate);
    repository.rateLookupResult = rate;

    await service.updatePriceGroupSKUSettings(
      aSettingsPayload(SAVED_RATE_ID, 'sku-1', sku, '12.50'),
    );

    const written = requirePresent(repository.rateSaves[0], 'the recorded rate save').rate;

    expect(written.getAmount()?.toFixed2()).toBe(FIXTURE_RATE_AMOUNT);
  });

  it('★★ the "new amount" sentinel reaches DEFECT 30 from HERE too, byte-for-byte', async () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L400]: the 'new amount' branch calls
    // clearAmounts() on the service, a method that does not exist anywhere in the codebase, so it
    // reaches the missing-method throw at org/Hibachi/HibachiService.cfc:L280.
    // Preserved deliberately; do not fix without a product decision.
    const sku = aPricedSku('setsent-');
    const rate = aRate();
    const { service, repository } = makeSubject();

    aPriceGroupHolding(rate);
    repository.rateLookupResult = rate;

    await expect(
      service.updatePriceGroupSKUSettings(aSettingsPayload('new amount', 'sku-1', sku, '12.50')),
    ).rejects.toThrow(/clearAmounts/);

    expect(repository.rateSaves).toStrictEqual([]);
  });

  it('★ near-miss spellings of the sentinel are ORDINARY rate identifiers', async () => {
    // Case, spacing and wording are all load-bearing at [model/service/PriceGroupService.cfc:L189]
    // and [model/service/PriceGroupService.cfc:L399], and CFML's `EQ` is case-INSENSITIVE - so
    // `"New Amount"` is the sentinel while `"new_amount"` is not.
    const sku = aPricedSku('setnear-');
    const rate = aRate();
    const { service, repository } = makeSubject();

    aPriceGroupHolding(rate);
    repository.rateLookupResult = rate;

    // Not the sentinel: an underscore instead of a space. Treated as a rate identifier, so the
    // save proceeds.
    await service.updatePriceGroupSKUSettings(aSettingsPayload('new_amount', 'sku-1', sku));

    expect(repository.rateSaves).toHaveLength(1);
    expect(repository.rateLookups).toStrictEqual(['new_amount']);

    // `'New Amount'` is the sentinel, differing only in case, which CFML's `EQ` ignores.
    await expect(
      service.updatePriceGroupSKUSettings(aSettingsPayload('New Amount', 'sku-1', sku)),
    ).rejects.toThrow(/clearAmounts/);

    expect(repository.rateSaves).toHaveLength(1);
  });
});

// SavePriceGroupRate - the one write, and what has to happen before it.
//
// Every case in this section is carried forward from the revision of this file that covered only
// the two write methods.

describe('savePriceGroupRate: the single write', () => {
  it('★★ writes exactly once, and AFTER the reconciliation rather than before it', async () => {
    // The whole shape of the method. `super.save()` at [model/service/PriceGroupService.cfc:L404]
    // made the entity managed; Hibernate wrote at request end, after
    // [model/service/PriceGroupService.cfc:L407-L444].
    const savedRate = aRate({ globalFlag: true, skus: [new Sku({ skuID: 'sku-1' })] });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(repository.rateSaves).toHaveLength(1);
    // The global clear-out at [model/service/PriceGroupService.cfc:L437-L439] had already emptied
    // the collection by the time the write happened, which is only observable if the write came
    // second.
    expect(repository.rateSaves[0]?.rate.getSkus()).toStrictEqual([]);
  });

  it('returns whatever the repository persisted, not the argument it was handed', async () => {
    // On an insert the adapter mints an identifier and audit stamps, both immutable on the ported
    // entity, so it returns a NEW instance. The service must hand that one back or its caller
    // never learns the key.
    const savedRate = aRate();
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    const returned = await service.savePriceGroupRate(savedRate, aPayload());

    expect(returned).toBe(repository.rateSaves[0]?.rate);
  });
});

// The population half of super.save()

describe('savePriceGroupRate: population from the payload', () => {
  it('★★ writes a submitted amount onto the rate before persisting it', async () => {
    // [org/Hibachi/HibachiService.cfc:L146] populates from the payload before validating. Skipping
    // it means a submitted amount is silently dropped and the rate is saved with whatever it
    // already carried.
    const savedRate = aRate({ amount: Money.fromDecimalString('5.00') });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    await service.savePriceGroupRate(savedRate, aPayload('12.50'));

    expect(repository.rateSaves[0]?.rate.getAmount()?.toFixed2()).toBe('12.50');
  });

  it('leaves the persisted amount alone when the payload carries none', async () => {
    // [model/service/PriceGroupService.cfc:L189-L190] DELETES the key from the request context on
    // every path but `"new amount"`, precisely so a stale value cannot overwrite the persisted
    // rate.
    const savedRate = aRate({ amount: Money.fromDecimalString('5.00') });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(repository.rateSaves[0]?.rate.getAmount()?.toFixed2()).toBe('5.00');
  });

  it('★ refuses a non-numeric amount, and writes nothing at all', async () => {
    const savedRate = aRate({ amount: Money.fromDecimalString('5.00') });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);
    const returned = await service.savePriceGroupRate(savedRate, aPayload('not a number'));

    // What matters is unchanged and is asserted twice over: no WRITE happened, and the property
    // was LEFT as it was rather than coerced or defaulted to zero - which is the failure mode that
    // sells product for nothing.
    expect(repository.rateSaves).toStrictEqual([]);
    expect(returned).toBe(savedRate);
    expect(returned.getAmount()?.toFixed2()).toBe('5.00');
  });

  it('★★★ POPULATES amountType, the property the SAVE CONTEXT REQUIRES', async () => {
    // Recorded `PriceGroupRateSaveInput` as "narrowed to ID/amount, omitting `amountType`,
    // `globalFlag`, rounding rule, and other source-populated properties", and `amountType` is the
    // sharpest case: `model/validation/PriceGroupRate.json` declares it
    // `{"contexts":"save","required":true}`.
    const savedRate = aRate({ amountType: 'percentageOff' });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    await service.savePriceGroupRate(savedRate, {
      priceGroupRateId: SAVED_RATE_ID,
      amountType: 'amountOff',
    });

    expect(repository.rateSaves[0]?.rate.getAmountType()).toBe('amountOff');
  });

  it('★ POPULATES globalFlag, which the reconciliation block then reads', async () => {
    // The value populate writes is read twice by the block that runs immediately after it:
    // [model/service/PriceGroupService.cfc:L429] demotes every sibling when this rate is global.
    const savedRate = aRate({ globalFlag: false });
    const { service, repository } = makeSubject();
    const sibling = aRate({ priceGroupRateID: 'pgr-sibling', globalFlag: true });

    aPriceGroupHolding(savedRate, sibling);

    await service.savePriceGroupRate(savedRate, {
      priceGroupRateId: SAVED_RATE_ID,
      globalFlag: true,
    });

    expect(repository.rateSaves[0]?.rate.getGlobalFlag()).toBe(true);

    // And the two reads that depend on it both fired: the sibling was demoted
    // [model/service/PriceGroupService.cfc:L429-L431]...
    expect(sibling.getGlobalFlag()).toBe(false);
  });

  it('★ POPULATES a FALSE globalFlag, because a present falsy value is a submitted value', async () => {
    // Populate's guard is `structKeyExists` `org/Hibachi/HibachiTransient.cfc`, not truthiness -
    // so a truthiness-based branch would make DEMOTING a global rate impossible through this
    // method.
    const savedRate = aRate({ globalFlag: true });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    await service.savePriceGroupRate(savedRate, {
      priceGroupRateId: SAVED_RATE_ID,
      globalFlag: false,
    });

    expect(repository.rateSaves[0]?.rate.getGlobalFlag()).toBe(false);
  });

  it('★★ POPULATES the roundingRule, because that association decides MONEY', async () => {
    const savedRate = aRate();
    const { service, repository } = makeSubject();
    const rule = aRoundingRuleNamed('rr-nine-ninety-nine');

    aPriceGroupHolding(savedRate);

    await service.savePriceGroupRate(savedRate, {
      priceGroupRateId: SAVED_RATE_ID,
      roundingRule: rule,
    });

    expect(repository.rateSaves[0]?.rate.getRoundingRule()).toBe(rule);
  });

  it('★ CLEARS the roundingRule on an explicit null, and leaves it alone when the key is absent', async () => {
    // The two are different instructions.
    const rule = aRoundingRuleNamed('rr-to-be-cleared');

    const cleared = aRate({ roundingRule: rule });
    const clearing = makeSubject();

    aPriceGroupHolding(cleared);

    await clearing.service.savePriceGroupRate(cleared, {
      priceGroupRateId: SAVED_RATE_ID,
      roundingRule: null,
    });

    expect(clearing.repository.rateSaves[0]?.rate.getRoundingRule()).toBeUndefined();

    const untouched = aRate({ roundingRule: rule });
    const leaving = makeSubject();

    aPriceGroupHolding(untouched);

    await leaving.service.savePriceGroupRate(untouched, { priceGroupRateId: SAVED_RATE_ID });

    expect(leaving.repository.rateSaves[0]?.rate.getRoundingRule()).toBe(rule);
  });

  it('POPULATES remoteID, the integration-identity column', async () => {
    const savedRate = aRate();
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    await service.savePriceGroupRate(savedRate, {
      priceGroupRateId: SAVED_RATE_ID,
      remoteID: 'remote-rate-42',
    });

    expect(repository.rateSaves[0]?.rate.getRemoteID()).toBe('remote-rate-42');
  });

  it('★★★ a refused save RECORDS its rules on the entity, so the caller can ask why', async () => {
    // This fixture fails two of the three save-context rules at once: `amountType` is absent and
    // the submitted `amount` is non-numeric, so both are reported.
    const savedRate = new PriceGroupRate({ priceGroupRateID: SAVED_RATE_ID });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    const refused = await service.savePriceGroupRate(savedRate, {
      priceGroupRateId: SAVED_RATE_ID,
      amount: 'not a number',
    });

    expect(refused).toBe(savedRate);
    expect(refused.hasErrors()).toBe(true);
    expect(refused.hasError('amountType')).toBe(true);
    expect(refused.hasError('amount')).toBe(true);
    expect(repository.rateSaves).toStrictEqual([]);
  });

  it('never populates the primary key from the payload', async () => {
    // `priceGroupRateId` is the SELECTOR the caller used to reach this rate -
    // [model/service/PriceGroupService.cfc:L399] reads it to detect the sentinel. Populating a
    // primary key from a request payload would let a save reassign the row it writes.
    const savedRate = aRate({ priceGroupRateID: SAVED_RATE_ID });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    await service.savePriceGroupRate(savedRate, { priceGroupRateId: 'pgr-somewhere-else' });

    expect(repository.rateSaves[0]?.rate.getPriceGroupRateID()).toBe(SAVED_RATE_ID);
  });
});

// The exclusivity reconciliation, and the set it hands to the write.

describe('savePriceGroupRate: sibling exclusivity', () => {
  it('★★ strips the saved rate’s members from a sibling AND sends that sibling to be written', async () => {
    // [model/service/PriceGroupService.cfc:L416-L426]. Under the ORM the sibling was already
    // managed, so mutating it was enough; with the ORM gone a mutation nobody hands to the
    // repository is a mutation nobody writes.
    const contested = new Sku({ skuID: 'sku-contested' });
    const savedRate = aRate({ skus: [contested] });
    const sibling = aRate({ priceGroupRateID: SIBLING_RATE_ID, skus: [contested] });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate, sibling);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(sibling.getSkus()).toStrictEqual([]);
    expect(repository.rateSaves[0]?.reconciledSiblings).toStrictEqual([sibling]);
  });

  it('strips product types and products as well as SKUs', async () => {
    // [model/service/PriceGroupService.cfc:L416-L418] and
    // [model/service/PriceGroupService.cfc:L420-L422]. All three include collections, not just the
    // one.
    const productType = new ProductType({ productTypeID: 'ptp-1' });
    const product = new Product({ productID: 'prd-1' });
    const savedRate = aRate({ productTypes: [productType], products: [product] });
    const sibling = aRate({
      priceGroupRateID: SIBLING_RATE_ID,
      productTypes: [productType],
      products: [product],
    });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate, sibling);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(sibling.getProductTypes()).toStrictEqual([]);
    expect(sibling.getProducts()).toStrictEqual([]);
    expect(repository.rateSaves[0]?.reconciledSiblings).toStrictEqual([sibling]);
  });

  it('★★ demotes a rival global rate, so the global fallback stays deterministic', async () => {
    // [model/service/PriceGroupService.cfc:L429-L431]. `getGlobalPriceGroupRate()`
    // [model/entity/PriceGroup.cfc:L83-L90] scans for the rate whose flag is set; two set flags
    // make the price it returns depend on association order.
    const savedRate = aRate({ globalFlag: true });
    const sibling = aRate({ priceGroupRateID: SIBLING_RATE_ID, globalFlag: true });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate, sibling);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(sibling.getGlobalFlag()).toBe(false);
    expect(repository.rateSaves[0]?.reconciledSiblings).toStrictEqual([sibling]);
  });

  it('leaves a rival global rate alone when the saved rate is not global', async () => {
    // [model/service/PriceGroupService.cfc:L429] uses `&&`, which short-circuits: a non-global
    // saved rate never even reads the sibling's flag.
    const savedRate = aRate({ globalFlag: false });
    const sibling = aRate({ priceGroupRateID: SIBLING_RATE_ID, globalFlag: true });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate, sibling);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(sibling.getGlobalFlag()).toBe(true);
    expect(repository.rateSaves[0]?.reconciledSiblings).toStrictEqual([]);
  });

  it('never reconciles the saved rate against itself', async () => {
    // [model/service/PriceGroupService.cfc:L414] skips the rate whose key matches. Without the
    // guard the saved rate would strip its own membership and demote its own flag.
    const contested = new Sku({ skuID: 'sku-1' });
    const savedRate = aRate({ globalFlag: true, skus: [contested] });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(repository.rateSaves[0]?.reconciledSiblings).toStrictEqual([]);
  });

  it('★ sends NOTHING when no sibling actually changed', async () => {
    // Hibernate flushed the entities it had detected as DIRTY, so a sibling the `remove*` calls
    // did not actually alter was never written.
    const savedRate = aRate({ skus: [new Sku({ skuID: 'sku-saved' })] });
    const sibling = aRate({
      priceGroupRateID: SIBLING_RATE_ID,
      skus: [new Sku({ skuID: 'sku-unrelated' })],
    });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate, sibling);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(sibling.getSkus()).toHaveLength(1);
    expect(repository.rateSaves[0]?.reconciledSiblings).toStrictEqual([]);
  });

  it('collects several siblings, in the order the association yields them', async () => {
    const contested = new Sku({ skuID: 'sku-contested' });
    const savedRate = aRate({ skus: [contested] });
    const first = aRate({ priceGroupRateID: SIBLING_RATE_ID, skus: [contested] });
    const second = aRate({ priceGroupRateID: OTHER_SIBLING_RATE_ID, skus: [contested] });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate, first, second);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(repository.rateSaves[0]?.reconciledSiblings).toStrictEqual([first, second]);
  });

  it('processes every sibling of an unsaved rate, whose key is the empty string', async () => {
    // Legacy compared against a uuid Hibernate had already assigned; the target compares before
    // the write, so a brand-new rate carries `unsavedvalue=""`.
    const contested = new Sku({ skuID: 'sku-contested' });
    const savedRate = aRate({ priceGroupRateID: UNSAVED_RATE_ID, skus: [contested] });
    const sibling = aRate({ priceGroupRateID: SIBLING_RATE_ID, skus: [contested] });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate, sibling);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(repository.rateSaves[0]?.reconciledSiblings).toStrictEqual([sibling]);
  });
});

// The global-rate clear-out.

describe('savePriceGroupRate: the global clear-out', () => {
  it('★★ empties all SIX of the saved rate’s own collections', async () => {
    // [model/service/PriceGroupService.cfc:L437-L442]. A global rate applies to everything, so its
    // own inclusion and exclusion filters are meaningless - and three of these six were
    // unreachable until the entity declared their generated setters.
    const savedRate = aRate({
      globalFlag: true,
      productTypes: [new ProductType({ productTypeID: 'ptp-1' })],
      products: [new Product({ productID: 'prd-1' })],
      skus: [new Sku({ skuID: 'sku-1' })],
      excludedProductTypes: [new ProductType({ productTypeID: 'ptp-x' })],
      excludedProducts: [new Product({ productID: 'prd-x' })],
      excludedSkus: [new Sku({ skuID: 'sku-x' })],
    });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    await service.savePriceGroupRate(savedRate, aPayload());

    const written = repository.rateSaves[0]?.rate;

    expect(written?.getProductTypes()).toStrictEqual([]);
    expect(written?.getProducts()).toStrictEqual([]);
    expect(written?.getSkus()).toStrictEqual([]);
    expect(written?.getExcludedProductTypes()).toStrictEqual([]);
    expect(written?.getExcludedProducts()).toStrictEqual([]);
    expect(written?.getExcludedSkus()).toStrictEqual([]);
  });

  it('leaves a non-global rate’s collections exactly as they were', async () => {
    const savedRate = aRate({
      globalFlag: false,
      skus: [new Sku({ skuID: 'sku-1' })],
      excludedSkus: [new Sku({ skuID: 'sku-x' })],
    });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(repository.rateSaves[0]?.rate.getSkus()).toHaveLength(1);
    expect(repository.rateSaves[0]?.rate.getExcludedSkus()).toHaveLength(1);
  });

  it('★ strips the siblings BEFORE emptying its own collections, not after', async () => {
    // The ordering is load-bearing and easy to invert.
    // [model/service/PriceGroupService.cfc:L416-L426] reads the saved rate's membership to decide
    // what to remove from each sibling; [model/service/PriceGroupService.cfc:L437-L439] then
    // empties that same membership.
    const contested = new Sku({ skuID: 'sku-contested' });
    const savedRate = aRate({ globalFlag: true, skus: [contested] });
    const sibling = aRate({ priceGroupRateID: SIBLING_RATE_ID, skus: [contested] });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(savedRate, sibling);

    await service.savePriceGroupRate(savedRate, aPayload());

    expect(sibling.getSkus()).toStrictEqual([]);
    expect(repository.rateSaves[0]?.rate.getSkus()).toStrictEqual([]);
    expect(repository.rateSaves[0]?.reconciledSiblings).toStrictEqual([sibling]);
  });
});

// The preserved legacy failures.

describe('savePriceGroupRate: preserved legacy failures', () => {
  it('★★ DEFECT 30 - throws on the "new amount" sentinel, because clearAmounts always did', async () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L400]: the 'new amount' branch calls
    // clearAmounts() on the service, a method that does not exist anywhere in the codebase, so it
    // reaches the missing-method throw at org/Hibachi/HibachiService.cfc:L280.
    // Preserved deliberately; do not fix without a product decision.
    const { service, repository } = makeSubject();
    const savedRate = aRate();

    aPriceGroupHolding(savedRate);

    await expect(
      service.savePriceGroupRate(savedRate, { priceGroupRateId: 'new amount' }),
    ).rejects.toThrow(/clearAmounts/);
    await expect(
      service.savePriceGroupRate(savedRate, { priceGroupRateId: 'new amount' }),
    ).rejects.toThrow(/L400/);
    expect(repository.rateSaves).toStrictEqual([]);
  });

  it('★ throws when the payload is absent, because [L399] dereferences it unguarded', async () => {
    // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L399]: `data` is declared optional but
    // the body dereferences arguments.data.priceGroupRateId unconditionally.
    // Preserved deliberately; do not fix without a product decision.
    const { service, repository } = makeSubject();
    const savedRate = aRate();

    aPriceGroupHolding(savedRate);

    await expect(service.savePriceGroupRate(savedRate)).rejects.toThrow();
    expect(repository.rateSaves).toStrictEqual([]);
  });

  it('REFUSES a rate with no price group before the unguarded dereference is ever reached', async () => {
    // The dereference is unguarded, and it is also UNREACHABLE in that state.
    //
    // The exclusivity enforcement is not silently omitted, which was the real worry: it is omitted
    // exactly when the legacy omits it, for a rate the legacy refuses to save at all.
    const { service, repository } = makeSubject();
    const orphanRate = aRate();

    const returned = await service.savePriceGroupRate(orphanRate, aPayload());

    expect(returned).toBe(orphanRate);
    expect(repository.rateSaves).toStrictEqual([]);
  });
});

// DeletePriceGroup - DEFECT 6, the detachment loop, and the one delegation.

describe('deletePriceGroup: the child detachment loop', () => {
  // net-new coverage (AAP 0.6.6), like every case in this file. `meta/tests/` carries no
  // PriceGroupService test at all, so nothing here traces to a legacy antecedent.

  it('★★ empties the child collection before delegating, never after', async () => {
    // The ordering is the whole reason the loop is in this method rather than the adapter: in
    // legacy the collection had to be empty by the time `validate(context="delete")` ran inside
    // `super.delete()` [org/Hibachi/HibachiService.cfc:L55].
    const { service, repository } = makeSubject();
    const parent = aPriceGroupHolding();
    const child = aChildOf(parent);

    expect(parent.getChildPriceGroups()).toStrictEqual([child]);

    await expect(service.deletePriceGroup(parent)).resolves.toBe(true);

    // Observed at the delegation, not after it - see `deleteChildCounts`.
    expect(repository.deleteChildCounts).toStrictEqual([0]);
    expect(parent.getChildPriceGroups()).toStrictEqual([]);
  });

  it('detaches every child, however many there are', async () => {
    // The legacy loops `while(arrayLen(inheritingPriceGroups) != 0)`
    // [model/service/PriceGroupService.cfc:L465-L467], removing index 1 each pass, so three
    // children take three passes.
    const { service, repository } = makeSubject();
    const parent = aPriceGroupHolding();
    const children = [
      aChildOf(parent, 'pg-child-1'),
      aChildOf(parent, 'pg-child-2'),
      aChildOf(parent, 'pg-child-3'),
    ];

    expect(parent.getChildPriceGroups()).toHaveLength(children.length);

    await expect(service.deletePriceGroup(parent)).resolves.toBe(true);

    expect(parent.getChildPriceGroups()).toStrictEqual([]);

    // All three were gone by the delegation, not merely by the end of the method.
    expect(repository.deleteChildCounts).toStrictEqual([0]);

    // Each child's own parent link is cleared too, because the remove helper is bidirectional
    // [model/entity/PriceGroup.cfc:L139 -> L116-L125].
    for (const child of children) {
      expect(child.getParentPriceGroup()).toBeUndefined();
    }
  });

  it('delegates exactly once, passing the entity itself and no cascade flag', async () => {
    // Legacy [model/service/PriceGroupService.cfc:L469]: `return super.delete(priceGroup);` -
    // positional, bare, one argument.
    const { service, repository } = makeSubject();
    const parent = aPriceGroupHolding();

    await service.deletePriceGroup(parent);

    expect(repository.deletes).toStrictEqual([parent]);
    expect(repository.rateSaves).toHaveLength(0);
  });

  it('★★ returns the repository refusal verbatim, and issues no second call', async () => {
    const { service, repository } = makeSubject();

    repository.deleteResult = false;

    const parent = aPriceGroupHolding();
    const child = aChildOf(parent);

    await expect(service.deletePriceGroup(parent)).resolves.toBe(false);
    expect(repository.deletes).toHaveLength(1);
    expect(parent.getChildPriceGroups()).toStrictEqual([]);
    expect(child.getParentPriceGroup()).toBeUndefined();
  });

  it('resolves a boolean, never a truthy entity or an undefined', async () => {
    // [model/service/PriceGroupService.cfc:L461] declares `public boolean function`, and the
    // delete gates make the `false` arm reachable in ordinary use rather than only on a missing
    // row.
    const { service, repository } = makeSubject();

    await expect(service.deletePriceGroup(aPriceGroupHolding())).resolves.toBe(true);

    repository.deleteResult = false;

    await expect(service.deletePriceGroup(aPriceGroupHolding())).resolves.toBe(false);
  });

  it('touches neither the product repository nor the framework reads', async () => {
    // In particular no count, probe or page read is issued from here for the five out-of-scope
    // gates: they are enforced by the adapter against what is STORED, and this method learns their
    // outcome only as the boolean.
    const { service, productRepository, frameworkReads } = makeSubject();

    await expect(service.deletePriceGroup(aPriceGroupHolding())).resolves.toBe(true);

    expect(productRepository.productLookups).toStrictEqual([]);
    expect(frameworkReads.accountPriceGroupReads).toStrictEqual([]);
    expect(frameworkReads.pageRecordReads).toBe(0);
  });

  it('leaves a childless price group untouched, emitting no loop iteration', async () => {
    // `while(arrayLen(...) != 0)` never enters when the collection is already empty, and the
    // bounded-iteration ceiling is derived from that same initial length.
    const { service, repository } = makeSubject();
    const parent = aPriceGroupHolding();

    expect(parent.getChildPriceGroups()).toStrictEqual([]);

    await expect(service.deletePriceGroup(parent)).resolves.toBe(true);

    expect(parent.getChildPriceGroups()).toStrictEqual([]);
    expect(repository.deletes).toStrictEqual([parent]);
  });
});

describe('deletePriceGroup: DEFECT 6, the bounded-iteration guard', () => {
  // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L461-L470]: deletePriceGroup snapshots
  // getChildPriceGroups() by value at L463 and never re-reads it, so the while loop at L465 can
  // never terminate.
  // Preserved deliberately; do not fix without a product decision.
  //
  // SECOND, the "source TODO" is retained in the shipped module as the LEGACY-DEFECT marker at its
  // `deletePriceGroup`, complete with the `` instruction and a JUDGMENT CALL note explaining that
  // the guard is a termination safeguard rather than a behaviour change.

  afterEach(() => {
    // `tests/setup.ts` already restores globally; this is the suite-local restore the project's
    // spy discipline asks for, so the stub cannot outlive the case that installed it even if the
    // global hook is ever changed.
    vi.restoreAllMocks();
  });

  it('★★ TRIPS when the remove helper stops mutating the collection the loop re-tests', async () => {
    const { service, repository } = makeSubject();
    const parent = aPriceGroupHolding();
    const child = aChildOf(parent);
    const detach = vi.spyOn(parent, 'removeChildPriceGroup').mockImplementation(() => {
      // Deliberately does not splice. This is the exact hypothetical the shipped JUDGMENT CALL
      // names: an accessor that hands out a copy, or a remove helper that stops touching the live
      // array, turns [model/service/PriceGroupService.cfc:L465-L467] into a loop with no
      // termination condition at all.
    });

    // The ceiling is DERIVED from the captured length - one child means one permitted pass - so
    // the second pass is the one that fires it.
    await expect(service.deletePriceGroup(parent)).rejects.toThrow(/detach iterations/);

    expect(detach).toHaveBeenCalledTimes(1);
    expect(detach).toHaveBeenCalledWith(child);

    // And nothing was deleted.
    expect(repository.deletes).toStrictEqual([]);
    expect(parent.getChildPriceGroups()).toStrictEqual([child]);
  });

  it('★ names the broken invariant and the accessor responsible', async () => {
    // The message is part of the contract here, because the whole value of converting a hang into
    // a failure is that the failure explains itself.
    const { service } = makeSubject();
    const parent = aPriceGroupHolding();

    aChildOf(parent, 'pg-child-diag');
    vi.spyOn(parent, 'removeChildPriceGroup').mockImplementation(() => {});

    await expect(service.deletePriceGroup(parent)).rejects.toThrow(/removeChildPriceGroup/);
    await expect(service.deletePriceGroup(parent)).rejects.toThrow(/L465-L467/);
    await expect(service.deletePriceGroup(parent)).rejects.toThrow(new RegExp(PRICE_GROUP_ID));
  });

  it('★ does NOT trip for a many-child group while the splice still happens', async () => {
    // The guard has to be invisible in ordinary use, or it becomes a bug of its own.
    const { service, repository } = makeSubject();
    const parent = aPriceGroupHolding();

    for (let index = 0; index < 8; index += 1) {
      aChildOf(parent, `pg-child-bulk-${String(index)}`);
    }

    expect(parent.getChildPriceGroups()).toHaveLength(8);

    await expect(service.deletePriceGroup(parent)).resolves.toBe(true);

    expect(parent.getChildPriceGroups()).toStrictEqual([]);
    expect(repository.deleteChildCounts).toStrictEqual([0]);
  });

  it('CFML parity note: [L466] reads an UNSCOPED `priceGroup` inside the loop', async () => {
    // CFML parity [model/service/PriceGroupService.cfc:L466]: the body writes
    // `priceGroup.removeChildPriceGroup(...)` without the `arguments.` prefix, while
    // [model/service/PriceGroupService.cfc:L463] and [model/service/PriceGroupService.cfc:L469]
    // both spell it `arguments.priceGroup`.
    const { service } = makeSubject();
    const passedIn = aPriceGroupHolding();
    const child = aChildOf(passedIn);
    const bystander = aPriceGroupNamed('pg-bystander');
    const bystanderChild = aChildOf(bystander, 'pg-bystander-child');

    await expect(service.deletePriceGroup(passedIn)).resolves.toBe(true);

    expect(passedIn.getChildPriceGroups()).toStrictEqual([]);

    // The bystander graph is untouched, so no second entity was reached through an ambient or
    // mis-scoped reference.
    expect(bystander.getChildPriceGroups()).toStrictEqual([bystanderChild]);
    expect(child.getParentPriceGroup() === bystander).toBe(false);
  });
});

// Composition, the async boundary, and the resolver contract.

describe('the service takes three explicit collaborators and nothing ambient', () => {
  it('is wired by hand, with no container, locator or request scope', () => {
    // Transformation rules T1 and T6.
    expect(PriceGroupService.length).toBe(3);
  });

  it('touches neither the product repository nor the framework reads on a rate save', async () => {
    const savedRate = aRate();
    const { service, productRepository, frameworkReads } = makeSubject();

    aPriceGroupHolding(savedRate);

    await expect(service.savePriceGroupRate(savedRate, aPayload())).resolves.toBe(savedRate);

    expect(productRepository.productLookups).toStrictEqual([]);
    expect(frameworkReads.accountPriceGroupReads).toStrictEqual([]);
    expect(frameworkReads.pageRecordReads).toBe(0);
  });

  it('declares CurrentAccountContext as one optional opaque identifier', () => {
    // Compile-time only: the ambient scope's replacement carries an account identifier and nothing
    // else - no session, no locale, no logger.
    const empty: CurrentAccountContext = {};
    const populated: CurrentAccountContext = { accountID: ACCOUNT_ID };

    expect(Object.keys(empty)).toStrictEqual([]);
    expect(Object.keys(populated)).toStrictEqual(['accountID']);
  });

  it('★ satisfies SkuPriceGroupResolver structurally, by assignment rather than by cast', () => {
    // `SkuPriceGroupResolver` is published by `src/domain/entities/sku.ts`, not by the price-group
    // port - the entity declares the narrow contract it needs so that `Sku` can price itself
    // without importing a service.
    const { service } = makeSubject();
    const resolver: SkuPriceGroupResolver = service;

    expect(typeof resolver.calculateSkuPriceBasedOnPriceGroup).toBe('function');
    expect(typeof resolver.getRateForSkuBasedOnPriceGroup).toBe('function');
    expect(typeof resolver.calculateSkuPriceBasedOnCurrentAccount).toBe('function');
  });
});

describe('the async boundary: five synchronous methods, eight asynchronous ones', () => {
  // The rule the whole port applies (AAP 0.4.2): a method becomes async if and only if its legacy
  // body reaches the DAO or the ORM.
  //
  // Enforced by INVOCATION rather than by inspecting a signature: the synchronous five are called
  // with no `await` and their return values are used directly.

  it('★★ the five cascade and arithmetic methods return values, not promises', () => {
    const product = makeProductFixture({ idPrefix: 'ab-prod-' });
    const productType = requirePresent(product.getProductType(), 'the fixture product type');
    const sku = makeSkuFixture({
      idPrefix: 'ab-sku-',
      price: Money.fromDecimalString(SKU_BASE_PRICE),
      product,
    });
    const graph = makePriceGroupFixtures({ idPrefix: 'ab-', skuLevelRateSkus: [sku] });
    const { service } = makeSubject();

    const skuRate = service.getRateForSkuBasedOnPriceGroup(sku, graph.childPriceGroup);
    const productRate = service.getRateForProductBasedOnPriceGroup(product, graph.childPriceGroup);
    const productTypeRate = service.getRateForProductTypeBasedOnPriceGroup(
      productType,
      graph.childPriceGroup,
    );
    const priceFromGroup = service.calculateSkuPriceBasedOnPriceGroup(sku, graph.childPriceGroup);
    const priceFromRate = service.calculateSkuPriceBasedOnPriceGroupRate(
      sku,
      graph.percentageOffRateWithoutRoundingRule,
    );

    expect(skuRate).toBeInstanceOf(PriceGroupRate);
    expect(productRate).toBeInstanceOf(PriceGroupRate);
    expect(productTypeRate).toBeInstanceOf(PriceGroupRate);
    expect(priceFromGroup).toBeInstanceOf(Money);
    expect(priceFromRate).toBeInstanceOf(Money);

    // Stated the other way round too, because `toBeInstanceOf(Money)` alone would still pass for a
    // promise-returning method if the assertion were awaited by accident.
    expect(priceFromGroup).not.toBeInstanceOf(Promise);
    expect(priceFromRate).not.toBeInstanceOf(Promise);
  });

  it('★★ the eight port-reaching methods return promises', async () => {
    const sku = aPricedSku('ab2-sku-');
    const rate = aRate();
    const order = makeOrderViewFixture({ idPrefix: 'ab2-', accountID: undefined });
    const { service, repository } = makeSubject();

    aPriceGroupHolding(rate);
    repository.rateLookupResult = rate;
    const results = await Promise.all([
      service.updatePriceGroupSKUSettings(aSettingsPayload('', '', undefined)),
      service.getPriceGroupDataJSON(),
      service.calculateSkuPriceBasedOnCurrentAccount(sku, {}),
      service.calculateSkuPriceBasedOnAccount(sku, ACCOUNT_ID),
      service.getBestPriceGroupDetailsBasedOnSkuAndAccount(sku, ACCOUNT_ID),
      service.updateOrderAmountsWithPriceGroups(order),
      service.savePriceGroupRate(rate, aPayload()),
      service.deletePriceGroup(aPriceGroupHolding()),
    ]);

    expect(results).toHaveLength(8);

    const [settings, json, currentAccountPrice, accountPrice, details, intents, saved, deleted] =
      results;

    expect(settings).toBeUndefined();
    expect(json).toBe('{}');
    expect(currentAccountPrice).toBeInstanceOf(Money);
    expect(accountPrice).toBeInstanceOf(Money);
    expect(details).toBeDefined();
    expect(intents).toStrictEqual([]);
    expect(saved).toBe(rate);
    expect(deleted).toBe(true);
  });

  it('★ all THIRTEEN public methods exist on the instance', () => {
    const { service } = makeSubject();
    const surface = [
      'getRateForProductTypeBasedOnPriceGroup',
      'getRateForProductBasedOnPriceGroup',
      'getRateForSkuBasedOnPriceGroup',
      'updatePriceGroupSKUSettings',
      'getPriceGroupDataJSON',
      'calculateSkuPriceBasedOnCurrentAccount',
      'calculateSkuPriceBasedOnAccount',
      'calculateSkuPriceBasedOnPriceGroup',
      'calculateSkuPriceBasedOnPriceGroupRate',
      'getBestPriceGroupDetailsBasedOnSkuAndAccount',
      'updateOrderAmountsWithPriceGroups',
      'savePriceGroupRate',
      'deletePriceGroup',
    ] as const;

    expect(surface).toHaveLength(13);
    expect(new Set(surface).size).toBe(13);

    for (const methodName of surface) {
      expect(typeof service[methodName]).toBe('function');
    }
  });
});
