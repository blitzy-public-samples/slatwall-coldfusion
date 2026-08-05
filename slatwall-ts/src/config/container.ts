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
import type { SqlExecutor, StatementComplexityBudget } from '../adapters/mysql/QueryRunner';
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
import type {
  ManagedEntity,
  PropertyDescriptorSet,
  RelatedEntityLoader,
} from '../domain/base/populate';
import { manageEntity, populate } from '../domain/base/populate';
import type { OptionPropertyName, SkuOptionOwner } from '../domain/option/Option';
import {
  OPTION_ENTITY_METADATA,
  Option,
  createOptionPropertyDescriptors,
} from '../domain/option/Option';
import type { OptionGroupPropertyName } from '../domain/option/OptionGroup';
import {
  OPTION_GROUP_ENTITY_METADATA,
  OptionGroup,
  createOptionGroupPropertyDescriptors,
} from '../domain/option/OptionGroup';
import type { BrandPropertyName } from '../domain/product/Brand';
import {
  BRAND_ENTITY_METADATA,
  BRAND_PROPERTY_DESCRIPTORS,
  Brand,
  createBrandPropertyDescriptors,
} from '../domain/product/Brand';
import type {
  ProductDefaultSkuDelegate,
  ProductOwnedAssociation,
  ProductPopulationCollaborators,
  ProductPropertyName,
  ProductSkuMember,
} from '../domain/product/Product';
import {
  PRODUCT_ENTITY_METADATA,
  createProductPropertyDescriptors,
  /*
   * `product` is a value import here, not a type-only import, because the brand delete-subject
   * resolver constructs identifier-only products to fill the collection ceiling counts that
   * `model/validation/Brand.json:L6` gates the delete on.
   */
  Product,
} from '../domain/product/Product';
import type {
  ParentProductTypeIdReader,
  ProductTypeAttributeValueOwner,
  ProductTypePopulationCollaborators,
  ProductTypePropertyName,
  ProductTypeRootResolver,
} from '../domain/product/ProductType';
import {
  PRODUCT_TYPE_ENTITY_METADATA,
  ProductType,
  createProductTypePropertyDescriptorSet,
} from '../domain/product/ProductType';
import type {
  DefaultSkuIdReader,
  SkuPopulationCollaborators,
  SkuPropertyName,
} from '../domain/sku/Sku';
import { SKU_ENTITY_METADATA, Sku, createSkuPropertyDescriptors } from '../domain/sku/Sku';
import { DataIntegrityError, DomainError, NotImplementedError } from '../errors/DomainError';
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
  PopulatedSubPropertyWriters,
  PopulationPreparer,
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
import { createSlatwallUUID } from '../util/uuid';
import type { ValidationContext, ValidationRuleSet } from '../validation/Validator';
import { Validator } from '../validation/Validator';
import { brandValidationRules } from '../validation/rules/brand.rules';
import { productValidationRuleSet } from '../validation/rules/product.rules';
import { productTypeValidationRuleSet } from '../validation/rules/productType.rules';
import { createSkuValidationRules, resolveSkuUniqueTarget } from '../validation/rules/sku.rules';
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
       * — the mechanism `../adapters/mysql/rowMappers.ts` declares for exactly this slot. This must
       * remain a live read rather than a copied value: `SkuService.createSkus` elects the default and
       * assigns the delegate before `validateNewSku` persists the new SKU and mints its identifier
       * (`model/service/SkuService.cfc:L127-L135`). The persistence adapter mints that identifier later
       * in the same operation, so a getter lets `readProductDefaultSkuId` observe the minted value
       * during ProductService's second product write; copying the unsaved sentinel here would retain
       * `''` forever and leave the later product update unable to persist `defaultSkuID`.
       */
      get skuID(): string {
        return sku.skuID;
      },
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

  /**
   * The operator-stated ceiling on composed-statement complexity (CWE-400). Required, and required for
   * the same reason the query port's copy is: both unused-option statements size a set-membership
   * clause from a caller-supplied list, so an option surface built without the ceiling would serve
   * both members unbounded. `SmartListMaterialisationBudget` extends the narrow contract the adapter
   * asks for, so the caller passes the single budget object it has already built.
   */
  readonly statementComplexityBudget: StatementComplexityBudget;

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
    dependencies.optionRepository ??
    new MySqlOptionRepository(
      dependencies.statements.queryRunner,
      dependencies.statementComplexityBudget,
    );

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

  /*
   * Built once and handed to both consumers. Hoisting it out of the query-port argument is what lets
   * the option repository receive the SAME figure the query port received: a budget wired into one
   * entry and not another is the partial-wiring failure mode, and it is exactly as much of a gap when
   * the unwired entry is the option repository's two list-shaped statements as when it is the smart
   * list's.
   */
  const materialisationBudget = createSmartListMaterialisationBudget(
    config.resourceBounds.smartListMaximumRecordsPerQuery,
    config.resourceBounds.smartListMaximumPredicatesPerQuery,
  );

  const { optionService } = composeOptionSurface({
    statements,
    smartListQueryPort: createSmartListQueryPort(
      statements.queryRunner,
      { bindDefaultSkuDelegate: createDefaultSkuDelegateBinder(boundaries.settings) },
      materialisationBudget,
    ),
    statementComplexityBudget: materialisationBudget,
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
    /*
     * The same budget object the query port above received. Both adapters apply the complexity ceiling
     * to statements they compose from a caller-supplied list, and `SmartListMaterialisationBudget`
     * extends the narrow `StatementComplexityBudget` those adapters ask for, so one operator figure
     * governs the smart list and the three list-shaped statements alike — on the transaction path as
     * well as the pooled one, which is the partial-wiring failure mode this line closes.
     */
    dependencies.materialisationBudget,
  );
  const boundaryOptionService = new OptionService(
    new MySqlOptionRepository(executor, dependencies.materialisationBudget),
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
      /* The complexity ceiling — see the identical argument in {@link buildSkuBoundaryParts}. */
      dependencies.materialisationBudget,
    );
  const optionRepository: OptionRepository =
    dependencies.optionRepository ??
    new MySqlOptionRepository(statements.queryRunner, dependencies.materialisationBudget);

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

/**
 * The four product/product-type writes the composition root must be able to substitute as one unit.
 *
 * A structural interface is used instead of the concrete MySQL class so tests and alternate adapters
 * can supply a plain object without inheriting the adapter's private implementation state.
 */
export interface ProductPersistence {
  saveProduct(product: Product): Promise<Product>;
  deleteProduct(product: Product): Promise<void>;
  saveProductType(productType: ProductType): Promise<ProductType>;
  deleteProductType(productType: ProductType): Promise<void>;
}

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

  /** A caller-supplied product write adapter, honoured for product and product-type persistence. */
  readonly productPersistence?: ProductPersistence;

  /** A caller-supplied write runner, honoured in place of the MySQL boundary (AAP §0.7.3). */
  readonly productWriteRunner?: TransactionalWriteRunner<ProductService>;
}

/** Everything the product surface builds, including the parts `../container.ts` republishes. */
export interface ProductSurfaceParts {
  readonly productRepository: ProductRepository;
  readonly productPersistence: ProductPersistence;
  readonly productBaseService: BaseService<Product, ProductPropertyName>;
  readonly productTypeBaseService: BaseService<ManagedEntity<ProductType>, ProductTypePropertyName>;
  readonly productService: ProductService;
  readonly productWriteRunner: TransactionalWriteRunner<ProductService>;

  /** The SKU half, composed once and republished so `../container.ts` need not compose it twice. */
  readonly skuParts: SkuSurfaceParts;
}

/**
 * A synchronous loader backed by asynchronous reads completed before `populate` starts.
 *
 * One instance belongs to one composed product graph. Production product writes rebuild that graph
 * per transaction, and the pool-bound graph clears every loader before each top-level preparation,
 * so no related entity can bleed across warm invocations (M7).
 */
interface PreparedRelatedEntityLoader<TEntity extends object> extends RelatedEntityLoader<TEntity> {
  prepareExisting(relatedId: string): Promise<void>;
  prepareOrCreate(relatedId: string): Promise<void>;
  reset(): void;
}

/** The concrete invocation-scoped implementation of {@link PreparedRelatedEntityLoader}. */
class InvocationRelatedEntityLoader<
  TEntity extends object,
> implements PreparedRelatedEntityLoader<TEntity> {
  private readonly prepared = new Map<string, TEntity | null>();

  /**
   * @param relatedEntityName - The related entity's class name, used only in diagnostics.
   * @param readExisting - The identifier read for this relationship.
   *
   * @param createTransient - Mints a brand-new related entity, and takes no identifier by design.
   * `org/Hibachi/HibachiDAO.cfc:L6-L26` is the contract: `get(entityName, idOrFilter,
   * isReturnNewOnNotFound)` guards its load with `isSimpleValue(idOrFilter) && len(idOrFilter)`, so a
   * blank identifier never reaches `entityLoadByPK` at all, and the fallback at `:L23-L25` returns
   * `new(entityName)` — `entityNew`, an entity whose key the `generator="uuid"` mapping assigns at
   * insert. The caller's identifier is therefore never adopted as a primary key (IR-6), and the write
   * path mints the 32-character value exactly as `MySqlBrandRepository.saveBrand` already does. The
   * previous form assigned `relatedId` here, which is what let a caller-supplied `""` be stored as a
   * foreign key pointing at no row.
   */
  public constructor(
    private readonly relatedEntityName: string,
    private readonly readExisting: (relatedId: string) => Promise<TEntity | undefined>,
    private readonly createTransient: () => TEntity,
  ) {}

  public async prepareExisting(relatedId: string): Promise<void> {
    if (this.prepared.has(relatedId)) {
      return;
    }

    this.prepared.set(relatedId, (await this.readExisting(relatedId)) ?? null);
  }

  public async prepareOrCreate(relatedId: string): Promise<void> {
    const prepared = this.prepared.get(relatedId);
    if (prepared !== undefined && prepared !== null) {
      return;
    }

    if (prepared === null) {
      this.prepared.set(relatedId, this.createTransient());
      return;
    }

    const existing = relatedId === '' ? undefined : await this.readExisting(relatedId);
    this.prepared.set(relatedId, existing ?? this.createTransient());
  }

  public loadExisting(relatedId: string): TEntity | undefined {
    const prepared = this.requirePrepared(relatedId);

    return prepared ?? undefined;
  }

  public loadOrCreate(relatedId: string): TEntity {
    const prepared = this.requirePrepared(relatedId);
    if (prepared === null) {
      throw new DomainError(
        'A create-if-missing relationship load completed without an entity in the population cache.',
        { context: { relatedEntityName: this.relatedEntityName, relatedId } },
      );
    }

    return prepared;
  }

  public reset(): void {
    this.prepared.clear();
  }

  private requirePrepared(relatedId: string): TEntity | null {
    if (!this.prepared.has(relatedId)) {
      throw new DomainError(
        'A synchronous relationship load was attempted before its asynchronous prefetch completed.',
        { context: { relatedEntityName: this.relatedEntityName, relatedId } },
      );
    }

    const prepared = this.prepared.get(relatedId);
    if (prepared === undefined) {
      throw new DomainError('A prepared relationship identifier had no cached resolution.', {
        context: { relatedEntityName: this.relatedEntityName, relatedId },
      });
    }

    return prepared;
  }
}

/** A relationship loader that refuses every crossing into an excluded family by name. */
function createRefusingRelatedEntityLoader<TEntity extends object>(
  relatedEntityName: string,
  reason: string,
): RelatedEntityLoader<TEntity> {
  const refuse = (operation: 'loadOrCreate' | 'loadExisting'): never =>
    refuseBoundary(`RelatedEntityLoader.${operation}(${relatedEntityName})`, reason);

  return {
    loadOrCreate: () => refuse('loadOrCreate'),
    loadExisting: () => refuse('loadExisting'),
  };
}

/** Whether a payload value is one of CFML's simple values. */
function isPopulationSimpleValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** Whether a payload value is a struct rather than an array or scalar. */
function isPopulationStruct(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The branch-four payload switch, mirrored from `domain/base/populate.ts`. */
function shouldPrepareSubProperties(data: Record<string, unknown>): boolean {
  if (!Object.prototype.hasOwnProperty.call(data, 'populateSubProperties')) {
    return true;
  }

  const flag = data['populateSubProperties'];
  if (typeof flag === 'boolean') {
    return flag;
  }
  if (typeof flag === 'number') {
    return flag !== 0;
  }
  if (typeof flag === 'string') {
    const normalized = flag.trim().toLowerCase();

    return !(normalized === 'false' || normalized === 'no' || normalized === '0');
  }

  return true;
}

/** The authorization arm every persistent relationship must pass before it is prefetched. */
function mayPrepareRelationship(
  authorization: PopulationAuthorizationPort,
  entityName: string,
  propertyName: string,
): boolean {
  return authorization.authenticateEntityProperty({
    crudType: 'update',
    entityName,
    propertyName,
  });
}

/** Primes one many-to-one nested-struct relationship exactly as population will consume it. */
async function prepareManyToOneRelationship<TEntity extends object>(
  data: Record<string, unknown>,
  entityName: string,
  propertyName: string,
  relatedIdPropertyName: string,
  loader: PreparedRelatedEntityLoader<TEntity>,
  authorization: PopulationAuthorizationPort,
  prepareRelated: (relatedData: Record<string, unknown>) => Promise<void>,
): Promise<void> {
  if (!mayPrepareRelationship(authorization, entityName, propertyName)) {
    return;
  }

  const rawValue = data[propertyName];
  if (!isPopulationStruct(rawValue)) {
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(rawValue, relatedIdPropertyName)) {
    return;
  }

  const relatedIdValue = rawValue[relatedIdPropertyName];
  if (!isPopulationSimpleValue(relatedIdValue)) {
    return;
  }

  const relatedId = String(relatedIdValue);
  if (Object.keys(rawValue).length > 1) {
    await loader.prepareOrCreate(relatedId);
    await prepareRelated(rawValue);
  } else if (relatedId !== '') {
    await loader.prepareExisting(relatedId);
  }
}

/** Primes one one-to-many or many-to-many relationship exactly as population will consume it. */
async function prepareCollectionRelationship<TEntity extends object>(
  data: Record<string, unknown>,
  entityName: string,
  propertyName: string,
  relatedIdPropertyName: string,
  loader: PreparedRelatedEntityLoader<TEntity>,
  authorization: PopulationAuthorizationPort,
  prepareRelated: (relatedData: Record<string, unknown>) => Promise<void>,
  manyToMany: boolean,
): Promise<void> {
  if (!mayPrepareRelationship(authorization, entityName, propertyName)) {
    return;
  }

  const rawValue = data[propertyName];
  if (Array.isArray(rawValue)) {
    if (!shouldPrepareSubProperties(data)) {
      return;
    }

    for (const item of rawValue) {
      if (!isPopulationStruct(item)) {
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(item, relatedIdPropertyName)) {
        continue;
      }

      const relatedIdValue = item[relatedIdPropertyName];
      if (!isPopulationSimpleValue(relatedIdValue)) {
        continue;
      }

      await loader.prepareOrCreate(String(relatedIdValue));
      if (Object.keys(item).length > 1) {
        await prepareRelated(item);
      }
    }

    return;
  }

  if (!manyToMany || !isPopulationSimpleValue(rawValue)) {
    return;
  }

  for (const relatedId of String(rawValue)
    .split(',')
    .filter((candidate) => candidate.length > 0)) {
    await loader.prepareExisting(relatedId);
  }
}

/** The complete, recursively wired population graph used by Product and ProductType writes. */
interface ProductPopulationCoordinator {
  readonly brandDescriptors: PropertyDescriptorSet<Brand, BrandPropertyName>;
  readonly optionDescriptors: PropertyDescriptorSet<Option, OptionPropertyName>;
  readonly optionGroupDescriptors: PropertyDescriptorSet<OptionGroup, OptionGroupPropertyName>;
  readonly productDescriptors: PropertyDescriptorSet<Product, ProductPropertyName>;
  readonly productTypeDescriptors: PropertyDescriptorSet<ProductType, ProductTypePropertyName>;
  readonly skuDescriptors: PropertyDescriptorSet<Sku, SkuPropertyName>;
  readonly prepareProduct: PopulationPreparer;
  readonly prepareProductType: PopulationPreparer;

  /**
   * Resolves the SKU behind a `defaultSku` delegate this coordinator produced.
   *
   * `product.defaultSku` holds a nine-member delegate rather than a `Sku` — see
   * {@link createDefaultSkuDelegateBinder} — so the populated-sub-property writer for that relationship
   * cannot narrow with `instanceof`. The coordinator already keeps the delegate-to-entity map its own
   * sub-property populator uses, and this member publishes exactly that lookup.
   *
   * @param defaultSku - A delegate out of a product's `defaultSku` slot. Accepted as `object` because
   * the caller holds an entry out of the populated-sub-property record, which is typed by the record and
   * not by the relationship; a lookup miss is the answer for anything else.
   *
   * @returns The SKU it delegates to, or `undefined` when the delegate came from elsewhere.
   */
  readonly readDefaultSkuEntity: (defaultSku: object) => Sku | undefined;

  /**
   * Whether a related entity was minted by this request rather than read out of a row.
   *
   * `InvocationRelatedEntityLoader.loadOrCreate` mints when the identifier names no row, which is
   * `org/Hibachi/HibachiDAO.cfc:L23-L25`'s `entityNew` fallback. The minted entity carries no
   * identifier — and then the recursive population pass assigns whatever the payload's primary-ID key
   * held [org/Hibachi/HibachiTransient.cfc:L196-L206], which for a non-blank unknown identifier makes
   * `isNew()` read `false` on an entity that has no row. Hibernate met exactly that state and refused
   * it: `saveOrUpdate` treats an assigned identifier as detached, issues an `UPDATE`, and raises
   * `StaleStateException` on the zero row count. This membership test is the knowledge the port needs to
   * refuse the same case, and it is asked rather than inferred from an affected-row count because MySQL
   * reports zero changed rows for an `UPDATE` that matched a row without altering it.
   *
   * @param entity - A related entity or `defaultSku` delegate out of the populated-sub-property record.
   * @returns `true` when this request created it.
   */
  readonly wasMintedForThisRequest: (entity: object) => boolean;
}

/**
 * Builds relationship descriptors plus the async-prefetch/synchronous-resolution bridge.
 */
function createProductPopulationCoordinator(
  smartListQueryPort: SmartListQueryPort,
  populationAuthorization: PopulationAuthorizationPort,
  bindDefaultSkuDelegate: DefaultSkuDelegateBinder,
): ProductPopulationCoordinator {
  /*
   * Every entity this request minted rather than read, and the wrapper that records them. See
   * {@link ProductPopulationCoordinator.wasMintedForThisRequest} for why the distinction has to be kept:
   * population assigns the payload's primary-ID key onto a minted entity, so `isNew()` alone can no
   * longer tell an entity with no row from one that has one. A `WeakSet` because membership is scoped to
   * the entities this invocation is still holding and nothing else may retain them.
   */
  const mintedRelatedEntities = new WeakSet<object>();
  const mintTransient =
    <TEntity extends object>(create: () => TEntity): (() => TEntity) =>
    () => {
      const minted = create();
      mintedRelatedEntities.add(minted);

      return minted;
    };

  const brandLoader = new InvocationRelatedEntityLoader(
    'Brand',
    async (brandID) => {
      const records = await smartListQueryPort.executeRecords(
        buildIdentifierQuery('SlatwallBrand', 'brandID', brandID),
      );

      return records[0];
    },
    mintTransient(() => manageEntity(new Brand(), BRAND_ENTITY_METADATA)),
  );
  const optionLoader = new InvocationRelatedEntityLoader(
    'Option',
    async (optionID) => {
      const records = await smartListQueryPort.executeRecords(
        buildIdentifierQuery('SlatwallOption', 'optionID', optionID),
      );

      return records[0];
    },
    mintTransient(() => manageEntity(new Option(), OPTION_ENTITY_METADATA)),
  );
  const optionGroupLoader = new InvocationRelatedEntityLoader(
    'OptionGroup',
    async (optionGroupID) => {
      const records = await smartListQueryPort.executeRecords(
        buildIdentifierQuery('SlatwallOptionGroup', 'optionGroupID', optionGroupID),
      );

      return records[0];
    },
    mintTransient(() => manageEntity(new OptionGroup(), OPTION_GROUP_ENTITY_METADATA)),
  );
  const productLoader = new InvocationRelatedEntityLoader(
    'Product',
    async (productID) => {
      const records = await smartListQueryPort.executeRecords(
        buildIdentifierQuery('SlatwallProduct', 'productID', productID),
      );

      return records[0];
    },
    mintTransient(() => manageEntity(new Product(), PRODUCT_ENTITY_METADATA)),
  );
  const productTypeLoader = new InvocationRelatedEntityLoader(
    'ProductType',
    async (productTypeID) => {
      const records = await smartListQueryPort.executeRecords(
        buildIdentifierQuery('SlatwallProductType', 'productTypeID', productTypeID),
      );

      return records[0];
    },
    mintTransient(() => manageEntity(new ProductType(), PRODUCT_TYPE_ENTITY_METADATA)),
  );
  const skuLoader = new InvocationRelatedEntityLoader(
    'Sku',
    async (skuID) => {
      const records = await smartListQueryPort.executeRecords(
        buildIdentifierQuery('SlatwallSku', 'skuID', skuID),
      );

      return records[0];
    },
    mintTransient(() => manageEntity(new Sku(), SKU_ENTITY_METADATA)),
  );
  /*
   * Keyed by `object` rather than by the delegate type, because {@link readDefaultSkuEntity} publishes
   * this lookup to a caller holding an entry out of the populated-sub-property record — typed by the
   * record, not by the relationship. Every key this map receives is still a delegate; widening the key
   * only lets a non-delegate ask and be told `undefined`.
   */
  const defaultSkuEntities = new WeakMap<object, Sku>();
  const defaultSkuLoader = new InvocationRelatedEntityLoader<ProductDefaultSkuDelegate>(
    'DefaultSku',
    async (skuID) => {
      const records = await smartListQueryPort.executeRecords(
        buildIdentifierQuery('SlatwallSku', 'skuID', skuID),
      );
      const sku = records[0];
      if (sku === undefined) {
        return undefined;
      }

      const delegate = bindDefaultSkuDelegate(sku);
      defaultSkuEntities.set(delegate, sku);

      return delegate;
    },
    mintTransient(() => {
      const sku = manageEntity(new Sku(), SKU_ENTITY_METADATA);
      const delegate = bindDefaultSkuDelegate(sku);
      defaultSkuEntities.set(delegate, sku);
      /*
       * The SKU as well as the delegate, because the populated-sub-property record holds whichever of the
       * two population assigned — the delegate for `defaultSku`, the SKU itself for `skus` — and the
       * refusal below asks about the value it was handed.
       */
      mintedRelatedEntities.add(sku);

      return delegate;
    }),
  );

  const loaders: readonly PreparedRelatedEntityLoader<object>[] = [
    brandLoader,
    defaultSkuLoader,
    optionLoader,
    optionGroupLoader,
    productLoader,
    productTypeLoader,
    skuLoader,
  ];

  function requireSku(related: ProductSkuMember | SkuOptionOwner, relationshipName: string): Sku {
    if (related instanceof Sku) {
      return related;
    }

    return refuseBoundary(
      `ProductPopulationCoordinator.${relationshipName}`,
      'the smart-list relationship loader returned a non-Sku object for a SKU relationship',
    );
  }

  function requireDefaultSku(defaultSku: ProductDefaultSkuDelegate): Sku {
    const sku = defaultSkuEntities.get(defaultSku);
    if (sku !== undefined) {
      return sku;
    }

    return refuseBoundary(
      'ProductPopulationCoordinator.populateDefaultSku',
      'the default-SKU delegate was not produced by this invocation population coordinator',
    );
  }

  function populateBrandSubProperty(brand: Brand, data: Record<string, unknown>): void {
    populate(brand, data, brandDescriptors, populationAuthorization);
  }

  function populateOptionSubProperty(option: Option, data: Record<string, unknown>): void {
    populate(option, data, optionDescriptors, populationAuthorization);
  }

  function populateOptionGroupSubProperty(
    optionGroup: OptionGroup,
    data: Record<string, unknown>,
  ): void {
    populate(optionGroup, data, optionGroupDescriptors, populationAuthorization);
  }

  function populateProductSubProperty(product: Product, data: Record<string, unknown>): void {
    populate(product, data, productDescriptors, populationAuthorization);
  }

  function populateProductTypeSubProperty(
    productType: ProductType,
    data: Record<string, unknown>,
  ): void {
    populate(productType, data, productTypeDescriptors, populationAuthorization);
  }

  function populateDefaultSkuSubProperty(
    defaultSku: ProductDefaultSkuDelegate,
    data: Record<string, unknown>,
  ): void {
    populate(requireDefaultSku(defaultSku), data, skuDescriptors, populationAuthorization);
  }

  function populateProductSkuSubProperty(
    sku: ProductSkuMember,
    data: Record<string, unknown>,
  ): void {
    populate(requireSku(sku, 'populateProductSku'), data, skuDescriptors, populationAuthorization);
  }

  function populateOptionSkuSubProperty(sku: SkuOptionOwner, data: Record<string, unknown>): void {
    populate(requireSku(sku, 'populateOptionSku'), data, skuDescriptors, populationAuthorization);
  }

  function readOptionSkuPrimaryId(sku: SkuOptionOwner): string {
    return requireSku(sku, 'readOptionSkuPrimaryId').skuID;
  }

  const brandDescriptors = createBrandPropertyDescriptors({
    productLoader,
    populateProduct: populateProductSubProperty,
  });
  const optionGroupDescriptors = createOptionGroupPropertyDescriptors(
    optionLoader,
    populateOptionSubProperty,
  );
  const optionDescriptors = createOptionPropertyDescriptors(
    optionGroupLoader,
    populateOptionGroupSubProperty,
    skuLoader,
    populateOptionSkuSubProperty,
    readOptionSkuPrimaryId,
  );
  const skuCollaborators: SkuPopulationCollaborators = {
    productLoader,
    populateProduct: populateProductSubProperty,
    optionLoader,
    populateOption: populateOptionSubProperty,
  };
  const skuDescriptors = createSkuPropertyDescriptors(skuCollaborators);
  const productTypeCollaborators: ProductTypePopulationCollaborators = {
    productTypeLoader,
    populateProductType: populateProductTypeSubProperty,
    productLoader,
    populateProduct: populateProductSubProperty,
    attributeValueLoader: createRefusingRelatedEntityLoader<ProductTypeAttributeValueOwner>(
      'AttributeValue',
      'AttributeValue belongs to the excluded model/**/Attribute*.cfc family',
    ),
    populateAttributeValue: () =>
      refuseBoundary(
        'ProductTypePopulationCollaborators.populateAttributeValue',
        'AttributeValue belongs to the excluded model/**/Attribute*.cfc family, so it declares no descriptor set to recurse with',
      ),
  };
  const productTypeDescriptors = createProductTypePropertyDescriptorSet(productTypeCollaborators);
  const productCollaborators: ProductPopulationCollaborators = {
    brand: { loader: brandLoader, populate: populateBrandSubProperty },
    productType: {
      loader: productTypeLoader,
      populate: populateProductTypeSubProperty,
    },
    defaultSku: { loader: defaultSkuLoader, populate: populateDefaultSkuSubProperty },
    skus: { loader: skuLoader, populate: populateProductSkuSubProperty },
    productImages: {
      loader: createRefusingRelatedEntityLoader<ProductOwnedAssociation>(
        'ProductImage',
        'ProductImage belongs to the excluded image family behind ImagePathPort',
      ),
      populate: () =>
        refuseBoundary(
          'ProductPopulationCollaborators.populateProductImage',
          'ProductImage belongs to the excluded image family behind ImagePathPort',
        ),
    },
    attributeValues: {
      loader: createRefusingRelatedEntityLoader<ProductOwnedAssociation>(
        'AttributeValue',
        'AttributeValue belongs to the excluded model/**/Attribute*.cfc family',
      ),
      populate: () =>
        refuseBoundary(
          'ProductPopulationCollaborators.populateAttributeValue',
          'AttributeValue belongs to the excluded model/**/Attribute*.cfc family',
        ),
    },
    productReviews: {
      loader: createRefusingRelatedEntityLoader<ProductOwnedAssociation>(
        'ProductReview',
        'ProductReview belongs to the excluded review family',
      ),
      populate: () =>
        refuseBoundary(
          'ProductPopulationCollaborators.populateProductReview',
          'ProductReview belongs to the excluded review family',
        ),
    },
    relatedProducts: { loader: productLoader, populate: populateProductSubProperty },
  };
  const productDescriptors = createProductPropertyDescriptors(productCollaborators);

  async function prepareBrandData(data: Record<string, unknown>): Promise<void> {
    await prepareCollectionRelationship(
      data,
      'Brand',
      'products',
      'productID',
      productLoader,
      populationAuthorization,
      prepareProductData,
      false,
    );
  }

  async function prepareOptionData(data: Record<string, unknown>): Promise<void> {
    await prepareManyToOneRelationship(
      data,
      'Option',
      'optionGroup',
      'optionGroupID',
      optionGroupLoader,
      populationAuthorization,
      prepareOptionGroupData,
    );
    await prepareCollectionRelationship(
      data,
      'Option',
      'skus',
      'skuID',
      skuLoader,
      populationAuthorization,
      prepareSkuData,
      true,
    );
  }

  async function prepareOptionGroupData(data: Record<string, unknown>): Promise<void> {
    await prepareCollectionRelationship(
      data,
      'OptionGroup',
      'options',
      'optionID',
      optionLoader,
      populationAuthorization,
      prepareOptionData,
      false,
    );
  }

  async function prepareProductData(data: Record<string, unknown>): Promise<void> {
    await prepareManyToOneRelationship(
      data,
      'Product',
      'brand',
      'brandID',
      brandLoader,
      populationAuthorization,
      prepareBrandData,
    );
    await prepareManyToOneRelationship(
      data,
      'Product',
      'productType',
      'productTypeID',
      productTypeLoader,
      populationAuthorization,
      prepareProductTypeData,
    );
    await prepareManyToOneRelationship(
      data,
      'Product',
      'defaultSku',
      'skuID',
      defaultSkuLoader,
      populationAuthorization,
      prepareSkuData,
    );
    await prepareCollectionRelationship(
      data,
      'Product',
      'skus',
      'skuID',
      skuLoader,
      populationAuthorization,
      prepareSkuData,
      false,
    );
    await prepareCollectionRelationship(
      data,
      'Product',
      'relatedProducts',
      'productID',
      productLoader,
      populationAuthorization,
      prepareProductData,
      true,
    );
  }

  async function prepareProductTypeData(data: Record<string, unknown>): Promise<void> {
    await prepareManyToOneRelationship(
      data,
      'ProductType',
      'parentProductType',
      'productTypeID',
      productTypeLoader,
      populationAuthorization,
      prepareProductTypeData,
    );
    await prepareCollectionRelationship(
      data,
      'ProductType',
      'childProductTypes',
      'productTypeID',
      productTypeLoader,
      populationAuthorization,
      prepareProductTypeData,
      false,
    );
    await prepareCollectionRelationship(
      data,
      'ProductType',
      'products',
      'productID',
      productLoader,
      populationAuthorization,
      prepareProductData,
      false,
    );
  }

  async function prepareSkuData(data: Record<string, unknown>): Promise<void> {
    await prepareManyToOneRelationship(
      data,
      'Sku',
      'product',
      'productID',
      productLoader,
      populationAuthorization,
      prepareProductData,
    );
    await prepareCollectionRelationship(
      data,
      'Sku',
      'options',
      'optionID',
      optionLoader,
      populationAuthorization,
      prepareOptionData,
      true,
    );
  }

  const prepareTopLevel =
    (prepare: (data: Record<string, unknown>) => Promise<void>): PopulationPreparer =>
    async (data) => {
      for (const loader of loaders) {
        loader.reset();
      }
      await prepare(data);
    };

  return {
    brandDescriptors,
    optionDescriptors,
    optionGroupDescriptors,
    productDescriptors,
    productTypeDescriptors,
    skuDescriptors,
    prepareProduct: prepareTopLevel(prepareProductData),
    prepareProductType: prepareTopLevel(prepareProductTypeData),
    readDefaultSkuEntity: (defaultSku) => defaultSkuEntities.get(defaultSku),
    wasMintedForThisRequest: (entity) => mintedRelatedEntities.has(entity),
  };
}

/*
 * Product relationship pre-resolution lives in {@link createProductPopulationCoordinator} above rather
 * than in a separate narrow resolver. The coordinator covers every in-scope relationship instead of
 * `brand`/`productType` alone, gates each prefetch on {@link mayPrepareRelationship} before any read is
 * issued, and awaits its reads one at a time in Product's declaration order — so the descriptor-resolver
 * seam `ProductService` publishes is wired to the coordinator's set by default and no relationship row
 * is read twice for one save.
 */

/**
 * The context a populated sub-property is validated in.
 *
 * `HibachiValidationService.getPopulatedPropertyValidationContext`
 * [org/Hibachi/HibachiValidationService.cfc:L133-L151] looks for a `populatedPropertyValidation` section
 * in the related entity's validation document and falls through to the parent's own context when there is
 * none. No in-scope catalog document declares that section — the eight that do are all `Account*`,
 * `Order*`, `Vendor*` and `LocationAddress`, every one of them out of scope — so the fall-through is the
 * only reachable arm and `'save'` is what it yields for a product save.
 */
const SUB_PROPERTY_SAVE_CONTEXT: ValidationContext = 'save';

/**
 * Builds the populated-sub-property writers for the Product relationships that can carry one.
 *
 * The composition root owns these because it is the only layer that holds all three ingredients at
 * once: the rule set each related entity validates against, the write path bound to this graph's
 * executor, and — for `defaultSku` — the delegate-to-entity map only the population coordinator has.
 *
 * Four of the five relationships that record populated sub-properties get a writer. `relatedProducts`
 * deliberately gets none, and `ProductService.applyPopulatedSubPropertyValidation` documents why: the
 * related product's own `save` rules read `price`, which resolves through a `defaultSku` reference the
 * read path mints unresolved, so a keyed refusal is the honest answer rather than an unvalidated write.
 *
 * @param collaborators - The write paths and rule-set inputs for this graph.
 * @returns The writers, keyed by Product property name.
 */
function createPopulatedSubPropertyWriters(collaborators: {
  readonly validator: Validator;
  readonly brandRepository: BrandRepository;
  readonly persistence: ProductPersistence;
  readonly skuRepository: Pick<SkuRepository, 'findSkusBySelectedOptions' | 'persistSku'>;
  readonly readDefaultSkuEntity: (defaultSku: object) => Sku | undefined;
  readonly wasMintedForThisRequest: (entity: object) => boolean;
}): PopulatedSubPropertyWriters<ProductPropertyName> {
  const { validator, brandRepository, persistence, skuRepository } = collaborators;

  /**
   * Refuses a related entity that this request minted and that then took an identifier naming no row.
   *
   * The port of the `StaleStateException` Hibernate raised for exactly this state — see
   * {@link ProductPopulationCoordinator.wasMintedForThisRequest} for the mechanism that produces it. It
   * is a refusal rather than an insert because the alternatives both break a stated rule: inserting under
   * the caller's identifier would make a primary key caller-supplied (IR-6), and inserting under a minted
   * one would silently ignore the identifier the caller named. It is a refusal rather than a validation
   * finding because no legacy resource-bundle key describes it — the legacy failure is an ORM exception,
   * not a rule — and this port invents no key.
   *
   * @param relationshipName - The Product property the entity arrived under, for the diagnostic.
   * @param entity - The record entry as handed to the writer, which is what membership is asked about.
   * @param identifier - The identifier the entity now carries.
   * @param entityIsNew - Whether the entity still reads as unsaved.
   */
  const refuseUnresolvedRelatedIdentifier = (
    relationshipName: string,
    entity: object,
    identifier: string,
    entityIsNew: boolean,
  ): void => {
    if (entityIsNew || !collaborators.wasMintedForThisRequest(entity)) {
      return;
    }

    throw new DataIntegrityError(
      `The nested "${relationshipName}" struct named an identifier that matches no stored row, so the ` +
        'related entity exists only in memory and no row can be updated for it.',
      { context: { relationshipName, identifier } },
    );
  };

  /*
   * One narrowing helper per entity type, and each refuses rather than skipping. A record whose value is
   * not the type its property declares would mean the population graph and these writers disagree, which
   * is a wiring fault in this file and not a caller's input — so it is reported as a boundary refusal
   * instead of silently writing nothing.
   */
  const requireBrandEntity = (entity: object): ManagedBrand =>
    entity instanceof Brand
      ? manageEntity(entity, BRAND_ENTITY_METADATA)
      : refuseBoundary(
          'PopulatedSubPropertyWriter.brand',
          'the populated sub-property recorded for `brand` was not a Brand',
        );

  const requireProductTypeEntity = (entity: object): ManagedEntity<ProductType> =>
    entity instanceof ProductType
      ? manageEntity(entity, PRODUCT_TYPE_ENTITY_METADATA)
      : refuseBoundary(
          'PopulatedSubPropertyWriter.productType',
          'the populated sub-property recorded for `productType` was not a ProductType',
        );

  const requireSkuEntity = (relationshipName: string, entity: object): ManagedEntity<Sku> => {
    if (entity instanceof Sku) {
      return manageEntity(entity, SKU_ENTITY_METADATA);
    }

    const delegated = collaborators.readDefaultSkuEntity(entity);
    if (delegated !== undefined) {
      return manageEntity(delegated, SKU_ENTITY_METADATA);
    }

    return refuseBoundary(
      `PopulatedSubPropertyWriter.${relationshipName}`,
      'the populated sub-property recorded for a SKU relationship resolved to no SKU entity',
    );
  };

  /*
   * The SKU rule set is rebuilt per entity because `hasUniqueOptions`
   * [model/entity/Sku.cfc:L756-L769] resolves its siblings within one product, and
   * `SkuService.buildSkuSaveRuleSet` binds that lookup the same way. The identifier read is the SKU's own
   * `product` association, which `Product.addSku` sets for a `skus` member; a `defaultSku` member that
   * names no product resolves to `''`, which is the empty selection semantic T5 already covers.
   */
  const buildSkuRuleSet = (sku: ManagedEntity<Sku>): ValidationRuleSet<ManagedEntity<Sku>> =>
    createSkuValidationRules<ManagedEntity<Sku>>(resolveSkuUniqueTarget, {
      getSkusBySelectedOptions: (selectedOptions: string) =>
        skuRepository.findSkusBySelectedOptions(
          /*
           * CFML `listToArray` semantics: split on the comma and drop empty elements, which is what
           * `SkuService` and `../ports/SmartListQueryPort.ts` each do for the same idiom. Written out
           * here rather than imported because neither of those two publishes its private helper, and a
           * fourth spelling of a one-line list split is not worth a new shared module.
           */
          selectedOptions.split(',').filter((candidate) => candidate.length > 0),
          sku.product?.productID ?? '',
        ),
    });

  const validateSku = async (relationshipName: string, entity: object): Promise<boolean> => {
    const sku = requireSkuEntity(relationshipName, entity);
    refuseUnresolvedRelatedIdentifier(relationshipName, entity, sku.skuID, sku.isNew());
    const findings = await validator.validate(sku, buildSkuRuleSet(sku), SUB_PROPERTY_SAVE_CONTEXT);
    if (findings.hasErrors()) {
      sku.addErrors(findings.getErrors());

      return true;
    }

    /*
     * Minted after validation and before the parent's row is composed — the same ordering
     * `SkuService.validateNewSku` states and for the same reason (IR-5's self-exclusion term must still
     * see the unsaved sentinel), plus one this member adds: `SwProduct.defaultSkuID` is collected from
     * this entity, so the identifier has to exist by then even though the SKU's own row is written in the
     * `afterParent` phase.
     */
    if (sku.isNew()) {
      sku.skuID = createSlatwallUUID();
    }

    return false;
  };

  const persistSkuEntity = async (relationshipName: string, entity: object): Promise<void> => {
    await skuRepository.persistSku(requireSkuEntity(relationshipName, entity));
  };

  return Object.freeze({
    brand: Object.freeze({
      writePhase: 'beforeParent',
      validate: async (entity: object): Promise<boolean> => {
        const brand = requireBrandEntity(entity);
        refuseUnresolvedRelatedIdentifier('brand', entity, brand.brandID, brand.isNew());
        const findings = await validator.validate(
          brand,
          brandValidationRules,
          SUB_PROPERTY_SAVE_CONTEXT,
        );
        if (findings.hasErrors()) {
          brand.addErrors(findings.getErrors());

          return true;
        }

        return false;
      },
      persist: async (entity: object): Promise<void> => {
        await brandRepository.saveBrand(requireBrandEntity(entity));
      },
    }),
    productType: Object.freeze({
      writePhase: 'beforeParent',
      validate: async (entity: object): Promise<boolean> => {
        const productType = requireProductTypeEntity(entity);
        refuseUnresolvedRelatedIdentifier(
          'productType',
          entity,
          productType.productTypeID,
          productType.isNew(),
        );
        const findings = await validator.validate(
          productType,
          productTypeValidationRuleSet,
          SUB_PROPERTY_SAVE_CONTEXT,
        );
        if (findings.hasErrors()) {
          productType.addErrors(findings.getErrors());

          return true;
        }

        return false;
      },
      persist: async (entity: object): Promise<void> => {
        await persistence.saveProductType(requireProductTypeEntity(entity));
      },
    }),
    defaultSku: Object.freeze({
      writePhase: 'afterParent',
      validate: (entity: object): Promise<boolean> => validateSku('defaultSku', entity),
      persist: (entity: object): Promise<void> => persistSkuEntity('defaultSku', entity),
    }),
    skus: Object.freeze({
      writePhase: 'afterParent',
      validate: (entity: object): Promise<boolean> => validateSku('skus', entity),
      persist: (entity: object): Promise<void> => persistSkuEntity('skus', entity),
    }),
  });
}

/**
 * Builds the two product base services over one persistence adapter and one validator.
 */
function composeProductBaseServices(
  persistence: ProductPersistence,
  statements: Pick<BoundaryStatements, 'validator'>,
  populationAuthorization: PopulationAuthorizationPort,
  populationCoordinator: ProductPopulationCoordinator,
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
      propertyDescriptors: populationCoordinator.productDescriptors,
      populationAuthorization,
      preparePopulation: populationCoordinator.prepareProduct,
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
      propertyDescriptors: populationCoordinator.productTypeDescriptors,
      populationAuthorization,
      preparePopulation: populationCoordinator.prepareProductType,
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
  productPersistenceOverride?: ProductPersistence,
): {
  readonly productRepository: ProductRepository;
  readonly productPersistence: ProductPersistence;
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
    productPersistence:
      productPersistenceOverride ??
      new MySqlProductPersistence(
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
  /**
   * The boundary tier for this exact graph. Pool-bound callers pass the memoized fail-closed tier;
   * transaction-bound callers pass the invocation-scoped tier returned by
   * {@link scopeBoundariesToInvocation}. Keeping the choice at the call site prevents this helper from
   * silently replacing an authorised request principal with the pool tier.
   */
  readonly boundaries: CatalogBoundaries;
  readonly productRepository: ProductRepository;
  readonly persistence: ProductPersistence;
  readonly statements: Pick<BoundaryStatements, 'validator' | 'isUrlTitleAvailable'>;
  readonly smartListQueryPort: SkuSurfaceDependencies['smartListQueryPort'];
  readonly populationCoordinator: ProductPopulationCoordinator;
  readonly productTypeRootResolver: SkuSurfaceDependencies['productTypeRootResolver'];
  readonly skuRepository: SkuSurfaceParts['skuRepository'];
  readonly skuService: SkuService;
  readonly optionService: OptionService;
  readonly productBaseService: BaseService<Product, ProductPropertyName>;
  readonly productTypeBaseService: BaseService<ManagedEntity<ProductType>, ProductTypePropertyName>;
  readonly urlTitleProbeBudget: UrlTitleProbeBudget;

  /**
   * The brand write path bound to this graph, needed only by the populated-sub-property writer for
   * `Product.brand`. Bound to the same executor as every other write in the graph, so a nested brand
   * write lands inside the product's transaction rather than beside it.
   */
  readonly brandRepository: BrandRepository;
}): ProductService {
  const { boundaries } = collaborators;

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
    /*
     * The fully wired population graph, not a bare descriptor set. It resolves every in-scope Product
     * relationship — `brand`, `productType`, `defaultSku`, `skus` and `relatedProducts`, plus their
     * nested sub-property writes — and keeps the explicit refusing loaders for the excluded families.
     * `prepareProduct` below performs the asynchronous reads first, gated on
     * {@link mayPrepareRelationship} so a caller denied permission to write a property gains no
     * existence probe as a side effect, and awaited one relationship at a time in Product's declaration
     * order rather than behind `Promise.all`. `ProductService.saveProduct` therefore still consults
     * `resolveProductPropertyDescriptors`, whose default returns exactly this set; that seam stays
     * published for callers and tests that need to substitute a narrower descriptor resolver.
     */
    productPropertyDescriptors: collaborators.populationCoordinator.productDescriptors,
    populationAuthorization: boundaries.populationAuthorization,
    prepareProductPopulation: collaborators.populationCoordinator.prepareProduct,
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

    /*
     * The two cascade passes of `org/Hibachi/HibachiTransient.cfc:L407-L450` and
     * `org/Hibachi/HibachiDAO.cfc:L48-L67`, wired from this graph's own collaborators so a nested write
     * shares the product's transaction, its validator and its principal.
     */
    populatedSubPropertyWriters: createPopulatedSubPropertyWriters({
      validator: collaborators.statements.validator,
      brandRepository: collaborators.brandRepository,
      persistence: collaborators.persistence,
      skuRepository: collaborators.skuRepository,
      readDefaultSkuEntity: collaborators.populationCoordinator.readDefaultSkuEntity,
      wasMintedForThisRequest: collaborators.populationCoordinator.wasMintedForThisRequest,
    }),
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
  const populationCoordinator = createProductPopulationCoordinator(
    boundarySku.smartListQueryPort,
    boundaries.populationAuthorization,
    dependencies.sku.bindDefaultSkuDelegate,
  );
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
    dependencies.productRepository,
    dependencies.productPersistence,
  );
  const { productBaseService, productTypeBaseService } = composeProductBaseServices(
    productPersistence,
    boundaryStatements,
    boundaries.populationAuthorization,
    populationCoordinator,
    boundaries.settingCleanup,
    boundaries.commentCleanup,
    /* The boundary repository, not the pool's — the read must run on `scope.executor` (M6). */
    boundarySku.skuRepository,
  );
  /*
   * The brand write path for this transaction, built on `scope.executor` and this invocation's principal
   * for the same two reasons the product persistence above is: a nested brand write must be inside the
   * product's transaction so it rolls back with it, and its audit columns must name the account the route
   * gate authorised.
   */
  const boundaryBrandRepository = new MySqlBrandRepository(executor, boundaries.accountContext);

  return assembleProductService({
    /*
     * The invocation-scoped tier computed above. In particular, ProductService.populate must consult
     * this request's `populationAuthorization`, and its account/settings/subscription reads must not
     * fall back to the memoized fail-closed graph while the write is already inside an authorised
     * transaction.
     */
    boundaries,
    /*
     * — the same ceiling the pool-bound service holds; the derivation runs inside this
     * transaction, so a budget wired only outside it would not bound the path that probes.
     */
    urlTitleProbeBudget: dependencies.urlTitleProbeBudget,
    productRepository,
    persistence: productPersistence,
    statements: boundaryStatements,
    smartListQueryPort: boundarySku.smartListQueryPort,
    populationCoordinator,
    productTypeRootResolver: boundarySku.productTypeRootResolver,
    skuRepository: boundarySku.skuRepository,
    skuService: boundarySku.skuService,
    optionService: boundarySku.optionService,
    productBaseService,
    productTypeBaseService,
    brandRepository: boundaryBrandRepository,
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
  const populationCoordinator = createProductPopulationCoordinator(
    smartListQueryPort,
    boundaries.populationAuthorization,
    dependencies.sku.bindDefaultSkuDelegate,
  );
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
    dependencies.productPersistence,
  );
  const { productBaseService, productTypeBaseService } = composeProductBaseServices(
    productPersistence,
    statements,
    boundaries.populationAuthorization,
    populationCoordinator,
    boundaries.settingCleanup,
    boundaries.commentCleanup,
    skuParts.skuRepository,
  );
  /*
   * The pool tier's brand write path, for the `Product.brand` populated-sub-property writer. Wired from
   * the same account context as every other write collaborator in this graph — which with no override is
   * the fail-closed port — so a nested brand write attempted outside a boundary raises rather than
   * stamping an anonymous audit column, exactly as the product persistence above does.
   */
  const brandRepository = new MySqlBrandRepository(
    statements.queryRunner,
    boundaries.accountContext,
  );

  return {
    productRepository,
    productPersistence,
    productBaseService,
    productTypeBaseService,
    skuParts,
    productService: assembleProductService({
      /*
       * Deliberately the pool tier. This graph serves reads and refuses direct writes; the transactional
       * write runner rebuilds the service with invocation-scoped boundaries in
       * {@link buildProductBoundaryGraph}.
       */
      boundaries,
      /* — see the boundary rebuild above; both graphs carry the one ceiling. */
      urlTitleProbeBudget: dependencies.urlTitleProbeBudget,
      productRepository,
      persistence: productPersistence,
      statements,
      smartListQueryPort,
      populationCoordinator,
      productTypeRootResolver,
      skuRepository: skuParts.skuRepository,
      skuService: skuParts.skuService,
      optionService: skuParts.optionService,
      productBaseService,
      productTypeBaseService,
      brandRepository,
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

  /**
   * Rule 3b's provenance reader — see {@link CatalogContainer.parentProductTypeIdReader}. Present on the
   * narrow graph as well as the aggregate one because a single-function deployment that mounts only
   * `../handlers/productHandler.ts` reaches its container through this interface, and the product-type
   * read path needs the reader on both.
   */
  readonly parentProductTypeIdReader: ParentProductTypeIdReader;

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
    parentProductTypeIdReader: readHydratedParentProductTypeID,
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
  readonly productPersistence: ProductPersistence;

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
   * Reads the `parentProductTypeID` a product type was hydrated with — rule 3b's provenance record.
   *
   * Published on the container, not merely handed to `ProductService`, because the routing layer needs it
   * too: `../handlers/productHandler.ts` projects `parentProductTypeID` onto a product-type response, and a
   * product type read back from a row carries the key only in this record. Exposing the reader keeps that
   * projection free of any runtime import from the adapter layer, which is the rule that layer boundary
   * exists to enforce; the type it is declared with, `ParentProductTypeIdReader`, is a domain declaration
   * at `../domain/product/ProductType.ts:L105`.
   */
  readonly parentProductTypeIdReader: ParentProductTypeIdReader;

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
  readonly productPersistence?: ProductPersistence;
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
    /* The one budget object, so the option statements and the smart list share one operator figure. */
    statementComplexityBudget: materialisationBudget,
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
    ...(overrides.productPersistence === undefined
      ? {}
      : { productPersistence: overrides.productPersistence }),
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

    /*
     * The same function `composeProductSurface` hands to `ProductService`, published so the routing layer
     * can project `parentProductTypeID` on a read. One declaration, two consumers — not a second reader.
     */
    parentProductTypeIdReader: readHydratedParentProductTypeID,

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
