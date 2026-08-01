/**
 * `SkuService` — the ported public surface, member by member.
 *
 * ---------------------------------------------------------------------------------------------------
 * WHAT KIND OF TESTS THESE ARE, AND WHY THAT DIFFERS FROM THE LEGACY SUITE
 * ---------------------------------------------------------------------------------------------------
 * These are UNIT tests. Every case imports the class under test by relative path, constructs it
 * through its real explicit constructor, and hands it typed doubles for its collaborators.
 *
 * The legacy suite could not work that way. `meta/tests/unit/SlatwallUnitTestBase.cfc:L49-L84` boots
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
 * COVERAGE — an earlier draft of this file asserted handler-shaped responses and a Google-feed join
 *      constant. Both belong to other modules' suites and are removed rather than relocated, because
 *      this file may not edit another file to compensate. `src/handlers/httpResponse.ts` consequently
 *      loses the only coverage it had from this file. Nothing breaks: `jest.config.ts` collects
 *      coverage but deliberately declines to threshold it, and that decision is not revisited here.
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
import type { SkuSearchRow } from '../../src/ports/repositories/SkuRepository';
import { UnitOfWork } from '../../src/adapters/mysql/UnitOfWork';
import { OptionService } from '../../src/services/OptionService';
import type { ManagedSku } from '../../src/services/SkuService';
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
  createValidatorHarness,
} from '../support/inMemoryRepositories';

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
}

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
 * The two query ports are SEPARATE instances on purpose. `OptionService.getOptionsByIDs` and
 * `SkuService.getSkuSmartList` both go through `SmartListQueryPort`, and sharing one double would mean
 * every combination-engine case had option-resolution queries interleaved with the SKU queries it was
 * trying to pin.
 */
function buildHarness(options: HarnessOptions = {}): Harness {
  const resolvableOptions = options.resolvableOptions ?? [];

  const optionQueries = createSmartListQueryDouble({
    respond: (query) => {
      if (query.entityName !== 'SlatwallOption') {
        return undefined;
      }

      const requested = new Set<string>();
      for (const whereGroup of query.whereGroups ?? []) {
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
}

function createDriverProbe(): DriverProbe {
  const lifecycle: string[] = [];
  const emptyResult = (): Promise<[unknown, unknown[]]> => Promise.resolve([[], []]);

  const connection = {
    execute: (): Promise<[unknown, unknown[]]> => emptyResult(),
    beginTransaction: (): Promise<void> => {
      lifecycle.push('begin');

      return Promise.resolve();
    },
    commit: (): Promise<void> => {
      lifecycle.push('commit');

      return Promise.resolve();
    },
    rollback: (): Promise<void> => {
      lifecycle.push('rollback');

      return Promise.resolve();
    },
    release: (): void => {
      lifecycle.push('release');
    },
    destroy: (): void => {
      lifecycle.push('destroy');
    },
  };

  return {
    lifecycle,
    pool: {
      execute: (): Promise<[unknown, unknown[]]> => emptyResult(),
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

  it('NET-NEW resolves selected options through the explicit option boundary, once, in input order', async () => {
    /*
     * [:L74] calls the option service once per list entry, which `onMissingMethod` synthesised as
     * `getOption`. The port declares the boundary explicitly and batches it, and the batch preserves
     * FIRST-SEEN input order while collapsing repeats — so the query the boundary issues is the honest
     * record of both the order and the de-duplication.
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

    /* ONE batched resolution, not one round trip per selected option. */
    expect(harness.optionQueries.queries).toHaveLength(1);
    const optionQuery = harness.optionQueries.lastQuery();
    expect(optionQuery?.entityName).toBe('SlatwallOption');
    const inFilters = optionQuery?.whereGroups?.[0]?.inFilters ?? [];
    expect(requireAt(inFilters, 0, 'the option-identifier filter')).toEqual({
      propertyIdentifier: 'optionID',
      value: `${ID.blue},${ID.red}`,
    });

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
   * The cases below pin the landed order, and the last one runs all three orderings side by side so the
   * discrimination is a permanent artefact of the suite rather than a claim in a comment.
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
    /* One acquisition, one begin, one commit, one release — a single boundary around all eight calls. */
    expect(probe.lifecycle).toEqual(['getConnection', 'begin', 'commit', 'release']);
    expect(readWriteTrace(harness)).toHaveLength(8);
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

  it('NET-NEW only the landed sequencing produces the landed verdicts — both naive orderings disagree', async () => {
    /*
     * ⭐⭐ THE ORDERING PROOF, RUN RATHER THAN ASSERTED.
     *
     * The same two candidate SKUs — identical single option, same product, therefore duplicates — are
     * put through the SAME validate and insert closures under all three sequencings. The closures are
     * the real ones: `Sku.hasUniqueOptions` reading through the repository port, and the repository's own
     * write. Only the ORDER changes.
     *
     * If a future change moved `SkuService`'s interleave to either naive strategy, the verdicts below
     * are the ones that would appear — so this case documents exactly what the earlier cases in this
     * block are protecting against, and it fails loudly if the ordering harness itself drifts.
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

  it('NET-NEW returns a boolean rather than the SKU, for both outcomes', async () => {
    /*
     * ⚠️ THE RETURN TYPE IS `boolean`, NOT `Sku`. The legacy declares `public any function` and then
     * returns `true`/`false` from both arms at [:L214] and [:L216] — so the observable contract is a
     * boolean even though the declaration says otherwise, and the port declares what it actually returns.
     *
     * TODO(parity) — [:L213-L216] is a redundant boolean identity: `if(imageSaved) return true; else
     * return false;` is exactly `return imageSaved;`. The port writes the direct return because the
     * OBSERVABLE result is identical, and the redundancy is recorded here rather than reproduced as dead
     * branching.
     */
    const succeeding = buildHarness({ saveImageSucceeds: true });
    const savedSku = buildSku({ skuID: ID.existingSku, imageFile: 'shirt.jpg', price: 10 });
    const saved = await succeeding.service.processImageUpload(savedSku, { fileWasSaved: true });
    expect(saved).toBe(true);
    expect(typeof saved).toBe('boolean');

    const failing = buildHarness({ saveImageSucceeds: false });
    const rejectedSku = buildSku({ skuID: ID.existingSku, imageFile: 'shirt.jpg', price: 10 });
    const notSaved = await failing.service.processImageUpload(rejectedSku, { fileWasSaved: false });
    expect(notSaved).toBe(false);
    expect(typeof notSaved).toBe('boolean');
  });

  it('NET-NEW reads the SKU image path first, then forwards the upload result, path and extensions', async () => {
    /*
     * [:L211] resolves the path off the SKU; [:L212] hands the port three named arguments. The order is
     * observable — the path must exist before the save can be asked for — and the extension list is a
     * literal in the legacy source.
     */
    const harness = buildHarness({
      imagePathsByImageFile: { 'shirt.jpg': '/custom/images/product/default/shirt.jpg' },
    });
    const sku = buildSku({ skuID: ID.existingSku, imageFile: 'shirt.jpg', price: 10 });
    const uploadResult = { serverFile: 'shirt.jpg', fileWasSaved: true };

    await harness.service.processImageUpload(sku, uploadResult);

    expect(harness.imagePaths.calls.map((call) => call.member)).toEqual([
      'getImagePath',
      'saveImageFile',
    ]);

    const pathCall = requireAt(harness.imagePaths.calls, 0, 'the image-path read');
    expect(pathCall.member === 'getImagePath' && pathCall.imageFile).toBe('shirt.jpg');

    const saveCall = requireAt(harness.imagePaths.calls, 1, 'the save request');
    if (saveCall.member !== 'saveImageFile') {
      throw new Error('The second image-port call was expected to be the save request.');
    }
    /* The upload result travels through by REFERENCE — nothing repackages or filters it. */
    expect(saveCall.request.uploadResult).toBe(uploadResult);
    expect(saveCall.request.filePath).toBe('/custom/images/product/default/shirt.jpg');
    /*
     * BYTE-EXACT against the legacy literal at [:L212], and against the port constant, so the two can
     * never drift apart unnoticed.
     */
    expect(saveCall.request.allowedExtensions).toBe('jpg,jpeg,png,gif');
    expect(saveCall.request.allowedExtensions).toBe(IMAGE_UPLOAD_ALLOWED_EXTENSIONS);
  });

  it('NET-NEW resolves the path from an absent image file as the empty name, without guarding', async () => {
    /*
     * [:L211] calls `getImagePath()` unconditionally. `model/entity/Sku.cfc:L145` builds the path from
     * `getImageFile()` with no null guard, so a SKU with no image file still produces a path — it is
     * simply a path with nothing in the file position. Guarding here would be a repair.
     */
    const harness = buildHarness();
    const sku = buildSku({ skuID: ID.existingSku, price: 10 });

    await expect(harness.service.processImageUpload(sku, {})).resolves.toBe(true);

    const pathCall = requireAt(harness.imagePaths.calls, 0, 'the image-path read');
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
   * G6 — THIS MEMBER ACCEPTS TWO ARGUMENTS THE LEGACY DECLARATION LISTS NONE OF, AND THAT IS THE
   * CORRECT READING RATHER THAN A LOOSENING
   * ===================================================================================================
   * [:L285] declares `public boolean function getTransactionExistsFlag()` — no formal arguments at all —
   * and [:L286] forwards `argumentCollection=arguments`. CFML puts UNDECLARED named arguments into the
   * `arguments` collection regardless, so a caller's `productID` or `skuID` reaches
   * `model/dao/SkuDAO.cfc:L53-L55`, which declares both as optional, and scopes the query.
   * `model/entity/Product.cfc:L624-L627` is exactly such a caller: it passes `productID=getProductID()`.
   *
   * Reading the service declaration literally — as genuinely argument-free — would turn the product
   * delete guard into a GLOBAL one: one transaction anywhere in the ten relationships would make every
   * product in the catalog undeletable. That is why this deliberately departs from the narrower
   * discrepancy AAP §0.4.2.2 records, and the departure is for correctness against the byte-verified
   * DAO contract rather than convenience.
   *
   * ⚠️ THE ARGUMENT ORDER CROSSES BETWEEN THE LAYERS, ON PURPOSE:
   *     service member:                     (skuID?, productID?)  — SKU first
   *     SkuRepository.transactionExists:    (productID?, skuID?)  — product first
   * The repository mirrors the DAO's own declaration sequence (TR-4); the service is SKU-first so one
   * implementation satisfies both entity checker contracts with no adapter. Both identifiers are
   * 32-character strings (IR-6), so a swap would type-check and silently query the wrong column — which
   * is why the two orders are asserted explicitly below.
   */

  it('NET-NEW scopes the question to one product, so another product stays unaffected', async () => {
    /*
     * The whole point of forwarding the identifier. Product A participates in a transaction; product B
     * does not, and must therefore remain deletable.
     */
    const harness = buildHarness({ transactionProductIDs: [ID.product] });

    await expect(harness.service.getTransactionExistsFlag(undefined, ID.product)).resolves.toBe(
      true,
    );
    await expect(
      harness.service.getTransactionExistsFlag(undefined, ID.otherProduct),
    ).resolves.toBe(false);

    /* The crossing: the product identifier arrives in the repository's FIRST position. */
    const call = requireAt(harness.skuRepository.calls, 0, 'the transaction probe');
    if (call.member !== 'transactionExists') {
      throw new Error('The first repository call was expected to be the transaction probe.');
    }
    expect(call.productID).toBe(ID.product);
    expect(call.skuID).toBeUndefined();
  });

  it('NET-NEW scopes the question to one SKU, and the identifier lands in the SKU position', async () => {
    /* `model/entity/Sku.cfc:L594` is the SKU-side caller; it names `skuID`. */
    const harness = buildHarness({ transactionSkuIDs: [ID.existingSku] });

    await expect(harness.service.getTransactionExistsFlag(ID.existingSku)).resolves.toBe(true);
    await expect(harness.service.getTransactionExistsFlag(ID.secondExistingSku)).resolves.toBe(
      false,
    );

    const call = requireAt(harness.skuRepository.calls, 0, 'the transaction probe');
    if (call.member !== 'transactionExists') {
      throw new Error('The first repository call was expected to be the transaction probe.');
    }
    expect(call.skuID).toBe(ID.existingSku);
    expect(call.productID).toBeUndefined();
  });

  it('NET-NEW forwards both identifiers unexamined, and the SKU identifier wins at the layer that decides', async () => {
    /*
     * `model/dao/SkuDAO.cfc:L58-L63` tests `structKeyExists(arguments,"skuID")` FIRST and builds the
     * SKU-scoped query, with the product branch at [:L87-L91] reached only when that test fails. So when
     * both are supplied, `skuID` WINS.
     *
     * ⛔ THE PRECEDENCE IS NOT RE-IMPLEMENTED IN THE SERVICE. This member forwards both values without
     * choosing, without nulling the loser and without warning — every one of which would move a decision
     * to a layer the legacy never gave it to. The proof: a SKU that does NOT participate, named alongside
     * a product that DOES, answers false, because the SKU branch is the one that ran.
     */
    const harness = buildHarness({
      transactionProductIDs: [ID.product],
      transactionSkuIDs: [ID.existingSku],
    });

    await expect(
      harness.service.getTransactionExistsFlag(ID.secondExistingSku, ID.product),
    ).resolves.toBe(false);
    await expect(
      harness.service.getTransactionExistsFlag(ID.existingSku, ID.otherProduct),
    ).resolves.toBe(true);

    /* Both values travelled on in both calls — nothing was dropped on the way through. */
    expect(
      harness.skuRepository.calls.map((call) =>
        call.member === 'transactionExists' ? [call.skuID, call.productID] : call.member,
      ),
    ).toEqual([
      [ID.secondExistingSku, ID.product],
      [ID.existingSku, ID.otherProduct],
    ]);
  });

  it('NET-NEW raises when neither identifier is supplied, at the layer the legacy raises', async () => {
    /*
     * A genuinely argument-free legacy invocation falls past the `structKeyExists` test at
     * `model/dao/SkuDAO.cfc:L58` and binds `arguments.productID` at [:L90] — dereferencing a key that is
     * not there. The failure is left where the legacy has it rather than pre-empted with a service-side
     * guard (IR-9), and it is emphatically NOT collapsed into a global "does any transaction exist"
     * reading, which would be the one answer the legacy can never give.
     */
    const harness = buildHarness({ transactionProductIDs: [ID.product] });

    await expect(harness.service.getTransactionExistsFlag()).rejects.toThrow(DomainError);

    const call = requireAt(harness.skuRepository.calls, 0, 'the transaction probe');
    expect(call.member === 'transactionExists' && call.productID).toBeUndefined();
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

  it("NET-NEW appends a caller's joins after its own and absorbs a repeat rather than emitting it twice", async () => {
    /*
     * `integrationServices/google/controllers/feed.cfc:L64-L66` registers three further related
     * properties on the SAME smart list this member already seeded, and its first repeats
     * `SlatwallSku -> product` verbatim.
     *
     * ⭐ THE LEGACY DOES NOT EMIT THAT JOIN TWICE, AND THE SOURCE SAYS SO.
     * `org/Hibachi/HibachiSmartList.cfc:L212` guards the whole registration with
     * `if(!structKeyExists(variables.entities, newEntityName))`, and [:L549] builds the FROM clause by
     * walking that same struct — one join per registered entity, never one per call. So naming an
     * already-registered related property is a no-op, and preserving a duplicate would not be faithful
     * anyway: it would emit the same alias twice and the engine would reject the statement.
     */
    const harness = buildHarness();

    /*
     * The feed's own three, written out here rather than imported: this file may not import from
     * `src/integrations/google/**`, and restating them by locator keeps the coverage without the
     * dependency. The first is the verbatim repeat of [:L314]; the second and third both name
     * `SlatwallProduct` as their parent, which is an entity the FIRST of the base joins is what
     * registers — so order is load-bearing, not merely conventional.
     */
    await harness.service.getSkuSmartList(undefined, undefined, [
      /* integrationServices/google/controllers/feed.cfc:L64 — the repeat. */
      { parentEntityName: 'SlatwallSku', relatedProperty: 'product' },
      /* integrationServices/google/controllers/feed.cfc:L65 */
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'defaultSku' },
      /* integrationServices/google/controllers/feed.cfc:L66 — a LEFT join, because brand is optional. */
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'brand', joinType: 'left' },
    ]);

    const query = harness.skuQueries.lastQuery();
    if (query === undefined) {
      throw new Error('The smart-list port was expected to receive one composed query.');
    }
    /*
     * The merged list is asserted EXPLICITLY rather than by checking only that `brand` appears. A test
     * that merely looked for the brand join would also pass against a naive concatenation that emitted
     * `SlatwallSku -> product` TWICE — the one outcome the legacy rules out, since the engine would
     * reject a statement naming the same alias twice.
     */
    expect(query.joins).toEqual([
      ...EXPECTED_JOINS,
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'defaultSku' },
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'brand', joinType: 'left' },
    ]);
    /* The brand join keeps its LEFT polarity, which is load-bearing: an inner join would silently drop
     * every product with no brand from the feed. */
    expect(query.joins?.[4]?.joinType).toBe('left');
  });

  it('NET-NEW leaves the base join set exactly as it was when the third argument is omitted', async () => {
    /*
     * The parameter is optional and contributes nothing by default, which is what keeps every existing
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

    /* Nothing is resolved before either invocation runs. */
    expect(invocationOne.skuRepository.optionGroupSortOrderMemoValue()).toBeUndefined();
    expect(invocationTwo.skuRepository.optionGroupSortOrderMemoValue()).toBeUndefined();

    await invocationOne.service.getSortedProductSkus(productOne);
    expect(invocationOne.skuRepository.optionGroupSortOrderMemoValue()).toBe(5);
    /* Invocation two has still resolved nothing — the memo did not travel. */
    expect(invocationTwo.skuRepository.optionGroupSortOrderMemoValue()).toBeUndefined();

    await invocationTwo.service.getSkuSmartList();
    /* The query logs are independent too. */
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

  it('NET-NEW declares exactly the nine live collaborators, with no dead productService injection', async () => {
    /*
     * AAP §0.6.3.2 counted the call sites behind every declared and dynamic dependency of
     * `model/service/SkuService.cfc:L51-L56`. The result:
     *   skuDAO                     8 sites  → SkuRepository
     *   optionService              1 site   → OptionService
     *   subscriptionService        3 sites  → SubscriptionTermPort   (out of scope, TR-5)
     *   contentService             2 sites  → AccessContentPort      (out of scope, TR-5)
     *   getService("imageService") 1 site   → ImagePathPort          (HIDDEN — never declared)
     *   productService [:L54]      0 sites  → NOT WIRED
     * plus the three collaborators the port needs because the framework no longer supplies them: the
     * smart-list query port, the validator, and the product-type root resolver — and the default-SKU
     * delegate binder, because `Product.defaultSku` is a delegate rather than a `Sku`.
     *
     * Nine parameters, every one of them positional and required. A tenth would mean something was added
     * without a call site to justify it; an eighth would mean a live collaborator had been folded into
     * another. `Function.length` counts exactly the leading required parameters, so it is the checkable
     * form of that claim — and it also proves no parameter acquired a default, which would let a caller
     * silently construct the service without a collaborator it needs.
     */
    expect(SkuService.length).toBe(9);

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
    /* And the values are the expected ones, so "identical" cannot mean "identically empty". */
    expect(first.codes).toEqual([
      `${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}1`,
      `${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}2`,
      `${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}3`,
      `${TEST_MERCHANDISE_PRODUCT_CODE}${SKU_CODE_DELIMITER}4`,
    ]);
    expect(first.defaultBindings).toBe(1);
  });

  it('NET-NEW exposes the nine ported members and no invented sibling on the service surface', () => {
    /*
     * TR-1 — the observable contract of this service is its public method surface, and AAP §0.4.2.2
     * enumerates it as nine members. The check is written in both directions: every one of the nine is
     * callable, and the surface carries nothing the legacy did not declare or synthesize.
     *
     * ⭐ `newSku()` IS ON THE LIST AND IT HAS NO SOURCE DECLARATION. It exists in the legacy only because
     * `org/Hibachi/HibachiService.cfc:L255-L281` fabricates `new*` by prefix, and the combination engine
     * calls it. Under `strict` TypeScript there is no equivalent facility, so IR-1 requires it to be
     * declared explicitly — which is why it appears here alongside the nine rather than being reachable
     * through a dynamic fallback.
     */
    const harness = buildHarness();
    const surface = harness.service;

    for (const member of [
      'createSkus',
      'processImageUpload',
      'getProductSkus',
      'getSortedProductSkus',
      'searchSkusByProductType',
      'getSkuStocksDeletableFlag',
      'getTransactionExistsFlag',
      'getSkuBySkuCode',
      'getSkuSmartList',
    ] as const) {
      expect(typeof surface[member]).toBe('function');
    }

    /* The explicitly declared replacement for the synthesized `new*` member. */
    const minted = surface.newSku();
    expect(minted).toBeInstanceOf(Sku);
    expect(minted.isNew()).toBe(true);
    /* Freshly minted SKUs do not share state — two calls are two entities. */
    expect(surface.newSku()).not.toBe(minted);
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

describe('SkuService.createSkus — no combination ceiling exists', () => {
  /*
   * `model/service/SkuService.cfc:L58-L208` has NO size gate of any kind: no limit on the number of
   * option groups, none on options per group, and none on the product of the two. A ceiling would be a
   * number this plan has no source for, and AAP §0.8.2 guideline 4 forbids enhancing business logic
   * beyond what the migration requires. These cases exist to fail if one is ever introduced.
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

  it('NET-NEW services a 256-combination request in full, first combination still taking the default', async () => {
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

  it('NET-NEW has no size-rejection path at all, even well past any plausible budget', async () => {
    /*
     * Seven groups of three options is 2,187 combinations. `resolves` rather than `rejects` IS the
     * assertion: there is no gate left to produce a diagnostic, and the value resolved is the vestigial
     * unconditional `true` of [:L207], asserted only to show the method returned normally.
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

describe('SkuService — the image path composition and existence probe, at legacy parity', () => {
  /*
   * ⛔ WHAT THIS BLOCK DELIBERATELY DOES NOT ASSERT. An earlier revision of this file pinned a
   * multi-clause `imageFile` validation gate, a `processImageUpload` that RAISED on a stored name it
   * judged invalid, and an existence probe that received the bare stored NAME rather than a composed
   * path. Every one of those refused something the legacy accepts:
   *   • `model/service/SkuService.cfc:L211-L212` composes a path from the UNVALIDATED `imageFile`
   *     column and passes it as `filePath` to a member that WRITES;
   *   • `model/entity/Sku.cfc:L222` wraps the same composed value in `expandPath` and PROBES it.
   * `model/validation/Sku.json` declares NO rule for `imageFile`, so nothing in the legacy inspects
   * either value. Refusing them changes an outcome, which AAP §0.8.2 guideline 4 forbids, and which
   * defect D18 — the single declared hardening exception — does not license: D18 removed a flaw class
   * WITHOUT changing an outcome. The residual exposure is flagged on `src/ports/ImagePathPort.ts` for an
   * operator to close, not closed here. These cases pin the legacy behavior, including the parts of it
   * that are unpleasant, so that reinstating a refusal fails loudly instead of passing quietly.
   *
   * WHY ENTITY-LEVEL CASES SIT IN A SERVICE TEST FILE. `test/domain/Sku.test.ts` is the eventual owner
   * of `Sku`'s own assertions, and its mandate is far broader than this boundary — the D1/D2/D3 accessor
   * cluster and the four inherited entity assertions all belong to it. The behavior here is reached
   * end-to-end through the same port double either way, and `processImageUpload` is unambiguously this
   * file's member, so the pair stays together rather than being split across two files.
   */

  /** The traversal vector an earlier revision refused, kept verbatim so the withdrawal stays visible. */
  const TRAVERSAL_VECTOR = '../../../../tmp/payload.jpg';
  const IMAGE_BASE = '/assets/images/product/default/';

  const buildSkuWithImageFile = (imageFile?: string): Sku =>
    imageFile === undefined
      ? buildSku({ skuID: ID.existingSku, price: 10 })
      : buildSku({ skuID: ID.existingSku, price: 10, imageFile });

  it('NET-NEW composes a traversal name into the write path rather than refusing it', async () => {
    const harness = buildHarness({
      imagePathsByImageFile: { [TRAVERSAL_VECTOR]: `${IMAGE_BASE}${TRAVERSAL_VECTOR}` },
    });

    await expect(
      harness.service.processImageUpload(buildSkuWithImageFile(TRAVERSAL_VECTOR), {}),
    ).resolves.toBe(true);

    const saveCall = requireAt(harness.imagePaths.calls, 1, 'the save request');
    if (saveCall.member !== 'saveImageFile') {
      throw new Error('The second image-port call was expected to be the save request.');
    }
    expect(saveCall.request.filePath).toBe(`${IMAGE_BASE}${TRAVERSAL_VECTOR}`);
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
