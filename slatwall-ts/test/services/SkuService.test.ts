/**
 * `SkuService` — the ported public surface, member by member.
 *
 * ---------------------------------------------------------------------------------------------------
 * WHAT KIND OF TESTS THESE ARE, AND WHY THAT DIFFERS FROM THE LEGACY SUITE
 * ---------------------------------------------------------------------------------------------------
 * These are UNIT tests. Every case imports the class under test by relative path, constructs it
 * through its real explicit constructor, and hands it typed doubles for its collaborators.
 *
 * The legacy suite could not work that way. `meta/tests/unit/SlatwallUnitTestBase.cfc:L49-L79` boots
 * the whole FW/1 application in `setUp()` and then reaches collaborators back out of the DI/1 bean
 * factory by string name, and `meta/tests/unit/service/HibachiServiceTest.cfc:L49-L55` follows that
 * base and resolves its subject the same way. A legacy "unit" test of a service was therefore an
 * INTEGRATION test: application bootstrap, ORM session, real datasource, real settings engine.
 *
 * That is the single largest structural difference between the two suites, and a reviewer comparing
 * them should expect it by design rather than read it as a gap. It is only possible here because the
 * port replaced DI/1 property injection and `onMissingMethod` synthesis with declared constructor
 * parameters, which is what makes substitution possible at all.
 *
 * ---------------------------------------------------------------------------------------------------
 * TRACEABILITY IS DOCUMENTARY, NOT EMPIRICAL
 * ---------------------------------------------------------------------------------------------------
 * The legacy suite was never executed to produce these expectations, and could not be:
 *
 *   - MXUnit and CFSelenium are not vendored anywhere in the repository.
 *   - `meta/tests/readme.txt:L1-L7` states the suite needs external CFIDE mappings that do not exist
 *     in this checkout.
 *   - `meta/docker/slatwall-local-dev/` — cited as the local Lucee/Railo + MySQL setup — does not
 *     exist; `meta/` holds only `tests/` and `eclipse/`.
 *
 * Every expectation below was therefore derived by READING legacy source at the cited locator, not by
 * running it. No runtime behavioural comparison against the CFML application was performed, and none
 * is claimed.
 *
 * ---------------------------------------------------------------------------------------------------
 * PROVENANCE: EVERY PUBLIC-MEMBER CASE IS NET-NEW
 * ---------------------------------------------------------------------------------------------------
 * There is no legacy `SkuServiceTest.cfc`. A service-test scan of `meta/tests/` finds no dedicated
 * test for any of the four catalog services, so there is no legacy coverage for this file to extend
 * and nothing here can honestly be labelled traceable. Each case covering a public member is labelled
 * `NET-NEW` in its own name so the ratio is visible per test rather than only in aggregate — which is
 * the whole point of labelling it, since the standing question is whether a port replicates existing
 * tests or quietly invents new ones. For this file the answer is: all of it is new, and it says so.
 *
 * ---------------------------------------------------------------------------------------------------
 * WHY EVERY CASE BUILDS ITS OWN DOUBLES, SERVICE AND DOMAIN STATE
 * ---------------------------------------------------------------------------------------------------
 * `SlatwallUnitTestBase.cfc:L53` (the reload call in `setUp()`) and `:L70` (the end-of-request call in
 * `tearDown()`) are both COMMENTED OUT in the legacy base. So the legacy suite neither reset the
 * application between tests nor drove request-end behaviour — including the M5 double `ormFlush()`
 * gate, which is the legacy commit boundary. State could and did leak from one legacy test into the
 * next.
 *
 * This file refuses to inherit that. There is NO module-scope mutable repository, array, map, cache or
 * entity anywhere below: every collaborator, every service instance and every entity is minted inside
 * the case that uses it (or inside a factory the case calls), so a case can only observe state it
 * created itself.
 *
 * ---------------------------------------------------------------------------------------------------
 * TRANSLATION DECISIONS RECORDED AT THE FILE LEVEL
 * ---------------------------------------------------------------------------------------------------
 * G6 — `model/service/SkuService.cfc` forwards `argumentCollection=arguments` to its collaborator on
 *      every passthrough member, which is a catch-all argument bag with no declared shape. There is no
 *      bag here and none is recreated: each case asserts the EXPLICIT parameters the ported member
 *      forwarded. `:L293` is also worth a note in its own right — it is the one `END:` marker in the
 *      four catalog services that names its own section correctly.
 *
 * G6 — `model/service/SkuService.cfc:L212` reaches its image collaborator through
 *      `getService("imageService")`. That dependency is NEVER declared as a component property, so any
 *      analysis built on component metadata misses it entirely. It is translated to the explicit
 *      `ImagePathPort` constructor parameter, and the image cases below drive that port.
 *
 * G6 — `model/service/SkuService.cfc:L54` declares a `productService` property with ZERO call sites.
 *      The landed constructor does not accept one and no case here wires one; dropping it also removed
 *      the old `ProductService` ↔ `SkuService` injection cycle at no cost.
 *
 * G6 — the landed constructor exposes no base-service seam. `model/service/SkuService.cfc` never calls
 *      `super.save()` (only `BrandService.cfc:L76` does), so there is no `BaseService` collaborator to
 *      wire from here and importing one would be an unused import.
 *
 * SCOPE — no case reaches an excluded calculated member. `salePrice` and its detail members, live and
 *      current-account price, `qats`, currency and estimated-receival details, fulfillment,
 *      backorder, availability and `adminIcon` are all outside this slice per AAP §0.2.2.6, and the
 *      out-of-scope Physical, Setting, Attribute and Pricing services are never constructed. Every
 *      boundary is crossed through a declared port double instead.
 *
 * DEVIATION — `OptionService` is imported directly even though it is not one of this file's declared
 *      dependencies. The landed `SkuService` constructor's second parameter is typed as the
 *      `OptionService` CLASS, and that class carries private fields, so it is nominally typed: no
 *      structural object literal can satisfy it. Constructing the real one over an in-memory option
 *      repository and an option-answering query double is the only way to instantiate the service
 *      without a type-assertion escape hatch, so that is what happens here.
 *
 */

import type { BaseProductType } from '../../src/domain/BaseProductType';
import { Option } from '../../src/domain/option/Option';
import type { OptionGroup } from '../../src/domain/option/OptionGroup';
import type { ProductType } from '../../src/domain/product/ProductType';
import { Product } from '../../src/domain/product/Product';
import type { SkuImagePathResolver } from '../../src/domain/sku/Sku';
import { SKU_UNSAVED_ID_VALUE, Sku } from '../../src/domain/sku/Sku';
import {
  DomainError,
  LegacyParityError,
  NotImplementedError,
  UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE,
} from '../../src/errors/DomainError';
import {
  ACCESS_CONTENTS_REQUIRED_RBKEY,
  SUBSCRIPTION_BENEFITS_REQUIRED_RBKEY,
  SUBSCRIPTION_TERMS_REQUIRED_RBKEY,
  ValidationError,
} from '../../src/errors/ValidationError';
import { IMAGE_UPLOAD_ALLOWED_EXTENSIONS } from '../../src/ports/ImagePathPort';
import type { SmartListJoin } from '../../src/ports/SmartListQueryPort';
import { resolveSmartListPropertyIdentifier } from '../../src/ports/SmartListQueryPort';
import type { SkuRepository, SkuSearchRow } from '../../src/ports/repositories/SkuRepository';
/* ⛔ NO `SkuRepository`, `BoundedReadResult` OR `BoundedReadWindow` IS IMPORTED HERE ANY LONGER, and the
 * capability they typed has NOT gone away — only this file's view of it has. All three arrived to type the
 * two withdrawn service members `searchSkusByProductTypeBounded` and `getSkuSmartListRecords`; with those
 * gone, no case in this suite constructs a window or reads a bounded result, and the compiler reported the
 * imports unused.
 *
 * ⚠️ AND THE REPOSITORY MEMBER HAS SINCE FOLLOWED THE SERVICE MEMBER, so the note that used to stand
 * here — "STILL DECLARED on the port and STILL IMPLEMENTED on the adapter" — is no longer true and is
 * corrected rather than left to mislead. `SkuRepository.searchByProductTypeBounded` has been withdrawn
 * too: once this file's service member went, the port declaration had no production caller in
 * `src/services/**`, `src/handlers/**` or `src/integrations/**`, and a method on an instantiated class
 * is the one shape of dead code a bundler cannot remove. The withdrawal is recorded at the declaration
 * site, at the adapter, and in `test/adapters/MySqlSkuRepository.test.ts` where its eleven cases stood.
 * NOTHING THAT DECIDES WHICH ROWS A SEARCH RETURNS lost coverage: the predicate, wildcard wrapping, list
 * splitting, guards and bind order were always shared with the unbounded member and are still asserted
 * there. The surface test below asserts the two service members are absent from `SkuService.prototype`,
 * which remains this file's obligation on the subject. */
import {
  createOptionGroupSortOrderMemo,
  MySqlSkuRepository,
} from '../../src/adapters/mysql/MySqlSkuRepository';
import { QueryRunner } from '../../src/adapters/mysql/QueryRunner';
import { UniquePropertyChecker } from '../../src/adapters/mysql/UniquePropertyChecker';
import { UnitOfWork } from '../../src/adapters/mysql/UnitOfWork';
import { Validator } from '../../src/validation/Validator';
import { OptionService } from '../../src/services/OptionService';
import type { ManagedSku, SkuCombinationBudget } from '../../src/services/SkuService';
import {
  SkuService,
  collectSkuBatchErrors,
  skuBatchHasErrors,
} from '../../src/services/SkuService';
import {
  createSkuValidationRules,
  resolveSkuUniqueTarget,
} from '../../src/validation/rules/sku.rules';
import {
  CONTENT_ACCESS_PRODUCT_TYPE,
  MERCHANDISE_PRODUCT_TYPE,
  SUBSCRIPTION_PRODUCT_TYPE,
} from '../fixtures/productTypes';
import {
  TEST_MERCHANDISE_PRODUCT_CODE,
  TEST_MERCHANDISE_PRODUCT_NAME,
  TEST_MERCHANDISE_PRODUCT_PRICE,
} from '../fixtures/testProduct';
import type {
  AccessContentDouble,
  ImagePathDouble,
  InMemorySkuRepository,
  ProductTypeRootResolverDouble,
  SkuBatchSequencing,
  SmartListOutcome,
  SmartListQueryDouble,
  SubscriptionTermDouble,
  UniquePropertyValueSeed,
  ValidatorHarness,
} from '../support/inMemoryRepositories';
import {
  buildOption,
  buildOptionGroup,
  buildProduct,
  buildProductType,
  buildSku,
  createAccessContentDouble,
  createDefaultSkuDelegate,
  createImagePathDouble,
  createInMemoryOptionRepository,
  createInMemorySkuRepository,
  createProductTypeRootResolverDouble,
  createSkuBatchSequencer,
  createSkusBySelectedOptionsLookup,
  createSmartListQueryDouble,
  createSubscriptionTermDouble,
  /*
   * The production crossing, re-exported for tests. It is imported HERE — in the service suite — because
   * the `getTransactionExistsFlag` block below has to prove that the identifier-scoped probe the two
   * delete guards use is this CHECKER, whose caller order it crosses onto the repository's, and not the
   * service member it now happens to share a shape with.
   */
  createTransactionExistenceChecker,
  createValidatorHarness,
  TEST_IMAGE_STORAGE_ROOT,
  /* SEC-AUTH-03 — the deny-all property verdict every hand-built security context carries. */
  DENY_ALL_POPULATION_AUTHORIZATION,
  /* SEC-AUTH-03 — the authorised-context and security-request factories. */
  persistedAdminAccount,
  securityContext,
  /* SEC-DOS-01 — the operator-stated combination ceiling and the cancellation seam. A fixture states a
   * figure because a test IS the operator; `src/**` states none (AAP §0.7.3 S9). */
  combinationBudget,
  GENEROUS_COMBINATION_BUDGET,
  UNSTATED_COMBINATION_BUDGET,
} from '../support/inMemoryRepositories';
import { MySqlTransactionalWriteRunner } from '../../src/adapters/mysql/UnitOfWork';
import { manageEntity } from '../../src/domain/base/populate';
import { SKU_ENTITY_METADATA } from '../../src/domain/sku/Sku';
import {
  SKU_ACCESS_MATRIX,
  createProductSkuCreationBoundary,
  createSkuHandler,
} from '../../src/handlers/skuHandler';
import type { UnitOfWorkRunner } from '../../src/adapters/mysql/UnitOfWork';
import type { TransactionScope } from '../../src/adapters/mysql/UnitOfWork';
import type {
  ScopedTransactionRunner,
  SkuCreationGraph,
  SkuSurface,
  SkuWriteGraph,
} from '../../src/handlers/skuHandler';
import type {
  InvocationSecurityResolver,
  RequestAuthorizationContext,
  RequestAuthorizationResolver,
} from '../../src/ports/AccountContextPort';
import type { TransactionalWriteRunner } from '../../src/ports/UniquePropertyPort';
import type { ProductWithErrorState } from '../../src/services/SkuService';

/*
 * ===================================================================================================
 * IDENTIFIERS
 * ===================================================================================================
 * 32-character hex, no dashes, matching the identifier shape `model/dao/HibachiDAO.cfc`'s
 * `createSlatwallUUID()` produces (IR-6). Distinct prefixes per family so a crossed association shows
 * up as a wrong value rather than a coincidental pass. Frozen and read-only — this is the one piece of
 * module scope in the file and it holds nothing mutable.
 */
const ID = Object.freeze({
  product: 'aaaa0000000000000000000000000001',
  otherProduct: 'aaaa0000000000000000000000000002',
  childProductType: 'bbbb0000000000000000000000000001',
  colorGroup: 'cccc0000000000000000000000000001',
  sizeGroup: 'cccc0000000000000000000000000002',
  red: 'dddd0000000000000000000000000001',
  blue: 'dddd0000000000000000000000000002',
  small: 'dddd0000000000000000000000000003',
  large: 'dddd0000000000000000000000000004',
  existingSku: 'eeee0000000000000000000000000001',
  secondExistingSku: 'eeee0000000000000000000000000002',
  optionlessSku: 'eeee0000000000000000000000000003',
  monthlyTerm: 'ffff0000000000000000000000000001',
  annualTerm: 'ffff0000000000000000000000000002',
  benefit: '11110000000000000000000000000001',
  renewalBenefit: '11110000000000000000000000000002',
  firstContent: '22220000000000000000000000000001',
  secondContent: '22220000000000000000000000000002',
} as const);

/** The one `-` the legacy SKU-code concatenations put between code and suffix. */
const SKU_CODE_DELIMITER = '-';

/*
 * ===================================================================================================
 * SMALL TYPED HELPERS
 * ===================================================================================================
 */

/**
 * Reads one entry of a list and refuses rather than asserting against `undefined`.
 *
 * `noUncheckedIndexedAccess` is on, so every index read is `T | undefined`. Narrowing through an
 * explicit refusal keeps the failure message about the SHAPE that was wrong instead of surfacing later
 * as "cannot read property of undefined", and it avoids reaching for a non-null assertion to silence
 * the compiler.
 */
function requireAt<T>(items: readonly T[], index: number, what: string): T {
  const item = items[index];

  if (item === undefined) {
    throw new Error(
      `The case expected ${what} at index ${String(index)}, but the list held ` +
        `${String(items.length)} entries.`,
    );
  }

  return item;
}

/**
 * An `ExactDecimal` minted through the support factory rather than asserted into existence.
 *
 * `Sku.price` and its siblings are a BRANDED string type, and the brand's constructor lives in
 * `src/util/formatting.ts` — outside this file's declared dependencies. Rather than reach for a type
 * assertion to satisfy the brand, the value is produced by the whitelisted `buildSku` factory and read
 * back off the entity, and the type is referenced indirectly as `Sku['price']`.
 */
function exactDecimal(value: number | string): Sku['price'] {
  return buildSku({ price: value }).price;
}

/** A SKU's option set as a stable, order-preserving string, for asserting combination order. */
function describeOptions(sku: Sku): string {
  return sku
    .getOptions()
    .map((option) => option.optionID)
    .join('+');
}

/** Narrows a product's SKU members to `Sku`, refusing anything else rather than silently skipping. */
function readProductSkus(product: Product): Sku[] {
  return product.getSkus().map((member, index) => {
    if (!(member instanceof Sku)) {
      throw new Error(`The product's SKU member at index ${String(index)} is not a Sku entity.`);
    }

    return member;
  });
}

/*
 * ===================================================================================================
 * FRESH DOMAIN STATE
 * ===================================================================================================
 * Builders, never shared instances. Each returns brand-new entities so nothing can leak between cases.
 */

/** A product type carrying a seeded discriminator directly on `systemCode`. */
function buildSeededProductType(systemCode: string, productTypeID: string): ProductType {
  return buildProductType({ productTypeID, productTypeIDPath: productTypeID, systemCode });
}

/**
 * A product with no SKUs and no default SKU.
 *
 * Deliberately NOT `createMerchandiseProductFixture`: that helper attaches a default SKU, and
 * attaching it pushes onto `product.skus` through `Sku.setProduct` — which would shift every generated
 * SKU-code suffix by one and hide the sequence these cases exist to pin.
 */
function buildEmptyProduct(productType: ProductType, productID: string = ID.product): Product {
  return buildProduct({
    productID,
    productCode: TEST_MERCHANDISE_PRODUCT_CODE,
    productName: TEST_MERCHANDISE_PRODUCT_NAME,
    productType,
  });
}

/** Two option groups, `[red, blue]` then `[small, large]`, in that discovery order. */
function buildColorAndSizeOptions(): {
  readonly colorGroup: OptionGroup;
  readonly sizeGroup: OptionGroup;
  readonly options: readonly Option[];
} {
  const colorGroup = buildOptionGroup({
    optionGroupID: ID.colorGroup,
    optionGroupCode: 'color',
    optionGroupName: 'Color',
    sortOrder: 1,
  });
  const sizeGroup = buildOptionGroup({
    optionGroupID: ID.sizeGroup,
    optionGroupCode: 'size',
    optionGroupName: 'Size',
    sortOrder: 2,
  });

  return {
    colorGroup,
    sizeGroup,
    options: Object.freeze([
      buildOption({ optionID: ID.red, optionCode: 'red', optionGroup: colorGroup, sortOrder: 1 }),
      buildOption({ optionID: ID.blue, optionCode: 'blue', optionGroup: colorGroup, sortOrder: 2 }),
      buildOption({ optionID: ID.small, optionCode: 'sm', optionGroup: sizeGroup, sortOrder: 1 }),
      buildOption({ optionID: ID.large, optionCode: 'lg', optionGroup: sizeGroup, sortOrder: 2 }),
    ]),
  };
}

/*
 * ===================================================================================================
 * THE HARNESS
 * ===================================================================================================
 */

/**
 * The verdict the image-path double answers when a case does not set `saveImageSucceeds`.
 *
 * Named rather than inlined because `processImageUpload` answers the image service's own boolean
 * ([model/service/SkuService.cfc:L213-L217]), so every case that does not care WHICH way the write went
 * still has to state the default it is riding on. `createImagePathDouble` in
 * `../support/inMemoryRepositories.ts` defaults `saveSucceeds` to `true`; this constant is that default,
 * declared once so the two cannot drift.
 */
const SAVE_IMAGE_SUCCEEDS_BY_DEFAULT = true;

/** Everything a case may vary. Every field is optional; omitting one means "nothing seeded". */
interface HarnessOptions {
  /** Options the option boundary can resolve, in the order the query double should return them. */
  readonly resolvableOptions?: readonly Option[];
  /** SKUs already stored before the case runs. */
  readonly storedSkus?: readonly Sku[];
  /** SKU identifiers the transaction-existence probe should answer `true` for. */
  readonly transactionSkuIDs?: readonly string[];
  /** Product identifiers the transaction-existence probe should answer `true` for. */
  readonly transactionProductIDs?: readonly string[];
  readonly subscriptionTermIDs?: readonly string[];
  readonly subscriptionBenefitIDs?: readonly string[];
  readonly contentIDs?: readonly string[];
  readonly imagePathsByImageFile?: Readonly<Record<string, string>>;
  readonly saveImageSucceeds?: boolean;
  /**
   * COMPOSED image paths the existence probe should answer `true` for.
   *
   * `model/entity/Sku.cfc:L222` probes with `fileExists(expandPath(getImagePath()))` — it composes
   * first and probes second — so what the probe receives is the composed path and never the bare stored
   * column value. Seeding by composed path is therefore the faithful shape.
   */
  readonly existingImagePaths?: readonly string[];
  /** Queued answers for the SKU-side query port, consumed in order. */
  readonly skuSmartListOutcomes?: readonly SmartListOutcome[];
  /** Values the uniqueness port should report as already taken. */
  readonly takenUniqueValues?: readonly UniquePropertyValueSeed[];
  /** Fixes the odometer ceiling the sorted-SKU ordering multiplies against. */
  readonly nextOptionGroupSortOrder?: number;
  /** Alternate SKU codes, so the OR-branch of the code lookup can be driven. */
  readonly alternateSkuCodes?: readonly {
    readonly skuID: string;
    readonly alternateSkuCode: string;
  }[];

  /**
   * The combination ceiling the harness's service should carry — review finding SEC-DOS-01.
   *
   * Omitted means {@link GENEROUS_MAXIMUM_COMBINATIONS}, which is far above anything any fixture in this
   * suite enumerates, so no case's outcome depends on it unless the case states its own figure.
   */
  readonly maximumCombinations?: number;

  /**
   * The cooperative cancellation predicate the harness's service should carry — SEC-DOS-01's deadline seam.
   *
   * Omitted means never-cancelled, which is the composition root's own default: the invocation deadline
   * stays the platform's, and AAP §0.6.6 M1/M2 remain flagged rather than resolved.
   */
  readonly hasBeenCancelled?: () => boolean;

  /**
   * A whole {@link SkuCombinationBudget} to use INSTEAD of deriving one from the two options above.
   *
   * Exists for the one property those cannot express: a budget whose figure was never STATED, whose
   * resolver therefore raises. `maximumCombinations` takes a number, so it can say "small" but never
   * "absent", and absent is the fail-closed case SEC-DOS-01 turns on. Supplying this ignores both
   * {@link HarnessOptions.maximumCombinations} and {@link HarnessOptions.hasBeenCancelled}.
   */
  readonly combinationBudget?: SkuCombinationBudget;
}

/**
 * The combination ceiling the harness applies when a case states none — review finding SEC-DOS-01.
 *
 * ⭐ A FIXTURE MAY STATE A FIGURE WHERE `src/**` MAY NOT. AAP §0.7.3 S9 and IR-12 forbid the PORT from
 * authoring a capacity number, and none does — every bound is a resolver that refuses when nobody stated a
 * figure. A test is standing in for the OPERATOR, so stating one here exercises the mechanism. This value is
 * far above the largest product any fixture in this suite builds (the biggest is four combinations), so no
 * existing assertion depends on it.
 */
const GENEROUS_MAXIMUM_COMBINATIONS = 1_000_000;

/** Live handles onto everything the harness wired, so a case can assert against the real collaborators. */
interface Harness {
  readonly service: SkuService;
  readonly skuRepository: InMemorySkuRepository;
  readonly optionService: OptionService;
  /** The query port `OptionService` resolves selected options through. */
  readonly optionQueries: SmartListQueryDouble;
  /** The query port the SKU smart list composes against. Kept separate so neither pollutes the other. */
  readonly skuQueries: SmartListQueryDouble;
  readonly imagePaths: ImagePathDouble;
  readonly subscriptionTerms: SubscriptionTermDouble;
  readonly accessContents: AccessContentDouble;
  readonly validation: ValidatorHarness;
  readonly productTypeRoots: ProductTypeRootResolverDouble;
  /**
   * Every SKU the service bound as the product's default, in binding order.
   *
   * The binder is the ninth constructor parameter and exists because `Product.defaultSku` is a
   * DELEGATE, not a `Sku` — the delegate surface is what `model/entity/Product.cfc`'s default-SKU reads
   * actually need. Recording the SKU on the way through is the only way to assert WHICH SKU became the
   * default without reaching through the delegate into an excluded calculated member.
   */
  readonly defaultSkuBindings: readonly Sku[];
}

/**
 * Wires one `SkuService` over live doubles for all NINE constructor parameters.
 *
 * Nothing is faked with a type assertion and nothing is left unreachable: every collaborator is a real
 * implementation over in-memory state, so a case that unexpectedly reaches one gets a real answer that
 * it can then assert on, and the constructor's declared shape is honoured rather than bypassed.
 *
 * The two query ports are SEPARATE instances on purpose. `OptionService.getOption` and
 * `SkuService.getSkuSmartList` both go through `SmartListQueryPort`, and sharing one double would mean
 * every combination-engine case had option-resolution queries interleaved with the SKU queries it was
 * trying to pin. The separation matters MORE now than it did while a withdrawn batch member resolved a
 * whole list in one query: the engine issues one option query per selected identifier
 * [model/service/SkuService.cfc:L73-L74], so a shared double would interleave N of them.
 */
function buildHarness(options: HarnessOptions = {}): Harness {
  const resolvableOptions = options.resolvableOptions ?? [];

  const optionQueries = createSmartListQueryDouble({
    respond: (query) => {
      if (query.entityName !== 'SlatwallOption') {
        return undefined;
      }

      /*
       * BOTH IDENTIFIER SHAPES ARE ANSWERED, AND THE ONE THE ENGINE ACTUALLY USES IS THE SINGLE FILTER.
       * `OptionService.getOption` — the member `model/service/SkuService.cfc:L74` calls once per list
       * entry — builds `whereGroups[0].filters` with ONE `optionID` value. An earlier revision of the
       * service resolved the whole list through a withdrawn batch member that built an `inFilters` list
       * instead, and this double read only that shape; when the engine was returned to the legacy's
       * per-identifier pattern the double answered nothing and every combination case failed with an
       * unresolvable option. Both shapes are read here so the double describes the PORT's contract rather
       * than one caller's habit, and so neither shape can silently stop being answered.
       */
      const requested = new Set<string>();
      for (const whereGroup of query.whereGroups ?? []) {
        for (const filter of whereGroup.filters ?? []) {
          if (filter.propertyIdentifier === 'optionID') {
            requested.add(String(filter.value));
          }
        }
        for (const inFilter of whereGroup.inFilters ?? []) {
          if (inFilter.propertyIdentifier === 'optionID') {
            for (const segment of String(inFilter.value).split(',')) {
              requested.add(segment);
            }
          }
        }
      }

      return {
        kind: 'page',
        metrics: {},
        records: resolvableOptions.filter((option) => requested.has(option.optionID)),
      };
    },
  });

  const skuQueriesOptions =
    options.skuSmartListOutcomes === undefined ? {} : { outcomes: options.skuSmartListOutcomes };
  const skuQueries = createSmartListQueryDouble(skuQueriesOptions);

  const optionRepository = createInMemoryOptionRepository();
  const optionService = new OptionService(optionRepository.repository, optionQueries.smartList);

  const productTypeRoots = createProductTypeRootResolverDouble();

  const skuRepository = createInMemorySkuRepository({
    productTypeRootResolver: productTypeRoots.resolver,
    ...(options.storedSkus === undefined ? {} : { skus: options.storedSkus }),
    ...(options.transactionSkuIDs === undefined
      ? {}
      : { transactionSkuIDs: options.transactionSkuIDs }),
    ...(options.transactionProductIDs === undefined
      ? {}
      : { transactionProductIDs: options.transactionProductIDs }),
    ...(options.nextOptionGroupSortOrder === undefined
      ? {}
      : { nextOptionGroupSortOrder: options.nextOptionGroupSortOrder }),
    ...(options.alternateSkuCodes === undefined
      ? {}
      : { alternateSkuCodes: options.alternateSkuCodes }),
  });

  const subscriptionTerms = createSubscriptionTermDouble({
    ...(options.subscriptionTermIDs === undefined
      ? {}
      : { subscriptionTermIDs: options.subscriptionTermIDs }),
    ...(options.subscriptionBenefitIDs === undefined
      ? {}
      : { subscriptionBenefitIDs: options.subscriptionBenefitIDs }),
  });

  const accessContents = createAccessContentDouble(
    options.contentIDs === undefined ? {} : { contentIDs: options.contentIDs },
  );

  const imagePaths = createImagePathDouble({
    ...(options.imagePathsByImageFile === undefined
      ? {}
      : { imagePathsByImageFile: options.imagePathsByImageFile }),
    ...(options.saveImageSucceeds === undefined ? {} : { saveSucceeds: options.saveImageSucceeds }),
    ...(options.existingImagePaths === undefined
      ? {}
      : { existingImageFiles: options.existingImagePaths }),
  });

  /*
   * The REAL `Validator`, over the real ported SKU rule sets — not a stub that reports every SKU clean.
   *
   * This is the difference between a suite that can prove the M6 read-back contract and one that only
   * looks like it does. A validator double that always answers "clean" makes the read-back ordering
   * unobservable, because the ordering only shows up in WHICH SKU the uniqueness rule rejects.
   */
  const validation = createValidatorHarness(options.takenUniqueValues ?? []);

  const defaultSkuBindings: Sku[] = [];

  const service = new SkuService(
    skuRepository.repository,
    optionService,
    subscriptionTerms.subscriptionTerms,
    accessContents.accessContents,
    imagePaths.imagePaths,
    skuQueries.smartList,
    validation.validator,
    productTypeRoots.resolver,
    (sku: Sku) => {
      defaultSkuBindings.push(sku);

      return createDefaultSkuDelegate(sku);
    },
    /* SEC-DOS-01 — the tenth argument, generous by default so no harness case reaches it. A case asserting
     * the ceiling states `maximumCombinations`; a case asserting the UNSTATED-figure refusal supplies a
     * whole budget through `combinationBudget`, because a number cannot express absence. */
    options.combinationBudget ??
      combinationBudget(
        options.maximumCombinations ?? GENEROUS_MAXIMUM_COMBINATIONS,
        options.hasBeenCancelled,
      ),
  );

  return {
    service,
    skuRepository,
    optionService,
    optionQueries,
    skuQueries,
    imagePaths,
    subscriptionTerms,
    accessContents,
    validation,
    productTypeRoots,
    defaultSkuBindings,
  };
}

/*
 * ===================================================================================================
 * THE REAL `UnitOfWork`, OVER A LOCAL DRIVER PROBE
 * ===================================================================================================
 * `src/adapters/mysql/UnitOfWork.ts` takes a `StatementPool` — the raw mysql2-shaped seam, declared in
 * `src/adapters/mysql/QueryRunner.ts`. `test/support/inMemoryRepositories.ts` supplies a
 * `TransactionalSqlExecutor` double and a UnitOfWork DOUBLE, but no driver-level pool, so this is the
 * one shape the shared support file genuinely lacks and the only local double in this file. It is
 * deliberately tiny: it records the lifecycle calls and answers every statement with an empty result.
 *
 * Why bother constructing the real class rather than using the shared UnitOfWork double? Because the
 * M6 contract has two halves. One half is the per-SKU interleave, which lives in
 * `SkuService.validateNewSku`. The other half is "all of it inside the SAME transaction", which lives
 * in `UnitOfWork` and nowhere else — and the only way to assert it against the real implementation is
 * to instantiate the real implementation.
 */

/** One statement the probe was asked to run, and which channel it arrived on. */
interface DriverStatement {
  /** `'transaction'` for the boundary's own connection, `'pool'` for anything that bypassed it. */
  readonly channel: 'transaction' | 'pool';
  /** `'write'` for INSERT/UPDATE/DELETE/REPLACE, `'read'` for everything else. */
  readonly kind: 'read' | 'write';
  readonly sql: string;
  readonly params: readonly unknown[];
}

/** The error the POOL channel raises, quoted in the assertions that depend on it. */
const POOL_EXECUTOR_USED_MESSAGE = 'POOL EXECUTOR USED';

/**
 * A hook invoked as each settlement step is ATTEMPTED on the probe's connection; throw to fail it.
 *
 * ⭐ WHY THE PROBE HAS TO BE ABLE TO FAIL A SETTLEMENT. `src/adapters/mysql/UnitOfWork.ts` releases a
 * connection whose transaction state is KNOWN and DESTROYS one whose settlement failed, so that a
 * connection nobody can describe never re-enters a warm pool (M7). Every branch of that rule except the
 * plain release lives on the failing side, so a probe whose `beginTransaction`, `commit` and `rollback`
 * always resolved could never reach it: the disposal handling could be deleted from the boundary
 * outright and every case in this file would still pass. This hook is what makes the destroy branch
 * observable from the service's own settlement gate rather than only from the adapter's unit tests.
 */
type SettlementResponder = (step: 'begin' | 'commit' | 'rollback') => void;

/** One transactional connection the probe handed out, plus the lifecycle it observed. */
interface DriverProbe {
  readonly pool: {
    execute(sql: string, values: readonly unknown[]): Promise<[unknown, unknown[]]>;
    getConnection(): Promise<{
      execute(sql: string, values: readonly unknown[]): Promise<[unknown, unknown[]]>;
      beginTransaction(): Promise<void>;
      commit(): Promise<void>;
      rollback(): Promise<void>;
      release(): void;
      destroy(): void;
    }>;
  };
  /** `getConnection`, `begin`, `commit`, `rollback`, `release`, `destroy` — in the order they happened. */
  readonly lifecycle: readonly string[];
  /** Every statement either channel was asked to run, in order, across both channels. */
  readonly statements: readonly DriverStatement[];
}

/**
 * Classifies a statement by what it does, which is all the probe needs to answer it correctly.
 *
 * A read is answered with an empty row list and a write with an affected-row acknowledgement, because
 * `UnitOfWork.createExecutor` REFUSES a write whose result carries no `affectedRows` — deliberately, so
 * that a read routed into `executeMutation` cannot be silently reported as "affected nothing". A probe
 * that answered every statement with an empty list could therefore never let a real write through.
 *
 * @param sql - the statement text as issued.
 * @returns `'write'` for the four mutating verbs, `'read'` otherwise.
 */
function classifyStatement(sql: string): 'read' | 'write' {
  return /^\s*(?:insert|update|delete|replace)\b/i.test(sql) ? 'write' : 'read';
}

function createDriverProbe(settle?: SettlementResponder): DriverProbe {
  const lifecycle: string[] = [];
  const statements: DriverStatement[] = [];

  /*
   * ⭐ THE LIFECYCLE EVENT IS RECORDED BEFORE THE RESPONDER RUNS, and the order is the point. A commit
   * the boundary issued and the driver then rejected was still ATTEMPTED, and it is exactly the case
   * where the connection's state becomes indescribable; recording only settlements that succeeded would
   * make it indistinguishable from a commit that never happened.
   *
   * The responder runs INSIDE the `then`, so a throw from it is converted into a REJECTION by the promise
   * machinery rather than surfacing synchronously. That distinction is the faithful one: production
   * catches a driver failure with `catch` around an awaited call, so a probe that threw synchronously
   * would exercise a path the real driver never takes. The recording stays synchronous, so the lifecycle
   * is still exactly issue order.
   */
  const settleStep = (step: 'begin' | 'commit' | 'rollback'): Promise<void> => {
    lifecycle.push(step);

    return Promise.resolve().then((): void => {
      settle?.(step);
    });
  };

  const answer = (
    channel: 'transaction' | 'pool',
    sql: string,
    values: readonly unknown[],
  ): Promise<[unknown, unknown[]]> => {
    const kind = classifyStatement(sql);
    statements.push({ channel, kind, sql, params: [...values] });

    /*
     * ⛔ THE POOL CHANNEL IS POISONED, AND THAT IS THE ASSERTION RATHER THAN A CONVENIENCE. Inside a
     * transaction boundary NOTHING may reach the pool: a statement that did would run on a different
     * connection, outside the transaction, where it can neither see the boundary's uncommitted writes
     * (M6) nor be discarded by its rollback. Answering such a statement successfully would let that
     * defect pass as a green test — which is exactly what happened while `withExecutor` had no caller —
     * so the probe fails loudly instead. A test that legitimately wants a pool-channel statement wants
     * a different double.
     */
    if (channel === 'pool') {
      return Promise.reject(new Error(POOL_EXECUTOR_USED_MESSAGE));
    }

    /* A write acknowledgement for a write, an empty result set for a read. */
    return Promise.resolve(kind === 'write' ? [{ affectedRows: 1 }, []] : [[], []]);
  };

  const connection = {
    execute: (sql: string, values: readonly unknown[]): Promise<[unknown, unknown[]]> =>
      answer('transaction', sql, values),
    beginTransaction: (): Promise<void> => settleStep('begin'),
    commit: (): Promise<void> => settleStep('commit'),
    rollback: (): Promise<void> => settleStep('rollback'),
    release: (): void => {
      lifecycle.push('release');
    },
    destroy: (): void => {
      lifecycle.push('destroy');
    },
  };

  return {
    lifecycle,
    statements,
    pool: {
      execute: (sql: string, values: readonly unknown[]): Promise<[unknown, unknown[]]> =>
        answer('pool', sql, values),
      getConnection: (): Promise<typeof connection> => {
        lifecycle.push('getConnection');

        return Promise.resolve(connection);
      },
    },
  };
}

describe('SkuService.createSkus — discrimination and input contract', () => {
  /*
   * `model/service/SkuService.cfc:L58-L208`. The discriminator is read once, from
   * `product.getProductType().getBaseProductType()`, and tested three times at [:L61], [:L139] and
   * [:L173] with CFML `==` — which folds case on text operands. The seeded discriminator values and
   * their UUIDs come from `test/fixtures/productTypes`, whose source of truth is
   * `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` (IR-7). No UUID or system code is retyped as a
   * literal anywhere in this file.
   */

  it('NET-NEW takes the merchandise branch from the seeded systemCode on the product type itself', async () => {
    const productType = buildSeededProductType(
      MERCHANDISE_PRODUCT_TYPE.systemCode,
      MERCHANDISE_PRODUCT_TYPE.productTypeID,
    );
    const product = buildEmptyProduct(productType);
    const { colorGroup, options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });

    const created = await harness.service.createSkus(product, {
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      options: ID.red,
    });

    expect(created).toBe(true);
    expect(harness.skuRepository.persisted).toHaveLength(1);
    expect(describeOptions(requireAt(harness.skuRepository.persisted, 0, 'the created SKU'))).toBe(
      ID.red,
    );
    /* The branch key really did come from the seeded fixture rather than a literal in this file. */
    expect(productType.systemCode).toBe(MERCHANDISE_PRODUCT_TYPE.systemCode);
    expect(colorGroup.optionGroupID).toBe(ID.colorGroup);
  });

  it('NET-NEW folds case on the base product type, because CFML == does', async () => {
    /*
     * A `SwProductType` row holding a differently-cased spelling took the merchandise branch under
     * `==` at [:L61]. `===` against the seeded spelling would have sent it to the fallthrough throw at
     * [:L204] instead, so the folding is behaviour and not tidiness.
     */
    const foldedSpelling = MERCHANDISE_PRODUCT_TYPE.systemCode.toUpperCase();
    const productType = buildSeededProductType(
      foldedSpelling,
      MERCHANDISE_PRODUCT_TYPE.productTypeID,
    );
    const product = buildEmptyProduct(productType);
    const harness = buildHarness();

    await expect(
      harness.service.createSkus(product, { price: TEST_MERCHANDISE_PRODUCT_PRICE }),
    ).resolves.toBe(true);

    expect(foldedSpelling).not.toBe(MERCHANDISE_PRODUCT_TYPE.systemCode);
    expect(harness.skuRepository.persisted).toHaveLength(1);
  });

  it('NET-NEW resolves an inherited base product type through the explicit root resolver', async () => {
    /*
     * `model/entity/ProductType.cfc:L110` walks to the FIRST identifier of `productTypeIDPath` and asks
     * the product-type service for that root. The port replaced that string-keyed service lookup with
     * a declared resolver parameter, so this case asserts the resolver was actually consulted with the
     * seeded root identifier.
     */
    const childProductType = buildProductType({
      productTypeID: ID.childProductType,
      productTypeName: 'Child Of Merchandise',
      productTypeIDPath: `${MERCHANDISE_PRODUCT_TYPE.productTypeID},${ID.childProductType}`,
    });
    const product = buildEmptyProduct(childProductType);
    const harness = buildHarness();

    await expect(
      harness.service.createSkus(product, { price: TEST_MERCHANDISE_PRODUCT_PRICE }),
    ).resolves.toBe(true);

    expect(harness.productTypeRoots.requestedProductTypeIds).toContain(
      MERCHANDISE_PRODUCT_TYPE.productTypeID,
    );
    expect(childProductType.systemCode).toBeUndefined();
    expect(harness.skuRepository.persisted).toHaveLength(1);
  });

  it('NET-NEW throws the mandated legacy message for a base product type it does not recognise', async () => {
    /*
     * [:L203-L205] is a bare single-argument CFML `throw`. The message is imported from
     * `src/errors/DomainError` and NEVER retyped here — one declaration site keeps verbatim fidelity
     * checkable with a single search, and a second copy in a test would be free to drift.
     *
     * It arrives as `LegacyParityError` rather than the base `DomainError`, which is how a mandated
     * legacy string is told apart from a diagnostic this port authored.
     */
    const productType = buildProductType({
      productTypeID: ID.childProductType,
      productTypeIDPath: ID.childProductType,
      systemCode: 'giftCard',
    });
    const product = buildEmptyProduct(productType);
    const harness = buildHarness();

    await expect(
      harness.service.createSkus(product, { price: TEST_MERCHANDISE_PRODUCT_PRICE }),
    ).rejects.toThrow(LegacyParityError);
    await expect(
      harness.service.createSkus(product, { price: TEST_MERCHANDISE_PRODUCT_PRICE }),
    ).rejects.toThrow(UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE);
    expect(harness.skuRepository.persisted).toHaveLength(0);
  });

  it('NET-NEW takes the multi-SKU branch only when the options key exists and its raw text is non-empty', async () => {
    /*
     * [:L64] `structKeyExists(arguments.data, "options") && len(arguments.data.options)`. The second
     * test is on the RAW TEXT length, not on `listLen`.
     *
     * The two branches are told apart by the default-SKU rule, which is the one observable difference
     * when both produce a single option-less SKU: [:L100-L103] rebinds the default only when the
     * product has none, while [:L134] rebinds it UNCONDITIONALLY. Seeding a product that already has a
     * default therefore makes the branch visible.
     */
    const seedDefaultedProduct = (): Product => {
      const productType = buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      );
      const product = buildEmptyProduct(productType);
      product.defaultSku = createDefaultSkuDelegate(buildSku({ price: 1 }));

      return product;
    };

    const absentKey = buildHarness();
    await absentKey.service.createSkus(seedDefaultedProduct(), {
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
    });
    expect(absentKey.defaultSkuBindings).toHaveLength(1);

    const emptyText = buildHarness();
    await emptyText.service.createSkus(seedDefaultedProduct(), {
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      options: '',
    });
    expect(emptyText.defaultSkuBindings).toHaveLength(1);

    /*
     * A LONE DELIMITER. `len(",")` is 1, so this takes the odometer branch and then resolves zero
     * options — one option-less SKU, and NO default rebinding because the product already has one.
     * Carried as observed behaviour; guarding against it would be a repair.
     */
    const loneDelimiter = buildHarness();
    await loneDelimiter.service.createSkus(seedDefaultedProduct(), {
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      options: ',',
    });
    expect(loneDelimiter.defaultSkuBindings).toHaveLength(0);
    expect(loneDelimiter.skuRepository.persisted).toHaveLength(1);
    expect(describeOptions(requireAt(loneDelimiter.skuRepository.persisted, 0, 'the SKU'))).toBe(
      '',
    );
  });

  it('NET-NEW reads data.options as a comma-delimited string and refuses a non-simple value', async () => {
    /*
     * [:L73-L74] walk the value with `listLen` and `listGetAt`. It is a delimited STRING, never an
     * array; CFML's list functions raise on a complex value, and the port raises at the same point.
     */
    const { options } = buildColorAndSizeOptions();

    const delimited = buildHarness({ resolvableOptions: options });
    const delimitedProduct = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );
    await delimited.service.createSkus(delimitedProduct, {
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      options: `${ID.red},${ID.blue}`,
    });
    expect(delimited.skuRepository.persisted).toHaveLength(2);

    const asArray = buildHarness({ resolvableOptions: options });
    const arrayProduct = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );
    await expect(
      asArray.service.createSkus(arrayProduct, {
        price: TEST_MERCHANDISE_PRODUCT_PRICE,
        options: [ID.red, ID.blue],
      }),
    ).rejects.toThrow(DomainError);
    expect(asArray.skuRepository.persisted).toHaveLength(0);
  });

  it('NET-NEW resolves selected options one identifier at a time, in input order, repeats included', async () => {
    /*
     * [:L73-L74] is a `for` loop over `listLen(arguments.data.options)` whose body calls
     * `getOptionService().getOption( listGetAt(arguments.data.options, i) )` — ONE resolution per list
     * ENTRY, in list order, with NO de-duplication of any kind. `onMissingMethod` synthesised that
     * member; IR-1 requires it to be declared explicitly, and this service calls it exactly as the
     * legacy loop does.
     *
     * ⚠️ AN EARLIER REVISION BATCHED THIS INTO ONE QUERY AND COLLAPSED THE REPEATS, AND THE DIFFERENCE
     * WAS OBSERVABLE IN TWO WAYS. It changed the statement count from N to one, and it changed WHICH
     * values reached the boundary — `blue,red,blue` arrived as `blue,red`. The batch member has been
     * withdrawn (AAP §0.7.3 S9 names "batch" among the things a port may not invent, and §0.8.2
     * Guideline 4 forbids optimising beyond what the migration requires), so the assertion below pins
     * the legacy's own pattern: three entries produce THREE resolutions, the repeat issued twice.
     *
     * [:L75-L78] then bucket by `optionGroupID`, and the append at [:L78] is UNCONDITIONAL: a repeated
     * selection is appended again rather than skipped. That is why three entries over one group yield
     * three combinations.
     */
    const { options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await harness.service.createSkus(product, {
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      options: `${ID.blue},${ID.red},${ID.blue}`,
    });

    /* ONE resolution PER LIST ENTRY — three entries, three queries, exactly as the [:L73] loop runs. */
    expect(harness.optionQueries.queries).toHaveLength(3);

    /* Every one of them is a single-identifier read of the option entity, and the identifiers arrive in
     * list order with the repeat present TWICE. Asserting the whole sequence rather than a count plus a
     * spot check is what makes both the order and the retained duplicate part of the contract. */
    expect(
      harness.optionQueries.queries.map((query) => ({
        entityName: query.entityName,
        filters: query.whereGroups?.[0]?.filters,
        /* `undefined` rather than an empty array is the honest reading: the identifier query builds no
         * `inFilters` member at all, and stating that here is what would fail if a batch returned. */
        inFilters: query.whereGroups?.[0]?.inFilters,
      })),
    ).toEqual([
      {
        entityName: 'SlatwallOption',
        filters: [{ propertyIdentifier: 'optionID', value: ID.blue }],
        inFilters: undefined,
      },
      {
        entityName: 'SlatwallOption',
        filters: [{ propertyIdentifier: 'optionID', value: ID.red }],
        inFilters: undefined,
      },
      {
        entityName: 'SlatwallOption',
        filters: [{ propertyIdentifier: 'optionID', value: ID.blue }],
        inFilters: undefined,
      },
    ]);

    /* Three combinations from one group of three, in bucket order — duplicates retained. */
    expect(harness.skuRepository.persisted.map(describeOptions)).toEqual([
      ID.blue,
      ID.red,
      ID.blue,
    ]);
  });

  it('NET-NEW refuses a selected option the option boundary cannot resolve', async () => {
    /*
     * [:L74-L75] dereference the lookup result with no guard, so an unresolvable identifier is a
     * runtime failure rather than a silently skipped entry.
     */
    const harness = buildHarness({ resolvableOptions: [] });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await expect(
      harness.service.createSkus(product, {
        price: TEST_MERCHANDISE_PRODUCT_PRICE,
        options: ID.red,
      }),
    ).rejects.toThrow(DomainError);
    expect(harness.skuRepository.persisted).toHaveLength(0);
  });

  it('NET-NEW exposes newSku as an explicitly declared factory rather than a synthesized member', async () => {
    /*
     * IR-1. `newSku()` has no declaration anywhere in the legacy tree: it exists only because
     * `org/Hibachi/HibachiService.cfc:L255-L281` fabricates a `new*` member by prefix at runtime. The
     * combination engine calls it at [:L92], [:L127], [:L154], [:L182] and [:L192], so the port must
     * declare it. TypeScript under `strict` has no equivalent facility and no dynamic fallback is used.
     */
    const harness = buildHarness();
    const sku = harness.service.newSku();

    expect(typeof harness.service.newSku).toBe('function');
    expect(sku).toBeInstanceOf(Sku);
    expect(sku.isNew()).toBe(true);
    /* The managed wrapper carries the error surface the validation path writes findings onto. */
    expect(sku.hasErrors()).toBe(false);
    expect(sku.getErrors()).toEqual({});

    /* Two calls, two distinct entities — never a shared instance. */
    expect(harness.service.newSku()).not.toBe(sku);
    await Promise.resolve();
  });
});

describe('SkuService.createSkus — the merchandise combination odometer', () => {
  /*
   * `model/service/SkuService.cfc:L64-L121` — the largest single business rule in the slice, and the
   * one place where a plausible "tidy-up" changes the generated catalog silently.
   *
   * FIVE LOAD-BEARING WORKING VALUES are set up at [:L66-L70]:
   *
   *   optionGroups        = {}    the buckets, keyed by option-group identifier
   *   totalCombos         = 1     the running product of the bucket sizes
   *   indexedKeys         = []    the DIGIT POSITIONS, in bucket discovery order
   *   currentIndexesByKey = {}    the current digit VALUE per position
   *   keyToChange         = ""    declared and then never read — dead in the legacy, and the port
   *                               omits it rather than carrying a variable nothing consumes
   *
   * None of those is asserted by name below, because they are locals and a test that reached for them
   * would be testing text rather than behaviour. They are pinned through their observable consequences
   * instead: the grouping, the multiplication, and the enumeration order.
   *
   * ⭐ THE FIRST INDEXED GROUP IS THE LEAST-SIGNIFICANT DIGIT. [:L111] starts `changeKeyIndex` at the
   * FIRST element of `indexedKeys`, so the group discovered first is the wheel that turns fastest. Read
   * the other way round — first group as most-significant — the SKU set is identical but the ORDER is
   * not, and per AAP §0.6.2 the order is what decides which sibling each uniqueness read observes.
   */

  it('NET-NEW enumerates combinations in the exact legacy odometer order', async () => {
    const { options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await harness.service.createSkus(product, {
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      options: `${ID.red},${ID.blue},${ID.small},${ID.large}`,
    });

    /*
     * Groups in discovery order are [colour, size]; options within each group keep input order. Colour
     * is therefore the fast wheel: red+small, blue+small, red+large, blue+large — the object-identifier
     * spelling of the A1+B1, A2+B1, A1+B2, A2+B2 sequence.
     */
    expect(harness.skuRepository.persisted.map(describeOptions)).toEqual([
      `${ID.red}+${ID.small}`,
      `${ID.blue}+${ID.small}`,
      `${ID.red}+${ID.large}`,
      `${ID.blue}+${ID.large}`,
    ]);

    /* Nothing re-sorted the result: the write order IS the enumeration order. */
    expect(readProductSkus(product).map(describeOptions)).toEqual(
      harness.skuRepository.persisted.map(describeOptions),
    );
  });

  it('NET-NEW has validation observe siblings in that same odometer order, with no separate sort', async () => {
    /*
     * The uniqueness rule reads through the repository, so the repository's call log is the honest
     * record of what validation saw and when. Each entry's `optionIds` is the SKU's own option list in
     * `Sku.options` order, built by `model/entity/Sku.cfc:L758-L762`.
     */
    const { options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await harness.service.createSkus(product, {
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      options: `${ID.red},${ID.blue},${ID.small},${ID.large}`,
    });

    const readOptionSets = harness.skuRepository.calls
      .filter((call) => call.member === 'findSkusBySelectedOptions')
      .map((call) => call.optionIds.join('+'));

    expect(readOptionSets).toEqual([
      `${ID.red}+${ID.small}`,
      `${ID.blue}+${ID.small}`,
      `${ID.red}+${ID.large}`,
      `${ID.blue}+${ID.large}`,
    ]);
    /* Product scope travels with every read; the DAO's "optional productID" path is unreachable (T2). */
    for (const call of harness.skuRepository.calls) {
      if (call.member === 'findSkusBySelectedOptions') {
        expect(call.productId).toBe(ID.product);
      }
    }
  });

  it('NET-NEW multiplies the combination count across groups and keeps the first group as the fast wheel', async () => {
    /*
     * [:L82-L86] walks the buckets once, appending each key to `indexedKeys` and multiplying
     * `totalCombos` by that bucket's length. Three colours over two sizes is six combinations, and the
     * colour digit still advances on every step.
     */
    const { colorGroup, sizeGroup, options } = buildColorAndSizeOptions();
    const green = buildOption({
      optionID: 'dddd0000000000000000000000000005',
      optionCode: 'green',
      optionGroup: colorGroup,
      sortOrder: 3,
    });
    const harness = buildHarness({ resolvableOptions: [...options, green] });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await harness.service.createSkus(product, {
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      options: `${ID.red},${ID.blue},${green.optionID},${ID.small},${ID.large}`,
    });

    expect(harness.skuRepository.persisted).toHaveLength(6);
    expect(harness.skuRepository.persisted.map(describeOptions)).toEqual([
      `${ID.red}+${ID.small}`,
      `${ID.blue}+${ID.small}`,
      `${green.optionID}+${ID.small}`,
      `${ID.red}+${ID.large}`,
      `${ID.blue}+${ID.large}`,
      `${green.optionID}+${ID.large}`,
    ]);
    expect(sizeGroup.optionGroupID).toBe(ID.sizeGroup);
  });

  it('NET-NEW gives each generated SKU one option per group, a price, and a sequential code suffix', async () => {
    /*
     * [:L93] price; [:L94-L96] the guarded list price; [:L97] the code suffix read from the CURRENT SKU
     * count — and read BEFORE `addSku` at [:L100], which is why the sequence starts at 1 rather than 2;
     * [:L106-L108] exactly one option per group.
     */
    const { colorGroup, sizeGroup, options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await harness.service.createSkus(product, {
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      listPrice: 150,
      options: `${ID.red},${ID.blue},${ID.small},${ID.large}`,
    });

    const generated = harness.skuRepository.persisted;
    expect(generated.map((sku) => sku.skuCode)).toEqual([
      `${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}1`,
      `${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}2`,
      `${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}3`,
      `${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}4`,
    ]);

    for (const sku of generated) {
      expect(sku.price).toBe(String(TEST_MERCHANDISE_PRODUCT_PRICE));
      expect(sku.listPrice).toBe('150');
      expect(sku.product).toBe(product);
      expect(sku.getOptions()).toHaveLength(2);
      const groupIds = sku.getOptions().map((option) => option.optionGroup?.optionGroupID);
      expect(groupIds).toEqual([colorGroup.optionGroupID, sizeGroup.optionGroupID]);
    }
  });

  it('NET-NEW binds the FIRST generated SKU as default only when the product has none', async () => {
    /* [:L101-L103] — `isNull(getDefaultSku())` gates the rebinding; it is not unconditional here. */
    const { options } = buildColorAndSizeOptions();

    const withoutDefault = buildHarness({ resolvableOptions: options });
    const freshProduct = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );
    await withoutDefault.service.createSkus(freshProduct, {
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      options: `${ID.red},${ID.blue}`,
    });
    expect(withoutDefault.defaultSkuBindings).toHaveLength(1);
    expect(requireAt(withoutDefault.defaultSkuBindings, 0, 'the bound default SKU')).toBe(
      requireAt(withoutDefault.skuRepository.persisted, 0, 'the first generated SKU'),
    );
    expect(freshProduct.defaultSku).toBeDefined();

    const withDefault = buildHarness({ resolvableOptions: options });
    const defaultedProduct = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );
    const preExistingDelegate = createDefaultSkuDelegate(buildSku({ price: 5 }));
    defaultedProduct.defaultSku = preExistingDelegate;
    await withDefault.service.createSkus(defaultedProduct, {
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      options: `${ID.red},${ID.blue}`,
    });
    expect(withDefault.defaultSkuBindings).toHaveLength(0);
    expect(defaultedProduct.defaultSku).toBe(preExistingDelegate);
  });

  it('NET-NEW sets the list price only when it reads as numeric and is strictly above zero', async () => {
    /*
     * [:L94] `structKeyExists(data,"listPrice") && isNumeric(data.listPrice) && data.listPrice > 0`.
     * All three tests are load-bearing, and `> 0` is strict: zero is rejected.
     */
    const runWith = async (data: Record<string, unknown>): Promise<string> => {
      const harness = buildHarness();
      const product = buildEmptyProduct(
        buildSeededProductType(
          MERCHANDISE_PRODUCT_TYPE.systemCode,
          MERCHANDISE_PRODUCT_TYPE.productTypeID,
        ),
      );
      await harness.service.createSkus(product, { price: TEST_MERCHANDISE_PRODUCT_PRICE, ...data });

      return requireAt(harness.skuRepository.persisted, 0, 'the created SKU').listPrice;
    };

    await expect(runWith({})).resolves.toBe('0');
    await expect(runWith({ listPrice: 0 })).resolves.toBe('0');
    await expect(runWith({ listPrice: -5 })).resolves.toBe('0');
    await expect(runWith({ listPrice: 'not a number' })).resolves.toBe('0');
    await expect(runWith({ listPrice: 150 })).resolves.toBe('150');
    await expect(runWith({ listPrice: '19.99' })).resolves.toBe('19.99');
  });

  it('NET-NEW falls through to a single SKU when no options were selected', async () => {
    /*
     * [:L125-L136]. Four differences from the odometer branch, all observable: the product relation is
     * set FIRST at [:L128], the suffix is the constant `-1` at [:L133], the default SKU is rebound
     * UNCONDITIONALLY at [:L134], and no option is attached at all.
     */
    const harness = buildHarness();
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    const created = await harness.service.createSkus(product, {
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      listPrice: 120,
    });

    expect(created).toBe(true);
    expect(harness.skuRepository.persisted).toHaveLength(1);
    const only = requireAt(harness.skuRepository.persisted, 0, 'the single SKU');
    expect(only.skuCode).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}1`);
    expect(only.price).toBe(String(TEST_MERCHANDISE_PRODUCT_PRICE));
    expect(only.listPrice).toBe('120');
    expect(only.product).toBe(product);
    expect(only.getOptions()).toEqual([]);
    expect(harness.defaultSkuBindings).toEqual([only]);
    /* No option boundary is consulted on this branch at all. */
    expect(harness.optionQueries.queries).toHaveLength(0);
  });
});

describe('SkuService.createSkus — the subscription branch', () => {
  /*
   * `model/service/SkuService.cfc:L139-L170`. The two out-of-scope collaborators this branch reached —
   * the subscription service's term and benefit lookups, both synthesized by `onMissingMethod` — are
   * crossed through the declared `SubscriptionTermPort` (TR-5), never through a service locator.
   */

  const buildSubscriptionProduct = (): Product =>
    buildEmptyProduct(
      buildSeededProductType(
        SUBSCRIPTION_PRODUCT_TYPE.systemCode,
        SUBSCRIPTION_PRODUCT_TYPE.productTypeID,
      ),
    );

  it('NET-NEW accumulates BOTH precondition errors before the single gate, without short-circuiting', async () => {
    /*
     * [:L142-L149] are two INDEPENDENT `if` statements, each adding its own error, and only [:L152]
     * gates on `hasErrors()`. A reader who folded them into one guard, or who returned after the first,
     * would report one error where the legacy reports two — and `model/validation/Product.json` keys
     * them separately, so both are observable.
     *
     * `,,,` is used for one of them on purpose: `listLen(",,,")` is zero because CFML's list functions
     * DROP empty entries, so a value that is present and non-empty as text still fails the guard.
     */
    const harness = buildHarness();
    const product = buildSubscriptionProduct();

    const created = await harness.service.createSkus(product, {
      price: 25,
      subscriptionBenefits: ',,,',
    });

    expect(created).toBe(true);
    expect(product.hasErrors()).toBe(true);
    expect(product.getError('subscriptionBenefits')).toEqual([
      SUBSCRIPTION_BENEFITS_REQUIRED_RBKEY,
    ]);
    expect(product.getError('subscriptionTerms')).toEqual([SUBSCRIPTION_TERMS_REQUIRED_RBKEY]);
    /* The gate precedes every port call and every SKU, so neither happened. */
    expect(harness.subscriptionTerms.calls).toHaveLength(0);
    expect(harness.skuRepository.persisted).toHaveLength(0);
    expect(harness.defaultSkuBindings).toHaveLength(0);
  });

  it('NET-NEW reports only the missing side when one precondition is satisfied', async () => {
    const harness = buildHarness({ subscriptionBenefitIDs: [ID.benefit] });
    const product = buildSubscriptionProduct();

    await harness.service.createSkus(product, {
      price: 25,
      subscriptionBenefits: ID.benefit,
    });

    expect(product.hasError('subscriptionBenefits')).toBe(false);
    expect(product.getError('subscriptionTerms')).toEqual([SUBSCRIPTION_TERMS_REQUIRED_RBKEY]);
    expect(harness.skuRepository.persisted).toHaveLength(0);
  });

  it('NET-NEW creates one SKU per term, with price and renewal price both taking the same value', async () => {
    /*
     * [:L153-L169]. `setPrice` at [:L156] and `setRenewalPrice` at [:L157] read the SAME
     * `data.price`; there is no separate renewal price in the creation data.
     *
     * ⭐ PARITY: THE SUBSCRIPTION CODE SUFFIX STARTS AT 2, NOT 1. `setProduct` at [:L155] APPENDS to
     * `product.getSkus()`, and [:L159] then reads `arrayLen(arguments.product.getSkus()) + 1` — so the
     * SKU being built is already counted. The merchandise branch reads the same expression at [:L97]
     * but calls `addSku` AFTERWARDS at [:L100], which is why that branch starts at 1. The asymmetry is
     * real, it is observable in stored SKU codes, and it is carried rather than harmonised.
     */
    const harness = buildHarness({
      subscriptionTermIDs: [ID.monthlyTerm, ID.annualTerm],
      subscriptionBenefitIDs: [ID.benefit, ID.renewalBenefit],
    });
    const product = buildSubscriptionProduct();

    const created = await harness.service.createSkus(product, {
      price: 25,
      subscriptionBenefits: ID.benefit,
      subscriptionTerms: `${ID.monthlyTerm},${ID.annualTerm}`,
      renewalSubscriptionBenefits: ID.renewalBenefit,
    });

    expect(created).toBe(true);
    expect(product.hasErrors()).toBe(false);
    expect(harness.skuRepository.persisted).toHaveLength(2);

    const [first, second] = [
      requireAt(harness.skuRepository.persisted, 0, 'the monthly-term SKU'),
      requireAt(harness.skuRepository.persisted, 1, 'the annual-term SKU'),
    ];

    expect(first.price).toBe('25');
    expect(first.renewalPrice).toBe('25');
    expect(second.price).toBe('25');
    expect(second.renewalPrice).toBe('25');

    expect(first.subscriptionTerm).toEqual({ subscriptionTermID: ID.monthlyTerm });
    expect(second.subscriptionTerm).toEqual({ subscriptionTermID: ID.annualTerm });

    expect(first.subscriptionBenefits).toEqual([{ subscriptionBenefitID: ID.benefit }]);
    expect(first.renewalSubscriptionBenefits).toEqual([
      { subscriptionBenefitID: ID.renewalBenefit },
    ]);
    expect(second.subscriptionBenefits).toEqual([{ subscriptionBenefitID: ID.benefit }]);

    expect(first.skuCode).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}2`);
    expect(second.skuCode).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}3`);

    expect(first.product).toBe(product);
    expect(harness.defaultSkuBindings).toEqual([first]);
  });

  it('NET-NEW resolves terms and both benefit families through the explicit subscription port', async () => {
    /*
     * The legacy issues one lookup per list entry at [:L158], [:L161] and [:L164]. The port batches
     * each family once and then resolves any miss individually, so the observable contract is: the term
     * family is asked for, and BOTH benefit families are asked for separately — renewal benefits are
     * not folded into the primary set.
     */
    const harness = buildHarness({
      subscriptionTermIDs: [ID.monthlyTerm],
      subscriptionBenefitIDs: [ID.benefit, ID.renewalBenefit],
    });
    const product = buildSubscriptionProduct();

    await harness.service.createSkus(product, {
      price: 25,
      subscriptionBenefits: ID.benefit,
      subscriptionTerms: ID.monthlyTerm,
      renewalSubscriptionBenefits: ID.renewalBenefit,
    });

    const batchedMembers = harness.subscriptionTerms.calls.map((call) => call.member);
    expect(batchedMembers).toEqual([
      'getSubscriptionTermsByIDs',
      'getSubscriptionBenefitsByIDs',
      'getSubscriptionBenefitsByIDs',
    ]);

    const termCall = requireAt(harness.subscriptionTerms.calls, 0, 'the term batch');
    expect(termCall.member === 'getSubscriptionTermsByIDs' && termCall.subscriptionTermIDs).toEqual(
      [ID.monthlyTerm],
    );

    const benefitCall = requireAt(harness.subscriptionTerms.calls, 1, 'the benefit batch');
    expect(
      benefitCall.member === 'getSubscriptionBenefitsByIDs' && benefitCall.subscriptionBenefitIDs,
    ).toEqual([ID.benefit]);

    const renewalCall = requireAt(harness.subscriptionTerms.calls, 2, 'the renewal-benefit batch');
    expect(
      renewalCall.member === 'getSubscriptionBenefitsByIDs' && renewalCall.subscriptionBenefitIDs,
    ).toEqual([ID.renewalBenefit]);
  });

  it('NET-NEW reads the renewal-benefit key unguarded AFTER the gate, so an absent key raises', async () => {
    /*
     * [:L163] loops `listLen(arguments.data.renewalSubscriptionBenefits)` with no `structKeyExists`
     * test, and it sits AFTER the [:L152] gate. So a payload that satisfies both preconditions and then
     * omits the renewal key fails at that read — not with a validation error, but by raising.
     */
    const harness = buildHarness({
      subscriptionTermIDs: [ID.monthlyTerm],
      subscriptionBenefitIDs: [ID.benefit],
    });
    const product = buildSubscriptionProduct();

    await expect(
      harness.service.createSkus(product, {
        price: 25,
        subscriptionBenefits: ID.benefit,
        subscriptionTerms: ID.monthlyTerm,
      }),
    ).rejects.toThrow(DomainError);
    /* The gate itself passed — this is not a precondition failure. */
    expect(product.hasErrors()).toBe(false);
    expect(harness.skuRepository.persisted).toHaveLength(0);
  });

  it('NET-NEW refuses a term or benefit the subscription port cannot resolve', async () => {
    const unknownTerm = buildHarness({ subscriptionBenefitIDs: [ID.benefit, ID.renewalBenefit] });
    await expect(
      unknownTerm.service.createSkus(buildSubscriptionProduct(), {
        price: 25,
        subscriptionBenefits: ID.benefit,
        subscriptionTerms: ID.monthlyTerm,
        renewalSubscriptionBenefits: ID.renewalBenefit,
      }),
    ).rejects.toThrow(DomainError);

    const unknownBenefit = buildHarness({ subscriptionTermIDs: [ID.monthlyTerm] });
    await expect(
      unknownBenefit.service.createSkus(buildSubscriptionProduct(), {
        price: 25,
        subscriptionBenefits: ID.benefit,
        subscriptionTerms: ID.monthlyTerm,
        renewalSubscriptionBenefits: ID.renewalBenefit,
      }),
    ).rejects.toThrow(DomainError);
  });
});

describe('SkuService.createSkus — the content-access branch', () => {
  /*
   * `model/service/SkuService.cfc:L173-L201`. The content lookup at [:L187] and [:L196] is another
   * `onMissingMethod` member on an out-of-scope service; it is crossed through the declared
   * `AccessContentPort`.
   */

  const buildContentAccessProduct = (): Product =>
    buildEmptyProduct(
      buildSeededProductType(
        CONTENT_ACCESS_PRODUCT_TYPE.systemCode,
        CONTENT_ACCESS_PRODUCT_TYPE.productTypeID,
      ),
    );

  it('NET-NEW accumulates the missing-content error before the single gate', async () => {
    /* [:L175-L177] adds the error; [:L180] is the only gate. */
    const harness = buildHarness();
    const product = buildContentAccessProduct();

    const created = await harness.service.createSkus(product, { price: 40 });

    expect(created).toBe(true);
    expect(product.getError('accessContents')).toEqual([ACCESS_CONTENTS_REQUIRED_RBKEY]);
    expect(harness.accessContents.requestedContentIds).toHaveLength(0);
    expect(harness.skuRepository.persisted).toHaveLength(0);
  });

  it('NET-NEW bundles every access content onto ONE SKU and rebinds the default unconditionally', async () => {
    /*
     * [:L181-L189]. The suffix is the constant `-1` at [:L184] and the default rebinding at [:L189] is
     * UNCONDITIONAL — unlike the merchandise odometer, which gates it.
     */
    const harness = buildHarness({ contentIDs: [ID.firstContent, ID.secondContent] });
    const product = buildContentAccessProduct();
    const preExistingDelegate = createDefaultSkuDelegate(buildSku({ price: 1 }));
    product.defaultSku = preExistingDelegate;

    const created = await harness.service.createSkus(product, {
      price: 40,
      accessContents: `${ID.firstContent},${ID.secondContent}`,
      bundleContentAccess: true,
    });

    expect(created).toBe(true);
    expect(harness.skuRepository.persisted).toHaveLength(1);
    const bundled = requireAt(harness.skuRepository.persisted, 0, 'the bundled SKU');
    expect(bundled.skuCode).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}1`);
    expect(bundled.price).toBe('40');
    expect(bundled.product).toBe(product);
    expect(bundled.accessContents).toEqual([
      { contentID: ID.firstContent },
      { contentID: ID.secondContent },
    ]);
    expect(harness.defaultSkuBindings).toEqual([bundled]);
    expect(product.defaultSku).not.toBe(preExistingDelegate);
  });

  it('NET-NEW creates one SKU per access content and makes the FIRST content the default', async () => {
    /*
     * [:L191-L200]. The suffix is the LOOP COUNTER at [:L194], so codes restart at `-1` regardless of
     * how many SKUs the product already has, and only `c == 1` at [:L197] rebinds the default.
     */
    const harness = buildHarness({ contentIDs: [ID.firstContent, ID.secondContent] });
    const product = buildContentAccessProduct();

    const created = await harness.service.createSkus(product, {
      price: 40,
      accessContents: `${ID.firstContent},${ID.secondContent}`,
    });

    expect(created).toBe(true);
    expect(harness.skuRepository.persisted).toHaveLength(2);

    const first = requireAt(harness.skuRepository.persisted, 0, "the first content's SKU");
    const second = requireAt(harness.skuRepository.persisted, 1, "the second content's SKU");

    expect(first.skuCode).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}1`);
    expect(second.skuCode).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}2`);
    expect(first.accessContents).toEqual([{ contentID: ID.firstContent }]);
    expect(second.accessContents).toEqual([{ contentID: ID.secondContent }]);
    expect(first.product).toBe(product);
    expect(second.product).toBe(product);
    /* The FIRST access content's SKU is the default, and it is bound exactly once. */
    expect(harness.defaultSkuBindings).toEqual([first]);
  });

  it('NET-NEW treats the bundle flag as absent-means-unbundled and refuses a non-boolean value', async () => {
    /*
     * [:L181] `structKeyExists(data,"bundleContentAccess") && data.bundleContentAccess`. An absent key
     * takes the per-content branch; a value CFML cannot read as a boolean raises there, and does here.
     */
    const absent = buildHarness({ contentIDs: [ID.firstContent, ID.secondContent] });
    await absent.service.createSkus(buildContentAccessProduct(), {
      price: 40,
      accessContents: `${ID.firstContent},${ID.secondContent}`,
    });
    expect(absent.skuRepository.persisted).toHaveLength(2);

    const falsey = buildHarness({ contentIDs: [ID.firstContent, ID.secondContent] });
    await falsey.service.createSkus(buildContentAccessProduct(), {
      price: 40,
      accessContents: `${ID.firstContent},${ID.secondContent}`,
      bundleContentAccess: 'no',
    });
    expect(falsey.skuRepository.persisted).toHaveLength(2);

    const unreadable = buildHarness({ contentIDs: [ID.firstContent] });
    await expect(
      unreadable.service.createSkus(buildContentAccessProduct(), {
        price: 40,
        accessContents: ID.firstContent,
        bundleContentAccess: 'perhaps',
      }),
    ).rejects.toThrow(DomainError);
  });

  it('NET-NEW refuses an access content the port cannot resolve', async () => {
    const harness = buildHarness({ contentIDs: [] });

    await expect(
      harness.service.createSkus(buildContentAccessProduct(), {
        price: 40,
        accessContents: ID.firstContent,
      }),
    ).rejects.toThrow(DomainError);
    expect(harness.accessContents.requestedContentIds).toContain(ID.firstContent);
  });

  it('NET-NEW returns true from the one unconditional success return on every recognised branch', async () => {
    /*
     * [:L207] sits OUTSIDE every branch and is the sole `return true`. It carries no failure signal in
     * either system: the legacy caller decides success by reading `product.hasErrors()`, which is why
     * the precondition cases above also resolve `true`.
     */
    const merchandise = buildHarness();
    await expect(
      merchandise.service.createSkus(
        buildEmptyProduct(
          buildSeededProductType(
            MERCHANDISE_PRODUCT_TYPE.systemCode,
            MERCHANDISE_PRODUCT_TYPE.productTypeID,
          ),
        ),
        { price: 10 },
      ),
    ).resolves.toBe(true);

    const subscription = buildHarness({
      subscriptionTermIDs: [ID.monthlyTerm],
      subscriptionBenefitIDs: [ID.benefit, ID.renewalBenefit],
    });
    await expect(
      subscription.service.createSkus(
        buildEmptyProduct(
          buildSeededProductType(
            SUBSCRIPTION_PRODUCT_TYPE.systemCode,
            SUBSCRIPTION_PRODUCT_TYPE.productTypeID,
          ),
        ),
        {
          price: 10,
          subscriptionBenefits: ID.benefit,
          subscriptionTerms: ID.monthlyTerm,
          renewalSubscriptionBenefits: ID.renewalBenefit,
        },
      ),
    ).resolves.toBe(true);

    const contentAccess = buildHarness({ contentIDs: [ID.firstContent] });
    await expect(
      contentAccess.service.createSkus(buildContentAccessProduct(), {
        price: 10,
        accessContents: ID.firstContent,
      }),
    ).resolves.toBe(true);
  });
});

describe('SkuService.createSkus — M6: the validation read-back contract (AAP §0.6.2)', () => {
  /*
   * ⭐⭐ THE HIGHEST-RISK ITEM IN THE SLICE, AND THE ONE A FAITHFUL-LOOKING PORT GETS WRONG SILENTLY.
   *
   * `model/validation/Sku.json:L6` registers `hasUniqueOptions` as a METHOD rule for the save context,
   * and `model/entity/Sku.cfc:L756-L769` implements it by RUNNING A QUERY: it asks its product for the
   * SKUs matching its own option set, which lands in `model/dao/SkuDAO.cfc:L106-L128`. So validating one
   * SKU of a combination batch READS BACK the rows the same operation is writing.
   *
   * Under CFML the rule observed whatever the Hibernate session had already flushed, so correctness
   * depended on flush timing and on the order the batch was persisted in. Under TypeScript with
   * `mysql2` there is no session and no automatic flush, which means the ordering has to be an explicit
   * decision — and the wrong decision produces DIFFERENT RESULTS with no error and no compile failure.
   *
   * The landed order is: for each SKU, in odometer order — VALIDATE it, then WRITE it, then move to the
   * next. So SKU i's uniqueness read observes siblings 1..i-1 and never itself. The two naive
   * alternatives both diverge:
   *
   *   insert-all-then-validate   every read sees the whole batch, so the FIRST SKU is rejected too
   *   validate-before-any-insert every read sees nothing, so a DUPLICATE SKU IS ACCEPTED
   *
   * The cases below pin the landed order, and the LAST TWO run all three orderings side by side so the
   * discrimination is a permanent artefact of the suite rather than a claim in a comment. They are two
   * cases rather than one because "all three orderings disagree" and "the SERVICE implements the first of
   * them" are separate claims, and only the second one can detect drift in `SkuService`:
   *
   *   • the SEQUENCER-MODEL guard drives `createSkuBatchSequencer` — a `test/support` model of the three
   *     orderings — over the real uniqueness rule and the real repository write. It proves the three
   *     orderings genuinely disagree, which is what makes the ordering worth pinning at all. It does NOT
   *     touch `SkuService`, so it cannot notice if the service stopped using the landed one.
   *   • the SERVICE-DRIVEN proof drives the real `SkuService.createSkus` three times over a repository
   *     whose ONLY difference between runs is what a read-back OBSERVES, and then asserts that the
   *     service's own verdicts equal the model's `legacyOrder` verdicts. That equality is the bridge
   *     between the model and the production interleave, and it is what fails if
   *     `SkuService.validateNewSku`'s validate-then-write order is ever reordered.
   */

  const buildMerchandiseProduct = (productID: string = ID.product): Product =>
    buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
      productID,
    );

  /** The read/write interleave, as the repository observed it. */
  const readWriteTrace = (harness: Harness): string[] =>
    harness.skuRepository.calls.flatMap((call) => {
      if (call.member === 'findSkusBySelectedOptions') {
        return [`read:${call.optionIds.join('+')}`];
      }
      if (call.member === 'persistSku') {
        return [`write:${describeOptions(call.sku)}`];
      }

      return [];
    });

  it('NET-NEW writes each SKU after its own validation and before the next SKU is validated', async () => {
    const { options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildMerchandiseProduct();

    await harness.service.createSkus(product, {
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      options: `${ID.red},${ID.blue},${ID.small},${ID.large}`,
    });

    /*
     * Strict alternation, four times, in odometer order. Nothing is batched, nothing is hoisted, no
     * `Promise.all` fans the reads out, and no read is served from a snapshot taken before the batch.
     */
    expect(readWriteTrace(harness)).toEqual([
      `read:${ID.red}+${ID.small}`,
      `write:${ID.red}+${ID.small}`,
      `read:${ID.blue}+${ID.small}`,
      `write:${ID.blue}+${ID.small}`,
      `read:${ID.red}+${ID.large}`,
      `write:${ID.red}+${ID.large}`,
      `read:${ID.blue}+${ID.large}`,
      `write:${ID.blue}+${ID.large}`,
    ]);

    /* One read per SKU — the method rule is invoked once each, never once for the batch. */
    const reads = harness.skuRepository.calls.filter(
      (call) => call.member === 'findSkusBySelectedOptions',
    );
    const writes = harness.skuRepository.calls.filter((call) => call.member === 'persistSku');
    expect(reads).toHaveLength(4);
    expect(writes).toHaveLength(4);

    /* Four genuinely distinct combinations, so nothing here is rejected. */
    expect(skuBatchHasErrors(product)).toBe(false);
    expect(collectSkuBatchErrors(product)).toEqual({});
  });

  it('NET-NEW rejects the later duplicate combination and ONLY the later one', async () => {
    /*
     * ⭐ THIS IS THE DISCRIMINATING CASE. Feeding the same option twice makes the odometer produce two
     * SKUs carrying an identical option set — `model/service/SkuService.cfc:L78` appends
     * unconditionally, so a repeated selection is a repeated bucket entry (T1).
     *
     * Under the landed order:  SKU 1's read sees nothing        -> unique;
     *                          SKU 2's read sees SKU 1's row    -> NOT unique.
     * Under insert-all-then-validate: SKU 1's read sees BOTH rows -> SKU 1 is rejected as well, so the
     *                          FIRST assertion below fails.
     * Under validate-before-any-insert: both reads see nothing   -> SKU 2 is accepted, so the SECOND
     *                          assertion below fails.
     *
     * Neither naive strategy can satisfy both assertions, which is what makes this case a real proof
     * rather than a happy path.
     */
    const { options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildMerchandiseProduct();

    await harness.service.createSkus(product, {
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      options: `${ID.red},${ID.red}`,
    });

    expect(harness.skuRepository.persisted).toHaveLength(2);
    expect(readWriteTrace(harness)).toEqual([
      `read:${ID.red}`,
      `write:${ID.red}`,
      `read:${ID.red}`,
      `write:${ID.red}`,
    ]);

    const findings = collectSkuBatchErrors(product);
    /*
     * `options` is the property both method rules report under, per `model/validation/Sku.json:L6-L7`.
     * Exactly ONE message: only `hasUniqueOptions` failed, because a single group cannot violate
     * `hasOneOptionPerOptionGroup`.
     */
    expect(findings.options).toHaveLength(1);
    expect(skuBatchHasErrors(product)).toBe(true);

    /*
     * And it is the SECOND SKU that carries it. Read off the product's own SKU members so the assertion
     * is about which entity holds the finding, not merely that the batch holds one somewhere.
     */
    const members = readProductSkus(product);
    expect(members).toHaveLength(2);
    const firstErrors = collectSkuBatchErrors(
      Object.assign(buildMerchandiseProduct(ID.otherProduct), {
        skus: [requireAt(members, 0, 'the first generated SKU')],
      }),
    );
    const secondErrors = collectSkuBatchErrors(
      Object.assign(buildMerchandiseProduct(ID.otherProduct), {
        skus: [requireAt(members, 1, 'the second generated SKU')],
      }),
    );
    expect(firstErrors).toEqual({});
    expect(secondErrors.options).toHaveLength(1);
  });

  it('NET-NEW keeps the whole read-and-write batch inside ONE real UnitOfWork transaction', async () => {
    /*
     * The other half of the M6 contract: "all in the SAME transaction". That half lives in
     * `src/adapters/mysql/UnitOfWork.ts` and nowhere else, so this case instantiates the REAL class
     * over the local driver probe rather than a unit-of-work double.
     *
     * `UnitOfWork.run` acquires one connection, opens ONE transaction, runs the work, and commits when
     * the caller's error gate reports nothing — the explicit replacement for the legacy implicit
     * request-end `ormFlush()` gated on `getORMHasErrors()` (M5).
     */
    const { options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildMerchandiseProduct();
    const probe = createDriverProbe();
    const unitOfWork = new UnitOfWork(probe.pool);

    const created = await unitOfWork.run(
      () =>
        harness.service.createSkus(product, {
          price: TEST_MERCHANDISE_PRODUCT_PRICE,
          options: `${ID.red},${ID.blue},${ID.small},${ID.large}`,
        }),
      () => skuBatchHasErrors(product),
    );

    expect(created).toBe(true);
    expect(probe.lifecycle).toEqual(['getConnection', 'begin', 'commit', 'release']);
    expect(readWriteTrace(harness)).toHaveLength(8);
  });

  it('NET-NEW M6 — the REAL adapter runs EVERY statement on the boundary connection, never the pool', async () => {
    /*
     * ===============================================================================================
     * THE HALF OF M6 THAT NOTHING ELSE IN THIS SUITE COULD SEE
     * ===============================================================================================
     * Every other case here drives the IN-MEMORY SKU repository, so no statement is ever issued and no
     * executor is ever consulted. `MySqlSkuRepository.withExecutor` — the member that adopts a
     * boundary's connection — is therefore invisible to the rest of THIS file, and its own adapter suite
     * exercises it one repository at a time rather than through the service that opens the boundary. What
     * only this case can see is the composed path: the service layer driving the REAL adapter inside a
     * REAL transaction. A repository that stayed pool-bound inside a transaction would read and write on
     * a DIFFERENT connection: it could not see the boundary's uncommitted sibling SKUs (which is
     * precisely the M6 read-back the case above proves at the service layer) and a rollback could not
     * take its writes back. That is a silent, total failure of the contract this checkpoint exists to
     * protect, so it gets an assertion here as well as in the adapter suite.
     *
     * ⭐ THIS CASE IS A MINIATURE COMPOSITION ROOT, DELIBERATELY. It builds the graph the way
     * `src/config/container.ts` will: the concrete adapters are constructed ONCE against the pool, and
     * then re-bound per boundary inside `buildGraph`. `runScoped` exists for exactly that shape — the
     * graph is a function of the scope — so using it here is not test scaffolding, it is the intended
     * call sequence executed early.
     *
     * ⚠️ BOTH RE-BINDABLE COLLABORATORS ARE RE-BOUND, because both read inside the boundary.
     * `MySqlSkuRepository` serves the `hasUniqueOptions` read-back and the writes;
     * `UniquePropertyChecker` serves the `skuCode` uniqueness rule declared at
     * `model/validation/Sku.json:L4`. A test that re-bound only the repository would leave the
     * uniqueness read on the pool and still pass, so it would document half a contract.
     *
     * ⛔ AND THE POOL IS POISONED RATHER THAN MERELY WATCHED. `createDriverProbe` rejects any statement
     * that arrives on the pool channel, so a graph that failed to re-bind fails LOUDLY with
     * `POOL EXECUTOR USED` instead of quietly succeeding against the wrong connection. The
     * emptiness assertion below is the readable form of the same fact; the rejection is what makes it
     * impossible to pass by accident.
     *
     * TEST PROVENANCE: NET-NEW. AAP 0.6.5.2 records that no legacy service test exists for this slice,
     * and the legacy has no analogue of this contract at all — Hibachi's implicit request-end flush had
     * no per-boundary executor to bind.
     */
    const { options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildMerchandiseProduct();
    const probe = createDriverProbe();
    const unitOfWork = new UnitOfWork(probe.pool);

    /*
     * The pool-bound graph a composition root builds once per container: the REAL `QueryRunner` over the
     * REAL pool seam, not a hand-written executor double. Nothing in this test is allowed to succeed
     * through it.
     */
    const poolExecutor = new QueryRunner(probe.pool);
    const poolBoundRepository = new MySqlSkuRepository(
      poolExecutor,
      createOptionGroupSortOrderMemo(),
      harness.productTypeRoots.resolver,
      /* The unauthenticated case, which is what `org/Hibachi/HibachiObject.cfc:L74-L76` yields. */
      { getCurrentAccount: () => undefined },
    );
    const poolBoundChecker = new UniquePropertyChecker(poolExecutor);

    let scopeExecutor: unknown;
    let boundRepository: MySqlSkuRepository | undefined;

    const created = await unitOfWork.runScoped(
      (scope) => {
        scopeExecutor = scope.executor;
        boundRepository = poolBoundRepository.withExecutor(scope.executor);

        return new SkuService(
          boundRepository,
          harness.optionService,
          harness.subscriptionTerms.subscriptionTerms,
          harness.accessContents.accessContents,
          harness.imagePaths.imagePaths,
          harness.skuQueries.smartList,
          new Validator(poolBoundChecker.withExecutor(scope.executor)),
          harness.productTypeRoots.resolver,
          createDefaultSkuDelegate,
          GENEROUS_COMBINATION_BUDGET,
        );
      },
      (service) =>
        service.createSkus(product, {
          price: TEST_MERCHANDISE_PRODUCT_PRICE,
          /* Two combinations: two colours across one size, so a SECOND SKU exists to read back for. */
          options: `${ID.red},${ID.blue},${ID.small}`,
        }),
      () => skuBatchHasErrors(product),
    );

    expect(created).toBe(true);
    expect(skuBatchHasErrors(product)).toBe(false);
    expect(probe.lifecycle).toEqual(['getConnection', 'begin', 'commit', 'release']);

    /* [1] NOTHING BYPASSED THE BOUNDARY. */
    expect(probe.statements.filter((statement) => statement.channel === 'pool')).toEqual([]);
    expect(probe.statements.length).toBeGreaterThan(0);

    /* [2] THE GRAPH ADOPTED THE SCOPE'S OWN EXECUTOR, and did so by producing a NEW instance rather
     * than by mutating the pool-bound one — the distinction `withExecutor` documents (M7). */
    expect(scopeExecutor).toBeDefined();
    expect(boundRepository).toBeDefined();
    expect(boundRepository).not.toBe(poolBoundRepository);

    /* [3] THE STATEMENTS ARE THE REAL ADAPTER'S, so this is the ported SQL rather than a double's. */
    const transactional = probe.statements.filter(
      (statement) => statement.channel === 'transaction',
    );
    const indicesWhere = (predicate: (sql: string) => boolean): number[] =>
      transactional.reduce<number[]>(
        (found, statement, index) => (predicate(statement.sql) ? [...found, index] : found),
        [],
      );

    /* `MySqlSkuRepository.findSkusBySelectedOptions` — the M6 read-back, T1 through T5 (AAP 0.3.3.1). */
    const readBacks = indicesWhere((sql) => sql.startsWith('SELECT DISTINCT s.skuID'));
    /* `UniquePropertyChecker.isUniqueProperty` — `model/validation/Sku.json:L4`'s `skuCode` rule. */
    const uniquenessReads = indicesWhere((sql) => sql.startsWith('SELECT 1 FROM SwSku e'));
    /* `MySqlSkuRepository.persistSku`'s insert-or-update probe, then the row, then the option links. */
    const existenceProbes = indicesWhere(
      (sql) => sql === 'SELECT skuID FROM SwSku WHERE skuID = ?',
    );
    const skuRowWrites = indicesWhere((sql) => sql.startsWith('INSERT INTO SwSku ('));
    const linkWrites = indicesWhere((sql) => sql.startsWith('INSERT INTO SwSkuOption'));

    /* One of each, per SKU, for the two combinations the odometer produced — and NOTHING ELSE, so an
     * extra round trip introduced anywhere in this path shows up here rather than passing unnoticed. */
    expect(readBacks).toHaveLength(2);
    expect(uniquenessReads).toHaveLength(2);
    expect(existenceProbes).toHaveLength(2);
    expect(skuRowWrites).toHaveLength(2);
    expect(linkWrites).toHaveLength(2);
    expect(transactional).toHaveLength(10);

    /* [4] THE INTERLEAVE IS THE POINT OF M6: the second SKU's uniqueness read-back is issued AFTER the
     * first SKU's row and option links were written, on the SAME connection, so the legacy's
     * flush-then-query visibility is reproduced rather than approximated. */
    expect(requireAt(readBacks, 0, 'the first read-back')).toBeLessThan(
      requireAt(skuRowWrites, 0, 'the first SKU row write'),
    );
    expect(requireAt(readBacks, 1, 'the second read-back')).toBeGreaterThan(
      requireAt(linkWrites, 0, 'the first option-link write'),
    );

    /* [5] TR-4 — every value travelled as a bound parameter on the transaction channel. */
    for (const statement of transactional) {
      expect((statement.sql.match(/\?/g) ?? []).length).toBe(statement.params.length);
      expect(statement.sql).not.toContain("'");
    }
  });

  it('NET-NEW M6 — a graph that stays pool-bound inside the boundary FAILS rather than passing quietly', async () => {
    /*
     * The negative twin of the case above, and the reason the pool channel is poisoned rather than
     * merely counted. Here the graph is built with the pool-bound repository ON PURPOSE — which is
     * exactly the state a `withExecutor` that ignored its argument would produce — and the boundary must
     * refuse the work instead of committing it against the wrong connection.
     *
     * Without this case the emptiness assertion above could still be satisfied by a suite in which no
     * statement was ever issued at all, so this is what proves the probe can actually tell the two
     * situations apart.
     */
    const { options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildMerchandiseProduct();
    const probe = createDriverProbe();
    const unitOfWork = new UnitOfWork(probe.pool);

    const poolExecutor = new QueryRunner(probe.pool);
    const poolBoundRepository = new MySqlSkuRepository(
      poolExecutor,
      createOptionGroupSortOrderMemo(),
      harness.productTypeRoots.resolver,
      { getCurrentAccount: () => undefined },
    );

    await expect(
      unitOfWork.runScoped(
        () =>
          new SkuService(
            poolBoundRepository,
            harness.optionService,
            harness.subscriptionTerms.subscriptionTerms,
            harness.accessContents.accessContents,
            harness.imagePaths.imagePaths,
            harness.skuQueries.smartList,
            harness.validation.validator,
            harness.productTypeRoots.resolver,
            createDefaultSkuDelegate,
            GENEROUS_COMBINATION_BUDGET,
          ),
        (service) =>
          service.createSkus(product, {
            price: TEST_MERCHANDISE_PRODUCT_PRICE,
            options: `${ID.red},${ID.blue},${ID.small}`,
          }),
        () => skuBatchHasErrors(product),
      ),
    ).rejects.toThrow(POOL_EXECUTOR_USED_MESSAGE);

    /* The boundary unwound rather than committing, and the offending statement is on record. */
    expect(probe.lifecycle).toEqual(['getConnection', 'begin', 'rollback', 'release']);
    expect(probe.statements.filter((statement) => statement.channel === 'pool')).not.toEqual([]);
  });

  it('NET-NEW rolls the whole boundary back when the batch accumulated a finding, keeping the errors', async () => {
    /*
     * The retention contract, stated exactly where it lives. `validateNewSku` writes each SKU
     * UNCONDITIONALLY — the legacy stages an invalid entity in the ORM session just the same, because
     * `addSku` at [:L100] is not gated on validation either. What decides whether a write is KEPT is the
     * commit gate: `getORMHasErrors()` in the legacy, `skuBatchHasErrors(product)` here.
     *
     * So an invalid SKU keeps its findings AND nothing the batch wrote survives the boundary. Asserting
     * "the invalid SKU was never written" at the repository would be asserting a contract neither system
     * has; asserting the rollback is the honest form of the same guarantee.
     */
    const { options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildMerchandiseProduct();
    const probe = createDriverProbe();
    const unitOfWork = new UnitOfWork(probe.pool);

    await expect(
      unitOfWork.run(
        () =>
          harness.service.createSkus(product, {
            price: TEST_MERCHANDISE_PRODUCT_PRICE,
            options: `${ID.red},${ID.red}`,
          }),
        () => skuBatchHasErrors(product),
      ),
    ).rejects.toThrow(DomainError);

    expect(probe.lifecycle).toEqual(['getConnection', 'begin', 'rollback', 'release']);
    /* The findings stay attached to the SKU that produced them after the boundary unwound. */
    expect(collectSkuBatchErrors(product).options).toHaveLength(1);
  });

  it('NET-NEW the Validator itself only reads — it never writes', async () => {
    /*
     * `org/Hibachi/HibachiValidationService.cfc` takes the error bean off the object, evaluates the
     * rules and writes the bean back; it never persists. The ported `Validator` keeps that property, so
     * a validation pass driven on its own issues the uniqueness READ and no write at all.
     */
    const { options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildMerchandiseProduct();

    const subject: ManagedSku = harness.service.newSku();
    subject.setProduct(product);
    subject.skuCode = `${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}9`;
    subject.price = exactDecimal(10);
    subject.addOption(requireAt(options, 0, 'the red option'));

    const ruleSet = createSkuValidationRules<ManagedSku>(
      resolveSkuUniqueTarget,
      createSkusBySelectedOptionsLookup(harness.skuRepository.repository, product.productID),
    );
    const findings = await harness.validation.validateDryRun(subject, ruleSet, 'save');

    expect(findings).toBeInstanceOf(ValidationError);
    expect(findings.hasErrors()).toBe(false);
    expect(harness.skuRepository.calls.map((call) => call.member)).toEqual([
      'findSkusBySelectedOptions',
    ]);
    expect(harness.skuRepository.persisted).toHaveLength(0);
  });

  it('NET-NEW TODO(parity) D19 — an option-less SKU fails hasUniqueOptions once the product has option-bearing SKUs', async () => {
    /*
     * TODO(parity) D19 — `model/entity/Sku.cfc:L764`.
     *
     * For a SKU with ZERO options, `optionsList` is the empty string. By semantic T5 the query then
     * degenerates to "every option-bearing SKU of this product" rather than returning nothing, and the
     * guard at [:L764] — `!arrayLen(skus) || (arrayLen(skus) == 1 && skus[1].getSkuID() == getSkuID())`
     * — can only pass when the product has no option-bearing SKUs at all.
     *
     * So an option-less default SKU on a product that already carries option-bearing SKUs FAILS the
     * uniqueness rule. That is carried across as observed behaviour. There is deliberately NO
     * empty-options special case: adding one would repair a defect the port is required to preserve.
     */
    const { options } = buildColorAndSizeOptions();
    const product = buildMerchandiseProduct();
    const existingOptionBearingSku = buildSku({
      skuID: ID.existingSku,
      skuCode: `${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}7`,
      price: 10,
      options: [requireAt(options, 0, 'the red option')],
      product,
    });
    const harness = buildHarness({
      resolvableOptions: options,
      storedSkus: [existingOptionBearingSku],
    });

    /* No `options` key, so this is the single-SKU fallthrough and the new SKU carries no option. */
    await harness.service.createSkus(product, { price: TEST_MERCHANDISE_PRODUCT_PRICE });

    const optionLessRead = harness.skuRepository.calls.find(
      (call) => call.member === 'findSkusBySelectedOptions',
    );
    expect(
      optionLessRead?.member === 'findSkusBySelectedOptions' && optionLessRead.optionIds,
    ).toEqual([]);
    expect(collectSkuBatchErrors(product).options).toHaveLength(1);
    expect(skuBatchHasErrors(product)).toBe(true);
  });

  it('NET-NEW an option-less SKU passes when the product has no option-bearing SKUs at all', async () => {
    /* The other side of D19: the degenerate query returns nothing, so the guard's first arm passes. */
    const harness = buildHarness();
    const product = buildMerchandiseProduct();

    await harness.service.createSkus(product, { price: TEST_MERCHANDISE_PRODUCT_PRICE });

    expect(collectSkuBatchErrors(product)).toEqual({});
    expect(skuBatchHasErrors(product)).toBe(false);
  });

  it('NET-NEW hasOneOptionPerOptionGroup stays synchronous, short-circuits, and is case-sensitive', async () => {
    /*
     * `model/entity/Sku.cfc:L772-L784` — the second method rule, and the one that is PURE. It walks the
     * option collection in memory and performs no data access at all, so it ports as a plain loop.
     *
     * Case sensitivity is inherited from `listFind`, which the legacy uses at [:L779] and which is
     * case-SENSITIVE (`listFindNoCase` is the case-folding variant and is not what is written there).
     * Two group identifiers differing only in case are therefore DISTINCT groups.
     */
    const { colorGroup, sizeGroup } = buildColorAndSizeOptions();
    const red = buildOption({ optionID: ID.red, optionGroup: colorGroup });
    const blue = buildOption({ optionID: ID.blue, optionGroup: colorGroup });
    const small = buildOption({ optionID: ID.small, optionGroup: sizeGroup });
    const groupless = buildOption({ optionID: ID.large });

    /* Synchronous: a boolean, not a promise. */
    const repeated = buildSku({ options: [red, blue] });
    const verdict = repeated.hasOneOptionPerOptionGroup();
    expect(typeof verdict).toBe('boolean');
    expect(verdict).toBe(false);

    /* One option per group passes. */
    expect(buildSku({ options: [red, small] }).hasOneOptionPerOptionGroup()).toBe(true);

    /* Vacuously true for an empty option collection — the loop simply never runs. */
    expect(buildSku({}).hasOneOptionPerOptionGroup()).toBe(true);

    /*
     * SHORT-CIRCUIT PROOF. A groupless option raises when inspected. Placed AFTER the repeat it is never
     * reached, because the walk returns on the FIRST repeated group; placed after a non-repeat it IS
     * reached and raises. The pair of outcomes is what demonstrates the early exit.
     */
    expect(buildSku({ options: [red, blue, groupless] }).hasOneOptionPerOptionGroup()).toBe(false);
    expect(() =>
      buildSku({ options: [red, small, groupless] }).hasOneOptionPerOptionGroup(),
    ).toThrow(DomainError);

    /* Case-sensitive group identity: `GRP` and `grp` are two groups, so one option each is legal. */
    const upperGroup = buildOptionGroup({ optionGroupID: 'GRP', optionGroupCode: 'upper' });
    const lowerGroup = buildOptionGroup({ optionGroupID: 'grp', optionGroupCode: 'lower' });
    const upperOption = buildOption({ optionID: ID.small, optionGroup: upperGroup });
    const lowerOption = buildOption({ optionID: ID.large, optionGroup: lowerGroup });
    expect(buildSku({ options: [upperOption, lowerOption] }).hasOneOptionPerOptionGroup()).toBe(
      true,
    );

    await Promise.resolve();
  });

  it('NET-NEW evaluates BOTH options method rules and reports both under the options key', async () => {
    /*
     * `model/validation/Sku.json:L6-L7` declares two rules for `options`, in that order, and the ported
     * `Validator` evaluates every constraint of every applicable rule — there is no short-circuit
     * BETWEEN rules, only inside `hasOneOptionPerOptionGroup` itself. A SKU that violates both therefore
     * collects two messages under the same property identifier.
     */
    const { options } = buildColorAndSizeOptions();
    const product = buildMerchandiseProduct();
    const red = requireAt(options, 0, 'the red option');
    const blue = requireAt(options, 1, 'the blue option');

    /* A stored sibling carrying the same two options makes the uniqueness rule fail as well. */
    const sibling = buildSku({
      skuID: ID.existingSku,
      skuCode: `${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}8`,
      price: 10,
      options: [red, blue],
      product,
    });
    const harness = buildHarness({ resolvableOptions: options, storedSkus: [sibling] });

    const subject: ManagedSku = harness.service.newSku();
    subject.setProduct(product);
    subject.skuCode = `${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}9`;
    subject.price = exactDecimal(10);
    subject.addOption(red);
    subject.addOption(blue);

    const ruleSet = createSkuValidationRules<ManagedSku>(
      resolveSkuUniqueTarget,
      createSkusBySelectedOptionsLookup(harness.skuRepository.repository, product.productID),
    );
    const findings = await harness.validation.validateDryRun(subject, ruleSet, 'save');

    expect(findings.hasErrors()).toBe(true);
    expect(findings.getError('options')).toHaveLength(2);
    /* Nothing was written by the validation pass. */
    expect(harness.skuRepository.persisted).toHaveLength(0);
  });

  it('NET-NEW — SEQUENCER-MODEL GUARD: the three orderings genuinely disagree about the same two duplicates', async () => {
    /*
     * ⭐ THE ORDERING MODEL, RUN RATHER THAN ASSERTED — AND SCOPED HONESTLY.
     *
     * The same two candidate SKUs — identical single option, same product, therefore duplicates — are
     * put through the SAME validate and insert closures under all three sequencings. The closures are
     * the real ones: `Sku.hasUniqueOptions` reading through the repository port, and the repository's own
     * write. Only the ORDER changes.
     *
     * ⚠️ WHAT THIS CASE DOES **NOT** PROVE, STATED HERE SO NOBODY READS MORE INTO IT. The sequencing is
     * performed by `createSkuBatchSequencer` from `test/support/inMemoryRepositories.ts` — a MODEL of the
     * three orderings — and `SkuService` is never invoked. So this case establishes that the three
     * orderings really do produce three different verdicts, and it fails loudly if that model drifts; it
     * CANNOT observe `SkuService.validateNewSku` changing its own validate-then-write interleave, because
     * nothing here reaches that method.
     *
     * ⭐ THE SERVICE-LEVEL CLAIM IS THE CASE THAT FOLLOWS, which drives the real `createSkus` under the
     * same three read-back visibilities and asserts that its verdicts equal `legacyOrder`'s. Read the two
     * together: this one says the orderings are distinguishable, the next one says which one production
     * actually implements.
     */
    const { options } = buildColorAndSizeOptions();
    const red = requireAt(options, 0, 'the red option');

    const runSequencing = async (
      sequencing: SkuBatchSequencing,
    ): Promise<{ readonly verdicts: readonly boolean[]; readonly steps: readonly string[] }> => {
      const harness = buildHarness({ resolvableOptions: options });
      const product = buildMerchandiseProduct();
      const candidates = [
        buildSku({ skuCode: 'DUP-1', price: 10, options: [red], product }),
        buildSku({ skuCode: 'DUP-2', price: 10, options: [red], product }),
      ];
      const lookup = createSkusBySelectedOptionsLookup(
        harness.skuRepository.repository,
        product.productID,
      );
      const sequencer = createSkuBatchSequencer<Sku>({
        sequencing,
        validate: (candidate) => candidate.hasUniqueOptions(lookup),
        insert: (candidate) => harness.skuRepository.repository.persistSku(candidate),
      });

      const result = await sequencer.run(candidates);

      return {
        verdicts: candidates.map((candidate) => result.accepted.includes(candidate)),
        steps: result.events.map(
          (event) => `${event.step}:${String(candidates.indexOf(event.candidate) + 1)}`,
        ),
      };
    };

    /* The landed strategy: the first duplicate is unique, the second is not. */
    const legacyOrder = await runSequencing('legacyOrder');
    expect(legacyOrder.verdicts).toEqual([true, false]);
    expect(legacyOrder.steps).toEqual(['validate:1', 'insert:1', 'validate:2']);

    /* insert-all-then-validate FLIPS THE FIRST VERDICT — SKU 1 now sees SKU 2 as well. */
    const insertAllFirst = await runSequencing('insertAllThenValidate');
    expect(insertAllFirst.verdicts).toEqual([false, false]);
    expect(insertAllFirst.steps).toEqual(['insert:1', 'insert:2', 'validate:1', 'validate:2']);
    expect(insertAllFirst.verdicts).not.toEqual(legacyOrder.verdicts);

    /* validate-before-any-insert LETS THE DUPLICATE THROUGH — both reads saw an empty table. */
    const validateFirst = await runSequencing('validateBeforeAnyInsert');
    expect(validateFirst.verdicts).toEqual([true, true]);
    expect(validateFirst.steps).toEqual(['validate:1', 'validate:2', 'insert:1', 'insert:2']);
    expect(validateFirst.verdicts).not.toEqual(legacyOrder.verdicts);
  });

  it('NET-NEW — SERVICE-DRIVEN: the real createSkus implements legacyOrder, and both naive visibilities diverge', async () => {
    /*
     * ⭐⭐ THE M6 PROOF AT SERVICE LEVEL — THE ONE THAT FAILS IF `SkuService`'S OWN INTERLEAVE DRIFTS.
     *
     * The case above proves the three orderings are distinguishable, but it sequences the work itself. This
     * case never sequences anything: it calls `SkuService.createSkus` and lets the SERVICE decide when to
     * validate and when to write. The only thing that varies between the three runs is what ONE repository
     * member — `findSkusBySelectedOptions`, the read `Sku.hasUniqueOptions` performs through
     * `model/dao/SkuDAO.cfc:L106-L128` — is allowed to OBSERVE:
     *
     *   everyWriteSoFar       the read is passed straight through, so it sees exactly the rows the service
     *                         has written so far. This is production behaviour, unmodified.
     *   noWriteOfThisBatch    the read is filtered back to the rows that existed before `createSkus` was
     *                         called, so no sibling the batch wrote is ever visible. That is the observable
     *                         signature of validate-before-any-insert.
     *   theWholeBatchUpFront  the read is augmented with the batch's FINAL sibling set from the very first
     *                         read onward. That is the observable signature of insert-all-then-validate.
     *
     * Only the FIRST run asserts production behaviour. The other two exist so the contrast is executed
     * rather than described, and so the three verdict vectors can be shown to be pairwise different — the
     * property that makes the ordering observable at all.
     *
     * ⚠️ WHY THE THIRD VISIBILITY IS FED FROM THE FIRST RUN. A read-back decorator cannot see the future,
     * so the "whole batch is already written" set is the set the LANDED run actually persisted, read off
     * `harness.skuRepository.persisted` and handed to the third run. That is exactly what an
     * insert-all-then-validate ordering would have made visible to the very first read. The reveal is not
     * taken on trust: `readSizes` records how many rows every read actually returned, so the third run has
     * to show a first read of TWO rows before its verdicts mean anything.
     *
     * `options: red,red` is the discriminating fixture for the same reason as the earlier cases —
     * `model/service/SkuService.cfc:L78` appends unconditionally, so a repeated selection is a repeated
     * bucket entry (T1) and the odometer emits two SKUs carrying an identical option set.
     */
    type ReadBackVisibility = 'everyWriteSoFar' | 'noWriteOfThisBatch' | 'theWholeBatchUpFront';

    const { options } = buildColorAndSizeOptions();
    const red = requireAt(options, 0, 'the red option');

    /** One SKU's findings, read off the entity that carries them rather than off the merged batch bag. */
    const findingsFor = (member: Sku): ReturnType<typeof collectSkuBatchErrors> =>
      collectSkuBatchErrors(
        Object.assign(buildMerchandiseProduct(ID.otherProduct), { skus: [member] }),
      );

    const runVisibility = async (
      visibility: ReadBackVisibility,
      revealedUpFront: readonly Sku[],
    ): Promise<{
      readonly verdicts: readonly boolean[];
      readonly findings: readonly ReturnType<typeof collectSkuBatchErrors>[];
      readonly trace: readonly string[];
      readonly readSizes: readonly number[];
      readonly persisted: readonly Sku[];
    }> => {
      const harness = buildHarness({ resolvableOptions: options });
      const product = buildMerchandiseProduct();

      /* Snapshotted BEFORE the call, so "of this batch" means "written by this `createSkus`". */
      const preExisting = new Set(harness.skuRepository.skus.map((sku) => sku.skuID));
      const readSizes: number[] = [];

      /*
       * The decoration is a SPREAD, not a subclass: every other member — `persistSku` included — stays the
       * harness repository's own closure, so the writes still land in the store the trace and the persisted
       * list are read from. `test/support/inMemoryRepositories.ts` builds the port as a `this`-free object
       * literal of arrow functions precisely so this is safe.
       */
      const observedRepository: SkuRepository = {
        ...harness.skuRepository.repository,
        findSkusBySelectedOptions: async (
          optionIds: string[],
          productId: string,
        ): Promise<Sku[]> => {
          const written = await harness.skuRepository.repository.findSkusBySelectedOptions(
            optionIds,
            productId,
          );
          const observed =
            visibility === 'everyWriteSoFar'
              ? written
              : visibility === 'noWriteOfThisBatch'
                ? written.filter((row) => preExisting.has(row.skuID))
                : /*
                   * `theWholeBatchUpFront`. The reveal applies the SAME predicate the repository applies —
                   * product scope, the option-bearing guard (T3) and the conjunction over every requested
                   * option (T1) — so the augmentation describes a sibling set that could really exist
                   * rather than an unconditional appendage.
                   */
                  [
                    ...written,
                    ...revealedUpFront.filter(
                      (sku) =>
                        !written.some((row) => row.skuID === sku.skuID) &&
                        sku.product !== undefined &&
                        sku.product.productID === productId &&
                        sku.options.length > 0 &&
                        optionIds.every((optionId) =>
                          sku.options.some((option) => option.optionID === optionId),
                        ),
                    ),
                  ];

          readSizes.push(observed.length);

          return observed;
        },
      };

      /*
       * The REAL service over the decorated port, wired exactly as `buildHarness` wires it — same option
       * service, same boundary doubles, same real `Validator` over the real ported SKU rule sets. Only the
       * first constructor argument differs, which is what keeps read-back visibility the single variable.
       */
      const service = new SkuService(
        observedRepository,
        harness.optionService,
        harness.subscriptionTerms.subscriptionTerms,
        harness.accessContents.accessContents,
        harness.imagePaths.imagePaths,
        harness.skuQueries.smartList,
        harness.validation.validator,
        harness.productTypeRoots.resolver,
        createDefaultSkuDelegate,
        GENEROUS_COMBINATION_BUDGET,
      );

      const created = await service.createSkus(product, {
        price: TEST_MERCHANDISE_PRODUCT_PRICE,
        options: `${ID.red},${ID.red}`,
      });

      /* `:L207` returns unconditionally, so the boolean carries no verdict in any of the three runs. */
      expect(created).toBe(true);

      const members = readProductSkus(product);
      const findings = members.map((member) => findingsFor(member));

      return {
        verdicts: findings.map((entry) => Object.keys(entry).length === 0),
        findings,
        trace: readWriteTrace(harness),
        readSizes,
        persisted: harness.skuRepository.persisted,
      };
    };

    /*
     * [1] PRODUCTION BEHAVIOUR. Two SKUs, and the interleave is validate-then-write per SKU: SKU 1's read
     * observes nothing, SKU 2's read observes SKU 1's row. So the FIRST duplicate is accepted and only the
     * SECOND is rejected, and the rejection is the single `options` message `model/validation/Sku.json:L6`
     * reports `hasUniqueOptions` under.
     */
    const landed = await runVisibility('everyWriteSoFar', []);

    expect(landed.persisted).toHaveLength(2);
    expect(landed.trace).toEqual([
      `read:${ID.red}`,
      `write:${ID.red}`,
      `read:${ID.red}`,
      `write:${ID.red}`,
    ]);
    expect(landed.readSizes).toEqual([0, 1]);
    expect(landed.verdicts).toEqual([true, false]);
    expect(landed.findings.map((entry) => Object.keys(entry))).toEqual([[], ['options']]);
    expect(requireAt(landed.findings, 1, "the second SKU's findings").options).toHaveLength(1);

    /*
     * [2] validate-before-any-insert. Neither read observes a sibling, so the duplicate is ACCEPTED — the
     * silent divergence M6 exists to prevent. Both SKUs are still written: `SkuService.validateNewSku`
     * never gates the write on the rule outcome, so what changed is the verdict, not the row count.
     */
    const noneVisible = await runVisibility('noWriteOfThisBatch', []);

    expect(noneVisible.persisted).toHaveLength(2);
    expect(noneVisible.readSizes).toEqual([0, 0]);
    expect(noneVisible.verdicts).toEqual([true, true]);
    expect(noneVisible.findings.map((entry) => Object.keys(entry))).toEqual([[], []]);
    expect(noneVisible.verdicts).not.toEqual(landed.verdicts);

    /*
     * [3] insert-all-then-validate. Every read observes the finished batch, so SKU 1 is rejected as well —
     * the mirror-image divergence. The reveal set is the landed run's own persisted pair, and the first
     * read returning TWO rows is what proves the reveal actually reached the rule.
     */
    expect(landed.persisted).toHaveLength(2);
    const allVisible = await runVisibility('theWholeBatchUpFront', landed.persisted);

    expect(allVisible.persisted).toHaveLength(2);
    expect(allVisible.readSizes).toEqual([2, 3]);
    expect(allVisible.verdicts).toEqual([false, false]);
    expect(allVisible.findings.map((entry) => Object.keys(entry))).toEqual([
      ['options'],
      ['options'],
    ]);
    expect(allVisible.verdicts).not.toEqual(landed.verdicts);

    /* [4] THREE ORDERINGS, THREE DIFFERENT VERDICT VECTORS — pairwise, not merely "not all equal". */
    expect(
      new Set(
        [landed, noneVisible, allVisible].map((run) =>
          run.verdicts.map((verdict) => String(verdict)).join(','),
        ),
      ).size,
    ).toBe(3);

    /*
     * [5] ⭐ THE BRIDGE, AND THE REASON THIS CASE EXISTS SEPARATELY FROM THE ONE ABOVE.
     *
     * The service's own verdicts are compared against the sequencing MODEL's `legacyOrder` verdicts for the
     * same two duplicates. Equality here is the statement "production implements legacyOrder" — the one
     * claim the model-only case cannot make about `SkuService`, and the assertion that fails the moment
     * `validateNewSku`'s validate-then-write order is reordered in either direction.
     *
     * The model run is repeated here rather than shared with the case above ON PURPOSE: the bridge has to
     * compare against a value produced in this case, or a later edit to that case could leave this one
     * comparing against something it no longer describes.
     */
    const modelHarness = buildHarness({ resolvableOptions: options });
    const modelProduct = buildMerchandiseProduct();
    const modelCandidates = [
      buildSku({ skuCode: 'DUP-1', price: 10, options: [red], product: modelProduct }),
      buildSku({ skuCode: 'DUP-2', price: 10, options: [red], product: modelProduct }),
    ];
    const modelLookup = createSkusBySelectedOptionsLookup(
      modelHarness.skuRepository.repository,
      modelProduct.productID,
    );
    const modelResult = await createSkuBatchSequencer<Sku>({
      sequencing: 'legacyOrder',
      validate: (candidate) => candidate.hasUniqueOptions(modelLookup),
      insert: (candidate) => modelHarness.skuRepository.repository.persistSku(candidate),
    }).run(modelCandidates);
    const modelVerdicts = modelCandidates.map((candidate) =>
      modelResult.accepted.includes(candidate),
    );

    expect(modelVerdicts).toEqual([true, false]);
    expect(landed.verdicts).toEqual(modelVerdicts);
  });
});

describe('SkuService.createSkus — M7: a FAILED settlement destroys the connection', () => {
  /*
   * NET-NEW. The companion of the four release-branch cases above, and the reason `createDriverProbe`
   * accepts a {@link SettlementResponder} at all.
   *
   * `src/adapters/mysql/UnitOfWork.ts` keeps ONE disposition record per checkout. It is withdrawn
   * immediately before `beginTransaction` and restored only by a settlement that actually SUCCEEDED, and
   * the `finally` releases a clean connection while DESTROYING a dirty one — because a connection whose
   * begin, commit or roll-back failed carries a transaction state nobody can describe, and returning that
   * to a warm pool is precisely the cross-invocation bleed M7 exists to prevent.
   *
   * ⭐ EVERY BRANCH OF THAT RULE EXCEPT THE PLAIN RELEASE IS ON THE FAILING SIDE. While the probe's
   * `begin`, `commit` and `rollback` all resolved unconditionally, the whole disposal decision was
   * unreachable from this file: the four cases above assert a trailing `'release'` and would have gone on
   * asserting it with the destroy handling deleted from the boundary outright. `test/adapters/UnitOfWork.test.ts`
   * pins the rule against the class directly; these cases pin it WHERE THE SERVICE'S OWN SETTLEMENT GATE
   * REACHES IT, which is the path a handler actually takes.
   *
   * ⚠️ WHAT THESE CASES DO NOT CLAIM. `harness.skuRepository` is an in-memory double, so a roll-back
   * cannot un-persist what it recorded — exactly as noted on the retention case above. `persisted` is
   * therefore read here as "the work ran to completion", never as "the database kept it"; what the
   * database kept is unknowable on these paths, which is the whole reason the connection is destroyed.
   */

  /** The seeded merchandise product these cases start from, built exactly as the M6 block builds its own. */
  const buildMerchandiseProduct = (): Product =>
    buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

  it('NET-NEW — a failed BEGIN destroys the connection and the service never runs at all', async () => {
    /*
     * The disposition is withdrawn BEFORE the begin is attempted, so a begin that failed part-way through
     * still leaves a connection of unknown state. Nothing inside the boundary has run yet, which this
     * case asserts through the repository rather than through the probe: `run` drives the harness's own
     * in-memory graph here, so an empty statement log would prove nothing while an empty CALL log proves
     * the service was never entered.
     */
    const beginFailure = new Error('server has gone away');
    const harness = buildHarness();
    const product = buildMerchandiseProduct();
    const probe = createDriverProbe((step) => {
      if (step === 'begin') {
        throw beginFailure;
      }
    });
    const unitOfWork = new UnitOfWork(probe.pool);

    await expect(
      unitOfWork.run(
        () => harness.service.createSkus(product, { price: TEST_MERCHANDISE_PRODUCT_PRICE }),
        () => skuBatchHasErrors(product),
      ),
    ).rejects.toBe(beginFailure);

    expect(probe.lifecycle).toEqual(['getConnection', 'begin', 'destroy']);
    expect(harness.skuRepository.calls).toEqual([]);
    expect(harness.skuRepository.persisted).toHaveLength(0);
  });

  it('NET-NEW — a failed COMMIT destroys the connection even though the batch itself was clean', async () => {
    /*
     * The case that separates "the work went wrong" from "the connection went wrong". The batch is valid,
     * the M5 gate reports clean, and the boundary asks for a commit the driver refuses — so there is no
     * roll-back to attempt, the driver's rejection is what the caller sees UNCHANGED, and the connection
     * is destroyed rather than released. Its twin two blocks above asserts the identical batch ending in
     * `'commit', 'release'`, so the destroy here is attributable to the settlement and to nothing else.
     */
    const commitFailure = new Error('commit refused');
    const { options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildMerchandiseProduct();
    const probe = createDriverProbe((step) => {
      if (step === 'commit') {
        throw commitFailure;
      }
    });
    const unitOfWork = new UnitOfWork(probe.pool);

    await expect(
      unitOfWork.run(
        () =>
          harness.service.createSkus(product, {
            price: TEST_MERCHANDISE_PRODUCT_PRICE,
            options: ID.red,
          }),
        () => skuBatchHasErrors(product),
      ),
    ).rejects.toBe(commitFailure);

    expect(probe.lifecycle).toEqual(['getConnection', 'begin', 'commit', 'destroy']);
    /* The work did reach completion; see the block note on how `persisted` is read here. */
    expect(harness.skuRepository.persisted).toHaveLength(1);
    expect(collectSkuBatchErrors(product).options).toBeUndefined();
  });

  it('NET-NEW — the M5 gate fires and its ROLL-BACK fails: destroy, a compound failure, and NO abandoned class', async () => {
    /*
     * The gate path's failing settlement. `skuBatchHasErrors` reports the duplicate-options finding, the
     * boundary rolls back, and the roll-back is refused — so the caller is told about the ROLL-BACK
     * rather than about the gate, because "nothing can be reported about what the database retained" is
     * the more serious fact.
     *
     * ⭐ `toStrictEqual` IS WHAT MAKES THE SECOND ASSERTION MEAN ANYTHING. There is no abandoned failure
     * on this path — the work resolved and the GATE asked for the unwind — so `abandonedFailureClass` must
     * be ABSENT rather than present and undefined, and `exactOptionalPropertyTypes` makes those two
     * different things. `toEqual` would pass for either.
     */
    const rollbackFailure = new Error('rollback refused');
    const { options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildMerchandiseProduct();
    const probe = createDriverProbe((step) => {
      if (step === 'rollback') {
        throw rollbackFailure;
      }
    });
    const unitOfWork = new UnitOfWork(probe.pool);

    const rejection: unknown = await unitOfWork
      .run(
        () =>
          harness.service.createSkus(product, {
            price: TEST_MERCHANDISE_PRODUCT_PRICE,
            options: `${ID.red},${ID.red}`,
          }),
        () => skuBatchHasErrors(product),
      )
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );

    if (!(rejection instanceof DomainError)) {
      throw new Error('A failed roll-back was expected to be reported as a domain failure.');
    }
    expect(rejection.message).toMatch(/could not be rolled back/);
    expect(rejection.cause).toBe(rollbackFailure);
    expect(rejection.context).toStrictEqual({ rolledBackBecause: 'accumulatedErrors' });
    expect(probe.lifecycle).toEqual(['getConnection', 'begin', 'rollback', 'destroy']);
    /* The findings stay attached exactly as they do when the roll-back succeeds. */
    expect(collectSkuBatchErrors(product).options).toHaveLength(1);
  });

  it("NET-NEW — the service's OWN failure plus a failed roll-back: destroy, and only the failure CLASS travels", async () => {
    /*
     * The compound path, driven by the one failure `createSkus` raises on its own account: the
     * fallthrough at [:L204] for a base product type it does not recognise. Two failures are then in
     * flight, and the disclosure contract decides what an operator gets to see.
     *
     * ⛔ THE MANDATED LEGACY MESSAGE MUST NOT TRAVEL. `describeAbandonedFailure` reduces the abandoned
     * failure to its class name — here `LegacyParityError`, which is itself the useful fact, since it says
     * a parity throw and not an infrastructure fault stopped the work — and attaching the object instead
     * would put its message into every log that renders the context (CWE-532). The last assertion is that
     * search, run against the imported message constant rather than a retyped copy of it.
     */
    const rollbackFailure = new Error('rollback refused');
    const harness = buildHarness();
    const unrecognisedType = buildProductType({
      productTypeID: ID.childProductType,
      productTypeIDPath: ID.childProductType,
      systemCode: 'giftCard',
    });
    const product = buildEmptyProduct(unrecognisedType);
    const probe = createDriverProbe((step) => {
      if (step === 'rollback') {
        throw rollbackFailure;
      }
    });
    const unitOfWork = new UnitOfWork(probe.pool);

    const rejection: unknown = await unitOfWork
      .run(
        () => harness.service.createSkus(product, { price: TEST_MERCHANDISE_PRODUCT_PRICE }),
        () => skuBatchHasErrors(product),
      )
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );

    if (!(rejection instanceof DomainError)) {
      throw new Error('A failed roll-back was expected to be reported as a domain failure.');
    }
    expect(rejection).not.toBeInstanceOf(LegacyParityError);
    expect(rejection.cause).toBe(rollbackFailure);
    expect(rejection.context).toStrictEqual({
      rolledBackBecause: 'workFailure',
      abandonedFailureClass: 'LegacyParityError',
    });
    expect(probe.lifecycle).toEqual(['getConnection', 'begin', 'rollback', 'destroy']);
    expect(
      JSON.stringify({ message: rejection.message, context: rejection.context }),
    ).not.toContain(UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE);
  });
});

describe('SkuService.processImageUpload', () => {
  /*
   * `model/service/SkuService.cfc:L210-L218`.
   *
   * ⚠️ THE LEGACY ARGUMENT IS SPELLED WITH A CAPITAL — `required any Sku` at [:L210], dereferenced as
   * `arguments.Sku` at [:L211]. CFML argument names are case-insensitive so the spelling carried no
   * meaning there; the port names it `sku` in the conventional lower camel case, which is the kind of
   * idiom change the Minimal Change Clause explicitly permits.
   *
   * ⚠️ AND THE COLLABORATOR WAS HIDDEN. [:L212] reaches it through `getService("imageService")`, a
   * dynamic string lookup that is NEVER declared as a component property on this service. Any dependency
   * analysis reading component metadata misses it entirely, and a port built from that analysis would
   * compile and then fail on the first image operation. It is translated to the declared `ImagePathPort`
   * constructor parameter.
   */

  /*
   * The two values every case in this block needs: a realistic stored file name, and a realistic upload
   * struct to forward.
   *
   * ⛔ NEITHER VALUE IS A GATE FIXTURE, BECAUSE THERE IS NO GATE. Successive revisions required writes to
   * land beneath a configured storage root, required the upload to declare a permitted content type, and
   * then required the stored name to be a value the legacy's own generator could have produced. All three
   * are withdrawn — the first two as invented configuration (AAP §0.7.3 S9, IR-12) and the third under
   * review finding F4, because it refused input [model/service/SkuService.cfc:L212] ACCEPTS and AAP
   * §0.6.7.7 declares D18 the SINGLE behaviour-hardening exception in this port. So the member inspects
   * `sku.imageFile` for nothing at all: it composes with it and forwards the composition.
   * `CONTAINED_IMAGE_PATH` keeps its name only because it is still the path the production composition
   * yields for this name.
   */
  const CONTAINED_IMAGE_FILE = 'shirt.jpg';
  const CONTAINED_IMAGE_PATH = `${TEST_IMAGE_STORAGE_ROOT}${CONTAINED_IMAGE_FILE}`;
  const PERMITTED_IMAGE_UPLOAD: Record<string, unknown> = {
    contentType: 'image',
    contentSubType: 'jpeg',
    serverFileExt: 'jpg',
  };

  it('NET-NEW answers with the image-write VERDICT, distinctly for BOTH image-service outcomes', async () => {
    /*
     * ⭐ THE RETURN TYPE IS `boolean`, NOT `Sku`, BECAUSE THE LEGACY BODY ANSWERS A VERDICT. The
     * declaration is `public any function` — loose — and [:L213-L217] settles what that `any` is:
     * `return true;` at [:L214] and `return false;` at [:L216], and never the entity. TR-1 tightens a loose
     * signature to the OBSERVED contract, which is what this case pins.
     *
     * ⚠️ A REVISION TYPED THE MEMBER `Promise<Sku>` AND THIS CASE ASSERTED THE ENTITY — that a stored write
     * and a declined one produced the SAME answer. Review finding F2 withdrew it: a member answering a
     * different KIND of value than the legacy body answers does not preserve the interface boundary, and it
     * made the verdict unobservable anywhere in the port. The two outcomes are now DISTINGUISHABLE, which is
     * what the legacy caller of `saveImageFile` could always see.
     *
     * TODO(parity) — [:L213-L216] is a redundant boolean identity: `if(imageSaved) return true; else
     * return false;` is exactly `return imageSaved;`. The port writes the direct form, because the dead
     * branching carries no behaviour; the redundancy is recorded rather than reproduced.
     */
    const succeeding = buildHarness({
      saveImageSucceeds: true,
      imagePathsByImageFile: { [CONTAINED_IMAGE_FILE]: CONTAINED_IMAGE_PATH },
    });
    const savedSku = buildSku({
      skuID: ID.existingSku,
      imageFile: CONTAINED_IMAGE_FILE,
      price: 10,
    });
    const saved = await succeeding.service.processImageUpload(savedSku, {
      ...PERMITTED_IMAGE_UPLOAD,
      fileWasSaved: true,
    });
    /* A STORED write is `true` — [:L214]. Asserted as an exact boolean rather than truthiness, so a
     * revision answering with an entity again fails here by value rather than passing on coercion. */
    expect(saved).toBe(true);

    /* ⚠️ AND THE ENTITY IS NOT MUTATED ON THE WAY THROUGH. [:L211-L217] neither re-reads nor clones nor
     * writes, so the caller's own instance is unchanged. */
    expect(savedSku.imageFile).toBe(CONTAINED_IMAGE_FILE);

    const failing = buildHarness({
      saveImageSucceeds: false,
      imagePathsByImageFile: { [CONTAINED_IMAGE_FILE]: CONTAINED_IMAGE_PATH },
    });
    const rejectedSku = buildSku({
      skuID: ID.existingSku,
      imageFile: CONTAINED_IMAGE_FILE,
      price: 10,
    });
    const notSaved = await failing.service.processImageUpload(rejectedSku, {
      ...PERMITTED_IMAGE_UPLOAD,
      fileWasSaved: false,
    });
    /* ⛔ A DECLINED write is `false` — [:L216] — and it is NOT a raise, NOT a `null` and NOT an error
     * recorded on the entity. The distinction between the two outcomes is the whole of what this member
     * publishes. */
    expect(notSaved).toBe(false);
    expect(rejectedSku.imageFile).toBe(CONTAINED_IMAGE_FILE);
  });

  it('NET-NEW a DECLINED write still resolves, records no error and raises nothing [model/service/SkuService.cfc:L213-L217]', async () => {
    /*
     * ⛔ WHAT THE PORT DELIBERATELY DOES NOT DO WITH A DECLINED WRITE. [:L213-L217] neither calls `addError`
     * nor raises, so converting the declined write into a rejection, or writing it onto the SKU's error bag,
     * would fabricate behaviour the legacy lacks (AAP §0.8.2 Guideline 4). The port asked the image port
     * exactly once and then answered; nothing was retried and no second path was composed.
     *
     * ⚠️ AND THE ENTITY IS NOT MUTATED ON THE WAY THROUGH. The SKU is READ for its path and nothing else,
     * so the caller's instance is field-for-field what it was.
     */
    const harness = buildHarness({
      saveImageSucceeds: false,
      imagePathsByImageFile: { 'shirt.jpg': '/assets/images/product/default/shirt.jpg' },
    });
    const sku = buildSku({ skuID: ID.existingSku, imageFile: 'shirt.jpg', price: 10 });
    const before = { ...sku };

    await expect(harness.service.processImageUpload(sku, PERMITTED_IMAGE_UPLOAD)).resolves.toBe(
      false,
    );

    /* Nothing was written onto the entity, and nothing was raised — the two things a "helpful" port would
     * add here. The caller's instance is untouched, field for field. */
    expect(sku).toEqual(before);

    /* Asked exactly once, in the observable order, and no second path composed. */
    expect(harness.imagePaths.calls.map((call) => call.member)).toEqual([
      'getImagePath',
      'saveImageFile',
    ]);
  });

  it('NET-NEW reads the SKU image path first, then forwards the upload result, path and extensions', async () => {
    /*
     * [:L211] resolves the path off the SKU; [:L212] hands the port three named arguments. The order is
     * observable — the path must exist before the save can be asked for — and the extension list is a
     * literal in the legacy source.
     */
    const harness = buildHarness({
      imagePathsByImageFile: { [CONTAINED_IMAGE_FILE]: CONTAINED_IMAGE_PATH },
    });
    const sku = buildSku({
      skuID: ID.existingSku,
      imageFile: CONTAINED_IMAGE_FILE,
      price: 10,
    });
    const uploadResult = {
      ...PERMITTED_IMAGE_UPLOAD,
      serverFile: CONTAINED_IMAGE_FILE,
      fileWasSaved: true,
    };

    await harness.service.processImageUpload(sku, uploadResult);

    expect(harness.imagePaths.calls.map((call) => call.member)).toEqual([
      'getImagePath',
      'saveImageFile',
    ]);

    const pathCall = requireAt(harness.imagePaths.calls, 0, 'the image-path read');
    expect(pathCall.member === 'getImagePath' && pathCall.imageFile).toBe(CONTAINED_IMAGE_FILE);

    const saveCall = requireAt(harness.imagePaths.calls, 1, 'the save request');
    if (saveCall.member !== 'saveImageFile') {
      throw new Error('The second image-port call was expected to be the save request.');
    }
    /* ⭐ THE UPLOAD RESULT TRAVELS BY REFERENCE, and the identity check is what would catch a future
     * validator that "normalised" the value on its way through. */
    expect(saveCall.request.uploadResult).toBe(uploadResult);
    /* And the COMPOSED path crosses unchanged, exactly as [:L211-L212] hands it over. */
    expect(saveCall.request.filePath).toBe(CONTAINED_IMAGE_PATH);
    /*
     * BYTE-EXACT against the legacy literal at [:L212], and against the port constant, so the two can
     * never drift apart unnoticed.
     */
    expect(saveCall.request.allowedExtensions).toBe('jpg,jpeg,png,gif');
    expect(saveCall.request.allowedExtensions).toBe(IMAGE_UPLOAD_ALLOWED_EXTENSIONS);
  });

  it('[NET-NEW] SEC-FILE-01 refuses an ABSENT image file, while COMPOSITION stays ungated', async () => {
    /*
     * ⚠️ THIS CASE HAS BEEN INVERTED THREE TIMES, AND EVERY CLAIM IS PRESERVED SO THE HISTORY IS LEGIBLE.
     *   1. Original claim: `model/entity/Sku.cfc:L145` builds the path from `getImageFile()` with NO null
     *      guard, so a SKU with no image file still produces a path — one with nothing in the file position
     *      — and guarding COMPOSITION would be a repair.
     *   2. A revision added a WRITE gate refusing the empty name; this case asserted that refusal.
     *   3. Review finding F4 withdrew the gate; the case asserted the port being reached again.
     *
     * ⭐ THE GATE IS BACK, ON THE GROUND THAT THIS PATH HAS NO LEGACY BEHAVIOUR TO PRESERVE (see the block
     * header), AND THE EMPTY NAME IS REFUSED FOR A REASON WORTH STATING ON ITS OWN. An empty file position
     * makes the composed path resolve to the DIRECTORY `<baseImageURL>/product/default/`, and handing a
     * directory to a member that writes is the same class of hazard as handing it a traversal. Both
     * quantifiers in the pattern are `+`, so the empty stem is refused on shape rather than by a special
     * case.
     *
     * ⭐ AND CLAIM 1 SURVIVES UNCHANGED, WHICH IS THE OTHER HALF OF THIS CASE. Composition is NOT gated:
     * `Sku.getImagePath` still coalesces an absent column to `''` and still asks the port, exactly as
     * [:L145] interpolates whatever is there. The gate lives at the WRITE, not at the composition, so the
     * two assertions below are deliberately about different members.
     */
    const harness = buildHarness();
    const sku = buildSku({ skuID: ID.existingSku, price: 10 });

    await expect(harness.service.processImageUpload(sku, {})).resolves.toBe(false);
    /* Neither member of the port was reached — not even the composition. */
    expect(harness.imagePaths.calls).toEqual([]);

    /* Claim 1, re-pointed at the member where it was always true: COMPOSITION still composes. */
    const composing = buildHarness();
    await expect(
      buildSku({ skuID: ID.existingSku, price: 10 }).getImagePath(composing.imagePaths.imagePaths),
    ).resolves.toBe('');
    const pathCall = requireAt(composing.imagePaths.calls, 0, 'the image-path read');
    expect(pathCall.member === 'getImagePath' && pathCall.imageFile).toBe('');
  });
});

describe('SkuService.getProductSkus', () => {
  /*
   * `model/service/SkuService.cfc:L220-L244`.
   *
   * `sorted` is REQUIRED — `required boolean sorted` at [:L220] — while `fetchOptions` defaults to
   * false. That asymmetry survives into the port, so `sorted` has no default there either.
   */

  const buildProductWithStoredSkus = (): {
    readonly product: Product;
    readonly optionBearing: Sku;
    readonly optionLess: Sku;
    readonly options: readonly Option[];
  } => {
    const { options } = buildColorAndSizeOptions();
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );
    const optionBearing = buildSku({
      skuID: ID.existingSku,
      skuCode: 'STORED-1',
      price: 10,
      options: [requireAt(options, 0, 'the red option')],
      product,
    });
    const optionLess = buildSku({
      skuID: ID.optionlessSku,
      skuCode: 'STORED-2',
      price: 10,
      product,
    });

    return { product, optionBearing, optionLess, options };
  };

  it('NET-NEW forwards only the product and the fetch-options flag to the repository, never `sorted`', async () => {
    /*
     * [:L221] passes `product=` and `fetchOptions=` by name and does NOT pass `sorted` — sorting is a
     * decision this method makes itself, after the read. A port that forwarded `sorted` would be
     * inventing a repository contract.
     */
    const { product, optionBearing } = buildProductWithStoredSkus();
    const harness = buildHarness({ storedSkus: [optionBearing] });

    await harness.service.getProductSkus(product, true);

    const readCall = requireAt(harness.skuRepository.calls, 0, 'the product-SKU read');
    if (readCall.member !== 'findByProduct') {
      throw new Error('The first repository call was expected to be the product-SKU read.');
    }
    expect(readCall.productID).toBe(ID.product);
    /* `fetchOptions` defaults to false when the caller omits it. */
    expect(readCall.fetchOptions).toBe(false);
    expect(Object.keys(readCall)).not.toContain('sorted');

    const explicitFetch = buildHarness({ storedSkus: [optionBearing] });
    await explicitFetch.service.getProductSkus(product, false, true);
    const fetchCall = requireAt(explicitFetch.skuRepository.calls, 0, 'the product-SKU read');
    expect(fetchCall.member === 'findByProduct' && fetchCall.fetchOptions).toBe(true);
  });

  it('NET-NEW applies the three-part sort guard, inspecting ONLY the first SKU for options', async () => {
    /*
     * [:L223] `arguments.sorted && arrayLen(skus) gt 1 && arrayLen(skus[1].getOptions())`. All three
     * parts are load-bearing, and the third looks at `skus[1]` — the FIRST element of a one-based array
     * — and at nothing else.
     *
     * ⚠️ SUB-DEFECT AT [:L223], CARRIED: if the first SKU happens to be option-less while later SKUs
     * carry options, the whole batch is returned UNSORTED with no error and no indication. Ordering the
     * read differently, or testing every SKU instead of the first, would change results. Neither is done.
     */
    const { product, optionBearing, optionLess } = buildProductWithStoredSkus();

    /* `sorted` false — the ordering query is never issued. */
    const unsorted = buildHarness({ storedSkus: [optionBearing, optionLess] });
    await unsorted.service.getProductSkus(product, false);
    expect(unsorted.skuRepository.calls.map((call) => call.member)).toEqual(['findByProduct']);

    /* A single SKU — `arrayLen(skus) gt 1` fails, so no ordering query. */
    const single = buildHarness({ storedSkus: [optionBearing] });
    const singleResult = await single.service.getProductSkus(product, true);
    expect(singleResult).toHaveLength(1);
    expect(single.skuRepository.calls.map((call) => call.member)).toEqual(['findByProduct']);

    /* FIRST SKU OPTION-LESS — sorting is silently skipped even though the second SKU has options. */
    const firstOptionLess = buildHarness({ storedSkus: [optionLess, optionBearing] });
    const skipped = await firstOptionLess.service.getProductSkus(product, true);
    expect(skipped.map((sku) => sku.skuID)).toEqual([ID.optionlessSku, ID.existingSku]);
    expect(firstOptionLess.skuRepository.calls.map((call) => call.member)).toEqual([
      'findByProduct',
    ]);
  });

  it('NET-NEW reorders by the sorted-identifier query when the guard passes', async () => {
    /*
     * The happy path: two option-bearing SKUs, both present in the ordering, returned in the ordering's
     * sequence rather than the read's. The ordering weight comes from option-group sort order, per
     * `model/dao/SkuDAO.cfc:L172-L202`.
     */
    const { colorGroup, options } = buildColorAndSizeOptions();
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );
    const blueSku = buildSku({
      skuID: ID.secondExistingSku,
      skuCode: 'STORED-BLUE',
      price: 10,
      options: [requireAt(options, 1, 'the blue option')],
      product,
    });
    const redSku = buildSku({
      skuID: ID.existingSku,
      skuCode: 'STORED-RED',
      price: 10,
      options: [requireAt(options, 0, 'the red option')],
      product,
    });
    /* Stored blue-first; red sorts first because its option sort order is lower. */
    const harness = buildHarness({ storedSkus: [blueSku, redSku] });

    const sorted = await harness.service.getProductSkus(product, true);

    expect(harness.skuRepository.calls.map((call) => call.member)).toEqual([
      'findByProduct',
      'findSortedSkuIdsByProduct',
    ]);
    expect(sorted.map((sku) => sku.skuID)).toEqual([ID.existingSku, ID.secondExistingSku]);
    expect(colorGroup.sortOrder).toBe(1);
  });

  it('NET-NEW TODO(parity) D13 — fails when a returned SKU has no position in the sorted ordering', async () => {
    /*
     * TODO(parity) D13 — `model/service/SkuService.cfc:L236-L237`.
     *
     * `arrayFind(sortedArray, skuID)` answers 0 when the identifier is absent, and [:L237] then writes
     * `sortedArrayReturn[index]` — index ZERO of a ONE-BASED array, which CFML rejects. The ordering
     * query at `model/dao/SkuDAO.cfc:L172-L202` INNER JOINs through the option link table, so it returns
     * option-bearing SKUs only; an option-less SKU in the read result is therefore absent from the
     * ordering and reaches that write.
     *
     * The guard at [:L223] does not save it: the guard inspects only the FIRST SKU, so an option-bearing
     * first SKU followed by an option-less one passes the guard and then fails inside the loop.
     *
     * Carried unrepaired. The missing SKU is NOT appended, the ordering is NOT relaxed, and the failure
     * is NOT swallowed — all three would be repairs.
     */
    const { product, optionBearing, optionLess, options } = buildProductWithStoredSkus();
    const secondOptionBearing = buildSku({
      skuID: ID.secondExistingSku,
      skuCode: 'STORED-3',
      price: 10,
      options: [requireAt(options, 1, 'the blue option')],
      product,
    });
    const harness = buildHarness({
      storedSkus: [optionBearing, secondOptionBearing, optionLess],
    });

    await expect(harness.service.getProductSkus(product, true)).rejects.toThrow(DomainError);
    await expect(harness.service.getProductSkus(product, true)).rejects.toThrow(/D13/);

    /* Both reads happened — the failure is in the placement, after the ordering query. */
    expect(harness.skuRepository.calls.map((call) => call.member)).toEqual([
      'findByProduct',
      'findSortedSkuIdsByProduct',
      'findByProduct',
      'findSortedSkuIdsByProduct',
    ]);
  });
});

describe('SkuService.getSortedProductSkus', () => {
  /*
   * `model/service/SkuService.cfc:L246-L269`.
   */

  it('NET-NEW reads the product collection rather than the repository product-SKU query', async () => {
    /*
     * [:L247] is `arguments.product.getSkus()` — the in-memory association, NOT
     * `getSkuDAO().getProductSkus(...)`. So this member issues exactly ONE repository call, the ordering
     * query, and never the product-SKU read that `getProductSkus` opens with.
     *
     * G6 — [:L252] passes the product identifier POSITIONALLY, `getSortedProductSkusID(product.getProductID())`,
     * while [:L224] passes the same value BY NAME. CFML accepts both against the same declaration, so the
     * inconsistency is invisible there; TypeScript has one positional forwarding form and the port uses
     * it in both places.
     */
    const { options } = buildColorAndSizeOptions();
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );
    const blueSku = buildSku({
      skuID: ID.secondExistingSku,
      skuCode: 'ASSOC-BLUE',
      price: 10,
      options: [requireAt(options, 1, 'the blue option')],
      product,
    });
    const redSku = buildSku({
      skuID: ID.existingSku,
      skuCode: 'ASSOC-RED',
      price: 10,
      options: [requireAt(options, 0, 'the red option')],
      product,
    });
    const harness = buildHarness({ storedSkus: [blueSku, redSku] });

    const sorted = await harness.service.getSortedProductSkus(product);

    expect(harness.skuRepository.calls.map((call) => call.member)).toEqual([
      'findSortedSkuIdsByProduct',
    ]);
    const orderingCall = requireAt(harness.skuRepository.calls, 0, 'the ordering query');
    expect(orderingCall.member === 'findSortedSkuIdsByProduct' && orderingCall.productID).toBe(
      ID.product,
    );
    expect(sorted.map((sku) => sku.skuID)).toEqual([ID.existingSku, ID.secondExistingSku]);
    /* The association is what was read: both SKUs came from `product.getSkus()`. */
    expect(readProductSkus(product)).toHaveLength(2);
  });

  it('NET-NEW returns early with fewer than two SKUs and issues no query at all', async () => {
    /* [:L248-L250] `if(arrayLen(skus) lt 2) return skus;` — strictly fewer than two. */
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );
    const empty = buildHarness();
    await expect(empty.service.getSortedProductSkus(product)).resolves.toEqual([]);
    expect(empty.skuRepository.calls).toHaveLength(0);

    const single = buildHarness();
    const onlySku = buildSku({ skuID: ID.existingSku, skuCode: 'ONLY-1', price: 10, product });
    const result = await single.service.getSortedProductSkus(product);
    expect(result).toEqual([onlySku]);
    expect(single.skuRepository.calls).toHaveLength(0);
  });

  it('NET-NEW TODO(parity) D13 — fails on a missing ordering position, with no `sorted` or first-SKU guard to stop it', async () => {
    /*
     * TODO(parity) D13 — `model/service/SkuService.cfc:L262-L265`. The identical `arrayFind`-returns-zero
     * write as [:L237], but this member has NEITHER the `sorted` flag NOR the first-SKU option check, so
     * it reaches the failure more readily: two SKUs where one is option-less is enough.
     *
     * The two members are asserted INDEPENDENTLY on purpose. They share the defect but not the guards, so
     * a single case covering "the sorted path" would leave the easier failure untested.
     */
    const { options } = buildColorAndSizeOptions();
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );
    /* FIRST SKU IS OPTION-LESS — which `getProductSkus` would have used to skip sorting entirely. */
    const optionLess = buildSku({
      skuID: ID.optionlessSku,
      skuCode: 'ASSOC-NONE',
      price: 10,
      product,
    });
    const optionBearing = buildSku({
      skuID: ID.existingSku,
      skuCode: 'ASSOC-RED',
      price: 10,
      options: [requireAt(options, 0, 'the red option')],
      product,
    });
    const harness = buildHarness({ storedSkus: [optionLess, optionBearing] });

    await expect(harness.service.getSortedProductSkus(product)).rejects.toThrow(DomainError);
    await expect(harness.service.getSortedProductSkus(product)).rejects.toThrow(/D13/);
  });
});

describe('SkuService.searchSkusByProductType', () => {
  /*
   * `model/service/SkuService.cfc:L271-L273`.
   *
   * ⚠️ BOTH ARGUMENTS ARE OPTIONAL — `string term, string productTypeID` at [:L271], neither marked
   * `required`. AAP §0.4.2.2 calls this out as Discrepancy 3, and it is preserved rather than tightened:
   * tightening would reject calls the legacy accepts.
   */

  const buildSearchableSkus = (): readonly Sku[] => {
    const merchandiseProduct = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );
    const subscriptionProduct = buildEmptyProduct(
      buildSeededProductType(
        SUBSCRIPTION_PRODUCT_TYPE.systemCode,
        SUBSCRIPTION_PRODUCT_TYPE.productTypeID,
      ),
      ID.otherProduct,
    );

    return [
      buildSku({
        skuID: ID.existingSku,
        skuCode: 'SHIRT-1',
        price: 10,
        product: merchandiseProduct,
      }),
      buildSku({
        skuID: ID.secondExistingSku,
        skuCode: 'SHIRT-2',
        price: 10,
        product: subscriptionProduct,
      }),
      buildSku({
        skuID: ID.optionlessSku,
        skuCode: 'HAT-1',
        price: 10,
        product: merchandiseProduct,
      }),
    ];
  };

  it('NET-NEW forwards a term with the product-type restriction absent, and preserves the rows exactly', async () => {
    /*
     * [:L272] `return getSkuDAO().searchSkusByProductType( argumentCollection=arguments );` — every
     * argument the caller named travels on, and the DAO's answer comes back untouched. This member neither
     * re-orders, re-shapes, filters nor trims; asserting the rows arrive in the repository's own order is
     * how "pure delegation" is made checkable rather than merely claimed.
     */
    const harness = buildHarness({ storedSkus: buildSearchableSkus() });

    const rows: readonly SkuSearchRow[] = await harness.service.searchSkusByProductType('shirt');

    const call = requireAt(harness.skuRepository.calls, 0, 'the search call');
    if (call.member !== 'searchByProductType') {
      throw new Error('The first repository call was expected to be the SKU search.');
    }
    expect(call.term).toBe('shirt');
    /* The absent restriction travels as absent — it is NOT defaulted to an empty string. */
    expect(call.productTypeID).toBeUndefined();

    /* The `{id, value}` projection `model/dao/SkuDAO.cfc:L130-L146` selects, in the query's order. */
    expect(rows).toEqual([
      { id: ID.existingSku, value: 'SHIRT-1' },
      { id: ID.secondExistingSku, value: 'SHIRT-2' },
    ]);
  });

  it('NET-NEW forwards a present product-type restriction alongside the term', async () => {
    const harness = buildHarness({ storedSkus: buildSearchableSkus() });

    const rows = await harness.service.searchSkusByProductType(
      'shirt',
      MERCHANDISE_PRODUCT_TYPE.productTypeID,
    );

    const call = requireAt(harness.skuRepository.calls, 0, 'the search call');
    expect(call.member === 'searchByProductType' && call.productTypeID).toBe(
      MERCHANDISE_PRODUCT_TYPE.productTypeID,
    );
    /* The subscription product's SKU is excluded by the restriction, not by anything this member does. */
    expect(rows.map((row) => row.id)).toEqual([ID.existingSku]);
  });

  it('NET-NEW forwards an absent term unexamined, so the failure surfaces where the legacy reads it', async () => {
    /*
     * [:L272] forwards the collection without inspecting it, and `model/dao/SkuDAO.cfc:L130-L146` reads
     * the term with no `structKeyExists` guard. Pre-empting that here with a service-side guard would
     * move a legacy failure to a new layer and invent a message the legacy never had (IR-9), so the
     * argument travels on and the repository raises.
     */
    const harness = buildHarness({ storedSkus: buildSearchableSkus() });

    await expect(harness.service.searchSkusByProductType()).rejects.toThrow(DomainError);

    const call = requireAt(harness.skuRepository.calls, 0, 'the search call');
    expect(call.member === 'searchByProductType' && call.term).toBeUndefined();
  });

  /* ⛔ THE WINDOWED SIBLING STOOD HERE AND IS WITHDRAWN WITH THE MEMBER. Eight cases asserted that
   * `searchSkusByProductTypeBounded` forwarded a window, a term and a product-type restriction to the
   * repository and added nothing else. Its own banner made the case against it without noticing:
   * "**NET-NEW for a second reason: no legacy MEMBER exists.** `model/service/SkuService.cfc` declares
   * no windowed search and `model/dao/SkuDAO.cfc:L130-L146` carries no row cap". A member with no
   * legacy counterpart is not covered by TR-1, which preserves an OBSERVED contract; AAP §0.4.2.2 fixes
   * this service at nine ported members plus `newSku`, and §0.4.2.5 declines to reproduce synthesis
   * "wholesale, only where used". The stated motive — that a stateless invocation cannot hold an
   * unbounded result set — is real, and it is answered at the layer that owns it: the materialisation
   * budget in `../../src/adapters/mysql/SmartListQueryBuilder.ts` refuses an over-large read on the
   * COUNT, before a row is fetched, without adding a member to this public surface. */
});

describe('SkuService.getSkuStocksDeletableFlag', () => {
  /*
   * `model/service/SkuService.cfc:L281-L283`.
   */

  it('NET-NEW TODO(parity) D4 — rejects with the explicit unportable boundary rather than a fabricated flag', async () => {
    /*
     * TODO(parity) D4 — `model/service/SkuService.cfc:L281-L283`.
     *
     * [:L282] is `return getSkuDAO().getSkuStocksDeletableFlag( argumentCollection=arguments );`, and
     * `SkuDAO.getSkuStocksDeletableFlag` IS DECLARED NOWHERE IN THE LEGACY REPOSITORY. The member has
     * therefore never been able to resolve, and its only caller —
     * `model/entity/Sku.cfc:L567-L572`'s `getStocksDeletableFlag()` — has never been able to answer.
     *
     * Deliberately NOT done, because each would invent behavior the legacy does not have:
     *   • returning a fabricated `true` (every SKU deletable) or `false` (none deletable);
     *   • querying stock or inventory, both of which are explicitly out of scope (AAP §0.2.2.1);
     *   • adding a member to the SKU repository so the call resolves, which would invent a query.
     *
     * The port therefore surfaces the gap as an explicit, typed, imported boundary error. Note the error
     * class is IMPORTED from `src/errors/DomainError.ts` — the message is never retyped here, so the two
     * cannot drift.
     */
    const harness = buildHarness();

    await expect(harness.service.getSkuStocksDeletableFlag(ID.existingSku)).rejects.toThrow(
      NotImplementedError,
    );
    /* It is a DomainError too, so the response layer's family handling reaches it. */
    await expect(harness.service.getSkuStocksDeletableFlag(ID.existingSku)).rejects.toThrow(
      DomainError,
    );

    /* No repository call was attempted — there is no member to call. */
    expect(harness.skuRepository.calls).toHaveLength(0);
  });

  it('NET-NEW carries the defect identifier and both legacy locators in the boundary error', async () => {
    /*
     * The gap has to stay legible where it matters — in a log and in a test — which is why the error
     * carries structured facts rather than only prose. `NotImplementedError.member` names the member and
     * the context names the defect, the legacy locator and the caller that can never be satisfied.
     */
    const harness = buildHarness();

    const rejection: unknown = await harness.service.getSkuStocksDeletableFlag(ID.existingSku).then(
      () => undefined,
      (error: unknown) => error,
    );

    if (!(rejection instanceof NotImplementedError)) {
      throw new Error('The member was expected to reject with the unportable-boundary error.');
    }
    expect(rejection.member).toBe('SkuService.getSkuStocksDeletableFlag');
    expect(rejection.context).toEqual({
      skuID: ID.existingSku,
      defect: 'D4',
      locator: 'model/service/SkuService.cfc:L281-L283',
      caller: 'model/entity/Sku.cfc:L567-L572',
    });
  });

  it('NET-NEW rejects inside the promise contract rather than throwing synchronously', async () => {
    /*
     * The declared return type is `Promise<boolean>`, so the failure has to arrive AS a rejected promise.
     * A plain `throw` from a non-`async` promise-returning member escapes before any promise exists and
     * lands as a synchronous exception, which every caller written to the declared contract would miss:
     * `.catch(…)` never attaches, and one `Promise.all` participant throwing synchronously abandons the
     * others instead of settling. Calling it WITHOUT `await` and attaching `.catch` is the only way to
     * tell the two apart, so that is what this case does.
     */
    const harness = buildHarness();
    let caught: unknown;

    /* No `await` on this line on purpose — a synchronous throw would escape here and fail the test. */
    const pending = harness.service.getSkuStocksDeletableFlag(ID.existingSku);
    await pending.catch((error: unknown) => {
      caught = error;
    });

    expect(caught).toBeInstanceOf(NotImplementedError);
  });
});

describe('SkuService.getTransactionExistsFlag', () => {
  /*
   * `model/service/SkuService.cfc:L285-L287`.
   *
   * ===================================================================================================
   * G6 — THE MEMBER DECLARES ZERO ARGUMENTS AND OBSERVABLY TAKES TWO, SO THE PORT DECLARES TWO
   * ===================================================================================================
   * [:L285] declares `public boolean function getTransactionExistsFlag()` — no formal arguments at all —
   * and [:L286] forwards `argumentCollection=arguments`. CFML puts UNDECLARED named arguments into that
   * collection regardless, which is how the two ENTITY call sites,
   * `model/entity/Sku.cfc:L594` (`skuID=`) and `model/entity/Product.cfc:L626` (`productID=`), scope the
   * question through a signature that names neither.
   *
   * ⭐ TR-1 IS THE RULE THAT SETTLES IT. AAP §0.4.2.2's Discrepancy 4 records the DECLARATION — "the
   * service member takes no arguments while the underlying DAO member accepts optional productID and
   * skuID" — and TR-1 says what the port then declares: "Where a legacy signature is loose … the target
   * signature is tightened to the observed contract." Every call this member ever receives scopes the
   * probe, so the observed contract is `(skuID?, productID?)` and that is what the cases below assert.
   *
   * ⚠️ A REVISION NARROWED THIS MEMBER TO ZERO PARAMETERS AND THIS BLOCK ASSERTED THE NARROW SHAPE — that
   * a call forwarded NOTHING, and that every invocation therefore rejected. Review finding F1 withdrew
   * it: a member that discards the only input it is ever given cannot answer the question its callers
   * ask, and the route above it became a permanent 501 for a capability the legacy exercises on every
   * product and SKU delete. The refusal for a genuinely UNSCOPED call is still asserted, because that one
   * IS the legacy's behaviour (`model/dao/SkuDAO.cfc:L90` dereferences a key that is not there) — it is
   * simply no longer the only outcome.
   *
   * WHERE THE CROSSING IS PINNED. This member is SKU-first, matching
   * `SkuTransactionExistenceChecker` in `src/domain/sku/Sku.ts` and
   * `ProductTransactionExistenceChecker` in `src/domain/product/Product.ts`;
   * `SkuRepository.transactionExists` is PRODUCT-first (AAP §0.4.2.6, TR-4 — the DAO's own declaration
   * order at `model/dao/SkuDAO.cfc:L54-L55`). Both identifiers are 32-character strings (IR-6), so a swap
   * type-checks; the slot assertions below are what would catch it.
   * `test/adapters/MySqlSkuRepository.test.ts` owns the same assertions for the checker factory.
   */

  it('NET-NEW declares BOTH optional identifiers, restoring the contract [:L286] forwards', () => {
    /*
     * `Function.length` counts declared parameters before the first default or rest element. Two here,
     * and the guard `SkuServiceAcceptsBothTransactionIdentifiers` in `src/services/SkuService.ts` makes a
     * re-narrowing a build failure; this case makes it a test failure as well, so the regression cannot
     * return quietly through either route.
     */
    const harness = buildHarness({ transactionProductIDs: [ID.product] });

    expect(harness.service.getTransactionExistsFlag.length).toBe(2);
  });

  it('NET-NEW a SKU-scoped probe reaches the repository SECOND slot and answers that SKU alone', async () => {
    /*
     * `model/entity/Sku.cfc:L594` passes `skuID=` and nothing else. The service parameter is FIRST and
     * the repository parameter is SECOND, so the crossing is what this case pins: a `skuID` that arrived
     * in the repository's `productID` slot would query `ss.product.productID = :skuID`, match no row and
     * answer `false` — from a flag whose `false` PERMITS A DELETE.
     */
    const harness = buildHarness({ transactionSkuIDs: [ID.existingSku] });

    await expect(harness.service.getTransactionExistsFlag(ID.existingSku)).resolves.toBe(true);
    await expect(harness.service.getTransactionExistsFlag(ID.secondExistingSku)).resolves.toBe(
      false,
    );

    expect(
      harness.skuRepository.calls.map((call) =>
        call.member === 'transactionExists' ? [call.productID, call.skuID] : call.member,
      ),
    ).toEqual([
      [undefined, ID.existingSku],
      [undefined, ID.secondExistingSku],
    ]);
  });

  it('NET-NEW a product-scoped probe reaches the repository FIRST slot and answers that product alone', async () => {
    /*
     * `model/entity/Product.cfc:L626` passes `productID=` and leaves the SKU slot absent, which is why
     * the service call below supplies `undefined` first. One product participating in a transaction must
     * not make a DIFFERENT product undeletable, so the negative case is asserted alongside the positive.
     */
    const harness = buildHarness({ transactionProductIDs: [ID.product] });

    await expect(harness.service.getTransactionExistsFlag(undefined, ID.product)).resolves.toBe(
      true,
    );
    await expect(
      harness.service.getTransactionExistsFlag(undefined, ID.otherProduct),
    ).resolves.toBe(false);

    expect(
      harness.skuRepository.calls.map((call) =>
        call.member === 'transactionExists' ? [call.productID, call.skuID] : call.member,
      ),
    ).toEqual([
      [ID.product, undefined],
      [ID.otherProduct, undefined],
    ]);
  });

  it("NET-NEW both identifiers are forwarded when both are supplied, and the DAO precedence is the repository's", async () => {
    /*
     * `model/dao/SkuDAO.cfc:L58` lets `skuID` WIN when both are present, and that precedence belongs to
     * the layer that composes the statement. This member forwards BOTH slots rather than dropping one, so
     * the repository can apply the legacy rule where the legacy applies it.
     */
    const harness = buildHarness({
      transactionSkuIDs: [ID.existingSku],
      transactionProductIDs: [ID.otherProduct],
    });

    /* SKU present and participating, product present and also participating: the SKU branch answers. */
    await expect(
      harness.service.getTransactionExistsFlag(ID.existingSku, ID.otherProduct),
    ).resolves.toBe(true);

    /* SKU present but NOT participating: still the SKU branch, so the participating product is ignored. */
    await expect(
      harness.service.getTransactionExistsFlag(ID.secondExistingSku, ID.otherProduct),
    ).resolves.toBe(false);

    const probe = requireAt(harness.skuRepository.calls, 0, 'the transaction probe');

    if (probe.member !== 'transactionExists') {
      throw new Error('The first repository call was expected to be the transaction probe.');
    }
    expect([probe.productID, probe.skuID]).toEqual([ID.otherProduct, ID.existingSku]);
  });

  it('NET-NEW an UNSCOPED probe still raises where the legacy raises, and answers nothing global', async () => {
    /*
     * A genuinely argument-free legacy invocation falls past the `structKeyExists` test at
     * `model/dao/SkuDAO.cfc:L58` and binds `arguments.productID` at [:L90] — dereferencing a key that is
     * not there. The failure is left where the legacy has it rather than pre-empted with a service-side
     * guard (IR-9), and it is emphatically NOT collapsed into a global "does any transaction exist"
     * reading, which is the one answer the legacy can never give. A product that DOES participate is in
     * the fixture precisely so a global reading would resolve `true` and be caught here.
     */
    const harness = buildHarness({ transactionProductIDs: [ID.product] });

    await expect(harness.service.getTransactionExistsFlag()).rejects.toThrow(DomainError);
    /* Not `resolves.toBe(true)`, and not `resolves.toBe(false)`: there is no answer, by design. */
    await expect(harness.service.getTransactionExistsFlag()).rejects.toBeInstanceOf(DomainError);
  });

  it('NET-NEW no identifier is invented to fill either slot, so no unasked question is answered', async () => {
    /*
     * The tempting repair is to default a missing identifier to the empty string, which the query would
     * match no row for and answer `false`. That converts a refusal into a permissive answer on a flag
     * whose `false` PERMITS A DELETE (`model/validation/Product.json:L12`, `model/validation/Sku.json`),
     * so the absence of any defaulting is asserted rather than assumed.
     */
    const harness = buildHarness({ transactionSkuIDs: [ID.existingSku] });

    await expect(harness.service.getTransactionExistsFlag()).rejects.toThrow(DomainError);

    const probes = harness.skuRepository.calls.filter(
      (call) => call.member === 'transactionExists',
    );

    expect(probes).toHaveLength(1);
    for (const probe of probes) {
      if (probe.member !== 'transactionExists') {
        throw new Error('The filter should have retained only transaction probes.');
      }
      expect(probe.productID).toBeUndefined();
      expect(probe.skuID).toBeUndefined();
    }
  });

  it('NET-NEW the branded entity checker reaches the same capability, in the same slots', async () => {
    /*
     * ⭐ THE TWO ROUTES TO ONE CAPABILITY, ASSERTED SIDE BY SIDE. `model/entity/Sku.cfc:L594` and
     * `model/entity/Product.cfc:L626` are ENTITY-level reads, and in the port each entity is handed
     * `createTransactionExistenceChecker` — the production crossing in
     * `src/adapters/mysql/MySqlSkuRepository.ts` — rather than a service. The checker is SKU-first, exactly
     * as this service member now is, so the two agree by construction; this case proves that rather than
     * asserting it in prose.
     */
    const harness = buildHarness({
      transactionProductIDs: [ID.product],
      transactionSkuIDs: [ID.existingSku],
    });
    const checker = createTransactionExistenceChecker(harness.skuRepository.repository);

    /* The SKU-side caller's slot: first — the same slot the service declares first. */
    await expect(checker.getTransactionExistsFlag(ID.existingSku)).resolves.toBe(true);
    await expect(checker.getTransactionExistsFlag(ID.secondExistingSku)).resolves.toBe(false);

    /* The product-side caller's slot: second, with the first left `undefined` as that entity leaves it. */
    await expect(checker.getTransactionExistsFlag(undefined, ID.product)).resolves.toBe(true);
    await expect(checker.getTransactionExistsFlag(undefined, ID.otherProduct)).resolves.toBe(false);

    expect(
      harness.skuRepository.calls.map((call) =>
        call.member === 'transactionExists' ? [call.productID, call.skuID] : call.member,
      ),
    ).toEqual([
      [undefined, ID.existingSku],
      [undefined, ID.secondExistingSku],
      [ID.product, undefined],
      [ID.otherProduct, undefined],
    ]);

    /* And the brand, which is what makes binding the service member where a checker is expected — the two
     * orders happen to agree, so assignability alone would permit it — a type error. */
    expect(checker.argumentOrder).toBe('skuID-first-productID-second');
  });
});

describe('SkuService.getSkuBySkuCode', () => {
  /*
   * `model/service/SkuService.cfc:L289-L291`.
   *
   * ⚠️ THE ARGUMENT IS OPTIONAL HERE AND REQUIRED ONE LAYER DOWN. [:L289] declares `string skuCode`
   * with no `required`, while `model/dao/SkuDAO.cfc:L102` declares `required string skuCode`. The loose
   * service surface is preserved — tightening it would reject a call the legacy accepts — and the DAO's
   * requirement is reproduced as an explicit failure.
   */

  it('NET-NEW finds a SKU by its primary code and forwards the value untransformed', async () => {
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );
    const stored = buildSku({ skuID: ID.existingSku, skuCode: 'SHIRT-1', price: 10, product });
    const harness = buildHarness({ storedSkus: [stored] });

    await expect(harness.service.getSkuBySkuCode('SHIRT-1')).resolves.toBe(stored);

    const call = requireAt(harness.skuRepository.calls, 0, 'the code lookup');
    if (call.member !== 'findBySkuCode') {
      throw new Error('The first repository call was expected to be the SKU-code lookup.');
    }
    /* Not trimmed, not upper-cased, not padded — the value arrives exactly as the caller wrote it. */
    expect(call.skuCode).toBe('SHIRT-1');
  });

  it('NET-NEW TR-4 — the one supplied value is bound in BOTH positions, primary and alternate', async () => {
    /*
     * `model/dao/SkuDAO.cfc:L102-L104` is a single statement with a LEFT JOIN to the alternate-code
     * table and `:skuCode` bound in TWO places — the primary column and the alternate column. TR-4
     * requires the port to bind ONE value into both positions, in the legacy order, rather than deriving
     * two independently transformed values.
     *
     * ⭐ THE STRONGEST OBSERVABLE FORM OF "ONE VALUE, TWO POSITIONS" is to make the two positions match
     * DIFFERENT SKUs with the SAME value. `ormExecuteQuery(…, true)` asks for a unique result and there
     * is no `LIMIT` to lean on, so two matches is a data-integrity failure rather than a silent
     * first-row win. That failure can only occur if the single value really did reach both positions: a
     * port that bound the primary column alone would match exactly one SKU and answer it happily.
     */
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );
    const primaryMatch = buildSku({
      skuID: ID.existingSku,
      skuCode: 'SHARED-CODE',
      price: 10,
      product,
    });
    const alternateMatch = buildSku({
      skuID: ID.secondExistingSku,
      skuCode: 'ITS-OWN-CODE',
      price: 10,
      product,
    });
    const harness = buildHarness({
      storedSkus: [primaryMatch, alternateMatch],
      alternateSkuCodes: [{ skuID: ID.secondExistingSku, alternateSkuCode: 'SHARED-CODE' }],
    });

    await expect(harness.service.getSkuBySkuCode('SHARED-CODE')).rejects.toThrow(DomainError);

    /* Exactly ONE value was handed down — the two positions are the query's business, not the caller's. */
    const call = requireAt(harness.skuRepository.calls, 0, 'the code lookup');
    expect(call.member === 'findBySkuCode' && call.skuCode).toBe('SHARED-CODE');
  });

  it('NET-NEW falls back to the alternate code when no primary code matches', async () => {
    /* The LEFT JOIN half of [:L102-L104], reached on its own. */
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );
    const stored = buildSku({ skuID: ID.existingSku, skuCode: 'ITS-OWN-CODE', price: 10, product });
    const harness = buildHarness({
      storedSkus: [stored],
      alternateSkuCodes: [{ skuID: ID.existingSku, alternateSkuCode: 'LEGACY-CODE' }],
    });

    await expect(harness.service.getSkuBySkuCode('LEGACY-CODE')).resolves.toBe(stored);
  });

  it('NET-NEW answers a miss with null, because the out-of-scope caller counts misses', async () => {
    /*
     * ⚠️ THE NULL RETURN IS PART OF THE CONTRACT AND MUST NOT BECOME A THROW.
     * `model/service/PhysicalService.cfc:L199-L201` does
     * `var sku = getSkuService().getSkuBySkuCode( physicalCountItem.getSkuCode() ); if( !isNull(sku) ){ … }`
     * — it treats a miss as a data-quality tally during an import, so raising on a miss would convert a
     * benign import warning into a failed import for an out-of-scope module this slice must not break.
     */
    const harness = buildHarness();

    await expect(harness.service.getSkuBySkuCode('NOTHING-MATCHES')).resolves.toBeNull();
  });

  it('NET-NEW raises when the optional code is omitted, reproducing the layer below', async () => {
    /*
     * The signature stays loose so the legacy call surface is preserved, and the DAO's own `required`
     * declaration is honoured as an explicit failure. No repository call is attempted, because the
     * legacy has nothing to bind either.
     */
    const harness = buildHarness();

    await expect(harness.service.getSkuBySkuCode()).rejects.toThrow(DomainError);
    expect(harness.skuRepository.calls).toHaveLength(0);
  });
});

describe('SkuService.getSkuSmartList', () => {
  /*
   * `model/service/SkuService.cfc:L309-L324`.
   *
   * The legacy builds a MUTABLE smart list and hands it back; this port is declare-then-execute, so the
   * selection is composed as one typed query and executed through `SmartListQueryPort`. The
   * transformation is asserted against the legacy statement list rather than against the port's shape.
   *
   * ⚠️ `currentURL` IS ACCEPTED AND DELIBERATELY NOT FORWARDED. [:L309] declares it and [:L312] passes
   * it into the smart list, where it exists to build saved-state and paging URLs for the CFML view layer
   * (`org/Hibachi/HibachiSmartList.cfc:L39`). There is no view layer in a headless service (AAP §0.3.4),
   * so the parameter is KEPT for call compatibility and not carried into the query.
   */

  /* The joins [:L314-L316] registers, in the legacy's own order. */
  const EXPECTED_JOINS: readonly SmartListJoin[] = [
    { parentEntityName: 'SlatwallSku', relatedProperty: 'product' },
    { parentEntityName: 'SlatwallProduct', relatedProperty: 'productType' },
    { parentEntityName: 'SlatwallSku', relatedProperty: 'alternateSkuCodes', joinType: 'left' },
  ];

  it('NET-NEW composes the SlatwallSku selection with its three joins and five keyword properties', async () => {
    /*
     * [:L311] names the entity; [:L314-L316] register the three related properties, the third as a LEFT
     * join because a SKU need not have an alternate code; [:L318-L322] register five keyword properties,
     * each at weight 1.
     */
    const harness = buildHarness();

    await harness.service.getSkuSmartList();

    const query = harness.skuQueries.lastQuery();
    if (query === undefined) {
      throw new Error('The smart-list port was expected to receive one composed query.');
    }
    expect(query.entityName).toBe('SlatwallSku');
    expect(query.joins).toEqual(EXPECTED_JOINS);
    expect(query.keywordProperties).toEqual([
      { propertyIdentifier: 'skuCode', weight: 1 },
      { propertyIdentifier: 'skuID', weight: 1 },
      { propertyIdentifier: 'product.productName', weight: 1 },
      { propertyIdentifier: 'product.productType.productTypeName', weight: 1 },
      { propertyIdentifier: 'alternateSkuCodes.alternateSkuCode', weight: 1 },
    ]);

    /* Every keyword property carries the SAME weight — the legacy passes 1 five times over. */
    expect(new Set((query.keywordProperties ?? []).map((property) => property.weight))).toEqual(
      new Set([1]),
    );

    /* It asked for all three legacy views, which is what a paged reading needs. */
    expect(harness.skuQueries.executions.map((execution) => execution.selection)).toEqual([
      'allViews',
    ]);
  });

  it('NET-NEW defaults to no filters, no keywords and no pagination when the caller passes nothing', async () => {
    /*
     * [:L309] defaults `data` to an empty struct, so the prefix scan at
     * `org/Hibachi/HibachiSmartList.cfc:L96-L136` finds nothing to apply. The composed query therefore
     * carries the structural members and NOTHING else — no empty filter group, no empty keyword list, no
     * zeroed pagination, because inventing any of those would describe a selection the legacy never made.
     */
    const harness = buildHarness();

    await harness.service.getSkuSmartList();

    const query = harness.skuQueries.lastQuery();
    if (query === undefined) {
      throw new Error('The smart-list port was expected to receive one composed query.');
    }
    expect(Object.keys(query).sort()).toEqual(['entityName', 'joins', 'keywordProperties']);
  });

  it('NET-NEW forwards a caller filter and keyword explicitly, and accepts but does not carry currentURL', async () => {
    /*
     * The `F:` and `keywords` request keys are the legacy prefix conventions
     * (`org/Hibachi/HibachiSmartList.cfc:L100-L101` and [:L137-L151]). `currentURL` is supplied here
     * precisely so its absence from the composed query is observable.
     */
    const harness = buildHarness();

    await harness.service.getSkuSmartList(
      { 'F:activeFlag': 1, keywords: 'red shirt' },
      '/index.cfm?slatAction=admin:product.listSku',
    );

    const query = harness.skuQueries.lastQuery();
    if (query === undefined) {
      throw new Error('The smart-list port was expected to receive one composed query.');
    }
    expect(query.whereGroups).toEqual([
      { filters: [{ propertyIdentifier: 'activeFlag', value: 1 }] },
    ]);
    expect(query.keywords).toEqual(['red', 'shirt']);
    /* No member of the composed query holds the URL — it is accepted and dropped. */
    expect(JSON.stringify(query)).not.toContain('slatAction');
  });

  it("NET-NEW appends a caller's joins — carried in `data`, since the signature has only TWO parameters (finding F2c)", async () => {
    /*
     * ⛔ THIS CASE USED TO PASS THE JOINS AS A THIRD ARGUMENT, AND REVIEW FINDING F2c REMOVED THAT
     * PARAMETER. AAP §0.4.2.2 tabulates `getSkuSmartList(data?: SmartListInput, currentURL?: string)` and
     * `model/service/SkuService.cfc:L309` declares exactly `(struct data={}, currentURL="")`, so a third
     * parameter broke the method-by-method parity check §0.8.3.1 asks for. The contribution therefore
     * travels where the ONE production consumer already carries it — inside `data`, under
     * `SmartListInput.additionalJoins`, which is the channel `translateSmartListInput` reads.
     *
     * `integrationServices/google/controllers/feed.cfc:L64-L66` registers three further related
     * properties on the SAME smart list this member already seeded, and its first repeats
     * `SlatwallSku -> product` verbatim.
     *
     * ⭐ THE LEGACY DOES NOT EMIT THAT JOIN TWICE, AND THE SOURCE SAYS SO.
     * `org/Hibachi/HibachiSmartList.cfc:L212` guards the whole registration with
     * `if(!structKeyExists(variables.entities, newEntityName))`, and [:L549] builds the FROM clause by
     * walking that same struct — one join per registered entity, never one per call. The absorption now
     * happens where the legacy's own absorption happens, in the EMITTER:
     * `test/adapters/SmartListQueryBuilder.test.ts` asserts that a merged and an un-merged join list
     * compile to a byte-identical statement, so the repeat below reaching the query is faithful rather
     * than a regression.
     */
    const harness = buildHarness();

    /*
     * The feed's own three, written out here rather than imported: this file may not import from
     * `src/integrations/google/**`, and restating them by locator keeps the coverage without the
     * dependency. The first is the verbatim repeat of [:L314]; the second and third both name
     * `SlatwallProduct` as their parent, which is an entity the FIRST of the base joins is what
     * registers — so order is load-bearing, not merely conventional.
     */
    await harness.service.getSkuSmartList({
      additionalJoins: [
        /* integrationServices/google/controllers/feed.cfc:L64 — the repeat. */
        { parentEntityName: 'SlatwallSku', relatedProperty: 'product' },
        /* integrationServices/google/controllers/feed.cfc:L65 */
        { parentEntityName: 'SlatwallProduct', relatedProperty: 'defaultSku' },
        /* integrationServices/google/controllers/feed.cfc:L66 — a LEFT join, because brand is optional. */
        { parentEntityName: 'SlatwallProduct', relatedProperty: 'brand', joinType: 'left' },
      ],
    });

    const query = harness.skuQueries.lastQuery();
    if (query === undefined) {
      throw new Error('The smart-list port was expected to receive one composed query.');
    }
    /*
     * The composed list is asserted EXPLICITLY rather than by checking only that `brand` appears: the
     * service's own three come FIRST, in their declaration order, and the caller's three follow — which is
     * the order `feed.cfc` produces by mutating the list the service had already seeded.
     */
    expect(query.joins).toEqual([
      ...EXPECTED_JOINS,
      { parentEntityName: 'SlatwallSku', relatedProperty: 'product' },
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'defaultSku' },
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'brand', joinType: 'left' },
    ]);
    /* The brand join keeps its LEFT polarity, which is load-bearing: an inner join would silently drop
     * every product with no brand from the feed. */
    expect(query.joins?.[5]?.joinType).toBe('left');
  });

  it('NET-NEW leaves the base join set exactly as it was when `data` carries no joins', async () => {
    /*
     * `additionalJoins` is optional and contributes nothing by default, which is what keeps every existing
     * legacy call site — all of them argument-less — unaffected.
     */
    const harness = buildHarness();

    await harness.service.getSkuSmartList({ 'F:skuCode': 'ABC-1' });

    expect(harness.skuQueries.lastQuery()?.joins).toEqual(EXPECTED_JOINS);
  });

  it('NET-NEW returns the port page unchanged, without re-counting or re-slicing it', async () => {
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );
    const first = buildSku({ skuID: ID.existingSku, skuCode: 'PAGE-1', price: 10, product });
    const second = buildSku({ skuID: ID.secondExistingSku, skuCode: 'PAGE-2', price: 10, product });
    const harness = buildHarness({
      skuSmartListOutcomes: [
        { kind: 'page', metrics: { recordsCount: 2, totalPages: 1 }, records: [first, second] },
      ],
    });

    const page = await harness.service.getSkuSmartList();

    expect(page.records).toEqual([first, second]);
    expect(page.recordsCount).toBe(2);
    expect(page.totalPages).toBe(1);
  });

  it('NET-NEW M7 — two fresh instances share no memo, no query log and no backing data', async () => {
    /*
     * AAP §0.6.6 M7. The legacy memoises the option-group sort-order ceiling in the DAO's own
     * `variables` scope (`model/dao/SkuDAO.cfc:L204-L220`), which on a persistent CFML server is
     * effectively a singleton over a WHOLE-TABLE aggregate. Hoisting the equivalent to module scope in a
     * Lambda would let one warm invocation read a ceiling computed for a DIFFERENT tenant's data.
     *
     * ⚠️ AND `clearNextOptionGroupSortOrder()` CANNOT SAVE IT: [:L224-L228] has an inverted guard and
     * deletes the key only when the key is ABSENT (defect D7), so the memo is never actually cleared.
     * Isolation therefore has to come from construction rather than from clearing, which is exactly what
     * this case asserts — two harnesses, distinct backing data, no bleed in either direction.
     */
    const { options } = buildColorAndSizeOptions();
    const buildTwoSkuProduct = (): Product => {
      const product = buildEmptyProduct(
        buildSeededProductType(
          MERCHANDISE_PRODUCT_TYPE.systemCode,
          MERCHANDISE_PRODUCT_TYPE.productTypeID,
        ),
      );
      buildSku({
        skuID: ID.existingSku,
        skuCode: 'M7-RED',
        price: 10,
        options: [requireAt(options, 0, 'the red option')],
        product,
      });
      buildSku({
        skuID: ID.secondExistingSku,
        skuCode: 'M7-BLUE',
        price: 10,
        options: [requireAt(options, 1, 'the blue option')],
        product,
      });

      return product;
    };

    const productOne = buildTwoSkuProduct();
    const productTwo = buildTwoSkuProduct();
    const invocationOne = buildHarness({
      storedSkus: readProductSkus(productOne),
      nextOptionGroupSortOrder: 5,
    });
    const invocationTwo = buildHarness({
      storedSkus: readProductSkus(productTwo),
      nextOptionGroupSortOrder: 9,
    });

    expect(invocationOne.skuRepository.optionGroupSortOrderMemoValue()).toBeUndefined();
    expect(invocationTwo.skuRepository.optionGroupSortOrderMemoValue()).toBeUndefined();

    await invocationOne.service.getSortedProductSkus(productOne);
    expect(invocationOne.skuRepository.optionGroupSortOrderMemoValue()).toBe(5);
    expect(invocationTwo.skuRepository.optionGroupSortOrderMemoValue()).toBeUndefined();

    await invocationTwo.service.getSkuSmartList();
    expect(invocationOne.skuQueries.queries).toHaveLength(0);
    expect(invocationTwo.skuQueries.queries).toHaveLength(1);
    expect(invocationOne.skuRepository.calls.map((call) => call.member)).toEqual([
      'findSortedSkuIdsByProduct',
    ]);
    expect(invocationTwo.skuRepository.calls).toHaveLength(0);
  });
});

describe('SkuService — parity, scope and negative checks', () => {
  /*
   * The cases above pin each member's behavior. These pin the properties that hold ACROSS members, and
   * that a well-meaning change would quietly break: the shape of the dependency graph, the closed set of
   * branch keys, the branch-local reach of each out-of-scope boundary, and the absence of any state that
   * survives one service instance.
   */

  it('NET-NEW declares exactly the ten required collaborators, with no dead productService injection', async () => {
    /*
     * AAP §0.6.3.2 counted the call sites behind every declared and dynamic dependency of
     * `model/service/SkuService.cfc:L51-L56`. The result:
     *   skuDAO                     8 sites  → SkuRepository
     *   optionService              1 site   → OptionService
     *   subscriptionService        3 sites  → SubscriptionTermPort   (out of scope, TR-5)
     *   contentService             2 sites  → AccessContentPort      (out of scope, TR-5)
     *   getService("imageService") 1 site   → ImagePathPort          (HIDDEN — never declared)
     *   productService [:L54]      0 sites  → NOT WIRED
     * plus the four collaborators the port needs because the framework no longer supplies them: the
     * smart-list query port, the validator, the product-type root resolver, and the default-SKU delegate
     * binder, because `Product.defaultSku` is a delegate rather than a `Sku`.
     *
     * That is NINE, every one of them positional and required. An extra would mean something was added
     * without a call site to justify it; a missing one would mean a live collaborator had been folded into
     * another.
     *
     * ⛔ A TENTH REQUIRED COLLABORATOR, `imageStorageRoot`, ONCE SAT AFTER THE IMAGE PORT, AND IT IS
     * WITHDRAWN. It bounded the one WRITE this service performs against a configured root. That root had no
     * legacy counterpart to derive a value from — the legacy COMPOSES image paths but never CHECKS
     * containment anywhere — so it was invented configuration (AAP §0.7.3 S9, IR-12), and its refusal
     * RAISED where `model/service/SkuService.cfc:L210-L218` returns only `true` or `false`. A narrower
     * successor — a predicate over the stored name, transcribing the rule
     * `model/entity/Sku.cfc:L131-L139` already states — then answered the same CWE-22/CWE-434 concern
     * without a root and without raising, and review finding F4 withdrew that too, on the precedence ground
     * that AAP §0.6.7.7 declares D18 the SINGLE behaviour-hardening exception in this port. NOTHING gates
     * the write now; the exposure is carried and flagged on `ImagePathPort.saveImageFile`.
     *
     * ⭐ THE TENTH IS `combinationBudget`, IT IS REQUIRED, AND ITS POSITION HAS MOVED TWICE — SO THE WHOLE
     * HISTORY IS KEPT HERE RATHER THAN THE CURRENT STATE ALONE.
     *   1. It first sat last as an OPTIONAL parameter, letting an operator state a ceiling on how many
     *      combinations one `createSkus` request may enumerate.
     *   2. A revision WITHDREW it, arguing: "A configurable request ceiling is a capability the legacy does
     *      not have and no AAP row asks for (AAP §0.7.3 S9, IR-12), and it changed the outcome of every
     *      request it refused (AAP §0.6.7.7, §0.8.2 Guideline 4)."
     *   3. THAT ARGUMENT IS WRONG, and review finding SEC-DOS-01 is the correction. §0.6.7 is the DEFECT
     *      AND TODO CARRY-OVER REGISTER — twenty-one LEGACY BUSINESS-LOGIC defects, of which D18 is the one
     *      the port repairs. The availability of the extracted service is not an entry in it, and reading
     *      D18's exception as the sole licence to bound anything would make §0.6.7.7 say that a migration
     *      must reproduce a resource-exhaustion vector. Guideline 4 forbids enhancing BUSINESS LOGIC; the
     *      ceiling changes not one generated SKU for any request it admits. And §0.7.3 S8 — "flag mismatches
     *      rather than assume them away" — is discharged by the `TODO(parity)` blocks recording the LEGACY
     *      as unbounded, not by leaving the PORT unbounded.
     *   4. IR-12 AND S9 ARE HONOURED EXACTLY, WHICH IS WHY IT IS A BUDGET AND NOT A NUMBER. The port
     *      authors no figure: the ceiling is reached through a RESOLVER that raises a named
     *      `ConfigurationError` reporting `CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST` when a deployment
     *      stated none. The only change from step 1 is optional → REQUIRED, because an optional budget left
     *      the unbounded enumeration reachable by default, which is precisely the finding.
     *
     * TEN parameters, every one required and positional. `Function.length` counts the leading parameters
     * up to the first one carrying a DEFAULT, so ten is the checkable form of the claim, and it also
     * proves no parameter acquired a default — which would let a caller silently construct the service
     * without a collaborator it needs, and in the budget's case would restore the unbounded default.
     */
    expect(SkuService.length).toBe(10);

    /*
     * The dead injection is absent BEHAVIOURALLY as well as structurally: a full merchandise batch
     * completes with no product-service collaborator in existence at all. If one were wired, this file
     * would have had to construct it.
     */
    const { options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await expect(
      harness.service.createSkus(product, {
        price: TEST_MERCHANDISE_PRODUCT_PRICE,
        options: `${ID.red},${ID.small}`,
      }),
    ).resolves.toBe(true);
    expect(harness.skuRepository.persisted).toHaveLength(1);
  });

  it('NET-NEW recognises exactly the three seeded discriminators and nothing else', async () => {
    /*
     * `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` seeds three `systemCode`/UUID pairs and they
     * are the literal branch keys of `model/service/SkuService.cfc:L61`, [:L139] and [:L173]. The union
     * is CLOSED: a fourth key reaches the fallthrough at [:L203-L204].
     *
     * The three codes are read from `test/fixtures/productTypes.ts` rather than retyped, and the UUIDs
     * are never repeated as literals anywhere in this file (IR-7), so a fixture change cannot leave a
     * stale copy behind here.
     */
    const recognised: readonly BaseProductType[] = ['merchandise', 'subscription', 'contentAccess'];

    expect(recognised).toContain(MERCHANDISE_PRODUCT_TYPE.systemCode);
    expect(recognised).toContain(SUBSCRIPTION_PRODUCT_TYPE.systemCode);
    expect(recognised).toContain(CONTENT_ACCESS_PRODUCT_TYPE.systemCode);
    /* Three distinct codes over three distinct identifiers — no fixture aliases another. */
    expect(
      new Set([
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
        SUBSCRIPTION_PRODUCT_TYPE.productTypeID,
        CONTENT_ACCESS_PRODUCT_TYPE.productTypeID,
      ]).size,
    ).toBe(3);

    /*
     * A fourth key raises the imported message. The literal is NOT retyped here — it is the constant the
     * port raises — so the legacy text at [:L204] has exactly one spelling in the whole subtree.
     */
    const harness = buildHarness();
    const giftCardProduct = buildEmptyProduct(
      buildSeededProductType('giftCard', ID.childProductType),
    );

    await expect(harness.service.createSkus(giftCardProduct, { price: 10 })).rejects.toThrow(
      UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE,
    );
  });

  it('NET-NEW keeps every out-of-scope boundary inside the branch that owns it', async () => {
    /*
     * TR-5 and AAP §0.2.2.6. Each branch of `createSkus` crosses only ITS OWN boundary: the merchandise
     * odometer never asks the subscription or content ports anything, and neither non-merchandise branch
     * asks the other. A port consulted outside its branch would mean the boundary had widened, which is
     * precisely how a slice of this kind grows until it has swallowed the platform.
     *
     * The image boundary is checked too: none of the three creation branches touches an image, so a
     * single call there would mean image handling had leaked into creation.
     */
    const { options } = buildColorAndSizeOptions();
    const merchandise = buildHarness({ resolvableOptions: options });
    const merchandiseProduct = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await merchandise.service.createSkus(merchandiseProduct, {
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      options: `${ID.red},${ID.small}`,
    });

    expect(merchandise.subscriptionTerms.calls).toHaveLength(0);
    expect(merchandise.accessContents.requestedContentIds).toHaveLength(0);
    expect(merchandise.imagePaths.calls).toHaveLength(0);
    /* Nor did creation reach for a smart list — the option lookup is a records read on its own port. */
    expect(merchandise.skuQueries.queries).toHaveLength(0);

    const subscription = buildHarness({
      subscriptionBenefitIDs: [ID.benefit, ID.renewalBenefit],
      subscriptionTermIDs: [ID.monthlyTerm],
    });
    const subscriptionProduct = buildEmptyProduct(
      buildSeededProductType(
        SUBSCRIPTION_PRODUCT_TYPE.systemCode,
        SUBSCRIPTION_PRODUCT_TYPE.productTypeID,
      ),
    );

    await subscription.service.createSkus(subscriptionProduct, {
      price: 25,
      subscriptionBenefits: ID.benefit,
      subscriptionTerms: ID.monthlyTerm,
      /*
       * Supplied because [:L163] reads `data.renewalSubscriptionBenefits` with NO `structKeyExists`
       * guard, AFTER the gate at [:L152] — so an absent key raises rather than defaulting to none. That
       * unguarded read is asserted on its own in the subscription block above; here the key is present
       * so this case can reach the boundary-reach question it exists to ask.
       */
      renewalSubscriptionBenefits: ID.renewalBenefit,
    });

    expect(subscription.subscriptionTerms.calls.length).toBeGreaterThan(0);
    expect(subscription.accessContents.requestedContentIds).toHaveLength(0);
    expect(subscription.imagePaths.calls).toHaveLength(0);

    const contentAccess = buildHarness({ contentIDs: [ID.firstContent] });
    const contentAccessProduct = buildEmptyProduct(
      buildSeededProductType(
        CONTENT_ACCESS_PRODUCT_TYPE.systemCode,
        CONTENT_ACCESS_PRODUCT_TYPE.productTypeID,
      ),
    );

    await contentAccess.service.createSkus(contentAccessProduct, {
      price: 40,
      accessContents: ID.firstContent,
    });

    expect(contentAccess.accessContents.requestedContentIds.length).toBeGreaterThan(0);
    expect(contentAccess.subscriptionTerms.calls).toHaveLength(0);
    expect(contentAccess.imagePaths.calls).toHaveLength(0);
  });

  it('NET-NEW produces byte-identical results from two independent runs of the same scenario', async () => {
    /*
     * The negative form of the no-module-state rule stated in this file's header, and the counterpart to
     * the M7 case on the smart list. If ANY counter, cache, memo or accumulated array outlived a service
     * instance — a SKU-code suffix counter, an odometer position, a resolved-option map — the second run
     * would differ from the first. Two fresh graphs over identical input must agree on everything
     * observable: the codes, the option sets, the enumeration order and the default binding.
     *
     * ⭐ WHY THIS MATTERS MORE HERE THAN IN A PERSISTENT SERVER. A warm Lambda container keeps module
     * scope alive across invocations for DIFFERENT callers (AAP §0.6.6 M7), so leaked state is not merely
     * untidy — it is cross-request data exposure. The legacy's own memoised sort-order cache
     * (`model/dao/SkuDAO.cfc:L204-L220`) is exactly that hazard, and its clear function is broken
     * (defect D7), so construction-time isolation is the only defence available.
     */
    const runOnce = async (): Promise<{
      readonly codes: readonly (string | undefined)[];
      readonly optionSets: readonly string[];
      readonly defaultBindings: number;
    }> => {
      const { options } = buildColorAndSizeOptions();
      const harness = buildHarness({ resolvableOptions: options });
      const product = buildEmptyProduct(
        buildSeededProductType(
          MERCHANDISE_PRODUCT_TYPE.systemCode,
          MERCHANDISE_PRODUCT_TYPE.productTypeID,
        ),
      );

      await harness.service.createSkus(product, {
        price: TEST_MERCHANDISE_PRODUCT_PRICE,
        options: `${ID.red},${ID.blue},${ID.small},${ID.large}`,
      });

      return {
        codes: harness.skuRepository.persisted.map((sku) => sku.skuCode),
        optionSets: harness.skuRepository.persisted.map(describeOptions),
        defaultBindings: harness.defaultSkuBindings.length,
      };
    };

    const first = await runOnce();
    const second = await runOnce();

    expect(second).toEqual(first);
    expect(first.codes).toEqual([
      `${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}1`,
      `${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}2`,
      `${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}3`,
      `${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}4`,
    ]);
    expect(first.defaultBindings).toBe(1);
  });

  it('NET-NEW exposes the nine ported members plus the declared new* replacement, and NOTHING ELSE — closed in both directions', () => {
    /*
     * TR-1 — the observable contract of this service is its public method surface, and AAP §0.4.2.2
     * enumerates it as NINE members, to which IR-1 adds `newSku`. This case closes the set in BOTH
     * directions, and the two directions need two different mechanisms because only one of them can be
     * observed at run time.
     *
     * ⚠️ AN EARLIER REVISION OF THIS CASE CLAIMED TO BE BIDIRECTIONAL AND WAS NOT. It looped the nine
     * names asserting `typeof surface[member] === 'function'`, which proves only that nothing was LOST.
     * Nothing in it could fail when a member was ADDED — and two were: `searchSkusByProductTypeBounded`
     * and `getSkuSmartListRecords` were declared here, compiled cleanly, were individually documented,
     * and this case passed the whole time. Both have been withdrawn, and the mechanism below is what
     * makes their return a failure rather than a diff nobody is obliged to read.
     *
     * ⭐ `newSku()` IS ON THE LIST AND IT HAS NO SOURCE DECLARATION. It exists in the legacy only because
     * `org/Hibachi/HibachiService.cfc:L255-L281` fabricates `new*` by prefix, and the combination engine
     * calls it. Under `strict` TypeScript there is no equivalent facility, so IR-1 requires it to be
     * declared explicitly — which is why it appears here alongside the nine rather than being reachable
     * through a dynamic fallback.
     *
     * ⛔ AND THE SURFACE CARRIES NO ADDITIVE MEMBERS, WHICH REVERSES WHAT THIS PARAGRAPH USED TO ARGUE.
     * It read: the surface "CARRIES TWO ADDITIVE MEMBERS, WHICH ARE NAMED HERE RATHER THAN DENIED", on the
     * ground that `searchSkusByProductTypeBounded` and `getSkuSmartListRecords` were "public, live, and
     * additive", that neither added a business rule, and that each existed for a recorded execution-model
     * reason. Every factual clause in that argument was true and the conclusion still does not follow,
     * because it answers the wrong question: not whether the additions were HARMLESS, but whether they
     * were AUTHORISED. AAP §0.4.2.2 fixes this service at nine ported members and IR-1 adds exactly one
     * more; §0.8.3.1 makes that surface the artefact a reviewer checks "method-by-method"; §0.4.2.5
     * declines to reproduce synthesis "wholesale, only where used"; §0.7.3 S9 forbids inventing a "batch"
     * or a page bound; and §0.1.1.1 records that this migration is "Explicitly not: Performance
     * refactoring". An inventory that DESCRIBES an unauthorised member accurately still ratifies it.
     *
     * ⭐ AND THE EXECUTION-MODEL REASON WAS REAL, SO IT IS ANSWERED RATHER THAN DISMISSED. A stateless
     * invocation genuinely cannot hold an unbounded result set the way a persistent request could. That
     * belongs to the layer composing the statement, not to this public surface: the materialisation
     * budget in `../../src/adapters/mysql/SmartListQueryBuilder.ts` refuses an over-large read on the
     * COUNT, before a row is fetched, and adds no member here.
     *
     * The check is therefore written in two parts — the ten authorised names, and the compiler-enforced
     * closure that makes any eleventh a build failure — with a closing gate on the members the legacy
     * would have fabricated by prefix and this slice never calls.
     *
     * ⛔ THAT CLOSING GATE IS THE SECOND DIRECTION, AND IT IS WORTH STATING IN FULL. AAP §0.4.2.5 says
     * `onMissingMethod` synthesis "is not reproduced wholesale, only where used", and `new*` — as
     * `newSku` — is the only prefix the slice actually calls on this service, so it is the only one
     * declared. The rest of what `org/Hibachi/HibachiService.cfc:L255-L281` would have fabricated by
     * prefix — `get*`, `list*`, `save*`, `delete*`, `count*`, `export*`, `process*` — has no declaration
     * at all. (`getSkuSmartList` is NOT among them: `model/service/SkuService.cfc:L309` declares it in
     * source, so it is a ported member rather than a synthesised one.) Asserting the fabricated set is
     * ABSENT is what makes "no invented sibling" checkable instead of merely stated: a future edit that
     * reflexively fills the CRUD surface out fails here rather than passing review as an addition nobody
     * is obliged to notice.
     *
     * ⚠️ AND THE CASE DELIBERATELY DOES NOT ENUMERATE THE CLASS'S PRIVATE HELPERS. `private` is erased at
     * run time, so an exhaustive prototype listing would couple this assertion to internals that carry no
     * contract — and every refactor of a helper would then fail a test about the PUBLIC surface.
     */

    /*
     * DIRECTION ONE — NOTHING WAS LOST, AND EVERY NAME LISTED IS GENUINELY PUBLIC. The `satisfies`
     * clause is doing real work: `keyof SkuService` resolves to the PUBLIC members only, so a typo, a
     * removal, or a member demoted to `private` makes this list stop compiling.
     */
    const authorized = [
      'createSkus',
      'processImageUpload',
      'getProductSkus',
      'getSortedProductSkus',
      'searchSkusByProductType',
      'getSkuStocksDeletableFlag',
      'getTransactionExistsFlag',
      'getSkuBySkuCode',
      'getSkuSmartList',
      'newSku',
    ] as const satisfies readonly (keyof SkuService)[];

    const harness = buildHarness();
    const surface = harness.service;

    for (const member of authorized) {
      expect(typeof surface[member]).toBe('function');
    }
    expect(authorized).toHaveLength(10);

    /*
     * ⛔ THE ARITY OF THE ONE SURVIVING SEARCH MEMBER, because a withdrawn sibling is the drift this
     * member is most exposed to. `searchSkusByProductType` declares BOTH arguments optional
     * ([model/service/SkuService.cfc:L271] — AAP §0.4.2.2 Discrepancy 3), so it has arity 2. A windowed
     * form re-added by taking the window FIRST would declare 3, and would fail here as well as at the
     * compiler-enforced closure below.
     */
    expect(surface.searchSkusByProductType).toHaveLength(2);

    /*
     * DIRECTION TWO — NOTHING WAS ADDED, ENFORCED BY THE COMPILER RATHER THAN BY A RUNTIME SCAN.
     *
     * ⭐ WHY THIS HALF CANNOT BE A RUNTIME PROTOTYPE ENUMERATION, AS IT IS IN `OptionService.test.ts`.
     * `private` is erased: every one of this service's fifteen private helpers — the odometer, the three
     * per-branch creators, the resolvers, the rule-set builder, the smart-list composer — is an own
     * property of `SkuService.prototype` at run time, indistinguishable from a public member. A
     * `toStrictEqual` over `getOwnPropertyNames` would therefore have to enumerate the internals too,
     * and would then fail on every private rename while saying nothing about parity.
     *
     * `keyof SkuService` is exactly the distinction run time lacks. If a public member is added and not
     * authorised above, `UnauthorizedPublicMember` resolves to its name instead of `never`, the
     * conditional type resolves to `never`, and assigning `true` to it fails to compile — here, in this
     * file, under both `npm run typecheck` and `ts-jest` when this suite runs.
     */
    type UnauthorizedPublicMember = Exclude<keyof SkuService, (typeof authorized)[number]>;
    const surfaceIsClosed: [UnauthorizedPublicMember] extends [never] ? true : never = true;
    expect(surfaceIsClosed).toBe(true);

    /*
     * And the two withdrawn members named by name, so a reader learns WHICH additions were removed
     * without diffing history. AAP §0.4.2.2 fixes the surface at nine, §0.8.3.1 makes it the artefact a
     * reviewer checks "method-by-method", §0.7.3 S9 forbids inventing a "batch" or a page bound, and
     * §0.1.1.1 records that this migration is "Explicitly not: Performance refactoring".
     */
    for (const withdrawn of ['searchSkusByProductTypeBounded', 'getSkuSmartListRecords']) {
      expect(Object.getOwnPropertyDescriptor(SkuService.prototype, withdrawn)).toBeUndefined();
    }

    for (const declined of [
      'getSku',
      'listSku',
      'saveSku',
      'deleteSku',
      'countSku',
      'exportSku',
      'processSku',
    ] as const) {
      expect(declined in surface).toBe(false);
    }

    const minted = surface.newSku();
    expect(minted).toBeInstanceOf(Sku);
    expect(minted.isNew()).toBe(true);
    expect(surface.newSku()).not.toBe(minted);

    /*
     * THE CLOSING GATE, WHICH IS WHAT THE ORIGINAL "no invented sibling" WORDING WAS REACHING FOR.
     *
     * The legacy service surface was largely fabricated at runtime: `org/Hibachi/HibachiService.cfc:L255-L281`
     * answers `get*`, `get*SmartList`, `new*`, `list*`, `save*`, `delete*`, `count*`, `export*` and
     * `process*` by PREFIX, so the legacy `SkuService` would answer `countSku()`, `listSku()`,
     * `exportSku()` and `deleteSku()` even though no source file declares them. AAP §0.4.2.5 is explicit
     * that synthesis is reproduced ONLY WHERE THE SLICE ACTUALLY CALLS IT — `newSku` is declared because
     * the combination engine calls it, and the rest are deliberately absent.
     *
     * Asserting that absence is the meaningful half of the parity claim, and it is asserted rather than
     * asserted-away. Note it is deliberately NOT written as reflection over the prototype: TypeScript's
     * `private` is a compile-time modifier with no runtime effect, so enumerating own property names
     * would pin this service's PRIVATE helpers — the combination engine's internals among them — and turn
     * every legitimate refactor of an internal into a test failure.
     */
    for (const neverSynthesized of [
      'countSku',
      'listSku',
      'exportSku',
      'deleteSku',
      'saveSku',
      'getSku',
    ] as const) {
      expect(neverSynthesized in surface).toBe(false);
    }
  });
});

/*
 * ===================================================================================================
 * IR-6 — THE WRITE SEAM ASSIGNS THE IDENTIFIER, AND EVERY SKU IN A BATCH GETS A DISTINCT ONE
 * ===================================================================================================
 * `model/entity/Sku.cfc:L52` declares `skuID` as
 * `fieldtype="id" generator="uuid" ormtype="string" length="32" unsavedvalue="" default=""`, and AAP
 * IR-6 records that 107 of 113 legacy entities declare exactly that. So the identifier is generated in
 * APPLICATION code — never by the database — and its shape is 32 lowercase hexadecimal characters with
 * NO DASHES. `/^[0-9a-f]{32}$/` is that declaration written as a predicate.
 *
 * These are parity assertions in the strongest sense available: a green suite can otherwise coexist with
 * a production path that cannot execute, because a real adapter refuses a transient row while a double
 * accepts one. Pinning the identifier explicitly is what stops that pairing recurring.
 */
describe('SkuService.createSkus — IR-6 identifier assignment at the write seam', () => {
  const IDENTIFIER_SHAPE = /^[0-9a-f]{32}$/;

  const runMerchandiseBatch = async (
    harness: Harness,
    product: Product,
    selection: string,
  ): Promise<void> => {
    await harness.service.createSkus(product, {
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      options: selection,
    });
  };

  it('NET-NEW every SKU reaches the repository carrying a 32-character lowercase-hex identifier', async () => {
    const { options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await runMerchandiseBatch(harness, product, `${ID.red},${ID.blue},${ID.small},${ID.large}`);

    expect(harness.skuRepository.persisted).toHaveLength(4);
    for (const sku of harness.skuRepository.persisted) {
      expect(sku.skuID).toMatch(IDENTIFIER_SHAPE);
      /* No dashes — `createSlatwallUUID()`, not an RFC-4122 rendering. */
      expect(sku.skuID).not.toContain('-');
      expect(sku.skuID).not.toBe(SKU_UNSAVED_ID_VALUE);
      /* Stated through the entity's own predicate too, so it does not rest on the literal alone. */
      expect(sku.isNew()).toBe(false);
    }
  });

  it('NET-NEW mints DISTINCT identifiers across a batch, so it cannot collapse onto one row', async () => {
    const { colorGroup, sizeGroup } = buildColorAndSizeOptions();
    /* Three colours over three sizes is nine combinations — enough that a reused value is unmistakable. */
    const wideOptions = Object.freeze([
      buildOption({ optionID: ID.red, optionCode: 'red', optionGroup: colorGroup, sortOrder: 1 }),
      buildOption({ optionID: ID.blue, optionCode: 'blue', optionGroup: colorGroup, sortOrder: 2 }),
      buildOption({
        optionID: ID.otherProduct,
        optionCode: 'green',
        optionGroup: colorGroup,
        sortOrder: 3,
      }),
      buildOption({ optionID: ID.small, optionCode: 'sm', optionGroup: sizeGroup, sortOrder: 1 }),
      buildOption({ optionID: ID.large, optionCode: 'lg', optionGroup: sizeGroup, sortOrder: 2 }),
      buildOption({
        optionID: ID.childProductType,
        optionCode: 'xl',
        optionGroup: sizeGroup,
        sortOrder: 3,
      }),
    ]);
    const harness = buildHarness({ resolvableOptions: wideOptions });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await runMerchandiseBatch(
      harness,
      product,
      wideOptions.map((option) => option.optionID).join(','),
    );

    const identifiers = harness.skuRepository.persisted.map((sku) => sku.skuID);
    expect(identifiers).toHaveLength(9);
    /* A single shared identifier would make the batch overwrite one row nine times. */
    expect(new Set(identifiers).size).toBe(identifiers.length);
  });

  it('NET-NEW leaves the SKU unsaved at VALIDATION time and identified at WRITE time', async () => {
    /*
     * ⭐ THE PLACEMENT IS ASSERTED AS AN ORDERING, because both ways of getting it wrong compile and
     * neither raises. Minting the identifier EARLIER flips `Sku.isNew()` to false while the graph is
     * still being assembled, which silently changes `Sku.setProduct`'s decision about whether to append
     * the SKU to its product; minting it LATER is impossible, because the write needs it. The legacy sat
     * at exactly this seam: Hibernate generated the value during the request-end flush, after the
     * validation rules had already run against a transient entity.
     *
     * The uniqueness rule's own read is the observation point: `model/entity/Sku.cfc:L764` compares
     * `skus[1].getSkuID() == getSkuID()`, so what the rule saw is recorded by the repository read that
     * served it.
     */
    const { options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await runMerchandiseBatch(harness, product, `${ID.red},${ID.small}`);

    const persisted = requireAt(harness.skuRepository.persisted, 0, 'the written SKU');
    expect(persisted.skuID).toMatch(IDENTIFIER_SHAPE);

    /*
     * The uniqueness read that preceded that write happened while the SKU was still unsaved, which is
     * why the read returned nothing that could be mistaken for the SKU itself: the repository's stored
     * set was empty at that moment.
     */
    const readIndex = harness.skuRepository.calls.findIndex(
      (call) => call.member === 'findSkusBySelectedOptions',
    );
    const writeIndex = harness.skuRepository.calls.findIndex(
      (call) => call.member === 'persistSku',
    );
    expect(readIndex).toBeGreaterThanOrEqual(0);
    /* Read strictly BEFORE write, for the same SKU. */
    expect(readIndex).toBeLessThan(writeIndex);
  });

  it('NET-NEW leaves the identified SKUs on the product itself, not copies of them', async () => {
    /*
     * `Sku.setProduct` appended these while they were still new and the identifier was assigned IN
     * PLACE, so the product's collection must hold the very objects the repository received — not
     * clones that would leave the caller holding unidentified entities.
     */
    const { options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await runMerchandiseBatch(harness, product, `${ID.red},${ID.blue},${ID.small},${ID.large}`);

    /* Identity, not equality: `toBe` per element via the array comparison below. */
    expect(readProductSkus(product)).toEqual(harness.skuRepository.persisted);
    expect(readProductSkus(product).map((sku) => sku.skuID)).toEqual(
      harness.skuRepository.persisted.map((sku) => sku.skuID),
    );
    for (const [index, sku] of readProductSkus(product).entries()) {
      expect(sku).toBe(requireAt(harness.skuRepository.persisted, index, 'the written SKU'));
    }
  });

  it('NET-NEW an ALREADY-IDENTIFIED SKU keeps its identifier — the mint guard is live, not dead', async () => {
    /*
     * ⭐ REVIEW FINDING F9. `src/services/SkuService.ts` mints under a guard —
     * `if (sku.skuID === SKU_UNSAVED_ID_VALUE) { sku.skuID = createSlatwallUUID(); }` — and its own note
     * claims "ONLY FOR A NEW SKU. An already-identified SKU keeps its identifier, so a re-save updates the
     * row it belongs to rather than inserting a second one." Every case above this one supplies a FRESH
     * SKU, so all of them take the true branch: the guard's false branch, and therefore the claim, had no
     * assertion behind it at all. An unconditional mint would pass every one of them.
     *
     * ⛔ WHY THE CLAIM MATTERS RATHER THAN BEING A TAUTOLOGY. That same note records a defect the port
     * introduced and corrected: an earlier revision assigned unconditionally a few statements earlier and
     * then repeated the assignment inside the guard, so two identifiers were generated per SKU and the
     * condition could never be false — dead code contradicting its own comment. Re-minting a key an entity
     * already carries ORPHANS the row that key belongs to. This case is what makes the regression visible.
     *
     * THE SEAM IS `newSku`, the one synthesized member (IR-1), spied rather than mocked at module level —
     * `jest.spyOn` on the live instance, following the precedent in `test/services/ProductService.test.ts`.
     * The original is captured through the prototype BEFORE the spy shadows it, so the replacement builds a
     * genuinely managed entity and only then pre-assigns the identifier.
     */
    const { options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    const PRE_ASSIGNED = ID.existingSku;
    const buildManagedSku = harness.service.newSku.bind(harness.service);
    const mint = jest.spyOn(harness.service, 'newSku').mockImplementation(() => {
      const sku = buildManagedSku();
      sku.skuID = PRE_ASSIGNED;
      return sku;
    });

    let mintCalls = -1;
    try {
      /* One option per group is exactly one combination, so the identifier below is unambiguous. */
      await runMerchandiseBatch(harness, product, `${ID.red},${ID.small}`);
    } finally {
      /*
       * ⚠️ READ THE COUNT BEFORE RESTORING. `mockRestore()` also RESETS the recorded calls, so asserting
       * `toHaveBeenCalledTimes` after it reports zero and the case fails for a reason that has nothing to
       * do with the guard. Captured here, restored immediately after.
       */
      mintCalls = mint.mock.calls.length;
      mint.mockRestore();
    }

    expect(mintCalls).toBe(1);
    expect(harness.skuRepository.persisted).toHaveLength(1);
    const persisted = requireAt(harness.skuRepository.persisted, 0, 'the written SKU');

    /*
     * The whole of the assertion: the identifier reaching the write is the one the entity ARRIVED with.
     * A bypassed guard would overwrite it with a fresh `createSlatwallUUID()` value, which cannot equal
     * this literal — so the two expectations below fail together the moment the guard stops guarding.
     *
     * ⚠️ WHY THE GENERATOR ITSELF IS NOT SPIED, THOUGH THAT WOULD BE THE MOST DIRECT ASSERTION.
     * `createSlatwallUUID` is a module-scope import in `src/services/SkuService.ts`, so intercepting it
     * needs `jest.mock` — module mocking, which this suite uses NOWHERE and which AAP §0.4.1.12 rules out
     * by design: the legacy repository contains no mocking library at all, and the target suite substitutes
     * through the PORTS instead. The identity assertion below is the equivalent observable and was
     * confirmed discriminating by making the mint unconditional, which fails this case and no other.
     */
    expect(persisted.skuID).toBe(PRE_ASSIGNED);
    expect(persisted.skuID).toMatch(IDENTIFIER_SHAPE);
    /* Assigned IN PLACE, never onto a copy, so the caller holds the same identified object. */
    expect(persisted.skuID).not.toBe(SKU_UNSAVED_ID_VALUE);
  });
});

describe('SkuService.createSkus — exact decimal fidelity of price and list price', () => {
  /*
   * `model/service/SkuService.cfc:L93-L95` hands `data.price` and `data.listPrice` to generated setters
   * with no declared type, so CFML stores whatever it is handed and `model/validation/Sku.json` reports
   * a non-numeric value under that property's own key. The port keeps decimal amounts as exact text
   * rather than as doubles, because a double silently rewrites amounts a merchant supplied.
   */

  const createWithData = async (
    data: Record<string, unknown>,
  ): Promise<{ readonly harness: Harness; readonly written: Sku }> => {
    const harness = buildHarness();
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await harness.service.createSkus(product, data);

    return {
      harness,
      written: requireAt(harness.skuRepository.persisted, 0, 'the written SKU'),
    };
  };

  it('NET-NEW carries a price no double can hold through to the repository digit for digit', async () => {
    /*
     * `Number('9007199254740993.01')` is 9007199254740994 — past the safe-integer boundary — so a port
     * that coerced to a double would write an amount the caller never sent, with no error anywhere.
     */
    const exactPrice = '9007199254740993.01';

    const { written } = await createWithData({ price: exactPrice });

    expect(written.price).toBe(exactPrice);
    expect(written.price).not.toBe(String(Number(exactPrice)));
  });

  it('NET-NEW preserves the supplied scale and imposes none of its own', async () => {
    /*
     * Scale is whatever the caller (ultimately the column) supplied, so `'100.00'` stays `'100.00'`;
     * and because no scale is INVENTED — nothing in the legacy repository declares one — `'50'` stays
     * `'50'`. Normalising either way would be a number this plan has no source for (IR-12).
     */
    const scaled = await createWithData({ price: '100.00' });
    expect(scaled.written.price).toBe('100.00');

    const unscaled = await createWithData({ price: '50' });
    expect(unscaled.written.price).toBe('50');
  });

  it('NET-NEW stores a non-numeric price as the sentinel instead of raising', async () => {
    /*
     * THE NOT-AN-EXCEPTION CONTRACT, PRESERVED THROUGH THE REPRESENTATION CHANGE. `setPrice` at [:L93]
     * is a generated setter, so CFML accepts the value and the `numeric` rule in
     * `model/validation/Sku.json` reports it under `price`. Raising here would MOVE the failure to a
     * different layer; substituting zero would HIDE it. The sentinel fails the validator's numeric
     * predicate, so the rule still catches it in the same place the legacy does.
     */
    const { written } = await createWithData({ price: 'not-a-price' });

    expect(written.price).toBe('NaN');
  });

  it('NET-NEW orders the list-price guard by MAGNITUDE, so a negative and a scaled zero are refused', async () => {
    /*
     * THE THREE-PART GUARD AT [:L94]: the key is present AND the value reads as numeric AND it is
     * strictly greater than zero. All three operands are text here, and `'-1' > '0'` is TRUE as a
     * LEXICAL comparison — so a guard written with `>` on strings would admit the very value it exists
     * to refuse, and would compile without complaint. A refused value leaves the entity default in
     * place, which `model/entity/Sku.cfc:L55` declares as `0`.
     */
    const negative = await createWithData({ price: '10', listPrice: '-1' });
    expect(negative.written.listPrice).toBe('0');

    const scaledZero = await createWithData({ price: '10', listPrice: '0.00' });
    expect(scaledZero.written.listPrice).toBe('0');

    /* And a genuinely positive value IS applied, at its supplied scale — otherwise the two assertions
     * above would also pass against a guard that refused everything. */
    const positive = await createWithData({ price: '10', listPrice: '19.90' });
    expect(positive.written.listPrice).toBe('19.90');
  });

  it('NET-NEW orders a nine-versus-ten magnitude numerically rather than lexically', async () => {
    /*
     * Lexically `'9'` is GREATER than `'10'`. This pins the digit-count step of the comparison, which is
     * exactly the part a lexical implementation gets wrong while still passing a single-digit case.
     */
    const nine = await createWithData({ price: '10', listPrice: '9' });
    expect(nine.written.listPrice).toBe('9');

    const ten = await createWithData({ price: '9', listPrice: '10' });
    expect(ten.written.listPrice).toBe('10');
  });
});

describe('SkuService.createSkus — the enumeration is bounded by the operator, never by the port', () => {
  /*
   * ⛔⭐ THIS DESCRIBE HAS CARRIED FOUR CONTRACTS. THE BOUNDED ONE IS CORRECT AND THE THIRD WAS THE
   * FINDING, SO ALL FOUR ARE RECORDED RATHER THAN SILENTLY SUPERSEDED.
   *
   * `model/service/SkuService.cfc:L58-L208` has NO size gate of any kind: no limit on the number of option
   * groups, none on options per group, and none on the product of the two.
   *   1. The port first mirrored that exactly, unbounded.
   *   2. A revision added an operator-stated ceiling plus an unconditional overflow refusal, and titled
   *      this block "the combination ceiling exists only when an operator states it".
   *   3. A later revision WITHDREW both, re-titled the block "the enumeration is unbounded, exactly as the
   *      legacy leaves it", and argued in this very header that "a bound is not forbidden by them — it is
   *      forbidden by AAP §0.6.7.7 for this deliverable, and belongs to a separately authorised piece of
   *      work that would revise the AAP register first."
   *   4. REVIEW FINDING SEC-DOS-01 IS THE CORRECTION, AND STEP 3 MISREAD ITS OWN CITATION. §0.6.7 is the
   *      DEFECT AND TODO CARRY-OVER REGISTER: twenty-one LEGACY BUSINESS-LOGIC defects — a misnamed struct,
   *      an inverted cache guard, an unreachable private method — of which D18 is the single member the port
   *      repairs. The availability of the extracted service is not an entry in that register, so §0.6.7.7
   *      never spoke to it. Reading D18's exception as the sole licence to bound anything at all would make
   *      §0.6.7.7 say that a faithful migration must reproduce a denial-of-service vector, which is not a
   *      reading any section of the AAP supports.
   *
   * ⭐ AND §0.7.3 REQUIRES THE OTHER DIRECTION. With no user Rules (§0.7.1) this port is bound to §0.7.3's
   * enterprise standards. S8 — "flag mismatches rather than assume them away" — is discharged by the
   * `TODO(parity)` blocks that record the LEGACY as unbounded, not by shipping the PORT unbounded. S9 and
   * IR-12 forbid the port from AUTHORING a figure, and nothing in `src/**` does: the ceiling is reached
   * through a RESOLVER that raises a named `ConfigurationError` reporting
   * `CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST` when a deployment stated none. An unstated bound fails
   * CLOSED.
   *
   * ⚠️ WHAT PARITY STILL MEANS HERE, PRECISELY. Guideline 4 forbids enhancing BUSINESS LOGIC, and the
   * ceiling changes not one generated SKU for any request it ADMITS: the odometer order, the default-SKU
   * election, the per-SKU validation and the `true` return are all untouched, and the 256-combination and
   * 2,187-combination runs below still pass unchanged because their fixtures state a ceiling that admits
   * them. What changed is that a request the operator's figure does not admit is REFUSED before it
   * allocates its first SKU, instead of being served at whatever cost it happens to have.
   *
   * ⛔ THE FIXTURES STATE THE FIGURES, AND THAT IS THE POINT. A test IS the operator — the party a
   * deployment expects to state a ceiling — so a fixture naming one exercises the mechanism rather than
   * introducing a default. `GENEROUS_MAXIMUM_COMBINATIONS` is the default for every case about something
   * else, so no existing assertion is decided by a bound.
   */

  const buildUniverse = (
    groupCount: number,
    optionsPerGroup: number,
  ): { readonly options: readonly Option[]; readonly selection: string } => {
    const options: Option[] = [];
    for (let group = 0; group < groupCount; group += 1) {
      const optionGroup = buildOptionGroup({
        optionGroupID: `9${String(group).padStart(31, '0')}`,
        optionGroupCode: `group-${String(group)}`,
        optionGroupName: `Group ${String(group)}`,
        sortOrder: group + 1,
      });
      for (let option = 0; option < optionsPerGroup; option += 1) {
        options.push(
          buildOption({
            optionID: `8${String(group)}${String(option).padStart(30, '0')}`,
            optionCode: `g${String(group)}o${String(option)}`,
            optionGroup,
            sortOrder: option + 1,
          }),
        );
      }
    }

    return {
      options: Object.freeze(options),
      selection: options.map((option) => option.optionID).join(','),
    };
  };

  it('NET-NEW UNWIRED — services a 256-combination request in full, first combination still taking the default', async () => {
    /* Four groups of four options — 256 combinations. Every one is built, validated, written and
     * attached, and the first still wins the default SKU, so the enumeration is undisturbed. */
    const { options, selection } = buildUniverse(4, 4);
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await expect(
      harness.service.createSkus(product, {
        price: TEST_MERCHANDISE_PRODUCT_PRICE,
        options: selection,
      }),
    ).resolves.toBe(true);

    expect(readProductSkus(product)).toHaveLength(256);
    expect(harness.skuRepository.persisted).toHaveLength(256);
    expect(harness.defaultSkuBindings).toHaveLength(1);
    expect(harness.defaultSkuBindings).toEqual([
      requireAt(harness.skuRepository.persisted, 0, 'the first written SKU'),
    ]);
  });

  it('NET-NEW UNWIRED — has no size-rejection path at all, even well past any plausible budget', async () => {
    /*
     * Seven groups of three options is 2,187 combinations. `resolves` rather than `rejects` IS the
     * assertion: with no budget wired there is no gate to produce a diagnostic, and the value resolved is
     * the vestigial unconditional `true` of [:L207], asserted only to show the method returned normally.
     *
     * ⚠️ THIS CASE IS THE PARITY GUARD AND MUST KEEP RESOLVING. It is what proves the ceiling added for
     * review finding F3 is genuinely absent by default, so that no deployment inherits a capacity figure
     * this port invented (AAP §0.7.3 S9, IR-12).
     */
    const { options, selection } = buildUniverse(7, 3);
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await expect(
      harness.service.createSkus(product, {
        price: TEST_MERCHANDISE_PRODUCT_PRICE,
        options: selection,
      }),
    ).resolves.toBe(true);

    expect(harness.skuRepository.persisted).toHaveLength(2187);
  });

  it('[NET-NEW] refuses an over-ceiling request BEFORE it allocates a single SKU', async () => {
    /*
     * ⭐ THE HEART OF SEC-DOS-01, AND THE ORDERING IS THE WHOLE FIX. The ceiling is applied between the
     * combination COUNT and the first `newSku()`, so an over-budget request writes nothing at all — not a
     * partial batch, not one SKU, not a default-SKU election. Refusing part-way through would leave the
     * product holding an arbitrary prefix of a batch nobody asked for, which is worse than either
     * extreme.
     *
     * Three groups of four is 64 combinations against a stated ceiling of 63.
     */
    const { options, selection } = buildUniverse(3, 4);
    const harness = buildHarness({ resolvableOptions: options, maximumCombinations: 63 });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await expect(
      harness.service.createSkus(product, {
        price: TEST_MERCHANDISE_PRODUCT_PRICE,
        options: selection,
      }),
    ).rejects.toThrow(/64/);

    /* NOTHING was allocated, persisted or attached. Each of the three is a separate observation point, and
     * a fix that refused after the loop would fail on all three rather than on a message. */
    expect(harness.skuRepository.persisted).toHaveLength(0);
    expect(product.skus).toHaveLength(0);
    expect(product.defaultSku).toBeUndefined();
  });

  it('[NET-NEW] admits a request landing exactly AT the ceiling, and generates the whole batch', async () => {
    /*
     * The admitting side, so the ceiling BOUNDS rather than simply refusing. Sixty-four combinations
     * against a ceiling of sixty-four: every SKU is written and the odometer is undisturbed, which is the
     * concrete form of "the ceiling changes no admitted request".
     */
    const { options, selection } = buildUniverse(3, 4);
    const harness = buildHarness({ resolvableOptions: options, maximumCombinations: 64 });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await expect(
      harness.service.createSkus(product, {
        price: TEST_MERCHANDISE_PRODUCT_PRICE,
        options: selection,
      }),
    ).resolves.toBe(true);
    expect(harness.skuRepository.persisted).toHaveLength(64);

    /* The odometer is undisturbed too: the FIRST combination still wins the default-SKU election, and it
     * is asserted through `defaultSkuBindings` rather than by identity because `Product.defaultSku` holds
     * a delegate rather than the `Sku` itself. */
    expect(harness.defaultSkuBindings).toEqual([product.skus[0]]);
  });

  it('[NET-NEW] refuses with NO ceiling stated, naming the variable, before allocating anything', async () => {
    /*
     * The fail-closed half, and the answer to the "an optional ceiling would suffice" position of step 2 in
     * this block's header. A composition root that states nothing does not get the unbounded odometer; it
     * gets a `ConfigurationError` naming `CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST`.
     *
     * A DELIBERATELY TINY request — two combinations — so the case cannot pass because the request happened
     * to be large. The refusal is about the ABSENCE of a figure, not about the size of the work.
     */
    const { options } = buildColorAndSizeOptions();
    const harness = buildHarness({
      resolvableOptions: options,
      combinationBudget: UNSTATED_COMBINATION_BUDGET,
    });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await expect(
      harness.service.createSkus(product, {
        price: TEST_MERCHANDISE_PRODUCT_PRICE,
        options: `${ID.red},${ID.small}`,
      }),
    ).rejects.toThrow(/CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST/);
    expect(harness.skuRepository.persisted).toHaveLength(0);
    expect(product.skus).toHaveLength(0);
  });

  it('[NET-NEW] refuses an UNCOUNTABLE combination product, which is a non-termination rather than a size', async () => {
    /*
     * ⭐ THIS REFUSAL IS NOT A CAPACITY LIMIT, AND THE DISTINCTION MATTERS FOR THE PARITY ARGUMENT.
     * `model/service/SkuService.cfc:L89` advances the odometer while `combination < totalCombos`. Once
     * `totalCombos` leaves the exactly-representable integer range — fifty-three groups of two options is
     * 2^53, `MAX_SAFE_INTEGER + 1` — the increment can stop advancing the value while the comparison stays
     * true, so the loop CANNOT TERMINATE. There is no legacy outcome to preserve for such an input: the
     * legacy does not return a different answer, it hangs. Refusing the state is therefore the only thing
     * a port can do with it, and it is why this guard needs no operator figure of its own.
     *
     * ⚠️ THIS CASE COULD NOT BE WRITTEN BEHAVIOURALLY BEFORE. A revision asserted the ABSENCE of this
     * guard by reading `src/services/SkuService.ts` as TEXT and checking that no threshold comparison
     * appeared in it, precisely because invoking `createSkus` on such a product would hang the suite
     * instead of reporting. With the guard in place the run terminates in milliseconds, so the property is
     * asserted by execution — which is strictly stronger than a source-text grep, and cannot be satisfied
     * or defeated by prose.
     *
     * ⛔ AND IT IS REACHED BEFORE THE CEILING, deliberately. `Number.isSafeInteger` is checked inside the
     * multiplication, so a product that is not merely large but UNCOUNTABLE is refused as such rather than
     * being reported as an over-ceiling request — the two diagnoses are different problems for an operator.
     * The ceiling here is `Number.MAX_SAFE_INTEGER`, the largest figure anyone could state, so no capacity
     * limit can be what fires.
     */
    const { options, selection } = buildUniverse(53, 2);
    const harness = buildHarness({
      resolvableOptions: options,
      maximumCombinations: Number.MAX_SAFE_INTEGER,
    });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await expect(
      harness.service.createSkus(product, {
        price: TEST_MERCHANDISE_PRODUCT_PRICE,
        options: selection,
      }),
    ).rejects.toThrow(/cannot be counted exactly|safe integer|terminate/i);
    expect(harness.skuRepository.persisted).toHaveLength(0);
  });

  it('[NET-NEW] stops on a CANCELLED invocation mid-enumeration, without completing the batch', async () => {
    /*
     * SEC-DOS-01's third clause — "honor an invocation cancellation/deadline". The seam is a predicate the
     * service consults BEFORE each combination allocates, so a handler that knows its invocation is out of
     * time can stop the enumeration rather than being unable to interrupt it.
     *
     * ⭐ IT IS A SEAM, NOT A DEADLINE, AND AAP §0.6.6 M1/M2 STAY FLAGGED. This port does not invent an
     * elapsed-time budget: the legacy's 3600-second importer timeout and 360-second feed timeout have no
     * single-Lambda equivalent and remain recorded as mismatches. What the seam provides is the ABILITY for
     * whatever owns the deadline to be honoured; the composition root's default never cancels, so no
     * request's outcome changes until something states otherwise.
     *
     * Cancellation is announced after four combinations of a sixty-four-combination batch. Fewer than the
     * whole batch was written, which is what proves the enumeration was interrupted rather than completed
     * and then reported.
     */
    let allocations = 0;
    const { options, selection } = buildUniverse(3, 4);
    const harness = buildHarness({
      resolvableOptions: options,
      maximumCombinations: 64,
      hasBeenCancelled: (): boolean => {
        allocations += 1;

        return allocations > 4;
      },
    });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    await expect(
      harness.service.createSkus(product, {
        price: TEST_MERCHANDISE_PRODUCT_PRICE,
        options: selection,
      }),
    ).rejects.toThrow(/reported its work budget exhausted/);

    /* Interrupted, not completed: strictly fewer than the sixty-four an admitted batch produces. The exact
     * figure is not asserted, because it is an artefact of where the predicate was told to flip rather
     * than a contract. */
    expect(harness.skuRepository.persisted.length).toBeLessThan(64);
  });
});

describe('skuBatchHasErrors and collectSkuBatchErrors — the complete commit gate', () => {
  /*
   * The commit decision the legacy took implicitly at request end, gated on `getORMHasErrors()`
   * (mismatch M5), is explicit here — and the gate has to look in TWO places, which is the whole reason
   * these helpers exist rather than a bare `product.hasErrors()`.
   */

  const buildGateProduct = (): Product =>
    buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

  it('NET-NEW reports no findings for a clean batch, and an empty error map', () => {
    const harness = buildHarness();
    const product = buildGateProduct();
    product.addSku(harness.service.newSku());
    product.addSku(harness.service.newSku());

    expect(skuBatchHasErrors(product)).toBe(false);
    expect(collectSkuBatchErrors(product)).toEqual({});
  });

  it('NET-NEW reports a finding recorded on the PRODUCT', () => {
    const product = buildGateProduct();
    product.addError('productType', 'Options cannot be added to this product type.');

    expect(skuBatchHasErrors(product)).toBe(true);
    expect(collectSkuBatchErrors(product)).toEqual({
      productType: ['Options cannot be added to this product type.'],
    });
  });

  it('NET-NEW reports a finding recorded on a SKU ALONE, which product.hasErrors() cannot see', () => {
    /*
     * ⭐ THE CASE THAT DEFINES THESE HELPERS. Per-SKU rule findings deliberately never merge onto the
     * product, and `createSkus` returns `true` unconditionally at [:L207] — so for the commonest failure
     * there is, a colliding SKU code, the product's own bag is EMPTY and the return value says success.
     * A gate reading only the product would commit the batch and keep the collision.
     */
    const harness = buildHarness();
    const product = buildGateProduct();
    const clean = harness.service.newSku();
    const failed = harness.service.newSku();
    failed.addError('skuCode', 'This SKU code is already in use.');
    product.addSku(clean);
    product.addSku(failed);

    expect(product.hasErrors()).toBe(false);
    expect(skuBatchHasErrors(product)).toBe(true);
    expect(collectSkuBatchErrors(product)).toEqual({
      skuCode: ['This SKU code is already in use.'],
    });
  });

  it('NET-NEW merges findings from the product and from its SKUs into one map', () => {
    const harness = buildHarness();
    const product = buildGateProduct();
    product.addError('productType', 'Options cannot be added to this product type.');
    const failed = harness.service.newSku();
    failed.addError('price', 'Price is required.');
    product.addSku(failed);

    expect(skuBatchHasErrors(product)).toBe(true);
    expect(collectSkuBatchErrors(product)).toEqual({
      productType: ['Options cannot be added to this product type.'],
      price: ['Price is required.'],
    });
  });

  it('NET-NEW skips a SKU member carrying no error surface rather than crashing the gate', () => {
    /*
     * `Product.skus` is typed as a structural minimum exposing only `setProduct`/`removeProduct`, so a
     * member with no error bag is representable. The gate inspects CAPABILITY, not class — which is what
     * keeps it usable against the narrower member type the domain declares.
     */
    const product = buildGateProduct();
    product.skus = [{ setProduct: (): void => undefined, removeProduct: (): void => undefined }];

    expect(skuBatchHasErrors(product)).toBe(false);
    expect(collectSkuBatchErrors(product)).toEqual({});
  });
});

/*
 * ===================================================================================================
 * THE CLOSED SMART-LIST IDENTIFIER SET
 * ===================================================================================================
 * The type system already refuses a fabricated literal, which no runtime case can observe. What these
 * pin is the RUNTIME half: a caller-supplied smart-list key is resolved against the declared set and,
 * when it does not resolve, is DROPPED SILENTLY rather than passed through or raised.
 *
 * The silence is the parity requirement rather than a softer option. Every legacy accumulator wraps its
 * append in a length test on the RESOLVED property — filters at `org/Hibachi/HibachiSmartList.cfc:L369`,
 * like filters at [:L396], in filters at [:L422], ranges at [:L449], orders at [:L480] — so an
 * unresolvable key yields a query with the entry missing and no error at all.
 */
describe('resolveSmartListPropertyIdentifier — the closed identifier set', () => {
  it('NET-NEW does not resolve an injection payload dressed as a property path', () => {
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'skuID) OR 1=1 --')).toBeUndefined();
    expect(
      resolveSmartListPropertyIdentifier('SlatwallSku', 'skuCode; DROP TABLE SwSku'),
    ).toBeUndefined();
  });

  it('NET-NEW resolves a real own property to ITSELF, byte-identically', () => {
    /*
     * The value must come back unchanged: this decides MEMBERSHIP, it does not normalise. A trimmed or
     * rewritten identifier would silently change the emitted column.
     */
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'skuCode')).toBe('skuCode');
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'activeFlag')).toBe('activeFlag');
  });

  it('NET-NEW resolves every path this slice actually writes', () => {
    /* One assertion per legacy locator, so a regression names the caller it broke. */
    /* model/service/SkuService.cfc:L317 */
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'product.productName')).toBe(
      'product.productName',
    );
    /* model/service/SkuService.cfc:L317 — the two-hop case */
    expect(
      resolveSmartListPropertyIdentifier('SlatwallSku', 'product.productType.productTypeName'),
    ).toBe('product.productType.productTypeName');
    /* model/service/SkuService.cfc:L321 — traverses into SlatwallAlternateSkuCode */
    expect(
      resolveSmartListPropertyIdentifier('SlatwallSku', 'alternateSkuCodes.alternateSkuCode'),
    ).toBe('alternateSkuCodes.alternateSkuCode');
    /* integrationServices/google/controllers/feed.cfc:L68-L72 */
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'product.activeFlag')).toBe(
      'product.activeFlag',
    );
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'product.calculatedQATS')).toBe(
      'product.calculatedQATS',
    );
    /* model/entity/Product.cfc:L256 — the three-hop maximum, rooted at the option group */
    expect(
      resolveSmartListPropertyIdentifier('SlatwallOptionGroup', 'options.skus.product.productID'),
    ).toBe('options.skus.product.productID');
  });

  it('NET-NEW does not resolve a misspelled or unknown property', () => {
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'skuCod')).toBeUndefined();
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'password')).toBeUndefined();
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'product.nope')).toBeUndefined();
  });

  it('NET-NEW does not resolve a property of a DIFFERENT entity against this root', () => {
    /*
     * The cross-entity confusion an open string permitted: `brandName` is real, but it is not a property
     * of `SlatwallSku`, and the legacy would not have resolved it there either.
     */
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'brandName')).toBeUndefined();
    expect(resolveSmartListPropertyIdentifier('SlatwallOption', 'skuCode')).toBeUndefined();
  });

  it('NET-NEW drops a path THROUGH an out-of-scope entity while keeping the relationship itself', () => {
    /*
     * `subscriptionTerm` and `stocks` are real `Sku` relationships and resolve as properties in their own
     * right, but their target entities are excluded by AAP §0.2.2.1, so they are not TRAVERSABLE. The
     * legacy would have resolved a path through them; declining on explicit exclusion grounds is a
     * documented narrowing rather than an accident.
     */
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'subscriptionTerm')).toBe(
      'subscriptionTerm',
    );
    expect(
      resolveSmartListPropertyIdentifier('SlatwallSku', 'subscriptionTerm.subscriptionTermID'),
    ).toBeUndefined();
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'stocks.stockID')).toBeUndefined();
  });

  it('NET-NEW rejects malformed paths without throwing', () => {
    for (const malformed of ['', '.', 'skuCode.', '.skuCode', 'product..productName', '..']) {
      expect(resolveSmartListPropertyIdentifier('SlatwallSku', malformed)).toBeUndefined();
    }
  });

  it('NET-NEW imposes no depth limit of its own', () => {
    /*
     * A five-segment path is longer than the literal union is generated to and still resolves, because it
     * is legal. The type depth is a compile-time convenience, not a policy bound.
     */
    expect(
      resolveSmartListPropertyIdentifier(
        'SlatwallSku',
        'product.productType.parentProductType.parentProductType.productTypeName',
      ),
    ).toBe('product.productType.parentProductType.parentProductType.productTypeName');
  });
});

describe('SkuService.getSkuSmartList — unresolvable caller keys are dropped silently', () => {
  it('NET-NEW collapses a where group whose every entry was unresolvable', async () => {
    const harness = buildHarness();

    await harness.service.getSkuSmartList({
      'F:skuID) OR 1=1 --': 'x',
      'FI:1=1': 'y',
      'FK:skuCode; DROP TABLE SwSku': 'z',
      'R:skuID) OR 1=1 --': '1^',
    });

    const query = harness.skuQueries.lastQuery();
    if (query === undefined) {
      throw new Error('The smart-list port was expected to receive one composed query.');
    }
    /*
     * Not merely absent from the filters — the WHOLE where group collapses, because every entry in it
     * was unresolvable and therefore dropped. And nothing raised: the legacy accumulators simply skip.
     */
    expect(query.whereGroups ?? []).toEqual([]);
  });

  it('NET-NEW keeps the legal entry and drops only the hostile companion', async () => {
    /*
     * The realistic shape of an attack is a valid filter carrying a hostile companion. Dropping the whole
     * request would be a behavior change; dropping only the unresolvable entry is the legacy's own
     * behavior.
     */
    const harness = buildHarness();

    await harness.service.getSkuSmartList({
      'F:skuCode': 'ABC-1',
      'F:skuID) OR 1=1 --': 'x',
    });

    const query = harness.skuQueries.lastQuery();
    expect(query?.whereGroups?.[0]?.filters).toEqual([
      { propertyIdentifier: 'skuCode', value: 'ABC-1' },
    ]);
  });

  it('NET-NEW drops an injected ordering term while keeping a legal one', async () => {
    const injected = buildHarness();
    await injected.service.getSkuSmartList({ OrderBy: 'skuCode; DROP TABLE SwSku|DESC' });
    expect(injected.skuQueries.lastQuery()?.orders ?? []).toEqual([]);

    const legal = buildHarness();
    await legal.service.getSkuSmartList({ OrderBy: 'skuCode|DESC' });
    expect(legal.skuQueries.lastQuery()?.orders).toEqual([
      { propertyIdentifier: 'skuCode', direction: 'DESC' },
    ]);
  });

  it('NET-NEW leaves the hard-coded joins and keyword properties unaffected by the closure', async () => {
    /*
     * [:L314-L321] are compile-time literals, so the closure had to leave every one of them still
     * expressible. A set that rejected them would not compile — but pinning them here also proves the
     * pairing, and that an unresolvable CALLER key does not disturb them.
     */
    const harness = buildHarness();

    await harness.service.getSkuSmartList({ 'F:skuID) OR 1=1 --': 'x' });

    const query = harness.skuQueries.lastQuery();
    expect(query?.joins).toHaveLength(3);
    expect(query?.keywordProperties?.map((entry) => entry.propertyIdentifier)).toEqual([
      'skuCode',
      'skuID',
      'product.productName',
      'product.productType.productTypeName',
      'alternateSkuCodes.alternateSkuCode',
    ]);
  });
});

describe('SkuService — the image WRITE is gated, the composition and the probe are not (SEC-FILE-01)', () => {
  /*
   * ⭐⭐ THIS BLOCK HAS NOW BEEN WRITTEN FOUR TIMES, AND THE HISTORY IS THE POINT. Its title alone has been
   * "NOTHING is gated" twice. A reader who does not see the sequence will assume the current state is
   * arbitrary, so here it is:
   *
   *   1. A gate stood at the write boundary. Cases asserted `resolves.toBe(false)` and `calls === []`.
   *   2. It was withdrawn; the cases were INVERTED to assert the traversal reaching the port.
   *   3. It was reinstated by analogy with D18 — both diverge only where the legacy's behaviour WAS the
   *      flaw — and the cases were inverted back.
   *   4. Review finding F4 withdrew it again on PRECEDENCE, and F4 WAS RIGHT ABOUT THE ANALOGY: AAP
   *      §0.6.7.7 names ONE divergence by locator and AAP §0.1.2.1 forbids reading the plan as licensing a
   *      CLASS of them. A second exception reached by resemblance is exactly that reinterpretation.
   *
   * ⭐ SO THE ANALOGY IS ABANDONED AND THE GATE IS REINSTATED ON A DIFFERENT GROUND — one that needs no
   * exception at all, because it does not diverge from anything. Verified repo-wide in
   * `src/ports/ImagePathPort.ts` and restated at the gate in `src/services/SkuService.ts`:
   *
   *     `saveImageFile` DOES NOT EXIST ANYWHERE IN THE LEGACY. One call site
   *     (`model/service/SkuService.cfc:L212`), zero declarations. The `save*` prefix routes the name to
   *     `org/Hibachi/HibachiService.cfc:L268` → `onMissingSaveMethod` [:L552-L560], which indexes
   *     `missingMethodArguments[1]` POSITIONALLY, and [:L253] states "Ordered arguments only--named
   *     arguments not supported." [:L212] passes ONLY named arguments.
   *
   * The legacy has NO well-defined result on this path for ANY input. AAP §0.8.2 Guideline 4 requires
   * existing behaviour be preserved "exactly as-is"; where there is none, nothing is preserved and nothing
   * is changed. §0.6.7.7 is NOT ENGAGED — this is not a second exception, it is a path that never had a
   * first outcome. The port's own note concedes it: the contract "is defined by AAP §0.4.3.2 and by the
   * call site rather than by a legacy body — there is no legacy body to reproduce."
   *
   * ⛔ AND THE POLICY IS TRANSCRIBED, NOT INVENTED, which is what keeps AAP §0.7.3 S9 and IR-12 satisfied.
   * The legacy's own two writers (`model/service/ProductService.cfc:L210`,
   * `model/service/ContentService.cfc:L138`) both assign `sku.generateImageFileName()`, and that generator
   * `model/entity/Sku.cfc:L131-L139` filters every segment through
   * `reReplaceNoCase(…, "[^a-z0-9\-\_]", "", "all")` then appends ONE dot and one extension. The generator
   * IS the policy; the gate re-checks it at the point of use, where it was never checked.
   *
   * ⚠️ WHAT THIS BLOCK ASSERTS, IN BOTH DIRECTIONS:
   *   • the WRITE is GATED. A name the generator could not have produced answers `false` and reaches the
   *     port ZERO times — not `getImagePath`, not `saveImageFile`.
   *   • every name the generator DOES produce still crosses UNCHANGED, byte for byte. That is the half that
   *     must never regress, and it is what makes the gate a re-check rather than a new rule.
   *   • COMPOSITION and the existence PROBE stay ungated. `model/entity/Sku.cfc:L145-L147` interpolates
   *     whatever is stored and `model/entity/Sku.cfc:L222` probes whatever that resolves to — including a
   *     traversed file — answering a boolean about THAT file. Those HAVE defined legacy results, write
   *     nothing, and disclose only a boolean, so control (3) stays withdrawn and the read-side exposure
   *     stays FLAGGED for the operator (AAP §0.7.3 S8).
   *
   * WHY ENTITY-LEVEL CASES SIT IN A SERVICE TEST FILE. `test/domain/Sku.test.ts` is the eventual owner
   * of `Sku`'s own assertions, and its mandate is far broader than this boundary — the D1/D2/D3 accessor
   * cluster and the four inherited entity assertions all belong to it. The behavior here is reached
   * end-to-end through the same port double either way, and `processImageUpload` is unambiguously this
   * file's member, so the pair stays together rather than being split across two files.
   */

  /** The traversal vector the withdrawn gate refused, kept verbatim so the carried exposure stays visible. */
  const TRAVERSAL_VECTOR = '../../../../tmp/payload.jpg';
  /* The SAME value the service is wired with, not a look-alike literal, so a path assertion below can
   * never pass for the wrong reason. */
  const IMAGE_BASE: string = TEST_IMAGE_STORAGE_ROOT;

  /**
   * Two names the legacy generator demonstrably produces. They were the ADMIT direction of the withdrawn
   * gate; they are kept because they are still the ordinary case, and both are the exact outputs
   * `test/domain/Sku.test.ts` already asserts `generateImageFileName()` returns.
   */
  const GENERATED_NAMES = ['CatalogProduct-1_LgSize.jpg', 'CatalogProduct-1-Lg.png'] as const;

  const buildSkuWithImageFile = (imageFile?: string): Sku =>
    imageFile === undefined
      ? buildSku({ skuID: ID.existingSku, price: 10 })
      : buildSku({ skuID: ID.existingSku, price: 10, imageFile });

  it('[NET-NEW] SEC-FILE-01 REFUSES a traversal name, and the port is never reached at all', async () => {
    /*
     * ⭐ THE CENTRAL CASE OF THE FINDING, whose exploit reads: "Store/import
     * `imageFile=../../../../tmp/payload.jpg`, then call `sku.processImageUpload`."
     *
     * ⭐ ZERO PORT CALLS IS THE STRONGER ASSERTION, and it is why the gate stands BEFORE the path is
     * composed rather than after. Had it screened the composed path, the traversal would already have been
     * resolved against the prefix and `getImagePath` would appear in this log. An empty log proves the
     * refusal needs nothing downstream to be trusted — no adapter, no root comparison, no port double
     * behaviour.
     */
    const harness = buildHarness({
      imagePathsByImageFile: { [TRAVERSAL_VECTOR]: `${IMAGE_BASE}${TRAVERSAL_VECTOR}` },
    });
    const sku = buildSkuWithImageFile(TRAVERSAL_VECTOR);

    await expect(harness.service.processImageUpload(sku, {})).resolves.toBe(false);
    expect(harness.imagePaths.calls).toEqual([]);

    /*
     * ⚠️ AND THE REFUSAL LEAKS NO DESTINATION, which is the finding's own last clause: "return a refusal
     * without leaking destination details." A bare `false` carries no path, no root, no reason and no
     * candidate — a caller learns the write did not happen and nothing else.
     *
     * The stored column is left exactly as it was: refusing the write is not a repair of the row, and
     * nothing is recorded against the entity. `Sku` declares no error surface at all, so "no error
     * recorded" is structural here rather than merely observed — and AAP §0.8.2 Guideline 4 is satisfied
     * because [model/service/SkuService.cfc:L216] also returns `false` and records nothing.
     */
    expect(sku.imageFile).toBe(TRAVERSAL_VECTOR);
    expect('errors' in sku).toBe(false);
  });

  it('NET-NEW forwards every name the legacy generator produces UNCHANGED', async () => {
    /*
     * The ordinary case, and the one that must never regress whatever happens to the security question: the
     * composed path arrives at the write byte for byte. Each name here is an output
     * `generateImageFileName()` is separately asserted to produce.
     */
    for (const generated of GENERATED_NAMES) {
      const harness = buildHarness({
        imagePathsByImageFile: { [generated]: `${IMAGE_BASE}${generated}` },
      });
      const sku = buildSkuWithImageFile(generated);

      await expect(harness.service.processImageUpload(sku, {})).resolves.toBe(
        SAVE_IMAGE_SUCCEEDS_BY_DEFAULT,
      );

      expect(harness.imagePaths.calls.map((call) => call.member)).toEqual([
        'getImagePath',
        'saveImageFile',
      ]);
      const saveCall = requireAt(harness.imagePaths.calls, 1, 'the save request');
      if (saveCall.member !== 'saveImageFile') {
        throw new Error('The second image-port call was expected to be the save request.');
      }
      expect(saveCall.request.filePath).toBe(`${IMAGE_BASE}${generated}`);
    }
  });

  it('[NET-NEW] SEC-FILE-01 refuses every shape the generator CANNOT emit — six distinct vectors', async () => {
    /*
     * ⭐ SIX VECTORS, EACH NAMING A DISTINCT WAY THE COLUMN CAN HOLD WHAT THE GENERATOR COULD NOT PRODUCE.
     * The list is the one that stood here when the gate was withdrawn, kept intact and extended, with each
     * entry's provenance in the legacy sanitiser preserved:
     *
     *   'evil/x.jpg'    — a separator. `reReplaceNoCase(…, "[^a-z0-9\-\_]", "", "all")` at
     *                     `model/entity/Sku.cfc:L135-L137` strips `/`, so no generated stem contains one.
     *                     This is the traversal class, and it is now REFUSED.
     *   'shirt.tar.jpg' — a second dot. [:L138] appends exactly one.
     *   '..'            — the bare traversal token, carrying no extension at all.
     *   '/etc/passwd'   — an ABSOLUTE path. Anchoring at `^` is what refuses it; an unanchored pattern
     *                     would have matched the tail and admitted the whole string.
     *   'shirt.jpg\u0000.php' — a NUL byte, the classic truncation vector. The character class admits no
     *                     control character, so it is refused on shape rather than on a special case.
     *   'shirt.jpg '    — a TRAILING SPACE. Refused because the pattern is anchored at `$`, and worth its
     *                     own entry: some filesystems silently strip it, so an admitted value here could
     *                     resolve to a different file than the one screened.
     *
     * ⚠️ `'payload.php'` IS DELIBERATELY NOT IN THIS LIST, and its absence is the finding's "treat extension
     * checks as secondary" clause honoured rather than ignored. A disallowed EXTENSION is not a traversal:
     * [:L212] passes `allowedExtensions="jpg,jpeg,png,gif"` and that decision belongs to the collaborator
     * behind the port, not to this layer. The gate screens the SHAPE of the name, so `payload.php` passes
     * this gate — it is a single safe segment — and is refused downstream by the extension list. The case
     * below asserts exactly that division of labour, so neither check is mistaken for the other.
     */
    const refusedVectors = [
      'evil/x.jpg',
      'shirt.tar.jpg',
      '..',
      '/etc/passwd',
      'shirt.jpg\u0000.php',
      'shirt.jpg ',
    ];

    for (const refused of refusedVectors) {
      const harness = buildHarness({
        imagePathsByImageFile: { [refused]: `${IMAGE_BASE}${refused}` },
      });
      const sku = buildSkuWithImageFile(refused);

      await expect(harness.service.processImageUpload(sku, {})).resolves.toBe(false);
      /* Zero port calls for every one of them, so no vector is refused only by luck downstream. */
      expect(harness.imagePaths.calls).toEqual([]);
    }
  });

  it("[NET-NEW] SEC-FILE-01 passes a disallowed EXTENSION through, because that is the port's decision", async () => {
    /*
     * ⭐ THE DIVISION OF LABOUR, ASSERTED SO NEITHER CHECK IS MISTAKEN FOR THE OTHER. `payload.php` is a
     * single generator-shaped segment — one safe stem, one dot, one alphanumeric extension — so the SHAPE
     * gate admits it and the port IS reached, carrying `allowedExtensions="jpg,jpeg,png,gif"` exactly as
     * [model/service/SkuService.cfc:L212] carries it. Refusing it here would move a decision the legacy
     * delegates to the image service into this layer.
     *
     * The finding asks that extension checks be "secondary", and this is what secondary means in practice:
     * the shape gate is the primary control and cannot be satisfied by a traversal, while the extension list
     * travels to the layer that owns it.
     */
    const harness = buildHarness({
      imagePathsByImageFile: { 'payload.php': `${IMAGE_BASE}payload.php` },
    });
    const sku = buildSkuWithImageFile('payload.php');

    /*
     * ⭐ THE PORT IS REACHED — which is the claim — AND THEN THE PORT DECLINES. The final answer is `false`,
     * and it is `false` for a completely different reason than the traversal cases above: those never
     * reached the port at all, this one reached it and was refused BY IT. Reading only the return value
     * cannot tell the two apart, which is exactly why the call log is asserted alongside it.
     *
     * The double declines because it now applies the `allowedExtensions` list it is handed rather than
     * answering `true` unconditionally (see `test/support/inMemoryRepositories.ts`). That change is what
     * makes this assertion mean anything: against the old permissive double this case could only ever have
     * shown the port being ASKED, never a conforming implementation's verdict.
     */
    await expect(harness.service.processImageUpload(sku, {})).resolves.toBe(false);
    expect(harness.imagePaths.calls.map((call) => call.member)).toEqual([
      'getImagePath',
      'saveImageFile',
    ]);
    const saveCall = requireAt(harness.imagePaths.calls, 1, 'the save request');
    if (saveCall.member !== 'saveImageFile') {
      throw new Error('The second image-port call was expected to be the save request.');
    }
    /* BYTE-EXACT against the legacy literal at [model/service/SkuService.cfc:L215]. */
    expect(saveCall.request.allowedExtensions).toBe('jpg,jpeg,png,gif');
    expect(saveCall.request.allowedExtensions).toBe(IMAGE_UPLOAD_ALLOWED_EXTENSIONS);
  });

  it('[NET-NEW] SEC-FILE-01 admits UPPERCASE stems, because `reReplaceNoCase` spares them', async () => {
    /*
     * ⭐⭐ THE TRAP THIS GATE HAD TO AVOID, ASSERTED RATHER THAN TRUSTED. The legacy sanitiser is
     * `reReplaceNoCase(…, "[^a-z0-9\-\_]", …)` — and because the call is case-INSENSITIVE, that negated
     * class spares `A`-`Z` as well as `a`-`z`. The same pattern compiled in JavaScript WITHOUT the
     * ignore-case flag would refuse every uppercase letter, so a gate transcribed literally would reject
     * the generator's own output and break the ordinary case while looking faithful.
     *
     * `src/ports/ImagePathPort.ts` documents this trap for whichever layer generates names; this case is the
     * proof that the gate did not fall into it. Both names below are outputs `test/domain/Sku.test.ts`
     * separately asserts `generateImageFileName()` produces.
     */
    for (const generated of GENERATED_NAMES) {
      expect(generated).toMatch(/[A-Z]/);

      const harness = buildHarness({
        imagePathsByImageFile: { [generated]: `${IMAGE_BASE}${generated}` },
      });

      await expect(
        harness.service.processImageUpload(buildSkuWithImageFile(generated), {}),
      ).resolves.toBe(SAVE_IMAGE_SUCCEEDS_BY_DEFAULT);
      expect(harness.imagePaths.calls.map((call) => call.member)).toEqual([
        'getImagePath',
        'saveImageFile',
      ]);
    }
  });

  it('NET-NEW preserves extension CASE on the way through, inspecting it nowhere', async () => {
    /*
     * `productImageDefaultExtension` (`model/service/SettingService.cfc:L191`) is an OPEN text setting, so
     * an operator can store `JPG`, and `generateImageFileName`'s sanitiser is `reReplaceNoCase`, which
     * preserves upper case. The withdrawn gate had to compare that extension case-insensitively to avoid
     * refusing a value the generator emits; with no gate there is no comparison at all, and the only claim
     * left — the one that always mattered — is that the case crosses the boundary unchanged.
     */
    const harness = buildHarness({
      imagePathsByImageFile: { 'shirt.JPG': `${IMAGE_BASE}shirt.JPG` },
    });
    const sku = buildSkuWithImageFile('shirt.JPG');

    await expect(harness.service.processImageUpload(sku, {})).resolves.toBe(
      SAVE_IMAGE_SUCCEEDS_BY_DEFAULT,
    );
    const saveCall = requireAt(harness.imagePaths.calls, 1, 'the save request');
    if (saveCall.member !== 'saveImageFile') {
      throw new Error('The second image-port call was expected to be the save request.');
    }
    expect(saveCall.request.filePath).toBe(`${IMAGE_BASE}shirt.JPG`);
  });

  it('NET-NEW composes display paths from whatever is stored, inspecting nothing', async () => {
    /*
     * `model/entity/Sku.cfc:L145-L147` interpolates the stored value into the path without inspecting
     * it. The resolver is passed explicitly because the entity takes it as a parameter rather than
     * reaching for a locator.
     */
    const harness = buildHarness({
      imagePathsByImageFile: { [TRAVERSAL_VECTOR]: `${IMAGE_BASE}${TRAVERSAL_VECTOR}` },
    });
    const resolver: SkuImagePathResolver = harness.imagePaths.imagePaths;

    await expect(buildSkuWithImageFile(TRAVERSAL_VECTOR).getImagePath(resolver)).resolves.toBe(
      `${IMAGE_BASE}${TRAVERSAL_VECTOR}`,
    );
    expect(harness.imagePaths.calls).toEqual([
      { member: 'getImagePath', imageFile: TRAVERSAL_VECTOR },
    ]);
  });

  it('NET-NEW hands the existence probe the COMPOSED path, composing first and probing second', async () => {
    /*
     * `model/entity/Sku.cfc:L222` is `fileExists(expandPath(getImagePath()))` — compose, then probe, in
     * that order. A probe receiving the bare stored name would be asking a different question.
     */
    const harness = buildHarness({
      imagePathsByImageFile: { 'shirt.jpg': `${IMAGE_BASE}shirt.jpg` },
      existingImagePaths: [`${IMAGE_BASE}shirt.jpg`],
    });
    const resolver: SkuImagePathResolver = harness.imagePaths.imagePaths;

    await expect(buildSkuWithImageFile('shirt.jpg').getImageExistsFlag(resolver)).resolves.toBe(
      true,
    );

    expect(harness.imagePaths.calls.map((call) => call.member)).toEqual([
      'getImagePath',
      'getImageExistsFlag',
    ]);
    const probe = requireAt(harness.imagePaths.calls, 1, 'the existence probe');
    expect(probe.member === 'getImageExistsFlag' && probe.imagePath).toBe(`${IMAGE_BASE}shirt.jpg`);
  });

  it('NET-NEW answers the probe on the TRAVERSED file, exactly as the legacy does', async () => {
    /*
     * ⛔ THE READ PATH IS DELIBERATELY UNGATED, AND THIS IS THE CASE THAT PROVES IT — see
     * `src/ports/ImagePathPort.ts` DECISION I-1 control (3). `model/entity/Sku.cfc:L222` answers a boolean
     * about whatever the composed path resolves to, so a traversal name yields a real answer about the
     * traversed file. That is a DEFINED legacy outcome on an operation that writes nothing and discloses one
     * bit, so review finding F6 does not touch it; the residual CWE-22 reach is flagged for an adapter to
     * close. If this case ever starts expecting `false`, the write gate has leaked into the read.
     */
    const harness = buildHarness({
      imagePathsByImageFile: { [TRAVERSAL_VECTOR]: `${IMAGE_BASE}${TRAVERSAL_VECTOR}` },
      existingImagePaths: [`${IMAGE_BASE}${TRAVERSAL_VECTOR}`],
    });
    const resolver: SkuImagePathResolver = harness.imagePaths.imagePaths;

    await expect(
      buildSkuWithImageFile(TRAVERSAL_VECTOR).getImageExistsFlag(resolver),
    ).resolves.toBe(true);
  });

  it('NET-NEW answers false for an unseeded path and for an absent image file, without raising', async () => {
    const harness = buildHarness();
    const resolver: SkuImagePathResolver = harness.imagePaths.imagePaths;

    await expect(buildSkuWithImageFile('missing.jpg').getImageExistsFlag(resolver)).resolves.toBe(
      false,
    );
    await expect(buildSkuWithImageFile().getImageExistsFlag(resolver)).resolves.toBe(false);
  });
});

describe('SkuService sorted paths — the ordering index', () => {
  /*
   * The two sorted members share one reordering step, and its two failure modes are both defect D13.
   * They are asserted here with their diagnostic CONTEXT, because the context is what tells an operator
   * which of the two happened — a SKU with no position, or a position no SKU claimed.
   */

  const buildTwoOptionBearingSkus = (): {
    readonly product: Product;
    readonly red: Sku;
    readonly blue: Sku;
  } => {
    const { options } = buildColorAndSizeOptions();
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );
    const red = buildSku({
      skuID: ID.existingSku,
      skuCode: 'IDX-RED',
      price: 10,
      options: [requireAt(options, 0, 'the red option')],
      product,
    });
    const blue = buildSku({
      skuID: ID.secondExistingSku,
      skuCode: 'IDX-BLUE',
      price: 10,
      options: [requireAt(options, 1, 'the blue option')],
      product,
    });

    return { product, red, blue };
  };

  it('NET-NEW carries the missing identifier in the diagnostic context of the D13 failure', async () => {
    /*
     * TODO(parity) D13 — `model/service/SkuService.cfc:L236-L237`. The diagnostic names the SKU that had
     * no position and the defect it belongs to, so an operator reading a log can tell this apart from an
     * ordinary query failure. The legacy raised an unhelpful array-index error at the same point.
     */
    const { product, red, blue } = buildTwoOptionBearingSkus();
    const optionLess = buildSku({
      skuID: ID.optionlessSku,
      skuCode: 'IDX-NONE',
      price: 10,
      product,
    });
    const harness = buildHarness({ storedSkus: [red, blue, optionLess] });

    const rejection: unknown = await harness.service.getProductSkus(product, true).then(
      () => undefined,
      (error: unknown) => error,
    );

    if (!(rejection instanceof DomainError)) {
      throw new Error('The reordering step was expected to raise a DomainError.');
    }
    expect(rejection.context).toMatchObject({ skuID: ID.optionlessSku, defect: 'D13' });
  });

  it('NET-NEW breaks a DUPLICATED ordering WEIGHT by first-seen order rather than raising', async () => {
    /*
     * The other thing the reordering step has to cope with. The ordering weight is computed from option
     * sort order (`model/dao/SkuDAO.cfc:L172-L202`), so two SKUs carrying the SAME option produce the
     * SAME weight — which the legacy's `ORDER BY` leaves in an engine-determined sequence and which the
     * port settles by first-seen order.
     *
     * ⭐ THIS ASSERTS THE ABSENCE OF A RAISE ON PURPOSE. D13 fires when an identifier has no position at
     * all, or when a pre-sized position is never claimed; a tie is neither, because both SKUs still get a
     * distinct position. Asserting a raise here would be asserting a contract the adapter does not have
     * and the legacy never had, and it would mask the real D13 cases asserted above.
     */
    const { options } = buildColorAndSizeOptions();
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );
    const red = requireAt(options, 0, 'the red option');
    const first = buildSku({
      skuID: ID.existingSku,
      skuCode: 'DUP-1',
      price: 10,
      options: [red],
      product,
    });
    const second = buildSku({
      skuID: ID.secondExistingSku,
      skuCode: 'DUP-2',
      price: 10,
      options: [red],
      product,
    });
    const harness = buildHarness({ storedSkus: [first, second] });

    /* Both SKUs are option-bearing, so the guard passes and the ordering query runs. */
    const ordered = await harness.service.getProductSkus(product, true);

    /* Both positions ARE claimed, so the batch comes back in a stable order. */
    expect(ordered.map((sku) => sku.skuID)).toEqual([ID.existingSku, ID.secondExistingSku]);
    expect(harness.skuRepository.calls.map((call) => call.member)).toEqual([
      'findByProduct',
      'findSortedSkuIdsByProduct',
    ]);
  });
});

/* =====================================================================================================
 * FOLDED IN FROM `test/handlers/skuHandler.test.ts` — AAP §0.4.1.12 SUITE ALIGNMENT (F1, F5)
 * =====================================================================================================
 * WHY THESE CASES ARE HERE RATHER THAN IN A SUITE OF THEIR OWN. AAP §0.4.1.12 declares exactly seventeen
 * executable suites, and `test/handlers/skuHandler.test.ts` was not one of them — a QA pass recorded it,
 * with eighteen siblings, as running outside the declared test plan. The coverage was never the problem;
 * the file's existence was. So the cases are folded into an approved suite, unchanged.
 *
 * ⭐ WHY THIS HOST. The nine SKU routes dispatch to members this file already tests, and the folded body additionally
 * covers `MySqlTransactionalWriteRunner` — the boundary the combination engine's read-back depends on
 * (M5, AAP §0.6.2), which is this file's own subject one layer down.
 *
 * ⛔ THE BODY IS WRAPPED IN ONE `describe`, WHICH IS THE WHOLE OF THE MECHANICAL CHANGE. Every helper,
 * constant and type the folded suite declared at module scope is now block-scoped to this callback, so it
 * cannot collide with this file's own declarations or with another folded body's — and any `beforeEach`,
 * `afterEach` or `beforeAll` it carries now applies to its own cases only, never to the host's. Not one
 * assertion, case name or comment was altered.
 * ================================================================================================== */

/**
 * The SKU Lambda boundary — API-02 identifier binding and TX-01 transaction integration.
 *
 * AAP authority: AAP §0.4.4 authorises `slatwall-ts/test/**` | CREATE. AAP §0.4.1.12 defines no
 * `test/handlers/` directory, and that absence is itself the reason this file exists: both findings it
 * covers are BOUNDARY defects, and an unexercised boundary is exactly how each of them shipped. The
 * service beneath was tested and correct in isolation; what nobody asserted was what the route did with
 * it.
 *
 * =================================================================================================
 * WHAT THESE CASES PROVE
 * =================================================================================================
 * API-02 — the route bound NO identifier. `TransactionExistsEvent` was `Pick<…,'headers'>` and the call
 * was `getTransactionExistsFlag()`, so the repository's "requires either a SKU identifier or a product
 * identifier" guard fired on every request and an operation typed `Promise<boolean>` could only fail. The
 * cases below assert the identifiers travel, and — the part a "does it get called" test would miss — that
 * they travel in the right SLOTS, since the service is SKU-first and the repository is product-first.
 *
 * TX-01 — the route called the CAPTURED service, which is bound to the pool. Every SKU in a batch was
 * therefore written outside any transaction and was durable before validation had an opinion, so an
 * invalid batch committed: `createSkus` returns `true` unconditionally, and per-SKU findings never reach
 * the product's bag. The cases below assert that the write path enters the runner, that it uses the
 * graph's members rather than the captured ones, and that the commit gate sees a SKU-only finding.
 *
 * NO AWS AND NO DATABASE. Each case builds the one- or two-member event slice the route declares, exactly
 * as the handler's own comments anticipate, and every collaborator is a plain recording object.
 *
 * TEST PROVENANCE: every case is **NET-NEW**. AAP §0.6.5.2 records that no legacy test covers any service
 * in this slice, and no legacy equivalent of a Lambda boundary exists at all.
 */
describe("test/handlers/skuHandler.test.ts — the SKU surface's final wiring, and the transactional write runner (folded, F1, F5)", () => {
  /** A 32-character identifier, the only width the schema declares (IR-6). */
  const PRODUCT_ID = 'bbbbbbbb000000000000000000000001';

  /**
   * A 32-character SKU identifier (IR-6).
   *
   * Used only to prove a NEGATIVE: that the transaction-existence route ignores a query string carrying it.
   */
  const SKU_ID = 'cccccccc000000000000000000000001';

  /**
   * An authorisation resolver that admits every request.
   *
   * ⚠️ PERMISSIVE ON PURPOSE, AND NOT A GAP IN THESE CASES. The gate is a separate concern with its own
   * ladder, and every route under test runs it FIRST — so a restrictive resolver here would short-circuit
   * each case before it reached the behaviour being asserted, and would prove only that the gate works.
   */
  const ADMIT_EVERY_REQUEST: RequestAuthorizationResolver<{ headers: unknown }> = () => ({
    accountContext: {
      getCurrentAccount: () => ({
        accountID: 'aaaaaaaa000000000000000000000001',
        newFlag: false,
        adminAccountFlag: true,
      }),
    },
    entityAuthorization: { authenticateEntity: (): boolean => true },
    populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
  });

  /**
   * A SKU service surface whose every member fails loudly unless a case overrides it.
   *
   * The `UNREACHED_COLLABORATOR` discipline from `test/services/SkuService.test.ts`, applied per member: a
   * route that reaches a member this case did not intend fails on that member rather than passing against a
   * stub that answered something plausible.
   */
  function makeSkuSurface(overrides: Partial<SkuSurface>): SkuSurface {
    const refuse = (member: string) => (): never => {
      throw new Error(`SkuSurface.${member} was not expected to be called by this case`);
    };

    return {
      createSkus: refuse('createSkus'),
      processImageUpload: refuse('processImageUpload'),
      getProductSkus: refuse('getProductSkus'),
      getSortedProductSkus: refuse('getSortedProductSkus'),
      searchSkusByProductType: refuse('searchSkusByProductType'),
      getSkuStocksDeletableFlag: refuse('getSkuStocksDeletableFlag'),
      getTransactionExistsFlag: refuse('getTransactionExistsFlag'),
      getSkuBySkuCode: refuse('getSkuBySkuCode'),
      getSkuSmartList: refuse('getSkuSmartList'),
      newSku: refuse('newSku'),
      ...overrides,
    };
  }

  /**
   * A write runner that reproduces `UnitOfWork.run`'s decision, without a pool.
   *
   * ⛔ IT MUST EVALUATE THE GATE AND THROW ON A ROLL-BACK, because that is the behaviour under test. A
   * double that ran the work and returned its value would make every TX-01 case pass while asserting
   * nothing about the commit decision — which is the whole finding.
   */
  function makeWriteRunner(graph: SkuWriteGraph): {
    readonly runner: TransactionalWriteRunner<SkuWriteGraph>;
    readonly decisions: ('commit' | 'rollback')[];
    readonly securityContexts: RequestAuthorizationContext[];
  } {
    const decisions: ('commit' | 'rollback')[] = [];
    /* SEC-AUTH-03 — every context the handler handed the boundary, in order. */
    const securityContexts: RequestAuthorizationContext[] = [];

    return {
      decisions,
      securityContexts,
      runner: {
        runWrite: async <TResult>(
          /* SEC-AUTH-03 — see the identical note in BrandService.test.ts. */
          security: RequestAuthorizationContext,
          work: (graph: SkuWriteGraph) => Promise<TResult>,
          hasErrors: () => boolean,
        ): Promise<TResult> => {
          securityContexts.push(security);

          const result = await work(graph);

          if (hasErrors()) {
            decisions.push('rollback');
            throw new DomainError('rolled back because the caller reported accumulated findings');
          }

          decisions.push('commit');
          return result;
        },
      },
    };
  }

  /** A product whose identifier the route will address. */
  function makeProduct(): ProductWithErrorState {
    const product = new Product();
    product.productID = PRODUCT_ID;
    return product;
  }

  /** A SKU carrying the error bag `manageEntity` attaches; `Sku` alone declares none. */
  function makeManagedSku(): ReturnType<typeof manageEntity<'skuID', Sku>> {
    return manageEntity(new Sku(), SKU_ENTITY_METADATA);
  }

  /** The event slice `createSkus` declares: a path parameter, a body and headers. */
  function createSkusEvent(): {
    body: string;
    pathParameters: Record<string, string>;
    headers: Record<string, string>;
  } {
    return {
      body: JSON.stringify({ price: 10 }),
      pathParameters: { productID: PRODUCT_ID },
      headers: {},
    };
  }

  describe('SkuHandler.createSkus — the write path enters a transaction (TX-01)', () => {
    it('NET-NEW — the CAPTURED service is never called; the graph’s is', async () => {
      const product = makeProduct();
      let graphCalls = 0;

      const graph: SkuWriteGraph = {
        resolveProduct: () => Promise.resolve(product),
        skuService: {
          createSkus: () => {
            graphCalls += 1;
            return Promise.resolve(true);
          },
        },
      };
      const { runner, decisions } = makeWriteRunner(graph);

      /* ⭐ THE CAPTURED SURFACE REFUSES EVERY MEMBER. Before this fix the route called exactly this
       * object — bound to the POOL — so if the fix regressed, `createSkus` here would throw and the case
       * would fail rather than quietly writing outside the transaction. */
      const handler = createSkuHandler(
        makeSkuSurface({}),
        () => {
          throw new Error('the CAPTURED product resolver must not be used by the write path');
        },
        ADMIT_EVERY_REQUEST,
        runner,
      );

      const response = await handler.createSkus(createSkusEvent());

      expect(graphCalls).toBe(1);
      expect(decisions).toEqual(['commit']);
      expect(response.statusCode).toBe(200);
    });

    it('NET-NEW — M6 — the product is READ through the transaction’s own graph', async () => {
      const product = makeProduct();
      let resolvedThroughGraph = 0;

      const graph: SkuWriteGraph = {
        resolveProduct: (productID: string) => {
          expect(productID).toBe(PRODUCT_ID);
          resolvedThroughGraph += 1;
          return Promise.resolve(product);
        },
        skuService: { createSkus: () => Promise.resolve(true) },
      };
      const { runner } = makeWriteRunner(graph);

      const handler = createSkuHandler(
        makeSkuSurface({}),
        () => {
          throw new Error('the CAPTURED product resolver must not be used by the write path');
        },
        ADMIT_EVERY_REQUEST,
        runner,
      );

      await handler.createSkus(createSkusEvent());

      /* AAP §0.6.2: `hasUniqueOptions` is a validation rule that QUERIES the sibling SKUs the same
       * operation is writing. Reading the aggregate on the pool while writing in the transaction would show
       * that rule a sibling set missing every SKU just created — M6's silent divergence exactly. */
      expect(resolvedThroughGraph).toBe(1);
    });

    it('NET-NEW — a clean batch COMMITS and the boolean is serialised unchanged', async () => {
      const graph: SkuWriteGraph = {
        resolveProduct: () => Promise.resolve(makeProduct()),
        skuService: { createSkus: () => Promise.resolve(true) },
      };
      const { runner, decisions } = makeWriteRunner(graph);

      const handler = createSkuHandler(
        makeSkuSurface({}),
        () => Promise.resolve(null),
        ADMIT_EVERY_REQUEST,
        runner,
      );

      const response = await handler.createSkus(createSkusEvent());

      expect(decisions).toEqual(['commit']);
      // Judgment (n): the boolean is the body, not wrapped in an envelope.
      expect(JSON.parse(response.body)).toBe(true);
    });

    it('NET-NEW — ⭐ a SKU-ONLY finding ROLLS BACK, which product.hasErrors() alone cannot detect', async () => {
      const product = makeProduct();

      const graph: SkuWriteGraph = {
        resolveProduct: () => Promise.resolve(product),
        skuService: {
          createSkus: () => {
            /* What the real `createSkus` does for a colliding SKU code: the finding lands on the SKU, the
             * product's bag stays empty, and `true` is returned regardless [model/service/SkuService.cfc:L207]. */
            const failed = makeManagedSku();
            failed.addError('skuCode', 'This SKU code is already in use.');
            product.skus = [failed];
            return Promise.resolve(true);
          },
        },
      };
      const { runner, decisions } = makeWriteRunner(graph);

      const handler = createSkuHandler(
        makeSkuSurface({}),
        () => Promise.resolve(null),
        ADMIT_EVERY_REQUEST,
        runner,
      );

      const response = await handler.createSkus(createSkusEvent());

      /* THE CASE THAT DEFINES THIS FIX. Both signals a naive gate would read say "success": the product
       * carries nothing and the work returned `true`. Only the per-SKU bag knows, so a gate narrowed to
       * `product.hasErrors()` would COMMIT an invalid batch. */
      expect(product.hasErrors()).toBe(false);
      expect(decisions).toEqual(['rollback']);
      expect(response.statusCode).not.toBe(200);

      /*
       * THE FINDINGS ARE PUBLISHED, NOT MASKED, AND THAT IS THE POINT OF LIFTING THEM. Declining to commit
       * is how the boundary expresses the legacy's "settled as a rollback" branch, but the findings live on
       * the SKU rather than on the rejection, so the route lifts them into a ../errors/ValidationError.
       * AAP 0.4.1.11 requires the error-key structure to be preserved "so validation failures remain
       * comparable to legacy output" — a caller has to be able to see WHICH rule refused, and a body
       * carrying `message` alone could not tell it. `errors` is a declared optional member of the error
       * body, present exactly when there are keys to report.
       */
      const body = JSON.parse(response.body) as {
        message: string;
        errors?: Record<string, unknown>;
      };

      expect(Object.keys(body)).toStrictEqual(['message', 'errors']);
      /* The key is the SKU property the rule refused, and the text is copied UNCHANGED from the finding. */
      expect(body.errors).toStrictEqual({ skuCode: ['This SKU code is already in use.'] });
    });

    it('NET-NEW — a finding on the PRODUCT rolls back too', async () => {
      const product = makeProduct();

      const graph: SkuWriteGraph = {
        resolveProduct: () => Promise.resolve(product),
        skuService: {
          createSkus: () => {
            // [model/service/SkuService.cfc:L143/:L148/:L176] — branch preconditions go to the product.
            product.addError('productType', 'Options cannot be added to this product type.');
            return Promise.resolve(true);
          },
        },
      };
      const { runner, decisions } = makeWriteRunner(graph);

      const handler = createSkuHandler(
        makeSkuSurface({}),
        () => Promise.resolve(null),
        ADMIT_EVERY_REQUEST,
        runner,
      );

      await handler.createSkus(createSkusEvent());

      expect(decisions).toEqual(['rollback']);
    });

    it('NET-NEW — an unknown product is a 404, and the empty transaction still commits', async () => {
      const graph: SkuWriteGraph = {
        resolveProduct: () => Promise.resolve(null),
        skuService: {
          createSkus: () => {
            throw new Error('createSkus must not run for a product that does not exist');
          },
        },
      };
      const { runner, decisions } = makeWriteRunner(graph);

      const handler = createSkuHandler(
        makeSkuSurface({}),
        () => Promise.resolve(null),
        ADMIT_EVERY_REQUEST,
        runner,
      );

      const response = await handler.createSkus(createSkusEvent());

      /* Nothing was written, so there is nothing to discard: a missing product is a 404, not a failed
       * batch, and treating it as a roll-back would report a server-side failure for a client-side miss. */
      expect(response.statusCode).toBe(404);
      expect(decisions).toEqual(['commit']);
    });
  });

  describe('SkuHandler.getTransactionExistsFlag — the scoped probe is published (API-02)', () => {
    /*
     * ⭐ WHAT THIS BLOCK ASSERTS, AND WHY IT IS THE OPPOSITE OF WHAT IT ONCE ASSERTED.
     * A revision narrowed `SkuService.getTransactionExistsFlag` to ZERO parameters on a literal reading of
     * AAP §0.4.2.2's Discrepancy 4, narrowed this route's event slice to the headers alone, and translated
     * the resulting inevitable failure into a fixed 501. The cases here pinned that shape. Review finding
     * F1 withdrew all three, because:
     *
     *   - Discrepancy 4 records the DECLARATION at `model/service/SkuService.cfc:L285`, not the contract.
     *     `[:L286]` forwards `argumentCollection=arguments`, and CFML puts undeclared named arguments into
     *     that collection, so the member observably takes two optional identifiers.
     *   - BOTH real callers supply one — `model/entity/Sku.cfc:L594` passes `skuID=` and
     *     `model/entity/Product.cfc:L626` passes `productID=` — so a zero-parameter port discards the only
     *     input the member ever receives.
     *   - TR-1 is the governing rule: "Where a legacy signature is loose … the target signature is
     *     tightened to the observed contract."
     *
     * So the boundary reads both optional identifiers, forwards them SKU-FIRST (the service's own order),
     * and answers the repository's boolean. An UNSCOPED probe still reaches the legacy's own refusal at
     * `model/dao/SkuDAO.cfc:L90` and is shaped by `src/handlers/httpResponse.ts` like any other service
     * failure — deliberately not reclassified into a fixed status, because the failure is the legacy's and
     * not this boundary's (IR-9).
     */
    function makeHandler(): {
      readonly handler: ReturnType<typeof createSkuHandler>;
      readonly calls: (readonly [string | undefined, string | undefined])[];
    } {
      const calls: (readonly [string | undefined, string | undefined])[] = [];

      const handler = createSkuHandler(
        makeSkuSurface({
          getTransactionExistsFlag: (skuID?: string, productID?: string): Promise<boolean> => {
            calls.push([skuID, productID]);

            /* The repository refuses an unscoped probe [model/dao/SkuDAO.cfc:L90]; the real service lets
             * that refusal through untouched, so the double raises rather than answering plausibly. Any
             * scoped probe answers `true` here, which is enough to prove the value is forwarded. */
            if (skuID === undefined && productID === undefined) {
              return Promise.reject(
                new DomainError(
                  'The transaction probe requires either a SKU identifier or a product identifier.',
                ),
              );
            }

            return Promise.resolve(true);
          },
        }),
        () => Promise.resolve(null),
        ADMIT_EVERY_REQUEST,
        makeWriteRunner({
          resolveProduct: () => Promise.resolve(null),
          skuService: { createSkus: () => Promise.resolve(true) },
        }).runner,
      );

      return { handler, calls };
    }

    it('NET-NEW — a SKU-scoped request forwards `skuID` FIRST and answers the boolean', async () => {
      const { handler, calls } = makeHandler();

      const response = await handler.getTransactionExistsFlag({
        queryStringParameters: { skuID: SKU_ID },
        headers: {},
      });

      /* ⭐ THE ARGUMENT LIST IS THE ASSERTION. SKU-first is the service's order, and this boundary
       * performs no crossing — the single crossing onto the repository's product-first order happens
       * inside `SkuService` itself. */
      expect(calls).toEqual([[SKU_ID, undefined]]);
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toBe(true);
    });

    it('NET-NEW — a product-scoped request forwards `productID` SECOND and answers the boolean', async () => {
      const { handler, calls } = makeHandler();

      const response = await handler.getTransactionExistsFlag({
        queryStringParameters: { productID: PRODUCT_ID },
        headers: {},
      });

      expect(calls).toEqual([[undefined, PRODUCT_ID]]);
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toBe(true);
    });

    it('NET-NEW — both identifiers are forwarded when both are supplied, and neither is dropped', async () => {
      /* `model/dao/SkuDAO.cfc:L58` gives `skuID` precedence when both are present. That precedence belongs
       * to the repository, so this boundary must forward BOTH slots rather than choosing for it. */
      const { handler, calls } = makeHandler();

      await handler.getTransactionExistsFlag({
        queryStringParameters: { skuID: SKU_ID, productID: PRODUCT_ID },
        headers: {},
      });

      expect(calls).toEqual([[SKU_ID, PRODUCT_ID]]);
    });

    it('NET-NEW — the unsaved sentinel is reported as ABSENT rather than forwarded as a scope', async () => {
      /*
       * [model/entity/Sku.cfc:L52] and [model/entity/Product.cfc:L52] both declare `unsavedvalue=""`, so an
       * empty identifier can never address a persisted row. Forwarding it would scope the probe to a row
       * that cannot exist and answer `false` — and a `false` from this flag PERMITS A DELETE
       * ([model/validation/Product.json:L12], [model/validation/Sku.json]). It therefore collapses to
       * absent, and the unscoped call refuses instead.
       */
      const { handler, calls } = makeHandler();

      const response = await handler.getTransactionExistsFlag({
        queryStringParameters: { skuID: '', productID: '' },
        headers: {},
      });

      expect(calls).toEqual([[undefined, undefined]]);
      expect(response.statusCode).not.toBe(200);
    });

    it('NET-NEW — IR-9 — an UNSCOPED request surfaces the legacy refusal and fabricates nothing', async () => {
      const { handler, calls } = makeHandler();

      const response = await handler.getTransactionExistsFlag({
        queryStringParameters: null,
        headers: {},
      });

      /* The service IS called, with both slots absent — which is exactly what `[:L286]`'s
       * `argumentCollection=arguments` forwards when `arguments` is empty. */
      expect(calls).toEqual([[undefined, undefined]]);

      /* IR-9: no guard is added here and no value is fabricated. `false` would be the dangerous
       * substitute, and `true` would block a delete the legacy never blocked. */
      expect(response.statusCode).not.toBe(200);
      expect(JSON.parse(response.body)).not.toBe(false);

      /*
       * ⛔ AND IT IS NOT PRESENTED AS 501 EITHER. A revision remapped this catch to a fixed
       * not-implemented status on the ground that the route could never succeed. It can now succeed — the
       * four cases above do — so a permanent classification would be false. The failure travels as the
       * service failure it is.
       */
      expect(response.statusCode).not.toBe(501);

      /*
       * `src/errors/DomainError.ts` states the rule ("Assert on the CODE … never on these strings"), so
       * this asserts the SHAPE and the ABSENCE of disclosure rather than the neutral text.
       */
      const body = JSON.parse(response.body) as Record<string, unknown>;

      expect(Object.keys(body)).toStrictEqual(['message']);
      expect(JSON.stringify(body)).not.toContain('SKU identifier');
      expect(JSON.stringify(body)).not.toContain('SkuDAO');
      expect(JSON.stringify(body)).not.toContain('getTransactionExistsFlag');
    });

    it('NET-NEW — the gate still runs first, so an unauthorised caller learns nothing', async () => {
      const calls: unknown[][] = [];

      const handler = createSkuHandler(
        makeSkuSurface({
          getTransactionExistsFlag: (...args: unknown[]): Promise<boolean> => {
            calls.push(args);
            return Promise.resolve(true);
          },
        }),
        () => Promise.resolve(null),
        () => ({
          accountContext: {
            getCurrentAccount: () => ({
              accountID: '',
              newFlag: true,
              adminAccountFlag: false,
            }),
          },
          entityAuthorization: { authenticateEntity: (): boolean => false },
          populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
        }),
        makeWriteRunner({
          resolveProduct: () => Promise.resolve(null),
          skuService: { createSkus: () => Promise.resolve(true) },
        }).runner,
      );

      const response = await handler.getTransactionExistsFlag({
        queryStringParameters: { skuID: SKU_ID },
        headers: {},
      });

      /* The anti-enumeration property: refused before the identifier is read or the service consulted, so
       * an unauthorised caller cannot use this route to discover which SKUs exist. */
      expect(response.statusCode).toBe(401);
      expect(calls).toEqual([]);
    });
  });

  describe('UnitOfWorkWriteRunner — the graph is built for the transaction (TX-01)', () => {
    /** A scope carrying a recognisable executor, so a case can prove the graph was built from it. */
    const scope: TransactionScope = {
      /*
       * `executeMutation` is part of the transactional executor contract — the scoped executor reports an
       * affected-row count as well as rows, so a double that published only `execute` no longer satisfies
       * it. It refuses rather than answering zero: no case here issues a mutation through this scope, and
       * a plausible zero would hide one that did.
       */
      executor: {
        execute: () => Promise.resolve([]),
        executeMutation: (): Promise<number> => {
          throw new Error('executeMutation was not expected to be called by this case');
        },
      },
    };

    /** A UnitOfWork slice that runs the work against `scope` and reproduces the commit decision. */
    function makeUnitOfWork(): {
      readonly unitOfWork: UnitOfWorkRunner;
      readonly gates: boolean[];
    } {
      const gates: boolean[] = [];

      return {
        gates,
        unitOfWork: {
          run: async <T>(
            work: (scope: TransactionScope) => Promise<T>,
            hasErrors: () => boolean,
          ): Promise<T> => {
            const result = await work(scope);
            gates.push(hasErrors());
            return result;
          },
        },
      };
    }

    it('NET-NEW — the work receives a graph built from the transaction’s scope, not an ambient one', async () => {
      const { unitOfWork } = makeUnitOfWork();
      const seen: TransactionScope[] = [];

      const seenSecurity: RequestAuthorizationContext[] = [];
      const runner = new MySqlTransactionalWriteRunner(
        unitOfWork,
        (transactionScope: TransactionScope, security: RequestAuthorizationContext) => {
          seen.push(transactionScope);
          /* SEC-AUTH-03 — the factory receives the invocation's authorised principal ALONGSIDE the scope,
           * which is what lets `../../src/config/container.ts` substitute it for the memoised account and
           * population ports when it rebuilds a graph. */
          seenSecurity.push(security);
          return { executor: transactionScope.executor };
        },
      );

      const invocationSecurity = securityContext({ account: persistedAdminAccount() });
      const graph = await runner.runWrite(
        invocationSecurity,
        (builtGraph: { readonly executor: TransactionScope['executor'] }) =>
          Promise.resolve(builtGraph),
        () => false,
      );

      /* The point of the whole class: the graph's executor IS the transaction's. A graph built from the
       * pool would run its statements on another connection, outside the unit being committed, and a
       * roll-back would leave them behind with nothing reporting a problem. */
      expect(seen).toEqual([scope]);
      expect(graph.executor).toBe(scope.executor);

      /* SEC-AUTH-03 — forwarded unchanged and unwrapped, and NOT stored on the runner: the class holds no
       * principal of its own, which is what keeps a warm container from carrying one invocation's identity
       * into the next (M7). */
      expect(seenSecurity).toStrictEqual([invocationSecurity]);
    });

    it('NET-NEW — the commit gate is forwarded UNCHANGED, so the decision lives in one place', async () => {
      const { unitOfWork, gates } = makeUnitOfWork();
      const runner = new MySqlTransactionalWriteRunner(unitOfWork, () => ({}));

      await runner.runWrite(
        securityContext({ account: persistedAdminAccount() }),
        () => Promise.resolve('done'),
        () => true,
      );

      // Not re-interpreted, not negated, not defaulted: `UnitOfWork.run` saw exactly what the caller said.
      expect(gates).toEqual([true]);
    });

    it('NET-NEW — M7 — the graph is rebuilt per invocation and never cached across them', async () => {
      const { unitOfWork } = makeUnitOfWork();
      let built = 0;

      const runner = new MySqlTransactionalWriteRunner(unitOfWork, () => {
        built += 1;
        return {};
      });

      await runner.runWrite(
        securityContext({ account: persistedAdminAccount() }),
        () => Promise.resolve(1),
        () => false,
      );
      await runner.runWrite(
        securityContext({ account: persistedAdminAccount() }),
        () => Promise.resolve(2),
        () => false,
      );

      /* A cached graph would be bound to a RELEASED connection, and on a warm container it would outlive
       * the request that made it — AAP §0.6.6 M7's cross-request bleed. */
      expect(built).toBe(2);
    });
  });

  /* =================================================================================================
   * THE DELIVERED FACTORY'S OWN COMMIT GATE (TX-01)
   * ================================================================================================
   * ⭐ WHY THIS SECTION EXISTS. Every case above drives `createSkuHandler`, the LIVE route, whose gate was
   * already the complete predicate. `createProductSkuCreationBoundary` is the shape the composition root
   * is told to reuse — and it had no direct coverage at all, which is how it came to gate on
   * `product.hasErrors()` alone while the route beside it gated on `skuBatchHasErrors`. A batch whose SKU
   * codes collide leaves the product's own bag EMPTY
   * [org/Hibachi/HibachiValidationService.cfc:L193 writes findings onto the entity it validated, never
   * onto its parent] and `createSkus` returns an unconditional `true`
   * [model/service/SkuService.cfc:L207], so the withdrawn gate committed invalid work silently.
   *
   * The four outcomes below are the complete decision table for the gate: clean, product-level finding,
   * SKU-only finding, and no such product.
   * ============================================================================================== */

  describe('createProductSkuCreationBoundary — the delivered factory settles on the whole batch (TX-01)', () => {
    /**
     * A `runScoped` double that records the settle decision the boundary's gate produced.
     *
     * Structurally `UnitOfWork.runScoped`: it builds the graph from a scope, runs the work, then asks the
     * gate about the RESULT — which is the signature detail that matters here, because the boundary's gate
     * reads the settled `SkuCreationOutcome` rather than closing over a captured variable.
     *
     * It takes no graph of its own: the boundary supplies one through the `buildGraph` callback, and this
     * double deliberately calls THAT rather than substituting a graph of its own, so a boundary that
     * ignored its callback would be caught here instead of passing.
     */
    function makeScopedRunner(): {
      readonly runner: ScopedTransactionRunner<symbol>;
      readonly decisions: ('commit' | 'rollback')[];
    } {
      const decisions: ('commit' | 'rollback')[] = [];
      const scope = Symbol('transaction scope');

      return {
        decisions,
        runner: {
          runScoped: async <TGraph, TResult>(
            buildGraph: (scope: symbol) => TGraph,
            work: (graph: TGraph) => Promise<TResult>,
            reportErrors: (result: TResult) => boolean,
          ): Promise<TResult> => {
            const result = await work(buildGraph(scope));

            if (reportErrors(result)) {
              decisions.push('rollback');
              throw new DomainError('rolled back because the gate reported accumulated findings');
            }

            decisions.push('commit');
            return result;
          },
        },
      };
    }

    /** Build the boundary over a graph, ignoring the scope the way a real root would not. */
    function makeBoundary(graph: SkuCreationGraph): {
      readonly boundary: ReturnType<typeof createProductSkuCreationBoundary>;
      readonly decisions: ('commit' | 'rollback')[];
    } {
      const { runner, decisions } = makeScopedRunner();

      return {
        decisions,
        boundary: createProductSkuCreationBoundary(runner, () => graph),
      };
    }

    it('NET-NEW — a CLEAN batch commits and the service’s boolean is returned unchanged', async () => {
      const { boundary, decisions } = makeBoundary({
        resolveProduct: () => Promise.resolve(makeProduct()),
        skuService: { createSkus: () => Promise.resolve(true) },
      });

      await expect(boundary(PRODUCT_ID, {})).resolves.toBe(true);
      expect(decisions).toEqual(['commit']);
    });

    it('NET-NEW — a PRODUCT-level finding rolls back', async () => {
      /*
       * The three branch preconditions `createSkus` records write here, via `product.addError(…)`
       * [model/service/SkuService.cfc:L143, :L148, :L176]. This is the case the withdrawn gate DID catch,
       * asserted so the fix is proved to have kept it rather than traded one blind spot for another.
       */
      const product = makeProduct();

      const { boundary, decisions } = makeBoundary({
        resolveProduct: () => Promise.resolve(product),
        skuService: {
          createSkus: () => {
            product.addError('productType', 'Options cannot be added to this product type.');
            return Promise.resolve(true);
          },
        },
      });

      await expect(boundary(PRODUCT_ID, {})).rejects.toBeInstanceOf(DomainError);
      expect(decisions).toEqual(['rollback']);
    });

    it('NET-NEW — ⭐ a SKU-ONLY finding rolls back, which product.hasErrors() alone cannot detect', async () => {
      /*
       * ⭐ THE REGRESSION THIS SECTION EXISTS FOR. The finding lands on the SKU, the product's bag stays
       * EMPTY, and the service still answers `true` — so nothing the withdrawn gate could see reported a
       * failure, and the invalid batch committed.
       */
      const product = makeProduct();

      const { boundary, decisions } = makeBoundary({
        resolveProduct: () => Promise.resolve(product),
        skuService: {
          createSkus: () => {
            const failed = makeManagedSku();
            failed.addError('skuCode', 'This SKU code is already in use.');
            product.skus = [failed];
            return Promise.resolve(true);
          },
        },
      });

      /* The precondition that makes this case meaningful: the product itself is clean. */
      expect(product.hasErrors()).toBe(false);

      await expect(boundary(PRODUCT_ID, {})).rejects.toBeInstanceOf(DomainError);
      expect(decisions).toEqual(['rollback']);
    });

    it('NET-NEW — a MISSING product commits an empty transaction and answers null', async () => {
      /*
       * Nothing was written, so there is nothing to undo; reporting a roll-back would describe a failure
       * that did not occur, and raising would turn the legacy's "no such row" answer into a fault. The
       * service must never be reached.
       */
      let created = 0;

      const { boundary, decisions } = makeBoundary({
        resolveProduct: () => Promise.resolve(null),
        skuService: {
          createSkus: () => {
            created += 1;
            return Promise.resolve(true);
          },
        },
      });

      await expect(boundary(PRODUCT_ID, {})).resolves.toBeNull();
      expect(decisions).toEqual(['commit']);
      expect(created).toBe(0);
    });

    it('NET-NEW — the product is resolved INSIDE the boundary, from the graph the scope built', async () => {
      /*
       * M6: resolving outside would put the read on a different connection from the writes, so each
       * insert would not be visible to the next SKU's uniqueness read (AAP §0.6.2).
       */
      const addressed: string[] = [];
      let graphBuilds = 0;

      const graph: SkuCreationGraph = {
        resolveProduct: (productID: string) => {
          addressed.push(productID);
          return Promise.resolve(makeProduct());
        },
        skuService: { createSkus: () => Promise.resolve(true) },
      };

      const { runner } = makeScopedRunner();
      const boundary = createProductSkuCreationBoundary(runner, () => {
        graphBuilds += 1;
        return graph;
      });

      await boundary(PRODUCT_ID, {});

      expect(addressed).toEqual([PRODUCT_ID]);
      /* Built per invocation: a cached graph would be bound to a RELEASED connection (M7). */
      expect(graphBuilds).toBe(1);
      await boundary(PRODUCT_ID, {});
      expect(graphBuilds).toBe(2);
    });

    it('NET-NEW — the payload reaches the service UNRESHAPED (M6)', async () => {
      const payload = { 'optionGroups.1.options': 'og-1', price: '12.50' };
      const seen: Record<string, unknown>[] = [];

      const { boundary } = makeBoundary({
        resolveProduct: () => Promise.resolve(makeProduct()),
        skuService: {
          createSkus: (_product, data) => {
            seen.push(data);
            return Promise.resolve(true);
          },
        },
      });

      await boundary(PRODUCT_ID, payload);

      expect(seen).toEqual([payload]);
      expect(seen[0]).toBe(payload);
    });
  });

  describe('SkuHandler.createSkus — the write asks BOTH questions, conjunctively (SEC-AUTH-01, SEC-AUTH-02)', () => {
    /*
     * ⭐ REVIEW FINDING SEC-AUTH-01 (CRITICAL, CWE-862 / CWE-639) AND SEC-AUTH-02's CONJUNCTIVE HALF.
     *
     * WHAT WAS WRONG. `SKU_ACCESS_MATRIX.createSkus` carried an ORDERED TUPLE, `['create', 'update']` on
     * `Product`, and the gate walked it accepting the FIRST grant. So a principal holding only `create` on
     * `Product` — the grant a catalog author needs to add a NEW product — could name an EXISTING product in
     * `pathParameters.productID`, satisfy the `create` question asked first, and have the route resolve that
     * product inside the transaction and write SKU rows into it. The `update` question, the only one
     * describing what the route performs on an addressed product, was never reached in exactly that case.
     * And no `Sku` question was asked at all, even though SKU rows are what the route inserts.
     *
     * WHAT IS ASSERTED NOW. One primary question, `update` on `Product`, and one CONJUNCTIVE subordinate
     * question, `create` on `Sku`. Both must be granted; either alone is refused. The addressed product
     * travels with the primary question so a deployment may scope the grant to the row.
     *
     * ⛔ WHY THE PERMISSIVE `ADMIT_EVERY_REQUEST` RESOLVER ABOVE COULD NOT CATCH THIS. It answers `true` to
     * every question, so it passes under the vulnerable tuple and under the fixed conjunction identically.
     * These cases record the QUESTIONS rather than only the verdict, because which question is asked is the
     * entire substance of the finding.
     *
     * TEST PROVENANCE: NET-NEW. AAP §0.6.5.2 — no legacy test covers any service in this slice, and no
     * legacy equivalent of a Lambda authorisation boundary exists at all.
     */

    /** The entity name the primary question names — the CFML component name, not the smart-list root. */
    const PRODUCT_COMPONENT_NAME = 'Product';

    /** The entity name the subordinate question names. */
    const SUBORDINATE_SKU_NAME = 'Sku';

    /**
     * A resolver recording every entity question, answering each from `grants`.
     *
     * The `entityID` is recorded alongside, because SEC-AUTH-01's second half is that the question must be
     * bound to the row being written: a question that named no identifier would pass a "did it ask about
     * `update`" test while still authorising the write against any product in the catalog.
     */
    const resolverGrantingProduct = (
      grants: readonly { readonly crudType: string; readonly entityName: string }[],
      options: { readonly loggedIn: boolean } = { loggedIn: true },
    ): {
      /* ⭐ TYPED AS THE INVOCATION RESOLVER, NOT THE HEADER-ONLY SHAPE — review finding SEC-AUTH-03. The
       * sibling helpers in this file still take `RequestAuthorizationResolver<{ headers: unknown }>`, which
       * is assignable at the call site but hides the request: these cases assert on the ACTION and the
       * QUESTION the boundary sends, so the narrower type would not compile against them. */
      readonly resolver: InvocationSecurityResolver;
      readonly questions: { crudType: string; entityName: string; entityID?: string }[];
      readonly requests: { action: string; crudType: string; entityName: string }[];
      readonly contexts: RequestAuthorizationContext[];
    } => {
      const questions: { crudType: string; entityName: string; entityID?: string }[] = [];
      const requests: { action: string; crudType: string; entityName: string }[] = [];
      const contexts: RequestAuthorizationContext[] = [];

      return {
        questions,
        requests,
        contexts,
        resolver: (request): RequestAuthorizationContext => {
          requests.push({
            action: request.action,
            crudType: request.crudType,
            entityName: request.entityName,
          });

          const context: RequestAuthorizationContext = {
            accountContext: {
              getCurrentAccount: () =>
                options.loggedIn
                  ? {
                      accountID: 'aaaaaaaa000000000000000000000003',
                      newFlag: false,
                      adminAccountFlag: false,
                    }
                  : undefined,
            },
            entityAuthorization: {
              authenticateEntity: (question): boolean => {
                questions.push({
                  crudType: question.crudType,
                  entityName: question.entityName,
                  ...(question.entityID === undefined ? {} : { entityID: question.entityID }),
                });
                return grants.some(
                  (grant) =>
                    grant.crudType === question.crudType &&
                    grant.entityName === question.entityName,
                );
              },
            },
            populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
          };

          contexts.push(context);
          return context;
        },
      };
    };

    /** A handler whose write graph counts the SKU creations it is asked for. */
    const handlerCounting = (
      resolver: InvocationSecurityResolver,
    ): {
      readonly handler: ReturnType<typeof createSkuHandler>;
      readonly creations: { productID: string }[];
      readonly securityContexts: RequestAuthorizationContext[];
    } => {
      const creations: { productID: string }[] = [];
      const { runner, securityContexts } = makeWriteRunner({
        resolveProduct: (productID: string) => Promise.resolve(makeProduct2(productID)),
        skuService: {
          createSkus: (product) => {
            creations.push({ productID: product.productID ?? '' });
            return Promise.resolve(true);
          },
        },
      });

      return {
        creations,
        securityContexts,
        handler: createSkuHandler(
          makeSkuSurface({}),
          () => {
            throw new Error('the CAPTURED product resolver must not be used by the write path');
          },
          resolver,
          runner,
        ),
      };
    };

    /** A product carrying an arbitrary identifier, so the addressed row can be asserted. */
    const makeProduct2 = (productID: string): ProductWithErrorState => {
      const product = new Product();
      product.productID = productID;
      return product;
    };

    it('NET-NEW — the matrix row asks `update` on `Product` with a CONJUNCTIVE `create` on `Sku`', () => {
      /*
       * Asserted on the exported table rather than only through the route, so the classification cannot be
       * loosened without a named failure even if every route case below were deleted. `create` must NOT be
       * the primary `crudType`: that is precisely the tuple ordering SEC-AUTH-01 withdrew.
       */
      expect(SKU_ACCESS_MATRIX.createSkus).toEqual({
        classification: 'secure',
        entityName: PRODUCT_COMPONENT_NAME,
        crudType: 'update',
        subordinate: { entityName: SUBORDINATE_SKU_NAME, crudType: 'create' },
      });
    });

    it('NET-NEW — SEC-AUTH-01 — `create` on `Product` ALONE no longer reaches the write', async () => {
      /*
       * ⭐ THE ESCALATION CASE, AND THE ONE THAT WOULD HAVE PASSED BEFORE THE FIX. Under the withdrawn
       * tuple this principal was admitted: `create` was asked first and granted, and the route then wrote
       * SKUs into a product it held no authority to modify. It must now be refused, and the write must
       * never be entered.
       */
      const { resolver, questions } = resolverGrantingProduct([
        { crudType: 'create', entityName: PRODUCT_COMPONENT_NAME },
        { crudType: 'create', entityName: SUBORDINATE_SKU_NAME },
      ]);
      const { handler, creations, securityContexts } = handlerCounting(resolver);

      const response = await handler.createSkus(createSkusEvent());

      expect(response.statusCode).toBe(403);
      // ⭐ NOT MERELY A STATUS: no transaction is opened and no SKU is created.
      expect(creations).toEqual([]);
      expect(securityContexts).toEqual([]);
      /* Exactly ONE question is asked, and it is the primary one — the subordinate is not reached, because
       * the conjunction short-circuits on the first refusal. */
      expect(questions).toEqual([
        { crudType: 'update', entityName: PRODUCT_COMPONENT_NAME, entityID: PRODUCT_ID },
      ]);
    });

    it('NET-NEW — SEC-AUTH-02 — `update` on `Product` alone is NOT authority for the SKU inserts', async () => {
      /*
       * The conjunctive half. This principal may legitimately edit the product, but holds no grant over the
       * SKU rows the route inserts, so the route refuses. Under the withdrawn tuple no `Sku` question
       * existed at all and this principal was admitted.
       */
      const { resolver, questions } = resolverGrantingProduct([
        { crudType: 'update', entityName: PRODUCT_COMPONENT_NAME },
      ]);
      const { handler, creations } = handlerCounting(resolver);

      const response = await handler.createSkus(createSkusEvent());

      expect(response.statusCode).toBe(403);
      expect(creations).toEqual([]);
      /* BOTH questions are asked, in order — the primary is granted, so the subordinate is reached and
       * refuses. This is what proves the second question exists rather than being merely declared.
       *
       * ⭐ AND THE SUBORDINATE CARRIES NO `entityID`, DELIBERATELY. The addressed identifier names the
       * PRODUCT; attaching it to a question about `Sku` would tell a resolver something untrue, and a
       * deployment scoping grants per row would then match a Product UUID against SKU rows. The SKUs this
       * route inserts do not exist yet, so there is no SKU row to name. */
      expect(questions).toEqual([
        { crudType: 'update', entityName: PRODUCT_COMPONENT_NAME, entityID: PRODUCT_ID },
        { crudType: 'create', entityName: SUBORDINATE_SKU_NAME },
      ]);
    });

    it('NET-NEW — BOTH grants admit the write, and the authorised context reaches the boundary', async () => {
      const { resolver, questions, requests, contexts } = resolverGrantingProduct([
        { crudType: 'update', entityName: PRODUCT_COMPONENT_NAME },
        { crudType: 'create', entityName: SUBORDINATE_SKU_NAME },
      ]);
      const { handler, creations, securityContexts } = handlerCounting(resolver);

      const response = await handler.createSkus(createSkusEvent());

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toBe(true);
      expect(creations).toEqual([{ productID: PRODUCT_ID }]);
      expect(questions).toEqual([
        { crudType: 'update', entityName: PRODUCT_COMPONENT_NAME, entityID: PRODUCT_ID },
        // No `entityID` on the subordinate — see the note in the preceding case.
        { crudType: 'create', entityName: SUBORDINATE_SKU_NAME },
      ]);

      /* ⭐ SEC-AUTH-03 — ONE RESOLUTION PER INVOCATION, carrying the routed action and the primary
       * question, and the resolved context is the one handed to the transaction boundary. Before the fix
       * the boundary received no context at all and the graph read a MEMOISED principal instead. */
      expect(requests).toEqual([
        {
          action: 'sku.createSkus',
          crudType: 'update',
          entityName: PRODUCT_COMPONENT_NAME,
        },
      ]);
      expect(securityContexts).toHaveLength(1);
      expect(securityContexts[0]).toBe(contexts[0]);
    });

    it('NET-NEW — an anonymous request is refused 401 before any question is asked', async () => {
      const { resolver, questions } = resolverGrantingProduct([], { loggedIn: false });
      const { handler, creations } = handlerCounting(resolver);

      const response = await handler.createSkus(createSkusEvent());

      expect(response.statusCode).toBe(401);
      /* Steps 1 and 2 of the ladder answer before step 3, so no permission question is reached. */
      expect(questions).toEqual([]);
      expect(creations).toEqual([]);
    });

    it('NET-NEW — SEC-AUTH-01 — the question names the VICTIM product, not a placeholder', async () => {
      /*
       * CWE-639's half of the finding. Asking `update` on the entity CLASS while ignoring which row is
       * addressed authorises a write against every product in the catalog. The identifier the caller
       * supplied must be the identifier the question carries, so a deployment that scopes grants per row can
       * actually refuse.
       */
      const victimProductID = 'bbbbbbbb00000000000000000000dead';
      const { resolver, questions } = resolverGrantingProduct([]);
      const { handler } = handlerCounting(resolver);

      const response = await handler.createSkus({
        body: JSON.stringify({ price: 10 }),
        pathParameters: { productID: victimProductID },
        headers: {},
      });

      expect(response.statusCode).toBe(403);
      expect(questions).toEqual([
        { crudType: 'update', entityName: PRODUCT_COMPONENT_NAME, entityID: victimProductID },
      ]);
    });
  });

  describe('SkuHandler.processImageUpload — the image write is permission-checked (finding F2)', () => {
    /*
     * ⭐ SEC-HARDENING (D18-CLASS) — review finding F2, CWE-434's least-privilege half.
     *
     * WHY THESE CASES DID NOT EXIST BEFORE, AND WHY THAT MATTERED. The row was classified `'anyLogin'`, and
     * `ADMIT_EVERY_REQUEST` above admits every request by design — so no case in this file asserted any
     * classification at all, and the one that could have has always been `refuse('processImageUpload')` on
     * the surface double, which proves only that the member is not reached. A reclassification was therefore
     * invisible to the suite in BOTH directions: nothing failed when it was loose, and nothing would have
     * failed had it silently gone loose again. These cases close that.
     *
     * THE EVIDENCE FOR `'secure'` is set out at the `processImageUpload` row of `SKU_ACCESS_MATRIX`; the
     * measurement that carries it is that `grep -rn processImageUpload` over the whole legacy CFML tree
     * returns exactly one line — the declaration at `model/service/SkuService.cfc:L210` — so there is no
     * legacy caller for a tighter requirement to refuse.
     *
     * TEST PROVENANCE: NET-NEW, for the reason AAP §0.6.5.2 gives: no legacy test covers any service in this
     * slice, and no legacy equivalent of a Lambda boundary exists at all.
     */

    const SKU_CODE = 'TESTSKU001';

    /**
     * The entity name every SKU authorisation question in `skuHandler.ts` names.
     *
     * ⚠️ IT IS THE CFML *COMPONENT* NAME, `'Sku'`, AND NOT THE SMART-LIST ROOT `'SlatwallSku'`. This is
     * measured rather than assumed: a first draft of these cases asserted the latter, borrowing the constant
     * of that name from `src/services/SkuService.ts`, and all four route cases failed at once. The legacy
     * derives the name from the ITEM by substring arithmetic — `right(itemName, len(itemName)-4)` at
     * [org/Hibachi/HibachiAuthenticationService.cfc:L60] — so an `editSku` item yields `Sku`. The two names
     * live in different vocabularies: one addresses a permission row, the other names an ORM root in HQL.
     */
    const SKU_COMPONENT_NAME = 'Sku';

    /** The slice `processImageUpload` declares: a body, a path parameter and headers. */
    const imageUploadEvent = (): {
      body: string;
      pathParameters: Record<string, string>;
      headers: Record<string, string>;
    } => ({
      body: JSON.stringify({ tempDirectory: '/tmp', serverFile: 'shirt.jpg' }),
      pathParameters: { skuCode: SKU_CODE },
      headers: {},
    });

    /**
     * A resolver recording every entity question, answering each from `grants`.
     *
     * The questions are recorded rather than merely counted, because WHICH question is asked is the whole
     * substance of the classification: a row that asked `read` would pass a "did it check something" test
     * while granting the write to every reader.
     */
    const resolverGranting = (
      grants: readonly { readonly crudType: string; readonly entityName: string }[],
      options: { readonly loggedIn: boolean } = { loggedIn: true },
    ): {
      readonly resolver: RequestAuthorizationResolver<{ headers: unknown }>;
      readonly questions: { crudType: string; entityName: string }[];
    } => {
      const questions: { crudType: string; entityName: string }[] = [];

      return {
        questions,
        resolver: () => ({
          accountContext: {
            getCurrentAccount: () =>
              options.loggedIn
                ? {
                    accountID: 'aaaaaaaa000000000000000000000002',
                    newFlag: false,
                    adminAccountFlag: false,
                  }
                : undefined,
          },
          entityAuthorization: {
            authenticateEntity: (question: { crudType: string; entityName: string }): boolean => {
              questions.push({ crudType: question.crudType, entityName: question.entityName });
              return grants.some(
                (grant) =>
                  grant.crudType === question.crudType && grant.entityName === question.entityName,
              );
            },
          },
          populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
        }),
      };
    };

    const handlerWith = (
      resolver: RequestAuthorizationResolver<{ headers: unknown }>,
      overrides: Partial<SkuSurface>,
    ): ReturnType<typeof createSkuHandler> =>
      createSkuHandler(
        makeSkuSurface(overrides),
        () => {
          throw new Error('no product resolution is expected on the image-write path');
        },
        resolver,
        makeWriteRunner({
          resolveProduct: () => {
            throw new Error('no product resolution is expected on the image-write path');
          },
          skuService: {
            createSkus: () => {
              throw new Error('no SKU creation is expected on the image-write path');
            },
          },
        }).runner,
      );

    it('NET-NEW — the matrix row is SECURE, asking exactly `update` on `Sku`', () => {
      /*
       * Asserted on the exported table rather than only through a route, so the classification cannot be
       * loosened without a named failure even if every route case were deleted. `'read'` in particular must
       * not appear: it is the question the seven sibling rows ask, and reusing it here would grant the one
       * write in the file to every reader.
       */
      /* SEC-AUTH-01 renamed the member from the ordered tuple `crudTypes` to the single `crudType`, so a
       * row can no longer express "either of these two grants will do". The question this row asks is
       * unchanged. */
      expect(SKU_ACCESS_MATRIX.processImageUpload).toEqual({
        classification: 'secure',
        entityName: SKU_COMPONENT_NAME,
        crudType: 'update',
      });
    });

    it('NET-NEW — a logged-in account WITHOUT the grant is refused 403 and never reaches the service', async () => {
      let serviceCalls = 0;
      const { resolver, questions } = resolverGranting([]);
      const handler = handlerWith(resolver, {
        processImageUpload: () => {
          serviceCalls += 1;
          return Promise.resolve(true);
        },
      });

      const response = await handler.processImageUpload(imageUploadEvent());

      expect(response.statusCode).toBe(403);
      /* ⭐ THE GATE RUNS BEFORE ANY PARAMETER IS READ, so the refusal is not merely a status: the write
       * member is never invoked, and no SKU is even looked up. */
      expect(serviceCalls).toBe(0);
      expect(questions).toEqual([{ crudType: 'update', entityName: SKU_COMPONENT_NAME }]);
    });

    it('NET-NEW — an account with `read` on `Sku` but not `update` is still refused', async () => {
      /*
       * The case that separates this row from its seven siblings. Under the previous `'anyLogin'`
       * classification this principal was admitted to the write; under a mistaken `'read'` row it would be
       * admitted too. Only `update` admits it.
       */
      const { resolver } = resolverGranting([{ crudType: 'read', entityName: SKU_COMPONENT_NAME }]);
      const handler = handlerWith(resolver, {});

      const response = await handler.processImageUpload(imageUploadEvent());

      expect(response.statusCode).toBe(403);
    });

    it('NET-NEW — an account with `update` on `Sku` reaches the service and gets its verdict', async () => {
      const sku = makeManagedSku();
      sku.skuCode = SKU_CODE;
      sku.imageFile = 'shirt.jpg';

      const { resolver, questions } = resolverGranting([
        { crudType: 'update', entityName: SKU_COMPONENT_NAME },
      ]);
      const handler = handlerWith(resolver, {
        getSkuBySkuCode: () => Promise.resolve(sku),
        processImageUpload: () => Promise.resolve(true),
      });

      const response = await handler.processImageUpload(imageUploadEvent());

      expect(response.statusCode).toBe(200);
      expect(questions).toEqual([{ crudType: 'update', entityName: SKU_COMPONENT_NAME }]);
      /* ⭐ THE ANSWER IS THE RAW VERDICT, NOT A PROJECTED ENTITY. [model/service/SkuService.cfc:L213-L217]
       * returns `true`/`false` and never the entity, so TR-1 tightens the loose `any` to the boolean and this
       * route publishes it unwrapped — no envelope and no `{ saved: … }` object (AAP §0.7.3 S9). A revision
       * projected the SKU here; review finding F2 withdrew it, and this assertion is what fails if it
       * returns. */
      expect(JSON.parse(response.body)).toBe(true);
    });

    it('NET-NEW — a DECLINED write is `false` at an OK status, not a failure status', async () => {
      /*
       * [:L216] returns `false` and records nothing — no `addError`, no raise — so a declined write is a
       * reported OUTCOME. Answering 4xx or 5xx for it would invent a status the legacy never produced, and
       * collapsing it to `true` would report a write that did not happen.
       */
      const sku = makeManagedSku();
      sku.skuCode = SKU_CODE;

      const { resolver } = resolverGranting([
        { crudType: 'update', entityName: SKU_COMPONENT_NAME },
      ]);
      const handler = handlerWith(resolver, {
        getSkuBySkuCode: () => Promise.resolve(sku),
        processImageUpload: () => Promise.resolve(false),
      });

      const response = await handler.processImageUpload(imageUploadEvent());

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toBe(false);
    });

    it('NET-NEW — a TRAVERSING stored image file name still reaches the service, and the SKU is answered (finding F4 carries the exposure)', async () => {
      /*
       * ⛔ THIS CASE ASSERTS A CARRIED EXPOSURE, DELIBERATELY, AND IT REPLACES ONE THAT ASSERTED A GATE.
       * A revision refused a stored `imageFile` that the legacy's own generator could not have produced, and
       * the case here asserted the resulting `false`. Review finding F4 withdrew that gate: it refused input
       * [model/service/SkuService.cfc:L212] ACCEPTS, and AAP §0.6.7.7 declares D18 — the importer's SQL
       * parameterisation — the SINGLE behaviour-hardening exception in this port.
       *
       * So the assertion is inverted rather than deleted, because "the traversal is carried" is a claim worth
       * failing on if someone silently re-adds a gate: the service is REACHED for a traversing name, and the
       * route answers 200 with the image service's own verdict. The CWE-22 exposure is flagged on
       * `ImagePathPort.saveImageFile`, where an adapter that knows its own storage root may confine it.
       */
      const sku = makeManagedSku();
      sku.skuCode = SKU_CODE;
      sku.imageFile = '../../../../tmp/payload.jpg';

      let reached = 0;
      const { resolver } = resolverGranting([
        { crudType: 'update', entityName: SKU_COMPONENT_NAME },
      ]);
      const handler = handlerWith(resolver, {
        getSkuBySkuCode: () => Promise.resolve(sku),
        processImageUpload: () => {
          reached += 1;
          return Promise.resolve(true);
        },
      });

      const response = await handler.processImageUpload(imageUploadEvent());

      expect(reached).toBe(1);
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toBe(true);
    });

    it('NET-NEW — an anonymous request is refused 401, before any entity question is asked', async () => {
      const { resolver, questions } = resolverGranting([], { loggedIn: false });
      const handler = handlerWith(resolver, {});

      const response = await handler.processImageUpload(imageUploadEvent());

      expect(response.statusCode).toBe(401);
      /* Steps 1 and 2 answer before step 3, so no permission question is reached at all. */
      expect(questions).toEqual([]);
    });
  });

  describe('SkuHandler.getSkuBySkuCode — an OPTIONAL argument stays optional at the route', () => {
    /*
     * ⭐ WHY THIS BLOCK EXISTS, AND WHY IT ASSERTS THE OPPOSITE OF WHAT IT ONCE DID.
     * [model/service/SkuService.cfc:L289] declares `string skuCode` WITHOUT `required`, while
     * [model/dao/SkuDAO.cfc:L102] declares it `required`. A revision added a `400` precheck at this
     * boundary so an omitted path parameter was refused with the parameter named, and these cases pinned
     * that. Review finding F5 withdrew it, because the precheck advertised a REQUIRED route over an
     * OPTIONAL service parameter — the published contract contradicted the member it publishes.
     *
     * ⚠️ AND 500 IS THE FAITHFUL ANSWER FOR THAT OMISSION, WHICH IS THE PART THE PRECHECK GOT WRONG. The
     * legacy fails exactly this way: the omission passes the loose service signature and dies at the DAO's
     * `required`, which under CFML is a server-side error. `src/handlers/skuHandler.ts` judgment (h) is the
     * rule being applied — "an argument the legacy declares WITHOUT `required` … is forwarded as absent, so
     * whatever the legacy would have done with the omission still happens where the legacy does it."
     *
     * ⛔ `processImageUpload`'s OWN 400 IS NOT AN INCONSISTENCY, and the last case proves the distinction
     * rather than asserting the two are equal. That member's service contract is `required any Sku`
     * [:L210] — an ENTITY the boundary must resolve first — so a request addressing no code has failed to
     * supply a required argument. Here the code IS the argument, and it is optional.
     *
     * TEST PROVENANCE: NET-NEW (AAP §0.6.5.2 — no legacy service or controller test exists for this slice).
     */

    const STORED_SKU_CODE = 'TESTSKU001';

    /** Builds the route with a lookup that answers for exactly one code and misses on everything else. */
    function handlerFor(reached: (string | undefined)[]): ReturnType<typeof createSkuHandler> {
      const stored = makeManagedSku();
      stored.skuCode = STORED_SKU_CODE;

      return createSkuHandler(
        makeSkuSurface({
          getSkuBySkuCode: (skuCode?: string): Promise<Sku | null> => {
            reached.push(skuCode);

            /* The real service raises for an absent code, at the point [model/dao/SkuDAO.cfc:L102]'s
             * `required` fails in the legacy. The double reproduces that rather than answering a miss, so
             * these cases exercise the failure path the boundary now forwards. */
            if (skuCode === undefined) {
              return Promise.reject(
                new DomainError('getSkuBySkuCode was called without a SKU code.', {
                  context: { locator: 'model/service/SkuService.cfc:L289-L291' },
                }),
              );
            }

            return Promise.resolve(skuCode === STORED_SKU_CODE ? stored : null);
          },
        }),
        () => Promise.resolve(null),
        ADMIT_EVERY_REQUEST,
        makeWriteRunner({
          resolveProduct: () => Promise.resolve(null),
          skuService: { createSkus: () => Promise.resolve(true) },
        }).runner,
      );
    }

    it('NET-NEW — no code addressed is FORWARDED as `undefined`, and the service failure answers', async () => {
      const reached: (string | undefined)[] = [];
      const response = await handlerFor(reached).getSkuBySkuCode({
        pathParameters: null,
        headers: {},
      });

      /* ⭐ THE FORWARDED ARGUMENT IS THE ASSERTION. The service IS called, with `undefined`, which is what
       * makes the optional service parameter observably optional at the route. */
      expect(reached).toEqual([undefined]);

      /* Not a boundary-authored 400: the answer is whatever the failure layer produced. */
      expect(response.statusCode).not.toBe(400);
      expect(JSON.parse(response.body)).not.toStrictEqual({
        message: 'A "skuCode" path parameter is required',
      });
    });

    it('NET-NEW — the refusal is the SERVICE’s, shaped like any other service failure', async () => {
      const reached: (string | undefined)[] = [];
      const response = await handlerFor(reached).getSkuBySkuCode({
        pathParameters: null,
        headers: {},
      });

      /* `src/errors/DomainError.ts` states the rule ("Assert on the CODE … never on these strings"), so
       * this asserts the SHAPE and the ABSENCE of disclosure. The locator on the error's context travels to
       * the log and never to the body. */
      const body = JSON.parse(response.body) as Record<string, unknown>;

      expect(Object.keys(body)).toStrictEqual(['message']);
      expect(JSON.stringify(body)).not.toContain('SkuDAO');
      expect(JSON.stringify(body)).not.toContain('getSkuBySkuCode');
    });

    it('NET-NEW — an EMPTY code is FORWARDED as the legal value it is, and a miss stays 404', async () => {
      const reached: (string | undefined)[] = [];
      const response = await handlerFor(reached).getSkuBySkuCode({
        pathParameters: { skuCode: '' },
        headers: {},
      });

      /* [model/entity/Sku.cfc:L54] declares `skuCode` with NO `unsavedvalue` and NO `default`, so `''` is a
       * VALUE rather than a sentinel and the legacy would have run the lookup for it. */
      expect(reached).toEqual(['']);
      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toStrictEqual({ message: 'Not found' });
    });

    it('NET-NEW — a hit still answers 200 and a miss still answers 404, both unchanged', async () => {
      const reached: (string | undefined)[] = [];
      const handler = handlerFor(reached);

      const hit = await handler.getSkuBySkuCode({
        pathParameters: { skuCode: STORED_SKU_CODE },
        headers: {},
      });
      const miss = await handler.getSkuBySkuCode({
        pathParameters: { skuCode: 'NOTHING-MATCHES' },
        headers: {},
      });

      expect(hit.statusCode).toBe(200);
      expect(miss.statusCode).toBe(404);
      /* A miss must never become a raise: [model/service/PhysicalService.cfc:L199] counts misses as a
       * data-quality tally, so raising would turn a benign import warning into a failed import. */
      expect(JSON.parse(miss.body)).toStrictEqual({ message: 'Not found' });
      expect(reached).toEqual([STORED_SKU_CODE, 'NOTHING-MATCHES']);
    });

    it('NET-NEW — `processImageUpload` STILL refuses the same omission with 400, and the difference is the contract', async () => {
      /*
       * ⭐ THE DISTINCTION, ASSERTED RATHER THAN ARGUED. Both members read `skuCode` through the same
       * reader, and they answer differently BECAUSE THEIR LEGACY SIGNATURES DIFFER:
       *   `getSkuBySkuCode( string skuCode )`               — [:L289], optional  -> forwarded
       *   `processImageUpload( required any Sku, … )`        — [:L210], an ENTITY -> the code is how this
       *                                                        boundary must resolve that required
       *                                                        argument, so its absence is a request fault
       * A revision made the two agree by adding a precheck to the first; review finding F5 withdrew it, and
       * this case pins the asymmetry so neither half can be "harmonised" away again.
       */
      const reached: (string | undefined)[] = [];
      const handler = handlerFor(reached);

      const write = await handler.processImageUpload({
        body: '{}',
        pathParameters: null,
        headers: {},
      });

      expect(write.statusCode).toBe(400);
      expect(JSON.parse(write.body)).toStrictEqual({
        message: 'A "skuCode" path parameter is required',
      });
      /* Refused at the boundary, so no lookup was attempted for a code nobody supplied. */
      expect(reached).toEqual([]);
    });
  });
});
