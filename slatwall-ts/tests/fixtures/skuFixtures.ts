// ---------------------------------------------------------------------------
// slatwall-ts - SKU / SKU-CURRENCY / OPTION / OPTION-GROUP TEST DATA
//
// A deterministic factory returning one fully-formed `SwSku` - the sku, its `SwSkuOption` links,
// its `SwSkuCurrency` override rows and the four collaborator doubles those need. It is MODULE #3
// OF FIVE in the acyclic fixture order priceGroupFixtures -> productFixtures -> skuFixtures ->
// promotionFixtures -> orderViewFixtures, so only #1 and #2 may be imported here.
//
// IT CARRIES TWO OF THE THREE "PRESERVE EXACTLY" AREAS, AND EVERY VARIANT BELOW PINS ONE.
//
// AREA 2 - THE CURRENCY RESOLUTION CASCADE [model/entity/Sku.cfc:L367-L433]
//   Step 0 [L373] the eligibility gate `if(len(setting('skuEligibleCurrencies')))`; empty leaves
//          the memo `{}` and makes EVERY currency accessor answer nothing.
//   Step 1 [L385-L397] the base currency from the sku's own columns, `converted = false`. Step 2
//   [L399-L414] per-currency overrides from `SwSkuCurrency`, OVERWRITING Step 1 and stamping
//          `skuCurrencyID` [L412]. No `break`, so LAST MATCH WINS.
//   Step 3 [L416-L428] conversion, gated ONLY on absence of the `price` key, `converted = true`.
//
// ★ THE SINGLE MOST IMPORTANT STRUCTURAL RULE IN THIS FILE
// THIS FILE NEVER INJECTS THE CURRENCY DETAIL MAP, AND THAT IS A CHOICE.
// `SkuHydrationInput` DOES publish a `currencyDetails` member, and it exists so
// the repository's save round-trip can carry an already-computed map onto a new
// instance without re-running anything. Using it here would be exactly wrong:
// the suites that consume this fixture are pinning THE CASCADE, and a fixture
// that handed them a pre-built map would assert its own arithmetic instead of
// [model/entity/Sku.cfc:L367-L433]'s.
//
// So the fixture's whole job is to CONFIGURE the three inputs the cascade reads
// - the settings port, the currency-converter port and the sku's own
// `skuCurrencies` array - so that ONE caller-side `await Sku.hydrate(sku)`
// produces exactly the intended map. `Sku.hydrate` is the only public way in:
// the cascade itself is PRIVATE, which is what stops a suite (or a service) from
// forgetting to run it and then reading `{}` as though it meant "no prices".
// `Sku.getCurrencyDetails()` stays SYNCHRONOUS - it hands back the memo, or `{}`
// when hydration produced no map.
// THE FIXTURE NEVER RUNS THE CASCADE AND NEVER RE-IMPLEMENTS IT. That is what
// "materialized upstream" means here, and it is what keeps every currency
// accessor synchronous, exactly as the legacy contract is.
//
//   WHERE AN `undefined` PRICE IS REACHABLE - NOT WHERE IT LOOKS. `default="0"`
//   [model/entity/Sku.cfc:L55-L57] makes the sku's money columns non-optional `Money`, so Step 1
//   always writes all three sub-keys and the BASE currency can never strand one; a stranded sub-key
//   needs a NON-BASE currency, by the mechanism annotated at the `'secondaryPriceOnly'` variant.
//   `getPriceByCurrencyCode` [L270] checks the outer key only, [L276] and [L282] check the inner
//   sub-key too, and SUBSTITUTING `0` WOULD SILENTLY SELL PRODUCTS FOR FREE.
//
//   THE MAP IS NOT INJECTABLE: `getCurrencyDetails()` is a synchronous memo read answering `{}`
//   until something materializes it, and `SkuHydrationInput` publishes no `currencyDetails`. This
//   file configures only the three inputs the cascade reads - the settings port, the
//   currency-converter port, the sku's own `skuCurrencies` - so awaiting
//   `sku.materializeCurrencyDetails()` once builds the map and every accessor stays synchronous.
//
// AREA 3 - AND-of-EXISTS OPTION MATCHING [model/dao/SkuDAO.cfc:L107-L128]
//   One `and exists (...)` clause per selected option, so a sku matches only when it carries EVERY
//   option; the `0 = 0` tautology exists purely so each clause can start with `and`. The canonical
//   graph makes that decidable: 'A' -> {O1,O2}, 'B' -> {O1}, 'C' -> {O1,O2,O3}, 'D' -> NO options,
//   so selecting {O1,O2} matches EXACTLY A and C - B fails the O2 clause and D fails because [L110]
//   is an `inner join sku.options`. OPTION IDENTITY IS SHARED ON PURPOSE: the `exists` subquery at
//   [L115-L119] matches on `optionID`, meaning the SAME `SwOption` ROW rather than two rows with
//   equal codes, so one graph draws from one pool. The ARRAYS holding them are never shared.
//
// RULES THAT HOLD EVERYWHERE BELOW, STATED ONCE
//   COPY THE CONTAINERS, SHARE ONLY PURE LEAVES: every collection handed to an entity is a fresh
//   array built inside the call, even when the caller supplied one, because `Sku.getOptions()` and
//   `getSkuCurrencies()` hand the backing array back uncopied. Exactly ONE array is deliberately
//   live, the `candidates` array the sku repository double reads. NO MUTABLE MODULE STATE, only
//   immutable primitives, because a warm container keeps module state alive between unrelated
//   requests - which is why every legacy component-level cache, such as
//   `SkuDAO.variables.nextOptionGroupSortOrder` [model/dao/SkuDAO.cfc:L204-L220], is per-request
//   here. IDENTIFIERS DERIVE FROM `idPrefix` ALONE, dates are explicit UTC ISO-8601 literals, and
//   quoted SQL or HQL is a behavioural specification that nothing here executes. MONEY IS ALWAYS A
//   DECIMAL STRING FED TO `Money`; no `number` reaches it and `Money.zero` is never a fallback for
//   ABSENCE. EVERY COMPARISON IS `cfEquals`: CFML `eq`, `findNoCase` and struct keys are
//   case-INSENSITIVE and so is MySQL's default collation, so each ported comparison is audited, not
//   assumed. THE BIDIRECTIONAL SETTERS ARE CALLED AT MOST ONCE. `Sku.setProduct`
//   [model/entity/Sku.cfc:L600-L605], `SkuCurrency.setSku` [model/entity/SkuCurrency.cfc:L89-L94]
//   and `Option.setOptionGroup` [model/entity/Option.cfc:L92-L97] each append behind an
//     `isNew() or !hasX(this)`
//   probe, so a second call on a new instance appends a duplicate row.
//
// THE PRODUCT <-> SKU CYCLE. `Product.skus` [model/entity/Product.cfc:L73] and `Sku.product`
// [model/entity/Sku.cfc:L65] are a genuine cycle, which `productFixtures` breaks by defaulting
// `skus` to `[]`; `Sku.setProduct(product)` is then called once per sku.
//
// JUDGMENT CALL: NO PRICE-GROUP GRAPH IS BUILT and `./priceGroupFixtures` is deliberately not
// imported, because `priceGroupRates` is the INVERSE side of `SwPriceGroupRateSku`
// [model/entity/Sku.cfc:L86], so the RATE owns the link and rates would need skus that do not exist
// yet.
//
// CFML parity [meta/tests/unit/Helper.cfc:L53]: the repository's only legacy fixture-construction
// artifact [meta/tests/unit/Helper.cfc:L49-L77] is a REFERENCE PATTERN, NOT A PORT, and it assigned
// `productData` without `var`, where every local here is block-scoped.
//
// TWO PLAN CORRECTIONS VERIFIED AGAINST THE SOURCE: `getStocksDeletableFlag` reaches the service at
// [model/entity/Sku.cfc:L569], not L568; and of the 96 files in `model/validation/`, `Sku.json`,
// `SkuCurrency.json`, `Option.json`, `OptionGroup.json` and `RoundingRule.json` are present while
// `Category.json` is not.
// ---------------------------------------------------------------------------

import { Option } from '../../src/domain/entities/option.js';
import { OptionGroup } from '../../src/domain/entities/optionGroup.js';
import { Sku } from '../../src/domain/entities/sku.js';
import { SkuCurrency } from '../../src/domain/entities/skuCurrency.js';
import { toCurrencyCode } from '../../src/domain/valueObjects/currencyCode.js';
import { Money } from '../../src/domain/valueObjects/money.js';
import { listToArray } from '../../src/lib/cfml/list.js';
import { cfEquals } from '../../src/lib/cfml/struct.js';
import { makeProductFixture } from './productFixtures.js';

import type { PriceGroup } from '../../src/domain/entities/priceGroup.js';
import type { PriceGroupRate } from '../../src/domain/entities/priceGroupRate.js';
import type { Product } from '../../src/domain/entities/product.js';
import type {
  SkuHydrationInput,
  SkuImageSettingValues,
  SkuPriceGroupResolver,
} from '../../src/domain/entities/sku.js';
import type { OptionSortTieBreaker } from '../../src/domain/entities/optionGroup.js';
import type { CurrencyConverter } from '../../src/domain/ports/currencyConverter.js';
import type { SettingKey, SettingsProvider } from '../../src/domain/ports/settingsProvider.js';
import type { SkuRepository } from '../../src/domain/ports/skuRepository.js';
import type { CurrencyCode } from '../../src/domain/valueObjects/currencyCode.js';
import type { CfBooleanInput } from '../../src/lib/cfml/truthiness.js';

// ---------------------------------------------------------------------------
// Structurally derived types
//
// JUDGMENT CALL: four types this graph needs are declared outside its dependency whitelist - the
// promotion-reward and promotion-qualifier entities, the sale-price detail projection and the
// per-request current-account context. They are DERIVED from the sku hydration surface already in
// scope, so the import set stays exactly the whitelist while a change upstream still breaks the
// compile.
// ---------------------------------------------------------------------------

/** Element type of any array or readonly array. */
type ElementOf<TArray> = TArray extends readonly (infer TElement)[] ? TElement : never;

/**
 * The promotion-reward entity as seen through the sku hydration surface: the inverse many-to-many
 * through `SwPromoRewardSku` [model/entity/Sku.cfc:L82] and its mirror `SwPromoRewardExclSku`
 * [L83].
 */
type PromotionRewardRef = ElementOf<NonNullable<SkuHydrationInput['promotionRewards']>>;

/**
 * The promotion-qualifier entity as seen through the sku hydration surface: `SwPromoQualSku`
 * [model/entity/Sku.cfc:L84] and its exclusion mirror `SwPromoQualExclSku` [L85].
 */
type PromotionQualifierRef = ElementOf<NonNullable<SkuHydrationInput['promotionQualifiers']>>;

/**
 * The sale-price projection this sku answers `getSalePrice()` from.
 *
 * CFML parity [model/entity/Sku.cfc:L539-L544]: the legacy memo is filled by
 * `getProduct().getSkuSalePriceDetails( getSkuID() )`, which returns `{}` on a miss
 * [model/entity/Product.cfc:L182-L187]. The port hands the projection to the sku directly, so the
 * hit and the miss are pinnable independently.
 */
type SalePriceDetailRef = NonNullable<SkuHydrationInput['salePriceDetail']>;

/**
 * The per-request current-account context.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L262-L268]: the legacy reached the logged-in
 * account through the ambient `getSlatwallScope()` / `getHibachiScope()` accessors. The port
 * replaces ambient state with an explicit parameter, which also normalizes the legacy inconsistency
 * between those two accessor names.
 */
type CurrentAccountContextRef = NonNullable<SkuHydrationInput['currentAccountContext']>;

// ---------------------------------------------------------------------------
// Variant discriminators. Every variation flows through the SINGLE `overrides` parameter as a
// discriminated field, so the caller selects a shape rather than a factory.
// ---------------------------------------------------------------------------

/**
 * Which member of the canonical four-sku AND-of-EXISTS graph to return - see Area 3 in the file
 * header for the graph and for why each member matches what it does.
 *
 * When this field is set, ALL FOUR members are constructed and wired into one shared product and
 * the requested one is returned. The other three are built lean, their only job being option
 * membership.
 */
type AndOfExistsMember = 'A' | 'B' | 'C' | 'D';

/**
 * The order the option groups are handed to the graph in.
 *
 * CFML parity [model/entity/OptionGroup.cfc:L70]: the association carries `orderby="sortOrder"` at
 * the ORM level, so Hibernate returned groups pre-sorted. Associations are materialized at the
 * repository boundary here, making that ORDER BY an explicit repository responsibility - so a suite
 * needs both `'sortOrder'` and `'reversed'`, an already-sorted input being unable to fail.
 */
type OptionGroupOrder = 'sortOrder' | 'reversed';

/**
 * Which `SwSkuCurrency` shape the sku carries, and therefore which cascade step wins for the
 * non-base currency. The four steps, the guard asymmetry and the validation contract that justifies
 * it are all in Area 2 of the file header; each member below records only what is specific to it.
 */
type SkuCurrencyVariant =
  /**
   * No rows at all. The base currency resolves through Step 1; every other eligible currency falls
   * through to Step 3 and is converted.
   */
  | 'none'
  /**
   * The documented default. One row for the NON-BASE currency carrying all three prices, so Step 2
   * wins and Step 3 is skipped - what validated persisted data looks like.
   */
  | 'secondaryOverride'
  /**
   * THE HIGHEST-VALUE VARIANT IN THIS FILE. One row for the NON-BASE currency whose `price` is
   * present but whose `listPrice` and `renewalPrice` are ABSENT, which strands both permanently -
   * see the header. `getPriceByCurrencyCode` answers a real `Money` while the other two answer
   * NOTHING. Contract-honest data, not a defect.
   */
  | 'secondaryPriceOnly'
  /**
   * TWO rows for the SAME non-base currency carrying DIFFERENT prices. Step 2 has no `break`, so
   * the LAST matching row wins and its `skuCurrencyID` is the one recorded; array order is
   * load-bearing and this variant is what lets a suite prove it.
   */
  | 'secondaryDuplicated'
  /**
   * One row for the non-base currency whose `price` is ABSENT while `listPrice` is present -
   * INVALID BY VALIDATION. It reaches Step 3's gate from inside Step 2: the guarded `listPrice`
   * assignment lands, the unguarded `price` assignment does not, so Step 3 FIRES and overwrites all
   * three with converted values - yet `skuCurrencyID` survives from Step 2 while `converted` flips
   * to `true`.
   */
  | 'secondaryPriceAbsent'
  /**
   * One row for the BASE currency, so Step 2 OVERWRITES what Step 1 wrote for the same currency and
   * stamps a `skuCurrencyID` - how a suite proves Step 2 supersedes rather than fills gaps.
   */
  | 'baseOverride';

// ---------------------------------------------------------------------------
// Overrides. Declared here and NOT exported: the shape is an implementation detail of this factory.
// ---------------------------------------------------------------------------

interface SkuFixtureOverrides {
  /**
   * Prefix for every identifier this graph mints, so two graphs in one suite cannot collide.
   * Defaults to `'skfx'`.
   */
  readonly idPrefix?: string | undefined;

  /** Overrides the derived `skuID`. Defaults to `` `${idPrefix}-sku` ``. */
  readonly skuID?: string | undefined;

  /** CFML parity [model/entity/Sku.cfc:L53]: `activeFlag` defaults to `1`, i.e. `true`. */
  readonly activeFlag?: CfBooleanInput;

  /**
   * `SwSku.skuCode` is `unique="true" length="50"` [model/entity/Sku.cfc:L54] and
   * `model/validation/Sku.json` makes it required AND unique, so graph members differ.
   */
  readonly skuCode?: string | undefined;

  /** `big_decimal` [model/entity/Sku.cfc:L55], `default="0"`. */
  readonly listPrice?: Money | undefined;

  /**
   * `big_decimal` [model/entity/Sku.cfc:L56], `default="0"`, required on save. Defaults to exactly
   * `19.99`, the unit price the money value object's reference calculation is pinned to: 19.99 x 3
   * = 59.97, less 12.5 per cent = 7.49625, discounted total 52.47375, presented as `"52.47"` -
   * reproducing `numberFormat(discountAmount,"0.00")` [model/service/PromotionService.cfc:L1017]
   * with no binary-floating-point drift.
   */
  readonly price?: Money | undefined;

  /** `big_decimal` [model/entity/Sku.cfc:L57], `default="0"`. */
  readonly renewalPrice?: Money | undefined;

  /** `SwSku.imageFile`, length 50 [model/entity/Sku.cfc:L58]. */
  readonly imageFile?: string | undefined;

  /**
   * The three resolved image setting values `generateImageFileName` and `getImagePath`
   * compose with.
   *
   * ABSENT BY DEFAULT, and that default is the interesting case rather than a shortcut:
   * a sku built without them REFUSES both methods, which is what a sku hydrated by an
   * adapter that was not given them does. Supply this to reach the composing path.
   *
   * The three keys are `getHibachiScope().getBaseImageURL()`
   * [model/entity/Sku.cfc:L146], `setting('productImageOptionCodeDelimiter')` [L136]
   * and `setting('productImageDefaultExtension')` [L138] - none of them one of the four
   * keys `src/domain/ports/settingsProvider.ts` publishes, which is why they arrive as
   * resolved values rather than through the port. Their legacy defaults are `"-"`
   * [model/service/SettingService.cfc:L192] and `"jpg"` [L191].
   */
  readonly imageSettingValues?: SkuImageSettingValues | undefined;

  /** [model/entity/Sku.cfc:L59], `default="0"`. */
  readonly userDefinedPriceFlag?: CfBooleanInput;

  /** The denormalized quantity cache column [model/entity/Sku.cfc:L62]. */
  readonly calculatedQATS?: number | undefined;

  /** [model/entity/Sku.cfc:L90]. */
  readonly remoteID?: string | undefined;

  /**
   * Whether the sku reports itself unsaved. Defaults to `false`, matching the entity.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L600-L605]: `setProduct` short-circuits its containment probe
   * with `isNew() or ...`, so a new sku is appended WITHOUT the probe. Either value is safe here
   * because `setProduct` is called once, but a caller that sets this AND re-wires the sku itself
   * can produce a duplicate row.
   */
  readonly isNew?: boolean | undefined;

  /**
   * Opaque identifier standing in for the out-of-scope `SwSubscriptionTerm` FK
   * [model/entity/Sku.cfc:L66]. Absent by default: subscription handling lives in the out-of-scope
   * branches at [model/service/SkuService.cfc:L139-L202] and the column survives only so the
   * merchandise path is honest about the schema.
   */
  readonly subscriptionTermID?: string | undefined;

  /** `SwAlternateSkuCode` identifiers [model/entity/Sku.cfc:L69]. */
  readonly alternateSkuCodeIDs?: readonly string[] | undefined;

  /** `SwStock` identifiers [model/entity/Sku.cfc:L73]. */
  readonly stockIDs?: readonly string[] | undefined;

  /** `SwSkuAccessContent` identifiers [model/entity/Sku.cfc:L77] - out of scope. */
  readonly accessContentIDs?: readonly string[] | undefined;

  /** `SwSkuSubsBenefit` identifiers [model/entity/Sku.cfc:L78] - out of scope. */
  readonly subscriptionBenefitIDs?: readonly string[] | undefined;

  /** `SwSkuRenewalSubsBenefit` identifiers [model/entity/Sku.cfc:L79] - out of scope. */
  readonly renewalSubscriptionBenefitIDs?: readonly string[] | undefined;

  /** `SwPhysicalSku` identifiers [model/entity/Sku.cfc:L87]. */
  readonly physicalIDs?: readonly string[] | undefined;

  /**
   * Build the canonical four-sku graph and return this member. Absent by default, in which case a
   * single sku carrying the full option set is built and is the only candidate.
   */
  readonly andOfExistsMember?: AndOfExistsMember | undefined;

  /**
   * Supply the option set outright, bypassing the generated pool. This is the handle for the shared
   * option identity described in Area 3 of the header: a caller needing one option shared across
   * graphs lifts it from a graph built here - member `'C'` carries all three - and hands the very
   * same instances back through this field.
   */
  readonly options?: readonly Option[] | undefined;

  /** Which order the generated option groups are handed over in. Defaults to `'sortOrder'`. */
  readonly optionGroupOrder?: OptionGroupOrder | undefined;

  /**
   * Add a FOURTH option belonging to the FIRST option group, so one sku carries two options from
   * the same group. Defaults to `false`.
   *
   * INVALID BY VALIDATION, AND LABELLED SO DELIBERATELY: `model/validation/Sku.json` wires
   * `hasOneOptionPerOptionGroup` [model/entity/Sku.cfc:L772-L784] onto `options` for the `save`
   * context, so this shape could never be persisted. Without it the de-duplication branch inside
   * the two option-struct accessors is unreachable.
   */
  readonly duplicateOptionGroupOption?: boolean | undefined;

  /**
   * The deterministic tie-breaker each generated option group is given. SUPPLYING ONE IS NOT
   * OPTIONAL FOR REPRODUCIBILITY: `OptionGroup`'s own fallback reproduces `randRange(1,100)` from
   * [model/service/HibachiUtilityService.cfc:L522], so a graph without one would sort
   * non-deterministically. This factory always supplies a constant.
   */
  readonly optionSortTieBreaker?: OptionSortTieBreaker | undefined;

  /**
   * The value the settings double answers for `skuCurrency`. Defaults to `'USD'`, and this field
   * plus the settings double are the ONLY places it enters the graph: `getCurrencyCode()`
   * [model/entity/Sku.cfc:L360-L365] just memoizes `this.setting('skuCurrency')`, and the default
   * lives in the setting DECLARATION at [model/service/SettingService.cfc:L221] as
   * `{fieldType="select", defaultValue="USD"}`. There is no `"USD"` literal in `Sku.cfc` at all.
   */
  readonly skuCurrency?: string | undefined;

  /**
   * The value the settings double answers for `skuEligibleCurrencies`. Defaults to `'USD,EUR'` -
   * TWO currencies, for the reason in the header. PASS `''` TO CLOSE THE ELIGIBILITY GATE. The
   * setting's own default is the runtime-computed active-currency list
   * [model/service/SettingService.cfc:L222], so a normal installation has it populated - but the
   * gate is real and a port that dropped it would change behaviour.
   */
  readonly skuEligibleCurrencies?: string | undefined;

  /** Which `SwSkuCurrency` shape to generate. Defaults to `'secondaryOverride'`. */
  readonly skuCurrencyVariant?: SkuCurrencyVariant | undefined;

  /**
   * Supply the `SwSkuCurrency` rows outright, bypassing the generated variant. Copied into a fresh
   * array owned by the returned sku.
   */
  readonly skuCurrencies?: readonly SkuCurrency[] | undefined;

  /**
   * Multipliers the currency-converter double applies, keyed by TARGET currency
   * code and looked up case-insensitively. Defaults to `{ EUR: '0.90' }`.
   *
   * Every value is a DECIMAL STRING, never a JavaScript number, because the
   * double multiplies through `Money` and money never touches a float.
   *
   * A non-base eligible currency with no entry here is PRICED AT PAR, because
   * that is what [model/service/CurrencyService.cfc:L100-L101] does with a
   * currency it has no rate for. So an omitted rate is a valid scenario to set
   * up rather than a fixture misconfiguration, and a suite that wants to observe
   * the pass-through omits the entry deliberately.
   */
  readonly conversionRates?: Readonly<Record<string, string>> | undefined;

  /**
   * The owning product. Built by `makeProductFixture` when omitted; pass `undefined` explicitly to
   * leave the sku detached.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L65]: `product` is a REQUIRED many-to-one in the schema and
   * several sku methods dereference it with no guard, so a detached sku is a deliberately
   * degenerate shape whose only purpose is to reach those refusals.
   */
  readonly product?: Product | undefined;

  /**
   * Extra skus the product's option-resolution repository double should consider, on top of the
   * graph this call builds. Copied on the way in.
   */
  readonly selectedOptionsCandidateSkus?: readonly Sku[] | undefined;

  /**
   * The sale-price projection the returned sku answers from. ABSENT by default.
   *
   * JUDGMENT CALL: absence is the interesting default, because it is what makes the legacy
   * fall-back path reachable - see the annotation further down. Supplying one pins the hit instead.
   */
  readonly salePriceDetail?: SalePriceDetailRef | undefined;

  /**
   * The `SwPriceGroupRateSku` link rows this sku participates in [model/entity/Sku.cfc:L86].
   * Defaults to `[]`; build real ones with the price-group fixture.
   *
   * THERE IS NO EXCLUSION SIDE ON `Sku`, AND NONE MAY BE INVENTED. `PriceGroupRate` declares
   * `excludedSkus` through `SwPriceGroupRateExclSku` [model/entity/PriceGroupRate.cfc:L77], yet
   * `Sku.cfc` declares only the inclusion side [L86], where `ProductType.cfc` carries BOTH [L74,
   * L75].
   */
  readonly priceGroupRates?: readonly PriceGroupRate[] | undefined;

  /**
   * What the price-group resolver double answers for `calculateSkuPriceBasedOnPriceGroup`. Defaults
   * to the sku's own price, because CFML parity [model/service/PriceGroupService.cfc:L301-L314]
   * makes that the legacy's explicit pass-through when no rate applies. The amount-type arithmetic
   * belongs to the SERVICE [model/service/PriceGroupService.cfc:L316-L340].
   */
  readonly priceGroupPrice?: Money | undefined;

  /**
   * What the price-group resolver double answers for `calculateSkuPriceBasedOnCurrentAccount`.
   * Defaults to the sku's own price, because CFML parity
   * [model/service/PriceGroupService.cfc:L271-L298] seeds the candidate array with `sku.getPrice()`
   * and returns the LOWEST, so the account price can never exceed the base price.
   */
  readonly currentAccountPrice?: Money | undefined;

  /**
   * The per-request account context. Defaults to a context carrying a derived opaque `accountID`;
   * pass `undefined` to reach the entity's refusal.
   */
  readonly currentAccountContext?: CurrentAccountContextRef | undefined;

  /** `SwPromoRewardSku` link rows [model/entity/Sku.cfc:L82]. Defaults to `[]`. */
  readonly promotionRewards?: readonly PromotionRewardRef[] | undefined;

  /** `SwPromoRewardExclSku` link rows [model/entity/Sku.cfc:L83]. Defaults to `[]`. */
  readonly promotionRewardExclusions?: readonly PromotionRewardRef[] | undefined;

  /** `SwPromoQualSku` link rows [model/entity/Sku.cfc:L84]. Defaults to `[]`. */
  readonly promotionQualifiers?: readonly PromotionQualifierRef[] | undefined;

  /** `SwPromoQualExclSku` link rows [model/entity/Sku.cfc:L85]. Defaults to `[]`. */
  readonly promotionQualifierExclusions?: readonly PromotionQualifierRef[] | undefined;

  /** Replaces the generated settings double outright. */
  readonly settingsProvider?: SettingsProvider | undefined;

  /** Replaces the generated currency-converter double outright. */
  readonly currencyConverter?: CurrencyConverter | undefined;

  /** Replaces the generated price-group resolver double outright. */
  readonly priceGroupResolver?: SkuPriceGroupResolver | undefined;

  /** Replaces the generated sku repository double outright. */
  readonly skuRepository?: SkuRepository | undefined;

  /**
   * What the sku repository double answers for `getTransactionExistsFlag`. Defaults to `false`.
   *
   * CFML parity [model/dao/SkuDAO.cfc:L53]: the legacy counts order-item rows. Nothing is persisted
   * here, so `false` is the honest answer - and it is what unblocks the delete guard
   * `model/validation/Sku.json` places on `transactionExistsFlag`.
   */
  readonly transactionExistsFlag?: boolean | undefined;
}

// ---------------------------------------------------------------------------
// Documented defaults. Immutable primitives only, per the module-scope rule in the header.
// ---------------------------------------------------------------------------

/** Identifier prefix. Distinct from the sibling fixtures' `'prfx'`. */
const DEFAULT_ID_PREFIX = 'skfx';

/**
 * CFML parity [model/entity/Sku.cfc:L53] versus [model/entity/Product.cfc:L53]: `Sku.activeFlag`
 * carries `default="1"` and `Product.activeFlag` carries NO default. Modelled, not harmonised.
 */
const DEFAULT_ACTIVE_FLAG = true;

/** [model/entity/Sku.cfc:L59] `default="0"`. */
const DEFAULT_USER_DEFINED_PRICE_FLAG = false;

/**
 * `unique="true" length="50"` [model/entity/Sku.cfc:L54]. Shaped after `Helper.cfc`'s
 * `TESTPRODUCTXXX` so the lineage of the reference pattern stays visible.
 */
const LEGACY_SKU_CODE = 'TESTSKUXXX';

/** The reference-calculation unit price. See the note on `SkuFixtureOverrides.price`. */
const SKU_PRICE = '19.99';

/** `big_decimal` [model/entity/Sku.cfc:L55]. Above `SKU_PRICE`, as a list price is. */
const SKU_LIST_PRICE = '24.99';

/** `big_decimal` [model/entity/Sku.cfc:L57]. */
const SKU_RENEWAL_PRICE = '17.99';

/**
 * The ORM default for all three money columns [model/entity/Sku.cfc:L55-L57], as a decimal string
 * rather than the number `0`. A real persisted value, not a stand-in for absence.
 */
const ZERO_DECIMAL = '0';

/** The `skuCurrency` setting value [model/service/SettingService.cfc:L221]. */
const BASE_CURRENCY_CODE = 'USD';

/** The second eligible currency, which is what makes Step 2 and Step 3 separable. */
const SECONDARY_CURRENCY_CODE = 'EUR';

/** The `skuEligibleCurrencies` setting value [model/service/SettingService.cfc:L222]. */
const ELIGIBLE_CURRENCIES = `${BASE_CURRENCY_CODE},${SECONDARY_CURRENCY_CODE}`;

/** Multiplier the converter double applies for the secondary currency. */
const SECONDARY_CONVERSION_RATE = '0.90';

/** `SwSkuCurrency.price` for the secondary currency [model/entity/SkuCurrency.cfc:L53]. */
const SECONDARY_OVERRIDE_PRICE = '17.49';

/** `SwSkuCurrency.listPrice` [model/entity/SkuCurrency.cfc:L55]. */
const SECONDARY_OVERRIDE_LIST_PRICE = '21.99';

/** `SwSkuCurrency.renewalPrice` [model/entity/SkuCurrency.cfc:L54]. */
const SECONDARY_OVERRIDE_RENEWAL_PRICE = '15.49';

/**
 * The price on the FIRST of two same-currency rows in the `'secondaryDuplicated'` variant, far from
 * `SECONDARY_OVERRIDE_PRICE` so a suite cannot pass while reading the wrong row.
 */
const SECONDARY_SUPERSEDED_PRICE = '8.88';

/** `SwSkuCurrency.price` for the base currency in the `'baseOverride'` variant. */
const BASE_OVERRIDE_PRICE = '18.49';

/** The denormalized quantity cache column [model/entity/Sku.cfc:L62]. */
const CALCULATED_QATS = 7;

/** [model/entity/Sku.cfc:L90]. */
const REMOTE_ID = 'remote-test-sku';

/** The audit timestamps [model/entity/Sku.cfc:L93, L95]. They match the sibling fixtures. */
const CREATED_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';
const MODIFIED_DATE_TIME_UTC = '2024-06-15T12:30:00.000Z';

/** `SwOptionGroup.optionGroupCode` values. All match `ENTITY_CODE_PATTERN`. */
const OPTION_GROUP_1_CODE = 'size';
const OPTION_GROUP_2_CODE = 'color';
const OPTION_GROUP_3_CODE = 'material';

/** `SwOptionGroup.optionGroupName` values [model/entity/OptionGroup.cfc:L53]. */
const OPTION_GROUP_1_NAME = 'Size';
const OPTION_GROUP_2_NAME = 'Color';
const OPTION_GROUP_3_NAME = 'Material';

/**
 * `SwOption.optionCode` values.
 *
 * CFML parity [model/validation/Option.json] and [model/validation/OptionGroup.json]: `optionCode`
 * and `optionGroupCode` are each `required`, `unique` AND constrained by `^[a-zA-Z0-9-_.|:~^]+$`.
 * Every code literal here satisfies it, so the default graph is a VALID entity graph.
 */
const OPTION_1_CODE = 'size-large';
const OPTION_2_CODE = 'color-red';
const OPTION_3_CODE = 'material-cotton';
const OPTION_4_CODE = 'size-small';

/** `SwOption.optionName` values [model/entity/Option.cfc:L54]. */
const OPTION_1_NAME = 'Large';
const OPTION_2_NAME = 'Red';
const OPTION_3_NAME = 'Cotton';
const OPTION_4_NAME = 'Small';

/**
 * `SwOptionGroup.sortOrder` values [model/entity/OptionGroup.cfc:L58], declared
 *   `ormtype="integer" required="true"`
 * with NO default. They are DISTINCT on purpose: the sorted-sku query
 * [model/dao/SkuDAO.cfc:L178-L198] orders by base-10 POSITIONAL WEIGHTING, in which a lower-ranked
 * group gets the HIGHER weight, and equal group sort orders would collapse the positions.
 */
const OPTION_GROUP_1_SORT_ORDER = 1;
const OPTION_GROUP_2_SORT_ORDER = 2;
const OPTION_GROUP_3_SORT_ORDER = 3;

/**
 * `SwOption.sortOrder` values [model/entity/Option.cfc:L56].
 *
 * CFML parity [model/entity/Option.cfc:L56] versus [model/entity/OptionGroup.cfc:L58]:
 * `Option.sortOrder` LACKS the `required="true"` its group carries and adds
 * `sortContext="optionGroup"`, so option ordering is scoped PER GROUP. Preserved, not harmonised.
 */
const OPTION_1_SORT_ORDER = 1;
const OPTION_2_SORT_ORDER = 2;
const OPTION_3_SORT_ORDER = 3;
const OPTION_4_SORT_ORDER = 4;

/** [model/entity/OptionGroup.cfc:L57] `imageGroupFlag` `default="0"`. */
const IMAGE_GROUP_FLAG = false;

/**
 * What the product's `nextOptionGroupSortOrder` reports: the highest group sort order plus one,
 * exactly as [model/dao/SkuDAO.cfc:L210-L214] computes it with
 *   `SELECT max(SwOptionGroup.sortOrder) as max` and `rs.max + 1`.
 *
 * LEGACY-DEFECT [model/dao/SkuDAO.cfc:L222-L226]: `clearNextOptionGroupSortOrder` deletes the
 * cached value only `<cfif not structKeyExists(variables, ...)>` - an INVERTED condition, so it can
 * never fire and the cache survives for the component's whole lifetime.
 *
 * Preserved deliberately; do not fix without a product decision.
 *
 * Its consequence CANNOT be preserved: on a warm container that cache would be cross-request state,
 * so the value is per-graph here.
 *
 * LEGACY-NOTE [model/dao/SkuDAO.cfc:L210-L214]: on an EMPTY `SwOptionGroup` table `max()` still
 * returns one row holding NULL, so `recordCount` is truthy and `NULL + 1` misbehaves.
 */
const NEXT_OPTION_GROUP_SORT_ORDER = OPTION_GROUP_3_SORT_ORDER + 1;

/**
 * The constant every generated option group's sort tie-breaker returns, replacing the
 * `randRange(1,100)` fallback at [model/service/HibachiUtilityService.cfc:L522]. `1` rather than
 * `0` because the legacy range is inclusive of 1.
 */
const OPTION_SORT_TIE_BREAKER_VALUE = 1;

// ---------------------------------------------------------------------------
// Override resolution
// ---------------------------------------------------------------------------

/**
 * The value the caller wrote for `key`, or the documented default when the key was not written.
 *
 * Distinguishing "omitted" from "explicitly `undefined`" is not pedantry:
 * `exactOptionalPropertyTypes` is on, and `product`, `currentAccountContext` and
 * `optionSortTieBreaker` all reach an entity refusal or a documented degradation when explicitly
 * cleared.
 */
function resolveOverride<TKey extends keyof SkuFixtureOverrides>(
  overrides: SkuFixtureOverrides | undefined,
  key: TKey,
  documentedDefault: SkuFixtureOverrides[TKey],
): SkuFixtureOverrides[TKey] {
  if (hasOverride(overrides, key)) {
    return overrides?.[key];
  }
  return documentedDefault;
}

/**
 * Was `key` written by the caller at all, whatever value it carries? The companion to
 * `resolveOverride`, used where the default must be CONSTRUCTED rather than named - the option
 * graph, the currency rows, the product and the four doubles - because building those eagerly just
 * to discard them would create objects no graph ever owns.
 */
function hasOverride(
  overrides: SkuFixtureOverrides | undefined,
  key: keyof SkuFixtureOverrides,
): boolean {
  return overrides !== undefined && Object.hasOwn(overrides, key);
}

// ---------------------------------------------------------------------------
// Module-scope pure builders. Functions, never data - see the no-mutable-module-state rule in the
// header. Each returns a freshly constructed value, which is what lets a suite prove a second
// invocation does not observe the first invocation's memo.
// ---------------------------------------------------------------------------

/** The audit columns every entity in one graph carries. */
type AuditTrail = {
  readonly createdDateTime: Date;
  readonly createdByAccountID: string;
  readonly modifiedDateTime: Date;
  readonly modifiedByAccountID: string;
};

/**
 * Fresh `Date` instances per graph: a `Date` is mutable, so it is never shared.
 * `createdByAccountID` and `modifiedByAccountID` are foreign keys into the out-of-scope `SwAccount`
 * [model/entity/Sku.cfc:L94, L96], so they survive as inert identifiers. All four are
 * `hb_populateEnabled="false"` in the legacy, which is why none is caller-settable.
 */
function makeAuditTrail(idPrefix: string): AuditTrail {
  return {
    createdDateTime: new Date(CREATED_DATE_TIME_UTC),
    createdByAccountID: `${idPrefix}-account-created`,
    modifiedDateTime: new Date(MODIFIED_DATE_TIME_UTC),
    modifiedByAccountID: `${idPrefix}-account-modified`,
  };
}

/**
 * A deterministic replacement for the option sort tie-breaker. A fresh closure per call, so no two
 * groups share one function object.
 */
function makeDeterministicOptionSortTieBreaker(): OptionSortTieBreaker {
  return (): number => OPTION_SORT_TIE_BREAKER_VALUE;
}

/**
 * The three option groups, freshly built, in the requested order.
 *
 * Each group is constructed with an EMPTY `options` array which the option builder then fills,
 * because `SwOption` holds the `optionGroupID` FK [model/entity/Option.cfc:L59] while
 * `SwOptionGroup` holds the inverse collection [model/entity/OptionGroup.cfc:L70], so neither can
 * be complete before the other. That is what `Option.setOptionGroup`
 * [model/entity/Option.cfc:L92-L97] does at runtime.
 *
 * JUDGMENT CALL: `setOptionGroup` is NOT used to do the filling, because of the double-append
 * hazard recorded in the header; the graph is built directly and each array appended to once per
 * option.
 *
 * JUDGMENT CALL: the SAME `optionSortTieBreaker` reference is handed to all three groups. It is a
 * pure function holding no state, so sharing it shares nothing - the copy-per-graph rule exists to
 * stop two graphs mutating one another.
 *
 * LEGACY-NOTE [model/entity/OptionGroup.cfc:L73-L79]: the legacy `getOptions()` returns
 * `variables.Options` with a CAPITAL O, which works only because CFML variable names are
 * case-insensitive - the same trap as [model/entity/ProductType.cfc:L103] and
 * [model/entity/Sku.cfc:L517]. It also delegates to `hibachiUtilityService.sortObjectArray`, whose
 * `sortType` defaults to `"text"`, so sorting integer `sortOrder` values lexicographically puts
 * `10` before `9`. The text default is kept for parity.
 */
function makeFixtureOptionGroups(
  idPrefix: string,
  order: OptionGroupOrder,
  optionSortTieBreaker: OptionSortTieBreaker | undefined,
): OptionGroup[] {
  const audit: AuditTrail = makeAuditTrail(idPrefix);

  const groupOne: OptionGroup = new OptionGroup({
    optionGroupID: `${idPrefix}-optiongroup-1`,
    optionGroupName: OPTION_GROUP_1_NAME,
    optionGroupCode: OPTION_GROUP_1_CODE,
    optionGroupImage: undefined,
    optionGroupDescription: undefined,
    imageGroupFlag: IMAGE_GROUP_FLAG,
    sortOrder: OPTION_GROUP_1_SORT_ORDER,
    remoteID: undefined,
    createdDateTime: audit.createdDateTime,
    createdByAccountID: audit.createdByAccountID,
    modifiedDateTime: audit.modifiedDateTime,
    modifiedByAccountID: audit.modifiedByAccountID,
    options: [],
    optionSortTieBreaker,
  });

  const groupTwo: OptionGroup = new OptionGroup({
    optionGroupID: `${idPrefix}-optiongroup-2`,
    optionGroupName: OPTION_GROUP_2_NAME,
    optionGroupCode: OPTION_GROUP_2_CODE,
    optionGroupImage: undefined,
    optionGroupDescription: undefined,
    imageGroupFlag: IMAGE_GROUP_FLAG,
    sortOrder: OPTION_GROUP_2_SORT_ORDER,
    remoteID: undefined,
    createdDateTime: audit.createdDateTime,
    createdByAccountID: audit.createdByAccountID,
    modifiedDateTime: audit.modifiedDateTime,
    modifiedByAccountID: audit.modifiedByAccountID,
    options: [],
    optionSortTieBreaker,
  });

  const groupThree: OptionGroup = new OptionGroup({
    optionGroupID: `${idPrefix}-optiongroup-3`,
    optionGroupName: OPTION_GROUP_3_NAME,
    optionGroupCode: OPTION_GROUP_3_CODE,
    optionGroupImage: undefined,
    optionGroupDescription: undefined,
    imageGroupFlag: IMAGE_GROUP_FLAG,
    sortOrder: OPTION_GROUP_3_SORT_ORDER,
    remoteID: undefined,
    createdDateTime: audit.createdDateTime,
    createdByAccountID: audit.createdByAccountID,
    modifiedDateTime: audit.modifiedDateTime,
    modifiedByAccountID: audit.modifiedByAccountID,
    options: [],
    optionSortTieBreaker,
  });

  // 'reversed' hands them over descending - what a repository that forgot
  // [model/entity/OptionGroup.cfc:L70]'s `orderby="sortOrder"` would produce.
  return order === 'reversed' ? [groupThree, groupTwo, groupOne] : [groupOne, groupTwo, groupThree];
}

/**
 * The option pool, freshly built, one option per group - plus optionally a fourth duplicating the
 * first group. THE POOL IS THE SHARED-IDENTITY BOUNDARY described in Area 3 of the header.
 *
 * The groups arrive in whatever order `makeFixtureOptionGroups` produced, so the pool locates each
 * group by CODE rather than by position, which keeps option 1 attached to the size group whichever
 * order the caller asked for.
 *
 * LEGACY-NOTE [model/entity/Option.cfc:L66]: `Option.skus` is the INVERSE side of `SwSkuOption` and
 * is constructor-only here, so these options report an empty `getSkus()`. Nothing in the
 * option-resolution path reads that side - the repository double answers from `Sku.getOptions()`,
 * the OWNING side, exactly as the HQL navigates from `sku.options` at [model/dao/SkuDAO.cfc:L110].
 *
 * LEGACY-NOTE [model/entity/Option.cfc:L67-L70]: `Option` is the ONLY entity in this slice carrying
 * BOTH the inclusion and the exclusion side for BOTH promotion rewards and qualifiers; `Product`
 * and `Sku` carry the inclusion sides only.
 */
function makeFixtureOptionPool(
  idPrefix: string,
  groups: readonly OptionGroup[],
  includeDuplicateGroupOption: boolean,
): Option[] {
  const audit: AuditTrail = makeAuditTrail(idPrefix);

  const option = (
    ordinal: number,
    optionCode: string,
    optionName: string,
    sortOrder: number,
    groupCode: string,
  ): Option =>
    new Option({
      optionID: `${idPrefix}-option-${String(ordinal)}`,
      optionCode,
      optionName,
      optionDescription: undefined,
      sortOrder,
      optionGroup: findOptionGroupByCode(groups, groupCode),
      defaultImageID: undefined,
      remoteID: undefined,
      createdDateTime: audit.createdDateTime,
      createdByAccountID: audit.createdByAccountID,
      modifiedDateTime: audit.modifiedDateTime,
      modifiedByAccountID: audit.modifiedByAccountID,
    });

  const pool: Option[] = [
    option(1, OPTION_1_CODE, OPTION_1_NAME, OPTION_1_SORT_ORDER, OPTION_GROUP_1_CODE),
    option(2, OPTION_2_CODE, OPTION_2_NAME, OPTION_2_SORT_ORDER, OPTION_GROUP_2_CODE),
    option(3, OPTION_3_CODE, OPTION_3_NAME, OPTION_3_SORT_ORDER, OPTION_GROUP_3_CODE),
  ];

  if (includeDuplicateGroupOption) {
    // LEGACY-DEFECT [model/entity/Sku.cfc:L500-L510]: getOptionsByOptionGroupCodeStruct guards on
    // `variables.optionsByOptionGroupCodeStruct` at L501 but the line below initialises
    // `variables.optionsByOptionGroupIDStruct` - the WRONG key - so L504's structKeyExists
    // dereferences a variable that was never created and the method THROWS.
    //
    // Preserved deliberately; do not fix without a product decision.
    //
    // LEGACY-DEFECT [model/entity/Sku.cfc:L512-L522]: getOptionsByOptionGroupIDStruct guards and
    // initialises the right key but L517 writes to `variables.OptionsByGroupIDStruct` - a DIFFERENT
    // NAME, not merely different casing - so L521 always returns an empty struct and the L516
    // de-duplication check never sees anything.
    //
    // Preserved deliberately; do not fix without a product decision.
    //
    // JUDGMENT CALL: both ARE fixed in the target as documented deliberate divergences, being
    // unobservable through the public contract, so this fourth option exercises the FIXED
    // de-duplication branch, otherwise unreachable. The shape is invalid under
    // `hasOneOptionPerOptionGroup` [model/entity/Sku.cfc:L772-L784], on purpose.
    //
    // JUDGMENT CALL: that de-duplication is FIRST-MATCH-WINS, both accessors writing only
    //   `if (!structKeyExists(struct, key))`
    // which is the OPPOSITE of currency Step 2 [model/entity/Sku.cfc:L399-L414] and of the rate
    // lookup [model/service/PriceGroupService.cfc:L146-L150].
    pool.push(option(4, OPTION_4_CODE, OPTION_4_NAME, OPTION_4_SORT_ORDER, OPTION_GROUP_1_CODE));
  }

  // The inverse collections are completed here rather than through `setOptionGroup`, per the
  // double-append hazard in the header.
  for (const held of pool) {
    const owningGroup: OptionGroup | undefined = held.getOptionGroup();
    if (owningGroup !== undefined) {
      owningGroup.getOptions().push(held);
    }
  }

  return pool;
}

/**
 * The group in `groups` whose code matches, compared case-insensitively.
 *
 * CFML parity [model/entity/Sku.cfc:L504]: the legacy keys its struct by `getOptionGroupCode()` and
 * CFML struct keys are case-INSENSITIVE, so a case-respecting comparison would be a divergence.
 */
function findOptionGroupByCode(
  groups: readonly OptionGroup[],
  groupCode: string,
): OptionGroup | undefined {
  return groups.find((candidate: OptionGroup): boolean =>
    cfEquals(candidate.getOptionGroupCode() ?? '', groupCode),
  );
}

/**
 * Which pool positions each member of the canonical graph carries. A function rather than a table,
 * so the array is fresh per call. The switch is exhaustive over the member union, so adding a
 * member is a compile error rather than a silent gap.
 */
function optionIndexesForMember(member: AndOfExistsMember): readonly number[] {
  switch (member) {
    case 'A':
      return [0, 1];
    case 'B':
      return [0];
    case 'C':
      return [0, 1, 2];
    case 'D':
      // NO OPTIONS AT ALL, AND THAT IS THE POINT OF THIS MEMBER.
      //
      // LEGACY-DEFECT [model/entity/Sku.cfc:L756-L769]: hasUniqueOptions builds `optionsList` from
      // this sku's options, so for an option-less sku the list is `""`; `listLen("")` is 0, no
      // `exists` clause is appended, and the HQL degenerates to
      //   `select distinct sku ... inner join sku.options as opt where 0 = 0`
      // plus the productID filter - returning EVERY OPTIONED SKU OF THE PRODUCT, so an option-less
      // sku on a product with two or more optioned skus FAILS hasUniqueOptions spuriously.
      // Preserved deliberately; do not fix without a product decision.
      //
      // JUDGMENT CALL: this edge case is newly catalogued - it is not among the
      // plan's published twenty, and it is deliberately left unnumbered in the port's
      // thirty-entry register, which is closed at thirty. It was found while authoring this fixture,
      // by working out what the canonical graph's fourth member would actually do,
      // and it is recorded here rather than left for a suite to trip over.
      return [];
  }
}

/** Every member of the canonical graph, in construction order. A fresh array per call. */
function andOfExistsMembers(): readonly AndOfExistsMember[] {
  return ['A', 'B', 'C', 'D'];
}

/**
 * The pool entries named by `indexes`, as a FRESH array. `noUncheckedIndexedAccess` makes every
 * pool read `Option | undefined`, so the absent case is stated rather than asserted away with a
 * non-null assertion - which this file does not use even though the test lint profile would permit
 * one.
 */
function selectPoolOptions(pool: readonly Option[], indexes: readonly number[]): Option[] {
  const selected: Option[] = [];
  for (const index of indexes) {
    const candidate: Option | undefined = pool[index];
    if (candidate !== undefined) {
      selected.push(candidate);
    }
  }
  return selected;
}

/**
 * The two URL-key settings this sku never reads, present only so the settings double satisfies the
 * port's TOTAL contract: `SettingsProvider.setting` returns `string` and never `undefined`, so a
 * partial table would make that declaration a lie [model/service/SettingService.cfc:L178, L179].
 */
const GLOBAL_URL_KEY_PRODUCT = 'sp';
const GLOBAL_URL_KEY_PRODUCT_TYPE = 'spt';

/**
 * A hand-written in-memory stand-in for the settings port, and the only place the base currency
 * enters the graph. The cascade reads `setting('skuCurrency')` at [model/entity/Sku.cfc:L385, L418,
 * L422, L425] and `setting('skuEligibleCurrencies')` at [L373, L375].
 *
 * The port publishes exactly FOUR keys and is not widened: its neighbours in the legacy declaration
 * block [model/service/SettingService.cfc:L219-L228] are deliberately absent, as is
 * `globalAssetsImageFolderPath`, which `Option.getImageDirectory()`
 * [model/entity/Option.cfc:L81-L83] reads and which is out of scope.
 *
 * JUDGMENT CALL: the double records nothing, a recorded call list not being observable through the
 * `Sku` this factory returns.
 */
function makeFixtureSettingsProvider(
  skuCurrency: string,
  skuEligibleCurrencies: string,
): SettingsProvider {
  const table: Readonly<Record<SettingKey, string>> = {
    globalURLKeyProduct: GLOBAL_URL_KEY_PRODUCT,
    globalURLKeyProductType: GLOBAL_URL_KEY_PRODUCT_TYPE,
    skuCurrency,
    skuEligibleCurrencies,
  };

  return {
    setting(settingName: SettingKey): string {
      return table[settingName];
    },
  };
}

/**
 * A hand-written in-memory stand-in for the currency-converter port.
 *
 * LEGACY-NOTE [model/entity/Sku.cfc:L371, L375, L377, L379]: the legacy asks
 * `getService("currencyService").getCurrencySmartList()`, applies
 *   `addInFilter('currencyCode', setting('skuEligibleCurrencies'))`
 * and then reads `getCurrencyCode()` off each returned `Currency` ENTITY. `Currency` is out of
 * scope and every one of those lines reads nothing but the code, so the port answers with codes
 * directly and this double parses them out of the setting's own list.
 *
 * `getAllActiveCurrencyIDList` is never called by `Sku`; it exists because the port declares it and
 * because it is the runtime-computed DEFAULT of `skuEligibleCurrencies`
 * [model/service/SettingService.cfc:L222].
 *
 * Rates are decimal strings multiplied through `Money`, which closes the gap at
 * [model/service/PromotionService.cfc:L998] where the legacy `amountOff` branch multiplied as a
 * float.
 */
function makeFixtureCurrencyConverter(
  eligibleCurrencies: string,
  conversionRates: Readonly<Record<string, string>>,
): CurrencyConverter {
  // Snapshots taken inside the call, so a later mutation of the caller's own table cannot reach
  // into this graph.
  const rates: Readonly<Record<string, string>> = { ...conversionRates };
  const eligible: string = eligibleCurrencies;

  const parse = (currencyCodeList: string): CurrencyCode[] =>
    listToArray(currencyCodeList).map((entry: string): CurrencyCode => toCurrencyCode(entry));

  const rateFor = (currencyCode: string): string | undefined => {
    // CFML parity [model/entity/Sku.cfc:L385, L400]: the legacy compares codes with `eq`, and CFML
    // struct keys are case-insensitive too.
    for (const [key, value] of Object.entries(rates)) {
      if (cfEquals(key, currencyCode)) {
        return value;
      }
    }
    return undefined;
  };

  return {
    getAllActiveCurrencyIDList(): Promise<CurrencyCode[]> {
      return Promise.resolve(parse(eligible));
    },

    getCurrenciesByCurrencyCodeList(currencyCodeList: string): Promise<CurrencyCode[]> {
      return Promise.resolve(parse(currencyCodeList));
    },

    convertCurrency(
      amount: Money,
      originalCurrencyCode: CurrencyCode,
      convertToCurrencyCode: CurrencyCode,
    ): Promise<Money> {
      // A DOUBLE SIMPLIFICATION, LABELLED AS ONE. The legacy service has no
      // equal-code test at all [model/service/CurrencyService.cfc:L79-L101]: it
      // divides by the source rate and multiplies by the target rate even when
      // they are the same currency, so a same-code conversion is the input
      // rounded to cents rather than the input itself. That distinction is
      // unreachable from the cascade - Step 1 writes the base currency's price
      // unconditionally at [model/entity/Sku.cfc:L394], so Step 3's guard at
      // [L416] never lets the base currency reach a conversion - so the identity
      // is kept here for predictability. It is NOT claimed as parity;
      // `src/integrations/europeanCentralBankCurrencyConverter.ts` reproduces the
      // real branch structure and its suite pins it.
      if (cfEquals(originalCurrencyCode, convertToCurrencyCode)) {
        return Promise.resolve(amount);
      }

      const rate: string | undefined = rateFor(convertToCurrencyCode);

      if (rate === undefined) {
        // CFML parity [model/service/CurrencyService.cfc:L100-L101]: an
        // unreachable rate returns the amount UNCONVERTED. It does not raise.
        //
        // An earlier revision of this double rejected here, reasoning that
        // refusing was the honest answer and that a silent 1:1 would make a
        // converted price indistinguishable from an overridden one. The second
        // half of that is true and IS the legacy behaviour - the cascade still
        // writes `converted = true` at [model/entity/Sku.cfc:L427] for a
        // pass-through - so it is not a reason to diverge. The first half had it
        // backwards: the cascade awaits every conversion inside the body that
        // builds the price map, so one unlisted currency rejecting takes down
        // `getCurrencyDetails()` ENTIRELY, including the base-currency price
        // that never needed converting. Pricing at par and carrying on is both
        // the faithful answer and the safe one.
        return Promise.resolve(amount);
      }

      return Promise.resolve(amount.times(rate));
    },
  };
}

/**
 * A hand-written in-memory stand-in for the sku repository port.
 *
 * THIS DOUBLE READS `candidates` LIVE AND DOES NOT SNAPSHOT IT - the single deliberate exception to
 * the copy-the-containers rule, and what breaks the `Product` <-> `Sku` cycle: the product must
 * exist before any sku can be wired to it, yet its option-resolution repository must answer with
 * those very skus. The array is created inside `makeSkuFixture`, filled during the same call, and
 * never escapes to a caller.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L276, L282] is why the exception must be called
 * out: CFML copies arrays BY VALUE on assignment, so the legacy
 *   `var priceGroups = account.getPriceGroups();`
 * followed by `arrayAppend` left the account's collection untouched, where a TypeScript reference
 * would have MUTATED it.
 */
function makeFixtureSkuRepository(
  candidates: readonly Sku[],
  transactionExistsFlag: boolean,
  nextOptionGroupSortOrder: number,
): SkuRepository {
  return {
    getTransactionExistsFlag(productID?: string, skuID?: string): Promise<boolean> {
      void productID;
      void skuID;

      // CFML parity [model/dao/SkuDAO.cfc:L53]: the legacy counts `SwOrderItem` rows, so `false` is
      // the honest answer here and unblocks the `transactionExistsFlag eq false` delete guard in
      // `model/validation/Sku.json`.
      return Promise.resolve(transactionExistsFlag);
    },

    getSkuBySkuCode(skuCode: string): Promise<Sku | undefined> {
      // CFML parity [model/dao/SkuDAO.cfc:L102-L104]: the legacy also matches
      // `ascs.alternateSkuCode` through a LEFT JOIN on `alternateSkuCodes`. Those rows survive as
      // opaque identifiers only - `SwAlternateSkuCode` is not in this slice - so the alternate
      // branch has no data to match and only the primary code is answered.
      return Promise.resolve(
        candidates.find((candidate: Sku): boolean =>
          cfEquals(candidate.getSkuCode() ?? '', skuCode),
        ),
      );
    },

    getSkusBySelectedOptions(selectedOptions: string, productID?: string): Promise<Sku[]> {
      // MUST-PRESERVE AREA 3 [model/dao/SkuDAO.cfc:L107-L128], reproduced clause for clause:
      //
      //   select distinct sku from SlatwallSku as sku inner join sku.options as opt where 0 = 0 [
      //   and exists ( from SlatwallOption o join o.skus s
      //                  where s.id = sku.id and o.optionID = ? ) ]  -- once PER option
      //   [ and sku.product.id = ? ]                                 -- only if supplied
      //
      // `every` is the per-option conjunction and the emptiness test below is the `inner join`.
      // Binding order - every optionID first, `productID` LAST, because [L120] appends each option
      // before [L125] appends the product - is asserted at the integration tier instead.
      //
      // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L163]: a sibling method in the same DAO declares
      //   `var hql &= "WHERE sku.product.productID = :productID ";`
      // which combines `var` with a COMPOUND-ASSIGNMENT operator and is not a valid declaration.
      // Preserved deliberately; do not fix without a product decision.
      const selectedOptionIDs: readonly string[] = listToArray(selectedOptions);

      return Promise.resolve(
        candidates.filter((candidate: Sku): boolean => {
          if (candidate.getOptions().length === 0) {
            return false;
          }
          if (productID !== undefined && !skuBelongsToProduct(candidate, productID)) {
            return false;
          }
          return selectedOptionIDs.every((selectedOptionID: string): boolean =>
            skuCarriesOptionID(candidate, selectedOptionID),
          );
        }),
      );
    },

    searchSkusByProductType(term?: string, productTypeID?: string): Promise<Sku[]> {
      void term;
      void productTypeID;

      // CFML parity [model/dao/SkuDAO.cfc:L130-L148]: the legacy matches a search term against sku
      // and product columns and filters on a product-type path. An empty projection is a genuine
      // legacy answer for a term nothing matches.
      return Promise.resolve([]);
    },

    getProductSkus(product: Product, fetchOptions: boolean): Promise<Sku[]> {
      // CFML parity [model/dao/SkuDAO.cfc:L150-L170]: `fetchOptions` selects an eager option join.
      // Associations are materialized at the repository boundary here, so the options are present
      // either way and the flag changes nothing observable.
      void fetchOptions;

      // A NEW array, not the product's own, matching [model/service/SkuService.cfc:L221], which
      // returns the DAO's result rather than the field.
      return Promise.resolve([...product.getSkus()]);
    },

    getSortedProductSkusID(productID: string): Promise<string[]> {
      // CFML parity [model/dao/SkuDAO.cfc:L178-L198]: the ordering is `SUM(SwOption.sortOrder *
      // POWER(10, nextOptionGroupSortOrder - SwOptionGroup.sortOrder)) ASC` - base-10 POSITIONAL
      // WEIGHTING, so the first option group dominates. Only `productID` is parameterized
      // (`cf_sql_varchar`); `#getNextOptionGroupSortOrder()#` is interpolated directly, safely,
      // being numeric. The three INNER JOINs through `SwSkuOption`, `SwOption` and `SwOptionGroup`
      // DROP an option-less sku entirely - the precondition for the defect below.
      //
      // LEGACY-NOTE: these weights are ordering integers, not money, so they are not `Money`.
      //
      // TODO [model/dao/SkuDAO.cfc:L177]: the legacy carries a live
      //   `<!--- TODO: test to see if this query works with DB's other than MSSQL and MySQL --->`.
      // Carried over verbatim rather than silently resolved: the dialect branch at [L194-L198]
      // casts to `bigint` for SQL Server and does not for anything else, and only MySQL is
      // targeted.
      //
      // LEGACY-DEFECT [model/service/SkuService.cfc:L236-L237]: the caller does
      //   `var index = arrayFind(sortedArray, skuID);`
      // and then `sortedArrayReturn[index] = skus[i];` with NO guard, and `arrayFind` answers 0 for
      // any sku this query dropped - every option-less sku - so CFML raises on the index-0 write.
      // `getProductSkus` [model/service/SkuService.cfc:L220-L244] gates its sort branch at L223 but
      // checks `skus[1].getOptions()` ONLY, and `getSortedProductSkus`
      // [model/service/SkuService.cfc:L246-L262] has only `arrayLen(skus) lt 2`, making it MORE
      // exposed.
      //
      // Preserved deliberately; do not fix without a product decision.
      //
      // JUDGMENT CALL: this defect is newly catalogued - it is not among the plan's
      // published twenty, and it is deliberately left unnumbered in the port's
      // thirty-entry register, which is closed at thirty. Member 'D' of the canonical graph reaches it the
      // moment a caller asks for a sorted list, which is why the graph carries an
      // option-less member at all.
      const ordered: Sku[] = candidates
        .filter(
          (candidate: Sku): boolean =>
            candidate.getOptions().length > 0 && skuBelongsToProduct(candidate, productID),
        )
        .map((candidate: Sku): { readonly sku: Sku; readonly weight: number } => ({
          sku: candidate,
          weight: positionalOptionWeight(candidate, nextOptionGroupSortOrder),
        }))
        .sort(
          (
            left: { readonly sku: Sku; readonly weight: number },
            right: { readonly sku: Sku; readonly weight: number },
          ): number => left.weight - right.weight,
        )
        .map((entry: { readonly sku: Sku; readonly weight: number }): Sku => entry.sku);

      return Promise.resolve(ordered.map((candidate: Sku): string => candidate.getSkuID()));
    },

    saveSku(sku: Sku): Promise<Sku> {
      // No persistence: the instance is handed straight back, the `ormFlush()` of
      // [meta/tests/unit/Helper.cfc:L61] being deliberately dropped.
      return Promise.resolve(sku);
    },

    saveSkus(skus: readonly Sku[]): Promise<Sku[]> {
      // The collection form of the member above, and it drops the same thing: the
      // ORM flush that [model/service/ProductService.cfc:L216-L233] relied on to
      // write every repriced SKU as one unit. A fixture has no transaction to open,
      // so the instances are handed straight back - in the order they arrived,
      // because the port specifies positional correspondence and a caller pairing
      // input with output must be able to rely on it here too.
      //
      // ★ THIS DOUBLE CANNOT DEMONSTRATE ATOMICITY, and pretending otherwise would
      // be worse than saying so. There is nothing to roll back, so "all or none" is
      // vacuously true here. The atomicity itself is pinned where it is
      // implementable: against the recording executor in
      // `tests/integration/repositories/mysqlSkuRepository.test.ts`.
      return Promise.resolve([...skus]);
    },
  };
}

/**
 * Does one candidate sku carry the option named by `selectedOptionID`?
 *
 * CFML parity [model/dao/SkuDAO.cfc:L118]: `o.optionID = ?` bound through `cfqueryparam`, under a
 * MySQL collation that ignores case where TypeScript's `===` would not. Identifiers are opaque
 * hashes in practice, so this removes a silent divergence rather than changing an outcome.
 */
function skuCarriesOptionID(candidate: Sku, selectedOptionID: string): boolean {
  return candidate
    .getOptions()
    .some((held: Option): boolean => cfEquals(held.getOptionID(), selectedOptionID));
}

/**
 * Does one candidate sku belong to the product named by `productID`?
 *
 * CFML parity [model/dao/SkuDAO.cfc:L124]: `and sku.product.id = ?`, the clause appended LAST. A
 * detached sku is excluded, which is what the join would do with a NULL FK.
 */
function skuBelongsToProduct(candidate: Sku, productID: string): boolean {
  const owningProduct: Product | undefined = candidate.getProduct();
  return owningProduct !== undefined && cfEquals(owningProduct.getProductID(), productID);
}

/**
 * The base-10 positional sort weight of one sku's option set.
 *
 * CFML parity [model/dao/SkuDAO.cfc:L197]:
 *   `SUM(SwOption.sortOrder * POWER(10, nextOptionGroupSortOrder - SwOptionGroup.sortOrder))`.
 * An option whose group has no sort order contributes nothing, matching the INNER JOIN through
 * `SwOptionGroup`.
 */
function positionalOptionWeight(candidate: Sku, nextOptionGroupSortOrder: number): number {
  let weight = 0;

  for (const held of candidate.getOptions()) {
    const owningGroup: OptionGroup | undefined = held.getOptionGroup();
    const optionSortOrder: number | undefined = held.getSortOrder();

    if (owningGroup === undefined || optionSortOrder === undefined) {
      continue;
    }

    weight += optionSortOrder * Math.pow(10, nextOptionGroupSortOrder - owningGroup.getSortOrder());
  }

  return weight;
}

// ---------------------------------------------------------------------------
// LEGACY-DEFECT [model/entity/Sku.cfc:L258]: getPriceByPromotion() delegates to
// getService("promotionService").calculateSkuPriceBasedOnPromotion(...), and that method EXISTS
// NOWHERE IN THE SOURCE - a repository-wide search finds it at that one call site and nothing else.
// It therefore throws at runtime today, and the target reproduces it as a throwing stub.
//
// Preserved deliberately; do not fix without a product decision.
//
// THE CONSEQUENCE IS THAT THERE IS NO PROMOTION-SERVICE DOUBLE AND THERE MUST NOT BE ONE: a double
// answering a plausible number would be inventing an implementation for a method that does not
// exist. Its two neighbours are CORRECT and are wired normally - [model/entity/Sku.cfc:L261-L263]
// `getPriceByPriceGroup` and [L265-L267] `getAppliedPriceGroupRateByPriceGroup`.
// ---------------------------------------------------------------------------

/**
 * A hand-written in-memory stand-in for the sku-facing slice of the price-group service. Three
 * methods, matching the port exactly.
 *
 * `getRateForSkuBasedOnPriceGroup` reproduces the SKU-LEVEL rung only
 * [model/service/PriceGroupService.cfc:L146-L150]: it loops the price group's rates and keeps the
 * LAST one whose `hasSku` answers true, that loop having no `break`. The remaining four rungs are
 * the SERVICE's responsibility [model/service/PriceGroupService.cfc:L152-L180], including the
 * asymmetry at [L174] where the parent recursion calls the PRODUCT variant.
 *
 * `calculateSkuPriceBasedOnPriceGroup` answers the supplied price or `sku.getPrice()`, the legacy's
 * pass-through when no rate applies [model/service/PriceGroupService.cfc:L301-L314]. The
 * amount-type arithmetic lives at [model/service/PriceGroupService.cfc:L316-L340], where only
 * `percentageOff` rounds.
 */
function makeFixturePriceGroupResolver(
  priceGroupPrice: Money | undefined,
  currentAccountPrice: Money | undefined,
): SkuPriceGroupResolver {
  return {
    calculateSkuPriceBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): Money {
      void priceGroup;
      return priceGroupPrice ?? sku.getPrice();
    },

    getRateForSkuBasedOnPriceGroup(sku: Sku, priceGroup: PriceGroup): PriceGroupRate | undefined {
      let found: PriceGroupRate | undefined = undefined;
      for (const rate of priceGroup.getPriceGroupRates()) {
        if (rate.hasSku(sku)) {
          // No `break`, on purpose: [model/service/PriceGroupService.cfc:L146-L150] keeps looping,
          // so a later matching rate supersedes an earlier one.
          found = rate;
        }
      }
      return found;
    },

    calculateSkuPriceBasedOnCurrentAccount(
      sku: Sku,
      context: CurrentAccountContextRef,
    ): Promise<Money> {
      void context;

      // CFML parity [model/service/PriceGroupService.cfc:L271-L298]: the legacy seeds its candidate
      // array with `sku.getPrice()` and returns the LOWEST, so defaulting to the base price is the
      // legacy answer for an account with no price groups.
      //
      // LEGACY-NOTE [model/entity/Sku.cfc:L487-L495]: `getLivePrice` appends `getSalePrice()` then
      // `getCurrentAccountPrice()`, sorts `"numeric" "asc"` and takes `prices[1]` - the minimum. In
      // the legacy that sort is fragile: `Product.getCurrentAccountPrice()`
      // [model/entity/Product.cfc:L588-L592] has no `else` and no trailing return, so it can hand
      // back NULL, and appending a null to an array sorted `"numeric"` breaks the sort. The hazard
      // is STRUCTURALLY ELIMINATED: this port method returns `Money` and cannot return nothing.
      return Promise.resolve(currentAccountPrice ?? sku.getPrice());
    },
  };
}

/**
 * The `SwSkuCurrency` rows for one variant, freshly built.
 *
 * JUDGMENT CALL: THE `price` KEY IS PASSED AS `undefined`, NOT OMITTED. The "omit rather than set
 * to `undefined`" discipline applies to the CASCADE'S OUTPUT - `CurrencyDetail`, whose prices,
 * their three `*Formatted` companions and `converted` are all OPTIONAL, so under
 * `exactOptionalPropertyTypes` installing `undefined` there would make `structKeyExists` answer
 * TRUE for a sub-key legacy CFML never wrote and would SUPPRESS Step 3. It does NOT apply to
 * `SkuCurrency`'s constructor, whose eleven keys are REQUIRED with value-nullable types, so a
 * `price: undefined` there is the declared contract and is what makes the cascade omit the sub-key
 * downstream, the guard at [model/entity/Sku.cfc:L401, L405] being `!isNull(...)`.
 *
 * CFML parity [model/entity/SkuCurrency.cfc:L68]: `currencyCode` is declared
 *   `insert="false" update="false"`,
 * a READ-ONLY PROJECTION of the FK, so the entity exposes no setter.
 *
 * LEGACY-NOTE [model/entity/SkuCurrency.cfc:L89-L94]: `setSku` appends `this` when
 *   `isNew() or !arguments.sku.hasSkuCurrency( this )`,
 * so calling it twice on a new instance creates two rows. Every row here is handed to the sku
 * through hydration instead.
 */
function makeFixtureSkuCurrencies(
  idPrefix: string,
  variant: SkuCurrencyVariant,
  baseCurrencyCode: string,
  secondaryCurrencyCode: string,
): SkuCurrency[] {
  const audit: AuditTrail = makeAuditTrail(idPrefix);

  const row = (
    suffix: string,
    currencyCode: string,
    price: Money | undefined,
    listPrice: Money | undefined,
    renewalPrice: Money | undefined,
  ): SkuCurrency =>
    new SkuCurrency({
      skuCurrencyID: `${idPrefix}-skucurrency-${suffix}`,
      price,
      renewalPrice,
      listPrice,
      currencyCode: toCurrencyCode(currencyCode),
      sku: undefined,
      remoteID: undefined,
      createdDateTime: audit.createdDateTime,
      createdByAccountID: audit.createdByAccountID,
      modifiedDateTime: audit.modifiedDateTime,
      modifiedByAccountID: audit.modifiedByAccountID,
    });

  switch (variant) {
    case 'none':
      // No rows. The base currency resolves through Step 1 [model/entity/Sku.cfc:L385-L397]; every
      // other eligible currency reaches Step 3 [L416-L428] and is converted, and `skuCurrencyID`
      // stays the empty string [L382] seeded for every eligible currency before any step runs.
      return [];

    case 'secondaryOverride':
      // The documented default: one row for the non-base currency carrying all three prices, so
      // Step 2 [L399-L414] wins and Step 3 is skipped, the `price` key now existing.
      return [
        row(
          'secondary',
          secondaryCurrencyCode,
          Money.fromDecimalString(SECONDARY_OVERRIDE_PRICE),
          Money.fromDecimalString(SECONDARY_OVERRIDE_LIST_PRICE),
          Money.fromDecimalString(SECONDARY_OVERRIDE_RENEWAL_PRICE),
        ),
      ];

    case 'secondaryPriceOnly':
      // THE HIGHEST-VALUE SHAPE IN THIS FILE.
      //
      // LEGACY-DEFECT [model/entity/Sku.cfc:L416]: Step 3 is gated on
      // `if(!structKeyExists(variables.currencyDetails[ ... ], "price"))` - the PRICE key ALONE. So
      // a Step 2 row that wrote `price` but left `listPrice` unwritten makes Step 3 skip ENTIRELY
      // and `listPrice` is NEVER converted: the currency IS fully present in the map, answering a
      // real price, while its list and renewal prices answer NOTHING.
      //
      // Preserved deliberately; do not fix without a product decision.
      //
      // The DATA is contract-honest - see the validation contract in the header. The defect is in
      // the GATE.
      return [
        row(
          'secondary',
          secondaryCurrencyCode,
          Money.fromDecimalString(SECONDARY_OVERRIDE_PRICE),
          undefined,
          undefined,
        ),
      ];

    case 'secondaryDuplicated':
      // LEGACY-DEFECT [model/entity/Sku.cfc:L399-L414]: Step 2 loops EVERY `skuCurrencies` entry
      // and its `if` body has NO `break`, so when two rows carry the same currency code the LAST
      // one wins for the prices and for the `skuCurrencyID` recorded at [L412]. Array order is
      // load-bearing, and the outcome depends on a collection order the ORM never guaranteed.
      // Preserved deliberately; do not fix without a product decision.
      return [
        row(
          'secondary-first',
          secondaryCurrencyCode,
          Money.fromDecimalString(SECONDARY_SUPERSEDED_PRICE),
          Money.fromDecimalString(SECONDARY_SUPERSEDED_PRICE),
          Money.fromDecimalString(SECONDARY_SUPERSEDED_PRICE),
        ),
        row(
          'secondary-second',
          secondaryCurrencyCode,
          Money.fromDecimalString(SECONDARY_OVERRIDE_PRICE),
          Money.fromDecimalString(SECONDARY_OVERRIDE_LIST_PRICE),
          Money.fromDecimalString(SECONDARY_OVERRIDE_RENEWAL_PRICE),
        ),
      ];

    case 'secondaryPriceAbsent':
      // INVALID BY VALIDATION, ON PURPOSE AND LABELLED SO - `model/validation/SkuCurrency.json`
      // requires `price` on save, so this row could never have been persisted. It reaches one mixed
      // outcome no other shape can: Step 2's guarded `listPrice` assignment [L405] lands and its
      // unguarded `price` assignment [L409] does not, so Step 3's gate [L416] finds no `price` key
      // and FIRES - overwriting all three sub-keys and flipping `converted` to `true` - while the
      // `skuCurrencyID` stamped at [L412] SURVIVES.
      return [
        row(
          'secondary',
          secondaryCurrencyCode,
          undefined,
          Money.fromDecimalString(SECONDARY_OVERRIDE_LIST_PRICE),
          undefined,
        ),
      ];

    case 'baseOverride':
      // One row for the BASE currency, so Step 1 writes the sku's own columns and Step 2 then
      // OVERWRITES them and stamps a `skuCurrencyID` [L412].
      return [
        row(
          'base',
          baseCurrencyCode,
          Money.fromDecimalString(BASE_OVERRIDE_PRICE),
          Money.fromDecimalString(SKU_LIST_PRICE),
          Money.fromDecimalString(SKU_RENEWAL_PRICE),
        ),
      ];
  }
}

/** The identifier the requested graph member is minted. */
function memberSkuID(idPrefix: string, member: AndOfExistsMember | undefined): string {
  return member === undefined ? `${idPrefix}-sku` : `${idPrefix}-sku-${member.toLowerCase()}`;
}

/**
 * The sku code the requested graph member is minted. `SwSku.skuCode` is `unique="true"`
 * [model/entity/Sku.cfc:L54] and required-and-unique in `model/validation/Sku.json`, so suffixing
 * with the member letter guarantees every member of a multi-sku graph differs.
 */
function memberSkuCode(member: AndOfExistsMember | undefined): string {
  return member === undefined ? LEGACY_SKU_CODE : `${LEGACY_SKU_CODE}-${member}`;
}

/**
 * The distinct option groups reachable from a caller-supplied option set, in first-appearance
 * order, so the product still reports the groups its skus reference. De-duplication is by group
 * IDENTIFIER, case-insensitively, matching CFML struct-key semantics [model/entity/Sku.cfc:L516].
 */
function distinctOptionGroups(options: readonly Option[]): OptionGroup[] {
  const groups: OptionGroup[] = [];

  for (const held of options) {
    const owningGroup: OptionGroup | undefined = held.getOptionGroup();
    if (owningGroup === undefined) {
      continue;
    }
    const alreadyHeld: boolean = groups.some((candidate: OptionGroup): boolean =>
      cfEquals(candidate.getOptionGroupID(), owningGroup.getOptionGroupID()),
    );
    if (!alreadyHeld) {
      groups.push(owningGroup);
    }
  }

  return groups;
}

/**
 * The first eligible currency that is NOT the base currency. The `SwSkuCurrency` variants target
 * whichever that is, so changing `overrides.skuEligibleCurrencies` yields override rows for the
 * right currency rather than a stale hardcoded one. Case-insensitive [model/entity/Sku.cfc:L385],
 * which is also what makes a `'usd,EUR'` list against a `'USD'` base resolve Step 1 correctly.
 */
function firstNonBaseCurrency(
  eligibleCurrencies: string,
  baseCurrencyCode: string,
): string | undefined {
  return listToArray(eligibleCurrencies).find(
    (entry: string): boolean => !cfEquals(entry, baseCurrencyCode),
  );
}

// ---------------------------------------------------------------------------
// The single export
// ---------------------------------------------------------------------------

/**
 * One fully-formed `SwSku`, with the option links, currency-override rows and
 * collaborator doubles its two must-preserve behaviours require.
 *
 * ★ HOW TO REACH THE CURRENCY CASCADE. This fixture returns an UNHYDRATED sku:
 * the cascade is private and `getCurrencyDetails()` is a synchronous memo read
 * that answers `{}` until hydration has run. `Sku.hydrate` is the boundary, and
 * it is idempotent, so a suite does exactly this ONCE and every accessor is
 * synchronous thereafter:
 *
 *   const sku = makeSkuFixture();
 *   await Sku.hydrate(sku);
 *   sku.getPriceByCurrencyCode('USD');       // Step 1, converted === false
 *   sku.getPriceByCurrencyCode('EUR');       // Step 2, converted === false
 *
 * HOW TO REACH THE CURRENCY CASCADE. The map is not injectable, so a suite materializes it ONCE
 * with `await sku.materializeCurrencyDetails()` and every accessor is synchronous thereafter. All
 * four paths are reachable on their own: `{ skuEligibleCurrencies: '' }` closes the gate;
 *   `{ skuEligibleCurrencies: 'USD', skuCurrencyVariant: 'none' }`
 * stops at Step 1; the default variant, `'baseOverride'` and `'secondaryDuplicated'` let Step 2
 * win, the last proving LAST MATCH WINS; and `{ skuCurrencyVariant: 'none' }` with two eligible
 * currencies lets Step 3 win. The one that matters most is the stranded sub-key:
 *
 *   const sku = makeSkuFixture({ skuCurrencyVariant: 'secondaryPriceOnly' });
 *   await Sku.hydrate(sku);
 *   sku.getPriceByCurrencyCode('EUR');        // a real Money
 *   sku.getListPriceByCurrencyCode('EUR');    // undefined - NEVER zero
 *
 * HOW TO REACH THE AND-of-EXISTS BEHAVIOUR. Ask for a member with `andOfExistsMember` and the whole
 * four-sku graph is built and wired to one product, so
 * `skuA.getProduct()?.getSkusBySelectedOptions(skuA.getOptionsIDList())` answers A and C. That is
 * also the `hasUniqueOptions` graph, the validator itself calling
 * `getProduct().getSkusBySelectedOptions(...)` at [model/entity/Sku.cfc:L763], so there is ONE
 * option graph here.
 *
 * @param overrides Every variation this module offers, as documented fields.
 * @returns The requested sku, wired into its product and into the candidate set.
 */
export function makeSkuFixture(overrides?: SkuFixtureOverrides): Sku {
  // `??` where the default is simply a value; `resolveOverride` where an explicit `undefined` must
  // survive as absence.

  const idPrefix: string = overrides?.idPrefix ?? DEFAULT_ID_PREFIX;
  const member: AndOfExistsMember | undefined = overrides?.andOfExistsMember;

  const skuID: string = overrides?.skuID ?? memberSkuID(idPrefix, member);
  const skuCode: string | undefined = resolveOverride(overrides, 'skuCode', memberSkuCode(member));

  // CFML parity [model/entity/Sku.cfc:L53] versus [model/entity/Product.cfc:L53]: a sku built here
  // is ACTIVE and a product built by the sibling fixture is not. `resolveOverride` is used so an
  // explicit `false` survives instead of being eaten by truthiness.
  const activeFlag: CfBooleanInput = resolveOverride(overrides, 'activeFlag', DEFAULT_ACTIVE_FLAG);
  const userDefinedPriceFlag: CfBooleanInput = resolveOverride(
    overrides,
    'userDefinedPriceFlag',
    DEFAULT_USER_DEFINED_PRICE_FLAG,
  );

  const imageFile: string | undefined = overrides?.imageFile;
  const imageSettingValues: SkuImageSettingValues | undefined = overrides?.imageSettingValues;
  const remoteID: string | undefined = resolveOverride(overrides, 'remoteID', REMOTE_ID);
  const calculatedQATS: number | undefined = resolveOverride(
    overrides,
    'calculatedQATS',
    CALCULATED_QATS,
  );
  const subscriptionTermID: string | undefined = overrides?.subscriptionTermID;
  const isNew: boolean | undefined = resolveOverride(overrides, 'isNew', false);

  // `price` defaults to the reference-calculation unit price, keeping the 19.99 x 3 chain
  // reachable.
  const price: Money | undefined = resolveOverride(
    overrides,
    'price',
    Money.fromDecimalString(SKU_PRICE),
  );
  const listPrice: Money | undefined = resolveOverride(
    overrides,
    'listPrice',
    Money.fromDecimalString(SKU_LIST_PRICE),
  );
  const renewalPrice: Money | undefined = resolveOverride(
    overrides,
    'renewalPrice',
    Money.fromDecimalString(SKU_RENEWAL_PRICE),
  );

  // --- Currency configuration -----------------------------------------------

  const skuCurrency: string = overrides?.skuCurrency ?? BASE_CURRENCY_CODE;
  const skuEligibleCurrencies: string = overrides?.skuEligibleCurrencies ?? ELIGIBLE_CURRENCIES;
  const secondaryCurrencyCode: string =
    firstNonBaseCurrency(skuEligibleCurrencies, skuCurrency) ?? SECONDARY_CURRENCY_CODE;

  // A fresh table per call, never a shared module-scope object.
  const conversionRates: Readonly<Record<string, string>> = overrides?.conversionRates ?? {
    [secondaryCurrencyCode]: SECONDARY_CONVERSION_RATE,
  };

  const skuCurrencyVariant: SkuCurrencyVariant =
    overrides?.skuCurrencyVariant ?? 'secondaryOverride';

  // --- The option graph -----------------------------------------------------
  //
  // Caller-supplied options become the pool and the groups are derived from them, so the product
  // still reports the groups its skus reference. Otherwise the canonical three-group,
  // one-option-per-group graph is generated - VALID under `hasOneOptionPerOptionGroup`.

  const optionGroupOrder: OptionGroupOrder = overrides?.optionGroupOrder ?? 'sortOrder';
  const duplicateOptionGroupOption: boolean = overrides?.duplicateOptionGroupOption ?? false;
  const optionSortTieBreaker: OptionSortTieBreaker | undefined = resolveOverride(
    overrides,
    'optionSortTieBreaker',
    makeDeterministicOptionSortTieBreaker(),
  );

  const callerOptions: readonly Option[] | undefined = overrides?.options;
  const callerSuppliedOptions: boolean = hasOverride(overrides, 'options');

  const optionGroups: OptionGroup[] = callerSuppliedOptions
    ? distinctOptionGroups(callerOptions ?? [])
    : makeFixtureOptionGroups(idPrefix, optionGroupOrder, optionSortTieBreaker);

  const optionPool: readonly Option[] = callerSuppliedOptions
    ? [...(callerOptions ?? [])]
    : makeFixtureOptionPool(idPrefix, optionGroups, duplicateOptionGroupOption);

  // JUDGMENT CALL: `Option` INSTANCES are shared across the skus of one graph, deliberately,
  // because the `exists` subquery means "the same `SwOption` ROW" - see Area 3 in the header. The
  // ARRAYS holding them are NOT shared, which is why `selectPoolOptions` returns a fresh array
  // every time.
  const targetOptions: Option[] = callerSuppliedOptions
    ? [...(callerOptions ?? [])]
    : member === undefined
      ? [...optionPool]
      : selectPoolOptions(optionPool, optionIndexesForMember(member));

  // --- Collaborator doubles -------------------------------------------------
  //
  // `SkuHydrationInput` declares EXACTLY FOUR collaborator ports and all four are supplied. There
  // is no promotion-service double, for the reason recorded above `makeFixturePriceGroupResolver`,
  // and no image store or subscription-term provider, because `Sku` declares neither: those
  // out-of-scope branches live on the SERVICES [model/service/SkuService.cfc:L139-L202, L210-L218].

  const settingsProvider: SettingsProvider | undefined = hasOverride(overrides, 'settingsProvider')
    ? overrides?.settingsProvider
    : makeFixtureSettingsProvider(skuCurrency, skuEligibleCurrencies);

  const currencyConverter: CurrencyConverter | undefined = hasOverride(
    overrides,
    'currencyConverter',
  )
    ? overrides?.currencyConverter
    : makeFixtureCurrencyConverter(skuEligibleCurrencies, conversionRates);

  const priceGroupResolver: SkuPriceGroupResolver | undefined = hasOverride(
    overrides,
    'priceGroupResolver',
  )
    ? overrides?.priceGroupResolver
    : makeFixturePriceGroupResolver(overrides?.priceGroupPrice, overrides?.currentAccountPrice);

  // THE ONE LIVE ARRAY IN THIS FILE. The product must exist before any sku can be wired to it, yet
  // the product's option-resolution repository must answer with those very skus. This array is
  // created here, handed to the repository double UNCOPIED, filled during this same call and
  // complete before the factory returns. Caller-supplied extra candidates are copied in.
  const candidates: Sku[] = [...(overrides?.selectedOptionsCandidateSkus ?? [])];

  const transactionExistsFlag: boolean = overrides?.transactionExistsFlag ?? false;

  const skuRepository: SkuRepository | undefined = hasOverride(overrides, 'skuRepository')
    ? overrides?.skuRepository
    : makeFixtureSkuRepository(candidates, transactionExistsFlag, NEXT_OPTION_GROUP_SORT_ORDER);

  // --- The owning product ---------------------------------------------------
  //
  // Built with NO skus and appended to from the owning side, which is how the cycle is broken.
  // `selectedOptionsCandidateSkus` is deliberately NOT passed through: the sibling fixture would
  // snapshot it to build ITS default repository double and capture an empty list, so this call
  // supplies its own live-reading double instead.
  //
  // LEGACY-DEFECT [model/entity/Sku.cfc:L442-L447]: getDefaultFlag() is
  // `getProduct().getDefaultSku().getSkuID() == getSkuID()` with NO guard on either dereference, so
  // a sku whose product has no default sku raises - and `model/validation/Sku.json` requires
  // `defaultFlag eq false` on DELETE, so deleting such a sku raises during validation. The MIRROR
  // IMAGE of [model/entity/Product.cfc:L589, L595], which DO guard.
  //
  // Preserved deliberately; do not fix without a product decision.
  //
  // The sibling fixture leaves `defaultSku` ABSENT by default, so that raise is reachable the
  // moment the two fixtures are combined - which is why none is wired here either.
  const product: Product | undefined = hasOverride(overrides, 'product')
    ? overrides?.product
    : makeProductFixture({
        idPrefix,
        productID: `${idPrefix}-product`,
        skus: [],
        optionGroups,
        nextOptionGroupSortOrder: NEXT_OPTION_GROUP_SORT_ORDER,
        ...(skuRepository === undefined ? {} : { skuRepository }),
      });

  // --- Collections ----------------------------------------------------------
  //
  // Fresh arrays, including when the caller supplied one, per the copy-the-containers rule in the
  // header: one shared instance would let an `addOption` in one suite surface in another.

  const skuCurrencies: SkuCurrency[] = hasOverride(overrides, 'skuCurrencies')
    ? [...(overrides?.skuCurrencies ?? [])]
    : makeFixtureSkuCurrencies(idPrefix, skuCurrencyVariant, skuCurrency, secondaryCurrencyCode);

  const priceGroupRates: PriceGroupRate[] = [...(overrides?.priceGroupRates ?? [])];
  const promotionRewards: PromotionRewardRef[] = [...(overrides?.promotionRewards ?? [])];
  const promotionRewardExclusions: PromotionRewardRef[] = [
    ...(overrides?.promotionRewardExclusions ?? []),
  ];
  const promotionQualifiers: PromotionQualifierRef[] = [...(overrides?.promotionQualifiers ?? [])];
  const promotionQualifierExclusions: PromotionQualifierRef[] = [
    ...(overrides?.promotionQualifierExclusions ?? []),
  ];

  // The inert opaque identifier sets standing in for out-of-scope associations. `orderItems`
  // [model/entity/Sku.cfc:L71] is `lazy="extra"` and points at the out-of-scope Order aggregate, so
  // it is never populated - the promotion engine reaches order state through read-only order views.
  const alternateSkuCodeIDs: readonly string[] = [...(overrides?.alternateSkuCodeIDs ?? [])];
  const stockIDs: readonly string[] = [...(overrides?.stockIDs ?? [])];
  const accessContentIDs: readonly string[] = [...(overrides?.accessContentIDs ?? [])];
  const subscriptionBenefitIDs: readonly string[] = [...(overrides?.subscriptionBenefitIDs ?? [])];
  const renewalSubscriptionBenefitIDs: readonly string[] = [
    ...(overrides?.renewalSubscriptionBenefitIDs ?? []),
  ];
  const physicalIDs: readonly string[] = [...(overrides?.physicalIDs ?? [])];

  // JUDGMENT CALL: `Sku.getSalePrice()` [model/entity/Sku.cfc:L546-L551] returns
  // `getSalePriceDetails()["salePrice"]` when the key exists and otherwise falls back to
  // `getPrice()`, NOT to zero. `Product.getSalePrice()` [model/entity/Product.cfc:L594-L601] is the
  // defective one: its L598 `getSkus()[1].getSalePrice();` OMITS the `return`, so execution falls
  // through to `return 0`. SKU IS CORRECT WHERE PRODUCT IS DEFECTIVE, and that defect is not
  // propagated here; the projection is ABSENT by default so the correct fall-back is observable.
  //
  // LEGACY-NOTE [model/entity/Sku.cfc:L539-L544, L557, L564]: the legacy memo is filled through
  // `getProduct().getSkuSalePriceDetails( getSkuID() )`, answering `{}` on a miss
  // [model/entity/Product.cfc:L182-L187]; the port hands the projection to the sku directly, so the
  // two cannot disagree. The sibling accessors return the empty STRING on a miss - [L557] and
  // [L564], the second despite being declared non-persistent `type="date"` at [L118]. `Sku` spells
  // the expiration accessor CORRECTLY, where [model/entity/Product.cfc:L618] carries the typo
  // `getSalePricExpirationDateTime`.
  const salePriceDetail: SalePriceDetailRef | undefined = overrides?.salePriceDetail;

  const currentAccountContext: CurrentAccountContextRef | undefined = resolveOverride(
    overrides,
    'currentAccountContext',
    { accountID: `${idPrefix}-account` },
  );

  const audit: AuditTrail = makeAuditTrail(idPrefix);

  // --- Hydration ------------------------------------------------------------
  //
  // Every OPTIONAL member is written through a conditional spread, because
  // `exactOptionalPropertyTypes` makes `price?: Money` and `price?: Money | undefined` different
  // contracts and the hydration surface declares the former.
  //
  // THE FORMATTED SUB-KEYS. `getCurrencyDetails()` writes a `*Formatted` companion beside every
  // price it records - `priceFormatted` [model/entity/Sku.cfc:L395, L410, L426],
  // `listPriceFormatted` [L392, L407, L423] and `renewalPriceFormatted` [L388, L403, L419] -
  // through TWO PATHS: Steps 1 and 2 use the entity-scoped `getFormattedValue(...)` while Step 3
  // uses `formatValue(..., "currency", {currencyCode=...})`. They are produced during
  // materialization and are not fixture inputs.

  const hydrationInput: SkuHydrationInput = {
    skuID,

    // Always present, always owned by this graph.
    options: targetOptions,
    skuCurrencies,
    priceGroupRates,
    promotionRewards,
    promotionRewardExclusions,
    promotionQualifiers,
    promotionQualifierExclusions,
    alternateSkuCodeIDs,
    stockIDs,
    accessContentIDs,
    subscriptionBenefitIDs,
    renewalSubscriptionBenefitIDs,
    physicalIDs,

    // The audit columns [model/entity/Sku.cfc:L93-L96]; the two account keys are inert.
    createdDateTime: audit.createdDateTime,
    createdByAccountID: audit.createdByAccountID,
    modifiedDateTime: audit.modifiedDateTime,
    modifiedByAccountID: audit.modifiedByAccountID,

    // The two booleans [L53, L59].
    ...(activeFlag === undefined ? {} : { activeFlag }),
    ...(userDefinedPriceFlag === undefined ? {} : { userDefinedPriceFlag }),

    // The scalar columns [L54, L58, L62, L90].
    ...(skuCode === undefined ? {} : { skuCode }),
    ...(imageFile === undefined ? {} : { imageFile }),
    ...(imageSettingValues === undefined ? {} : { imageSettingValues }),
    ...(calculatedQATS === undefined ? {} : { calculatedQATS }),
    ...(remoteID === undefined ? {} : { remoteID }),

    // The three money columns [L55-L57], all `default="0"`.
    ...(price === undefined ? {} : { price }),
    ...(listPrice === undefined ? {} : { listPrice }),
    ...(renewalPrice === undefined ? {} : { renewalPrice }),

    // The out-of-scope subscription FK [L66].
    ...(subscriptionTermID === undefined ? {} : { subscriptionTermID }),

    // The non-persistent slots.
    ...(salePriceDetail === undefined ? {} : { salePriceDetail }),
    ...(currentAccountContext === undefined ? {} : { currentAccountContext }),
    ...(isNew === undefined ? {} : { isNew }),

    // The four wired ports, and only those four.
    ...(settingsProvider === undefined ? {} : { settingsProvider }),
    ...(currencyConverter === undefined ? {} : { currencyConverter }),
    ...(priceGroupResolver === undefined ? {} : { priceGroupResolver }),
    ...(skuRepository === undefined ? {} : { skuRepository }),
  };

  const target: Sku = new Sku(hydrationInput);

  // --- Graph assembly and bidirectional wiring ------------------------------
  //
  // `Sku.setProduct` is called EXACTLY ONCE per sku, per the at-most-once rule in the header,
  // because its `isNew() or !hasSku(this)` probe would append a duplicate row on a second call.
  // `Product.addSku` [model/entity/Product.cfc:L696-L698] only delegates to it and is not used.

  const wire = (sku: Sku): void => {
    if (product !== undefined) {
      sku.setProduct(product);
    }
    candidates.push(sku);
  };

  if (member === undefined) {
    wire(target);
    return target;
  }

  // The canonical four-sku graph. The requested member is the fully-configured `target`; the other
  // three are built LEAN - no currency rows, no sale-price projection, the ORM `default="0"` for
  // the two optional money columns - because their only job is option membership.
  for (const graphMember of andOfExistsMembers()) {
    if (graphMember === member) {
      wire(target);
      continue;
    }

    const siblingAudit: AuditTrail = makeAuditTrail(idPrefix);

    wire(
      new Sku({
        skuID: memberSkuID(idPrefix, graphMember),
        skuCode: memberSkuCode(graphMember),
        activeFlag: DEFAULT_ACTIVE_FLAG,
        userDefinedPriceFlag: DEFAULT_USER_DEFINED_PRICE_FLAG,
        price: Money.fromDecimalString(SKU_PRICE),
        listPrice: Money.fromDecimalString(ZERO_DECIMAL),
        renewalPrice: Money.fromDecimalString(ZERO_DECIMAL),
        options: selectPoolOptions(optionPool, optionIndexesForMember(graphMember)),
        skuCurrencies: [],
        priceGroupRates: [],
        promotionRewards: [],
        promotionRewardExclusions: [],
        promotionQualifiers: [],
        promotionQualifierExclusions: [],
        alternateSkuCodeIDs: [],
        stockIDs: [],
        accessContentIDs: [],
        subscriptionBenefitIDs: [],
        renewalSubscriptionBenefitIDs: [],
        physicalIDs: [],
        createdDateTime: siblingAudit.createdDateTime,
        createdByAccountID: siblingAudit.createdByAccountID,
        modifiedDateTime: siblingAudit.modifiedDateTime,
        modifiedByAccountID: siblingAudit.modifiedByAccountID,
        ...(currentAccountContext === undefined ? {} : { currentAccountContext }),
        ...(settingsProvider === undefined ? {} : { settingsProvider }),
        ...(currencyConverter === undefined ? {} : { currencyConverter }),
        ...(priceGroupResolver === undefined ? {} : { priceGroupResolver }),
        ...(skuRepository === undefined ? {} : { skuRepository }),
      }),
    );
  }

  return target;
}
