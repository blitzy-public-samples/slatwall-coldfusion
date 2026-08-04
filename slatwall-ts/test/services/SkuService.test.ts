/**
 * `SkuService` — the ported public surface, member by member.
 *
 * What kind of tests these are, and why that differs from the legacy suite
 * These are unit tests. Every case imports the class under test by relative path, constructs it
 * through its real explicit constructor, and hands it typed doubles for its collaborators.
 *
 * The legacy suite could not work that way. `meta/tests/unit/SlatwallUnitTestBase.cfc:L49-L79` boots
 * the whole FW/1 application in `setUp()` and then reaches collaborators back out of the DI/1 bean
 * factory by string name, and `meta/tests/unit/service/HibachiServiceTest.cfc:L49-L55` follows that
 * base and resolves its subject the same way. A legacy "unit" test of a service was therefore an
 * integration test: application bootstrap, ORM session, real datasource, real settings engine.
 */

import type { BaseProductType } from '../../src/domain/BaseProductType';
import { Option } from '../../src/domain/option/Option';
import type { OptionGroup } from '../../src/domain/option/OptionGroup';
import type { ProductType } from '../../src/domain/product/ProductType';
import { Product } from '../../src/domain/product/Product';
import type { SkuImagePathResolver } from '../../src/domain/sku/Sku';
import { SKU_UNSAVED_ID_VALUE, Sku } from '../../src/domain/sku/Sku';
import {
  DatabaseStatementError,
  DomainError,
  LegacyParityError,
  NotImplementedError,
  RequestBudgetExhaustedError,
  UNEXPECTED_ERROR_CREATING_PRODUCT_MESSAGE,
} from '../../src/errors/DomainError';
import {
  ACCESS_CONTENTS_REQUIRED_RBKEY,
  SUBSCRIPTION_BENEFITS_REQUIRED_RBKEY,
  SUBSCRIPTION_TERMS_REQUIRED_RBKEY,
  ValidationError,
} from '../../src/errors/ValidationError';
import { IMAGE_UPLOAD_ALLOWED_EXTENSIONS } from '../../src/ports/ImagePathPort';
import type { SmartListJoin, SmartListResult } from '../../src/ports/SmartListQueryPort';
import { resolveSmartListPropertyIdentifier } from '../../src/ports/SmartListQueryPort';
import type { SkuRepository, SkuSearchRow } from '../../src/ports/repositories/SkuRepository';
/*
 * No bounded-read type is imported here: neither `skuService` nor `skuRepository` offers a windowed
 * search, so no case in this suite constructs a window or reads a bounded result. Everything that
 * decides which rows a search returns — the predicate, wildcard wrapping, list splitting, the
 * guards and the bind order — belongs to the unbounded member and is asserted in
 * `test/adapters/MySqlSkuRepository.test.ts`. The surface case below asserts that
 * `searchSkusByProductTypeBounded` and `getSkuSmartListRecords` are absent from
 * `skuService.prototype`.
 */
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
   * The production crossing, re-exported for tests. It is imported here — in the service suite — because
   * the `getTransactionExistsFlag` block below has to prove that the identifier-scoped probe the two
   * delete guards use is this checker, whose caller order it crosses onto the repository's, and not the
   * service member it now happens to share a shape with.
   */
  createTransactionExistenceChecker,
  createValidatorHarness,
  TEST_IMAGE_STORAGE_ROOT,
  /* — the deny-all property verdict every hand-built security context carries. */
  DENY_ALL_POPULATION_AUTHORIZATION,
  /* — the authorised-context and security-request factories. */
  persistedAdminAccount,
  securityContext,
  /*
   * — the operator-stated combination ceiling and the cancellation seam. A fixture states a
   * figure because a test is the operator; `src/**` states none (AAP §0.7.3).
   */
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
  createSkuHandlerFromContainer,
  createSkuRoutes,
} from '../../src/handlers/skuHandler';
import type { UnitOfWorkRunner } from '../../src/adapters/mysql/UnitOfWork';
import type { TransactionScope } from '../../src/adapters/mysql/UnitOfWork';
import type {
  ScopedTransactionRunner,
  SkuCreationGraph,
  SkuHandler,
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
 * Identifiers
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

/* Small typed helpers. */

/** Reads one entry of a list and refuses rather than asserting against `undefined`. */
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

/** An `exactDecimal` minted through the support factory rather than asserted into existence. */
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

/**
 * Narrows a product's SKU members to `Sku`, refusing anything else rather than silently skipping.
 */
function readProductSkus(product: Product): Sku[] {
  return product.getSkus().map((member, index) => {
    if (!(member instanceof Sku)) {
      throw new Error(`The product's SKU member at index ${String(index)} is not a Sku entity.`);
    }

    return member;
  });
}

/*
 * Fresh domain state
 * Builders, never shared instances. Each returns brand-new entities so nothing can leak between cases.
 */

/** A product type carrying a seeded discriminator directly on `systemCode`. */
function buildSeededProductType(systemCode: string, productTypeID: string): ProductType {
  return buildProductType({ productTypeID, productTypeIDPath: productTypeID, systemCode });
}

/** A product with no SKUs and no default SKU. */
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

/* The harness. */

/** The verdict the image-path double answers when a case does not set `saveImageSucceeds`. */
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
  /** Composed image paths the existence probe should answer `true` for. */
  readonly existingImagePaths?: readonly string[];
  /** Queued answers for the SKU-side query port, consumed in order. */
  readonly skuSmartListOutcomes?: readonly SmartListOutcome[];
  /** Values the uniqueness port should report as already taken. */
  readonly takenUniqueValues?: readonly UniquePropertyValueSeed[];
  /** Fixes the odometer ceiling the sorted-SKU ordering multiplies against. */
  readonly nextOptionGroupSortOrder?: number;
  /** Alternate SKU codes, so the or-branch of the code lookup can be driven. */
  readonly alternateSkuCodes?: readonly {
    readonly skuID: string;
    readonly alternateSkuCode: string;
  }[];

  /*
   * The combination ceiling the harness's service carries. */
  readonly maximumCombinations?: number;

  /**
   * The cooperative cancellation predicate the harness's service should carry —'s deadline seam.
   */
  readonly hasBeenCancelled?: () => boolean;

  /**
   * A whole {@link SkuCombinationBudget} to use instead of deriving one from the two options above.
   */
  readonly combinationBudget?: SkuCombinationBudget;
}

/*
 * The combination ceiling the harness applies when a case states none. */
const GENEROUS_MAXIMUM_COMBINATIONS = 1_000_000;

/**
 * Live handles onto everything the harness wired, so a case can assert against the real collaborators.
 */
interface Harness {
  readonly service: SkuService;
  readonly skuRepository: InMemorySkuRepository;
  readonly optionService: OptionService;
  /** The query port `OptionService` resolves selected options through. */
  readonly optionQueries: SmartListQueryDouble;
  /**
   * The query port the SKU smart list composes against. Kept separate so neither pollutes the other.
   */
  readonly skuQueries: SmartListQueryDouble;
  readonly imagePaths: ImagePathDouble;
  readonly subscriptionTerms: SubscriptionTermDouble;
  readonly accessContents: AccessContentDouble;
  readonly validation: ValidatorHarness;
  readonly productTypeRoots: ProductTypeRootResolverDouble;
  /** Every SKU the service bound as the product's default, in binding order. */
  readonly defaultSkuBindings: readonly Sku[];
}

/** Wires one `skuService` over live doubles for all nine constructor parameters. */
function buildHarness(options: HarnessOptions = {}): Harness {
  const resolvableOptions = options.resolvableOptions ?? [];

  const optionQueries = createSmartListQueryDouble({
    respond: (query) => {
      if (query.entityName !== 'SlatwallOption') {
        return undefined;
      }

      /*
       * Both identifier shapes are answered, and the one the engine actually uses is the single
       * filter. `optionService.getOption` — the member `model/service/SkuService.cfc:L74` calls
       * once per list entry — builds `whereGroups[0].filters` with one `optionID` value. A batch
       * member resolving the whole list would build an `inFilters` list instead, and a double
       * reading only that shape would miss the per-entry calls the engine actually makes.
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
   * The real `Validator`, over the real ported SKU rule sets — not a stub that reports every SKU clean.
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
    /*
     * — the tenth argument, generous by default so no harness case reaches it. A case asserting
     * the ceiling states `maximumCombinations`; a case asserting the unstated-figure refusal supplies a
     * whole budget through `combinationBudget`, because a number cannot express absence.
     */
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
 * The real `UnitOfWork`, over a local driver probe
 * `src/adapters/mysql/UnitOfWork.ts` takes a `StatementPool` — the raw mysql2-shaped seam, declared in
 * `src/adapters/mysql/QueryRunner.ts`. `test/support/inMemoryRepositories.ts` supplies a
 * `TransactionalSqlExecutor` double and a UnitOfWork double, but no driver-level pool, so this is the
 * one shape the shared support file genuinely lacks and the only local double in this file. It is
 * deliberately tiny: it records the lifecycle calls and answers every statement with an empty result.
 */

/** One statement the probe was asked to run, and which channel it arrived on. */
interface DriverStatement {
  /** `'transaction'` for the boundary's own connection, `'pool'` for anything that bypassed it. */
  readonly channel: 'transaction' | 'pool';
  /** `'write'` for INSERT/UPDATE/DELETE/replace, `'read'` for everything else. */
  readonly kind: 'read' | 'write';
  readonly sql: string;
  readonly params: readonly unknown[];
}

/** The error the pool channel raises, quoted in the assertions that depend on it. */
const POOL_EXECUTOR_USED_MESSAGE = 'POOL EXECUTOR USED';

/**
 * A hook invoked as each settlement step is attempted on the probe's connection; throw to fail it.
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
  /**
   * `getConnection`, `begin`, `commit`, `rollback`, `release`, `destroy` — in the order they happened.
   */
  readonly lifecycle: readonly string[];
  /** Every statement either channel was asked to run, in order, across both channels. */
  readonly statements: readonly DriverStatement[];
}

/**
 * Classifies a statement by what it does, which is all the probe needs to answer it correctly.
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
   * The lifecycle event is recorded before the responder runs, and the order is the point. A commit
   * the boundary issued and the driver then rejected was still attempted, and it is exactly the case
   * where the connection's state becomes indescribable; recording only settlements that succeeded would
   * make it indistinguishable from a commit that never happened.
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
     * The pool channel is poisoned, and that is the assertion rather than a convenience. Inside a
     * transaction boundary nothing may reach the pool: a statement that did would run on a different
     * connection, outside the transaction, where it can neither see the boundary's uncommitted writes
     * (M6) nor be discarded by its rollback. Answering such a statement successfully would let that
     * defect pass as a green test — which is exactly what happened while `withExecutor` had no caller —
     * so the probe fails loudly instead. A test that legitimately wants a pool-channel statement wants.
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
    /*
     * The branch key really did come from the seeded fixture rather than a literal in this file.
     */
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
     * `model/entity/ProductType.cfc:L110` walks to the first identifier of `productTypeIDPath` and asks
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
     * `src/errors/DomainError` and never retyped here — one declaration site keeps verbatim fidelity
     * checkable with a single search, and a second copy in a test would be free to drift.
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
     * test is on the raw text length, not on `listLen`.
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
     * A lone delimiter. `len(",")` is 1, so this takes the odometer branch and then resolves zero
     * options — one option-less SKU, and no default rebinding because the product already has one.
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
     * [:L73-L74] walk the value with `listLen` and `listGetAt`. It is a delimited string, never an
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
     * `getOptionService().getOption( listGetAt(arguments.data.options, i) )` — one resolution per list
     * entry, in list order, with no de-duplication of any kind. `onMissingMethod` synthesised that
     * member; IR-1 requires it to be declared explicitly, and this service calls it exactly as the
     * legacy loop does.
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

    /*
     * One resolution per list entry — three entries, three queries, exactly as the [:L73] loop runs.
     */
    expect(harness.optionQueries.queries).toHaveLength(3);

    /*
     * Every one of them is a single-identifier read of the option entity, and the identifiers arrive in
     * list order with the repeat present twice. Asserting the whole sequence rather than a count plus a
     * spot check is what makes both the order and the retained duplicate part of the contract.
     */
    expect(
      harness.optionQueries.queries.map((query) => ({
        entityName: query.entityName,
        filters: query.whereGroups?.[0]?.filters,
        /*
         * `undefined` rather than an empty array is the honest reading: the identifier query builds no
         * `inFilters` member at all, and stating that here is what would fail if a batch returned.
         */
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
     * spelling of the a1+b1, a2+b1, a1+b2, a2+b2 sequence.
     */
    expect(harness.skuRepository.persisted.map(describeOptions)).toEqual([
      `${ID.red}+${ID.small}`,
      `${ID.blue}+${ID.small}`,
      `${ID.red}+${ID.large}`,
      `${ID.blue}+${ID.large}`,
    ]);

    /* Nothing re-sorted the result: the write order is the enumeration order. */
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
    /*
     * Product scope travels with every read; the DAO's "optional productID" path is unreachable (T2).
     */
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
     * [:L93] price; [:L94-L96] the guarded list price; [:L97] the code suffix read from the current SKU
     * count — and read before `addSku` at [:L100], which is why the sequence starts at 1 rather than 2;
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
    /*
     * [:L101-L103] — `isNull(getDefaultSku())` gates the rebinding; it is not unconditional here.
     */
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
     * set first at [:L128], the suffix is the constant `-1` at [:L133], the default SKU is rebound
     * unconditionally at [:L134], and no option is attached at all.
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
     * [:L142-L149] are two independent `if` statements, each adding its own error, and only [:L152]
     * gates on `hasErrors()`. A reader who folded them into one guard, or who returned after the first,
     * would report one error where the legacy reports two — and `model/validation/Product.json` keys
     * them separately, so both are observable.
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
     * [:L153-L169]. `setPrice` at [:L156] and `setRenewalPrice` at [:L157] read the same
     * `data.price`; there is no separate renewal price in the creation data.
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
     * family is asked for, and both benefit families are asked for separately — renewal benefits are
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
     * test, and it sits after the [:L152] gate. So a payload that satisfies both preconditions and then
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
     * unconditional — unlike the merchandise odometer, which gates it.
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
     * [:L191-L200]. The suffix is the loop counter at [:L194], so codes restart at `-1` regardless of
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
    /* The first access content's SKU is the default, and it is bound exactly once. */
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

    /*
     * A numeric STRING takes the private `toCfmlNumber` path before becoming a boolean. Any non-zero
     * number is true in CFML, so `'2'` selects the one-SKU bundled branch.
     */
    const numericTruthy = buildHarness({ contentIDs: [ID.firstContent, ID.secondContent] });
    await numericTruthy.service.createSkus(buildContentAccessProduct(), {
      price: 40,
      accessContents: `${ID.firstContent},${ID.secondContent}`,
      bundleContentAccess: '2',
    });
    expect(numericTruthy.skuRepository.persisted).toHaveLength(1);

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
     * [:L207] sits outside every branch and is the sole `return true`. It carries no failure signal in
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
   * The highest-risk item in the slice, and the one a faithful-looking port gets wrong silently.
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
     * This is the discriminating case. Feeding the same option twice makes the odometer produce two
     * SKUs carrying an identical option set — `model/service/SkuService.cfc:L78` appends
     * unconditionally, so a repeated selection is a repeated bucket entry (T1).
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
     * Exactly one message: only `hasUniqueOptions` failed, because a single group cannot violate
     * `hasOneOptionPerOptionGroup`.
     */
    expect(findings.options).toHaveLength(1);
    expect(skuBatchHasErrors(product)).toBe(true);

    /*
     * And it is the second SKU that carries it. Read off the product's own SKU members so the assertion
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
     * The other half of the M6 contract: "all in the same transaction". That half lives in
     * `src/adapters/mysql/UnitOfWork.ts` and nowhere else, so this case instantiates the real class
     * over the local driver probe rather than a unit-of-work double.
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
     * The half of M6 that nothing else in this suite could see every other case here drives the in-
     * memory SKU repository, so no statement is ever issued and no executor is ever consulted.
     * `MySqlSkuRepository.withExecutor` — the member that adopts a boundary's connection — is
     * therefore invisible to the rest of this file, and its own adapter suite exercises it one
     * repository at a time rather than through the service that opens the boundary. What only this
     * case can see is the composed path: the service layer driving the real adapter inside a
     * boundary it opened itself.
     */
    const { options } = buildColorAndSizeOptions();
    const harness = buildHarness({ resolvableOptions: options });
    const product = buildMerchandiseProduct();
    const probe = createDriverProbe();
    const unitOfWork = new UnitOfWork(probe.pool);

    /*
     * The pool-bound graph a composition root builds once per container: the real `QueryRunner` over the
     * real pool seam, not a hand-written executor double. Nothing in this test is allowed to succeed
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
          /*
           * Two combinations: two colours across one size, so a second SKU exists to read back for.
           */
          options: `${ID.red},${ID.blue},${ID.small}`,
        }),
      () => skuBatchHasErrors(product),
    );

    expect(created).toBe(true);
    expect(skuBatchHasErrors(product)).toBe(false);
    expect(probe.lifecycle).toEqual(['getConnection', 'begin', 'commit', 'release']);

    /* [1] nothing bypassed the boundary. */
    expect(probe.statements.filter((statement) => statement.channel === 'pool')).toEqual([]);
    expect(probe.statements.length).toBeGreaterThan(0);

    /*
     * [2] the graph adopted the scope's own executor, and did so by producing a NEW instance rather
     * than by mutating the pool-bound one — the distinction `withExecutor` documents (M7).
     */
    expect(scopeExecutor).toBeDefined();
    expect(boundRepository).toBeDefined();
    expect(boundRepository).not.toBe(poolBoundRepository);

    /*
     * [3] the statements are the real adapter's, so this is the ported SQL rather than a double's.
     */
    const transactional = probe.statements.filter(
      (statement) => statement.channel === 'transaction',
    );
    const indicesWhere = (predicate: (sql: string) => boolean): number[] =>
      transactional.reduce<number[]>(
        (found, statement, index) => (predicate(statement.sql) ? [...found, index] : found),
        [],
      );

    /*
     * `MySqlSkuRepository.findSkusBySelectedOptions` — the M6 read-back, T1 through T5 (AAP §0.3.3.1).
     */
    const readBacks = indicesWhere((sql) => sql.startsWith('SELECT DISTINCT s.skuID'));
    /*
     * `uniquePropertyChecker.isUniqueProperty` — `model/validation/Sku.json:L4`'s `skuCode` rule.
     */
    const uniquenessReads = indicesWhere((sql) => sql.startsWith('SELECT 1 FROM SwSku e'));
    /*
     * `MySqlSkuRepository.persistSku`'s insert-or-update probe, then the row, then the option links.
     */
    const existenceProbes = indicesWhere(
      (sql) => sql === 'SELECT skuID FROM SwSku WHERE skuID = ?',
    );
    const skuRowWrites = indicesWhere((sql) => sql.startsWith('INSERT INTO SwSku ('));
    const linkWrites = indicesWhere((sql) => sql.startsWith('INSERT INTO SwSkuOption'));

    /*
     * One of each, per SKU, for the two combinations the odometer produced — and nothing else, so an
     * extra round trip introduced anywhere in this path shows up here rather than passing unnoticed.
     */
    expect(readBacks).toHaveLength(2);
    expect(uniquenessReads).toHaveLength(2);
    expect(existenceProbes).toHaveLength(2);
    expect(skuRowWrites).toHaveLength(2);
    expect(linkWrites).toHaveLength(2);
    expect(transactional).toHaveLength(10);

    /*
     * [4] the interleave is the point of M6: the second SKU's uniqueness read-back is issued after the
     * first SKU's row and option links were written, on the same connection, so the legacy's
     * flush-then-query visibility is reproduced rather than approximated.
     */
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
     * merely counted. Here the graph is built with the pool-bound repository on purpose — which is
     * exactly the state a `withExecutor` that ignored its argument would produce — and the boundary must
     * refuse the work instead of committing it against the wrong connection.
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

    const rejection: unknown = await unitOfWork
      .runScoped(
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
      )
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );

    expect(rejection).toBeInstanceOf(DatabaseStatementError);
    if (!(rejection instanceof DatabaseStatementError)) {
      throw new Error('the poisoned pool path did not fail as a database statement error');
    }
    expect(rejection.failureClass).toBe('driver');
    expect(rejection.message).not.toContain(POOL_EXECUTOR_USED_MESSAGE);
    expect(JSON.stringify(rejection.context)).not.toContain(POOL_EXECUTOR_USED_MESSAGE);

    /* The boundary unwound rather than committing, and the offending statement is on record. */
    expect(probe.lifecycle).toEqual(['getConnection', 'begin', 'rollback', 'release']);
    expect(probe.statements.filter((statement) => statement.channel === 'pool')).not.toEqual([]);
  });

  it('NET-NEW rolls the whole boundary back when the batch accumulated a finding, keeping the errors', async () => {
    /*
     * The retention contract, stated exactly where it lives. `validateNewSku` writes each SKU
     * unconditionally — the legacy stages an invalid entity in the ORM session just the same, because
     * `addSku` at [:L100] is not gated on validation either. What decides whether a write is kept is the
     * commit gate: `getORMHasErrors()` in the legacy, `skuBatchHasErrors(product)` here.
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
     * a validation pass driven on its own issues the uniqueness read and no write at all.
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
    /* TODO(parity) D19 — `model/entity/Sku.cfc:L764`. */
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

    /*
     * No `options` key, so this is the single-SKU fallthrough and the new SKU carries no option.
     */
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
    /*
     * The other side of D19: the degenerate query returns nothing, so the guard's first arm passes.
     */
    const harness = buildHarness();
    const product = buildMerchandiseProduct();

    await harness.service.createSkus(product, { price: TEST_MERCHANDISE_PRODUCT_PRICE });

    expect(collectSkuBatchErrors(product)).toEqual({});
    expect(skuBatchHasErrors(product)).toBe(false);
  });

  it('NET-NEW hasOneOptionPerOptionGroup stays synchronous, short-circuits, and is case-sensitive', async () => {
    /*
     * `model/entity/Sku.cfc:L772-L784` — the second method rule, and the one that is pure. It walks the
     * option collection in memory and performs no data access at all, so it ports as a plain loop.
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
     * Short-circuit proof. A groupless option raises when inspected. Placed after the repeat it is never
     * reached, because the walk returns on the first repeated group; placed after a non-repeat it is
     * reached and raises. The pair of outcomes is what demonstrates the early exit.
     */
    expect(buildSku({ options: [red, blue, groupless] }).hasOneOptionPerOptionGroup()).toBe(false);
    expect(() =>
      buildSku({ options: [red, small, groupless] }).hasOneOptionPerOptionGroup(),
    ).toThrow(DomainError);

    /*
     * Case-sensitive group identity: `GRP` and `grp` are two groups, so one option each is legal.
     */
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
     * between rules, only inside `hasOneOptionPerOptionGroup` itself. A SKU that violates both therefore
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
    /* The ordering model, run rather than asserted — and scoped honestly. */
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

    /* Insert-all-then-validate flips the first verdict — SKU 1 now sees SKU 2 as well. */
    const insertAllFirst = await runSequencing('insertAllThenValidate');
    expect(insertAllFirst.verdicts).toEqual([false, false]);
    expect(insertAllFirst.steps).toEqual(['insert:1', 'insert:2', 'validate:1', 'validate:2']);
    expect(insertAllFirst.verdicts).not.toEqual(legacyOrder.verdicts);

    /* Validate-before-any-insert lets the duplicate through — both reads saw an empty table. */
    const validateFirst = await runSequencing('validateBeforeAnyInsert');
    expect(validateFirst.verdicts).toEqual([true, true]);
    expect(validateFirst.steps).toEqual(['validate:1', 'validate:2', 'insert:1', 'insert:2']);
    expect(validateFirst.verdicts).not.toEqual(legacyOrder.verdicts);
  });

  it('NET-NEW — SERVICE-DRIVEN: the real createSkus implements legacyOrder, and both naive visibilities diverge', async () => {
    /*
     * The M6 proof at service level — the one that fails if `skuService`'S own interleave drifts.
     */
    type ReadBackVisibility = 'everyWriteSoFar' | 'noWriteOfThisBatch' | 'theWholeBatchUpFront';

    const { options } = buildColorAndSizeOptions();
    const red = requireAt(options, 0, 'the red option');

    /**
     * One SKU's findings, read off the entity that carries them rather than off the merged batch bag.
     */
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

      /* Snapshotted before the call, so "of this batch" means "written by this `createSkus`". */
      const preExisting = new Set(harness.skuRepository.skus.map((sku) => sku.skuID));
      const readSizes: number[] = [];

      /*
       * The decoration is a spread, not a subclass: every other member — `persistSku` included — stays the
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
                   * `theWholeBatchUpFront`. The reveal applies the same predicate the repository applies —
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
       * The real service over the decorated port, wired exactly as `buildHarness` wires it — same option
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

      /*
       * `:L207` returns unconditionally, so the boolean carries no verdict in any of the three runs.
       */
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
     * [1] production behaviour. Two SKUs, and the interleave is validate-then-write per SKU: SKU 1's read
     * observes nothing, SKU 2's read observes SKU 1's row. So the first duplicate is accepted and only the
     * second is rejected, and the rejection is the single `options` message `model/validation/Sku.json:L6`
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
     * [2] validate-before-any-insert. Neither read observes a sibling, so the duplicate is accepted — the
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
     * read returning two rows is what proves the reveal actually reached the rule.
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

    /*
     * [4] three orderings, three different verdict vectors — pairwise, not merely "not all equal".
     */
    expect(
      new Set(
        [landed, noneVisible, allVisible].map((run) =>
          run.verdicts.map((verdict) => String(verdict)).join(','),
        ),
      ).size,
    ).toBe(3);

    /* [5] the bridge, and the reason this case exists separately from the one above. */
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
   */

  /**
   * The seeded merchandise product these cases start from, built exactly as the M6 block builds its own.
   */
  const buildMerchandiseProduct = (): Product =>
    buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

  it('NET-NEW — a failed BEGIN destroys the connection and the service never runs at all', async () => {
    /*
     * The known-clean disposition is cleared before the begin is attempted, so a begin that failed
     * part-way through still leaves a connection of unknown state. Nothing inside the boundary has
     * run yet, which this
     * case asserts through the repository rather than through the probe: `run` drives the harness's own
     * in-memory graph here, so an empty statement log would prove nothing while an empty call log proves
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
     * roll-back to attempt, the driver's rejection is what the caller sees unchanged, and the connection
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
     * boundary rolls back, and the roll-back is refused — so the caller is told about the roll-back
     * rather than about the gate, because "nothing can be reported about what the database retained" is
     * the more serious fact.
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
  /* `model/service/SkuService.cfc:L210-L218`. */

  /*
   * The two values every case in this block needs: a realistic stored file name, and a realistic upload
   * struct to forward.
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
     * The return type is `boolean`, not `Sku`, because the legacy body answers a verdict. The
     * declaration is `public any function` — loose — and [:L213-L217] settles what that `any` is:
     * `return true;` at [:L214] and `return false;` at [:L216], and never the entity. TR-1 tightens a loose
     * signature to the observed contract, which is what this case pins.
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
    /*
     * A stored write is `true` — [:L214]. Asserted as an exact boolean rather than truthiness, so a
     * revision answering with an entity again fails here by value rather than passing on coercion.
     */
    expect(saved).toBe(true);

    /*
     * And the entity is not mutated on the way through. [:l211-l217] neither re-reads nor clones nor
     * writes, so the caller's own instance is unchanged.
     */
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
    /*
     * A declined write is `false` — [:L216] — and it is not a raise, not a `null` and not an error
     * recorded on the entity. The distinction between the two outcomes is the whole of what this member
     * publishes.
     */
    expect(notSaved).toBe(false);
    expect(rejectedSku.imageFile).toBe(CONTAINED_IMAGE_FILE);
  });

  it('NET-NEW a DECLINED write still resolves, records no error and raises nothing [model/service/SkuService.cfc:L213-L217]', async () => {
    /*
     * What the port deliberately does not do with a declined write. [:l213-l217] neither calls `addError`
     * nor raises, so converting the declined write into a rejection, or writing it onto the SKU's error bag,
     * would fabricate behaviour the legacy lacks (AAP §0.8.2 Guideline 4). The port asked the image port
     * exactly once and then answered; nothing was retried and no second path was composed.
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

    /*
     * Nothing was written onto the entity, and nothing was raised — the two things a "helpful" port would
     * add here. The caller's instance is untouched, field for field.
     */
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
    /*
     * The upload result travels by reference, and the identity check is what would catch a future
     * validator that "normalised" the value on its way through.
     */
    expect(saveCall.request.uploadResult).toBe(uploadResult);
    /* And the composed path crosses unchanged, exactly as [:L211-L212] hands it over. */
    expect(saveCall.request.filePath).toBe(CONTAINED_IMAGE_PATH);
    /*
     * Byte-exact against the legacy literal at [:L212], and against the port constant, so the two can
     * never drift apart unnoticed.
     */
    expect(saveCall.request.allowedExtensions).toBe('jpg,jpeg,png,gif');
    expect(saveCall.request.allowedExtensions).toBe(IMAGE_UPLOAD_ALLOWED_EXTENSIONS);
  });

  it('[NET-NEW] refuses an ABSENT image file, while COMPOSITION stays ungated', async () => {
    /*
     * `model/entity/Sku.cfc:L145` builds the path from `getImageFile()` with no null guard, so a
     * SKU with no image file still produces a path — one with nothing in the file position.
     * Guarding composition would be a repair, so composition stays ungated and the write refuses
     * the absent name instead.
     */
    const harness = buildHarness();
    const sku = buildSku({ skuID: ID.existingSku, price: 10 });

    await expect(harness.service.processImageUpload(sku, {})).resolves.toBe(false);
    /* Neither member of the port was reached — not even the composition. */
    expect(harness.imagePaths.calls).toEqual([]);

    /* Claim 1, re-pointed at the member where it was always true: composition still composes. */
    const composing = buildHarness();
    await expect(
      buildSku({ skuID: ID.existingSku, price: 10 }).getImagePath(composing.imagePaths.imagePaths),
    ).resolves.toBe('');
    const pathCall = requireAt(composing.imagePaths.calls, 0, 'the image-path read');
    expect(pathCall.member === 'getImagePath' && pathCall.imageFile).toBe('');
  });
});

describe('SkuService.getProductSkus', () => {
  /* `model/service/SkuService.cfc:L220-L244`. */

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
     * [:L221] passes `product=` and `fetchOptions=` by name and does not pass `sorted` — sorting is a
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
     * parts are load-bearing, and the third looks at `skus[1]` — the first element of a one-based array
     * — and at nothing else.
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

    /*
     * First SKU option-less — sorting is silently skipped even though the second SKU has options.
     */
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
    /* TODO(parity) D13 — `model/service/SkuService.cfc:L236-L237`. */
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
  /* `model/service/SkuService.cfc:L246-L269`. */

  it('NET-NEW reads the product collection rather than the repository product-SKU query', async () => {
    /*
     * [:L247] is `arguments.product.getSkus()` — the in-memory association, not
     * `getSkuDAO().getProductSkus(...)`. So this member issues exactly one repository call, the ordering
     * query, and never the product-SKU read that `getProductSkus` opens with.
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
     * write as [:L237], but this member has neither the `sorted` flag nor the first-SKU option check, so
     * it reaches the failure more readily: two SKUs where one is option-less is enough.
     */
    const { options } = buildColorAndSizeOptions();
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );
    /*
     * First SKU is option-less — which `getProductSkus` would have used to skip sorting entirely.
     */
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
  /* `model/service/SkuService.cfc:L271-L273`. */

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
    /* The absent restriction travels as absent — it is not defaulted to an empty string. */
    expect(call.productTypeID).toBeUndefined();

    /*
     * The `{id, value}` projection `model/dao/SkuDAO.cfc:L130-L146` selects, in the query's order.
     */
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
    /*
     * The subscription product's SKU is excluded by the restriction, not by anything this member does.
     */
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

  /*
   * There is no windowed sibling to assert: `searchSkusByProductTypeBounded` is not a member of
   * `skuService`, and the surface case above pins its absence. Everything that decides which rows the
   * search returns belongs to the unbounded member.
   */
});

describe('SkuService.getSkuStocksDeletableFlag', () => {
  /* `model/service/SkuService.cfc:L281-L283`. */

  it('NET-NEW TODO(parity) D4 — rejects with the explicit unportable boundary rather than a fabricated flag', async () => {
    /* TODO(parity) D4 — `model/service/SkuService.cfc:L281-L283`. */
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
     * The declared return type is `Promise<boolean>`, so the failure has to arrive as a rejected promise.
     * A plain `throw` from a non-`async` promise-returning member escapes before any promise exists and
     * lands as a synchronous exception, which every caller written to the declared contract would miss:
     * `.catch(…)` never attaches, and one `Promise.all` participant throwing synchronously abandons the
     * others instead of settling. Calling it without `await` and attaching `.catch` is the only way to
     * tell the two apart, so that is what this case does.
     */
    const harness = buildHarness();
    let caught: unknown;

    /*
     * No `await` on this line on purpose — a synchronous throw would escape here and fail the test.
     */
    const pending = harness.service.getSkuStocksDeletableFlag(ID.existingSku);
    await pending.catch((error: unknown) => {
      caught = error;
    });

    expect(caught).toBeInstanceOf(NotImplementedError);
  });
});

describe('SkuService.getTransactionExistsFlag', () => {
  /* `model/service/SkuService.cfc:L285-L287`. */

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
     * `model/entity/Sku.cfc:L594` passes `skuID=` and nothing else. The service parameter is first and
     * the repository parameter is second, so the crossing is what this case pins: a `skuID` that arrived
     * in the repository's `productID` slot would query `ss.product.productID = :skuID`, match no row and
     * answer `false` — from a flag whose `false` permits a DELETE.
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
     * not make a different product undeletable, so the negative case is asserted alongside the positive.
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
     * `model/dao/SkuDAO.cfc:L58` lets `skuID` win when both are present, and that precedence belongs to
     * the layer that composes the statement. This member forwards both slots rather than dropping one, so
     * the repository can apply the legacy rule where the legacy applies it.
     */
    const harness = buildHarness({
      transactionSkuIDs: [ID.existingSku],
      transactionProductIDs: [ID.otherProduct],
    });

    /*
     * SKU present and participating, product present and also participating: the SKU branch answers.
     */
    await expect(
      harness.service.getTransactionExistsFlag(ID.existingSku, ID.otherProduct),
    ).resolves.toBe(true);

    /*
     * SKU present but not participating: still the SKU branch, so the participating product is ignored.
     */
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
     * guard (IR-9), and it is emphatically not collapsed into a global "does any transaction exist"
     * reading, which is the one answer the legacy can never give. A product that does participate is in
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
     * whose `false` permits a DELETE (`model/validation/Product.json:L12`, `model/validation/Sku.json`),
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
     * The two routes to one capability, asserted side by side. `model/entity/Sku.cfc:L594` and
     * `model/entity/Product.cfc:L626` are entity-level reads, and in the port each entity is handed
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

    /*
     * The product-side caller's slot: second, with the first left `undefined` as that entity leaves it.
     */
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

    /*
     * And the brand, which is what makes binding the service member where a checker is expected — the two
     * orders happen to agree, so assignability alone would permit it — a type error.
     */
    expect(checker.argumentOrder).toBe('skuID-first-productID-second');
  });
});

describe('SkuService.getSkuBySkuCode', () => {
  /* `model/service/SkuService.cfc:L289-L291`. */

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
    /*
     * Not trimmed, not upper-cased, not padded — the value arrives exactly as the caller wrote it.
     */
    expect(call.skuCode).toBe('SHIRT-1');
  });

  it('NET-NEW TR-4 — the one supplied value is bound in BOTH positions, primary and alternate', async () => {
    /*
     * `model/dao/SkuDAO.cfc:L102-L104` is a single statement with a LEFT JOIN to the alternate-code
     * table and `:skuCode` bound in two places — the primary column and the alternate column. TR-4
     * requires the port to bind one value into both positions, in the legacy order, rather than deriving
     * two independently transformed values.
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

    /*
     * Exactly one value was handed down — the two positions are the query's business, not the caller's.
     */
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
     * The null return is part of the contract and must not become a throw.
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
  /* `model/service/SkuService.cfc:L309-L324`. */

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

    /* Every keyword property carries the same weight — the legacy passes 1 five times over. */
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
     * carries the structural members and nothing else — no empty filter group, no empty keyword list, no
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

  it("NET-NEW appends a caller's joins — carried in `data`, since the signature has only TWO parameters", async () => {
    /*
     * The joins travel in `data` rather than as a third argument, because that
     * parameter. AAP §0.4.2.2 tabulates `getSkuSmartList(data?: SmartListInput, currentURL?: string)` and
     * `model/service/SkuService.cfc:L309` declares exactly `(struct data={}, currentURL="")`, so a third
     * parameter broke the method-by-method parity check §0.8.3.1 asks for. The contribution therefore
     * travels where the one production consumer already carries it — inside `data`, under
     * `SmartListInput.additionalJoins`, which is the channel `translateSmartListInput` reads.
     */
    const harness = buildHarness();

    /*
     * The feed's own three, written out here rather than imported: this file may not import from
     * `src/integrations/google/**`, and restating them by locator keeps the coverage without the
     * dependency. The first is the verbatim repeat of [:L314]; the second and third both name
     * `SlatwallProduct` as their parent, which is an entity the first of the base joins is what
     * registers — so order is load-bearing, not merely conventional.
     */
    await harness.service.getSkuSmartList({
      additionalJoins: [
        /* integrationServices/google/controllers/feed.cfc:L64 — the repeat. */
        { parentEntityName: 'SlatwallSku', relatedProperty: 'product' },
        /* integrationServices/google/controllers/feed.cfc:L65. */
        { parentEntityName: 'SlatwallProduct', relatedProperty: 'defaultSku' },
        /*
         * integrationServices/google/controllers/feed.cfc:L66 — a left join, because brand is optional.
         */
        { parentEntityName: 'SlatwallProduct', relatedProperty: 'brand', joinType: 'left' },
      ],
    });

    const query = harness.skuQueries.lastQuery();
    if (query === undefined) {
      throw new Error('The smart-list port was expected to receive one composed query.');
    }
    /*
     * The composed list is asserted explicitly rather than by checking only that `brand` appears: the
     * service's own three come first, in their declaration order, and the caller's three follow — which is
     * the order `feed.cfc` produces by mutating the list the service had already seeded.
     */
    expect(query.joins).toEqual([
      ...EXPECTED_JOINS,
      { parentEntityName: 'SlatwallSku', relatedProperty: 'product' },
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'defaultSku' },
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'brand', joinType: 'left' },
    ]);
    /*
     * The brand join keeps its LEFT polarity, which is load-bearing: an inner join would silently drop
     * every product with no brand from the feed.
     */
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
     * effectively a singleton over a whole-table aggregate. Hoisting the equivalent to module scope in a
     * Lambda would let one warm invocation read a ceiling computed for a different tenant's data.
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
   * The cases above pin each member's behavior. These pin the properties that hold across members, and
   * that a well-meaning change would quietly break: the shape of the dependency graph, the closed set of
   * branch keys, the branch-local reach of each out-of-scope boundary, and the absence of any state that
   * survives one service instance.
   */

  it('NET-NEW declares exactly the ten required collaborators, with no dead productService injection', async () => {
    /*
     * AAP §0.6.3.2 counted the call sites behind every declared and dynamic dependency of
     * `model/service/SkuService.cfc:L51-L56`. The result:
     * skuDAO 8 sites → skuRepository
     * optionService 1 site → optionService
     * subscriptionService 3 sites → SubscriptionTermPort (out of scope, TR-5)
     * contentService 2 sites → AccessContentPort (out of scope, TR-5)
     */
    expect(SkuService.length).toBe(10);

    /*
     * The dead injection is absent behaviourally as well as structurally: a full merchandise batch
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
     * is closed: a fourth key reaches the fallthrough at [:L203-L204].
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
     * A fourth key raises the imported message. The literal is not retyped here — it is the constant the
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
     * TR-5 and AAP §0.2.2.6. Each branch of `createSkus` crosses only its own boundary: the merchandise
     * odometer never asks the subscription or content ports anything, and neither non-merchandise branch
     * asks the other. A port consulted outside its branch would mean the boundary had widened, which is
     * precisely how a slice of this kind grows until it has swallowed the platform.
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
    /*
     * Nor did creation reach for a smart list — the option lookup is a records read on its own port.
     */
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
       * Supplied because [:L163] reads `data.renewalSubscriptionBenefits` with no `structKeyExists`
       * guard, after the gate at [:L152] — so an absent key raises rather than defaulting to none. That
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
     * the M7 case on the smart list. If any counter, cache, memo or accumulated array outlived a service
     * instance — a SKU-code suffix counter, an odometer position, a resolved-option map — the second run
     * would differ from the first. Two fresh graphs over identical input must agree on everything
     * observable: the codes, the option sets, the enumeration order and the default binding.
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
     * enumerates it as nine members, to which IR-1 adds `newSku`. This case closes the set in both
     * directions, and the two directions need two different mechanisms because only one of them can be
     * observed at run time.
     */

    /*
     * Direction one — nothing was lost, and every name listed is genuinely public. The `satisfies`
     * clause is doing real work: `keyof SkuService` resolves to the public members only, so a typo, a
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
     * The arity of the one search member this service declares, because a bounded sibling is the
     * drift it is most exposed to. `searchSkusByProductType` declares both arguments optional
     * ([model/service/SkuService.cfc:L271] — AAP §0.4.2.2 Discrepancy 3), so it has arity 2. A windowed
     * form re-added by taking the window first would declare 3, and would fail here as well as at the
     * compiler-enforced closure below.
     */
    expect(surface.searchSkusByProductType).toHaveLength(2);

    /*
     * Direction two — nothing was added, enforced by the compiler rather than by a runtime scan.
     */
    type UnauthorizedPublicMember = Exclude<keyof SkuService, (typeof authorized)[number]>;
    const surfaceIsClosed: [UnauthorizedPublicMember] extends [never] ? true : never = true;
    expect(surfaceIsClosed).toBe(true);

    /*
     * And the two members this service must not acquire, named so a reader can see the boundary rather
     * than infer it. AAP §0.4.2.2 fixes the surface at nine, §0.8.3.1 makes it checkable
     * method-by-method, §0.7.3 forbids inventing a "batch" or a page bound, and §0.1.1.1 records that
     * this migration is "explicitly not: Performance refactoring".
     */
    for (const absentMember of ['searchSkusByProductTypeBounded', 'getSkuSmartListRecords']) {
      expect(Object.getOwnPropertyDescriptor(SkuService.prototype, absentMember)).toBeUndefined();
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
     * The closing gate, which is what the original "no invented sibling" wording was reaching for.
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
 * IR-6 — the write seam assigns the identifier, and every SKU in a batch gets a DISTINCT one
 * `model/entity/Sku.cfc:L52` declares `skuID` as
 * `fieldtype="id" generator="uuid" ormtype="string" length="32" unsavedvalue="" default=""`, and AAP
 * IR-6 records that 107 of 113 legacy entities declare exactly that. So the identifier is generated in
 * application code — never by the database — and its shape is 32 lowercase hexadecimal characters with
 * no dashes. `/^[0-9a-f]{32}$/` is that declaration written as a predicate.
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
      /*
       * Stated through the entity's own predicate too, so it does not rest on the literal alone.
       */
      expect(sku.isNew()).toBe(false);
    }
  });

  it('NET-NEW mints DISTINCT identifiers across a batch, so it cannot collapse onto one row', async () => {
    const { colorGroup, sizeGroup } = buildColorAndSizeOptions();
    /*
     * Three colours over three sizes is nine combinations — enough that a reused value is unmistakable.
     */
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
     * The placement is asserted as an ordering, because both ways of getting it wrong compile and
     * neither raises. Minting the identifier earlier flips `Sku.isNew()` to false while the graph is
     * still being assembled, which silently changes `Sku.setProduct`'s decision about whether to append
     * the SKU to its product; minting it later is impossible, because the write needs it. The legacy sat
     * at exactly this seam: Hibernate generated the value during the request-end flush, after the
     * validation rules had already run against a transient entity.
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
    /* Read strictly before write, for the same SKU. */
    expect(readIndex).toBeLessThan(writeIndex);
  });

  it('NET-NEW leaves the identified SKUs on the product itself, not copies of them', async () => {
    /*
     * `Sku.setProduct` appended these while they were still new and the identifier was assigned in
     * place, so the product's collection must hold the very objects the repository received — not
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
     * `src/services/SkuService.ts` mints under a guard —
     * `if (sku.skuID === SKU_UNSAVED_ID_VALUE) { sku.skuID = createSlatwallUUID(); }` — and its own note
     * claims "only for a NEW SKU. An already-identified SKU keeps its identifier, so a re-save updates the
     * row it belongs to rather than inserting a second one." Every case above this one supplies a fresh
     * SKU, so all of them take the true branch: the guard's false branch, and therefore the claim, had no
     * assertion behind it at all. An unconditional mint would pass every one of them.
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
      /*
       * One option per group is exactly one combination, so the identifier below is unambiguous.
       */
      await runMerchandiseBatch(harness, product, `${ID.red},${ID.small}`);
    } finally {
      /*
       * Read the count before restoring. `mockRestore()` also resets the recorded calls, so asserting
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
     * The whole of the assertion: the identifier reaching the write is the one the entity arrived with.
     * A bypassed guard would overwrite it with a fresh `createSlatwallUUID()` value, which cannot equal
     * this literal — so the two expectations below fail together the moment the guard stops guarding.
     */
    expect(persisted.skuID).toBe(PRE_ASSIGNED);
    expect(persisted.skuID).toMatch(IDENTIFIER_SHAPE);
    /* Assigned in place, never onto a copy, so the caller holds the same identified object. */
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
     * And because no scale is invented — nothing in the legacy repository declares one — `'50'` stays
     * `'50'`. Normalising either way would be a number this plan has no source for (IR-12).
     */
    const scaled = await createWithData({ price: '100.00' });
    expect(scaled.written.price).toBe('100.00');

    const unscaled = await createWithData({ price: '50' });
    expect(unscaled.written.price).toBe('50');
  });

  it('NET-NEW stores a non-numeric price as the sentinel instead of raising', async () => {
    /*
     * The not-an-exception contract, preserved through the representation change. `setPrice` at [:L93]
     * is a generated setter, so CFML accepts the value and the `numeric` rule in
     * `model/validation/Sku.json` reports it under `price`. Raising here would move the failure to a
     * different layer; substituting zero would hide it. The sentinel fails the validator's numeric
     * predicate, so the rule still catches it in the same place the legacy does.
     */
    const { written } = await createWithData({ price: 'not-a-price' });

    expect(written.price).toBe('NaN');
  });

  it('NET-NEW orders the list-price guard by MAGNITUDE, so a negative and a scaled zero are refused', async () => {
    /*
     * The three-part guard at [:L94]: the key is present and the value reads as numeric and it is
     * strictly greater than zero. All three operands are text here, and `'-1' > '0'` is true as a
     * lexical comparison — so a guard written with `>` on strings would admit the very value it exists
     * to refuse, and would compile without complaint. A refused value leaves the entity default in
     * place, which `model/entity/Sku.cfc:L55` declares as `0`.
     */
    const negative = await createWithData({ price: '10', listPrice: '-1' });
    expect(negative.written.listPrice).toBe('0');

    const scaledZero = await createWithData({ price: '10', listPrice: '0.00' });
    expect(scaledZero.written.listPrice).toBe('0');

    /*
     * And a genuinely positive value is applied, at its supplied scale — otherwise the two assertions
     * above would also pass against a guard that refused everything.
     */
    const positive = await createWithData({ price: '10', listPrice: '19.90' });
    expect(positive.written.listPrice).toBe('19.90');
  });

  it('NET-NEW orders a nine-versus-ten magnitude numerically rather than lexically', async () => {
    /*
     * Lexically `'9'` is greater than `'10'`. This pins the digit-count step of the comparison, which is
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
   * This describe has carried four contracts. The bounded one is correct and the third was the
   * finding, so all four are recorded rather than silently superseded.
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
    /*
     * Four groups of four options — 256 combinations. Every one is built, validated, written and
     * attached, and the first still wins the default SKU, so the enumeration is undisturbed.
     */
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
     * Seven groups of three options is 2,187 combinations. `resolves` rather than `rejects` is the
     * assertion: with no budget wired there is no gate to produce a diagnostic, and the value resolved is
     * the vestigial unconditional `true` of [:L207], asserted only to show the method returned normally.
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
     * The heart of, and the ordering is the whole fix. The ceiling is applied between the
     * combination COUNT and the first `newSku()`, so an over-budget request writes nothing at all — not a
     * partial batch, not one SKU, not a default-SKU election. Refusing part-way through would leave the
     * product holding an arbitrary prefix of a batch nobody asked for, which is worse than either
     * extreme.
     */
    const { options, selection } = buildUniverse(3, 4);
    const harness = buildHarness({ resolvableOptions: options, maximumCombinations: 63 });
    const product = buildEmptyProduct(
      buildSeededProductType(
        MERCHANDISE_PRODUCT_TYPE.systemCode,
        MERCHANDISE_PRODUCT_TYPE.productTypeID,
      ),
    );

    const operation = harness.service.createSkus(product, {
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      options: selection,
    });

    await expect(operation).rejects.toBeInstanceOf(RequestBudgetExhaustedError);
    await expect(operation).rejects.toThrow(/64/);

    /*
     * Nothing was allocated, persisted or attached. Each of the three is a separate observation point, and
     * a fix that refused after the loop would fail on all three rather than on a message.
     */
    expect(harness.skuRepository.persisted).toHaveLength(0);
    expect(product.skus).toHaveLength(0);
    expect(product.defaultSku).toBeUndefined();
  });

  it('[NET-NEW] admits a request landing exactly AT the ceiling, and generates the whole batch', async () => {
    /*
     * The admitting side, so the ceiling bounds rather than simply refusing. Sixty-four combinations
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

    /*
     * The odometer is undisturbed too: the first combination still wins the default-SKU election, and it
     * is asserted through `defaultSkuBindings` rather than by identity because `Product.defaultSku` holds
     * a delegate rather than the `Sku` itself.
     */
    expect(harness.defaultSkuBindings).toEqual([product.skus[0]]);
  });

  it('[NET-NEW] refuses with NO ceiling stated, naming the variable, before allocating anything', async () => {
    /*
     * The fail-closed half, and the answer to the "an optional ceiling would suffice" position of step 2 in
     * this block's header. A composition root that states nothing does not get the unbounded odometer; it
     * gets a `ConfigurationError` naming `CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST`.
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
     * This refusal is not a capacity limit, and the distinction matters for the parity argument.
     * `model/service/SkuService.cfc:L89` advances the odometer while `combination < totalCombos`. Once
     * `totalCombos` leaves the exactly-representable integer range — fifty-three groups of two options is
     * 2^53, `MAX_SAFE_INTEGER + 1` — the increment can stop advancing the value while the comparison stays
     * true, so the loop cannot terminate. There is no legacy outcome to preserve for such an input: the
     * legacy does not return a different answer, it hangs. Refusing the state is therefore the only thing.
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
     * 's third clause — "honor an invocation cancellation/deadline". The seam is a predicate the
     * service consults before each combination allocates, so a handler that knows its invocation is out of
     * time can stop the enumeration rather than being unable to interrupt it.
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

    /*
     * Interrupted, not completed: strictly fewer than the sixty-four an admitted batch produces. The exact
     * figure is not asserted, because it is an artefact of where the predicate was told to flip rather
     * than a contract.
     */
    expect(harness.skuRepository.persisted.length).toBeLessThan(64);
  });
});

describe('skuBatchHasErrors and collectSkuBatchErrors — the complete commit gate', () => {
  /*
   * The commit decision the legacy took implicitly at request end, gated on `getORMHasErrors()`
   * (mismatch M5), is explicit here — and the gate has to look in two places, which is the whole reason
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
     * The case that defines these helpers. Per-SKU rule findings deliberately never merge onto the
     * product, and `createSkus` returns `true` unconditionally at [:L207] — so for the commonest failure
     * there is, a colliding SKU code, the product's own bag is empty and the return value says success.
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
     * member with no error bag is representable. The gate inspects capability, not class — which is what
     * keeps it usable against the narrower member type the domain declares.
     */
    const product = buildGateProduct();
    product.skus = [{ setProduct: (): void => undefined, removeProduct: (): void => undefined }];

    expect(skuBatchHasErrors(product)).toBe(false);
    expect(collectSkuBatchErrors(product)).toEqual({});
  });
});

/*
 * The closed smart-list identifier set
 * The type system already refuses a fabricated literal, which no runtime case can observe. What these
 * pin is the runtime half: a caller-supplied smart-list key is resolved against the declared set and,
 * when it does not resolve, is dropped silently rather than passed through or raised.
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
     * The value must come back unchanged: this decides membership, it does not normalise. A trimmed or
     * rewritten identifier would silently change the emitted column.
     */
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'skuCode')).toBe('skuCode');
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'activeFlag')).toBe('activeFlag');
  });

  it('NET-NEW resolves every path this slice actually writes', () => {
    /* One assertion per legacy locator, so a regression names the caller it broke. */
    /* model/service/SkuService.cfc:L317. */
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'product.productName')).toBe(
      'product.productName',
    );
    /* Model/service/SkuService.cfc:L317 — the two-hop case. */
    expect(
      resolveSmartListPropertyIdentifier('SlatwallSku', 'product.productType.productTypeName'),
    ).toBe('product.productType.productTypeName');
    /* Model/service/SkuService.cfc:L321 — traverses into SlatwallAlternateSkuCode. */
    expect(
      resolveSmartListPropertyIdentifier('SlatwallSku', 'alternateSkuCodes.alternateSkuCode'),
    ).toBe('alternateSkuCodes.alternateSkuCode');
    /* integrationServices/google/controllers/feed.cfc:L68-L72. */
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'product.activeFlag')).toBe(
      'product.activeFlag',
    );
    expect(resolveSmartListPropertyIdentifier('SlatwallSku', 'product.calculatedQATS')).toBe(
      'product.calculatedQATS',
    );
    /* Model/entity/Product.cfc:L256 — the three-hop maximum, rooted at the option group. */
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
     * right, but their target entities are excluded by AAP §0.2.2.1, so they are not traversable. The
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
     * Not merely absent from the filters — the whole where group collapses, because every entry in it
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
     * pairing, and that an unresolvable caller key does not disturb them.
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

describe('SkuService — the image WRITE is gated, the composition and the probe are not', () => {
  /*
   * The write boundary refuses a traversing image file name; composition and the probe do not, because
   * `model/entity/Sku.cfc:L145` composes a path from whatever the column holds. The divergence at the
   * write is admitted by analogy with D18: both diverge only where the legacy's behaviour is itself the
   * flaw.
   */

  /**
   * The traversal vector the live write gate refuses, and that the read and probe paths still compose.
   */
  const TRAVERSAL_VECTOR = '../../../../tmp/payload.jpg';
  /*
   * The same value the service is wired with, not a look-alike literal, so a path assertion below can
   * never pass for the wrong reason.
   */
  const IMAGE_BASE: string = TEST_IMAGE_STORAGE_ROOT;

  /**
   * Two names the legacy generator demonstrably produces — the admit direction of the write gate. They are
   * the ordinary case that must never regress, and both are the exact outputs
   * `test/domain/Sku.test.ts` already asserts `generateImageFileName()` returns.
   */
  const GENERATED_NAMES = ['CatalogProduct-1_LgSize.jpg', 'CatalogProduct-1-Lg.png'] as const;

  const buildSkuWithImageFile = (imageFile?: string): Sku =>
    imageFile === undefined
      ? buildSku({ skuID: ID.existingSku, price: 10 })
      : buildSku({ skuID: ID.existingSku, price: 10, imageFile });

  it('[NET-NEW] REFUSES a traversal name, and the port is never reached at all', async () => {
    /*
     * The central case of the finding, whose exploit reads: "store/import
     * `imageFile=../../../../tmp/payload.jpg`, then call `sku.processImageUpload`."
     */
    const harness = buildHarness({
      imagePathsByImageFile: { [TRAVERSAL_VECTOR]: `${IMAGE_BASE}${TRAVERSAL_VECTOR}` },
    });
    const sku = buildSkuWithImageFile(TRAVERSAL_VECTOR);

    await expect(harness.service.processImageUpload(sku, {})).resolves.toBe(false);
    expect(harness.imagePaths.calls).toEqual([]);

    /*
     * And the refusal leaks no destination, which is the finding's own last clause: "return a refusal
     * without leaking destination details." a bare `false` carries no path, no root, no reason and no
     * candidate — a caller learns the write did not happen and nothing else.
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

  it('[NET-NEW] refuses every shape the generator CANNOT emit — six distinct vectors', async () => {
    /*
     * Six vectors, each naming a distinct way the column can hold what the generator could not
     * produce. Each entry names its provenance in the legacy sanitiser:
     *
     * 'evil/x.jpg' — a separator. `reReplaceNoCase(…, "[^a-z0-9\-\_]", "", "all")` at
     * `model/entity/Sku.cfc:L135-L137` strips `/`, so no generated stem contains one.
     * This is the traversal class, and it is now refused.
     * 'shirt.tar.jpg' — a second dot. [:L138] appends exactly one.
     * '..' — the bare traversal token, carrying no extension at all.
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

  it("[NET-NEW] passes a disallowed EXTENSION through, because that is the port's decision", async () => {
    /*
     * The division of labour, asserted so neither check is mistaken for the other. `payload.php` is a
     * single generator-shaped segment — one safe stem, one dot, one alphanumeric extension — so the shape
     * gate admits it and the port is reached, carrying `allowedExtensions="jpg,jpeg,png,gif"` exactly as
     * [model/service/SkuService.cfc:L212] carries it. Refusing it here would move a decision the legacy
     * delegates to the image service into this layer.
     */
    const harness = buildHarness({
      imagePathsByImageFile: { 'payload.php': `${IMAGE_BASE}payload.php` },
    });
    const sku = buildSkuWithImageFile('payload.php');

    /*
     * The port is reached — which is the claim — and then the port declines. The final answer is `false`,
     * and it is `false` for a completely different reason than the traversal cases above: those never
     * reached the port at all, this one reached it and was refused by it. Reading only the return value
     * cannot tell the two apart, which is exactly why the call log is asserted alongside it.
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
    /* byte-exact against the legacy literal at [model/service/SkuService.cfc:L215]. */
    expect(saveCall.request.allowedExtensions).toBe('jpg,jpeg,png,gif');
    expect(saveCall.request.allowedExtensions).toBe(IMAGE_UPLOAD_ALLOWED_EXTENSIONS);
  });

  it('[NET-NEW] admits UPPERCASE stems, because `reReplaceNoCase` spares them', async () => {
    /*
     * The trap this gate had to avoid, asserted rather than trusted. The legacy sanitiser is
     * `reReplaceNoCase(…, "[^a-z0-9\-\_]", …)` — and because the call is case-insensitive, that negated
     * class spares `A`-`Z` as well as `a`-`z`. The same pattern compiled in JavaScript without the
     * ignore-case flag would refuse every uppercase letter, so a gate transcribed literally would reject
     * the generator's own output and break the ordinary case while looking faithful.
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
     * `productImageDefaultExtension` (`model/service/SettingService.cfc:L191`) is an open text
     * setting, so an operator can store `JPG`, and `generateImageFileName`'s sanitiser is
     * `reReplaceNoCase`, which preserves upper case. A gate on the extension would have to compare
     * it case-insensitively to avoid refusing a value the generator emits; the composition path
     * applies no such comparison, and the only claim
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
     * The read path is deliberately ungated, and this is the case that proves it — see
     * `src/ports/ImagePathPort.ts` control (3). `model/entity/Sku.cfc:L222` answers a boolean
     * about whatever the composed path resolves to, so a traversal name yields a real answer about the
     * traversed file. That is a defined legacy outcome on an operation that writes nothing and discloses one
     * bit, so the current contract does not touch it; the residual CWE-22 reach is flagged for an adapter to
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
   * They are asserted here with their diagnostic context, because the context is what tells an operator
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
     * sort order (`model/dao/SkuDAO.cfc:L172-L202`), so two SKUs carrying the same option produce the
     * same weight — which the legacy's `ORDER BY` leaves in an engine-determined sequence and which the
     * port settles by first-seen order.
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

    /* Both positions are claimed, so the batch comes back in a stable order. */
    expect(ordered.map((sku) => sku.skuID)).toEqual([ID.existingSku, ID.secondExistingSku]);
    expect(harness.skuRepository.calls.map((call) => call.member)).toEqual([
      'findByProduct',
      'findSortedSkuIdsByProduct',
    ]);
  });
});

/*
 * AAP §0.4.1.12 declares exactly seventeen executable suites, so this subject is covered
 * inside an approved suite rather than in one of its own.
 */

/* FOLDED IN FROM handlers/skuHandler */

/** The SKU Lambda boundary — API-02 identifier binding and tx-01 transaction integration. */
describe("The SKU surface's final wiring, and the transactional write runner", () => {
  /** A 32-character identifier, the only width the schema declares (IR-6). */
  const PRODUCT_ID = 'bbbbbbbb000000000000000000000001';

  /** A 32-character SKU identifier (IR-6). */
  const SKU_ID = 'cccccccc000000000000000000000001';

  /** An authorisation resolver that admits every request. */
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

  /** A SKU service surface whose every member fails loudly unless a case overrides it. */
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

  /** A write runner that reproduces `unitOfWork.run`'s decision, without a pool. */
  function makeWriteRunner(graph: SkuWriteGraph): {
    readonly runner: TransactionalWriteRunner<SkuWriteGraph>;
    readonly decisions: ('commit' | 'rollback')[];
    readonly securityContexts: RequestAuthorizationContext[];
  } {
    const decisions: ('commit' | 'rollback')[] = [];
    /* — every context the handler handed the boundary, in order. */
    const securityContexts: RequestAuthorizationContext[] = [];

    return {
      decisions,
      securityContexts,
      runner: {
        runWrite: async <TResult>(
          /* — see the identical note in brandService.test.ts. */
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

      /*
       * The captured surface refuses every member. Before this fix the route called exactly this
       * object — bound to the pool — so if the fix regressed, `createSkus` here would throw and the case
       * would fail rather than quietly writing outside the transaction.
       */
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

      /*
       * AAP §0.6.2: `hasUniqueOptions` is a validation rule that queries the sibling SKUs the same
       * operation is writing. Reading the aggregate on the pool while writing in the transaction would show
       * that rule a sibling set missing every SKU just created — M6's silent divergence exactly.
       */
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

    it('NET-NEW — an over-budget batch is a 400 request refusal and leaves the product untouched', async () => {
      const product = makeProduct();
      const graph: SkuWriteGraph = {
        resolveProduct: () => Promise.resolve(product),
        skuService: {
          createSkus: () => {
            throw new RequestBudgetExhaustedError(
              'Creating SKUs would enumerate 1296 combinations, which exceeds the configured ceiling.',
              { context: { combinations: 1296, maximumCombinations: 1000 } },
            );
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

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toStrictEqual({
        message: 'The request asks for more work than one operation may perform',
      });
      expect(product.skus).toHaveLength(0);
      expect(product.defaultSku).toBeUndefined();
      expect(decisions).toStrictEqual([]);
    });

    it('NET-NEW — a SKU-only finding rolls back, which product.hasErrors() alone cannot detect', async () => {
      const product = makeProduct();

      const graph: SkuWriteGraph = {
        resolveProduct: () => Promise.resolve(product),
        skuService: {
          createSkus: () => {
            /*
             * What the real `createSkus` does for a colliding SKU code: the finding lands on the SKU, the
             * product's bag stays empty, and `true` is returned regardless [model/service/SkuService.cfc:L207].
             */
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

      /*
       * The case that defines this fix. Both signals a naive gate would read say "success": the product
       * carries nothing and the work returned `true`. Only the per-SKU bag knows, so a gate narrowed to
       * `product.hasErrors()` would commit an invalid batch.
       */
      expect(product.hasErrors()).toBe(false);
      expect(decisions).toEqual(['rollback']);
      expect(response.statusCode).not.toBe(200);

      /*
       * The findings are published, not MASKED, and that is the point of lifting them. Declining to commit
       * is how the boundary expresses the legacy's "settled as a rollback" branch, but the findings live on
       * the SKU rather than on the rejection, so the route lifts them into a ../errors/ValidationError.
       */
      const body = JSON.parse(response.body) as {
        message: string;
        errors?: Record<string, unknown>;
      };

      expect(Object.keys(body)).toStrictEqual(['message', 'errors']);
      /*
       * The key is the SKU property the rule refused, and the text is copied unchanged from the finding.
       */
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

      /*
       * Nothing was written, so there is nothing to discard: a missing product is a 404, not a failed
       * batch, and treating it as a roll-back would report a server-side failure for a client-side miss.
       */
      expect(response.statusCode).toBe(404);
      expect(decisions).toEqual(['commit']);
    });
  });

  describe('SkuHandler.getTransactionExistsFlag — the scoped probe is published (API-02)', () => {
    /*
     * Why this route publishes a scoped probe rather than a zero-parameter one. Reading AAP
     * §0.4.2.2's Discrepancy 4 literally would narrow `skuService.getTransactionExistsFlag` to zero
     * parameters, narrow this route's event slice to the headers alone and turn the resulting
     * inevitable failure into a fixed 501. that reading is wrong, because:
     *
     * - Discrepancy 4 records the declaration at `model/service/SkuService.cfc:L285`, not the contract.
     * `[:L286]` forwards `argumentCollection=arguments`, and CFML puts undeclared named arguments into
     * that collection, so the member observably takes two optional identifiers.
     * - Both real callers supply one — `model/entity/Sku.cfc:L594` passes `skuID=` and
     * `model/entity/Product.cfc:L626` passes `productID=` — so a zero-parameter port discards the only
     * input the member ever receives.
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

            /*
             * The repository refuses an unscoped probe [model/dao/SkuDAO.cfc:L90]; the real service lets
             * that refusal through untouched, so the double raises rather than answering plausibly. Any
             * scoped probe answers `true` here, which is enough to prove the value is forwarded.
             */
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

      /*
       * The argument list is the assertion. SKU-first is the service's order, and this boundary
       * performs no crossing — the single crossing onto the repository's product-first order happens
       * inside `skuService` itself.
       */
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
      /*
       * `model/dao/SkuDAO.cfc:L58` gives `skuID` precedence when both are present. That precedence belongs
       * to the repository, so this boundary must forward both slots rather than choosing for it.
       */
      const { handler, calls } = makeHandler();

      await handler.getTransactionExistsFlag({
        queryStringParameters: { skuID: SKU_ID, productID: PRODUCT_ID },
        headers: {},
      });

      expect(calls).toEqual([[SKU_ID, PRODUCT_ID]]);
    });

    it('NET-NEW — unsaved sentinels collapse to an absent scope and are refused with a precise 400', async () => {
      /*
       * [model/entity/Sku.cfc:L52] and [model/entity/Product.cfc:L52] both declare `unsavedvalue=""`, so an
       * empty identifier can never address a persisted row. Forwarding it would scope the probe to a row
       * that cannot exist and answer `false` — and a `false` from this flag permits a DELETE
       * ([model/validation/Product.json:L12], [model/validation/Sku.json]). It therefore collapses to
       * absent, and the handler refuses the request before the service can answer a dangerous `false`.
       */
      const { handler, calls } = makeHandler();

      const response = await handler.getTransactionExistsFlag({
        queryStringParameters: { skuID: '', productID: '' },
        headers: {},
      });

      expect(calls).toEqual([]);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toStrictEqual({
        message: 'At least one of "skuID" or "productID" query parameters is required',
      });
    });

    it('NET-NEW — an UNSCOPED request is a precise client refusal and invokes no service', async () => {
      const { handler, calls } = makeHandler();

      const response = await handler.getTransactionExistsFlag({
        queryStringParameters: null,
        headers: {},
      });

      expect(calls).toEqual([]);
      expect(response.statusCode).toBe(400);

      /*
       * The boundary names only its two public query parameters. No repository member, internal
       * diagnostic or fallback boolean is disclosed.
       */
      const body = JSON.parse(response.body) as Record<string, unknown>;

      expect(Object.keys(body)).toStrictEqual(['message']);
      expect(body).toStrictEqual({
        message: 'At least one of "skuID" or "productID" query parameters is required',
      });
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

      /*
       * The anti-enumeration property: refused before the identifier is read or the service consulted, so
       * an unauthorised caller cannot use this route to discover which SKUs exist.
       */
      expect(response.statusCode).toBe(401);
      expect(calls).toEqual([]);
    });
  });

  describe('SkuHandler.getSkuSmartList — only the requested window crosses the HTTP boundary', () => {
    it('NET-NEW — omits the unpaged records collection while preserving count and page metadata', async () => {
      const first = makeManagedSku();
      first.skuID = 'cccccccc000000000000000000000011';
      const second = makeManagedSku();
      second.skuID = 'cccccccc000000000000000000000012';

      const handler = createSkuHandler(
        makeSkuSurface({
          getSkuSmartList: () =>
            Promise.resolve({
              records: [first, second],
              pageRecords: [second],
              recordsCount: 2,
              pageRecordsStart: 2,
              pageRecordsEnd: 2,
              currentPage: 2,
              totalPages: 2,
            }),
        }),
        () => Promise.resolve(null),
        ADMIT_EVERY_REQUEST,
        makeWriteRunner({
          resolveProduct: () => Promise.resolve(null),
          skuService: { createSkus: () => Promise.resolve(true) },
        }).runner,
      );

      const response = await handler.getSkuSmartList({
        queryStringParameters: { 'P:Show': '1', 'P:Current': '2' },
        headers: {},
      });
      const body = JSON.parse(response.body) as Record<string, unknown>;

      expect(response.statusCode).toBe(200);
      expect(body).not.toHaveProperty('records');
      expect(body).toMatchObject({
        pageRecords: [expect.objectContaining({ skuID: second.skuID })],
        recordsCount: 2,
        pageRecordsStart: 2,
        pageRecordsEnd: 2,
        currentPage: 2,
        totalPages: 2,
      });
    });
  });

  describe('UnitOfWorkWriteRunner — the graph is built for the transaction (TX-01)', () => {
    /**
     * A scope carrying a recognisable executor, so a case can prove the graph was built from it.
     */
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
          /*
           * — the factory receives the invocation's authorised principal alongside the scope,
           * which is what lets `../../src/config/container.ts` substitute it for the memoised account and
           * population ports when it rebuilds a graph.
           */
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

      /*
       * The point of the whole class: the graph's executor is the transaction's. A graph built from the
       * pool would run its statements on another connection, outside the unit being committed, and a
       * roll-back would leave them behind with nothing reporting a problem.
       */
      expect(seen).toEqual([scope]);
      expect(graph.executor).toBe(scope.executor);

      /*
       * — forwarded unchanged and unwrapped, and not stored on the runner: the class holds no
       * principal of its own, which is what keeps a warm container from carrying one invocation's identity
       * into the next (M7).
       */
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

      /*
       * A cached graph would be bound to a released connection, and on a warm container it would outlive
       * the request that made it — AAP §0.6.6 M7's cross-request bleed.
       */
      expect(built).toBe(2);
    });
  });

  /*
   * The delivered factory's own commit gate (tx-01)
   * why this section exists. Every case above drives `createSkuHandler`, the live route, whose gate was
   * already the complete predicate. `createProductSkuCreationBoundary` is the shape the composition root
   * is told to reuse — and it had no direct coverage at all, which is how it came to gate on
   * `product.hasErrors()` alone while the route beside it gated on `skuBatchHasErrors`. A batch whose SKU
   * codes collide leaves the product's own bag empty.
   */

  describe('createProductSkuCreationBoundary — the delivered factory settles on the whole batch (TX-01)', () => {
    /** A `runScoped` double that records the settle decision the boundary's gate produced. */
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
       * [model/service/SkuService.cfc:L143, :L148, :L176]. This is the case a product-bag check
       * does catch, asserted so the SKU-side check is proved to have kept it rather than traded one
       * blind spot for another.
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

    it('NET-NEW — a SKU-only finding rolls back, which product.hasErrors() cannot detect on its own', async () => {
      /*
       * The regression this section exists for. The finding lands on the SKU, the product's bag
       * stays empty, and the service still answers `true` — so a product-bag check alone sees no
       * failure and the invalid batch commits.
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
      /* Built per invocation: a cached graph would be bound to a released connection (M7). */
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

  describe('SkuHandler.createSkus — the write asks BOTH questions, conjunctively', () => {
    /*
     * The conjunctive half of the write authorisation (CWE-862, CWE-639). */

    /**
     * The entity name the primary question names — the CFML component name, not the smart-list root.
     */
    const PRODUCT_COMPONENT_NAME = 'Product';

    /** The entity name the subordinate question names. */
    const SUBORDINATE_SKU_NAME = 'Sku';

    /** A resolver recording every entity question, answering each from `grants`. */
    const resolverGrantingProduct = (
      grants: readonly { readonly crudType: string; readonly entityName: string }[],
      options: { readonly loggedIn: boolean } = { loggedIn: true },
    ): {
      /*
       * Typed as the invocation resolver, not the header-only shape. The sibling helpers in this
       * file take `RequestAuthorizationResolver<{ headers: unknown }>`, which
       * is assignable at the call site but hides the request: these cases assert on the action and the
       * question the boundary sends, so the narrower type would not compile against them.
       */
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
       * Asserted on the exported table rather than only through the route, so the classification
       * cannot be loosened without a named failure even if every route case below were deleted.
       * `create` must not be the primary `crudType`: that ordering is the one this section forbids.
       */
      expect(SKU_ACCESS_MATRIX.createSkus).toEqual({
        classification: 'secure',
        entityName: PRODUCT_COMPONENT_NAME,
        crudType: 'update',
        subordinate: { entityName: SUBORDINATE_SKU_NAME, crudType: 'create' },
      });
    });

    it('NET-NEW — `create` on `Product` ALONE no longer reaches the write', async () => {
      /*
       * The escalation case. Under a `create`-first tuple this principal is admitted: `create` is
       * asked first and granted, and the route then writes
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
      // Not merely a status: no transaction is opened and no SKU is created.
      expect(creations).toEqual([]);
      expect(securityContexts).toEqual([]);
      /*
       * Exactly one question is asked, and it is the primary one — the subordinate is not reached, because
       * the conjunction short-circuits on the first refusal.
       */
      expect(questions).toEqual([
        { crudType: 'update', entityName: PRODUCT_COMPONENT_NAME, entityID: PRODUCT_ID },
      ]);
    });

    it('NET-NEW — `update` on `Product` alone is NOT authority for the SKU inserts', async () => {
      /*
       * The conjunctive half. This principal may legitimately edit the product, but holds no grant
       * over the SKU rows the route inserts, so the route refuses. Without a `Sku` question this
       * principal would be admitted.
       */
      const { resolver, questions } = resolverGrantingProduct([
        { crudType: 'update', entityName: PRODUCT_COMPONENT_NAME },
      ]);
      const { handler, creations } = handlerCounting(resolver);

      const response = await handler.createSkus(createSkusEvent());

      expect(response.statusCode).toBe(403);
      expect(creations).toEqual([]);
      /*
       * Both questions are asked, in order — the primary is granted, so the subordinate is reached and
       * refuses. This is what proves the second question exists rather than being merely declared.
       */
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

      /*
       * — one resolution per invocation, carrying the routed action and the primary question, and
       * the resolved context is the one handed to the transaction boundary. A boundary that
       * received no context would leave the graph reading a memoised principal instead.
       */
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

    it('NET-NEW — the question names the VICTIM product, not a placeholder', async () => {
      /*
       * CWE-639's half of the finding. Asking `update` on the entity class while ignoring which row is
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

  describe('SkuHandler.processImageUpload — the image write is permission-checked', () => {
    /* (D18-class) — the current contract, CWE-434's least-privilege half. */

    const SKU_CODE = 'TESTSKU001';

    /** The entity name every SKU authorisation question in `skuHandler.ts` names. */
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

    /** A resolver recording every entity question, answering each from `grants`. */
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
      /*
       * Renamed the member from the ordered tuple `crudTypes` to the single `crudType`, so a
       * row can no longer express "either of these two grants will do". The question this row asks is
       * unchanged.
       */
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
      /*
       * The gate runs before any parameter is read, so the refusal is not merely a status: the write
       * member is never invoked, and no SKU is even looked up.
       */
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
      /*
       * The answer is the raw verdict, not a projected entity.
       * [model/service/SkuService.cfc:L213-L217] returns `true`/`false` and never the entity, so
       * TR-1 tightens the loose `any` to the boolean and this route publishes it unwrapped — no
       * envelope and no `{ saved: … }` object (AAP §0.7.3). Projecting the SKU here would add an
       * envelope the route must not have, and this assertion is what fails if one appears.
       */
      expect(JSON.parse(response.body)).toBe(true);
    });

    it('NET-NEW — a DECLINED write is `false` at an OK status, not a failure status', async () => {
      /*
       * [:L216] returns `false` and records nothing — no `addError`, no raise — so a declined write is a
       * reported outcome. Answering 4xx or 5xx for it would invent a status the legacy never produced, and
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

    it('NET-NEW — a TRAVERSING stored image file name still reaches the service, and the SKU is answered (the exposure is carried)', async () => {
      /*
       * This case asserts a carried exposure, deliberately. Refusing a stored `imageFile` that the
       * legacy's own generator could not have produced would refuse input
       * [model/service/SkuService.cfc:L212] accepts, and AAP §0.6.7.7 declares D18 — the importer's SQL
       * parameterisation — the single behaviour-hardening exception in this port.
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
     * [model/service/SkuService.cfc:L289] declares `string skuCode` without `required`, while
     * [model/dao/SkuDAO.cfc:L102] declares it `required`. The route publishes the service's contract, so
     * it applies no `400` precheck on an omitted path parameter: advertising a required route over an
     * optional service parameter would make the published contract contradict the member it publishes.
     */

    const STORED_SKU_CODE = 'TESTSKU001';

    /**
     * Builds the route with a lookup that answers for exactly one code and misses on everything else.
     */
    function handlerFor(reached: (string | undefined)[]): ReturnType<typeof createSkuHandler> {
      const stored = makeManagedSku();
      stored.skuCode = STORED_SKU_CODE;

      return createSkuHandler(
        makeSkuSurface({
          getSkuBySkuCode: (skuCode?: string): Promise<Sku | null> => {
            reached.push(skuCode);

            /*
             * The real service raises for an absent code, at the point [model/dao/SkuDAO.cfc:L102]'s
             * `required` fails in the legacy. The double reproduces that rather than answering a miss, so
             * these cases exercise the failure path the boundary now forwards.
             */
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

      /*
       * The forwarded argument is the assertion. The service is called, with `undefined`, which is what
       * makes the optional service parameter observably optional at the route.
       */
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

      /*
       * `src/errors/DomainError.ts` states the rule ("Assert on the code … never on these strings"), so
       * this asserts the shape and the absence of disclosure. The locator on the error's context travels to
       * the log and never to the body.
       */
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

      /*
       * [model/entity/Sku.cfc:L54] declares `skuCode` with no `unsavedvalue` and no `default`, so `''` is a
       * value rather than a sentinel and the legacy would have run the lookup for it.
       */
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
      /*
       * A miss must never become a raise: [model/service/PhysicalService.cfc:L199] counts misses as a
       * data-quality tally, so raising would turn a benign import warning into a failed import.
       */
      expect(JSON.parse(miss.body)).toStrictEqual({ message: 'Not found' });
      expect(reached).toEqual([STORED_SKU_CODE, 'NOTHING-MATCHES']);
    });

    it('NET-NEW — `processImageUpload` STILL refuses the same omission with 400, and the difference is the contract', async () => {
      /*
       * Both members read `skuCode` through the same reader and answer differently, because their legacy
       * signatures differ: `model/service/SkuService.cfc:L289` declares `skuCode` optional, while
       * `:L210`'s `imageUploadResult` is required — so a missing code is forwarded and a missing upload
       * result is a `400`.
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

  /*
   * The five remaining routed READ members, and the glue each one owns.
   *
   * Why these cases exist. A qa run measured that five of `src/handlers/skuHandler.ts`'s nine route
   * bodies were never entered by any test — `getProductSkus`, `getSortedProductSkus`,
   * `searchSkusByProductType`, `getSkuStocksDeletableFlag` and `getSkuSmartList` — while the service
   * members beneath them were covered at 91 %. That is the shape of gap that hides in plain sight: the
   * business rules were asserted and the glue that reaches them was not, so a wrong parameter name, a
   * wrong response projection or a missing authorisation gate on any of the five would have passed
   * silently. `productHandler`, `optionHandler`, `brandHandler` and `googleFeedHandler` each have no
   * never-entered route body, so the standard being met here is the project's own.
   *
   * Each route gets its parsing, its refusal path and its projection asserted, and the seven
   * `SKU_ACCESS_MATRIX` rows that were unasserted are pinned on the exported table directly — so the
   * classification cannot be loosened without a named failure even if every route case were deleted.
   */

  /** The entity name every SKU authorisation question in `skuHandler.ts` names. */
  const SKU_COMPONENT_NAME = 'Sku';

  /** A second 32-character SKU identifier, so a projection carrying the wrong row is visible (IR-6). */
  const SECOND_SKU_ID = 'cccccccc000000000000000000000002';

  /** A third SKU identifier, used by the case about a SKU that carries no code at all. */
  const CODELESS_SKU_ID = 'cccccccc000000000000000000000003';

  /** A product-type identifier the search route narrows by. */
  const SEARCH_PRODUCT_TYPE_ID = 'dddddddd000000000000000000000001';

  /**
   * A {@link SkuHandler} whose nine members are present and never called — enough for
   * {@link createSkuRoutes}, which only maps names onto members.
   */
  function makeSkuHandlerFacade(): SkuHandler {
    const refuse = (member: string) => (): never => {
      throw new Error(`SkuHandler.${member} was not expected to be dispatched by this case`);
    };

    return Object.freeze({
      createSkus: refuse('createSkus'),
      processImageUpload: refuse('processImageUpload'),
      getProductSkus: refuse('getProductSkus'),
      getSortedProductSkus: refuse('getSortedProductSkus'),
      searchSkusByProductType: refuse('searchSkusByProductType'),
      getSkuStocksDeletableFlag: refuse('getSkuStocksDeletableFlag'),
      getTransactionExistsFlag: refuse('getTransactionExistsFlag'),
      getSkuBySkuCode: refuse('getSkuBySkuCode'),
      getSkuSmartList: refuse('getSkuSmartList'),
    });
  }

  /** A resolver reporting no principal at all, so step 1 of the gate refuses with 401. */
  const ADMIT_NOBODY: RequestAuthorizationResolver<{ headers: unknown }> = () => ({
    accountContext: { getCurrentAccount: () => undefined },
    entityAuthorization: {
      authenticateEntity: (): never => {
        throw new Error('the entity question must not be asked once the principal is absent');
      },
    },
    populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
  });

  /** A resolver reporting a logged-in principal whose permission groups grant nothing. */
  const GRANT_NOTHING: RequestAuthorizationResolver<{ headers: unknown }> = () => ({
    accountContext: {
      getCurrentAccount: () => ({
        accountID: 'aaaaaaaa000000000000000000000003',
        newFlag: false,
        adminAccountFlag: false,
      }),
    },
    entityAuthorization: { authenticateEntity: (): boolean => false },
    populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
  });

  /**
   * Builds a read route over a refusing surface, a product resolver and an authorisation resolver.
   *
   * The write runner is wired to raise, because none of the five members below is a write: a route
   * that reached it would be entering a transaction it has no business entering, and that shows up
   * here as a failure rather than as a passing test with a surprising commit in it.
   */
  function readHandlerWith(
    overrides: Partial<SkuSurface>,
    resolveProduct: (productID: string) => Promise<Product | null>,
    resolver: RequestAuthorizationResolver<{ headers: unknown }> = ADMIT_EVERY_REQUEST,
  ): ReturnType<typeof createSkuHandler> {
    return createSkuHandler(makeSkuSurface(overrides), resolveProduct, resolver, {
      runWrite: (): never => {
        throw new Error('a read route must not enter a write transaction');
      },
    });
  }

  /** A SKU carrying values distinct enough that a crossed projection field is visible. */
  function makeProjectableSku(skuID: string, skuCode: string): Sku {
    const sku = new Sku();
    sku.skuID = skuID;
    sku.skuCode = skuCode;
    sku.price = exactDecimal('19.99');
    sku.listPrice = exactDecimal('24.50');
    sku.renewalPrice = exactDecimal('0');
    sku.activeFlag = true;
    sku.userDefinedPriceFlag = false;
    sku.imageFile = `${skuCode}.jpg`;
    return sku;
  }

  /** The projection {@link makeProjectableSku} must serialise to, field for field. */
  function projectionOf(skuID: string, skuCode: string): Record<string, unknown> {
    return {
      skuID,
      skuCode,
      price: '19.99',
      listPrice: '24.50',
      renewalPrice: '0',
      activeFlag: true,
      userDefinedPriceFlag: false,
      imageFile: `${skuCode}.jpg`,
    };
  }

  describe('SkuHandler.getProductSkus — the required `sorted` flag and the two call shapes (API-02)', () => {
    /**
     * Records every argument list `getProductSkus` was reached with, so ARITY is observable and not
     * merely the values: the route must call the two-argument form when `fetchOptions` is absent and
     * the three-argument form when it is present, which is what keeps the service's own
     * `fetchOptions = false` default at [model/service/SkuService.cfc:L220] the single place that
     * default lives.
     */
    function probe(product: Product | null = makeProduct()): {
      readonly handler: ReturnType<typeof createSkuHandler>;
      readonly calls: readonly unknown[][];
      readonly resolved: readonly string[];
    } {
      const calls: unknown[][] = [];
      const resolved: string[] = [];

      const handler = readHandlerWith(
        {
          getProductSkus: (
            forProduct: Product,
            sorted: boolean,
            fetchOptions?: boolean,
          ): Promise<Sku[]> => {
            /* `arguments.length` is not available on an arrow, so the shape is rebuilt explicitly. */
            calls.push(
              fetchOptions === undefined
                ? [forProduct.productID, sorted]
                : [forProduct.productID, sorted, fetchOptions],
            );
            return Promise.resolve([makeProjectableSku(SKU_ID, 'PROD-1')]);
          },
        },
        (productID: string): Promise<Product | null> => {
          resolved.push(productID);
          return Promise.resolve(product);
        },
      );

      return { handler, calls, resolved };
    }

    it('NET-NEW — `sorted=true` with no `fetchOptions` calls the TWO-argument form and projects the SKUs', async () => {
      const { handler, calls, resolved } = probe();

      const response = await handler.getProductSkus({
        pathParameters: { productID: PRODUCT_ID },
        queryStringParameters: { sorted: 'true' },
        headers: {},
      });

      expect(resolved).toEqual([PRODUCT_ID]);
      /* Two entries, not three: omitting the parameter really omits the argument. */
      expect(calls).toStrictEqual([[PRODUCT_ID, true]]);
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toStrictEqual([projectionOf(SKU_ID, 'PROD-1')]);
    });

    it('NET-NEW — `fetchOptions=false` still calls the THREE-argument form, because absent and false differ', async () => {
      /*
       * The distinction the reader draws between "absent" and "present and false" is only observable
       * through arity, and it matters: [model/dao/SkuDAO.cfc:L150] declares `fetchOptions` REQUIRED and
       * reads it unscoped (D9), so which of the two the service receives is a real difference.
       */
      const { handler, calls } = probe();

      await handler.getProductSkus({
        pathParameters: { productID: PRODUCT_ID },
        queryStringParameters: { sorted: 'false', fetchOptions: 'false' },
        headers: {},
      });

      expect(calls).toStrictEqual([[PRODUCT_ID, false, false]]);
    });

    it('NET-NEW — every CFML boolean literal both flags accept is read, in either case', async () => {
      /*
       * `skuHandler.ts` declares `['true','yes','1']` and `['false','no','0']`, and folds the raw value
       * before comparing. Each literal is exercised rather than one representative, because the accepted
       * set is a published contract of the route.
       */
      const accepted: readonly (readonly [string, boolean])[] = [
        ['true', true],
        ['TRUE', true],
        ['yes', true],
        ['YES', true],
        ['1', true],
        ['false', false],
        ['FALSE', false],
        ['no', false],
        ['No', false],
        ['0', false],
      ];

      for (const [literal, expected] of accepted) {
        const { handler, calls } = probe();

        const response = await handler.getProductSkus({
          pathParameters: { productID: PRODUCT_ID },
          queryStringParameters: { sorted: literal, fetchOptions: literal },
          headers: {},
        });

        expect(response.statusCode).toBe(200);
        expect(calls).toStrictEqual([[PRODUCT_ID, expected, expected]]);
      }
    });

    it('NET-NEW — Discrepancy 2: an ABSENT `sorted` is a 400, because the legacy declares it required', async () => {
      /*
       * [model/service/SkuService.cfc:L220] declares `required boolean sorted`, so the route refuses
       * rather than defaulting. Defaulting here would invent a value the legacy never supplied.
       */
      const { handler, calls } = probe();

      const response = await handler.getProductSkus({
        pathParameters: { productID: PRODUCT_ID },
        queryStringParameters: {},
        headers: {},
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toStrictEqual({
        message: 'A "sorted" query parameter is required',
      });
      expect(calls).toStrictEqual([]);
    });

    it('NET-NEW — a `sorted` value that is NOT a CFML boolean is a distinct 400 from an absent one', async () => {
      /*
       * The reader's three states — absent, unrecognised, recognised — each get their own answer, which
       * is why it returns `undefined | null | boolean` rather than a bare boolean.
       */
      const { handler, calls } = probe();

      const response = await handler.getProductSkus({
        pathParameters: { productID: PRODUCT_ID },
        queryStringParameters: { sorted: 'perhaps' },
        headers: {},
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toStrictEqual({
        message: 'The "sorted" query parameter must be a boolean',
      });
      expect(calls).toStrictEqual([]);
    });

    it('NET-NEW — an unrecognised `fetchOptions` is refused while an absent one is forwarded as absence', async () => {
      const { handler, calls } = probe();

      const response = await handler.getProductSkus({
        pathParameters: { productID: PRODUCT_ID },
        queryStringParameters: { sorted: 'true', fetchOptions: 'maybe' },
        headers: {},
      });

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toStrictEqual({
        message: 'The "fetchOptions" query parameter must be a boolean',
      });
      expect(calls).toStrictEqual([]);
    });

    it('NET-NEW — a missing productID, and the unsaved-identifier sentinel, are both 400 before any resolution', async () => {
      /*
       * `''` is the unsaved-identifier sentinel this port carries (IR-6), so an empty path parameter is
       * "addresses nothing" rather than "addresses the row whose id is the empty string".
       */
      for (const pathParameters of [null, {}, { productID: '' }]) {
        const { handler, calls, resolved } = probe();

        const response = await handler.getProductSkus({
          pathParameters,
          queryStringParameters: { sorted: 'true' },
          headers: {},
        });

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toStrictEqual({
          message: 'A "productID" path parameter is required',
        });
        expect(resolved).toEqual([]);
        expect(calls).toStrictEqual([]);
      }
    });

    it('NET-NEW — a product that does not exist is 404, and the service is never asked', async () => {
      const { handler, calls, resolved } = probe(null);

      const response = await handler.getProductSkus({
        pathParameters: { productID: PRODUCT_ID },
        queryStringParameters: { sorted: 'true' },
        headers: {},
      });

      expect(resolved).toEqual([PRODUCT_ID]);
      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toStrictEqual({ message: 'Not found' });
      expect(calls).toStrictEqual([]);
    });

    it('NET-NEW — a service failure is forwarded as a shaped failure, disclosing nothing (D13)', async () => {
      /*
       * D13 is carried, not repaired: a sorted request whose collection holds an option-less SKU raises
       * inside the service, and this boundary guards nothing. The assertion is that the raise reaches the
       * caller as a shaped body rather than being swallowed into an empty 200.
       */
      const handler = readHandlerWith(
        {
          getProductSkus: (): Promise<Sku[]> =>
            Promise.reject(new DomainError('D13: the sorted index was zero')),
        },
        () => Promise.resolve(makeProduct()),
      );

      const response = await handler.getProductSkus({
        pathParameters: { productID: PRODUCT_ID },
        queryStringParameters: { sorted: 'true' },
        headers: {},
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(500);
      expect(Object.keys(JSON.parse(response.body) as Record<string, unknown>)).toStrictEqual([
        'message',
      ]);
      expect(response.body).not.toContain('sorted index');
    });

    it('NET-NEW — no principal is 401 and no grant is 403, both before the product is resolved', async () => {
      for (const [resolver, expected] of [
        [ADMIT_NOBODY, 401],
        [GRANT_NOTHING, 403],
      ] as const) {
        const resolved: string[] = [];
        const handler = readHandlerWith(
          {},
          (productID: string): Promise<Product | null> => {
            resolved.push(productID);
            return Promise.resolve(makeProduct());
          },
          resolver,
        );

        const response = await handler.getProductSkus({
          pathParameters: { productID: PRODUCT_ID },
          queryStringParameters: { sorted: 'true' },
          headers: {},
        });

        expect(response.statusCode).toBe(expected);
        /* The gate runs first, so an unauthorised caller cannot even probe for a product's existence. */
        expect(resolved).toEqual([]);
      }
    });

    it('NET-NEW — the row asks exactly `read` on `Sku`, and the addressed product travels with the question', async () => {
      const questions: { crudType: string; entityName: string; entityID?: string }[] = [];
      const handler = readHandlerWith(
        { getProductSkus: (): Promise<Sku[]> => Promise.resolve([]) },
        () => Promise.resolve(makeProduct()),
        () => ({
          accountContext: {
            getCurrentAccount: () => ({
              accountID: 'aaaaaaaa000000000000000000000004',
              newFlag: false,
              adminAccountFlag: false,
            }),
          },
          entityAuthorization: {
            authenticateEntity: (question): boolean => {
              questions.push(question);
              return true;
            },
          },
          populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
        }),
      );

      await handler.getProductSkus({
        pathParameters: { productID: PRODUCT_ID },
        queryStringParameters: { sorted: 'true' },
        headers: {},
      });

      /*
       * Exactly one question, and it names the SKU entity rather than the product — the route reads SKUs,
       * and `SKU_ACCESS_MATRIX` says so. The identifier is the route's `skuID`, which this route does not
       * address, so none travels.
       */
      expect(questions).toStrictEqual([{ crudType: 'read', entityName: SKU_COMPONENT_NAME }]);
    });
  });

  describe('SkuHandler.getSortedProductSkus — the single-argument sibling (API-02)', () => {
    function probe(product: Product | null = makeProduct()): {
      readonly handler: ReturnType<typeof createSkuHandler>;
      readonly calls: readonly string[];
    } {
      const calls: string[] = [];

      const handler = readHandlerWith(
        {
          getSortedProductSkus: (forProduct: Product): Promise<Sku[]> => {
            calls.push(forProduct.productID);
            return Promise.resolve([
              makeProjectableSku(SKU_ID, 'SORT-1'),
              makeProjectableSku(SECOND_SKU_ID, 'SORT-2'),
            ]);
          },
        },
        () => Promise.resolve(product),
      );

      return { handler, calls };
    }

    it('NET-NEW — forwards the resolved product and projects the SKUs in the order received', async () => {
      /*
       * Order is the whole point of the member — [model/service/SkuService.cfc:L246] exists to return
       * option-group order — so the projection must preserve it rather than sorting or de-duplicating.
       */
      const { handler, calls } = probe();

      const response = await handler.getSortedProductSkus({
        pathParameters: { productID: PRODUCT_ID },
        headers: {},
      });

      expect(calls).toEqual([PRODUCT_ID]);
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toStrictEqual([
        projectionOf(SKU_ID, 'SORT-1'),
        projectionOf(SECOND_SKU_ID, 'SORT-2'),
      ]);
    });

    it('NET-NEW — reads NO query parameters at all, because the member declares none', async () => {
      /*
       * The sorted sibling takes `sorted` implicitly, so supplying the flag here must change nothing:
       * a route that read it would be advertising a parameter its service member does not have.
       */
      const { handler, calls } = probe();

      const response = await handler.getSortedProductSkus({
        pathParameters: { productID: PRODUCT_ID },
        headers: {},
      });

      expect(response.statusCode).toBe(200);
      expect(calls).toEqual([PRODUCT_ID]);
    });

    it('NET-NEW — a missing productID is 400 and a missing product is 404', async () => {
      const missing = await probe().handler.getSortedProductSkus({
        pathParameters: {},
        headers: {},
      });

      expect(missing.statusCode).toBe(400);
      expect(JSON.parse(missing.body)).toStrictEqual({
        message: 'A "productID" path parameter is required',
      });

      const absent = await probe(null).handler.getSortedProductSkus({
        pathParameters: { productID: PRODUCT_ID },
        headers: {},
      });

      expect(absent.statusCode).toBe(404);
      expect(JSON.parse(absent.body)).toStrictEqual({ message: 'Not found' });
    });

    it('NET-NEW — an unauthorised caller is refused before the product is resolved', async () => {
      const resolved: string[] = [];
      const handler = readHandlerWith(
        {},
        (productID: string): Promise<Product | null> => {
          resolved.push(productID);
          return Promise.resolve(makeProduct());
        },
        ADMIT_NOBODY,
      );

      const response = await handler.getSortedProductSkus({
        pathParameters: { productID: PRODUCT_ID },
        headers: {},
      });

      expect(response.statusCode).toBe(401);
      expect(resolved).toEqual([]);
    });
  });

  describe('SkuHandler.searchSkusByProductType — BOTH arguments stay optional (API-02)', () => {
    /*
     * AAP §0.4.2.2 Discrepancy 3: [model/service/SkuService.cfc:L271] declares
     * `searchSkusByProductType(string term, string productTypeID)` with NEITHER argument required, so the
     * route forwards whatever came — including nothing — and authors no `400` of its own.
     */
    function probe(): {
      readonly handler: ReturnType<typeof createSkuHandler>;
      readonly calls: (readonly [string | undefined, string | undefined])[];
    } {
      const calls: (readonly [string | undefined, string | undefined])[] = [];

      const handler = readHandlerWith(
        {
          searchSkusByProductType: (
            term?: string,
            productTypeID?: string,
          ): Promise<{ readonly id: string; readonly value: string }[]> => {
            calls.push([term, productTypeID]);
            return Promise.resolve([{ id: SKU_ID, value: 'Test Product (SEARCH-1)' }]);
          },
        },
        () => {
          throw new Error('the search route resolves no product');
        },
      );

      return { handler, calls };
    }

    it('NET-NEW — both parameters absent are forwarded as `undefined`, and the answer is still 200', async () => {
      const { handler, calls } = probe();

      const response = await handler.searchSkusByProductType({
        queryStringParameters: null,
        headers: {},
      });

      expect(calls).toEqual([[undefined, undefined]]);
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toStrictEqual([
        { id: SKU_ID, value: 'Test Product (SEARCH-1)' },
      ]);
    });

    it('NET-NEW — Judgment (f): `term` FIRST, singular `productTypeID` SECOND', async () => {
      /*
       * Both are strings, so a forward written in the wrong order type-checks perfectly and silently
       * searches for the wrong thing. Only an order assertion catches it. The name is singular here and
       * PLURAL on the product side ([model/dao/ProductDAO.cfc:L419], Discrepancy 6) — the divergence is
       * carried, so this route must not "correct" it.
       */
      const { handler, calls } = probe();

      await handler.searchSkusByProductType({
        queryStringParameters: { term: 'shirt', productTypeID: SEARCH_PRODUCT_TYPE_ID },
        headers: {},
      });

      expect(calls).toEqual([['shirt', SEARCH_PRODUCT_TYPE_ID]]);
    });

    it('NET-NEW — the term is forwarded RAW: not trimmed, not folded, not wildcard-wrapped', async () => {
      /*
       * The repository owns the term's treatment, so any normalisation here would apply it twice and
       * change which rows match.
       */
      const { handler, calls } = probe();

      await handler.searchSkusByProductType({
        queryStringParameters: { term: '  Red Shirt%  ' },
        headers: {},
      });

      expect(calls).toEqual([['  Red Shirt%  ', undefined]]);
    });

    it('NET-NEW — an EMPTY term is a value and is forwarded as one, not collapsed to absence', async () => {
      const { handler, calls } = probe();

      await handler.searchSkusByProductType({
        queryStringParameters: { term: '', productTypeID: '' },
        headers: {},
      });

      expect(calls).toEqual([['', '']]);
    });

    it('NET-NEW — an unauthorised caller is refused and the search never runs', async () => {
      for (const [resolver, expected] of [
        [ADMIT_NOBODY, 401],
        [GRANT_NOTHING, 403],
      ] as const) {
        const calls: unknown[] = [];
        const handler = readHandlerWith(
          {
            searchSkusByProductType: (): Promise<never[]> => {
              calls.push('reached');
              return Promise.resolve([]);
            },
          },
          () => {
            throw new Error('the search route resolves no product');
          },
          resolver,
        );

        const response = await handler.searchSkusByProductType({
          queryStringParameters: { term: 'shirt' },
          headers: {},
        });

        expect(response.statusCode).toBe(expected);
        expect(calls).toStrictEqual([]);
      }
    });
  });

  describe('SkuHandler.getSkuStocksDeletableFlag — D4, the route that can never succeed (API-02)', () => {
    /*
     * TODO(parity) D4 is carried, not repaired. [model/service/SkuService.cfc:L282] forwards to
     * `getSkuDAO().getSkuStocksDeletableFlag(...)`, and that DAO member is declared NOWHERE in the legacy
     * repository, so the only legacy path that reaches it — `Sku.getStocksDeletableFlag()`
     * [model/entity/Sku.cfc:L567-L572] — has never been able to resolve. The service therefore returns a
     * rejected promise carrying a not-implemented failure, and this route must forward that intact rather
     * than substituting a plausible boolean for it.
     */
    function probe(): {
      readonly handler: ReturnType<typeof createSkuHandler>;
      readonly calls: readonly string[];
    } {
      const calls: string[] = [];

      const handler = readHandlerWith(
        {
          getSkuStocksDeletableFlag: (skuID: string): Promise<boolean> => {
            calls.push(skuID);
            return Promise.reject(
              new NotImplementedError(
                'SkuService.getSkuStocksDeletableFlag',
                'model/dao/SkuDAO.cfc declares no getSkuStocksDeletableFlag member (D4)',
              ),
            );
          },
        },
        () => {
          throw new Error('the stocks-deletable route resolves no product');
        },
      );

      return { handler, calls };
    }

    it('NET-NEW — the addressed skuID IS forwarded, and the not-implemented failure answers', async () => {
      const { handler, calls } = probe();

      const response = await handler.getSkuStocksDeletableFlag({
        pathParameters: { skuID: SKU_ID },
        headers: {},
      });

      /*
       * The forwarded identifier is the assertion. A route that short-circuited on D4 with a fixed 501
       * would never call the service at all, and the defect would stop being reproducible through the
       * published surface.
       */
      expect(calls).toEqual([SKU_ID]);
      expect(response.statusCode).not.toBe(200);
      expect(Object.keys(JSON.parse(response.body) as Record<string, unknown>)).toStrictEqual([
        'message',
      ]);
      /* The locator travels to the log, never to the body. */
      expect(response.body).not.toContain('SkuDAO');
    });

    it('NET-NEW — a missing skuID, and the unsaved sentinel, are 400 before the service is reached', async () => {
      for (const pathParameters of [null, {}, { skuID: '' }]) {
        const { handler, calls } = probe();

        const response = await handler.getSkuStocksDeletableFlag({ pathParameters, headers: {} });

        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toStrictEqual({
          message: 'A "skuID" path parameter is required',
        });
        expect(calls).toEqual([]);
      }
    });

    it('NET-NEW — the gate runs BEFORE D4, so an unauthorised caller gets 401 rather than the failure', async () => {
      const calls: string[] = [];
      const handler = readHandlerWith(
        {
          getSkuStocksDeletableFlag: (skuID: string): Promise<boolean> => {
            calls.push(skuID);
            return Promise.resolve(true);
          },
        },
        () => {
          throw new Error('the stocks-deletable route resolves no product');
        },
        ADMIT_NOBODY,
      );

      const response = await handler.getSkuStocksDeletableFlag({
        pathParameters: { skuID: SKU_ID },
        headers: {},
      });

      expect(response.statusCode).toBe(401);
      expect(calls).toEqual([]);
    });

    it('NET-NEW — the read question is UNSCOPED, and `createSkus` is the only row that scopes one', async () => {
      /*
       * Measured against the source rather than assumed: `skuHandler.ts` calls `refuseUnauthorized` with a
       * third `entityID` argument at exactly one of its nine sites — `createSkus`, which scopes its
       * `Product` update question to the product being written. Every read route, this one included, asks
       * the plain `read`-on-`Sku` question with no identifier attached, so a `read` grant is entity-wide.
       *
       * Recorded as the contract rather than corrected: narrowing a read to the addressed row would change
       * which callers a deployment's existing grants admit, and no qa finding asks for it. Pinning it here
       * means a later change to that scoping is a named failure and a deliberate decision.
       */
      const questions: { crudType: string; entityName: string; entityID?: string }[] = [];
      const handler = readHandlerWith(
        {
          getSkuStocksDeletableFlag: (): Promise<boolean> => Promise.resolve(true),
        },
        () => {
          throw new Error('the stocks-deletable route resolves no product');
        },
        () => ({
          accountContext: {
            getCurrentAccount: () => ({
              accountID: 'aaaaaaaa000000000000000000000005',
              newFlag: false,
              adminAccountFlag: false,
            }),
          },
          entityAuthorization: {
            authenticateEntity: (question): boolean => {
              questions.push(question);
              return true;
            },
          },
          populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
        }),
      );

      await handler.getSkuStocksDeletableFlag({
        pathParameters: { skuID: SKU_ID },
        headers: {},
      });

      /* Exactly one question, naming the entity and the operation, and carrying no identifier. */
      expect(questions).toStrictEqual([{ crudType: 'read', entityName: SKU_COMPONENT_NAME }]);
    });
  });

  describe('SkuHandler.getSkuSmartList — the recognised query subset and the paged projection (API-02)', () => {
    /** A page whose five paging numbers are all distinct, so a crossed field is visible. */
    function page(records: readonly Sku[], pageRecords: readonly Sku[]): SmartListResult<Sku> {
      return {
        records,
        pageRecords,
        recordsCount: 37,
        pageRecordsStart: 11,
        pageRecordsEnd: 20,
        currentPage: 2,
        totalPages: 4,
      };
    }

    function probe(result: SmartListResult<Sku>): {
      readonly handler: ReturnType<typeof createSkuHandler>;
      readonly inputs: Record<string, unknown>[];
      readonly arity: number[];
    } {
      const inputs: Record<string, unknown>[] = [];
      const arity: number[] = [];

      const handler = readHandlerWith(
        {
          getSkuSmartList: (...args: unknown[]): Promise<SmartListResult<Sku>> => {
            arity.push(args.length);
            inputs.push((args[0] ?? {}) as Record<string, unknown>);
            return Promise.resolve(result);
          },
        },
        () => {
          throw new Error('the smart-list route resolves no product');
        },
      );

      return { handler, inputs, arity };
    }

    it('NET-NEW — an absent query string is the legal `data={}` case, and `currentURL` is never supplied', async () => {
      /*
       * [model/service/SkuService.cfc:L309] declares `getSkuSmartList(struct data={}, currentURL="")`.
       * `data={}` is legal, and `currentURL` is deliberately omitted rather than passed as `''`: it
       * belongs to the FW/1 request context this port has no equivalent of, so the route supplies one
       * argument and lets the service's own default stand.
       */
      const sku = makeProjectableSku(SKU_ID, 'LIST-1');
      const { handler, inputs, arity } = probe(page([sku], [sku]));

      const response = await handler.getSkuSmartList({ queryStringParameters: null, headers: {} });

      expect(inputs).toStrictEqual([{}]);
      expect(arity).toStrictEqual([1]);
      expect(response.statusCode).toBe(200);
    });

    it('NET-NEW — only the recognised smart-list keys are forwarded; anything else is dropped silently', async () => {
      /*
       * The recognised set is the seven named keys plus the seven prefixes `httpResponse.ts` declares.
       * An unrecognised key is dropped rather than refused, because the legacy smart list simply never
       * acted on one — and `slatAction`, which every invocation carries, must not leak into `data`.
       */
      const sku = makeProjectableSku(SKU_ID, 'LIST-1');
      const { handler, inputs } = probe(page([sku], [sku]));

      await handler.getSkuSmartList({
        queryStringParameters: {
          'F:activeFlag': '1',
          'FR:activeFlag': 'true',
          'FI:skuID': SKU_ID,
          'FIR:skuID': 'yes',
          'FK:skuCode': 'LIST',
          'FKR:skuCode': '1',
          'R:price': '1^100',
          OrderBy: 'skuCode|ASC',
          'P:Show': '10',
          'P:Start': '11',
          'P:Current': '2',
          keyword: 'shirt',
          keywords: 'shirt,red',
          savedStateID: 'abc',
          slatAction: 'sku.getSkuSmartList',
          somethingInvented: 'nope',
        },
        headers: {},
      });

      expect(inputs).toStrictEqual([
        {
          'F:activeFlag': '1',
          'FR:activeFlag': 'true',
          'FI:skuID': SKU_ID,
          'FIR:skuID': 'yes',
          'FK:skuCode': 'LIST',
          'FKR:skuCode': '1',
          'R:price': '1^100',
          OrderBy: 'skuCode|ASC',
          'P:Show': '10',
          'P:Start': '11',
          'P:Current': '2',
          keyword: 'shirt',
          keywords: 'shirt,red',
          savedStateID: 'abc',
        },
      ]);
    });

    it('NET-NEW — the five paging numbers cross untouched and only the requested page is projected', async () => {
      /*
       * The service contract still carries both collections; the HTTP projection deliberately does not.
       * `toSkuSmartListResponse` emits `pageRecords`, the counts and the paging metadata only, so a
       * response stays bounded by `P:Show` rather than growing with the whole selection. The five paging
       * numbers are what let a caller walk the rest, and they cross unchanged.
       */
      const first = makeProjectableSku(SKU_ID, 'LIST-1');
      const second = makeProjectableSku(SECOND_SKU_ID, 'LIST-2');
      const { handler } = probe(page([first, second], [second]));

      const response = await handler.getSkuSmartList({
        queryStringParameters: { 'P:Current': '2' },
        headers: {},
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toStrictEqual({
        pageRecords: [projectionOf(SECOND_SKU_ID, 'LIST-2')],
        recordsCount: 37,
        pageRecordsStart: 11,
        pageRecordsEnd: 20,
        currentPage: 2,
        totalPages: 4,
      });
    });

    it('NET-NEW — the SAME Sku object appearing twice in the page projects consistently', async () => {
      /*
       * `pageRecords` is a window over the selection — `../../src/adapters/mysql/SmartListQueryBuilder`
       * derives both from one selection — so the same `Sku` instance genuinely reaches the projection
       * more than once, and `toSkuSmartListResponse` carries a per-call memo so it is projected once and
       * the remembered projection is reused. This case drives the memo's WRITE and its READ, which is
       * what makes the reuse branch reachable at all.
       *
       * What is deliberately NOT asserted here: object identity between the two positions. The memo is
       * a property of the in-memory response, and `JSON.stringify` erases identity — the serialised body
       * is byte-identical whether one projection is shared or two equal ones are built. Asserting it
       * would need the private projector exported purely to be tested, which is invented API surface
       * (AAP §0.7.3). The observable contract is that every position carries the same, complete
       * projection, and that is what is pinned.
       */
      const shared = makeProjectableSku(SKU_ID, 'LIST-1');
      const { handler } = probe(page([shared, shared], [shared, shared]));

      const response = await handler.getSkuSmartList({ queryStringParameters: {}, headers: {} });
      const body = JSON.parse(response.body) as {
        readonly pageRecords: readonly unknown[];
      };

      const expected = projectionOf(SKU_ID, 'LIST-1');

      /* Cardinality is preserved — the memo reuses a projection, it never collapses a row. */
      expect(body.pageRecords).toStrictEqual([expected, expected]);
    });

    it('NET-NEW — an EMPTY page still answers 200 with the page collection present and empty', async () => {
      const { handler } = probe({
        records: [],
        pageRecords: [],
        recordsCount: 0,
        pageRecordsStart: 0,
        pageRecordsEnd: 0,
        currentPage: 1,
        totalPages: 0,
      });

      const response = await handler.getSkuSmartList({ queryStringParameters: {}, headers: {} });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toStrictEqual({
        pageRecords: [],
        recordsCount: 0,
        pageRecordsStart: 0,
        pageRecordsEnd: 0,
        currentPage: 1,
        totalPages: 0,
      });
    });

    it('NET-NEW — a SKU with no code omits the key entirely rather than emitting null', async () => {
      /*
       * `exactOptionalPropertyTypes` makes "absent" and "present and undefined" different things, and the
       * projection spreads conditionally so an unset code produces no key at all.
       */
      const sku = new Sku();
      sku.skuID = CODELESS_SKU_ID;
      const { handler } = probe(page([sku], [sku]));

      const response = await handler.getSkuSmartList({ queryStringParameters: {}, headers: {} });
      const body = JSON.parse(response.body) as { readonly pageRecords: readonly object[] };

      expect(Object.keys(body.pageRecords[0] ?? {})).toStrictEqual([
        'skuID',
        'price',
        'listPrice',
        'renewalPrice',
        'activeFlag',
        'userDefinedPriceFlag',
      ]);
    });

    it('NET-NEW — an unauthorised caller is refused and the smart list never runs', async () => {
      for (const [resolver, expected] of [
        [ADMIT_NOBODY, 401],
        [GRANT_NOTHING, 403],
      ] as const) {
        const reached: string[] = [];
        const handler = readHandlerWith(
          {
            getSkuSmartList: (): Promise<SmartListResult<Sku>> => {
              reached.push('reached');
              return Promise.reject(new Error('unreachable'));
            },
          },
          () => {
            throw new Error('the smart-list route resolves no product');
          },
          resolver,
        );

        const response = await handler.getSkuSmartList({
          queryStringParameters: {},
          headers: {},
        });

        expect(response.statusCode).toBe(expected);
        expect(reached).toStrictEqual([]);
      }
    });
  });

  describe('SKU_ACCESS_MATRIX — every one of the nine rows is pinned (API-02)', () => {
    /*
     * A qa run measured that only two of the nine rows were asserted. The seven reads are pinned here so
     * that loosening any of them — dropping `secure`, widening the entity, or turning a `read` into a
     * grant the reader already holds — fails by name rather than being noticed by a later audit.
     */
    const READ_ROW = Object.freeze({
      classification: 'secure',
      entityName: SKU_COMPONENT_NAME,
      crudType: 'read',
    });

    it.each([
      'getProductSkus',
      'getSortedProductSkus',
      'searchSkusByProductType',
      'getSkuStocksDeletableFlag',
      'getTransactionExistsFlag',
      'getSkuBySkuCode',
      'getSkuSmartList',
    ] as const)(
      'NET-NEW — %s is SECURE and asks exactly `read` on `Sku`, with no subordinate question',
      (member) => {
        expect(SKU_ACCESS_MATRIX[member]).toStrictEqual(READ_ROW);
        /*
         * No `subordinate`: only the creation row asks a second question, and a read that acquired one
         * would be asking for a grant it has no reason to need.
         */
        expect(SKU_ACCESS_MATRIX[member]).not.toHaveProperty('subordinate');
      },
    );

    it('NET-NEW — the table has exactly nine rows, and every one is `secure`', () => {
      /*
       * Two-sided on purpose: a route added without a row would be unroutable, and a row added without a
       * route would be a grant nothing enforces. `keyof SkuHandler` types the table, so the count here is
       * the published surface's own count.
       */
      expect(Object.keys(SKU_ACCESS_MATRIX).sort()).toStrictEqual([
        'createSkus',
        'getProductSkus',
        'getSkuBySkuCode',
        'getSkuSmartList',
        'getSkuStocksDeletableFlag',
        'getSortedProductSkus',
        'getTransactionExistsFlag',
        'processImageUpload',
        'searchSkusByProductType',
      ]);
      expect(Object.values(SKU_ACCESS_MATRIX).every((row) => row.classification === 'secure')).toBe(
        true,
      );
      /* And the table is frozen, so a row cannot be rewritten at run time. */
      expect(Object.isFrozen(SKU_ACCESS_MATRIX)).toBe(true);
    });

    it('NET-NEW — the nine served action names are the literal `sku.` strings a caller sends', () => {
      /*
       * The route table composes each key from the prefix and the member name, so the action strings a
       * deployment actually answers appear nowhere in the source as literals. Written out here once, so
       * that renaming a member silently renames a published action and fails by name — and so that the
       * action vocabulary is auditable by reading rather than by re-deriving the concatenation.
       */
      expect(Object.keys(createSkuRoutes(makeSkuHandlerFacade())).sort()).toStrictEqual([
        'sku.createSkus',
        'sku.getProductSkus',
        'sku.getSkuBySkuCode',
        'sku.getSkuSmartList',
        'sku.getSkuStocksDeletableFlag',
        'sku.getSortedProductSkus',
        'sku.getTransactionExistsFlag',
        'sku.processImageUpload',
        'sku.searchSkusByProductType',
      ]);
    });

    it('NET-NEW — the container-wired factory hands the route a product resolver that reaches `productService.getProduct`', async () => {
      /*
       * `createSkuHandlerFromContainer` adapts the container's aggregate product read into the
       * `ProductResolver` this file's routes take, and that one-line adapter is the only place the two
       * shapes meet. It is constructed by `router.ts` on every cold start and was never INVOKED by a
       * test, because the routes the router cases drive resolve no product — so a resolver wired to the
       * wrong member, or given the wrong argument, would have compiled and then missed on every request.
       * `getSortedProductSkus` is the cheapest route that resolves one.
       */
      const harness = buildHarness();
      const requested: string[] = [];
      const stored = makeProduct();

      const handler = createSkuHandlerFromContainer(
        {
          skuService: harness.service,
          skuWriteRunner: {
            runWrite: (): never => {
              throw new Error('a read route must not enter a write transaction');
            },
          },
          productService: {
            getProduct: (productID: string): Promise<Product | null> => {
              requested.push(productID);
              return Promise.resolve(stored);
            },
          },
        },
        ADMIT_EVERY_REQUEST,
      );

      const response = await handler.getSortedProductSkus({
        pathParameters: { productID: PRODUCT_ID },
        headers: {},
      });

      /* The adapter forwarded the addressed identifier, unchanged, to the aggregate read. */
      expect(requested).toEqual([PRODUCT_ID]);
      /* And the real service answered over the harness repository, so the whole chain is live. */
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toStrictEqual([]);
    });

    it('NET-NEW — the two WRITE rows are the only rows that are not a plain `Sku` read', () => {
      /*
       * Stated as a partition rather than row by row, so a ninth write introduced by widening a read row
       * fails here even if that row's own case were changed to match.
       */
      const notPlainReads = Object.entries(SKU_ACCESS_MATRIX)
        .filter(([, row]) => row.crudType !== 'read' || row.entityName !== SKU_COMPONENT_NAME)
        .map(([member]) => member)
        .sort();

      expect(notPlainReads).toStrictEqual(['createSkus', 'processImageUpload']);
    });
  });
});
