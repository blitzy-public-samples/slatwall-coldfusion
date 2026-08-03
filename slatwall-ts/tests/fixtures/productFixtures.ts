// ---------------------------------------------------------------------------
// slatwall-ts - PRODUCT / PRODUCT-TYPE / BRAND TEST DATA
//
// WHAT THIS FILE IS
// A single deterministic factory returning one fully-formed `SwProduct`
// aggregate - the product itself, its eagerly-joined `SwBrand`, and a two-level
// `SwProductType` chain carrying real materialized paths. It is consumed by
// explicit per-suite named imports from the product, brand, product-type and
// category entity suites and from the product-service suite; nothing here
// asserts anything, and nothing here is registered as a global.
//
// IT IS MODULE #2 OF FIVE IN AN ACYCLIC FIXTURE ORDER
//   priceGroupFixtures -> productFixtures -> skuFixtures -> promotionFixtures
//   -> orderViewFixtures
// Only module #1 may be imported from here, and this file imports none of the
// five: every collaborator that would close a cycle arrives through the single
// `overrides` parameter instead. See the judgment call recorded on
// `ProductFixtureOverrides.skus`.
//
// ★ THE SINGLE MOST IMPORTANT STRUCTURAL RULE IN THIS FILE
// `skus` DEFAULTS TO AN EMPTY ARRAY. `Product` holds `skus` one-to-many
// [model/entity/Product.cfc:L73] while `Sku` holds `product` many-to-one
// [model/entity/Sku.cfc:L70] - a genuine cycle in the legacy object graph.
// Defaulting `skus` to `[]` is precisely what breaks that cycle and keeps the
// fixture graph a DAG, and it is also legacy-accurate: the unflagged
// `Product.getSkus()` [model/entity/Product.cfc:L157] returns the already
// materialized array, and [meta/tests/unit/entity/BrandTest.cfc:L58-L60]
// asserts the analogous `getProducts()` equals `[]`. A caller that needs SKUs
// hands them in; NO SKU IS CONSTRUCTED HERE.
//
// WHY IT DOES NOT CONSTRUCT SKUS, OPTIONS, CATEGORIES OR PRICE-GROUP RATES
// Those types are reached through `import type` ONLY and are populated
// exclusively through `overrides`. Every collection defaults to `[]`, which is
// the state a repository that did not fetch the join must present. `Category`
// is deliberately never instantiated here - its constructor requires every key
// [src/domain/entities/category.ts], it is a read-mostly leaf, and its
// `cmsCategoryID` column and `site` association survive only as inert
// persisted columns with no CMS behaviour to exercise.
//
// THE LEGACY REFERENCE PATTERN, AND WHAT IS DELIBERATELY DROPPED
// [meta/tests/unit/Helper.cfc:L49-L77] is the only fixture-construction
// artefact in the legacy tree, 77 lines shaped as build -> save -> flush. Its
// SHAPE is carried over: one named function, a small literal data bag with
// documented defaults, one fully-formed subject returned, disposable by
// dropping the reference. Its MECHANISM is dropped entirely, because there is
// no ORM here: the framework entity-construction call, the session flush, the
// delete helper, the null cast and the ambient request-scope service lookup all
// go away.
// This factory touches no database, no connection pool, no network and no
// filesystem, and there is deliberately no teardown export - nothing is
// acquired, so a suite wanting teardown symmetry uses the runner's own
// per-test hook.
//
// Its four data literals ARE retained verbatim, because they are the values
// the legacy suite actually used: `"Test Product"`, a price of 100 (as a
// decimal string fed to `Money`, never the numeric literal), the product code
// `"TESTPRODUCTXXX"`, and the opaque 32-character product-type identifier.
// Nothing here parses, derives, validates or regenerates that identifier - it
// is an identifier, not a credential.
//
// The harness at [meta/tests/unit/SlatwallUnitTestBase.cfc:L49-L79] is the
// ANTI-PATTERN this file is the opposite of: it instantiates the real
// application object (L52), injects a `Helper` component (L55), starts the ORM
// and the dependency-injection container before every single test (L60),
// elevates the current account to superuser (L62), and never tears any of it
// down (L70, commented out). Every legacy "unit" test therefore boots the real
// application, so the legacy suite is integration-style at every level and
// nothing in it is isolated in the modern sense. There is no application
// start-up here, no container, no service locator, no ambient scope and no
// privilege elevation - only plain constructed objects.
//
// CFML parity [meta/tests/unit/Helper.cfc:L53]: the legacy helper assigns
// `productData` without `var`, leaking it into component `variables` scope. The
// same omission appears at [meta/tests/unit/IssuesTest.cfc:L51]. That is a
// harness hygiene defect in the code being REPLACED, not one of the preserved
// business-logic defects; it is deliberately NOT reproduced here. Every local
// below is `const`-scoped inside its function.
//
// NO USER RULES GOVERN THIS FILE. The project's rules source reports that no
// user rules were provided, so there is no rule-mandated content here and none
// is invented, and the absence is not licence to lower the bar. The standard
// applied in its place is enterprise best practice as the transformation plan
// states it: maximal strictness, the layer boundary, the fixed dependency set,
// `Money` as the sole arithmetic surface, environment-driven configuration with
// no credential of any kind, one exported unit per file with no barrel, and
// in-code annotation of every judgment call and every preserved defect.
//
// ANNOTATION LEGEND, used verbatim throughout:
//   `// LEGACY-DEFECT [<path>:<locator>]: ...` followed by
//   `// Preserved deliberately; do not fix without a product decision.`
//     - data that exists ONLY because a legacy defect is being preserved.
//     - the ONE exception is a documented DELIBERATE DIVERGENCE, which keeps the
//       `LEGACY-DEFECT` marker but closes WITHOUT that trailer, because the port
//       FIXES the defect instead of reproducing it. There is exactly one such
//       block here, and it says so in its own closing lines.
//   `// CFML parity [<path>:<locator>]: ...`
//     - a semantic-fidelity note about the source.
//   `// LEGACY-NOTE [<path>:<locator>]: ...`
//     - a source defect this design NEUTRALISES rather than reproduces, because
//       it belongs to another tier. It carries no "preserved deliberately"
//       trailer precisely because nothing is being preserved.
//   `// JUDGMENT CALL: ...`
//     - a design decision taken here, with its justification.
//
// WHAT THIS FILE NEVER CONTAINS
// No suite declaration and no assertion of any kind - this folder holds data
// factories and the assertions live in the unit and integration tiers. No
// mocking library: the four collaborator doubles below are hand-written,
// exactly as the legacy suite managed without one. No environment read, no
// credential, no hostname, no driver import, no query. No clock read: every
// timestamp is an explicit UTC ISO-8601 literal, because the runner pins the
// process timezone to UTC and a relative date would make an assertion depend
// on the day it ran. No performance or capacity claim of any kind, and no
// timing assertion: the legacy runtime's lock and request-timeout figures are
// source facts, never service levels, and none is restated as one here.
// ---------------------------------------------------------------------------

import { Brand } from '../../src/domain/entities/brand.js';
import { Product } from '../../src/domain/entities/product.js';
import { ProductType } from '../../src/domain/entities/productType.js';
import { buildIdPathList } from '../../src/domain/valueObjects/materializedIdPath.js';
import { Money } from '../../src/domain/valueObjects/money.js';
import { listToArray } from '../../src/lib/cfml/list.js';

import type { Category } from '../../src/domain/entities/category.js';
import type { Option } from '../../src/domain/entities/option.js';
import type { OptionGroup } from '../../src/domain/entities/optionGroup.js';
import type { ProductHydrationInput } from '../../src/domain/entities/product.js';
import type { Sku } from '../../src/domain/entities/sku.js';
import type {
  AttributeSetSummary,
  ProductRepository,
} from '../../src/domain/ports/productRepository.js';
import type { OptionRepository, SelectOption } from '../../src/domain/ports/optionRepository.js';
import type { SettingKey, SettingsProvider } from '../../src/domain/ports/settingsProvider.js';
import type { SkuRepository } from '../../src/domain/ports/skuRepository.js';
import type { CfBooleanInput } from '../../src/lib/cfml/truthiness.js';

// ---------------------------------------------------------------------------
// Structurally derived types
//
// JUDGMENT CALL: four types this graph needs are declared in modules that are
// NOT among this fixture's declared dependencies - the promotion-reward,
// promotion-qualifier and price-group-rate entities, and the sale-price detail
// projection published by the promotion repository port. They are DERIVED from
// the product hydration surface already in scope rather than imported. That
// keeps the import set exactly the whitelist and still keeps the types exact:
// a change to any upstream declaration breaks the compile here, which is the
// point. It is the same technique the sibling price-group fixture used for the
// two types outside ITS whitelist.
// ---------------------------------------------------------------------------

/** Element type of any array or readonly array. */
type ElementOf<TArray> = TArray extends readonly (infer TElement)[] ? TElement : never;

/**
 * The promotion-reward entity, as seen through the product hydration surface.
 *
 * `promotionRewards` is the many-to-many through `SwPromoRewardProduct`
 * [model/entity/Product.cfc:L84], and `promotionRewardExclusions` its mirror
 * through `SwPromoRewardExclProduct` [L85].
 */
type PromotionRewardRef = ElementOf<NonNullable<ProductHydrationInput['promotionRewards']>>;

/**
 * The promotion-qualifier entity, as seen through the product hydration surface.
 *
 * `SwPromoQualProduct` [model/entity/Product.cfc:L86] and its exclusion mirror
 * `SwPromoQualExclProduct` [L87].
 */
type PromotionQualifierRef = ElementOf<NonNullable<ProductHydrationInput['promotionQualifiers']>>;

/**
 * The price-group-rate entity, as seen through the product hydration surface.
 *
 * CFML parity [model/entity/Product.cfc:L88]: `priceGroupRates` links through
 * `SwPriceGroupRateProduct` and is the inverse of
 * [model/entity/PriceGroupRate.cfc:L72]. ★ `Product.cfc` DECLARES NO
 * `priceGroupRateExclusions` PROPERTY AT ALL, even though
 * [model/entity/PriceGroupRate.cfc:L76] declares `excludedProducts` through
 * `SwPriceGroupRateExclProduct`. `ProductType.cfc` carries BOTH sides
 * [model/entity/ProductType.cfc:L74 and L75]; `Product` carries only the
 * inclusion side, so the association is one-directional in the source. The
 * missing inverse is NOT invented here, and its absence independently
 * corroborates the published finding that the `excluded*` collections are
 * persisted and never consulted by the price-group cascade.
 */
type PriceGroupRateRef = ElementOf<NonNullable<ProductHydrationInput['priceGroupRates']>>;

/**
 * The sale-price detail map, keyed by `skuID`, exactly as the entity accepts it.
 *
 * CFML parity [model/entity/Product.cfc:L517-L521]: the legacy computed this by
 * reaching `promotionService` through the service locator. The port refuses that
 * reach and takes the map already reduced and already rounded from the
 * repository boundary, so this fixture supplies it the same way - as data, never
 * as a computation.
 */
type SalePriceDetailsMap = NonNullable<ProductHydrationInput['salePriceDetailsForSkus']>;

// ---------------------------------------------------------------------------
// The overrides bag
//
// Declared locally and NOT exported. `tsconfig.build.json` excludes `tests/**`,
// so nothing in this folder is emitted and a local non-exported interface
// satisfies the one-exported-unit-per-file standard cleanly.
//
// EVERY MEMBER IS `readonly x?: T | undefined` DELIBERATELY. With
// `exactOptionalPropertyTypes` on, `?: T` and `?: T | undefined` are different
// contracts: the first forbids a caller from writing the key at all with the
// value `undefined`, and writing it explicitly is exactly how a caller asks for
// the ABSENT state of a member this factory otherwise supplies by default. See
// `resolveOverride`, which is what makes the distinction observable.
// ---------------------------------------------------------------------------

interface ProductFixtureOverrides {
  /**
   * Seeds every identifier this factory derives, so two graphs in one suite can
   * be told apart.
   *
   * Default `'prfx'`. It is NOT applied to the product type's own identifier,
   * which is the verbatim legacy hash - see `LEGACY_MERCHANDISE_PRODUCT_TYPE_ID`.
   */
  readonly idPrefix?: string | undefined;

  /**
   * [model/entity/Product.cfc:L52] `unsavedvalue="" default=""`.
   *
   * Default `''`, which is what makes `isNew()` honest and keeps the four cases
   * inherited from [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67]
   * expressible - `defaults_are_correct()` there asserts both `isNew()` and
   * `!len(getPrimaryIDValue())`. No fake UUID is invented for a row that was
   * never saved. Pass a non-empty string for a saved-row fixture.
   */
  readonly productID?: string | undefined;

  /**
   * [model/entity/Product.cfc:L53] `ormtype="boolean"` with NO `default=`.
   *
   * Default: UNSET. The column declares no default, so the honest fixture state
   * is "no value", and `getActiveFlag()` then answers `false` through
   * `cfBoolean()` - which is the answer the CFML engine gave an undefaulted
   * flag, NOT an invented `activeFlag = true`.
   */
  readonly activeFlag?: CfBooleanInput;

  /**
   * [model/entity/Product.cfc:L54] `ormtype="string" unique="true"`.
   *
   * Default `'nike-air-jorden'` - see `LEGACY_PRODUCT_URL_TITLE` for why the
   * misspelling is load-bearing. Pass `undefined` explicitly for the no-title
   * state, in which `getProductURL()` yields `/<urlKey>//`.
   */
  readonly urlTitle?: string | undefined;

  /**
   * [model/entity/Product.cfc:L55] `ormtype="string" notNull="true"`.
   *
   * Default `'Test Product'`, the legacy helper's literal. `notNull` is an ORM
   * constraint the target does not re-declare, and `productName` is `required`
   * on the `save` context in [model/validation/Product.json] where enforcement
   * lives, so passing `undefined` here is a legitimate unsaved state.
   */
  readonly productName?: string | undefined;

  /**
   * [model/entity/Product.cfc:L56] `ormtype="string" unique="true"`.
   *
   * Default `'TESTPRODUCTXXX'`, the legacy helper's literal.
   */
  readonly productCode?: string | undefined;

  /**
   * [model/entity/Product.cfc:L57] `length="4000" hb_formFieldType="wysiwyg"`.
   *
   * Default `PRODUCT_DESCRIPTION`. Plain text, well inside the 4000-character
   * column, and deliberately free of markup so no suite depends on sanitising.
   */
  readonly productDescription?: string | undefined;

  /**
   * [model/entity/Product.cfc:L58] `ormtype="boolean" default="false"`.
   *
   * Default: UNSET, which resolves to `false`. ★ THE ASYMMETRY WITH `activeFlag`
   * IS THE POINT: both accessors answer `false` under the defaults, but the
   * PROVENANCE differs - L58 declares `default="false"` and L53 declares no
   * default at all. The two are modelled identically here only because CFML's
   * own coercion makes them observationally identical; neither is invented.
   */
  readonly publishedFlag?: CfBooleanInput;

  /** [model/entity/Product.cfc:L59] `ormtype="integer"`. Not money. Default `1`. */
  readonly sortOrder?: number | undefined;

  /**
   * [model/entity/Product.cfc:L62] `ormtype="big_decimal"` - MONETARY.
   *
   * Default `Money` from `CALCULATED_SALE_PRICE`. One of the four persisted
   * denormalized cache columns [L62-L65], all four of which are present on this
   * fixture for schema continuity. This is the ONLY one of the four that is
   * money; `calculatedQATS` is a count, `calculatedAllowBackorderFlag` a
   * boolean and `calculatedTitle` a string, and none of those three is wrapped.
   */
  readonly calculatedSalePrice?: Money | undefined;

  /** [model/entity/Product.cfc:L63] `ormtype="integer"`. A quantity, not money. Default `7`. */
  readonly calculatedQATS?: number | undefined;

  /**
   * [model/entity/Product.cfc:L64] `ormtype="boolean"` with NO `default=`.
   *
   * Default `false`, supplied EXPLICITLY. That is observationally identical to
   * leaving it unset, because `getCalculatedAllowBackorderFlag()` resolves
   * through `cfBoolean()` either way, so the explicit value invents nothing - it
   * merely makes the fourth calculated column visibly present in the data bag.
   */
  readonly calculatedAllowBackorderFlag?: CfBooleanInput;

  /**
   * [model/entity/Product.cfc:L65] `ormtype="string"`. The persisted snapshot of
   * `getTitle()`.
   *
   * Default `CALCULATED_TITLE`. It deliberately DIFFERS from `productName` so a
   * suite can prove the snapshot column is read rather than recomputed - the
   * legacy `getTitle()` reached `hibachiUtilityService`, a framework artefact
   * that is deliberately not ported.
   */
  readonly calculatedTitle?: string | undefined;

  /**
   * [model/entity/Product.cfc:L118] `persistent="false"` - the non-column price
   * slot.
   *
   * Default `Money` from `LEGACY_PRODUCT_PRICE`, the legacy helper's `price = 100`
   * expressed as a decimal string. ★ THE SLOT IS NOT DECORATIVE: `getPrice()`
   * [L561-L568] probes it FIRST and only falls through to the default sku
   * second, so supplying it here is what makes a price readable from a product
   * that has no default sku at all.
   */
  readonly price?: Money | undefined;

  /**
   * [model/entity/Product.cfc:L68] `fetch="join"` - EAGER, and NULLABLE via
   * `hb_optionsNullRBKey="define.none"`.
   *
   * Default: a `Brand` built by this factory, so the brand-PRESENT path through
   * `getBrandName()` is the default. Pass `undefined` explicitly for the
   * brand-ABSENT path, which is the state the legacy helper's own data bag
   * produced. Both paths are required to exercise the `getBrandName()` divergence
   * recorded on `makeFixtureBrand`.
   */
  readonly brand?: Brand | undefined;

  /**
   * [model/entity/Product.cfc:L69] `fetch="join"` - EAGER.
   *
   * Default: the CHILD of a two-level chain this factory builds, so
   * `getProductType()?.getParentProductType()` is non-nullish and materialized
   * path membership is provable on an ancestor as well as on self. Pass
   * `undefined` explicitly for the no-type state; the column is nullable even
   * though `productType` is `required` on the `save` context in
   * [model/validation/Product.json].
   */
  readonly productType?: ProductType | undefined;

  /**
   * [model/entity/Product.cfc:L70] `fetch="join" cascade="delete"` - EAGER and
   * NULLABLE.
   *
   * Default: ABSENT, and that default is chosen deliberately. Its absence is
   * what every lazy-load probe in the price cluster tests, and it is what puts
   * the returned product on branch 3 of `getSalePrice()` and on the `undefined`
   * answer of `getCurrentAccountPrice()` without any override at all. Supply one
   * for branch 1. NO SKU IS CONSTRUCTED HERE - see the file banner.
   */
  readonly defaultSku?: Sku | undefined;

  /**
   * [model/entity/Product.cfc:L73] `cascade="all-delete-orphan" inverse="true"`.
   *
   * ★ DEFAULT `[]`, AND THIS IS THE CYCLE-BREAKING RULE OF THE WHOLE MODULE. See
   * the file banner. A FRESH array is created on every call and handed to the
   * product, which then owns it: the unflagged `getSkus()` returns that very
   * array by reference [model/entity/Product.cfc:L157], so two graphs must never
   * share one instance.
   *
   * CFML parity [model/entity/Product.cfc:L73]: the source spells
   * `singularname="Sku"` with a CAPITAL S - the generated helpers are therefore
   * `addSku`/`removeSku`, and the port declares them with exactly that casing.
   * The capitalisation is an artefact, not a convention; it is annotated rather
   * than normalised, because the generated names are part of the parity contract.
   *
   * JUDGMENT CALL: supplying a sku here from a sibling fixture is the caller's
   * job, never this module's. Importing `skuFixtures` would close the
   * product/sku cycle the `[]` default exists to break.
   */
  readonly skus?: Sku[] | undefined;

  /**
   * [model/entity/Product.cfc:L80] many-to-many through `SwProductCategory`.
   *
   * Default `[]`. Read by `getCategoryIDs()`, and `Category` IS in scope - but no
   * `Category` is constructed here: it is a read-mostly leaf whose
   * `cmsCategoryID` column (index `RI_CMSCATEGORYID`) and `site` association
   * survive purely as inert persisted columns for schema continuity, with the
   * Mura CMS bridge out of scope and therefore no behaviour to exercise. There is
   * also no `Category.json`, so no validation schema is invented for it. `Product.cfc`
   * declares no `addCategory`/`removeCategory` helpers either, so the collection
   * is populated only at construction.
   */
  readonly categories?: readonly Category[] | undefined;

  /**
   * [model/entity/Product.cfc:L81] self-referential many-to-many over
   * `SwRelatedProduct`.
   *
   * Default `[]`. Nothing in the in-scope slice reads it and no helper on either
   * side mutates it; it is preserved for schema continuity alone.
   */
  readonly relatedProducts?: readonly Product[] | undefined;

  /** [model/entity/Product.cfc:L84] `SwPromoRewardProduct`. Default `[]`, fresh per call. */
  readonly promotionRewards?: PromotionRewardRef[] | undefined;

  /** [model/entity/Product.cfc:L85] `SwPromoRewardExclProduct`. Default `[]`, fresh per call. */
  readonly promotionRewardExclusions?: PromotionRewardRef[] | undefined;

  /** [model/entity/Product.cfc:L86] `SwPromoQualProduct`. Default `[]`, fresh per call. */
  readonly promotionQualifiers?: PromotionQualifierRef[] | undefined;

  /** [model/entity/Product.cfc:L87] `SwPromoQualExclProduct`. Default `[]`, fresh per call. */
  readonly promotionQualifierExclusions?: PromotionQualifierRef[] | undefined;

  /**
   * [model/entity/Product.cfc:L88] `SwPriceGroupRateProduct`. Default `[]`, fresh
   * per call.
   *
   * See `PriceGroupRateRef` for the verified finding that `Product` carries no
   * exclusion mirror for this association while `ProductType` carries both sides.
   */
  readonly priceGroupRates?: PriceGroupRateRef[] | undefined;

  /**
   * The option groups reachable through this product's skus' options.
   *
   * Default `[]`, and that is a fidelity decision rather than a convenience.
   * [model/entity/Product.cfc:L251-L261] resolves this with a framework smart
   * list - DISTINCT, filtered on `options.skus.product.productID` - so for a
   * product whose `skus` is empty the query NECESSARILY returns zero rows.
   * "Materialized as empty" is therefore the ACCURATE hydration for the default
   * shape, not an assertion this factory has no grounds to make.
   *
   * ★ THE "NEVER MATERIALIZED" STATE REMAINS REACHABLE, and it matters: the port
   * refuses `getOptionGroups()` outright when the slot is unset, precisely so that
   * an unfetched association cannot silently satisfy the `minCollection` rules in
   * [model/validation/Product.json] that read through this value. Write the key as
   * `undefined` to ask for that state and exercise the refusal. A caller that
   * supplies `skus` should supply the matching option groups too, exactly as the
   * repository would have.
   */
  readonly optionGroups?: readonly OptionGroup[] | undefined;

  /**
   * Sale-price details keyed by `skuID`, already reduced and already rounded.
   *
   * Default: UNSET. Absent means "not supplied", and `getSkuSalePriceDetails`
   * then reproduces the legacy empty answer for a miss
   * [model/entity/Product.cfc:L186] rather than guessing.
   */
  readonly salePriceDetailsForSkus?: SalePriceDetailsMap | undefined;

  /**
   * `max(SwOptionGroup.sortOrder) + 1` across ALL option groups - a GLOBAL
   * aggregate [model/dao/SkuDAO.cfc:L204-L220], not derivable from one product's
   * graph.
   *
   * Default `NEXT_OPTION_GROUP_SORT_ORDER`, supplied so that the sorted
   * `getSkus(true)` path can actually compute its positional weighting once a
   * caller hands in skus. Pass `undefined` explicitly to reach the honest
   * unsorted-projection answer the port gives when the radix is unknown.
   *
   * LEGACY-NOTE [model/dao/SkuDAO.cfc:L222-L226]: the legacy cached this on the
   *   DAO component and its `clearNextOptionGroupSortOrder` guard is INVERTED -
   *   it deletes the key only when the key does not exist - so the cache could
   *   never be cleared. On a warm container a component-level cache becomes
   *   cross-invocation state, which is why it arrives here as per-instance data
   *   and why nothing in this module holds it at module scope. The inverted guard
   *   belongs to the repository tier, not to this fixture.
   */
  readonly nextOptionGroupSortOrder?: number | undefined;

  /** [model/entity/Product.cfc:L93] `ormtype="string"`. Default `REMOTE_ID`. */
  readonly remoteID?: string | undefined;

  /**
   * [model/entity/Brand.cfc:L56] the brand's common name.
   *
   * Default `BRAND_NAME`. Shapes the brand this factory builds and is ignored
   * when a whole `brand` is supplied. Pass `undefined` explicitly for a brand
   * with no name, which is a distinct and interesting path: the port's
   * `getBrandName()` answers the empty string for a PRESENT brand whose own name
   * is absent, and that must stay distinguishable from an absent brand.
   */
  readonly brandName?: string | undefined;

  /**
   * The value the settings double answers for `globalURLKeyProduct`.
   *
   * Default `'sp'`, the verified legacy default at
   * [model/service/SettingService.cfc:L178]. Ignored when a whole
   * `settingsProvider` is supplied.
   */
  readonly globalURLKeyProduct?: string | undefined;

  /**
   * The candidate skus the sku-repository double matches against.
   *
   * Default `[]`. These are the rows the legacy statement would have had in hand
   * after its `SwSku.productID = ?` restriction; the double then applies the
   * option predicate to them. Ignored when a whole `skuRepository` is supplied.
   */
  readonly selectedOptionsCandidateSkus?: readonly Sku[] | undefined;

  /**
   * Resolves the four published settings keys.
   *
   * Default: the hand-written double from `makeFixtureSettingsProvider`. It MUST
   * be supplied by default, because `getProductURL()` and
   * `getListingProductURL()` refuse outright without it and those two methods
   * carry the one legacy-extended assertion in the entity layer. Pass `undefined`
   * explicitly to exercise that refusal.
   */
  readonly settingsProvider?: SettingsProvider | undefined;

  /**
   * Discharges the [model/entity/Product.cfc:L367] and [L626] reaches.
   *
   * Default: the hand-written double from `makeFixtureSkuRepository`, whose
   * `getSkusBySelectedOptions` reproduces the AND-of-EXISTS matching semantics.
   * Pass your own to observe delegation; pass `undefined` to exercise the refusal.
   */
  readonly skuRepository?: SkuRepository | undefined;

  /**
   * Discharges the [model/entity/Product.cfc:L637] and [L644] reaches.
   *
   * Default: the hand-written double from `makeFixtureOptionRepository`.
   */
  readonly optionRepository?: OptionRepository | undefined;

  /**
   * Discharges the one ported attribute path,
   * `getAttributeSets` [model/entity/Product.cfc:L832-L838].
   *
   * Default: the hand-written double from `makeFixtureProductRepository`.
   */
  readonly productRepository?: ProductRepository | undefined;
}

// ---------------------------------------------------------------------------
// Documented defaults
//
// Immutable primitives only. No array, no object, no `Date` and no `Money`
// instance lives at module scope: those are all built inside the factory so that
// nothing is ever shared between two graphs. On a warm container module state
// survives between unrelated requests, which is exactly the hazard the four
// legacy component-level caches demonstrate, so this module holds none.
// ---------------------------------------------------------------------------

/** Seeds every derived identifier. */
const DEFAULT_ID_PREFIX = 'prfx';

/**
 * [meta/tests/unit/Helper.cfc:L54] `productName = "Test Product"`, verbatim.
 */
const LEGACY_PRODUCT_NAME = 'Test Product';

/**
 * [meta/tests/unit/Helper.cfc:L56] `productCode = "TESTPRODUCTXXX"`, verbatim.
 */
const LEGACY_PRODUCT_CODE = 'TESTPRODUCTXXX';

/**
 * [meta/tests/unit/Helper.cfc:L55] `price = 100`, expressed as a decimal string.
 *
 * ★ NEVER THE NUMERIC LITERAL `100`. All money in the target flows through
 * `Money`, which is constructed from a decimal string and is the single
 * arithmetic surface; a JavaScript `number` would reintroduce the IEEE-754 drift
 * the value object exists to eliminate. Two decimal places are written
 * explicitly so the presented form is unambiguous.
 */
const LEGACY_PRODUCT_PRICE = '100.00';

/**
 * [meta/tests/unit/entity/ProductTest.cfc:L59] `setURLTitle("nike-air-jorden")`.
 *
 * CFML parity [meta/tests/unit/entity/ProductTest.cfc:L59, L61]: THE MISSPELLING
 * OF "jordan" IS VERBATIM AND MUST NOT BE CORRECTED. [L61] asserts that
 * `getProductURL()` equals `/#setting('globalURLKeyProduct')#/nike-air-jorden/`
 * - with BOTH a leading and a trailing slash - and this is the ONE entity method
 * in the entire in-scope slice that carries legacy test coverage, in one of only
 * two legacy-extended suites in the whole migration. The value is a data
 * contract, so the spelling and the slashes are both preserved exactly.
 */
const LEGACY_PRODUCT_URL_TITLE = 'nike-air-jorden';

/**
 * [meta/tests/unit/Helper.cfc:L57] `productType = { productTypeID =
 * "444df2f7ea9c87e60051f3cd87b435a1" }`.
 *
 * An OPAQUE 32-character legacy hash, carried over verbatim. Nothing in the
 * target parses, derives, validates or regenerates it, and nothing depends on
 * its internal structure. It is an identifier, not a credential.
 */
const LEGACY_MERCHANDISE_PRODUCT_TYPE_ID = '444df2f7ea9c87e60051f3cd87b435a1';

/**
 * The verified legacy default of `globalURLKeyProduct`
 * [model/service/SettingService.cfc:L178] - `{fieldType="text",defaultValue="sp"}`.
 *
 * It is answered by the settings DOUBLE and never spliced into a URL literal
 * anywhere: `getProductURL()` reads it through the port, so under these defaults
 * the legacy assertion resolves to `/sp/nike-air-jorden/`. The port's own
 * documentation already publishes this default, so naming it here introduces no
 * new source of truth.
 */
const GLOBAL_URL_KEY_PRODUCT = 'sp';

/**
 * The verified legacy default of `globalURLKeyProductType`
 * [model/service/SettingService.cfc:L179].
 */
const GLOBAL_URL_KEY_PRODUCT_TYPE = 'spt';

/**
 * The verified legacy default of `skuCurrency`
 * [model/service/SettingService.cfc:L221] - `defaultValue="USD"`.
 */
const SKU_CURRENCY = 'USD';

/**
 * What the double answers for `skuEligibleCurrencies`.
 *
 * CFML parity [model/service/SettingService.cfc:L222]: this key's legacy default
 * is NOT a literal - it is `getCurrencyService().getAllActiveCurrencyIDList()`,
 * computed at runtime from the active-currency table. There is therefore no
 * static default to transcribe, so the double answers a single-currency list
 * matching `SKU_CURRENCY`. That is the eligibility gate's OPEN state, which
 * matters: were the key to resolve empty, the SKU currency cascade would produce
 * an empty map and every currency accessor would answer nothing.
 */
const SKU_ELIGIBLE_CURRENCIES = SKU_CURRENCY;

/** Plain text, well inside the 4000-character column at [model/entity/Product.cfc:L57]. */
const PRODUCT_DESCRIPTION = 'A deterministic merchandise product used by the unit tier.';

/**
 * [model/entity/Product.cfc:L65] the persisted snapshot column.
 *
 * Deliberately DIFFERENT from `LEGACY_PRODUCT_NAME`, so a suite can prove the
 * column is read rather than recomputed from the name.
 */
const CALCULATED_TITLE = 'Test Product (calculated title snapshot)';

/**
 * [model/entity/Product.cfc:L62] `ormtype="big_decimal"`, as a decimal string.
 *
 * JUDGMENT CALL: the figure is the extended price of the project's pre-verified
 * reference calculation - a unit price of 19.99 at quantity 3 - so a suite
 * pinning that arithmetic can start from a fixture value instead of a bare
 * literal. The remaining steps of that calculation (a 12.5 per cent discount
 * yielding 7.49625, a net of 52.47375, presented as "52.47") are pinned in the
 * `Money` suite where they belong and are deliberately NOT duplicated here as a
 * second source of truth.
 */
const CALCULATED_SALE_PRICE = '59.97';

/** [model/entity/Product.cfc:L63] a quantity count, never money. */
const CALCULATED_QATS = 7;

/** [model/entity/Product.cfc:L59] `ormtype="integer"`, never money. */
const SORT_ORDER = 1;

/** [model/entity/Product.cfc:L93] the remote-system correlation id. */
const REMOTE_ID = 'remote-test-product';

/**
 * The global option-group radix [model/dao/SkuDAO.cfc:L204-L220].
 *
 * Seeded high enough that a two-group product weights cleanly, and supplied so
 * the sorted `getSkus(true)` path is computable rather than silently degrading.
 */
const NEXT_OPTION_GROUP_SORT_ORDER = 3;

/** [model/entity/Brand.cfc:L56] the brand's common name. */
const BRAND_NAME = 'Test Brand';

/** [model/entity/Brand.cfc:L55] `unique="true"`, used in URL strings. */
const BRAND_URL_TITLE = 'test-brand';

/** [model/entity/ProductType.cfc:L57] the child type's display name. */
const CHILD_PRODUCT_TYPE_NAME = 'Merchandise';

/** [model/entity/ProductType.cfc:L57] the root type's display name. */
const PARENT_PRODUCT_TYPE_NAME = 'Product';

/** [model/entity/ProductType.cfc:L59] `systemCode` on the child type. */
const CHILD_PRODUCT_TYPE_SYSTEM_CODE = 'merchandise';

/** [model/entity/ProductType.cfc:L59] `systemCode` on the root type. */
const PARENT_PRODUCT_TYPE_SYSTEM_CODE = 'product';

/**
 * Audit timestamps, as explicit UTC ISO-8601 literals.
 *
 * No clock is read anywhere in this module: the runner pins the process timezone
 * to UTC, and a relative date would make an assertion depend on the day it ran.
 * The two values match the sibling price-group fixture so that a suite combining
 * both graphs sees one coherent timeline.
 */
const CREATED_DATE_TIME_UTC = '2024-06-01T00:00:00.000Z';
const MODIFIED_DATE_TIME_UTC = '2024-06-15T12:30:00.000Z';

// ---------------------------------------------------------------------------
// Override resolution
// ---------------------------------------------------------------------------

/**
 * Reads one override, distinguishing an OMITTED key from a key present with the
 * value `undefined`.
 *
 * ★ WHY THIS EXISTS RATHER THAN `overrides?.key ?? documentedDefault`. Several
 * members of this factory are supplied BY DEFAULT and yet have a meaningful
 * absent state - `brand`, `productType`, `urlTitle` and all four collaborator
 * ports. With `??`, a caller could never reach that absent state, because an
 * explicit `undefined` would be silently replaced by the default. `Object.hasOwn`
 * separates the two intents exactly: omit the key to accept the documented
 * default, write the key as `undefined` to ask for absence.
 *
 * `??` is still the right operator for a member whose default is simply a value
 * and whose absent state carries no distinct meaning, and it is used directly at
 * those sites rather than routed through here.
 */
function resolveOverride<TKey extends keyof ProductFixtureOverrides>(
  overrides: ProductFixtureOverrides | undefined,
  key: TKey,
  documentedDefault: ProductFixtureOverrides[TKey],
): ProductFixtureOverrides[TKey] {
  if (hasOverride(overrides, key)) {
    return overrides?.[key];
  }
  return documentedDefault;
}

/**
 * Was `key` written by the caller at all, whatever value it carries?
 *
 * The companion to `resolveOverride`, used at the four sites whose default has to
 * be CONSTRUCTED rather than named - the brand, the product-type chain and the
 * collaborator doubles. Building those eagerly just to discard them would create
 * objects no graph ever owns, so the presence test is separated from the read.
 */
function hasOverride(
  overrides: ProductFixtureOverrides | undefined,
  key: keyof ProductFixtureOverrides,
): boolean {
  return overrides !== undefined && Object.hasOwn(overrides, key);
}

// ---------------------------------------------------------------------------
// Module-scope pure builders
//
// Functions, never data. Each returns a FRESHLY constructed value on every call,
// so no array, no object, no `Date` and no double is ever shared between two
// graphs. This is what lets a suite prove that a second, independent invocation
// does not observe the first invocation's memo - the property the port needs
// because a warm container keeps module state alive between unrelated requests,
// and the reason every legacy component-level cache became per-request state.
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
 * [model/entity/Product.cfc:L97, L99], an entity that is out of scope, so the
 * columns survive as inert identifiers and no `Account` is constructed.
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
 * A hand-written in-memory stand-in for the settings port.
 *
 * CFML parity [model/entity/Product.cfc:L208, L212]: the legacy read
 * `setting('globalURLKeyProduct')` through the framework's ambient settings
 * mechanism. The port replaces that with a constructor-injected collaborator, so
 * every product that must answer a URL needs one supplied - the accessors refuse
 * outright rather than degrading when it is absent.
 *
 * All FOUR published keys are answered, not just the one this entity reads, so
 * the double satisfies the port's total contract: `setting` is declared to return
 * `string` and never `undefined`, and a partial table would make that a lie. The
 * lookup is therefore exhaustive over the key union and the compiler checks it.
 *
 * NO MOCKING LIBRARY, and none may be added: the dependency set is fixed at its
 * exact pins, and a double answering a table of four values is the entire
 * requirement. The legacy suite managed without one too.
 *
 * JUDGMENT CALL: the double records nothing. A recorded call list would not be
 * observable through the `Product` this factory returns, and a suite that must
 * observe delegation supplies its own port through `overrides.settingsProvider`
 * - which is strictly more expressive than a recorder baked in here.
 */
function makeFixtureSettingsProvider(globalURLKeyProduct: string): SettingsProvider {
  const table: Readonly<Record<SettingKey, string>> = {
    globalURLKeyProduct,
    globalURLKeyProductType: GLOBAL_URL_KEY_PRODUCT_TYPE,
    skuCurrency: SKU_CURRENCY,
    skuEligibleCurrencies: SKU_ELIGIBLE_CURRENCIES,
  };

  return {
    setting(settingName: SettingKey): string {
      return table[settingName];
    },
  };
}

/**
 * Does one candidate sku carry the option named by `selectedOptionID`?
 *
 * CFML parity [model/dao/SkuDAO.cfc:L107-L128]: the legacy predicate is an
 * `EXISTS` subquery whose comparison is `SwOption.optionID` against a
 * `cfqueryparam` value. MySQL's default collation is case-INSENSITIVE, so that
 * comparison ignored case, and TypeScript's `===` does not. The comparison is
 * therefore audited rather than assumed and is performed case-insensitively here,
 * which is the faithful reading. Identifiers are opaque hashes in practice, so
 * this changes no realistic outcome - it removes a silent divergence.
 */
function skuCarriesOptionID(candidate: Sku, selectedOptionID: string): boolean {
  const wanted: string = selectedOptionID.toLowerCase();

  return candidate
    .getOptions()
    .some((option: Option): boolean => option.getOptionID().toLowerCase() === wanted);
}

/**
 * A hand-written in-memory stand-in for the sku repository port.
 *
 * ★ `getSkusBySelectedOptions` IS THE FIXTURE SIDE OF A MUST-PRESERVE BEHAVIOUR.
 * [model/dao/SkuDAO.cfc:L107-L128] matches with an AND-OF-EXISTS: one `EXISTS`
 * subquery per selected option, all conjoined, so a sku qualifies only when it
 * carries EVERY selected option. An OR-of-EXISTS, or a "matches at least one"
 * reading, would return a superset and would silently change which sku a
 * shopper's option selection resolves to. The double reproduces the conjunction
 * exactly, over the candidates the caller supplies.
 *
 * CFML parity [model/dao/SkuDAO.cfc:L107-L128]: with an EMPTY option list the
 * statement carries no `EXISTS` clause at all and returns every sku of the
 * product. The conjunction over an empty set is vacuously true, so the double
 * reproduces that outcome by construction rather than by a special case.
 *
 * The `productID` argument is observed and deliberately not re-applied: the
 * legacy restriction is a `SwSku.productID` predicate in SQL, and this double is
 * handed only the rows that predicate would already have selected. Scoping is
 * therefore honoured by construction, and inventing a second filter over
 * fixtures that may legitimately carry no product back-reference would drop rows
 * the real statement returns.
 *
 * The seven remaining members answer their declared types without inventing
 * behaviour a double cannot have: an empty projection, a nothing-found
 * `undefined`, the argument handed straight back for a save and the collection
 * handed straight back for a batch save, and `false` for the transaction probe. A
 * suite that must observe repository behaviour supplies its own port through
 * `overrides.skuRepository`.
 */
function makeFixtureSkuRepository(candidateSkus: readonly Sku[]): SkuRepository {
  // A defensive snapshot taken here, inside the call. The caller keeps ownership
  // of its own array and a later mutation of it cannot reach into this graph.
  const candidates: readonly Sku[] = [...candidateSkus];

  return {
    getTransactionExistsFlag(productID?: string, skuID?: string): Promise<boolean> {
      void productID;
      void skuID;

      // [model/dao/SkuDAO.cfc:L53] counts order-item rows. Nothing was persisted,
      // so no transaction can exist, and `false` is the honest answer rather than
      // a convenient one - it is also what unblocks the delete guards that read it.
      return Promise.resolve(false);
    },

    getSkuBySkuCode(skuCode: string): Promise<Sku | undefined> {
      const wanted: string = skuCode.toLowerCase();
      // Case-insensitive for the same collation reason recorded on
      // `skuCarriesOptionID`; the legacy compares `SwSku.skuCode` in SQL.
      return Promise.resolve(
        candidates.find(
          (candidate: Sku): boolean => (candidate.getSkuCode() ?? '').toLowerCase() === wanted,
        ),
      );
    },

    getSkusBySelectedOptions(selectedOptions: string, productID?: string): Promise<Sku[]> {
      void productID;

      const selectedOptionIDs: readonly string[] = listToArray(selectedOptions);

      return Promise.resolve(
        candidates.filter((candidate: Sku): boolean =>
          selectedOptionIDs.every((selectedOptionID: string): boolean =>
            skuCarriesOptionID(candidate, selectedOptionID),
          ),
        ),
      );
    },

    searchSkusByProductType(term?: string, productTypeID?: string): Promise<Sku[]> {
      void term;
      void productTypeID;

      return Promise.resolve([]);
    },

    getProductSkus(product: Product, fetchOptions: boolean): Promise<Sku[]> {
      void fetchOptions;

      // The unflagged accessor returns the product's own live array; this
      // projection is a NEW array, matching [model/entity/Product.cfc:L159],
      // which returns the service's result rather than the field.
      return Promise.resolve([...product.getSkus()]);
    },

    getSortedProductSkusID(productID: string): Promise<string[]> {
      void productID;

      return Promise.resolve(candidates.map((candidate: Sku): string => candidate.getSkuID()));
    },

    saveSku(sku: Sku): Promise<Sku> {
      // No persistence: the instance is handed straight back, which is the only
      // part of the legacy save a fixture can honour without a database.
      return Promise.resolve(sku);
    },

    saveSkus(skus: readonly Sku[]): Promise<Sku[]> {
      // The collection form, answering in the arrival order the port specifies. No
      // transaction and therefore no atomicity to demonstrate - that is asserted
      // against the recording executor in the adapter's own suite, not here.
      return Promise.resolve([...skus]);
    },
  };
}

/**
 * A hand-written in-memory stand-in for the option repository port.
 *
 * CFML parity [model/dao/OptionDAO.cfc:L51-L117]: both queries answer what the
 * product does NOT already carry - the first matched with `IN` over the existing
 * group list, the second with `NOT IN`, which is the opposite direction. An empty
 * projection is therefore a genuine legacy answer, not a placeholder: it is
 * exactly what the statements return once the product already carries every
 * option and every group. Nothing is invented, and no `SwOption` table is
 * simulated.
 */
function makeFixtureOptionRepository(): OptionRepository {
  return {
    getUnusedProductOptions(
      productID: string,
      existingOptionGroupIDList: string,
    ): Promise<readonly SelectOption[]> {
      void productID;
      void existingOptionGroupIDList;

      return Promise.resolve([]);
    },

    getUnusedProductOptionGroups(
      existingOptionGroupIDList: string,
    ): Promise<readonly SelectOption[]> {
      void existingOptionGroupIDList;

      return Promise.resolve([]);
    },
  };
}

/**
 * A hand-written in-memory stand-in for the product repository port.
 *
 * Only ONE attribute path is ported - `getAttributeSets`
 * [model/entity/Product.cfc:L832-L838], backed by [model/dao/ProductDAO.cfc:L52]
 * - and the wider EAV read path is out of scope, so an empty projection is the
 * whole of what this double owes there.
 *
 * ★ `loadDataFromFile` REFUSES, AND THAT IS DELIBERATE. The legacy bulk import
 * [model/service/ProductService.cfc:L65-L68] raises its own request timeout to
 * one hour, and it is one of the out-of-scope methods that merely happen to live
 * inside an in-scope file. It is therefore NOT ported, and a fixture that
 * silently answered it would invite a suite to depend on behaviour that does not
 * exist. Refusing names the omission at the moment it is reached. The one-hour
 * figure is recorded here as a source fact about the legacy runtime and is not a
 * service level of any kind.
 */
function makeFixtureProductRepository(): ProductRepository {
  return {
    getAttributeSets(
      attributeSetTypeCode: readonly string[],
      productTypeIDs: readonly string[],
    ): Promise<AttributeSetSummary[]> {
      void attributeSetTypeCode;
      void productTypeIDs;

      return Promise.resolve([]);
    },

    loadDataFromFile(fileURL: string, textQualifier?: string): Promise<void> {
      void fileURL;
      void textQualifier;

      return Promise.reject(
        new Error(
          'productFixtures: loadDataFromFile is deliberately not available. The legacy bulk ' +
            'import [model/service/ProductService.cfc:L65-L68] is out of scope for this slice, ' +
            'so no fixture answers it. Supply your own productRepository through overrides if a ' +
            'suite genuinely needs to observe this call.',
        ),
      );
    },

    searchProductsByProductType(term?: string, productTypeIDs?: string): Promise<Product[]> {
      void term;
      void productTypeIDs;

      return Promise.resolve([]);
    },

    getProductByProductID(productID: string): Promise<Product | undefined> {
      void productID;

      // The double holds no store, so nothing can be found by identity. A suite
      // that needs a lookup to succeed supplies its own port.
      return Promise.resolve(undefined);
    },

    saveProduct(product: Product): Promise<Product> {
      // Nothing is persisted and nothing is flushed - the two mechanisms the
      // legacy helper used and this fixture drops. The instance comes straight
      // back, which is the observable part of a save a fixture can honour.
      return Promise.resolve(product);
    },

    deleteProduct(product: Product): Promise<boolean> {
      void product;

      // Nothing was persisted, so nothing can be deleted, and the port declares a
      // `boolean`. `false` is the answer that claims least.
      return Promise.resolve(false);
    },

    // NO `saveBrand` MEMBER, BECAUSE THE PORT PUBLISHES NONE. Its member set is
    // locked at six, and `src/domain/ports/productRepository.ts` records why the
    // brand write was removed rather than relocated: there is no `BrandDAO.cfc` in
    // the legacy repository, `super.save`
    // [model/service/BrandService.cfc:L76] is generic Hibachi CRUD that AAP 0.5.3
    // does not carry forward, and the port inventory is locked at thirteen so no
    // `BrandRepository` is available either. `BrandService.saveBrand` resolves the
    // unique URL title and answers the brand; the durable half belongs to the
    // composition root.
  };
}

// ---------------------------------------------------------------------------
// The materialized product-type path
// ---------------------------------------------------------------------------

/**
 * One link of the identifier chain the path builder walks.
 *
 * JUDGMENT CALL: the path is built over this tiny local shape rather than over
 * the `ProductType` instances themselves, because a product type needs its path
 * at construction and cannot supply its own parent chain before it exists. The
 * shape carries exactly the two things the builder reads, so the value handed to
 * the constructor is produced by the DOMAIN's own algorithm rather than by ad-hoc
 * string concatenation in a test folder - which is the whole reason the helper is
 * a published unit.
 */
type IdPathNode = {
  readonly productTypeID: string;
  readonly parent: IdPathNode | undefined;
};

/** The primary-id accessor the path builder requires. */
function readIdPathNodeID(node: IdPathNode): string {
  return node.productTypeID;
}

/** The parent accessor the path builder requires. */
function readIdPathNodeParent(node: IdPathNode): IdPathNode | undefined {
  return node.parent;
}

// ---------------------------------------------------------------------------
// Entity builders
// ---------------------------------------------------------------------------

/**
 * Builds the eagerly-joined brand [model/entity/Product.cfc:L68].
 *
 * ★ `products` IS LEFT EMPTY, AND THAT IS TEST-ASSERTED RATHER THAN INCIDENTAL.
 * [meta/tests/unit/entity/BrandTest.cfc:L58-L60] `defaults_are_correct()` asserts
 * that `getProducts()` equals an empty array, and the brand suite is the
 * SECOND of only two legacy-extended suites in the whole migration, so that
 * assertion must stay expressible against a brand this factory produced. The
 * bidirectional back-link is therefore NOT pre-populated here; a suite that wants
 * it calls `product.setBrand(brand)` or `brand.addProduct(product)`, both of
 * which exist for interface parity and both of which push into the live array.
 *
 * `brandID` defaults to `''` so that `isNew()` and the inherited
 * `!len(getPrimaryIDValue())` assertion
 * [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67] are honest for an
 * unsaved row. That mirrors `unsavedvalue="" default=""` at
 * [model/entity/Brand.cfc:L52]; no fake UUID is invented.
 *
 * CFML parity [model/entity/Brand.cfc:L53-L54]: NEITHER `activeFlag` NOR
 * `publishedFlag` declares a `default=`, so both are left unset and both
 * accessors answer `false` through `cfBoolean()` - the CFML answer for an
 * undefaulted flag, not an invented `true`.
 *
 * CFML parity [model/entity/Brand.cfc:L90-L103]: the source's own helpers are
 * asymmetric in two ways worth recording, and neither is normalised here.
 * `addAttributeValue` calls `setBrand` while `removeAttributeValue` calls
 * `removeBrand` [L90-L95]; and `addProduct` calls
 * `arguments.product.setBrand(this)` while `removeProduct` calls
 * `arguments.Product.removeBrand(this)` [L98-L103] - with a CAPITALISED `Product`
 * argument reference that works only because CFML is case-insensitive.
 * TypeScript is not, so the port declares exactly one casing per name and this
 * fixture uses the port's spelling verbatim.
 *
 * CFML parity [model/entity/Brand.cfc:L57]: `brandWebsite` carries
 * `hb_formatType="url"`, which is presentation metadata on a plain string. It is
 * deliberately LEFT UNSET: a fixture must contain no hostname and no network
 * target, and nothing here would ever fetch it.
 */
function makeFixtureBrand(idPrefix: string, brandName: string | undefined): Brand {
  const audit: AuditTrail = makeAuditTrail(idPrefix);

  return new Brand({
    brandID: '',
    activeFlag: undefined,
    publishedFlag: undefined,
    urlTitle: BRAND_URL_TITLE,
    brandName,
    brandWebsite: undefined,
    products: [],
    promotionRewards: [],
    promotionRewardExclusions: [],
    promotionQualifiers: [],
    promotionQualifierExclusions: [],
    remoteID: `${idPrefix}-brand`,
    createdDateTime: audit.createdDateTime,
    createdByAccountID: audit.createdByAccountID,
    modifiedDateTime: audit.modifiedDateTime,
    modifiedByAccountID: audit.modifiedByAccountID,
  });
}

/**
 * Builds a two-level product-type chain and returns its CHILD.
 *
 * The parent is reachable as `child.getParentProductType()` and the child as the
 * parent's only `getChildProductTypes()` entry, so a suite can prove that
 * materialized-path membership matches on an ANCESTOR as well as on self - which
 * is what the promotion engine's path walk actually does
 * [model/service/PromotionService.cfc:L864-L869].
 *
 * The chain is wired with the entity's OWN bidirectional helper,
 * `addChildProductType`, rather than by assigning both sides by hand: it sets the
 * child's parent and pushes the child into the parent's live collection exactly
 * once, and using it keeps the fixture honest about the interface it is meant to
 * exercise.
 *
 * CFML parity [model/entity/ProductType.cfc:L53]: `productTypeIDPath` is the
 * materialized path the promotion engine walks, `length="4000"`. Both paths are
 * built EAGERLY here with the domain's own comma-list builder, so the values are
 * root-first, self-last, include self, and are never empty - the root's path is
 * its own id alone and the child's is `<parentID>,<childID>`. The entity ALSO
 * supports the lazy route, rebuilding from the parent chain when the column
 * arrives nullish; a suite wanting that route supplies its own product type
 * through `overrides.productType` with the column set to `null`.
 *
 * CFML parity [model/entity/ProductType.cfc:L54-L55]: NEITHER flag declares a
 * `default=` here - unlike `Product.publishedFlag`, which does
 * [model/entity/Product.cfc:L58]. Both are therefore left unset on both types,
 * and that asymmetry between the two components is modelled rather than smoothed.
 *
 * CFML parity [model/entity/ProductType.cfc:L66]: `products` is declared
 * `lazy="extra"` - a Hibernate extra-lazy collection that could answer `size()`
 * without materialising its rows. There is no ORM in the target, so the
 * association is a plain materialized array and the extra-laziness is
 * DELIBERATELY NOT SIMULATED; it defaults to `[]`, and the back-link to this
 * graph's product is left for a suite to establish with `addProduct`, exactly as
 * on the brand.
 *
 * CFML parity [model/entity/ProductType.cfc:L74-L75]: this component carries BOTH
 * price-group-rate sides - the inclusion through `SwPriceGroupRateProductType`
 * and the exclusion through `SwPriceGrpRateExclProductType`. `Product.cfc:L88`
 * carries only the inclusion side. Both collections are present here and both
 * default to `[]`, so the contrast is visible from the fixture.
 *
 * CFML parity [model/entity/ProductType.cfc:L101-L105]: `setProducts()` clears
 * `variables.Products` with a CAPITAL P while the property is declared lowercase
 * `products` at L66. That worked only because CFML struct keys are
 * case-insensitive; TypeScript is not, so exactly the casing the port declares is
 * used here and the trap is annotated rather than reproduced.
 *
 * CFML parity [model/entity/ProductType.cfc:L92-L99]: the source's
 * `getInheritedAttributeSetAssignments()` carries a legacy `// Todo get by all
 * the parent productTypeIDs` at L93 and then fetches EVERY attribute-set
 * assignment without filtering by product type at all. Known source TODOs are
 * carried over as flagged TODOs and never silently completed - and this one needs
 * no carrying here, because attribute sets are out of scope for this slice and
 * the port does not surface that method at all. It is recorded so a reviewer can
 * see the omission was decided rather than missed.
 */
function makeFixtureProductTypeChain(idPrefix: string): ProductType {
  const audit: AuditTrail = makeAuditTrail(idPrefix);

  const parentProductTypeID = `${idPrefix}-producttype-parent`;
  const childProductTypeID = LEGACY_MERCHANDISE_PRODUCT_TYPE_ID;

  const parentIdPathNode: IdPathNode = {
    productTypeID: parentProductTypeID,
    parent: undefined,
  };
  const childIdPathNode: IdPathNode = {
    productTypeID: childProductTypeID,
    parent: parentIdPathNode,
  };

  const parentProductTypeIDPath: string = buildIdPathList(
    parentIdPathNode,
    readIdPathNodeID,
    readIdPathNodeParent,
  );
  const childProductTypeIDPath: string = buildIdPathList(
    childIdPathNode,
    readIdPathNodeID,
    readIdPathNodeParent,
  );

  const parentProductType = new ProductType({
    productTypeID: parentProductTypeID,
    productTypeIDPath: parentProductTypeIDPath,
    activeFlag: undefined,
    publishedFlag: undefined,
    urlTitle: 'product',
    productTypeName: PARENT_PRODUCT_TYPE_NAME,
    productTypeDescription: 'The root product type of the fixture chain.',
    systemCode: PARENT_PRODUCT_TYPE_SYSTEM_CODE,
    parentProductType: undefined,
    childProductTypes: [],
    products: [],
    promotionRewards: [],
    promotionRewardExclusions: [],
    promotionQualifiers: [],
    promotionQualifierExclusions: [],
    priceGroupRates: [],
    priceGroupRateExclusions: [],
    remoteID: `${idPrefix}-producttype-parent-remote`,
    createdDateTime: audit.createdDateTime,
    createdByAccountID: audit.createdByAccountID,
    modifiedDateTime: audit.modifiedDateTime,
    modifiedByAccountID: audit.modifiedByAccountID,
    productTypeRepository: undefined,
  });

  const childProductType = new ProductType({
    productTypeID: childProductTypeID,
    productTypeIDPath: childProductTypeIDPath,
    activeFlag: undefined,
    publishedFlag: undefined,
    urlTitle: 'merchandise',
    productTypeName: CHILD_PRODUCT_TYPE_NAME,
    productTypeDescription: 'The merchandise product type the legacy helper referenced.',
    systemCode: CHILD_PRODUCT_TYPE_SYSTEM_CODE,
    parentProductType: undefined,
    childProductTypes: [],
    products: [],
    promotionRewards: [],
    promotionRewardExclusions: [],
    promotionQualifiers: [],
    promotionQualifierExclusions: [],
    priceGroupRates: [],
    priceGroupRateExclusions: [],
    remoteID: `${idPrefix}-producttype-child-remote`,
    createdDateTime: audit.createdDateTime,
    createdByAccountID: audit.createdByAccountID,
    modifiedDateTime: audit.modifiedDateTime,
    modifiedByAccountID: audit.modifiedByAccountID,
    productTypeRepository: undefined,
  });

  // Wires both directions once, through the entity's own helper. `addChildProductType`
  // delegates to the child's `setParentProductType`, which assigns the parent and
  // pushes the child into the parent's live collection under a duplicate guard.
  parentProductType.addChildProductType(childProductType);

  return childProductType;
}

// ---------------------------------------------------------------------------
// THE SINGLE EXPORT
// ---------------------------------------------------------------------------

/**
 * Builds one deterministic merchandise `Product`, fully formed and independent.
 *
 * THE SHAPE UNDER DEFAULTS, and every choice is documented on the member it
 * belongs to:
 *
 *   * `productID` is `''`, so `isNew()` is honest and the four cases inherited
 *     from [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67] stay
 *     expressible.
 *   * `urlTitle` is `'nike-air-jorden'` and the settings double answers `'sp'`,
 *     so `getProductURL()` resolves to `/sp/nike-air-jorden/` - the ONE
 *     legacy-extended entity assertion, reproduced with BOTH slashes and with the
 *     misspelling intact.
 *   * `brand` is PRESENT, `productType` is the CHILD of a two-level chain, and
 *     `defaultSku` is ABSENT.
 *   * `skus` is `[]`, which is the cycle-breaking rule of the whole module.
 *   * All four collaborator ports are wired with hand-written doubles.
 *
 * ★ WHAT THE DEFAULT PRODUCT ALREADY REACHES, WITH NO OVERRIDE AT ALL:
 *
 *   * `getSalePrice()` branch 3 - no default sku and no skus, answering zero
 *     legitimately.
 *   * `getCurrentAccountPrice()` answering `undefined`.
 *   * `getSkuByID(anything)` answering `undefined`, the empty-collection miss.
 *   * `getBrandName()` on the brand-PRESENT path.
 *   * `getProductURL()` and `getListingProductURL()`, one leading slash apart.
 *   * `getPrice()` reading the non-column price slot rather than a default sku.
 *
 * ★ AND THE THREE VARIANTS THAT NEED ONE KEY EACH:
 *
 *   * `{ brand: undefined }` - the brand-ABSENT path.
 *   * `{ defaultSku: aSku }` - `getSalePrice()` branch 1, which delegates.
 *   * `{ skus: [aSku] }` - `getSalePrice()` branch 2, THE DEFECT BRANCH.
 *
 * LEGACY-DEFECT [model/entity/Product.cfc:L598]: `getSalePrice()` has three
 *   branches and the middle one - default sku ABSENT, `skus` NON-EMPTY - computes
 *   `getSkus()[1].getSalePrice()` as a BARE STATEMENT WITH NO `return`, so the
 *   computed sale price is discarded and execution falls through to `return 0` at
 *   [L600]. The port preserves that discard explicitly. Branch 2 is reachable
 *   ONLY by supplying `skus` while leaving `defaultSku` absent, which is why this
 *   factory defaults `defaultSku` to absent rather than inventing one: a
 *   placeholder default sku would make the defect unreachable. Note that the
 *   legacy index is 1-based, so the discarded call reads element 0 in the port,
 *   narrowed rather than asserted.
 * Preserved deliberately; do not fix without a product decision.
 *
 * LEGACY-DEFECT [model/entity/Product.cfc:L588-L592]: `getCurrentAccountPrice()`
 *   sits SIX LINES ABOVE `getSalePrice()` and guards on the same absent
 *   `defaultSku`, but it has NO `else` and NO trailing `return`, so it answers
 *   CFML null. That is a `| undefined` site and the OPPOSITE convention from the
 *   fall-through-to-zero directly below it. The two are reachable from this one
 *   fixture with no override and are deliberately NOT conflated: substituting zero
 *   for the `undefined` would silently price a product at nothing.
 * Preserved deliberately; do not fix without a product decision.
 *
 * LEGACY-DEFECT [model/entity/Product.cfc:L524-L532]: `getBrandName()` seeds its
 *   memo with `""` and then returns the brand's real name WITHOUT storing it, so
 *   the method answers correctly exactly once and `""` forever after. This is one
 *   of only three documented DELIBERATE DIVERGENCES in the whole migration - the
 *   port FIXES it, because the poisoning is unobservable through the public
 *   contract (it causes a stale cache, not a different first answer) and because
 *   the memo is per-instance and per-request in the target anyway. The fixture's
 *   obligation is to make both the brand-present and the brand-absent path
 *   reachable, and to hand out a genuinely fresh instance on every call so a suite
 *   can prove a second invocation does not observe the first invocation's memo.
 * Documented DELIBERATE DIVERGENCE, so this block deliberately closes WITHOUT the
 *   "preserved deliberately" trailer that the two blocks above it carry. Nothing
 *   here is being preserved, and appending that trailer would misreport the
 *   migration's own record of which defects survive. The omission is intentional,
 *   exactly like the un-`var`'d `productData` that is deliberately not reproduced.
 *
 * CFML parity [model/entity/Product.cfc:L207-L212]: `getProductURL()` and
 * `getListingProductURL()` differ by EXACTLY ONE CHARACTER - the leading slash -
 * and both keep the trailing one. They sit four lines apart in the source, which
 * makes them a trap for a careless reading, so this fixture is shaped so that both
 * are answerable from the same instance and their difference is directly
 * comparable.
 *
 * CFML parity [model/entity/Product.cfc:L162-L187]: TWO DIFFERENT MISS
 * CONVENTIONS live in the same component. `getSkuByID` [L162-L169] has no return
 * after its loop and so answers CFML null on a miss, while
 * `getSkuSalePriceDetails` [L182-L187] answers an EMPTY STRUCT. Both are reachable
 * from the defaults here - the first through the empty `skus`, the second through
 * the unset sale-price map - and neither is unified onto the other.
 *
 * CFML parity [model/entity/Product.cfc:L76]: the `productReviews` property spells
 * its attribute `singlularname` - a typo in the source. Product reviews are an
 * out-of-scope feature, so the association is not carried on the hydration surface
 * at all and there is nothing here to default. The typo is recorded rather than
 * corrected, because correcting a source artefact this fixture does not even
 * reproduce would misrepresent what was read.
 *
 * JUDGMENT CALL: `subscriptionTermProvider` is the fifth port the entity accepts
 * and is DELIBERATELY NOT SUPPLIED. It is not among this fixture's declared
 * dependencies, subscription handling is out of scope, and the one method that
 * would reach it refuses regardless because the port declares no member capable
 * of serving it. Wiring a double would invent a collaborator for a path that
 * cannot work.
 *
 * JUDGMENT CALL: the sibling price-group fixture is NOT imported. Sibling fixture
 * imports are permitted only in the acyclic order priceGroup -> product -> sku ->
 * promotion -> orderView, so importing module #1 would be legal - but a
 * `priceGroupRates` entry is a caller's concern, and accepting it through
 * `overrides` keeps this module's import set to the whitelist and its graph free
 * of a collaborator no default needs.
 *
 * @param overrides - the only axis of variation. Omit it entirely for the
 *   documented defaults. Omit a single key to accept that key's default; write the
 *   key as `undefined` to ask for the ABSENT state of a member this factory
 *   otherwise supplies.
 * @returns one fully-formed product, disposable by dropping the reference. There
 *   is deliberately no teardown counterpart: nothing was acquired, nothing was
 *   persisted and nothing was flushed.
 */
export function makeProductFixture(overrides?: ProductFixtureOverrides): Product {
  // --- Resolved inputs ------------------------------------------------------
  //
  // `??` where the default is simply a value and absence carries no distinct
  // meaning; `resolveOverride` where an explicit `undefined` must survive as
  // absence; and no operator at all on the three boolean columns, because an
  // explicit `false` has to survive as `false` and truthiness would eat it.

  const idPrefix: string = overrides?.idPrefix ?? DEFAULT_ID_PREFIX;
  const productID: string = overrides?.productID ?? '';

  // No `??` and no `resolveOverride`: an absent key and an explicit `undefined`
  // both mean the undefaulted column, which is the honest state for a flag whose
  // source declares no default [model/entity/Product.cfc:L53]. `publishedFlag`
  // declares `default="false"` at [L58] and resolves to `false` either way, so the
  // two are handled identically here while their provenance differs.
  const activeFlag: CfBooleanInput = overrides?.activeFlag;
  const publishedFlag: CfBooleanInput = overrides?.publishedFlag;
  const calculatedAllowBackorderFlag: CfBooleanInput = resolveOverride(
    overrides,
    'calculatedAllowBackorderFlag',
    false,
  );

  const urlTitle: string | undefined = resolveOverride(
    overrides,
    'urlTitle',
    LEGACY_PRODUCT_URL_TITLE,
  );
  const productName: string | undefined = resolveOverride(
    overrides,
    'productName',
    LEGACY_PRODUCT_NAME,
  );
  const productCode: string | undefined = resolveOverride(
    overrides,
    'productCode',
    LEGACY_PRODUCT_CODE,
  );
  const productDescription: string | undefined = resolveOverride(
    overrides,
    'productDescription',
    PRODUCT_DESCRIPTION,
  );
  const calculatedTitle: string | undefined = resolveOverride(
    overrides,
    'calculatedTitle',
    CALCULATED_TITLE,
  );
  const remoteID: string | undefined = resolveOverride(overrides, 'remoteID', REMOTE_ID);
  const sortOrder: number | undefined = resolveOverride(overrides, 'sortOrder', SORT_ORDER);
  const calculatedQATS: number | undefined = resolveOverride(
    overrides,
    'calculatedQATS',
    CALCULATED_QATS,
  );
  const nextOptionGroupSortOrder: number | undefined = resolveOverride(
    overrides,
    'nextOptionGroupSortOrder',
    NEXT_OPTION_GROUP_SORT_ORDER,
  );

  // Both monetary slots are built from DECIMAL STRINGS. No `number` is ever
  // handed to `Money`, no arithmetic operator is applied to a monetary value
  // anywhere in this module, and `Money.zero` is never used as a fallback, a
  // default or an error result.
  const price: Money | undefined = resolveOverride(
    overrides,
    'price',
    Money.fromDecimalString(LEGACY_PRODUCT_PRICE),
  );
  const calculatedSalePrice: Money | undefined = resolveOverride(
    overrides,
    'calculatedSalePrice',
    Money.fromDecimalString(CALCULATED_SALE_PRICE),
  );

  const brandName: string | undefined = resolveOverride(overrides, 'brandName', BRAND_NAME);
  const globalURLKeyProduct: string = overrides?.globalURLKeyProduct ?? GLOBAL_URL_KEY_PRODUCT;
  const selectedOptionsCandidateSkus: readonly Sku[] =
    overrides?.selectedOptionsCandidateSkus ?? [];

  // --- The eager many-to-ones and the collaborator doubles -------------------
  //
  // Each default is CONSTRUCTED, so `hasOverride` separates "omitted" from
  // "explicitly absent" without building an object the graph would discard.

  const brand: Brand | undefined = hasOverride(overrides, 'brand')
    ? overrides?.brand
    : makeFixtureBrand(idPrefix, brandName);

  const productType: ProductType | undefined = hasOverride(overrides, 'productType')
    ? overrides?.productType
    : makeFixtureProductTypeChain(idPrefix);

  // Absent by default. Its absence is load-bearing - see the DEFECT annotations
  // above - so there is nothing to construct and no `hasOverride` to perform.
  const defaultSku: Sku | undefined = overrides?.defaultSku;

  const settingsProvider: SettingsProvider | undefined = hasOverride(overrides, 'settingsProvider')
    ? overrides?.settingsProvider
    : makeFixtureSettingsProvider(globalURLKeyProduct);

  const skuRepository: SkuRepository | undefined = hasOverride(overrides, 'skuRepository')
    ? overrides?.skuRepository
    : makeFixtureSkuRepository(selectedOptionsCandidateSkus);

  const optionRepository: OptionRepository | undefined = hasOverride(overrides, 'optionRepository')
    ? overrides?.optionRepository
    : makeFixtureOptionRepository();

  const productRepository: ProductRepository | undefined = hasOverride(
    overrides,
    'productRepository',
  )
    ? overrides?.productRepository
    : makeFixtureProductRepository();

  // --- Collections ----------------------------------------------------------
  //
  // ★ EVERY COLLECTION IS A FRESH ARRAY BUILT INSIDE THIS CALL, INCLUDING WHEN
  // THE CALLER SUPPLIED ONE. Two reasons, and they pull in the same direction.
  //
  // First, isolation: the unflagged `getSkus()` returns `variables.skus` ITSELF,
  // uncopied [model/entity/Product.cfc:L157], and the port preserves that live
  // handout under an explicit rule forbidding the ENTITY to copy. So if one array
  // instance reached two products, an `addSku` in one suite would surface in
  // another. Copying here is what makes the entity's live-array rule safe: the
  // fixture creates the array and hands ownership to exactly one product.
  //
  // Second, CFML parity [model/service/PriceGroupService.cfc:L276, L282]: CFML
  // copies arrays BY VALUE on assignment, so the legacy `var priceGroups =
  // account.getPriceGroups();` followed by `arrayAppend` left the account's own
  // collection untouched. A TypeScript reference would have MUTATED it. The
  // inverse semantics are exactly why defensive copying is required wherever a
  // fixture hands out a collection.

  const skus: Sku[] = [...(overrides?.skus ?? [])];
  const categories: readonly Category[] = [...(overrides?.categories ?? [])];
  const relatedProducts: readonly Product[] = [...(overrides?.relatedProducts ?? [])];
  const promotionRewards: PromotionRewardRef[] = [...(overrides?.promotionRewards ?? [])];
  const promotionRewardExclusions: PromotionRewardRef[] = [
    ...(overrides?.promotionRewardExclusions ?? []),
  ];
  const promotionQualifiers: PromotionQualifierRef[] = [...(overrides?.promotionQualifiers ?? [])];
  const promotionQualifierExclusions: PromotionQualifierRef[] = [
    ...(overrides?.promotionQualifierExclusions ?? []),
  ];
  const priceGroupRates: PriceGroupRateRef[] = [...(overrides?.priceGroupRates ?? [])];

  // Materialized as EMPTY by default - the accurate answer for a product with no
  // skus, since the legacy smart list joins through them - and left UNSET only
  // when the caller explicitly writes `undefined`, which is how the port's
  // never-materialized refusal is reached. Copied when supplied, for the
  // isolation reason above.
  const suppliedOptionGroups: readonly OptionGroup[] | undefined = resolveOverride(
    overrides,
    'optionGroups',
    [],
  );
  const optionGroups: readonly OptionGroup[] | undefined =
    suppliedOptionGroups === undefined ? undefined : [...suppliedOptionGroups];

  // A shallow copy of caller-owned read-only data. The map is keyed by `skuID` and
  // is only ever read by `getSkuSalePriceDetails`; copying keeps a later caller-side
  // mutation out of this graph.
  const suppliedSalePriceDetails: SalePriceDetailsMap | undefined =
    overrides?.salePriceDetailsForSkus;
  const salePriceDetailsForSkus: SalePriceDetailsMap | undefined =
    suppliedSalePriceDetails === undefined ? undefined : { ...suppliedSalePriceDetails };

  const audit: AuditTrail = makeAuditTrail(idPrefix);

  // --- Hydration ------------------------------------------------------------
  //
  // Every OPTIONAL member is written through a conditional spread rather than
  // assigned a possibly-`undefined` value, because `exactOptionalPropertyTypes`
  // makes `brand?: Brand` and `brand?: Brand | undefined` different contracts and
  // the hydration surface declares the former. The spread form is the checkable
  // one: it omits the key entirely when there is no value, needs no cast and no
  // suppression comment, and is exactly what the entity's own constructor does
  // internally when it decides whether to assign a field at all.

  const hydrationInput: ProductHydrationInput = {
    productID,

    // Always present, always owned by this graph.
    skus,
    categories,
    relatedProducts,
    promotionRewards,
    promotionRewardExclusions,
    promotionQualifiers,
    promotionQualifierExclusions,
    priceGroupRates,

    // The audit columns [model/entity/Product.cfc:L96-L99]; the two account keys
    // are inert opaque identifiers for an out-of-scope entity.
    createdDateTime: audit.createdDateTime,
    createdByAccountID: audit.createdByAccountID,
    modifiedDateTime: audit.modifiedDateTime,
    modifiedByAccountID: audit.modifiedByAccountID,

    // The three booleans [L53, L58, L64].
    ...(activeFlag === undefined ? {} : { activeFlag }),
    ...(publishedFlag === undefined ? {} : { publishedFlag }),
    ...(calculatedAllowBackorderFlag === undefined ? {} : { calculatedAllowBackorderFlag }),

    // The scalar columns [L54-L57, L59, L93].
    ...(urlTitle === undefined ? {} : { urlTitle }),
    ...(productName === undefined ? {} : { productName }),
    ...(productCode === undefined ? {} : { productCode }),
    ...(productDescription === undefined ? {} : { productDescription }),
    ...(sortOrder === undefined ? {} : { sortOrder }),
    ...(remoteID === undefined ? {} : { remoteID }),

    // The four persisted denormalized cache columns [L62-L65]. All four are
    // present for schema continuity, and only the first is money.
    ...(calculatedSalePrice === undefined ? {} : { calculatedSalePrice }),
    ...(calculatedQATS === undefined ? {} : { calculatedQATS }),
    ...(calculatedTitle === undefined ? {} : { calculatedTitle }),

    // The three eager many-to-ones [L68-L70].
    ...(brand === undefined ? {} : { brand }),
    ...(productType === undefined ? {} : { productType }),
    ...(defaultSku === undefined ? {} : { defaultSku }),

    // The non-persistent slots.
    ...(price === undefined ? {} : { price }),
    ...(optionGroups === undefined ? {} : { optionGroups }),
    ...(salePriceDetailsForSkus === undefined ? {} : { salePriceDetailsForSkus }),
    ...(nextOptionGroupSortOrder === undefined ? {} : { nextOptionGroupSortOrder }),

    // The four wired ports. The fifth, `subscriptionTermProvider`, is deliberately
    // never supplied - see the judgment call above.
    ...(settingsProvider === undefined ? {} : { settingsProvider }),
    ...(skuRepository === undefined ? {} : { skuRepository }),
    ...(optionRepository === undefined ? {} : { optionRepository }),
    ...(productRepository === undefined ? {} : { productRepository }),
  };

  return new Product(hydrationInput);
}
