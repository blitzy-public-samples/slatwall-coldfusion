// slatwall-ts - price-group / price-group-rate / rounding-rule test data.
//
// One deterministic factory returning a fully-formed graph of `SwPriceGroup`, `SwPriceGroupRate`
// and `SwRoundingRule` entities.
//
// It is the root of the fixture dependency graph, so it imports no sibling fixture - that would
// close a cycle in a graph acyclic by construction.
//
// Fixture construction follows the build -> save -> flush SHAPE of the legacy tree's only such
// artefact `meta/tests/unit/Helper.cfc`; its ORM mechanism is not carried over.

import { PriceGroup } from '../../src/domain/entities/priceGroup.js';
import { PriceGroupRate } from '../../src/domain/entities/priceGroupRate.js';
import { RoundingRule } from '../../src/domain/entities/roundingRule.js';
import { buildIdPathList } from '../../src/domain/valueObjects/materializedIdPath.js';
import { Money } from '../../src/domain/valueObjects/money.js';
import { toDecimalString } from '../../src/lib/cfml/numberFormat.js';

import type { Product } from '../../src/domain/entities/product.js';
import type { PriceGroupRateAmountType } from '../../src/domain/entities/priceGroupRate.js';
import type { ProductType } from '../../src/domain/entities/productType.js';
import type { RoundingRuleDirection } from '../../src/domain/entities/roundingRule.js';
import type { Sku } from '../../src/domain/entities/sku.js';
import type { DecimalString } from '../../src/lib/cfml/numberFormat.js';

type ElementOf<TArray> = TArray extends readonly (infer TElement)[] ? TElement : never;

/**
 * The `activeFlag` operand `PriceGroup` accepts, derived from the constructor rather than imported
 * from the CFML truthiness helper.
 */
type PriceGroupActiveFlag = ConstructorParameters<typeof PriceGroup>[0]['activeFlag'];

/**
 * The promotion-reward entity as seen through `PriceGroup`.
 */
type PromotionRewardRef = ElementOf<ReturnType<PriceGroup['getPromotionRewards']>>;

type RecordedRoundValueCall = {
  readonly value: Money;
  readonly rule: RoundingRule;
};

/**
 * A hand-written in-memory stand-in for the collaborator every `RoundingRule` delegates to.
 *
 * CFML parity [model/entity/RoundingRule.cfc:L66-L68]: `roundValue` is an ENTITY method whose
 * whole body is a service-locator lookup.
 *
 * JUDGMENT CALL: the scripted answer is unrelated to any input, since an identity double would be
 * indistinguishable from "no rounding applied".
 */
interface RecordingValueRounder {
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money;

  readonly calls: readonly RecordedRoundValueCall[];
}

/**
 * One row of the rounding-expression acceptance table, measuring
 * [model/entity/RoundingRule.cfc:L78-L86] per comma-list element:
 * `(len(v) - find(".", v)) != 2 || !isNumeric(v)` rejects.
 *
 * CFML parity [model/validation/RoundingRule.json:L4]: the plan records "no expression
 * validation", and that premise is wrong.
 */
type RoundingExpressionCase = {
  readonly expression: string;

  readonly accepted: boolean;

  readonly derivedPowerPerElement: readonly DecimalString[];
};

/**
 * One measured `roundValue` outcome.
 */
type RoundValueCase = {
  readonly input: DecimalString;

  readonly roundingExpression: string;

  readonly roundingDirection: RoundingRuleDirection;

  readonly expected: DecimalString;
};

type ReferenceCalculation = {
  readonly unitPrice: DecimalString;
  readonly quantity: number;
  readonly extendedPrice: DecimalString;
  readonly percentageOff: DecimalString;
  readonly discountAmount: DecimalString;
  readonly netAmount: DecimalString;
  readonly presentedNetAmount: DecimalString;
};

/**
 * Every axis of variation this factory offers, and the only one. Each default is documented on its
 * own member.
 *
 * Note the deliberate asymmetry with the graph type below.
 */
interface PriceGroupFixtureOverrides {
  readonly idPrefix?: string | undefined;

  /**
   * `activeFlag` for every price group in the graph. Default `undefined`.
   *
   * CFML parity [model/entity/PriceGroup.cfc:L54]: the column declares no `default=`, so
   * `undefined` is the honest unset state and `getActiveFlag()` resolves it to `false`.
   */
  readonly activeFlag?: PriceGroupActiveFlag;

  readonly skuLevelRateSkus?: readonly Sku[] | undefined;

  readonly productLevelRateProducts?: readonly Product[] | undefined;

  readonly productTypeLevelRateProductTypes?: readonly ProductType[] | undefined;

  /**
   * Membership for the sku-level rate on the PARENT price group. Default `[]`.
   */
  readonly parentSkuLevelRateSkus?: readonly Sku[] | undefined;

  /**
   * Membership for the product-level rate on the PARENT price group. Default `[]`.
   */
  readonly parentProductLevelRateProducts?: readonly Product[] | undefined;

  readonly excludedSkus?: readonly Sku[] | undefined;

  readonly excludedProducts?: readonly Product[] | undefined;

  readonly excludedProductTypes?: readonly ProductType[] | undefined;

  readonly promotionRewards?: readonly PromotionRewardRef[] | undefined;

  /**
   * The numeral the collaborator double answers with. Default `'77.77'`, unrelated to any input it
   * will be handed, so "applied" and "skipped" are distinguishable outcomes.
   */
  readonly roundValueAnswer?: string | undefined;
}

/**
 * One complete, independent price-group graph. Member names say which cascade level or which
 * preserved defect each artefact exercises.
 */
interface PriceGroupFixtureGraph {
  readonly roundingRuleValueRounder: RecordingValueRounder;

  readonly roundValueDoubleAnswer: Money;

  readonly closestRoundingRule: RoundingRule;

  readonly roundUpRoundingRule: RoundingRule;

  readonly roundDownRoundingRule: RoundingRule;

  readonly outOfVocabularyDirectionRoundingRule: RoundingRule;

  readonly defaultExpressionRoundingRule: RoundingRule;

  readonly absentExpressionRoundingRule: RoundingRule;

  /**
   * A rounding rule with a non-empty `priceGroupRates` collection.
   *
   * CFML parity [model/validation/RoundingRule.json:L6]: `priceGroupRates` carries
   * `{"contexts":"delete","maxCollection":0}`, so a rule with any rate attached cannot be deleted.
   * Every other rule here carries `[]`, making the guard vacuous.
   */
  readonly undeletableRoundingRule: RoundingRule;

  readonly rateBlockingRoundingRuleDelete: PriceGroupRate;

  readonly roundingRuleDirectionVocabulary: readonly [
    RoundingRuleDirection,
    RoundingRuleDirection,
    RoundingRuleDirection,
  ];

  readonly outOfVocabularyRoundingRuleDirection: string;

  /**
   * All nine acceptance rows, including the one that accepts and should not.
   */
  readonly roundingExpressionCases: readonly RoundingExpressionCase[];

  /**
   * All ten measured `roundValue` outcomes.
   */
  readonly roundValueCases: readonly RoundValueCase[];

  /**
   * The migration's reference calculation, as numerals.
   */
  readonly referenceCalculation: ReferenceCalculation;

  readonly productTypeLevelRate: PriceGroupRate;

  readonly productLevelRate: PriceGroupRate;

  readonly skuLevelRateFirstMatch: PriceGroupRate;

  readonly skuLevelRateLastMatch: PriceGroupRate;

  readonly parentSkuLevelRate: PriceGroupRate;

  readonly parentProductLevelRate: PriceGroupRate;

  readonly globalRateFirstMatch: PriceGroupRate;

  readonly globalRateLastMatch: PriceGroupRate;

  readonly rootGlobalRate: PriceGroupRate;

  readonly recognisedAmountTypes: readonly [
    PriceGroupRateAmountType,
    PriceGroupRateAmountType,
    PriceGroupRateAmountType,
  ];

  readonly percentageOffRateWithRoundingRule: PriceGroupRate;

  readonly amountOffRateWithRoundingRule: PriceGroupRate;

  readonly fixedAmountRateWithRoundingRule: PriceGroupRate;

  readonly percentageOffRateWithoutRoundingRule: PriceGroupRate;

  readonly unrecognisedAmountTypeRate: PriceGroupRate;

  readonly unrecognisedAmountTypeColumnValue: string;

  /**
   * A non-global rate carrying all six association collections.
   */
  readonly appliesToIncludingAndExcludingRate: PriceGroupRate;

  readonly rootPriceGroup: PriceGroup;

  readonly parentPriceGroup: PriceGroup;

  readonly childPriceGroup: PriceGroup;

  readonly siblingPriceGroup: PriceGroup;

  readonly globalRatePriceGroup: PriceGroup;

  readonly isolatedPriceGroup: PriceGroup;

  readonly unpathedPriceGroup: PriceGroup;

  /**
   * The `priceGroupIDPath` values stored on the three chained groups. Built by the domain's own
   * path builder, so root-first, comma-delimited, self-last and never empty.
   */
  readonly priceGroupIDPaths: {
    readonly root: string;
    readonly parent: string;
    readonly child: string;
    readonly sibling: string;
  };
}

const DEFAULT_ID_PREFIX = 'pgfx';

const DEFAULT_ROUND_VALUE_ANSWER = '77.77';

const OUT_OF_VOCABULARY_ROUNDING_DIRECTION = 'Sideways';

const UNRECOGNISED_AMOUNT_TYPE_COLUMN_VALUE = 'flatRate';

const CREATED_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';
const MODIFIED_DATE_TIME_UTC = '2024-06-15T12:30:00.000Z';

const PRODUCT_TYPE_LEVEL_RATE_AMOUNT = '30.00';
const PRODUCT_LEVEL_RATE_AMOUNT = '20.00';
const SKU_LEVEL_RATE_FIRST_MATCH_AMOUNT = '10.00';
const SKU_LEVEL_RATE_LAST_MATCH_AMOUNT = '25.00';
const PARENT_SKU_LEVEL_RATE_AMOUNT = '99.00';
const PARENT_PRODUCT_LEVEL_RATE_AMOUNT = '40.00';
const GLOBAL_RATE_FIRST_MATCH_AMOUNT = '5.00';
const GLOBAL_RATE_LAST_MATCH_AMOUNT = '15.00';
const ROOT_GLOBAL_RATE_AMOUNT = '2.00';
const AMOUNT_OFF_RATE_AMOUNT = '5.00';
const FIXED_AMOUNT_RATE_AMOUNT = '9.99';
const UNRECOGNISED_AMOUNT_TYPE_RATE_AMOUNT = '7.50';
const APPLIES_TO_RATE_AMOUNT = '1.00';
const DELETE_GUARD_RATE_AMOUNT = '3.00';

const REFERENCE_UNIT_PRICE = '19.99';
const REFERENCE_QUANTITY = 3;
const REFERENCE_EXTENDED_PRICE = '59.97';
const REFERENCE_PERCENTAGE_OFF = '12.5';
const REFERENCE_DISCOUNT_AMOUNT = '7.49625';
const REFERENCE_NET_AMOUNT = '52.47375';
const REFERENCE_PRESENTED_NET_AMOUNT = '52.47';

type AuditTrail = {
  readonly createdDateTime: Date;
  readonly createdByAccountID: string;
  readonly modifiedDateTime: Date;
  readonly modifiedByAccountID: string;
};

function makeAuditTrail(idPrefix: string): AuditTrail {
  return {
    createdDateTime: new Date(CREATED_DATE_TIME_UTC),
    createdByAccountID: `${idPrefix}-account-created`,
    modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: `${idPrefix}-account-modified`,
  };
}

function makeRecordingValueRounder(answer: Money): RecordingValueRounder {
  const calls: RecordedRoundValueCall[] = [];

  return {
    roundValueByRoundingRule(value: Money, rule: RoundingRule): Money {
      calls.push({ value, rule });

      return answer;
    },
    calls,
  };
}

/**
 * The nine acceptance rows, every verdict measured against the ported predicate
 * `(len(v) - find(".", v)) != 2 || !isNumeric(v)` [model/entity/RoundingRule.cfc:L81].
 *
 * LEGACY-DEFECT [model/entity/RoundingRule.cfc:L78-L86]: the predicate accepts a bare `'99'`,
 * because `find(".", "99")` is 0 and `len("99") - 0` is 2 - the arithmetic a well-formed `'.99'`
 * produces.
 * Preserved deliberately; do not fix without a product decision.
 */
function makeRoundingExpressionCases(): RoundingExpressionCase[] {
  return [
    { expression: '.99', accepted: true, derivedPowerPerElement: [toDecimalString('1')] },
    { expression: '0.99', accepted: true, derivedPowerPerElement: [toDecimalString('10')] },
    { expression: '9.99', accepted: true, derivedPowerPerElement: [toDecimalString('10')] },

    { expression: '0.00', accepted: true, derivedPowerPerElement: [toDecimalString('10')] },

    {
      expression: '.95,.99',
      accepted: true,
      derivedPowerPerElement: [toDecimalString('1'), toDecimalString('1')],
    },

    { expression: '.9', accepted: false, derivedPowerPerElement: [toDecimalString('0.1')] },

    { expression: '999', accepted: false, derivedPowerPerElement: [toDecimalString('1')] },

    { expression: '0.999', accepted: false, derivedPowerPerElement: [toDecimalString('100')] },

    { expression: '99', accepted: true, derivedPowerPerElement: [toDecimalString('0.1')] },
  ];
}

/**
 * The ten measured `roundValue` outcomes, produced by running the ported algorithm.
 *
 * LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L101-L102, L108-L109]: the intermediate is
 * computed arithmetically and then `len()`-ed.
 * Preserved deliberately; do not fix without a product decision.
 *
 * LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L88]: the declared
 * `roundingExpression="0.00"` default reads as inert and is not - it turns `12.3456` into `10.00`.
 * Preserved deliberately; do not fix without a product decision.
 *
 * LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L115-L118]: when the input is no longer
 * than the expression, both candidates become the expression itself, so `7.42` under `'9.99'`
 * becomes `9.99` and `2.30` under `'0.99'` becomes `0.99`.
 * Preserved deliberately; do not fix without a product decision.
 */
function makeRoundValueCases(): RoundValueCase[] {
  return [
    {
      input: toDecimalString('12.3456'),
      roundingExpression: '0.99',
      roundingDirection: 'Closest',
      expected: toDecimalString('10.99'),
    },
    {
      input: toDecimalString('12.3456'),
      roundingExpression: '.99',
      roundingDirection: 'Closest',
      expected: toDecimalString('11.99'),
    },
    {
      input: toDecimalString('12.3456'),
      roundingExpression: '.99',
      roundingDirection: 'Up',
      expected: toDecimalString('12.99'),
    },
    {
      input: toDecimalString('12.3456'),
      roundingExpression: '.99',
      roundingDirection: 'Down',
      expected: toDecimalString('11.99'),
    },
    {
      input: toDecimalString('12.3456'),
      roundingExpression: '.95,.99',
      roundingDirection: 'Closest',
      expected: toDecimalString('11.99'),
    },
    {
      input: toDecimalString('12.30'),
      roundingExpression: '.99',
      roundingDirection: 'Closest',
      expected: toDecimalString('12.99'),
    },
    {
      input: toDecimalString('7.42'),
      roundingExpression: '9.99',
      roundingDirection: 'Closest',
      expected: toDecimalString('9.99'),
    },
    {
      input: toDecimalString('2.30'),
      roundingExpression: '0.99',
      roundingDirection: 'Closest',
      expected: toDecimalString('0.99'),
    },
    {
      input: toDecimalString('0.42'),
      roundingExpression: '.99',
      roundingDirection: 'Closest',
      expected: toDecimalString('0.99'),
    },
    {
      input: toDecimalString('12.3456'),
      roundingExpression: '0.00',
      roundingDirection: 'Closest',
      expected: toDecimalString('10.00'),
    },
  ];
}

function makeReferenceCalculation(): ReferenceCalculation {
  return {
    unitPrice: toDecimalString(REFERENCE_UNIT_PRICE),
    quantity: REFERENCE_QUANTITY,
    extendedPrice: toDecimalString(REFERENCE_EXTENDED_PRICE),
    percentageOff: toDecimalString(REFERENCE_PERCENTAGE_OFF),
    discountAmount: toDecimalString(REFERENCE_DISCOUNT_AMOUNT),
    netAmount: toDecimalString(REFERENCE_NET_AMOUNT),
    presentedNetAmount: toDecimalString(REFERENCE_PRESENTED_NET_AMOUNT),
  };
}

/**
 * Hydrates one `SwRoundingRule` row.
 */
function makeRoundingRule(
  init: {
    readonly roundingRuleID: string;
    readonly roundingRuleName: string | undefined;
    readonly roundingRuleExpression: string | undefined;
    readonly roundingRuleDirection: string | undefined;
    readonly priceGroupRates: readonly PriceGroupRate[];
  },
  valueRounder: RecordingValueRounder,
  audit: AuditTrail,
): RoundingRule {
  return new RoundingRule(
    {
      roundingRuleID: init.roundingRuleID,
      roundingRuleName: init.roundingRuleName,
      roundingRuleExpression: init.roundingRuleExpression,
      roundingRuleDirection: init.roundingRuleDirection,
      createdDateTime: audit.createdDateTime,
      createdByAccountID: audit.createdByAccountID,
      modifiedDateTime: audit.modifiedDateTime,
      modifiedByAccountID: audit.modifiedByAccountID,
      priceGroupRates: [...init.priceGroupRates],
    },
    valueRounder,
  );
}

type PriceGroupRateSpec = {
  readonly priceGroupRateID: string;

  readonly globalFlag: boolean;

  readonly amount: string;

  /**
   * CFML parity [model/entity/PriceGroupRate.cfc:L55]: an unconstrained `ormType="string"` column,
   * narrowed to the closed vocabulary at the repository boundary. `undefined` is the in-type
   * inhabitant reaching the dispatch's missing default branch.
   */
  readonly amountType: PriceGroupRateAmountType | undefined;

  /**
   * CFML parity [model/entity/PriceGroupRate.cfc:L68]: a NULLABLE many-to-one declared with
   * `hb_optionsNullRBKey="define.none"`. Required slot, `undefined` permitted - never an optional
   * key, because "no rounding rule" is a state to state, not one to omit.
   */
  readonly roundingRule: RoundingRule | undefined;

  readonly productTypes: readonly ProductType[];
  readonly products: readonly Product[];
  readonly skus: readonly Sku[];

  /**
   * LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L75-L77]: `excludedProductTypes`,
   * `excludedProducts` and `excludedSkus` are persisted through three link tables and the cascade
   * never consults any of them - not at the sku level
   * [model/service/PriceGroupService.cfc:L146-L150].
   * Preserved deliberately; do not fix without a product decision.
   */
  readonly excludedProductTypes: readonly ProductType[];
  readonly excludedProducts: readonly Product[];
  readonly excludedSkus: readonly Sku[];
};

/**
 * Hydrates one `SwPriceGroupRate` row, leaving `priceGroup` `undefined` and wiring it afterwards
 * through the entity's bidirectional helper.
 */
function makePriceGroupRate(spec: PriceGroupRateSpec, audit: AuditTrail): PriceGroupRate {
  return new PriceGroupRate({
    priceGroupRateID: spec.priceGroupRateID,
    globalFlag: spec.globalFlag,
    amount: Money.fromDecimalString(spec.amount),
    amountType: spec.amountType,
    remoteID: undefined,
    createdDateTime: audit.createdDateTime,
    createdByAccountID: audit.createdByAccountID,
    modifiedDateTime: audit.modifiedDateTime,
    modifiedByAccountID: audit.modifiedByAccountID,
    priceGroup: undefined,
    roundingRule: spec.roundingRule,
    productTypes: [...spec.productTypes],
    products: [...spec.products],
    skus: [...spec.skus],
    excludedProductTypes: [...spec.excludedProductTypes],
    excludedProducts: [...spec.excludedProducts],
    excludedSkus: [...spec.excludedSkus],
  });
}

/**
 * Hydrates one `SwPriceGroup` row.
 *
 * `parentPriceGroupOptionCandidates` is omitted: the accessor is total and defaults to an empty
 * option list [model/entity/PriceGroup.cfc:L94-L103].
 */
function makePriceGroup(
  spec: {
    readonly priceGroupID: string;
    readonly priceGroupIDPath: string | undefined;
    readonly priceGroupName: string;
    readonly priceGroupCode: string;
    readonly parentPriceGroup: PriceGroup | undefined;
    readonly promotionRewards: readonly PromotionRewardRef[];
  },
  activeFlag: PriceGroupActiveFlag,
  audit: AuditTrail,
): PriceGroup {
  return new PriceGroup({
    priceGroupID: spec.priceGroupID,
    priceGroupIDPath: spec.priceGroupIDPath,
    activeFlag,
    priceGroupName: spec.priceGroupName,
    priceGroupCode: spec.priceGroupCode,
    parentPriceGroup: spec.parentPriceGroup,
    childPriceGroups: [],
    priceGroupRates: [],
    promotionRewards: [...spec.promotionRewards],
    createdDateTime: audit.createdDateTime,
    createdByAccountID: audit.createdByAccountID,
    modifiedDateTime: audit.modifiedDateTime,
    modifiedByAccountID: audit.modifiedByAccountID,
  });
}

/**
 * One node of the identifier chain the materialized paths are built from.
 *
 * JUDGMENT CALL: the stored `priceGroupIDPath` values are computed from a plain chain of
 * `priceGroupID` and `parent` links rather than from the entities.
 */
type IdPathNode = {
  readonly priceGroupID: string;
  readonly parent: IdPathNode | undefined;
};

function readIdPathNodeID(node: IdPathNode): string {
  return node.priceGroupID;
}

function readIdPathNodeParent(node: IdPathNode): IdPathNode | undefined {
  return node.parent;
}

/**
 * Builds one complete, independent price-group / price-group-rate / rounding-rule graph, plus the
 * two verified data tables the rounding algorithm is pinned against.
 *
 * @param overrides the only axis of variation; omit it for the documented defaults.
 * @returns one fully-formed graph, disposable by dropping the reference.
 */
export function makePriceGroupFixtures(
  overrides?: PriceGroupFixtureOverrides,
): PriceGroupFixtureGraph {
  const idPrefix = overrides?.idPrefix ?? DEFAULT_ID_PREFIX;

  const activeFlag: PriceGroupActiveFlag = overrides?.activeFlag;

  const skuLevelRateSkus = overrides?.skuLevelRateSkus ?? [];
  const productLevelRateProducts = overrides?.productLevelRateProducts ?? [];
  const productTypeLevelRateProductTypes = overrides?.productTypeLevelRateProductTypes ?? [];
  const parentSkuLevelRateSkus = overrides?.parentSkuLevelRateSkus ?? [];
  const parentProductLevelRateProducts = overrides?.parentProductLevelRateProducts ?? [];
  const excludedSkus = overrides?.excludedSkus ?? [];
  const excludedProducts = overrides?.excludedProducts ?? [];
  const excludedProductTypes = overrides?.excludedProductTypes ?? [];
  const promotionRewards = overrides?.promotionRewards ?? [];
  const roundValueAnswer = overrides?.roundValueAnswer ?? DEFAULT_ROUND_VALUE_ANSWER;

  const audit = makeAuditTrail(idPrefix);

  const rootPriceGroupID = `${idPrefix}-pricegroup-root`;
  const parentPriceGroupID = `${idPrefix}-pricegroup-parent`;
  const childPriceGroupID = `${idPrefix}-pricegroup-child`;
  const siblingPriceGroupID = `${idPrefix}-pricegroup-sibling`;
  const globalRatePriceGroupID = `${idPrefix}-pricegroup-globalrates`;
  const isolatedPriceGroupID = `${idPrefix}-pricegroup-isolated`;
  const unpathedPriceGroupID = `${idPrefix}-pricegroup-unpathed`;

  const rootIdPathNode: IdPathNode = { priceGroupID: rootPriceGroupID, parent: undefined };
  const parentIdPathNode: IdPathNode = {
    priceGroupID: parentPriceGroupID,
    parent: rootIdPathNode,
  };
  const childIdPathNode: IdPathNode = {
    priceGroupID: childPriceGroupID,
    parent: parentIdPathNode,
  };
  const siblingIdPathNode: IdPathNode = {
    priceGroupID: siblingPriceGroupID,
    parent: parentIdPathNode,
  };
  const globalRateIdPathNode: IdPathNode = {
    priceGroupID: globalRatePriceGroupID,
    parent: undefined,
  };
  const isolatedIdPathNode: IdPathNode = {
    priceGroupID: isolatedPriceGroupID,
    parent: undefined,
  };

  const rootPriceGroupIDPath = buildIdPathList(
    rootIdPathNode,
    readIdPathNodeID,
    readIdPathNodeParent,
  );
  const parentPriceGroupIDPath = buildIdPathList(
    parentIdPathNode,
    readIdPathNodeID,
    readIdPathNodeParent,
  );
  const childPriceGroupIDPath = buildIdPathList(
    childIdPathNode,
    readIdPathNodeID,
    readIdPathNodeParent,
  );
  const siblingPriceGroupIDPath = buildIdPathList(
    siblingIdPathNode,
    readIdPathNodeID,
    readIdPathNodeParent,
  );
  const globalRatePriceGroupIDPath = buildIdPathList(
    globalRateIdPathNode,
    readIdPathNodeID,
    readIdPathNodeParent,
  );
  const isolatedPriceGroupIDPath = buildIdPathList(
    isolatedIdPathNode,
    readIdPathNodeID,
    readIdPathNodeParent,
  );

  const roundValueDoubleAnswer = Money.fromDecimalString(roundValueAnswer);
  const roundingRuleValueRounder = makeRecordingValueRounder(roundValueDoubleAnswer);

  const closestRoundingRule = makeRoundingRule(
    {
      roundingRuleID: `${idPrefix}-roundingrule-closest`,
      roundingRuleName: 'Closest to .99',
      roundingRuleExpression: '.99',
      roundingRuleDirection: 'Closest',
      priceGroupRates: [],
    },
    roundingRuleValueRounder,
    audit,
  );

  const roundUpRoundingRule = makeRoundingRule(
    {
      roundingRuleID: `${idPrefix}-roundingrule-up`,
      roundingRuleName: 'Up to .99',
      roundingRuleExpression: '.99',
      roundingRuleDirection: 'Up',
      priceGroupRates: [],
    },
    roundingRuleValueRounder,
    audit,
  );

  const roundDownRoundingRule = makeRoundingRule(
    {
      roundingRuleID: `${idPrefix}-roundingrule-down`,
      roundingRuleName: 'Down to .99',
      roundingRuleExpression: '.99',
      roundingRuleDirection: 'Down',
      priceGroupRates: [],
    },
    roundingRuleValueRounder,
    audit,
  );

  // LEGACY-DEFECT [model/entity/RoundingRule.cfc:L55]: roundingRuleDirection is required but
  // UNCONSTRAINED - the column enforces no enumeration and neither does the form metadata - so an
  // out-of-vocabulary direction reaches the switch's missing default branch
  // [model/service/RoundingRuleService.cfc:L132-L166], no candidate is selected.
  // Preserved deliberately; do not fix without a product decision.
  const outOfVocabularyDirectionRoundingRule = makeRoundingRule(
    {
      roundingRuleID: `${idPrefix}-roundingrule-outofvocabulary`,
      roundingRuleName: 'Direction outside the published vocabulary',
      roundingRuleExpression: '.99',
      roundingRuleDirection: OUT_OF_VOCABULARY_ROUNDING_DIRECTION,
      priceGroupRates: [],
    },
    roundingRuleValueRounder,
    audit,
  );

  // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L88]: '0.00' is the declared default for
  // `roundingExpression` and reads as inert, but 12.3456 becomes 10.00. This rule states it; the
  // next omits the column so CFML's declared default supplies it.
  // Preserved deliberately; do not fix without a product decision.
  const defaultExpressionRoundingRule = makeRoundingRule(
    {
      roundingRuleID: `${idPrefix}-roundingrule-defaultexpression`,
      roundingRuleName: 'Default expression, written out',
      roundingRuleExpression: '0.00',
      roundingRuleDirection: 'Closest',
      priceGroupRates: [],
    },
    roundingRuleValueRounder,
    audit,
  );

  // CFML parity [model/entity/RoundingRule.cfc:L54]: the accessor reports the column truthfully as
  // absent rather than collapsing it to '', because collapsing would SUPPRESS the declared default
  // at [model/service/RoundingRuleService.cfc:L88].
  const absentExpressionRoundingRule = makeRoundingRule(
    {
      roundingRuleID: `${idPrefix}-roundingrule-absentexpression`,
      roundingRuleName: 'Expression column absent',
      roundingRuleExpression: undefined,
      roundingRuleDirection: 'Closest',
      priceGroupRates: [],
    },
    roundingRuleValueRounder,
    audit,
  );

  const productTypeLevelRate = makePriceGroupRate(
    {
      priceGroupRateID: `${idPrefix}-rate-producttypelevel`,
      globalFlag: false,
      amount: PRODUCT_TYPE_LEVEL_RATE_AMOUNT,
      amountType: 'percentageOff',
      roundingRule: closestRoundingRule,
      productTypes: productTypeLevelRateProductTypes,
      products: [],
      skus: [],
      excludedProductTypes: [],
      excludedProducts: [],
      excludedSkus: [],
    },
    audit,
  );

  const productLevelRate = makePriceGroupRate(
    {
      priceGroupRateID: `${idPrefix}-rate-productlevel`,
      globalFlag: false,
      amount: PRODUCT_LEVEL_RATE_AMOUNT,
      amountType: 'percentageOff',
      roundingRule: closestRoundingRule,
      productTypes: [],
      products: productLevelRateProducts,
      skus: [],
      excludedProductTypes: [],
      excludedProducts: [],
      excludedSkus: [],
    },
    audit,
  );

  // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L146-L150]: the sku-level loop has no
  // `break`, so it reassigns `returnRate` for every match and the LAST one in collection order
  // wins.
  // Preserved deliberately; do not fix without a product decision.
  const skuLevelRateFirstMatch = makePriceGroupRate(
    {
      priceGroupRateID: `${idPrefix}-rate-skulevel-firstmatch`,
      globalFlag: false,
      amount: SKU_LEVEL_RATE_FIRST_MATCH_AMOUNT,
      amountType: 'percentageOff',
      roundingRule: closestRoundingRule,
      productTypes: [],
      products: [],
      skus: skuLevelRateSkus,
      excludedProductTypes: [],
      excludedProducts: [],
      excludedSkus: [],
    },
    audit,
  );

  const skuLevelRateLastMatch = makePriceGroupRate(
    {
      priceGroupRateID: `${idPrefix}-rate-skulevel-lastmatch`,
      globalFlag: false,
      amount: SKU_LEVEL_RATE_LAST_MATCH_AMOUNT,
      amountType: 'percentageOff',
      roundingRule: closestRoundingRule,
      productTypes: [],
      products: [],
      skus: skuLevelRateSkus,
      excludedProductTypes: [],
      excludedProducts: [],
      excludedSkus: [],
    },
    audit,
  );

  // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L174]: the parent recursion calls
  // getRateForProductBasedOnPriceGroup - the PRODUCT variant - so a sku-level rate on a PARENT
  // price group is never consulted however precisely it matches.
  // Preserved deliberately; do not fix without a product decision.
  const parentSkuLevelRate = makePriceGroupRate(
    {
      priceGroupRateID: `${idPrefix}-rate-parent-skulevel`,
      globalFlag: false,
      amount: PARENT_SKU_LEVEL_RATE_AMOUNT,
      amountType: 'percentageOff',
      roundingRule: closestRoundingRule,
      productTypes: [],
      products: [],
      skus: parentSkuLevelRateSkus,
      excludedProductTypes: [],
      excludedProducts: [],
      excludedSkus: [],
    },
    audit,
  );

  // CFML parity [model/service/PriceGroupService.cfc:L102-L137, L140-L181]: a structural
  // redundancy.
  const parentProductLevelRate = makePriceGroupRate(
    {
      priceGroupRateID: `${idPrefix}-rate-parent-productlevel`,
      globalFlag: false,
      amount: PARENT_PRODUCT_LEVEL_RATE_AMOUNT,
      amountType: 'percentageOff',
      roundingRule: closestRoundingRule,
      productTypes: [],
      products: parentProductLevelRateProducts,
      skus: [],
      excludedProductTypes: [],
      excludedProducts: [],
      excludedSkus: [],
    },
    audit,
  );

  // LEGACY-DEFECT [model/entity/PriceGroup.cfc:L83-L90]: two global-rate lookups break ties in
  // opposite directions. The entity accessor returns on the first rate whose global flag is set,
  // so the first wins.
  // Preserved deliberately; do not fix without a product decision.
  const globalRateFirstMatch = makePriceGroupRate(
    {
      priceGroupRateID: `${idPrefix}-rate-global-firstmatch`,
      globalFlag: true,
      amount: GLOBAL_RATE_FIRST_MATCH_AMOUNT,
      amountType: 'percentageOff',
      roundingRule: closestRoundingRule,
      productTypes: [],
      products: [],
      skus: [],
      excludedProductTypes: [],
      excludedProducts: [],
      excludedSkus: [],
    },
    audit,
  );

  const globalRateLastMatch = makePriceGroupRate(
    {
      priceGroupRateID: `${idPrefix}-rate-global-lastmatch`,
      globalFlag: true,
      amount: GLOBAL_RATE_LAST_MATCH_AMOUNT,
      amountType: 'percentageOff',
      roundingRule: closestRoundingRule,
      productTypes: [],
      products: [],
      skus: [],
      excludedProductTypes: [],
      excludedProducts: [],
      excludedSkus: [],
    },
    audit,
  );

  const rootGlobalRate = makePriceGroupRate(
    {
      priceGroupRateID: `${idPrefix}-rate-root-global`,
      globalFlag: true,
      amount: ROOT_GLOBAL_RATE_AMOUNT,
      amountType: 'percentageOff',
      roundingRule: closestRoundingRule,
      productTypes: [],
      products: [],
      skus: [],
      excludedProductTypes: [],
      excludedProducts: [],
      excludedSkus: [],
    },
    audit,
  );

  // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L316-L340]: only the `percentageOff` branch
  // applies the rounding rule.
  // Preserved deliberately; do not fix without a product decision.

  const percentageOffRateWithRoundingRule = makePriceGroupRate(
    {
      priceGroupRateID: `${idPrefix}-rate-percentageoff-withroundingrule`,
      globalFlag: false,
      amount: REFERENCE_PERCENTAGE_OFF,
      amountType: 'percentageOff',
      roundingRule: closestRoundingRule,
      productTypes: [],
      products: [],
      skus: [],
      excludedProductTypes: [],
      excludedProducts: [],
      excludedSkus: [],
    },
    audit,
  );

  const amountOffRateWithRoundingRule = makePriceGroupRate(
    {
      priceGroupRateID: `${idPrefix}-rate-amountoff-withroundingrule`,
      globalFlag: false,
      amount: AMOUNT_OFF_RATE_AMOUNT,
      amountType: 'amountOff',
      roundingRule: closestRoundingRule,
      productTypes: [],
      products: [],
      skus: [],
      excludedProductTypes: [],
      excludedProducts: [],
      excludedSkus: [],
    },
    audit,
  );

  const fixedAmountRateWithRoundingRule = makePriceGroupRate(
    {
      priceGroupRateID: `${idPrefix}-rate-fixedamount-withroundingrule`,
      globalFlag: false,
      amount: FIXED_AMOUNT_RATE_AMOUNT,
      amountType: 'amount',
      roundingRule: closestRoundingRule,
      productTypes: [],
      products: [],
      skus: [],
      excludedProductTypes: [],
      excludedProducts: [],
      excludedSkus: [],
    },
    audit,
  );

  const percentageOffRateWithoutRoundingRule = makePriceGroupRate(
    {
      priceGroupRateID: `${idPrefix}-rate-percentageoff-withoutroundingrule`,
      globalFlag: false,
      amount: REFERENCE_PERCENTAGE_OFF,
      amountType: 'percentageOff',
      roundingRule: undefined,
      productTypes: [],
      products: [],
      skus: [],
      excludedProductTypes: [],
      excludedProducts: [],
      excludedSkus: [],
    },
    audit,
  );

  // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L321-L336]: the amount-type switch has no
  // `default:` case, so an unrecognised type selects no branch and the L319 seed -
  // `arguments.sku.getPrice()`, the UNDISCOUNTED price - falls through to the L339 return.
  // Preserved deliberately; do not fix without a product decision.
  //
  // JUDGMENT CALL: `amountType` is a CLOSED union, since narrowing the raw column happens at the
  // repository boundary.
  const unrecognisedAmountTypeRate = makePriceGroupRate(
    {
      priceGroupRateID: `${idPrefix}-rate-unrecognisedamounttype`,
      globalFlag: false,
      amount: UNRECOGNISED_AMOUNT_TYPE_RATE_AMOUNT,
      amountType: undefined,
      roundingRule: closestRoundingRule,
      productTypes: [],
      products: [],
      skus: [],
      excludedProductTypes: [],
      excludedProducts: [],
      excludedSkus: [],
    },
    audit,
  );

  // The only rate carrying all six association collections at once, so `getAppliesTo()`
  // [model/entity/PriceGroupRate.cfc:L95-L146] runs its including branch.
  const appliesToIncludingAndExcludingRate = makePriceGroupRate(
    {
      priceGroupRateID: `${idPrefix}-rate-appliesto`,
      globalFlag: false,
      amount: APPLIES_TO_RATE_AMOUNT,
      amountType: 'percentageOff',
      roundingRule: closestRoundingRule,
      productTypes: productTypeLevelRateProductTypes,
      products: productLevelRateProducts,
      skus: skuLevelRateSkus,
      excludedProductTypes,
      excludedProducts,
      excludedSkus,
    },
    audit,
  );

  // JUDGMENT CALL: the delete-guard pair is wired one way only, and has to be.
  const rateBlockingRoundingRuleDelete = makePriceGroupRate(
    {
      priceGroupRateID: `${idPrefix}-rate-blocksroundingruledelete`,
      globalFlag: false,
      amount: DELETE_GUARD_RATE_AMOUNT,
      amountType: 'percentageOff',
      roundingRule: undefined,
      productTypes: [],
      products: [],
      skus: [],
      excludedProductTypes: [],
      excludedProducts: [],
      excludedSkus: [],
    },
    audit,
  );

  const undeletableRoundingRule = makeRoundingRule(
    {
      roundingRuleID: `${idPrefix}-roundingrule-undeletable`,
      roundingRuleName: 'Has an attached rate, so it cannot be deleted',
      roundingRuleExpression: '.99',
      roundingRuleDirection: 'Closest',
      priceGroupRates: [rateBlockingRoundingRuleDelete],
    },
    roundingRuleValueRounder,
    audit,
  );

  // Every group is constructed with `parentPriceGroup: undefined` and attached through
  // `addChildPriceGroup` below.

  const rootPriceGroup = makePriceGroup(
    {
      priceGroupID: rootPriceGroupID,
      priceGroupIDPath: rootPriceGroupIDPath,
      priceGroupName: 'Root price group',
      priceGroupCode: `${idPrefix}-root`,
      parentPriceGroup: undefined,
      promotionRewards: [],
    },
    activeFlag,
    audit,
  );

  const parentPriceGroup = makePriceGroup(
    {
      priceGroupID: parentPriceGroupID,
      priceGroupIDPath: parentPriceGroupIDPath,
      priceGroupName: 'Parent price group',
      priceGroupCode: `${idPrefix}-parent`,
      parentPriceGroup: undefined,
      promotionRewards: [],
    },
    activeFlag,
    audit,
  );

  const childPriceGroup = makePriceGroup(
    {
      priceGroupID: childPriceGroupID,
      priceGroupIDPath: childPriceGroupIDPath,
      priceGroupName: 'Child price group',
      priceGroupCode: `${idPrefix}-child`,
      parentPriceGroup: undefined,

      // CFML parity [model/entity/PriceGroup.cfc:L70]: the many-to-many through
      // `SwPromoRewardEligiblePriceGrp`, the ORM backing for the promotion engine's
      // `hasEligiblePriceGroup()` test [model/service/PromotionService.cfc:L241].
      promotionRewards,
    },
    activeFlag,
    audit,
  );

  const siblingPriceGroup = makePriceGroup(
    {
      priceGroupID: siblingPriceGroupID,
      priceGroupIDPath: siblingPriceGroupIDPath,
      priceGroupName: 'Sibling price group',
      priceGroupCode: `${idPrefix}-sibling`,
      parentPriceGroup: undefined,
      promotionRewards: [],
    },
    activeFlag,
    audit,
  );

  const globalRatePriceGroup = makePriceGroup(
    {
      priceGroupID: globalRatePriceGroupID,
      priceGroupIDPath: globalRatePriceGroupIDPath,
      priceGroupName: 'Global-rate price group',
      priceGroupCode: `${idPrefix}-globalrates`,
      parentPriceGroup: undefined,
      promotionRewards: [],
    },
    activeFlag,
    audit,
  );

  // The total-miss subject.
  //
  // JUDGMENT CALL: there is deliberately no zero-amount rate standing in for the miss, which would
  // turn "no rate applies" into "a rate applies and takes nothing off".
  const isolatedPriceGroup = makePriceGroup(
    {
      priceGroupID: isolatedPriceGroupID,
      priceGroupIDPath: isolatedPriceGroupIDPath,
      priceGroupName: 'Isolated price group',
      priceGroupCode: `${idPrefix}-isolated`,
      parentPriceGroup: undefined,
      promotionRewards: [],
    },
    activeFlag,
    audit,
  );

  // CFML parity [model/entity/PriceGroup.cfc:L195-L200, L206-L214]: the stored column is absent,
  // so the accessor rebuilds the path from the live parent chain and memoizes it - the work the
  // `preInsert` and `preUpdate` hooks did, now invoked explicitly.
  const unpathedPriceGroup = makePriceGroup(
    {
      priceGroupID: unpathedPriceGroupID,
      priceGroupIDPath: undefined,
      priceGroupName: 'Price group with no stored path',
      priceGroupCode: `${idPrefix}-unpathed`,
      parentPriceGroup: undefined,
      promotionRewards: [],
    },
    activeFlag,
    audit,
  );

  // LEGACY-NOTE [model/service/PriceGroupService.cfc:L461-L470], recorded here and reproduced in
  // `src/services/priceGroupService.ts` rather than by this fixture:
  // `deletePriceGroup` takes `getChildPriceGroups()` into a local and loops
  // `while(arrayLen(local) != 0)` calling `removeChildPriceGroup`.
  //
  // CFML parity [model/service/PriceGroupService.cfc:L466]: the legacy line reads
  // `priceGroup.removeChildPriceGroup(...)` unscoped rather than `arguments.priceGroup`. CFML
  // resolves it to the argument anyway, so it is a hygiene slip.
  //
  // CFML parity [model/entity/PriceGroup.cfc:L63]: `childPriceGroups` declares
  // `singularname="ChildPriceGroup"` CAPITALISED where every sibling uses a lower-case initial.
  rootPriceGroup.addChildPriceGroup(parentPriceGroup);
  rootPriceGroup.addChildPriceGroup(unpathedPriceGroup);
  parentPriceGroup.addChildPriceGroup(childPriceGroup);
  parentPriceGroup.addChildPriceGroup(siblingPriceGroup);

  childPriceGroup.addPriceGroupRate(productTypeLevelRate);
  childPriceGroup.addPriceGroupRate(productLevelRate);
  childPriceGroup.addPriceGroupRate(skuLevelRateFirstMatch);
  childPriceGroup.addPriceGroupRate(skuLevelRateLastMatch);

  parentPriceGroup.addPriceGroupRate(parentSkuLevelRate);
  parentPriceGroup.addPriceGroupRate(parentProductLevelRate);

  rootPriceGroup.addPriceGroupRate(rootGlobalRate);

  globalRatePriceGroup.addPriceGroupRate(globalRateFirstMatch);
  globalRatePriceGroup.addPriceGroupRate(globalRateLastMatch);

  siblingPriceGroup.addPriceGroupRate(percentageOffRateWithRoundingRule);
  siblingPriceGroup.addPriceGroupRate(amountOffRateWithRoundingRule);
  siblingPriceGroup.addPriceGroupRate(fixedAmountRateWithRoundingRule);
  siblingPriceGroup.addPriceGroupRate(percentageOffRateWithoutRoundingRule);
  siblingPriceGroup.addPriceGroupRate(unrecognisedAmountTypeRate);
  siblingPriceGroup.addPriceGroupRate(appliesToIncludingAndExcludingRate);
  siblingPriceGroup.addPriceGroupRate(rateBlockingRoundingRuleDelete);

  const directionOptions = closestRoundingRule.getRoundingRuleDirectionOptions();
  const roundingRuleDirectionVocabulary: readonly [
    RoundingRuleDirection,
    RoundingRuleDirection,
    RoundingRuleDirection,
  ] = [directionOptions[0].value, directionOptions[1].value, directionOptions[2].value];

  const amountTypeOptions = percentageOffRateWithRoundingRule.getAmountTypeOptions();
  const recognisedAmountTypes: readonly [
    PriceGroupRateAmountType,
    PriceGroupRateAmountType,
    PriceGroupRateAmountType,
  ] = [amountTypeOptions[0].value, amountTypeOptions[1].value, amountTypeOptions[2].value];

  return {
    roundingRuleValueRounder,
    roundValueDoubleAnswer,

    closestRoundingRule,
    roundUpRoundingRule,
    roundDownRoundingRule,
    outOfVocabularyDirectionRoundingRule,
    defaultExpressionRoundingRule,
    absentExpressionRoundingRule,
    undeletableRoundingRule,
    rateBlockingRoundingRuleDelete,
    roundingRuleDirectionVocabulary,
    outOfVocabularyRoundingRuleDirection: OUT_OF_VOCABULARY_ROUNDING_DIRECTION,

    roundingExpressionCases: makeRoundingExpressionCases(),
    roundValueCases: makeRoundValueCases(),
    referenceCalculation: makeReferenceCalculation(),

    productTypeLevelRate,
    productLevelRate,
    skuLevelRateFirstMatch,
    skuLevelRateLastMatch,

    parentSkuLevelRate,
    parentProductLevelRate,

    globalRateFirstMatch,
    globalRateLastMatch,

    rootGlobalRate,

    recognisedAmountTypes,
    percentageOffRateWithRoundingRule,
    amountOffRateWithRoundingRule,
    fixedAmountRateWithRoundingRule,
    percentageOffRateWithoutRoundingRule,
    unrecognisedAmountTypeRate,
    unrecognisedAmountTypeColumnValue: UNRECOGNISED_AMOUNT_TYPE_COLUMN_VALUE,
    appliesToIncludingAndExcludingRate,

    rootPriceGroup,
    parentPriceGroup,
    childPriceGroup,
    siblingPriceGroup,
    globalRatePriceGroup,
    isolatedPriceGroup,
    unpathedPriceGroup,

    priceGroupIDPaths: {
      root: rootPriceGroupIDPath,
      parent: parentPriceGroupIDPath,
      child: childPriceGroupIDPath,
      sibling: siblingPriceGroupIDPath,
    },
  };
}
