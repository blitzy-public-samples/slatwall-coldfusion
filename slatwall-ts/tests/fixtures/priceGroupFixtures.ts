// ---------------------------------------------------------------------------
// slatwall-ts - PRICE-GROUP / PRICE-GROUP-RATE / ROUNDING-RULE TEST DATA
//
// One deterministic factory returning a fully-formed graph of `SwPriceGroup`, `SwPriceGroupRate`
// and `SwRoundingRule` entities, plus the two verified data tables the rounding algorithm is pinned
// against.
//
// IT IS THE ROOT OF THE FIXTURE DEPENDENCY GRAPH, so it imports NO sibling fixture - that would
// close a cycle in a graph acyclic by construction. A rate's three membership collections
// [model/entity/PriceGroupRate.cfc:L71-L73] are typed through `import type` only and populated
// solely through `overrides`, so a suite needing the cascade to match brings its own catalog
// entities. Every collection defaults to `[]`, the state a repository that did not fetch the join
// must present.
//
// [meta/tests/unit/Helper.cfc] is the legacy tree's only fixture-construction artefact; its build
// -> save -> flush SHAPE is carried over and its ORM MECHANISM is not.
//
// CFML parity [meta/tests/unit/Helper.cfc:L53]: the helper assigns `productData` with no `var`,
// leaking it into component `variables` scope. A harness hygiene defect, not a preserved
// business-logic one, so deliberately not reproduced.
// ---------------------------------------------------------------------------

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

// --- Structurally derived types -------------------------------------------
//
// JUDGMENT CALL: two types this graph needs are declared in modules that are NOT among its
// dependencies, so they are DERIVED from the entity surfaces already in scope, keeping the import
// set exactly the whitelist.

/** Element type of any array or readonly array. */
type ElementOf<TArray> = TArray extends readonly (infer TElement)[] ? TElement : never;

/**
 * The `activeFlag` operand `PriceGroup` accepts, derived from the constructor rather than imported
 * from the CFML truthiness helper. The column declares no `default=` at all
 * [model/entity/PriceGroup.cfc:L54], which is why the operand is deliberately wide.
 */
type PriceGroupActiveFlag = ConstructorParameters<typeof PriceGroup>[0]['activeFlag'];

/**
 * The promotion-reward entity as seen through `PriceGroup`. `promotionRewards` is the many-to-many
 * through `SwPromoRewardEligiblePriceGrp` [model/entity/PriceGroup.cfc:L70] - the ORM backing for
 * the eligibility test at [model/service/PromotionService.cfc:L241].
 */
type PromotionRewardRef = ElementOf<ReturnType<PriceGroup['getPromotionRewards']>>;

// --- The collaborator double ---------------------------------------------

/** One recorded delegation from `RoundingRule.roundValue`. */
type RecordedRoundValueCall = {
  readonly value: Money;
  readonly rule: RoundingRule;
};

/**
 * A hand-written in-memory stand-in for the collaborator every `RoundingRule` delegates to.
 *
 * CFML parity [model/entity/RoundingRule.cfc:L66-L68]: `roundValue` is an ENTITY method whose whole
 * body is a service-locator lookup -
 *   `getService("roundingRuleService").roundValueByRoundingRule(value=..., roundingRule=this)`
 * and the port replaces it with a constructor-injected collaborator. The signature mirrors
 * [model/service/RoundingRuleService.cfc:L84-L86] with `any` narrowed.
 *
 * JUDGMENT CALL: the scripted answer is unrelated to any input, since an identity double would be
 * indistinguishable from "no rounding applied".
 */
interface RecordingValueRounder {
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money;

  /** Every delegation so far, in call order. */
  readonly calls: readonly RecordedRoundValueCall[];
}

// --- The two verified data tables ----------------------------------------

/**
 * One row of the rounding-expression acceptance table, measuring
 * [model/entity/RoundingRule.cfc:L78-L86] per comma-list element:
 *   `(len(v) - find(".", v)) != 2 || !isNumeric(v)`
 * rejects. CFML's `find` answers 0 when absent, which is the mechanism behind the accepting row
 * that should not accept.
 *
 * CFML parity [model/validation/RoundingRule.json:L4]: the plan records "no expression validation",
 * and that premise is wrong - the line reads
 *   `[{"contexts":"save","required":true,"method":"hasExpressionWithListOfNumericValuesOnly"}]`
 * so the expression IS validated on `save`. The plan's CONCLUSION survives another way: the
 * predicate has a hole.
 */
type RoundingExpressionCase = {
  /** The raw `SwRoundingRule.roundingRuleExpression` column value. */
  readonly expression: string;

  /** What `hasExpressionWithListOfNumericValuesOnly()` answers, measured not reasoned. */
  readonly accepted: boolean;

  /**
   * `10 ^ (len(element) - 3)` per comma-list element, as decimal numerals - the step increment
   * added to or subtracted from the two-decimal input [model/service/RoundingRuleService.cfc:L95,
   * L101, L108]. A FRACTIONAL value means an increment smaller than one cent, the defect the
   * accepting-but-fractional row exposes.
   */
  readonly derivedPowerPerElement: readonly DecimalString[];
};

/**
 * One measured `roundValue` outcome. Every field is a decimal STRING, and not stylistically:
 * several rows exist because a trailing zero changes the answer, and a numeric literal would
 * destroy the property before the algorithm saw it - it measures `len()` of an intermediate and
 * slices a prefix off it.
 */
type RoundValueCase = {
  /** The value handed in, as the caller's own numeral. */
  readonly input: DecimalString;

  /**
   * The rounding expression. A plain `string`, never a branded numeral: neither the comma-list form
   * `'.95,.99'` nor the leading-dot form the legacy data uses is a decimal numeral.
   */
  readonly roundingExpression: string;

  /** One of the three directions the entity publishes. */
  readonly roundingDirection: RoundingRuleDirection;

  /** The measured result. */
  readonly expected: DecimalString;
};

/**
 * The migration's reference calculation as decimal numerals, so a suite can drive it off the same
 * numbers the arithmetic substrate is pinned against with no floating-point step. `quantity` is a
 * COUNT and so a plain `number`; the rest are numerals destined for `Money`.
 */
type ReferenceCalculation = {
  readonly unitPrice: DecimalString;
  readonly quantity: number;
  readonly extendedPrice: DecimalString;
  readonly percentageOff: DecimalString;
  readonly discountAmount: DecimalString;
  readonly netAmount: DecimalString;
  readonly presentedNetAmount: DecimalString;
};

// --- The single optional parameter ---------------------------------------

/**
 * Every axis of variation this factory offers, and the only one. Each default is documented on its
 * own member.
 *
 * NOTE THE DELIBERATE ASYMMETRY WITH THE GRAPH TYPE BELOW. This is an options bag, so members are
 * optional AND admit an explicit `undefined`, which differ under `exactOptionalPropertyTypes`. The
 * graph's nullable members are the opposite: REQUIRED slots typed `T | undefined`, because "found
 * nothing" must be stated rather than omitted.
 */
interface PriceGroupFixtureOverrides {
  /**
   * Prefix for every generated primary key. Default `'pgfx'`. Identifiers derive from this argument
   * alone - no counter, no sequence, no registry - so two calls with different prefixes yield
   * disjoint keys and two with the same prefix yield the same keys on genuinely separate instances.
   */
  readonly idPrefix?: string | undefined;

  /**
   * `activeFlag` for every price group in the graph. Default `undefined`.
   *
   * CFML parity [model/entity/PriceGroup.cfc:L54]: the column declares NO `default=`, so
   * `undefined` is the honest unset state and `getActiveFlag()` resolves it to `false`. Nothing in
   * the cascade consults the flag; its only legacy consumer is
   * [model/dao/PriceGroupDAO.cfc:L93-L95].
   */
  readonly activeFlag?: PriceGroupActiveFlag;

  /**
   * Membership for BOTH sku-level rates on the child price group. Default `[]`. Both receive the
   * same members on purpose - that is what makes last-match-wins observable.
   */
  readonly skuLevelRateSkus?: readonly Sku[] | undefined;

  /** Membership for the product-level rate on the child price group. Default `[]`. */
  readonly productLevelRateProducts?: readonly Product[] | undefined;

  /** Membership for the product-type-level rate on the child price group. Default `[]`. */
  readonly productTypeLevelRateProductTypes?: readonly ProductType[] | undefined;

  /**
   * Membership for the sku-level rate on the PARENT price group. Default `[]`. Separate from
   * `skuLevelRateSkus` because proving a parent's sku-level rate is never consulted requires the
   * child to hold no matching sku rate while the parent does.
   */
  readonly parentSkuLevelRateSkus?: readonly Sku[] | undefined;

  /**
   * Membership for the product-level rate on the PARENT price group. Default `[]`. The contrast
   * case: the parent's PRODUCT rate is the one the recursion does reach.
   */
  readonly parentProductLevelRateProducts?: readonly Product[] | undefined;

  /** Exclusions for the rates that carry them. Default `[]`. */
  readonly excludedSkus?: readonly Sku[] | undefined;

  /** Exclusions for the rates that carry them. Default `[]`. */
  readonly excludedProducts?: readonly Product[] | undefined;

  /** Exclusions for the rates that carry them. Default `[]`. */
  readonly excludedProductTypes?: readonly ProductType[] | undefined;

  /** Eligible rewards for the child group. Default `[]`; [model/entity/PriceGroup.cfc:L70]. */
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
  // --- The collaborator double ---------------------------------------------

  /** The recording double injected into every `RoundingRule` in this graph. */
  readonly roundingRuleValueRounder: RecordingValueRounder;

  /** Exactly what `roundingRuleValueRounder` answers, for assertions. */
  readonly roundValueDoubleAnswer: Money;

  // --- Rounding rules -------------------------------------------------------

  /** In-vocabulary direction `'Closest'`, expression `'.99'`. */
  readonly closestRoundingRule: RoundingRule;

  /** In-vocabulary direction `'Up'`, expression `'.99'`. */
  readonly roundUpRoundingRule: RoundingRule;

  /** In-vocabulary direction `'Down'`, expression `'.99'`. */
  readonly roundDownRoundingRule: RoundingRule;

  /** Direction outside the published vocabulary; see the marker on its builder. */
  readonly outOfVocabularyDirectionRoundingRule: RoundingRule;

  /** Expression `'0.00'` written out explicitly - the non-inert default. */
  readonly defaultExpressionRoundingRule: RoundingRule;

  /** Expression absent, so the service's declared default applies instead. */
  readonly absentExpressionRoundingRule: RoundingRule;

  /**
   * A rounding rule with a non-empty `priceGroupRates` collection.
   *
   * CFML parity [model/validation/RoundingRule.json:L6]: `priceGroupRates` carries
   * `{"contexts":"delete","maxCollection":0}`, so a rule with any rate attached cannot be deleted.
   * Every other rule here carries `[]`, making the guard vacuous.
   */
  readonly undeletableRoundingRule: RoundingRule;

  /** The rate that populates `undeletableRoundingRule.getPriceGroupRates()`. */
  readonly rateBlockingRoundingRuleDelete: PriceGroupRate;

  /** The three directions the entity publishes, in source order. */
  readonly roundingRuleDirectionVocabulary: readonly [
    RoundingRuleDirection,
    RoundingRuleDirection,
    RoundingRuleDirection,
  ];

  /** The direction string `outOfVocabularyDirectionRoundingRule` carries, exposed as data. */
  readonly outOfVocabularyRoundingRuleDirection: string;

  // --- The two verified data tables ----------------------------------------

  /** All nine acceptance rows, including the one that accepts and should not. */
  readonly roundingExpressionCases: readonly RoundingExpressionCase[];

  /** All ten measured `roundValue` outcomes. */
  readonly roundValueCases: readonly RoundValueCase[];

  /** The migration's reference calculation, as numerals. */
  readonly referenceCalculation: ReferenceCalculation;

  // --- Rates on the child price group, in collection order -----------------

  /** Cascade level 3 membership: `productTypes`. */
  readonly productTypeLevelRate: PriceGroupRate;

  /** Cascade level 2 membership: `products`. */
  readonly productLevelRate: PriceGroupRate;

  /** Cascade level 1, FIRST matching rate in collection order. */
  readonly skuLevelRateFirstMatch: PriceGroupRate;

  /** Cascade level 1, LAST matching rate in collection order - the winner. */
  readonly skuLevelRateLastMatch: PriceGroupRate;

  // --- Rates on the parent price group --------------------------------------

  /** The sku-level rate the cascade never consults; see the marker on its builder. */
  readonly parentSkuLevelRate: PriceGroupRate;

  /** The product-level rate the parent recursion does reach. */
  readonly parentProductLevelRate: PriceGroupRate;

  // --- Rates on the global-rate price group ---------------------------------

  /** FIRST global rate in collection order. */
  readonly globalRateFirstMatch: PriceGroupRate;

  /** LAST global rate in collection order. */
  readonly globalRateLastMatch: PriceGroupRate;

  // --- The rate on the root price group -------------------------------------

  /** The deepest fallback: the only rate on the top of the parent chain. */
  readonly rootGlobalRate: PriceGroupRate;

  // --- Amount-type exhibits -------------------------------------------------

  /** The three values the amount-type dispatch recognises, in source order. */
  readonly recognisedAmountTypes: readonly [
    PriceGroupRateAmountType,
    PriceGroupRateAmountType,
    PriceGroupRateAmountType,
  ];

  /** `'percentageOff'` WITH a rounding rule - the one branch that rounds. */
  readonly percentageOffRateWithRoundingRule: PriceGroupRate;

  /** `'amountOff'` WITH a rounding rule attached and ignored. */
  readonly amountOffRateWithRoundingRule: PriceGroupRate;

  /** `'amount'` WITH a rounding rule attached and ignored. */
  readonly fixedAmountRateWithRoundingRule: PriceGroupRate;

  /** `'percentageOff'` with NO rounding rule - the nullable far side absent. */
  readonly percentageOffRateWithoutRoundingRule: PriceGroupRate;

  /** A rate whose amount type the dispatch does not recognise. */
  readonly unrecognisedAmountTypeRate: PriceGroupRate;

  /**
   * A raw out-of-vocabulary `SwPriceGroupRate.amountType` column value. Data, not an entity: see
   * the marker on the unrecognised-amount-type rate for why the column can hold it.
   */
  readonly unrecognisedAmountTypeColumnValue: string;

  /** A non-global rate carrying all six association collections. */
  readonly appliesToIncludingAndExcludingRate: PriceGroupRate;

  // --- Price groups ---------------------------------------------------------

  /** Top of the three-level parent chain; holds only `rootGlobalRate`. */
  readonly rootPriceGroup: PriceGroup;

  /** Middle of the chain, and the exhibit for the snapshot-loop guard. */
  readonly parentPriceGroup: PriceGroup;

  /** The primary cascade subject: four membership rates, no global rate. */
  readonly childPriceGroup: PriceGroup;

  /** The parent's second child, so the child collection holds more than one. */
  readonly siblingPriceGroup: PriceGroup;

  /** Isolates the global level and its two opposite tie-breaks. */
  readonly globalRatePriceGroup: PriceGroup;

  /** No rates, no parent, no children: the cascade resolves to nothing. */
  readonly isolatedPriceGroup: PriceGroup;

  /** Stored path absent, so the accessor rebuilds and memoizes it. */
  readonly unpathedPriceGroup: PriceGroup;

  // --- Materialized paths ---------------------------------------------------

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

// --- Module-scope constants ------------------------------------------------
//
// Every one an immutable primitive, so nothing carries state from one factory call to the next.
// That is the discipline the port applies to the four legacy component-level caches.

const DEFAULT_ID_PREFIX = 'pgfx';

/** See `roundValueAnswer` on the overrides for why this is unrelated to any input. */
const DEFAULT_ROUND_VALUE_ANSWER = '77.77';

const OUT_OF_VOCABULARY_ROUNDING_DIRECTION = 'Sideways';

const UNRECOGNISED_AMOUNT_TYPE_COLUMN_VALUE = 'flatRate';

// Explicit UTC instants, never a clock read: a relative offset would make an assertion depend on
// the day it ran, and the runner pins the process timezone to UTC.
const CREATED_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';
const MODIFIED_DATE_TIME_UTC = '2024-06-15T12:30:00.000Z';

// Rate amounts, as decimal numerals destined for `Money`, each distinct so "which rate won" is
// answerable from the amount alone.
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

// The reference calculation, verified against the pinned arithmetic substrate.
const REFERENCE_UNIT_PRICE = '19.99';
const REFERENCE_QUANTITY = 3;
const REFERENCE_EXTENDED_PRICE = '59.97';
const REFERENCE_PERCENTAGE_OFF = '12.5';
const REFERENCE_DISCOUNT_AMOUNT = '7.49625';
const REFERENCE_NET_AMOUNT = '52.47375';
const REFERENCE_PRESENTED_NET_AMOUNT = '52.47';

// ---------------------------------------------------------------------------
// Module-scope pure builders: functions, never data, each returning a FRESHLY constructed value on
// every call, so no array and no object is ever shared between two graphs.
// ---------------------------------------------------------------------------

/** The audit columns every entity in one graph carries. */
type AuditTrail = {
  readonly createdDateTime: Date;
  readonly createdByAccountID: string;
  readonly modifiedDateTime: Date;
  readonly modifiedByAccountID: string;
};

/** Fresh `Date` instances per graph: a `Date` is mutable, so it is never shared. */
function makeAuditTrail(idPrefix: string): AuditTrail {
  return {
    createdDateTime: new Date(CREATED_DATE_TIME_UTC),
    createdByAccountID: `${idPrefix}-account-created`,
    modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: `${idPrefix}-account-modified`,
  };
}

/**
 * Builds the recording collaborator double. The recording array is created inside the call, so two
 * graphs never observe each other's calls.
 */
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
 *   `(len(v) - find(".", v)) != 2 || !isNumeric(v)`
 * [model/entity/RoundingRule.cfc:L81].
 *
 * LEGACY-DEFECT [model/entity/RoundingRule.cfc:L78-L86]: the predicate accepts a bare
 *   `'99'`, because `find(".", "99")` is 0 and `len("99") - 0` is 2 - the arithmetic a
 *   well-formed `'.99'` produces. The expression then yields a FRACTIONAL step of
 *   `10 ^ (2 - 3)`, so the algorithm walks the value in tenths of a cent.
 * Preserved deliberately; do not fix without a product decision.
 */
function makeRoundingExpressionCases(): RoundingExpressionCase[] {
  return [
    // Accepted, and correctly so: a two-character fractional part after the point.
    { expression: '.99', accepted: true, derivedPowerPerElement: [toDecimalString('1')] },
    { expression: '0.99', accepted: true, derivedPowerPerElement: [toDecimalString('10')] },
    { expression: '9.99', accepted: true, derivedPowerPerElement: [toDecimalString('10')] },

    // Accepted, and the signature default. Not inert - see the `roundValue` rows.
    { expression: '0.00', accepted: true, derivedPowerPerElement: [toDecimalString('10')] },

    // Accepted per ELEMENT: the predicate walks the comma list.
    {
      expression: '.95,.99',
      accepted: true,
      derivedPowerPerElement: [toDecimalString('1'), toDecimalString('1')],
    },

    // Rejected: one character after the point.
    { expression: '.9', accepted: false, derivedPowerPerElement: [toDecimalString('0.1')] },

    // Rejected: no point at all, and three characters.
    { expression: '999', accepted: false, derivedPowerPerElement: [toDecimalString('1')] },

    // Rejected: three characters after the point.
    { expression: '0.999', accepted: false, derivedPowerPerElement: [toDecimalString('100')] },

    // THE HOLE: accepted, no decimal point, and a fractional derived step.
    { expression: '99', accepted: true, derivedPowerPerElement: [toDecimalString('0.1')] },
  ];
}

/**
 * The ten measured `roundValue` outcomes, produced by running the ported algorithm. A "corrected"
 * implementation returning tidier answers fails against this table, because
 * [model/service/RoundingRuleService.cfc:L88-L175] is decimal-string manipulation.
 *
 * LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L101-L102, L108-L109]: the
 *   intermediate is computed arithmetically and then `len()`-ed. CFML drops trailing zeros
 *   when stringifying, so any value whose cents end in zero takes a corrupted branch -
 *   `'12.30'` with `'.99'` yields `12.99` rather than the `11.99` the same expression yields
 *   for `'12.3456'`. Hence the `'12.30'` and `'2.30'` rows are STRINGS.
 * Preserved deliberately; do not fix without a product decision.
 *
 * LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L88]: the declared
 *   `roundingExpression="0.00"` default reads as inert and is not - it turns `12.3456` into
 *   `10.00`.
 * Preserved deliberately; do not fix without a product decision.
 *
 * LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L115-L118]: when the input is no
 *   longer than the expression, BOTH candidates become the expression itself, so `7.42` under
 *   `'9.99'` becomes `9.99` and `2.30` under `'0.99'` becomes `0.99`. The `0.42` row reaches a
 *   third branch, where the lower intermediate is negative.
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
      // Both accumulators survive across comma-list elements, so the best candidate across BOTH
      // expressions wins [model/service/RoundingRuleService.cfc:L90-L93].
      input: toDecimalString('12.3456'),
      roundingExpression: '.95,.99',
      roundingDirection: 'Closest',
      expected: toDecimalString('11.99'),
    },
    {
      // The trailing-zero branch: same expression as row two, opposite outcome.
      input: toDecimalString('12.30'),
      roundingExpression: '.99',
      roundingDirection: 'Closest',
      expected: toDecimalString('12.99'),
    },
    {
      // Short-input collapse: the answer is the expression, 2.57 ABOVE the input.
      input: toDecimalString('7.42'),
      roundingExpression: '9.99',
      roundingDirection: 'Closest',
      expected: toDecimalString('9.99'),
    },
    {
      // Short-input collapse AND a trailing zero: a 57 per cent reduction.
      input: toDecimalString('2.30'),
      roundingExpression: '0.99',
      roundingDirection: 'Closest',
      expected: toDecimalString('0.99'),
    },
    {
      // The negative-intermediate branch: the lower candidate is signed.
      input: toDecimalString('0.42'),
      roundingExpression: '.99',
      roundingDirection: 'Closest',
      expected: toDecimalString('0.99'),
    },
    {
      // The signature default written out: a 19 per cent reduction nobody asked for.
      input: toDecimalString('12.3456'),
      roundingExpression: '0.00',
      roundingDirection: 'Closest',
      expected: toDecimalString('10.00'),
    },
  ];
}

/** The reference calculation, freshly constructed per graph. */
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
 * Hydrates one `SwRoundingRule` row. `priceGroupRates` is the INVERSE side of the one-to-many at
 * [model/entity/RoundingRule.cfc:L64] and arrives already materialized, since associations are
 * materialized at the repository boundary. Every collection is copied in.
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

/** The data one `SwPriceGroupRate` row needs, before `Money` and defensive copies. */
type PriceGroupRateSpec = {
  readonly priceGroupRateID: string;

  /**
   * CFML parity [model/entity/PriceGroupRate.cfc:L53]: the column declares `default="false"`, so
   * unlike `PriceGroup.activeFlag` this one has a real default and every rate states it.
   */
  readonly globalFlag: boolean;

  /**
   * CFML parity [model/entity/PriceGroupRate.cfc:L54]: a `big_decimal` column with NO default, so
   * the value is a decimal NUMERAL fed to `Money` - never a `number`, since no `Money` factory
   * takes one, deliberately.
   */
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
   *   `excludedProducts` and `excludedSkus` are persisted through three link tables and the
   *   cascade NEVER consults any of them - not at the sku level
   *   [model/service/PriceGroupService.cfc:L146-L150], the product level [L108-L112] or the
   *   product-type level [L63-L78]. A sku listed as excluded is still selected.
   * Preserved deliberately; do not fix without a product decision.
   */
  readonly excludedProductTypes: readonly ProductType[];
  readonly excludedProducts: readonly Product[];
  readonly excludedSkus: readonly Sku[];
};

/**
 * Hydrates one `SwPriceGroupRate` row, leaving `priceGroup` `undefined` and wiring it afterwards
 * through the entity's bidirectional helper. Every collection is copied, so no caller array becomes
 * a live collection - the hazard CFML did not have, because
 * [model/service/PriceGroupService.cfc:L276] takes an array BY VALUE and appends at [L282] without
 * touching the account's own collection.
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
 * Hydrates one `SwPriceGroup` row. `childPriceGroups` and `priceGroupRates` start EMPTY and are
 * filled through `addChildPriceGroup` and `addPriceGroupRate`, which maintain the far side so the
 * two directions cannot disagree and append in call order - and collection ORDER decides which rate
 * wins in two separate legacy loops.
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
 * `priceGroupID` and `parent` links rather than from the entities. The entity publishes no path
 * setter, correctly, since one would let a caller write an arbitrary string into a column that
 * decides which rate wins - so a PERSISTED path must exist before the constructor runs while the
 * graph exists only after. The chain is handed to the domain's OWN path builder, so the strings are
 * the ones the entity would have produced.
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

// --- THE SINGLE EXPORT -----------------------------------------------------

/**
 * Builds one complete, independent price-group / price-group-rate / rounding-rule graph, plus the
 * two verified data tables the rounding algorithm is pinned against.
 *
 * A FRESH GRAPH ON EVERY CALL. Every entity, collection and `Date` is constructed inside this call,
 * so two calls share no mutable object - which lets a suite prove a second invocation does not
 * observe the first invocation's memo, the property a warm container makes load-bearing. Every
 * artefact carries its marker where it is built, including the five-level cascade
 * [model/service/PriceGroupService.cfc:L140-L181] through a three-deep parent chain.
 *
 * @param overrides - the only axis of variation; omit it for the documented defaults.
 * @returns one fully-formed graph, disposable by dropping the reference. There is deliberately
 *   no teardown counterpart: nothing was acquired.
 */
export function makePriceGroupFixtures(
  overrides?: PriceGroupFixtureOverrides,
): PriceGroupFixtureGraph {
  // `??` and not `||`: an empty prefix and a `false` flag are legitimate values, and truthiness
  // would silently replace both.

  const idPrefix = overrides?.idPrefix ?? DEFAULT_ID_PREFIX;

  // No `??` here. An absent key and an explicit `undefined` both mean the undefaulted column, and
  // an explicit `false` must survive as `false`.
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

  // Identifiers derived from this call's own argument and nothing else. Every one is a non-empty
  // string, so `isNew()` reports `false` and the bidirectional helpers take their duplicate-guarded
  // branch rather than their unconditional-append branch.

  const rootPriceGroupID = `${idPrefix}-pricegroup-root`;
  const parentPriceGroupID = `${idPrefix}-pricegroup-parent`;
  const childPriceGroupID = `${idPrefix}-pricegroup-child`;
  const siblingPriceGroupID = `${idPrefix}-pricegroup-sibling`;
  const globalRatePriceGroupID = `${idPrefix}-pricegroup-globalrates`;
  const isolatedPriceGroupID = `${idPrefix}-pricegroup-isolated`;
  const unpathedPriceGroupID = `${idPrefix}-pricegroup-unpathed`;

  // Materialized paths produced by the domain's own builder over the identifier chain; see the
  // judgment call on `IdPathNode`. The three chained groups yield one, two and three elements,
  // which makes "root-first, self-last, includes self, never empty" checkable.

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

  // --- The collaborator double ---------------------------------------------

  const roundValueDoubleAnswer = Money.fromDecimalString(roundValueAnswer);
  const roundingRuleValueRounder = makeRecordingValueRounder(roundValueDoubleAnswer);

  // CFML parity [model/entity/RoundingRule.cfc:L70-L76]: the direction vocabulary is published by
  // the ENTITY as an advisory admin option list, and nothing narrows the column to it.

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

  // LEGACY-DEFECT [model/entity/RoundingRule.cfc:L55 + model/validation/RoundingRule.json:L5]:
  //   roundingRuleDirection is required but UNCONSTRAINED - no enumeration is enforced by the
  //   column, the form metadata or the validation schema - so an out-of-vocabulary direction
  //   reaches the switch's missing default branch
  //   [model/service/RoundingRuleService.cfc:L132-L166], no candidate is selected, and the
  //   input falls out of the tail at L173.
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

  // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L88]: '0.00' is the declared default
  //   for `roundingExpression` and reads as inert, but 12.3456 becomes 10.00. This rule states
  //   it; the next omits the column so CFML's declared default supplies it.
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
  // at [model/service/RoundingRuleService.cfc:L88]. The decision belongs to the service.
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

  // Rates on the child group, in deliberate collection order: the sku loop
  // [model/service/PriceGroupService.cfc:L146-L150] walks the WHOLE collection, so the order these
  // four are appended in is the order the algorithm sees.

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

  // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L146-L150]: the sku-level loop has NO
  //   `break`, so it reassigns `returnRate` for every match and the LAST one in collection
  //   order wins. The two rates below share membership and differ in `amount`, which makes the
  //   winner observable.
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

  // --- Rates on the parent price group --------------------------------------

  // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L174]: the parent recursion calls
  //   getRateForProductBasedOnPriceGroup - the PRODUCT variant - so a sku-level rate on a
  //   PARENT price group is never consulted however precisely it matches. This rate exists to
  //   be skipped, and carries the graph's largest amount so a leak is obvious.
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

  // CFML parity [model/service/PriceGroupService.cfc:L102-L137, L140-L181]: A STRUCTURAL
  // REDUNDANCY. Levels 3, 4 and 5 of the SKU cascade are unreachable: level 2 delegates to
  // getRateForProductBasedOnPriceGroup, whose body already performs the identical product-type step
  // [L116], global loop [L120-L127] and parent PRODUCT recursion [L130-L132]. A consequence of the
  // L174 defect above.
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

  // --- Rates on the global-rate price group ---------------------------------

  // LEGACY-DEFECT [model/entity/PriceGroup.cfc:L83-L90 versus
  //   model/service/PriceGroupService.cfc:L165-L169]: TWO GLOBAL-RATE LOOKUPS BREAK TIES IN
  //   OPPOSITE DIRECTIONS. The entity accessor returns on the first rate whose global flag is
  //   set, so the FIRST wins; the cascade's loop has no `break` and the LAST wins. The two
  //   global rates below have different amounts, so they provably disagree.
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

  // --- The rate on the root price group -------------------------------------

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

  // --- Amount-type exhibits -------------------------------------------------
  //
  // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L316-L340]: ONLY THE `percentageOff`
  //   BRANCH APPLIES THE ROUNDING RULE. The switch at L321 has three cases; the rule is
  //   consulted at L326-L328 inside the first and nowhere else, so `amountOff` [L331-L332] and
  //   `amount` [L333-L335] ignore a rule that is attached. All three rates below carry the SAME
  //   rule, making that checkable. Two locator corrections against the published plan, verified
  //   first-hand: `precisionEvaluate` is at L323 and L331 (the plan publishes L322 and L328) and
  //   `numberFormat` at L339 (the plan publishes L337). L326-L328 rounds through the ENTITY
  //   method [model/entity/RoundingRule.cfc:L66-L68], not the service.
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

  // CFML parity [model/entity/PriceGroupRate.cfc:L87-L93]: the third option is LABELLED
  // `define.fixedAmount` and STORED as `amount`. The stored value is the contract.
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

  // CFML parity [model/entity/PriceGroupRate.cfc:L68]: the far side of a NULLABLE many-to-one,
  // absent. Paired with `percentageOffRateWithRoundingRule`, which carries the same type and the
  // same amount with the rule removed, so rounding is the only variable between the two and L326's
  // `isNull` guard sees both branches.
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

  // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L321-L336]: the amount-type switch has
  //   NO `default:` case, so an unrecognised type selects no branch and the L319 seed -
  //   `arguments.sku.getPrice()`, the UNDISCOUNTED price - falls through to the L339 return.
  // Preserved deliberately; do not fix without a product decision.
  //
  // JUDGMENT CALL: `amountType` is a CLOSED union, since narrowing the raw column happens at the
  // repository boundary. The unrecognised case is therefore modelled the only way it is
  // representable - as an ABSENT amount type, reaching the same defaultless switch - and the raw
  // column string is published as `unrecognisedAmountTypeColumnValue`.
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

  // The only rate carrying all SIX association collections at once, so `getAppliesTo()`
  // [model/entity/PriceGroupRate.cfc:L95-L146] runs its including branch, its excluding branch and
  // its first-comma-only replacement over populated data.
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

  // JUDGMENT CALL: the delete-guard pair is wired one way only, and has to be. The rate's
  // `roundingRule` and the rule's `priceGroupRates` are both constructor-only, so one must be built
  // first, and the INVERSE collection is the side the guard inspects
  // [model/validation/RoundingRule.json:L6] - so the rate is built first without a rule and the
  // rule last holding it.
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
  // `addChildPriceGroup` below. Passing a parent to the constructor would set the child's reference
  // WITHOUT appending to the parent's collection, leaving two sources of truth; the helper sets
  // both sides in one call.

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
      // `hasEligiblePriceGroup()` test [model/service/PromotionService.cfc:L241]. It sits on the
      // primary cascade subject and is empty unless a caller supplies rewards.
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

  // The total-miss subject. No rates at any level and no parent to recurse into, so the cascade
  // runs all five steps and answers NOTHING - the state
  // [model/service/PriceGroupService.cfc:L178-L181] produces by having no `else`.
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

  // CFML parity [model/entity/PriceGroup.cfc:L195-L200, L206-L214]: the stored column is absent, so
  // the accessor rebuilds the path from the live parent chain and memoizes it - the work the
  // `preInsert` and `preUpdate` hooks did, now invoked explicitly. Attached to `rootPriceGroup`
  // below so the rebuilt value has more than one element.
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

  // --- Wiring: parent and child edges ---------------------------------------
  //
  // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L461-L470]: `deletePriceGroup` takes
  //   `getChildPriceGroups()` into a local and loops `while(arrayLen(local) != 0)` calling
  //   `removeChildPriceGroup`, which mutates the ENTITY's collection and not the local. CFML
  //   hands arrays over BY VALUE, so the local is a snapshot that never shrinks: `arrayLen`
  //   stays constant and the loop cannot terminate. TypeScript reference semantics would let it
  //   shrink and would SILENTLY FIX the defect, which is why the port keeps a bounded-iteration
  //   guard. `parentPriceGroup` below carries TWO children so a suite can trip it.
  // Preserved deliberately; do not fix without a product decision.
  //
  // CFML parity [model/service/PriceGroupService.cfc:L466]: the legacy line reads
  // `priceGroup.removeChildPriceGroup(...)` unscoped rather than `arguments.priceGroup`. CFML
  // resolves it to the argument anyway, so it is a hygiene slip.
  //
  // CFML parity [model/entity/PriceGroup.cfc:L63]: `childPriceGroups` declares
  // `singularname="ChildPriceGroup"` CAPITALISED where every sibling uses a lower-case initial, so
  // the helpers are `addChildPriceGroup` / `removeChildPriceGroup` and the port keeps them exactly.
  rootPriceGroup.addChildPriceGroup(parentPriceGroup);
  rootPriceGroup.addChildPriceGroup(unpathedPriceGroup);
  parentPriceGroup.addChildPriceGroup(childPriceGroup);
  parentPriceGroup.addChildPriceGroup(siblingPriceGroup);

  // --- Wiring: rate edges, in the order the loops will read them ------------

  childPriceGroup.addPriceGroupRate(productTypeLevelRate);
  childPriceGroup.addPriceGroupRate(productLevelRate);
  childPriceGroup.addPriceGroupRate(skuLevelRateFirstMatch);
  childPriceGroup.addPriceGroupRate(skuLevelRateLastMatch);

  parentPriceGroup.addPriceGroupRate(parentSkuLevelRate);
  parentPriceGroup.addPriceGroupRate(parentProductLevelRate);

  rootPriceGroup.addPriceGroupRate(rootGlobalRate);

  globalRatePriceGroup.addPriceGroupRate(globalRateFirstMatch);
  globalRatePriceGroup.addPriceGroupRate(globalRateLastMatch);

  // The amount-type and `getAppliesTo` exhibits live on the sibling, which is not a cascade
  // subject: every one is non-global with empty membership and matches nothing at any level.
  siblingPriceGroup.addPriceGroupRate(percentageOffRateWithRoundingRule);
  siblingPriceGroup.addPriceGroupRate(amountOffRateWithRoundingRule);
  siblingPriceGroup.addPriceGroupRate(fixedAmountRateWithRoundingRule);
  siblingPriceGroup.addPriceGroupRate(percentageOffRateWithoutRoundingRule);
  siblingPriceGroup.addPriceGroupRate(unrecognisedAmountTypeRate);
  siblingPriceGroup.addPriceGroupRate(appliesToIncludingAndExcludingRate);
  siblingPriceGroup.addPriceGroupRate(rateBlockingRoundingRuleDelete);

  // --- Vocabularies, read from the entities that publish them ---------------
  //
  // Read rather than restated, so the graph cannot drift from the component that owns the list.
  // Both accessors return fixed-length tuples, so indexing them is checked rather than asserted.

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

  // Every member below was constructed during THIS call: the two data tables and the reference
  // calculation come from builders that allocate afresh, the vocabularies are fresh tuples, and
  // each entity copied every collection handed to it on the way in.

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
