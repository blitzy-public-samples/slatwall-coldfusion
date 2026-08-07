// Unit suite pinning `src/services/productService.ts`.
//
// Coverage provenance: 100% net-new, never to be presented as parity.
//
// The trap worth naming: `meta/tests/unit/entity/ProductTest.cfc` does exist and does carry one
// real case, `productUrlIsCorrectlyFormatted()`.
//
// FOURTEEN of the fifteen are `async`; exactly one, `getFormattedOptionGroups`, is synchronous,
// because it reaches no repository and walks only already-materialized associations.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import { Option } from '../../../src/domain/entities/option.js';
import { OptionGroup } from '../../../src/domain/entities/optionGroup.js';
import { ProductType } from '../../../src/domain/entities/productType.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import { listToArray } from '../../../src/lib/cfml/list.js';
import { structFindKey } from '../../../src/lib/cfml/struct.js';
import { CfmlBooleanConversionError } from '../../../src/lib/cfml/truthiness.js';
import {
  MissingAssociationError,
  ProductPagingCriteriaError,
  ProductService,
} from '../../../src/services/productService.js';
import { makeProductFixture } from '../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../fixtures/skuFixtures.js';

import type { Product } from '../../../src/domain/entities/product.js';
import type { Sku } from '../../../src/domain/entities/sku.js';
import type { SelectOption } from '../../../src/domain/ports/optionRepository.js';
import type { UrlTitleTableName } from '../../../src/domain/ports/urlTitleGenerator.js';
import type {
  DeleteDefaultImageInput,
  ProductPage,
  ProductQueryCriteria,
  ProductSaveInput,
  ProductTypeSaveInput,
  ProductUpdateSkusInput,
} from '../../../src/services/productService.js';

// JUDGMENT CALL: all eight collaborator types are reached through
// `ConstructorParameters<typeof ProductService>` instead of being imported individually.
type ProductRepositoryPort = ConstructorParameters<typeof ProductService>[0];
type SkuRepositoryPort = ConstructorParameters<typeof ProductService>[1];
type ProductTypeRepositoryPort = ConstructorParameters<typeof ProductService>[2];
type UrlTitleGeneratorPort = ConstructorParameters<typeof ProductService>[3];
type ImageStorePort = ConstructorParameters<typeof ProductService>[4];
type SubscriptionTermProviderPort = ConstructorParameters<typeof ProductService>[5];
type SkuCreationPort = ConstructorParameters<typeof ProductService>[6];
type OptionLoadingPort = ConstructorParameters<typeof ProductService>[7];
type SkuBatchWritePort = ConstructorParameters<typeof ProductService>[8];

type SkuCreationPayloadShape = Parameters<SkuCreationPort['createSkus']>[1];

/**
 * The upload projection the image store's save member accepts, recovered the same way and for the
 * same reason - so this suite never has to name `ImageUploadResultProjection` or import from the
 * port module.
 */
type ImageUploadProjectionShape = Parameters<ImageStorePort['saveImageFile']>[0];

/**
 * The descriptor the image port's name composer is handed, recovered the same way and for the same
 * reason - a type the suite never imports cannot drift from the shipped constructor.
 */
type SkuImageFileNameDescriptor = Parameters<ImageStorePort['generateSkuImageFileName']>[0];

/**
 * The populate payload each save override hands to its repository, recovered the same way and for
 * the same reason - a type the suite never imports cannot drift from the shipped port.
 */
type ProductSavePayloadShape = Parameters<ProductRepositoryPort['saveProduct']>[1];

/**
 * The product-type counterpart of {@link ProductSavePayloadShape}.
 */
type ProductTypeSavePayloadShape = Parameters<ProductTypeRepositoryPort['saveProductType']>[1];

/**
 * The window the repository's search member accepts, recovered the same way and for the same
 * reason - a type this suite never imports cannot drift from the shipped port.
 *
 * `NonNullable` strips the `| undefined` the optional parameter position carries, so the alias
 * names the window ITSELF rather than "a window or nothing".
 */
type ProductSearchWindow = NonNullable<
  Parameters<ProductRepositoryPort['searchProductsByProductType']>[2]
>;

/**
 * One matched row the repository's search member answers with, recovered the same way.
 */
type ProductSearchRow = Awaited<
  ReturnType<ProductRepositoryPort['searchProductsByProductType']>
>['records'][number];

/**
 * One matched row, as this suite writes one. `value` is omitted when no name is given.
 */
function matchRow(id: string, value?: string): ProductSearchRow {
  return value === undefined ? { id } : { id, value };
}

/**
 * The match set the repository's search member answers with, recovered the same way.
 *
 * `Awaited<ReturnType<...>>` unwraps the promise, so the alias names the settled value - the
 * `{ records, matchedCount }` pair - which is what a double has to produce.
 */
type ProductSearchMatches = Awaited<
  ReturnType<ProductRepositoryPort['searchProductsByProductType']>
>;

/**
 * Fixed instant used wherever an audit column must be populated.
 *
 * `tests/setup.ts` forces the process time zone to UTC and verifies it took effect, so a UTC
 * ISO-8601 literal is unambiguous here.
 */
const FIXED_AUDIT_INSTANT = new Date('2024-06-01T00:00:00.000Z');

/**
 * The URL title the generator double answers with.
 *
 * The `generated-` prefix makes it impossible to mistake a double's answer for a real slug, or for
 * an assertion to pass because a test happened to supply a value that already looked like one.
 */
const GENERATED_URL_TITLE = 'generated-url-title';

/**
 * The calculated title `makeProductFixture` supplies, reproduced here as the expected generator
 * input.
 *
 * It is the CALCULATED title, not a `getTitle()` result: the ported entity publishes no
 * `getTitle()` member, so the shipped `saveProduct` reads `getCalculatedTitle()`.
 */
const FIXTURE_CALCULATED_TITLE = 'Test Product (calculated title snapshot)';

const FIXTURE_URL_TITLE = 'nike-air-jorden';

/**
 * The product name `makeProductFixture` defaults to - `meta/tests/unit/Helper.cfc:L54`
 * `productName = "Test Product"`, verbatim.
 */
const FIXTURE_PRODUCT_NAME = 'Test Product';

/**
 * The brand name `makeProductFixture` attaches, mirrored from `tests/fixtures/productFixtures.ts`.
 *
 * Needed because the rendered title template resolves `${brand.brandName}`
 * [model/service/SettingService.cfc:L193], so the title-source case has to state both markers'
 * resolved values.
 */
const FIXTURE_BRAND_NAME = 'Test Brand';

/**
 * Identifier carried only by the instance the persistence double answers with.
 *
 * The legacy save is where a new product acquires its generated identifier, and the ported entity
 * is immutable, so that identifier cannot be back-filled into the argument.
 */
const PERSISTED_PRODUCT_ID = 'persisted-product-identifier';

const PERSISTED_PRODUCT_TYPE_ID = 'persisted-product-type-identifier';

/**
 * Physical table names, preserved verbatim.
 *
 * Schema continuity is a project constraint: the target reads and writes the existing tables
 * unchanged.
 */
const PRODUCT_TABLE_NAME: UrlTitleTableName = 'SwProduct';
const PRODUCT_TYPE_TABLE_NAME: UrlTitleTableName = 'SwProductType';

/**
 * Resource-bundle keys, preserved verbatim, with no i18n runtime.
 *
 * LEGACY-NOTE [model/process/Product_UpdateSkus.cfc:L56, L58]:
 * [model/process/Product_UpdateSkus.cfc:L56] declares `hb_rbKey="entity.sku.price"` on its `price`
 * property and [model/process/Product_UpdateSkus.cfc:L58] declares
 * `hb_rbKey="entity.sku.listPrice"` on its `listPrice` property.
 */
const SKU_PRICE_RB_KEY = 'entity.sku.price';
const SKU_LIST_PRICE_RB_KEY = 'entity.sku.listPrice';
const FIXTURE_IMAGE_OPTION_CODE_DELIMITER = '-';
const FIXTURE_IMAGE_DEFAULT_EXTENSION = 'jpg';

/**
 * The six members `ProductRepository` declares.
 *
 * Six, and the port states it as a LOCK.
 */
const PRODUCT_REPOSITORY_MEMBERS = [
  'getAttributeSets',
  'loadDataFromFile',
  'searchProductsByProductType',
  'getProductByProductID',
  'saveProduct',
  'deleteProduct',
] as const;

const LEGACY_METHOD_NAMES = [
  'loadDataFromFile',
  'getFormattedOptionGroups',
  'getProductSkusBySelectedOptions',
  'processProduct_addOptionGroup',
  'processProduct_addOption',
  'processProduct_addProductReview',
  'processProduct_addSubscriptionTerm',
  'processProduct_deleteDefaultImage',
  'processProduct_updateDefaultImageFileNames',
  'processProduct_updateSkus',
  'processProduct_uploadDefaultImage',
  'saveProduct',
  'saveProductType',
  'deleteProduct',
  'findProducts',
] as const;

/**
 * The keyword every `findProducts` call in this file must supply.
 *
 * So `{}` was never a call that could succeed against the shipped adapter, only one that this
 * file's permissive double happened to tolerate.
 */
const REQUIRED_KEYWORD = 'nike';

/**
 * A provisional SKU key of exactly the shape `skuService.createSkus` mints for a draft.
 *
 * `createHibachiShapedIdentifier` in `src/services/skuService.ts` reproduces `createHibachiUUID()`
 * [org/Hibachi/HibachiObject.cfc:L144-L146], whose whole body is
 * `return replace(lcase(createUUID()), '-', '', 'all');` [org/Hibachi/HibachiObject.cfc:L145] -
 * thirty-two lowercase hexadecimal digits.
 */
const PROVISIONAL_SKU_ID = '6b1f0c9d7a2e4b558c30d1fe94a7b602';

/**
 * The key carried by the draft that {@link attachOneDesignatedDraftSku} attaches.
 *
 * Distinct from {@link PROVISIONAL_SKU_ID} on purpose: cases that program their own attachment use
 * that one.
 */
const CREATED_DRAFT_SKU_ID = 'a71c4e26db384f0d9ba55e13c8f0742b';

interface OptionGroupWithOption {
  readonly group: OptionGroup;
  readonly option: Option;
}

/**
 * Builds an option group holding no options.
 *
 * Every field the shipped constructor declares is supplied explicitly, including the ones whose
 * value is `undefined`.
 *
 * The sort-order tie-breaker is a constant function rather than an omission, so two options
 * sharing a sort order can never order differently between runs.
 */
function buildEmptyOptionGroup(spec: {
  readonly optionGroupID: string;
  readonly optionGroupName: string;
  readonly sortOrder: number;
  /**
   * `property name="imageGroupFlag" ormtype="boolean" default="0";`
   * [model/entity/OptionGroup.cfc:L57].
   *
   * OPTIONAL, DEFAULTING to `false`, which is the column's own default and was this builder's
   * hardcoded value before the image-file-name cases needed the other branch.
   */
  readonly imageGroupFlag?: boolean;
}): OptionGroup {
  return new OptionGroup({
    optionGroupID: spec.optionGroupID,
    optionGroupName: spec.optionGroupName,
    optionGroupCode: spec.optionGroupID,
    optionGroupImage: undefined,
    optionGroupDescription: undefined,
    imageGroupFlag: spec.imageGroupFlag ?? false,
    sortOrder: spec.sortOrder,
    remoteID: undefined,
    createdDateTime: FIXED_AUDIT_INSTANT,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
    options: [],
    optionSortTieBreaker: () => 0,
  });
}

/**
 * Builds one option group holding one option, with the back-reference wired both ways.
 *
 * The two-step wiring is required by the shipped entities and is not a workaround:
 * `new Option({ optionGroup })` records the group but does not push itself into the group's
 * collection - only `Option.setOptionGroup` does that.
 */
function buildOptionGroupWithOption(spec: {
  readonly optionGroupID: string;
  readonly optionGroupName: string;
  readonly optionID: string;
  readonly optionName: string;
  readonly sortOrder: number;
}): OptionGroupWithOption {
  const group = buildEmptyOptionGroup({
    optionGroupID: spec.optionGroupID,
    optionGroupName: spec.optionGroupName,
    sortOrder: spec.sortOrder,
  });

  const option = new Option({
    optionID: spec.optionID,
    optionCode: spec.optionID,
    optionName: spec.optionName,
    optionDescription: undefined,
    sortOrder: spec.sortOrder,
    optionGroup: group,
    defaultImageID: undefined,
    remoteID: undefined,
    createdDateTime: FIXED_AUDIT_INSTANT,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  });

  group.getOptions().push(option);

  return { group, option };
}

function addOptionToGroup(
  group: OptionGroup,
  spec: { readonly optionID: string; readonly optionName: string; readonly sortOrder: number },
): Option {
  const option = new Option({
    optionID: spec.optionID,
    optionCode: spec.optionID,
    optionName: spec.optionName,
    optionDescription: undefined,
    sortOrder: spec.sortOrder,
    optionGroup: group,
    defaultImageID: undefined,
    remoteID: undefined,
    createdDateTime: FIXED_AUDIT_INSTANT,
    createdByAccountID: undefined,
    modifiedDateTime: undefined,
    modifiedByAccountID: undefined,
  });

  group.getOptions().push(option);

  return option;
}

/**
 * A double that answered a plausible value for an unexercised member would let a regression pass
 * unnoticed; one that raises turns the same regression into a named failure.
 */
function unreachedPortMember(portName: string, member: string): never {
  throw new Error(
    `the ${portName} double's ${member} was reached. The ported ProductService reaches exactly ` +
      'seventeen of the twenty-seven members its eight ports declare, and this is not one of ' +
      'them, so reaching it means the service under test has grown a collaboration this suite ' +
      'does not describe.',
  );
}

interface RecordedImportRequest {
  readonly fileURL: string;
  readonly textQualifier: string | undefined;
}

/**
 * One recorded product search, exactly as it arrived.
 *
 * LEGACY-NOTE [model/dao/ProductDAO.cfc:L419 versus model/dao/SkuDAO.cfc:L130]: the product-side
 * parameter is PLURAL, `productTypeIDs`, a comma-delimited list, whereas the SKU-side
 * `searchSkusByProductType` takes the SINGULAR `productTypeID`.
 */
interface RecordedProductSearch {
  readonly term: string | undefined;
  readonly productTypeIDs: string | undefined;
  /**
   * The materialization window the service pushed down, or `undefined` when it pushed none.
   */
  readonly window: ProductSearchWindow | undefined;
}

/**
 * In-memory stand-in for the product repository port.
 *
 * Replaces the legacy `property name="productDAO";` [model/service/ProductService.cfc:L52] plus
 * the framework-inherited `getHibachiDAO().save(...)` [model/service/ProductService.cfc:L287] and
 * `super.delete(...)` [model/service/ProductService.cfc:L326].
 */
class RecordingProductRepository implements ProductRepositoryPort {
  readonly imports: RecordedImportRequest[] = [];
  readonly searches: RecordedProductSearch[] = [];
  readonly saves: Product[] = [];

  /**
   * The payload of every save, in call order and positionally paired with {@link saves}.
   *
   * Recorded SEPARATELY from the entity rather than folded into one object.
   */
  readonly savePayloads: ProductSavePayloadShape[] = [];
  readonly deletes: Product[] = [];

  /**
   * The rows the search answers.
   */
  searchResult: ProductSearchRow[] = [];

  /**
   * What the double reports as the pre-window match count.
   *
   * Defaults to `undefined`, which means "as many as `searchResult` holds" - the honest reading
   * for a double that windows nothing.
   */
  matchedCountOverride: number | undefined = undefined;

  deleteOutcome = true;

  constructor(private readonly persistedProduct: Product) {}

  loadDataFromFile(fileURL: string, textQualifier?: string): Promise<void> {
    this.imports.push({ fileURL, textQualifier });

    return Promise.resolve();
  }

  searchProductsByProductType(
    term?: string,
    productTypeIDs?: string,
    window?: ProductSearchWindow,
  ): Promise<ProductSearchMatches> {
    this.searches.push({ term, productTypeIDs, window });

    // The double APPLIES the window it was handed, because the real adapter does. A double that
    // ignored it would let a service that stopped pushing it down still pass every assertion about
    // the returned page.
    const records =
      window === undefined
        ? this.searchResult
        : this.searchResult.slice(window.start, window.start + window.count);

    return Promise.resolve({
      records,
      matchedCount: this.matchedCountOverride ?? this.searchResult.length,
    });
  }

  /**
   * Inspected at the moment of the save, before the recorder answers.
   */
  onSave: ((product: Product) => void) | undefined = undefined;

  saveProduct(product: Product, data: ProductSavePayloadShape): Promise<Product> {
    this.saves.push(product);
    this.savePayloads.push(data);

    this.onSave?.(product);

    const carried = product.getSkus();
    const persistedSkus = this.persistedProduct.getSkus();

    if (carried !== persistedSkus) {
      persistedSkus.length = 0;
      persistedSkus.push(...carried);
    }

    const defaultSku = product.getDefaultSku();

    if (defaultSku !== undefined) {
      this.persistedProduct.setDefaultSku(defaultSku);
    }

    return Promise.resolve(this.persistedProduct);
  }

  /**
   * Inspected at the moment of the delete, before the recorder answers.
   *
   * Absent by default, and the symmetric counterpart of {@link onSave}.
   */
  onDelete: ((product: Product) => void) | undefined = undefined;

  deleteProduct(product: Product): Promise<boolean> {
    this.deletes.push(product);

    this.onDelete?.(product);

    return Promise.resolve(this.deleteOutcome);
  }

  readonly getAttributeSets: ProductRepositoryPort['getAttributeSets'] = () =>
    unreachedPortMember('product repository', 'getAttributeSets');

  readonly getProductByProductID: ProductRepositoryPort['getProductByProductID'] = () =>
    unreachedPortMember('product repository', 'getProductByProductID');

  // No `saveBrand` MEMBER: the port's member set is locked at six and publishes no brand write.
}

interface RecordedSelectedOptionsLookup {
  readonly selectedOptions: string;
  readonly productID: string | undefined;
}

interface RecordedTransactionProbe {
  readonly productID: string | undefined;
  readonly skuID: string | undefined;
}

/**
 * In-memory stand-in for the SKU repository port.
 *
 * `getSkusBySelectedOptions` answers the seeded array by REFERENCE, deliberately: must-preserve
 * area (iii) is pure delegation.
 */
class RecordingSkuRepository implements SkuRepositoryPort {
  readonly selectedOptionsLookups: RecordedSelectedOptionsLookup[] = [];
  readonly transactionProbes: RecordedTransactionProbe[] = [];

  selectedOptionsResult: Sku[] = [];

  transactionExists = false;

  getSkusBySelectedOptions(selectedOptions: string, productID?: string): Promise<Sku[]> {
    this.selectedOptionsLookups.push({ selectedOptions, productID });

    return Promise.resolve(this.selectedOptionsResult);
  }

  getTransactionExistsFlag(productID?: string, skuID?: string): Promise<boolean> {
    this.transactionProbes.push({ productID, skuID });

    return Promise.resolve(this.transactionExists);
  }

  readonly getSkuBySkuCode: SkuRepositoryPort['getSkuBySkuCode'] = () =>
    unreachedPortMember('SKU repository', 'getSkuBySkuCode');

  readonly searchSkusByProductType: SkuRepositoryPort['searchSkusByProductType'] = () =>
    unreachedPortMember('SKU repository', 'searchSkusByProductType');

  readonly getProductSkus: SkuRepositoryPort['getProductSkus'] = () =>
    unreachedPortMember('SKU repository', 'getProductSkus');

  readonly getSortedProductSkusID: SkuRepositoryPort['getSortedProductSkusID'] = () =>
    unreachedPortMember('SKU repository', 'getSortedProductSkusID');

  /**
   * Every SKU the service persisted, in the order it persisted them.
   *
   * `SkuRepository` carried a `saveSkus` collection form, `processProduct_updateSkus` wrote
   * through that member and this one was left raising.
   *
   * What that costs is stated rather than glossed: a per-SKU write can stop part way, so the
   * "nothing reached a row" guarantee a single collection write gave is gone.
   */
  readonly savedSkus: Sku[] = [];

  saveSku(sku: Sku): Promise<Sku> {
    this.savedSkus.push(sku);

    // Handed straight back rather than rehydrated: a double has no row to reflect, and
    // `processProduct_updateSkus` discards the result anyway - it returns the argument product.
    return Promise.resolve(sku);
  }
}

/**
 * In-memory stand-in for the batch-write collaborator, and the double that makes ATOMICITY
 * observable.
 */
class RecordingSkuBatchWrite implements SkuBatchWritePort {
  /**
   * One entry per call, holding a COPY of the set so a later mutation cannot rewrite history.
   */
  readonly batches: (readonly Sku[])[] = [];

  /**
   * The parent product key handed over with each batch, one entry per call.
   *
   * RECORDED BECAUSE ITS ABSENCE WAS A CRITICAL DATA-LOSS DEFECT. The collaborator's first
   * parameter used not to exist, and the composition root consequently let the adapter fall back to
   * a product back-reference the read never materializes - so `SwSku.productID` was written as SQL
   * NULL and QA measured one call orphaning four of five SKU rows. Capturing the key here is what
   * lets a case assert that the service names the parent it was handed.
   */
  readonly parentProductIDs: string[] = [];

  /** When set, the unit of work fails and forwards nothing - the rollback, modelled. */
  failure: Error | undefined = undefined;

  constructor(private readonly repository: RecordingSkuRepository) {}

  async saveMutatedSkus(productID: string, skus: readonly Sku[]): Promise<void> {
    this.parentProductIDs.push(productID);
    this.batches.push([...skus]);

    if (this.failure !== undefined) {
      throw this.failure;
    }

    for (const sku of skus) {
      await this.repository.saveSku(sku);
    }
  }
}

/**
 * In-memory stand-in for the product-type repository port.
 *
 * LEGACY-NOTE [model/service/ProductService.cfc:L54]: the legacy component declares
 * `property name="productTypeDAO";` and never uses it - one of two dead injections in the file.
 *
 * ECHOES its argument by default so a test can observe what the service does to the RETURNED
 * instance.
 */
class RecordingProductTypeRepository implements ProductTypeRepositoryPort {
  readonly saves: ProductType[] = [];

  /**
   * The payload of every save, in call order and positionally paired with {@link saves}.
   *
   * On this aggregate the payload is the only channel the resolved url title has ever had - the
   * legacy resolved it into the data struct at [model/service/ProductService.cfc:L297, L299] and
   * never onto the entity.
   */
  readonly savePayloads: ProductTypeSavePayloadShape[] = [];

  answer: ProductType | undefined = undefined;

  saveProductType(
    productType: ProductType,
    data: ProductTypeSavePayloadShape,
  ): Promise<ProductType> {
    this.saves.push(productType);
    this.savePayloads.push(data);

    const configured = this.answer;

    if (configured === undefined) {
      return Promise.resolve(productType);
    }

    return Promise.resolve(configured);
  }

  readonly getProductTypeQuery: ProductTypeRepositoryPort['getProductTypeQuery'] = () =>
    unreachedPortMember('product-type repository', 'getProductTypeQuery');

  readonly getProductTypeByProductTypeID: ProductTypeRepositoryPort['getProductTypeByProductTypeID'] =
    () => unreachedPortMember('product-type repository', 'getProductTypeByProductTypeID');

  readonly getProductTypesByProductTypeIDPath: ProductTypeRepositoryPort['getProductTypesByProductTypeIDPath'] =
    () => unreachedPortMember('product-type repository', 'getProductTypesByProductTypeIDPath');
}

interface RecordedUrlTitleRequest {
  readonly titleString: string;
  readonly tableName: UrlTitleTableName;
}

/**
 * In-memory stand-in for the URL-title generator port.
 *
 * Replaces the legacy `property name="dataService";` [model/service/ProductService.cfc:L55],
 * narrowed by the port to the single method this component ever consumed.
 *
 * Records both arguments of every call in arrival order, so a test can assert how MANY times
 * generation fired, which title source won, and which physical table the uniqueness scope named.
 */
class RecordingUrlTitleGenerator implements UrlTitleGeneratorPort {
  readonly requests: RecordedUrlTitleRequest[] = [];

  createUniqueURLTitle(titleString: string, tableName: UrlTitleTableName): Promise<string> {
    this.requests.push({ titleString, tableName });

    return Promise.resolve(GENERATED_URL_TITLE);
  }
}

/**
 * In-memory stand-in for the image-store STUB port.
 *
 * The image service is one of the two collaborators the project ports as a stub, because only
 * out-of-scope branches consume it.
 */
class RecordingImageStore implements ImageStorePort {
  readonly deletedPaths: string[] = [];

  /**
   * Every `saveImageFile` call, in order, exactly as it arrived.
   *
   * `processProduct_uploadDefaultImage` reaches this member - the AAP's interface mapping for that
   * method prescribes "Delegates to the image-store stub port" (AAP 0.4.2, ProductService table).
   */
  readonly savedFiles: { readonly filePath: string; readonly allowedExtensions: string }[] = [];

  /**
   * When set, the next save REJECTS. The upload path wraps its delegation in a catch, so this is
   * how the swallowed-failure branch is reached deliberately.
   */
  saveRejection: Error | undefined = undefined;

  /**
   * Every descriptor the name composer was handed, in call order.
   */
  readonly nameDescriptors: SkuImageFileNameDescriptor[] = [];

  deleteImageFile(filePath: string): Promise<void> {
    this.deletedPaths.push(filePath);

    return Promise.resolve();
  }

  saveImageFile(
    _uploadResult: ImageUploadProjectionShape,
    filePath: string,
    allowedExtensions: string,
  ): Promise<boolean> {
    this.savedFiles.push({ filePath, allowedExtensions });

    if (this.saveRejection !== undefined) {
      return Promise.reject(this.saveRejection);
    }

    return Promise.resolve(true);
  }

  /**
   * Composes the name EXACTLY as the port specifies, and records what it was handed.
   *
   * So the five clauses the port fixes are reproduced here: case-insensitive sanitisation of the
   * product code and of each option code separately, the delimiter before each code.
   */
  generateSkuImageFileName(descriptor: SkuImageFileNameDescriptor): string {
    this.nameDescriptors.push(descriptor);

    const sanitise = (value: string | undefined): string =>
      (value ?? '').replace(/[^a-z0-9\-_]/gi, '');

    const optionSegments = descriptor.imageGroupOptionCodes
      .map((optionCode) => `${FIXTURE_IMAGE_OPTION_CODE_DELIMITER}${sanitise(optionCode)}`)
      .join('');

    return `${sanitise(descriptor.productCode)}${optionSegments}.${FIXTURE_IMAGE_DEFAULT_EXTENSION}`;
  }
}

/**
 * In-memory stand-in for the subscription-term STUB port.
 */
class RecordingSubscriptionTermProvider implements SubscriptionTermProviderPort {
  readonly requestedTermIDs: string[] = [];

  getSubscriptionTerm(subscriptionTermID: string): Promise<undefined> {
    this.requestedTermIDs.push(subscriptionTermID);

    return Promise.resolve(undefined);
  }

  readonly getSubscriptionBenefit: SubscriptionTermProviderPort['getSubscriptionBenefit'] = () =>
    unreachedPortMember('subscription-term provider', 'getSubscriptionBenefit');
}

interface RecordedSkuCreation {
  readonly product: Product;
  readonly data: SkuCreationPayloadShape;
}

/**
 * The faithful default effect of a `createSkus` invocation: one draft SKU attached, and designated
 * as the product's default when nothing holds that role yet.
 *
 * `Product.addSku` delegates to `Sku.setProduct`, which pushes into the LIVE array for a new SKU -
 * the same route [model/service/SkuService.cfc:L100] takes.
 *
 * The draft stays TRANSIENT, which is the state `mysqlProductRepository` reads to defer the
 * `defaultSkuID` write.
 */
function attachOneDesignatedDraftSku(product: Product): void {
  const created = makeSkuFixture({ skuID: CREATED_DRAFT_SKU_ID, isNew: true, product: undefined });

  product.addSku(created);

  if (product.getDefaultSku() === undefined) {
    product.setDefaultSku(created);
  }
}

/**
 * A recording stand-in for the SKU-creation collaborator.
 *
 * `saveProduct` reproduces the legacy's SECOND `!hasErrors()` ask
 * [model/service/ProductService.cfc:L286] as `product.isNew() && product.getSkus().length  0`,
 * and that equivalence is provable precisely because every arm of the real collaborator that
 * completes attaches at least one SKU.
 */
class RecordingSkuCreation implements SkuCreationPort {
  readonly requests: RecordedSkuCreation[] = [];

  outcome = true;

  /**
   * What the collaborator does to the product, beyond recording that it was asked.
   */
  attachment: (product: Product) => void = attachOneDesignatedDraftSku;

  createSkus(product: Product, data: SkuCreationPayloadShape): Promise<boolean> {
    this.requests.push({ product, data });

    this.attachment(product);

    return Promise.resolve(this.outcome);
  }
}

/**
 * In-memory stand-in for the option-loading collaborator.
 *
 * Replaces the legacy `property name="optionService";` [model/service/ProductService.cfc:L60] plus
 * the framework's generic `get<Entity>(primaryKey)` affordance that
 * [model/service/ProductService.cfc:L115] and [model/service/ProductService.cfc:L130] leaned on.
 *
 * `getOptionsForSelect` is SYNCHRONOUS here because it is synchronous on the shipped port.
 */
class RecordingOptionLoading implements OptionLoadingPort {
  readonly formattedRequests: (readonly Option[])[] = [];
  readonly requestedOptionGroupIDs: string[] = [];
  readonly requestedOptionIDs: string[] = [];

  readonly optionGroupsByID = new Map<string, OptionGroup>();
  readonly optionsByID = new Map<string, Option>();

  getOptionsForSelect(options: readonly Option[]): SelectOption[] {
    this.formattedRequests.push(options);

    return options.map((option: Option) => ({
      name: option.getOptionName() ?? '',
      value: option.getOptionID(),
    }));
  }

  getOptionGroup(optionGroupID: string): Promise<OptionGroup | undefined> {
    this.requestedOptionGroupIDs.push(optionGroupID);

    return Promise.resolve(this.optionGroupsByID.get(optionGroupID));
  }

  getOption(optionID: string): Promise<Option | undefined> {
    this.requestedOptionIDs.push(optionID);

    return Promise.resolve(this.optionsByID.get(optionID));
  }
}

/**
 * One declarative-validation issue, flattened to primitives.
 *
 * Assertions are made on the STRUCTURED issue rather than on a stringified error blob.
 */
interface CapturedIssue {
  readonly code: string;
  readonly message: string;
  readonly path: readonly string[];
}

/**
 * Runs an operation that must reject with the declarative validation error, and answers its
 * issues.
 */
async function captureZodIssues(
  operation: () => Promise<unknown>,
): Promise<readonly CapturedIssue[]> {
  let captured: unknown;
  let rejected = false;

  try {
    await operation();
  } catch (caught: unknown) {
    captured = caught;
    rejected = true;
  }

  if (!rejected) {
    throw new Error(
      'the call RESOLVED where the declarative rules of ' +
        'model/validation/Product_UpdateSkus.json had to reject it. The condition/property pair ' +
        'that should have fired did not, so the port has stopped reproducing the legacy ' +
        'validation contract.',
    );
  }

  if (!(captured instanceof ZodError)) {
    throw new Error(
      `the call rejected with a ${typeof captured} rather than the declarative validation ` +
        'error, so the failure came from somewhere other than the schema. That distinction ' +
        'matters here: the runtime branches and the declarative rules use DIFFERENT ' +
        'predicates, and conflating their failures would hide the asymmetry this suite pins.',
    );
  }

  return captured.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.map((segment) => String(segment)),
  }));
}

/**
 * Answers the property identifier a resource-bundle key annotates.
 *
 * `entity.sku.listPrice` annotates the `listPrice` property, so the terminal segment is the
 * property name.
 */
function rbKeyPropertyIdentifier(rbKey: string): string {
  const segments = rbKey.split('.');
  const terminal = segments[segments.length - 1];

  return terminal ?? rbKey;
}

// The refused-save reader.
//
// What did not CHANGE across any ROUND: a refused save must still write nothing, and every case
// that asserted that still does.

/**
 * The two members a refused save answers through, on either entity.
 */
interface RefusableEntity {
  hasErrors(): boolean;
  getErrors(): Readonly<Record<string, readonly string[]>>;
}

/**
 * The rules an entity was refused on, flattened to one record per message in the order they were
 * recorded.
 */
function refusedRulesOf(entity: {
  getErrors(): Readonly<Record<string, readonly string[]>>;
}): { propertyIdentifier: string; errorMessage: string }[] {
  const rules: { propertyIdentifier: string; errorMessage: string }[] = [];

  for (const [propertyIdentifier, messages] of Object.entries(entity.getErrors())) {
    for (const errorMessage of messages) {
      rules.push({ propertyIdentifier, errorMessage });
    }
  }

  return rules;
}

/**
 * Run a save that must be REFUSED and hand back the entity it answered with.
 */
async function refusedEntityOf<TEntity extends RefusableEntity>(
  run: () => Promise<TEntity>,
): Promise<TEntity> {
  const entity = await run();

  if (!entity.hasErrors()) {
    throw new Error(
      'the suite expected the save to be REFUSED, and the entity came back carrying no error',
    );
  }

  return entity;
}

describe('ProductService', () => {
  let productRepository: RecordingProductRepository;
  let skuRepository: RecordingSkuRepository;
  let productTypeRepository: RecordingProductTypeRepository;
  let urlTitleGenerator: RecordingUrlTitleGenerator;
  let imageStore: RecordingImageStore;
  let subscriptionTermProvider: RecordingSubscriptionTermProvider;
  let skuCreation: RecordingSkuCreation;
  let optionLoading: RecordingOptionLoading;
  let skuBatchWrite: RecordingSkuBatchWrite;
  let persistedProduct: Product;
  let service: ProductService;

  beforeEach(() => {
    persistedProduct = makeProductFixture({
      productID: PERSISTED_PRODUCT_ID,
      urlTitle: 'persisted-url-title',
    });

    productRepository = new RecordingProductRepository(persistedProduct);
    skuRepository = new RecordingSkuRepository();
    productTypeRepository = new RecordingProductTypeRepository();
    urlTitleGenerator = new RecordingUrlTitleGenerator();
    imageStore = new RecordingImageStore();
    subscriptionTermProvider = new RecordingSubscriptionTermProvider();
    skuCreation = new RecordingSkuCreation();
    optionLoading = new RecordingOptionLoading();
    // Constructed over the same recording repository, so `savedSkus` keeps reporting exactly which
    // SKUs were persisted while `batches` reports how many units of work carried them.
    skuBatchWrite = new RecordingSkuBatchWrite(skuRepository);

    // JUDGMENT CALL: transformation rule T1, and the whole wiring story.
    //
    // The legacy component declares its collaborators as bare properties at
    // [model/service/ProductService.cfc:L52-L60] and reaches them through DI/1 convention
    // accessors - `getProductDAO()`, `getSkuDAO()`, `getDataService()`, `getSkuService()`.
    service = new ProductService(
      productRepository,
      skuRepository,
      productTypeRepository,
      urlTitleGenerator,
      imageStore,
      subscriptionTermProvider,
      skuCreation,
      optionLoading,
      skuBatchWrite,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('published surface and constructor wiring', () => {
    it('publishes all fifteen legacy method names verbatim and no framework surface', () => {
      const publishedMembers = Object.getOwnPropertyNames(ProductService.prototype);

      // CFML parity [model/service/ProductService.cfc:L65-L358]: every name is carried over in
      // legacy CFML camelCase, including the underscore-separated process-method convention,
      // because method-level interface parity is this migration's acceptance contract.
      for (const methodName of LEGACY_METHOD_NAMES) {
        expect(publishedMembers).toContain(methodName);
      }

      expect(LEGACY_METHOD_NAMES).toHaveLength(15);

      expect(publishedMembers).not.toContain('getProduct');
      expect(publishedMembers).not.toContain('newProduct');
      expect(publishedMembers).not.toContain('getProductType');
      expect(publishedMembers).not.toContain('newProductType');
      expect(publishedMembers).not.toContain('save');
      expect(publishedMembers).not.toContain('delete');

      // The generic convention dispatcher is gone.
      expect(publishedMembers).not.toContain('processProduct');

      expect(publishedMembers).not.toContain('getProductSmartList');
      expect(publishedMembers).not.toContain('getSkuSmartList');

      // LEGACY-NOTE [model/service/ProductService.cfc:L82-L97]: the private recursive helper
      // `buildSkuCombinations` is DEAD in the legacy component - no line in the file calls it, and
      // no other component can, because it is private.
      expect(publishedMembers).not.toContain('buildSkuCombinations');
    });

    it('takes exactly nine constructor collaborators, every one of them explicit', () => {
      // LEGACY-NOTE [model/service/ProductService.cfc:L52-L60]: the legacy declares EIGHT
      // properties - productDAO, skuDAO, productTypeDAO, dataService, contentService, skuService,
      // subscriptionService, optionService - of which two are DEAD.
      expect(ProductService.length).toBe(9);
    });

    it('declares a product repository port of exactly six members', () => {
      // Six members, and the port states it as a lock.
      expect(PRODUCT_REPOSITORY_MEMBERS).toHaveLength(6);

      for (const member of PRODUCT_REPOSITORY_MEMBERS) {
        expect(member in productRepository).toBe(true);
      }
      expect('saveBrand' in productRepository).toBe(false);
      expect('getAttributeSets' in productRepository).toBe(true);
      expect('getProductByProductID' in productRepository).toBe(true);
    });

    it('needs nothing but its nine collaborators to answer a call', async () => {
      await service.loadDataFromFile('file://products.csv');

      expect(productRepository.imports).toStrictEqual([
        { fileURL: 'file://products.csv', textQualifier: '' },
      ]);
    });
  });
  describe('getProductSkusBySelectedOptions - must-preserve area (iii)', () => {
    const OPTION_ONE = 'skfx-option-1';
    const OPTION_TWO = 'skfx-option-2';

    // JUDGMENT CALL: the legacy body [model/service/ProductService.cfc:L104-L106] is pure
    // delegation - one statement, no branch.
    it('forwards a multi-identifier comma list byte for byte and answers the port result', async () => {
      const matchedSkus = [
        makeSkuFixture({ skuID: 'sku-and-of-exists-a', andOfExistsMember: 'A' }),
        makeSkuFixture({ skuID: 'sku-and-of-exists-c', andOfExistsMember: 'C' }),
      ];

      skuRepository.selectedOptionsResult = matchedSkus;

      const selectedOptions = `${OPTION_ONE},${OPTION_TWO}`;
      const answered = await service.getProductSkusBySelectedOptions(
        selectedOptions,
        'product-under-selection',
      );

      // CFML parity [model/service/ProductService.cfc:L104]: `selectedOptions` stays a
      // comma-delimited string across the boundary, for signature parity.
      expect(skuRepository.selectedOptionsLookups).toStrictEqual([
        { selectedOptions: 'skfx-option-1,skfx-option-2', productID: 'product-under-selection' },
      ]);

      expect(skuRepository.selectedOptionsLookups).toHaveLength(1);

      expect(answered).toBe(matchedSkus);
      expect(answered).toHaveLength(2);
    });

    it('forwards a single-identifier list byte for byte', async () => {
      const matchedSkus = [
        makeSkuFixture({ skuID: 'sku-and-of-exists-b', andOfExistsMember: 'B' }),
      ];

      skuRepository.selectedOptionsResult = matchedSkus;

      const answered = await service.getProductSkusBySelectedOptions(OPTION_ONE, 'product-single');

      expect(skuRepository.selectedOptionsLookups).toStrictEqual([
        { selectedOptions: 'skfx-option-1', productID: 'product-single' },
      ]);
      expect(answered).toBe(matchedSkus);
    });

    it('forwards an EMPTY selection byte for byte instead of short-circuiting it', async () => {
      // The legacy body has no length guard: an empty `selectedOptions` reaches the DAO, where
      // `model/dao/SkuDAO.cfc:L110` opens with the `0 = 0` tautology and appends no `EXISTS`
      // clause.
      const everySku = [
        makeSkuFixture({ skuID: 'sku-and-of-exists-a', andOfExistsMember: 'A' }),
        makeSkuFixture({ skuID: 'sku-and-of-exists-d', andOfExistsMember: 'D' }),
      ];

      skuRepository.selectedOptionsResult = everySku;

      const answered = await service.getProductSkusBySelectedOptions('', 'product-empty-selection');

      expect(skuRepository.selectedOptionsLookups).toStrictEqual([
        { selectedOptions: '', productID: 'product-empty-selection' },
      ]);
      expect(answered).toBe(everySku);
    });

    it('answers an empty collection without inventing a fallback when nothing matches', async () => {
      skuRepository.selectedOptionsResult = [];

      const answered = await service.getProductSkusBySelectedOptions(
        `${OPTION_ONE},${OPTION_TWO}`,
        'product-with-no-match',
      );

      expect(answered).toStrictEqual([]);
      expect(skuRepository.selectedOptionsLookups).toHaveLength(1);
    });

    it('reaches the selected-options lookup and no other repository member', async () => {
      skuRepository.selectedOptionsResult = [];

      await service.getProductSkusBySelectedOptions(OPTION_ONE, 'product-isolation-check');

      expect(skuRepository.transactionProbes).toStrictEqual([]);
      expect(productRepository.searches).toStrictEqual([]);
      expect(skuCreation.requests).toStrictEqual([]);
      expect(urlTitleGenerator.requests).toStrictEqual([]);
    });
  });
  describe('getFormattedOptionGroups - the only synchronous method on the class', () => {
    it('answers one entry per option group, keyed by the group name', () => {
      const size = buildOptionGroupWithOption({
        optionGroupID: 'og-size',
        optionGroupName: 'Size',
        optionID: 'opt-large',
        optionName: 'Large',
        sortOrder: 1,
      });
      const colour = buildOptionGroupWithOption({
        optionGroupID: 'og-colour',
        optionGroupName: 'Colour',
        optionID: 'opt-red',
        optionName: 'Red',
        sortOrder: 2,
      });

      const sku = makeSkuFixture({
        skuID: 'sku-with-two-groups',
        options: [size.option, colour.option],
      });
      const product = makeProductFixture({
        productID: 'product-with-two-groups',
        optionGroups: [size.group, colour.group],
        skus: [sku],
      });

      const formatted = service.getFormattedOptionGroups(product);

      // CFML parity [model/service/ProductService.cfc:L76]: the struct key is
      // `getOptionGroupName()`, and the select projection is whatever the option collaborator
      // answers for that group's options.
      expect(formatted).toStrictEqual([
        { optionGroupName: 'Size', options: [{ name: 'Large', value: 'opt-large' }] },
        { optionGroupName: 'Colour', options: [{ name: 'Red', value: 'opt-red' }] },
      ]);

      expect(optionLoading.formattedRequests).toStrictEqual([[size.option], [colour.option]]);
    });

    it('COLLAPSES two groups whose names differ only in case, and the LAST write wins', () => {
      const upper = buildOptionGroupWithOption({
        optionGroupID: 'og-size-upper',
        optionGroupName: 'Size',
        optionID: 'opt-upper',
        optionName: 'Upper',
        sortOrder: 1,
      });
      const lower = buildOptionGroupWithOption({
        optionGroupID: 'og-size-lower',
        optionGroupName: 'size',
        optionID: 'opt-lower',
        optionName: 'Lower',
        sortOrder: 2,
      });

      const sku = makeSkuFixture({
        skuID: 'sku-with-colliding-groups',
        options: [upper.option, lower.option],
      });
      const product = makeProductFixture({
        productID: 'product-with-colliding-groups',
        optionGroups: [upper.group, lower.group],
        skus: [sku],
      });

      const formatted = service.getFormattedOptionGroups(product);

      // LEGACY-DEFECT [model/service/ProductService.cfc:L70-L80]: the result is keyed by
      // option-group name and CFML struct keys are case-insensitive, so two groups whose names
      // differ only in case collide and the last one written wins.
      // Preserved deliberately; do not fix without a product decision.
      expect(formatted).toStrictEqual([
        { optionGroupName: 'Size', options: [{ name: 'Lower', value: 'opt-lower' }] },
      ]);
      expect(formatted).toHaveLength(1);

      expect(optionLoading.formattedRequests).toStrictEqual([[upper.option], [lower.option]]);
    });

    it.each(['__proto__', 'constructor', 'toString'])(
      '★ formats an option group NAMED %s instead of dropping it silently',
      (reservedName) => {
        // CFML parity [model/service/ProductService.cfc:L71-L79]: the accumulator is a CFML
        // struct, which has no prototype chain and no reserved keys, so a group named `__proto__`
        // was an ordinary key.
        const reserved = buildOptionGroupWithOption({
          optionGroupID: 'og-reserved',
          optionGroupName: reservedName,
          optionID: 'opt-reserved',
          optionName: 'Reserved',
          sortOrder: 1,
        });
        const ordinary = buildOptionGroupWithOption({
          optionGroupID: 'og-ordinary',
          optionGroupName: 'Size',
          optionID: 'opt-ordinary',
          optionName: 'Ordinary',
          sortOrder: 2,
        });

        const sku = makeSkuFixture({
          skuID: 'sku-with-reserved-group-name',
          options: [reserved.option, ordinary.option],
        });
        const product = makeProductFixture({
          productID: 'product-with-reserved-group-name',
          optionGroups: [reserved.group, ordinary.group],
          skus: [sku],
        });

        const formatted = service.getFormattedOptionGroups(product);

        // Both groups come back, in traversal order, each carrying its own options.
        expect(formatted).toStrictEqual([
          { optionGroupName: reservedName, options: [{ name: 'Reserved', value: 'opt-reserved' }] },
          { optionGroupName: 'Size', options: [{ name: 'Ordinary', value: 'opt-ordinary' }] },
        ]);

        // And nothing leaked onto every other object in the process.
        const bystander: Record<string, unknown> = {};

        expect(Object.keys(bystander)).toHaveLength(0);
        expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'optionGroupName')).toBe(
          false,
        );
      },
    );

    it('★ keeps the case-insensitive last-write-wins collision for a reserved name too', () => {
      // The two concerns stay separate: `structFindKey` still resolves which key wins
      // (case-insensitively, first casing retained, last value retained) and `putOwnStructKey`
      // decides only how the winner is stored.
      const upper = buildOptionGroupWithOption({
        optionGroupID: 'og-proto-upper',
        optionGroupName: '__PROTO__',
        optionID: 'opt-proto-upper',
        optionName: 'Upper',
        sortOrder: 1,
      });
      const lower = buildOptionGroupWithOption({
        optionGroupID: 'og-proto-lower',
        optionGroupName: '__proto__',
        optionID: 'opt-proto-lower',
        optionName: 'Lower',
        sortOrder: 2,
      });

      const sku = makeSkuFixture({
        skuID: 'sku-with-colliding-reserved-groups',
        options: [upper.option, lower.option],
      });
      const product = makeProductFixture({
        productID: 'product-with-colliding-reserved-groups',
        optionGroups: [upper.group, lower.group],
        skus: [sku],
      });

      const formatted = service.getFormattedOptionGroups(product);

      // One entry: the FIRST casing as the key, the SECOND group's options as the value.
      expect(formatted).toStrictEqual([
        { optionGroupName: '__PROTO__', options: [{ name: 'Lower', value: 'opt-proto-lower' }] },
      ]);
      expect(optionLoading.formattedRequests).toStrictEqual([[upper.option], [lower.option]]);
    });

    it('answers an empty result for a product carrying no option groups', () => {
      // `makeProductFixture` materializes `optionGroups` as an EMPTY ARRAY rather than leaving it
      // absent, which matters: the ported entity RAISES when the association was never
      // materialized, and that distinction.
      const product = makeProductFixture({ productID: 'product-with-no-option-groups' });

      const formatted = service.getFormattedOptionGroups(product);

      expect(formatted).toStrictEqual([]);
      expect(optionLoading.formattedRequests).toStrictEqual([]);
    });

    it('mutates neither the product nor its associations', () => {
      const size = buildOptionGroupWithOption({
        optionGroupID: 'og-size',
        optionGroupName: 'Size',
        optionID: 'opt-large',
        optionName: 'Large',
        sortOrder: 1,
      });
      const sku = makeSkuFixture({ skuID: 'sku-read-only-check', options: [size.option] });
      const product = makeProductFixture({
        productID: 'product-read-only-check',
        optionGroups: [size.group],
        skus: [sku],
      });

      // CFML parity [model/service/ProductService.cfc:L71, L73, L75]: the legacy body declares its
      // accumulator, its group array and its loop counter without `var`, so all three leak into
      // the component's variables scope.
      const first = service.getFormattedOptionGroups(product);
      const second = service.getFormattedOptionGroups(product);

      expect(second).toStrictEqual(first);

      expect(second).not.toBe(first);

      expect(product.getOptionGroups()).toStrictEqual([size.group]);
      expect(product.getSkus()).toStrictEqual([sku]);
      expect(sku.getOptions()).toStrictEqual([size.option]);
    });
  });

  // The bulk path, the one legitimate declarative-schema site in `src/services/**`, and the only
  // place in this suite where the project's schema-validation dependency is exercised.
  describe('processProduct_updateSkus - declarative rules', () => {
    /**
     * A product with no SKUs, used for every schema-only case.
     *
     * The runtime loop is guarded by `if(arrayLen(skus))` [model/service/ProductService.cfc:L219],
     * so a SKU-less product isolates the declarative layer perfectly: validation still runs.
     *
     * `exactOptionalPropertyTypes` is on, so "missing" is expressed by OMITTING the key
     * throughout.
     */
    function skulessProduct(): Product {
      return makeProductFixture({ productID: 'product-with-no-skus' });
    }

    it('CASE 1 - rejects when updatePriceFlag is 1 and price is MISSING', async () => {
      const product = skulessProduct();

      const input: ProductUpdateSkusInput = { updatePriceFlag: 1 };

      const issues = await captureZodIssues(() =>
        service.processProduct_updateSkus(product, input),
      );

      expect(issues).toStrictEqual([
        {
          code: 'custom',
          message: 'price is required when updatePriceFlag equals 1',
          path: ['price'],
        },
      ]);
    });

    it('CASE 2 - accepts when updatePriceFlag is 1 and price is a numeric decimal string', async () => {
      const product = skulessProduct();
      const input: ProductUpdateSkusInput = { updatePriceFlag: 1, price: '19.99' };

      const answered = await service.processProduct_updateSkus(product, input);

      expect(answered).toBe(product);
    });

    it('CASE 3 - accepts when the flag is ABSENT and price is missing, and when it is 0', async () => {
      const product = skulessProduct();

      const withoutFlag: ProductUpdateSkusInput = {};

      expect(await service.processProduct_updateSkus(product, withoutFlag)).toBe(product);

      const withZeroFlag: ProductUpdateSkusInput = { updatePriceFlag: 0 };

      expect(await service.processProduct_updateSkus(product, withZeroFlag)).toBe(product);
    });

    it('CASE 4 - rejects when updateListPriceFlag is 1 and listPrice is MISSING', async () => {
      const product = skulessProduct();
      const input: ProductUpdateSkusInput = { updateListPriceFlag: 1 };

      const issues = await captureZodIssues(() =>
        service.processProduct_updateSkus(product, input),
      );

      expect(issues).toStrictEqual([
        {
          code: 'custom',
          message: 'listPrice is required when updateListPriceFlag equals 1',
          path: ['listPrice'],
        },
      ]);
    });

    it('CASE 5 - accepts when updateListPriceFlag is 1 and listPrice is numeric', async () => {
      const product = skulessProduct();
      const input: ProductUpdateSkusInput = { updateListPriceFlag: 1, listPrice: '9.99' };

      expect(await service.processProduct_updateSkus(product, input)).toBe(product);
    });

    it.each(['1e1000000', '1E1000000', '-1e1000000', '1.5e100000', '1e-1000000'])(
      '★ CASE 5a - rejects the AMPLIFYING numeral %s as a VALIDATION ISSUE',
      async (amplifying) => {
        // CFML numerals were IEEE-754 doubles: `isNumeric('1e1000000')` was true and the value
        // then overflowed to infinity, so the legacy could not carry it.
        const product = skulessProduct();

        const issues = await captureZodIssues(() =>
          service.processProduct_updateSkus(product, { updatePriceFlag: 1, price: amplifying }),
        );

        expect(issues).toStrictEqual([
          {
            code: 'custom',
            message: 'price must be numeric when updatePriceFlag equals 1',
            path: ['price'],
          },
        ]);
      },
    );

    it('★ CASE 5b - rejects a written-out million-digit numeral, which carries no exponent', () => {
      // The character gate rather than the exponent gate. Asserted synchronously against the
      // predicate's observable effect so the million-character string is built once and never
      // rendered.
      const millionDigits = `1${'0'.repeat(1_000_000)}`;

      return captureZodIssues(() =>
        service.processProduct_updateSkus(skulessProduct(), {
          updatePriceFlag: 1,
          price: millionDigits,
        }),
      ).then((issues) => {
        expect(issues).toStrictEqual([
          {
            code: 'custom',
            message: 'price must be numeric when updatePriceFlag equals 1',
            path: ['price'],
          },
        ]);
      });
    });

    it('★ CASE 5c - still accepts every legitimate price form, exponent notation included', async () => {
      // The bound must not narrow the legacy `dataType: "numeric"` contract for any value a CFML
      // form post or a JSON body actually delivers.
      const product = skulessProduct();

      for (const price of ['0', '19.99', '-0.01', '.5', '1e3', '1.5e2', '1e256'] as const) {
        expect(
          await service.processProduct_updateSkus(product, { updatePriceFlag: 1, price }),
        ).toBe(product);
      }

      expect(
        await service.processProduct_updateSkus(product, { updatePriceFlag: 1, price: 19.99 }),
      ).toBe(product);

      // And the exponent boundary is asserted on both sides rather than described.
      const overBound = await captureZodIssues(() =>
        service.processProduct_updateSkus(product, { updatePriceFlag: 1, price: '1e257' }),
      );

      expect(overBound.map((issue: CapturedIssue) => issue.message)).toStrictEqual([
        'price must be numeric when updatePriceFlag equals 1',
      ]);
    });

    it('CASE 6 - rejects a NON-NUMERIC price for a DIFFERENT, provable reason', async () => {
      const product = skulessProduct();

      const missingPriceIssues = await captureZodIssues(() =>
        service.processProduct_updateSkus(product, { updatePriceFlag: 1 }),
      );
      const nonNumericIssues = await captureZodIssues(() =>
        service.processProduct_updateSkus(product, { updatePriceFlag: 1, price: 'abc' }),
      );

      expect(nonNumericIssues).toStrictEqual([
        {
          code: 'custom',
          message: 'price must be numeric when updatePriceFlag equals 1',
          path: ['price'],
        },
      ]);

      const missingMessages = missingPriceIssues.map((issue: CapturedIssue) => issue.message);
      const nonNumericMessages = nonNumericIssues.map((issue: CapturedIssue) => issue.message);

      expect(nonNumericMessages).not.toStrictEqual(missingMessages);

      expect(missingPriceIssues.map((issue: CapturedIssue) => issue.path)).toStrictEqual([
        ['price'],
      ]);
      expect(nonNumericIssues.map((issue: CapturedIssue) => issue.path)).toStrictEqual([['price']]);
    });

    it('ACTIVATION - numeric 1 fires the condition', async () => {
      // CFML parity `model/validation/Product_UpdateSkus.json`: the condition compares `eq 1`, and
      // CFML equality is LOOSE, so the activation set is wider than a strict `` would admit -
      // numeric 1 and the string '1' both activate it, and so does boolean `true`.
      const issues = await captureZodIssues(() =>
        service.processProduct_updateSkus(skulessProduct(), { updatePriceFlag: 1 }),
      );

      expect(issues).toHaveLength(1);
    });

    it("ACTIVATION - the string '1' fires the condition", async () => {
      const issues = await captureZodIssues(() =>
        service.processProduct_updateSkus(skulessProduct(), { updatePriceFlag: '1' }),
      );

      expect(issues).toHaveLength(1);
    });

    it('ACTIVATION - boolean true FIRES the condition, because CFML converts it to 1', async () => {
      const issues = await captureZodIssues(() =>
        service.processProduct_updateSkus(skulessProduct(), { updatePriceFlag: true }),
      );

      expect(issues).toStrictEqual([
        {
          code: 'custom',
          message: 'price is required when updatePriceFlag equals 1',
          path: ['price'],
        },
      ]);
    });

    it("ACTIVATION - the string 'true' does NOT fire the condition", async () => {
      const product = skulessProduct();

      expect(await service.processProduct_updateSkus(product, { updatePriceFlag: 'true' })).toBe(
        product,
      );
    });

    it('preserves both SKU resource-bundle keys verbatim and resolves neither', async () => {
      const product = skulessProduct();

      const priceIssues = await captureZodIssues(() =>
        service.processProduct_updateSkus(product, { updatePriceFlag: 1 }),
      );
      const listPriceIssues = await captureZodIssues(() =>
        service.processProduct_updateSkus(product, { updateListPriceFlag: 1 }),
      );

      expect(SKU_PRICE_RB_KEY).toBe('entity.sku.price');
      expect(SKU_LIST_PRICE_RB_KEY).toBe('entity.sku.listPrice');

      expect(priceIssues.map((issue: CapturedIssue) => issue.path)).toStrictEqual([
        [rbKeyPropertyIdentifier(SKU_PRICE_RB_KEY)],
      ]);
      expect(listPriceIssues.map((issue: CapturedIssue) => issue.path)).toStrictEqual([
        [rbKeyPropertyIdentifier(SKU_LIST_PRICE_RB_KEY)],
      ]);

      for (const issue of [...priceIssues, ...listPriceIssues]) {
        expect(issue.message).not.toContain(SKU_PRICE_RB_KEY);
        expect(issue.message).not.toContain(SKU_LIST_PRICE_RB_KEY);
        expect(issue.message).not.toContain('entity.sku.');
      }
    });
  });
  describe('processProduct_updateSkus - runtime branches', () => {
    /**
     * Builds a product carrying two SKUs at the fixture's default prices.
     */
    function productWithTwoSkus(): { product: Product; first: Sku; second: Sku } {
      const first = makeSkuFixture({ skuID: 'sku-price-update-first' });
      const second = makeSkuFixture({ skuID: 'sku-price-update-second' });
      const product = makeProductFixture({
        productID: 'product-with-two-skus',
        skus: [first, second],
      });

      return { product, first, second };
    }

    it('requires BOTH flags to be present once the product carries a SKU', async () => {
      const { product, first } = productWithTwoSkus();

      // CFML parity [model/service/ProductService.cfc:L222, L226]: the two branches are SEQUENTIAL
      // and UNGUARDED, so the second flag is tested even when the first did all the work.
      const rejected = service.processProduct_updateSkus(product, {
        updatePriceFlag: 1,
        price: '7.25',
      });

      await expect(rejected).rejects.toBeInstanceOf(CfmlBooleanConversionError);

      // And the failure is genuinely mid-flight rather than pre-emptive: the price half of the
      // FIRST SKU was already applied before the list-price branch of that same iteration raised.
      expect(first.getPrice().toFixed2()).toBe('7.25');

      // And nothing reached a row.
      expect(skuRepository.savedSkus).toStrictEqual([]);
    });

    it('applies the price to EVERY SKU on the product', async () => {
      const { product, first, second } = productWithTwoSkus();

      const answered = await service.processProduct_updateSkus(product, {
        updatePriceFlag: 1,
        price: '7.25',
        updateListPriceFlag: 0,
      });

      // CFML parity [model/service/ProductService.cfc:L218-L231]: one loop over the LIVE
      // association array, applying the same value to every member.
      //
      // Every monetary expectation here is a decimal STRING compared through the money value
      // object.
      expect(first.getPrice().equals(Money.fromDecimalString('7.25'))).toBe(true);
      expect(second.getPrice().equals(Money.fromDecimalString('7.25'))).toBe(true);
      expect(first.getPrice().toFixed2()).toBe('7.25');

      expect(second.getListPrice().toFixed2()).toBe('24.99');

      expect(answered).toBe(product);
    });

    it('applies both prices when both flags are set, and neither when neither is', async () => {
      const both = productWithTwoSkus();

      await service.processProduct_updateSkus(both.product, {
        updatePriceFlag: 1,
        price: '5.00',
        updateListPriceFlag: 1,
        listPrice: '11.50',
      });

      expect(both.first.getPrice().toFixed2()).toBe('5.00');
      expect(both.first.getListPrice().toFixed2()).toBe('11.50');

      const neither = productWithTwoSkus();

      await service.processProduct_updateSkus(neither.product, {
        updatePriceFlag: 0,
        updateListPriceFlag: 0,
      });

      expect(neither.first.getPrice().toFixed2()).toBe('19.99');
      expect(neither.first.getListPrice().toFixed2()).toBe('24.99');
    });

    it('persists what it mutated, and saves no PRODUCT of its own', async () => {
      const { product, first, second } = productWithTwoSkus();

      await service.processProduct_updateSkus(product, {
        updatePriceFlag: 1,
        price: '4.00',
        updateListPriceFlag: 0,
      });

      // What survives unchanged, and it is the half worth keeping: this method saves no product.
      expect(productRepository.saves).toStrictEqual([]);

      // One WRITE per MUTATED SKU, in COLLECTION ORDER. `SkuRepository` declares a single
      // persistence member and it takes one entity, so the write set is issued as a sequence
      // rather than a batch.
      expect(skuRepository.savedSkus).toStrictEqual([first, second]);

      // And the in-memory mutation still happened, on the instances that were written.
      expect(first.getPrice().toFixed2()).toBe('4.00');
    });

    it('rejects BEFORE mutating anything when the declarative rule fails', async () => {
      const { product, first } = productWithTwoSkus();

      const issues = await captureZodIssues(() =>
        service.processProduct_updateSkus(product, { updatePriceFlag: 1 }),
      );

      expect(issues).toHaveLength(1);

      expect(first.getPrice().toFixed2()).toBe('19.99');
      expect(first.getListPrice().toFixed2()).toBe('24.99');
    });

    it('ASYMMETRY - a flag of 2 is NOT required to carry a price, yet the runtime APPLIES one', async () => {
      // LEGACY-DEFECT [model/service/ProductService.cfc:L222, L226]: the runtime branches test the
      // flags with bare CFML truthiness, while model/validation/Product_UpdateSkus.json compares
      // against `eq 1` so the two predicates disagree for some inputs.
      // Preserved deliberately; do not fix without a product decision.
      const validationOnly = makeProductFixture({ productID: 'product-with-no-skus' });

      expect(await service.processProduct_updateSkus(validationOnly, { updatePriceFlag: 2 })).toBe(
        validationOnly,
      );

      const { product, first } = productWithTwoSkus();

      await service.processProduct_updateSkus(product, {
        updatePriceFlag: 2,
        price: '3.50',
        updateListPriceFlag: 0,
      });

      expect(first.getPrice().toFixed2()).toBe('3.50');
    });

    it('ASYMMETRY - a flag of 2 with no price passes validation and then FAILS at the branch', async () => {
      const { product, first } = productWithTwoSkus();

      const rejected = service.processProduct_updateSkus(product, { updatePriceFlag: 2 });

      await expect(rejected).rejects.toThrow(/model\/service\/ProductService\.cfc:L222/);
      await expect(rejected).rejects.toThrow(/model\/validation\/Product_UpdateSkus\.json/);

      await expect(rejected).rejects.not.toBeInstanceOf(ZodError);

      expect(first.getPrice().toFixed2()).toBe('19.99');
    });

    it("ASYMMETRY - the string 'true' is truthy at run time yet never satisfies eq 1", async () => {
      const { product } = productWithTwoSkus();

      // The second of the two values the project names as disagreeing. `'true'` is truthy under
      // CFML's boolean conversion but is not a number, so it cannot equal.
      await expect(
        service.processProduct_updateSkus(product, {
          updatePriceFlag: 0,
          updateListPriceFlag: 'true',
        }),
      ).rejects.toThrow(/model\/service\/ProductService\.cfc:L226/);
    });

    it('ASYMMETRY - an ABSENT flag passes validation and raises the CFML conversion error', async () => {
      const { product, first } = productWithTwoSkus();

      // CFML parity [model/service/ProductService.cfc:L222]: `if(null)` is a CONVERSION ERROR in
      // CFML, not a falsy branch, so a process object that never carried the flag fails at the
      // test rather than skipping it.
      const rejected = service.processProduct_updateSkus(product, {});

      await expect(rejected).rejects.toBeInstanceOf(CfmlBooleanConversionError);

      expect(first.getPrice().toFixed2()).toBe('19.99');

      const skuless = makeProductFixture({ productID: 'product-with-no-skus' });

      expect(await service.processProduct_updateSkus(skuless, {})).toBe(skuless);
    });
  });

  // ProcessProduct_updateSkus - the flush, written down.

  describe('processProduct_updateSkus - the batch write that replaces the ORM flush', () => {
    /**
     * A product carrying three distinguishable SKUs at the fixture's default prices.
     */
    function productWithThreeSkus(): { product: Product; skus: readonly Sku[] } {
      const skus = [
        makeSkuFixture({ skuID: 'sku-batch-first' }),
        makeSkuFixture({ skuID: 'sku-batch-second' }),
        makeSkuFixture({ skuID: 'sku-batch-third' }),
      ];

      return {
        product: makeProductFixture({ productID: 'product-batch-write', skus }),
        skus,
      };
    }

    /**
     * A product whose SKU collection is `count` references to one fixture.
     */
    function productWithSkuCount(count: number): Product {
      const shared = makeSkuFixture({ skuID: 'sku-counted' });

      return makeProductFixture({
        productID: 'product-at-the-bound',
        skus: Array.from({ length: count }, (): Sku => shared),
      });
    }

    /**
     * The default bound, restated here so a change to the constant fails this suite.
     */
    const DEFAULT_UPDATE_BOUND = 1000;

    /**
     * A service whose update bound is `bound`, every other collaborator shared.
     */
    function serviceBoundedAt(bound: number): ProductService {
      return new ProductService(
        productRepository,
        skuRepository,
        productTypeRepository,
        urlTitleGenerator,
        imageStore,
        subscriptionTermProvider,
        skuCreation,
        optionLoading,
        skuBatchWrite,
        bound,
      );
    }

    it('writes EVERY mutated SKU in exactly ONE unit of work, never one per SKU', async () => {
      const { product, skus } = productWithThreeSkus();

      await service.processProduct_updateSkus(product, {
        updatePriceFlag: 1,
        price: '8.40',
        updateListPriceFlag: 1,
        listPrice: '15.00',
      });
      expect(skuBatchWrite.batches).toHaveLength(1);
      expect(skuBatchWrite.batches[0]).toStrictEqual([skus[0], skus[1], skus[2]]);

      // And the rows that unit carried, in collection order and with no repetition. Unchanged.
      expect(skuRepository.savedSkus).toStrictEqual([skus[0], skus[1], skus[2]]);
    });

    it('★★★ NAMES THE PARENT PRODUCT, so no write can erase SwSku.productID', async () => {
      // THE REGRESSION TEST FOR A CRITICAL DATA-LOSS FINDING. `saveMutatedSkus` used to take
      // the SKU set ALONE, and the composition root satisfied it by handing the adapter NOTHING for
      // its parent-key override - which made the adapter fall back to
      // `sku.getProduct()?.getProductID()`, an association the read behind this path
      // (`SkuRepository.getProductSkus`) does not materialize. `SwSku.productID` was therefore
      // written as SQL NULL: one call orphaned FOUR OF FIVE SKU rows on the measured product, after
      // which every identity-addressed price operation answered `skuNotFound`, the Google product
      // feed fell from four items to zero, and the product's sale-price details were lost.
      //
      // The key is now a REQUIRED first parameter, so the call that caused it no longer type-checks,
      // and this case pins the value: the identifier of the product the service was handed, which is
      // by definition the parent of every SKU in its own collection.
      const { product } = productWithThreeSkus();

      await service.processProduct_updateSkus(product, {
        updatePriceFlag: 1,
        price: '8.40',
        updateListPriceFlag: 1,
        listPrice: '15.00',
      });

      expect(skuBatchWrite.parentProductIDs).toStrictEqual(['product-batch-write']);
      expect(product.getProductID()).toBe('product-batch-write');
    });

    it('★★ writes NOTHING for a TRANSIENT product, because the aggregate write owns its SKUs', async () => {
      // A product with no persisted key has no row for a SKU to name, and `SwSku.productID` naming
      // nothing is exactly the state the finding above produced - so the write is not attempted.
      // Nothing is lost: `Product.skus` declares `cascade="all-delete-orphan"`
      // [model/entity/Product.cfc:L73], so `ProductRepository.saveProduct` inserts a transient
      // product's SKUs after the parent row exists. Every ROUTED operation loads its product by
      // identifier first, so this branch is unreachable from the API.
      const skus = [makeSkuFixture({ skuID: 'sku-transient-parent' })];
      const transient = makeProductFixture({ productID: '', skus });

      expect(transient.isNew()).toBe(true);

      await service.processProduct_updateSkus(transient, {
        updatePriceFlag: 1,
        price: '8.40',
        updateListPriceFlag: 0,
      });

      expect(skuBatchWrite.batches).toStrictEqual([]);
      expect(skuBatchWrite.parentProductIDs).toStrictEqual([]);
      expect(skuRepository.savedSkus).toStrictEqual([]);

      // The in-memory mutation still happened - it is the aggregate write's to persist.
      expect(skus[0]?.getPrice().toFixed2()).toBe('8.40');
    });

    it('★★★ ATOMICITY - a PERMANENT failure inside the unit of work persists NOTHING (F3)', async () => {
      // THE CASE THE PER-SKU LOOP COULD NOT PASS, AND THE REASON THIS COLLABORATOR EXISTS.
      // A loop over `saveSku` opened one unit of work per SKU, so a failure on the sixth of ten
      // left one to five durably repriced.
      const { product, skus } = productWithThreeSkus();
      const permanentFailure = new Error('a constraint this row violates on every attempt');

      skuBatchWrite.failure = permanentFailure;

      await expect(
        service.processProduct_updateSkus(product, {
          updatePriceFlag: 1,
          price: '4.10',
          updateListPriceFlag: 0,
        }),
      ).rejects.toBe(permanentFailure);

      // The unit of work was attempted, whole - so this is not passing because the write was
      // skipped.
      expect(skuBatchWrite.batches).toHaveLength(1);
      expect(skuBatchWrite.batches[0]).toHaveLength(3);

      // And not one ROW was PERSISTED. No partial application survives, which is what a rollback
      // buys and what the per-SKU loop could not offer.
      expect(skuRepository.savedSkus).toStrictEqual([]);

      // The caller's own objects do carry the mutation, which is faithful: the legacy's in-memory
      // entities were mutated before the flush too, and a failed flush left them that way.
      for (const sku of skus) {
        expect(sku?.getPrice().toFixed2()).toBe('4.10');
      }
    });

    it('★★ RETRY AFTER A TRANSIENT FAILURE CONVERGES, and converges in ONE unit of work', async () => {
      // Idempotency is still load-bearing and is still asserted - it is what makes a retry SAFE.
      // What changed is that the retry now has only two states to converge from rather than three.
      const { product, skus } = productWithThreeSkus();
      const input = { updatePriceFlag: 1, price: '5.55', updateListPriceFlag: 0 } as const;

      skuBatchWrite.failure = new Error('a transient failure: the pool was momentarily exhausted');

      await expect(service.processProduct_updateSkus(product, input)).rejects.toThrow(
        /transient failure/,
      );
      expect(skuRepository.savedSkus).toStrictEqual([]);

      // The retry, with the fault cleared and the same input.
      skuBatchWrite.failure = undefined;

      await service.processProduct_updateSkus(product, input);

      // One further unit of work - two attempted in total - and the whole set persisted once.
      expect(skuBatchWrite.batches).toHaveLength(2);
      expect(skuRepository.savedSkus).toStrictEqual([skus[0], skus[1], skus[2]]);

      for (const sku of skus) {
        expect(sku?.getPrice().toFixed2()).toBe('5.55');
      }
    });

    it('collects a SKU touched by BOTH branches exactly ONCE', async () => {
      const { product, skus } = productWithThreeSkus();

      await service.processProduct_updateSkus(product, {
        updatePriceFlag: 1,
        price: '3.00',
        updateListPriceFlag: 1,
        listPrice: '9.00',
      });

      // The write set is a WRITE SET, not a change log: a SKU whose price and list price both
      // moved is one row to update, not two - so three SKUs touched by two branches are still
      // three writes, not six.
      expect(skuRepository.savedSkus).toHaveLength(3);
      expect(skus[0]?.getPrice().toFixed2()).toBe('3.00');
      expect(skus[0]?.getListPrice().toFixed2()).toBe('9.00');
    });

    it('hands over instances that ALREADY carry the new prices, so the write follows the mutation', async () => {
      const { product } = productWithThreeSkus();
      await service.processProduct_updateSkus(product, {
        updatePriceFlag: 1,
        price: '6.75',
        updateListPriceFlag: 0,
      });

      const written = skuRepository.savedSkus;

      expect(written).toHaveLength(3);

      for (const sku of written) {
        expect(sku.getPrice().toFixed2()).toBe('6.75');
      }
    });

    it('writes NOTHING when both flags are falsy, matching a session that dirtied no entity', async () => {
      const { product, skus } = productWithThreeSkus();

      await service.processProduct_updateSkus(product, {
        updatePriceFlag: 0,
        updateListPriceFlag: 0,
      });

      // No ROW WRITTEN, which is what this case is for: a no-op must not rewrite every row with
      // its own current values. The assertion has now been through three shapes and the INTENT has
      // never changed.
      expect(skuBatchWrite.batches).toStrictEqual([[]]);
      expect(skuRepository.savedSkus).toStrictEqual([]);
      expect(skus[0]?.getPrice().toFixed2()).toBe('19.99');

      // And no transaction is opened for it.
    });

    it('writes an EMPTY set for a product with no SKUs at all', async () => {
      const skuless = makeProductFixture({ productID: 'product-with-no-skus' });

      const answered = await service.processProduct_updateSkus(skuless, {
        updatePriceFlag: 1,
        price: '2.00',
        updateListPriceFlag: 0,
      });
      expect(skuBatchWrite.batches).toStrictEqual([[]]);
      expect(skuRepository.savedSkus).toStrictEqual([]);
      expect(answered).toBe(skuless);
    });

    it('IDEMPOTENCY - the same call twice produces the same write set carrying the same values', async () => {
      const { product, skus } = productWithThreeSkus();

      const input = {
        updatePriceFlag: 1,
        price: '11.25',
        updateListPriceFlag: 0,
      };

      await service.processProduct_updateSkus(product, input);
      await service.processProduct_updateSkus(product, input);

      // This is now the obligation that carries the recovery story, not merely one of three.
      expect(skuRepository.savedSkus).toStrictEqual([
        skus[0],
        skus[1],
        skus[2],
        skus[0],
        skus[1],
        skus[2],
      ]);
      expect(skus[2]?.getPrice().toFixed2()).toBe('11.25');
    });

    it('admits a product at exactly the default bound of one thousand', async () => {
      const atTheBound = productWithSkuCount(DEFAULT_UPDATE_BOUND);

      await service.processProduct_updateSkus(atTheBound, {
        updatePriceFlag: 1,
        price: '1.00',
        updateListPriceFlag: 0,
      });

      // The comparison is `>` and not `>=`, so the bound itself is admitted. Asserting the
      // boundary in both directions is what makes the off-by-one visible.
      expect(skuRepository.savedSkus).toHaveLength(DEFAULT_UPDATE_BOUND);
    });

    it('REFUSES one SKU past the default bound, before mutating and before writing', async () => {
      const overTheBound = productWithSkuCount(DEFAULT_UPDATE_BOUND + 1);

      const rejected = service.processProduct_updateSkus(overTheBound, {
        updatePriceFlag: 1,
        price: '1.00',
        updateListPriceFlag: 0,
      });

      await expect(rejected).rejects.toThrow(/above the configured bound of 1000/);

      // The refusal names the product and cites the legacy loop it is bounding, so it is
      // actionable from the message alone rather than needing a stack trace.
      await expect(rejected).rejects.toThrow(/product 'product-at-the-bound'/);
      await expect(rejected).rejects.toThrow(/\[model\/service\/ProductService\.cfc:L218-L230\]/);

      // Nothing was mutated and nothing was written.
      expect(skuRepository.savedSkus).toStrictEqual([]);
      expect(overTheBound.getSkus()[0]?.getPrice().toFixed2()).toBe('19.99');
    });

    it('honours a CONFIGURED bound in both directions', async () => {
      const boundedAtTwo = serviceBoundedAt(2);
      const twoSkus = productWithSkuCount(2);

      await boundedAtTwo.processProduct_updateSkus(twoSkus, {
        updatePriceFlag: 1,
        price: '4.50',
        updateListPriceFlag: 0,
      });

      expect(skuRepository.savedSkus).toHaveLength(2);

      const threeSkus = productWithSkuCount(3);

      await expect(
        boundedAtTwo.processProduct_updateSkus(threeSkus, {
          updatePriceFlag: 1,
          price: '4.50',
          updateListPriceFlag: 0,
        }),
      ).rejects.toThrow(/above the configured bound of 2/);

      // Still exactly the two writes the successful call issued - the refusal added nothing, which
      // is what "before mutating and before writing" means.
      expect(skuRepository.savedSkus).toHaveLength(2);
    });

    it('★★★ does NOT refuse a source-required NO-OP, however many SKUs the product carries', async () => {
      const boundedAtOne = serviceBoundedAt(1);
      const twoSkus = productWithSkuCount(2);

      // This case asserted the opposite, and the opposite was a defect.
      //
      // The bound still exists and still protects the same thing; it now measures the work the
      // call WOULD do rather than the size of the collection it was pointed at.
      const answered = await boundedAtOne.processProduct_updateSkus(twoSkus, {
        updatePriceFlag: 0,
        updateListPriceFlag: 0,
      });

      // CFML parity [model/service/ProductService.cfc:L232]: the product comes back, untouched.
      expect(answered).toBe(twoSkus);
      expect(skuRepository.savedSkus).toStrictEqual([]);
    });

    it('★ still refuses the SAME product once a flag asks for the work', async () => {
      // The other side of the correction: the bound is not weakened, only re-aimed. The identical
      // over-large product is refused the moment the call actually asks to reprice it.
      const boundedAtOne = serviceBoundedAt(1);
      const twoSkus = productWithSkuCount(2);

      await expect(
        boundedAtOne.processProduct_updateSkus(twoSkus, {
          updatePriceFlag: 1,
          price: '4.50',
          updateListPriceFlag: 0,
        }),
      ).rejects.toThrow(/would reprice 2 SKUs, above the configured bound of 1/);

      expect(skuRepository.savedSkus).toStrictEqual([]);
    });

    it('★ an UNCONVERTIBLE flag is left for the loop to reject, not pre-empted by the bound', async () => {
      // The bound's probe is deliberately non-raising and answers `false` for a value no CFML
      // engine would accept - so the bound stands aside and `cfTruthy` rejects it INSIDE the loop.
      const boundedAtOne = serviceBoundedAt(1);
      const twoSkus = productWithSkuCount(2);

      await expect(
        boundedAtOne.processProduct_updateSkus(twoSkus, {
          updatePriceFlag: 'not-a-boolean',
          updateListPriceFlag: 0,
        }),
      ).rejects.toBeInstanceOf(CfmlBooleanConversionError);

      expect(skuRepository.savedSkus).toStrictEqual([]);
    });

    it('validates the declarative rules BEFORE the bound, so a malformed request fails as validation', async () => {
      const boundedAtOne = serviceBoundedAt(1);
      const twoSkus = productWithSkuCount(2);

      // Both gates would refuse this input.
      const issues = await captureZodIssues(() =>
        boundedAtOne.processProduct_updateSkus(twoSkus, { updatePriceFlag: 1 }),
      );

      expect(issues).toHaveLength(1);
      expect(skuRepository.savedSkus).toStrictEqual([]);
    });

    it('REFUSES A NONSENSE BOUND AT CONSTRUCTION, not on the first call that hits it', () => {
      // A misconfigured composition root should fail when it is wired. Clamping would hide exactly
      // the mistake this check exists to surface, so every one of these is rejected rather than
      // corrected.
      for (const nonsense of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => serviceBoundedAt(nonsense)).toThrow(
          /maximumSkuUpdateBatchSize must be a positive safe integer/,
        );
      }

      // And a legitimate bound constructs, so the guard is not simply rejecting everything.
      expect(serviceBoundedAt(1)).toBeInstanceOf(ProductService);
      expect(serviceBoundedAt(DEFAULT_UPDATE_BOUND)).toBeInstanceOf(ProductService);
    });

    it('keeps `ProductService.length` at 9, because the bound is DEFAULTED and not optional', async () => {
      // The nine-collaborator claim in the constructor-wiring block above must stay literally
      // checkable.
      expect(ProductService.length).toBe(9);

      // And the default value is pinned, not merely present.
      await expect(
        service.processProduct_updateSkus(productWithSkuCount(DEFAULT_UPDATE_BOUND + 1), {
          updatePriceFlag: 1,
          price: '1.00',
          updateListPriceFlag: 0,
        }),
      ).rejects.toThrow(`above the configured bound of ${String(DEFAULT_UPDATE_BOUND)}`);
    });
  });

  // LEGACY-NOTE [meta/tests/unit/IssuesTest.cfc:L73-L89, L91-L99]: issue_1296 guards its single
  // assertion behind a record-count condition, so it passes vacuously on an empty database, and
  // issue_1329 contains no assertion at all.
  describe('findProducts - the territory the two excluded legacy tests left uncovered', () => {
    it('asserts UNCONDITIONALLY on a result set of fewer than two records', async () => {
      const onlyProduct = matchRow('product-alpha');

      productRepository.searchResult = [onlyProduct];

      const page = await service.findProducts({ keyword: REQUIRED_KEYWORD });

      expect(page.records).toStrictEqual([onlyProduct]);
      expect(page.recordsCount).toBe(1);
      expect(page.pageRecordsStart).toBe(0);
    });

    it('asserts UNCONDITIONALLY on an EMPTY result set, page shape included', async () => {
      productRepository.searchResult = [];

      const page = await service.findProducts({ keyword: REQUIRED_KEYWORD });

      expect(page.records).toStrictEqual([]);
      expect(page.recordsCount).toBe(0);
      expect(page.entityName).toBe('SlatwallProduct');
      // The two metadata members report the EXECUTED statement, which joins nothing and matches
      // one property.
      expect(page.joins).toHaveLength(0);
      expect(page.keywordProperties).toHaveLength(1);
    });
  });
  describe('findProducts - signature reshaping #2', () => {
    // JUDGMENT CALL: legacy `getProductSmartList` [model/service/ProductService.cfc:L342-L358]
    // built a HibachiSmartList, a generic string-keyed dynamic query builder supplied by the
    // framework.
    it('takes a TYPED criteria object and answers a TYPED page', async () => {
      const alpha = matchRow('product-alpha');
      const beta = matchRow('product-beta');
      const gamma = matchRow('product-gamma');

      productRepository.searchResult = [alpha, beta, gamma];

      const criteria: ProductQueryCriteria = {
        keyword: 'nike',
        productTypeIDs: 'product-type-one,product-type-two',
        pageRecordsStart: 1,
        pageRecordsShow: 1,
        currentURL: '/listing?page=2',
      };

      const page: ProductPage = await service.findProducts(criteria);

      // The plural parameter survives. `model/dao/ProductDAO.cfc:L419` declares `productTypeIDs`
      // while the SKU-side sibling declares the singular `productTypeID`.
      expect(productRepository.searches).toStrictEqual([
        {
          term: 'nike',
          productTypeIDs: 'product-type-one,product-type-two',
          window: { start: 1, count: 1 },
        },
      ]);

      expect(page.records).toStrictEqual([beta]);
      expect(page.recordsCount).toBe(3);
      expect(page.pageRecordsStart).toBe(1);
      expect(page.pageRecordsShow).toBe(1);

      expect(productRepository.searches).toHaveLength(1);
    });

    it('★★ reports NO joins, because the executed statement performs none', async () => {
      productRepository.searchResult = [];

      const page = await service.findProducts({ keyword: REQUIRED_KEYWORD });

      // This case is an inversion.
      //
      // All of that is true of the SMART LIST, and the smart list is not what runs.
      //
      // So under the statement that runs there is no inner join to drop anything: an unbranded
      // product is returned, and so is one with no product type or no default SKU.
      expect(page.joins).toStrictEqual([]);
      expect(page.joins).toHaveLength(0);

      // The MEMBER REMAINS, deliberately: "this query joins nothing" is precisely what tells a
      // caller that an unbranded product is not filtered out. Deleting it would leave that unsaid.
      expect(Object.keys(page)).toContain('joins');
      expect(Array.isArray(page.joins)).toBe(true);
    });

    it('★★ reports the ONE keyword property the executed statement matches, at weight 1', async () => {
      productRepository.searchResult = [];

      const page = await service.findProducts({ keyword: REQUIRED_KEYWORD });

      // The other half of the inversion. This case was named "preserves the five concrete legacy
      // keyword properties, all at weight 1" and asserted all five identifiers from
      // [model/service/ProductService.cfc:L351-L355].
      expect(page.keywordProperties).toStrictEqual([
        { propertyIdentifier: 'productName', weight: 1 },
      ]);
      expect(page.keywordProperties).toHaveLength(1);

      // Weight 1 still holds. The legacy assigned no relative weighting anywhere on this path, and
      // the narrowing invents none: with one property there is nothing to rank.
      for (const keywordProperty of page.keywordProperties) {
        expect(keywordProperty.weight).toBe(1);
      }

      // None of the four the smart list additionally configured is reported.
      const reported = page.keywordProperties.map((property) => property.propertyIdentifier);

      for (const unmatched of [
        'calculatedTitle',
        'brand.brandName',
        'productCode',
        'productType.productTypeName',
      ]) {
        expect(reported).not.toContain(unmatched);
      }
    });

    it('defaults the page window without inventing a page size', async () => {
      const alpha = matchRow('product-alpha');
      const beta = matchRow('product-beta');

      productRepository.searchResult = [alpha, beta];

      const page = await service.findProducts({ keyword: REQUIRED_KEYWORD });

      expect(page.pageRecordsStart).toBe(0);
      expect(page.pageRecordsShow).toBeUndefined();
      expect(page.records).toStrictEqual([alpha, beta]);
    });

    it('forwards an ABSENT product-type filter as absent, and always binds the keyword', async () => {
      productRepository.searchResult = [];

      await service.findProducts({ keyword: REQUIRED_KEYWORD });

      // This case once passed `{}` and asserted `{ term: undefined, productTypeIDs: undefined }`,
      // on the reasoning that "Both repository arguments are optional on the port.
      expect(productRepository.searches).toStrictEqual([
        { term: REQUIRED_KEYWORD, productTypeIDs: undefined, window: undefined },
      ]);
    });

    it('★ will not COMPILE a criteria object with no keyword, which is the correction', async () => {
      // net-new coverage, declared as such per AAP 0.6.6.
      //
      // The alignment is the fix, so it is pinned where it lives - in the type system. Case cannot
      // silently rot into a no-op the way a commented-out assertion would.
      // `@ts-expect-error` fails the build if the error ever stops being reported, so this
      productRepository.searchResult = [];

      await expect(
        // Is refused by the sole adapter at [model/dao/ProductDAO.cfc:L422], so the compiler
        // refuses it here first.
        // @ts-expect-error - `keyword` is required on ProductQueryCriteria; an absent term
        // is refused by the sole adapter at [model/dao/ProductDAO.cfc:L422], so the compiler
        // refuses it here first.
        service.findProducts({ productTypeIDs: 'product-type-one' }),
      ).resolves.toMatchObject({ recordsCount: 0 });

      // And the call still REACHED the port, so the assertion above is about the type and not
      // about a call that failed to happen.
      expect(productRepository.searches).toStrictEqual([
        { term: undefined, productTypeIDs: 'product-type-one', window: undefined },
      ]);
    });
  });

  // That choice is a correctness fix as much as a resource one, and the `slice(-1)` case below is
  // the evidence: paging is applied with `Array.prototype.slice`, which reads a negative start as
  // an offset from the end.
  describe('findProducts - the paging shape check', () => {
    /**
     * Three matched rows, so a wrong window is DISTINGUISHABLE from a right one.
     */
    function threeProducts(): readonly ProductSearchRow[] {
      const alpha = matchRow('product-alpha');
      const beta = matchRow('product-beta');
      const gamma = matchRow('product-gamma');

      productRepository.searchResult = [alpha, beta, gamma];

      return [alpha, beta, gamma];
    }

    it('★★ refuses a NEGATIVE start, which slice would have read as an offset from the END', async () => {
      const [, , gamma] = threeProducts();

      await expect(
        service.findProducts({ keyword: REQUIRED_KEYWORD, pageRecordsStart: -1 }),
      ).rejects.toThrow(ProductPagingCriteriaError);
      expect(productRepository.searchResult.slice(-1)).toStrictEqual([gamma]);
    });

    it('refuses the malformed bound BEFORE the search runs, so it costs no statement', async () => {
      threeProducts();

      await expect(
        service.findProducts({ keyword: REQUIRED_KEYWORD, pageRecordsStart: -1 }),
      ).rejects.toThrow(ProductPagingCriteriaError);
      expect(productRepository.searches).toStrictEqual([]);
    });

    it('refuses a FRACTIONAL bound, which slice would have truncated', async () => {
      threeProducts();

      // `slice(1.5)` truncates to `slice(1)` rather than raising, so a fractional start is a page
      // the caller did not describe answered as though they had.
      await expect(
        service.findProducts({ keyword: REQUIRED_KEYWORD, pageRecordsStart: 1.5 }),
      ).rejects.toThrow(/'pageRecordsStart' was supplied as 1\.5/u);

      await expect(
        service.findProducts({ keyword: REQUIRED_KEYWORD, pageRecordsShow: 0.5 }),
      ).rejects.toThrow(/'pageRecordsShow' was supplied as 0\.5/u);
    });

    it('refuses NaN and both infinities, on both members', async () => {
      threeProducts();

      for (const member of ['pageRecordsStart', 'pageRecordsShow'] as const) {
        for (const supplied of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
          // `Number.isSafeInteger` rejects all three in one predicate, which is why the shipped
          // check is two conditions rather than five.
          await expect(
            service.findProducts({ keyword: REQUIRED_KEYWORD, [member]: supplied }),
          ).rejects.toThrow(ProductPagingCriteriaError);
        }
      }

      expect(productRepository.searches).toStrictEqual([]);
    });

    it('reports WHICH member was rejected and WHAT was supplied, and nothing else', async () => {
      threeProducts();

      const raised = await service
        .findProducts({ keyword: REQUIRED_KEYWORD, pageRecordsShow: -7 })
        .then(
          () => undefined,
          (error: unknown) => error,
        );

      expect(raised).toBeInstanceOf(ProductPagingCriteriaError);

      const error = raised as ProductPagingCriteriaError;

      expect(error.member).toBe('pageRecordsShow');
      expect(error.supplied).toBe(-7);
      expect(error.name).toBe('ProductPagingCriteriaError');

      // The message discloses the numeric bound and not the keyword, so a rejected page cannot echo
      // caller-supplied text back out of the service.
      expect(error.message).not.toContain(REQUIRED_KEYWORD);
    });

    it('★ leaves ABSENCE meaning absence, which is the standing contract it must not disturb', async () => {
      const [alpha, beta, gamma] = threeProducts();

      // The whole reason the check is on SHAPE and not on magnitude: `ProductQueryCriteria`
      // refuses to invent a default page size, because the legacy declared none at this call site.
      const page = await service.findProducts({ keyword: REQUIRED_KEYWORD });

      expect(page.records).toStrictEqual([alpha, beta, gamma]);
      expect(page.pageRecordsStart).toBe(0);
      expect(page.pageRecordsShow).toBeUndefined();
    });

    it('admits ZERO on both members, which is a bound rather than an absence', async () => {
      threeProducts();

      // Zero is a non-negative safe integer and therefore admissible on both: a zero start is the
      // first record, and a zero page size is an EMPTY window - distinct from an absent one, which
      // means the whole result set.
      const page = await service.findProducts({
        keyword: REQUIRED_KEYWORD,
        pageRecordsStart: 0,
        pageRecordsShow: 0,
      });

      expect(page.records).toStrictEqual([]);
      expect(page.recordsCount).toBe(3);
      expect(page.pageRecordsShow).toBe(0);
    });

    it('imposes NO MAGNITUDE CEILING, because slice clamps what was already materialized', async () => {
      const [alpha, beta, gamma] = threeProducts();
      const page = await service.findProducts({
        keyword: REQUIRED_KEYWORD,
        pageRecordsShow: Number.MAX_SAFE_INTEGER,
      });

      expect(page.records).toStrictEqual([alpha, beta, gamma]);
      expect(page.pageRecordsShow).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('★★ pushes the window DOWN, so the bound is on the WORK and not just the answer', async () => {
      threeProducts();

      const page = await service.findProducts({
        keyword: REQUIRED_KEYWORD,
        pageRecordsStart: 1,
        pageRecordsShow: 1,
      });

      expect(productRepository.searches).toStrictEqual([
        {
          term: REQUIRED_KEYWORD,
          productTypeIDs: undefined,
          window: { start: 1, count: 1 },
        },
      ]);

      // And the service does not re-slice what the adapter already windowed.
      expect(page.records).toHaveLength(1);
    });

    it("★ reports the adapter's PRE-WINDOW total, not how many records came back", async () => {
      // `recordsCount` keeps its documented meaning - "how much matched" - even though the adapter
      // no longer returns everything that matched.
      threeProducts();
      productRepository.matchedCountOverride = 40;

      const page = await service.findProducts({
        keyword: REQUIRED_KEYWORD,
        pageRecordsStart: 1,
        pageRecordsShow: 1,
      });

      expect(page.recordsCount).toBe(40);
      expect(page.records).toHaveLength(1);
    });

    it('★ pushes NO window for a start with no count, and applies that start in memory', async () => {
      // The one DELIBERATE ASYMMETRY, pinned so it reads as a decision. "Everything from index 1
      // onward" has no upper bound.
      const [, beta, gamma] = threeProducts();

      const page = await service.findProducts({
        keyword: REQUIRED_KEYWORD,
        pageRecordsStart: 1,
      });

      expect(productRepository.searches).toStrictEqual([
        { term: REQUIRED_KEYWORD, productTypeIDs: undefined, window: undefined },
      ]);
      expect(page.records).toStrictEqual([beta, gamma]);
      expect(page.recordsCount).toBe(3);
    });

    it('★ pushes a ZERO-COUNT window down rather than treating it as an absent one', async () => {
      // An empty window is a WINDOW, and the cheapest one there is: the adapter should materialize
      // nothing at all.
      threeProducts();

      const page = await service.findProducts({
        keyword: REQUIRED_KEYWORD,
        pageRecordsStart: 0,
        pageRecordsShow: 0,
      });

      expect(productRepository.searches).toStrictEqual([
        {
          term: REQUIRED_KEYWORD,
          productTypeIDs: undefined,
          window: { start: 0, count: 0 },
        },
      ]);
      expect(page.records).toStrictEqual([]);
      expect(page.recordsCount).toBe(3);
    });
  });

  // These four serve out-of-scope features but live in an in-scope file, so they are ported for
  // interface parity with FLAGGED NOT-IMPLEMENTED bodies.
  describe('out-of-scope methods', () => {
    it('processProduct_addProductReview ANSWERS THE PRODUCT UNCHANGED and touches no port', async () => {
      const product = makeProductFixture({ productID: 'product-under-review' });

      const answered = await service.processProduct_addProductReview(product, {
        newProductReviewID: 'review-candidate',
      });
      expect(answered).toBe(product);
      expect(productRepository.saves).toStrictEqual([]);
      expect(skuCreation.requests).toStrictEqual([]);
      expect(subscriptionTermProvider.requestedTermIDs).toStrictEqual([]);
      expect(imageStore.savedFiles).toStrictEqual([]);
      expect(imageStore.deletedPaths).toStrictEqual([]);
    });

    it('★★★ AND FLAGS THE UNPERFORMED PROCESS on the register, so it is not mistakable for success', async () => {
      // THE SILENT-RETURN CLOSURE. A silent success on an unimplemented feature is
      // indistinguishable from a real one, so this method signals on the same two channels
      // `processProduct_uploadDefaultImage` already writes. Making all four stub-touching methods
      // THROW instead is declined on AAP 0.2.2 grounds, and the case above states why: a method that
      // always throws is neither of the two treatments that section prescribes, and this one reaches
      // no port to refuse FROM.
      //
      // WHAT IS ASSERTED INSTEAD IS THE OTHER HALF OF THE SAME PRESCRIPTION - "flagged as
      // unexercised". The flag is written on the channel the framework itself uses:
      // `HibachiEntity.getErrors()` [org/Hibachi/HibachiEntity.cfc:L133-L146] injects
      // `addError('processObjects', <context>, true)` for a process object carrying errors, which is
      // exactly how `processProduct_uploadDefaultImage`'s failure becomes visible on the product. So
      // the two formerly-silent methods now report identically.
      const product = makeProductFixture({ productID: 'product-under-review' });

      const answered = await service.processProduct_addProductReview(product, {
        newProductReviewID: 'review-candidate',
      });

      // The RETURN is still the same instance, unchanged - [model/service/ProductService.cfc:L170] is
      // still honoured, and the pass-through is not converted into a refusal.
      expect(answered).toBe(product);
      expect(answered.getProductID()).toBe('product-under-review');

      // THE PROCESS CONTEXT IS A DATA CONTRACT with the legacy admin, which is why the exact string
      // is pinned rather than merely its presence.
      expect(product.hasErrors()).toBe(true);
      expect(product.getErrors()['processObjects']).toStrictEqual(['addProductReview']);
      expect(product.getErrors()['newProductReview']).toStrictEqual([
        'validate.processNotImplemented',
      ]);

      // AND THE RB KEY IS NOT RESOLVED HERE. JavaRB is not ported and no i18n runtime exists
      // (AAP 0.5.3), so the identifier travels verbatim exactly as `validate.fileUpload` does.
      expect(product.getErrors()['newProductReview']?.[0]).not.toContain(' ');
    });

    it('★★ reports an unperformed process IDENTICALLY to its formerly-silent sibling', async () => {
      // The consistency F-09 actually asked for, asserted as a comparison rather than as two
      // independent facts. Both methods answer the product, neither throws, and both leave the same
      // two-channel signal - the `processObjects` context plus a key naming what did not happen.
      const reviewed = makeProductFixture({ productID: 'product-reviewed' });
      const uploaded = makeProductFixture({ productID: 'product-uploaded' });

      await service.processProduct_addProductReview(reviewed, {
        newProductReviewID: 'review-candidate',
      });
      await service.processProduct_uploadDefaultImage(uploaded, {
        // An empty destination name reaches the path-traversal guard inside the legacy `try`
        // [model/service/ProductService.cfc:L236-L254], which records rather than throws.
        imageFile: '',
        uploadFile: { clientFileExt: 'jpg', serverDirectory: '/tmp/upload', serverFile: 'in.jpg' },
      });

      for (const product of [reviewed, uploaded]) {
        expect(product.hasErrors()).toBe(true);
        expect(product.getErrors()['processObjects']).toHaveLength(1);
      }

      // The contexts differ - each names its own process - which is what makes the signal useful.
      expect(reviewed.getErrors()['processObjects']).toStrictEqual(['addProductReview']);
      expect(uploaded.getErrors()['processObjects']).toStrictEqual(['uploadDefaultImage']);
      expect(uploaded.getErrors()['imageFile']).toStrictEqual(['validate.fileUpload']);
    });

    it('processProduct_addSubscriptionTerm DELEGATES to the stub port, then answers the product', async () => {
      const product = makeProductFixture({ productID: 'product-under-subscription' });

      const answered = await service.processProduct_addSubscriptionTerm(product, {
        subscriptionTermID: 'subscription-term-candidate',
      });

      // [model/service/ProductService.cfc:L175]: the one statement in the legacy branch that has a
      // ported counterpart - the subscription-term lookup - is reproduced through the stub port.
      expect(subscriptionTermProvider.requestedTermIDs).toStrictEqual([
        'subscription-term-candidate',
      ]);

      // LEGACY-DEFECT [model/service/ProductService.cfc:L181]: the body reads
      // `arguments.data.listPrice` inside a function that declares no `data` parameter, so the
      // statement fails at run time whenever the [model/service/ProductService.cfc:L180] guard
      // passes.
      // Preserved deliberately; do not fix without a product decision.
      expect(answered).toBe(product);

      // LEGACY-NOTE [model/service/ProductService.cfc:L185, L188]: the same local is declared with
      // `var` twice in the one function - an invalid duplicate declaration that CFML tolerated.
      expect(productRepository.saves).toStrictEqual([]);
    });

    it('processProduct_uploadDefaultImage attempts NO save when no upload file arrived', async () => {
      const product = makeProductFixture({ productID: 'product-under-upload' });

      const answered = await service.processProduct_uploadDefaultImage(product, {
        imageFile: 'candidate-upload.png',
      });

      // DELEGATE. AAP 0.4.2's ProductService table maps this method to "Delegates to the
      // image-store stub port"; a method that rejects before reaching a port delegates to nothing.
      expect(answered).toBe(product);
      expect(imageStore.savedFiles).toStrictEqual([]);
      expect(imageStore.deletedPaths).toStrictEqual([]);
    });

    it('processProduct_uploadDefaultImage DELEGATES the composed path and the accepted extensions', async () => {
      const product = makeProductFixture({ productID: 'product-under-upload' });

      const answered = await service.processProduct_uploadDefaultImage(product, {
        imageFile: 'candidate-upload.png',
        uploadFile: {
          serverDirectory: '/synthetic/upload/dir',
          serverFile: 'candidate-upload.png',
          clientFileExt: 'png',
        },
      });

      // CFML parity [model/service/ProductService.cfc:L241-L246]: the destination is the
      // default-image directory joined to the process object's `imageFile`.
      expect(imageStore.savedFiles).toStrictEqual([
        {
          filePath: 'product/default/candidate-upload.png',
          allowedExtensions: '.jpeg,.jpg,.png,.gif',
        },
      ]);

      expect(answered).toBe(product);
    });

    it("processProduct_uploadDefaultImage RECORDS 'validate.fileUpload' and does not rethrow", async () => {
      const product = makeProductFixture({ productID: 'product-under-upload' });

      imageStore.saveRejection = new Error('synthetic refusal from the image store');

      const answered = await service.processProduct_uploadDefaultImage(product, {
        imageFile: 'candidate-upload.png',
        uploadFile: {
          serverDirectory: '/synthetic/upload/dir',
          serverFile: 'candidate-upload.png',
          clientFileExt: 'png',
        },
      });

      // The port was reached, and the failure does not escape.
      expect(imageStore.savedFiles).toHaveLength(1);

      // CFML parity [model/service/ProductService.cfc:L247-L254]: the legacy catches the failure
      // and adds a validation error keyed by the resource-bundle identifier `validate.fileUpload`,
      // then still RETURNS the PRODUCT at [model/service/ProductService.cfc:L256] - it does not
      // rethrow.
      expect(answered).toBe(product);

      // The legacy's failure was never unreachable - it travelled from the process object to the
      // entity.
      expect(answered.hasErrors()).toBe(true);
      expect(answered.getError('imageFile')).toStrictEqual(['validate.fileUpload']);
      expect(answered.getError('processObjects')).toStrictEqual(['uploadDefaultImage']);
    });

    it('★ records NOTHING when the upload succeeded, so the register separates the two outcomes', async () => {
      const product = makeProductFixture({ productID: 'product-under-successful-upload' });

      const answered = await service.processProduct_uploadDefaultImage(product, {
        imageFile: 'candidate-upload.png',
        uploadFile: {
          serverDirectory: '/synthetic/upload/dir',
          serverFile: 'candidate-upload.png',
          clientFileExt: 'png',
        },
      });

      expect(imageStore.savedFiles).toHaveLength(1);
      expect(answered.hasErrors()).toBe(false);
      expect(answered.getErrors()).toStrictEqual({});
    });

    // It does not THROW - the legacy answer for a bad upload file is preserved.
    describe('a traversable imageFile is refused before any upload path is composed', () => {
      /**
       * Runs the upload and reports what the caller can actually observe.
       */
      const attemptUpload = async (
        imageFile: string,
      ): Promise<{ threw: boolean; answeredProduct: boolean; recordedRefusal: boolean }> => {
        const product = makeProductFixture({ productID: 'product-under-upload-traversal' });

        try {
          const answered = await service.processProduct_uploadDefaultImage(product, {
            imageFile,
            uploadFile: {
              serverDirectory: '/synthetic/upload/dir',
              serverFile: 'incoming.png',
              clientFileExt: 'png',
            },
          });

          return {
            threw: false,
            answeredProduct: answered === product,
            // A traversal refusal lands in the same `catch` arm the legacy designated for a
            // file-upload validation failure [model/service/ProductService.cfc:L236, L253], so it
            // is recorded rather than erased.
            recordedRefusal: answered.hasError('imageFile'),
          };
        } catch {
          return { threw: true, answeredProduct: false, recordedRefusal: false };
        }
      };

      it('refuses the exact value the finding demonstrated, and stores nothing', async () => {
        const observed = await attemptUpload('../../../etc/passwd');

        // The assertion that carries the protection.
        expect(imageStore.savedFiles).toStrictEqual([]);

        // And the legacy's own answer for a failed upload survives unchanged.
        expect(observed.threw).toBe(false);
        expect(observed.answeredProduct).toBe(true);

        // And the REFUSAL is RECORDED, so "stored nothing" is something the caller learns rather
        // than something only this test can see.
        expect(observed.recordedRefusal).toBe(true);
      });

      it.each([
        ['a POSIX parent reference', '../secret.png'],
        ['a nested POSIX traversal', '../../../etc/passwd'],
        ['a Windows parent reference', '..\\secret.png'],
        ['a POSIX absolute path', '/etc/passwd'],
        ['a Windows absolute path', 'C:\\Windows\\win.ini'],
        ['a UNC path', '\\\\host\\share\\file.png'],
        ['a bare subdirectory', 'nested/shoe.png'],
        ['a percent-encoded traversal', '%2e%2e%2fsecret.png'],
        ['a percent-encoded separator only', 'shoe%2Fpng'],
        ['a NUL truncation payload', 'shoe.png\u0000../../etc/passwd'],
        ['a bare NUL', 'shoe.png\u0000'],
        ['a newline', 'shoe\n.png'],
        ['a DEL', 'shoe\u007f.png'],
        ['the current directory', '.'],
        ['the parent directory', '..'],
        ['an empty name', ''],
        ['a whitespace-only name', '   '],
      ])('refuses %s without reaching the store', async (_label, imageFile) => {
        const observed = await attemptUpload(imageFile);

        expect(imageStore.savedFiles).toStrictEqual([]);
        expect(observed.threw).toBe(false);
        expect(observed.answeredProduct).toBe(true);
      });

      it('refuses an over-length name, and admits the longest legitimate one', async () => {
        // 256 characters: one past the limit the guard publishes.
        const overLength = `${'a'.repeat(253)}.png`;
        expect(overLength).toHaveLength(257);

        await attemptUpload(overLength);
        expect(imageStore.savedFiles).toStrictEqual([]);

        // At the limit the name is legitimate and must still be delegated - a ceiling that refused
        // its own boundary would be narrowing legitimate uploads, not traversal.
        const atTheLimit = `${'a'.repeat(251)}.png`;
        expect(atTheLimit).toHaveLength(255);

        const observed = await attemptUpload(atTheLimit);

        expect(imageStore.savedFiles).toStrictEqual([
          {
            filePath: `product/default/${atTheLimit}`,
            allowedExtensions: '.jpeg,.jpg,.png,.gif',
          },
        ]);
        expect(observed.answeredProduct).toBe(true);
      });

      it.each([
        ['a plain name', 'shoe.png'],
        ['an underscore-joined option string', 'nike-air-jorden_red_10.jpg'],
        ['a hyphenated product code', 'nike-air-jorden.gif'],
        ['a single dot segment inside the name', 'shoe.thumb.jpeg'],
      ])('still delegates %s unchanged', async (_label, imageFile) => {
        // The narrowing is confined to traversal, and this is the evidence.
        const observed = await attemptUpload(imageFile);

        expect(imageStore.savedFiles).toStrictEqual([
          {
            filePath: `product/default/${imageFile}`,
            allowedExtensions: '.jpeg,.jpg,.png,.gif',
          },
        ]);
        expect(observed.answeredProduct).toBe(true);
      });
    });

    it('loadDataFromFile delegates positionally, with the legacy empty-string default', async () => {
      // LEGACY-NOTE [model/service/ProductService.cfc:L65-L68]: the legacy body raises the
      // platform request timeout to one hour. That is a platform fact about the CFML host, not a
      // service-level objective, and this suite deliberately makes no timing assertion about it.
      await service.loadDataFromFile('file://products.csv');
      await service.loadDataFromFile('file://products-quoted.csv', '"');

      // CFML parity [model/service/ProductService.cfc:L67]: the legacy delegates POSITIONALLY with
      // exactly two arguments in declaration order, and the omitted text qualifier defaults to the
      // EMPTY STRING rather than to absence.
      expect(productRepository.imports).toStrictEqual([
        { fileURL: 'file://products.csv', textQualifier: '' },
        { fileURL: 'file://products-quoted.csv', textQualifier: '"' },
      ]);

      // LEGACY-NOTE [model/service/ProductService.cfc:L65-L68]: the bulk import itself is out of
      // scope - the legacy body hands the file straight to the DAO and nothing in the ported slice
      // parses a delimited file.
      expect(skuCreation.requests).toStrictEqual([]);
    });
  });
  describe('processProduct_deleteDefaultImage', () => {
    it('composes the image path and delegates it to the image-store stub', async () => {
      const product = makeProductFixture({ productID: 'product-with-default-image' });
      const data: DeleteDefaultImageInput = { imageFile: 'shoe.png' };

      const answered = await service.processProduct_deleteDefaultImage(product, data);

      // CFML parity [model/service/ProductService.cfc:L200-L201]: the legacy builds the path by
      // interpolating `#imageFile#` UNSCOPED - neither `arguments.data` nor `local`.
      expect(imageStore.deletedPaths).toStrictEqual(['product/default/shoe.png']);

      expect(answered).toBe(product);
    });

    it('deletes nothing when the payload carries no image file', async () => {
      const product = makeProductFixture({ productID: 'product-without-default-image' });

      const answered = await service.processProduct_deleteDefaultImage(product, {});

      expect(imageStore.deletedPaths).toStrictEqual([]);
      expect(answered).toBe(product);
    });

    // Security boundary - path traversal
    //
    // What is asserted below, in every case: the call is refused, and `imageStore.deletedPaths` is
    // empty.
    describe('a traversable imageFile is refused before any path is composed', () => {
      /**
       * Runs the delete expecting a refusal; throws if it completes instead.
       */
      const captureRefusal = async (imageFile: string): Promise<string> => {
        const product = makeProductFixture({ productID: 'product-under-traversal-attempt' });

        try {
          await service.processProduct_deleteDefaultImage(product, { imageFile });
        } catch (thrown) {
          return thrown instanceof Error ? thrown.message : 'a value that is not an Error';
        }

        throw new Error(
          'the deletion was expected to be refused, but it completed. A traversable imageFile ' +
            'must never reach the image store.',
        );
      };

      it('refuses the exact value the finding demonstrated, and reaches no port', async () => {
        const message = await captureRefusal('../../../etc/passwd');

        expect(message).toContain('single file name with no path separator');
        // The assertion that carries the protection: nothing was delegated at all.
        expect(imageStore.deletedPaths).toStrictEqual([]);
      });

      it.each([
        ['a POSIX parent reference', '../secret.png'],
        ['a nested POSIX traversal', 'a/../../secret.png'],
        ['a bare POSIX separator', 'nested/shoe.png'],
        ['an absolute POSIX path', '/etc/passwd'],
        ['a Windows separator', '..\\..\\secret.png'],
        ['a Windows drive path', 'C:\\Windows\\win.ini'],
        ['a UNC path', '\\\\host\\share\\file.png'],
        ['a trailing separator', 'shoe.png/'],
      ])('refuses %s and reaches no port', async (_label, imageFile) => {
        const message = await captureRefusal(imageFile);

        expect(message).toContain('path separator');
        expect(imageStore.deletedPaths).toStrictEqual([]);
      });

      it.each([
        ['single-encoded traversal', '%2e%2e%2fsecret.png'],
        ['double-encoded traversal', '%252e%252e%252fsecret.png'],
        ['an encoded separator only', 'a%2Fb.png'],
        ['an encoded NUL', 'shoe.png%00.txt'],
      ])('refuses %s without decoding anything, and reaches no port', async (_l, imageFile) => {
        // The percent sign is refused as a construct, so nothing here has to be decoded to be
        // judged. That ordering is the point: a decode-then-check pass is exactly where a
        // double-encoded value slips through.
        const message = await captureRefusal(imageFile);

        expect(message).toContain('percent sign');
        expect(imageStore.deletedPaths).toStrictEqual([]);
      });

      it('refuses a compound NUL-truncation payload, whichever construct is caught first', async () => {
        // `shoe.png\0../../etc/passwd` is the classic C-string truncation attack: a syscall stops
        // at the NUL and resolves `shoe.png` while an auditor reading the value sees the
        // traversal.
        const message = await captureRefusal('shoe.png\u0000../../etc/passwd');
        expect(message).toContain('No file was touched');
        expect(imageStore.deletedPaths).toStrictEqual([]);
      });

      it.each([
        ['a bare NUL', 'shoe.png\u0000'],
        ['a newline', 'shoe\n.png'],
        ['a carriage return', 'shoe\r.png'],
        ['a tab', 'shoe\t.png'],
        ['a DEL', 'shoe\u007f.png'],
        ['a C1 control', 'shoe\u0085.png'],
      ])('refuses %s and reaches no port', async (_label, imageFile) => {
        const message = await captureRefusal(imageFile);

        expect(message).toContain('control character');
        expect(imageStore.deletedPaths).toStrictEqual([]);
      });

      it.each([
        ['the current directory', '.'],
        ['the parent directory', '..'],
      ])('refuses %s, which names a directory rather than a file', async (_label, imageFile) => {
        const message = await captureRefusal(imageFile);

        expect(message).toContain('directory reference');
        expect(imageStore.deletedPaths).toStrictEqual([]);
      });

      it.each([
        ['an empty name', ''],
        ['a whitespace-only name', '   '],
      ])('refuses %s, which addresses the directory itself', async (_label, imageFile) => {
        const message = await captureRefusal(imageFile);

        expect(message).toContain('empty or whitespace only');
        expect(imageStore.deletedPaths).toStrictEqual([]);
      });

      it('refuses an over-long name at 256 characters and accepts one at 255', async () => {
        // The EXACT BOUNDARY. 255 is POSIX NAME_MAX; the legacy `imageFile` column is
        // `length="50"` [model/entity/Sku.cfc:L58], so this bound is deliberately LOOSER than the
        // schema rather than tighter - `data.imageFile` is a request field, not that column.
        const message = await captureRefusal(`${'a'.repeat(252)}.png`);

        expect(message).toContain('at most 255 characters');
        expect(message).toContain('it was 256');
        expect(imageStore.deletedPaths).toStrictEqual([]);

        const atTheLimit = `${'a'.repeat(251)}.png`;
        expect(atTheLimit).toHaveLength(255);

        const product = makeProductFixture({ productID: 'product-at-the-name-limit' });
        await service.processProduct_deleteDefaultImage(product, { imageFile: atTheLimit });

        expect(imageStore.deletedPaths).toStrictEqual([`product/default/${atTheLimit}`]);
      });

      it('names the construct and never echoes the rejected value back', async () => {
        // The message would otherwise put attacker-controlled bytes into a log line, and the
        // construct is what an operator holding a legitimate file name needs.
        const message = await captureRefusal('../../../etc/passwd');

        expect(message).not.toContain('etc/passwd');
        expect(message).not.toContain('..');
        expect(message).toContain('No file was touched');
      });
    });

    describe('every legitimate image name still reaches the port unchanged', () => {
      // The guard must cost nothing legitimate.
      it.each([
        ['a plain name', 'shoe.png'],
        ['an underscore-joined option string', 'nike-air-jorden_red_10.jpg'],
        ['a hyphen-joined option string', 'product-code-blue-large.gif'],
        ['a bare product code with no options', 'abc123.jpeg'],
        ['an uppercase extension', 'SHOE.PNG'],
        ['a dotted name', 'shoe.thumb.png'],
        ['a name with no extension at all', 'shoe'],
        ['a pipe delimiter from a setting', 'code|red|large.png'],
        ['a colon delimiter from a setting', 'code:red.png'],
        ['a tilde delimiter from a setting', 'code~red.png'],
        ['a caret delimiter from a setting', 'code^red.png'],
        ['a plus sign', 'code+red.png'],
        ['a space inside the name', 'red shoe.png'],
        ['a name that merely CONTAINS dots without being a segment', 'a..b.png'],
        ['a unicode name', 'schuh-größe-42.png'],
      ])('delegates %s byte-identically', async (_label, imageFile) => {
        const product = makeProductFixture({ productID: `product-${String(_label.length)}` });

        const answered = await service.processProduct_deleteDefaultImage(product, { imageFile });

        expect(imageStore.deletedPaths).toStrictEqual([`product/default/${imageFile}`]);
        expect(answered).toBe(product);
      });

      it('still applies the guard through the CASE-INSENSITIVE key accessor', async () => {
        // The key is probed with CFML struct semantics, so a caller sending `ImageFile` is the
        // same caller.
        const product = makeProductFixture({ productID: 'product-under-folded-key' });

        await expect(
          service.processProduct_deleteDefaultImage(product, {
            ImageFile: '../../../etc/passwd',
          } as unknown as DeleteDefaultImageInput),
        ).rejects.toThrow('path separator');

        expect(imageStore.deletedPaths).toStrictEqual([]);
      });
    });
  });

  // This DESCRIBE once HELD A SINGLE CASE, `answers the same product and reaches no port`, whose
  // comment read: "the legacy loops the product's SKUs and refreshes each generated image file
  // name.
  describe('processProduct_updateDefaultImageFileNames', () => {
    /**
     * An option carrying an explicit code, inside a group with the given image flag.
     */
    function anImageOption(spec: {
      readonly optionID: string;
      readonly optionCode: string;
      readonly imageGroupFlag: boolean;
      readonly sortOrder: number;
    }): Option {
      const group = buildEmptyOptionGroup({
        optionGroupID: `og-${spec.optionID}`,
        optionGroupName: `Group ${spec.optionID}`,
        sortOrder: spec.sortOrder,
        imageGroupFlag: spec.imageGroupFlag,
      });

      const option = new Option({
        optionID: spec.optionID,
        optionCode: spec.optionCode,
        optionName: `Option ${spec.optionID}`,
        optionDescription: undefined,
        sortOrder: spec.sortOrder,
        optionGroup: group,
        defaultImageID: undefined,
        remoteID: undefined,
        createdDateTime: FIXED_AUDIT_INSTANT,
        createdByAccountID: undefined,
        modifiedDateTime: undefined,
        modifiedByAccountID: undefined,
      });

      group.getOptions().push(option);

      return option;
    }

    it('★ composes and ASSIGNS a name for EVERY sku on the product', async () => {
      const red = anImageOption({
        optionID: 'opt-red',
        optionCode: 'red',
        imageGroupFlag: true,
        sortOrder: 1,
      });
      const blue = anImageOption({
        optionID: 'opt-blue',
        optionCode: 'blue',
        imageGroupFlag: true,
        sortOrder: 2,
      });

      const redSku = makeSkuFixture({ idPrefix: 'sku-red', skuID: 'sku-red', options: [red] });
      const blueSku = makeSkuFixture({ idPrefix: 'sku-blue', skuID: 'sku-blue', options: [blue] });

      const product = makeProductFixture({
        productID: 'product-under-filename-refresh',
        productCode: 'SHOE100',
        skus: [redSku, blueSku],
      });

      const answered = await service.processProduct_updateDefaultImageFileNames(product);

      // CFML parity [model/service/ProductService.cfc:L209-L211]: every SKU, and the value
      // assigned is `sku.generateImageFileName()` [model/entity/Sku.cfc:L131-L139] - product code,
      // then the delimiter and code of each image-group option, then the extension.
      expect(redSku.getImageFile()).toBe('SHOE100-red.jpg');
      expect(blueSku.getImageFile()).toBe('SHOE100-blue.jpg');

      // The port saw one descriptor per SKU, in traversal order, carrying the RAW values. The
      // sanitisation and the delimiter are its business, not the service's, and this pins the
      // split.
      expect(imageStore.nameDescriptors).toStrictEqual([
        { productCode: 'SHOE100', imageGroupOptionCodes: ['red'] },
        { productCode: 'SHOE100', imageGroupOptionCodes: ['blue'] },
      ]);

      // AND THE NAMES ARE PERSISTED, WHICH IS A CRITICAL RUNTIME FINDING'S REGRESSION TEST.
      // This method assigned names and wrote nothing, on the reasoning that "every one of the four
      // dispatch sites is inside a method that performs its own write". Only `saveProduct` does, so
      // the routed operation - and the two option mutations that dispatch here - answered HTTP 200
      // having written NOTHING: QA measured `SwSku` and `SwSkuOption` row counts and column values
      // identical before and after. The write is now this method's own, as ONE unit of work carrying
      // every SKU on the product and naming the parent product.
      expect(skuBatchWrite.batches).toStrictEqual([[redSku, blueSku]]);
      expect(skuBatchWrite.parentProductIDs).toStrictEqual(['product-under-filename-refresh']);
      expect(skuRepository.savedSkus).toStrictEqual([redSku, blueSku]);

      // The same instance back, per [model/service/ProductService.cfc:L213].
      expect(answered).toBe(product);
    });

    it('★ keeps only the codes whose option GROUP carries the image flag', async () => {
      const colour = anImageOption({
        optionID: 'opt-colour',
        optionCode: 'red',
        imageGroupFlag: true,
        sortOrder: 1,
      });
      const size = anImageOption({
        optionID: 'opt-size',
        optionCode: 'large',
        imageGroupFlag: false,
        sortOrder: 2,
      });
      const finish = anImageOption({
        optionID: 'opt-finish',
        optionCode: 'matte',
        imageGroupFlag: true,
        sortOrder: 3,
      });

      const sku = makeSkuFixture({
        idPrefix: 'sku-filtered',
        skuID: 'sku-filtered',
        options: [colour, size, finish],
      });

      const product = makeProductFixture({
        productID: 'product-filtered-options',
        productCode: 'SHOE200',
        skus: [sku],
      });

      await service.processProduct_updateDefaultImageFileNames(product);

      expect(imageStore.nameDescriptors).toStrictEqual([
        { productCode: 'SHOE200', imageGroupOptionCodes: ['red', 'matte'] },
      ]);
      expect(sku.getImageFile()).toBe('SHOE200-red-matte.jpg');
    });

    it('★ preserves the SKU\u2019s own option order, and does not sort by anything', async () => {
      // [model/entity/Sku.cfc:L133] iterates `getOptions()` and appends in traversal order.
      const omega = anImageOption({
        optionID: 'opt-omega',
        optionCode: 'omega',
        imageGroupFlag: true,
        sortOrder: 9,
      });
      const alpha = anImageOption({
        optionID: 'opt-alpha',
        optionCode: 'alpha',
        imageGroupFlag: true,
        sortOrder: 1,
      });

      const sku = makeSkuFixture({
        idPrefix: 'sku-ordered',
        skuID: 'sku-ordered',
        options: [omega, alpha],
      });

      const product = makeProductFixture({
        productID: 'product-option-order',
        productCode: 'SHOE300',
        skus: [sku],
      });

      await service.processProduct_updateDefaultImageFileNames(product);

      expect(imageStore.nameDescriptors).toStrictEqual([
        { productCode: 'SHOE300', imageGroupOptionCodes: ['omega', 'alpha'] },
      ]);
      expect(sku.getImageFile()).toBe('SHOE300-omega-alpha.jpg');
    });

    it('★ forwards codes RAW, so the port performs the whole sanitisation', async () => {
      // The service must not pre-clean: [model/entity/Sku.cfc:L135] and
      // [model/entity/Sku.cfc:L138] sanitise inside the composition, and half-sanitising on this
      // side is how the two halves come to disagree.
      //
      // The COMPOSED result then shows the case-insensitivity of `reReplaceNoCase`: the capitals
      // survive and only the space and slash are removed.
      const messy = anImageOption({
        optionID: 'opt-messy',
        optionCode: 'Red XL/2',
        imageGroupFlag: true,
        sortOrder: 1,
      });

      const sku = makeSkuFixture({
        idPrefix: 'sku-messy',
        skuID: 'sku-messy',
        options: [messy],
      });

      const product = makeProductFixture({
        productID: 'product-messy-codes',
        productCode: 'Shoe 400/A',
        skus: [sku],
      });

      await service.processProduct_updateDefaultImageFileNames(product);

      expect(imageStore.nameDescriptors).toStrictEqual([
        { productCode: 'Shoe 400/A', imageGroupOptionCodes: ['Red XL/2'] },
      ]);
      expect(sku.getImageFile()).toBe('Shoe400A-RedXL2.jpg');
    });

    it('★ skips an option whose GROUP is absent instead of throwing', async () => {
      // A SKU loaded without its option groups is a fetch shape this service does not control, and
      // three in-scope callers await this method, so an absent group must not become a raise.
      const groupless = new Option({
        optionID: 'opt-groupless',
        optionCode: 'orphan',
        optionName: 'Groupless',
        optionDescription: undefined,
        sortOrder: 1,
        optionGroup: undefined,
        defaultImageID: undefined,
        remoteID: undefined,
        createdDateTime: FIXED_AUDIT_INSTANT,
        createdByAccountID: undefined,
        modifiedDateTime: undefined,
        modifiedByAccountID: undefined,
      });

      const sku = makeSkuFixture({
        idPrefix: 'sku-groupless',
        skuID: 'sku-groupless',
        options: [groupless],
      });

      const product = makeProductFixture({
        productID: 'product-groupless-option',
        productCode: 'SHOE500',
        skus: [sku],
      });

      const answered = await service.processProduct_updateDefaultImageFileNames(product);

      expect(imageStore.nameDescriptors).toStrictEqual([
        { productCode: 'SHOE500', imageGroupOptionCodes: [] },
      ]);
      expect(sku.getImageFile()).toBe('SHOE500.jpg');
      expect(answered).toBe(product);
    });

    it('★ names a SKU with no image-group options from the product code alone', async () => {
      const sku = makeSkuFixture({ idPrefix: 'sku-plain', skuID: 'sku-plain', options: [] });

      const product = makeProductFixture({
        productID: 'product-no-image-options',
        productCode: 'SHOE600',
        skus: [sku],
      });

      await service.processProduct_updateDefaultImageFileNames(product);

      // No option segment at all, and no trailing delimiter: [model/entity/Sku.cfc:L135] prefixes
      // each code with the delimiter rather than suffixing it, so an empty option set contributes
      // an empty string.
      expect(sku.getImageFile()).toBe('SHOE600.jpg');
    });

    it('renames nothing, and still answers the same product, when there are no SKUs', async () => {
      // [model/service/ProductService.cfc:L209] has no count floor and no early return, so an
      // empty SKU collection is a loop that runs zero times rather than a special case.
      const product = makeProductFixture({ productID: 'product-with-no-skus', skus: [] });

      const answered = await service.processProduct_updateDefaultImageFileNames(product);

      expect(imageStore.nameDescriptors).toStrictEqual([]);
      expect(answered).toBe(product);
    });

    it('★★★ ASSIGNS AND PERSISTS - the renamed set reaches the datastore in ONE unit of work', async () => {
      // THIS CASE ASSERTED THE OPPOSITE, AND THE OPPOSITE WAS A CRITICAL DEFECT. It was titled
      // " ASSIGNS ONLY - it writes nothing, saves nothing and deletes nothing" and defended by:
      // "[model/service/ProductService.cfc:L208-L214] mutates managed entities and returns the
      // product; Hibernate flushed at request end together with whatever the DISPATCHING process
      // method saved. Every one of the four dispatch sites performs its own write, so a `saveSku`
      // here would issue writes the legacy never did."
      //
      // THE FIRST SENTENCE IS RIGHT AND THE SECOND IS FALSE, and the false one carried the
      // conclusion. Of the four dispatch sites, exactly ONE writes - `saveProduct` [model/service/ProductService.cfc:L282]. [model/service/ProductService.cfc:L123] and
      // [model/service/ProductService.cfc:L152] end at their dispatch and return, `HibachiService.process()`
      // [org/Hibachi/HibachiService.cfc:L84-L129] never saves, and [model/service/ProductService.cfc:L193] is a stub here. So the
      // Hibernate flush the first sentence correctly describes had NO counterpart in the port for
      // three of the four paths, and QA measured the consequence end to end: routed
      // `processProduct_addOptionGroup`, `processProduct_addOption` and
      // `processProduct_updateDefaultImageFileNames` requests each answered HTTP 200 with a
      // save-shaped body and issued ZERO DML.
      //
      // The flush is now written down here, once, for all four dispatchers. This case pins it, and
      // the transient case below pins the one path that is still exempt.
      const option = anImageOption({
        optionID: 'opt-quiet',
        optionCode: 'quiet',
        imageGroupFlag: true,
        sortOrder: 1,
      });
      const sku = makeSkuFixture({ idPrefix: 'sku-quiet', skuID: 'sku-quiet', options: [option] });

      const product = makeProductFixture({
        productID: 'product-assign-only',
        productCode: 'SHOE700',
        skus: [sku],
      });

      await service.processProduct_updateDefaultImageFileNames(product);

      expect(sku.getImageFile()).toBe('SHOE700-quiet.jpg');

      // ONE unit of work carrying the whole set, which is what
      // `SkuBatchWriteCollaborator.saveMutatedSkus` guarantees and what a per-SKU loop could not.
      expect(skuBatchWrite.batches).toStrictEqual([[sku]]);

      // And the set genuinely reached the write - the double forwards each member to the recording
      // repository, so this is the assertion that would have failed before the fix.
      expect(skuRepository.savedSkus).toStrictEqual([sku]);

      // The PRODUCT row is still untouched: [org/Hibachi/HibachiService.cfc:L208-L214] dirties SKUs and nothing else, and the
      // image store is not reached either.
      expect(productRepository.saves).toStrictEqual([]);
      expect(imageStore.deletedPaths).toStrictEqual([]);
    });

    it('★★★ writes the WHOLE collection, in collection order, however few of the names changed', async () => {
      // THE BREADTH IS DELIBERATE AND IS WHY THIS CASE EXISTS. This method cannot see what its
      // caller mutated - `processProduct_addOptionGroup` changes a SKU's OPTIONS and may leave the
      // composed file name identical - so a write set chosen by comparing image file names would skip
      // exactly the SKU whose link rows have to be rewritten. Every member of the collection is
      // therefore written, and the ORDER is the collection's, so the emitted statements can be read
      // against the entity that produced them.
      const first = anImageOption({
        optionID: 'opt-a',
        optionCode: 'aaa',
        imageGroupFlag: true,
        sortOrder: 1,
      });
      const second = anImageOption({
        optionID: 'opt-b',
        optionCode: 'bbb',
        imageGroupFlag: true,
        sortOrder: 2,
      });

      // The middle SKU ALREADY carries the exact name this call will compose for it, so a
      // dirty-checking write set would have excluded it and this assertion would fail.
      const alpha = makeSkuFixture({ idPrefix: 'sku-a', skuID: 'sku-a', options: [first] });
      const unchanged = makeSkuFixture({
        idPrefix: 'sku-b',
        skuID: 'sku-b',
        options: [],
        imageFile: 'SHOE800.jpg',
      });
      const beta = makeSkuFixture({ idPrefix: 'sku-c', skuID: 'sku-c', options: [second] });

      const product = makeProductFixture({
        productID: 'product-whole-collection',
        productCode: 'SHOE800',
        skus: [alpha, unchanged, beta],
      });

      await service.processProduct_updateDefaultImageFileNames(product);

      expect(unchanged.getImageFile()).toBe('SHOE800.jpg');
      expect(skuBatchWrite.batches).toStrictEqual([[alpha, unchanged, beta]]);
      expect(skuRepository.savedSkus).toStrictEqual([alpha, unchanged, beta]);
    });

    it('★★★ renames but does NOT write a TRANSIENT product, leaving the cascade the only writer', async () => {
      // THE ONE EXEMPTION, AND IT IS THE SCHEMA'S DOING RATHER THAN A PREFERENCE. `saveProduct`
      // dispatches this method from its NEW-PRODUCT branch [model/service/ProductService.cfc:L282],
      // BEFORE `productRepository.saveProduct` has written the owning row - and `SwSku.productID`
      // references `SwProduct`, so writing the children here would bind a product identifier that
      // does not exist yet. The adapter already owns that sequence: product row, then the cascaded
      // SKUs, then the deferred `defaultSkuID`, in one transaction. So the names are assigned and the
      // write is left alone, which is exactly the behaviour this path had before the flush existed.
      const option = anImageOption({
        optionID: 'opt-new',
        optionCode: 'new',
        imageGroupFlag: true,
        sortOrder: 1,
      });
      const draft = makeSkuFixture({
        idPrefix: 'sku-draft',
        skuID: 'sku-draft',
        isNew: true,
        options: [option],
      });

      // `makeProductFixture` defaults `productID` to the empty string, which IS `Product.isNew()`.
      const transient = makeProductFixture({ productCode: 'SHOE900', skus: [draft] });

      expect(transient.isNew()).toBe(true);

      const answered = await service.processProduct_updateDefaultImageFileNames(transient);

      // The rename still happened - the cascade persists whatever the entity carries when it runs.
      expect(draft.getImageFile()).toBe('SHOE900-new.jpg');
      expect(answered).toBe(transient);

      // And NOTHING was written from here: no batch was opened at all, not even an empty one.
      expect(skuBatchWrite.batches).toStrictEqual([]);
      expect(skuRepository.savedSkus).toStrictEqual([]);
      expect(productRepository.saves).toStrictEqual([]);
    });

    it('★ REFUSES a product past the configured bound BEFORE a name is assigned or written', async () => {
      // AAP 0.6.5 requires a bulk mutation path to bound its batch, and this path became one when it
      // began to flush. The guard is the same one `processProduct_updateSkus` uses, so the two cannot
      // drift apart - and the refusal names THIS method rather than that one, which is the whole
      // reason the guard now takes a refusal descriptor.
      const shared = makeSkuFixture({ skuID: 'sku-bounded', options: [] });
      const overTheBound = makeProductFixture({
        productID: 'product-past-the-rename-bound',
        productCode: 'SHOE950',
        skus: [shared, shared],
      });

      const boundedAtOne = new ProductService(
        productRepository,
        skuRepository,
        productTypeRepository,
        urlTitleGenerator,
        imageStore,
        subscriptionTermProvider,
        skuCreation,
        optionLoading,
        skuBatchWrite,
        1,
      );

      const rejected = boundedAtOne.processProduct_updateDefaultImageFileNames(overTheBound);

      await expect(rejected).rejects.toThrow(
        /would rename and rewrite 2 SKUs, above the configured bound of 1/,
      );

      // The message names the method a caller actually invoked, the product, and the legacy
      // statement being bounded - so it is actionable without a stack trace.
      await expect(rejected).rejects.toThrow(
        /ProductService\.processProduct_updateDefaultImageFileNames:/,
      );
      await expect(rejected).rejects.toThrow(/product 'product-past-the-rename-bound'/);
      await expect(rejected).rejects.toThrow(/\[model\/service\/ProductService\.cfc:L208-L214\]/);

      // NOTHING was assigned and NOTHING was written: the bound is checked before the traversal, so
      // the caller is not left holding names no row carries.
      expect(shared.getImageFile()).toBeUndefined();
      expect(imageStore.nameDescriptors).toStrictEqual([]);
      expect(skuBatchWrite.batches).toStrictEqual([]);
      expect(skuRepository.savedSkus).toStrictEqual([]);
    });

    it('★ does NOT bound a TRANSIENT product, because this path does not write one', async () => {
      // The other side of the bound. A new product's SKUs are bounded by `createSkus` and written by
      // the adapter's cascade, so bounding them HERE would refuse work this method never undertakes -
      // and would break `saveProduct` for a product `createSkus` had already accepted.
      const shared = makeSkuFixture({ skuID: 'sku-unbounded', isNew: true, options: [] });
      const transient = makeProductFixture({ productCode: 'SHOE960', skus: [shared, shared] });

      const boundedAtOne = new ProductService(
        productRepository,
        skuRepository,
        productTypeRepository,
        urlTitleGenerator,
        imageStore,
        subscriptionTermProvider,
        skuCreation,
        optionLoading,
        skuBatchWrite,
        1,
      );

      const answered = await boundedAtOne.processProduct_updateDefaultImageFileNames(transient);

      expect(answered).toBe(transient);
      expect(shared.getImageFile()).toBe('SHOE960.jpg');
      expect(skuBatchWrite.batches).toStrictEqual([]);
    });

    it('answers a SKU-less product unchanged, without inventing a name', async () => {
      // The empty-collection case: [model/service/ProductService.cfc:L209] iterates nothing, so
      // nothing is written and no placeholder file name is fabricated for a product that has no
      // SKUs.
      const product = makeProductFixture({ productID: 'product-with-no-skus', skus: [] });

      const answered = await service.processProduct_updateDefaultImageFileNames(product);

      expect(answered).toBe(product);
      expect(product.getSkus()).toStrictEqual([]);
    });

    it('NAMES a SKU with no back-reference from the PRODUCT ARGUMENT, without raising', async () => {
      // The one place this method diverges from `Sku.generateImageFileName()`: that accessor
      // dereferences `getProduct()` unguarded [model/entity/Sku.cfc:L135, L138] and raises for an
      // orphaned sku, while this one is handed the product and so names the file without raising.
      const orphan = makeSkuFixture({ skuID: 'sku-with-no-product', product: undefined });
      const product = makeProductFixture({
        productID: 'product-holding-an-orphan',
        productCode: 'ORPHAN900',
        skus: [orphan],
      });

      const answered = await service.processProduct_updateDefaultImageFileNames(product);

      expect(answered).toBe(product);
      expect(orphan.getProduct()).toBeUndefined();

      // The descriptor carried the ARGUMENT'S product code, and the name was assigned.
      expect(imageStore.nameDescriptors).toStrictEqual([
        { productCode: 'ORPHAN900', imageGroupOptionCodes: [] },
      ]);
      expect(orphan.getImageFile()).toBe('ORPHAN900.jpg');
    });
  });
  describe('processProduct_addOptionGroup', () => {
    it('gives EVERY existing SKU the FIRST option of the new group', async () => {
      const material = buildOptionGroupWithOption({
        optionGroupID: 'og-material',
        optionGroupName: 'Material',
        optionID: 'opt-cotton',
        optionName: 'Cotton',
        sortOrder: 1,
      });
      const secondOption = addOptionToGroup(material.group, {
        optionID: 'opt-linen',
        optionName: 'Linen',
        sortOrder: 2,
      });

      optionLoading.optionGroupsByID.set('og-material', material.group);

      const first = makeSkuFixture({ skuID: 'sku-add-group-first', options: [] });
      const second = makeSkuFixture({ skuID: 'sku-add-group-second', options: [] });
      const product = makeProductFixture({
        productID: 'product-gaining-an-option-group',
        skus: [first, second],
      });

      const answered = await service.processProduct_addOptionGroup(product, {
        optionGroup: 'og-material',
      });

      // LEGACY-DEFECT [model/service/ProductService.cfc:L119]: every existing SKU is given
      // options[1] - the first option of the newly added group - rather than an option matched to
      // that SKU.
      // Preserved deliberately; do not fix without a product decision.
      //
      // Both SKUs receive the same option, and it is the group's FIRST option in repository order.
      expect(first.getOptions()).toStrictEqual([material.option]);
      expect(second.getOptions()).toStrictEqual([material.option]);
      expect(first.getOptions()).not.toContain(secondOption);
      expect(second.getOptions()).not.toContain(secondOption);

      // The group is loaded once, before the loop, and by the identifier the payload carried.
      //
      // CFML parity [model/service/ProductService.cfc:L115]: the payload holds an ID STRING, not a
      // hydrated entity, which is proven by the legacy handing it straight to an entity loader.
      expect(optionLoading.requestedOptionGroupIDs).toStrictEqual(['og-material']);

      // AND THE MUTATION IS PERSISTED, WHICH IS A CRITICAL RUNTIME FINDING'S REGRESSION TEST.
      // The `addOption` loop above changes the product's PERSISTED SKUs in memory, and under
      // Hibernate those changes - and the `SwSkuOption` membership rows they imply - were flushed at
      // request end. Nothing in the port replaced that flush, so this published operation answered
      // HTTP 200 having written NOTHING: QA measured `SwSkuOption` at 8 rows before and 8 after.
      // The write arrives through the dispatched image-name refresh, as ONE unit of work naming the
      // parent product, and `MysqlSkuRepository.saveSku` reconciles `SwSkuOption` from each entity's
      // own collection - so the option added above travels with it.
      expect(skuBatchWrite.batches).toStrictEqual([[first, second]]);
      expect(skuBatchWrite.parentProductIDs).toStrictEqual(['product-gaining-an-option-group']);
      expect(skuRepository.savedSkus).toStrictEqual([first, second]);

      expect(answered).toBe(product);
    });

    it('dispatches to processProduct_updateDefaultImageFileNames afterwards', async () => {
      const material = buildOptionGroupWithOption({
        optionGroupID: 'og-material',
        optionGroupName: 'Material',
        optionID: 'opt-cotton',
        optionName: 'Cotton',
        sortOrder: 1,
      });

      optionLoading.optionGroupsByID.set('og-material', material.group);

      const sku = makeSkuFixture({ skuID: 'sku-add-group-dispatch', options: [] });
      const product = makeProductFixture({ productID: 'product-dispatch', skus: [sku] });

      // CFML parity [model/service/ProductService.cfc:L123]: the legacy line is
      // this.processProduct(arguments.product, {}, 'updateDefaultImageFileNames') the framework's
      // generic convention dispatcher.
      const dispatchSpy = vi.spyOn(service, 'processProduct_updateDefaultImageFileNames');

      await service.processProduct_addOptionGroup(product, { optionGroup: 'og-material' });

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      expect(dispatchSpy).toHaveBeenCalledWith(product);
    });

    it('applies nothing when the new group carries no options', async () => {
      const emptyGroup = buildEmptyOptionGroup({
        optionGroupID: 'og-empty',
        optionGroupName: 'Empty',
        sortOrder: 1,
      });

      optionLoading.optionGroupsByID.set('og-empty', emptyGroup);

      const sku = makeSkuFixture({ skuID: 'sku-add-empty-group', options: [] });
      const product = makeProductFixture({ productID: 'product-empty-group', skus: [sku] });

      const answered = await service.processProduct_addOptionGroup(product, {
        optionGroup: 'og-empty',
      });

      // CFML parity [model/service/ProductService.cfc:L117]: `if(arrayLen(options))` is a bare
      // numeric truthiness test on a count.
      expect(sku.getOptions()).toStrictEqual([]);
      expect(answered).toBe(product);
    });

    it('fails, unguarded, when the option group cannot be resolved', async () => {
      const sku = makeSkuFixture({ skuID: 'sku-unresolvable-group', options: [] });
      const product = makeProductFixture({ productID: 'product-unresolvable-group', skus: [sku] });

      // CFML parity [model/service/ProductService.cfc:L115]: the legacy chains
      // `getOptionGroup(id).getOptions()` with no null check, so an identifier that resolves to
      // nothing fails at the dereference.
      await expect(
        service.processProduct_addOptionGroup(product, { optionGroup: 'og-does-not-exist' }),
      ).rejects.toThrow(MissingAssociationError);

      // The published detail is a MEMBER PATH plus one fixed constraint sentence - never the submitted
      // identifier, never a row count, never a table.
      const refusal = await service
        .processProduct_addOptionGroup(product, { optionGroup: 'og-does-not-exist' })
        .then(
          () => undefined,
          (thrown: unknown) => thrown,
        );

      expect(refusal).toBeInstanceOf(MissingAssociationError);
      if (refusal instanceof MissingAssociationError) {
        expect(refusal.fields).toStrictEqual([
          { path: 'optionGroup', message: 'must name an existing record' },
        ]);
        expect(refusal.message).not.toContain('og-does-not-exist');
      }

      expect(sku.getOptions()).toStrictEqual([]);

      // Nothing was written either, because the dereference fails before the dispatch that flushes.
      expect(skuBatchWrite.batches).toStrictEqual([]);
      expect(skuRepository.savedSkus).toStrictEqual([]);
    });

    it('★★★ PERSISTS the appended option - the mutation was previously unflushable', async () => {
      // THE FINDING THIS CASE EXISTS FOR. QA routed this operation and measured HTTP 200 with a
      // save-shaped body and ZERO DML statements: the option appended at
      // [model/service/ProductService.cfc:L119] was mutated in memory and then discarded, and NO code
      // path in the port could have written it - `HibachiService.process()`
      // [org/Hibachi/HibachiService.cfc:L84-L129] never saves and [model/service/ProductService.cfc:L125] just returns, so the
      // durability came entirely from a Hibernate session flush that had no counterpart here. The
      // dispatched `processProduct_updateDefaultImageFileNames` now performs that flush, and this case
      // asserts THE WRITE rather than the return value, because the return value never failed.
      const material = buildOptionGroupWithOption({
        optionGroupID: 'og-material',
        optionGroupName: 'Material',
        optionID: 'opt-cotton',
        optionName: 'Cotton',
        sortOrder: 1,
      });

      optionLoading.optionGroupsByID.set('og-material', material.group);

      const first = makeSkuFixture({ skuID: 'sku-flushed-first', options: [] });
      const second = makeSkuFixture({ skuID: 'sku-flushed-second', options: [] });
      const product = makeProductFixture({
        productID: 'product-whose-links-are-flushed',
        skus: [first, second],
      });

      await service.processProduct_addOptionGroup(product, { optionGroup: 'og-material' });

      // ONE unit of work, carrying BOTH mutated SKUs. The option-link rewrite the adapter performs
      // per SKU is what makes `SwSkuOption` agree with the collection asserted below.
      expect(skuBatchWrite.batches).toStrictEqual([[first, second]]);
      expect(skuRepository.savedSkus).toStrictEqual([first, second]);

      // And the state that travelled to the write is the appended membership, not an empty one - a
      // flush of an unmutated collection would have satisfied the batch assertion above on its own.
      expect(first.getOptions()).toStrictEqual([material.option]);
      expect(second.getOptions()).toStrictEqual([material.option]);
    });
  });
  describe('processProduct_addOption', () => {
    /**
     * Assembles the standard three-group graph these cases work over.
     *
     * The new option lives in its own group, and the existing SKU carries one option from each of
     * two other groups - which is the shape that makes both halves of the
     * [model/service/ProductService.cfc:L144] condition observable.
     */
    function buildAddOptionGraph(): {
      readonly product: Product;
      readonly existingSku: Sku;
      readonly newOption: Option;
      readonly sizeOption: Option;
      readonly colourOption: Option;
    } {
      const material = buildOptionGroupWithOption({
        optionGroupID: 'og-material',
        optionGroupName: 'Material',
        optionID: 'opt-cotton',
        optionName: 'Cotton',
        sortOrder: 1,
      });
      const size = buildOptionGroupWithOption({
        optionGroupID: 'og-size',
        optionGroupName: 'Size',
        optionID: 'opt-large',
        optionName: 'Large',
        sortOrder: 2,
      });
      const colour = buildOptionGroupWithOption({
        optionGroupID: 'og-colour',
        optionGroupName: 'Colour',
        optionID: 'opt-red',
        optionName: 'Red',
        sortOrder: 3,
      });

      optionLoading.optionsByID.set('opt-cotton', material.option);

      const existingSku = makeSkuFixture({
        skuID: 'sku-existing-combination',
        options: [size.option, colour.option],
      });
      const defaultSku = makeSkuFixture({
        skuID: 'sku-default-for-pricing',
        price: Money.fromDecimalString('19.99'),
        listPrice: Money.fromDecimalString('24.99'),
      });
      const product = makeProductFixture({
        productID: 'product-gaining-an-option',
        skus: [existingSku],
        defaultSku,
      });

      return {
        product,
        existingSku,
        newOption: material.option,
        sizeOption: size.option,
        colourOption: colour.option,
      };
    }

    it('builds the option list with the NEW option first, then every other group', async () => {
      const graph = buildAddOptionGraph();

      const answered = await service.processProduct_addOption(graph.product, {
        option: 'opt-cotton',
      });

      const recorded = skuCreation.requests[0];

      expect(recorded).toBeDefined();
      expect(skuCreation.requests).toHaveLength(1);

      if (recorded === undefined) {
        throw new Error('the SKU-creation collaborator recorded no request to assert against.');
      }

      // CFML parity [model/service/ProductService.cfc:L131, L146]: the payload's `options` key
      // starts as the NEW option's identifier and every other group's existing option is APPENDED
      // to it, so the new option leads the list.
      expect(recorded.data.options).toBe('opt-cotton,opt-large,opt-red');
      expect(listToArray(recorded.data.options ?? '')).toStrictEqual([
        'opt-cotton',
        'opt-large',
        'opt-red',
      ]);

      expect(answered).toBe(graph.product);
    });

    it('★★★ PERSISTS the SKU set after creation, rather than answering 200 having written nothing', async () => {
      // THE REGRESSION TEST FOR A CRITICAL RUNTIME FINDING. `createSkus` attaches transient SKUs
      // to the product's live collection and, as its own header records, "writes nothing to the
      // database" - under Hibernate the cascade at [model/entity/Product.cfc:L73] inserted them at
      // request-end flush. Nothing in the port replaced that, so this published operation answered
      // HTTP 200 having written NOTHING: QA measured the correct cartesian product built in memory
      // and `SwSku` row counts identical before and after. The write now arrives through the
      // dispatched image-name refresh, as ONE unit of work naming the parent product.
      //
      // The recording SKU-creation double attaches nothing, so the set written here is the product's
      // pre-existing SKU - which is the point: the write covers EVERY SKU on the product, whether the
      // creation step added to the collection or not.
      const graph = buildAddOptionGraph();

      await service.processProduct_addOption(graph.product, { option: 'opt-cotton' });

      // Read AFTER the call, because the collection is LIVE: whatever the creation step attached to
      // it is part of the write set, which is exactly the property the finding was about.
      const collection = [...graph.product.getSkus()];

      expect(collection).toContain(graph.existingSku);
      expect(skuBatchWrite.batches).toStrictEqual([collection]);
      expect(skuBatchWrite.parentProductIDs).toStrictEqual(['product-gaining-an-option']);
      expect(skuRepository.savedSkus).toStrictEqual(collection);
    });

    it('takes both prices from the DEFAULT SKU, unguarded and undefaulted', async () => {
      const graph = buildAddOptionGraph();

      await service.processProduct_addOption(graph.product, { option: 'opt-cotton' });

      const recorded = skuCreation.requests[0];

      if (recorded === undefined) {
        throw new Error('the SKU-creation collaborator recorded no request to assert against.');
      }

      // CFML parity [model/service/ProductService.cfc:L133]: the legacy reads
      // `getDefaultSku().getPrice()` completely unguarded.
      const recordedPrice = recorded.data.price;

      expect(recordedPrice).toBeDefined();

      if (recordedPrice === undefined) {
        throw new Error('the SKU-creation payload carried no price to assert against.');
      }

      expect(recordedPrice.equals(Money.fromDecimalString('19.99'))).toBe(true);

      // LEGACY-NOTE [model/service/ProductService.cfc:L135]: the list-price gate here is one
      // clause, `isNull(...)` alone.
      //
      // On the ported entity this one-clause gate is STATICALLY SATISFIED, because
      // `Sku.getListPrice()` answers a non-optional money value - the column declares a default of
      // zero.
      const recordedListPrice = recorded.data.listPrice;

      expect(recordedListPrice).toBeDefined();

      if (recordedListPrice === undefined) {
        throw new Error('the SKU-creation payload carried no list price to assert against.');
      }

      expect(recordedListPrice.equals(Money.fromDecimalString('24.99'))).toBe(true);
    });

    it('APPENDS NO DUPLICATE when two SKUs share the same option row', async () => {
      const material = buildOptionGroupWithOption({
        optionGroupID: 'og-material',
        optionGroupName: 'Material',
        optionID: 'opt-cotton',
        optionName: 'Cotton',
        sortOrder: 1,
      });
      const size = buildOptionGroupWithOption({
        optionGroupID: 'og-size',
        optionGroupName: 'Size',
        optionID: 'opt-large',
        optionName: 'Large',
        sortOrder: 2,
      });

      optionLoading.optionsByID.set('opt-cotton', material.option);

      const firstSku = makeSkuFixture({ skuID: 'sku-shared-option-a', options: [size.option] });
      const secondSku = makeSkuFixture({ skuID: 'sku-shared-option-b', options: [size.option] });
      const defaultSku = makeSkuFixture({ skuID: 'sku-default-shared' });
      const product = makeProductFixture({
        productID: 'product-with-shared-option',
        skus: [firstSku, secondSku],
        defaultSku,
      });

      await service.processProduct_addOption(product, { option: 'opt-cotton' });

      const recorded = skuCreation.requests[0];

      if (recorded === undefined) {
        throw new Error('the SKU-creation collaborator recorded no request to assert against.');
      }

      // CFML parity [model/service/ProductService.cfc:L144]: the membership test is a negated
      // `listFindNoCase`, and `listFindNoCase` answers a 1-BASED index or 0. In CFML `!0` is true
      // and `!5` is false, so `!listFindNoCase(...)` means "not present".
      expect(recorded.data.options).toBe('opt-cotton,opt-large');
      expect(listToArray(recorded.data.options ?? '')).toStrictEqual(['opt-cotton', 'opt-large']);
    });

    it('SUPPRESSES an existing option whose group matches the new one, case-insensitively', async () => {
      const material = buildOptionGroupWithOption({
        optionGroupID: 'og-material',
        optionGroupName: 'Material',
        optionID: 'opt-cotton',
        optionName: 'Cotton',
        sortOrder: 1,
      });

      const sameGroupDifferentCase = buildOptionGroupWithOption({
        optionGroupID: 'OG-MATERIAL',
        optionGroupName: 'Material',
        optionID: 'opt-linen',
        optionName: 'Linen',
        sortOrder: 2,
      });

      optionLoading.optionsByID.set('opt-cotton', material.option);

      const existingSku = makeSkuFixture({
        skuID: 'sku-same-group-different-case',
        options: [sameGroupDifferentCase.option],
      });
      const defaultSku = makeSkuFixture({ skuID: 'sku-default-same-group' });
      const product = makeProductFixture({
        productID: 'product-same-group-different-case',
        skus: [existingSku],
        defaultSku,
      });

      await service.processProduct_addOption(product, { option: 'opt-cotton' });

      const recorded = skuCreation.requests[0];

      if (recorded === undefined) {
        throw new Error('the SKU-creation collaborator recorded no request to assert against.');
      }

      expect(recorded.data.options).toBe('opt-cotton');
      expect(listToArray(recorded.data.options ?? '')).toStrictEqual(['opt-cotton']);
    });

    it('DISCARDS the SKU-creation outcome and continues regardless', async () => {
      const graph = buildAddOptionGraph();

      skuCreation.outcome = false;

      const dispatchSpy = vi.spyOn(service, 'processProduct_updateDefaultImageFileNames');

      const answered = await service.processProduct_addOption(graph.product, {
        option: 'opt-cotton',
      });

      // LEGACY-NOTE [model/service/ProductService.cfc:L150]: `createSkus` is declared to answer a
      // boolean at [model/service/SkuService.cfc:L58], and the return value is discarded here.
      expect(answered).toBe(graph.product);
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      expect(skuCreation.requests).toHaveLength(1);
    });

    it('fails, unguarded, when the option or the default SKU cannot be resolved', async () => {
      const graph = buildAddOptionGraph();

      // CFML parity [model/service/ProductService.cfc:L130]: the option loader is dereferenced
      // with no null check, exactly as the group loader is at
      // [model/service/ProductService.cfc:L115].
      await expect(
        service.processProduct_addOption(graph.product, { option: 'opt-does-not-exist' }),
      ).rejects.toThrow(MissingAssociationError);

      const refusal = await service
        .processProduct_addOption(graph.product, { option: 'opt-does-not-exist' })
        .then(
          () => undefined,
          (thrown: unknown) => thrown,
        );

      expect(refusal).toBeInstanceOf(MissingAssociationError);
      if (refusal instanceof MissingAssociationError) {
        expect(refusal.fields).toStrictEqual([
          { path: 'option', message: 'must name an existing record' },
        ]);
        expect(refusal.message).not.toContain('opt-does-not-exist');
      }

      // CFML parity [model/service/ProductService.cfc:L133]: and neither is the default SKU.
      // `makeProductFixture` leaves `defaultSku` ABSENT by default, which is load-bearing here - a
      // fixture that supplied one would have hidden this path.
      const withoutDefaultSku = makeProductFixture({ productID: 'product-without-default-sku' });

      await expect(
        service.processProduct_addOption(withoutDefaultSku, { option: 'opt-cotton' }),
      ).rejects.toThrow(/model\/service\/ProductService\.cfc:L133/);

      // Server state, so NOT the client-shaped type - asserted explicitly so the distinction cannot
      // erode into "everything is a 400".
      await expect(
        service.processProduct_addOption(withoutDefaultSku, { option: 'opt-cotton' }),
      ).rejects.not.toBeInstanceOf(MissingAssociationError);

      expect(skuCreation.requests).toStrictEqual([]);

      // Neither refusal wrote anything: both raise before the dispatch that flushes.
      expect(skuBatchWrite.batches).toStrictEqual([]);
      expect(skuRepository.savedSkus).toStrictEqual([]);
    });

    it('★★★ PERSISTS the SKUs the collaborator attached - the ORM cascade, written out', async () => {
      // THE FINDING THIS CASE EXISTS FOR. QA routed this operation and measured HTTP 200 with a
      // save-shaped body and ZERO DML statements. `createSkus` persists nothing itself - its return is
      // a constant `true` [model/service/SkuService.cfc:L207] - because [model/service/ProductService.cfc:L150]'s durability came from
      // `Product.skus` declaring `cascade="all-delete-orphan"` [model/entity/Product.cfc:L73] and the
      // session flushing at request end. Without an ORM that cascade has to be a statement, and the
      // dispatched `processProduct_updateDefaultImageFileNames` now issues it.
      const graph = buildAddOptionGraph();

      await service.processProduct_addOption(graph.product, { option: 'opt-cotton' });

      // The collaborator attached one designated draft SKU, so the product now carries the existing
      // combination AND the new draft - and BOTH reach the datastore in one unit of work.
      const written = graph.product.getSkus();

      expect(written).toHaveLength(2);
      expect(written[0]).toBe(graph.existingSku);
      expect(skuBatchWrite.batches).toStrictEqual([written]);
      expect(skuRepository.savedSkus).toStrictEqual(written);

      // The attached SKU is TRANSIENT and carries its owning product, which is what lets the adapter
      // bind `SwSku.productID` on the insert rather than writing an orphan.
      expect(written[1]?.isNew()).toBe(true);
      expect(written[1]?.getProduct()).toBe(graph.product);
    });
  });
  describe('saveProduct', () => {
    it('preserves both physical table names byte-for-byte', () => {
      // SCHEMA CONTINUITY. The two literals are the uniqueness SCOPE handed to the URL-title port,
      // and they name tables the target continues to read and write unchanged.
      expect(PRODUCT_TABLE_NAME).toBe('SwProduct');
      expect(PRODUCT_TYPE_TABLE_NAME).toBe('SwProductType');
    });

    it('leaves the URL title alone when the entity already carries one', async () => {
      const product = makeProductFixture({});
      const data: ProductSaveInput = {};

      const dispatchSpy = vi.spyOn(service, 'processProduct_updateDefaultImageFileNames');

      const answered = await service.saveProduct(product, data);

      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(product.getUrlTitle()).toBe(FIXTURE_URL_TITLE);

      expect(data).toStrictEqual({});

      // CFML parity [model/service/ProductService.cfc:L276-L282]: the fixture's `productID`
      // defaults to the empty string, so `isNew()` holds, and the fixture validates, so both terms
      // of the conjunction are satisfied and the new-product branch runs.
      expect(skuCreation.requests).toHaveLength(1);
      expect(dispatchSpy).toHaveBeenCalledTimes(1);

      const creation = skuCreation.requests[0];

      if (creation === undefined) {
        throw new Error('the SKU-creation collaborator recorded no request to assert against.');
      }

      // LEGACY-NOTE [model/service/ProductService.cfc:L279]: the save payload itself is handed to
      // sku creation, unchanged and by reference - not a copy, not a projection.
      expect(creation.data).toBe(data);
      expect(creation.product).toBe(product);

      // The three steps are real and they belong to the adapter.
      expect(productRepository.saves).toStrictEqual([product]);
      expect(answered).toBe(persistedProduct);
      expect(answered).not.toBe(product);
      expect(answered.getProductID()).toBe(PERSISTED_PRODUCT_ID);
    });

    it('generates from the RENDERED TITLE TEMPLATE against "SwProduct" when no title is present', async () => {
      const product = makeProductFixture({ urlTitle: undefined });
      const data: ProductSaveInput = {};

      await service.saveProduct(product, data);

      // Contrast the sibling sources: `saveProductType` prefers the payload's `productTypeName`
      // and falls back to the entity's, and `model/service/BrandService.cfc:L69` reads
      // `getBrandName()`.
      expect(urlTitleGenerator.requests).toStrictEqual([
        {
          titleString: `${FIXTURE_BRAND_NAME} ${FIXTURE_PRODUCT_NAME}`,
          tableName: PRODUCT_TABLE_NAME,
        },
      ]);

      // And the calculated snapshot is not what was used, which is the whole point of the
      // correction: the fixture's snapshot differs from the rendered template.
      expect(product.getCalculatedTitle()).toBe(FIXTURE_CALCULATED_TITLE);
      expect(product.getCalculatedTitle()).not.toBe(
        `${FIXTURE_BRAND_NAME} ${FIXTURE_PRODUCT_NAME}`,
      );

      // One asserted the resolved title landed in the CALLER'S PAYLOAD, on the premise that
      // `Product.urlTitle` was `private readonly` "with no setter and no route to add one".
      expect(product.getUrlTitle()).toBe(GENERATED_URL_TITLE);
      expect(data).toStrictEqual({});
      expect(productRepository.savePayloads).toStrictEqual([
        { urlTitle: GENERATED_URL_TITLE, productName: FIXTURE_PRODUCT_NAME },
      ]);

      // The three steps are real and they belong to the adapter.
      expect(productRepository.saves).toStrictEqual([product]);
    });

    it('READS a differently-cased payload key and leaves the caller struct alone', async () => {
      const product = makeProductFixture({ urlTitle: undefined });

      // The untyped-boundary case: a payload that reached this service from a parsed JSON body
      // carrying the legacy CFML spelling `URLTitle`.
      const data: ProductSaveInput = {};
      Reflect.set(data, 'URLTitle', undefined);

      expect(structFindKey(data, 'urlTitle')).toBe('URLTitle');

      await service.saveProduct(product, data);

      // SIDE.
      // CFML parity [model/service/ProductService.cfc:L266]: `populate(data)` copies
      // `data.urlTitle` onto the entity through a key store that folds case, so a payload spelled
      // `URLTitle` populates just as one spelled `urlTitle` does.
      expect(Object.keys(data)).toStrictEqual(['URLTitle']);
      expect(Reflect.get(data, 'URLTitle')).toBeUndefined();
      expect(structFindKey(data, 'urlTitle')).toBe('URLTitle');
      expect(product.getUrlTitle()).toBe(GENERATED_URL_TITLE);

      // And the generation still counted: exactly one call, the resolved value reached persistence
      // through the payload, and the save proceeded.
      expect(urlTitleGenerator.requests).toHaveLength(1);
      expect(productRepository.savePayloads).toStrictEqual([
        { urlTitle: GENERATED_URL_TITLE, productName: FIXTURE_PRODUCT_NAME },
      ]);
      expect(productRepository.saves).toStrictEqual([product]);
    });

    it('★ POPULATES the entity from the payload, EMPTY STRING INCLUDED, before the guard', async () => {
      // The populate step [model/service/ProductService.cfc:L266] copies whatever the key holds.
      const product = makeProductFixture({ urlTitle: 'fixture-title' });
      const data: ProductSaveInput = { urlTitle: '' };

      // The refusal comes back on the returned entity, so the populate assertions read the same
      // instance the method answered with.
      const refused = await refusedEntityOf(() => service.saveProduct(product, data));

      expect(product.getUrlTitle()).toBe('');
      expect(urlTitleGenerator.requests).toStrictEqual([]);

      // The payload is read, never written: it still carries exactly what arrived.
      expect(data).toStrictEqual({ urlTitle: '' });

      // The observable chain is therefore: populate copies the empty string
      // [model/service/ProductService.cfc:L266], the one-clause `isNull()` guard declines to
      // replace it [model/service/ProductService.cfc:L268], and validation then refuses the save
      // [model/service/ProductService.cfc:L273, L286].
      expect(productRepository.saves).toStrictEqual([]);
      expect(productRepository.savePayloads).toStrictEqual([]);

      // Revision one asserted only that nothing was persisted - a state a caller had no way to
      // observe, because the method returned the entity and the entity published no error channel.
      expect(refused).toBe(product);
      expect(refusedRulesOf(refused)).toStrictEqual([
        { propertyIdentifier: 'urlTitle', errorMessage: 'urlTitle is required' },
      ]);
    });

    it('★ POPULATES a non-empty payload title over the entity\u2019s own', async () => {
      const product = makeProductFixture({ urlTitle: 'fixture-title' });
      const data: ProductSaveInput = { urlTitle: 'payload-title' };

      await service.saveProduct(product, data);

      // Populate is UNCONDITIONAL on PRESENCE - it does not defer to the value the entity already
      // carried, because [model/service/ProductService.cfc:L266] runs before
      // [model/service/ProductService.cfc:L268] and simply copies.
      expect(product.getUrlTitle()).toBe('payload-title');
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(productRepository.savePayloads).toStrictEqual([
        { urlTitle: 'payload-title', productName: FIXTURE_PRODUCT_NAME },
      ]);
      expect(productRepository.saves).toStrictEqual([product]);
    });

    it('★ does NOT generate for an EMPTY-STRING title - the ONE-CLAUSE guard', async () => {
      const product = makeProductFixture({ urlTitle: '' });
      const data: ProductSaveInput = {};

      const refused = await refusedEntityOf(() => service.saveProduct(product, data));

      // And it is the caller's own instance, answered rather than raised
      // [model/service/ProductService.cfc:L291].
      expect(refused).toBe(product);
      // LEGACY-NOTE [model/service/ProductService.cfc:L268]: the guard here is one clause -
      // `isNull(arguments.product.getURLTitle())` and nothing else. `isNull('')` is false, so an
      // empty-string url title suppresses generation.
      expect(urlTitleGenerator.requests).toStrictEqual([]);

      expect(skuCreation.requests).toStrictEqual([]);
      expect(productRepository.saves).toStrictEqual([]);

      // The entity is left exactly as populate and the guard left it - the refusal mutates nothing
      // on the way out - and it is that entity which comes back, unpersisted, per
      // [model/service/ProductService.cfc:L291].
      expect(product.getUrlTitle()).toBe('');
      expect(refusedRulesOf(refused)).toStrictEqual([
        { propertyIdentifier: 'urlTitle', errorMessage: 'urlTitle is required' },
      ]);
    });

    it('skips SKU creation for a product that is NOT new, yet still saves it', async () => {
      const product = makeProductFixture({ productID: 'already-persisted-product' });
      const data: ProductSaveInput = {};

      const dispatchSpy = vi.spyOn(service, 'processProduct_updateDefaultImageFileNames');

      const answered = await service.saveProduct(product, data);

      // CFML parity [model/service/ProductService.cfc:L276]: if(arguments.product.isNew() and
      // !arguments.product.hasErrors()) both terms, in order. This case falsifies the FIRST.
      expect(product.isNew()).toBe(false);
      expect(skuCreation.requests).toStrictEqual([]);
      expect(dispatchSpy).not.toHaveBeenCalled();

      expect(productRepository.saves).toStrictEqual([product]);
      expect(answered).toBe(persistedProduct);
    });

    it('neither creates SKUs nor saves an invalid product, and ANSWERS IT UNPERSISTED', async () => {
      const product = makeProductFixture({ productName: undefined });
      const data: ProductSaveInput = {};

      const dispatchSpy = vi.spyOn(service, 'processProduct_updateDefaultImageFileNames');

      const refused = await refusedEntityOf(() => service.saveProduct(product, data));

      // LEGACY-NOTE `model/validation/Product.json`: the `save` context declares exactly five
      // rules - `price`, `productName`, `productCode`, `productType` and `urlTitle`.
      expect(product.isNew()).toBe(true);
      expect(skuCreation.requests).toStrictEqual([]);
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(productRepository.saves).toStrictEqual([]);

      // Revision one closed with "CFML parity [model/service/ProductService.cfc:L291]: the legacy
      // returns `arguments.product` unconditionally, so an invalid product comes back as itself -
      // the caller inspects it, nothing is thrown, and nothing is null".
      expect(refused).toBe(product);
      expect(refused.hasErrors()).toBe(true);
      expect(refused.hasError('productName')).toBe(true);
      // And the lookup is case-insensitive, because a CFML struct key is
      // [org/Hibachi/HibachiErrors.cfc:L15]. A caller spelling the property differently still
      // finds its error.
      expect(refused.hasError('PRODUCTNAME')).toBe(true);
      expect(refusedRulesOf(refused)).toStrictEqual([
        { propertyIdentifier: 'productName', errorMessage: 'productName is required' },
      ]);
      // The message states the rule and not the value that failed it - the same discipline the
      // published field reports follow, so a primary adapter may forward it.
      expect(refused.getError('productName')).toStrictEqual(['productName is required']);
    });

    it('rejects a product code holding an unsupported character', async () => {
      const product = makeProductFixture({ productCode: 'not a valid code' });
      const data: ProductSaveInput = {};

      const refused = await refusedEntityOf(() => service.saveProduct(product, data));

      // And it is the caller's own instance, answered rather than raised
      // [model/service/ProductService.cfc:L291].
      expect(refused).toBe(product);
      expect(productRepository.saves).toStrictEqual([]);
      expect(refusedRulesOf(refused)).toStrictEqual([
        {
          propertyIdentifier: 'productCode',
          errorMessage: 'productCode contains an unsupported character',
        },
      ]);
      // The offending code is not in the refusal. It is caller-submitted data, and a refusal that
      // echoed it would be unsafe for `src/handlers/errorMapper.ts` to publish.
      expect(JSON.stringify(refused.getErrors())).not.toContain('not a valid code');
    });

    // The hand-off: what this service owes the aggregate cascade.
    //
    // The creation double is programmed to ATTACH rather than merely record, because a double that
    // changes nothing cannot show that the change survives.

    it('★ creates SKUs BEFORE saving, and hands the port the instance carrying them', async () => {
      const product = makeProductFixture({});
      const draft = makeSkuFixture({ skuID: PROVISIONAL_SKU_ID, isNew: true, product: undefined });

      // Ordering is captured as a sequence rather than inferred from two counters: a count cannot
      // distinguish "created then saved" from "saved then created".
      const order: string[] = [];

      skuCreation.attachment = (created: Product): void => {
        order.push('createSkus');
        created.addSku(draft);
        created.setDefaultSku(draft);
      };
      productRepository.onSave = (saved: Product): void => {
        order.push('saveProduct');

        // Asserted at the MOMENT of the SAVE, which is the only moment that matters: the port sees
        // the collection and the designation already in place.
        expect(saved.getSkus()).toContain(draft);
        expect(saved.getDefaultSku()).toBe(draft);
      };

      await service.saveProduct(product, {});

      expect(order).toStrictEqual(['createSkus', 'saveProduct']);

      // And the same instance travelled the whole way: `createSkus` was given the argument
      // [model/service/ProductService.cfc:L279] and the DAO was given that same entity eighteen
      // lines later [model/service/ProductService.cfc:L287].
      expect(skuCreation.requests[0]?.product).toBe(product);
      expect(productRepository.saves).toStrictEqual([product]);

      // The designated SKU is still TRANSIENT when persistence receives it, which is the state the
      // adapter reads to defer the `defaultSkuID` write.
      expect(product.getDefaultSku()?.isNew()).toBe(true);
    });

    it('★★★ writes the created SKUs EXACTLY ONCE - the cascade, never a second flush', async () => {
      // THE REGRESSION THIS CASE GUARDS, AND WHY THIS PATH IS THE ONE EXEMPTION.
      // `processProduct_updateDefaultImageFileNames` now flushes the product's SKU set, which is how
      // three previously-unflushable operations became durable. It must NOT do so here.
      // [model/service/ProductService.cfc:L282] dispatches it from the NEW-PRODUCT branch, BEFORE the
      // save at [model/service/ProductService.cfc:L287] has written the owning row - and `SwSku.productID` references `SwProduct`, so a
      // flush from here would bind a product identifier that does not exist yet. The method's
      // `isNew()` gate is what keeps this path as it was: assign the names, let the adapter cascade
      // the children after the parent row, in one transaction.
      const product = makeProductFixture({});
      const draft = makeSkuFixture({ skuID: PROVISIONAL_SKU_ID, isNew: true, product: undefined });

      skuCreation.attachment = (created: Product): void => {
        created.addSku(draft);
        created.setDefaultSku(draft);
      };

      // The dispatch still happens - the names are still composed and assigned - which is what makes
      // the absence of a write below a deliberate exemption rather than a missing call.
      const dispatchSpy = vi.spyOn(service, 'processProduct_updateDefaultImageFileNames');

      await service.saveProduct(product, {});

      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      expect(product.isNew()).toBe(true);
      expect(draft.getImageFile()).toBeDefined();

      // NO batch was opened, so the draft is written by the product save's cascade and by nothing
      // else. A second writer here would either insert the SKU twice or insert it before its parent.
      expect(skuBatchWrite.batches).toStrictEqual([]);
      expect(skuRepository.savedSkus).toStrictEqual([]);
      expect(productRepository.saves).toStrictEqual([product]);
    });

    it('★ REFUSES on the sku-creation ground when a VALID new product ends with no skus', async () => {
      // The double's attachment is overridden to attach nothing, which is exactly the state the
      // note on `RecordingSkuCreation` says the real collaborator reaches only by recording an
      // error.
      const product = makeProductFixture({});
      skuCreation.attachment = (): void => {
        // Records the call through the collaborator itself and attaches no SKU.
      };

      const refused = await refusedEntityOf(() => service.saveProduct(product, {}));

      // And it is the caller's own instance, answered rather than raised
      // [model/service/ProductService.cfc:L291].
      expect(refused).toBe(product);
      // Creation did run - which is what separates this ground from a validation refusal, where
      // the branch is never entered and the zero-SKU state means nothing.
      expect(skuCreation.requests).toHaveLength(1);
      expect(product.getSkus()).toStrictEqual([]);
      expect(productRepository.saves).toStrictEqual([]);

      // One ground, reported against the collection the legacy attached its errors to.
      expect(refusedRulesOf(refused)).toStrictEqual([
        {
          propertyIdentifier: 'skus',
          errorMessage:
            'sku creation attached no sku to this new product, so the product was not persisted',
        },
      ]);
    });

    it('★ hands the port a product with NO skus when creation is skipped', async () => {
      // The complement, and it is not redundant: SKU creation runs only for a NEW product that
      // validates [model/service/ProductService.cfc:L276-L282].
      const product = makeProductFixture({ productID: PERSISTED_PRODUCT_ID });

      skuCreation.attachment = (): void => {
        throw new Error('SKU creation must not run for a product that already has a key.');
      };

      await service.saveProduct(product, {});

      expect(skuCreation.requests).toStrictEqual([]);
      expect(product.getSkus()).toStrictEqual([]);
      expect(product.getDefaultSku()).toBeUndefined();
      expect(productRepository.saves).toStrictEqual([product]);
    });
  });
  describe('saveProductType', () => {
    it('★ prefers the PAYLOAD name, generating against "SwProductType"', async () => {
      const productType = new ProductType({
        productTypeID: 'product-type-being-saved',
        productTypeName: 'Name On The Entity',
      });
      const data: ProductTypeSaveInput = { productTypeName: 'Name In The Payload' };

      const answered = await service.saveProductType(productType, data);

      // CFML parity [model/service/ProductService.cfc:L295]: the guard here is four clauses -
      // (isNull(getURLTitle()) || !len(getURLTitle())) && (!structKeyExists(data,"urlTitle") ||
      // !len(data.urlTitle)) byte-identical in shape to [model/service/BrandService.cfc:L68].
      //
      // CFML parity [model/service/ProductService.cfc:L296]: the preference order is the PAYLOAD's
      // `productTypeName` FIRST and the entity's own SECOND. Both are populated here with
      // DIFFERENT values, the only way to prove which won.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: 'Name In The Payload', tableName: PRODUCT_TYPE_TABLE_NAME },
      ]);

      // This method's own populate-then-save step is what carries the value onward, because
      // `super.save(productType, data)` populates from the payload
      // [org/Hibachi/HibachiService.cfc:L145].
      expect(data.urlTitle).toBe(GENERATED_URL_TITLE);

      // The delegation is asserted as a single-element list so an extra save cannot hide.
      expect(productTypeRepository.saves).toStrictEqual([productType]);
      expect(answered).toBe(productType);
    });

    it('falls back to the ENTITY name when the payload carries none', async () => {
      const productType = new ProductType({
        productTypeID: 'product-type-without-payload-name',
        productTypeName: 'Name On The Entity',
      });
      const data: ProductTypeSaveInput = {};

      await service.saveProductType(productType, data);

      // CFML parity [model/service/ProductService.cfc:L298]: the second inner branch asks
      // `!isNull(getProductTypeName()) && len(...)` - a DIFFERENT guard shape from the payload
      // branch's `structKeyExists(...) && len(...)` one line earlier.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: 'Name On The Entity', tableName: PRODUCT_TYPE_TABLE_NAME },
      ]);
      expect(data.urlTitle).toBe(GENERATED_URL_TITLE);
    });

    it('★ sets NOTHING when neither source yields a name - there is no else', async () => {
      const productType = new ProductType({ productTypeID: 'product-type-with-no-name' });
      const data: ProductTypeSaveInput = {};

      const refused = await refusedEntityOf(() => service.saveProductType(productType, data));

      // CFML parity [model/service/ProductService.cfc:L296-L300]: there is no `else`. When neither
      // the payload nor the entity yields a usable name the URL title is simply never SET - no
      // throw, no fallback, no empty-string default, no generated placeholder.
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(data.urlTitle).toBeUndefined();
      expect(Object.keys(data)).toStrictEqual([]);

      // `super.save` validates before it persists and persists only when clean
      // [org/Hibachi/HibachiService.cfc:L150, L153-L155].
      //
      // The `unique` qualifier on `urlTitle` is deliberately not asserted in memory - it is a
      // whole-table constraint, and no port member answers it.
      expect(productTypeRepository.saves).toStrictEqual([]);

      // And the entity is answered, carrying its errors - the sentence this case has been trying
      // to make true across three revisions.
      expect(refused).toBe(productType);
      expect(refusedRulesOf(refused)).toStrictEqual([
        { propertyIdentifier: 'productTypeName', errorMessage: 'productTypeName is required' },
        { propertyIdentifier: 'urlTitle', errorMessage: 'urlTitle is required' },
      ]);
    });

    it('does not generate when the PAYLOAD already supplies a usable urlTitle', async () => {
      const productType = new ProductType({
        productTypeID: 'product-type-with-payload-title',
        productTypeName: 'Name On The Entity',
      });
      const data: ProductTypeSaveInput = { urlTitle: 'supplied-by-the-caller' };

      await service.saveProductType(productType, data);

      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(data.urlTitle).toBe('supplied-by-the-caller');
    });

    it('★ GENERATES for an EMPTY-STRING payload title, unlike the one-clause guard', async () => {
      const productType = new ProductType({
        productTypeID: 'product-type-with-empty-payload-title',
        productTypeName: 'Name On The Entity',
      });
      const data: ProductTypeSaveInput = { urlTitle: '' };

      await service.saveProductType(productType, data);

      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: 'Name On The Entity', tableName: PRODUCT_TYPE_TABLE_NAME },
      ]);
      expect(data.urlTitle).toBe(GENERATED_URL_TITLE);
    });

    it('★★★ RETURNS a refused product type and does NOT inherit its parent\u2019s products', async () => {
      // The `!hasErrors()` term of [model/service/ProductService.cfc:L306], asserted end to end.
      const parentProduct = makeProductFixture({ productID: 'product-owned-by-a-parent' });
      const parent = new ProductType({ productTypeID: 'parent-of-a-refused-product-type' });
      parent.addProduct(parentProduct);

      // Neither save-context rule of `model/validation/ProductType.json` is satisfiable here: no
      // `productTypeName` and no `urlTitle`, and an empty payload leaves the generation gate with
      // nothing to work from.
      const refusedChild = new ProductType({
        productTypeID: 'refused-child-product-type',
        parentProductType: parent,
      });

      const answered = await service.saveProductType(refusedChild, {});

      expect(answered).toBe(refusedChild);
      expect(refusedRulesOf(answered).map((rule) => rule.propertyIdentifier)).toStrictEqual([
        'productTypeName',
        'urlTitle',
      ]);
      expect(productTypeRepository.saves).toStrictEqual([]);

      // The inheritance did not happen, and the parent is untouched on both sides of the
      // association.
      expect(answered.getProducts()).toStrictEqual([]);
      expect(parent.getProducts()).toStrictEqual([parentProduct]);
    });

    it('answers the PERSISTED instance and inherits from ITS parent, not the argument', async () => {
      const parentProduct = makeProductFixture({ productID: 'product-owned-by-the-parent' });
      const parentProductType = new ProductType({ productTypeID: 'parent-product-type' });
      parentProductType.addProduct(parentProduct);

      const persistedProductType = new ProductType({
        productTypeID: PERSISTED_PRODUCT_TYPE_ID,
        urlTitle: 'persisted-product-type-title',
        parentProductType,
      });
      productTypeRepository.answer = persistedProductType;

      // Both save-context rules from `model/validation/ProductType.json` are satisfied
      // deliberately - `productTypeName` and `urlTitle` are each `required` there.
      const argument = new ProductType({
        productTypeID: 'product-type-argument',
        productTypeName: 'Argument Product Type',
        urlTitle: 'argument-title',
      });

      const answered = await service.saveProductType(argument, {});

      // CFML parity [model/service/ProductService.cfc:L303, L306]: the legacy REASSIGNS
      // `arguments.productType` from the save result and every later line reads the reassigned
      // value, so the parent chain that is consulted belongs to the PERSISTED instance.
      expect(productTypeRepository.saves).toStrictEqual([argument]);
      expect(answered).toBe(persistedProductType);
      expect(answered).not.toBe(argument);
      expect(answered.getProductTypeID()).toBe(PERSISTED_PRODUCT_TYPE_ID);
      expect(answered.getProducts()).toStrictEqual([parentProduct]);
      expect(argument.getProducts()).toStrictEqual([]);
    });

    it("★ REPLACES the child products with the parent's, dropping the child's own", async () => {
      const parentProduct = makeProductFixture({ productID: 'product-owned-by-the-parent' });
      const childProduct = makeProductFixture({ productID: 'product-owned-by-the-child' });

      const parentProductType = new ProductType({ productTypeID: 'parent-product-type' });
      parentProductType.addProduct(parentProduct);

      // Named as well as titled, so both `model/validation/ProductType.json` save rules pass and
      // the inheritance gate at [model/service/ProductService.cfc:L306] is actually reached.
      const childProductType = new ProductType({
        productTypeID: 'child-product-type',
        productTypeName: 'Child Product Type',
        urlTitle: 'child-title',
        parentProductType,
      });
      childProductType.addProduct(childProduct);

      expect(childProductType.getProducts()).toStrictEqual([childProduct]);

      const answered = await service.saveProductType(childProductType, {});

      // LEGACY-DEFECT [model/service/ProductService.cfc:L307]: the parent's product collection is
      // assigned straight to the child, REPLACING rather than merging, so whatever products the
      // child already had are DROPPED.
      // Preserved deliberately; do not fix without a product decision.
      expect(answered.getProducts()).toStrictEqual([parentProduct]);
      expect(answered.getProducts()).not.toContain(childProduct);

      // LEGACY-NOTE [model/entity/ProductType.cfc:L101-L107]: the CFML statement is a reference
      // assignment, so under Hibernate the two entities would have gone on to share one live
      // collection.
      expect(answered.getProducts()).not.toBe(parentProductType.getProducts());

      const laterProduct = makeProductFixture({ productID: 'product-added-to-the-parent-later' });
      parentProductType.addProduct(laterProduct);

      expect(parentProductType.getProducts()).toStrictEqual([parentProduct, laterProduct]);
      expect(answered.getProducts()).toStrictEqual([parentProduct]);
    });

    it('inherits nothing when the parent holds no products, and nothing when there is no parent', async () => {
      const childProduct = makeProductFixture({ productID: 'product-owned-by-the-child' });

      const emptyParent = new ProductType({ productTypeID: 'parent-without-products' });
      // Both save-context rules are satisfied on the two subjects below - `productTypeName` as
      // well as `urlTitle`.
      const withEmptyParent = new ProductType({
        productTypeID: 'child-of-empty-parent',
        productTypeName: 'Child Of Empty Parent',
        urlTitle: 'child-title',
        parentProductType: emptyParent,
      });
      withEmptyParent.addProduct(childProduct);

      const firstAnswer = await service.saveProductType(withEmptyParent, {});

      // CFML parity [model/service/ProductService.cfc:L306]: `arrayLen(...)` is a bare numeric
      // truthiness test on the parent's collection, so an empty parent collection skips the
      // assignment entirely - and the child KEEPS its own products.
      expect(firstAnswer.getProducts()).toStrictEqual([childProduct]);

      const orphanProduct = makeProductFixture({ productID: 'product-owned-by-the-orphan' });
      const withoutParent = new ProductType({
        productTypeID: 'child-without-parent',
        productTypeName: 'Child Without Parent',
        urlTitle: 'orphan-title',
      });
      withoutParent.addProduct(orphanProduct);

      const secondAnswer = await service.saveProductType(withoutParent, {});

      expect(secondAnswer.getParentProductType()).toBeUndefined();
      expect(secondAnswer.getProducts()).toStrictEqual([orphanProduct]);
    });
  });

  // The populate payload both save overrides hand to persistence.
  //
  // Why this group exists separately from the two save groups above.
  //
  // Both members are always stated, never omitted, and that is deliberate rather than incidental:
  // the payload distinguishes an absent key from a key holding `undefined`.
  describe('the populate payload that carries a resolved url title to persistence', () => {
    it('saveProduct hands the GENERATED title to the repository, not just to the caller', async () => {
      const product = makeProductFixture({ urlTitle: undefined });

      await service.saveProduct(product, {});

      // The end-to-end statement of the fix, at this tier: generation fired, and the value it
      // produced is what the repository was handed.
      expect(urlTitleGenerator.requests).toHaveLength(1);
      expect(productRepository.savePayloads).toStrictEqual([
        { urlTitle: GENERATED_URL_TITLE, productName: FIXTURE_PRODUCT_NAME },
      ]);

      // And the entity carries it as well, which is the other half and not a duplicate.
      //
      // The asymmetry with `saveProductType` is preserved and is the source's own: that method's
      // gate writes the CALLER'S STRUCT [model/service/ProductService.cfc:L297, L299], this one
      // writes the entity.
      expect(product.getUrlTitle()).toBe(GENERATED_URL_TITLE);
    });

    it('saveProduct prefers the PAYLOAD title over the entity, and generates for neither', async () => {
      const product = makeProductFixture({ urlTitle: 'a-title-already-on-the-entity' });
      const data: ProductSaveInput = { urlTitle: 'a-title-the-caller-supplied' };

      await service.saveProduct(product, data);

      // Populate first [model/service/ProductService.cfc:L266], then the guard
      // [model/service/ProductService.cfc:L268]: the payload's value becomes the entity's
      // effective title, so the one-clause guard sees a non-null title and no generation happens -
      // and it is the payload's value.
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(productRepository.savePayloads).toStrictEqual([
        { urlTitle: 'a-title-the-caller-supplied', productName: FIXTURE_PRODUCT_NAME },
      ]);
    });

    it('saveProduct carries the PAYLOAD product name, which no step of its own reads', async () => {
      const product = makeProductFixture();
      const data: ProductSaveInput = { productName: 'A Name The Caller Supplied' };

      await service.saveProduct(product, data);

      // `productName` is populated and CARRIED, never branched on: the guard at
      // [model/service/ProductService.cfc:L268] and the save-context rules at
      // [model/service/ProductService.cfc:L273] both concern the url title alone.
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(productRepository.savePayloads).toStrictEqual([
        { urlTitle: FIXTURE_URL_TITLE, productName: 'A Name The Caller Supplied' },
      ]);
    });

    it('saveProduct restates the ENTITY values when the payload carries neither key', async () => {
      const product = makeProductFixture();

      await service.saveProduct(product, {});

      // The no-op populate: both members stated, both taken off the entity. Stating them is what
      // stops the adapter from re-deciding a column this tier already settled.
      expect(productRepository.savePayloads).toStrictEqual([
        { urlTitle: FIXTURE_URL_TITLE, productName: FIXTURE_PRODUCT_NAME },
      ]);
    });

    it('saveProduct hands NO payload at all when validation refused the save', async () => {
      // The ordering guarantee, from the other side. `productName` is `required` in the save
      // context, so this product fails and [model/service/ProductService.cfc:L286-L288] is never
      // reached - which means the payload must not exist either.
      const product = makeProductFixture({ productName: undefined });

      const refused = await refusedEntityOf(() => service.saveProduct(product, {}));

      // And it is the caller's own instance, answered rather than raised
      // [model/service/ProductService.cfc:L291].
      expect(refused).toBe(product);
      expect(productRepository.saves).toStrictEqual([]);
      expect(productRepository.savePayloads).toStrictEqual([]);
      // The refusal is DETECTABLE, so "no payload was handed over" is something a caller learns
      // rather than something only a test can see.
      expect(refusedRulesOf(refused)).toStrictEqual([
        { propertyIdentifier: 'productName', errorMessage: 'productName is required' },
      ]);
    });

    // populate-before-validate, both directions.

    it('★ saveProduct: a VALID PAYLOAD REPAIRS an entity that is invalid on its own', async () => {
      const product = makeProductFixture({ productName: undefined });
      const data: ProductSaveInput = { productName: 'A Name Only The Payload Has' };

      const answered = await service.saveProduct(product, data);

      // It saved, which is the whole assertion: the payload repaired the entity.
      expect(product.hasErrors()).toBe(false);
      expect(productRepository.saves).toStrictEqual([product]);
      expect(answered).toBe(persistedProduct);
      expect(product.getProductName()).toBe('A Name Only The Payload Has');
      expect(productRepository.savePayloads).toStrictEqual([
        { urlTitle: FIXTURE_URL_TITLE, productName: 'A Name Only The Payload Has' },
      ]);
    });

    it('★ saveProduct: an INVALID PAYLOAD cannot pass on STALE entity state', async () => {
      const product = makeProductFixture();
      expect(product.getProductName()).toBe(FIXTURE_PRODUCT_NAME);

      const data: ProductSaveInput = { productName: '   ' };

      const refused = await refusedEntityOf(() => service.saveProduct(product, data));

      // The blank was trimmed on the way in, which is `_setProperty(name, trim(value))`
      // `org/Hibachi/HibachiTransient.cfc`.
      expect(refused.getProductName()).toBe('');
      expect(refusedRulesOf(refused)).toStrictEqual([
        { propertyIdentifier: 'productName', errorMessage: 'productName is required' },
      ]);
      expect(productRepository.saves).toStrictEqual([]);
      expect(productRepository.savePayloads).toStrictEqual([]);
    });

    it('★ saveProduct POPULATES every declared scalar column, trimmed', async () => {
      // The full populate set, in one case, because "expand the typed input and population layer
      // to every in-scope mutable field" is only demonstrably done if every member lands.
      const product = makeProductFixture();
      const data: ProductSaveInput = {
        productName: '  Trimmed Name  ',
        productCode: '  trimmed-code  ',
        productDescription: '  A description.  ',
        activeFlag: false,
        publishedFlag: true,
        sortOrder: 42,
        remoteID: '  remote-42  ',
      };

      await service.saveProduct(product, data);

      expect(product.getProductName()).toBe('Trimmed Name');
      expect(product.getProductCode()).toBe('trimmed-code');
      expect(product.getProductDescription()).toBe('A description.');
      expect(product.getActiveFlag()).toBe(false);
      expect(product.getPublishedFlag()).toBe(true);
      expect(product.getSortOrder()).toBe(42);
      expect(product.getRemoteID()).toBe('remote-42');

      // The entity is what the adapter binds the remaining columns from, so the save happened and
      // the payload restates only the two columns it addresses.
      expect(productRepository.saves).toStrictEqual([product]);
    });

    it('★ saveProduct leaves a column ALONE when the payload omits its key', async () => {
      // `structKeyExists` `org/Hibachi/HibachiTransient.cfc` is the populate guard, so an ABSENT
      // key is not "populate to undefined" - it is "do not touch".
      const product = makeProductFixture({ productCode: 'code-on-the-entity' });

      await service.saveProduct(product, { productName: 'Only The Name Arrived' });

      expect(product.getProductName()).toBe('Only The Name Arrived');
      expect(product.getProductCode()).toBe('code-on-the-entity');
    });

    it('★ saveProduct REFUSES a sortOrder that is not an ORM integer', async () => {
      // The column is `ormtype="integer"` [model/entity/Product.cfc:L59].
      const product = makeProductFixture();

      await expect(service.saveProduct(product, { sortOrder: 1.5 })).rejects.toThrow(
        /ormtype="integer"/,
      );

      expect(productRepository.saves).toStrictEqual([]);
    });

    it('★ saveProductType: a VALID PAYLOAD REPAIRS an entity that is invalid on its own', async () => {
      const productType = new ProductType({ productTypeID: 'nameless-product-type' });
      const data: ProductTypeSaveInput = { productTypeName: 'A Name Only The Payload Has' };

      const answered = await service.saveProductType(productType, data);

      // It saved. And the generation gate fired from the payload name, so the entity now carries a
      // generated `urlTitle` too - which is what satisfies the SECOND required rule.
      expect(productType.hasErrors()).toBe(false);
      expect(productType.getProductTypeName()).toBe('A Name Only The Payload Has');
      expect(productType.getUrlTitle()).toBe(GENERATED_URL_TITLE);
      expect(productTypeRepository.saves).toStrictEqual([productType]);
      // The recording adapter answers the instance it was handed, exactly as the sibling
      // product-type cases assert.
      expect(answered).toBe(productType);
    });

    it('★ saveProductType: an INVALID PAYLOAD cannot pass on STALE entity state', async () => {
      // The entity is valid on its own. The payload blanks the name; populate copies the blank,
      // and the `required` rule then judges it.
      const productType = new ProductType({
        productTypeID: 'valid-product-type',
        productTypeName: 'Name On The Entity',
        urlTitle: 'title-on-the-entity',
      });

      const refused = await refusedEntityOf(() =>
        service.saveProductType(productType, { productTypeName: '  ' }),
      );

      expect(refused.getProductTypeName()).toBe('');
      expect(refusedRulesOf(refused)).toStrictEqual([
        { propertyIdentifier: 'productTypeName', errorMessage: 'productTypeName is required' },
      ]);
      expect(productTypeRepository.saves).toStrictEqual([]);
    });

    it('★ saveProductType POPULATES every declared scalar column, trimmed', async () => {
      const productType = new ProductType({
        productTypeID: 'product-type-to-populate',
        urlTitle: 'title-on-the-entity',
      });

      await service.saveProductType(productType, {
        productTypeName: '  Trimmed Type Name  ',
        productTypeDescription: '  A type description.  ',
        systemCode: '  merchandise  ',
        activeFlag: false,
        publishedFlag: true,
      });

      expect(productType.getProductTypeName()).toBe('Trimmed Type Name');
      expect(productType.getProductTypeDescription()).toBe('A type description.');
      expect(productType.getSystemCode()).toBe('merchandise');
      expect(productType.getActiveFlag()).toBe(false);
      expect(productType.getPublishedFlag()).toBe(true);
      expect(productTypeRepository.saves).toStrictEqual([productType]);
    });

    it('saveProductType hands the resolved title to the repository, from the PAYLOAD name', async () => {
      const productType = new ProductType({
        productTypeID: 'product-type-with-a-payload-name',
        productTypeName: 'Name On The Entity',
      });
      const data: ProductTypeSaveInput = { productTypeName: 'Name In The Payload' };

      await service.saveProductType(productType, data);

      // The ordering this case pins.
      expect(data.urlTitle).toBe(GENERATED_URL_TITLE);
      expect(productTypeRepository.savePayloads).toStrictEqual([
        { urlTitle: GENERATED_URL_TITLE, productTypeName: 'Name In The Payload' },
      ]);

      // And the entity carries it too, which is the other half of `super.save`.
      expect(productType.getUrlTitle()).toBe(GENERATED_URL_TITLE);
    });

    it('saveProductType hands the resolved title through from the ENTITY name too', async () => {
      const productType = new ProductType({
        productTypeID: 'product-type-without-a-payload-name',
        productTypeName: 'Name On The Entity',
      });

      await service.saveProductType(productType, {});

      // The second inner branch [model/service/ProductService.cfc:L298-L299] reaches the same
      // struct key, so the same channel carries it.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: 'Name On The Entity', tableName: PRODUCT_TYPE_TABLE_NAME },
      ]);
      expect(productTypeRepository.savePayloads).toStrictEqual([
        { urlTitle: GENERATED_URL_TITLE, productTypeName: 'Name On The Entity' },
      ]);
    });

    it('saveProductType NEVER reaches persistence when the gate sets nothing', async () => {
      // The `else` that does not exist [model/service/ProductService.cfc:L300], followed to its
      // which turns out not to be persistence.
      const productType = new ProductType({ productTypeID: 'product-type-with-no-name' });
      const data: ProductTypeSaveInput = {};

      const refused = await refusedEntityOf(() => service.saveProductType(productType, data));

      // And it is the caller's own instance, answered rather than raised
      // [model/service/ProductService.cfc:L291].
      expect(refused).toBe(productType);
      expect(urlTitleGenerator.requests).toStrictEqual([]);

      // Nothing was written into the caller's struct - the two write sites
      // [model/service/ProductService.cfc:L297] and [model/service/ProductService.cfc:L299] both
      // sit inside branches that did not fire.
      expect(data).toStrictEqual({});
      expect(productType.getUrlTitle()).toBeUndefined();
      expect(productTypeRepository.saves).toStrictEqual([]);
      expect(productTypeRepository.savePayloads).toStrictEqual([]);
      expect(refused).toBe(productType);
      expect(refusedRulesOf(refused).map((rule) => rule.propertyIdentifier)).toStrictEqual([
        'productTypeName',
        'urlTitle',
      ]);
    });

    it('saveProductType passes a caller-supplied title through untouched', async () => {
      // The entity carries a name for one reason, and it is not the gate: `productTypeName` is
      // `required` in the save context `model/validation/ProductType.json`.
      const productType = new ProductType({
        productTypeID: 'product-type-with-a-payload-title',
        productTypeName: 'Name On The Entity',
      });
      const data: ProductTypeSaveInput = { urlTitle: 'a-title-the-caller-supplied' };

      await service.saveProductType(productType, data);

      // The fourth clause of the gate [model/service/ProductService.cfc:L295] suppresses
      // generation, and the caller's own value is what populate applied - so it is what reaches
      // the row, unchanged.
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(productType.getUrlTitle()).toBe('a-title-the-caller-supplied');
      expect(productTypeRepository.savePayloads).toStrictEqual([
        { urlTitle: 'a-title-the-caller-supplied', productTypeName: 'Name On The Entity' },
      ]);
    });
  });
  describe('deleteProduct', () => {
    it('deletes and answers true when no transaction exists', async () => {
      const product = makeProductFixture({ productID: 'product-to-delete' });

      skuRepository.transactionExists = false;
      productRepository.deleteOutcome = true;

      const answered = await service.deleteProduct(product);

      // CFML parity [model/service/ProductService.cfc:L318]: the delete-context rule is
      // `transactionExistsFlag eq false`, and it is asked through the REPOSITORY rather than
      // through the entity's own accessor.
      expect(skuRepository.transactionProbes).toStrictEqual([
        { productID: 'product-to-delete', skuID: undefined },
      ]);

      // CFML parity [model/service/ProductService.cfc:L326]: super.delete(arguments.product) is
      // POSITIONAL and answers a boolean.
      expect(productRepository.deletes).toStrictEqual([product]);
      expect(answered).toBe(true);
    });

    it('answers false and NEVER REACHES the delete when a transaction exists', async () => {
      const product = makeProductFixture({ productID: 'product-with-a-transaction' });

      skuRepository.transactionExists = true;
      productRepository.deleteOutcome = true;

      const answered = await service.deleteProduct(product);

      expect(productRepository.deletes).toStrictEqual([]);
      expect(answered).toBe(false);

      // CFML parity [model/service/ProductService.cfc:L329-L335]: a delete blocked by validation
      // was never an exception in the legacy - it answered false. No throw is introduced.
      expect(skuRepository.transactionProbes).toHaveLength(1);
    });

    it('answers false and leaves the DEFAULT SKU intact when the delete itself fails', async () => {
      const defaultSku = makeSkuFixture({ skuID: 'sku-default-surviving-a-failed-delete' });
      const product = makeProductFixture({
        productID: 'product-whose-delete-fails',
        defaultSku,
      });

      skuRepository.transactionExists = false;
      productRepository.deleteOutcome = false;

      // The detach is observed while the delete is in flight, because on this path the before and
      // after states are identical and only the middle differs.
      let designationAtDelete: Sku | undefined | 'not-observed' = 'not-observed';

      productRepository.onDelete = (deleted: Product): void => {
        designationAtDelete = deleted.getDefaultSku();
      };

      const answered = await service.deleteProduct(product);

      expect(productRepository.deletes).toStrictEqual([product]);
      expect(answered).toBe(false);

      // CFML parity [model/service/ProductService.cfc:L323, L332]: the legacy takes a SNAPSHOT of
      // the default SKU, DETACHES it with setDefaultSku(javaCast("null","")) so the delete is not
      // blocked by the foreign key, and RESTORES the snapshot on the failure exit.
      expect(designationAtDelete).toBeUndefined();
      expect(productRepository.saves).toStrictEqual([]);

      // And the END STATE is still the contract: the snapshot is back on the product, and it is
      // the same INSTANCE rather than an equal one.
      expect(product.getDefaultSku()).toBe(defaultSku);
    });

    it('DETACHES the default SKU and FLUSHES before the delete, then leaves it detached', async () => {
      const defaultSku = makeSkuFixture({ skuID: 'sku-default-detached-then-deleted' });
      const product = makeProductFixture({
        productID: 'product-whose-delete-succeeds',
        defaultSku,
      });

      skuRepository.transactionExists = false;
      productRepository.deleteOutcome = true;

      const answered = await service.deleteProduct(product);

      // CFML parity [model/service/ProductService.cfc:L323]: the association is cleared so the
      // delete is not blocked by `SwProduct.defaultSkuID`.
      //
      // So this tier issues no write, and the DELETE is the only call it makes.
      expect(productRepository.saves).toStrictEqual([]);
      expect(productRepository.deletes).toStrictEqual([product]);
      expect(answered).toBe(true);

      // The legacy does not restore on success either:
      // [model/service/ProductService.cfc:L329-L333] sits inside the `else` of the delete test.
      // The row is gone, so there is nothing to restore to.
      expect(product.getDefaultSku()).toBeUndefined();
    });

    it('REFUSES BEFORE THE DETACH when a transaction exists - no write at all', async () => {
      const defaultSku = makeSkuFixture({ skuID: 'sku-default-untouched-by-a-refusal' });
      const product = makeProductFixture({
        productID: 'product-refused-before-detach',
        defaultSku,
      });

      skuRepository.transactionExists = true;

      expect(await service.deleteProduct(product)).toBe(false);
      expect(productRepository.saves).toStrictEqual([]);
      expect(productRepository.deletes).toStrictEqual([]);
      expect(product.getDefaultSku()).toBe(defaultSku);
    });

    it('skips the detach flush entirely for a product with no default SKU', async () => {
      const product = makeProductFixture({
        productID: 'product-with-no-default-sku',
        defaultSku: undefined,
      });

      skuRepository.transactionExists = false;
      productRepository.deleteOutcome = true;

      expect(await service.deleteProduct(product)).toBe(true);

      // The legacy assignment at [model/service/ProductService.cfc:L323] was unconditional, but
      // assigning `undefined` over `undefined` and then issuing an UPDATE that changes no column
      // is a write the source never performed - CFML's ORM flushed a dirty entity.
      expect(productRepository.saves).toStrictEqual([]);
      expect(productRepository.deletes).toStrictEqual([product]);
    });
  });
});
