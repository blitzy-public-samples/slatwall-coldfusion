// ---------------------------------------------------------------------------
// slatwall-ts - PRICE-GROUP / PRICE-GROUP-RATE / ROUNDING-RULE TEST DATA
//
// WHAT THIS FILE IS
// A single deterministic factory returning one fully-formed object graph of
// `SwPriceGroup`, `SwPriceGroupRate` and `SwRoundingRule` entities, plus the
// two verified data tables the rounding algorithm is pinned against. It is
// consumed by explicit per-suite named imports from the price-group and
// rounding-rule suites; nothing here asserts anything, and nothing here is
// registered as a global.
//
// IT IS THE ROOT OF THE FIXTURE DEPENDENCY GRAPH, and that is a hard
// constraint rather than a preference. The rounding-rule and price-group
// leaves are what the sku, product, promotion and order-view fixtures build
// on, so this module imports NO sibling fixture. Doing so would close a cycle
// in a graph that is acyclic by construction.
//
// WHY IT DOES NOT CONSTRUCT SKUS, PRODUCTS OR PRODUCT TYPES
// The three membership collections a price-group rate carries - `skus`,
// `products`, `productTypes` [model/entity/PriceGroupRate.cfc:L71-L73] - are
// typed here through `import type` ONLY, and are populated exclusively through
// the single `overrides` parameter. A suite that needs the cascade to match
// brings its own catalog entities from the sibling fixtures and hands them in.
// Every collection defaults to `[]`, which is the state a repository that did
// not fetch the join must present.
//
// THE LEGACY REFERENCE PATTERN, AND WHAT IS DELIBERATELY DROPPED
// [meta/tests/unit/Helper.cfc] is the only fixture-construction artefact in
// the legacy tree, 77 lines shaped as build -> save -> flush. Its SHAPE is
// carried over: one named function, a small literal data bag with documented
// defaults, one fully-formed subject returned, disposable by dropping the
// reference. Its MECHANISM is dropped entirely, because there is no ORM here:
// the framework entity-construction call, the session flush, the delete
// helper, the null cast and the ambient request-scope service lookup all go
// away. This factory touches no database, no connection pool, no network and
// no filesystem, and there is deliberately no teardown export - a suite that
// wants teardown symmetry uses the runner's own per-test hook.
//
// The harness at [meta/tests/unit/SlatwallUnitTestBase.cfc:L49-L79] is the
// ANTI-PATTERN this file is the opposite of: it instantiates the real
// application object (L52), injects a Helper component (L55), starts the ORM
// and the dependency-injection container before every single test (L60),
// elevates the current account to superuser (L62), and never tears any of it
// down (L70, commented out). There is no application start-up here, no
// container, no service locator, no ambient scope and no privilege elevation -
// only plain constructed objects.
//
// CFML parity note [meta/tests/unit/Helper.cfc:L53]: the legacy helper assigns
// `productData` with no `var`, leaking it into component `variables` scope.
// That is a harness hygiene defect, not one of the preserved business-logic
// defects; it is deliberately NOT reproduced here. Every local below is
// `const`-scoped inside the factory.
//
// NO USER RULES GOVERN THIS FILE. The project's rules source reports that no
// user rules were provided, so there is no rule-mandated content here and none
// is invented. The standard applied in their place is enterprise best practice
// as the transformation plan states it: maximal strictness, the layer
// boundary, the fixed dependency set, `Money` as the sole arithmetic surface,
// environment-driven configuration with no credential of any kind, one
// exported unit per file with no barrel, and in-code annotation of every
// judgment call and every preserved defect.
//
// ANNOTATION LEGEND, used verbatim throughout:
//   `// LEGACY-DEFECT [<path>:<locator>]: ...` followed by
//   `// Preserved deliberately; do not fix without a product decision.`
//     - data that exists ONLY because a legacy defect is being preserved.
//   `// CFML parity [<path>:<locator>]: ...`
//     - a semantic-fidelity note about the source.
//   `// JUDGMENT CALL: ...`
//     - a design decision taken here, with its justification.
//
// WHAT THIS FILE NEVER CONTAINS
// No suite declaration and no assertion of any kind - this folder holds data
// factories and the assertions live in the unit and integration tiers. No
// mocking library: the one collaborator double below is hand-written, exactly
// as the legacy suite managed without one. No environment read, no credential,
// no driver import, no query. No clock read: every timestamp is an explicit
// UTC ISO-8601 literal, because the runner pins the process timezone to UTC
// and a relative date would make an assertion depend on the day it ran.
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

// ---------------------------------------------------------------------------
// Structurally derived types
//
// JUDGMENT CALL: two types this graph needs are declared in modules that are
// NOT among this fixture's declared dependencies, so they are DERIVED from the
// entity surfaces already in scope rather than imported. That keeps the import
// set exactly the whitelist and still keeps the types exact - a change to
// either upstream declaration breaks the compile here, which is the point.
// ---------------------------------------------------------------------------

/** Element type of any array or readonly array. */
type ElementOf<TArray> = TArray extends readonly (infer TElement)[] ? TElement : never;

/**
 * The `activeFlag` operand `PriceGroup` accepts.
 *
 * Derived from the constructor rather than imported from the CFML truthiness
 * helper, which this fixture does not depend on. The column declares no
 * `default=` at all [model/entity/PriceGroup.cfc:L54], which is why the
 * accepted operand is deliberately wide.
 */
type PriceGroupActiveFlag = ConstructorParameters<typeof PriceGroup>[0]['activeFlag'];

/**
 * The promotion-reward entity, as seen through `PriceGroup`.
 *
 * `promotionRewards` is the many-to-many through `SwPromoRewardEligiblePriceGrp`
 * [model/entity/PriceGroup.cfc:L70] - the ORM backing for the eligibility test
 * at [model/service/PromotionService.cfc:L241]. Its entity module is not a
 * dependency of this fixture, so the type is read off the accessor.
 */
type PromotionRewardRef = ElementOf<ReturnType<PriceGroup['getPromotionRewards']>>;

// ---------------------------------------------------------------------------
// The collaborator double
// ---------------------------------------------------------------------------

/** One recorded delegation from `RoundingRule.roundValue`. */
type RecordedRoundValueCall = {
  readonly value: Money;
  readonly rule: RoundingRule;
};

/**
 * A hand-written in-memory stand-in for the collaborator every `RoundingRule`
 * delegates to.
 *
 * CFML parity [model/entity/RoundingRule.cfc:L66-L68]: `roundValue` is an
 * ENTITY method whose whole body is a service-locator lookup -
 * `getService("roundingRuleService").roundValueByRoundingRule(value=...,
 * roundingRule=this)`. The port replaces that lookup with a constructor-injected
 * collaborator, so every `RoundingRule` this factory builds needs one supplied.
 *
 * The method signature mirrors [model/service/RoundingRuleService.cfc:L84-L86]
 * with `any value` narrowed to `Money` and `any roundingRule` narrowed to
 * `RoundingRule`, which is exactly the shape the entity module declares for its
 * second constructor parameter. That interface carries no `export` and says so
 * in terms, so this shape is reproduced here and structural typing does the
 * rest - nothing is re-exported and nothing is imported to get it.
 *
 * NO MOCKING LIBRARY, and none may be added: the dependency set is fixed, and a
 * double that answers a scripted value and records its arguments is the entire
 * requirement. Writing it by hand also keeps `calls` strongly typed, so a suite
 * reading a recorded `rule` is checked by the compiler.
 *
 * JUDGMENT CALL: the scripted answer is a value deliberately unrelated to any
 * input (see `roundValueAnswer` on the overrides). An identity double would be
 * indistinguishable from "no rounding applied", and telling those two apart is
 * precisely what the suites covering the rounding-rule asymmetry need.
 */
interface RecordingValueRounder {
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money;

  /** Every delegation so far, in call order. */
  readonly calls: readonly RecordedRoundValueCall[];
}

// ---------------------------------------------------------------------------
// The two verified data tables
// ---------------------------------------------------------------------------

/**
 * One row of the rounding-expression acceptance table.
 *
 * The predicate under test is [model/entity/RoundingRule.cfc:L78-L86], applied
 * per comma-list element: `(len(v) - find(".", v)) != 2 || !isNumeric(v)`
 * rejects. CFML's `find` answers a 1-based position or 0 when the substring is
 * absent, and that absent-value 0 is the whole mechanism behind the accepting
 * row that should not accept.
 *
 * CFML parity [model/validation/RoundingRule.json:L4] - A PUBLISHED FINDING
 * CORRECTED: the transformation plan records "no expression validation" for
 * `roundingRuleExpression`. That premise is wrong, and the correction is
 * recorded here so the discrepancy is auditable rather than silently resolved.
 * The line reads
 * `[{"contexts":"save","required":true,"method":"hasExpressionWithListOfNumericValuesOnly"}]`,
 * so the expression IS validated on the `save` context by the entity's own
 * predicate. The plan's CONCLUSION nevertheless survives, by a different route:
 * the predicate has a hole, and the hole is the `'99'` row below.
 */
type RoundingExpressionCase = {
  /** The raw `SwRoundingRule.roundingRuleExpression` column value. */
  readonly expression: string;

  /**
   * What `hasExpressionWithListOfNumericValuesOnly()` answers. Every value here
   * was measured against the ported predicate, not reasoned about.
   */
  readonly accepted: boolean;

  /**
   * `10 ^ (len(element) - 3)` for each comma-list element, as decimal numerals.
   *
   * This is the step increment the algorithm adds to or subtracts from the
   * two-decimal input [model/service/RoundingRuleService.cfc:L95, L101, L108].
   * A FRACTIONAL value here means the increment is smaller than one cent, which
   * is the defect the accepting-but-fractional row exposes.
   */
  readonly derivedPowerPerElement: readonly DecimalString[];
};

/**
 * One measured `roundValue` outcome.
 *
 * Every field is a decimal STRING. That is not a stylistic choice: several rows
 * exist precisely because a trailing zero changes the answer, and a numeric
 * literal would destroy the property under test before the algorithm ever saw
 * it. The algorithm is decimal-STRING manipulation - it measures `len()` of an
 * intermediate and slices a prefix off it - not numeric rounding.
 */
type RoundValueCase = {
  /** The value handed in, as the caller's own numeral. */
  readonly input: DecimalString;

  /**
   * The rounding expression. A plain `string`, never a branded numeral: the
   * comma-list form `'.95,.99'` is not a decimal numeral at all, and neither is
   * the leading-dot form the legacy data uses.
   */
  readonly roundingExpression: string;

  /** One of the three directions the entity publishes. */
  readonly roundingDirection: RoundingRuleDirection;

  /** The measured result. */
  readonly expected: DecimalString;
};

/**
 * The migration's reference calculation, as decimal numerals.
 *
 * Reproduced here so a price-group suite can drive it off the same numbers the
 * arithmetic substrate is pinned against, with no floating-point step anywhere
 * in the chain. `quantity` is a COUNT and is deliberately a plain `number`;
 * everything else is a numeral destined for `Money`.
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

// ---------------------------------------------------------------------------
// The single optional parameter
// ---------------------------------------------------------------------------

/**
 * Every axis of variation this factory offers, and the only one.
 *
 * There is no second exported builder, no exported mutable literal and no
 * setter: a suite that needs a different graph passes a different object here.
 * Every member is optional and every default is documented on the member.
 *
 * NOTE THE DELIBERATE ASYMMETRY WITH THE GRAPH TYPE BELOW. This is an options
 * bag, so its members are optional AND admit an explicit `undefined` - under
 * `exactOptionalPropertyTypes` those are different types, and a caller
 * spreading a partial object must be able to write either. The graph's own
 * nullable members are the opposite: they are REQUIRED slots typed
 * `T | undefined`, because "the repository looked and found nothing" is a state
 * that must be stated rather than omitted.
 */
interface PriceGroupFixtureOverrides {
  /**
   * Prefix for every generated primary key. Default `'pgfx'`.
   *
   * Identifiers are derived from this argument alone - there is no counter, no
   * sequence and no registry anywhere in this module - so two calls with
   * different prefixes yield two graphs with disjoint keys, and two calls with
   * the same prefix yield the same keys on genuinely separate instances.
   */
  readonly idPrefix?: string | undefined;

  /**
   * `activeFlag` for every price group in the graph. Default `undefined`.
   *
   * CFML parity [model/entity/PriceGroup.cfc:L54]: the column declares NO
   * `default=`, so `undefined` is the honest unset state and `getActiveFlag()`
   * resolves it to `false` - the same answer the legacy engine gave a flag it
   * had no value for. `true` is deliberately NOT invented as a default. Nothing
   * in the resolution cascade consults the flag; its only legacy consumer is the
   * `pg.activeFlag = :activeFlag` filter at
   * [model/dao/PriceGroupDAO.cfc:L93-L95], so a suite that needs an active group
   * passes `true` here.
   */
  readonly activeFlag?: PriceGroupActiveFlag;

  /**
   * Membership for BOTH sku-level rates on the child price group. Default `[]`.
   *
   * Both rates receive the same members on purpose - that is what makes
   * last-match-wins observable.
   */
  readonly skuLevelRateSkus?: readonly Sku[] | undefined;

  /** Membership for the product-level rate on the child price group. Default `[]`. */
  readonly productLevelRateProducts?: readonly Product[] | undefined;

  /** Membership for the product-type-level rate on the child price group. Default `[]`. */
  readonly productTypeLevelRateProductTypes?: readonly ProductType[] | undefined;

  /**
   * Membership for the sku-level rate on the PARENT price group. Default `[]`.
   *
   * Separate from `skuLevelRateSkus` because the two must be set independently:
   * proving that a parent's sku-level rate is never consulted requires the child
   * to hold no matching sku rate while the parent does.
   */
  readonly parentSkuLevelRateSkus?: readonly Sku[] | undefined;

  /**
   * Membership for the product-level rate on the PARENT price group. Default `[]`.
   *
   * The contrast case for the one above: the parent's PRODUCT rate is the rate
   * the recursion does reach.
   */
  readonly parentProductLevelRateProducts?: readonly Product[] | undefined;

  /** Exclusions for the rates that carry them. Default `[]`. */
  readonly excludedSkus?: readonly Sku[] | undefined;

  /** Exclusions for the rates that carry them. Default `[]`. */
  readonly excludedProducts?: readonly Product[] | undefined;

  /** Exclusions for the rates that carry them. Default `[]`. */
  readonly excludedProductTypes?: readonly ProductType[] | undefined;

  /**
   * Eligible-reward membership for the child price group. Default `[]`.
   *
   * The inverse side of the many-to-many at
   * [model/entity/PriceGroup.cfc:L70].
   */
  readonly promotionRewards?: readonly PromotionRewardRef[] | undefined;

  /**
   * The numeral the collaborator double answers with. Default `'77.77'`.
   *
   * Deliberately unrelated to any input the double will be handed, so that "the
   * rounding rule was applied" and "the rounding rule was skipped" are
   * distinguishable outcomes rather than a coincidence.
   */
  readonly roundValueAnswer?: string | undefined;
}

// ---------------------------------------------------------------------------
// The returned graph
// ---------------------------------------------------------------------------

/**
 * One complete, independent price-group graph.
 *
 * Member names say which cascade level or which preserved defect each artefact
 * exercises, so a suite reads as a statement about behaviour rather than as a
 * lookup into anonymous data.
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
   * CFML parity [model/validation/RoundingRule.json:L6]: `priceGroupRates`
   * carries `{"contexts":"delete","maxCollection":0}`, so a rule with any rate
   * attached cannot be deleted. This is the exhibit for that guard; every other
   * rounding rule in the graph carries `[]`, which makes the guard vacuous.
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

  /**
   * The direction string carried by `outOfVocabularyDirectionRoundingRule`.
   *
   * Exposed as data so a suite can assert against it without restating it.
   */
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
   * A raw out-of-vocabulary `SwPriceGroupRate.amountType` column value.
   *
   * Data, not an entity: see the marker on the unrecognised-amount-type rate for
   * why the entity cannot hold this string and why the column can.
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
   * The `priceGroupIDPath` values stored on the three chained groups, keyed by
   * the member they belong to.
   *
   * Built by the domain's own path builder, so they are root-first,
   * comma-delimited, self-last and never empty by construction.
   */
  readonly priceGroupIDPaths: {
    readonly root: string;
    readonly parent: string;
    readonly child: string;
    readonly sibling: string;
  };
}

// ---------------------------------------------------------------------------
// Module-scope constants
//
// EVERY ONE IS AN IMMUTABLE PRIMITIVE. There is no counter, no sequence, no
// registry, no memo and no shared object or array anywhere at module scope, so
// nothing here can carry state from one factory call to the next - which is the
// same discipline the port applies to the four legacy component-level caches
// that become request-scoped. Sharing a string or a number between graphs
// cannot couple them; sharing an object could, so no object is shared.
// ---------------------------------------------------------------------------

const DEFAULT_ID_PREFIX = 'pgfx';

/** See `roundValueAnswer` on the overrides for why this is unrelated to any input. */
const DEFAULT_ROUND_VALUE_ANSWER = '77.77';

const OUT_OF_VOCABULARY_ROUNDING_DIRECTION = 'Sideways';

const UNRECOGNISED_AMOUNT_TYPE_COLUMN_VALUE = 'flatRate';

// Explicit UTC instants. Never a clock read: `new Date()` with no argument or a
// relative offset would make an assertion depend on the day it ran, and the
// runner pins the process timezone to UTC precisely so dates are deterministic.
const CREATED_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';
const MODIFIED_DATE_TIME_UTC = '2024-06-15T12:30:00.000Z';

// Rate amounts, as decimal numerals destined for `Money`. Each is distinct so
// that "which rate won" is answerable from the amount alone.
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
// Module-scope pure builders
//
// Functions, never data. Each returns a FRESHLY constructed value on every
// call, so no array and no object is ever shared between two graphs.
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
 * Builds the recording collaborator double.
 *
 * The recording array is created here, inside the call, so it belongs to exactly
 * one graph. Two graphs never observe each other's calls.
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
 * The nine acceptance rows, every verdict measured against the ported predicate.
 *
 * The predicate is `(len(v) - find(".", v)) != 2 || !isNumeric(v)` per element
 * [model/entity/RoundingRule.cfc:L81], and CFML's `find` answers 0 when the
 * substring is absent.
 *
 * LEGACY-DEFECT [model/entity/RoundingRule.cfc:L78-L86]: the predicate accepts a
 *   bare `'99'`, because `find(".", "99")` is 0 and `len("99") - 0` is 2 - the
 *   same arithmetic a well-formed `'.99'` produces. The expression then yields a
 *   FRACTIONAL step of `10 ^ (2 - 3)`, so the algorithm walks the value in tenths
 *   of a cent instead of whole units, and no validation rejects it.
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

    // ⚠️ THE HOLE. Accepted, no decimal point, and a fractional derived step.
    { expression: '99', accepted: true, derivedPowerPerElement: [toDecimalString('0.1')] },
  ];
}

/**
 * The ten measured `roundValue` outcomes.
 *
 * Every one was produced by running the ported algorithm, not derived by
 * reasoning about what rounding ought to do. A "corrected" implementation that
 * returns mathematically tidier answers fails against this table, and that is
 * the point: [model/service/RoundingRuleService.cfc:L88-L175] is decimal-string
 * manipulation, and its observable behaviour is the contract.
 *
 * LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L101-L102, L108-L109]: the
 *   intermediate is computed arithmetically and then `len()`-ed. CFML drops
 *   trailing zeros when stringifying a number, so any value whose cents end in
 *   zero takes a corrupted branch - `'12.30'` with `'.99'` yields `12.99` rather
 *   than the `11.99` the same expression yields for `'12.3456'`. This is why the
 *   `'12.30'` and `'2.30'` rows below are STRINGS: a numeric literal would drop
 *   the trailing zero before the algorithm ever measured it, and the row would
 *   silently stop testing anything.
 * Preserved deliberately; do not fix without a product decision.
 *
 * LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L88]: `roundValue` declares
 *   `roundingExpression="0.00"` as its default, which reads as inert and is not -
 *   it turns `12.3456` into `10.00`. Any caller that omits the argument, and any
 *   rounding rule whose expression column is null, silently reshapes the price.
 * Preserved deliberately; do not fix without a product decision.
 *
 * LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L115-L118]: when the input
 *   is no longer than the expression, BOTH candidates are set to the expression
 *   itself, so `7.42` under `'9.99'` becomes `9.99` and `2.30` under `'0.99'`
 *   becomes `0.99`. The `0.42` row reaches a third branch, where the lower
 *   intermediate is negative and the candidate string is signed.
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
      // Both accumulators survive across comma-list elements, so the best
      // candidate across BOTH expressions wins rather than the best within the
      // last one [model/service/RoundingRuleService.cfc:L90-L93].
      input: toDecimalString('12.3456'),
      roundingExpression: '.95,.99',
      roundingDirection: 'Closest',
      expected: toDecimalString('11.99'),
    },
    {
      // The trailing-zero branch. Same expression as the second row, opposite
      // outcome, and the difference is a character rather than a quantity.
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
      // The signature default, written out. A 19 per cent reduction from a value
      // no caller asked to round.
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
 * Hydrates one `SwRoundingRule` row.
 *
 * `priceGroupRates` is the INVERSE side of the one-to-many at
 * [model/entity/RoundingRule.cfc:L64] and arrives already materialized - there is
 * no lazy loading to simulate, because associations are materialized at the
 * repository boundary. Every collection is copied on the way in, so a caller's
 * array can never become this entity's live collection.
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
   * CFML parity [model/entity/PriceGroupRate.cfc:L53]: the column declares
   * `default="false"`, so unlike `PriceGroup.activeFlag` this one has a real
   * default and every rate below states it explicitly.
   */
  readonly globalFlag: boolean;

  /**
   * CFML parity [model/entity/PriceGroupRate.cfc:L54]: a `big_decimal` column with
   * NO default, so the value is a decimal NUMERAL fed to `Money`. Never a
   * `number`: there is no `Money` factory that takes one, deliberately.
   */
  readonly amount: string;

  /**
   * CFML parity [model/entity/PriceGroupRate.cfc:L55]: an unconstrained
   * `ormType="string"` column, narrowed to the closed vocabulary at the repository
   * boundary. `undefined` is the in-type inhabitant that reaches the dispatch's
   * missing default branch - see the marker on the unrecognised-amount-type rate.
   */
  readonly amountType: PriceGroupRateAmountType | undefined;

  /**
   * CFML parity [model/entity/PriceGroupRate.cfc:L68]: a NULLABLE many-to-one,
   * declared with `hb_optionsNullRBKey="define.none"`. Required slot, `undefined`
   * permitted - never an optional key, because "no rounding rule" is a state to
   * state rather than one to omit.
   */
  readonly roundingRule: RoundingRule | undefined;

  readonly productTypes: readonly ProductType[];
  readonly products: readonly Product[];
  readonly skus: readonly Sku[];

  /**
   * LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L75-L77]: `excludedProductTypes`,
   *   `excludedProducts` and `excludedSkus` are persisted through three link tables
   *   and the resolution cascade NEVER consults any of them - not at the sku level
   *   [model/service/PriceGroupService.cfc:L146-L150], not at the product level
   *   [model/service/PriceGroupService.cfc:L108-L112] and not at the product-type
   *   level [model/service/PriceGroupService.cfc:L63-L78]. A sku listed as excluded
   *   is still selected. The collections are retained so the schema contract is
   *   unbroken and so a suite can prove the gap.
   * Preserved deliberately; do not fix without a product decision.
   */
  readonly excludedProductTypes: readonly ProductType[];
  readonly excludedProducts: readonly Product[];
  readonly excludedSkus: readonly Sku[];
};

/**
 * Hydrates one `SwPriceGroupRate` row.
 *
 * `priceGroup` is left `undefined` here and wired afterwards through the entity's
 * own bidirectional helper, which is what keeps both sides of the association in
 * agreement. Every collection is copied, so no caller array becomes a live
 * collection - the exact hazard CFML did not have, because
 * [model/service/PriceGroupService.cfc:L276] takes an array BY VALUE and then
 * appends to it at [model/service/PriceGroupService.cfc:L282] without touching the
 * account's own collection, whereas a shared reference here WOULD touch it.
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
 * `childPriceGroups` and `priceGroupRates` start EMPTY and are filled afterwards
 * through `addChildPriceGroup` and `addPriceGroupRate`. Two reasons, both
 * substantive. First, those helpers are what maintain the far side - the child's
 * `parentPriceGroup` and the rate's `priceGroup` - so a graph built through them
 * cannot have the two directions disagree. Second, they append in call order, and
 * collection ORDER decides which rate wins in two separate legacy loops, so the
 * order a suite reads in the fixture is the order the algorithm sees.
 *
 * `parentPriceGroupOptionCandidates` is deliberately omitted: the accessor is
 * total and defaults to an empty option list, which is the same answer the legacy
 * framework smart list gave when it matched nothing
 * [model/entity/PriceGroup.cfc:L94-L103].
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
 * JUDGMENT CALL: the stored `priceGroupIDPath` column values are computed from a
 * plain `{ priceGroupID, parent }` chain rather than from the entities
 * themselves. The entity exposes no path setter - and correctly so, since a
 * public setter would let a caller write an arbitrary string into a column that
 * decides which rate wins - so a PERSISTED path has to exist before the
 * constructor runs, while the entity graph only exists after it. The chain below
 * carries the same identifiers in the same parent order, and it is handed to the
 * domain's OWN path builder, so the strings are the ones the entity would have
 * produced: root-first, comma-delimited, self-last, including self, never empty,
 * and with no cycle guard.
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

// ---------------------------------------------------------------------------
// THE SINGLE EXPORT
// ---------------------------------------------------------------------------

/**
 * Builds one complete, independent price-group / price-group-rate /
 * rounding-rule graph, together with the two verified data tables the rounding
 * algorithm is pinned against.
 *
 * A FRESH GRAPH ON EVERY CALL, with no exception. Every entity, every collection
 * and every `Date` below is constructed inside this call, so two calls hand back
 * two graphs that share no mutable object at all - not a rate, not a collection,
 * not a recorded call list. That is what lets a suite prove that a second
 * independent invocation does not observe the first invocation's memo, which is
 * the property the port needs because a warm container keeps module state alive
 * between unrelated requests.
 *
 * WHAT THE GRAPH IS SHAPED TO EXPOSE. Every item is reachable from the returned
 * members and every one carries its marker at the point it is built:
 *
 *   * The five-level resolution cascade [model/service/PriceGroupService.cfc:L140-L181],
 *     through a three-deep parent chain plus a group that isolates the global level.
 *   * Last-match-wins in the sku loop and in the global loop, neither of which
 *     contains a `break`.
 *   * The two global-rate lookups with OPPOSITE tie-breaking.
 *   * The parent recursion that consults the product variant rather than the sku
 *     variant, so a parent's sku-level rate is unreachable.
 *   * The snapshot loop in `deletePriceGroup`, through a child collection with two
 *     members.
 *   * The amount-type dispatch in which only one branch rounds, plus a fourth
 *     amount type the dispatch does not recognise.
 *   * A rate with a rounding rule and a rate without one.
 *   * A total miss, which resolves to nothing rather than to a zero-amount rate.
 *   * Exclusion collections that are persisted and never consulted.
 *   * The rounding-direction vocabulary plus a direction outside it.
 *   * All nine expression-acceptance rows and all ten measured `roundValue` rows.
 *
 * @param overrides - the only axis of variation. Omit it entirely for the
 *   documented defaults; every membership collection then defaults to empty,
 *   which is the state a repository that did not fetch the join must present.
 * @returns one fully-formed graph, disposable by dropping the reference. There is
 *   deliberately no teardown counterpart: nothing was acquired.
 */
export function makePriceGroupFixtures(
  overrides?: PriceGroupFixtureOverrides,
): PriceGroupFixtureGraph {
  // --- Resolved inputs ------------------------------------------------------
  //
  // `??` and not `||`: an empty prefix and a `false` flag are legitimate values a
  // caller may want, and truthiness would silently replace both.

  const idPrefix = overrides?.idPrefix ?? DEFAULT_ID_PREFIX;

  // No `??` here at all. An absent key and an explicit `undefined` both mean the
  // undefaulted column, and an explicit `false` must survive as `false`.
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

  // --- Identifiers ----------------------------------------------------------
  //
  // Derived from this call's own argument and nothing else. Every one is a
  // non-empty string, so `isNew()` reports `false` on every entity here and the
  // bidirectional helpers take their duplicate-guarded branch rather than their
  // unconditional-append branch.

  const rootPriceGroupID = `${idPrefix}-pricegroup-root`;
  const parentPriceGroupID = `${idPrefix}-pricegroup-parent`;
  const childPriceGroupID = `${idPrefix}-pricegroup-child`;
  const siblingPriceGroupID = `${idPrefix}-pricegroup-sibling`;
  const globalRatePriceGroupID = `${idPrefix}-pricegroup-globalrates`;
  const isolatedPriceGroupID = `${idPrefix}-pricegroup-isolated`;
  const unpathedPriceGroupID = `${idPrefix}-pricegroup-unpathed`;

  // --- Materialized paths ---------------------------------------------------
  //
  // Produced by the domain's own builder over the identifier chain; see the
  // judgment call recorded on `IdPathNode`. The three chained groups yield
  // one, two and three elements respectively, which is what makes "root-first,
  // self-last, includes self, never empty" checkable from the outside.

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

  // --- Rounding rules -------------------------------------------------------
  //
  // CFML parity [model/entity/RoundingRule.cfc:L70-L76]: the direction vocabulary
  // is published by the ENTITY as an advisory admin option list, and nothing
  // narrows the column to it.

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
  //   roundingRuleDirection is a required but UNCONSTRAINED string - no enumeration is
  //   enforced by the column, by the form-field metadata or by the validation schema -
  //   so an out-of-vocabulary direction reaches the rounding switch's missing default
  //   branch [model/service/RoundingRuleService.cfc:L132-L166] and no candidate is ever
  //   selected, leaving the two-decimal input to fall out of the tail at L173.
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

  // LEGACY-DEFECT [model/service/RoundingRuleService.cfc:L88]: '0.00' is the declared
  //   default for `roundingExpression` and reads as inert, but it reshapes the value -
  //   12.3456 becomes 10.00. This rule states it explicitly; the next one omits the
  //   column entirely so CFML's declared-default substitution is what supplies it.
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

  // CFML parity [model/entity/RoundingRule.cfc:L54]: the accessor reports the column
  // truthfully as absent rather than collapsing it to '', because collapsing it would
  // SUPPRESS the declared default at [model/service/RoundingRuleService.cfc:L88] and
  // silently change the arithmetic. The decision belongs to the service.
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

  // --- Rates on the child price group, in deliberate collection order -------
  //
  // Collection order is data, not presentation. The sku loop
  // [model/service/PriceGroupService.cfc:L146-L150] walks the WHOLE collection, so
  // the order these four are appended in is the order the algorithm sees.

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

  // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L146-L150]: the sku-level loop
  //   contains NO `break` and NO early return, so it keeps assigning `returnRate` for
  //   every matching rate and the LAST match in collection order wins. The two rates
  //   below share their membership and differ in `amount`, which is what makes the
  //   winner observable - a single-rate collection cannot expose this at all.
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
  //   getRateForProductBasedOnPriceGroup - the PRODUCT variant - rather than the sku
  //   variant, so a sku-level rate that sits on a PARENT price group is never consulted
  //   no matter how precisely it matches. This rate exists to be skipped, and it carries
  //   the graph's largest amount so that a suite reading the resolved rate can tell
  //   instantly whether it leaked in.
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
  // REDUNDANCY WORTH STATING, discovered by reading the two variants side by side. Levels
  // 3, 4 and 5 of the SKU cascade are unreachable in practice. Level 2 delegates to
  // getRateForProductBasedOnPriceGroup, and THAT body already performs the identical
  // product-type step [L116], the identical global loop [L120-L127] and the identical
  // parent PRODUCT recursion [L130-L132] over the same price group - so if level 2 answers
  // nothing, levels 3, 4 and 5 necessarily answer nothing either. This is a consequence of
  // the L174 defect above rather than a separate one. Per-level data is still supplied, so
  // the equivalent steps inside the product variant are exercised and the redundancy is
  // provable rather than asserted.
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
  //   model/service/PriceGroupService.cfc:L165-L169]: THERE ARE TWO GLOBAL-RATE LOOKUPS
  //   AND THEY BREAK TIES IN OPPOSITE DIRECTIONS. The entity accessor returns as soon as
  //   it finds a rate whose global flag is set, so the FIRST one wins. The cascade's own
  //   loop has no `break`, so it runs to the end of the collection and the LAST one wins.
  //   Given the two rates below - both global, with different amounts - the two lookups
  //   provably disagree, and which one a caller happened to use decides the price.
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
  // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L316-L340]: ONLY THE
  //   `percentageOff` BRANCH APPLIES THE ROUNDING RULE. The switch at L321 has three
  //   cases; the rounding rule is consulted at L326-L328 inside the first one and
  //   nowhere else, so `amountOff` [L331-L332] and `amount` [L333-L335] silently ignore
  //   a rounding rule that is attached and configured. All three rates below carry the
  //   SAME rounding rule, which is what turns "two of these ignore it" into a checkable
  //   claim rather than an absence.
  //
  //   Two locator corrections against the published plan, both verified first-hand: the
  //   `precisionEvaluate` sites are at L323 and L331 (the plan publishes L322 and L328),
  //   and `numberFormat` is at L339 (the plan publishes L337).
  //
  //   Note also that L326-L328 rounds through the ENTITY method
  //   [model/entity/RoundingRule.cfc:L66-L68], not through the service, which is exactly
  //   the service-locator-inside-an-entity path the injected double stands in for.
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
  // `define.fixedAmount` and STORED as `amount`. The stored value is the contract, so it
  // is the stored value that appears here; the label is admin display text.
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

  // CFML parity [model/entity/PriceGroupRate.cfc:L68]: the far side of a NULLABLE
  // many-to-one, absent. Paired with `percentageOffRateWithRoundingRule` - same amount
  // type, same amount, rounding rule removed - so the rounding step is the only variable
  // between the two and L326's `isNull` guard is exercised on both branches.
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

  // LEGACY-DEFECT [model/service/PriceGroupService.cfc:L321-L336]: the amount-type switch
  //   has NO `default:` case, so an amount type it does not recognise selects no branch at
  //   all and the seed assigned at L319 - `arguments.sku.getPrice()`, the UNDISCOUNTED
  //   price - falls straight through to the L339 return. A rate can therefore be saved,
  //   resolved by the cascade and applied to an order item while discounting nothing.
  // Preserved deliberately; do not fix without a product decision.
  //
  // JUDGMENT CALL: the entity's `amountType` is a CLOSED union, because narrowing the raw
  // column happens at the repository boundary by design. The unrecognised case is
  // therefore modelled the only way it is representable in-type - as an ABSENT amount
  // type, which reaches the same defaultless switch by the same route - and the raw
  // out-of-vocabulary column string is published separately as
  // `unrecognisedAmountTypeColumnValue` so a suite can drive the boundary narrowing with
  // it. A cast would have been the alternative and is not available: `any` and assertions
  // are both out, and rightly, since a cast would assert a state the type forbids.
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

  // The only rate in the graph carrying all SIX association collections at once, so
  // `getAppliesTo()` [model/entity/PriceGroupRate.cfc:L95-L146] runs its including branch,
  // its excluding branch and its first-comma-only replacement over populated data - and so
  // the three exclusion collections that nothing ever consults are demonstrably persisted.
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

  // --- The delete-guard exhibit ---------------------------------------------
  //
  // JUDGMENT CALL: this pair is wired one way only, and it has to be. The rate's
  // `roundingRule` and the rule's `priceGroupRates` are both constructor-only - the entity
  // publishes no setter for either, correctly, since a public setter on a materialized
  // association would let a caller put the two sides into disagreement. Only one of the
  // two can therefore be built first. The INVERSE collection is the side the guard
  // inspects [model/validation/RoundingRule.json:L6], so the rate is built first with no
  // rounding rule of its own and the rule is built last holding it.
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

  // --- Price groups ---------------------------------------------------------
  //
  // Every group is constructed with `parentPriceGroup: undefined` and then attached
  // through `addChildPriceGroup` below. That is one mechanism rather than two: passing a
  // parent to the constructor would set the child's reference WITHOUT appending to the
  // parent's collection - the constructor assigns, it does not wire - and the graph would
  // hold two sources of truth that could disagree. Wiring through the entity's own helper
  // sets both sides in one call, by construction.

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
      // `SwPromoRewardEligiblePriceGrp` - the ORM backing for the promotion engine's
      // `hasEligiblePriceGroup()` test [model/service/PromotionService.cfc:L241]. It sits
      // on the primary cascade subject because that is the group an order item would carry
      // as its applied price group. Empty unless a caller supplies rewards, which is the
      // honest state when the repository did not fetch the join.
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

  // The total-miss subject. No rates at any level, no parent to recurse into, so the
  // cascade runs every one of its five steps and answers NOTHING - the state
  // [model/service/PriceGroupService.cfc:L178-L181] produces by having no `else`.
  //
  // JUDGMENT CALL: there is deliberately no zero-amount rate standing in for the miss.
  // Substituting one would turn "no rate applies" into "a rate applies and takes nothing
  // off", which is the same class of error as substituting 0 for a missing price - it
  // reads as harmless and it changes what a customer is charged.
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

  // CFML parity [model/entity/PriceGroup.cfc:L195-L200, L206-L214]: the stored column is
  // absent, so the accessor rebuilds the path from the live parent chain and memoizes the
  // result - the same work the `preInsert` and `preUpdate` ORM hooks did, now invoked
  // explicitly. Attached below to `rootPriceGroup`, so the rebuilt value has more than one
  // element and root-first / self-last ordering is observable rather than degenerate.
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
  //   `getChildPriceGroups()` into a local and loops `while(arrayLen(local) != 0)` while
  //   calling `removeChildPriceGroup` - which mutates the ENTITY's collection, not the
  //   local. CFML hands arrays over BY VALUE, so the local is a snapshot that never
  //   shrinks: `arrayLen` stays constant, index 1 is removed forever and the loop cannot
  //   terminate. TypeScript reference semantics would let the array shrink and would
  //   therefore SILENTLY FIX the defect, which is why the port keeps a bounded-iteration
  //   guard instead. `parentPriceGroup` below carries TWO children precisely so a suite can
  //   make that guard trip; a childless group would leave the loop untested.
  // Preserved deliberately; do not fix without a product decision.
  //
  // CFML parity [model/service/PriceGroupService.cfc:L466]: the legacy line reads
  // `priceGroup.removeChildPriceGroup(...)` unscoped rather than `arguments.priceGroup`.
  // CFML resolves it to the argument anyway, so it is a hygiene slip and not a behavioural
  // defect; recorded so a reader of the two sources side by side is not left wondering.
  //
  // CFML parity [model/entity/PriceGroup.cfc:L63]: `childPriceGroups` declares
  // `singularname="ChildPriceGroup"` CAPITALISED, where every sibling collection in the
  // component uses a lower-case initial. The generated helper names are therefore
  // `addChildPriceGroup` / `removeChildPriceGroup`, and the port keeps them exactly -
  // normalising the casing would rename a public method, and interface parity is the
  // acceptance contract.
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
  // subject, so they cannot perturb resolution: every one of them is non-global with empty
  // membership and therefore matches nothing at any level.
  siblingPriceGroup.addPriceGroupRate(percentageOffRateWithRoundingRule);
  siblingPriceGroup.addPriceGroupRate(amountOffRateWithRoundingRule);
  siblingPriceGroup.addPriceGroupRate(fixedAmountRateWithRoundingRule);
  siblingPriceGroup.addPriceGroupRate(percentageOffRateWithoutRoundingRule);
  siblingPriceGroup.addPriceGroupRate(unrecognisedAmountTypeRate);
  siblingPriceGroup.addPriceGroupRate(appliesToIncludingAndExcludingRate);
  siblingPriceGroup.addPriceGroupRate(rateBlockingRoundingRuleDelete);

  // --- Vocabularies, read from the entities that publish them ---------------
  //
  // Read rather than restated, so the graph cannot drift out of agreement with the
  // component that owns the list. Both accessors return fixed-length tuples, so indexing
  // them is checked rather than asserted - no non-null assertion is needed or used.

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

  // --- The graph -------------------------------------------------------------
  //
  // Every member below was constructed during THIS call. The two data tables and the
  // reference calculation come from builders that allocate a new array or object each
  // time, the two vocabularies are fresh tuples, `priceGroupIDPaths` is a fresh object of
  // immutable strings, and each entity copied every collection handed to it on the way in.
  // Nothing is shared with any other graph, so a suite can mutate whatever it reaches
  // without reaching another suite.

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
