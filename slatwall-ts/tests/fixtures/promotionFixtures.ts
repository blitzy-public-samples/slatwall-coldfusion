// slatwall-ts - promotion family test data.
//
// Module #4 of 5, and the graph is acyclic by construction.
//
// CFML parity [meta/tests/unit/Helper.cfc:L53]: the legacy helper assigned `productData` without
// `var`, leaking it into component scope.

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

// JUDGMENT CALL: `src/lib/cfml/truthiness.ts` and `src/lib/cfml/struct.ts` were both read while
// writing this file - the first for the `isNull()` / `len()` absence conventions that decide how a
// nullable column is modelled here, the second for the case-insensitive struct-key semantics
// behind the ledger's keying.

// Structurally derived types.
//
// JUDGMENT CALL: four types this graph needs are declared in modules that are not among this
// fixture's declared dependencies, or are declared module-local and un-exported by a module that
// is.

/**
 * Element type of any array or readonly array.
 */
type ElementOf<TArray> = TArray extends readonly (infer TElement)[] ? TElement : never;

/**
 * The `activeFlag` column type `Promotion` accepts.
 *
 * Derived rather than imported from `src/lib/cfml/truthiness.ts`, which is not on this fixture's
 * dependency whitelist.
 */
type PromotionActiveFlagColumn = ConstructorParameters<typeof Promotion>[0]['activeFlag'];

/**
 * The `currencyCode` column type `PromotionApplied` accepts.
 *
 * Derived rather than imported from `src/domain/valueObjects/currencyCode.ts`, which is not on
 * this fixture's dependency whitelist.
 */
type PromotionAppliedCurrencyCodeColumn = ConstructorParameters<
  typeof PromotionApplied
>[0]['currencyCode'];

/**
 * The label-provider collaborator `PromotionReward` accepts.
 *
 * `PromotionRewardLabelProvider` is declared module-local and un-exported by
 * `src/domain/entities/promotionReward.ts` on purpose - the port inventory is locked.
 */
type PromotionRewardLabelProviderDouble = NonNullable<
  ConstructorParameters<typeof PromotionReward>[0]['labelProvider']
>;

/**
 * The account-link element type `PromotionCode.accounts` accepts.
 *
 * CFML parity [model/entity/PromotionCode.cfc:L65]: the legacy many-to-many points at the
 * out-of-scope `Account` entity.
 */
type PromotionCodeAccountLinkDouble = ElementOf<
  NonNullable<ConstructorParameters<typeof PromotionCode>[0]['accounts']>
>;

/**
 * The order-link element type `PromotionCode.orders` accepts.
 *
 * CFML parity [model/entity/PromotionCode.cfc:L68]: `orders` is the inverse side of
 * `SwOrderPromotionCode`, declared `lazy="extra"`, and the order aggregate is out of SCOPE. The
 * double below is an opaque identifier carrier and never a real order object.
 */
type OrderPromotionCodeLinkDouble = ElementOf<
  NonNullable<ConstructorParameters<typeof PromotionCode>[0]['orders']>
>;

// Local exhibit types.

/**
 * The seven date-bound shapes a promotion period can carry, named.
 */
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
 * One row of the date-bound truth table, with both predicates' outcomes.
 *
 * The two outcome columns are what make the divergence assertable without a suite having to
 * re-derive it.
 */
type PeriodDateBoundsCase = {
  readonly name: PeriodDateBoundsName;

  /**
   * Explicit UTC ISO-8601, or `undefined` for the nullable "forever" column.
   */
  readonly startDateTimeUTC: string | undefined;

  /**
   * Explicit UTC ISO-8601, or `undefined` for the nullable "forever" column.
   */
  readonly endDateTimeUTC: string | undefined;

  /**
   * `isCurrent(now)`: start-inclusive, end-EXCLUSIVE, and it raises on a null bound.
   */
  readonly isCurrentOutcome: boolean | 'throws';

  /**
   * `getCurrentFlag()`: null-safe, end-INCLUSIVE, memoized on first read.
   */
  readonly getCurrentFlagOutcome: boolean;

  /**
   * Does `model/validation/PromotionPeriod.json`'s `needsEndAfterStart` accept this shape?
   */
  readonly satisfiesNeedsEndAfterStart: boolean;
  readonly note: string;
};

/**
 * Which of the ten qualifier gates a row describes.
 */
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
 */
type QualifierGateNullDefault = {
  readonly gate: QualifierGateName;

  /**
   * `'minimum'` means NULL is 0; `'maximum'` means NULL is unlimited.
   */
  readonly bound: 'minimum' | 'maximum';

  /**
   * The `hb_nullRBKey` the column declares, verbatim.
   */
  readonly nullRBKey: 'define.0' | 'define.unlimited';

  /**
   * `hb_formatType` verbatim. `'weight'` is not currency and must never be routed through `Money`;
   * `'currency'` must always be.
   */
  readonly formatType: 'currency' | 'weight' | 'none';

  /**
   * Is the ported entity slot a `Money`? True for exactly the currency gates.
   */
  readonly isMonetary: boolean;
};

/**
 * The migration's reference calculation, as numerals rather than as arithmetic.
 */
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

/**
 * A named reward ORDERING, so no ordering in this file is ever incidental.
 */
type RewardOrdering = {
  readonly name: 'orderRewardLast' | 'orderRewardFirst' | 'noOrderReward' | 'empty';
  readonly rewards: readonly PromotionReward[];
  readonly reachesPassTwo: boolean;
  readonly note: string;
};

/**
 * A recorded call against the label-provider double.
 */
type RecordedRewardTypeLabelCall = {
  readonly rewardType: string;
};

/**
 * The hand-written label-provider double, with its call log.
 */
type RecordingLabelProvider = PromotionRewardLabelProviderDouble & {
  readonly rewardTypeLabelCalls: readonly RecordedRewardTypeLabelCall[];
};

// The overrides surface.
//
// Every variation this module supports flows through this one optional parameter - reward
// ordering, amount types, null and zero use limits, date boundaries, the empty-reward-array case.

interface PromotionFixtureOverrides {
  /**
   * Prefix for every generated identifier, so two graphs can be told apart.
   */
  readonly idPrefix?: string | undefined;

  /**
   * The instant every predicate in the graph is evaluated against.
   */
  readonly now?: Date | undefined;

  readonly promotionID?: string | undefined;
  readonly promotionName?: string | undefined;
  readonly promotionSummary?: string | undefined;
  readonly promotionDescription?: string | undefined;

  /**
   * CFML parity [model/entity/Promotion.cfc:L56]: `activeFlag` carries `default="1"`, so an absent
   * key yields TRUE. Passing `false` explicitly survives as `false` - the resolution below uses a
   * presence test rather than truthiness for exactly that reason.
   */
  readonly activeFlag?: PromotionActiveFlagColumn;

  /**
   * An absent key uses the documented in-bounds default; an explicit `undefined` makes the column
   * NULL.
   *
   * CFML parity [model/entity/PromotionPeriod.cfc:L53]: NULL is a first-class documented value
   * here - the column declares `hb_nullRBKey="define.forever"`.
   */
  readonly promotionPeriodStartDateTime?: Date | undefined;

  /**
   * As `promotionPeriodStartDateTime`; [model/entity/PromotionPeriod.cfc:L54].
   */
  readonly promotionPeriodEndDateTime?: Date | undefined;

  /**
   * CFML parity [model/entity/PromotionPeriod.cfc:L55]: `notnull="false"` with
   * `hb_nullRBKey="define.unlimited"`, so NULL means unlimited, never zero uses.
   */
  readonly promotionPeriodMaximumUseCount?: number | undefined;

  /**
   * As `promotionPeriodMaximumUseCount`; [model/entity/PromotionPeriod.cfc:L56].
   */
  readonly promotionPeriodMaximumAccountUseCount?: number | undefined;

  /**
   * The reward array is taken exactly as supplied and is never sorted here.
   *
   * LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L51-L132]: `getActivePromotionRewards` carries no
   * `ORDER BY` clause at all - verified by grepping the whole function body - so the order in
   * which the engine sees rewards is whatever the ORM happened to return.
   * Preserved deliberately; do not fix without a product decision.
   */
  readonly promotionRewards?: readonly PromotionReward[] | undefined;

  /**
   * The amount carried by the primary reward.
   *
   * CFML parity [model/entity/PromotionReward.cfc:L61]: `amount` is `ormType="big_decimal"` with
   * no `default` attribute, so absence is a real persisted state and is representable here by
   * passing `undefined`.
   */
  readonly rewardAmount?: Money | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L62]; absent means the default-less switch falls through.
   */
  readonly rewardAmountType?: AmountType | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L63]; deliberately un-narrowed, so mixed case is legal.
   */
  readonly rewardType?: string | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L64]; `both` | `initial` | `renewal`.
   */
  readonly rewardApplicableTerm?: ApplicableTerm | undefined;
  readonly rewardMaximumUsePerOrder?: number | undefined;
  readonly rewardMaximumUsePerItem?: number | undefined;
  readonly rewardMaximumUsePerQualification?: number | undefined;

  /**
   * The reward's nullable rounding rule [model/entity/PromotionReward.cfc:L71].
   *
   * An absent key bridges to `./priceGroupFixtures` for a real rule; an explicit `undefined`
   * reproduces `hb_optionsNullRBKey="define.none"`.
   */
  readonly roundingRule?: RoundingRule | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L74]; bridges to `./priceGroupFixtures`.
   */
  readonly eligiblePriceGroups?: readonly PriceGroup[] | undefined;

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

  /**
   * [model/entity/PromotionReward.cfc:L76]; opaque IDs, the far entities are out of scope.
   */
  readonly fulfillmentMethodIDs?: readonly string[] | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L78]; opaque IDs.
   */
  readonly shippingMethodIDs?: readonly string[] | undefined;

  /**
   * [model/entity/PromotionReward.cfc:L77]; opaque IDs.
   */
  readonly shippingAddressZoneIDs?: readonly string[] | undefined;

  /**
   * CFML parity [model/entity/PromotionCode.cfc:L53]: the ORM property carries no `unique`
   * attribute.
   */
  readonly promotionCodeValue?: string | undefined;

  /**
   * [model/entity/PromotionCode.cfc:L54]; absent uses the default, explicit `undefined` is NULL.
   */
  readonly promotionCodeStartDateTime?: Date | undefined;
  readonly promotionCodeEndDateTime?: Date | undefined;

  /**
   * [model/entity/PromotionCode.cfc:L56]; NULL means unlimited.
   */
  readonly promotionCodeMaximumUseCount?: number | undefined;

  /**
   * [model/entity/PromotionCode.cfc:L57]; NULL means unlimited.
   */
  readonly promotionCodeMaximumAccountUseCount?: number | undefined;

  /**
   * CFML parity [model/service/PromotionService.cfc:L793]: the qualifier side matches with
   * `listFindNoCase("merchandise,subscription,contentAccess", qualifier.getQualifierType())` - the
   * same three-value vocabulary the merchandise-side reward match uses at L198.
   */
  readonly qualifierType?: string | undefined;

  /**
   * [model/entity/PromotionQualifier.cfc:L65]; `any` | `sku` | `product` | `productType` |
   * `brand`.
   */
  readonly rewardMatchingType?: RewardMatchingType | undefined;

  /**
   * The ten numeric gates, each independently overridable; absent uses the documented bound.
   */
  readonly qualifierGates?: QualifierGateOverrides | undefined;

  /**
   * [model/entity/PromotionApplied.cfc:L61]; opaque - never an order object.
   */
  readonly orderID?: string | undefined;
  readonly orderItemID?: string | undefined;
  readonly secondOrderItemID?: string | undefined;
  readonly orderFulfillmentID?: string | undefined;

  /**
   * [model/entity/PromotionAccount.cfc:L58]; opaque - the `Account` entity is out of scope.
   */
  readonly accountID?: string | undefined;

  /**
   * [model/entity/PromotionApplied.cfc:L53]; `big_decimal`, therefore `Money`.
   */
  readonly discountAmount?: Money | undefined;

  /**
   * [model/entity/PromotionApplied.cfc:L54]; the engine writes only `'orderItem'` at L530.
   */
  readonly appliedType?: PromotionAppliedType | undefined;

  /**
   * [model/entity/PromotionApplied.cfc:L55]; absent by default, deliberately.
   *
   * CFML parity [model/service/PromotionService.cfc:L528-L534]: the engine's
   * `newPromotionApplied()` sets appliedType, promotion, orderItem and discountAmount and never
   * TOUCHES `currencyCode`.
   */
  readonly currencyCode?: PromotionAppliedCurrencyCodeColumn;
  readonly promotionAccountStartDateTime?: Date | undefined;
  readonly promotionAccountEndDateTime?: Date | undefined;
  readonly overusedRewardUsedInOrder?: number | undefined;
}

/**
 * The ten qualifier gates, overridable one at a time.
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
  readonly minimumFulfillmentWeight?: number | undefined;

  /**
   * Not `Money`, for the same reason; [model/entity/PromotionQualifier.cfc:L64].
   */
  readonly maximumFulfillmentWeight?: number | undefined;
}

// Local record types for the graph's annotation exhibits.

/**
 * A promotion period paired with the truth-table row it was built from.
 */
type DatedPromotionPeriod = {
  readonly bounds: PeriodDateBoundsCase;
  readonly promotionPeriod: PromotionPeriod;
};

/**
 * A promotion code paired with the same truth-table row.
 *
 * Deliberately driven off the identical table as {@link DatedPromotionPeriod}.
 */
type DatedPromotionCode = {
  readonly bounds: PeriodDateBoundsCase;
  readonly promotionCode: PromotionCode;
};

/**
 * The opaque identifiers this module hands out in place of out-of-scope entities.
 *
 * The order aggregate, `OrderItem`, `OrderFulfillment` and `Account` are all out of scope.
 */
type OpaqueOrderReferences = {
  readonly orderID: string;
  readonly orderItemID: string;

  /**
   * The SECOND order item, which must differ from the first.
   *
   * Two distinct order items are what make LEGACY-DEFECT 9 visible at all - see the ledger member
   * on the graph.
   */
  readonly secondOrderItemID: string;

  readonly orderFulfillmentID: string;

  /**
   * [model/entity/PromotionAccount.cfc:L58] and [model/entity/PromotionCode.cfc:L65].
   */
  readonly accountID: string;
};

/**
 * The contrast between the promotion period's two currency predicates, and the record that one of
 * them has no caller.
 */
type PeriodPredicateContrast = {
  /**
   * `'isCurrent'` - the predicate with no caller anywhere in the legacy tree.
   */
  readonly deadPredicate: string;

  /**
   * Where the dead predicate is declared, which is also its only occurrence.
   */
  readonly deadPredicateLocator: string;

  /**
   * `'getCurrentFlag'` - the predicate the engine actually consults.
   */
  readonly livePredicate: string;

  readonly livePredicateLocator: string;

  /**
   * The call path that reaches the live predicate, outermost first.
   */
  readonly livePredicateCallPath: readonly string[];

  /**
   * Does the dead predicate guard a null bound? No - it dereferences both.
   */
  readonly deadPredicateGuardsNullBounds: boolean;

  /**
   * Does the live predicate guard a null bound? Yes - null means "forever".
   */
  readonly livePredicateGuardsNullBounds: boolean;

  /**
   * The dead predicate's end comparison is EXCLUSIVE (`>`).
   */
  readonly deadPredicateEndBoundInclusive: boolean;

  /**
   * The live predicate's end comparison is INCLUSIVE (negated `<`).
   */
  readonly livePredicateEndBoundInclusive: boolean;

  /**
   * The dead predicate captures `now()` once into a local.
   */
  readonly deadPredicateNowCallCount: number;

  /**
   * The live predicate calls `now()` twice inline, so it is not atomic.
   */
  readonly livePredicateNowCallCount: number;

  /**
   * Only the live predicate memoizes, freezing its first answer for the object's life.
   */
  readonly livePredicateMemoizes: boolean;
};

/**
 * The four spellings behind the never-caching promotion-codes-deletable memo.
 */
type PromotionCodesDeletableFlagDefect = {
  /**
   * The accessor's own name, which is correct.
   */
  readonly methodName: string;

  /**
   * The property DECLARED at [model/entity/Promotion.cfc:L79] - plural, correct.
   */
  readonly declaredPropertyName: string;

  /**
   * The key the existence GUARD tests at [model/entity/Promotion.cfc:L124] - singular.
   */
  readonly guardedKeyName: string;

  /**
   * The key assigned and returned at L125, L128 and L133 - singular plus a stray `e`.
   */
  readonly assignedKeyName: string;

  /**
   * How many DISTINCT spellings the five sites use between them.
   */
  readonly distinctSpellingCount: number;

  /**
   * Because the guard never matches the assignment, the memo can never hit.
   */
  readonly memoCanEverHit: boolean;

  /**
   * The declarative wiring that puts the defect on a validated path.
   */
  readonly validationLocator: string;

  /**
   * Whether the ported accessor raises when it reaches a materialized promotion code.
   *
   * `false`: it did raise while `promotionCode.ts` declared no `isDeletable()`, and it no longer
   * does. Exposed as data so a suite asserts the answer rather than discovering it.
   */
  readonly portedAccessorRaisesOnMaterializedCode: boolean;

  /**
   * What closes the cross-file contract, stated so it is checkable rather than noted.
   */
  readonly resolvedBy: string;
};

/**
 * The qualifier's option-list property/accessor MISMATCH: one declared property with no provider,
 * one provider with no declared property.
 */
type QualifierOptionListMismatch = {
  /**
   * Declared at [model/entity/PromotionQualifier.cfc:L99]; nothing implements it.
   */
  readonly declaredPropertyWithoutProvider: string;

  readonly declaredPropertyLocator: string;

  /**
   * Implemented at [model/entity/PromotionQualifier.cfc:L107-L115]; nothing declares it.
   */
  readonly providerWithoutDeclaredProperty: string;

  readonly providerLocator: string;

  /**
   * The persistent property the orphaned provider actually serves.
   */
  readonly providerServesProperty: string;
};

/**
 * One row of the reward-type dispatch map, with the pass it routes into.
 */
type RewardTypeDispatchRow = {
  readonly rewardType: string;

  /**
   * `'one'` is the item/fulfillment pass; `'two'` is the order pass.
   */
  readonly pass: 'one' | 'two';

  /**
   * The exact site in the engine that routes this reward type.
   */
  readonly locator: string;

  /**
   * True where the site uses `listFindNoCase`; false where it uses CFML `eq`.
   */
  readonly matchIsCaseInsensitive: boolean;
};

/**
 * One of the reward's fourteen many-to-many link tables.
 */
type RewardManyToManyCollection = {
  readonly property: string;
  readonly linkTable: string;

  /**
   * True for exactly three of the fourteen; the target normalises all fourteen.
   */
  readonly declaresTypeArray: boolean;

  readonly locator: string;
};

/**
 * One row of the promotion family's validation-file census.
 */
type ValidationFileCensusRow = {
  readonly entity: string;
  readonly validationFile: string;
  readonly present: boolean;

  /**
   * Line count where present, `undefined` where absent - never `0`.
   */
  readonly lineCount: number | undefined;
};

/**
 * The three materialized comma-list ID paths the membership tests walk.
 */
type MaterializedIdPaths = {
  /**
   * Walked by [model/service/PromotionService.cfc:L858-L870] and:L921-L985.
   */
  readonly productTypeIDPath: string;

  /**
   * Sourced from `./priceGroupFixtures`, so both modules agree on one value.
   */
  readonly priceGroupIDPath: string;

  /**
   * Built structurally: `Category` is not on this fixture's dependency whitelist.
   */
  readonly categoryIDPath: string;
};

// The returned graph.
//
// A consumer reaches every entity and every exhibit through this one value.

interface PromotionFixtureGraph {
  /**
   * `SlatwallPromotion`, table `SwPromotion`.
   *
   * The default is the CODED variant: one current period and one current code, so
   * `getCurrentFlag()` [model/entity/Promotion.cfc:L83-L92] is true through both of its conjuncts.
   */
  readonly promotion: Promotion;

  /**
   * `SlatwallPromotionPeriod`, table `SwPromotionPeriod` - the FULL name, unlike the abbreviated
   * `SwPromoReward` and `SwPromoQual`.
   *
   * Bounds default to `nowStrictlyInside`, so both currency predicates agree.
   */
  readonly promotionPeriod: PromotionPeriod;

  /**
   * `SlatwallPromotionCode`, table `SwPromotionCode`.
   */
  readonly promotionCode: PromotionCode;

  /**
   * `SlatwallPromotionQualifier`, table `SwPromoQual`.
   */
  readonly promotionQualifier: PromotionQualifier;

  /**
   * The reward array, in the order this graph was asked for - never sorted here.
   *
   * [0] a `merchandise` reward - pass one, via the `listFindNoCase` list at
   * [model/service/PromotionService.cfc:L198].
   *
   * `rewardOrderings` exposes the same rewards under other arrangements, including the empty
   * array, so a suite never depends on this default.
   */
  readonly promotionRewards: readonly PromotionReward[];

  /**
   * `SlatwallPromotionApplied`, table `SwPromotionApplied` - the engine's WRITE-SIDE output.
   *
   * Its three order-side foreign keys are opaque strings; see `opaqueOrderReferences`.
   */
  readonly promotionApplied: PromotionApplied;

  /**
   * `SlatwallPromotionAccount`, table `SwPromotionAccount` - the full name again.
   */
  readonly promotionAccount: PromotionAccount;

  /**
   * The single instant every predicate in this graph is evaluated against.
   *
   * A FRESH `Date` per call, built from an explicit UTC ISO-8601 literal.
   */
  readonly now: Date;

  /**
   * The clock closure handed to `PromotionPeriod` and `PromotionCode`, both of which take
   * `now: () => Date` as a REQUIRED constructor slot.
   *
   * Returns a fresh `Date` carrying the same instant on every call, so a suite cannot mutate the
   * graph's notion of "now" by mutating a returned `Date`.
   */
  readonly clock: () => Date;

  /**
   * The five `rewardType` values in exact source order, from the "Valid Reward Types" vocabulary
   * comment at [model/entity/PromotionReward.cfc:L48-L54].
   */
  readonly rewardTypeVocabulary: readonly string[];

  /**
   * The comma list the engine matches pass-one MERCHANDISE-side rewards against, verbatim from
   * [model/service/PromotionService.cfc:L198].
   */
  readonly passOneMerchandiseRewardTypeList: string;

  /**
   * AAP correction #7, first half: pass one handles four reward types - the three in the comma
   * list above plus `fulfillment`, matched by a separate `eq` test at
   * [model/service/PromotionService.cfc:L345].
   *
   * Split with `listToArray` from `src/lib/cfml/list.ts` - the same helper the engine's own
   * comma-list handling uses - rather than by a hand-written `String.prototype.split`.
   */
  readonly passOneRewardTypes: readonly string[];

  /**
   * AAP correction #7, second half: pass two handles exactly one - `order`, at
   * [model/service/PromotionService.cfc:L415].
   */
  readonly passTwoRewardType: string;

  /**
   * The full dispatch map as data, one row per routed reward type.
   */
  readonly rewardTypeDispatchMap: readonly RewardTypeDispatchRow[];

  /**
   * Pass one, matched through the comma list at L198.
   */
  readonly merchandiseReward: PromotionReward;

  /**
   * Pass one, matched through the comma list at L198.
   */
  readonly subscriptionReward: PromotionReward;

  /**
   * Pass one, matched through the comma list at L198.
   */
  readonly contentAccessReward: PromotionReward;

  /**
   * Pass one, matched by the separate `eq "fulfillment"` test at L345.
   */
  readonly fulfillmentReward: PromotionReward;

  /**
   * PASS two, and the only reward type that reaches it.
   *
   * It is also the reward whose amount-type vocabulary is RESTRICTED to two values by
   * `getAmountTypeOptions()` [model/entity/PromotionReward.cfc:L120-L133].
   */
  readonly orderReward: PromotionReward;

  /**
   * `rewardType` spelled `'Merchandise'` - capitalised.
   *
   * CFML parity [model/service/PromotionService.cfc:L198, L793]: both matching sites use
   * `listFindNoCase`, which is CASE-INSENSITIVE, so this reward is a pass-one merchandise reward
   * in the legacy engine.
   */
  readonly mixedCaseRewardTypeReward: PromotionReward;

  /**
   * The three values `getAmountTypeOptions()` offers a NON-order reward.
   */
  readonly amountTypeVocabulary: readonly [AmountType, AmountType, AmountType];

  /**
   * The two values it offers an `order` reward - `amount` is withheld.
   */
  readonly orderRewardAmountTypeVocabulary: readonly [AmountType, AmountType];

  /**
   * The STORED value for a fixed amount: `'amount'`.
   *
   * CFML parity [model/entity/PromotionReward.cfc:L129]: the option's display key is
   * `define.fixedAmount` while its value is `amount`. Everything in this module uses the VALUE;
   * the label is exposed separately so the mismatch is visible rather than a trap.
   */
  readonly fixedAmountAmountTypeValue: AmountType;

  /**
   * The display key for that same option, recorded but never used as a value.
   */
  readonly fixedAmountAmountTypeLabelKey: string;

  /**
   * `amountType = 'percentageOff'`; the `precisionEvaluate`-guarded branch at L995.
   */
  readonly percentageOffReward: PromotionReward;

  /**
   * `amountType = 'amountOff'`.
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L998]: this branch alone omits
   * `precisionEvaluate` and multiplies with raw floating point, while every neighbouring branch is
   * guarded. //
   * Preserved deliberately; do not fix without a product decision.
   * JUDGMENT CALL: not reproduced.
   */
  readonly amountOffReward: PromotionReward;

  /**
   * `amountType = 'amount'` on a NON-order reward - the legal fixed-amount case.
   */
  readonly fixedAmountReward: PromotionReward;

  /**
   * `AmountType` is a CLOSED union in the target, so an unrecognised string literal is not
   * expressible without a cast - and a cast is not available here.
   */
  readonly absentAmountTypeReward: PromotionReward;

  /**
   * The impossible-but-representable state: `rewardType: 'order'` together with
   * `amountType: 'amount'`.
   *
   * `getAmountTypeOptions()` [model/entity/PromotionReward.cfc:L120-L133] does not offer `amount`
   * for an order-level reward, so the legacy admin cannot produce this combination.
   */
  readonly impossibleOrderFixedAmountReward: PromotionReward;

  /**
   * `amount` absent - invalid by validation, deliberately.
   *
   * CFML parity [model/entity/PromotionReward.cfc:L61]: the column carries no `default`, so
   * absence is a real persisted state.
   */
  readonly absentAmountReward: PromotionReward;

  /**
   * The reference calculation as NUMERALS, never as arithmetic.
   *
   * 19.99 x 3 = 59.97; 12.5 % of that is 7.49625; the net is 52.47375; presented to two places it
   * is `"52.47"`.
   *
   * The values are the same literals `./priceGroupFixtures` publishes, so the two modules cannot
   * disagree about the migration's own worked example.
   */
  readonly referenceCalculation: ReferenceCalculation;

  /**
   * A `percentageOff` reward carrying EXACTLY `'12.5'`, so the reference calculation is drivable
   * directly rather than reconstructed by a suite.
   */
  readonly referenceCalculationReward: PromotionReward;

  /**
   * The SKU the reference calculation prices, from `./skuFixtures`, whose default price is already
   * `'19.99'` - the reference unit price. Sourced rather than rebuilt so both modules price the
   * same object.
   */
  readonly referenceCalculationSku: Sku;

  /**
   * Imported as a type from `src/domain/promotionEngine/rewardUsageTypes.ts` -
   * `UnlimitedUseSentinel` is a TYPE alias with zero runtime footprint.
   */
  readonly unlimitedUseSentinel: UnlimitedUseSentinel;

  /**
   * All three limits ABSENT - the documented "unlimited" shape.
   *
   * CFML parity [model/entity/PromotionReward.cfc:L65-L67]: each column carries
   * `hb_nullRBKey="define.unlimited"`, and `model/validation/PromotionReward.json` leaves all
   * three merely `numeric` rather than required, so NULL is the validated, legitimate shape.
   */
  readonly unlimitedUseLimitsReward: PromotionReward;

  /**
   * All three limits explicitly `0` - which also means unlimited.
   *
   * LEGACY-DEFECT [model/service/PromotionService.cfc:L180-L188]: each limit overrides the 1000000
   * sentinel only when `!isNull(...) AND > 0`.
   * Preserved deliberately; do not fix without a product decision.
   *
   * AAP correction #4: the plan records only null as meaning unlimited.
   */
  readonly zeroUseLimitsReward: PromotionReward;

  /**
   * All three limits NEGATIVE - unlimited for the same reason as zero.
   *
   * Not a hypothetical: nothing in the ORM metadata or in `model/validation/PromotionReward.json`
   * constrains the sign, so a negative value is persistable and takes the same fall-through.
   */
  readonly negativeUseLimitsReward: PromotionReward;

  /**
   * All three limits POSITIVE - the only shape that actually overrides the sentinel, and therefore
   * the only shape under which use-limit enforcement is observable at all.
   */
  readonly boundedUseLimitsReward: PromotionReward;

  /**
   * The reward's rounding rule, sourced from `./priceGroupFixtures` so both modules round with one
   * rule rather than two look-alikes.
   */
  readonly roundingRule: RoundingRule;

  /**
   * A reward with the rounding rule attached - the rounded discount branch.
   */
  readonly roundedReward: PromotionReward;

  /**
   * A reward with no rounding rule.
   *
   * CFML parity [model/entity/PromotionReward.cfc:L71]: the many-to-one is nullable and declares
   * `hb_optionsNullRBKey="define.none"`, so "no rounding" is a first-class configured state and
   * not a missing value.
   */
  readonly unroundedReward: PromotionReward;

  /**
   * `eligiblePriceGroups`, over `SwPromoRewardEligiblePriceGrp`
   * [model/entity/PromotionReward.cfc:L74] - the reward's second bridge into
   * `./priceGroupFixtures`.
   */
  readonly eligiblePriceGroups: readonly PriceGroup[];

  /**
   * All FOURTEEN of the reward's many-to-many link tables, as data.
   *
   * Only three declare `type="array"` in the legacy source - `eligiblePriceGroups`
   * [model/entity/PromotionReward.cfc:L74], `excludedBrands`
   * [model/entity/PromotionReward.cfc:L86] and `excludedOptions`
   * [model/entity/PromotionReward.cfc:L87].
   */
  readonly rewardManyToManyCollections: readonly RewardManyToManyCollection[];

  /**
   * The qualifier's count for the same census: THIRTEEN, one fewer than the reward's fourteen,
   * because the qualifier has no `eligiblePriceGroups`.
   */
  readonly qualifierManyToManyCollectionCount: number;

  /**
   * The named arrangements of the same rewards, each recording whether it reaches pass two.
   *
   * This member exists so that no suite ever relies on an incidental order.
   */
  readonly rewardOrderings: readonly RewardOrdering[];

  /**
   * The TYPE is imported from `src/domain/promotionEngine/rewardUsageTypes.ts` and is never
   * redeclared here - one owner for the contract, one place a change to it breaks the build.
   *
   * Seeding reproduces [model/service/PromotionService.cfc:L172-L188] exactly: every limit starts
   * at the 1000000 sentinel and is overridden only by a present, strictly-positive column value.
   */
  readonly rewardUsageDetails: PromotionRewardUsageDetails;
  readonly overusedRewardID: string;

  /**
   * The reward ID that `reward.getPromotionRewardID()` resolves to when the stripping loop reads
   * it - the LAST reward the preceding loop touched, which is the value that leaks out of it.
   *
   * Distinct from `overusedRewardID`, deliberately: if the two coincided the wrong-key read would
   * be indistinguishable from a correct one.
   */
  readonly leakedRewardID: string;
  readonly overusedRewardUsageDetail: PromotionRewardUsageDetail;

  /**
   * The leaked entry, likewise.
   */
  readonly leakedRewardUsageDetail: PromotionRewardUsageDetail;

  // The REVERSE direction of both inner searches in the stripping loop
  // [model/service/PromotionService.cfc:L482, L498] is not published here as a boolean.

  /**
   * The identifier that gates the whole reward body at [model/service/PromotionService.cfc:L197],
   * spelled as the legacy source spells it: `qualificationsMeet`, not `qualificationsMet`.
   */
  readonly legacyQualificationGateIdentifier: string;

  /**
   * The opaque out-of-scope identifiers this graph hands out.
   */
  readonly opaqueOrderReferences: OpaqueOrderReferences;

  /**
   * The NINE date-bound shapes, with both predicates' outcomes per shape.
   *
   * Every bound is an explicit UTC ISO-8601 string literal or `undefined`.
   */
  readonly periodDateBoundsCases: readonly PeriodDateBoundsCase[];

  /**
   * One FRESH `PromotionPeriod` per row of that table.
   */
  readonly datedPromotionPeriods: readonly DatedPromotionPeriod[];

  /**
   * One FRESH `PromotionCode` per row of the same table - see {@link DatedPromotionCode}.
   */
  readonly datedPromotionCodes: readonly DatedPromotionCode[];
  readonly periodPredicateContrast: PeriodPredicateContrast;

  /**
   * The named condition both `model/validation/PromotionCode.json` and
   * `model/validation/PromotionPeriod.json` declare: when both bounds are present, `endDateTime`
   * must be `gtProperty: "startDateTime"`.
   */
  readonly conditionalDateValidationName: string;

  /**
   * The comparison the condition applies, recorded as data.
   */
  readonly conditionalDateValidationComparison: string;

  /**
   * A promotion with a current period and no promotion codes at all.
   *
   * Code-less and coded promotions behave DIFFERENTLY in `getCurrentFlag()`
   * [model/entity/Promotion.cfc:L83-L92]: the second conjunct is
   * `arrayLen(getPromotionCodes()) == 0 OR getCurrentPromotionCodeFlag()`, so a code-less
   * promotion is current on the strength of its period alone.
   */
  readonly codelessPromotion: Promotion;

  /**
   * A current period but only expired codes - the second conjunct fails.
   */
  readonly promotionWithOnlyExpiredCodes: Promotion;

  /**
   * Only expired periods but a current code - the FIRST conjunct fails.
   */
  readonly promotionWithOnlyExpiredPeriods: Promotion;

  /**
   * The four spellings behind the never-caching deletable-flag memo.
   */
  readonly promotionCodesDeletableFlagDefect: PromotionCodesDeletableFlagDefect;

  /**
   * CFML parity [model/entity/Promotion.cfc:L56]: `activeFlag` declares `default="1"`, so an unset
   * column reads TRUE - the same as `Sku`, and unlike `Product`, which declares no default at all.
   */
  readonly activeFlagOrmDefault: boolean;

  /**
   * A second code carrying the same `promotionCode` value as `promotionCode`, attached to the same
   * promotion - invalid by validation.
   *
   * CFML parity: uniqueness is enforced by the CUSTOM validator `hasUniquePromotionCode` wired
   * declaratively in `model/validation/PromotionCode.json`, not by a declarative `unique:true` on
   * the ORM property.
   */
  readonly collidingPromotionCode: PromotionCode;

  /**
   * The custom validator's name, recorded so the wiring is checkable.
   */
  readonly uniquePromotionCodeValidatorName: string;

  /**
   * The code's account links, over `SwPromotionCodeAccount` [model/entity/PromotionCode.cfc:L65].
   *
   * The far side is the OUT-OF-SCOPE `Account` entity, so each link is a narrow structural double
   * carrying an opaque `accountID` and the two probes the bidirectional helpers call.
   */
  readonly promotionCodeAccounts: readonly PromotionCodeAccountLinkDouble[];

  /**
   * The code's order links, over `SwOrderPromotionCode` [model/entity/PromotionCode.cfc:L68].
   */
  readonly promotionCodeOrders: readonly OrderPromotionCodeLinkDouble[];

  /**
   * CFML parity [model/entity/PromotionCode.cfc:L105]: `setPromotion` reads `arguments.Promotion`
   * with a CAPITAL P while its own parameter is declared lowercase - legal in CFML, where argument
   * names are case-insensitive.
   */
  readonly promotionCodeSetPromotionParameterName: string;

  /**
   * A qualifier with all ten gates absent - fully permissive.
   */
  readonly permissivePromotionQualifier: PromotionQualifier;

  /**
   * The ten gates' null semantics and format types, as an assertable table.
   */
  readonly qualifierGateNullDefaults: readonly QualifierGateNullDefault[];

  /**
   * The `rewardMatchingType` vocabulary from [model/entity/PromotionQualifier.cfc:L107-L115]:
   * `any`, `sku`, `product`, `productType`, `brand`.
   */
  readonly rewardMatchingTypeVocabulary: readonly RewardMatchingType[];

  /**
   * AAP CORRECTION #6: the declared-property / provider mismatch.
   */
  readonly qualifierOptionListMismatch: QualifierOptionListMismatch;

  /**
   * The three comma-list ID paths the membership tests walk.
   *
   * Built with `buildIdPathList` from `src/domain/valueObjects/materializedIdPath.ts` rather than
   * hand-written, so the delimiter.
   */
  readonly materializedIdPaths: MaterializedIdPaths;

  /**
   * The product-type chain, ROOT FIRST, at least three levels deep.
   *
   * Depth matters: a one-level chain makes `productTypeIDPath` a single ID, and a path-containment
   * test over a single ID passes for the wrong reason.
   */
  readonly productTypeChain: readonly ProductType[];

  /**
   * The LEAF product type - the one a membership test starts from.
   */
  readonly productType: ProductType;

  /**
   * The brand on both the reward's and the qualifier's `brands` collections.
   */
  readonly brand: Brand;

  /**
   * The option on both `options` collections.
   */
  readonly option: Option;

  /**
   * The SKU on both `skus` collections, and the one the reference calculation prices.
   *
   * JUDGMENT CALL: shared identity, copied containers. This is the same object the reward's
   * `skus` array holds, because a membership test asks whether this sku is in that collection and
   * two equal-but-distinct SKUs would make the question meaningless.
   */
  readonly sku: Sku;

  /**
   * The product on both `products` collections.
   */
  readonly product: Product;

  /**
   * A brand on the exclusion side, over `SwPromoRewardExclBrand`.
   */
  readonly excludedBrand: Brand;

  /**
   * A product type on the exclusion side, over `SwPromoRewardExclProductType`.
   */
  readonly excludedProductType: ProductType;

  /**
   * The reward's label provider, with a call log.
   *
   * A hand-written recording double: no mocking library is installed, the legacy suite had none
   * either, and the dependency set is frozen at the thirteen exact pins `package.json` declares.
   */
  readonly rewardLabelProvider: RecordingLabelProvider;

  /**
   * The promotion family's validation-file census: four present, three ABSENT.
   *
   * `PromotionQualifier.json`, `PromotionApplied.json` and `PromotionAccount.json` do not EXIST -
   * verified by listing `model/validation/` directly, not inferred.
   */
  readonly promotionValidationCensus: readonly ValidationFileCensusRow[];

  // The `issue_1766` regression-ticket identifier for the preserved return/exchange no-op
  // [model/service/PromotionService.cfc:L542-L544] is not published here.
}

// Every constant below is an immutable primitive - a `string`, a `number` or a `boolean` - or a
// frozen array or object of them.

/**
 * Default identifier prefix, so a graph's IDs are recognisable in a failure message.
 */
const DEFAULT_ID_PREFIX = 'promofx';

// Every instant in this module is an explicit UTC ISO-8601 string literal.

/**
 * The single instant every predicate in a graph is evaluated against.
 */
const NOW_UTC = '2024-06-15T12:00:00.000Z';

/**
 * Two weeks before `NOW_UTC`, so `now` sits strictly inside the default window.
 */
const PERIOD_START_UTC = '2024-06-01T00:00:00.000Z';

/**
 * Two weeks after `NOW_UTC`, likewise.
 */
const PERIOD_END_UTC = '2024-07-01T00:00:00.000Z';

/**
 * A window that closed before `NOW_UTC` - both predicates agree it is not current.
 */
const EXPIRED_PERIOD_START_UTC = '2024-01-01T00:00:00.000Z';

/**
 * The end bound of that same closed window.
 */
const EXPIRED_PERIOD_END_UTC = '2024-02-01T00:00:00.000Z';

/**
 * A start bound after `NOW_UTC`, used by the `endBeforeStart` row so that row is invalid on the
 * validation axis and not-current on the predicate axis.
 */
const FUTURE_PERIOD_START_UTC = '2024-07-01T00:00:00.000Z';

/**
 * Audit-column instants, matching the literals `./priceGroupFixtures` publishes.
 */
const CREATED_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';

/**
 * The modified-audit counterpart of that instant.
 */
const MODIFIED_DATE_TIME_UTC = '2024-06-15T12:30:00.000Z';

// P4 binds fixtures as well as production code: no raw floating-point operation on a monetary
// value appears anywhere here, not even inside an expected value.

/**
 * The SKU unit price; also `./skuFixtures`' own default price.
 */
const REFERENCE_UNIT_PRICE = '19.99';

/**
 * The order-item quantity. A COUNT, not money - so a plain `number` is correct.
 */
const REFERENCE_QUANTITY = 3;
const REFERENCE_EXTENDED_PRICE = '59.97';

/**
 * The `percentageOff` reward amount that drives the worked example.
 */
const REFERENCE_PERCENTAGE_OFF = '12.5';

/**
 * 12.5 % of 59.97, unrounded and undrifted.
 */
const REFERENCE_DISCOUNT_AMOUNT = '7.49625';
const REFERENCE_NET_AMOUNT = '52.47375';

/**
 * The net, presented through `numberFormat(v,"0.00")`.
 */
const REFERENCE_PRESENTED_NET_AMOUNT = '52.47';

/**
 * The DISCOUNT, presented the same way - which is what L1017 actually formats.
 */
const REFERENCE_PRESENTED_DISCOUNT_AMOUNT = '7.50';

/**
 * A flat `amountOff` / fixed-`amount` figure.
 */
const FLAT_DISCOUNT_AMOUNT = '5.00';

/**
 * A qualifier order-subtotal floor.
 */
const MINIMUM_ORDER_SUBTOTAL = '25.00';

/**
 * A qualifier order-subtotal ceiling.
 */
const MAXIMUM_ORDER_SUBTOTAL = '500.00';

/**
 * A qualifier item-price floor.
 */
const MINIMUM_ITEM_PRICE = '9.99';

/**
 * A qualifier item-price ceiling.
 */
const MAXIMUM_ITEM_PRICE = '199.99';

/**
 * A discount already applied to an order item, on the write-side row.
 */
const APPLIED_DISCOUNT_AMOUNT = '7.50';

/**
 * WEIGHT, not MONEY. `hb_formatType="weight"` [model/entity/PromotionQualifier.cfc:L63-L64] is not
 * `hb_formatType="currency"`, so these two are plain numbers and are never routed through `Money`.
 */
const MINIMUM_FULFILLMENT_WEIGHT = 1;

/**
 * Weight, not money - see above.
 */
const MAXIMUM_FULFILLMENT_WEIGHT = 50;

const MINIMUM_ORDER_QUANTITY = 2;
const MAXIMUM_ORDER_QUANTITY = 20;
const MINIMUM_ITEM_QUANTITY = 1;
const MAXIMUM_ITEM_QUANTITY = 10;

/**
 * Typed by `UnlimitedUseSentinel`, which is a TYPE alias over the literal and carries no runtime
 * value of its own, so the number is written once here and the compiler rejects any other.
 */
const UNLIMITED_USE_SENTINEL: UnlimitedUseSentinel = 1000000;

/**
 * A normal positive per-order bound - the only shape that overrides the sentinel.
 */
const BOUNDED_MAXIMUM_USE_PER_ORDER = 2;

/**
 * A normal positive per-item bound.
 */
const BOUNDED_MAXIMUM_USE_PER_ITEM = 1;

/**
 * A normal positive per-qualification bound.
 */
const BOUNDED_MAXIMUM_USE_PER_QUALIFICATION = 3;

/**
 * An explicit ZERO limit.
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L180-L188]: the seeding block overrides a
 * limit only when `!isNull(...) AND > 0`, so zero fails the test and the 1000000 sentinel survives
 * zero means unlimited, not "disabled".
 * Preserved deliberately; do not fix without a product decision.
 */
const ZERO_USE_LIMIT = 0;

/**
 * A NEGATIVE limit, which takes the same fall-through as zero for the same reason.
 */
const NEGATIVE_USE_LIMIT = -1;

/**
 * The period's own total-use cap [model/entity/PromotionPeriod.cfc:L55].
 */
const PERIOD_MAXIMUM_USE_COUNT = 100;

/**
 * The period's per-account cap [model/entity/PromotionPeriod.cfc:L56].
 */
const PERIOD_MAXIMUM_ACCOUNT_USE_COUNT = 5;

/**
 * The code's total-redemption cap [model/entity/PromotionCode.cfc:L56].
 */
const CODE_MAXIMUM_USE_COUNT = 50;

/**
 * The code's per-account cap [model/entity/PromotionCode.cfc:L57].
 */
const CODE_MAXIMUM_ACCOUNT_USE_COUNT = 1;

/**
 * `usedInOrder` for the entry that OVERRUNS its per-order limit, so L471 fires.
 */
const OVERUSED_USED_IN_ORDER = 4;

/**
 * `usedInOrder` for the entry that stays within its limit.
 */
const WITHIN_LIMIT_USED_IN_ORDER = 1;

/**
 * `discountQuantity` on the first order item's usage entry.
 */
const FIRST_USAGE_DISCOUNT_QUANTITY = 2;

/**
 * `discountQuantity` on the second order item's usage entry.
 */
const SECOND_USAGE_DISCOUNT_QUANTITY = 1;

/**
 * `discountPerUseValue` on the first usage entry - the smaller of the two.
 *
 * Smaller deliberately: `orderItemsUsage` is insert-sorted ASCENDING by `discountPerUseValue`
 * [model/service/PromotionService.cfc:L301-L329], and both inner searches in the over-use
 * stripping loop run in REVERSE [model/service/PromotionService.cfc:L482, L498].
 */
const FIRST_USAGE_DISCOUNT_PER_USE_VALUE = '1.25';

/**
 * `discountPerUseValue` on the second usage entry - the larger of the two.
 */
const SECOND_USAGE_DISCOUNT_PER_USE_VALUE = '3.75';

/**
 * The five `rewardType` values in exact source order, from the "Valid Reward Types" vocabulary
 * comment at [model/entity/PromotionReward.cfc:L48-L54].
 */
const REWARD_TYPE_VOCABULARY: readonly string[] = Object.freeze([
  'merchandise',
  'subscription',
  'contentAccess',
  'fulfillment',
  'order',
]);

/**
 * The comma list the engine matches merchandise-side rewards against, VERBATIM from
 * [model/service/PromotionService.cfc:L198].
 *
 * Kept as one STRING rather than as an array because that is what the legacy holds and because
 * `listFindNoCase` takes a list; it is split with `src/lib/cfml/list.ts` where an array is needed.
 */
const PASS_ONE_MERCHANDISE_REWARD_TYPE_LIST = 'merchandise,subscription,contentAccess';

/**
 * The FOURTH pass-one reward type, matched by a SEPARATE test at
 * [model/service/PromotionService.cfc:L345] - `reward.getRewardType() eq "fulfillment"` - rather
 * than through the comma list above.
 */
const FULFILLMENT_REWARD_TYPE = 'fulfillment';

/**
 * AAP correction #7: the only reward type pass two handles, at
 * [model/service/PromotionService.cfc:L415].
 */
const ORDER_REWARD_TYPE = 'order';

/**
 * A MIXED-CASE reward type, which the legacy engine still treats as `merchandise`.
 *
 * CFML parity [model/service/PromotionService.cfc:L198, L793]: both matching sites use
 * `listFindNoCase`, which is CASE-INSENSITIVE. TypeScript `===` is not, so the divergence is real
 * and this literal is how a suite proves the target routes it the legacy way.
 */
const MIXED_CASE_MERCHANDISE_REWARD_TYPE = 'Merchandise';

/**
 * The three `amountType` values `getAmountTypeOptions()` offers a NON-order reward
 * [model/entity/PromotionReward.cfc:L120-L133].
 */
const AMOUNT_TYPE_VOCABULARY: readonly [AmountType, AmountType, AmountType] = Object.freeze([
  'percentageOff',
  'amountOff',
  'amount',
] as const);

/**
 * The two it offers an `order` reward - the same accessor, conditional on `rewardType`,
 * withholding `amount`.
 */
const ORDER_REWARD_AMOUNT_TYPE_VOCABULARY: readonly [AmountType, AmountType] = Object.freeze([
  'percentageOff',
  'amountOff',
] as const);

/**
 * The STORED value for a fixed amount.
 *
 * CFML parity [model/entity/PromotionReward.cfc:L129]: the option's display key is
 * `define.fixedAmount` while its value is `amount`. Only the value is ever assigned anywhere in
 * this module.
 */
const FIXED_AMOUNT_AMOUNT_TYPE_VALUE: AmountType = 'amount';

/**
 * That option's display key, recorded so the mismatch is visible - never assigned.
 */
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
 * AAP CORRECTION #6 lives here: this provider has no declared property, while the property
 * declared at L99 has no provider.
 */
const REWARD_MATCHING_TYPE_VOCABULARY: readonly RewardMatchingType[] = Object.freeze([
  'any',
  'sku',
  'product',
  'productType',
  'brand',
]);

/**
 * The default `rewardMatchingType` this graph carries.
 */
const DEFAULT_REWARD_MATCHING_TYPE: RewardMatchingType = 'sku';
const DEFAULT_QUALIFIER_TYPE = 'merchandise';

/**
 * The `appliedType` the engine actually writes.
 *
 * CFML parity [model/service/PromotionService.cfc:L528-L534]: the only value
 * `newPromotionApplied()` ever sets on the item path is `orderItem`. The union's other two members
 * exist because the column can hold them, not because this code path writes them.
 */
const DEFAULT_APPLIED_TYPE: PromotionAppliedType = 'orderItem';

/**
 * The gate identifier at [model/service/PromotionService.cfc:L197], legacy grammar intact.
 */
const LEGACY_QUALIFICATION_GATE_IDENTIFIER = 'qualificationsMeet';

/**
 * The custom uniqueness validator wired by `model/validation/PromotionCode.json`.
 */
const UNIQUE_PROMOTION_CODE_VALIDATOR_NAME = 'hasUniquePromotionCode';

/**
 * The named conditional both date-bearing validation schemas declare.
 */
const CONDITIONAL_DATE_VALIDATION_NAME = 'needsEndAfterStart';

/**
 * The comparison that condition applies to `endDateTime`.
 */
const CONDITIONAL_DATE_VALIDATION_COMPARISON = 'gtProperty: startDateTime';

/**
 * The lowercase parameter name the target uses for `PromotionCode.setPromotion`.
 */
const PROMOTION_CODE_SET_PROMOTION_PARAMETER_NAME = 'promotion';

/**
 * CFML parity [model/entity/Promotion.cfc:L56]: `activeFlag` declares `default="1"`, so an absent
 * column reads TRUE - the same as `Sku`, and unlike `Product`, which declares no default at all.
 */
const ACTIVE_FLAG_ORM_DEFAULT = true;

/**
 * The default promotion code value. Distinct by default; the collision is a separate exhibit.
 */
const DEFAULT_PROMOTION_CODE_VALUE = 'SAVE10';

/**
 * The colliding code value.
 *
 * Differently cased on purpose: `hasUniquePromotionCode` normalises both sides before comparing,
 * because the legacy check is a MySQL `=` under a case-insensitive collation.
 */
const COLLIDING_PROMOTION_CODE_VALUE = 'save10';

// Frozen exhibit tables.

/**
 * The migration's worked example, as decimal strings.
 */
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
 * AAP correction #7, as data: four reward types route into pass one and exactly one routes into
 * pass two.
 *
 * The plan describes pass one as the merchandise list alone.
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
 * All FOURTEEN of the reward's many-to-many link tables, with the `type="array"` census.
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
 * One fewer than the reward's fourteen, and the missing one is `eligiblePriceGroups` - a reward
 * can be restricted to a price group, a qualifier cannot.
 */
const QUALIFIER_MANY_TO_MANY_COLLECTION_COUNT = 13;

/**
 * The ten qualifier gates' ASYMMETRIC null semantics and format types
 * [model/entity/PromotionQualifier.cfc:L55-L64].
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
  // Weight is not currency.
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
 * The nine date-bound shapes, with both predicates' outcomes.
 *
 * `isCurrent(now)` - start-INCLUSIVE (`<=`), end-EXCLUSIVE (`>`), no null guard on either bound,
 * `now` captured once.
 *
 * Row `nowAtEndDateTime` is the divergence: at the exact `endDateTime` instant `isCurrent()` says
 * not current and `getCurrentFlag()` says current.
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
 * AAP correction #3 and AAP correction #2, as data.
 *
 * AAP CORRECTION #3: the promotion period ships two non-equivalent currency predicates, and their
 * differences are enumerated field by field below.
 *
 * The plan states that `isCurrent()` is ported with a widened `isCurrent(now: Date)` signature and
 * calls that "the only widening in the entity layer".
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
 * AAP correction #5, as data: the four-spelling memo defect on `getPromotionCodesDeletableFlag`.
 *
 * The target normalises the spelling as a documented deliberate divergence: the discrepancy is
 * unobservable through the public contract, and the memo is request-scoped anyway.
 */
const PROMOTION_CODES_DELETABLE_FLAG_DEFECT: PromotionCodesDeletableFlagDefect = Object.freeze({
  methodName: 'getPromotionCodesDeletableFlag',
  declaredPropertyName: 'promotionCodesDeletableFlag',
  guardedKeyName: 'promotionCodeDeletableFlag',
  assignedKeyName: 'promotionCodeDeleteableFlag',
  distinctSpellingCount: 3,
  memoCanEverHit: false,
  validationLocator: 'model/validation/Promotion.json:L5',
  portedAccessorRaisesOnMaterializedCode: false,
  resolvedBy:
    'isDeletable(): boolean is declared on src/domain/entities/promotionCode.ts, ' +
    'reproducing org/Hibachi/HibachiEntity.cfc:L204-L206 over the delete-context ' +
    'rule model/validation/PromotionCode.json declares as ' +
    '"orders": [{"contexts":"delete","maxCollection":0}], counted over the ' +
    'already-materialized getOrders() collection.',
});

/**
 * AAP correction #6, as data: the qualifier's option-list property/accessor mismatch.
 *
 * LEGACY-DEFECT [model/entity/PromotionQualifier.cfc:L99, L107-L115]: the non-persistent property
 * declared at L99 is `qualifierApplicationTypeOptions`, and no
 * `getQualifierApplicationTypeOptions()` exists anywhere in the component.
 * Preserved deliberately; do not fix without a product decision.
 */
const QUALIFIER_OPTION_LIST_MISMATCH: QualifierOptionListMismatch = Object.freeze({
  declaredPropertyWithoutProvider: 'qualifierApplicationTypeOptions',
  declaredPropertyLocator: 'model/entity/PromotionQualifier.cfc:L99',
  providerWithoutDeclaredProperty: 'getRewardMatchingTypeOptions',
  providerLocator: 'model/entity/PromotionQualifier.cfc:L107-L115',
  providerServesProperty: 'rewardMatchingType',
});

/**
 * The promotion family's validation-file census: four present, three absent.
 *
 * `PromotionReward.json` makes both `amountType` `AND` `amount` required in the `save` context,
 * while all three `maximumUse*` columns are declared merely `dataType: "numeric"` and are not
 * required.
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
  // The three absences. `lineCount` is `undefined` rather than `0`, because `0` would assert an
  // empty file exists where in fact no file does.
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

/**
 * Reads one override, distinguishing an OMITTED key from a key written with the value `undefined`.
 *
 * With `??` a caller could never reach any of those states, because an explicit `undefined` would
 * be silently replaced by the default.
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
 * The companion to `resolveOverride`, used wherever a default has to be CONSTRUCTED rather than
 * merely named - the rounding rule and the eligible price groups.
 */
function hasOverride(
  overrides: PromotionFixtureOverrides | undefined,
  key: keyof PromotionFixtureOverrides,
): boolean {
  return overrides !== undefined && Object.hasOwn(overrides, key);
}

// Module-scope pure builders.

/**
 * A fresh `Date` from an explicit UTC ISO-8601 literal.
 *
 * Fresh rather than shared because `Date` is MUTABLE: handing the same instance to two graphs
 * would let one suite's `setUTCHours` reach another's.
 */
function makeInstant(isoUTC: string): Date {
  return new Date(isoUTC);
}

/**
 * The clock closure `PromotionPeriod` and `PromotionCode` require - both declare `now: () => Date`
 * as a NON-optional constructor slot.
 *
 * Takes the instant rather than the literal so that a caller who overrides `now` gets a clock that
 * agrees with it.
 */
function makeClock(instant: Date): () => Date {
  const epochMilliseconds: number = instant.getTime();

  return (): Date => new Date(epochMilliseconds);
}

/**
 * A deterministic identifier, derived from the caller's own prefix.
 */
function makeId(idPrefix: string, suffix: string): string {
  return `${idPrefix}-${suffix}`;
}

/**
 * A fresh MUTABLE copy of a readonly array.
 *
 * Defensive copying is mandatory here, and the reason is a genuine CFML/TypeScript semantic gap
 * rather than tidiness.
 *
 * The copy is intentionally mutable: `PromotionReward` and `PromotionQualifier` both declare their
 * collection slots `T[]` rather than `readonly T[]`.
 */
function copyOf<TElement>(source: readonly TElement[]): TElement[] {
  return [...source];
}

/**
 * A structural node for materialized-path construction.
 *
 * //
 * JUDGMENT CALL: paths are built from a plain linked chain rather than from entity instances, for
 * two reasons.
 */
type IdPathNode = {
  readonly id: string;
  readonly parent: IdPathNode | undefined;
};

/**
 * The primary-ID accessor `buildIdPathList` needs.
 */
function readIdPathNodeID(node: IdPathNode): string {
  return node.id;
}

/**
 * The parent accessor `buildIdPathList` needs.
 */
function readIdPathNodeParent(node: IdPathNode): IdPathNode | undefined {
  return node.parent;
}

/**
 * Builds a comma-delimited materialized ID path, ROOT FIRST, from root-first IDs.
 *
 * Delegates to `buildIdPathList` from `src/domain/valueObjects/materializedIdPath.ts` rather than
 * joining with a literal comma, so the delimiter.
 *
 * @throws when handed an empty list, because a materialized path is never empty - a node's own
 * identifier is always the last element.
 */
function buildIdPathFromIds(rootFirstIds: readonly string[]): string {
  let cursor: IdPathNode | undefined;

  // Built by iteration rather than by index: `noUncheckedIndexedAccess` makes every `ids[i]` a
  // `string | undefined`, and guarding a bound this loop already guarantees would be noise.
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
 * JUDGMENT CALL: named members instead of a tuple, so a caller reads the level it wants rather
 * than counting positions.
 */
type ProductTypeChain = {
  /**
   * Depth 1. Its `productTypeIDPath` is its own identifier alone.
   */
  readonly root: ProductType;

  /**
   * Depth 2. Path is `<root>,<parent>`.
   */
  readonly parent: ProductType;

  /**
   * Depth 3 - the node a membership test starts from. Path is `<root>,<parent>,<leaf>`.
   */
  readonly leaf: ProductType;

  /**
   * All three, root first, for a suite that wants to walk them.
   */
  readonly rootFirst: readonly ProductType[];
};

/**
 * A three-level product-type chain, returned root first.
 *
 * Each node carries its own correctly-scoped `productTypeIDPath`, computed from the chain above
 * it.
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

  // The child side is wired through the LIVE collection accessor, which is how the entity's own
  // bidirectional helpers maintain it. Not copied here, deliberately: a copy would make the wiring
  // a silent no-op.
  root.getChildProductTypes().push(parent);
  parent.getChildProductTypes().push(leaf);

  return { root, parent, leaf, rootFirst: [root, parent, leaf] };
}

/**
 * A SEPARATE product-type node for the EXCLUSION side, outside the chain above.
 *
 * Outside deliberately: an exclusion that shares a subtree with the inclusion it is meant to
 * override cannot demonstrate exclusion at all, because the path walk would match both.
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
 * A hand-written recording double rather than a library mock: no mocking library is installed, the
 * frozen dependency set is exactly the thirteen pins `package.json` declares.
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
 * The far side is the OUT-OF-SCOPE `Account` entity, so the double carries an OPAQUE `accountID`
 * string and exactly the members the code's bidirectional helpers reach.
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
 * The order aggregate is entirely out of scope - the single largest exclusion in this port.
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
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L180-L188]: each override is gated on
 * `!isNull(...) AND > 0`, so a limit of `0` - or any negative value - fails the test and leaves
 * the sentinel in place.
 * Preserved deliberately; do not fix without a product decision.
 *
 * Only null means unlimited, so a recorded `0` is silently treated as absent.
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

  // [model/service/PromotionService.cfc:L180-L182] - `!isNull(...) and... > 0`.
  if (declaredMaximumUsePerOrder !== undefined && declaredMaximumUsePerOrder > 0) {
    maximumUsePerOrder = declaredMaximumUsePerOrder;
  }
  if (declaredMaximumUsePerItem !== undefined && declaredMaximumUsePerItem > 0) {
    maximumUsePerItem = declaredMaximumUsePerItem;
  }
  if (declaredMaximumUsePerQualification !== undefined && declaredMaximumUsePerQualification > 0) {
    maximumUsePerQualification = declaredMaximumUsePerQualification;
  }

  return {
    // [model/service/PromotionService.cfc:L174] - always zero at seed time.
    usedInOrder: 0,
    maximumUsePerOrder,
    maximumUsePerItem,
    maximumUsePerQualification,
    orderItemsUsage: [],
  };
}

/**
 * The `structKeyExists` guard at [model/service/PromotionService.cfc:L172] is reproduced, and it
 * matters: seeding is idempotent and first-reward-wins.
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
 * `noUncheckedIndexedAccess` types every `details[key]` as possibly `undefined`, and a fixture
 * must never paper over that with a postfix `!`: if a key this module itself seeded is missing.
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
 * The insertion ORDER is the caller's business and is never sorted here.
 */
function appendOrderItemUsage(detail: PromotionRewardUsageDetail, usage: OrderItemUsage): void {
  detail.orderItemsUsage.push(usage);
}

/**
 * The ten in-scope membership collections plus the three opaque-ID collections, gathered once so
 * every reward and the qualifier are built from the same material.
 *
 * Every member is `readonly`, and `makeRewardFixture` COPIES each one before handing it to a
 * constructor - so two rewards built from this bag never share an array.
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

  /**
   * Opaque IDs: `FulfillmentMethod` is out of scope.
   */
  readonly fulfillmentMethodIDs: readonly string[];

  /**
   * Opaque IDs: `ShippingMethod` is out of scope.
   */
  readonly shippingMethodIDs: readonly string[];

  /**
   * Opaque IDs: `AddressZone` is out of scope.
   */
  readonly shippingAddressZoneIDs: readonly string[];
};

/**
 * What varies between the reward exhibits, and nothing else.
 *
 * `applicableTerm` is the one exception and is coalesced to `both`, because its absence carries no
 * documented meaning in this slice.
 */
type RewardSpec = {
  /**
   * Appended to the graph's identifier prefix, so every reward is traceable.
   */
  readonly idSuffix: string;

  /**
   * Un-narrowed `string`, so a mixed-case value is expressible without a cast.
   */
  readonly rewardType?: string | undefined;

  /**
   * Omitted means the default-less switch at L992-L1003 takes no branch.
   */
  readonly amountType?: AmountType | undefined;

  /**
   * Omitted means the column is NULL - invalid by validation, and a real state.
   */
  readonly amount?: Money | undefined;

  /**
   * Coalesced to `both` when omitted.
   */
  readonly applicableTerm?: ApplicableTerm | undefined;

  /**
   * Omitted, `0` and negative all mean UNLIMITED - see `seedRewardUsageDetail`.
   */
  readonly maximumUsePerOrder?: number | undefined;
  readonly maximumUsePerItem?: number | undefined;
  readonly maximumUsePerQualification?: number | undefined;

  /**
   * Omitted means `define.none` - the unrounded discount branch.
   */
  readonly roundingRule?: RoundingRule | undefined;
};

/**
 * What every reward exhibit in one graph shares.
 */
type RewardBuildContext = {
  readonly promotionPeriod: PromotionPeriod;
  readonly membership: MembershipCollections;
  readonly eligiblePriceGroups: readonly PriceGroup[];
  readonly labelProvider: PromotionRewardLabelProviderDouble;
};

/**
 * Builds one reward exhibit.
 *
 * All FOURTEEN many-to-many collections are populated as ARRAYS, even though only three of them -
 * `eligiblePriceGroups`, `excludedBrands` and `excludedOptions`.
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
 * Reads one qualifier gate override, distinguishing an omitted key from a key written as
 * `undefined`.
 *
 * The distinction is the whole point of the asymmetric null semantics: writing
 * `maximumOrderSubtotal: undefined` asks for UNLIMITED [model/entity/PromotionQualifier.cfc:L58].
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

/**
 * What distinguishes one whole-promotion currency variant from another.
 */
type PromotionVariantSpec = {
  readonly idSuffix: string;
  readonly promotionName: string;

  /**
   * `undefined` makes the column NULL - `define.forever`.
   */
  readonly periodStartUTC: string | undefined;

  /**
   * `undefined` makes the column NULL - `define.forever`.
   */
  readonly periodEndUTC: string | undefined;

  /**
   * `false` produces a CODE-LESS promotion, which `Promotion.getCurrentFlag()`
   * [model/entity/Promotion.cfc:L83-L92] treats differently: its second conjunct is
   * `arrayLen(getPromotionCodes()) == 0 OR getCurrentPromotionCodeFlag()`.
   */
  readonly includeCode: boolean;

  /**
   * Ignored when `includeCode` is `false`.
   */
  readonly codeStartUTC: string | undefined;

  /**
   * Ignored when `includeCode` is `false`.
   */
  readonly codeEndUTC: string | undefined;
};

/**
 * Builds one self-contained promotion currency variant: a fresh promotion, one fresh period, and
 * optionally one fresh code.
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

  // Wired through the LIVE collection accessor rather than through `addPromotionPeriod`. //
  // JUDGMENT CALL: both directions are wired explicitly here because two of this family's
  // bidirectional `remove*` helpers are reproduced defects -
  // [model/entity/PromotionPeriod.cfc:L110] and [model/entity/PromotionAccount.cfc:L103] both
  // dereference an UNDECLARED `arguments.account`.
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

/**
 * Builds a complete, deterministic promotion family graph.
 *
 * That is not tidiness - it is what makes the port's central isolation property ASSERTABLE.
 *
 * @param overrides every axis of variation this factory offers, and the only one.
 * @returns the seven-entity promotion family plus the exhibits that make the must-preserve
 * discount and use-limit semantics assertable.
 */
export function makePromotionFixtures(
  overrides?: PromotionFixtureOverrides,
): PromotionFixtureGraph {
  const idPrefix: string = overrides?.idPrefix ?? DEFAULT_ID_PREFIX;

  // `??` rather than `resolveOverride`: an instant has no meaningful absent state, so there is
  // nothing for an explicit `undefined` to mean.
  const now: Date = overrides?.now ?? makeInstant(NOW_UTC);
  const clock: () => Date = makeClock(now);
  const opaqueOrderReferences: OpaqueOrderReferences = Object.freeze({
    orderID: overrides?.orderID ?? makeId(idPrefix, 'order'),
    orderItemID: overrides?.orderItemID ?? makeId(idPrefix, 'order-item-first'),
    // Must differ from `orderItemID`: with a single order item the leaked-key read in the over-use
    // stripping loop at [model/service/PromotionService.cfc:L472-L477] produces the right answer
    // by coincidence and LEGACY-DEFECT 9 becomes invisible.
    secondOrderItemID: overrides?.secondOrderItemID ?? makeId(idPrefix, 'order-item-second'),
    orderFulfillmentID: overrides?.orderFulfillmentID ?? makeId(idPrefix, 'order-fulfillment'),
    accountID: overrides?.accountID ?? makeId(idPrefix, 'account'),
  });

  // Sourced from `./priceGroupFixtures` - module #1 in this folder's dependency order - rather
  // than rebuilt.
  const priceGroupFixtures = makePriceGroupFixtures({ idPrefix: makeId(idPrefix, 'pricegroup') });

  // The rule the DEFAULT reward carries.
  const defaultRewardRoundingRule: RoundingRule | undefined = resolveOverride(
    overrides,
    'roundingRule',
    priceGroupFixtures.closestRoundingRule,
  );

  // The rule the ROUNDED exhibit carries, which always exists - otherwise asking for an unrounded
  // default reward would also remove the rounded exhibit.
  const roundingRule: RoundingRule =
    defaultRewardRoundingRule ?? priceGroupFixtures.closestRoundingRule;

  // A per-call copy, so a suite splicing it cannot reach the price-group graph.
  const eligiblePriceGroups: readonly PriceGroup[] =
    overrides?.eligiblePriceGroups ??
    copyOf([priceGroupFixtures.childPriceGroup, priceGroupFixtures.parentPriceGroup]);

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

  // `Option`'s constructor declares every slot as REQUIRED `T | undefined`, so each absent column
  // is written out explicitly rather than omitted. That is the entity's contract, not a choice
  // made here.
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

  // Sourced from `./productFixtures` and `./skuFixtures` - modules #2 and #3 - rather than
  // rebuilt.
  //
  // //
  // JUDGMENT CALL: `productID` is SUPPLIED EXPLICITLY. Module #2 defaults it to `''` on purpose,
  // so that `isNew()` is honest and the entity-base cases it carries forward from
  // `meta/tests/unit/entity/SlatwallEntityTestBase.cfc` hold.
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

  // Collection overrides use `??` rather than `resolveOverride`, deliberately: a Hibernate-managed
  // many-to-many is never null - an unpopulated one reads as an empty array - so `[]` is how a
  // caller asks for "attached to nothing".
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

  const promotionID: string = overrides?.promotionID ?? makeId(idPrefix, 'promotion');

  const promotion = new Promotion({
    promotionID,
    promotionName: overrides?.promotionName ?? 'Fixture Promotion',
    promotionSummary: overrides?.promotionSummary ?? 'A promotion used by the engine fixtures.',
    promotionDescription:
      overrides?.promotionDescription ??
      'Constructed in memory by promotionFixtures; never persisted.',
    // CFML parity [model/entity/Promotion.cfc:L56]: `default="1"` means an unset column reads TRUE
    // the same as `Sku`, and unlike `Product`, which declares no default at all.
    activeFlag: resolveOverride(overrides, 'activeFlag', ACTIVE_FLAG_ORM_DEFAULT),
    createdDateTime: makeInstant(CREATED_DATE_TIME_UTC),
    modifiedDateTime: makeInstant(MODIFIED_DATE_TIME_UTC),
  });

  const promotionPeriod = new PromotionPeriod({
    promotionPeriodID: makeId(idPrefix, 'promotion-period'),
    // `resolveOverride` on both bounds: an explicit `undefined` is the documented NULL -
    // `hb_nullRBKey="define.forever"` [model/entity/PromotionPeriod.cfc:L53-L54].
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

  // The COLLISION EXHIBIT. It carries the same code value differently cased and points at the same
  // promotion, but is deliberately not pushed into `promotion.getPromotionCodes()`.
  //
  // //
  // JUDGMENT CALL: attaching it would give the default promotion two codes and quietly change what
  // every currency assertion about that promotion is testing.
  const collidingPromotionCode = new PromotionCode({
    promotionCodeID: makeId(idPrefix, 'promotion-code-colliding'),
    promotionCode: COLLIDING_PROMOTION_CODE_VALUE,
    startDateTime: makeInstant(PERIOD_START_UTC),
    endDateTime: makeInstant(PERIOD_END_UTC),
    // NULL on both: `hb_nullRBKey="define.unlimited"` [model/entity/PromotionCode.cfc:L56-L57]
    // means unlimited, never zero uses.
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

  const rewardLabelProvider: RecordingLabelProvider = makeRecordingLabelProvider();

  const rewardContext: RewardBuildContext = {
    promotionPeriod,
    membership,
    eligiblePriceGroups,
    labelProvider: rewardLabelProvider,
  };

  // The PRIMARY reward, and the only one that honours the `reward*` overrides. Pass one, matched
  // through the comma list at [model/service/PromotionService.cfc:L198].
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

  // Pass one, but reached by the SEPARATE `eq "fulfillment"` test at
  // [model/service/PromotionService.cfc:L345] rather than through the comma list.
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

  // PASS two, and the only reward type that reaches it [model/service/PromotionService.cfc:L415].
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

  // `'Merchandise'` - capitalised.
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

  // LEGACY-DEFECT [model/service/PromotionService.cfc:L998]: the `amountOff` branch omits
  // `precisionEvaluate` and multiplies with raw floating point, while every neighbouring branch is
  // guarded. //
  // Preserved deliberately; do not fix without a product decision.
  // JUDGMENT CALL: not reproduced - all arithmetic in the target flows through `Money` over
  // decimal.js.
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

  // The LEGAL fixed-amount case: `amount` on a NON-order reward, which is exactly what
  // `getAmountTypeOptions()` offers for a non-order reward type.
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

  // `amountType` ABSENT - the type-safe route into the default-less switch at
  // [model/service/PromotionService.cfc:L992-L1003], which takes no branch for an unmatched amount
  // type.
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

  // The impossible-but-representable state: an `order` reward carrying the fixed `amount` type.
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

  // `amount` absent - invalid by validation, and labelled as such rather than presented as a
  // normal shape.
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

  // The worked example's reward: exactly `'12.5'`, and DELIBERATELY UNROUNDED so that the
  // `"52.47"` presentation figure is the arithmetic's own answer rather than a rounding rule's.
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

  // All three limits explicitly `0` - which also means unlimited, because the seeding override at
  // [model/service/PromotionService.cfc:L180-L188] requires `> 0`. AAP correction #4.
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

  // The only shape that actually overrides the sentinel, and therefore the only one under which
  // use-limit enforcement is observable at all.
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

  // `roundingRule` omitted, which is `define.none` [model/entity/PromotionReward.cfc:L71] - a
  // CONFIGURED state, not a missing value.
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

  // `??` rather than `resolveOverride`: the EMPTY case is requested with `[]`, not with
  // `undefined`.
  const defaultRewardOrdering: readonly PromotionReward[] = [
    merchandiseReward,
    fulfillmentReward,
    // LAST, deliberately: the two-pass guard at [model/service/PromotionService.cfc:L458-L461]
    // sits inside the loop body and inside the period-OK block that closes at L463.
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

  const qualifierGates: QualifierGateOverrides | undefined = overrides?.qualifierGates;

  const promotionQualifier = new PromotionQualifier({
    promotionQualifierID: makeId(idPrefix, 'promotion-qualifier'),
    qualifierType: overrides?.qualifierType ?? DEFAULT_QUALIFIER_TYPE,
    // [model/entity/PromotionQualifier.cfc:L55-L64]: every `minimum*` declares
    // `hb_nullRBKey="define.0"` and every `maximum*` declares `hb_nullRBKey="define.unlimited"`.
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
    // Weight is not currency.
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
    // THIRTEEN many-to-many collections here, one fewer than the reward's fourteen: a qualifier
    // has no `eligiblePriceGroups`. Copied, never adopted.
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

  // All ten gates omitted - fully permissive. Every `minimum*` reads as 0 and every `maximum*`
  // reads as unlimited, so nothing is excluded by a bound.
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

  const promotionApplied = new PromotionApplied({
    promotionAppliedID: makeId(idPrefix, 'promotion-applied'),
    discountAmount: resolveOverride(
      overrides,
      'discountAmount',
      Money.fromDecimalString(APPLIED_DISCOUNT_AMOUNT),
    ),
    appliedType: resolveOverride(overrides, 'appliedType', DEFAULT_APPLIED_TYPE),
    // ABSENT by DEFAULT, and that is parity rather than an omission: `newPromotionApplied()`
    // [model/service/PromotionService.cfc:L528-L534] sets appliedType, promotion, orderItem and
    // discountAmount and never touches `currencyCode`.
    currencyCode: resolveOverride(overrides, 'currencyCode', undefined),
    promotion,
    promotionID,
    // All three are OPAQUE STRINGS - the anti-corruption boundary. The order aggregate is out of
    // scope, so no order, order item or fulfillment object exists anywhere in this module.
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

  // The defect-9 pair is present even when a caller asks for an EMPTY reward array, so
  // `overusedRewardID` and `leakedRewardID` are never dangling; and * because seeding is
  // first-wins [model/service/PromotionService.cfc:L172].
  const rewardUsageDetails: PromotionRewardUsageDetails = seedRewardUsageDetails([
    boundedUseLimitsReward,
    orderReward,
    ...promotionRewards,
  ]);

  const overusedRewardID: string = boundedUseLimitsReward.getPromotionRewardID();

  // Distinct from `overusedRewardID` on purpose.
  const leakedRewardID: string = orderReward.getPromotionRewardID();

  const overusedRewardUsageDetail: PromotionRewardUsageDetail = readRewardUsageDetail(
    rewardUsageDetails,
    overusedRewardID,
  );

  const leakedRewardUsageDetail: PromotionRewardUsageDetail = readRewardUsageDetail(
    rewardUsageDetails,
    leakedRewardID,
  );

  // Pushed past its own `maximumUsePerOrder`, so the stripping loop's outer condition at
  // [model/service/PromotionService.cfc:L471] is satisfied and the defect-9 body actually
  // executes.
  overusedRewardUsageDetail.usedInOrder =
    overrides?.overusedRewardUsedInOrder ?? OVERUSED_USED_IN_ORDER;

  appendOrderItemUsage(overusedRewardUsageDetail, {
    orderItemID: opaqueOrderReferences.orderItemID,
    discountQuantity: FIRST_USAGE_DISCOUNT_QUANTITY,
    discountPerUseValue: Money.fromDecimalString(FIRST_USAGE_DISCOUNT_PER_USE_VALUE),
  });

  leakedRewardUsageDetail.usedInOrder = WITHIN_LIMIT_USED_IN_ORDER;
  appendOrderItemUsage(leakedRewardUsageDetail, {
    orderItemID: opaqueOrderReferences.secondOrderItemID,
    discountQuantity: SECOND_USAGE_DISCOUNT_QUANTITY,
    discountPerUseValue: Money.fromDecimalString(SECOND_USAGE_DISCOUNT_PER_USE_VALUE),
  });

  // One FRESH period and one FRESH code per row of the truth table.
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

  // CODE-LESS: a current period and no codes at all.
  //
  // It is also the only variant on which `getPromotionCodesDeletableFlag()` can be called without
  // raising, because the ported accessor is an `every` over an empty collection and never invokes
  // its callback.
  const codelessPromotion: Promotion = makePromotionVariant(idPrefix, clock, {
    idSuffix: 'promotion-codeless',
    promotionName: 'Fixture Promotion (no codes)',
    periodStartUTC: PERIOD_START_UTC,
    periodEndUTC: PERIOD_END_UTC,
    includeCode: false,
    codeStartUTC: undefined,
    codeEndUTC: undefined,
  });

  // A current period but an EXPIRED code: the first conjunct holds, the second fails, so the
  // promotion is not current.
  const promotionWithOnlyExpiredCodes: Promotion = makePromotionVariant(idPrefix, clock, {
    idSuffix: 'promotion-expired-codes',
    promotionName: 'Fixture Promotion (expired code)',
    periodStartUTC: PERIOD_START_UTC,
    periodEndUTC: PERIOD_END_UTC,
    includeCode: true,
    codeStartUTC: EXPIRED_PERIOD_START_UTC,
    codeEndUTC: EXPIRED_PERIOD_END_UTC,
  });

  // An EXPIRED period but a current code: the FIRST conjunct fails, so the promotion is not
  // current no matter how valid the code is.
  const promotionWithOnlyExpiredPeriods: Promotion = makePromotionVariant(idPrefix, clock, {
    idSuffix: 'promotion-expired-periods',
    promotionName: 'Fixture Promotion (expired period)',
    periodStartUTC: EXPIRED_PERIOD_START_UTC,
    periodEndUTC: EXPIRED_PERIOD_END_UTC,
    includeCode: true,
    codeStartUTC: PERIOD_START_UTC,
    codeEndUTC: PERIOD_END_UTC,
  });

  // All three built through `buildIdPathList`, so the delimiter, the root-first ordering and the
  // include-self property come from the one implementation the engine's own membership walks use.
  const materializedIdPaths: MaterializedIdPaths = Object.freeze({
    productTypeIDPath: productTypeChain.leaf.getProductTypeIDPath(),
    // Taken from `./priceGroupFixtures` so both modules agree on one value.
    priceGroupIDPath: priceGroupFixtures.priceGroupIDPaths.child,
    // Built structurally rather than from entities: `Category` is not on this fixture's dependency
    // whitelist, so no `Category` instance may be constructed here - and a comma-list path does
    // not need one.
    categoryIDPath: buildIdPathFromIds([
      makeId(idPrefix, 'category-root'),
      makeId(idPrefix, 'category-parent'),
      makeId(idPrefix, 'category-leaf'),
    ]),
  });

  return {
    // The seven-entity family.
    promotion,
    promotionPeriod,
    promotionCode,
    promotionQualifier,
    promotionRewards: copyOf(promotionRewards),
    promotionApplied,
    promotionAccount,
    now,
    clock,

    // RewardType: vocabulary and dispatch.
    rewardTypeVocabulary: REWARD_TYPE_VOCABULARY,
    passOneMerchandiseRewardTypeList: PASS_ONE_MERCHANDISE_REWARD_TYPE_LIST,
    // Split with `listToArray` from `src/lib/cfml/list.ts` - the same helper the engine's
    // comma-list handling uses - then extended with the FOURTH pass-one type.
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

    referenceCalculation: REFERENCE_CALCULATION,
    referenceCalculationReward,
    referenceCalculationSku: sku,
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
    rewardOrderings,
    rewardUsageDetails,
    overusedRewardID,
    leakedRewardID,
    overusedRewardUsageDetail,
    leakedRewardUsageDetail,
    legacyQualificationGateIdentifier: LEGACY_QUALIFICATION_GATE_IDENTIFIER,
    opaqueOrderReferences,
    periodDateBoundsCases: PERIOD_DATE_BOUNDS_CASES,
    datedPromotionPeriods,
    datedPromotionCodes,
    periodPredicateContrast: PERIOD_PREDICATE_CONTRAST,
    conditionalDateValidationName: CONDITIONAL_DATE_VALIDATION_NAME,
    conditionalDateValidationComparison: CONDITIONAL_DATE_VALIDATION_COMPARISON,
    codelessPromotion,
    promotionWithOnlyExpiredCodes,
    promotionWithOnlyExpiredPeriods,
    promotionCodesDeletableFlagDefect: PROMOTION_CODES_DELETABLE_FLAG_DEFECT,
    activeFlagOrmDefault: ACTIVE_FLAG_ORM_DEFAULT,
    collidingPromotionCode,
    uniquePromotionCodeValidatorName: UNIQUE_PROMOTION_CODE_VALIDATOR_NAME,
    promotionCodeAccounts: copyOf(promotionCodeAccounts),
    promotionCodeOrders: copyOf(promotionCodeOrders),
    promotionCodeSetPromotionParameterName: PROMOTION_CODE_SET_PROMOTION_PARAMETER_NAME,
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
    // JUDGMENT CALL: shared identity, copied containers.
    sku,
    product,
    excludedBrand,
    excludedProductType,
    rewardLabelProvider,

    // Census and traceability.
    promotionValidationCensus: PROMOTION_VALIDATION_CENSUS,
  };
}
