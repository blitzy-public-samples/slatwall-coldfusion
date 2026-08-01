// ---------------------------------------------------------------------------
// slatwall-ts - SKU / SKU-CURRENCY / OPTION / OPTION-GROUP TEST DATA
//
// WHAT THIS FILE IS
// A single deterministic factory returning one fully-formed `SwSku` - the sku
// itself, the `SwSkuOption` link rows that make option-based resolution
// decidable, the `SwSkuCurrency` override rows that drive the currency
// cascade, and the collaborator doubles those two behaviours require. It is
// consumed by explicit per-suite named imports from the sku, sku-currency,
// option and option-group entity suites and from the sku-service and
// price-group-service suites; nothing here asserts anything, and nothing here
// is registered as a global.
//
// IT IS MODULE #3 OF FIVE IN AN ACYCLIC FIXTURE ORDER
//   priceGroupFixtures -> productFixtures -> skuFixtures -> promotionFixtures
//   -> orderViewFixtures
// Only modules #1 and #2 may be imported from here. `promotionFixtures` and
// `orderViewFixtures` come LATER and importing either would close a cycle, so
// neither appears. `tests/setup.ts` is never imported by a fixture at all.
//
// ★ THIS MODULE CARRIES TWO OF THE THREE "PRESERVE EXACTLY" AREAS
//   Area 2 - the currency resolution cascade
//            [model/entity/Sku.cfc:L367-L433].
//   Area 3 - the AND-of-EXISTS option matching behind
//            `getProductSkusBySelectedOptions` [model/dao/SkuDAO.cfc:L107-L128].
// Every variant below exists so one of those two can be pinned by a suite. It
// is the highest-stakes fixture module in this folder, and it is written to be
// checked line by line against the cited legacy locators.
//
// ★ THE SINGLE MOST IMPORTANT STRUCTURAL RULE IN THIS FILE
// THE CURRENCY DETAIL MAP CANNOT BE INJECTED, AND THIS FILE DOES NOT TRY.
// `SkuHydrationInput` publishes no `currencyDetails` member. The cascade lives
// in `Sku.materializeCurrencyDetails()`, and `Sku.getCurrencyDetails()` is
// SYNCHRONOUS - it hands back the memo, or `{}` when nothing has been
// materialized yet. So the fixture's whole job is to CONFIGURE the three
// inputs the cascade reads - the settings port, the currency-converter port
// and the sku's own `skuCurrencies` array - so that ONE caller-side
// `await sku.materializeCurrencyDetails()` produces exactly the intended map.
// THE FIXTURE NEVER RUNS THE CASCADE AND NEVER RE-IMPLEMENTS IT. That is what
// "materialized upstream" means here, and it is what keeps every currency
// accessor synchronous, exactly as the legacy contract is.
//
// ★ WHERE AN `undefined` PRICE IS ACTUALLY REACHABLE, WHICH IS NOT WHERE IT LOOKS
// Cascade Step 1 [model/entity/Sku.cfc:L385-L397] writes `renewalPrice`,
// `listPrice` AND `price` for the BASE currency, and in the target it writes
// all three UNCONDITIONALLY - the sku's own money columns are non-optional
// `Money` because `default="0"` [model/entity/Sku.cfc:L55-L57] makes the
// legacy `isNull` guards statically satisfied. The base currency therefore
// ALWAYS carries all three sub-keys, so no `undefined` is reachable there.
// The stranded-sub-key path is reachable ONLY on a NON-BASE currency through
// Step 2: a `SwSkuCurrency` row whose `price` is present but whose `listPrice`
// is absent writes `price` and nothing else, which then makes Step 3's
// `structKeyExists(detail,'price')` gate FALSE-out and skip the conversion
// entirely - so `listPrice` is never written and never converted. THAT is why
// the default eligible-currency list carries TWO currencies rather than one.
//
// HOW THE PRODUCT <-> SKU CYCLE IS BROKEN
// `Product` holds `skus` one-to-many [model/entity/Product.cfc:L73] while
// `Sku` holds `product` many-to-one [model/entity/Sku.cfc:L65] - a genuine
// cycle. `productFixtures` breaks it by defaulting `skus` to `[]`. This module
// closes the loop from the owning side: the product is built first with no
// skus, each sku is constructed without one, and `Sku.setProduct(product)` is
// then called EXACTLY ONCE per sku, which is the legacy bidirectional wiring
// [model/entity/Sku.cfc:L600-L605] and appends to the product's array through
// the `hasSku` containment probe. `Product.addSku` is not used because it only
// delegates to that same method.
//
// WHY THIS FILE BUILDS NO PRICE-GROUP GRAPH, THOUGH IT MAY IMPORT ONE
// JUDGMENT CALL: `./priceGroupFixtures` is a permitted earlier sibling and is
// deliberately NOT imported - not because price groups are irrelevant here, but
// because this module builds none, so there is nothing to duplicate.
// `priceGroupRates` is the INVERSE side of `SwPriceGroupRateSku`
// [model/entity/Sku.cfc:L86], so the RATE owns the link; constructing rates here
// would require skus that do not exist yet, which is a second cycle best solved
// by the caller. `priceGroupRates` therefore defaults to `[]`, exactly as the
// sibling product fixture defaults its own collections, and a suite that needs
// the five-level cascade builds the graph with the price-group fixture and hands
// the rates in through `overrides.priceGroupRates`. The price-group resolver
// double below reads whatever the supplied price group carries, so a
// caller-built graph works unmodified with no change to this file.
//
// THE LEGACY REFERENCE PATTERN, AND WHAT IS DELIBERATELY DROPPED
// [meta/tests/unit/Helper.cfc:L49-L77] is the only legacy fixture-construction
// artifact in the repository, and it is a REFERENCE PATTERN, NOT A PORT. Its
// shape is build -> save -> flush, and dispose by null-the-child -> delete ->
// flush. The SHAPE is carried; the MECHANISM is dropped, because the target
// has no ORM and nothing to flush. Dropped entirely: `entityNew`, `ormFlush`,
// `entityDelete`, `javaCast("null","")`, `request.slatwallScope` and every
// `getService(...)` lookup. Kept: one named function returning one fully-formed
// subject built from a small literal data bag with documented defaults,
// disposable by dropping the reference. THERE IS NO `destroy*` EXPORT - nothing
// is persisted, so nothing needs tearing down; a suite that wants teardown
// symmetry uses vitest's own `afterEach`.
//
// CFML parity [meta/tests/unit/Helper.cfc:L53]: the legacy helper assigned
// `productData` without `var`, leaking it into component scope. That is a
// harness hygiene defect, not one of the preserved business-logic defects;
// every local here is block-scoped deliberately.
//
// THE ANTI-PATTERN THIS FILE IS THE OPPOSITE OF
// [meta/tests/unit/SlatwallUnitTestBase.cfc:L52-L70]: `createObject`s the real
// `Slatwall.Application`, calls `bootstrap()` to raise the ORM and the DI/1
// container, sets `setSuperUserFlag(1)` before EVERY test, and has
// `endSlatwallLifecycle()` commented out - so no teardown at all. Every legacy
// "unit" test is therefore integration-style. This module boots nothing:
// plain constructed objects, no container, no service locator, no ambient
// request scope, no privilege elevation, no database, no network, no
// filesystem.
//
// NO USER RULES GOVERN THIS FILE
// The rules document reports that no user rules were provided, verified twice
// with identical output, so zero rules apply, none is invented, and the
// absence is not licence to lower the bar. The binding standard is instead the
// nine enterprise practices and the eight constraints the plan sets out. The
// four that shape this file most: money touches nothing but `Money`
// (arbitrary-precision, never a float); imports stay inside the declared
// whitelist so the layer boundary cannot be tunnelled through a test; exactly
// one unit is exported and there is no barrel; and every judgment call and
// every preserved defect is annotated in place.
//
// PLAN CORRECTIONS RECORDED HERE, ALL FIVE VERIFIED AGAINST THE SOURCE
//   1. `getStocksDeletableFlag` reaches the service at
//      [model/entity/Sku.cfc:L569], not L568 as the transformation table lists.
//   2. `model/validation/` holds 96 files, not 12. `Sku.json`,
//      `SkuCurrency.json`, `Option.json`, `OptionGroup.json` and
//      `RoundingRule.json` are ALL present - the plan's "present" list omits
//      the last three, which are exactly the validation files of the three
//      implicit-scope entities. Its "absent by design" claim is correct:
//      `model/validation/Category.json` really does not exist. This matters
//      because the guard asymmetry inside the cascade is justified ENTIRELY by
//      `SkuCurrency.json` - see the note on `SkuCurrencyVariant`.
//   3. Defect 17 does not merely "guard on the wrong key" - it THROWS.
//   4. Defect 18 does not merely write a differently-named variable - it makes
//      the method ALWAYS return an empty struct.
//   5. [model/service/SkuService.cfc:L236-L237] carries a previously
//      uncatalogued unguarded-index defect. It is annotated at the repository
//      double that reproduces the query it depends on.
//
// TEST TRACEABILITY - EVERYTHING BUILT ON THIS MODULE IS NET-NEW
// NO legacy test covers `Sku`, `SkuCurrency`, `Option` or `OptionGroup` at
// all. `meta/tests/unit/entity/` contains `BrandTest.cfc` and `ProductTest.cfc`
// and nothing else in this slice; `meta/tests/unit/dao/` and
// `meta/tests/unit/service/` contain nothing in scope. Every suite consuming
// this module is therefore NET-NEW and must be labelled so in the legacy test
// map. None of it may be presented as parity.
//
// ANNOTATION LEGEND
//   LEGACY-DEFECT [path:locator] - a real defect, reproduced on purpose,
//     always followed by the "Preserved deliberately" line.
//   JUDGMENT CALL - a decision made while authoring this file.
//   CFML parity [path:locator] - a semantic being matched that is NOT a defect.
//   LEGACY-NOTE [path:locator] - context a reader needs to check the port.
//
// WHAT THIS FILE NEVER CONTAINS
// No credential of any kind - no shared phrase, no bearer material, no access
// key, no host, no data-source name - and nothing here reads the process
// environment. No database, pool, driver import, network call or filesystem
// access; the SQL quoted in the comments below is a BEHAVIOURAL SPECIFICATION
// and is never executed. No suite block and no assertion; this folder holds data
// factories and the assertions live in the suites. No mocking library, no
// factory library, no new dependency of any kind. No implicitly-typed escape
// hatch, no compiler-suppression comment, no non-null assertion. No default
// export and no second export. Every date is an explicit UTC ISO-8601 literal,
// never read from the wall clock. No service-level objective, no elapsed-time
// budget and no rate expectation is asserted or implied anywhere - the plan
// forbids inventing non-functional requirements, and none exists in the source.
//
// A prohibited-identifier scan of this file's CODE - comments stripped - is
// therefore clean, and the prose above is deliberately worded so that a
// credential scanner reading the raw bytes finds nothing either.
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
import type { SkuHydrationInput, SkuPriceGroupResolver } from '../../src/domain/entities/sku.js';
import type { OptionSortTieBreaker } from '../../src/domain/entities/optionGroup.js';
import type { CurrencyConverter } from '../../src/domain/ports/currencyConverter.js';
import type { SettingKey, SettingsProvider } from '../../src/domain/ports/settingsProvider.js';
import type { SkuRepository } from '../../src/domain/ports/skuRepository.js';
import type { CurrencyCode } from '../../src/domain/valueObjects/currencyCode.js';
import type { CfBooleanInput } from '../../src/lib/cfml/truthiness.js';

// ---------------------------------------------------------------------------
// Structurally derived types
//
// JUDGMENT CALL: four types this graph needs are declared in modules that are
// NOT among this fixture's declared dependencies - the promotion-reward and
// promotion-qualifier entities, the sale-price detail projection published by
// the promotion repository port, and the per-request current-account context
// published by the price-group repository port. They are DERIVED from the sku
// hydration surface already in scope rather than imported. That keeps the
// import set exactly the whitelist and still keeps the types exact: a change
// to any upstream declaration breaks the compile here, which is the point. It
// is the same technique both earlier siblings used for the types outside their
// own whitelists.
// ---------------------------------------------------------------------------

/** Element type of any array or readonly array. */
type ElementOf<TArray> = TArray extends readonly (infer TElement)[] ? TElement : never;

/**
 * The promotion-reward entity, as seen through the sku hydration surface.
 *
 * `promotionRewards` is the inverse many-to-many through `SwPromoRewardSku`
 * [model/entity/Sku.cfc:L82], and `promotionRewardExclusions` its mirror
 * through `SwPromoRewardExclSku` [L83].
 */
type PromotionRewardRef = ElementOf<NonNullable<SkuHydrationInput['promotionRewards']>>;

/**
 * The promotion-qualifier entity, as seen through the sku hydration surface.
 *
 * `SwPromoQualSku` [model/entity/Sku.cfc:L84] and its exclusion mirror
 * `SwPromoQualExclSku` [L85].
 */
type PromotionQualifierRef = ElementOf<NonNullable<SkuHydrationInput['promotionQualifiers']>>;

/**
 * The sale-price projection this sku answers `getSalePrice()` from.
 *
 * CFML parity [model/entity/Sku.cfc:L539-L544]: the legacy memo is filled by
 * `getProduct().getSkuSalePriceDetails( getSkuID() )`, which returns `{}` on a
 * miss [model/entity/Product.cfc:L182-L187]. The port hands the projection to
 * the sku directly, so a fixture can pin the hit and the miss independently.
 */
type SalePriceDetailRef = NonNullable<SkuHydrationInput['salePriceDetail']>;

/**
 * The per-request current-account context.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L262-L268]: the legacy
 * reached the logged-in account through the ambient `getSlatwallScope()` /
 * `getHibachiScope()` accessors. The port replaces ambient state with an
 * explicit parameter, which also normalizes the legacy inconsistency between
 * those two accessor names.
 */
type CurrentAccountContextRef = NonNullable<SkuHydrationInput['currentAccountContext']>;

// ---------------------------------------------------------------------------
// Variant discriminators
//
// Every variation this module offers flows through the SINGLE `overrides`
// parameter as a discriminated field. There is deliberately no second export
// for the cascade variants, no second export for the AND-of-EXISTS graph and no
// second export for the option-group graph: one exported unit per file, and the
// caller selects a shape rather than a factory.
// ---------------------------------------------------------------------------

/**
 * Which member of the canonical four-sku AND-of-EXISTS graph to return.
 *
 * ★ MUST-PRESERVE AREA 3 [model/dao/SkuDAO.cfc:L107-L128]. The legacy appends
 * ONE `and exists (...)` clause PER selected option, so a sku matches only when
 * it carries EVERY option in the list, and the `0 = 0` tautology exists purely
 * so each appended clause can start with `and`. The canonical graph makes that
 * decidable with no ambiguity:
 *
 *   'A' -> options {O1, O2}
 *   'B' -> options {O1}
 *   'C' -> options {O1, O2, O3}
 *   'D' -> NO options at all
 *
 * Selecting `{O1, O2}` must match EXACTLY A and C. B fails the O2 clause; D
 * fails because [model/dao/SkuDAO.cfc:L110] is an `inner join sku.options`, so
 * an option-less sku can never appear however short the selected list is.
 *
 * When this field is set, ALL FOUR members are constructed and wired into one
 * shared product, and the requested one is returned. The other three exist as
 * candidates so the join is answerable; they are built lean - no currency rows,
 * no sale-price projection - because their only job is option membership.
 */
type AndOfExistsMember = 'A' | 'B' | 'C' | 'D';

/**
 * The order the option groups are handed to the graph in.
 *
 * CFML parity [model/entity/OptionGroup.cfc:L70]: the association carries
 * `orderby="sortOrder"` at the ORM level, so Hibernate returned option groups
 * pre-sorted and no caller ever had to sort them. Associations are materialized
 * at the repository boundary in the target, which makes applying that ORDER BY
 * an explicit repository responsibility - so a suite needs BOTH shapes:
 *
 *   'sortOrder' -> ascending by `sortOrder`, i.e. what the ORM guaranteed.
 *   'reversed'  -> descending, i.e. what a repository that FORGOT the ORDER BY
 *                  would hand over. A suite asserting the contract is applied
 *                  needs this one, because an already-sorted input cannot fail.
 */
type OptionGroupOrder = 'sortOrder' | 'reversed';

/**
 * Which `SwSkuCurrency` shape the sku carries, and therefore which cascade step
 * wins for the non-base currency.
 *
 * ★ MUST-PRESERVE AREA 2 [model/entity/Sku.cfc:L367-L433]. The four steps are:
 *
 *   Step 0 [L373] the eligibility gate `if(len(setting('skuEligibleCurrencies')))`.
 *   Step 1 [L385-L397] the base currency, from the sku's own columns,
 *          `converted = false`.
 *   Step 2 [L399-L414] per-currency overrides from `SwSkuCurrency`, which
 *          OVERWRITE Step 1 and additionally record `skuCurrencyID`,
 *          `converted = false`.
 *   Step 3 [L416-L428] on-the-fly conversion, gated ONLY on the absence of the
 *          `price` key, `converted = true`.
 *
 * ★ THE GUARD ASYMMETRY INSIDE STEPS 1 AND 2 IS CONTRACT-JUSTIFIED, NOT
 * ACCIDENTAL, AND `model/validation/SkuCurrency.json` IS THE PROOF - which is
 * exactly why correction 2 in the header matters. That file declares
 * `price` as `{"contexts":"save","required":true,...}` while `listPrice` and
 * `renewalPrice` are validated but NOT required. In CFML ORM a `default="0"`
 * attribute is applied by `entityNew`, NOT as a database DEFAULT constraint, so
 * a row loaded from a NULL column yields null regardless of the attribute.
 * Hence: `listPrice`/`renewalPrice` are legitimately NULL in persisted data,
 * which is precisely why [L401] and [L405] guard them with `!isNull(...)`; and
 * `price` can never be NULL for a validly-saved row, which is precisely why
 * [L409] assigns it unguarded. `model/validation/Sku.json` says the same thing
 * about the sku's own columns and explains [L386]/[L390] guarded versus [L394]
 * unguarded. Perfect symmetry between the two validation files and the two
 * cascade steps.
 */
type SkuCurrencyVariant =
  /**
   * No `SwSkuCurrency` rows at all. The base currency resolves through Step 1;
   * every other eligible currency falls all the way through to Step 3 and is
   * converted, so `converted` is `true` for it. This is the shape of a sku
   * whose merchant never entered a per-currency override.
   */
  | 'none'
  /**
   * One row for the NON-BASE currency carrying all three prices. Step 2 wins
   * for that currency - `converted` is `false` and `skuCurrencyID` is non-empty
   * - and Step 3 is skipped because the `price` key now exists. This is the
   * documented default: `price` present is what validated persisted data looks
   * like.
   */
  | 'secondaryOverride'
  /**
   * ★ THE HIGHEST-VALUE VARIANT IN THIS FILE. One row for the NON-BASE currency
   * whose `price` is present but whose `listPrice` and `renewalPrice` are
   * ABSENT. Step 2 writes `price` and `priceFormatted` only; Step 3 then sees
   * the `price` key already present and skips ENTIRELY, so `listPrice` is never
   * written and never converted. The result is a currency that IS in the map,
   * whose `getPriceByCurrencyCode` answers a real `Money`, while
   * `getListPriceByCurrencyCode` and `getRenewalPriceByCurrencyCode` answer
   * NOTHING. This is contract-honest data, not a defect - see the note above.
   */
  | 'secondaryPriceOnly'
  /**
   * TWO rows for the SAME non-base currency carrying DIFFERENT prices. Step 2's
   * loop has no `break`, so the LAST matching row wins and its `skuCurrencyID`
   * is the one recorded. Array order is load-bearing and this variant is what
   * lets a suite prove it.
   */
  | 'secondaryDuplicated'
  /**
   * One row for the non-base currency whose `price` is ABSENT while `listPrice`
   * is present - INVALID BY VALIDATION, since `model/validation/SkuCurrency.json`
   * requires `price` on save. It exists solely to reach Step 3's
   * `structKeyExists(detail,'price')` gate from inside Step 2: the guarded
   * `listPrice` assignment lands, the unguarded `price` assignment does not, so
   * Step 3 FIRES and overwrites all three with converted values - yet
   * `skuCurrencyID` survives from Step 2 while `converted` flips to `true`. A
   * suite pinning that mixed outcome needs this shape; nobody should mistake it
   * for a normal one.
   */
  | 'secondaryPriceAbsent'
  /**
   * One row for the BASE currency. Step 1 writes the sku's own columns, then
   * Step 2 OVERWRITES them for the very same currency and stamps a
   * `skuCurrencyID`. This is how a suite proves Step 2 supersedes Step 1 rather
   * than merely filling gaps.
   */
  | 'baseOverride';

// ---------------------------------------------------------------------------
// Overrides
//
// Declared here and NOT exported: the shape is an implementation detail of this
// factory, and exporting it would make a second export out of a type. A suite
// that needs a shared type imports it from the domain instead.
// ---------------------------------------------------------------------------

interface SkuFixtureOverrides {
  /**
   * Prefix for every identifier this graph mints, so two graphs in one suite
   * cannot collide. Defaults to `'skfx'`.
   *
   * Identifiers are derived from THIS ARGUMENT ALONE - there is no module-level
   * counter and no sequence with cross-call memory anywhere in this file, so
   * two calls with the same prefix mint the same identifiers and two calls with
   * different prefixes mint disjoint ones. That is what makes the option
   * identifiers stable enough for a caller to lift them out of one graph and
   * hand them back to another.
   */
  readonly idPrefix?: string | undefined;

  /** Overrides the derived `skuID`. Defaults to `` `${idPrefix}-sku` ``. */
  readonly skuID?: string | undefined;

  /**
   * CFML parity [model/entity/Sku.cfc:L53]: `activeFlag` defaults to `1`, so the
   * documented default here is `true`.
   */
  readonly activeFlag?: CfBooleanInput;

  /**
   * `SwSku.skuCode` is `unique="true" length="50"` [model/entity/Sku.cfc:L54] and
   * `model/validation/Sku.json` makes it required AND unique, so every member of
   * a multi-sku graph is minted a distinct one.
   */
  readonly skuCode?: string | undefined;

  /** `big_decimal` [model/entity/Sku.cfc:L55], `default="0"`. */
  readonly listPrice?: Money | undefined;

  /**
   * `big_decimal` [model/entity/Sku.cfc:L56], `default="0"`,
   * `model/validation/Sku.json` required on save.
   *
   * The documented default is exactly `19.99`, which is the unit price the
   * money value object's own reference calculation is pinned to: 19.99 x 3 =
   * 59.97, less 12.5 per cent = 7.49625, discounted total 52.47375, presented as
   * `"52.47"` - reproducing `numberFormat(discountAmount,"0.00")`
   * [model/service/PromotionService.cfc:L1017] with no binary-floating-point
   * drift. Keeping it reachable from sku data is deliberate.
   */
  readonly price?: Money | undefined;

  /** `big_decimal` [model/entity/Sku.cfc:L57], `default="0"`. */
  readonly renewalPrice?: Money | undefined;

  /** `SwSku.imageFile`, length 50 [model/entity/Sku.cfc:L58]. */
  readonly imageFile?: string | undefined;

  /** [model/entity/Sku.cfc:L59], `default="0"`. */
  readonly userDefinedPriceFlag?: CfBooleanInput;

  /** The denormalized quantity cache column [model/entity/Sku.cfc:L62]. */
  readonly calculatedQATS?: number | undefined;

  /** [model/entity/Sku.cfc:L90]. */
  readonly remoteID?: string | undefined;

  /**
   * Whether the sku reports itself unsaved. Defaults to `false`, matching the
   * entity's own default.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L600-L605]: `setProduct` short-circuits
   * its containment probe with `isNew() or ...`, so a sku that reports itself
   * new is appended to the product's array WITHOUT the probe. This factory
   * calls `setProduct` exactly once per sku, so either value is safe here - but
   * a caller that sets this AND re-wires the sku itself can produce a duplicate
   * row, which is the same hazard recorded on `SkuCurrency.setSku`.
   */
  readonly isNew?: boolean | undefined;

  /**
   * Opaque identifier standing in for the out-of-scope `SwSubscriptionTerm` FK
   * [model/entity/Sku.cfc:L66]. Absent by default: subscription handling lives
   * in the branches at [model/service/SkuService.cfc:L139-L202], which are out
   * of scope, and the column survives only so the merchandise path is honest
   * about the schema.
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
   * Build the canonical four-sku AND-of-EXISTS graph and return this member.
   * Absent by default, in which case a single sku carrying the full option set
   * is built and is the only candidate.
   */
  readonly andOfExistsMember?: AndOfExistsMember | undefined;

  /**
   * Supply the option set outright, bypassing the generated pool.
   *
   * ★ THIS IS THE HANDLE FOR SHARED OPTION IDENTITY. The `exists` subquery at
   * [model/dao/SkuDAO.cfc:L115-L119] joins `o.skus s where s.id = sku.id`, so
   * two skus "carrying the same option" means the SAME `SwOption` ROW, not two
   * rows with equal codes. A caller that needs one option shared across graphs
   * lifts it from a graph built here - member `'C'` carries all three - and
   * hands the very same instances back through this field. The instances are
   * shared on purpose; the ARRAY holding them is still copied, so no two skus
   * ever share the array itself.
   */
  readonly options?: readonly Option[] | undefined;

  /** Which order the generated option groups are handed over in. Defaults to `'sortOrder'`. */
  readonly optionGroupOrder?: OptionGroupOrder | undefined;

  /**
   * Add a FOURTH option belonging to the FIRST option group, so one sku carries
   * two options from the same group.
   *
   * ★ THIS SHAPE IS INVALID BY VALIDATION AND IS LABELLED SO DELIBERATELY.
   * `model/validation/Sku.json` wires `hasOneOptionPerOptionGroup`
   * [model/entity/Sku.cfc:L772-L784] onto `options` for the `save` context, so
   * at most ONE option per option group is a VALIDATED INVARIANT and this shape
   * could never be persisted. It exists for exactly one reason: the
   * de-duplication branch inside the two option-struct accessors is
   * unreachable without it. Defaults to `false`.
   */
  readonly duplicateOptionGroupOption?: boolean | undefined;

  /**
   * The deterministic tie-breaker each generated option group is given.
   *
   * ★ SUPPLYING ONE IS NOT OPTIONAL FOR REPRODUCIBILITY. `OptionGroup`'s own
   * fallback reproduces `randRange(1,100)` from
   * [org/Hibachi/HibachiUtilityService.cfc:L521], which the legacy sort used as
   * a tie-breaker, so a graph that did not supply one would sort
   * non-deterministically. This factory always supplies a constant.
   */
  readonly optionSortTieBreaker?: OptionSortTieBreaker | undefined;

  /**
   * The value the settings double answers for `skuCurrency`. Defaults to
   * `'USD'`.
   *
   * ★ `"USD"` IS SUPPLIED HERE AND NOWHERE ELSE. There is no hardcoded `"USD"`
   * anywhere in `model/entity/Sku.cfc`: `getCurrencyCode()`
   * [model/entity/Sku.cfc:L360-L365] just memoizes
   * `this.setting('skuCurrency')`, and the default lives in the setting
   * DECLARATION at [model/service/SettingService.cfc:L221] as
   * `{fieldType="select", defaultValue="USD"}`. So it reaches the entity only
   * through the settings port, never as an entity literal.
   */
  readonly skuCurrency?: string | undefined;

  /**
   * The value the settings double answers for `skuEligibleCurrencies`. Defaults
   * to `'USD,EUR'` - TWO currencies, for the reason in the file header.
   *
   * ★ PASS `''` TO CLOSE THE ELIGIBILITY GATE. [model/entity/Sku.cfc:L373]
   * wraps the entire cascade in `if(len(setting('skuEligibleCurrencies')))`, so
   * an empty setting leaves the memo `{}` and makes EVERY currency accessor
   * answer nothing at all. The setting's own default is the runtime-computed
   * active-currency list [model/service/SettingService.cfc:L222], so a normal
   * installation has it populated - but the gate is real, it is reachable, and
   * a port that dropped it would change behaviour.
   */
  readonly skuEligibleCurrencies?: string | undefined;

  /** Which `SwSkuCurrency` shape to generate. Defaults to `'secondaryOverride'`. */
  readonly skuCurrencyVariant?: SkuCurrencyVariant | undefined;

  /**
   * Supply the `SwSkuCurrency` rows outright, bypassing the generated variant.
   * Copied into a fresh array owned by the returned sku.
   */
  readonly skuCurrencies?: readonly SkuCurrency[] | undefined;

  /**
   * Multipliers the currency-converter double applies, keyed by TARGET currency
   * code and looked up case-insensitively. Defaults to `{ EUR: '0.90' }`.
   *
   * Every value is a DECIMAL STRING, never a JavaScript number, because the
   * double multiplies through `Money` and money never touches a float. A
   * non-base eligible currency with no entry here makes the double refuse
   * rather than invent a rate.
   */
  readonly conversionRates?: Readonly<Record<string, string>> | undefined;

  /**
   * The owning product. Built by `makeProductFixture` when omitted; pass
   * `undefined` explicitly to leave the sku detached.
   *
   * LEGACY-NOTE [model/entity/Sku.cfc:L65]: `product` is a REQUIRED many-to-one
   * in the schema, and several sku methods dereference it with no guard, so a
   * detached sku is a deliberately degenerate shape whose only purpose is to
   * reach those refusals.
   */
  readonly product?: Product | undefined;

  /**
   * Extra skus the product's option-resolution repository double should
   * consider, on top of the graph this call builds. Copied on the way in.
   */
  readonly selectedOptionsCandidateSkus?: readonly Sku[] | undefined;

  /**
   * The sale-price projection the returned sku answers from. ABSENT by default.
   *
   * JUDGMENT CALL: absence is the interesting default, because it is what makes
   * the legacy fall-back path reachable - see the annotation on
   * `Sku.getSalePrice()` further down. Supplying one pins the hit instead.
   */
  readonly salePriceDetail?: SalePriceDetailRef | undefined;

  /**
   * The `SwPriceGroupRateSku` link rows this sku participates in
   * [model/entity/Sku.cfc:L86]. Defaults to `[]`; build real ones with the
   * price-group fixture rather than by hand.
   *
   * ★ THERE IS NO EXCLUSION SIDE ON `Sku`, AND NONE MAY BE INVENTED.
   * `PriceGroupRate` declares `excludedSkus` through `SwPriceGroupRateExclSku`
   * [model/entity/PriceGroupRate.cfc:L77], yet `Sku.cfc` declares only the
   * inclusion side [L86]. Verified three ways: `ProductType.cfc` carries BOTH
   * sides [L74, L75], `Product.cfc` carries inclusion only, `Sku.cfc` carries
   * inclusion only. That is a deliberate legacy design choice, not an omission.
   */
  readonly priceGroupRates?: readonly PriceGroupRate[] | undefined;

  /**
   * What the price-group resolver double answers for
   * `calculateSkuPriceBasedOnPriceGroup`. Defaults to the sku's own price.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L301-L314]: when no rate
   * applies the legacy is an explicit pass-through of `sku.getPrice()`, so the
   * default is the legacy answer rather than a convenient stand-in. The
   * amount-type arithmetic that turns a rate into a price belongs to the
   * SERVICE [model/service/PriceGroupService.cfc:L316-L340] and is exercised
   * with the price-group fixture; it is not simulated here.
   */
  readonly priceGroupPrice?: Money | undefined;

  /**
   * What the price-group resolver double answers for
   * `calculateSkuPriceBasedOnCurrentAccount`. Defaults to the sku's own price.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L271-L298]: the legacy
   * seeds its candidate array with `sku.getPrice()` and returns the LOWEST, so
   * the account price can never exceed the base price. Set something lower to
   * make the live-price minimum land on this value instead.
   */
  readonly currentAccountPrice?: Money | undefined;

  /**
   * The per-request account context. Defaults to a context carrying a derived
   * opaque `accountID`; pass `undefined` to reach the entity's refusal.
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
   * What the sku repository double answers for `getTransactionExistsFlag`.
   * Defaults to `false`.
   *
   * CFML parity [model/dao/SkuDAO.cfc:L53]: the legacy counts order-item rows.
   * Nothing is persisted here, so `false` is the honest answer - and it is also
   * what unblocks the delete guard `model/validation/Sku.json` places on
   * `transactionExistsFlag`.
   */
  readonly transactionExistsFlag?: boolean | undefined;
}

// ---------------------------------------------------------------------------
// Documented defaults
//
// ★ IMMUTABLE PRIMITIVES ONLY AT MODULE SCOPE. Not one object, array, `Date`,
// `Money` or double lives out here. Four legacy component-level caches became
// per-request state in the target for exactly this reason - a warm container
// keeps module state alive between unrelated requests, so a shared mutable
// fixture would leak one suite's graph into another's. The caches in question:
// `SkuDAO.variables.nextOptionGroupSortOrder` [model/dao/SkuDAO.cfc:L204-L220],
// `RoundingRuleService.variables.roundingRuleDetails`
// [model/service/RoundingRuleService.cfc:L67-L77], the un-`var`'d
// `discountAmount` [model/service/PromotionService.cfc:L1007, L1009], and every
// entity memo - for this module `currencyDetails`, `livePrice`,
// `salePriceDetails`, `optionsIDList`, the two option-struct memos,
// `stocksDeletableFlag`, `transactionExistsFlag` and `currencyCode`.
// ---------------------------------------------------------------------------

/** Identifier prefix. Distinct from the sibling fixtures' `'prfx'`. */
const DEFAULT_ID_PREFIX = 'skfx';

/**
 * CFML parity [model/entity/Sku.cfc:L53] versus [model/entity/Product.cfc:L53]:
 * `Sku.activeFlag` carries `default="1"` and `Product.activeFlag` carries NO
 * default at all. The asymmetry is modelled honestly rather than harmonised, so
 * a sku is active by default while a product built by the sibling fixture is
 * not.
 */
const DEFAULT_ACTIVE_FLAG = true;

/** [model/entity/Sku.cfc:L59] `default="0"`. */
const DEFAULT_USER_DEFINED_PRICE_FLAG = false;

/**
 * `unique="true" length="50"` [model/entity/Sku.cfc:L54]. Shaped after
 * `Helper.cfc`'s `TESTPRODUCTXXX` so the lineage of the reference pattern stays
 * visible.
 */
const LEGACY_SKU_CODE = 'TESTSKUXXX';

/**
 * The reference-calculation unit price. See the note on
 * `SkuFixtureOverrides.price`.
 */
const SKU_PRICE = '19.99';

/** `big_decimal` [model/entity/Sku.cfc:L55]. Above `SKU_PRICE`, as a list price is. */
const SKU_LIST_PRICE = '24.99';

/** `big_decimal` [model/entity/Sku.cfc:L57]. */
const SKU_RENEWAL_PRICE = '17.99';

/**
 * The ORM default for all three money columns [model/entity/Sku.cfc:L55-L57].
 *
 * ★ IT IS A DECIMAL STRING, NEVER THE NUMBER `0`, and it is fed to
 * `Money.fromDecimalString`. `Money.zero` exists but is expressly forbidden as
 * a fallback for ABSENCE, so it is not used that way anywhere here.
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
 * The price on the FIRST of two same-currency rows in the `'secondaryDuplicated'`
 * variant. Deliberately far from `SECONDARY_OVERRIDE_PRICE` so a suite cannot
 * accidentally pass while reading the wrong row.
 */
const SECONDARY_SUPERSEDED_PRICE = '8.88';

/** `SwSkuCurrency.price` for the base currency in the `'baseOverride'` variant. */
const BASE_OVERRIDE_PRICE = '18.49';

/** The denormalized quantity cache column [model/entity/Sku.cfc:L62]. */
const CALCULATED_QATS = 7;

/** [model/entity/Sku.cfc:L90]. */
const REMOTE_ID = 'remote-test-sku';

/**
 * The audit timestamps [model/entity/Sku.cfc:L93, L95], as explicit UTC
 * ISO-8601 literals. Nothing in this file reads the wall clock - neither the
 * zero-argument `Date` constructor nor the current-millis helper appears
 * anywhere: a fixture whose data drifts with the clock is not a fixture. The
 * two values match the sibling fixtures so one graph reads coherently across
 * all three.
 */
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
 * CFML parity [model/validation/Option.json] and [model/validation/OptionGroup.json]:
 * `optionCode` and `optionGroupCode` are each `required`, `unique` AND
 * constrained by the regex `^[a-zA-Z0-9-_.|:~^]+$`. Every code literal in this
 * file satisfies it - no spaces, no slashes - so the default graph is a VALID
 * entity graph and a suite can save it in its head without wincing.
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
 * `SwOptionGroup.sortOrder` values [model/entity/OptionGroup.cfc:L58], which is
 * `ormtype="integer" required="true"` with NO default.
 *
 * They are DISTINCT on purpose. The sorted-sku query
 * [model/dao/SkuDAO.cfc:L178-L198] orders by
 * `SUM(SwOption.sortOrder * POWER(10, nextGroupSortOrder - SwOptionGroup.sortOrder))`
 * - base-10 POSITIONAL WEIGHTING, in which a lower-ranked option group is given
 * the HIGHER weight. Equal group sort orders would collapse the positions and
 * make the weighting unassertable.
 */
const OPTION_GROUP_1_SORT_ORDER = 1;
const OPTION_GROUP_2_SORT_ORDER = 2;
const OPTION_GROUP_3_SORT_ORDER = 3;

/**
 * `SwOption.sortOrder` values [model/entity/Option.cfc:L56].
 *
 * CFML parity [model/entity/Option.cfc:L56] versus
 * [model/entity/OptionGroup.cfc:L58]: `Option.sortOrder` LACKS the
 * `required="true"` its option group carries, and adds
 * `sortContext="optionGroup"` - so option ordering is scoped PER GROUP rather
 * than globally. The asymmetry is preserved, not harmonised.
 */
const OPTION_1_SORT_ORDER = 1;
const OPTION_2_SORT_ORDER = 2;
const OPTION_3_SORT_ORDER = 3;
const OPTION_4_SORT_ORDER = 4;

/** [model/entity/OptionGroup.cfc:L57] `imageGroupFlag` `default="0"`. */
const IMAGE_GROUP_FLAG = false;

/**
 * What the product's `nextOptionGroupSortOrder` reports: the highest group sort
 * order plus one, exactly as [model/dao/SkuDAO.cfc:L210-L214] computes it with
 * `SELECT max(SwOptionGroup.sortOrder) as max` and `rs.max + 1`.
 *
 * LEGACY-DEFECT [model/dao/SkuDAO.cfc:L222-L226]: `clearNextOptionGroupSortOrder`
 * deletes the cached value only `<cfif not structKeyExists(variables, ...)>` -
 * an INVERTED condition, so it can never fire and the cache survives for the
 * component's whole lifetime.
 * Preserved deliberately; do not fix without a product decision.
 *
 * Its consequence CANNOT be preserved, and that is a separate decision: on a
 * warm container that cache would be cross-request state, so the value is
 * per-graph here and is recomputed on every call. The defect is recorded; the
 * unsafe lifetime is not reproduced.
 *
 * LEGACY-NOTE [model/dao/SkuDAO.cfc:L210-L214]: on an EMPTY `SwOptionGroup`
 * table `max()` still returns one row holding NULL, so `recordCount` is truthy
 * and `NULL + 1` misbehaves. Nothing in a fixture can reach that - there is no
 * table - but the edge case is recorded because a repository suite must.
 */
const NEXT_OPTION_GROUP_SORT_ORDER = OPTION_GROUP_3_SORT_ORDER + 1;

/**
 * The constant every generated option group's sort tie-breaker returns.
 *
 * `OptionGroup`'s own fallback reproduces `randRange(1,100)` from
 * [org/Hibachi/HibachiUtilityService.cfc:L521]. A fixture that let that stand
 * would sort non-deterministically, so a constant is always supplied. `1`
 * rather than `0` because the legacy range is inclusive of 1.
 */
const OPTION_SORT_TIE_BREAKER_VALUE = 1;

// ---------------------------------------------------------------------------
// Override resolution
// ---------------------------------------------------------------------------

/**
 * The value the caller wrote for `key`, or the documented default when the key
 * was not written at all.
 *
 * Distinguishing "omitted" from "explicitly `undefined`" is not pedantry here:
 * `exactOptionalPropertyTypes` is on, and several defaults in this file are
 * load-bearing precisely because a caller can clear them - `product`,
 * `currentAccountContext` and `optionSortTieBreaker` all reach an entity
 * refusal or a documented degradation when explicitly cleared.
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
 * Was `key` written by the caller at all, whatever value it carries?
 *
 * The companion to `resolveOverride`, used at the sites whose default has to be
 * CONSTRUCTED rather than named - the option graph, the currency rows, the
 * product and the four collaborator doubles. Building those eagerly just to
 * discard them would create objects no graph ever owns, so the presence test is
 * separated from the read.
 */
function hasOverride(
  overrides: SkuFixtureOverrides | undefined,
  key: keyof SkuFixtureOverrides,
): boolean {
  return overrides !== undefined && Object.hasOwn(overrides, key);
}

// ---------------------------------------------------------------------------
// Module-scope pure builders
//
// Functions, never data. Each returns a FRESHLY constructed value on every
// call, so no array, no object, no `Date`, no `Money` and no double is ever
// shared between two graphs. That is what lets a suite prove a second,
// independent invocation does not observe the first invocation's memo - the
// property the port needs because a warm container keeps module state alive
// between unrelated requests.
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
 *
 * The two account identifiers are opaque strings. `createdByAccountID` and
 * `modifiedByAccountID` are foreign keys into `SwAccount`
 * [model/entity/Sku.cfc:L94, L96], an entity that is out of scope, so the
 * columns survive as inert identifiers and no `Account` is constructed. All four
 * are declared `hb_populateEnabled="false"` in the legacy, which is why nothing
 * here treats them as caller-settable.
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
 * A deterministic replacement for the option sort tie-breaker.
 *
 * A fresh closure per call, so no two option groups share one function object
 * even though they agree on the answer.
 */
function makeDeterministicOptionSortTieBreaker(): OptionSortTieBreaker {
  return (): number => OPTION_SORT_TIE_BREAKER_VALUE;
}

/**
 * The three option groups, freshly built, in the requested order.
 *
 * Each group is constructed with an EMPTY `options` array which the option
 * builder then fills, because `SwOption` holds the `optionGroupID` FK
 * [model/entity/Option.cfc:L59] while `SwOptionGroup` holds the inverse
 * collection [model/entity/OptionGroup.cfc:L70] - the option cannot exist before
 * its group and the group's collection cannot be complete before its options.
 * Filling the array afterwards is the only construction order that satisfies
 * both, and it is what `Option.setOptionGroup`
 * [model/entity/Option.cfc:L92-L97] does at runtime.
 *
 * JUDGMENT CALL: `setOptionGroup` is NOT used to do the filling. It is the same
 * bidirectional-sync shape as `SkuCurrency.setSku`
 * [model/entity/SkuCurrency.cfc:L89-L94] - assign the parent, then append `this`
 * to the parent's collection when new or absent - and it carries the same
 * double-append hazard when called more than once. The graph is therefore
 * constructed directly, and each group's array is appended to exactly once per
 * option.
 *
 * JUDGMENT CALL: the SAME `optionSortTieBreaker` reference is handed to all three
 * groups. It is a pure function holding no state, so sharing it shares nothing -
 * the copy-per-graph rule exists to stop two graphs mutating one another, and a
 * function with nothing to mutate is outside it. Every OTHER value here is still
 * per-graph.
 *
 * LEGACY-NOTE [model/entity/OptionGroup.cfc:L73-L79]: the legacy `getOptions()`
 * returns `variables.Options` with a CAPITAL O, which works only because CFML
 * variable names are case-insensitive - the same trap as
 * [model/entity/ProductType.cfc:L103] and [model/entity/Sku.cfc:L517]. The casing
 * drift is not replicated in the target, where it would be a different symbol
 * entirely. That legacy accessor also delegates to
 * `hibachiUtilityService.sortObjectArray`, which is not ported, and its
 * `sortType` defaults to `"text"` rather than numeric - so sorting integer
 * `sortOrder` values lexicographically puts `10` before `9`. The target keeps the
 * text default for parity and exposes the numeric mode explicitly.
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

  // 'reversed' hands them over descending by `sortOrder`, i.e. what a repository
  // that forgot [model/entity/OptionGroup.cfc:L70]'s `orderby="sortOrder"` would
  // produce. A suite asserting the contract is applied needs an input that can
  // actually fail, and an already-sorted one cannot.
  return order === 'reversed' ? [groupThree, groupTwo, groupOne] : [groupOne, groupTwo, groupThree];
}

/**
 * The option pool, freshly built, one option per group - plus optionally a
 * fourth that duplicates the first group.
 *
 * The groups arrive in whatever order `makeFixtureOptionGroups` produced, so the
 * pool is built by locating each group by its CODE rather than by position. That
 * keeps option 1 attached to the size group whichever order the caller asked
 * for, which is what makes the two orderings comparable.
 *
 * ★ THE POOL IS THE SHARED-IDENTITY BOUNDARY. Every sku in one graph draws its
 * options from THIS pool, so two skus "carrying option O1" carry the very same
 * `Option` instance - which is what [model/dao/SkuDAO.cfc:L115-L119]'s
 * `exists (from SlatwallOption o join o.skus s where s.id = sku.id and
 * o.optionID = ?)` actually means. The instances are shared on purpose. The
 * ARRAYS holding them are not: every sku gets its own array.
 *
 * LEGACY-NOTE [model/entity/Option.cfc:L66]: `Option.skus` is the INVERSE side
 * of `SwSkuOption` and is constructor-only in the target, so the options in this
 * pool report an empty `getSkus()`. Nothing in the option-resolution path reads
 * that side - the repository double answers from `Sku.getOptions()`, the OWNING
 * side, exactly as the HQL navigates from `sku.options` at
 * [model/dao/SkuDAO.cfc:L110].
 *
 * LEGACY-NOTE [model/entity/Option.cfc:L67-L70]: `Option` is the ONLY entity in
 * this slice carrying BOTH the inclusion and the exclusion side for BOTH
 * promotion rewards and promotion qualifiers. `Product` and `Sku` carry the
 * inclusion sides only. The missing inverses are not invented on either.
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
    // LEGACY-DEFECT [model/entity/Sku.cfc:L500-L510]: getOptionsByOptionGroupCodeStruct
    // guards on `variables.optionsByOptionGroupCodeStruct` at L501 but the line below
    // initialises `variables.optionsByOptionGroupIDStruct` - the WRONG key - so L504's
    // structKeyExists dereferences a variable that was never created and the method THROWS.
    // Preserved deliberately; do not fix without a product decision.
    //
    // LEGACY-DEFECT [model/entity/Sku.cfc:L512-L522]: getOptionsByOptionGroupIDStruct
    // guards and initialises the right key but L517 writes to `variables.OptionsByGroupIDStruct`
    // - a DIFFERENT NAME, not merely different casing - so L521 always returns an empty struct
    // and the L516 de-duplication check never sees anything at all.
    // Preserved deliberately; do not fix without a product decision.
    //
    // JUDGMENT CALL: the plan's defect register understates both. It says 17
    // "guards on the wrong `variables` key" and that 18 "populates
    // `variables.OptionsByGroupIDStruct` but returns
    // `variables.optionsByOptionGroupIDStruct`" - both accurate, neither stating
    // the CONSEQUENCE. 17 raises at runtime; 18 is a permanent empty answer.
    // Recorded here so nobody reads the register, concludes the legacy behaviour
    // was benign, and reproduces it. Both ARE fixed in the target as documented
    // deliberate divergences - they are unobservable through the public contract
    // and the memos became per-request anyway - so this fourth option exists to
    // exercise the FIXED de-duplication branch, which is otherwise unreachable.
    //
    // ★ THIS SHAPE IS INVALID BY VALIDATION. `model/validation/Sku.json` wires
    // `hasOneOptionPerOptionGroup` [model/entity/Sku.cfc:L772-L784] onto
    // `options` for the `save` context, so two options from one group could
    // never be persisted. It is deliberately invalid data with one purpose.
    //
    // JUDGMENT CALL: the de-duplication is FIRST-MATCH-WINS - both accessors
    // write only `if (!structKeyExists(struct, key))`, so option 1 keeps the size
    // group and option 4 is discarded. That is the exact OPPOSITE of the two
    // cascades in this slice: the currency cascade's Step 2
    // [model/entity/Sku.cfc:L399-L414] and the price-group rate lookup
    // [model/service/PriceGroupService.cfc:L146-L150] both have no `break` and
    // are therefore LAST-match-wins. Getting the two directions the wrong way
    // round is an easy and expensive mistake, so they are contrasted here.
    pool.push(option(4, OPTION_4_CODE, OPTION_4_NAME, OPTION_4_SORT_ORDER, OPTION_GROUP_1_CODE));
  }

  // The inverse collections are completed here rather than through
  // `setOptionGroup`, for the reason recorded on `makeFixtureOptionGroups`. Each
  // group's array is appended to exactly once per option it owns.
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
 * CFML parity [model/entity/Sku.cfc:L504]: the legacy keys its struct by
 * `getOptionGroupCode()` and CFML struct keys are case-INSENSITIVE, so a code
 * comparison that respected case would be a silent divergence. `cfEquals`
 * carries the CFML `eq` semantics rather than a hand-rolled `toUpperCase()`
 * pair.
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
 * Which pool positions each member of the canonical AND-of-EXISTS graph carries.
 *
 * A function rather than a table, so the array is fresh on every call and no
 * caller can mutate a shared one. The switch is exhaustive over the member
 * union, so adding a member is a compile error rather than a silent gap.
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
      // ★ NO OPTIONS AT ALL, AND THAT IS THE POINT OF THIS MEMBER.
      //
      // LEGACY-DEFECT [model/entity/Sku.cfc:L756-L769]: hasUniqueOptions builds
      // `optionsList` from this sku's options, so for an option-less sku the list is
      // `""`; `listLen("")` is 0, no `exists` clause is appended, and the HQL degenerates
      // to `select distinct sku ... inner join sku.options as opt where 0 = 0` plus the
      // productID filter - which returns EVERY OPTIONED SKU OF THE PRODUCT. An
      // option-less sku on a product with two or more optioned skus therefore FAILS
      // hasUniqueOptions spuriously.
      // Preserved deliberately; do not fix without a product decision.
      //
      // JUDGMENT CALL: this edge case is newly catalogued - it is not in the
      // plan's twenty-defect register. It was found while authoring this fixture,
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
 * The pool entries named by `indexes`, as a FRESH array.
 *
 * `noUncheckedIndexedAccess` makes every pool read `Option | undefined`, so the
 * absent case is stated rather than asserted away with a non-null assertion -
 * which this file does not use even though the test lint profile would permit
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
 * The two URL-key settings this sku never reads, present only so the settings
 * double satisfies the port's TOTAL contract.
 *
 * `SettingsProvider.setting` is declared to return `string` and never
 * `undefined`, so a partial table would make that declaration a lie. The values
 * match the sibling product fixture so one graph reads coherently
 * [model/service/SettingService.cfc:L178, L179].
 */
const GLOBAL_URL_KEY_PRODUCT = 'sp';
const GLOBAL_URL_KEY_PRODUCT_TYPE = 'spt';

/**
 * A hand-written in-memory stand-in for the settings port.
 *
 * ★ THIS IS THE ONLY PLACE `"USD"` ENTERS THE GRAPH. The cascade reads
 * `setting('skuCurrency')` at [model/entity/Sku.cfc:L385, L418, L422, L425] and
 * `setting('skuEligibleCurrencies')` at [L373, L375], and `getCurrencyCode()`
 * [L360-L365] memoizes the first of those - so the base currency reaches the
 * entity ONLY through here. The legacy default lives in the setting DECLARATION
 * at [model/service/SettingService.cfc:L221], never in `Sku.cfc`.
 *
 * The port publishes exactly FOUR keys and is not widened. Its neighbours in the
 * legacy declaration block - `skuAllowBackorderFlag`, `skuAllowPreorderFlag`,
 * `skuHoldBackQuantity`, `skuOrderMinimumQuantity`, `skuOrderMaximumQuantity`
 * [model/service/SettingService.cfc:L219-L228] - are deliberately absent, and
 * `globalAssetsImageFolderPath`, which `Option.getImageDirectory()`
 * [model/entity/Option.cfc:L81-L83] reads, is out of scope and is not answered.
 *
 * NO MOCKING LIBRARY, and none may be added: the dependency set is fixed at its
 * exact pins and a double answering a table of four values is the entire
 * requirement. The legacy suite managed without one too.
 *
 * JUDGMENT CALL: the double records nothing. A recorded call list would not be
 * observable through the `Sku` this factory returns, and a suite that must
 * observe delegation supplies its own port through `overrides.settingsProvider`
 * - strictly more expressive than a recorder baked in here.
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
 * `addInFilter('currencyCode', setting('skuEligibleCurrencies'))` and then reads
 * `getCurrencyCode()` off each returned `Currency` ENTITY. `Currency` is out of
 * scope and every one of those lines reads nothing but the code, so the port
 * answers with currency CODES directly and this double parses them out of the
 * very list the setting holds. No behaviour depends on any other `Currency`
 * member.
 *
 * `getAllActiveCurrencyIDList` is never called by `Sku`. It is implemented
 * because the port declares it, and because it is the runtime-computed DEFAULT
 * of the `skuEligibleCurrencies` setting [model/service/SettingService.cfc:L222]
 * - so answering the same list keeps the double self-consistent.
 *
 * ★ EVERY RATE IS A DECIMAL STRING AND THE MULTIPLICATION GOES THROOUGH `Money`.
 * No floating-point operation touches a monetary value anywhere in this file.
 * This closes, in the fixture as well as in the target, the gap at
 * [model/service/PromotionService.cfc:L998] where the legacy `amountOff` branch
 * skipped `precisionEvaluate` and multiplied as a float.
 */
function makeFixtureCurrencyConverter(
  eligibleCurrencies: string,
  conversionRates: Readonly<Record<string, string>>,
): CurrencyConverter {
  // Snapshots taken here, inside the call: the caller keeps ownership of its own
  // rate table and a later mutation of it cannot reach into this graph.
  const rates: Readonly<Record<string, string>> = { ...conversionRates };
  const eligible: string = eligibleCurrencies;

  const parse = (currencyCodeList: string): CurrencyCode[] =>
    listToArray(currencyCodeList).map((entry: string): CurrencyCode => toCurrencyCode(entry));

  const rateFor = (currencyCode: string): string | undefined => {
    // CFML parity [model/entity/Sku.cfc:L385, L400]: the legacy compares currency
    // codes with `eq`, which is case-INSENSITIVE, and CFML struct keys are
    // case-insensitive too. `cfEquals` carries that semantics rather than a
    // hand-rolled case fold.
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
      // Converting a currency to itself is the identity, which is also what the
      // legacy conversion service answers for equal codes.
      if (cfEquals(originalCurrencyCode, convertToCurrencyCode)) {
        return Promise.resolve(amount);
      }

      const rate: string | undefined = rateFor(convertToCurrencyCode);

      if (rate === undefined) {
        // Refusing is the honest answer. Silently returning `amount` would invent
        // a 1:1 rate and make a converted price indistinguishable from an
        // overridden one, which is precisely the distinction cascade Step 3's
        // `converted = true` flag exists to record.
        return Promise.reject(
          new Error(
            `skuFixtures: no conversion rate was supplied for '${convertToCurrencyCode}'. ` +
              `Cascade Step 3 [model/entity/Sku.cfc:L416-L428] converts every eligible ` +
              `currency that no SwSkuCurrency row covers, so supply a rate through ` +
              `overrides.conversionRates for each one.`,
          ),
        );
      }

      return Promise.resolve(amount.times(rate));
    },
  };
}

/**
 * A hand-written in-memory stand-in for the sku repository port.
 *
 * ★ THIS DOUBLE READS `candidates` LIVE AND DOES NOT SNAPSHOT IT. That is the
 * single deliberate exception to the defensive-copy rule in this file, and it is
 * what breaks the `Product` <-> `Sku` cycle: the product has to exist before any
 * sku can be wired to it, yet the product's option-resolution repository has to
 * answer with those very skus. The array is created inside `makeSkuFixture`, is
 * filled during the same call, is COMPLETE BEFORE THE FACTORY RETURNS, and never
 * escapes to a caller. It is call-local, not module-scope, so two invocations
 * share nothing.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L276, L282] is why the
 * exception has to be called out at all: CFML copies arrays BY VALUE on
 * assignment, so the legacy `var priceGroups = account.getPriceGroups();`
 * followed by `arrayAppend` left the account's collection untouched, where a
 * TypeScript reference would have MUTATED it. Every other collection in this
 * file is therefore copied; this one is not, on purpose.
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

      // CFML parity [model/dao/SkuDAO.cfc:L53]: the legacy counts `SwOrderItem`
      // rows. Nothing is persisted here, so `false` is the honest answer, and it
      // is also what unblocks the `transactionExistsFlag eq false` delete guard in
      // `model/validation/Sku.json`.
      return Promise.resolve(transactionExistsFlag);
    },

    getSkuBySkuCode(skuCode: string): Promise<Sku | undefined> {
      // CFML parity [model/dao/SkuDAO.cfc:L102-L104]: the legacy also matches
      // `ascs.alternateSkuCode` through a LEFT JOIN on `alternateSkuCodes`. Those
      // rows survive in the target as opaque identifiers only - the
      // `SwAlternateSkuCode` entity is not in this slice - so the alternate branch
      // has no data to match against and only the primary code is answered. The
      // gap is recorded rather than papered over with an invented entity.
      return Promise.resolve(
        candidates.find((candidate: Sku): boolean =>
          cfEquals(candidate.getSkuCode() ?? '', skuCode),
        ),
      );
    },

    getSkusBySelectedOptions(selectedOptions: string, productID?: string): Promise<Sku[]> {
      // ★ MUST-PRESERVE AREA 3 [model/dao/SkuDAO.cfc:L107-L128], reproduced
      // clause for clause:
      //
      //   select distinct sku from SlatwallSku as sku
      //   inner join sku.options as opt
      //   where 0 = 0
      //   [ and exists ( from SlatwallOption o join o.skus s
      //                  where s.id = sku.id and o.optionID = ? ) ]  -- once PER option
      //   [ and sku.product.id = ? ]                                 -- only if supplied
      //
      // Three properties are load-bearing and all three are honoured here.
      //
      // 1. ONE `exists` CLAUSE PER SELECTED OPTION, ANDed - so a sku matches only
      //    when it carries EVERY option in the list. `every` is that conjunction.
      //    The `0 = 0` tautology exists purely so each appended clause can start
      //    with `and`; it constrains nothing and has no counterpart here.
      //
      // 2. THE `inner join sku.options` MEANS AN OPTION-LESS SKU CAN NEVER MATCH,
      //    however short the selected list is. The emptiness test below is that
      //    join, and it is what makes the spurious `hasUniqueOptions` failure
      //    recorded on member 'D' reachable.
      //
      // 3. PARAMETERS BIND IN STRICT ORDER - every optionID first, `productID`
      //    LAST - because [L120] appends each option before [L125] appends the
      //    product. Ordering is not observable through an in-memory double; it is
      //    asserted at the integration tier against the real prepared statement,
      //    where parameterized SQL is the standard rather than string
      //    concatenation. The SQL quoted here is a BEHAVIOURAL SPECIFICATION and
      //    is never executed by this file.
      //
      // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L163]: a sibling method in the same
      // DAO declares `var hql &= "WHERE sku.product.productID = :productID ";` -
      // `var` combined with a COMPOUND-ASSIGNMENT operator, which is not a valid
      // declaration.
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

      // CFML parity [model/dao/SkuDAO.cfc:L130-L148]: the legacy matches a search
      // term against sku and product columns and filters on a product-type path.
      // An empty projection is a genuine legacy answer - it is what the statement
      // returns for a term nothing matches - not a placeholder.
      return Promise.resolve([]);
    },

    getProductSkus(product: Product, fetchOptions: boolean): Promise<Sku[]> {
      // CFML parity [model/dao/SkuDAO.cfc:L150-L170]: `fetchOptions` selects an
      // eager option join. Associations are materialized at the repository
      // boundary in the target, so the options are already present either way and
      // the flag changes nothing observable here - which is exactly why the target
      // turns it into an explicit eager-load decision rather than leaving it
      // implicit.
      void fetchOptions;

      // A NEW array, not the product's own, matching
      // [model/service/SkuService.cfc:L221] which returns the DAO's result rather
      // than the field.
      return Promise.resolve([...product.getSkus()]);
    },

    getSortedProductSkusID(productID: string): Promise<string[]> {
      // CFML parity [model/dao/SkuDAO.cfc:L178-L198]: the ordering is
      //
      //   ORDER BY SUM(SwOption.sortOrder
      //                * POWER(10, nextOptionGroupSortOrder - SwOptionGroup.sortOrder)) ASC
      //
      // - base-10 POSITIONAL WEIGHTING, in which a LOWER-ranked option group is
      // given the HIGHER weight, so the first option group dominates the sort.
      // Only `productID` is parameterized (`cf_sql_varchar`);
      // `#getNextOptionGroupSortOrder()#` is interpolated directly into the SQL,
      // which is safe because it is numeric and privately computed.
      //
      // The three INNER JOINs through `SwSkuOption`, `SwOption` and
      // `SwOptionGroup` mean an option-less sku is DROPPED from this result
      // entirely - which is the precondition for the defect annotated below.
      //
      // LEGACY-NOTE: these weights are ordering integers, not money. `Money` is
      // the sole arithmetic surface for MONETARY values; a sort key is neither
      // monetary nor rounded, and modelling it as currency would be wrong.
      //
      // TODO [model/dao/SkuDAO.cfc:L177]: the legacy carries a live
      // `<!--- TODO: test to see if this query works with DB's other than MSSQL and
      // MySQL --->`. Carried over verbatim rather than silently resolved: the
      // dialect branch at [L194-L198] casts to `bigint` for SQL Server and does
      // not for anything else, and only the MySQL branch is targeted.
      //
      // LEGACY-DEFECT [model/service/SkuService.cfc:L236-L237]: the caller does
      // `var index = arrayFind(sortedArray, skuID);` and then
      // `sortedArrayReturn[index] = skus[i];` with NO guard. `arrayFind` answers 0
      // for any sku this query dropped - which is every option-less sku - and
      // CFML then raises on the index-0 write. `getProductSkus`
      // [model/service/SkuService.cfc:L220-L244] at least gates its sort branch on
      // three conditions at L223, but it checks `skus[1].getOptions()` ONLY, so a
      // later option-less sku still reaches L237; `getSortedProductSkus`
      // [model/service/SkuService.cfc:L246-L262] has the SAME indexing
      // vulnerability with only `arrayLen(skus) lt 2` guarding it, making it
      // strictly MORE exposed. The two implementations diverge in their defensive
      // checks and must stay distinct - they are not to be consolidated.
      // Preserved deliberately; do not fix without a product decision.
      //
      // JUDGMENT CALL: this defect is newly catalogued - it is not in the plan's
      // twenty-defect register. Member 'D' of the canonical graph reaches it the
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
      // No persistence: the instance is handed straight back, which is the only
      // part of the legacy save a fixture can honour without a database. This is
      // the `ormFlush()` of [meta/tests/unit/Helper.cfc:L61] deliberately dropped.
      return Promise.resolve(sku);
    },
  };
}

/**
 * Does one candidate sku carry the option named by `selectedOptionID`?
 *
 * CFML parity [model/dao/SkuDAO.cfc:L118]: the comparison is
 * `o.optionID = ?` bound through `cfqueryparam`. MySQL's default collation is
 * case-INSENSITIVE, so that comparison ignored case and TypeScript's `===` does
 * not - the comparison is therefore audited rather than assumed. Identifiers are
 * opaque hashes in practice, so this changes no realistic outcome; it removes a
 * silent divergence.
 */
function skuCarriesOptionID(candidate: Sku, selectedOptionID: string): boolean {
  return candidate
    .getOptions()
    .some((held: Option): boolean => cfEquals(held.getOptionID(), selectedOptionID));
}

/**
 * Does one candidate sku belong to the product named by `productID`?
 *
 * CFML parity [model/dao/SkuDAO.cfc:L124]: `and sku.product.id = ?`, the clause
 * appended LAST. Case-insensitive for the same collation reason as
 * `skuCarriesOptionID`. A detached sku belongs to no product and is excluded,
 * which is what the SQL join would do with a NULL FK.
 */
function skuBelongsToProduct(candidate: Sku, productID: string): boolean {
  const owningProduct: Product | undefined = candidate.getProduct();
  return owningProduct !== undefined && cfEquals(owningProduct.getProductID(), productID);
}

/**
 * The base-10 positional sort weight of one sku's option set.
 *
 * CFML parity [model/dao/SkuDAO.cfc:L197]:
 * `SUM(SwOption.sortOrder * POWER(10, nextOptionGroupSortOrder - SwOptionGroup.sortOrder))`.
 * An option whose group has no sort order contributes nothing, matching the
 * INNER JOIN through `SwOptionGroup` - a row with no group never reaches the SUM.
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
// getService("promotionService").calculateSkuPriceBasedOnPromotion(...), and that
// method EXISTS NOWHERE IN THE SOURCE - a repository-wide search finds it at that one
// call site and nothing else. The method therefore throws at runtime today, and the
// target reproduces it as a throwing stub.
// Preserved deliberately; do not fix without a product decision.
//
// ★ THE CONSEQUENCE FOR THIS FILE IS THAT THERE IS NO PROMOTION-SERVICE DOUBLE AND
// THERE MUST NOT BE ONE. `SkuHydrationInput` declares exactly FOUR collaborator ports
// - the settings provider, the currency converter, the price-group resolver and the
// sku repository - and a promotion collaborator is absent from that list precisely
// because the only sku method that would have used one cannot work. Supplying a double
// that answered a plausible number would be inventing an implementation for a method
// that does not exist, which is expressly forbidden. `getPriceByPromotion` is left to
// throw, and a suite pins the throw.
//
// Its two immediate neighbours are CORRECT and are wired normally:
// [model/entity/Sku.cfc:L261-L263] `getPriceByPriceGroup` and [L265-L267]
// `getAppliedPriceGroupRateByPriceGroup` both reach the price-group service, and the
// second of those is the five-level cascade. The cascade's own graph is built by the
// price-group fixture and is NOT rebuilt here.
// ---------------------------------------------------------------------------

/**
 * A hand-written in-memory stand-in for the sku-facing slice of the price-group
 * service.
 *
 * Three methods, matching the port exactly.
 *
 * `getRateForSkuBasedOnPriceGroup` reproduces the SKU-LEVEL rung only
 * [model/service/PriceGroupService.cfc:L146-L150]: it loops the price group's
 * own rates and keeps the LAST one whose `hasSku` answers true. The loop has no
 * `break`, so LAST MATCH WINS - the same shape as the currency cascade's Step 2,
 * and the opposite of the option-struct de-duplication.
 *
 * The remaining four rungs - the product rate, the product-type parent chain, the
 * global rate and the parent price group - are the SERVICE's responsibility
 * [model/service/PriceGroupService.cfc:L152-L180] and are exercised with the
 * price-group fixture's own graph. They are deliberately not re-implemented here,
 * including the asymmetry at [L174] where the parent recursion calls the PRODUCT
 * variant rather than the sku variant.
 *
 * `calculateSkuPriceBasedOnPriceGroup` answers the supplied price or, by default,
 * `sku.getPrice()` - which is the legacy's own explicit pass-through when no rate
 * applies [model/service/PriceGroupService.cfc:L301-L314]. The amount-type
 * arithmetic that turns a rate into a price lives at
 * [model/service/PriceGroupService.cfc:L316-L340], where only the `percentageOff`
 * branch applies the rounding rule, and that belongs to the service suite.
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
          // No `break`, on purpose. [model/service/PriceGroupService.cfc:L146-L150]
          // keeps looping, so a later matching rate supersedes an earlier one.
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

      // CFML parity [model/service/PriceGroupService.cfc:L271-L298]: the legacy
      // seeds its candidate array with `sku.getPrice()` and returns the LOWEST, so
      // the account price can never exceed the base price. Defaulting to the base
      // price is therefore the legacy answer for an account with no price groups,
      // not a convenient stand-in.
      //
      // LEGACY-NOTE [model/entity/Sku.cfc:L487-L495]: `getLivePrice` appends
      // `getSalePrice()` then `getCurrentAccountPrice()`, sorts `"numeric" "asc"`
      // and takes `prices[1]` - the minimum. In the legacy that sort is fragile:
      // `Product.getCurrentAccountPrice()` [model/entity/Product.cfc:L588-L592]
      // has no `else` and no trailing return, so it can hand back NULL, and
      // appending a null to an array that is then sorted `"numeric"` breaks the
      // sort. The hazard is STRUCTURALLY ELIMINATED in the target rather than
      // reproduced: this port method returns `Money` and cannot return nothing, so
      // there is no null to append. That is a type-level fix, not a behavioural
      // divergence - the minimum of the same three candidates is unchanged - and
      // it is recorded here rather than left implicit.
      return Promise.resolve(currentAccountPrice ?? sku.getPrice());
    },
  };
}

/**
 * The `SwSkuCurrency` rows for one variant, freshly built.
 *
 * ★ THE `price` KEY IS PASSED AS `undefined`, NOT OMITTED - AND THAT IS
 * DELIBERATE, NOT AN OVERSIGHT.
 *
 * JUDGMENT CALL: the "omit the key entirely rather than set it to `undefined`"
 * discipline applies to the CASCADE'S OUTPUT - `CurrencyDetail`, whose `price`,
 * `listPrice`, `renewalPrice`, the three `*Formatted` companions and `converted`
 * are all OPTIONAL members, so under `exactOptionalPropertyTypes` installing
 * `undefined` there would make `structKeyExists` answer TRUE for a sub-key that
 * legacy CFML never wrote, and would in particular SUPPRESS Step 3. It does NOT
 * apply to `SkuCurrency`'s constructor, which declares all eleven keys as
 * REQUIRED with value-nullable types. Passing `price: undefined` there is the
 * destination's own declared contract, and it is exactly what makes the cascade
 * omit the sub-key downstream: the guard at [model/entity/Sku.cfc:L401, L405]
 * is `!isNull(...)`, so an absent value means the assignment never happens and
 * the key never appears. Two different rules for two different surfaces, and
 * conflating them would break one of them.
 *
 * CFML parity [model/entity/Sku.cfc:L276, L282]: this is the mechanism behind
 * the SECOND `structKeyExists` in `getListPriceByCurrencyCode` and
 * `getRenewalPriceByCurrencyCode`. Those two check the outer currency key AND
 * the inner sub-key, where `getPriceByCurrencyCode` [L270] checks only the
 * outer, and all three are declared `returntype="any"` - not `numeric` -
 * precisely so the implicit null return is legal. The target maps all three to
 * `Money | undefined`, and SUBSTITUTING `0` WOULD SILENTLY SELL PRODUCTS FOR
 * FREE. `Money.zero` exists but is expressly forbidden as a fallback for
 * absence; it appears in this file only as the ORM `default="0"` for the sku's
 * own columns, which is a real persisted value rather than a stand-in for one.
 *
 * CFML parity [model/entity/SkuCurrency.cfc:L68]: `currencyCode` is
 * `insert="false" update="false"` - a READ-ONLY PROJECTION of the `currencyCode`
 * FK, not a surrogate. The entity exposes no setter for it and this builder
 * never lets it drift from the row's identity.
 *
 * LEGACY-NOTE [model/entity/SkuCurrency.cfc:L89-L94]: `setSku` appends `this` to
 * the sku's collection when `isNew() or !arguments.sku.hasSkuCurrency( this )`,
 * so on a new instance it appends WITHOUT the containment probe and calling it
 * twice creates two rows. Every row here is therefore built with `sku:
 * undefined` and handed to the sku through hydration instead; the back-reference
 * is deliberately absent. A suite that needs it calls `setSku` exactly once
 * itself, on a row it did not also hydrate.
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
      // No rows. The base currency resolves through Step 1
      // [model/entity/Sku.cfc:L385-L397]; every other eligible currency falls all
      // the way through to Step 3 [L416-L428] and is converted, so `converted` is
      // `true` for it and `skuCurrencyID` stays the empty string [L382] seeded
      // for every eligible currency before any step runs.
      return [];

    case 'secondaryOverride':
      // The documented default. One row for the non-base currency carrying all
      // three prices, so Step 2 [L399-L414] wins for it - `converted` is `false`
      // and `skuCurrencyID` is non-empty - and Step 3 is skipped because the
      // `price` key now exists. `price` present is what validated persisted data
      // looks like: `model/validation/SkuCurrency.json` requires it on save.
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
      // ★ THE HIGHEST-VALUE SHAPE IN THIS FILE.
      //
      // LEGACY-DEFECT [model/entity/Sku.cfc:L416]: Step 3 is gated on
      // `if(!structKeyExists(variables.currencyDetails[ ... ], "price"))` - the PRICE
      // key ALONE. So a Step 2 row that wrote `price` but left `listPrice` unwritten
      // makes Step 3 skip ENTIRELY, and `listPrice` is then NEVER converted and
      // remains permanently absent. The result is a currency that IS fully present in
      // the map, answering a real price, whose list and renewal prices answer NOTHING.
      // Preserved deliberately; do not fix without a product decision.
      //
      // ★ THIS DATA IS CONTRACT-HONEST, NOT INVALID.
      // `model/validation/SkuCurrency.json` requires only `price`; `listPrice` and
      // `renewalPrice` are validated but optional, and a `default="0"` ORM attribute
      // [model/entity/SkuCurrency.cfc:L54, L55] is applied by `entityNew` rather than
      // as a database DEFAULT constraint, so a row loaded from a NULL column really
      // does yield null. That is exactly why [L401] and [L405] guard those two while
      // [L409] assigns `price` unguarded - and it is why this shape is annotated as
      // CFML parity rather than as a defect on the DATA. The defect is in the GATE
      // above, which turns legitimate sparse data into a permanently stranded key.
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
      // LEGACY-DEFECT [model/entity/Sku.cfc:L399-L414]: Step 2 loops EVERY
      // `skuCurrencies` entry and its `if` body has NO `break`, so when two rows carry
      // the same currency code the LAST one wins - both for the prices and for the
      // `skuCurrencyID` recorded at [L412]. Array order is therefore load-bearing, and
      // the outcome depends on a collection order the ORM never guaranteed. It is
      // structurally the same "last match wins" as the price-group rate lookup at
      // [model/service/PriceGroupService.cfc:L146-L150].
      // Preserved deliberately; do not fix without a product decision.
      //
      // The first row's price is deliberately far from the second's so a suite
      // cannot accidentally pass while reading the wrong row.
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
      // ★ INVALID BY VALIDATION, ON PURPOSE AND LABELLED SO.
      // `model/validation/SkuCurrency.json` declares
      // `"price": [{"contexts":"save","required":true,"dataType":"numeric","minValue":0}]`,
      // so a row with no price could never have been saved. It exists to reach one
      // mixed outcome that no other shape can: Step 2's guarded `listPrice`
      // assignment [L405] lands and its unguarded `price` assignment [L409] does
      // not, so Step 3's gate [L416] finds no `price` key and FIRES - overwriting
      // all three sub-keys with converted values and flipping `converted` to
      // `true` - while the `skuCurrencyID` stamped by Step 2 at [L412] SURVIVES.
      // A detail carrying both a non-empty `skuCurrencyID` and `converted = true`
      // is reachable only this way.
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
      // One row for the BASE currency, so Step 1 writes the sku's own columns and
      // Step 2 then OVERWRITES them for the very same currency and stamps a
      // `skuCurrencyID` [L412]. This is how a suite proves Step 2 supersedes Step 1
      // rather than merely filling gaps left by it.
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
 * The sku code the requested graph member is minted.
 *
 * `SwSku.skuCode` is `unique="true"` [model/entity/Sku.cfc:L54] and
 * `model/validation/Sku.json` makes it required AND unique, so every member of a
 * multi-sku graph must differ. Suffixing with the member letter guarantees it.
 */
function memberSkuCode(member: AndOfExistsMember | undefined): string {
  return member === undefined ? LEGACY_SKU_CODE : `${LEGACY_SKU_CODE}-${member}`;
}

/**
 * The distinct option groups reachable from a caller-supplied option set, in
 * first-appearance order.
 *
 * Used only when the caller supplies `overrides.options`, so the product still
 * reports the groups its skus actually reference. De-duplication is by group
 * IDENTIFIER compared case-insensitively, matching CFML struct-key semantics
 * [model/entity/Sku.cfc:L516].
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
 * The first eligible currency that is NOT the base currency.
 *
 * The `SwSkuCurrency` variants target whichever currency that is, so a caller
 * who changes `overrides.skuEligibleCurrencies` gets override rows for the right
 * currency instead of a stale hardcoded one. Comparison is `cfEquals` because
 * CFML `eq` is case-insensitive [model/entity/Sku.cfc:L385], which is also what
 * makes a `'usd,EUR'` eligible list against a `'USD'` base resolve Step 1
 * correctly.
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
 * ★ HOW TO REACH THE CURRENCY CASCADE. The map is NOT injectable - the hydration
 * surface publishes no `currencyDetails` member and `getCurrencyDetails()` is a
 * synchronous memo read that answers `{}` until something materializes it. So a
 * suite does exactly this, ONCE, and every accessor is synchronous thereafter:
 *
 *   const sku = makeSkuFixture();
 *   await sku.materializeCurrencyDetails();
 *   sku.getPriceByCurrencyCode('USD');       // Step 1, converted === false
 *   sku.getPriceByCurrencyCode('EUR');       // Step 2, converted === false
 *
 * The four cascade paths, each reachable on its own:
 *
 *   gate closed  -> `{ skuEligibleCurrencies: '' }`. [model/entity/Sku.cfc:L373]
 *                   leaves the memo `{}` and EVERY accessor answers nothing.
 *   Step 1 only  -> `{ skuEligibleCurrencies: 'USD', skuCurrencyVariant: 'none' }`.
 *   Step 2 wins  -> the default, or `'baseOverride'` to see it supersede Step 1,
 *                   or `'secondaryDuplicated'` to see LAST MATCH WIN.
 *   Step 3 wins  -> `{ skuCurrencyVariant: 'none' }` with two eligible
 *                   currencies; the non-base one is converted, `converted === true`.
 *
 * ★ AND THE ONE PATH THAT MATTERS MOST:
 *
 *   const sku = makeSkuFixture({ skuCurrencyVariant: 'secondaryPriceOnly' });
 *   await sku.materializeCurrencyDetails();
 *   sku.getPriceByCurrencyCode('EUR');        // a real Money
 *   sku.getListPriceByCurrencyCode('EUR');    // undefined - NEVER zero
 *
 * ★ HOW TO REACH THE AND-of-EXISTS BEHAVIOUR. Ask for a member and the whole
 * four-sku graph is built and wired to one product:
 *
 *   const skuA = makeSkuFixture({ andOfExistsMember: 'A' });
 *   const product = skuA.getProduct();
 *   await product?.getSkusBySelectedOptions(skuA.getOptionsIDList());  // A and C
 *
 * The same graph is the `hasUniqueOptions` graph - the validator itself calls
 * `getProduct().getSkusBySelectedOptions(...)` at [model/entity/Sku.cfc:L763], so
 * there is exactly ONE option graph here and it is reused rather than duplicated.
 *
 * ★ EVERY CALL RETURNS A FRESH, INDEPENDENT GRAPH. Two invocations share no
 * array, no `Date`, no `Money`, no double and no memo, so a suite can prove that
 * a second sku does not observe the first sku's materialized cascade. Nothing in
 * this module holds mutable state between calls, and identifiers derive from
 * `idPrefix` alone rather than from any counter.
 *
 * @param overrides Every variation this module offers, as documented fields.
 * @returns The requested sku, wired into its product and into the candidate set.
 */
export function makeSkuFixture(overrides?: SkuFixtureOverrides): Sku {
  // --- Resolved scalar inputs ------------------------------------------------
  //
  // `??` where the default is simply a value and absence carries no distinct
  // meaning; `resolveOverride` where an explicit `undefined` must survive as
  // absence.

  const idPrefix: string = overrides?.idPrefix ?? DEFAULT_ID_PREFIX;
  const member: AndOfExistsMember | undefined = overrides?.andOfExistsMember;

  const skuID: string = overrides?.skuID ?? memberSkuID(idPrefix, member);
  const skuCode: string | undefined = resolveOverride(overrides, 'skuCode', memberSkuCode(member));

  // CFML parity [model/entity/Sku.cfc:L53] versus [model/entity/Product.cfc:L53]:
  // `Sku.activeFlag` carries `default="1"` while `Product.activeFlag` carries no
  // default at all, so a sku built here is ACTIVE and a product built by the
  // sibling fixture is not. The asymmetry is modelled rather than harmonised, and
  // `resolveOverride` is used so an explicit `false` survives as `false` instead
  // of being eaten by truthiness.
  const activeFlag: CfBooleanInput = resolveOverride(overrides, 'activeFlag', DEFAULT_ACTIVE_FLAG);
  const userDefinedPriceFlag: CfBooleanInput = resolveOverride(
    overrides,
    'userDefinedPriceFlag',
    DEFAULT_USER_DEFINED_PRICE_FLAG,
  );

  const imageFile: string | undefined = overrides?.imageFile;
  const remoteID: string | undefined = resolveOverride(overrides, 'remoteID', REMOTE_ID);
  const calculatedQATS: number | undefined = resolveOverride(
    overrides,
    'calculatedQATS',
    CALCULATED_QATS,
  );
  const subscriptionTermID: string | undefined = overrides?.subscriptionTermID;
  const isNew: boolean | undefined = resolveOverride(overrides, 'isNew', false);

  // All three monetary slots are built from DECIMAL STRINGS. No `number` is ever
  // handed to `Money`, no arithmetic operator is applied to a monetary value
  // anywhere in this module, and `Money.zero` is never used as a fallback for
  // absence. `price` defaults to the reference-calculation unit price so the
  // 19.99 x 3 chain stays reachable from sku data.
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

  // A fresh table per call, never a shared module-scope object. Every value is a
  // decimal string because the converter double multiplies through `Money`.
  const conversionRates: Readonly<Record<string, string>> = overrides?.conversionRates ?? {
    [secondaryCurrencyCode]: SECONDARY_CONVERSION_RATE,
  };

  const skuCurrencyVariant: SkuCurrencyVariant =
    overrides?.skuCurrencyVariant ?? 'secondaryOverride';

  // --- The option graph -----------------------------------------------------
  //
  // When the caller supplies options they become the pool and the groups are
  // derived from them, so the product still reports the groups its skus actually
  // reference. Otherwise the canonical three-group, one-option-per-group graph is
  // generated - a VALID graph under `hasOneOptionPerOptionGroup`.

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

  // ★ THE SHARED-IDENTITY DECISION, STATED EXPLICITLY.
  //
  // JUDGMENT CALL: `Option` INSTANCES are shared across the skus of one graph,
  // deliberately, because [model/dao/SkuDAO.cfc:L115-L119]'s `exists (from
  // SlatwallOption o join o.skus s where s.id = sku.id and o.optionID = ?)` means
  // "the same `SwOption` ROW", not "two rows with equal codes" - so sharing is
  // what makes the AND-of-EXISTS join answerable at all. The ARRAYS holding them
  // are NOT shared: every sku is handed its own array, built inside this call, so
  // an `addOption` in one suite cannot surface in another. Sharing the leaves and
  // copying the containers is the whole decision, and it is why
  // `selectPoolOptions` returns a fresh array on every call.
  const targetOptions: Option[] = callerSuppliedOptions
    ? [...(callerOptions ?? [])]
    : member === undefined
      ? [...optionPool]
      : selectPoolOptions(optionPool, optionIndexesForMember(member));

  // --- Collaborator doubles -------------------------------------------------
  //
  // `SkuHydrationInput` declares EXACTLY FOUR collaborator ports, and all four
  // are supplied - no more, no fewer. There is deliberately no promotion-service
  // double, for the reason recorded above `makeFixturePriceGroupResolver`, and no
  // image store or subscription-term provider, because `Sku` declares neither:
  // those out-of-scope branches live on the SERVICES
  // [model/service/SkuService.cfc:L139-L202, L210-L218], not on this entity.

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

  // ★ THE ONE LIVE ARRAY IN THIS FILE, AND THE REASON IT IS LIVE.
  //
  // The product must exist before any sku can be wired to it, yet the product's
  // option-resolution repository must answer with those very skus. This array is
  // therefore created here, handed to the repository double UNCOPIED, filled
  // during this same call, and complete before the factory returns. It is
  // call-local, never module-scope, and never handed to a caller - two
  // invocations share nothing. Caller-supplied extra candidates are copied in on
  // the way, so the caller's own array is untouched.
  const candidates: Sku[] = [...(overrides?.selectedOptionsCandidateSkus ?? [])];

  const transactionExistsFlag: boolean = overrides?.transactionExistsFlag ?? false;

  const skuRepository: SkuRepository | undefined = hasOverride(overrides, 'skuRepository')
    ? overrides?.skuRepository
    : makeFixtureSkuRepository(candidates, transactionExistsFlag, NEXT_OPTION_GROUP_SORT_ORDER);

  // --- The owning product ---------------------------------------------------
  //
  // Built with NO skus and then appended to from the owning side, which is how
  // the `Product` <-> `Sku` cycle is broken. The sibling fixture's `skus`
  // default of `[]` is what makes that possible.
  //
  // `selectedOptionsCandidateSkus` is deliberately NOT passed through: the
  // sibling fixture snapshots it to build ITS default repository double, which
  // would capture an empty list, and this call supplies its own live-reading
  // double instead.
  //
  // LEGACY-DEFECT [model/entity/Sku.cfc:L442-L447]: getDefaultFlag() is
  // `getProduct().getDefaultSku().getSkuID() == getSkuID()` with NO guard on either
  // dereference, so a sku whose product has no default sku raises - and
  // `model/validation/Sku.json` requires `defaultFlag eq false` on DELETE, so deleting
  // such a sku raises during validation. This is the exact MIRROR IMAGE of
  // [model/entity/Product.cfc:L589, L595], which DO guard with
  // `structKeyExists(variables,"defaultSku")`: Sku is unguarded exactly where Product
  // is guarded.
  // Preserved deliberately; do not fix without a product decision.
  //
  // The sibling fixture leaves `defaultSku` ABSENT by default, so that raise is
  // reachable the moment the two fixtures are combined - which is deliberate, and
  // is why no default sku is wired here either. A suite that wants the flag to
  // answer instead passes a product carrying `defaultSku`.
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
  // ★ EVERY COLLECTION IS A FRESH ARRAY BUILT INSIDE THIS CALL, INCLUDING WHEN
  // THE CALLER SUPPLIED ONE. `Sku.getOptions()` and `Sku.getSkuCurrencies()` hand
  // back the backing array itself, uncopied, because the entity preserves the
  // legacy live-array semantics - so if one array instance reached two skus, an
  // `addOption` in one suite would surface in another. Copying here is what makes
  // the entity's live-array rule safe: the fixture creates the array and hands
  // ownership to exactly one sku.

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

  // The inert opaque identifier sets standing in for out-of-scope associations.
  // `orderItems` [model/entity/Sku.cfc:L71] is `lazy="extra"` and points at the
  // out-of-scope Order aggregate, so it has no counterpart at all and is never
  // populated - the promotion engine reaches order state through read-only order
  // views, not through this side of the graph.
  const alternateSkuCodeIDs: readonly string[] = [...(overrides?.alternateSkuCodeIDs ?? [])];
  const stockIDs: readonly string[] = [...(overrides?.stockIDs ?? [])];
  const accessContentIDs: readonly string[] = [...(overrides?.accessContentIDs ?? [])];
  const subscriptionBenefitIDs: readonly string[] = [...(overrides?.subscriptionBenefitIDs ?? [])];
  const renewalSubscriptionBenefitIDs: readonly string[] = [
    ...(overrides?.renewalSubscriptionBenefitIDs ?? []),
  ];
  const physicalIDs: readonly string[] = [...(overrides?.physicalIDs ?? [])];

  // JUDGMENT CALL: `Sku.getSalePrice()` [model/entity/Sku.cfc:L546-L551] returns
  // `getSalePriceDetails()["salePrice"]` when the key exists and otherwise falls
  // back to `getPrice()` - NOT to zero. `Product.getSalePrice()`
  // [model/entity/Product.cfc:L594-L601] is the defective one: its L598
  // `getSkus()[1].getSalePrice();` OMITS the `return` keyword, so execution falls
  // through to `return 0`. SKU IS CORRECT WHERE PRODUCT IS DEFECTIVE, and that
  // defect is NOT propagated into this fixture. The projection is ABSENT by
  // default precisely so the correct fall-back is the default observable
  // behaviour; supplying one pins the hit instead.
  //
  // LEGACY-NOTE [model/entity/Sku.cfc:L539-L544, L557, L564]: the legacy memo is
  // filled through `getProduct().getSkuSalePriceDetails( getSkuID() )`, which
  // answers `{}` on a miss [model/entity/Product.cfc:L182-L187]. The port hands
  // the projection to the sku directly, so the product's own map is left unset
  // here and the two cannot disagree. Note also that the sibling accessors return
  // the empty STRING on a miss - `getSalePriceDiscountType()` at [L557] and
  // `getSalePriceExpirationDateTime()` at [L564], the second despite being
  // declared non-persistent `type="date"` at [L118] - so neither is money and
  // neither is modelled as `Money`. `Sku` spells the expiration accessor
  // CORRECTLY, where [model/entity/Product.cfc:L618] carries the typo
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
  // Every OPTIONAL member is written through a conditional spread rather than
  // assigned a possibly-`undefined` value, because `exactOptionalPropertyTypes`
  // makes `price?: Money` and `price?: Money | undefined` different contracts and
  // the hydration surface declares the former. The spread form is the checkable
  // one: it omits the key entirely when there is no value, needs no cast and no
  // suppression comment.
  //
  // ★ THE FORMATTED SUB-KEYS. `getCurrencyDetails()` writes a `*Formatted`
  // companion beside every price it records - `priceFormatted`
  // [model/entity/Sku.cfc:L395, L410, L426], `listPriceFormatted` [L392, L407,
  // L423] and `renewalPriceFormatted` [L388, L403, L419] - and it writes them
  // through TWO DIFFERENT PATHS: Steps 1 and 2 use the entity-scoped
  // `getFormattedValue(...)` while Step 3 uses `formatValue(..., "currency",
  // {currencyCode=...})` with an explicit currency. The plan does not mention the
  // `*Formatted` sub-keys at all; they were verified by reading the source. They
  // are produced by the entity during materialization and are therefore not
  // fixture inputs - nothing here invents them, and nothing here suppresses them.

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

    // The audit columns [model/entity/Sku.cfc:L93-L96]; the two account keys are
    // inert opaque identifiers for an out-of-scope entity.
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
  // `Sku.setProduct` is called EXACTLY ONCE per sku. It is the legacy
  // bidirectional wiring [model/entity/Sku.cfc:L600-L605] - assign the FK side,
  // then append to the product's array behind the `isNew() or !hasSku(this)`
  // probe - so a second call on an `isNew()` sku would append a duplicate row.
  // That is the same hazard recorded on `SkuCurrency.setSku`
  // [model/entity/SkuCurrency.cfc:L89-L94] and on `Option.setOptionGroup`
  // [model/entity/Option.cfc:L92-L97], and it is why nothing here calls any of
  // the three more than once. `Product.addSku`
  // [model/entity/Product.cfc:L696-L698] only delegates to this method, so it
  // adds nothing and is not used.

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

  // The canonical four-sku graph. The requested member is the fully-configured
  // `target`; the other three are built LEAN - no currency rows, no sale-price
  // projection, the ORM `default="0"` for the two optional money columns - because
  // their only job is option membership. They still receive the same four ports,
  // so a suite can reach the same behaviour on any of them.
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
