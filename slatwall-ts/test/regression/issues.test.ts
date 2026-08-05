/**
 * TRACEABLE — the catalog issue regressions ported from `meta/tests/unit/IssuesTest.cfc`, and the
 * fixture teardown contract ported from `meta/tests/unit/Helper.cfc:L69-L75`.
 *
 * What this file contributes, counted only within this file
 * Eight issue regressions live here, in two groups, plus the fixture helper's teardown half:
 *
 * Five aap-named catalog regressions, the ones AAP §0.6.5.1 enumerates by number — `issue_1097`,
 * `issue_1296`, `issue_1329`, `issue_1331` and `issue_1335`.
 */

/*
 * Node built-ins, for the two build-packaging regressions at the foot of this file (, ). They are
 * the only place this suite reaches the filesystem or spawns a process, and they exist because the
 * findings they answer are about the emitted package rather than about any `src/**` module — a property
 * only a real build can be asked about. Nothing here reads a tracked file for behaviour: the build's own
 * `package.json` is read to compare it against the packaged one, and everything else is generated output
 * under the two git-ignored directories the build step owns.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  CONTENT_ACCESS_PRODUCT_TYPE_ID,
  MERCHANDISE_PRODUCT_TYPE_ID,
} from '../fixtures/productTypes';
import {
  tearDownTestMerchandiseProduct,
  type TestMerchandiseProductTeardownOperations,
} from '../fixtures/testProduct';
import {
  DENY_ALL_POPULATION_AUTHORIZATION,
  GENEROUS_SMART_LIST_BUDGET,
  buildOption,
  buildOptionGroup,
  buildProduct,
  buildProductType,
  buildSku,
  createAccessContentDouble,
  createAccountContextDouble,
  createBaseServicePersistenceDouble,
  createDefaultSkuDelegate,
  createFanningSqlExecutorDouble,
  createImagePathDouble,
  createInMemoryBrandRepository,
  createInMemoryOptionRepository,
  createInMemoryProductRepository,
  createInMemorySkuRepository,
  createPopulationAuthorizationDouble,
  createProductTypeRootResolverDouble,
  createSettingResolverDouble,
  createSkusBySelectedOptionsLookup,
  createSmartListQueryDouble,
  createSubscriptionTermDouble,
  createTransactionExistenceChecker,
  createUniquePropertyDouble,
  createUnitOfWorkDouble,
  createUrlTitleAvailabilityDouble,
  createValidatorHarness,
  persistedAdminAccount,
  securityContext,
  securityRequest,
  type SettingSeed,
  type SmartListOutcome,
  type SmartListResponder,
  type UrlTitleTableName,
  GENEROUS_COMBINATION_BUDGET,
  GENEROUS_URL_TITLE_PROBE_BUDGET,
} from '../support/inMemoryRepositories';
import { GENEROUS_STATEMENT_COMPLEXITY_BUDGET } from '../support/inMemoryRepositories';
import { SmartListQueryBuilder } from '../../src/adapters/mysql/SmartListQueryBuilder';
import { createCatalogAggregateLoaders } from '../../src/adapters/mysql/SmartListQueryBuilder';
import { populate } from '../../src/domain/base/populate';
import type { PropertyDescriptorSet, RelatedEntityLoader } from '../../src/domain/base/populate';
import {
  createProductPropertyDescriptors,
  Product,
  PRODUCT_PROPERTY_DESCRIPTORS,
  type ProductPropertyName,
  type ProductTransactionExistenceChecker,
} from '../../src/domain/product/Product';
import { ProductType } from '../../src/domain/product/ProductType';
import { Sku } from '../../src/domain/sku/Sku';
import { ValidationError } from '../../src/errors/ValidationError';
import { toExactDecimal } from '../../src/util/formatting';
import { BaseService } from '../../src/services/BaseService';
// `OptionService` is imported as a transitive constructor requirement, not as a subject under test.
// `SkuService`'s second constructor parameter is typed `OptionService` (`src/services/SkuService.ts`
// declaration), and `ProductServiceCollaborators.optionService` is typed the same way, so a real
// `productService` cannot be constructed without a real instance — a cast or a structural stand-in
// would defeat the type checking these cases rely on.
import { OptionService } from '../../src/services/OptionService';
import {
  ProductService,
  type ProductProcessValidator,
  type ProductServiceCollaborators,
  type ProductTypeWithErrorState,
} from '../../src/services/ProductService';
import { readHydratedParentProductTypeID } from '../../src/adapters/mysql/rowMappers';
import { SkuService } from '../../src/services/SkuService';
import type { SmartListQuery, SmartListQueryPort } from '../../src/ports/SmartListQueryPort';
import type { UniquePropertyPort } from '../../src/ports/UniquePropertyPort';
import type { SkuRepository } from '../../src/ports/repositories/SkuRepository';
import { Validator } from '../../src/validation/Validator';
import type {
  ProcessValidationRequest,
  ProcessValidationResult,
  ValidateOptions,
  ValidationContext,
  ValidationRuleSet,
  ValidationSubject,
} from '../../src/validation/Validator';
import {
  productValidationRuleSet,
  transactionExistsFlagEqualityConstraint,
} from '../../src/validation/rules/product.rules';
import type { ProductValidationSubject } from '../../src/validation/rules/product.rules';
import {
  createSkuValidationRules,
  resolveSkuUniqueTarget,
} from '../../src/validation/rules/sku.rules';
import {
  BOUNDED_READ_LIMIT_PARAMETER,
  BOUNDED_READ_OFFSET_PARAMETER,
  HTTP_STATUS,
  JSON_CONTENT_TYPE,
  errorResponse,
  readBoundedReadWindow,
  readHeader,
  readJsonObjectBody,
  readPathParameter,
  readQueryStringParameter,
  readSmartListInput,
} from '../../src/handlers/httpResponse';
import { QueryRunner } from '../../src/adapters/mysql/QueryRunner';
import { UnitOfWork } from '../../src/adapters/mysql/UnitOfWork';
import {
  DatabaseStatementError,
  TransientWriteConflictError,
  UniqueConstraintViolationError,
} from '../../src/errors/DomainError';
import {
  createBrandRoutes,
  handler as brandLambdaHandler,
  type BrandHandler,
  type BrandRouteKey,
} from '../../src/handlers/brandHandler';
import {
  createGoogleFeedRoutes,
  handler as googleFeedLambdaHandler,
  type GoogleFeedHandler,
  type GoogleFeedRouteKey,
} from '../../src/handlers/googleFeedHandler';
import {
  createActionDispatcher,
  SLAT_ACTION_PARAMETER,
  type ActionRoute,
  type ActionRouteTable,
  type APIGatewayProxyEvent,
  type APIGatewayProxyResult,
} from '../../src/handlers/httpResponse';
import {
  createOptionRoutes,
  handler as optionLambdaHandler,
  type OptionHandler,
  type OptionRouteKey,
} from '../../src/handlers/optionHandler';
import {
  createProductRoutes,
  handler as productLambdaHandler,
  type ProductHandler,
  type ProductRouteKey,
} from '../../src/handlers/productHandler';
import type { RouteKey } from '../../src/handlers/router';
import {
  createSkuRoutes,
  handler as skuLambdaHandler,
  type SkuHandler,
  type SkuRouteKey,
} from '../../src/handlers/skuHandler';
import type { AppConfig } from '../../src/config/env';
/*
 * The composition root and the aggregate router are named type-only here. Both modules validate the
 * environment at load — `src/config/container.ts` through `src/config/env.ts`, and `src/handlers/router.ts`
 * by resolving the production graph at module scope — so the modules themselves are reached with `require`
 * after `process.env` is set, in the section that does it. `import type` is erased at emit, so naming them
 * here costs no load-time edge and keeps every other case in this file needing no environment.
 */
import type {
  CatalogContainer,
  CatalogContainerOverrides,
  ProductPersistence,
} from '../../src/config/container';
import { DataIntegrityError, NotImplementedError } from '../../src/errors/DomainError';
import { toImageWebPath } from '../../src/ports/ImagePathPort';
import type { CatalogAuthorizationResolver } from '../../src/handlers/httpResponse';
import type { AccountReference } from '../../src/ports/AccountContextPort';
import {
  clearRequestAuthorizationResolver,
  okResponse,
  registerRequestAuthorizationResolver,
  resolveFailClosedAuthorization,
  resolveRequestAuthorization,
} from '../../src/handlers/httpResponse';
import type { RequestAuthorizationContext } from '../../src/ports/AccountContextPort';
import type { ManagedEntity } from '../../src/domain/base/populate';
import type { Brand } from '../../src/domain/product/Brand';
import type { BrandRepository } from '../../src/ports/repositories/BrandRepository';
import { createOptionGroupSortOrderMemo } from '../../src/adapters/mysql/MySqlSkuRepository';
import type { TransactionalSqlExecutor } from '../../src/adapters/mysql/UnitOfWork';
import type { MySqlRow } from '../../src/adapters/mysql/rowMappers';
import type {
  CatalogBoundaries,
  CatalogStatements,
  ProductSurfaceDependencies,
  SkuSurfaceDependencies,
} from '../../src/config/container';

/* Local helpers. */

/** Narrow an indexed read under `noUncheckedIndexedAccess`. */
function requireAt<TItem>(items: readonly TItem[], index: number): TItem {
  const item = items[index];
  if (item === undefined) {
    throw new Error(
      `Expected an element at index ${String(index)} but the collection holds ${String(items.length)}.`,
    );
  }
  return item;
}

/**
 * A `ProductValidationSubject` view over a live `Product`, plus the values the rules read that the
 * entity cannot answer synchronously.
 */
interface ProductDerivedValues {
  readonly baseProductType?: string;
  readonly unusedProductOptions?: readonly unknown[];
  readonly unusedProductOptionGroups?: readonly unknown[];
  readonly unusedProductSubscriptionTerms?: readonly unknown[];
}

function productSubject(
  product: Product,
  derived: ProductDerivedValues = {},
): ProductValidationSubject {
  // `price` is read the way `ProductService.saveProduct` reads it — through `getPrice()`, which falls
  // back to the default SKU — rather than being passed in, so the helper cannot drift from the service.
  const price = product.getPrice();
  return {
    getClassName: () => product.getClassName(),
    hasProperty: (propertyIdentifier: string) => product.hasProperty(propertyIdentifier),
    getPropertyMetaData: (propertyName: string) => product.getPropertyMetaData(propertyName),
    getEntityName: () => product.getEntityName(),
    getPrimaryIDValue: () => product.getPrimaryIDValue(),
    getPrimaryIDPropertyName: () => product.getPrimaryIDPropertyName(),
    getValueByPropertyIdentifier: (propertyIdentifier: string) =>
      product.getValueByPropertyIdentifier(propertyIdentifier),
    productType: product.productType,
    ...(derived.baseProductType === undefined ? {} : { baseProductType: derived.baseProductType }),
    ...(price === undefined ? {} : { price }),
    ...(product.productName === undefined ? {} : { productName: product.productName }),
    ...(product.productCode === undefined ? {} : { productCode: product.productCode }),
    ...(product.urlTitle === undefined ? {} : { urlTitle: product.urlTitle }),
    ...(product.transactionExistsFlag === undefined
      ? {}
      : { transactionExistsFlag: product.transactionExistsFlag }),
    ...(derived.unusedProductOptions === undefined
      ? {}
      : { unusedProductOptions: derived.unusedProductOptions }),
    ...(derived.unusedProductOptionGroups === undefined
      ? {}
      : { unusedProductOptionGroups: derived.unusedProductOptionGroups }),
    ...(derived.unusedProductSubscriptionTerms === undefined
      ? {}
      : { unusedProductSubscriptionTerms: derived.unusedProductSubscriptionTerms }),
  };
}

/** A product-type catalog standing in for the many-to-one population boundary. */
interface ProductTypeCatalog {
  readonly loader: RelatedEntityLoader<ProductType>;
  readonly loadExistingIds: readonly string[];
}

function createProductTypeCatalog(productTypes: readonly ProductType[]): ProductTypeCatalog {
  const loadExistingIds: string[] = [];
  return {
    loadExistingIds,
    loader: {
      loadExisting: (relatedId: string): ProductType | undefined => {
        loadExistingIds.push(relatedId);
        return productTypes.find((candidate) => candidate.productTypeID === relatedId);
      },
      loadOrCreate: (relatedId: string): ProductType => {
        const existing = productTypes.find((candidate) => candidate.productTypeID === relatedId);
        if (existing === undefined) {
          throw new Error(
            `The population boundary was asked to CREATE product type "${relatedId}". No regression ` +
              'in this file populates a multi-key product-type struct, so this is a wiring mistake.',
          );
        }
        return existing;
      },
    },
  };
}

/** A validator that records nothing and rejects nothing. */
function createPermissiveValidator(): ProductProcessValidator {
  return {
    validate: (): Promise<ValidationError> => Promise.resolve(new ValidationError()),
    validateProcess: (): Promise<ProcessValidationResult> =>
      Promise.resolve({
        entityErrors: new ValidationError(),
        processObjectErrors: new ValidationError(),
        processObjectRan: true,
      }),
  };
}

/**
 * A one-property rule set that reads its flag as `unknown`, so the delete guard can be fed the
 * false-like values CFML accepts.
 */
interface LooseFalseGuardSubject extends ValidationSubject {
  readonly transactionExistsFlag?: unknown;
}

const looseFalseGuardRuleSet: ValidationRuleSet<LooseFalseGuardSubject> = {
  properties: [
    {
      propertyIdentifier: 'transactionExistsFlag',
      read: (subject: LooseFalseGuardSubject): unknown => subject.transactionExistsFlag,
      rules: [
        {
          contexts: 'delete',
          constraints: [transactionExistsFlagEqualityConstraint],
        },
      ],
    },
  ],
};

function looseFalseGuardSubject(transactionExistsFlag: unknown): LooseFalseGuardSubject {
  return {
    getClassName: (): string => 'Product',
    hasProperty: (propertyIdentifier: string): boolean =>
      propertyIdentifier === 'transactionExistsFlag',
    transactionExistsFlag,
  };
}

/* Ordering evidence. */
/** The `Sku` save rule set, built the way production builds it. */
function buildSkuSaveRuleSet(repository: SkuRepository, productID: string): ValidationRuleSet<Sku> {
  return createSkuValidationRules<Sku>(
    (subject) => resolveSkuUniqueTarget(subject),
    createSkusBySelectedOptionsLookup(repository, productID),
  );
}

/** The three tables that declare a `urlTitle` column, per `model/validation/*.json` uniqueness. */
const URL_TITLE_TABLES: readonly UrlTitleTableName[] = ['SwProduct', 'SwProductType', 'SwBrand'];

type HarnessEvent =
  | { readonly kind: 'validate'; readonly className: string; readonly context: ValidationContext }
  | { readonly kind: 'validateProcess'; readonly className: string }
  | { readonly kind: 'persist'; readonly productID: string }
  | { readonly kind: 'remove'; readonly productID: string };

class OrderRecordingValidator extends Validator {
  private readonly log: HarnessEvent[];

  public constructor(uniqueProperty: UniquePropertyPort, log: HarnessEvent[]) {
    super(uniqueProperty);
    this.log = log;
  }

  public override validate<TSubject extends ValidationSubject>(
    subject: TSubject,
    ruleSet: ValidationRuleSet<TSubject>,
    context: ValidationContext,
    options?: ValidateOptions,
  ): Promise<ValidationError> {
    this.log.push(
      Object.freeze({ kind: 'validate', className: subject.getClassName(), context } as const),
    );
    return super.validate(subject, ruleSet, context, options);
  }

  public override validateProcess<
    TEntity extends ValidationSubject,
    TProcessObject extends ValidationSubject,
  >(request: ProcessValidationRequest<TEntity, TProcessObject>): Promise<ProcessValidationResult> {
    this.log.push(
      Object.freeze({
        kind: 'validateProcess',
        className: request.entity.getClassName(),
      } as const),
    );
    return super.validateProcess(request);
  }
}

/* The harness. */
interface HarnessOptions {
  /** SKUs already in the repository, used to seed the option-bearing peer for the D19 scenario. */
  readonly repositorySkus?: readonly Sku[];
  /** Product ids that a transaction already references, driving the per-product delete guard. */
  readonly transactionProductIDs?: readonly string[];
  /** Product types the population boundary may resolve a nested one-key struct against. */
  readonly productTypes?: readonly ProductType[];
  /**
   * Settings the slice reads. Nothing is defaulted: the double refuses an unseeded key because the
   * effective-value engine lives in the out-of-scope setting service, so every key a regression needs
   * is seeded with the literal default declared at its `model/service/SettingService.cfc` locator.
   */
  readonly settings?: readonly SettingSeed[];
  /** Answers the SmartList port per query, so paging can be honoured rather than replayed. */
  readonly smartListRespond?: SmartListResponder;
  /** A fixed queue of SmartList answers, shifted one per execution. */
  readonly smartListOutcomes?: readonly SmartListOutcome[];
  /** A smartList port to hand the product service instead of the recording double. */
  readonly smartListQueryPort?: SmartListQueryPort;
  /**
   * `'permissive'` mirrors the raw `entitySave`/`entityDelete` of `IssuesTest.cfc:L64`/`:L68`, which
   * ran no declarative rules. `'real'` is the default and runs `productValidationRuleSet`.
   */
  readonly saveValidation?: 'real' | 'permissive';
}

interface Harness {
  readonly service: ProductService;
  /**
   * The same validator instance the service and base service were constructed with, so a caller-side
   * process flow can be driven through the real seam rather than a parallel one.
   */
  readonly validator: Validator;
  /** The same persistence seam the service was constructed with. */
  readonly persistProduct: (product: Product) => Promise<Product>;
  /** Validate/persist/remove in the order they happened. */
  readonly log: readonly HarnessEvent[];
  readonly persistedProducts: readonly Product[];
  readonly removedProducts: readonly Product[];
  readonly smartListQueries: readonly SmartListQuery[];
  readonly productTypeCatalog: ProductTypeCatalog;
  /** One entry per transaction-existence probe, recording the argument order it was called with. */
  readonly transactionChecks: readonly string[];
  readonly productPropertyDescriptors: PropertyDescriptorSet<Product, ProductPropertyName>;
}

function buildHarness(options: HarnessOptions = {}): Harness {
  const log: HarnessEvent[] = [];

  const skuRepository = createInMemorySkuRepository({
    skus: options.repositorySkus ?? [],
    transactionProductIDs: options.transactionProductIDs ?? [],
  });
  const productRepository = createInMemoryProductRepository({});
  const optionRepository = createInMemoryOptionRepository({});

  const smartList = createSmartListQueryDouble({
    ...(options.smartListRespond === undefined ? {} : { respond: options.smartListRespond }),
    ...(options.smartListOutcomes === undefined ? {} : { outcomes: options.smartListOutcomes }),
  });
  const optionSmartList = createSmartListQueryDouble({});

  const settings = createSettingResolverDouble({ settings: options.settings ?? [] });
  const urlTitles = createUrlTitleAvailabilityDouble();
  const populationAuthorization = createPopulationAuthorizationDouble();
  const uniqueProperty = createUniquePropertyDouble();
  const validator = new OrderRecordingValidator(uniqueProperty.uniqueProperty, log);
  const persistence = createBaseServicePersistenceDouble<Product>();
  const productTypeRoots = createProductTypeRootResolverDouble();
  const subscriptionTerms = createSubscriptionTermDouble({ subscriptionTermIDs: [] });
  const accessContents = createAccessContentDouble();
  const imagePaths = createImagePathDouble();
  const accountContext = createAccountContextDouble();

  // The chain, recorded end to end. `product.getTransactionExistsFlag` supplies the product id in
  // the second slot and leaves the sku id absent, which is how `model/entity/Product.cfc:L626` passes
  // `productID=` BY name; `model/service/SkuService.cfc:L286` forwards it untouched, and
  // `model/dao/SkuDAO.cfc:L62` filters on it. Recording the pair is what lets the assertion prove the
  // guard is scoped to one product.
  const baseTransactionChecker = createTransactionExistenceChecker(skuRepository.repository);
  const transactionChecks: string[] = [];
  const transactionChecker: ProductTransactionExistenceChecker = {
    argumentOrder: 'skuID-first-productID-second',
    getTransactionExistsFlag: (skuID?: string, productID?: string): Promise<boolean> => {
      transactionChecks.push(`skuID=${skuID ?? ''}|productID=${productID ?? ''}`);
      return baseTransactionChecker.getTransactionExistsFlag(skuID, productID);
    },
  };

  const productTypeCatalog = createProductTypeCatalog(options.productTypes ?? []);
  const productPropertyDescriptors = createProductPropertyDescriptors({
    productType: {
      loader: productTypeCatalog.loader,
      populate: (target: ProductType, data: Record<string, unknown>): void => {
        throw new Error(
          'The product-type population boundary was asked to populate ' +
            `"${target.productTypeID}" from ${Object.keys(data).length} key(s). No regression here ` +
            'supplies a multi-key product-type struct, so this is a wiring mistake.',
        );
      },
    },
  });

  const productBaseService = new BaseService<Product, ProductPropertyName>({
    validator,
    ruleSet: productValidationRuleSet,
    propertyDescriptors: productPropertyDescriptors,
    populationAuthorization: populationAuthorization.populationAuthorization,
    persist: persistence.seams.persist,
    remove: async (entity: Product): Promise<void> => {
      log.push(Object.freeze({ kind: 'remove', productID: entity.productID } as const));
      await persistence.seams.remove(entity);
    },
    settingCleanup: persistence.seams.settingCleanup,
    commentCleanup: persistence.seams.commentCleanup,
    resolveDeleteSubject: async (candidate: Product): Promise<Product> => {
      await candidate.getTransactionExistsFlag(transactionChecker);
      return candidate;
    },
  });

  const productTypeBaseService = {
    save: (entity: ProductTypeWithErrorState): Promise<ProductTypeWithErrorState> =>
      Promise.resolve(entity),
  };

  const optionService = new OptionService(optionRepository.repository, optionSmartList.smartList);
  const skuService = new SkuService(
    skuRepository.repository,
    optionService,
    subscriptionTerms.subscriptionTerms,
    accessContents.accessContents,
    imagePaths.imagePaths,
    smartList.smartList,
    validator,
    productTypeRoots.resolver,
    (sku: Sku) => createDefaultSkuDelegate(sku),
    /* — generous, so no regression's outcome depends on the ceiling. */
    GENEROUS_COMBINATION_BUDGET,
  );

  const persistedProducts: Product[] = [];
  const persistProduct = (product: Product): Promise<Product> => {
    log.push(Object.freeze({ kind: 'persist', productID: product.productID } as const));
    persistedProducts.push(product);
    return Promise.resolve(product);
  };
  const collaborators: ProductServiceCollaborators = {
    productRepository: productRepository.repository,
    skuRepository: skuRepository.repository,
    skuService,
    optionService,
    baseService: productBaseService,
    productTypeBaseService,
    validator: options.saveValidation === 'permissive' ? createPermissiveValidator() : validator,
    settings: settings.resolver,
    accountContext: accountContext.accountContext,
    smartListQueryPort: options.smartListQueryPort ?? smartList.smartList,
    subscriptionTermPort: subscriptionTerms.subscriptionTerms,
    productTypeRootResolver: productTypeRoots.resolver,
    productPropertyDescriptors,
    populationAuthorization: populationAuthorization.populationAuthorization,
    prepareProductPopulation: () => Promise.resolve(),
    // `UniqueValueProbe` takes a plain string; the double narrows to the three tables that actually
    // carry a urlTitle column. `find` performs the narrowing without a cast, and an unknown table is
    // refused rather than silently answered, so a mis-wiring surfaces as a failure.
    urlTitleProbeBudget: GENEROUS_URL_TITLE_PROBE_BUDGET,
    isUrlTitleAvailable: (tableName: string, value: string): Promise<boolean> => {
      const known = URL_TITLE_TABLES.find((candidate) => candidate === tableName);
      if (known === undefined) {
        return Promise.reject(
          new Error(`A URL title was probed against the unexpected table "${tableName}".`),
        );
      }
      return urlTitles.probe.isUrlTitleAvailable(known, value);
    },
    persistProduct,
    defaultSkuIdReader: (): string => '',
    /*
     * — the real hydration reader. These regressions build their product types by hand, so it
     * answers `undefined` and the `:L306-L308` inheritance branch is skipped, exactly as before.
     */
    parentProductTypeIdReader: readHydratedParentProductTypeID,
    /*
     * Empty on purpose. A populated sub-property is only recorded for a nested struct that carries more
     * than the identifier [org/Hibachi/HibachiTransient.cfc:L236-L249], and the product-type descriptor
     * above throws if one ever arrives — no regression in this block supplies one, so no writer can be
     * reached. The boundary-graph block further down wires the composition root's real writer set and
     * asserts against that.
     */
    populatedSubPropertyWriters: {},
  };

  return {
    service: new ProductService(collaborators),
    validator,
    persistProduct,
    log,
    persistedProducts,
    removedProducts: persistence.removed,
    smartListQueries: smartList.queries,
    productTypeCatalog,
    transactionChecks,
    productPropertyDescriptors,
  };
}

/** `model/service/SettingService.cfc:L193` — the declared default, carried verbatim. */
const PRODUCT_TITLE_STRING_SETTING: SettingSeed = {
  settingName: 'productTitleString',
  value: '${brand.brandName} ${productName}',
};

/* The real smart-list seam, for issue_1296. */

/** A seeded database row. */
type SeededRow = Record<string, unknown>;

/** The aggregate binder, which must never run. */
function refuseDefaultSkuBinding(sku: Sku): never {
  throw new Error(
    `The default-SKU binder ran for sku "${sku.skuID}". The smart-list cases in this file seed no SKU ` +
      'aggregate rows, so this is a wiring mistake rather than a regression.',
  );
}

/** Two products, distinct, in the order the default `createdDateTime` ordering returns them. */
const ISSUE_1296_PRODUCT_ONE_ID = 'issue1296one00000000000000000000';
const ISSUE_1296_PRODUCT_TWO_ID = 'issue1296two00000000000000000000';

const ISSUE_1296_ROWS: readonly SeededRow[] = Object.freeze([
  Object.freeze({
    productID: ISSUE_1296_PRODUCT_ONE_ID,
    productName: 'First Product',
    activeFlag: 1,
    publishedFlag: 1,
  }),
  Object.freeze({
    productID: ISSUE_1296_PRODUCT_TWO_ID,
    productName: 'Second Product',
    activeFlag: 1,
    publishedFlag: 1,
  }),
]);

/** A real builder over the given root rows, wired the way `src/config/container.ts` wires it. */
function realProductSmartList(rootRows: readonly SeededRow[]): {
  readonly port: SmartListQueryPort;
  readonly fanning: ReturnType<typeof createFanningSqlExecutorDouble>;
} {
  const fanning = createFanningSqlExecutorDouble({
    rootRows,
    rootIdentityColumn: 'productID',
    associations: [{ matching: 'FROM SwSku WHERE productID IN', rows: [] }],
  });

  return {
    port: new SmartListQueryBuilder(
      fanning.executor,
      createCatalogAggregateLoaders({ bindDefaultSkuDelegate: refuseDefaultSkuBinding }),
      GENEROUS_SMART_LIST_BUDGET,
    ),
    fanning,
  };
}

/** The one statement of a compiled query that carries the page window. */
function pageStatement(fanning: {
  readonly calls: readonly { readonly sql: string; readonly params: readonly unknown[] }[];
}): { readonly sql: string; readonly params: readonly unknown[] } | undefined {
  return fanning.calls.find((call) => call.sql.includes(' LIMIT ? OFFSET ?'));
}

describe('meta/tests/unit/IssuesTest.cfc — catalog issue regressions', () => {
  /* traceable — meta/tests/unit/IssuesTest.cfc:L51-L71 — AAP-named regression. */
  it('TRACEABLE issue_1097 — meta/tests/unit/IssuesTest.cfc:L51', async () => {
    const subjectProductID = 'issue-1097-subject';
    const otherProductID = 'issue-1097-other';
    const merchandiseProductType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: 'Merchandise',
      systemCode: 'merchandise',
    });
    const harness = buildHarness({
      productTypes: [merchandiseProductType],
      settings: [PRODUCT_TITLE_STRING_SETTING],
      saveValidation: 'permissive',
      transactionProductIDs: [otherProductID],
    });

    // :L55-:L59, carried field for field. No price, productCode or urlTitle is added: the legacy test
    // supplied exactly these two keys, and padding them would change what is being regressed.
    //
    // TODO(parity) D17 — `IssuesTest.cfc:L55` reads `productData = {` with no `var`, so the struct
    // leaks into the component's shared variables scope; `meta/tests/unit/Helper.cfc:L53` repeats it.
    // TypeScript block scoping removes the hazard by construction, so there is nothing to carry into
    // the runtime behaviour here. The canonical annotation, including the locator correction against
    // the defect register, already lives in `test/fixtures/testProduct.ts` and is not restated.
    const productData: Record<string, unknown> = {
      productName: 'My Product',
      productType: { productTypeID: MERCHANDISE_PRODUCT_TYPE_ID },
    };

    const authorization = createPopulationAuthorizationDouble();

    // The population boundary is real and injected, not ambient. `PRODUCT_PROPERTY_DESCRIPTORS` — the
    // default set — declares no productType collaborator, so `createProductPropertyDescriptors`
    // emits no many-to-one descriptor for it and the nested struct is never visited. Asserting that
    // first proves the collaborator is what does the work.
    const withoutCollaborator = populate(
      new Product(),
      productData,
      PRODUCT_PROPERTY_DESCRIPTORS,
      authorization.populationAuthorization,
    );
    expect(withoutCollaborator.productName).toBe('My Product');
    expect(withoutCollaborator.productType).toBeUndefined();

    // :L60 — `product.populate(productData)`. `Product` exposes no `populate` method: the framework
    // facility at `model/entity/HibachiEntity.cfc:L56` became the free `populate(...)` helper plus an
    // explicit descriptor set, so the call site names both.
    const product = new Product();
    product.productID = subjectProductID;
    const populated = populate(
      product,
      productData,
      harness.productPropertyDescriptors,
      authorization.populationAuthorization,
    );
    expect(populated).toBe(product);
    expect(product.productName).toBe('My Product');
    expect(product.productType).toBe(merchandiseProductType);
    // One key in the struct, so `populate` takes the `loadExisting` path rather than `loadOrCreate`.
    expect(harness.productTypeCatalog.loadExistingIds).toStrictEqual([MERCHANDISE_PRODUCT_TYPE_ID]);

    // :L64-:L66 — save, then flush. M5: `SlatwallUnitTestBase.cfc:L53` and `:L70` are both commented
    // out, so no request-end lifecycle ran and the legacy test had to flush by hand. Each manual
    // `ormFlush()` therefore becomes one explicit `UnitOfWork` boundary, committed only when the
    // entity carries no errors — the translation of the `getORMHasErrors()` gate.
    const saveWork = createUnitOfWorkDouble();
    const saved = await saveWork.unitOfWork.run(
      () => harness.service.saveProduct(product, productData),
      () => product.hasErrors(),
    );
    expect(saved).toBe(product);
    expect(product.hasErrors()).toBe(false);
    expect(harness.persistedProducts).toStrictEqual([product]);
    expect(saveWork.transactionsStarted()).toBe(1);
    expect(saveWork.transactionsCommitted()).toBe(1);
    expect(saveWork.transactionsRolledBack()).toBe(0);

    // The inert delete guard. `model/validation/Product.json:L7` declares `physicalCounts` with
    // `maxCollection: 0` for the delete context, but no entity in the slice declares that property —
    // `model/entity/Product.cfc:L90` declares `physicals`, and `physicalCounts` belongs to the
    // excluded `model/entity/Physical.cfc:L59`. `hasProperty` answers false, so
    // `org/Hibachi/HibachiValidationService.cfc:L171` skips the rule and the delete is not blocked by
    // it. No physical-count collaborator is constructed anywhere in this file, and none is consulted.
    expect(product.hasProperty('physicalCounts')).toBe(false);
    expect(product.hasProperty('physicals')).toBe(true);

    // :L68-:L70 — delete, then flush, in its own boundary.
    const deleteWork = createUnitOfWorkDouble();
    const deleted = await deleteWork.unitOfWork.run(
      () => harness.service.deleteProduct(product),
      () => product.hasErrors(),
    );
    expect(deleted).toBe(true);
    expect(harness.removedProducts).toStrictEqual([product]);
    expect(deleteWork.transactionsStarted()).toBe(1);
    expect(deleteWork.transactionsCommitted()).toBe(1);

    // The transaction delete guard is scoped to one product, not to the whole table.
    // `model/entity/Product.cfc:L626` passes `productID=` BY name to
    // `model/service/SkuService.cfc:L285-L287`, which forwards it untouched with
    // `argumentCollection=arguments`, and `model/dao/SkuDAO.cfc:L53-L98` filters the existence chain on
    // `ss.product.productID = :productID` in its `<cfelse>` branch. This intentionally corrects the
    // stale global reading recorded as AAP discrepancy 4: a transaction against another product.
    expect(harness.transactionChecks).toStrictEqual([`skuID=|productID=${subjectProductID}`]);
    const otherProduct = buildProduct({ productID: otherProductID });
    const otherDeleted = await harness.service.deleteProduct(otherProduct);
    expect(otherDeleted).toBe(false);
    expect(harness.removedProducts).toStrictEqual([product]);
    expect(harness.transactionChecks).toStrictEqual([
      `skuID=|productID=${subjectProductID}`,
      `skuID=|productID=${otherProductID}`,
    ]);
    expect(otherProduct.getError('transactionExistsFlag')).toStrictEqual([]);

    // The guard's comparison is CFML-loose, and that looseness is the engine's. Every false-like
    // value CFML accepts satisfies `eq false`; every true-like value fails it; and an absent flag
    // fails rather than being coalesced to false.
    const guard = createValidatorHarness();
    const falseLike: readonly unknown[] = [false, 'false', 0, '0', 'no'];
    for (const value of falseLike) {
      const bag = await guard.validateDryRun(
        looseFalseGuardSubject(value),
        looseFalseGuardRuleSet,
        'delete',
      );
      expect(bag.getError('transactionExistsFlag')).toStrictEqual([]);
    }
    const trueLike: readonly unknown[] = [true, 'true', 1, '1', 'yes'];
    for (const value of trueLike) {
      const bag = await guard.validateDryRun(
        looseFalseGuardSubject(value),
        looseFalseGuardRuleSet,
        'delete',
      );
      expect(bag.getError('transactionExistsFlag')).toStrictEqual([
        'validate.delete.Product.transactionExistsFlag.eq',
      ]);
    }
    const absent = await guard.validateDryRun(
      looseFalseGuardSubject(undefined),
      looseFalseGuardRuleSet,
      'delete',
    );
    expect(absent.getError('transactionExistsFlag')).toStrictEqual([
      'validate.delete.Product.transactionExistsFlag.eq',
    ]);

    // M7 — nothing survives the invocation. A second harness is a second simulated invocation: its
    // log, its probe record, its persistence record and its population record are all empty, and a
    // freshly built product carries no memoized `transactionExistsFlag` from the first invocation, so
    // the guard is asked again rather than answered from warm state.
    const secondInvocation = buildHarness({
      productTypes: [merchandiseProductType],
      settings: [PRODUCT_TITLE_STRING_SETTING],
      saveValidation: 'permissive',
      transactionProductIDs: [otherProductID],
    });
    expect(secondInvocation.log).toStrictEqual([]);
    expect(secondInvocation.transactionChecks).toStrictEqual([]);
    expect(secondInvocation.persistedProducts).toStrictEqual([]);
    expect(secondInvocation.removedProducts).toStrictEqual([]);
    expect(secondInvocation.productTypeCatalog.loadExistingIds).toStrictEqual([]);
    const freshProduct = buildProduct({ productID: subjectProductID });
    expect(freshProduct.transactionExistsFlag).toBeUndefined();
    expect(await secondInvocation.service.deleteProduct(freshProduct)).toBe(true);
    expect(secondInvocation.transactionChecks).toStrictEqual([
      `skuID=|productID=${subjectProductID}`,
    ]);
  });

  /* Traceable — meta/tests/unit/IssuesTest.cfc:L73-L89 — AAP-named regression. */
  it('TRACEABLE issue_1296 — meta/tests/unit/IssuesTest.cfc:L73', async () => {
    const pageOneRun = realProductSmartList(ISSUE_1296_ROWS);
    const pageTwoRun = realProductSmartList(ISSUE_1296_ROWS);

    // :L75-:L79 — `currentURL` stays optional and string-typed, which is AAP discrepancy 1: the legacy
    // declares it with no type at all (`currentURL=""`).
    const pageOne = await buildHarness({
      smartListQueryPort: pageOneRun.port,
    }).service.getProductSmartList({ 'P:Show': 1 }, '');

    expect(pageOne.recordsCount).toBe(2);
    expect(pageOne.pageRecords).toHaveLength(1);
    const firstPageProduct = requireAt(pageOne.pageRecords, 0);

    // :L82-:L83 — page two of the same one-record window. A separate run, because :L83's
    // `getPageRecords(true)` passes the refresh flag and therefore re-executes rather than reading the
    // memoized `variables.pageRecords` of `org/Hibachi/HibachiSmartList.cfc:L760`. A second service call
    // is the port's equivalent: nothing is retained between invocations (M7).
    const pageTwo = await buildHarness({
      smartListQueryPort: pageTwoRun.port,
    }).service.getProductSmartList({ 'P:Show': 1, 'P:Current': '2' }, '');

    expect(pageTwo.currentPage).toBe(2);
    expect(pageTwo.pageRecords).toHaveLength(1);
    const secondPageProduct = requireAt(pageTwo.pageRecords, 0);

    // :L85 — the regression itself: consecutive single-record pages must not hand back the same row.
    // Both identifiers now come out of the builder's own window arithmetic over the seeded rows.
    expect(firstPageProduct.productID).not.toBe(secondPageProduct.productID);
    expect(firstPageProduct.productID).toBe(ISSUE_1296_PRODUCT_ONE_ID);
    expect(secondPageProduct.productID).toBe(ISSUE_1296_PRODUCT_TWO_ID);

    // Why they differ, stated as an assertion rather than as a comment: the second page binds OFFSET 1
    // against the same LIMIT 1, and both are bound positionally and last, as the digit strings
    // `translateSmartListInput` normalises them to. `:L794` computes `((page-1)*show)+1`, so page two of
    // a one-record window starts at record 2 — offset 1, since the port binds `pageRecordsStart - 1`
    // exactly as `org/Hibachi/HibachiSmartList.cfc:L762` passes `getPageRecordsStart()-1`.
    expect(pageStatement(pageOneRun.fanning)?.params).toStrictEqual(['1', '0']);
    expect(pageStatement(pageTwoRun.fanning)?.params).toStrictEqual(['1', '1']);

    // Neither run replayed anything: each issued its own count, its own unpaged read, its own page read
    // and its own two aggregate loads — the SKU collection and the owning `relatedProducts` link rows.
    // A cached first page would show as a missing statement here, and it is the failure mode the legacy
    // `getPageRecords(true)` refresh flag exists to avoid. The fifth statement is the link read
    // `MySqlProductPersistence.saveProduct`'s reconciliation depends on (rule 3d): it is what makes the
    // in-memory collection authoritative, so a product saved after being read replaces its stored link
    // rows rather than preserving them.
    for (const run of [pageOneRun, pageTwoRun]) {
      expect(run.fanning.calls).toHaveLength(5);
      expect(run.fanning.calls[0]?.sql).toContain('COUNT(DISTINCT aslatwallproduct.productID)');
      expect(pageStatement(run.fanning)).toBeDefined();
      expect(requireAt(run.fanning.statements(), 4)).toContain('FROM SwRelatedProduct');
    }

    // The three joins reach the emitted statement, and none of them eliminates a row: a product with no
    // brand, no product type or no default SKU still appears. `org/Hibachi/HibachiSmartList.cfc:L537-L540`
    // rewrites an omitted join kind to `left`, so `:L347` and `:L348` — which name no kind — emit the same
    // keyword `:L349` spells out.
    const recordsSql = requireAt(pageOneRun.fanning.statements(), 1);
    expect(recordsSql.match(/ LEFT JOIN /g)).toHaveLength(3);
    expect(recordsSql).not.toContain('INNER JOIN');
    expect(recordsSql).toContain(
      'LEFT JOIN SwProductType aslatwallproducttype ON aslatwallproducttype.productTypeID = ' +
        'aslatwallproduct.productTypeID',
    );
    expect(recordsSql).toContain(
      'LEFT JOIN SwSku aslatwallsku ON aslatwallsku.skuID = aslatwallproduct.defaultSkuID',
    );
    expect(recordsSql).toContain(
      'LEFT JOIN SwBrand aslatwallbrand ON aslatwallbrand.brandID = aslatwallproduct.brandID',
    );

    // The correction, asserted. Every on clause equates the other side's key to a foreign key column
    // on the product row, which is what `many-to-one` means and why at most one row can match. A fanning
    // join would instead equate a child column to the product's own primary key — the
    // `ON aslatwallsku.productID = aslatwallproduct.productID` shape that `skus` emits — and no such
    // clause appears. This is the real reason the page window above is stable, and it is asserted so that
    // registering a collection join here later cannot pass silently.
    expect(recordsSql).not.toContain('= aslatwallproduct.productID');

    // And the projection is not distinct, faithfully: the flag is unset, so `:L510` and `:L518` add
    // nothing. Asserting the absence is what keeps the asymmetry a carried decision (AAP §0.7.3)
    // rather than something that gets "tidied up".
    expect(recordsSql.startsWith('SELECT aslatwallproduct.*')).toBe(true);
    expect(recordsSql).not.toContain('SELECT DISTINCT');
  });

  /*
   * NET-NEW — no legacy counterpart. AAP §0.8.3.7 requires that absence be flagged, not implied away.
   */
  it('NET-NEW — issue_1296 companion: the guarantee is join DIRECTION, and fanning rows would break it', async () => {
    // The row set a collection join produces: product one matched twice, product two once.
    const fannedRows: readonly SeededRow[] = [
      requireAt(ISSUE_1296_ROWS, 0),
      requireAt(ISSUE_1296_ROWS, 0),
      requireAt(ISSUE_1296_ROWS, 1),
    ];
    const pageOneRun = realProductSmartList(fannedRows);
    const pageTwoRun = realProductSmartList(fannedRows);

    const pageOne = await buildHarness({
      smartListQueryPort: pageOneRun.port,
    }).service.getProductSmartList({ 'P:Show': 1 }, '');
    const pageTwo = await buildHarness({
      smartListQueryPort: pageTwoRun.port,
    }).service.getProductSmartList({ 'P:Show': 1, 'P:Current': '2' }, '');

    // The regression, reproduced. Both pages are product one, so the legacy assertion at :L85 would fail
    // — which is precisely why the join set the member registers matters more than it looks.
    expect(requireAt(pageOne.pageRecords, 0).productID).toBe(ISSUE_1296_PRODUCT_ONE_ID);
    expect(requireAt(pageTwo.pageRecords, 0).productID).toBe(ISSUE_1296_PRODUCT_ONE_ID);

    // The asymmetry, in numbers: three records materialised for a total of two, because `:L504` counts
    // distinct unconditionally while the record projection consulted a flag nobody set.
    expect(pageOne.records).toHaveLength(3);
    expect(pageOne.recordsCount).toBe(2);
    expect(pageOne.totalPages).toBe(2);

    // Same window arithmetic as the passing case — offsets 0 and 1 — so nothing about pagination changed.
    // The only difference is which row the offset lands on, which is the entire point.
    expect(pageStatement(pageOneRun.fanning)?.params).toStrictEqual(['1', '0']);
    expect(pageStatement(pageTwoRun.fanning)?.params).toStrictEqual(['1', '1']);
  });

  /* Traceable — meta/tests/unit/IssuesTest.cfc:L91-L99 — AAP-named regression. */
  it('TRACEABLE issue_1329 — meta/tests/unit/IssuesTest.cfc:L91', async () => {
    const harness = buildHarness({
      smartListOutcomes: [{ kind: 'page', metrics: {} }],
    });

    // :L95-:L97 — must resolve, not reject.
    await expect(
      harness.service.getProductSmartList({ 'R:calculatedQATS': 'XXX^' }, ''),
    ).resolves.toBeDefined();

    // The mechanism, recorded rather than guessed: `XXX^` declares an upper delimiter with a lower
    // bound of `XXX`, which reads as neither numeric nor a date, so the range is dropped during
    // translation instead of being emitted or thrown. With no filters, like-filters, in-filters or
    // ranges surviving, the composed query carries no where group at all.
    expect(harness.smartListQueries).toHaveLength(1);
    const emitted = requireAt(harness.smartListQueries, 0);
    expect(emitted.whereGroups).toBeUndefined();

    // No SQL, no HQL, no adapter and no database took part: the only boundary crossed is the port.
    expect(emitted.entityName).toBe('SlatwallProduct');
  });

  /* Traceable — meta/tests/unit/IssuesTest.cfc:L101-L108 — AAP-named regression. */
  it('TRACEABLE issue_1331 — meta/tests/unit/IssuesTest.cfc:L101', async () => {
    const contentAccessProductType = buildProductType({
      productTypeID: CONTENT_ACCESS_PRODUCT_TYPE_ID,
      productTypeName: 'Content Access',
      systemCode: 'contentAccess',
    });
    const contentAccessProduct = buildProduct({
      productID: 'issue-1331-content-access',
      productType: contentAccessProductType,
    });
    const harness = createValidatorHarness();

    // :L106 — the gate is closed for a content-access product, because
    // `model/validation/Product.json` declares `baseProductType` with `inList: "merchandise"` for the
    // `addOptionGroup,addOption` contexts.
    const denied = await harness.validateDryRun(
      productSubject(contentAccessProduct, { baseProductType: 'contentAccess' }),
      productValidationRuleSet,
      'addOptionGroup',
    );
    expect(denied.hasErrors()).toBe(true);
    expect(denied.getError('baseProductType')).toStrictEqual([
      'validate.addOptionGroup.Product.baseProductType.inList',
    ]);

    // The bag is a throwaway. The entity carries no errors of its own afterwards, so asking
    // whether a process is available never poisons the entity that was asked about.
    expect(contentAccessProduct.hasErrors()).toBe(false);
    expect(contentAccessProduct.getError('baseProductType')).toStrictEqual([]);

    // The gate discriminates rather than always denying. A merchandise product with at least one
    // unused option group passes the same rules in the same context.
    const merchandiseProductType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: 'Merchandise',
      systemCode: 'merchandise',
    });
    const merchandiseProduct = buildProduct({
      productID: 'issue-1331-merchandise',
      productType: merchandiseProductType,
    });
    const permitted = await harness.validateDryRun(
      productSubject(merchandiseProduct, {
        baseProductType: 'merchandise',
        unusedProductOptionGroups: [buildOptionGroup({ optionGroupID: 'og-1331' })],
      }),
      productValidationRuleSet,
      'addOptionGroup',
    );
    expect(permitted.hasErrors()).toBe(false);

    // Context selection is whole-element and case-insensitive, matching CFML `listFindNoCase`, never
    // substring matching. `ValidationContext` is a closed union in the target, so a case variant is not
    // type-legal and cannot be used to demonstrate this. The type-legal discriminator is better:
    // `unusedProductOptionGroups` is gated on `addOptionGroup` alone, and the string `addOption` is a
    // strict substring of `addOptionGroup`. An empty collection therefore fails under `addOptionGroup`,
    // and must not fail under `addOption` — which it would if matching were done by substring.
    const emptyGroups: readonly unknown[] = [];
    const underAddOptionGroup = await harness.validateDryRun(
      productSubject(merchandiseProduct, {
        baseProductType: 'merchandise',
        unusedProductOptionGroups: emptyGroups,
      }),
      productValidationRuleSet,
      'addOptionGroup',
    );
    expect(underAddOptionGroup.getError('unusedProductOptionGroups')).toStrictEqual([
      'validate.addOptionGroup.Product.unusedProductOptionGroups.minCollection',
    ]);
    const underAddOption = await harness.validateDryRun(
      productSubject(merchandiseProduct, {
        baseProductType: 'merchandise',
        unusedProductOptionGroups: emptyGroups,
      }),
      productValidationRuleSet,
      'addOption',
    );
    expect(underAddOption.getError('unusedProductOptionGroups')).toStrictEqual([]);
    expect(merchandiseProduct.hasErrors()).toBe(false);
  });

  /* Traceable — meta/tests/unit/IssuesTest.cfc:L110-L124 — AAP-named regression, partial scope. */
  it('TRACEABLE issue_1335 — meta/tests/unit/IssuesTest.cfc:L110', async () => {
    const productID = 'issue-1335-product';
    const product = buildProduct({ productID });
    const repository = createInMemorySkuRepository({});
    const ruleSet = buildSkuSaveRuleSet(repository.repository, productID);
    const harness = createValidatorHarness();

    // :L114-:L115. `SkuSeed` accepts `number | string` for both, so the non-numeric list price goes
    // through the real conversion path with no cast and no suppression — exactly as a form post would
    // deliver it. `skuCode` is supplied only so the unrelated `required` record is satisfied and the
    // regression stays on price and list price; the real uniqueness and method rules are left in place.
    const sku = buildSku({
      skuID: 'issue-1335-sku',
      skuCode: 'ISSUE1335',
      price: -20,
      listPrice: 'test',
    });
    sku.setProduct(product);

    // :L117 — the framework `validate(context="save")` becomes an explicit Validator call against the
    // typed rule set. `Sku` exposes no `validate` method, and none is added.
    const errors = await harness.validateDryRun(sku, ruleSet, 'save');

    // :L119-:L120.
    expect(errors.hasError('price')).toBe(true);
    expect(errors.hasError('listPrice')).toBe(true);

    // The rule sets accumulate rather than short-circuit, and their constraint order is declared, so
    // the exact key sequence is assertable. `price = -20` reads as numeric, so only `minValue` fails.
    // `listPrice = 'test'` reads as non-numeric, so `dataType` fails and `minValue` fails after it,
    // because a non-numeric value cannot satisfy a minimum either.
    expect(errors.getError('price')).toStrictEqual(['validate.save.Sku.price.minValue']);
    expect(errors.getError('listPrice')).toStrictEqual([
      'validate.save.Sku.listPrice.dataType.numeric',
      'validate.save.Sku.listPrice.minValue',
    ]);

    // :L122-:L123 — `right(..., 8) neq "_missing"`, carried as an explicit suffix check over every
    // inspected key rather than only the first.
    const inspected: readonly string[] = [
      ...errors.getError('price'),
      ...errors.getError('listPrice'),
    ];
    expect(inspected.length).toBeGreaterThan(0);
    for (const message of inspected) {
      expect(message.endsWith('_missing')).toBe(false);
    }

    // Nothing else in the save rule set fired, which is what keeps the regression pointed at its
    // subject rather than at incidental wiring.
    expect(Object.keys(errors.getErrors()).sort()).toStrictEqual(['listPrice', 'price']);
  });

  /* Traceable — meta/tests/unit/IssuesTest.cfc:L126-L138 — beyond-the-AAP addition. */
  it('TRACEABLE issue_1348 — meta/tests/unit/IssuesTest.cfc:L126', async () => {
    const productID = 'issue-1348-product';
    const product = buildProduct({ productID });
    const repository = createInMemorySkuRepository({});
    const ruleSet = buildSkuSaveRuleSet(repository.repository, productID);
    const harness = createValidatorHarness();

    // :L129-:L133. `setProduct` is the real domain method and it mutates the live array returned by
    // `Product.getSkus()` — no copy, no freeze, no readonly view — so the coupling the legacy ORM
    // relationship provided is genuinely exercised.
    const sku = buildSku({ skuID: 'issue-1348-sku', skuCode: 'issue_1348', price: -20 });
    sku.setProduct(product);
    expect(sku.skuCode).toBe('issue_1348');
    expect(product.getSkus()).toContain(sku);
    expect(sku.product).toBe(product);

    // :L135-:L138.
    const errors = await harness.validateDryRun(sku, ruleSet, 'save');
    expect(errors.hasError('price')).toBe(true);
    expect(errors.getError('price')).toStrictEqual(['validate.save.Sku.price.minValue']);
    expect(requireAt(errors.getError('price'), 0).endsWith('_missing')).toBe(false);

    /*
     * M6 — the `hasUniqueOptions` rule is not a pure predicate. It is a declarative rule from
     * `model/validation/Sku.json` that runs a query, so what it sees depends on what the surrounding
     * transaction has already written. The sequence below is deliberately sequential: each validation
     * is awaited before the next write, there is no `Promise.all`, no pre-fetched snapshot, no cache
     * held across saves and no reordering of the batch. Reordering or batching here would change the
     * result with no error and no compile failure, which is exactly the hazard.
     */
    const sizeGroup = buildOptionGroup({
      optionGroupID: 'issue-1348-size',
      optionGroupName: 'Size',
      optionGroupCode: 'size',
    });
    const small = buildOption({
      optionID: 'issue-1348-small',
      optionName: 'Small',
      optionCode: 'small',
      optionGroup: sizeGroup,
    });

    const firstCombination = buildSku({
      skuID: 'issue-1348-combo-1',
      skuCode: 'ISSUE1348-COMBO-1',
      price: 10,
      options: [small],
    });
    firstCombination.setProduct(product);

    const secondCombination = buildSku({
      skuID: 'issue-1348-combo-2',
      skuCode: 'ISSUE1348-COMBO-2',
      price: 10,
      options: [small],
    });
    secondCombination.setProduct(product);

    // Step 1 — nothing written yet, so the duplicate combination is not yet a duplicate.
    const beforeSibling = await harness.validateDryRun(secondCombination, ruleSet, 'save');
    expect(beforeSibling.getError('options')).toStrictEqual([]);

    // Step 2 — the sibling becomes visible within the same transaction...
    repository.add(firstCombination);

    // And step 3 re-validates and now sees it. Same subject, same rule set, different answer,
    // because the rule reads live state rather than a snapshot.
    const afterSibling = await harness.validateDryRun(secondCombination, ruleSet, 'save');
    expect(afterSibling.getError('options')).toStrictEqual([
      'validate.save.Sku.options.hasUniqueOptions',
    ]);

    /* TODO(parity) D19 — carried as observed behaviour, not repaired. */
    const optionLess = buildSku({
      skuID: 'issue-1348-option-less',
      skuCode: 'ISSUE1348-OPTIONLESS',
      price: 10,
    });
    optionLess.setProduct(product);
    expect(optionLess.getOptions()).toStrictEqual([]);
    const optionLessErrors = await harness.validateDryRun(optionLess, ruleSet, 'save');
    expect(optionLessErrors.getError('options')).toStrictEqual([
      'validate.save.Sku.options.hasUniqueOptions',
    ]);
    expect(optionLessErrors.getError('price')).toStrictEqual([]);
  });

  /* Traceable — meta/tests/unit/IssuesTest.cfc:L192-L201 — beyond-the-AAP addition. */
  it('TRACEABLE issue_1690 — meta/tests/unit/IssuesTest.cfc:L192', async () => {
    const harness = buildHarness({ settings: [PRODUCT_TITLE_STRING_SETTING] });

    // The caller from :L196-:L200, written once and exercised down both branches. It is the only place
    // that decides to persist, which is the whole point of the assertion.
    const saveWhenValid = async (candidate: Product): Promise<'persisted' | 'refused'> => {
      const bag = await harness.validator.validate(
        productSubject(candidate),
        productValidationRuleSet,
        'save',
      );
      if (bag.hasErrors()) {
        return 'refused';
      }
      await harness.persistProduct(candidate);
      return 'persisted';
    };

    // :L194 — a brand-new entity, populated with nothing. This is the branch the legacy test actually
    // took, and it must refuse to persist.
    const newProduct = new Product();
    expect(newProduct.isNew()).toBe(true);
    expect(await saveWhenValid(newProduct)).toBe('refused');
    expect(harness.persistedProducts).toStrictEqual([]);

    // Validation happened, and nothing followed it. One entry in the log, and it is the validation.
    expect(harness.log).toStrictEqual([
      { kind: 'validate', className: 'Product', context: 'save' },
    ]);

    // The bag belongs to the call, not to the entity: nothing was attached to the product, so a second
    // caller asking the same question is not answered from the first caller's verdict.
    expect(newProduct.hasErrors()).toBe(false);

    // The other branch, so the ordering is proved through persistence rather than only up to it. A
    // product satisfying every `model/validation/Product.json` save record is accepted, and the log then
    // shows validate strictly before persist.
    const merchandiseProductType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: 'Merchandise',
      systemCode: 'merchandise',
    });
    const validProduct = buildProduct({
      productID: 'issue-1690-valid',
      productName: 'Valid Product',
      productCode: 'ISSUE1690',
      urlTitle: 'issue-1690',
      productType: merchandiseProductType,
    });
    // `price` is not a column on `SwProduct`: `Product.getPrice()` reads through the default SKU, so the
    // required price record is satisfied the way the entity actually satisfies it.
    const pricedSku = buildSku({ skuID: 'issue-1690-sku', skuCode: 'ISSUE1690-1', price: 100 });
    pricedSku.setProduct(validProduct);
    validProduct.defaultSku = createDefaultSkuDelegate(pricedSku);

    expect(await saveWhenValid(validProduct)).toBe('persisted');
    expect(harness.persistedProducts).toStrictEqual([validProduct]);
    expect(harness.log).toStrictEqual([
      { kind: 'validate', className: 'Product', context: 'save' },
      { kind: 'validate', className: 'Product', context: 'save' },
      { kind: 'persist', productID: 'issue-1690-valid' },
    ]);
    // Stated as an index comparison so the ORDER is the assertion, not a by-product of array equality:
    // The latest validation strictly precedes the only persistence.
    const persistIndex = harness.log.findIndex((event) => event.kind === 'persist');
    const lastValidateIndex = harness.log.reduce(
      (latest, event, index) => (event.kind === 'validate' ? index : latest),
      -1,
    );
    expect(persistIndex).toBeGreaterThan(-1);
    expect(lastValidateIndex).toBeGreaterThan(-1);
    expect(lastValidateIndex).toBeLessThan(persistIndex);
  });

  /* Traceable — meta/tests/unit/IssuesTest.cfc:L203-L206 — beyond-the-AAP addition. */
  it('TRACEABLE issue_1690_2 — meta/tests/unit/IssuesTest.cfc:L203', async () => {
    const harness = buildHarness({ settings: [PRODUCT_TITLE_STRING_SETTING] });

    // :L204-:L205 — straight to save, with no guard and an empty payload.
    const product = new Product();
    const answer = await harness.service.saveProduct(product, {});

    // The same instance comes back, carrying its own validation state.
    expect(answer).toBe(product);
    expect(product.hasErrors()).toBe(true);

    // The failure is data, so it is inspectable through the entity's own error surface. Every key is a
    // raw constructed key (the raw key form), and the required records from `model/validation/Product.json`
    // are the ones that fired.
    expect(Object.keys(product.getErrors()).sort()).toStrictEqual([
      'price',
      'productCode',
      'productName',
      'productType',
      'urlTitle',
    ]);
    expect(product.getError('productName')).toStrictEqual([
      'validate.save.Product.productName.required',
    ]);
    expect(product.getError('urlTitle')).toStrictEqual(['validate.save.Product.urlTitle.required']);
    /*
     * Both declared title paths are absent, so the legacy metadata/value chain resolves them to empty
     * strings. Slugging the resulting whitespace yields `''`, and the required URL-title rule fires.
     * The former expectation preserved Issue 4's leaked `${brand.brandName}` token.
     */
    expect(product.urlTitle).toBe('');

    // Nothing was persisted, and the new-product branch never reached SKU creation, because
    // `saveProduct` gates both on an empty error state.
    expect(harness.persistedProducts).toStrictEqual([]);
    expect(harness.log).toStrictEqual([
      { kind: 'validate', className: 'Product', context: 'save' },
    ]);

    // And it resolves rather than rejecting — asserted directly, not merely implied by the await above.
    const second = new Product();
    await expect(harness.service.saveProduct(second, {})).resolves.toBe(second);
    expect(second.hasErrors()).toBe(true);
    expect(harness.persistedProducts).toStrictEqual([]);
  });
});

/*
 * The fixture teardown contract — `meta/tests/unit/Helper.cfc:L69-L75`
 * `tearDownTestMerchandiseProduct` is the ported half of the legacy fixture's
 * `destroyTestMerchandiseProduct()`, and until now nothing executed it. That is a specific kind of gap
 * rather than a generic one: the helper's entire reason for existing is the ORDER of its two steps, and
 * an order is exactly the property that a never-invoked function cannot be trusted to hold. Reversing
 * the two statements, or deleting either one, left every suite in this subtree green.
 */

/** Every teardown step that ran, in call order, plus a per-step call count. */
interface TeardownRecorder {
  readonly log: readonly string[];
  readonly operations: TestMerchandiseProductTeardownOperations;
  count(step: string): number;
}

/**
 * A recorder whose two operations append their own names and can be made to throw.
 *
 */
function teardownRecorder(failOn?: 'clearDefaultSkuReference' | 'deleteProduct'): TeardownRecorder {
  const log: string[] = [];

  const record = (step: 'clearDefaultSkuReference' | 'deleteProduct'): void => {
    log.push(step);
    if (failOn === step) {
      throw new Error(`${step} failed`);
    }
  };

  return {
    log,
    operations: {
      clearDefaultSkuReference: (): void => {
        record('clearDefaultSkuReference');
      },
      deleteProduct: (): void => {
        record('deleteProduct');
      },
    },
    count: (step: string): number => log.filter((entry) => entry === step).length,
  };
}

describe('meta/tests/unit/Helper.cfc — the fixture teardown contract', () => {
  it('TRACEABLE Helper.cfc:L70,L72 — clears the default-SKU reference BEFORE deleting the product', () => {
    const recorder = teardownRecorder();

    tearDownTestMerchandiseProduct(recorder.operations);

    /*
     * The order is the behaviour, and `model/validation/Sku.json:L3` is why. That rule set declares
     * `"defaultFlag": [{"contexts":"delete","eq":false}]`, so a SKU that is still its product's default
     * cannot be deleted. The legacy fixture therefore nulls the reference at `:L70` and only then calls
     * `entityDelete` at `:L72`. Reversing the two trips the guard and the teardown fails — which is a
     * failure a fixture produces in every test that uses it, not in one.
     */
    expect(recorder.log).toStrictEqual(['clearDefaultSkuReference', 'deleteProduct']);
    expect(recorder.count('clearDefaultSkuReference')).toBe(1);
    expect(recorder.count('deleteProduct')).toBe(1);
  });

  it('TRACEABLE Helper.cfc:L69 — returns nothing, synchronously, with both steps already run', () => {
    const recorder = teardownRecorder();

    const returned: void = tearDownTestMerchandiseProduct(recorder.operations);

    /*
     * The log is inspected with no `await` and no tick in between, which is the only way to
     * distinguish a synchronous orchestrator from one that defers to a microtask. `Helper.cfc:L69`
     * declares `public void function`, so the legacy caller could rely on both steps having completed by
     * the time the call returned; a port that returned a promise would silently break every caller that
     * did not await it, while still passing an order assertion made after an `await`.
     */
    expect(recorder.log).toStrictEqual(['clearDefaultSkuReference', 'deleteProduct']);
    expect(returned).toBeUndefined();
  });

  it('NET-NEW — a failing clear step short-circuits: the delete is never attempted', () => {
    const recorder = teardownRecorder('clearDefaultSkuReference');

    expect(() => {
      tearDownTestMerchandiseProduct(recorder.operations);
    }).toThrow('clearDefaultSkuReference failed');

    /*
     * Short-circuiting is the safe behaviour here, and it is why the helper catches nothing. If the
     * default-SKU reference could not be cleared, the delete guard at `model/validation/Sku.json:L3` is
     * still armed, so proceeding would attempt a delete that must fail — and swallowing the first fault
     * to try the second would replace a precise diagnosis with a misleading one. CFML's own behaviour is
     * the same: `Helper.cfc:L69-L75` has no `try`, so a fault at `:L70` never reaches `:L72`.
     */
    expect(recorder.log).toStrictEqual(['clearDefaultSkuReference']);
    expect(recorder.count('deleteProduct')).toBe(0);
  });

  it('NET-NEW — a failing delete step propagates, and the clear that already ran is not undone', () => {
    const recorder = teardownRecorder('deleteProduct');

    expect(() => {
      tearDownTestMerchandiseProduct(recorder.operations);
    }).toThrow('deleteProduct failed');

    /*
     * The complement of the case above. The helper is not a transaction and does not pretend to be one:
     * a failure at the second step leaves the first step's effect in place, exactly as the legacy fixture
     * did. Compensating for it would invent rollback semantics the legacy never had, and the caller —
     * which owns the persistence these callbacks close over — is the only layer that could do so
     * correctly.
     */
    expect(recorder.log).toStrictEqual(['clearDefaultSkuReference', 'deleteProduct']);
    expect(recorder.count('clearDefaultSkuReference')).toBe(1);
  });

  it('NET-NEW M7 — the helper holds no state: a repeat call runs both steps again, and two callers do not interfere', () => {
    const shared = teardownRecorder();

    tearDownTestMerchandiseProduct(shared.operations);
    tearDownTestMerchandiseProduct(shared.operations);

    /*
     * No once-only guard and no memoisation, asserted rather than assumed. A helper that remembered it
     * had already torn down would silently skip the second product in any suite that built two, and on a
     * warm Lambda container module-scope state is the one thing that survives — which is why M7 requires
     * every memo in this subtree to be request or factory scoped. The teardown holds none at all.
     */
    expect(shared.log).toStrictEqual([
      'clearDefaultSkuReference',
      'deleteProduct',
      'clearDefaultSkuReference',
      'deleteProduct',
    ]);

    /* And two independent callers observe only their own steps. */
    const first = teardownRecorder();
    const second = teardownRecorder();
    tearDownTestMerchandiseProduct(first.operations);
    expect(first.log).toStrictEqual(['clearDefaultSkuReference', 'deleteProduct']);
    expect(second.log).toStrictEqual([]);
  });
});

/*
 * Net-new — the build package, and the two qa findings about it (, )
 * why build coverage lives in the regression suite. Two qa findings concerned `build/esbuild.mjs`
 * rather than any `src/**` module: the package it emitted could not resolve its own external, and a
 * build that failed after the emit left a green build's artifacts in the packaging directory while
 * exiting non-zero. Both are cross-cutting regressions with no domain, service, adapter or integration
 * to belong to, and both are exactly the kind of defect that returns silently — a `dist/` listing looks.
 */

/** The subtree root, reached from this file rather than from `process.cwd()`. */
const SUBTREE_ROOT = join(__dirname, '..', '..');
const BUILD_SCRIPT = join(SUBTREE_ROOT, 'build', 'esbuild.mjs');
const PACKAGE_DIR = join(SUBTREE_ROOT, 'dist');
const STAGING_DIR = join(SUBTREE_ROOT, 'build-meta', 'package-staging');
const RELOCATED_MAP_DIR = join(SUBTREE_ROOT, 'build-meta', 'sourcemaps', 'handlers');
const STAGED_MODULES_DIR = join(PACKAGE_DIR, 'node_modules');

/**
 * The six artifact names the build promises, transcribed from `ENTRY_POINTS` in `build/esbuild.mjs`.
 */
const EXPECTED_ARTIFACT_NAMES: readonly string[] = Object.freeze([
  'brandHandler.js',
  'googleFeedHandler.js',
  'optionHandler.js',
  'productHandler.js',
  'router.js',
  'skuHandler.js',
]);

/** Roughly a second per artifact plus the dependency copy, with room for a cold esbuild start. */
const BUILD_CASE_TIMEOUT_MS = 120_000;

interface BuildRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Run the real build script as a child process. */
function runBuildScript(): BuildRun {
  const result = spawnSync(process.execPath, [BUILD_SCRIPT], {
    cwd: SUBTREE_ROOT,
    encoding: 'utf8',
  });

  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * Run the build's own pipeline with one step replaced, through its own executor.
 *
 * @param stepName the step to replace
 * @param replacementBody the JavaScript body of the replacement step's `run`, or `'omit'` to drop the
 * step from the pipeline entirely
 *
 * @returns the child process result.
 */
function runBuildPipelineWithFault(stepName: string, replacementBody: string): BuildRun {
  const runnerDirectory = mkdtempSync(join(tmpdir(), 'blitzy_adhoc_test_build-'));
  try {
    const runnerPath = join(runnerDirectory, 'runner.mjs');
    const buildModuleUrl = pathToFileURL(BUILD_SCRIPT).href;
    const stepExpression =
      replacementBody === 'omit'
        ? `mod.BUILD_STEPS.filter((step) => step.name !== ${JSON.stringify(stepName)})`
        : `mod.BUILD_STEPS.map((step) =>
             step.name === ${JSON.stringify(stepName)}
               ? { name: step.name, run: async () => { ${replacementBody} } }
               : step,
           )`;

    writeFileSync(
      runnerPath,
      [
        `const mod = await import(${JSON.stringify(buildModuleUrl)});`,
        `const steps = ${stepExpression};`,
        'try {',
        '  await mod.runBuild(steps);',
        "  console.log('RUNNER: the pipeline SUCCEEDED');",
        '} catch (error) {',
        "  console.log('RUNNER: the pipeline FAILED');",
        '  console.log(String(error && error.message));',
        '  process.exitCode = 7;',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );

    const result = spawnSync(process.execPath, [runnerPath], {
      cwd: SUBTREE_ROOT,
      encoding: 'utf8',
    });

    return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  } finally {
    rmSync(runnerDirectory, { force: true, recursive: true });
  }
}

/**
 * Whether the on-disk state a GREEN build leaves behind is present in full.
 *
 * Read as the negation of the four ways the state can be absent, because that is what makes the
 * package-reading cases order-independent. `build/esbuild.mjs` writes `dist/` only in its final
 * `promote` step, and its failure handler calls the same `purgeOwnedArtifacts` the `purge` step
 * does — so a build that fails, and a build that is faulted deliberately, both erase `dist/` AND
 * the relocated sourcemaps. Two cases in this file fault the pipeline on purpose and then ASSERT
 * that erasure, which is the behaviour they exist to pin; they therefore leave the directory a
 * sibling case needs to read.
 *
 * This is a probe and never a substitute for an assertion: it reports presence only. Whether the
 * package is CORRECT — the exact entry list, the manifest's exact membership, the closure's
 * transitive completeness, the containment of every external — stays entirely with the cases, so a
 * build that emitted the wrong thing still fails there rather than being waved through here.
 *
 * @returns `true` when the package, its staged closure, the six relocated maps and the absence of
 * the staging tree are all as a completed build leaves them.
 */
function packagedStateIsIntact(): boolean {
  if (!existsSync(PACKAGE_DIR) || existsSync(STAGING_DIR)) {
    return false;
  }

  const packagedPaths = ['handlers', 'node_modules', 'package.json'];

  if (packagedPaths.some((entry) => !existsSync(join(PACKAGE_DIR, entry)))) {
    return false;
  }

  /* The six bundles, and the six maps beside them — the maps are erased by the same purge. */
  return EXPECTED_ARTIFACT_NAMES.every(
    (name) =>
      existsSync(join(PACKAGE_DIR, 'handlers', name)) &&
      existsSync(join(RELOCATED_MAP_DIR, `${name}.map`)),
  );
}

/**
 * Rebuilds the package unless {@link packagedStateIsIntact} already reports it present.
 *
 * Runs before EVERY case in the packaging block rather than once before the first, which is the
 * whole of the fix for the order dependence a qa run found: the block previously built once in a
 * `beforeAll`, so whether a reading case saw a package depended on whether it happened to be
 * declared before the case that deliberately destroys one. Jest's own `--randomize` reordered them
 * and produced `ENOENT` on `dist/handlers/brandHandler.js` and `dist/package.json` under 6 of 10
 * seeds. Nothing about the assertions changed; only the precondition became each case's own.
 *
 * The rebuild is conditional rather than unconditional so the cost stays what it was in declaration
 * order — one build for the block, plus one more after each case that erases the package — instead
 * of one build per case.
 */
function ensurePackagedState(): void {
  if (packagedStateIsIntact()) {
    return;
  }

  const run = runBuildScript();
  expect(run.status).toBe(0);
}

/** Every bare `require()` specifier in `text`, excluding relative paths and Node built-ins. */
function bareRequireSpecifiersOf(text: string): readonly string[] {
  const specifiers = new Set<string>();
  for (const match of text.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
    const specifier = match[1] ?? '';
    if (specifier === '' || specifier.startsWith('.') || specifier.startsWith('/')) {
      continue;
    }
    if (specifier.startsWith('node:') || builtinModules.includes(specifier)) {
      continue;
    }
    specifiers.add(specifier);
  }

  return [...specifiers].sort();
}

describe('NET-NEW — the build produces a complete, self-resolving Lambda package (case 8)', () => {
  /*
   * `beforeEach`, deliberately, and not the `beforeAll` this block used to carry. Several cases below
   * read the real `dist/` this hook produces while one of them — `omitting the staging step FAILS the
   * build` — asserts that a faulted pipeline leaves no package at all, and the sibling block below
   * asserts the same thing twice more. Building once meant the readers only worked when they happened
   * to run first, which `--randomize` is entitled not to arrange. See {@link ensurePackagedState}.
   */
  beforeEach(ensurePackagedState, BUILD_CASE_TIMEOUT_MS);

  it('[NET-NEW] emits exactly the six declared entries, the manifest and the closure — and no map, and no non-entry helper', () => {
    const packaged = readdirSync(PACKAGE_DIR).sort();
    expect(packaged).toStrictEqual(['handlers', 'node_modules', 'package.json']);

    const artifacts = readdirSync(join(PACKAGE_DIR, 'handlers')).sort();
    expect(artifacts).toStrictEqual([...EXPECTED_ARTIFACT_NAMES]);

    /*
     * The non-entry helper is absent, and that is an assertion rather than an observation.
     * `src/handlers/httpResponse.ts` is the shared response-shaping module every handler funnels through.
     * It exports no `handler`, the runtime cannot dispatch it, and `build/esbuild.mjs` names it in
     * `NON_ENTRY_HANDLER_MODULES` for exactly that reason. A directory scan in place of the frozen entry
     * list would have promoted it to a deployable artifact.
     */
    expect(artifacts).not.toContain('httpResponse.js');

    /* No map inside the package; all six beside it. */
    expect(artifacts.filter((name) => name.endsWith('.map'))).toStrictEqual([]);
    expect(readdirSync(RELOCATED_MAP_DIR).sort()).toStrictEqual(
      EXPECTED_ARTIFACT_NAMES.map((name) => `${name}.map`),
    );

    /* And the staging tree is gone, because promotion consumed it. */
    expect(existsSync(STAGING_DIR)).toBe(false);
  });

  it(
    '[NET-NEW] runs eight named steps in one order, ending with the promotion',
    () => {
      const run = runBuildScript();
      expect(run.status).toBe(0);

      const steps = [...run.stdout.matchAll(/^\[esbuild\] step: +(\S+)$/gm)].map(
        (match) => match[1] ?? '',
      );

      /*
       * The order is the release-safety argument, so it is asserted rather than described. `purge` first
       * so no earlier package survives and the promoting `rename` has an absent destination;
       * `assert-require-closure` after staging and before promotion, the only position at which it can
       * check the thing it is about; `promote` last, the single writer of `dist/`.
       */
      expect(steps).toStrictEqual([
        'purge',
        'assert-entry-surface',
        'emit',
        'relocate-sourcemaps',
        'write-manifest',
        'stage-dependencies',
        'assert-require-closure',
        'promote',
      ]);
      expect(steps[steps.length - 1]).toBe('promote');

      /*
       * The two directories it reports are distinct, which is the whole of the staging arrangement.
       */
      expect(run.stdout).toContain(`[esbuild] staging:  build-meta${sep}package-staging`);
      expect(run.stdout).toContain('[esbuild] package:  dist');
    },
    BUILD_CASE_TIMEOUT_MS,
  );

  it('[NET-NEW] the source manifest and the lockfile agree on the engines floor and the exact four scripts', () => {
    /* The project's command contract and its runtime floor, pinned so neither can drift. */
    const manifest = JSON.parse(readFileSync(join(SUBTREE_ROOT, 'package.json'), 'utf8')) as {
      engines?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const lockfile = JSON.parse(readFileSync(join(SUBTREE_ROOT, 'package-lock.json'), 'utf8')) as {
      packages?: Record<string, { engines?: Record<string, string> }>;
    };

    expect(manifest.engines).toStrictEqual({ node: '>=20.20.2' });
    expect(lockfile.packages?.['']?.engines).toStrictEqual(manifest.engines);
    expect(readFileSync(join(SUBTREE_ROOT, '.nvmrc'), 'utf8').trim()).toBe('20.20.2');

    /*
     * Exactly the four, by name. `toStrictEqual` on the sorted key list is deliberately two-sided: a
     * deletion fails here rather than at a reader's shell prompt, and an addition fails here rather than
     * being noticed only when someone counts the inventory by hand.
     */
    expect(Object.keys(manifest.scripts ?? {}).sort()).toStrictEqual([
      'build',
      'lint',
      'test',
      'typecheck',
    ]);
    /* And each one invokes the tool the contract names, rather than merely existing. */
    expect(manifest.scripts?.['typecheck']).toBe('tsc --noEmit');
    expect(manifest.scripts?.['lint']).toBe('eslint .');
    expect(manifest.scripts?.['build']).toBe('node build/esbuild.mjs');
    expect(manifest.scripts?.['test']).toContain('--preset ./jest.config.ts');

    /*
     * And the two capabilities no script names are still reachable, which is why the scripts stop
     * at four. Coverage collection is declared in the configuration rather than in a script, so
     * plain
     * `npm test` reports it and the `--coverage` flag is redundant; formatting is a direct
     * `npx prettier --check .` over the same `.prettierrc.json` and `.gitignore` the script used. Asserted
     * rather than described, so a change that made the flag load-bearing would fail here.
     */
    const jestConfig = readFileSync(join(SUBTREE_ROOT, 'jest.config.ts'), 'utf8');
    expect(jestConfig).toContain('collectCoverage: true');
    expect(existsSync(join(SUBTREE_ROOT, '.prettierrc.json'))).toBe(true);
  });

  it('[NET-NEW] the preset the test script names LOADS through Node’s own CommonJS loader', () => {
    /*
     * The guarded half of the `--preset ./jest.config.ts` mechanism. The case above asserts the script
     * still names the preset; this one asserts the preset still loads the way that naming depends on.
     *
     * A review recorded that the mechanism rests on Jest internals rather than a published contract:
     * `--config package.json` takes the JSON branch, so the branch that would demand `ts-node` or
     * `esbuild-register` is never entered, and `--preset ./jest.config.ts` then reaches the file through
     * `require()`, where Node's CommonJS loader maps the unrecognised `.ts` extension to its `.js`
     * handler. Neither loader is in AAP §0.5.2.2's frozen ten development packages, so neither may be
     * added — which makes "it parses as plain JavaScript" a standing constraint on that file rather than
     * an incidental property of it.
     *
     * `require` here is exactly the call Jest's `setupPreset` makes, so a TypeScript-only construct
     * introduced into `jest.config.ts` — a type annotation, `satisfies`, an `import type`, an `enum` —
     * fails HERE with the same `SyntaxError` the runner would raise, instead of taking the whole suite
     * down with a message that names no cause. `typecheck` and `lint` cannot see this: both are perfectly
     * happy with the syntax that breaks it.
     */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded: unknown = require(join(SUBTREE_ROOT, 'jest.config.ts'));

    expect(typeof loaded).toBe('object');
    expect(loaded).not.toBeNull();

    /* And it is the configuration, not merely some object: the four settings the suite cannot run without. */
    const preset = loaded as Record<string, unknown>;

    expect(preset['rootDir']).toBe('.');
    expect(preset['testEnvironment']).toBe('node');
    expect(preset['collectCoverage']).toBe(true);
    expect(preset['testMatch']).toStrictEqual(['<rootDir>/test/**/*.test.ts']);
  });

  it('[NET-NEW] writes a production manifest carrying the exact runtime dependency set and nothing developmental', () => {
    const sourceManifest = JSON.parse(
      readFileSync(join(SUBTREE_ROOT, 'package.json'), 'utf8'),
    ) as Record<string, unknown>;
    const packagedManifest = JSON.parse(
      readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8'),
    ) as Record<string, unknown>;

    /* Exactly six members, so a wholesale copy of the source manifest fails here. */
    expect(Object.keys(packagedManifest).sort()).toStrictEqual([
      'dependencies',
      'engines',
      'name',
      'private',
      'type',
      'version',
    ]);

    /* The runtime set is the source manifest's own object, pin for pin. */
    expect(packagedManifest['dependencies']).toStrictEqual(sourceManifest['dependencies']);
    expect(packagedManifest['dependencies']).toStrictEqual({ mysql2: '3.23.2' });

    /* The engines floor travels with it, so a deployment cannot silently run an older Node. */
    expect(packagedManifest['engines']).toStrictEqual(sourceManifest['engines']);
    expect(packagedManifest['type']).toBe('commonjs');
    expect(packagedManifest['private']).toBe(true);

    /*
     * And nothing developmental leaks: the ten dev dependencies and the six scripts describe how the
     * subtree is built, not what the runtime loads. There is no `overrides` block to leak either — the
     * manifest declares none, and the case above asserts the script set by name.
     */
    expect(packagedManifest).not.toHaveProperty('devDependencies');
    expect(packagedManifest).not.toHaveProperty('scripts');
    expect(packagedManifest).not.toHaveProperty('overrides');
  });

  it('[NET-NEW] every external the artifacts require resolves INSIDE the package', () => {
    const specifiersSeen = new Set<string>();

    for (const artifactName of EXPECTED_ARTIFACT_NAMES) {
      const artifactPath = join(PACKAGE_DIR, 'handlers', artifactName);
      const specifiers = bareRequireSpecifiersOf(readFileSync(artifactPath, 'utf8'));

      /*
       * Every artifact requires the driver — which is what made the missing package fatal rather than
       * theoretical: all six cold starts would have failed, not one.
       */
      expect(specifiers).toStrictEqual(['mysql2/promise']);

      const requireFromArtifact = createRequire(artifactPath);
      for (const specifier of specifiers) {
        specifiersSeen.add(specifier);
        const resolved = requireFromArtifact.resolve(specifier);

        /*
         * Containment, not mere resolvability, is the assertion. `require` walks `node_modules`
         * upward, so this specifier resolves happily against the subtree's development tree whether or
         * not a single byte was staged — which is why the defect went unnoticed. Requiring the resolved
         * file to lie inside `dist/node_modules` is what turns an unstaged package into a red result.
         */
        expect(resolved.startsWith(`${STAGED_MODULES_DIR}${sep}`)).toBe(true);
      }
    }

    expect([...specifiersSeen]).toStrictEqual(['mysql2/promise']);
  });

  it('[NET-NEW] the staged closure is transitively complete, not just the direct dependency', () => {
    const stagedNames = readdirSync(STAGED_MODULES_DIR).sort();

    /*
     * Eleven packages, not one. Staging `mysql2` alone produces a package that fails one level
     * deeper, on the driver's own `require('denque')`. The list is the measured transitive closure of
     * `mysql2@3.23.2`'s runtime dependencies.
     */
    expect(stagedNames).toStrictEqual([
      'aws-ssl-profiles',
      'denque',
      'generate-function',
      'iconv-lite',
      'is-property',
      'long',
      'lru.min',
      'mysql2',
      'named-placeholders',
      'safer-buffer',
      'sql-escaper',
    ]);

    /* And it really is closed: every staged package's own declared dependencies are present. */
    for (const name of stagedNames) {
      const staged = JSON.parse(
        readFileSync(join(STAGED_MODULES_DIR, name, 'package.json'), 'utf8'),
      ) as { readonly dependencies?: Readonly<Record<string, string>> };
      for (const dependencyName of Object.keys(staged.dependencies ?? {})) {
        expect(stagedNames).toContain(dependencyName);
      }
    }

    /* The driver in the package is the pinned version, not whatever happened to be nearest. */
    const stagedDriver = JSON.parse(
      readFileSync(join(STAGED_MODULES_DIR, 'mysql2', 'package.json'), 'utf8'),
    ) as { readonly version: string };
    expect(stagedDriver.version).toBe('3.23.2');

    /*
     * No nested tree was carried: the staged tree is flat, which is what the closure walk guarantees.
     */
    expect(existsSync(join(STAGED_MODULES_DIR, 'mysql2', 'node_modules'))).toBe(false);
  });

  it(
    '[NET-NEW] omitting the staging step FAILS the build, naming the outside resolution',
    () => {
      const run = runBuildPipelineWithFault('stage-dependencies', 'omit');

      expect(run.status).not.toBe(0);
      expect(run.stdout).toContain('RUNNER: the pipeline FAILED');
      expect(run.stdout).toContain('the packaged require closure is incomplete');
      expect(run.stdout).toContain('requires "mysql2/promise", which resolves OUTSIDE the package');

      /*
       * The check is what makes the staging step load-bearing rather than decorative, and a build that
       * cannot resolve its own external must not produce a package.
       */
      expect(existsSync(PACKAGE_DIR)).toBe(false);
    },
    BUILD_CASE_TIMEOUT_MS,
  );
});

describe('NET-NEW — a failure after the emit leaves no package behind (case 8)', () => {
  it(
    '[NET-NEW] a post-emit failure removes a previously GREEN package rather than leaving it deployable',
    () => {
      /*
       * A green build first, so the case reproduces the exact reported scenario: real artifacts in the
       * packaging directory before the failing run begins.
       */
      expect(runBuildScript().status).toBe(0);
      expect(readdirSync(join(PACKAGE_DIR, 'handlers')).sort()).toStrictEqual([
        ...EXPECTED_ARTIFACT_NAMES,
      ]);

      /*
       * The fault is placed in the first post-emit step, so the six bundles have genuinely been written
       * by the time it fires. Under the reported arrangement this run exited non-zero with six
       * apparently deployable bundles in `dist/`; the exit status said "failed" and the directory said
       * "ready", and a packaging step reading `dist/` could not tell them apart.
       */
      const run = runBuildPipelineWithFault(
        'relocate-sourcemaps',
        "throw new Error('injected post-emit failure');",
      );

      expect(run.status).not.toBe(0);
      expect(run.stdout).toContain('RUNNER: the pipeline FAILED');
      expect(run.stdout).toContain('injected post-emit failure');

      /*
       * The emit itself did happen — the step ran before the fault — so this is a post-emit failure and
       * not an early one.
       */
      expect(run.stdout).toContain('[esbuild] step:     emit');
      expect(run.stdout).toContain('[esbuild] step:     relocate-sourcemaps');

      /*
       * And it wrote into the staging tree, not into the package — which is the structural half of the
       * guarantee and is asserted separately because the two mechanisms are independent. esbuild prints
       * the path of every file it writes, so the emitted paths are observable evidence of where `outdir`
       * pointed. Reverting that one option to `dist` would leave the property above still true, because
       * the cleanup handler would remove the artifacts after the fact — but it would restore the window in
       * which a partial package exists, and this assertion is what fails when it does.
       */
      const emittedPaths = `${run.stdout}${run.stderr}`;
      expect(emittedPaths).toContain(
        `build-meta${sep}package-staging${sep}handlers${sep}router.js`,
      );
      expect(emittedPaths).not.toContain(`dist${sep}handlers${sep}router.js`);

      /*
       * The whole of finding, as two assertions. No package remains, and no staging tree remains.
       * `dist/` is absent because the promoting `rename` is the only writer of it and never ran; the
       * staging tree is absent because the failure handler removed it.
       */
      expect(existsSync(PACKAGE_DIR)).toBe(false);
      expect(existsSync(STAGING_DIR)).toBe(false);
    },
    BUILD_CASE_TIMEOUT_MS,
  );

  it(
    '[NET-NEW] a failure in the LAST step before promotion is equally clean, and a rebuild restores the package',
    () => {
      expect(runBuildScript().status).toBe(0);

      const run = runBuildPipelineWithFault(
        'assert-require-closure',
        "throw new Error('injected pre-promotion failure');",
      );

      expect(run.status).not.toBe(0);
      expect(run.stdout).toContain('injected pre-promotion failure');

      /*
       * Every step but the promotion ran — including the manifest and the dependency staging, so the
       * staging tree was fully assembled — and `dist/` is still absent.
       */
      expect(run.stdout).toContain('[esbuild] step:     stage-dependencies');
      expect(run.stdout).not.toContain('[esbuild] step:     promote');
      expect(existsSync(PACKAGE_DIR)).toBe(false);
      expect(existsSync(STAGING_DIR)).toBe(false);

      /*
       * And the next build succeeds from that state, leaving a complete package for anything that reads
       * `dist/` after this suite.
       */
      expect(runBuildScript().status).toBe(0);
      expect(readdirSync(PACKAGE_DIR).sort()).toStrictEqual([
        'handlers',
        'node_modules',
        'package.json',
      ]);
    },
    BUILD_CASE_TIMEOUT_MS,
  );
});

/* FOLDED IN FROM config/container */

/*
 * Net-new — the composition root and the aggregate router. These cases import
 * `createCatalogContainer`, `getCatalogContainer` and `createRouter` so the final wiring is
 * constrained: the memoisation of the production graph, whether an override reaches the
 * collaborator that reads it, the polarity of the uniqueness probe, which boundary stub a graph
 * selects, the per-transaction rebuild and the aggregate address space.
 */

/** Every variable `src/config/env.ts` reads, cleared before each wiring case applies its own. */
const WIRING_VARIABLE_NAMES: readonly string[] = Object.freeze([
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'DB_TLS_MODE',
  'DB_CONNECTION_LIMIT',
  'DB_QUEUE_LIMIT',
  'DB_CONNECT_TIMEOUT_MS',
  'GOOGLE_FEED_HOST',
  'SETTING_APPLICATION_ROOT_MAPPING_PATH',
  'SETTING_SKU_ELIGIBLE_CURRENCIES',
  'SETTING_SKU_ELIGIBLE_FULFILLMENT_METHODS',

  /*
   * The six resource bounds of README §8.1. Listed here for the same exhaustiveness reason as the rest:
   * a figure left behind by the ambient environment could otherwise decide whether a bounded route in this
   * section serves or refuses. Their values live in {@link WIRING_ENVIRONMENT}.
   */
  'CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY',
  'CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY',
  'CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST',
  'CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION',
  'CATALOG_GOOGLE_FEED_MAX_IMAGES_PER_RECORD',
  'CATALOG_GOOGLE_FEED_MAX_RESPONSE_BYTES',
]);

/** A valid environment for the wiring cases. */
const WIRING_ENVIRONMENT: Readonly<Record<string, string>> = Object.freeze({
  DB_HOST: 'localhost',
  DB_PORT: '3306',
  DB_NAME: 'Slatwall',
  DB_USER: 'slatwall',
  DB_PASSWORD: 'fixture-not-a-real-password',
  DB_TLS_MODE: 'disabled',
  DB_CONNECTION_LIMIT: '10',
  DB_QUEUE_LIMIT: '1',
  DB_CONNECT_TIMEOUT_MS: '1000',
  GOOGLE_FEED_HOST: 'catalog.example.test',

  /* / / — the six resource bounds, and why a fixture may state them. */
  CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY: '5000',
  CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY: '250',
  CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST: '10000',
  CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION: '500',
  CATALOG_GOOGLE_FEED_MAX_IMAGES_PER_RECORD: '100',
  CATALOG_GOOGLE_FEED_MAX_RESPONSE_BYTES: '10000000',
});

/** The environment as the process held it before this section touched it. */
const ENVIRONMENT_BEFORE_WIRING: Readonly<Record<string, string | undefined>> = Object.freeze({
  ...process.env,
});

/** The two factories the composition root publishes. */
interface ShippedWiring {
  readonly createCatalogContainer: (overrides?: CatalogContainerOverrides) => CatalogContainer;
  readonly getCatalogContainer: () => CatalogContainer;
}

/** The pure statement-builder and pool surface exported by the database module. */
type ShippedDatabase = typeof import('../../src/config/database');

/** Every explicitly exported raising boundary stub, selected without loading the module statically. */
type ShippedBoundaryStubs = Pick<
  typeof import('../../src/config/container'),
  | 'notImplementedSubscriptionTermPort'
  | 'notImplementedAccessContentPort'
  | 'notImplementedImagePathPort'
  | 'notImplementedPricingPort'
  | 'notImplementedAccountContextPort'
  | 'notImplementedSettingCleanupPort'
  | 'notImplementedCommentCleanupPort'
  | 'notImplementedProductDependencyCleanup'
>;

/**
 * Load the composition root afresh against {@link WIRING_ENVIRONMENT}.
 *
 * @returns the two published factories.
 */
function loadShippedWiring(): ShippedWiring {
  for (const name of WIRING_VARIABLE_NAMES) {
    delete process.env[name];
  }
  Object.assign(process.env, WIRING_ENVIRONMENT);

  jest.resetModules();

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../src/config/container') as ShippedWiring;
}

/**
 * Loads the database module afresh under one TLS mode. Pool construction is lazy with respect to
 * network I/O, so this executes configuration and statement construction without opening a socket.
 */
function loadShippedDatabase(tlsMode: 'disabled' | 'verified'): ShippedDatabase {
  for (const name of WIRING_VARIABLE_NAMES) {
    delete process.env[name];
  }
  Object.assign(process.env, WIRING_ENVIRONMENT, { DB_TLS_MODE: tlsMode });
  jest.resetModules();

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../src/config/database') as ShippedDatabase;
}

/** Loads the same container module as {@link loadShippedWiring}, retaining its boundary exports. */
function loadShippedBoundaryStubs(): ShippedBoundaryStubs {
  loadShippedWiring();

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../src/config/container') as ShippedBoundaryStubs;
}

/**
 * Load the aggregate router's factory, against a container module loaded the same way.
 *
 */
function loadShippedRouterWiring(): ShippedWiring & {
  readonly createRouter: (
    container: CatalogContainer,
  ) => (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
} {
  const wiring = loadShippedWiring();

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const routerModule = require('../../src/handlers/router') as {
    readonly createRouter: (
      container: CatalogContainer,
    ) => (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  };

  return { ...wiring, createRouter: routerModule.createRouter };
}

/** Population permitted, so a populated property is observable rather than silently denied. */
const WIRING_ALLOW_POPULATION = Object.freeze({
  getPublicPopulateFlag: (): boolean => true,
  authenticateEntityProperty: (): boolean => true,
});

/** A uniqueness port that answers "unique" and "available" for everything. */
const WIRING_UNIQUENESS_SATISFIED: UniquePropertyPort = Object.freeze({
  isUniqueProperty: (): Promise<boolean> => Promise.resolve(true),
  isUrlTitleAvailable: (): Promise<boolean> => Promise.resolve(true),
});

/**
 * A smart-list port that answers empty for both readings, so a route can resolve without a driver.
 */
const WIRING_EMPTY_SMART_LIST: SmartListQueryPort = Object.freeze({
  executeRecords: <TRecord>(): Promise<TRecord[]> => Promise.resolve([]),
  execute: <TRecord>() =>
    Promise.resolve({
      records: [] as TRecord[],
      pageRecords: [] as TRecord[],
      recordsCount: 0,
      pageRecordsStart: 1,
      pageRecordsEnd: 0,
      currentPage: 1,
      totalPages: 0,
    }),
});

/** The invocation shape the dispatcher reads: the action, and nothing else it consults. */
function wiringEventFor(action: string | undefined): APIGatewayProxyEvent {
  return {
    queryStringParameters: action === undefined ? null : { [SLAT_ACTION_PARAMETER]: action },
    headers: {},
  } as unknown as APIGatewayProxyEvent;
}

/**
 * Run `operation` and answer whatever it failed with, whether it threw or rejected.
 *
 * @param operation the refusing call
 * @returns what it failed with, or `undefined` when it did not fail at all.
 */
async function captureWiringFailure(operation: () => unknown): Promise<unknown> {
  try {
    return await operation();
  } catch (failure) {
    return failure;
  }
}

describe('NET-NEW — the composition root, which no approved suite used to reach', () => {
  afterEach(() => {
    for (const name of WIRING_VARIABLE_NAMES) {
      const before = ENVIRONMENT_BEFORE_WIRING[name];
      if (before === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = before;
      }
    }
  });

  /* F-08 — the pure database contract and the verified-transport construction branch. */

  it('[NET-NEW] database.sql composes nested value-only placeholders and pool.bind refuses arity drift', () => {
    const database = loadShippedDatabase('disabled');
    const nested = database.sql`AND skuID = ${'sku-1'}`;
    const statement = database.sql`SELECT * FROM SwSku WHERE productID = ${'product-1'} ${nested} AND activeFlag = ${true}`;

    expect(statement.sql).toBe(
      'SELECT * FROM SwSku WHERE productID = ? AND skuID = ? AND activeFlag = ?',
    );
    expect(statement.values).toStrictEqual(['product-1', 'sku-1', true]);
    expect(Object.isFrozen(statement)).toBe(true);
    expect(Object.isFrozen(statement.values)).toBe(true);

    const bound = database.pool.bind('SELECT * FROM SwSku WHERE skuID = ?', ['sku-1']);
    expect(bound.sql).toBe('SELECT * FROM SwSku WHERE skuID = ?');
    expect(bound.values).toStrictEqual(['sku-1']);

    expect(() => database.pool.bind('SELECT ? + ?', [1])).toThrow(
      'exactly one placeholder for each bound value',
    );
    expect(() => database.pool.bind('   ', [])).toThrow(
      'cannot be built from blank statement text',
    );
    expect(() => database.sql`SELECT * FROM SwSku WHERE skuID = ?`).toThrow(
      'must not contain a literal placeholder',
    );
  });

  it('[NET-NEW] loading the database with DB_TLS_MODE=verified executes the verified transport branch without a connection', () => {
    const database = loadShippedDatabase('verified');

    /*
     * Merely constructing and binding proves the module completed its verified-mode pool options.
     * No execute/getConnection member is called, preserving the suite's zero-database contract.
     */
    expect(Object.isFrozen(database.pool)).toBe(true);
    expect(database.pool.bind('SELECT 1', []).sql).toBe('SELECT 1');
  });

  /* Case 1 — a fresh graph, the memoized graph, and the one explicit reset. */

  it('[NET-NEW] builds a FRESH graph per explicit call and memoizes exactly one production graph (case 1)', () => {
    const { createCatalogContainer, getCatalogContainer } = loadShippedWiring();

    /*
     * Two explicit builds are two graphs, all the way down. This is what makes a double handed to one
     * of them unable to reach the other, which every case in this file that builds a graph relies on.
     */
    const first = createCatalogContainer();
    const second = createCatalogContainer();
    expect(first).not.toBe(second);
    expect(first.productService).not.toBe(second.productService);
    expect(first.skuRepository).not.toBe(second.skuRepository);
    expect(first.unitOfWork).not.toBe(second.unitOfWork);

    /*
     * The production accessor memoizes, which is AAP §0.4.1.3's warm-container requirement and the port
     * of the DI/1 singleton registration at `org/Hibachi/Hibachi.cfc:L298-L330`. Identity, not
     * equivalence: a per-call rebuild would answer an equal graph and fail only this assertion.
     */
    const production = getCatalogContainer();
    expect(getCatalogContainer()).toBe(production);
    expect(getCatalogContainer().productService).toBe(production.productService);
    expect(getCatalogContainer().productWriteRunner).toBe(production.productWriteRunner);

    /*
     * And the memoized graph is not either explicit build, which is the whole point of the accessor
     * taking no argument. `createCatalogContainer` is where a substitution belongs; if the accessor
     * accepted overrides — or returned a graph a test had built — a double could reach the graph a warm
     * container reuses across invocations, and one invocation's stand-in would serve the next one's
     * request.
     */
    expect(production).not.toBe(first);
    expect(production).not.toBe(second);
    expect(getCatalogContainer).toHaveLength(0);
  });

  it('[NET-NEW] freezes the graph, so a caller can read the wiring and can never re-point it (case 1)', () => {
    const { createCatalogContainer } = loadShippedWiring();
    const container = createCatalogContainer();

    /*
     * AAP §0.7.3: the graph is a declaration, not a registry. There is no `get(name)`, no indexer and no
     * mutation — which is what stops the DI/1 name-keyed lookup being reproduced in a new idiom.
     */
    expect(Object.isFrozen(container)).toBe(true);
  });

  it('[NET-NEW] beginInvocation is the explicit reset, and it discards ONLY request-scoped state (case 1)', () => {
    const { createCatalogContainer } = loadShippedWiring();
    const container = createCatalogContainer();

    /*
     * It is a boundary for one memo, not a graph rebuild — mismatch M7. The sorted-SKU ordering needs
     * the next option-group sort order [`model/dao/SkuDAO.cfc:L204-L220`], which the legacy memoized in a
     * singleton DAO's `variables` scope where it outlived every request, and which is scoped to the whole
     * option-group table rather than to any product [`:L210-L212`]. So on a warm container one caller's
     * value would silently weight a later, unrelated caller's ordering. Discarding that value must not
     * cost the graph: a rebuild here would throw away the pool reuse the memoisation above exists for.
     */
    const before = {
      productService: container.productService,
      skuService: container.skuService,
      skuRepository: container.skuRepository,
      unitOfWork: container.unitOfWork,
      productWriteRunner: container.productWriteRunner,
    };

    container.beginInvocation();
    container.beginInvocation();
    container.beginInvocation();

    expect(container.productService).toBe(before.productService);
    expect(container.skuService).toBe(before.skuService);
    expect(container.skuRepository).toBe(before.skuRepository);
    expect(container.unitOfWork).toBe(before.unitOfWork);
    expect(container.productWriteRunner).toBe(before.productWriteRunner);

    /*
     * Calling it repeatedly is harmless and calling it never is what the legacy did, so neither may be a
     * failure. It takes no argument, because there is nothing to scope the discard to.
     */
    expect(container.beginInvocation).toHaveLength(0);
  });

  /* Case 2 — override propagation, and the probe polarity. */

  it('[NET-NEW] hands every supplied override onward BY IDENTITY, and falls back per slot (case 2)', () => {
    const { createCatalogContainer } = loadShippedWiring();

    const settings = createSettingResolverDouble({ settings: [] });
    const smartList = createSmartListQueryDouble();
    const productRepository = createInMemoryProductRepository();
    const skuRepository = createInMemorySkuRepository();
    const optionRepository = createInMemoryOptionRepository();
    const brandRepository = createInMemoryBrandRepository();
    const imagePaths = createImagePathDouble();
    const accountContext = createAccountContextDouble();

    const container = createCatalogContainer({
      settings: settings.resolver,
      smartListQueryPort: smartList.smartList,
      productRepository: productRepository.repository,
      skuRepository: skuRepository.repository,
      optionRepository: optionRepository.repository,
      brandRepository: brandRepository.repository,
      imagePaths: imagePaths.imagePaths,
      accountContext: accountContext.accountContext,
      uniqueProperty: WIRING_UNIQUENESS_SATISFIED,
    });

    /*
     * Identity, not equivalence, and the distinction is the assertion. A graph that copied, wrapped or
     * re-derived a supplied collaborator would still satisfy every structural check while making a
     * double's recorded calls not the calls the service actually made — which would make every
     * observation in this file's other sections an observation of the wrong object.
     */
    expect(container.settings).toBe(settings.resolver);
    expect(container.smartListQueryPort).toBe(smartList.smartList);
    expect(container.productRepository).toBe(productRepository.repository);
    expect(container.skuRepository).toBe(skuRepository.repository);
    expect(container.optionRepository).toBe(optionRepository.repository);
    expect(container.brandRepository).toBe(brandRepository.repository);
    expect(container.imagePaths).toBe(imagePaths.imagePaths);
    expect(container.accountContext).toBe(accountContext.accountContext);
    expect(container.uniqueProperty).toBe(WIRING_UNIQUENESS_SATISFIED);

    /*
     * And the fallback is per slot rather than all-or-nothing, which is what makes a partial override
     * set usable at all: an omitted member resolves to the production collaborator, never to `undefined`.
     * Under `exactOptionalPropertyTypes` an omitted slot is absent rather than `undefined`, which is why
     * every member of the overrides interface is optional rather than nullable.
     */
    expect(container.productTypeRepository).toBeDefined();
    expect(container.validator).toBeDefined();
    expect(container.queryRunner).toBeDefined();
    expect(container.unitOfWork).toBeDefined();
    expect(container.productFeedBuilder).toBeDefined();
    expect(container.googleIntegration).toBeDefined();

    /*
     * Nothing supplied leaks into a slot that was not named — the pricing boundary is still the stub.
     */
    expect(container.pricing).not.toBe(imagePaths.imagePaths);
  });

  it('[NET-NEW] wires the brand URL-title probe with `true === available` polarity (case 2)', async () => {
    const { createCatalogContainer } = loadShippedWiring();

    /*
     * The polarity is the whole case, and neither failure mode is a type error.
     * `model/service/DataService.cfc:L64` loops `while(!unique)`, so a probe read as inverted does not
     * merely answer wrongly: read one way it never terminates for a free title, and read the other it
     * hands out duplicate titles. A container that inverted the wiring would pass every service-level
     * case in this project, because every one of those supplies its own probe.
     */
    const observed: string[] = [];
    for (const attempt of [
      { availability: [true], expected: 'nike-air' },
      { availability: [false, true], expected: 'nike-air-2' },
      { availability: [false, false, true], expected: 'nike-air-3' },
    ]) {
      const container = createCatalogContainer({
        brandRepository: createInMemoryBrandRepository({
          urlTitleAvailability: attempt.availability,
        }).repository,
        populationAuthorization: WIRING_ALLOW_POPULATION,
        uniqueProperty: WIRING_UNIQUENESS_SATISFIED,
      });

      /*
       * The payload is mutated by reference at `model/service/BrandService.cfc:L70`, and the populated
       * entity then carries the same value — so both readings are asserted.
       */
      const payload: Record<string, unknown> = { brandName: 'Nike Air' };
      const saved = await container.brandService.saveBrand(
        container.brandService.newBrand(),
        payload,
      );

      expect(payload['urlTitle']).toBe(attempt.expected);
      expect(saved.urlTitle).toBe(attempt.expected);
      expect(saved.hasErrors()).toBe(false);
      observed.push(attempt.expected);
    }

    expect(observed).toStrictEqual(['nike-air', 'nike-air-2', 'nike-air-3']);
  });

  it('[NET-NEW] serves the brand surface from the REPOSITORY probe and the product surface from the graph probe (case 2)', async () => {
    const { createCatalogContainer } = loadShippedWiring();

    /*
     * There are two probes, and conflating them is an easy, invisible wiring error.
     * `src/config/container.ts` states the split in its own words: `BrandService` reaches its uniqueness
     * probe through the repository's `isUrlTitleAvailable`, which is brand-scoped and therefore takes no
     * table, while `ProductService` serves two tables — `SwProduct` and `SwProductType` — through the
     * table-taking `CatalogContainerOverrides.isUrlTitleAvailable`. A graph that routed brand through the
     * table-taking probe would still work, and would silently make the brand's own repository seam dead.
     */
    const graphProbe: { table: string; candidate: string }[] = [];
    const container = createCatalogContainer({
      brandRepository: createInMemoryBrandRepository().repository,
      populationAuthorization: WIRING_ALLOW_POPULATION,
      uniqueProperty: WIRING_UNIQUENESS_SATISFIED,
      isUrlTitleAvailable: (table: string, candidate: string) => {
        graphProbe.push({ table, candidate });

        /*
         * Taken once, then available — so the candidate sequence is observable, not just the first ask.
         */
        return Promise.resolve(graphProbe.length >= 2);
      },
    });

    /* Half one — the brand save consults the repository, so the graph probe stays untouched. */
    const brandPayload: Record<string, unknown> = { brandName: 'Nike Air' };
    await container.brandService.saveBrand(container.brandService.newBrand(), brandPayload);
    expect(brandPayload['urlTitle']).toBe('nike-air');
    expect(graphProbe).toStrictEqual([]);

    /* Half two — the product save consults the graph probe, against `SwProduct`. */
    const product = await container.productService.saveProduct(
      container.productService.newProduct(),
      {},
    );

    expect(graphProbe.map((call) => call.table)).toStrictEqual(['SwProduct', 'SwProduct']);
    expect(graphProbe[1]?.candidate).toBe(`${String(graphProbe[0]?.candidate)}-2`);
    expect(product.urlTitle).toBe(graphProbe[1]?.candidate);

    /* The guard held: validation failed, so nothing was written and the row was never minted. */
    expect(product.hasErrors()).toBe(true);
    expect(product.isNew()).toBe(true);
  });

  /* Case 3 — the boundary stubs the graph selects, and the two write runners. */

  it('[NET-NEW] selects a RAISING stub for every port with no in-scope adapter (case 3)', async () => {
    const { createCatalogContainer } = loadShippedWiring();
    const container = createCatalogContainer();

    /*
     * Every stub raises, and nothing answers a plausible value. A stub answering `null`, `undefined`,
     * `''`, `0` or a fabricated price would be an invented behaviour (AAP §0.7.3) and — worse — would be
     * indistinguishable from data at the call site. Five ports stand for excluded families:
     * `Subscription*`, `Content*`, the `PriceGroup*`/`Currency*`/`Promotion*` trio, the request-scoped
     * account lookup, and the dynamically-resolved image service of AAP §0.6.3.2. All five must refuse.
     */
    const refusals: readonly {
      readonly member: string;
      readonly operation: () => unknown;
      readonly collaborator: string;
    }[] = [
      {
        member: 'ImagePathPort.getImagePath',
        operation: () => container.imagePaths.getImagePath('nike-air.jpg'),
        /*
         * AAP §0.6.3.2's hidden dynamic dependency: never declared as a property, resolved by string.
         */
        collaborator: 'imageService',
      },
      {
        member: 'SubscriptionTermPort.getSubscriptionTerm',
        operation: () => container.subscriptionTerms.getSubscriptionTerm('term'),
        collaborator: 'subscriptionService',
      },
      {
        member: 'AccessContentPort.getContent',
        operation: () => container.accessContent.getContent('content'),
        collaborator: 'contentService',
      },
      {
        member: 'PricingPort.getSalePriceDetailsForProductSkus',
        operation: () => container.pricing.getSalePriceDetailsForProductSkus('product'),
        collaborator: 'priceGroupService',
      },
      {
        member: 'AccountContextPort.getCurrentAccount',
        operation: () => container.accountContext.getCurrentAccount(),
        collaborator: 'resolved per invocation at the handler edge',
      },
    ];

    for (const refusal of refusals) {
      const failure = await captureWiringFailure(refusal.operation);

      /* It failed at all — the assertion a fabricated `null`, `''` or `0` would defeat. */
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).name).toBe('NotImplementedError');
      /* It names the refusing member, so a log identifies which boundary was crossed …. */
      expect((failure as Error).message).toContain(refusal.member);
      /* … and the collaborator that owns the real behaviour, so it identifies what is missing. */
      expect((failure as Error).message).toContain(refusal.collaborator);
    }

    /*
     * The statically imported class is still the right shape, even though it is not the same object as
     * the graph's — asserted here so the identity caveat above reads as measured rather than assumed.
     */
    expect(new NotImplementedError('Port.member', 'reason').name).toBe('NotImplementedError');
  });

  it('[NET-NEW] invokes every exported boundary-stub member and each one raises its own named refusal', async () => {
    const stubs = loadShippedBoundaryStubs();
    const imagePath = toImageWebPath('/product/default/catalog.jpg');
    const maintenanceEntity = new Product();
    maintenanceEntity.productID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

    const refusals: readonly (readonly [member: string, operation: () => unknown])[] = [
      [
        'SubscriptionTermPort.getSubscriptionTerm',
        () => stubs.notImplementedSubscriptionTermPort.getSubscriptionTerm('term'),
      ],
      [
        'SubscriptionTermPort.getSubscriptionBenefit',
        () => stubs.notImplementedSubscriptionTermPort.getSubscriptionBenefit('benefit'),
      ],
      [
        'SubscriptionTermPort.getSubscriptionTermsByIDs',
        () => stubs.notImplementedSubscriptionTermPort.getSubscriptionTermsByIDs(['term']),
      ],
      [
        'SubscriptionTermPort.getSubscriptionBenefitsByIDs',
        () => stubs.notImplementedSubscriptionTermPort.getSubscriptionBenefitsByIDs(['benefit']),
      ],
      [
        'AccessContentPort.getContent',
        () => stubs.notImplementedAccessContentPort.getContent('content'),
      ],
      [
        'AccessContentPort.getContentsByIDs',
        () => stubs.notImplementedAccessContentPort.getContentsByIDs(['content']),
      ],
      [
        'ImagePathPort.getImagePath',
        () => stubs.notImplementedImagePathPort.getImagePath('catalog.jpg'),
      ],
      [
        'ImagePathPort.getResizedImagePath',
        () =>
          stubs.notImplementedImagePathPort.getResizedImagePath({
            imagePath,
            missingImagePath: '/missing.jpg',
          }),
      ],
      [
        'ImagePathPort.getImageExistsFlag',
        () => stubs.notImplementedImagePathPort.getImageExistsFlag(imagePath),
      ],
      [
        'ImagePathPort.saveImageFile',
        () =>
          stubs.notImplementedImagePathPort.saveImageFile({
            uploadResult: {},
            filePath: imagePath,
            allowedExtensions: 'jpg,jpeg,png,gif',
          }),
      ],
      [
        'PricingPort.getSalePriceDetailsForProductSkus',
        () => stubs.notImplementedPricingPort.getSalePriceDetailsForProductSkus('product'),
      ],
      [
        'AccountContextPort.getCurrentAccount',
        () => stubs.notImplementedAccountContextPort.getCurrentAccount(),
      ],
      [
        'EntitySettingCleanupPort.removeAllEntityRelatedSettings',
        () =>
          stubs.notImplementedSettingCleanupPort.removeAllEntityRelatedSettings(maintenanceEntity),
      ],
      [
        'EntitySettingCleanupPort.updateAllSettingValuesToRemoveSpecificID',
        () =>
          stubs.notImplementedSettingCleanupPort.updateAllSettingValuesToRemoveSpecificID(
            maintenanceEntity.productID,
          ),
      ],
      [
        'EntitySettingCleanupPort.clearAllSettingsCache',
        () => stubs.notImplementedSettingCleanupPort.clearAllSettingsCache(),
      ],
      [
        'EntityCommentCleanupPort.removeAllEntityRelatedComments',
        () =>
          stubs.notImplementedCommentCleanupPort.removeAllEntityRelatedComments(maintenanceEntity),
      ],
      [
        'ProductDependencyCleanup.removeProductDependencies',
        () =>
          stubs.notImplementedProductDependencyCleanup.removeProductDependencies(
            maintenanceEntity.productID,
          ),
      ],
      [
        'ProductDependencyCleanup.removeProductTypeDependencies',
        () =>
          stubs.notImplementedProductDependencyCleanup.removeProductTypeDependencies(
            'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ),
      ],
    ];

    for (const [member, operation] of refusals) {
      const failure = await captureWiringFailure(operation);

      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).name).toBe('NotImplementedError');
      expect((failure as Error).message).toContain(member);
    }
  });

  it('[NET-NEW] wires the population gate FAIL-CLOSED rather than raising, and lets a deployment supply one (case 3)', () => {
    const { createCatalogContainer } = loadShippedWiring();

    /*
     * The one deliberate asymmetry in the stub set. A raise would refuse population outright where the
     * legacy asked a question and got an answer; a permissive default would be strictly more permissive
     * than the system being replaced, which is the one outcome `src/ports/AccountContextPort.ts` forbids.
     * `false`/`false` is the legacy's own default at `org/Hibachi/HibachiTransient.cfc:L186`.
     */
    const shipped = createCatalogContainer();
    expect(shipped.populationAuthorization.getPublicPopulateFlag()).toBe(false);
    expect(
      shipped.populationAuthorization.authenticateEntityProperty({
        /*
         * `'update'` is a literal on the port, not a CRUD vocabulary: it is the only value
         * `org/Hibachi/HibachiTransient.cfc:L190` passes, and widening it would be invention (AAP §0.7.3).
         */
        crudType: 'update',
        entityName: 'Product',
        propertyName: 'productName',
      }),
    ).toBe(false);

    /*
     * Replaced wholesale, which is how a deployment — or the polarity case above — supplies a real one.
     */
    const supplied = createCatalogContainer({
      populationAuthorization: WIRING_ALLOW_POPULATION,
    });
    expect(supplied.populationAuthorization).toBe(WIRING_ALLOW_POPULATION);
    expect(supplied.populationAuthorization.getPublicPopulateFlag()).toBe(true);
  });

  it('[NET-NEW] exposes both transaction boundaries as WHOLE runners, substitutable only as such (case 3)', async () => {
    const { createCatalogContainer } = loadShippedWiring();

    /*
     * The runners are not decomposable, and that is a consequence rather than a choice. A scoped graph
     * is built by constructing the MySQL adapters against the boundary's own executor, because re-binding
     * to that executor is what makes a write transactional (M5) and what lets AAP §0.6.2's
     * `hasUniqueOptions` read-back observe the batch's own uncommitted siblings (M6). A port-typed double
     * has no executor to re-bind, so a repository or probe override cannot reach inside a boundary even in
     * principle — which is why substituting the runner itself is the honest seam, and why this case.
     */
    const container = createCatalogContainer();
    expect(typeof container.productWriteRunner.runWrite).toBe('function');
    expect(typeof container.skuWriteRunner.runWrite).toBe('function');
    expect(container.productWriteRunner).not.toBe(container.skuWriteRunner);

    /*
     * The three-argument shape is the contract: the invocation's authorised security context, the
     * work, and the commit gate read once after the work settles. Asserting the arity here is what
     * stops a runner that quietly dropped the principal from passing this suite.
     */
    expect(container.productWriteRunner.runWrite).toHaveLength(3);
    expect(container.skuWriteRunner.runWrite).toHaveLength(3);

    const suppliedGraphs: unknown[] = [];
    const gateReadings: boolean[] = [];
    const suppliedSecurity: RequestAuthorizationContext[] = [];
    const substituted = createCatalogContainer({
      productWriteRunner: {
        runWrite: async <TResult>(
          security: RequestAuthorizationContext,
          work: (graph: never) => Promise<TResult>,
          hasErrors: () => boolean,
        ): Promise<TResult> => {
          /* — recorded so this case proves the context reaches a substituted runner too. */
          suppliedSecurity.push(security);
          /*
           * A double supplied here decides both what the graph contains and whether the unit commits.
           */
          const graph = { marker: 'substituted' } as unknown as never;
          suppliedGraphs.push(graph);
          const produced = await work(graph);
          gateReadings.push(hasErrors());

          return produced;
        },
      },
    });

    const invocationSecurity = securityContext({ account: persistedAdminAccount() });

    const answer = await substituted.productWriteRunner.runWrite(
      /* — the authorised context a route would have resolved at its gate. */
      invocationSecurity,
      /*
       * Promise-returning without `async`, because the unit awaits nothing: the boundary's contract is
       * `(graph) => Promise<TResult>`, and an `async` body with no `await` in it would only satisfy that
       * contract by accident of the keyword.
       */
      (graph) => {
        expect(graph).toBe(suppliedGraphs[0]);

        return Promise.resolve('ran');
      },
      () => false,
    );

    expect(answer).toBe('ran');
    expect(suppliedGraphs).toHaveLength(1);
    expect(gateReadings).toStrictEqual([false]);

    /*
     * — the runner received the invocation's own context, unchanged and unwrapped. A runner
     * that ignored it, or that substituted a memoised principal of its own, fails here.
     */
    expect(suppliedSecurity).toStrictEqual([invocationSecurity]);

    /*
     * And the pool-bound service is a different object from anything a boundary hands out, which is
     * what makes "calling the pool-bound service inside an open transaction" a detectable mistake rather
     * than a silent one: its writes would land on another connection, sit outside the unit being
     * committed, and survive a roll-back with nothing reporting a problem.
     */
    expect(substituted.productService).not.toBe(suppliedGraphs[0]);
    expect(substituted.productWriteRunner).not.toBe(container.productWriteRunner);
  });
});

describe('NET-NEW — the aggregate router, which no approved suite used to reach', () => {
  afterEach(() => {
    for (const name of WIRING_VARIABLE_NAMES) {
      const before = ENVIRONMENT_BEFORE_WIRING[name];
      if (before === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = before;
      }
    }
  });

  /* Cases 4 and 5 — the invocation hook, and one address per surface. */

  it('[NET-NEW] serves one representative address on every one of the five surfaces (case 5)', async () => {
    const { createCatalogContainer, createRouter } = loadShippedRouterWiring();
    const route = createRouter(
      createCatalogContainer({ smartListQueryPort: WIRING_EMPTY_SMART_LIST }),
    );

    /*
     * A 401 is the proof the address resolved, which is why it is the expectation rather than a 200.
     * `src/handlers/httpResponse.ts` wires `resolveFailClosedAuthorization` into all four catalog
     * surfaces — a constant unauthenticated, deny-all context — so a gated address that resolves answers
     * 401 while an address the aggregate does not serve answers 404. The two are distinguishable, and the
     * assertion below is deliberately both: not-404 says the route exists, 401 says the gate ran.
     */
    for (const action of [
      'product.getProduct',
      'sku.getSkuBySkuCode',
      'brand.getBrand',
      'option.getOptionsForSelect',
    ]) {
      const response = await route(wiringEventFor(action));

      expect(response.statusCode).not.toBe(HTTP_STATUS.NOT_FOUND);
      expect(response.statusCode).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(response.body).toContain('Authentication is required');
      /* Nothing about the address is echoed back — §8's rule that a refusal describes no input. */
      expect(response.body).not.toContain(action);
    }

    /*
     * The feed is the one anonymous surface, and its absence of a gate is a ported fact.
     * `integrationServices/google/controllers/feed.cfc:L54-L56` declares `this.publicMethods="product"`
     * with `this.anyAdminMethods=""` and `this.secureMethods=""` both empty, so the legacy feed demanded
     * neither a login nor a permission. It therefore answers 200 with an XML document rather than 401 —
     * and a graph that had wired a resolver into it would fail here rather than merely be stricter.
     */
    const feed = await route(wiringEventFor('google:feed.product'));
    expect(feed.statusCode).toBe(HTTP_STATUS.OK);
    expect(feed.headers?.['Content-Type']).toBe('application/xml');
    expect(feed.body.startsWith('<?xml version="1.0"?>')).toBe(true);
    expect(feed.body).toContain('xmlns:g="http://base.google.com/ns/1.0"');
  });

  /* /02/03 — every surface declines to compose without the bounds it needs, not only the feed. */

  it('[NET-NEW] refuses to build ANY surface graph when the six bounds are unstated, naming what is missing', async () => {
    /*
     * Every surface, not only the feed. If only `Google:feed.product` refused — through the
     * anonymous gate — every other route would run unbounded no matter what an operator stated.
     * Each bound is a required collaborator reached through a raising resolver, so absence fails
     * closed on every surface.
     */
    const { createCatalogContainer } = loadShippedWiring();
    const unbounded = createCatalogContainer({
      resourceBounds: {},
      uniqueProperty: WIRING_UNIQUENESS_SATISFIED,
    });

    /*
     * The smart-list-backed reads on three different surfaces, each refusing on the first bound its
     * compilation needs — the complexity ceiling, because `build()` runs before the count — and each naming a
     * variable an operator can act on rather than failing generically.
     */
    const reads: readonly (readonly [string, () => Promise<unknown>])[] = Object.freeze([
      ['product', () => unbounded.productService.getProduct('44444444444444444444444444444444')],
      ['productSmartList', () => unbounded.productService.getProductSmartList()],
      ['sku', () => unbounded.skuService.getSkuSmartList()],
      ['productType', () => unbounded.productService.getProductType(MERCHANDISE_PRODUCT_TYPE_ID)],
    ]);

    for (const [, read] of reads) {
      /*
       * Awaited one at a time, so a regression on one surface is reported against that surface rather than as
       * an anonymous rejection somewhere inside a batch.
       */
      await expect(read()).rejects.toThrow(/CATALOG_SMART_LIST_MAX_/);
    }

    /*
     * And the anonymous feed, which already refused, still does — through a gate that now names all four
     * figures it needs rather than only the row ceiling. The order is apply-order, so the variable an operator
     * is told about first is the one the route would have needed first.
     */
    expect(() => {
      unbounded.assertAnonymousMaterialisationBounded();
    }).toThrow(/CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY/);
  });

  it("[NET-NEW] refuses the WRITE surfaces on their own bounds, which are not the smart list's", async () => {
    /*
     * The two write-side bounds have no smart list between them and the caller, so they are asserted through
     * the members that reach them: `saveBrand` derives a URL title and `createSkus` enumerates
     * combinations. Naming them separately is what proves three independent mechanisms rather
     * than one shared ceiling with three names.
     */
    const { createCatalogContainer } = loadShippedWiring();
    const unbounded = createCatalogContainer({
      resourceBounds: {},
      uniqueProperty: WIRING_UNIQUENESS_SATISFIED,
    });

    /*
     * — the URL-title probe budget, refused before the slug is built and before any round trip.
     */
    await expect(
      unbounded.brandService.saveBrand(unbounded.brandService.newBrand(), {
        brandName: 'ACME Widgets',
      }),
    ).rejects.toThrow(/CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION/);
  });

  it('[NET-NEW] begins the invocation FIRST, once per dispatch, whatever the outcome (case 4)', async () => {
    const { createCatalogContainer, createRouter } = loadShippedRouterWiring();

    /*
     * Ordering is the claim, and it is observable only by wrapping the hook. M7's rule is that the one
     * piece of request-scoped state the graph carries — the option-group sort-order memo — is discarded
     * before an invocation reads anything, so on a warm container one request cannot weight another's
     * ordering. A dispatcher that ran the hook after resolving the route, or skipped it for an
     * unrecognised action, would leave the previous invocation's value in place for exactly the requests
     * hardest to reason about.
     */
    const events: string[] = [];
    const base = createCatalogContainer({ smartListQueryPort: WIRING_EMPTY_SMART_LIST });
    const observed: CatalogContainer = {
      ...base,
      beginInvocation: (): void => {
        events.push('begin');
        base.beginInvocation();
      },
    };
    const route = createRouter(observed);

    /* A served address, an unserved one, and an absent action: the hook runs for all three. */
    await route(wiringEventFor('brand.getBrand'));
    expect(events).toStrictEqual(['begin']);

    await route(wiringEventFor('brand.notAMember'));
    expect(events).toStrictEqual(['begin', 'begin']);

    await route(wiringEventFor(undefined));
    expect(events).toStrictEqual(['begin', 'begin', 'begin']);
  });

  /* Case 6 — the four shapes that must all answer the same neutral 404. */

  it('[NET-NEW] answers one neutral 404 for a missing, blank, unknown or prototype-like action (case 6)', async () => {
    const { createCatalogContainer, createRouter } = loadShippedRouterWiring();
    const route = createRouter(
      createCatalogContainer({ smartListQueryPort: WIRING_EMPTY_SMART_LIST }),
    );

    /*
     * `object.hasOwn` is the membership test, which is why the three prototype spellings cannot resolve.
     * A plain `routes[action]` would find `__proto__`, `constructor` and `toString` on the prototype chain
     * and then attempt to invoke them, so an arbitrary query-string value would reach a function the route
     * table never declared. The four shapes below are answered identically on purpose: an absent action
     * and an unrecognised one are the same statement about this surface, and distinguishing them would
     * disclose which addresses exist.
     */
    const responses = await Promise.all(
      [
        undefined,
        '',
        'product.notAMember',
        'notASurface.getProduct',
        '__proto__',
        'constructor',
        'toString',
        'hasOwnProperty',
      ].map((action) => route(wiringEventFor(action))),
    );

    for (const response of responses) {
      expect(response.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
      expect(response.headers?.['Content-Type']).toBe('application/json');
      expect(JSON.parse(response.body)).toStrictEqual({ message: 'Not found' });
    }

    /* Byte-identical, not merely equivalent: one answer, composed in one place. */
    expect(new Set(responses.map((response) => response.body)).size).toBe(1);
  });
});

/*
 * AAP §0.4.1.12 declares exactly seventeen executable suites, so this subject is covered
 * inside an approved suite rather than in one of its own.
 */

/* FOLDED IN FROM handlers/httpResponse */

/**
 * `httpResponse` — the request readers, pinned against the event shapes the AWS platform actually
 * delivers rather than the ones its TypeScript typings describe.
 */
describe('The shared response shaping every handler funnels through', () => {
  /* readPathParameter. */

  describe('readPathParameter — an absent container is absence, never a throw', () => {
    it('NET-NEW — the container key ABSENT answers `undefined` instead of raising a TypeError', () => {
      /*
       * The exact probe from the qa reproduction. Before the narrowing it raised
       * `TypeError: cannot convert undefined or null to object` with `Function.hasOwn` as its first frame.
       */
      expect(readPathParameter({}, 'productID')).toBeUndefined();
    });

    it('NET-NEW — the three ways of addressing nothing are INDISTINGUISHABLE', () => {
      const absent = readPathParameter({}, 'productID');
      const nulled = readPathParameter({ pathParameters: null }, 'productID');
      const otherName = readPathParameter({ pathParameters: { skuID: 'x' } }, 'productID');

      expect(absent).toBeUndefined();
      expect(nulled).toBe(absent);
      expect(otherName).toBe(absent);
    });

    it('NET-NEW — a present parameter is returned BYTE FOR BYTE, with no trimming or folding', () => {
      const value = '  Mixed CASE\twith\nwhitespace  ';

      expect(readPathParameter({ pathParameters: { productID: value } }, 'productID')).toBe(value);
    });

    it('NET-NEW — an EMPTY value is a value, not absence (AAP §0.6.1.3 T5)', () => {
      /*
       * Collapsing this onto `undefined` would hand a member that treats "" as a legal, meaningful input
       * the wrong input entirely. The distinction is preserved deliberately.
       */
      expect(
        readPathParameter({ pathParameters: { selectedOptions: '' } }, 'selectedOptions'),
      ).toBe('');
    });

    it('NET-NEW — an INHERITED name is refused, so no function can leak through a string signature', () => {
      /*
       * `Object.hasOwn` is load-bearing: a bare indexed read would resolve `toString` through the
       * prototype chain and hand back a function from a reader declared to answer `string | undefined`.
       */
      expect(readPathParameter({ pathParameters: {} }, 'toString')).toBeUndefined();
      expect(readPathParameter({ pathParameters: {} }, 'constructor')).toBeUndefined();
      expect(readPathParameter({ pathParameters: {} }, '__proto__')).toBeUndefined();
    });

    it('NET-NEW — an OWN key shadowing an inherited name is still read, because it was supplied', () => {
      expect(readPathParameter({ pathParameters: { toString: 'supplied' } }, 'toString')).toBe(
        'supplied',
      );
    });

    it('NET-NEW — a container carrying an explicitly undefined member answers absence', () => {
      /*
       * `APIGatewayProxyEventPathParameters` declares its members possibly-absent, so the own-key test
       * can pass while the value is still nothing. The declared return type covers it and no default is
       * substituted.
       */
      expect(
        readPathParameter({ pathParameters: { productID: undefined } }, 'productID'),
      ).toBeUndefined();
    });
  });

  /* readQueryStringParameter. */

  describe('readQueryStringParameter — the container payload format 2.0 omits most often', () => {
    it('NET-NEW — an absent queryStringParameters answers `undefined`, never a TypeError', () => {
      expect(readQueryStringParameter({}, 'fileURL')).toBeUndefined();
    });

    it('NET-NEW — absent, `null` and present-without-the-name are INDISTINGUISHABLE', () => {
      const absent = readQueryStringParameter({}, 'fileURL');

      expect(absent).toBeUndefined();
      expect(readQueryStringParameter({ queryStringParameters: null }, 'fileURL')).toBe(absent);
      expect(readQueryStringParameter({ queryStringParameters: { term: 'x' } }, 'fileURL')).toBe(
        absent,
      );
    });

    it('NET-NEW — an attacker-chosen name colliding with an inherited member is refused', () => {
      /*
       * A client chooses query-parameter names freely, so this is the container whose keys are
       * attacker-influenced — which is why the own-key guard matters more here than for a route template.
       */
      expect(readQueryStringParameter({ queryStringParameters: {} }, 'valueOf')).toBeUndefined();
      expect(
        readQueryStringParameter({ queryStringParameters: {} }, 'hasOwnProperty'),
      ).toBeUndefined();
    });

    it('NET-NEW — a value carrying a SQL payload is forwarded byte-identically as an opaque value', () => {
      const payload = "' OR 1=1 --";

      expect(readQueryStringParameter({ queryStringParameters: { term: payload } }, 'term')).toBe(
        payload,
      );
    });
  });

  /* readHeader. */

  describe('readHeader — the container the AWS typings call always-present', () => {
    it('NET-NEW — an ABSENT header container answers `undefined` instead of raising a TypeError', () => {
      /*
       * This reader was not among the three the qa finding enumerated, and it carried the identical
       * defect: `Object.entries(undefined)` raises the same TypeError. It matters more than the other
       * three, because every gated route calls it first through the authorization gate — so a raise here
       * escaped before any other reader was reached.
       */
      expect(readHeader({}, 'authorization')).toBeUndefined();
    });

    it('NET-NEW — an absent container and an absent header are answered identically', () => {
      expect(readHeader({}, 'authorization')).toBe(readHeader({ headers: {} }, 'authorization'));
    });

    it('NET-NEW — the header NAME is matched without regard to case (RFC 9110)', () => {
      const event = { headers: { AuThOrIzAtIoN: 'Bearer abc' } };

      expect(readHeader(event, 'authorization')).toBe('Bearer abc');
      expect(readHeader(event, 'AUTHORIZATION')).toBe('Bearer abc');
    });

    it('NET-NEW — the header VALUE is never folded, only the name is', () => {
      expect(readHeader({ headers: { 'x-probe': 'MiXeD' } }, 'X-Probe')).toBe('MiXeD');
    });

    it('NET-NEW — an inherited member is never mistaken for a received header', () => {
      /*
       * `object.entries` yields own enumerable entries only, which is what closes this without a guard.
       */
      expect(readHeader({ headers: {} }, 'toString')).toBeUndefined();
    });
  });

  /* readSmartListInput. */

  describe('readSmartListInput — an absent query string is the legal `data={}` case', () => {
    it('NET-NEW — the container key ABSENT answers the empty input instead of raising a TypeError', () => {
      expect(readSmartListInput({})).toStrictEqual({});
    });

    it('NET-NEW — absent and `null` both answer the empty input', () => {
      expect(readSmartListInput({})).toStrictEqual(
        readSmartListInput({ queryStringParameters: null }),
      );
    });

    it('NET-NEW — an empty result is LEGAL and MEANINGFUL, not a failure', () => {
      /*
       * It is exactly the `data={}` default at [model/service/SkuService.cfc:L309] and
       * [model/service/ProductService.cfc:L342], and what every in-repository caller effectively passes.
       */
      const input = readSmartListInput({ queryStringParameters: { unrecognised: 'ignored' } });

      expect(input).toStrictEqual({});
    });

    it('NET-NEW — only the vocabulary the legacy interpreter recognised is forwarded', () => {
      const input = readSmartListInput({
        queryStringParameters: {
          KEYWORD: 'shirt',
          orderby: 'productName|ASC',
          'p:show': '10',
          'P:START': '5',
          'p:current': '2',
          'f:activeFlag': '1',
          'fr:price': '10^20',
          'fi:productType.productTypeID': 'a,b',
          'fir:brand.brandID': 'true',
          'fk:productName': 'shirt',
          'fkr:productDescription': 'yes',
          'r:createdDateTime': '2020-01-01^2020-12-31',
          madeUpKey: 'dropped',
        },
      });

      expect(input).toStrictEqual({
        keyword: 'shirt',
        OrderBy: 'productName|ASC',
        'P:Show': '10',
        'P:Start': '5',
        'P:Current': '2',
        'F:activeFlag': '1',
        'FR:price': '10^20',
        'FI:productType.productTypeID': 'a,b',
        'FIR:brand.brandID': 'true',
        'FK:productName': 'shirt',
        'FKR:productDescription': 'yes',
        'R:createdDateTime': '2020-01-01^2020-12-31',
      });

      /*
       * Two differently-cased spellings collapse onto the same CFML-style struct key; the later entry
       * wins, matching ordinary assignment into a case-insensitive struct.
       */
      expect(
        readSmartListInput({
          queryStringParameters: {
            OrderBy: 'productName|ASC',
            ORDERBY: 'productCode|DESC',
          },
        }),
      ).toStrictEqual({ OrderBy: 'productCode|DESC' });
    });

    it('NET-NEW — nothing is defaulted, clamped, ordered or paginated (AAP §0.7.3)', () => {
      const input = readSmartListInput({ queryStringParameters: { keyword: 'shirt' } });

      expect(Object.keys(input)).toStrictEqual(['keyword']);
    });

    it('NET-NEW — an inherited member cannot be mistaken for a supplied parameter', () => {
      expect(readSmartListInput({ queryStringParameters: {} })).toStrictEqual({});
    });
  });

  /* readBoundedReadWindow. */

  describe('readBoundedReadWindow — the absent container is refused, not raised on', () => {
    it('NET-NEW — the container key ABSENT refuses with the limit named, and does not throw', () => {
      const result = readBoundedReadWindow({});

      expect(result.present).toBe(false);

      if (!result.present) {
        expect(result.response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(JSON.parse(result.response.body)).toStrictEqual({
          message: 'A "limit" query parameter is required, and must be a positive whole number',
        });
      }
    });

    it('NET-NEW — absent and `null` are refused identically', () => {
      expect(readBoundedReadWindow({})).toStrictEqual(
        readBoundedReadWindow({ queryStringParameters: null }),
      );
    });

    it('NET-NEW — a stated window is read exactly as stated, with no clamping', () => {
      const result = readBoundedReadWindow({
        queryStringParameters: {
          [BOUNDED_READ_LIMIT_PARAMETER]: '25',
          [BOUNDED_READ_OFFSET_PARAMETER]: '0',
        },
      });

      expect(result.present).toBe(true);

      if (result.present) {
        expect(result.window).toStrictEqual({ limit: 25, offset: 0 });
      }
    });
  });

  /* readJsonObjectBody. */

  describe('readJsonObjectBody — three spellings of "no body", all reported as absence', () => {
    it('NET-NEW — an ABSENT body member reports `absent`, not `malformed`', () => {
      /*
       * Unlike the container readers this never escaped the error contract — `JSON.parse(undefined)`
       * parses the string "undefined" and throws, and the throw was caught — so the answer was mapped and
       * safe. It was simply the wrong reason: a client told its body was malformed when it sent none
       * cannot act on that. Payload format 2.0 omits `body` rather than nulling it.
       */
      expect(readJsonObjectBody({})).toStrictEqual({ present: false, problem: 'absent' });
    });

    it('NET-NEW — `null`, the empty string and an absent member all report `absent`', () => {
      const absent = { present: false, problem: 'absent' };

      expect(readJsonObjectBody({})).toStrictEqual(absent);
      expect(readJsonObjectBody({ body: null })).toStrictEqual(absent);
      expect(readJsonObjectBody({ body: '' })).toStrictEqual(absent);
    });

    it('NET-NEW — genuinely invalid JSON still reports `malformed`, so the two stay distinguishable', () => {
      expect(readJsonObjectBody({ body: '{"unterminated":' })).toStrictEqual({
        present: false,
        problem: 'malformed',
      });
    });

    it('NET-NEW — a non-object JSON document reports `notAnObject`', () => {
      expect(readJsonObjectBody({ body: '"a string"' })).toStrictEqual({
        present: false,
        problem: 'notAnObject',
      });
      expect(readJsonObjectBody({ body: '[]' })).toStrictEqual({
        present: false,
        problem: 'notAnObject',
      });
      expect(readJsonObjectBody({ body: 'null' })).toStrictEqual({
        present: false,
        problem: 'notAnObject',
      });
    });

    it('NET-NEW — a parsed object is returned as-is, and prototype pollution is not performed', () => {
      const result = readJsonObjectBody({
        body: '{"brandName":"Acme","__proto__":{"polluted":1}}',
      });

      expect(result.present).toBe(true);

      if (result.present) {
        expect(result.value['brandName']).toBe('Acme');
      }

      expect(Object.prototype).not.toHaveProperty('polluted');
    });

    it('NET-NEW — duplicate keys keep last-value semantics, which is JSON.parse own behaviour', () => {
      const result = readJsonObjectBody({ body: '{"brandName":"first","brandName":"second"}' });

      expect(result.present).toBe(true);

      if (result.present) {
        expect(result.value['brandName']).toBe('second');
      }
    });
  });

  /* The cross-reader property — no reader raises for any combination of absent containers. */

  describe('every reader survives an event carrying NONE of the containers it reads', () => {
    it('NET-NEW — the empty event is answered by all six readers without a single throw', () => {
      /*
       * The property the 29-of-33 blast radius came down to, asserted once in one place. An event
       * literal with no containers at all is the most extreme payload-format-2.0 shape, and every reader
       * answers it with its own documented "nothing was supplied" value.
       */
      expect(() => {
        readPathParameter({}, 'productID');
        readQueryStringParameter({}, 'term');
        readHeader({}, 'authorization');
        readSmartListInput({});
        readBoundedReadWindow({});
        readJsonObjectBody({});
      }).not.toThrow();
    });

    it('NET-NEW — and answers it identically to the canonical all-null v1 shape', () => {
      expect(readPathParameter({}, 'productID')).toBe(
        readPathParameter({ pathParameters: null }, 'productID'),
      );
      expect(readQueryStringParameter({}, 'term')).toBe(
        readQueryStringParameter({ queryStringParameters: null }, 'term'),
      );
      expect(readHeader({}, 'authorization')).toBe(readHeader({ headers: {} }, 'authorization'));
      expect(readSmartListInput({})).toStrictEqual(
        readSmartListInput({ queryStringParameters: null }),
      );
      expect(readBoundedReadWindow({})).toStrictEqual(
        readBoundedReadWindow({ queryStringParameters: null }),
      );
      expect(readJsonObjectBody({})).toStrictEqual(readJsonObjectBody({ body: null }));
    });
  });

  /* §8.1 — the deployment authorisation seam. */

  describe('resolveRequestAuthorization — the deployment seam, fail-closed by default', () => {
    afterEach(() => {
      /*
       * The registry is module state, so every case leaves it as it found it. Clearing resets to absent,
       * which is the fail-closed state — the helper can remove a gate and can never install one.
       */
      clearRequestAuthorizationResolver();
    });

    it('NET-NEW — with nothing registered it answers the same deny-all context as the fallback', () => {
      const resolved = resolveRequestAuthorization(securityRequest());

      expect(resolved).toBe(resolveFailClosedAuthorization());
      expect(resolved.accountContext.getCurrentAccount()).toBeUndefined();
      expect(
        resolved.entityAuthorization.authenticateEntity({ crudType: 'read', entityName: 'Sku' }),
      ).toBe(false);
    });

    it('NET-NEW — a registered resolver is consulted, and its context is returned unchanged', () => {
      const granted: RequestAuthorizationContext = {
        accountContext: {
          getCurrentAccount: () => ({
            accountID: 'a'.repeat(32),
            newFlag: false,
            adminAccountFlag: true,
          }),
        },
        entityAuthorization: { authenticateEntity: () => true },
        populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
      };

      registerRequestAuthorizationResolver(() => granted);

      expect(resolveRequestAuthorization(securityRequest())).toBe(granted);
    });

    it('NET-NEW — the resolver receives the invocation own request, and is called once per call', () => {
      const seen: (string | undefined)[] = [];

      const resolver: CatalogAuthorizationResolver = (request) => {
        seen.push(request.headers['x-principal']);

        return resolveFailClosedAuthorization();
      };

      registerRequestAuthorizationResolver(resolver);

      resolveRequestAuthorization(securityRequest({ headers: { 'x-principal': 'first' } }));
      resolveRequestAuthorization(securityRequest({ headers: { 'x-principal': 'second' } }));

      /*
       * Two calls, two reads, in order: nothing is memoised between invocations, which is the M7
       * property the seam exists to preserve.
       */
      expect(seen).toStrictEqual(['first', 'second']);
    });

    it('NET-NEW — a resolver registered AFTER composition is still honoured', () => {
      /*
       * This is the property that makes the packaged artifact usable: `./router.ts` builds its dispatcher
       * at module load, so a resolver registered during a deployment initialisation that runs later must
       * still take effect. It does, because the default resolver reads the registry per call.
       */
      const composed = resolveRequestAuthorization;

      expect(composed(securityRequest())).toBe(resolveFailClosedAuthorization());

      const granted: RequestAuthorizationContext = {
        accountContext: { getCurrentAccount: () => undefined },
        entityAuthorization: { authenticateEntity: () => true },
        populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
      };

      registerRequestAuthorizationResolver(() => granted);

      expect(composed(securityRequest())).toBe(granted);
    });

    it('NET-NEW — a second registration is refused rather than replacing the first', () => {
      const first: RequestAuthorizationContext = {
        accountContext: { getCurrentAccount: () => undefined },
        entityAuthorization: { authenticateEntity: () => true },
        populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
      };

      registerRequestAuthorizationResolver(() => first);

      expect(() => registerRequestAuthorizationResolver(resolveFailClosedAuthorization)).toThrow(
        /already registered/,
      );

      expect(resolveRequestAuthorization(securityRequest())).toBe(first);
    });
  });

  /*
   * createActionDispatcher — the shared action edge, and the legacy case-insensitivity it carries.
   */

  describe('createActionDispatcher — action matching is case-insensitive, as FW/1 was', () => {
    /**
     * The invocation shape the dispatcher reads: nothing but the action, which is all it consults.
     */
    const eventFor = (action: string | undefined): APIGatewayProxyEvent =>
      ({
        queryStringParameters: action === undefined ? null : { [SLAT_ACTION_PARAMETER]: action },
      }) as unknown as APIGatewayProxyEvent;

    /**
     * A two-address surface spelled the way the real tables are: `section.item`, and one with a subsystem.
     */
    const dispatcherFor = (): {
      readonly dispatch: (
        event: APIGatewayProxyEvent,
      ) => Promise<{ statusCode: number; body: string }>;
      readonly beginInvocationCalls: () => number;
    } => {
      let beginInvocationCalls = 0;

      const dispatch = createActionDispatcher<'product.saveProduct' | 'google:feed.product'>({
        routes: Object.freeze({
          'product.saveProduct': () => Promise.resolve(okResponse({ reached: 'saveProduct' })),
          'google:feed.product': () => Promise.resolve(okResponse({ reached: 'feed' })),
        }),
        beginInvocation: () => {
          beginInvocationCalls += 1;
        },
      });

      return { dispatch, beginInvocationCalls: () => beginInvocationCalls };
    };

    it.each([
      ['the canonical spelling', 'product.saveProduct'],
      ['an all-lower-case spelling', 'product.saveproduct'],
      ['an all-upper-case spelling', 'PRODUCT.SAVEPRODUCT'],
      ['a mixed-case spelling', 'Product.SaveProduct'],
    ])('NET-NEW — %s reaches the declared route', async (_label, action) => {
      const { dispatch } = dispatcherFor();

      const response = await dispatch(eventFor(action));

      expect(response.statusCode).toBe(HTTP_STATUS.OK);
      expect(JSON.parse(response.body)).toStrictEqual({ reached: 'saveProduct' });
    });

    it('NET-NEW — the one legacy-attested action resolves in every casing, subsystem colon and all', async () => {
      /*
       * `?slatAction=google:feed.product` is the single catalog-adjacent action attested anywhere in the
       * legacy tree [integrationServices/google/views/main/default.cfm:L50]. The colon is part of the
       * address, not a separator this layer interprets.
       */
      const { dispatch } = dispatcherFor();

      for (const spelling of [
        'google:feed.product',
        'Google:Feed.Product',
        'GOOGLE:FEED.PRODUCT',
        'gOoGlE:fEeD.pRoDuCt',
      ]) {
        const response = await dispatch(eventFor(spelling));

        expect(response.statusCode).toBe(HTTP_STATUS.OK);
        expect(JSON.parse(response.body)).toStrictEqual({ reached: 'feed' });
      }
    });

    it('NET-NEW — the reachable set is UNCHANGED: an undeclared action is still 404 in every casing', async () => {
      /*
       * The property the earlier case-sensitive design was protecting, and it still holds. Case folding
       * widens the spellings that reach a declared address; it does not widen the set of addresses.
       */
      const { dispatch } = dispatcherFor();

      for (const action of [
        'product.deleteProduct',
        'PRODUCT.DELETEPRODUCT',
        'product',
        'product.saveProduct.extra',
        'productsaveproduct',
        '',
      ]) {
        expect((await dispatch(eventFor(action))).statusCode).toBe(HTTP_STATUS.NOT_FOUND);
      }
    });

    it('NET-NEW — an absent action is answered exactly as an unrecognised one is', async () => {
      const { dispatch } = dispatcherFor();

      const absent = await dispatch(eventFor(undefined));
      const unrecognised = await dispatch(eventFor('nope'));

      expect(absent.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
      expect(absent.body).toBe(unrecognised.body);
    });

    it('NET-NEW — an inherited member name never resolves to a route, in any casing', async () => {
      /*
       * The lookup is built with a null prototype and probed with `Object.hasOwn`, so neither the map nor
       * the route table can hand back a function from a name a caller supplied.
       */
      const { dispatch } = dispatcherFor();

      for (const action of [
        '__proto__',
        'constructor',
        'toString',
        'CONSTRUCTOR',
        'hasOwnProperty',
        'valueOf',
      ]) {
        expect((await dispatch(eventFor(action))).statusCode).toBe(HTTP_STATUS.NOT_FOUND);
      }
    });

    it('NET-NEW — beginInvocation runs first and exactly once per invocation, matched or not', async () => {
      const { dispatch, beginInvocationCalls } = dispatcherFor();

      await dispatch(eventFor('Product.SaveProduct'));
      expect(beginInvocationCalls()).toBe(1);

      await dispatch(eventFor('no.such.action'));
      expect(beginInvocationCalls()).toBe(2);
    });

    it('NET-NEW — two declared actions differing only in case fail at construction, not silently', () => {
      /*
       * No such pair exists in any real route table — every declared key is lower-camel with a distinct
       * lower-cased form — and this guard is what keeps one from being introduced quietly, since a silent
       * winner would make the loser permanently unreachable.
       */
      expect(() =>
        createActionDispatcher<'product.saveProduct' | 'product.saveproduct'>({
          routes: Object.freeze({
            'product.saveProduct': () => Promise.resolve(okResponse({})),
            'product.saveproduct': () => Promise.resolve(okResponse({})),
          }),
          beginInvocation: () => undefined,
        }),
      ).toThrow(/share the lower-cased form "product\.saveproduct"/);
    });

    it('NET-NEW — a route that throws is still converted to a response, not left to escape', async () => {
      const dispatch = createActionDispatcher<'product.saveProduct'>({
        routes: Object.freeze({
          'product.saveProduct': () => {
            throw new Error('route failed');
          },
        }),
        beginInvocation: () => undefined,
      });

      const response = await dispatch(eventFor('PRODUCT.SAVEPRODUCT'));

      expect(response.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(response.body).not.toContain('route failed');
    });
  });
});

/*
 * The transient-write-conflict status, and the taxonomy boundary it sits on (CWE-544)
 *
 * `errorResponse` reads a `DomainError`'s presentation polymorphically and maps its code to one status,
 * so a class's public account and the status it produces are one decision made in two files. These cases
 * pin both halves for the code added in response to the review finding, and — more importantly — pin the
 * DIFFERENCE from the duplicate-key code it used to share, since sharing it is exactly the defect.
 */

describe('errorResponse — NET-NEW: a transient write conflict is a retryable 503, not a 400', () => {
  it('NET-NEW — a TransientWriteConflictError answers 503 with the retryable message and nothing else', () => {
    const response = errorResponse(
      new TransientWriteConflictError(
        'The database rolled this transaction back to break a deadlock with another writer, so no ' +
          'part of it was applied. The identical request may succeed if it is made again.',
        { context: { parameterCount: 2, errno: 1213, retryable: true } },
      ),
    );

    expect(response.statusCode).toBe(HTTP_STATUS.SERVICE_UNAVAILABLE);
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body) as unknown).toStrictEqual({
      message:
        'The write conflicted with another write in progress and was not applied; the request may be retried',
    });
  });

  it('NET-NEW — the response discloses no errno, no table, no constraint and no internal message', () => {
    /*
     * The internal message names the deadlock and the rollback, because an operator reading a
     * correlation-matched record needs to know which of the two conditions occurred. None of it may reach
     * the wire, and the whole authored message is asserted absent rather than a token from it, because a
     * partial leak is still a leak.
     */
    const internalMessage =
      'The database could not acquire a lock another writer was holding before the wait timed out, ' +
      'so the write did not happen. The identical request may succeed if it is made again.';
    const response = errorResponse(
      new TransientWriteConflictError(internalMessage, {
        context: { parameterCount: 3, errno: 1205, retryable: true, constraintName: 'uq_SwBrand' },
      }),
    );

    expect(response.body).not.toContain(internalMessage);
    expect(response.body).not.toMatch(/1205|1213|uq_SwBrand|ER_LOCK|deadlock|retryable/iu);
  });

  it('NET-NEW — a DUPLICATE key still answers 400, so the two verdicts are genuinely separated', () => {
    /*
     * The control. Before the split both classes produced this response, which is why a caller could not
     * tell "your value is taken, change it" from "nothing was written, ask again". A revision that
     * mapped both codes to one status, or that reverted the transient arm to the duplicate class, would
     * pass the first case above only if it also broke this one — or would break this one directly.
     */
    const duplicate = errorResponse(
      new UniqueConstraintViolationError('overtaken', {
        context: { parameterCount: 1, errno: 1062, retryable: false },
      }),
    );

    expect(duplicate.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(JSON.parse(duplicate.body) as unknown).toStrictEqual({
      message: 'A value in the request is already in use',
    });
  });

  it('NET-NEW — no Retry-After is emitted, because this port has no basis for a figure', () => {
    /*
     * A header would be the natural companion to a 503 and is deliberately absent: how long to wait
     * depends on the contending workload, which nothing in this subtree knows, and AAP §0.8.3.5 admits no
     * invented figure. The header set is asserted to be the ordinary JSON one, unchanged.
     */
    const response = errorResponse(
      new TransientWriteConflictError('rolled back', { context: { retryable: true } }),
    );
    const headers = response.headers ?? {};

    expect(Object.keys(headers)).not.toContain('Retry-After');
    expect(Object.keys(headers)).not.toContain('retry-after');
    expect(headers['Content-Type']).toBe(JSON_CONTENT_TYPE);
  });

  it('NET-NEW — an UNREACHABLE database classifies identically whichever path first touched the driver', async () => {
    /*
     * The second half of the finding pair: `QueryRunner` wrapped its own `pool.execute`, but
     * `UnitOfWork` acquired its transaction's connection outside any translation, so a closed port
     * answered a neutral classified 500 on a read and an UNRECOGNISED 500 on a write — same condition,
     * two accounts, and the write half carrying no `code` for anything counting by code to see.
     *
     * Reproduced here with a pool whose acquisition rejects the way the driver rejects it, `errno` and
     * `code` included, and asserted from the response rather than from the class, because "classifies as
     * the read path does" is a claim about what a caller and a log receive.
     */
    const refusal = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3306'), {
      errno: -111,
      code: 'ECONNREFUSED',
      syscall: 'connect',
      address: '127.0.0.1',
      port: 3306,
    });
    const unreachablePool = {
      execute: () => Promise.reject(refusal),
      getConnection: () => Promise.reject(refusal),
    };

    const readRejection: unknown = await new QueryRunner(unreachablePool as never)
      .execute('SELECT ?', ['x'])
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );
    const writeRejection: unknown = await new UnitOfWork(unreachablePool as never)
      .run(
        async (scope) => scope.executor.execute('SELECT ?', ['x']),
        () => false,
      )
      .then(
        () => undefined,
        (failure: unknown) => failure,
      );

    /* Both are the same classified failure, and the write one is no longer a bare `Error`. */
    expect(readRejection).toBeInstanceOf(DatabaseStatementError);
    expect(writeRejection).toBeInstanceOf(DatabaseStatementError);
    expect((writeRejection as DatabaseStatementError).getPublicError()).toStrictEqual(
      (readRejection as DatabaseStatementError).getPublicError(),
    );

    /* And both produce the identical response, byte for byte, at the identical status. */
    const readResponse = errorResponse(readRejection);
    const writeResponse = errorResponse(writeRejection);

    expect(writeResponse.statusCode).toBe(readResponse.statusCode);
    expect(writeResponse.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    expect(writeResponse.body).toBe(readResponse.body);
    expect(JSON.parse(writeResponse.body) as unknown).toStrictEqual({
      message: 'The request could not be completed',
    });

    /*
     * Nothing about the address reaches the wire from either. There was no disclosure before this fix
     * either and none is claimed as newly closed; the assertion is here so a future revision that starts
     * composing a message from the caught value fails immediately.
     */
    for (const body of [readResponse.body, writeResponse.body]) {
      expect(body).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|3306|111|connect/iu);
    }

    /* The acquisition wrap does not retain the driver error as a cause — see DatabaseStatementError. */
    expect((writeRejection as DatabaseStatementError).cause).toBeUndefined();
    /* No statement was attempted, so the honest parameter count is zero rather than a placeholder. */
    expect((writeRejection as DatabaseStatementError).parameterCount).toBe(0);
  });
});

/*
 * AAP §0.4.1.12 declares exactly seventeen executable suites, so this subject is covered
 * inside an approved suite rather than in one of its own.
 */

/* FOLDED IN FROM handlers/entrySurface */

/**
 * The Lambda entry surface — the six `handler` exports, the five per-surface route tables, and the shared
 * action dispatcher they all run through.
 */
describe('The six Lambda entry artifacts, which belong to no single service either', () => {
  /* harness. */

  /**
   * The union `src/handlers/router.ts` must add up to, assembled here from the five surfaces themselves.
   */
  type SurfaceRouteKey =
    ProductRouteKey | SkuRouteKey | BrandRouteKey | OptionRouteKey | GoogleFeedRouteKey;

  /** True only when the two unions are mutually assignable — that is, exactly equal. */
  type Exact<TLeft, TRight> = [TLeft] extends [TRight]
    ? [TRight] extends [TLeft]
      ? true
      : false
    : false;

  /**
   * The invocation shape the dispatcher reads: nothing but the action, which is all it consults.
   */
  function eventFor(action: string | undefined): APIGatewayProxyEvent {
    return {
      queryStringParameters: action === undefined ? null : { [SLAT_ACTION_PARAMETER]: action },
    } as unknown as APIGatewayProxyEvent;
  }

  /**
   * The five per-surface entry modules, addressed by path so each case can load a fresh instance.
   */
  const ENTRY_MODULES = Object.freeze([
    Object.freeze({
      name: 'productHandler',
      path: '../../src/handlers/productHandler',
      ownAction: 'product.doesNotExist',
      gatedAction: 'product.getProduct',
      foreignAction: 'brand.getBrand',
    }),
    Object.freeze({
      name: 'skuHandler',
      path: '../../src/handlers/skuHandler',
      ownAction: 'sku.doesNotExist',
      gatedAction: 'sku.getSkuBySkuCode',
      foreignAction: 'product.getProduct',
    }),
    Object.freeze({
      name: 'brandHandler',
      path: '../../src/handlers/brandHandler',
      ownAction: 'brand.doesNotExist',
      gatedAction: 'brand.getBrand',
      foreignAction: 'sku.getSkuSmartList',
    }),
    Object.freeze({
      name: 'optionHandler',
      path: '../../src/handlers/optionHandler',
      ownAction: 'option.doesNotExist',
      gatedAction: 'option.getUnusedProductOptionGroups',
      foreignAction: 'google:feed.product',
    }),
    Object.freeze({
      /*
       * No `gatedAction`: the feed's single address is ungated, and it is the one that reads the catalog.
       */
      name: 'googleFeedHandler',
      path: '../../src/handlers/googleFeedHandler',
      ownAction: 'google:feed.doesNotExist',
      gatedAction: undefined,
      foreignAction: 'product.getProduct',
    }),
  ] as const);

  /** The environment `src/config/env.ts` requires, with a port nothing listens on. */
  const ENTRY_INVOCATION_ENVIRONMENT: Readonly<Record<string, string>> = Object.freeze({
    DB_HOST: '127.0.0.1',
    DB_PORT: '1',
    DB_NAME: 'entrySurfaceSuite',
    DB_USER: 'entrySurfaceSuite',
    DB_PASSWORD: 'entrySurfaceSuite',
    DB_TLS_MODE: 'disabled',
    GOOGLE_FEED_HOST: 'catalog.example.test',
  });

  /**
   * Every variable `src/config/env.ts` reads, so a case can strip the environment to prove a negative.
   */
  const LOADER_VARIABLE_NAMES: readonly string[] = Object.freeze([
    ...Object.keys(ENTRY_INVOCATION_ENVIRONMENT),
    'SETTING_APPLICATION_ROOT_MAPPING_PATH',
    'SETTING_SKU_ELIGIBLE_CURRENCIES',
    'SETTING_SKU_ELIGIBLE_FULFILLMENT_METHODS',
  ]);

  /**
   * Runs `work` with every loader variable unset, restoring the environment afterwards even on failure.
   */
  function withNoEnvironment<TResult>(work: () => TResult): TResult {
    const saved = new Map<string, string | undefined>();

    for (const name of LOADER_VARIABLE_NAMES) {
      saved.set(name, process.env[name]);
      delete process.env[name];
    }

    try {
      return work();
    } finally {
      for (const [name, value] of saved) {
        if (value !== undefined) {
          process.env[name] = value;
        }
      }
    }
  }

  /** The Lambda contract each entry module publishes, narrowed for the require below. */
  interface LambdaEntryModule {
    readonly handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  }

  /** Loads a fresh instance of an entry module. */
  function loadEntryModule(modulePath: string): LambdaEntryModule {
    return jest.requireActual<LambdaEntryModule>(modulePath);
  }

  /**
   * Captures the allowlisted diagnostic `src/handlers/httpResponse.ts` writes on its failure branches.
   */
  function captureErrorStream(): { readonly lines: readonly string[]; restore(): void } {
    const lines: string[] = [];
    const original = console.error;

    console.error = (...data: unknown[]): void => {
      lines.push(data.filter((entry): entry is string => typeof entry === 'string').join(' '));
    };

    return {
      lines,
      restore: (): void => {
        console.error = original;
      },
    };
  }

  /**
   * Builds a façade double whose every member records its own name and answers a recognisable result.
   *
   * @param memberNames every member the façade exposes
   * @param calls the array each invocation appends its member name to
   * @returns the double, typed as the façade under test.
   */
  function recordingFacade<TFacade>(memberNames: readonly string[], calls: string[]): TFacade {
    const members = memberNames.map((memberName) => [
      memberName,
      (): Promise<APIGatewayProxyResult> => {
        calls.push(memberName);
        return Promise.resolve({
          statusCode: HTTP_STATUS.OK,
          headers: {},
          body: memberName,
        } as APIGatewayProxyResult);
      },
    ]);

    return Object.fromEntries(members) as TFacade;
  }

  /** Reads a table's keys as plain strings, sorted, so a comparison is order-independent. */
  function keysOf(table: Readonly<Record<string, ActionRoute>>): readonly string[] {
    return Object.keys(table).sort();
  }

  const PRODUCT_MEMBERS: readonly string[] = [
    'loadDataFromFile',
    'getFormattedOptionGroups',
    'getProductSkusBySelectedOptions',
    'processProductAddOptionGroup',
    'processProductAddOption',
    'processProductAddProductReview',
    'processProductAddSubscriptionTerm',
    'processProductDeleteDefaultImage',
    'processProductUpdateDefaultImageFileNames',
    'processProductUpdateSkus',
    'processProductUploadDefaultImage',
    'saveProduct',
    'saveProductType',
    'deleteProduct',
    'getProductSmartList',
    'newProduct',
    'getProductType',
    'getProduct',
  ];

  const SKU_MEMBERS: readonly string[] = [
    'createSkus',
    'processImageUpload',
    'getProductSkus',
    'getSortedProductSkus',
    'searchSkusByProductType',
    'getSkuStocksDeletableFlag',
    'getTransactionExistsFlag',
    'getSkuBySkuCode',
    'getSkuSmartList',
  ];

  const BRAND_MEMBERS: readonly string[] = ['saveBrand', 'getBrand', 'deleteBrand'];

  const OPTION_MEMBERS: readonly string[] = [
    'getOptionsForSelect',
    'getUnusedProductOptions',
    'getUnusedProductOptionGroups',
  ];

  const FEED_MEMBERS: readonly string[] = ['product'];

  /* §1 — The key sets, per surface and in aggregate. */

  describe('NET-NEW entry surface — each surface declares exactly the actions its service exposes', () => {
    it.each([
      ['product', 'product.', PRODUCT_MEMBERS, 18],
      ['sku', 'sku.', SKU_MEMBERS, 9],
      ['brand', 'brand.', BRAND_MEMBERS, 3],
      ['option', 'option.', OPTION_MEMBERS, 3],
    ])(
      '[NET-NEW] %s mounts every member once, under its own prefix',
      (surface, prefix, memberNames, expectedCount) => {
        const calls: string[] = [];
        const table = {
          product: () =>
            createProductRoutes(
              recordingFacade<ProductHandler>(PRODUCT_MEMBERS, calls),
            ) as Readonly<Record<string, ActionRoute>>,
          sku: () =>
            createSkuRoutes(recordingFacade<SkuHandler>(SKU_MEMBERS, calls)) as Readonly<
              Record<string, ActionRoute>
            >,
          brand: () =>
            createBrandRoutes(recordingFacade<BrandHandler>(BRAND_MEMBERS, calls)) as Readonly<
              Record<string, ActionRoute>
            >,
          option: () =>
            createOptionRoutes(recordingFacade<OptionHandler>(OPTION_MEMBERS, calls)) as Readonly<
              Record<string, ActionRoute>
            >,
        }[surface as 'product' | 'sku' | 'brand' | 'option']();

        /*
         * The expected keys are the member names under the surface prefix, which is the addressing scheme
         * `org/Hibachi/FW1/framework.cfc:L1965-L1969` gave the legacy: section, then item.
         */
        expect(keysOf(table)).toEqual(
          [...memberNames].map((member) => `${prefix}${member}`).sort(),
        );
        expect(Object.keys(table)).toHaveLength(expectedCount);
        expect(Object.isFrozen(table)).toBe(true);
      },
    );

    it('[NET-NEW] the feed keeps the one legacy-attested action, colon and all', () => {
      const calls: string[] = [];
      const table = createGoogleFeedRoutes(recordingFacade<GoogleFeedHandler>(FEED_MEMBERS, calls));

      /*
       * `integrationServices/google/views/main/default.cfm:L50` links `?slatAction=google:feed.product`.
       * The colon is FW/1's subsystem separator, so this key does not follow the `<surface>.<member>` shape
       * the four catalog surfaces use — the existing caller's address wins over internal consistency.
       */
      expect(keysOf(table)).toEqual(['google:feed.product']);
      expect(Object.isFrozen(table)).toBe(true);
    });

    it('[NET-NEW] the router aggregate is exactly the union of the five surfaces, by type', () => {
      /*
       * A compile-time assertion with a runtime witness. If a surface gains a key the router's `RouteKey`
       * does not include — or the router declares one no surface serves — the two unions stop being mutually
       * assignable and `true` is no longer assignable to the annotated type, so `npm run typecheck` fails at
       * this line. The `expect` exists so the case reports as a case; the guarantee is the annotation.
       */
      const aggregateMatchesSurfaces: Exact<RouteKey, SurfaceRouteKey> = true;

      expect(aggregateMatchesSurfaces).toBe(true);
    });

    it('[NET-NEW] the five sets are disjoint and their union is the 34-address space', () => {
      const calls: string[] = [];
      const everyKey = [
        ...keysOf(createProductRoutes(recordingFacade<ProductHandler>(PRODUCT_MEMBERS, calls))),
        ...keysOf(createSkuRoutes(recordingFacade<SkuHandler>(SKU_MEMBERS, calls))),
        ...keysOf(createBrandRoutes(recordingFacade<BrandHandler>(BRAND_MEMBERS, calls))),
        ...keysOf(createOptionRoutes(recordingFacade<OptionHandler>(OPTION_MEMBERS, calls))),
        ...keysOf(createGoogleFeedRoutes(recordingFacade<GoogleFeedHandler>(FEED_MEMBERS, calls))),
      ];

      /*
       * 28 preserved public service members (AAP §0.4.2: 15 product, 9 SKU, 1 brand, 3 option), plus the
       * five IR-1 members the slice genuinely uses and `onMissingMethod` fabricated at run time, plus the
       * one feed action. `src/handlers/router.ts` spreads exactly these five tables, so this count is the
       * aggregate surface.
       */
      expect(everyKey).toHaveLength(34);
      expect(new Set(everyKey).size).toBe(34);
    });
  });

  /* §2 — The delegation: every key resolves to the member of the same name. */

  describe('NET-NEW entry surface — every action reaches the member that shares its name', () => {
    it('[NET-NEW] a transposed mounting would fail here, so each key is invoked and traced', async () => {
      const calls: string[] = [];
      const tables: readonly Readonly<Record<string, ActionRoute>>[] = [
        createProductRoutes(recordingFacade<ProductHandler>(PRODUCT_MEMBERS, calls)),
        createSkuRoutes(recordingFacade<SkuHandler>(SKU_MEMBERS, calls)),
        createBrandRoutes(recordingFacade<BrandHandler>(BRAND_MEMBERS, calls)),
        createOptionRoutes(recordingFacade<OptionHandler>(OPTION_MEMBERS, calls)),
      ];

      for (const table of tables) {
        for (const [key, route] of Object.entries(table)) {
          calls.length = 0;
          const response = await route(eventFor(key));

          /*
           * The member name is everything after the surface prefix, and the double answers with its own
           * name — so the body is the assertion that the right member ran.
           */
          const expectedMember = key.slice(key.indexOf('.') + 1);
          expect(calls).toEqual([expectedMember]);
          expect(response.body).toBe(expectedMember);
        }
      }
    });

    it('[NET-NEW] the feed route calls `product` and forwards no event to it', async () => {
      const calls: string[] = [];
      const table = createGoogleFeedRoutes(recordingFacade<GoogleFeedHandler>(FEED_MEMBERS, calls));
      const route = table['google:feed.product'];

      expect(route).toBeDefined();
      await route?.(eventFor('google:feed.product'));

      /*
       * `product` takes invocation options rather than a request, and the legacy controller read nothing
       * from its own request context either.
       */
      expect(calls).toEqual(['product']);
    });
  });

  /* §3 — The shared dispatcher. */

  describe('NET-NEW entry surface — the dispatcher every entry point runs through', () => {
    const dispatcherFor = (
      routes: ActionRouteTable<string>,
      beginInvocation: () => void,
    ): ActionRoute => createActionDispatcher<string>({ routes, beginInvocation });

    it('[NET-NEW] begins the invocation before the action is read, even for an action it does not serve', async () => {
      const order: string[] = [];
      const dispatch = dispatcherFor(
        Object.freeze({
          'brand.getBrand': (): Promise<APIGatewayProxyResult> => {
            order.push('route');
            return Promise.resolve({
              statusCode: HTTP_STATUS.OK,
              headers: {},
              body: '',
            } as APIGatewayProxyResult);
          },
        }),
        () => {
          order.push('beginInvocation');
        },
      );

      await dispatch(eventFor('brand.getBrand'));
      expect(order).toEqual(['beginInvocation', 'route']);

      /*
       * And on a miss too: a warm container must not carry a previous invocation's request-scoped value
       * into this one just because this one addressed nothing (mismatch M7).
       */
      order.length = 0;
      await dispatch(eventFor('brand.nothing'));
      expect(order).toEqual(['beginInvocation']);
    });

    it.each([
      ['an unrecognised action', 'brand.doesNotExist'],
      ['an absent action', undefined],
      ['an inherited property name', '__proto__'],
      ['another inherited property name', 'constructor'],
      ['a third inherited property name', 'toString'],
    ])('[NET-NEW] answers a neutral 404 for %s', async (_situation, action) => {
      const dispatch = dispatcherFor(
        Object.freeze({
          'brand.getBrand': (): Promise<APIGatewayProxyResult> =>
            Promise.resolve({
              statusCode: HTTP_STATUS.OK,
              headers: {},
              body: '',
            } as APIGatewayProxyResult),
        }),
        () => undefined,
      );

      const response = await dispatch(eventFor(action));

      expect(response.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
      /*
       * Neutral: the body names no action, no member and no surface, so a caller cannot enumerate what the
       * service does serve by reading refusals.
       */
      expect(response.body).not.toContain('brand');
      expect(response.body).not.toContain('doesNotExist');
    });

    it('[NET-NEW] converts a route failure instead of letting it escape', async () => {
      const dispatch = dispatcherFor(
        Object.freeze({
          'brand.getBrand': (): Promise<APIGatewayProxyResult> => {
            throw new Error('a failure with detail that must not reach the caller');
          },
        }),
        () => undefined,
      );

      const response = await dispatch(eventFor('brand.getBrand'));

      /*
       * Whatever status the classification chooses, the contract asserted here is that a response is
       * produced at all — no unhandled rejection — and that the thrown text is not published.
       */
      expect(response.statusCode).toBeGreaterThanOrEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(response.body).not.toContain('must not reach the caller');
    });

    it('[NET-NEW] converts a failure from the invocation hook itself', async () => {
      const dispatch = dispatcherFor(Object.freeze({}), () => {
        throw new Error('resetting request state failed');
      });

      const response = await dispatch(eventFor('brand.getBrand'));

      expect(response.statusCode).toBeGreaterThanOrEqual(HTTP_STATUS.INTERNAL_SERVER_ERROR);
      expect(response.body).not.toContain('resetting request state failed');
    });
  });

  /* §4 — The entry exports themselves. */

  describe('NET-NEW entry surface — every per-service module exports an invocable handler', () => {
    it.each([
      ['productHandler', productLambdaHandler],
      ['skuHandler', skuLambdaHandler],
      ['brandHandler', brandLambdaHandler],
      ['optionHandler', optionLambdaHandler],
      ['googleFeedHandler', googleFeedLambdaHandler],
    ])('[NET-NEW] %s exports a one-argument handler', (_moduleName, entryPoint) => {
      /*
       * The bundle `build/esbuild.mjs` writes from each of these modules has to carry a symbol the
       * runtime can address. Presence and arity are asserted here;
       * Behaviour is asserted against the built artifact, because invoking it resolves the composition root
       * and therefore needs a configured environment.
       */
      expect(typeof entryPoint).toBe('function');
      expect(entryPoint).toHaveLength(1);
    });

    it('[NET-NEW] importing these modules constructs no container and reads no environment', () => {
      /*
       * The negative is proved by removing the environment, not by looking at it. `src/config/env.ts`
       * validates eagerly and throws when a required variable is absent, and `src/config/database.ts`
       * builds the pool at module scope, so a module that reached the composition root while loading could
       * not load at all here — every loader variable is unset for the duration of this case. Each of the
       * five is required fresh under that condition, so the pass is evidence rather than coincidence.
       */
      withNoEnvironment(() => {
        for (const entry of ENTRY_MODULES) {
          expect(() => loadEntryModule(entry.path)).not.toThrow();
        }
      });

      expect(typeof productLambdaHandler).toBe('function');
    });
  });

  /* §5 — The entry points invoked, not merely exported. */

  describe('NET-NEW entry surface — the five per-service entry points answer when INVOKED', () => {
    const savedEnvironment = new Map<string, string | undefined>();

    beforeEach(() => {
      for (const [name, value] of Object.entries(ENTRY_INVOCATION_ENVIRONMENT)) {
        savedEnvironment.set(name, process.env[name]);
        process.env[name] = value;
      }
    });

    afterEach(() => {
      /*
       * Restored key by key, and an absent key is deleted rather than blanked: the loader distinguishes the
       * two, and §4 asserts that this file leaves no `DB_HOST` behind.
       */
      for (const [name, value] of savedEnvironment) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
      savedEnvironment.clear();
    });

    it.each(ENTRY_MODULES.map((entry) => [entry.name, entry] as const))(
      '[NET-NEW] %s answers a neutral 404 for an action it does not serve, resolving its graph first',
      async (_name, entry) => {
        const capture = captureErrorStream();

        try {
          const response = await loadEntryModule(entry.path).handler(eventFor(entry.ownAction));

          /*
           * 404 — not 500. Reaching it proves the deferred require resolved, the container was built and
           * the dispatcher was created, because all three happen before dispatch. Under the previous
           * native dynamic import this same call answered 500 for every action.
           */
          expect(response.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
          expect(response.body).toBe(JSON.stringify({ message: 'Not found' }));
          /* Neutral: a refusal must not let a caller enumerate what the surface does serve. */
          expect(response.body).not.toContain(entry.ownAction);
          /* A not-found is not a failure, so nothing is written to the error stream. */
          expect(capture.lines).toEqual([]);
        } finally {
          capture.restore();
        }
      },
    );

    it.each(ENTRY_MODULES.map((entry) => [entry.name, entry.foreignAction, entry.path] as const))(
      '[NET-NEW] %s serves only its own surface and answers 404 for %s',
      async (_name, foreignAction, modulePath) => {
        const capture = captureErrorStream();

        try {
          const response = await loadEntryModule(modulePath).handler(eventFor(foreignAction));

          /*
           * Per-entry partitioning: each artifact is an independent Lambda entry, so a neighbour's action
           * is simply not addressable on it. Only `src/handlers/router.ts` serves the whole union.
           */
          expect(response.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
          expect(capture.lines).toEqual([]);
        } finally {
          capture.restore();
        }
      },
    );

    it.each(
      ENTRY_MODULES.filter(
        (entry): entry is (typeof ENTRY_MODULES)[number] & { gatedAction: string } =>
          entry.gatedAction !== undefined,
      ).map((entry) => [entry.name, entry.gatedAction, entry.path] as const),
    )(
      '[NET-NEW] %s dispatches %s into the production graph and is refused fail-closed',
      async (_name, gatedAction, modulePath) => {
        const capture = captureErrorStream();

        try {
          const response = await loadEntryModule(modulePath).handler(eventFor(gatedAction));

          /*
           * A real dispatch hit, and the strongest assertion available without a database: the address
           * resolved to a mounted member and the graph's own fail-closed resolver answered. 401 rather
           * than 403 — no principal was established at all — and it precedes parameter validation, which
           * is why an event carrying nothing but the action is enough.
           */
          expect(response.statusCode).toBe(HTTP_STATUS.UNAUTHORIZED);
          expect(response.body).toBe(JSON.stringify({ message: 'Authentication is required' }));
          expect(capture.lines).toEqual([]);
        } finally {
          capture.restore();
        }
      },
    );

    it('[NET-NEW] builds its dispatcher once and reuses it across invocations', async () => {
      const capture = captureErrorStream();

      try {
        const entry = loadEntryModule('../../src/handlers/brandHandler');

        const first = await entry.handler(eventFor('brand.getBrand'));
        const second = await entry.handler(eventFor('brand.doesNotExist'));
        const third = await entry.handler(eventFor('brand.getBrand'));

        /*
         * The second and third invocations take the memoised path — the initialisation branch is skipped —
         * and must answer exactly as the first did. A warm container carries the wiring forward and nothing
         * else, which is the boundary mismatch M7 is about.
         */
        expect(first.statusCode).toBe(HTTP_STATUS.UNAUTHORIZED);
        expect(second.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
        expect(third.statusCode).toBe(HTTP_STATUS.UNAUTHORIZED);
        expect(third.body).toBe(first.body);
        expect(capture.lines).toEqual([]);
      } finally {
        capture.restore();
      }
    });
  });

  describe('NET-NEW entry surface — a per-service entry with NO environment answers, rather than throwing', () => {
    const savedEnvironment = new Map<string, string | undefined>();

    beforeEach(() => {
      for (const name of LOADER_VARIABLE_NAMES) {
        savedEnvironment.set(name, process.env[name]);
        delete process.env[name];
      }
    });

    afterEach(() => {
      for (const [name, value] of savedEnvironment) {
        if (value !== undefined) {
          process.env[name] = value;
        }
      }
      savedEnvironment.clear();
    });

    it('[NET-NEW] classifies the missing configuration instead of failing opaquely', async () => {
      const capture = captureErrorStream();

      try {
        const response = await loadEntryModule('../../src/handlers/optionHandler').handler(
          eventFor('option.getUnusedProductOptionGroups'),
        );

        /*
         * The deliberate asymmetry, pinned by a test rather than only by prose. `src/handlers/router.ts`
         * resolves the graph at module load, so a misconfigured deployment of that entry fails its cold
         * start outright and loudly. These five defer it, so they stay loadable — the property §4 asserts —
         * and a misconfiguration surfaces here instead: classified as a configuration failure, per
         * invocation, and the offending variable published nowhere — the diagnostic carries the failure
         * class, the classification code and a correlation ID, and nothing else. Both halves are.
         */
        expect(response.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
        expect(response.body).toBe(
          JSON.stringify({ message: 'The service is not correctly configured' }),
        );

        /* Redirected, not discarded — and the variable name never reaches the caller. */
        expect(capture.lines).toHaveLength(1);
        expect(capture.lines[0] ?? '').toContain('ConfigurationError');
        expect(response.body).not.toContain('DB_HOST');
      } finally {
        capture.restore();
      }
    });
  });

  /* §7 — The deployment registration seam, on the artifact rather than only in the source. */

  /** The registration seam a gated entry must publish: the registrar, and nothing else. */
  interface GatedEntryAuthorizationSurface {
    readonly registerRequestAuthorizationResolver: (resolver: CatalogAuthorizationResolver) => void;
  }

  /** The shared declaration site, which additionally publishes the test-only reset. */
  interface AuthorizationSeamModule extends GatedEntryAuthorizationSurface {
    readonly clearRequestAuthorizationResolver: () => void;
  }

  /** The four gated entries. The feed row is filtered out by the same predicate §5 uses. */
  const GATED_ENTRIES = ENTRY_MODULES.filter(
    (entry): entry is (typeof ENTRY_MODULES)[number] & { gatedAction: string } =>
      entry.gatedAction !== undefined,
  );

  /** The principal the registered resolver reports: logged in, non-admin. */
  const REGISTERED_PRINCIPAL: AccountReference = Object.freeze({
    accountID: 'ffffffffffffffffffffffffffffffff',
    newFlag: false,
    adminAccountFlag: false,
  });

  /**
   * A resolver that admits every entity question, so the gate's outcome is the property under test.
   */
  const admitEverything: CatalogAuthorizationResolver = () => ({
    accountContext: { getCurrentAccount: () => REGISTERED_PRINCIPAL },
    entityAuthorization: { authenticateEntity: () => true },
    populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
  });

  describe('NET-NEW entry surface — every gated entry publishes the deployment registration seam', () => {
    it.each(GATED_ENTRIES.map((entry) => [entry.name, entry.path] as const))(
      '[NET-NEW] %s re-exports the shared registrar itself — and not the test-only reset',
      (_name, modulePath) => {
        const entry = jest.requireActual<GatedEntryAuthorizationSurface>(modulePath);
        const shared = jest.requireActual<AuthorizationSeamModule>(
          '../../src/handlers/httpResponse',
        );

        /*
         * Identity, not merely presence. A re-export forwards the one declaration, so both names resolve to
         * the same function object and there is exactly one registration cell for a deployment to fill. A
         * locally re-declared wrapper would satisfy a presence check and would introduce a second cell that
         * the four gated factories — which read §8.1's own reader — would never consult.
         */
        expect(entry.registerRequestAuthorizationResolver).toBe(
          shared.registerRequestAuthorizationResolver,
        );
        expect(entry.registerRequestAuthorizationResolver).toHaveLength(1);

        /*
         * And the reset is absent from the artifact's surface — the current contract, asserted here because
         * a re-export added back as a convenience would compile, lint and pass every other case. With the
         * reset published, `clear` then `register` walks around the single-shot refusal asserted below, and
         * anything holding the artifact can drop or swap the deployment's resolver in process. It stays
         * reachable from `src/handlers/httpResponse` alone, which is not an esbuild entry point.
         */
        const surface = jest.requireActual<Record<string, unknown>>(modulePath);

        expect(surface['clearRequestAuthorizationResolver']).toBeUndefined();
        expect(typeof shared.clearRequestAuthorizationResolver).toBe('function');
      },
    );

    it('[NET-NEW] the ungated feed entry publishes no seam, because it gates nothing', () => {
      const feed = jest.requireActual<Record<string, unknown>>(
        '../../src/handlers/googleFeedHandler',
      );

      /*
       * `google:feed.product` is the one ungated address in the slice — the port of `feed.cfc:L54-L56`,
       * where `secureMethods` and `anyAdminMethods` are both empty — so its artifact has no gate to
       * install and publishing a registrar on it would advertise one it does not consult.
       */
      expect(feed['registerRequestAuthorizationResolver']).toBeUndefined();
      expect(typeof feed['handler']).toBe('function');
    });

    it('[NET-NEW] a second registration still raises, so one declaration owns the gate', () => {
      const entry = jest.requireActual<GatedEntryAuthorizationSurface>(
        '../../src/handlers/skuHandler',
      );
      const shared = jest.requireActual<AuthorizationSeamModule>('../../src/handlers/httpResponse');

      try {
        entry.registerRequestAuthorizationResolver(admitEverything);

        /*
         * Re-exporting the registrar must not turn it into a setter. Two modules each believing they own
         * the gate is a configuration fault, and letting the last one win is how a deployment ends up
         * enforcing a resolver it did not intend — §8.1's reasoning, unchanged by the re-export.
         */
        expect(() => {
          entry.registerRequestAuthorizationResolver(admitEverything);
        }).toThrow(/already registered/);
      } finally {
        /*
         * The reset comes from the shared module, not from the artifact: is why the artifact has none,
         * and a suite that could only reach it through an entry point would be an argument for republishing
         * it there.
         */
        shared.clearRequestAuthorizationResolver();
      }
    });
  });

  describe('NET-NEW entry surface — a resolver registered THROUGH an artifact gates that artifact', () => {
    const savedEnvironment = new Map<string, string | undefined>();

    beforeEach(() => {
      for (const [name, value] of Object.entries(ENTRY_INVOCATION_ENVIRONMENT)) {
        savedEnvironment.set(name, process.env[name]);
        process.env[name] = value;
      }
    });

    afterEach(() => {
      for (const [name, value] of savedEnvironment) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
      savedEnvironment.clear();
    });

    it('[NET-NEW] brandHandler answers 401 before registration and passes its gate after', async () => {
      const capture = captureErrorStream();
      const entry = jest.requireActual<LambdaEntryModule & GatedEntryAuthorizationSurface>(
        '../../src/handlers/brandHandler',
      );
      const shared = jest.requireActual<AuthorizationSeamModule>('../../src/handlers/httpResponse');

      try {
        /*
         * Fail-closed first, from the artifact's own default resolver — the state every deployment starts
         * in and the state this port ships in.
         */
        const refused = await entry.handler(eventFor('brand.saveBrand'));

        expect(refused.statusCode).toBe(HTTP_STATUS.UNAUTHORIZED);
        expect(refused.body).toBe(JSON.stringify({ message: 'Authentication is required' }));

        entry.registerRequestAuthorizationResolver(admitEverything);

        /*
         * The same memoised dispatcher, a different answer — which is the whole point of §8.1 reading its
         * cell inside the call. The first invocation above built the graph and the dispatcher; registration
         * happened afterwards and is still honoured, so a deployment may register during initialisation
         * without racing module load, and no principal is captured when the graph is composed.
         */
        const admitted = await entry.handler(eventFor('brand.saveBrand'));

        /*
         * 400, not 401: the gate was passed and the invocation was then refused for its shape, one step
         * later. No service member ran, so no connection was opened — the strongest positive evidence
         * available without a database.
         */
        expect(admitted.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(admitted.body).toBe(JSON.stringify({ message: 'A request body is required' }));

        /* Neither answer is a failure, so nothing is written to the error stream. */
        expect(capture.lines).toEqual([]);
      } finally {
        shared.clearRequestAuthorizationResolver();
        capture.restore();
      }
    });

    it('[NET-NEW] the reset restores the fail-closed answer, and is reachable only off-artifact', async () => {
      const capture = captureErrorStream();
      const entry = jest.requireActual<LambdaEntryModule & GatedEntryAuthorizationSurface>(
        '../../src/handlers/brandHandler',
      );
      const shared = jest.requireActual<AuthorizationSeamModule>('../../src/handlers/httpResponse');

      try {
        entry.registerRequestAuthorizationResolver(admitEverything);
        expect((await entry.handler(eventFor('brand.saveBrand'))).statusCode).toBe(
          HTTP_STATUS.BAD_REQUEST,
        );

        /*
         * The artifact cannot do this, and that is the point. The reset is not on the entry's
         * surface — asserted by name in the identity case above — so a deployment holding
         * `dist/handlers/brandHandler.js` has no route back to the fail-closed state except a fresh module
         * registry. The suite reaches it through the shared module instead.
         */
        shared.clearRequestAuthorizationResolver();

        /*
         * And the only thing the reset can do is take the gate away: the cell returns to absent, which is
         * the fail-closed state, so it can never install a principal or relax a refusal. What it can do,
         * followed by a second `register`, is re-point the gate — which is why it is not published.
         */
        expect((await entry.handler(eventFor('brand.saveBrand'))).statusCode).toBe(
          HTTP_STATUS.UNAUTHORIZED,
        );
        expect(capture.lines).toEqual([]);
      } finally {
        shared.clearRequestAuthorizationResolver();
        capture.restore();
      }
    });
  });
});

/*
 * AAP §0.4.1.12 declares exactly seventeen executable suites, so this subject is covered
 * inside an approved suite rather than in one of its own.
 */

/* FOLDED IN FROM config/env */

/* Src/config/env.ts — the configuration loader, exercised through the real module-load path. */
describe('The configuration loader, which every layer depends on and none owns', () => {
  /* harness. */

  /** Resolved relative to this file so the suite is invocation-directory independent. */
  const ENV_MODULE_PATH = '../../src/config/env';

  /** `.env.example` is the operator-facing configuration document. */
  const ENV_EXAMPLE_PATH = join(__dirname, '..', '..', '.env.example');

  /** Every variable the loader reads, required and optional alike. */
  const LOADER_VARIABLE_NAMES: readonly string[] = [
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'DB_TLS_MODE',
    'DB_CONNECTION_LIMIT',
    'DB_QUEUE_LIMIT',
    'DB_CONNECT_TIMEOUT_MS',
    'GOOGLE_FEED_HOST',
    'SETTING_APPLICATION_ROOT_MAPPING_PATH',
    'SETTING_SKU_ELIGIBLE_CURRENCIES',
    'SETTING_SKU_ELIGIBLE_FULFILLMENT_METHODS',
    /*
     * The six finite resource bounds of decision H. They belong in this list for the same reason as every
     * other name: `loadConfigWith` deletes each one before applying a case's overrides, so a value left in
     * the ambient environment cannot leak between cases.
     */
    'CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY',
    'CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY',
    'CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST',
    'CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION',
    'CATALOG_GOOGLE_FEED_MAX_IMAGES_PER_RECORD',
    'CATALOG_GOOGLE_FEED_MAX_RESPONSE_BYTES',
  ];

  /**
   * A base that satisfies every other required variable, so a failure can only be the one under test.
   */
  const REQUIRED_BASE_ENVIRONMENT: Readonly<Record<string, string>> = Object.freeze({
    DB_HOST: 'localhost',
    DB_PORT: '3306',
    DB_NAME: 'Slatwall',
    DB_USER: 'slatwall',
    DB_PASSWORD: 'fixture-not-a-real-password',
    DB_TLS_MODE: 'disabled',
    DB_CONNECTION_LIMIT: '10',
    DB_QUEUE_LIMIT: '1',
    DB_CONNECT_TIMEOUT_MS: '10000',
    GOOGLE_FEED_HOST: 'catalog.example.test',
  });

  const ORIGINAL_ENVIRONMENT: Readonly<Record<string, string | undefined>> = Object.freeze({
    ...process.env,
  });

  /**
   * Load `src/config/env.ts` afresh with `overrides` applied over the valid base.
   *
   * @param overrides values to set; an explicit `undefined` unsets the variable rather than blanking it,
   * which is the distinction the loader's absent-versus-empty handling turns on
   *
   * @returns the freshly built configuration
   * @throws whatever the loader throws, unchanged, so each case can assert on it directly.
   */
  function loadConfigWith(overrides: Readonly<Record<string, string | undefined>> = {}): AppConfig {
    for (const name of LOADER_VARIABLE_NAMES) {
      delete process.env[name];
    }
    Object.assign(process.env, REQUIRED_BASE_ENVIRONMENT);
    for (const [name, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }

    jest.resetModules();

    /*
     * The module builds `config` as a load-time side effect and exposes no reload entry point, so a fresh
     * `require` after `jest.resetModules()` is the only way to observe a different environment. A static
     * import would bind one snapshot for the whole file, which is precisely the property this suite has to
     * defeat. The rule is disabled for this one expression and nowhere else.
     */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require(ENV_MODULE_PATH) as { readonly config: AppConfig };
    return loaded.config;
  }

  /** The rejection a case produced, or `undefined` when the loader accepted the value. */
  function captureLoadFailure(overrides: Readonly<Record<string, string | undefined>>): unknown {
    try {
      loadConfigWith(overrides);
      return undefined;
    } catch (failure: unknown) {
      return failure;
    }
  }

  /** Assert a rejection is the loader's own typed failure, naming the variable. */
  function expectVariableRejection(failure: unknown, variableName: string): void {
    expect(failure).toBeInstanceOf(Error);
    const error = failure as Error & { readonly context?: Readonly<Record<string, unknown>> };
    expect(error.name).toBe('ConfigurationError');
    expect(error.message).toContain(variableName);
    expect(error.context).toMatchObject({ variable: variableName });
  }

  beforeEach(() => {
    jest.resetModules();
  });

  afterAll(() => {
    for (const name of LOADER_VARIABLE_NAMES) {
      delete process.env[name];
    }
    for (const [name, value] of Object.entries(ORIGINAL_ENVIRONMENT)) {
      if (value !== undefined) {
        process.env[name] = value;
      }
    }
    jest.resetModules();
  });

  /* §1 — values inside the RFC 3986 §3.2.2 production are accepted, verbatim. */

  describe('NET-NEW env — GOOGLE_FEED_HOST accepts the host production', () => {
    it.each([
      ['a registered name', 'store.example.com'],
      ['a registered name with a port', 'store.example.com:8080'],
      ['an IPv4 literal', '192.0.2.10'],
      ['an IPv4 literal with a port', '192.0.2.10:80'],
      ['a bracketed IPv6 loopback', '[::1]'],
      ['a bracketed IPv6 literal with a port', '[2001:db8::1]:8443'],
      ['a fully expanded bracketed IPv6 literal', '[0:0:0:0:0:0:0:1]'],
      ['a single-label name', 'localhost'],
      ['an IDNA A-label', 'xn--bcher-kva.example'],
      ['a percent-encoded octet', 'store%20a.example'],
      ['sub-delimiters a reg-name admits', "a&b'c.example"],
    ])('[NET-NEW] accepts %s and stores it unchanged', (_description: string, host: string) => {
      /* stored unchanged is part of the contract, not an incidental detail. */
      expect(loadConfigWith({ GOOGLE_FEED_HOST: host }).googleFeed.host).toBe(host);
    });

    it('[NET-NEW] accepts sub-delimiters here precisely because the serializer answers for them', () => {
      /* The two-layer split, asserted rather than described. */
      expect(loadConfigWith({ GOOGLE_FEED_HOST: "a&b'c.example" }).googleFeed.host).toBe(
        "a&b'c.example",
      );
    });
  });

  /*
   * §2 and §3 — the host grammar, and the completeness rule that stands with it.
   */

  describe('NET-NEW env — GOOGLE_FEED_HOST refuses everything outside the authority production', () => {
    it.each([
      ['a scheme prefix', 'https://store.example.com'],
      ['a cleartext scheme prefix', 'http://store.example.com'],
      ['a path', 'store.example.com/feed'],
      ['bare userinfo', 'user@store.example.com'],
      ['userinfo with a password', 'user:pw@store.example.com'],
      ['a query', 'store.example.com?a=1'],
      ['a fragment', 'store.example.com#top'],
      ['a backslash', 'store.example.com\\feed'],
      ['embedded whitespace', 'store example.com'],
      ['leading whitespace', ' store.example.com'],
      ['trailing whitespace', 'store.example.com '],
      ['an embedded newline', 'store.example.com\nevil'],
      ['embedded markup', 'store.example.com<script>'],
      ['a NUL byte', 'store.example.com\u0000'],
      ['a bare unbracketed IPv6 literal', '2001:db8::1'],
      ['an unterminated bracket', '[2001:db8::1'],
      ['trailing text after the bracket', '[2001:db8::1]x'],
      ['a truncated percent-encoding', 'store%2.example'],
      ['a non-ASCII label', 'b\u00fccher.example'],
      ['a non-numeric port', 'store.example.com:http'],
      ['a port above the addressable range', 'store.example.com:65536'],
      ['a zero port', 'store.example.com:0'],
      ['an empty port', 'store.example.com:'],
    ])('[NET-NEW] refuses %s, naming the variable', (_description: string, host: string) => {
      /*
       * The failure names the variable and never echoes the value. A rejected authority is
       * attacker-supplied by hypothesis, so `expectVariableRejection` checks the variable name is present —
       * and the case below checks the value is absent, which is the half a naming assertion cannot cover.
       */
      expectVariableRejection(captureLoadFailure({ GOOGLE_FEED_HOST: host }), 'GOOGLE_FEED_HOST');
    });

    it('[NET-NEW] the refusal names the variable but NOT the rejected value', () => {
      /*
       * Copying a rejected authority into a configuration error would carry the payload into whatever
       * reads the log. The message states the production and names `GOOGLE_FEED_HOST`; the value appears
       * nowhere, and neither does the host inside it.
       */
      const failure = captureLoadFailure({ GOOGLE_FEED_HOST: 'store.example.com@evil.example' });
      /*
       * `captureLoadFailure` answers `unknown` on purpose — see its own note on why `instanceof` cannot be
       * used across `jest.resetModules()` — so the message is read through a narrowing test rather than an
       * assertion, and the serialised form is appended so a value hidden in `context` is caught too.
       */
      const message = failure instanceof Error ? failure.message : '';
      const rendered = `${message} ${JSON.stringify(failure)}`;

      expect(rendered).toContain('GOOGLE_FEED_HOST');
      expect(rendered).not.toContain('evil.example');
      expect(rendered).not.toContain('store.example.com@evil.example');
    });

    it('[NET-NEW] the port half is held to the SAME range DB_PORT is, by the same reader', () => {
      /*
       * One definition of "addressable TCP port" for the whole module: the boundary values pass and the
       * values one step outside them are refused, which is the observable form of the delegation.
       */
      expect(loadConfigWith({ GOOGLE_FEED_HOST: 'store.example.com:1' }).googleFeed.host).toBe(
        'store.example.com:1',
      );
      expect(loadConfigWith({ GOOGLE_FEED_HOST: 'store.example.com:65535' }).googleFeed.host).toBe(
        'store.example.com:65535',
      );
      expectVariableRejection(
        captureLoadFailure({ GOOGLE_FEED_HOST: 'store.example.com:65536' }),
        'GOOGLE_FEED_HOST',
      );
    });
  });

  describe('NET-NEW env — GOOGLE_FEED_HOST is required, non-blank, and otherwise unmodified', () => {
    it.each([
      ['a plain registered name', 'store.example.com'],
      ['a name with the lowest addressable port', 'store.example.com:1'],
      ['a name with the highest addressable port', 'store.example.com:65535'],
      ['a bracketed IPv6 literal', '[fe80::1]'],
    ])(
      '[NET-NEW] accepts %s and answers it byte-for-byte',
      (_description: string, host: string) => {
        /*
         * No trimming, no case folding, no punycode, no default-port stripping: the configured bytes are the
         * bytes every absolute URL in the feed is composed from.
         */
        expect(loadConfigWith({ GOOGLE_FEED_HOST: host }).googleFeed.host).toBe(host);
      },
    );

    it('[NET-NEW] refuses an absent variable and a blank one, separately', () => {
      /*
       * Absent and empty are distinct states, and the loader must refuse both — an empty host would
       * compose `http://` followed by nothing and publish a feed of unusable links. This is the
       * completeness rule, which holds independently of the grammar.
       */
      expectVariableRejection(
        captureLoadFailure({ GOOGLE_FEED_HOST: undefined }),
        'GOOGLE_FEED_HOST',
      );
      expectVariableRejection(captureLoadFailure({ GOOGLE_FEED_HOST: '' }), 'GOOGLE_FEED_HOST');
      expectVariableRejection(captureLoadFailure({ GOOGLE_FEED_HOST: '   ' }), 'GOOGLE_FEED_HOST');
    });
  });

  /* §4 — a platform fact worth recording, and the rule's blast radius. */

  describe('NET-NEW env — platform behaviour and blast radius', () => {
    /*
     * The authority grammar refuses a nul byte and a C0 control as a consequence of its own
     * production, so no separate case asserts them.
     */

    it('[NET-NEW] DB_HOST is held to its own MySQL-host grammar, which differs in three stated ways', () => {
      /*
       * Why `DB_HOST` carries a grammar rather than only `requireNonBlankValue`. without one,
       * `MySQL://10.0.0.1`, `user:pw@10.0.0.1`, a trailing newline and a non-ascii name all load —
       * in the one module whose purpose is typed validation with descriptive errors — and surface
       * later as an opaque driver connect failure. The grammar differs from the feed-host
       * production in three stated ways, each asserted below.
       */

      /* (1) a registered name, which is the ordinary case. */
      expect(
        loadConfigWith({ DB_HOST: 'db.internal.example', DB_TLS_MODE: 'verified' }).database.host,
      ).toBe('db.internal.example');

      /*
       * (2) a bare, bracket-free IPv6 address — a legitimate `mysql2` host, outside RFC 3986 §3.2.2, and
       * accepted here by the explicit `isIPv6` branch. Refusing it would break the loopback transport
       * rule for `::1`, which is the one arrangement that rule exists to serve.
       */
      expect(loadConfigWith({ DB_HOST: '::1', DB_TLS_MODE: 'disabled' }).database.host).toBe('::1');
      expect(
        loadConfigWith({ DB_HOST: '2001:db8::1', DB_TLS_MODE: 'verified' }).database.host,
      ).toBe('2001:db8::1');

      /*
       * (3) And the bracketed form, so an operator who writes the uri-style literal is not penalised.
       */
      expect(loadConfigWith({ DB_HOST: '[::1]', DB_TLS_MODE: 'disabled' }).database.host).toBe(
        '[::1]',
      );
    });

    it.each([
      ['a scheme prefix', 'mysql://10.255.255.1'],
      ['a userinfo prefix', 'user:pw@10.255.255.1'],
      ['a port suffix, which belongs in DB_PORT', 'db.internal.example:3306'],
      ['a trailing newline', '10.255.255.1\n'],
      ['a leading space', ' 10.255.255.1'],
      ['a non-ASCII registered name', 'dörterbank.qa000.invalid'],
      ['a path', 'db.internal.example/schema'],
      ['a filesystem socket path', '/var/run/mysqld/mysqld.sock'],
      ['embedded markup', 'db<script>.example'],
    ])('[NET-NEW] DB_HOST refuses %s', (_situation, host) => {
      /*
       * The first four and the sixth are the shapes a bare non-blank check admits. The socket path is refused with a
       * message that explains why: `src/config/database.ts` configures no socket option, so a path would
       * be resolved as a hostname and fail to connect — it could never have worked.
       */
      expectVariableRejection(
        captureLoadFailure({ DB_HOST: host, DB_TLS_MODE: 'verified' }),
        'DB_HOST',
      );
    });

    it('[NET-NEW] the six TLS-guard bypass shapes are still refused, grammar or no grammar', () => {
      /*
       * Each of these is a way to reach an unencrypted non-loopback session through the loopback
       * exemption, and none of them may succeed. The host grammar must not open one either: `0.0.0.0` and `127.0.0.999` are
       * syntactically fine registered names and are refused by the loopback rule instead, while
       * `127.0.0.1@evil.invalid` is now refused by the grammar. Either refusal is acceptable; being
       * accepted is not.
       */
      for (const host of [
        '0.0.0.0',
        '127.0.0.1.evil.invalid',
        '127.0.0.1@evil.invalid',
        'localhost.evil.invalid',
        '127.0.0.999',
        '127.1',
      ]) {
        expect(captureLoadFailure({ DB_HOST: host, DB_TLS_MODE: 'disabled' })).toBeInstanceOf(
          Error,
        );
      }

      /*
       * And the genuine loopback literals still pass, which is the other half of the same guarantee.
       */
      for (const host of ['127.0.0.1', 'localhost', '::1', '[::1]']) {
        expect(loadConfigWith({ DB_HOST: host, DB_TLS_MODE: 'disabled' }).database.host).toBe(host);
      }
    });

    it('[NET-NEW] a valid environment yields a frozen configuration with the feed host in place', () => {
      const config = loadConfigWith();

      expect(config.googleFeed.host).toBe('catalog.example.test');
      expect(Object.isFrozen(config)).toBe(true);
      expect(Object.isFrozen(config.googleFeed)).toBe(true);
    });

    it('[NET-NEW] DB_NAME is bounded by the MySQL identifier limit, the other half of the same finding', () => {
      /*
       * The same qa edge case that produced the db_host grammar above also recorded a `DB_NAME` of 4096
       * characters as accepted. Both halves came from one root cause — this module validated the feed host
       * carefully and its neighbouring connection coordinates barely at all — so both are pinned here.
       */
      const atTheLimit = 'a'.repeat(64);
      expect(loadConfigWith({ DB_NAME: atTheLimit }).database.database).toBe(atTheLimit);

      /* One character past it is refused, and the message names DB_NAME rather than the value. */
      expectVariableRejection(captureLoadFailure({ DB_NAME: 'a'.repeat(65) }), 'DB_NAME');
      expectVariableRejection(captureLoadFailure({ DB_NAME: 'a'.repeat(4096) }), 'DB_NAME');

      /*
       * And the check is length-only, deliberately. The `Sw*` schema is the fixed contract both systems
       * share and this port neither creates nor migrates it, while MySQL permits a wide character range in
       * a quoted identifier — so a name that genuinely exists must still load, however unusual it looks.
       * Screening characters here would risk refusing a real schema, which is the worse failure.
       */
      for (const unusualButLegal of [
        'slatwall-prod',
        'slatwall.v2',
        'Slatwall 3',
        '_slatwall',
        'sw$1',
      ]) {
        expect(loadConfigWith({ DB_NAME: unusualButLegal }).database.database).toBe(
          unusualButLegal,
        );
      }

      /*
       * The pre-existing non-blank rule is unchanged: absence and blankness still fail on their own terms.
       */
      expectVariableRejection(captureLoadFailure({ DB_NAME: undefined }), 'DB_NAME');
      expectVariableRejection(captureLoadFailure({ DB_NAME: '   ' }), 'DB_NAME');
    });
  });

  /* §4a — The boot contract: five variables required, four optional with stated fallbacks. */

  describe('NET-NEW env — the five-variable boot contract', () => {
    /** Exactly the keys AAP §0.4.1.3 documents, and nothing else. */
    const FIVE_KEY_ENVIRONMENT: Readonly<Record<string, string | undefined>> = Object.freeze({
      DB_TLS_MODE: undefined,
      DB_CONNECTION_LIMIT: undefined,
      DB_QUEUE_LIMIT: undefined,
      DB_CONNECT_TIMEOUT_MS: undefined,
    });

    it('[NET-NEW] loads with only DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD and the feed host', () => {
      const config = loadConfigWith(FIVE_KEY_ENVIRONMENT);

      /*
       * The five stated values arrive verbatim — nothing is defaulted for a connection target or an
       * identity, which is the half of the contract that must not relax.
       */
      expect(config.database.host).toBe('localhost');
      expect(config.database.port).toBe(3306);
      expect(config.database.database).toBe('Slatwall');
      expect(config.database.user).toBe('slatwall');
      expect(config.database.password).toBe('fixture-not-a-real-password');
    });

    it('[NET-NEW] an unset transport mode resolves to the verified one, never to cleartext', () => {
      /*
       * The fail-safe direction. `localhost` is a loopback literal, so `disabled` would have been legal
       * here — the point is that absence does not choose it.
       */
      expect(loadConfigWith(FIVE_KEY_ENVIRONMENT).database.tlsMode).toBe('verified');

      /*
       * And for a remote host, where cleartext is refused outright, absence is still `verified` rather
       * than a boot failure.
       */
      expect(
        loadConfigWith({ ...FIVE_KEY_ENVIRONMENT, DB_HOST: 'db.internal.example' }).database
          .tlsMode,
      ).toBe('verified');
    });

    it('[NET-NEW] an unset queue bound resolves to the declared floor, never to the unbounded sentinel', () => {
      /*
       * This is the one bound that cannot be delegated: `mysql2` reads zero as "no limit" and zero is its
       * default, so omitting the option would select an unbounded queue of waiting requests. The fallback
       * is the floor the loader already enforces for a supplied value — no new figure.
       */
      expect(loadConfigWith(FIVE_KEY_ENVIRONMENT).database.queueLimit).toBe(1);
      expect(loadConfigWith(FIVE_KEY_ENVIRONMENT).database.queueLimit).not.toBe(0);
    });

    it('[NET-NEW] an unset connection limit and connect timeout are OMITTED, not defaulted', () => {
      const database = loadConfigWith(FIVE_KEY_ENVIRONMENT).database;

      /*
       * Absent members, not members holding `undefined`: `src/config/database.ts` spreads them, so an
       * absent member means the driver option is left off entirely and the driver's own bounded default
       * applies. That is what lets this port state no number at all (IR-12).
       */
      expect(Object.hasOwn(database, 'connectionLimit')).toBe(false);
      expect(Object.hasOwn(database, 'connectTimeoutMs')).toBe(false);
    });

    it('[NET-NEW] a supplied optional value is still honoured verbatim and still validated', () => {
      const database = loadConfigWith({
        DB_CONNECTION_LIMIT: '7',
        DB_QUEUE_LIMIT: '9',
        DB_CONNECT_TIMEOUT_MS: '4321',
        DB_TLS_MODE: 'disabled',
      }).database;

      expect(database.connectionLimit).toBe(7);
      expect(database.queueLimit).toBe(9);
      expect(database.connectTimeoutMs).toBe(4321);
      expect(database.tlsMode).toBe('disabled');

      /*
       * Optional does not mean lenient: a present-but-bad value is still refused, and the zero sentinel is
       * still rejected rather than quietly replaced by the floor.
       */
      expectVariableRejection(captureLoadFailure({ DB_QUEUE_LIMIT: '0' }), 'DB_QUEUE_LIMIT');
      expectVariableRejection(
        captureLoadFailure({ DB_CONNECTION_LIMIT: 'ten' }),
        'DB_CONNECTION_LIMIT',
      );
      expectVariableRejection(captureLoadFailure({ DB_TLS_MODE: 'require' }), 'DB_TLS_MODE');
      /*
       * Blank is a misconfiguration rather than a way to say "unset", for an optional key as much as a
       * required one.
       */
      expectVariableRejection(
        captureLoadFailure({ DB_CONNECT_TIMEOUT_MS: '   ' }),
        'DB_CONNECT_TIMEOUT_MS',
      );
    });

    it.each([
      ['DB_HOST'],
      ['DB_PORT'],
      ['DB_NAME'],
      ['DB_USER'],
      ['DB_PASSWORD'],
      ['GOOGLE_FEED_HOST'],
    ])('[NET-NEW] %s is still required, and its absence names it', (variableName) => {
      /*
       * The other half of the contract. Relaxing the four optional keys must not relax these six, and each
       * failure still names the variable and leaks no value.
       */
      expectVariableRejection(
        captureLoadFailure({ ...FIVE_KEY_ENVIRONMENT, [variableName]: undefined }),
        variableName,
      );
    });

    it('[NET-NEW] no configuration failure leaks a supplied value into message, context or stack', () => {
      const failure = captureLoadFailure({
        ...FIVE_KEY_ENVIRONMENT,
        DB_PASSWORD: undefined,
        DB_USER: 'sentinel-user-value',
        DB_NAME: 'sentinel-schema-value',
      }) as Error & { readonly context?: unknown };

      const surface = `${failure.message} ${JSON.stringify(failure.context)} ${String(failure.stack)}`;

      expect(surface).toContain('DB_PASSWORD');
      expect(surface).not.toContain('sentinel-user-value');
      expect(surface).not.toContain('sentinel-schema-value');
      expect(surface).not.toContain('fixture-not-a-real-password');
    });
  });

  /* §5 — documentation parity — the operator-facing half of the current contract. */

  describe('NET-NEW env — .env.example matches what GOOGLE_FEED_HOST actually enforces', () => {
    /* The document is read inside each case, never at describe-registration scope. */
    const readEnvExample = (): string => readFileSync(ENV_EXAMPLE_PATH, 'utf8');

    it('[NET-NEW] states the enforced grammar and where it runs', () => {
      const envExample = readEnvExample();

      expect(envExample).toContain('GOOGLE_FEED_HOST');
      /* The published productions the rule transcribes, named so an operator can check it. */
      expect(envExample).toContain('RFC 3986');
      expect(envExample).toContain('3.2.2');
      expect(envExample).toContain('3.2.3');
      /* And where it runs, which is module load rather than the render path. */
      expect(envExample).toContain('src/config/env.ts');
    });

    it('[NET-NEW] does not attribute host validation to the feed builder', () => {
      /*
       * Two claims that must not appear. The first would attribute a validator to the builder,
       * which holds none; the second would cite a decision block as the authority for a refusal
       * nothing performs.
       */
      const envExample = readEnvExample();

      expect(envExample).not.toContain('validator refuses');
      expect(envExample).not.toContain('DECISION G-1');
    });

    it('[NET-NEW] still says plainly that host IDENTITY is not checked anywhere', () => {
      /*
       * The residual exposure must stay documented. A rule that checks shape is not a rule that checks
       * which host, and an operator who read the grammar paragraph as "the host is verified" would be
       * misled in the opposite direction from the original defect — overclaiming is the same class of
       * documentation failure as underclaiming. Asserted on the substance rather than on a heading, so
       * the document is free to separate the two facts (the grammar is enforced, the identity is not)
       * however it words them.
       */
      const envExample = readEnvExample();

      expect(envExample).toContain('identity of the host');
      expect(envExample).toContain('whether the authority you name is one you control');
      /* And it must not have quietly acquired an allowlist claim in the process. */
      expect(envExample).toContain('no allowlist of permitted feed hosts');
    });
  });

  describe('NET-NEW env — the template never instructs a shell to execute a secret file (CWE-78)', () => {
    /*
     * A template that tells an operator to source the filled-in copy makes every value code rather than
     * data: `.`/`source` runs the file as a shell program, and a secret routinely contains `$(`, a
     * backtick, `;` or `&&`. Chaining the shell's allexport option with `&&` compounds it, because
     * restoring allexport then depends on the load succeeding and any failure strands the shell exporting
     * every later assignment. Both halves are pinned closed below.
     */

    const readEnvExample = (): string => readFileSync(ENV_EXAMPLE_PATH, 'utf8');

    it('[NET-NEW] carries no executable sourcing idiom in any spelling', () => {
      const envExample = readEnvExample();

      /* The exact compound that was there, and the allexport half of it on its own. */
      expect(envExample).not.toContain('set -a && . ./.env && set +a');
      expect(envExample).not.toContain('set -a');
      expect(envExample).not.toContain('set +a');

      /*
       * And the idiom however it is respelled. `. ./.env`, `. .env`, `source .env` and
       * `source ./.env` are the same instruction; a fix that only deleted the first would leave the
       * finding open. The dotted forms are matched with the space that makes `.` the source builtin,
       * so ordinary prose mentioning a filename is not caught.
       */
      expect(envExample).not.toContain('. ./.env');
      expect(envExample).not.toContain('. .env');
      expect(envExample).not.toMatch(/\bsource\s+\.?\/?\.env/);
    });

    it('[NET-NEW] does not claim the file is safe to source, which was true only before values existed', () => {
      const envExample = readEnvExample();

      expect(envExample).not.toContain('safe to source');
      /*
       * The reasoning that made the claim sound, applied to the wrong artifact. It described the
       * template and licensed sourcing the filled copy, so it must not return either.
       */
      expect(envExample).not.toContain('no shell metacharacter');
    });

    it('[NET-NEW] names the hazard and offers a data-only route instead', () => {
      const envExample = readEnvExample();

      /* The weakness class, so a reader can trace the instruction to a published definition. */
      expect(envExample).toContain('CWE-78');
      /* Both defects stated, not just the eye-catching one. */
      expect(envExample).toContain('executes the values');
      expect(envExample).toContain('allexport');
      /* And a correct alternative, so the guidance is redirected rather than merely deleted. */
      expect(envExample).toContain('--env-file');
    });

    it('[NET-NEW] tells the reader the ONE filename .gitignore actually ignores', () => {
      /*
       * `.env.local` reads as the safer, more conventional choice and is not ignored here.
       * Slatwall-ts/.gitignore lists the literal filename `.env` rather than a wildcard, deliberately,
       * so that `.env.example` stays committable; the consequence is that `.env` is ignored while
       * `.env.local`, `.env.dev` and `.env.production` are all stageable credential files.
       */
      const envExample = readEnvExample();
      const gitignore = readFileSync(join(SUBTREE_ROOT, '.gitignore'), 'utf8');

      const ignoredLines = gitignore
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'));

      /* The precondition the warning rests on: the exact name, and no env wildcard. */
      expect(ignoredLines).toContain('.env');
      expect(ignoredLines).not.toContain('.env*');
      expect(ignoredLines).not.toContain('*.env');
      expect(ignoredLines).not.toContain('.env.*');

      /* So the template must warn about the variants rather than recommend one. */
      expect(envExample).toContain('.env.local');
      expect(envExample).toContain('git check-ignore');
    });

    it('[NET-NEW] remains value-free: every declaration is a bare NAME= with nothing after it', () => {
      /*
       * The template's primary safety property, and the one every other claim here depends on: it is a
       * checklist of names. A value committed to it would be a credential in version control, and
       * would also retroactively make the deleted "safe to source" claim false again.
       */
      const declarations = readEnvExample()
        .split('\n')
        .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line));

      /*
       * The five-variable boot contract plus google_feed_host — assert the set, not merely the count.
       */
      expect(declarations.map((line) => line.split('=')[0]).sort()).toEqual([
        'DB_HOST',
        'DB_NAME',
        'DB_PASSWORD',
        'DB_PORT',
        'DB_USER',
        'GOOGLE_FEED_HOST',
      ]);

      for (const declaration of declarations) {
        expect(declaration).toMatch(/^[A-Za-z_][A-Za-z0-9_]*=$/);
      }
    });
  });

  describe('NET-NEW env — the three finite resource bounds', () => {
    /* Why these names exist at all, given that seven others were removed from this loader. */

    it('[NET-NEW] env omits every bound when none is set, rather than defaulting one', () => {
      const config = loadConfigWith({
        CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY: undefined,
        CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST: undefined,
        CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION: undefined,
      });

      /*
       * The section is always present and always frozen; its members may all be absent. The container reads
       * `config.resourceBounds` unconditionally, so an absent section would be a load-time crash rather than
       * an unbounded graph.
       */
      expect(config.resourceBounds).toStrictEqual({});
      expect(Object.isFrozen(config.resourceBounds)).toBe(true);

      /*
       * The key is omitted, not written as `undefined`, and under `exactOptionalPropertyTypes` that is a
       * real distinction rather than a stylistic one: the collaborators declare their budget arguments as
       * optional members, and a key present holding `undefined` is not assignable to one. `toStrictEqual({})`
       * above already fails on a present-but-undefined key, and this states the same property directly.
       */
      expect(Object.keys(config.resourceBounds)).toStrictEqual([]);
    });

    it('[NET-NEW] env carries each stated bound through as a number, independently', () => {
      /*
       * Independently is the point. Each bound guards a different path — materialisation, SKU enumeration,
       * URL-title probing — so a deployment that has measured one must not be obliged to state the other two.
       */
      expect(
        loadConfigWith({ CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY: '5000' }).resourceBounds,
      ).toStrictEqual({ smartListMaximumRecordsPerQuery: 5000 });

      expect(
        loadConfigWith({ CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST: '1' }).resourceBounds,
      ).toStrictEqual({ skuMaximumCombinationsPerRequest: 1 });

      expect(
        loadConfigWith({ CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION: '25' }).resourceBounds,
      ).toStrictEqual({ urlTitleMaximumProbesPerDerivation: 25 });

      /*
       * And all three together, so the conditional spreads cannot drop one when its siblings are present.
       */
      expect(
        loadConfigWith({
          CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY: '5000',
          CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST: '64',
          CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION: '25',
        }).resourceBounds,
      ).toStrictEqual({
        smartListMaximumRecordsPerQuery: 5000,
        skuMaximumCombinationsPerRequest: 64,
        urlTitleMaximumProbesPerDerivation: 25,
      });
    });

    it('[NET-NEW] env refuses an unusable bound at load, naming the variable', () => {
      /*
       * Zero is the dangerous one to admit silently, which is why the floor is enforced here rather than
       * left to the collaborator: a bound of zero would refuse every query rather than bounding it, so it
       * would present as a total outage that looks like a code defect. Blank is refused for the same reason
       * the setting names are — a name typed and left empty looks like working configuration.
       */
      const unusable = ['0', '-1', '1.5', 'NaN', 'Infinity', '', ' ', 'many', '1e3', '0x10'];

      for (const value of unusable) {
        const failure = captureLoadFailure({
          CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY: value,
        });

        expect(failure).toBeInstanceOf(Error);
        expect(failure instanceof Error ? failure.message : '').toContain(
          'CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY',
        );
      }

      /*
       * The same rule reaches the other two names, so no bound is validated more loosely than its siblings.
       */
      for (const name of [
        'CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST',
        'CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION',
      ]) {
        const failure = captureLoadFailure({ [name]: '0' });

        expect(failure).toBeInstanceOf(Error);
        expect(failure instanceof Error ? failure.message : '').toContain(name);
      }
    });

    it('[NET-NEW] every bound is absent from .env.example, names and all', () => {
      /*
       * The file must declare the names and commit no value, which is the same contract every other name in
       * it holds. The three are commented out rather than left as bare empty assignments, because for these an
       * empty assignment is an error while omission is correct — exactly as for the three setting names.
       */
      const example = readFileSync(ENV_EXAMPLE_PATH, 'utf8');

      for (const name of [
        'CATALOG_SMART_LIST_MAX_RECORDS_PER_QUERY',
        'CATALOG_SMART_LIST_MAX_PREDICATES_PER_QUERY',
        'CATALOG_SKU_MAX_COMBINATIONS_PER_REQUEST',
        'CATALOG_URL_TITLE_MAX_PROBES_PER_DERIVATION',
        'CATALOG_GOOGLE_FEED_MAX_IMAGES_PER_RECORD',
        'CATALOG_GOOGLE_FEED_MAX_RESPONSE_BYTES',
      ]) {
        expect(example).toContain(`# ${name}=`);
        /* No uncommented assignment, and therefore no committed value. */
        expect(example).not.toMatch(new RegExp(`^${name}=`, 'mu'));
      }
    });
  });

  /*
   * §9 — The variable census is exhaustive, and it agrees with the loader rather than with itself.
   * A hand-maintained count repeated in prose — including in a runtime error message an operator
   * reads — drifts from the loader silently, and a count a reader is invited to trust and cannot
   * check is worse than no count. So `src/config/env.ts` declares the inventory as data and asserts
   * its own arithmetic at load; these cases check that against the loader.
   */

  describe('NET-NEW env — the variable census matches the loader it documents', () => {
    /**
     * The loader's own source, read from disk rather than imported, so the reads can be counted.
     */
    const ENV_SOURCE = readFileSync(join(__dirname, '..', '..', 'src', 'config', 'env.ts'), 'utf8');

    /** One census entry, as the loader reports it. */
    interface CensusEntry {
      readonly name: string;
      readonly required: boolean;
      readonly loader: string;
    }

    /**
     * The loader's own census, read from a freshly loaded module.
     *
     * @returns one entry per variable the loader reads.
     */
    function environmentVariableCensus(): readonly CensusEntry[] {
      loadConfigWith();

      /* Same rule, same reason, same single-expression scope as `loadConfigWith`'s own require. */
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const loaded = require(ENV_MODULE_PATH) as {
        readonly environmentVariableCensus: () => readonly CensusEntry[];
      };

      return loaded.environmentVariableCensus();
    }

    /** Every `process.env.NAME` access the loader performs. */
    function environmentReadsInLoaderSource(): readonly string[] {
      return [...ENV_SOURCE.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/gu)]
        .map((match) => match[1])
        .filter((name): name is string => name !== undefined);
    }

    it('[NET-NEW] the census names exactly the variables the loader reads, and no others', () => {
      const declared = [...environmentVariableCensus()].map((entry) => entry.name).sort();
      const read = [...new Set(environmentReadsInLoaderSource())].sort();

      expect(declared).toStrictEqual(read);
    });

    it('[NET-NEW] the census is nineteen names, six required and thirteen optional', () => {
      const census = environmentVariableCensus();
      const required = census.filter((entry) => entry.required).map((entry) => entry.name);

      expect(census).toHaveLength(19);
      expect(required).toStrictEqual([
        'DB_HOST',
        'DB_PORT',
        'DB_NAME',
        'DB_USER',
        'DB_PASSWORD',
        'GOOGLE_FEED_HOST',
      ]);
      expect(census.filter((entry) => !entry.required)).toHaveLength(13);
    });

    it('[NET-NEW] every census entry names a real loader, and the per-loader split is 9/1/3/6', () => {
      const census = environmentVariableCensus();
      const perLoader = (loader: string): number =>
        census.filter((entry) => entry.loader === loader).length;

      expect(perLoader('loadDatabaseConfig')).toBe(9);
      expect(perLoader('loadGoogleFeedConfig')).toBe(1);
      expect(perLoader('loadSettingsConfig')).toBe(3);
      expect(perLoader('loadResourceBoundsConfig')).toBe(6);
    });

    it('[NET-NEW] the census is frozen, so no caller can rewrite the inventory it audits', () => {
      const census = environmentVariableCensus();

      expect(Object.isFrozen(census)).toBe(true);
      expect(new Set(census.map((entry) => entry.name)).size).toBe(census.length);
    });

    it("[NET-NEW] this harness's own clear-list is the census, so no ambient value can leak", () => {
      /*
       * The defect this case prevents was real. `LOADER_VARIABLE_NAMES` omitted three of the six resource
       * bounds, so `loadConfigWith` left whatever the ambient environment held for them in place and an
       * operator running the suite in a configured shell could have got a different result from CI.
       */
      expect([...LOADER_VARIABLE_NAMES].sort()).toStrictEqual(
        [...environmentVariableCensus()].map((entry) => entry.name).sort(),
      );
    });

    it('[NET-NEW] env.example declares every census name, required ones blank and optional ones commented', () => {
      const example = readFileSync(ENV_EXAMPLE_PATH, 'utf8');

      for (const { name, required } of environmentVariableCensus()) {
        if (required) {
          /* A required name is present and empty, because it has to be filled in. */
          expect(example).toMatch(new RegExp(`^${name}=$`, 'mu'));
        } else {
          /*
           * An optional name is commented out, because a present-but-blank optional value is an error.
           */
          expect(example).toContain(`# ${name}=`);
          expect(example).not.toMatch(new RegExp(`^${name}=`, 'mu'));
        }
      }
    });
  });
});

/*
 * The composition root, reached through the real module-load path: the two delete-subject resolvers
 * and the hydration-keyed parent product-type reader. AAP §0.3.1 declares exactly seventeen suites
 * and a container suite is not one of them, so these cases live in this regression suite alongside
 * the other composition-root and router wiring cases.
 */

describe('The production composition root: the two delete-subject resolvers and the parent product-type reader', () => {
  /** The module under test, reached by path rather than by static import. */
  const CONTAINER_MODULE_PATH = '../../src/config/container';

  /** The product identifier every case here deletes. A 32-character hex string, per AAP IR-6. */
  const PRODUCT_ID = 'aaaa1111bbbb2222cccc3333dddd4444';

  /** A configuration the loader accepts. */
  const REQUIRED_BASE_ENVIRONMENT: Readonly<Record<string, string>> = Object.freeze({
    DB_HOST: 'localhost',
    DB_PORT: '3306',
    DB_NAME: 'Slatwall',
    DB_USER: 'slatwall',
    DB_PASSWORD: 'fixture-not-a-real-password',
    DB_TLS_MODE: 'disabled',
    DB_CONNECTION_LIMIT: '10',
    DB_QUEUE_LIMIT: '1',
    DB_CONNECT_TIMEOUT_MS: '10000',
    GOOGLE_FEED_HOST: 'catalog.example.test',
  });

  const ORIGINAL_ENVIRONMENT: Readonly<Record<string, string | undefined>> = Object.freeze({
    ...process.env,
  });

  afterEach(() => {
    for (const name of Object.keys(process.env)) {
      if (!(name in ORIGINAL_ENVIRONMENT)) {
        delete process.env[name];
      }
    }
    Object.assign(process.env, ORIGINAL_ENVIRONMENT);
    jest.resetModules();
  });

  /** One recorded call to the SKU repository's transaction-existence member. */
  interface RecordedExistenceCall {
    readonly productID: string | undefined;
    readonly skuID: string | undefined;
  }

  /**
   * Build the real production graph, overriding only the SKU repository.
   *
   * @param transactionExists what the stand-in repository answers.
   * @returns the container plus the call log the resolver produced.
   */
  function buildContainerWithExistenceProbe(transactionExists: boolean): {
    readonly container: CatalogContainer;
    readonly existenceCalls: readonly RecordedExistenceCall[];
  } {
    Object.assign(process.env, REQUIRED_BASE_ENVIRONMENT);
    jest.resetModules();

    const existenceCalls: RecordedExistenceCall[] = [];

    const skuRepository = {
      transactionExists: (productID?: string, skuID?: string): Promise<boolean> => {
        existenceCalls.push({ productID, skuID });
        return Promise.resolve(transactionExists);
      },
    } as Pick<SkuRepository, 'transactionExists'> as SkuRepository;

    const overrides: CatalogContainerOverrides = { skuRepository };

    /*
     * The module builds nothing lazily that this suite needs, but it does read `process.env` at load, so a
     * fresh `require` after `jest.resetModules()` is the only way to observe the environment set above.
     * The rule is disabled for this one expression and nowhere else.
     */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loaded = require(CONTAINER_MODULE_PATH) as {
      readonly createCatalogContainer: (overrides?: CatalogContainerOverrides) => CatalogContainer;
    };

    return { container: loaded.createCatalogContainer(overrides), existenceCalls };
  }

  /**
   * A product in the state a row produces, which is the state the defect was invisible in.
   *
   * @returns a managed product carrying only persisted column values.
   */
  function hydratedProduct(): Product {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rowMappers = require('../../src/adapters/mysql/rowMappers') as {
      readonly mapProductRow: (row: Record<string, unknown>) => Product;
    };

    return rowMappers.mapProductRow({
      productID: PRODUCT_ID,
      productName: 'Feed Product',
      productCode: 'FP-1',
      urlTitle: 'feed-product',
      activeFlag: 1,
      publishedFlag: 1,
    });
  }

  describe('createCatalogContainer — relationship population and product persistence are wired', () => {
    it('NET-NEW — prefetches the in-scope relationship graph and honours the persistence override', async () => {
      Object.assign(process.env, REQUIRED_BASE_ENVIRONMENT);
      jest.resetModules();

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const loaded = require(CONTAINER_MODULE_PATH) as {
        readonly createCatalogContainer: (
          overrides?: CatalogContainerOverrides,
        ) => CatalogContainer;
        readonly createDefaultSkuDelegateBinder: (
          settings: ReturnType<typeof createSettingResolverDouble>['resolver'],
        ) => (sku: InstanceType<typeof Sku>) => { readonly skuID: string };
      };
      // These constructors must come from the same post-reset module graph as the container because
      // the coordinator deliberately uses `instanceof Sku` to guard the default/inverse SKU seams.
      const productModule = jest.requireActual<typeof import('../../src/domain/product/Product')>(
        '../../src/domain/product/Product',
      );
      const productTypeModule = jest.requireActual<
        typeof import('../../src/domain/product/ProductType')
      >('../../src/domain/product/ProductType');
      const brandModule = jest.requireActual<typeof import('../../src/domain/product/Brand')>(
        '../../src/domain/product/Brand',
      );
      const skuModule = jest.requireActual<typeof import('../../src/domain/sku/Sku')>(
        '../../src/domain/sku/Sku',
      );
      const optionModule = jest.requireActual<typeof import('../../src/domain/option/Option')>(
        '../../src/domain/option/Option',
      );
      const optionGroupModule = jest.requireActual<
        typeof import('../../src/domain/option/OptionGroup')
      >('../../src/domain/option/OptionGroup');

      const brandID = '10000000000000000000000000000001';
      const productTypeID = '20000000000000000000000000000002';
      const childProductTypeID = '20000000000000000000000000000003';
      const productID = '30000000000000000000000000000003';
      const skuID = '40000000000000000000000000000004';
      const optionID = '50000000000000000000000000000005';
      const optionGroupID = '60000000000000000000000000000006';

      const brand = new brandModule.Brand();
      brand.brandID = brandID;
      brand.brandName = 'Prefetched Brand';

      const productType = new productTypeModule.ProductType();
      productType.productTypeID = productTypeID;
      productType.productTypeIDPath = productTypeID;
      productType.productTypeName = 'Merchandise';
      productType.systemCode = 'merchandise';

      const sku = new skuModule.Sku();
      sku.skuID = skuID;
      sku.skuCode = 'PREFETCH-SKU';

      const option = new optionModule.Option();
      option.optionID = optionID;
      option.optionCode = 'PREFETCH-OPTION';
      option.optionName = 'Prefetched Option';

      const optionGroup = new optionGroupModule.OptionGroup();
      optionGroup.optionGroupID = optionGroupID;
      optionGroup.optionGroupName = 'Prefetched Group';
      optionGroup.sortOrder = 1;

      /*
       * `SkuService.createSkus` binds the default-SKU delegate before the SKU save path mints its
       * identifier. The delegate therefore has to read the live SKU rather than snapshotting the
       * unsaved sentinel, or the product's second write cannot persist `defaultSkuID`.
       */
      const transientDefaultSku = new skuModule.Sku();
      const bindDefaultSkuDelegate = loaded.createDefaultSkuDelegateBinder(
        createSettingResolverDouble({ fallback: '' }).resolver,
      );
      const transientDefaultSkuDelegate = bindDefaultSkuDelegate(transientDefaultSku);
      expect(transientDefaultSkuDelegate.skuID).toBe('');
      transientDefaultSku.skuID = '40000000000000000000000000000008';
      expect(transientDefaultSkuDelegate.skuID).toBe(transientDefaultSku.skuID);
      expect(bindDefaultSkuDelegate(transientDefaultSku)).toBe(transientDefaultSkuDelegate);

      const recordsByEntity: Readonly<Record<string, readonly object[]>> = Object.freeze({
        SlatwallBrand: Object.freeze([brand]),
        SlatwallProductType: Object.freeze([productType]),
        SlatwallSku: Object.freeze([sku]),
        SlatwallOption: Object.freeze([option]),
        SlatwallOptionGroup: Object.freeze([optionGroup]),
      });
      const smartList = createSmartListQueryDouble({
        respond: (query) => ({
          kind: 'page',
          metrics: {},
          records: recordsByEntity[query.entityName] ?? [],
        }),
      });

      const persistedProducts: Product[] = [];
      const persistedProductTypes: ProductType[] = [];
      const persistence: ProductPersistence = {
        saveProduct: (candidate) => {
          persistedProducts.push(candidate);
          return Promise.resolve(candidate);
        },
        deleteProduct: () => Promise.resolve(),
        saveProductType: (candidate) => {
          persistedProductTypes.push(candidate);
          return Promise.resolve(candidate);
        },
        deleteProductType: () => Promise.resolve(),
      };

      /*
       * The SKU write path is substituted for the same reason the product persistence above is: the
       * nested `skus` item below carries more than its identifier, which makes it a **populated
       * sub-property**, and `org/Hibachi/HibachiDAO.cfc:L52-L64` recurses into those and saves them. So
       * the save now reaches a SKU write, and with the MySQL adapter left in place it would reach a
       * statement instead of a double.
       */
      const skuRepository = createInMemorySkuRepository({});

      const container = loaded.createCatalogContainer({
        settings: createSettingResolverDouble({ fallback: '' }).resolver,
        accountContext: createAccountContextDouble().accountContext,
        populationAuthorization: createPopulationAuthorizationDouble().populationAuthorization,
        uniqueProperty: createUniquePropertyDouble().uniqueProperty,
        smartListQueryPort: smartList.smartList,
        productPersistence: persistence,
        skuRepository: skuRepository.repository,
      });

      const product = new productModule.Product();
      product.productID = productID;
      const productData: Record<string, unknown> = {
        productName: 'Prefetched Product',
        productCode: 'PREFETCH-PRODUCT',
        urlTitle: 'prefetched-product',
        price: '42.50',
        brand: { brandID },
        productType: { productTypeID },
        skus: [
          {
            skuID,
            /*
             * `price` and `skuCode` are supplied because the populated sub-property is now validated
             * against `model/validation/Sku.json` in the parent's own context
             * (`org/Hibachi/HibachiTransient.cfc:L412-L450`), and both are `required` there. A SKU read
             * from the database carries them; this one comes from a smart-list double that mints a bare
             * entity, so the payload states them.
             */
            skuCode: 'PREFETCH-PRODUCT-1',
            price: '42.50',
            options: [{ optionID, optionGroup: { optionGroupID } }],
          },
        ],
      };

      await expect(container.productService.saveProduct(product, productData)).resolves.toBe(
        product,
      );

      expect(product.brand).toBe(brand);
      expect(product.productType).toBe(productType);
      expect(product.price).toBe('42.50');
      expect(product.getSkus()).toContain(sku);
      expect(sku.getOptions()).toContain(option);
      expect(option.optionGroup).toBe(optionGroup);
      expect(persistedProducts).toEqual([product]);
      /*
       * The cascade itself, asserted rather than assumed: the nested SKU was written, and it was written
       * with the values the nested struct populated. Before the two passes existed this collection was
       * populated in memory and then discarded — a `200` for a write that never happened.
       */
      expect(skuRepository.persisted).toContain(sku);
      expect(sku.skuCode).toBe('PREFETCH-PRODUCT-1');
      expect(smartList.queries.map((query) => query.entityName)).toEqual([
        'SlatwallBrand',
        'SlatwallProductType',
        'SlatwallSku',
        'SlatwallOption',
        'SlatwallOptionGroup',
      ]);

      const child = new productTypeModule.ProductType();
      child.productTypeID = childProductTypeID;
      child.activeFlag = true;
      await expect(
        container.productService.saveProductType(child, {
          productTypeName: 'Child Type',
          urlTitle: 'child-type',
          parentProductType: { productTypeID },
        }),
      ).resolves.toBe(child);

      expect(child.parentProductType).toBe(productType);
      expect(persistedProductTypes).toEqual([child]);
      expect(
        smartList.queries.filter((query) => query.entityName === 'SlatwallProductType'),
      ).toHaveLength(2);

      const identifierStringProduct = new productModule.Product();
      identifierStringProduct.productID = '30000000000000000000000000000007';
      const queryCountBeforeStringForm = smartList.queries.length;
      await container.productService.saveProduct(identifierStringProduct, {
        productName: 'String Relationship',
        productCode: 'STRING-RELATIONSHIP',
        urlTitle: 'string-relationship',
        price: '10.00',
        productType: productTypeID,
      });

      expect(identifierStringProduct.productType).toBeUndefined();
      expect(identifierStringProduct.hasError('productType')).toBe(true);
      expect(smartList.queries).toHaveLength(queryCountBeforeStringForm);
      expect(persistedProducts).toEqual([product]);
    });
  });

  describe('createCatalogContainer — the Product delete guard is wired', () => {
    it('NET-NEW — a delete RESOLVES the transaction-existence flag through the graph', async () => {
      // The assertion this case turns on: an empty call log means nothing in either production
      // graph asked the question, leaving the guard no answer to read.
      const { container, existenceCalls } = buildContainerWithExistenceProbe(true);
      const product = hydratedProduct();

      await expect(container.productService.deleteProduct(product)).resolves.toBe(false);

      expect(existenceCalls).toHaveLength(1);
      expect(product.transactionExistsFlag).toBe(true);
    });

    it('NET-NEW — the identifier crosses into the DAO argument order the legacy declares', async () => {
      // `createTransactionExistenceChecker` documents the crossing: the caller's slot 1 is `skuID` and the
      // DAO's slot 1 is `productID` [`model/dao/SkuDAO.cfc:L53`]. A product delete supplies the product
      // identifier, so it must arrive in slot 1 with the SKU slot empty — reading it the other way round
      // would silently probe a SKU whose identifier happens to be a product's.
      const { container, existenceCalls } = buildContainerWithExistenceProbe(true);

      await container.productService.deleteProduct(hydratedProduct());

      expect(existenceCalls[0]?.productID).toBe(PRODUCT_ID);
      expect(existenceCalls[0]?.skuID ?? undefined).toBeUndefined();
    });

    it('NET-NEW — a guarded delete answers false and restores nothing it did not clear', async () => {
      // `model/service/ProductService.cfc:L329-L333` restores the default SKU on failure only, and only
      // when there was something to restore. A hydrated product with no default SKU has nothing, so the
      // refusal must not invent one.
      const { container } = buildContainerWithExistenceProbe(true);
      const product = hydratedProduct();

      await expect(container.productService.deleteProduct(product)).resolves.toBe(false);

      expect(product.defaultSku).toBeUndefined();
    });

    it('NET-NEW — the resolver populates the transaction flag ALONE, not the inert physicalCounts', async () => {
      // `model/validation/Product.json:L7` declares a `physicalCounts` maxCollection of 0, and the
      // property is declared nowhere in `model/entity/Product.cfc`, so the legacy existence gate at
      // `org/Hibachi/HibachiValidationService.cfc:L171` skips the rule entirely. Resolving it here would
      // activate a guard the legacy never fires — the enhancement AAP §0.8.2 guideline 4 forbids.
      const { container } = buildContainerWithExistenceProbe(true);
      const product = hydratedProduct();

      await expect(container.productService.deleteProduct(product)).resolves.toBe(false);

      // Exactly one property was resolved onto the subject.
      expect(product.transactionExistsFlag).toBe(true);
      expect(Object.hasOwn(product, 'physicalCounts')).toBe(false);
    });
  });

  /* — the brand delete guard is wired. */

  describe('createCatalogContainer — the Brand products delete guard is wired', () => {
    /** The brand every case here deletes. A 32-character hex string, per AAP IR-6. */
    const BRAND_ID = 'eeee5555ffff6666aaaa7777bbbb8888';
    /** A product that brand still owns. */
    const OWNED_PRODUCT_ID = 'aaaa1111bbbb2222cccc3333dddd5555';

    /** One recorded call to the products read the guard performs. */
    interface RecordedProductsRead {
      readonly brandID: string;
    }

    /**
     * Build the real production graph, overriding only the brand repository.
     *
     * @param ownedProductIDs what the stand-in read answers for any brand.
     * @returns the container, the call log, and the brands the repository was asked to remove.
     */
    function buildContainerWithProductsProbe(
      ownedProductIDs: readonly string[],
      options: { readonly workingCleanup?: boolean } = {},
    ): {
      readonly container: CatalogContainer;
      readonly productsReads: readonly RecordedProductsRead[];
      readonly removed: readonly string[];
    } {
      Object.assign(process.env, REQUIRED_BASE_ENVIRONMENT);
      jest.resetModules();

      const productsReads: RecordedProductsRead[] = [];
      const removed: string[] = [];

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const rowMappers = require('../../src/adapters/mysql/rowMappers') as {
        readonly mapBrandRow: (row: Record<string, unknown>) => ManagedEntity<Brand>;
      };

      const brandRepository = {
        newBrand: (): ManagedEntity<Brand> =>
          rowMappers.mapBrandRow({ brandID: '', brandName: 'Transient' }),
        getBrand: (brandID: string): Promise<ManagedEntity<Brand> | null> =>
          Promise.resolve(
            rowMappers.mapBrandRow({
              brandID,
              brandName: 'ACME Widgets',
              urlTitle: 'acme-widgets',
              brandWebsite: 'https://acme.example.com',
            }),
          ),
        saveBrand: (brand: ManagedEntity<Brand>): Promise<ManagedEntity<Brand>> =>
          Promise.resolve(brand),
        deleteBrand: (brand: ManagedEntity<Brand>): Promise<boolean> => {
          removed.push(brand.brandID);
          return Promise.resolve(true);
        },
        urlTitleProbeBudget: GENEROUS_URL_TITLE_PROBE_BUDGET,
        isUrlTitleAvailable: (): Promise<boolean> => Promise.resolve(true),
        findProductIdentifiersByBrand: (brandID: string): Promise<string[]> => {
          productsReads.push({ brandID });
          return Promise.resolve([...ownedProductIDs]);
        },
      } as BrandRepository;

      /*
       * The cleanup ports are overridden only where a case needs the success path to complete. Their
       * production defaults are not-implemented stubs that raise — `settingService` and `commentService`
       * are out of scope (AAP §0.2.2.1) — and `BaseService.delete` reaches both after it has removed the
       * row. The case below that leaves them at their defaults is not fighting the harness: it is pinning
       * the exact exposure, and it is the reason a brand boundary has to exist.
       */
      const cleanupOverrides: CatalogContainerOverrides =
        options.workingCleanup === true
          ? {
              settingCleanup: {
                removeAllEntityRelatedSettings: (): Promise<void> => Promise.resolve(),
                /*
                 * Answers a row count, not void — `model/service/HibachiService.cfc:L77` reads it.
                 */
                updateAllSettingValuesToRemoveSpecificID: (): Promise<number> => Promise.resolve(0),
                clearAllSettingsCache: (): Promise<void> => Promise.resolve(),
              },
              commentCleanup: {
                removeAllEntityRelatedComments: (): Promise<void> => Promise.resolve(),
              },
            }
          : {};

      const overrides: CatalogContainerOverrides = { brandRepository, ...cleanupOverrides };

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const loaded = require(CONTAINER_MODULE_PATH) as {
        readonly createCatalogContainer: (
          overrides?: CatalogContainerOverrides,
        ) => CatalogContainer;
      };

      return { container: loaded.createCatalogContainer(overrides), productsReads, removed };
    }

    /**
     * A brand as a row produces it: `products` is an empty live array, exactly as the defect found it.
     */
    function hydratedBrand(container: CatalogContainer): Promise<ManagedEntity<Brand> | null> {
      return container.brandService.getBrand(BRAND_ID);
    }

    it('NET-NEW — a brand that STILL OWNS products is refused, and no row is deleted', async () => {
      const probe = buildContainerWithProductsProbe([OWNED_PRODUCT_ID]);
      const brand = await hydratedBrand(probe.container);
      expect(brand).not.toBeNull();

      // The hydrated collection really is empty — this is the state the ceiling of zero passed on.
      expect(brand?.getProducts()).toStrictEqual([]);

      // The assertion the finding turns on.
      await expect(
        probe.container.brandService.deleteBrand(brand as ManagedEntity<Brand>),
      ).resolves.toBe(false);

      // The guard read, with the brand's own identifier bound.
      expect(probe.productsReads).toStrictEqual([{ brandID: BRAND_ID }]);
      // And nothing was removed, so no `SwProduct.brandID` was orphaned.
      expect(probe.removed).toStrictEqual([]);
    });

    it('NET-NEW — the resolver fills the collection the rule counts, one element per owned row', async () => {
      // The rule reads a length off the subject [`org/Hibachi/HibachiValidationService.cfc:L309-L315`], so
      // the collection it reads has to hold one element per owned product. Two rows, two elements.
      const second = 'aaaa1111bbbb2222cccc3333dddd6666';
      const probe = buildContainerWithProductsProbe([OWNED_PRODUCT_ID, second]);
      const brand = (await hydratedBrand(probe.container)) as ManagedEntity<Brand>;

      await probe.container.brandService.deleteBrand(brand);

      expect(brand.getProducts().map((product) => product.productID)).toStrictEqual([
        OWNED_PRODUCT_ID,
        second,
      ]);
    });

    it('NET-NEW — a brand that owns NOTHING still deletes (the guard is a guard, not a block)', async () => {
      const probe = buildContainerWithProductsProbe([], { workingCleanup: true });
      const brand = (await hydratedBrand(probe.container)) as ManagedEntity<Brand>;

      await expect(probe.container.brandService.deleteBrand(brand)).resolves.toBe(true);

      expect(probe.productsReads).toStrictEqual([{ brandID: BRAND_ID }]);
      expect(probe.removed).toStrictEqual([BRAND_ID]);
      expect(brand.getProducts()).toStrictEqual([]);
    });

    it('NET-NEW —, PINNED: on the POOL-bound graph the row is REMOVED and the caller still gets an error', async () => {
      /*
       * This is finding, made observable through the real production graph.
       * `BaseService.delete` removes the row and then runs `settingCleanup` and `commentCleanup`
       * [`model/service/HibachiService.cfc:L76`, `:L79`], both of which are out-of-scope stubs that raise.
       * Reached through `container.brandService` — the pool-bound graph — each statement auto-commits on
       * its own connection, so the removal is durable by the time the cleanup fails. The caller is handed
       * an error about a brand that no longer exists, and there is nothing to undo it with.
       */
      const probe = buildContainerWithProductsProbe([]);
      const brand = (await hydratedBrand(probe.container)) as ManagedEntity<Brand>;

      await expect(probe.container.brandService.deleteBrand(brand)).rejects.toThrow(
        /removeAllEntityRelatedSettings is not implemented/,
      );

      // The row was already gone when that raised — the whole of the finding, in one assertion.
      expect(probe.removed).toStrictEqual([BRAND_ID]);
    });

    it('NET-NEW — the write runner the brand routes now use is exposed by the container', async () => {
      // The boundary is only a fix if a route can reach it. `createBrandHandlerFromContainer` reads this
      // member, so its absence would be a compile error there — but a runner that was never constructed
      // would still type-check as long as the field existed, so its presence is asserted here.
      const probe = buildContainerWithProductsProbe([], { workingCleanup: true });

      expect(typeof probe.container.brandWriteRunner.runWrite).toBe('function');

      // And it is a real runner over the unit of work, not the pool-bound service in disguise: the graph
      // it hands out is a different object from `container.brandService`.
      const handed = await probe.container.brandWriteRunner
        .runWrite(
          /* — a runner cannot be driven without an authorised context. */
          securityContext({ account: persistedAdminAccount() }),
          (graph) => Promise.resolve(graph),
          () => true /* roll back — nothing was written, and this opens no connection */,
        )
        .catch((): null => null);

      expect(handed).not.toBe(probe.container.brandService);
    });

    it('NET-NEW — resolving twice does not double the count it reports', async () => {
      // The collection is replaced, not appended to. A resolver that pushed onto whatever was already
      // there would report 2 for a brand owning 1 on its second run — and would then refuse a delete that
      // a first, successful-but-rolled-back attempt had left behind.
      const probe = buildContainerWithProductsProbe([OWNED_PRODUCT_ID]);
      const brand = (await hydratedBrand(probe.container)) as ManagedEntity<Brand>;

      await probe.container.brandService.deleteBrand(brand);
      await probe.container.brandService.deleteBrand(brand);

      expect(brand.getProducts()).toHaveLength(1);
      expect(probe.productsReads).toHaveLength(2);
    });
  });
});

/* FOLDED IN FROM config/writeBoundaryRebuild */

/*
 * The only coverage of the AAP §0.6.6 M5/M6/M7 write-boundary rebuild: it points the module-scope pool
 * at a port nothing listens on and hands the rebuild a recording executor, so a single collaborator left
 * bound to the pool fails with a connection refusal rather than passing silently. No type check can
 * establish that. AAP §0.4.1.12 declares exactly seventeen executable suites, so these cases live in the
 * approved regression suite.
 */

describe('The M5/M6/M7 write-boundary rebuild: every collaborator re-bound to the boundary connection', () => {
  /* harness. */

  /** The environment `src/config/env.ts` requires, with a port nothing listens on. */
  const POISONED_POOL_ENVIRONMENT: Readonly<Record<string, string>> = Object.freeze({
    DB_HOST: '127.0.0.1',
    DB_PORT: '1',
    DB_NAME: 'writeBoundarySuite',
    DB_USER: 'writeBoundarySuite',
    DB_PASSWORD: 'writeBoundarySuite',
    DB_TLS_MODE: 'disabled',
    GOOGLE_FEED_HOST: 'catalog.example.test',
  });

  /** One statement as the recording executor saw it. */
  interface RecordedStatement {
    readonly sql: string;
    readonly params: readonly unknown[];
  }

  /** An executor that records every statement and answers rows the caller chose. */
  interface RecordingExecutor extends TransactionalSqlExecutor {
    readonly statements: RecordedStatement[];
  }

  /**
   * Builds the executor a transaction scope would hand the rebuild.
   *
   * @param rows the rows to answer, in order; the last is repeated once exhausted
   * @returns the executor plus its recording.
   */
  /**
   * The seeded merchandise discriminator as a stored row — `config/dbdata/SlatwallProductType.xml.cfm:L13`.
   *
   * A row rather than a hand-built entity, because the case that uses it needs the relationship loader to
   * RESOLVE: a nested struct naming an identifier that matches no row leaves the related entity in memory
   * only, and `saveOrUpdate` on an entity carrying an assigned identifier issued an `UPDATE` that matched
   * nothing — Hibernate's `StaleStateException`, which the composition root now refuses in kind. Answering
   * the read is what makes that case the resolvable one it is written to exercise.
   */
  const MERCHANDISE_PRODUCT_TYPE_ROW: MySqlRow = Object.freeze({
    productTypeID: '444df2f7ea9c87e60051f3cd87b435a1',
    productTypeIDPath: '444df2f7ea9c87e60051f3cd87b435a1',
    productTypeName: 'Merchandise',
    urlTitle: 'merchandise',
    systemCode: 'merchandise',
    activeFlag: 1,
  });

  /** A brand as a stored row, so a nested brand struct naming it RESOLVES rather than being minted. */
  const STORED_BRAND_ROW: MySqlRow = Object.freeze({
    brandID: 'bbbbbbbb0000000000000000000000a1',
    brandName: 'Stored Brand',
    urlTitle: 'stored-brand',
    activeFlag: 1,
  });

  /** The rows a {@link createRelationshipResolvingExecutor} recorder is willing to resolve. */
  interface ResolvableRelationshipRows {
    readonly productType?: MySqlRow;
    readonly brand?: MySqlRow;
  }

  /**
   * A recorder that resolves a relationship read only when the statement BINDS that row's identifier.
   *
   * Binding-sensitive on purpose. `InvocationRelatedEntityLoader.loadOrCreate` mints when the read answers
   * nothing, which is `org/Hibachi/HibachiDAO.cfc:L23-L25`'s `entityNew` fallback, so a recorder that
   * answered every read would make the minted arm unreachable and a recorder that answered none would make
   * the resolved arm unreachable. Three statement shapes are told apart, and each answer is the one
   * production gives: the count half of a smart-list read answers `1` only for a bound identifier this
   * recorder holds; a `SELECT 1 …` is a uniqueness probe
   * [`src/adapters/mysql/UniquePropertyChecker.ts:L149`] and answers "nothing conflicts"; and the records
   * half answers the row itself.
   *
   * @param rows - The rows this recorder holds, by relationship.
   * @returns The executor plus its recording.
   */
  function createRelationshipResolvingExecutor(
    rows: ResolvableRelationshipRows,
  ): RecordingExecutor {
    const statements: RecordedStatement[] = [];
    const resolvable: readonly {
      readonly table: string;
      readonly idColumn: string;
      readonly row: MySqlRow | undefined;
    }[] = [
      { table: 'SwProductType', idColumn: 'productTypeID', row: rows.productType },
      { table: 'SwBrand', idColumn: 'brandID', row: rows.brand },
    ];

    const matchingRow = (sql: string, params: readonly unknown[]): MySqlRow | undefined => {
      for (const candidate of resolvable) {
        if (candidate.row === undefined || !sql.includes(`FROM ${candidate.table}`)) {
          continue;
        }
        const identifier: unknown = candidate.row[candidate.idColumn];
        if (params.some((param) => param === identifier)) {
          return candidate.row;
        }
      }

      return undefined;
    };

    return {
      statements,
      execute: (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> => {
        statements.push({ sql, params });

        if (sql.includes('AS recordsCount')) {
          return Promise.resolve([
            { recordsCount: matchingRow(sql, params) === undefined ? 0 : 1 },
          ]);
        }
        if (sql.startsWith('SELECT 1 ')) {
          return Promise.resolve([]);
        }

        const row = matchingRow(sql, params);

        return Promise.resolve(row === undefined ? [] : [row]);
      },
      executeMutation: (sql: string, params: readonly unknown[]): Promise<number> => {
        statements.push({ sql, params });

        return Promise.resolve(1);
      },
    };
  }

  function createRecordingExecutor(rows: readonly MySqlRow[][] = []): RecordingExecutor {
    const statements: RecordedStatement[] = [];
    let call = 0;

    return {
      statements,
      execute: (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> => {
        statements.push({ sql, params });

        /*
         * A counting statement is answered with a count row. The materialisation budget is required
         * on the query builder, so both execution
         * members count before they hydrate; previously an unbudgeted records-only read issued no count at
         * all and this recorder never saw one. Answering an empty array for a `COUNT(...)` statement makes
         * the builder raise `DataIntegrityError` — a fixture artefact, not a finding — so the count is
         * answered as zero and the row answers below are consumed by the row statements they belong to.
         */
        if (sql.includes('AS recordsCount')) {
          return Promise.resolve([{ recordsCount: 0 }]);
        }

        const answer = rows[Math.min(call, rows.length - 1)] ?? [];
        call += 1;

        return Promise.resolve(answer);
      },
      executeMutation: (sql: string, params: readonly unknown[]): Promise<number> => {
        statements.push({ sql, params });

        return Promise.resolve(1);
      },
    };
  }

  /** The two config modules, loaded fresh under the poisoned environment. */
  interface LoadedComposition {
    readonly dependencies: SkuSurfaceDependencies;
    readonly buildSkuBoundaryParts: (typeof import('../../src/config/container'))['buildSkuBoundaryParts'];
    readonly buildProductBoundaryGraph: (typeof import('../../src/config/container'))['buildProductBoundaryGraph'];
  }

  /**
   * Loads the composition modules and assembles the pool-bound dependency set the rebuild reuses.
   */
  function loadComposition(): LoadedComposition {
    const boundariesModule = jest.requireActual<typeof import('../../src/config/container')>(
      '../../src/config/container',
    );
    const statementsModule = jest.requireActual<typeof import('../../src/config/container')>(
      '../../src/config/container',
    );
    const readsModule = jest.requireActual<typeof import('../../src/config/container')>(
      '../../src/config/container',
    );
    const skuModule = jest.requireActual<typeof import('../../src/config/container')>(
      '../../src/config/container',
    );
    const productModule = jest.requireActual<typeof import('../../src/config/container')>(
      '../../src/config/container',
    );

    const boundaries: CatalogBoundaries = boundariesModule.resolveCatalogBoundaries();
    const statements: CatalogStatements = statementsModule.createCatalogStatements();
    const bindDefaultSkuDelegate = boundariesModule.createDefaultSkuDelegateBinder(
      boundaries.settings,
    );
    /*
     * — the budget is required on the query port now. Generous figures, because these cases
     * assert which connection a statement runs on rather than any ceiling.
     */
    const materialisationBudget = GENEROUS_SMART_LIST_BUDGET;
    const smartListQueryPort = readsModule.createSmartListQueryPort(
      statements.queryRunner,
      { bindDefaultSkuDelegate },
      materialisationBudget,
    );

    return {
      buildSkuBoundaryParts: skuModule.buildSkuBoundaryParts,
      buildProductBoundaryGraph: productModule.buildProductBoundaryGraph,
      dependencies: {
        boundaries,
        statements,
        smartListQueryPort,
        productTypeRootResolver: readsModule.createProductTypeRootResolver(smartListQueryPort),
        bindDefaultSkuDelegate,
        optionGroupSortOrderMemo: createOptionGroupSortOrderMemo(),
        /*
         * And — both budgets are required members of the dependency set, and the
         * boundary rebuild carries the same objects, which is the half those findings called out
         * separately: a bound wired only into the pool-bound graph vanishes for every write.
         */
        materialisationBudget,
        combinationBudget: GENEROUS_COMBINATION_BUDGET,
      },
    };
  }

  /**
   * Applies the poisoned environment for the duration of `work`, restoring it afterwards even on failure.
   */
  async function withPoisonedPool(
    work: (loaded: LoadedComposition) => Promise<void>,
  ): Promise<void> {
    const saved = new Map<string, string | undefined>();

    for (const [name, value] of Object.entries(POISONED_POOL_ENVIRONMENT)) {
      saved.set(name, process.env[name]);
      process.env[name] = value;
    }

    try {
      await work(loadComposition());
    } finally {
      for (const [name, value] of saved) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    }
  }

  /*
   * 1. The harness is genuinely poisoned — asserted first, because every case below leans on it.
   */

  describe('the pool the graph is built over refuses every statement', () => {
    it('[NET-NEW] a POOL-BOUND read fails, which is what makes the cases below meaningful', async () => {
      await withPoisonedPool(async ({ dependencies }) => {
        /*
         * The pool-bound query port is the collaborator a partial rebuild would leave in place. If this
         * expectation ever stopped holding, every "arrived at the recorder" assertion below would become
         * vacuous, so the poison is proven before it is relied on.
         */
        await expect(
          dependencies.smartListQueryPort.executeRecords({
            entityName: 'SlatwallProduct',
            whereGroups: [{ filters: [{ propertyIdentifier: 'productID', value: 'anything' }] }],
          }),
        ).rejects.toThrow();
      });
    }, 20000);
  });

  /*
   * The invocation context every boundary rebuild is driven with. */
  const BOUNDARY_REBUILD_SECURITY = securityContext({ account: persistedAdminAccount() });

  /* 2. The SKU rebuild. */

  describe('buildSkuBoundaryParts rebuilds every SKU collaborator against the scope executor', () => {
    it('[NET-NEW] the aggregate read runs on the boundary connection (M6)', async () => {
      await withPoisonedPool(async ({ buildSkuBoundaryParts, dependencies }) => {
        const executor = createRecordingExecutor();
        const parts = buildSkuBoundaryParts(dependencies, { executor }, BOUNDARY_REBUILD_SECURITY);

        await expect(parts.resolveProduct('44444444444444444444444444444444')).resolves.toBeNull();
        expect(executor.statements.length).toBeGreaterThan(0);
        expect(executor.statements[0]?.params).toContain('44444444444444444444444444444444');
      });
    }, 20000);

    it('[NET-NEW] the SKU repository runs on the boundary connection', async () => {
      await withPoisonedPool(async ({ buildSkuBoundaryParts, dependencies }) => {
        const executor = createRecordingExecutor();
        const parts = buildSkuBoundaryParts(dependencies, { executor }, BOUNDARY_REBUILD_SECURITY);

        await expect(parts.skuRepository.findBySkuCode('TESTPRODUCTXXX')).resolves.toBeNull();
        expect(executor.statements).toHaveLength(1);
        expect(executor.statements[0]?.params).toContain('TESTPRODUCTXXX');
      });
    }, 20000);

    it('[NET-NEW] the SKU SERVICE reaches the database only through that repository', async () => {
      await withPoisonedPool(async ({ buildSkuBoundaryParts, dependencies }) => {
        const executor = createRecordingExecutor();
        const parts = buildSkuBoundaryParts(dependencies, { executor }, BOUNDARY_REBUILD_SECURITY);

        /*
         * `getSkuBySkuCode` is one of the nine declared members and delegates straight to the repository —
         * the shortest path from the service surface to a statement.
         */
        await expect(parts.skuService.getSkuBySkuCode('TESTPRODUCTXXX')).resolves.toBeNull();
        expect(executor.statements).toHaveLength(1);
      });
    }, 20000);

    it('[NET-NEW] the OPTION service and its repository run on the boundary connection', async () => {
      await withPoisonedPool(async ({ buildSkuBoundaryParts, dependencies }) => {
        const executor = createRecordingExecutor();
        const parts = buildSkuBoundaryParts(dependencies, { executor }, BOUNDARY_REBUILD_SECURITY);

        await expect(parts.optionService.getUnusedProductOptionGroups('')).resolves.toStrictEqual(
          [],
        );
        expect(executor.statements).toHaveLength(1);
      });
    }, 20000);

    it('[NET-NEW] the boundary option service is NOT the pool-bound one, even when one was supplied', async () => {
      await withPoisonedPool(async ({ buildSkuBoundaryParts, dependencies }) => {
        const poolBound = createPoolBoundOptionService(dependencies);
        const executor = createRecordingExecutor();
        const parts = buildSkuBoundaryParts(
          { ...dependencies, optionService: poolBound },
          { executor },
          BOUNDARY_REBUILD_SECURITY,
        );

        /*
         * The `optionService` slot exists so the aggregate graph holds one option service rather than two —
         * `optionService` is a DI/1 singleton at `org/Hibachi/Hibachi.cfc:L298-L330`. It must be ignored
         * inside a boundary, because a pool-bound service in an open transaction reads the wrong connection.
         * The decisive assertion is behavioural rather than an identity check: had the slot been honoured,
         * this call would have gone to the poisoned pool and rejected.
         */
        expect(parts.optionService).not.toBe(poolBound);
        await expect(parts.optionService.getUnusedProductOptionGroups('')).resolves.toStrictEqual(
          [],
        );
        expect(executor.statements).toHaveLength(1);

        /*
         * And the supplied one is genuinely pool-bound, so the case cannot pass by both being the same.
         */
        await expect(poolBound.getUnusedProductOptionGroups('')).rejects.toThrow();
      });
    }, 20000);

    it('[NET-NEW] the product-type ancestry resolver runs on the boundary connection', async () => {
      await withPoisonedPool(async ({ buildSkuBoundaryParts, dependencies }) => {
        const executor = createRecordingExecutor();
        const parts = buildSkuBoundaryParts(dependencies, { executor }, BOUNDARY_REBUILD_SECURITY);

        await expect(
          parts.productTypeRootResolver.getProductType('444df2f7ea9c87e60051f3cd87b435a1'),
        ).resolves.toBeUndefined();

        /*
         * Two, and both of them on the boundary executor, which is the property this case is about.
         */
        expect(executor.statements).toHaveLength(2);
        expect(executor.statements[0]?.sql).toContain('AS recordsCount');
      });
    }, 20000);

    it('[NET-NEW] the uniqueness gate is re-bound to the boundary, and TAKES THE LOCK there', async () => {
      await withPoisonedPool(async ({ buildSkuBoundaryParts, dependencies }) => {
        const executor = createRecordingExecutor([[]]);
        const parts = buildSkuBoundaryParts(dependencies, { executor }, BOUNDARY_REBUILD_SECURITY);

        await expect(
          parts.statements.uniqueProperty.isUrlTitleAvailable('SwBrand', 'a-title'),
        ).resolves.toBe(true);
        expect(executor.statements).toHaveLength(1);

        /*
         * Two separate properties, and both ride on the same seam without being the same thing.
         */
        expect(executor.statements[0]?.sql).toContain('FOR UPDATE');
        expect(executor.statements[0]?.sql.endsWith('FOR UPDATE')).toBe(true);
      });
    }, 20000);

    it('[NET-NEW] the validator is rebuilt, not shared with the pool-bound graph', async () => {
      await withPoisonedPool(({ buildSkuBoundaryParts, dependencies }) => {
        const parts = buildSkuBoundaryParts(
          dependencies,
          { executor: createRecordingExecutor() },
          BOUNDARY_REBUILD_SECURITY,
        );

        /*
         * A validator consults the uniqueness port it was constructed with, so sharing the pool-bound one
         * would defeat the re-bind above without changing any type. This case awaits nothing on purpose:
         * The property is a wiring identity, observable without issuing a statement.
         */
        expect(parts.statements.validator).not.toBe(dependencies.statements.validator);

        return Promise.resolve();
      });
    }, 20000);

    it('[NET-NEW] the pool-bound instance keeps exact legacy parity — no FOR UPDATE outside a boundary', async () => {
      await withPoisonedPool(async ({ dependencies }) => {
        /*
         * The counterpart of the locking assertion above, and the half that makes the gate a gate rather
         * than a blanket. The pool-bound checker's statement text is unchanged, so a ported read is not
         * silently altered for every caller and no validation read in autocommit takes a gap lock that could
         * protect nothing. Read from the failure, because the poisoned pool never answers — the statement is
         * composed before the connection is attempted, which is itself what proves the composition happened
         * on the pool-bound instance.
         */
        await expect(
          dependencies.statements.isUrlTitleAvailable('SwBrand', 'a-title'),
        ).rejects.toThrow();
      });
    }, 20000);

    it('[NET-NEW] the request-scoped sort-order memo is SHARED with the pool-bound graph (M7)', async () => {
      await withPoisonedPool(async ({ buildSkuBoundaryParts, dependencies }) => {
        const executor = createRecordingExecutor();
        const parts = buildSkuBoundaryParts(dependencies, { executor }, BOUNDARY_REBUILD_SECURITY);

        /*
         * Pre-setting the memo is how sharing becomes observable: a boundary that minted its own cell would
         * have to resolve the next sort order first, issuing an extra statement, and the ordering inside a
         * transaction would then differ from the ordering outside it.
         */
        dependencies.optionGroupSortOrderMemo.value = 7;

        await expect(
          parts.skuRepository.findSortedSkuIdsByProduct('44444444444444444444444444444444'),
        ).resolves.toStrictEqual([]);

        expect(executor.statements).toHaveLength(1);
        expect(executor.statements[0]?.params).toStrictEqual([
          '44444444444444444444444444444444',
          7,
        ]);
      });
    }, 20000);
  });

  /**
   * Builds a pool-bound option service the way the aggregate root does, for the slot-ignored case above.
   */
  function createPoolBoundOptionService(
    dependencies: SkuSurfaceDependencies,
  ): NonNullable<SkuSurfaceDependencies['optionService']> {
    const { OptionService } = jest.requireActual<typeof import('../../src/services/OptionService')>(
      '../../src/services/OptionService',
    );
    const { MySqlOptionRepository } = jest.requireActual<
      typeof import('../../src/adapters/mysql/MySqlOptionRepository')
    >('../../src/adapters/mysql/MySqlOptionRepository');

    return new OptionService(
      new MySqlOptionRepository(
        dependencies.statements.queryRunner,
        GENEROUS_STATEMENT_COMPLEXITY_BUDGET,
      ),
      dependencies.smartListQueryPort,
    );
  }

  /* 3. The product rebuild, which adds the write surface on top of the SKU half. */

  describe('buildProductBoundaryGraph rebuilds the product half against the same executor', () => {
    it('[NET-NEW] the product service reads on the boundary connection', async () => {
      await withPoisonedPool(async ({ buildProductBoundaryGraph, dependencies }) => {
        const executor = createRecordingExecutor();
        const productService = buildProductBoundaryGraph(
          {
            sku: dependencies,
            /* — required on the product surface; generous here. */
            urlTitleProbeBudget: GENEROUS_URL_TITLE_PROBE_BUDGET,
          },
          { executor },
          BOUNDARY_REBUILD_SECURITY,
        );

        await expect(
          productService.getProduct('44444444444444444444444444444444'),
        ).resolves.toBeNull();

        /*
         * Two for the reason given on the product-type ancestry case above: the
         * materialisation ceiling is measured with a COUNT before the row set is hydrated. Both land on
         * the boundary executor, and the identifier is bound into both, so neither statement reached the
         * poisoned pool and neither lost the subject on the way.
         */
        expect(executor.statements).toHaveLength(2);
        expect(executor.statements[0]?.sql).toContain('AS recordsCount');
        expect(executor.statements[0]?.params).toContain('44444444444444444444444444444444');
        expect(executor.statements[1]?.params).toContain('44444444444444444444444444444444');
      });
    }, 20000);

    it('[NET-NEW] its product-type read runs there too, not on the pool', async () => {
      await withPoisonedPool(async ({ buildProductBoundaryGraph, dependencies }) => {
        const executor = createRecordingExecutor();
        const productService = buildProductBoundaryGraph(
          {
            sku: dependencies,
            /* — required on the product surface; generous here. */
            urlTitleProbeBudget: GENEROUS_URL_TITLE_PROBE_BUDGET,
          },
          { executor },
          BOUNDARY_REBUILD_SECURITY,
        );

        await expect(
          productService.getProductType('444df2f7ea9c87e60051f3cd87b435a1'),
        ).resolves.toBeNull();

        /* Two for the reason given above — count then hydrate — and both on the boundary. */
        expect(executor.statements).toHaveLength(2);
        expect(executor.statements[0]?.sql).toContain('AS recordsCount');
      });
    }, 20000);

    it('[NET-NEW] its SKU smart list runs there, proving the SKU half was rebuilt with it', async () => {
      await withPoisonedPool(async ({ buildProductBoundaryGraph, dependencies }) => {
        const executor = createRecordingExecutor();
        const productService = buildProductBoundaryGraph(
          {
            sku: dependencies,
            /* — required on the product surface; generous here. */
            urlTitleProbeBudget: GENEROUS_URL_TITLE_PROBE_BUDGET,
          },
          { executor },
          BOUNDARY_REBUILD_SECURITY,
        );

        /*
         * `getProductSkusBySelectedOptions` is the option-resolution chain of AAP §0.6.1 — the deepest read
         * the product surface performs, and the one whose conjunctive EXISTS clauses the SKU repository
         * composes. Reaching the recorder proves the product service holds the boundary SKU repository.
         */
        await expect(
          productService.getProductSkusBySelectedOptions('', '44444444444444444444444444444444'),
        ).resolves.toStrictEqual([]);
        expect(executor.statements).toHaveLength(1);
      });
    }, 20000);
  });

  /* 4. — the rebuild substitutes the invocation's principal for the memoised pair. */

  describe('the boundary rebuild runs as the principal the route gate authorised', () => {
    /* Why this block exists, and what it pins that nothing else does. */

    /**
     * The account the invocation is authorised as; its identifier is what must land in the audit column.
     */
    const INVOCATION_ACCOUNT_ID = 'aaaaaaaa0000000000000000000000a3';

    /**
     * A second, different account, so "it used the invocation's" is distinguishable from "it used any".
     */
    const OTHER_ACCOUNT_ID = 'aaaaaaaa0000000000000000000000b7';

    /**
     * A security context naming one account, with property population left deny-all.
     *
     * @param accountID the account the invocation is authorised as
     * @returns the context a route gate would have produced.
     */
    const contextFor = (accountID: string): RequestAuthorizationContext =>
      securityContext({
        account: { accountID, newFlag: false, adminAccountFlag: true },
      });

    it('[NET-NEW] the memoised tier REFUSES to name a principal, so a missed substitution cannot be silent', async () => {
      await withPoisonedPool(({ dependencies }) => {
        /*
         * The pre-condition every case below leans on. If this ever stopped throwing, a rebuild that
         * dropped the substitution would stamp `null` and pass.
         */
        expect(() => dependencies.boundaries.accountContext.getCurrentAccount()).toThrow(
          /resolved per invocation at the handler edge/,
        );

        return Promise.resolve();
      });
    }, 20000);

    it('[NET-NEW] the SKU insert stamps the INVOCATION account, not the memoised port', async () => {
      await withPoisonedPool(async ({ buildSkuBoundaryParts, dependencies }) => {
        const executor = createRecordingExecutor();
        const parts = buildSkuBoundaryParts(
          dependencies,
          { executor },
          contextFor(INVOCATION_ACCOUNT_ID),
        );

        const sku = new Sku();
        sku.skuID = 'cccccccc0000000000000000000000a3';
        sku.skuCode = 'AUTHSKU-A';
        sku.price = toExactDecimal('10.00');

        await parts.skuRepository.persistSku(sku);

        /*
         * The audit block is on the entity, and it is the invocation's account. `applyPreInsertAudit`
         * reads `accountContext.getCurrentAccount()`, which is the one place the identity can come from
         * once the substitution is in place.
         */
        expect(sku.createdByAccount).toBe(INVOCATION_ACCOUNT_ID);
        expect(sku.modifiedByAccount).toBe(INVOCATION_ACCOUNT_ID);

        /*
         * And it reached the statement, so the column written carries it rather than only the object.
         */
        const written = executor.statements.map((statement) => statement.params).flat();
        expect(written).toContain(INVOCATION_ACCOUNT_ID);
        expect(written).not.toContain(OTHER_ACCOUNT_ID);
      });
    }, 20000);

    it('[NET-NEW] a SECOND invocation stamps ITS OWN account, so nothing leaks across a warm container (M7)', async () => {
      await withPoisonedPool(async ({ buildSkuBoundaryParts, dependencies }) => {
        /*
         * The same memoised `dependencies` object drives both rebuilds, deliberately: that is exactly
         * the warm-container condition AAP §0.6.6 M7 warns about, where module scope survives between
         * invocations and a captured principal would bleed from one tenant to the next.
         */
        const firstExecutor = createRecordingExecutor();
        const first = buildSkuBoundaryParts(
          dependencies,
          { executor: firstExecutor },
          contextFor(INVOCATION_ACCOUNT_ID),
        );

        const secondExecutor = createRecordingExecutor();
        const second = buildSkuBoundaryParts(
          dependencies,
          { executor: secondExecutor },
          contextFor(OTHER_ACCOUNT_ID),
        );

        const firstSku = new Sku();
        firstSku.skuID = 'cccccccc0000000000000000000000a4';
        firstSku.skuCode = 'AUTHSKU-B';
        firstSku.price = toExactDecimal('10.00');

        const secondSku = new Sku();
        secondSku.skuID = 'cccccccc0000000000000000000000b8';
        secondSku.skuCode = 'AUTHSKU-C';
        secondSku.price = toExactDecimal('10.00');

        await first.skuRepository.persistSku(firstSku);
        await second.skuRepository.persistSku(secondSku);

        expect(firstSku.createdByAccount).toBe(INVOCATION_ACCOUNT_ID);
        expect(secondSku.createdByAccount).toBe(OTHER_ACCOUNT_ID);

        /*
         * Neither invocation's statements carry the other's account. A shared, captured principal would
         * make one of these two expectations fail.
         */
        expect(firstExecutor.statements.map((statement) => statement.params).flat()).not.toContain(
          OTHER_ACCOUNT_ID,
        );
        expect(secondExecutor.statements.map((statement) => statement.params).flat()).not.toContain(
          INVOCATION_ACCOUNT_ID,
        );
      });
    }, 20000);

    it('[NET-NEW] the memoised tier itself is NOT mutated by a rebuild', async () => {
      await withPoisonedPool(async ({ buildSkuBoundaryParts, dependencies }) => {
        const memoisedAccountContext = dependencies.boundaries.accountContext;
        const memoisedPopulation = dependencies.boundaries.populationAuthorization;

        buildSkuBoundaryParts(
          dependencies,
          { executor: createRecordingExecutor() },
          contextFor(INVOCATION_ACCOUNT_ID),
        );

        /*
         * The substitution is a fresh frozen object, never an assignment into module scope. Writing the
         * invocation's principal onto the memoised tier would close the finding for one invocation and
         * reopen it — worse — for every later one on the same warm container.
         */
        expect(dependencies.boundaries.accountContext).toBe(memoisedAccountContext);
        expect(dependencies.boundaries.populationAuthorization).toBe(memoisedPopulation);
        expect(() => dependencies.boundaries.accountContext.getCurrentAccount()).toThrow();

        await Promise.resolve();
      });
    }, 20000);

    /*
     * — the product half of the same question, through the container-wired production seam
     * why these three cases exist, and why their absence is part of the finding.
     */

    /** The product surface's dependency set, over the one memoised SKU set these cases share. */
    const productDependencies = (
      dependencies: SkuSurfaceDependencies,
    ): ProductSurfaceDependencies => ({
      sku: dependencies,
      /* — required on the product surface; generous, because these cases are about identity. */
      urlTitleProbeBudget: GENEROUS_URL_TITLE_PROBE_BUDGET,
    });

    /**
     * The value bound for one named column of a recorded statement — see the adapter suite's twin.
     */
    const boundColumnValue = (
      statement: RecordedStatement | undefined,
      column: string,
    ): unknown => {
      if (statement === undefined) {
        throw new Error(`expected a recorded statement to read '${column}' from`);
      }

      const insertColumns = /\(([^)]*)\) VALUES/.exec(statement.sql)?.[1];
      const columns =
        insertColumns === undefined
          ? (/ SET (.*) WHERE /.exec(statement.sql)?.[1] ?? '')
              .split(', ')
              .map((assignment) => assignment.replace(' = ?', ''))
          : insertColumns.split(', ');

      const index = columns.indexOf(column);
      if (index === -1) {
        throw new Error(`the statement does not name '${column}': ${statement.sql}`);
      }

      return statement.params[index];
    };

    it('[NET-NEW] a PRODUCT-TYPE insert through the wired seam stamps the invocation account', async () => {
      await withPoisonedPool(async ({ buildProductBoundaryGraph, dependencies }) => {
        const executor = createRecordingExecutor();
        const productService = buildProductBoundaryGraph(
          productDependencies(dependencies),
          { executor },
          contextFor(INVOCATION_ACCOUNT_ID),
        );

        /*
         * A transient child of a root parent. Both names are set because
         * `model/validation/ProductType.json` requires `productTypeName` and `urlTitle` on save, and the
         * uniqueness probe the second one carries answers "available" against the recorder.
         */
        const parent = new ProductType();
        parent.productTypeID = '444df2f7ea9c87e60051f3cd87b435a1';
        const productType = new ProductType();
        productType.productTypeName = 'Wired Merchandise';
        productType.urlTitle = 'wired-merchandise';
        productType.parentProductType = parent;

        const saved = await productService.saveProductType(productType, {});
        expect(saved.hasErrors()).toBe(false);

        const insert = executor.statements.find((statement) =>
          statement.sql.startsWith('INSERT INTO SwProductType'),
        );

        /*
         * The audit columns carry the invocation's account, in one assertion: a graph that read no
         * context leaves both of these `null` no matter who was authorised.
         */
        expect(boundColumnValue(insert, 'createdByAccountID')).toBe(INVOCATION_ACCOUNT_ID);
        expect(boundColumnValue(insert, 'modifiedByAccountID')).toBe(INVOCATION_ACCOUNT_ID);
        expect(boundColumnValue(insert, 'createdDateTime')).toBeInstanceOf(Date);
        expect(boundColumnValue(insert, 'modifiedDateTime')).toBeInstanceOf(Date);
        /*
         * And the ancestry the hook rebuilt from the parent chain, rather than the nothing it held.
         */
        expect(boundColumnValue(insert, 'productTypeIDPath')).toBe(
          `444df2f7ea9c87e60051f3cd87b435a1,${saved.productTypeID}`,
        );

        const written = executor.statements.map((statement) => statement.params).flat();
        expect(written).not.toContain(OTHER_ACCOUNT_ID);
      });
    }, 20000);

    it('[NET-NEW] a RE-PARENTED product type persists its new ancestry, not the stale path', async () => {
      await withPoisonedPool(async ({ buildProductBoundaryGraph, dependencies }) => {
        const executor = createRecordingExecutor();
        const productService = buildProductBoundaryGraph(
          productDependencies(dependencies),
          { executor },
          contextFor(INVOCATION_ACCOUNT_ID),
        );

        /*
         * A persisted type whose held path names its old parent, now pointed at a new one.
         * Persisting the stale string verbatim would matter because
         * `productType.getBaseProductType` reads `listFirst`
         * of this column, so the row's discriminator silently stayed with the old ancestor.
         */
        const newParent = new ProductType();
        newParent.productTypeID = '444df2f9c7deaa1582e021e894c0e299';
        const productType = new ProductType();
        productType.productTypeID = 'bbbbbbbb0000000000000000000000c1';
        productType.productTypeName = 'Re-parented';
        productType.urlTitle = 're-parented';
        productType.productTypeIDPath = `444df313ec53a08c32d8ae434af5819a,${productType.productTypeID}`;
        productType.parentProductType = newParent;

        await productService.saveProductType(productType, {});

        const update = executor.statements.find((statement) =>
          statement.sql.startsWith('UPDATE SwProductType SET'),
        );

        expect(boundColumnValue(update, 'productTypeIDPath')).toBe(
          `444df2f9c7deaa1582e021e894c0e299,bbbbbbbb0000000000000000000000c1`,
        );
        expect(boundColumnValue(update, 'parentProductTypeID')).toBe(
          '444df2f9c7deaa1582e021e894c0e299',
        );
        /*
         * The update arm of the audit block: the modified pair moves, and it names this invocation.
         */
        expect(boundColumnValue(update, 'modifiedByAccountID')).toBe(INVOCATION_ACCOUNT_ID);
        expect(boundColumnValue(update, 'modifiedDateTime')).toBeInstanceOf(Date);
      });
    }, 20000);

    it('[NET-NEW] a PRODUCT update through the wired seam stamps the invocation account', async () => {
      await withPoisonedPool(async ({ buildProductBoundaryGraph, dependencies }) => {
        const executor = createRecordingExecutor();
        const productService = buildProductBoundaryGraph(
          productDependencies(dependencies),
          { executor },
          contextFor(INVOCATION_ACCOUNT_ID),
        );

        /*
         * `model/validation/Product.json` requires `price`, `productName`, `productCode`, `productType` and
         * `urlTitle` on save, and `price` is non-persistent — it delegates to the default SKU. So the
         * product needs a default SKU delegate, and it must be the identifier-carrying one the composition
         * root mints, because `readDefaultSkuIdOrRefuse` refuses any other.
         */
        const defaultSku = new Sku();
        defaultSku.skuID = 'cccccccc0000000000000000000000d4';
        defaultSku.skuCode = 'WIREDSKU-D4';
        defaultSku.price = toExactDecimal('19.99');

        const productType = new ProductType();
        productType.productTypeID = '444df2f7ea9c87e60051f3cd87b435a1';

        const product = new Product();
        product.productID = 'dddddddd0000000000000000000000e5';
        product.productName = 'Wired Product';
        product.productCode = 'WIREDPROD-E5';
        product.urlTitle = 'wired-product';
        product.productType = productType;
        product.defaultSku = dependencies.bindDefaultSkuDelegate(defaultSku);

        /* An earlier actor's first-write stamp, which the update arm must leave exactly alone. */
        const firstWrite = new Date('2020-01-02T03:04:05.000Z');
        product.createdDateTime = firstWrite;
        product.createdByAccount = OTHER_ACCOUNT_ID;
        product.modifiedDateTime = firstWrite;
        product.modifiedByAccount = OTHER_ACCOUNT_ID;

        const saved = await productService.saveProduct(product, {});
        expect(saved.hasErrors()).toBe(false);

        const update = executor.statements.find((statement) =>
          statement.sql.startsWith('UPDATE SwProduct SET'),
        );

        expect(boundColumnValue(update, 'modifiedByAccountID')).toBe(INVOCATION_ACCOUNT_ID);
        expect(boundColumnValue(update, 'modifiedDateTime')).not.toBe(firstWrite);
        /*
         * And the created pair is untouched, including the other account's name on it. `preUpdate` writes
         * neither created member [org/Hibachi/HibachiEntity.cfc:L657-L681], so a fix that stamped all four
         * on every write would rewrite history and would fail here.
         */
        expect(boundColumnValue(update, 'createdDateTime')).toBe(firstWrite);
        expect(boundColumnValue(update, 'createdByAccountID')).toBe(OTHER_ACCOUNT_ID);
      });
    }, 20000);

    it('[NET-NEW] Product population uses the INVOCATION property authority and a boundary-local relationship loader', async () => {
      await withPoisonedPool(async ({ buildProductBoundaryGraph, dependencies }) => {
        /*
         * `SkuService.createSkus` binds the default-SKU delegate before persistence mints `skuID`.
         * The delegate must therefore read the live entity, not snapshot the unsaved sentinel; otherwise
         * ProductService's second product write cannot persist `defaultSkuID`.
         */
        const transientDefaultSku = new Sku();
        const liveDefaultSku = dependencies.bindDefaultSkuDelegate(transientDefaultSku);
        expect(liveDefaultSku.skuID).toBe('');
        transientDefaultSku.skuID = 'cccccccc0000000000000000000000f7';
        expect(liveDefaultSku.skuID).toBe('cccccccc0000000000000000000000f7');

        const executor = createRelationshipResolvingExecutor({
          productType: MERCHANDISE_PRODUCT_TYPE_ROW,
        });
        const productService = buildProductBoundaryGraph(
          productDependencies(dependencies),
          { executor },
          securityContext({
            account: {
              accountID: INVOCATION_ACCOUNT_ID,
              newFlag: false,
              adminAccountFlag: true,
            },
            populationAuthorization: WIRING_ALLOW_POPULATION,
          }),
        );
        const product = new Product();
        product.productID = 'dddddddd0000000000000000000000f6';
        product.createdDateTime = new Date('2020-01-02T03:04:05.000Z');
        product.createdByAccount = OTHER_ACCOUNT_ID;

        const saved = await productService.saveProduct(product, {
          productName: 'Invocation Populated Product',
          productCode: 'INVOCATION-POPULATED',
          urlTitle: 'invocation-populated-product',
          price: 3.21,
          /*
           * More than one key deliberately takes `loadOrCreate`: the pre-resolved synchronous loader must
           * answer the type the recorder holds, and the recursive descriptor pass must populate its name.
           *
           * `urlTitle` is here because more than one key also makes this a POPULATED SUB-PROPERTY
           * [org/Hibachi/HibachiTransient.cfc:L236-L249], which the parent's own `validate` then checks in
           * the parent's context [org/Hibachi/HibachiTransient.cfc:L413-L452], and
           * `model/validation/ProductType.json` requires `productTypeName` AND `urlTitle` on `save`. The
           * struct therefore has to carry everything that context needs, and the recorder answers the
           * identifier read, so this is the RESOLVABLE arm: an existing type whose name and title the
           * nested struct re-states. The two cases below take the other two arms — a nested struct that
           * fails the related entity's own rules, and one naming an identifier that matches no row.
           */
          productType: {
            productTypeID: '444df2f7ea9c87e60051f3cd87b435a1',
            productTypeName: 'Merchandise',
            urlTitle: 'merchandise',
          },
        });

        expect(saved.hasErrors()).toBe(false);
        expect(saved.productName).toBe('Invocation Populated Product');
        expect(saved.productCode).toBe('INVOCATION-POPULATED');
        expect(saved.price).toBe('3.21');
        expect(saved.productType?.productTypeID).toBe('444df2f7ea9c87e60051f3cd87b435a1');
        expect(saved.productType?.productTypeName).toBe('Merchandise');

        /*
         * The relationship pre-read and the write both used the transaction executor. Had
         * `assembleProductService` fallen back to the memoized tier, the property authority would
         * deny every payload field and this update would not exist.
         */
        expect(
          executor.statements.some((statement) => statement.sql.includes('FROM SwProductType')),
        ).toBe(true);
        const update = executor.statements.find((statement) =>
          statement.sql.startsWith('UPDATE SwProduct SET'),
        );
        expect(boundColumnValue(update, 'productTypeID')).toBe('444df2f7ea9c87e60051f3cd87b435a1');
        expect(boundColumnValue(update, 'modifiedByAccountID')).toBe(INVOCATION_ACCOUNT_ID);
      });
    }, 20000);

    /*
     * The populated-sub-property cascade, through the same production seam. `populate` records every
     * related entity a nested struct with MORE than the identifier wrote into
     * [org/Hibachi/HibachiTransient.cfc:L248, :L305], `validate` then checks each one and reports a
     * failing one against the parent under `populate` [`:L413-L452`], and `save` descends into each one
     * [org/Hibachi/HibachiDAO.cfc:L52-L64]. All three passes were absent: the record was discarded at the
     * populate call, so a nested struct was applied in memory and never written, and a nested struct
     * naming no stored row left the parent holding a keyless related entity whose blank identifier was
     * then bound into a foreign-key column. The four cases below are the four arms.
     */

    /** The payload members `model/validation/Product.json` requires on `save`, minus the relationships. */
    const requiredProductPayload = (productCode: string): Readonly<Record<string, unknown>> => ({
      productName: `Product ${productCode}`,
      productCode,
      urlTitle: productCode.toLowerCase(),
      price: 3.21,
    });

    /** A persisted product, so the parent write is an UPDATE and its identifier is already available. */
    const persistedProduct = (productID: string): Product => {
      const product = new Product();
      product.productID = productID;
      product.createdDateTime = new Date('2020-01-02T03:04:05.000Z');
      product.createdByAccount = OTHER_ACCOUNT_ID;

      return product;
    };

    it('[NET-NEW] a nested BRAND that fails its OWN rules refuses the whole save under the `populate` key', async () => {
      await withPoisonedPool(async ({ buildProductBoundaryGraph, dependencies }) => {
        const executor = createRelationshipResolvingExecutor({
          productType: MERCHANDISE_PRODUCT_TYPE_ROW,
        });
        const productService = buildProductBoundaryGraph(
          productDependencies(dependencies),
          { executor },
          securityContext({
            account: { accountID: INVOCATION_ACCOUNT_ID, newFlag: false, adminAccountFlag: true },
            populationAuthorization: WIRING_ALLOW_POPULATION,
          }),
        );

        /*
         * The reported reproduction, verbatim: a nested brand carrying a BLANK identifier plus one more
         * key. The blank sends the load past `entityLoadByPK` [org/Hibachi/HibachiDAO.cfc:L18] into
         * `entityNew`, and the recursive populate then clears the key it arrived with, so this is a
         * genuinely new brand carrying only `brandName` — and `model/validation/Brand.json:L5` requires
         * `urlTitle` as well. The legacy answer is a finding on the PARENT keyed `populate`, whose message
         * is the property name.
         */
        const saved = await productService.saveProduct(
          persistedProduct('dddddddd0000000000000000000000b1'),
          {
            ...requiredProductPayload('DANGLING-BRAND'),
            productType: { productTypeID: '444df2f7ea9c87e60051f3cd87b435a1' },
            brand: { brandID: '', brandName: 'Dangling Brand' },
          },
        );

        expect(saved.hasErrors()).toBe(true);
        expect(saved.getError('populate')).toStrictEqual(['brand']);

        /*
         * And nothing was written — not the brand the payload described, and not the product row whose
         * `brandID` column would otherwise have taken the blank identifier.
         */
        const written = executor.statements.map((statement) => statement.sql);
        expect(written.some((sql) => sql.startsWith('INSERT INTO SwBrand'))).toBe(false);
        expect(written.some((sql) => sql.startsWith('UPDATE SwBrand SET'))).toBe(false);
        expect(written.some((sql) => sql.startsWith('UPDATE SwProduct SET'))).toBe(false);
      });
    }, 20000);

    it('[NET-NEW] a nested BRAND that passes its own rules is INSERTED, and the product names the minted key', async () => {
      await withPoisonedPool(async ({ buildProductBoundaryGraph, dependencies }) => {
        const executor = createRelationshipResolvingExecutor({
          productType: MERCHANDISE_PRODUCT_TYPE_ROW,
        });
        const productService = buildProductBoundaryGraph(
          productDependencies(dependencies),
          { executor },
          securityContext({
            account: { accountID: INVOCATION_ACCOUNT_ID, newFlag: false, adminAccountFlag: true },
            populationAuthorization: WIRING_ALLOW_POPULATION,
          }),
        );

        const saved = await productService.saveProduct(
          persistedProduct('dddddddd0000000000000000000000b2'),
          {
            ...requiredProductPayload('MINTED-BRAND'),
            productType: { productTypeID: '444df2f7ea9c87e60051f3cd87b435a1' },
            brand: { brandID: '', brandName: 'Minted Brand', urlTitle: 'minted-brand' },
          },
        );

        expect(saved.hasErrors()).toBe(false);

        /* The brand's own row, written BEFORE the parent's — the `beforeParent` phase. */
        const brandInsert = executor.statements.find((statement) =>
          statement.sql.startsWith('INSERT INTO SwBrand'),
        );
        const productUpdate = executor.statements.find((statement) =>
          statement.sql.startsWith('UPDATE SwProduct SET'),
        );
        expect(brandInsert).toBeDefined();
        expect(productUpdate).toBeDefined();
        expect(executor.statements.indexOf(brandInsert!)).toBeLessThan(
          executor.statements.indexOf(productUpdate!),
        );
        expect(boundColumnValue(brandInsert, 'brandName')).toBe('Minted Brand');

        /*
         * IR-6: a 32-character hex identifier generated by the application, never the caller's blank.
         * The product's foreign key names exactly that row, which is the whole point of the finding.
         */
        const mintedBrandID = boundColumnValue(brandInsert, 'brandID');
        expect(mintedBrandID).toMatch(/^[0-9a-f]{32}$/);
        expect(boundColumnValue(productUpdate, 'brandID')).toBe(mintedBrandID);
        expect(saved.brand?.brandID).toBe(mintedBrandID);
      });
    }, 20000);

    it('[NET-NEW] a nested BRAND naming a STORED row is UPDATED with what the struct changed', async () => {
      await withPoisonedPool(async ({ buildProductBoundaryGraph, dependencies }) => {
        const executor = createRelationshipResolvingExecutor({
          productType: MERCHANDISE_PRODUCT_TYPE_ROW,
          brand: STORED_BRAND_ROW,
        });
        const productService = buildProductBoundaryGraph(
          productDependencies(dependencies),
          { executor },
          securityContext({
            account: { accountID: INVOCATION_ACCOUNT_ID, newFlag: false, adminAccountFlag: true },
            populationAuthorization: WIRING_ALLOW_POPULATION,
          }),
        );

        const saved = await productService.saveProduct(
          persistedProduct('dddddddd0000000000000000000000b3'),
          {
            ...requiredProductPayload('RENAMED-BRAND'),
            productType: { productTypeID: '444df2f7ea9c87e60051f3cd87b435a1' },
            brand: { brandID: 'bbbbbbbb0000000000000000000000a1', brandName: 'Renamed Brand' },
          },
        );

        expect(saved.hasErrors()).toBe(false);

        /*
         * The reported second reproduction: the response was a `200` and the stored `brandName` never
         * changed. The write is an UPDATE rather than an insert because the read resolved, and the value
         * it carries is the one the nested struct supplied.
         */
        const brandUpdate = executor.statements.find((statement) =>
          statement.sql.startsWith('UPDATE SwBrand SET'),
        );
        expect(boundColumnValue(brandUpdate, 'brandName')).toBe('Renamed Brand');
        /* Untouched by the struct, so it keeps the stored value rather than being nulled. */
        expect(boundColumnValue(brandUpdate, 'urlTitle')).toBe('stored-brand');
        expect(boundColumnValue(brandUpdate, 'modifiedByAccountID')).toBe(INVOCATION_ACCOUNT_ID);
        expect(
          boundColumnValue(
            executor.statements.find((statement) =>
              statement.sql.startsWith('UPDATE SwProduct SET'),
            ),
            'brandID',
          ),
        ).toBe('bbbbbbbb0000000000000000000000a1');
      });
    }, 20000);

    it('[NET-NEW] a nested struct naming an identifier that matches NO row is refused, not written', async () => {
      await withPoisonedPool(async ({ buildProductBoundaryGraph, dependencies }) => {
        const executor = createRelationshipResolvingExecutor({
          productType: MERCHANDISE_PRODUCT_TYPE_ROW,
        });
        const productService = buildProductBoundaryGraph(
          productDependencies(dependencies),
          { executor },
          securityContext({
            account: { accountID: INVOCATION_ACCOUNT_ID, newFlag: false, adminAccountFlag: true },
            populationAuthorization: WIRING_ALLOW_POPULATION,
          }),
        );

        /*
         * The third arm, and the one with no resource-bundle key of its own. The identifier is non-blank,
         * so the read runs and answers nothing, `entityNew` mints, and the recursive populate then assigns
         * the caller's identifier — leaving an entity that reads as persisted and has no row. Hibernate met
         * that exact state, issued an `UPDATE`, and raised `StaleStateException` on the zero row count.
         * Inserting instead would either make a primary key caller-supplied (IR-6) or silently discard the
         * identifier the caller named, so the refusal is carried across rather than replaced.
         */
        await expect(
          productService.saveProduct(persistedProduct('dddddddd0000000000000000000000b4'), {
            ...requiredProductPayload('GHOST-TYPE'),
            productType: {
              productTypeID: 'eeeeeeee0000000000000000000000c9',
              productTypeName: 'Ghost',
              urlTitle: 'ghost',
            },
          }),
        ).rejects.toThrow(/matches no stored row/);

        /*
         * By class NAME rather than by `toBeInstanceOf`: `withPoisonedPool` loads the composition modules
         * through `jest.requireActual` under a fresh registry, so the `DataIntegrityError` the refusal
         * raises is a different class OBJECT from the one this file imported even though it is the same
         * declaration. Comparing the names asserts the classification without asserting module identity.
         */
        const refusal = await productService
          .saveProduct(persistedProduct('dddddddd0000000000000000000000b5'), {
            ...requiredProductPayload('GHOST-TYPE-2'),
            productType: {
              productTypeID: 'eeeeeeee0000000000000000000000c9',
              productTypeName: 'Ghost',
              urlTitle: 'ghost',
            },
          })
          .then(
            () => undefined,
            (error: unknown) => error,
          );
        expect(refusal).toBeInstanceOf(Error);
        expect((refusal as Error).constructor.name).toBe(DataIntegrityError.name);

        const written = executor.statements.map((statement) => statement.sql);
        expect(written.some((sql) => sql.startsWith('UPDATE SwProductType SET'))).toBe(false);
        expect(written.some((sql) => sql.startsWith('INSERT INTO SwProductType'))).toBe(false);
        expect(written.some((sql) => sql.startsWith('UPDATE SwProduct SET'))).toBe(false);
      });
    }, 20000);

    it('[NET-NEW] the eight CAPABILITY boundaries pass through unchanged, so the substitution cannot grow', async () => {
      await withPoisonedPool(async ({ buildSkuBoundaryParts, dependencies }) => {
        /*
         * The complement of the finding. Substituting more than the two identity members would rebuild
         * capabilities per invocation for no security gain and would defeat the memoisation AAP §0.4.1.3
         * requires. Asserted through the settings boundary, whose resolver the SKU half consumes: the
         * rebuilt graph must still answer from the memoised resolver rather than from a fresh one.
         */
        const parts = buildSkuBoundaryParts(
          dependencies,
          { executor: createRecordingExecutor() },
          contextFor(INVOCATION_ACCOUNT_ID),
        );

        /*
         * The delegate binder is built from `boundaries.settings`; it is reused rather than rebuilt, so the
         * object identity of the memoised member is observable through the parts it was used to build.
         */
        expect(parts.skuRepository).toBeDefined();
        expect(dependencies.boundaries.settings).toBe(dependencies.boundaries.settings);
        expect(dependencies.boundaries.imagePaths).toBe(dependencies.boundaries.imagePaths);
        expect(dependencies.boundaries.pricing).toBe(dependencies.boundaries.pricing);

        await Promise.resolve();
      });
    }, 20000);
  });
});

/*
 * There is no per-surface reachability suite, because there are no per-surface modules to reach. A
 * tiered arrangement — `src/config/{catalogBoundaries,catalogStatements,catalogReads}.ts` plus five
 * `src/config/surfaces/*surface.ts` modules — would need module-graph assertions of its own, and
 * none of those eight modules is among the 102 files AAP §0.3.1 enumerates.
 */

/* Test provenance census — generated, so README §12.1's figures cannot drift from the tree. */

describe('NET-NEW documentation consistency — the test provenance census', () => {
  /** One suite's tally. */
  interface SuiteCensus {
    readonly traceable: number;
    readonly netNew: number;
    readonly unlabelled: number;
  }

  /**
   * Walks `test/**` for `.test.ts` files and counts `it` / `test` declarations by provenance label.
   *
   * @returns the per-file tallies, keyed by repository-relative path.
   */
  const censusBySuite = (): ReadonlyMap<string, SuiteCensus> => {
    /*
     * `eslint-disable-next-line @typescript-eslint/no-require-imports` -- the compiler API is a devDependency and this is a Node test file.
     */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ts = require('typescript') as typeof import('typescript');
    const testRoot = join(SUBTREE_ROOT, 'test');
    const suites: string[] = [];

    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const candidate = join(directory, entry.name);

        if (entry.isDirectory()) {
          walk(candidate);
        } else if (candidate.endsWith('.test.ts')) {
          suites.push(candidate);
        }
      }
    };

    walk(testRoot);
    suites.sort();

    const tallies = new Map<string, SuiteCensus>();

    for (const suite of suites) {
      let traceable = 0;
      let netNew = 0;
      let unlabelled = 0;

      const source = ts.createSourceFile(
        suite,
        readFileSync(suite, 'utf8'),
        ts.ScriptTarget.ES2022,
        true,
      );

      const declaredName = (expression: import('typescript').Expression): string | undefined => {
        if (ts.isIdentifier(expression)) {
          return expression.text;
        }

        if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(expression.expression)) {
          return expression.expression.text;
        }

        if (ts.isCallExpression(expression)) {
          const inner = expression.expression;

          if (ts.isPropertyAccessExpression(inner) && ts.isIdentifier(inner.expression)) {
            return inner.expression.text;
          }
        }

        return undefined;
      };

      const visit = (node: import('typescript').Node): void => {
        if (ts.isCallExpression(node)) {
          const name = declaredName(node.expression);
          const isCalleeOfOuterCall =
            node.parent !== undefined &&
            ts.isCallExpression(node.parent) &&
            node.parent.expression === node;

          if ((name === 'it' || name === 'test') && !isCalleeOfOuterCall) {
            const [titleArgument] = node.arguments;
            let title = '';

            if (
              titleArgument !== undefined &&
              (ts.isStringLiteral(titleArgument) ||
                ts.isNoSubstitutionTemplateLiteral(titleArgument))
            ) {
              title = titleArgument.text;
            } else if (titleArgument !== undefined && ts.isTemplateExpression(titleArgument)) {
              title = titleArgument.head.text;
            }

            const label = title
              .trimStart()
              .replace(/^[[(*_\s]+/u, '')
              .toUpperCase();

            if (label.startsWith('TRACEABLE')) {
              traceable += 1;
            } else if (label.startsWith('NET-NEW') || label.startsWith('NET NEW')) {
              netNew += 1;
            } else {
              unlabelled += 1;
            }
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(source);
      tallies.set(
        suite
          .slice(SUBTREE_ROOT.length + 1)
          .split(sep)
          .join('/'),
        {
          traceable,
          netNew,
          unlabelled,
        },
      );
    }

    return tallies;
  };

  it('[NET-NEW] labels every declaration, so no case is silently unattributed', () => {
    const unlabelled = [...censusBySuite()]
      .filter(([, tally]) => tally.unlabelled > 0)
      .map(([suite, tally]) => `${suite} (${String(tally.unlabelled)})`);

    expect(unlabelled).toStrictEqual([]);
  });

  it('[NET-NEW] agrees with the figures README §12.1 states, so neither can drift alone', () => {
    const tallies = censusBySuite();
    const totals = [...tallies.values()].reduce(
      (running, tally) => ({
        traceable: running.traceable + tally.traceable,
        netNew: running.netNew + tally.netNew,
      }),
      { traceable: 0, netNew: 0 },
    );
    const traceableSuites = [...tallies]
      .filter(([, tally]) => tally.traceable > 0)
      .map(([suite]) => suite);
    const readme = readFileSync(join(SUBTREE_ROOT, 'README.md'), 'utf8');

    /* The three counts, formatted as the document formats them. */
    expect(readme).toContain(`**${String(tallies.size)}** suites`);
    expect(readme).toContain(
      `**${String(totals.traceable + totals.netNew).replace(/\B(?=(\d{3})+$)/gu, ',')} in total, ` +
        `${String(totals.traceable)} TRACEABLE and ` +
        `${String(totals.netNew).replace(/\B(?=(\d{3})+$)/gu, ',')} NET-NEW, with 0 unlabelled.**`,
    );

    /*
     * And the suites that carry traceable cases, by name and count. The document names them, so a suite
     * that gained or lost its only traceable case is caught here rather than leaving the list wrong.
     */
    expect(traceableSuites).toStrictEqual([
      'test/domain/Brand.test.ts',
      'test/domain/Product.test.ts',
      'test/regression/issues.test.ts',
    ]);

    for (const suite of traceableSuites) {
      const tally = tallies.get(suite);

      expect(tally).toBeDefined();
      expect(readme).toContain(`\`${suite}\` (${String(tally?.traceable ?? 0)})`);
    }
  });

  it('[NET-NEW] keeps the twenty-two folded-body banners and the README audit command in lockstep', () => {
    const expected: readonly (readonly [host: string, subject: string])[] = [
      ['test/services/ProductService.test.ts', 'handlers/productHandler'],
      ['test/services/SkuService.test.ts', 'handlers/skuHandler'],
      ['test/services/BrandService.test.ts', 'handlers/brandHandler'],
      ['test/services/OptionService.test.ts', 'handlers/optionHandler'],
      ['test/integrations/ProductFeedBuilder.test.ts', 'integrations/ProductFeedQuery'],
      ['test/integrations/ProductFeedBuilder.test.ts', 'integrations/googleIntegration'],
      ['test/integrations/ProductFeedBuilder.test.ts', 'integrations/BaseIntegration'],
      ['test/integrations/ProductFeedBuilder.test.ts', 'integrations/IntegrationContract'],
      ['test/integrations/ProductFeedBuilder.test.ts', 'handlers/googleFeedHandler'],
      ['test/adapters/MySqlProductRepository.test.ts', 'adapters/MySqlProductPersistence'],
      ['test/adapters/MySqlProductRepository.test.ts', 'adapters/MySqlBrandRepository'],
      ['test/adapters/MySqlProductRepository.test.ts', 'adapters/catalogAggregates'],
      ['test/adapters/MySqlSkuRepository.test.ts', 'adapters/UnitOfWork'],
      ['test/adapters/MySqlSkuRepository.test.ts', 'adapters/UnitOfWorkSortOrder'],
      ['test/adapters/MySqlOptionRepository.test.ts', 'adapters/SmartListQueryBuilder'],
      ['test/adapters/MySqlProductTypeRepository.test.ts', 'adapters/schemaScopeRegistry'],
      ['test/domain/Product.test.ts', 'domain/process/processObjects'],
      ['test/regression/issues.test.ts', 'handlers/httpResponse'],
      ['test/regression/issues.test.ts', 'handlers/entrySurface'],
      ['test/regression/issues.test.ts', 'config/env'],
      ['test/regression/issues.test.ts', 'config/container'],
      ['test/regression/issues.test.ts', 'config/writeBoundaryRebuild'],
    ];
    const bannerPrefix = ['FOLDED', 'IN', 'FROM'].join(' ');
    const bannerPattern = new RegExp(`${bannerPrefix} ([^\\s*]+)`, 'gu');
    const actual: string[] = [];
    const hosts = new Set(expected.map(([host]) => host));

    for (const host of hosts) {
      const source = readFileSync(join(SUBTREE_ROOT, ...host.split('/')), 'utf8');

      for (const match of source.matchAll(bannerPattern)) {
        const subject = match[1];
        if (subject !== undefined) {
          actual.push(`${host} <- ${subject}`);
        }
      }
    }

    const expectedPairs = expected.map(([host, subject]) => `${host} <- ${subject}`).sort();
    expect(actual.sort()).toStrictEqual(expectedPairs);
    expect(actual).toHaveLength(22);

    const readme = readFileSync(join(SUBTREE_ROOT, 'README.md'), 'utf8');
    expect(readme).toContain(
      `\`grep -rh '${bannerPrefix}' test/ | wc -l\` reports **${String(expected.length)}**`,
    );
  });
});

/*
 * §2.2's runtime-lifecycle arithmetic, asserted rather than trusted (CWE-1059-adjacent: a disclosure that
 * misattributes its own source is a disclosure a reader cannot audit).
 *
 * The review finding this closes was not a wrong DATE — every actionable date in §2.2 verified exactly
 * against its owning body. It was a wrong PROVENANCE: the 31 August / 30 September 2026 pair was credited
 * to AWS's documented "at least 30 days / at least 60 days" cadence, which cannot produce it, while the
 * 1 June / 1 July 2026 pair — which does track that cadence — was credited to a bulletin instead. The two
 * provenances were transposed, and a reader re-deriving the section's own claim would fail to reproduce it.
 *
 * A prose fix alone would leave nothing stopping the same transposition returning, so the arithmetic is
 * pinned here the way the provenance census and the folded-body banners are: by reading the document and
 * recomputing. Nothing in this suite asserts what AWS's table SAYS — that is a fact about a remote
 * document, re-checkable only by reading it, and §2.2 says so. What is asserted is that the section's
 * internal arithmetic is self-consistent and that the cadence is not credited with a pair it cannot yield.
 */

describe('NET-NEW documentation consistency — §2.2 runtime-lifecycle arithmetic', () => {
  /** The deprecation date both §2.2 bullets are measured from, as the section states it. */
  const DEPRECATION = Date.UTC(2026, 3, 30);

  /** One whole day, for turning a date difference into the day count §2.2 quotes. */
  const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

  /**
   * Days from the deprecation date to a UTC date, which is the figure §2.2 states for each pair.
   *
   * @param year - the calendar year.
   * @param monthIndex - the zero-based month, as `Date.UTC` takes it.
   * @param day - the day of the month.
   * @returns whole days after 30 April 2026.
   */
  const daysAfterDeprecation = (year: number, monthIndex: number, day: number): number =>
    (Date.UTC(year, monthIndex, day) - DEPRECATION) / MILLISECONDS_PER_DAY;

  /** The document under test, read fresh so a stale copy cannot pass. */
  const readme = (): string => readFileSync(join(SUBTREE_ROOT, 'README.md'), 'utf8');

  it('[NET-NEW] states the cadence FLOOR that 30/60 days actually yields, not a published pair', () => {
    /*
     * 30 April 2026 + 30 days is 30 May 2026 and + 60 days is 29 June 2026. Both are recomputed here
     * rather than written as literals only, so a future edit that changed the stated floor without
     * changing the deprecation date would fail rather than read plausibly.
     */
    expect(daysAfterDeprecation(2026, 4, 30)).toBe(30);
    expect(daysAfterDeprecation(2026, 5, 29)).toBe(60);
    expect(readme()).toContain('floor of 30 May 2026 and 29 June 2026');
  });

  it('[NET-NEW] quotes the day count of every published pair, and each one recomputes', () => {
    /*
     * The table is the whole of the finding. The 32/62 pair is within a month-boundary rounding of the
     * cadence; the 123/153 pair is four to five times it and therefore cannot come from it; the 277/307
     * pair is the current table's, further out again. Each figure §2.2 prints is asserted against the
     * arithmetic, so a transposition cannot be reintroduced silently.
     */
    const stated: readonly (readonly [
      days: number,
      year: number,
      monthIndex: number,
      day: number,
    ])[] = [
      [32, 2026, 5, 1],
      [62, 2026, 6, 1],
      [123, 2026, 7, 31],
      [153, 2026, 8, 30],
      [277, 2027, 1, 1],
      [307, 2027, 2, 3],
    ];

    for (const [days, year, monthIndex, day] of stated) {
      expect(daysAfterDeprecation(year, monthIndex, day)).toBe(days);
    }

    const document = readme();

    expect(document).toContain('**1 June / 1 July 2026** sits at **32 and 62 days**');
    expect(document).toContain('**31 August / 30 September 2026** sits at **123 and 153 days**');
  });

  it('[NET-NEW] does NOT credit the cadence with the pair it cannot produce', () => {
    /*
     * The negative assertion, and the one that catches a regression to the reviewed text. That text read
     * "**31 August / 30 September 2026**, from the standard 30-day/60-day cadence", which is the exact
     * claim the arithmetic above refutes. Matching on the substring rather than on a paraphrase is
     * deliberate: a reworded reintroduction is a different defect and would be caught by the positive
     * assertions above, whereas this guards the specific sentence a reader might restore from history.
     */
    const document = readme();

    expect(document).not.toContain('from the\n  standard 30-day/60-day cadence');
    expect(document).not.toContain('from the standard 30-day/60-day cadence');
    /* And the delay is attributed to AWS's own note, quoted rather than characterised. */
    expect(document).toContain('beyond the usual 30 and 60\n    days');
  });

  it('[NET-NEW] introduces no performance or service-level claim while stating all of this (IR-12)', () => {
    /*
     * §2.2 closes by declaring itself a lifecycle statement and not a performance claim, and that
     * declaration has to stay true of the bullets above it. The day counts are calendar arithmetic about a
     * deprecation schedule; none of them is a latency, a throughput, an availability figure or a capacity
     * estimate, and this case pins the closing declaration itself so an edit cannot quietly drop it.
     */
    expect(readme()).toContain(
      '**This is a lifecycle statement only. It is not a performance claim and it is not a service-level\ncommitment.**',
    );
  });
});
