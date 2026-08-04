// ---------------------------------------------------------------------------
// slatwall-ts - unit suite pinning `src/services/skuService.ts`
//
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
//   No assertion below has a legacy antecedent. There is no `SkuServiceTest` anywhere
//   under `meta/tests/`: the legacy service tier holds exactly four components,
//   AccountServiceTest, HibachiServiceTest, PaymentServiceTest and UtilityRBServiceTest,
//   none of them in scope, and `meta/tests/unit/dao/` carries only `AccountDAOTest` plus
//   `PaymentDAOTest`, so nothing covers `model/dao/SkuDAO.cfc` either.
//
// WHAT IS UNDER TEST
//   `model/service/SkuService.cfc` is 334 lines. The ported class publishes NINE public
//   methods and every one is asynchronous, because a method becomes `async` if and only
//   if its legacy body reaches the DAO, the ORM or a collaborator that does:
//
//     L58-L208   createSkus                four-way dispatch, one raise
//     L210-L218  processImageUpload        the one service-layer locator
//     L220-L244  getProductSkus            indexing defect, guard #1
//     L246-L269  getSortedProductSkus      indexing defect, guard #2
//     L271-L273  searchSkusByProductType   passthrough
//     L281-L283  getSkuStocksDeletableFlag DEFECT 28 - raises always
//     L285-L287  getTransactionExistsFlag  passthrough
//     L289-L291  getSkuBySkuCode           passthrough
//     L309-L325  getSkuSmartList -> findSkus  signature reshaping #2
//
// JUDGMENT CALL: the SHIPPED constructor takes THREE ports plus two target-side knobs and
// `SkuService.length` is 3, where this suite was briefed for four. The production module is the
// contract, so the suite adapts to it. The missing fourth is not an omission: `optionService`
// [model/service/SkuService.cfc:L53] is reached at exactly one line, [L74], and only for
// HibachiService's generic `get<Entity>(primaryKey)` lookup, a capability the thirteen-port set
// does not carry. Option hydration is therefore a BOUNDARY INPUT arriving as
// `CreateSkusInput.resolvedOptions`, and an identifier named in `data.options` but absent from
// `resolvedOptions` raises. `OptionRepository` remains real and exactly two members wide; it is
// simply not a collaborator of THIS class, and a double for it is built below to pin that.
//
// LEGACY-NOTE [model/service/SkuService.cfc:L54]: the legacy component declares a productService
// DI/1 property that no method ever uses - sweeping all 334 lines for `productService` returns
// exactly one hit and that hit IS the L54 declaration. The dead injection is dropped rather than
// ported, so no productService double exists here. Under DI/1 a declaration alone had a
// collaborator resolved, so an edge no code used stayed invisible; naming collaborators as
// constructor parameters is what makes an unused one apparent. `contentService` [L56] is likewise
// reached only from the out-of-scope contentAccess branch, and no content port is invented for it.
//
// THE TWO INDEXING DEFECTS ARE KEPT STRUCTURALLY SEPARATE
//   Both `getProductSkus` and `getSortedProductSkus` use `arrayFind`'s result DIRECTLY
//   as an array index, and `arrayFind` answers 0 when nothing matches, which is not a
//   valid index into a 1-based CFML array. What they do NOT share is the guard:
//
//     [L223]  sorted && arrayLen(skus) gt 1 && arrayLen(skus[1].getOptions())
//             -> a THREE-clause guard whose third clause probes ONLY THE FIRST SKU
//     [L248]  arrayLen(skus) lt 2
//             -> a COUNT CHECK ALONE, with no options clause anywhere
//
//   They therefore fail on DIFFERENT INPUT SHAPES, and each is fed the shape that
//   singles it out. They live in separate `describe` blocks, carry separate markers, and
//   are never merged into one parameterised case.
//
// THE IN-MEMORY DOUBLE IDIOM, FOLLOWED AS THE SIBLING SUITES ESTABLISHED IT
//   Each port is replaced by a hand-written in-memory double declared inline, TYPED
//   against the shipped port with recording arrays typed by `Parameters<...>` read off
//   it, so a contract change breaks compilation here instead of drifting past a
//   permissive mock. Each RECORDS the whole ARGUMENT LIST rather than a re-assembled
//   copy, which lets a case prove how MANY values arrived as well as which; each is PURE
//   and DETERMINISTIC, with no randomness and no clock read; and each is CONSTRUCTED
//   FRESH in `beforeEach`. Each implements EXACTLY the member count its port declares.
//
// ★ TWO CONDENSED PARAGRAPHS ONCE SAT HERE AND HAVE BEEN REMOVED AS A STRICT SUBSET. They
// restated the first two entries of the list below - the no-SQL boundary and the no-database /
// no-boundary-crossing guarantees - and the list states both more fully, adding that reproducing
// the `<cfquery>` bodies belongs to the MySQL adapter and that no composition root, container or
// service locator is imported either. Seven further entries have no condensed counterpart at all.
// Saying the same thing twice, once less completely, is the failure mode this whole pass exists to
// remove, so the list is the single statement of it.
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
//   * NO MOCKING LIBRARY AND NO SPY. `package.json` pins thirteen packages - three
//     runtime, ten development - and this
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
// MONEY, AND THE THINGS THAT ARE NOT MONEY
//   Every monetary value is a `Money` built from a decimal STRING and every monetary
//   expectation is compared with `Money.equals`; no expected total is computed. A
//   `sortOrder` is NOT money and neither is a combination count - both stay plain numbers,
//   stated so that nobody later promotes an ordinal into a monetary type or demotes a
//   price into a float. There is exactly ONE `@ts-expect-error` here and it is not a
//   suppression: it sits inside a described type-failure test where the directive itself
//   IS the assertion, failing the build if the code below it ever starts compiling.
//
// LEGACY-NOTE [model/dao/SkuDAO.cfc:L163]: the DAO writes `var hql &= "WHERE ..."` inside
// `getProductSkus`, a second `var` declaration of a local already declared at [L152] - invalid CFML
// that only survives because the engine tolerates it. The construct cannot exist in TypeScript and
// is deliberately NOT reproduced: the ported repository builds one statement string. Recorded
// because a reader comparing the two files will notice the shape is gone, and its absence follows
// from the target language rather than from a change of behaviour.
//
// LEGACY-NOTE [model/dao/SkuDAO.cfc:L130-L148, model/dao/ProductDAO.cfc:L419]: the SKU search takes
// a SINGULAR `productTypeID` while the product search takes a PLURAL `productTypeIDs`, and the SKU
// body then binds its singular argument to a list-expanded parameter named `productTypeIDs`
// [model/dao/SkuDAO.cfc:L135-L136]. BOTH SPELLINGS ARE PRESERVED on their respective ports,
// recorded so that nobody later "harmonises" them and silently changes one method's public
// signature.
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

// --- Argument-list types, derived from the shipped ports -----

// JUDGMENT CALL: every recording array below is typed with `Parameters<...>` read off the shipped
// port instead of with a hand-written record of named fields. A derived type cannot drift: rename a
// parameter, reorder a pair or add a third and this file stops compiling. Recording the ARGUMENT
// LIST rather than a re-assembled object also means the recorded value reflects what the service
// actually passed, including how MANY values it passed - a double that unpacked its parameters into
// a fresh object would report the shape IT declared and could never reveal a stray extra argument.

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

// --- Deterministic synthetic values -----

/**
 * The product code `tests/fixtures/productFixtures.ts` gives every product it builds.
 *
 * Restated as a literal rather than imported, because it is the LEFT-HAND SIDE of all four legacy
 * skuCode formulas [model/service/SkuService.cfc:L97, L133, L159, L184, L194] and the expected
 * codes below are written out in full. Deriving them from the fixture with the same concatenation
 * the subject uses would let a shared fault cancel itself out.
 */
const FIXTURE_PRODUCT_CODE = 'TESTPRODUCTXXX';

/** The base price handed to `createSkus`, as a decimal string. Never a float. */
const PRICE_DECIMAL = '19.99';

/** A list price that clears the three-clause guard [model/service/SkuService.cfc:L94]. */
const LIST_PRICE_DECIMAL = '24.99';

/**
 * The raise [model/service/SkuService.cfc:L204] emits, character for character.
 *
 * A bare string with no error type, no code and no interpolation, preserved exactly, including the
 * missing article before "this product", because it is what a caller sees today.
 */
const UNEXPECTED_PRODUCT_CREATION_ERROR_MESSAGE =
  'There was an unexpected error when creating this product';

/**
 * The image extension allow-list [model/service/SkuService.cfc:L212] passes to the image service,
 * verbatim as a comma-delimited list.
 *
 * Preserved character for character: same four extensions, same order, same lower-casing, no
 * leading dot and no whitespace. It is a BUSINESS CONSTANT rather than configuration, which is why
 * it is a literal here and not an environment read.
 */
const ALLOWED_IMAGE_EXTENSIONS = 'jpg,jpeg,png,gif';

// LEGACY-DEFECT [model/service/SkuService.cfc:L148]: the resource-bundle key misspells "benefits"
// as "benifits". The key is a data contract resolved by the legacy admin, so the misspelling is
// preserved verbatim.
//
// Preserved deliberately; do not fix without a product decision.
//
// The locator the brief cites is L148; the source puts the MISSPELLED key at L143 and the correctly
// spelled terms key at L148. Both are recorded and carried byte for byte, and no i18n runtime is
// introduced - these are plain string constants.
const RB_KEY_SUBSCRIPTION_BENEFITS_REQUIRED = 'entity.product.subscriptionbenifitsrequired';

/** [model/service/SkuService.cfc:L148] - correctly spelled, unlike its sibling. */
const RB_KEY_SUBSCRIPTION_TERMS_REQUIRED = 'entity.product.subscriptiontermsrequired';

/**
 * [model/service/SkuService.cfc:L176].
 *
 * Note the prefix: this one is `validate.` while the two subscription keys are `entity.`. The
 * inconsistency is in the source and is carried, not normalised.
 */
const RB_KEY_ACCESS_CONTENTS_REQUIRED = 'validate.product.accesscontentsrequired';

/**
 * The identifiers of the canonical fixture graph's four SKUs. `tests/fixtures/skuFixtures.ts` wires
 * all four onto one product in this order:
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
 * The order [model/dao/SkuDAO.cfc:L172-L202] returns for the three OPTIONED members of the
 * canonical graph, written out rather than computed.
 *
 * The legacy statement orders by
 *   `SUM(SwOption.sortOrder * POWER(10, nextOptionGroupSortOrder - SwOptionGroup.sortOrder)) ASC`
 * which is a positional weighting in which the LOWEST-numbered option group is the most significant
 * digit. The fixture supplies option groups at sort orders 1, 2 and 3 with a ceiling of 4, and
 * options at sort orders 1, 2 and 3 respectively, so the weights are:
 *
 *   skfx-sku-b   group 1 only          1*1000                     = 1000
 *   skfx-sku-a   groups 1 and 2        1*1000 + 2*100             = 1200
 *   skfx-sku-c   groups 1, 2 and 3     1*1000 + 2*100 + 3*10      = 1230
 *
 * so ascending weight is b, a, c. Those products are shown as arithmetic here and are NOT computed
 * anywhere in this file. Reproducing the ORDER BY belongs to the MySQL adapter and asserting it to
 * `tests/integration/repositories/`; what the SERVICE owes is to place each SKU at the position its
 * identifier occupies in whatever the port answered.
 *
 * ! The radix ceiling is a pure scale factor, because every weight is
 *   `10^ceiling * SUM(optionSortOrder * 10^-groupSortOrder)`
 * and the ORDERING is therefore invariant to `nextOptionGroupSortOrder`. That is why the
 * request-scope cases distinguish two instances by seeding DIFFERENT orders outright: varying the
 * ceiling would prove nothing.
 */
const FIXTURE_OPTION_GROUP_SORTED_IDS: readonly string[] = [
  FIXTURE_SKU_B_ID,
  FIXTURE_SKU_A_ID,
  FIXTURE_SKU_C_ID,
];

// --- Inline entity construction -----

/**
 * Builds an option group with the two columns the cartesian path reads and inert values everywhere
 * else.
 *
 * `sortOrder` is an entity sort ordinal rather than a quantity and no arithmetic is performed on
 * it. The tie-breaker is supplied as a FIXED function rather than left to default: the shipped
 * default draws a random number, so supplying a constant makes "no random source anywhere in this
 * suite" true by construction. Every key of the shipped constructor is passed explicitly because
 * the entity declares them required-but-nullable, mirroring columns that are NULLable with no
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
 * Builds an option belonging to a group, the only association the cartesian path traverses
 * [model/service/SkuService.cfc:L75-L78].
 *
 * The owning group is REQUIRED here even though the entity allows it to be absent, because a
 * group-less option raises inside `createSkus` and that raise is pinned by its own case rather than
 * reached accidentally from a shared builder.
 */
function anOption(init: {
  readonly optionID: string;
  readonly sortOrder: number;
  /**
   * Nullable on purpose. `optionGroup` is a nullable association on the entity, so an option with
   * no group is a reachable state, and the unguarded `getOptionGroup().getOptionGroupID()` chain at
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
 * `getBaseProductType()` [model/entity/ProductType.cfc:L110-L115] answers the system code directly
 * whenever it is present, and only falls back to loading the root of `productTypeIDPath` when it is
 * empty - a fallback that needs the product type repository. Supplying a system code keeps every
 * dispatch case free of that port, which this service does not hold. Optional keys are OMITTED
 * rather than assigned `undefined`.
 */
function aProductType(init: { readonly productTypeID: string; readonly systemCode: string }) {
  return new ProductType({
    productTypeID: init.productTypeID,
    systemCode: init.systemCode,
  });
}

// --- The in-memory doubles -----

/**
 * What a {@link RecordingSkuRepository} answers with.
 *
 * Every field is optional and every one is OMITTED by callers that do not need it, never assigned
 * `undefined`. The array-valued fields are deliberately MUTABLE arrays rather than `readonly`: the
 * port declares mutable returns, and answering the very same array instance is what lets a case
 * assert that a result travelled back by IDENTITY.
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
 * ★ THE MIRROR WIDENED FOR ONE REVISION AND HAS NARROWED BACK. While the port
 * carried an eighth member - a `saveSkus` collection form - this double carried it
 * too, and this paragraph recorded the widening. The eighth member has been removed
 * from the port, so it is removed here: the double mirrors the port exactly, whatever
 * the port's width, and the port's width is SEVEN and locked. `SkuService` itself
 * reaches the write member nowhere, which is why it simply records and answers.
 *
 * ★ A PRE-REVISION COPY OF THE HEADING PARAGRAPH STOOD HERE - "IMPLEMENTS EXACTLY THE PORT'S SEVEN
 * MEMBERS AND NO EIGHTH" - and is struck. Its revised form, and the record of why the figure moved,
 * are the two starred paragraphs above; the one detail it carried that they did not is preserved
 * here: no method is `async`, each answers an already-resolved promise.
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
 * THE SHIPPED `SkuService` DOES NOT CONSUME THIS PORT, and this double exists to pin that fact
 * rather than to serve a call. `optionService` [model/service/SkuService.cfc:L53] is reached at
 * [L74] alone, for a generic primary-key lookup the port set does not carry, so option hydration
 * became the boundary input `CreateSkusInput.resolvedOptions`. The port stays exactly two members
 * wide and is consumed by `OptionService`; asserting its width here makes "no third member was
 * invented anywhere" checkable from this file.
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
 * `getService("imageService")` [model/service/SkuService.cfc:L212], which transformation rule T2
 * turns into a constructor-injected port. Nothing here touches a filesystem, and no path it is
 * handed is ever opened, written or resolved: it records and answers a seeded boolean, because the
 * image subsystem is out of scope.
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

  /**
   * The port's third member, which NOTHING in this file may reach.
   *
   * `generateSkuImageFileName` exists for
   * `ProductService.processProduct_updateDefaultImageFileNames`
   * [model/service/ProductService.cfc:L208-L214], and `model/service/SkuService.cfc` declares
   * no counterpart to that method at all. So the honest double here is one that FAILS THE TEST
   * if it is ever called, rather than one that quietly answers a name and lets an unnoticed
   * call pass. Its sibling in `tests/unit/services/productService.test.ts` is the one that
   * composes.
   */
  generateSkuImageFileName(): never {
    throw new Error(
      'SkuService must never reach ImageStore.generateSkuImageFileName: the name composition ' +
        'belongs to ProductService.processProduct_updateDefaultImageFileNames ' +
        '[model/service/ProductService.cfc:L208-L214], and model/service/SkuService.cfc declares ' +
        'no equivalent.',
    );
  }
}

/**
 * In-memory stand-in for the subscription stub port.
 *
 * Replaces `property name="subscriptionService" type="any";` [model/service/SkuService.cfc:L55],
 * reached at [L158], [L161] and [L164] - all three inside the OUT-OF-SCOPE subscription branch.
 * This double resolves a handle for any identifier unless it appears in `unresolvableIDs`, which is
 * how the "the lookup answered nothing" raises are reached deterministically. No subscription
 * behaviour is implemented and none is asserted: the cases pin DELEGATION only.
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

// --- Suite -----

describe('SkuService', () => {
  let skuRepository: RecordingSkuRepository;
  let imageStore: RecordingImageStore;
  let subscriptionTermProvider: RecordingSubscriptionTermProvider;
  let optionRepository: RecordingOptionRepository;
  let service: SkuService;

  beforeEach(() => {
    skuRepository = new RecordingSkuRepository();
    imageStore = new RecordingImageStore();
    subscriptionTermProvider = new RecordingSubscriptionTermProvider();
    optionRepository = new RecordingOptionRepository();

    // JUDGMENT CALL: the three collaborators are handed to the constructor and that is the whole
    // wiring story. The legacy bodies reached them through `getSkuDAO()`,
    // `getSubscriptionService()` and `getService("imageService")`, resolved at run time by a DI/1
    // property scan and by a locator call; the ported class takes them as explicit, compile-checked
    // constructor arguments instead, which is transformation rules T1 and T2 applied. That is why
    // constructing the subject needs nothing but three objects.
    //
    // The two trailing knobs are left at their shipped defaults - a bound of 1000 and
    // duplicate-code refusal OFF - so most cases observe default-configuration behaviour. The cases
    // that exercise the bound and the refusal construct their own instance.
    service = new SkuService(skuRepository, imageStore, subscriptionTermProvider);
  });

  describe('published surface', () => {
    it('carries all nine legacy method names verbatim and publishes no wider surface', () => {
      const publishedMembers = Object.getOwnPropertyNames(SkuService.prototype);

      // CFML parity [model/service/SkuService.cfc:L58, L210, L220, L246, L271, L281, L285, L289]:
      // eight of the nine names are the legacy CFML camelCase names, character for character,
      // because method-level interface parity is this migration's acceptance contract and a
      // reviewer has to be able to diff the two surfaces directly.
      expect(publishedMembers).toContain('createSkus');
      expect(publishedMembers).toContain('processImageUpload');
      expect(publishedMembers).toContain('getProductSkus');
      expect(publishedMembers).toContain('getSortedProductSkus');
      expect(publishedMembers).toContain('searchSkusByProductType');
      expect(publishedMembers).toContain('getSkuStocksDeletableFlag');
      expect(publishedMembers).toContain('getTransactionExistsFlag');
      expect(publishedMembers).toContain('getSkuBySkuCode');

      // The ninth is the one deliberate rename and the legacy name is GONE rather than kept as an
      // alias, an alias being a second surface to keep in step. `newSku` went the same way: [L92],
      // [L127], [L154], [L182] and [L192] all call `this.newSku()`, an inherited `HibachiService`
      // factory, which the target replaced with a PRIVATE draft helper rather than republishing.
      expect(publishedMembers).toContain('findSkus');
      expect(publishedMembers).not.toContain('getSkuSmartList');

      expect(publishedMembers).not.toContain('createSkuVariants');
      expect(publishedMembers).not.toContain('uploadImage');
      expect(publishedMembers).not.toContain('listProductSkus');
      expect(publishedMembers).not.toContain('getSortedSkus');
      expect(publishedMembers).not.toContain('searchSkus');
      expect(publishedMembers).not.toContain('isSkuStockDeletable');
      expect(publishedMembers).not.toContain('hasTransactions');
      expect(publishedMembers).not.toContain('findSkuBySkuCode');

      expect(publishedMembers).not.toContain('getSku');
      expect(publishedMembers).not.toContain('newSku');
      expect(publishedMembers).not.toContain('saveSku');
      expect(publishedMembers).not.toContain('deleteSku');
      expect(publishedMembers).not.toContain('validateSku');
      expect(publishedMembers).not.toContain('getSkuCurrencySmartList');
    });

    it('takes three ports, and the option port is deliberately not one of them', () => {
      // THE SHIPPED ARITY IS THREE. The suite was briefed for four ports; the production module is
      // the contract, so this asserts what shipped. A fourth REQUIRED parameter would make the
      // construction two lines below fail to compile under the strict profile, which makes this a
      // compile-time proof as much as a run-time one.
      expect(SkuService.length).toBe(3);

      const constructedWithThreePorts = new SkuService(
        new RecordingSkuRepository(),
        new RecordingImageStore(),
        new RecordingSubscriptionTermProvider(),
      );

      expect(constructedWithThreePorts).toBeInstanceOf(SkuService);

      // The SKU port is EXACTLY seven members wide, in declaration order, so nothing
      // in this file can accidentally describe a wider data contract than the port.
      //
      // ★ THIS LIST CARRIED AN EIGHTH ENTRY FOR ONE REVISION. A `saveSkus` collection
      // form was added to the port to reproduce the ORM flush behind
      // [model/service/ProductService.cfc:L216-L233], and this assertion is where its
      // arrival announced itself. It has been removed from the port - seven is the
      // locked arithmetic - so it is removed here, and this assertion is what would
      // announce any attempt to put it back.
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

      // LEGACY-NOTE [model/service/SkuService.cfc:L53, L74]: `optionService` is reached at exactly
      // one line, and only for HibachiService's generic `get<Entity>(primaryKey)` lookup, which the
      // port set does not carry. Option hydration therefore became the boundary input
      // `CreateSkusInput.resolvedOptions`. The port itself is untouched by that decision - still
      // exactly two members - and an instance stands here unwired to prove the service never
      // reaches one.
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

      // Recorded with ZERO arguments. The port declares both `productID` and `skuID` as optional
      // and the service forwards NEITHER - [model/service/SkuService.cfc:L286] calls
      // `getSkuDAO().getTransactionExistsFlag()` bare, so both DAO defaults apply. Pinning the
      // arity at 0 stops a later change from quietly forwarding a filter the legacy never sent.
      expect(isolatedRepository.transactionExistsFlagCalls).toStrictEqual([[]]);

      expect(skuRepository.transactionExistsFlagCalls).toStrictEqual([]);
    });

    it('refuses a creation bound that is not a positive whole number', () => {
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
      // CFML parity [model/service/SkuService.cfc:L61, L124, L138, L172]: the legacy dispatch is a
      // `switch`/`cfif` over the base product type's system code, and CFML string comparison is
      // CASE-INSENSITIVE while TypeScript's `===` is not. A port using `===` would silently drop
      // every row whose `systemCode` was stored with different casing, so the equality is routed
      // through the CFML comparison helper.
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

      // Asserted CHARACTER FOR CHARACTER, not by pattern. It is a user-visible string the legacy
      // admin surfaces, so a reworded version - however much clearer - would be an observable
      // behaviour change at the boundary.
      await expect(service.createSkus(product, { price: PRICE_DECIMAL })).rejects.toThrow(
        UNEXPECTED_PRODUCT_CREATION_ERROR_MESSAGE,
      );
      expect(UNEXPECTED_PRODUCT_CREATION_ERROR_MESSAGE).toBe(
        'There was an unexpected error when creating this product',
      );

      expect(product.getSkus()).toStrictEqual([]);
    });

    it('returns a constant true no matter what the chosen branch actually did', async () => {
      // LEGACY-DEFECT [model/service/SkuService.cfc:L207]: createSkus returns a constant true and
      // never signals partial or failed creation.
      //
      // Preserved deliberately; do not fix without a product decision.
      //
      // Both invocations below answer `true`. The first created a SKU; the second created NONE,
      // because its branch recorded a validation failure and returned early. The return value
      // cannot tell them apart, so a caller has no way to know creation was skipped, and the target
      // reproduces that rather than upgrading the return to a result object.
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
      // `getProductType().getBaseProductType()` with no null test. `productType` is only `required`
      // on the `save` validation context, so a product with none is reachable and the legacy
      // raises. No default branch is invented to paper over it.
      const product = makeProductFixture({
        productID: 'no-product-type',
        productType: undefined,
      });

      await expect(service.createSkus(product, { price: PRICE_DECIMAL })).rejects.toThrow(
        /has no product type/,
      );
    });

    it('raises when the product carries no product code, because every code formula concatenates it', async () => {
      // CFML parity [model/service/SkuService.cfc:L97, L133, L159, L184, L194]: all four distinct
      // skuCode formulas begin by concatenating `getProductCode()` with no null test, so an absent
      // code raises rather than producing a code that starts with the delimiter.
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
     * The returned comma list is JOINED from options this file just constructed - never parsed, and
     * no `src/lib/cfml/list.ts` helper is involved, so the subject's own parsing is not used to
     * build the subject's expected input. Group sort orders ascend with the group ordinal so the
     * graph is deterministic; sort order plays no part in combination generation, only in the two
     * sorted-read methods.
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
      // JUDGMENT CALL: the option-cartesian combination count is unbounded by construction -
      // [model/service/SkuService.cfc:L82-L86] multiplies `arrayLen(optionGroups[key])` into
      // `totalCombos` for every group with no ceiling anywhere. Under an ambient cftransaction this
      // was merely a large unit of work; without one it is a correctness problem, so the target
      // carries an explicit bound and idempotent retry. These are correctness protections, not
      // performance claims, and contain no timing or benchmark. The expected count is a PLAIN
      // NUMBER, never a `Money`.
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
      //   `getProductCode() & "-" & arrayLen(getSkus()) + 1`
      // evaluated AFTER the previous combination was attached, so the ordinals run 1..6 with no
      // gap. Written out in full so a fault in the formula cannot be mirrored here.
      expect(created.map((sku) => sku.getSkuCode())).toStrictEqual([
        'TESTPRODUCTXXX-1',
        'TESTPRODUCTXXX-2',
        'TESTPRODUCTXXX-3',
        'TESTPRODUCTXXX-4',
        'TESTPRODUCTXXX-5',
        'TESTPRODUCTXXX-6',
      ]);

      const generatedCodes = created.map((sku) => sku.getSkuCode());
      expect(
        generatedCodes.every((code) => code !== undefined && ENTITY_CODE_PATTERN.test(code)),
      ).toBe(true);

      // The odometer's carry direction. [model/service/SkuService.cfc:L112-L120] walks
      // `changeKeyIndex` from 1 upward, so the FIRST indexed group is the LEAST significant wheel
      // and the last is the MOST significant. The size therefore changes on every row while the
      // colour changes only every second row, and reversing it would produce the same six SKUs in a
      // different order carrying different codes.
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

      expect(created.every((sku) => sku.getOptions().length === 2)).toBe(true);

      const expectedPrice = Money.fromDecimalString(PRICE_DECIMAL);
      const expectedListPrice = Money.fromDecimalString(LIST_PRICE_DECIMAL);
      expect(created.every((sku) => sku.getPrice().equals(expectedPrice))).toBe(true);
      expect(created.every((sku) => sku.getListPrice().equals(expectedListPrice))).toBe(true);
    });

    it('does not over-advance the odometer past the final combination', async () => {
      // [model/service/SkuService.cfc:L109] `if(i < totalCombos)` is LOAD-BEARING. The carry loop
      // at L112-L120 has NO bounds check on `changeKeyIndex`: once every wheel is at its last
      // position it keeps resetting wheels and incrementing the index, so on the final combination
      // it would walk off the end of `indexedKeys`. Only the L109 guard stops that. The input shape
      // asserted here is the one that puts every wheel at its last position on the final
      // combination.
      const graph = anOptionGraph([2, 2, 2]);
      const product = makeProductFixture({ productID: 'odometer-guard' });

      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          options: graph.optionIDList,
          resolvedOptions: graph.options,
        }),
      ).toBe(true);

      // 2 * 2 * 2 = 8, and the eighth combination is (last, last, last) - precisely the row that
      // would trip an unguarded carry.
      expect(product.getSkus()).toHaveLength(8);
      expect(product.getSkus().every((sku) => sku.getOptions().length === 3)).toBe(true);

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

      expect(largerCount - smallerCount).toBe(4);
    });

    it('raises when an option named in the comma list is absent from resolvedOptions', async () => {
      // LEGACY-NOTE [model/service/SkuService.cfc:L74]: the legacy resolved each option through
      // `getOptionService().getOption(listGetAt(...))`, HibachiService's generic
      // `get<Entity>(primaryKey)`, which the thirteen-port set does not carry. Option hydration
      // therefore became the boundary input `resolvedOptions`, and an unresolved identifier raises
      // here exactly as the legacy raised at L75 on the null its lookup returned. No option is
      // silently skipped and no empty group fabricated, either of which would change the
      // combination count.
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
      // `getOptionGroup().getOptionGroupID()` with no null test, so an option with no group raises.
      // `optionGroup` is nullable on the entity, so the state is reachable.
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
     * Duplicated from the odometer block deliberately: each describe owns its own inputs, so a
     * later change to one block's graph cannot silently move another's expectations.
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
      // The refusal is asserted STRUCTURALLY: a bound is configured, a plan exceeds it, the plan is
      // refused, and nothing was attached. No duration is measured, no repeat count stands in for
      // one, and the runner's own timeout is not read as a service level.
      //
      // The bound matters because [model/service/SkuService.cfc:L85-L86] multiplies group sizes
      // into `totalCombos` with no ceiling, and the legacy relied on an ambient cftransaction plus
      // its own `requesttimeout` to absorb whatever came out. Neither exists in the target, so a
      // plan that cannot complete must be refused BEFORE it half-completes, or a partially attached
      // product is the observable result. Those legacy settings and the platform's request ceilings
      // are PLATFORM FACTS, never service levels.
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

      expect(product.getSkus()).toStrictEqual([]);
    });

    it('permits a plan sitting exactly on the bound', async () => {
      // The comparison is `>` rather than `>=` [assertWithinCreationBound], so a plan equal to the
      // bound is allowed. Asserting the boundary itself, not just a value safely inside it, is what
      // makes the guard's shape reviewable.
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
      // iteration, so it is the second unbounded bulk-mutation site in this component and carries
      // its own bound. Covering only the option branch would leave the other unguarded in fact
      // while appearing guarded in the suite.
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
      // The default configuration reproduces the legacy exactly: the single-merchandise code
      // formula [model/service/SkuService.cfc:L133] is the FIXED string `getProductCode() & "-1"`,
      // so a repeat regenerates the same code and attaches a second SKU carrying it. Under the
      // legacy's ambient transaction a retried request rolled back; without one, a retried Lambda
      // invocation lands twice. This case pins the hazard rather than the protection, because
      // showing only the protection working would not show why it exists.
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

      expect(product.getSkus().map((sku) => sku.getSkuCode())).toStrictEqual([
        'TESTPRODUCTXXX-1',
        undefined,
      ]);
    });

    it('cannot refuse a repeat of a count-derived code path, and that limit is deliberate', async () => {
      // JUDGMENT CALL: the refusal keys on the GENERATED CODE, so it protects only the paths whose
      // formula is fixed - single merchandise [L133] and bundled content access [L184]. The option
      // and per-content paths derive their ordinal from `arrayLen(getSkus()) + 1` [L97, L194], so a
      // repeat produces FRESH codes and collides with nothing. Inventing a second mechanism - a
      // request key, a hash, a persisted marker - would be new behaviour with no legacy antecedent,
      // so the limit is recorded here as measured rather than missed.
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
      // CFML parity [model/service/SkuService.cfc:L93, L129, L156, L157, L183, L193]: every `price`
      // read is UNGUARDED - no structKeyExists, no isNumeric, no default - so an absent price
      // raised. The target lifts that into the type system by declaring `price` REQUIRED on
      // CreateSkusInput, keeping the run-time raise underneath for a caller crossing the boundary
      // from untyped JSON. The directive below IS the assertion: it fails the build the moment
      // `price` becomes optional.
      // @ts-expect-error - price is required on CreateSkusInput, so omitting it must not compile.
      const inputWithNoPrice: CreateSkusInput = { listPrice: LIST_PRICE_DECIMAL };
      const product = makeProductFixture({ productID: 'price-absent' });

      await expect(service.createSkus(product, inputWithNoPrice)).rejects.toThrow(
        /price is absent/,
      );
    });

    it('raises on a price that is not a plain decimal numeral', async () => {
      // No default is substituted and no zero is fabricated. A SKU whose price silently became zero
      // would be given away, which is why the unguarded read is reproduced as a raise rather than
      // softened into a fallback.
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
      // THE ASYMMETRY. [model/service/SkuService.cfc:L94, L130] guards `listPrice` with a
      // THREE-CLAUSE test,
      //   structKeyExists(data,"listPrice") and isNumeric(...) and ... gt 0
      // whereas every `price` read above is guarded by nothing at all. A bad price raises; a bad
      // listPrice is DROPPED WITHOUT COMPLAINT and the SKU keeps the entity's zero default. Both
      // halves of that asymmetry are load-bearing, so both are asserted, and neither is normalised
      // toward the other.
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

          expect(created.getPrice().equals(Money.fromDecimalString(PRICE_DECIMAL))).toBe(true);
        }
      }

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
     * Subscription is EXPLICITLY OUT OF SCOPE for this migration slice, so nothing below asserts
     * subscription feature behaviour - no term arithmetic, no benefit entitlement, no renewal
     * schedule. What is asserted is DELEGATION: that the branch reaches the stub port with the
     * identifiers it was given, and raises where the legacy raised.
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
      // LEGACY-DEFECT [model/service/SkuService.cfc:L148]: the resource-bundle key misspells
      // "benefits" as "benifits". The key is a data contract resolved by the legacy admin, so the
      // misspelling is preserved verbatim.
      //
      // Preserved deliberately; do not fix without a product decision.
      //
      // The brief cites L148 for the misspelling; the source puts the MISSPELLED key at L143 and
      // the correctly spelled terms key at L148. Both locators are recorded and both strings
      // carried byte for byte, because correcting the spelling would break every resource bundle
      // keyed on it.
      expect(RB_KEY_SUBSCRIPTION_BENEFITS_REQUIRED).toBe(
        'entity.product.subscriptionbenifitsrequired',
      );
      expect(RB_KEY_SUBSCRIPTION_TERMS_REQUIRED).toBe('entity.product.subscriptiontermsrequired');
      expect(RB_KEY_ACCESS_CONTENTS_REQUIRED).toBe('validate.product.accesscontentsrequired');

      // The prefix inconsistency is in the source too - two `entity.` keys and one `validate.` key
      // for the same kind of failure - and it is carried, not normalised.
      expect(RB_KEY_SUBSCRIPTION_BENEFITS_REQUIRED.startsWith('entity.')).toBe(true);
      expect(RB_KEY_SUBSCRIPTION_TERMS_REQUIRED.startsWith('entity.')).toBe(true);
      expect(RB_KEY_ACCESS_CONTENTS_REQUIRED.startsWith('validate.')).toBe(true);

      // LEGACY-NOTE [org/Hibachi/JavaRB]: these are PLAIN STRINGS and nothing in the target
      // resolves them. JavaRB is deliberately not ported, so no i18n runtime is introduced; the
      // identifiers survive so the legacy admin can resolve them against its bundles.
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

      // CFML parity [model/service/SkuService.cfc:L160-L167]: BOTH benefit lists are re-walked
      // inside the per-term loop rather than resolved once outside it, so a two-term input resolves
      // three benefits twice. The recorded order is the proof of that legacy structure, not an
      // incidental detail.
      expect(subscriptionTermProvider.subscriptionBenefitCalls).toStrictEqual([
        ['benefit-1'],
        ['benefit-2'],
        ['renewal-1'],
        ['benefit-1'],
        ['benefit-2'],
        ['renewal-1'],
      ]);

      // CFML parity [model/service/SkuService.cfc:L155 vs L159]: `setProduct` attaches the draft
      // BEFORE the ordinal is computed from `arrayLen(getSkus()) + 1`, so the FIRST subscription
      // SKU is coded `-2` and not `-1`. The off-by-one is in the source ordering and reproduced
      // rather than tidied, the codes being a data contract.
      expect(product.getSkus().map((sku) => sku.getSkuCode())).toStrictEqual([
        'TESTPRODUCTXXX-2',
        'TESTPRODUCTXXX-3',
      ]);

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

      // CFML parity [model/service/SkuService.cfc:L156-L157]: renewal price is set from the SAME
      // `data.price` read, so the two are equal by construction rather than by coincidence.
      // Compared as `Money`; no float arithmetic is performed anywhere.
      const expectedPrice = Money.fromDecimalString(PRICE_DECIMAL);
      expect(product.getSkus().every((sku) => sku.getPrice().equals(expectedPrice))).toBe(true);
      expect(product.getSkus().every((sku) => sku.getRenewalPrice().equals(expectedPrice))).toBe(
        true,
      );
    });

    it('records both subscription validation failures and creates nothing, touching no port', async () => {
      const product = aSubscriptionProduct('subscription-validation');

      // Both required lists absent. [model/service/SkuService.cfc:L142-L150] records a failure for
      // each and then falls straight past the creation loop.
      expect(await service.createSkus(product, { price: PRICE_DECIMAL })).toBe(true);

      expect(product.getSkus()).toStrictEqual([]);

      // The early return happens BEFORE any lookup, so the stub port is never reached. LEGACY-NOTE:
      // the legacy pushed these failures onto the entity through `addError(propertyName, rbKey)`,
      // an inherited HibachiEntity mechanism. `Product` publishes no error surface in the target,
      // `HibachiEntity` being deliberately not ported, so the failures are unobservable from
      // outside and the only faithful assertion is that NOTHING WAS CREATED and NOTHING WAS CALLED.
      expect(subscriptionTermProvider.subscriptionTermCalls).toStrictEqual([]);
      expect(subscriptionTermProvider.subscriptionBenefitCalls).toStrictEqual([]);
    });

    it('raises on the unguarded renewalSubscriptionBenefits read', async () => {
      // LEGACY-DEFECT [model/service/SkuService.cfc:L163]: `renewalSubscriptionBenefits` is
      // iterated with NO structKeyExists guard - unlike subscriptionBenefits at L142 and
      // subscriptionTerms at L147 - and it is never validated either, so an absent value raises
      // rather than being recorded as a validation failure.
      //
      // Preserved deliberately; do not fix without a product decision.
      const product = aSubscriptionProduct('subscription-renewal-unguarded');

      await expect(
        service.createSkus(product, {
          price: PRICE_DECIMAL,
          subscriptionTerms: 'term-1',
          subscriptionBenefits: 'benefit-1',
        }),
      ).rejects.toThrow(/renewalSubscriptionBenefits is absent/);

      // The raise lands MID-ITERATION: the term and the ordinary benefits were already resolved
      // through the port before the unguarded read was reached. Pinning that ordering distinguishes
      // a genuinely unguarded read from an up-front validation.
      expect(subscriptionTermProvider.subscriptionTermCalls).toStrictEqual([['term-1']]);
      expect(subscriptionTermProvider.subscriptionBenefitCalls).toStrictEqual([['benefit-1']]);
    });

    it('raises when the stub port cannot resolve a term or a benefit', async () => {
      // CFML parity [model/service/SkuService.cfc:L158, L161, L164]: each lookup result is passed
      // STRAIGHT into `setSubscriptionTerm` / the add methods with no null test, so an unresolvable
      // identifier raises rather than being skipped, which would produce a SKU missing the
      // association the branch exists to attach.
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
      // CFML parity [model/service/SkuService.cfc:L179]: the flag is read through CFML truthiness,
      // so `true`, `1` and `"yes"` are all true while `false`, `0` and `"no"` are all false.
      // TypeScript would treat the non-empty string `"no"` as truthy, which is the class of silent
      // behaviour change the parity helper exists to prevent, so every one of those forms is
      // exercised rather than just the boolean.
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
      const product = makeProductFixture({ productID: 'creation-touches-no-image-store' });

      await service.createSkus(product, { price: PRICE_DECIMAL });

      expect(imageStore.saveImageFileCalls).toStrictEqual([]);
      expect(imageStore.deleteImageFileCalls).toStrictEqual([]);
    });
  });

  // =========================================================================
  // ★★ THE FIVE DEFAULT-SKU DESIGNATION STRATEGIES, ALL FIVE OBSERVABLE.
  //
  // ★ DECLARED NET-NEW under AAP 0.6.6. `meta/tests/unit/service/` holds
  // AccountServiceTest, HibachiServiceTest, PaymentServiceTest and
  // UtilityRBServiceTest - no SkuService test exists at all - so nothing here has a
  // legacy antecedent.
  //
  // ★ WHY THIS BLOCK EXISTS, WHICH IS THE FINDING ITSELF. `createSkus` designates a
  // default SKU at FIVE distinct sites, and until now not one of those designations
  // landed anywhere observable: the shipped module recorded them on a
  // `SkuCreationLedger` field that nothing read, so every product this service built
  // reported `getDefaultSku() === undefined`. `SwProduct.defaultSkuID` was therefore
  // written NULL for every product created through this path, and the eight accessors
  // on `Product` that read through the default SKU all answered their absent-value
  // fallback. The designations now write to `Product.setDefaultSku`, and these cases
  // are what make that checkable.
  //
  // ★ THE FIVE ARE NOT VARIATIONS ON ONE RULE. Each has its own gate, and the gates
  // disagree with one another, so a single merged case would hide exactly the thing
  // worth pinning:
  //
  //   1. [L100-L103] merchandise, MULTIPLE options: `addSku`, then designate only
  //      `if(isNull(getDefaultSku()))`. FIRST-WINS, and the only guarded site.
  //   2. [L134]      merchandise, NO options:      designate UNCONDITIONALLY.
  //   3. [L166-L168] subscription:                 designate `if(i==1)`, the term index.
  //   4. [L189]      contentAccess, BUNDLED:       designate UNCONDITIONALLY.
  //   5. [L197-L199] contentAccess, per content:   designate `if(c==1)`, the loop index.
  //
  // Sites 2 and 4 overwrite a default the product already carried; site 1 does not.
  // Sites 3 and 5 reach the same outcome as 1 by a different mechanism - a counter
  // test rather than a null test - which is indistinguishable on a fresh product and
  // very much distinguishable on a product that already has a default.
  // =========================================================================

  describe('createSkus - the five default-SKU designation strategies', () => {
    /** A product type whose base system code drives one of the three branches. */
    function aBranchProduct(productID: string, systemCode: string): Product {
      return makeProductFixture({
        productID,
        productType: aProductType({ productTypeID: `pt-${systemCode}`, systemCode }),
      });
    }

    it('STRATEGY 1 [L100-L103] - the FIRST combination wins, and the rest do not displace it', async () => {
      // Two option groups of two options each: four combinations, four SKUs, and the
      // guard closes after the first. `isNull(getDefaultSku())` is the whole of the
      // difference between this site and site 2, so the assertion that matters is not
      // "a default was set" but "the default is the FIRST SKU and not the last".
      const sizeGroup = anOptionGroup({ optionGroupID: 'og-default-size', sortOrder: 1 });
      const colourGroup = anOptionGroup({ optionGroupID: 'og-default-colour', sortOrder: 2 });
      const resolvedOptions = [
        anOption({ optionID: 'opt-d-size-1', sortOrder: 1, optionGroup: sizeGroup }),
        anOption({ optionID: 'opt-d-size-2', sortOrder: 2, optionGroup: sizeGroup }),
        anOption({ optionID: 'opt-d-colour-1', sortOrder: 1, optionGroup: colourGroup }),
        anOption({ optionID: 'opt-d-colour-2', sortOrder: 2, optionGroup: colourGroup }),
      ];

      const product = makeProductFixture({ productID: 'designate-strategy-1' });

      expect(product.getDefaultSku()).toBeUndefined();

      await service.createSkus(product, {
        price: PRICE_DECIMAL,
        options: resolvedOptions.map((option) => option.getOptionID()).join(','),
        resolvedOptions,
      });

      const created = product.getSkus();

      expect(created).toHaveLength(4);
      expect(product.getDefaultSku()).toBe(created[0]);
      expect(product.getDefaultSku()).not.toBe(created[3]);
    });

    it('STRATEGY 1 [L101] - a product that ALREADY has a default keeps it', async () => {
      // The guard is a null test on the product, not a per-invocation flag, so a second
      // invocation designates nothing. This is the case that distinguishes the real
      // guard from a "first SKU of this call" reading of it, and it is also why the
      // guard could not be moved onto `Product.setDefaultSku` itself: doing so would
      // silently apply it to the four sites that are meant to overwrite.
      const product = makeProductFixture({ productID: 'designate-strategy-1-second-call' });

      await service.createSkus(product, { price: PRICE_DECIMAL, listPrice: LIST_PRICE_DECIMAL });

      // The first invocation took the NO-options arm, which is site 2.
      const firstDefault = product.getDefaultSku();

      expect(firstDefault).toBe(product.getSkus()[0]);

      const optionGroup = anOptionGroup({ optionGroupID: 'og-second-call', sortOrder: 1 });
      const resolvedOptions = [
        anOption({ optionID: 'opt-second-call-1', sortOrder: 1, optionGroup }),
        anOption({ optionID: 'opt-second-call-2', sortOrder: 2, optionGroup }),
      ];

      await service.createSkus(product, {
        price: PRICE_DECIMAL,
        options: resolvedOptions.map((option) => option.getOptionID()).join(','),
        resolvedOptions,
      });

      expect(product.getSkus()).toHaveLength(3);
      // Unchanged: two more SKUs were attached and NEITHER became the default.
      expect(product.getDefaultSku()).toBe(firstDefault);
    });

    it('STRATEGY 2 [L134] - the single merchandise SKU is designated UNCONDITIONALLY', async () => {
      // No options in, one SKU out, and the designation carries no guard. The second
      // half of this case is what separates it from site 1: invoking the same arm again
      // OVERWRITES a default that is already present, which a first-wins reading would
      // get wrong.
      const product = makeProductFixture({ productID: 'designate-strategy-2' });

      await service.createSkus(product, { price: PRICE_DECIMAL });

      const first = product.getSkus()[0];

      expect(product.getSkus()).toHaveLength(1);
      expect(product.getDefaultSku()).toBe(first);

      await service.createSkus(product, { price: PRICE_DECIMAL });

      const second = product.getSkus()[1];

      expect(product.getSkus()).toHaveLength(2);
      expect(second).not.toBe(first);
      // OVERWRITTEN. [L134] has no `isNull` test, unlike [L101].
      expect(product.getDefaultSku()).toBe(second);
    });

    it('STRATEGY 3 [L166-L168] - the subscription branch designates on the TERM INDEX', async () => {
      // `if(i==1)` is a loop-counter test rather than a null test, so it reaches the
      // same outcome as site 1 on a fresh product and a DIFFERENT one on a product that
      // already has a default - which the second half of this case shows.
      const product = aBranchProduct('designate-strategy-3', 'subscription');

      await service.createSkus(product, {
        price: PRICE_DECIMAL,
        subscriptionBenefits: 'sub-benefit-1',
        subscriptionTerms: 'sub-term-1,sub-term-2,sub-term-3',
        renewalSubscriptionBenefits: 'renewal-benefit-1',
      });

      const created = product.getSkus();

      expect(created).toHaveLength(3);
      expect(product.getDefaultSku()).toBe(created[0]);

      // A second invocation restarts the counter at 1, so `i==1` is true again and the
      // designation moves. [L101]'s guard would have prevented this; [L167]'s does not.
      await service.createSkus(product, {
        price: PRICE_DECIMAL,
        subscriptionBenefits: 'sub-benefit-1',
        subscriptionTerms: 'sub-term-4',
        renewalSubscriptionBenefits: 'renewal-benefit-1',
      });

      expect(product.getSkus()).toHaveLength(4);
      expect(product.getDefaultSku()).toBe(product.getSkus()[3]);
    });

    it('STRATEGY 3 [L152] - a validation failure designates NOTHING', async () => {
      // The whole subscription creation block sits behind `if(!hasErrors())` [L152], so a
      // missing benefit list leaves both the collection and the designation untouched.
      // Asserting the designation as well as the collection is the point: a designation
      // that survived a refused creation would name a SKU that was never built.
      const product = aBranchProduct('designate-strategy-3-refused', 'subscription');

      await service.createSkus(product, {
        price: PRICE_DECIMAL,
        subscriptionTerms: 'sub-term-1',
      });

      expect(product.getSkus()).toStrictEqual([]);
      expect(product.getDefaultSku()).toBeUndefined();
    });

    it('STRATEGY 4 [L189] - the BUNDLED contentAccess SKU is designated UNCONDITIONALLY', async () => {
      // One SKU holding every access content, and no guard on the designation - so this
      // site behaves like [L134] and not like [L197]. `bundleContentAccess` is typed as
      // CFML-truthy input, so `1` reaches the bundled arm exactly as `true` does.
      const product = aBranchProduct('designate-strategy-4', 'contentAccess');

      await service.createSkus(product, {
        price: PRICE_DECIMAL,
        accessContents: 'content-1,content-2,content-3',
        bundleContentAccess: 1,
      });

      const created = product.getSkus();

      // ONE sku, not three: this is the arm that bundles.
      expect(created).toHaveLength(1);
      expect(product.getDefaultSku()).toBe(created[0]);
      expect(product.getDefaultSku()?.getAccessContentIDs()).toStrictEqual([
        'content-1',
        'content-2',
        'content-3',
      ]);
    });

    it('STRATEGY 5 [L197-L199] - the per-content arm designates on the LOOP INDEX', async () => {
      // Not bundled: one SKU per content, and `if(c==1)` designates the first. The SKU
      // code formula differs too - `-#c#` rather than the collection length - so the
      // first SKU's code is asserted alongside the designation to show that the
      // designated SKU really is the one the first iteration built.
      const product = aBranchProduct('designate-strategy-5', 'contentAccess');

      await service.createSkus(product, {
        price: PRICE_DECIMAL,
        accessContents: 'content-1,content-2,content-3',
      });

      const created = product.getSkus();

      expect(created).toHaveLength(3);
      expect(product.getDefaultSku()).toBe(created[0]);
      expect(product.getDefaultSku()?.getSkuCode()).toBe(`${FIXTURE_PRODUCT_CODE}-1`);
      expect(product.getDefaultSku()?.getAccessContentIDs()).toStrictEqual(['content-1']);
    });

    it('every designated SKU is TRANSIENT, which is what the cascade reads', async () => {
      // ⚠ THE CASE THAT TIES THIS BLOCK TO THE PERSISTENCE FIX. Designation happens
      // before any row exists, so the designated SKU reports `isNew()`. That is
      // precisely the state `mysqlProductRepository.resolvePersistedDefaultSkuKey` reads
      // to decide it must bind SQL NULL for `defaultSkuID` and issue the follow-up
      // update once the SKU row is written. A designated SKU that did NOT report itself
      // transient would have its PROVISIONAL key written into the foreign key - a
      // well-formed identifier naming no row.
      const product = makeProductFixture({ productID: 'designate-transient' });

      await service.createSkus(product, { price: PRICE_DECIMAL });

      const designated = product.getDefaultSku();

      expect(designated?.isNew()).toBe(true);
      // And it carries a provisional key rather than an empty one, which is why the
      // adapter cannot decide transience by inspecting the identifier.
      expect(designated?.getSkuID()).toMatch(/^[0-9a-f]{32}$/);
      // The designated SKU is also a MEMBER of the collection, so the cascade's
      // `isNew()` filter over `getSkus()` is guaranteed to include it.
      expect(product.getSkus()).toContain(designated);
    });

    it('the designation is on the PRODUCT, and the service keeps no record of its own', async () => {
      // ★ QUOTE-THEN-REVISE, AS AN ASSERTION. The shipped `SkuCreationLedger` carried a
      // `designatedDefaultSku` field whose doc read: "★ THE DESIGNATION CANNOT BE
      // PERSISTED FROM THIS FILE ... Writing `SwProduct.defaultSkuID` needs a product
      // repository, and no product repository is among this file's dependencies." Both
      // sentences were true and the conclusion drawn from them was not: the designation
      // does not need a product repository HERE, because the aggregate root carries it
      // and `ProductRepository.saveProduct` is the seam that writes it. The ledger field
      // is gone, and this case pins the replacement - the state lives on the product,
      // reachable by any caller, and the service holds nothing.
      const product = makeProductFixture({ productID: 'designate-no-service-state' });

      await service.createSkus(product, { price: PRICE_DECIMAL });

      expect(product.getDefaultSku()).toBe(product.getSkus()[0]);

      // A second product built by the SAME service instance is unaffected by the first.
      const other = makeProductFixture({ productID: 'designate-no-service-state-other' });

      expect(other.getDefaultSku()).toBeUndefined();

      await service.createSkus(other, { price: PRICE_DECIMAL });

      expect(other.getDefaultSku()).toBe(other.getSkus()[0]);
      expect(other.getDefaultSku()).not.toBe(product.getDefaultSku());
    });
  });

  // --- THE FIRST OF TWO STRUCTURALLY DISTINCT INDEXING DEFECTS -----
  //
  // Both `getProductSkus` and `getSortedProductSkus` merge a SKU collection into an order supplied
  // by `SkuDAO.getSortedProductSkusID`, and both do it by using `arrayFind`'s answer DIRECTLY as an
  // array index. `arrayFind` returns 0 when it finds nothing, and 0 is not a valid index in a
  // 1-based CFML array, so either site raises the moment the collection holds a SKU the sorted-ID
  // result does not.
  //
  // What makes them TWO defects rather than one is the GUARD in front of each. `getProductSkus`
  // [L223] guards with THREE clauses - `sorted`, `arrayLen(skus) gt 1`, and
  // `arrayLen(skus[1].getOptions())` - whose third clause inspects ONLY THE FIRST SKU, so a
  // collection whose first member has options and whose later members do not still enters the sort.
  // `getSortedProductSkus` [L248] guards with ONE clause, `arrayLen(skus) lt 2`, with NO options
  // clause. They therefore fail on DIFFERENT INPUT SHAPES, and each is pinned with its own test,
  // marker and input.

  describe('getProductSkus - the three-clause guard that inspects only the first SKU', () => {
    /**
     * The canonical four-SKU graph's product, as `tests/fixtures/skuFixtures.ts` wires it.
     *
     * The fixture attaches all four members - A with two options, B with one, C with three and D
     * with NONE - to a single product, and D is the member both indexing defects need. Reaching it
     * through the fixture keeps this suite from owning a second definition of the same shape.
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
      // LEGACY-DEFECT [model/service/SkuService.cfc:L223,L236-L237]: the sorted branch's guard
      // inspects only skus[1].getOptions(), so a collection whose first SKU has options but whose
      // later SKUs do not still enters the sort. arrayFind then returns 0 at L236 and L237 assigns
      // at index 0, an invalid CFML index.
      //
      // Preserved deliberately; do not fix without a product decision.
      //
      // THE INPUT SHAPE IS THE PROOF. The collection is FIRST-HAS-OPTIONS, LATER-HAS-NONE: A (two
      // options) leads, D (none) trails. The first clause passes on A, so the sort runs; D is then
      // absent from the sorted-ID result, because `SkuDAO.getSortedProductSkusID`
      // [model/dao/SkuDAO.cfc:L172-L202] joins through `SwOption`/`SwOptionGroup` and an
      // option-less SKU cannot appear in it. Merging this with the all-option-less sibling below
      // would hide that the guards differ, which is the only interesting thing about the pair.
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

        sortedProductSkuIDs: [FIXTURE_SKU_A_ID],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      await expect(subject.getProductSkus(product, true)).rejects.toThrow(
        /sku 'skfx-sku-d' is absent from the sorted-ID result, so arrayFind answered 0/,
      );

      // The raise cites the L236-L237 locator pair, which is how a reader of a failure gets from
      // the stack straight to the legacy lines being reproduced.
      await expect(subject.getProductSkus(product, true)).rejects.toThrow(/L236-L237/);

      expect(repository.sortedProductSkusIDCalls).toStrictEqual([
        [FIXTURE_PRODUCT_ID],
        [FIXTURE_PRODUCT_ID],
      ]);
    });

    it('never consults the sort port when the FIRST SKU carries no options, even if later ones do', async () => {
      // The other face of the same guard, and why it is a defect rather than a simple bug:
      // [model/service/SkuService.cfc:L223] reads `skus[1]` and nothing else, so leading with the
      // option-less member turns the ENTIRE sort off for a collection that is otherwise fully
      // sortable. The order of the port's result decides whether sorting happens at all.
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

      expect(returned.map((sku) => sku.getSkuID())).toStrictEqual([
        FIXTURE_SKU_D_ID,
        FIXTURE_SKU_A_ID,
      ]);
      expect(repository.sortedProductSkusIDCalls).toStrictEqual([]);
    });

    it('sorts a well-formed collection into option-group sort order', async () => {
      // The happy path the defect cases sit beside: every member carries options, so every member
      // appears in the sorted-ID result and no index lands on zero.
      //
      // The expected order is B, A, C. `SkuDAO.getSortedProductSkusID`
      // [model/dao/SkuDAO.cfc:L172-L202] orders by a SUM of place values,
      //   `POWER(10, nextOptionGroupSortOrder - SwOptionGroup.sortOrder)`
      // per option, so rank is decided by WHICH option groups a SKU belongs to, not how many. The
      // fixture's group sort orders of 1, 2 and 3 put B (group 1) first, A (groups 1 and 2) second
      // and C (all three) last.
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

      expect(returned).toHaveLength(3);
      expect(new Set(returned.map((sku) => sku.getSkuID())).size).toBe(3);
    });

    it('forwards fetchOptions to the port exactly as given, including when it is omitted', async () => {
      // CFML parity [model/service/SkuService.cfc:L221, L230]: `fetchOptions` defaults to false and
      // passes straight through to the DAO, where it decides whether the HQL carries a `fetch` join
      // [model/dao/SkuDAO.cfc:L150-L170]. Hibernate's lazy collections have no equivalent in a
      // driver-only stack, so in the target this is an EXPLICIT EAGER-LOAD FLAG and forwarding it
      // faithfully is the whole contract.
      const product = canonicalGraphProduct();

      const omittedRepository = new RecordingSkuRepository({ productSkus: optionedGraphSkus() });
      const omittedSubject = new SkuService(
        omittedRepository,
        imageStore,
        subscriptionTermProvider,
      );

      // Omitted, NOT passed as `undefined`. Under `exactOptionalPropertyTypes` those are different
      // states, and only the omission exercises the parameter default.
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

      expect(returned.map((sku) => sku.getSkuID())).toStrictEqual([
        FIXTURE_SKU_A_ID,
        FIXTURE_SKU_B_ID,
        FIXTURE_SKU_C_ID,
      ]);
      expect(repository.sortedProductSkusIDCalls).toStrictEqual([]);
    });

    it('never consults the sort port for a single-SKU collection', async () => {
      // The second clause of the guard, `arrayLen(skus) gt 1` [model/service/SkuService.cfc:L223].
      // One SKU has no order to establish, and skipping the query is the legacy behaviour rather
      // than a shortcut added here.
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

  // --- THE SECOND OF TWO STRUCTURALLY DISTINCT INDEXING DEFECTS -----
  //
  // Read alongside the block above, not instead of it. Same arrayFind-as-index hazard, DIFFERENT
  // guard, and therefore a DIFFERENT INPUT SHAPE is needed to reach it: where `getProductSkus`
  // needs a first-has-options / later-has-none collection, `getSortedProductSkus` needs only a PAIR
  // OF ENTIRELY OPTION-LESS SKUs, because its guard counts and nothing more.

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
      // LEGACY-DEFECT [model/service/SkuService.cfc:L248,L264-L265]: this sibling has no options
      // guard at all - only a count check - so a collection of option-less SKUs enters the sort and
      // hits the same arrayFind-returns-zero index hazard. The guard asymmetry against
      // getProductSkus is deliberate legacy behaviour.
      //
      // Preserved deliberately; do not fix without a product decision.
      //
      // THE INPUT SHAPE IS NOT THE ONE THE SIBLING NEEDED. Here NEITHER member carries an option.
      // Against `getProductSkus` this same pair would be waved through, its third clause finding no
      // options on `skus[1]` and skipping the sort. Here the ONLY test is arrayLen(skus) lt 2 two
      // SKUs clear it, and the sort runs against a sorted-ID result that - built from an
      // option-group join [model/dao/SkuDAO.cfc:L172-L202] - cannot contain either.
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

      // The raise cites L264-L265, NOT L236-L237. Two locators, two defects - if both sites
      // resolved to the same locator the separation would be cosmetic.
      await expect(subject.getSortedProductSkus(product)).rejects.toThrow(/L264-L265/);

      expect(repository.sortedProductSkusIDCalls).toStrictEqual([
        ['sorted-all-optionless'],
        ['sorted-all-optionless'],
      ]);
    });

    it('proves the sibling guards would have diverged on this very input', async () => {
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
      // association DIRECTLY - `arguments.product.getSkus()` - while its sibling goes to the DAO.
      // That is why the case above seeds `sortedProductSkuIDs` but not `productSkus`.
      const soleSku = anOptionlessSku('sku-sole');
      const product = makeProductFixture({ productID: 'sorted-single', skus: [soleSku] });
      const repository = new RecordingSkuRepository({
        productSkus: [soleSku],
        sortedProductSkuIDs: FIXTURE_OPTION_GROUP_SORTED_IDS,
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const returned = await subject.getSortedProductSkus(product);

      // Identity, not equality. `Product.getSkus(false, false)` hands back the LIVE association
      // array and the early return at [L248-L250] passes it straight through without copying, so a
      // mutation through the returned reference would be visible on the entity. That is reproduced
      // rather than defensively copied, because a copy here would change what `getProductSkus`'s
      // unsorted path returns too.
      expect(returned).toBe(product.getSkus());

      expect(repository.productSkusCalls).toStrictEqual([]);
      expect(repository.sortedProductSkusIDCalls).toStrictEqual([]);

      const emptyProduct = makeProductFixture({ productID: 'sorted-empty', skus: [] });
      expect(await subject.getSortedProductSkus(emptyProduct)).toStrictEqual([]);
      expect(repository.sortedProductSkusIDCalls).toStrictEqual([]);
    });

    it('sorts a well-formed collection into option-group sort order', async () => {
      // The happy path: three SKUs, each in a different option group, each present in the sorted-ID
      // result, so nothing indexes at zero. The order returned is the order the DAO supplied,
      // because the service places each SKU at the position its identifier occupies - which is what
      // "sorted by option group sort order" means once the place-value ORDER BY at
      // [model/dao/SkuDAO.cfc:L172-L202] has done its work.
      const groupOneSku = anOptionedSku('sku-group-1', 1);
      const groupTwoSku = anOptionedSku('sku-group-2', 2);
      const groupThreeSku = anOptionedSku('sku-group-3', 3);

      const product = makeProductFixture({
        productID: 'sorted-well-formed',
        // Deliberately handed to the product OUT of sorted order, so a passing assertion cannot be
        // explained by the input already being sorted.
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

      expect(returned).toHaveLength(3);
    });

    it('passes the product identifier to the same port method from both sorted readers', async () => {
      // CFML parity [model/service/SkuService.cfc:L224 versus L252]: the two call sites reach the
      // SAME DAO method with the SAME value in DIFFERENT CALL STYLES - L224 passes it as the named
      // argument `productID=...` while L252 passes it positionally. In CFML those are
      // interchangeable; in TypeScript only the positional form exists, so the distinction
      // disappears at the port and is recorded here as understood-and-collapsed rather than
      // unnoticed.
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
  // ★ THE SORTED MERGE REFUSES A SPARSE PLACEMENT INSTEAD OF ASSERTING ONE
  //
  // NET-NEW COVERAGE, declared as such per AAP 0.6.6. `meta/tests/unit/service/`
  // holds only AccountServiceTest, HibachiServiceTest, PaymentServiceTest and
  // UtilityRBServiceTest - there is no legacy SkuService test of any kind - so no
  // assertion below traces to a legacy antecedent. These cases exist because the
  // target has a boundary the legacy did not: a declared return type.
  //
  // [model/service/SkuService.cfc:L232] and [L260] size the result with
  // `arrayResize(sortedArrayReturn, arrayLen(sortedArray))` - the QUERY row count -
  // and [L234-L238] / [L262-L266] then fill only as many positions as there are SKUs
  // in hand. When the query returns MORE rows than the caller holds SKUs, the surplus
  // positions stay CFML nulls. CFML tolerated that array right up to the first read of
  // a hole; a TypeScript `Sku[]` does not, and the earlier implementation reconciled
  // the two with `as Sku[]`.
  //
  // `noUncheckedIndexedAccess` does not rescue such a cast. It reaches an INDEXED READ
  // and nothing else, so `map`, `filter`, `forEach`, `for...of`, destructuring and
  // spread every one hand a caller a statically guaranteed `Sku` that is `undefined` at
  // run time. The cases here pin the replacement - one named, deterministic refusal at
  // the boundary - and, just as importantly, pin that the set of inputs which SUCCEED
  // is completely unchanged by it.
  // =========================================================================

  describe('the sorted merge refuses a sparse placement rather than asserting one', () => {
    /** A SKU carrying one option, which is what the `getProductSkus` guard demands. */
    function aSortableSku(skuID: string, optionGroupSortOrder: number): Sku {
      const optionGroup = anOptionGroup({
        optionGroupID: `sparse-og-${String(optionGroupSortOrder)}`,
        sortOrder: optionGroupSortOrder,
      });

      return makeSkuFixture({
        idPrefix: skuID,
        skuID,
        options: [
          anOption({
            optionID: `sparse-opt-${String(optionGroupSortOrder)}`,
            sortOrder: optionGroupSortOrder,
            optionGroup,
          }),
        ],
      });
    }

    /**
     * Answers whatever a call raised, and fails loudly when it raised nothing.
     *
     * Deliberately typed `Promise<unknown>`: the refusal is asserted with
     * `toMatchObject` and `String(...)` rather than by casting the caught value to a
     * shape this file has no import for. `SkuSortOrderError` is module-local to
     * `src/services/skuService.ts` and is NOT exported - it is a diagnostic, not part of
     * the published surface - so matching it by `instanceof` is not available here, and
     * matching it by its explicit `name` is exactly what the production code intends.
     */
    async function refusalFrom(work: Promise<readonly Sku[]>): Promise<unknown> {
      try {
        await work;
      } catch (caught: unknown) {
        return caught;
      }

      throw new Error('expected the sorted merge to refuse the placement, but it resolved');
    }

    it('★ refuses when the sorted-ID result outruns the SKUs handed in', async () => {
      // The shortfall is the whole input: three rows come back from the query and two
      // SKUs are available to fill them, so [model/service/SkuService.cfc:L260] sizes to
      // three and [L262-L266] fills two. The trailing position is the hole.
      const first = aSortableSku('sparse-a', 1);
      const second = aSortableSku('sparse-b', 2);

      const product = makeProductFixture({
        productID: 'sparse-tail',
        skus: [first, second],
      });

      const repository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['sparse-a', 'sparse-b', 'sparse-c'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const refusal = await refusalFrom(subject.getSortedProductSkus(product));

      expect(refusal).toBeInstanceOf(Error);
      expect(refusal).toMatchObject({
        name: 'SkuSortOrderError',
        productID: 'sparse-tail',
        sortedIdentifierCount: 3,
        suppliedSkuCount: 2,
        unfilledPositions: [2],
      });
    });

    it('★ names the legacy sizing authority and the call site, not just the shortfall', async () => {
      // A refusal that only said "sparse" would leave a reader guessing whether the
      // target invented a constraint. The message carries the `arrayResize` authority
      // and the site locator of the caller that reached it, so the diagnosis points at
      // the legacy line that produces the holes - here [L264-L265], the
      // `getSortedProductSkus` body, NOT the `getProductSkus` one.
      const product = makeProductFixture({
        productID: 'sparse-message',
        skus: [aSortableSku('msg-a', 1), aSortableSku('msg-b', 2)],
      });

      const repository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['msg-a', 'msg-b', 'msg-c'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const refusal = await refusalFrom(subject.getSortedProductSkus(product));
      const rendered = String(refusal);

      expect(rendered).toContain('SkuSortOrderError');
      expect(rendered).toContain("product 'sparse-message'");
      expect(rendered).toContain('arrayResize');
      expect(rendered).toContain('model/service/SkuService.cfc:L264-L265');
      expect(rendered).toContain('3 row(s)');
      expect(rendered).toContain('2 SKU(s)');
    });

    it('★ names the INTERIOR hole, so the diagnosis is positional and not merely a count', async () => {
      // The two SKUs in hand are the FIRST and the LAST of the query's three rows, so
      // the surplus position is 1 - in the middle. A count-only refusal ("three rows,
      // two SKUs") would be satisfied by a hole anywhere; naming position 1 is what
      // makes the message actionable, and it is why the production code diagnoses during
      // the same pass that builds the result.
      const product = makeProductFixture({
        productID: 'sparse-interior',
        skus: [aSortableSku('interior-a', 1), aSortableSku('interior-c', 3)],
      });

      const repository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['interior-a', 'interior-b', 'interior-c'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const refusal = await refusalFrom(subject.getSortedProductSkus(product));

      expect(refusal).toMatchObject({
        name: 'SkuSortOrderError',
        productID: 'sparse-interior',
        sortedIdentifierCount: 3,
        suppliedSkuCount: 2,
        unfilledPositions: [1],
      });
    });

    it('★ lists EVERY hole, in ascending order, not only the first one found', async () => {
      // Four rows, two SKUs, and the two SKUs occupy the outermost positions, so both 1
      // and 2 are unfilled. The loop continues past the first hole precisely so a caller
      // learns the full extent of the shortfall from one call instead of one hole per
      // round trip.
      const product = makeProductFixture({
        productID: 'sparse-pair',
        skus: [aSortableSku('pair-a', 1), aSortableSku('pair-d', 4)],
      });

      const repository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['pair-a', 'pair-b', 'pair-c', 'pair-d'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const refusal = await refusalFrom(subject.getSortedProductSkus(product));

      expect(refusal).toMatchObject({
        name: 'SkuSortOrderError',
        productID: 'sparse-pair',
        sortedIdentifierCount: 4,
        suppliedSkuCount: 2,
        unfilledPositions: [1, 2],
      });
      expect(String(refusal)).toContain('position(s) 1, 2 unfilled');
    });

    it('★ refuses through the OTHER call site too, and names that site instead', async () => {
      // `getProductSkus` reaches the same merge from a different data source - the
      // repository rather than the entity - through a guard that additionally requires
      // the first SKU to carry options [model/service/SkuService.cfc:L223]. Both call
      // sites now pass a real product identifier, and this case is what proves the
      // second one does: the refusal names `sparse-other-site`, and it cites
      // [L236-L237] rather than [L264-L265].
      const first = aSortableSku('other-a', 1);
      const second = aSortableSku('other-b', 2);

      const product = makeProductFixture({
        productID: 'sparse-other-site',
        skus: [first, second],
      });

      const repository = new RecordingSkuRepository({
        productSkus: [first, second],
        sortedProductSkuIDs: ['other-a', 'other-b', 'other-c'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const refusal = await refusalFrom(subject.getProductSkus(product, true));

      expect(refusal).toMatchObject({
        name: 'SkuSortOrderError',
        productID: 'sparse-other-site',
        sortedIdentifierCount: 3,
        suppliedSkuCount: 2,
        unfilledPositions: [2],
      });
      expect(String(refusal)).toContain('model/service/SkuService.cfc:L236-L237');
    });

    it('★ leaves the arrayFind-answers-zero raise in front, where the legacy put it', async () => {
      // TWO failure modes live in this body and their ORDER is behaviour. A SKU absent
      // from the sorted-ID result makes `arrayFind` answer 0, and
      // [model/service/SkuService.cfc:L264-L265] then assigns to index 0 of a 1-based
      // array, which raises DURING the fill - before any hole could be counted. The
      // target keeps that raise first, so an absent SKU is still diagnosed as an absent
      // SKU and not re-labelled as a sparse placement.
      //
      // The input is equal-length on purpose: two rows, two SKUs. Only membership is
      // wrong, so nothing here is a shortfall.
      const product = makeProductFixture({
        productID: 'sparse-precedence',
        skus: [aSortableSku('precedence-a', 1), aSortableSku('precedence-absent', 2)],
      });

      const repository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['precedence-a', 'precedence-b'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const refusal = await refusalFrom(subject.getSortedProductSkus(product));
      const rendered = String(refusal);

      expect(rendered).toContain('arrayFind answered 0');
      expect(rendered).toContain('model/service/SkuService.cfc:L264-L265');
      expect(rendered).not.toContain('SkuSortOrderError');
      expect(rendered).not.toContain('arrayResize');
    });

    it('★ still answers a dense placement, by identity of members and with no holes', async () => {
      // The success set must be provably UNCHANGED by the refusal, otherwise the fix
      // would have traded an unsafe cast for a narrower method. Three rows, three SKUs
      // handed in fully reversed: every position fills, the result is a reordering of
      // the very same objects, and the array has no holes.
      //
      // `Object.keys(result).length` is the hole test that `toHaveLength` cannot make -
      // a sparse array reports its resized `length` while owning fewer index keys, so
      // the two counts agreeing is what says every slot is genuinely present.
      const first = aSortableSku('dense-a', 1);
      const second = aSortableSku('dense-b', 2);
      const third = aSortableSku('dense-c', 3);

      const product = makeProductFixture({
        productID: 'dense-placement',
        skus: [third, second, first],
      });

      const repository = new RecordingSkuRepository({
        sortedProductSkuIDs: ['dense-a', 'dense-b', 'dense-c'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const result = await subject.getSortedProductSkus(product);

      expect(result).toStrictEqual([first, second, third]);
      expect(result).toHaveLength(3);
      expect(Object.keys(result)).toHaveLength(3);
      expect(result.every((sku) => sku !== undefined)).toBe(true);
      expect(result.map((sku) => sku.getSkuID())).toStrictEqual(['dense-a', 'dense-b', 'dense-c']);
    });

    it('★ answers a dense placement through the other call site as well', async () => {
      // The same equal-length input through `getProductSkus`, so neither call site pays
      // for the refusal with a false negative. Nothing about passing a product
      // identifier into the merge changes what a well-formed call returns.
      const first = aSortableSku('dense-other-a', 1);
      const second = aSortableSku('dense-other-b', 2);

      const product = makeProductFixture({
        productID: 'dense-other-site',
        skus: [first, second],
      });

      const repository = new RecordingSkuRepository({
        productSkus: [second, first],
        sortedProductSkuIDs: ['dense-other-a', 'dense-other-b'],
      });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const result = await subject.getProductSkus(product, true);

      expect(result).toStrictEqual([first, second]);
      expect(Object.keys(result)).toHaveLength(2);
    });
  });

  // --- DEFECT 28 - getSkuStocksDeletableFlag THROWS UNCONDITIONALLY -----
  //
  // [model/service/SkuService.cfc:L281-L283] delegates to
  // `getSkuDAO().getSkuStocksDeletableFlag(...)`. That method DOES NOT EXIST: it is absent from
  // `model/dao/SkuDAO.cfc`, absent from every file under `org/Hibachi/`, and cannot be dynamically
  // dispatched because `HibachiDAO` declares no `onMissingMethod`. The only caller,
  // [model/entity/Sku.cfc:L569], reaches the entity-level missing-method raise at
  // [org/Hibachi/HibachiEntity.cfc:L565] and dies there for every input. The target reproduces the
  // raise rather than inventing the query the method would have needed.

  describe('getSkuStocksDeletableFlag - defect 28', () => {
    it('rejects for every input, including a well-formed identifier', async () => {
      // LEGACY-DEFECT [model/service/SkuService.cfc:L281-L283]: getSkuStocksDeletableFlag calls a
      // method that exists nowhere in the codebase, so it throws unconditionally through
      // org/Hibachi/HibachiEntity.cfc:L565. Reproduced as a throwing stub rather than invented.
      // Preserved deliberately; do not fix without a product decision.
      //
      // "Every input" is meant literally: a well-formed fixture identifier fails exactly as an
      // empty string does. No shape of argument reaches a working code path, and no engine-specific
      // message is asserted - only that the call cannot succeed.
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

      await expect(service.getSkuStocksDeletableFlag(FIXTURE_SKU_A_ID)).rejects.toThrow(
        /is unreachable/,
      );

      // NOT a resolved `false`, and NOT a resolved `undefined`. Answering `false` would be the
      // tempting "safe" reading, making deletion appear forbidden, but it would be a fabricated
      // answer to a question the legacy cannot answer, and a caller would have no way to tell a
      // real refusal from a broken one.
      await expect(service.getSkuStocksDeletableFlag(FIXTURE_SKU_A_ID)).rejects.toBeInstanceOf(
        Error,
      );

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
      // rather than lazy: the port set was NOT widened to give THIS method something to
      // call. `SkuRepository` publishes the six DAO read capabilities that actually
      // exist plus one write, and `getSkuStocksDeletableFlag` is not among them.
      //
      // ★ THE COUNT WAS CORRECTED ONCE AND THE DISTINCTION IS THE WHOLE ARGUMENT. This
      // read "publishes exactly the SEVEN DAO capabilities that actually exist", which
      // was wrong in a way the current wording fixes: only SIX of the members are DAO
      // capabilities, because `saveSku` has no antecedent on `SkuDAO.cfc` at all. The
      // count then briefly read EIGHT, while the port carried a `saveSkus` collection
      // form; that member has been removed and the arithmetic is back to seven. What has
      // never changed is that a member is added only when a legacy behaviour demands it.
      // `getSkuStocksDeletableFlag` names a legacy call that RAISES, so there is no
      // behaviour to reproduce, and the port stays silent about it.
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
      // so if the port grows a member that the tuple below does not name, the
      // `Exclude` no longer collapses and the alias fails its own constraint. That is
      // precisely how the addition of `saveSkus` announced itself here, and it is what
      // would announce any attempt to reinstate it.
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

      // The SERVICE still publishes the method, because interface parity is the acceptance contract
      // and a reviewer diffing the two surfaces must find it. Parity of NAME with no working call
      // target underneath is precisely the legacy situation.
      expect(Object.getOwnPropertyNames(SkuService.prototype)).toContain(
        'getSkuStocksDeletableFlag',
      );
    });
  });

  // --- REQUEST-SCOPED REPLACEMENT FOR THE COMPONENT-LEVEL SORT-ORDER CACHE -----
  //
  // [model/dao/SkuDAO.cfc:L204-L220] memoises `variables.nextOptionGroupSortOrder` at COMPONENT
  // level - one value for the whole application lifetime - and it feeds the
  //   `POWER(10, nextOptionGroupSortOrder - SwOptionGroup.sortOrder)`
  // place-value ORDER BY that decides sorted-SKU order [model/dao/SkuDAO.cfc:L172-L202].
  //
  // Two legacy behaviours make that memo actively dangerous rather than merely stale: the aggregate
  // always returns a row, so the `recordCount` guard is always true and an EMPTY option-group table
  // memoises `'' + 1`, i.e. 1; and the clear method's guard is INVERTED, so the memo can never be
  // cleared.
  //
  // On a warm Lambda container a module-level cache is shared across UNRELATED invocations, so
  // reproducing the memo faithfully would let one request's ordering decide another's. The target
  // request-scopes the value behind the repository port, re-consulted on every call. These cases
  // prove that by COMPARING RESULTS AND RECORDED CALLS.

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
      // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L213-L214]: the max() aggregate always returns one row,
      // so the recordCount guard is always true and an empty table yields '' + 1 = 1.
      //
      // Preserved deliberately; do not fix without a product decision.
      //
      // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L222-L226]: the cache-clear guard is inverted, so the
      // clear can never fire. The target neutralises the hazard by request-scoping the value; this
      // test proves two independent service instances do not share it.
      //
      // Preserved deliberately; do not fix without a product decision.
      //
      // The first instance is driven to completion so any shared memo would be populated by the
      // time the second runs. The second returns ITS OWN order - the reverse - which is only
      // possible if nothing was carried across.
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

      // Each instance asked its OWN repository, exactly once. A shared memo would have let the
      // second instance skip its query and inherit the first order.
      expect(firstRepository.sortedProductSkusIDCalls).toStrictEqual([['scope-product']]);
      expect(secondRepository.sortedProductSkusIDCalls).toStrictEqual([['scope-product']]);

      const firstOrderAgain = await firstService.getSortedProductSkus(product);
      expect(firstOrderAgain.map((sku) => sku.getSkuID())).toStrictEqual([
        'scope-sku-1',
        'scope-sku-2',
      ]);
    });

    it('★ does not let a populated instance rescue an instance whose order is empty', async () => {
      // The sharpest form of the isolation proof, and the one that directly exercises the
      // empty-aggregate defect. Instance one runs against a POPULATED order and succeeds. Instance
      // two runs against an EMPTY one - where [model/dao/SkuDAO.cfc:L213-L214] silently turns the
      // state into a seeded 1 - and must RAISE through the arrayFind-zero path. Were the state
      // shared, instance two would inherit instance one's populated order and quietly succeed, so
      // the raise is the evidence of isolation.
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
      expect(Object.getOwnPropertyNames(SkuService)).toStrictEqual(['length', 'name', 'prototype']);

      // LEGACY-NOTE [model/dao/SkuDAO.cfc:L163]: the legacy DAO carries an INVALID DUPLICATE
      //   `var hql &= ...`
      // declaration, re-declaring a name already declared in the same function. TypeScript makes
      // the construct unrepresentable, so there is nothing to reproduce; recorded so the omission
      // is a documented decision, not an oversight.
      //
      // LEGACY-NOTE [model/dao/SkuDAO.cfc:L107-L128]: the AND-of-EXISTS option-matching SQL behind
      // `getSkusBySelectedOptions` is likewise NOT asserted here. SQL text and parameter binding
      // belong to the integration tier.
      expect(skuRepository.skusBySelectedOptionsCalls).toStrictEqual([]);
    });
  });

  describe('processImageUpload - delegation to the image stub port and nothing more', () => {
    /**
     * A projection of the legacy `cffile` upload result struct.
     *
     * The values are deliberately NOT path-shaped and are never opened, resolved, stat-ed or
     * written. This suite performs no filesystem access of any kind; the struct exists only so the
     * delegation can be observed carrying it.
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
      // `allowedExtensions="jpg,jpeg,png,gif"` as a literal comma list, carried character for
      // character - same four extensions, same order, same lowercase, no spaces, no leading dots
      // and no `webp`, `avif` or `svg` added. Widening it would be a product decision about what a
      // merchant may upload, not a port detail.
      expect(ALLOWED_IMAGE_EXTENSIONS).toBe('jpg,jpeg,png,gif');
    });

    it('composes the image path and delegates it to the store', async () => {
      // ★★ `processImageUpload` IS A PURE DELEGATION, AND IT NOW REACHES THE PORT.
      // The legacy body is one statement,
      // `getService("imageService").saveImageFile(...)`
      // [model/service/SkuService.cfc:L212], which is the ONLY `getService()` locator call
      // in the whole in-scope service layer. Transformation rule T2 replaces the locator
      // with the constructor-injected `imageStore` port, and that substitution is all this
      // suite asserts: no image is decoded, no extension policy is re-implemented, no
      // directory is touched, and no image feature behaviour is claimed.
      //
      // AN EARLIER REVISION ASSERTED A REJECTION HERE and defended it on one ground: that
      // `Sku.getImagePath()` [model/entity/Sku.cfc:L145-L147] reads an asset root that is not
      // among the seven keys `src/domain/ports/settingsProvider.ts` publishes -
      // `globalAssetsImageFolderPath` [model/service/SettingService.cfc:L164], which that union
      // excludes by name. THE PREMISE IS TRUE AND THE CONCLUSION DOES NOT FOLLOW. It
      // establishes that the ENTITY may not
      // RESOLVE those settings; it says nothing about whether the entity may COMPOSE a
      // string out of values resolved by whoever legitimately can. `Option.getImageDirectory()`
      // had already settled the same question inside the same folder, and the resolved-value
      // injection pattern is the established answer - `googleFeedRepository` uses it for its
      // feed settings. Deleting the composing method instead INVERTED the anti-corruption
      // boundary rather than honouring it, and it left `processProduct_uploadDefaultImage`
      // and `processProduct_updateDefaultImageFileNames` with nothing to call.
      const sku = makeSkuFixture({
        andOfExistsMember: 'A',
        imageFile: 'nikeairjorden-sizeten.jpg',
        imageSettingValues: {
          baseImageURL: '/custom/assets/images',
          productImageOptionCodeDelimiter: '-',
          productImageDefaultExtension: 'jpg',
        },
      });

      await expect(service.processImageUpload(sku, anUploadResult())).resolves.toBe(true);

      // [L146] verbatim: `"#getHibachiScope().getBaseImageURL()#/product/default/#getImageFile()#"`.
      expect(imageStore.saveImageFileCalls).toStrictEqual([
        [
          anUploadResult(),
          '/custom/assets/images/product/default/nikeairjorden-sizeten.jpg',
          ALLOWED_IMAGE_EXTENSIONS,
        ],
      ]);

      // The legacy did not delete anything on this path and neither does the port.
      expect(imageStore.deleteImageFileCalls).toStrictEqual([]);
    });

    it('refuses and stores nothing when the sku was hydrated without image settings', async () => {
      // ⚠ THE REFUSAL DID NOT GO AWAY - IT MOVED TO THE CASE THAT ACTUALLY WARRANTS IT.
      // A sku whose adapter never supplied the resolved image settings cannot compose a
      // path, and `src/domain/entities/sku.ts` RAISES rather than substituting a default,
      // because every candidate default would be a WELL-FORMED WRONG PATH rather than a
      // marker a caller could detect. Better a loud refusal than a file written to a
      // fabricated location.
      const sku = makeSkuFixture({ andOfExistsMember: 'A' });

      await expect(service.processImageUpload(sku, anUploadResult())).rejects.toThrow(
        /hydrated without image setting values/,
      );

      expect(imageStore.saveImageFileCalls).toStrictEqual([]);
      expect(imageStore.deleteImageFileCalls).toStrictEqual([]);
    });

    it('never reaches the SKU repository while processing an upload', async () => {
      // The upload path touches neither persistence nor query. [L212] saves the file and returns;
      // the legacy did not re-save the SKU, and neither does the port.
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
      // CFML parity [model/service/SkuService.cfc:L271-L279]: both parameters are OPTIONAL with no
      // default, and the legacy forwards `argumentCollection=arguments` so an omitted parameter
      // arrives omitted. The DAO's own defaults then apply [model/dao/SkuDAO.cfc:L130-L133], and
      // substituting `''` would send a value the legacy never sent and change which rows come back.
      // The arguments are therefore OMITTED at the call site, not passed as `undefined`.
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      expect(await subject.searchSkusByProductType()).toStrictEqual([]);
      expect(await subject.searchSkusByProductType('jordan')).toStrictEqual([]);

      expect(repository.searchSkusByProductTypeCalls).toStrictEqual([
        [undefined, undefined],
        ['jordan', undefined],
      ]);
    });

    it('LEGACY-NOTE: the SKU-side parameter is singular where the product-side one is plural', async () => {
      // LEGACY-NOTE [model/dao/SkuDAO.cfc:L130-L136 versus model/dao/ProductDAO.cfc:L419]:
      // `SkuDAO.searchSkusByProductType` takes a SINGULAR `productTypeID` while
      // `ProductDAO.searchProductsByProductType` takes a PLURAL `productTypeIDs`. The SKU side then
      // binds its singular argument to a LIST parameter anyway, so a comma list travels through the
      // singular name untouched.
      //
      // Both names are preserved: harmonising them would change two public signatures for cosmetic
      // reasons, and interface parity is the acceptance contract.
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
      //   `return getSkuDAO().getTransactionExistsFlag()`
      // and applies no interpretation. Both answers are asserted because a one-sided test cannot
      // tell a faithful pass-through from a hardcoded constant.
      const trueRepository = new RecordingSkuRepository({ transactionExistsFlag: true });
      const trueSubject = new SkuService(trueRepository, imageStore, subscriptionTermProvider);

      expect(await trueSubject.getTransactionExistsFlag()).toBe(true);
      expect(trueRepository.transactionExistsFlagCalls).toStrictEqual([[]]);

      const falseRepository = new RecordingSkuRepository({ transactionExistsFlag: false });
      const falseSubject = new SkuService(falseRepository, imageStore, subscriptionTermProvider);

      expect(await falseSubject.getTransactionExistsFlag()).toBe(false);
      expect(falseRepository.transactionExistsFlagCalls).toStrictEqual([[]]);

      // A strict boolean, not a truthy value. The legacy declares `returntype="boolean"` and CFML
      // would happily have returned the string "YES"; the port does not.
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
      // THE HIGHEST-CONSEQUENCE ABSENCE CHECK ON THIS SURFACE. [model/dao/SkuDAO.cfc:L102-L105]
      // runs `ORMExecuteQuery(..., true)` and returns whatever it got, which is NULL when nothing
      // matched - no `else`, no fallback, no empty entity. A `0` or `{}` would satisfy a naive
      // truthiness test and let a caller carry on with a SKU that does not exist, while `null`
      // would break every `=== undefined` test written against the port.
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
      // CFML parity [model/service/SkuService.cfc:L289-L291 into model/dao/SkuDAO.cfc:L102]: the
      // SERVICE declares `string skuCode` - optional, no default - but forwards
      // `argumentCollection=arguments` into a DAO declaring `required string skuCode`. An omitted
      // code therefore raises at the DAO boundary rather than returning null, a DIFFERENT outcome
      // from the miss above. The argument is OMITTED, not `undefined`.
      await expect(service.getSkuBySkuCode()).rejects.toThrow(/skuCode is absent/);

      expect(skuRepository.skuBySkuCodeCalls).toStrictEqual([]);
    });

    it('forwards an empty string as an empty string, because the legacy did', async () => {
      // An empty string SATISFIES `required` in CFML, so the legacy reached the query with it and
      // matched nothing. Treating `''` as absent would raise where the legacy returned null - a
      // different observable outcome for the same input.
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      expect(await subject.getSkuBySkuCode('')).toBeUndefined();
      expect(repository.skuBySkuCodeCalls).toStrictEqual([['']]);
    });
  });

  describe('findSkus - signature reshaping #2, with only the concrete legacy filters', () => {
    it('takes a typed criteria object and answers a typed page', async () => {
      // JUDGMENT CALL: legacy getSkuSmartList [model/service/SkuService.cfc:L309-L325] built a
      // HibachiSmartList, a generic string-keyed dynamic query builder supplied by the framework.
      // Porting it faithfully would reimplement a small ORM query language, reintroduce the
      // framework coupling this refactor removes, and be untypeable under the strict profile. This
      // is signature reshaping #2 of the project's three, shared with productService.findProducts.
      // Only the concrete legacy filters are preserved; the open-ended dynamic filtering surface is
      // deliberately not reproduced.
      const firstHit = makeSkuFixture({ andOfExistsMember: 'A' });
      const repository = new RecordingSkuRepository({ searchResults: [firstHit] });
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const criteria: SkuQueryCriteria = { keyword: 'jordan', productTypeID: 'product-type-1' };
      const page: SkuPage = await subject.findSkus(criteria);

      expect(page.skus.map((sku) => sku.getSkuID())).toStrictEqual([FIXTURE_SKU_A_ID]);
      expect(page.keyword).toBe('jordan');

      expect(Object.keys(criteria).sort()).toStrictEqual(['keyword', 'productTypeID']);
    });

    it('★★ reports the ONE keyword property the executed statement matches, at weight 1', async () => {
      // THIS CASE IS AN INVERSION AND WAS NAMED "preserves the five keyword properties, all at
      // weight 1". It asserted all five `addKeywordProperty` identifiers from
      // [model/service/SkuService.cfc:L318-L322], and it passed - against a page whose statement
      // compares one column. The five belong to `getSkuSmartList`'s `HibachiSmartList`, which AAP
      // 0.6.2 rules out of this port; `findSkus` executes `SkuDAO.searchSkusByProductType`, whose
      // whole predicate is `skuCode like :code` [model/dao/SkuDAO.cfc:L132].
      //
      // Reporting five was not a documented gap, it was a false statement of what was matched: a
      // caller reading the page would expect a product-name search to find its SKUs, and it
      // silently would not. The four unmatched identifiers survive as an inert record on
      // `SKU_KEYWORD_PROPERTIES`, so their spellings and weights are not lost.
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const page = await subject.findSkus({ keyword: 'jordan' });

      expect(page.keywordProperties).toStrictEqual([{ propertyIdentifier: 'skuCode', weight: 1 }]);
      expect(page.keywordProperties).toHaveLength(1);

      // Weight 1 still holds and is still worth pinning: the legacy ranked nothing, and no
      // relevance scoring, boosting or ordering has been invented in the narrowing.
      expect(page.keywordProperties.every((property) => property.weight === 1)).toBe(true);

      // ★ NONE of the four the smart list additionally configured is reported.
      const reported = page.keywordProperties.map((property) => property.propertyIdentifier);

      for (const unmatched of [
        'skuID',
        'product.productName',
        'product.productType.productTypeName',
        'alternateSkuCodes.alternateSkuCode',
      ]) {
        expect(reported).not.toContain(unmatched);
      }
    });

    it('★★ reports NO joins, because the executed statement performs none', async () => {
      // THE OTHER HALF OF THE INVERSION. This case was named "preserves the three joins, including
      // the LEFT join on alternateSkuCodes" and asserted all three `addJoin` calls from
      // [model/service/SkuService.cfc:L314-L316], including the finding that the first two carry
      // the EMPTY STRING rather than `'inner'` [org/Hibachi/HibachiSmartList.cfc:L212].
      //
      // Every one of those observations is true OF THE SMART LIST and none is true of the statement
      // that runs. [model/dao/SkuDAO.cfc:L132] selects from `SlatwallSku` alone; the optional
      // product-type restriction at [L135] is an `IN` SUBQUERY through `SlatwallProduct`, not a
      // join - the same distinction `buildSearchSkusByProductTypeSql` is annotated to preserve
      // against its product sibling, which filters `productTypeID` directly on its own row. So the
      // join list is empty even though the statement can name two tables.
      //
      // The three configured joins, their join types and the entity-lock reasoning about
      // `alternateSkuCodes` all survive as an inert record on `SKU_SMART_LIST_JOINS`.
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      const page = await subject.findSkus({ keyword: 'jordan' });

      expect(page.joins).toStrictEqual([]);
      expect(page.joins).toHaveLength(0);

      // ★ THE MEMBER STILL EXISTS, and that is deliberate rather than incidental: "this query
      // joins nothing" is the fact that tells a caller a SKU with no alternate codes, and one whose
      // product has no product type, are both still returned. Deleting the member would leave that
      // unsaid.
      expect(Object.keys(page)).toContain('joins');
      expect(Array.isArray(page.joins)).toBe(true);
    });

    it('routes the keyword and product type through the same port the legacy DAO served', async () => {
      const repository = new RecordingSkuRepository();
      const subject = new SkuService(repository, imageStore, subscriptionTermProvider);

      await subject.findSkus({ keyword: 'jordan', productTypeID: 'product-type-1' });

      await subject.findSkus({ keyword: 'air' });

      expect(repository.searchSkusByProductTypeCalls).toStrictEqual([
        ['jordan', 'product-type-1'],
        ['air', undefined],
      ]);
    });

    it('publishes no dynamic-filter surface for a caller to reach through', async () => {
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

  // -------------------------------------------------------------------------
  // THE DEFAULT-SKU DESIGNATION - FIVE SITES, FIVE DISTINCT STRATEGIES
  // [model/service/SkuService.cfc:L102, L134, L167, L189, L198]
  //
  // ★★ WHY THIS BLOCK EXISTS. Every one of the five sites calls
  // `arguments.product.setDefaultSku(...)`, and an earlier revision of the shipped
  // service diverted all five into an invocation-local ledger that never escaped -
  // so `SwProduct.defaultSkuID` was never written and a newly configured product
  // came out of `createSkus` with NO DEFAULT SKU. The designation now lands on the
  // product, where `mysqlProductRepository` already binds the column from
  // `getDefaultSku()`, and each of the five strategies is pinned INDIVIDUALLY here.
  //
  // The five are deliberately NOT unified in the source and are therefore not
  // unified in the port: a null test, two unconditional writes and two loop-index
  // tests. A single "the first SKU wins" assertion would pass against a port that
  // had collapsed them and would hide the difference.
  // -------------------------------------------------------------------------
  describe('createSkus - the default-SKU designation reaches the product', () => {
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

    it('STRATEGY 1 OF 5 - merchandise multi: FIRST-WINS, via a one-clause null test', async () => {
      const sizeGroup = anOptionGroup({ optionGroupID: 'og-default-size', sortOrder: 1 });
      const large = anOption({
        optionID: 'opt-default-large',
        sortOrder: 1,
        optionGroup: sizeGroup,
      });
      const small = anOption({
        optionID: 'opt-default-small',
        sortOrder: 2,
        optionGroup: sizeGroup,
      });

      const product = makeProductFixture({ productID: 'default-sku-first-wins' });

      expect(product.getDefaultSku()).toBeUndefined();

      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          options: 'opt-default-large,opt-default-small',
          resolvedOptions: [large, small],
        }),
      ).toBe(true);

      const created = product.getSkus();
      expect(created).toHaveLength(2);

      // ★ CFML parity [model/service/SkuService.cfc:L101-L103]: the guard is
      // `if(isNull(arguments.product.getDefaultSku()))` - ONE clause - and the write at
      // [L102] is what makes the SECOND iteration's test fail. The first SKU therefore
      // wins and the second does NOT overwrite it. Asserting both halves is the point:
      // a port that wrote unconditionally would pass an "is set" assertion and fail
      // this one.
      expect(product.getDefaultSku()).toBe(created[0]);
      expect(product.getDefaultSku()).not.toBe(created[1]);
      expect(product.getDefaultSku()?.getSkuCode()).toBe('TESTPRODUCTXXX-1');
    });

    it('STRATEGY 1 OF 5 - merchandise multi: DEFERS to a default the product already carried', async () => {
      // The other half of the null test, and the reason it is a null test rather than an
      // unconditional write: a product that already has a default keeps it, and NONE of
      // the newly created SKUs displaces it.
      //
      // ★ THE `options` KEY IS WHAT SELECTS THIS BRANCH. Without it the payload routes to
      // the merchandise-SINGLE sub-branch, whose [L134] write is unconditional and would
      // displace the incumbent - which is the very asymmetry the next case pins. The two
      // sub-branches must be reached deliberately, never by omission.
      const incumbent = makeSkuFixture({ skuID: 'incumbent-default-sku' });
      const shadeGroup = anOptionGroup({ optionGroupID: 'og-incumbent-shade', sortOrder: 1 });
      const shade = anOption({
        optionID: 'opt-incumbent-shade',
        sortOrder: 1,
        optionGroup: shadeGroup,
      });

      const product = makeProductFixture({
        productID: 'default-sku-incumbent',
        defaultSku: incumbent,
      });

      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          options: 'opt-incumbent-shade',
          resolvedOptions: [shade],
        }),
      ).toBe(true);

      expect(product.getSkus()).toHaveLength(1);
      expect(product.getDefaultSku()).toBe(incumbent);
      expect(product.getDefaultSku()).not.toBe(product.getSkus()[0]);
    });

    it('STRATEGY 2 OF 5 - merchandise single: UNCONDITIONAL, overwriting an incumbent', async () => {
      // CFML parity [model/service/SkuService.cfc:L134]: no `isNull` test and no
      // loop-index test. This branch overwrites whatever default the product carried,
      // which is exactly the asymmetry with [L101] that must survive the port.
      const incumbent = makeSkuFixture({ skuID: 'single-branch-incumbent' });
      const product = makeProductFixture({
        productID: 'default-sku-single-unconditional',
        defaultSku: incumbent,
      });

      // No `options` key at all, which is what routes to the single-SKU sub-branch.
      expect(await service.createSkus(product, { price: PRICE_DECIMAL })).toBe(true);

      const created = product.getSkus();
      expect(created).toHaveLength(1);
      expect(product.getDefaultSku()).toBe(created[0]);
      expect(product.getDefaultSku()).not.toBe(incumbent);
    });

    it('STRATEGY 3 OF 5 - subscription: a LOOP-INDEX test on the first term only', async () => {
      const product = makeProductFixture({
        productID: 'default-sku-subscription',
        productType: aProductType({ productTypeID: 'pt-subscription', systemCode: 'subscription' }),
      });

      // All three list keys are supplied, and each for its own reason: [L143] and [L148]
      // gate the branch on a non-empty list and record a failure otherwise, while
      // [L163] iterates `renewalSubscriptionBenefits` with NO `structKeyExists` guard and
      // no validation at all - a preserved legacy raise. Reaching the designation
      // therefore requires passing two gates and satisfying one unguarded read.
      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          subscriptionTerms: 'term-1,term-2,term-3',
          subscriptionBenefits: 'benefit-1',
          renewalSubscriptionBenefits: 'renewal-1',
        }),
      ).toBe(true);

      const created = product.getSkus();
      expect(created).toHaveLength(3);

      // CFML parity [model/service/SkuService.cfc:L166-L168]: `if(i == 1)`, not a null
      // test. The first iteration's SKU wins, and - unlike [L101] - it would overwrite
      // an incumbent, because nothing is tested but the counter.
      expect(product.getDefaultSku()).toBe(created[0]);

      // ★ And the code it carries ends `-2`, NOT `-1`: [L155] links before [L159]
      // stamps, so the live array already counts this SKU. That off-by-one is verified
      // elsewhere; it is asserted here too because it proves the designation is the
      // FIRST-CREATED sku of this branch rather than a sku numbered 1.
      expect(product.getDefaultSku()?.getSkuCode()).toBe('TESTPRODUCTXXX-2');
    });

    it('STRATEGY 4 OF 5 - content-access bundle: UNCONDITIONAL, like [L134]', async () => {
      const incumbent = makeSkuFixture({ skuID: 'bundle-branch-incumbent' });
      const product = aContentAccessProduct('default-sku-content-bundled');
      product.setDefaultSku(incumbent);

      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          accessContents: 'access-1,access-2',
          bundleContentAccess: true,
        }),
      ).toBe(true);

      const created = product.getSkus();
      expect(created).toHaveLength(1);

      // CFML parity [model/service/SkuService.cfc:L189]: unconditional, so the incumbent
      // is displaced - and note this branch's SIBLING at [L197] is guarded. Two
      // strategies inside one branch, preserved as two.
      expect(product.getDefaultSku()).toBe(created[0]);
      expect(product.getDefaultSku()).not.toBe(incumbent);
    });

    it('STRATEGY 5 OF 5 - content-access per-content: a LOOP-INDEX test on `c`', async () => {
      const product = aContentAccessProduct('default-sku-content-unbundled');

      expect(
        await service.createSkus(product, {
          price: PRICE_DECIMAL,
          accessContents: 'access-1,access-2,access-3',
        }),
      ).toBe(true);

      const created = product.getSkus();
      expect(created).toHaveLength(3);

      // CFML parity [model/service/SkuService.cfc:L197-L199]: `if(c == 1)`, mirroring
      // [L166]'s test on `i` but in a branch whose sibling is unconditional.
      expect(product.getDefaultSku()).toBe(created[0]);
      expect(product.getDefaultSku()?.getSkuCode()).toBe('TESTPRODUCTXXX-1');
    });

    it('designates NOTHING when the chosen branch refused to create', async () => {
      // The negative case, and it matters: the content-access branch with no
      // `accessContents` records a validation failure and returns before any SKU exists
      // [model/service/SkuService.cfc:L176-L177]. No designation can be made from
      // nothing, and none is invented.
      const product = aContentAccessProduct('default-sku-refused');

      expect(await service.createSkus(product, { price: PRICE_DECIMAL })).toBe(true);

      expect(product.getSkus()).toStrictEqual([]);
      expect(product.getDefaultSku()).toBeUndefined();
    });

    it('carries the resolved image-setting values onto every draft it mints', async () => {
      // ★★ WHY THIS IS PINNED HERE. `processProduct_updateDefaultImageFileNames`
      // [model/service/ProductService.cfc:L208-L213] runs
      // `sku.setImageFile( sku.generateImageFileName() )` over exactly the drafts this
      // service minted, and `saveProduct` dispatches it at
      // [model/service/ProductService.cfc:L282] for every new product. In CFML each
      // draft reads `getProduct().setting(...)` and receives the CONFIGURED value; a
      // draft constructed without the resolved values would silently fall back to the
      // metadata defaults [model/service/SettingService.cfc:L191-L192] and mint a file
      // name the CFML application never produces for the same rows.
      const configuredService = new SkuService(
        skuRepository,
        imageStore,
        subscriptionTermProvider,
        undefined,
        undefined,
        {
          baseImageURL: 'https://synthetic.example/assets/images',
          productImageOptionCodeDelimiter: '_',
          productImageDefaultExtension: 'webp',
        },
      );

      const product = makeProductFixture({ productID: 'draft-image-settings' });

      expect(await configuredService.createSkus(product, { price: PRICE_DECIMAL })).toBe(true);

      const created = product.getSkus()[0];

      if (created === undefined) {
        throw new Error('the merchandise branch attached no SKU to assert against.');
      }

      // The CONFIGURED extension, not the mirrored default `jpg`. The product code is
      // sanitised by the entity and this SKU carries no image-bearing options, so the
      // delimiter contributes nothing to the name - which is why the extension is the
      // discriminating half.
      expect(created.generateImageFileName()).toBe('TESTPRODUCTXXX.webp');

      // And the base URL arrived too, so the path member can answer at all.
      created.setImageFile(created.generateImageFileName());
      expect(created.getImagePath()).toBe(
        'https://synthetic.example/assets/images/product/default/TESTPRODUCTXXX.webp',
      );

      // ★ The DEFAULT-constructed service in `beforeEach` supplies none, and that is a
      // real hydration state rather than an error: the file-name member mirrors the
      // source's own metadata defaults, so it still answers.
      const defaultProduct = makeProductFixture({ productID: 'draft-no-image-settings' });

      expect(await service.createSkus(defaultProduct, { price: PRICE_DECIMAL })).toBe(true);

      const defaultDraft = defaultProduct.getSkus()[0];

      if (defaultDraft === undefined) {
        throw new Error('the merchandise branch attached no SKU to assert against.');
      }

      expect(defaultDraft.generateImageFileName()).toBe('TESTPRODUCTXXX.jpg');
    });
  });
});
