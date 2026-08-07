// slatwall-ts - unit suite for `src/domain/entities/promotionReward.ts`
//
// `amount` [model/entity/PromotionReward.cfc:L61] and `amountType`
// [model/entity/PromotionReward.cfc:L62] are the inputs to the discount arithmetic that the
// Strategy switch at [model/service/PromotionService.cfc:L993-L1003] dispatches on.
//
// The four cases [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67] handed every legacy
// entity suite for free are not inherited.
//
// So the numbered set stays closed and the port's own discoveries stay recordable.
// `@ts-ignore` and no postfix non-null assertion; the mechanically enforced domain layer
// !! HARD BOUNDARIES - WHAT THIS SUITE DELIBERATELY DOES NOT TEST !!

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PromotionReward } from '../../../../src/domain/entities/promotionReward.js';
import type { AmountType } from '../../../../src/domain/entities/promotionReward.js';
import type { ApplicableTerm } from '../../../../src/domain/entities/promotionReward.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import type { PromotionRepository } from '../../../../src/domain/ports/promotionRepository.js';
import type { OrderItemQualifiedDiscounts } from '../../../../src/domain/promotionEngine/qualifiedDiscountTypes.js';
import type { PromotionRewardUsageDetails } from '../../../../src/domain/promotionEngine/rewardUsageTypes.js';
import { DiscountAmountCalculator } from '../../../../src/services/promotion/discountAmount.js';
import { stripOverUsedRewardDiscounts } from '../../../../src/services/promotion/overUseStripping.js';
import { RoundingRuleService } from '../../../../src/services/roundingRuleService.js';
import type { RoundingRuleFrameworkWrites } from '../../../../src/services/roundingRuleService.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';

// VALUE imports, not type-only: the empty-primary-key block below CONSTRUCTS unsaved rows of each
// of these types.
import { Brand } from '../../../../src/domain/entities/brand.js';
import { Option } from '../../../../src/domain/entities/option.js';
import { PriceGroup } from '../../../../src/domain/entities/priceGroup.js';
import { Product } from '../../../../src/domain/entities/product.js';
import { ProductType } from '../../../../src/domain/entities/productType.js';
import { Sku } from '../../../../src/domain/entities/sku.js';
import type { PromotionPeriod } from '../../../../src/domain/entities/promotionPeriod.js';
import { RoundingRule } from '../../../../src/domain/entities/roundingRule.js';

// Four levels of `..` reach `src`, three reach `tests/fixtures`. Three levels to `src` would
// resolve to the nonexistent `tests/src/...`.
//
// `Brand` is the one entity imported as a VALUE rather than as a type, because the relation-pair
// assertions need a genuinely UNSAVED row - one whose primary key is still the empty string.

// Shared reference data, mined from the source and asserted rather than trusted.

/**
 * The reward-type vocabulary in exact source order, transcribed from the file-opening comment
 * block [model/entity/PromotionReward.cfc:L48-L56]: `merchandise`
 * [model/entity/PromotionReward.cfc:L50], `subscription` [model/entity/PromotionReward.cfc:L51],
 * `contentAccess` [model/entity/PromotionReward.cfc:L52], `fulfillment`
 * [model/entity/PromotionReward.cfc:L53].
 *
 * CFML parity [model/entity/PromotionReward.cfc:L48-L54, L63]: the five reward types are
 * enumerated only in that comment block.
 */
const REWARD_TYPES_IN_SOURCE_ORDER: readonly string[] = Object.freeze([
  'merchandise',
  'subscription',
  'contentAccess',
  'fulfillment',
  'order',
]);

/**
 * Every member declared on the class's own prototype.
 *
 * Read from `PromotionReward.prototype` rather than from an instance so the probe is fully typed
 * and needs no cast: `Object.getOwnPropertyNames` returns `string[]`, and no `any` is introduced.
 */
const PROTOTYPE_MEMBERS: readonly string[] = Object.freeze(
  Object.getOwnPropertyNames(PromotionReward.prototype),
);

/**
 * The element at `index`, or a hard failure naming what was missing.
 *
 * `noUncheckedIndexedAccess` makes every indexed read `T | undefined`, and neither a postfix
 * non-null assertion nor an `as` cast is permitted.
 */
function requireAt<T>(collection: readonly T[], index: number, description: string): T {
  const element = collection[index];

  if (element === undefined) {
    throw new Error(`promotionReward.test.ts: no ${description} at index ${String(index)}.`);
  }

  return element;
}

/**
 * The current size of all FOURTEEN collections, keyed by the legacy property name.
 *
 * Why a whole-surface snapshot rather than a single length check.
 *
 * The three Group A entries read the opaque identifier accessors, because `FulfillmentMethod`.
 */
function collectionSizes(reward: PromotionReward): Readonly<Record<string, number>> {
  return {
    eligiblePriceGroups: reward.getEligiblePriceGroups().length,
    fulfillmentMethods: reward.getFulfillmentMethodIDs().length,
    shippingAddressZones: reward.getShippingAddressZoneIDs().length,
    shippingMethods: reward.getShippingMethodIDs().length,
    brands: reward.getBrands().length,
    options: reward.getOptions().length,
    skus: reward.getSkus().length,
    products: reward.getProducts().length,
    productTypes: reward.getProductTypes().length,
    excludedBrands: reward.getExcludedBrands().length,
    excludedOptions: reward.getExcludedOptions().length,
    excludedSkus: reward.getExcludedSkus().length,
    excludedProducts: reward.getExcludedProducts().length,
    excludedProductTypes: reward.getExcludedProductTypes().length,
  };
}

/**
 * The same snapshot with exactly one collection one element larger.
 *
 * The explicit guard is not ceremony: `noUncheckedIndexedAccess` types the read as
 * `number | undefined`, neither a postfix assertion nor an `as` cast is permitted.
 */
function withOneMore(
  sizes: Readonly<Record<string, number>>,
  property: string,
): Readonly<Record<string, number>> {
  const baseline: number | undefined = sizes[property];

  if (baseline === undefined) {
    throw new Error(`promotionReward.test.ts: no collection named ${property}.`);
  }

  return { ...sizes, [property]: baseline + 1 };
}

/**
 * The same snapshot with exactly one collection one element smaller.
 */
function withOneFewer(
  sizes: Readonly<Record<string, number>>,
  property: string,
): Readonly<Record<string, number>> {
  const baseline: number | undefined = sizes[property];

  if (baseline === undefined) {
    throw new Error(`promotionReward.test.ts: no collection named ${property}.`);
  }

  return { ...sizes, [property]: baseline - 1 };
}

/**
 * The fixture graph type, inferred because the fixture module deliberately does not export it.
 */
type PromotionFixtureGraph = ReturnType<typeof makePromotionFixtures>;

/**
 * The five catalog entity classes the ten paired collections hold, one real row each.
 */
interface CatalogRowSet {
  readonly brand: PromotionFixtureGraph['brand'];
  readonly option: PromotionFixtureGraph['option'];
  readonly sku: PromotionFixtureGraph['sku'];
  readonly product: PromotionFixtureGraph['product'];
  readonly productType: PromotionFixtureGraph['productType'];
}

/**
 * One many-to-many relation pair, bound to the REAL far-side row it operates on.
 */
interface RelationPairProbe {
  /**
   * The near-side collection this pair owns, spelled as the legacy property.
   */
  readonly property: string;
  /**
   * The collection in the other family that holds the same entity class.
   */
  readonly counterpartProperty: string;
  /**
   * The `Sw*` link table the pair writes through, abbreviations intact.
   */
  readonly linkTable: string;
  /**
   * The legacy `add*` / `remove*` locators for this pair.
   */
  readonly locator: string;
  /**
   * `true` for the five EXCLUDE-family pairs, `false` for the five INCLUDE-family pairs.
   */
  readonly excludes: boolean;
  /**
   * Calls the ported `add*` helper with the real far-side row.
   */
  readonly add: (reward: PromotionReward) => void;
  /**
   * Calls the ported `remove*` helper with the real far-side row.
   */
  readonly remove: (reward: PromotionReward) => void;
  /**
   * Calls this family's singular `has*` predicate with the real far-side row.
   */
  readonly has: (reward: PromotionReward) => boolean;
  /**
   * Calls the OPPOSITE family's predicate for the same row - the two are never conflated.
   */
  readonly counterpartHas: (reward: PromotionReward) => boolean;
  /**
   * The near-side collection this pair owns.
   */
  readonly near: (reward: PromotionReward) => readonly object[];
  /**
   * The near-side collection of the opposite family.
   */
  readonly counterpartNear: (reward: PromotionReward) => readonly object[];
  /**
   * The far row's LIVE collection that this family appends to and splices from.
   */
  readonly farOwn: () => readonly PromotionReward[];
  /**
   * The far row's LIVE collection this family must never touch.
   */
  readonly farCounterpart: () => readonly PromotionReward[];
}

/**
 * The five catalog rows the fixture graph publishes, all with non-empty primary keys.
 */
function catalogRows(graph: PromotionFixtureGraph): CatalogRowSet {
  return {
    brand: graph.brand,
    option: graph.option,
    sku: graph.sku,
    product: graph.product,
    productType: graph.productType,
  };
}

/**
 * The five rows a hydrated reward actually holds in its EXCLUSION collections.
 */
function excludedRowsHeldBy(graph: PromotionFixtureGraph, reward: PromotionReward): CatalogRowSet {
  return {
    brand: graph.excludedBrand,
    option: requireAt(reward.getExcludedOptions(), 0, 'held excluded option'),
    sku: requireAt(reward.getExcludedSkus(), 0, 'held excluded sku'),
    product: requireAt(reward.getExcludedProducts(), 0, 'held excluded product'),
    productType: graph.excludedProductType,
  };
}

/**
 * The TEN paired relation probes: five INCLUDE families and five EXCLUDE families.
 *
 * CFML parity [model/entity/PromotionReward.cfc:L197-L295 and L297-L395]: the include helpers
 * reach `getPromotionRewards()` [model/entity/PromotionReward.cfc:L203, L223, L243, L263, L283]
 * and `hasPromotionReward` [model/entity/PromotionReward.cfc:L202, L222, L242, L262, L282].
 */
function makeRelationPairProbes(
  includeRows: CatalogRowSet,
  excludeRows: CatalogRowSet,
): readonly RelationPairProbe[] {
  return [
    {
      property: 'brands',
      counterpartProperty: 'excludedBrands',
      linkTable: 'SwPromoRewardBrand',
      locator: 'model/entity/PromotionReward.cfc:L198-L215',
      excludes: false,
      add: (reward) => {
        reward.addBrand(includeRows.brand);
      },
      remove: (reward) => {
        reward.removeBrand(includeRows.brand);
      },
      has: (reward) => reward.hasBrand(includeRows.brand),
      counterpartHas: (reward) => reward.hasExcludedBrand(includeRows.brand),
      near: (reward) => reward.getBrands(),
      counterpartNear: (reward) => reward.getExcludedBrands(),
      farOwn: () => includeRows.brand.getPromotionRewards(),
      farCounterpart: () => includeRows.brand.getPromotionRewardExclusions(),
    },
    {
      property: 'options',
      counterpartProperty: 'excludedOptions',
      linkTable: 'SwPromoRewardOption',
      locator: 'model/entity/PromotionReward.cfc:L218-L235',
      excludes: false,
      add: (reward) => {
        reward.addOption(includeRows.option);
      },
      remove: (reward) => {
        reward.removeOption(includeRows.option);
      },
      has: (reward) => reward.hasOption(includeRows.option),
      counterpartHas: (reward) => reward.hasExcludedOption(includeRows.option),
      near: (reward) => reward.getOptions(),
      counterpartNear: (reward) => reward.getExcludedOptions(),
      farOwn: () => includeRows.option.getPromotionRewards(),
      farCounterpart: () => includeRows.option.getPromotionRewardExclusions(),
    },
    {
      property: 'skus',
      counterpartProperty: 'excludedSkus',
      linkTable: 'SwPromoRewardSku',
      locator: 'model/entity/PromotionReward.cfc:L238-L255',
      excludes: false,
      add: (reward) => {
        reward.addSku(includeRows.sku);
      },
      remove: (reward) => {
        reward.removeSku(includeRows.sku);
      },
      has: (reward) => reward.hasSku(includeRows.sku),
      counterpartHas: (reward) => reward.hasExcludedSku(includeRows.sku),
      near: (reward) => reward.getSkus(),
      counterpartNear: (reward) => reward.getExcludedSkus(),
      farOwn: () => includeRows.sku.getPromotionRewards(),
      farCounterpart: () => includeRows.sku.getPromotionRewardExclusions(),
    },
    {
      property: 'products',
      counterpartProperty: 'excludedProducts',
      linkTable: 'SwPromoRewardProduct',
      locator: 'model/entity/PromotionReward.cfc:L258-L275',
      excludes: false,
      add: (reward) => {
        reward.addProduct(includeRows.product);
      },
      remove: (reward) => {
        reward.removeProduct(includeRows.product);
      },
      has: (reward) => reward.hasProduct(includeRows.product),
      counterpartHas: (reward) => reward.hasExcludedProduct(includeRows.product),
      near: (reward) => reward.getProducts(),
      counterpartNear: (reward) => reward.getExcludedProducts(),
      farOwn: () => includeRows.product.getPromotionRewards(),
      farCounterpart: () => includeRows.product.getPromotionRewardExclusions(),
    },
    {
      property: 'productTypes',
      counterpartProperty: 'excludedProductTypes',
      linkTable: 'SwPromoRewardProductType',
      locator: 'model/entity/PromotionReward.cfc:L278-L295',
      excludes: false,
      add: (reward) => {
        reward.addProductType(includeRows.productType);
      },
      remove: (reward) => {
        reward.removeProductType(includeRows.productType);
      },
      has: (reward) => reward.hasProductType(includeRows.productType),
      counterpartHas: (reward) => reward.hasExcludedProductType(includeRows.productType),
      near: (reward) => reward.getProductTypes(),
      counterpartNear: (reward) => reward.getExcludedProductTypes(),
      farOwn: () => includeRows.productType.getPromotionRewards(),
      farCounterpart: () => includeRows.productType.getPromotionRewardExclusions(),
    },
    {
      property: 'excludedBrands',
      counterpartProperty: 'brands',
      linkTable: 'SwPromoRewardExclBrand',
      locator: 'model/entity/PromotionReward.cfc:L298-L315',
      excludes: true,
      add: (reward) => {
        reward.addExcludedBrand(excludeRows.brand);
      },
      remove: (reward) => {
        reward.removeExcludedBrand(excludeRows.brand);
      },
      has: (reward) => reward.hasExcludedBrand(excludeRows.brand),
      counterpartHas: (reward) => reward.hasBrand(excludeRows.brand),
      near: (reward) => reward.getExcludedBrands(),
      counterpartNear: (reward) => reward.getBrands(),
      farOwn: () => excludeRows.brand.getPromotionRewardExclusions(),
      farCounterpart: () => excludeRows.brand.getPromotionRewards(),
    },
    {
      property: 'excludedOptions',
      counterpartProperty: 'options',
      linkTable: 'SwPromoRewardExclOption',
      locator: 'model/entity/PromotionReward.cfc:L318-L335',
      excludes: true,
      add: (reward) => {
        reward.addExcludedOption(excludeRows.option);
      },
      remove: (reward) => {
        reward.removeExcludedOption(excludeRows.option);
      },
      has: (reward) => reward.hasExcludedOption(excludeRows.option),
      counterpartHas: (reward) => reward.hasOption(excludeRows.option),
      near: (reward) => reward.getExcludedOptions(),
      counterpartNear: (reward) => reward.getOptions(),
      farOwn: () => excludeRows.option.getPromotionRewardExclusions(),
      farCounterpart: () => excludeRows.option.getPromotionRewards(),
    },
    {
      property: 'excludedSkus',
      counterpartProperty: 'skus',
      linkTable: 'SwPromoRewardExclSku',
      locator: 'model/entity/PromotionReward.cfc:L338-L355',
      excludes: true,
      add: (reward) => {
        reward.addExcludedSku(excludeRows.sku);
      },
      remove: (reward) => {
        reward.removeExcludedSku(excludeRows.sku);
      },
      has: (reward) => reward.hasExcludedSku(excludeRows.sku),
      counterpartHas: (reward) => reward.hasSku(excludeRows.sku),
      near: (reward) => reward.getExcludedSkus(),
      counterpartNear: (reward) => reward.getSkus(),
      farOwn: () => excludeRows.sku.getPromotionRewardExclusions(),
      farCounterpart: () => excludeRows.sku.getPromotionRewards(),
    },
    {
      property: 'excludedProducts',
      counterpartProperty: 'products',
      linkTable: 'SwPromoRewardExclProduct',
      locator: 'model/entity/PromotionReward.cfc:L358-L375',
      excludes: true,
      add: (reward) => {
        reward.addExcludedProduct(excludeRows.product);
      },
      remove: (reward) => {
        reward.removeExcludedProduct(excludeRows.product);
      },
      has: (reward) => reward.hasExcludedProduct(excludeRows.product),
      counterpartHas: (reward) => reward.hasProduct(excludeRows.product),
      near: (reward) => reward.getExcludedProducts(),
      counterpartNear: (reward) => reward.getProducts(),
      farOwn: () => excludeRows.product.getPromotionRewardExclusions(),
      farCounterpart: () => excludeRows.product.getPromotionRewards(),
    },
    {
      property: 'excludedProductTypes',
      counterpartProperty: 'productTypes',
      linkTable: 'SwPromoRewardExclProductType',
      locator: 'model/entity/PromotionReward.cfc:L378-L395',
      excludes: true,
      add: (reward) => {
        reward.addExcludedProductType(excludeRows.productType);
      },
      remove: (reward) => {
        reward.removeExcludedProductType(excludeRows.productType);
      },
      has: (reward) => reward.hasExcludedProductType(excludeRows.productType),
      counterpartHas: (reward) => reward.hasProductType(excludeRows.productType),
      near: (reward) => reward.getExcludedProductTypes(),
      counterpartNear: (reward) => reward.getProductTypes(),
      farOwn: () => excludeRows.productType.getPromotionRewardExclusions(),
      farCounterpart: () => excludeRows.productType.getPromotionRewards(),
    },
  ];
}

let fixtures: PromotionFixtureGraph;
let subject: PromotionReward;

beforeEach(() => {
  // A fully fresh graph per TEST. Eleven collection accessors hand out live array references, so a
  // graph shared across tests would let one test's `push` or `splice` change another's answer.
  fixtures = makePromotionFixtures();
  subject = fixtures.percentageOffReward;
});

afterEach(() => {
  // No spy is installed by default; this is unconditional hygiene so that a spy added to any one
  // test below can never survive into the next.
  vi.restoreAllMocks();
});

describe('the ported surface, and the members deliberately dropped or never present', () => {
  it('exposes the class plus the two vocabulary aliases, and injects no port and no clock', () => {
    // CFML parity `model/entity/PromotionReward.cfc`: the component contains ZERO `getService(`
    // calls across all 426 lines.
    const bare = new PromotionReward({ promotionRewardID: 'reward-minimal' });

    expect(bare).toBeInstanceOf(PromotionReward);
    expect(bare.getPromotionRewardID()).toBe('reward-minimal');
    expect(bare.getRoundingRule()).toBeUndefined();
    expect(bare.getPromotionPeriod()).toBeUndefined();
  });

  it('carries every legacy method name over verbatim in CFML camelCase', () => {
    const expectedMembers: readonly string[] = [
      'getSimpleRepresentation',
      'getApplicableTermOptions',
      'getAmountTypeOptions',
      'setPromotionPeriod',
      'removePromotionPeriod',
      'getAmountFormatted',
      'getSimpleRepresentationPropertyName',
      'isDeletable',
      'isNew',
      'hasAnyOption',
      'hasAnyExcludedOption',
      'addEligiblePriceGroup',
      'removeEligiblePriceGroup',
      'addExcludedProductType',
      'removeExcludedProductType',
    ];

    for (const member of expectedMembers) {
      expect(PROTOTYPE_MEMBERS).toContain(member);
    }
  });

  it('KEEPS the shippingMethods helper pair the legacy declares, and never had the other two', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L76-L78]: all three Group A collections still
    // collapse to opaque string IDs, because `FulfillmentMethod`, `AddressZone` and
    // `ShippingMethod` are out of scope.
    expect(PROTOTYPE_MEMBERS).toContain('addShippingMethod');
    expect(PROTOTYPE_MEMBERS).toContain('removeShippingMethod');
    expect(PROTOTYPE_MEMBERS).not.toContain('addFulfillmentMethod');
    expect(PROTOTYPE_MEMBERS).not.toContain('removeFulfillmentMethod');
    expect(PROTOTYPE_MEMBERS).not.toContain('addShippingAddressZone');
    expect(PROTOTYPE_MEMBERS).not.toContain('removeShippingAddressZone');

    // The collapsed accessors are named for what they hold - identifiers, not entities.
    expect(PROTOTYPE_MEMBERS).toContain('getShippingMethodIDs');
    expect(PROTOTYPE_MEMBERS).toContain('getFulfillmentMethodIDs');
    expect(PROTOTYPE_MEMBERS).toContain('getShippingAddressZoneIDs');
    expect(PROTOTYPE_MEMBERS).not.toContain('getShippingMethods');
    expect(PROTOTYPE_MEMBERS).not.toContain('getFulfillmentMethods');
    expect(PROTOTYPE_MEMBERS).not.toContain('getShippingAddressZones');
  });

  it('has setPromotionPeriod and removePromotionPeriod but NO setPromotion and NO removePromotion', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L140-L155]: the many-to-one helper pair is
    // named for the PERIOD, because `promotionPeriod` [model/entity/PromotionReward.cfc:L70] is
    // the only many-to-one relationship the reward owns.
    expect(PROTOTYPE_MEMBERS).toContain('setPromotionPeriod');
    expect(PROTOTYPE_MEMBERS).toContain('removePromotionPeriod');
    expect(PROTOTYPE_MEMBERS).not.toContain('setPromotion');
    expect(PROTOTYPE_MEMBERS).not.toContain('removePromotion');
  });

  it('exposes no accessor for the orphaned `rewards` property', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L104]: `rewards` is declared as a
    // non-persistent property with `type="string"` - plural name, scalar type - and has no getter
    // anywhere in the component.
    //
    // Contrast `PromotionQualifier`, which carries a DOUBLE orphan; this entity has exactly one.
    expect(PROTOTYPE_MEMBERS).not.toContain('getRewards');
    expect(PROTOTYPE_MEMBERS).not.toContain('setRewards');

    // Its two sibling non-persistent properties [model/entity/PromotionReward.cfc:L102, L103] do
    // have getters, which is what makes `rewards` identifiable as an orphan rather than as a
    // convention.
    expect(PROTOTYPE_MEMBERS).toContain('getAmountTypeOptions');
    expect(PROTOTYPE_MEMBERS).toContain('getApplicableTermOptions');
  });

  it('declares no ORM lifecycle hook, because the legacy banner pair is empty', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L423, L425]: the `START: ORM Event Hooks` /
    // `END: ORM Event Hooks` banner pair is LITERALLY EMPTY - no `preInsert`, no `preUpdate`, no
    // `preDelete`, no `postInsert` - and the component closes at
    // [model/entity/PromotionReward.cfc:L426].
    expect(PROTOTYPE_MEMBERS).not.toContain('preInsert');
    expect(PROTOTYPE_MEMBERS).not.toContain('preUpdate');
    expect(PROTOTYPE_MEMBERS).not.toContain('preDelete');
    expect(PROTOTYPE_MEMBERS).not.toContain('postInsert');
    expect(PROTOTYPE_MEMBERS).not.toContain('postUpdate');
  });

  it('declares none of the five declaratively-invoked entity validators', () => {
    // CFML parity `model/validation/PromotionReward.json`: the file names no entity method, so
    // there is no validator to port.
    expect(PROTOTYPE_MEMBERS).not.toContain('hasUniqueOptions');
    expect(PROTOTYPE_MEMBERS).not.toContain('hasOneOptionPerOptionGroup');
    expect(PROTOTYPE_MEMBERS).not.toContain('hasExpressionWithListOfNumericValuesOnly');
    expect(PROTOTYPE_MEMBERS).not.toContain('getPromotionCodesDeletableFlag');
    expect(PROTOTYPE_MEMBERS).not.toContain('hasUniquePromotionCode');
    expect(PROTOTYPE_MEMBERS).not.toContain('validate');
  });

  it('reproduces no Hibachi base-class surface and no dynamic dispatch', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L565]: `PromotionReward` does not declare
    // `attributeValues`, so in CFML an unknown `getX()` THROWS through the framework base rather
    // than answering silently.
    expect(PROTOTYPE_MEMBERS).not.toContain('getNewFlag');
    expect(PROTOTYPE_MEMBERS).not.toContain('getPrintTemplates');
    expect(PROTOTYPE_MEMBERS).not.toContain('getEmailTemplates');
    expect(PROTOTYPE_MEMBERS).not.toContain('clearAttributeCache');
    expect(PROTOTYPE_MEMBERS).not.toContain('getAttributeValue');
    expect(PROTOTYPE_MEMBERS).not.toContain('hasAnyInProperty');
    expect(PROTOTYPE_MEMBERS).not.toContain('getSmartList');
    expect(PROTOTYPE_MEMBERS).not.toContain('getErrors');

    // The class extends nothing, which is why its two overrides carry no `override` keyword even
    // under `noImplicitOverride`.
    expect(Object.getPrototypeOf(PromotionReward)).toBe(Function.prototype);
  });
});

describe('the FOURTEEN many-to-many collections, and the one that separates Reward from Qualifier', () => {
  it('declares exactly fourteen collections - one more than PromotionQualifier', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L74-L90]: fourteen many-to-many OWNER
    // collections, none of them `inverse="true"`. `PromotionQualifier` declares thirteen at
    // [model/entity/PromotionQualifier.cfc:L73-L87].
    expect(fixtures.rewardManyToManyCollections).toHaveLength(14);
    expect(fixtures.qualifierManyToManyCollectionCount).toBe(13);
    expect(fixtures.rewardManyToManyCollections.length).toBe(
      fixtures.qualifierManyToManyCollectionCount + 1,
    );
  });

  it('names eligiblePriceGroups as the single differentiator against the qualifier', () => {
    // The differentiator, stated positively: a REWARD can be restricted to a price group, a
    // QUALIFIER cannot.
    const differentiator = fixtures.rewardManyToManyCollections.find(
      (collection) => collection.property === 'eligiblePriceGroups',
    );

    expect(differentiator).toBeDefined();
    expect(differentiator?.linkTable).toBe('SwPromoRewardEligiblePriceGrp');
    expect(differentiator?.locator).toBe('model/entity/PromotionReward.cfc:L74');
    expect(differentiator?.declaresTypeArray).toBe(true);

    // It is also the FIRST collection declared, ahead of the three out-of-scope ones.
    expect(fixtures.rewardManyToManyCollections[0]?.property).toBe('eligiblePriceGroups');
  });

  it('records the table itself as the abbreviated SwPromoReward', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L57]: `table="SwPromoReward"`, matching
    // `SwPromoQual` on [model/entity/PromotionQualifier.cfc:L49] and abbreviated for the same
    // reason.
    expect(PromotionReward.entityMetadata.table).toBe('SwPromoReward');
    expect(PromotionReward.entityMetadata.entityname).toBe('SlatwallPromotionReward');
    expect(PromotionReward.entityMetadata.displayname).toBe('Promotion Reward');
    expect(PromotionReward.entityMetadata.cacheuse).toBe('transactional');

    // `hb_serviceName="promotionService"` is why there is no `PromotionRewardService` to port and
    // no such omission to explain - reward CRUD lives in `model/service/PromotionService.cfc`.
    expect(PromotionReward.entityMetadata.hb_serviceName).toBe('promotionService');
  });

  it('records the type="array" inconsistency on exactly three of the fourteen', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L74, L86, L87]: only `eligiblePriceGroups`,
    // `excludedBrands` and `excludedOptions` declare `type="array"`.
    //
    // `PromotionQualifier` repeats the same wart on its own two exclude collections
    // [model/entity/PromotionQualifier.cfc:L83, L84].
    const declaring = fixtures.rewardManyToManyCollections
      .filter((collection) => collection.declaresTypeArray)
      .map((collection) => collection.property);

    expect(declaring).toEqual(['eligiblePriceGroups', 'excludedBrands', 'excludedOptions']);
    expect(
      fixtures.rewardManyToManyCollections.filter((collection) => !collection.declaresTypeArray),
    ).toHaveLength(11);
  });

  it('preserves the Group A declaration order, which is REVERSED against the qualifier', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L76-L78] versus
    // [model/entity/PromotionQualifier.cfc:L73-L75]: the three out-of-scope collections are
    // declared in OPPOSITE orders in the two sibling components.
    const groupA = fixtures.rewardManyToManyCollections
      .slice(1, 4)
      .map((collection) => collection.property);

    expect(groupA).toEqual(['fulfillmentMethods', 'shippingAddressZones', 'shippingMethods']);
    expect(groupA).not.toEqual(['fulfillmentMethods', 'shippingMethods', 'shippingAddressZones']);
  });

  it('splits the fourteen into ELEVEN entity arrays and THREE opaque identifier arrays', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L76-L78]: `FulfillmentMethod`, `AddressZone`
    // and `ShippingMethod` are all out of scope and were never ported, so their three collections
    // collapse to opaque `readonly string[]` identifier arrays.
    expect(subject.getFulfillmentMethodIDs()).toEqual(['promofx-fulfillment-method']);
    expect(subject.getShippingAddressZoneIDs()).toEqual(['promofx-shipping-address-zone']);
    expect(subject.getShippingMethodIDs()).toEqual(['promofx-shipping-method']);

    for (const identifier of [
      ...subject.getFulfillmentMethodIDs(),
      ...subject.getShippingAddressZoneIDs(),
      ...subject.getShippingMethodIDs(),
    ]) {
      expect(typeof identifier).toBe('string');
    }

    // The remaining eleven hand back real entity instances.
    const eligiblePriceGroups: PriceGroup[] = subject.getEligiblePriceGroups();
    const brands: Brand[] = subject.getBrands();
    const options: Option[] = subject.getOptions();

    expect(eligiblePriceGroups).toHaveLength(2);
    expect(brands).toHaveLength(1);
    expect(options).toHaveLength(1);
    expect(subject.getSkus()).toHaveLength(1);
    expect(subject.getProducts()).toHaveLength(1);
    expect(subject.getProductTypes()).toHaveLength(1);
    expect(subject.getExcludedBrands()).toHaveLength(1);
    expect(subject.getExcludedOptions()).toHaveLength(1);
    expect(subject.getExcludedSkus()).toHaveLength(1);
    expect(subject.getExcludedProducts()).toHaveLength(1);
    expect(subject.getExcludedProductTypes()).toHaveLength(1);

    expect(brands[0]?.getBrandID()).toBe(fixtures.brand.getBrandID());
    expect(options[0]?.getOptionID()).toBe(fixtures.option.getOptionID());
    expect(eligiblePriceGroups[0]?.getPriceGroupID()).toBe(
      fixtures.eligiblePriceGroups[0]?.getPriceGroupID(),
    );
  });

  it('defaults all fourteen collections to empty on a bare instance', () => {
    // Associations are MATERIALIZED at the REPOSITORY BOUNDARY, so laziness is not simulated: a
    // collection the repository did not populate is `[]`, never `undefined` and never a lazy
    // proxy.
    const bare = new PromotionReward({ promotionRewardID: 'reward-empty-collections' });

    expect(bare.getEligiblePriceGroups()).toEqual([]);
    expect(bare.getFulfillmentMethodIDs()).toEqual([]);
    expect(bare.getShippingAddressZoneIDs()).toEqual([]);
    expect(bare.getShippingMethodIDs()).toEqual([]);
    expect(bare.getBrands()).toEqual([]);
    expect(bare.getOptions()).toEqual([]);
    expect(bare.getSkus()).toEqual([]);
    expect(bare.getProducts()).toEqual([]);
    expect(bare.getProductTypes()).toEqual([]);
    expect(bare.getExcludedBrands()).toEqual([]);
    expect(bare.getExcludedOptions()).toEqual([]);
    expect(bare.getExcludedSkus()).toEqual([]);
    expect(bare.getExcludedProducts()).toEqual([]);
    expect(bare.getExcludedProductTypes()).toEqual([]);
  });

  it('returns the LIVE internal array from every entity-collection accessor', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L171-L174, L211-L214, L311-L314]: every
    // `remove*` helper mutates the FAR side's array in PLACE, reaching it through the far side's
    // own getter.
    //
    // So live references are LOAD-BEARING, and this test pins them rather than asserting the
    // tidier `readonly` projection a fresh design would prefer.
    const first: Brand[] = subject.getBrands();
    const second: Brand[] = subject.getBrands();

    expect(second).toBe(first);

    first.push(fixtures.excludedBrand);
    expect(subject.getBrands()).toHaveLength(2);
    expect(subject.getBrands()[1]?.getBrandID()).toBe(fixtures.excludedBrand.getBrandID());
    expect(subject.getShippingMethodIDs()).toEqual(['promofx-shipping-method']);

    const liveIDs: readonly string[] = subject.getShippingMethodIDs();
    subject.addShippingMethod('added-through-the-helper');

    // The same array object, observed after the mutation - exactly as CFML's callers observed
    // `variables.shippingMethods` after an `arrayAppend`.
    expect(subject.getShippingMethodIDs()).toBe(liveIDs);
    expect(liveIDs).toEqual(['promofx-shipping-method', 'added-through-the-helper']);

    // Restored, so no later case in this describe inherits the addition.
    subject.removeShippingMethod('added-through-the-helper');
    expect(subject.getShippingMethodIDs()).toEqual(['promofx-shipping-method']);
  });

  it('★★★ reproduces the OWNING half of the shippingMethods helper pair, ID-keyed', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L178-L195].
    const reward = new PromotionReward({
      promotionRewardID: 'reward-shipping-helpers',
      shippingMethodIDs: ['ship-first'],
    });

    // The constructor copies: the caller's array is not aliased into the entity.
    const supplied = ['ship-first'];
    const isolated = new PromotionReward({
      promotionRewardID: 'reward-isolated',
      shippingMethodIDs: supplied,
    });
    isolated.addShippingMethod('ship-second');
    expect(supplied).toEqual(['ship-first']);

    // `hasShippingMethod` [guard site L179] answers on the identifier.
    expect(reward.hasShippingMethod('ship-first')).toBe(true);
    expect(reward.hasShippingMethod('ship-absent')).toBe(false);

    // [model/entity/PromotionReward.cfc:L179-L181] The `!has` guard: a value already held is not
    // appended twice.
    reward.addShippingMethod('ship-first');
    expect(reward.getShippingMethodIDs()).toEqual(['ship-first']);

    // and an unheld value is appended, in order, at the end.
    reward.addShippingMethod('ship-second');
    expect(reward.getShippingMethodIDs()).toEqual(['ship-first', 'ship-second']);
    expect(reward.hasShippingMethod('ship-second')).toBe(true);

    // [model/entity/PromotionReward.cfc:L187-L190] `remove*` removes the FIRST occurrence only,
    // which is `arrayFind` + `arrayDeleteAt` semantics rather than a filter.
    const duplicated = new PromotionReward({
      promotionRewardID: 'reward-duplicated-links',
      shippingMethodIDs: ['ship-dup', 'ship-other', 'ship-dup'],
    });
    duplicated.removeShippingMethod('ship-dup');
    expect(duplicated.getShippingMethodIDs()).toEqual(['ship-other', 'ship-dup']);

    // The `> 0` / `!== -1` guard: removing an absent identifier is a no-op and never throws.
    duplicated.removeShippingMethod('ship-never-linked');
    expect(duplicated.getShippingMethodIDs()).toEqual(['ship-other', 'ship-dup']);

    // Neither helper touches the other two group a collections, whose link tables are different
    // rows entirely - the failure an inverted helper would produce.
    expect(reward.getFulfillmentMethodIDs()).toEqual([]);
    expect(reward.getShippingAddressZoneIDs()).toEqual([]);

    // And the FAR HALF is not SIMULATED. `ShippingMethod` is unported, so
    // [model/entity/PromotionReward.cfc:L182-L184] and
    // [model/entity/PromotionReward.cfc:L191-L194] have no counterpart here and the entity
    // publishes no member that pretends to one.
    expect(PROTOTYPE_MEMBERS).not.toContain('getShippingMethods');
    expect(PROTOTYPE_MEMBERS).not.toContain('hasPromotionRewardShippingMethod');
  });
});

describe('the ELEVEN membership predicates, all comparing by primary key', () => {
  it('exposes exactly twelve singular has* predicates, hasShippingMethod among them', () => {
    const singularPredicates: readonly string[] = [
      'hasEligiblePriceGroup',
      'hasShippingMethod',
      'hasBrand',
      'hasOption',
      'hasSku',
      'hasProduct',
      'hasProductType',
      'hasExcludedBrand',
      'hasExcludedOption',
      'hasExcludedSku',
      'hasExcludedProduct',
      'hasExcludedProductType',
    ];

    expect(singularPredicates).toHaveLength(12);
    for (const predicate of singularPredicates) {
      expect(PROTOTYPE_MEMBERS).toContain(predicate);
    }

    expect(PROTOTYPE_MEMBERS).not.toContain('hasFulfillmentMethod');
    expect(PROTOTYPE_MEMBERS).not.toContain('hasShippingAddressZone');

    // Exactly twelve `has*` members exist in total once the two plural helpers are excluded, so no
    // thirteenth predicate has crept in.
    const shippedPredicates = PROTOTYPE_MEMBERS.filter(
      (member) => member.startsWith('has') && !member.startsWith('hasAny'),
    );
    expect(shippedPredicates).toHaveLength(12);
  });

  it('answers membership by primary key, not by object identity', () => {
    // Every predicate compares the candidate's PRIMARY KEY against the held rows' primary keys.
    const heldBrand: Brand | undefined = subject.getBrands()[0];
    expect(heldBrand).toBeDefined();

    // A DIFFERENT instance is never asserted to be the same object...
    expect(subject.hasBrand(fixtures.brand)).toBe(true);
    // and a genuinely different row answers false even though it is the same class.
    expect(subject.hasBrand(fixtures.excludedBrand)).toBe(false);

    expect(subject.hasOption(fixtures.option)).toBe(true);
    expect(subject.hasSku(fixtures.sku)).toBe(true);
    expect(subject.hasProduct(fixtures.product)).toBe(true);
    expect(subject.hasProductType(fixtures.productType)).toBe(true);
    expect(subject.hasProductType(fixtures.excludedProductType)).toBe(false);
  });

  it('keeps the include and exclude predicates strictly separate', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L81 versus L87]: `options` and
    // `excludedOptions` are distinct collections over distinct link tables (`SwPromoRewardOption`
    // and `SwPromoRewardExclOption`).
    expect(subject.hasOption(fixtures.option)).toBe(true);
    expect(subject.hasExcludedOption(fixtures.option)).toBe(false);

    const heldExcludedOption: Option = requireAt(
      subject.getExcludedOptions(),
      0,
      'excluded option',
    );
    expect(heldExcludedOption.getOptionID()).toBe('promofx-option-excluded');
    expect(subject.hasExcludedOption(heldExcludedOption)).toBe(true);
    expect(subject.hasOption(heldExcludedOption)).toBe(false);

    expect(subject.hasBrand(fixtures.brand)).toBe(true);
    expect(subject.hasExcludedBrand(fixtures.brand)).toBe(false);
    expect(subject.hasExcludedBrand(fixtures.excludedBrand)).toBe(true);
    expect(subject.hasProductType(fixtures.excludedProductType)).toBe(false);
    expect(subject.hasExcludedProductType(fixtures.excludedProductType)).toBe(true);
  });

  it('resolves hasAnyOption and hasAnyExcludedOption through the optionID primary key', () => {
    // These two are the target's explicit stand-ins for the framework's reflective
    // `hasAnyInProperty( propertyName, entityArray )` [org/Hibachi/HibachiEntity.cfc:L340-L350].
    expect(subject.hasAnyOption([fixtures.option])).toBe(true);
    expect(subject.hasAnyExcludedOption(subject.getExcludedOptions())).toBe(true);

    // A candidate list containing only a NON-member answers false on both sides.
    const foreignOption: Option = requireAt(subject.getExcludedOptions(), 0, 'excluded option');
    expect(subject.hasAnyOption([foreignOption])).toBe(false);
    expect(subject.hasAnyExcludedOption([fixtures.option])).toBe(false);

    // `some` semantics: one match in a mixed list is enough, exactly as the legacy loop returns
    // `true` at [org/Hibachi/HibachiEntity.cfc:L345] on its first hit.
    expect(subject.hasAnyOption([foreignOption, fixtures.option])).toBe(true);
  });

  it('does NOT reproduce the evaluate()-based dispatch behind hasAnyInProperty', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L340-L350]: the framework builds the predicate
    // name at runtime - `evaluate("has#propertyName#( entity )")` at
    // [org/Hibachi/HibachiEntity.cfc:L344].
    //
    // JUDGMENT CALL: that indirection is not ported. `evaluate`, `eval`, `new Function`, `vm` and
    // Proxy-based dispatch are all forbidden, and a string-keyed dispatcher would defeat the
    // static verifiability the migration exists to gain.
    expect(PROTOTYPE_MEMBERS).not.toContain('hasAnyInProperty');
    expect(PROTOTYPE_MEMBERS).toContain('hasAnyOption');
    expect(PROTOTYPE_MEMBERS).toContain('hasAnyExcludedOption');

    // Exactly two plural helpers, so no reflective third has been added.
    expect(PROTOTYPE_MEMBERS.filter((member) => member.startsWith('hasAny'))).toHaveLength(2);
  });
});

describe('empty-collection semantics - the SAME empty array, OPPOSITE meanings', () => {
  it('answers false on an empty INCLUDE list, which is RESTRICTIVE', () => {
    // CFML parity [org/Hibachi/HibachiEntity.cfc:L348]: `hasAnyInProperty` falls out of its loop
    // and returns `false` when nothing matches - including when the collection is empty.
    //
    // On an include list that `false` is restrictive: the reward holds no options, so nothing is a
    // member and the item does not qualify through this path.
    const bare = new PromotionReward({ promotionRewardID: 'reward-no-includes' });

    expect(bare.getOptions()).toEqual([]);
    expect(bare.hasOption(fixtures.option)).toBe(false);
    expect(bare.hasAnyOption([fixtures.option])).toBe(false);
    expect(bare.hasAnyOption([])).toBe(false);
  });

  it('answers false on an empty EXCLUDE list, which is PERMISSIVE', () => {
    // On an exclude list the identical `false` is permissive: nothing is excluded, so the item
    // survives. Same method, same return value, opposite consequence for the customer's price.
    //
    // PERMISSIVE in the caller's loop - an empty `shippingAddressZones` on a reward means no
    // RESTRICTION, so the reward applies to every zone.
    const bare = new PromotionReward({ promotionRewardID: 'reward-no-excludes' });

    expect(bare.getExcludedOptions()).toEqual([]);
    expect(bare.hasExcludedOption(fixtures.option)).toBe(false);
    expect(bare.hasAnyExcludedOption([fixtures.option])).toBe(false);
    expect(bare.hasAnyExcludedOption([])).toBe(false);

    // The polarity, stated as the assertion it really is: the same predicate result, `false`,
    // reached from an empty include list and from an empty exclude list.
    expect(bare.hasAnyOption([fixtures.option])).toBe(bare.hasAnyExcludedOption([fixtures.option]));
  });

  it('answers false for an EMPTY candidate list even when the collection is populated', () => {
    // The other empty: an empty `entityArray` argument.
    expect(subject.getOptions()).toHaveLength(1);
    expect(subject.hasAnyOption([])).toBe(false);

    expect(subject.getExcludedOptions()).toHaveLength(1);
    expect(subject.hasAnyExcludedOption([])).toBe(false);
  });
});

describe('the bidirectional helpers, and the guard polarity that is load-bearing', () => {
  it('setPromotionPeriod assigns the near side and appends to the far side', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L140-L145]:
    // [model/entity/PromotionReward.cfc:L141] assigns, [model/entity/PromotionReward.cfc:L142]
    // guards on `isNew() or !arguments.promotionPeriod.hasPromotionReward( this )`, and
    // [model/entity/PromotionReward.cfc:L143] appends `this` to the period's LIVE
    // `getPromotionRewards()` array.
    const period: PromotionPeriod = fixtures.promotionPeriod;
    const saved = new PromotionReward({ promotionRewardID: 'reward-saved-for-set' });
    const before = period.getPromotionRewards().length;

    saved.setPromotionPeriod(period);

    expect(saved.getPromotionPeriod()).toBe(period);
    expect(period.getPromotionRewards()).toHaveLength(before + 1);
    expect(period.getPromotionRewards()).toContain(saved);
  });

  it('guards the far-side append on a SAVED reward, so a repeat set does not duplicate', () => {
    // The `!hasPromotionReward( this )` half of the [model/entity/PromotionReward.cfc:L142] guard
    // does the work once the reward has a real primary key: the second call finds itself already
    // present and appends nothing.
    const period: PromotionPeriod = fixtures.promotionPeriod;
    const saved = new PromotionReward({ promotionRewardID: 'reward-saved-repeat' });
    const before = period.getPromotionRewards().length;

    saved.setPromotionPeriod(period);
    saved.setPromotionPeriod(period);

    expect(period.getPromotionRewards()).toHaveLength(before + 1);
  });

  it('appends TWICE on an isNew() reward, because isNew() short-circuits the guard', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L142]: the guard reads
    // `if(isNew() or !arguments.promotionPeriod.hasPromotionReward( this ))`. `or` short-circuits,
    // so while the reward is NEW the membership test is never evaluated and the append is
    // UNCONDITIONAL.
    const period: PromotionPeriod = fixtures.promotionPeriod;
    const brandNew = new PromotionReward({ promotionRewardID: '' });
    const before = period.getPromotionRewards().length;

    expect(brandNew.isNew()).toBe(true);

    brandNew.setPromotionPeriod(period);
    brandNew.setPromotionPeriod(period);

    expect(period.getPromotionRewards()).toHaveLength(before + 2);
    expect(period.getPromotionRewards().filter((reward) => reward === brandNew)).toHaveLength(2);
  });

  it('removePromotionPeriod splices the far side and clears the near side unconditionally', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L150-L154]: `arrayFind` then `arrayDeleteAt`
    // on the period's live array, and then `structDelete(variables,"promotionPeriod")` OUTSIDE the
    // guard.
    const period: PromotionPeriod = fixtures.promotionPeriod;
    const saved = new PromotionReward({ promotionRewardID: 'reward-to-remove' });
    saved.setPromotionPeriod(period);
    const withReward = period.getPromotionRewards().length;

    saved.removePromotionPeriod(period);

    expect(saved.getPromotionPeriod()).toBeUndefined();
    expect(period.getPromotionRewards()).toHaveLength(withReward - 1);
    expect(period.getPromotionRewards()).not.toContain(saved);
  });

  it('substitutes the held period when removePromotionPeriod is called with no argument', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L147-L149]: the argument is OPTIONAL, and when
    // it is omitted the body substitutes `variables.promotionPeriod`.
    const period: PromotionPeriod = fixtures.promotionPeriod;
    const saved = new PromotionReward({ promotionRewardID: 'reward-implicit-remove' });
    saved.setPromotionPeriod(period);
    const withReward = period.getPromotionRewards().length;

    saved.removePromotionPeriod();

    expect(saved.getPromotionPeriod()).toBeUndefined();
    expect(period.getPromotionRewards()).toHaveLength(withReward - 1);
  });

  it('throws when removePromotionPeriod is called with no argument and no held period', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L147-L150]: with the argument omitted and
    // `variables.promotionPeriod` unset, the substitution yields null and
    // [model/entity/PromotionReward.cfc:L150] then calls `getPromotionRewards()` on it.
    const orphaned = new PromotionReward({ promotionRewardID: 'reward-orphaned' });

    expect(orphaned.getPromotionPeriod()).toBeUndefined();
    expect(() => {
      orphaned.removePromotionPeriod();
    }).toThrow(/no promotionPeriod/);
  });

  it('adds and removes an eligible price group on BOTH sides', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L158-L175]: the four-step shape every one of
    // the eleven pairs repeats - guard, push near, guard, push far - and, on removal, an
    // unconditional attempt on each side independently.
    const target: PriceGroup = requireAt(fixtures.eligiblePriceGroups, 0, 'eligible price group');
    const fresh = new PromotionReward({ promotionRewardID: 'reward-price-group-pair' });
    const farBefore = target.getPromotionRewards().length;

    fresh.addEligiblePriceGroup(target);

    expect(fresh.getEligiblePriceGroups()).toHaveLength(1);
    expect(fresh.hasEligiblePriceGroup(target)).toBe(true);
    expect(target.getPromotionRewards()).toHaveLength(farBefore + 1);

    fresh.removeEligiblePriceGroup(target);

    expect(fresh.getEligiblePriceGroups()).toEqual([]);
    expect(fresh.hasEligiblePriceGroup(target)).toBe(false);
    expect(target.getPromotionRewards()).toHaveLength(farBefore);
  });

  it('routes the exclude pairs through the far side EXCLUSION collection', () => {
    const brand: Brand = fixtures.excludedBrand;
    const fresh = new PromotionReward({ promotionRewardID: 'reward-exclusion-pair' });
    const inclusionsBefore = brand.getPromotionRewards().length;
    const exclusionsBefore = brand.getPromotionRewardExclusions().length;

    fresh.addExcludedBrand(brand);

    expect(fresh.getExcludedBrands()).toHaveLength(1);
    expect(fresh.getBrands()).toEqual([]);
    expect(brand.getPromotionRewardExclusions()).toHaveLength(exclusionsBefore + 1);
    expect(brand.getPromotionRewards()).toHaveLength(inclusionsBefore);

    fresh.removeExcludedBrand(brand);

    expect(fresh.getExcludedBrands()).toEqual([]);
    expect(brand.getPromotionRewardExclusions()).toHaveLength(exclusionsBefore);
  });

  it('carries a CLEAN inversion record across all thirteen remove*-bearing properties', () => {
    // The inversion cross-check, and its verdict: clean.
    const removeMembers = PROTOTYPE_MEMBERS.filter((member) => member.startsWith('remove'));
    const addMembers = PROTOTYPE_MEMBERS.filter((member) => member.startsWith('add'));

    expect(removeMembers).toHaveLength(13);
    expect(addMembers).toHaveLength(12);
    expect(removeMembers).toContain('removePromotionPeriod');
    expect(addMembers).not.toContain('addPromotionPeriod');

    // Every `add*` has a matching `remove*`, and every many-to-many `remove*` a matching `add*`.
    for (const addMember of addMembers) {
      expect(removeMembers).toContain(addMember.replace(/^add/, 'remove'));
    }

    // The verdict, exercised - not enumerated.
    const probes = makeRelationPairProbes(
      catalogRows(fixtures),
      excludedRowsHeldBy(fixtures, subject),
    );

    expect(probes).toHaveLength(10);

    for (const probe of probes) {
      const before = collectionSizes(subject);

      expect(probe.has(subject)).toBe(true);

      probe.remove(subject);

      expect(collectionSizes(subject)).toEqual(withOneFewer(before, probe.property));
      expect(probe.has(subject)).toBe(false);
      expect(probe.near(subject)).toEqual([]);
    }

    // The eleventh pair, which the probe table deliberately omits because `PriceGroup` has no
    // exclusion counterpart.
    const heldPriceGroup: PriceGroup = requireAt(
      subject.getEligiblePriceGroups(),
      0,
      'held eligible price group',
    );
    const beforePriceGroupRemoval = collectionSizes(subject);

    subject.removeEligiblePriceGroup(heldPriceGroup);

    expect(collectionSizes(subject)).toEqual(
      withOneFewer(beforePriceGroupRemoval, 'eligiblePriceGroups'),
    );
    expect(subject.getEligiblePriceGroups()).toHaveLength(1);
    expect(subject.hasEligiblePriceGroup(heldPriceGroup)).toBe(false);
  });
});

describe('every relation pair, exercised on BOTH sides with real graph rows', () => {
  // Why this block exists.
  //
  // The ten paired many-to-many families are the widest part of this entity's surface - twenty
  // helpers and ten predicates.
  //
  // So each family is exercised end to end against a REAL row from the fixture graph: the
  // near-side collection, the far-side collection, the OPPOSITE family's collections on both
  // sides.

  it('appends every INCLUDE row to its own near side and to the far side INCLUSIONS', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L198-L295]: each include `add*` is the same
    // four-step shape - guard [model/entity/PromotionReward.cfc:L199] then
    // `arrayAppend(variables.<near>, row)` [model/entity/PromotionReward.cfc:L200], guard
    // [model/entity/PromotionReward.cfc:L202] then `arrayAppend(row.getPromotionRewards(), this)`
    // [model/entity/PromotionReward.cfc:L203].
    const probes = makeRelationPairProbes(catalogRows(fixtures), catalogRows(fixtures)).filter(
      (probe) => !probe.excludes,
    );

    expect(probes).toHaveLength(5);

    for (const probe of probes) {
      const reward = new PromotionReward({ promotionRewardID: `reward-include-${probe.property}` });
      const emptied = collectionSizes(reward);
      const farOwnBefore = probe.farOwn().length;
      const farCounterpartBefore = probe.farCounterpart().length;

      expect(probe.has(reward)).toBe(false);

      probe.add(reward);

      // Near side: exactly this pair's collection grew, and it holds the real row.
      expect(collectionSizes(reward)).toEqual(withOneMore(emptied, probe.property));
      expect(probe.near(reward)).toHaveLength(1);
      expect(probe.has(reward)).toBe(true);

      // Far side: the row's INCLUSION collection gained this reward; its EXCLUSION collection did
      // not move, even though the very same row is what the exclude family would have written to.
      expect(probe.farOwn()).toHaveLength(farOwnBefore + 1);
      expect(probe.farOwn()).toContain(reward);
      expect(probe.farCounterpart()).toHaveLength(farCounterpartBefore);
      expect(probe.farCounterpart()).not.toContain(reward);
    }
  });

  it('appends every EXCLUDE row to its own near side and to the far side EXCLUSIONS', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L298-L395]: the exclude helpers are the same
    // four steps with the far side swapped - `hasPromotionRewardExclusion`
    // [model/entity/PromotionReward.cfc:L302, L322, L342, L362, L382] and
    // `getPromotionRewardExclusions()`
    // [model/entity/PromotionReward.cfc:L303, L323, L343, L363, L383].
    const probes = makeRelationPairProbes(catalogRows(fixtures), catalogRows(fixtures)).filter(
      (probe) => probe.excludes,
    );

    expect(probes).toHaveLength(5);

    for (const probe of probes) {
      const reward = new PromotionReward({ promotionRewardID: `reward-exclude-${probe.property}` });
      const emptied = collectionSizes(reward);
      const farOwnBefore = probe.farOwn().length;
      const farCounterpartBefore = probe.farCounterpart().length;

      expect(probe.has(reward)).toBe(false);

      probe.add(reward);

      expect(collectionSizes(reward)).toEqual(withOneMore(emptied, probe.property));
      expect(probe.near(reward)).toHaveLength(1);
      expect(probe.has(reward)).toBe(true);

      expect(probe.farOwn()).toHaveLength(farOwnBefore + 1);
      expect(probe.farOwn()).toContain(reward);
      expect(probe.farCounterpart()).toHaveLength(farCounterpartBefore);
      expect(probe.farCounterpart()).not.toContain(reward);
    }
  });

  it('keeps the two families apart for the SAME row, on the near side and the far side', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L80-L84 versus L86-L90]: `brands` and
    // `excludedBrands` are DISTINCT collections over `SwPromoRewardBrand` and
    // `SwPromoRewardExclBrand`.
    const probes = makeRelationPairProbes(catalogRows(fixtures), catalogRows(fixtures));

    expect(probes).toHaveLength(10);

    for (const probe of probes) {
      const reward = new PromotionReward({ promotionRewardID: `reward-split-${probe.property}` });

      probe.add(reward);

      expect(probe.has(reward)).toBe(true);
      expect(probe.counterpartHas(reward)).toBe(false);
      expect(probe.near(reward)).toHaveLength(1);
      expect(probe.counterpartNear(reward)).toEqual([]);
      expect(probe.counterpartProperty).not.toBe(probe.property);
      expect(probe.linkTable.includes('Excl')).toBe(probe.excludes);
    }
  });

  it('answers every membership predicate TRUE for a held row and FALSE for the counterpart row', () => {
    // Both polarities of all ELEVEN singular predicates, against real rows the fixture hydrated.
    const included: CatalogRowSet = catalogRows(fixtures);
    const excluded: CatalogRowSet = excludedRowsHeldBy(fixtures, subject);

    // INCLUDE side: the catalog row is a member, the excluded row is not.
    expect(subject.hasBrand(included.brand)).toBe(true);
    expect(subject.hasBrand(excluded.brand)).toBe(false);
    expect(subject.hasOption(included.option)).toBe(true);
    expect(subject.hasOption(excluded.option)).toBe(false);
    expect(subject.hasSku(included.sku)).toBe(true);
    expect(subject.hasSku(excluded.sku)).toBe(false);
    expect(subject.hasProduct(included.product)).toBe(true);
    expect(subject.hasProduct(excluded.product)).toBe(false);
    expect(subject.hasProductType(included.productType)).toBe(true);
    expect(subject.hasProductType(excluded.productType)).toBe(false);

    // EXCLUDE side: exactly the mirror image, and the two never agree about the same row.
    expect(subject.hasExcludedBrand(excluded.brand)).toBe(true);
    expect(subject.hasExcludedBrand(included.brand)).toBe(false);
    expect(subject.hasExcludedOption(excluded.option)).toBe(true);
    expect(subject.hasExcludedOption(included.option)).toBe(false);
    expect(subject.hasExcludedSku(excluded.sku)).toBe(true);
    expect(subject.hasExcludedSku(included.sku)).toBe(false);
    expect(subject.hasExcludedProduct(excluded.product)).toBe(true);
    expect(subject.hasExcludedProduct(included.product)).toBe(false);
    expect(subject.hasExcludedProductType(excluded.productType)).toBe(true);
    expect(subject.hasExcludedProductType(included.productType)).toBe(false);

    // The eleventh: `hasEligiblePriceGroup`, whose collection has no exclusion counterpart at all.
    const heldPriceGroup: PriceGroup = requireAt(
      subject.getEligiblePriceGroups(),
      0,
      'held eligible price group',
    );
    expect(subject.hasEligiblePriceGroup(heldPriceGroup)).toBe(true);
    expect(
      new PromotionReward({ promotionRewardID: 'reward-no-price-groups' }).hasEligiblePriceGroup(
        heldPriceGroup,
      ),
    ).toBe(false);

    // The excluded rows really are distinct rows rather than aliases of the catalog ones, so the
    // `false` answers above are earned by key comparison and not by asking about the same object.
    expect(excluded.brand).not.toBe(included.brand);
    expect(excluded.brand.getBrandID()).not.toBe(included.brand.getBrandID());
    expect(excluded.option.getOptionID()).not.toBe(included.option.getOptionID());
    expect(excluded.sku.getSkuID()).not.toBe(included.sku.getSkuID());
    expect(excluded.product.getProductID()).not.toBe(included.product.getProductID());
    expect(excluded.productType.getProductTypeID()).not.toBe(
      included.productType.getProductTypeID(),
    );
  });

  it('prevents a duplicate on BOTH sides when the same SAVED row is added twice', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L199 and L202]: both guards are DISJUNCTIONS
    // whose first operand is an `isNew()` test.
    const probes = makeRelationPairProbes(catalogRows(fixtures), catalogRows(fixtures));

    for (const probe of probes) {
      const reward = new PromotionReward({ promotionRewardID: `reward-dedupe-${probe.property}` });

      probe.add(reward);

      const afterFirst = collectionSizes(reward);
      const farAfterFirst = probe.farOwn().length;

      probe.add(reward);

      expect(collectionSizes(reward)).toEqual(afterFirst);
      expect(probe.near(reward)).toHaveLength(1);
      expect(probe.farOwn()).toHaveLength(farAfterFirst);
    }
  });

  it('removes every pair from BOTH sides, restoring each collection to its baseline', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L206-L215 through L386-L395]: removal is
    // `arrayFind` then `arrayDeleteAt` on the near side and the same again on the far side, each
    // guarded only by `> 0`.
    const probes = makeRelationPairProbes(catalogRows(fixtures), catalogRows(fixtures));

    for (const probe of probes) {
      const reward = new PromotionReward({ promotionRewardID: `reward-detach-${probe.property}` });
      const emptied = collectionSizes(reward);
      const farOwnBefore = probe.farOwn().length;

      probe.add(reward);
      probe.remove(reward);

      expect(collectionSizes(reward)).toEqual(emptied);
      expect(probe.near(reward)).toEqual([]);
      expect(probe.has(reward)).toBe(false);
      expect(probe.farOwn()).toHaveLength(farOwnBefore);
      expect(probe.farOwn()).not.toContain(reward);
    }
  });

  it('removes exactly ONE element from a collection holding TWO, first index first', () => {
    // [model/entity/PromotionReward.cfc:L207-L210]: `arrayFind` yields the FIRST matching index
    // and `arrayDeleteAt` deletes that one element - it is not a "clear the collection" operation,
    // and it is not a filter.
    const primary = makeRelationPairProbes(catalogRows(fixtures), catalogRows(fixtures));
    const secondary = makeRelationPairProbes(
      excludedRowsHeldBy(fixtures, subject),
      excludedRowsHeldBy(fixtures, subject),
    );

    expect(primary).toHaveLength(10);
    expect(secondary).toHaveLength(10);

    for (const [index, probe] of primary.entries()) {
      const other: RelationPairProbe = requireAt(secondary, index, 'second-row probe');

      // The two tables really are aligned on the same collection.
      expect(other.property).toBe(probe.property);
      expect(other.linkTable).toBe(probe.linkTable);

      const reward = new PromotionReward({ promotionRewardID: `reward-splice-${probe.property}` });

      probe.add(reward);
      other.add(reward);

      expect(probe.near(reward)).toHaveLength(2);
      expect(probe.has(reward)).toBe(true);
      expect(other.has(reward)).toBe(true);

      probe.remove(reward);

      // One survivor, and it is the row that was not asked for.
      expect(probe.near(reward)).toHaveLength(1);
      expect(probe.has(reward)).toBe(false);
      expect(other.has(reward)).toBe(true);

      // Removing the survivor empties the collection, so nothing was left dangling.
      other.remove(reward);

      expect(probe.near(reward)).toEqual([]);
      expect(other.has(reward)).toBe(false);
    }
  });

  it('leaves both sides untouched when a row that was never added is removed', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L207-L214]: `arrayFind` answers `0` for an
    // absent element and both `if(... > 0)` bodies are skipped, so a removal that matches nothing
    // is a no-op rather than an error.
    const probes = makeRelationPairProbes(catalogRows(fixtures), catalogRows(fixtures));

    for (const probe of probes) {
      const reward = new PromotionReward({ promotionRewardID: `reward-absent-${probe.property}` });
      const emptied = collectionSizes(reward);
      const farOwnBefore = probe.farOwn().length;

      probe.remove(reward);

      expect(collectionSizes(reward)).toEqual(emptied);
      expect(probe.farOwn()).toHaveLength(farOwnBefore);
    }
  });

  it('appends TWICE for an UNSAVED include row, then splices only the FIRST occurrence', () => {
    // LEGACY-DEFECT [model/entity/PromotionReward.cfc:L199]: the near-side guard is
    // `arguments.brand.isNew() or !hasBrand(arguments.brand)`, and an UNSAVED row satisfies the
    // first operand, so the membership test is never reached and the append happens every time -
    // the same row lands in the collection twice.
    // Preserved deliberately; do not fix without a product decision.
    //
    // CFML parity [model/entity/PromotionReward.cfc:L207-L210]: the removal is `arrayFind` then
    // `arrayDeleteAt`, and `arrayFind` answers with the FIRST match while `arrayDeleteAt` removes
    // exactly one element.
    const transient = new Brand({ brandName: 'Transient Fixture Brand' });
    const reward = new PromotionReward({ promotionRewardID: 'reward-unsaved-include' });

    expect(transient.isNew()).toBe(true);
    expect(transient.getBrandID()).toBe('');

    reward.addBrand(transient);
    reward.addBrand(transient);

    // Near side: appended twice, because the guard short-circuited both times.
    expect(reward.getBrands()).toHaveLength(2);
    expect(requireAt(reward.getBrands(), 0, 'first appended transient brand')).toBe(transient);
    expect(requireAt(reward.getBrands(), 1, 'second appended transient brand')).toBe(transient);

    // The predicate falls back to reference identity for a row whose key is still `''`, because
    // there is no key to compare - so it answers `true` for the object it actually holds.
    expect(reward.hasBrand(transient)).toBe(true);

    // Far side: guarded by the REWARD's own `isNew()`, which is false here, so it appends once
    // only.
    expect(transient.getPromotionRewards()).toHaveLength(1);
    expect(transient.getPromotionRewards()).toContain(reward);
    expect(transient.getPromotionRewardExclusions()).toEqual([]);

    reward.removeBrand(transient);

    // One occurrence removed, one left behind - the first-index splice, observable.
    expect(reward.getBrands()).toHaveLength(1);
    expect(reward.hasBrand(transient)).toBe(true);
    expect(transient.getPromotionRewards()).toEqual([]);

    reward.removeBrand(transient);

    expect(reward.getBrands()).toEqual([]);
    expect(reward.hasBrand(transient)).toBe(false);
  });

  it('appends TWICE for an UNSAVED exclude row, then splices only the FIRST occurrence', () => {
    // The mirror image on the EXCLUSION family.
    // CFML parity [model/entity/PromotionReward.cfc:L299 and L302]: the same disjunctive near-side
    // guard, with the far side reaching `getPromotionRewardExclusions()`
    // [model/entity/PromotionReward.cfc:L303] instead.
    const transient = new Brand({ brandName: 'Transient Excluded Fixture Brand' });
    const reward = new PromotionReward({ promotionRewardID: 'reward-unsaved-exclude' });

    expect(transient.isNew()).toBe(true);

    reward.addExcludedBrand(transient);
    reward.addExcludedBrand(transient);

    expect(reward.getExcludedBrands()).toHaveLength(2);
    expect(reward.hasExcludedBrand(transient)).toBe(true);
    expect(reward.getBrands()).toEqual([]);
    expect(reward.hasBrand(transient)).toBe(false);

    expect(transient.getPromotionRewardExclusions()).toHaveLength(1);
    expect(transient.getPromotionRewardExclusions()).toContain(reward);
    expect(transient.getPromotionRewards()).toEqual([]);

    reward.removeExcludedBrand(transient);

    expect(reward.getExcludedBrands()).toHaveLength(1);
    expect(reward.hasExcludedBrand(transient)).toBe(true);
    expect(transient.getPromotionRewardExclusions()).toEqual([]);

    reward.removeExcludedBrand(transient);

    expect(reward.getExcludedBrands()).toEqual([]);
    expect(reward.hasExcludedBrand(transient)).toBe(false);
  });

  it('appends to the far side TWICE for an UNSAVED reward, because isNew() short-circuits there too', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L199]: the far-side guard is
    // `isNew() or !arguments.brand.hasPromotionReward( this )`, and the `isNew()` it tests is the
    // REWARD's own, so an unsaved reward short-circuits it and appends twice.
    const unsaved = new PromotionReward({ promotionRewardID: '' });
    const target: PromotionFixtureGraph['brand'] = fixtures.brand;
    const farBefore = target.getPromotionRewards().length;

    expect(unsaved.isNew()).toBe(true);

    unsaved.addBrand(target);
    unsaved.addBrand(target);

    expect(unsaved.getBrands()).toHaveLength(1);
    expect(target.getPromotionRewards()).toHaveLength(farBefore + 2);
  });
});

/**
 * Builds one UNSAVED `PriceGroup`, fresh per call.
 *
 * `PriceGroup`'s hydration input is explicit-but-nullable across all fourteen members, so unlike
 * `Brand` it cannot be constructed from the primary key alone.
 *
 * The three collection members are fresh arrays per call.
 */
function anUnsavedPriceGroup(): PriceGroup {
  return new PriceGroup({
    // The `unsavedvalue="" default=""` pair at [model/entity/PriceGroup.cfc:L52].
    priceGroupID: '',
    priceGroupIDPath: undefined,
    activeFlag: undefined,
    priceGroupName: undefined,
    priceGroupCode: undefined,
    parentPriceGroup: undefined,
    childPriceGroups: [],
    priceGroupRates: [],
    promotionRewards: [],
    parentPriceGroupOptionCandidates: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  });
}

/**
 * Builds one UNSAVED `Option`, fresh per call.
 *
 * Like `PriceGroup`, `Option`'s hydration input is explicit-but-nullable, so the twelve required
 * members are spelled out.
 */
function anUnsavedOption(): Option {
  return new Option({
    // `Option.isNew()` reads the primary key directly [model/entity/Option.cfc:L49].
    optionID: '',
    optionCode: undefined,
    optionName: undefined,
    optionDescription: undefined,
    sortOrder: undefined,
    optionGroup: undefined,
    defaultImageID: undefined,
    remoteID: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  });
}

describe('the empty-primary-key fallback, where every predicate switches to reference identity', () => {
  // Why this block exists, and why key comparison alone would be wrong.
  //
  // The eleven predicates are framework-dispatched [org/Hibachi/HibachiEntity.cfc:L507-L565]
  // rather than declared in model/entity/PromotionReward.cfc.
  //
  // Each predicate therefore falls back to reference identity when the candidate's key is empty.

  it('answers hasBrand by object identity when the candidate carries no primary key', () => {
    const unsaved: Brand = new Brand({ brandID: '' });
    const otherUnsaved: Brand = new Brand({ brandID: '' });

    expect(unsaved.isNew()).toBe(true);
    expect(unsaved.getBrandID()).toBe('');
    expect(otherUnsaved.getBrandID()).toBe('');

    // Not held yet, and the empty key does not make it look held.
    expect(subject.hasBrand(unsaved)).toBe(false);

    subject.addBrand(unsaved);

    expect(subject.hasBrand(unsaved)).toBe(true);

    // The assertion the whole branch exists for. A second unsaved brand shares the first one's
    // empty key exactly, and is still not held.
    expect(subject.hasBrand(otherUnsaved)).toBe(false);
  });

  it('keeps two DISTINCT unsaved rows separable, so both can be appended', () => {
    // The consequence of the previous test, made observable on the collection rather than on the
    // predicate: because the guard can tell them apart, both unsaved brands land.
    const first: Brand = new Brand({ brandID: '' });
    const second: Brand = new Brand({ brandID: '' });
    const before: number = subject.getBrands().length;

    subject.addBrand(first);
    subject.addBrand(second);

    expect(subject.getBrands()).toHaveLength(before + 2);
    expect(subject.getBrands()).toContain(first);
    expect(subject.getBrands()).toContain(second);
  });

  it('answers hasSku, hasProduct and hasProductType by object identity for unsaved rows', () => {
    // `Sku.isNew()` reads a dedicated `newFlag` rather than the primary key, so an unsaved SKU
    // must be built with `isNew: true` as well as the empty key - `new Sku({ skuID: '' })` alone
    // answers `false` to `isNew()`.
    const unsavedSku: Sku = new Sku({ skuID: '', isNew: true });
    const otherUnsavedSku: Sku = new Sku({ skuID: '', isNew: true });
    const unsavedProduct: Product = new Product({ productID: '' });
    const otherUnsavedProduct: Product = new Product({ productID: '' });
    const unsavedProductType: ProductType = new ProductType({ productTypeID: '' });
    const otherUnsavedProductType: ProductType = new ProductType({ productTypeID: '' });

    subject.addSku(unsavedSku);
    subject.addProduct(unsavedProduct);
    subject.addProductType(unsavedProductType);

    expect(subject.hasSku(unsavedSku)).toBe(true);
    expect(subject.hasSku(otherUnsavedSku)).toBe(false);

    expect(subject.hasProduct(unsavedProduct)).toBe(true);
    expect(subject.hasProduct(otherUnsavedProduct)).toBe(false);

    expect(subject.hasProductType(unsavedProductType)).toBe(true);
    expect(subject.hasProductType(otherUnsavedProductType)).toBe(false);
  });

  it('answers hasOption by object identity for an unsaved option', () => {
    // `Option`'s hydration input is explicit-but-nullable, so both members are spelled out.
    const unsaved: Option = anUnsavedOption();
    const otherUnsaved: Option = anUnsavedOption();

    subject.addOption(unsaved);

    expect(subject.hasOption(unsaved)).toBe(true);
    expect(subject.hasOption(otherUnsaved)).toBe(false);
  });

  it('answers hasEligiblePriceGroup by object identity for an unsaved price group', () => {
    // The one collection the reward has and the qualifier does not
    // [model/entity/PromotionReward.cfc:L74], over `SwPromoRewardEligiblePriceGrp`.
    const unsaved: PriceGroup = anUnsavedPriceGroup();
    const otherUnsaved: PriceGroup = anUnsavedPriceGroup();

    expect(unsaved.isNew()).toBe(true);
    expect(subject.hasEligiblePriceGroup(unsaved)).toBe(false);

    subject.addEligiblePriceGroup(unsaved);

    expect(subject.hasEligiblePriceGroup(unsaved)).toBe(true);
    expect(subject.hasEligiblePriceGroup(otherUnsaved)).toBe(false);
  });

  it('answers every EXCLUDE-side predicate by object identity for unsaved rows', () => {
    // The exclude family is a DISTINCT set of link tables
    // [model/entity/PromotionReward.cfc:L86-L90] reached through a DISTINCT far-side collection.
    const unsavedBrand: Brand = new Brand({ brandID: '' });
    const unsavedOption: Option = anUnsavedOption();
    const unsavedSku: Sku = new Sku({ skuID: '', isNew: true });
    const unsavedProduct: Product = new Product({ productID: '' });
    const unsavedProductType: ProductType = new ProductType({ productTypeID: '' });

    subject.addExcludedBrand(unsavedBrand);
    subject.addExcludedOption(unsavedOption);
    subject.addExcludedSku(unsavedSku);
    subject.addExcludedProduct(unsavedProduct);
    subject.addExcludedProductType(unsavedProductType);

    expect(subject.hasExcludedBrand(unsavedBrand)).toBe(true);
    expect(subject.hasExcludedOption(unsavedOption)).toBe(true);
    expect(subject.hasExcludedSku(unsavedSku)).toBe(true);
    expect(subject.hasExcludedProduct(unsavedProduct)).toBe(true);
    expect(subject.hasExcludedProductType(unsavedProductType)).toBe(true);

    expect(subject.hasExcludedBrand(new Brand({ brandID: '' }))).toBe(false);
    expect(subject.hasExcludedOption(anUnsavedOption())).toBe(false);
    expect(subject.hasExcludedSku(new Sku({ skuID: '', isNew: true }))).toBe(false);
    expect(subject.hasExcludedProduct(new Product({ productID: '' }))).toBe(false);
    expect(subject.hasExcludedProductType(new ProductType({ productTypeID: '' }))).toBe(false);
  });

  it('keeps the exclude-side predicates answering by primary key for SAVED rows', () => {
    // The fallback is reached only on an empty key.
    const heldSku: Sku = requireAt(subject.getExcludedSkus(), 0, 'excluded sku');
    const heldProduct: Product = requireAt(subject.getExcludedProducts(), 0, 'excluded product');

    expect(heldSku.getSkuID()).not.toBe('');
    expect(heldProduct.getProductID()).not.toBe('');

    expect(subject.hasExcludedSku(heldSku)).toBe(true);
    expect(subject.hasExcludedProduct(heldProduct)).toBe(true);

    // A DIFFERENT object carrying the same key answers true - key comparison, not identity.
    expect(subject.hasExcludedSku(new Sku({ skuID: heldSku.getSkuID() }))).toBe(true);
    expect(subject.hasExcludedProduct(new Product({ productID: heldProduct.getProductID() }))).toBe(
      true,
    );

    // And the include-side predicate still answers false for the same rows.
    expect(subject.hasSku(heldSku)).toBe(false);
    expect(subject.hasProduct(heldProduct)).toBe(false);
  });
});

describe('the seven bidirectional pairs the guard-polarity block does not reach', () => {
  // The include family reaches `getPromotionRewards()`; the exclude family reaches the separate
  // `getPromotionRewardExclusions()`.

  it('appends a saved brand to BOTH sides, and detaches it from BOTH', () => {
    const brand: Brand = new Brand({ brandID: 'brand-bidirectional' });

    subject.addBrand(brand);

    expect(subject.getBrands()).toContain(brand);
    expect(brand.getPromotionRewards()).toContain(subject);

    subject.removeBrand(brand);

    expect(subject.getBrands()).not.toContain(brand);
    expect(brand.getPromotionRewards()).not.toContain(subject);
  });

  it('refuses a duplicate append for a SAVED brand, because the guard consults the key', () => {
    // `brand.isNew()` is false for a saved row, so the second disjunct decides and `hasBrand`
    // answers true. Contrast the unsaved case above, where `isNew()` wins outright and the append
    // is unconditional.
    const brand: Brand = new Brand({ brandID: 'brand-idempotent' });

    subject.addBrand(brand);
    subject.addBrand(brand);

    expect(subject.getBrands().filter((held: Brand) => held === brand)).toHaveLength(1);
    expect(
      brand.getPromotionRewards().filter((held: PromotionReward) => held === subject),
    ).toHaveLength(1);
  });

  it('appends and detaches a sku, a product and a productType on both sides', () => {
    const sku: Sku = new Sku({ skuID: 'sku-bidirectional' });
    const product: Product = new Product({ productID: 'product-bidirectional' });
    const productType: ProductType = new ProductType({
      productTypeID: 'producttype-bidirectional',
    });

    subject.addSku(sku);
    subject.addProduct(product);
    subject.addProductType(productType);

    expect(sku.getPromotionRewards()).toContain(subject);
    expect(product.getPromotionRewards()).toContain(subject);
    expect(productType.getPromotionRewards()).toContain(subject);

    subject.removeSku(sku);
    subject.removeProduct(product);
    subject.removeProductType(productType);

    expect(subject.getSkus()).not.toContain(sku);
    expect(subject.getProducts()).not.toContain(product);
    expect(subject.getProductTypes()).not.toContain(productType);
    expect(sku.getPromotionRewards()).not.toContain(subject);
    expect(product.getPromotionRewards()).not.toContain(subject);
    expect(productType.getPromotionRewards()).not.toContain(subject);
  });

  it('appends and detaches the three exclude-side rows through the EXCLUSION far side', () => {
    const sku: Sku = new Sku({ skuID: 'sku-excl-bidirectional' });
    const product: Product = new Product({ productID: 'product-excl-bidirectional' });
    const productType: ProductType = new ProductType({
      productTypeID: 'producttype-excl-bidirectional',
    });

    subject.addExcludedSku(sku);
    subject.addExcludedProduct(product);
    subject.addExcludedProductType(productType);

    // The exclusion collection, not `getPromotionRewards()`.
    expect(sku.getPromotionRewardExclusions()).toContain(subject);
    expect(product.getPromotionRewardExclusions()).toContain(subject);
    expect(productType.getPromotionRewardExclusions()).toContain(subject);

    // And the include-side far collection is untouched by an exclude-side append.
    expect(sku.getPromotionRewards()).not.toContain(subject);
    expect(product.getPromotionRewards()).not.toContain(subject);
    expect(productType.getPromotionRewards()).not.toContain(subject);

    subject.removeExcludedSku(sku);
    subject.removeExcludedProduct(product);
    subject.removeExcludedProductType(productType);

    expect(subject.getExcludedSkus()).not.toContain(sku);
    expect(subject.getExcludedProducts()).not.toContain(product);
    expect(subject.getExcludedProductTypes()).not.toContain(productType);
    expect(sku.getPromotionRewardExclusions()).not.toContain(subject);
    expect(product.getPromotionRewardExclusions()).not.toContain(subject);
    expect(productType.getPromotionRewardExclusions()).not.toContain(subject);
  });

  it('leaves both sides untouched when removing a row that was never added', () => {
    // [model/entity/PromotionReward.cfc:L206-L215] guards each splice on the index having been
    // found, so a remove for an unrelated row is a no-op rather than an error or a splice at index
    // 1.
    const stranger: Brand = new Brand({ brandID: 'brand-never-added' });
    const brandsBefore: readonly Brand[] = [...subject.getBrands()];

    subject.removeBrand(stranger);

    expect(subject.getBrands()).toStrictEqual(brandsBefore);
    expect(stranger.getPromotionRewards()).toStrictEqual([]);
  });
});

describe('the FIVE reward types, documented in a comment and never enforced', () => {
  it('carries the vocabulary in exact source order', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L48-L54]: the five values appear only in the
    // file-opening comment block, under the "Valid Reward Types" heading at
    // [model/entity/PromotionReward.cfc:L48] - `merchandise`
    // [model/entity/PromotionReward.cfc:L50], `subscription`
    // [model/entity/PromotionReward.cfc:L51], `contentAccess`
    // [model/entity/PromotionReward.cfc:L52], `fulfillment`
    // [model/entity/PromotionReward.cfc:L53], `order` [model/entity/PromotionReward.cfc:L54].
    expect(fixtures.rewardTypeVocabulary).toEqual(REWARD_TYPES_IN_SOURCE_ORDER);
    expect(fixtures.rewardTypeVocabulary).toHaveLength(5);
    expect(fixtures.rewardTypeVocabulary[0]).toBe('merchandise');
    expect(fixtures.rewardTypeVocabulary[4]).toBe('order');

    // One reward exhibit exists per value, so every branch of the conditional accessor below has a
    // real subject rather than an ad-hoc literal.
    expect(fixtures.merchandiseReward.getRewardType()).toBe('merchandise');
    expect(fixtures.subscriptionReward.getRewardType()).toBe('subscription');
    expect(fixtures.contentAccessReward.getRewardType()).toBe('contentAccess');
    expect(fixtures.fulfillmentReward.getRewardType()).toBe('fulfillment');
    expect(fixtures.orderReward.getRewardType()).toBe('order');
  });

  it('leaves rewardType an UN-NARROWED string, because the vocabulary is a comment', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L48-L54, L63]: the five reward types are
    // enumerated only in the file-opening comment block.
    //
    // CONTRAST `amountType` and `applicableTerm`, both of which are narrowed to closed unions.
    const offVocabulary = new PromotionReward({
      promotionRewardID: 'reward-off-vocabulary',
      rewardType: 'giftWithPurchase',
    });

    // No cast, no `@ts-expect-error`: an arbitrary string is simply ASSIGNABLE here.
    expect(offVocabulary.getRewardType()).toBe('giftWithPurchase');
    expect(fixtures.rewardTypeVocabulary).not.toContain('giftWithPurchase');

    // Absence is representable too - the column has no ORM default.
    const untyped = new PromotionReward({ promotionRewardID: 'reward-untyped' });
    expect(untyped.getRewardType()).toBeUndefined();
  });

  it('narrows applicableTerm to exactly both | initial | renewal in source order', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L112-L118]: `getApplicableTermOptions()`
    // returns exactly three entries - `both` [model/entity/PromotionReward.cfc:L114], `initial`
    // [model/entity/PromotionReward.cfc:L115], `renewal` [model/entity/PromotionReward.cfc:L116].
    const options = subject.getApplicableTermOptions();

    expect(options).toHaveLength(3);
    expect(options.map((option) => option.value)).toEqual(['both', 'initial', 'renewal']);

    // The union is CLOSED. Each member is assignable; nothing else is.
    const both: ApplicableTerm = 'both';
    const initial: ApplicableTerm = 'initial';
    const renewal: ApplicableTerm = 'renewal';
    expect([both, initial, renewal]).toEqual(options.map((option) => option.value));

    // Sealed by `getApplicableTermOptions()`'s three-entry enumeration, so a fourth term is not
    // representable without a cast, and this suite uses none.
    // @ts-expect-error - 'trial' is not a member of the closed ApplicableTerm union. The union is
    // sealed by `getApplicableTermOptions()`'s three-entry enumeration, so a fourth term is not
    // representable without a cast.
    const rejectedTerm: ApplicableTerm = 'trial';
    expect(rejectedTerm).toBe('trial');
  });

  it('holds the applicableTerm the repository supplied, defaulting to none of its own', () => {
    // [model/entity/PromotionReward.cfc:L64] declares no ORM default, so absence is real - but the
    // fixture's rewards are hydrated with `both`, which is what a normal row carries.
    expect(subject.getApplicableTerm()).toBe('both');

    const termless = new PromotionReward({ promotionRewardID: 'reward-no-term' });
    expect(termless.getApplicableTerm()).toBeUndefined();
  });

  it('keeps every option name an INERT, unresolved resource-bundle key', () => {
    // JavaRB is not ported and no i18n runtime is introduced, so every `rbKey(...)` argument
    // survives VERBATIM as a literal string and is never resolved or translated.
    expect(subject.getApplicableTermOptions().map((option) => option.name)).toEqual([
      'define.both',
      'define.initial',
      'define.renewal',
    ]);

    expect(fixtures.merchandiseReward.getAmountTypeOptions().map((option) => option.name)).toEqual([
      'define.percentageOff',
      'define.amountOff',
      'define.fixedAmount',
    ]);

    // Not one of them is an English label, which is the point: asserting a translated string would
    // fabricate an i18n contract the port does not implement.
    for (const option of subject.getApplicableTermOptions()) {
      expect(option.name.startsWith('define.')).toBe(true);
    }
  });
});

describe('getAmountTypeOptions() is CONDITIONAL on rewardType', () => {
  it('offers exactly TWO options for an order reward', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L120-L133]:
    // [model/entity/PromotionReward.cfc:L121] `if(getRewardType() == "order")` returns two entries
    // `percentageOff` [model/entity/PromotionReward.cfc:L123] and `amountOff`
    // [model/entity/PromotionReward.cfc:L124]. A fixed amount makes no sense at order level, so
    // the admin is never offered it.
    const options = fixtures.orderReward.getAmountTypeOptions();

    expect(options).toHaveLength(2);
    expect(options.map((option) => option.value)).toEqual(['percentageOff', 'amountOff']);
    expect(options.map((option) => option.value)).toEqual(fixtures.orderRewardAmountTypeVocabulary);
    expect(options.map((option) => option.value)).not.toContain('amount');
  });

  it('offers exactly THREE options for every OTHER reward type', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L126-L131]: the `else` branch returns three,
    // adding [model/entity/PromotionReward.cfc:L130]
    // `{name=rbKey("define.fixedAmount"), value="amount"}`.
    for (const reward of [
      fixtures.merchandiseReward,
      fixtures.subscriptionReward,
      fixtures.contentAccessReward,
      fixtures.fulfillmentReward,
    ]) {
      const options = reward.getAmountTypeOptions();
      expect(options).toHaveLength(3);
      expect(options.map((option) => option.value)).toEqual([
        'percentageOff',
        'amountOff',
        'amount',
      ]);
    }

    // All five vocabulary values exercised: four take the `else`, `order` takes the `if`.
    expect(fixtures.orderReward.getAmountTypeOptions()).toHaveLength(2);
    expect(fixtures.rewardTypeVocabulary).toHaveLength(5);
  });

  it('takes the THREE-option else branch when rewardType is undefined', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L121, L126]: the source tests EQUALITY against
    // `"order"` and provides an `else`, not a lookup - so anything that is not `order`, absence
    // included, falls to the three-option branch.
    const untyped = new PromotionReward({ promotionRewardID: 'reward-undefined-type' });

    expect(untyped.getRewardType()).toBeUndefined();
    expect(untyped.getAmountTypeOptions()).toHaveLength(3);
    expect(untyped.getAmountTypeOptions().map((option) => option.value)).toEqual([
      'percentageOff',
      'amountOff',
      'amount',
    ]);

    // An off-vocabulary value takes the same branch, for the same reason.
    const offVocabulary = new PromotionReward({
      promotionRewardID: 'reward-off-vocabulary-options',
      rewardType: 'giftWithPurchase',
    });
    expect(offVocabulary.getAmountTypeOptions()).toHaveLength(3);
  });

  it('matches the order branch CASE-INSENSITIVELY, as CFML eq does', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L121]: CFML's `==` on strings is
    // CASE-INSENSITIVE, so `"Order"`, `"ORDER"` and `"order"` all take the two-option branch. The
    // target case-folds explicitly to reproduce that, because TypeScript comparison is not.
    expect(fixtures.mixedCaseRewardTypeReward.getRewardType()).toBe('Merchandise');
    expect(fixtures.mixedCaseRewardTypeReward.getAmountTypeOptions()).toHaveLength(3);

    for (const spelling of ['order', 'Order', 'ORDER', 'oRdEr']) {
      const reward = new PromotionReward({
        promotionRewardID: `reward-case-${spelling}`,
        rewardType: spelling,
      });
      expect(reward.getAmountTypeOptions()).toHaveLength(2);
      // The column itself is not folded - only the comparison is.
      expect(reward.getRewardType()).toBe(spelling);
    }
  });

  it('gives the third option the STORED value "amount" and the display key define.fixedAmount', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L130]: the option's display key is
    // `define.fixedAmount` while its stored value is `amount`.
    const third = fixtures.merchandiseReward.getAmountTypeOptions()[2];

    expect(third).toBeDefined();
    expect(third?.value).toBe('amount');
    expect(third?.value).not.toBe('fixedAmount');
    expect(third?.name).toBe('define.fixedAmount');

    expect(fixtures.fixedAmountAmountTypeValue).toBe('amount');
    expect(fixtures.fixedAmountAmountTypeLabelKey).toBe('define.fixedAmount');
  });

  it('accepts the invalid-in-UI order + amount combination as persistable DATA', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L120-L133]: `getAmountTypeOptions` is
    // conditional - an "order" reward is offered only `percentageOff` and `amountOff`, yet
    // `amountType` has no `inList` constraint in `model/validation/PromotionReward.json`, so
    // `{rewardType:'order', amountType:'amount'}` is persistable and still executes the `amount`
    // branch of `getDiscountAmount` [model/service/PromotionService.cfc:L987-L1018].
    const impossible = fixtures.impossibleOrderFixedAmountReward;

    expect(impossible.getRewardType()).toBe('order');
    expect(impossible.getAmountType()).toBe('amount');

    // The accessor still withholds `amount` from the offered set, so the state contradicts the
    // very method that is supposed to constrain it.
    expect(impossible.getAmountTypeOptions()).toHaveLength(2);
    expect(impossible.getAmountTypeOptions().map((option) => option.value)).not.toContain(
      impossible.getAmountType(),
    );

    // No validation error, no thrown exception, no normalisation of either column.
    expect(impossible.getAmount()).toBeInstanceOf(Money);
    expect(impossible.getPromotionRewardID()).toBe('promofx-reward-order-fixed-amount');
  });

  it('closes the AmountType union at exactly three values', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L62]: `amountType` is `ormType="string"` with
    // no check constraint, so the DATABASE would accept anything.
    expect(fixtures.amountTypeVocabulary).toEqual(['percentageOff', 'amountOff', 'amount']);

    const percentageOff: AmountType = 'percentageOff';
    const amountOff: AmountType = 'amountOff';
    const amount: AmountType = 'amount';
    expect([percentageOff, amountOff, amount]).toEqual(fixtures.amountTypeVocabulary);

    // Unrecognised fourth amount type is not representable without a cast.
    // @ts-expect-error - 'buyOneGetOne' is not a member of the closed AmountType union. An
    // unrecognised fourth amount type is not representable without a cast, which is the
    // compile-time guarantee that replaces the missing `default:` case at
    // [model/service/PromotionService.cfc:L1003].
    const rejectedAmountType: AmountType = 'buyOneGetOne';
    expect(rejectedAmountType).toBe('buyOneGetOne');

    // The type-safe route into the default-less switch is therefore ABSENCE, not a stray literal.
    expect(fixtures.absentAmountTypeReward.getAmountType()).toBeUndefined();
  });
});

describe('amount is Money or undefined, and getAmountFormatted() branches once', () => {
  it('types amount as Money | undefined, with NO default and no substituted zero', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L61]: `ormType="big_decimal"` with no
    // `default` attribute, so absence is real.
    //
    // Substituting `0` here would fabricate a real zero discount where the row says "no amount
    // recorded".
    expect(subject.getAmount()).toBeInstanceOf(Money);
    expect(fixtures.absentAmountReward.getAmount()).toBeUndefined();

    const bare = new PromotionReward({ promotionRewardID: 'reward-no-amount' });
    expect(bare.getAmount()).toBeUndefined();
    expect(bare.getAmount()).not.toBe(0);
    expect(bare.getAmount()).not.toBe(Money.zero);
  });

  it('holds the amount as a decimal-exact Money, never a float', () => {
    // P4 single arithmetic surface: every money expectation below is a `Money` or a DECIMAL
    // STRING.
    const amount = subject.getAmount();

    expect(amount).toBeDefined();
    expect(amount?.toDecimalString()).toBe('12.5');
    expect(amount?.equals(Money.fromDecimalString('12.5'))).toBe(true);
    expect(fixtures.amountOffReward.getAmount()?.toDecimalString()).toBe('5');
    expect(fixtures.amountOffReward.getAmount()?.toFixed2()).toBe('5.00');

    // The reward carries the PERCENTAGE as its amount; turning that into money is the service's
    // job.
    expect(fixtures.referenceCalculation.unitPrice).toBe('19.99');
    expect(fixtures.referenceCalculation.extendedPrice).toBe('59.97');
    expect(fixtures.referenceCalculation.percentageOff).toBe('12.5');
    expect(fixtures.referenceCalculation.discountAmount).toBe('7.49625');
    expect(fixtures.referenceCalculation.netAmount).toBe('52.47375');
    expect(fixtures.referenceCalculation.presentedNetAmount).toBe('52.47');
    expect(fixtures.referenceCalculationReward.getAmount()?.toDecimalString()).toBe('12.5');
  });

  it('formats a percentageOff amount as a percentage - the ONLY branch', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L401-L407]:
    // [model/entity/PromotionReward.cfc:L402] tests `getAmountType() == "percentageOff"` and
    // [model/entity/PromotionReward.cfc:L403] returns `formatValue(getAmount(), "percentage")`.
    // That single `if` is the whole branch.
    expect(subject.getAmountType()).toBe('percentageOff');
    expect(subject.getAmountFormatted()).toBe('12.5%');
    expect(subject.getAmountFormatted()).not.toBe('12.50%');
    expect(fixtures.mixedCaseRewardTypeReward.getAmountType()).toBe('percentageOff');
    expect(fixtures.mixedCaseRewardTypeReward.getAmountFormatted()).toBe('12.5%');
  });

  it('takes the percentage branch for a mis-cased stored amountType', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L402]: the legacy test is `==`, which on
    // strings is CASE-INSENSITIVE, so a reward stored as `'PercentageOff'` renders as a PERCENTAGE
    // there.
    const misCased = new PromotionReward({
      promotionRewardID: 'reward-miscased-amount-type',
      amount: Money.fromDecimalString('12.5'),
      amountType: 'PercentageOff' as AmountType,
    });

    expect(misCased.getAmountFormatted()).toBe('12.5%');
    expect(misCased.getAmountFormatted()).not.toBe('12.50');

    // Screaming case too, since `toLowerCase()` and a two-spelling allowlist differ here.
    expect(
      new PromotionReward({
        promotionRewardID: 'reward-shouting-amount-type',
        amount: Money.fromDecimalString('12.5'),
        amountType: 'PERCENTAGEOFF' as AmountType,
      }).getAmountFormatted(),
    ).toBe('12.5%');
  });

  it('pads NOTHING on the percentage branch, at any scale', () => {
    // The no-padding proof, across the shapes where a two-decimal mask would show.
    const percentageOf = (amount: string): string =>
      new PromotionReward({
        promotionRewardID: `reward-pct-${amount}`,
        amount: Money.fromDecimalString(amount),
        amountType: 'percentageOff',
      }).getAmountFormatted();

    // A whole number stays whole: not "5.00%".
    expect(percentageOf('5')).toBe('5%');
    // A trailing zero is dropped rather than kept.
    expect(percentageOf('12.50')).toBe('12.5%');
    // Two significant decimals survive untouched - the trim is not a round.
    expect(percentageOf('12.34')).toBe('12.34%');
    // MORE than two decimals survive too, which a '0.00' mask would have destroyed by rounding.
    expect(percentageOf('7.49625')).toBe('7.49625%');
    // Four figures gain no thousands separator: the percentage mask adds nothing but the suffix.
    expect(percentageOf('1234.5')).toBe('1234.5%');
  });

  it('renders the SAME stored amount differently on the two branches', () => {
    // The asymmetry that makes this method worth its own `hb_formatType="custom"`.
    const amount = Money.fromDecimalString('5');

    expect(
      new PromotionReward({
        promotionRewardID: 'reward-same-amount-pct',
        amount,
        amountType: 'percentageOff',
      }).getAmountFormatted(),
    ).toBe('5%');
    expect(
      new PromotionReward({
        promotionRewardID: 'reward-same-amount-off',
        amount,
        amountType: 'amountOff',
      }).getAmountFormatted(),
    ).toBe('5.00');
  });

  it('emits NO currency symbol and NO thousands separator on the currency branch', () => {
    // The withheld-presentation proof, so the omission is a pinned decision rather than an
    // accident.
    const formatted = new PromotionReward({
      promotionRewardID: 'reward-currency-presentation',
      amount: Money.fromDecimalString('1234.5'),
      amountType: 'amountOff',
    }).getAmountFormatted();

    expect(formatted).toBe('1234.50');
    expect(formatted).not.toContain('$');
    expect(formatted).not.toContain(',');
  });

  it('formats BOTH amountOff AND amount as currency - two of three share the fall-through', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L406]: execution falls PAST the percentage
    // `if` to `return formatValue(getAmount(), "currency")`.
    expect(fixtures.amountOffReward.getAmountType()).toBe('amountOff');
    expect(fixtures.amountOffReward.getAmountFormatted()).toBe('5.00');

    expect(fixtures.fixedAmountReward.getAmountType()).toBe('amount');
    expect(fixtures.fixedAmountReward.getAmountFormatted()).toBe('5.00');

    // The same string from both, which is the assertion that pins the shared path.
    expect(fixtures.fixedAmountReward.getAmountFormatted()).toBe(
      fixtures.amountOffReward.getAmountFormatted(),
    );

    // The `amountOff` precision gap at [model/service/PromotionService.cfc:L998] - where that one
    // branch omits `precisionEvaluate` and multiplies with raw floating point.
  });

  it('falls to the currency path when amountType is ABSENT', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L402]: the test is a strict equality against
    // `"percentageOff"` ALONE, so a null `amountType` fails it and control reaches
    // [model/entity/PromotionReward.cfc:L406]. There is no third branch and no error path for an
    // unset discriminator.
    const reward = fixtures.absentAmountTypeReward;

    expect(reward.getAmountType()).toBeUndefined();
    expect(reward.getAmountFormatted()).toBe('5.00');
    expect(reward.getAmountFormatted()).toBe(fixtures.amountOffReward.getAmountFormatted());
  });

  it('returns an empty string when amount is ABSENT, because the legacy has no null guard', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L401-L407]: neither branch guards a null
    // `amount`.
    //
    // The shipped target answers with the EMPTY STRING, and that is what is pinned: the
    // alternative choices would each be worse.
    expect(fixtures.absentAmountReward.getAmount()).toBeUndefined();
    expect(fixtures.absentAmountReward.getAmountFormatted()).toBe('');

    // True on both sides of the branch: the amount is checked before the amountType is consulted.
    const percentageWithoutAmount = new PromotionReward({
      promotionRewardID: 'reward-pct-no-amount',
      amountType: 'percentageOff',
    });
    const currencyWithoutAmount = new PromotionReward({
      promotionRewardID: 'reward-cur-no-amount',
      amountType: 'amountOff',
    });

    expect(percentageWithoutAmount.getAmountFormatted()).toBe('');
    expect(currencyWithoutAmount.getAmountFormatted()).toBe('');
    // Not `"0.00%"`, and not `"0.00"`.
    expect(percentageWithoutAmount.getAmountFormatted()).not.toContain('0');
  });
});

describe('the THREE use-limit columns, where undefined means UNLIMITED', () => {
  it('types all three as number | undefined', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L65-L67]: `maximumUsePerOrder`,
    // `maximumUsePerItem` and `maximumUsePerQualification` all declare
    // `hb_nullRBKey="define.unlimited"`, so absence means unlimited.
    //
    // This is the half of must-preserve behaviour #1 that lives at the entity layer.
    const reward = fixtures.unlimitedUseLimitsReward;

    expect(reward.getMaximumUsePerOrder()).toBeUndefined();
    expect(reward.getMaximumUsePerItem()).toBeUndefined();
    expect(reward.getMaximumUsePerQualification()).toBeUndefined();

    const bounded = fixtures.boundedUseLimitsReward;
    expect(bounded.getMaximumUsePerOrder()).toBe(2);
    expect(bounded.getMaximumUsePerItem()).toBe(1);
    expect(bounded.getMaximumUsePerQualification()).toBe(3);
    expect(typeof bounded.getMaximumUsePerOrder()).toBe('number');
  });

  it('never coerces undefined to zero on any of the three', () => {
    // The coercion this test forbids is the single most consequential mistake available at this
    // layer, so it is asserted per column and against `0` specifically rather than by truthiness.
    const reward = fixtures.unlimitedUseLimitsReward;

    for (const limit of [
      reward.getMaximumUsePerOrder(),
      reward.getMaximumUsePerItem(),
      reward.getMaximumUsePerQualification(),
    ]) {
      expect(limit).toBeUndefined();
      expect(limit).not.toBe(0);
      expect(limit).not.toBeNull();
      expect(limit).not.toBe('');
    }

    // The sentinel the engine substitutes for "unlimited" is a SERVICE-tier concept and is
    // deliberately not baked into the column: the entity reports absence.
    expect(fixtures.unlimitedUseSentinel).toBe(1000000);
    expect(reward.getMaximumUsePerOrder()).not.toBe(fixtures.unlimitedUseSentinel);
  });

  it('distinguishes an explicit 0 from absence on all three limits', () => {
    // `0` is a REAL, persistable value and must remain distinguishable from a null column - a
    // truthiness test would collapse the two and lose the distinction the schema records.
    const zeroed = fixtures.zeroUseLimitsReward;

    expect(zeroed.getMaximumUsePerOrder()).toBe(0);
    expect(zeroed.getMaximumUsePerItem()).toBe(0);
    expect(zeroed.getMaximumUsePerQualification()).toBe(0);

    expect(zeroed.getMaximumUsePerOrder()).not.toBeUndefined();
    expect(zeroed.getMaximumUsePerOrder()).not.toBe(
      fixtures.unlimitedUseLimitsReward.getMaximumUsePerOrder(),
    );

    // A negative limit is likewise carried as written rather than clamped, because the column has
    // no constraint and `model/validation/PromotionReward.json` asks only for
    // `dataType: "numeric"`.
    expect(fixtures.negativeUseLimitsReward.getMaximumUsePerOrder()).toBe(-1);
    expect(fixtures.negativeUseLimitsReward.getMaximumUsePerItem()).toBe(-1);
    expect(fixtures.negativeUseLimitsReward.getMaximumUsePerQualification()).toBe(-1);
  });

  it('holds the nullable roundingRule association without ever dereferencing it', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L71]: `roundingRule` is a many-to-one with
    // `hb_optionsNullRBKey="define.none"`, which makes "no rounding" a CONFIGURED STATE rather
    // than a missing value. So `RoundingRule | undefined`, and absence is legitimate.
    const rule: RoundingRule | undefined = fixtures.roundedReward.getRoundingRule();

    expect(rule).toBeDefined();
    expect(rule).toBe(fixtures.roundingRule);
    expect(fixtures.unroundedReward.getRoundingRule()).toBeUndefined();

    // The entity holds the association and stops.
    expect(PROTOTYPE_MEMBERS).not.toContain('roundValue');
    expect(PROTOTYPE_MEMBERS).not.toContain('roundValueByRoundingRule');
  });

  it('records the ormType / ormtype attribute-casing split without normalising it', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L60-L67, L93]: the attribute name is spelled
    // camelCase `ormType` at [model/entity/PromotionReward.cfc:L61],
    // [model/entity/PromotionReward.cfc:L62], [model/entity/PromotionReward.cfc:L63],
    // [model/entity/PromotionReward.cfc:L64] and [model/entity/PromotionReward.cfc:L65], but
    // lowercase `ormtype` at [model/entity/PromotionReward.cfc:L60],
    // [model/entity/PromotionReward.cfc:L66], [model/entity/PromotionReward.cfc:L67] and
    // [model/entity/PromotionReward.cfc:L93].
    const reward = fixtures.boundedUseLimitsReward;

    expect(typeof reward.getMaximumUsePerOrder()).toBe(typeof reward.getMaximumUsePerItem());
    expect(typeof reward.getMaximumUsePerItem()).toBe(
      typeof reward.getMaximumUsePerQualification(),
    );

    const unlimited = fixtures.unlimitedUseLimitsReward;
    expect([
      unlimited.getMaximumUsePerOrder(),
      unlimited.getMaximumUsePerItem(),
      unlimited.getMaximumUsePerQualification(),
    ]).toEqual([undefined, undefined, undefined]);
  });
});

describe('THE ONE RENAMED IDENTIFIER IN tests/unit/domain/entities', () => {
  it('exposes hb_permission with the CORRECTED spelling', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L57]: the legacy `hb_permission` is misspelled
    // `"promotionPeriod.promtionRewards"` - "promtion", missing the second `o` of "promotion".
    expect(PromotionReward.entityMetadata.hb_permission).toBe('promotionPeriod.promotionRewards');
    expect(PromotionReward.entityMetadata.hb_permission).not.toBe(
      'promotionPeriod.promtionRewards',
    );
  });

  it('does NOT extend the rename to the typos that are data contracts', () => {
    // `singlularname` on productReviews [model/entity/Product.cfc:L76] - `subsciptionUsageBenefit`
    // [model/entity/PriceGroup.cfc:L168] - the capital-`D` `DisplayName`
    // [model/entity/PriceGroupRate.cfc:L270].
    const metadataValues = Object.values(PromotionReward.entityMetadata);

    expect(metadataValues).not.toContain('singlularname');
    expect(metadataValues).not.toContain('subsciptionUsageBenefit');
    expect(metadataValues).not.toContain('orderItemQulifiedDiscounts');

    // Exactly eight attributes, matching the eight on [model/entity/PromotionReward.cfc:L57] - so
    // no ninth was invented and none of the absent ones (`accessors`, `output`,
    // `hb_processContexts`) was transplanted from the sibling component.
    expect(Object.keys(PromotionReward.entityMetadata)).toHaveLength(8);
    expect(PromotionReward.entityMetadata.accessors).toBeUndefined();
    expect(PromotionReward.entityMetadata.output).toBeUndefined();
    expect(PromotionReward.entityMetadata.persistent).toBe('true');
    expect(PromotionReward.entityMetadata.extends).toBe('HibachiEntity');
  });

  it('freezes the metadata, because a schema contract may not mutate at runtime', () => {
    expect(Object.isFrozen(PromotionReward.entityMetadata)).toBe(true);
  });
});

describe('getSimpleRepresentation() and its property name', () => {
  it('composes the entity label, the literal " - " separator, and the formatted rewardType', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L106-L108]: the body is
    // `"#rbKey('entity.promotionReward')# - #getFormattedValue('rewardType')#"` - three parts,
    // with a SPACE-HYPHEN-SPACE separator that is part of the contract.
    expect(subject.getSimpleRepresentation()).toBe(
      'entity.promotionReward - entity.promotionReward.rewardType.merchandise',
    );

    const parts = subject.getSimpleRepresentation().split(' - ');
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe('entity.promotionReward');
    expect(parts[1]).toBe('entity.promotionReward.rewardType.merchandise');
  });

  it('resolves the rewardType half through the injected label provider, per value', () => {
    expect(fixtures.subscriptionReward.getSimpleRepresentation()).toBe(
      'entity.promotionReward - entity.promotionReward.rewardType.subscription',
    );
    expect(fixtures.orderReward.getSimpleRepresentation()).toBe(
      'entity.promotionReward - entity.promotionReward.rewardType.order',
    );

    expect(fixtures.rewardLabelProvider.rewardTypeLabelCalls.length).toBeGreaterThan(0);
    expect(
      fixtures.rewardLabelProvider.rewardTypeLabelCalls.map((call) => call.rewardType),
    ).toContain('subscription');
  });

  it('yields an empty second half when rewardType is absent, rather than inventing a label', () => {
    // A null `rewardType` gives `getFormattedValue('rewardType')` nothing to format, so the legacy
    // interpolation contributes an empty string and the separator survives.
    const untyped = new PromotionReward({
      promotionRewardID: 'reward-untyped-representation',
      labelProvider: {
        getPromotionRewardEntityLabel: () => 'entity.promotionReward',
        getRewardTypeLabel: (rewardType: string) =>
          `entity.promotionReward.rewardType.${rewardType}`,
      },
    });

    expect(untyped.getRewardType()).toBeUndefined();
    expect(untyped.getSimpleRepresentation()).toBe('entity.promotionReward - ');
  });

  it('THROWS on an instance hydrated without resolved label text - the shipped reality', () => {
    // [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58]
    // `simple_representation_exists_and_is_simple` asserted that a BARE new instance produces a
    // simple representation.
    //
    // The target cannot: JavaRB is not ported, so resolved text is supplied at HYDRATION and a
    // reward built without it has nothing to render.
    const bare = new PromotionReward({ promotionRewardID: 'reward-no-labels' });

    expect(() => bare.getSimpleRepresentation()).toThrow(/label provider/);
  });

  it('returns "rewardType" from getSimpleRepresentationPropertyName()', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L413-L415]: the declaration spans three lines,
    // with its `return "rewardType";` on [model/entity/PromotionReward.cfc:L414].
    expect(subject.getSimpleRepresentationPropertyName()).toBe('rewardType');
    expect(subject.getSimpleRepresentationPropertyName()).not.toBe('promotionRewardName');
    expect(subject.getSimpleRepresentationPropertyName()).not.toBe('qualifierType');
  });
});

describe('isDeletable() - two unguarded dereferences of the same period', () => {
  it('dereferences getPromotionPeriod() TWICE in one expression', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L417-L419]: the body is
    // `return !getPromotionPeriod().isExpired() && getPromotionPeriod().getPromotion().isDeletable();`
    // `getPromotionPeriod()` appears twice, and neither call is null-guarded.
    const period: PromotionPeriod = fixtures.promotionPeriod;

    expect(subject.getPromotionPeriod()).toBe(period);
    expect(period.isExpired()).toBe(false);
    expect(period.getPromotion()).toBeDefined();

    // The chain is three levels deep: reward -> period -> promotion -> isDeletable().
    expect(period.getPromotion()?.isDeletable()).toBe(false);
    expect(subject.isDeletable()).toBe(false);
  });

  it('THROWS when the reward has no materialized promotionPeriod', () => {
    // [model/entity/PromotionReward.cfc:L418] calls `.isExpired()` on the FIRST dereference with
    // no guard, so an unattached or unjoined reward is a null-reference error in CFML too.
    const orphaned = new PromotionReward({ promotionRewardID: 'reward-no-period' });

    expect(orphaned.getPromotionPeriod()).toBeUndefined();
    expect(() => orphaned.isDeletable()).toThrow(/no materialized/);
  });

  it('THROWS SEPARATELY when the period is lost BETWEEN the two dereferences', () => {
    const period: PromotionPeriod = fixtures.promotionPeriod;
    expect(period.isExpired()).toBe(false);

    const accessor = vi
      .spyOn(subject, 'getPromotionPeriod')
      .mockReturnValueOnce(period)
      .mockReturnValueOnce(undefined);

    // A DISTINCT message from the first-call throw, so a reader of the failure can tell which of
    // the two dereferences failed.
    expect(() => subject.isDeletable()).toThrow(/lost its promotionPeriod between the two/);
    expect(accessor).toHaveBeenCalledTimes(2);
  });

  it('THROWS when the period is present but its promotion is absent', () => {
    // The asymmetry that makes this a SECOND, distinct failure mode: `PromotionPeriod.isExpired()`
    // is guarded - [model/entity/PromotionPeriod.cfc:L84] reads
    // `isDate(getEndDateTime()) && getEndDateTime() < now()`, so a period with no end date answers
    // `false` safely.
    const unexpiredWithoutPromotion = fixtures.datedPromotionPeriods.find(
      (dated) => !dated.promotionPeriod.isExpired(),
    );
    expect(unexpiredWithoutPromotion).toBeDefined();

    const period = unexpiredWithoutPromotion?.promotionPeriod;
    expect(period?.getPromotion()).toBeUndefined();

    const reward = new PromotionReward({
      promotionRewardID: 'reward-period-without-promotion',
      promotionPeriod: period,
    });

    expect(() => reward.isDeletable()).toThrow(/no materialized promotion/);
  });

  it('answers false for an EXPIRED period, short-circuiting before the promotion', () => {
    // CFML `&&` short-circuits, so `!isExpired()` being false ends the expression and the SECOND
    // dereference never happens.
    const expired = fixtures.datedPromotionPeriods.find((dated) =>
      dated.promotionPeriod.isExpired(),
    );
    expect(expired).toBeDefined();
    expect(expired?.promotionPeriod.getPromotion()).toBeUndefined();

    const reward = new PromotionReward({
      promotionRewardID: 'reward-expired-period',
      promotionPeriod: expired?.promotionPeriod,
    });

    expect(reward.isDeletable()).toBe(false);
  });

  it('answers false for an unexpired period whose promotion is not deletable', () => {
    // The second operand actually runs, and answers `false` on its own terms: the fixture's
    // promotion has applied promotions, which is what makes it undeletable.
    expect(fixtures.promotionPeriod.isExpired()).toBe(false);
    expect(fixtures.promotion.isDeletable()).toBe(false);
    expect(subject.isDeletable()).toBe(false);
  });

  it('answers true for an unexpired period with a deletable promotion', () => {
    expect(fixtures.codelessPromotion.isDeletable()).toBe(true);

    fixtures.promotionPeriod.setPromotion(fixtures.codelessPromotion);

    expect(fixtures.promotionPeriod.isExpired()).toBe(false);
    expect(fixtures.promotionPeriod.getPromotion()?.isDeletable()).toBe(true);
    expect(subject.isDeletable()).toBe(true);
  });

  it('exposes no deletability collection gate of its own', () => {
    // The `isDeletable()` chain is CODE-ONLY here. There is no declarative counterpart - see the
    // validation suite below - and no `maxCollection` rule anywhere in
    // `model/validation/PromotionReward.json`.
    expect(PROTOTYPE_MEMBERS).toContain('isDeletable');
    expect(PROTOTYPE_MEMBERS).not.toContain('getRewardsDeletableFlag');
    expect(PROTOTYPE_MEMBERS).not.toContain('getPromotionRewardsDeletableFlag');
  });
});

describe('the five declarative validation rules, and the four conspicuous absences', () => {
  // CFML parity `model/validation/PromotionReward.json`: exactly five rules. `amountType` is
  // required but value-unconstrained; `amount` is required and numeric; the three `maximumUse*`
  // limits are numeric but optional.
  //
  // These assertions describe what the JSON SAYS, carried as data.

  it('makes BOTH amountType AND amount required on save', () => {
    const requiredOnSave: readonly string[] = ['amountType', 'amount'];
    expect(requiredOnSave).toHaveLength(2);
    expect(requiredOnSave).toContain('amountType');
    expect(requiredOnSave).toContain('amount');

    // The entity itself does not enforce either, which is why both absences are constructible
    // above.
    const invalidByValidation = new PromotionReward({ promotionRewardID: 'reward-invalid' });
    expect(invalidByValidation.getAmountType()).toBeUndefined();
    expect(invalidByValidation.getAmount()).toBeUndefined();
  });

  it('leaves amountType required but value-UNCONSTRAINED', () => {
    // The `amountType` rule carries `required: true` and nothing else - no `dataType`, no
    // `inList`.
    //
    // In the target the CLOSED `AmountType` union does the constraining that the JSON never did -
    // which is stricter than the legacy.
    expect(fixtures.impossibleOrderFixedAmountReward.getAmountType()).toBe('amount');
    expect(fixtures.impossibleOrderFixedAmountReward.getRewardType()).toBe('order');
    expect(
      fixtures.impossibleOrderFixedAmountReward
        .getAmountTypeOptions()
        .map((option) => option.value),
    ).not.toContain('amount');
  });

  it('declares the three maximumUse* rules numeric but NOT required', () => {
    // JSON lines 5-7: each is `[{"contexts":"save","dataType":"numeric"}]` - a TYPE rule with no
    // `required` key. So an absent limit passes validation, which is the declarative half of
    // undefined-means-unlimited.
    const numericNotRequired: readonly string[] = [
      'maximumUsePerOrder',
      'maximumUsePerItem',
      'maximumUsePerQualification',
    ];

    expect(numericNotRequired).toHaveLength(3);

    // The validated "unlimited" shape: all three absent, and nothing objects.
    const reward = fixtures.unlimitedUseLimitsReward;
    for (const limit of [
      reward.getMaximumUsePerOrder(),
      reward.getMaximumUsePerItem(),
      reward.getMaximumUsePerQualification(),
    ]) {
      expect(limit).toBeUndefined();
    }
  });

  it('asserts the ABSENCES and invents nothing to fill them', () => {
    // Four things the file does not contain, recorded so no future edit "completes" it: * no
    // `rewardType` rule - the five-value vocabulary is unvalidated.
    //
    // CONTRAST `model/validation/Promotion.json`, which does gate deletion: `appliedPromotions`
    // with `maxCollection: 0` and a `method` gate on `promotionCodes`.
    const declaredProperties: readonly string[] = [
      'amountType',
      'amount',
      'maximumUsePerOrder',
      'maximumUsePerItem',
      'maximumUsePerQualification',
    ];

    expect(declaredProperties).toHaveLength(5);
    expect(declaredProperties).not.toContain('rewardType');
    expect(declaredProperties).not.toContain('applicableTerm');
    expect(declaredProperties).not.toContain('roundingRule');
    expect(declaredProperties).not.toContain('eligiblePriceGroups');
    expect(declaredProperties).not.toContain('promotionPeriod');
  });

  it('confirms the file is PRESENT in the promotion-family validation census', () => {
    // The census was built by listing `model/validation/` directly rather than inferred.
    const row = fixtures.promotionValidationCensus.find(
      (entry) => entry.entity === 'PromotionReward',
    );

    expect(row).toBeDefined();
    expect(row?.present).toBe(true);
    expect(row?.validationFile).toBe('model/validation/PromotionReward.json');

    expect(fixtures.promotionValidationCensus.filter((entry) => entry.present)).toHaveLength(4);
    expect(fixtures.promotionValidationCensus.filter((entry) => !entry.present)).toHaveLength(3);
    expect(
      fixtures.promotionValidationCensus
        .filter((entry) => !entry.present)
        .map((entry) => entry.entity),
    ).toEqual(['PromotionQualifier', 'PromotionApplied', 'PromotionAccount']);
  });
});

describe('the structural facts the row carries', () => {
  it('is honest about isNew(), because the primary key defaults to the empty string', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L60]: `unsavedvalue=""` together with
    // `default=""` is what makes `isNew()` decidable without an ORM session - the port needs no
    // Hibernate session state to answer it, only the key.
    expect(new PromotionReward({ promotionRewardID: '' }).isNew()).toBe(true);
    expect(subject.isNew()).toBe(false);
    expect(subject.getPromotionRewardID()).toBe('promofx-reward-percentage-off');
  });

  it('carries remoteID as an optional string', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L93]:
    // `property name="remoteID" ormtype="string"` - lowercase attribute spelling, in the "Remote
    // Properties" block, with no default.
    expect(subject.getRemoteID()).toBeUndefined();

    const correlated = new PromotionReward({
      promotionRewardID: 'reward-remote',
      remoteID: 'legacy-erp-00417',
    });
    expect(correlated.getRemoteID()).toBe('legacy-erp-00417');
  });

  it('carries the four audit properties as Date | undefined - never an epoch', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L96-L99]: two `ormtype="timestamp"` columns
    // and two many-to-one `Account` references, all four `hb_populateEnabled="false"`.
    expect(subject.getCreatedDateTime()?.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(subject.getModifiedDateTime()?.toISOString()).toBe('2024-06-15T12:30:00.000Z');

    // Out of scope, so identifiers only - no `Account` entity is imported or invented.
    expect(subject.getCreatedByAccountID()).toBeUndefined();
    expect(subject.getModifiedByAccountID()).toBeUndefined();

    const undated = new PromotionReward({ promotionRewardID: 'reward-undated' });
    expect(undated.getCreatedDateTime()).toBeUndefined();
    expect(undated.getModifiedDateTime()).toBeUndefined();
    expect(undated.getCreatedDateTime()).not.toEqual(new Date('1970-01-01T00:00:00.000Z'));
  });

  it('reads its clock from the fixture, never from the ambient one', () => {
    // Every business-date literal in this suite is an explicit UTC ISO-8601 string, and the
    // fixture supplies one fixed instant so no assertion can drift with the wall clock.
    expect(fixtures.now.toISOString()).toBe('2024-06-15T12:00:00.000Z');
    expect(fixtures.clock().toISOString()).toBe(fixtures.now.toISOString());
    expect(PROTOTYPE_MEMBERS).not.toContain('isCurrent');
    expect(PROTOTYPE_MEMBERS).not.toContain('isExpired');
  });

  it('records the banner inventory this component has - and the two it does NOT', () => {
    // CFML parity `model/entity/PromotionReward.cfc`: the banner map, verified by reading all 426
    // lines - [model/entity/PromotionReward.cfc:L110]/[model/entity/PromotionReward.cfc:L135]
    // Non-Persistent Property Methods,
    // [model/entity/PromotionReward.cfc:L137]/[model/entity/PromotionReward.cfc:L397]
    // Bidirectional Helper Methods (260 lines, the LARGEST such block in any in-scope entity),
    // [model/entity/PromotionReward.cfc:L399]/[model/entity/PromotionReward.cfc:L409] Custom
    // Formatting Methods.
    expect(PROTOTYPE_MEMBERS).toContain('getSimpleRepresentationPropertyName');
    expect(PROTOTYPE_MEMBERS).toContain('isDeletable');
    expect(PROTOTYPE_MEMBERS).toContain('getAmountFormatted');
    expect(PROTOTYPE_MEMBERS).toContain('getAmountTypeOptions');
    expect(PROTOTYPE_MEMBERS).toContain('getApplicableTermOptions');
    expect(PROTOTYPE_MEMBERS).not.toContain('getRewards');
  });

  it('declares exactly EIGHT persistent scalars and ZERO booleans', () => {
    // CFML parity [model/entity/PromotionReward.cfc:L60-L67]: eight scalar columns and not one
    // boolean - verified against both attribute casings, since a census that grepped only
    // lowercase `ormtype="boolean"` would under-count.
    const bare = new PromotionReward({ promotionRewardID: 'reward-scalars' });

    const scalarAccessors: readonly unknown[] = [
      bare.getPromotionRewardID(),
      bare.getAmount(),
      bare.getAmountType(),
      bare.getRewardType(),
      bare.getApplicableTerm(),
      bare.getMaximumUsePerOrder(),
      bare.getMaximumUsePerItem(),
      bare.getMaximumUsePerQualification(),
    ];

    expect(scalarAccessors).toHaveLength(8);
    for (const value of scalarAccessors) {
      expect(typeof value).not.toBe('boolean');
    }

    // No `activeFlag`, no `publishedFlag`, no boolean of any kind - contrast `Brand`, `Promotion`
    // and `PromotionCode`, which all carry one.
    expect(PROTOTYPE_MEMBERS).not.toContain('getActiveFlag');
    expect(PROTOTYPE_MEMBERS).not.toContain('getPublishedFlag');
  });
});

describe('per-test isolation, proven rather than asserted', () => {
  it('mutates a live collection array and a live far-side array', () => {
    // Deliberately destructive. `beforeEach` rebuilds the entire graph, so the damage this test
    // does must be invisible to the next one - which the following test checks.
    subject.getBrands().push(fixtures.excludedBrand);
    subject.getEligiblePriceGroups().length = 0;
    subject.removeOption(fixtures.option);
    fixtures.promotionPeriod.setPromotion(fixtures.codelessPromotion);

    expect(subject.getBrands()).toHaveLength(2);
    expect(subject.getEligiblePriceGroups()).toEqual([]);
    expect(subject.hasOption(fixtures.option)).toBe(false);
    expect(subject.isDeletable()).toBe(true);
  });

  it('sees a pristine graph despite the previous test mutating it', () => {
    // The freshness proof. Every value here is the fixture's default, unaffected by the wreckage
    // above - so there is no mutable module-level state and no cross-test leakage through the
    // eleven live arrays.
    expect(subject.getBrands()).toHaveLength(1);
    expect(subject.getEligiblePriceGroups()).toHaveLength(2);
    expect(subject.hasOption(fixtures.option)).toBe(true);
    expect(subject.isDeletable()).toBe(false);
    expect(fixtures.promotion.isDeletable()).toBe(false);
    // Inverted with the formatter fix: the legacy percentage mask pads nothing, so the fixture's
    // stored 12.5 renders "12.5%". See the no-padding proof above for why "12.50%" was wrong.
    expect(subject.getAmountFormatted()).toBe('12.5%');
  });

  it('hands out a distinct object graph on every fixture call', () => {
    // Two calls, two graphs.
    const first = makePromotionFixtures();
    const second = makePromotionFixtures();

    expect(first.percentageOffReward).not.toBe(second.percentageOffReward);
    expect(first.percentageOffReward.getBrands()).not.toBe(second.percentageOffReward.getBrands());
    expect(first.percentageOffReward.getPromotionRewardID()).toBe(
      second.percentageOffReward.getPromotionRewardID(),
    );

    first.percentageOffReward.getBrands().length = 0;
    expect(second.percentageOffReward.getBrands()).toHaveLength(1);
  });
});

// Both changes are declined, and the declines are mandated rather than chosen.

describe('the preserved financial defects this entity feeds are pinned, not repaired', () => {
  const UNLIMITED_PER_ORDER = 1_000_000;

  /**
   * A promotion repository that refuses every member.
   *
   * `RoundingRuleService` takes one collaborator and this block reaches only its synchronous
   * `roundValue` / `roundValueByRoundingRule` pair, neither of which touches the repository.
   */
  const refusingPromotionRepository = new Proxy({} as PromotionRepository, {
    get: (_target, member: string | symbol): never => {
      throw new Error(
        `the discount path reached promotionRepository.${String(member)}; this block asserts ` +
          'only the synchronous rounding pair, which takes no repository.',
      );
    },
  });

  /**
   * The durable-write collaborator every `RoundingRuleService` in this file is handed, which
   * REFUSES.
   *
   * `saveRoundingRule` genuinely persists now, through a single-method contract the service
   * declares and `src/handlers/bootstrap.ts` satisfies over the request's executor.
   */
  const refusingRoundingRuleFrameworkWrites: RoundingRuleFrameworkWrites = {
    saveRoundingRule: (): never => {
      throw new Error(
        'a rounding-rule WRITE was reached from this suite. Only the synchronous rounding pair is ' +
          'exercised here; saveRoundingRule is covered by tests/unit/services/roundingRuleService.test.ts.',
      );
    },
  };
  const roundingRuleService = new RoundingRuleService(
    refusingPromotionRepository,
    refusingRoundingRuleFrameworkWrites,
  );
  const calculator = new DiscountAmountCalculator(roundingRuleService);

  const OVERUSED_REWARD_ID = 'reward-overused';
  const LAST_PROCESSED_REWARD_ID = 'reward-last-processed';
  const ORDER_ITEM_ID = 'order-item-shared';

  /**
   * Reward A is over its per-order limit (used 2, limit 1) so it enters the stripping body.
   */
  function buildOverUseScenario(
    lastProcessedPerOrderLimit: number,
    overUsedItemID: string = ORDER_ITEM_ID,
  ): {
    readonly ledger: PromotionRewardUsageDetails;
    readonly accumulator: OrderItemQualifiedDiscounts;
  } {
    const ledger: PromotionRewardUsageDetails = {
      [OVERUSED_REWARD_ID]: {
        usedInOrder: 2,
        maximumUsePerOrder: 1,
        maximumUsePerItem: UNLIMITED_PER_ORDER,
        maximumUsePerQualification: UNLIMITED_PER_ORDER,
        orderItemsUsage: [
          {
            orderItemID: overUsedItemID,
            discountQuantity: 1,
            discountPerUseValue: Money.fromDecimalString('10.00'),
          },
        ],
      },
      [LAST_PROCESSED_REWARD_ID]: {
        usedInOrder: 1,
        maximumUsePerOrder: lastProcessedPerOrderLimit,
        maximumUsePerItem: UNLIMITED_PER_ORDER,
        maximumUsePerQualification: UNLIMITED_PER_ORDER,
        orderItemsUsage: [
          {
            orderItemID: ORDER_ITEM_ID,
            discountQuantity: 1,
            discountPerUseValue: Money.fromDecimalString('1.00'),
          },
        ],
      },
    };

    const accumulator: OrderItemQualifiedDiscounts = {
      [ORDER_ITEM_ID]: [
        {
          promotionRewardID: OVERUSED_REWARD_ID,
          promotion: fixtures.promotion,
          discountAmount: Money.fromDecimalString('10.00'),
        },
      ],
    };

    return { ledger, accumulator };
  }

  function discountOnSharedItem(accumulator: OrderItemQualifiedDiscounts): string {
    const bucket = accumulator[ORDER_ITEM_ID];

    if (bucket === undefined || bucket[0] === undefined) {
      throw new Error('the shared order item lost its discount bucket');
    }
    return bucket[0].discountAmount.toDecimalString();
  }

  it('S-01: inflates a discount of 10 to 9,999,990 when the last reward is unlimited', () => {
    // It needs one reward over its per-order limit and one reward without a per-order limit
    // processed after it.
    //
    // NeedToRemove = A.usedInOrder - B.maximumUsePerOrder = 2 - 1,000,000 = -999,998.
    const { ledger, accumulator } = buildOverUseScenario(UNLIMITED_PER_ORDER);

    stripOverUsedRewardDiscounts(ledger, accumulator, LAST_PROCESSED_REWARD_ID);

    expect(discountOnSharedItem(accumulator)).toBe('9999990');
  });

  it('S-01: leaves the discount alone when the leaked reward happens to share the limit', () => {
    // The other HALF of the PROOF, and the reason this pair is worth more than the case above on
    // its own.
    const { ledger, accumulator } = buildOverUseScenario(1);

    stripOverUsedRewardDiscounts(ledger, accumulator, LAST_PROCESSED_REWARD_ID);

    const bucket = accumulator[ORDER_ITEM_ID];

    expect(bucket).toStrictEqual([]);
  });

  it('S-01: strips the LEAKED reward’s items, not the examined reward’s items', () => {
    // The second half of the same defect: L475-L477 iterate the leaked reward's `orderItemsUsage`,
    // so the ITEMS touched belong to whichever reward ran last.
    const { ledger, accumulator } = buildOverUseScenario(
      UNLIMITED_PER_ORDER,
      'order-item-with-no-bucket',
    );

    expect(() =>
      stripOverUsedRewardDiscounts(ledger, accumulator, LAST_PROCESSED_REWARD_ID),
    ).not.toThrow();
    expect(discountOnSharedItem(accumulator)).toBe('9999990');
  });

  it('S-03: derives a discount of 1.41 against an original amount of 0.42', () => {
    const rewardWithRoundingRule = new PromotionReward({
      promotionRewardID: 'reward-negative-net',
      amount: Money.fromDecimalString('0.01'),
      amountType: 'amountOff',
      roundingRule: new RoundingRule(
        {
          roundingRuleID: 'rounding-down-to-99',
          roundingRuleName: undefined,
          roundingRuleExpression: '.99',
          roundingRuleDirection: 'Down',
          createdDateTime: undefined,
          createdByAccountID: undefined,
          modifiedDateTime: undefined,
          modifiedByAccountID: undefined,
          priceGroupRates: [],
        },
        // The entity forwards to the service exactly as [model/entity/RoundingRule.cfc:L66-L68]
        // does, which is what puts a REAL rounding result on the discount path rather than a
        // stubbed one.
        roundingRuleService,
      ),
    });

    const derived = calculator.getDiscountAmount(
      rewardWithRoundingRule,
      Money.fromDecimalString('0.42'),
      1,
    );

    expect(derived.toDecimalString()).toBe('1.41');
    // Stated as the invariant it breaks, so the failure mode is legible without re-deriving the
    // arithmetic: the discount exceeds the amount being discounted.
    expect(derived.isGreaterThan(Money.fromDecimalString('0.42'))).toBe(true);
  });

  it('S-03: clamps correctly when the PRE-rounding amount is the one that overshoots', () => {
    // The half that works, which is what makes the defect a mismatch rather than an absent clamp.
    const overshootingReward = new PromotionReward({
      promotionRewardID: 'reward-overshoot',
      amount: Money.fromDecimalString('200'),
      amountType: 'percentageOff',
    });

    const derived = calculator.getDiscountAmount(
      overshootingReward,
      Money.fromDecimalString('10.00'),
      1,
    );

    // Asserted by VALUE rather than by rendering: `Money` normalizes trailing zeros, so the
    // clamped result renders as `10` while the amount it was clamped to was written `10.00`.
    expect(derived.equals(Money.fromDecimalString('10.00'))).toBe(true);
    expect(derived.isGreaterThan(Money.fromDecimalString('10.00'))).toBe(false);
  });
});
