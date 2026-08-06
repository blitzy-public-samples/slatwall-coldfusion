// ---------------------------------------------------------------------------
// slatwall-ts - PROMOTION FAMILY TEST DATA
//
// WHAT THIS FILE IS
// A single deterministic factory returning one fully-formed object graph of
// the seven promotion entities - `SwPromotion`, `SwPromotionPeriod`,
// `SwPromotionCode`, `SwPromoQual`, `SwPromoReward`, `SwPromotionApplied` and
// `SwPromotionAccount` - together with the exhibits the promotion engine's
// characterisation suites need. It is consumed by explicit per-suite named
// imports; nothing here asserts anything and nothing here is registered as a
// global.
//
// WHY IT RETURNS A WHOLE FAMILY RATHER THAN ONE ENTITY
// The promotion entities are only meaningful in composition, so a per-entity
// factory would hand back objects that cannot answer the questions the suites
// ask. A reward is meaningless without its period: every reward the engine
// considers is reached as `reward.getPromotionPeriod()` and the whole reward
// body is gated on that period's qualification
// [model/service/PromotionService.cfc:L190-L195]. The period in turn is
// meaningless without its promotion, because `getSimpleRepresentation()`
// dereferences it [model/entity/PromotionPeriod.cfc:L91-L93] and
// `isDeletable()` calls straight through to it
// [model/entity/PromotionPeriod.cfc:L88]. And the promotion's own currency
// predicate is a THREE-LEVEL memoized chain - `Promotion.getCurrentFlag()`
// [model/entity/Promotion.cfc:L83-L92] consults
// `getCurrentPromotionPeriodFlag()` [L95-L107] and
// `getCurrentPromotionCodeFlag()` [L109-L121], which delegate to the period's
// and the code's own memoized `getCurrentFlag()`. One graph, built together,
// is the only shape in which those three levels can be driven at all.
//
// WHERE IT SITS IN THE FIXTURE DEPENDENCY GRAPH
// Module #4 of 5, and the graph is acyclic by construction. It imports only
// EARLIER siblings - `./priceGroupFixtures` for the reward's nullable
// `roundingRule` and its `eligiblePriceGroups`, and `./productFixtures` /
// `./skuFixtures` for the catalog entities the membership collections hold. It
// imports `./orderViewFixtures` NEVER: that module is #5 and the edge would
// close a cycle. It imports `../setup` never either - the runner wires that
// single shared harness itself.
//
// WHAT IT DELIBERATELY DOES NOT SUPPLY
// No order, order item or fulfillment object of any kind. The order aggregate
// is out of scope and this is the anti-corruption boundary, so every reference
// to one is an OPAQUE STRING ID: `PromotionApplied`'s three foreign keys
// [model/entity/PromotionApplied.cfc:L59-L61], `PromotionCode.orders`
// [model/entity/PromotionCode.cfc:L68], `PromotionAccount.account`
// [model/entity/PromotionAccount.cfc:L58] and every `orderItemID` in the usage
// ledger. The order-shaped inputs live in module #5.
//
// THE LEGACY REFERENCE PATTERN, AND WHAT IS DELIBERATELY DROPPED
// [meta/tests/unit/Helper.cfc] is the only fixture-construction artefact in
// the legacy tree, 77 lines shaped as build -> save -> flush. Its SHAPE is
// carried over: one named function, a small literal data bag with documented
// defaults, one fully-formed subject returned, disposable by dropping the
// reference. Its MECHANISM is dropped entirely - the framework
// entity-construction call at [meta/tests/unit/Helper.cfc:L52], the ambient
// request-scope service lookup at [L62], the session flush at [L64], and the
// delete helper with its null cast at [L69-L75] all go away. This factory
// touches no database, no connection pool, no network and no filesystem, and
// there is deliberately NO teardown export: nothing is persisted, so dropping
// the reference IS the teardown, and a suite wanting symmetry uses the
// runner's own per-test hook.
//
// CFML parity [meta/tests/unit/Helper.cfc:L53]: the legacy helper assigned `productData`
// without `var`, leaking it into component scope. That is a defect in the legacy TEST
// HARNESS (not business logic) and is deliberately NOT reproduced — every local here is
// block-scoped.
//
// The harness at [meta/tests/unit/SlatwallUnitTestBase.cfc:L49-L79] is the
// ANTI-PATTERN this file is the opposite of: it instantiates the real
// application object (L52), injects a Helper component (L55), starts the ORM
// and the DI/1 container before every single test (L60), elevates the current
// account to superuser (L62), and tears none of it down (L53 and L70, both
// commented out). Every legacy "unit" test therefore boots the real
// application, which is why the legacy suite is integration-style at every
// level. There is no application start-up here, no container, no service
// locator, no ambient scope and no privilege elevation - only plain
// constructed objects.
//
// TEST TRACEABILITY (C8): NO LEGACY TEST COVERS ANY PROMOTION ENTITY.
// `meta/tests/unit/entity/` holds only `BrandTest.cfc` and `ProductTest.cfc`
// besides the shared base, and `meta/tests/unit/service/` holds only
// AccountService, HibachiService, PaymentService and UtilityRBService - none of
// them in scope. Every suite consuming this module is therefore NET-NEW and
// must be labelled net-new in `tests/traceability/legacyTestMap.ts`. None of it
// may be presented as parity. Regression suites follow the `issue_<ticket#>`
// convention carried over from `meta/tests/unit/IssuesTest.cfc`, including
// `issue_1766` for the preserved return/exchange no-op at
// [model/service/PromotionService.cfc:L542-L544].
//
// NO USER RULES GOVERN THIS FILE. The project's rules source reports that no
// user rules were provided, so there is no rule-mandated content here and none
// is invented; the absence is not licence to lower the bar. The standard
// applied in their place is enterprise best practice as the transformation plan
// states it: maximal strictness, the layer boundary, the fixed 14-package
// dependency set, `Money` as the sole arithmetic surface, environment-driven
// configuration with no credential of any kind, one exported unit per file with
// no barrel, and in-code annotation of every judgment call and every preserved
// defect. License continuity is recorded once in `slatwall-ts/NOTICE-GPL.md`
// and is deliberately not restated here.
//
// ANNOTATION LEGEND, used verbatim throughout:
//   `// LEGACY-DEFECT [<path>:<locator>]: ...` followed by
//   `// Preserved deliberately; do not fix without a product decision.`
//     - data that exists ONLY because a legacy defect is being preserved.
//   `// CFML parity [<path>:<locator>]: ...`
//     - a semantic-fidelity note about the source.
//   `// JUDGMENT CALL: ...`
//     - a design decision taken here, with its justification.
//   `// AAP CORRECTION #n: ...`
//     - a place where the agent action plan and the legacy source disagree and
//       THE SOURCE WINS. Seven of them are recorded in this file.
//
// WHAT THIS FILE NEVER CONTAINS
// No suite declaration and no assertion of any kind - this folder holds data
// factories and the assertions live in the unit tier. No mocking library: the
// three collaborator doubles below are hand-written, exactly as the legacy
// suite managed without one. No environment read, no credential, no driver
// import, no query - the `PromotionDAO` SQL is cited as a behavioural spec and
// is never executed here. No clock read either: every timestamp is an explicit
// UTC ISO-8601 literal and the injected clock is a closure over one, because a
// relative date would make an assertion depend on the day it ran.
// ---------------------------------------------------------------------------

import { Brand } from '../../src/domain/entities/brand.js';
import { Option } from '../../src/domain/entities/option.js';
import { ProductType } from '../../src/domain/entities/productType.js';
import { Promotion } from '../../src/domain/entities/promotion.js';
import { PromotionAccount } from '../../src/domain/entities/promotionAccount.js';
import { PromotionApplied } from '../../src/domain/entities/promotionApplied.js';
import { PromotionCode } from '../../src/domain/entities/promotionCode.js';
import { PromotionPeriod } from '../../src/domain/entities/promotionPeriod.js';
import { PromotionQualifier } from '../../src/domain/entities/promotionQualifier.js';
import { PromotionReward } from '../../src/domain/entities/promotionReward.js';
import { buildIdPathList } from '../../src/domain/valueObjects/materializedIdPath.js';
import { Money } from '../../src/domain/valueObjects/money.js';
import { listToArray } from '../../src/lib/cfml/list.js';
import { makePriceGroupFixtures } from './priceGroupFixtures.js';
import { makeProductFixture } from './productFixtures.js';
import { makeSkuFixture } from './skuFixtures.js';

import type { Product } from '../../src/domain/entities/product.js';
import type { PriceGroup } from '../../src/domain/entities/priceGroup.js';
import type { RoundingRule } from '../../src/domain/entities/roundingRule.js';
import type { Sku } from '../../src/domain/entities/sku.js';
import type { AmountType, ApplicableTerm } from '../../src/domain/entities/promotionReward.js';
import type { PromotionAppliedType } from '../../src/domain/entities/promotionApplied.js';
import type { RewardMatchingType } from '../../src/domain/entities/promotionQualifier.js';
import type {
  OrderItemUsage,
  PromotionRewardUsageDetail,
  PromotionRewardUsageDetails,
  UnlimitedUseSentinel,
} from '../../src/domain/promotionEngine/rewardUsageTypes.js';

// JUDGMENT CALL: `src/lib/cfml/truthiness.ts` and `src/lib/cfml/struct.ts` were
// both read while writing this file - the first for the `isNull()` / `len()`
// absence conventions that decide how a nullable column is modelled here, the
// second for the case-insensitive struct-key semantics behind the ledger's
// keying - but NEITHER IS IMPORTED. A data factory evaluates no CFML predicate:
// every value below is written out explicitly, absence is expressed by omitting
// or by passing `undefined`, and `noUnusedLocals` would reject an import kept
// only to look thorough. `src/lib/cfml/list.ts` IS imported, because the
// pass-one reward-type list genuinely is a CFML comma list and is split with the
// same helper the engine uses.

// ---------------------------------------------------------------------------
// Structurally derived types
//
// JUDGMENT CALL: four types this graph needs are declared in modules that are
// NOT among this fixture's declared dependencies, or are declared module-local
// and un-exported by a module that IS. Every one is DERIVED from a surface
// already in scope rather than imported or restated. That keeps the import set
// exactly the whitelist and still keeps the types exact - a change to any
// upstream declaration breaks the compile here, which is the point.
// ---------------------------------------------------------------------------

/** Element type of any array or readonly array. */
type ElementOf<TArray> = TArray extends readonly (infer TElement)[] ? TElement : never;

/**
 * The `activeFlag` column type `Promotion` accepts.
 *
 * Derived rather than imported from `src/lib/cfml/truthiness.ts`, which is not
 * on this fixture's dependency whitelist.
 */
type PromotionActiveFlagColumn = ConstructorParameters<typeof Promotion>[0]['activeFlag'];

/**
 * The `currencyCode` column type `PromotionApplied` accepts.
 *
 * Derived rather than imported from `src/domain/valueObjects/currencyCode.ts`,
 * which is not on this fixture's dependency whitelist. Deriving it also means
 * this module never needs the branded-type constructor, which matters because
 * the default below is deliberately absent - see the applied-promotion builder.
 */
type PromotionAppliedCurrencyCodeColumn = ConstructorParameters<
  typeof PromotionApplied
>[0]['currencyCode'];

/**
 * The label-provider collaborator `PromotionReward` accepts.
 *
 * `PromotionRewardLabelProvider` is declared module-local and un-exported by
 * `src/domain/entities/promotionReward.ts` on purpose - the port inventory is
 * locked - so the double below is typed by derivation instead of by importing a
 * name that is not published.
 */
type PromotionRewardLabelProviderDouble = NonNullable<
  ConstructorParameters<typeof PromotionReward>[0]['labelProvider']
>;

/**
 * The account-link element type `PromotionCode.accounts` accepts.
 *
 * CFML parity [model/entity/PromotionCode.cfc:L65]: the legacy many-to-many
 * points at the out-of-scope `Account` entity. The target's element contract is
 * the narrow structural shape the entity actually reaches, and it is derived
 * here for the same reason as the label provider: it is un-exported.
 */
type PromotionCodeAccountLinkDouble = ElementOf<
  NonNullable<ConstructorParameters<typeof PromotionCode>[0]['accounts']>
>;

/**
 * The order-link element type `PromotionCode.orders` accepts.
 *
 * CFML parity [model/entity/PromotionCode.cfc:L68]: `orders` is the inverse side
 * of `SwOrderPromotionCode`, declared `lazy="extra"`, and the order aggregate is
 * OUT OF SCOPE. The double below is an opaque identifier carrier and never a
 * real order object.
 */
type OrderPromotionCodeLinkDouble = ElementOf<
  NonNullable<ConstructorParameters<typeof PromotionCode>[0]['orders']>
>;

// ---------------------------------------------------------------------------
// Local exhibit types
//
// All declared module-local and NOT exported. This module exports exactly one
// unit; a consumer reaches every type through the returned graph's inferred
// shape.
// ---------------------------------------------------------------------------

/** The seven date-bound shapes a promotion period can carry, named. */
type PeriodDateBoundsName =
  | 'nowStrictlyInside'
  | 'nowAtStartDateTime'
  | 'nowAtEndDateTime'
  | 'startDateTimeAbsent'
  | 'endDateTimeAbsent'
  | 'bothBoundsAbsent'
  | 'fullyExpired'
  | 'endBeforeStart'
  | 'endEqualsStart';

/**
 * One row of the date-bound truth table, with BOTH predicates' outcomes.
 *
 * The two outcome columns are what make the ★★★ divergence assertable without a
 * suite having to re-derive it. They were read off the ported implementations
 * rather than guessed: `isCurrent` at src/domain/entities/promotionPeriod.ts
 * raises on an absent bound, which is why its column admits `'throws'`.
 */
type PeriodDateBoundsCase = {
  readonly name: PeriodDateBoundsName;

  /** Explicit UTC ISO-8601, or `undefined` for the nullable "forever" column. */
  readonly startDateTimeUTC: string | undefined;

  /** Explicit UTC ISO-8601, or `undefined` for the nullable "forever" column. */
  readonly endDateTimeUTC: string | undefined;

  /** `isCurrent(now)`: start-inclusive, end-EXCLUSIVE, and it raises on a null bound. */
  readonly isCurrentOutcome: boolean | 'throws';

  /** `getCurrentFlag()`: null-safe, end-INCLUSIVE, memoized on first read. */
  readonly getCurrentFlagOutcome: boolean;

  /** Does `model/validation/PromotionPeriod.json`'s `needsEndAfterStart` accept this shape? */
  readonly satisfiesNeedsEndAfterStart: boolean;

  /** Why the row exists, for a reviewer reading the table rather than the code. */
  readonly note: string;
};

/** Which of the ten qualifier gates a row describes. */
type QualifierGateName =
  | 'minimumOrderQuantity'
  | 'maximumOrderQuantity'
  | 'minimumOrderSubtotal'
  | 'maximumOrderSubtotal'
  | 'minimumItemQuantity'
  | 'maximumItemQuantity'
  | 'minimumItemPrice'
  | 'maximumItemPrice'
  | 'minimumFulfillmentWeight'
  | 'maximumFulfillmentWeight';

/**
 * One row of the qualifier gates' ASYMMETRIC null-semantics table.
 *
 * ⭐ The asymmetry is load-bearing: every `minimum*` gate carries
 * `hb_nullRBKey="define.0"` and every `maximum*` gate carries
 * `hb_nullRBKey="define.unlimited"` [model/entity/PromotionQualifier.cfc:L55-L64].
 * Getting it backwards on a maximum turns "unlimited" into "nothing qualifies".
 */
type QualifierGateNullDefault = {
  readonly gate: QualifierGateName;

  /** `'minimum'` means NULL is 0; `'maximum'` means NULL is unlimited. */
  readonly bound: 'minimum' | 'maximum';

  /** The `hb_nullRBKey` the column declares, verbatim. */
  readonly nullRBKey: 'define.0' | 'define.unlimited';

  /**
   * `hb_formatType` verbatim. ⭐ `'weight'` is NOT currency and must never be
   * routed through `Money`; `'currency'` must always be.
   */
  readonly formatType: 'currency' | 'weight' | 'none';

  /** Is the ported entity slot a `Money`? True for exactly the currency gates. */
  readonly isMonetary: boolean;
};

/** The migration's reference calculation, as numerals rather than as arithmetic. */
type ReferenceCalculation = {
  readonly unitPrice: string;
  readonly quantity: number;
  readonly extendedPrice: string;
  readonly percentageOff: string;
  readonly discountAmount: string;
  readonly netAmount: string;
  readonly presentedNetAmount: string;
  readonly presentedDiscountAmount: string;
};

/** A named reward ORDERING, so no ordering in this file is ever incidental. */
type RewardOrdering = {
  readonly name: 'orderRewardLast' | 'orderRewardFirst' | 'noOrderReward' | 'empty';
  readonly rewards: readonly PromotionReward[];
  readonly reachesPassTwo: boolean;
  readonly note: string;
};

/** A recorded call against the label-provider double. */
type RecordedRewardTypeLabelCall = {
  readonly rewardType: string;
};

/** The hand-written label-provider double, with its call log. */
type RecordingLabelProvider = PromotionRewardLabelProviderDouble & {
  readonly rewardTypeLabelCalls: readonly RecordedRewardTypeLabelCall[];
};

// ---------------------------------------------------------------------------
// The overrides surface
//
// EVERY variation this module supports flows through this one optional
// parameter - reward ordering, amount types, null and zero use limits, date
// boundaries, the empty-reward-array case. There is never a second export and
// never an exported mutable literal, so a suite cannot reach past the factory
// and mutate shared state.
//
// Every member is `?: T | undefined` rather than `?: T`. `exactOptionalPropertyTypes`
// is on, so "key absent" and "key present carrying undefined" are genuinely
// different types, and several defaults here have to distinguish them: an
// absent `promotionPeriodEndDateTime` means "use the documented default bound",
// while an explicitly-passed `undefined` means "the column is NULL - forever".
// ---------------------------------------------------------------------------

interface PromotionFixtureOverrides {
  /** Prefix for every generated identifier, so two graphs can be told apart. */
  readonly idPrefix?: string | undefined;

  /**
   * The instant every predicate in the graph is evaluated against.
   *
   * Defaults to a fixed UTC literal. A caller passing its own instant must
   * expect the date-bound table's outcome columns to stop matching, since those
   * are computed against the default.
   */
  readonly now?: Date | undefined;

  // --- Promotion ------------------------------------------------------------

  readonly promotionID?: string | undefined;
  readonly promotionName?: string | undefined;
  readonly promotionSummary?: string | undefined;
  readonly promotionDescription?: string | undefined;

  /**
   * CFML parity [model/entity/Promotion.cfc:L56]: `activeFlag` carries
   * `default="1"`, so an absent key yields TRUE. Passing `false` explicitly
   * survives as `false` - the resolution below uses a presence test rather than
   * truthiness for exactly that reason.
   */
  readonly activeFlag?: PromotionActiveFlagColumn;

  // --- Promotion period -----------------------------------------------------

  /**
   * An absent key uses the documented in-bounds default; an explicit
   * `undefined` makes the column NULL.
   *
   * CFML parity [model/entity/PromotionPeriod.cfc:L53]: NULL is a first-class
   * documented value here - the column declares `hb_nullRBKey="define.forever"`.
   */
  readonly promotionPeriodStartDateTime?: Date | undefined;

  /** As `promotionPeriodStartDateTime`; [model/entity/PromotionPeriod.cfc:L54]. */
  readonly promotionPeriodEndDateTime?: Date | undefined;

  /**
   * CFML parity [model/entity/PromotionPeriod.cfc:L55]: `notnull="false"` with
   * `hb_nullRBKey="define.unlimited"`, so NULL means unlimited, never zero uses.
   */
  readonly promotionPeriodMaximumUseCount?: number | undefined;

  /** As `promotionPeriodMaximumUseCount`; [model/entity/PromotionPeriod.cfc:L56]. */
  readonly promotionPeriodMaximumAccountUseCount?: number | undefined;

  // --- Promotion rewards ----------------------------------------------------

  /**
   * ⭐ THE REWARD ARRAY IS TAKEN EXACTLY AS SUPPLIED AND IS NEVER SORTED HERE.
   *
   * LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L51-L132]: `getActivePromotionRewards`
   *   carries NO `ORDER BY` clause at all - verified by grepping the whole
   *   function body - so the order in which the engine sees rewards is whatever
   *   the ORM happened to return, and the usage ledger it threads through the
   *   loop makes that order decide the money at a tie.
   * Preserved deliberately; do not fix without a product decision.
   *
   * The consequence for this fixture is a hard rule: it imposes no ordering of
   * its own, and no member of the returned graph is correct only under some
   * accidental arrangement. A suite states the order it wants and asserts the
   * behaviour GIVEN that order. The named orderings on the graph exist so the
   * order under test is always explicit.
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L458-L463]: the two-pass
   *   guard `if(!orderRewards and pr == arrayLen(promotionRewards)) { pr = 0;
   *   orderRewards = true; }` sits INSIDE the reward loop body and inside the
   *   "Promotion Period OK" block that closes at L463. Passing `[]` here is
   *   therefore a genuine exhibit and not an empty edge case: with no rewards
   *   the loop body never executes, so pass two NEVER RUNS AT ALL and the
   *   order-level branch at L415 is unreachable. Pass two also only fires when
   *   the LAST element of the array belongs to a qualifying period.
   * Preserved deliberately; do not fix without a product decision.
   */
  readonly promotionRewards?: readonly PromotionReward[] | undefined;

  /**
   * The amount carried by the primary reward.
   *
   * CFML parity [model/entity/PromotionReward.cfc:L61]: `amount` is
   * `ormType="big_decimal"` with NO `default` attribute, so absence is a real
   * persisted state and is representable here by passing `undefined`.
   */
  readonly rewardAmount?: Money | undefined;

  /** [model/entity/PromotionReward.cfc:L62]; absent means the default-less switch falls through. */
  readonly rewardAmountType?: AmountType | undefined;

  /** [model/entity/PromotionReward.cfc:L63]; deliberately un-narrowed, so mixed case is legal. */
  readonly rewardType?: string | undefined;

  /** [model/entity/PromotionReward.cfc:L64]; `both` | `initial` | `renewal`. */
  readonly rewardApplicableTerm?: ApplicableTerm | undefined;

  /**
   * ⭐ NULL means UNLIMITED [model/entity/PromotionReward.cfc:L65], and so does
   * ZERO - see the ledger note on the graph. Both are supported here.
   */
  readonly rewardMaximumUsePerOrder?: number | undefined;

  /** As above; [model/entity/PromotionReward.cfc:L66]. */
  readonly rewardMaximumUsePerItem?: number | undefined;

  /** As above; [model/entity/PromotionReward.cfc:L67]. */
  readonly rewardMaximumUsePerQualification?: number | undefined;

  /**
   * The reward's nullable rounding rule [model/entity/PromotionReward.cfc:L71].
   *
   * An absent key bridges to `./priceGroupFixtures` for a real rule; an explicit
   * `undefined` reproduces `hb_optionsNullRBKey="define.none"`, which is the
   * state that sends `getDiscountAmount` down its no-rounding branch
   * [model/service/PromotionService.cfc:L1005-L1010].
   */
  readonly roundingRule?: RoundingRule | undefined;

  /** [model/entity/PromotionReward.cfc:L74]; bridges to `./priceGroupFixtures`. */
  readonly eligiblePriceGroups?: readonly PriceGroup[] | undefined;

  // --- Membership collections, on both the reward and the qualifier ----------

  readonly brands?: readonly Brand[] | undefined;
  readonly options?: readonly Option[] | undefined;
  readonly skus?: readonly Sku[] | undefined;
  readonly products?: readonly Product[] | undefined;
  readonly productTypes?: readonly ProductType[] | undefined;
  readonly excludedBrands?: readonly Brand[] | undefined;
  readonly excludedOptions?: readonly Option[] | undefined;
  readonly excludedSkus?: readonly Sku[] | undefined;
  readonly excludedProducts?: readonly Product[] | undefined;
  readonly excludedProductTypes?: readonly ProductType[] | undefined;

  /** [model/entity/PromotionReward.cfc:L76]; opaque IDs, the far entities are out of scope. */
  readonly fulfillmentMethodIDs?: readonly string[] | undefined;

  /** [model/entity/PromotionReward.cfc:L78]; opaque IDs. */
  readonly shippingMethodIDs?: readonly string[] | undefined;

  /** [model/entity/PromotionReward.cfc:L77]; opaque IDs. */
  readonly shippingAddressZoneIDs?: readonly string[] | undefined;

  // --- Promotion code -------------------------------------------------------

  /**
   * CFML parity [model/entity/PromotionCode.cfc:L53]: the ORM property carries
   * NO `unique` attribute. Uniqueness is enforced by the CUSTOM validator
   * `hasUniquePromotionCode` wired at [model/validation/PromotionCode.json:L9] -
   * the same pattern as `Sku.hasUniqueOptions` - so a colliding value is
   * constructible and is exposed on the graph as an invalid-by-validation
   * exhibit.
   */
  readonly promotionCodeValue?: string | undefined;

  /** [model/entity/PromotionCode.cfc:L54]; absent uses the default, explicit `undefined` is NULL. */
  readonly promotionCodeStartDateTime?: Date | undefined;

  /** [model/entity/PromotionCode.cfc:L55]; as above. */
  readonly promotionCodeEndDateTime?: Date | undefined;

  /** [model/entity/PromotionCode.cfc:L56]; NULL means unlimited. */
  readonly promotionCodeMaximumUseCount?: number | undefined;

  /** [model/entity/PromotionCode.cfc:L57]; NULL means unlimited. */
  readonly promotionCodeMaximumAccountUseCount?: number | undefined;

  // --- Promotion qualifier --------------------------------------------------

  /**
   * CFML parity [model/service/PromotionService.cfc:L793]: the qualifier side
   * matches with `listFindNoCase("merchandise,subscription,contentAccess",
   * qualifier.getQualifierType())` - the SAME three-value vocabulary the
   * merchandise-side reward match uses at L198, and case-insensitively.
   */
  readonly qualifierType?: string | undefined;

  /** [model/entity/PromotionQualifier.cfc:L65]; `any` | `sku` | `product` | `productType` | `brand`. */
  readonly rewardMatchingType?: RewardMatchingType | undefined;

  /** The ten numeric gates, each independently overridable; absent uses the documented bound. */
  readonly qualifierGates?: QualifierGateOverrides | undefined;

  // --- Opaque out-of-scope identifiers --------------------------------------

  /** [model/entity/PromotionApplied.cfc:L61]; opaque - never an order object. */
  readonly orderID?: string | undefined;

  /** [model/entity/PromotionApplied.cfc:L59]; opaque. Also the ledger's first usage key. */
  readonly orderItemID?: string | undefined;

  /** The ledger's SECOND usage key, which must differ from the first - see the graph. */
  readonly secondOrderItemID?: string | undefined;

  /** [model/entity/PromotionApplied.cfc:L60]; opaque. */
  readonly orderFulfillmentID?: string | undefined;

  /** [model/entity/PromotionAccount.cfc:L58]; opaque - the `Account` entity is out of scope. */
  readonly accountID?: string | undefined;

  // --- Applied promotion ----------------------------------------------------

  /** [model/entity/PromotionApplied.cfc:L53]; `big_decimal`, therefore `Money`. */
  readonly discountAmount?: Money | undefined;

  /** [model/entity/PromotionApplied.cfc:L54]; the engine writes only `'orderItem'` at L530. */
  readonly appliedType?: PromotionAppliedType | undefined;

  /**
   * [model/entity/PromotionApplied.cfc:L55]; absent by default, deliberately.
   *
   * CFML parity [model/service/PromotionService.cfc:L528-L534]: the engine's
   * `newPromotionApplied()` sets appliedType, promotion, orderItem and
   * discountAmount and NEVER TOUCHES `currencyCode`, so `undefined` is the
   * parity-correct default for an engine-produced row.
   */
  readonly currencyCode?: PromotionAppliedCurrencyCodeColumn;

  // --- Promotion account ----------------------------------------------------

  /** [model/entity/PromotionAccount.cfc:L53]. */
  readonly promotionAccountStartDateTime?: Date | undefined;

  /** [model/entity/PromotionAccount.cfc:L54]. */
  readonly promotionAccountEndDateTime?: Date | undefined;

  // --- The usage ledger -----------------------------------------------------

  /**
   * `usedInOrder` for the ledger entry that OVERRUNS its per-order limit.
   *
   * Defaults above that entry's `maximumUsePerOrder`, so the over-use stripping
   * loop's outer condition at [model/service/PromotionService.cfc:L471] is
   * satisfied and the defect-9 body actually executes.
   */
  readonly overusedRewardUsedInOrder?: number | undefined;
}

/**
 * The ten qualifier gates, overridable one at a time.
 *
 * ⭐ Split into a nested bag rather than ten top-level keys so the asymmetric
 * null semantics stay visible as a group: the four `minimum*` gates default NULL
 * to 0 and the four `maximum*` gates default NULL to unlimited
 * [model/entity/PromotionQualifier.cfc:L55-L64], and the two weight gates are
 * NOT monetary.
 */
interface QualifierGateOverrides {
  readonly minimumOrderQuantity?: number | undefined;
  readonly maximumOrderQuantity?: number | undefined;
  readonly minimumOrderSubtotal?: Money | undefined;
  readonly maximumOrderSubtotal?: Money | undefined;
  readonly minimumItemQuantity?: number | undefined;
  readonly maximumItemQuantity?: number | undefined;
  readonly minimumItemPrice?: Money | undefined;
  readonly maximumItemPrice?: Money | undefined;

  /**
   * ⭐ NOT `Money`. [model/entity/PromotionQualifier.cfc:L63] carries
   * `hb_formatType="weight"`, and weight is not currency: routing it through the
   * money value object would be a category error that no rounding or currency
   * rule applies to.
   */
  readonly minimumFulfillmentWeight?: number | undefined;

  /** ⭐ NOT `Money`, for the same reason; [model/entity/PromotionQualifier.cfc:L64]. */
  readonly maximumFulfillmentWeight?: number | undefined;
}

// ---------------------------------------------------------------------------
// Local record types for the graph's annotation exhibits
//
// Each one turns a finding that would otherwise live only in a comment into a
// value a suite can assert against. A comment can drift from the code silently;
// a typed constant that a test reads cannot.
// ---------------------------------------------------------------------------

/** A promotion period paired with the truth-table row it was built from. */
type DatedPromotionPeriod = {
  readonly bounds: PeriodDateBoundsCase;
  readonly promotionPeriod: PromotionPeriod;
};

/**
 * A promotion code paired with the SAME truth-table row.
 *
 * ⭐ Deliberately driven off the identical table as {@link DatedPromotionPeriod},
 * because `PromotionCode.getCurrentFlag()` [model/entity/PromotionCode.cfc:L85-L94]
 * is BYTE-FOR-BYTE IDENTICAL to `PromotionPeriod.getCurrentFlag()`
 * [model/entity/PromotionPeriod.cfc:L137-L146]. Sharing the table is what stops
 * the two ports drifting apart unnoticed.
 */
type DatedPromotionCode = {
  readonly bounds: PeriodDateBoundsCase;
  readonly promotionCode: PromotionCode;
};

/**
 * The opaque identifiers this module hands out in place of out-of-scope entities.
 *
 * The order aggregate, `OrderItem`, `OrderFulfillment` and `Account` are ALL out
 * of scope. Every reference to one of them is a bare string here, and no method
 * on any of them is ever called. That is the anti-corruption boundary, expressed
 * as data rather than as a promise.
 */
type OpaqueOrderReferences = {
  readonly orderID: string;

  /** The FIRST order item. The ledger's first usage entry references this one. */
  readonly orderItemID: string;

  /**
   * The SECOND order item, which MUST differ from the first.
   *
   * ⭐ Two distinct order items are what make LEGACY-DEFECT 9 visible at all -
   * see the ledger member on the graph.
   */
  readonly secondOrderItemID: string;

  readonly orderFulfillmentID: string;

  /** [model/entity/PromotionAccount.cfc:L58] and [model/entity/PromotionCode.cfc:L65]. */
  readonly accountID: string;
};

/**
 * The ★★★ contrast between the promotion period's TWO currency predicates, and
 * the record that one of them has no caller.
 */
type PeriodPredicateContrast = {
  /** `'isCurrent'` - the predicate with no caller anywhere in the legacy tree. */
  readonly deadPredicate: string;

  /** Where the dead predicate is declared, which is also its only occurrence. */
  readonly deadPredicateLocator: string;

  /** `'getCurrentFlag'` - the predicate the engine actually consults. */
  readonly livePredicate: string;

  readonly livePredicateLocator: string;

  /** The call path that reaches the live predicate, outermost first. */
  readonly livePredicateCallPath: readonly string[];

  /** Does the dead predicate guard a null bound? No - it dereferences both. */
  readonly deadPredicateGuardsNullBounds: boolean;

  /** Does the live predicate guard a null bound? Yes - null means "forever". */
  readonly livePredicateGuardsNullBounds: boolean;

  /** The dead predicate's end comparison is EXCLUSIVE (`>`). */
  readonly deadPredicateEndBoundInclusive: boolean;

  /** The live predicate's end comparison is INCLUSIVE (negated `<`). */
  readonly livePredicateEndBoundInclusive: boolean;

  /** The dead predicate captures `now()` ONCE into a local. */
  readonly deadPredicateNowCallCount: number;

  /** The live predicate calls `now()` TWICE inline, so it is not atomic. */
  readonly livePredicateNowCallCount: number;

  /** Only the live predicate memoizes, freezing its first answer for the object's life. */
  readonly livePredicateMemoizes: boolean;
};

/** The four spellings behind the never-caching promotion-codes-deletable memo. */
type PromotionCodesDeletableFlagDefect = {
  /** The accessor's own name, which is correct. */
  readonly methodName: string;

  /** The property DECLARED at [model/entity/Promotion.cfc:L79] - plural, correct. */
  readonly declaredPropertyName: string;

  /** The key the existence GUARD tests at [model/entity/Promotion.cfc:L124] - singular. */
  readonly guardedKeyName: string;

  /** The key ASSIGNED and RETURNED at L125, L128 and L133 - singular plus a stray `e`. */
  readonly assignedKeyName: string;

  /** How many DISTINCT spellings the five sites use between them. */
  readonly distinctSpellingCount: number;

  /** Because the guard never matches the assignment, the memo can never hit. */
  readonly memoCanEverHit: boolean;

  /** The declarative wiring that puts the defect on a validated path. */
  readonly validationLocator: string;

  /**
   * ⭐ A SEPARATE, CROSS-FILE gap in the port, recorded here rather than worked
   * around: the ported accessor RAISES when it reaches a materialized promotion
   * code, because [model/entity/Promotion.cfc:L127] calls `promotionCode.isDeletable()`
   * and `src/domain/entities/promotionCode.ts` does not declare that member - it
   * was inherited from the deliberately-unported framework base. A code-LESS
   * promotion still answers `true`, because the ported body is an `every` over an
   * empty collection and never invokes the callback.
   *
   * Both facts are exposed as data so a suite can assert the raise instead of
   * discovering it, and neither is patched from this file: `promotionCode.ts` is
   * owned by another agent and is read-only here.
   */
  readonly portedAccessorRaisesOnMaterializedCode: boolean;

  /** The follow-up that closes the gap, stated so it is actionable rather than noted. */
  readonly requiredCrossFileFollowUp: string;
};

/**
 * The qualifier's option-list property/accessor MISMATCH: one declared property
 * with no provider, one provider with no declared property.
 */
type QualifierOptionListMismatch = {
  /** Declared at [model/entity/PromotionQualifier.cfc:L99]; nothing implements it. */
  readonly declaredPropertyWithoutProvider: string;

  readonly declaredPropertyLocator: string;

  /** Implemented at [model/entity/PromotionQualifier.cfc:L107-L115]; nothing declares it. */
  readonly providerWithoutDeclaredProperty: string;

  readonly providerLocator: string;

  /** The persistent property the orphaned provider actually serves. */
  readonly providerServesProperty: string;
};

/** One row of the reward-type dispatch map, with the pass it routes into. */
type RewardTypeDispatchRow = {
  readonly rewardType: string;

  /** `'one'` is the item/fulfillment pass; `'two'` is the order pass. */
  readonly pass: 'one' | 'two';

  /** The exact site in the engine that routes this reward type. */
  readonly locator: string;

  /** True where the site uses `listFindNoCase`; false where it uses CFML `eq`. */
  readonly matchIsCaseInsensitive: boolean;
};

/** One of the reward's fourteen many-to-many link tables. */
type RewardManyToManyCollection = {
  readonly property: string;
  readonly linkTable: string;

  /** ⭐ True for exactly THREE of the fourteen; the target normalises all fourteen. */
  readonly declaresTypeArray: boolean;

  readonly locator: string;
};

/** One row of the promotion family's validation-file census. */
type ValidationFileCensusRow = {
  readonly entity: string;
  readonly validationFile: string;
  readonly present: boolean;

  /** Line count where present, `undefined` where absent - never `0`. */
  readonly lineCount: number | undefined;
};

/** The three materialized comma-list ID paths the membership tests walk. */
type MaterializedIdPaths = {
  /** Walked by [model/service/PromotionService.cfc:L858-L870] and :L921-L985. */
  readonly productTypeIDPath: string;

  /** Sourced from `./priceGroupFixtures`, so both modules agree on one value. */
  readonly priceGroupIDPath: string;

  /** Built structurally: `Category` is not on this fixture's dependency whitelist. */
  readonly categoryIDPath: string;
};

// ---------------------------------------------------------------------------
// The returned graph
//
// A consumer reaches EVERY entity and EVERY exhibit through this one value. The
// type is declared locally and NOT exported, so the graph's shape is inferred at
// the call site and there is exactly one exported unit in the module.
// ---------------------------------------------------------------------------

interface PromotionFixtureGraph {
  // --- The seven-entity family ---------------------------------------------

  /**
   * `SlatwallPromotion`, table `SwPromotion`.
   *
   * The default is the CODED variant: one current period and one current code,
   * so `getCurrentFlag()` [model/entity/Promotion.cfc:L83-L92] is true through
   * both of its conjuncts. `codelessPromotion` is the other half of that pair.
   */
  readonly promotion: Promotion;

  /**
   * `SlatwallPromotionPeriod`, table `SwPromotionPeriod` - the FULL name, unlike
   * the abbreviated `SwPromoReward` and `SwPromoQual`.
   *
   * Bounds default to `nowStrictlyInside`, so BOTH currency predicates agree.
   * `datedPromotionPeriods` carries the other eight shapes, including the one
   * where they disagree.
   */
  readonly promotionPeriod: PromotionPeriod;

  /** `SlatwallPromotionCode`, table `SwPromotionCode`. */
  readonly promotionCode: PromotionCode;

  /**
   * `SlatwallPromotionQualifier`, table `SwPromoQual`.
   *
   * Carries real values on all ten gates. `permissivePromotionQualifier` is the
   * all-absent counterpart that exercises the asymmetric null defaults.
   */
  readonly promotionQualifier: PromotionQualifier;

  /**
   * The reward array, IN THE ORDER THIS GRAPH WAS ASKED FOR - never sorted here.
   *
   * The default holds THREE rewards, and the composition is deliberate rather
   * than arbitrary:
   *
   *   [0] a `merchandise` reward - pass one, via the `listFindNoCase` list at
   *       [model/service/PromotionService.cfc:L198].
   *   [1] a `fulfillment` reward - ALSO pass one, via the separate `eq` test at
   *       [model/service/PromotionService.cfc:L345]. Two different sites, one
   *       pass; this is half of AAP CORRECTION #7.
   *   [2] an `order` reward LAST - the only route into pass two
   *       [model/service/PromotionService.cfc:L415], and last because the
   *       two-pass guard at L458-L461 only fires when the final element of the
   *       array belongs to a qualifying period.
   *
   * `rewardOrderings` exposes the same rewards under other arrangements,
   * including the empty array, so a suite never depends on this default.
   */
  readonly promotionRewards: readonly PromotionReward[];

  /**
   * `SlatwallPromotionApplied`, table `SwPromotionApplied` - the engine's
   * WRITE-SIDE output.
   *
   * Its three order-side foreign keys are opaque strings; see
   * `opaqueOrderReferences`.
   */
  readonly promotionApplied: PromotionApplied;

  /**
   * `SlatwallPromotionAccount`, table `SwPromotionAccount` - the full name again.
   *
   * ⭐ INERT AND UNEXERCISED IN THIS SLICE. It has no validation file, no
   * in-scope service references it, `PromotionService.cfc` never touches it, and
   * the legacy source even carries a COMMENTED-OUT `promotionPeriod` foreign key
   * at [model/entity/PromotionAccount.cfc:L59]. It is supplied for completeness
   * and is labelled unexercised rather than quietly presented as covered.
   */
  readonly promotionAccount: PromotionAccount;

  // --- The fixed clock -----------------------------------------------------

  /**
   * The single instant every predicate in this graph is evaluated against.
   *
   * A FRESH `Date` per call, built from an explicit UTC ISO-8601 literal. There
   * is no `new Date()` with no argument and no `Date.now()` anywhere in this
   * module: a fixture whose answers move with the wall clock is not a fixture.
   */
  readonly now: Date;

  /**
   * The clock closure handed to `PromotionPeriod` and `PromotionCode`, both of
   * which take `now: () => Date` as a REQUIRED constructor slot.
   *
   * Returns a fresh `Date` carrying the same instant on every call, so a suite
   * cannot mutate the graph's notion of "now" by mutating a returned `Date`.
   */
  readonly clock: () => Date;

  // --- rewardType: the vocabulary and the dispatch map ---------------------

  /**
   * The five `rewardType` values in EXACT SOURCE ORDER, from the vocabulary
   * comment at [model/entity/PromotionReward.cfc:L49-L56].
   */
  readonly rewardTypeVocabulary: readonly string[];

  /**
   * The comma list the engine matches pass-one MERCHANDISE-side rewards against,
   * verbatim from [model/service/PromotionService.cfc:L198].
   */
  readonly passOneMerchandiseRewardTypeList: string;

  /**
   * ⭐ AAP CORRECTION #7, first half: PASS ONE HANDLES FOUR REWARD TYPES - the
   * three in the comma list above plus `fulfillment`, matched by a SEPARATE `eq`
   * test at [model/service/PromotionService.cfc:L345].
   *
   * Split with `listToArray` from `src/lib/cfml/list.ts` - the same helper the
   * engine's own comma-list handling uses - rather than by a hand-written
   * `String.prototype.split`.
   */
  readonly passOneRewardTypes: readonly string[];

  /**
   * ⭐ AAP CORRECTION #7, second half: PASS TWO HANDLES EXACTLY ONE - `order`,
   * at [model/service/PromotionService.cfc:L415].
   */
  readonly passTwoRewardType: string;

  /** The full dispatch map as data, one row per routed reward type. */
  readonly rewardTypeDispatchMap: readonly RewardTypeDispatchRow[];

  /** Pass one, matched through the comma list at L198. */
  readonly merchandiseReward: PromotionReward;

  /** Pass one, matched through the comma list at L198. */
  readonly subscriptionReward: PromotionReward;

  /** Pass one, matched through the comma list at L198. */
  readonly contentAccessReward: PromotionReward;

  /** Pass one, matched by the separate `eq "fulfillment"` test at L345. */
  readonly fulfillmentReward: PromotionReward;

  /**
   * PASS TWO, and the only reward type that reaches it.
   *
   * ⭐ It is also the reward whose amount-type vocabulary is RESTRICTED to two
   * values by `getAmountTypeOptions()` [model/entity/PromotionReward.cfc:L120-L133].
   * The two facts dovetail: the pass-two reward is exactly the one the legacy UI
   * will not offer a fixed amount for.
   */
  readonly orderReward: PromotionReward;

  /**
   * ⭐ `rewardType` spelled `'Merchandise'` - capitalised.
   *
   * CFML parity [model/service/PromotionService.cfc:L198, L793]: both matching
   * sites use `listFindNoCase`, which is CASE-INSENSITIVE, so this reward is a
   * pass-one merchandise reward in the legacy engine. `PromotionReward`'s
   * `getRewardType()` returns an un-narrowed `string` precisely so this state is
   * expressible without a cast.
   */
  readonly mixedCaseRewardTypeReward: PromotionReward;

  // --- amountType ----------------------------------------------------------

  /** The three values `getAmountTypeOptions()` offers a NON-order reward. */
  readonly amountTypeVocabulary: readonly [AmountType, AmountType, AmountType];

  /** ⭐ The TWO values it offers an `order` reward - `amount` is withheld. */
  readonly orderRewardAmountTypeVocabulary: readonly [AmountType, AmountType];

  /**
   * The STORED value for a fixed amount: `'amount'`.
   *
   * CFML parity [model/entity/PromotionReward.cfc:L129]: the option's display
   * key is `define.fixedAmount` while its value is `amount`. Everything in this
   * module uses the VALUE; the label is exposed separately so the mismatch is
   * visible rather than a trap.
   */
  readonly fixedAmountAmountTypeValue: AmountType;

  /** The display key for that same option, recorded but never used as a value. */
  readonly fixedAmountAmountTypeLabelKey: string;

  /** `amountType = 'percentageOff'`; the `precisionEvaluate`-guarded branch at L995. */
  readonly percentageOffReward: PromotionReward;

  /**
   * `amountType = 'amountOff'`.
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L998]: this branch alone
   *   omits `precisionEvaluate` and multiplies with raw floating point, while
   *   every neighbouring branch is guarded.
   * // JUDGMENT CALL: NOT reproduced. All arithmetic in the target flows through
   * `Money` over decimal.js, so this branch is deliberately MORE correct than
   * the source. Preserving the drift would mean bypassing the value object on
   * purpose, which is a structural regression rather than a fidelity gain. This
   * is one of the plan's three documented divergences.
   */
  readonly amountOffReward: PromotionReward;

  /** `amountType = 'amount'` on a NON-order reward - the legal fixed-amount case. */
  readonly fixedAmountReward: PromotionReward;

  /**
   * ⭐ `amountType` ABSENT.
   *
   * `AmountType` is a CLOSED union in the target, so an unrecognised string
   * literal is not expressible without a cast - and a cast is not available
   * here, since `no-explicit-any` and `ban-ts-comment` are both errors and the
   * fixture uses neither. // JUDGMENT CALL: absence is the type-safe route into
   * the SAME hole, because `getDiscountAmount`'s switch at
   * [model/service/PromotionService.cfc:L992-L1003] has NO `default:` case: an
   * unmatched amount type falls straight through with no branch taken. This
   * reward is how a suite drives that fall-through.
   */
  readonly absentAmountTypeReward: PromotionReward;

  /**
   * ⭐⭐ THE IMPOSSIBLE-BUT-REPRESENTABLE STATE: `rewardType: 'order'` together
   * with `amountType: 'amount'`.
   *
   * `getAmountTypeOptions()` [model/entity/PromotionReward.cfc:L120-L133] does
   * NOT offer `amount` for an order-level reward, so the legacy admin cannot
   * produce this combination. NOTHING PREVENTS IT BEING PERSISTED, and once
   * persisted the default-less switch at
   * [model/service/PromotionService.cfc:L992-L1003] executes the `amount` branch
   * regardless. The state is unreachable through the UI and fully reachable
   * through the data, which is exactly why it needs a fixture.
   */
  readonly impossibleOrderFixedAmountReward: PromotionReward;

  /**
   * ⭐ `amount` ABSENT - INVALID BY VALIDATION, deliberately.
   *
   * CFML parity [model/entity/PromotionReward.cfc:L61]: the column carries NO
   * `default`, so absence is a real persisted state. But
   * [model/validation/PromotionReward.json] makes BOTH `amountType` AND `amount`
   * `required` in the `save` context, so this row could never be saved through
   * the validated path. Supplied so a schema test has something that must be
   * REJECTED, and labelled invalid rather than presented as a normal shape.
   */
  readonly absentAmountReward: PromotionReward;

  // --- The migration's reference calculation --------------------------------

  /**
   * The reference calculation as NUMERALS, never as arithmetic.
   *
   * 19.99 x 3 = 59.97; 12.5 % of that is 7.49625; the net is 52.47375; presented
   * to two places it is `"52.47"`, reproducing
   * `numberFormat(discountAmount,"0.00")`
   * [model/service/PromotionService.cfc:L1017] with no IEEE-754 drift. Every
   * figure is a decimal STRING, so nothing in this module ever performs
   * floating-point arithmetic on money - not even to build an expectation.
   *
   * The values are the same literals `./priceGroupFixtures` publishes, so the
   * two modules cannot disagree about the migration's own worked example.
   */
  readonly referenceCalculation: ReferenceCalculation;

  /**
   * A `percentageOff` reward carrying EXACTLY `'12.5'`, so the reference
   * calculation is drivable directly rather than reconstructed by a suite.
   */
  readonly referenceCalculationReward: PromotionReward;

  /**
   * The SKU the reference calculation prices, from `./skuFixtures`, whose default
   * price is already `'19.99'` - the reference unit price. Sourced rather than
   * rebuilt so both modules price the same object.
   */
  readonly referenceCalculationSku: Sku;

  // --- Use limits, and the two ways they mean "unlimited" -------------------

  /**
   * The `1000000` sentinel the ledger seeds every limit with
   * [model/service/PromotionService.cfc:L173-L179].
   *
   * Imported as a type from `src/domain/promotionEngine/rewardUsageTypes.ts` -
   * `UnlimitedUseSentinel` is a TYPE alias with zero runtime footprint, so the
   * literal is written out here and typed by it. That keeps one number in one
   * place while still letting the compiler reject a different one.
   */
  readonly unlimitedUseSentinel: UnlimitedUseSentinel;

  /**
   * All three limits ABSENT - the documented "unlimited" shape.
   *
   * CFML parity [model/entity/PromotionReward.cfc:L65-L67]: each column carries
   * `hb_nullRBKey="define.unlimited"`, and
   * [model/validation/PromotionReward.json] leaves all three merely `numeric`
   * rather than required, so NULL is the validated, legitimate shape.
   */
  readonly unlimitedUseLimitsReward: PromotionReward;

  /**
   * ⭐⭐ ALL THREE LIMITS EXPLICITLY `0` - WHICH ALSO MEANS UNLIMITED.
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L180-L188]: each limit
   *   overrides the 1000000 sentinel only when `!isNull(...) AND > 0`. A merchant
   *   who sets `maximumUsePerOrder = 0` intending "disabled" therefore gets
   *   UNLIMITED - the opposite of the intent - because zero fails the `> 0` test
   *   and the sentinel survives.
   * Preserved deliberately; do not fix without a product decision.
   *
   * ⚠️ AAP CORRECTION #4: the plan records only NULL as meaning unlimited. Zero
   * and every negative value mean unlimited too, and this reward is the exhibit.
   */
  readonly zeroUseLimitsReward: PromotionReward;

  /**
   * All three limits NEGATIVE - unlimited for the same reason as zero.
   *
   * Not a hypothetical: nothing in the ORM metadata or in
   * [model/validation/PromotionReward.json] constrains the sign, so a negative
   * value is persistable and takes the same fall-through.
   */
  readonly negativeUseLimitsReward: PromotionReward;

  /**
   * All three limits POSITIVE - the only shape that actually overrides the
   * sentinel, and therefore the only shape under which use-limit enforcement is
   * observable at all.
   */
  readonly boundedUseLimitsReward: PromotionReward;

  // --- Rounding rule and price-group bridges -------------------------------

  /**
   * The reward's rounding rule, sourced from `./priceGroupFixtures` so both
   * modules round with one rule rather than two look-alikes.
   */
  readonly roundingRule: RoundingRule;

  /** A reward WITH the rounding rule attached - the rounded discount branch. */
  readonly roundedReward: PromotionReward;

  /**
   * A reward with NO rounding rule.
   *
   * CFML parity [model/entity/PromotionReward.cfc:L71]: the many-to-one is
   * nullable and declares `hb_optionsNullRBKey="define.none"`, so "no rounding"
   * is a first-class configured state and not a missing value.
   */
  readonly unroundedReward: PromotionReward;

  /**
   * `eligiblePriceGroups`, over `SwPromoRewardEligiblePriceGrp`
   * [model/entity/PromotionReward.cfc:L74] - the reward's second bridge into
   * `./priceGroupFixtures`. A per-call COPY, so a suite mutating it cannot reach
   * the price-group graph.
   */
  readonly eligiblePriceGroups: readonly PriceGroup[];

  /**
   * All FOURTEEN of the reward's many-to-many link tables, as data.
   *
   * ⭐ Only THREE declare `type="array"` in the legacy source -
   * `eligiblePriceGroups` [L74], `excludedBrands` [L86] and `excludedOptions`
   * [L87]. The other eleven omit it, which is an inconsistency in the
   * DECLARATION rather than a difference in behaviour: Hibernate hands every
   * unpopulated many-to-many back as an empty collection either way. The target
   * normalises all fourteen to arrays, and this census is how that
   * normalisation stays auditable against what the source actually says.
   */
  readonly rewardManyToManyCollections: readonly RewardManyToManyCollection[];

  /**
   * The qualifier's count for the same census: THIRTEEN, one fewer than the
   * reward's fourteen, because the qualifier has NO `eligiblePriceGroups`.
   */
  readonly qualifierManyToManyCollectionCount: number;

  // --- Reward ORDERINGS, always explicit -----------------------------------

  /**
   * The named arrangements of the same rewards, each recording whether it
   * reaches pass two.
   *
   * This member exists so that no suite ever relies on an incidental order. The
   * `empty` row is a first-class exhibit rather than a degenerate case: with no
   * rewards the loop body never runs, so the two-pass guard at
   * [model/service/PromotionService.cfc:L458-L461] never executes and pass two
   * NEVER RUNS AT ALL.
   */
  readonly rewardOrderings: readonly RewardOrdering[];

  // --- The reward usage ledger ---------------------------------------------

  /**
   * A seeded `promotionRewardUsageDetails` ledger, keyed by promotion reward ID.
   *
   * The TYPE is imported from `src/domain/promotionEngine/rewardUsageTypes.ts`
   * and is never redeclared here - one owner for the contract, one place a change
   * to it breaks the build.
   *
   * Seeding reproduces [model/service/PromotionService.cfc:L172-L188] exactly:
   * every limit starts at the 1000000 sentinel and is overridden only by a
   * present, strictly-positive column value, and the whole block sits behind a
   * `structKeyExists` guard so seeding is IDEMPOTENT AND FIRST-REWARD-WINS - a
   * duplicate reward ID never re-seeds.
   *
   * ⭐ It carries at least TWO entries whose `orderItemsUsage` reference
   * DIFFERENT opaque order items. That is not decoration: LEGACY-DEFECT 9 at
   * [model/service/PromotionService.cfc:L468-L521] iterates `for(var prID in
   * promotionRewardUsageDetails)` but reads its subtrahend from
   * `promotionRewardUsageDetails[ reward.getPromotionRewardID() ]` at L472 and
   * walks that same LEAKED `reward`'s `orderItemsUsage` at L475-L477, while the
   * inner match at L483 and L499 compares against `prID`. With a single order
   * item, or with a single reward, the wrong-key read produces the right answer
   * by coincidence and the defect is INVISIBLE.
   */
  readonly rewardUsageDetails: PromotionRewardUsageDetails;

  /**
   * The reward ID whose ledger entry OVERRUNS its own `maximumUsePerOrder`, so
   * the stripping loop's outer condition at
   * [model/service/PromotionService.cfc:L471] is satisfied and the defect-9 body
   * actually executes.
   */
  readonly overusedRewardID: string;

  /**
   * The reward ID that `reward.getPromotionRewardID()` resolves to when the
   * stripping loop reads it - the LAST reward the preceding loop touched, which
   * is the value that leaks out of it.
   *
   * Distinct from `overusedRewardID`, deliberately: if the two coincided the
   * wrong-key read would be indistinguishable from a correct one.
   */
  readonly leakedRewardID: string;

  /** The over-used entry itself, so a suite need not index the ledger to reach it. */
  readonly overusedRewardUsageDetail: PromotionRewardUsageDetail;

  /** The leaked entry, likewise. */
  readonly leakedRewardUsageDetail: PromotionRewardUsageDetail;

  // The REVERSE direction of both inner searches in the stripping loop
  // [model/service/PromotionService.cfc:L482, L498] is NOT published here as a boolean. A flag this
  // module writes and a suite reads can only agree with itself; the direction is load-bearing money
  // behaviour, so it is proven behaviourally in
  // tests/unit/services/promotion/overUseStripping.test.ts, where the SMALLEST matching discount is
  // the one rewritten and the one deleted.

  /**
   * The identifier that gates the whole reward body at
   * [model/service/PromotionService.cfc:L197], spelled as the legacy source
   * spells it: `qualificationsMeet`, not `qualificationsMet`.
   *
   * Recorded verbatim because the grammar is part of what a reviewer diffing the
   * two implementations will look for.
   */
  readonly legacyQualificationGateIdentifier: string;

  /** The opaque out-of-scope identifiers this graph hands out. */
  readonly opaqueOrderReferences: OpaqueOrderReferences;

  // --- Date bounds ---------------------------------------------------------

  /**
   * The NINE date-bound shapes, with BOTH predicates' outcomes per shape.
   *
   * Every bound is an explicit UTC ISO-8601 string literal or `undefined`. The
   * table is what makes the ★★★ divergence assertable in one place instead of
   * being rediscovered per suite.
   */
  readonly periodDateBoundsCases: readonly PeriodDateBoundsCase[];

  /** One FRESH `PromotionPeriod` per row of that table. */
  readonly datedPromotionPeriods: readonly DatedPromotionPeriod[];

  /** One FRESH `PromotionCode` per row of the SAME table - see {@link DatedPromotionCode}. */
  readonly datedPromotionCodes: readonly DatedPromotionCode[];

  /** The ★★★ contrast between the two predicates, and the dead-code finding. */
  readonly periodPredicateContrast: PeriodPredicateContrast;

  /**
   * The named condition both `model/validation/PromotionCode.json` and
   * `model/validation/PromotionPeriod.json` declare: when BOTH bounds are
   * present, `endDateTime` must be `gtProperty: "startDateTime"` - strictly
   * greater. Either bound may still be absent, because absence means "forever".
   */
  readonly conditionalDateValidationName: string;

  /** The comparison the condition applies, recorded as data. */
  readonly conditionalDateValidationComparison: string;

  // --- Promotion variants --------------------------------------------------

  /**
   * A promotion with a current period and NO promotion codes at all.
   *
   * ⭐ Code-less and coded promotions behave DIFFERENTLY in
   * `getCurrentFlag()` [model/entity/Promotion.cfc:L83-L92]: the second conjunct
   * is `arrayLen(getPromotionCodes()) == 0 OR getCurrentPromotionCodeFlag()`, so
   * a code-less promotion is current on the strength of its period alone, while
   * a coded one additionally needs a current code.
   */
  readonly codelessPromotion: Promotion;

  /** A current period but ONLY expired codes - the second conjunct fails. */
  readonly promotionWithOnlyExpiredCodes: Promotion;

  /** Only expired periods but a current code - the FIRST conjunct fails. */
  readonly promotionWithOnlyExpiredPeriods: Promotion;

  /** The four spellings behind the never-caching deletable-flag memo. */
  readonly promotionCodesDeletableFlagDefect: PromotionCodesDeletableFlagDefect;

  /**
   * CFML parity [model/entity/Promotion.cfc:L56]: `activeFlag` declares
   * `default="1"`, so an unset column reads TRUE - the same as `Sku`, and unlike
   * `Product`, which declares no default at all. Recorded as data because "the
   * default is on" is the kind of claim that silently rots.
   */
  readonly activeFlagOrmDefault: boolean;

  // --- Promotion code -----------------------------------------------------

  /**
   * A second code carrying the SAME `promotionCode` value as `promotionCode`,
   * attached to the same promotion - INVALID BY VALIDATION.
   *
   * CFML parity: uniqueness is enforced by the CUSTOM validator
   * `hasUniquePromotionCode` wired declaratively in
   * `model/validation/PromotionCode.json`, NOT by a declarative `unique:true` on
   * the ORM property, which is why [model/entity/PromotionCode.cfc:L53] carries
   * no `unique` attribute. The same pattern as `Sku.hasUniqueOptions`. The
   * comparison is case-insensitive under MySQL's default collation, so this
   * collision holds even with different casing.
   */
  readonly collidingPromotionCode: PromotionCode;

  /** The custom validator's name, recorded so the wiring is checkable. */
  readonly uniquePromotionCodeValidatorName: string;

  /**
   * The code's account links, over `SwPromotionCodeAccount`
   * [model/entity/PromotionCode.cfc:L65].
   *
   * The far side is the OUT-OF-SCOPE `Account` entity, so each link is a narrow
   * structural double carrying an opaque `accountID` and the two probes the
   * bidirectional helpers call - never a real account.
   */
  readonly promotionCodeAccounts: readonly PromotionCodeAccountLinkDouble[];

  /**
   * The code's order links, over `SwOrderPromotionCode`
   * [model/entity/PromotionCode.cfc:L68].
   *
   * ⭐ The ORDER AGGREGATE IS ENTIRELY OUT OF SCOPE. Each link is an opaque
   * identifier carrier plus the two owning-side maintenance methods the entity
   * delegates to. No order-shaped data lives here; that is
   * `orderViewFixtures.ts`, which this module must not import.
   */
  readonly promotionCodeOrders: readonly OrderPromotionCodeLinkDouble[];

  /**
   * CFML parity [model/entity/PromotionCode.cfc:L105]: `setPromotion` reads
   * `arguments.Promotion` with a CAPITAL P while its own parameter is declared
   * lowercase - legal in CFML, where argument names are case-insensitive. The
   * same casing slip appears in `Brand.removeProduct` and
   * `ProductType.setProducts`. Recorded as the parameter name the target uses,
   * which is the lowercase one.
   */
  readonly promotionCodeSetPromotionParameterName: string;

  // --- Qualifier -----------------------------------------------------------

  /**
   * A qualifier with ALL TEN GATES ABSENT - fully permissive.
   *
   * ⭐ The null defaults are ASYMMETRIC and load-bearing: every `minimum*` gate
   * declares `hb_nullRBKey="define.0"` and every `maximum*` gate declares
   * `hb_nullRBKey="define.unlimited"` [model/entity/PromotionQualifier.cfc:L55-L64].
   * Reading a maximum's absence as `0` instead of unlimited would turn
   * "unlimited" into "nothing qualifies" - which is why the ported entity
   * assigns all ten straight through with no `??` on any of them.
   */
  readonly permissivePromotionQualifier: PromotionQualifier;

  /** The ten gates' null semantics and format types, as an assertable table. */
  readonly qualifierGateNullDefaults: readonly QualifierGateNullDefault[];

  /**
   * The `rewardMatchingType` vocabulary from
   * [model/entity/PromotionQualifier.cfc:L107-L115]: `any`, `sku`, `product`,
   * `productType`, `brand`.
   */
  readonly rewardMatchingTypeVocabulary: readonly RewardMatchingType[];

  /** ⭐ AAP CORRECTION #6: the declared-property / provider mismatch. */
  readonly qualifierOptionListMismatch: QualifierOptionListMismatch;

  // --- Materialized paths and the membership graph -------------------------

  /**
   * The three comma-list ID paths the membership tests walk.
   *
   * Built with `buildIdPathList` from
   * `src/domain/valueObjects/materializedIdPath.ts` rather than hand-written, so
   * the delimiter, the root-first ordering and the include-self property come
   * from the one implementation the engine uses.
   */
  readonly materializedIdPaths: MaterializedIdPaths;

  /**
   * The product-type chain, ROOT FIRST, at least THREE levels deep.
   *
   * Depth matters: a one-level chain makes `productTypeIDPath` a single ID, and
   * a path-containment test over a single ID passes for the wrong reason. The
   * qualifier and reward membership walks at
   * [model/service/PromotionService.cfc:L858-L870] and :L921-L985 are only
   * genuinely exercised by a multi-level path.
   */
  readonly productTypeChain: readonly ProductType[];

  /** The LEAF product type - the one a membership test starts from. */
  readonly productType: ProductType;

  /** The brand on both the reward's and the qualifier's `brands` collections. */
  readonly brand: Brand;

  /** The option on both `options` collections. */
  readonly option: Option;

  /**
   * The SKU on both `skus` collections, and the one the reference calculation
   * prices.
   *
   * // JUDGMENT CALL: SHARED IDENTITY, COPIED CONTAINERS. This is the same
   * object the reward's `skus` array holds, because a membership test asks
   * whether THIS sku is in THAT collection and two equal-but-distinct SKUs would
   * make the question meaningless. The ARRAYS that contain it are still fresh
   * per call, so a suite can splice a collection without reaching another
   * suite's graph. The trap this avoids is the mirror image of
   * [model/service/PriceGroupService.cfc:L276-L282], where CFML's copy-by-value
   * array semantics mean an `arrayAppend` to a fetched collection leaves the
   * owner untouched - a TypeScript reference would have mutated it.
   */
  readonly sku: Sku;

  /** The product on both `products` collections. */
  readonly product: Product;

  /** A brand on the EXCLUSION side, over `SwPromoRewardExclBrand`. */
  readonly excludedBrand: Brand;

  /** A product type on the exclusion side, over `SwPromoRewardExclProductType`. */
  readonly excludedProductType: ProductType;

  // --- Collaborator doubles ------------------------------------------------

  /**
   * The reward's label provider, with a call log.
   *
   * A hand-written recording double: no mocking library is installed, the legacy
   * suite had none either, and the dependency set is frozen at the thirteen exact
   * pins `package.json` declares. Deterministic and offline - it composes its answers from its input and
   * touches nothing.
   */
  readonly rewardLabelProvider: RecordingLabelProvider;

  // --- Census and traceability --------------------------------------------

  /**
   * The promotion family's validation-file census: four present, THREE ABSENT.
   *
   * ⭐ `PromotionQualifier.json`, `PromotionApplied.json` and
   * `PromotionAccount.json` DO NOT EXIST - verified by listing
   * `model/validation/` directly, not inferred. They are recorded as absent and
   * are NOT invented. Their absence confirms the plan's scope statement exactly.
   */
  readonly promotionValidationCensus: readonly ValidationFileCensusRow[];

  // The `issue_1766` regression-ticket identifier for the preserved return/exchange no-op
  // [model/service/PromotionService.cfc:L542-L544] is NOT published here. Provenance belongs to
  // tests/traceability/legacyTestMap.ts, which registers the preserved TODO and checks the ticket
  // against `src/services/promotionService.ts` itself; the BEHAVIOUR the TODO defers - a return or
  // exchange order yielding no intent at all - is proven in
  // tests/unit/services/promotionService.test.ts.

  // NET-NEW, NOT PARITY: no legacy test covers ANY promotion entity. That finding is NOT published
  // here as a boolean for consuming suites to assert back. It is owned by
  // tests/traceability/legacyTestMap.ts, where `legacyExtendedSuites` names the only two suites that
  // extend legacy coverage, block A7 pins the list to exactly those two, and block A14 accounts for
  // every suite on disk - so a suite claiming parity it does not have fails the ledger.
}

// ---------------------------------------------------------------------------
// Module-scope constants
//
// EVERY constant below is an immutable primitive - a `string`, a `number` or a
// `boolean` - or a frozen array or object of them. There is NO module-scope
// mutable state anywhere in this file: no counter, no ID sequence with
// cross-call memory, no registry, no lazily-cached instance, no shared entity.
// That is a hard requirement rather than a stylistic preference, and it is the
// direct target-side answer to a legacy hazard: on a warm Lambda container a
// module-level cache survives between unrelated requests, so the four
// component-level memos in this family - `Promotion.variables.currentFlag`, the
// four-spelling `promotionCode*Deletable*Flag`,
// `PromotionPeriod.variables.currentFlag` and `PromotionCode.variables.currentFlag` -
// become cross-request state if they are reproduced as module state. They are
// request-scoped in the target, and this fixture must never reintroduce the
// hazard through the back door of a shared fixture instance.
//
// ⭐ THE MEMO CHAIN IS THREE LEVELS DEEP: `Promotion.getCurrentFlag()`
// [model/entity/Promotion.cfc:L83-L92] reads
// `getCurrentPromotionPeriodFlag()` [L99] and `getCurrentPromotionCodeFlag()`
// [L113], which read `PromotionPeriod.getCurrentFlag()`
// [model/entity/PromotionPeriod.cfc:L137-L146] and
// `PromotionCode.getCurrentFlag()` [model/entity/PromotionCode.cfc:L85-L94]
// respectively - and EVERY level freezes on first read. Request-scoped that is
// harmless. As module state it would be poison.
// ---------------------------------------------------------------------------

/** Default identifier prefix, so a graph's IDs are recognisable in a failure message. */
const DEFAULT_ID_PREFIX = 'promofx';

// --- Instants -------------------------------------------------------------
//
// EVERY instant in this module is an explicit UTC ISO-8601 string literal.
// There is no `new Date()` with no argument, no `Date.now()`, no relative offset
// from the wall clock and no local-time literal anywhere. A promotion fixture
// whose currency answers move with the calendar cannot pin behaviour, and the
// nine-row date-bound truth table further down is computed against
// `NOW_UTC` specifically - so a moving clock would silently invalidate it.

/** The single instant every predicate in a graph is evaluated against. */
const NOW_UTC = '2024-06-15T12:00:00.000Z';

/** Two weeks before `NOW_UTC`, so `now` sits strictly inside the default window. */
const PERIOD_START_UTC = '2024-06-01T00:00:00.000Z';

/** Two weeks after `NOW_UTC`, likewise. */
const PERIOD_END_UTC = '2024-07-01T00:00:00.000Z';

/** A window that closed before `NOW_UTC` - both predicates agree it is not current. */
const EXPIRED_PERIOD_START_UTC = '2024-01-01T00:00:00.000Z';

/** ...and its end bound. */
const EXPIRED_PERIOD_END_UTC = '2024-02-01T00:00:00.000Z';

/**
 * A start bound AFTER `NOW_UTC`, used by the `endBeforeStart` row so that row is
 * invalid on the validation axis AND not-current on the predicate axis.
 */
const FUTURE_PERIOD_START_UTC = '2024-07-01T00:00:00.000Z';

/** Audit-column instants, matching the literals `./priceGroupFixtures` publishes. */
const CREATED_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';

/** ...and the modified counterpart. */
const MODIFIED_DATE_TIME_UTC = '2024-06-15T12:30:00.000Z';

// --- The reference calculation, as decimal STRINGS -------------------------
//
// P4 binds fixtures as well as production code: no raw floating-point operation
// on a monetary value appears anywhere here, not even inside an expected value.
// Every figure below is a literal a human can check against
// [model/service/PromotionService.cfc:L1017], and every one is fed to
// `Money.fromDecimalString` rather than to any numeric constructor - `money.ts`
// exposes no `fromNumber`, deliberately, and this module uses none.

/** The SKU unit price; also `./skuFixtures`' own default price. */
const REFERENCE_UNIT_PRICE = '19.99';

/** The order-item quantity. A COUNT, not money - so a plain `number` is correct. */
const REFERENCE_QUANTITY = 3;

/** 19.99 x 3. */
const REFERENCE_EXTENDED_PRICE = '59.97';

/** The `percentageOff` reward amount that drives the worked example. */
const REFERENCE_PERCENTAGE_OFF = '12.5';

/** 12.5 % of 59.97, unrounded and undrifted. */
const REFERENCE_DISCOUNT_AMOUNT = '7.49625';

/** 59.97 - 7.49625. */
const REFERENCE_NET_AMOUNT = '52.47375';

/** The net, presented through `numberFormat(v,"0.00")`. */
const REFERENCE_PRESENTED_NET_AMOUNT = '52.47';

/** The DISCOUNT, presented the same way - which is what L1017 actually formats. */
const REFERENCE_PRESENTED_DISCOUNT_AMOUNT = '7.50';

// --- Non-reference monetary and weight literals ---------------------------

/** A flat `amountOff` / fixed-`amount` figure. */
const FLAT_DISCOUNT_AMOUNT = '5.00';

/** A qualifier order-subtotal floor. */
const MINIMUM_ORDER_SUBTOTAL = '25.00';

/** A qualifier order-subtotal ceiling. */
const MAXIMUM_ORDER_SUBTOTAL = '500.00';

/** A qualifier item-price floor. */
const MINIMUM_ITEM_PRICE = '9.99';

/** A qualifier item-price ceiling. */
const MAXIMUM_ITEM_PRICE = '199.99';

/** A discount already applied to an order item, on the write-side row. */
const APPLIED_DISCOUNT_AMOUNT = '7.50';

/**
 * ⭐ WEIGHT, NOT MONEY. `hb_formatType="weight"`
 * [model/entity/PromotionQualifier.cfc:L63-L64] is not `hb_formatType="currency"`,
 * so these two are plain numbers and are never routed through `Money`. No
 * currency, no rounding rule and no price group applies to a weight, and
 * modelling one as money would invite exactly the category error the value
 * object exists to prevent.
 */
const MINIMUM_FULFILLMENT_WEIGHT = 1;

/** ⭐ WEIGHT, NOT MONEY - see above. */
const MAXIMUM_FULFILLMENT_WEIGHT = 50;

// --- Quantity gates (counts, therefore numbers) ---------------------------

const MINIMUM_ORDER_QUANTITY = 2;
const MAXIMUM_ORDER_QUANTITY = 20;
const MINIMUM_ITEM_QUANTITY = 1;
const MAXIMUM_ITEM_QUANTITY = 10;

// --- Use limits ------------------------------------------------------------

/**
 * The sentinel the ledger seeds every limit with
 * [model/service/PromotionService.cfc:L173-L179].
 *
 * Typed by `UnlimitedUseSentinel`, which is a TYPE alias over the literal and
 * carries no runtime value of its own, so the number is written once here and
 * the compiler rejects any other.
 */
const UNLIMITED_USE_SENTINEL: UnlimitedUseSentinel = 1000000;

/** A normal positive per-order bound - the only shape that overrides the sentinel. */
const BOUNDED_MAXIMUM_USE_PER_ORDER = 2;

/** A normal positive per-item bound. */
const BOUNDED_MAXIMUM_USE_PER_ITEM = 1;

/** A normal positive per-qualification bound. */
const BOUNDED_MAXIMUM_USE_PER_QUALIFICATION = 3;

/**
 * ⭐ An explicit ZERO limit.
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L180-L188]: the seeding
 *   block overrides a limit only when `!isNull(...) AND > 0`, so zero fails the
 *   test and the 1000000 sentinel survives - ZERO MEANS UNLIMITED, not
 *   "disabled". A merchant setting zero to switch a reward off gets the exact
 *   opposite.
 * Preserved deliberately; do not fix without a product decision.
 */
const ZERO_USE_LIMIT = 0;

/** A NEGATIVE limit, which takes the same fall-through as zero for the same reason. */
const NEGATIVE_USE_LIMIT = -1;

/** The period's own total-use cap [model/entity/PromotionPeriod.cfc:L55]. */
const PERIOD_MAXIMUM_USE_COUNT = 100;

/** The period's per-account cap [model/entity/PromotionPeriod.cfc:L56]. */
const PERIOD_MAXIMUM_ACCOUNT_USE_COUNT = 5;

/** The code's total-redemption cap [model/entity/PromotionCode.cfc:L56]. */
const CODE_MAXIMUM_USE_COUNT = 50;

/** The code's per-account cap [model/entity/PromotionCode.cfc:L57]. */
const CODE_MAXIMUM_ACCOUNT_USE_COUNT = 1;

// --- Ledger seeding figures -----------------------------------------------

/** `usedInOrder` for the entry that OVERRUNS its per-order limit, so L471 fires. */
const OVERUSED_USED_IN_ORDER = 4;

/** `usedInOrder` for the entry that stays within its limit. */
const WITHIN_LIMIT_USED_IN_ORDER = 1;

/** `discountQuantity` on the first order item's usage entry. */
const FIRST_USAGE_DISCOUNT_QUANTITY = 2;

/** `discountQuantity` on the second order item's usage entry. */
const SECOND_USAGE_DISCOUNT_QUANTITY = 1;

/**
 * `discountPerUseValue` on the FIRST usage entry - the SMALLER of the two.
 *
 * ⭐ Smaller deliberately: `orderItemsUsage` is insert-sorted ASCENDING by
 * `discountPerUseValue` [model/service/PromotionService.cfc:L301-L329], and both
 * inner searches in the over-use stripping loop run in REVERSE
 * [model/service/PromotionService.cfc:L482, L498], so the cheapest-per-use
 * discount is what gets stripped first. Two entries with equal values could not
 * distinguish a reverse scan from a forward one.
 */
const FIRST_USAGE_DISCOUNT_PER_USE_VALUE = '1.25';

/** `discountPerUseValue` on the SECOND usage entry - the LARGER of the two. */
const SECOND_USAGE_DISCOUNT_PER_USE_VALUE = '3.75';

// --- Vocabularies, verbatim from the source -------------------------------

/**
 * The five `rewardType` values IN EXACT SOURCE ORDER, from the vocabulary
 * comment at [model/entity/PromotionReward.cfc:L49-L56].
 *
 * ⚠️ AAP CORRECTION #1 in passing: those eight lines are the tail of a COMMENT
 * block, not the component declaration the plan cites at L49 - the declaration,
 * and therefore the preserved `hb_permission` typo, is at L57.
 */
const REWARD_TYPE_VOCABULARY: readonly string[] = Object.freeze([
  'merchandise',
  'subscription',
  'contentAccess',
  'fulfillment',
  'order',
]);

/**
 * The comma list the engine matches merchandise-side rewards against, VERBATIM
 * from [model/service/PromotionService.cfc:L198] - and the identical list the
 * qualifier side uses at [model/service/PromotionService.cfc:L793].
 *
 * Kept as ONE STRING rather than as an array because that is what the legacy
 * holds and because `listFindNoCase` takes a list; it is split with
 * `src/lib/cfml/list.ts` where an array is needed.
 */
const PASS_ONE_MERCHANDISE_REWARD_TYPE_LIST = 'merchandise,subscription,contentAccess';

/**
 * ⭐ The FOURTH pass-one reward type, matched by a SEPARATE test at
 * [model/service/PromotionService.cfc:L345] - `reward.getRewardType() eq
 * "fulfillment"` - rather than through the comma list above.
 */
const FULFILLMENT_REWARD_TYPE = 'fulfillment';

/**
 * ⭐ AAP CORRECTION #7: the ONLY reward type pass two handles, at
 * [model/service/PromotionService.cfc:L415].
 */
const ORDER_REWARD_TYPE = 'order';

/**
 * A MIXED-CASE reward type, which the legacy engine still treats as
 * `merchandise`.
 *
 * CFML parity [model/service/PromotionService.cfc:L198, L793]: both matching
 * sites use `listFindNoCase`, which is CASE-INSENSITIVE. TypeScript `===` is
 * not, so the divergence is real and this literal is how a suite proves the
 * target routes it the legacy way.
 */
const MIXED_CASE_MERCHANDISE_REWARD_TYPE = 'Merchandise';

/**
 * The three `amountType` values `getAmountTypeOptions()` offers a NON-order
 * reward [model/entity/PromotionReward.cfc:L120-L133].
 */
const AMOUNT_TYPE_VOCABULARY: readonly [AmountType, AmountType, AmountType] = Object.freeze([
  'percentageOff',
  'amountOff',
  'amount',
] as const);

/**
 * ⭐ The TWO it offers an `order` reward - the same accessor, conditional on
 * `rewardType`, withholding `amount`.
 */
const ORDER_REWARD_AMOUNT_TYPE_VOCABULARY: readonly [AmountType, AmountType] = Object.freeze([
  'percentageOff',
  'amountOff',
] as const);

/**
 * The STORED value for a fixed amount.
 *
 * CFML parity [model/entity/PromotionReward.cfc:L129]: the option's display key
 * is `define.fixedAmount` while its value is `amount`. Only the value is ever
 * assigned anywhere in this module.
 */
const FIXED_AMOUNT_AMOUNT_TYPE_VALUE: AmountType = 'amount';

/** That option's display key, recorded so the mismatch is visible - never assigned. */
const FIXED_AMOUNT_AMOUNT_TYPE_LABEL_KEY = 'define.fixedAmount';

/**
 * The `applicableTerm` vocabulary from `getApplicableTermOptions()`
 * [model/entity/PromotionReward.cfc:L112-L118]: exactly three values.
 */
const DEFAULT_APPLICABLE_TERM: ApplicableTerm = 'both';

/**
 * The `rewardMatchingType` vocabulary from `getRewardMatchingTypeOptions()`
 * [model/entity/PromotionQualifier.cfc:L107-L115].
 *
 * ⭐ AAP CORRECTION #6 lives here: this provider has NO declared property, while
 * the property declared at L99 has no provider. Neither half is invented.
 */
const REWARD_MATCHING_TYPE_VOCABULARY: readonly RewardMatchingType[] = Object.freeze([
  'any',
  'sku',
  'product',
  'productType',
  'brand',
]);

/** The default `rewardMatchingType` this graph carries. */
const DEFAULT_REWARD_MATCHING_TYPE: RewardMatchingType = 'sku';

/**
 * The `qualifierType` the default qualifier carries - the same three-value
 * merchandise vocabulary the reward side uses
 * [model/service/PromotionService.cfc:L793].
 */
const DEFAULT_QUALIFIER_TYPE = 'merchandise';

/**
 * The `appliedType` the engine actually writes.
 *
 * CFML parity [model/service/PromotionService.cfc:L528-L534]: the only value
 * `newPromotionApplied()` ever sets on the item path is `orderItem`. The union's
 * other two members exist because the column can hold them, not because this
 * code path writes them.
 */
const DEFAULT_APPLIED_TYPE: PromotionAppliedType = 'orderItem';

// --- Identifier and label literals ---------------------------------------

/** The gate identifier at [model/service/PromotionService.cfc:L197], legacy grammar intact. */
const LEGACY_QUALIFICATION_GATE_IDENTIFIER = 'qualificationsMeet';

/** The custom uniqueness validator wired by `model/validation/PromotionCode.json`. */
const UNIQUE_PROMOTION_CODE_VALIDATOR_NAME = 'hasUniquePromotionCode';

/** The named conditional both date-bearing validation schemas declare. */
const CONDITIONAL_DATE_VALIDATION_NAME = 'needsEndAfterStart';

/** The comparison that condition applies to `endDateTime`. */
const CONDITIONAL_DATE_VALIDATION_COMPARISON = 'gtProperty: startDateTime';

/** The lowercase parameter name the target uses for `PromotionCode.setPromotion`. */
const PROMOTION_CODE_SET_PROMOTION_PARAMETER_NAME = 'promotion';

/**
 * CFML parity [model/entity/Promotion.cfc:L56]: `activeFlag` declares
 * `default="1"`, so an absent column reads TRUE - the same as `Sku`, and unlike
 * `Product`, which declares no default at all.
 */
const ACTIVE_FLAG_ORM_DEFAULT = true;

/** The default promotion code value. Distinct by default; the collision is a separate exhibit. */
const DEFAULT_PROMOTION_CODE_VALUE = 'SAVE10';

/**
 * The COLLIDING code value.
 *
 * Differently cased on purpose: `hasUniquePromotionCode` normalises both sides
 * before comparing, because the legacy check is a MySQL `=` under a
 * case-insensitive collation, so `'save10'` and `'SAVE10'` collide in the legacy
 * system too. A same-cased collision would not prove the normalisation.
 */
const COLLIDING_PROMOTION_CODE_VALUE = 'save10';

// ---------------------------------------------------------------------------
// Frozen exhibit tables
//
// Each one turns a source finding into a value a suite can assert against. They
// are `Object.freeze`d and hold only primitives, so sharing them between graphs
// is safe - freezing is what makes "immutable primitive" true at runtime as well
// as in the type.
// ---------------------------------------------------------------------------

/** The migration's worked example, as decimal strings. */
const REFERENCE_CALCULATION: ReferenceCalculation = Object.freeze({
  unitPrice: REFERENCE_UNIT_PRICE,
  quantity: REFERENCE_QUANTITY,
  extendedPrice: REFERENCE_EXTENDED_PRICE,
  percentageOff: REFERENCE_PERCENTAGE_OFF,
  discountAmount: REFERENCE_DISCOUNT_AMOUNT,
  netAmount: REFERENCE_NET_AMOUNT,
  presentedNetAmount: REFERENCE_PRESENTED_NET_AMOUNT,
  presentedDiscountAmount: REFERENCE_PRESENTED_DISCOUNT_AMOUNT,
});

/**
 * ⭐ AAP CORRECTION #7, as data: FOUR reward types route into pass one and
 * EXACTLY ONE routes into pass two.
 *
 * The plan describes pass one as the merchandise list alone. It is not - the
 * `fulfillment` branch at [model/service/PromotionService.cfc:L345] sits inside
 * the same `!orderRewards` half of the loop, reached by a separate `eq` test
 * rather than through the comma list. Only [L415] is gated on `orderRewards`.
 */
const REWARD_TYPE_DISPATCH_MAP: readonly RewardTypeDispatchRow[] = Object.freeze([
  Object.freeze({
    rewardType: 'merchandise',
    pass: 'one',
    locator: 'model/service/PromotionService.cfc:L198',
    matchIsCaseInsensitive: true,
  }),
  Object.freeze({
    rewardType: 'subscription',
    pass: 'one',
    locator: 'model/service/PromotionService.cfc:L198',
    matchIsCaseInsensitive: true,
  }),
  Object.freeze({
    rewardType: 'contentAccess',
    pass: 'one',
    locator: 'model/service/PromotionService.cfc:L198',
    matchIsCaseInsensitive: true,
  }),
  Object.freeze({
    rewardType: FULFILLMENT_REWARD_TYPE,
    pass: 'one',
    locator: 'model/service/PromotionService.cfc:L345',
    matchIsCaseInsensitive: false,
  }),
  Object.freeze({
    rewardType: ORDER_REWARD_TYPE,
    pass: 'two',
    locator: 'model/service/PromotionService.cfc:L415',
    matchIsCaseInsensitive: false,
  }),
] as const);

/**
 * All FOURTEEN of the reward's many-to-many link tables, with the `type="array"`
 * census.
 *
 * ⭐ THREE declare it - `eligiblePriceGroups`, `excludedBrands` and
 * `excludedOptions`. Eleven do not. The target normalises all fourteen to arrays,
 * and this table is the record of what the source actually says so the
 * normalisation is auditable rather than assumed.
 */
const REWARD_MANY_TO_MANY_COLLECTIONS: readonly RewardManyToManyCollection[] = Object.freeze([
  Object.freeze({
    property: 'eligiblePriceGroups',
    linkTable: 'SwPromoRewardEligiblePriceGrp',
    declaresTypeArray: true,
    locator: 'model/entity/PromotionReward.cfc:L74',
  }),
  Object.freeze({
    property: 'fulfillmentMethods',
    linkTable: 'SwPromoRewardFulfillmentMethod',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L76',
  }),
  Object.freeze({
    property: 'shippingAddressZones',
    linkTable: 'SwPromoRewardShipAddressZone',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L77',
  }),
  Object.freeze({
    property: 'shippingMethods',
    linkTable: 'SwPromoRewardShippingMethod',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L78',
  }),
  Object.freeze({
    property: 'brands',
    linkTable: 'SwPromoRewardBrand',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L80',
  }),
  Object.freeze({
    property: 'options',
    linkTable: 'SwPromoRewardOption',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L81',
  }),
  Object.freeze({
    property: 'skus',
    linkTable: 'SwPromoRewardSku',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L82',
  }),
  Object.freeze({
    property: 'products',
    linkTable: 'SwPromoRewardProduct',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L83',
  }),
  Object.freeze({
    property: 'productTypes',
    linkTable: 'SwPromoRewardProductType',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L84',
  }),
  Object.freeze({
    property: 'excludedBrands',
    linkTable: 'SwPromoRewardExclBrand',
    declaresTypeArray: true,
    locator: 'model/entity/PromotionReward.cfc:L86',
  }),
  Object.freeze({
    property: 'excludedOptions',
    linkTable: 'SwPromoRewardExclOption',
    declaresTypeArray: true,
    locator: 'model/entity/PromotionReward.cfc:L87',
  }),
  Object.freeze({
    property: 'excludedSkus',
    linkTable: 'SwPromoRewardExclSku',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L88',
  }),
  Object.freeze({
    property: 'excludedProducts',
    linkTable: 'SwPromoRewardExclProduct',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L89',
  }),
  Object.freeze({
    property: 'excludedProductTypes',
    linkTable: 'SwPromoRewardExclProductType',
    declaresTypeArray: false,
    locator: 'model/entity/PromotionReward.cfc:L90',
  }),
] as const);

/**
 * The qualifier's many-to-many count: THIRTEEN, over `SwPromoQual*` link tables.
 *
 * One fewer than the reward's fourteen, and the missing one is
 * `eligiblePriceGroups` - a reward can be restricted to a price group, a
 * qualifier cannot. The qualifier repeats the same declaration inconsistency:
 * only `excludedBrands` [model/entity/PromotionQualifier.cfc:L83] and
 * `excludedOptions` [L84] declare `type="array"`.
 */
const QUALIFIER_MANY_TO_MANY_COLLECTION_COUNT = 13;

/**
 * ⭐ The ten qualifier gates' ASYMMETRIC null semantics and format types
 * [model/entity/PromotionQualifier.cfc:L55-L64].
 *
 * Every `minimum*` declares `hb_nullRBKey="define.0"`; every `maximum*` declares
 * `hb_nullRBKey="define.unlimited"`. The four subtotal and price gates declare
 * `hb_formatType="currency"` and are `Money`; the two weight gates declare
 * `hb_formatType="weight"` and are PLAIN NUMBERS. The four quantity gates declare
 * no format type at all and are counts.
 */
const QUALIFIER_GATE_NULL_DEFAULTS: readonly QualifierGateNullDefault[] = Object.freeze([
  Object.freeze({
    gate: 'minimumOrderQuantity',
    bound: 'minimum',
    nullRBKey: 'define.0',
    formatType: 'none',
    isMonetary: false,
  }),
  Object.freeze({
    gate: 'maximumOrderQuantity',
    bound: 'maximum',
    nullRBKey: 'define.unlimited',
    formatType: 'none',
    isMonetary: false,
  }),
  Object.freeze({
    gate: 'minimumOrderSubtotal',
    bound: 'minimum',
    nullRBKey: 'define.0',
    formatType: 'currency',
    isMonetary: true,
  }),
  Object.freeze({
    gate: 'maximumOrderSubtotal',
    bound: 'maximum',
    nullRBKey: 'define.unlimited',
    formatType: 'currency',
    isMonetary: true,
  }),
  Object.freeze({
    gate: 'minimumItemQuantity',
    bound: 'minimum',
    nullRBKey: 'define.0',
    formatType: 'none',
    isMonetary: false,
  }),
  Object.freeze({
    gate: 'maximumItemQuantity',
    bound: 'maximum',
    nullRBKey: 'define.unlimited',
    formatType: 'none',
    isMonetary: false,
  }),
  Object.freeze({
    gate: 'minimumItemPrice',
    bound: 'minimum',
    nullRBKey: 'define.0',
    formatType: 'currency',
    isMonetary: true,
  }),
  Object.freeze({
    gate: 'maximumItemPrice',
    bound: 'maximum',
    nullRBKey: 'define.unlimited',
    formatType: 'currency',
    isMonetary: true,
  }),
  // ⭐ WEIGHT IS NOT CURRENCY. `isMonetary: false` on both rows below is the
  // whole point of the column: a weight gate must never be routed through
  // `Money`, because no currency, rounding rule or price group applies to it.
  Object.freeze({
    gate: 'minimumFulfillmentWeight',
    bound: 'minimum',
    nullRBKey: 'define.0',
    formatType: 'weight',
    isMonetary: false,
  }),
  Object.freeze({
    gate: 'maximumFulfillmentWeight',
    bound: 'maximum',
    nullRBKey: 'define.unlimited',
    formatType: 'weight',
    isMonetary: false,
  }),
] as const);

/**
 * ⭐⭐⭐ THE NINE DATE-BOUND SHAPES, WITH BOTH PREDICATES' OUTCOMES.
 *
 * Every outcome below is computed against `NOW_UTC` and was read off the ported
 * implementations rather than inferred:
 *
 *   `isCurrent(now)`      - start-INCLUSIVE (`<=`), end-EXCLUSIVE (`>`), NO null
 *                           guard on either bound, `now` captured once. It
 *                           RAISES on an absent bound, reproducing the fact that
 *                           CFML comparing null to a date is a runtime error.
 *   `getCurrentFlag()`    - null-SAFE (absent means forever), end-INCLUSIVE
 *                           (negated `<`), calls `now()` TWICE inline, and
 *                           MEMOIZES its first answer for the object's lifetime.
 *
 * ⭐ ROW `nowAtEndDateTime` IS THE DIVERGENCE: at the exact `endDateTime`
 * instant `isCurrent()` says NOT current and `getCurrentFlag()` says current.
 * Two predicates on one entity answering the same question differently is a
 * defect, and it is newly catalogued: the plan's published twenty do not carry it,
 * and it is DELIBERATELY LEFT UNNUMBERED in the port's thirty-entry register - that
 * set is closed at thirty, and this is an observation about fixture-facing behaviour
 * rather than a legacy defect the port must reproduce. See the number-to-locator index
 * in `tests/unit/domain/entities/promotionReward.test.ts`.
 *
 * `satisfiesNeedsEndAfterStart` answers a DIFFERENT question - whether
 * `model/validation/PromotionPeriod.json`'s named condition ACCEPTS the shape.
 * The condition only fires when BOTH bounds are present, so every absent-bound
 * row is accepted; only the two rows where end is not strictly after start are
 * rejected.
 */
const PERIOD_DATE_BOUNDS_CASES: readonly PeriodDateBoundsCase[] = Object.freeze([
  Object.freeze({
    name: 'nowStrictlyInside',
    startDateTimeUTC: PERIOD_START_UTC,
    endDateTimeUTC: PERIOD_END_UTC,
    isCurrentOutcome: true,
    getCurrentFlagOutcome: true,
    satisfiesNeedsEndAfterStart: true,
    note: 'The default shape. Both predicates agree, so it isolates every other axis.',
  }),
  Object.freeze({
    name: 'nowAtStartDateTime',
    startDateTimeUTC: NOW_UTC,
    endDateTimeUTC: PERIOD_END_UTC,
    isCurrentOutcome: true,
    getCurrentFlagOutcome: true,
    satisfiesNeedsEndAfterStart: true,
    note:
      'The START boundary. isCurrent uses `<=` so equality is inside, and ' +
      'getCurrentFlag negates `>` so equality is inside there too. They AGREE ' +
      'at the start instant - which is what makes the end instant notable.',
  }),
  Object.freeze({
    name: 'nowAtEndDateTime',
    startDateTimeUTC: PERIOD_START_UTC,
    endDateTimeUTC: NOW_UTC,
    isCurrentOutcome: false,
    getCurrentFlagOutcome: true,
    satisfiesNeedsEndAfterStart: true,
    note:
      '⭐ THE DIVERGENCE. isCurrent requires `end > now` and gets equality, so ' +
      'FALSE. getCurrentFlag rejects only `end < now` and gets equality, so ' +
      'TRUE. One entity, one question, two answers.',
  }),
  Object.freeze({
    name: 'startDateTimeAbsent',
    startDateTimeUTC: undefined,
    endDateTimeUTC: PERIOD_END_UTC,
    isCurrentOutcome: 'throws',
    getCurrentFlagOutcome: true,
    satisfiesNeedsEndAfterStart: true,
    note:
      'FOREVER-PAST. hb_nullRBKey="define.forever" says an absent start means ' +
      'no lower bound; getCurrentFlag honours it, isCurrent dereferences the ' +
      'null and raises.',
  }),
  Object.freeze({
    name: 'endDateTimeAbsent',
    startDateTimeUTC: PERIOD_START_UTC,
    endDateTimeUTC: undefined,
    isCurrentOutcome: 'throws',
    getCurrentFlagOutcome: true,
    satisfiesNeedsEndAfterStart: true,
    note: 'FOREVER-FUTURE. Same asymmetry, on the other bound.',
  }),
  Object.freeze({
    name: 'bothBoundsAbsent',
    startDateTimeUTC: undefined,
    endDateTimeUTC: undefined,
    isCurrentOutcome: 'throws',
    getCurrentFlagOutcome: true,
    satisfiesNeedsEndAfterStart: true,
    note: 'ALWAYS CURRENT per the metadata. isCurrent cannot express it at all.',
  }),
  Object.freeze({
    name: 'fullyExpired',
    startDateTimeUTC: EXPIRED_PERIOD_START_UTC,
    endDateTimeUTC: EXPIRED_PERIOD_END_UTC,
    isCurrentOutcome: false,
    getCurrentFlagOutcome: false,
    satisfiesNeedsEndAfterStart: true,
    note:
      'A closed window. Both predicates agree it is not current, and isExpired() ' +
      'agrees too - it examines only the end bound.',
  }),
  Object.freeze({
    name: 'endBeforeStart',
    startDateTimeUTC: FUTURE_PERIOD_START_UTC,
    endDateTimeUTC: PERIOD_START_UTC,
    isCurrentOutcome: false,
    getCurrentFlagOutcome: false,
    satisfiesNeedsEndAfterStart: false,
    note:
      'INVALID BY VALIDATION. needsEndAfterStart requires end strictly greater ' +
      'than start when both are present; this inverts them. Persistable all the ' +
      'same, which is why it needs a fixture.',
  }),
  Object.freeze({
    name: 'endEqualsStart',
    startDateTimeUTC: PERIOD_START_UTC,
    endDateTimeUTC: PERIOD_START_UTC,
    isCurrentOutcome: false,
    getCurrentFlagOutcome: false,
    satisfiesNeedsEndAfterStart: false,
    note:
      'ALSO INVALID BY VALIDATION: `gtProperty` is STRICTLY greater, so equal ' +
      'bounds are rejected. A zero-width window, and the boundary case a ' +
      '`>=` reading of the rule would wrongly accept.',
  }),
] as const);

/**
 * ⚠️⚠️ AAP CORRECTION #3 AND AAP CORRECTION #2, as data.
 *
 * AAP CORRECTION #3: the promotion period ships TWO non-equivalent currency
 *     predicates, and their differences are enumerated field by field below.
 *
 * AAP CORRECTION #2: `isCurrent()` IS DEAD CODE. A repo-wide grep for
 *     `isCurrent()` across every `.cfc` and `.cfm` in the legacy tree returns
 *     EXACTLY ONE hit - its own declaration at
 *     [model/entity/PromotionPeriod.cfc:L78]. It has no caller anywhere. The
 *     predicate the engine actually consults is `getCurrentFlag()`,
 *     reached through `Promotion.getCurrentPromotionPeriodFlag()`
 *     [model/entity/Promotion.cfc:L99].
 *
 *     The plan states that `isCurrent()` is ported with a widened `isCurrent(now:
 *     Date)` signature and calls that "the only widening in the entity layer".
 *     The widening is real and is the right call - it is what makes the dead
 *     predicate deterministically testable - but the plan's premise that
 *     `isCurrent()` is the engine's predicate is wrong, and a suite that pins
 *     currency behaviour through `isCurrent()` alone would be pinning code the
 *     engine never runs.
 */
const PERIOD_PREDICATE_CONTRAST: PeriodPredicateContrast = Object.freeze({
  deadPredicate: 'isCurrent',
  deadPredicateLocator: 'model/entity/PromotionPeriod.cfc:L78-L81',
  livePredicate: 'getCurrentFlag',
  livePredicateLocator: 'model/entity/PromotionPeriod.cfc:L137-L146',
  livePredicateCallPath: Object.freeze([
    'model/entity/Promotion.cfc:L83-L92 getCurrentFlag',
    'model/entity/Promotion.cfc:L99 getCurrentPromotionPeriodFlag',
    'model/entity/PromotionPeriod.cfc:L137-L146 getCurrentFlag',
  ]),
  deadPredicateGuardsNullBounds: false,
  livePredicateGuardsNullBounds: true,
  deadPredicateEndBoundInclusive: false,
  livePredicateEndBoundInclusive: true,
  deadPredicateNowCallCount: 1,
  livePredicateNowCallCount: 2,
  livePredicateMemoizes: true,
});

/**
 * ⭐ AAP CORRECTION #5, as data: the FOUR-SPELLING memo defect on
 * `getPromotionCodesDeletableFlag`.
 *
 * LEGACY-DEFECT [model/entity/Promotion.cfc:L79, L123-L133]: the property is
 *   DECLARED plural (`promotionCodesDeletableFlag`, L79), the existence guard
 *   tests SINGULAR (`promotionCodeDeletableFlag`, L124), and the assignments and
 *   the return use SINGULAR PLUS A STRAY `e`
 *   (`promotionCodeDeleteableFlag`, L125/L128/L133). Three distinct spellings
 *   across five sites, so THE MEMO CAN NEVER HIT: every call re-runs the full
 *   loop over every promotion code.
 * Preserved deliberately; do not fix without a product decision.
 *
 * ⭐ AND IT IS ON A VALIDATED PATH. `model/validation/Promotion.json:L5` wires
 * `"promotionCodes": [{"contexts":"delete","method":"getPromotionCodesDeletableFlag"}]`,
 * so the defective accessor IS the delete-validation gate. The returned VALUE is
 * correct - the loop computes the right answer each time - but the cost is real
 * and paid on every delete validation. Not among the plan's published twenty, and
 * deliberately left unnumbered in the port's thirty-entry register for the same reason
 * as the `nowAtEndDateTime` row above; structurally the same shape as numbered entry 19
 * [model/entity/Product.cfc:L524-L532], but three-way rather than
 * two-way.
 *
 * The target normalises the spelling as a documented deliberate divergence: the
 * discrepancy is unobservable through the public contract, and the memo is
 * request-scoped anyway.
 */
const PROMOTION_CODES_DELETABLE_FLAG_DEFECT: PromotionCodesDeletableFlagDefect = Object.freeze({
  methodName: 'getPromotionCodesDeletableFlag',
  declaredPropertyName: 'promotionCodesDeletableFlag',
  guardedKeyName: 'promotionCodeDeletableFlag',
  assignedKeyName: 'promotionCodeDeleteableFlag',
  distinctSpellingCount: 3,
  memoCanEverHit: false,
  validationLocator: 'model/validation/Promotion.json:L5',
  portedAccessorRaisesOnMaterializedCode: true,
  requiredCrossFileFollowUp:
    'Declare isDeletable(): boolean on src/domain/entities/promotionCode.ts, ' +
    'reproducing org/Hibachi/HibachiEntity.cfc:L204-L206 over the delete-context ' +
    'rule model/validation/PromotionCode.json declares as ' +
    '"orders": [{"contexts":"delete","maxCollection":0}], counted over the ' +
    'already-materialized getOrders() collection.',
});

/**
 * ⭐ AAP CORRECTION #6, as data: the qualifier's option-list property/accessor
 * MISMATCH.
 *
 * LEGACY-DEFECT [model/entity/PromotionQualifier.cfc:L99, L107-L115]: the
 *   non-persistent property declared at L99 is `qualifierApplicationTypeOptions`,
 *   and NO `getQualifierApplicationTypeOptions()` exists anywhere in the
 *   component. Conversely `getRewardMatchingTypeOptions()` at L107-L115 has NO
 *   matching property declaration - the persistent property it serves is
 *   `rewardMatchingType` at L65. One declared option list with no provider, one
 *   provider with no declared property.
 * Preserved deliberately; do not fix without a product decision.
 *
 * NEITHER HALF IS INVENTED here: no `qualifierApplicationTypeOptions` provider is
 * written, and no property declaration is fabricated for the orphaned accessor.
 */
const QUALIFIER_OPTION_LIST_MISMATCH: QualifierOptionListMismatch = Object.freeze({
  declaredPropertyWithoutProvider: 'qualifierApplicationTypeOptions',
  declaredPropertyLocator: 'model/entity/PromotionQualifier.cfc:L99',
  providerWithoutDeclaredProperty: 'getRewardMatchingTypeOptions',
  providerLocator: 'model/entity/PromotionQualifier.cfc:L107-L115',
  providerServesProperty: 'rewardMatchingType',
});

/**
 * ⭐ The promotion family's validation-file census: FOUR PRESENT, THREE ABSENT.
 *
 * Verified by listing `model/validation/` directly rather than inferred. The
 * three absences confirm the plan's scope statement exactly, and they are
 * recorded as absent rather than filled in - inventing a `PromotionQualifier.json`
 * would fabricate a constraint the legacy system never enforced.
 *
 * Two findings worth carrying alongside the census:
 *
 *   * `PromotionReward.json` makes BOTH `amountType` AND `amount` required in the
 *     `save` context, while all three `maximumUse*` columns are declared merely
 *     `dataType: "numeric"` and are NOT required - which independently
 *     corroborates that null-means-unlimited is the validated, legitimate shape
 *     and not an oversight.
 *   * `PromotionCode.json` and `PromotionPeriod.json` both declare the
 *     `needsEndAfterStart` condition, under which `endDateTime` must be
 *     `gtProperty: "startDateTime"` - the same conditional-requiredness machinery
 *     the plan flags for `Product_UpdateSkus.json`.
 */
const PROMOTION_VALIDATION_CENSUS: readonly ValidationFileCensusRow[] = Object.freeze([
  Object.freeze({
    entity: 'Promotion',
    validationFile: 'model/validation/Promotion.json',
    present: true,
    lineCount: 6,
  }),
  Object.freeze({
    entity: 'PromotionCode',
    validationFile: 'model/validation/PromotionCode.json',
    present: true,
    lineCount: 14,
  }),
  Object.freeze({
    entity: 'PromotionPeriod',
    validationFile: 'model/validation/PromotionPeriod.json',
    present: true,
    lineCount: 11,
  }),
  Object.freeze({
    entity: 'PromotionReward',
    validationFile: 'model/validation/PromotionReward.json',
    present: true,
    lineCount: 8,
  }),
  // The three absences. `lineCount` is `undefined` rather than `0`, because `0`
  // would assert an empty file exists where in fact no file does.
  Object.freeze({
    entity: 'PromotionQualifier',
    validationFile: 'model/validation/PromotionQualifier.json',
    present: false,
    lineCount: undefined,
  }),
  Object.freeze({
    entity: 'PromotionApplied',
    validationFile: 'model/validation/PromotionApplied.json',
    present: false,
    lineCount: undefined,
  }),
  Object.freeze({
    entity: 'PromotionAccount',
    validationFile: 'model/validation/PromotionAccount.json',
    present: false,
    lineCount: undefined,
  }),
] as const);

// ---------------------------------------------------------------------------
// Override resolution
// ---------------------------------------------------------------------------

/**
 * Reads one override, distinguishing an OMITTED key from a key written with the
 * value `undefined`.
 *
 * ★ WHY THIS EXISTS RATHER THAN `overrides?.key ?? documentedDefault`. Several
 * members of this factory are supplied BY DEFAULT and nonetheless have a
 * meaningful ABSENT state, and every one of them is a column whose absence the
 * legacy metadata gives a documented meaning to:
 *
 *   * `promotionPeriodStartDateTime` / `promotionPeriodEndDateTime` and their
 *     promotion-code counterparts - `hb_nullRBKey="define.forever"`
 *     [model/entity/PromotionPeriod.cfc:L53-L54].
 *   * the three reward `maximumUse*` limits and the four period/code use counts -
 *     `hb_nullRBKey="define.unlimited"` [model/entity/PromotionReward.cfc:L65-L67].
 *   * `rewardAmount` - NO ORM default at all [model/entity/PromotionReward.cfc:L61].
 *   * `roundingRule` - `hb_optionsNullRBKey="define.none"` [model/entity/PromotionReward.cfc:L71].
 *
 * With `??` a caller could never reach any of those states, because an explicit
 * `undefined` would be silently replaced by the default - and "unlimited" quietly
 * becoming "capped at 2" is precisely the class of substitution this port exists
 * to avoid. `Object.hasOwn` separates the two intents exactly: omit the key to
 * accept the documented default, write it as `undefined` to ask for absence.
 *
 * `??` remains the right operator where a default is simply a value and absence
 * carries no distinct meaning, and it is used directly at those sites rather than
 * routed through here.
 */
function resolveOverride<TKey extends keyof PromotionFixtureOverrides>(
  overrides: PromotionFixtureOverrides | undefined,
  key: TKey,
  documentedDefault: PromotionFixtureOverrides[TKey],
): PromotionFixtureOverrides[TKey] {
  if (hasOverride(overrides, key)) {
    return overrides?.[key];
  }

  return documentedDefault;
}

/**
 * Was `key` written by the caller at all, whatever value it carries?
 *
 * The companion to `resolveOverride`, used wherever a default has to be
 * CONSTRUCTED rather than merely named - the rounding rule and the eligible price
 * groups, both of which are built by calling into `./priceGroupFixtures`.
 * Building those eagerly just to discard them would construct objects no graph
 * ever owns, so the presence test is separated from the read.
 */
function hasOverride(
  overrides: PromotionFixtureOverrides | undefined,
  key: keyof PromotionFixtureOverrides,
): boolean {
  return overrides !== undefined && Object.hasOwn(overrides, key);
}

// ---------------------------------------------------------------------------
// Module-scope pure builders
//
// Functions, never data. Each returns a FRESHLY constructed value on every call,
// so no array, no object, no `Date` and no collaborator double is ever shared
// between two graphs.
//
// That is what lets a suite prove the property the port actually needs: because
// `Promotion.getCurrentFlag()`, `PromotionPeriod.getCurrentFlag()` and
// `PromotionCode.getCurrentFlag()` all MEMOIZE, a second independent invocation
// must not observe the first invocation's frozen answer. Fresh instances per call
// make that assertable rather than assumed - and it is the same reason every
// legacy component-level cache became per-request state in the target rather than
// module state on a warm container.
// ---------------------------------------------------------------------------

/**
 * A fresh `Date` from an explicit UTC ISO-8601 literal.
 *
 * Fresh rather than shared because `Date` is MUTABLE: handing the same instance
 * to two graphs would let one suite's `setUTCHours` reach another's. There is no
 * `new Date()` with no argument and no `Date.now()` in this module.
 */
function makeInstant(isoUTC: string): Date {
  return new Date(isoUTC);
}

/**
 * The clock closure `PromotionPeriod` and `PromotionCode` require - both declare
 * `now: () => Date` as a NON-optional constructor slot.
 *
 * Returns a fresh `Date` on every call, so the two inline `now()` reads that
 * `getCurrentFlag()` performs [model/entity/PromotionPeriod.cfc:L140] both see
 * the same instant while neither can mutate the other's value. The legacy method
 * is non-atomic by construction - two textual `now()` calls straddling a `||` -
 * and reproducing the CALL COUNT faithfully while pinning the INSTANT is what
 * makes that reproducible instead of flaky.
 *
 * Takes the instant rather than the literal so that a caller who overrides `now`
 * gets a clock that agrees with it. `getTime()` is read once and closed over, so
 * mutating the `Date` that was passed in cannot retroactively move the clock.
 */
function makeClock(instant: Date): () => Date {
  const epochMilliseconds: number = instant.getTime();

  return (): Date => new Date(epochMilliseconds);
}

/** A deterministic identifier, derived from the caller's own prefix. */
function makeId(idPrefix: string, suffix: string): string {
  return `${idPrefix}-${suffix}`;
}

/**
 * A fresh MUTABLE copy of a readonly array.
 *
 * ★ DEFENSIVE COPYING IS MANDATORY HERE, and the reason is a genuine CFML/TypeScript
 * semantic gap rather than tidiness. [model/service/PriceGroupService.cfc:L276]
 * does `var priceGroups = account.getPriceGroups();` and then `arrayAppend`s to it
 * at L282 - and because CFML COPIES ARRAYS BY VALUE the account's own collection
 * is left untouched. The identical two lines in TypeScript would MUTATE the
 * account. Every collection this module hands to an entity constructor or exposes
 * on the graph is therefore copied, so a suite that splices one cannot reach
 * another suite's graph or the sibling fixture module it came from.
 *
 * The copy is intentionally mutable: `PromotionReward` and `PromotionQualifier`
 * both declare their collection slots `T[]` rather than `readonly T[]`, because
 * their bidirectional helpers splice the live array.
 */
function copyOf<TElement>(source: readonly TElement[]): TElement[] {
  return [...source];
}

/**
 * A structural node for materialized-path construction.
 *
 * // JUDGMENT CALL: paths are built from a plain linked chain rather than from
 * entity instances, for two reasons. `categoryIDPath` is one of the three paths
 * the membership tests walk, and `Category` is NOT on this fixture's dependency
 * whitelist - so an entity-based builder could not produce it at all without
 * reaching outside the allowed import set. And a `ProductType` cannot be
 * constructed with its own path until the path is known, which is circular: the
 * chain is resolved first, then the entities are built carrying the result.
 */
type IdPathNode = {
  readonly id: string;
  readonly parent: IdPathNode | undefined;
};

/** The primary-ID accessor `buildIdPathList` needs. */
function readIdPathNodeID(node: IdPathNode): string {
  return node.id;
}

/** The parent accessor `buildIdPathList` needs. */
function readIdPathNodeParent(node: IdPathNode): IdPathNode | undefined {
  return node.parent;
}

/**
 * Builds a comma-delimited materialized ID path, ROOT FIRST, from root-first IDs.
 *
 * Delegates to `buildIdPathList` from `src/domain/valueObjects/materializedIdPath.ts`
 * rather than joining with a literal comma, so the delimiter, the root-first
 * ordering and the include-self property all come from the one implementation the
 * engine's own membership walks use
 * [model/service/PromotionService.cfc:L858-L870, L921-L985]. A hand-written
 * `join(',')` here would be a second implementation of the same contract, free to
 * drift.
 *
 * @throws when handed an empty list, because a materialized path is never empty -
 *   a node's own identifier is always the last element.
 */
function buildIdPathFromIds(rootFirstIds: readonly string[]): string {
  let cursor: IdPathNode | undefined;

  // Built by iteration rather than by index: `noUncheckedIndexedAccess` makes
  // every `ids[i]` a `string | undefined`, and guarding a bound this loop already
  // guarantees would be noise.
  for (const id of rootFirstIds) {
    cursor = { id, parent: cursor };
  }

  if (cursor === undefined) {
    throw new Error(
      'buildIdPathFromIds requires at least one identifier: a materialized ID ' +
        'path always includes the node it belongs to, so an empty path is not a ' +
        'representable state. See src/domain/valueObjects/materializedIdPath.ts.',
    );
  }

  return buildIdPathList(cursor, readIdPathNodeID, readIdPathNodeParent);
}

/**
 * A three-level product-type chain, exposed by NAME rather than by position.
 *
 * // JUDGMENT CALL: named members instead of a tuple. `noUncheckedIndexedAccess`
 * types every element of an array as possibly `undefined`, so a positional return
 * would force either a guard per read or a postfix `!` - and this module uses no
 * non-null assertions at all. Naming the three levels removes the question.
 */
type ProductTypeChain = {
  /** Depth 1. Its `productTypeIDPath` is its own identifier alone. */
  readonly root: ProductType;

  /** Depth 2. Path is `<root>,<parent>`. */
  readonly parent: ProductType;

  /** Depth 3 - the node a membership test starts from. Path is `<root>,<parent>,<leaf>`. */
  readonly leaf: ProductType;

  /** All three, root first, for a suite that wants to walk them. */
  readonly rootFirst: readonly ProductType[];
};

/**
 * A THREE-LEVEL product-type chain, returned ROOT FIRST.
 *
 * ⭐ Depth is load-bearing. A one-level chain makes `productTypeIDPath` a single
 * identifier, and a path-containment test over a single identifier passes for the
 * wrong reason - it cannot tell "the leaf is inside this subtree" from "the leaf
 * IS this node". The qualifier and reward membership walks at
 * [model/service/PromotionService.cfc:L858-L870] and :L921-L985 are only
 * genuinely exercised by a multi-level path, so three levels is the minimum
 * useful depth and is what this builds.
 *
 * Each node carries its own correctly-scoped `productTypeIDPath`, computed from
 * the chain above it, and the parent links are wired downward while the child
 * links are wired back upward through the live collection accessor - which is
 * what `getChildProductTypes()` returns.
 */
function makeProductTypeChain(idPrefix: string): ProductTypeChain {
  const rootID = makeId(idPrefix, 'product-type-root');
  const parentID = makeId(idPrefix, 'product-type-parent');
  const leafID = makeId(idPrefix, 'product-type-leaf');

  const root = new ProductType({
    productTypeID: rootID,
    productTypeIDPath: buildIdPathFromIds([rootID]),
    productTypeName: 'Merchandise',
    urlTitle: 'merchandise',
    activeFlag: true,
    publishedFlag: true,
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
  });

  const parent = new ProductType({
    productTypeID: parentID,
    productTypeIDPath: buildIdPathFromIds([rootID, parentID]),
    productTypeName: 'Apparel',
    urlTitle: 'apparel',
    activeFlag: true,
    publishedFlag: true,
    parentProductType: root,
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
  });

  const leaf = new ProductType({
    productTypeID: leafID,
    productTypeIDPath: buildIdPathFromIds([rootID, parentID, leafID]),
    productTypeName: 'Footwear',
    urlTitle: 'footwear',
    activeFlag: true,
    publishedFlag: true,
    parentProductType: parent,
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
  });

  // The child side is wired through the LIVE collection accessor, which is how
  // the entity's own bidirectional helpers maintain it. Not copied here,
  // deliberately: a copy would make the wiring a silent no-op.
  root.getChildProductTypes().push(parent);
  parent.getChildProductTypes().push(leaf);

  return { root, parent, leaf, rootFirst: [root, parent, leaf] };
}

/**
 * A SEPARATE product-type node for the EXCLUSION side, outside the chain above.
 *
 * Outside deliberately: an exclusion that shares a subtree with the inclusion it
 * is meant to override cannot demonstrate exclusion at all, because the path
 * walk would match both.
 */
function makeExcludedProductType(idPrefix: string): ProductType {
  const excludedID = makeId(idPrefix, 'product-type-excluded');

  return new ProductType({
    productTypeID: excludedID,
    productTypeIDPath: buildIdPathFromIds([excludedID]),
    productTypeName: 'Clearance',
    urlTitle: 'clearance',
    activeFlag: true,
    publishedFlag: true,
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
  });
}

/**
 * The reward's label-provider double, recording every reward-type label request.
 *
 * A hand-written recording double rather than a library mock: no mocking library
 * is installed, the frozen dependency set is exactly the thirteen pins
 * `package.json` declares, and the
 * legacy suite had no mocking library either. Deterministic and entirely offline -
 * it composes its answers from its own input and touches nothing.
 *
 * The answers mirror the resource-bundle keys the legacy formatter would resolve:
 * `entity.promotionReward` [model/entity/PromotionReward.cfc:L107] and the
 * value-dependent `entity.promotionReward.rewardType.<value>` reached through
 * `hb_formatType="rbKey"` on [L63]. The KEYS are preserved verbatim as strings
 * because the legacy admin still resolves them; no i18n runtime is introduced.
 */
function makeRecordingLabelProvider(): RecordingLabelProvider {
  const rewardTypeLabelCalls: RecordedRewardTypeLabelCall[] = [];

  return {
    getPromotionRewardEntityLabel(): string {
      return 'entity.promotionReward';
    },
    getRewardTypeLabel(rewardType: string): string {
      rewardTypeLabelCalls.push({ rewardType });

      return `entity.promotionReward.rewardType.${rewardType}`;
    },
    rewardTypeLabelCalls,
  };
}

/**
 * One `SwPromotionCodeAccount` link, as a narrow structural double.
 *
 * ⭐ The far side is the OUT-OF-SCOPE `Account` entity, so the double carries an
 * OPAQUE `accountID` string and exactly the members the code's bidirectional
 * helpers reach - never a real account object and never an account service call.
 * Its `getPromotionCodes()` returns its own LIVE array, because
 * [model/entity/PromotionCode.cfc:L127] mutates the far side's collection through
 * that accessor and a copy would make the maintenance a no-op.
 */
function makePromotionCodeAccountLink(accountID: string): PromotionCodeAccountLinkDouble {
  const promotionCodes: PromotionCode[] = [];

  return {
    getAccountID(): string {
      return accountID;
    },
    isNew(): boolean {
      return accountID === '';
    },
    hasPromotionCode(promotionCode: PromotionCode): boolean {
      return promotionCodes.includes(promotionCode);
    },
    getPromotionCodes(): PromotionCode[] {
      return promotionCodes;
    },
  };
}

/**
 * One `SwOrderPromotionCode` link, as a narrow structural double.
 *
 * ⭐ THE ORDER AGGREGATE IS ENTIRELY OUT OF SCOPE - the single largest exclusion
 * in this port. The double is an OPAQUE identifier carrier plus the two
 * owning-side maintenance methods [model/entity/PromotionCode.cfc:L142-L147]
 * delegate to. No order-shaped data lives in this module at all; that belongs to
 * `orderViewFixtures.ts`, which this module must not import because doing so
 * would create a cycle in the fixture dependency order.
 */
function makeOrderPromotionCodeLink(orderID: string): OrderPromotionCodeLinkDouble {
  const promotionCodes: PromotionCode[] = [];

  return {
    getOrderID(): string {
      return orderID;
    },
    addPromotionCode(promotionCode: PromotionCode): void {
      if (!promotionCodes.includes(promotionCode)) {
        promotionCodes.push(promotionCode);
      }
    },
    removePromotionCode(promotionCode: PromotionCode): void {
      const index: number = promotionCodes.indexOf(promotionCode);

      if (index >= 0) {
        promotionCodes.splice(index, 1);
      }
    },
  };
}

/**
 * Seeds ONE ledger entry for one reward, reproducing
 * [model/service/PromotionService.cfc:L173-L188] exactly.
 *
 * Every limit starts at the 1000000 sentinel, which is how the engine
 * materialises the `hb_nullRBKey="define.unlimited"` metadata on
 * [model/entity/PromotionReward.cfc:L65-L67] into a comparable number.
 *
 * ⭐⭐ LEGACY-DEFECT [model/service/PromotionService.cfc:L180-L188]: each override
 *   is gated on `!isNull(...) AND > 0`, so a limit of `0` - or any negative value -
 *   FAILS THE TEST AND LEAVES THE SENTINEL IN PLACE. Zero therefore means
 *   UNLIMITED, not "disabled": a merchant who sets `maximumUsePerOrder = 0` to
 *   switch a reward off gets the exact opposite of the intent, and nothing in the
 *   ORM metadata or in `model/validation/PromotionReward.json` prevents them
 *   entering it.
 * Preserved deliberately; do not fix without a product decision.
 *
 * ⚠️ AAP CORRECTION #4: the plan records only NULL as meaning unlimited. The `> 0`
 * gate means zero and every negative value mean unlimited too. The strictly
 * greater-than comparison below is written as the source writes it, and the two
 * exhibit rewards on the graph make the consequence assertable.
 */
function seedRewardUsageDetail(reward: PromotionReward): PromotionRewardUsageDetail {
  // [model/service/PromotionService.cfc:L173-L179] - the seed, sentinel-first.
  let maximumUsePerOrder: number = UNLIMITED_USE_SENTINEL;
  let maximumUsePerItem: number = UNLIMITED_USE_SENTINEL;
  let maximumUsePerQualification: number = UNLIMITED_USE_SENTINEL;

  const declaredMaximumUsePerOrder: number | undefined = reward.getMaximumUsePerOrder();
  const declaredMaximumUsePerItem: number | undefined = reward.getMaximumUsePerItem();
  const declaredMaximumUsePerQualification: number | undefined =
    reward.getMaximumUsePerQualification();

  // [model/service/PromotionService.cfc:L180-L182] - `!isNull(...) and ... > 0`.
  if (declaredMaximumUsePerOrder !== undefined && declaredMaximumUsePerOrder > 0) {
    maximumUsePerOrder = declaredMaximumUsePerOrder;
  }

  // [model/service/PromotionService.cfc:L183-L185].
  if (declaredMaximumUsePerItem !== undefined && declaredMaximumUsePerItem > 0) {
    maximumUsePerItem = declaredMaximumUsePerItem;
  }

  // [model/service/PromotionService.cfc:L186-L188].
  if (declaredMaximumUsePerQualification !== undefined && declaredMaximumUsePerQualification > 0) {
    maximumUsePerQualification = declaredMaximumUsePerQualification;
  }

  return {
    // [model/service/PromotionService.cfc:L174] - always zero at seed time.
    usedInOrder: 0,
    maximumUsePerOrder,
    maximumUsePerItem,
    maximumUsePerQualification,
    // [model/service/PromotionService.cfc:L178] - a FRESH array per entry, so two
    // ledger entries can never share a usage list.
    orderItemsUsage: [],
  };
}

/**
 * Seeds the whole `promotionRewardUsageDetails` ledger from a reward array.
 *
 * ⭐ THE `structKeyExists` GUARD AT [model/service/PromotionService.cfc:L172] IS
 * REPRODUCED, AND IT MATTERS: seeding is IDEMPOTENT AND FIRST-REWARD-WINS. A
 * second reward carrying an already-seeded ID never re-seeds, so its own limits
 * are silently ignored for the remainder of the order. `Object.hasOwn` is the
 * exact analogue - it asks "is this key present?" rather than "is its value
 * truthy?", which is the distinction the legacy guard draws.
 *
 * The array is consumed IN THE ORDER GIVEN. Nothing is sorted here, because
 * `getActivePromotionRewards()` [model/dao/PromotionDAO.cfc:L51-L132] carries no
 * `ORDER BY` and the engine's answer at a tie genuinely depends on the order the
 * ORM happened to return.
 */
function seedRewardUsageDetails(rewards: readonly PromotionReward[]): PromotionRewardUsageDetails {
  const details: PromotionRewardUsageDetails = {};

  for (const reward of rewards) {
    const rewardID: string = reward.getPromotionRewardID();

    // [model/service/PromotionService.cfc:L172] - the idempotence guard.
    if (!Object.hasOwn(details, rewardID)) {
      details[rewardID] = seedRewardUsageDetail(reward);
    }
  }

  return details;
}

/**
 * Reads one seeded ledger entry, failing loudly rather than silently.
 *
 * `noUncheckedIndexedAccess` types every `details[key]` as possibly `undefined`,
 * and a fixture must never paper over that with a postfix `!`: if a key this
 * module itself seeded is missing, the seeding is broken and a suite deserves to
 * be told so at the point of failure rather than handed an `undefined` that
 * surfaces three assertions later.
 */
function readRewardUsageDetail(
  details: PromotionRewardUsageDetails,
  rewardID: string,
): PromotionRewardUsageDetail {
  const detail: PromotionRewardUsageDetail | undefined = details[rewardID];

  if (detail === undefined) {
    throw new Error(
      `promotionFixtures seeded no usage ledger entry for promotion reward ` +
        `'${rewardID}'. Seeding follows model/service/PromotionService.cfc:L172-L188, ` +
        `so a missing entry means the reward was absent from the array the ledger ` +
        `was seeded from.`,
    );
  }

  return detail;
}

/**
 * Appends one `orderItemsUsage` entry to a seeded ledger entry.
 *
 * ⭐ The insertion ORDER is the caller's business and is never sorted here. The
 * legacy engine insert-sorts `orderItemsUsage` ASCENDING by `discountPerUseValue`
 * [model/service/PromotionService.cfc:L301-L329] - the opposite direction from
 * `orderItemQulifiedDiscounts`, which is insert-sorted DESCENDING by discount
 * amount [L266-L294] and from which only index `[1]`, the single largest
 * discount, is ever applied [L524-L537]. Both directions are load-bearing, and a
 * fixture that quietly imposed one would make the other unassertable.
 */
function appendOrderItemUsage(detail: PromotionRewardUsageDetail, usage: OrderItemUsage): void {
  detail.orderItemsUsage.push(usage);
}

/**
 * The ten in-scope membership collections plus the three opaque-ID collections,
 * gathered once so every reward and the qualifier are built from the same
 * material.
 *
 * Every member is `readonly`, and `makeRewardFixture` COPIES each one before
 * handing it to a constructor - so two rewards built from this bag never share an
 * array, even though they do share the ENTITIES inside it. That distinction is
 * the shared-identity decision recorded on the graph's `sku` member.
 */
type MembershipCollections = {
  readonly brands: readonly Brand[];
  readonly options: readonly Option[];
  readonly skus: readonly Sku[];
  readonly products: readonly Product[];
  readonly productTypes: readonly ProductType[];
  readonly excludedBrands: readonly Brand[];
  readonly excludedOptions: readonly Option[];
  readonly excludedSkus: readonly Sku[];
  readonly excludedProducts: readonly Product[];
  readonly excludedProductTypes: readonly ProductType[];

  /** Opaque IDs: `FulfillmentMethod` is out of scope. */
  readonly fulfillmentMethodIDs: readonly string[];

  /** Opaque IDs: `ShippingMethod` is out of scope. */
  readonly shippingMethodIDs: readonly string[];

  /** Opaque IDs: `AddressZone` is out of scope. */
  readonly shippingAddressZoneIDs: readonly string[];
};

/**
 * What varies between the reward exhibits, and nothing else.
 *
 * ⭐ EVERY MEMBER IS OPTIONAL AND OMISSION MEANS THE COLUMN IS ABSENT - not
 * "substitute a sensible value". That reading is deliberate and is what makes the
 * exhibits honest: `amount` has no ORM default at all
 * [model/entity/PromotionReward.cfc:L61], the three `maximumUse*` limits declare
 * `hb_nullRBKey="define.unlimited"` [L65-L67], and `roundingRule` declares
 * `hb_optionsNullRBKey="define.none"` [L71]. A builder that quietly filled any of
 * them in could not produce the unlimited or unrounded exhibits at all.
 *
 * `applicableTerm` is the ONE exception and is coalesced to `both`, because its
 * absence carries no documented meaning in this slice.
 */
type RewardSpec = {
  /** Appended to the graph's identifier prefix, so every reward is traceable. */
  readonly idSuffix: string;

  /** Un-narrowed `string`, so a mixed-case value is expressible without a cast. */
  readonly rewardType?: string | undefined;

  /** Omitted means the default-less switch at L992-L1003 takes no branch. */
  readonly amountType?: AmountType | undefined;

  /** Omitted means the column is NULL - invalid by validation, and a real state. */
  readonly amount?: Money | undefined;

  /** Coalesced to `both` when omitted. */
  readonly applicableTerm?: ApplicableTerm | undefined;

  /** Omitted, `0` and negative all mean UNLIMITED - see `seedRewardUsageDetail`. */
  readonly maximumUsePerOrder?: number | undefined;

  /** As above. */
  readonly maximumUsePerItem?: number | undefined;

  /** As above. */
  readonly maximumUsePerQualification?: number | undefined;

  /** Omitted means `define.none` - the unrounded discount branch. */
  readonly roundingRule?: RoundingRule | undefined;
};

/** What every reward exhibit in one graph shares. */
type RewardBuildContext = {
  readonly promotionPeriod: PromotionPeriod;
  readonly membership: MembershipCollections;
  readonly eligiblePriceGroups: readonly PriceGroup[];
  readonly labelProvider: PromotionRewardLabelProviderDouble;
};

/**
 * Builds one reward exhibit.
 *
 * ⭐ ALL FOURTEEN many-to-many collections are populated as ARRAYS, even though
 * only three of them - `eligiblePriceGroups`, `excludedBrands` and
 * `excludedOptions` - declare `type="array"` in the legacy source
 * [model/entity/PromotionReward.cfc:L74, L86, L87]. The other eleven omit the
 * attribute, which is an inconsistency in the DECLARATION rather than a
 * behavioural difference: Hibernate hands an unpopulated many-to-many back as an
 * empty collection either way. The target normalises all fourteen, and
 * `REWARD_MANY_TO_MANY_COLLECTIONS` records what the source actually says so the
 * normalisation stays auditable.
 *
 * Every collection is COPIED, never adopted, so no two rewards share an array.
 */
function makeRewardFixture(
  idPrefix: string,
  spec: RewardSpec,
  context: RewardBuildContext,
): PromotionReward {
  return new PromotionReward({
    promotionRewardID: makeId(idPrefix, spec.idSuffix),
    amount: spec.amount,
    amountType: spec.amountType,
    rewardType: spec.rewardType,
    applicableTerm: spec.applicableTerm ?? DEFAULT_APPLICABLE_TERM,
    maximumUsePerOrder: spec.maximumUsePerOrder,
    maximumUsePerItem: spec.maximumUsePerItem,
    maximumUsePerQualification: spec.maximumUsePerQualification,
    promotionPeriod: context.promotionPeriod,
    roundingRule: spec.roundingRule,
    eligiblePriceGroups: copyOf(context.eligiblePriceGroups),
    fulfillmentMethodIDs: copyOf(context.membership.fulfillmentMethodIDs),
    shippingAddressZoneIDs: copyOf(context.membership.shippingAddressZoneIDs),
    shippingMethodIDs: copyOf(context.membership.shippingMethodIDs),
    brands: copyOf(context.membership.brands),
    options: copyOf(context.membership.options),
    skus: copyOf(context.membership.skus),
    products: copyOf(context.membership.products),
    productTypes: copyOf(context.membership.productTypes),
    excludedBrands: copyOf(context.membership.excludedBrands),
    excludedOptions: copyOf(context.membership.excludedOptions),
    excludedSkus: copyOf(context.membership.excludedSkus),
    excludedProducts: copyOf(context.membership.excludedProducts),
    excludedProductTypes: copyOf(context.membership.excludedProductTypes),
    remoteID: undefined,
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    createdByAccountID: undefined,
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: undefined,
    labelProvider: context.labelProvider,
  });
}

/**
 * Reads one qualifier gate override, distinguishing an omitted key from a key
 * written as `undefined`.
 *
 * ⭐ The distinction is the whole point of the asymmetric null semantics: writing
 * `maximumOrderSubtotal: undefined` asks for UNLIMITED
 * [model/entity/PromotionQualifier.cfc:L58], while omitting it accepts this
 * fixture's documented ceiling. Collapsing the two with `??` would make the
 * unlimited state unreachable through the overrides.
 */
function resolveGateOverride<TKey extends keyof QualifierGateOverrides>(
  gates: QualifierGateOverrides | undefined,
  key: TKey,
  documentedDefault: QualifierGateOverrides[TKey],
): QualifierGateOverrides[TKey] {
  if (gates !== undefined && Object.hasOwn(gates, key)) {
    return gates[key];
  }

  return documentedDefault;
}

/** What distinguishes one whole-promotion currency variant from another. */
type PromotionVariantSpec = {
  readonly idSuffix: string;
  readonly promotionName: string;

  /** `undefined` makes the column NULL - `define.forever`. */
  readonly periodStartUTC: string | undefined;

  /** `undefined` makes the column NULL - `define.forever`. */
  readonly periodEndUTC: string | undefined;

  /**
   * ⭐ `false` produces a CODE-LESS promotion, which
   * `Promotion.getCurrentFlag()` [model/entity/Promotion.cfc:L83-L92] treats
   * differently: its second conjunct is
   * `arrayLen(getPromotionCodes()) == 0 OR getCurrentPromotionCodeFlag()`, so a
   * promotion with no codes is current on the strength of its period alone.
   */
  readonly includeCode: boolean;

  /** Ignored when `includeCode` is `false`. */
  readonly codeStartUTC: string | undefined;

  /** Ignored when `includeCode` is `false`. */
  readonly codeEndUTC: string | undefined;
};

/**
 * Builds one self-contained promotion currency variant: a fresh promotion, one
 * fresh period, and optionally one fresh code.
 *
 * Self-contained deliberately. Every level of the three-deep memo chain -
 * `Promotion.getCurrentFlag()` -> `getCurrentPromotionPeriodFlag()` /
 * `getCurrentPromotionCodeFlag()` -> `PromotionPeriod.getCurrentFlag()` /
 * `PromotionCode.getCurrentFlag()` - freezes on first read, so sharing a period
 * or a code between two variants would let one variant's first evaluation decide
 * the other's answer.
 */
function makePromotionVariant(
  idPrefix: string,
  clock: () => Date,
  spec: PromotionVariantSpec,
): Promotion {
  const promotionID = makeId(idPrefix, spec.idSuffix);

  const promotion = new Promotion({
    promotionID,
    promotionName: spec.promotionName,
    activeFlag: ACTIVE_FLAG_ORM_DEFAULT,
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
  });

  const promotionPeriod = new PromotionPeriod({
    promotionPeriodID: makeId(promotionID, 'period'),
    startDateTime: spec.periodStartUTC === undefined ? undefined : makeInstant(spec.periodStartUTC),
    endDateTime: spec.periodEndUTC === undefined ? undefined : makeInstant(spec.periodEndUTC),
    maximumUseCount: PERIOD_MAXIMUM_USE_COUNT,
    maximumAccountUseCount: PERIOD_MAXIMUM_ACCOUNT_USE_COUNT,
    promotion,
    promotionID,
    remoteID: undefined,
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    createdByAccountID: undefined,
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: undefined,
    now: clock,
  });

  // Wired through the LIVE collection accessor rather than through
  // `addPromotionPeriod`. // JUDGMENT CALL: both directions are wired explicitly
  // here because two of this family's bidirectional `remove*` helpers are
  // reproduced defects - [model/entity/PromotionPeriod.cfc:L110] and
  // [model/entity/PromotionAccount.cfc:L103] both dereference an UNDECLARED
  // `arguments.account` - and a fixture must not have its own construction depend
  // on helper correctness. The accessor returns the live array by design, so the
  // push is the same mutation `PromotionPeriod.setPromotion` would perform.
  promotion.getPromotionPeriods().push(promotionPeriod);

  if (spec.includeCode) {
    const promotionCode = new PromotionCode({
      promotionCodeID: makeId(promotionID, 'code'),
      promotionCode: DEFAULT_PROMOTION_CODE_VALUE,
      startDateTime: spec.codeStartUTC === undefined ? undefined : makeInstant(spec.codeStartUTC),
      endDateTime: spec.codeEndUTC === undefined ? undefined : makeInstant(spec.codeEndUTC),
      maximumUseCount: CODE_MAXIMUM_USE_COUNT,
      maximumAccountUseCount: CODE_MAXIMUM_ACCOUNT_USE_COUNT,
      promotion,
      promotionID,
      accounts: [],
      orders: [],
      remoteID: undefined,
      createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
      createdByAccountID: undefined,
      modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
      modifiedByAccountID: undefined,
      now: clock,
    });

    promotion.getPromotionCodes().push(promotionCode);
  }

  return promotion;
}

// ---------------------------------------------------------------------------
// THE SINGLE EXPORT
//
// One named export, no default export, no second export, no barrel file. Every
// entity and every exhibit is reached through the returned graph, and every
// variation is requested through the one optional parameter.
// ---------------------------------------------------------------------------

/**
 * Builds a complete, deterministic promotion family graph.
 *
 * ⭐ A FRESH GRAPH ON EVERY CALL. Two invocations produce two entirely independent
 * object graphs: independent entities, independent reward arrays, independent
 * include and exclude collections, independent `orderItemsUsage` arrays and
 * independent `Date` instances. Nothing is cached at module scope and nothing is
 * shared between graphs.
 *
 * That is not tidiness - it is what makes the port's central isolation property
 * ASSERTABLE. `Promotion.getCurrentFlag()`, `PromotionPeriod.getCurrentFlag()` and
 * `PromotionCode.getCurrentFlag()` each memoize on first read, three levels deep,
 * so a suite must be able to prove that a second independent invocation does not
 * observe the first invocation's frozen answer. On a warm Lambda container module
 * state survives between unrelated requests, which is exactly why every legacy
 * component-level memo became request-scoped in the target - and why a fixture
 * that handed out a shared instance would quietly reintroduce the hazard the port
 * removed.
 *
 * NO DATABASE, NO POOL, NO NETWORK, NO FILESYSTEM, NO `process.env`, NO
 * BOOTSTRAP, NO DI CONTAINER, NO AMBIENT REQUEST SCOPE. Every value below is
 * constructed in memory from a literal. The `PromotionDAO` SQL is cited
 * throughout as a behavioural specification and is never executed here.
 *
 * @param overrides every axis of variation this factory offers, and the only one.
 * @returns the seven-entity promotion family plus the exhibits that make the
 *   must-preserve discount and use-limit semantics assertable.
 */
export function makePromotionFixtures(
  overrides?: PromotionFixtureOverrides,
): PromotionFixtureGraph {
  const idPrefix: string = overrides?.idPrefix ?? DEFAULT_ID_PREFIX;

  // --- The fixed clock ----------------------------------------------------
  //
  // `??` rather than `resolveOverride`: an instant has no meaningful absent
  // state, so there is nothing for an explicit `undefined` to mean.
  const now: Date = overrides?.now ?? makeInstant(NOW_UTC);
  const clock: () => Date = makeClock(now);

  // --- Opaque out-of-scope identifiers ------------------------------------
  //
  // ⭐ THE ANTI-CORRUPTION BOUNDARY, AS DATA. `Order`, `OrderItem`,
  // `OrderFulfillment` and `Account` are all out of scope, so each is a bare
  // string here and no method on any of them is ever called. Frozen because an
  // identifier is a contract, not a mutable field.
  const opaqueOrderReferences: OpaqueOrderReferences = Object.freeze({
    orderID: overrides?.orderID ?? makeId(idPrefix, 'order'),
    orderItemID: overrides?.orderItemID ?? makeId(idPrefix, 'order-item-first'),
    // ⭐ MUST differ from `orderItemID`: with a single order item the leaked-key
    // read in the over-use stripping loop at
    // [model/service/PromotionService.cfc:L472-L477] produces the right answer by
    // coincidence and LEGACY-DEFECT 9 becomes invisible.
    secondOrderItemID: overrides?.secondOrderItemID ?? makeId(idPrefix, 'order-item-second'),
    orderFulfillmentID: overrides?.orderFulfillmentID ?? makeId(idPrefix, 'order-fulfillment'),
    accountID: overrides?.accountID ?? makeId(idPrefix, 'account'),
  });

  // --- The price-group bridge ---------------------------------------------
  //
  // Sourced from `./priceGroupFixtures` - module #1 in this folder's dependency
  // order - rather than rebuilt, so the rounding rule the reward rounds with and
  // the price groups it is restricted to are the SAME objects the price-group
  // suites use. Two look-alike rounding rules in one repository is how a rounding
  // divergence hides.
  const priceGroupFixtures = makePriceGroupFixtures({ idPrefix: makeId(idPrefix, 'pricegroup') });

  // The rule the DEFAULT reward carries. `resolveOverride`, not `??`, because an
  // explicit `undefined` is a first-class request: `hb_optionsNullRBKey="define.none"`
  // [model/entity/PromotionReward.cfc:L71] makes "no rounding" a configured state.
  const defaultRewardRoundingRule: RoundingRule | undefined = resolveOverride(
    overrides,
    'roundingRule',
    priceGroupFixtures.closestRoundingRule,
  );

  // The rule the ROUNDED exhibit carries, which always exists - otherwise asking
  // for an unrounded default reward would also remove the rounded exhibit.
  const roundingRule: RoundingRule =
    defaultRewardRoundingRule ?? priceGroupFixtures.closestRoundingRule;

  // A per-call copy, so a suite splicing it cannot reach the price-group graph.
  const eligiblePriceGroups: readonly PriceGroup[] =
    overrides?.eligiblePriceGroups ??
    copyOf([priceGroupFixtures.childPriceGroup, priceGroupFixtures.parentPriceGroup]);

  // --- The catalog membership graph ---------------------------------------

  const productTypeChain: ProductTypeChain = makeProductTypeChain(idPrefix);
  const excludedProductType: ProductType = makeExcludedProductType(idPrefix);

  const brand = new Brand({
    brandID: makeId(idPrefix, 'brand'),
    brandName: 'Fixture Brand',
    urlTitle: 'fixture-brand',
    brandWebsite: 'https://example.invalid/fixture-brand',
    activeFlag: true,
    publishedFlag: true,
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
  });

  const excludedBrand = new Brand({
    brandID: makeId(idPrefix, 'brand-excluded'),
    brandName: 'Excluded Fixture Brand',
    urlTitle: 'excluded-fixture-brand',
    activeFlag: true,
    publishedFlag: true,
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
  });

  // `Option`'s constructor declares every slot as REQUIRED `T | undefined`, so
  // each absent column is written out explicitly rather than omitted. That is the
  // entity's contract, not a choice made here.
  const option = new Option({
    optionID: makeId(idPrefix, 'option'),
    optionCode: 'FIXTURE-OPTION',
    optionName: 'Fixture Option',
    optionDescription: undefined,
    sortOrder: 1,
    optionGroup: undefined,
    defaultImageID: undefined,
    remoteID: undefined,
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    createdByAccountID: undefined,
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: undefined,
  });

  const excludedOption = new Option({
    optionID: makeId(idPrefix, 'option-excluded'),
    optionCode: 'FIXTURE-OPTION-EXCLUDED',
    optionName: 'Excluded Fixture Option',
    optionDescription: undefined,
    sortOrder: 2,
    optionGroup: undefined,
    defaultImageID: undefined,
    remoteID: undefined,
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    createdByAccountID: undefined,
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: undefined,
  });

  // Sourced from `./productFixtures` and `./skuFixtures` - modules #2 and #3 -
  // rather than rebuilt. `./skuFixtures`' own default price is already `'19.99'`,
  // the reference calculation's unit price, so the worked example prices the same
  // object both modules price.
  //
  // // JUDGMENT CALL: `productID` IS SUPPLIED EXPLICITLY. Module #2 defaults it to
  // `''` on purpose, so that `isNew()` is honest and the entity-base cases it
  // carries forward from `meta/tests/unit/entity/SlatwallEntityTestBase.cfc` hold.
  // That default is right for a product fixture and wrong for a PROMOTION fixture:
  // a reward or qualifier is attached to a product through the link tables
  // `SwPromoRewardProduct` / `SwPromoQualProduct`, and a link-table row stores a
  // productID - so a transient product could not be a member at all, and schema
  // continuity (C5) says the fixture must model what the schema can hold.
  //
  // It also matters mechanically. The ported membership check falls back to
  // reference identity when the candidate's primary key is `''`, so a `''`-keyed
  // product would silently route every `hasProduct` / `hasExcludedProduct` call
  // down the identity branch and leave the ID-COMPARISON branch - the one the
  // engine's own membership walks take - completely unexercised.
  const product: Product = makeProductFixture({
    idPrefix: makeId(idPrefix, 'product'),
    productID: makeId(idPrefix, 'product'),
    brand,
    productType: productTypeChain.leaf,
  });

  const excludedProduct: Product = makeProductFixture({
    idPrefix: makeId(idPrefix, 'product-excluded'),
    productID: makeId(idPrefix, 'product-excluded'),
    brand: excludedBrand,
    productType: excludedProductType,
  });

  const sku: Sku = makeSkuFixture({ idPrefix: makeId(idPrefix, 'sku'), product });

  const excludedSku: Sku = makeSkuFixture({
    idPrefix: makeId(idPrefix, 'sku-excluded'),
    product: excludedProduct,
  });

  // Collection overrides use `??` rather than `resolveOverride`, deliberately: a
  // Hibernate-managed many-to-many is NEVER null - an unpopulated one reads as an
  // empty array - so `[]` is how a caller asks for "attached to nothing", and
  // `undefined` has no distinct meaning to preserve.
  const membership: MembershipCollections = {
    brands: overrides?.brands ?? [brand],
    options: overrides?.options ?? [option],
    skus: overrides?.skus ?? [sku],
    products: overrides?.products ?? [product],
    productTypes: overrides?.productTypes ?? [productTypeChain.leaf],
    excludedBrands: overrides?.excludedBrands ?? [excludedBrand],
    excludedOptions: overrides?.excludedOptions ?? [excludedOption],
    excludedSkus: overrides?.excludedSkus ?? [excludedSku],
    excludedProducts: overrides?.excludedProducts ?? [excludedProduct],
    excludedProductTypes: overrides?.excludedProductTypes ?? [excludedProductType],
    fulfillmentMethodIDs: overrides?.fulfillmentMethodIDs ?? [
      makeId(idPrefix, 'fulfillment-method'),
    ],
    shippingMethodIDs: overrides?.shippingMethodIDs ?? [makeId(idPrefix, 'shipping-method')],
    shippingAddressZoneIDs: overrides?.shippingAddressZoneIDs ?? [
      makeId(idPrefix, 'shipping-address-zone'),
    ],
  };

  // --- The promotion, its period and its code -----------------------------

  const promotionID: string = overrides?.promotionID ?? makeId(idPrefix, 'promotion');

  const promotion = new Promotion({
    promotionID,
    promotionName: overrides?.promotionName ?? 'Fixture Promotion',
    promotionSummary: overrides?.promotionSummary ?? 'A promotion used by the engine fixtures.',
    promotionDescription:
      overrides?.promotionDescription ??
      'Constructed in memory by promotionFixtures; never persisted.',
    // CFML parity [model/entity/Promotion.cfc:L56]: `default="1"` means an unset
    // column reads TRUE - the same as `Sku`, and unlike `Product`, which declares
    // no default at all. `resolveOverride` so that an explicit `false` survives
    // instead of being read as "absent, use the default".
    activeFlag: resolveOverride(overrides, 'activeFlag', ACTIVE_FLAG_ORM_DEFAULT),
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
  });

  const promotionPeriod = new PromotionPeriod({
    promotionPeriodID: makeId(idPrefix, 'promotion-period'),
    // `resolveOverride` on both bounds: an explicit `undefined` is the documented
    // NULL - `hb_nullRBKey="define.forever"`
    // [model/entity/PromotionPeriod.cfc:L53-L54] - and it is the state that makes
    // `isCurrent()` raise while `getCurrentFlag()` answers correctly.
    startDateTime: resolveOverride(
      overrides,
      'promotionPeriodStartDateTime',
      makeInstant(PERIOD_START_UTC),
    ),
    endDateTime: resolveOverride(
      overrides,
      'promotionPeriodEndDateTime',
      makeInstant(PERIOD_END_UTC),
    ),
    // NULL means unlimited on both [model/entity/PromotionPeriod.cfc:L55-L56].
    maximumUseCount: resolveOverride(
      overrides,
      'promotionPeriodMaximumUseCount',
      PERIOD_MAXIMUM_USE_COUNT,
    ),
    maximumAccountUseCount: resolveOverride(
      overrides,
      'promotionPeriodMaximumAccountUseCount',
      PERIOD_MAXIMUM_ACCOUNT_USE_COUNT,
    ),
    promotion,
    promotionID,
    remoteID: undefined,
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    createdByAccountID: undefined,
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: undefined,
    now: clock,
  });

  promotion.getPromotionPeriods().push(promotionPeriod);

  const promotionCodeValue: string = overrides?.promotionCodeValue ?? DEFAULT_PROMOTION_CODE_VALUE;

  const promotionCodeAccounts: readonly PromotionCodeAccountLinkDouble[] = [
    makePromotionCodeAccountLink(opaqueOrderReferences.accountID),
  ];

  const promotionCodeOrders: readonly OrderPromotionCodeLinkDouble[] = [
    makeOrderPromotionCodeLink(opaqueOrderReferences.orderID),
  ];

  const promotionCode = new PromotionCode({
    promotionCodeID: makeId(idPrefix, 'promotion-code'),
    promotionCode: promotionCodeValue,
    startDateTime: resolveOverride(
      overrides,
      'promotionCodeStartDateTime',
      makeInstant(PERIOD_START_UTC),
    ),
    endDateTime: resolveOverride(
      overrides,
      'promotionCodeEndDateTime',
      makeInstant(PERIOD_END_UTC),
    ),
    maximumUseCount: resolveOverride(
      overrides,
      'promotionCodeMaximumUseCount',
      CODE_MAXIMUM_USE_COUNT,
    ),
    maximumAccountUseCount: resolveOverride(
      overrides,
      'promotionCodeMaximumAccountUseCount',
      CODE_MAXIMUM_ACCOUNT_USE_COUNT,
    ),
    promotion,
    promotionID,
    accounts: copyOf(promotionCodeAccounts),
    orders: copyOf(promotionCodeOrders),
    remoteID: undefined,
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    createdByAccountID: undefined,
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: undefined,
    now: clock,
  });

  promotion.getPromotionCodes().push(promotionCode);

  // ⭐ THE COLLISION EXHIBIT. It carries the same code value differently cased and
  // points at the SAME promotion, but is deliberately NOT pushed into
  // `promotion.getPromotionCodes()`.
  //
  // // JUDGMENT CALL: attaching it would give the default promotion two codes and
  // quietly change what every currency assertion about that promotion is testing.
  // Leaving it detached is enough for the exhibit to work, because
  // `hasUniquePromotionCode()` scans `this.promotion.getPromotionCodes()` - so
  // asking the COLLIDING code finds `promotionCode` and answers `false`, while
  // asking `promotionCode` finds only itself, is excluded by primary key, and
  // answers `true`. Different casing on purpose: the legacy check is a MySQL `=`
  // under a case-insensitive collation, so the collision is real there too, and a
  // same-cased pair would not prove the normalisation.
  const collidingPromotionCode = new PromotionCode({
    promotionCodeID: makeId(idPrefix, 'promotion-code-colliding'),
    promotionCode: COLLIDING_PROMOTION_CODE_VALUE,
    startDateTime: makeInstant(PERIOD_START_UTC),
    endDateTime: makeInstant(PERIOD_END_UTC),
    // ⭐ NULL on both: `hb_nullRBKey="define.unlimited"`
    // [model/entity/PromotionCode.cfc:L56-L57] means unlimited, never zero uses.
    maximumUseCount: undefined,
    maximumAccountUseCount: undefined,
    promotion,
    promotionID,
    accounts: [],
    orders: [],
    remoteID: undefined,
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    createdByAccountID: undefined,
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: undefined,
    now: clock,
  });

  // --- The reward exhibits -------------------------------------------------

  const rewardLabelProvider: RecordingLabelProvider = makeRecordingLabelProvider();

  const rewardContext: RewardBuildContext = {
    promotionPeriod,
    membership,
    eligiblePriceGroups,
    labelProvider: rewardLabelProvider,
  };

  // The PRIMARY reward, and the only one that honours the `reward*` overrides.
  // Pass one, matched through the comma list at
  // [model/service/PromotionService.cfc:L198].
  const merchandiseReward: PromotionReward = makeRewardFixture(
    idPrefix,
    {
      idSuffix: 'reward-merchandise',
      rewardType: resolveOverride(overrides, 'rewardType', 'merchandise'),
      amountType: resolveOverride(overrides, 'rewardAmountType', 'percentageOff'),
      amount: resolveOverride(
        overrides,
        'rewardAmount',
        Money.fromDecimalString(REFERENCE_PERCENTAGE_OFF),
      ),
      applicableTerm: resolveOverride(overrides, 'rewardApplicableTerm', DEFAULT_APPLICABLE_TERM),
      maximumUsePerOrder: resolveOverride(
        overrides,
        'rewardMaximumUsePerOrder',
        BOUNDED_MAXIMUM_USE_PER_ORDER,
      ),
      maximumUsePerItem: resolveOverride(
        overrides,
        'rewardMaximumUsePerItem',
        BOUNDED_MAXIMUM_USE_PER_ITEM,
      ),
      maximumUsePerQualification: resolveOverride(
        overrides,
        'rewardMaximumUsePerQualification',
        BOUNDED_MAXIMUM_USE_PER_QUALIFICATION,
      ),
      roundingRule: defaultRewardRoundingRule,
    },
    rewardContext,
  );

  // Pass one, same comma list.
  const subscriptionReward: PromotionReward = makeRewardFixture(
    idPrefix,
    {
      idSuffix: 'reward-subscription',
      rewardType: 'subscription',
      amountType: 'percentageOff',
      amount: Money.fromDecimalString(REFERENCE_PERCENTAGE_OFF),
      applicableTerm: 'initial',
      roundingRule,
    },
    rewardContext,
  );

  // Pass one, same comma list.
  const contentAccessReward: PromotionReward = makeRewardFixture(
    idPrefix,
    {
      idSuffix: 'reward-content-access',
      rewardType: 'contentAccess',
      amountType: 'amountOff',
      amount: Money.fromDecimalString(FLAT_DISCOUNT_AMOUNT),
      roundingRule,
    },
    rewardContext,
  );

  // ⭐ Pass one, but reached by the SEPARATE `eq "fulfillment"` test at
  // [model/service/PromotionService.cfc:L345] rather than through the comma list.
  // Half of AAP CORRECTION #7: pass one handles FOUR reward types, not three.
  const fulfillmentReward: PromotionReward = makeRewardFixture(
    idPrefix,
    {
      idSuffix: 'reward-fulfillment',
      rewardType: FULFILLMENT_REWARD_TYPE,
      amountType: 'amountOff',
      amount: Money.fromDecimalString(FLAT_DISCOUNT_AMOUNT),
      maximumUsePerOrder: BOUNDED_MAXIMUM_USE_PER_ORDER,
      roundingRule,
    },
    rewardContext,
  );

  // ⭐ PASS TWO, and the ONLY reward type that reaches it
  // [model/service/PromotionService.cfc:L415]. Also the reward whose amount-type
  // vocabulary `getAmountTypeOptions()` restricts to two values - the two facts
  // describe the same reward.
  const orderReward: PromotionReward = makeRewardFixture(
    idPrefix,
    {
      idSuffix: 'reward-order',
      rewardType: ORDER_REWARD_TYPE,
      amountType: 'percentageOff',
      amount: Money.fromDecimalString(REFERENCE_PERCENTAGE_OFF),
      maximumUsePerOrder: BOUNDED_MAXIMUM_USE_PER_ORDER,
      maximumUsePerItem: BOUNDED_MAXIMUM_USE_PER_ITEM,
      maximumUsePerQualification: BOUNDED_MAXIMUM_USE_PER_QUALIFICATION,
      roundingRule,
    },
    rewardContext,
  );

  // ⭐ `'Merchandise'` - capitalised. `listFindNoCase`
  // [model/service/PromotionService.cfc:L198, L793] is CASE-INSENSITIVE, so the
  // legacy engine routes this as a merchandise reward; TypeScript `===` would
  // not, and `getRewardType()` is deliberately un-narrowed so the state needs no
  // cast to express.
  const mixedCaseRewardTypeReward: PromotionReward = makeRewardFixture(
    idPrefix,
    {
      idSuffix: 'reward-mixed-case-reward-type',
      rewardType: MIXED_CASE_MERCHANDISE_REWARD_TYPE,
      amountType: 'percentageOff',
      amount: Money.fromDecimalString(REFERENCE_PERCENTAGE_OFF),
      roundingRule,
    },
    rewardContext,
  );

  const percentageOffReward: PromotionReward = makeRewardFixture(
    idPrefix,
    {
      idSuffix: 'reward-percentage-off',
      rewardType: 'merchandise',
      amountType: 'percentageOff',
      amount: Money.fromDecimalString(REFERENCE_PERCENTAGE_OFF),
      roundingRule,
    },
    rewardContext,
  );

  // LEGACY-DEFECT [model/service/PromotionService.cfc:L998]: the `amountOff`
  //   branch omits `precisionEvaluate` and multiplies with raw floating point,
  //   while every neighbouring branch is guarded.
  // // JUDGMENT CALL: NOT reproduced - all arithmetic in the target flows through
  // `Money` over decimal.js, so this branch is deliberately MORE correct than the
  // source. Preserving the drift would mean bypassing the value object on purpose.
  // One of the plan's three documented divergences.
  const amountOffReward: PromotionReward = makeRewardFixture(
    idPrefix,
    {
      idSuffix: 'reward-amount-off',
      rewardType: 'merchandise',
      amountType: 'amountOff',
      amount: Money.fromDecimalString(FLAT_DISCOUNT_AMOUNT),
      roundingRule,
    },
    rewardContext,
  );

  // The LEGAL fixed-amount case: `amount` on a NON-order reward, which is exactly
  // what `getAmountTypeOptions()` offers for a non-order reward type.
  const fixedAmountReward: PromotionReward = makeRewardFixture(
    idPrefix,
    {
      idSuffix: 'reward-fixed-amount',
      rewardType: 'merchandise',
      amountType: FIXED_AMOUNT_AMOUNT_TYPE_VALUE,
      amount: Money.fromDecimalString(FLAT_DISCOUNT_AMOUNT),
      roundingRule,
    },
    rewardContext,
  );

  // ⭐ `amountType` ABSENT - the type-safe route into the default-less switch at
  // [model/service/PromotionService.cfc:L992-L1003], which takes NO branch for an
  // unmatched amount type. `AmountType` is a CLOSED union in the target, so an
  // unrecognised literal would need a cast, and this module uses none.
  const absentAmountTypeReward: PromotionReward = makeRewardFixture(
    idPrefix,
    {
      idSuffix: 'reward-absent-amount-type',
      rewardType: 'merchandise',
      amount: Money.fromDecimalString(FLAT_DISCOUNT_AMOUNT),
      roundingRule,
    },
    rewardContext,
  );

  // ⭐⭐ THE IMPOSSIBLE-BUT-REPRESENTABLE STATE: an `order` reward carrying the
  // fixed `amount` type. `getAmountTypeOptions()`
  // [model/entity/PromotionReward.cfc:L120-L133] does not offer `amount` for an
  // order-level reward, so the legacy admin cannot produce it - and nothing stops
  // it being persisted, after which the default-less switch executes the `amount`
  // branch anyway. Unreachable through the UI, fully reachable through the data.
  const impossibleOrderFixedAmountReward: PromotionReward = makeRewardFixture(
    idPrefix,
    {
      idSuffix: 'reward-order-fixed-amount',
      rewardType: ORDER_REWARD_TYPE,
      amountType: FIXED_AMOUNT_AMOUNT_TYPE_VALUE,
      amount: Money.fromDecimalString(FLAT_DISCOUNT_AMOUNT),
      roundingRule,
    },
    rewardContext,
  );

  // ⭐ `amount` ABSENT - INVALID BY VALIDATION, and labelled as such rather than
  // presented as a normal shape. [model/entity/PromotionReward.cfc:L61] carries no
  // ORM default so absence is a real persisted state, but
  // `model/validation/PromotionReward.json` makes both `amountType` AND `amount`
  // required on save, so this row could never reach the database through the
  // validated path.
  const absentAmountReward: PromotionReward = makeRewardFixture(
    idPrefix,
    {
      idSuffix: 'reward-absent-amount',
      rewardType: 'merchandise',
      amountType: 'percentageOff',
      roundingRule,
    },
    rewardContext,
  );

  // The worked example's reward: exactly `'12.5'`, and DELIBERATELY UNROUNDED so
  // that the `"52.47"` presentation figure is the arithmetic's own answer rather
  // than a rounding rule's.
  const referenceCalculationReward: PromotionReward = makeRewardFixture(
    idPrefix,
    {
      idSuffix: 'reward-reference-calculation',
      rewardType: 'merchandise',
      amountType: 'percentageOff',
      amount: Money.fromDecimalString(REFERENCE_PERCENTAGE_OFF),
    },
    rewardContext,
  );

  // All three limits ABSENT - the documented, validated "unlimited" shape.
  const unlimitedUseLimitsReward: PromotionReward = makeRewardFixture(
    idPrefix,
    {
      idSuffix: 'reward-unlimited-use-limits',
      rewardType: 'merchandise',
      amountType: 'percentageOff',
      amount: Money.fromDecimalString(REFERENCE_PERCENTAGE_OFF),
      roundingRule,
    },
    rewardContext,
  );

  // ⭐⭐ ALL THREE LIMITS EXPLICITLY `0` - WHICH ALSO MEANS UNLIMITED, because the
  // seeding override at [model/service/PromotionService.cfc:L180-L188] requires
  // `> 0`. AAP CORRECTION #4.
  const zeroUseLimitsReward: PromotionReward = makeRewardFixture(
    idPrefix,
    {
      idSuffix: 'reward-zero-use-limits',
      rewardType: 'merchandise',
      amountType: 'percentageOff',
      amount: Money.fromDecimalString(REFERENCE_PERCENTAGE_OFF),
      maximumUsePerOrder: ZERO_USE_LIMIT,
      maximumUsePerItem: ZERO_USE_LIMIT,
      maximumUsePerQualification: ZERO_USE_LIMIT,
      roundingRule,
    },
    rewardContext,
  );

  // Negative limits take the same fall-through, for the same reason.
  const negativeUseLimitsReward: PromotionReward = makeRewardFixture(
    idPrefix,
    {
      idSuffix: 'reward-negative-use-limits',
      rewardType: 'merchandise',
      amountType: 'percentageOff',
      amount: Money.fromDecimalString(REFERENCE_PERCENTAGE_OFF),
      maximumUsePerOrder: NEGATIVE_USE_LIMIT,
      maximumUsePerItem: NEGATIVE_USE_LIMIT,
      maximumUsePerQualification: NEGATIVE_USE_LIMIT,
      roundingRule,
    },
    rewardContext,
  );

  // The only shape that actually overrides the sentinel, and therefore the only
  // one under which use-limit enforcement is observable at all.
  const boundedUseLimitsReward: PromotionReward = makeRewardFixture(
    idPrefix,
    {
      idSuffix: 'reward-bounded-use-limits',
      rewardType: 'merchandise',
      amountType: 'percentageOff',
      amount: Money.fromDecimalString(REFERENCE_PERCENTAGE_OFF),
      maximumUsePerOrder: BOUNDED_MAXIMUM_USE_PER_ORDER,
      maximumUsePerItem: BOUNDED_MAXIMUM_USE_PER_ITEM,
      maximumUsePerQualification: BOUNDED_MAXIMUM_USE_PER_QUALIFICATION,
      roundingRule,
    },
    rewardContext,
  );

  const roundedReward: PromotionReward = makeRewardFixture(
    idPrefix,
    {
      idSuffix: 'reward-rounded',
      rewardType: 'merchandise',
      amountType: 'percentageOff',
      amount: Money.fromDecimalString(REFERENCE_PERCENTAGE_OFF),
      roundingRule,
    },
    rewardContext,
  );

  // `roundingRule` omitted, which is `define.none`
  // [model/entity/PromotionReward.cfc:L71] - a CONFIGURED state, not a missing
  // value.
  const unroundedReward: PromotionReward = makeRewardFixture(
    idPrefix,
    {
      idSuffix: 'reward-unrounded',
      rewardType: 'merchandise',
      amountType: 'percentageOff',
      amount: Money.fromDecimalString(REFERENCE_PERCENTAGE_OFF),
    },
    rewardContext,
  );

  // --- The reward array, and the named orderings ---------------------------
  //
  // ⭐ TAKEN EXACTLY AS SUPPLIED. Nothing is sorted here, because
  // `getActivePromotionRewards()` [model/dao/PromotionDAO.cfc:L51-L132] carries no
  // `ORDER BY` and the ledger the engine threads through the loop makes the order
  // decide the money at a tie.
  //
  // `??` rather than `resolveOverride`: the EMPTY case is requested with `[]`, not
  // with `undefined`. A Hibernate-managed collection is never null, so `[]` is the
  // parity-correct way to say "no rewards" and `undefined` is simply "not
  // specified".
  const defaultRewardOrdering: readonly PromotionReward[] = [
    merchandiseReward,
    fulfillmentReward,
    // LAST, deliberately: the two-pass guard at
    // [model/service/PromotionService.cfc:L458-L461] sits inside the loop body and
    // inside the period-OK block that closes at L463, so pass two only fires when
    // the FINAL element belongs to a qualifying period.
    orderReward,
  ];

  const promotionRewards: readonly PromotionReward[] =
    overrides?.promotionRewards ?? defaultRewardOrdering;

  // Wired through the live collection accessor, as with the period above.
  promotionPeriod.getPromotionRewards().push(...promotionRewards);

  const rewardOrderings: readonly RewardOrdering[] = Object.freeze([
    Object.freeze({
      name: 'orderRewardLast',
      rewards: copyOf(defaultRewardOrdering),
      reachesPassTwo: true,
      note:
        'The default. Two pass-one rewards then the order reward, so the ' +
        'loop-counter reset at L458-L461 fires on the final element and pass two ' +
        'runs.',
    }),
    Object.freeze({
      name: 'orderRewardFirst',
      rewards: copyOf([orderReward, merchandiseReward, fulfillmentReward]),
      reachesPassTwo: true,
      note:
        'The SAME rewards, reordered. Pass two still runs - the guard is about ' +
        'reaching the end of the array, not about which element is the order ' +
        'reward - but the usage ledger is threaded in a different order, which is ' +
        'what can change the money at a tie.',
    }),
    Object.freeze({
      name: 'noOrderReward',
      rewards: copyOf([merchandiseReward, fulfillmentReward]),
      reachesPassTwo: true,
      note:
        'Pass two still EXECUTES, but the L415 order branch matches nothing, so ' +
        'no order-level discount is produced. Distinguishing "pass two ran and ' +
        'found nothing" from "pass two never ran" is why this row and the empty ' +
        'row are both present.',
    }),
    Object.freeze({
      name: 'empty',
      rewards: Object.freeze([]),
      reachesPassTwo: false,
      note:
        '⭐ PASS TWO NEVER RUNS AT ALL. The reset at L458-L461 is INSIDE the loop ' +
        'body, so with no rewards the body never executes, `orderRewards` stays ' +
        'false and the L415 branch is unreachable. A first-class exhibit, not a ' +
        'degenerate case.',
    }),
  ]);

  // --- The qualifier ------------------------------------------------------

  const qualifierGates: QualifierGateOverrides | undefined = overrides?.qualifierGates;

  const promotionQualifier = new PromotionQualifier({
    promotionQualifierID: makeId(idPrefix, 'promotion-qualifier'),
    qualifierType: overrides?.qualifierType ?? DEFAULT_QUALIFIER_TYPE,
    // ⭐ THE TEN GATES, WITH ASYMMETRIC NULL SEMANTICS
    // [model/entity/PromotionQualifier.cfc:L55-L64]: every `minimum*` declares
    // `hb_nullRBKey="define.0"` and every `maximum*` declares
    // `hb_nullRBKey="define.unlimited"`. Reading a maximum's absence as `0`
    // instead of unlimited would turn "unlimited" into "nothing qualifies", which
    // is why the ported entity assigns all ten straight through with no `??`.
    minimumOrderQuantity: resolveGateOverride(
      qualifierGates,
      'minimumOrderQuantity',
      MINIMUM_ORDER_QUANTITY,
    ),
    maximumOrderQuantity: resolveGateOverride(
      qualifierGates,
      'maximumOrderQuantity',
      MAXIMUM_ORDER_QUANTITY,
    ),
    minimumOrderSubtotal: resolveGateOverride(
      qualifierGates,
      'minimumOrderSubtotal',
      Money.fromDecimalString(MINIMUM_ORDER_SUBTOTAL),
    ),
    maximumOrderSubtotal: resolveGateOverride(
      qualifierGates,
      'maximumOrderSubtotal',
      Money.fromDecimalString(MAXIMUM_ORDER_SUBTOTAL),
    ),
    minimumItemQuantity: resolveGateOverride(
      qualifierGates,
      'minimumItemQuantity',
      MINIMUM_ITEM_QUANTITY,
    ),
    maximumItemQuantity: resolveGateOverride(
      qualifierGates,
      'maximumItemQuantity',
      MAXIMUM_ITEM_QUANTITY,
    ),
    minimumItemPrice: resolveGateOverride(
      qualifierGates,
      'minimumItemPrice',
      Money.fromDecimalString(MINIMUM_ITEM_PRICE),
    ),
    maximumItemPrice: resolveGateOverride(
      qualifierGates,
      'maximumItemPrice',
      Money.fromDecimalString(MAXIMUM_ITEM_PRICE),
    ),
    // ⭐ WEIGHT IS NOT CURRENCY. `hb_formatType="weight"`
    // [model/entity/PromotionQualifier.cfc:L63-L64] is not
    // `hb_formatType="currency"`: these two are plain numbers and must never be
    // routed through `Money`, because no currency, rounding rule or price group
    // applies to a weight.
    minimumFulfillmentWeight: resolveGateOverride(
      qualifierGates,
      'minimumFulfillmentWeight',
      MINIMUM_FULFILLMENT_WEIGHT,
    ),
    maximumFulfillmentWeight: resolveGateOverride(
      qualifierGates,
      'maximumFulfillmentWeight',
      MAXIMUM_FULFILLMENT_WEIGHT,
    ),
    rewardMatchingType: overrides?.rewardMatchingType ?? DEFAULT_REWARD_MATCHING_TYPE,
    promotionPeriod,
    // ⭐ THIRTEEN many-to-many collections here, one fewer than the reward's
    // fourteen: a qualifier has NO `eligiblePriceGroups`. Copied, never adopted.
    fulfillmentMethodIDs: copyOf(membership.fulfillmentMethodIDs),
    shippingMethodIDs: copyOf(membership.shippingMethodIDs),
    shippingAddressZoneIDs: copyOf(membership.shippingAddressZoneIDs),
    brands: copyOf(membership.brands),
    options: copyOf(membership.options),
    skus: copyOf(membership.skus),
    products: copyOf(membership.products),
    productTypes: copyOf(membership.productTypes),
    excludedBrands: copyOf(membership.excludedBrands),
    excludedOptions: copyOf(membership.excludedOptions),
    excludedSkus: copyOf(membership.excludedSkus),
    excludedProducts: copyOf(membership.excludedProducts),
    excludedProductTypes: copyOf(membership.excludedProductTypes),
    remoteID: undefined,
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    createdByAccountID: undefined,
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: undefined,
  });

  promotionPeriod.getPromotionQualifiers().push(promotionQualifier);

  // ⭐ ALL TEN GATES OMITTED - fully permissive. Every `minimum*` reads as 0 and
  // every `maximum*` reads as unlimited, so nothing is excluded by a bound.
  const permissivePromotionQualifier = new PromotionQualifier({
    promotionQualifierID: makeId(idPrefix, 'promotion-qualifier-permissive'),
    qualifierType: DEFAULT_QUALIFIER_TYPE,
    rewardMatchingType: 'any',
    promotionPeriod,
    remoteID: undefined,
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    createdByAccountID: undefined,
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: undefined,
  });

  // --- The write-side row and the inert account row ------------------------

  const promotionApplied = new PromotionApplied({
    promotionAppliedID: makeId(idPrefix, 'promotion-applied'),
    discountAmount: resolveOverride(
      overrides,
      'discountAmount',
      Money.fromDecimalString(APPLIED_DISCOUNT_AMOUNT),
    ),
    appliedType: resolveOverride(overrides, 'appliedType', DEFAULT_APPLIED_TYPE),
    // ⭐ ABSENT BY DEFAULT, and that is parity rather than an omission:
    // `newPromotionApplied()` [model/service/PromotionService.cfc:L528-L534] sets
    // appliedType, promotion, orderItem and discountAmount and NEVER touches
    // `currencyCode`, so `undefined` is the shape an engine-produced row has.
    currencyCode: resolveOverride(overrides, 'currencyCode', undefined),
    promotion,
    promotionID,
    // ⭐ ALL THREE ARE OPAQUE STRINGS - the anti-corruption boundary. The order
    // aggregate is out of scope, so no order, order item or fulfillment object
    // exists anywhere in this module.
    orderItemID: opaqueOrderReferences.orderItemID,
    orderFulfillmentID: opaqueOrderReferences.orderFulfillmentID,
    orderID: opaqueOrderReferences.orderID,
    remoteID: undefined,
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    createdByAccountID: undefined,
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: undefined,
  });

  promotion.getAppliedPromotions().push(promotionApplied);

  // ⭐ INERT AND UNEXERCISED IN THIS SLICE. No validation file exists for it, no
  // in-scope service references it, `PromotionService.cfc` never touches it, and
  // the legacy source carries a COMMENTED-OUT `promotionPeriod` foreign key at
  // [model/entity/PromotionAccount.cfc:L59]. Supplied for completeness and
  // labelled unexercised rather than quietly presented as covered. Its `accountID`
  // stays an opaque string, because `model/entity/Account.cfc` is out of scope.
  const promotionAccount = new PromotionAccount({
    promotionAccountID: makeId(idPrefix, 'promotion-account'),
    startDateTime: resolveOverride(
      overrides,
      'promotionAccountStartDateTime',
      makeInstant(PERIOD_START_UTC),
    ),
    endDateTime: resolveOverride(
      overrides,
      'promotionAccountEndDateTime',
      makeInstant(PERIOD_END_UTC),
    ),
    promotion,
    promotionID,
    accountID: opaqueOrderReferences.accountID,
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    createdByAccountID: undefined,
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: undefined,
  });

  // --- The usage ledger ----------------------------------------------------
  //
  // ⭐ Seeded from the two DEFECT-9 exhibit rewards FIRST, then from whatever
  // `promotionRewards` holds. Two consequences, both deliberate:
  //
  //   * the defect-9 pair is present even when a caller asks for an EMPTY reward
  //     array, so `overusedRewardID` and `leakedRewardID` are never dangling; and
  //   * because seeding is first-wins [model/service/PromotionService.cfc:L172],
  //     putting the pair first means their limits are the ones that take effect -
  //     which also demonstrates the idempotence guard rather than merely
  //     describing it.
  const rewardUsageDetails: PromotionRewardUsageDetails = seedRewardUsageDetails([
    boundedUseLimitsReward,
    orderReward,
    ...promotionRewards,
  ]);

  const overusedRewardID: string = boundedUseLimitsReward.getPromotionRewardID();

  // ⭐ DISTINCT from `overusedRewardID` on purpose. LEGACY-DEFECT 9 at
  // [model/service/PromotionService.cfc:L468-L521] iterates `prID` but reads its
  // subtrahend from `promotionRewardUsageDetails[reward.getPromotionRewardID()]`
  // at L472 and walks that same LEAKED `reward`'s `orderItemsUsage` at L475-L477,
  // while the inner match at L483 and L499 compares against `prID`. If the two
  // keys coincided the wrong-key read would be indistinguishable from a correct
  // one and the defect would be invisible.
  const leakedRewardID: string = orderReward.getPromotionRewardID();

  const overusedRewardUsageDetail: PromotionRewardUsageDetail = readRewardUsageDetail(
    rewardUsageDetails,
    overusedRewardID,
  );

  const leakedRewardUsageDetail: PromotionRewardUsageDetail = readRewardUsageDetail(
    rewardUsageDetails,
    leakedRewardID,
  );

  // Pushed past its own `maximumUsePerOrder`, so the stripping loop's outer
  // condition at [model/service/PromotionService.cfc:L471] is satisfied and the
  // defect-9 body actually executes.
  overusedRewardUsageDetail.usedInOrder =
    overrides?.overusedRewardUsedInOrder ?? OVERUSED_USED_IN_ORDER;

  appendOrderItemUsage(overusedRewardUsageDetail, {
    orderItemID: opaqueOrderReferences.orderItemID,
    discountQuantity: FIRST_USAGE_DISCOUNT_QUANTITY,
    discountPerUseValue: Money.fromDecimalString(FIRST_USAGE_DISCOUNT_PER_USE_VALUE),
  });

  leakedRewardUsageDetail.usedInOrder = WITHIN_LIMIT_USED_IN_ORDER;

  // ⭐ THE SECOND order item. Two ledger entries referencing DIFFERENT order items
  // is the minimum configuration in which the wrong-key read produces a
  // different answer from the right one.
  appendOrderItemUsage(leakedRewardUsageDetail, {
    orderItemID: opaqueOrderReferences.secondOrderItemID,
    discountQuantity: SECOND_USAGE_DISCOUNT_QUANTITY,
    discountPerUseValue: Money.fromDecimalString(SECOND_USAGE_DISCOUNT_PER_USE_VALUE),
  });

  // --- The date-bound exhibits --------------------------------------------
  //
  // One FRESH period and one FRESH code per row of the truth table. Neither is
  // attached to the default promotion: nine periods on one promotion would make
  // `Promotion.getCurrentFlag()` answer a different question, and its memo would
  // freeze that answer on first read.
  const datedPromotionPeriods: readonly DatedPromotionPeriod[] = Object.freeze(
    PERIOD_DATE_BOUNDS_CASES.map((bounds: PeriodDateBoundsCase): DatedPromotionPeriod =>
      Object.freeze({
        bounds,
        promotionPeriod: new PromotionPeriod({
          promotionPeriodID: makeId(idPrefix, `promotion-period-${bounds.name}`),
          startDateTime:
            bounds.startDateTimeUTC === undefined
              ? undefined
              : makeInstant(bounds.startDateTimeUTC),
          endDateTime:
            bounds.endDateTimeUTC === undefined ? undefined : makeInstant(bounds.endDateTimeUTC),
          maximumUseCount: PERIOD_MAXIMUM_USE_COUNT,
          maximumAccountUseCount: PERIOD_MAXIMUM_ACCOUNT_USE_COUNT,
          promotion: undefined,
          promotionID,
          remoteID: undefined,
          createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
          createdByAccountID: undefined,
          modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
          modifiedByAccountID: undefined,
          now: clock,
        }),
      }),
    ),
  );

  // ⭐ THE SAME TABLE drives the codes, because `PromotionCode.getCurrentFlag()`
  // [model/entity/PromotionCode.cfc:L85-L94] is BYTE-FOR-BYTE IDENTICAL to
  // `PromotionPeriod.getCurrentFlag()` [model/entity/PromotionPeriod.cfc:L137-L146].
  // Driving both from one table is what stops the two ports drifting apart
  // unnoticed - and the code side has no `isCurrent()` counterpart at all, which
  // is itself evidence that the period's `isCurrent()` is an orphan.
  const datedPromotionCodes: readonly DatedPromotionCode[] = Object.freeze(
    PERIOD_DATE_BOUNDS_CASES.map((bounds: PeriodDateBoundsCase): DatedPromotionCode =>
      Object.freeze({
        bounds,
        promotionCode: new PromotionCode({
          promotionCodeID: makeId(idPrefix, `promotion-code-${bounds.name}`),
          promotionCode: `${promotionCodeValue}-${bounds.name}`,
          startDateTime:
            bounds.startDateTimeUTC === undefined
              ? undefined
              : makeInstant(bounds.startDateTimeUTC),
          endDateTime:
            bounds.endDateTimeUTC === undefined ? undefined : makeInstant(bounds.endDateTimeUTC),
          maximumUseCount: CODE_MAXIMUM_USE_COUNT,
          maximumAccountUseCount: CODE_MAXIMUM_ACCOUNT_USE_COUNT,
          promotion: undefined,
          promotionID,
          accounts: [],
          orders: [],
          remoteID: undefined,
          createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
          createdByAccountID: undefined,
          modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
          modifiedByAccountID: undefined,
          now: clock,
        }),
      }),
    ),
  );

  // --- The whole-promotion currency variants ------------------------------

  // ⭐ CODE-LESS: a current period and no codes at all. `getCurrentFlag()`'s
  // second conjunct [model/entity/Promotion.cfc:L88] is
  // `arrayLen(getPromotionCodes()) == 0 OR getCurrentPromotionCodeFlag()`, so this
  // promotion is current on the strength of its period alone.
  //
  // It is also the ONLY variant on which `getPromotionCodesDeletableFlag()` can be
  // called without raising, because the ported accessor is an `every` over an
  // empty collection and never invokes its callback - see
  // `promotionCodesDeletableFlagDefect`.
  const codelessPromotion: Promotion = makePromotionVariant(idPrefix, clock, {
    idSuffix: 'promotion-codeless',
    promotionName: 'Fixture Promotion (no codes)',
    periodStartUTC: PERIOD_START_UTC,
    periodEndUTC: PERIOD_END_UTC,
    includeCode: false,
    codeStartUTC: undefined,
    codeEndUTC: undefined,
  });

  // A current period but an EXPIRED code: the first conjunct holds, the second
  // fails, so the promotion is not current.
  const promotionWithOnlyExpiredCodes: Promotion = makePromotionVariant(idPrefix, clock, {
    idSuffix: 'promotion-expired-codes',
    promotionName: 'Fixture Promotion (expired code)',
    periodStartUTC: PERIOD_START_UTC,
    periodEndUTC: PERIOD_END_UTC,
    includeCode: true,
    codeStartUTC: EXPIRED_PERIOD_START_UTC,
    codeEndUTC: EXPIRED_PERIOD_END_UTC,
  });

  // An EXPIRED period but a current code: the FIRST conjunct fails, so the
  // promotion is not current no matter how valid the code is.
  const promotionWithOnlyExpiredPeriods: Promotion = makePromotionVariant(idPrefix, clock, {
    idSuffix: 'promotion-expired-periods',
    promotionName: 'Fixture Promotion (expired period)',
    periodStartUTC: EXPIRED_PERIOD_START_UTC,
    periodEndUTC: EXPIRED_PERIOD_END_UTC,
    includeCode: true,
    codeStartUTC: PERIOD_START_UTC,
    codeEndUTC: PERIOD_END_UTC,
  });

  // --- Materialized paths -------------------------------------------------
  //
  // All three built through `buildIdPathList`, so the delimiter, the root-first
  // ordering and the include-self property come from the one implementation the
  // engine's own membership walks use.
  const materializedIdPaths: MaterializedIdPaths = Object.freeze({
    productTypeIDPath: productTypeChain.leaf.getProductTypeIDPath(),
    // Taken from `./priceGroupFixtures` so both modules agree on one value.
    priceGroupIDPath: priceGroupFixtures.priceGroupIDPaths.child,
    // Built structurally rather than from entities: `Category` is NOT on this
    // fixture's dependency whitelist, so no `Category` instance may be
    // constructed here - and a comma-list path does not need one.
    categoryIDPath: buildIdPathFromIds([
      makeId(idPrefix, 'category-root'),
      makeId(idPrefix, 'category-parent'),
      makeId(idPrefix, 'category-leaf'),
    ]),
  });

  // --- The graph -----------------------------------------------------------

  return {
    // The seven-entity family.
    promotion,
    promotionPeriod,
    promotionCode,
    promotionQualifier,
    promotionRewards: copyOf(promotionRewards),
    promotionApplied,
    promotionAccount,

    // The fixed clock.
    now,
    clock,

    // rewardType: vocabulary and dispatch.
    rewardTypeVocabulary: REWARD_TYPE_VOCABULARY,
    passOneMerchandiseRewardTypeList: PASS_ONE_MERCHANDISE_REWARD_TYPE_LIST,
    // ⭐ Split with `listToArray` from `src/lib/cfml/list.ts` - the same helper the
    // engine's comma-list handling uses - then extended with the FOURTH pass-one
    // type, which the engine matches by a separate `eq` test at L345 rather than
    // through the list.
    passOneRewardTypes: Object.freeze([
      ...listToArray(PASS_ONE_MERCHANDISE_REWARD_TYPE_LIST),
      FULFILLMENT_REWARD_TYPE,
    ]),
    passTwoRewardType: ORDER_REWARD_TYPE,
    rewardTypeDispatchMap: REWARD_TYPE_DISPATCH_MAP,
    merchandiseReward,
    subscriptionReward,
    contentAccessReward,
    fulfillmentReward,
    orderReward,
    mixedCaseRewardTypeReward,

    // amountType.
    amountTypeVocabulary: AMOUNT_TYPE_VOCABULARY,
    orderRewardAmountTypeVocabulary: ORDER_REWARD_AMOUNT_TYPE_VOCABULARY,
    fixedAmountAmountTypeValue: FIXED_AMOUNT_AMOUNT_TYPE_VALUE,
    fixedAmountAmountTypeLabelKey: FIXED_AMOUNT_AMOUNT_TYPE_LABEL_KEY,
    percentageOffReward,
    amountOffReward,
    fixedAmountReward,
    absentAmountTypeReward,
    impossibleOrderFixedAmountReward,
    absentAmountReward,

    // The reference calculation.
    referenceCalculation: REFERENCE_CALCULATION,
    referenceCalculationReward,
    referenceCalculationSku: sku,

    // Use limits.
    unlimitedUseSentinel: UNLIMITED_USE_SENTINEL,
    unlimitedUseLimitsReward,
    zeroUseLimitsReward,
    negativeUseLimitsReward,
    boundedUseLimitsReward,

    // Rounding rule and price-group bridges.
    roundingRule,
    roundedReward,
    unroundedReward,
    eligiblePriceGroups: copyOf(eligiblePriceGroups),
    rewardManyToManyCollections: REWARD_MANY_TO_MANY_COLLECTIONS,
    qualifierManyToManyCollectionCount: QUALIFIER_MANY_TO_MANY_COLLECTION_COUNT,

    // Orderings.
    rewardOrderings,

    // The ledger.
    rewardUsageDetails,
    overusedRewardID,
    leakedRewardID,
    overusedRewardUsageDetail,
    leakedRewardUsageDetail,
    legacyQualificationGateIdentifier: LEGACY_QUALIFICATION_GATE_IDENTIFIER,
    opaqueOrderReferences,

    // Date bounds.
    periodDateBoundsCases: PERIOD_DATE_BOUNDS_CASES,
    datedPromotionPeriods,
    datedPromotionCodes,
    periodPredicateContrast: PERIOD_PREDICATE_CONTRAST,
    conditionalDateValidationName: CONDITIONAL_DATE_VALIDATION_NAME,
    conditionalDateValidationComparison: CONDITIONAL_DATE_VALIDATION_COMPARISON,

    // Promotion variants.
    codelessPromotion,
    promotionWithOnlyExpiredCodes,
    promotionWithOnlyExpiredPeriods,
    promotionCodesDeletableFlagDefect: PROMOTION_CODES_DELETABLE_FLAG_DEFECT,
    activeFlagOrmDefault: ACTIVE_FLAG_ORM_DEFAULT,

    // Promotion code.
    collidingPromotionCode,
    uniquePromotionCodeValidatorName: UNIQUE_PROMOTION_CODE_VALIDATOR_NAME,
    promotionCodeAccounts: copyOf(promotionCodeAccounts),
    promotionCodeOrders: copyOf(promotionCodeOrders),
    promotionCodeSetPromotionParameterName: PROMOTION_CODE_SET_PROMOTION_PARAMETER_NAME,

    // Qualifier.
    permissivePromotionQualifier,
    qualifierGateNullDefaults: QUALIFIER_GATE_NULL_DEFAULTS,
    rewardMatchingTypeVocabulary: REWARD_MATCHING_TYPE_VOCABULARY,
    qualifierOptionListMismatch: QUALIFIER_OPTION_LIST_MISMATCH,

    // Materialized paths and the membership graph.
    materializedIdPaths,
    productTypeChain: copyOf(productTypeChain.rootFirst),
    productType: productTypeChain.leaf,
    brand,
    option,
    // // JUDGMENT CALL: SHARED IDENTITY, COPIED CONTAINERS. This is the same object
    // the reward's and the qualifier's `skus` arrays hold, because a membership
    // test asks whether THIS sku is in THAT collection and two equal-but-distinct
    // SKUs would make the question meaningless. Every ARRAY that contains it is
    // still fresh per call, so a suite can splice one without reaching another
    // suite's graph.
    sku,
    product,
    excludedBrand,
    excludedProductType,

    // Collaborator doubles.
    rewardLabelProvider,

    // Census and traceability.
    promotionValidationCensus: PROMOTION_VALIDATION_CENSUS,
  };
}
