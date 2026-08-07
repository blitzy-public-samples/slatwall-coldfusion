// slatwall-ts - characterization suite pinning `src/services/promotion/orderItemMembership.ts`
//
// No arithmetic happens in either body, and yet both sit squarely inside MUST-PRESERVE AREA #1 -
// promotion discount math TOGETHER with use-limit enforcement.
//
// This module is the LEAF of the sibling-import graph
// `promotionPeriodQualification.ts -> qualifierQualification.ts -> orderItemMembership.ts`.
//
// Not one assertion below has a legacy antecedent, and saying so is a requirement rather than a
// courtesy: presenting net-new coverage as parity fails the traceability gate.

import { beforeEach, describe, expect, it } from 'vitest';

import { Money } from '../../../../src/domain/valueObjects/money.js';
import { OrderItemMembership } from '../../../../src/services/promotion/orderItemMembership.js';
import { makeOrderViewFixture } from '../../../fixtures/orderViewFixtures.js';
import { makeProductFixture } from '../../../fixtures/productFixtures.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';
import { makeSkuFixture } from '../../../fixtures/skuFixtures.js';

import { listLen, listToArray } from '../../../../src/lib/cfml/list.js';
import { isNullish } from '../../../../src/lib/cfml/truthiness.js';

import type { Option } from '../../../../src/domain/entities/option.js';
import type { Product } from '../../../../src/domain/entities/product.js';
import type { ProductType } from '../../../../src/domain/entities/productType.js';
import type { PromotionQualifier } from '../../../../src/domain/entities/promotionQualifier.js';
import type { PromotionReward } from '../../../../src/domain/entities/promotionReward.js';
import type { Sku } from '../../../../src/domain/entities/sku.js';
import type { OrderItemView } from '../../../../src/domain/views/orderItemView.js';

// Local types over the fixture surface.
//
// `makePromotionFixtures` declares its graph and its override bag LOCALLY and exports neither, so
// that the module has exactly one exported unit.

type PromotionFixtureGraph = ReturnType<typeof makePromotionFixtures>;

type PromotionFixtureOverrides = NonNullable<Parameters<typeof makePromotionFixtures>[0]>;

// The two accessor censuses, spelled out.
//
// These lists are the assertion, not documentation of it.

/**
 * The thirteen members `getOrderItemInQualifier` reads, in legacy operand order.
 */
const QUALIFIER_MEMBERSHIP_ACCESSORS = [
  // Exclusion side, [model/service/PromotionService.cfc:L858-L885].
  'getExcludedProductTypes',
  'getMinimumItemPrice',
  'getMaximumItemPrice',
  'hasExcludedProduct',
  'hasExcludedSku',
  'getExcludedBrands',
  'hasExcludedBrand',
  'hasAnyExcludedOption',
  // Inclusion side, [model/service/PromotionService.cfc:L892-L914].
  'getProductTypes',
  'hasProduct',
  'hasSku',
  'hasBrand',
  'hasAnyOption',
] as const;

/**
 * The eleven members `getOrderItemInReward` reads - the qualifier's set minus the price bounds.
 */
const REWARD_MEMBERSHIP_ACCESSORS = [
  // Exclusion side, [model/service/PromotionService.cfc:L928-L951].
  'getExcludedProductTypes',
  'hasExcludedProduct',
  'hasExcludedSku',
  'getExcludedBrands',
  'hasExcludedBrand',
  'hasAnyExcludedOption',
  // Inclusion side, [model/service/PromotionService.cfc:L958-L980].
  'getProductTypes',
  'hasProduct',
  'hasSku',
  'hasBrand',
  'hasAnyOption',
] as const;

/**
 * The two accessors that exist on the qualifier alone - operands 2 and 3 of the seven.
 */
const QUALIFIER_ONLY_ITEM_PRICE_ACCESSORS = ['getMinimumItemPrice', 'getMaximumItemPrice'] as const;

/**
 * Every member `OrderItemView` publishes. Locked at ten by `src/domain/views/orderItemView.ts`.
 */
const ORDER_ITEM_VIEW_MEMBERS = [
  'orderItemID',
  'sku',
  'quantity',
  'price',
  'skuPrice',
  'extendedPrice',
  'extendedSkuPrice',
  'appliedPriceGroup',
  'orderItemType',
  'orderFulfillmentID',
] as const;

/**
 * Does this entity declare this member, anywhere on its prototype chain?
 *
 * A plain `in` test, which is total, allocation-free and fully typed - no cast, no reflection
 * helper answering `any`, and no non-null assertion.
 */
function declaresMember(subject: object, member: string): boolean {
  return member in subject;
}

// JUDGMENT CALL: the view is a read-only anti-corruption shape of exactly ten members, so a case
// that needs a SPECIFIC sku paired with a SPECIFIC price constructs one directly here rather than
// threading an override through the shared order fixture.

/**
 * A minimal order item carrying a chosen sku at a chosen price.
 *
 * The seven members neither twin reads are populated with coherent values rather than left out -
 * the view's members are all required.
 */
function makeMembershipOrderItem(
  sku: Sku,
  price: string,
  orderItemID = 'membership-item',
): OrderItemView {
  const itemPrice: Money = Money.fromDecimalString(price);

  return {
    orderItemID,
    sku,
    quantity: 1,
    price: itemPrice,
    skuPrice: itemPrice,
    extendedPrice: itemPrice,
    extendedSkuPrice: itemPrice,
    appliedPriceGroup: undefined,
    orderItemType: { systemCode: 'oitSale' },
    orderFulfillmentID: 'membership-fulfillment',
    // Empty because membership testing never reads it.
    appliedPromotions: [],
  };
}

/**
 * An order item and the log of which view members the subject actually read from it.
 */
interface RecordedOrderItem {
  readonly view: OrderItemView;

  /**
   * Live: members append as they are read. Read after invoking the subject.
   */
  readonly reads: readonly string[];
}

/**
 * Wraps an order item so that every member read is recorded.
 *
 * Plain getters over a delegate - no proxy, no spy library, no new dependency.
 */
function recordOrderItemReads(base: OrderItemView): RecordedOrderItem {
  const reads: string[] = [];

  function tap<TValue>(member: string, value: TValue): TValue {
    reads.push(member);
    return value;
  }

  const view: OrderItemView = {
    get orderItemID() {
      return tap('orderItemID', base.orderItemID);
    },
    get sku() {
      return tap('sku', base.sku);
    },
    get quantity() {
      return tap('quantity', base.quantity);
    },
    get price() {
      return tap('price', base.price);
    },
    get skuPrice() {
      return tap('skuPrice', base.skuPrice);
    },
    get extendedPrice() {
      return tap('extendedPrice', base.extendedPrice);
    },
    get extendedSkuPrice() {
      return tap('extendedSkuPrice', base.extendedSkuPrice);
    },
    get appliedPriceGroup() {
      return tap('appliedPriceGroup', base.appliedPriceGroup);
    },
    get orderItemType() {
      return tap('orderItemType', base.orderItemType);
    },
    get orderFulfillmentID() {
      return tap('orderFulfillmentID', base.orderFulfillmentID);
    },
    // Instrumented like every other member precisely so the suite can PROVE membership testing
    // never touches it.
    get appliedPromotions() {
      return tap('appliedPromotions', base.appliedPromotions);
    },
  };

  return { view, reads };
}

/**
 * The distinct view members read, sorted, so a case can compare against an exact set.
 */
function distinctReads(recorded: RecordedOrderItem): readonly string[] {
  return [...new Set(recorded.reads)].sort();
}

// Fixture configuration helpers.
//
// The fixture attaches one element to each of the ten membership collections by default, and the
// same ten collections are attached to both the qualifier and every reward.

/**
 * An override bag with every membership collection empty and both item-price bounds absent.
 *
 * The bounds are removed by passing `undefined` EXPLICITLY, which the fixture distinguishes from
 * omission: its gate resolver tests own-key presence.
 */
function unconfigured(extra?: PromotionFixtureOverrides): PromotionFixtureOverrides {
  return {
    brands: [],
    options: [],
    skus: [],
    products: [],
    productTypes: [],
    excludedBrands: [],
    excludedOptions: [],
    excludedSkus: [],
    excludedProducts: [],
    excludedProductTypes: [],
    qualifierGates: { minimumItemPrice: undefined, maximumItemPrice: undefined },
    ...extra,
  };
}

/**
 * The three levels of the fixture's product-type chain, narrowed without a non-null assertion.
 */
interface ProductTypeChainNodes {
  readonly root: ProductType;
  readonly parent: ProductType;
  readonly leaf: ProductType;
}

/**
 * Root, parent and leaf of the fixture's product-type chain.
 *
 * `noUncheckedIndexedAccess` makes each indexed read `ProductType | undefined`; each is captured
 * into a local and narrowed by an explicit check.
 */
function chainNodes(graph: PromotionFixtureGraph): ProductTypeChainNodes {
  const chain: readonly ProductType[] = graph.productTypeChain;
  const root = chain[0];
  const parent = chain[1];
  const leaf = chain[2];

  if (root === undefined || parent === undefined || leaf === undefined) {
    throw new Error(
      `The promotion fixture must publish a product-type chain at least three levels deep for the ` +
        `ancestor-membership cases to mean anything; received ${String(chain.length)} level(s).`,
    );
  }

  return { root, parent, leaf };
}

/**
 * The sku's first option, narrowed without a non-null assertion.
 */
function firstOption(sku: Sku): Option {
  const options: readonly Option[] = sku.getOptions();
  const option = options[0];

  if (option === undefined) {
    throw new Error(
      'The sku fixture must carry at least one option for the option-membership cases to mean ' +
        'anything; received an option-less sku.',
    );
  }

  return option;
}

describe('OrderItemMembership', () => {
  let fixtures: PromotionFixtureGraph;
  let membership: OrderItemMembership;
  let qualifier: PromotionQualifier;
  let reward: PromotionReward;

  beforeEach(() => {
    fixtures = makePromotionFixtures();
    membership = new OrderItemMembership();
    qualifier = fixtures.promotionQualifier;
    reward = fixtures.merchandiseReward;
  });

  describe('the shipped surface', () => {
    it('constructs with no dependencies at all', () => {
      // Both bodies are pure over their arguments - no DAO, no ORM, no port, no setting - so there
      // is nothing to inject.
      const constructed = new OrderItemMembership();

      expect(constructed).toBeInstanceOf(OrderItemMembership);
      expect(OrderItemMembership.length).toBe(0);
    });

    it('exposes both twins under their verbatim legacy names, consuming ZERO visibility widenings', () => {
      expect(typeof membership.getOrderItemInQualifier).toBe('function');
      expect(typeof membership.getOrderItemInReward).toBe('function');

      // Two parameters each, matching the legacy `(qualifier, orderItem)` and
      // `(reward, orderItem)` - nothing added, nothing defaulted, nothing reordered.
      expect(membership.getOrderItemInQualifier.length).toBe(2);
      expect(membership.getOrderItemInReward.length).toBe(2);
    });

    it('answers a boolean synchronously rather than a promise', () => {
      // The async boundary rule: a method becomes async if and only if its legacy body reaches the
      // DAO or the ORM. Neither of these does, so both stay synchronous.
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');

      const qualifierAnswer = membership.getOrderItemInQualifier(qualifier, orderItem);
      const rewardAnswer = membership.getOrderItemInReward(reward, orderItem);

      expect(typeof qualifierAnswer).toBe('boolean');
      expect(typeof rewardAnswer).toBe('boolean');
      expect(qualifierAnswer).not.toBeInstanceOf(Promise);
      expect(rewardAnswer).not.toBeInstanceOf(Promise);
    });

    it('admits the fully configured fixture item through both twins', () => {
      // The baseline every asymmetry case below is measured against.
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');

      expect(membership.getOrderItemInQualifier(qualifier, orderItem)).toBe(true);
      expect(membership.getOrderItemInReward(reward, orderItem)).toBe(true);
    });
  });

  describe('the seven-versus-five exclusion asymmetry', () => {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L873-L886, L943-L952]: the two predicates
    // are near-identical twins that diverge in EXACTLY two CLAUSES - the qualifier's
    // `minimumItemPrice` gate at [model/service/PromotionService.cfc:L875] and its
    // `maximumItemPrice` gate at [model/service/PromotionService.cfc:L877].

    it('excludes an under-priced item from the qualifier while the reward still admits it', () => {
      // One cent below the fixture's documented `minimumItemPrice` of 9.99. Identical collections
      // on both twins, identical order item; the only difference is that operand 2 exists on one
      // of them.
      const underPriced = makeMembershipOrderItem(fixtures.sku, '9.98');

      expect(qualifier.getMinimumItemPrice()?.toFixed2()).toBe('9.99');
      expect(membership.getOrderItemInQualifier(qualifier, underPriced)).toBe(false);
      expect(membership.getOrderItemInReward(reward, underPriced)).toBe(true);
    });

    it('excludes an over-priced item from the qualifier while the reward still admits it', () => {
      // Operand 3, the mirror image: one cent above the documented `maximumItemPrice` of 199.99.
      const overPriced = makeMembershipOrderItem(fixtures.sku, '200.00');

      expect(qualifier.getMaximumItemPrice()?.toFixed2()).toBe('199.99');
      expect(membership.getOrderItemInQualifier(qualifier, overPriced)).toBe(false);
      expect(membership.getOrderItemInReward(reward, overPriced)).toBe(true);
    });

    it('declares both item-price accessors on the qualifier and NEITHER on the reward', () => {
      // The asymmetry is a SCHEMA fact, not a call-site accident:
      // [model/entity/PromotionQualifier.cfc:L61-L62] declares both bounds as
      // `ormtype="big_decimal" hb_formatType="currency"`.
      for (const accessor of QUALIFIER_ONLY_ITEM_PRICE_ACCESSORS) {
        expect(declaresMember(qualifier, accessor)).toBe(true);
        expect(declaresMember(reward, accessor)).toBe(false);
      }

      expect(QUALIFIER_ONLY_ITEM_PRICE_ACCESSORS).toHaveLength(2);
    });

    it('reads price for the qualifier and never reads it at all for the reward', () => {
      // The most direct available proof of the asymmetry, and the reason the read-recording
      // wrapper exists: the reward twin has no item-price operand, so it never even ASKS the order
      // item for its price.
      const qualifierReads = recordOrderItemReads(makeMembershipOrderItem(fixtures.sku, '100.00'));
      const rewardReads = recordOrderItemReads(makeMembershipOrderItem(fixtures.sku, '100.00'));

      expect(membership.getOrderItemInQualifier(qualifier, qualifierReads.view)).toBe(true);
      expect(membership.getOrderItemInReward(reward, rewardReads.view)).toBe(true);

      expect(distinctReads(qualifierReads)).toStrictEqual(['price', 'sku']);
      expect(distinctReads(rewardReads)).toStrictEqual(['sku']);
    });

    it('reproduces the qualifier census of thirteen accessors and the reward census of eleven', () => {
      // Thirteen against eleven, the same set minus the two bounds.
      const declaredOnQualifier = QUALIFIER_MEMBERSHIP_ACCESSORS.filter((accessor) =>
        declaresMember(qualifier, accessor),
      );
      const declaredOnReward = REWARD_MEMBERSHIP_ACCESSORS.filter((accessor) =>
        declaresMember(reward, accessor),
      );

      expect(declaredOnQualifier).toStrictEqual([...QUALIFIER_MEMBERSHIP_ACCESSORS]);
      expect(declaredOnReward).toStrictEqual([...REWARD_MEMBERSHIP_ACCESSORS]);

      expect(declaredOnQualifier).toHaveLength(13);
      expect(declaredOnReward).toHaveLength(11);

      // And the eleven really are the thirteen minus exactly the two bounds - asserted as a set
      // relation rather than left to the reader to check against the two literal lists.
      const rewardAccessorNames: ReadonlySet<string> = new Set<string>(REWARD_MEMBERSHIP_ACCESSORS);
      const remainder = QUALIFIER_MEMBERSHIP_ACCESSORS.filter(
        (accessor) => !rewardAccessorNames.has(accessor),
      );

      expect(remainder).toStrictEqual([...QUALIFIER_ONLY_ITEM_PRICE_ACCESSORS]);
    });

    it('lets a qualifier price gate answer false before the product is ever dereferenced, where the reward raises', () => {
      // CFML parity [model/service/PromotionService.cfc:L875, L877, L879]: the item-price operands
      // sit before the first product dereference in the legacy disjunction, and `||`
      // short-circuits.
      //
      // The reward twin, having no price operand, reaches its first product dereference
      // unconditionally - so the very same order item RAISES there.
      const productLessSku = makeSkuFixture({ idPrefix: 'no-product-sku', product: undefined });
      const graph = makePromotionFixtures(
        unconfigured({
          qualifierGates: {
            minimumItemPrice: Money.fromDecimalString('50.00'),
            maximumItemPrice: undefined,
          },
        }),
      );
      const cheapItem = makeMembershipOrderItem(productLessSku, '10.00');

      expect(productLessSku.getProduct()).toBeUndefined();
      expect(membership.getOrderItemInQualifier(graph.promotionQualifier, cheapItem)).toBe(false);
      expect(() => membership.getOrderItemInReward(graph.merchandiseReward, cheapItem)).toThrow(
        "requires the sku's owning product",
      );
    });
  });

  describe('both qualifier item-price bounds are strict, so boundary equality is inclusive', () => {
    // CFML parity [model/service/PromotionService.cfc:L875, L877]: the legacy operators are `>`
    // and `<`, never `>=` or `<=`.
    //
    // All three values are monetary, so the comparisons run through `Money.isGreaterThan` and
    // `Money.isLessThan` inside the subject.

    it('does not exclude an item priced exactly at minimumItemPrice', () => {
      const atMinimum = makeMembershipOrderItem(fixtures.sku, '9.99');

      expect(qualifier.getMinimumItemPrice()?.equals(Money.fromDecimalString('9.99'))).toBe(true);
      expect(membership.getOrderItemInQualifier(qualifier, atMinimum)).toBe(true);
    });

    it('does not exclude an item priced exactly at maximumItemPrice', () => {
      const atMaximum = makeMembershipOrderItem(fixtures.sku, '199.99');

      expect(qualifier.getMaximumItemPrice()?.equals(Money.fromDecimalString('199.99'))).toBe(true);
      expect(membership.getOrderItemInQualifier(qualifier, atMaximum)).toBe(true);
    });

    it('excludes one cent outside either bound, which is what makes the boundary cases meaningful', () => {
      // Paired with the two cases above this brackets both bounds exactly: inclusive at the bound,
      // exclusive one cent beyond it. Either comparison relaxed to `>=` or `<=` fails here.
      expect(
        membership.getOrderItemInQualifier(
          qualifier,
          makeMembershipOrderItem(fixtures.sku, '9.98'),
        ),
      ).toBe(false);
      expect(
        membership.getOrderItemInQualifier(
          qualifier,
          makeMembershipOrderItem(fixtures.sku, '200.00'),
        ),
      ).toBe(false);
    });

    it('treats an absent bound as no constraint rather than as zero', () => {
      // ABSENCE is not ZERO, and this is the case that pins it. A qualifier with both bounds
      // absent imposes no price constraint in either direction, so a one-cent item and a
      // near-million-unit item are both admitted.
      const openBanded = makePromotionFixtures({
        qualifierGates: { minimumItemPrice: undefined, maximumItemPrice: undefined },
      });

      expect(isNullish(openBanded.promotionQualifier.getMinimumItemPrice())).toBe(true);
      expect(isNullish(openBanded.promotionQualifier.getMaximumItemPrice())).toBe(true);
      expect(openBanded.promotionQualifier.getMinimumItemPrice()).toBeUndefined();
      expect(openBanded.promotionQualifier.getMaximumItemPrice()).toBeUndefined();

      expect(
        membership.getOrderItemInQualifier(
          openBanded.promotionQualifier,
          makeMembershipOrderItem(openBanded.sku, '0.01'),
        ),
      ).toBe(true);
      expect(
        membership.getOrderItemInQualifier(
          openBanded.promotionQualifier,
          makeMembershipOrderItem(openBanded.sku, '999999.99'),
        ),
      ).toBe(true);
    });

    it('reproduces an inverted band that excludes every item, without raising', () => {
      // The two bounds are INDEPENDENT and nothing validates them against each other: no check
      // that the minimum does not exceed the maximum, no non-negativity check, and no raise on a
      // nonsensical band.
      const inverted = makePromotionFixtures({
        qualifierGates: {
          minimumItemPrice: Money.fromDecimalString('100.00'),
          maximumItemPrice: Money.fromDecimalString('50.00'),
        },
      });
      const midBand = makeMembershipOrderItem(inverted.sku, '75.00');

      expect(membership.getOrderItemInQualifier(inverted.promotionQualifier, midBand)).toBe(false);
      expect(membership.getOrderItemInReward(inverted.merchandiseReward, midBand)).toBe(true);
    });
  });

  describe('the null-brand polarity inversion', () => {
    // LEGACY-NOTE [model/service/PromotionService.cfc:L883, L911, L949, L977]: the two brand
    // clauses test the same nullness with opposite polarity and yet point the same way - both
    // restrictive.
    //
    // A brandless product is therefore shut out from either direction.

    /**
     * A product with no brand, on a product type that keeps the path walk well defined.
     */
    function makeBrandlessSku(graph: PromotionFixtureGraph): Sku {
      const { leaf } = chainNodes(graph);

      // `{ brand: undefined }` is the fixture's DOCUMENTED brand-absent path: its resolver tests
      // own-key presence, so an explicit `undefined` requests absence where omission would build a
      // brand.
      const brandlessProduct: Product = makeProductFixture({
        idPrefix: 'brandless-product',
        productID: 'brandless-product',
        brand: undefined,
        productType: leaf,
      });

      return makeSkuFixture({ idPrefix: 'brandless-sku', product: brandlessProduct });
    }

    it('EXCLUDES a brandless product from BOTH twins once any excluded brand is named', () => {
      const graph = makePromotionFixtures();
      const brandlessSku = makeBrandlessSku(graph);
      const configured = makePromotionFixtures(
        // The item is a configured sku member, so the inclusion side WOULD admit it. Only the
        // brandless exclusion can produce `false` here.
        unconfigured({ skus: [brandlessSku], excludedBrands: [graph.brand] }),
      );
      const orderItem = makeMembershipOrderItem(brandlessSku, '100.00');

      expect(brandlessSku.getProduct()?.getBrand()).toBeUndefined();
      expect(configured.promotionQualifier.getExcludedBrands()).toHaveLength(1);
      expect(configured.merchandiseReward.getExcludedBrands()).toHaveLength(1);

      expect(membership.getOrderItemInQualifier(configured.promotionQualifier, orderItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInReward(configured.merchandiseReward, orderItem)).toBe(false);
    });

    it('admits the very same brandless product when NO excluded brand is named', () => {
      // The control for the pre-gate. Identical item, identical inclusion configuration; the only
      // change is that `excludedBrands` is empty, so [model/service/PromotionService.cfc:L883] and
      // [model/service/PromotionService.cfc:L949] never reach their null test.
      const graph = makePromotionFixtures();
      const brandlessSku = makeBrandlessSku(graph);
      const configured = makePromotionFixtures(unconfigured({ skus: [brandlessSku] }));
      const orderItem = makeMembershipOrderItem(brandlessSku, '100.00');

      expect(configured.promotionQualifier.getExcludedBrands()).toHaveLength(0);
      expect(configured.merchandiseReward.getExcludedBrands()).toHaveLength(0);

      expect(membership.getOrderItemInQualifier(configured.promotionQualifier, orderItem)).toBe(
        true,
      );
      expect(membership.getOrderItemInReward(configured.merchandiseReward, orderItem)).toBe(true);
    });

    it('never INCLUDES a brandless product through the brand clause of either twin', () => {
      // The inverted polarity. `brands` is the SOLE inclusion criterion, so the brand clause is
      // the only route to `true` - and a brandless product cannot take it.
      const graph = makePromotionFixtures();
      const brandlessSku = makeBrandlessSku(graph);
      const brandOnly = makePromotionFixtures(unconfigured({ brands: [graph.brand] }));
      const orderItem = makeMembershipOrderItem(brandlessSku, '100.00');

      expect(brandOnly.promotionQualifier.getBrands()).toHaveLength(1);
      expect(membership.getOrderItemInQualifier(brandOnly.promotionQualifier, orderItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInReward(brandOnly.merchandiseReward, orderItem)).toBe(false);
    });

    it('includes a BRANDED product through the same brand-only configuration, for both twins', () => {
      // The control for the include side: the identical configuration admits an item whose product
      // does carry the configured brand.
      const brandSource = makePromotionFixtures(unconfigured());
      const withBrand = makePromotionFixtures(unconfigured({ brands: [brandSource.brand] }));
      const orderItem = makeMembershipOrderItem(withBrand.sku, '100.00');

      expect(withBrand.sku.getProduct()?.getBrand()).toBeDefined();
      expect(membership.getOrderItemInQualifier(withBrand.promotionQualifier, orderItem)).toBe(
        true,
      );
      expect(membership.getOrderItemInReward(withBrand.merchandiseReward, orderItem)).toBe(true);
    });

    it('excludes a product whose brand IS on the excluded list, for both twins', () => {
      // The ordinary, non-null half of [model/service/PromotionService.cfc:L883] and
      // [model/service/PromotionService.cfc:L949] - `hasExcludedBrand` matching a brand that is
      // genuinely present.
      const graph = makePromotionFixtures();
      const configured = makePromotionFixtures(
        unconfigured({ skus: [graph.sku], excludedBrands: [graph.brand] }),
      );
      const orderItem = makeMembershipOrderItem(graph.sku, '100.00');

      expect(graph.sku.getProduct()?.getBrand()).toBeDefined();
      expect(membership.getOrderItemInQualifier(configured.promotionQualifier, orderItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInReward(configured.merchandiseReward, orderItem)).toBe(false);
    });
  });

  describe('the restrictive default at the end of both twins', () => {
    // CFML parity [model/service/PromotionService.cfc:L918, L984]: both bodies end `return false`.
    //
    // The empty-collection answer means two OPPOSITE things depending on which side it lands on:
    // the framework's collection-contains family answers `false` against an empty configured
    // collection.

    it('matches nothing for a fully unconfigured qualifier', () => {
      const graph = makePromotionFixtures(unconfigured());
      const orderItem = makeMembershipOrderItem(graph.sku, '100.00');

      // Every one of the ten collections empty, and both bounds absent - so nothing excludes the
      // item and nothing includes it either.
      expect(graph.promotionQualifier.getProductTypes()).toHaveLength(0);
      expect(graph.promotionQualifier.getProducts()).toHaveLength(0);
      expect(graph.promotionQualifier.getSkus()).toHaveLength(0);
      expect(graph.promotionQualifier.getBrands()).toHaveLength(0);
      expect(graph.promotionQualifier.getOptions()).toHaveLength(0);
      expect(graph.promotionQualifier.getExcludedProductTypes()).toHaveLength(0);
      expect(graph.promotionQualifier.getExcludedProducts()).toHaveLength(0);
      expect(graph.promotionQualifier.getExcludedSkus()).toHaveLength(0);
      expect(graph.promotionQualifier.getExcludedBrands()).toHaveLength(0);
      expect(graph.promotionQualifier.getExcludedOptions()).toHaveLength(0);
      expect(graph.promotionQualifier.getMinimumItemPrice()).toBeUndefined();
      expect(graph.promotionQualifier.getMaximumItemPrice()).toBeUndefined();

      expect(membership.getOrderItemInQualifier(graph.promotionQualifier, orderItem)).toBe(false);
    });

    it('matches nothing for a fully unconfigured reward', () => {
      const graph = makePromotionFixtures(unconfigured());
      const orderItem = makeMembershipOrderItem(graph.sku, '100.00');

      expect(graph.merchandiseReward.getProductTypes()).toHaveLength(0);
      expect(graph.merchandiseReward.getProducts()).toHaveLength(0);
      expect(graph.merchandiseReward.getSkus()).toHaveLength(0);
      expect(graph.merchandiseReward.getBrands()).toHaveLength(0);
      expect(graph.merchandiseReward.getOptions()).toHaveLength(0);
      expect(graph.merchandiseReward.getExcludedProductTypes()).toHaveLength(0);
      expect(graph.merchandiseReward.getExcludedProducts()).toHaveLength(0);
      expect(graph.merchandiseReward.getExcludedSkus()).toHaveLength(0);
      expect(graph.merchandiseReward.getExcludedBrands()).toHaveLength(0);
      expect(graph.merchandiseReward.getExcludedOptions()).toHaveLength(0);

      expect(membership.getOrderItemInReward(graph.merchandiseReward, orderItem)).toBe(false);
    });

    it('rejects every reward the fixture publishes when nothing is configured', () => {
      // The restrictive default is a property of the predicate, not of one reward exhibit, so it
      // is asserted across the whole published reward collection rather than on a single instance.
      const graph = makePromotionFixtures(unconfigured());
      const orderItem = makeMembershipOrderItem(graph.sku, '100.00');

      expect(graph.promotionRewards.length).toBeGreaterThan(0);

      for (const publishedReward of graph.promotionRewards) {
        expect(membership.getOrderItemInReward(publishedReward, orderItem)).toBe(false);
      }
    });
  });

  describe('materialized product-type path membership', () => {
    // The legacy list primitives the port mirrors are published by `src/lib/cfml/list.ts`, whose
    // exports are locked at five - `listLen`, `listGetAt`, `listAppend`, `listToArray` and
    // `listFindNoCase`.

    it('publishes a product-type path of at least three distinct segments', () => {
      // DEPTH is LOAD-BEARING, and this case is the precondition for the two ancestor cases below.
      const { root, parent, leaf } = chainNodes(fixtures);
      const path: string = leaf.getProductTypeIDPath();
      const segments: readonly string[] = listToArray(path);

      expect(listLen(path)).toBeGreaterThanOrEqual(3);
      expect(segments).toHaveLength(listLen(path));
      expect(new Set(segments).size).toBe(segments.length);

      // Root first, leaf last, and every level of the chain present.
      expect(segments[0]).toBe(root.getProductTypeID());
      expect(segments[segments.length - 1]).toBe(leaf.getProductTypeID());
      expect(segments).toContain(parent.getProductTypeID());

      // The fixture's published path and the entity's own agree, so a case may use either.
      expect(fixtures.materializedIdPaths.productTypeIDPath).toBe(path);
    });

    it('includes on an EXACT LEAF match, for both twins', () => {
      const { leaf } = chainNodes(fixtures);
      const leafOnly = makePromotionFixtures(unconfigured({ productTypes: [leaf] }));
      const orderItem = makeMembershipOrderItem(leafOnly.sku, '100.00');
      const itemProductType = leafOnly.sku.getProduct()?.getProductType();

      // The configured type is the item's own, so this case alone cannot distinguish a path walk
      // from an identity comparison - which is exactly why the two ancestor cases follow.
      expect(itemProductType?.getProductTypeID()).toBe(leaf.getProductTypeID());
      expect(membership.getOrderItemInQualifier(leafOnly.promotionQualifier, orderItem)).toBe(true);
      expect(membership.getOrderItemInReward(leafOnly.merchandiseReward, orderItem)).toBe(true);
    });

    it('includes on a MID-CHAIN ANCESTOR match, for both twins', () => {
      // The configured product type is the item's GRANDPARENT-adjacent ancestor, never the leaf,
      // so only a genuine path walk can find it. Identity comparison against the item's own
      // product type would answer false here.
      const graph = makePromotionFixtures(unconfigured());
      const { parent } = chainNodes(graph);
      const parentOnly = makePromotionFixtures(unconfigured({ productTypes: [parent] }));
      const orderItem = makeMembershipOrderItem(parentOnly.sku, '100.00');
      const itemProductType = parentOnly.sku.getProduct()?.getProductType();

      expect(itemProductType?.getProductTypeID()).not.toBe(parent.getProductTypeID());
      expect(membership.getOrderItemInQualifier(parentOnly.promotionQualifier, orderItem)).toBe(
        true,
      );
      expect(membership.getOrderItemInReward(parentOnly.merchandiseReward, orderItem)).toBe(true);
    });

    it('includes on a ROOT ancestor match, which pins the 1-based `> 0` convention', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L865, L900, L935, L966]: these four sites
      // are UN-NEGATED `listFindNoCase` calls, not the `!arrayFind` an earlier brief describes;
      // the sole `!arrayFind` site in the file is [model/service/PromotionService.cfc:L602].
      //
      // This case is where that convention is pinned rather than described.
      const graph = makePromotionFixtures(unconfigured());
      const { root } = chainNodes(graph);
      const rootOnly = makePromotionFixtures(unconfigured({ productTypes: [root] }));
      const orderItem = makeMembershipOrderItem(rootOnly.sku, '100.00');
      const segments: readonly string[] = listToArray(
        rootOnly.materializedIdPaths.productTypeIDPath,
      );

      // The root really is the FIRST segment - position 1 in CFML's 1-based reckoning.
      expect(segments[0]).toBe(root.getProductTypeID());

      expect(membership.getOrderItemInQualifier(rootOnly.promotionQualifier, orderItem)).toBe(true);
      expect(membership.getOrderItemInReward(rootOnly.merchandiseReward, orderItem)).toBe(true);
    });

    it('does NOT include on a non-member product type, which pins the miss as 0 rather than -1', () => {
      // The other half of the `> 0` convention.
      const graph = makePromotionFixtures(unconfigured());
      const foreignOnly = makePromotionFixtures(
        unconfigured({ productTypes: [graph.excludedProductType] }),
      );
      const orderItem = makeMembershipOrderItem(foreignOnly.sku, '100.00');
      const segments: readonly string[] = listToArray(
        foreignOnly.materializedIdPaths.productTypeIDPath,
      );

      expect(segments).not.toContain(graph.excludedProductType.getProductTypeID());
      expect(membership.getOrderItemInQualifier(foreignOnly.promotionQualifier, orderItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInReward(foreignOnly.merchandiseReward, orderItem)).toBe(false);
    });

    it('EXCLUDES on an ancestor match on the exclusion side, for both twins', () => {
      // The same walk, the OPPOSITE exit. [model/service/PromotionService.cfc:L864-L869] sets a
      // flag and breaks; [model/service/PromotionService.cfc:L899-L903] returns true straight out
      // of the function.
      const { root } = chainNodes(fixtures);
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');

      // Identical inclusion configuration in both graphs; only the ancestor exclusion differs, so
      // the `false` pair below is attributable to it and to nothing else.
      const admitted = makePromotionFixtures(unconfigured({ skus: [fixtures.sku] }));
      const excluded = makePromotionFixtures(
        unconfigured({ skus: [fixtures.sku], excludedProductTypes: [root] }),
      );

      expect(membership.getOrderItemInQualifier(admitted.promotionQualifier, orderItem)).toBe(true);
      expect(membership.getOrderItemInReward(admitted.merchandiseReward, orderItem)).toBe(true);

      expect(membership.getOrderItemInQualifier(excluded.promotionQualifier, orderItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInReward(excluded.merchandiseReward, orderItem)).toBe(false);
    });

    it('raises when the product type the walk needs is absent, rather than answering false', () => {
      // LEGACY-NOTE [model/service/PromotionService.cfc:L864, L899, L934, L965]: the five-hop
      // chain `orderItem.getSku().getProduct().getProductType().getProductTypeIDPath()` is
      // dereferenced with no null guard at any of its four sites.
      const graph = makePromotionFixtures();
      const typelessSku = makeSkuFixture({
        idPrefix: 'typeless-sku',
        product: makeProductFixture({
          idPrefix: 'typeless-product',
          productID: 'typeless-product',
          productType: undefined,
        }),
      });
      const configured = makePromotionFixtures(
        unconfigured({ productTypes: [chainNodes(graph).leaf] }),
      );
      const orderItem = makeMembershipOrderItem(typelessSku, '100.00');

      expect(typelessSku.getProduct()?.getProductType()).toBeUndefined();
      expect(() =>
        membership.getOrderItemInQualifier(configured.promotionQualifier, orderItem),
      ).toThrow("requires the product's product type");
      expect(() =>
        membership.getOrderItemInReward(configured.merchandiseReward, orderItem),
      ).toThrow("requires the product's product type");
    });
  });

  describe('the other two materialized path kinds are not consulted by either twin', () => {
    // The migration centralises three comma-list identifier paths in one value object -
    // `productTypeIDPath`, `priceGroupIDPath` and `categoryIDPath`.
    //
    // JUDGMENT CALL: the mandate to exercise all three path kinds is honoured by characterizing
    // the other two as PROVABLY not CONSULTED, rather than by authoring walks the shipped module
    // does not perform.

    it('keeps the three path namespaces disjoint, so a confusion between them would be detectable', () => {
      const paths = fixtures.materializedIdPaths;
      const productTypeSegments: readonly string[] = listToArray(paths.productTypeIDPath);

      expect(productTypeSegments.length).toBeGreaterThanOrEqual(3);
      expect(listLen(paths.priceGroupIDPath)).toBeGreaterThanOrEqual(1);
      expect(listLen(paths.categoryIDPath)).toBeGreaterThanOrEqual(1);

      expect(paths.productTypeIDPath).not.toBe(paths.priceGroupIDPath);
      expect(paths.productTypeIDPath).not.toBe(paths.categoryIDPath);
      expect(paths.priceGroupIDPath).not.toBe(paths.categoryIDPath);

      // No product-type identifier appears in either of the other two paths, so a predicate that
      // walked the wrong path could not accidentally match.
      for (const segment of productTypeSegments) {
        expect(paths.priceGroupIDPath).not.toContain(segment);
        expect(paths.categoryIDPath).not.toContain(segment);
      }
    });

    it('answers identically whichever price group is applied to the order item', () => {
      // `appliedPriceGroup` is one of the ten members the view publishes and neither twin reads
      // it.
      const graph = makePromotionFixtures();
      const baseItem = makeMembershipOrderItem(graph.sku, '100.00');
      const appliedPriceGroup = graph.eligiblePriceGroups[0];

      expect(appliedPriceGroup).toBeDefined();

      const withPriceGroup: OrderItemView = { ...baseItem, appliedPriceGroup };

      expect(membership.getOrderItemInQualifier(graph.promotionQualifier, baseItem)).toBe(true);
      expect(membership.getOrderItemInQualifier(graph.promotionQualifier, withPriceGroup)).toBe(
        true,
      );
      expect(membership.getOrderItemInReward(graph.merchandiseReward, baseItem)).toBe(true);
      expect(membership.getOrderItemInReward(graph.merchandiseReward, withPriceGroup)).toBe(true);
    });

    it('answers identically whatever categories the product carries', () => {
      // The category path is the third of the three.
      const graph = makePromotionFixtures(unconfigured());
      const { leaf } = chainNodes(graph);
      const categorylessProduct: Product = makeProductFixture({
        idPrefix: 'categoryless-product',
        productID: 'shared-membership-product',
        productType: leaf,
        categories: [],
      });
      const categorylessSku = makeSkuFixture({
        idPrefix: 'categoryless-sku',
        product: categorylessProduct,
      });
      const configured = makePromotionFixtures(
        unconfigured({ products: [categorylessProduct], productTypes: [leaf] }),
      );
      const orderItem = makeMembershipOrderItem(categorylessSku, '100.00');

      expect(categorylessProduct.getCategories()).toHaveLength(0);
      expect(membership.getOrderItemInQualifier(configured.promotionQualifier, orderItem)).toBe(
        true,
      );
      expect(membership.getOrderItemInReward(configured.merchandiseReward, orderItem)).toBe(true);
    });
  });

  describe('the remaining exclusion operands, one at a time', () => {
    // Operands 4, 5 and 7 of the qualifier's seven, which are operands 2, 3 and 5 of the reward's
    // five.

    it('excludes on hasExcludedProduct, for both twins', () => {
      // [model/service/PromotionService.cfc:L879] and [model/service/PromotionService.cfc:L945].
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');
      const excluded = makePromotionFixtures(
        unconfigured({ skus: [fixtures.sku], excludedProducts: [fixtures.product] }),
      );

      expect(membership.getOrderItemInQualifier(excluded.promotionQualifier, orderItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInReward(excluded.merchandiseReward, orderItem)).toBe(false);
    });

    it('excludes on hasExcludedSku, for both twins', () => {
      // [model/service/PromotionService.cfc:L881] and [model/service/PromotionService.cfc:L947].
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');
      const excluded = makePromotionFixtures(
        unconfigured({ products: [fixtures.product], excludedSkus: [fixtures.sku] }),
      );

      expect(membership.getOrderItemInQualifier(excluded.promotionQualifier, orderItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInReward(excluded.merchandiseReward, orderItem)).toBe(false);
    });

    it('excludes on hasAnyExcludedOption, for both twins', () => {
      // [model/service/PromotionService.cfc:L885] and [model/service/PromotionService.cfc:L951].
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');
      const sharedOption: Option = firstOption(fixtures.sku);
      const excluded = makePromotionFixtures(
        unconfigured({ skus: [fixtures.sku], excludedOptions: [sharedOption] }),
      );

      expect(fixtures.sku.getOptions().length).toBeGreaterThan(0);
      expect(membership.getOrderItemInQualifier(excluded.promotionQualifier, orderItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInReward(excluded.merchandiseReward, orderItem)).toBe(false);
    });

    it('admits an option-LESS sku even when excluded options are configured, for both twins', () => {
      // The empty-array end of `hasAnyExcludedOption`: an empty option array never enters the loop
      // body, so the clause answers `false` and the item survives - PERMISSIVE on this side.
      const optionLessSku = makeSkuFixture({
        idPrefix: 'option-less-sku',
        andOfExistsMember: 'D',
        product: fixtures.product,
      });
      const orderItem = makeMembershipOrderItem(optionLessSku, '100.00');
      const excluded = makePromotionFixtures(
        unconfigured({
          skus: [optionLessSku],
          excludedOptions: [firstOption(fixtures.sku)],
        }),
      );

      expect(optionLessSku.getOptions()).toHaveLength(0);
      expect(membership.getOrderItemInQualifier(excluded.promotionQualifier, orderItem)).toBe(true);
      expect(membership.getOrderItemInReward(excluded.merchandiseReward, orderItem)).toBe(true);
    });

    it('lets EXCLUSION win when an item is both excluded and included, for both twins', () => {
      // CFML parity [model/service/PromotionService.cfc:L854, L887, L890]: the exclusion block
      // runs FIRST and short-circuits the whole function at
      // [model/service/PromotionService.cfc:L887] and [model/service/PromotionService.cfc:L953].
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');
      const both = makePromotionFixtures(
        unconfigured({ skus: [fixtures.sku], excludedSkus: [fixtures.sku] }),
      );

      expect(both.promotionQualifier.getSkus()).toHaveLength(1);
      expect(both.promotionQualifier.getExcludedSkus()).toHaveLength(1);
      expect(membership.getOrderItemInQualifier(both.promotionQualifier, orderItem)).toBe(false);
      expect(membership.getOrderItemInReward(both.merchandiseReward, orderItem)).toBe(false);
    });
  });

  describe('the inclusion operands, one at a time', () => {
    // CFML parity [model/service/PromotionService.cfc:L905-L916, L971-L982]: four sequential `if`
    // statements each with its own early `return true` - not an `if`/`else if` chain and not a
    // single `||` disjunction.

    it('includes through products alone, for both twins', () => {
      // [model/service/PromotionService.cfc:L905] and [model/service/PromotionService.cfc:L971].
      const productOnly = makePromotionFixtures(unconfigured({ products: [fixtures.product] }));
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');

      expect(membership.getOrderItemInQualifier(productOnly.promotionQualifier, orderItem)).toBe(
        true,
      );
      expect(membership.getOrderItemInReward(productOnly.merchandiseReward, orderItem)).toBe(true);
    });

    it('includes through skus alone, for both twins', () => {
      // [model/service/PromotionService.cfc:L908] and [model/service/PromotionService.cfc:L974].
      const skuOnly = makePromotionFixtures(unconfigured({ skus: [fixtures.sku] }));
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');

      expect(membership.getOrderItemInQualifier(skuOnly.promotionQualifier, orderItem)).toBe(true);
      expect(membership.getOrderItemInReward(skuOnly.merchandiseReward, orderItem)).toBe(true);
    });

    it('includes through brands alone, for both twins', () => {
      // [model/service/PromotionService.cfc:L911] and [model/service/PromotionService.cfc:L977] -
      // the present-brand half of the clause whose brandless half is covered above.
      const brandOnly = makePromotionFixtures(unconfigured({ brands: [fixtures.brand] }));
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');

      expect(membership.getOrderItemInQualifier(brandOnly.promotionQualifier, orderItem)).toBe(
        true,
      );
      expect(membership.getOrderItemInReward(brandOnly.merchandiseReward, orderItem)).toBe(true);
    });

    it('includes through options alone, for both twins', () => {
      // [model/service/PromotionService.cfc:L914] and [model/service/PromotionService.cfc:L980].
      const sharedOption: Option = firstOption(fixtures.sku);
      const optionOnly = makePromotionFixtures(unconfigured({ options: [sharedOption] }));
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');

      expect(membership.getOrderItemInQualifier(optionOnly.promotionQualifier, orderItem)).toBe(
        true,
      );
      expect(membership.getOrderItemInReward(optionOnly.merchandiseReward, orderItem)).toBe(true);
    });

    it('does not include an item whose sku shares no configured option', () => {
      // The negative half of `hasAnyOption`: the option-less sku cannot match through options, so
      // with options as the sole inclusion criterion it falls through to the restrictive default.
      const optionLessSku = makeSkuFixture({
        idPrefix: 'option-less-sku',
        andOfExistsMember: 'D',
        product: fixtures.product,
      });
      const optionOnly = makePromotionFixtures(
        unconfigured({ options: [firstOption(fixtures.sku)] }),
      );
      const orderItem = makeMembershipOrderItem(optionLessSku, '100.00');

      expect(optionLessSku.getOptions()).toHaveLength(0);
      expect(membership.getOrderItemInQualifier(optionOnly.promotionQualifier, orderItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInReward(optionOnly.merchandiseReward, orderItem)).toBe(false);
    });
  });

  describe('the order-item read surface is exactly two members', () => {
    // `OrderItemView` publishes TEN members.

    it('publishes ten members and is read for only sku and price', () => {
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');
      const recorded = recordOrderItemReads(orderItem);

      expect(ORDER_ITEM_VIEW_MEMBERS).toHaveLength(10);
      for (const member of ORDER_ITEM_VIEW_MEMBERS) {
        expect(declaresMember(orderItem, member)).toBe(true);
      }

      expect(membership.getOrderItemInQualifier(qualifier, recorded.view)).toBe(true);
      expect(distinctReads(recorded)).toStrictEqual(['price', 'sku']);
    });

    it('never reads the eight members neither twin needs', () => {
      // Asserted as a complement rather than restated as a list, so a view member added later is
      // covered automatically: whatever the ten are, only two of them may be read.
      const qualifierRecorded = recordOrderItemReads(
        makeMembershipOrderItem(fixtures.sku, '100.00'),
      );
      const rewardRecorded = recordOrderItemReads(makeMembershipOrderItem(fixtures.sku, '100.00'));

      expect(membership.getOrderItemInQualifier(qualifier, qualifierRecorded.view)).toBe(true);
      expect(membership.getOrderItemInReward(reward, rewardRecorded.view)).toBe(true);

      const untouched = ORDER_ITEM_VIEW_MEMBERS.filter(
        (member) => member !== 'sku' && member !== 'price',
      );

      expect(untouched).toHaveLength(8);
      for (const member of untouched) {
        expect(qualifierRecorded.reads).not.toContain(member);
        expect(rewardRecorded.reads).not.toContain(member);
      }

      // `orderItemID` is among the eight and is read only on the raise path, where it identifies
      // the faulty item in the diagnostic. It is never read on a successful answer.
      expect(qualifierRecorded.reads).not.toContain('orderItemID');
    });

    it('reads the order item without mutating it', () => {
      // Membership is a QUESTION. The write side of the engine is the applied-promotion intent
      // emitted later by `./promotionApplication.ts`, and neither twin touches order persistence
      // or alters the view it was handed.
      const orderItem = makeMembershipOrderItem(fixtures.sku, '123.45');
      const before = {
        orderItemID: orderItem.orderItemID,
        quantity: orderItem.quantity,
        price: orderItem.price.toFixed2(),
        appliedPriceGroup: orderItem.appliedPriceGroup,
      };

      membership.getOrderItemInQualifier(qualifier, orderItem);
      membership.getOrderItemInReward(reward, orderItem);

      expect({
        orderItemID: orderItem.orderItemID,
        quantity: orderItem.quantity,
        price: orderItem.price.toFixed2(),
        appliedPriceGroup: orderItem.appliedPriceGroup,
      }).toStrictEqual(before);
      expect(orderItem.sku.getOptions()).toHaveLength(fixtures.sku.getOptions().length);
    });
  });

  describe('the bare-scope qualifier read resolves to the argument', () => {
    // CFML parity [model/service/PromotionService.cfc:L875, L877]: both item-price operands read
    // an UNSCOPED `qualifier.getMinimumItemPrice()` and `qualifier.getMaximumItemPrice()` while
    // every neighbouring operand reads `arguments.qualifier`.

    it('takes both bounds from the qualifier passed in, not from any other qualifier', () => {
      const strictBand = makePromotionFixtures(
        unconfigured({
          skus: [fixtures.sku],
          qualifierGates: {
            minimumItemPrice: Money.fromDecimalString('50.00'),
            maximumItemPrice: Money.fromDecimalString('150.00'),
          },
        }),
      );
      const openBand = makePromotionFixtures(
        unconfigured({
          skus: [fixtures.sku],
          qualifierGates: { minimumItemPrice: undefined, maximumItemPrice: undefined },
        }),
      );
      const cheapItem = makeMembershipOrderItem(fixtures.sku, '10.00');

      // The two qualifiers really do carry different bounds.
      expect(strictBand.promotionQualifier.getMinimumItemPrice()?.toFixed2()).toBe('50.00');
      expect(openBand.promotionQualifier.getMinimumItemPrice()).toBeUndefined();

      // And the answer follows the ARGUMENT, in either order of calling.
      expect(membership.getOrderItemInQualifier(strictBand.promotionQualifier, cheapItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInQualifier(openBand.promotionQualifier, cheapItem)).toBe(true);
      expect(membership.getOrderItemInQualifier(strictBand.promotionQualifier, cheapItem)).toBe(
        false,
      );
      expect(membership.getOrderItemInQualifier(openBand.promotionQualifier, cheapItem)).toBe(true);
    });
  });
  describe('the subject is stateless', () => {
    it('answers identically when called twice with the same inputs', () => {
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');

      const firstQualifierAnswer = membership.getOrderItemInQualifier(qualifier, orderItem);
      const secondQualifierAnswer = membership.getOrderItemInQualifier(qualifier, orderItem);
      const firstRewardAnswer = membership.getOrderItemInReward(reward, orderItem);
      const secondRewardAnswer = membership.getOrderItemInReward(reward, orderItem);

      expect(firstQualifierAnswer).toBe(true);
      expect(secondQualifierAnswer).toBe(firstQualifierAnswer);
      expect(firstRewardAnswer).toBe(true);
      expect(secondRewardAnswer).toBe(firstRewardAnswer);
    });

    it('is not perturbed by an interleaved call with different inputs', () => {
      // The excluded item is driven through the same instance between two calls with the admitted
      // item. A cached answer or a leaked flag would surface here.
      const admittedItem = makeMembershipOrderItem(fixtures.sku, '100.00');
      const excludedItem = makeMembershipOrderItem(fixtures.sku, '9.98');

      expect(membership.getOrderItemInQualifier(qualifier, admittedItem)).toBe(true);
      expect(membership.getOrderItemInQualifier(qualifier, excludedItem)).toBe(false);
      expect(membership.getOrderItemInQualifier(qualifier, admittedItem)).toBe(true);

      const unconfiguredGraph = makePromotionFixtures(unconfigured());

      expect(
        membership.getOrderItemInQualifier(unconfiguredGraph.promotionQualifier, admittedItem),
      ).toBe(false);
      expect(membership.getOrderItemInQualifier(qualifier, admittedItem)).toBe(true);
    });

    it('answers identically through a second, independently constructed instance', () => {
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');
      const other = new OrderItemMembership();

      expect(other).not.toBe(membership);
      expect(other.getOrderItemInQualifier(qualifier, orderItem)).toBe(
        membership.getOrderItemInQualifier(qualifier, orderItem),
      );
      expect(other.getOrderItemInReward(reward, orderItem)).toBe(
        membership.getOrderItemInReward(reward, orderItem),
      );

      // No own enumerable state on either instance - nothing was stashed during the calls above.
      expect(Object.keys(membership)).toStrictEqual([]);
      expect(Object.keys(other)).toStrictEqual([]);
    });

    it('leaves the fixture graph unchanged, so each case starts from an independent graph', () => {
      // The complement of the statelessness claim, on the other side of the call: the predicate
      // does not mutate the qualifier or reward it was handed either.
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');
      const before = {
        productTypes: qualifier.getProductTypes().length,
        products: qualifier.getProducts().length,
        skus: qualifier.getSkus().length,
        brands: qualifier.getBrands().length,
        options: qualifier.getOptions().length,
      };

      membership.getOrderItemInQualifier(qualifier, orderItem);
      membership.getOrderItemInReward(reward, orderItem);

      expect({
        productTypes: qualifier.getProductTypes().length,
        products: qualifier.getProducts().length,
        skus: qualifier.getSkus().length,
        brands: qualifier.getBrands().length,
        options: qualifier.getOptions().length,
      }).toStrictEqual(before);
    });
  });
  describe('the golden order integrates', () => {
    // The shared multi-item order fixture, exercised so that the direct construction used
    // everywhere above is not the only route covered.

    it('admits a golden order item whose sku is a configured member, through both twins', () => {
      const order = makeOrderViewFixture({
        itemOverrides: [{ sku: fixtures.sku, price: Money.fromDecimalString('100.00') }],
      });
      const firstItem = order.orderItems[0];

      // `noUncheckedIndexedAccess` makes the indexed read `OrderItemView | undefined`; it is
      // captured and narrowed explicitly rather than asserted away with a postfix `!`.
      expect(firstItem).toBeDefined();
      if (firstItem === undefined) {
        throw new Error('The golden order fixture must publish at least one order item.');
      }

      expect(order.orderItems.length).toBeGreaterThan(1);
      expect(firstItem.sku.getSkuID()).toBe(fixtures.sku.getSkuID());
      expect(firstItem.price.toFixed2()).toBe('100.00');

      expect(membership.getOrderItemInQualifier(qualifier, firstItem)).toBe(true);
      expect(membership.getOrderItemInReward(reward, firstItem)).toBe(true);
    });

    it('applies the item-price gate to a golden order item priced below the minimum', () => {
      // The asymmetry again, this time driven entirely through the shared fixture path rather than
      // through a directly constructed view - so the behaviour is not an artefact of how this
      // suite builds its order items.
      const order = makeOrderViewFixture({
        itemOverrides: [{ sku: fixtures.sku, price: Money.fromDecimalString('9.98') }],
      });
      const firstItem = order.orderItems[0];

      expect(firstItem).toBeDefined();
      if (firstItem === undefined) {
        throw new Error('The golden order fixture must publish at least one order item.');
      }

      expect(membership.getOrderItemInQualifier(qualifier, firstItem)).toBe(false);
      expect(membership.getOrderItemInReward(reward, firstItem)).toBe(true);
    });
  });
  describe('the predicate performs no data access and reads no ambient state', () => {
    // The complement of the not-applicable parameterized-SQL note in this file's header.

    it('answers synchronously from its two arguments alone', () => {
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');

      expect(membership.getOrderItemInQualifier.length).toBe(2);
      expect(membership.getOrderItemInReward.length).toBe(2);

      const qualifierAnswer: unknown = membership.getOrderItemInQualifier(qualifier, orderItem);
      const rewardAnswer: unknown = membership.getOrderItemInReward(reward, orderItem);

      expect(typeof qualifierAnswer).toBe('boolean');
      expect(typeof rewardAnswer).toBe('boolean');
      expect(qualifierAnswer).toBe(true);
      expect(rewardAnswer).toBe(true);

      expect(OrderItemMembership.length).toBe(0);
      expect(Object.keys(membership)).toStrictEqual([]);
    });

    it('is date-free, so its answer cannot drift with the clock', () => {
      // Neither twin reads a clock: no promotion period test, no sale-price expiry, no
      // `isCurrent`. Period and code currency are decided upstream by
      // `./promotionPeriodQualification.ts` and the promotion entities.
      const orderItem = makeMembershipOrderItem(fixtures.sku, '100.00');
      const distantPast = makePromotionFixtures({ now: new Date('1999-12-31T23:59:59.000Z') });
      const distantFuture = makePromotionFixtures({ now: new Date('2099-01-01T00:00:00.000Z') });
      const pastItem = makeMembershipOrderItem(distantPast.sku, '100.00');
      const futureItem = makeMembershipOrderItem(distantFuture.sku, '100.00');

      expect(membership.getOrderItemInQualifier(qualifier, orderItem)).toBe(true);
      expect(membership.getOrderItemInQualifier(distantPast.promotionQualifier, pastItem)).toBe(
        true,
      );
      expect(membership.getOrderItemInQualifier(distantFuture.promotionQualifier, futureItem)).toBe(
        true,
      );
      expect(membership.getOrderItemInReward(distantPast.merchandiseReward, pastItem)).toBe(true);
      expect(membership.getOrderItemInReward(distantFuture.merchandiseReward, futureItem)).toBe(
        true,
      );
    });
  });
});
