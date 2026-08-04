/**
 * ProductService — unit suite for the extracted TypeScript catalog service
 *
 * What this file is. Direct-import, constructor-injection unit tests for
 * `slatwall-ts/src/services/ProductService.ts`, the port of `model/service/ProductService.cfc`. Every
 * test builds its own service graph through {@link buildHarness} and drives the class directly. There
 * is no framework, no container, no service locator and no module mocking anywhere in this file.
 *
 * That is the deliberate difference from the legacy suite: `meta/tests/unit/SlatwallUnitTestBase.cfc:L49-L79`
 * boots the whole FW/1 application and resolves services through DI/1 at run time, making every legacy
 * service test an integration test. These are unit tests, which the ports are what make possible.
 */

import {
  DENY_ALL_POPULATION_AUTHORIZATION,
  buildOption,
  buildOptionGroup,
  buildProduct,
  buildProductType,
  buildSku,
  createAbsentAccountContextDouble,
  createAccessContentDouble,
  createAccountContextDouble,
  createBaseServicePersistenceDouble,
  createDefaultSkuDelegate,
  createDirectPersisterDouble,
  createImagePathDouble,
  createInMemoryOptionRepository,
  createInMemoryProductRepository,
  createInMemorySkuRepository,
  createMerchandiseProductFixture,
  createPopulationAuthorizationDouble,
  createProductTypeRootResolverDouble,
  createSettingResolverDouble,
  createSmartListQueryDouble,
  createSubscriptionTermDouble,
  createTransactionExistenceChecker,
  createUniquePropertyDouble,
  createUrlTitleAvailabilityDouble,
  newAccount,
  persistedNonAdminAccount,
  type ProductImportHandler,
  type ProductRepositoryCall,
  type SettingResolverCall,
  type SettingSeed,
  physicalID,
  type SkuRepositoryCall,
  type SmartListResponder,
  TEST_ADMIN_ACCOUNT_ID,
  TEST_NON_ADMIN_ACCOUNT_ID,
  type UrlTitleTableName,
  GENEROUS_COMBINATION_BUDGET,
  GENEROUS_URL_TITLE_PROBE_BUDGET,
} from '../support/inMemoryRepositories';
import {
  MERCHANDISE_PRODUCT_TYPE_ID,
  SUBSCRIPTION_PRODUCT_TYPE_ID,
} from '../fixtures/productTypes';
import {
  TEST_MERCHANDISE_PRODUCT_CODE,
  TEST_MERCHANDISE_PRODUCT_NAME,
  TEST_MERCHANDISE_PRODUCT_PRICE,
} from '../fixtures/testProduct';
import { BaseService, type MaintenanceEntityRef } from '../../src/services/BaseService';
import { OptionService, type SelectOption } from '../../src/services/OptionService';
import {
  ProductService,
  type FormattedOptionGroups,
  type ProductBaseService,
  type ProductProcessValidator,
  type ProductServiceCollaborators,
  type ProductTypeBaseService,
  type ProductTypeWithErrorState,
} from '../../src/services/ProductService';
import { readHydratedParentProductTypeID } from '../../src/adapters/mysql/rowMappers';
import { SkuService } from '../../src/services/SkuService';
import { Option } from '../../src/domain/option/Option';
import { OptionGroup } from '../../src/domain/option/OptionGroup';
import type { ProductAddOption } from '../../src/domain/process/ProductAddOption';
import type { ProductAddOptionGroup } from '../../src/domain/process/ProductAddOptionGroup';
import type { ProductUpdateSkus } from '../../src/domain/process/ProductUpdateSkus';
import {
  PRODUCT_PROPERTY_DESCRIPTORS,
  Product,
  type ProductDefaultSkuDelegate,
  type ProductPropertyName,
  type ProductTransactionExistenceChecker,
} from '../../src/domain/product/Product';
import {
  PRODUCT_TYPE_DECLARED_PROPERTIES,
  ProductType,
} from '../../src/domain/product/ProductType';
import { Sku } from '../../src/domain/sku/Sku';
import { DomainError, NotImplementedError } from '../../src/errors/DomainError';
import {
  FILE_UPLOAD_RBKEY,
  PROCESS_OBJECTS_ERROR_KEY,
  ValidationError,
} from '../../src/errors/ValidationError';
import {
  physicalCountsValidation,
  productValidationRuleSet,
} from '../../src/validation/rules/product.rules';
import { productTypeValidationRuleSet } from '../../src/validation/rules/productType.rules';
import { productUpdateSkusValidationRuleSet } from '../../src/validation/rules/productUpdateSkus.rules';
import {
  Validator,
  type ProcessValidationRequest,
  type ProcessValidationResult,
  type ValidateOptions,
  type ValidationContext,
  type ValidationRuleSet,
  type ValidationSubject,
} from '../../src/validation/Validator';
import type { SmartListQuery } from '../../src/ports/SmartListQueryPort';
import type { UniqueValueProbe } from '../../src/util/urlTitle';
import { SKU_ENTITY_METADATA } from '../../src/domain/sku/Sku';
import { PRODUCT_ACCESS_MATRIX, createProductHandler } from '../../src/handlers/productHandler';
import { manageEntity } from '../../src/domain/base/populate';
import { PRODUCT_TYPE_ENTITY_METADATA } from '../../src/domain/product/ProductType';
import type {
  LoadDataFromFileEvent,
  NewProductEvent,
  ProductHandler,
  ProductHandlerService,
  ProductIdentifierEvent,
  ProductPayloadEvent,
  ProductSaveEvent,
  ProductSmartListEvent,
  ProductTypeIdentifierEvent,
  ProductTypePayloadEvent,
  ProductWriteGraph,
  SelectedOptionsEvent,
} from '../../src/handlers/productHandler';
import type {
  AccountReference,
  EntityAuthorizationRequest,
  InvocationSecurityRequest,
  InvocationSecurityResolver,
  RequestAuthorizationContext,
} from '../../src/ports/AccountContextPort';
import type { SmartListInput, SmartListResult } from '../../src/ports/SmartListQueryPort';
import type { TransactionalWriteRunner } from '../../src/ports/UniquePropertyPort';
import type { UrlTitleProbeBudget } from '../../src/util/urlTitle';

/**
 * The physical tables the URL-title utility is asked about. `model/service/ProductService.cfc:L269`
 * passes `tableName="SwProduct"` and `:L297`/`:L300` pass `tableName="SwProductType"`; both tokens are
 * source-declared and are asserted literally rather than derived, because the landed constants are
 * module-private and a reader checking parity must see the source string.
 */
const PRODUCT_TABLE = 'SwProduct';
const PRODUCT_TYPE_TABLE = 'SwProductType';

/** `model/service/ProductService.cfc:L343` declares `entityName="SlatwallProduct"`. */
const PRODUCT_ENTITY = 'SlatwallProduct';

/** The entity the IR-1 synthesized `getProductType()` resolves against. */
const PRODUCT_TYPE_ENTITY = 'SlatwallProductType';

/** The setting `Product.getTitle()` renders, seeded so the title is deterministic per test. */
const PRODUCT_TITLE_STRING_SETTING: SettingSeed = {
  settingName: 'productTitleString',
  value: '${productName}',
};

/**
 * The two settings `Sku.generateImageFileName()` reads. Every member that chains
 * `updateDefaultImageFileNames` needs them, and the resolver double throws on an unseeded key, so
 * seeding them is what proves the chain actually ran rather than silently no-oped.
 */
const IMAGE_FILE_NAME_SETTINGS: readonly SettingSeed[] = [
  { settingName: 'productImageOptionCodeDelimiter', value: '-' },
  { settingName: 'productImageDefaultExtension', value: 'jpg' },
];

/** `model/service/ProductService.cfc:L200` and `:L246` resolve the image root from this setting. */
const IMAGE_FOLDER_SETTING: SettingSeed = {
  settingName: 'globalAssetsImageFolderPath',
  value: '/assets/images',
};

/** `model/service/ProductService.cfc:L159` places this setting directly inside an `if`. */
const AUTO_APPROVE_REVIEWS_SETTING: SettingSeed = {
  settingName: 'productAutoApproveReviewsFlag',
  value: '1',
};

// Physically valid identifiers.

// Strict-mode reading helpers.

function requireAt<TItem>(items: readonly TItem[], index: number): TItem {
  const item = items[index];
  if (item === undefined) {
    throw new Error(
      `Expected an element at index ${String(index)} but the collection holds ${String(items.length)}.`,
    );
  }
  return item;
}

/** The option-group names an answer carries, in the order it carries them. */
function groupNames(groups: FormattedOptionGroups): readonly string[] {
  return Object.keys(groups);
}

/** Reads one formatted option group by name, failing loudly when no entry carries it. */
function requireGroup(
  groups: FormattedOptionGroups,
  optionGroupName: string,
): readonly SelectOption[] {
  const options = groups[optionGroupName];
  if (options === undefined) {
    throw new Error(
      `Expected a "${optionGroupName}" option group but the answer holds [${groupNames(groups).join(', ')}].`,
    );
  }
  return options;
}

/**
 * Narrows a recorded repository call union by its `member` discriminant. Written as a type predicate
 * so no cast is needed anywhere in the assertions.
 */
function isSkuCall<TMember extends SkuRepositoryCall['member']>(
  member: TMember,
): (call: SkuRepositoryCall) => call is Extract<SkuRepositoryCall, { member: TMember }> {
  return (call: SkuRepositoryCall): call is Extract<SkuRepositoryCall, { member: TMember }> =>
    call.member === member;
}

function isProductCall<TMember extends ProductRepositoryCall['member']>(
  member: TMember,
): (call: ProductRepositoryCall) => call is Extract<ProductRepositoryCall, { member: TMember }> {
  return (
    call: ProductRepositoryCall,
  ): call is Extract<ProductRepositoryCall, { member: TMember }> => call.member === member;
}

/**
 * Awaits a call that is expected to reject with a {@link DomainError} and hands the error back so its
 * `context` — the locator the ported member pins its judgement call to — can be asserted directly.
 */
/** Narrows a member of `product.getSkus()` to the `Sku` entity. */
function requireSku(candidate: unknown, description: string): Sku {
  if (!(candidate instanceof Sku)) {
    throw new Error(`Expected ${description} to be a Sku entity.`);
  }
  return candidate;
}

/** Narrows a captured {@link DomainError} to the {@link NotImplementedError} subclass. */
function requireNotImplemented(error: DomainError): NotImplementedError {
  if (!(error instanceof NotImplementedError)) {
    throw new Error(`Expected a NotImplementedError, received ${error.name}.`);
  }
  return error;
}

async function captureDomainError(call: Promise<unknown>): Promise<DomainError> {
  try {
    await call;
  } catch (error: unknown) {
    if (error instanceof DomainError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected the call to reject with a DomainError, but it resolved.');
}

// Observable validator seams.

/** One recorded validation request, in the order the service issued it. */
type ValidationInvocation =
  | { readonly kind: 'validate'; readonly className: string; readonly context: ValidationContext }
  | {
      readonly kind: 'validateProcess';
      readonly className: string;
      readonly processContext: ValidationContext;
      readonly processObjectSupplied: boolean;
    };

/**
 * The real {@link Validator}, subclassed only to record what it was asked, in the order it was asked.
 * Every outcome is the base class's: both overrides delegate straight to `super`.
 */
class RecordingValidator extends Validator {
  readonly invocations: ValidationInvocation[] = [];

  public override validate<TSubject extends ValidationSubject>(
    subject: TSubject,
    ruleSet: ValidationRuleSet<TSubject>,
    context: ValidationContext,
    options?: ValidateOptions,
  ): Promise<ValidationError> {
    this.invocations.push(
      Object.freeze({ kind: 'validate', className: subject.getClassName(), context }),
    );
    return super.validate(subject, ruleSet, context, options);
  }

  public override validateProcess<
    TEntity extends ValidationSubject,
    TProcessObject extends ValidationSubject,
  >(request: ProcessValidationRequest<TEntity, TProcessObject>): Promise<ProcessValidationResult> {
    this.invocations.push(
      Object.freeze({
        kind: 'validateProcess',
        className: request.entity.getClassName(),
        processContext: request.processContext,
        processObjectSupplied: request.processObject !== undefined,
      }),
    );
    return super.validateProcess(request);
  }
}

/**
 * A validator that finds nothing wrong, used only where a landed boundary makes the real rule set
 * unreachable and the prompt still requires the member's body to be exercised.
 */
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

// The option catalog the smart-list seam answers with.

/**
 * What the option queries behind `Product.getOptionGroups()` and `Product.getOptionsByOptionGroup()`
 * should find. `OptionService`'s module-scope finders issue two distinct queries — one rooted at
 * `SlatwallOptionGroup` filtered by `options.skus.product.productID`, one rooted at `SlatwallOption`
 * filtered by `optionGroup.optionGroupID` and `skus.product.productID` — so the catalog is keyed the
 * same way the queries are.
 */
interface OptionCatalog {
  /** The groups the product owns — what `Product.getOptionGroups()` resolves to. */
  readonly optionGroups: readonly OptionGroup[];
  /** The product's options per group — what `Product.getOptionsByOptionGroup()` resolves to. */
  readonly optionsByOptionGroupID: Readonly<Record<string, readonly Option[]>>;
  /** Groups an identifier lookup can find. Defaults to {@link OptionCatalog.optionGroups}. */
  readonly resolvableOptionGroups?: readonly OptionGroup[];
  /** Options an identifier lookup can find. Nothing is resolvable unless listed. */
  readonly resolvableOptions?: readonly Option[];
}

const EMPTY_OPTION_CATALOG: OptionCatalog = Object.freeze({
  optionGroups: Object.freeze([]),
  optionsByOptionGroupID: Object.freeze({}),
});

/** The filter path `findProductOptionsByOptionGroup` uses to select a single group's options. */
const OPTION_GROUP_ID_FILTER_PATH = 'optionGroup.optionGroupID';

/**
 * Reads one exact-match filter value out of a query, or `undefined` when the query has no such filter.
 */
function readFilterValue(query: SmartListQuery, propertyIdentifier: string): string | undefined {
  for (const whereGroup of query.whereGroups ?? []) {
    for (const filter of whereGroup.filters ?? []) {
      if (filter.propertyIdentifier === propertyIdentifier) {
        return String(filter.value);
      }
    }
  }
  return undefined;
}

/** Answers every query the catalog slice issues against the smart-list seam. */
function createCatalogResponder(
  catalog: OptionCatalog,
  productRows: readonly Product[],
  productTypeRows: readonly ProductType[],
  productFailure?: Error,
): SmartListResponder {
  return (query: SmartListQuery) => {
    if (query.entityName === 'SlatwallOptionGroup') {
      const requestedOptionGroupID = readFilterValue(query, 'optionGroupID');
      if (requestedOptionGroupID === undefined) {
        return { kind: 'page', metrics: {}, records: catalog.optionGroups };
      }
      const pool = catalog.resolvableOptionGroups ?? catalog.optionGroups;
      return {
        kind: 'page',
        metrics: {},
        records: pool.filter((group) => group.optionGroupID === requestedOptionGroupID),
      };
    }

    if (query.entityName === 'SlatwallOption') {
      const requestedOptionID = readFilterValue(query, 'optionID');
      if (requestedOptionID !== undefined) {
        return {
          kind: 'page',
          metrics: {},
          records: (catalog.resolvableOptions ?? []).filter(
            (option) => option.optionID === requestedOptionID,
          ),
        };
      }
      const optionGroupID = readFilterValue(query, OPTION_GROUP_ID_FILTER_PATH);
      const options =
        optionGroupID === undefined ? [] : (catalog.optionsByOptionGroupID[optionGroupID] ?? []);
      return { kind: 'page', metrics: {}, records: options };
    }

    if (query.entityName === PRODUCT_ENTITY) {
      if (productFailure !== undefined) {
        return { kind: 'failure', failure: productFailure };
      }
      const requestedProductID = readFilterValue(query, 'productID');
      if (requestedProductID === undefined) {
        return { kind: 'page', metrics: {}, records: productRows };
      }
      return {
        kind: 'page',
        metrics: {},
        records: productRows.filter((row) => row.productID === requestedProductID),
      };
    }

    if (query.entityName === PRODUCT_TYPE_ENTITY) {
      const requestedProductTypeID = readFilterValue(query, 'productTypeID');
      if (requestedProductTypeID === undefined) {
        return { kind: 'page', metrics: {}, records: productTypeRows };
      }
      return {
        kind: 'page',
        metrics: {},
        records: productTypeRows.filter((row) => row.productTypeID === requestedProductTypeID),
      };
    }

    return undefined;
  };
}

// The harness — one fresh service graph per test, no module-scope mutable state.

/** One recorded delegation to the product-type base service. */
interface ProductTypeSaveRecord {
  readonly entity: ProductTypeWithErrorState;
  readonly data: Record<string, unknown>;
}

/**
 * Which account the account-context seam answers with, expressed without importing the port type.
 */
type AccountPosture = 'admin' | 'nonAdmin' | 'new' | 'absent';

interface HarnessOptions {
  /** Settings the resolver will answer. It throws on an unseeded key, which keeps reads honest. */
  readonly settings?: readonly SettingSeed[];
  /** A blanket answer for keys a test does not care about. Omitted by default, on purpose. */
  readonly settingFallback?: string;
  /** SKUs seeded into the SKU repository, which is what the option-resolution query searches. */
  readonly repositorySkus?: readonly Sku[];
  /** SKUs seeded into the option repository, which is what the unused-option queries search. */
  readonly optionRepositorySkus?: readonly Sku[];
  /**
   * Option groups seeded into the option repository, the pool the unused-group query draws from.
   */
  readonly repositoryOptionGroups?: readonly OptionGroup[];
  /** Products seeded into the product repository. */
  readonly repositoryProducts?: readonly Product[];
  /** Products the `SlatwallProduct` smart-list query answers with. */
  readonly productRows?: readonly Product[];
  /** Product-type rows an identifier lookup can resolve — what `getProductType()` reads. */
  readonly productTypeRows?: readonly ProductType[];
  /** What the option-group and option queries find. */
  readonly optionCatalog?: OptionCatalog;
  /** Product identifiers that already participate in a transaction (the transaction-existence delete guard). */
  readonly transactionProductIDs?: readonly string[];
  /** Replaces the repository's import behaviour, so the forwarded arguments can be observed. */
  readonly onImport?: ProductImportHandler;
  /** Replaces the validator. Used only where a landed boundary makes the real rule unreachable. */
  readonly validator?: ProductProcessValidator;

  /*
   * The URL-title probe ceiling this harness's service carries. */
  readonly urlTitleProbeBudget?: UrlTitleProbeBudget;
  /** Replaces the product base service, used to force a refused delete. */
  readonly baseService?: ProductBaseService;
  /** URL titles already taken, which drives the utility's collision suffix. */
  readonly takenUrlTitles?: readonly {
    readonly tableName: UrlTitleTableName;
    readonly value: string;
  }[];
  /**
   * Makes the product-type base service reject, so a non-validation failure can be observed
   * propagating. `BaseService.save` itself no longer rejects for a validation failure — see
   * {@link SurfaceOptions.productTypeSaveFindings} for that path.
   */
  readonly productTypeSaveFailure?: Error;
  /**
   * Makes the product-type base service attach findings to the entity and resolve with it, which is
   * what the landed `BaseService.save` does on a validation failure
   * (`model/service/HibachiService.cfc:L103` returns `arguments.entity` on every path).
   */
  readonly productTypeSaveFindings?: Readonly<Record<string, readonly string[]>>;
  /** Makes the product-entity smart-list stream reject, so a port failure can be observed. */
  readonly smartListFailure?: Error;
  /** Which account the review member sees. */
  readonly account?: AccountPosture;
  /** Subscription-term identifiers the boundary port resolves. */
  readonly subscriptionTermIDs?: readonly string[];
}

interface Harness {
  readonly service: ProductService;
  readonly optionService: OptionService;
  readonly skuService: SkuService;
  /** Every call the SKU repository received, in order. */
  readonly skuCalls: readonly SkuRepositoryCall[];
  /** SKUs the repository actually wrote. */
  readonly persistedSkus: readonly Sku[];
  /** Every call the product repository received, in order. */
  readonly productCalls: readonly ProductRepositoryCall[];
  /** Products the product repository wrote through its own `saveProduct` member. */
  readonly savedProducts: readonly Product[];
  /** Products written through the direct persister the service holds, in call order. */
  persistedProducts(): readonly Product[];
  /** Entities the base service removed. */
  readonly removedProducts: readonly Product[];
  /** Setting cleanups the base service ran, in order, after a successful delete. */
  readonly settingCleanups: readonly MaintenanceEntityRef[];
  /** Comment cleanups the base service ran, in order, after a successful delete. */
  readonly commentCleanups: readonly MaintenanceEntityRef[];
  /** Every smart-list query issued against the product seam, in order. */
  readonly smartListQueries: readonly SmartListQuery[];
  /** Every smart-list query issued against the option-finder seam, in order. */
  readonly optionQueries: readonly SmartListQuery[];
  /** Every URL-title availability probe, in order. */
  readonly urlTitleProbes: readonly { readonly tableName: string; readonly value: string }[];
  /** Every setting the service read, in order. */
  readonly settingReads: readonly SettingResolverCall[];
  /** Delegations to the product-type base service, in order. */
  readonly productTypeSaves: readonly ProductTypeSaveRecord[];
  /** Every validation request that reached the real validator, in true global order. */
  readonly validations: readonly ValidationInvocation[];
  /** How many times the account context was consulted. */
  accountReads(): number;
  /**
   * Publishes a SKU as a product's default SKU and registers it with the identifier reader, which is
   * the only way `requireDefaultSkuEntity` can find the entity behind the delegate.
   */
  attachDefaultSku(product: Product, sku: Sku): ProductDefaultSkuDelegate;
}

function buildHarness(options: HarnessOptions = {}): Harness {
  // Identifier reader. `ProductDefaultSkuDelegate` exposes no `getSkuID` — deliberately, because the
  // legacy calculated-property boundary of AAP §0.2.2.6 does not let the delegate widen — so the
  // service takes a `DefaultSkuIdReader` instead. The map is harness-local, never module-scope.
  const defaultSkuIdsByDelegate = new WeakMap<object, string>();

  const catalog = options.optionCatalog ?? EMPTY_OPTION_CATALOG;
  const productRows = options.productRows ?? [];

  const settings = createSettingResolverDouble({
    settings: options.settings ?? [],
    ...(options.settingFallback === undefined ? {} : { fallback: options.settingFallback }),
  });

  const skuRepository = createInMemorySkuRepository({
    skus: options.repositorySkus ?? [],
    transactionProductIDs: options.transactionProductIDs ?? [],
  });

  const productRepository = createInMemoryProductRepository({
    products: options.repositoryProducts ?? [],
    ...(options.onImport === undefined ? {} : { onImport: options.onImport }),
  });

  const optionRepository = createInMemoryOptionRepository({
    optionGroups: options.repositoryOptionGroups ?? [],
    skus: options.optionRepositorySkus ?? [],
  });

  // Two independent smart-list doubles. The option finders and the product reads are separate query
  // streams in the legacy too, and keeping them separate here means an option query can never consume
  // an outcome a product assertion was waiting for.
  const productTypeRows = options.productTypeRows ?? [];
  const optionSmartList = createSmartListQueryDouble({
    respond: createCatalogResponder(catalog, productRows, productTypeRows),
  });
  const productSmartList = createSmartListQueryDouble({
    respond: createCatalogResponder(
      catalog,
      productRows,
      productTypeRows,
      options.smartListFailure,
    ),
  });

  const urlTitles = createUrlTitleAvailabilityDouble();
  for (const taken of options.takenUrlTitles ?? []) {
    urlTitles.take(taken.tableName, taken.value);
  }

  /**
   * `model/service/DataService.cfc:L53-L71` asks `isUniqueURLTitle` about one table at a time, and the
   * landed utility's probe is deliberately widened to `string` so it is not coupled to the catalog's
   * table list. The narrowing back to the three physical tables happens here, and an unexpected table
   * fails loudly rather than silently reporting "available".
   */
  const isUrlTitleAvailable: UniqueValueProbe = (tableName: string, value: string) => {
    if (
      tableName !== PRODUCT_TABLE &&
      tableName !== PRODUCT_TYPE_TABLE &&
      tableName !== 'SwBrand'
    ) {
      return Promise.reject(
        new Error(`A URL title was probed against the unexpected table "${tableName}".`),
      );
    }
    return urlTitles.probe.isUrlTitleAvailable(tableName, value);
  };

  const populationAuthorization = createPopulationAuthorizationDouble();
  const uniqueProperty = createUniquePropertyDouble();
  const validator = new RecordingValidator(uniqueProperty.uniqueProperty);

  const persistence = createBaseServicePersistenceDouble<Product>();
  const productPersister = createDirectPersisterDouble<Product>();
  const productTypeRoots = createProductTypeRootResolverDouble();
  const subscriptionTerms = createSubscriptionTermDouble({
    subscriptionTermIDs: options.subscriptionTermIDs ?? [],
  });
  const accessContents = createAccessContentDouble();
  const imagePaths = createImagePathDouble();

  const accountPosture: AccountPosture = options.account ?? 'admin';
  const accountContext =
    accountPosture === 'absent'
      ? createAbsentAccountContextDouble()
      : accountPosture === 'nonAdmin'
        ? createAccountContextDouble(persistedNonAdminAccount())
        : accountPosture === 'new'
          ? createAccountContextDouble(newAccount())
          : createAccountContextDouble();

  const transactionChecker: ProductTransactionExistenceChecker = createTransactionExistenceChecker(
    skuRepository.repository,
  );

  /**
   * The real base service, wired to the real rule set. `deleteProduct` is only meaningful against it:
   * The `transactionExistsFlag eq false` guard of `model/validation/Product.json:L12` has to be
   * evaluated by the real validator, and the setting/comment cleanup collaborators have to be the real
   * ones so their ordering after a successful delete is observable rather than asserted by fiat.
   */
  const productBaseService: ProductBaseService = new BaseService<Product, ProductPropertyName>({
    validator,
    ruleSet: productValidationRuleSet,
    propertyDescriptors: PRODUCT_PROPERTY_DESCRIPTORS,
    populationAuthorization: populationAuthorization.populationAuthorization,
    persist: persistence.seams.persist,
    remove: persistence.seams.remove,
    settingCleanup: persistence.seams.settingCleanup,
    commentCleanup: persistence.seams.commentCleanup,
    resolveDeleteSubject: async (candidate: Product): Promise<Product> => {
      await candidate.getTransactionExistsFlag(transactionChecker);
      return candidate;
    },
  });

  /**
   * A recording literal rather than a real `BaseService<ManagedEntity<ProductType>, …>`, because the
   * product-type side has no ready-made property-descriptor set: `ProductType` exposes only
   * `createProductTypePropertyDescriptorSet(collaborators)`, which needs six collaborators that reach
   * straight into out-of-scope domains. The landed collaborator type is `Pick<BaseService<…>, 'save'>`
   * precisely so this seam can be exactly one member wide, and the prompt permits a tiny test-local
   * object where the support module has no exact one-off shape.
   */
  const productTypeSaves: ProductTypeSaveRecord[] = [];
  const productTypeBaseService: ProductTypeBaseService = {
    save: (
      entity: ProductTypeWithErrorState,
      data: Record<string, unknown> = {},
    ): Promise<ProductTypeWithErrorState> => {
      productTypeSaves.push(Object.freeze({ entity, data }));
      if (options.productTypeSaveFailure !== undefined) {
        return Promise.reject(options.productTypeSaveFailure);
      }
      /*
       * A validation failure resolves, it does not reject, and this double has to model that or the
       * cases built on it would certify a contract the real collaborator no longer has. The landed
       * `BaseService.save` attaches the accumulated findings to the entity's own bag and returns the
       * same instance — `org/Hibachi/HibachiService.cfc:L133` gates persistence on
       * `!arguments.entity.hasErrors()`, reading that bag. So the findings arrive on the entity here too.
       */
      if (options.productTypeSaveFindings !== undefined) {
        entity.addErrors(options.productTypeSaveFindings);
      }
      return Promise.resolve(entity);
    },
  };

  const optionService = new OptionService(optionRepository.repository, optionSmartList.smartList);

  const skuService = new SkuService(
    skuRepository.repository,
    optionService,
    subscriptionTerms.subscriptionTerms,
    accessContents.accessContents,
    imagePaths.imagePaths,
    productSmartList.smartList,
    validator,
    productTypeRoots.resolver,
    (sku: Sku) => createDefaultSkuDelegate(sku),
    /* — generous, so no case in this suite depends on the ceiling. */
    GENEROUS_COMBINATION_BUDGET,
  );

  const collaborators: ProductServiceCollaborators = {
    productRepository: productRepository.repository,
    skuRepository: skuRepository.repository,
    skuService,
    optionService,
    baseService: options.baseService ?? productBaseService,
    productTypeBaseService,
    validator: options.validator ?? validator,
    settings: settings.resolver,
    accountContext: accountContext.accountContext,
    smartListQueryPort: productSmartList.smartList,
    subscriptionTermPort: subscriptionTerms.subscriptionTerms,
    productTypeRootResolver: productTypeRoots.resolver,
    productPropertyDescriptors: PRODUCT_PROPERTY_DESCRIPTORS,
    populationAuthorization: populationAuthorization.populationAuthorization,
    isUrlTitleAvailable,
    /*
     * — the probe ceiling both derivations resolve against; generous here, so the cases that
     * assert the slug transformation and the suffix sequence are unaffected. The dedicated block that
     * asserts the ceiling itself states its own figure.
     */
    urlTitleProbeBudget: options.urlTitleProbeBudget ?? GENEROUS_URL_TITLE_PROBE_BUDGET,
    persistProduct: productPersister.persist,
    defaultSkuIdReader: (delegate: object): string => defaultSkuIdsByDelegate.get(delegate) ?? '',
    /*
     * — the real hydration reader. Every product type in this suite is hand-built, so the reader
     * answers `undefined`, `saveProductType` skips the inheritance load and issues no extra statement,
     * and every existing expectation here is untouched. A case that wants the load supplies the parent
     * on the `parentProductType` slot, which still wins ahead of any read.
     */
    parentProductTypeIdReader: readHydratedParentProductTypeID,
  };

  // Not wired, and each omission is evidenced rather than assumed.
  // - `productTypeDAO` — declared at `model/service/ProductService.cfc:L54`, zero call sites.
  // - `contentService` — declared at `model/service/ProductService.cfc:L57`, zero call sites.
  // - `getHibachiTagService()` — `:L66` framework plumbing, excluded with the rest of `org/Hibachi/**`.
  // - `integrationServices/google/controllers/feed.cfc:L51 productService` — a fifth dead injection,
  // repo-wide reference only; this file imports nothing from the Google adapter.

  return {
    service: new ProductService(collaborators),
    optionService,
    skuService,
    skuCalls: skuRepository.calls,
    persistedSkus: skuRepository.persisted,
    productCalls: productRepository.calls,
    savedProducts: productRepository.saved,
    persistedProducts: (): readonly Product[] => productPersister.calls.map((call) => call.entity),
    removedProducts: persistence.removed,
    settingCleanups: persistence.settingCleanups,
    commentCleanups: persistence.commentCleanups,
    smartListQueries: productSmartList.queries,
    optionQueries: optionSmartList.queries,
    urlTitleProbes: urlTitles.calls,
    settingReads: settings.calls,
    productTypeSaves,
    validations: validator.invocations,
    accountReads: (): number => accountContext.callCount(),
    attachDefaultSku: (product: Product, sku: Sku): ProductDefaultSkuDelegate => {
      const delegate = createDefaultSkuDelegate(sku);
      defaultSkuIdsByDelegate.set(delegate, sku.skuID);
      product.defaultSku = delegate;
      return delegate;
    },
  };
}

// loadDataFromFile.

describe('loadDataFromFile — the import boundary', () => {
  /** M1 note, recorded at the point of test. */
  it('NET-NEW: defaults textQualifier to the empty string and forwards both arguments in source order', async () => {
    const forwarded: { readonly fileURL: string; readonly textQualifier: string | undefined }[] =
      [];
    const onImport: ProductImportHandler = (fileURL, textQualifier) => {
      forwarded.push(Object.freeze({ fileURL, textQualifier }));
      return Promise.resolve();
    };
    const harness = buildHarness({ onImport });

    // `model/service/ProductService.cfc:L65` declares `string textQualifier = ""`.
    const answer = await harness.service.loadDataFromFile('/import/catalog.txt');

    expect(answer).toBeUndefined();
    expect(forwarded).toEqual([{ fileURL: '/import/catalog.txt', textQualifier: '' }]);

    const importCalls = harness.productCalls.filter(isProductCall('importFromFile'));
    expect(importCalls).toHaveLength(1);
    expect(requireAt(importCalls, 0).fileURL).toBe('/import/catalog.txt');
    expect(requireAt(importCalls, 0).textQualifier).toBe('');
  });

  it('NET-NEW: forwards an explicit text qualifier positionally, second, exactly as :L67 does', async () => {
    const harness = buildHarness();

    await harness.service.loadDataFromFile('/import/tab.txt', '"');

    const importCalls = harness.productCalls.filter(isProductCall('importFromFile'));
    expect(importCalls).toHaveLength(1);
    // Order matters: fileURL first, textQualifier second — `getProductDAO().loadDataFromFile(
    // arguments.fileURL, arguments.textQualifier)` at `model/service/ProductService.cfc:L67`.
    expect(requireAt(importCalls, 0)).toMatchObject({
      fileURL: '/import/tab.txt',
      textQualifier: '"',
    });
  });

  it('NET-NEW: surfaces an import failure instead of swallowing it, so a partial import is visible', async () => {
    const failure = new Error('the import stream ended mid-row');
    const harness = buildHarness({ onImport: () => Promise.reject(failure) });

    // M3 again: because the legacy commits per row, a mid-file failure is exactly the case that leaves
    // the catalog half-written, so the rejection must reach the caller rather than be absorbed here.
    await expect(harness.service.loadDataFromFile('/import/broken.txt')).rejects.toBe(failure);
  });

  /*
   * There is no third argument, and its absence is asserted once here rather than assumed.
   */
  it('NET-NEW: passes exactly TWO arguments to the port — no options, no signal, no invented budget', async () => {
    const harness = buildHarness();

    await harness.service.loadDataFromFile('/import/catalog.txt', '"');

    const importCalls = harness.productCalls.filter(isProductCall('importFromFile'));
    expect(importCalls).toHaveLength(1);

    /*
     * The recorded call's own key set is the assertion, because it fails if a third argument is ever
     * reintroduced — by name, and without needing a case per field. `member` is the double's own
     * discriminator; `fileURL` and `textQualifier` are the legacy's two.
     */
    expect(Object.keys(requireAt(importCalls, 0)).sort()).toEqual(
      ['fileURL', 'member', 'textQualifier'].sort(),
    );
    expect(requireAt(importCalls, 0)).toMatchObject({
      fileURL: '/import/catalog.txt',
      textQualifier: '"',
    });
  });

  it('NET-NEW: the two arguments reach the import HANDLER as well, in source order and unrewritten', async () => {
    const seen: (readonly [string, string | undefined])[] = [];
    const onImport: ProductImportHandler = (fileURL, textQualifier) => {
      seen.push([fileURL, textQualifier]);
      return Promise.resolve();
    };
    const harness = buildHarness({ onImport });

    await harness.service.loadDataFromFile('/import/catalog.txt', '"');

    /*
     * The recorded call and the handler are two independent observation points on the same arguments, and
     * asserting both closes the gap a double that recorded one thing and forwarded another would leave.
     * `:L67` is `getProductDAO().loadDataFromFile(arguments.fileURL, arguments.textQualifier)` — positional,
     * in that order.
     */
    expect(seen).toEqual([['/import/catalog.txt', '"']]);
  });

  it('NET-NEW: forwards a hostile location UNCHANGED, holding no policy of its own', async () => {
    const harness = buildHarness();
    const hostile = 'file:///etc/passwd.csv?x=%2F+1';

    await harness.service.loadDataFromFile(hostile);

    /*
     * TODO(parity) — no gate of this port's own judges the location, here or downstream. This port
     * authors no scheme, host or address rule, because `model/dao/ProductDAO.cfc:L87` retrieves
     * whatever it is handed and AAP §0.6.7.7 authorises exactly one behavioural departure (D18).
     * The one thing that is mandatory is that the injected `ProductImportSourcePolicy` be consulted
     * at the retrieval seam in `src/adapters/mysql/MySqlProductRepository.ts` before any read
     * member can see the location — so what a hostile location meets is the operator's policy, and
     * the residual CWE-918 surface is carried rather than repaired.
     */
    const importCalls = harness.productCalls.filter(isProductCall('importFromFile'));
    expect(importCalls).toHaveLength(1);
    expect(requireAt(importCalls, 0).fileURL).toBe(hostile);
    expect(requireAt(importCalls, 0).textQualifier).toBe('');
  });

  it("NET-NEW: propagates the adapter's failure without translating or absorbing it", async () => {
    /*
     * The error raised here is the one the shipped reader actually raises. `unresolvableProductImportSourceReader`
     * declines every member — `validateSource` included — with a `NotImplementedError`, because the legacy
     * retrieval at `model/dao/ProductDAO.cfc:L87` resolves a bean declared nowhere and its `new http()`
     * fallback is commented out, so no location is retrievable at all. There is no dedicated rejection
     * error: what a location is judged against is the operator's policy, and this port authors no grounds
     * of its own to report.
     */
    const failure = new NotImplementedError(
      'ProductImportSourcePolicy.validateSource',
      'no retrieval is performed, so no location can be validated',
      { context: { fileURL: 'file:///etc/passwd.csv' } },
    );
    const harness = buildHarness({ onImport: () => Promise.reject(failure) });

    /*
     * The service adds no catch, no re-wrap and no fallback, so the adapter's failure reaches the handler
     * with its public presentation intact — which is what lets `httpResponse` classify it at all.
     * Identity, not shape: a re-wrap would lose `getPublicError` and it would present as an
     * unclassified 500.
     */
    await expect(harness.service.loadDataFromFile('file:///etc/passwd.csv')).rejects.toBe(failure);
  });

  /*
   * TODO(parity) — no scheme, credential or address-literal refusal exists in the subtree, matching
   * `:L67`.
   */
  it('NET-NEW: forwards a hostile-looking location BYTE-FOR-BYTE, neither refusing nor rewriting it', async () => {
    const harness = buildHarness();

    /*
     * Each of these is refused downstream, and each is a shape a normaliser would be tempted to touch:
     * Mixed case, a trailing dot on the host, surrounding whitespace, embedded credentials, an
     * IPv4-mapped IPv6 host, and a percent-encoded path segment. The service must hand every one on
     * unchanged.
     */
    const locations: readonly string[] = [
      'HTTP://169.254.169.254/latest/meta-data/',
      '  https://feeds.example/catalog.csv  ',
      'https://operator:secret@feeds.example/catalog.csv',
      'http://[::ffff:127.0.0.1]/catalog.csv',
      'https://feeds.example./catalog.csv',
      'https://feeds.example/cat%2Falog.csv?since=1#top',
      'file:///etc/passwd',
    ];

    for (const location of locations) {
      await harness.service.loadDataFromFile(location);
    }

    /*
     * Two things at once, and both matter. The forwarded list being identical to the supplied list
     * proves no rewriting; the list being complete proves no refusal — this member does not short-circuit
     * on a location it dislikes, because deciding that is not its job and a second opinion here would be
     * the drifting copy described above.
     */
    const importCalls = harness.productCalls.filter(isProductCall('importFromFile'));
    expect(importCalls.map((call) => call.fileURL)).toEqual(locations);
  });

  it('NET-NEW: adds no policy argument to the port call, so nothing here configures the refusals', async () => {
    const harness = buildHarness();

    await harness.service.loadDataFromFile('https://feeds.example/catalog.csv');

    /*
     * A `ProductImportSourcePolicy` on the port — allowed schemes, allowed hosts, byte cap,
     * timeout, redirect count — would have to be supplied here. Four of those five are configurable
     * figures the legacy source never states, so every possible value of each is invented (AAP
     * §0.7.3, IR-12). The controls that do exist are fixed literals, and this member passes exactly
     * the two arguments `:L67` passes: no policy of any kind and no invocation-scoped controls.
     */
    const importCalls = harness.productCalls.filter(isProductCall('importFromFile'));
    expect(importCalls).toHaveLength(1);
    expect(Object.keys(requireAt(importCalls, 0)).sort()).toEqual(
      ['fileURL', 'member', 'textQualifier'].sort(),
    );
  });
});

// getFormattedOptionGroups.

describe('getFormattedOptionGroups — the option-group projection', () => {
  /** TODO(parity) D10 — model/service/ProductService.cfc:L73,L75. */
  it('NET-NEW: answers an ARRAY of name-and-options entries per AAP §0.4.2.1 (:L71-:L79)', async () => {
    const sizeGroup = buildOptionGroup({
      optionGroupID: physicalID('og-size'),
      optionGroupName: 'Size',
    });
    const colorGroup = buildOptionGroup({
      optionGroupID: physicalID('og-color'),
      optionGroupName: 'Color',
    });
    const small = buildOption({ optionID: physicalID('o-small'), optionName: 'Small' });
    const medium = buildOption({ optionID: physicalID('o-medium'), optionName: 'Medium' });
    const red = buildOption({ optionID: physicalID('o-red'), optionName: 'Red' });

    const harness = buildHarness({
      optionCatalog: {
        optionGroups: [sizeGroup, colorGroup],
        optionsByOptionGroupID: {
          [physicalID('og-size')]: [small, medium],
          [physicalID('og-color')]: [red],
        },
      },
    });
    const product = buildProduct({ productID: physicalID('p-formatted') });

    const formatted = await harness.service.getFormattedOptionGroups(product);

    // A keyed record, not an array. `model/service/ProductService.cfc:L71` initialises a CFML
    // struct and `:L76` keys it by `getOptionGroupName()`, so TR-1 tightens the loose `any` return
    // to that shape. Answering `FormattedOptionGroup[]` on the reading that AAP §0.4.2.1's
    // tabulated array outranks TR-1 would contradict the legacy struct, so the array shape is
    // asserted against here rather than left to chance.
    expect(Array.isArray(formatted)).toBe(false);

    // The key is the group name. Order is first-seen group order: `Size` was yielded first.
    expect(groupNames(formatted)).toEqual(['Size', 'Color']);
    expect(requireGroup(formatted, 'Size')).toEqual([
      { name: 'Small', value: physicalID('o-small') },
      { name: 'Medium', value: physicalID('o-medium') },
    ]);
    expect(requireGroup(formatted, 'Color')).toEqual([{ name: 'Red', value: physicalID('o-red') }]);

    // And no identifier is published alongside the name (AAP §0.7.3). `:L76` maps a name straight to the option
    // list, so each value is that bare list — an entry carrying `optionGroupID`, or wrapping the list in an
    // object, would report a shape the legacy struct cannot hold.
    expect(formatted).toStrictEqual({
      Size: [
        { name: 'Small', value: physicalID('o-small') },
        { name: 'Medium', value: physicalID('o-medium') },
      ],
      Color: [{ name: 'Red', value: physicalID('o-red') }],
    });
  });

  it('NET-NEW: the values are OptionService bare-option-name projections, never the DAO composite label', async () => {
    const sizeGroup = buildOptionGroup({
      optionGroupID: physicalID('og-size'),
      optionGroupName: 'Size',
    });
    const small = buildOption({ optionID: physicalID('o-small'), optionName: 'Small' });

    const harness = buildHarness({
      optionCatalog: {
        optionGroups: [sizeGroup],
        optionsByOptionGroupID: { [physicalID('og-size')]: [small] },
      },
    });

    const formatted = await harness.service.getFormattedOptionGroups(
      buildProduct({ productID: physicalID('p-projection') }),
    );

    // `model/service/OptionService.cfc:L55-L63` builds `{name = getOptionName(), value = getOptionID()}`
    // — the bare option name. `model/dao/OptionDAO.cfc:L51-L91` builds the composite
    // "<group> - <option>" label instead, and that is a different projection used by a different member.
    // Mixing them up is the easiest way to break this member, so the distinction is asserted.
    const sizeOptions: readonly SelectOption[] = requireGroup(formatted, 'Size');
    expect(requireAt(sizeOptions, 0).name).toBe('Small');
    expect(requireAt(sizeOptions, 0).name).not.toContain(' - ');
  });

  it('NET-NEW: answers an empty RECORD when the product carries no option groups', async () => {
    const harness = buildHarness();

    const formatted = await harness.service.getFormattedOptionGroups(
      buildProduct({ productID: physicalID('p-bare') }),
    );

    // `:L75` iterates `arrayLen(productObjectGroups)` times, which is zero, so nothing is accumulated and
    // `:L79` returns the empty struct `:L71` created. It is empty rather than absent, and it is an object
    // rather than an array — `{}` is what the legacy answers, and a client destructuring by name must not
    // have to special-case the no-groups product.
    expect(formatted).toStrictEqual({});
    expect(Array.isArray(formatted)).toBe(false);
    expect(groupNames(formatted)).toEqual([]);
  });

  it('NET-NEW: two groups sharing a name collide and the LAST write wins (:L77), preserved as observed', async () => {
    const firstSize = buildOptionGroup({
      optionGroupID: physicalID('og-1'),
      optionGroupName: 'Size',
    });
    const secondSize = buildOptionGroup({
      optionGroupID: physicalID('og-2'),
      optionGroupName: 'Size',
    });
    const small = buildOption({ optionID: physicalID('o-small'), optionName: 'Small' });
    const huge = buildOption({ optionID: physicalID('o-huge'), optionName: 'Huge' });

    const harness = buildHarness({
      optionCatalog: {
        optionGroups: [firstSize, secondSize],
        optionsByOptionGroupID: { [physicalID('og-1')]: [small], [physicalID('og-2')]: [huge] },
      },
    });

    const formatted = await harness.service.getFormattedOptionGroups(
      buildProduct({ productID: physicalID('p-collision') }),
    );

    // `:L77` keys the struct by name, so the second group overwrites the first. The port keeps that
    // exactly: the answer holds one entry, it does not re-label by optionGroupID and it does not
    // concatenate the two option lists, because either change would make the member answer something the
    // legacy never answered.
    expect(groupNames(formatted)).toEqual(['Size']);
    expect(requireGroup(formatted, 'Size')).toEqual([
      { name: 'Huge', value: physicalID('o-huge') },
    ]);
  });

  it('NET-NEW: M7 — a second, independently constructed invocation sees none of the first one memoised groups', async () => {
    const firstGroup = buildOptionGroup({
      optionGroupID: physicalID('og-a'),
      optionGroupName: 'Alpha',
    });
    const secondGroup = buildOptionGroup({
      optionGroupID: physicalID('og-b'),
      optionGroupName: 'Beta',
    });
    const alphaOption = buildOption({ optionID: physicalID('o-a'), optionName: 'A' });
    const betaOption = buildOption({ optionID: physicalID('o-b'), optionName: 'B' });

    const first = buildHarness({
      optionCatalog: {
        optionGroups: [firstGroup],
        optionsByOptionGroupID: { [physicalID('og-a')]: [alphaOption] },
      },
    });
    const firstProduct = buildProduct({ productID: physicalID('p-first') });

    expect(groupNames(await first.service.getFormattedOptionGroups(firstProduct))).toEqual([
      'Alpha',
    ]);

    // `Product.getOptionGroups` memoises into the entity, so a repeat call must not re-query the groups
    // while the per-group option lookup, which is not memoised, must run again. That asymmetry is the
    // landed behaviour and it is asserted rather than assumed.
    await first.service.getFormattedOptionGroups(firstProduct);
    // The service derives its own option finders from its smart-list port (`ProductService.ts` wires
    // `createProductOptionFinders(collaborators.smartListQueryPort)`), so both query shapes land on the
    // product stream rather than on the OptionService's own stream.
    const groupQueries = first.smartListQueries.filter(
      (query) => query.entityName === 'SlatwallOptionGroup',
    );
    const optionQueries = first.smartListQueries.filter(
      (query) => query.entityName === 'SlatwallOption',
    );
    expect(groupQueries).toHaveLength(1);
    expect(optionQueries).toHaveLength(2);

    // M7 — nothing survives an invocation boundary. A second service graph over a second entity sees
    // only its own catalog, so no warm-container cache can bleed one product's groups into another's.
    const second = buildHarness({
      optionCatalog: {
        optionGroups: [secondGroup],
        optionsByOptionGroupID: { [physicalID('og-b')]: [betaOption] },
      },
    });
    const secondFormatted = await second.service.getFormattedOptionGroups(
      buildProduct({ productID: physicalID('p-second') }),
    );

    expect(groupNames(secondFormatted)).toEqual(['Beta']);
    expect(requireGroup(secondFormatted, 'Beta')).toEqual([
      { name: 'B', value: physicalID('o-b') },
    ]);
  });

  it('NET-NEW: refuses a nameless option group rather than labelling an entry with undefined (:L76)', async () => {
    const namelessGroup = buildOptionGroup({ optionGroupID: physicalID('og-nameless') });

    const harness = buildHarness({
      optionCatalog: { optionGroups: [namelessGroup], optionsByOptionGroupID: {} },
    });

    await expect(
      harness.service.getFormattedOptionGroups(
        buildProduct({ productID: physicalID('p-nameless') }),
      ),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

// getProductSkusBySelectedOptions (T1 through T5).

describe('getProductSkusBySelectedOptions — option-to-SKU resolution', () => {
  const PRODUCT_ID = physicalID('p-resolve');
  const OTHER_PRODUCT_ID = physicalID('p-other');

  interface ResolutionFixture {
    readonly harness: Harness;
    readonly product: Product;
    readonly redSmall: Sku;
    readonly redLarge: Sku;
    readonly optionless: Sku;
    readonly otherProductRedSmall: Sku;
  }

  function buildResolutionFixture(): ResolutionFixture {
    const sizeGroup = buildOptionGroup({
      optionGroupID: physicalID('og-size'),
      optionGroupName: 'Size',
    });
    const colorGroup = buildOptionGroup({
      optionGroupID: physicalID('og-color'),
      optionGroupName: 'Color',
    });
    const red = buildOption({
      optionID: physicalID('o-red'),
      optionName: 'Red',
      optionGroup: colorGroup,
    });
    const small = buildOption({
      optionID: physicalID('o-small'),
      optionName: 'Small',
      optionGroup: sizeGroup,
    });
    const large = buildOption({
      optionID: physicalID('o-large'),
      optionName: 'Large',
      optionGroup: sizeGroup,
    });

    const product = buildProduct({ productID: PRODUCT_ID });
    const otherProduct = buildProduct({ productID: OTHER_PRODUCT_ID });

    const redSmall = buildSku({
      skuID: physicalID('sku-red-small'),
      product,
      options: [red, small],
    });
    const redLarge = buildSku({
      skuID: physicalID('sku-red-large'),
      product,
      options: [red, large],
    });
    const optionless = buildSku({ skuID: physicalID('sku-optionless'), product });
    const otherProductRedSmall = buildSku({
      skuID: physicalID('sku-other-red-small'),
      product: otherProduct,
      options: [red, small],
    });

    return {
      harness: buildHarness({
        repositorySkus: [redSmall, redLarge, optionless, otherProductRedSmall],
      }),
      product,
      redSmall,
      redLarge,
      optionless,
      otherProductRedSmall,
    };
  }

  it('NET-NEW: forwards both required arguments to the repository member findSkusBySelectedOptions', async () => {
    const fixture = buildResolutionFixture();

    await fixture.harness.service.getProductSkusBySelectedOptions(
      `${physicalID('o-red')},${physicalID('o-small')}`,
      PRODUCT_ID,
    );

    // The name mismatch is preserved, not mechanically renamed. The service member is
    // `getProductSkusBySelectedOptions` (`model/service/ProductService.cfc:L104`) and the collaborator
    // member it delegates to is `getSkusBySelectedOptions` (`model/dao/SkuDAO.cfc:L107`), landing here
    // as the repository's `findSkusBySelectedOptions`. Assuming the two names match is a real way to
    // break the port, so the asymmetry is asserted.
    const calls = fixture.harness.skuCalls.filter(isSkuCall('findSkusBySelectedOptions'));
    expect(calls).toHaveLength(1);
    expect(requireAt(calls, 0).optionIds).toEqual([physicalID('o-red'), physicalID('o-small')]);
    expect(requireAt(calls, 0).productId).toBe(PRODUCT_ID);
  });

  it('NET-NEW: T2 — the product predicate is ALWAYS emitted on this service path, by declaration', async () => {
    const fixture = buildResolutionFixture();

    const matches = await fixture.harness.service.getProductSkusBySelectedOptions(
      `${physicalID('o-red')},${physicalID('o-small')}`,
      PRODUCT_ID,
    );

    // `model/service/ProductService.cfc:L104` declares `required string productID` and `:L105` forwards
    // `argumentCollection=arguments`, and this service is the DAO member's only caller. The DAO's
    // `structKeyExists(arguments,"productID")` branch at `model/dao/SkuDAO.cfc:L120` is therefore always
    // true in practice, so the landed signature types `productID` as required and always emits the
    // predicate. That is a declared translation decision (AAP §0.6.1.3 T2), not a silent branch
    // deletion — the branch was unreachable, and the port says so instead of pretending it existed.
    expect(
      requireAt(fixture.harness.skuCalls.filter(isSkuCall('findSkusBySelectedOptions')), 0)
        .productId,
    ).toBe(PRODUCT_ID);
    expect(matches).toEqual([fixture.redSmall]);
    expect(matches).not.toContain(fixture.otherProductRedSmall);
  });

  it('NET-NEW: T1 — the selected options are conjunctive, never a disjunctive IN list', async () => {
    const fixture = buildResolutionFixture();

    const matches = await fixture.harness.service.getProductSkusBySelectedOptions(
      `${physicalID('o-red')},${physicalID('o-small')}`,
      PRODUCT_ID,
    );

    // `model/dao/SkuDAO.cfc:L112-L118` appends one correlated `and exists (…)` clause per option. A SKU
    // must carry every listed option. Rewriting that as `optionID IN (…)` turns the conjunction into a
    // disjunction and would have returned `redLarge` too.
    expect(matches).toEqual([fixture.redSmall]);
    expect(matches).not.toContain(fixture.redLarge);
  });

  it('NET-NEW: T1 — duplicate option identifiers are retained, not collapsed', async () => {
    const fixture = buildResolutionFixture();

    await fixture.harness.service.getProductSkusBySelectedOptions(
      `${physicalID('o-red')},${physicalID('o-red')}`,
      PRODUCT_ID,
    );

    // The legacy loop appends one clause per list element, so a duplicated entry produces two identical
    // EXISTS clauses. A `GROUP BY … HAVING COUNT(*) = N` rewrite diverges on exactly this input, and a
    // de-duplicating port would change the emitted predicate count. Both are refused.
    expect(
      requireAt(fixture.harness.skuCalls.filter(isSkuCall('findSkusBySelectedOptions')), 0)
        .optionIds,
    ).toEqual([physicalID('o-red'), physicalID('o-red')]);
  });

  it('NET-NEW: T3 — option-less SKUs stay excluded because the vestigial join is load-bearing', async () => {
    const fixture = buildResolutionFixture();

    const matches = await fixture.harness.service.getProductSkusBySelectedOptions('', PRODUCT_ID);

    // `model/dao/SkuDAO.cfc:L108` opens with `inner join sku.options as opt` and never references
    // `opt` in the WHERE clause, which makes the alias look removable. It is not: the join silently
    // excludes option-less SKUs from every result, including this degenerate one.
    expect(matches).toEqual([fixture.redSmall, fixture.redLarge]);
    expect(matches).not.toContain(fixture.optionless);
  });

  it('NET-NEW: T4 — a SKU carrying several matched options is returned once, not once per option', async () => {
    const fixture = buildResolutionFixture();

    const matches = await fixture.harness.service.getProductSkusBySelectedOptions(
      `${physicalID('o-red')},${physicalID('o-small')}`,
      PRODUCT_ID,
    );

    // `model/dao/SkuDAO.cfc:L108` says `select distinct sku`. Without it the join fans out one row per
    // SKU-option pair, and every arity assertion layered above — `Product.getSkuBySelectedOptions`,
    // `Sku.hasUniqueOptions` — breaks.
    expect(matches.filter((sku) => sku === fixture.redSmall)).toHaveLength(1);
    expect(new Set(matches).size).toBe(matches.length);
  });

  it('NET-NEW: T5 — an empty selection is legal and degenerates to every option-bearing SKU of the product', async () => {
    const fixture = buildResolutionFixture();

    const matches = await fixture.harness.service.getProductSkusBySelectedOptions('', PRODUCT_ID);

    // `Product.getSkusBySelectedOptions` defaults the list to `""` and `listLen("")` is zero, so zero
    // EXISTS clauses are appended. Both `Product.getSkuBySelectedOptions` and `Sku.hasUniqueOptions`
    // depend on that degenerate form, so guarding against empty input would break two real callers.
    const calls = fixture.harness.skuCalls.filter(isSkuCall('findSkusBySelectedOptions'));
    expect(requireAt(calls, 0).optionIds).toEqual([]);
    expect(matches).toHaveLength(2);
    expect(matches).toEqual([fixture.redSmall, fixture.redLarge]);
  });
});

// processProductAddOptionGroup (D14, and the unnumbered D10 class).

describe('processProductAddOptionGroup — adding a whole option group', () => {
  const PRODUCT_ID = physicalID('p-add-group');
  const EXISTING_GROUP_ID = physicalID('og-size');
  const NEW_GROUP_ID = physicalID('og-color');

  interface AddOptionGroupFixture {
    readonly harness: Harness;
    readonly product: Product;
    readonly firstSku: Sku;
    readonly secondSku: Sku;
    readonly newGroup: OptionGroup;
    readonly red: Option;
    readonly blue: Option;
    readonly processObject: ProductAddOptionGroup;
  }

  function buildAddOptionGroupFixture(
    overrides: { readonly newGroupOptions?: 'both' | 'none' } = {},
  ): AddOptionGroupFixture {
    const existingGroup = buildOptionGroup({
      optionGroupID: EXISTING_GROUP_ID,
      optionGroupName: 'Size',
      imageGroupFlag: false,
    });
    const small = buildOption({
      optionID: physicalID('o-small'),
      optionName: 'Small',
      optionCode: 'SM',
      optionGroup: existingGroup,
    });
    const large = buildOption({
      optionID: physicalID('o-large'),
      optionName: 'Large',
      optionCode: 'LG',
      optionGroup: existingGroup,
    });

    const newGroup = buildOptionGroup({
      optionGroupID: NEW_GROUP_ID,
      optionGroupName: 'Color',
      imageGroupFlag: true,
    });
    // `buildOption({ optionGroup })` calls `Option.setOptionGroup`, which pushes the option into the
    // group, so `newGroup.getOptions()` is [red, blue] in declaration order — and that order is what
    // decides which single option D14 propagates.
    const red = buildOption({
      optionID: physicalID('o-red'),
      optionName: 'Red',
      optionCode: 'RD',
      ...(overrides.newGroupOptions === 'none' ? {} : { optionGroup: newGroup }),
    });
    const blue = buildOption({
      optionID: physicalID('o-blue'),
      optionName: 'Blue',
      optionCode: 'BL',
      ...(overrides.newGroupOptions === 'none' ? {} : { optionGroup: newGroup }),
    });

    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productType,
    });

    const firstSku = buildSku({
      skuID: physicalID('sku-small'),
      skuCode: 'SM',
      product,
      options: [small],
    });
    const secondSku = buildSku({
      skuID: physicalID('sku-large'),
      skuCode: 'LG',
      product,
      options: [large],
    });

    const processObject: ProductAddOptionGroup = { product, optionGroup: NEW_GROUP_ID };

    return {
      harness: buildHarness({
        settings: [...IMAGE_FILE_NAME_SETTINGS],
        optionCatalog: {
          optionGroups: [existingGroup],
          optionsByOptionGroupID: { [EXISTING_GROUP_ID]: [small, large] },
          resolvableOptionGroups: [existingGroup, newGroup],
        },
        // The unused-group query answers "every group not already on the product", so the pool must
        // hold both for `minCollection: 1` (`model/validation/Product.json:L14`) to be satisfiable.
        repositoryOptionGroups: [existingGroup, newGroup],
        repositorySkus: [firstSku, secondSku],
      }),
      product,
      firstSku,
      secondSku,
      newGroup,
      red,
      blue,
      processObject,
    };
  }

  /**
   * TODO(parity) D14 — model/service/ProductService.cfc:L119.
   *
   * TODO(parity) D10-class — model/service/ProductService.cfc:L118. The enclosing
   * `for(i=1; i<=arrayLen(skus); i++)` declares `i` unscoped, the same leak into the component's shared
   * `variables` scope catalogued as D10 for `getFormattedOptionGroups`. Strict TypeScript block scoping
   * removes the hazard by construction; no shared mutable state is fabricated to reproduce it.
   */
  it('NET-NEW: D14 — adds ONLY the first option of the new group, to EVERY existing SKU (:L119)', async () => {
    const fixture = buildAddOptionGroupFixture();

    await fixture.harness.service.processProductAddOptionGroup(
      fixture.product,
      fixture.processObject,
    );

    expect(fixture.newGroup.getOptions()).toEqual([fixture.red, fixture.blue]);

    // Every existing SKU gains the first option and nothing else.
    expect(fixture.firstSku.getOptions()).toContain(fixture.red);
    expect(fixture.secondSku.getOptions()).toContain(fixture.red);
    expect(fixture.firstSku.getOptions()).not.toContain(fixture.blue);
    expect(fixture.secondSku.getOptions()).not.toContain(fixture.blue);

    // Two SKUs, each holding its original option plus exactly one new one.
    expect(fixture.firstSku.getOptions()).toHaveLength(2);
    expect(fixture.secondSku.getOptions()).toHaveLength(2);
  });

  it('NET-NEW: resolves the group through the explicit getOptionGroup member the IR-1 synthesis replaced', async () => {
    const fixture = buildAddOptionGroupFixture();

    // `model/service/ProductService.cfc:L115` calls `getOptionService().getOptionGroup(...)`, a member
    // that has no source declaration anywhere: `org/Hibachi/HibachiService.cfc:L255-L281` fabricated it
    // at runtime from the `get` prefix. Strict TypeScript has no such facility, so the port declares it
    // and this test proves the declared member is what resolves the group (IR-1, AAP §0.4.2.5).
    const resolved = await fixture.harness.optionService.getOptionGroup(NEW_GROUP_ID);
    expect(resolved).toBe(fixture.newGroup);

    await fixture.harness.service.processProductAddOptionGroup(
      fixture.product,
      fixture.processObject,
    );
    expect(fixture.firstSku.getOptions()).toContain(fixture.red);
  });

  it('NET-NEW: chains updateDefaultImageFileNames with no payload and returns THAT call product (:L123)', async () => {
    const fixture = buildAddOptionGroupFixture();
    const chained = buildProduct({ productID: physicalID('p-returned-by-the-chain') });

    // `:L123` is `arguments.product = this.processProduct(arguments.product, {}, 'updateDefaultImageFileNames');`
    // — an assignment, so the value the chained call answers with is what `:L125` returns. Proving the
    // reassignment needs the chained call to answer with a different object, which is what the typed spy
    // on the landed seam provides. (`jest.mock` is never used in this file; this is a spy on one member
    // of the instance under test.)
    const chainSpy = jest
      .spyOn(fixture.harness.service, 'processProductUpdateDefaultImageFileNames')
      .mockResolvedValue(chained);

    const answer = await fixture.harness.service.processProductAddOptionGroup(
      fixture.product,
      fixture.processObject,
    );

    expect(answer).toBe(chained);
    expect(answer).not.toBe(fixture.product);
    expect(chainSpy).toHaveBeenCalledTimes(1);
    // Empty data and exact context, as the port expresses them. `{}` at `:L123` carried no keys, and the
    // port's chained member takes the product alone — there is no data argument to be non-empty. The
    // context `'updateDefaultImageFileNames'` is likewise fixed by the member's identity rather than by
    // a string, which is the whole point of retiring `process#getClassName()#_#processContext#`.
    expect(requireAt(chainSpy.mock.calls, 0)).toEqual([fixture.product]);
  });

  it('NET-NEW: an empty new group adds nothing yet still proceeds to the chained call', async () => {
    const fixture = buildAddOptionGroupFixture({ newGroupOptions: 'none' });
    const chainSpy = jest.spyOn(
      fixture.harness.service,
      'processProductUpdateDefaultImageFileNames',
    );

    await fixture.harness.service.processProductAddOptionGroup(
      fixture.product,
      fixture.processObject,
    );

    // `:L118` iterates the SKUs regardless, and `:L123` is reached unconditionally, so an option-less
    // group is a legal no-op that still runs the chain rather than an early return.
    expect(fixture.firstSku.getOptions()).toHaveLength(1);
    expect(fixture.secondSku.getOptions()).toHaveLength(1);
    expect(chainSpy).toHaveBeenCalledTimes(1);
  });

  it('NET-NEW: the real chain regenerates every SKU image file name and persists each SKU', async () => {
    const fixture = buildAddOptionGroupFixture();

    await fixture.harness.service.processProductAddOptionGroup(
      fixture.product,
      fixture.processObject,
    );

    // Left unspied, the chained member is observable through its own effects: `Sku.generateImageFileName`
    // contributes one delimiter-plus-option-code segment per option whose group carries
    // `imageGroupFlag`, and only the new Color group does.
    expect(fixture.firstSku.imageFile).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}-RD.jpg`);
    expect(fixture.secondSku.imageFile).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}-RD.jpg`);
    expect(fixture.harness.persistedSkus).toEqual([fixture.firstSku, fixture.secondSku]);
  });

  it('NET-NEW: refuses a process object with no option-group identifier rather than looking up undefined', async () => {
    const fixture = buildAddOptionGroupFixture();
    const emptyProcessObject: ProductAddOptionGroup = { product: fixture.product };

    // `:L115` passes the value straight into the lookup with no guard.
    await expect(
      fixture.harness.service.processProductAddOptionGroup(fixture.product, emptyProcessObject),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('NET-NEW: refuses an unresolvable option-group identifier rather than calling getOptions() on null', async () => {
    const fixture = buildAddOptionGroupFixture();
    const strayProcessObject: ProductAddOptionGroup = {
      product: fixture.product,
      optionGroup: physicalID('og-does-not-exist'),
    };

    await expect(
      fixture.harness.service.processProductAddOptionGroup(fixture.product, strayProcessObject),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('NET-NEW: stops before the body when the addOptionGroup rules refuse the entity', async () => {
    // No unused option group exists, so `model/validation/Product.json:L14`'s `minCollection: 1` fails.
    const existingGroup = buildOptionGroup({
      optionGroupID: EXISTING_GROUP_ID,
      optionGroupName: 'Size',
    });
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({ productID: PRODUCT_ID, productType });
    const sku = buildSku({ skuID: physicalID('sku-only'), product });

    const harness = buildHarness({
      optionCatalog: {
        optionGroups: [existingGroup],
        optionsByOptionGroupID: {},
        resolvableOptionGroups: [existingGroup],
      },
      repositoryOptionGroups: [existingGroup],
      repositorySkus: [sku],
    });
    const processObject: ProductAddOptionGroup = { product, optionGroup: EXISTING_GROUP_ID };

    const answer = await harness.service.processProductAddOptionGroup(product, processObject);

    expect(answer).toBe(product);
    expect(product.hasErrors()).toBe(true);
    expect(product.hasError('unusedProductOptionGroups')).toBe(true);
    // The body never ran: no option was added and nothing was persisted.
    expect(sku.getOptions()).toHaveLength(0);
    expect(harness.persistedSkus).toHaveLength(0);
  });
});

// processProductAddOption (:L128-:L155).

describe('processProductAddOption — adding one option to the SKU set', () => {
  const PRODUCT_ID = physicalID('p-add-option');
  const SIZE_GROUP_ID = physicalID('og-size');
  const COLOR_GROUP_ID = physicalID('og-color');
  const DEFAULT_SKU_PRICE = '100';
  const DEFAULT_SKU_LIST_PRICE = '150';

  interface AddOptionFixture {
    readonly harness: Harness;
    readonly product: Product;
    readonly processObject: ProductAddOption;
    readonly red: Option;
  }

  /**
   * Three existing SKUs, chosen so one fixture exercises all three branches of the `:L140-:L148` walk
   * at once: an option in a different group is listed, an option in the same group as the new one is
   * skipped, and an option whose identifier differs only in case from one already listed is skipped.
   */
  function buildAddOptionFixture(
    overrides: { readonly withListPrice?: boolean } = {},
  ): AddOptionFixture {
    const sizeGroup = buildOptionGroup({
      optionGroupID: SIZE_GROUP_ID,
      optionGroupName: 'Size',
      imageGroupFlag: false,
    });
    const colorGroup = buildOptionGroup({
      optionGroupID: COLOR_GROUP_ID,
      optionGroupName: 'Color',
      imageGroupFlag: false,
    });

    const small = buildOption({
      optionID: physicalID('o-small'),
      optionName: 'Small',
      optionCode: 'SM',
      optionGroup: sizeGroup,
    });
    const large = buildOption({
      optionID: physicalID('o-large'),
      optionName: 'Large',
      optionCode: 'LG',
      optionGroup: sizeGroup,
    });
    const smallShouted = buildOption({
      optionID: physicalID('o-small').toUpperCase(),
      optionName: 'SMALL',
      optionCode: 'SMU',
      optionGroup: sizeGroup,
    });
    const green = buildOption({
      optionID: physicalID('o-green'),
      optionName: 'Green',
      optionCode: 'GR',
      optionGroup: colorGroup,
    });
    const red = buildOption({
      optionID: physicalID('o-red'),
      optionName: 'Red',
      optionCode: 'RD',
      optionGroup: colorGroup,
    });

    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });

    // Order matters: `product.getSkus()` is walked in insertion order, and that fixes the order of the
    // comma-delimited list the member builds.
    const firstSku = buildSku({ skuID: physicalID('sku-1'), product, options: [small, green] });
    buildSku({ skuID: physicalID('sku-2'), product, options: [smallShouted] });
    buildSku({ skuID: physicalID('sku-3'), product, options: [large] });

    const defaultSku = buildSku({
      skuID: physicalID('sku-default'),
      product,
      price: DEFAULT_SKU_PRICE,
      listPrice: DEFAULT_SKU_LIST_PRICE,
      options: [small],
    });

    const harness = buildHarness({
      settings: [...IMAGE_FILE_NAME_SETTINGS],
      optionCatalog: {
        optionGroups: [sizeGroup],
        optionsByOptionGroupID: { [SIZE_GROUP_ID]: [small, large] },
        resolvableOptionGroups: [sizeGroup, colorGroup],
        resolvableOptions: [red, green, small, large, smallShouted],
      },
      // `findUnusedOptions` looks inside the product's existing groups for options no SKU uses, so
      // `large` and `O-SMALL` satisfy `model/validation/Product.json:L13`'s `minCollection: 1`.
      repositoryOptionGroups: [sizeGroup],
      optionRepositorySkus: [firstSku],
      repositorySkus: [firstSku, defaultSku],
    });

    if (overrides.withListPrice === false) {
      // `model/service/ProductService.cfc:L135-L137` only copies the list price when the default SKU
      // has one, so the absent case needs a delegate that answers `undefined` — the support factory's
      // delegate always answers a value because `Sku.getListPrice()` always does.
      product.defaultSku = {
        getPrice: (): ReturnType<ProductDefaultSkuDelegate['getPrice']> => defaultSku.getPrice(),
        getListPrice: (): ReturnType<ProductDefaultSkuDelegate['getListPrice']> => undefined,
        getRenewalPrice: (): ReturnType<ProductDefaultSkuDelegate['getRenewalPrice']> => undefined,
        getCurrencyCode: (): string | undefined => undefined,
        getImageDirectory: (): string => '',
        getImagePath: (): string => '',
        getImage: (): string => '',
        getResizedImagePath: (): string => '',
        getImageExistsFlag: (): boolean => false,
      };
    } else {
      harness.attachDefaultSku(product, defaultSku);
    }

    return { harness, product, processObject: { product, option: physicalID('o-red') }, red };
  }

  it('NET-NEW: builds a comma-delimited option list that STARTS with the new option identifier (:L131)', async () => {
    const fixture = buildAddOptionFixture();
    const createSkus = jest.spyOn(fixture.harness.skuService, 'createSkus').mockResolvedValue(true);

    await fixture.harness.service.processProductAddOption(fixture.product, fixture.processObject);

    expect(createSkus).toHaveBeenCalledTimes(1);
    const [passedProduct, passedData] = requireAt(createSkus.mock.calls, 0);
    expect(passedProduct).toBe(fixture.product);

    // `:L131` seeds the list with `newOption.getOptionID()`, so the new option is first. Then `:L140-:L148`
    // appends. `o-green` is skipped because it shares the new option's group, and `O-SMALL` is skipped
    // because `listFindNoCase` at `:L144` already found `o-small`.
    expect(passedData['options']).toBe(
      `${physicalID('o-red')},${physicalID('o-small')},${physicalID('o-large')}`,
    );
    // The comma-delimited boundary is preserved, not modernised into an array. `:L150` hands the
    // struct straight to `createSkus`, whose merchandise branch parses a CFML list, so converting it
    // here would break the collaborator contract.
    expect(typeof passedData['options']).toBe('string');
  });

  it('NET-NEW: copies the default SKU price, and the list price only when one is present (:L132-:L137)', async () => {
    const withList = buildAddOptionFixture();
    const withListSpy = jest
      .spyOn(withList.harness.skuService, 'createSkus')
      .mockResolvedValue(true);

    await withList.harness.service.processProductAddOption(
      withList.product,
      withList.processObject,
    );

    const [, withListData] = requireAt(withListSpy.mock.calls, 0);
    // `ExactDecimal` is a branded string at runtime, so the copied values compare as strings.
    expect(withListData['price']).toBe(DEFAULT_SKU_PRICE);
    expect(withListData['listPrice']).toBe(DEFAULT_SKU_LIST_PRICE);

    const withoutList = buildAddOptionFixture({ withListPrice: false });
    const withoutListSpy = jest
      .spyOn(withoutList.harness.skuService, 'createSkus')
      .mockResolvedValue(true);

    await withoutList.harness.service.processProductAddOption(
      withoutList.product,
      withoutList.processObject,
    );

    const [, withoutListData] = requireAt(withoutListSpy.mock.calls, 0);
    expect(withoutListData['price']).toBe(DEFAULT_SKU_PRICE);
    // `:L135` guards the assignment, so the key is absent rather than present-and-undefined.
    expect('listPrice' in withoutListData).toBe(false);
  });

  it('NET-NEW: lists options from OTHER groups only, and never the same option twice case-insensitively', async () => {
    const fixture = buildAddOptionFixture();
    const createSkus = jest.spyOn(fixture.harness.skuService, 'createSkus').mockResolvedValue(true);

    await fixture.harness.service.processProductAddOption(fixture.product, fixture.processObject);

    const [, passedData] = requireAt(createSkus.mock.calls, 0);
    const listed = String(passedData['options']).split(',');

    // `:L144`'s two clauses, asserted separately.
    expect(listed).not.toContain(physicalID('o-green')); // same group as the new option
    expect(listed).not.toContain(physicalID('o-small').toUpperCase()); // already listed, differing only in case
    expect(listed).toEqual([physicalID('o-red'), physicalID('o-small'), physicalID('o-large')]);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('NET-NEW: resolves the option through the explicit getOption member, then chains updateDefaultImageFileNames and returns its product', async () => {
    const fixture = buildAddOptionFixture();
    jest.spyOn(fixture.harness.skuService, 'createSkus').mockResolvedValue(true);
    const chained = buildProduct({ productID: physicalID('p-chained-add-option') });
    const chainSpy = jest
      .spyOn(fixture.harness.service, 'processProductUpdateDefaultImageFileNames')
      .mockResolvedValue(chained);

    // `getOption` is a second IR-1 synthesis victim: `model/service/ProductService.cfc:L130` calls it
    // and no source file declares it.
    expect(await fixture.harness.optionService.getOption(physicalID('o-red'))).toBe(fixture.red);

    const answer = await fixture.harness.service.processProductAddOption(
      fixture.product,
      fixture.processObject,
    );

    // `:L152` reassigns from the chained call and `:L154` returns it.
    expect(answer).toBe(chained);
    expect(requireAt(chainSpy.mock.calls, 0)).toEqual([fixture.product]);
  });

  it('NET-NEW: refuses a missing option identifier, an unresolvable one, and a group-less option', async () => {
    const fixture = buildAddOptionFixture();
    jest.spyOn(fixture.harness.skuService, 'createSkus').mockResolvedValue(true);

    // `:L130` dereferences the lookup result without a guard in both directions.
    await expect(
      fixture.harness.service.processProductAddOption(fixture.product, {
        product: fixture.product,
      }),
    ).rejects.toBeInstanceOf(DomainError);

    const strayFixture = buildAddOptionFixture();
    jest.spyOn(strayFixture.harness.skuService, 'createSkus').mockResolvedValue(true);
    await expect(
      strayFixture.harness.service.processProductAddOption(strayFixture.product, {
        product: strayFixture.product,
        option: physicalID('o-nowhere'),
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('NET-NEW: refuses to run when the product has no default SKU to read a price from (:L132)', async () => {
    const fixture = buildAddOptionFixture();
    jest.spyOn(fixture.harness.skuService, 'createSkus').mockResolvedValue(true);
    delete fixture.product.defaultSku;

    // `:L132` is `arguments.product.getDefaultSku().getPrice()` — no guard, so a product without one
    // raises rather than silently defaulting the price to zero.
    await expect(
      fixture.harness.service.processProductAddOption(fixture.product, fixture.processObject),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('NET-NEW: stops before the body when the addOption rules refuse the entity', async () => {
    const sizeGroup = buildOptionGroup({ optionGroupID: SIZE_GROUP_ID, optionGroupName: 'Size' });
    const small = buildOption({
      optionID: physicalID('o-small'),
      optionName: 'Small',
      optionGroup: sizeGroup,
    });
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({ productID: PRODUCT_ID, productType });
    const sku = buildSku({ skuID: physicalID('sku-uses-everything'), product, options: [small] });

    // Every option of the only group is already in use, so `unusedProductOptions` is empty and
    // `model/validation/Product.json:L13` refuses the entity.
    const harness = buildHarness({
      optionCatalog: {
        optionGroups: [sizeGroup],
        optionsByOptionGroupID: { [SIZE_GROUP_ID]: [small] },
        resolvableOptions: [small],
      },
      repositoryOptionGroups: [sizeGroup],
      optionRepositorySkus: [sku],
    });
    const createSkus = jest.spyOn(harness.skuService, 'createSkus');

    const answer = await harness.service.processProductAddOption(product, {
      product,
      option: physicalID('o-small'),
    });

    expect(answer).toBe(product);
    expect(product.hasError('unusedProductOptions')).toBe(true);
    expect(createSkus).not.toHaveBeenCalled();
  });
});

// Agent prompt phase 7c — processProduct_updateSkus(product, processObject)
// source: model/service/ProductService.cfc:L216-L233
// rules: model/validation/Product_UpdateSkus.json.

describe('processProductUpdateSkus — the flag-gated bulk price update', () => {
  const PRODUCT_ID = physicalID('p-update-skus');
  const SEEDED_PRICE = 10;
  const SEEDED_LIST_PRICE = 15;

  interface UpdateSkusFixture {
    readonly product: Product;
    readonly first: Sku;
    readonly second: Sku;
  }

  /** Builds a product carrying two persisted SKUs at a known price and list price. */
  function buildFixture(options: { readonly identified?: boolean } = {}): UpdateSkusFixture {
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: 'Merchandise',
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product =
      options.identified === false
        ? buildProduct({ productID: PRODUCT_ID, productType })
        : buildProduct({
            productID: PRODUCT_ID,
            productName: TEST_MERCHANDISE_PRODUCT_NAME,
            productCode: TEST_MERCHANDISE_PRODUCT_CODE,
            productType,
          });
    const first = buildSku({
      skuID: physicalID('sku-update-1'),
      skuCode: `${TEST_MERCHANDISE_PRODUCT_CODE}-1`,
      price: SEEDED_PRICE,
      listPrice: SEEDED_LIST_PRICE,
      product,
    });
    const second = buildSku({
      skuID: physicalID('sku-update-2'),
      skuCode: `${TEST_MERCHANDISE_PRODUCT_CODE}-2`,
      price: SEEDED_PRICE,
      listPrice: SEEDED_LIST_PRICE,
      product,
    });

    return { product, first, second };
  }

  it('NET-NEW: applies the new price and list price to EVERY SKU, then persists each one (:L218-:L231)', async () => {
    const { product, first, second } = buildFixture();
    const harness = buildHarness();

    // Declared through the landed process-object type rather than inferred from the literal, so the four
    // data properties of `model/process/Product_UpdateSkus.cfc:L52-L55` are checked against the ported
    // interface at compile time: a renamed, dropped or mistyped property fails here instead of quietly
    // passing an extra key the member would ignore.
    const processObject: ProductUpdateSkus = {
      product,
      updatePriceFlag: 1,
      price: 25,
      updateListPriceFlag: 1,
      listPrice: 40,
    };

    const answer = await harness.service.processProductUpdateSkus(product, processObject);

    expect(answer).toBe(product);
    expect(first.getPrice()).toBe('25');
    expect(first.getListPrice()).toBe('40');
    expect(second.getPrice()).toBe('25');
    expect(second.getListPrice()).toBe('40');

    // `:L229-:L231` walks the SKUs a second time to persist them, so every SKU is written exactly
    // once and the writes happen after the whole set has been mutated — not interleaved with it.
    expect(harness.persistedSkus).toEqual([first, second]);
  });

  it('NET-NEW: changes the price only when updatePriceFlag is set, and the list price only when updateListPriceFlag is set', async () => {
    const priceOnly = buildFixture();
    const priceOnlyHarness = buildHarness();

    await priceOnlyHarness.service.processProductUpdateSkus(priceOnly.product, {
      product: priceOnly.product,
      updatePriceFlag: 1,
      price: 25,
      updateListPriceFlag: 0,
      listPrice: 40,
    });

    expect(priceOnly.first.getPrice()).toBe('25');
    expect(priceOnly.first.getListPrice()).toBe(String(SEEDED_LIST_PRICE));

    // Fresh product, fresh service, fresh repository: the mirrored case shares no state with the one
    // above, so neither can mask the other by leaving a mutated SKU behind.
    const listPriceOnly = buildFixture();
    const listPriceOnlyHarness = buildHarness();

    await listPriceOnlyHarness.service.processProductUpdateSkus(listPriceOnly.product, {
      product: listPriceOnly.product,
      updatePriceFlag: 0,
      price: 25,
      updateListPriceFlag: 1,
      listPrice: 40,
    });

    expect(listPriceOnly.first.getPrice()).toBe(String(SEEDED_PRICE));
    expect(listPriceOnly.first.getListPrice()).toBe('40');

    // Both SKUs are still persisted in each case: `:L229` re-walks the whole set unconditionally,
    // and does not skip the SKUs whose flag was off.
    expect(priceOnlyHarness.persistedSkus).toHaveLength(2);
    expect(listPriceOnlyHarness.persistedSkus).toHaveLength(2);
  });

  it('NET-NEW: casts the flags the way CFML casts them, so the STRING "0" and "no" do NOT update (:L222/:L226)', async () => {
    // The single most likely silent divergence in this member. JavaScript truthiness treats the
    // string "0" as true; CFML does not. `"1"`/`"0"` are what a form post actually delivers, which is
    // why the source-representative string form is asserted alongside the numeric form.
    const numericStrings = buildFixture();
    const numericStringHarness = buildHarness();

    await numericStringHarness.service.processProductUpdateSkus(numericStrings.product, {
      product: numericStrings.product,
      updatePriceFlag: '1',
      price: '25',
      updateListPriceFlag: '0',
      listPrice: '40',
    });

    expect(numericStrings.first.getPrice()).toBe('25');
    expect(numericStrings.first.getListPrice()).toBe(String(SEEDED_LIST_PRICE));

    const wordStrings = buildFixture();
    const wordStringHarness = buildHarness();

    await wordStringHarness.service.processProductUpdateSkus(wordStrings.product, {
      product: wordStrings.product,
      updatePriceFlag: 'yes',
      price: '25',
      updateListPriceFlag: 'no',
      listPrice: '40',
    });

    expect(wordStrings.first.getPrice()).toBe('25');
    expect(wordStrings.first.getListPrice()).toBe(String(SEEDED_LIST_PRICE));
  });

  it('NET-NEW: an empty SKU list is a no-op that still returns the product (:L220)', async () => {
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });
    const harness = buildHarness();

    const answer = await harness.service.processProductUpdateSkus(product, {
      product,
      updatePriceFlag: 1,
      price: 25,
      updateListPriceFlag: 1,
      listPrice: 40,
    });

    // `:L220` guards the whole body on `arrayLen(...)`, so an option-less, SKU-less product neither
    // raises nor writes. The flags are never even read, which matters for the absent-flag case below.
    expect(answer).toBe(product);
    expect(product.hasErrors()).toBe(false);
    expect(harness.skuCalls.filter(isSkuCall('persistSku'))).toHaveLength(0);
  });

  it('NET-NEW: the two Product_UpdateSkus rules declare no contexts and no minValue', () => {
    const rules = productUpdateSkusValidationRuleSet.properties.flatMap((property) => [
      ...property.rules,
    ]);

    expect(
      productUpdateSkusValidationRuleSet.properties.map((property) => property.propertyIdentifier),
    ).toEqual(['price', 'listPrice']);
    expect(rules).toHaveLength(2);

    for (const rule of rules) {
      // No `contexts` key at all — not an empty one. That is what makes these rules apply in every
      // context, and it is the difference from `model/validation/Product.json`, where every rule names
      // its contexts explicitly.
      expect(Object.prototype.hasOwnProperty.call(rule, 'contexts')).toBe(false);
      expect(rule.conditions).toBeDefined();

      // The constraint list is enumerated exhaustively rather than probed, so a `minValue` added
      // later cannot slip past. `model/validation/Product_UpdateSkus.json` declares neither a minimum
      // nor a maximum for either property.
      expect(rule.constraints.map((constraint) => constraint.constraintType)).toEqual([
        'dataType',
        'required',
      ]);
    }
  });

  it('NET-NEW: applies zero and negative prices, because no minValue constraint exists', async () => {
    const { product, first, second } = buildFixture();
    const harness = buildHarness();

    const answer = await harness.service.processProductUpdateSkus(product, {
      product,
      updatePriceFlag: 1,
      price: 0,
      updateListPriceFlag: 1,
      listPrice: -5,
    });

    expect(answer).toBe(product);
    expect(product.hasErrors()).toBe(false);
    expect(first.getPrice()).toBe('0');
    expect(first.getListPrice()).toBe('-5');
    expect(second.getPrice()).toBe('0');
    expect(harness.persistedSkus).toHaveLength(2);
  });

  it('NET-NEW: refuses the process object when an active flag has no value to apply, and writes nothing', async () => {
    const { product, first } = buildFixture();
    const harness = buildHarness();

    // `updatePriceFlag` activates the `showPrice` condition, so the `required` constraint on `price`
    // is evaluated — and there is no price.
    const answer = await harness.service.processProductUpdateSkus(product, {
      product,
      updatePriceFlag: 1,
      updateListPriceFlag: 0,
    });

    expect(answer).toBe(product);
    expect(product.hasErrors()).toBe(true);

    // A rejected process object surfaces on the entity as one context-named entry under the shared
    // process-objects key — the legacy shape, so downstream error reporting stays comparable.
    expect(product.getError(PROCESS_OBJECTS_ERROR_KEY)).toEqual(['updateSkus']);

    // The early return at `:L219` means no SKU was touched and nothing was written.
    expect(first.getPrice()).toBe(String(SEEDED_PRICE));
    expect(harness.persistedSkus).toHaveLength(0);
  });

  it('NET-NEW: evaluates the numeric data type only while the flag is active, and leaves an inactive property entirely unvalidated', async () => {
    const refused = buildFixture();
    const refusedHarness = buildHarness();

    const refusedAnswer = await refusedHarness.service.processProductUpdateSkus(refused.product, {
      product: refused.product,
      updatePriceFlag: 1,
      price: 'free',
      updateListPriceFlag: 0,
    });

    expect(refusedAnswer).toBe(refused.product);
    expect(refused.product.getError(PROCESS_OBJECTS_ERROR_KEY)).toEqual(['updateSkus']);
    expect(refused.first.getPrice()).toBe(String(SEEDED_PRICE));
    expect(refusedHarness.persistedSkus).toHaveLength(0);

    // Same garbage value, flag off. The condition is unmet, so the rule is skipped and the property is
    // never validated at all — not validated-and-passed. The body then leaves the SKU alone, so the
    // unvalidated garbage is unreachable rather than merely tolerated.
    const ignored = buildFixture();
    const ignoredHarness = buildHarness();

    const ignoredAnswer = await ignoredHarness.service.processProductUpdateSkus(ignored.product, {
      product: ignored.product,
      updatePriceFlag: 0,
      price: 'free',
      updateListPriceFlag: 0,
      listPrice: 'also free',
    });

    expect(ignoredAnswer).toBe(ignored.product);
    expect(ignored.product.hasErrors()).toBe(false);
    expect(ignored.first.getPrice()).toBe(String(SEEDED_PRICE));
    expect(ignored.first.getListPrice()).toBe(String(SEEDED_LIST_PRICE));
    expect(ignoredHarness.persistedSkus).toHaveLength(2);
  });

  it('NET-NEW: an ABSENT flag passes validation untouched and then raises exactly where CFML raises (:L222)', async () => {
    const { product, first } = buildFixture();
    const harness = buildHarness();

    // No flags at all, and a non-numeric list price. Validation adds nothing, because both conditions
    // read an absent flag and neither can be met — which is the "absent flag leaves the value entirely
    // unvalidated" half. The body then reads the same absent flag inside an `if`, where CFML raises on
    // null; `model/process/Product_UpdateSkus.cfc:L49` declares the property with no default, so the
    // legacy really does reach that raise.
    const error = await captureDomainError(
      harness.service.processProductUpdateSkus(product, {
        product,
        listPrice: 'not a number',
      }),
    );

    expect(error.context).toEqual({
      flagName: 'updatePriceFlag',
      locator: 'model/service/ProductService.cfc:L222',
    });
    expect(product.hasErrors()).toBe(false);
    expect(first.getPrice()).toBe(String(SEEDED_PRICE));

    // Nothing was written before the raise: the persistence walk at `:L229` is a separate loop that
    // the raise never reaches.
    expect(harness.persistedSkus).toHaveLength(0);
  });

  it('NET-NEW: no Product rule names the updateSkus context, so an otherwise-invalid product still updates', async () => {
    // The product has neither `productName` nor `productCode`, both of which
    // `model/validation/Product.json` requires — in the `save` context. Under `updateSkus` the entity
    // pass matches no rule at all, so the update proceeds. This is the exact distinction the AAP asks
    // to preserve, and it is why the two rule sets cannot be merged into one global context.
    const { product, first } = buildFixture({ identified: false });
    const harness = buildHarness();

    const answer = await harness.service.processProductUpdateSkus(product, {
      product,
      updatePriceFlag: 1,
      price: 25,
      updateListPriceFlag: 0,
    });

    expect(answer).toBe(product);
    expect(product.hasErrors()).toBe(false);
    expect(product.hasError('productName')).toBe(false);
    expect(product.hasError('productCode')).toBe(false);
    expect(first.getPrice()).toBe('25');

    // The entity pass still ran — it simply matched nothing. Both passes are visible in order, which is
    // the process-flow contract the update-SKUs cases exercise in full.
    expect(harness.validations).toEqual([
      {
        kind: 'validateProcess',
        className: 'Product',
        processContext: 'updateSkus',
        processObjectSupplied: true,
      },
      { kind: 'validate', className: 'Product', context: 'updateSkus' },
      { kind: 'validate', className: 'Product_UpdateSkus', context: 'updateSkus' },
    ]);
  });
});

// Agent prompt phase 7d — the five members whose legacy work crosses an excluded boundary.

describe('processProductAddProductReview — the review boundary', () => {
  const PRODUCT_ID = physicalID('p-add-review');

  interface ReviewRecorder {
    readonly activeFlags: number[];
    readonly accounts: { readonly accountID: string; readonly newFlag: boolean }[];
    readonly processObject: unknown;
  }

  /** The smallest object that satisfies the landed structural guard. */
  function createReviewRecorder(options: { readonly reviewable?: boolean } = {}): ReviewRecorder {
    const activeFlags: number[] = [];
    const accounts: { readonly accountID: string; readonly newFlag: boolean }[] = [];
    const target = {
      setActiveFlag: (activeFlag: number): void => {
        activeFlags.push(activeFlag);
      },
      setAccount: (account: { readonly accountID: string; readonly newFlag: boolean }): void => {
        accounts.push(account);
      },
    };

    return {
      activeFlags,
      accounts,
      processObject:
        options.reviewable === false
          ? { getSomethingElse: (): string => 'nope' }
          : { getNewProductReview: () => target },
    };
  }

  function buildReviewProduct(): Product {
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });

    return buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });
  }

  it('NET-NEW: approves the review and attaches the persisted current account when auto-approve reads true (:L160-:L168)', async () => {
    const product = buildReviewProduct();
    const recorder = createReviewRecorder();
    const harness = buildHarness({ settings: [AUTO_APPROVE_REVIEWS_SETTING] });

    const answer = await harness.service.processProductAddProductReview(
      product,
      recorder.processObject,
    );

    expect(answer).toBe(product);
    expect(recorder.activeFlags).toEqual([1]);
    expect(recorder.accounts).toEqual([
      { accountID: TEST_ADMIN_ACCOUNT_ID, newFlag: false, adminAccountFlag: true },
    ]);

    // The setting is read entity-scoped to this product, which is how the legacy hierarchical
    // `setting()` accessor resolves a product-level override before the global default.
    expect(harness.settingReads).toEqual([
      {
        settingName: 'productAutoApproveReviewsFlag',
        context: { entityName: 'Product', entityId: PRODUCT_ID },
      },
    ]);

    // The asymmetry: this is the only process member that never runs the process validator. Every
    // other one opens with `runProcessValidation`; `:L157-L171` opens with the body.
    expect(harness.validations).toEqual([]);
  });

  it('NET-NEW: leaves the review pending when auto-approve reads false, using the CFML cast rather than truthiness', async () => {
    const product = buildReviewProduct();
    const recorder = createReviewRecorder();
    // The string "0" — truthy in JavaScript, false in CFML. Reading it with truthiness would approve a
    // review the legacy leaves pending, which is a moderation failure rather than a cosmetic one.
    const harness = buildHarness({
      settings: [{ settingName: 'productAutoApproveReviewsFlag', value: '0' }],
    });

    await harness.service.processProductAddProductReview(product, recorder.processObject);

    expect(recorder.activeFlags).toEqual([0]);
  });

  it('NET-NEW: never attaches a NEW account, and attaches nothing when there is no current account (:L165)', async () => {
    const newAccountProduct = buildReviewProduct();
    const newAccountRecorder = createReviewRecorder();
    const newAccountHarness = buildHarness({
      settings: [AUTO_APPROVE_REVIEWS_SETTING],
      account: 'new',
    });

    await newAccountHarness.service.processProductAddProductReview(
      newAccountProduct,
      newAccountRecorder.processObject,
    );

    // `:L165` guards on the account not being new, so an unsaved account is never written onto the
    // review. The review is still activated, so the guard is on the account only.
    expect(newAccountRecorder.activeFlags).toEqual([1]);
    expect(newAccountRecorder.accounts).toEqual([]);
    expect(newAccountHarness.accountReads()).toBe(1);

    const absentProduct = buildReviewProduct();
    const absentRecorder = createReviewRecorder();
    const absentHarness = buildHarness({
      settings: [AUTO_APPROVE_REVIEWS_SETTING],
      account: 'absent',
    });

    await absentHarness.service.processProductAddProductReview(
      absentProduct,
      absentRecorder.processObject,
    );

    expect(absentRecorder.accounts).toEqual([]);
  });

  it('NET-NEW: attaches a persisted NON-admin account too, because the guard tests newFlag and not the admin flag', async () => {
    const product = buildReviewProduct();
    const recorder = createReviewRecorder();
    const harness = buildHarness({
      settings: [AUTO_APPROVE_REVIEWS_SETTING],
      account: 'nonAdmin',
    });

    await harness.service.processProductAddProductReview(product, recorder.processObject);

    expect(recorder.accounts).toEqual([
      { accountID: TEST_NON_ADMIN_ACCOUNT_ID, newFlag: false, adminAccountFlag: false },
    ]);
  });

  it('NET-NEW: refuses a process object that does not expose getNewProductReview (:L157-:L171)', async () => {
    const product = buildReviewProduct();
    const recorder = createReviewRecorder({ reviewable: false });
    const harness = buildHarness({ settings: [AUTO_APPROVE_REVIEWS_SETTING] });

    const error = await captureDomainError(
      harness.service.processProductAddProductReview(product, recorder.processObject),
    );

    expect(error.context).toEqual({
      productID: PRODUCT_ID,
      locator: 'model/service/ProductService.cfc:L157-L171',
    });
    // The refusal happens before the setting is read, so the boundary is closed at the shape check.
    expect(harness.settingReads).toEqual([]);
  });

  it('NET-NEW: raises when the auto-approve setting cannot be cast to a CFML boolean (:L159)', async () => {
    const product = buildReviewProduct();
    const recorder = createReviewRecorder();
    const harness = buildHarness({
      settings: [{ settingName: 'productAutoApproveReviewsFlag', value: 'maybe' }],
    });

    const error = await captureDomainError(
      harness.service.processProductAddProductReview(product, recorder.processObject),
    );

    expect(error.context).toEqual({
      settingName: 'productAutoApproveReviewsFlag',
      productID: PRODUCT_ID,
      locator: 'model/service/ProductService.cfc:L159',
    });
    expect(recorder.activeFlags).toEqual([]);
  });

  it('NET-NEW: returns a product that already has errors without reading the setting or touching the review', async () => {
    const product = buildReviewProduct();
    product.addError('productName', 'seeded by an earlier pass');
    const recorder = createReviewRecorder();
    const harness = buildHarness({ settings: [AUTO_APPROVE_REVIEWS_SETTING] });

    const answer = await harness.service.processProductAddProductReview(
      product,
      recorder.processObject,
    );

    expect(answer).toBe(product);
    expect(recorder.activeFlags).toEqual([]);
    expect(harness.settingReads).toEqual([]);
  });
});

describe('processProductAddSubscriptionTerm — the subscription boundary', () => {
  const PRODUCT_ID = physicalID('p-add-term');
  const SUBSCRIPTION_TERM_ID = physicalID('st-monthly');
  const EXISTING_SKU_ID = physicalID('sku-term-1');

  interface SubscriptionFixture {
    readonly product: Product;
    readonly defaultSku: Sku;
  }

  /**
   * Builds a subscription product whose single existing SKU is its default SKU and carries one benefit
   * of each kind, so the two copy loops at `:L186` and `:L189` have something to copy.
   */
  function buildFixture(): SubscriptionFixture {
    const productType = buildProductType({
      productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
      productTypeName: 'Subscription',
      productTypeIDPath: SUBSCRIPTION_PRODUCT_TYPE_ID,
      systemCode: 'subscription',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });
    const defaultSku = buildSku({
      skuID: EXISTING_SKU_ID,
      skuCode: `${TEST_MERCHANDISE_PRODUCT_CODE}-1`,
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      product,
      subscriptionBenefits: [{ subscriptionBenefitID: 'sb-access' }],
      renewalSubscriptionBenefits: [{ subscriptionBenefitID: 'sb-renewal' }],
    });

    return { product, defaultSku };
  }

  /** The four members the landed structural guard requires, with the list price under test. */
  function createTermProcessObject(listPrice: unknown): unknown {
    return {
      getSubscriptionTermID: (): string => SUBSCRIPTION_TERM_ID,
      getPrice: (): number => 30,
      getRenewalPrice: (): number => 27,
      getListPrice: (): unknown => listPrice,
    };
  }

  function buildReachableHarness(
    options: { readonly subscriptionTermIDs?: readonly string[] } = {},
  ): Harness {
    return buildHarness({
      settings: IMAGE_FILE_NAME_SETTINGS,
      subscriptionTermIDs: options.subscriptionTermIDs ?? [SUBSCRIPTION_TERM_ID],
      // the real `addSubscriptionTerm` rules can never pass (see the test immediately below), so
      // reaching the body at all requires a validator that records no findings. This is the only place
      // in the suite where the real rule set is stood down, and it is stood down to expose D6 rather
      // than to avoid a failure.
      validator: createPermissiveValidator(),
    });
  }

  it('NET-NEW: the real addSubscriptionTerm rules refuse every product, because unused terms always resolve to none', async () => {
    const { product, defaultSku } = buildFixture();
    const harness = buildHarness({ settings: IMAGE_FILE_NAME_SETTINGS });
    harness.attachDefaultSku(product, defaultSku);

    const answer = await harness.service.processProductAddSubscriptionTerm(
      product,
      createTermProcessObject(''),
    );

    // TODO(parity) — `model/validation/Product.json:L15` requires `minCollection 1` on
    // `unusedProductSubscriptionTerms` for this context, and the landed process-validation subject
    // resolves that collection through `Product.getUnusedProductSubscriptionTerms()` with no finder,
    // because the subscription domain is out of scope (AAP §0.2.2.1). The collection is therefore
    // always empty and the gate always closes. Carried as the observed boundary outcome: the member is
    // declared, typed and reachable, and the excluded collaborator is what stops it.
    expect(answer).toBe(product);
    expect(product.hasError('unusedProductSubscriptionTerms')).toBe(true);
    expect(product.getSkus()).toEqual([defaultSku]);
    expect(harness.persistedSkus).toEqual([]);
  });

  it('NET-NEW: D6 — a non-empty NUMERIC list price reaches the unassignable read and raises (:L180-:L182)', async () => {
    const { product, defaultSku } = buildFixture();
    const harness = buildReachableHarness();
    harness.attachDefaultSku(product, defaultSku);

    // TODO(parity) D6 — model/service/ProductService.cfc:L180-L182. The legacy guard reads
    // `processObject.getListPrice()` and the assignment reads `arguments.data.listPrice`, but the
    // signature at `:L173` declares no `data` argument. The assignment therefore cannot be performed,
    // so a caller who supplies a numeric list price hits an unconditional failure. Carried unrepaired:
    // Repairing it would invent a data argument the legacy signature does not have.
    const error = await captureDomainError(
      harness.service.processProductAddSubscriptionTerm(product, createTermProcessObject(45)),
    );

    expect(error.context).toEqual({
      productID: PRODUCT_ID,
      defect: 'D6',
      locator: 'model/service/ProductService.cfc:L180-L182',
      guardedOn: 'processObject.getListPrice()',
      assignedFrom: 'arguments.data.listPrice',
    });

    // The new SKU is built and priced before the guard, but it is attached to the product after it, so
    // the raise leaves the product's SKU set exactly as it was.
    expect(product.getSkus()).toEqual([defaultSku]);
    expect(harness.persistedSkus).toEqual([]);
  });

  it('NET-NEW: D6 — an EMPTY list price skips the defect and the member completes, creating the term SKU', async () => {
    const { product, defaultSku } = buildFixture();
    const harness = buildReachableHarness();
    harness.attachDefaultSku(product, defaultSku);

    const answer = await harness.service.processProductAddSubscriptionTerm(
      product,
      createTermProcessObject(''),
    );

    expect(answer).toBe(product);
    expect(product.getSkus()).toHaveLength(2);

    const created = requireSku(
      requireAt(product.getSkus(), 1),
      'the created subscription-term SKU',
    );
    expect(created.getPrice()).toBe('30');
    expect(created.getRenewalPrice()).toBe('27');
    expect(created.subscriptionTerm).toEqual({ subscriptionTermID: SUBSCRIPTION_TERM_ID });

    // The benefits are copied from the default SKU, not resolved from the subscription domain.
    expect(created.subscriptionBenefits).toEqual([{ subscriptionBenefitID: 'sb-access' }]);
    expect(created.renewalSubscriptionBenefits).toEqual([{ subscriptionBenefitID: 'sb-renewal' }]);

    // `:L183` derives the code from the live SKU count, so the first added SKU is `-2`.
    expect(created.skuCode).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}-2`);

    // The member ends by chaining `updateDefaultImageFileNames`, which regenerates and persists
    // both SKUs — the pre-existing one and the one just created.
    expect(harness.persistedSkus).toEqual([defaultSku, created]);
    expect(created.imageFile).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}.jpg`);
  });

  it('NET-NEW: D6 — a NON-NUMERIC list price also skips the defect, because the guard needs both halves', async () => {
    const { product, defaultSku } = buildFixture();
    const harness = buildReachableHarness();
    harness.attachDefaultSku(product, defaultSku);

    const answer = await harness.service.processProductAddSubscriptionTerm(
      product,
      createTermProcessObject('complimentary'),
    );

    expect(answer).toBe(product);
    expect(product.getSkus()).toHaveLength(2);
    expect(
      requireSku(requireAt(product.getSkus(), 1), 'the created subscription-term SKU').skuCode,
    ).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}-2`);
  });

  it('NET-NEW: refuses a process object missing the four members the legacy member calls (:L173-:L196)', async () => {
    const { product, defaultSku } = buildFixture();
    const harness = buildReachableHarness();
    harness.attachDefaultSku(product, defaultSku);

    const error = await captureDomainError(
      harness.service.processProductAddSubscriptionTerm(product, {
        getSubscriptionTermID: (): string => SUBSCRIPTION_TERM_ID,
      }),
    );

    expect(error.context).toEqual({
      productID: PRODUCT_ID,
      locator: 'model/service/ProductService.cfc:L173-L196',
    });
    expect(product.getSkus()).toEqual([defaultSku]);
  });

  it('NET-NEW: refuses a subscription-term identifier that resolves to no term (:L175)', async () => {
    const { product, defaultSku } = buildFixture();
    // The port is seeded with no terms, so the explicit `SubscriptionTermPort` answers null — the
    // sanctioned way across the boundary, never a service locator.
    const harness = buildReachableHarness({ subscriptionTermIDs: [] });
    harness.attachDefaultSku(product, defaultSku);

    const error = await captureDomainError(
      harness.service.processProductAddSubscriptionTerm(product, createTermProcessObject('')),
    );

    expect(error.context).toEqual({
      productID: PRODUCT_ID,
      subscriptionTermID: SUBSCRIPTION_TERM_ID,
      locator: 'model/service/ProductService.cfc:L175',
    });
    expect(product.getSkus()).toEqual([defaultSku]);
  });

  it('NET-NEW: refuses to run when the product has no default SKU whose benefits can be copied (:L185)', async () => {
    const { product } = buildFixture();
    // The SKU exists on the product, but no default-SKU delegate is attached, so `:L185` has nothing to
    // dereference — the same shape of unguarded read the legacy performs.
    const harness = buildReachableHarness();

    const error = await captureDomainError(
      harness.service.processProductAddSubscriptionTerm(product, createTermProcessObject('')),
    );

    expect(error.context).toEqual({
      productID: PRODUCT_ID,
      locator: 'model/service/ProductService.cfc:L185',
    });
  });
});

describe('processProductDeleteDefaultImage — the filesystem boundary', () => {
  const PRODUCT_ID = physicalID('p-delete-image');

  function buildImageProduct(): Product {
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });

    return buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });
  }

  it('NET-NEW: resolves the product untouched when the payload carries no imageFile key (:L198)', async () => {
    const product = buildImageProduct();
    const harness = buildHarness({ settings: [IMAGE_FOLDER_SETTING] });

    const answer = await harness.service.processProductDeleteDefaultImage(product, {});

    // The legacy body is inside a `structKeyExists` guard, so an empty payload is a legitimate no-op
    // rather than an error — and the image root is never resolved.
    expect(answer).toBe(product);
    expect(product.hasErrors()).toBe(false);
    expect(harness.settingReads).toEqual([]);
  });

  it('NET-NEW: raises NotImplementedError the moment imageFile is present, naming the unscoped read (:L198-:L206)', async () => {
    const product = buildImageProduct();
    const harness = buildHarness({ settings: [IMAGE_FOLDER_SETTING] });

    const error = await captureDomainError(
      harness.service.processProductDeleteDefaultImage(product, { imageFile: 'shirt-sm.jpg' }),
    );

    // The refusal is typed as NotImplementedError rather than a bare DomainError, because the reason is
    // an unreachable capability (filesystem I/O, TR-5) and not a caller mistake.
    expect(error).toBeInstanceOf(NotImplementedError);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.context).toEqual({
      productID: PRODUCT_ID,
      locator: 'model/service/ProductService.cfc:L198-L206',
      unscopedReference: 'imageFile',
      resolvedDirectory: '/assets/images/product/default/',
      defectClass: 'D10-class, unnumbered (AAP §0.6.7.5)',
    });

    // The directory really was resolved from the setting before the refusal, which is what makes the
    // reported path the one the legacy would have deleted from.
    expect(harness.settingReads.map((call) => call.settingName)).toEqual([
      'globalAssetsImageFolderPath',
    ]);

    // TODO(parity) — the legacy interpolates a bare `imageFile`, not `arguments.data.imageFile`, so it
    // raises in CFML too the moment the key is present. The defect is carried, not repaired: reading
    // `data.imageFile` instead would give the member a working path the legacy never had.
    expect(requireNotImplemented(error).member).toBe(
      'ProductService.processProductDeleteDefaultImage',
    );
  });

  it('NET-NEW: returns a product that already has errors before the payload is inspected at all', async () => {
    const product = buildImageProduct();
    product.addError('productCode', 'seeded by an earlier pass');
    const harness = buildHarness({ settings: [IMAGE_FOLDER_SETTING] });

    const answer = await harness.service.processProductDeleteDefaultImage(product, {
      imageFile: 'shirt-sm.jpg',
    });

    // Same payload that raises above. The error guard runs first, so the boundary is never reached.
    expect(answer).toBe(product);
    expect(harness.settingReads).toEqual([]);
  });
});

describe('processProductUpdateDefaultImageFileNames — regenerating the image file names', () => {
  const PRODUCT_ID = physicalID('p-image-names');

  it('NET-NEW: regenerates each SKU name from the product code and the IMAGE-GROUP options only, then persists every SKU (:L208-:L214)', async () => {
    const imageGroup = buildOptionGroup({
      optionGroupID: physicalID('og-size'),
      optionGroupCode: 'size',
      optionGroupName: 'Size',
      imageGroupFlag: true,
    });
    const nonImageGroup = buildOptionGroup({
      optionGroupID: physicalID('og-material'),
      optionGroupCode: 'material',
      optionGroupName: 'Material',
      imageGroupFlag: false,
    });
    const small = buildOption({
      optionID: physicalID('o-sm'),
      optionCode: 'sm',
      optionName: 'Small',
      optionGroup: imageGroup,
    });
    const cotton = buildOption({
      optionID: physicalID('o-cotton'),
      optionCode: 'cotton',
      optionName: 'Cotton',
      optionGroup: nonImageGroup,
    });
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });
    const sized = buildSku({
      skuID: physicalID('sku-sized'),
      imageFile: 'stale.jpg',
      product,
      options: [small, cotton],
    });
    const plain = buildSku({
      skuID: physicalID('sku-plain'),
      imageFile: 'also-stale.jpg',
      product,
    });
    const harness = buildHarness({ settings: IMAGE_FILE_NAME_SETTINGS });

    const answer = await harness.service.processProductUpdateDefaultImageFileNames(product);

    expect(answer).toBe(product);
    // Only the image-group option contributes a segment; the material option is skipped even though the
    // SKU carries it. That is `model/entity/Sku.cfc:L134` behaviour, and it is why the two groups differ
    // here only by `imageGroupFlag`.
    expect(sized.imageFile).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}-sm.jpg`);
    expect(plain.imageFile).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}.jpg`);
    expect(harness.persistedSkus).toEqual([sized, plain]);
  });

  it('NET-NEW: returns the product without regenerating or persisting anything when it already has errors (:L209)', async () => {
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });
    const sku = buildSku({ skuID: physicalID('sku-untouched'), imageFile: 'stale.jpg', product });
    product.addError('productName', 'seeded by an earlier pass');
    const harness = buildHarness({ settings: IMAGE_FILE_NAME_SETTINGS });

    const answer = await harness.service.processProductUpdateDefaultImageFileNames(product);

    expect(answer).toBe(product);
    expect(sku.imageFile).toBe('stale.jpg');
    expect(harness.persistedSkus).toEqual([]);
    // The settings are seeded and still unread, which proves the early return happened before the
    // regeneration rather than the regeneration happening and producing the same name.
    expect(harness.settingReads).toEqual([]);
  });
});

describe('processProductUploadDefaultImage — the upload boundary', () => {
  const PRODUCT_ID = physicalID('p-upload-image');
  const UPLOADED_FILE = 'shirt-sm.jpg';

  interface UploadRecorder {
    readonly metaDataRequests: string[];
    readonly errors: { readonly errorName: string; readonly errorMessage: string }[];
    readonly processObject: unknown;
  }

  /** The three members the landed structural guard requires. */
  function createUploadRecorder(options: { readonly uploadable?: boolean } = {}): UploadRecorder {
    const metaDataRequests: string[] = [];
    const errors: { readonly errorName: string; readonly errorMessage: string }[] = [];
    const complete = {
      getImageFile: (): string => UPLOADED_FILE,
      getPropertyMetaData: (propertyName: string): { readonly hb_fileAcceptMIMEType?: string } => {
        metaDataRequests.push(propertyName);
        return { hb_fileAcceptMIMEType: 'image/jpeg,image/png,image/gif' };
      },
      addError: (errorName: string, errorMessage: string): void => {
        errors.push({ errorName, errorMessage });
      },
    };

    return {
      metaDataRequests,
      errors,
      processObject:
        options.uploadable === false ? { getImageFile: (): string => UPLOADED_FILE } : complete,
    };
  }

  function buildUploadProduct(): Product {
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });

    return buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });
  }

  it('NET-NEW: records the fileUpload finding on the PROCESS OBJECT and resolves the product (:L235-:L257)', async () => {
    const product = buildUploadProduct();
    const recorder = createUploadRecorder();
    const harness = buildHarness({ settings: [IMAGE_FOLDER_SETTING] });

    const answer = await harness.service.processProductUploadDefaultImage(
      product,
      recorder.processObject,
    );

    expect(answer).toBe(product);

    // The finding lands on the process object under the same resource-bundle key the legacy uses, and
    // not on the entity. Moving it to the entity would change which form field renders the message.
    expect(recorder.errors).toEqual([{ errorName: 'imageFile', errorMessage: FILE_UPLOAD_RBKEY }]);
    expect(product.hasErrors()).toBe(false);

    // The accepted MIME types are read from the `uploadFile` property metadata, which is where the
    // legacy declares them — not from a constant invented here.
    expect(recorder.metaDataRequests).toEqual(['uploadFile']);
    expect(harness.settingReads.map((call) => call.settingName)).toEqual([
      'globalAssetsImageFolderPath',
    ]);
  });

  it('NET-NEW: refuses a process object missing the members the legacy member calls (:L235-:L257)', async () => {
    const product = buildUploadProduct();
    const recorder = createUploadRecorder({ uploadable: false });
    const harness = buildHarness({ settings: [IMAGE_FOLDER_SETTING] });

    const error = await captureDomainError(
      harness.service.processProductUploadDefaultImage(product, recorder.processObject),
    );

    expect(error.context).toEqual({
      productID: PRODUCT_ID,
      locator: 'model/service/ProductService.cfc:L235-L257',
    });
    expect(recorder.errors).toEqual([]);
    expect(harness.settingReads).toEqual([]);
  });

  it('NET-NEW: returns a product that already has errors without reading the image folder setting', async () => {
    const product = buildUploadProduct();
    product.addError('productCode', 'seeded by an earlier pass');
    const recorder = createUploadRecorder();
    const harness = buildHarness({ settings: [IMAGE_FOLDER_SETTING] });

    const answer = await harness.service.processProductUploadDefaultImage(
      product,
      recorder.processObject,
    );

    expect(answer).toBe(product);
    expect(recorder.errors).toEqual([]);
    expect(harness.settingReads).toEqual([]);
  });
});

// Agent prompt phase 8 — the two-pass process orchestration
// source: org/Hibachi/HibachiService.cfc:L84-L129 (the orchestrator),
// org/Hibachi/HibachiService.cfc:L55 (delete's hard-coded context),
// org/Hibachi/HibachiService.cfc:L133 and model/service/HibachiService.cfc:L86 (save's default)

describe('the two-pass process orchestration', () => {
  const PRODUCT_ID = physicalID('p-n3');

  function buildN3ProductType(): ProductType {
    return buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: 'Merchandise',
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
  }

  it('NET-NEW: validates the entity, then the process object, then runs the body — in that order (updateSkus)', async () => {
    const product = buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType: buildN3ProductType(),
    });
    const sku = buildSku({ skuID: physicalID('sku-n3'), price: 10, product });
    const harness = buildHarness();

    await harness.service.processProductUpdateSkus(product, {
      product,
      updatePriceFlag: 1,
      price: 25,
      updateListPriceFlag: 0,
    });

    // The orchestrator is entered once and issues exactly two passes, in the legacy order, both with
    // the one context string. A third entry, a reversed pair, or two different context values would all
    // be divergences from `org/Hibachi/HibachiService.cfc:L96` and `:L108`.
    expect(harness.validations).toEqual([
      {
        kind: 'validateProcess',
        className: 'Product',
        processContext: 'updateSkus',
        processObjectSupplied: true,
      },
      { kind: 'validate', className: 'Product', context: 'updateSkus' },
      { kind: 'validate', className: 'Product_UpdateSkus', context: 'updateSkus' },
    ]);

    // The body ran after the gate: the price changed and the SKU was written. Combined with the empty
    // repository state in the refusal test below, this is what fixes the ordering as gate-then-body
    // rather than body-then-gate.
    expect(sku.getPrice()).toBe('25');
    expect(harness.persistedSkus).toEqual([sku]);
  });

  it('NET-NEW: an add context supplies NO process-object rule set, because Product.json carries those rules itself', async () => {
    const optionGroup = buildOptionGroup({
      optionGroupID: physicalID('og-n3'),
      optionGroupCode: 'n3',
      optionGroupName: 'Finish',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType: buildN3ProductType(),
    });
    buildSku({ skuID: physicalID('sku-n3-add'), product });
    const harness = buildHarness({
      settings: IMAGE_FILE_NAME_SETTINGS,
      optionCatalog: {
        optionGroups: [],
        optionsByOptionGroupID: {},
        resolvableOptionGroups: [optionGroup],
      },
      repositoryOptionGroups: [optionGroup],
    });

    await harness.service.processProductAddOptionGroup(product, {
      product,
      optionGroup: physicalID('og-n3'),
    });

    // AAP §0.2.1.5: there is no `model/validation/Product_AddOptionGroup.json` and no
    // `Product_AddOption.json`. Those two process contexts are validated by context-scoped rules
    // declared inside `model/validation/Product.json`, so the orchestrator legitimately runs a
    // single-pass shape here. Mistaking that for a missing rule set is the error this test forecloses.
    expect(harness.validations).toEqual([
      {
        kind: 'validateProcess',
        className: 'Product',
        processContext: 'addOptionGroup',
        processObjectSupplied: false,
      },
      { kind: 'validate', className: 'Product', context: 'addOptionGroup' },
    ]);
  });

  it('NET-NEW: the entity gate blocks the process-object pass entirely, and nothing is populated or read', async () => {
    // Exercised directly against the landed orchestrator, because the short-circuit is unreachable
    // through this service's own rule sets: `updateSkus` is the only context that supplies a
    // process-object target, and no rule in `model/validation/Product.json` names `updateSkus`, so the
    // entity pass there can never produce a finding. The two rule sets below are deliberately minimal
    // test probes — they exist to observe the orchestrator's ordering contract, not to model any
    // product rule, and no production rule is invented or altered anywhere.
    const reads: string[] = [];
    const entitySubject: ValidationSubject = {
      getClassName: (): string => 'Product',
      hasProperty: (): boolean => true,
    };
    const processSubject: ValidationSubject = {
      getClassName: (): string => 'Product_UpdateSkus',
      hasProperty: (): boolean => true,
    };
    const failingEntityRuleSet: ValidationRuleSet<ValidationSubject> = {
      properties: [
        {
          propertyIdentifier: 'probeEntityProperty',
          read: (): unknown => {
            reads.push('entity');
            return undefined;
          },
          rules: [{ constraints: [{ constraintType: 'required', constraintValue: true }] }],
        },
      ],
    };
    const processObjectRuleSet: ValidationRuleSet<ValidationSubject> = {
      properties: [
        {
          propertyIdentifier: 'probeProcessProperty',
          read: (): unknown => {
            reads.push('processObject');
            return undefined;
          },
          rules: [{ constraints: [{ constraintType: 'required', constraintValue: true }] }],
        },
      ],
    };
    const validator = new RecordingValidator(createUniquePropertyDouble().uniqueProperty);

    const result = await validator.validateProcess({
      entity: entitySubject,
      entityRuleSet: failingEntityRuleSet,
      processContext: 'updateSkus',
      processObject: { subject: processSubject, ruleSet: processObjectRuleSet },
    });

    expect(result.entityErrors.hasErrors()).toBe(true);
    // `org/Hibachi/HibachiService.cfc:L99` returns before the process object is populated, so its bag
    // comes back empty rather than fabricated with content, and `processObjectRan` says so explicitly.
    expect(result.processObjectRan).toBe(false);
    expect(result.processObjectErrors.hasErrors()).toBe(false);

    // The process object's reader was never invoked. That is stronger than an empty error bag: it
    // proves the second pass did not run at all rather than running and passing.
    expect(reads).toEqual(['entity']);
    expect(validator.invocations).toEqual([
      {
        kind: 'validateProcess',
        className: 'Product',
        processContext: 'updateSkus',
        processObjectSupplied: true,
      },
      { kind: 'validate', className: 'Product', context: 'updateSkus' },
    ]);
  });

  it('NET-NEW: when the entity passes, the process object is validated with the SAME context string', async () => {
    const contexts: ValidationContext[] = [];
    const entitySubject: ValidationSubject = {
      getClassName: (): string => 'Product',
      hasProperty: (): boolean => true,
    };
    const processSubject: ValidationSubject = {
      getClassName: (): string => 'Product_UpdateSkus',
      hasProperty: (): boolean => true,
    };
    const passingRuleSet: ValidationRuleSet<ValidationSubject> = { properties: [] };
    const validator = new RecordingValidator(createUniquePropertyDouble().uniqueProperty);

    const result = await validator.validateProcess({
      entity: entitySubject,
      entityRuleSet: passingRuleSet,
      processContext: 'updateSkus',
      processObject: { subject: processSubject, ruleSet: passingRuleSet },
    });

    for (const invocation of validator.invocations) {
      if (invocation.kind === 'validate') {
        contexts.push(invocation.context);
      }
    }

    // One context string, used twice. `org/Hibachi/HibachiService.cfc` passes the same value to both
    // passes, and the landed request type carries a single `processContext` field so a caller cannot
    // do otherwise.
    expect(result.processObjectRan).toBe(true);
    expect(contexts).toEqual(['updateSkus', 'updateSkus']);
  });

  it('NET-NEW: save defaults its context, delete hard-codes its own, and a process context is supplied explicitly', async () => {
    const saveHarness = buildHarness({ settings: [PRODUCT_TITLE_STRING_SETTING] });
    const saveProduct = buildProduct({ productType: buildN3ProductType() });

    await saveHarness.service.saveProduct(saveProduct, {
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
    });

    expect(
      saveHarness.validations.map((invocation) =>
        invocation.kind === 'validate' ? invocation.context : invocation.processContext,
      ),
    ).toContain('save');

    const deleteHarness = buildHarness();
    const deleteTarget = buildProduct({
      productID: physicalID('p-n3-delete'),
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType: buildN3ProductType(),
    });

    await deleteHarness.service.deleteProduct(deleteTarget);

    expect(
      deleteHarness.validations.map((invocation) =>
        invocation.kind === 'validate' ? invocation.context : invocation.processContext,
      ),
    ).toEqual(['delete']);

    const processHarness = buildHarness();
    const processTarget = buildProduct({
      productID: physicalID('p-n3-process'),
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType: buildN3ProductType(),
    });

    await processHarness.service.processProductUpdateSkus(processTarget, {
      product: processTarget,
      updatePriceFlag: 0,
      updateListPriceFlag: 0,
    });

    expect(
      processHarness.validations.map((invocation) =>
        invocation.kind === 'validate' ? invocation.context : invocation.processContext,
      ),
    ).toEqual(['updateSkus', 'updateSkus', 'updateSkus']);
  });

  it('NET-NEW: the validator never persists — a refused process leaves every repository untouched', async () => {
    // `addOptionGroup` on a subscription product: `model/validation/Product.json:L4` restricts the
    // context to `merchandise`, so the entity pass refuses it.
    const productType = buildProductType({
      productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
      productTypeName: 'Subscription',
      productTypeIDPath: SUBSCRIPTION_PRODUCT_TYPE_ID,
      systemCode: 'subscription',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });
    const sku = buildSku({
      skuID: physicalID('sku-n3-refused'),
      imageFile: 'stale.jpg',
      price: 10,
      product,
    });
    const optionGroup = buildOptionGroup({
      optionGroupID: physicalID('og-n3-refused'),
      optionGroupCode: 'refused',
      optionGroupName: 'Refused',
    });
    const harness = buildHarness({
      settings: IMAGE_FILE_NAME_SETTINGS,
      optionCatalog: {
        optionGroups: [],
        optionsByOptionGroupID: {},
        resolvableOptionGroups: [optionGroup],
      },
      repositoryOptionGroups: [optionGroup],
    });

    const answer = await harness.service.processProductAddOptionGroup(product, {
      product,
      optionGroup: physicalID('og-n3-refused'),
    });

    expect(answer).toBe(product);
    expect(product.hasError('baseProductType')).toBe(true);

    // Validation mutates the entity's error state and writes nothing else. No product was persisted or
    // removed, no SKU was written, and no maintenance cleanup ran.
    expect(harness.persistedProducts()).toEqual([]);
    expect(harness.savedProducts).toEqual([]);
    expect(harness.removedProducts).toEqual([]);
    expect(harness.persistedSkus).toEqual([]);
    expect(harness.settingCleanups).toEqual([]);
    expect(harness.commentCleanups).toEqual([]);
    expect(sku.imageFile).toBe('stale.jpg');
  });
});

// Agent prompt phase 9 — the two save members
// source: model/service/ProductService.cfc:L264-L292 (saveProduct)
// model/service/ProductService.cfc:L294-L311 (saveProductType)

describe('saveProduct — populate, title, validate, create, persist', () => {
  const PRODUCT_TITLE_SLUG = 'test-product';

  function buildMerchandiseProductType(): ProductType {
    return buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: 'Merchandise',
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
  }

  /** The payload a valid save needs: the two required text fields, nothing more. */
  function validPayload(): Record<string, unknown> {
    return {
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
    };
  }

  interface SaveFixture {
    readonly product: Product;
    readonly defaultSku: Sku;
    readonly harness: Harness;
  }

  /**
   * A product plus a default SKU carrying a price, because `model/validation/Product.json:L8` requires
   * `price` on save and `Product.getPrice()` reads it from the default SKU when the entity has no
   * override. No pricing service is reached — the delegate answers from the SKU entity itself.
   */
  function buildSaveFixture(
    options: { readonly productID?: string; readonly harness?: Harness } = {},
  ): SaveFixture {
    const product =
      options.productID === undefined
        ? buildProduct({ productType: buildMerchandiseProductType() })
        : buildProduct({
            productID: options.productID,
            productType: buildMerchandiseProductType(),
          });
    const defaultSku = buildSku({
      skuID: physicalID('sku-save-default'),
      skuCode: `${TEST_MERCHANDISE_PRODUCT_CODE}-1`,
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      product,
    });
    const harness =
      options.harness ??
      buildHarness({ settings: [PRODUCT_TITLE_STRING_SETTING, ...IMAGE_FILE_NAME_SETTINGS] });
    harness.attachDefaultSku(product, defaultSku);

    return { product, defaultSku, harness };
  }

  it('NET-NEW: populates, titles, validates under save, creates SKUs, regenerates names, then persists (:L264-:L292)', async () => {
    const { product, harness } = buildSaveFixture();
    const data = validPayload();
    const createSkus = jest.spyOn(harness.skuService, 'createSkus').mockResolvedValue(true);
    const chain = jest
      .spyOn(harness.service, 'processProductUpdateDefaultImageFileNames')
      .mockResolvedValue(product);

    const answer = await harness.service.saveProduct(product, data);

    expect(answer).toBe(product);

    expect(product.productName).toBe(TEST_MERCHANDISE_PRODUCT_NAME);
    expect(product.productCode).toBe(TEST_MERCHANDISE_PRODUCT_CODE);

    // 1. The URL title was generated from the product title — the rendered `productTitleString`, not
    // the raw product name — and probed against `SwProduct`.
    expect(product.urlTitle).toBe(PRODUCT_TITLE_SLUG);
    expect(harness.urlTitleProbes).toEqual([
      { tableName: PRODUCT_TABLE, value: PRODUCT_TITLE_SLUG },
    ]);

    // 2. Exactly one validation pass, in the `save` context, with no process orchestration.
    expect(harness.validations).toEqual([
      { kind: 'validate', className: 'Product', context: 'save' },
    ]);
    expect(product.hasErrors()).toBe(false);

    // 3. SKU creation receives the same payload the caller supplied, and the image-name chain runs
    // after it — the legacy order at `:L282` then `:L284`.
    expect(createSkus).toHaveBeenCalledTimes(1);
    expect(requireAt(createSkus.mock.calls, 0)).toEqual([product, data]);
    expect(chain).toHaveBeenCalledTimes(1);
    expect(requireAt(chain.mock.calls, 0)).toEqual([product]);
    expect(requireAt(createSkus.mock.invocationCallOrder, 0)).toBeLessThan(
      requireAt(chain.mock.invocationCallOrder, 0),
    );

    // 4. The new-product path persists twice — once at `:L280` so the SKUs have a saved parent to
    // attach to, and again at `:L290`. Carried exactly: collapsing it to one write would change
    // what the SKU creation sees.
    expect(harness.persistedProducts()).toEqual([product, product]);
  });

  it('NET-NEW: delegates the unique URL title to the shared utility, consulting the probe rather than inventing a slug', async () => {
    const { product, harness } = buildSaveFixture({
      harness: buildHarness({
        settings: [PRODUCT_TITLE_STRING_SETTING, ...IMAGE_FILE_NAME_SETTINGS],
        takenUrlTitles: [{ tableName: PRODUCT_TABLE, value: PRODUCT_TITLE_SLUG }],
      }),
    });
    jest.spyOn(harness.skuService, 'createSkus').mockResolvedValue(true);
    jest
      .spyOn(harness.service, 'processProductUpdateDefaultImageFileNames')
      .mockResolvedValue(product);

    await harness.service.saveProduct(product, validPayload());

    // Two probes, and the second carries the suffixed candidate: the availability decision is the
    // utility's, not this member's. The suffix value is the utility's contract and is asserted in full
    // by the BrandService suite; what matters here is that this member asks rather than assumes.
    expect(harness.urlTitleProbes).toEqual([
      { tableName: PRODUCT_TABLE, value: PRODUCT_TITLE_SLUG },
      { tableName: PRODUCT_TABLE, value: `${PRODUCT_TITLE_SLUG}-2` },
    ]);
    expect(product.urlTitle).toBe(`${PRODUCT_TITLE_SLUG}-2`);
  });

  it('NET-NEW: an ENTITY urlTitle of empty string satisfies the isNull-only guard, so nothing is generated (:L268)', async () => {
    const { product, harness } = buildSaveFixture();
    product.urlTitle = '';
    const createSkus = jest.spyOn(harness.skuService, 'createSkus').mockResolvedValue(true);

    const answer = await harness.service.saveProduct(product, validPayload());

    // The guard is `isNull()` and nothing more, so an empty string counts as HAVING a URL title. The
    // `required` rule then refuses it, and the save is blocked. Normalising empty to absent here would
    // silently rescue a save the legacy rejects.
    expect(harness.urlTitleProbes).toEqual([]);
    expect(product.urlTitle).toBe('');
    expect(answer.hasError('urlTitle')).toBe(true);
    expect(createSkus).not.toHaveBeenCalled();
    expect(harness.persistedProducts()).toEqual([]);
  });

  it('NET-NEW: an empty urlTitle in the PAYLOAD is deleted by population, becomes absent, and IS generated', async () => {
    const { product, harness } = buildSaveFixture();
    jest.spyOn(harness.skuService, 'createSkus').mockResolvedValue(true);
    jest
      .spyOn(harness.service, 'processProductUpdateDefaultImageFileNames')
      .mockResolvedValue(product);

    await harness.service.saveProduct(product, { ...validPayload(), urlTitle: '' });

    // The same empty string, opposite outcome — because population treats a blank payload value for a
    // nullable column as a DELETE rather than an assignment, so the property is genuinely absent by the
    // time `:L268` reads it. The two cases are not interchangeable and are not normalised.
    expect(product.urlTitle).toBe(PRODUCT_TITLE_SLUG);
    expect(harness.urlTitleProbes).toEqual([
      { tableName: PRODUCT_TABLE, value: PRODUCT_TITLE_SLUG },
    ]);
    expect(product.hasErrors()).toBe(false);
  });

  it('NET-NEW: an EXISTING product skips SKU creation and the image chain, and persists once (:L279)', async () => {
    const { product, harness } = buildSaveFixture({ productID: physicalID('p-save-existing') });
    const createSkus = jest.spyOn(harness.skuService, 'createSkus').mockResolvedValue(true);
    const chain = jest.spyOn(harness.service, 'processProductUpdateDefaultImageFileNames');

    const answer = await harness.service.saveProduct(product, validPayload());

    expect(answer).toBe(product);
    expect(product.hasErrors()).toBe(false);
    // `:L279` gates the whole creation block on the product being NEW, so an update neither creates
    // SKUs nor regenerates names — and therefore persists exactly once.
    expect(createSkus).not.toHaveBeenCalled();
    expect(chain).not.toHaveBeenCalled();
    expect(harness.persistedProducts()).toEqual([product]);
  });

  it('NET-NEW: a validation finding blocks BOTH persistence passes, not just the second (:L279/:L289)', async () => {
    const { product, harness } = buildSaveFixture();
    const createSkus = jest.spyOn(harness.skuService, 'createSkus').mockResolvedValue(true);

    // `model/validation/Product.json:L6` constrains `productCode` with the regex
    // `^[a-zA-Z0-9-_.|:~^]+$`, and a space is not in that set.
    const answer = await harness.service.saveProduct(product, {
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: 'NOT A CODE',
    });

    expect(answer).toBe(product);
    expect(product.hasError('productCode')).toBe(true);
    expect(createSkus).not.toHaveBeenCalled();
    expect(harness.persistedProducts()).toEqual([]);
  });

  it('NET-NEW (legacy scenario: issue_1690, meta/tests/unit/IssuesTest.cfc:L192-L201) — a brand-new blank product accumulates save findings and is never persisted', async () => {
    // The legacy regression builds a bare `newEntity("Product")`, validates it in the `save` context and
    // saves it only if it reports no errors. It contains no assert statement at all, so it passes as long
    // as nothing throws — which is why this case is labelled NET-NEW even though it names a legacy
    // locator: the scenario carries across, the verdict below has no legacy counterpart to extend.
    const product = buildProduct({});
    const harness = buildHarness({ settings: [PRODUCT_TITLE_STRING_SETTING] });
    const createSkus = jest.spyOn(harness.skuService, 'createSkus').mockResolvedValue(true);

    const answer = await harness.service.saveProduct(product, {});

    expect(answer).toBe(product);
    expect(product.isNew()).toBe(true);
    // Every required field of the `save` context reports, and they accumulate together rather than the
    // first one short-circuiting the rest.
    expect(product.hasError('productName')).toBe(true);
    expect(product.hasError('productCode')).toBe(true);
    expect(product.hasError('productType')).toBe(true);
    expect(product.hasError('price')).toBe(true);
    expect(createSkus).not.toHaveBeenCalled();
    expect(harness.persistedProducts()).toEqual([]);
  });

  it('NET-NEW (legacy fixture: meta/tests/unit/Helper.cfc:L52-L77) — the legacy merchandise fixture saves unaltered', async () => {
    // `getTestMerchandiseProduct()` hard-codes one struct — product name `Test Product`, price `100`,
    // product code `TESTPRODUCTXXX` and the seeded merchandise product-type UUID (IR-7,
    // `config/dbdata/SlatwallProductType.xml.cfm:L13`) — and every legacy catalog test that needed a
    // product built it from there. The literals are carried across verbatim so a reviewer can line the
    // two suites up field by field. What is NET-NEW is the assertion: the CFML helper only populated and
    // saved, and asserted nothing, so the outcome below has no legacy counterpart to compare against.
    //
    // TODO(parity) D17 — meta/tests/unit/Helper.cfc:L52: the legacy helper declared `productData`
    // unscoped, leaking it into the component's shared variables scope — the same defect class as D10.
    // Strict TypeScript removes the hazard by construction: the fixture factory returns a frozen value
    // built fresh on every call, so nothing is shared between tests and there is nothing to leak.
    const fixture = createMerchandiseProductFixture();
    const harness = buildHarness({ settings: [PRODUCT_TITLE_STRING_SETTING] });
    const createSkus = jest.spyOn(harness.skuService, 'createSkus').mockResolvedValue(true);
    const chain = jest
      .spyOn(harness.service, 'processProductUpdateDefaultImageFileNames')
      .mockResolvedValue(fixture.product);

    expect(fixture.data.productName).toBe(TEST_MERCHANDISE_PRODUCT_NAME);
    expect(fixture.data.productCode).toBe(TEST_MERCHANDISE_PRODUCT_CODE);
    expect(fixture.data.price).toBe(TEST_MERCHANDISE_PRODUCT_PRICE);
    expect(fixture.data.productType.productTypeID).toBe(MERCHANDISE_PRODUCT_TYPE_ID);
    expect(fixture.productType.systemCode).toBe('merchandise');
    // `model/validation/Product.json:L8` requires `price` on save, and the legacy fixture satisfies it
    // through the default SKU alone — no pricing service is reached (AAP §0.2.2.6).
    expect(fixture.product.getPrice()).toBe('100');

    // The entity already carries every field the helper set, so the payload is legitimately empty: this
    // save exercises the fixture as the legacy helper handed it over, not a re-population of it.
    const answer = await harness.service.saveProduct(fixture.product, {});

    expect(answer).toBe(fixture.product);
    expect(fixture.product.hasErrors()).toBe(false);
    expect(fixture.product.urlTitle).toBe(PRODUCT_TITLE_SLUG);
    expect(createSkus).toHaveBeenCalledTimes(1);
    expect(chain).toHaveBeenCalledTimes(1);
    expect(harness.persistedProducts()).toEqual([fixture.product, fixture.product]);

    // The fixture's teardown seam mirrors `destroyTestMerchandiseProduct()`: dropping the default-SKU
    // reference is what the legacy helper had to do before deleting, because the product/SKU foreign
    // keys point at each other (the same circularity `deleteProduct` navigates at `:L320-:L334`).
    fixture.clearDefaultSkuReference();
    expect(fixture.product.defaultSku).toBeUndefined();
    expect(fixture.product.getPrice()).toBeUndefined();
  });
});

describe('saveProductType — payload-side titling and parent inheritance', () => {
  const PRODUCT_TYPE_ID = physicalID('pt-save');
  const PARENT_PRODUCT_TYPE_ID = physicalID('pt-save-parent');

  it('NET-NEW: generates the URL title into the PAYLOAD, preferring data.productTypeName, against SwProductType (:L297-:L303)', async () => {
    const productType = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Stale Name',
    });
    const harness = buildHarness();
    const data: Record<string, unknown> = { productTypeName: 'Wall Art' };

    const answer = await harness.service.saveProductType(productType, data);

    // The payload name wins over the entity name, and the generated value is written into the data —
    // not onto the entity — so the BaseService save populates it in the same pass.
    expect(harness.urlTitleProbes).toEqual([{ tableName: PRODUCT_TYPE_TABLE, value: 'wall-art' }]);
    expect(data['urlTitle']).toBe('wall-art');
    expect(answer).toBe(productType);
  });

  it('NET-NEW: falls back to the ENTITY productTypeName when the payload carries none (:L301)', async () => {
    const productType = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
    });
    const harness = buildHarness();
    const data: Record<string, unknown> = {};

    await harness.service.saveProductType(productType, data);

    expect(harness.urlTitleProbes).toEqual([
      { tableName: PRODUCT_TYPE_TABLE, value: 'framed-prints' },
    ]);
    expect(data['urlTitle']).toBe('framed-prints');
  });

  it('NET-NEW: generates nothing when either the payload or the entity already carries a URL title', async () => {
    const payloadHarness = buildHarness();
    const payloadProductType = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
    });
    const payloadData: Record<string, unknown> = { urlTitle: 'chosen-by-the-caller' };

    await payloadHarness.service.saveProductType(payloadProductType, payloadData);

    expect(payloadHarness.urlTitleProbes).toEqual([]);
    expect(payloadData['urlTitle']).toBe('chosen-by-the-caller');

    const entityHarness = buildHarness();
    const entityProductType = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
      urlTitle: 'already-titled',
    });
    const entityData: Record<string, unknown> = {};

    await entityHarness.service.saveProductType(entityProductType, entityData);

    // Both halves of the guard must be unusable before anything is generated, so an entity that already
    // has a title is left alone even when the payload has none.
    expect(entityHarness.urlTitleProbes).toEqual([]);
    expect(entityData['urlTitle']).toBeUndefined();
  });

  it('NET-NEW: this guard tests null OR length, so an EMPTY entity urlTitle IS regenerated — unlike saveProduct', async () => {
    const productType = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
      urlTitle: '',
    });
    const harness = buildHarness();
    const data: Record<string, unknown> = {};

    await harness.service.saveProductType(productType, data);

    // The exact contrast with `saveProduct` above: same empty string, opposite decision, because `:L297`
    // tests length as well as null. Preserved as two different guards rather than one shared helper.
    expect(harness.urlTitleProbes).toEqual([
      { tableName: PRODUCT_TYPE_TABLE, value: 'framed-prints' },
    ]);
    expect(data['urlTitle']).toBe('framed-prints');
  });

  it('NET-NEW: forwards the entity and the MUTATED payload to BaseService.save and returns what it answers (:L305)', async () => {
    const productType = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
    });
    const harness = buildHarness();
    const data: Record<string, unknown> = { productTypeDescription: 'Ready to hang' };

    const answer = await harness.service.saveProductType(productType, data);

    expect(harness.productTypeSaves).toHaveLength(1);
    const record = requireAt(harness.productTypeSaves, 0);
    expect(record.entity).toBe(productType);
    // The payload handed on is the one this member mutated, carrying the generated title alongside the
    // caller's own keys.
    expect(record.data).toBe(data);
    expect(record.data['urlTitle']).toBe('framed-prints');
    expect(record.data['productTypeDescription']).toBe('Ready to hang');
    expect(answer).toBe(productType);
    // This member persists nothing itself: BaseService owns the write.
    expect(harness.persistedProducts()).toEqual([]);
  });

  it('NET-NEW: inherits the parent product type products only when the save succeeded, a parent exists, and it has products (:L307-:L310)', async () => {
    const parentProductType = buildProductType({
      productTypeID: PARENT_PRODUCT_TYPE_ID,
      productTypeName: 'Prints',
    });
    const firstInherited = buildProduct({
      productID: physicalID('p-inherit-1'),
      productName: 'Poster',
    });
    const secondInherited = buildProduct({
      productID: physicalID('p-inherit-2'),
      productName: 'Canvas',
    });
    // The parent's collection is seeded directly, because the domain's `addProduct`/`setProducts` pair
    // maintains only the owning side of the relationship — the inverse collection is what Hibernate
    // filled from the database. Calling `parentProductType.setProducts([...])` here would leave the
    // parent's own collection empty and the inheritance branch would never be entered.
    parentProductType.getProducts().push(firstInherited, secondInherited);
    const productType = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
      parentProductType,
    });
    const harness = buildHarness();

    const answer = await harness.service.saveProductType(productType, {});

    // The child adopts the parent's whole product collection by re-pointing each product at itself,
    // and every adopted product is written back through the product repository — one call each, in
    // collection order.
    expect(firstInherited.productType).toBe(productType);
    expect(secondInherited.productType).toBe(productType);
    expect(harness.savedProducts).toEqual([firstInherited, secondInherited]);

    // The child's own collection stays empty, because the domain's `addProduct` sets only the owning
    // side of the relationship — the inverse collection is refreshed from the database, exactly as the
    // Hibernate mapping did. Asserting the adopted products on `child.getProducts()` would assert an
    // in-memory convenience the legacy never had. The parent's collection is likewise left untouched in
    // memory, which is why the write-back loop still sees both products.
    expect(answer.getProducts()).toEqual([]);
    expect(parentProductType.getProducts()).toEqual([firstInherited, secondInherited]);
    expect(
      harness.productCalls.filter(isProductCall('saveProduct')).map((call) => call.productID),
    ).toEqual([physicalID('p-inherit-1'), physicalID('p-inherit-2')]);
  });

  it('NET-NEW: inherits nothing when there is no parent, and nothing when the parent has no products', async () => {
    const orphanHarness = buildHarness();
    const orphan = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
    });

    await orphanHarness.service.saveProductType(orphan, {});

    expect(orphanHarness.savedProducts).toEqual([]);

    const childlessParent = buildProductType({
      productTypeID: PARENT_PRODUCT_TYPE_ID,
      productTypeName: 'Prints',
    });
    const childHarness = buildHarness();
    const child = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
      parentProductType: childlessParent,
    });

    await childHarness.service.saveProductType(child, {});

    // `:L309` guards on the parent's collection being non-empty, so a childless parent produces no
    // writes at all rather than an empty assignment.
    expect(childHarness.savedProducts).toEqual([]);
    expect(child.getProducts()).toEqual([]);
  });

  it('NET-NEW: findings from BaseService.save ride on the returned entity and block inheritance', async () => {
    /*
     * The member catches nothing. `model/service/ProductService.cfc:L310` returns on every path and
     * its `:L306` gate reads `hasErrors()`, so findings arrive as data on the entity. Throwing the
     * bag from `baseService.save` and wrapping the delegation in `try`/`catch` to convert the raise
     * back would have one layer invent a divergence and the next undo it; the base service honours
     * the single exit instead.
     */
    const parentProductType = buildProductType({
      productTypeID: PARENT_PRODUCT_TYPE_ID,
      productTypeName: 'Prints',
    });
    parentProductType
      .getProducts()
      .push(buildProduct({ productID: physicalID('p-inherit-1'), productName: 'Poster' }));
    /*
     * Seeded as findings, not as a rejection, and the option name is the whole distinction. An earlier
     * revision built a `ValidationError` here and passed it as `productTypeSaveFailure`, which makes the
     * double reject. Under the landed contract a validation refusal never rejects — `BaseService.save`
     * attaches the findings to the entity's own bag and returns the same instance — so seeding through
     * `productTypeSaveFindings` is what actually exercises the path these assertions describe.
     * `productTypeSaveFailure` is reserved for the non-validation case, in the very next test.
     */
    const harness = buildHarness({
      productTypeSaveFindings: {
        productTypeName: ['validate.save.ProductType.productTypeName.required'],
      },
    });
    const productType = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
      parentProductType,
    });

    const answer = await harness.service.saveProductType(productType, {});

    // A validation refusal is data, not control flow: it rides on the entity's error bag and the member
    // returns normally, exactly as the legacy `super.save()` contract does.
    expect(answer.hasError('productTypeName')).toBe(true);
    expect(harness.savedProducts).toEqual([]);
    expect(answer.getProducts()).toEqual([]);
  });

  it('NET-NEW: a non-validation failure from BaseService.save propagates, because nothing is caught', async () => {
    const failure = new DomainError('the persister was unreachable');
    const harness = buildHarness({ productTypeSaveFailure: failure });
    const productType = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
    });

    /*
     * An infrastructure failure must surface, or a caller would read an unsaved entity as saved.
     * This holds for the plainest possible reason: the delegation has no `try`/`catch` around it at
     * all, so nothing filters by error class. The identity
     * assertion is deliberate: the very object is rethrown, unwrapped and unre-tagged.
     */
    await expect(harness.service.saveProductType(productType, {})).rejects.toBe(failure);
  });

  it('NET-NEW: the ported ProductType rule set is what makes the titling step necessary, and it carries a SECOND inert physicalCounts guard', async () => {
    // This member generates a URL title for a reason, and the reason is declarative:
    // `model/validation/ProductType.json:L4` marks `urlTitle` required and unique in the `save` context,
    // so a product type saved without one could never pass. Pinning the rule set here is what stops a
    // later reader from deciding the titling step at `:L297-:L301` is redundant and removing it.
    expect(
      productTypeValidationRuleSet.properties.map((property) => property.propertyIdentifier),
    ).toEqual([
      'productTypeName',
      'urlTitle',
      'products',
      'childProductTypes',
      'systemCode',
      'physicalCounts',
    ]);

    // AAP §0.7.3, second occurrence — `model/validation/ProductType.json:L8` declares the same
    // `physicalCounts` delete guard that `model/validation/Product.json:L7` does, and it is inert
    // for the same reason: `model/entity/ProductType.cfc:L77` declares the collection as
    // `physicals`, nothing in the repository declares `physicalCounts` on either entity, and
    // `org/Hibachi/HibachiValidationService.cfc:L171` silently skips a rule whose property the
    // subject does not carry. Transliterated as an inert guard on both entities: never renamed to
    // `physicals`, and never invented where the document does not declare it.
    expect(Object.hasOwn(PRODUCT_TYPE_DECLARED_PROPERTIES, 'physicalCounts')).toBe(false);
    expect(Object.hasOwn(PRODUCT_TYPE_DECLARED_PROPERTIES, 'physicals')).toBe(true);

    // And ProductService itself never validates a product type: that is the injected base service's
    // duty, which is exactly why the delegation asserted above is the observable contract here.
    const harness = buildHarness();
    await harness.service.saveProductType(buildProductType({ productTypeID: PRODUCT_TYPE_ID }), {
      productTypeName: 'Framed Prints',
    });
    expect(harness.validations).toEqual([]);
  });
});

// Agent prompt phase 10 — deleteProduct(product) source: model/service/ProductService.cfc:L317-L336
// TODO(parity) — model/service/HibachiService.cfc:L93-L95. this is the one place in this suite that
// exercises a landed baseService cleanup seam, so the note belongs here. The legacy `delete()`
// override declares `settingsRemoved` twice with `var` in a single scope, which CFML tolerates and
// TypeScript cannot express; the translation declares it once. Nothing behavioural hangs on it —
// the second declaration overwrote the first — and the assertions below observe only the two
// cleanup collaborators the landed `BaseServiceCollaborators` actually requires, and no cache-
// invalidation hook is invented alongside them.

describe('deleteProduct — the default-SKU dance and the delete guards', () => {
  const PRODUCT_ID = physicalID('p-delete');
  const OTHER_PRODUCT_ID = physicalID('p-delete-other');

  interface DeleteFixture {
    readonly product: Product;
    readonly defaultSku: Sku;
    readonly delegate: ProductDefaultSkuDelegate;
  }

  function buildDeleteFixture(
    harness: Harness,
    options: { readonly productID?: string } = {},
  ): DeleteFixture {
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: 'Merchandise',
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({
      productID: options.productID ?? PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      urlTitle: 'test-product',
      productType,
    });
    const defaultSku = buildSku({
      skuID: physicalID('sku-delete-default'),
      skuCode: `${TEST_MERCHANDISE_PRODUCT_CODE}-1`,
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      product,
    });
    const delegate = harness.attachDefaultSku(product, defaultSku);

    return { product, defaultSku, delegate };
  }

  it('NET-NEW: clears the default SKU, deletes, and reports true — leaving the pointer cleared (:L318-:L335)', async () => {
    const harness = buildHarness();
    const { product, delegate } = buildDeleteFixture(harness);
    expect(product.defaultSku).toBe(delegate);

    const answer = await harness.service.deleteProduct(product);

    expect(answer).toBe(true);
    expect(harness.removedProducts).toEqual([product]);

    // On success the pointer is not put back. The legacy restores it only on the failure branch, and
    // fabricating a restoration here would leave a deleted product holding a live relationship.
    expect(product.defaultSku).toBeUndefined();

    // The maintenance collaborators fire in the legacy order, and only after the row is gone.
    expect(harness.settingCleanups).toEqual([product]);
    expect(harness.commentCleanups).toEqual([product]);
  });

  it('NET-NEW: restores the default SKU and reports false when the delete is refused (:L332-:L334)', async () => {
    // A transaction against this product closes `model/validation/Product.json:L5`.
    const harness = buildHarness({ transactionProductIDs: [PRODUCT_ID] });
    const { product, delegate } = buildDeleteFixture(harness);

    const answer = await harness.service.deleteProduct(product);

    expect(answer).toBe(false);
    expect(harness.removedProducts).toEqual([]);
    // The exact same delegate instance is put back, not an equivalent rebuilt one.
    expect(product.defaultSku).toBe(delegate);
    // No cleanup runs when nothing was removed, so a refused delete cannot strip a live product's
    // settings or comments.
    expect(harness.settingCleanups).toEqual([]);
    expect(harness.commentCleanups).toEqual([]);
  });

  it('NET-NEW: a transaction against ANOTHER product does not block this one', async () => {
    // The DAO check is product-scoped. If the port were consulted without the product identifier — or if
    // the identifier landed in the skuID parameter, which wins at `model/dao/SkuDAO.cfc:L58-L64` — every
    // product in a store with any transaction history would become undeletable.
    const harness = buildHarness({ transactionProductIDs: [OTHER_PRODUCT_ID] });
    const { product } = buildDeleteFixture(harness);

    const answer = await harness.service.deleteProduct(product);

    expect(answer).toBe(true);
    expect(harness.removedProducts).toEqual([product]);

    // The check really was made, and it was made with the product identifier in the second position.
    expect(harness.skuCalls.filter(isSkuCall('transactionExists'))).toEqual([
      { member: 'transactionExists', productID: PRODUCT_ID, skuID: undefined },
    ]);
  });

  it('NET-NEW: the physicalCounts guard is transliterated but inert, so physicals never block a delete', async () => {
    const harness = buildHarness();
    const { product } = buildDeleteFixture(harness);
    // Two out-of-scope physical associations. `model/validation/Product.json:L7` reads as "refuse the
    // delete when any physical count exists", and it cannot fire, because the property it names is not
    // the property the entity declares.
    product.physicals.push({ physicalID: 'phys-1' }, { physicalID: 'phys-2' });

    const answer = await harness.service.deleteProduct(product);

    expect(answer).toBe(true);
    expect(product.hasError('physicalCounts')).toBe(false);
    expect(harness.removedProducts).toEqual([product]);

    // The rule is still there — transliterated faithfully rather than dropped — and it is the subject's
    // property declaration that makes it unreachable. Asserting both halves is what keeps a future
    // reader from "fixing" the name.
    expect(physicalCountsValidation.propertyIdentifier).toBe('physicalCounts');
    expect(productValidationRuleSet.properties).toContain(physicalCountsValidation);
    expect(product.hasProperty('physicalCounts')).toBe(false);
    expect(product.hasProperty('physicals')).toBe(true);
  });

  it('NET-NEW: validates in the hard-coded delete context, and reads the transaction flag before it', async () => {
    const harness = buildHarness();
    const { product } = buildDeleteFixture(harness);

    await harness.service.deleteProduct(product);

    // One pass, context `delete`, supplied by the framework member rather than by this caller
    // (`org/Hibachi/HibachiService.cfc:L55`).
    expect(harness.validations).toEqual([
      { kind: 'validate', className: 'Product', context: 'delete' },
    ]);
    // The flag is resolved before the rule reads it — the delete-subject resolution step is what makes a
    // lazily calculated property available to a declarative rule at all.
    expect(harness.skuCalls.filter(isSkuCall('transactionExists'))).toHaveLength(1);
  });

  it('NET-NEW: a product with no default SKU deletes cleanly and nothing is restored', async () => {
    const harness = buildHarness();
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });

    const answer = await harness.service.deleteProduct(product);

    expect(answer).toBe(true);
    expect(product.defaultSku).toBeUndefined();
    expect(harness.removedProducts).toEqual([product]);
  });

  it('NET-NEW: a refused delete leaves no default SKU behind when there was none to capture', async () => {
    const harness = buildHarness({ transactionProductIDs: [PRODUCT_ID] });
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });

    const answer = await harness.service.deleteProduct(product);

    expect(answer).toBe(false);
    // The restore is guarded on there having been something to restore, so a product that never had a
    // default SKU does not acquire an undefined one.
    expect(product.defaultSku).toBeUndefined();
    expect(harness.removedProducts).toEqual([]);
  });
});

// Agent prompt phase 11 — getProductSmartList(data?, currentURL?)
// source: model/service/ProductService.cfc:L342-L357.

describe('getProductSmartList — the paginated product query', () => {
  const KEYWORD_WEIGHT = 1;

  function buildProductRow(productID: string, productName: string): Product {
    return buildProduct({
      productID,
      productName,
      productCode: `${TEST_MERCHANDISE_PRODUCT_CODE}-${productID}`,
    });
  }

  it('NET-NEW: queries SlatwallProduct with the three joins in source order, brand LEFT (:L343-:L349)', async () => {
    const harness = buildHarness();

    await harness.service.getProductSmartList();

    expect(harness.smartListQueries).toHaveLength(1);
    const query = requireAt(harness.smartListQueries, 0);
    expect(query.entityName).toBe(PRODUCT_ENTITY);

    // Order matters: the legacy registers productType, then defaultSku, then brand, and only brand is a
    // LEFT join — a product with no brand must still appear. Promoting brand to an inner join would
    // silently drop every unbranded product from the result, and the `brand.brandName` keyword property
    // asserted below would then only ever match branded rows. The feed's own conditional `g:brand` is not
    // what this join serves: that comes from the LEFT join the feed controller registers for itself on a
    // SKU SmartList at `integrationServices/google/controllers/feed.cfc:L66`.
    expect(query.joins).toEqual([
      { parentEntityName: PRODUCT_ENTITY, relatedProperty: 'productType' },
      { parentEntityName: PRODUCT_ENTITY, relatedProperty: 'defaultSku' },
      { parentEntityName: PRODUCT_ENTITY, relatedProperty: 'brand', joinType: 'left' },
    ]);
  });

  it('NET-NEW: registers the five keyword properties in source order, every one at weight 1 (:L351-:L355)', async () => {
    const harness = buildHarness();

    await harness.service.getProductSmartList();

    const query = requireAt(harness.smartListQueries, 0);
    expect(query.keywordProperties).toEqual([
      { propertyIdentifier: 'calculatedTitle', weight: KEYWORD_WEIGHT },
      { propertyIdentifier: 'brand.brandName', weight: KEYWORD_WEIGHT },
      { propertyIdentifier: 'productName', weight: KEYWORD_WEIGHT },
      { propertyIdentifier: 'productCode', weight: KEYWORD_WEIGHT },
      { propertyIdentifier: 'productType.productTypeName', weight: KEYWORD_WEIGHT },
    ]);
  });

  it('NET-NEW: both arguments are optional, and an omitted payload adds no filter, order or pagination', async () => {
    const harness = buildHarness();

    const result = await harness.service.getProductSmartList();

    const query = requireAt(harness.smartListQueries, 0);
    // Nothing is invented for an absent payload: no default page size, no default sort, no empty filter
    // group. The legacy defaults `data` to an empty struct and registers nothing from it.
    expect(query.whereGroups).toBeUndefined();
    expect(query.orders).toBeUndefined();
    expect(query.pagination).toBeUndefined();
    expect(result.records).toEqual([]);
    expect(result.recordsCount).toBe(0);
  });

  it('NET-NEW: forwards a caller payload — keyword, filter and pagination — through to the port', async () => {
    const first = buildProductRow('p-list-1', 'Poster');
    const second = buildProductRow('p-list-2', 'Canvas');
    const harness = buildHarness({ productRows: [first, second] });

    const result = await harness.service.getProductSmartList({
      keyword: 'poster',
      'F:activeFlag': 1,
      'P:Show': 25,
      OrderBy: 'productName|ASC',
    });

    const query = requireAt(harness.smartListQueries, 0);
    expect(query.keywords).toEqual(['poster']);
    expect(query.whereGroups).toEqual([
      { filters: [{ propertyIdentifier: 'activeFlag', value: 1 }] },
    ]);
    expect(query.orders).toEqual([{ propertyIdentifier: 'productName', direction: 'ASC' }]);
    expect(query.pagination).toEqual({ pageRecordsShow: 25 });

    // The port's result is returned as-is: this member shapes a query and nothing else.
    expect(result.records).toEqual([first, second]);
    expect(result.pageRecords).toEqual([first, second]);
    expect(result.recordsCount).toBe(2);
  });

  it('NET-NEW: accepts currentURL and ignores it, because FW/1 saved-state URLs have no Lambda counterpart', async () => {
    const withoutUrl = buildHarness();
    await withoutUrl.service.getProductSmartList({ keyword: 'poster' });

    const withUrl = buildHarness();
    await withUrl.service.getProductSmartList(
      { keyword: 'poster' },
      '/admin/?slatAction=entity.listProduct',
    );

    // Byte-identical queries with and without the argument. Threading it into the query would invent a
    // filter the legacy never registers from it; rejecting it would break the declared signature.
    expect(requireAt(withUrl.smartListQueries, 0)).toEqual(
      requireAt(withoutUrl.smartListQueries, 0),
    );
  });

  it('NET-NEW: M7 — two independently constructed services share no query configuration', async () => {
    const first = buildHarness({ productRows: [buildProductRow('p-list-1', 'Poster')] });
    await first.service.getProductSmartList({ keyword: 'poster', 'F:activeFlag': 1 });

    const second = buildHarness({ productRows: [buildProductRow('p-list-2', 'Canvas')] });
    const secondResult = await second.service.getProductSmartList();

    // A warm Lambda container keeps module scope alive, so any configuration retained between
    // invocations would leak one caller's filters into the next caller's results. Each service records
    // exactly one query, and the second carries none of the first's state.
    expect(first.smartListQueries).toHaveLength(1);
    expect(second.smartListQueries).toHaveLength(1);
    expect(requireAt(second.smartListQueries, 0).whereGroups).toBeUndefined();
    expect(requireAt(second.smartListQueries, 0).keywords).toBeUndefined();
    expect(secondResult.records).toHaveLength(1);
  });

  it('NET-NEW: surfaces a port failure rather than answering an empty page', async () => {
    const failure = new DomainError('the smart-list adapter was unreachable');
    const harness = buildHarness({ smartListFailure: failure });

    await expect(harness.service.getProductSmartList()).rejects.toBe(failure);
  });
});

// IR-1 — the three members that exist only because of onMissingMethod, declared explicitly
// source: org/Hibachi/HibachiService.cfc:L255-L281.

describe('IR-1 — the explicitly declared replacements for the synthesized members', () => {
  it('NET-NEW: newProduct() answers a brand-new, unsaved Product and shares nothing between calls', () => {
    const harness = buildHarness();

    const first = harness.service.newProduct();
    const second = harness.service.newProduct();

    expect(first).toBeInstanceOf(Product);
    expect(first.isNew()).toBe(true);
    // Two calls, two objects. A synthesized `new*` returned a fresh transient every time, and a
    // memoised factory here would let one request's draft leak into the next on a warm container (M7).
    expect(second).not.toBe(first);
    expect(first.getSkus()).toEqual([]);
    expect(harness.smartListQueries).toEqual([]);
    expect(harness.persistedProducts()).toEqual([]);
    expect(harness.settingReads).toEqual([]);
  });

  it('NET-NEW: getProduct(id) resolves one product by identifier, and answers null when nothing matches', async () => {
    const wanted = buildProduct({ productID: physicalID('p-wanted'), productName: 'Poster' });
    const other = buildProduct({ productID: physicalID('p-other'), productName: 'Canvas' });
    const harness = buildHarness({ productRows: [wanted, other] });

    const found = await harness.service.getProduct(physicalID('p-wanted'));

    expect(found).toBe(wanted);
    expect(requireAt(harness.smartListQueries, 0)).toEqual({
      entityName: PRODUCT_ENTITY,
      whereGroups: [
        { filters: [{ propertyIdentifier: 'productID', value: physicalID('p-wanted') }] },
      ],
    });

    // A miss is `null`, not an empty array and not a throw: the synthesized `get*` answered a null
    // entity, and every call site in the slice guards on that.
    const missing = await harness.service.getProduct('p-nonexistent');
    expect(missing).toBeNull();
  });

  it('NET-NEW: getProductType(id) resolves against SlatwallProductType, not SlatwallProduct', async () => {
    const wanted = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: 'Merchandise',
      systemCode: 'merchandise',
    });
    const harness = buildHarness({ productTypeRows: [wanted] });

    const found = await harness.service.getProductType(MERCHANDISE_PRODUCT_TYPE_ID);

    expect(found).toBe(wanted);
    // A different entity and a different identifier property. The legacy synthesis derived both from the
    // method name, so a single mistyped declaration here would silently query the wrong table.
    expect(requireAt(harness.smartListQueries, 0)).toEqual({
      entityName: PRODUCT_TYPE_ENTITY,
      whereGroups: [
        { filters: [{ propertyIdentifier: 'productTypeID', value: MERCHANDISE_PRODUCT_TYPE_ID }] },
      ],
    });

    const missing = await harness.service.getProductType('pt-nonexistent');
    expect(missing).toBeNull();
  });

  it('NET-NEW: both identifier lookups are records-only reads — no pagination, join or keyword configuration', async () => {
    const harness = buildHarness({
      productRows: [buildProduct({ productID: physicalID('p-wanted'), productName: 'Poster' })],
      productTypeRows: [
        buildProductType({ productTypeID: physicalID('pt-wanted'), productTypeName: 'Prints' }),
      ],
    });

    await harness.service.getProduct(physicalID('p-wanted'));
    await harness.service.getProductType(physicalID('pt-wanted'));

    for (const query of harness.smartListQueries) {
      // A primary-key read needs none of the SmartList configuration `getProductSmartList` registers, and
      // inventing a page size or a default order for it would be a behaviour the synthesis never had (AAP §0.7.3).
      expect(query.joins).toBeUndefined();
      expect(query.keywordProperties).toBeUndefined();
      expect(query.orders).toBeUndefined();
      expect(query.pagination).toBeUndefined();
      expect(query.selectDistinctFlag).toBeUndefined();
    }
    expect(harness.smartListQueries).toHaveLength(2);
  });
});

/*
 * AAP §0.4.1.12 declares exactly seventeen executable suites, so this subject is covered
 * inside an approved suite rather than in one of its own.
 */

/**
 * `productHandler` — the Lambda boundary that exposes the `ProductService` surface, and the contracts
 * that boundary must not silently alter.
 */
describe("The product surface's final wiring", () => {
  /** A 32-character identifier, the width IR-6 fixes for every primary key in this schema. */
  const PRODUCT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  /** A second, so "the route addressed the entity it was given" is observable. */
  const PRODUCT_TYPE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  /** Every entity CRUD type the permission model can be asked about. */
  const EVERY_CRUD_TYPE: readonly string[] = ['create', 'read', 'update', 'delete'];

  /**
   * The eighteen operations AAP §0.4.2.1 (fifteen declared) and §0.4.2.5 (three synthesized) allow.
   */
  const APPROVED_MEMBERS: readonly string[] = [
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

  /** A principal, defaulting to one that is logged in and is not an administrator. */
  function account(overrides: Partial<AccountReference> = {}): AccountReference {
    return { accountID: 'account-1', newFlag: false, adminAccountFlag: false, ...overrides };
  }

  /** A product the routes can address. */
  function makeProduct(productID: string = PRODUCT_ID): Product {
    const product = new Product();
    product.productID = productID;
    return product;
  }

  /** A product type the two product-type routes can address. */
  function makeProductType(): ProductTypeWithErrorState {
    const productType = new ProductType();
    productType.productTypeID = PRODUCT_TYPE_ID;
    productType.productTypeName = 'Merchandise';
    return manageEntity(productType, PRODUCT_TYPE_ENTITY_METADATA);
  }

  /** An empty page of products, so the smart-list projection has a defined shape to assert. */
  function emptyPage(): SmartListResult<Product> {
    return {
      records: [],
      pageRecords: [],
      recordsCount: 0,
      pageRecordsStart: 0,
      pageRecordsEnd: 0,
      currentPage: 1,
      totalPages: 0,
    };
  }

  /** How one assembled surface should behave. */
  interface SurfaceOptions {
    /** What `getProduct` answers. `null` means "no such row"; omitted means a default product. */
    readonly product?: Product | null;
    /** What `saveProduct` answers, when it must differ from its argument. */
    readonly savedProduct?: Product;
    /**
     * An error key `saveProductType` should attach to the product type it returns, expressing a refused
     * save. Omitted means the save succeeded.
     */
    readonly productTypeSaveError?: string;
    /** What `deleteProduct` answers. `false` is a guard refusing the delete, not an error. */
    readonly deleteResult?: boolean;
    /** A failure `loadDataFromFile` rejects with instead of resolving. */
    readonly importFailure?: unknown;
  }

  /** What one invocation of the surface recorded. */
  interface Invocation {
    /**
     * Which member, and whether it arrived through the captured service or the transaction graph.
     */
    readonly member: string;
    readonly through: 'service' | 'graph';
    /** The arguments, so argument ORDER is observable and not merely arity. */
    readonly args: readonly unknown[];
  }

  /** A recording surface that answers every one of the eighteen members. */
  function makeSurface(options: SurfaceOptions = {}): {
    readonly calls: Invocation[];
    readonly service: ProductHandlerService;
    readonly graph: ProductWriteGraph;
  } {
    const calls: Invocation[] = [];
    const stored: Product | null = options.product === undefined ? makeProduct() : options.product;

    function build(through: 'service' | 'graph'): ProductHandlerService {
      function record(member: string, args: readonly unknown[]): void {
        calls.push({ member, through, args });
      }

      return {
        loadDataFromFile: (fileURL: string, textQualifier?: string): Promise<void> => {
          record('loadDataFromFile', [fileURL, textQualifier]);

          /*
           * Recorded before the rejection, so a case can assert the route did forward the location it was
           * given rather than short-circuiting on a guess about it.
           */
          if (options.importFailure !== undefined) {
            const failure: unknown = options.importFailure;

            return Promise.resolve().then((): void => {
              throw failure;
            });
          }

          return Promise.resolve();
        },
        getFormattedOptionGroups: (product: Product): Promise<FormattedOptionGroups> => {
          record('getFormattedOptionGroups', [product]);
          /*
           * The service answers a record keyed by option-group name — TR-1's tightening of
           * `model/service/ProductService.cfc:L71`'s struct — so the double answers that shape too.
           */
          return Promise.resolve({ Size: [{ name: 'Large', value: 'large' }] });
        },
        getProductSkusBySelectedOptions: (
          selectedOptions: string,
          productID: string,
        ): Promise<Sku[]> => {
          record('getProductSkusBySelectedOptions', [selectedOptions, productID]);
          return Promise.resolve([]);
        },
        processProductAddOptionGroup: (
          product: Product,
          processObject: ProductAddOptionGroup,
        ): Promise<Product> => {
          record('processProductAddOptionGroup', [product, processObject]);
          return Promise.resolve(product);
        },
        processProductAddOption: (
          product: Product,
          processObject: ProductAddOption,
        ): Promise<Product> => {
          record('processProductAddOption', [product, processObject]);
          return Promise.resolve(product);
        },
        processProductAddProductReview: (
          product: Product,
          processObject: unknown,
        ): Promise<Product> => {
          record('processProductAddProductReview', [product, processObject]);
          return Promise.resolve(product);
        },
        processProductAddSubscriptionTerm: (
          product: Product,
          processObject: unknown,
        ): Promise<Product> => {
          record('processProductAddSubscriptionTerm', [product, processObject]);
          return Promise.resolve(product);
        },
        processProductDeleteDefaultImage: (
          product: Product,
          data: Record<string, unknown>,
        ): Promise<Product> => {
          record('processProductDeleteDefaultImage', [product, data]);
          return Promise.resolve(product);
        },
        processProductUpdateDefaultImageFileNames: (product: Product): Promise<Product> => {
          record('processProductUpdateDefaultImageFileNames', [product]);
          return Promise.resolve(product);
        },
        processProductUpdateSkus: (
          product: Product,
          processObject: ProductUpdateSkus,
        ): Promise<Product> => {
          record('processProductUpdateSkus', [product, processObject]);
          return Promise.resolve(product);
        },
        processProductUploadDefaultImage: (
          product: Product,
          processObject: unknown,
        ): Promise<Product> => {
          record('processProductUploadDefaultImage', [product, processObject]);
          return Promise.resolve(product);
        },
        saveProduct: (product: Product, data: Record<string, unknown>): Promise<Product> => {
          record('saveProduct', [product, data]);
          return Promise.resolve(options.savedProduct ?? product);
        },
        saveProductType: (
          productType: ProductType,
          data: Record<string, unknown>,
        ): Promise<ProductTypeWithErrorState> => {
          record('saveProductType', [productType, data]);

          /*
           * The double reproduces the service's contract, not a convenience: `saveProductType` returns the
           * entity on every path and attaches its findings to that entity's own bag
           * (`model/service/ProductService.cfc:L310`). So a failing save is expressed by seeding a finding
           * here, never by rejecting.
           */
          const saved = manageEntity(productType, PRODUCT_TYPE_ENTITY_METADATA);

          if (options.productTypeSaveError !== undefined) {
            saved.addError(options.productTypeSaveError, 'refused');
          }

          return Promise.resolve(saved);
        },
        deleteProduct: (product: Product): Promise<boolean> => {
          record('deleteProduct', [product]);
          return Promise.resolve(options.deleteResult ?? true);
        },
        getProductSmartList: (
          data?: SmartListInput,
          currentURL?: string,
        ): Promise<SmartListResult<Product>> => {
          record('getProductSmartList', [data, currentURL]);
          return Promise.resolve(emptyPage());
        },
        newProduct: (): Product => {
          record('newProduct', []);
          return makeProduct('');
        },
        getProduct: (productID: string): Promise<Product | null> => {
          record('getProduct', [productID]);
          return Promise.resolve(stored);
        },
        getProductType: (productTypeID: string): Promise<ProductType | null> => {
          record('getProductType', [productTypeID]);
          return Promise.resolve(makeProductType());
        },
      };
    }

    const service = build('service');
    const graph = build('graph');

    return { calls, service, graph };
  }

  /** A write runner that evaluates the gate and throws on a roll-back. */
  function makeWriteRunner(graph: ProductWriteGraph): {
    readonly runner: TransactionalWriteRunner<ProductWriteGraph>;
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
          work: (graph: ProductWriteGraph) => Promise<TResult>,
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

  /** Everything one assembled handler exposes for inspection. */
  interface Probe {
    /** Every entity question asked, in order, so the legacy sequence is observable. */
    readonly asked: EntityAuthorizationRequest[];
    /** Every request the resolver was handed —'s widened input. */
    readonly requests: InvocationSecurityRequest[];
    /** Every member reached, with its arguments and which object answered. */
    readonly calls: Invocation[];
    /** Every commit decision the runner took. */
    readonly decisions: ('commit' | 'rollback')[];
    /** Every context handed to the write boundary —'s propagation half. */
    readonly securityContexts: readonly RequestAuthorizationContext[];
    readonly handler: ProductHandler;
  }

  /*
   * @param account the principal the resolver reports, or `undefined` for "no principal at all"
   * @param grant the entity CRUD types the permission model grants @param options see {@link
   * SurfaceOptions} @param refusedEntities entity names whose questions are refused whatever the
   * grant. The subordinate question asks about a different entity, so a case that wants "may update
   * the product but not its SKUs" cannot express itself through `grant` alone.
   */
  function makeHandler(
    principal: AccountReference | undefined,
    grant: readonly string[],
    options: SurfaceOptions = {},
    refusedEntities: readonly { readonly entityName: string }[] = [],
  ): Probe {
    const asked: EntityAuthorizationRequest[] = [];
    const requests: InvocationSecurityRequest[] = [];
    const surface = makeSurface(options);
    const { runner, decisions, securityContexts } = makeWriteRunner(surface.graph);
    const refused = new Set(refusedEntities.map((entity) => entity.entityName));

    const resolve: InvocationSecurityResolver = (request) => {
      requests.push(request);

      return {
        accountContext: { getCurrentAccount: () => principal },
        entityAuthorization: {
          authenticateEntity: (question: EntityAuthorizationRequest): boolean => {
            asked.push(question);
            return !refused.has(question.entityName) && grant.includes(question.crudType);
          },
        },
        populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
      };
    };

    return {
      asked,
      requests,
      calls: surface.calls,
      decisions,
      securityContexts,
      handler: createProductHandler(surface.service, resolve, runner),
    };
  }

  /** Another party's product identifier — the victim in's exploit. */
  const VICTIM_PRODUCT_ID = 'ffffffff000000000000000000000009';

  /** A handler admitting every request, for cases about routing rather than the gate. */
  function admitAll(options: SurfaceOptions = {}): Probe {
    return makeHandler(account(), EVERY_CRUD_TYPE, options);
  }

  /** The event slice the identifier-only routes declare. */
  function identifierEvent(
    productID?: string,
  ): ProductIdentifierEvent & ProductTypeIdentifierEvent {
    return {
      pathParameters: productID === undefined ? {} : { productID, productTypeID: productID },
      headers: {},
    };
  }

  /** The event slice the payload routes declare. */
  function payloadEvent(body: string, productID: string = PRODUCT_ID): ProductPayloadEvent {
    return { body, pathParameters: { productID }, headers: {} };
  }

  /** The payload slice that addresses no product, so `saveProduct` is a creation. */
  function unaddressedPayloadEvent(body: string): ProductPayloadEvent {
    return { body, pathParameters: {}, headers: {} };
  }

  /** The event slice the product-type payload route declares. */
  function productTypePayloadEvent(body: string, productTypeID?: string): ProductTypePayloadEvent {
    return {
      body,
      pathParameters: productTypeID === undefined ? {} : { productTypeID },
      headers: {},
    };
  }

  /* API-01 — the routed surface. */

  describe('productHandler — API-01, the routed surface is exactly the eighteen approved operations', () => {
    it('NET-NEW — AAP §0.4.2.1 + §0.4.2.5 — routes all eighteen and not one more', () => {
      const probe = admitAll();

      // Sorted on both sides, so the assertion is about membership rather than declaration order.
      expect(Object.keys(probe.handler).sort()).toStrictEqual([...APPROVED_MEMBERS].sort());
    });

    it('NET-NEW — AAP §0.4.2.5 restraint — reproduces synthesis ONLY where used', () => {
      const probe = admitAll();
      const routed = Object.keys(probe.handler);

      /*
       * "Not called by the slice … Not declared — synthesis is not reproduced wholesale, only where
       * used." a prefix-driven port would have fabricated all of these.
       */
      for (const forbidden of [
        'countProduct',
        'listProduct',
        'exportProduct',
        'countProductType',
        'listProductType',
        'exportProductType',
        'buildSkuCombinations', // D15 — private and only self-recursive, therefore unreachable.
      ]) {
        expect(routed).not.toContain(forbidden);
      }
    });

    it('NET-NEW — the returned handler is frozen, so no route can be swapped after assembly', () => {
      const probe = admitAll();
      expect(Object.isFrozen(probe.handler)).toBe(true);
    });

    it('NET-NEW — the access matrix covers every routed member and nothing else', () => {
      const probe = admitAll();

      expect(Object.keys(PRODUCT_ACCESS_MATRIX).sort()).toStrictEqual(
        Object.keys(probe.handler).sort(),
      );
    });
  });

  /* API-01 — the gate `setupRequest()` ran. */

  describe('productHandler — API-01, the authorization gate', () => {
    it('NET-NEW — org/Hibachi/HibachiAuthenticationService.cfc:L83 — NO principal refuses with 401', async () => {
      const probe = makeHandler(undefined, EVERY_CRUD_TYPE);

      const results = [
        await probe.handler.getProduct(identifierEvent(PRODUCT_ID)),
        await probe.handler.saveProduct(payloadEvent('{}')),
        await probe.handler.deleteProduct(identifierEvent(PRODUCT_ID)),
        await probe.handler.processProductUpdateSkus(payloadEvent('{}')),
        await probe.handler.loadDataFromFile({ queryStringParameters: {}, headers: {} }),
      ];

      for (const result of results) {
        expect(result.statusCode).toBe(401);
        expect(JSON.parse(result.body)).toStrictEqual({ message: 'Authentication is required' });
      }

      // Refused before the service, so nothing was read, written or imported….
      expect(probe.calls).toStrictEqual([]);
      // …and before any permission question, because there was no principal to ask about.
      expect(probe.asked).toStrictEqual([]);
      // …and no transaction was opened.
      expect(probe.decisions).toStrictEqual([]);
    });

    it('NET-NEW — productHandler — HibachiScope.cfc:L40-L45 — the logged-in test is the NEGATION of newFlag', async () => {
      /*
       * `getLoggedInFlag()` is `if(!getSession().getAccount().isNew())`, and `newFlag` carries
       * `isNew()`. A principal that is NEW is therefore not logged in. Inverting this predicate would
       * have admitted exactly the first caller and refused the second.
       */
      const notLoggedIn = makeHandler(account({ newFlag: true }), ['read']);
      expect((await notLoggedIn.handler.getProduct(identifierEvent(PRODUCT_ID))).statusCode).toBe(
        401,
      );
      expect(notLoggedIn.calls).toStrictEqual([]);

      const loggedIn = makeHandler(account({ newFlag: false }), ['read']);
      expect((await loggedIn.handler.getProduct(identifierEvent(PRODUCT_ID))).statusCode).toBe(200);
    });

    it('NET-NEW — a logged-in principal WITHOUT permission gets 403, not 401 and not 200', async () => {
      const probe = makeHandler(account(), []);

      const result = await probe.handler.getProduct(identifierEvent(PRODUCT_ID));

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body)).toStrictEqual({ message: 'Not authorized' });
      expect(probe.calls).toStrictEqual([]);
    });

    /*
     * Why a logged-in account is not enough here (CWE-862, CWE-639). Treating every process member
     * as `anyLogin` would admit a logged-in account with no entity grant to
     * `processProductAddOptionGroup`, `processProductAddOption` and `processProductUpdateSkus`
     * without consulting the permission model at all. The legacy ladder's `process` branch really
     * is a bare `return true`, but in the legacy that branch was reached only through an
     * administrative subsystem.
     */
    it('NET-NEW — a grant-less account is REFUSED by every process route', async () => {
      const probe = makeHandler(account(), []);

      const processRoutes = [
        await probe.handler.processProductAddOptionGroup(payloadEvent('{"optionGroup":"g1"}')),
        await probe.handler.processProductAddOption(payloadEvent('{"option":"o1"}')),
        await probe.handler.processProductUpdateSkus(payloadEvent('{}')),
        await probe.handler.processProductAddProductReview(payloadEvent('{}')),
        await probe.handler.processProductAddSubscriptionTerm(payloadEvent('{}')),
        await probe.handler.processProductDeleteDefaultImage(payloadEvent('{}')),
        await probe.handler.processProductUpdateDefaultImageFileNames(payloadEvent('{}')),
        await probe.handler.processProductUploadDefaultImage(payloadEvent('{}')),
      ];

      /*
       * 403, not 401: the principal is authenticated. And not 200: the operation is not authorised.
       */
      for (const result of processRoutes) {
        expect(result.statusCode).toBe(403);
      }

      /*
       * And the permission model was consulted, which is the assertion whose inverse this case used to
       * make. Every route asked `update` on `Product` — the operation it performs — before resolving
       * anything. Nothing reached the service, so no victim product was read or written.
       */
      expect(probe.asked).toHaveLength(processRoutes.length);
      expect(probe.asked.every((request) => request.entityName === 'Product')).toBe(true);
      expect(probe.asked.every((request) => request.crudType === 'update')).toBe(true);
      expect(probe.calls).toStrictEqual([]);
      expect(probe.decisions).toStrictEqual([]);
    });

    it('NET-NEW — the addressed victim identifier travels with the question', async () => {
      /*
       * The exploit named another party's product in `pathParameters.productID`. The gate now asks about
       * that identifier, so a deployment that scopes grants per row can refuse it — and a deployment that
       * does not still refuses on the entity question above.
       */
      const probe = makeHandler(account(), []);

      await probe.handler.processProductUpdateSkus(payloadEvent('{}', VICTIM_PRODUCT_ID));

      expect(probe.asked).toStrictEqual([
        { entityName: 'Product', crudType: 'update', entityID: VICTIM_PRODUCT_ID },
      ]);
    });

    it('NET-NEW — Product update alone is not enough where SKU state is written', async () => {
      /*
       * The subordinate question is a conjunction. A principal that may update the product but not its
       * SKUs is refused by the four routes that write SKU or image state, and admitted by the two whose
       * writes belong to families this deliverable does not model.
       */
      const productOnly = makeHandler(account(), ['update'], {}, [{ entityName: 'Sku' }]);

      expect(
        (await productOnly.handler.processProductUpdateSkus(payloadEvent('{}'))).statusCode,
      ).toBe(403);
      expect(productOnly.asked.map((request) => request.entityName)).toStrictEqual([
        'Product',
        'Sku',
      ]);
      expect(productOnly.calls).toStrictEqual([]);

      /*
       * The two boundary rows ask about `Product` and nothing else: inventing a permission name for an
       * entity this port does not model would be fabrication (AAP §0.7.3). They are admitted by the
       * gate and then answer the boundary's own refusal.
       */
      const boundary = makeHandler(account(), ['update'], {}, [{ entityName: 'Sku' }]);
      const review = await boundary.handler.processProductAddProductReview(payloadEvent('{}'));
      expect(review.statusCode).not.toBe(401);
      expect(review.statusCode).not.toBe(403);
      expect(boundary.asked.map((request) => request.entityName)).toStrictEqual(['Product']);
    });

    it('NET-NEW — both grants together admit a SKU-writing process route', async () => {
      const granted = makeHandler(account(), ['update']);

      const result = await granted.handler.processProductUpdateSkus(payloadEvent('{}'));

      expect(result.statusCode).not.toBe(401);
      expect(result.statusCode).not.toBe(403);
      expect(granted.asked).toStrictEqual([
        { entityName: 'Product', crudType: 'update', entityID: PRODUCT_ID },
        { entityName: 'Sku', crudType: 'update' },
      ]);
    });

    /*
     * Why the question follows the operation rather than a fixed order. Asking `create` then
     * `update` in a fixed pair lets a `create`-only principal name an existing product and have it
     * updated, because the first grant short-circuits the second.
     */
    it('NET-NEW — saveProduct asks create when UNADDRESSED and update when ADDRESSED', async () => {
      // Unaddressed — a creation. `create` alone grants it; `update` is never asked.
      const creating = makeHandler(account(), ['create']);
      await creating.handler.saveProduct(unaddressedPayloadEvent('{}'));
      expect(creating.asked).toStrictEqual([{ entityName: 'Product', crudType: 'create' }]);

      // Addressed — an update. `update` alone grants it; `create` is never asked.
      const updating = makeHandler(account(), ['update']);
      await updating.handler.saveProduct(payloadEvent('{}'));
      expect(updating.asked).toStrictEqual([
        { entityName: 'Product', crudType: 'update', entityID: PRODUCT_ID },
      ]);
    });

    it('NET-NEW — a create-only principal can no longer UPDATE an addressed product', async () => {
      const escalating = makeHandler(account(), ['create']);

      const result = await escalating.handler.saveProduct(payloadEvent('{}'));

      expect(result.statusCode).toBe(403);
      expect(escalating.asked).toStrictEqual([
        { entityName: 'Product', crudType: 'update', entityID: PRODUCT_ID },
      ]);
      expect(escalating.calls).toStrictEqual([]);
      expect(escalating.decisions).toStrictEqual([]);
    });

    it('NET-NEW — AAP §0.4.2.1 — getProductSkusBySelectedOptions asks about Sku, not Product', async () => {
      /*
       * The member answers with SKUs, so the entity whose read permission governs it is `Sku`. A
       * handler that asked about `product` would admit and refuse the wrong callers.
       */
      const probe = makeHandler(account(), ['read']);

      await probe.handler.getProductSkusBySelectedOptions({
        pathParameters: { productID: PRODUCT_ID },
        queryStringParameters: { selectedOptions: 'o1' },
        headers: {},
      });

      expect(probe.asked).toStrictEqual([
        { entityName: 'Sku', crudType: 'read', entityID: PRODUCT_ID },
      ]);
    });

    it('NET-NEW — the two product-type routes ask about ProductType, not Product', async () => {
      const read = makeHandler(account(), ['read']);
      await read.handler.getProductType(identifierEvent(PRODUCT_TYPE_ID));
      expect(read.asked).toStrictEqual([
        { entityName: 'ProductType', crudType: 'read', entityID: PRODUCT_TYPE_ID },
      ]);

      /*
       * `saveProductType` has no creation path at all — an unaddressed request is a 400 —
       * so it asks `update` and never `create`, and a `create`-only grant no longer reaches it.
       */
      const save = makeHandler(account(), ['update']);
      await save.handler.saveProductType(productTypePayloadEvent('{}', PRODUCT_TYPE_ID));
      expect(save.asked).toStrictEqual([
        { entityName: 'ProductType', crudType: 'update', entityID: PRODUCT_TYPE_ID },
      ]);

      const createOnly = makeHandler(account(), ['create']);
      expect(
        (await createOnly.handler.saveProductType(productTypePayloadEvent('{}', PRODUCT_TYPE_ID)))
          .statusCode,
      ).toBe(403);
    });

    it('NET-NEW — loadDataFromFile is SECURE on Product, not anyLogin', async () => {
      /*
       * Its `load` prefix matches no branch of the legacy ladder, so it falls through to the terminal
       * `return false` at [:L83] — i.e. it is not a process member and must not be admitted as one.
       * The importer addresses no single row, so the question is the create arm of the save
       * requirement, asked once rather than as an ordered pair.
       */
      const refused = makeHandler(account(), []);
      const result = await refused.handler.loadDataFromFile({
        queryStringParameters: { fileURL: 'https://example.test/products.txt' },
        headers: {},
      });

      expect(result.statusCode).toBe(403);
      expect(refused.calls).toStrictEqual([]);
      expect(refused.asked).toStrictEqual([{ entityName: 'Product', crudType: 'create' }]);
    });

    it('NET-NEW — newProduct asks create ALONE, and deleteProduct asks delete ALONE', async () => {
      const create = makeHandler(account(), ['create']);
      await create.handler.newProduct({ headers: {} } satisfies NewProductEvent);
      expect(create.asked).toStrictEqual([{ entityName: 'Product', crudType: 'create' }]);

      const remove = makeHandler(account(), ['delete']);
      await remove.handler.deleteProduct(identifierEvent(PRODUCT_ID));
      expect(remove.asked).toStrictEqual([
        { entityName: 'Product', crudType: 'delete', entityID: PRODUCT_ID },
      ]);
    });

    it('NET-NEW — the resolver is told the action and the resolved context reaches the write', async () => {
      const probe = makeHandler(account(), ['update']);

      await probe.handler.processProductUpdateSkus(payloadEvent('{}'));

      /* One resolution, carrying the routed action, the single operation and the addressed row. */
      expect(probe.requests).toHaveLength(1);
      expect(probe.requests[0]).toMatchObject({
        action: 'product.processProductUpdateSkus',
        crudType: 'update',
        entityName: 'Product',
        entityID: PRODUCT_ID,
      });

      /* And the write ran under that context rather than a memoised principal. */
      expect(probe.securityContexts).toHaveLength(1);
      expect(probe.securityContexts[0]?.accountContext.getCurrentAccount()).toStrictEqual(
        account(),
      );
    });
  });

  /* API-01 — the prompt's own worked example, and its T5 edge case. */

  describe('productHandler — API-01, getProductSkusBySelectedOptions argument order and T5', () => {
    it('NET-NEW — model/entity/Product.cfc:L366-L368 — selectedOptions FIRST, productID SECOND', async () => {
      /*
       * Both are 32-character-capable strings, so a forward written in the wrong order type-checks
       * perfectly and silently asks the wrong question. Only an order assertion can catch it.
       */
      const probe = admitAll();

      await probe.handler.getProductSkusBySelectedOptions({
        pathParameters: { productID: PRODUCT_ID },
        queryStringParameters: { selectedOptions: 'opt-1,opt-2' },
        headers: {},
      });

      expect(probe.calls).toStrictEqual([
        {
          member: 'getProductSkusBySelectedOptions',
          through: 'service',
          args: ['opt-1,opt-2', PRODUCT_ID],
        },
      ]);
    });

    it('NET-NEW — AAP §0.6.1.3 T5 — an EMPTY selectedOptions is legal and must reach the service', async () => {
      /*
       * `listLen("")` is zero, so zero EXISTS clauses are appended and the query legitimately degenerates
       * to "all option-bearing SKUs of this product". Both `Product.getSkuBySelectedOptions` and
       * `Sku.hasUniqueOptions` depend on that degenerate form — rejecting, defaulting or normalising it
       * would break both callers.
       */
      const probe = admitAll();

      const result = await probe.handler.getProductSkusBySelectedOptions({
        pathParameters: { productID: PRODUCT_ID },
        queryStringParameters: { selectedOptions: '' },
        headers: {},
      });

      expect(result.statusCode).toBe(200);
      expect(probe.calls).toStrictEqual([
        { member: 'getProductSkusBySelectedOptions', through: 'service', args: ['', PRODUCT_ID] },
      ]);
    });

    it('NET-NEW — an ABSENT selectedOptions parameter is a 400, which is not the same as an empty one', async () => {
      /*
       * T5 makes the empty string meaningful; it does not make the parameter optional. The distinction
       * is the reason the reader tests for presence rather than for truthiness.
       */
      const probe = admitAll();

      const result = await probe.handler.getProductSkusBySelectedOptions({
        pathParameters: { productID: PRODUCT_ID },
        queryStringParameters: {},
        headers: {},
      } satisfies SelectedOptionsEvent);

      expect(result.statusCode).toBe(400);
      expect(probe.calls).toStrictEqual([]);
    });

    it('NET-NEW — a missing productID path parameter is a 400 before the service is reached', async () => {
      const probe = admitAll();

      const result = await probe.handler.getProductSkusBySelectedOptions({
        pathParameters: {},
        queryStringParameters: { selectedOptions: 'o1' },
        headers: {},
      });

      expect(result.statusCode).toBe(400);
      expect(probe.calls).toStrictEqual([]);
    });
  });

  /* API-01 — M1: the importer, disclosed and deliberately not transactional. */

  describe('productHandler — API-01/M1, the importer entry point', () => {
    it('NET-NEW — AAP §0.6.6 M3 — the importer does NOT enter a transaction', async () => {
      /*
       * [model/dao/ProductDAO.cfc:L177] opens `transaction{` inside the record loop, so each row commits
       * independently: "one transaction per row, not one per import". Wrapping the whole import in a
       * single transaction would change that semantics, converting a partially-imported catalog into an
       * all-or-nothing one. `ProductWriteGraph` structurally excludes the member for this reason.
       */
      const probe = admitAll();

      const result = await probe.handler.loadDataFromFile({
        queryStringParameters: { fileURL: 'https://example.test/products.txt' },
        headers: {},
      });

      expect(result.statusCode).toBe(200);
      expect(probe.decisions).toStrictEqual([]);
      expect(probe.calls.map((call) => call.through)).toStrictEqual(['service']);
    });

    it('NET-NEW — L65 — textQualifier is OPTIONAL and is forwarded second when supplied', async () => {
      const supplied = admitAll();
      await supplied.handler.loadDataFromFile({
        queryStringParameters: { fileURL: 'https://example.test/p.txt', textQualifier: '"' },
        headers: {},
      });
      expect(supplied.calls[0]?.args).toStrictEqual(['https://example.test/p.txt', '"']);

      const omitted = admitAll();
      await omitted.handler.loadDataFromFile({
        queryStringParameters: { fileURL: 'https://example.test/p.txt' },
        headers: {},
      });
      expect(omitted.calls[0]?.args).toStrictEqual(['https://example.test/p.txt', undefined]);
    });

    it('NET-NEW — an absent fileURL is a 400, since L65 declares it required', async () => {
      const probe = admitAll();

      const result = await probe.handler.loadDataFromFile({
        queryStringParameters: {},
        headers: {},
      } satisfies LoadDataFromFileEvent);

      expect(result.statusCode).toBe(400);
      expect(probe.calls).toStrictEqual([]);
    });
    /*
     * No case here asserts a particular status for a refused import location, because this port decides
     * no refusal grounds. `model/dao/ProductDAO.cfc:L87` retrieves whatever location it is handed and checks
     * nothing, so an allow-list of schemes, hosts or addresses authored here would be a behavioural departure
     * and AAP §0.6.7.7 licenses exactly one (D18, the importer's parameterised SQL). What the port does
     * require is that an injected `ProductImportSourcePolicy` be consulted before any retrieval — asserted
     * in the folded adapter suite, not here — and whatever that policy rejects with propagates through this.
     */
  });

  /* API-01/tx-01 — the process pipeline. */

  describe('productHandler — API-01/TX-01, the process pipeline enters a transaction', () => {
    it('NET-NEW — every process route reaches the GRAPH, never the captured service', async () => {
      /*
       * This is tx-01's defect shape at the product boundary. A route that closed over the injected
       * service would run identically in every happy-path assertion while performing its writes outside
       * the transaction — so the only thing that catches it is asserting which object answered.
       */
      const probe = admitAll();

      await probe.handler.processProductAddOptionGroup(payloadEvent('{"optionGroup":"g1"}'));
      await probe.handler.processProductAddOption(payloadEvent('{"option":"o1"}'));
      await probe.handler.processProductUpdateSkus(
        payloadEvent('{"updatePriceFlag":1,"price":10}'),
      );

      // Both the read of the subject and the process call itself must be inside the transaction.
      expect(probe.calls.every((call) => call.through === 'graph')).toBe(true);
      expect(probe.decisions).toStrictEqual(['commit', 'commit', 'commit']);
    });

    it('NET-NEW — AAP §0.6.6 M6 — the subject is READ through the transaction graph', async () => {
      const probe = admitAll();

      await probe.handler.processProductUpdateSkus(payloadEvent('{}'));

      // getProduct precedes the process member, and both are on the graph.
      expect(probe.calls.map((call) => call.member)).toStrictEqual([
        'getProduct',
        'processProductUpdateSkus',
      ]);
      expect(probe.calls.map((call) => call.through)).toStrictEqual(['graph', 'graph']);
    });

    it('NET-NEW — an unknown identifier is a 404, and the process member is never reached', async () => {
      /*
       * The unit still commits, and that is correct rather than a leak. The subject is read inside the
       * transaction, so a miss returns early with the gate's `subject` still unset — leaving a read-only
       * unit with nothing to undo. Rolling a pure read back would raise a spurious failure. The assertion
       * that carries weight is therefore that no write member ran, not that no transaction opened.
       */
      const probe = admitAll({ product: null });

      const result = await probe.handler.processProductUpdateSkus(payloadEvent('{}'));

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toStrictEqual({ message: 'Not found' });
      expect(probe.calls.map((call) => call.member)).toStrictEqual(['getProduct']);
      expect(probe.decisions).toStrictEqual(['commit']);
    });

    it('NET-NEW — TX-01 — a SKU-level finding ROLLS BACK, not only a product-level one', async () => {
      /*
       * The complete predicate, not `product.hasErrors()`. `skuBatchHasErrors` reads the product's own
       * bag or any member SKU's bag. Narrowing the gate to the product alone would commit a batch whose
       * SKUs carry findings — exactly what AAP §0.6.2's read-back loop depends on being prevented.
       */
      const withFailingSku = makeProduct();
      /*
       * `Sku` declares no error surface of its own; `manageEntity` is what attaches the bag, exactly as
       * the service's own creation path does. Using a bare `Sku` here would leave the member invisible to
       * `carriesErrorSurface` and the case would pass for the wrong reason.
       */
      const failing = manageEntity(new Sku(), SKU_ENTITY_METADATA);
      failing.skuID = 'cccccccccccccccccccccccccccccccc';
      failing.addError('skuCode', 'is not unique');
      withFailingSku.skus = [failing];

      const probe = admitAll({ product: withFailingSku });

      const result = await probe.handler.processProductUpdateSkus(payloadEvent('{}'));

      expect(probe.decisions).toStrictEqual(['rollback']);
      // The roll-back surfaces as a failure rather than as a 200 over discarded work.
      expect(result.statusCode).not.toBe(200);

      /*
       * And the finding itself is published, which it was not. The write boundary reports a refused gate
       * by raising a plain `DomainError`, and ./httpResponse maps that to `500` with all detail withheld —
       * so this caller used to receive an opaque service fault for a request its own SKU code refused. A
       * code review classified that as a MAJOR validation/error-mapping defect; the handler now lifts the
       * complete bag — the product's and every SKU's, because per-SKU findings never merge upward — into a
       * `ValidationError`, verbatim.
       */
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toStrictEqual({
        message: 'Validation failed',
        errors: { skuCode: ['is not unique'] },
      });
    });

    it('NET-NEW — a product-level finding also rolls back, and its key is published too', async () => {
      const withError = makeProduct();
      withError.addError('productName', 'is required');

      const probe = admitAll({ product: withError });

      const result = await probe.handler.processProductUpdateSkus(payloadEvent('{}'));

      expect(probe.decisions).toStrictEqual(['rollback']);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toStrictEqual({
        message: 'Validation failed',
        errors: { productName: ['is required'] },
      });
    });

    it('NET-NEW — AAP §0.4.1.5 — a legitimate ZERO survives into the process object', async () => {
      /*
       * `model/validation/Product_UpdateSkus.json` conditions the price rules on `{"eq":1}`, so the flag
       * values are data, not booleans. Reading them with truthiness would silently drop a legitimate `0`
       * and turn "explicitly do not update" into "unspecified".
       */
      const probe = admitAll();

      await probe.handler.processProductUpdateSkus(
        payloadEvent('{"updatePriceFlag":0,"price":0,"updateListPriceFlag":0,"listPrice":0}'),
      );

      const call = probe.calls.find((entry) => entry.member === 'processProductUpdateSkus');
      const processObject = call?.args[1] as ProductUpdateSkus | undefined;

      expect(processObject?.updatePriceFlag).toBe(0);
      expect(processObject?.price).toBe(0);
      expect(processObject?.updateListPriceFlag).toBe(0);
      expect(processObject?.listPrice).toBe(0);
    });

    it('NET-NEW — the addOptionGroup and addOption payload keys land on their process objects', async () => {
      const groupProbe = admitAll();
      await groupProbe.handler.processProductAddOptionGroup(
        payloadEvent('{"optionGroup":"group-1"}'),
      );
      const groupCall = groupProbe.calls.find(
        (entry) => entry.member === 'processProductAddOptionGroup',
      );
      expect((groupCall?.args[1] as ProductAddOptionGroup | undefined)?.optionGroup).toBe(
        'group-1',
      );

      const optionProbe = admitAll();
      await optionProbe.handler.processProductAddOption(payloadEvent('{"option":"option-1"}'));
      const optionCall = optionProbe.calls.find(
        (entry) => entry.member === 'processProductAddOption',
      );
      expect((optionCall?.args[1] as ProductAddOption | undefined)?.option).toBe('option-1');
    });

    it('NET-NEW — a malformed body is a 400 before any transaction opens', async () => {
      const probe = admitAll();

      const result = await probe.handler.processProductUpdateSkus(payloadEvent('not json'));

      expect(result.statusCode).toBe(400);
      expect(probe.decisions).toStrictEqual([]);
    });

    it('NET-NEW — processProductUpdateDefaultImageFileNames takes ONE argument, not two', async () => {
      /*
       * [model/service/ProductService.cfc:L208] declares `( required any product )` alone. It is the only
       * process member with that arity, and it reads no body.
       */
      const probe = admitAll();

      await probe.handler.processProductUpdateDefaultImageFileNames(identifierEvent(PRODUCT_ID));

      const call = probe.calls.find(
        (entry) => entry.member === 'processProductUpdateDefaultImageFileNames',
      );
      expect(call?.args).toHaveLength(1);
    });
  });

  /* API-01 — save, delete and the read-only routes. */

  describe('productHandler — API-01, saveProduct, saveProductType and deleteProduct', () => {
    it('NET-NEW — an ABSENT identifier CREATES through newProduct, and does not 404', async () => {
      const probe = admitAll();

      const result = await probe.handler.saveProduct({
        body: '{"productName":"New"}',
        pathParameters: {},
        headers: {},
      } satisfies ProductSaveEvent);

      expect(result.statusCode).toBe(200);
      expect(probe.calls.map((call) => call.member)).toStrictEqual(['newProduct', 'saveProduct']);
      expect(probe.calls.every((call) => call.through === 'graph')).toBe(true);
      expect(probe.decisions).toStrictEqual(['commit']);
    });

    it('NET-NEW — a PRESENT identifier UPDATES, and an unknown one is a 404', async () => {
      const present = admitAll();
      await present.handler.saveProduct(payloadEvent('{}'));
      expect(present.calls.map((call) => call.member)).toStrictEqual(['getProduct', 'saveProduct']);

      const missing = admitAll({ product: null });
      const result = await missing.handler.saveProduct(payloadEvent('{}'));
      expect(result.statusCode).toBe(404);
      // The read happened inside the unit, so it commits with nothing to undo; the save never ran.
      expect(missing.calls.map((call) => call.member)).toStrictEqual(['getProduct']);
    });

    it('NET-NEW — the saveProduct gate reads the PRE-SAVE subject, not only the returned instance', async () => {
      /*
       * The decisive case for the gate's first half. Step 5 of the service rebinds its local —
       * `product = await this.persistProduct(product)` — so the instance the persister answers with may
       * differ from the one validation accumulated onto. Here the pre-save subject carries the finding and
       * the persister answers with a different, clean product. A gate reading only the returned instance
       * would see no findings and commit a subject that had them.
       */
      const withError = makeProduct();
      withError.addError('productCode', 'is not unique');

      const clean = makeProduct('dddddddddddddddddddddddddddddddd');

      const probe = admitAll({ product: withError, savedProduct: clean });

      const result = await probe.handler.saveProduct(payloadEvent('{}'));

      expect(probe.decisions).toStrictEqual(['rollback']);
      /* The bag that caused the refusal is the pre-save subject's, and it is the one published. */
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toStrictEqual({
        message: 'Validation failed',
        errors: { productCode: ['is not unique'] },
      });
    });

    it('NET-NEW — the saveProduct gate ALSO reads the returned instance, not only the subject', async () => {
      /*
       * The mirror of the case above, so neither half of the disjunction can be dropped: the subject is
       * clean and the instance the persister answers with carries the finding.
       */
      const clean = makeProduct();

      const withError = makeProduct('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
      withError.addError('urlTitle', 'is not unique');

      const probe = admitAll({ product: clean, savedProduct: withError });

      const result = await probe.handler.saveProduct(payloadEvent('{}'));

      expect(probe.decisions).toStrictEqual(['rollback']);
      /*
       * And when the finding lives on the returned instance instead, that bag is the one published — which
       * is why the lift consults both references in the gate's own order.
       */
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toStrictEqual({
        message: 'Validation failed',
        errors: { urlTitle: ['is not unique'] },
      });
    });

    it('NET-NEW — L294 — saveProductType REQUIRES an identifier, so an absent one is a 400', async () => {
      /*
       * Unlike `saveProduct` there is no create route here: AAP §0.4.2.5 approves `getProductType` but no
       * `newProductType`, and no `createproducttype.cfm` view exists to imply one.
       */
      const probe = admitAll();

      const result = await probe.handler.saveProductType(productTypePayloadEvent('{}'));

      expect(result.statusCode).toBe(400);
      expect(probe.calls).toStrictEqual([]);
      expect(probe.decisions).toStrictEqual([]);
    });

    it('NET-NEW — saveProductType commits when the returned product type carries no findings', async () => {
      /*
       * The success half of the gate. `model/service/ProductService.cfc:L310` returns the product type on
       * every path, so "succeeded" is expressed as a returned entity with an empty bag — not as the absence
       * of a rejection.
       */
      const probe = admitAll();

      const result = await probe.handler.saveProductType(
        productTypePayloadEvent('{"productTypeName":"Merchandise"}', PRODUCT_TYPE_ID),
      );

      expect(result.statusCode).toBe(200);
      expect(probe.decisions).toStrictEqual(['commit']);
      expect(probe.calls.map((call) => call.member)).toStrictEqual([
        'getProductType',
        'saveProductType',
      ]);
    });

    it('NET-NEW — saveProductType ROLLS BACK and refuses when the returned product type carries findings', async () => {
      /*
       * The case that pins the commit gate. A gate hardcoded to ` => false` would rest on
       * `productType` having no error surface and on `baseService.save` raising, and neither holds:
       * The service composes the surface with `manageEntity` and resolves
       * `ProductTypeWithErrorState`, and the base service reproduces
       * `model/service/HibachiService.cfc:L103`'s single exit, so a validation failure returns.
       * With a constant `false` this exact request would commit the transaction and publish the
       * invalid entity.
       */
      const probe = admitAll({ productTypeSaveError: 'productTypeName' });

      const result = await probe.handler.saveProductType(
        productTypePayloadEvent('{"productTypeName":""}', PRODUCT_TYPE_ID),
      );

      expect(probe.decisions).toStrictEqual(['rollback']);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toStrictEqual({
        message: 'Validation failed',
        errors: { productTypeName: ['refused'] },
      });
      /*
       * The work still ran in full — the gate is a commit decision, not a pre-check that skips the save.
       */
      expect(probe.calls.map((call) => call.member)).toStrictEqual([
        'getProductType',
        'saveProductType',
      ]);
    });

    it('NET-NEW — L317 — deleteProduct reports its boolean UNINVERTED, and false is not a refusal', async () => {
      /*
       * The legacy declares `public boolean function deleteProduct(...)`. `false` means "the delete was
       * refused by a validation guard", which is a 200 carrying `false` — not a 4xx. Reinterpreting it as
       * a status would invent a refusal the legacy does not express.
       */
      const probe = admitAll();

      const result = await probe.handler.deleteProduct(identifierEvent(PRODUCT_ID));

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toBe(true);
      expect(probe.decisions).toStrictEqual(['commit']);
    });

    it('NET-NEW — L317 — a REFUSED delete is a 200 carrying false, NOT a 404 and NOT a 4xx', async () => {
      /*
       * The case that pins the boolean's meaning. `model/validation/Product.json` guards the delete on
       * `transactionExistsFlag` and `physicalCounts`, and a guard that refuses makes the legacy member
       * answer `false` — a successful call reporting "not deleted". Mapping that onto a 404 would conflate
       * "no such product" with "this product may not be deleted", and mapping it onto any 4xx would invent
       * a client error the legacy does not express.
       */
      const probe = admitAll({ deleteResult: false });

      const result = await probe.handler.deleteProduct(identifierEvent(PRODUCT_ID));

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toBe(false);
      // The refusal is the service's answer, so the unit still commits: nothing was written to undo.
      expect(probe.decisions).toStrictEqual(['commit']);
    });

    it('NET-NEW — deleteProduct on an unknown identifier is a 404, distinct from a refused delete', async () => {
      /*
       * Three outcomes must stay distinguishable: 404 "no such row", 200-carrying-`false` "a guard refused
       * the delete", and 200-carrying-`true` "deleted". Collapsing any pair would lose information the
       * legacy boolean carries.
       */
      const probe = admitAll({ product: null });

      const result = await probe.handler.deleteProduct(identifierEvent(PRODUCT_ID));

      expect(result.statusCode).toBe(404);
      expect(probe.calls.map((call) => call.member)).toStrictEqual(['getProduct']);
    });
  });

  describe('productHandler — API-01, the read-only routes', () => {
    it('NET-NEW — the read routes do NOT open a transaction', async () => {
      const probe = admitAll();

      await probe.handler.getProduct(identifierEvent(PRODUCT_ID));
      await probe.handler.getProductType(identifierEvent(PRODUCT_TYPE_ID));
      await probe.handler.getProductSmartList({ queryStringParameters: {}, headers: {} });
      await probe.handler.getFormattedOptionGroups(identifierEvent(PRODUCT_ID));

      expect(probe.decisions).toStrictEqual([]);
      expect(probe.calls.every((call) => call.through === 'service')).toBe(true);
    });

    it('NET-NEW — getProduct projects a response rather than returning the entity', async () => {
      const probe = admitAll();

      const result = await probe.handler.getProduct(identifierEvent(PRODUCT_ID));

      expect(result.statusCode).toBe(200);
      // A projection, so no domain method or private field can leak through the boundary.
      expect(JSON.parse(result.body)).toStrictEqual({ productID: PRODUCT_ID });
    });

    it('NET-NEW — getProduct on an unknown identifier is a 404, and an absent one is a 400', async () => {
      const missing = admitAll({ product: null });
      expect((await missing.handler.getProduct(identifierEvent(PRODUCT_ID))).statusCode).toBe(404);

      const absent = admitAll();
      const result = await absent.handler.getProduct(identifierEvent());
      expect(result.statusCode).toBe(400);
      expect(absent.calls).toStrictEqual([]);
    });

    it('NET-NEW — AAP §0.4.2.1 Discrepancy 1 — currentURL is NOT forwarded from the request', async () => {
      /*
       * [L342] declares `getProductSmartList(struct data={}, currentURL="")`, and `currentURL` carries no
       * CFML type at all. The target tightens it to an optional string and the boundary supplies no value
       * for it: a request-supplied URL is not the legacy's `currentURL`, which came from the framework.
       */
      const probe = admitAll();

      await probe.handler.getProductSmartList({
        queryStringParameters: { currentURL: 'https://attacker.test/' },
        headers: {},
      } satisfies ProductSmartListEvent);

      const call = probe.calls.find((entry) => entry.member === 'getProductSmartList');
      expect(call?.args[1]).toBeUndefined();
    });

    it('NET-NEW — only the legacy SmartList vocabulary is forwarded; unknown names are ignored', async () => {
      /*
       * `org/Hibachi/HibachiSmartList.cfc` recognises seven exact names and seven prefixes. Anything else
       * is not a filter and must not be smuggled into the query as one.
       */
      const probe = admitAll();

      await probe.handler.getProductSmartList({
        queryStringParameters: {
          keyword: 'shirt',
          'P:Current': '2',
          'F:productName': 'shirt',
          bogus: 'ignored',
          joins: 'ignored-too',
        },
        headers: {},
      });

      const call = probe.calls.find((entry) => entry.member === 'getProductSmartList');
      const input = call?.args[0] as Record<string, unknown> | undefined;

      expect(input).toStrictEqual({ keyword: 'shirt', 'P:Current': '2', 'F:productName': 'shirt' });
    });

    it('NET-NEW — the smart-list projection preserves every pagination member', async () => {
      const probe = admitAll();

      const result = await probe.handler.getProductSmartList({
        queryStringParameters: {},
        headers: {},
      });

      expect(JSON.parse(result.body)).toStrictEqual({
        records: [],
        pageRecords: [],
        recordsCount: 0,
        pageRecordsStart: 0,
        pageRecordsEnd: 0,
        currentPage: 1,
        totalPages: 0,
      });
    });

    it('NET-NEW — newProduct answers a projection of an unsaved product without a transaction', async () => {
      const probe = admitAll();

      const result = await probe.handler.newProduct({ headers: {} });

      expect(result.statusCode).toBe(200);
      expect(probe.decisions).toStrictEqual([]);
      expect(probe.calls.map((call) => call.member)).toStrictEqual(['newProduct']);
    });

    it('NET-NEW — getFormattedOptionGroups answers the grouped select projection KEYED BY NAME', async () => {
      const probe = admitAll();

      const result = await probe.handler.getFormattedOptionGroups(identifierEvent(PRODUCT_ID));

      expect(result.statusCode).toBe(200);
      /*
       * A keyed object on the wire, one member per option-group name, because that is the shape the
       * service answers — TR-1's tightening of the CFML struct at
       * `model/service/ProductService.cfc:L71-L79`. Publishing an array of `{optionGroupName,
       * options}` entries would contradict the legacy struct, which is what this case pins.
       * Both option members are copied verbatim and nothing else is published — no `optionGroupID` (AAP §0.7.3).
       */
      expect(JSON.parse(result.body)).toStrictEqual({
        Size: [{ name: 'Large', value: 'large' }],
      });
      expect(Array.isArray(JSON.parse(result.body))).toBe(false);
    });
  });

  /* API-01 — the plan-annotated boundary members: flagged, never dropped (TR-5) — and measured. */

  describe('productHandler — API-01/TR-5, the boundary-limited members stay routable', () => {
    it('NET-NEW — TR-5 — all five plan-annotated process members are PRESENT on the surface', () => {
      /*
       * "The member is never quietly dropped from the interface." Whatever each one does at run time is a
       * separate question, settled by the three cases below; presence on the surface is unconditional,
       * because §0.4.2's 28-member count is only checkable from the outside if every member is reachable.
       */
      const probe = admitAll();

      for (const member of [
        'processProductAddProductReview',
        'processProductAddSubscriptionTerm',
        'processProductDeleteDefaultImage',
        'processProductUpdateDefaultImageFileNames',
        'processProductUploadDefaultImage',
      ]) {
        expect(Object.keys(probe.handler)).toContain(member);
        expect(typeof (probe.handler as unknown as Record<string, unknown>)[member]).toBe(
          'function',
        );
      }
    });

    it('NET-NEW — the CONDITIONAL member answers the product on the legacy no-op path', async () => {
      /*
       * Of the five members AAP §0.4.2.1 annotates as boundary-stubbed,
       * `processProductDeleteDefaultImage` refuses only conditionally, and the condition is the legacy's
       * own: with no image file named there is nothing to delete, so the legacy no-op path answers the
       * product rather than refusing.
       */
      const probe = admitAll();

      const result = await probe.handler.processProductDeleteDefaultImage(payloadEvent('{}'));

      expect(result.statusCode).toBe(200);
      expect(probe.calls.map((call) => call.through)).toStrictEqual(['graph', 'graph']);
    });

    it('NET-NEW — the FULLY PORTED member answers the product, and refusing would break saveProduct', async () => {
      /*
       * The measured inventory, half two. `processProductUpdateDefaultImageFileNames` is not stubbed at all.
       * [model/service/ProductService.cfc:L208-L214] is a two-line loop — `sku.setImageFile(
       * sku.generateImageFileName() )` — and `generateImageFileName` reads only `SettingResolverPort`, an
       * in-scope port with a shipped resolver. Nothing excluded is on the path, so there is nothing to stub.
       */
      const probe = admitAll();

      const result = await probe.handler.processProductUpdateDefaultImageFileNames(
        identifierEvent(PRODUCT_ID),
      );

      expect(result.statusCode).toBe(200);
      expect(probe.calls.map((call) => call.member)).toStrictEqual([
        'getProduct',
        'processProductUpdateDefaultImageFileNames',
      ]);
      expect(probe.calls.map((call) => call.through)).toStrictEqual(['graph', 'graph']);
    });

    it('NET-NEW — the three process-object routes answer 501 WITHOUT reaching the graph', async () => {
      /*
       * What these three pin. Each forwards a process object whose members
       * `src/services/ProductService.ts` narrows by testing for a callable accessor, so a plain
       * payload cannot satisfy the narrowing and the route answers 501 before the graph is reached.
       */
      for (const member of [
        'processProductAddProductReview',
        'processProductAddSubscriptionTerm',
        'processProductUploadDefaultImage',
      ] as const) {
        const probe = admitAll();

        const result = await probe.handler[member](payloadEvent('{"listPrice":10}'));

        expect(result.statusCode).toBe(501);
        /*
         * The neutral text ./httpResponse publishes for this family — the member is named nowhere in it.
         */
        expect(JSON.parse(result.body)).toStrictEqual({
          message: 'This operation is not implemented',
        });
        expect(probe.calls).toStrictEqual([]);
      }
    });

    it('NET-NEW — the request-shape answers still come FIRST, so 501 is not a blanket reply', async () => {
      /*
       * An unaddressed product is still a 400 and an unparseable body is still a 400: the boundary refusal
       * is what a well-formed request receives, not what every request receives.
       */
      const probe = admitAll();

      const unaddressed = await probe.handler.processProductAddProductReview({
        body: '{}',
        pathParameters: null,
        headers: {},
      });
      const malformed = await probe.handler.processProductAddProductReview(payloadEvent('{'));

      expect(unaddressed.statusCode).toBe(400);
      expect(malformed.statusCode).toBe(400);
      expect(probe.calls).toStrictEqual([]);
    });

    it('NET-NEW — the GATE still answers before the boundary does', async () => {
      /*
       * Ordering, not status: an unauthorised caller must not be able to distinguish an unavailable member
       * from an available one. The refusal it receives is the gate's, and the graph is untouched.
       */
      const probe = makeHandler(undefined, EVERY_CRUD_TYPE);

      const result = await probe.handler.processProductAddSubscriptionTerm(payloadEvent('{}'));

      expect(result.statusCode).toBe(401);
      expect(probe.calls).toStrictEqual([]);
    });
  });
});
