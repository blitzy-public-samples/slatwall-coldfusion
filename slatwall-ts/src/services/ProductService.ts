/**
 * `ProductService` — the TypeScript port of `model/service/ProductService.cfc`, the largest of the
 * four Catalog services named by the prompt (367 lines, AAP §0.2.1.1).
 *
 * What this file is, and what it deliberately is not
 * It is the preserved public surface of the legacy component: fifteen declared members, at the exact
 * names, arity and argument order the legacy declares (TR-1), plus three members that the legacy never
 * declared anywhere and that only existed because `org/Hibachi/HibachiService.cfc:L255-L281` fabricated
 * them from a method-name prefix at run time (IR-1). Under `strict` TypeScript there is no equivalent
 * facility, so each synthesized call site becomes an explicit, compile-checked declaration.
 *
 * It is not a transliteration. Every framework mechanism the legacy leant on is replaced by a
 * declaration (TR-3): DI/1 property injection becomes constructor injection, `getService("name")`
 * string lookup becomes a typed collaborator, `extends="HibachiService"` plus `super.save` becomes
 * composition against an injected base service (IR-8), the `onMissingMethod` CRUD surface becomes
 * declared methods, and the generic `processProduct(entity, data, context)` dispatcher becomes four
 * direct, typed method calls. There is no string dispatcher, no `Proxy`, no `Reflect`, no indexer and
 * no service locator anywhere below.
 *
 * Four things are absent on purpose, each an omission a reader would otherwise take for a bug:
 *
 * TODO(parity) D15 — `buildSkuCombinations`. `model/service/ProductService.cfc:L82-L97` declares a
 * private `buildSkuCombinations(Array storage, numeric position, any data, String currentOption)`, and a
 * repository-wide search finds exactly two occurrences of the identifier: the declaration at `:L82` and
 * its own recursive call at `:L91`. nothing else calls it, so it is unreachable dead code. It has no
 * member here, and AAP §0.4.1.8 records the omission as a decision — porting it would add a live,
 * testable member the legacy system does not have.
 *
 * D5 — `getProductOptionsByGroup`. `model/entity/Product.cfc:L631-L633` calls
 * `getProductService().getProductOptionsByGroup(this)` and the legacy service declares no such member.
 * The defect is carried on the domain side, where `product.getProductOptionsByGroup()` raises with the
 * locator, so this service's explicit surface has none either; inventing one would repair a legacy defect
 * (AAP §0.6.7.3), which AAP §0.8.2 guideline 4 forbids.
 *
 * Two dead injections. `model/service/ProductService.cfc:L54` declares `property name="productTypeDAO"`
 * and `:L57` declares `property name="contentService"`, and a call-site scan finds zero uses of either
 * (AAP §0.6.3.1). Neither is a constructor parameter here.
 */

import {
  assignPropertyValue,
  clearPropertyValue,
  manageEntity,
  populate,
  populateWithSubProperties,
  unrepresentableValueError,
} from '../domain/base/populate';
import type {
  ColumnPropertyDescriptor,
  ManagedEntity,
  PopulatedSubPropertyRecord,
  PopulatedSubPropertyValue,
  PropertyDescriptorSet,
  SimpleDataValue,
  UnrepresentableValueFailure,
} from '../domain/base/populate';
import type { Option } from '../domain/option/Option';
import type { OptionGroup } from '../domain/option/OptionGroup';
import type { ProductAddOption } from '../domain/process/ProductAddOption';
import type { ProductAddOptionGroup } from '../domain/process/ProductAddOptionGroup';
import { PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS } from '../domain/process/ProductUpdateSkus';
import type { ProductUpdateSkus } from '../domain/process/ProductUpdateSkus';
import { Product } from '../domain/product/Product';
import type {
  ProductDefaultSkuDelegate,
  ProductOptionFinder,
  ProductOptionGroupFinder,
  ProductPropertyName,
  ProductSettingResolver,
  ProductUnusedOptionFinder,
} from '../domain/product/Product';
import { PRODUCT_TYPE_ENTITY_METADATA } from '../domain/product/ProductType';
import type {
  ProductType,
  ProductTypePropertyName,
  ProductTypeRootResolver,
} from '../domain/product/ProductType';
import { Sku } from '../domain/sku/Sku';
import type { ParentProductTypeIdReader } from '../domain/product/ProductType';
import type { DefaultSkuIdReader, SkuSettingResolver } from '../domain/sku/Sku';
import { DomainError, NotImplementedError } from '../errors/DomainError';
import {
  FILE_UPLOAD_RBKEY,
  POPULATED_SUB_PROPERTY_ERROR_KEY,
  PROCESS_OBJECTS_ERROR_KEY,
} from '../errors/ValidationError';
import type { AccountContextPort, AccountReference } from '../ports/AccountContextPort';
import type { PopulationAuthorizationPort } from '../ports/AccountContextPort';
import type { ProductRepository } from '../ports/repositories/ProductRepository';
import type { SkuRepository } from '../ports/repositories/SkuRepository';
import type { SettingResolverPort } from '../ports/SettingResolverPort';
import type {
  SmartListEntityName,
  SmartListInput,
  SmartListJoin,
  SmartListKeywordProperty,
  SmartListPropertyIdentifier,
  SmartListQueryPort,
  SmartListResult,
} from '../ports/SmartListQueryPort';
import type {
  SubscriptionTermPort,
  SubscriptionTermReference,
} from '../ports/SubscriptionTermPort';
import { productValidationRuleSet } from '../validation/rules/product.rules';
import type { ProductValidationSubject } from '../validation/rules/product.rules';
import { productUpdateSkusValidationRuleSet } from '../validation/rules/productUpdateSkus.rules';
import type { ProductUpdateSkusValidationSubject } from '../validation/rules/productUpdateSkus.rules';
import type {
  ProcessObjectValidationTarget,
  ProcessValidationResult,
  ValidationContext,
  Validator,
} from '../validation/Validator';
import { buildIdentifierQuery, translateSmartListInput } from '../ports/SmartListQueryPort';
import { createUniqueURLTitle } from '../util/urlTitle';
import { toExactDecimal, type ExactDecimal } from '../util/formatting';
import type { UniqueValueProbe, UrlTitleProbeBudget } from '../util/urlTitle';
import type {
  BaseService,
  BaseServiceEntity,
  EntityPersister,
  PopulatedSubPropertyWritePhase,
  PopulatedSubPropertyWriter,
  PopulatedSubPropertyWriters,
  PopulationPreparer,
} from './BaseService';
import { createProductOptionFinders } from './OptionService';
import type { OptionService, SelectOption } from './OptionService';
import type { ProductWithErrorState, SkuService } from './SkuService';

/* Section 1 — discriminators and literals transcribed from the source. */

/**
 * The ORM entity name the smart-list override assigns at `model/service/ProductService.cfc:L343`
 * (`arguments.entityName = "SlatwallProduct"`) and the parent name it names at `:L347-L349`.
 */
const PRODUCT_ENTITY_NAME = 'SlatwallProduct' satisfies SmartListEntityName;

/** The ORM entity name behind `productService.getProductType(id)` — see AAP §0.4.2.5. */
const PRODUCT_TYPE_ENTITY_NAME = 'SlatwallProductType' satisfies SmartListEntityName;

/** `model/entity/Product.cfc:L52` — the primary key `getProduct(id)` filters on. */
const PRODUCT_ID_PROPERTY = 'productID' satisfies SmartListPropertyIdentifier<'SlatwallProduct'>;

/** `model/entity/ProductType.cfc:L52` — the primary key `getProductType(id)` filters on. */
/**
 * `productType.productTypeID` — the property identifier that scopes a product query to one product type.
 */
const PRODUCT_TYPE_FILTER_PROPERTY = 'productType.productTypeID';

const PRODUCT_TYPE_ID_PROPERTY =
  'productTypeID' satisfies SmartListPropertyIdentifier<'SlatwallProductType'>;

/**
 * The table discriminator `model/service/ProductService.cfc:L269` hands to
 * `createUniqueURLTitle(titleString=…, tableName="SwProduct")`.
 */
const PRODUCT_TABLE_NAME = 'SwProduct';

/**
 * The same discriminator for the product-type path — `model/service/ProductService.cfc:L297`
 * and `:L299`, which both pass `tableName="SwProductType"`.
 */
const PRODUCT_TYPE_TABLE_NAME = 'SwProductType';

/**
 * `model/entity/Product.cfc:L71` — the property the delete path clears and conditionally restores.
 */
const PRODUCT_DEFAULT_SKU_PROPERTY = 'defaultSku' satisfies ProductPropertyName;

/**
 * The weight every one of the five keyword properties is registered with at
 * `model/service/ProductService.cfc:L351-L355`. All five pass `weight=1`; none differs.
 */
const PRODUCT_KEYWORD_PROPERTY_WEIGHT = 1;

/**
 * The three related-property joins of `model/service/ProductService.cfc:L347-L349`, in declaration
 * order, with the join type each line declares.
 */
const PRODUCT_SMART_LIST_JOINS: readonly SmartListJoin[] = Object.freeze([
  Object.freeze({ parentEntityName: PRODUCT_ENTITY_NAME, relatedProperty: 'productType' }),
  Object.freeze({ parentEntityName: PRODUCT_ENTITY_NAME, relatedProperty: 'defaultSku' }),
  Object.freeze({
    parentEntityName: PRODUCT_ENTITY_NAME,
    relatedProperty: 'brand',
    joinType: 'left',
  }),
] satisfies SmartListJoin[]);

/**
 * The five keyword properties of `model/service/ProductService.cfc:L351-L355`, in declaration ORDER.
 */
const PRODUCT_SMART_LIST_KEYWORD_PROPERTIES: readonly SmartListKeywordProperty[] = Object.freeze([
  Object.freeze({ propertyIdentifier: 'calculatedTitle', weight: PRODUCT_KEYWORD_PROPERTY_WEIGHT }),
  Object.freeze({ propertyIdentifier: 'brand.brandName', weight: PRODUCT_KEYWORD_PROPERTY_WEIGHT }),
  Object.freeze({ propertyIdentifier: 'productName', weight: PRODUCT_KEYWORD_PROPERTY_WEIGHT }),
  Object.freeze({ propertyIdentifier: 'productCode', weight: PRODUCT_KEYWORD_PROPERTY_WEIGHT }),
  Object.freeze({
    propertyIdentifier: 'productType.productTypeName',
    weight: PRODUCT_KEYWORD_PROPERTY_WEIGHT,
  }),
] satisfies SmartListKeywordProperty[]);

/** The CFML list delimiter `listLen`/`listGetAt` default to, used by the selected-options split. */
const CFML_LIST_DELIMITER = ',';

/**
 * The separator `model/service/ProductService.cfc:L183` places between the product code and the
 * ordinal when it composes a subscription SKU's code: `product.getProductCode() & "-#…#"`.
 */
const SKU_CODE_SEGMENT_DELIMITER = '-';

/**
 * `model/service/ProductService.cfc:L295` / `:L297` — the payload key the URL title is written to.
 */
const URL_TITLE_DATA_KEY = 'urlTitle';

/** `model/service/ProductService.cfc:L296` — the payload key preferred as the title source. */
const PRODUCT_TYPE_NAME_DATA_KEY = 'productTypeName';

/** `model/service/ProductService.cfc:L199` — the payload key the delete-image guard tests for. */
const IMAGE_FILE_DATA_KEY = 'imageFile';

/** `model/service/ProductService.cfc:L131` — the creation-data key carrying the option-ID list. */
const OPTIONS_DATA_KEY = 'options';

/**
 * `model/service/ProductService.cfc:L132` — the creation-data key carrying the default SKU price.
 */
const PRICE_DATA_KEY = 'price';

const PRODUCT_SAVE_PRICE_DESCRIPTOR: ColumnPropertyDescriptor<'price'> = Object.freeze({
  name: PRICE_DATA_KEY,
  valueType: 'bigDecimal',
});

/**
 * The one writable non-persistent Product property the save path consumes.
 *
 * [model/entity/Product.cfc:L118] declares `price` with `persistent="false"`, so it correctly does
 * not belong to {@link ProductPropertyName}, the persistent schema union used by repositories and
 * SmartList. The legacy metadata walk still visited it, however, and `saveProduct` immediately reads
 * it through `Product.getPrice()` at [model/service/ProductService.cfc:L273]. A second, deliberately
 * narrow descriptor set keeps that write on the same population/authorisation path without
 * polluting the database schema type with a transient property.
 */
const PRODUCT_SAVE_TRANSIENT_PROPERTY_DESCRIPTORS: PropertyDescriptorSet<Product, 'price'> =
  Object.freeze({
    entityName: 'Product',
    persistent: true,
    properties: Object.freeze([PRODUCT_SAVE_PRICE_DESCRIPTOR]),
  });

/** `model/service/ProductService.cfc:L136` — the conditionally added list-price key. */
const LIST_PRICE_DATA_KEY = 'listPrice';

/**
 * `model/service/ProductService.cfc:L200-L201` — the path segment appended to the image folder
 * setting when the default image is deleted. Transcribed with its trailing slash, because the legacy
 * concatenates the file name directly after it.
 */
const PRODUCT_DEFAULT_IMAGE_PATH_SEGMENT = '/product/default/';

/**
 * `model/service/ProductService.cfc:L240` — the upload directory segment. Transcribed without a
 * trailing slash, because `:L241` supplies the separator itself when it composes the full path. The
 * two constants are deliberately not merged: they are two different literals in the source.
 */
const PRODUCT_DEFAULT_IMAGE_UPLOAD_DIRECTORY_SEGMENT = '/product/default';

/** `model/service/ProductService.cfc:L241` — the separator between directory and file name. */
const IMAGE_PATH_SEPARATOR = '/';

/**
 * `model/service/ProductService.cfc:L249` — the process property whose metadata carries the accepted
 * MIME types for the default-image upload.
 */
const UPLOAD_FILE_PROPERTY_NAME = 'uploadFile';

/** `model/service/ProductService.cfc:L160` — the approved review's active flag. */
const REVIEW_ACTIVE_FLAG_APPROVED = 1;

/** `model/service/ProductService.cfc:L163` — the pending review's active flag. */
const REVIEW_ACTIVE_FLAG_PENDING = 0;

/** The four process contexts this service owns, each a member of {@link ValidationContext}. */
type ProductProcessContext = Extract<
  ValidationContext,
  'addOptionGroup' | 'addOption' | 'addSubscriptionTerm' | 'updateSkus'
>;

/* Section 2 — compile-time proofs. */

/** Resolves to `TActual` only when `TActual` is assignable to `TExpected`. */
type AssertAssignable<TActual extends TExpected, TExpected> = TActual;

/**
 * `Product` carries its own error surface, so it is already the shape
 * `SkuService.createSkus` requires and no wrapping is needed at either call site.
 */
export type ProductSatisfiesSkuServiceContract = AssertAssignable<Product, ProductWithErrorState>;

/**
 * `Product` is already a validation subject for `../validation/rules/product.rules`, which is what
 * lets the save path hand the entity itself to the validator and the process paths hand it a view
 * that merely adds the resolved derived values.
 */
export type ProductSatisfiesValidationSubject = AssertAssignable<Product, ProductValidationSubject>;

/**
 * The setting resolver satisfies both entity-side contracts, which is why one collaborator serves
 * `Product.getTitle(settings)` and `Sku.generateImageFileName(settings)` without an adapter.
 */
export type SettingResolverSatisfiesProductContract = AssertAssignable<
  SettingResolverPort,
  ProductSettingResolver
>;
export type SettingResolverSatisfiesSkuContract = AssertAssignable<
  SettingResolverPort,
  SkuSettingResolver
>;

/**
 * `OptionService` satisfies the unused-option contract `Product` declares, so the injected sibling
 * serves that lookup directly.
 */
export type OptionServiceSatisfiesUnusedOptionFinder = AssertAssignable<
  OptionService,
  ProductUnusedOptionFinder
>;

/** The bound finder pair satisfies both relocated contracts, checked at compile time. */
export type ProductOptionFinderPairSatisfiesGroupFinder = AssertAssignable<
  ReturnType<typeof createProductOptionFinders>,
  ProductOptionGroupFinder
>;
export type ProductOptionFinderPairSatisfiesOptionFinder = AssertAssignable<
  ReturnType<typeof createProductOptionFinders>,
  ProductOptionFinder
>;

/**
 * A term resolved through `../ports/SubscriptionTermPort` fits `Sku.setSubscriptionTerm` directly.
 * `SubscriptionTermRef` additionally declares an optional name, so the narrower port reference is
 * assignable and no shim is required at `model/service/ProductService.cfc:L184`.
 */
export type SubscriptionTermReferenceFitsSku = AssertAssignable<
  SubscriptionTermReference,
  Parameters<Sku['setSubscriptionTerm']>[0]
>;

/**
 * `Product` and `ProductType` both fit the base service's entity constraint at their own property-name
 * unions, which is what makes the two `Pick<BaseService<…>>` aliases below legal instantiations rather
 * than wishful ones.
 */
export type ProductFitsBaseService = AssertAssignable<
  Product,
  BaseServiceEntity<ProductPropertyName>
>;

/* Section 3 — narrow collaborator contracts. */

/**
 * The single base-service member the product path uses: `super.delete(…)` at
 * `model/service/ProductService.cfc:L326`.
 */
export type ProductBaseService = Pick<BaseService<Product, ProductPropertyName>, 'delete'>;

/**
 * The single base-service member the product-type path uses: `super.save(…)` at
 * `model/service/ProductService.cfc:L303`.
 */
export type ProductTypeBaseService = Pick<
  BaseService<ManagedEntity<ProductType>, ProductTypePropertyName>,
  'save'
>;

/** A product type carrying its own error bag — the shape `saveProductType` returns. */
export type ProductTypeWithErrorState = ManagedEntity<ProductType>;

/** The two validator members this service calls — nothing more. */
export type ProductProcessValidator = Pick<Validator, 'validate' | 'validateProcess'>;

/**
 * A product's selectable options, grouped by option-group name — what `getFormattedOptionGroups` answers.
 *
 * TODO(parity) D25 — a name-collapse divergence, and the name is the identity. Because the legacy keys
 * by name, two groups sharing a name collapse to one entry and the last one wins. That is preserved
 * exactly, and it is a second reason no identifier is published: a collapsed entry would have to choose
 * which group's identifier to report, and there is no legacy answer to that question. `D25` is a correction
 * alias for this observation rather than a register entry — AAP §0.6.7 stays frozen at D1–D21, and
 * `../ports/repositories/SkuRepository.ts` defines the five aliases the port carries and states both frozen
 * bounds.
 */
export type FormattedOptionGroups = Readonly<Record<string, readonly SelectOption[]>>;

/* Section 4 — structural contracts for the three out-of-scope process objects. */

/** The review object `model/service/ProductService.cfc:L160`, `:L163` and `:L167` mutate. */
interface ProductReviewTarget {
  setActiveFlag(activeFlag: number): void;
  setAccount(account: AccountReference): void;
}

/** The `addProductReview` process object — one read, at `model/service/ProductService.cfc:L160`. */
interface ProductReviewProcessObject {
  getNewProductReview(): ProductReviewTarget;
}

/**
 * The `addSubscriptionTerm` process object — four reads, at
 * `model/service/ProductService.cfc:L175`, `:L178`, `:L179` and `:L180`.
 */
interface SubscriptionTermProcessObject {
  getSubscriptionTermID(): string;
  getPrice(): unknown;
  getRenewalPrice(): unknown;
  getListPrice(): unknown;
}

/**
 * The metadata `model/service/ProductService.cfc:L249` reads off the `uploadFile` property to obtain
 * the accepted MIME types. The attribute keeps its legacy spelling, `hb_fileAcceptMIMEType`, because
 * that is the key the excluded component declares.
 */
interface UploadFilePropertyMetaData {
  readonly hb_fileAcceptMIMEType?: string;
}

/**
 * The `uploadDefaultImage` process object — three reads, at
 * `model/service/ProductService.cfc:L241`, `:L249` and `:L253`.
 */
interface UploadDefaultImageProcessObject {
  getImageFile(): string;
  getPropertyMetaData(propertyName: string): UploadFilePropertyMetaData;
  addError(errorName: string, errorMessage: string): void;
}

/* Section 5 — the collaborator graph. */

/**
 * The asynchronous bridge between boundary reads and the synchronous population contract.
 *
 * The resolver returns a fresh descriptor set per call when it carries mutable lookup caches, so no
 * relationship object or principal-derived state can leak across warm invocations (M7).
 */
export type ProductPropertyDescriptorResolver = (
  data: Readonly<Record<string, unknown>>,
) => Promise<PropertyDescriptorSet<Product, ProductPropertyName>>;

/** Everything this service needs, named. */
export interface ProductServiceCollaborators {
  /**
   * `property name="productDAO"` — `model/service/ProductService.cfc:L53`, one call site, at `:L67`.
   */
  readonly productRepository: ProductRepository;

  /**
   * `property name="skuDAO"` — `model/service/ProductService.cfc:L52`, one call site, at `:L105`.
   */
  readonly skuRepository: SkuRepository;

  /**
   * `property name="skuService"` — `model/service/ProductService.cfc:L58`, three call sites, at
   * `:L150`, `:L176` and `:L279`.
   */
  readonly skuService: SkuService;

  /**
   * `property name="optionService"` — `model/service/ProductService.cfc:L60`, three call sites, at
   * `:L76`, `:L115` and `:L130`. Serves as all three of `Product`'s option-finder contracts; see the
   * proofs in section 2.
   */
  readonly optionService: OptionService;

  /**
   * The composed base service for the product delete path — `model/service/ProductService.cfc:L326`.
   */
  readonly baseService: ProductBaseService;

  /**
   * The composed base service for the product-type save path — `model/service/ProductService.cfc:L303`.
   */
  readonly productTypeBaseService: ProductTypeBaseService;

  /** The validator behind `:L273` and behind the retired process pipeline. */
  readonly validator: ProductProcessValidator;

  /**
   * `getHibachiScope().setting(…)` at `model/service/ProductService.cfc:L200`, `:L201` and `:L240`,
   * plus `product.setting(…)` at `:L159` and the title and image-file-name members the retained code
   * reaches. IR-2 — a narrow setting port, not the platform-wide settings engine.
   */
  readonly settings: SettingResolverPort;

  /**
   * `getHibachiScope().getLoggedInFlag()` at `model/service/ProductService.cfc:L166` and
   * `getHibachiScope().getAccount()` at `:L167`.
   */
  readonly accountContext: AccountContextPort;

  /** The paginated dynamic-query abstraction behind `:L345` and behind the two `get*` members. */
  readonly smartListQueryPort: SmartListQueryPort;

  /**
   * `property name="subscriptionService"` — `model/service/ProductService.cfc:L59`, one call site, at
   * `:L175`. Crosses the boundary as a port because the subscription domain is excluded (TR-5).
   */
  readonly subscriptionTermPort: SubscriptionTermPort;

  /**
   * Resolves a product type's root ancestor so `Product.getBaseProductType(…)` can answer the
   * discriminator the three process contexts gate on.
   */
  readonly productTypeRootResolver: ProductTypeRootResolver;

  /**
   * The population contract `model/service/ProductService.cfc:L266` drives — `product.populate(data)`.
   */
  readonly productPropertyDescriptors: PropertyDescriptorSet<Product, ProductPropertyName>;

  /**
   * Resolves the descriptor set for one save after asynchronous relationship rows have been loaded.
   *
   * `populate` keeps {@link RelatedEntityLoader} synchronous, matching
   * [org/Hibachi/HibachiTransient.cfc:L239/L261]. SQL adapters are asynchronous, so the composition
   * root may pre-resolve the identifiers present in this payload and return per-call cache-backed
   * loaders. Omit this only when `productPropertyDescriptors` already contains every relationship
   * loader the caller needs.
   */
  readonly resolveProductPropertyDescriptors?: ProductPropertyDescriptorResolver;

  /** The population authorisation gate of `org/Hibachi/HibachiTransient.cfc:L186-L190`. */
  readonly populationAuthorization: PopulationAuthorizationPort;

  /**
   * Primes repository-backed relationship loaders before the synchronous Product population pass.
   */
  readonly prepareProductPopulation: PopulationPreparer;

  /** The uniqueness probe `createUniqueURLTitle` calls once per collision candidate. */
  readonly isUrlTitleAvailable: UniqueValueProbe;

  /**
   * The ceiling on how many uniqueness probes one URL-title derivation may issue — see
   * {@link UrlTitleProbeBudget} in `../util/urlTitle`.
   */
  readonly urlTitleProbeBudget: UrlTitleProbeBudget;

  /*
   * There is no `importOptions` collaborator and no third parameter on `loadDataFromFile`, and neither
   * may be added. AAP §0.4.2.1 tabulates the member as `loadDataFromFile(fileURL, textQualifier?)` — two
   * arguments — and §0.8.3.1 makes that arity the checkable artefact. A cancellation signal or a
   * deferred-backfill switch has no legacy counterpart either: `model/service/ProductService.cfc:L65-L68`
   * sets a request timeout and nothing else, so a caller-supplied control would be a capability the source
   * does not describe (AAP §0.7.3, IR-12). A deployment that must orchestrate the importer out of band
   * does so at the handler layer, where mismatch M1 is flagged.
   */

  /**
   * The direct persister behind `getHibachiDAO().save(target=arguments.product)` at
   * `model/service/ProductService.cfc:L287`.
   */
  readonly persistProduct: EntityPersister<Product>;

  /** Reads the identifier of the delegate held in `product.defaultSku`. */
  readonly defaultSkuIdReader: DefaultSkuIdReader;

  /** Reads the `parentProductTypeID` a product type was hydrated with. */
  readonly parentProductTypeIdReader: ParentProductTypeIdReader;

  /**
   * The validate-and-persist pass for each related entity a nested payload struct populated —
   * `org/Hibachi/HibachiTransient.cfc:L407-L450` and `org/Hibachi/HibachiDAO.cfc:L48-L67`. Keyed by the
   * Product property the nested struct arrived under. See {@link PopulatedSubPropertyWriters}, and
   * {@link ProductService.applyPopulatedSubPropertyValidation} for what an absent key means.
   */
  readonly populatedSubPropertyWriters: PopulatedSubPropertyWriters<ProductPropertyName>;
}

/* Section 6 — CFML value semantics. */

/** CFML's `isNumeric`, as applied to a value read out of a struct or a process object. */
function readsAsCfmlNumeric(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(trimmed);
}

/**
 * CFML's numeric coercion. Booleans become 1 and 0, as CFML's own numeric cast does; anything that
 * `isNumeric` rejects yields `NaN` rather than a fabricated zero, so a caller must decide what to do
 * about it rather than silently storing a number the payload never contained.
 */
function toCfmlNumber(value: unknown): number {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (!readsAsCfmlNumeric(value)) {
    return Number.NaN;
  }
  return Number(typeof value === 'string' ? value.trim() : value);
}

/** CFML's `isSimpleValue` — a string, a number or a boolean, and nothing else. */
function isCfmlSimpleValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** Whether CFML's boolean cast would accept the value at all, rather than raising. */
function readsAsCfmlBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'string') {
    return false;
  }
  const normalised = value.trim().toLowerCase();
  return (
    normalised === 'true' ||
    normalised === 'false' ||
    normalised === 'yes' ||
    normalised === 'no' ||
    readsAsCfmlNumeric(value)
  );
}

/** CFML boolean coercion. Only meaningful once `readsAsCfmlBoolean` has accepted the value. */
function toCfmlBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    if (normalised === 'true' || normalised === 'yes') {
      return true;
    }
    if (normalised === 'false' || normalised === 'no') {
      return false;
    }
    if (readsAsCfmlNumeric(value)) {
      return toCfmlNumber(value) !== 0;
    }
  }
  return false;
}

/**
 * `structKeyExists(data, key)`, using an own-property test so an inherited key cannot masquerade as a
 * supplied one.
 */
function dataKeyExists(data: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(data, key);
}

/**
 * CFML's `len(data.key)` for a payload value, expressed as a length.
 *
 */
function dataValueLength(data: Record<string, unknown>, key: string): number {
  if (!dataKeyExists(data, key)) {
    return 0;
  }
  return requirePayloadSimpleText(data[key], key, 'model/service/ProductService.cfc:L295').length;
}

/**
 * The payload value as CFML would render it in a string context, or `undefined` when the key is absent.
 *
 */
function dataValueText(data: Record<string, unknown>, key: string): string | undefined {
  if (!dataKeyExists(data, key)) {
    return undefined;
  }
  return requirePayloadSimpleText(data[key], key, 'model/service/ProductService.cfc:L296');
}

/**
 * Renders a payload value as CFML would in a string context, raising when it has no such rendering.
 *
 */
function requirePayloadSimpleText(value: unknown, key: string, locator: string): string {
  if (!isCfmlSimpleValue(value)) {
    throw new DomainError(
      'saveProductType measures a payload key with len(), but the supplied value is not a simple ' +
        'value. CFML raises on the same input rather than treating it as absent.',
      { context: { key, locator } },
    );
  }
  return String(value);
}

/** CFML's `!isNull(x) && len(x)` for an entity string property. */
/**
 * CFML's `value != ""` on an untyped value — the first half of the guard at
 * `model/service/ProductService.cfc:L180`.
 */
function readsAsNonEmptyCfmlText(value: unknown): boolean {
  /*
   * CFML cannot compare a complex value with a string at all — it raises "Can't cast Object to
   * String". Answering false leaves the guard at `:L180` unmet, which is also the conclusion its
   * second clause, `isNumeric(...)`, reaches independently for the same value.
   */
  if (!isCfmlSimpleValue(value)) {
    return false;
  }

  return String(value) !== '';
}

function hasEntityText(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

/** Whether a non-null object's members may be read by an arbitrary string name. */
function isMemberIndexable(candidate: unknown): candidate is Readonly<Record<string, unknown>> {
  return typeof candidate === 'object' && candidate !== null;
}

/** Whether an unknown value carries a callable member of the given name. */
function hasCallableMember(candidate: unknown, memberName: string): boolean {
  if (!isMemberIndexable(candidate)) {
    return false;
  }
  return typeof candidate[memberName] === 'function';
}

/** Narrows the `addProductReview` process object to its one observed member. */
function isProductReviewProcessObject(candidate: unknown): candidate is ProductReviewProcessObject {
  return hasCallableMember(candidate, 'getNewProductReview');
}

/** Narrows the `addSubscriptionTerm` process object to its four observed members. */
function isSubscriptionTermProcessObject(
  candidate: unknown,
): candidate is SubscriptionTermProcessObject {
  return (
    hasCallableMember(candidate, 'getSubscriptionTermID') &&
    hasCallableMember(candidate, 'getPrice') &&
    hasCallableMember(candidate, 'getRenewalPrice') &&
    hasCallableMember(candidate, 'getListPrice')
  );
}

/** Narrows the `uploadDefaultImage` process object to its three observed members. */
function isUploadDefaultImageProcessObject(
  candidate: unknown,
): candidate is UploadDefaultImageProcessObject {
  return (
    hasCallableMember(candidate, 'getImageFile') &&
    hasCallableMember(candidate, 'getPropertyMetaData') &&
    hasCallableMember(candidate, 'addError')
  );
}

/* Section 7 — entity narrowing and query composition. */

/**
 * Narrows a product's SKU collection from the relationship's declared member interface to the entity.
 */
function readProductSkusAsSkus(product: Product, locator: string): Sku[] {
  const skus: Sku[] = [];
  for (const member of product.getSkus()) {
    if (!(member instanceof Sku)) {
      throw new DomainError(
        'The product has an associated SKU that is not a Sku entity, so this member cannot read it.',
        { context: { productID: product.productID, locator } },
      );
    }
    skus.push(member);
  }
  return skus;
}

/** Builds the validation view `../validation/rules/product.rules` expects. */
function buildProductValidationSubject(
  product: Product,
  derived: ProductDerivedValidationValues,
): ProductValidationSubject {
  return {
    getClassName: () => product.getClassName(),
    hasProperty: (propertyIdentifier: string) => product.hasProperty(propertyIdentifier),
    getPropertyMetaData: (propertyName: string) => product.getPropertyMetaData(propertyName),
    getEntityName: () => product.getEntityName(),
    getPrimaryIDValue: () => product.getPrimaryIDValue(),
    getPrimaryIDPropertyName: () => product.getPrimaryIDPropertyName(),
    getValueByPropertyIdentifier: (propertyIdentifier: string) =>
      product.getValueByPropertyIdentifier(propertyIdentifier),
    /*
     * `productType` needs no guard: the rule reads it as the unknown top type, which already admits
     * absence, and a presence check on a missing reference is the whole point of that rule.
     */
    productType: product.productType,
    ...(derived.baseProductType === undefined ? {} : { baseProductType: derived.baseProductType }),
    ...(derived.price === undefined ? {} : { price: derived.price }),
    ...(product.productName === undefined ? {} : { productName: product.productName }),
    ...(product.productCode === undefined ? {} : { productCode: product.productCode }),
    /*
     * The memoised slot, read exactly as it stands. Only the `delete` context's guard reads this, and
     * that context is owned by the composed base service and its own delete-subject resolver — never
     * by this view — so resolving it here would issue a query no applicable rule consumes.
     */
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
    ...(product.urlTitle === undefined ? {} : { urlTitle: product.urlTitle }),
  };
}

/**
 * Reads one recorded populated sub-property as the list of entities to validate and persist.
 *
 * `org/Hibachi/HibachiTransient.cfc:L426` makes the same distinction with `isArray`: a many-to-one
 * member records one entity, a one-to-many or many-to-many member records an array of them.
 *
 * @param populated - One value out of the populated-sub-property record.
 * @returns The entities it names, always as a list.
 */
function readPopulatedSubPropertyEntities(populated: PopulatedSubPropertyValue): readonly object[] {
  return isRelatedEntityList(populated) ? populated : [populated];
}

/**
 * Whether one recorded populated sub-property holds a list of entities rather than a single entity.
 *
 * A declared predicate rather than an inline `Array.isArray`, because `Array.isArray` narrows a
 * `readonly T[]` member of a union to the mutable `any[]` its own signature declares, which reintroduces
 * `any` into a file that admits none. The predicate states the narrowing the union already expresses.
 *
 * @param populated - One value out of the populated-sub-property record.
 * @returns `true` for the one-to-many and many-to-many arm.
 */
function isRelatedEntityList(populated: PopulatedSubPropertyValue): populated is readonly object[] {
  return Array.isArray(populated);
}

/**
 * Renders a collected unrepresentable payload value as the text a declared rule should judge.
 *
 * CFML pushed `trim(value)` into the property [org/Hibachi/HibachiTransient.cfc:L207] whatever the
 * declared `ormtype` was, so the value a rule read was always the trimmed rendering — including for a
 * boolean or a number that had arrived as JSON. This reproduces that one line, and nothing more: no
 * coercion is attempted, because failing to coerce is precisely what brought the value here.
 *
 * @param rawValue - The payload value as it arrived.
 * @returns Its trimmed rendering.
 */
function renderUnrepresentableValue(rawValue: SimpleDataValue): string {
  return String(rawValue).trim();
}

/**
 * The first collected unrepresentable value that no declared rule reported against.
 *
 * The legacy's flush failed on the first offending column the ORM reached, and reported nothing about the
 * others; a property whose rule already refused the save never reached the flush at all. Both facts are
 * expressed here: the scan stops at the first uncovered property, in the declaration order population
 * visited, and a property carrying a finding is skipped.
 *
 * @param failures - Every collected failure, keyed by property name.
 * @param product - The product whose error bag says which properties a rule already refused.
 * @returns The failure to raise, or `undefined` when every collected value was reported.
 */
function readFirstUnreportedUnrepresentableValue(
  failures: ReadonlyMap<string, UnrepresentableValueFailure>,
  product: Product,
): UnrepresentableValueFailure | undefined {
  for (const [propertyName, failure] of failures) {
    if (!product.hasError(propertyName)) {
      return failure;
    }
  }

  return undefined;
}

/** The values {@link buildProductValidationSubject} cannot read straight off the entity. */
interface ProductDerivedValidationValues {
  readonly baseProductType?: string | undefined;

  /**
   * The price the `price` rule reads.
   *
   * `string` as well as {@link ExactDecimal}, because a payload value that no exact decimal can represent
   * is exactly what the rule exists to refuse. CFML assigned `"abc"` to the property and let
   * `model/validation/Product.json:L8`'s `dataType="numeric"` reject it; this port cannot assign it to a
   * typed field, so the raw text is carried into the subject instead and the same rule reaches the same
   * verdict. See {@link ProductService.saveProduct} step 3.
   */
  readonly price?: ExactDecimal | string | undefined;
  readonly unusedProductOptions?: readonly unknown[] | undefined;
  readonly unusedProductOptionGroups?: readonly unknown[] | undefined;
  readonly unusedProductSubscriptionTerms?: readonly unknown[] | undefined;
}

/** Builds the process-object validation view for the `updateSkus` context. */
function buildProductUpdateSkusValidationSubject(
  processObject: ProductUpdateSkus,
): ProductUpdateSkusValidationSubject {
  return {
    getClassName: () => PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.entityName,
    hasProperty: (propertyIdentifier: string) =>
      PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.properties.some(
        (descriptor) => descriptor.name === propertyIdentifier,
      ),
    ...(processObject.updatePriceFlag === undefined
      ? {}
      : { updatePriceFlag: processObject.updatePriceFlag }),
    ...(processObject.price === undefined ? {} : { price: processObject.price }),
    ...(processObject.updateListPriceFlag === undefined
      ? {}
      : { updateListPriceFlag: processObject.updateListPriceFlag }),
    ...(processObject.listPrice === undefined ? {} : { listPrice: processObject.listPrice }),
  };
}

/* Section 8 — the service. */

/** The catalog product service. */
export class ProductService {
  private readonly productRepository: ProductRepository;

  private readonly skuRepository: SkuRepository;

  private readonly skuService: SkuService;

  private readonly optionService: OptionService;

  private readonly baseService: ProductBaseService;

  private readonly productTypeBaseService: ProductTypeBaseService;

  private readonly validator: ProductProcessValidator;

  private readonly settings: SettingResolverPort;

  private readonly accountContext: AccountContextPort;

  private readonly smartListQueryPort: SmartListQueryPort;

  private readonly subscriptionTermPort: SubscriptionTermPort;

  private readonly productTypeRootResolver: ProductTypeRootResolver;

  /** The two product-scoped option queries, bound to the injected port once per service. */
  private readonly productOptionFinders: ProductOptionGroupFinder & ProductOptionFinder;

  private readonly productPropertyDescriptors: PropertyDescriptorSet<Product, ProductPropertyName>;

  private readonly resolveProductPropertyDescriptors: ProductPropertyDescriptorResolver;

  private readonly populationAuthorization: PopulationAuthorizationPort;

  private readonly prepareProductPopulation: PopulationPreparer;

  private readonly isUrlTitleAvailable: UniqueValueProbe;

  /** — see {@link ProductServiceCollaborators.urlTitleProbeBudget}. */
  private readonly urlTitleProbeBudget: UrlTitleProbeBudget;

  private readonly persistProduct: EntityPersister<Product>;

  /** @see ProductServiceCollaborators.defaultSkuIdReader. */
  private readonly defaultSkuIdReader: DefaultSkuIdReader;

  /** See {@link ProductServiceCollaborators.parentProductTypeIdReader}. */
  private readonly parentProductTypeIdReader: ParentProductTypeIdReader;

  /** See {@link ProductServiceCollaborators.populatedSubPropertyWriters}. */
  private readonly populatedSubPropertyWriters: PopulatedSubPropertyWriters<ProductPropertyName>;

  /**
   * Wires the graph the retired DI/1 container used to wire by name.
   *
   * @param collaborators - The declared service edges, named.
   */
  public constructor(collaborators: ProductServiceCollaborators) {
    this.productRepository = collaborators.productRepository;
    this.skuRepository = collaborators.skuRepository;
    this.skuService = collaborators.skuService;
    this.optionService = collaborators.optionService;
    this.baseService = collaborators.baseService;
    this.productTypeBaseService = collaborators.productTypeBaseService;
    this.validator = collaborators.validator;
    this.settings = collaborators.settings;
    this.accountContext = collaborators.accountContext;
    this.smartListQueryPort = collaborators.smartListQueryPort;
    this.subscriptionTermPort = collaborators.subscriptionTermPort;
    this.productTypeRootResolver = collaborators.productTypeRootResolver;
    this.parentProductTypeIdReader = collaborators.parentProductTypeIdReader;
    this.populatedSubPropertyWriters = collaborators.populatedSubPropertyWriters;
    this.productOptionFinders = createProductOptionFinders(collaborators.smartListQueryPort);
    this.productPropertyDescriptors = collaborators.productPropertyDescriptors;
    this.resolveProductPropertyDescriptors =
      collaborators.resolveProductPropertyDescriptors ??
      (() => Promise.resolve(this.productPropertyDescriptors));
    this.populationAuthorization = collaborators.populationAuthorization;
    this.prepareProductPopulation = collaborators.prepareProductPopulation;
    this.isUrlTitleAvailable = collaborators.isUrlTitleAvailable;
    this.urlTitleProbeBudget = collaborators.urlTitleProbeBudget;
    this.persistProduct = collaborators.persistProduct;
    this.defaultSkuIdReader = collaborators.defaultSkuIdReader;
  }

  /* Previously synthesized members — IR-1. */

  /**
   * Constructs a new, transient product — the `new*` prefix branch of the retired dispatcher.
   *
   * @returns a transient product with an empty primary key.
   */
  public newProduct(): Product {
    return new Product();
  }

  /**
   * Loads one product by its identifier, or resolves `null` when no such product exists.
   *
   * @param productID - The 32-character product identifier.
   * @returns The product, or `null` when the identifier matches no row.
   */
  public async getProduct(productID: string): Promise<Product | null> {
    const records = await this.smartListQueryPort.executeRecords(
      buildIdentifierQuery(PRODUCT_ENTITY_NAME, PRODUCT_ID_PROPERTY, productID),
    );

    return records[0] ?? null;
  }

  /**
   * Loads one product type by its identifier, or resolves `null` when no such type exists.
   *
   * @param productTypeID - The 32-character product-type identifier.
   * @returns The product type, or `null` when the identifier matches no row.
   */
  public async getProductType(productTypeID: string): Promise<ProductType | null> {
    const records = await this.smartListQueryPort.executeRecords(
      buildIdentifierQuery(PRODUCT_TYPE_ENTITY_NAME, PRODUCT_TYPE_ID_PROPERTY, productTypeID),
    );

    return records[0] ?? null;
  }

  /* The retired process pipeline, as two private members. */

  /** Resolves the derived values the rules of one process context read, and nothing else. */
  private async buildProcessValidationSubject(
    product: Product,
    context: ProductProcessContext,
  ): Promise<ProductValidationSubject> {
    if (context === 'updateSkus') {
      return buildProductValidationSubject(product, {});
    }

    /*
     * `model/validation/Product.json` gates all three process contexts on this discriminator —
     * merchandise for the two option contexts, subscription for the term context.
     */
    const baseProductType = await product.getBaseProductType(this.productTypeRootResolver);

    if (context === 'addOptionGroup') {
      const unusedProductOptionGroups = await product.getUnusedProductOptionGroups(
        this.optionService,
        this.productOptionFinders,
      );

      return buildProductValidationSubject(product, { baseProductType, unusedProductOptionGroups });
    }

    if (context === 'addOption') {
      const unusedProductOptions = await product.getUnusedProductOptions(
        this.optionService,
        this.productOptionFinders,
      );

      return buildProductValidationSubject(product, { baseProductType, unusedProductOptions });
    }

    const unusedProductSubscriptionTerms = await product.getUnusedProductSubscriptionTerms();

    return buildProductValidationSubject(product, {
      baseProductType,
      unusedProductSubscriptionTerms,
    });
  }

  /**
   * Runs the two-pass validation that `org/Hibachi/HibachiService.cfc:L84-L120` ran around every
   * `processProduct_*` member, and records the entity findings on the entity.
   */
  private async runProcessValidation(
    product: Product,
    context: ProductProcessContext,
    processObject?: ProcessObjectValidationTarget<ProductUpdateSkusValidationSubject>,
  ): Promise<ProcessValidationResult> {
    const subject = await this.buildProcessValidationSubject(product, context);

    const result = await this.validator.validateProcess<
      ProductValidationSubject,
      ProductUpdateSkusValidationSubject
    >({
      entity: subject,
      entityRuleSet: productValidationRuleSet,
      processContext: context,
      ...(processObject === undefined ? {} : { processObject }),
    });

    product.addErrors(result.entityErrors.getErrors());

    /*
     * `model/entity/HibachiEntity.cfc:L134-L138` — the process object's findings make the entity report
     * errors, under the context key, recorded at most once and matched case-insensitively.
     */
    if (result.processObjectErrors.hasErrors()) {
      const alreadyRecorded = product
        .getError(PROCESS_OBJECTS_ERROR_KEY)
        .some((recordedContext) => recordedContext.toLowerCase() === context.toLowerCase());

      if (!alreadyRecorded) {
        product.addError(PROCESS_OBJECTS_ERROR_KEY, context);
      }
    }

    return result;
  }

  /** Derives a URL title that is free on `SwProduct` — `model/service/ProductService.cfc:L269`. */
  private createUniqueProductUrlTitle(titleString: string): Promise<string> {
    return createUniqueURLTitle(
      titleString,
      PRODUCT_TABLE_NAME,
      this.isUrlTitleAvailable,
      this.urlTitleProbeBudget,
    );
  }

  /**
   * The same derivation against `SwProductType` — `model/service/ProductService.cfc:L297`, `:L299`.
   */
  private createUniqueProductTypeUrlTitle(titleString: string): Promise<string> {
    return createUniqueURLTitle(
      titleString,
      PRODUCT_TYPE_TABLE_NAME,
      this.isUrlTitleAvailable,
      this.urlTitleProbeBudget,
    );
  }

  /** Reads a product's default SKU, raising where the legacy dereferences it without a guard. */
  private requireDefaultSku(product: Product, locator: string): ProductDefaultSkuDelegate {
    const defaultSku = product.defaultSku;
    if (defaultSku === undefined) {
      throw new DomainError(
        'The product has no default SKU, and the legacy member dereferences it without a guard.',
        { context: { productID: product.productID, locator } },
      );
    }

    return defaultSku;
  }

  /* Declared member 1 of 15 — `model/service/ProductService.cfc:L65` */

  /**
   * Imports products from a delimited file.
   *
   * @param fileURL - The location the caller asks to import from, forwarded to the repository untouched
   * and uninspected by this member, exactly as `:L67` forwards it. Forwarding it unmodified is what lets
   * the delimiter be derived from the string the caller actually wrote, and what lets the policy the
   * repository applies be evaluated against that same string.
   *
   * @param textQualifier - The optional text qualifier, defaulting to the empty string as `:L65` does.
   */
  public async loadDataFromFile(fileURL: string, textQualifier: string = ''): Promise<void> {
    /*
     * One statement, and its restraint is the point. `model/service/ProductService.cfc:L65` declares
     * `required string fileURL` and `:L67` hands it straight to the DAO, which retrieves it server-side at
     * `model/dao/ProductDAO.cfc:L87`. Nothing on that legacy path inspects the location, and nothing here
     * rewrites it: the argument reaches the port exactly as the caller wrote it, which is what keeps the
     * delimiter derived from the caller's own string and what lets any policy an operator injects be
     * evaluated against that same string. Trimming or normalising it here would hand whatever is
     * downstream a value the caller never supplied.
     */
    await this.productRepository.importFromFile(fileURL, textQualifier);
  }

  /* Declared member 2 of 15 — `model/service/ProductService.cfc:L70` */

  /**
   * Groups a product's selectable options by option-group name.
   *
   * TODO(parity) D25 [`model/service/ProductService.cfc:L70-L80`]: the legacy answers a name-keyed
   * struct, and so does the port
   * `D25` is the correction alias for this observation — see {@link FormattedOptionGroups} for its status
   * and `../ports/repositories/SkuRepository.ts` for the closed alias set and the two frozen AAP ranges.
   *
   * TODO(parity) — two unscoped variables, unnumbered and of the same scoping class as D10. `:L73` assigns `productObjectGroups` and
   * `:L75` assigns the loop counter `i`, both without `var`, so in CFML both leak into the component's
   * shared `variables` scope. On a singleton service under concurrent requests that is a genuine race: two
   * simultaneous callers share one counter. TypeScript's block scoping removes the hazard by
   * construction — the `for…of` binding below cannot escape the loop — and that is recorded as a
   * deliberate translation decision rather than assigned a new defect number, exactly as AAP §0.6.7.5
   * treats the same class of finding at `:L70-L80`.
   *
   * @param product - The product whose option groups are read.
   * @returns One entry per distinct option-group name, keyed by that name, in first-seen group order.
   * @throws {DomainError} when an option group carries no name, matching the legacy's unguarded read.
   */
  public async getFormattedOptionGroups(product: Product): Promise<FormattedOptionGroups> {
    /*
     * A `Map`, not an object written to in the loop, and the choice is behavioural. `:L76`'s struct
     * assignment makes the group name the identity of an entry, so a repeated name must overwrite rather
     * than append (behaviour 2). A `Map` reproduces that exactly: `set` on an existing key replaces the
     * value and keeps the original insertion position, so the surviving entry is the last group's options
     * sitting at the first occurrence's place. Accumulating into a `Map` first also keeps every key a
     * plain data key — a group named `constructor` or `__proto__` cannot reach an object prototype on the
     * way in, and the materialisation below uses `object.fromEntries`, which assigns own properties.
     */
    const availableOptions = new Map<string, readonly SelectOption[]>();

    const productObjectGroups: OptionGroup[] = await product.getOptionGroups(
      this.productOptionFinders,
    );

    for (const optionGroup of productObjectGroups) {
      const optionGroupName = optionGroup.optionGroupName;
      if (optionGroupName === undefined) {
        throw new DomainError(
          'An option group has no name, so it cannot label a formatted option group.',
          {
            context: {
              productID: product.productID,
              optionGroupID: optionGroup.optionGroupID,
              locator: 'model/service/ProductService.cfc:L76',
            },
          },
        );
      }

      /*
       * Sequential on purpose. The legacy loop resolves one group's options before moving to the next,
       * and the map is built in that order; `Promise.all` would issue them concurrently and is not used
       * (house style) even though the results happen to be independent.
       */
      const options: Option[] = await product.getOptionsByOptionGroup(
        this.productOptionFinders,
        optionGroup.optionGroupID,
      );

      availableOptions.set(optionGroupName, this.optionService.getOptionsForSelect(options));
    }

    /*
     * Materialised once, at the end, in `Map` insertion order — first-seen group order. CFML specifies
     * none, and the one JavaScript exception to insertion order is recorded on
     * {@link FormattedOptionGroups}. `Object.fromEntries` assigns own properties, so no key can reach a
     * prototype.
     */
    return Object.fromEntries(availableOptions);
  }

  /* Declared member 3 of 15 — `model/service/ProductService.cfc:L104` */

  /**
   * Resolves the SKUs of one product that carry every one of the selected options.
   *
   * @param selectedOptions - A comma-delimited list of option identifiers, read with CFML list
   * semantics. May be empty, which is a legal input meaning "no option filter" (T5).
   *
   * @param productID - The product whose SKUs are searched. Required, and second (T2).
   * @returns Every SKU of that product carrying all of the selected options, distinct.
   */
  public getProductSkusBySelectedOptions(
    selectedOptions: string,
    productID: string,
  ): Promise<Sku[]> {
    const optionIds: string[] = selectedOptions
      .split(CFML_LIST_DELIMITER)
      .filter((optionId) => optionId.length > 0);

    return this.skuRepository.findSkusBySelectedOptions(optionIds, productID);
  }

  /* Declared member 4 of 15 — `model/service/ProductService.cfc:L113` */

  /**
   * Adds an option group to a product, and one of its options to every existing SKU.
   *
   * TODO(parity) D14 — `model/service/ProductService.cfc:L113-L126`: only the first option is added
   * `:L118` is `skus[i].addOption(options[1])`. CFML arrays are 1-based, so `options[1]` is the first
   * option of the newly added group — and it is added to every existing SKU, for every SKU, regardless
   * of how many options the group contains. A product with three existing SKUs and a new group of four
   * options gains one option on each SKU, not a twelve-SKU matrix.
   *
   * TODO(parity) — unnumbered, of the same scoping class as D10: `:L118` declares its loop counter `i` without `var`, leaking it into the
   * component's shared scope on a singleton service. Block scoping removes the hazard; recorded as a
   * translation decision without minting a new number.
   *
   * @param product - The product being processed. Returned whether or not the body runs.
   * @param processObject - Carries the option-group identifier to add.
   * @returns The same product, as `:L125` does.
   * @throws {DomainError} when no option-group identifier was supplied, or when the identifier resolves
   * to no group — both points at which the legacy dereferences without a guard.
   */
  public async processProductAddOptionGroup(
    product: Product,
    processObject: ProductAddOptionGroup,
  ): Promise<Product> {
    await this.runProcessValidation(product, 'addOptionGroup');
    if (product.hasErrors()) {
      return product;
    }

    /* `:L114` — the SKUs first, exactly as written. */
    const skus: Sku[] = readProductSkusAsSkus(product, 'model/service/ProductService.cfc:L114');

    /*
     * `:L115` — `getOptionService().getOptionGroup( processObject.getOptionGroup ).getOptions()`,
     * chained with no null check at either step.
     */
    const optionGroupID = processObject.optionGroup;
    if (optionGroupID === undefined) {
      throw new DomainError(
        'The addOptionGroup process object carries no option-group identifier, and the legacy member ' +
          'passes it to the lookup without a guard.',
        {
          context: {
            productID: product.productID,
            locator: 'model/service/ProductService.cfc:L115',
          },
        },
      );
    }

    const optionGroup = await this.optionService.getOptionGroup(optionGroupID);
    if (optionGroup === null) {
      throw new DomainError(
        'The option-group identifier resolves to no option group, and the legacy member calls ' +
          'getOptions() on the result of that lookup without a guard.',
        {
          context: {
            productID: product.productID,
            optionGroupID,
            locator: 'model/service/ProductService.cfc:L115',
          },
        },
      );
    }

    const options: Option[] = optionGroup.getOptions();

    /*
     * `:L117-L121` — the arity gate and the loop. Capturing the first element is the `arrayLen(options)`
     * guard: under `noUncheckedIndexedAccess` the narrowing and the guard are the same statement.
     *
     * TODO(parity) D14 — one option, the first, onto every existing SKU. See the block above.
     */
    const firstOption = options[0];
    if (firstOption !== undefined) {
      for (const sku of skus) {
        sku.addOption(firstOption);
      }
    }

    /*
     * — the write for the mutations above is performed by the member this line delegates to, and
     * that is the faithful place for it. {@link ProductService.processProductUpdateDefaultImageFileNames}
     * walks the product's SKU collection, applies its own change, and then persists every row — so the
     * mutations made above are still pending on those same entities and travel out in the same statement.
     * One write per row, carrying every accumulated change, is precisely what the single legacy
     * request-end flush produced; persisting here as well would emit two statements per row for one
     * logical change. If that delegation is ever removed, this member must write for itself — the
     * mutations above are otherwise discarded in silence, with the member still answering successfully.
     */
    /* `:L123` — formerly `this.processProduct(product, {}, 'updateDefaultImageFileNames')`. */
    return this.processProductUpdateDefaultImageFileNames(product);
  }

  /* Declared member 5 of 15 — `model/service/ProductService.cfc:L128` */

  /**
   * Adds one option to a product by regenerating its SKU combinations.
   *
   * @param product - The product being processed.
   * @param processObject - Carries the identifier of the option to add.
   * @returns The same product, as `:L154` does.
   * @throws {DomainError} at each point the legacy dereferences a lookup result or a relationship
   * without a guard.
   */
  public async processProductAddOption(
    product: Product,
    processObject: ProductAddOption,
  ): Promise<Product> {
    await this.runProcessValidation(product, 'addOption');
    if (product.hasErrors()) {
      return product;
    }

    /* `:L130` — the lookup, and `:L131` reads straight off its result. */
    const optionID = processObject.option;
    if (optionID === undefined) {
      throw new DomainError(
        'The addOption process object carries no option identifier, and the legacy member passes it ' +
          'to the lookup without a guard.',
        {
          context: {
            productID: product.productID,
            locator: 'model/service/ProductService.cfc:L130',
          },
        },
      );
    }

    const newOption = await this.optionService.getOption(optionID);
    if (newOption === null) {
      throw new DomainError(
        'The option identifier resolves to no option, and the legacy member reads getOptionID() off ' +
          'the result of that lookup without a guard.',
        {
          context: {
            productID: product.productID,
            optionID,
            locator: 'model/service/ProductService.cfc:L130',
          },
        },
      );
    }

    const newOptionGroupID = this.requireOptionGroupID(
      newOption,
      'model/service/ProductService.cfc:L144',
    );

    /*
     * `:L132` and `:L135-L137` — both read the default SKU, which `:L132` dereferences unguarded.
     */
    const defaultSku = this.requireDefaultSku(product, 'model/service/ProductService.cfc:L132');
    const defaultSkuPrice = defaultSku.getPrice();
    const defaultSkuListPrice = defaultSku.getListPrice();

    /*
     * `:L131` — the option list starts as the new option's identifier alone. Held as an array while it
     * is walked, and rendered back to a CFML list once, at the end.
     */
    const selectedOptionIds: string[] = [newOption.optionID];
    const selectedOptionIdsFolded = new Set<string>([newOption.optionID.toLowerCase()]);

    /*
     * `:L140-L148` — the nested walk. The collection is read once: nothing in either loop body mutates
     * the product's SKU collection or any SKU's option collection, so a single read is observationally
     * identical to the legacy's re-read on every iteration, and the iteration order is unchanged.
     */
    const existingSkus: Sku[] = readProductSkusAsSkus(
      product,
      'model/service/ProductService.cfc:L140',
    );

    for (const existingSku of existingSkus) {
      for (const existingOption of existingSku.getOptions()) {
        const existingOptionGroupID = this.requireOptionGroupID(
          existingOption,
          'model/service/ProductService.cfc:L144',
        );

        /*
         * `:L144` — CFML's `!=` on strings is case-insensitive, and so is `listFindNoCase`. Comparison
         * folds case; the value appended at `:L145` keeps its original spelling.
         */
        const differentGroup =
          existingOptionGroupID.toLowerCase() !== newOptionGroupID.toLowerCase();
        const alreadyListed = selectedOptionIdsFolded.has(existingOption.optionID.toLowerCase());

        if (differentGroup && !alreadyListed) {
          selectedOptionIds.push(existingOption.optionID);
          selectedOptionIdsFolded.add(existingOption.optionID.toLowerCase());
        }
      }
    }

    const newOptionsData: Record<string, unknown> = {
      [OPTIONS_DATA_KEY]: selectedOptionIds.join(CFML_LIST_DELIMITER),
      ...(defaultSkuPrice === undefined ? {} : { [PRICE_DATA_KEY]: defaultSkuPrice }),
      ...(defaultSkuListPrice === undefined ? {} : { [LIST_PRICE_DATA_KEY]: defaultSkuListPrice }),
    };

    /* `:L150` — re-entered on a product that already has SKUs; see the block above. */
    await this.skuService.createSkus(product, newOptionsData);

    /* `:L152` — formerly `this.processProduct(product, {}, 'updateDefaultImageFileNames')`. */
    return this.processProductUpdateDefaultImageFileNames(product);
  }

  /**
   * Reads an option's option-group identifier, raising where the legacy dereferences it unguarded.
   */
  private requireOptionGroupID(option: Option, locator: string): string {
    const optionGroup = option.optionGroup;
    if (optionGroup === undefined) {
      throw new DomainError(
        'An option has no option group, and the legacy member reads getOptionGroupID() off that ' +
          'relationship without a guard.',
        { context: { optionID: option.optionID, locator } },
      );
    }

    return optionGroup.optionGroupID;
  }

  /* Declared member 6 of 15 — `model/service/ProductService.cfc:L157` */

  /**
   * Approves or holds a new product review, and attributes it to the signed-in account.
   *
   * @param product - The product being reviewed. Returned unchanged in every path.
   * @param processObject - The `addProductReview` process object, narrowed structurally.
   * @returns The same product, as `:L170` does.
   * @throws {DomainError} when the process object does not expose `getNewProductReview`.
   */
  public processProductAddProductReview(
    product: Product,
    processObject: unknown,
  ): Promise<Product> {
    /*
     * `:L112` — the invocation gate, reproduced without the retired dispatcher. No rule set exists for
     * this context, so there is nothing to validate against; a product that already carries findings is
     * still left untouched.
     */
    if (product.hasErrors()) {
      return Promise.resolve(product);
    }

    if (!isProductReviewProcessObject(processObject)) {
      return Promise.reject(
        new DomainError(
          'The addProductReview process object does not expose getNewProductReview, which the legacy ' +
            'member calls without a guard. ProductReview is out of scope (AAP §0.2.2.4), so no ' +
            'process-object type is declared here and the shape is checked structurally.',
          {
            context: {
              productID: product.productID,
              locator: 'model/service/ProductService.cfc:L157-L171',
            },
          },
        ),
      );
    }

    /* `:L159` — read through the product, not through the global scope. */
    const autoApproveSetting = this.settings.setting('productAutoApproveReviewsFlag', {
      entityName: 'Product',
      entityId: product.productID,
    });
    if (!readsAsCfmlBoolean(autoApproveSetting)) {
      return Promise.reject(
        new DomainError(
          'The productAutoApproveReviewsFlag setting cannot be evaluated as a CFML boolean, and the ' +
            'legacy member places it directly in an if condition, which raises for exactly these ' +
            'values.',
          {
            context: {
              settingName: 'productAutoApproveReviewsFlag',
              productID: product.productID,
              locator: 'model/service/ProductService.cfc:L159',
            },
          },
        ),
      );
    }
    const autoApprove: boolean = toCfmlBoolean(autoApproveSetting);

    /* `:L160` / `:L162` — the literal 1 and 0, both branches explicit. */
    if (autoApprove) {
      processObject.getNewProductReview().setActiveFlag(REVIEW_ACTIVE_FLAG_APPROVED);
    } else {
      processObject.getNewProductReview().setActiveFlag(REVIEW_ACTIVE_FLAG_PENDING);
    }

    /* `:L166-L168` — see the signed-in-predicate note above. */
    const currentAccount = this.accountContext.getCurrentAccount();
    if (currentAccount !== undefined && !currentAccount.newFlag) {
      processObject.getNewProductReview().setAccount(currentAccount);
    }

    return Promise.resolve(product);
  }

  /* Declared member 7 of 15 — `model/service/ProductService.cfc:L173` */

  /**
   * Adds a subscription-term SKU to a product.
   *
   * TODO(parity) D6 — `model/service/ProductService.cfc:L173-L196`, at `:L180-L182`
   * The guard and the assignment read different objects:
   *
   * `:L180` `if( arguments.processObject.getListPrice() != "" && isNumeric( … ) )`
   * `:L181` `newSku.setListPrice( arguments.data.listPrice );`
   *
   * @param product - The product gaining a subscription SKU.
   * @param processObject - The `addSubscriptionTerm` process object, narrowed structurally.
   * @returns The same product, as `:L195` does.
   * @throws {DomainError} when the process object lacks an observed member, when the term identifier
   * resolves to no term, or when the product has no default SKU.
   */
  public async processProductAddSubscriptionTerm(
    product: Product,
    processObject: unknown,
  ): Promise<Product> {
    await this.runProcessValidation(product, 'addSubscriptionTerm');
    if (product.hasErrors()) {
      return product;
    }

    if (!isSubscriptionTermProcessObject(processObject)) {
      throw new DomainError(
        'The addSubscriptionTerm process object does not expose the members the legacy member calls. ' +
          'The subscription domain is out of scope (AAP §0.2.2.1), so the shape is checked ' +
          'structurally rather than typed.',
        {
          context: {
            productID: product.productID,
            locator: 'model/service/ProductService.cfc:L173-L196',
          },
        },
      );
    }

    /*
     * `:L175` — resolved through the port; the legacy chains no guard, and `:L184` would pass the null
     * straight into the relationship.
     */
    const subscriptionTermID = processObject.getSubscriptionTermID();
    const newSubscriptionTerm =
      await this.subscriptionTermPort.getSubscriptionTerm(subscriptionTermID);
    if (newSubscriptionTerm === null) {
      throw new DomainError(
        'The subscription-term identifier resolves to no term, and the legacy member assigns the ' +
          'lookup result to the SKU relationship without a guard.',
        {
          context: {
            productID: product.productID,
            subscriptionTermID,
            locator: 'model/service/ProductService.cfc:L175',
          },
        },
      );
    }

    /* `:L176` — the explicitly declared synthesized member on the sibling service. */
    const newSku = this.skuService.newSku();

    /* `:L178` / `:L179` — both unguarded, both coerced the way the sibling coerces. */
    newSku.price = toExactDecimal(processObject.getPrice());
    newSku.renewalPrice = toExactDecimal(processObject.getRenewalPrice());

    /* `:L180` — the guard, reproduced exactly: non-empty and numeric. */
    const listPriceCandidate = processObject.getListPrice();
    if (readsAsNonEmptyCfmlText(listPriceCandidate) && readsAsCfmlNumeric(listPriceCandidate)) {
      /*
       * TODO(parity) D6 — `:L181` assigns from `arguments.data.listPrice`, and no `data` argument
       * exists. See the block above for why this raises instead of being redirected or skipped.
       */
      /*
       * `DomainError`, not `LegacyParityError`. this text is a port-authored diagnostic naming an
       * internal member, an argument path and a defect identifier, so it must not cross the response
       * boundary; the parity subclass would have published it verbatim. See preserved, not repaired.
       */
      throw new DomainError(
        'The legacy member guards on the process object but assigns from arguments.data.listPrice, ' +
          'and its signature declares no data argument, so the assignment cannot be performed. ' +
          'Carried unrepaired as defect D6.',
        {
          context: {
            productID: product.productID,
            defect: 'D6',
            locator: 'model/service/ProductService.cfc:L180-L182',
            guardedOn: 'processObject.getListPrice()',
            assignedFrom: 'arguments.data.listPrice',
          },
        },
      );
    }

    /*
     * `:L183` — `getProductCode() & "-#arrayLen(getSkus()) + 1#"`. The count is taken here, before the
     * product is attached at `:L191`, so it excludes this SKU.
     */
    const existingSkuCount = product.getSkus().length;
    newSku.skuCode = `${product.productCode ?? ''}${SKU_CODE_SEGMENT_DELIMITER}${String(
      existingSkuCount + 1,
    )}`;

    /* `:L184`. */
    newSku.setSubscriptionTerm(newSubscriptionTerm);

    /*
     * `:L185-L190` — copied from the default SKU's collections, not from the process object. The legacy
     * re-evaluates the collection on every iteration of each loop; neither body mutates the default
     * SKU, so a single read yields the same members in the same order.
     */
    const defaultSku = this.requireDefaultSkuEntity(
      product,
      'model/service/ProductService.cfc:L185',
    );

    for (const subscriptionBenefit of defaultSku.subscriptionBenefits) {
      newSku.addSubscriptionBenefit(subscriptionBenefit);
    }

    for (const renewalSubscriptionBenefit of defaultSku.renewalSubscriptionBenefits) {
      newSku.addRenewalSubscriptionBenefit(renewalSubscriptionBenefit);
    }

    /* `:L191`. */
    newSku.setProduct(product);

    /*
     * — the new SKU is written by the member this line delegates to, and it reaches it because
     * `:L191` put it there. `Sku.setProduct` assigns the association and appends the SKU to the product's
     * live collection [`model/entity/Sku.cfc:L605-L608`], so by the time
     * {@link ProductService.processProductUpdateDefaultImageFileNames} reads that collection the new SKU
     * is a member of it and is persisted along with its siblings — one INSERT carrying the price, the
     * renewal price, the composed SKU code and the `subscriptionTermID` foreign key together. That is the
     * single legacy flush reproduced, not an accident of ordering, and it is why no write is issued here.
     */

    /* `:L193` — formerly `this.processProduct(product, {}, 'updateDefaultImageFileNames')`. */
    return this.processProductUpdateDefaultImageFileNames(product);
  }

  /* Declared member 8 of 15 — `model/service/ProductService.cfc:L198` */

  /**
   * Deletes a product's default image file.
   *
   * TODO(parity) — an unnumbered scoping defect of D10's class makes the body unreachable in the legacy too
   * `:L199` tests `structKeyExists(arguments.data, "imageFile")` — correctly scoped. `:L200` and `:L201`
   * then interpolate `#imageFile#`, an unscoped reference, not `arguments.data.imageFile`. Nothing in
   * the component declares `imageFile`, so the moment the key is present the path composition raises an
   * undefined-variable error. The member only "works" when there is nothing to delete.
   *
   * @param product - The product whose image is being removed. Returned in the no-op path.
   * @param data - The request payload; only the `imageFile` key is read, and only for its presence.
   * @returns The same product, as `:L205` does, when no image file was named.
   * @throws {NotImplementedError} when an image file is named, because the legacy path both requires
   * filesystem access this layer may not perform and fails on an unscoped variable before reaching it.
   */
  public processProductDeleteDefaultImage(
    product: Product,
    data: Record<string, unknown>,
  ): Promise<Product> {
    /* `:L112`. */
    if (product.hasErrors()) {
      return Promise.resolve(product);
    }

    /* `:L199` — the correctly scoped presence test. Absent means no-op, exactly as written. */
    if (!dataKeyExists(data, IMAGE_FILE_DATA_KEY)) {
      return Promise.resolve(product);
    }

    /* `:L200` — read through the global scope, before the composition that fails. */
    const imageFolderPath = this.settings.setting('globalAssetsImageFolderPath');

    return Promise.reject(
      new NotImplementedError(
        'ProductService.processProductDeleteDefaultImage',
        'the legacy path performs filesystem I/O, which this layer may not reach (TR-5), and it ' +
          'interpolates an unscoped imageFile rather than data.imageFile, so it raises in the legacy ' +
          'too the moment the key is present — carried unrepaired',
        {
          context: {
            productID: product.productID,
            locator: 'model/service/ProductService.cfc:L198-L206',
            unscopedReference: 'imageFile',
            resolvedDirectory: `${imageFolderPath}${PRODUCT_DEFAULT_IMAGE_PATH_SEGMENT}`,
            defectClass: 'D10-class, unnumbered (AAP §0.6.7.5)',
          },
        },
      ),
    );
  }

  /* Declared member 9 of 15 — `model/service/ProductService.cfc:L208` */

  /**
   * Regenerates the image file name of every SKU on a product.
   *
   * @param product - The product whose SKUs are renamed in place.
   * @returns The same product, as `:L213` does.
   * @throws {DomainError} when a SKU collection member is not a SKU entity, or — propagated from the
   * generator — when a SKU has no product or a contributing option carries no option group.
   */
  public async processProductUpdateDefaultImageFileNames(product: Product): Promise<Product> {
    /*
     * `org/Hibachi/HibachiService.cfc:L112` — the invocation gate, all that survives of the pipeline
     * for a context with no rule set.
     */
    if (product.hasErrors()) {
      return product;
    }

    /* `:L209-L211`. */
    const skus: Sku[] = readProductSkusAsSkus(product, 'model/service/ProductService.cfc:L209');
    for (const sku of skus) {
      sku.imageFile = sku.generateImageFileName(this.settings);
    }

    /*
     * — the write, and it is not optional. `SwSku.imageFile` is a persistent column
     * [`model/entity/Sku.cfc:L58`]. Under CFML, assigning it in memory and returning was complete:
     * Hibernate tracked the entity as dirty and the request-end flush wrote it. There is no session and
     * no flush here (mismatch M5), so a mutation that is not written is simply lost — and because the
     * member answers with the product either way, every caller above would report success while `SwSku`
     * stayed unchanged.
     */
    for (const sku of skus) {
      await this.skuRepository.persistSku(sku);
    }

    return product;
  }

  /* Declared member 10 of 15 — `model/service/ProductService.cfc:L216` */

  /**
   * Applies a price and/or a list price to every SKU of a product.
   *
   * TODO(parity) — unnumbered, of the same scoping class as D10: `:L220` declares its loop counter `i` without `var`, leaking it into the
   * component's shared scope. Block scoping removes the hazard; recorded as a translation decision.
   *
   * @param product - The product whose SKUs are repriced.
   * @param processObject - Carries the two flags and the two prices.
   * @returns The same product, as `:L232` does.
   * @throws {DomainError} when a SKU collection member is not a SKU entity.
   */
  public async processProductUpdateSkus(
    product: Product,
    processObject: ProductUpdateSkus,
  ): Promise<Product> {
    await this.runProcessValidation(product, 'updateSkus', {
      subject: buildProductUpdateSkusValidationSubject(processObject),
      ruleSet: productUpdateSkusValidationRuleSet,
    });
    if (product.hasErrors()) {
      return product;
    }

    /* `:L218`. */
    const skus: Sku[] = readProductSkusAsSkus(product, 'model/service/ProductService.cfc:L218');

    /* `:L219` — reproduced although a `for…of` makes it redundant. */
    if (skus.length > 0) {
      for (const sku of skus) {
        /* `:L222-L224` — CFML boolean evaluation, not JavaScript truthiness. */
        if (this.readProcessFlag(processObject.updatePriceFlag, 'updatePriceFlag', ':L222')) {
          sku.price = toExactDecimal(processObject.price);
        }

        /* `:L226-L228`. */
        if (
          this.readProcessFlag(processObject.updateListPriceFlag, 'updateListPriceFlag', ':L226')
        ) {
          sku.listPrice = toExactDecimal(processObject.listPrice);
        }
      }

      /*
       * — the write. A bulk reprice that changed nothing in the database.
       * `SwSku.price` and `SwSku.listPrice` are persistent columns [`model/entity/Sku.cfc:L56-L57`], and
       * until this loop existed the member assigned them in memory and returned the product, so a
       * repricing request answered successfully while every row kept its old price. Hibernate's dirty
       * tracking and request-end flush made the legacy correct without an explicit write; there is no
       * session and no flush here (mismatch M5).
       */
      for (const sku of skus) {
        await this.skuRepository.persistSku(sku);
      }
    }

    return product;
  }

  /* Declared member 11 of 15 — `model/service/ProductService.cfc:L235` */

  /**
   * Uploads a product's default image.
   *
   * TODO(parity) — unnumbered, of the same scoping class as D10: `:L253` references `processObject` unscoped inside the catch block, where
   * every other line in the member uses `arguments.processObject`. In CFML this happens to resolve
   * because the unscoped name falls through to the arguments scope, so it works by accident rather than
   * by intent. The typed parameter is used here, and the deliberate correction is recorded without
   * minting a new defect number.
   *
   * @param product - The product whose default image is being replaced.
   * @param processObject - The `uploadDefaultImage` process object, narrowed structurally.
   * @returns The same product, as `:L256` does — with the upload failure recorded on the process object
   * rather than raised, which is precisely what `:L252-L254` does.
   */
  public processProductUploadDefaultImage(
    product: Product,
    processObject: unknown,
  ): Promise<Product> {
    /* `:L112`. */
    if (product.hasErrors()) {
      return Promise.resolve(product);
    }

    if (!isUploadDefaultImageProcessObject(processObject)) {
      return Promise.reject(
        new DomainError(
          'The uploadDefaultImage process object does not expose the members the legacy member calls, ' +
            'so there is no object on which to record the fileUpload finding.',
          {
            context: {
              productID: product.productID,
              locator: 'model/service/ProductService.cfc:L235-L257',
            },
          },
        ),
      );
    }

    /* `:L240` — the global setting, and the suffix without a trailing slash. */
    const uploadDirectory = `${this.settings.setting(
      'globalAssetsImageFolderPath',
    )}${PRODUCT_DEFAULT_IMAGE_UPLOAD_DIRECTORY_SEGMENT}`;

    /* `:L241`. */
    const fullFilePath = `${uploadDirectory}${IMAGE_PATH_SEPARATOR}${processObject.getImageFile()}`;

    /* `:L249` — the accepted MIME types, under the legacy attribute spelling. */
    const acceptedMimeTypes =
      processObject.getPropertyMetaData(UPLOAD_FILE_PROPERTY_NAME).hb_fileAcceptMIMEType;

    /*
     * `:L244-L250` cannot be performed here; see the block above. `:L252-L254` is what the legacy does
     * when they fail, and it is what is done — the finding is recorded, not raised. The composed path
     * and mime types are read first so the pre-state matches the source exactly.
     */
    void fullFilePath;
    void acceptedMimeTypes;

    processObject.addError(IMAGE_FILE_DATA_KEY, FILE_UPLOAD_RBKEY);

    /* `:L256`. */
    return Promise.resolve(product);
  }

  /**
   * Evaluates one of the two `Product_UpdateSkus` flags the way CFML evaluates an `if` condition.
   */
  private readProcessFlag(value: unknown, flagName: string, locator: string): boolean {
    if (!readsAsCfmlBoolean(value)) {
      throw new DomainError(
        'The update flag cannot be evaluated as a CFML boolean, and the legacy member places it ' +
          'directly in an if condition, which raises for exactly these values.',
        {
          context: {
            flagName,
            locator: `model/service/ProductService.cfc${locator}`,
          },
        },
      );
    }

    return toCfmlBoolean(value);
  }

  /** Resolves a product's default SKU as the SKU entity, which the delegate in that slot is not. */
  private requireDefaultSkuEntity(product: Product, locator: string): Sku {
    const defaultSkuDelegate = this.requireDefaultSku(product, locator);
    const defaultSkuID = this.defaultSkuIdReader(defaultSkuDelegate);

    const skus: Sku[] = readProductSkusAsSkus(product, locator);
    const defaultSku = skus.find((sku) => sku.skuID === defaultSkuID);

    if (defaultSku === undefined) {
      throw new DomainError(
        "The product's default SKU is not present among its own SKUs, so the entity behind the " +
          'default-SKU delegate cannot be resolved and its subscription-benefit collections cannot ' +
          'be read.',
        { context: { productID: product.productID, defaultSkuID, locator } },
      );
    }

    return defaultSku;
  }

  /* Declared member 12 of 15 — `model/service/ProductService.cfc:L264` */

  /**
   * Saves a product, creating its SKUs on first save.
   *
   * @param product - The product to save. Mutated in place and also returned.
   * @param data - The request payload, used for population and forwarded to SKU creation.
   * @returns The saved product when it validated, or the same product carrying findings when it did not.
   * `:L291` returns the product either way, so this member does not throw on validation failure —
   * unlike `../services/baseService.save`, whose contract does.
   */
  public async saveProduct(product: Product, data: Record<string, unknown>): Promise<Product> {
    /*
     * Step 1 — `:L266`.
     *
     * Translation decision: the legacy entity service could synchronously resolve a relationship from
     * inside `populate`; the SQL boundary cannot. The repositories are asynchronous but the declared
     * population engine is intentionally synchronous, so every asynchronous read happens first and
     * `populate` itself keeps the legacy synchronous `loadExisting` / `loadOrCreate` contract.
     *
     * The two steps are distinct and both are required. `prepareProductPopulation` primes the
     * invocation-scoped relationship cache — authorization-gated, so a caller denied permission to
     * write a property gains no existence probe as a side effect, and awaited one relationship at a
     * time in declaration order rather than behind `Promise.all` — without warm-container bleed.
     * `resolveProductPropertyDescriptors` then yields the descriptor set whose cache-backed loaders
     * that priming pass filled; its default returns {@link productPropertyDescriptors}, and the seam
     * stays published so a caller or test can substitute a narrower resolver. The target is still
     * mutated exactly once by the unchanged population pass below, and this public signature is
     * unchanged.
     */
    await this.prepareProductPopulation(data);

    const propertyDescriptors = await this.resolveProductPropertyDescriptors(data);
    /*
     * `populateWithSubProperties` rather than `populate`, because the record it returns is half the
     * legacy contract and discarding it was a defect: `org/Hibachi/HibachiTransient.cfc:L248` and
     * `:L305` record every related entity a nested struct populated, and the framework then validates
     * (`:L407-L450`) and saves (`org/Hibachi/HibachiDAO.cfc:L48-L67`) each one. Without those two passes
     * a nested `{"brandID":"…","brandName":"new name"}` was populated in memory and never written, and a
     * nested struct naming no existing row left the parent holding an unpersisted related entity whose
     * blank key was then stored as a foreign key. Both passes are applied below.
     */
    /*
     * The unrepresentable-value collector, shared by both population passes below.
     *
     * Without it, population raises where it assigns — ahead of the validation pass — so a payload of
     * `{"price":"abc"}` answered a service fault where the legacy answered
     * `validate.save.Product.price.dataType.numeric`. CFML assigned the value
     * [org/Hibachi/HibachiTransient.cfc:L207] and the type failure surfaced at the ORM FLUSH, which is
     * after `validate()` — so a property with a declared rule never reached it, and a property without one
     * failed there. Step 3 feeds a collected value to the rule that covers it; step 4e re-raises for the
     * rest, at the flush point. Insertion order is preserved by `Map`, so the first failure is reported
     * first, as the declaration-order loop encountered it.
     */
    const unrepresentableValues = new Map<string, UnrepresentableValueFailure>();
    const populateOptions = {
      onUnrepresentableValue: (failure: UnrepresentableValueFailure): void => {
        if (!unrepresentableValues.has(failure.propertyName)) {
          unrepresentableValues.set(failure.propertyName, failure);
        }
      },
    };

    const { populatedSubProperties } = populateWithSubProperties(
      product,
      data,
      propertyDescriptors,
      this.populationAuthorization,
      populateOptions,
    );

    /*
     * A substituted descriptor resolver may return the persistent-only set, which excludes `price`;
     * see the declaration above for why this second pass is both required and narrower than widening
     * Product's database schema. It is idempotent when the resolved set already carries the slot.
     */
    populate(
      product,
      data,
      PRODUCT_SAVE_TRANSIENT_PROPERTY_DESCRIPTORS,
      this.populationAuthorization,
      populateOptions,
    );

    /* Step 2 — `:L268-L270`. Null only; `getTitle()`, not the product name; set on the entity. */
    if (product.urlTitle === undefined) {
      product.urlTitle = await this.createUniqueProductUrlTitle(product.getTitle(this.settings));
    }

    /*
     * Step 3 — `:L273`. `price` is non-persistent on the product and delegates to the default SKU, so
     * the delegating accessor is what the required-and-numeric rule must see; the rule set's own
     * boundary note assigns that resolution to whoever assembles the subject, which is this member.
     */
    /*
     * The `price` the rule sees is the collected raw value when population could not represent it, and the
     * delegating accessor otherwise. This is the whole of the relocation: `required` and
     * `dataType="numeric"` are declared on the same property [model/validation/Product.json:L8], so
     * handing them the text the caller sent produces the legacy's own key rather than a service fault,
     * and handing them the accessor's value on every other path leaves this rule exactly as it was.
     */
    const unrepresentablePrice = unrepresentableValues.get(PRICE_DATA_KEY);
    const priceForValidation: ExactDecimal | string | undefined =
      unrepresentablePrice === undefined
        ? product.getPrice()
        : renderUnrepresentableValue(unrepresentablePrice.rawValue);

    const errors = await this.validator.validate(
      buildProductValidationSubject(product, { price: priceForValidation }),
      productValidationRuleSet,
      'save',
    );
    product.addErrors(errors.getErrors());

    /*
     * Step 3b — the second half of `org/Hibachi/HibachiTransient.cfc:L409-L450`: the parent's validation
     * does not end with its own rule set. Every related entity a nested struct populated is validated in
     * turn, and one carrying findings is reported against the parent under the `populate` key. It runs
     * here, between the parent's own validation and the `hasErrors` gate below, because that is where the
     * legacy runs it — inside `validate()`, which `:L273` calls — and because everything after this line
     * is gated on the verdict. `createSkus` in particular reads
     * `product.getProductType().getBaseProductType()`, so a product type that fails its own rules is
     * refused here rather than dereferenced there.
     */
    await this.applyPopulatedSubPropertyValidation(product, populatedSubProperties);

    /*
     * `isNew()` is read once, here, and never again in this member. The mint below invalidates it; see
     * the identifier note in the doc block for why re-reading it would skip SKU creation entirely.
     */
    const productIsNew = product.isNew();

    /*
     * Step 3c — `org/Hibachi/HibachiDAO.cfc:L52-L64`'s "Digg Deeper", hoisted above the parent's own
     * write rather than placed after it. The legacy could save the parent first because Hibernate ordered
     * the resulting inserts by dependency at flush; a parameterised statement has no such ordering, and
     * `MySqlProductPersistence.collectProductValues` reads `brand.brandID` / `productType.productTypeID`
     * straight off the associations. A related entity that this request created therefore has to hold its
     * minted 32-character identifier (IR-6) before the product row is composed, or the foreign key stores
     * whatever the unsaved entity carried. Gated on the same verdict as every other write in this member,
     * so a refused save writes nothing at all.
     */
    if (!product.hasErrors()) {
      await this.applyPopulatedSubPropertyPersistence(populatedSubProperties, 'beforeParent');
    }

    /*
     * Step 4 — `:L276-L283`. Both conjuncts, in the legacy's order, and the first one reads the local
     * captured above rather than re-asking the entity. `Product.isNew()` tests `productID === ''`, and
     * step 4a mints that identifier — so re-reading it here would be correct only for as long as 4a
     * stays inside the block. The local is immune to that ordering, which is the whole reason it exists;
     * The account is on the mint note above. Today the two readings agree, because nothing has minted
     * yet when this line runs.
     */
    if (productIsNew && !product.hasErrors()) {
      /*
       * Step 4a. The parent row, so `SwSku.productID` has something to reference and so the
       * product carries the identifier the SKU rows bind. Absent from the legacy statement order because
       * Hibernate's flush emitted it implicitly; see the write-order note above.
       */
      product = await this.persistProduct(product);

      /* Step 4b — `:L279`. */
      await this.skuService.createSkus(product, data);

      /*
       * Step 4c — `:L282`, formerly `this.processProduct(product, {}, 'updateDefaultImageFileNames')`.
       */
      product = await this.processProductUpdateDefaultImageFileNames(product);
    }

    /*
     * Step 4d — the other half of step 3c's cascade. A populated `defaultSku` or `skus` member carries
     * `SwSku.productID`, so its row cannot be written until the product's own identifier exists: for a
     * new product that is step 4a above, and for an existing one it was a previous request. Both arms
     * arrive here with a persisted parent, which is why one call serves both.
     */
    if (!product.hasErrors()) {
      await this.applyPopulatedSubPropertyPersistence(populatedSubProperties, 'afterParent');
    }

    /*
     * Step 4e — the FLUSH POINT, and the other half of the relocation above. A collected value that no
     * declared rule covered reached the ORM in the legacy and failed there; nothing in
     * `model/validation/Product.json` covers `activeFlag`, `publishedFlag` or `sortOrder`, so
     * `{"activeFlag":"abc"}` still fails, still as a service fault, and still without writing a row. The
     * gate matters as much as the raise: when validation already refused the save there is no flush to
     * fail at, so a keyed 400 wins over this fault exactly as it did in CFML.
     */
    if (!product.hasErrors()) {
      const uncovered = readFirstUnreportedUnrepresentableValue(unrepresentableValues, product);
      if (uncovered !== undefined) {
        throw unrepresentableValueError(uncovered);
      }
    }

    /*
     * Step 5 — `:L286-L288`. Re-read, because step 4 can record findings on the product. For a product
     * that came through step 4a this is the UPDATE that writes `defaultSkuID`; for an existing product it
     * is the only write.
     */
    if (!product.hasErrors()) {
      product = await this.persistProduct(product);
    }

    /* `:L291`. */
    return product;
  }

  /**
   * Validates every related entity a nested payload struct populated, reporting a failing one against
   * the product under the legacy `populate` key.
   *
   * The port of `org/Hibachi/HibachiTransient.cfc:L412-L450`. Three details of that block are carried
   * deliberately:
   *
   * - the error is recorded on the **parent**, keyed `populate`, with the **property name** as the
   * message [`:L436`, `:L448`] — not on the related entity, and not as a resource-bundle key;
   * - an array-valued member reports once per failing element [`:L429-L437`], so two failing SKUs in one
   * `skus` payload produce two entries under the same key, exactly as the legacy loop does;
   * - the context is the parent's own, because
   * `HibachiValidationService.getPopulatedPropertyValidationContext` [`:L133-L151`] falls through to
   * `originalContext` for every in-scope entity — none of the seven catalog validation documents
   * declares a `populatedPropertyValidation` section.
   *
   * A relationship with no writer is **refused** rather than silently dropped, which is the one place
   * this pass departs from the legacy block, and the departure is a declared boundary rather than a
   * choice: `relatedProducts` is the only such relationship, and validating a related Product under the
   * `save` context reads `price` [model/validation/Product.json:L8], which resolves through the related
   * product's `defaultSku` — a reference the read path mints unresolved, whose members refuse by
   * construction. Refusing the sub-property write names the property to the caller instead of writing an
   * unvalidated row or discarding the input. A single-key `relatedProducts` item is unaffected: it
   * records no populated sub-property at all, and its link row is written by
   * `MySqlProductPersistence.saveProduct`.
   *
   * @param product - The parent product, which receives any findings.
   * @param populatedSubProperties - What population recorded, keyed by Product property name.
   */
  private async applyPopulatedSubPropertyValidation(
    product: Product,
    populatedSubProperties: PopulatedSubPropertyRecord<ProductPropertyName>,
  ): Promise<void> {
    for (const [propertyName, populated] of Object.entries(populatedSubProperties)) {
      if (populated === undefined) {
        continue;
      }

      const writer = this.resolvePopulatedSubPropertyWriter(propertyName);
      if (writer === undefined) {
        product.addError(POPULATED_SUB_PROPERTY_ERROR_KEY, propertyName);
        continue;
      }

      for (const relatedEntity of readPopulatedSubPropertyEntities(populated)) {
        const hasFindings = await writer.validate(relatedEntity);
        if (hasFindings) {
          product.addError(POPULATED_SUB_PROPERTY_ERROR_KEY, propertyName);
        }
      }
    }
  }

  /**
   * Persists the populated related entities belonging to one write phase.
   *
   * The port of `org/Hibachi/HibachiDAO.cfc:L52-L64`'s recursive descent, split across the parent's own
   * write by {@link PopulatedSubPropertyWritePhase}. A relationship with no writer is skipped here
   * because {@link ProductService.applyPopulatedSubPropertyValidation} has already refused it, so this
   * member is never reached with findings outstanding.
   *
   * @param populatedSubProperties - What population recorded, keyed by Product property name.
   * @param writePhase - Which side of the parent's row to write.
   */
  private async applyPopulatedSubPropertyPersistence(
    populatedSubProperties: PopulatedSubPropertyRecord<ProductPropertyName>,
    writePhase: PopulatedSubPropertyWritePhase,
  ): Promise<void> {
    for (const [propertyName, populated] of Object.entries(populatedSubProperties)) {
      if (populated === undefined) {
        continue;
      }

      const writer = this.resolvePopulatedSubPropertyWriter(propertyName);
      if (writer === undefined || writer.writePhase !== writePhase) {
        continue;
      }

      for (const relatedEntity of readPopulatedSubPropertyEntities(populated)) {
        await writer.persist(relatedEntity);
      }
    }
  }

  /**
   * Resolves the writer for one Product property name.
   *
   * The scan is written out rather than expressed as an index read: `populatedSubPropertyWriters` is a
   * partial record keyed by the declared property-name union, and indexing it with the `string` that
   * `object.entries` yields would need a type assertion this port does not use. It runs over at most the
   * five relationships the coordinator wires.
   *
   * @param propertyName - The property name population recorded the entity under.
   * @returns The writer, or `undefined` when this relationship has none.
   */
  private resolvePopulatedSubPropertyWriter(
    propertyName: string,
  ): PopulatedSubPropertyWriter | undefined {
    for (const [writerPropertyName, writer] of Object.entries(this.populatedSubPropertyWriters)) {
      if (writerPropertyName === propertyName) {
        return writer;
      }
    }

    return undefined;
  }

  /* Declared member 13 of 15 — `model/service/ProductService.cfc:L294` */

  /**
   * Saves a product type, deriving its URL title and inheriting its parent's products.
   *
   * @param productType - The product type to save.
   * @param data - The request payload. Mutated by design: `urlTitle` may be written into it.
   * @returns The saved product type — the same instance that was passed in, carrying its own error bag,
   * exactly as `:L310` returns `arguments.productType` on every path. A caller decides whether the
   * save succeeded by asking `hasErrors`, which is what `:L306` itself does.
   */
  public async saveProductType(
    productType: ProductType,
    data: Record<string, unknown>,
  ): Promise<ProductTypeWithErrorState> {
    /*
     * The error surface is composed first, before anything can fail, so there is exactly one bag for the
     * whole method and the instance the caller holds is the instance that carries it. `manageEntity`
     * mutates and returns its argument, so `managedProductType` and `productType` are the same object —
     * which is what makes `:L310`'s "return the argument" faithful rather than approximate.
     */
    const managedProductType: ProductTypeWithErrorState = manageEntity(
      productType,
      PRODUCT_TYPE_ENTITY_METADATA,
    );

    /* `:L295` — entity null or empty, and payload absent or empty. */
    const entityUrlTitleUnusable = !hasEntityText(managedProductType.urlTitle);
    const payloadUrlTitleUnusable = dataValueLength(data, URL_TITLE_DATA_KEY) === 0;

    if (entityUrlTitleUnusable && payloadUrlTitleUnusable) {
      const payloadProductTypeName = dataValueText(data, PRODUCT_TYPE_NAME_DATA_KEY);

      if (payloadProductTypeName !== undefined) {
        /* `:L297` — the payload's name wins. Written into the payload, by reference. */
        data[URL_TITLE_DATA_KEY] =
          await this.createUniqueProductTypeUrlTitle(payloadProductTypeName);
      } else if (hasEntityText(managedProductType.productTypeName)) {
        /* `:L298-L299` — otherwise the entity's name. */
        data[URL_TITLE_DATA_KEY] = await this.createUniqueProductTypeUrlTitle(
          managedProductType.productTypeName,
        );
      }
      /* No else. `:L296-L300` has none; see the three-way note above for why none is invented. */
    }

    /*
     * `:L303` — the local base override, reached by composition, and reassigned from its return.
     */
    const returnedProductType = await this.productTypeBaseService.save(managedProductType, data);

    /*
     * `persist` may hand back a different instance, and that instance needs the same surface for the
     * gate below to be askable. The identity test avoids re-composing the common case, because a
     * second `manageEntity` call installs a fresh bag and would discard anything already recorded —
     * including the findings `save` has just attached.
     */
    const savedProductType: ProductTypeWithErrorState =
      returnedProductType === managedProductType
        ? managedProductType
        : manageEntity(returnedProductType, PRODUCT_TYPE_ENTITY_METADATA);

    /* `:L306-L308` — all three clauses, and the first one is now genuinely evaluated. */
    if (!savedProductType.hasErrors()) {
      const parentProductType = await this.resolveParentProductTypeForInheritance(savedProductType);
      if (parentProductType !== undefined) {
        const parentProducts = parentProductType.getProducts();
        if (parentProducts.length > 0) {
          /* `:L307` — a replacement, not a merge. */
          savedProductType.setProducts(parentProducts);

          /*
           * — the write, without which the inheritance would exist only in memory.
           * The relationship `:L307` replaces is declared on the product-type side as a one-to-many with
           * `fkcolumn="productTypeID"` [`model/entity/ProductType.cfc:L66`], and the matching
           * many-to-one sits on the product at `model/entity/Product.cfc:L70`. The column that changes
           * is therefore `SwProduct.productTypeID` — one row per inherited product — and not any column
           * of `SwProductType`. Re-saving the product type would write nothing at all, which is why the
           * write goes through `ProductRepository.saveProduct` per product rather than through the base
           * service that has just saved the type.
           */
          for (const inheritedProduct of parentProducts) {
            await this.productRepository.saveProduct(inheritedProduct);
          }
        }
      }
    }

    /* `:L310`. */
    return savedProductType;
  }

  /**
   * Resolves the parent whose products `:L307` inherits, loading it when the slot is absent.
   *
   * @param productType - The product type just saved.
   * @returns The parent to inherit from, or `undefined` when there is none to inherit from.
   */
  private async resolveParentProductTypeForInheritance(
    productType: ProductType,
  ): Promise<ProductType | undefined> {
    const attachedParent = productType.parentProductType;
    if (attachedParent !== undefined) {
      return attachedParent;
    }

    const parentProductTypeID = this.parentProductTypeIdReader(productType);
    if (parentProductTypeID === undefined || parentProductTypeID.length === 0) {
      return undefined;
    }

    const parent = await this.getProductType(parentProductTypeID);
    if (parent === null) {
      return undefined;
    }

    const parentProducts = await this.smartListQueryPort.executeRecords(
      translateSmartListInput({
        entityName: PRODUCT_ENTITY_NAME,
        joins: PRODUCT_SMART_LIST_JOINS,
        /*
         * The legacy request grammar, typed: `F:` prefixes an equality filter, exactly as
         * `integrationServices/google/controllers/feed.cfc:L60-L62` writes its three and as
         * `PRODUCT_FEED_INPUT` carries them. One filter, on the inverse of the relationship being
         * read — no keyword properties, no ordering and no pagination, because `:L307` reads the whole
         * collection and imposes none of the three (AAP §0.7.3).
         */
        input: { [`F:${PRODUCT_TYPE_FILTER_PROPERTY}`]: parentProductTypeID },
      }),
    );

    for (const parentProduct of parentProducts) {
      parent.getProducts().push(parentProduct);
    }

    return parent;
  }

  /* Declared member 14 of 15 — `model/service/ProductService.cfc:L317` */

  /**
   * Deletes a product, clearing its default SKU first and restoring it only if the delete is refused.
   *
   * @param product - The product to delete. Its default-SKU relationship is mutated either way.
   * @returns `true` when the delete succeeded, `false` when the guards refused it — the base service's
   * own answer, returned unchanged.
   */
  public async deleteProduct(product: Product): Promise<boolean> {
    /* `:L320` — stash it. */
    const defaultSku = product.defaultSku;

    /* `:L323` — clear it, so the circular reference cannot block the delete. */
    clearPropertyValue<ProductPropertyName>(product, PRODUCT_DEFAULT_SKU_PROPERTY);

    /* `:L326` — the composed base service, which answers a boolean rather than throwing. */
    const deleteOK = await this.baseService.delete(product);

    /* `:L329-L333` — restore on failure only, and only when there was something to restore. */
    if (!deleteOK) {
      if (defaultSku !== undefined) {
        assignPropertyValue<ProductPropertyName>(product, PRODUCT_DEFAULT_SKU_PROPERTY, defaultSku);
      }

      return false;
    }

    /* `:L335` — on success the relationship stays cleared. */
    return true;
  }

  /* Declared member 15 of 15 — `model/service/ProductService.cfc:L342` */

  /**
   * Builds the paginated product query, with its joins and keyword properties registered.
   *
   * @param data - Optional smart-list input: keywords, ordering, filters, pagination.
   * @param _currentURL - Accepted for signature parity and unused; see Discrepancy 1 above.
   * @returns The paginated product result, produced by the adapter behind the port.
   */
  /*
   * `async` although the body is a single `return`, and the keyword is load-bearing rather than
   * decorative. `translateSmartListInput` can now refuse the request — an unresolvable property path
   * raises `SmartListPropertyUnresolvedError`, see the divergence record on
   * `SmartListPropertyIdentifier` — and that raise happens while the argument is being evaluated, before
   * any promise exists. Without `async` it would leave this member as a SYNCHRONOUS throw from a member
   * whose declared type is `Promise`, so a caller writing `getProductSmartList(data).catch(handle)` would
   * never reach its handler. The declared name, arity and return type are unchanged, so nothing about the
   * preserved contract (TR-1) moves.
   */
  public async getProductSmartList(
    data?: SmartListInput,
    _currentURL?: string,
  ): Promise<SmartListResult<Product>> {
    return this.smartListQueryPort.execute(
      translateSmartListInput({
        /* `:L343`. */
        entityName: PRODUCT_ENTITY_NAME,
        input: data,
        /* `:L347-L349` — order and join types preserved, brand LEFT. */
        joins: PRODUCT_SMART_LIST_JOINS,
        /* `:L351-L355` — five properties, weight 1, registration order preserved. */
        keywordProperties: PRODUCT_SMART_LIST_KEYWORD_PROPERTIES,
      }),
    );
  }
}
