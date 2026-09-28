// slatwall-ts - unit suite for `src/domain/entities/promotionQualifier.ts`
//
// `PromotionQualifier` is the `SwPromoQual` row and the gate half of the promotion engine:
// qualifiers decide whether a promotion applies, rewards decide what it gives.
//
// Coverage is 100% net-new, measured: no file under `meta/tests/` mentions `PromotionQualifier`,
// `qualifierType` or `rewardMatchingType`.
//
// No defect belongs to this entity and the divergence budget spent here is zero.
// !! HARD BOUNDARY - THE ENGINE'S BEHAVIOUR IS NOT TESTED HERE !!

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PromotionQualifier } from '../../../../src/domain/entities/promotionQualifier.js';
import type { RewardMatchingType } from '../../../../src/domain/entities/promotionQualifier.js';
import { Brand } from '../../../../src/domain/entities/brand.js';
import { Option } from '../../../../src/domain/entities/option.js';
import { PromotionPeriod } from '../../../../src/domain/entities/promotionPeriod.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import { makePromotionFixtures } from '../../../fixtures/promotionFixtures.js';

// Four levels up to `src`, three to `tests/fixtures`, and every specifier ends in `.js`.
//
// Deliberately absent: `FulfillmentMethod`, `ShippingMethod` and `AddressZone`, because the Group
// a far sides [model/entity/PromotionQualifier.cfc:L73-L75] are out of scope and not ported;
// `Sku`, `Product` and `ProductType`.

/**
 * The subject's constructor parameter object.
 */
// JUDGMENT CALL: derive the init shapes with `ConstructorParameters` rather than hand-declaring a
// parallel `type` per entity.
type PromotionQualifierInit = ConstructorParameters<typeof PromotionQualifier>[0];

/**
 * The period double's constructor parameter object, derived for the same reason.
 */
type PromotionPeriodInit = ConstructorParameters<typeof PromotionPeriod>[0];

/**
 * The option double's constructor parameter object, derived for the same reason.
 */
type OptionInit = ConstructorParameters<typeof Option>[0];

/**
 * The fixture graph, and the ten-gate metadata table it already carries.
 */
type PromotionFixtures = ReturnType<typeof makePromotionFixtures>;
type QualifierGateSpec = PromotionFixtures['qualifierGateNullDefaults'][number];
type QualifierGateName = QualifierGateSpec['gate'];

/**
 * One `add*` / `remove*` / `has*` triple, with both sides of its link already bound.
 */
type MembershipPairProbe = {
  /**
   * The property name as [model/entity/PromotionQualifier.cfc:L77-L87] declares it.
   */
  readonly property: string;
  /**
   * The physical link table, verbatim and abbreviated.
   */
  readonly linkTable: string;
  /**
   * Whether the far side is reached through the include family or the exclude family.
   */
  readonly family: 'include' | 'exclude';
  readonly add: () => void;
  readonly remove: () => void;
  readonly has: () => boolean;
  /**
   * The subject's own collection for this link.
   */
  readonly nearSide: () => readonly unknown[];
  /**
   * The far side's collection of qualifiers for this link.
   */
  readonly farSide: () => readonly PromotionQualifier[];
};

// --- The schema and surface contracts, stated once

// The physical table `SwPromoQual` - ABBREVIATED, never `SwPromotionQualifier`
// [model/entity/PromotionQualifier.cfc:L49] - is no longer restated as a constant here. Schema
// continuity is binding (AAP 0.8.1), and it is checked against the shipped source rather than
// against a literal in this file: tests/traceability/legacyTestMap.ts block A30.

/**
 * All thirteen many-to-many link tables, verbatim, keyed by the property that declares each.
 *
 * CFML parity [model/entity/PromotionQualifier.cfc:L73-L87]: THIRTEEN owner collections, none
 * marked `inverse="true"`.
 */
const LEGACY_LINK_TABLES = {
  fulfillmentMethods: 'SwPromoQualFulfillmentMethod',
  shippingMethods: 'SwPromoQualShippingMethod',
  shippingAddressZones: 'SwPromoQualShipAddressZone',
  brands: 'SwPromoQualBrand',
  options: 'SwPromoQualOption',
  skus: 'SwPromoQualSku',
  products: 'SwPromoQualProduct',
  productTypes: 'SwPromoQualProductType',
  excludedBrands: 'SwPromoQualExclBrand',
  excludedOptions: 'SwPromoQualExclOption',
  excludedSkus: 'SwPromoQualExclSku',
  excludedProducts: 'SwPromoQualExclProduct',
  excludedProductTypes: 'SwPromoQualExclProductType',
} as const;

/**
 * The three Group A properties [model/entity/PromotionQualifier.cfc:L73-L75].
 *
 * CFML parity: `fulfillmentMethods`, `shippingMethods` and `shippingAddressZones` reference
 * `FulfillmentMethod`, `ShippingMethod` and `AddressZone`, all three out of SCOPE and none ported,
 * so they collapse to `readonly string[]` opaque identifiers.
 */
const GROUP_A_PROPERTIES = [
  'fulfillmentMethods',
  'shippingMethods',
  'shippingAddressZones',
] as const;

/**
 * The `rewardMatchingType` vocabulary, in the source's own order.
 *
 * CFML parity [model/entity/PromotionQualifier.cfc:L109-L113]: not five plausible values but the
 * exact five rows `getRewardMatchingTypeOptions()` returns, and
 * [model/entity/PromotionQualifier.cfc:L65] declares `hb_formFieldType="select"`, so the option
 * list is the admin form's domain.
 */
const REWARD_MATCHING_TYPES: readonly RewardMatchingType[] = [
  'any',
  'sku',
  'product',
  'productType',
  'brand',
];

/**
 * The five option `name` fields, verbatim and UNRESOLVED.
 *
 * CFML parity [model/entity/PromotionQualifier.cfc:L109-L113]: each name is
 * `rbKey('entity.promotionQualifier.rewardMatchingType.<value>')`.
 */
const REWARD_MATCHING_TYPE_OPTION_KEYS: readonly string[] = [
  'entity.promotionQualifier.rewardMatchingType.any',
  'entity.promotionQualifier.rewardMatchingType.sku',
  'entity.promotionQualifier.rewardMatchingType.product',
  'entity.promotionQualifier.rewardMatchingType.productType',
  'entity.promotionQualifier.rewardMatchingType.brand',
];

/**
 * Every member the port authors on the prototype, sorted - interface parity in executable form.
 */
const PORTED_PUBLIC_SURFACE: readonly string[] = [
  'addBrand',
  'addExcludedBrand',
  'addExcludedOption',
  'addExcludedProduct',
  'addExcludedProductType',
  'addExcludedSku',
  'addOption',
  'addProduct',
  'addProductType',
  'addSku',
  'getBrands',
  'getCreatedByAccountID',
  'getCreatedDateTime',
  'getExcludedBrands',
  'getExcludedOptions',
  'getExcludedProductTypes',
  'getExcludedProducts',
  'getExcludedSkus',
  'getFulfillmentMethodIDs',
  'getMaximumFulfillmentWeight',
  'getMaximumItemPrice',
  'getMaximumItemQuantity',
  'getMaximumOrderQuantity',
  'getMaximumOrderSubtotal',
  'getMinimumFulfillmentWeight',
  'getMinimumItemPrice',
  'getMinimumItemQuantity',
  'getMinimumOrderQuantity',
  'getMinimumOrderSubtotal',
  'getModifiedByAccountID',
  'getModifiedDateTime',
  'getOptions',
  'getProductTypes',
  'getProducts',
  'getPromotionPeriod',
  'getPromotionQualifierID',
  'getQualifierType',
  'getRemoteID',
  'getRewardMatchingType',
  'getRewardMatchingTypeOptions',
  'getShippingAddressZoneIDs',
  'getShippingMethodIDs',
  'getSimpleRepresentation',
  'getSimpleRepresentationPropertyName',
  'getSkus',
  'hasAnyExcludedOption',
  'hasAnyOption',
  'hasBrand',
  'hasExcludedBrand',
  'hasExcludedOption',
  'hasExcludedProduct',
  'hasExcludedProductType',
  'hasExcludedSku',
  'hasOption',
  'hasProduct',
  'hasProductType',
  'hasSku',
  'isDeletable',
  'isNew',
  'removeBrand',
  'removeExcludedBrand',
  'removeExcludedOption',
  'removeExcludedProduct',
  'removeExcludedProductType',
  'removeExcludedSku',
  'removeOption',
  'removeProduct',
  'removeProductType',
  'removePromotionPeriod',
  'removeSku',
  'setPromotionPeriod',
];

/**
 * The two period-side helpers `PromotionPeriod` calls but this entity does not declare.
 *
 * CFML parity [model/entity/PromotionQualifier.cfc:L121-L137]: the only period-side helpers this
 * component declares are `setPromotionPeriod` [model/entity/PromotionQualifier.cfc:L122-L127] and
 * `removePromotionPeriod` [model/entity/PromotionQualifier.cfc:L128-L137].
 */
const ABSENT_PERIOD_SIDE_HELPERS: readonly string[] = ['setPromotion', 'removePromotion'];

/**
 * `getQualifierApplicationTypeOptions` - the reader half of the double orphan.
 */
const ABSENT_BY_SCOPE_RULING: readonly string[] = [
  'getQualifierApplicationTypeOptions',
  'getQualifierTypeOptions',
  'getEligiblePriceGroups',
  'addEligiblePriceGroup',
  'removeEligiblePriceGroup',
  'hasEligiblePriceGroup',
  'getFulfillmentMethods',
  'addFulfillmentMethod',
  'removeFulfillmentMethod',
  'hasFulfillmentMethod',
  'getShippingMethods',
  'addShippingMethod',
  'removeShippingMethod',
  'hasShippingMethod',
  'getShippingAddressZones',
  'addShippingAddressZone',
  'removeShippingAddressZone',
  'hasShippingAddressZone',
];

/**
 * Framework members the legacy base chain supplied and this port deliberately does not.
 */
const UNPORTED_FRAMEWORK_MEMBERS: readonly string[] = [
  'getNewFlag',
  'getPrimaryIDValue',
  'getPrimaryIDPropertyName',
  'getPrintTemplates',
  'getEmailTemplates',
  'getAttributeValue',
  'getAttributeValues',
  'clearAttributeCache',
  'hasAnyInProperty',
  'getPropertyAssignedIDList',
  'getFormattedValue',
  'onMissingMethod',
  'preInsert',
  'preUpdate',
  'postInsert',
  'postUpdate',
  'preDelete',
  'postDelete',
];

/**
 * The validation surface that does not exist, and the five declarative validators this entity does
 * not declare.
 *
 * CFML parity [model/validation/]: there is no `PromotionQualifier.json`. Verified by listing the
 * folder - it holds 96 `.json` files and that is not one of them.
 */
const ABSENT_VALIDATION_SURFACE: readonly string[] = [
  'validate',
  'hasErrors',
  'getErrors',
  'getValidations',
  'setValidations',
  'populate',
  'hasUniqueOptions',
  'hasOneOptionPerOptionGroup',
  'hasExpressionWithListOfNumericValuesOnly',
  'getPromotionCodesDeletableFlag',
  'hasUniquePromotionCode',
];

/**
 * Every gate's accessor, keyed by property name.
 */
const GATE_READERS: Readonly<
  Record<QualifierGateName, (subject: PromotionQualifier) => Money | number | undefined>
> = {
  minimumOrderQuantity: (subject) => subject.getMinimumOrderQuantity(),
  maximumOrderQuantity: (subject) => subject.getMaximumOrderQuantity(),
  minimumOrderSubtotal: (subject) => subject.getMinimumOrderSubtotal(),
  maximumOrderSubtotal: (subject) => subject.getMaximumOrderSubtotal(),
  minimumItemQuantity: (subject) => subject.getMinimumItemQuantity(),
  maximumItemQuantity: (subject) => subject.getMaximumItemQuantity(),
  minimumItemPrice: (subject) => subject.getMinimumItemPrice(),
  maximumItemPrice: (subject) => subject.getMaximumItemPrice(),
  minimumFulfillmentWeight: (subject) => subject.getMinimumFulfillmentWeight(),
  maximumFulfillmentWeight: (subject) => subject.getMaximumFulfillmentWeight(),
};

/**
 * The accessor NAME for each gate, so the surface can be checked as well as the value.
 *
 * @param gate the property name as [model/entity/PromotionQualifier.cfc:L55-L64] declares it.
 * @returns the camelCase getter name the port authors for it.
 */
function gateAccessorName(gate: QualifierGateName): string {
  return `get${gate.charAt(0).toUpperCase()}${gate.slice(1)}`;
}

/**
 * The single "current" instant every assertion in this file is evaluated at.
 */
const NOW_UTC = '2024-06-15T12:00:00.000Z';

/**
 * A period bound that has not yet been reached at `NOW_UTC`.
 */
const PERIOD_END_UTC = '2024-07-01T00:00:00.000Z';

/**
 * A period bound already passed at `NOW_UTC`, so `isExpired()` answers true.
 */
const EXPIRED_PERIOD_END_UTC = '2024-02-01T00:00:00.000Z';

/**
 * The audit instants, used to prove the columns are real dates and never an epoch stand-in.
 */
const CREATED_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';
const MODIFIED_DATE_TIME_UTC = '2024-06-15T12:30:00.000Z';

/**
 * A deterministic clock, injected rather than installed.
 *
 * @param instantUTC an explicit UTC ISO-8601 literal.
 * @returns a clock that always reports that instant.
 */
function fixedClock(instantUTC: string): () => Date {
  const epochMilliseconds: number = new Date(instantUTC).getTime();
  return () => new Date(epochMilliseconds);
}

/**
 * The columns of an unsaved qualifier, all thirty-three slots explicit.
 *
 * CFML parity [model/entity/PromotionQualifier.cfc:L52]: `promotionQualifierID` starts `''` rather
 * than absent, because `unsavedvalue="" default=""` is what makes the empty string the honest
 * answer for a row that has never been saved.
 *
 * @returns a fresh, fully-populated init object for an unsaved row.
 */
function unsavedRowColumns(): PromotionQualifierInit {
  return {
    promotionQualifierID: '',
    qualifierType: undefined,
    minimumOrderQuantity: undefined,
    maximumOrderQuantity: undefined,
    minimumOrderSubtotal: undefined,
    maximumOrderSubtotal: undefined,
    minimumItemQuantity: undefined,
    maximumItemQuantity: undefined,
    minimumItemPrice: undefined,
    maximumItemPrice: undefined,
    minimumFulfillmentWeight: undefined,
    maximumFulfillmentWeight: undefined,
    rewardMatchingType: undefined,
    promotionPeriod: undefined,
    fulfillmentMethodIDs: undefined,
    shippingMethodIDs: undefined,
    shippingAddressZoneIDs: undefined,
    brands: undefined,
    options: undefined,
    skus: undefined,
    products: undefined,
    productTypes: undefined,
    excludedBrands: undefined,
    excludedOptions: undefined,
    excludedSkus: undefined,
    excludedProducts: undefined,
    excludedProductTypes: undefined,
    remoteID: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  };
}

/**
 * Builds one qualifier, overriding only what a test is about.
 *
 * @param overrides the columns this test cares about; the rest stays unsaved-default.
 * @returns a fresh `PromotionQualifier`.
 */
function aQualifier(overrides: Partial<PromotionQualifierInit> = {}): PromotionQualifier {
  return new PromotionQualifier({ ...unsavedRowColumns(), ...overrides });
}

/**
 * Builds a SAVED qualifier - one whose primary key is non-empty.
 *
 * @param promotionQualifierID the non-empty key to give it.
 * @param overrides any further columns.
 * @returns a fresh, saved `PromotionQualifier`.
 */
function aSavedQualifier(
  promotionQualifierID: string,
  overrides: Partial<PromotionQualifierInit> = {},
): PromotionQualifier {
  return aQualifier({ ...overrides, promotionQualifierID });
}

/**
 * Builds a brand double.
 *
 * @param brandID the key, or omitted for a transient brand.
 * @returns a fresh `Brand` holding no qualifiers on either far-side collection.
 */
function aBrand(brandID?: string): Brand {
  return brandID === undefined ? new Brand() : new Brand({ brandID });
}

/**
 * Builds an option double, all twelve required slots explicit.
 *
 * @param optionID the key, or `''` for a transient option.
 * @returns a fresh `Option` holding no qualifiers on either far-side collection.
 */
function anOption(optionID: string): Option {
  const columns: OptionInit = {
    optionID,
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
  };
  return new Option(columns);
}

/**
 * The `promotion` slot's type, derived rather than imported.
 */
type PromotionForPeriod = PromotionPeriodInit['promotion'];

/**
 * Builds a promotion-period double with an injected clock.
 *
 * @param spec.promotionPeriodID the period's key.
 * @param spec.endDateTimeUTC the end bound, or `undefined` to make `isExpired()` answer false
 * through its guarded branch.
 * @param spec.promotion the parent promotion, or `undefined` to leave the many-to-one
 * unmaterialized.
 * @returns a fresh `PromotionPeriod` reading the `NOW_UTC` clock.
 */
function aPromotionPeriod(spec: {
  readonly promotionPeriodID: string;
  readonly endDateTimeUTC: string | undefined;
  readonly promotion: PromotionForPeriod;
}): PromotionPeriod {
  return new PromotionPeriod({
    promotionPeriodID: spec.promotionPeriodID,
    startDateTime: new Date(CREATED_DATE_TIME_UTC),
    endDateTime: spec.endDateTimeUTC === undefined ? undefined : new Date(spec.endDateTimeUTC),
    maximumUseCount: undefined,
    maximumAccountUseCount: undefined,
    promotion: spec.promotion,
    promotionID: undefined,
    remoteID: undefined,
    createdDateTime: new Date(CREATED_DATE_TIME_UTC),
    createdByAccountID: undefined,
    modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: undefined,
    now: fixedClock(NOW_UTC),
  });
}

/**
 * A fresh fixture graph, called INSIDE each test that needs one rather than hoisted, so the
 * entities it hands out - whose collections are live arrays - can never cross a test boundary.
 *
 * @returns a fresh graph built at the fixture module's own default instant.
 */
function freshFixtures(): PromotionFixtures {
  return makePromotionFixtures();
}

/**
 * The first promotion period of a fixture promotion, without a non-null assertion.
 *
 * @param periods the promotion's materialized period collection.
 * @param label what the caller was reaching for, for the failure message.
 * @returns the first period.
 * @throws Error when the collection is empty.
 */
function firstPeriodOf(periods: readonly PromotionPeriod[], label: string): PromotionPeriod {
  const [period] = periods;
  if (period === undefined) {
    throw new Error(`fixture invariant broken: ${label} exposes no promotion period`);
  }
  return period;
}

/**
 * The prototype's own members, minus the constructor, sorted.
 *
 * @returns every member name the class installs on instances.
 */
function prototypeMembers(): string[] {
  return Object.getOwnPropertyNames(PromotionQualifier.prototype)
    .filter((name: string) => name !== 'constructor')
    .sort();
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * All ten entity-collection helper triples, each with both sides of its link already bound. Ten
 * rows, not thirteen: Group A [model/entity/PromotionQualifier.cfc:L73-L75] has no helpers to
 * probe.
 *
 * @param subject the qualifier under test; every closure is bound to it.
 * @param fixtures a fresh graph, supplying the three far sides not constructed here.
 * @returns ten probes in declaration order [model/entity/PromotionQualifier.cfc:L77-L87].
 */
// JUDGMENT CALL: build the `Brand` and `Option` far sides locally but take `Sku`, `Product` and
// `ProductType` from the fixture graph, because those three modules are not in this file's
// declared dependency set.
function membershipPairProbes(
  subject: PromotionQualifier,
  fixtures: PromotionFixtures,
): readonly MembershipPairProbe[] {
  const brand: Brand = aBrand('probe-brand');
  const excludedBrand: Brand = aBrand('probe-excluded-brand');
  const option: Option = anOption('probe-option');
  const excludedOption: Option = anOption('probe-excluded-option');
  const { sku, product, productType, excludedProductType } = fixtures;

  return [
    {
      property: 'brands',
      linkTable: LEGACY_LINK_TABLES.brands,
      family: 'include',
      add: () => {
        subject.addBrand(brand);
      },
      remove: () => {
        subject.removeBrand(brand);
      },
      has: () => subject.hasBrand(brand),
      nearSide: () => subject.getBrands(),
      farSide: () => brand.getPromotionQualifiers(),
    },
    {
      property: 'options',
      linkTable: LEGACY_LINK_TABLES.options,
      family: 'include',
      add: () => {
        subject.addOption(option);
      },
      remove: () => {
        subject.removeOption(option);
      },
      has: () => subject.hasOption(option),
      nearSide: () => subject.getOptions(),
      farSide: () => option.getPromotionQualifiers(),
    },
    {
      property: 'skus',
      linkTable: LEGACY_LINK_TABLES.skus,
      family: 'include',
      add: () => {
        subject.addSku(sku);
      },
      remove: () => {
        subject.removeSku(sku);
      },
      has: () => subject.hasSku(sku),
      nearSide: () => subject.getSkus(),
      farSide: () => sku.getPromotionQualifiers(),
    },
    {
      property: 'products',
      linkTable: LEGACY_LINK_TABLES.products,
      family: 'include',
      add: () => {
        subject.addProduct(product);
      },
      remove: () => {
        subject.removeProduct(product);
      },
      has: () => subject.hasProduct(product),
      nearSide: () => subject.getProducts(),
      farSide: () => product.getPromotionQualifiers(),
    },
    {
      property: 'productTypes',
      linkTable: LEGACY_LINK_TABLES.productTypes,
      family: 'include',
      add: () => {
        subject.addProductType(productType);
      },
      remove: () => {
        subject.removeProductType(productType);
      },
      has: () => subject.hasProductType(productType),
      nearSide: () => subject.getProductTypes(),
      farSide: () => productType.getPromotionQualifiers(),
    },
    {
      property: 'excludedBrands',
      linkTable: LEGACY_LINK_TABLES.excludedBrands,
      family: 'exclude',
      add: () => {
        subject.addExcludedBrand(excludedBrand);
      },
      remove: () => {
        subject.removeExcludedBrand(excludedBrand);
      },
      has: () => subject.hasExcludedBrand(excludedBrand),
      nearSide: () => subject.getExcludedBrands(),
      farSide: () => excludedBrand.getPromotionQualifierExclusions(),
    },
    {
      property: 'excludedOptions',
      linkTable: LEGACY_LINK_TABLES.excludedOptions,
      family: 'exclude',
      add: () => {
        subject.addExcludedOption(excludedOption);
      },
      remove: () => {
        subject.removeExcludedOption(excludedOption);
      },
      has: () => subject.hasExcludedOption(excludedOption),
      nearSide: () => subject.getExcludedOptions(),
      farSide: () => excludedOption.getPromotionQualifierExclusions(),
    },
    {
      property: 'excludedSkus',
      linkTable: LEGACY_LINK_TABLES.excludedSkus,
      family: 'exclude',
      add: () => {
        subject.addExcludedSku(sku);
      },
      remove: () => {
        subject.removeExcludedSku(sku);
      },
      has: () => subject.hasExcludedSku(sku),
      nearSide: () => subject.getExcludedSkus(),
      farSide: () => sku.getPromotionQualifierExclusions(),
    },
    {
      property: 'excludedProducts',
      linkTable: LEGACY_LINK_TABLES.excludedProducts,
      family: 'exclude',
      add: () => {
        subject.addExcludedProduct(product);
      },
      remove: () => {
        subject.removeExcludedProduct(product);
      },
      has: () => subject.hasExcludedProduct(product),
      nearSide: () => subject.getExcludedProducts(),
      farSide: () => product.getPromotionQualifierExclusions(),
    },
    {
      property: 'excludedProductTypes',
      linkTable: LEGACY_LINK_TABLES.excludedProductTypes,
      family: 'exclude',
      add: () => {
        subject.addExcludedProductType(excludedProductType);
      },
      remove: () => {
        subject.removeExcludedProductType(excludedProductType);
      },
      has: () => subject.hasExcludedProductType(excludedProductType),
      nearSide: () => subject.getExcludedProductTypes(),
      farSide: () => excludedProductType.getPromotionQualifierExclusions(),
    },
  ];
}

describe('the ported surface is the legacy surface, and four scope rulings hold', () => {
  it('installs exactly the seventy-one authored members and nothing else', () => {
    expect(prototypeMembers()).toEqual([...PORTED_PUBLIC_SURFACE].sort());
    expect(PORTED_PUBLIC_SURFACE).toHaveLength(71);
  });

  it('keeps every legacy method name verbatim, including the ones that read oddly', () => {
    for (const legacyName of [
      'getRewardMatchingTypeOptions',
      'getSimpleRepresentation',
      'getSimpleRepresentationPropertyName',
      'hasAnyOption',
      'hasAnyExcludedOption',
      'setPromotionPeriod',
      'removePromotionPeriod',
      'isDeletable',
      'isNew',
    ]) {
      expect(PORTED_PUBLIC_SURFACE).toContain(legacyName);
    }
  });

  it('exposes eleven bidirectional helper pairs and not one more', () => {
    // CFML parity [model/entity/PromotionQualifier.cfc:L119-L339]: the largest section of the
    // component, 221 lines, holds ELEVEN pairs - one many-to-one plus ten many-to-many - for
    // FOURTEEN relationships.
    const helpers = prototypeMembers().filter(
      (name: string) =>
        name.startsWith('add') || name.startsWith('remove') || name.startsWith('set'),
    );

    expect(helpers).toHaveLength(22);
    expect(helpers.filter((name: string) => name.startsWith('add'))).toHaveLength(10);
    expect(helpers.filter((name: string) => name.startsWith('remove'))).toHaveLength(11);
    expect(helpers.filter((name: string) => name.startsWith('set'))).toHaveLength(1);
  });

  it('declares no setPromotion and no removePromotion, which is why the period helpers throw', () => {
    const subject = aQualifier();
    const members = prototypeMembers();

    for (const absent of ABSENT_PERIOD_SIDE_HELPERS) {
      expect(members).not.toContain(absent);
      expect(absent in subject).toBe(false);
    }

    // The two members that do exist, and are the only period-side helpers
    // [model/entity/PromotionQualifier.cfc:L122, L128].
    expect(members).toContain('setPromotionPeriod');
    expect(members).toContain('removePromotionPeriod');
  });

  it('widens no signature, so every member keeps its legacy arity', () => {
    const prototype: object = PromotionQualifier.prototype;
    const legacyArity: Readonly<Record<string, number>> = {
      // Zero-argument members - readers, the two overrides, and the option list.
      getPromotionQualifierID: 0,
      getQualifierType: 0,
      getRewardMatchingType: 0,
      getRewardMatchingTypeOptions: 0,
      getPromotionPeriod: 0,
      getSimpleRepresentation: 0,
      getSimpleRepresentationPropertyName: 0,
      isNew: 0,
      isDeletable: 0,
      // One-argument members - the predicates and the helpers.
      hasBrand: 1,
      hasExcludedBrand: 1,
      hasAnyOption: 1,
      hasAnyExcludedOption: 1,
      addBrand: 1,
      removeBrand: 1,
      addExcludedOption: 1,
      removeExcludedOption: 1,
      setPromotionPeriod: 1,
      // `removePromotionPeriod(promotionPeriod?)` reports 1, and measuring that corrected a wrong
      // assumption: `Function.prototype.length` excludes only parameters carrying a default value
      // (and a rest parameter).
      removePromotionPeriod: 1,
    };

    for (const [member, arity] of Object.entries(legacyArity)) {
      const implementation: unknown = (prototype as Record<string, unknown>)[member];

      expect(typeof implementation, `${member} must be a method`).toBe('function');
      expect((implementation as (...args: never[]) => unknown).length, `${member} arity`).toBe(
        arity,
      );
    }

    // And the ten gate readers all take nothing - a gate is a column, not a query.
    for (const gate of Object.keys(GATE_READERS) as readonly QualifierGateName[]) {
      const reader: unknown = (prototype as Record<string, unknown>)[gateAccessorName(gate)];
      expect((reader as (...args: never[]) => unknown).length, `${gate} reader arity`).toBe(0);
    }
  });

  it('completes none of the four gaps it deliberately keeps', () => {
    const subject = aQualifier();
    const members = prototypeMembers();

    for (const absent of ABSENT_BY_SCOPE_RULING) {
      expect(members).not.toContain(absent);
      expect(absent in subject).toBe(false);
    }

    expect(ABSENT_BY_SCOPE_RULING).toHaveLength(18);
  });

  it('ports no framework member and reproduces no dynamic dispatch', () => {
    const subject = aQualifier();
    const members = prototypeMembers();

    for (const absent of UNPORTED_FRAMEWORK_MEMBERS) {
      expect(members).not.toContain(absent);
    }
    expect('getSomeMemberThatWasNeverDeclared' in subject).toBe(false);
    expect(Object.getPrototypeOf(subject)).toBe(PromotionQualifier.prototype);
  });

  it('adds no instance surface through its private comparison helper', () => {
    const subject = aQualifier();

    // `indexOfEntity` is `private static`, so it lives on the constructor.
    expect(prototypeMembers()).not.toContain('indexOfEntity');
    expect('indexOfEntity' in subject).toBe(false);
    expect(Object.getOwnPropertyNames(PromotionQualifier)).toContain('indexOfEntity');
  });

  it('injects no collaborator port and no clock', () => {
    // CFML parity: a full read of all 373 lines finds ZERO `getService(` sites in this component,
    // so nothing is injected and the constructor takes DATA only.
    const subject = aQualifier({ promotionQualifierID: 'q-no-collaborators' });

    expect(subject.getPromotionQualifierID()).toBe('q-no-collaborators');

    // Clock is not one of its slots, and `PromotionPeriod` is the entity that takes one.
    // @ts-expect-error - the constructor accepts columns and materialized associations only; a
    // clock is not one of its slots, and `PromotionPeriod` is the entity that takes one.
    const withClock = aQualifier({ now: fixedClock(NOW_UTC) });
    expect(withClock.getPromotionQualifierID()).toBe('');
  });
});

// The asymmetry is systematic rather than incidental - it holds for all five pairs, across all
// three type families - and there is no `default=` attribute on any of the ten.
//
// JUDGMENT CALL: sweep the ten gates through a derived reader table rather than ten hand-rolled
// assertions per property.

describe('the ten numeric gates carry asymmetric absence semantics', () => {
  it('declares exactly ten gates, five lower bounds and five upper bounds', () => {
    const gates: readonly QualifierGateSpec[] = freshFixtures().qualifierGateNullDefaults;

    expect(gates).toHaveLength(10);
    expect(Object.keys(GATE_READERS)).toHaveLength(10);
    expect(gates.filter((gate) => gate.bound === 'minimum')).toHaveLength(5);
    expect(gates.filter((gate) => gate.bound === 'maximum')).toHaveLength(5);
  });

  it('gives every minimum define.0 and every maximum define.unlimited', () => {
    const gates: readonly QualifierGateSpec[] = freshFixtures().qualifierGateNullDefaults;

    for (const gate of gates) {
      if (gate.bound === 'minimum') {
        expect(gate.gate.startsWith('minimum')).toBe(true);
        expect(gate.nullRBKey).toBe('define.0');
      } else {
        expect(gate.gate.startsWith('maximum')).toBe(true);
        expect(gate.nullRBKey).toBe('define.unlimited');
      }
    }

    // Stated once more as a whole-table claim, so a single row drifting fails loudly.
    expect(gates.filter((gate) => gate.nullRBKey === 'define.0').map((gate) => gate.gate)).toEqual([
      'minimumOrderQuantity',
      'minimumOrderSubtotal',
      'minimumItemQuantity',
      'minimumItemPrice',
      'minimumFulfillmentWeight',
    ]);
    expect(
      gates.filter((gate) => gate.nullRBKey === 'define.unlimited').map((gate) => gate.gate),
    ).toEqual([
      'maximumOrderQuantity',
      'maximumOrderSubtotal',
      'maximumItemQuantity',
      'maximumItemPrice',
      'maximumFulfillmentWeight',
    ]);
  });

  it('authors one accessor per gate, named from the column', () => {
    const members = prototypeMembers();

    for (const gate of Object.keys(GATE_READERS) as readonly QualifierGateName[]) {
      expect(members).toContain(gateAccessorName(gate));
    }
  });

  it('resolves every gate to undefined when the column is absent', () => {
    const subject = aQualifier();

    for (const [gate, read] of Object.entries(GATE_READERS)) {
      const value: Money | number | undefined = read(subject);

      expect(value, `${gate} must be undefined when absent`).toBeUndefined();
    }
  });

  it('never coerces an absent gate to zero, on either bound', () => {
    // The highest-consequence assertion in this block.
    const subject = aQualifier();

    for (const [gate, read] of Object.entries(GATE_READERS)) {
      const value: Money | number | undefined = read(subject);

      expect(value, `${gate} must not be numeric zero`).not.toBe(0);
      expect(value, `${gate} must not be a Money zero`).not.toBeInstanceOf(Money);
      expect(typeof value, `${gate} must not be a number at all`).not.toBe('number');
    }
  });

  it('reads every gate as undefined on the fixture graph permissive qualifier too', () => {
    // A second, independently constructed witness: the fixture module builds this exhibit with all
    // ten columns omitted, which is the shape a repository hands back for a row that gates
    // nothing.
    const { permissivePromotionQualifier } = freshFixtures();

    for (const [gate, read] of Object.entries(GATE_READERS)) {
      expect(
        read(permissivePromotionQualifier),
        `${gate} on the permissive qualifier`,
      ).toBeUndefined();
    }
  });

  it('keeps an explicit zero distinguishable from absence on a lower bound', () => {
    const configured = aQualifier({
      minimumOrderQuantity: 0,
      minimumOrderSubtotal: Money.fromDecimalString('0'),
    });
    const absent = aQualifier();

    expect(configured.getMinimumOrderQuantity()).toBe(0);
    expect(configured.getMinimumOrderQuantity()).not.toBeUndefined();
    expect(absent.getMinimumOrderQuantity()).toBeUndefined();

    // P4: the monetary bound is compared through `Money`, never through a JavaScript number.
    expect(configured.getMinimumOrderSubtotal()?.toFixed2()).toBe('0.00');
    expect(configured.getMinimumOrderSubtotal()?.equals(Money.zero)).toBe(true);
    expect(absent.getMinimumOrderSubtotal()).toBeUndefined();
  });

  it('keeps an explicit zero distinguishable from absence on an upper bound', () => {
    // A `maximumOrderQuantity` of 0 is a REAL, restrictive configuration: nothing qualifies.
    const configured = aQualifier({
      maximumOrderQuantity: 0,
      maximumItemPrice: Money.fromDecimalString('0'),
    });
    const absent = aQualifier();

    expect(configured.getMaximumOrderQuantity()).toBe(0);
    expect(absent.getMaximumOrderQuantity()).toBeUndefined();
    expect(configured.getMaximumOrderQuantity()).not.toBe(absent.getMaximumOrderQuantity());

    expect(configured.getMaximumItemPrice()?.toFixed2()).toBe('0.00');
    expect(absent.getMaximumItemPrice()).toBeUndefined();
  });

  it('hands every configured gate straight back, unmodified', () => {
    // The entity is a CARRIER for these ten columns: no clamping, no normalisation, no reordering
    // of a min/max pair, and no rejection of a maximum below its minimum.
    const subject = aQualifier({
      minimumOrderQuantity: 9,
      maximumOrderQuantity: 2,
      minimumOrderSubtotal: Money.fromDecimalString('500.00'),
      maximumOrderSubtotal: Money.fromDecimalString('25.00'),
      minimumItemQuantity: -4,
      maximumItemQuantity: 10,
      minimumItemPrice: Money.fromDecimalString('199.99'),
      maximumItemPrice: Money.fromDecimalString('9.99'),
      minimumFulfillmentWeight: 50,
      maximumFulfillmentWeight: 1,
    });

    expect(subject.getMinimumOrderQuantity()).toBe(9);
    expect(subject.getMaximumOrderQuantity()).toBe(2);
    expect(subject.getMinimumOrderSubtotal()?.toFixed2()).toBe('500.00');
    expect(subject.getMaximumOrderSubtotal()?.toFixed2()).toBe('25.00');
    expect(subject.getMinimumItemQuantity()).toBe(-4);
    expect(subject.getMaximumItemQuantity()).toBe(10);
    expect(subject.getMinimumItemPrice()?.toFixed2()).toBe('199.99');
    expect(subject.getMaximumItemPrice()?.toFixed2()).toBe('9.99');
    expect(subject.getMinimumFulfillmentWeight()).toBe(50);
    expect(subject.getMaximumFulfillmentWeight()).toBe(1);
  });
});

// CFML parity [model/entity/PromotionQualifier.cfc:L63-L64]: minimumFulfillmentWeight and
// maximumFulfillmentWeight are ormtype="big_decimal" like the currency gates, but
// hb_formatType="weight" -- they are WEIGHTS, not money, and must not be modelled as Money.
//
// So `ormtype` alone does not decide the target type; `hb_formatType` does.

describe('the ten gates split into three type families, and weight is never Money', () => {
  it('classifies exactly four gates as monetary and six as plain numbers', () => {
    const gates: readonly QualifierGateSpec[] = freshFixtures().qualifierGateNullDefaults;

    expect(gates.filter((gate) => gate.isMonetary).map((gate) => gate.gate)).toEqual([
      'minimumOrderSubtotal',
      'maximumOrderSubtotal',
      'minimumItemPrice',
      'maximumItemPrice',
    ]);
    expect(gates.filter((gate) => gate.formatType === 'currency')).toHaveLength(4);
    expect(gates.filter((gate) => gate.formatType === 'weight')).toHaveLength(2);
    expect(gates.filter((gate) => gate.formatType === 'none')).toHaveLength(4);
  });

  it('returns Money from all four currency gates', () => {
    const subject = aQualifier({
      minimumOrderSubtotal: Money.fromDecimalString('25.00'),
      maximumOrderSubtotal: Money.fromDecimalString('500.00'),
      minimumItemPrice: Money.fromDecimalString('9.99'),
      maximumItemPrice: Money.fromDecimalString('199.99'),
    });

    for (const value of [
      subject.getMinimumOrderSubtotal(),
      subject.getMaximumOrderSubtotal(),
      subject.getMinimumItemPrice(),
      subject.getMaximumItemPrice(),
    ]) {
      expect(value).toBeInstanceOf(Money);
      expect(typeof value).not.toBe('number');
    }

    // Decimal strings, never floats.
    expect(subject.getMinimumOrderSubtotal()?.toFixed2()).toBe('25.00');
    expect(subject.getMinimumOrderSubtotal()?.toDecimalString()).toBe('25');
    expect(subject.getMinimumItemPrice()?.toFixed2()).toBe('9.99');
    expect(subject.getMaximumItemPrice()?.toFixed2()).toBe('199.99');
  });

  it('returns plain numbers from the four integer quantity gates', () => {
    const subject = aQualifier({
      minimumOrderQuantity: 2,
      maximumOrderQuantity: 20,
      minimumItemQuantity: 1,
      maximumItemQuantity: 10,
    });

    for (const value of [
      subject.getMinimumOrderQuantity(),
      subject.getMaximumOrderQuantity(),
      subject.getMinimumItemQuantity(),
      subject.getMaximumItemQuantity(),
    ]) {
      expect(typeof value).toBe('number');
      expect(value).not.toBeInstanceOf(Money);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('returns plain numbers - never Money - from the two weight gates', () => {
    // The ASSERTION this BLOCK EXISTS for. `big_decimal` on
    // [model/entity/PromotionQualifier.cfc:L63-L64] makes these look exactly like the currency
    // gates in the ORM metadata, and `hb_formatType="weight"` is the only thing that distinguishes
    // them.
    const subject = aQualifier({
      minimumFulfillmentWeight: 1,
      maximumFulfillmentWeight: 50,
    });

    expect(subject.getMinimumFulfillmentWeight()).toBe(1);
    expect(subject.getMaximumFulfillmentWeight()).toBe(50);
    expect(subject.getMinimumFulfillmentWeight()).not.toBeInstanceOf(Money);
    expect(subject.getMaximumFulfillmentWeight()).not.toBeInstanceOf(Money);
    expect(typeof subject.getMinimumFulfillmentWeight()).toBe('number');
    expect(typeof subject.getMaximumFulfillmentWeight()).toBe('number');
  });

  it('rejects Money in a weight slot and a number in a currency slot at compile time', () => {
    // @ts-expect-error - `minimumFulfillmentWeight` [model/entity/PromotionQualifier.cfc:L63] is a
    // weight and is typed `number`; handing it a `Money` would assert a currency the column does
    // not have.
    const weightAsMoney = aQualifier({ minimumFulfillmentWeight: Money.fromDecimalString('1') });
    expect(weightAsMoney.getMinimumFulfillmentWeight()).toBeInstanceOf(Money);

    // @ts-expect-error - `minimumOrderSubtotal` [model/entity/PromotionQualifier.cfc:L57] is
    // `hb_formatType="currency"` and is typed `Money`; a raw number would put currency arithmetic
    // outside the single arithmetic surface.
    const moneyAsNumber = aQualifier({ minimumOrderSubtotal: 25 });
    expect(moneyAsNumber.getMinimumOrderSubtotal()).toBe(25);
  });

  it('carries a fractional weight without rounding it', () => {
    // `big_decimal` [model/entity/PromotionQualifier.cfc:L63] is not an integer column, so a
    // fractional weight is legitimate data.
    const subject = aQualifier({ minimumFulfillmentWeight: 2.5, maximumFulfillmentWeight: 47.5 });

    expect(subject.getMinimumFulfillmentWeight()).toBe(2.5);
    expect(subject.getMaximumFulfillmentWeight()).toBe(47.5);
  });
});

// CFML parity [model/entity/PromotionQualifier.cfc:L99, L107-L115]: a DOUBLE ORPHAN.
// QualifierApplicationTypeOptions is declared as a non-persistent property at L99 but has no
// getter.
//
// `property name="qualifierApplicationTypeOptions" type="array" persistent="false";` Nothing in
// the component's 373 lines reads it, writes it.

describe('the double orphan is preserved on both halves and completed on neither', () => {
  it('records both halves of the mismatch with their verified locators', () => {
    const { qualifierOptionListMismatch } = freshFixtures();

    expect(qualifierOptionListMismatch.declaredPropertyWithoutProvider).toBe(
      'qualifierApplicationTypeOptions',
    );
    expect(qualifierOptionListMismatch.declaredPropertyLocator).toBe(
      'model/entity/PromotionQualifier.cfc:L99',
    );
    expect(qualifierOptionListMismatch.providerWithoutDeclaredProperty).toBe(
      'getRewardMatchingTypeOptions',
    );
    expect(qualifierOptionListMismatch.providerLocator).toBe(
      'model/entity/PromotionQualifier.cfc:L107-L115',
    );
    // The provider is not orphaned in the sense of being dead - it serves a REAL column.
    expect(qualifierOptionListMismatch.providerServesProperty).toBe('rewardMatchingType');
  });

  it('authors no accessor for the declared property that has no provider', () => {
    // HALF one. `qualifierApplicationTypeOptions` [model/entity/PromotionQualifier.cfc:L99] is
    // `persistent="false"` and unreachable in the source, so the port exposes nothing for it under
    // any spelling.
    const subject = aQualifier();
    const members = prototypeMembers();

    for (const spelling of [
      'getQualifierApplicationTypeOptions',
      'qualifierApplicationTypeOptions',
      'getQualifierApplicationType',
      'getQualifierTypeOptions',
    ]) {
      expect(members, `${spelling} must not be authored`).not.toContain(spelling);
      expect(spelling in subject, `${spelling} must not resolve on an instance`).toBe(false);
    }
  });

  it('authors the provider that has no declared property', () => {
    const subject = aQualifier();

    expect(prototypeMembers()).toContain('getRewardMatchingTypeOptions');
    expect(typeof subject.getRewardMatchingTypeOptions).toBe('function');
    expect(subject.getRewardMatchingTypeOptions()).toHaveLength(5);
  });

  it('serves the option list from a bare instance, with no column set', () => {
    // The list is a CONSTANT of the class, not a projection of the row: the admin form needs the
    // domain before the user has chosen from it.
    const bare = aQualifier();

    expect(bare.getRewardMatchingType()).toBeUndefined();
    expect(bare.getRewardMatchingTypeOptions().map((option) => option.value)).toEqual(
      REWARD_MATCHING_TYPES,
    );
  });

  it('serves the same option list from every instance, whatever the column holds', () => {
    // Two independently built subjects - one saved with a chosen mode, one transient with none -
    // must offer identical vocabularies.
    const chosen = aSavedQualifier('qualifier-with-mode', { rewardMatchingType: 'productType' });
    const bare = aQualifier();

    expect(chosen.getRewardMatchingTypeOptions()).toEqual(bare.getRewardMatchingTypeOptions());
    expect(chosen.getRewardMatchingType()).toBe('productType');
  });
});

// CFML parity [model/entity/PromotionQualifier.cfc:L109-L113]: five values in the source's own
// order, `any`, `sku`, `product`, `productType`, `brand`.
//
// This suite pins the shipped reality and does not narrow `qualifierType`.

describe('the matching vocabulary is closed and ordered, and qualifierType stays open', () => {
  it('closes RewardMatchingType over exactly the five source values', () => {
    expect(REWARD_MATCHING_TYPES).toEqual(['any', 'sku', 'product', 'productType', 'brand']);
    expect(REWARD_MATCHING_TYPES).toHaveLength(5);

    // Every member of the union is accepted by the constructor and read straight back.
    for (const matchingType of REWARD_MATCHING_TYPES) {
      expect(aQualifier({ rewardMatchingType: matchingType }).getRewardMatchingType()).toBe(
        matchingType,
      );
    }
  });

  it('rejects a sixth matching type at compile time', () => {
    // @ts-expect-error - `sixthMode` is not one of the five
    // [model/entity/PromotionQualifier.cfc:L109-L113]; the union is closed and no member may be
    // added, renamed or reordered.
    const invented = aQualifier({ rewardMatchingType: 'sixthMode' });

    // The value still round-trips at runtime, because the entity is a carrier and performs no
    // validation - there is no PromotionQualifier.json to reject it.
    expect(invented.getRewardMatchingType()).toBe('sixthMode');
  });

  it('rejects a plausible near-miss spelling at compile time', () => {
    // @ts-expect-error - the source writes `productType`
    // [model/entity/PromotionQualifier.cfc:L112], not `producttype`. Case matters in TypeScript
    // where it did not in CFML, so the union is the place the casing is pinned.
    const nearMiss = aQualifier({ rewardMatchingType: 'producttype' });
    expect(nearMiss.getRewardMatchingType()).toBe('producttype');
  });

  it('matches the option list values to the union one-for-one, in source order', () => {
    const options = aQualifier().getRewardMatchingTypeOptions();

    expect(options.map((option) => option.value)).toEqual(REWARD_MATCHING_TYPES);
    expect(freshFixtures().rewardMatchingTypeVocabulary).toEqual(REWARD_MATCHING_TYPES);

    // Positionally, not just as a set - `any` FIRST is the source's own ordering
    // [model/entity/PromotionQualifier.cfc:L109].
    const [first, second, third, fourth, fifth] = options;
    expect(first.value).toBe('any');
    expect(second.value).toBe('sku');
    expect(third.value).toBe('product');
    expect(fourth.value).toBe('productType');
    expect(fifth.value).toBe('brand');
  });

  it('keeps every option name an inert resource-bundle key, never a translated label', () => {
    // JavaRB is not ported and no i18n runtime is introduced, so the keys are preserved verbatim
    // as strings the legacy admin can still resolve.
    const options = aQualifier().getRewardMatchingTypeOptions();

    expect(options.map((option) => option.name)).toEqual(REWARD_MATCHING_TYPE_OPTION_KEYS);

    for (const option of options) {
      expect(option.name).toBe(`entity.promotionQualifier.rewardMatchingType.${option.value}`);
      expect(option.name.startsWith('entity.promotionQualifier.rewardMatchingType.')).toBe(true);
    }
  });

  it('exposes only name and value on an option row', () => {
    // No `selected`, no `disabled`, no display text - the legacy struct carries exactly two keys
    // [model/entity/PromotionQualifier.cfc:L110-L113] and the port carries exactly two.
    for (const option of aQualifier().getRewardMatchingTypeOptions()) {
      expect(Object.keys(option).sort()).toEqual(['name', 'value']);
    }
  });

  it('leaves qualifierType an un-narrowed string, as the shipped surface has it', () => {
    // [model/entity/PromotionQualifier.cfc:L53] declares `ormtype="string"` with
    // `hb_formatType="rbKey"`, no option list and no length constraint.
    for (const qualifierType of ['merchandise', 'contentAccess', 'subscription']) {
      expect(aQualifier({ qualifierType }).getQualifierType()).toBe(qualifierType);
    }

    // And a value outside that trio is accepted without complaint, at compile time and at run
    // time, which is precisely what "un-narrowed" means.
    const unexpected = aQualifier({ qualifierType: 'somethingTheAdminTyped' });
    expect(unexpected.getQualifierType()).toBe('somethingTheAdminTyped');
    expect(aQualifier({ qualifierType: 'MERCHANDISE' }).getQualifierType()).toBe('MERCHANDISE');
    expect(aQualifier({ qualifierType: '' }).getQualifierType()).toBe('');
  });

  it('resolves an absent qualifierType to undefined rather than to an empty string', () => {
    // A NULL column and a column holding `''` are different rows, and the port keeps them
    // different, applying the discipline the ten gates get to the string column.
    expect(aQualifier().getQualifierType()).toBeUndefined();
    expect(aQualifier({ qualifierType: '' }).getQualifierType()).not.toBeUndefined();
  });

  it('resolves an absent rewardMatchingType to undefined rather than to the first option', () => {
    // The narrowed union does not imply a default.
    const bare = aQualifier();

    expect(bare.getRewardMatchingType()).toBeUndefined();
    expect(bare.getRewardMatchingType()).not.toBe('any');
  });
});

// CFML parity [model/entity/PromotionQualifier.cfc:L73-L87]: thirteen many-to-many OWNER
// collections, one fewer than PromotionReward's fourteen -- the qualifier has no
// eligiblePriceGroups. Do not invent one.

describe('the thirteen associations split three ways, and the fourteenth is not invented', () => {
  it('counts exactly thirteen many-to-many collections', () => {
    const { qualifierManyToManyCollectionCount } = freshFixtures();

    expect(qualifierManyToManyCollectionCount).toBe(13);
    expect(Object.keys(LEGACY_LINK_TABLES)).toHaveLength(13);
  });

  it('declares no eligiblePriceGroups, under any spelling', () => {
    // The one-collection difference from `PromotionReward` [model/entity/PromotionReward.cfc:L74].
    const subject = aQualifier();
    const members = prototypeMembers();

    for (const spelling of [
      'getEligiblePriceGroups',
      'addEligiblePriceGroup',
      'removeEligiblePriceGroup',
      'hasEligiblePriceGroup',
      'getPriceGroups',
      'getEligiblePriceGroupIDs',
    ]) {
      expect(members, `${spelling} must not exist on the qualifier`).not.toContain(spelling);
      expect(spelling in subject, `${spelling} must not resolve on an instance`).toBe(false);
    }
  });

  it('collapses the three Group A relationships to opaque identifier arrays', () => {
    // The renamed readers are the one departure from verbatim CFML naming here, and the rename is
    // what makes it honest: `getFulfillmentMethodIDs()` says "strings".
    const subject = aQualifier({
      fulfillmentMethodIDs: ['fulfillment-method-one', 'fulfillment-method-two'],
      shippingMethodIDs: ['shipping-method-one'],
      shippingAddressZoneIDs: ['address-zone-one'],
    });

    expect(subject.getFulfillmentMethodIDs()).toEqual([
      'fulfillment-method-one',
      'fulfillment-method-two',
    ]);
    expect(subject.getShippingMethodIDs()).toEqual(['shipping-method-one']);
    expect(subject.getShippingAddressZoneIDs()).toEqual(['address-zone-one']);

    for (const identifiers of [
      subject.getFulfillmentMethodIDs(),
      subject.getShippingMethodIDs(),
      subject.getShippingAddressZoneIDs(),
    ]) {
      for (const identifier of identifiers) {
        expect(typeof identifier).toBe('string');
      }
    }
  });

  it('gives Group A no add, no remove and no has helper', () => {
    // The absence is the assertion.
    const members = prototypeMembers();

    for (const property of GROUP_A_PROPERTIES) {
      const singular: string = property.endsWith('s') ? property.slice(0, -1) : property;
      const capitalised: string = `${singular.charAt(0).toUpperCase()}${singular.slice(1)}`;

      expect(members).not.toContain(`add${capitalised}`);
      expect(members).not.toContain(`remove${capitalised}`);
      expect(members).not.toContain(`has${capitalised}`);
      // Nor the un-renamed entity-shaped reader.
      expect(members).not.toContain(`get${capitalised}s`);
    }

    // And exactly three renamed readers exist in their place.
    expect(members.filter((name: string) => name.endsWith('IDs'))).toEqual([
      'getFulfillmentMethodIDs',
      'getShippingAddressZoneIDs',
      'getShippingMethodIDs',
    ]);
  });

  it('defaults every Group A array to empty, never to undefined', () => {
    // An unset link table is an EMPTY set of identifiers, not an absent one - the opposite ruling
    // from the ten gates, and correct for the opposite reason: emptiness is knowable from the link
    // table itself.
    const subject = aQualifier();

    expect(subject.getFulfillmentMethodIDs()).toEqual([]);
    expect(subject.getShippingMethodIDs()).toEqual([]);
    expect(subject.getShippingAddressZoneIDs()).toEqual([]);
  });

  it('materializes the ten Group B and Group C collections as entity arrays', () => {
    const subject = aQualifier();
    const probes = membershipPairProbes(subject, freshFixtures());

    expect(probes).toHaveLength(10);
    expect(probes.filter((probe) => probe.family === 'include')).toHaveLength(5);
    expect(probes.filter((probe) => probe.family === 'exclude')).toHaveLength(5);

    // Ten of the thirteen, in declaration order [model/entity/PromotionQualifier.cfc:L77-L87].
    expect(probes.map((probe) => probe.property)).toEqual([
      'brands',
      'options',
      'skus',
      'products',
      'productTypes',
      'excludedBrands',
      'excludedOptions',
      'excludedSkus',
      'excludedProducts',
      'excludedProductTypes',
    ]);
  });

  it('defaults every Group B and Group C collection to empty', () => {
    const subject = aQualifier();

    for (const probe of membershipPairProbes(subject, freshFixtures())) {
      expect(probe.nearSide(), `${probe.property} must default to empty`).toEqual([]);
    }
  });

  // C5 SCHEMA CONTINUITY - `SwPromoQual` is not `SwPromotionQualifier`, and none of the thirteen
  // link tables spells `Excluded` out - is NOT asserted here. `LEGACY_TABLE` and
  // `LEGACY_LINK_TABLES` are declared in this file, so comparing them with the same literals proves
  // only that the file holds what it was written to hold; a target module that misspelled a table
  // would sail past it. The check lives where the shipped text is readable:
  // tests/traceability/legacyTestMap.ts block A30 derives all thirteen `SwPromoQual*` names from
  // [model/entity/PromotionQualifier.cfc:L73-L87] and holds `src/` to them, in code and in
  // commentary. The constants stay because the membership probes below are LABELLED with them.

  it('carries the type="array" declaration inconsistency forward without normalising it', () => {
    // CFML parity [model/entity/PromotionQualifier.cfc:L83-L84]: only `excludedBrands` and
    // `excludedOptions` declare `type="array"`; the other ELEVEN many-to-many declarations omit
    // it.
    const subject = aQualifier();
    const probes = membershipPairProbes(subject, freshFixtures());
    const declaredWithTypeArray: readonly string[] = ['excludedBrands', 'excludedOptions'];

    for (const probe of probes) {
      expect(Array.isArray(probe.nearSide())).toBe(true);
      expect(probe.nearSide()).toEqual([]);
      expect(probe.has()).toBe(false);
    }

    // The two that declare it are ordinary members of the same ten, distinguished by nothing.
    const distinguished = probes.filter((probe) => declaredWithTypeArray.includes(probe.property));
    expect(distinguished).toHaveLength(2);
    for (const probe of distinguished) {
      expect(probe.family).toBe('exclude');
      expect(Array.isArray(probe.nearSide())).toBe(true);
    }
  });
});

// (a) comparison is by primary key for a persisted candidate - never object identity, never deep
// equality.
//
// (c) the far-side guard is `this.isNew() || !far.hasPromotionQualifier(this)`, reproduced from
// [model/entity/PromotionQualifier.cfc:L144] and its nine siblings.

describe('membership compares by primary key, and the collections are live', () => {
  it('matches a persisted far side by primary key across distinct objects', () => {
    const subject = aSavedQualifier('qualifier-membership');
    const held = aBrand('brand-shared-key');
    const twin = aBrand('brand-shared-key');

    subject.addBrand(held);

    expect(subject.hasBrand(held)).toBe(true);
    expect(subject.hasBrand(twin)).toBe(true);
    expect(twin).not.toBe(held);
    expect(subject.getBrands()).toHaveLength(1);

    // And removal by the TWIN removes the held row, because the key is what identifies it.
    subject.removeBrand(twin);
    expect(subject.getBrands()).toEqual([]);
    expect(subject.hasBrand(held)).toBe(false);
  });

  it('does not match a different key, however similar the object', () => {
    const subject = aSavedQualifier('qualifier-membership');
    const held = aBrand('brand-one');

    subject.addBrand(held);

    expect(subject.hasBrand(aBrand('brand-two'))).toBe(false);
    expect(subject.hasBrand(aBrand('BRAND-ONE'))).toBe(false);
  });

  it('falls back to reference identity for a transient far side', () => {
    // (a) second half - the mixed rule.
    const subject = aSavedQualifier('qualifier-membership');
    const firstTransient = aBrand();
    const secondTransient = aBrand();

    expect(firstTransient.getBrandID()).toBe('');
    expect(secondTransient.getBrandID()).toBe('');

    subject.addBrand(firstTransient);

    expect(subject.hasBrand(firstTransient)).toBe(true);
    expect(subject.hasBrand(secondTransient)).toBe(false);

    subject.addBrand(secondTransient);
    expect(subject.getBrands()).toEqual([firstTransient, secondTransient]);

    // Removal likewise targets the identity handed in, not the first empty-keyed row it finds.
    subject.removeBrand(firstTransient);
    expect(subject.getBrands()).toEqual([secondTransient]);
  });

  it('removes a first-position member rather than skipping it', () => {
    // The `findIndex` base-change trap, asserted rather than trusted.
    const subject = aSavedQualifier('qualifier-membership');
    const first = aBrand('brand-first');
    const second = aBrand('brand-second');

    subject.addBrand(first);
    subject.addBrand(second);
    expect(subject.getBrands()).toEqual([first, second]);

    subject.removeBrand(first);

    expect(subject.getBrands()).toEqual([second]);
    expect(subject.hasBrand(first)).toBe(false);
  });

  it('ignores a removal of something that was never a member', () => {
    // Both guarded deletions simply do not fire.
    const subject = aSavedQualifier('qualifier-membership');
    const held = aBrand('brand-held');
    const stranger = aBrand('brand-stranger');

    subject.addBrand(held);

    expect(() => {
      subject.removeBrand(stranger);
    }).not.toThrow();
    expect(subject.getBrands()).toEqual([held]);
  });

  it('returns the live collection, not a defensive copy, on all ten accessors', () => {
    const subject = aQualifier();

    for (const probe of membershipPairProbes(subject, freshFixtures())) {
      const before: readonly unknown[] = probe.nearSide();
      expect(probe.nearSide(), `${probe.property} must hand back one reference`).toBe(before);

      probe.add();
      expect(before, `${probe.property} must be observably mutated`).toHaveLength(1);
      expect(probe.nearSide()).toBe(before);
    }
  });

  it('keeps the include and exclude lists of one far side independent', () => {
    // Ten collections, ten link tables: adding to `excludedBrands` must not touch `brands`, and a
    // brand may legitimately sit on both lists - the legacy schema forbids it nowhere.
    const subject = aSavedQualifier('qualifier-membership');
    const brand = aBrand('brand-on-both-lists');

    subject.addBrand(brand);
    expect(subject.getBrands()).toEqual([brand]);
    expect(subject.getExcludedBrands()).toEqual([]);
    expect(subject.hasExcludedBrand(brand)).toBe(false);

    subject.addExcludedBrand(brand);
    expect(subject.getBrands()).toEqual([brand]);
    expect(subject.getExcludedBrands()).toEqual([brand]);
    expect(subject.hasBrand(brand)).toBe(true);
    expect(subject.hasExcludedBrand(brand)).toBe(true);

    // And the far side keeps them apart too, on two different collections.
    expect(brand.getPromotionQualifiers()).toEqual([subject]);
    expect(brand.getPromotionQualifierExclusions()).toEqual([subject]);

    subject.removeExcludedBrand(brand);
    expect(subject.getExcludedBrands()).toEqual([]);
    expect(subject.getBrands()).toEqual([brand]);
    expect(brand.getPromotionQualifiers()).toEqual([subject]);
    expect(brand.getPromotionQualifierExclusions()).toEqual([]);
  });

  it('synchronises both sides of all ten links on add and on remove', () => {
    // (c) far-side symmetry, swept across every helper pair rather than sampled.
    const subject = aSavedQualifier('qualifier-symmetry');

    for (const probe of membershipPairProbes(subject, freshFixtures())) {
      expect(probe.farSide(), `${probe.property} far side must start clean`).toEqual([]);

      probe.add();
      expect(probe.nearSide(), `${probe.property} near side after add`).toHaveLength(1);
      expect(probe.farSide(), `${probe.property} far side after add`).toEqual([subject]);
      expect(probe.has(), `${probe.property} predicate after add`).toBe(true);

      probe.remove();
      expect(probe.nearSide(), `${probe.property} near side after remove`).toEqual([]);
      expect(probe.farSide(), `${probe.property} far side after remove`).toEqual([]);
      expect(probe.has(), `${probe.property} predicate after remove`).toBe(false);
    }
  });

  it('appends nothing twice when both sides are already persisted', () => {
    // Both `isNew()` short-circuits false, both containment probes run, and a repeated `add*` is
    // idempotent on both sides.
    const subject = aSavedQualifier('qualifier-idempotent');

    for (const probe of membershipPairProbes(subject, freshFixtures())) {
      probe.add();
      probe.add();
      probe.add();

      expect(probe.nearSide(), `${probe.property} near side must not duplicate`).toHaveLength(1);
      expect(probe.farSide(), `${probe.property} far side must not duplicate`).toEqual([subject]);
    }
  });

  it('appends a duplicate to the far side when the qualifier itself is transient', () => {
    // [model/entity/PromotionQualifier.cfc:L144], the far-side guard: if(isNew() or not
    // arguments.brand.hasPromotionQualifier(this)) CFML `or` short-circuits and `isNew()` is TRUE
    // for an unsaved qualifier.
    const transient = aQualifier();
    const brand = aBrand('brand-far-duplicate');

    expect(transient.isNew()).toBe(true);

    transient.addBrand(brand);
    transient.addBrand(brand);

    // NEAR side stays clean - its guard tests the ARGUMENT's newness, and the brand is persisted.
    expect(transient.getBrands()).toEqual([brand]);
    // FAR side does not, because the qualifier's own newness short-circuited the probe.
    expect(brand.getPromotionQualifiers()).toEqual([transient, transient]);
  });

  it('appends a duplicate to the near side when the far side is transient', () => {
    // The mirror image, from [model/entity/PromotionQualifier.cfc:L141]: the NEAR-side guard tests
    // `arguments.brand.isNew()`, so a transient brand bypasses `hasBrand()` and lands twice.
    const subject = aSavedQualifier('qualifier-near-duplicate');
    const transientBrand = aBrand();

    subject.addBrand(transientBrand);
    subject.addBrand(transientBrand);

    expect(subject.getBrands()).toEqual([transientBrand, transientBrand]);
    // The far side's probe did run - the qualifier is saved - so it holds one entry.
    expect(transientBrand.getPromotionQualifiers()).toEqual([subject]);
  });

  it('leaks no membership between tests, because every subject is fresh', () => {
    const first = aSavedQualifier('qualifier-fresh-one');
    const second = aSavedQualifier('qualifier-fresh-two');
    const brand = aBrand('brand-not-shared');

    first.addBrand(brand);

    expect(first.getBrands()).toEqual([brand]);
    expect(second.getBrands()).toEqual([]);
    expect(second.getBrands()).not.toBe(first.getBrands());
    expect(second.hasBrand(brand)).toBe(false);
  });

  it('keeps every remove helper a removal, on both sides', () => {
    // The inversion cross-check, executed.
    const subject = aSavedQualifier('qualifier-inversion');

    for (const probe of membershipPairProbes(subject, freshFixtures())) {
      probe.add();
      const nearBefore: number = probe.nearSide().length;
      const farBefore: number = probe.farSide().length;

      probe.remove();

      expect(probe.nearSide().length, `${probe.property} near side must shrink`).toBeLessThan(
        nearBefore,
      );
      expect(probe.farSide().length, `${probe.property} far side must shrink`).toBeLessThan(
        farBefore,
      );
      expect(probe.nearSide()).toEqual([]);
      expect(probe.farSide()).toEqual([]);

      // A second removal is a no-op, not a raise and not a re-add.
      probe.remove();
      expect(probe.nearSide()).toEqual([]);
      expect(probe.farSide()).toEqual([]);
    }
  });

  it('sets and clears the one many-to-one, and raises when there is nothing to clear', () => {
    // The period side is the eleventh pair and the only one that is not many-to-many
    // [model/entity/PromotionQualifier.cfc:L68, helpers at L123-L137].
    const fixtures = freshFixtures();
    const subject = aSavedQualifier('qualifier-period-side');
    const period = firstPeriodOf(
      fixtures.codelessPromotion.getPromotionPeriods(),
      'codelessPromotion',
    );

    expect(subject.getPromotionPeriod()).toBeUndefined();

    subject.setPromotionPeriod(period);
    expect(subject.getPromotionPeriod()).toBe(period);
    expect(period.getPromotionQualifiers()).toContain(subject);

    subject.removePromotionPeriod(period);
    expect(subject.getPromotionPeriod()).toBeUndefined();
    expect(period.getPromotionQualifiers()).not.toContain(subject);

    // CFML parity [model/entity/PromotionQualifier.cfc:L129-L132]: the source dereferences
    // `arguments.promotionPeriod` / `getPromotionPeriod()` unguarded, so clearing a period that is
    // neither supplied nor stored raises.
    expect(() => {
      subject.removePromotionPeriod();
    }).toThrow(/promotionPeriod/i);
  });
});

// CFML parity [org/Hibachi/HibachiEntity.cfc:L340-L350]: hasAnyInProperty dispatches via
// evaluate() (not ported) and returns false at L348 for an empty array.
//
// RESTRICTIVE in the address-zone evaluator - a zone with an EMPTY `locations` collection reports
// "not in zone", so a qualifier gated on it never fires.

describe('the any-of predicates keep their polarity, on both an include and an exclude list', () => {
  it('authors both predicates explicitly, with no dynamic dispatch behind them', () => {
    const subject = aQualifier();
    const members = prototypeMembers();

    expect(members).toContain('hasAnyOption');
    expect(members).toContain('hasAnyExcludedOption');
    expect(typeof subject.hasAnyOption).toBe('function');
    expect(typeof subject.hasAnyExcludedOption).toBe('function');

    // The legacy synthesises any `hasAny<Property>` name
    // [org/Hibachi/HibachiEntity.cfc:L517-L519].
    for (const notAuthored of [
      'hasAnyBrand',
      'hasAnyExcludedBrand',
      'hasAnySku',
      'hasAnyExcludedSku',
      'hasAnyProduct',
      'hasAnyExcludedProduct',
      'hasAnyProductType',
      'hasAnyExcludedProductType',
      'hasAnyInProperty',
    ]) {
      expect(members, `${notAuthored} must not be synthesised`).not.toContain(notAuthored);
      expect(notAuthored in subject).toBe(false);
    }
  });

  it('finds an option on the include list by primary key across distinct objects', () => {
    // Comparison is by `optionID` only.
    const subject = aSavedQualifier('qualifier-any-option');
    const held = anOption('option-shared-key');
    const twin = anOption('option-shared-key');

    subject.addOption(held);

    expect(subject.hasAnyOption([held])).toBe(true);
    expect(subject.hasAnyOption([twin])).toBe(true);
    expect(twin).not.toBe(held);
  });

  it('finds an option on the exclude list without consulting the include list', () => {
    // The two predicates read two different collections -
    // [model/entity/PromotionQualifier.cfc:L78] against
    // [model/entity/PromotionQualifier.cfc:L84].
    const subject = aSavedQualifier('qualifier-any-excluded-option');
    const included = anOption('option-included');
    const excluded = anOption('option-excluded');

    subject.addOption(included);
    subject.addExcludedOption(excluded);

    expect(subject.hasAnyOption([included])).toBe(true);
    expect(subject.hasAnyOption([excluded])).toBe(false);
    expect(subject.hasAnyExcludedOption([excluded])).toBe(true);
    expect(subject.hasAnyExcludedOption([included])).toBe(false);
  });

  it('answers true when any one of several supplied options matches', () => {
    // "Any", not "all": one hit in the middle of a miss on either side is enough.
    const subject = aSavedQualifier('qualifier-any-of-many');
    const held = anOption('option-held');

    subject.addOption(held);
    subject.addExcludedOption(held);

    const supplied = [anOption('option-miss-one'), held, anOption('option-miss-two')];

    expect(subject.hasAnyOption(supplied)).toBe(true);
    expect(subject.hasAnyExcludedOption(supplied)).toBe(true);
  });

  it('answers false when none of several supplied options matches', () => {
    const subject = aSavedQualifier('qualifier-any-of-none');

    subject.addOption(anOption('option-held'));
    subject.addExcludedOption(anOption('option-excluded'));

    const strangers = [anOption('option-stranger-one'), anOption('option-stranger-two')];

    expect(subject.hasAnyOption(strangers)).toBe(false);
    expect(subject.hasAnyExcludedOption(strangers)).toBe(false);
  });

  it('answers false for an empty supplied array on the include list - RESTRICTIVE', () => {
    // Empty case one, restrictive polarity. [org/Hibachi/HibachiEntity.cfc:L348] falls straight
    // through to `return false` when there is nothing to iterate.
    const subject = aSavedQualifier('qualifier-empty-input');

    subject.addOption(anOption('option-held'));

    expect(subject.getOptions()).toHaveLength(1);
    expect(subject.hasAnyOption([])).toBe(false);
  });

  it('answers false for an empty supplied array on the exclude list - PERMISSIVE', () => {
    // Empty case two, permissive polarity - the same `false` from the same line, meaning the
    // opposite thing.
    const subject = aSavedQualifier('qualifier-empty-input');

    subject.addExcludedOption(anOption('option-excluded'));

    expect(subject.getExcludedOptions()).toHaveLength(1);
    expect(subject.hasAnyExcludedOption([])).toBe(false);
  });

  it('answers false when the qualifier collection itself is empty, on both lists', () => {
    // The other emptiness: a populated input against an EMPTY near-side collection.
    const subject = aSavedQualifier('qualifier-empty-collections');
    const supplied = [anOption('option-one'), anOption('option-two')];

    expect(subject.getOptions()).toEqual([]);
    expect(subject.getExcludedOptions()).toEqual([]);
    expect(subject.hasAnyOption(supplied)).toBe(false);
    expect(subject.hasAnyExcludedOption(supplied)).toBe(false);
  });

  it('answers false on both counts when everything is empty', () => {
    const bare = aQualifier();

    expect(bare.hasAnyOption([])).toBe(false);
    expect(bare.hasAnyExcludedOption([])).toBe(false);
  });

  it('accepts a readonly array without forcing the caller to copy it', () => {
    // The parameter is `readonly Option[]` because the documented call site hands over
    // `Sku.getOptions()`, which is itself `readonly`.
    const subject = aSavedQualifier('qualifier-readonly-input');
    const held = anOption('option-readonly');
    const frozen: readonly Option[] = Object.freeze([held]);

    subject.addOption(held);
    subject.addExcludedOption(held);

    expect(subject.hasAnyOption(frozen)).toBe(true);
    expect(subject.hasAnyExcludedOption(frozen)).toBe(true);
  });

  it('does not mutate either collection while answering', () => {
    // Both predicates are READ-ONLY, which the live-array ruling makes worth proving: a probe that
    // appended a miss while searching would corrupt the membership the engine reads next.
    const subject = aSavedQualifier('qualifier-read-only-probe');
    const held = anOption('option-held');
    const stranger = anOption('option-stranger');

    subject.addOption(held);
    subject.addExcludedOption(held);

    subject.hasAnyOption([stranger, held]);
    subject.hasAnyExcludedOption([stranger, held]);

    expect(subject.getOptions()).toEqual([held]);
    expect(subject.getExcludedOptions()).toEqual([held]);
  });

  it('treats a transient option by identity, on both predicates', () => {
    // The mixed comparison rule reaches the any-of predicates too, because they delegate.
    const subject = aSavedQualifier('qualifier-transient-any');
    const heldTransient = anOption('');
    const otherTransient = anOption('');

    subject.addOption(heldTransient);
    subject.addExcludedOption(heldTransient);

    expect(subject.hasAnyOption([heldTransient])).toBe(true);
    expect(subject.hasAnyOption([otherTransient])).toBe(false);
    expect(subject.hasAnyExcludedOption([heldTransient])).toBe(true);
    expect(subject.hasAnyExcludedOption([otherTransient])).toBe(false);
  });
});

// Two resource-bundle lookups and a literal `" - "` separator.

describe('the simple representation composes two inert keys around a literal separator', () => {
  it('composes the entity key, the separator and the formatted qualifier type', () => {
    const subject = aQualifier({ qualifierType: 'merchandise' });

    expect(subject.getSimpleRepresentation()).toBe(
      'entity.promotionQualifier - entity.PromotionQualifier.qualifierType.merchandise',
    );
  });

  it('keeps the separator exactly space-hyphen-space', () => {
    // The literal is `" - "` in the source, not `" | "` and not `": "`.
    const subject = aQualifier({ qualifierType: 'subscription' });
    const representation: string = subject.getSimpleRepresentation();

    expect(representation).toContain(' - ');
    expect(representation.split(' - ')).toHaveLength(2);
    expect(representation.startsWith('entity.promotionQualifier - ')).toBe(true);
  });

  it('resolves neither key, and emits no translated text', () => {
    // The ruling this test exists for. `getFormattedValue('qualifierType')` would resolve a bundle
    // key in the legacy because [model/entity/PromotionQualifier.cfc:L53] declares
    // `hb_formatType="rbKey"`.
    const representation: string = aQualifier({
      qualifierType: 'merchandise',
    }).getSimpleRepresentation();

    expect(representation).toContain('entity.promotionQualifier');
    expect(representation).toContain('entity.PromotionQualifier.qualifierType.');
    expect(representation).not.toContain('Merchandise ');
    expect(representation).not.toMatch(/promotion qualifier/i);
  });

  it('carries the framework casing on the composed key and the hand-written casing on the first', () => {
    // Both spellings in one string, side by side, so the disagreement cannot be quietly
    // regularised in either direction.
    const representation: string = aQualifier({
      qualifierType: 'contentAccess',
    }).getSimpleRepresentation();
    const [entityKey, formattedValue] = representation.split(' - ');

    expect(entityKey).toBe('entity.promotionQualifier');
    expect(formattedValue).toBe('entity.PromotionQualifier.qualifierType.contentAccess');
    expect(entityKey).not.toBe('entity.PromotionQualifier');
    expect(formattedValue?.startsWith('entity.PromotionQualifier.')).toBe(true);
  });

  it('emits the measured shipped value for a bare instance, trailing space and all', () => {
    const bare = aQualifier();
    const representation: string = bare.getSimpleRepresentation();

    expect(bare.getQualifierType()).toBeUndefined();
    expect(representation).toBe('entity.promotionQualifier - ');
    expect(representation.endsWith(' ')).toBe(true);
    expect(representation).not.toContain('undefined');
    expect(representation).not.toContain('null');
    expect(representation.split('\n')).toHaveLength(1);
  });

  it('distinguishes an empty-string qualifier type from an absent one', () => {
    // The shipped presence test is `isNullish`, carrying CFML `isNull()` semantics: `null` or
    // `undefined` only, deliberately not `len()`.
    //
    // JUDGMENT CALL: assert the MEASURED string rather than a tidier one, because an empty string
    // is a value the column can hold and is not the same state as an absent one.
    const emptyString = aQualifier({ qualifierType: '' });
    const absent = aQualifier();

    expect(emptyString.getQualifierType()).toBe('');
    expect(emptyString.getSimpleRepresentation()).toBe(
      'entity.promotionQualifier - entity.PromotionQualifier.qualifierType.',
    );
    expect(absent.getSimpleRepresentation()).toBe('entity.promotionQualifier - ');
    expect(emptyString.getSimpleRepresentation()).not.toBe(absent.getSimpleRepresentation());
  });

  it('never raises, whatever the row holds', () => {
    for (const subject of [
      aQualifier(),
      aQualifier({ qualifierType: 'somethingTheAdminTyped' }),
      aSavedQualifier('qualifier-total', { promotionPeriod: undefined }),
    ]) {
      expect(() => subject.getSimpleRepresentation()).not.toThrow();
      expect(typeof subject.getSimpleRepresentation()).toBe('string');
    }
  });

  it('is independent of every collection and every gate', () => {
    // The representation reads one column.
    const fixtures = freshFixtures();
    const populated = fixtures.promotionQualifier;
    const bareWithSameType = aQualifier({ qualifierType: populated.getQualifierType() });

    expect(populated.getOptions().length).toBeGreaterThan(0);
    expect(populated.getMinimumOrderQuantity()).not.toBeUndefined();
    expect(populated.getSimpleRepresentation()).toBe(bareWithSameType.getSimpleRepresentation());
    expect(populated.getSimpleRepresentation()).toBe(
      'entity.promotionQualifier - entity.PromotionQualifier.qualifierType.merchandise',
    );
  });

  it('names qualifierType as the simple-representation property', () => {
    // [model/entity/PromotionQualifier.cfc:L355-L357], return at L356. Locator correction,
    // recorded: an upstream summary cites `L355-L356` for this member.
    const subject = aQualifier();

    expect(subject.getSimpleRepresentationPropertyName()).toBe('qualifierType');
    expect(subject.getSimpleRepresentationPropertyName()).not.toBe('QualifierType');
    expect(subject.getSimpleRepresentationPropertyName()).not.toBe('promotionQualifierID');
  });

  it('names the same property the representation actually formats', () => {
    // The two overridden members agree in the source, and the agreement is the point: the property
    // NAMED here is the property FORMATTED there.
    const subject = aQualifier({ qualifierType: 'merchandise' });
    const named: string = subject.getSimpleRepresentationPropertyName();

    expect(named).toBe('qualifierType');
    expect(subject.getSimpleRepresentation()).toContain(
      `entity.PromotionQualifier.${named}.merchandise`,
    );
  });

  it('returns the same property name for every instance, saved or not', () => {
    // A CONSTANT of the class, not a projection of state - the same ruling the option list gets.
    expect(aQualifier().getSimpleRepresentationPropertyName()).toBe(
      aSavedQualifier('qualifier-constant', {
        qualifierType: 'merchandise',
      }).getSimpleRepresentationPropertyName(),
    );
    expect(freshFixtures().promotionQualifier.getSimpleRepresentationPropertyName()).toBe(
      'qualifierType',
    );
  });
});

// CFML parity [model/entity/PromotionQualifier.cfc:L359-L361]: isDeletable chains three levels
// (qualifier -> period -> promotion) and calls getPromotionPeriod() twice in one expression, so an
// absent period or an absent promotion both throw.

describe('isDeletable climbs three levels, and raises where the legacy raises', () => {
  it('raises when the qualifier has no promotion period', () => {
    // OUTCOME 1. The first dereference [model/entity/PromotionQualifier.cfc:L360] is unguarded, so
    // there is nothing to short-circuit.
    const orphan = aSavedQualifier('qualifier-no-period', { promotionPeriod: undefined });

    expect(orphan.getPromotionPeriod()).toBeUndefined();
    expect(() => orphan.isDeletable()).toThrow(/promotion period/i);
    expect(() => orphan.isDeletable()).toThrow(/L360/);
  });

  it('raises after its period has been cleared, which is how the absence is reached', () => {
    // `removePromotionPeriod()` sets the nullable link back to `undefined`, so a qualifier that
    // was deletable becomes a raising one.
    const fixtures = freshFixtures();
    const subject = aSavedQualifier('qualifier-cleared-period');
    const period = firstPeriodOf(
      fixtures.codelessPromotion.getPromotionPeriods(),
      'codelessPromotion',
    );

    subject.setPromotionPeriod(period);
    expect(subject.isDeletable()).toBe(true);

    subject.removePromotionPeriod(period);

    expect(subject.getPromotionPeriod()).toBeUndefined();
    expect(() => subject.isDeletable()).toThrow(/promotion period/i);
  });

  it('answers false for an expired period, without reaching the promotion', () => {
    const expiredWithNoPromotion = aPromotionPeriod({
      promotionPeriodID: 'period-expired',
      endDateTimeUTC: EXPIRED_PERIOD_END_UTC,
      promotion: undefined,
    });
    const subject = aSavedQualifier('qualifier-expired-period');

    subject.setPromotionPeriod(expiredWithNoPromotion);

    expect(expiredWithNoPromotion.isExpired()).toBe(true);
    expect(expiredWithNoPromotion.getPromotion()).toBeUndefined();
    expect(subject.isDeletable()).toBe(false);
  });

  it('raises when the period is present and unexpired but its promotion is not', () => {
    // Outcome 3, the subtlest.
    const unexpiredWithNoPromotion = aPromotionPeriod({
      promotionPeriodID: 'period-open-ended',
      endDateTimeUTC: undefined,
      promotion: undefined,
    });
    const subject = aSavedQualifier('qualifier-promotionless-period');

    subject.setPromotionPeriod(unexpiredWithNoPromotion);

    expect(unexpiredWithNoPromotion.isExpired()).toBe(false);
    expect(unexpiredWithNoPromotion.getPromotion()).toBeUndefined();
    expect(() => subject.isDeletable()).toThrow(/no\s+promotion/i);
    expect(() => subject.isDeletable()).toThrow(/L360/);
  });

  it('distinguishes the two raises by their message', () => {
    // Two different broken links, two different diagnostics.
    const orphan = aSavedQualifier('qualifier-first-link');
    const promotionlessPeriod = aPromotionPeriod({
      promotionPeriodID: 'period-second-link',
      endDateTimeUTC: undefined,
      promotion: undefined,
    });
    const secondLinkBroken = aSavedQualifier('qualifier-second-link');
    secondLinkBroken.setPromotionPeriod(promotionlessPeriod);

    let firstMessage = '';
    let secondMessage = '';
    try {
      orphan.isDeletable();
    } catch (raised: unknown) {
      firstMessage = raised instanceof Error ? raised.message : String(raised);
    }
    try {
      secondLinkBroken.isDeletable();
    } catch (raised: unknown) {
      secondMessage = raised instanceof Error ? raised.message : String(raised);
    }

    expect(firstMessage).not.toBe('');
    expect(secondMessage).not.toBe('');
    expect(firstMessage).not.toBe(secondMessage);
    expect(firstMessage).toContain('cannot reach its promotion period');
    expect(secondMessage).toContain('the period has no');
  });

  it('answers false for an unexpired period whose promotion is not deletable', () => {
    // Outcome 4, delegated.
    const fixtures = freshFixtures();
    const subject = aSavedQualifier('qualifier-undeletable-promotion');
    const period = firstPeriodOf(fixtures.promotion.getPromotionPeriods(), 'promotion');

    subject.setPromotionPeriod(period);

    expect(period.isExpired()).toBe(false);
    expect(fixtures.promotion.isDeletable()).toBe(false);
    expect(subject.isDeletable()).toBe(false);
  });

  it('answers true for an unexpired period whose promotion is deletable', () => {
    // Outcome 5, delegated.
    const fixtures = freshFixtures();
    const subject = aSavedQualifier('qualifier-deletable-promotion');
    const period = firstPeriodOf(
      fixtures.codelessPromotion.getPromotionPeriods(),
      'codelessPromotion',
    );

    subject.setPromotionPeriod(period);

    expect(period.isExpired()).toBe(false);
    expect(fixtures.codelessPromotion.isDeletable()).toBe(true);
    expect(subject.isDeletable()).toBe(true);
  });

  it('lets an expired period veto a deletable promotion', () => {
    // The two conditions are ANDed, so either one alone is not enough.
    const fixtures = freshFixtures();
    const expiredPeriodOverDeletablePromotion = aPromotionPeriod({
      promotionPeriodID: 'period-expired-over-deletable',
      endDateTimeUTC: EXPIRED_PERIOD_END_UTC,
      promotion: fixtures.codelessPromotion,
    });
    const subject = aSavedQualifier('qualifier-veto');

    subject.setPromotionPeriod(expiredPeriodOverDeletablePromotion);

    expect(fixtures.codelessPromotion.isDeletable()).toBe(true);
    expect(expiredPeriodOverDeletablePromotion.isExpired()).toBe(true);
    expect(subject.isDeletable()).toBe(false);
  });

  it('reads the period boundary against the injected clock, never a wall clock', () => {
    // Two periods identical but for their end bound, read through the same fixed instant.
    const fixtures = freshFixtures();
    const alreadyEnded = aPromotionPeriod({
      promotionPeriodID: 'period-already-ended',
      endDateTimeUTC: EXPIRED_PERIOD_END_UTC,
      promotion: fixtures.codelessPromotion,
    });
    const endsLater = aPromotionPeriod({
      promotionPeriodID: 'period-ends-later',
      endDateTimeUTC: PERIOD_END_UTC,
      promotion: fixtures.codelessPromotion,
    });

    const vetoed = aSavedQualifier('qualifier-clock-vetoed');
    const permitted = aSavedQualifier('qualifier-clock-permitted');
    vetoed.setPromotionPeriod(alreadyEnded);
    permitted.setPromotionPeriod(endsLater);

    expect(new Date(EXPIRED_PERIOD_END_UTC).getTime()).toBeLessThan(new Date(NOW_UTC).getTime());
    expect(new Date(PERIOD_END_UTC).getTime()).toBeGreaterThan(new Date(NOW_UTC).getTime());
    expect(vetoed.isDeletable()).toBe(false);
    expect(permitted.isDeletable()).toBe(true);
  });

  it('answers the same way however many times it is asked', () => {
    // No memo, no cached verdict: the chain is walked afresh each time, so a period that becomes
    // undeletable between two calls is reported honestly rather than from a stale answer.
    const fixtures = freshFixtures();
    const subject = aSavedQualifier('qualifier-no-memo');
    const deletablePeriod = firstPeriodOf(
      fixtures.codelessPromotion.getPromotionPeriods(),
      'codelessPromotion',
    );
    const undeletablePeriod = firstPeriodOf(fixtures.promotion.getPromotionPeriods(), 'promotion');

    subject.setPromotionPeriod(deletablePeriod);
    expect(subject.isDeletable()).toBe(true);
    expect(subject.isDeletable()).toBe(true);

    subject.setPromotionPeriod(undeletablePeriod);
    expect(subject.isDeletable()).toBe(false);
    expect(subject.isDeletable()).toBe(false);
  });

  it('does not depend on the qualifier being saved', () => {
    // `isDeletable()` reads the PERIOD chain and nothing about the qualifier's own key, so a
    // transient qualifier answers exactly as a persisted one does.
    const fixtures = freshFixtures();
    const period = firstPeriodOf(
      fixtures.codelessPromotion.getPromotionPeriods(),
      'codelessPromotion',
    );
    const transient = aQualifier();

    transient.setPromotionPeriod(period);

    expect(transient.isNew()).toBe(true);
    expect(transient.isDeletable()).toBe(true);
  });
});

// CFML parity [model/validation/]: there is no PromotionQualifier.json - one of exactly six
// in-scope artefacts with no validation schema, enumerated with the folder census on the
// `ABSENT_VALIDATION_SURFACE` constant above.

describe('there is no validation surface, and none is invented', () => {
  it('authors no validation member of any kind', () => {
    const subject = aQualifier();
    const members = prototypeMembers();

    for (const absent of ABSENT_VALIDATION_SURFACE) {
      expect(members, `${absent} must not be authored`).not.toContain(absent);
      expect(absent in subject, `${absent} must not resolve on an instance`).toBe(false);
    }
  });

  it('accepts a row that any invented schema would have rejected', () => {
    // The absence, exercised rather than merely stated.
    const hostile = aQualifier({
      qualifierType: undefined,
      rewardMatchingType: undefined,
      promotionPeriod: undefined,
      minimumOrderQuantity: -10,
      maximumOrderQuantity: -20,
      minimumOrderSubtotal: Money.fromDecimalString('-500.00'),
      maximumOrderSubtotal: Money.fromDecimalString('-1000.00'),
      minimumFulfillmentWeight: -1,
    });

    expect(hostile.getQualifierType()).toBeUndefined();
    expect(hostile.getRewardMatchingType()).toBeUndefined();
    expect(hostile.getMinimumOrderQuantity()).toBe(-10);
    expect(hostile.getMaximumOrderQuantity()).toBe(-20);
    expect(hostile.getMinimumOrderSubtotal()?.toFixed2()).toBe('-500.00');
    expect(hostile.getMaximumOrderSubtotal()?.toFixed2()).toBe('-1000.00');
    expect(hostile.getMinimumFulfillmentWeight()).toBe(-1);
    expect(() => hostile.getSimpleRepresentation()).not.toThrow();
  });

  it('leaves isDeletable advisory, with nothing enforcing it', () => {
    // The delete-gate asymmetry.
    const fixtures = freshFixtures();
    const subject = aSavedQualifier('qualifier-advisory-gate');
    const period = firstPeriodOf(fixtures.promotion.getPromotionPeriods(), 'promotion');
    const brand = aBrand('brand-after-veto');

    subject.setPromotionPeriod(period);
    expect(subject.isDeletable()).toBe(false);

    // Nothing about that `false` is enforced anywhere on the entity.
    expect(() => {
      subject.addBrand(brand);
    }).not.toThrow();
    expect(subject.getBrands()).toEqual([brand]);
    expect(() => {
      subject.removeBrand(brand);
    }).not.toThrow();
    expect(subject.getSimpleRepresentationPropertyName()).toBe('qualifierType');
  });
});

// CFML parity [model/entity/PromotionQualifier.cfc:L49]: `hb_permission` is correctly spelled
// here, `promotionPeriod.promotionQualifiers`.
//
// Locator correction, recorded: the reward's component declaration - and therefore its
// `hb_permission` - is at `PromotionReward.cfc:L57`, not the L49 an upstream summary cites.

describe('the structural facts hold, and the framework base class stays unported', () => {
  it('reports a fresh instance as new, because the key default is honest', () => {
    // [model/entity/PromotionQualifier.cfc:L52] declares `unsavedvalue="" default=""`, so an
    // unsaved row's key is the empty string and `isNew()` can answer truthfully without a separate
    // flag.
    const fresh = aQualifier();

    expect(fresh.getPromotionQualifierID()).toBe('');
    expect(fresh.isNew()).toBe(true);
    expect(aSavedQualifier('qualifier-persisted').isNew()).toBe(false);
    expect(aSavedQualifier('qualifier-persisted').getPromotionQualifierID()).toBe(
      'qualifier-persisted',
    );
  });

  it('carries remoteID as an optional string', () => {
    expect(aQualifier().getRemoteID()).toBeUndefined();
    expect(aQualifier({ remoteID: 'legacy-system-key-42' }).getRemoteID()).toBe(
      'legacy-system-key-42',
    );
  });

  it('carries the four audit columns as dates or undefined, never an epoch stand-in', () => {
    const unaudited = aQualifier();

    expect(unaudited.getCreatedDateTime()).toBeUndefined();
    expect(unaudited.getModifiedDateTime()).toBeUndefined();
    expect(unaudited.getCreatedByAccountID()).toBeUndefined();
    expect(unaudited.getModifiedByAccountID()).toBeUndefined();
    expect(unaudited.getCreatedDateTime()).not.toEqual(new Date(0));

    const audited = aQualifier({
      createdDateTime: new Date(CREATED_DATE_TIME_UTC),
      createdByAccountID: 'account-author',
      modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
      modifiedByAccountID: 'account-editor',
    });

    expect(audited.getCreatedDateTime()?.toISOString()).toBe(CREATED_DATE_TIME_UTC);
    expect(audited.getModifiedDateTime()?.toISOString()).toBe(MODIFIED_DATE_TIME_UTC);
    expect(audited.getCreatedByAccountID()).toBe('account-author');
    expect(audited.getModifiedByAccountID()).toBe('account-editor');
    expect(audited.getCreatedDateTime()).toBeInstanceOf(Date);
  });

  it('authors no ORM lifecycle hook, because the source banner is empty', () => {
    const subject = aQualifier();
    const members = prototypeMembers();

    for (const hook of [
      'preInsert',
      'preUpdate',
      'postInsert',
      'postUpdate',
      'preDelete',
      'postDelete',
      'setPromotionQualifierIDPath',
      'getPromotionQualifierIDPath',
    ]) {
      expect(members, `${hook} must not be authored`).not.toContain(hook);
      expect(hook in subject, `${hook} must not resolve on an instance`).toBe(false);
    }
  });

  it('resolves an unknown member to undefined rather than dispatching for it', () => {
    // The base-class distinction, DOCUMENTED and not reproduced.
    const subject: unknown = aQualifier();
    const asRecord = subject as Record<string, unknown>;

    expect(asRecord['getSomeAttributeThatNeverExisted']).toBeUndefined();
    expect('getSomeAttributeThatNeverExisted' in asRecord).toBe(false);
    expect(asRecord['attributeValues']).toBeUndefined();
    expect(asRecord['getAttributeValue']).toBeUndefined();
  });

  it('builds without a collaborator port and without a clock', () => {
    // Zero `getService(` sites in the source.
    const subject = aQualifier();
    const asRecord = subject as unknown as Record<string, unknown>;

    for (const collaborator of [
      'now',
      'clock',
      'promotionService',
      'settingsProvider',
      'currencyConverter',
      'priceGroupRepository',
      'salePriceResolver',
    ]) {
      expect(asRecord[collaborator], `${collaborator} must not be injected`).toBeUndefined();
    }

    // The one clock in the chain is the period's, injected there and never here.
    const period = aPromotionPeriod({
      promotionPeriodID: 'period-owns-the-clock',
      endDateTimeUTC: PERIOD_END_UTC,
      promotion: freshFixtures().codelessPromotion,
    });
    subject.setPromotionPeriod(period);
    expect(subject.isDeletable()).toBe(true);
  });

  it('exposes the fixture graph qualifier as a fully materialized row', () => {
    // A last whole-row witness, so the shipped surface is checked once against a realistic row
    // rather than only against hand-built minimal ones.
    const fixtures = freshFixtures();
    const populated = fixtures.promotionQualifier;

    expect(populated.isNew()).toBe(false);
    expect(populated.getQualifierType()).toBe('merchandise');
    expect(populated.getRewardMatchingType()).toBe('sku');

    for (const [gate, read] of Object.entries(GATE_READERS)) {
      expect(read(populated), `${gate} must be populated on the fixture row`).not.toBeUndefined();
    }

    expect(populated.getMinimumOrderSubtotal()?.toFixed2()).toBe('25.00');
    expect(populated.getMaximumOrderSubtotal()?.toFixed2()).toBe('500.00');
    expect(populated.getMinimumItemPrice()?.toFixed2()).toBe('9.99');
    expect(populated.getMaximumItemPrice()?.toFixed2()).toBe('199.99');
    expect(populated.getMinimumFulfillmentWeight()).toBe(1);
    expect(populated.getMaximumFulfillmentWeight()).toBe(50);

    for (const collection of [
      populated.getBrands(),
      populated.getOptions(),
      populated.getSkus(),
      populated.getProducts(),
      populated.getProductTypes(),
      populated.getExcludedBrands(),
      populated.getExcludedOptions(),
      populated.getExcludedSkus(),
      populated.getExcludedProducts(),
      populated.getExcludedProductTypes(),
    ]) {
      expect(collection.length).toBeGreaterThan(0);
    }

    expect(populated.getFulfillmentMethodIDs()).toEqual(['promofx-fulfillment-method']);
    expect(populated.getPromotionPeriod()).toBe(fixtures.promotionPeriod);
    expect(fixtures.promotionPeriod.getPromotionQualifiers()).toContain(populated);
  });

  it('hands out an independent graph on every fixture call', () => {
    const first = freshFixtures();
    const second = freshFixtures();

    expect(second.promotionQualifier).not.toBe(first.promotionQualifier);
    expect(second.promotionQualifier.getOptions()).not.toBe(first.promotionQualifier.getOptions());

    first.promotionQualifier.addBrand(aBrand('brand-only-in-the-first-graph'));

    expect(first.promotionQualifier.getBrands().length).toBe(
      second.promotionQualifier.getBrands().length + 1,
    );
  });
});
