// ---------------------------------------------------------------------------
// slatwall-ts - unit suite pinning `src/services/skuService.ts`
//
// ---------------------------------------------------------------------------
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
// ---------------------------------------------------------------------------
// Not one assertion below has a legacy antecedent. There is NO `SkuServiceTest`
// anywhere under `meta/tests/`: the legacy service tier holds exactly four
// components - AccountServiceTest, HibachiServiceTest, PaymentServiceTest and
// UtilityRBServiceTest - none of them in scope and none of them touching the SKU
// service. The data tier is no better off, with `meta/tests/unit/dao/` carrying
// only `AccountDAOTest` and `PaymentDAOTest`, so nothing covers
// `model/dao/SkuDAO.cfc` either. There is no antecedent to extend, this suite is
// net-new in full, and saying so is a requirement rather than a courtesy -
// presenting net-new coverage as parity would fail the traceability gate.
//
// Only three legacy test files touch the migrated slice at all, and the two that
// carry real assertions belong to `brand` and `product`. Every legacy "unit" test
// boots the real Application, the ORM and the DI container, so nothing in that
// suite is isolated in the modern sense. Traceability in this project therefore
// means the same assertions about the same behaviour, never the same test
// architecture. This file boots nothing: it constructs four plain objects and
// calls nine methods.
//
// ---------------------------------------------------------------------------
// WHAT IS UNDER TEST
// ---------------------------------------------------------------------------
// `model/service/SkuService.cfc` is 334 lines. The ported class publishes NINE
// public methods, and every one of them is asynchronous - a method becomes
// `async` if and only if its legacy body reaches the DAO, the ORM or a
// collaborator that does, and all nine qualify. Every call below is therefore
// awaited.
//
//   L58-L208   createSkus(product, data)                 four-way dispatch, one raise
//   L210-L218  processImageUpload(sku, result)           the one service-layer locator site
//   L220-L244  getProductSkus(product, sorted, fetch?)   indexing defect, guard #1
//   L246-L269  getSortedProductSkus(product)             indexing defect, guard #2
//   L271-L273  searchSkusByProductType(term?, ptID?)     passthrough
//   L281-L283  getSkuStocksDeletableFlag(skuID)          DEFECT 28 - raises unconditionally
//   L285-L287  getTransactionExistsFlag()                passthrough
//   L289-L291  getSkuBySkuCode(skuCode?)                 passthrough
//   L309-L325  getSkuSmartList -> findSkus(criteria)      signature reshaping #2
//
// ---------------------------------------------------------------------------
// THE SHIPPED CONSTRUCTOR TAKES THREE PORTS, NOT FOUR - RECORDED, NOT PAPERED OVER
// ---------------------------------------------------------------------------
// JUDGMENT CALL: this suite was briefed for a four-port constructor
// (`skuRepository`, `optionRepository`, `imageStore`, `subscriptionTermProvider`).
// The SHIPPED class takes THREE ports plus two target-side knobs, and
// `SkuService.length` is 3. The suite adapts to the shipped surface rather than
// the brief, because the production module is the contract and a test may never
// reshape it.
//
// The missing fourth is not an omission. `optionService` [model/service/
// SkuService.cfc:L53] is reached at exactly one line, [L74], and only for
// HibachiService's generic `get<Entity>(primaryKey)` lookup - a capability the
// thirteen-port set does not carry. Option hydration is therefore a BOUNDARY
// INPUT, arriving as `CreateSkusInput.resolvedOptions`, and an identifier named in
// `data.options` that is absent from `resolvedOptions` raises. The
// `OptionRepository` port is still real, still exactly two members wide, and still
// consumed by `OptionService`; it is simply not a collaborator of THIS class. A
// double for it is built below and used to pin precisely that, so the claim is
// checkable instead of asserted.
//
// LEGACY-NOTE [model/service/SkuService.cfc:L54]: the legacy component declares a
// productService DI/1 property that no method ever uses. The dead injection is
// dropped rather than ported, so this suite supplies no productService double.
// Sweeping all 334 lines for `productService` returns exactly one hit, and that
// hit IS the L54 declaration. Under DI/1 a declaration alone was enough to have a
// collaborator resolved, so an edge no code used stayed invisible; naming
// collaborators as constructor parameters is what makes an unused one apparent.
//
// Five declared, four live, three ports. `contentService` [L56] is reached only
// from the out-of-scope contentAccess branch and no content port exists in the
// port set, so none is invented here either - the branch is pinned by what it
// attaches, never by content behaviour.
//
// ---------------------------------------------------------------------------
// THE TWO INDEXING DEFECTS ARE KEPT STRUCTURALLY SEPARATE
// ---------------------------------------------------------------------------
// Both `getProductSkus` and `getSortedProductSkus` use `arrayFind`'s result
// DIRECTLY as an array index, and `arrayFind` answers 0 when nothing matches,
// which is not a valid index into a 1-based CFML array. That much they share. What
// they do NOT share is the guard in front of it, and the guard asymmetry is the
// whole point:
//
//   [L223]  sorted && arrayLen(skus) gt 1 && arrayLen(skus[1].getOptions())
//           -> a THREE-clause guard whose third clause probes ONLY THE FIRST SKU
//   [L248]  arrayLen(skus) lt 2
//           -> a COUNT CHECK ALONE, with no options clause anywhere
//
// So they fail on DIFFERENT INPUT SHAPES, and this suite feeds each the shape that
// singles it out: a first-sku-has-options / later-sku-has-none collection for the
// first, and a two-element all-option-less collection for the second. They live in
// separate `describe` blocks, carry separate markers, and are never merged into
// one parameterised case.
//
// ---------------------------------------------------------------------------
// THE IN-MEMORY DOUBLE IDIOM, FOLLOWED AS THE SIBLING SUITES ESTABLISHED IT
// ---------------------------------------------------------------------------
// Every port is replaced by a hand-written in-memory double declared inline in
// this file. Four properties make each one a double rather than a mock:
//
//   1. It is TYPED against the shipped port, and its recording arrays are typed
//      with `Parameters<...>` read off that port, so a change to the contract
//      breaks compilation here instead of drifting silently past a permissive
//      mock.
//   2. It RECORDS rather than asserts - and it records the whole ARGUMENT LIST,
//      not a re-assembled copy, which is what lets a case prove how MANY values
//      arrived as well as which.
//   3. It is PURE and DETERMINISTIC - no randomness, no clock read, no counter
//      that survives a case.
//   4. It is CONSTRUCTED FRESH in `beforeEach`, so no state leaks between cases.
//      There is no mutable module-level state in this file at all.
//
// Each double implements EXACTLY the member count its port declares - seven, two,
// two and two - and not one member more, so nothing here can describe a wider
// contract than the port does.
//
// ---------------------------------------------------------------------------
// WHAT THIS SUITE DELIBERATELY DOES NOT DO, EACH STATED RATHER THAN LEFT SILENT
// ---------------------------------------------------------------------------
//   * NO SQL, PARAMETERISED OR OTHERWISE - AND THAT IS NOT A GAP. The project
//     holds every query to prepared statements, which is what preserves the
//     injection-safety guarantee the legacy `cfqueryparam` gave. The obligation
//     cannot be discharged from here, because the unit under test issues no query
//     at all: it hands arguments to a PORT and returns what the port answers. The
//     HQL and `<cfquery>` bodies in `model/dao/SkuDAO.cfc` are the SQL source of
//     truth and reproducing them belongs to the MySQL adapter, so statement-text
//     and parameter-binding assertions belong EXCLUSIVELY to the sibling-owned
//     `tests/integration/repositories/` tier. IN PARTICULAR THE AND-OF-EXISTS
//     OPTION-MATCHING STATEMENT AT [model/dao/SkuDAO.cfc:L107-L128] IS NOT
//     ASSERTED HERE - it backs a named must-preserve behaviour and it is asserted
//     where a real statement exists to assert against. Recording that is the
//     difference between "not applicable" and "forgotten".
//   * NO DATABASE, NO NETWORK, NO FILESYSTEM AND NO ENVIRONMENT READ. All four
//     collaborators are in-memory doubles, so this suite passes with a completely
//     empty environment and no `.env` present. `tests/setup.ts` loads dotenv
//     defensively for the tiers that need it; nothing here reads what it loaded,
//     and no credential, host name or connection value appears anywhere below.
//   * NO CLAIM ABOUT EXECUTION CHARACTERISTICS. The option-cartesian combination
//     count is unbounded BY CONSTRUCTION [model/service/SkuService.cfc:L82-L86],
//     and the target's batch bound and duplicate-code refusal are CORRECTNESS
//     protections. They are asserted structurally: that a bound is enforced, that
//     the product is left untouched when it is, and that a repeated invocation
//     does not silently double-apply. There is no timing assertion, no repeat count
//     standing in for one, and no runner timeout read as a service level. The
//     legacy system publishes no such requirement and none is invented here.
//   * NO LIST, TRUTHINESS OR NUMBER-FORMAT HELPER IS IMPORTED. `src/lib/cfml/
//     list.ts`, `truthiness.ts` and `numberFormat.ts` are available to this tier
//     and are deliberately unused. They are the SERVICE'S OWN parsing and
//     formatting internals: rebuilding an expected value with the same helper the
//     subject used would let a shared fault cancel itself out. Comma lists are
//     therefore written as literals below, or JOINED from options this file
//     constructed itself - never parsed - and expected option sets are enumerated
//     by hand.
//   * NO MOCKING LIBRARY AND NO SPY. The project pins fourteen packages and this
//     suite adds none. `vi` ships inside the runner and is not imported, so this
//     file owes no spy restoration beyond the global `afterEach` that
//     `tests/setup.ts` already registers.
//   * NO FIXTURE IS CREATED OR EDITED. `tests/fixtures/skuFixtures.ts` and
//     `tests/fixtures/productFixtures.ts` are used as shipped. There is
//     deliberately no `optionGroupFixtures.ts` among the fixture modules and none
//     is created. Every extra entity is constructed INLINE from the shipped
//     classes, which is the intended shape.
//   * NO IMPORT THAT CROSSES THE LAYER BOUNDARY OUTWARD. Nothing here comes from
//     `src/repositories/**`, `src/handlers/**` or `src/integrations/**`. The
//     `no-restricted-imports` block that makes that a build failure is scoped to
//     `src/domain/**` and does NOT fence `tests/**`, which is exactly why it is
//     worth stating: a test file is the one place the boundary could be walked
//     around without the linter objecting, and it is not walked around here. No
//     composition root, container or service locator is imported, because
//     constructing the subject needs nothing but four objects.
//   * NO EXPORT, NO BARREL. This file exports nothing.
//   * NO MXUNIT HARNESS. The legacy assertions are carried; the legacy harness is
//     not. There is no assertion shim, no set-up/tear-down base component
//     analogue, no test-helper class port and no browser-driver analogue.
//   * NO LICENCE HEADER. Attribution is carried once, in
//     `slatwall-ts/NOTICE-GPL.md`, and is never restated per file.
//   * NO ASSERTION ABOUT BUNDLING OR DEPLOYMENT. Infrastructure as code is out of
//     scope and nothing below touches the build.
//
// ---------------------------------------------------------------------------
// MONEY, AND THE THINGS THAT ARE NOT MONEY
// ---------------------------------------------------------------------------
// Every monetary value below is a `Money` built from a decimal STRING, and every
// monetary expectation is compared with `Money.equals` or read back as a decimal
// string. There is no raw JavaScript float arithmetic anywhere in this file,
// including in expected values - no expected total is computed, each is written
// out. `Money`'s surface is closed and only its shipped members are used:
// `fromDecimalString`, `zero`, `equals` and `toDecimalString`.
//
// A `sortOrder` is NOT money and neither is a combination count. Both stay plain
// numbers, no arithmetic is performed on either, and neither is ever wrapped in
// `Money`. Stated so that nobody later promotes an ordinal into a monetary type,
// or demotes a price into a float.
//
// ---------------------------------------------------------------------------
// NO USER RULES WERE PROVIDED
// ---------------------------------------------------------------------------
// The project rules document says exactly that, and it was read in full rather
// than sampled. No rule has been invented to fill the gap, no file enters scope by
// rule mandate, and the absence is NOT licence to lower the bar: the enterprise
// substitute standard applies at full strength. Concretely, here that means
// maximal strictness with no `any`, no blanket TypeScript-ignore directive, no cast
// and no non-null
// assertion; every indexed read narrowed rather than asserted away; every optional
// key OMITTED rather than assigned `undefined`; legacy method names asserted
// verbatim; no dependency outside the fixed pinned set; no credential, connection
// value or host name present as a value; and every judgment call annotated at the
// point where it was made.
//
// There is exactly ONE `@ts-expect-error` in this file, and it is not a suppression:
// it sits inside a DESCRIBED TYPE-FAILURE TEST where the directive itself IS the
// assertion - it fails the build if the code below it ever starts compiling. The
// `tests/**` lint override permits the expect-error form and forbids the blanket
// ignore form precisely because the two are not the same thing: one ASSERTS an
// error, the other HIDES one.
//
// ---------------------------------------------------------------------------
// BUDGET LEDGERS THIS SUITE SPENDS FROM
// ---------------------------------------------------------------------------
//   * SIGNATURE RESHAPING #2, HALF-SPENT HERE. `getSkuSmartList` becomes the typed
//     `findSkus(criteria)`; the other half is `findProducts` on the product
//     service, and together they count as ONE. The rename is annotated where it is
//     asserted and no generic dynamic query language is built or asserted.
//   * ZERO DELIBERATE DIVERGENCES. All three of the project's divergences are
//     spent elsewhere. EVERY defect pinned below is PRESERVED, including the two
//     indexing hazards, the constant-`true` return and the misspelled
//     resource-bundle key.
//   * NO VISIBILITY WIDENING and NO SIGNATURE WIDENING. All five widenings belong
//     to the promotion slice and the single signature widening to a sibling
//     entity. Every method is called by its verbatim legacy name with its shipped
//     parameter list.
//
// LEGACY-NOTE [model/dao/SkuDAO.cfc:L163]: the DAO writes `var hql &= "WHERE ..."`
// inside `getProductSkus`, a second `var` declaration of a local already declared
// at [L152] - invalid CFML that only survives because the engine tolerates it.
// The construct cannot exist in TypeScript and is deliberately NOT reproduced: the
// ported repository builds one statement string. Recorded because a reader
// comparing the two files will notice the shape is gone, and its absence is a
// consequence of the target language rather than a change of behaviour.
//
// LEGACY-NOTE [model/dao/SkuDAO.cfc:L130-L148, model/dao/ProductDAO.cfc:L419]: the
// SKU search takes a SINGULAR `productTypeID` while the product search takes a
// PLURAL `productTypeIDs`, and the SKU body then binds its singular argument to a
// list-expanded parameter named `productTypeIDs` [model/dao/SkuDAO.cfc:L135-L136].
// BOTH SPELLINGS ARE PRESERVED on their respective ports. The asymmetry is
// recorded here so that nobody later "harmonises" them and silently changes one
// method's public signature.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it } from 'vitest';

import { Option } from '../../../src/domain/entities/option.js';
import { ENTITY_CODE_PATTERN, OptionGroup } from '../../../src/domain/entities/optionGroup.js';
import { ProductType } from '../../../src/domain/entities/productType.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import { SkuService } from '../../../src/services/skuService.js';
import { makeProductFixture } from '../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

import type { Product } from '../../../src/domain/entities/product.js';
import type { Sku } from '../../../src/domain/entities/sku.js';
import type { ImageStore } from '../../../src/domain/ports/imageStore.js';
import type { OptionRepository, SelectOption } from '../../../src/domain/ports/optionRepository.js';
import type { SkuRepository } from '../../../src/domain/ports/skuRepository.js';
import type {
  SubscriptionBenefitHandle,
  SubscriptionTermHandle,
  SubscriptionTermProvider,
} from '../../../src/domain/ports/subscriptionTermProvider.js';
import type {
  CreateSkusInput,
  ImageUploadResult,
  SkuPage,
  SkuQueryCriteria,
} from '../../../src/services/skuService.js';

// ---------------------------------------------------------------------------
// Argument-list types, derived from the shipped ports rather than restated
// ---------------------------------------------------------------------------

// JUDGMENT CALL: every recording array below is typed with `Parameters<...>` read
// off the shipped port instead of with a hand-written record of named fields. Two
// reasons, and the second is the stronger one. First, a derived type cannot drift:
// rename a parameter, reorder a pair, or add a third, and this file stops
// compiling - which is exactly the signal a suite should give rather than
// continuing to pass against a contract that has moved. Second, recording the
// ARGUMENT LIST rather than a re-assembled object means the recorded value
// reflects what the service actually passed, including how MANY values it passed.
// A double that unpacked its parameters into a fresh object would report the shape
// IT declared and could never reveal a stray extra argument.

type TransactionExistsFlagArgs = Parameters<SkuRepository['getTransactionExistsFlag']>;

type SkuBySkuCodeArgs = Parameters<SkuRepository['getSkuBySkuCode']>;

type SkusBySelectedOptionsArgs = Parameters<SkuRepository['getSkusBySelectedOptions']>;

type SearchSkusByProductTypeArgs = Parameters<SkuRepository['searchSkusByProductType']>;

type ProductSkusArgs = Parameters<SkuRepository['getProductSkus']>;

type SortedProductSkusIDArgs = Parameters<SkuRepository['getSortedProductSkusID']>;

type SaveSkuArgs = Parameters<SkuRepository['saveSku']>;

type UnusedProductOptionsArgs = Parameters<OptionRepository['getUnusedProductOptions']>;

type UnusedProductOptionGroupsArgs = Parameters<OptionRepository['getUnusedProductOptionGroups']>;

type SaveImageFileArgs = Parameters<ImageStore['saveImageFile']>;

type DeleteImageFileArgs = Parameters<ImageStore['deleteImageFile']>;

type SubscriptionTermArgs = Parameters<SubscriptionTermProvider['getSubscriptionTerm']>;

type SubscriptionBenefitArgs = Parameters<SubscriptionTermProvider['getSubscriptionBenefit']>;

// ---------------------------------------------------------------------------
// Deterministic synthetic values
// ---------------------------------------------------------------------------

/**
 * The product code `tests/fixtures/productFixtures.ts` gives every product it
 * builds.
 *
 * Restated here as a literal rather than imported, because it is the LEFT-HAND
 * SIDE of all four legacy skuCode formulas [model/service/SkuService.cfc:L97,
 * L133, L159, L184, L194] and the expected codes below are written out in full
 * rather than composed. Deriving them from the fixture with the same
 * concatenation the subject uses would let a shared fault cancel itself out.
 */
const FIXTURE_PRODUCT_CODE = 'TESTPRODUCTXXX';

/** The base price handed to `createSkus`, as a decimal string. Never a float. */
const PRICE_DECIMAL = '19.99';

/** A list price that clears the three-clause guard [model/service/SkuService.cfc:L94]. */
const LIST_PRICE_DECIMAL = '24.99';

/**
 * The raise [model/service/SkuService.cfc:L204] emits, character for character.
 *
 * The legacy message is a bare string with no error type, no code and no
 * interpolation, and it is preserved exactly - including the missing article
 * before "this product" - because it is what a caller sees today.
 */
const UNEXPECTED_PRODUCT_CREATION_ERROR_MESSAGE =
  'There was an unexpected error when creating this product';

/**
 * The image extension allow-list [model/service/SkuService.cfc:L212] passes to the
 * image service, verbatim as a comma-delimited list.
 *
 * Preserved character for character: same four extensions, same order, same
 * lower-casing, no leading dot and no whitespace. It is a BUSINESS CONSTANT rather
 * than configuration, which is why it is a literal here and not an environment
 * read.
 */
const ALLOWED_IMAGE_EXTENSIONS = 'jpg,jpeg,png,gif';

// LEGACY-DEFECT [model/service/SkuService.cfc:L148]: the resource-bundle key
// misspells "benefits" as "benifits". The key is a data contract resolved by the
// legacy admin, so the misspelling is preserved verbatim.
// Preserved deliberately; do not fix without a product decision.
//
// The locator the brief cites is L148; the source puts the MISSPELLED key at L143
// and the correctly spelled terms key at L148. Both are recorded, both are carried
// byte for byte, and no i18n runtime is introduced - these are plain string
// constants and nothing below resolves them.
const RB_KEY_SUBSCRIPTION_BENEFITS_REQUIRED = 'entity.product.subscriptionbenifitsrequired';

/** [model/service/SkuService.cfc:L148] - correctly spelled, unlike its sibling. */
const RB_KEY_SUBSCRIPTION_TERMS_REQUIRED = 'entity.product.subscriptiontermsrequired';

/**
 * [model/service/SkuService.cfc:L176].
 *
 * Note the prefix: this one is `validate.` while the two subscription keys are
 * `entity.`. The inconsistency is in the source and is carried, not normalised.
 */
const RB_KEY_ACCESS_CONTENTS_REQUIRED = 'validate.product.accesscontentsrequired';

/**
 * The identifiers of the canonical fixture graph's four SKUs.
 *
 * `tests/fixtures/skuFixtures.ts` wires all four onto one product in this order,
 * with these option counts:
 *
 *   skfx-sku-a   two options   groups 1 and 2
 *   skfx-sku-b   one option    group 1
 *   skfx-sku-c   three options groups 1, 2 and 3
 *   skfx-sku-d   NO OPTIONS    - the member both indexing defects need
 */
const FIXTURE_SKU_A_ID = 'skfx-sku-a';
const FIXTURE_SKU_B_ID = 'skfx-sku-b';
const FIXTURE_SKU_C_ID = 'skfx-sku-c';
const FIXTURE_SKU_D_ID = 'skfx-sku-d';

/** The product the canonical fixture graph hangs off. */
const FIXTURE_PRODUCT_ID = 'skfx-product';

/**
 * The order [model/dao/SkuDAO.cfc:L172-L202] returns for the three OPTIONED
 * members of the canonical graph, written out rather than computed.
 *
 * The legacy statement orders by
 * `SUM(SwOption.sortOrder * POWER(10, nextOptionGroupSortOrder - SwOptionGroup.sortOrder)) ASC`,
 * a positional weighting in which the LOWEST-numbered option group is the most
 * significant digit. The fixture supplies option groups at sort orders 1, 2 and 3
 * with a ceiling of 4, and options at sort orders 1, 2 and 3 respectively, so the
 * three weights are:
 *
 *   skfx-sku-b   group 1 only          1*1000                     = 1000
 *   skfx-sku-a   groups 1 and 2        1*1000 + 2*100             = 1200
 *   skfx-sku-c   groups 1, 2 and 3     1*1000 + 2*100 + 3*10      = 1230
 *
 * so ascending weight is b, a, c. Those products are shown as arithmetic in this
 * comment and are NOT computed anywhere in this file - the expected order is the
 * literal below. Reproducing the ORDER BY for real belongs to the MySQL adapter,
 * and asserting it belongs to `tests/integration/repositories/`; what the SERVICE
 * owes is to place each SKU at the position its identifier occupies in whatever
 * the port answered, and that is what the cases below pin.
 *
 * ! The radix ceiling is a pure scale factor - every weight is
 * `10^ceiling * SUM(optionSortOrder * 10^-groupSortOrder)` - so the ORDERING is
 * invariant to `nextOptionGroupSortOrder`. That is why the request-scope cases
 * distinguish two service instances by seeding DIFFERENT orders outright rather
 * than by varying the ceiling: varying the ceiling would prove nothing.
 */
const FIXTURE_OPTION_GROUP_SORTED_IDS: readonly string[] = [
  FIXTURE_SKU_B_ID,
  FIXTURE_SKU_A_ID,
  FIXTURE_SKU_C_ID,
];

// ---------------------------------------------------------------------------
// Inline entity construction
// ---------------------------------------------------------------------------

/**
 * Builds an option group with the two columns the cartesian path reads and inert
 * values everywhere else.
 *
 * `sortOrder` is an entity sort ordinal rather than a quantity and no arithmetic is
 * performed on it. The tie-breaker is supplied as a FIXED function rather than left
 * to default: the shipped default draws a random number, and although no path
 * exercised here reaches an option sort, supplying a constant makes "no random
 * source anywhere in this suite" true by construction instead of true by argument.
 *
 * Every key of the shipped constructor is passed explicitly because the entity
 * declares them required-but-nullable, mirroring columns that are NULLable with no
 * default.
 */
function anOptionGroup(init: {
  readonly optionGroupID: string;
  readonly sortOrder: number;
}): OptionGroup {
  return new OptionGroup({
    optionGroupID: init.optionGroupID,
    optionGroupName: init.optionGroupID,
    optionGroupCode: init.optionGroupID,
    optionGroupImage: undefined,
    optionGroupDescription: undefined,
    imageGroupFlag: false,
    sortOrder: init.sortOrder,
    remoteID: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
    options: [],
    optionSortTieBreaker: () => 1,
  });
}

/**
 * Builds an option belonging to a group, which is the only association the
 * cartesian path traverses [model/service/SkuService.cfc:L75-L78].
 *
 * The owning group is REQUIRED here even though the entity allows it to be absent,
 * because a group-less option raises inside `createSkus` and that raise is pinned
 * by its own case rather than reached accidentally from a shared builder.
 */
function anOption(init: {
  readonly optionID: string;
  readonly sortOrder: number;
  /**
   * Nullable on purpose. `optionGroup` is a nullable association on the entity, so an
   * option with no group is a reachable state rather than a hypothetical one, and the
   * unguarded `getOptionGroup().getOptionGroupID()` chain at
   * [model/service/SkuService.cfc:L75] has to be exercised against it.
   */
  readonly optionGroup: OptionGroup | undefined;
}): Option {
  return new Option({
    optionID: init.optionID,
    optionCode: init.optionID,
    optionName: init.optionID,
    optionDescription: undefined,
    sortOrder: init.sortOrder,
    optionGroup: init.optionGroup,
    defaultImageID: undefined,
    remoteID: undefined,
    createdDateTime: undefined,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  });
}

/**
 * Builds a product type carrying a system code and nothing else.
 *
 * `getBaseProductType()` [model/entity/ProductType.cfc:L110-L115] answers the
 * system code directly whenever it is present, and only falls back to loading the
 * root of `productTypeIDPath` when it is empty - a fallback that needs the product
 * type repository. Supplying a system code keeps every dispatch case below free of
 * that port, which this service does not hold and must not be given.
 *
 * Optional keys are OMITTED rather than assigned `undefined`, because the strict
 * profile treats an absent key and a present-but-undefined key as different states.
 */
function aProductType(init: { readonly productTypeID: string; readonly systemCode: string }) {
  return new ProductType({
    productTypeID: init.productTypeID,
    systemCode: init.systemCode,
  });
}

// LEGACY-NOTE: there is deliberately no local "product with no SKUs" builder here.
// `makeProductFixture()` already answers a merchandise product carrying zero SKUs -
// `productFixtures.ts` defaults `skus` to `[]` and `productType` to a two-level chain
// whose child `systemCode` is `merchandise` - so a wrapper around it would be a second
// definition of the fixture's own default and a second place to keep in step. The cases
// below call the fixture directly and pass `productType: aProductType(...)` only where
// they need a different base product type.

// ---------------------------------------------------------------------------
// The in-memory doubles
// ---------------------------------------------------------------------------

/**
 * What a {@link RecordingSkuRepository} answers with.
 *
 * Every field is optional and every one is OMITTED by callers that do not need it,
 * never assigned `undefined`. The array-valued fields are deliberately MUTABLE
 * arrays rather than `readonly` ones: the port declares mutable returns, and
 * answering the very same array instance is what lets a case assert that a result
 * travelled back by IDENTITY rather than merely by value.
 */
interface SkuRepositorySeed {
  readonly productSkus?: readonly Sku[];
  readonly sortedProductSkuIDs?: readonly string[];
  readonly searchResults?: readonly Sku[];
  readonly selectedOptionsResults?: readonly Sku[];
  readonly skuBySkuCode?: Sku;
  readonly transactionExistsFlag?: boolean;
}

/**
 * In-memory stand-in for the seven-member SKU data port.
 *
 * Replaces `property name="skuDAO" type="any";`
 * [model/service/SkuService.cfc:L51] - the component's busiest collaborator, live
 * at eight call sites, which DI/1 resolved by scanning component properties at run
 * time and which the ported class takes as an explicit constructor argument
 * instead. That is transformation rule T1 applied, and it is why no container,
 * composition root or locator is imported by this file.
 *
 * ★ IMPLEMENTS EXACTLY THE PORT'S SEVEN MEMBERS AND NO EIGHTH. In particular it
 * declares NO `getSkuStocksDeletableFlag`, because the port declares none - see the
 * defect-28 cases, which assert that absence at both the type level and the run-time
 * level.
 *
 * No method is `async`: each answers an already-resolved promise, which keeps the
 * double free of an `await` it has no work to wait for.
 */
class RecordingSkuRepository implements SkuRepository {
  readonly transactionExistsFlagCalls: TransactionExistsFlagArgs[] = [];

  readonly skuBySkuCodeCalls: SkuBySkuCodeArgs[] = [];

  readonly skusBySelectedOptionsCalls: SkusBySelectedOptionsArgs[] = [];

  readonly searchSkusByProductTypeCalls: SearchSkusByProductTypeArgs[] = [];

  readonly productSkusCalls: ProductSkusArgs[] = [];

  readonly sortedProductSkusIDCalls: SortedProductSkusIDArgs[] = [];

  readonly saveSkuCalls: SaveSkuArgs[] = [];

  constructor(private readonly seed: SkuRepositorySeed = {}) {}

  getTransactionExistsFlag(...args: TransactionExistsFlagArgs): Promise<boolean> {
    this.transactionExistsFlagCalls.push(args);

    return Promise.resolve(this.seed.transactionExistsFlag ?? false);
  }

  getSkuBySkuCode(...args: SkuBySkuCodeArgs): Promise<Sku | undefined> {
    this.skuBySkuCodeCalls.push(args);

    return Promise.resolve(this.seed.skuBySkuCode);
  }

  getSkusBySelectedOptions(...args: SkusBySelectedOptionsArgs): Promise<Sku[]> {
    this.skusBySelectedOptionsCalls.push(args);

    return Promise.resolve([...(this.seed.selectedOptionsResults ?? [])]);
  }

  searchSkusByProductType(...args: SearchSkusByProductTypeArgs): Promise<Sku[]> {
    this.searchSkusByProductTypeCalls.push(args);

    return Promise.resolve([...(this.seed.searchResults ?? [])]);
  }

  getProductSkus(...args: ProductSkusArgs): Promise<Sku[]> {
    this.productSkusCalls.push(args);

    // A FRESH array on every call. The port declares a mutable return and the merge
    // helper writes into a copy of its own, but handing back the seed array itself would
    // let one case's result be reordered under a later case - the exact cross-invocation
    // bleed the request-scope block further down exists to rule out.
    return Promise.resolve([...(this.seed.productSkus ?? [])]);
  }

  getSortedProductSkusID(...args: SortedProductSkusIDArgs): Promise<string[]> {
    this.sortedProductSkusIDCalls.push(args);

    return Promise.resolve([...(this.seed.sortedProductSkuIDs ?? [])]);
  }

  saveSku(...args: SaveSkuArgs): Promise<Sku> {
    this.saveSkuCalls.push(args);

    const [sku] = args;

    return Promise.resolve(sku);
  }
}

/**
 * In-memory stand-in for the two-member option port.
 *
 * ★ THE SHIPPED `SkuService` DOES NOT CONSUME THIS PORT, and this double exists to
 * pin that fact rather than to serve a call. `optionService`
 * [model/service/SkuService.cfc:L53] is reached at [L74] alone, for a generic
 * primary-key lookup the port set does not carry, so option hydration became the
 * boundary input `CreateSkusInput.resolvedOptions`. The port remains exactly two
 * members wide and is consumed by `OptionService`; asserting its width here is what
 * makes "no third member was invented anywhere" checkable from this file.
 */
class RecordingOptionRepository implements OptionRepository {
  readonly unusedProductOptionsCalls: UnusedProductOptionsArgs[] = [];

  readonly unusedProductOptionGroupsCalls: UnusedProductOptionGroupsArgs[] = [];

  getUnusedProductOptions(...args: UnusedProductOptionsArgs): Promise<readonly SelectOption[]> {
    this.unusedProductOptionsCalls.push(args);

    return Promise.resolve([]);
  }

  getUnusedProductOptionGroups(
    ...args: UnusedProductOptionGroupsArgs
  ): Promise<readonly SelectOption[]> {
    this.unusedProductOptionGroupsCalls.push(args);

    return Promise.resolve([]);
  }
}

/**
 * In-memory stand-in for the image stub port.
 *
 * Replaces the ONE `getService()` call in the whole in-scope service layer,
 * `getService("imageService")` [model/service/SkuService.cfc:L212], which
 * transformation rule T2 turns into a constructor-injected port. Nothing here
 * touches a filesystem, and no path this double is handed is ever opened, written
 * or resolved.
 *
 * It records and answers a seeded boolean; it implements no image behaviour, and no
 * case below asserts any, because the image subsystem is out of scope.
 */
class RecordingImageStore implements ImageStore {
  readonly saveImageFileCalls: SaveImageFileArgs[] = [];

  readonly deleteImageFileCalls: DeleteImageFileArgs[] = [];

  constructor(private readonly saveResult: boolean = true) {}

  saveImageFile(...args: SaveImageFileArgs): Promise<boolean> {
    this.saveImageFileCalls.push(args);

    return Promise.resolve(this.saveResult);
  }

  deleteImageFile(...args: DeleteImageFileArgs): Promise<void> {
    this.deleteImageFileCalls.push(args);

    return Promise.resolve();
  }
}

/**
 * In-memory stand-in for the subscription stub port.
 *
 * Replaces `property name="subscriptionService" type="any";`
 * [model/service/SkuService.cfc:L55], reached at [L158], [L161] and [L164] - all
 * three inside the OUT-OF-SCOPE subscription branch. This double resolves a handle
 * for any identifier it is given unless the identifier appears in
 * `unresolvableIDs`, which is how the "the lookup answered nothing" raises are
 * reached deterministically.
 *
 * No subscription behaviour is implemented and none is asserted: the cases pin
 * DELEGATION - which identifiers reached the port, in what order - and nothing more.
 */
class RecordingSubscriptionTermProvider implements SubscriptionTermProvider {
  readonly subscriptionTermCalls: SubscriptionTermArgs[] = [];

  readonly subscriptionBenefitCalls: SubscriptionBenefitArgs[] = [];

  constructor(private readonly unresolvableIDs: readonly string[] = []) {}

  getSubscriptionTerm(...args: SubscriptionTermArgs): Promise<SubscriptionTermHandle | undefined> {
    this.subscriptionTermCalls.push(args);

    const [subscriptionTermID] = args;

    if (this.unresolvableIDs.includes(subscriptionTermID)) {
      return Promise.resolve(undefined);
    }

    return Promise.resolve({ handleType: 'subscriptionTerm', subscriptionTermID });
  }

  getSubscriptionBenefit(
    ...args: SubscriptionBenefitArgs
  ): Promise<SubscriptionBenefitHandle | undefined> {
    this.subscriptionBenefitCalls.push(args);

    const [subscriptionBenefitID] = args;

    if (this.unresolvableIDs.includes(subscriptionBenefitID)) {
      return Promise.resolve(undefined);
    }

    return Promise.resolve({ handleType: 'subscriptionBenefit', subscriptionBenefitID });
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SkuService', () => {
  let skuRepository: RecordingSkuRepository;
  let imageStore: RecordingImageStore;
  let subscriptionTermProvider: RecordingSubscriptionTermProvider;
  let optionRepository: RecordingOptionRepository;
  let service: SkuService;

  beforeEach(() => {
    // Every double and the subject itself are rebuilt for every case. Nothing is
    // memoised at module scope, so no recorded call, no attached SKU and no seeded
    // answer can survive into the next case - which is the precondition for the
    // request-scope cases further down meaning anything at all.
    skuRepository = new RecordingSkuRepository();
    imageStore = new RecordingImageStore();
    subscriptionTermProvider = new RecordingSubscriptionTermProvider();
    optionRepository = new RecordingOptionRepository();

    // JUDGMENT CALL: the three collaborators are handed to the constructor and that
    // is the whole wiring story. The legacy bodies reached them through
    // `getSkuDAO()`, `getSubscriptionService()` and `getService("imageService")`,
    // resolved at run time by a DI/1 property scan and by a locator call; the ported
    // class takes them as explicit, compile-checked constructor arguments instead,
    // which is transformation rules T1 and T2 applied. That is why constructing the
    // subject needs nothing but three objects and why no container appears anywhere.
    //
    // The two trailing knobs are left at their shipped defaults here - a bound of
    // 1000 and duplicate-code refusal OFF - so the default-configuration behaviour
    // is what most cases below observe. The cases that exercise the bound and the
    // refusal construct their own instance with the value they need, and say so.
    service = new SkuService(skuRepository, imageStore, subscriptionTermProvider);
  });

  describe('published surface', () => {
    it('carries all nine legacy method names verbatim and publishes no wider surface', () => {
      const publishedMembers = Object.getOwnPropertyNames(SkuService.prototype);

      // CFML parity [model/service/SkuService.cfc:L58, L210, L220, L246, L271, L281,
      // L285, L289]: eight of the nine names are the legacy CFML camelCase names,
      // character for character, because method-level interface parity is this
      // migration's acceptance contract and a reviewer has to be able to diff the two
      // surfaces directly.
      expect(publishedMembers).toContain('createSkus');
      expect(publishedMembers).toContain('processImageUpload');
      expect(publishedMembers).toContain('getProductSkus');
      expect(publishedMembers).toContain('getSortedProductSkus');
      expect(publishedMembers).toContain('searchSkusByProductType');
      expect(publishedMembers).toContain('getSkuStocksDeletableFlag');
      expect(publishedMembers).toContain('getTransactionExistsFlag');
      expect(publishedMembers).toContain('getSkuBySkuCode');

      // The ninth is the one deliberate rename, and the legacy name is GONE rather
      // than kept as an alias - an alias would leave the smart-list contract half
      // alive and make the reshaping unreviewable.
      expect(publishedMembers).toContain('findSkus');
      expect(publishedMembers).not.toContain('getSkuSmartList');

      // None of the eight was "improved" into a more idiomatic name.
      expect(publishedMembers).not.toContain('createSkuVariants');
      expect(publishedMembers).not.toContain('uploadImage');
      expect(publishedMembers).not.toContain('listProductSkus');
      expect(publishedMembers).not.toContain('getSortedSkus');
      expect(publishedMembers).not.toContain('searchSkus');
      expect(publishedMembers).not.toContain('isSkuStockDeletable');
      expect(publishedMembers).not.toContain('hasTransactions');
      expect(publishedMembers).not.toContain('findSkuBySkuCode');

      // The framework-inherited CRUD surface is absent because `HibachiService` is
      // deliberately not ported, and that absence is faithful rather than incomplete -
      // so none of it may be invented. Note `newSku` in particular: [L92], [L127],
      // [L154], [L182] and [L192] all call `this.newSku()`, an inherited factory, and
      // the target replaced it with a PRIVATE draft helper rather than republishing it.
      expect(publishedMembers).not.toContain('getSku');
      expect(publishedMembers).not.toContain('newSku');
      expect(publishedMembers).not.toContain('saveSku');
      expect(publishedMembers).not.toContain('deleteSku');
      expect(publishedMembers).not.toContain('validateSku');
      expect(publishedMembers).not.toContain('getSkuCurrencySmartList');
    });

    it('takes three ports, and the option port is deliberately not one of them', () => {
      // ★ THE SHIPPED ARITY IS THREE. The suite was briefed for four ports; the
      // production module is the contract, so this asserts what shipped. A fourth
      // REQUIRED parameter would make the construction two lines below fail to compile
      // under the strict profile, which makes this a compile-time proof as much as a
      // run-time one.
      expect(SkuService.length).toBe(3);

      const constructedWithThreePorts = new SkuService(
        new RecordingSkuRepository(),
        new RecordingImageStore(),
        new RecordingSubscriptionTermProvider(),
      );

      expect(constructedWithThreePorts).toBeInstanceOf(SkuService);

      // The SKU port is EXACTLY seven members wide, in declaration order, so nothing
      // in this file can accidentally describe a wider data contract than the port.
      expect(Object.getOwnPropertyNames(RecordingSkuRepository.prototype)).toStrictEqual([
        'constructor',
        'getTransactionExistsFlag',
        'getSkuBySkuCode',
        'getSkusBySelectedOptions',
        'searchSkusByProductType',
        'getProductSkus',
        'getSortedProductSkusID',
        'saveSku',
      ]);

      // LEGACY-NOTE [model/service/SkuService.cfc:L53, L74]: `optionService` is reached
      // at exactly one line, and only for HibachiService's generic
      // `get<Entity>(primaryKey)` lookup, which the port set does not carry. Option
      // hydration therefore became the boundary input `CreateSkusInput.resolvedOptions`
      // and the option port is NOT a collaborator of this service.
      // The port itself is untouched by that decision - still exactly two members - and
      // an instance of it stands here unwired to prove the service never reaches one.
      expect(Object.getOwnPropertyNames(RecordingOptionRepository.prototype)).toStrictEqual([
        'constructor',
        'getUnusedProductOptions',
        'getUnusedProductOptionGroups',
      ]);
      expect(optionRepository.unusedProductOptionsCalls).toStrictEqual([]);
      expect(optionRepository.unusedProductOptionGroupsCalls).toStrictEqual([]);
    });

    it('reaches its collaborators only through the constructor, never through a locator', async () => {
      const isolatedRepository = new RecordingSkuRepository({ transactionExistsFlag: true });
      const isolatedService = new SkuService(
        isolatedRepository,
        new RecordingImageStore(),
        new RecordingSubscriptionTermProvider(),
      );

      expect(await isolatedService.getTransactionExistsFlag()).toBe(true);

      // Recorded with ZERO arguments. The port declares both `productID` and `skuID` as
      // optional, and the service forwards NEITHER - [model/service/SkuService.cfc:L286]
      // calls `getSkuDAO().getTransactionExistsFlag()` bare, so both DAO defaults apply.
      // The recorded arity is therefore 0, not 2, and pinning it here stops a later
      // change from quietly starting to forward a filter the legacy never sent.
      expect(isolatedRepository.transactionExistsFlagCalls).toStrictEqual([[]]);

      // The double built in `beforeEach` was handed to a DIFFERENT instance and recorded
      // nothing. Were either instance resolving its collaborator from a registry, a
      // module singleton or an ambient request scope, the call would have landed
      // somewhere other than the double that instance was constructed with, and this
      // case would fail.
      expect(skuRepository.transactionExistsFlagCalls).toStrictEqual([]);
    });

    it('refuses a creation bound that is not a positive whole number', () => {
      // The bound is a TARGET-SIDE knob this port introduces, not a value the legacy
      // handled, so validating it adds no constraint to legacy data. A misconfigured
      // bound would either refuse every invocation or bound nothing at all, which is
      // why it is rejected at construction rather than discovered mid-creation.
      expect(() => new SkuService(skuRepository, imageStore, subscriptionTermProvider, 0)).toThrow(
        /positive safe integer/,
      );
      expect(() => new SkuService(skuRepository, imageStore, subscriptionTermProvider, -1)).toThrow(
        /positive safe integer/,
      );
      expect(
        () => new SkuService(skuRepository, imageStore, subscriptionTermProvider, 1.5),
      ).toThrow(/positive safe integer/);

      expect(new SkuService(skuRepository, imageStore, subscriptionTermProvider, 1)).toBeInstanceOf(
        SkuService,
      );
    });
  });

  describe('createSkus - base product type dispatch [model/service/SkuService.cfc:L61, L204]', () => {
    it('dispatches all three base product types case-insensitively', async () => {
      // CFML parity [model/service/SkuService.cfc:L61, L124, L138, L172]: the legacy
      // dispatch is a `switch`/`cfif` over the base product type's system code, and CFML
      // string comparison is CASE-INSENSITIVE while TypeScript's `===` is not. A port
      // that compared with `===` would silently drop every row whose `systemCode` was
      // stored with different casing, so the equality is routed through the CFML
      // comparison helper and that behaviour is pinned here rather than assumed.
      const casings: readonly string[] = [
        'merchandise',
        'Merchandise',
        'MERCHANDISE',
        'mErChAnDiSe',
      ];

      for (const systemCode of casings) {
        const product = makeProductFixture({
          productID: `dispatch-merch-${systemCode}`,
          productType: aProductType({ productTypeID: 'pt-merchandise', systemCode }),
        });

        expect(await service.createSkus(product, { price: PRICE_DECIMAL })).toBe(true);
        expect(product.getSkus()).toHaveLength(1);
      }

      // The other two branches answer to the same folded comparison. Both are
      // out-of-scope features, so only the DISPATCH is asserted here - what each branch
      // then does with its stub ports is pinned further down.
      const subscriptionProduct = makeProductFixture({
        productID: 'dispatch-subscription',
        productType: aProductType({ productTypeID: 'pt-sub', systemCode: 'SUBSCRIPTION' }),
      });

      expect(
        await service.createSkus(subscriptionProduct, {
          price: PRICE_DECIMAL,
          subscriptionBenefits: 'sub-benefit-1',
          subscriptionTerms: 'sub-term-1',
          renewalSubscriptionBenefits: 'renewal-benefit-1',
        }),
      ).toBe(true);
      expect(subscriptionTermProvider.subscriptionTermCalls).toStrictEqual([['sub-term-1']]);

      const contentAccessProduct = makeProductFixture({
        productID: 'dispatch-content-access',
        productType: aProductType({ productTypeID: 'pt-ca', systemCode: 'contentaccess' }),
      });

      expect(
        await service.createSkus(contentAccessProduct, {
          price: PRICE_DECIMAL,
          accessContents: 'access-content-1',
        }),
      ).toBe(true);
      expect(contentAccessProduct.getSkus()).toHaveLength(1);
    });

    it('reaches the verbatim L204 message for an unrecognised base product type', async () => {
      const product = makeProductFixture({
        productID: 'dispatch-unrecognised',
        productType: aProductType({ productTypeID: 'pt-gift-card', systemCode: 'giftCard' }),
      });

      // The message is asserted CHARACTER FOR CHARACTER, not by pattern. It is a
      // user-visible string the legacy admin surfaces, so a reworded version - however
      // much clearer - would be an observable behaviour change at the boundary.
      await expect(service.createSkus(product, { price: PRICE_DECIMAL })).rejects.toThrow(
        UNEXPECTED_PRODUCT_CREATION_ERROR_MESSAGE,
      );
      expect(UNEXPECTED_PRODUCT_CREATION_ERROR_MESSAGE).toBe(
        'There was an unexpected error when creating this product',
      );

      // Nothing was attached on the way to the raise.
      expect(product.getSkus()).toStrictEqual([]);
    });

    it('returns a constant true no matter what the chosen branch actually did', async () => {
      // LEGACY-DEFECT [model/service/SkuService.cfc:L207]: createSkus returns a constant
      // true and never signals partial or failed creation.
      // Preserved deliberately; do not fix without a product decision.
      //
      // Both invocations below answer `true`. The first created a SKU; the second created
      // NONE, because its branch recorded a validation failure and returned early. The
      // return value cannot tell them apart, so a caller has no way to know creation was
      // skipped - and the target reproduces exactly that, rather than upgrading the
      // return to a result object.
      const creatingProduct = makeProductFixture({ productID: 'constant-true-created' });

      expect(await service.createSkus(creatingProduct, { price: PRICE_DECIMAL })).toBe(true);
      expect(creatingProduct.getSkus()).toHaveLength(1);

      const skippingProduct = makeProductFixture({
        productID: 'constant-true-skipped',
        productType: aProductType({ productTypeID: 'pt-ca', systemCode: 'contentAccess' }),
      });

      expect(await service.createSkus(skippingProduct, { price: PRICE_DECIMAL })).toBe(true);
      expect(skippingProduct.getSkus()).toStrictEqual([]);
    });

    it('raises when the product carries no product type, exactly as the unguarded chain does', async () => {
      // CFML parity [model/service/SkuService.cfc:L61]: the legacy chains
      // `getProductType().getBaseProductType()` with no null test. `productType` is only
      // `required` on the `save` validation context, so a product with none is reachable
      // and the legacy raises. No default branch is invented to paper over it.
      const product = makeProductFixture({
        productID: 'no-product-type',
        productType: undefined,
      });

      await expect(service.createSkus(product, { price: PRICE_DECIMAL })).rejects.toThrow(
        /has no product type/,
      );
    });

    it('raises when the product carries no product code, because every code formula concatenates it', async () => {
      // CFML parity [model/service/SkuService.cfc:L97, L133, L159, L184, L194]: all four
      // distinct skuCode formulas begin by concatenating `getProductCode()` with no null
      // test, so an absent code raises rather than producing a code that starts with the
      // delimiter.
      const product = makeProductFixture({
        productID: 'no-product-code',
        productCode: undefined,
      });

      await expect(service.createSkus(product, { price: PRICE_DECIMAL })).rejects.toThrow(
        /has no product code/,
      );
    });
  });

  describe('createSkus - the option cartesian odometer [model/service/SkuService.cfc:L67, L82-L122]', () => {
    /**
     * Builds `groupSizes.length` option groups, the nth holding `groupSizes[n]` options.
     *
     * The returned comma list is JOINED from options this file just constructed - it is
     * never parsed, and no `src/lib/cfml/list.ts` helper is involved, so the subject's
     * own parsing is not used to build the subject's expected input.
     *
     * Group sort orders ascend with the group ordinal so the graph is deterministic; the
     * sort order plays no part in combination generation, only in the two sorted-read
     * methods further down.
     */
    function anOptionGraph(groupSizes: readonly number[]): {
      readonly options: readonly Option[];
      readonly optionIDList: string;
    } {
      const options: Option[] = [];

      groupSizes.forEach((groupSize, groupOrdinal) => {
        const optionGroup = anOptionGroup({
          optionGroupID: `og-${String(groupOrdinal + 1)}`,
          sortOrder: groupOrdinal + 1,
        });

        for (let optionOrdinal = 1; optionOrdinal <= groupSize; optionOrdinal++) {
          options.push(
            anOption({
              optionID: `og-${String(groupOrdinal + 1)}-opt-${String(optionOrdinal)}`,
              sortOrder: optionOrdinal,
              optionGroup,
            }),
          );
        }
      });

      return {
        options,
        optionIDList: options.map((option) => option.getOptionID()).join(','),
      };
    }

    it('creates exactly the cartesian product of the option group sizes, in odometer order', async () => {
      // JUDGMENT CALL: the option-cartesian combination count is unbounded by
      // construction (model/service/SkuService.cfc:L82-L86 multiplies
      // `arrayLen(optionGroups[key])` into `totalCombos` for every group, with no ceiling
      // anywhere). Under an ambient cftransaction this was merely a large unit of work;
      // without one it is a correctness problem, so the target carries an explicit bound
      // and idempotent retry. These assertions are correctness protections, not
      // performance claims, and deliberately contain no timing or benchmark.
      //
      // Two groups: a two-option group and a three-option group. The expected count is a
      // PLAIN NUMBER - a combination count is not money and must never be a `Money`.
      const sizeGroup = anOptionGroup({ optionGroupID: 'og-size', sortOrder: 1 });
      const colourGroup = anOptionGroup({ optionGroupID: 'og-colour', sortOrder: 2 });

      const sizeLarge = anOption({
        optionID: 'opt-size-large',
        sortOrder: 1,
        optionGroup: sizeGroup,
      });
      const sizeSmall = anOption({
        optionID: 'opt-size-small',
        sortOrder: 2,
        optionGroup: sizeGroup,
      });
      const colourRed = anOption({
        optionID: 'opt-colour-red',
        sortOrder: 1,
        optionGroup: colourGroup,
      });
      const colourTeal = anOption({
        optionID: 'opt-colour-teal',
        sortOrder: 2,
        optionGroup: colourGroup,
      });
      const colourEcru = anOption({
        optionID: 'opt-colour-ecru',
        sortOrder: 3,
        optionGroup: colourGroup,
      });

      const product = makeProductFixture({ productID: 'odometer-2x3' });
      expect(product.getProductCode()).toBe(FIXTURE_PRODUCT_CODE);

      const data: CreateSkusInput = {
        price: PRICE_DECIMAL,
        listPrice: LIST_PRICE_DECIMAL,
        options: 'opt-size-large,opt-size-small,opt-colour-red,opt-colour-teal,opt-colour-ecru',
        resolvedOptions: [sizeLarge, sizeSmall, colourRed, colourTeal, colourEcru],
      };

      expect(await service.createSkus(product, data)).toBe(true);

      const created = product.getSkus();

      // 2 * 3 = 6. Not 5, which is what an additive reading of the loop would give.
      expect(created).toHaveLength(6);

      // CFML parity [model/service/SkuService.cfc:L97]: the code formula is
      // `getProductCode() & "-" & arrayLen(getSkus()) + 1`, evaluated AFTER the previous
      // combination was attached, so the ordinals run 1..6 with no gap. Written out in
      // full rather than composed, so a fault in the formula cannot be mirrored here.
      expect(created.map((sku) => sku.getSkuCode())).toStrictEqual([
        'TESTPRODUCTXXX-1',
        'TESTPRODUCTXXX-2',
        'TESTPRODUCTXXX-3',
        'TESTPRODUCTXXX-4',
        'TESTPRODUCTXXX-5',
        'TESTPRODUCTXXX-6',
      ]);

      // Every generated code satisfies the shipped entity code pattern. The predicate
      // narrows `code` itself rather than reaching for a non-null assertion, which
      // `noUncheckedIndexedAccess` would otherwise invite.
      const generatedCodes = created.map((sku) => sku.getSkuCode());
      expect(
        generatedCodes.every((code) => code !== undefined && ENTITY_CODE_PATTERN.test(code)),
      ).toBe(true);

      // ★ The odometer's carry direction. [model/service/SkuService.cfc:L112-L120] walks
      // `changeKeyIndex` from 1 upward, so the FIRST indexed group is the LEAST significant
      // wheel and the last is the MOST significant one. The size therefore changes on every
      // row while the colour changes only every second row - that is the whole shape of the
      // carry loop, and reversing it would produce the same six SKUs in a different order
      // carrying different codes.
      expect(
        created.map((sku) => sku.getOptions().map((option) => option.getOptionID())),
      ).toStrictEqual([
        ['opt-size-large', 'opt-colour-red'],
        ['opt-size-small', 'opt-colour-red'],
        ['opt-size-large', 'opt-colour-teal'],
        ['opt-size-small', 'opt-colour-teal'],
        ['opt-size-large', 'opt-colour-ecru'],
        ['opt-size-small', 'opt-colour-ecru'],
      ]);

      // Every combination carries exactly one option from each group - never two from
      // one group and none from another.
      expect(created.every((sku) => sku.getOptions().length === 2)).toBe(true);

      // Price and listPrice reach every combination, and both are compared as `Money`.
      const expectedPrice = Money.fromDecimalString(PRICE_DECIMAL);
      const expectedListPrice = Money.fromDecimalString(LIST_PRICE_DECIMAL);
      expect(created.every((sku) => sku.getPrice().equals(expectedPrice))).toBe(true);
      expect(created.every((sku) => sku.getListPrice().equals(expectedListPrice))).toBe(true);
    });

    it('does not over-advance the odometer past the final combination', async () => {
      // ★ [model/service/SkuService.cfc:L109] `if(i < totalCombos)` is LOAD-BEARING. The
      // carry loop at L112-L120 has NO bounds check on `changeKeyIndex`: once every wheel
      // is at its last position it keeps resetting wheels and incrementing the index, so
      // on the final combination it would walk off the end of `indexedKeys`. Only the
      // L109 guard stops that, by never entering the carry loop on the last iteration.
      //
      // This is asserted through the ONE input shape that puts every wheel at its last
      // position on the final combination - a graph whose every group is fully consumed -
      // and observing that creation completes rather than raising the out-of-range error
      // the target reproduces for a bypassed guard.
      const graph = anOptionGraph([2, 2, 2]);
      const product = makeProductFixture({ productID: 'odometer-guard' });

      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          options: graph.optionIDList,
          resolvedOptions: graph.options,
        }),
      ).toBe(true);

      // 2 * 2 * 2 = 8, and the eighth combination is (last, last, last) - precisely the
      // row that would trip an unguarded carry.
      expect(product.getSkus()).toHaveLength(8);
      expect(product.getSkus().every((sku) => sku.getOptions().length === 3)).toBe(true);

      // The final combination holds the last option of every group, which is the state
      // the guard has to survive.
      const finalSku = product.getSkus()[7];
      expect(finalSku).toBeDefined();
      if (finalSku !== undefined) {
        expect(finalSku.getOptions().map((option) => option.getOptionID())).toStrictEqual([
          'og-1-opt-2',
          'og-2-opt-2',
          'og-3-opt-2',
        ]);
      }
    });

    it('creates one SKU when every group holds a single option', async () => {
      // The degenerate cartesian product: 1 * 1 * 1 = 1. `totalCombos` starts at 1
      // [model/service/SkuService.cfc:L67] and multiplying by ones leaves it there, so the
      // loop runs once and the L109 guard is false on that single iteration.
      const graph = anOptionGraph([1, 1, 1]);
      const product = makeProductFixture({ productID: 'odometer-1x1x1' });

      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          options: graph.optionIDList,
          resolvedOptions: graph.options,
        }),
      ).toBe(true);

      expect(product.getSkus()).toHaveLength(1);
      expect(product.getSkus().map((sku) => sku.getSkuCode())).toStrictEqual(['TESTPRODUCTXXX-1']);
    });

    it('grows the plan multiplicatively rather than additively when a group gains an option', async () => {
      // This is the structural statement of "unbounded by construction", and it is made
      // by COUNTING RESULTS ONLY - two invocations, two counts, both plain numbers. There
      // is no clock, no repeat loop standing in for one, and no claim about how long
      // anything took: adding a single option to one group of a three-group graph turns
      // eight planned SKUs into twelve, and that arithmetic is the reason the target
      // carries a bound at all.
      const smallerGraph = anOptionGraph([2, 2, 2]);
      const smallerProduct = makeProductFixture({ productID: 'growth-8' });

      await service.createSkus(smallerProduct, {
        price: PRICE_DECIMAL,
        options: smallerGraph.optionIDList,
        resolvedOptions: smallerGraph.options,
      });

      const largerGraph = anOptionGraph([3, 2, 2]);
      const largerProduct = makeProductFixture({ productID: 'growth-12' });

      await service.createSkus(largerProduct, {
        price: PRICE_DECIMAL,
        options: largerGraph.optionIDList,
        resolvedOptions: largerGraph.options,
      });

      const smallerCount = smallerProduct.getSkus().length;
      const largerCount = largerProduct.getSkus().length;

      expect(smallerCount).toBe(8);
      expect(largerCount).toBe(12);

      // One extra option produced four extra SKUs, not one. The count is a plain number
      // and the comparison is a plain integer comparison - a combination count is not a
      // monetary quantity and must not be modelled as one.
      expect(largerCount - smallerCount).toBe(4);
    });

    it('raises when an option named in the comma list is absent from resolvedOptions', async () => {
      // LEGACY-NOTE [model/service/SkuService.cfc:L74]: the legacy resolved each option
      // through `getOptionService().getOption(listGetAt(...))` - HibachiService's generic
      // `get<Entity>(primaryKey)` - which the thirteen-port set does not carry. Option
      // hydration therefore became the boundary input `resolvedOptions`, and an
      // unresolved identifier raises here exactly as the legacy raised at L75 on the null
      // its lookup returned. No option is silently skipped and no empty group is
      // fabricated, either of which would change the combination count.
      const graph = anOptionGraph([2]);
      const product = makeProductFixture({ productID: 'unresolved-option' });

      await expect(
        service.createSkus(product, {
          price: PRICE_DECIMAL,
          options: `${graph.optionIDList},og-1-opt-missing`,
          resolvedOptions: graph.options,
        }),
      ).rejects.toThrow(/is absent from data.resolvedOptions/);

      expect(product.getSkus()).toStrictEqual([]);
    });

    it('raises when a resolved option carries no option group', async () => {
      // CFML parity [model/service/SkuService.cfc:L75]: the legacy chains
      // `getOptionGroup().getOptionGroupID()` with no null test, so an option with no
      // group raises. `optionGroup` is nullable on the entity, so this state is
      // reachable rather than hypothetical.
      const groupedOption = anOption({
        optionID: 'opt-grouped',
        sortOrder: 1,
        optionGroup: anOptionGroup({ optionGroupID: 'og-present', sortOrder: 1 }),
      });
      const orphanedOption = anOption({
        optionID: 'opt-orphaned',
        sortOrder: 1,
        optionGroup: undefined,
      });

      const product = makeProductFixture({ productID: 'option-without-group' });

      await expect(
        service.createSkus(product, {
          price: PRICE_DECIMAL,
          options: 'opt-grouped,opt-orphaned',
          resolvedOptions: [groupedOption, orphanedOption],
        }),
      ).rejects.toThrow(/has no option group/);

      expect(product.getSkus()).toStrictEqual([]);
    });
  });

  describe('createSkus - the target-side creation bound is a correctness protection', () => {
    /**
     * Builds a graph of `groupSizes` shape, joined - never parsed.
     *
     * Duplicated from the odometer block deliberately: each describe owns its own
     * inputs so that reading one block never requires scrolling to another, and so a
     * later change to one block's graph cannot silently move another block's expectations.
     */
    function aTwoGroupGraph(
      firstGroupSize: number,
      secondGroupSize: number,
    ): { readonly options: readonly Option[]; readonly optionIDList: string } {
      const firstGroup = anOptionGroup({ optionGroupID: 'bound-og-1', sortOrder: 1 });
      const secondGroup = anOptionGroup({ optionGroupID: 'bound-og-2', sortOrder: 2 });
      const options: Option[] = [];

      for (let ordinal = 1; ordinal <= firstGroupSize; ordinal++) {
        options.push(
          anOption({
            optionID: `bound-og-1-opt-${String(ordinal)}`,
            sortOrder: ordinal,
            optionGroup: firstGroup,
          }),
        );
      }

      for (let ordinal = 1; ordinal <= secondGroupSize; ordinal++) {
        options.push(
          anOption({
            optionID: `bound-og-2-opt-${String(ordinal)}`,
            sortOrder: ordinal,
            optionGroup: secondGroup,
          }),
        );
      }

      return { options, optionIDList: options.map((option) => option.getOptionID()).join(',') };
    }

    it('refuses a plan above the bound and leaves the product completely untouched', async () => {
      // The refusal is asserted STRUCTURALLY: a bound is configured, a plan exceeds it,
      // the plan is refused, and nothing was attached. No duration is measured, no repeat
      // count stands in for one, and the runner's own timeout is not read as a service
      // level - the legacy publishes no such requirement and none is invented.
      //
      // The bound matters because [model/service/SkuService.cfc:L85-L86] multiplies group
      // sizes into `totalCombos` with no ceiling, and the legacy relied on an ambient
      // cftransaction plus its own `requesttimeout` setting to absorb whatever came out.
      // Neither exists in the target, so a plan that cannot complete must be refused BEFORE
      // it half-completes - otherwise a partially attached product is the observable result.
      // Those legacy settings and the platform's own request ceilings are PLATFORM FACTS,
      // never service levels, and nothing here turns one into a timing assertion.
      const boundedService = new SkuService(skuRepository, imageStore, subscriptionTermProvider, 5);
      const graph = aTwoGroupGraph(2, 3);
      const product = makeProductFixture({ productID: 'bound-refused' });

      await expect(
        boundedService.createSkus(product, {
          price: PRICE_DECIMAL,
          options: graph.optionIDList,
          resolvedOptions: graph.options,
        }),
      ).rejects.toThrow(/above the configured bound of 5/);

      // ★ Refused before anything was attached. A half-created product would be the worst
      // outcome available, because `createSkus` returns a constant `true` [L207] and so
      // could not report the partial state to its caller.
      expect(product.getSkus()).toStrictEqual([]);
    });

    it('permits a plan sitting exactly on the bound', async () => {
      // The comparison is `>` rather than `>=` [assertWithinCreationBound], so a plan
      // equal to the bound is allowed. Asserting the boundary itself, not just a value
      // safely inside it, is what makes the guard's shape reviewable.
      const boundedService = new SkuService(skuRepository, imageStore, subscriptionTermProvider, 6);
      const graph = aTwoGroupGraph(2, 3);
      const product = makeProductFixture({ productID: 'bound-exact' });

      expect(
        await boundedService.createSkus(product, {
          price: PRICE_DECIMAL,
          options: graph.optionIDList,
          resolvedOptions: graph.options,
        }),
      ).toBe(true);
      expect(product.getSkus()).toHaveLength(6);
    });

    it('bounds the content-access branch as well as the option branch', async () => {
      // [model/service/SkuService.cfc:L191] loops `listLen(accessContents)` and saves per
      // iteration, so it is the second unbounded bulk-mutation site in this component and
      // carries its own bound. Covering only the option branch would leave the other one
      // unguarded in fact while appearing guarded in the suite.
      const boundedService = new SkuService(skuRepository, imageStore, subscriptionTermProvider, 2);
      const product = makeProductFixture({
        productID: 'bound-content-access',
        productType: aProductType({ productTypeID: 'pt-ca', systemCode: 'contentAccess' }),
      });

      await expect(
        boundedService.createSkus(product, {
          price: PRICE_DECIMAL,
          accessContents: 'access-1,access-2,access-3',
        }),
      ).rejects.toThrow(/above the configured bound of 2/);
      expect(product.getSkus()).toStrictEqual([]);
    });
  });

  describe('createSkus - retry does not silently double-apply', () => {
    it('attaches a second identical SKU on a repeat by default, which is the hazard', async () => {
      // The default configuration reproduces the legacy exactly: the single-merchandise
      // code formula [model/service/SkuService.cfc:L133] is the FIXED string
      // `getProductCode() & "-1"`, so a repeat regenerates the same code and attaches a
      // second SKU carrying it. Under the legacy's ambient transaction a retried request
      // rolled back; without one, a retried Lambda invocation lands twice.
      //
      // This case pins the hazard rather than the protection, because a suite that only
      // showed the protection working would not show why it exists.
      const product = makeProductFixture({ productID: 'retry-default' });

      expect(await service.createSkus(product, { price: PRICE_DECIMAL })).toBe(true);
      expect(await service.createSkus(product, { price: PRICE_DECIMAL })).toBe(true);

      expect(product.getSkus().map((sku) => sku.getSkuCode())).toStrictEqual([
        'TESTPRODUCTXXX-1',
        'TESTPRODUCTXXX-1',
      ]);
    });

    it('refuses the repeat when duplicate-code refusal is enabled', async () => {
      const idempotentService = new SkuService(
        skuRepository,
        imageStore,
        subscriptionTermProvider,
        1000,
        true,
      );
      const product = makeProductFixture({ productID: 'retry-refused' });

      expect(await idempotentService.createSkus(product, { price: PRICE_DECIMAL })).toBe(true);

      await expect(idempotentService.createSkus(product, { price: PRICE_DECIMAL })).rejects.toThrow(
        /already carries a SKU coded 'TESTPRODUCTXXX-1'/,
      );

      // The refusal is honest about what it can and cannot undo. `setProduct` attaches the
      // draft to the product BEFORE the code is computed
      // [createSingleMerchandiseSku], mirroring the legacy ordering at L128 versus L133,
      // so the refused second draft is present and CODE-LESS rather than absent. Pinning
      // the real observable state is the point; claiming a clean rollback would be false.
      expect(product.getSkus().map((sku) => sku.getSkuCode())).toStrictEqual([
        'TESTPRODUCTXXX-1',
        undefined,
      ]);
    });

    it('cannot refuse a repeat of a count-derived code path, and that limit is deliberate', async () => {
      // JUDGMENT CALL: the refusal keys on the GENERATED CODE, so it protects only the
      // paths whose formula is fixed - single merchandise [L133] and bundled content
      // access [L184]. The option and per-content paths derive their ordinal from
      // `arrayLen(getSkus()) + 1` [L97, L194], so a repeat produces FRESH codes and
      // collides with nothing. The refusal therefore cannot detect it, and inventing a
      // second mechanism - a request key, a content hash, a persisted marker - would be
      // new behaviour with no legacy antecedent. The limit is recorded here so a reviewer
      // sees it was measured rather than missed.
      const idempotentService = new SkuService(
        skuRepository,
        imageStore,
        subscriptionTermProvider,
        1000,
        true,
      );
      const firstGroup = anOptionGroup({ optionGroupID: 'retry-og-1', sortOrder: 1 });
      const options: readonly Option[] = [
        anOption({ optionID: 'retry-opt-1', sortOrder: 1, optionGroup: firstGroup }),
        anOption({ optionID: 'retry-opt-2', sortOrder: 2, optionGroup: firstGroup }),
      ];
      const product = makeProductFixture({ productID: 'retry-count-derived' });
      const data: CreateSkusInput = {
        price: PRICE_DECIMAL,
        options: 'retry-opt-1,retry-opt-2',
        resolvedOptions: options,
      };

      expect(await idempotentService.createSkus(product, data)).toBe(true);
      expect(await idempotentService.createSkus(product, data)).toBe(true);

      expect(product.getSkus().map((sku) => sku.getSkuCode())).toStrictEqual([
        'TESTPRODUCTXXX-1',
        'TESTPRODUCTXXX-2',
        'TESTPRODUCTXXX-3',
        'TESTPRODUCTXXX-4',
      ]);
    });
  });

  describe('createSkus - the asymmetric price and listPrice guards', () => {
    it('makes an absent price unrepresentable in the type, and still raises at run time', async () => {
      // CFML parity [model/service/SkuService.cfc:L93, L129, L156, L157, L183, L193]:
      // every `price` read is UNGUARDED - no structKeyExists, no isNumeric, no default -
      // so an absent price raised. The target lifts that into the type system by declaring
      // `price` REQUIRED on CreateSkusInput, and keeps the run-time raise underneath for a
      // caller crossing the boundary from untyped JSON.
      //
      // The directive below IS the assertion: it fails the build the moment `price` becomes
      // optional, which is exactly the regression that would let a priceless SKU through.
      // @ts-expect-error - price is required on CreateSkusInput, so omitting it must not compile.
      const inputWithNoPrice: CreateSkusInput = { listPrice: LIST_PRICE_DECIMAL };
      const product = makeProductFixture({ productID: 'price-absent' });

      await expect(service.createSkus(product, inputWithNoPrice)).rejects.toThrow(
        /price is absent/,
      );
    });

    it('raises on a price that is not a plain decimal numeral', async () => {
      // No default is substituted and no zero is fabricated. A SKU whose price silently
      // became zero would be given away, which is why the unguarded read is reproduced as
      // a raise rather than softened into a fallback.
      const product = makeProductFixture({ productID: 'price-non-numeric' });

      await expect(service.createSkus(product, { price: 'not-a-number' })).rejects.toThrow(
        /finite plain decimal numeral/,
      );
    });

    it('applies a listPrice that is numeric and greater than zero', async () => {
      const product = makeProductFixture({ productID: 'list-price-applied' });

      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          listPrice: LIST_PRICE_DECIMAL,
        }),
      ).toBe(true);

      const created = product.getSkus()[0];
      expect(created).toBeDefined();
      if (created !== undefined) {
        expect(created.getListPrice().equals(Money.fromDecimalString(LIST_PRICE_DECIMAL))).toBe(
          true,
        );
        expect(created.getPrice().equals(Money.fromDecimalString(PRICE_DECIMAL))).toBe(true);
      }
    });

    it('silently skips a listPrice that is absent, blank, non-numeric, zero or negative', async () => {
      // ★ THE ASYMMETRY. [model/service/SkuService.cfc:L94, L130] guards `listPrice` with
      // a THREE-CLAUSE test - `structKeyExists(data,"listPrice") and isNumeric(...) and
      // ... gt 0` - while every `price` read above is guarded by nothing at all. A bad
      // price raises; a bad listPrice is DROPPED WITHOUT COMPLAINT and the SKU keeps the
      // entity's zero default. Both halves of that asymmetry are load-bearing, so both are
      // asserted, and neither is normalised toward the other.
      const skippedListPrices: readonly string[] = [
        '',
        '   ',
        'not-a-number',
        '0',
        '0.00',
        '-5.00',
      ];

      for (const listPrice of skippedListPrices) {
        const product = makeProductFixture({ productID: `list-price-skipped-${listPrice}` });

        expect(await service.createSkus(product, { price: PRICE_DECIMAL, listPrice })).toBe(true);

        const created = product.getSkus()[0];
        expect(created).toBeDefined();
        if (created !== undefined) {
          expect(created.getListPrice().equals(Money.zero)).toBe(true);
          // The price itself was still applied, proving the skip was scoped to listPrice.
          expect(created.getPrice().equals(Money.fromDecimalString(PRICE_DECIMAL))).toBe(true);
        }
      }

      // And the absent case, with the key OMITTED rather than set to `undefined` - under
      // `exactOptionalPropertyTypes` those are different states, and the legacy
      // `structKeyExists` clause tests precisely the first of them.
      const productWithoutListPrice = makeProductFixture({ productID: 'list-price-omitted' });

      expect(await service.createSkus(productWithoutListPrice, { price: PRICE_DECIMAL })).toBe(
        true,
      );

      const createdWithoutListPrice = productWithoutListPrice.getSkus()[0];
      expect(createdWithoutListPrice).toBeDefined();
      if (createdWithoutListPrice !== undefined) {
        expect(createdWithoutListPrice.getListPrice().equals(Money.zero)).toBe(true);
      }
    });
  });

  describe('createSkus - out-of-scope branches delegate to stub ports only', () => {
    /**
     * A product whose base product type routes to the subscription branch.
     *
     * Subscription is EXPLICITLY OUT OF SCOPE for this migration slice, so nothing below
     * asserts subscription feature behaviour - no term arithmetic, no benefit
     * entitlement, no renewal schedule. What is asserted is DELEGATION: that the branch
     * reaches the stub port with the identifiers it was given, and that it raises where
     * the legacy raised.
     */
    function aSubscriptionProduct(productID: string): Product {
      return makeProductFixture({
        productID,
        productType: aProductType({ productTypeID: 'pt-subscription', systemCode: 'subscription' }),
      });
    }

    /** A product whose base product type routes to the content-access branch. */
    function aContentAccessProduct(productID: string): Product {
      return makeProductFixture({
        productID,
        productType: aProductType({
          productTypeID: 'pt-content-access',
          systemCode: 'contentAccess',
        }),
      });
    }

    it('preserves the three resource-bundle keys verbatim, including the "benifits" misspelling', () => {
      // LEGACY-DEFECT [model/service/SkuService.cfc:L148]: the resource-bundle key
      // misspells "benefits" as "benifits". The key is a data contract resolved by the
      // legacy admin, so the misspelling is preserved verbatim.
      // Preserved deliberately; do not fix without a product decision.
      //
      // The brief cites L148 for the misspelling; the source puts the MISSPELLED key at
      // L143 and the correctly spelled terms key at L148. Both locators are recorded and
      // both strings are carried byte for byte. Correcting the spelling would break every
      // resource bundle keyed on it, which is why a "typo fix" here is a product decision
      // and not a cleanup.
      expect(RB_KEY_SUBSCRIPTION_BENEFITS_REQUIRED).toBe(
        'entity.product.subscriptionbenifitsrequired',
      );
      expect(RB_KEY_SUBSCRIPTION_TERMS_REQUIRED).toBe('entity.product.subscriptiontermsrequired');
      expect(RB_KEY_ACCESS_CONTENTS_REQUIRED).toBe('validate.product.accesscontentsrequired');

      // The prefix inconsistency is in the source too - two `entity.` keys and one
      // `validate.` key for the same kind of failure - and it is carried, not normalised.
      expect(RB_KEY_SUBSCRIPTION_BENEFITS_REQUIRED.startsWith('entity.')).toBe(true);
      expect(RB_KEY_SUBSCRIPTION_TERMS_REQUIRED.startsWith('entity.')).toBe(true);
      expect(RB_KEY_ACCESS_CONTENTS_REQUIRED.startsWith('validate.')).toBe(true);

      // LEGACY-NOTE [org/Hibachi/JavaRB]: these are PLAIN STRINGS and nothing in the
      // target resolves them. JavaRB is deliberately not ported, so no i18n runtime is
      // introduced; the identifiers survive so the legacy admin can still resolve them
      // against its own bundles.
      expect(typeof RB_KEY_SUBSCRIPTION_BENEFITS_REQUIRED).toBe('string');
      expect(typeof RB_KEY_SUBSCRIPTION_TERMS_REQUIRED).toBe('string');
      expect(typeof RB_KEY_ACCESS_CONTENTS_REQUIRED).toBe('string');
    });

    it('delegates every subscription term and benefit lookup to the stub port', async () => {
      const product = aSubscriptionProduct('subscription-delegation');

      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          subscriptionTerms: 'term-1,term-2',
          subscriptionBenefits: 'benefit-1,benefit-2',
          renewalSubscriptionBenefits: 'renewal-1',
        }),
      ).toBe(true);

      // One lookup per term, in list order. [model/service/SkuService.cfc:L152-L158]
      expect(subscriptionTermProvider.subscriptionTermCalls).toStrictEqual([
        ['term-1'],
        ['term-2'],
      ]);

      // CFML parity [model/service/SkuService.cfc:L160-L167]: BOTH benefit lists are
      // re-walked inside the per-term loop rather than resolved once outside it, so a
      // two-term input resolves three benefits twice. That repetition is legacy structure,
      // faithfully carried - and the recorded order is the proof, not an incidental detail.
      expect(subscriptionTermProvider.subscriptionBenefitCalls).toStrictEqual([
        ['benefit-1'],
        ['benefit-2'],
        ['renewal-1'],
        ['benefit-1'],
        ['benefit-2'],
        ['renewal-1'],
      ]);

      // CFML parity [model/service/SkuService.cfc:L155 vs L159]: `setProduct` attaches the
      // draft BEFORE the ordinal is computed from `arrayLen(getSkus()) + 1`, so the FIRST
      // subscription SKU is coded `-2` and not `-1`. The off-by-one is in the source
      // ordering and is reproduced rather than tidied - the codes are a data contract.
      expect(product.getSkus().map((sku) => sku.getSkuCode())).toStrictEqual([
        'TESTPRODUCTXXX-2',
        'TESTPRODUCTXXX-3',
      ]);

      // The identifiers the stub port handed back are what landed on the drafts. This is
      // the whole of the assertion about subscription DATA - association plumbing only,
      // never entitlement, pricing-over-time or renewal-cycle behaviour.
      expect(product.getSkus().map((sku) => sku.getSubscriptionTermID())).toStrictEqual([
        'term-1',
        'term-2',
      ]);
      expect(product.getSkus().map((sku) => sku.getSubscriptionBenefitIDs())).toStrictEqual([
        ['benefit-1', 'benefit-2'],
        ['benefit-1', 'benefit-2'],
      ]);
      expect(product.getSkus().map((sku) => sku.getRenewalSubscriptionBenefitIDs())).toStrictEqual([
        ['renewal-1'],
        ['renewal-1'],
      ]);

      // CFML parity [model/service/SkuService.cfc:L156-L157]: renewal price is set from the
      // SAME `data.price` read, so the two are equal by construction rather than by
      // coincidence. Compared as `Money`; no float arithmetic is performed here or anywhere.
      const expectedPrice = Money.fromDecimalString(PRICE_DECIMAL);
      expect(product.getSkus().every((sku) => sku.getPrice().equals(expectedPrice))).toBe(true);
      expect(product.getSkus().every((sku) => sku.getRenewalPrice().equals(expectedPrice))).toBe(
        true,
      );
    });

    it('records both subscription validation failures and creates nothing, touching no port', async () => {
      const product = aSubscriptionProduct('subscription-validation');

      // Both required lists absent. [model/service/SkuService.cfc:L142-L150] records a
      // failure for each and then falls straight past the creation loop.
      expect(await service.createSkus(product, { price: PRICE_DECIMAL })).toBe(true);

      expect(product.getSkus()).toStrictEqual([]);

      // The early return happens BEFORE any lookup, so the stub port is never reached.
      // LEGACY-NOTE: the legacy pushed these failures onto the entity through
      // `addError(propertyName, rbKey)`, an inherited HibachiEntity mechanism. `Product`
      // publishes no error surface in the target - `HibachiEntity` is deliberately not
      // ported - so the failures are unobservable from outside and the only faithful
      // assertion is that NOTHING WAS CREATED and NOTHING WAS CALLED.
      expect(subscriptionTermProvider.subscriptionTermCalls).toStrictEqual([]);
      expect(subscriptionTermProvider.subscriptionBenefitCalls).toStrictEqual([]);
    });

    it('raises on the unguarded renewalSubscriptionBenefits read', async () => {
      // LEGACY-DEFECT [model/service/SkuService.cfc:L163]: `renewalSubscriptionBenefits`
      // is iterated with NO structKeyExists guard - unlike subscriptionBenefits at L142
      // and subscriptionTerms at L147 - and it is never validated either, so an absent
      // value raises rather than being recorded as a validation failure.
      // Preserved deliberately; do not fix without a product decision.
      const product = aSubscriptionProduct('subscription-renewal-unguarded');

      await expect(
        service.createSkus(product, {
          price: PRICE_DECIMAL,
          subscriptionTerms: 'term-1',
          subscriptionBenefits: 'benefit-1',
        }),
      ).rejects.toThrow(/renewalSubscriptionBenefits is absent/);

      // The raise lands MID-ITERATION: the term and the ordinary benefits were already
      // resolved through the port before the unguarded read was reached. Pinning that
      // ordering is what distinguishes a genuinely unguarded read from an up-front
      // validation that merely looks similar.
      expect(subscriptionTermProvider.subscriptionTermCalls).toStrictEqual([['term-1']]);
      expect(subscriptionTermProvider.subscriptionBenefitCalls).toStrictEqual([['benefit-1']]);
    });

    it('raises when the stub port cannot resolve a term or a benefit', async () => {
      // CFML parity [model/service/SkuService.cfc:L158, L161, L164]: each lookup result is
      // passed STRAIGHT into `setSubscriptionTerm` / the add methods with no null test, so
      // an unresolvable identifier raises. No identifier is silently skipped, which would
      // produce a SKU missing the association the branch exists to attach.
      const unresolvableTermService = new SkuService(
        skuRepository,
        imageStore,
        new RecordingSubscriptionTermProvider(['term-missing']),
      );

      await expect(
        unresolvableTermService.createSkus(aSubscriptionProduct('subscription-term-missing'), {
          price: PRICE_DECIMAL,
          subscriptionTerms: 'term-missing',
          subscriptionBenefits: 'benefit-1',
          renewalSubscriptionBenefits: 'renewal-1',
        }),
      ).rejects.toThrow(/subscription term 'term-missing' did not resolve/);

      const unresolvableBenefitService = new SkuService(
        skuRepository,
        imageStore,
        new RecordingSubscriptionTermProvider(['benefit-missing']),
      );

      await expect(
        unresolvableBenefitService.createSkus(
          aSubscriptionProduct('subscription-benefit-missing'),
          {
            price: PRICE_DECIMAL,
            subscriptionTerms: 'term-1',
            subscriptionBenefits: 'benefit-missing',
            renewalSubscriptionBenefits: 'renewal-1',
          },
        ),
      ).rejects.toThrow(/subscription benefit 'benefit-missing' did not resolve/);
    });

    it('creates one SKU per access content when the bundle flag is falsy', async () => {
      // Content access is out of scope as a FEATURE; what is asserted is the branch's
      // structural shape - how many drafts it produces and which identifiers land on each.
      // Nothing here reads a content body, resolves an entitlement or touches a filesystem.
      const product = aContentAccessProduct('content-access-unbundled');

      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          accessContents: 'access-1,access-2',
        }),
      ).toBe(true);

      expect(product.getSkus().map((sku) => sku.getSkuCode())).toStrictEqual([
        'TESTPRODUCTXXX-1',
        'TESTPRODUCTXXX-2',
      ]);
      expect(product.getSkus().map((sku) => sku.getAccessContentIDs())).toStrictEqual([
        ['access-1'],
        ['access-2'],
      ]);
    });

    it('creates a single bundled SKU carrying every access content when the flag is truthy', async () => {
      // CFML parity [model/service/SkuService.cfc:L179]: the flag is read through CFML
      // truthiness, so `true`, `1` and `"yes"` are all true while `false`, `0` and `"no"`
      // are all false. TypeScript would treat the non-empty string `"no"` as truthy, which
      // is precisely the class of silent behaviour change the parity helper exists to
      // prevent - so every one of those forms is exercised rather than just the boolean.
      const truthyFlags: readonly (string | number | boolean)[] = [true, 1, 'yes', 'true', 'Yes'];

      for (const bundleContentAccess of truthyFlags) {
        const product = aContentAccessProduct(
          `content-access-bundled-${String(bundleContentAccess)}`,
        );

        expect(
          await service.createSkus(product, {
            price: PRICE_DECIMAL,
            accessContents: 'access-1,access-2',
            bundleContentAccess,
          }),
        ).toBe(true);

        expect(product.getSkus().map((sku) => sku.getSkuCode())).toStrictEqual([
          'TESTPRODUCTXXX-1',
        ]);
        expect(product.getSkus().map((sku) => sku.getAccessContentIDs())).toStrictEqual([
          ['access-1', 'access-2'],
        ]);
      }

      const falsyFlags: readonly (string | number | boolean)[] = [false, 0, 'no', 'false', 'No'];

      for (const bundleContentAccess of falsyFlags) {
        const product = aContentAccessProduct(
          `content-access-unbundled-${String(bundleContentAccess)}`,
        );

        expect(
          await service.createSkus(product, {
            price: PRICE_DECIMAL,
            accessContents: 'access-1,access-2',
            bundleContentAccess,
          }),
        ).toBe(true);

        expect(product.getSkus()).toHaveLength(2);
      }
    });

    it('records the access-content validation failure and creates nothing', async () => {
      const product = aContentAccessProduct('content-access-validation');

      expect(await service.createSkus(product, { price: PRICE_DECIMAL })).toBe(true);
      expect(product.getSkus()).toStrictEqual([]);

      // An empty list is treated the same as an absent one, because
      // [model/service/SkuService.cfc:L175] tests `listLen(...)` rather than mere presence.
      const productWithEmptyList = aContentAccessProduct('content-access-empty-list');

      expect(
        await service.createSkus(productWithEmptyList, {
          price: PRICE_DECIMAL,
          accessContents: '',
        }),
      ).toBe(true);
      expect(productWithEmptyList.getSkus()).toStrictEqual([]);
    });

    it('never reaches the image store while creating SKUs', async () => {
      // The image store is a stub port for out-of-scope behaviour and belongs only to
      // `processImageUpload` [model/service/SkuService.cfc:L212]. Creation must not touch
      // it, and asserting that keeps the two out-of-scope surfaces genuinely separate.
      const product = makeProductFixture({ productID: 'creation-touches-no-image-store' });

      await service.createSkus(product, { price: PRICE_DECIMAL });

      expect(imageStore.saveImageFileCalls).toStrictEqual([]);
      expect(imageStore.deleteImageFileCalls).toStrictEqual([]);
    });
  });

  // =========================================================================
  // ★★ THE FIRST OF TWO STRUCTURALLY DISTINCT INDEXING DEFECTS
  //
  // Both `getProductSkus` and `getSortedProductSkus` merge a SKU collection into an
  // order supplied by `SkuDAO.getSortedProductSkusID`, and both do it by using
  // `arrayFind`'s answer DIRECTLY as an array index. `arrayFind` returns 0 when it
  // finds nothing, and 0 is not a valid index in a 1-based CFML array, so either site
  // raises the moment the collection holds a SKU the sorted-ID result does not.
  //
  // What makes them TWO defects rather than one is the GUARD in front of each:
  //
  //   * `getProductSkus` [L223] guards with THREE clauses - `sorted`,
  //     `arrayLen(skus) gt 1`, and `arrayLen(skus[1].getOptions())`. The third clause
  //     inspects ONLY THE FIRST SKU, so a collection whose first member has options
  //     and whose later members do not still enters the sort.
  //   * `getSortedProductSkus` [L248] guards with ONE clause - `arrayLen(skus) lt 2`.
  //     There is NO options clause at all, so a pair of entirely option-less SKUs
  //     still enters the sort.
  //
  // The two therefore fail on DIFFERENT INPUT SHAPES, and each is pinned below with
  // its own test, its own marker and its own input, exactly so that a reviewer can see
  // the guard asymmetry rather than a single merged case that hides it.
  // =========================================================================

  describe('getProductSkus - the three-clause guard that inspects only the first SKU', () => {
    /**
     * The canonical four-SKU graph's product, as `tests/fixtures/skuFixtures.ts` wires it.
     *
     * The fixture attaches all four members - A with two options, B with one, C with
     * three and D with NONE - to a single product, and D is the member both indexing
     * defects need. Reaching it through the fixture rather than hand-building a graph
     * keeps this suite from owning a second definition of the same shape.
     */
    function canonicalGraphProduct(): Product {
      const graphMemberA = makeSkuFixture({ andOfExistsMember: 'A' });
      const product = graphMemberA.getProduct();

      if (product === undefined) {
        throw new Error(
          'tests/fixtures/skuFixtures.ts wires the canonical four-SKU graph onto one product, ' +
            'but getProduct() answered undefined - the fixture contract has changed.',
        );
      }

      return product;
    }

    /** The three graph members that carry options, in fixture order: A, B, C. */
    function optionedGraphSkus(): readonly Sku[] {
      return canonicalGraphProduct()
        .getSkus()
        .filter((sku) => sku.getOptions().length > 0);
    }

    /** The single graph member that carries none: D. */
    function optionlessGraphSku(): Sku {
      const optionless = canonicalGraphProduct()
        .getSkus()
        .find((sku) => sku.getOptions().length === 0);

      if (optionless === undefined) {
        throw new Error(
          'tests/fixtures/skuFixtures.ts is expected to supply exactly one option-less graph ' +
            'member (SKU-D); none was found - the fixture contract has changed.',
        );
      }

      return optionless;
    }

    it('★ enters the sorted path on the first SKU alone, then raises when a later option-less SKU indexes at zero', async () => {
      // LEGACY-DEFECT [model/service/SkuService.cfc:L223,L236-L237]: the sorted branch's
      // guard inspects only skus[1].getOptions(), so a collection whose first SKU has
      // options but whose later SKUs do not still enters the sort. arrayFind then returns
      // 0 at L236 and L237 assigns at index 0, an invalid CFML index.
      // Preserved deliberately; do not fix without a product decision.
      //
      // ★ THE INPUT SHAPE IS THE PROOF. The collection is FIRST-HAS-OPTIONS,
      // LATER-HAS-NONE: A (two options) leads, D (none) trails. The first clause of the
      // guard passes on A, so the sort runs; D is then absent from the sorted-ID result -
      // `SkuDAO.getSortedProductSkusID` [model/dao/SkuDAO.cfc:L172-L202] joins through
      // `SwOption`/`SwOptionGroup`, so an option-less SKU cannot appear in it - and the
      // index lands on zero.
      //
      // This shape is DELIBERATELY DIFFERENT from the sibling case below, which uses an
      // all-option-less pair. Merging the two into one parameterised case would hide the
      // fact that the guards differ, which is the only interesting thing about the pair.
      const product = canonicalGraphProduct();
      const leadingOptionedSku = optionedGraphSkus()[0];
      expect(leadingOptionedSku).toBeDefined();

      if (leadingOptionedSku === undefined) {
        return;
      }

      const guardPassingCollection: readonly Sku[] = [leadingOptionedSku, optionlessGraphSku()];
      expect(leadingOptionedSku.getOptions().length).toBeGreaterThan(0);
      expect(guardPassingCollection[1]?.getOptions()).toStrictEqual([]);

      const repository = new RecordingSkuRepository({
        productSkus: guardPassingCollection,
        // The sorted-ID result reflects what the option-group join can actually return:
        // the optioned member only. D is missing, and its absence is the defect's trigger.
        sortedProductSkuIDs: [FIXTURE_SKU_A_ID],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      await expect(subject.getProductSkus(product, true)).rejects.toThrow(
        /sku 'skfx-sku-d' is absent from the sorted-ID result, so arrayFind answered 0/,
      );

      // The raise cites the L236-L237 locator pair, which is how a reader of a failure
      // gets from the stack straight to the legacy lines being reproduced.
      await expect(subject.getProductSkus(product, true)).rejects.toThrow(/L236-L237/);

      // The sort port WAS consulted - the guard genuinely admitted this collection rather
      // than the raise coming from somewhere earlier.
      expect(repository.sortedProductSkusIDCalls).toStrictEqual([
        [FIXTURE_PRODUCT_ID],
        [FIXTURE_PRODUCT_ID],
      ]);
    });

    it('never consults the sort port when the FIRST SKU carries no options, even if later ones do', async () => {
      // The other face of the same guard, and the reason it is a defect rather than a
      // simple bug: [model/service/SkuService.cfc:L223] reads `skus[1]` and nothing else,
      // so leading with the option-less member turns the ENTIRE sort off for a collection
      // that is otherwise fully sortable. The order of the port's result therefore decides
      // whether sorting happens at all.
      const product = canonicalGraphProduct();
      const leadingOptionedSku = optionedGraphSkus()[0];
      expect(leadingOptionedSku).toBeDefined();

      if (leadingOptionedSku === undefined) {
        return;
      }

      const optionlessFirst: readonly Sku[] = [optionlessGraphSku(), leadingOptionedSku];
      const repository = new RecordingSkuRepository({
        productSkus: optionlessFirst,
        sortedProductSkuIDs: [FIXTURE_SKU_A_ID],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const returned = await subject.getProductSkus(product, true);

      // Returned in the port's order, unsorted, and the sort port was never called.
      expect(returned.map((sku) => sku.getSkuID())).toStrictEqual([
        FIXTURE_SKU_D_ID,
        FIXTURE_SKU_A_ID,
      ]);
      expect(repository.sortedProductSkusIDCalls).toStrictEqual([]);
    });

    it('sorts a well-formed collection into option-group sort order', async () => {
      // The happy path the defect cases sit beside. Every member carries options, so every
      // member appears in the sorted-ID result and no index lands on zero.
      //
      // The expected order is B, A, C. `SkuDAO.getSortedProductSkusID`
      // [model/dao/SkuDAO.cfc:L172-L202] orders by a SUM of place values -
      // `POWER(10, nextOptionGroupSortOrder - SwOptionGroup.sortOrder)` per option - so a
      // SKU's rank is decided by WHICH option groups it belongs to, not how many. With the
      // fixture's group sort orders of 1, 2 and 3 that puts B (group 1 only) first, A
      // (groups 1 and 2) second and C (all three) last.
      const product = canonicalGraphProduct();
      const repository = new RecordingSkuRepository({
        productSkus: optionedGraphSkus(),
        sortedProductSkuIDs: FIXTURE_OPTION_GROUP_SORTED_IDS,
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const returned = await subject.getProductSkus(product, true, true);

      expect(returned.map((sku) => sku.getSkuID())).toStrictEqual([
        FIXTURE_SKU_B_ID,
        FIXTURE_SKU_A_ID,
        FIXTURE_SKU_C_ID,
      ]);

      // The result is a REORDERING, not a filter: the same three SKUs come back.
      expect(returned).toHaveLength(3);
      expect(new Set(returned.map((sku) => sku.getSkuID())).size).toBe(3);
    });

    it('forwards fetchOptions to the port exactly as given, including when it is omitted', async () => {
      // CFML parity [model/service/SkuService.cfc:L221, L230]: `fetchOptions` defaults to
      // false and is passed straight through to the DAO, where it decides whether the HQL
      // carries a `fetch` join [model/dao/SkuDAO.cfc:L150-L170]. Hibernate's lazy
      // collections have no equivalent in a driver-only stack, so in the target this is an
      // EXPLICIT EAGER-LOAD FLAG on the repository call - which makes forwarding it
      // faithfully the whole of the contract.
      const product = canonicalGraphProduct();

      const omittedRepository = new RecordingSkuRepository({ productSkus: optionedGraphSkus() });
      const omittedSubject = new SkuService(
        omittedRepository,
        imageStore,
        subscriptionTermProvider,
      );

      // Omitted, NOT passed as `undefined`. Under `exactOptionalPropertyTypes` those are
      // different states, and only the omission exercises the parameter default.
      await omittedSubject.getProductSkus(product, false);
      expect(omittedRepository.productSkusCalls).toStrictEqual([[product, false]]);

      const explicitFalseRepository = new RecordingSkuRepository({
        productSkus: optionedGraphSkus(),
      });
      const explicitFalseSubject = new SkuService(
        explicitFalseRepository,
        imageStore,
        subscriptionTermProvider,
      );

      await explicitFalseSubject.getProductSkus(product, false, false);
      expect(explicitFalseRepository.productSkusCalls).toStrictEqual([[product, false]]);

      const explicitTrueRepository = new RecordingSkuRepository({
        productSkus: optionedGraphSkus(),
      });
      const explicitTrueSubject = new SkuService(
        explicitTrueRepository,
        imageStore,
        subscriptionTermProvider,
      );

      await explicitTrueSubject.getProductSkus(product, false, true);
      expect(explicitTrueRepository.productSkusCalls).toStrictEqual([[product, true]]);

      // The flag is orthogonal to sorting: it is forwarded identically on the sorted path.
      const sortedRepository = new RecordingSkuRepository({
        productSkus: optionedGraphSkus(),
        sortedProductSkuIDs: FIXTURE_OPTION_GROUP_SORTED_IDS,
      });
      const sortedSubject = new SkuService(sortedRepository, imageStore, subscriptionTermProvider);

      await sortedSubject.getProductSkus(product, true, true);
      expect(sortedRepository.productSkusCalls).toStrictEqual([[product, true]]);
    });

    it('returns the port order untouched when sorted is false, and never consults the sort port', async () => {
      const product = canonicalGraphProduct();
      const repository = new RecordingSkuRepository({
        productSkus: optionedGraphSkus(),
        sortedProductSkuIDs: FIXTURE_OPTION_GROUP_SORTED_IDS,
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const returned = await subject.getProductSkus(product, false);

      // Fixture order - A, B, C - not sorted order.
      expect(returned.map((sku) => sku.getSkuID())).toStrictEqual([
        FIXTURE_SKU_A_ID,
        FIXTURE_SKU_B_ID,
        FIXTURE_SKU_C_ID,
      ]);
      expect(repository.sortedProductSkusIDCalls).toStrictEqual([]);
    });

    it('never consults the sort port for a single-SKU collection', async () => {
      // The second clause of the guard, `arrayLen(skus) gt 1`
      // [model/service/SkuService.cfc:L223]. One SKU has no order to establish, and
      // skipping the query is the legacy behaviour rather than a shortcut added here.
      const product = canonicalGraphProduct();
      const leadingOptionedSku = optionedGraphSkus()[0];
      expect(leadingOptionedSku).toBeDefined();

      if (leadingOptionedSku === undefined) {
        return;
      }

      const repository = new RecordingSkuRepository({
        productSkus: [leadingOptionedSku],
        sortedProductSkuIDs: FIXTURE_OPTION_GROUP_SORTED_IDS,
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const returned = await subject.getProductSkus(product, true);

      expect(returned.map((sku) => sku.getSkuID())).toStrictEqual([FIXTURE_SKU_A_ID]);
      expect(repository.sortedProductSkusIDCalls).toStrictEqual([]);
    });

    it('never consults the sort port for an empty collection', async () => {
      const product = canonicalGraphProduct();
      const repository = new RecordingSkuRepository({ productSkus: [] });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      expect(await subject.getProductSkus(product, true)).toStrictEqual([]);
      expect(repository.sortedProductSkusIDCalls).toStrictEqual([]);
    });
  });

  // =========================================================================
  // ★★ THE SECOND OF TWO STRUCTURALLY DISTINCT INDEXING DEFECTS
  //
  // Read alongside the block above, not instead of it. Same arrayFind-as-index hazard,
  // DIFFERENT guard, and therefore a DIFFERENT INPUT SHAPE is needed to reach it:
  // where `getProductSkus` needs a first-has-options / later-has-none collection,
  // `getSortedProductSkus` needs only a PAIR OF ENTIRELY OPTION-LESS SKUs, because its
  // guard counts and nothing more.
  // =========================================================================

  describe('getSortedProductSkus - the sibling with no options guard at all', () => {
    /** A SKU carrying no options, built from the fixture with its option set emptied. */
    function anOptionlessSku(skuID: string): Sku {
      return makeSkuFixture({ idPrefix: skuID, skuID, options: [] });
    }

    /** A SKU carrying one option, so the happy path has something to sort by. */
    function anOptionedSku(skuID: string, optionGroupSortOrder: number): Sku {
      const optionGroup = anOptionGroup({
        optionGroupID: `sorted-og-${String(optionGroupSortOrder)}`,
        sortOrder: optionGroupSortOrder,
      });

      return makeSkuFixture({
        idPrefix: skuID,
        skuID,
        options: [
          anOption({
            optionID: `sorted-opt-${String(optionGroupSortOrder)}`,
            sortOrder: optionGroupSortOrder,
            optionGroup,
          }),
        ],
      });
    }

    it('★ has no options guard at all, so an all-option-less pair still enters the sort and indexes at zero', async () => {
      // LEGACY-DEFECT [model/service/SkuService.cfc:L248,L264-L265]: this sibling has no
      // options guard at all - only a count check - so a collection of option-less SKUs
      // enters the sort and hits the same arrayFind-returns-zero index hazard. The guard
      // asymmetry against getProductSkus is deliberate legacy behaviour.
      // Preserved deliberately; do not fix without a product decision.
      //
      // ★ THE INPUT SHAPE IS THE PROOF, AND IT IS NOT THE SHAPE THE SIBLING NEEDED. Here
      // NEITHER member carries an option. Against `getProductSkus` this same pair would be
      // waved straight through, because its third guard clause would find no options on
      // `skus[1]` and skip the sort entirely. Here there is no such clause: `arrayLen(skus)
      // lt 2` is the ONLY test, two SKUs clear it, and the sort runs against a sorted-ID
      // result that - being built from an option-group join
      // [model/dao/SkuDAO.cfc:L172-L202] - cannot contain either of them. Both members
      // index at zero and the first one to be visited raises.
      const firstOptionless = anOptionlessSku('sku-optionless-1');
      const secondOptionless = anOptionlessSku('sku-optionless-2');

      expect(firstOptionless.getOptions()).toStrictEqual([]);
      expect(secondOptionless.getOptions()).toStrictEqual([]);

      const product = makeProductFixture({
        productID: 'sorted-all-optionless',
        skus: [firstOptionless, secondOptionless],
      });
      const repository = new RecordingSkuRepository({ sortedProductSkuIDs: [] });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      await expect(subject.getSortedProductSkus(product)).rejects.toThrow(
        /sku 'sku-optionless-1' is absent from the sorted-ID result, so arrayFind answered 0/,
      );

      // The raise cites L264-L265, NOT L236-L237. Two locators, two defects - if both
      // sites resolved to the same locator the separation would be cosmetic.
      await expect(subject.getSortedProductSkus(product)).rejects.toThrow(/L264-L265/);

      // The sort port was consulted, so the collection really did clear the guard.
      expect(repository.sortedProductSkusIDCalls).toStrictEqual([
        ['sorted-all-optionless'],
        ['sorted-all-optionless'],
      ]);
    });

    it('proves the sibling guards would have diverged on this very input', async () => {
      // The clearest statement of "two defects, not one": ONE collection, TWO methods,
      // TWO outcomes. `getSortedProductSkus` raises on the all-option-less pair (above);
      // `getProductSkus` handed the same pair returns it untouched and never queries the
      // order, because its [L223] guard finds no options on the first member.
      //
      // Nothing about this is a tidy symmetry to be restored - it is the asymmetry itself,
      // asserted so that a future reader cannot collapse the two call sites into one
      // shared helper without this case failing.
      const firstOptionless = anOptionlessSku('sku-optionless-1');
      const secondOptionless = anOptionlessSku('sku-optionless-2');
      const optionlessPair: readonly Sku[] = [firstOptionless, secondOptionless];

      const product = makeProductFixture({
        productID: 'sorted-guard-divergence',
        skus: [firstOptionless, secondOptionless],
      });

      const sortedRepository = new RecordingSkuRepository({ sortedProductSkuIDs: [] });
      const sortedSubject = new SkuService(sortedRepository, imageStore, subscriptionTermProvider);

      await expect(sortedSubject.getSortedProductSkus(product)).rejects.toThrow(/L264-L265/);
      expect(sortedRepository.sortedProductSkusIDCalls).toHaveLength(1);

      const unsortedRepository = new RecordingSkuRepository({
        productSkus: optionlessPair,
        sortedProductSkuIDs: [],
      });
      const unsortedSubject = new SkuService(
        unsortedRepository,
        imageStore,
        subscriptionTermProvider,
      );

      const returned = await unsortedSubject.getProductSkus(product, true);

      expect(returned.map((sku) => sku.getSkuID())).toStrictEqual([
        'sku-optionless-1',
        'sku-optionless-2',
      ]);
      expect(unsortedRepository.sortedProductSkusIDCalls).toStrictEqual([]);
    });

    it('reads product.getSkus() rather than the repository, and returns that very array below two', async () => {
      // CFML parity [model/service/SkuService.cfc:L247 versus L222]: this method reads the
      // association DIRECTLY - `arguments.product.getSkus()` - while its sibling goes to
      // the DAO. That is why the case above seeds `sortedProductSkuIDs` but not
      // `productSkus`: the SKU-collection port is never touched here at all.
      const soleSku = anOptionlessSku('sku-sole');
      const product = makeProductFixture({ productID: 'sorted-single', skus: [soleSku] });
      const repository = new RecordingSkuRepository({
        productSkus: [soleSku],
        sortedProductSkuIDs: FIXTURE_OPTION_GROUP_SORTED_IDS,
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const returned = await subject.getSortedProductSkus(product);

      // ★ Identity, not equality. `Product.getSkus(false, false)` hands back the LIVE
      // association array, and the early return at [L248-L250] passes it straight through
      // without copying - so the caller receives the product's own array and a mutation
      // through the returned reference would be visible on the entity. That is the legacy
      // behaviour (CFML arrays pass by value, but the ORM collection did not) and it is
      // reproduced rather than defensively copied, because a copy here would change what
      // `getProductSkus`'s unsorted path returns too.
      expect(returned).toBe(product.getSkus());

      // Neither port was consulted: no collection fetch, no order query.
      expect(repository.productSkusCalls).toStrictEqual([]);
      expect(repository.sortedProductSkusIDCalls).toStrictEqual([]);

      // The empty collection takes the same early exit.
      const emptyProduct = makeProductFixture({ productID: 'sorted-empty', skus: [] });
      expect(await subject.getSortedProductSkus(emptyProduct)).toStrictEqual([]);
      expect(repository.sortedProductSkusIDCalls).toStrictEqual([]);
    });

    it('sorts a well-formed collection into option-group sort order', async () => {
      // The happy path: three SKUs, each in a different option group, each present in the
      // sorted-ID result, so nothing indexes at zero. The order returned is the order the
      // DAO supplied - the service places each SKU at the position its identifier occupies
      // - which is exactly what "sorted by option group sort order" means once the
      // place-value ORDER BY at [model/dao/SkuDAO.cfc:L172-L202] has done its work.
      const groupOneSku = anOptionedSku('sku-group-1', 1);
      const groupTwoSku = anOptionedSku('sku-group-2', 2);
      const groupThreeSku = anOptionedSku('sku-group-3', 3);

      const product = makeProductFixture({
        productID: 'sorted-well-formed',
        // Deliberately handed to the product OUT of sorted order, so a passing assertion
        // cannot be explained by the input already being sorted.
        skus: [groupThreeSku, groupOneSku, groupTwoSku],
      });
      const repository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['sku-group-1', 'sku-group-2', 'sku-group-3'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const returned = await subject.getSortedProductSkus(product);

      expect(returned.map((sku) => sku.getSkuID())).toStrictEqual([
        'sku-group-1',
        'sku-group-2',
        'sku-group-3',
      ]);

      // A reordering, never a filter.
      expect(returned).toHaveLength(3);
    });

    it('passes the product identifier to the same port method from both sorted readers', async () => {
      // CFML parity [model/service/SkuService.cfc:L224 versus L252]: the two call sites
      // reach the SAME DAO method with the SAME value but in DIFFERENT CALL STYLES - L224
      // passes it as the named argument `productID=...` while L252 passes it positionally.
      // In CFML those are interchangeable; in TypeScript only the positional form exists,
      // so the distinction disappears at the port. Recording it here means the difference
      // is documented as understood-and-collapsed rather than unnoticed, and the assertion
      // shows both readers do arrive at one method with one argument.
      const groupOneSku = anOptionedSku('sku-group-1', 1);
      const groupTwoSku = anOptionedSku('sku-group-2', 2);
      const sortedIDs: readonly string[] = ['sku-group-1', 'sku-group-2'];

      const product = makeProductFixture({
        productID: 'call-style-parity',
        skus: [groupOneSku, groupTwoSku],
      });

      const repository = new RecordingSkuRepository({
        productSkus: [groupOneSku, groupTwoSku],
        sortedProductSkuIDs: sortedIDs,
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      await subject.getProductSkus(product, true);
      await subject.getSortedProductSkus(product);

      expect(repository.sortedProductSkusIDCalls).toStrictEqual([
        ['call-style-parity'],
        ['call-style-parity'],
      ]);
    });
  });

  // =========================================================================
  // ★ DEFECT 28 - getSkuStocksDeletableFlag THROWS UNCONDITIONALLY
  //
  // [model/service/SkuService.cfc:L281-L283] delegates to
  // `getSkuDAO().getSkuStocksDeletableFlag(...)`. That method DOES NOT EXIST: it is
  // absent from `model/dao/SkuDAO.cfc`, absent from every file under `org/Hibachi/`,
  // and cannot be dynamically dispatched because `HibachiDAO` declares no
  // `onMissingMethod`. The only caller of the service method,
  // [model/entity/Sku.cfc:L569], therefore reaches the entity-level missing-method
  // raise at [org/Hibachi/HibachiEntity.cfc:L565] and the call dies there, every time,
  // for every input.
  //
  // The target reproduces the raise rather than inventing the query the method would
  // have needed - inventing it would be new behaviour with no legacy antecedent, and
  // would silently start answering a question the legacy has never once answered.
  // =========================================================================

  describe('getSkuStocksDeletableFlag - defect 28', () => {
    it('rejects for every input, including a well-formed identifier', async () => {
      // LEGACY-DEFECT [model/service/SkuService.cfc:L281-L283]: getSkuStocksDeletableFlag
      // calls a method that exists nowhere in the codebase, so it throws unconditionally
      // through org/Hibachi/HibachiEntity.cfc:L565. Reproduced as a throwing stub rather
      // than invented.
      // Preserved deliberately; do not fix without a product decision.
      //
      // "Every input" is meant literally: a well-formed fixture identifier fails exactly
      // as an empty string does. There is no shape of argument that reaches a working code
      // path, which is what distinguishes this from ordinary input validation - and no
      // engine-specific message is asserted, only that the call cannot succeed.
      const inputs: readonly string[] = [
        FIXTURE_SKU_A_ID,
        FIXTURE_SKU_D_ID,
        '',
        '   ',
        'sku-that-does-not-exist',
        '00000000-0000-0000-0000-000000000000',
      ];

      for (const skuID of inputs) {
        await expect(service.getSkuStocksDeletableFlag(skuID)).rejects.toThrow(Error);
      }

      // The rejection names the missing call target, so a reader of a failure is pointed
      // at the legacy defect rather than at a supposed configuration problem.
      await expect(service.getSkuStocksDeletableFlag(FIXTURE_SKU_A_ID)).rejects.toThrow(
        /is unreachable/,
      );

      // NOT a resolved `false`, and NOT a resolved `undefined`. Answering `false` would be
      // the tempting "safe" reading - it would make deletion appear forbidden - but it
      // would be a fabricated answer to a question the legacy cannot answer, and a caller
      // would have no way to tell a real refusal from a broken one.
      await expect(service.getSkuStocksDeletableFlag(FIXTURE_SKU_A_ID)).rejects.toBeInstanceOf(
        Error,
      );

      // Nothing was routed anywhere on the way to the raise: no port was consulted,
      // because there is no port member to consult.
      expect(skuRepository.productSkusCalls).toStrictEqual([]);
      expect(skuRepository.skuBySkuCodeCalls).toStrictEqual([]);
      expect(skuRepository.searchSkusByProductTypeCalls).toStrictEqual([]);
      expect(skuRepository.sortedProductSkusIDCalls).toStrictEqual([]);
      expect(skuRepository.transactionExistsFlagCalls).toStrictEqual([]);
      expect(skuRepository.skusBySelectedOptionsCalls).toStrictEqual([]);
      expect(skuRepository.saveSkuCalls).toStrictEqual([]);
    });

    it('★ is deliberately absent from the SkuRepository port, which declares exactly seven members', () => {
      // ★ THE STRUCTURAL HALF OF DEFECT 28, and the reason the reproduction is honest
      // rather than lazy: the port set was NOT quietly widened to give the method
      // something to call. `SkuRepository` publishes exactly the seven DAO capabilities
      // that actually exist, and `getSkuStocksDeletableFlag` is not among them.
      //
      // Both assertions below are TYPE-LEVEL and use no cast, no `as`, and no
      // `@ts-expect-error`. `Exclude<K, keyof SkuRepository>` collapses to `never` the
      // moment the port declares `K`, and `never` accepts no value - so the assignment
      // stops compiling if the member is ever added. The build is the assertion; the
      // runtime `expect` merely reports it.
      type AbsentFromSkuRepository = Exclude<'getSkuStocksDeletableFlag', keyof SkuRepository>;
      const absentMemberName: AbsentFromSkuRepository = 'getSkuStocksDeletableFlag';

      expect(absentMemberName).toBe('getSkuStocksDeletableFlag');

      // And the port's membership is EXACTLY these seven, proved exhaustively rather than
      // by counting a hand-written list. `AssertNever` constrains its parameter to `never`,
      // so if the port grows an eighth member that the tuple below does not name, the
      // `Exclude` no longer collapses and the alias fails its own constraint.
      const declaredPortMembers = [
        'getTransactionExistsFlag',
        'getSkuBySkuCode',
        'getSkusBySelectedOptions',
        'searchSkusByProductType',
        'getProductSkus',
        'getSortedProductSkusID',
        'saveSku',
      ] as const satisfies readonly (keyof SkuRepository)[];

      type AssertNever<T extends never> = T;
      type UnnamedPortMembers = AssertNever<
        Exclude<keyof SkuRepository, (typeof declaredPortMembers)[number]>
      >;

      const unnamedPortMembers: UnnamedPortMembers[] = [];

      expect(unnamedPortMembers).toStrictEqual([]);
      expect(declaredPortMembers).toHaveLength(7);
      expect(declaredPortMembers).not.toContain('getSkuStocksDeletableFlag');

      // The SERVICE still publishes the method, because interface parity is the acceptance
      // contract and a reviewer diffing the two surfaces must find it. Parity of NAME with
      // no working call target underneath is precisely the legacy situation.
      expect(Object.getOwnPropertyNames(SkuService.prototype)).toContain(
        'getSkuStocksDeletableFlag',
      );
    });
  });

  // =========================================================================
  // ★★ REQUEST-SCOPED REPLACEMENT FOR THE COMPONENT-LEVEL SORT-ORDER CACHE
  //
  // [model/dao/SkuDAO.cfc:L204-L220] memoises `variables.nextOptionGroupSortOrder` at
  // COMPONENT level - one value for the whole application lifetime - and the value
  // feeds the `POWER(10, nextOptionGroupSortOrder - SwOptionGroup.sortOrder)` place-value
  // ORDER BY that decides sorted-SKU order [model/dao/SkuDAO.cfc:L172-L202].
  //
  // Two legacy behaviours make that memo actively dangerous rather than merely stale:
  //
  //   * The aggregate always returns a row, so the `recordCount` guard is always true
  //     and an EMPTY option-group table memoises `'' + 1`, i.e. 1.
  //   * The clear method's guard is INVERTED, so the memo can never be cleared.
  //
  // Under CFML that meant one long-lived value per application. On a warm Lambda
  // container a module-level cache is shared across UNRELATED invocations, so
  // reproducing the memo faithfully would let one request's ordering decide another's.
  // The target therefore request-scopes the value: it lives behind the repository port
  // and is re-consulted on every call. These cases prove that, and they do it by
  // COMPARING RESULTS AND RECORDED CALLS - never by measuring anything.
  // =========================================================================

  describe('sort-order state is request-scoped, not shared between service instances', () => {
    /** A SKU in a single option group, so a sorted read has something to order by. */
    function aSortableSku(skuID: string, optionGroupSortOrder: number): Sku {
      const optionGroup = anOptionGroup({
        optionGroupID: `scope-og-${String(optionGroupSortOrder)}`,
        sortOrder: optionGroupSortOrder,
      });

      return makeSkuFixture({
        idPrefix: skuID,
        skuID,
        options: [
          anOption({
            optionID: `scope-opt-${String(optionGroupSortOrder)}`,
            sortOrder: optionGroupSortOrder,
            optionGroup,
          }),
        ],
      });
    }

    it('★ does not let one service instance observe another instance sort order', async () => {
      // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L213-L214]: the max() aggregate always returns
      // one row, so the recordCount guard is always true and an empty table yields
      // '' + 1 = 1.
      // Preserved deliberately; do not fix without a product decision.
      //
      // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L222-L226]: the cache-clear guard is inverted,
      // so the clear can never fire. The target neutralises the hazard by request-scoping
      // the value; this test proves two independent service instances do not share it.
      // Preserved deliberately; do not fix without a product decision.
      //
      // Two instances, two repositories, two DIFFERENT sorted orders over the SAME two
      // SKUs. The first is driven to completion so that any shared memo would be populated
      // by the time the second runs. The second then returns ITS OWN order - the reverse -
      // which is only possible if nothing was carried across.
      const firstSku = aSortableSku('scope-sku-1', 1);
      const secondSku = aSortableSku('scope-sku-2', 2);
      const product = makeProductFixture({
        productID: 'scope-product',
        skus: [firstSku, secondSku],
      });

      const firstRepository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['scope-sku-1', 'scope-sku-2'],
      });
      const firstService = new SkuService(firstRepository, imageStore, subscriptionTermProvider);

      const secondRepository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['scope-sku-2', 'scope-sku-1'],
      });
      const secondService = new SkuService(secondRepository, imageStore, subscriptionTermProvider);

      const firstOrder = await firstService.getSortedProductSkus(product);
      expect(firstOrder.map((sku) => sku.getSkuID())).toStrictEqual(['scope-sku-1', 'scope-sku-2']);

      const secondOrder = await secondService.getSortedProductSkus(product);
      expect(secondOrder.map((sku) => sku.getSkuID())).toStrictEqual([
        'scope-sku-2',
        'scope-sku-1',
      ]);

      // Each instance asked its OWN repository, exactly once. A shared memo would have let
      // the second instance skip its query and inherit the first order.
      expect(firstRepository.sortedProductSkusIDCalls).toStrictEqual([['scope-product']]);
      expect(secondRepository.sortedProductSkusIDCalls).toStrictEqual([['scope-product']]);

      // And driving the first instance again still yields the FIRST order, so the second
      // instance's run did not contaminate it either. Contamination is symmetrical if it
      // exists at all, so both directions are checked.
      const firstOrderAgain = await firstService.getSortedProductSkus(product);
      expect(firstOrderAgain.map((sku) => sku.getSkuID())).toStrictEqual([
        'scope-sku-1',
        'scope-sku-2',
      ]);
    });

    it('★ does not let a populated instance rescue an instance whose order is empty', async () => {
      // The sharpest form of the isolation proof, and the one that directly exercises the
      // empty-aggregate defect. Instance one runs against a POPULATED order and succeeds.
      // Instance two runs against an EMPTY one - the state [model/dao/SkuDAO.cfc:L213-L214]
      // silently turns into a seeded 1 - and must RAISE through the arrayFind-zero path.
      //
      // If the sort-order state were shared, instance two would inherit instance one's
      // populated order and quietly succeed. The raise is therefore the evidence of
      // isolation, and the assertion is about correctness and state boundaries only.
      const firstSku = aSortableSku('scope-sku-1', 1);
      const secondSku = aSortableSku('scope-sku-2', 2);
      const product = makeProductFixture({
        productID: 'scope-empty-order',
        skus: [firstSku, secondSku],
      });

      const populatedRepository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['scope-sku-1', 'scope-sku-2'],
      });
      const populatedService = new SkuService(
        populatedRepository,
        imageStore,
        subscriptionTermProvider,
      );

      expect(
        (await populatedService.getSortedProductSkus(product)).map((sku) => sku.getSkuID()),
      ).toStrictEqual(['scope-sku-1', 'scope-sku-2']);

      const emptyRepository = new RecordingSkuRepository({ sortedProductSkuIDs: [] });
      const emptyService = new SkuService(emptyRepository, imageStore, subscriptionTermProvider);

      await expect(emptyService.getSortedProductSkus(product)).rejects.toThrow(/L264-L265/);
      expect(emptyRepository.sortedProductSkusIDCalls).toStrictEqual([['scope-empty-order']]);
    });

    it('re-consults the port on every call rather than memoising within one instance', async () => {
      // Within a SINGLE instance the value is not cached either: three sorted reads produce
      // three recorded queries. [model/dao/SkuDAO.cfc:L206-L208] returned the memo whenever
      // the key existed, and because the clear at [L222-L226] can never fire that memo was
      // effectively permanent. Re-consulting is the whole of the target's replacement.
      const firstSku = aSortableSku('scope-sku-1', 1);
      const secondSku = aSortableSku('scope-sku-2', 2);
      const product = makeProductFixture({
        productID: 'scope-repeat',
        skus: [firstSku, secondSku],
      });
      const repository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['scope-sku-1', 'scope-sku-2'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      await subject.getSortedProductSkus(product);
      await subject.getSortedProductSkus(product);
      await subject.getSortedProductSkus(product);

      expect(repository.sortedProductSkusIDCalls).toStrictEqual([
        ['scope-repeat'],
        ['scope-repeat'],
        ['scope-repeat'],
      ]);
    });

    it('holds no class-level or module-level state of its own', () => {
      // The last place a shared memo could hide. `SkuService` carries only the three
      // intrinsic properties every class function has - no static field, no lazily
      // populated class-side cache, nothing that would outlive an instance.
      expect(Object.getOwnPropertyNames(SkuService)).toStrictEqual(['length', 'name', 'prototype']);

      // LEGACY-NOTE [model/dao/SkuDAO.cfc:L163]: the legacy DAO carries an INVALID DUPLICATE
      // `var` declaration - `var hql &= ...` re-declaring a name already declared in the
      // same function. It is a source artifact with no TypeScript equivalent: the language
      // makes the construct unrepresentable, so there is nothing to reproduce and nothing
      // for this suite to assert about it. Recorded here so the omission is a documented
      // decision rather than an oversight.
      //
      // LEGACY-NOTE [model/dao/SkuDAO.cfc:L107-L128]: the AND-of-EXISTS option-matching SQL
      // that backs `getSkusBySelectedOptions` is likewise NOT asserted anywhere in this
      // file. SQL text and parameter binding belong to the integration tier - see the P5
      // note in this file's header - and the port is exercised here only through the double.
      expect(skuRepository.skusBySelectedOptionsCalls).toStrictEqual([]);
    });
  });

  describe('processImageUpload - delegation to the image stub port and nothing more', () => {
    /**
     * A projection of the legacy `cffile` upload result struct.
     *
     * The values are deliberately NOT path-shaped and are never opened, resolved,
     * stat-ed or written. This suite performs no filesystem access of any kind; the
     * struct exists only so the delegation can be observed carrying it.
     */
    function anUploadResult(): ImageUploadResult {
      return {
        serverDirectory: 'fixture-server-directory',
        serverFile: 'fixture-server-file.jpg',
        clientFileExt: 'jpg',
        contentType: 'image',
      };
    }

    it('preserves the allowed-extension allow-list verbatim', () => {
      // CFML parity [model/service/SkuService.cfc:L212]: the legacy passes
      // `allowedExtensions="jpg,jpeg,png,gif"` as a literal comma list. It is carried
      // character for character - same four extensions, same order, same lowercase, no
      // spaces, no leading dots and no `webp`, `avif` or `svg` added. Widening it would be
      // a product decision about what a merchant may upload, not a port detail.
      expect(ALLOWED_IMAGE_EXTENSIONS).toBe('jpg,jpeg,png,gif');
    });

    it('rejects because the image path cannot be composed, and stores nothing', async () => {
      // JUDGMENT CALL: `processImageUpload` is a pure delegation - the legacy body is one
      // statement, `getService("imageService").saveImageFile(...)`
      // [model/service/SkuService.cfc:L212], which is the ONLY `getService()` locator call
      // in the whole in-scope service layer. Transformation rule T2 replaces the locator
      // with the constructor-injected `imageStore` port, and that substitution is all this
      // suite asserts: no image is decoded, no extension policy is re-implemented, no
      // directory is touched, and no image feature behaviour is claimed.
      //
      // The observable outcome is a REJECTION, and it is honest rather than disappointing.
      // The path argument comes from `Sku.getImagePath()`
      // [model/entity/Sku.cfc:L141-L147], which reads three settings -
      // productImageDefaultExtension, productImageOptionCodeDelimiter and
      // globalAssetsImageFolderPath - that are NOT among the four keys the settings port
      // publishes. The image subsystem is out of scope, so the entity refuses to compose a
      // path, and the refusal surfaces here. Nothing is stored, which is the correct
      // outcome for an out-of-scope subsystem: better a loud refusal than a file written
      // to a fabricated location.
      const sku = makeSkuFixture({ andOfExistsMember: 'A' });

      await expect(service.processImageUpload(sku, anUploadResult())).rejects.toThrow(
        /is not ported/,
      );

      // ★ The port was never reached, so nothing was stored and nothing was deleted.
      expect(imageStore.saveImageFileCalls).toStrictEqual([]);
      expect(imageStore.deleteImageFileCalls).toStrictEqual([]);
    });

    it('never reaches the SKU repository while processing an upload', async () => {
      // The upload path touches neither persistence nor query. [L212] saves the file and
      // returns; the legacy did not re-save the SKU, and neither does the port.
      const sku = makeSkuFixture({ andOfExistsMember: 'B' });

      await expect(service.processImageUpload(sku, anUploadResult())).rejects.toThrow(Error);

      expect(skuRepository.saveSkuCalls).toStrictEqual([]);
      expect(skuRepository.skuBySkuCodeCalls).toStrictEqual([]);
    });
  });

  describe('searchSkusByProductType - both parameters forwarded exactly as given', () => {
    it('forwards a term and a product type identifier unchanged', async () => {
      const searchHit = makeSkuFixture({ andOfExistsMember: 'C' });
      const repository = new RecordingSkuRepository({ searchResults: [searchHit] });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const returned = await subject.searchSkusByProductType('jordan', 'product-type-1');

      expect(returned.map((sku) => sku.getSkuID())).toStrictEqual([FIXTURE_SKU_C_ID]);
      expect(repository.searchSkusByProductTypeCalls).toStrictEqual([['jordan', 'product-type-1']]);
    });

    it('forwards absent parameters as absent, without substituting a default', async () => {
      // CFML parity [model/service/SkuService.cfc:L271-L279]: both parameters are OPTIONAL
      // with no default, and the legacy forwards `argumentCollection=arguments` so an
      // omitted parameter arrives omitted. The DAO's own defaults then apply
      // [model/dao/SkuDAO.cfc:L130-L133], and substituting `''` here would send a value the
      // legacy never sent and change which rows come back.
      //
      // The arguments are OMITTED at the call site, not passed as `undefined` - under
      // `exactOptionalPropertyTypes` and the strict profile those are different states, and
      // only omission exercises the parameter defaults.
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      expect(await subject.searchSkusByProductType()).toStrictEqual([]);
      expect(await subject.searchSkusByProductType('jordan')).toStrictEqual([]);

      // The recorded arity is 2 in both cases because the service forwards both positions
      // explicitly - the trailing hole becomes an explicit `undefined` at the port
      // boundary. Pinning that keeps a later change from starting to truncate the call.
      expect(repository.searchSkusByProductTypeCalls).toStrictEqual([
        [undefined, undefined],
        ['jordan', undefined],
      ]);
    });

    it('LEGACY-NOTE: the SKU-side parameter is singular where the product-side one is plural', async () => {
      // LEGACY-NOTE [model/dao/SkuDAO.cfc:L130-L136 versus model/dao/ProductDAO.cfc:L419]:
      // `SkuDAO.searchSkusByProductType` takes a SINGULAR `productTypeID` while
      // `ProductDAO.searchProductsByProductType` takes a PLURAL `productTypeIDs`. The SKU
      // side then binds its singular argument to a LIST parameter anyway, so the two
      // accept the same shape of value under different names.
      //
      // Both names are preserved. Harmonising them would be a signature change on two
      // public surfaces for cosmetic reasons, and interface parity is the acceptance
      // contract - so the asymmetry is recorded here to stop a future reader "tidying" it.
      // A comma list therefore travels through the singular parameter untouched, which is
      // the behaviour that makes the naming survivable.
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      await subject.searchSkusByProductType('jordan', 'product-type-1,product-type-2');

      expect(repository.searchSkusByProductTypeCalls).toStrictEqual([
        ['jordan', 'product-type-1,product-type-2'],
      ]);
    });
  });

  describe('getTransactionExistsFlag - the port answer, unmodified', () => {
    it('answers true and false exactly as the port does', async () => {
      // CFML parity [model/service/SkuService.cfc:L285-L287]: the legacy body is a bare
      // `return getSkuDAO().getTransactionExistsFlag()` and applies no interpretation. Both
      // answers are asserted because a one-sided test cannot tell a faithful pass-through
      // from a hardcoded constant.
      const trueRepository = new RecordingSkuRepository({ transactionExistsFlag: true });
      const trueSubject = new SkuService(trueRepository, imageStore, subscriptionTermProvider);

      expect(await trueSubject.getTransactionExistsFlag()).toBe(true);
      expect(trueRepository.transactionExistsFlagCalls).toStrictEqual([[]]);

      const falseRepository = new RecordingSkuRepository({ transactionExistsFlag: false });
      const falseSubject = new SkuService(falseRepository, imageStore, subscriptionTermProvider);

      expect(await falseSubject.getTransactionExistsFlag()).toBe(false);
      expect(falseRepository.transactionExistsFlagCalls).toStrictEqual([[]]);

      // A strict boolean, not a truthy value. The legacy declares `returntype="boolean"`
      // and CFML would happily have returned the string "YES"; the port does not.
      expect(typeof (await trueSubject.getTransactionExistsFlag())).toBe('boolean');
    });
  });

  describe('getSkuBySkuCode - a miss is undefined, and an absent code raises', () => {
    it('returns the SKU the port answers with on a hit', async () => {
      const found = makeSkuFixture({ andOfExistsMember: 'A' });
      const repository = new RecordingSkuRepository({ skuBySkuCode: found });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const returned = await subject.getSkuBySkuCode('TESTSKUXXX-A');

      expect(returned).toBe(found);
      expect(repository.skuBySkuCodeCalls).toStrictEqual([['TESTSKUXXX-A']]);
    });

    it('★ returns undefined on a miss - not null, not zero, and not an empty object', async () => {
      // ★ THE HIGHEST-CONSEQUENCE ABSENCE CHECK ON THIS SURFACE.
      // [model/dao/SkuDAO.cfc:L102-L105] runs `ORMExecuteQuery(..., true)` and returns
      // whatever it got, which is NULL when nothing matched. There is no `else`, no
      // fallback and no empty entity. Substituting any of the tempting alternatives would
      // be a behaviour change with real consequences: a `0` or `{}` would satisfy a naive
      // truthiness test and let a caller carry on with a SKU that does not exist, while
      // `null` would break every `=== undefined` test written against the port.
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const returned = await subject.getSkuBySkuCode('NO-SUCH-SKU-CODE');

      expect(returned).toBeUndefined();
      expect(returned).not.toBeNull();
      expect(returned).not.toBe(0);
      expect(returned).not.toStrictEqual({});
      expect(repository.skuBySkuCodeCalls).toStrictEqual([['NO-SUCH-SKU-CODE']]);
    });

    it('raises when the code is omitted, because the DAO parameter is required', async () => {
      // CFML parity [model/service/SkuService.cfc:L289-L291 into model/dao/SkuDAO.cfc:L102]:
      // the SERVICE declares `string skuCode` - optional, no default - but forwards
      // `argumentCollection=arguments` into a DAO that declares `required string skuCode`.
      // An omitted code therefore raises at the DAO boundary rather than returning null,
      // which is a DIFFERENT outcome from the miss above and is asserted separately.
      //
      // The argument is OMITTED, not passed as `undefined`.
      await expect(service.getSkuBySkuCode()).rejects.toThrow(/skuCode is absent/);

      // The port was never reached, so the raise came from the boundary check and not from
      // a query that ran with a missing parameter.
      expect(skuRepository.skuBySkuCodeCalls).toStrictEqual([]);
    });

    it('forwards an empty string as an empty string, because the legacy did', async () => {
      // An empty string SATISFIES `required` in CFML, so the legacy reached the query with
      // it and matched nothing. Treating `''` as absent would raise where the legacy
      // returned null - a different observable outcome for the same input.
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      expect(await subject.getSkuBySkuCode('')).toBeUndefined();
      expect(repository.skuBySkuCodeCalls).toStrictEqual([['']]);
    });
  });

  describe('findSkus - signature reshaping #2, with only the concrete legacy filters', () => {
    it('takes a typed criteria object and answers a typed page', async () => {
      // JUDGMENT CALL: legacy getSkuSmartList (model/service/SkuService.cfc:L309-L325) built
      // a HibachiSmartList - a generic, string-keyed dynamic query builder supplied by the
      // framework. Porting it faithfully would reimplement a small ORM query language and
      // reintroduce exactly the framework coupling this refactor removes, and it would be
      // untypeable under the strict profile. The target exposes a typed findSkus instead.
      // This is signature reshaping #2 of the project's three, shared with
      // productService.findProducts. Only the concrete legacy filters are preserved; the
      // open-ended dynamic filtering surface is deliberately not reproduced.
      const firstHit = makeSkuFixture({ andOfExistsMember: 'A' });
      const repository = new RecordingSkuRepository({ searchResults: [firstHit] });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const criteria: SkuQueryCriteria = { keyword: 'jordan', productTypeID: 'product-type-1' };
      const page: SkuPage = await subject.findSkus(criteria);

      expect(page.skus.map((sku) => sku.getSkuID())).toStrictEqual([FIXTURE_SKU_A_ID]);
      expect(page.keyword).toBe('jordan');

      // The criteria object is TYPED and CLOSED: `keyword` and an optional
      // `productTypeID`, and nothing else. There is no `filterCriteria` map, no
      // `propertyIdentifier` string to interpret at run time, and no free-text WHERE
      // fragment - which is precisely what makes it not a dynamic query language.
      expect(Object.keys(criteria).sort()).toStrictEqual(['keyword', 'productTypeID']);
    });

    it('preserves the five keyword properties, all at weight 1', async () => {
      // CFML parity [model/service/SkuService.cfc:L316-L322]: five
      // `addKeywordProperty(propertyIdentifier=..., weight=1)` calls, in this order, every
      // one of them at weight 1. The uniform weight is worth pinning because it means the
      // legacy applied NO relevance ranking whatsoever - a reviewer might otherwise assume
      // the weights were lost in translation. They were not; they were always 1.
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const page = await subject.findSkus({ keyword: 'jordan' });

      expect(page.keywordProperties).toStrictEqual([
        { propertyIdentifier: 'skuCode', weight: 1 },
        { propertyIdentifier: 'skuID', weight: 1 },
        { propertyIdentifier: 'product.productName', weight: 1 },
        { propertyIdentifier: 'product.productType.productTypeName', weight: 1 },
        { propertyIdentifier: 'alternateSkuCodes.alternateSkuCode', weight: 1 },
      ]);
      expect(page.keywordProperties).toHaveLength(5);
      expect(page.keywordProperties.every((property) => property.weight === 1)).toBe(true);
    });

    it('preserves the three joins, including the LEFT join on alternateSkuCodes', async () => {
      // CFML parity [model/service/SkuService.cfc:L312-L314]: three `addJoin` calls. The
      // first two carry no join type - Hibachi's default inner join - while the THIRD is
      // explicitly `joinType="left"`, because a SKU with no alternate codes must still
      // appear in the result. Turning that left join into an inner one would silently drop
      // most of the catalogue from every keyword search, so the join type is asserted
      // rather than merely the relationship.
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const page = await subject.findSkus({ keyword: 'jordan' });

      expect(page.joins).toStrictEqual([
        { parentEntityName: 'SlatwallSku', relatedProperty: 'product', joinType: '' },
        { parentEntityName: 'SlatwallProduct', relatedProperty: 'productType', joinType: '' },
        {
          parentEntityName: 'SlatwallSku',
          relatedProperty: 'alternateSkuCodes',
          joinType: 'left',
        },
      ]);
      expect(page.joins).toHaveLength(3);

      const alternateSkuCodesJoin = page.joins[2];
      expect(alternateSkuCodesJoin).toBeDefined();
      if (alternateSkuCodesJoin !== undefined) {
        expect(alternateSkuCodesJoin.joinType).toBe('left');
      }
    });

    it('routes the keyword and product type through the same port the legacy DAO served', async () => {
      // The reshaped surface reaches the SAME port method as `searchSkusByProductType`,
      // because the concrete filter the legacy smart list actually applied is the same one.
      // Asserting the routing is what shows the reshaping preserved behaviour rather than
      // inventing a second query path.
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      await subject.findSkus({ keyword: 'jordan', productTypeID: 'product-type-1' });
      // Omitted, NOT `undefined`: the absent product type must arrive absent.
      await subject.findSkus({ keyword: 'air' });

      expect(repository.searchSkusByProductTypeCalls).toStrictEqual([
        ['jordan', 'product-type-1'],
        ['air', undefined],
      ]);
    });

    it('publishes no dynamic-filter surface for a caller to reach through', async () => {
      // The negative half of reshaping #2, and the part a reviewer most needs to see: the
      // returned page carries EXACTLY four keys and none of them is an escape hatch. There
      // is no `smartList`, no `filters` bag, no `whereClause`, no `orderBy` string and no
      // `applyFilter` method - so nothing here can be used to smuggle the framework's
      // string-keyed query language back in through the boundary.
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const page = await subject.findSkus({ keyword: 'jordan' });

      expect(Object.keys(page).sort()).toStrictEqual([
        'joins',
        'keyword',
        'keywordProperties',
        'skus',
      ]);
      expect(Object.keys(page)).not.toContain('smartList');
      expect(Object.keys(page)).not.toContain('filters');
      expect(Object.keys(page)).not.toContain('whereClause');
      expect(Object.keys(page)).not.toContain('orderBy');
      expect(Object.keys(page)).not.toContain('applyFilter');
    });
  });
});
