/*
 * container.ts — the composition root.
 *
 * The single place the whole Catalog object graph is wired, and the declared replacement for the DI/1
 * runtime bean scan at `org/Hibachi/Hibachi.cfc:L289-L292`.
 *
 * (0) it is no longer the only wiring site, and the split is a reachability decision rather than A
 * stylistic one. This file names all thirty-one collaborators of the slice, so every module it imports is
 * retained in every bundle that can reach it — and a review pass (perf-01) measured the consequence: the
 * only edge from each of the five per-surface Lambda entries to its collaborators was a deferred
 * `require('./container')`, so the three-route brand artifact carried `ProductService`, `SkuService`, all
 * six entities, every repository, the product write boundary and the Google feed builder, and
 * {@link createCatalogContainer} constructed all of them on the first brand invocation.
 */

import { MySqlBrandRepository } from '../adapters/mysql/MySqlBrandRepository';
import { MySqlOptionRepository } from '../adapters/mysql/MySqlOptionRepository';
import type { ProductDependencyCleanup } from '../adapters/mysql/MySqlProductRepository';
import {
  MySqlProductPersistence,
  MySqlProductRepository,
  unresolvableImportUrlTitleFilter,
  unresolvableProductContentAssignmentFactory,
  unresolvableProductImportSourceReader,
} from '../adapters/mysql/MySqlProductRepository';
import { MySqlProductTypeRepository } from '../adapters/mysql/MySqlProductTypeRepository';
import type { OptionGroupSortOrderMemo } from '../adapters/mysql/MySqlSkuRepository';
import {
  MySqlSkuRepository,
  createOptionGroupSortOrderMemo,
  createTransactionExistenceChecker,
} from '../adapters/mysql/MySqlSkuRepository';
import type { SqlExecutor } from '../adapters/mysql/QueryRunner';
import { QueryRunner } from '../adapters/mysql/QueryRunner';
import type {
  AnonymousMaterialisationGate,
  CatalogAggregateDependencies,
  SmartListMaterialisationBudget,
} from '../adapters/mysql/SmartListQueryBuilder';
import {
  SmartListQueryBuilder,
  createAnonymousMaterialisationGate,
  createSmartListMaterialisationBudget,
  createCatalogAggregateLoaders,
} from '../adapters/mysql/SmartListQueryBuilder';
import { UniquePropertyChecker } from '../adapters/mysql/UniquePropertyChecker';
import type { TransactionScope } from '../adapters/mysql/UnitOfWork';
import { MySqlTransactionalWriteRunner, UnitOfWork } from '../adapters/mysql/UnitOfWork';
import type { IdentifiedProductDefaultSku } from '../adapters/mysql/rowMappers';
import {
  readHydratedParentProductTypeID,
  readProductDefaultSkuId,
} from '../adapters/mysql/rowMappers';
import { StaticSettingResolver } from '../adapters/settings/StaticSettingResolver';
import type { ManagedEntity, PropertyDescriptorSet } from '../domain/base/populate';
import { populate } from '../domain/base/populate';
import type { BrandPropertyName } from '../domain/product/Brand';
import { BRAND_PROPERTY_DESCRIPTORS } from '../domain/product/Brand';
import type { ProductPropertyName } from '../domain/product/Product';
import {
  PRODUCT_PROPERTY_DESCRIPTORS,
  /*
   * `product` is a value import here, not a type-only import, because the brand delete-subject
   * resolver constructs identifier-only products to fill the collection ceiling counts that
   * `model/validation/Brand.json:L6` gates the delete on.
   */
  Product,
} from '../domain/product/Product';
import type {
  ProductType,
  ProductTypePopulationCollaborators,
  ProductTypePropertyName,
  ProductTypeRootResolver,
} from '../domain/product/ProductType';
import { createProductTypePropertyDescriptorSet } from '../domain/product/ProductType';
import type { DefaultSkuIdReader, Sku } from '../domain/sku/Sku';
import { DomainError, NotImplementedError } from '../errors/DomainError';
import { GoogleIntegration } from '../integrations/google/GoogleIntegration';
import type {
  ProductFeedImage,
  ProductFeedRecord,
} from '../integrations/google/ProductFeedBuilder';
import {
  ProductFeedBuilder,
  createProductFeedRenderBudget,
} from '../integrations/google/ProductFeedBuilder';
import { ProductFeedQuery } from '../integrations/google/ProductFeedQuery';
import type { AccessContentPort } from '../ports/AccessContentPort';
import type {
  AccountContextPort,
  PopulationAuthorizationPort,
  RequestAuthorizationContext,
} from '../ports/AccountContextPort';
import type { ImagePathPort } from '../ports/ImagePathPort';
import type { PricingPort } from '../ports/PricingPort';
import type { SettingResolverPort } from '../ports/SettingResolverPort';
import type { SmartListQueryPort } from '../ports/SmartListQueryPort';
import { buildIdentifierQuery } from '../ports/SmartListQueryPort';
import type { SubscriptionTermPort } from '../ports/SubscriptionTermPort';
import type { TransactionalWriteRunner, UniquePropertyPort } from '../ports/UniquePropertyPort';
import type { BrandRepository } from '../ports/repositories/BrandRepository';
import type { OptionRepository } from '../ports/repositories/OptionRepository';
import type { ProductRepository } from '../ports/repositories/ProductRepository';
import type { ProductTypeRepository } from '../ports/repositories/ProductTypeRepository';
import type { SkuRepository } from '../ports/repositories/SkuRepository';
import type {
  DeleteSubjectResolver,
  EntityCommentCleanupPort,
  EntitySettingCleanupPort,
} from '../services/BaseService';
import { BaseService } from '../services/BaseService';
import type { ManagedBrand } from '../services/BrandService';
import { BrandService } from '../services/BrandService';
import { OptionService } from '../services/OptionService';
import { ProductService } from '../services/ProductService';
import type { ProductWithErrorState, SkuCombinationBudget } from '../services/SkuService';
import { SkuService, createSkuCombinationBudget } from '../services/SkuService';
import type { UniqueValueProbe, UrlTitleProbeBudget } from '../util/urlTitle';
import { createUrlTitleProbeBudget } from '../util/urlTitle';
import { Validator } from '../validation/Validator';
import { brandValidationRules } from '../validation/rules/brand.rules';
import { productValidationRuleSet } from '../validation/rules/product.rules';
import { productTypeValidationRuleSet } from '../validation/rules/productType.rules';
import { pool } from './database';
import type { AppConfig, ResourceBoundsConfig } from './env';
import { config } from './env';

/*
 * Folded IN FROM `src/config/{catalogBoundaries,catalogStatements,catalogReads}.ts` AND
 * `src/config/surfaces/{brand,option,feed,sku,product}Surface.ts`
 * — AAP §0.3.1 / §0.4.1 file inventory
 * These eight modules were split out of this file to close a performance finding: every per-surface
 * Lambda entry reached its collaborators through a deferred `require` of this module, and this module
 * names all 31 collaborators of the slice, so each narrow entry retained — and on first invocation
 * constructed — the whole catalog graph.
 */
/*
 * The boundary stubs, declared inline.
 * TR-5 reads: "Cross the scope boundary only through a declared port. Where an in-scope member
 * depends on an out-of-scope collaborator, the port interface is declared, the member is implemented
 * against it, and the gap is flagged. The member is never quietly dropped from the interface."
 */

/**
 * Refuses one member of one boundary port, naming the legacy collaborator that owns the real
 * behaviour.
 */
export function refuseBoundary(member: string, reason: string): never {
  throw new NotImplementedError(member, reason);
}

/**
 * Subscription terms and benefits — `subscriptionService`, three call sites in
 * `model/service/SkuService.cfc` and one at `model/service/ProductService.cfc:L173`. The
 * `subscription` branch of the combination engine [`model/service/SkuService.cfc:L58-L211`] and
 * `processProductAddSubscriptionTerm` both reach it. The `Subscription*` family is excluded.
 */
export const notImplementedSubscriptionTermPort: SubscriptionTermPort = {
  getSubscriptionTerm: () =>
    refuseBoundary(
      'SubscriptionTermPort.getSubscriptionTerm',
      'it stands for subscriptionService, whose family model/**/Subscription*.cfc is out of scope',
    ),
  getSubscriptionBenefit: () =>
    refuseBoundary(
      'SubscriptionTermPort.getSubscriptionBenefit',
      'it stands for subscriptionService, whose family model/**/Subscription*.cfc is out of scope',
    ),
  getSubscriptionTermsByIDs: () =>
    refuseBoundary(
      'SubscriptionTermPort.getSubscriptionTermsByIDs',
      'it stands for subscriptionService, whose family model/**/Subscription*.cfc is out of scope',
    ),
  getSubscriptionBenefitsByIDs: () =>
    refuseBoundary(
      'SubscriptionTermPort.getSubscriptionBenefitsByIDs',
      'it stands for subscriptionService, whose family model/**/Subscription*.cfc is out of scope',
    ),
};

/**
 * Access content — `contentService`, two call sites in `model/service/SkuService.cfc`, reached by the
 * `contentAccess` branch of the combination engine. The `Content*` family is excluded.
 */
export const notImplementedAccessContentPort: AccessContentPort = {
  getContent: () =>
    refuseBoundary(
      'AccessContentPort.getContent',
      'it stands for contentService, whose family model/**/Content*.cfc is out of scope',
    ),
  getContentsByIDs: () =>
    refuseBoundary(
      'AccessContentPort.getContentsByIDs',
      'it stands for contentService, whose family model/**/Content*.cfc is out of scope',
    ),
};

/**
 * The hidden dynamic dependency. `model/service/SkuService.cfc:L212` calls
 * `getService("imageService").saveImageFile(…, allowedExtensions="jpg,jpeg,png,gif")` and
 * `imageService` is never declared as a property on that component. Any dependency analysis driven by
 * component metadata therefore misses it entirely, and a port built from such an analysis would
 * compile and then fail at the first image operation. It is surfaced here as `ImagePathPort`, which
 * also carries the derived image-path members at `model/entity/Sku.cfc:L145`, `:L192` and `:L221`.
 */
export const notImplementedImagePathPort: ImagePathPort = {
  getImagePath: () =>
    refuseBoundary(
      'ImagePathPort.getImagePath',
      'it stands for imageService, resolved dynamically at model/service/SkuService.cfc:L212 and out of scope',
    ),
  getResizedImagePath: () =>
    refuseBoundary(
      'ImagePathPort.getResizedImagePath',
      'it stands for imageService, resolved dynamically at model/service/SkuService.cfc:L212 and out of scope',
    ),
  getImageExistsFlag: () =>
    refuseBoundary(
      'ImagePathPort.getImageExistsFlag',
      'it stands for imageService, resolved dynamically at model/service/SkuService.cfc:L212 and out of scope',
    ),
  saveImageFile: () =>
    refuseBoundary(
      'ImagePathPort.saveImageFile',
      'it stands for imageService, resolved dynamically at model/service/SkuService.cfc:L212 and out of scope',
    ),
};

/**
 * Sale-price details — the `priceGroupService`, `currencyService` and `promotionService` trio the
 * non-persistent sale-price members of `model/entity/Sku.cfc` and `Product.price` reach. All three
 * families are excluded, which is exactly why AAP §0.2.2.6 draws the calculated-property boundary.
 * The Google feed's conditional `g:sale_price` pair is the one in-scope reader.
 */
export const notImplementedPricingPort: PricingPort = {
  getSalePriceDetailsForProductSkus: () =>
    refuseBoundary(
      'PricingPort.getSalePriceDetailsForProductSkus',
      'it stands for priceGroupService, currencyService and promotionService, all out of scope',
    ),
};

/**
 * The acting principal — the `getHibachiScope()` request lookup at
 * `org/Hibachi/HibachiObject.cfc:L74-L76`.
 */
export const notImplementedAccountContextPort: AccountContextPort = {
  getCurrentAccount: () =>
    refuseBoundary(
      'AccountContextPort.getCurrentAccount',
      'the acting principal is resolved per invocation at the handler edge, never captured by the memoized graph',
    ),
};

/**
 * The setting-side effect of the local delete and save overrides — `settingService` at
 * `model/service/HibachiService.cfc:L76`, `:L94-L96` and `:L98-L100`. The `Setting*` family is
 * excluded.
 */
export const notImplementedSettingCleanupPort: EntitySettingCleanupPort = {
  removeAllEntityRelatedSettings: () =>
    refuseBoundary(
      'EntitySettingCleanupPort.removeAllEntityRelatedSettings',
      'it stands for settingService at model/service/HibachiService.cfc:L76, whose family is out of scope',
    ),
  updateAllSettingValuesToRemoveSpecificID: () =>
    refuseBoundary(
      'EntitySettingCleanupPort.updateAllSettingValuesToRemoveSpecificID',
      'it stands for settingService at model/service/HibachiService.cfc:L94-L96, whose family is out of scope',
    ),
  clearAllSettingsCache: () =>
    refuseBoundary(
      'EntitySettingCleanupPort.clearAllSettingsCache',
      'it stands for settingService at model/service/HibachiService.cfc:L98-L100, whose family is out of scope',
    ),
};

/**
 * The comment-side effect of the local delete override — `commentService` at
 * `model/service/HibachiService.cfc:L79`. No comment family is in scope anywhere in this slice,
 * because there is none to list.
 */
export const notImplementedCommentCleanupPort: EntityCommentCleanupPort = {
  removeAllEntityRelatedComments: () =>
    refuseBoundary(
      'EntityCommentCleanupPort.removeAllEntityRelatedComments',
      'it stands for commentService at model/service/HibachiService.cfc:L79, which this slice does not convert',
    ),
};

/**
 * The link-table cleanup a product or product-type removal performs across excluded families —
 * declared by `../adapters/mysql/MySqlProductRepository.ts`, which states that its implementation
 * belongs outside this subtree.
 */
export const notImplementedProductDependencyCleanup: ProductDependencyCleanup = {
  removeProductDependencies: () =>
    refuseBoundary(
      'ProductDependencyCleanup.removeProductDependencies',
      'the link tables it clears belong to excluded families — promotion, price group, attribute and physical',
    ),
  removeProductTypeDependencies: () =>
    refuseBoundary(
      'ProductDependencyCleanup.removeProductTypeDependencies',
      'the link tables it clears belong to excluded families — promotion, price group, attribute and physical',
    ),
};

/**
 * Arms 2 and 3 of the population gate at `org/Hibachi/HibachiTransient.cfc:L186-L190`, wired
 * fail-closed.
 */
export const denyAllPopulationAuthorization: PopulationAuthorizationPort = {
  getPublicPopulateFlag: () => false,
  authenticateEntityProperty: () => false,
};

/** Binds one hydrated SKU to the synchronous delegate `product.defaultSku` accepts. */
export type DefaultSkuDelegateBinder = (sku: Sku) => IdentifiedProductDefaultSku;

/**
 * Adapts a hydrated `Sku` to the nine-member delegate `Product.defaultSku` accepts.
 *
 * @param settings the real setting resolver, closed over for `getCurrencyCode`
 */
export function createDefaultSkuDelegateBinder(
  settings: SettingResolverPort,
): DefaultSkuDelegateBinder {
  const boundDelegates = new WeakMap<Sku, IdentifiedProductDefaultSku>();

  const refuseImageMember = (member: string): never =>
    refuseBoundary(
      `IdentifiedProductDefaultSku.${member}`,
      'the delegate declares it synchronous while Sku answers asynchronously through ImagePathPort, which is out of scope',
    );

  return (sku: Sku): IdentifiedProductDefaultSku => {
    const existing = boundDelegates.get(sku);
    if (existing !== undefined) {
      return existing;
    }

    const delegate: IdentifiedProductDefaultSku = {
      /*
       * Carried so `readProductDefaultSkuId` can read the identifier off the delegate without a cast
       * — the mechanism `../adapters/mysql/rowMappers.ts` declares for exactly this slot.
       */
      skuID: sku.skuID,
      getPrice: () => sku.getPrice(),
      getListPrice: () => sku.getListPrice(),
      getRenewalPrice: () => sku.getRenewalPrice(),
      getCurrencyCode: () => sku.getCurrencyCode(settings),
      getImageDirectory: () => refuseImageMember('getImageDirectory'),
      getImagePath: () => refuseImageMember('getImagePath'),
      getImage: () => refuseImageMember('getImage'),
      getResizedImagePath: () => refuseImageMember('getResizedImagePath'),
      getImageExistsFlag: () => refuseImageMember('getImageExistsFlag'),
    };

    boundDelegates.set(sku, delegate);

    return delegate;
  };
}

/** Reads the identifier of whatever sits in `product.defaultSku`. */
export const readDefaultSkuIdOrRefuse: DefaultSkuIdReader = (defaultSku) => {
  const skuID = readProductDefaultSkuId(defaultSku);

  if (skuID === undefined) {
    throw new DomainError(
      "A product's default SKU was read for its identifier and carried none. The delegate in that " +
        'slot is expected to be either a hydrated SKU or the identifier-carrying reference the row ' +
        'mappers mint, and this one was neither.',
    );
  }

  return skuID;
};

/* The resolved tier. */

/** The substitutions a caller may make to tier 1. */
export interface CatalogBoundaryOverrides {
  readonly settings?: SettingResolverPort;
  readonly imagePaths?: ImagePathPort;
  readonly pricing?: PricingPort;
  readonly subscriptionTerms?: SubscriptionTermPort;
  readonly accessContent?: AccessContentPort;
  readonly accountContext?: AccountContextPort;
  readonly populationAuthorization?: PopulationAuthorizationPort;
  readonly settingCleanup?: EntitySettingCleanupPort;
  readonly commentCleanup?: EntityCommentCleanupPort;
  readonly productDependencyCleanup?: ProductDependencyCleanup;
}

/**
 * Tier 1, resolved: the boundary collaborators every surface graph and the aggregate graph share.
 */
export interface CatalogBoundaries {
  readonly settings: SettingResolverPort;
  readonly imagePaths: ImagePathPort;
  readonly pricing: PricingPort;
  readonly subscriptionTerms: SubscriptionTermPort;
  readonly accessContent: AccessContentPort;
  readonly accountContext: AccountContextPort;
  readonly populationAuthorization: PopulationAuthorizationPort;
  readonly settingCleanup: EntitySettingCleanupPort;
  readonly commentCleanup: EntityCommentCleanupPort;
  readonly productDependencyCleanup: ProductDependencyCleanup;
}

/**
 * Re-binds the two principal-bearing boundaries to one invocation's authorised security context.
 */
function scopeBoundariesToInvocation(
  boundaries: CatalogBoundaries,
  security: RequestAuthorizationContext,
): CatalogBoundaries {
  return Object.freeze({
    ...boundaries,
    accountContext: security.accountContext,
    populationAuthorization: security.populationAuthorization,
  });
}

/**
 * Resolves tier 1 from a caller's substitutions, falling back to the production collaborator for each.
 */
export function resolveCatalogBoundaries(
  overrides: CatalogBoundaryOverrides = {},
): CatalogBoundaries {
  return {
    settings: overrides.settings ?? new StaticSettingResolver(config.settings),
    imagePaths: overrides.imagePaths ?? notImplementedImagePathPort,
    pricing: overrides.pricing ?? notImplementedPricingPort,
    subscriptionTerms: overrides.subscriptionTerms ?? notImplementedSubscriptionTermPort,
    accessContent: overrides.accessContent ?? notImplementedAccessContentPort,
    accountContext: overrides.accountContext ?? notImplementedAccountContextPort,
    populationAuthorization: overrides.populationAuthorization ?? denyAllPopulationAuthorization,
    settingCleanup: overrides.settingCleanup ?? notImplementedSettingCleanupPort,
    commentCleanup: overrides.commentCleanup ?? notImplementedCommentCleanupPort,
    productDependencyCleanup:
      overrides.productDependencyCleanup ?? notImplementedProductDependencyCleanup,
  };
}
/** The substitutions a caller may make to this tier. */
export interface CatalogStatementOverrides {
  readonly uniqueProperty?: UniquePropertyPort;
  readonly isUrlTitleAvailable?: UniqueValueProbe;
}

/** Tier 2 and tier 4, resolved: statement execution, the uniqueness gate and the validator. */
export interface CatalogStatements {
  /** `pool.execute()` over the shared pool — the port of the legacy DAO query primitives. */
  readonly queryRunner: QueryRunner;

  /** The explicit transaction boundary M5 requires in place of the implicit request-end commit. */
  readonly unitOfWork: UnitOfWork;

  /** The concrete checker, exposed because the write boundaries need its `withExecutor` member. */
  readonly uniquePropertyChecker: UniquePropertyChecker;

  /** The port the validator's `unique` rules consult — the caller's override, or the checker. */
  readonly uniqueProperty: UniquePropertyPort;

  /** The URL-title probe, wrapped so `this` cannot be lost. `true` means available. */
  readonly isUrlTitleAvailable: UniqueValueProbe;

  /** The validator, built once. */
  readonly validator: Validator;
}

/**
 * Builds the statement tier over the one module-scope pool.
 */
export function createCatalogStatements(
  overrides: CatalogStatementOverrides = {},
): CatalogStatements {
  const queryRunner = new QueryRunner(pool);
  const unitOfWork = new UnitOfWork(pool);
  const uniquePropertyChecker = new UniquePropertyChecker(queryRunner);
  const uniqueProperty: UniquePropertyPort = overrides.uniqueProperty ?? uniquePropertyChecker;

  /*
   * The probe is wrapped, not passed bare, and the polarity is the highest-risk semantic in this
   * file. `isUrlTitleAvailable` is a method on the checker, so a bare
   * `uniquePropertyChecker.isUrlTitleAvailable` would lose `this` and fail at run time with no compile
   * error — `../adapters/mysql/UniquePropertyChecker.ts` says in its own words that a composition root
   * must hand it over wrapped. And `true` means available: `model/service/DataService.cfc:L64` loops
   * `while(!unique)`, so an inverted probe either never terminates or hands out duplicate titles, and
   * neither failure is a type error.
   */
  const isUrlTitleAvailable: UniqueValueProbe =
    overrides.isUrlTitleAvailable ??
    ((tableName, value) => uniquePropertyChecker.isUrlTitleAvailable(tableName, value));

  return {
    queryRunner,
    unitOfWork,
    uniquePropertyChecker,
    uniqueProperty,
    isUrlTitleAvailable,
    validator: new Validator(uniqueProperty),
  };
}

/** The statement collaborators a write boundary rebuilds against its own connection. */
export interface BoundaryStatements {
  /** The locking uniqueness checker, bound to the boundary's executor. */
  readonly uniqueProperty: UniquePropertyChecker;

  /** The URL-title probe over that same checker, wrapped so `this` cannot be lost. */
  readonly isUrlTitleAvailable: UniqueValueProbe;

  /** A validator that consults the boundary-scoped checker rather than the pool-bound one. */
  readonly validator: Validator;
}

/**
 * Re-binds the uniqueness gate to a transaction's own connection.
 *
 */
export function createBoundaryStatements(
  uniquePropertyChecker: UniquePropertyChecker,
  executor: TransactionScope['executor'],
): BoundaryStatements {
  const uniqueProperty = uniquePropertyChecker.withExecutor(executor);

  return {
    uniqueProperty,
    isUrlTitleAvailable: (tableName, value) => uniqueProperty.isUrlTitleAvailable(tableName, value),
    validator: new Validator(uniqueProperty),
  };
}

/** The narrow product read the SKU write boundary runs against its own connection. */
export type ProductAggregateReader = (productID: string) => Promise<Product | null>;

/**
 * Builds the paginated dynamic-query adapter over one executor.
 *
 *
 */
export function createSmartListQueryPort(
  executor: SqlExecutor,
  dependencies: CatalogAggregateDependencies,
  materialisationBudget: SmartListMaterialisationBudget,
): SmartListQueryPort {
  return new SmartListQueryBuilder(
    executor,
    createCatalogAggregateLoaders(dependencies),
    materialisationBudget,
  );
}

/**
 * Resolves a product type by identifier so `Product.getBaseProductType(…)` can walk
 * `productTypeIDPath` to its root and answer the discriminator the three process contexts gate on.
 */
export function createProductTypeRootResolver(
  smartListQueryPort: SmartListQueryPort,
): ProductTypeRootResolver {
  return {
    getProductType: async (productTypeID: string) => {
      const records = await smartListQueryPort.executeRecords(
        buildIdentifierQuery('SlatwallProductType', 'productTypeID', productTypeID),
      );

      /*
       * `noUncheckedIndexedAccess` already yields `ProductType | undefined` here, which is precisely
       * the contract: absent means "no such product type", the same answer the legacy `get(id)` gave
       * by returning null.
       */
      return records[0];
    },
  };
}

/**
 * Reads one product aggregate by its identifier.
 */
export function createProductAggregateReader(
  smartListQueryPort: SmartListQueryPort,
): ProductAggregateReader {
  return async (productID: string) => {
    const records = await smartListQueryPort.executeRecords(
      buildIdentifierQuery('SlatwallProduct', 'productID', productID),
    );

    return records[0] ?? null;
  };
}

/* The brand surface. */

/* The two delete-subject resolvers. */

/**
 * Resolves `Product.transactionExistsFlag` before the delete guard of `model/validation/Product.json:L7`
 * reads it.
 */
export function createProductDeleteSubjectResolver(
  skus: Pick<SkuRepository, 'transactionExists'>,
): DeleteSubjectResolver<Product> {
  return async (product) => {
    await product.getTransactionExistsFlag(createTransactionExistenceChecker(skus));

    return product;
  };
}

/**
 * Fills `brand.getProducts()` before the delete guard of `model/validation/Brand.json:L6` counts it.
 */
export function createBrandDeleteSubjectResolver(
  brands: Pick<BrandRepository, 'findProductIdentifiersByBrand'>,
): DeleteSubjectResolver<ManagedBrand> {
  return async (brand) => {
    const ownedProductIDs = await brands.findProductIdentifiersByBrand(brand.brandID);

    /*
     * The live array, by reference — `Brand.getProducts()` documents that contract, and the rule reads the
     * same array. Replaced rather than appended to, so a resolver that ran twice on one instance cannot
     * double the count it reports.
     */
    const products = brand.getProducts();
    products.length = 0;
    for (const productID of ownedProductIDs) {
      const owned = new Product();
      owned.productID = productID;
      products.push(owned);
    }

    return brand;
  };
}

/** What {@link composeBrandSurface} needs, and the one substitution its callers may make. */
export interface BrandSurfaceDependencies {
  /** tier 1 — the executor-free boundary collaborators. */
  readonly boundaries: CatalogBoundaries;

  /** Tier 2 and 4 — statement execution, the uniqueness gate and the validator. */
  readonly statements: CatalogStatements;

  /** A caller-supplied repository, honoured in place of the MySQL adapter. */
  readonly brandRepository?: BrandRepository;

  /**
   * The URL-title probe ceiling — see `../util/urlTitle`'s
   * `UrlTitleProbeBudget`.
   */
  readonly urlTitleProbeBudget: UrlTitleProbeBudget;

  /** A substitute for the brand write boundary, as a whole runner. */
  readonly brandWriteRunner?: TransactionalWriteRunner<BrandService>;
}

/** Everything the brand surface builds, including the parts `../container.ts` republishes. */
export interface BrandSurfaceParts {
  readonly brandRepository: BrandRepository;
  readonly brandBaseService: BaseService<ManagedBrand, BrandPropertyName>;
  readonly brandService: BrandService;

  /** The brand write boundary. See {@link buildBrandBoundaryGraph}. */
  readonly brandWriteRunner: TransactionalWriteRunner<BrandService>;
}

/**
 * Wires the brand surface from resolved dependencies.
 *
 * @param dependencies the resolved tiers plus the optional repository substitution
 * @returns the three brand collaborators.
 */
export function composeBrandSurface(dependencies: BrandSurfaceDependencies): BrandSurfaceParts {
  const { boundaries, statements } = dependencies;

  const brandRepository: BrandRepository =
    dependencies.brandRepository ??
    new MySqlBrandRepository(statements.queryRunner, boundaries.accountContext);

  const brandBaseService = new BaseService<ManagedBrand, BrandPropertyName>({
    validator: statements.validator,
    ruleSet: brandValidationRules,
    propertyDescriptors: BRAND_PROPERTY_DESCRIPTORS,
    populationAuthorization: boundaries.populationAuthorization,
    persist: (brand) => brandRepository.saveBrand(brand),
    remove: async (brand) => {
      await brandRepository.deleteBrand(brand);
    },
    /*
     * — the delete guard of `model/validation/Brand.json:L6` counts the brand's products, and the
     * subject it counts them on must be read rather than assumed: a caller may hand in an
     * identifier-only brand whose collection has never been hydrated, and an unhydrated empty
     * collection would pass a guard the legacy fails. Built from the pool repository here, and rebuilt
     * from the boundary's own repository inside {@link buildBrandBoundaryGraph}.
     */
    resolveDeleteSubject: createBrandDeleteSubjectResolver(brandRepository),
    settingCleanup: boundaries.settingCleanup,
    commentCleanup: boundaries.commentCleanup,
  });

  return {
    brandRepository,
    brandBaseService,
    brandService: new BrandService(
      brandRepository,
      brandBaseService,
      dependencies.urlTitleProbeBudget,
    ),
    brandWriteRunner:
      dependencies.brandWriteRunner ??
      new MySqlTransactionalWriteRunner<BrandService>(statements.unitOfWork, (scope, security) =>
        buildBrandBoundaryGraph(dependencies, scope, security),
      ),
  };
}

/**
 * Rebuilds the brand writing graph against one transaction's executor.
 */
export function buildBrandBoundaryGraph(
  dependencies: BrandSurfaceDependencies,
  scope: TransactionScope,
  security: RequestAuthorizationContext,
): BrandService {
  const { statements } = dependencies;
  /*
   * — the write runs as the principal the route gate authorised, not as the memoised pair.
   * See {@link scopeBoundariesToInvocation}.
   */
  const boundaries = scopeBoundariesToInvocation(dependencies.boundaries, security);
  const { executor } = scope;

  const boundaryStatements = createBoundaryStatements(statements.uniquePropertyChecker, executor);
  const boundaryBrandRepository = new MySqlBrandRepository(executor, boundaries.accountContext);

  const boundaryBrandBaseService = new BaseService<ManagedBrand, BrandPropertyName>({
    validator: boundaryStatements.validator,
    ruleSet: brandValidationRules,
    propertyDescriptors: BRAND_PROPERTY_DESCRIPTORS,
    populationAuthorization: boundaries.populationAuthorization,
    persist: (brand) => boundaryBrandRepository.saveBrand(brand),
    remove: async (brand) => {
      await boundaryBrandRepository.deleteBrand(brand);
    },
    resolveDeleteSubject: createBrandDeleteSubjectResolver(boundaryBrandRepository),
    settingCleanup: boundaries.settingCleanup,
    commentCleanup: boundaries.commentCleanup,
  });

  /*
   * — the same budget the pool-bound service holds, so the write path that actually probes is
   * bounded and not merely the read path.
   */
  return new BrandService(
    boundaryBrandRepository,
    boundaryBrandBaseService,
    dependencies.urlTitleProbeBudget,
  );
}

/** The narrow graph `src/handlers/brandHandler.ts` resolves on its first invocation. */
export interface BrandSurfaceGraph {
  readonly brandService: BrandService;

  /** The write boundary the entry's two mutating routes run inside. */
  readonly brandWriteRunner: TransactionalWriteRunner<BrandService>;

  /** Discards this surface's request-scoped derived state (M7). */
  readonly beginInvocation: () => void;
}

/**
 * Builds the brand surface's own graph over the module-scope pool.
 *
 * @returns a fresh narrow graph.
 */
export function createBrandSurfaceGraph(): BrandSurfaceGraph {
  const { brandService, brandWriteRunner } = composeBrandSurface({
    boundaries: resolveCatalogBoundaries(),
    statements: createCatalogStatements(),
    /*
     * — built from whatever figure this deployment stated. Stating none is legal and yields a
     * budget whose resolver refuses by name the first time a title would have been derived.
     */
    urlTitleProbeBudget: createUrlTitleProbeBudget(
      config.resourceBounds.urlTitleMaximumProbesPerDerivation,
    ),
  });

  return Object.freeze({
    brandService,
    brandWriteRunner,
    beginInvocation: (): void => {
      /* Nothing to discard — see {@link BrandSurfaceGraph.beginInvocation}. */
    },
  });
}

/** The memo cell for the brand surface — one of six in this module, not the only one. */
const memoizedBrandSurface: { graph: BrandSurfaceGraph | undefined } = { graph: undefined };

/**
 * The production accessor: builds the narrow graph on first call and returns the same graph thereafter.
 *
 * @returns the memoized narrow graph.
 */
export function getBrandSurfaceGraph(): BrandSurfaceGraph {
  memoizedBrandSurface.graph ??= createBrandSurfaceGraph();

  return memoizedBrandSurface.graph;
}

/* The option surface. */

/** What {@link composeOptionSurface} needs, and the two substitutions its callers may make. */
export interface OptionSurfaceDependencies {
  /** tier 2 and 4 — statement execution, the uniqueness gate and the validator. */
  readonly statements: CatalogStatements;

  /**
   * The paginated dynamic-query adapter both smart-list members and both identifier loads read through.
   */
  readonly smartListQueryPort: SmartListQueryPort;

  /** A caller-supplied repository, honoured in place of the MySQL adapter. */
  readonly optionRepository?: OptionRepository;
}

/** Everything the option surface builds, including the parts `../container.ts` republishes. */
export interface OptionSurfaceParts {
  readonly optionRepository: OptionRepository;
  readonly optionService: OptionService;
}

/**
 * Wires the option surface from resolved dependencies.
 */
export function composeOptionSurface(dependencies: OptionSurfaceDependencies): OptionSurfaceParts {
  const optionRepository: OptionRepository =
    dependencies.optionRepository ?? new MySqlOptionRepository(dependencies.statements.queryRunner);

  return {
    optionRepository,
    optionService: new OptionService(optionRepository, dependencies.smartListQueryPort),
  };
}

/** The narrow graph `src/handlers/optionHandler.ts` resolves on its first invocation. */
export interface OptionSurfaceGraph {
  readonly optionService: OptionService;

  /** Discards this surface's request-scoped derived state (M7). */
  readonly beginInvocation: () => void;
}

/**
 * Builds the option surface's own graph over the module-scope pool.
 *
 * @returns a fresh narrow graph.
 */
export function createOptionSurfaceGraph(): OptionSurfaceGraph {
  const boundaries = resolveCatalogBoundaries();
  const statements = createCatalogStatements();

  const { optionService } = composeOptionSurface({
    statements,
    smartListQueryPort: createSmartListQueryPort(
      statements.queryRunner,
      { bindDefaultSkuDelegate: createDefaultSkuDelegateBinder(boundaries.settings) },
      /*
       * — the narrow option artifact is bounded exactly as the aggregate is; a budget wired
       * into one entry and not another is the partial-wiring failure mode.
       */
      createSmartListMaterialisationBudget(
        config.resourceBounds.smartListMaximumRecordsPerQuery,
        config.resourceBounds.smartListMaximumPredicatesPerQuery,
      ),
    ),
  });

  return Object.freeze({
    optionService,
    beginInvocation: (): void => {
      /* Nothing to discard — see {@link OptionSurfaceGraph.beginInvocation}. */
    },
  });
}

/** The memo cell for the option surface — one of six in this module, not the only one. */
const memoizedOptionSurface: { graph: OptionSurfaceGraph | undefined } = { graph: undefined };

/**
 * The production accessor: builds the narrow graph on first call and returns the same graph thereafter.
 *
 * @returns the memoized narrow graph.
 */
export function getOptionSurfaceGraph(): OptionSurfaceGraph {
  memoizedOptionSurface.graph ??= createOptionSurfaceGraph();

  return memoizedOptionSurface.graph;
}

/* The Google feed surface. */

/** What {@link composeFeedSurface} needs. */
export interface FeedSurfaceDependencies {
  /** The effective resource bounds (CWE-400). */
  readonly resourceBounds: ResourceBoundsConfig;

  /**
   * The feed's product-image reader. Omitted means
   * {@link productFeedImagesFromDomain}, which refuses for a product that has images rather than
   * silently emitting an image-less document.
   */
  readonly productFeedImages?: ProductFeedImageReader;

  /** Tier 1 — the image-path, pricing and setting boundaries the serializer reads through. */
  readonly boundaries: CatalogBoundaries;

  /** The records-only selection seam. The feed reads one view; see the module header. */
  readonly smartListQueryPort: SmartListQueryPort;
}

/** Everything the feed surface builds. */
export interface FeedSurfaceParts {
  readonly productFeedQuery: ProductFeedQuery;
  readonly productFeedBuilder: ProductFeedBuilder;

  /** The feed's product-image reader. */
  readonly productFeedImages: ProductFeedImageReader;

  /** Refuses an unbounded anonymous materialisation. */
  readonly assertAnonymousMaterialisationBounded: AnonymousMaterialisationGate;
}

/**
 * Wires the feed surface from resolved dependencies.
 *
 * @param dependencies the resolved boundaries and the selection seam
 * @returns the selection and the serializer.
 */
export function composeFeedSurface(dependencies: FeedSurfaceDependencies): FeedSurfaceParts {
  const { boundaries } = dependencies;

  return {
    productFeedQuery: new ProductFeedQuery(dependencies.smartListQueryPort),
    productFeedBuilder: new ProductFeedBuilder(
      boundaries.imagePaths,
      boundaries.pricing,
      boundaries.settings,
      /*
       * — the per-record image ceiling and the document byte ceiling, built from whatever
       * figures this deployment stated. Both fail closed: the one anonymous route refuses by name rather
       * than buffering an unbounded document.
       */
      createProductFeedRenderBudget(
        dependencies.resourceBounds.googleFeedMaximumImagesPerRecord,
        dependencies.resourceBounds.googleFeedMaximumResponseBytes,
      ),
    ),
    productFeedImages: dependencies.productFeedImages ?? productFeedImagesFromDomain,
    assertAnonymousMaterialisationBounded: createAnonymousMaterialisationGate({
      maximumRecordsPerQuery: dependencies.resourceBounds.smartListMaximumRecordsPerQuery,
      maximumPredicatesPerQuery: dependencies.resourceBounds.smartListMaximumPredicatesPerQuery,
      maximumImagesPerRecord: dependencies.resourceBounds.googleFeedMaximumImagesPerRecord,
      maximumResponseBytes: dependencies.resourceBounds.googleFeedMaximumResponseBytes,
    }),
  };
}

/** The narrow graph `src/handlers/googleFeedHandler.ts` resolves on its first invocation. */
export interface FeedSurfaceGraph {
  readonly config: AppConfig;
  readonly productFeedQuery: ProductFeedQuery;
  readonly productFeedBuilder: ProductFeedBuilder;

  /** The product-image reader. Refuses rather than emitting a silent gap. */
  readonly productFeedImages: ProductFeedImageReader;

  /** Refuses an unbounded anonymous materialisation. */
  readonly assertAnonymousMaterialisationBounded: AnonymousMaterialisationGate;

  /** Discards this surface's request-scoped derived state (M7). */
  readonly beginInvocation: () => void;
}

/**
 * Builds the feed surface's own graph over the module-scope pool.
 *
 * @returns a fresh narrow graph.
 */
export function createFeedSurfaceGraph(): FeedSurfaceGraph {
  const boundaries = resolveCatalogBoundaries();
  const statements = createCatalogStatements();

  /*
   * The narrow artifact is bounded exactly as the aggregate is —'s second half, now's. A
   * budget wired into one graph and not the other is the partial-wiring failure mode: it compiles, and the
   * bound silently does not apply on whichever entry was missed. This entry is the anonymous one.
   */
  const materialisationBudget: SmartListMaterialisationBudget =
    createSmartListMaterialisationBudget(
      config.resourceBounds.smartListMaximumRecordsPerQuery,
      config.resourceBounds.smartListMaximumPredicatesPerQuery,
    );

  const {
    productFeedQuery,
    productFeedBuilder,
    productFeedImages,
    assertAnonymousMaterialisationBounded,
  } = composeFeedSurface({
    boundaries,
    resourceBounds: config.resourceBounds,
    smartListQueryPort: createSmartListQueryPort(
      statements.queryRunner,
      { bindDefaultSkuDelegate: createDefaultSkuDelegateBinder(boundaries.settings) },
      materialisationBudget,
    ),
  });

  return Object.freeze({
    config,
    productFeedQuery,
    productFeedBuilder,
    productFeedImages,
    assertAnonymousMaterialisationBounded,
    beginInvocation: (): void => {
      /* Nothing to discard — see {@link FeedSurfaceGraph.beginInvocation}. */
    },
  });
}

/**
 * The memo cell for the Google product feed surface — one of six in this module, not the only one.
 */
const memoizedFeedSurface: { graph: FeedSurfaceGraph | undefined } = { graph: undefined };

/**
 * The production accessor: builds the narrow graph on first call and returns the same graph thereafter.
 *
 * @returns the memoized narrow graph.
 */
export function getFeedSurfaceGraph(): FeedSurfaceGraph {
  memoizedFeedSurface.graph ??= createFeedSurfaceGraph();

  return memoizedFeedSurface.graph;
}

/* The SKU surface, including its transaction-scoped write graph. */

/** The transaction-scoped collaborators the SKU-creation write path runs against. */
export interface CatalogSkuWriteGraph {
  /** Loads the aggregate the batch mutates, through the transaction's own scope. */
  readonly resolveProduct: (productID: string) => Promise<ProductWithErrorState | null>;

  /** The SKU service built for this boundary; the write path may touch no other. */
  readonly skuService: SkuService;
}

/** What {@link composeSkuSurface} needs, and the substitutions its callers may make. */
export interface SkuSurfaceDependencies {
  /** tier 1 — the executor-free boundary collaborators. */
  readonly boundaries: CatalogBoundaries;

  /** Tier 2 and 4 — statement execution, the uniqueness gate and the pool-bound validator. */
  readonly statements: CatalogStatements;

  /** The pool-bound query port. */
  readonly smartListQueryPort: SmartListQueryPort;

  /** The pool-bound product-type ancestry resolver. */
  readonly productTypeRootResolver: ProductTypeRootResolver;

  /** The default-SKU delegate binder, shared with the aggregate loaders behind the query port. */
  readonly bindDefaultSkuDelegate: DefaultSkuDelegateBinder;

  /** The one request-scoped cell in the slice, minted by the caller (M7). */
  readonly optionGroupSortOrderMemo: OptionGroupSortOrderMemo;

  /** The operator-stated materialisation ceiling, or omitted (CWE-400). */
  readonly materialisationBudget: SmartListMaterialisationBudget;

  /** The SKU combination ceiling and cancellation seam (CWE-400). */
  readonly combinationBudget: SkuCombinationBudget;

  /** A caller-supplied SKU repository, honoured in place of the MySQL adapter (AAP §0.7.3). */
  readonly skuRepository?: SkuRepository;

  /** A caller-supplied option repository, honoured in place of the MySQL adapter (AAP §0.7.3). */
  readonly optionRepository?: OptionRepository;

  /** An already-composed option service, reused in place of building one. */
  readonly optionService?: OptionService;

  /** A caller-supplied write runner, honoured in place of the MySQL boundary (AAP §0.7.3). */
  readonly skuWriteRunner?: TransactionalWriteRunner<CatalogSkuWriteGraph>;
}

/** Everything the SKU surface builds, including the parts `../container.ts` republishes. */
export interface SkuSurfaceParts {
  readonly skuRepository: SkuRepository;
  readonly optionRepository: OptionRepository;
  readonly optionService: OptionService;
  readonly skuService: SkuService;
  readonly resolveProduct: (productID: string) => Promise<ProductWithErrorState | null>;
  readonly skuWriteRunner: TransactionalWriteRunner<CatalogSkuWriteGraph>;
}

/** The SKU half of a transaction-scoped rebuild, as {@link buildSkuBoundaryParts} answers it. */
export interface SkuBoundaryParts {
  /** The boundary-scoped uniqueness gate and the validator that consults it. */
  readonly statements: BoundaryStatements;

  /** The query port bound to the transaction's executor. */
  readonly smartListQueryPort: SmartListQueryPort;

  /** The product-type ancestry resolver, reading through that same port. */
  readonly productTypeRootResolver: ProductTypeRootResolver;

  /** The SKU repository bound to the transaction's executor. */
  readonly skuRepository: SkuRepository;

  /** The option service bound to the transaction's executor. */
  readonly optionService: OptionService;

  /** The aggregate read, running on the transaction's own connection (M6). */
  readonly resolveProduct: (productID: string) => Promise<ProductWithErrorState | null>;

  /** The SKU service the write path may touch, and no other. */
  readonly skuService: SkuService;
}

/**
 * Rebuilds every database-touching SKU collaborator against one transaction's executor.
 */
export function buildSkuBoundaryParts(
  dependencies: SkuSurfaceDependencies,
  scope: TransactionScope,
  security: RequestAuthorizationContext,
): SkuBoundaryParts {
  const { statements, bindDefaultSkuDelegate, optionGroupSortOrderMemo, combinationBudget } =
    dependencies;
  /* — see {@link scopeBoundariesToInvocation}. */
  const boundaries = scopeBoundariesToInvocation(dependencies.boundaries, security);
  const { executor } = scope;

  const boundaryStatements = createBoundaryStatements(statements.uniquePropertyChecker, executor);
  const boundarySmartList = createSmartListQueryPort(
    executor,
    { bindDefaultSkuDelegate },
    dependencies.materialisationBudget,
  );
  const boundaryProductTypeRoots = createProductTypeRootResolver(boundarySmartList);

  const boundarySkuRepository = new MySqlSkuRepository(
    executor,
    optionGroupSortOrderMemo,
    boundaryProductTypeRoots,
    boundaries.accountContext,
  );
  const boundaryOptionService = new OptionService(
    new MySqlOptionRepository(executor),
    boundarySmartList,
  );

  return {
    statements: boundaryStatements,
    smartListQueryPort: boundarySmartList,
    productTypeRootResolver: boundaryProductTypeRoots,
    skuRepository: boundarySkuRepository,
    optionService: boundaryOptionService,
    /*
     * The aggregate is read through the boundary's own query port, which is the M6 requirement restated
     * as wiring: the product the batch mutates and the SKUs written against it share one connection.
     */
    resolveProduct: createProductAggregateReader(boundarySmartList),
    skuService: new SkuService(
      boundarySkuRepository,
      boundaryOptionService,
      boundaries.subscriptionTerms,
      boundaries.accessContent,
      boundaries.imagePaths,
      boundarySmartList,
      boundaryStatements.validator,
      boundaryProductTypeRoots,
      bindDefaultSkuDelegate,
      /*
       * — the same budget the pool-bound service holds, so the ceiling applies to the write
       * path the finding names and not merely to reads.
       */
      combinationBudget,
    ),
  };
}

/**
 * Wires the SKU surface from resolved dependencies — the pool-bound graph and the write boundary.
 */
export function composeSkuSurface(dependencies: SkuSurfaceDependencies): SkuSurfaceParts {
  const {
    boundaries,
    statements,
    smartListQueryPort,
    productTypeRootResolver,
    bindDefaultSkuDelegate,
    optionGroupSortOrderMemo,
    combinationBudget,
  } = dependencies;

  const skuRepository: SkuRepository =
    dependencies.skuRepository ??
    new MySqlSkuRepository(
      statements.queryRunner,
      optionGroupSortOrderMemo,
      productTypeRootResolver,
      boundaries.accountContext,
    );
  const optionRepository: OptionRepository =
    dependencies.optionRepository ?? new MySqlOptionRepository(statements.queryRunner);

  const optionService =
    dependencies.optionService ?? new OptionService(optionRepository, smartListQueryPort);
  const skuService = new SkuService(
    skuRepository,
    optionService,
    boundaries.subscriptionTerms,
    boundaries.accessContent,
    boundaries.imagePaths,
    smartListQueryPort,
    statements.validator,
    productTypeRootResolver,
    bindDefaultSkuDelegate,
    /* — the operator's ceiling, or a resolver that refuses by name when none was stated. */
    combinationBudget,
  );

  return {
    skuRepository,
    optionRepository,
    optionService,
    skuService,
    resolveProduct: createProductAggregateReader(smartListQueryPort),
    skuWriteRunner:
      dependencies.skuWriteRunner ??
      new MySqlTransactionalWriteRunner<CatalogSkuWriteGraph>(
        statements.unitOfWork,
        (scope, security) => {
          const boundary = buildSkuBoundaryParts(dependencies, scope, security);

          /*
           * The write graph is the narrow view of the rebuild: the aggregate reader and the SKU service,
           * and nothing else. `./productSurface.ts` takes the same parts and adds the product half, which
           * is why the rebuild answers more than this runner needs.
           */
          return { resolveProduct: boundary.resolveProduct, skuService: boundary.skuService };
        },
      ),
  };
}

/** The narrow graph `src/handlers/skuHandler.ts` resolves on its first invocation. */
export interface SkuSurfaceGraph {
  readonly skuService: SkuService;
  readonly productService: {
    readonly getProduct: (productID: string) => Promise<ProductWithErrorState | null>;
  };
  readonly skuWriteRunner: TransactionalWriteRunner<CatalogSkuWriteGraph>;

  /** Discards this surface's request-scoped derived state (M7). */
  readonly beginInvocation: () => void;
}

/**
 * Builds the SKU surface's own graph over the module-scope pool.
 *
 * @returns a fresh narrow graph.
 */
export function createSkuSurfaceGraph(): SkuSurfaceGraph {
  const boundaries = resolveCatalogBoundaries();
  const statements = createCatalogStatements();
  const bindDefaultSkuDelegate = createDefaultSkuDelegateBinder(boundaries.settings);
  /* — every entry carries the same required budget; see {@link createSmartListQueryPort}. */
  const materialisationBudget = createSmartListMaterialisationBudget(
    config.resourceBounds.smartListMaximumRecordsPerQuery,
    config.resourceBounds.smartListMaximumPredicatesPerQuery,
  );
  const smartListQueryPort = createSmartListQueryPort(
    statements.queryRunner,
    { bindDefaultSkuDelegate },
    materialisationBudget,
  );
  const optionGroupSortOrderMemo = createOptionGroupSortOrderMemo();

  const { skuService, resolveProduct, skuWriteRunner } = composeSkuSurface({
    boundaries,
    statements,
    smartListQueryPort,
    productTypeRootResolver: createProductTypeRootResolver(smartListQueryPort),
    bindDefaultSkuDelegate,
    optionGroupSortOrderMemo,
    materialisationBudget,
    /*
     * — built from whatever figure this deployment stated. Stating none is legal and yields a
     * budget whose resolver refuses by name the first time `createSkus` would have enumerated, which is
     * why constructing it here reads no environment beyond the already-loaded configuration.
     */
    combinationBudget: createSkuCombinationBudget(
      config.resourceBounds.skuMaximumCombinationsPerRequest,
    ),
  });

  return Object.freeze({
    skuService,
    productService: { getProduct: resolveProduct },
    skuWriteRunner,
    beginInvocation: (): void => {
      optionGroupSortOrderMemo.value = undefined;
    },
  });
}

/** The memo cell for the SKU surface — one of six in this module, not the only one. */
const memoizedSkuSurface: { graph: SkuSurfaceGraph | undefined } = { graph: undefined };

/**
 * The production accessor: builds the narrow graph on first call and returns the same graph thereafter.
 *
 * @returns the memoized narrow graph.
 */
export function getSkuSurfaceGraph(): SkuSurfaceGraph {
  memoizedSkuSurface.graph ??= createSkuSurfaceGraph();

  return memoizedSkuSurface.graph;
}

/* The product surface. */

/** What {@link composeProductSurface} needs, and the substitutions its callers may make. */
export interface ProductSurfaceDependencies {
  /** Everything the SKU half needs, passed through unchanged. */
  readonly sku: SkuSurfaceDependencies;

  /**
   * The URL-title probe ceiling — see `../util/urlTitle`'s
   * `UrlTitleProbeBudget`.
   */
  readonly urlTitleProbeBudget: UrlTitleProbeBudget;

  /** A caller-supplied product repository, honoured in place of the MySQL adapter (AAP §0.7.3). */
  readonly productRepository?: ProductRepository;

  /** A caller-supplied write runner, honoured in place of the MySQL boundary (AAP §0.7.3). */
  readonly productWriteRunner?: TransactionalWriteRunner<ProductService>;
}

/** Everything the product surface builds, including the parts `../container.ts` republishes. */
export interface ProductSurfaceParts {
  readonly productRepository: ProductRepository;
  readonly productPersistence: MySqlProductPersistence;
  readonly productBaseService: BaseService<Product, ProductPropertyName>;
  readonly productTypeBaseService: BaseService<ManagedEntity<ProductType>, ProductTypePropertyName>;
  readonly productService: ProductService;
  readonly productWriteRunner: TransactionalWriteRunner<ProductService>;

  /** The SKU half, composed once and republished so `../container.ts` need not compose it twice. */
  readonly skuParts: SkuSurfaceParts;
}

/**
 * Builds the population contract for `ProductType`.
 */
function createProductTypeDescriptorSet(
  populationAuthorization: PopulationAuthorizationPort,
): PropertyDescriptorSet<ProductType, ProductTypePropertyName> {
  /*
   * The recursion seam, as `../domain/base/populate.ts` describes it: "typically a one-line call back
   * into populate with that module's own descriptor set". `parentProductType` and
   * `childProductTypes` are self-referencing, so the set this function returns is the set the
   * recursion needs. A hoisted function declaration closes that loop without a lazy field: the body
   * reads `descriptorSet` only when a nested payload is actually populated, which is necessarily
   * after the binding below has been initialised.
   */
  function populateProductTypeSubProperty(
    related: ProductType,
    data: Record<string, unknown>,
  ): void {
    populate(related, data, descriptorSet, populationAuthorization);
  }

  function populateProductSubProperty(related: Product, data: Record<string, unknown>): void {
    populate(related, data, PRODUCT_PROPERTY_DESCRIPTORS, populationAuthorization);
  }

  const refuseLoader = (relatedEntityName: string): never =>
    refuseBoundary(
      `RelatedEntityLoader.loadOrCreate(${relatedEntityName})`,
      'the loader is synchronous by declaration and no adapter in this subtree can read a row synchronously',
    );

  const collaborators: ProductTypePopulationCollaborators = {
    /*
     * One loader serves both `parentProductType` and `childProductTypes`, because the legacy resolved
     * both through the same entity-service lookup keyed on the related component name
     * [`org/Hibachi/HibachiTransient.cfc:L227`, `:L233`].
     */
    productTypeLoader: {
      loadOrCreate: () => refuseLoader('ProductType'),
      loadExisting: () => undefined,
    },
    populateProductType: populateProductTypeSubProperty,
    productLoader: {
      loadOrCreate: () => refuseLoader('Product'),
      loadExisting: () => undefined,
    },
    populateProduct: populateProductSubProperty,
    attributeValueLoader: {
      loadOrCreate: () => refuseLoader('AttributeValue'),
      loadExisting: () => undefined,
    },
    populateAttributeValue: () =>
      refuseBoundary(
        'ProductTypePopulationCollaborators.populateAttributeValue',
        'AttributeValue belongs to the excluded model/**/Attribute*.cfc family, so it declares no descriptor set to recurse with',
      ),
  };

  const descriptorSet = createProductTypePropertyDescriptorSet(collaborators);

  return descriptorSet;
}

/**
 * Builds the two product base services over one persistence adapter and one validator.
 */
function composeProductBaseServices(
  persistence: MySqlProductPersistence,
  statements: Pick<BoundaryStatements, 'validator'>,
  populationAuthorization: PopulationAuthorizationPort,
  settingCleanup: ConstructorParameters<
    typeof BaseService<Product, ProductPropertyName>
  >[0]['settingCleanup'],
  commentCleanup: ConstructorParameters<
    typeof BaseService<Product, ProductPropertyName>
  >[0]['commentCleanup'],
  skuRepository: Pick<SkuRepository, 'transactionExists'>,
): {
  readonly productBaseService: BaseService<Product, ProductPropertyName>;
  readonly productTypeBaseService: BaseService<ManagedEntity<ProductType>, ProductTypePropertyName>;
} {
  return {
    productBaseService: new BaseService<Product, ProductPropertyName>({
      validator: statements.validator,
      ruleSet: productValidationRuleSet,
      propertyDescriptors: PRODUCT_PROPERTY_DESCRIPTORS,
      populationAuthorization,
      persist: (product) => persistence.saveProduct(product),
      remove: async (product) => {
        await persistence.deleteProduct(product);
      },
      /*
       * — built from the repository this graph is bound to, so the existence read and the delete share
       * one connection. See {@link createProductDeleteSubjectResolver}.
       */
      resolveDeleteSubject: createProductDeleteSubjectResolver(skuRepository),
      settingCleanup,
      commentCleanup,
    }),
    productTypeBaseService: new BaseService<ManagedEntity<ProductType>, ProductTypePropertyName>({
      validator: statements.validator,
      ruleSet: productTypeValidationRuleSet,
      propertyDescriptors: createProductTypeDescriptorSet(populationAuthorization),
      populationAuthorization,
      /*
       * `saveProductType` answers the entity it was given, so returning the argument keeps the managed
       * surface the base service declared without a cast.
       */
      persist: async (productType) => {
        await persistence.saveProductType(productType);
        return productType;
      },
      remove: async (productType) => {
        await persistence.deleteProductType(productType);
      },
      settingCleanup,
      commentCleanup,
    }),
  };
}

/**
 * Builds the product write surface — the importer-capable repository and the persistence adapter.
 *
 */
function composeProductWriteSurface(
  executor: TransactionScope['executor'],
  dependencies: SkuSurfaceDependencies,
  accountContext: AccountContextPort,
  productRepositoryOverride?: ProductRepository,
): {
  readonly productRepository: ProductRepository;
  readonly productPersistence: MySqlProductPersistence;
} {
  const { boundaries, statements } = dependencies;

  return {
    productRepository:
      productRepositoryOverride ??
      new MySqlProductRepository({
        executor,
        transactions: statements.unitOfWork,
        sourceReader: unresolvableProductImportSourceReader,
        /*
         * The factory, not the port: `MySqlProductRepository` calls it per transaction scope so the
         * per-row content assignment of `model/dao/ProductDAO.cfc:L213-L219` runs on the same connection
         * as the row it belongs to (M3). Passing the port directly compiled only because an earlier
         * revision declared the member loosely.
         */
        contentAssignment: unresolvableProductContentAssignmentFactory,
        accountContext,
        urlTitleFilter: unresolvableImportUrlTitleFilter,
        readDefaultSkuId: readDefaultSkuIdOrRefuse,
      }),
    /*
     * — the fourth argument is the principal, and it is what makes this seam audited. This adapter is
     * the one normal product and product-type writes go through (see {@link composeProductBaseServices} and
     * {@link assembleProductService}); it now invokes the same lifecycle the repository adapters do, so it
     * needs the same collaborator they take.
     */
    productPersistence: new MySqlProductPersistence(
      executor,
      boundaries.productDependencyCleanup,
      readDefaultSkuIdOrRefuse,
      accountContext,
    ),
  };
}

/**
 * Assembles a product service from one set of collaborators, pool-bound or boundary-scoped.
 */
function assembleProductService(collaborators: {
  readonly dependencies: SkuSurfaceDependencies;
  readonly productRepository: ProductRepository;
  readonly persistence: MySqlProductPersistence;
  readonly statements: Pick<BoundaryStatements, 'validator' | 'isUrlTitleAvailable'>;
  readonly smartListQueryPort: SkuSurfaceDependencies['smartListQueryPort'];
  readonly productTypeRootResolver: SkuSurfaceDependencies['productTypeRootResolver'];
  readonly skuRepository: SkuSurfaceParts['skuRepository'];
  readonly skuService: SkuService;
  readonly optionService: OptionService;
  readonly productBaseService: BaseService<Product, ProductPropertyName>;
  readonly productTypeBaseService: BaseService<ManagedEntity<ProductType>, ProductTypePropertyName>;
  readonly urlTitleProbeBudget: UrlTitleProbeBudget;
}): ProductService {
  const { boundaries } = collaborators.dependencies;

  return new ProductService({
    productRepository: collaborators.productRepository,
    skuRepository: collaborators.skuRepository,
    skuService: collaborators.skuService,
    optionService: collaborators.optionService,
    baseService: collaborators.productBaseService,
    productTypeBaseService: collaborators.productTypeBaseService,
    validator: collaborators.statements.validator,
    settings: boundaries.settings,
    accountContext: boundaries.accountContext,
    smartListQueryPort: collaborators.smartListQueryPort,
    subscriptionTermPort: boundaries.subscriptionTerms,
    productTypeRootResolver: collaborators.productTypeRootResolver,
    productPropertyDescriptors: PRODUCT_PROPERTY_DESCRIPTORS,
    populationAuthorization: boundaries.populationAuthorization,
    isUrlTitleAvailable: collaborators.statements.isUrlTitleAvailable,
    /* — the ceiling the two derivations probe against, resolved when a derivation runs. */
    urlTitleProbeBudget: collaborators.urlTitleProbeBudget,
    persistProduct: (product) => collaborators.persistence.saveProduct(product),
    defaultSkuIdReader: readDefaultSkuIdOrRefuse,

    /*
     * — it reads a value the row mapper recorded, not a connection, so it is neither pool-bound nor
     * boundary-bound and re-binding it through `withExecutor` would be meaningless — exactly as for
     * `defaultSkuIdReader` above, which is why both are wired identically in both graphs.
     */
    parentProductTypeIdReader: readHydratedParentProductTypeID,
  });
}

/**
 * Rebuilds every database-touching product collaborator against one transaction's executor.
 */
export function buildProductBoundaryGraph(
  dependencies: ProductSurfaceDependencies,
  scope: TransactionScope,
  security: RequestAuthorizationContext,
): ProductService {
  const { executor } = scope;
  const { statements } = dependencies.sku;
  /*
   * — see {@link scopeBoundariesToInvocation}. The SKU half below is rebuilt from the same
   * context, so one invocation cannot end up with two principals across the two halves of one graph.
   */
  const boundaries = scopeBoundariesToInvocation(dependencies.sku.boundaries, security);

  const boundarySku = buildSkuBoundaryParts(dependencies.sku, scope, security);
  const boundaryStatements = createBoundaryStatements(statements.uniquePropertyChecker, executor);
  const { productRepository, productPersistence } = composeProductWriteSurface(
    executor,
    dependencies.sku,
    /*
     * / — the invocation's principal, not the memoized tier. Every product write in
     * production arrives here, because `../handlers/productHandler.ts` runs each one through
     * `writeRunner.runWrite(authorization, …)`; so this is the argument that decides which account the
     * audit columns of `SwProduct` and `SwProductType` name. Passing `dependencies.sku.boundaries`
     * instead — which is what the omitted argument used to resolve to — handed both write collaborators
     * the fail-closed memoized port.
     */
    boundaries.accountContext,
  );
  const { productBaseService, productTypeBaseService } = composeProductBaseServices(
    productPersistence,
    boundaryStatements,
    boundaries.populationAuthorization,
    boundaries.settingCleanup,
    boundaries.commentCleanup,
    /* The boundary repository, not the pool's — the read must run on `scope.executor` (M6). */
    boundarySku.skuRepository,
  );

  return assembleProductService({
    dependencies: dependencies.sku,
    /*
     * — the same ceiling the pool-bound service holds; the derivation runs inside this
     * transaction, so a budget wired only outside it would not bound the path that probes.
     */
    urlTitleProbeBudget: dependencies.urlTitleProbeBudget,
    productRepository,
    persistence: productPersistence,
    statements: boundaryStatements,
    smartListQueryPort: boundarySku.smartListQueryPort,
    productTypeRootResolver: boundarySku.productTypeRootResolver,
    skuRepository: boundarySku.skuRepository,
    skuService: boundarySku.skuService,
    optionService: boundarySku.optionService,
    productBaseService,
    productTypeBaseService,
  });
}

/**
 * Wires the product surface from resolved dependencies — the pool-bound graph and the write boundary.
 */
export function composeProductSurface(
  dependencies: ProductSurfaceDependencies,
): ProductSurfaceParts {
  const { boundaries, statements, smartListQueryPort, productTypeRootResolver } = dependencies.sku;

  const skuParts = composeSkuSurface(dependencies.sku);
  const { productRepository, productPersistence } = composeProductWriteSurface(
    statements.queryRunner,
    dependencies.sku,
    /*
     * — the pool tier's context, which with no override is the fail-closed
     * {@link notImplementedAccountContextPort}. That is the correct value here and not an oversight: this
     * graph serves reads, every write goes through `productWriteRunner` below, and a write attempted
     * outside a boundary therefore raises rather than stamping an anonymous audit column. The pool-bound
     * `MySqlSkuRepository` in {@link composeSkuSurface} is wired from the same tier for the same reason.
     */
    boundaries.accountContext,
    dependencies.productRepository,
  );
  const { productBaseService, productTypeBaseService } = composeProductBaseServices(
    productPersistence,
    statements,
    boundaries.populationAuthorization,
    boundaries.settingCleanup,
    boundaries.commentCleanup,
    skuParts.skuRepository,
  );

  return {
    productRepository,
    productPersistence,
    productBaseService,
    productTypeBaseService,
    skuParts,
    productService: assembleProductService({
      dependencies: dependencies.sku,
      /* — see the boundary rebuild above; both graphs carry the one ceiling. */
      urlTitleProbeBudget: dependencies.urlTitleProbeBudget,
      productRepository,
      persistence: productPersistence,
      statements,
      smartListQueryPort,
      productTypeRootResolver,
      skuRepository: skuParts.skuRepository,
      skuService: skuParts.skuService,
      optionService: skuParts.optionService,
      productBaseService,
      productTypeBaseService,
    }),
    productWriteRunner:
      dependencies.productWriteRunner ??
      new MySqlTransactionalWriteRunner<ProductService>(statements.unitOfWork, (scope, security) =>
        buildProductBoundaryGraph(dependencies, scope, security),
      ),
  };
}

/** The narrow graph `src/handlers/productHandler.ts` resolves on its first invocation. */
export interface ProductSurfaceGraph {
  readonly productService: ProductService;
  readonly productWriteRunner: TransactionalWriteRunner<ProductService>;

  /** Discards this surface's request-scoped derived state (M7). */
  readonly beginInvocation: () => void;
}

/**
 * Builds the product surface's own graph over the module-scope pool.
 *
 * @returns a fresh narrow graph.
 */
export function createProductSurfaceGraph(): ProductSurfaceGraph {
  const boundaries = resolveCatalogBoundaries();
  const statements = createCatalogStatements();
  const bindDefaultSkuDelegate = createDefaultSkuDelegateBinder(boundaries.settings);
  /* — every entry carries the same required budget; see {@link createSmartListQueryPort}. */
  const materialisationBudget = createSmartListMaterialisationBudget(
    config.resourceBounds.smartListMaximumRecordsPerQuery,
    config.resourceBounds.smartListMaximumPredicatesPerQuery,
  );
  const smartListQueryPort = createSmartListQueryPort(
    statements.queryRunner,
    { bindDefaultSkuDelegate },
    materialisationBudget,
  );
  const optionGroupSortOrderMemo = createOptionGroupSortOrderMemo();

  const { productService, productWriteRunner } = composeProductSurface({
    sku: {
      boundaries,
      statements,
      smartListQueryPort,
      productTypeRootResolver: createProductTypeRootResolver(smartListQueryPort),
      bindDefaultSkuDelegate,
      optionGroupSortOrderMemo,
      materialisationBudget,
      /*
       * — the product surface reaches `createSkus` through `saveProduct`
       * [model/service/ProductService.cfc:L279], so it carries the same ceiling as the SKU entry.
       */
      combinationBudget: createSkuCombinationBudget(
        config.resourceBounds.skuMaximumCombinationsPerRequest,
      ),
    },
    /* — `saveProduct` and `saveProductType` are the two derivations in the slice. */
    urlTitleProbeBudget: createUrlTitleProbeBudget(
      config.resourceBounds.urlTitleMaximumProbesPerDerivation,
    ),
  });

  return Object.freeze({
    productService,
    productWriteRunner,
    beginInvocation: (): void => {
      optionGroupSortOrderMemo.value = undefined;
    },
  });
}

/** The memo cell for the product surface — one of six in this module, not the only one. */
const memoizedProductSurface: { graph: ProductSurfaceGraph | undefined } = { graph: undefined };

/**
 * The production accessor: builds the narrow graph on first call and returns the same graph thereafter.
 *
 * @returns the memoized narrow graph.
 */
export function getProductSurfaceGraph(): ProductSurfaceGraph {
  memoizedProductSurface.graph ??= createProductSurfaceGraph();

  return memoizedProductSurface.graph;
}

/* The wired graph. */

/*
 * The write-boundary contract — who declares it, who re-exports it, who implements it
 * The transaction boundary a write path runs inside — the port that replaces the legacy's request-end
 * commit. Its three owners, stated once so no reader has to infer them:
 *
 * Declared as `TransactionalWriteRunner<TGraph>` in `../ports/UniquePropertyPort.ts`, which is where
 * AAP §0.4.1's frozen inventory leaves it; the full contract — the lifecycle and disposal rules an
 * implementation must honour — is documented at that declaration. Re-exported by this file, unchanged in
 * name and shape, a few statements below, so a handler reaches the contract without importing an adapter
 * and no consumer import has to move. Implemented by `../adapters/mysql/UnitOfWork.ts`, which owns the
 * connection, the `BEGIN` and the commit-or-rollback decision.
 */

/*
 * The transaction contract is re-exported here, not re-declared: `TransactionalWriteRunner<TGraph>` is
 * declared once, in `../ports/UniquePropertyPort.ts`, whose own subject — the application-side
 * uniqueness probe — runs inside a save, so the transaction that save runs in is its natural host. The
 * lifecycle and disposal rules an implementation must honour are documented at that declaration.
 */

export type { TransactionalWriteRunner } from '../ports/UniquePropertyPort';

/*
 * No re-export of the SKU write graph stands here: `CatalogSkuWriteGraph` is declared in this file, in
 * the SKU-surface section below, so a re-export would duplicate the export of a local name.
 */

/** Every collaborator the catalog slice needs, wired once. */
export interface CatalogContainer {
  /**
   * The resolved configuration, exposed so the routing layer can read `config.googleFeed.host`
   * without importing `./env` and without reading `process.env` itself.
   */
  readonly config: AppConfig;

  /** The effective finite resource bounds this graph was wired with (CWE-400). */
  readonly resourceBounds: ResourceBoundsConfig;

  /** The bound check the anonymous feed route runs before it materialises anything — finding. */
  readonly assertAnonymousMaterialisationBounded: AnonymousMaterialisationGate;

  /** `pool.execute()` over the shared pool — the port of the legacy DAO query primitives. */
  readonly queryRunner: QueryRunner;

  /** The explicit transaction boundary that replaces the implicit request-end commit (M5). */
  readonly unitOfWork: UnitOfWork;

  /** Application-side uniqueness checking — the port of `org/Hibachi/HibachiDAO.cfc:L130-L146`. */
  readonly uniqueProperty: UniquePropertyPort;

  /** The paginated dynamic-query surface that replaces `org/Hibachi/HibachiSmartList.cfc`. */
  readonly smartListQueryPort: SmartListQueryPort;

  /** Effective values for the eighteen setting names the slice reads. */
  readonly settings: SettingResolverPort;

  /** Image paths and uploads — a declared boundary, see the stub block below. */
  readonly imagePaths: ImagePathPort;

  /** Sale-price details — a declared boundary, see the stub block below. */
  readonly pricing: PricingPort;

  /** Subscription terms and benefits — a declared boundary, see the stub block below. */
  readonly subscriptionTerms: SubscriptionTermPort;

  /** Access content — a declared boundary, see the stub block below. */
  readonly accessContent: AccessContentPort;

  /** The acting principal — a declared boundary, resolved per invocation at the handler edge. */
  readonly accountContext: AccountContextPort;

  /** Arms 2 and 3 of the population gate, wired fail-closed. */
  readonly populationAuthorization: PopulationAuthorizationPort;

  /** The three business queries of `model/dao/ProductDAO.cfc`, plus its importer. */
  readonly productRepository: ProductRepository;

  /** The six members of `model/dao/SkuDAO.cfc`, including the option-to-SKU resolver. */
  readonly skuRepository: SkuRepository;

  /** The two unused-option queries of `model/dao/OptionDAO.cfc`. */
  readonly optionRepository: OptionRepository;

  /** The tree-sorted query of `model/dao/ProductTypeDAO.cfc`. */
  readonly productTypeRepository: ProductTypeRepository;

  /** The CRUD surface `BrandService` reached through `onMissingMethod` synthesis (IR-1). */
  readonly brandRepository: BrandRepository;

  /** The write surface for `SwProduct` and `SwProductType`. */
  readonly productPersistence: MySqlProductPersistence;

  /** The typed rule-set evaluator that replaces `org/Hibachi/HibachiValidationService.cfc`. */
  readonly validator: Validator;

  /** The local `save`/`delete` overrides of `model/service/HibachiService.cfc`, at brand. */
  readonly brandBaseService: BaseService<ManagedBrand, BrandPropertyName>;

  /** The same overrides at Product — `ProductService` narrows this to `delete`. */
  readonly productBaseService: BaseService<Product, ProductPropertyName>;

  /** The same overrides at ProductType — `ProductService` narrows this to `save`. */
  readonly productTypeBaseService: BaseService<ManagedEntity<ProductType>, ProductTypePropertyName>;

  /** The three declared members of `model/service/OptionService.cfc`, plus the four synthesized. */
  readonly optionService: OptionService;

  /** The nine members of `model/service/SkuService.cfc`, including the combination engine. */
  readonly skuService: SkuService;

  /** The fifteen members of `model/service/ProductService.cfc`. */
  readonly productService: ProductService;

  /** The one member of `model/service/BrandService.cfc`, plus the three synthesized. */
  readonly brandService: BrandService;

  /**
   * Runs a product write inside one transaction, against a product service built for that transaction.
   */
  readonly productWriteRunner: TransactionalWriteRunner<ProductService>;

  /**
   * Runs a SKU-creation batch inside one transaction, against collaborators built for that transaction.
   */
  readonly skuWriteRunner: TransactionalWriteRunner<CatalogSkuWriteGraph>;

  /** The transaction boundary for every brand mutation. */
  readonly brandWriteRunner: TransactionalWriteRunner<BrandService>;

  /** The interface-conformant stub of `integrationServices/google/Integration.cfc`. */
  readonly googleIntegration: GoogleIntegration;

  /** The record selection of `integrationServices/google/controllers/feed.cfc`. */
  readonly productFeedQuery: ProductFeedQuery;

  /** The field mapping of `integrationServices/google/views/feed/product.cfm`. */
  readonly productFeedBuilder: ProductFeedBuilder;

  /** The reader behind `product.cfm:L24`'s `getProductImages()` traversal. */
  readonly productFeedImages: ProductFeedImageReader;

  /**
   * Discards the one piece of request-scoped state the graph carries. The routing layer calls it
   * first, on every invocation, before any handler runs.
   */
  beginInvocation(): void;
}

/** Substitutions a caller may make when building a graph. */
export interface CatalogContainerOverrides {
  readonly settings?: SettingResolverPort;
  readonly imagePaths?: ImagePathPort;
  readonly pricing?: PricingPort;
  readonly subscriptionTerms?: SubscriptionTermPort;
  readonly accessContent?: AccessContentPort;
  readonly accountContext?: AccountContextPort;
  readonly populationAuthorization?: PopulationAuthorizationPort;
  readonly uniqueProperty?: UniquePropertyPort;

  /** The URL-title probe `../util/urlTitle` calls once per collision candidate. */
  readonly isUrlTitleAvailable?: UniqueValueProbe;

  readonly smartListQueryPort?: SmartListQueryPort;
  readonly productRepository?: ProductRepository;
  readonly skuRepository?: SkuRepository;
  readonly optionRepository?: OptionRepository;
  readonly productTypeRepository?: ProductTypeRepository;
  readonly brandRepository?: BrandRepository;
  readonly settingCleanup?: EntitySettingCleanupPort;
  readonly commentCleanup?: EntityCommentCleanupPort;
  readonly productDependencyCleanup?: ProductDependencyCleanup;
  readonly productTypeRootResolver?: ProductTypeRootResolver;

  /** The two transaction boundaries, substitutable only as whole runners. */
  readonly productWriteRunner?: TransactionalWriteRunner<ProductService>;
  readonly skuWriteRunner?: TransactionalWriteRunner<CatalogSkuWriteGraph>;
  readonly brandWriteRunner?: TransactionalWriteRunner<BrandService>;

  /**
   * The six resource bounds, overriding {@link AppConfig.resourceBounds}. The gates built from them are
   * rebuilt from the effective section, so an override reaches every consumer rather than only the ones
   * that read the configuration object directly.
   */
  readonly resourceBounds?: ResourceBoundsConfig;

  /**
   * The feed's product-image reader, for a deployment that has an image subsystem — or a test that
   * needs a product's images to reach the document.
   */
  readonly productFeedImages?: ProductFeedImageReader;
}

/*
 * TR-5's refusing ports, the deny-all population gate, the default-SKU delegate binder and the
 * default-SKU identifier reader are declared in this file's boundary tier, and the product-type
 * population contract sits with the product surface, because each belongs beside the graph that
 * binds it rather than in a tier of its own.
 */

/* The feed's product-image reader — a declared boundary that refuses, not a silent empty list. */

/**
 * Reads one SKU's product images for the feed — the shape `src/handlers/googleFeedHandler.ts` consumes.
 */
export type ProductFeedImageReader = (sku: ProductFeedRecord['sku']) => readonly ProductFeedImage[];

/*
 * There is no unconditionally refusing reader here. A product with no additional images has a knowable
 * answer — the empty list — and `product.cfm:L24` emits no element for it, so a blanket refusal would turn
 * every image-less product's feed into a `501`. {@link productFeedImagesFromDomain} below refuses only
 * where the answer is genuinely unavailable.
 */

/**
 * The feed's product-image reader — empty only when the product is, and refusing otherwise.
 *
 * TODO(boundary): the rightful owner is the image subsystem behind `../ports/ImagePathPort`, which
 * AAP §0.2.2.1 excludes along with the image service itself. No defect number is minted for it — AAP
 * §0.6.7 is frozen and none of its entries covers this, and `../ports/repositories/SkuRepository.ts`
 * states the two frozen register bounds and mints no identifier of its own.
 */
export const productFeedImagesFromDomain: ProductFeedImageReader = (sku) => {
  const product = sku.product;
  if (product === undefined) {
    return [];
  }

  if (product.getProductImages().length === 0) {
    return [];
  }

  return refuseBoundary(
    'ProductFeedImageReader',
    'the product carries images, and their paths come from model/entity/Image.cfc:L79-L81 — an entity ' +
      'AAP §0.2.1.2 does not include, so no path is readable from the ported domain',
  );
};

/*
 * The four collaborators only a composition root can assemble
 * Each of these is required by a sibling that explicitly declines to build it, on the grounds that
 * doing so would need a collaborator from a layer it may not import. None of them is a stub: they are
 * real adapters between two real contracts, and the only thing they refuse is the part no in-scope
 * collaborator can answer.
 */

/*
 * The four dead injections — declared in the legacy, not wired here.
 * Four `property name=` declarations in the four in-scope services have zero call sites in the whole
 * legacy tree. AAP §0.4.3.1 says they are "not carried", so there is no constructor argument, no
 * binding, no placeholder, no commented-out line and no optional slot for any of them:
 * `productTypeDAO` and `contentService` on `productService`, `productService` on `skuService` and
 * `productService` on `optionService`.
 */

/**
 * Builds a fresh aggregate graph — every collaborator of the slice, wired once.
 */
export function createCatalogContainer(
  overrides: CatalogContainerOverrides = {},
): CatalogContainer {
  /*
   * Tier 1 — configuration and the boundary collaborators
   * Nothing here depends on anything else in the graph. `./env` has already read and frozen the
   * environment; this file reads no variable of its own. The boundary tier above resolves each slot from
   * the caller's substitutions, falling back to the refusing collaborator TR-5 requires.
   */
  const boundaries = resolveCatalogBoundaries(overrides);

  /*
   * Tiers 2 and 4 — statement execution, the uniqueness gate and the validator
   * One `QueryRunner` and one `UnitOfWork` over the same pool: the runner for statements outside a
   * transaction, the boundary for those inside one. The uniqueness checker and the validator that
   * consults it come with them, because IR-5's application-side check is a validation collaborator.
   */
  const statements = createCatalogStatements(overrides);

  /* The three finite resource bounds (CWE-400) */
  const resourceBounds: ResourceBoundsConfig = overrides.resourceBounds ?? config.resourceBounds;

  /*
   * All three bounds are derived here.
   * `skuMaximumCombinationsPerRequest` becomes a `SkuCombinationBudget` and
   * `urlTitleMaximumProbesPerDerivation` a `UrlTitleProbeBudget`, each wired into both graphs.
   */

  const combinationBudget: SkuCombinationBudget = createSkuCombinationBudget(
    resourceBounds.skuMaximumCombinationsPerRequest,
  );

  const urlTitleProbeBudget: UrlTitleProbeBudget = createUrlTitleProbeBudget(
    resourceBounds.urlTitleMaximumProbesPerDerivation,
  );

  const materialisationBudget: SmartListMaterialisationBudget =
    createSmartListMaterialisationBudget(
      resourceBounds.smartListMaximumRecordsPerQuery,
      resourceBounds.smartListMaximumPredicatesPerQuery,
    );

  /*
   * The read tier — dynamic queries and the collaborators built from an executor
   * The delegate binder must exist before the aggregate loaders, which must exist before the query
   * builder: the aggregate-loader section of `../adapters/mysql/SmartListQueryBuilder.ts` makes the binder
   * a required dependency of the loaders, and the builder takes the loaders. That ordering is the reason
   * those lines are adjacent rather than grouped with their neighbours by kind.
   */
  const bindDefaultSkuDelegate = createDefaultSkuDelegateBinder(boundaries.settings);
  const smartListQueryPort: SmartListQueryPort =
    overrides.smartListQueryPort ??
    createSmartListQueryPort(
      statements.queryRunner,
      { bindDefaultSkuDelegate },
      materialisationBudget,
    );

  /*
   * One resolver serves the SKU repository, the SKU service and the product service — the legacy read
   * the same product-type ancestry from one place too.
   */
  const productTypeRootResolver: ProductTypeRootResolver =
    overrides.productTypeRootResolver ?? createProductTypeRootResolver(smartListQueryPort);

  /*
   * M7 — the one piece of request-scoped state in the graph, and its lifetime is owned here.
   * `../adapters/mysql/MySqlSkuRepository.ts` makes the sorted-SKU sort-order memo a constructor
   * parameter for exactly this reason: the legacy kept it in a singleton DAO's `variables` scope
   * [`model/dao/SkuDAO.cfc:L204-L220`] where it outlived every request, and the value it caches is
   * scoped to the whole option-group table rather than to any product [`:L210-L212`]. The holder is
   * minted here, shared by the pool-bound graph and every boundary-scoped rebuild, and discarded by
   * {@link CatalogContainer.beginInvocation}; nothing else in this file memoizes a value of any kind.
   */
  const optionGroupSortOrderMemo = createOptionGroupSortOrderMemo();

  /*
   * The five surfaces
   * The option surface is composed first and its service is handed to the SKU surface, so the aggregate
   * graph holds one option service rather than two — which is what the legacy holds, `optionService`
   * being a DI/1 singleton at `org/Hibachi/Hibachi.cfc:L298-L330`. The product surface composes the SKU
   * surface internally and republishes its parts, because `ProductService` genuinely depends on the SKU
   * service, the option service and the SKU repository (three legacy call sites each), so composing the
   * SKU half twice would produce two of each.
   */
  const optionParts = composeOptionSurface({
    statements,
    smartListQueryPort,
    ...(overrides.optionRepository === undefined
      ? {}
      : { optionRepository: overrides.optionRepository }),
  });

  const skuDependencies: SkuSurfaceDependencies = {
    boundaries,
    statements,
    smartListQueryPort,
    productTypeRootResolver,
    bindDefaultSkuDelegate,
    optionGroupSortOrderMemo,
    optionService: optionParts.optionService,
    optionRepository: optionParts.optionRepository,
    /*
     * — required, so there is no conditional spread here and no absent case: a container is
     * always built with a budget, and it is the budget's own resolver that decides whether this deployment
     * stated a figure. That is the difference between this member and `materialisationBudget` below.
     */
    combinationBudget,
    /*
     * — a plain assignment now, because the budget is required and always constructed. The
     * conditional spread that stood here existed to keep an absent member absent under
     * `exactOptionalPropertyTypes`, which was how "no figure stated" became "unbounded"; the budget's own
     * resolvers now carry that distinction and answer it with a named refusal instead.
     */
    materialisationBudget,
    ...(overrides.skuRepository === undefined ? {} : { skuRepository: overrides.skuRepository }),
    ...(overrides.skuWriteRunner === undefined ? {} : { skuWriteRunner: overrides.skuWriteRunner }),
  };

  const productParts = composeProductSurface({
    sku: skuDependencies,
    urlTitleProbeBudget,
    ...(overrides.productRepository === undefined
      ? {}
      : { productRepository: overrides.productRepository }),
    ...(overrides.productWriteRunner === undefined
      ? {}
      : { productWriteRunner: overrides.productWriteRunner }),
  });
  const skuParts = productParts.skuParts;

  const brandParts = composeBrandSurface({
    boundaries,
    statements,
    urlTitleProbeBudget,
    ...(overrides.brandRepository === undefined
      ? {}
      : { brandRepository: overrides.brandRepository }),
    ...(overrides.brandWriteRunner === undefined
      ? {}
      : { brandWriteRunner: overrides.brandWriteRunner }),
  });

  /*
   * The google adapter
   * The interface-conformant component carries no feed logic — `getIntegrationTypes()` returns "fw1"
   * and `getSettings()` is empty [`integrationServices/google/Integration.cfc`] — so the stub takes no
   * collaborator and is built here rather than on the feed surface: it is reachable from no route, and
   * `CatalogContainer` publishes it only because the routing layer's own surface declares it. The real
   * work is split in two, exactly as the legacy split it, and the feed surface above owns both halves
   * plus the reason the selection takes the query port rather than `SkuService` (perf-02).
   */
  const googleIntegration = new GoogleIntegration();
  const feedParts = composeFeedSurface({
    boundaries,
    resourceBounds,
    smartListQueryPort,
    ...(overrides.productFeedImages === undefined
      ? {}
      : { productFeedImages: overrides.productFeedImages }),
  });

  /*
   * The one repository no surface composes
   * `../adapters/mysql/MySqlProductTypeRepository.ts` is the port of `model/dao/ProductTypeDAO.cfc`,
   * whose tree-sorted query is real in-scope behaviour. It is injected into no service and reached by
   * no route, which is precisely what the dead `productTypeDAO` injection above means, so it is built
   * and exposed here and appears on no narrow surface graph.
   */
  const productTypeRepository: ProductTypeRepository =
    overrides.productTypeRepository ??
    new MySqlProductTypeRepository(statements.queryRunner, boundaries.accountContext);

  return Object.freeze({
    config,
    resourceBounds,
    /*
     * Built by the feed surface from the effective bounds, so the aggregate entry and the narrow
     * feed entry ask the same question of the same figure. The verdict is not memoised inside the gate, so
     * the feed re-checks on every invocation (M7).
     */
    assertAnonymousMaterialisationBounded: feedParts.assertAnonymousMaterialisationBounded,
    queryRunner: statements.queryRunner,
    unitOfWork: statements.unitOfWork,
    uniqueProperty: statements.uniqueProperty,
    smartListQueryPort,
    settings: boundaries.settings,
    imagePaths: boundaries.imagePaths,
    pricing: boundaries.pricing,
    subscriptionTerms: boundaries.subscriptionTerms,
    accessContent: boundaries.accessContent,
    accountContext: boundaries.accountContext,
    populationAuthorization: boundaries.populationAuthorization,
    productRepository: productParts.productRepository,
    skuRepository: skuParts.skuRepository,
    optionRepository: optionParts.optionRepository,
    productTypeRepository,
    brandRepository: brandParts.brandRepository,
    productPersistence: productParts.productPersistence,
    validator: statements.validator,
    brandBaseService: brandParts.brandBaseService,
    productBaseService: productParts.productBaseService,
    productTypeBaseService: productParts.productTypeBaseService,
    optionService: optionParts.optionService,
    skuService: skuParts.skuService,
    productService: productParts.productService,
    brandService: brandParts.brandService,
    productWriteRunner: productParts.productWriteRunner,
    skuWriteRunner: skuParts.skuWriteRunner,
    brandWriteRunner: brandParts.brandWriteRunner,
    googleIntegration,
    productFeedQuery: feedParts.productFeedQuery,
    productFeedBuilder: feedParts.productFeedBuilder,
    productFeedImages: feedParts.productFeedImages,

    beginInvocation: (): void => {
      optionGroupSortOrderMemo.value = undefined;
    },
  });
}

/* The memoized production graph. */

/** The memo cell for the whole catalog graph — the sixth of six in this file, and the widest. */
const memoizedGraph: { container: CatalogContainer | undefined } = { container: undefined };

/**
 * The production accessor: builds the graph on first call and returns the same graph thereafter.
 *
 * @returns the memoized graph.
 */
export function getCatalogContainer(): CatalogContainer {
  memoizedGraph.container ??= createCatalogContainer();

  return memoizedGraph.container;
}
