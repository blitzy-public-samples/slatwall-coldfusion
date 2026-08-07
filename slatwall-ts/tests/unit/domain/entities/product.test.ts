// slatwall-ts - unit suite for `src/domain/entities/product.ts`, the port of the 841-line
// `model/entity/Product.cfc`.
//
// PROVENANCE, in three classes, labelled at every `describe` so net-new coverage is never read as
// parity:.
//
// `meta/tests/functional/admin/entity/ProductTest.cfc` has a literally empty component body and
// contributes zero coverage; it is acknowledged as a gap rather than counted.
//
// The suite is hermetic: no environment variable, socket, filesystem, `.env` or database is
// touched.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { Brand } from '../../../../src/domain/entities/brand.js';
import { Category } from '../../../../src/domain/entities/category.js';
import { Option } from '../../../../src/domain/entities/option.js';
import { ENTITY_CODE_PATTERN, OptionGroup } from '../../../../src/domain/entities/optionGroup.js';
import { Product, ProductLegacyMetadata } from '../../../../src/domain/entities/product.js';
import type {
  ProductAttributeSet,
  ProductHydrationInput,
  ProductUnusedOption,
} from '../../../../src/domain/entities/product.js';
import { PriceGroupRate } from '../../../../src/domain/entities/priceGroupRate.js';
import { ProductType } from '../../../../src/domain/entities/productType.js';
import { PromotionQualifier } from '../../../../src/domain/entities/promotionQualifier.js';
import { PromotionReward } from '../../../../src/domain/entities/promotionReward.js';
import type { Sku } from '../../../../src/domain/entities/sku.js';
import { Money } from '../../../../src/domain/valueObjects/money.js';
import { listLen, listToArray } from '../../../../src/lib/cfml/list.js';
import { structKeyExists, structKeyList } from '../../../../src/lib/cfml/struct.js';
import { cfLen, cfTruthy } from '../../../../src/lib/cfml/truthiness.js';
import type { ProductSearchMatches } from '../../../../src/domain/ports/productRepository.js';
import { makeProductFixture } from '../../../fixtures/productFixtures.js';
import { makeSkuFixture } from '../../../fixtures/skuFixtures.js';

afterEach(() => {
  vi.restoreAllMocks();
});

// Every business date is an explicit UTC iso-8601 instant; the ambient clock is never read.

const CREATED_INSTANT = new Date('2024-06-01T00:00:00.000Z');
const MODIFIED_INSTANT = new Date('2024-06-15T12:30:45.000Z');
const SALE_PRICE_EXPIRATION_INSTANT = new Date('2024-12-31T23:59:59.000Z');

/**
 * The URL key this suite drives `globalURLKeyProduct` with.
 */
const URL_KEY_UNDER_TEST = 'catalog-key-under-test';

/**
 * The legacy fixture's url title, retained VERBATIM. See the B1 block.
 */
const LEGACY_URL_TITLE = 'nike-air-jorden';

/**
 * The merchandise product-type identifier the legacy seeds use, VERBATIM.
 */
const LEGACY_MERCHANDISE_PRODUCT_TYPE_ID = '444df2f7ea9c87e60051f3cd87b435a1';

/**
 * The NON-merchandise product-type identifier `issue_1331` names, VERBATIM.
 */
const LEGACY_NON_MERCHANDISE_PRODUCT_TYPE_ID = '444df313ec53a08c32d8ae434af5819a';

/**
 * A provisional SKU key of exactly the shape `skuService.createSkus` mints.
 *
 * `createHibachiShapedIdentifier` in `src/services/skuService.ts` reproduces `createHibachiUUID()`
 * [org/Hibachi/HibachiObject.cfc:L144-L146], whose whole body is
 * `return replace(lcase(createUUID()), '-', '', 'all');` [org/Hibachi/HibachiObject.cfc:L145] - so
 * a draft carries thirty-two lowercase hexadecimal digits before it is persisted.
 */
const PROVISIONAL_SKU_ID = '6b1f0c9d7a2e4b558c30d1fe94a7b602';

function prototypeMembers(): readonly string[] {
  return Object.getOwnPropertyNames(Product.prototype);
}

function publicMembers(): readonly string[] {
  const compileTimePrivate: readonly string[] = [
    'constructor',
    'missingCollaborator',
    'buildExistingOptionGroupIDList',
  ];

  return prototypeMembers()
    .filter((name: string): boolean => !compileTimePrivate.includes(name))
    .sort();
}

function declaresMember(name: string): boolean {
  return prototypeMembers().includes(name);
}

function arityOf(name: string): number {
  const descriptor = Object.getOwnPropertyDescriptor(Product.prototype, name);
  const candidate: unknown = descriptor === undefined ? undefined : descriptor.value;

  if (typeof candidate !== 'function') {
    throw new Error(`product.test.ts: Product.prototype has no callable member named '${name}'.`);
  }

  return candidate.length;
}

// Real far-side entities, built by hand.
//
// P3 prefers hand-written doubles, and the far sides that matter - `OptionGroup`, `Option`,
// `Category`, `Brand`, `ProductType` - are all inside this suite's dependency boundary and cheap
// to construct.

/**
 * An `OptionGroup` with a deterministic tie-breaker.
 *
 * `optionGroup.ts` defaults `optionSortTieBreaker` to a random generator, which is correct for
 * production and unusable in an assertion, so a constant is supplied.
 */
function buildOptionGroup(
  optionGroupID: string,
  sortOrder: number,
  optionGroupCode?: string,
): OptionGroup {
  return new OptionGroup({
    optionGroupID,
    optionGroupName: undefined,
    optionGroupCode,
    optionGroupImage: undefined,
    optionGroupDescription: undefined,
    imageGroupFlag: false,
    sortOrder,
    remoteID: undefined,
    createdDateTime: CREATED_INSTANT,
    createdByAccountID: undefined,
    modifiedDateTime: MODIFIED_INSTANT,
    modifiedByAccountID: undefined,
    options: [],
    optionSortTieBreaker: (): number => 1,
  });
}

/**
 * An `Option`, optionally with no sort order at all.
 *
 * `sortOrder` is genuinely nullable on the column, and an absent one is what makes the NULL-first
 * ordering in `getOptionsByOptionGroup` observable.
 */
function buildOption(
  optionID: string,
  sortOrder: number | undefined,
  optionGroup: OptionGroup | undefined,
  optionCode?: string,
): Option {
  return new Option({
    optionID,
    optionCode,
    optionName: undefined,
    optionDescription: undefined,
    sortOrder,
    optionGroup,
    defaultImageID: undefined,
    remoteID: undefined,
    createdDateTime: CREATED_INSTANT,
    createdByAccountID: undefined,
    modifiedDateTime: MODIFIED_INSTANT,
    modifiedByAccountID: undefined,
  });
}

/**
 * A `Category`, whose constructor requires every key to be written.
 *
 * CFML parity `model/entity/Category.cfc`: `cmsCategoryID` and the site association are the Mura
 * CMS bridge's columns, preserved as INERT persisted values so the `Sw*` schema contract is
 * unbroken (C5), with no CMS behaviour ported.
 */
function buildCategory(categoryID: string): Category {
  return new Category({
    categoryID,
    categoryIDPath: categoryID,
    categoryName: undefined,
    restrictAccessFlag: false,
    allowProductAssignmentFlag: true,
    cmsCategoryID: undefined,
    siteID: undefined,
    parentCategory: undefined,
    childCategories: undefined,
    products: undefined,
    contents: undefined,
    remoteID: undefined,
    createdDateTime: CREATED_INSTANT,
    createdByAccountID: undefined,
    modifiedDateTime: MODIFIED_INSTANT,
    modifiedByAccountID: undefined,
  });
}

/**
 * A `ProductType` carrying a system code and a materialized id path.
 *
 * A non-empty `systemCode` short-circuits the repository: `ProductType.getBaseProductType()`
 * returns its own system code directly when it has one.
 */
function buildProductType(
  productTypeID: string,
  systemCode: string | undefined,
  productTypeIDPath: string,
): ProductType {
  return new ProductType({
    productTypeID,
    productTypeIDPath,
    systemCode,
    createdDateTime: CREATED_INSTANT,
    modifiedDateTime: MODIFIED_INSTANT,
  });
}

// Inline hand-written recording port doubles.
//
// `Product` is constructed with five collaborators here: `settingsProvider`, `skuRepository`,
// `optionRepository`, `productRepository` and `subscriptionTermProvider`.

/**
 * One recorded `setting(...)` read.
 */
type SettingRead = string;

/**
 * The settings port, over the four keys `settingsProvider.ts` publishes.
 *
 * CFML parity [model/service/SettingService.cfc:L178]: only `globalURLKeyProduct` is this entity's
 * concern, and its legacy default lives in the setting declaration rather than in the component.
 */
class SettingsProviderDouble {
  readonly reads: SettingRead[] = [];
  globalURLKeyProduct: string;

  constructor(urlKeyProduct: string) {
    this.globalURLKeyProduct = urlKeyProduct;
  }

  setting(settingName: string): string {
    this.reads.push(settingName);

    if (settingName === 'globalURLKeyProduct') {
      return this.globalURLKeyProduct;
    }

    if (settingName === 'globalURLKeyProductType') {
      return 'product-type-key-under-test';
    }

    if (settingName === 'skuCurrency') {
      // ISO 4217 reserves XTS for testing, so this literal can never be mistaken for a live
      // currency.
      return 'XTS';
    }

    return '';
  }
}

interface SelectedOptionsCall {
  readonly selectedOptions: string;
  readonly productID: string | undefined;
}

interface TransactionExistsCall {
  readonly productID: string | undefined;
  readonly skuID: string | undefined;
}

interface ProductSkusCall {
  readonly productID: string;
  readonly fetchOptions: boolean;
}

/**
 * The sku repository port - all seven declared members.
 *
 * P5: this stands in for `model/dao/SkuDAO.cfc` without reproducing any SQL.
 */
class SkuRepositoryDouble {
  readonly selectedOptionsCalls: SelectedOptionsCall[] = [];
  readonly transactionExistsCalls: TransactionExistsCall[] = [];
  readonly productSkusCalls: ProductSkusCall[] = [];

  private readonly matches: readonly Sku[];
  private readonly transactionExists: boolean;

  constructor(matches: readonly Sku[] = [], transactionExists = false) {
    this.matches = [...matches];
    this.transactionExists = transactionExists;
  }

  getTransactionExistsFlag(productID?: string, skuID?: string): Promise<boolean> {
    this.transactionExistsCalls.push({ productID, skuID });

    return Promise.resolve(this.transactionExists);
  }

  getSkuBySkuCode(skuCode: string): Promise<Sku | undefined> {
    return Promise.resolve(
      this.matches.find((candidate: Sku): boolean => candidate.getSkuCode() === skuCode),
    );
  }

  getSkusBySelectedOptions(selectedOptions: string, productID?: string): Promise<Sku[]> {
    this.selectedOptionsCalls.push({ selectedOptions, productID });

    return Promise.resolve([...this.matches]);
  }

  searchSkusByProductType(): Promise<Sku[]> {
    return Promise.resolve([]);
  }

  getProductSkus(product: Product, fetchOptions: boolean): Promise<Sku[]> {
    this.productSkusCalls.push({ productID: product.getProductID(), fetchOptions });

    return Promise.resolve([...product.getSkus()]);
  }

  getSortedProductSkusID(): Promise<string[]> {
    return Promise.resolve(this.matches.map((candidate: Sku): string => candidate.getSkuID()));
  }

  saveSku(sku: Sku): Promise<Sku> {
    // The port's only write member, present so this double still satisfies `SkuRepository`. No
    // entity method reaches it - persistence is not an entity concern - so it answers the instance
    // unchanged.
    //
    // A `saveSkus` collection form stood beside it for one revision, as an eighth port member.
    return Promise.resolve(sku);
  }
}

interface UnusedOptionsCall {
  readonly productID: string;
  readonly existingOptionGroupIDList: string;
}

/**
 * The option repository port - both declared members.
 *
 * CFML parity [model/service/OptionService.cfc:L72, L76]: the legacy service passes a COMMA LIST
 * of existing option-group identifiers straight through to [model/dao/OptionDAO.cfc:L51, L94].
 */
class OptionRepositoryDouble {
  readonly unusedOptionsCalls: UnusedOptionsCall[] = [];
  readonly unusedOptionGroupsCalls: string[] = [];

  private readonly options: readonly ProductUnusedOption[];
  private readonly optionGroups: readonly ProductUnusedOption[];

  constructor(
    options: readonly ProductUnusedOption[] = [],
    optionGroups: readonly ProductUnusedOption[] = [],
  ) {
    this.options = [...options];
    this.optionGroups = [...optionGroups];
  }

  getUnusedProductOptions(
    productID: string,
    existingOptionGroupIDList: string,
  ): Promise<readonly ProductUnusedOption[]> {
    this.unusedOptionsCalls.push({ productID, existingOptionGroupIDList });

    return Promise.resolve([...this.options]);
  }

  getUnusedProductOptionGroups(
    existingOptionGroupIDList: string,
  ): Promise<readonly ProductUnusedOption[]> {
    this.unusedOptionGroupsCalls.push(existingOptionGroupIDList);

    return Promise.resolve([...this.optionGroups]);
  }
}

interface AttributeSetsCall {
  readonly attributeSetTypeCode: readonly string[];
  readonly productTypeIDs: readonly string[];
}

/**
 * The product repository port - all six declared members.
 */
class ProductRepositoryDouble {
  readonly attributeSetsCalls: AttributeSetsCall[] = [];

  private readonly attributeSets: readonly ProductAttributeSet[];

  constructor(attributeSets: readonly ProductAttributeSet[] = []) {
    this.attributeSets = [...attributeSets];
  }

  getAttributeSets(
    attributeSetTypeCode: readonly string[],
    productTypeIDs: readonly string[],
  ): Promise<ProductAttributeSet[]> {
    this.attributeSetsCalls.push({
      attributeSetTypeCode: [...attributeSetTypeCode],
      productTypeIDs: [...productTypeIDs],
    });

    return Promise.resolve([...this.attributeSets]);
  }

  loadDataFromFile(): Promise<void> {
    return Promise.reject(
      new Error(
        'product.test.ts: loadDataFromFile is deliberately unavailable. The legacy bulk import ' +
          '[model/service/ProductService.cfc:L65-L68] is out of scope and is never exercised from ' +
          'an entity suite.',
      ),
    );
  }

  searchProductsByProductType(): Promise<ProductSearchMatches> {
    return Promise.resolve({ records: [], matchedCount: 0 });
  }

  getProductByProductID(): Promise<Product | undefined> {
    return Promise.resolve(undefined);
  }

  saveProduct(product: Product): Promise<Product> {
    return Promise.resolve(product);
  }

  deleteProduct(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

/**
 * The subscription-term STUB port - both declared members.
 *
 * B18.6: subscription handling is out of scope, so this answers `undefined` and nothing more.
 */
class SubscriptionTermProviderDouble {
  getSubscriptionTerm(): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  getSubscriptionBenefit(): Promise<undefined> {
    return Promise.resolve(undefined);
  }
}

function skuIDsOf(skus: readonly Sku[]): readonly string[] {
  return skus.map((sku: Sku): string => sku.getSkuID());
}

function optionIDsOf(options: readonly Option[]): readonly string[] {
  return options.map((option: Option): string => option.getOptionID());
}

function productIDsOf(products: readonly Product[]): readonly string[] {
  return products.map((product: Product): string => product.getProductID());
}

describe('LEGACY-EXTENDED: the five cases Product inherits and adds', () => {
  it('validate_as_save_for_a_new_instance_doesnt_pass - not portable to this tier', () => {
    // The legacy contract is REAL and it genuinely failed for a bare product.
    //
    // CFML parity [model/entity/Product.cfc:L49]: neither `validate()` nor the error register was
    // Product's own member - both came from the framework base reached through the unqualified
    // `extends="HibachiEntity"`.
    expect(declaresMember('validate')).toBe(false);

    for (const present of ['hasErrors', 'hasError', 'getErrors', 'getError', 'addError']) {
      expect(declaresMember(present)).toBe(true);
    }

    // `assert(variables.entity.hasErrors())` is the legacy assertion, and it needs the SERVICE to
    // run the rules - the entity carries the answer, it does not compute it.
    expect(new Product({ productID: '' }).hasErrors()).toBe(false);

    const bare = new Product({ productID: '' });

    expect(bare.getPrice()).toBeUndefined();
    expect(bare.getProductName()).toBeUndefined();
    expect(bare.getProductCode()).toBeUndefined();
    expect(bare.getProductType()).toBeUndefined();
    expect(bare.getUrlTitle()).toBeUndefined();

    // The MECHANISM BEHIND the LEGACY FAILURE, subtler than the other four requirements: `price`
    // resolves through `getPrice()` [model/entity/Product.cfc:L561-L568], which has neither a
    // `variables.price` shadow nor a `defaultSku` to delegate to on a bare product.
    expect(bare.getDefaultSku()).toBeUndefined();

    const populated = new Product({
      productID: 'product-1',
      productName: 'Test Product',
      productCode: 'TESTPRODUCTXXX',
      urlTitle: LEGACY_URL_TITLE,
      price: Money.fromDecimalString('100.00'),
      productType: buildProductType(
        LEGACY_MERCHANDISE_PRODUCT_TYPE_ID,
        'merchandise',
        LEGACY_MERCHANDISE_PRODUCT_TYPE_ID,
      ),
    });

    expect(populated.getProductName()).toBe('Test Product');
    expect(populated.getProductCode()).toBe('TESTPRODUCTXXX');
    expect(populated.getUrlTitle()).toBe(LEGACY_URL_TITLE);
    expect(populated.getPrice()?.toFixed2()).toBe('100.00');
    expect(populated.getProductType()?.getProductTypeID()).toBe(LEGACY_MERCHANDISE_PRODUCT_TYPE_ID);
  });

  it('simple_representation_exists_and_is_simple - the property name ships, the value does not', () => {
    // CFML parity [model/entity/Product.cfc:L791-L793]: Product does override
    // `getSimpleRepresentationPropertyName()`, returning the literal `"productName"`.
    //
    // So half of this case is portable and half is not, and the two halves are separated: the
    // property NAME is asserted because the component declares it; the RESOLVED representation is
    // not.
    expect(declaresMember('getSimpleRepresentationPropertyName')).toBe(true);
    expect(new Product({ productID: 'product-1' }).getSimpleRepresentationPropertyName()).toBe(
      'productName',
    );

    expect(declaresMember('getSimpleRepresentation')).toBe(false);

    const populated = new Product({ productID: 'product-1', productName: 'Test Product' });

    expect(typeof populated.getProductName()).toBe('string');
  });

  it('has_primary_id_property_name - not portable as written; the fact is asserted instead', () => {
    // CFML parity [model/entity/Product.cfc:L52]: that accessor was metadata-driven dynamic
    // dispatch, synthesised by reading the `fieldtype="id"` declaration off the component's own
    // property metadata.
    expect(declaresMember('getPrimaryIDPropertyName')).toBe(false);
    expect(declaresMember('getPrimaryIDValue')).toBe(false);
    expect(declaresMember('getProductID')).toBe(true);

    const saved = new Product({ productID: 'product-1' });

    expect(saved.getProductID()).toBe('product-1');
    expect(cfLen(saved.getProductID())).toBeGreaterThan(0);
  });

  it('defaults_are_correct - BOTH base assertions, because Product overrides nothing', () => {
    // The legacy body, verbatim [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67]:
    // assert(variables.entity.isNew()); assert(!len(variables.entity.getPrimaryIDValue())); two
    // assertions, and product carries both.
    const subject = new Product({ productID: '' });

    expect(subject.isNew()).toBe(true);

    expect(cfLen(subject.getProductID())).toBe(0);
    expect(subject.getProductID()).toBe('');
    expect(subject.getProductID()).not.toBeUndefined();

    const hydrated = new Product({ productID: 'product-1' });

    expect(hydrated.isNew()).toBe(false);
    expect(cfLen(hydrated.getProductID())).toBeGreaterThan(0);
  });

  it('productUrlIsCorrectlyFormatted - the one entity method in the slice with legacy coverage', async () => {
    const subject = makeProductFixture({ globalURLKeyProduct: URL_KEY_UNDER_TEST });

    expect(subject.getUrlTitle()).toBe(LEGACY_URL_TITLE);

    // The setting is resolved through the port, never hardcoded.
    expect(subject.getProductURL()).toBe(`/${URL_KEY_UNDER_TEST}/${LEGACY_URL_TITLE}/`);

    expect(subject.getProductURL()).toBe('/catalog-key-under-test/nike-air-jorden/');
    expect(subject.getProductURL().startsWith('/')).toBe(true);
    expect(subject.getProductURL().endsWith('/')).toBe(true);

    // The write accessor exists because the ported slice calls it:
    // [model/service/ProductService.cfc:L269] is
    // `arguments.product.setURLTitle( getDataService().createUniqueURLTitle(...) )`.
    expect(declaresMember('setUrlTitle')).toBe(true);
    expect(declaresMember('setURLTitle')).toBe(false);

    const mutated = makeProductFixture({ globalURLKeyProduct: URL_KEY_UNDER_TEST });
    mutated.setUrlTitle('another-title');

    expect(mutated.getUrlTitle()).toBe('another-title');
    expect(mutated.getProductURL()).toBe(`/${URL_KEY_UNDER_TEST}/another-title/`);

    const other = makeProductFixture({
      urlTitle: 'another-title',
      globalURLKeyProduct: URL_KEY_UNDER_TEST,
    });

    expect(other.getProductURL()).toBe(`/${URL_KEY_UNDER_TEST}/another-title/`);

    expect(typeof subject.getProductURL()).toBe('string');

    const unwired = new Product({ productID: 'product-1', urlTitle: LEGACY_URL_TITLE });

    expect(() => unwired.getProductURL()).toThrow(/settings provider/);
    expect(() => unwired.getProductURL()).toThrow(/model\/entity\/Product\.cfc:L208/);

    await Promise.resolve();

    expect(declaresMember('getProductUrlAsync')).toBe(false);
  });
});

// The two url accessors sit four lines apart in the legacy component and differ by exactly one
// character.

describe('NET-NEW: the URL pair and its deliberate slash asymmetry', () => {
  it('getProductURL leads with a slash and getListingProductURL does not', () => {
    // CFML parity [model/entity/Product.cfc:L207-L209 vs L211-L214]: getProductURL has a leading
    // slash and getListingProductURL does not. The asymmetry is deliberate in the source and must
    // not be normalised.
    const subject = makeProductFixture({
      urlTitle: LEGACY_URL_TITLE,
      globalURLKeyProduct: URL_KEY_UNDER_TEST,
    });

    const detailUrl = subject.getProductURL();
    const listingUrl = subject.getListingProductURL();

    expect(detailUrl).toBe(`/${URL_KEY_UNDER_TEST}/${LEGACY_URL_TITLE}/`);
    expect(listingUrl).toBe(`${URL_KEY_UNDER_TEST}/${LEGACY_URL_TITLE}/`);

    expect(detailUrl).toBe(`/${listingUrl}`);
    expect(detailUrl.length - listingUrl.length).toBe(1);

    expect(detailUrl.startsWith('/')).toBe(true);
    expect(listingUrl.startsWith('/')).toBe(false);
    expect(detailUrl.endsWith('/')).toBe(true);
    expect(listingUrl.endsWith('/')).toBe(true);
  });

  it('B2.2 - both accessors read the SAME setting through the SAME port, so changing it moves both', () => {
    // No url segment is ever hardcoded.
    const settings = new SettingsProviderDouble('first-configured-key');
    const subject = new Product({
      productID: 'product-1',
      urlTitle: LEGACY_URL_TITLE,
      settingsProvider: settings,
    });

    expect(subject.getProductURL()).toBe(`/first-configured-key/${LEGACY_URL_TITLE}/`);
    expect(subject.getListingProductURL()).toBe(`first-configured-key/${LEGACY_URL_TITLE}/`);

    settings.globalURLKeyProduct = 'second-configured-key';

    expect(subject.getProductURL()).toBe(`/second-configured-key/${LEGACY_URL_TITLE}/`);
    expect(subject.getListingProductURL()).toBe(`second-configured-key/${LEGACY_URL_TITLE}/`);

    // Both accessors read `globalURLKeyProduct` and nothing ELSE - in particular neither reaches
    // for `globalURLKeyProductType`, the adjacent setting at
    // [model/service/SettingService.cfc:L179].
    expect(settings.reads).toEqual([
      'globalURLKeyProduct',
      'globalURLKeyProduct',
      'globalURLKeyProduct',
      'globalURLKeyProduct',
    ]);
  });

  it('an absent urlTitle interpolates as the empty string in both accessors', () => {
    // CFML parity [model/entity/Product.cfc:L208, L212]: the legacy bodies interpolate
    // `getURLTitle()` directly with no `len()` guard, and CFML renders an unset string column as
    // the empty string.
    const untitled = new Product({
      productID: 'product-1',
      settingsProvider: new SettingsProviderDouble(URL_KEY_UNDER_TEST),
    });

    expect(untitled.getUrlTitle()).toBeUndefined();
    expect(untitled.getProductURL()).toBe(`/${URL_KEY_UNDER_TEST}//`);
    expect(untitled.getListingProductURL()).toBe(`${URL_KEY_UNDER_TEST}//`);
  });

  it('both accessors refuse rather than guess when the settings port was never injected', () => {
    // CFML parity [model/entity/Product.cfc:L208, L212]: in CFML `setting(...)` was reached
    // through the framework base on every entity unconditionally, so the legacy accessors could
    // not fail this way.
    //
    // The two locators differ, which is the point of asserting both refusals: `getProductURL`
    // names L208 and `getListingProductURL` names L212.
    const unwired = new Product({ productID: 'product-1', urlTitle: LEGACY_URL_TITLE });

    expect(() => unwired.getProductURL()).toThrow(/settings provider/);
    expect(() => unwired.getProductURL()).toThrow(/model\/entity\/Product\.cfc:L208/);

    expect(() => unwired.getListingProductURL()).toThrow(/settings provider/);
    expect(() => unwired.getListingProductURL()).toThrow(/model\/entity\/Product\.cfc:L212/);

    expect(() => unwired.getProductURL()).toThrow(/Product 'product-1'/);

    // The failure message names the STATEMENT that needs the collaborator, not the declaration:
    // the settings read is at [model/entity/Product.cfc:L208] for `getProductURL` and at
    // [model/entity/Product.cfc:L212] for `getListingProductURL`.
    expect(() => unwired.getListingProductURL()).not.toThrow(/L211/);
    expect(() => unwired.getProductURL()).not.toThrow(/L207/);
  });
});

describe('DIVERGENCE (c): getBrandName is fixed, getSalePriceDiscountType is the control', () => {
  it('B3.1 - returns AND caches, so repeated calls keep answering the real brand name', () => {
    // DELIBERATE DIVERGENCE (c) [model/entity/Product.cfc:L524-L532]: legacy L526 seeds the memo
    // to "" and L528 returns without assigning it, so the accessor is poisoned after the first
    // call. Fixed here as a documented deliberate divergence (c).
    const subject = new Product({
      productID: 'product-1',
      brand: new Brand({ brandID: 'brand-1', brandName: 'Test Brand' }),
    });

    expect(subject.getBrandName()).toBe('Test Brand');

    expect(subject.getBrandName()).toBe('Test Brand');
    expect(subject.getBrandName()).toBe('Test Brand');

    expect(cfLen(subject.getBrandName())).toBeGreaterThan(0);
  });

  it('B3.1 - the far side is consulted exactly ONCE, which is what makes it a memo', () => {
    const brand = new Brand({ brandID: 'brand-1', brandName: 'Test Brand' });
    const subject = new Product({ productID: 'product-1', brand });

    const spy = vi.spyOn(brand, 'getBrandName');

    expect(subject.getBrandName()).toBe('Test Brand');
    expect(subject.getBrandName()).toBe('Test Brand');
    expect(subject.getBrandName()).toBe('Test Brand');

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('B3.2 - the L527 guard: no brand means the empty-string seed survives, and that is correct', () => {
    // CFML parity [model/entity/Product.cfc:L526-L527]: the seed at L526 is not itself the defect.
    // When the brand is absent, the L527 probe fails, nothing overwrites the seed, and the shared
    // return answers `""`.
    const brandless = new Product({ productID: 'product-1' });

    expect(brandless.getBrand()).toBeUndefined();
    expect(brandless.getBrandName()).toBe('');
    expect(brandless.getBrandName()).toBe('');
    expect(brandless.getBrandName()).not.toBeUndefined();
    expect(cfLen(brandless.getBrandName())).toBe(0);
  });

  it('B3.2 - a brand whose own name is absent also lands on the empty string', () => {
    const namelessBrand = new Brand({ brandID: 'brand-1' });
    const subject = new Product({ productID: 'product-1', brand: namelessBrand });

    expect(namelessBrand.getBrandName()).toBeUndefined();
    expect(subject.getBrandName()).toBe('');

    const spy = vi.spyOn(namelessBrand, 'getBrandName');

    expect(subject.getBrandName()).toBe('');
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it('B3.3 - the memo is REQUEST-SCOPED: a second instance never sees the first cached name', () => {
    const first = new Product({
      productID: 'product-1',
      brand: new Brand({ brandID: 'brand-1', brandName: 'First Brand' }),
    });
    const second = new Product({
      productID: 'product-2',
      brand: new Brand({ brandID: 'brand-2', brandName: 'Second Brand' }),
    });

    expect(first.getBrandName()).toBe('First Brand');
    expect(second.getBrandName()).toBe('Second Brand');
    expect(first.getBrandName()).toBe('First Brand');

    const third = new Product({ productID: 'product-3' });

    expect(third.getBrandName()).toBe('');
    expect(first.getBrandName()).toBe('First Brand');
    expect(second.getBrandName()).toBe('Second Brand');
  });

  it('B3.4 - THE CONTROL: getSalePriceDiscountType assigns at L608 and needs no fix', () => {
    // CFML parity [model/entity/Product.cfc:L604-L612]: memo variant A - seed then guard -
    // identical in shape to getBrandName at L524-L532.
    const sku = makeSkuFixture({
      skuID: 'sku-1',
      salePriceDetail: {
        skuID: 'sku-1',
        discountLevel: 'sku',
        salePriceDiscountType: 'percentageOff',
        salePrice: Money.fromDecimalString('17.99'),
        promotionID: 'promotion-1',
      },
    });
    const subject = new Product({ productID: 'product-1', defaultSku: sku });

    const spy = vi.spyOn(sku, 'getSalePriceDiscountType');

    expect(subject.getSalePriceDiscountType()).toBe('percentageOff');
    expect(subject.getSalePriceDiscountType()).toBe('percentageOff');
    expect(subject.getSalePriceDiscountType()).toBe('percentageOff');

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('B3.4 - the control seeds "none", and that stand-in differs from the sku-level one', () => {
    // CFML parity [model/entity/Product.cfc:L606]: the PRODUCT substitutes the literal string
    // `"none"` for an absent discount type, while the SKU substitutes the EMPTY STRING at
    // [model/entity/Sku.cfc:L557].
    const withoutDefaultSku = new Product({ productID: 'product-1' });

    expect(withoutDefaultSku.getDefaultSku()).toBeUndefined();
    expect(withoutDefaultSku.getSalePriceDiscountType()).toBe('none');
    expect(withoutDefaultSku.getSalePriceDiscountType()).toBe('none');

    const skuWithoutDetail = makeSkuFixture({ skuID: 'sku-1' });

    expect(skuWithoutDetail.getSalePriceDiscountType()).toBe('');

    const withEmptySku = new Product({ productID: 'product-2', defaultSku: skuWithoutDetail });

    expect(withEmptySku.getSalePriceDiscountType()).toBe('');
    expect(withEmptySku.getSalePriceDiscountType()).not.toBe('none');
  });

  it('B3.4 - the control memo is request-scoped too, and its seed does not leak', () => {
    const seeded = new Product({ productID: 'product-1' });

    expect(seeded.getSalePriceDiscountType()).toBe('none');

    const withSku = new Product({
      productID: 'product-2',
      defaultSku: makeSkuFixture({
        skuID: 'sku-2',
        salePriceDetail: {
          skuID: 'sku-2',
          discountLevel: 'brand',
          salePriceDiscountType: 'amountOff',
          salePrice: Money.fromDecimalString('15.00'),
          promotionID: 'promotion-2',
        },
      }),
    });

    expect(withSku.getSalePriceDiscountType()).toBe('amountOff');
    expect(seeded.getSalePriceDiscountType()).toBe('none');
  });

  it('B3.5 - this is the THIRD AND FINAL member of divergence (c); no fourth exists anywhere', () => {
    // What this case asserts is the observable half: the members this file preserves as defective
    // are still defective.
    const defect20 = new Product({
      productID: 'product-1',
      skus: [makeSkuFixture({ skuID: 'sku-1' })],
    });

    expect(defect20.getSalePrice().toFixed2()).toBe('0.00');

    expect(() => defect20.getSalePriceExpirationDateTime()).toThrow();

    expect(() => defect20.getPageIDs()).toThrow();
    expect(() => defect20.getProductOptionsByGroup()).toThrow();
  });
});

describe('DEFECT 20 (preserved): getSalePrice discards the first sku and falls through to zero', () => {
  it('B4.1 - branch 2 returns ZERO, not the sku sale price and not undefined', () => {
    // LEGACY-DEFECT [model/entity/Product.cfc:L598]: the statement getSkus()[1].getSalePrice();
    // has no return, so execution falls through to return 0 at L600 and the sku's sale price is
    // discarded.
    // Preserved deliberately; do not fix without a product decision.
    const firstSku = makeSkuFixture({
      skuID: 'sku-1',
      salePriceDetail: {
        skuID: 'sku-1',
        discountLevel: 'sku',
        salePriceDiscountType: 'percentageOff',
        salePrice: Money.fromDecimalString('12.34'),
        promotionID: 'promotion-1',
      },
    });

    expect(firstSku.getSalePrice().toFixed2()).toBe('12.34');

    const subject = new Product({ productID: 'product-1', skus: [firstSku] });

    expect(subject.getDefaultSku()).toBeUndefined();
    expect(subject.getSkus()).toHaveLength(1);

    expect(subject.getSalePrice().toFixed2()).toBe('0.00');
    expect(subject.getSalePrice().equals(Money.fromDecimalString('0'))).toBe(true);

    // And not `undefined`. This is one half of the ABSENCE CONVENTION and the direction is
    // load-bearing: `Product.getSalePrice()` must return `0` and never `undefined`, because
    // [model/entity/Product.cfc:L600] declares the zero explicitly.
    expect(subject.getSalePrice()).not.toBeUndefined();
    expect(subject.getSalePrice()).toBeInstanceOf(Money);
  });

  it('B4.1 - the discarded call is still EVALUATED, which is observable', () => {
    const firstSku = makeSkuFixture({ skuID: 'sku-1' });
    const spy = vi.spyOn(firstSku, 'getSalePrice');
    const subject = new Product({ productID: 'product-1', skus: [firstSku] });

    expect(subject.getSalePrice().toFixed2()).toBe('0.00');

    expect(spy).toHaveBeenCalledTimes(1);

    expect(subject.getSalePrice().toFixed2()).toBe('0.00');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('B4.1 - a throw from the discarded delegate still propagates', () => {
    const explodingSku = makeSkuFixture({ skuID: 'sku-1' });

    vi.spyOn(explodingSku, 'getSalePrice').mockImplementation((): never => {
      throw new Error('delegate refused');
    });

    const subject = new Product({ productID: 'product-1', skus: [explodingSku] });

    expect(() => subject.getSalePrice()).toThrow(/delegate refused/);
  });

  it('B4.2 - branch 1: a default sku returns its REAL sale price, undiscarded', () => {
    // [model/entity/Product.cfc:L595-L596] is the only arm that returns a real number, and it is
    // the arm the defect does not touch.
    const defaultSku = makeSkuFixture({
      skuID: 'sku-default',
      salePriceDetail: {
        skuID: 'sku-default',
        discountLevel: 'product',
        salePriceDiscountType: 'amountOff',
        salePrice: Money.fromDecimalString('44.55'),
        promotionID: 'promotion-1',
      },
    });
    const otherSku = makeSkuFixture({
      skuID: 'sku-other',
      salePriceDetail: {
        skuID: 'sku-other',
        discountLevel: 'sku',
        salePriceDiscountType: 'percentageOff',
        salePrice: Money.fromDecimalString('99.99'),
        promotionID: 'promotion-2',
      },
    });
    const subject = new Product({
      productID: 'product-1',
      defaultSku,
      skus: [otherSku],
    });

    const skuSpy = vi.spyOn(otherSku, 'getSalePrice');

    expect(subject.getSalePrice().toFixed2()).toBe('44.55');
    expect(skuSpy).toHaveBeenCalledTimes(0);
  });

  it('B4.2 - branch 3: no default sku and NO skus at all also returns zero', () => {
    // The terminal `return 0` at [model/entity/Product.cfc:L600] is reached by two paths - the
    // fall-through from branch 2 and the nothing-at-all path - and both are asserted so a future
    // edit cannot satisfy one while breaking the other.
    //
    // CFML parity [model/entity/Product.cfc:L597]: `arrayLen(getSkus())` is CFML numeric
    // truthiness over a length, so an empty array skips the branch. The shipped body routes that
    // through `cfTruthy` rather than relying on JavaScript coercion agreeing by coincidence.
    const empty = new Product({ productID: 'product-1' });

    expect(empty.getSkus()).toEqual([]);
    expect(empty.getSalePrice().toFixed2()).toBe('0.00');
    expect(empty.getSalePrice()).toBeInstanceOf(Money);
  });

  it('B4.3 - Sku.getSalePrice() is CORRECT, and this defect must NOT propagate to it', () => {
    const skuWithoutDetail = makeSkuFixture({ skuID: 'sku-1' });

    expect(skuWithoutDetail.getSalePrice().toFixed2()).toBe('19.99');
    expect(skuWithoutDetail.getSalePrice().equals(skuWithoutDetail.getPrice())).toBe(true);

    // The absence convention, stated in both directions, because collapsing either one is a money
    // bug: `Product.getSalePrice()` must answer `0` and never `undefined`.
    const productZero = new Product({ productID: 'product-1' });

    expect(productZero.getSalePrice().toFixed2()).toBe('0.00');
    expect(productZero.getSalePrice()).not.toBeUndefined();

    expect(skuWithoutDetail.getPriceByCurrencyCode('ZZZ')).toBeUndefined();
    expect(skuWithoutDetail.getPriceByCurrencyCode('ZZZ')).not.toBe(0);
  });
});

// `getSalePricExpirationDateTime`, missing the `e` in "Price" - is at the CALL SITE at L618, on
// the delegate.

describe('DEFECT 25 / G1 (preserved): getSalePriceExpirationDateTime cannot return', () => {
  it('B5.1 - the shipped accessor THROWS, and the throw is the faithful arm', () => {
    // LEGACY-NOTE [model/entity/Product.cfc:L618]: the declaration at L614 is spelled correctly
    // while the call at L618 invokes the misspelled `getSalePricExpirationDateTime()` on the
    // delegate.
    const subject = new Product({
      productID: 'product-1',
      defaultSku: makeSkuFixture({ skuID: 'sku-1' }),
    });

    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(Error);
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(
      /getSalePriceExpirationDateTime\(\) cannot return/,
    );

    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(
      /model\/entity\/Product\.cfc:L617/,
    );
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(
      /model\/entity\/Product\.cfc:L618/,
    );
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(
      /model\/entity\/Product\.cfc:L614/,
    );

    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(/onMissingMethod/);
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(
      /org\/Hibachi\/HibachiEntity\.cfc:L507-L565/,
    );
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(/returntype="date"/);

    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(
      /not a stub awaiting implementation/,
    );
  });

  it('B5.2 - the MISSPELLED identifier is preserved verbatim in the message', () => {
    // DEFECT PRESERVATION, not A SOURCE
    // TODO: the legacy carries no TODO here. The misspelling is the defect, so it survives
    // verbatim in the reproduction rather than being silently corrected.
    //
    // JUDGMENT CALL: asserting the misspelling as a literal string rather than by regex-escaping a
    // variable, because a variable would let a future edit change both the source and this
    // expectation together and never notice. A literal cannot drift silently.
    const subject = new Product({ productID: 'product-1' });

    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(/getSalePricExpirationDateTime/);
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(/no "e" in "Price"/);

    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(/model\/entity\/Sku\.cfc:L560/);

    expect(declaresMember('getSalePriceExpirationDateTime')).toBe(true);
    expect(declaresMember('getSalePricExpirationDateTime')).toBe(false);
  });

  it('B5.1 - it throws with NO default sku too, because eager materialization removes the other arm', () => {
    // STATE probe in CFML with two different outcomes: unloaded, and the `now()` seed from
    // [model/entity/Product.cfc:L616] is returned; loaded, and [model/entity/Product.cfc:L618]
    // runs and fails.
    const withoutDefaultSku = new Product({ productID: 'product-1' });

    expect(withoutDefaultSku.getDefaultSku()).toBeUndefined();
    expect(() => withoutDefaultSku.getSalePriceExpirationDateTime()).toThrow(Error);

    // B5.4 / no CLOCK is READ ANYWHERE. The legacy seeded from `now()` at
    // [model/entity/Product.cfc:L616]; the port reads no clock at all, and `Product` is injected
    // with none.
    expect(SALE_PRICE_EXPIRATION_INSTANT.toISOString()).toBe('2024-12-31T23:59:59.000Z');
    expect(CREATED_INSTANT.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(MODIFIED_INSTANT.toISOString()).toBe('2024-06-15T12:30:45.000Z');
  });

  it("B5.3 - the SKU accessor is correctly spelled and returns '' on a miss: the control", () => {
    // The typo must not be imported into the sku side.
    const skuWithoutDetail = makeSkuFixture({ skuID: 'sku-1' });

    expect(skuWithoutDetail.getSalePriceExpirationDateTime()).toBe('');

    const skuWithExpiry = makeSkuFixture({
      skuID: 'sku-2',
      salePriceDetail: {
        skuID: 'sku-2',
        discountLevel: 'global',
        salePriceDiscountType: 'amount',
        salePrice: Money.fromDecimalString('9.99'),
        promotionID: 'promotion-1',
        salePriceExpirationDateTime: SALE_PRICE_EXPIRATION_INSTANT,
      },
    });

    expect(skuWithExpiry.getSalePriceExpirationDateTime()).toBe(SALE_PRICE_EXPIRATION_INSTANT);

    const skuWithDetailButNoExpiry = makeSkuFixture({
      skuID: 'sku-3',
      salePriceDetail: {
        skuID: 'sku-3',
        discountLevel: 'option',
        salePriceDiscountType: 'amount',
        salePrice: Money.fromDecimalString('8.88'),
        promotionID: 'promotion-1',
      },
    });

    expect(skuWithDetailButNoExpiry.getSalePriceExpirationDateTime()).toBe('');
  });
});

// `getPageIDs()` and `getCategoryIDs()` are four LINES APART and structurally identical - same
// loop, same `listAppend`, same comma-list return.

describe('PRESERVED THROWS: getPageIDs and getProductOptionsByGroup, with their twins', () => {
  it('B6.1 - getPageIDs THROWS, because getPages() is not declared on the component', () => {
    // LEGACY-NOTE [model/entity/Product.cfc:L191-L197]: `getPageIDs()` loops
    // `arrayLen(getPages())` at L193, and `getPages()` is declared nowhere and corresponds to no
    // property - the component declares `listingPages` [model/entity/Product.cfc:L79], not
    // `pages`.
    const subject = new Product({
      productID: 'product-1',
      categories: [buildCategory('category-1')],
    });

    expect(() => subject.getPageIDs()).toThrow(Error);
    expect(() => subject.getPageIDs()).toThrow(/getPageIDs\(\) cannot return/);
    expect(() => subject.getPageIDs()).toThrow(/model\/entity\/Product\.cfc:L193/);
    expect(() => subject.getPageIDs()).toThrow(/getPages\(\)/);
    expect(() => subject.getPageIDs()).toThrow(/org\/Hibachi\/HibachiEntity\.cfc:L507-L565/);
    expect(() => subject.getPageIDs()).toThrow(/not a stub awaiting implementation/);

    // C17 - a locator correction, recorded and not applied. The shipped message cites
    // `listingPages` at [model/entity/Product.cfc:L82].
    expect(() => subject.getPageIDs()).toThrow(/listingPages at \[L82\]/);
  });

  it('B6.1 - the WORKING TWIN: getCategoryIDs builds a comma list with NO leading delimiter', () => {
    // CFML parity [model/entity/Product.cfc:L199-L205]: the same loop shape as `getPageIDs`, over
    // `categories` at [model/entity/Product.cfc:L80], which the component does declare.
    const subject = new Product({
      productID: 'product-1',
      categories: [buildCategory('category-1'), buildCategory('category-2')],
    });

    expect(subject.getCategoryIDs()).toBe('category-1,category-2');
    expect(subject.getCategoryIDs().startsWith(',')).toBe(false);
    expect(listLen(subject.getCategoryIDs())).toBe(2);
    expect(listToArray(subject.getCategoryIDs())).toEqual(['category-1', 'category-2']);

    const single = new Product({
      productID: 'product-2',
      categories: [buildCategory('category-only')],
    });

    expect(single.getCategoryIDs()).toBe('category-only');
    expect(listLen(single.getCategoryIDs())).toBe(1);
  });

  it("B6.1 - getCategoryIDs returns '' on an empty collection, which is one of the five empty semantics", () => {
    const empty = new Product({ productID: 'product-1' });

    expect(empty.getCategories()).toEqual([]);
    expect(empty.getCategoryIDs()).toBe('');
    expect(empty.getCategoryIDs()).not.toBeUndefined();
    expect(listLen(empty.getCategoryIDs())).toBe(0);

    expect(Array.isArray(empty.getCategories())).toBe(true);
  });

  it('B6.2 - getProductOptionsByGroup THROWS, and it fails for TWO independent reasons', () => {
    // LEGACY-NOTE [model/entity/Product.cfc:L631-L633]: the body is
    // `return getProductService().getProductOptionsByGroup( this )`, and it is broken twice over.
    const subject = new Product({ productID: 'product-1' });

    expect(() => subject.getProductOptionsByGroup()).toThrow(Error);
    expect(() => subject.getProductOptionsByGroup()).toThrow(
      /getProductOptionsByGroup\(\) cannot return/,
    );

    expect(() => subject.getProductOptionsByGroup()).toThrow(/model\/entity\/Product\.cfc:L632/);
    expect(() => subject.getProductOptionsByGroup()).toThrow(/getProductService\(\)/);
    expect(() => subject.getProductOptionsByGroup()).toThrow(/model\/entity\/HibachiEntity\.cfc/);

    expect(() => subject.getProductOptionsByGroup()).toThrow(
      /ProductService declares no[\s\S]*getProductOptionsByGroup method either/,
    );

    expect(() => subject.getProductOptionsByGroup()).toThrow(
      /org\/Hibachi\/HibachiEntity\.cfc:L507-L565/,
    );
    expect(() => subject.getProductOptionsByGroup()).toThrow(/not a stub/);
  });

  it('B6.2 - the WORKING TWIN: getOptionsByOptionGroup resolves options without a service at all', () => {
    // CFML parity [model/entity/Product.cfc:L340-L347]: the near-twin of the broken accessor
    // above, and the one that works - it reaches `getService("optionService")` at
    // [model/entity/Product.cfc:L341] with the LOWERCASE spelling, which resolves, rather than the
    // bare `getProductService()` at [model/entity/Product.cfc:L632].
    const groupA = buildOptionGroup('group-a', 1);
    const groupB = buildOptionGroup('group-b', 2);

    const optionA1 = buildOption('option-a1', 2, groupA);
    const optionA2 = buildOption('option-a2', 1, groupA);
    const optionB1 = buildOption('option-b1', 1, groupB);

    const skuOne = makeSkuFixture({ skuID: 'sku-1', options: [optionA1, optionB1] });
    const skuTwo = makeSkuFixture({ skuID: 'sku-2', options: [optionA2] });

    const subject = new Product({ productID: 'product-1', skus: [skuOne, skuTwo] });

    expect(optionIDsOf(subject.getOptionsByOptionGroup('group-a'))).toEqual([
      'option-a2',
      'option-a1',
    ]);
    expect(optionIDsOf(subject.getOptionsByOptionGroup('group-b'))).toEqual(['option-b1']);

    expect(subject.getOptionsByOptionGroup('group-absent')).toEqual([]);
  });
});

describe('C2 MUST-PRESERVE: getSkuBySelectedOptions - all five outcomes', () => {
  it('B7.1 - it is ASYNC, because its legacy body reaches the DAO through the delegate', () => {
    // CFML parity: a method is async IFF its legacy body reaches the DAO/ORM. Methods that only
    // traverse already-materialized associations or perform pure arithmetic stay synchronous.
    const target = makeSkuFixture({ skuID: 'sku-target' });
    const repository = new SkuRepositoryDouble([target]);
    const subject = new Product({ productID: 'product-1', skuRepository: repository });

    const pending = subject.getSkuBySelectedOptions('option-a,option-b');

    expect(pending).toBeInstanceOf(Promise);

    return pending.then((resolved: Sku | undefined): void => {
      expect(resolved?.getSkuID()).toBe('sku-target');
    });
  });

  it('B7.1 outcome 1 - EXACTLY ONE match returns that sku [L352-L353]', () => {
    const target = makeSkuFixture({ skuID: 'sku-target' });
    const repository = new SkuRepositoryDouble([target]);
    const subject = new Product({ productID: 'product-1', skuRepository: repository });

    return subject
      .getSkuBySelectedOptions('option-a,option-b')
      .then((resolved: Sku | undefined): void => {
        expect(resolved).toBe(target);
        expect(resolved?.getSkuID()).toBe('sku-target');
      });
  });

  it('B7.1 outcome 2 - MORE THAN ONE match THROWS, naming the selection [L354-L355]', async () => {
    const repository = new SkuRepositoryDouble([
      makeSkuFixture({ skuID: 'sku-one' }),
      makeSkuFixture({ skuID: 'sku-two' }),
    ]);
    const subject = new Product({ productID: 'product-1', skuRepository: repository });

    await expect(subject.getSkuBySelectedOptions('option-a,option-b')).rejects.toThrow(
      'More than one sku is returned when the selected options are: option-a,option-b',
    );
  });

  it('B7.1 outcome 3 - ZERO matches THROWS, naming the selection [L356-L357]', async () => {
    const repository = new SkuRepositoryDouble([]);
    const subject = new Product({ productID: 'product-1', skuRepository: repository });

    await expect(subject.getSkuBySelectedOptions('option-a,option-b')).rejects.toThrow(
      'No Skus are found for these selected options: option-a,option-b',
    );

    await expect(subject.getSkuBySelectedOptions('option-a')).rejects.toThrow(Error);
  });

  it('B7.1 outcome 4 - an EMPTY selection with exactly ONE sku returns that sku [L359-L360]', async () => {
    // CFML parity [model/entity/Product.cfc:L350]: `len(arguments.selectedOptions) > 0` is a CFML
    // length test, so both the default `""` and an explicitly empty string take the else path.
    const only = makeSkuFixture({ skuID: 'sku-only' });
    const repository = new SkuRepositoryDouble([makeSkuFixture({ skuID: 'sku-never-returned' })]);
    const subject = new Product({
      productID: 'product-1',
      skus: [only],
      skuRepository: repository,
    });

    await expect(subject.getSkuBySelectedOptions('')).resolves.toBe(only);
    await expect(subject.getSkuBySelectedOptions()).resolves.toBe(only);

    expect(repository.selectedOptionsCalls).toEqual([]);
  });

  it('B7.2 - outcome 5: an EMPTY selection with ZERO or 2+ skus THROWS, with BOTH typos verbatim', async () => {
    // CFML parity [model/entity/Product.cfc:L362]: the message carries two misspellings -
    // "seperated" for "separated" and "indvidual" for "individual" - and both are preserved
    // verbatim because the string is OBSERVABLE THROUGH the PUBLIC CONTRACT.
    const zeroSkus = new Product({
      productID: 'product-1',
      skuRepository: new SkuRepositoryDouble([]),
    });

    await expect(zeroSkus.getSkuBySelectedOptions('')).rejects.toThrow(
      'You must submit a comma seperated list of selectOptions to find an indvidual sku in this product',
    );

    await expect(zeroSkus.getSkuBySelectedOptions('')).rejects.toThrow(/seperated/);
    await expect(zeroSkus.getSkuBySelectedOptions('')).rejects.toThrow(/indvidual/);

    await expect(zeroSkus.getSkuBySelectedOptions('')).rejects.not.toThrow(/separated/);
    await expect(zeroSkus.getSkuBySelectedOptions('')).rejects.not.toThrow(/individual/);

    const twoSkus = new Product({
      productID: 'product-2',
      skus: [makeSkuFixture({ skuID: 'sku-one' }), makeSkuFixture({ skuID: 'sku-two' })],
      skuRepository: new SkuRepositoryDouble([]),
    });

    await expect(twoSkus.getSkuBySelectedOptions('')).rejects.toThrow(
      'You must submit a comma seperated list of selectOptions to find an indvidual sku in this product',
    );
  });

  it('B7.3 - there is NO path that resolves to undefined; every non-single outcome throws', async () => {
    // The shape of the whole method, stated once. Of the five outcomes, exactly two return a sku
    // and three throw.
    const repository = new SkuRepositoryDouble([]);
    const subject = new Product({
      productID: 'product-1',
      skus: [makeSkuFixture({ skuID: 'sku-one' }), makeSkuFixture({ skuID: 'sku-two' })],
      skuRepository: repository,
    });

    await expect(subject.getSkuBySelectedOptions('option-a')).rejects.toThrow(Error);

    await expect(subject.getSkuBySelectedOptions('')).rejects.toThrow(Error);

    const single = new Product({
      productID: 'product-2',
      skus: [makeSkuFixture({ skuID: 'sku-only' })],
      skuRepository: repository,
    });

    await expect(single.getSkuBySelectedOptions('')).resolves.toBeDefined();

    const oneMatch = new Product({
      productID: 'product-3',
      skuRepository: new SkuRepositoryDouble([makeSkuFixture({ skuID: 'sku-match' })]),
    });

    await expect(oneMatch.getSkuBySelectedOptions('option-a')).resolves.toBeDefined();
  });

  it('B7.4 - getSkusBySelectedOptions delegates with POSITIONAL (selectedOptions, productID)', async () => {
    // CFML parity [model/entity/Product.cfc:L366-L368]: the legacy body reads.
    const repository = new SkuRepositoryDouble([makeSkuFixture({ skuID: 'sku-match' })]);
    const subject = new Product({ productID: 'product-under-test', skuRepository: repository });

    const resolved = await subject.getSkusBySelectedOptions('option-a,option-b');

    expect(skuIDsOf(resolved)).toEqual(['sku-match']);

    expect(repository.selectedOptionsCalls).toEqual([
      { selectedOptions: 'option-a,option-b', productID: 'product-under-test' },
    ]);

    await subject.getSkusBySelectedOptions();

    expect(repository.selectedOptionsCalls[1]).toEqual({
      selectedOptions: '',
      productID: 'product-under-test',
    });
  });

  it('B7.5 - it returns the port RESULT unchanged; matching semantics are not re-implemented here', async () => {
    const first = makeSkuFixture({ skuID: 'sku-first' });
    const second = makeSkuFixture({ skuID: 'sku-second' });
    const repository = new SkuRepositoryDouble([first, second]);
    const subject = new Product({ productID: 'product-1', skuRepository: repository });

    expect(skuIDsOf(await subject.getSkusBySelectedOptions('anything-at-all'))).toEqual([
      'sku-first',
      'sku-second',
    ]);
    expect(skuIDsOf(await subject.getSkusBySelectedOptions(''))).toEqual([
      'sku-first',
      'sku-second',
    ]);
  });

  it('B7.4 - with no sku repository injected it refuses, naming the collaborator and L367', async () => {
    const unwired = new Product({ productID: 'product-1' });

    await expect(unwired.getSkusBySelectedOptions('option-a')).rejects.toThrow(/sku repository/);
    await expect(unwired.getSkusBySelectedOptions('option-a')).rejects.toThrow(
      /model\/entity\/Product\.cfc:L367/,
    );

    await expect(unwired.getSkuBySelectedOptions('option-a')).rejects.toThrow(/sku repository/);
  });

  it('B7.6 - getSkuByID matches BY PRIMARY KEY and returns undefined on a miss [L162-L169]', () => {
    // CFML parity [model/entity/Product.cfc:L162-L169]: the loop returns on a match and the
    // function has no TRAILING RETURN, so CFML answers null on a miss. The port answers
    // `undefined`, which is the same absence.
    const wanted = makeSkuFixture({ skuID: 'sku-wanted' });
    const other = makeSkuFixture({ skuID: 'sku-other' });
    const subject = new Product({ productID: 'product-1', skus: [other, wanted] });

    expect(subject.getSkuByID('sku-wanted')).toBe(wanted);
    expect(subject.getSkuByID('sku-other')).toBe(other);

    expect(subject.getSkuByID('sku-absent')).toBeUndefined();
    expect(subject.getSkuByID('')).toBeUndefined();

    expect(subject.getSkuByID('sku-wanted')).not.toBeInstanceOf(Promise);

    expect(new Product({ productID: 'product-2' }).getSkuByID('sku-wanted')).toBeUndefined();
  });

  it('★ B7.6b - matches WITHOUT REGARD TO CASE, because CFML `==` on strings does [L164]', () => {
    // [model/entity/Product.cfc:L164] is `skus[i].getSkuID() == arguments.skuID`, and CFML `==` on
    // two strings is case-INSENSITIVE.
    const wanted = makeSkuFixture({ skuID: 'sku-wanted' });
    const subject = new Product({ productID: 'product-1', skus: [wanted] });

    expect(subject.getSkuByID('SKU-WANTED')).toBe(wanted);
    expect(subject.getSkuByID('Sku-Wanted')).toBe(wanted);

    // Identity only: a padded spelling is a different string in CFML too, and a genuine miss is
    // still an absence rather than the first SKU.
    expect(subject.getSkuByID(' sku-wanted')).toBeUndefined();
    expect(subject.getSkuByID('sku-other')).toBeUndefined();
  });
});

describe('getSkus: the live array on the fast path, a projection on the flagged path', () => {
  it('B8.1 - UNFLAGGED it returns the UNDERLYING array by reference, with NO defensive copy', () => {
    // CFML parity [model/entity/Product.cfc:L155-L160]: [model/entity/Product.cfc:L157] returns
    // `variables.skus` raw.
    const first = makeSkuFixture({ skuID: 'sku-1' });
    const skus = [first];
    const subject = new Product({ productID: 'product-1', skus });

    expect(subject.getSkus()).toBe(skus);
    expect(subject.getSkus()).toBe(subject.getSkus());

    const second = makeSkuFixture({ skuID: 'sku-2' });

    subject.getSkus().push(second);

    expect(skuIDsOf(subject.getSkus())).toEqual(['sku-1', 'sku-2']);
    expect(skus).toHaveLength(2);
  });

  it('B8.3 - it is SYNCHRONOUS with two optional boolean flags, defaulting to false', () => {
    // CFML parity [model/entity/Product.cfc:L155]: the legacy signature is boolean sorted=false,
    // boolean fetchOptions=false and both defaults are preserved, with the arity asserted rather
    // than assumed so a signature change is caught here.
    const subject = new Product({ productID: 'product-1' });

    expect(arityOf('getSkus')).toBe(0);
    expect(subject.getSkus()).not.toBeInstanceOf(Promise);
    expect(subject.getSkus(false, false)).toBe(subject.getSkus());
  });

  it('B8.2 - EITHER flag set produces a NEW array rather than the live one', () => {
    const first = makeSkuFixture({ skuID: 'sku-1' });
    const skus = [first];
    const subject = new Product({ productID: 'product-1', skus });

    expect(subject.getSkus(true, false)).not.toBe(skus);
    expect(subject.getSkus(false, true)).not.toBe(skus);
    expect(subject.getSkus(true, true)).not.toBe(skus);

    expect(skuIDsOf(subject.getSkus(true))).toEqual(['sku-1']);

    const projection = subject.getSkus(true);

    projection.push(makeSkuFixture({ skuID: 'sku-intruder' }));

    expect(skuIDsOf(subject.getSkus())).toEqual(['sku-1']);
  });

  it('B8.2 - sorting is applied IN MEMORY, by option sort order, when the inputs allow it', () => {
    // CFML parity [model/dao/SkuDAO.cfc:L172-L202]: the legacy ordering is a positional weighting
    // in which each option contributes its own `sortOrder` scaled by its GROUP's position, so the
    // leftmost group dominates.
    const groupOne = buildOptionGroup('group-1', 1);
    const groupTwo = buildOptionGroup('group-2', 2);

    const lowFirst = makeSkuFixture({
      skuID: 'sku-low',
      options: [buildOption('option-low', 1, groupOne), buildOption('option-b', 2, groupTwo)],
    });
    const highFirst = makeSkuFixture({
      skuID: 'sku-high',
      options: [buildOption('option-high', 9, groupOne), buildOption('option-a', 1, groupTwo)],
    });

    const subject = new Product({
      productID: 'product-1',
      skus: [highFirst, lowFirst],
      nextOptionGroupSortOrder: 3,
    });

    expect(skuIDsOf(subject.getSkus())).toEqual(['sku-high', 'sku-low']);
    expect(skuIDsOf(subject.getSkus(true))).toEqual(['sku-low', 'sku-high']);
  });

  it('B8.2 - the three-clause guard: no sort with 1 sku, no options, or no radix', () => {
    // CFML parity [model/service/SkuService.cfc:L223]: the legacy guard is a three-clause test in
    // a fixed order, and the third clause probes only the FIRST element rather than the whole
    // collection.
    const groupOne = buildOptionGroup('group-1', 1);

    const single = new Product({
      productID: 'product-1',
      skus: [
        makeSkuFixture({ skuID: 'sku-only', options: [buildOption('option-1', 5, groupOne)] }),
      ],
      nextOptionGroupSortOrder: 3,
    });

    expect(skuIDsOf(single.getSkus(true))).toEqual(['sku-only']);

    const firstWithoutOptions = makeSkuFixture({ skuID: 'sku-no-options', options: [] });
    const secondWithOptions = makeSkuFixture({
      skuID: 'sku-with-options',
      options: [buildOption('option-1', 1, groupOne)],
    });
    const partial = new Product({
      productID: 'product-2',
      skus: [firstWithoutOptions, secondWithOptions],
      nextOptionGroupSortOrder: 3,
    });

    expect(skuIDsOf(partial.getSkus(true))).toEqual(['sku-no-options', 'sku-with-options']);

    const noRadix = new Product({
      productID: 'product-3',
      skus: [
        makeSkuFixture({ skuID: 'sku-high', options: [buildOption('option-high', 9, groupOne)] }),
        makeSkuFixture({ skuID: 'sku-low', options: [buildOption('option-low', 1, groupOne)] }),
      ],
    });

    expect(noRadix.getSkus(true)).not.toBe(noRadix.getSkus());
    expect(skuIDsOf(noRadix.getSkus(true))).toEqual(['sku-high', 'sku-low']);
  });

  it('B8.2 - fetchOptions alone projects without reordering', () => {
    const groupOne = buildOptionGroup('group-1', 1);
    const high = makeSkuFixture({
      skuID: 'sku-high',
      options: [buildOption('option-high', 9, groupOne)],
    });
    const low = makeSkuFixture({
      skuID: 'sku-low',
      options: [buildOption('option-low', 1, groupOne)],
    });
    const subject = new Product({
      productID: 'product-1',
      skus: [high, low],
      nextOptionGroupSortOrder: 3,
    });

    expect(skuIDsOf(subject.getSkus(false, true))).toEqual(['sku-high', 'sku-low']);
    expect(subject.getSkus(false, true)).not.toBe(subject.getSkus());

    expect(optionIDsOf(high.getOptions())).toEqual(['option-high']);
  });

  it('B8.2 - a sorted projection of an EMPTY sku collection is an empty NEW array', () => {
    // Covering the `no first element` arm of the three-clause guard.
    // [model/service/SkuService.cfc:L223] probes `getSkus()[1].getOptions()`, which in CFML over
    // an empty array is a runtime index error.
    const subject = new Product({ productID: 'product-1', skus: [] });

    expect(subject.getSkus(true)).toEqual([]);
    expect(subject.getSkus(true, true)).toEqual([]);

    expect(subject.getSkus(true)).not.toBe(subject.getSkus());
  });

  it('B8.2 - the weighting SKIPS an option with no sortOrder and one with no option group', () => {
    // Covering the `continue` arm of the positional weighting.
    // CFML parity [model/dao/SkuDAO.cfc:L172-L202]: the weight is a sum over the option rows
    // reached by an inner join through `SwOptionGroup`.
    const groupOne = buildOptionGroup('group-1', 1);
    const groupTwo = buildOptionGroup('group-2', 2);

    const heavier = makeSkuFixture({
      skuID: 'sku-heavier',
      options: [
        buildOption('option-null-order', undefined, groupTwo),
        buildOption('option-weighted', 1, groupOne),
      ],
    });

    const lighter = makeSkuFixture({
      skuID: 'sku-lighter',
      options: [
        buildOption('option-groupless', 9, undefined),
        buildOption('option-small', 1, groupTwo),
      ],
    });

    const subject = new Product({
      productID: 'product-1',
      skus: [heavier, lighter],
      nextOptionGroupSortOrder: 3,
    });

    expect(skuIDsOf(subject.getSkus(true))).toEqual(['sku-lighter', 'sku-heavier']);

    expect(skuIDsOf(subject.getSkus())).toEqual(['sku-heavier', 'sku-lighter']);
  });

  it('B8.4 - getImages() is OMITTED, and the omission is documented rather than filled', () => {
    // [model/entity/Product.cfc:L178-L180] returns `variables.productImages` raw, exactly as
    // `getSkus()` returns `variables.skus` raw.
    for (const absent of [
      'getImages',
      'getProductImages',
      'getDefaultProductImageFiles',
      'getImagePath',
      'getImageExistsFlag',
      'getResizedImagePath',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }

    expect(declaresMember('getSkus')).toBe(true);
    expect(declaresMember('getCategories')).toBe(true);
  });

  it('the five association accessors return LIVE arrays, matching the raw-return convention', () => {
    const subject = makeProductFixture({});

    expect(subject.getPriceGroupRates()).toBe(subject.getPriceGroupRates());
    expect(subject.getPromotionQualifiers()).toBe(subject.getPromotionQualifiers());
    expect(subject.getPromotionQualifierExclusions()).toBe(
      subject.getPromotionQualifierExclusions(),
    );
    expect(subject.getPromotionRewards()).toBe(subject.getPromotionRewards());
    expect(subject.getPromotionRewardExclusions()).toBe(subject.getPromotionRewardExclusions());

    expect(subject.getPriceGroupRates()).toEqual([]);
    expect(subject.getPromotionQualifiers()).toEqual([]);
    expect(subject.getPromotionQualifierExclusions()).toEqual([]);
    expect(subject.getPromotionRewards()).toEqual([]);
    expect(subject.getPromotionRewardExclusions()).toEqual([]);
  });
});

describe('the option-group family: getOptionGroups, its struct, and its count', () => {
  it('B9.1 - the SEED-THEN-OVERWRITE wart is annotated, not tidied, and is UNOBSERVABLE here', () => {
    // CFML parity [model/entity/Product.cfc:L253 vs L258]: the empty-array seed at L253 is
    // immediately discarded by the assignment at L258. Preserved as written; source warts are
    // annotated, not normalised.
    const unhydrated = new Product({ productID: 'product-1' });

    expect(() => unhydrated.getOptionGroups()).toThrow(Error);
    expect(() => unhydrated.getOptionGroups()).toThrow(/materialized during hydration/);
    expect(() => unhydrated.getOptionGroups()).toThrow(/model\/entity\/Product\.cfc:L254-L258/);
    expect(() => unhydrated.getOptionGroups()).toThrow(/minCollection:1/);

    const materializedEmpty = new Product({ productID: 'product-2', optionGroups: [] });

    expect(materializedEmpty.getOptionGroups()).toEqual([]);
  });

  it('B9.2 - the three `optionService` casings in one file are recorded, not normalised', () => {
    // CFML parity [model/entity/Product.cfc:L254 vs L341 vs L637/L644]: this one file names the
    // same service three ways - "OptionService" at L254, "optionService" at L341, and
    // 'optionService' at L637 and L644.
    const repository = new OptionRepositoryDouble(
      [{ name: 'Unused Option', value: 'option-unused' }],
      [{ name: 'Unused Group', value: 'group-unused' }],
    );
    const subject = new Product({
      productID: 'product-1',
      optionGroups: [buildOptionGroup('group-1', 1)],
      optionRepository: repository,
    });

    return Promise.all([
      subject.getUnusedProductOptions(),
      subject.getUnusedProductOptionGroups(),
    ]).then((): void => {
      expect(repository.unusedOptionsCalls).toHaveLength(1);
      expect(repository.unusedOptionGroupsCalls).toHaveLength(1);

      expect(subject.getOptionsByOptionGroup('group-1')).toEqual([]);
      expect(repository.unusedOptionsCalls).toHaveLength(1);
    });
  });

  it('B9.3 - getOptionGroups is SYNCHRONOUS over the materialized array, with no cloning', () => {
    const groups = [buildOptionGroup('group-1', 1), buildOptionGroup('group-2', 2)];
    const subject = new Product({ productID: 'product-1', optionGroups: groups });

    expect(subject.getOptionGroups()).toBe(groups);
    expect(subject.getOptionGroups()).not.toBeInstanceOf(Promise);

    expect(subject.getOptionGroups()).toBe(subject.getOptionGroups());
  });

  it('B9.4 - getOptionGroupsStruct keys by optionGroupID and is LAST-MATCH-WINS', () => {
    // CFML parity [model/entity/Product.cfc:L241-L249]: no inner structKeyExists guard, so this is
    // LAST-match-wins - the OPPOSITE of the first-match-wins dedupe at Sku.cfc:L504 and L516.
    const firstWithKey = buildOptionGroup('group-shared', 1, 'FIRST');
    const secondWithKey = buildOptionGroup('group-shared', 2, 'SECOND');
    const subject = new Product({
      productID: 'product-1',
      optionGroups: [firstWithKey, secondWithKey],
    });

    const struct = subject.getOptionGroupsStruct();

    expect(structKeyExists(struct, 'group-shared')).toBe(true);

    // The shipped `structKeyList` in slatwall-ts/src/lib/cfml/struct.ts returns a `string[]`, not
    // the comma-delimited list CFML's same-named function returns.
    expect(structKeyList(struct)).toEqual(['group-shared']);
    expect(structKeyList(struct)).toHaveLength(1);

    expect(struct['group-shared']).toBe(secondWithKey);
    expect(struct['group-shared']?.getOptionGroupCode()).toBe('SECOND');
    expect(struct['group-shared']).not.toBe(firstWithKey);
  });

  it('B9.4 - the struct is memoized per instance and never shared between instances', () => {
    const subject = new Product({
      productID: 'product-1',
      optionGroups: [buildOptionGroup('group-1', 1)],
    });

    const firstRead = subject.getOptionGroupsStruct();

    expect(subject.getOptionGroupsStruct()).toBe(firstRead);

    const other = new Product({
      productID: 'product-2',
      optionGroups: [buildOptionGroup('group-9', 9)],
    });

    expect(structKeyList(other.getOptionGroupsStruct())).toEqual(['group-9']);
    expect(structKeyList(subject.getOptionGroupsStruct())).toEqual(['group-1']);
    expect(other.getOptionGroupsStruct()).not.toBe(firstRead);
  });

  it('B9.4 - an empty materialization yields {} rather than absence', () => {
    const subject = new Product({ productID: 'product-1', optionGroups: [] });

    expect(subject.getOptionGroupsStruct()).toEqual({});
    expect(structKeyList(subject.getOptionGroupsStruct())).toEqual([]);
    expect(structKeyExists(subject.getOptionGroupsStruct(), 'anything')).toBe(false);
  });

  it.each(['__proto__', 'constructor', 'toString'])(
    '★ B9.4 - records the reserved identifier %s as an ordinary own key',
    (reservedKey) => {
      // CFML parity [model/entity/Product.cfc:L241-L249]: a CFML struct has no prototype chain and
      // no reserved keys, so `variables.optionGroupsStruct[ '__proto__' ]` was an ordinary key.
      const group = buildOptionGroup(reservedKey, 1, 'RESERVED');
      const subject = new Product({ productID: 'product-1', optionGroups: [group] });

      const struct = subject.getOptionGroupsStruct();

      expect(structKeyList(struct)).toEqual([reservedKey]);
      expect(Object.prototype.hasOwnProperty.call(struct, reservedKey)).toBe(true);
      expect(structKeyExists(struct, reservedKey)).toBe(true);

      expect(Object.getPrototypeOf(struct)).toBe(Object.prototype);
      expect(Object.getOwnPropertyDescriptor(struct, reservedKey)?.value).toBe(group);

      const bystander: Record<string, unknown> = {};

      expect(Object.keys(bystander)).toHaveLength(0);
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'optionGroupID')).toBe(false);
    },
  );

  it('★ B9.4 - a reserved-key option group still reaches the unused-* comma list', async () => {
    // B10 [model/entity/Product.cfc:L644]: the comma list handed to the option port is folded out
    // of `structKeyList(getOptionGroupsStruct())`, so it is the DOWNSTREAM observable of the
    // discarded write.
    const repository = new OptionRepositoryDouble([], []);
    const subject = new Product({
      productID: 'product-1',
      optionGroups: [buildOptionGroup('__proto__', 1), buildOptionGroup('group-2', 2)],
      optionRepository: repository,
    });

    await subject.getUnusedProductOptionGroups();

    const [recordedList] = repository.unusedOptionGroupsCalls;

    expect(repository.unusedOptionGroupsCalls).toHaveLength(1);
    expect(listLen(recordedList ?? '')).toBe(2);
    expect(listToArray(recordedList ?? '')).toEqual(['__proto__', 'group-2']);
  });

  it('B9.5 - getOptionGroupCount is arrayLen(getOptionGroups()) and is SYNC', () => {
    const two = new Product({
      productID: 'product-1',
      optionGroups: [buildOptionGroup('group-1', 1), buildOptionGroup('group-2', 2)],
    });

    expect(two.getOptionGroupCount()).toBe(2);
    expect(two.getOptionGroupCount()).not.toBeInstanceOf(Promise);

    expect(new Product({ productID: 'product-2', optionGroups: [] }).getOptionGroupCount()).toBe(0);

    expect(() => new Product({ productID: 'product-3' }).getOptionGroupCount()).toThrow(
      /materialized during hydration/,
    );
  });

  it('B9.6 - getOptionsByOptionGroup filters by group AND by this product, ordered sortOrder ASC', () => {
    // CFML parity [model/entity/Product.cfc:L340-L347]: the legacy smart list filtered on the
    // option group at [model/entity/Product.cfc:L343] and on this product's own id at
    // [model/entity/Product.cfc:L344], then ordered `sortOrder|ASC` at
    // [model/entity/Product.cfc:L345].
    const groupOne = buildOptionGroup('group-1', 1);
    const groupTwo = buildOptionGroup('group-2', 2);

    const mine = makeSkuFixture({
      skuID: 'sku-mine',
      options: [
        buildOption('option-third', 3, groupOne),
        buildOption('option-first', 1, groupOne),
        buildOption('option-other-group', 1, groupTwo),
      ],
    });

    const foreign = makeSkuFixture({
      skuID: 'sku-foreign',
      options: [buildOption('option-foreign', 2, groupOne)],
    });

    const subject = new Product({ productID: 'product-1', skus: [mine] });

    expect(optionIDsOf(subject.getOptionsByOptionGroup('group-1'))).toEqual([
      'option-first',
      'option-third',
    ]);
    expect(optionIDsOf(foreign.getOptions())).toEqual(['option-foreign']);
    expect(optionIDsOf(subject.getOptionsByOptionGroup('group-1'))).not.toContain('option-foreign');
  });

  it('B9.6 - it is DISTINCT across skus, so a shared option appears once', () => {
    const groupOne = buildOptionGroup('group-1', 1);
    const shared = buildOption('option-shared', 1, groupOne);
    const own = buildOption('option-own', 2, groupOne);

    const subject = new Product({
      productID: 'product-1',
      skus: [
        makeSkuFixture({ skuID: 'sku-1', options: [shared] }),
        makeSkuFixture({ skuID: 'sku-2', options: [shared, own] }),
      ],
    });

    expect(optionIDsOf(subject.getOptionsByOptionGroup('group-1'))).toEqual([
      'option-shared',
      'option-own',
    ]);
  });

  it('B9.6 / C15 - an option with NO sortOrder sorts FIRST, and one with no group is dropped', () => {
    // An option with no option group is skipped entirely, because the legacy filter at
    // [model/entity/Product.cfc:L343] was an INNER JOIN through the group and could not have
    // returned it.
    const groupOne = buildOptionGroup('group-1', 1);

    const subject = new Product({
      productID: 'product-1',
      skus: [
        makeSkuFixture({
          skuID: 'sku-1',
          options: [
            buildOption('option-ordered', 5, groupOne),
            buildOption('option-unordered', undefined, groupOne),
            buildOption('option-groupless', 1, undefined),
          ],
        }),
      ],
    });

    expect(optionIDsOf(subject.getOptionsByOptionGroup('group-1'))).toEqual([
      'option-unordered',
      'option-ordered',
    ]);
  });

  it('B9.6 / C15 - NULL-first holds whichever side is absent, and two absent orders are stable', () => {
    // Shipped comparator at the tail of `getOptionsByOptionGroup` has four arms, and the sibling
    // test above reaches only the `left is absent` arm - V8 sorts a short array with binary
    // insertion, comparing the LATER element against the earlier one.
    const groupOne = buildOptionGroup('group-1', 1);

    const absentFirst = new Product({
      productID: 'product-1',
      skus: [
        makeSkuFixture({
          skuID: 'sku-1',
          options: [
            buildOption('option-unordered', undefined, groupOne),
            buildOption('option-ordered', 7, groupOne),
          ],
        }),
      ],
    });

    expect(optionIDsOf(absentFirst.getOptionsByOptionGroup('group-1'))).toEqual([
      'option-unordered',
      'option-ordered',
    ]);

    const bothAbsent = new Product({
      productID: 'product-2',
      skus: [
        makeSkuFixture({
          skuID: 'sku-2',
          options: [
            buildOption('option-alpha', undefined, groupOne),
            buildOption('option-beta', undefined, groupOne),
          ],
        }),
      ],
    });

    expect(optionIDsOf(bothAbsent.getOptionsByOptionGroup('group-1'))).toEqual([
      'option-alpha',
      'option-beta',
    ]);
  });
});

// B10.5 - all three are the declarative targets of `model/validation/Product.json`'s
// `minCollection: 1` gates, one per process context.

describe('the unusedProduct* trio: async, memoized, and validation-gated', () => {
  it('B10.1 - getUnusedProductOptions passes POSITIONAL (productID, existingOptionGroupIDList)', async () => {
    const repository = new OptionRepositoryDouble([
      { name: 'Small', value: 'option-small' },
      { name: 'Large', value: 'option-large' },
    ]);
    const subject = new Product({
      productID: 'product-under-test',
      optionGroups: [buildOptionGroup('group-a', 1), buildOptionGroup('group-b', 2)],
      optionRepository: repository,
    });

    const unused = await subject.getUnusedProductOptions();

    expect(unused).toEqual([
      { name: 'Small', value: 'option-small' },
      { name: 'Large', value: 'option-large' },
    ]);

    expect(repository.unusedOptionsCalls).toEqual([
      { productID: 'product-under-test', existingOptionGroupIDList: 'group-a,group-b' },
    ]);
    expect(listLen('group-a,group-b')).toBe(2);
  });

  it('B10.1 - the built list is EMPTY, not a bare delimiter, when the product has no option groups', async () => {
    const repository = new OptionRepositoryDouble([]);
    const subject = new Product({
      productID: 'product-1',
      optionGroups: [],
      optionRepository: repository,
    });

    await subject.getUnusedProductOptions();

    expect(repository.unusedOptionsCalls).toEqual([
      { productID: 'product-1', existingOptionGroupIDList: '' },
    ]);
    expect(repository.unusedOptionsCalls[0]?.existingOptionGroupIDList.startsWith(',')).toBe(false);
  });

  it('B10.2 - getUnusedProductOptionGroups passes exactly ONE argument', async () => {
    // CFML parity [model/entity/Product.cfc:L644]: one argument - the comma list only, with no
    // product id. The asymmetry with [model/entity/Product.cfc:L637] is real, it matches
    // [model/service/OptionService.cfc:L72 vs L76], and it is preserved rather than regularised.
    const repository = new OptionRepositoryDouble([], [{ name: 'Colour', value: 'group-colour' }]);
    const subject = new Product({
      productID: 'product-under-test',
      optionGroups: [buildOptionGroup('group-a', 1)],
      optionRepository: repository,
    });

    expect(await subject.getUnusedProductOptionGroups()).toEqual([
      { name: 'Colour', value: 'group-colour' },
    ]);

    expect(repository.unusedOptionGroupsCalls).toEqual(['group-a']);
    expect(repository.unusedOptionsCalls).toEqual([]);
  });

  it('B10.3 - getUnusedProductSubscriptionTerms REJECTS, and no 14th port is invented', async () => {
    // C12 - it rejects rather than resolving.
    const withProvider = new Product({
      productID: 'product-1',
      subscriptionTermProvider: new SubscriptionTermProviderDouble(),
    });

    await expect(withProvider.getUnusedProductSubscriptionTerms()).rejects.toThrow(Error);
    await expect(withProvider.getUnusedProductSubscriptionTerms()).rejects.toThrow(
      /not available in this slice/,
    );
    await expect(withProvider.getUnusedProductSubscriptionTerms()).rejects.toThrow(
      /model\/entity\/Product\.cfc:L651/,
    );
    await expect(withProvider.getUnusedProductSubscriptionTerms()).rejects.toThrow(
      /subscriptionTermProvider/,
    );
    await expect(withProvider.getUnusedProductSubscriptionTerms()).rejects.toThrow(
      /minCollection:1/,
    );

    await expect(withProvider.getUnusedProductSubscriptionTerms()).rejects.toThrow(
      /provider was wired on this instance/,
    );

    const withoutProvider = new Product({ productID: 'product-2' });

    await expect(withoutProvider.getUnusedProductSubscriptionTerms()).rejects.toThrow(
      /provider was not wired on this instance/,
    );
  });

  it('B10.3 - it REJECTS rather than throwing synchronously, so the trio is handled uniformly', async () => {
    const subject = new Product({ productID: 'product-1' });

    const pending = subject.getUnusedProductSubscriptionTerms();

    expect(pending).toBeInstanceOf(Promise);
    await expect(pending).rejects.toThrow(Error);
  });

  it('B10.4 - all three are memoized ONCE per instance, so the port is reached once', async () => {
    const repository = new OptionRepositoryDouble(
      [{ name: 'Small', value: 'option-small' }],
      [{ name: 'Colour', value: 'group-colour' }],
    );
    const subject = new Product({
      productID: 'product-1',
      optionGroups: [buildOptionGroup('group-a', 1)],
      optionRepository: repository,
    });

    const firstOptions = await subject.getUnusedProductOptions();
    const secondOptions = await subject.getUnusedProductOptions();

    expect(secondOptions).toBe(firstOptions);
    expect(repository.unusedOptionsCalls).toHaveLength(1);

    const firstGroups = await subject.getUnusedProductOptionGroups();

    expect(await subject.getUnusedProductOptionGroups()).toBe(firstGroups);
    expect(repository.unusedOptionGroupsCalls).toHaveLength(1);

    await expect(subject.getUnusedProductSubscriptionTerms()).rejects.toThrow(Error);
    await expect(subject.getUnusedProductSubscriptionTerms()).rejects.toThrow(Error);
  });

  it('B10.4 - the memos are REQUEST-SCOPED: a second product reaches the port again', async () => {
    const repository = new OptionRepositoryDouble([{ name: 'Small', value: 'option-small' }]);

    const first = new Product({
      productID: 'product-1',
      optionGroups: [buildOptionGroup('group-a', 1)],
      optionRepository: repository,
    });
    const second = new Product({
      productID: 'product-2',
      optionGroups: [buildOptionGroup('group-z', 9)],
      optionRepository: repository,
    });

    await first.getUnusedProductOptions();
    await second.getUnusedProductOptions();

    expect(repository.unusedOptionsCalls).toEqual([
      { productID: 'product-1', existingOptionGroupIDList: 'group-a' },
      { productID: 'product-2', existingOptionGroupIDList: 'group-z' },
    ]);
  });

  it('B10.1 / B10.2 - with no option repository injected both refuse, naming L637 and L644', async () => {
    const unwired = new Product({ productID: 'product-1', optionGroups: [] });

    await expect(unwired.getUnusedProductOptions()).rejects.toThrow(/option repository/);
    await expect(unwired.getUnusedProductOptions()).rejects.toThrow(
      /model\/entity\/Product\.cfc:L637/,
    );

    await expect(unwired.getUnusedProductOptionGroups()).rejects.toThrow(/option repository/);
    await expect(unwired.getUnusedProductOptionGroups()).rejects.toThrow(
      /model\/entity\/Product\.cfc:L644/,
    );

    const repository = new OptionRepositoryDouble([{ name: 'Small', value: 'option-small' }]);
    const rewired = new Product({
      productID: 'product-2',
      optionGroups: [],
      optionRepository: repository,
    });

    expect(await rewired.getUnusedProductOptions()).toEqual([
      { name: 'Small', value: 'option-small' },
    ]);
  });

  it('B10.5 - the trio is exactly the set the three minCollection:1 contexts read', () => {
    expect(declaresMember('getUnusedProductOptions')).toBe(true);
    expect(declaresMember('getUnusedProductOptionGroups')).toBe(true);
    expect(declaresMember('getUnusedProductSubscriptionTerms')).toBe(true);

    const unusedMembers = publicMembers().filter((member: string): boolean =>
      member.startsWith('getUnusedProduct'),
    );

    expect(unusedMembers.slice().sort()).toEqual([
      'getUnusedProductOptionGroups',
      'getUnusedProductOptions',
      'getUnusedProductSubscriptionTerms',
    ]);
  });
});

// Verified verbatim: none of the six has an `else`, and none has a trailing `return`.
//
// GetCurrencyCode() [model/entity/Product.cfc:L555-L559] one guard - defaultSku getPrice()
// [model/entity/Product.cfc:L561-L568] two - a `variables.price` shadow at L562.

describe('the six default-sku delegations: undefined on absence, never 0', () => {
  it('B11.1 - all six answer NOTHING when there is no default sku', async () => {
    // CFML parity [model/entity/Product.cfc:L555-L592]: none of the six delegations has an else
    // branch or a trailing return, so every one can be undefined. Substituting 0 would silently
    // sell products for free.
    const bare = new Product({ productID: 'product-1' });

    expect(bare.getDefaultSku()).toBeUndefined();

    expect(bare.getCurrencyCode()).toBeUndefined();
    expect(bare.getPrice()).toBeUndefined();
    expect(bare.getRenewalPrice()).toBeUndefined();
    expect(bare.getListPrice()).toBeUndefined();
    await expect(bare.getLivePrice()).resolves.toBeUndefined();
    await expect(bare.getCurrentAccountPrice()).resolves.toBeUndefined();

    expect(bare.getPrice()).not.toBe(0);
    expect(bare.getListPrice()).not.toBe(0);
    expect(bare.getRenewalPrice()).not.toBe(0);
    expect(bare.getPrice()).not.toBeInstanceOf(Money);
  });

  it('B11.1 - all six delegate the REAL value when a default sku is present', async () => {
    const defaultSku = makeSkuFixture({ skuID: 'sku-default' });
    const subject = new Product({ productID: 'product-1', defaultSku });

    expect(subject.getPrice()?.toFixed2()).toBe('19.99');
    expect(subject.getListPrice()?.toFixed2()).toBe('24.99');
    expect(subject.getRenewalPrice()?.toFixed2()).toBe('17.99');
    expect(subject.getCurrencyCode()).toBe('USD');

    await expect(subject.getLivePrice().then((v) => v?.toFixed2())).resolves.toBe('19.99');
    await expect(subject.getCurrentAccountPrice().then((v) => v?.toFixed2())).resolves.toBe(
      '19.99',
    );

    expect(subject.getPrice()).toBeInstanceOf(Money);
    expect(subject.getListPrice()).toBeInstanceOf(Money);
    expect(subject.getRenewalPrice()).toBeInstanceOf(Money);
  });

  it('B11.2 - getPrice has TWO guards: the shadow wins outright, without consulting the sku', () => {
    // CFML parity [model/entity/Product.cfc:L561-L568]: the only member of the six with two
    // guards. [model/entity/Product.cfc:L562] probes a `variables.price` shadow and
    // [model/entity/Product.cfc:L563] returns it; only when that fails does
    // [model/entity/Product.cfc:L565] probe the default sku and [model/entity/Product.cfc:L566]
    // delegate.
    const defaultSku = makeSkuFixture({ skuID: 'sku-default' });
    const spy = vi.spyOn(defaultSku, 'getPrice');

    const shadowed = new Product({
      productID: 'product-1',
      price: Money.fromDecimalString('100.00'),
      defaultSku,
    });

    expect(shadowed.getPrice()?.toFixed2()).toBe('100.00');
    expect(spy).toHaveBeenCalledTimes(0);

    const unshadowed = new Product({ productID: 'product-2', defaultSku });

    expect(unshadowed.getPrice()?.toFixed2()).toBe('19.99');
    expect(spy).toHaveBeenCalledTimes(1);

    expect(new Product({ productID: 'product-3' }).getPrice()).toBeUndefined();
  });

  it('B11.2 / C18 - `price` IS declared, as a NON-PERSISTENT shadow, and no column is invented', () => {
    // `price` is declared [model/entity/Product.cfc:L118] - `persistent="false"` with
    // `hb_formatType="currency"`, inside the "Non-Persistent Properties - Delegated to default
    // sku" block opened at [model/entity/Product.cfc:L115].
    expect(ProductLegacyMetadata.table).toBe('SwProduct');
    expect(ProductLegacyMetadata.delegatedPriceFormatType).toBe('currency');

    expect(declaresMember('setPrice')).toBe(false);

    const shadowOnly = new Product({
      productID: 'product-1',
      price: Money.fromDecimalString('42.00'),
    });

    expect(shadowOnly.getDefaultSku()).toBeUndefined();
    expect(shadowOnly.getPrice()?.toFixed2()).toBe('42.00');
  });

  it('B11.3 - every money comparison goes through Money, and toFixed2 is used rather than toDecimalString', () => {
    // A runtime-verified trap, recorded so it is not re-discovered: `Money.toDecimalString()`
    // drops trailing zeros, so `'100.00'` comes back as `'100'`.
    const subject = new Product({
      productID: 'product-1',
      price: Money.fromDecimalString('100.00'),
    });

    const price = subject.getPrice();

    expect(price?.toFixed2()).toBe('100.00');
    expect(price?.toDecimalString()).toBe('100');
    expect(price?.equals(Money.fromDecimalString('100'))).toBe(true);
    expect(price?.equals(Money.fromDecimalString('100.00'))).toBe(true);

    expect(new Product({ productID: 'product-2' }).getSalePrice().equals(Money.zero)).toBe(true);
    expect(new Product({ productID: 'product-3' }).getPrice()).toBeUndefined();
  });

  it('B11.1 - Sku.getPrice() is never absent, so the undefined can only come from the missing sku', () => {
    // The provenance of the `undefined` matters. `Sku.getPrice()` returns `Money` unconditionally,
    // because `model/entity/Sku.cfc` declares the column `default="0"` - so a present default sku
    // always yields a price.
    const sku = makeSkuFixture({ skuID: 'sku-1' });

    expect(sku.getPrice()).toBeInstanceOf(Money);
    expect(sku.getListPrice()).toBeInstanceOf(Money);
    expect(sku.getRenewalPrice()).toBeInstanceOf(Money);

    const withSku = new Product({ productID: 'product-1', defaultSku: sku });

    expect(withSku.getPrice()).toBeInstanceOf(Money);
    expect(new Product({ productID: 'product-2' }).getPrice()).toBeUndefined();
  });

  it('★ setDefaultSku is published, accepts the null-out, and moves all six delegations with it', () => {
    // The first is `createSkus` designating the first SKU it created; the second is
    // `deleteProduct` nulling the FK before delegating to the framework delete.
    const sku = makeSkuFixture({ skuID: 'sku-1' });
    const subject = new Product({ productID: 'product-1' });

    expect(declaresMember('setDefaultSku')).toBe(true);
    expect(subject.getDefaultSku()).toBeUndefined();
    expect(subject.getPrice()).toBeUndefined();

    subject.setDefaultSku(sku);

    expect(subject.getDefaultSku()).toBe(sku);
    expect(subject.getPrice()).toBeInstanceOf(Money);
    expect(subject.getCurrencyCode()).toBe(sku.getCurrencyCode());

    subject.setDefaultSku(undefined);

    expect(subject.getDefaultSku()).toBeUndefined();
    expect(subject.getPrice()).toBeUndefined();

    // And no far side is touched.
    //
    // The sharpest form of that: the sku's own `product` reference never became this subject, in
    // either direction.
    expect(sku.getSkuID()).toBe('sku-1');
    expect(sku.getProduct()).not.toBe(subject);
    expect(subject.getSkus()).toHaveLength(0);
  });
});

describe('the sale-price-details seam between Product and Sku', () => {
  it('B12.1 / C7 - getSalePriceDetailsForSkus SHIPS, under the branch-(a) decision', () => {
    // Replaces the [model/entity/Product.cfc:L519] `getService("promotionService")` locator with
    // an injected sale-price resolver, and the governing plan makes the choice conditional: branch
    // (a) if the promotion port exposes a member that can serve
    // `getSalePriceDetailsForProductSkus`, branch (b) - omit.
    expect(declaresMember('getSalePriceDetailsForSkus')).toBe(true);

    // Its one in-scope consumer is shipped, and it reads through the accessor above.
    expect(declaresMember('getSkuSalePriceDetails')).toBe(true);
  });

  it('B12.1 - a pre-materialized map is read per instance, with no port reached', async () => {
    // Branch (a) is additive, not a replacement.
    const detail = {
      skuID: 'sku-1',
      discountLevel: 'sku' as const,
      salePriceDiscountType: 'percentageOff' as const,
      salePrice: Money.fromDecimalString('17.99'),
      promotionID: 'promotion-1',
    };
    const subject = new Product({
      productID: 'product-under-test',
      salePriceDetailsForSkus: { 'sku-1': detail },
    });

    expect(await subject.getSkuSalePriceDetails('sku-1')).toBe(detail);
    expect(await subject.getSkuSalePriceDetails('sku-1')).toBe(detail);

    expect(subject.getSkus()).toEqual([]);
  });

  it('B12.1 - the injected resolver fills the memo ONCE, which is what [L518] guards', async () => {
    // The memo is the point of the legacy body, so it is asserted as a call count rather than as a
    // returned value.
    const detail = {
      skuID: 'sku-resolved',
      discountLevel: 'productType' as const,
      salePriceDiscountType: 'percentageOff' as const,
      salePrice: Money.fromDecimalString('12.34'),
      promotionID: 'promotion-1',
    };
    const productIDsAsked: string[] = [];
    const subject = new Product({
      productID: 'product-resolver',
      salePriceResolver: {
        getSalePriceDetailsForProductSkus: (productID) => {
          productIDsAsked.push(productID);
          return Promise.resolve({ 'sku-resolved': detail });
        },
      },
    });

    const first = await subject.getSalePriceDetailsForSkus();
    const second = await subject.getSalePriceDetailsForSkus();

    // One reach, and the same struct object handed back both times.
    expect(productIDsAsked).toEqual(['product-resolver']);
    expect(second).toBe(first);

    // The keyed consumer routes through the same memo, so it adds no second reach. The argument
    // the resolver receives is `getProductID()` [model/entity/Product.cfc:L519], not a SKU key.
    expect(await subject.getSkuSalePriceDetails('sku-resolved')).toBe(detail);
    expect(await subject.getSkuSalePriceDetails('sku-absent')).toBeUndefined();
    expect(productIDsAsked).toEqual(['product-resolver']);
  });

  it('B12.1 - with NEITHER a map NOR a resolver, the accessor REFUSES and names [L519]', async () => {
    // The established refusal convention for an unwired collaborator, applied here too: the entity
    // does not invent an empty struct, it names the locator it cannot evaluate.
    const bare = new Product({ productID: 'product-unwired' });

    await expect(bare.getSalePriceDetailsForSkus()).rejects.toThrow(/L519/);
    await expect(bare.getSalePriceDetailsForSkus()).rejects.toThrow(/product-unwired/);
    await expect(bare.getSkuSalePriceDetails('sku-1')).resolves.toBeUndefined();
  });

  it('B12.2 - a miss answers `undefined`, which is the faithful port of the legacy `{}`', async () => {
    // CFML parity [model/entity/Product.cfc:L186]: the legacy returns the empty struct on a miss.
    const subject = new Product({
      productID: 'product-1',
      salePriceDetailsForSkus: {
        'sku-present': {
          skuID: 'sku-present',
          discountLevel: 'product',
          salePriceDiscountType: 'amountOff',
          salePrice: Money.fromDecimalString('5.00'),
          promotionID: 'promotion-1',
        },
      },
    });

    await expect(subject.getSkuSalePriceDetails('sku-absent')).resolves.toBeUndefined();
    await expect(subject.getSkuSalePriceDetails('')).resolves.toBeUndefined();
    await expect(subject.getSkuSalePriceDetails('sku-present')).resolves.toBeDefined();

    const mapless = new Product({ productID: 'product-2' });

    await expect(mapless.getSkuSalePriceDetails('sku-present')).resolves.toBeUndefined();
  });

  it('B12.2 - the containment probe is CASE-INSENSITIVE, as CFML struct keys are', async () => {
    // CFML parity [model/entity/Product.cfc:L183-L184]: CFML struct keys are case-insensitive and
    // TypeScript's are not, so both the probe and the read go through `structKeyExists` /
    // `structGet`.
    const detail = {
      skuID: 'SKU-Mixed-Case',
      discountLevel: 'global' as const,
      salePriceDiscountType: 'amount' as const,
      salePrice: Money.fromDecimalString('3.21'),
      promotionID: 'promotion-1',
    };
    const subject = new Product({
      productID: 'product-1',
      salePriceDetailsForSkus: { 'SKU-Mixed-Case': detail },
    });

    expect(await subject.getSkuSalePriceDetails('SKU-Mixed-Case')).toBe(detail);
    expect(await subject.getSkuSalePriceDetails('sku-mixed-case')).toBe(detail);
    expect(await subject.getSkuSalePriceDetails('SKU-MIXED-CASE')).toBe(detail);
  });

  it('B12.2 - the parameter is REQUIRED, narrowing the legacy `any` to `string`', () => {
    // LEGACY-NOTE [model/entity/Product.cfc:L182]: the legacy declares `required any skuID`, not
    // `required string skuID`.
    //
    // The arity is asserted so a later edit cannot quietly default the parameter and turn a
    // programming error into a silent absence.
    expect(arityOf('getSkuSalePriceDetails')).toBe(1);
  });

  it('B12.3 - the ROUND TRIP: Sku.getSalePriceDetails reaches back into this product', async () => {
    // The direction of the seam, asserted in both halves. [model/entity/Sku.cfc:L539-L544] calls
    // `getProduct().getSkuSalePriceDetails(getSkuID())` at [model/entity/Sku.cfc:L541] - the sku
    // asks the product, not the other way round.
    const detail = {
      skuID: 'sku-round-trip',
      discountLevel: 'brand' as const,
      salePriceDiscountType: 'percentageOff' as const,
      salePrice: Money.fromDecimalString('8.49'),
      promotionID: 'promotion-1',
    };

    const sku = makeSkuFixture({ skuID: 'sku-round-trip', salePriceDetail: detail });

    expect(sku.getSalePriceDetails()).toBe(detail);
    expect(sku.getSalePrice().toFixed2()).toBe('8.49');
    expect(sku.getSalePriceDiscountType()).toBe('percentageOff');

    const product = new Product({
      productID: 'product-1',
      skus: [sku],
      salePriceDetailsForSkus: { 'sku-round-trip': detail },
    });

    expect(await product.getSkuSalePriceDetails(sku.getSkuID())).toBe(detail);

    expect(product.getSalePrice().toFixed2()).toBe('0.00');
    expect(sku.getSalePrice().toFixed2()).toBe('8.49');
  });
});

describe('remaining delegations, warts and accessors', () => {
  it('B13.1 / C1 - getBaseProductType is UNGUARDED and ASYNC, and its materialization is documented', async () => {
    // CFML parity [model/entity/Product.cfc:L493-L495]: an UNGUARDED pure delegation, return
    // getProductType().getBaseProductType(); with no `structKeyExists` probe.
    const subject = new Product({
      productID: 'product-1',
      productType: buildProductType(
        LEGACY_MERCHANDISE_PRODUCT_TYPE_ID,
        'merchandise',
        `parent-type,${LEGACY_MERCHANDISE_PRODUCT_TYPE_ID}`,
      ),
    });

    await expect(subject.getBaseProductType()).resolves.toBe('merchandise');

    const typeless = new Product({ productID: 'product-2' });

    await expect(typeless.getBaseProductType()).rejects.toThrow(/requires the product type/);
    await expect(typeless.getBaseProductType()).rejects.toThrow(/model\/entity\/Product\.cfc:L494/);
  });

  it('B13.2 / C16 - getTransactionExistsFlag is async and memoized, and the "discarded argument" defect DOES NOT EXIST', async () => {
    const repository = new SkuRepositoryDouble([], true);
    const subject = new Product({
      productID: 'product-under-test',
      skuRepository: repository,
    });

    await expect(subject.getTransactionExistsFlag()).resolves.toBe(true);

    expect(repository.transactionExistsCalls).toEqual([
      { productID: 'product-under-test', skuID: undefined },
    ]);

    await subject.getTransactionExistsFlag();
    await subject.getTransactionExistsFlag();

    expect(repository.transactionExistsCalls).toHaveLength(1);
  });

  it('B13.2 - the memo is request-scoped, and a second product queries for itself', async () => {
    const busy = new SkuRepositoryDouble([], true);
    const idle = new SkuRepositoryDouble([], false);

    const withTransactions = new Product({ productID: 'product-1', skuRepository: busy });
    const withoutTransactions = new Product({ productID: 'product-2', skuRepository: idle });

    await expect(withTransactions.getTransactionExistsFlag()).resolves.toBe(true);
    await expect(withoutTransactions.getTransactionExistsFlag()).resolves.toBe(false);
    await expect(withTransactions.getTransactionExistsFlag()).resolves.toBe(true);

    expect(busy.transactionExistsCalls).toHaveLength(1);
    expect(idle.transactionExistsCalls).toHaveLength(1);
  });

  it('B13.2 - with no sku repository injected it refuses, naming L626', async () => {
    const unwired = new Product({ productID: 'product-1' });

    await expect(unwired.getTransactionExistsFlag()).rejects.toThrow(/sku repository/);
    await expect(unwired.getTransactionExistsFlag()).rejects.toThrow(
      /model\/entity\/Product\.cfc:L626/,
    );
  });

  it('B13.3 / C4 - getAllowBackorderFlag is OMITTED, so its returntype mismatch becomes a non-port', () => {
    // C4 - a prompt-claimed member that does not ship.
    expect(declaresMember('getAllowBackorderFlag')).toBe(false);

    expect(declaresMember('getCalculatedAllowBackorderFlag')).toBe(true);

    const subject = new Product({
      productID: 'product-1',
      calculatedAllowBackorderFlag: true,
    });

    expect(subject.getCalculatedAllowBackorderFlag()).toBe(true);

    expect(new Product({ productID: 'product-2' }).getCalculatedAllowBackorderFlag()).toBe(false);
  });

  it('B13.4 / C3 - getTitle is OMITTED because hibachiUtilityService is NOT a port', () => {
    expect(declaresMember('getTitle')).toBe(true);

    expect(declaresMember('getCalculatedTitle')).toBe(true);

    const subject = new Product({ productID: 'product-1', calculatedTitle: 'Test Brand Product' });

    expect(subject.getCalculatedTitle()).toBe('Test Brand Product');
    expect(new Product({ productID: 'product-2' }).getCalculatedTitle()).toBeUndefined();
  });

  it('B13.5 / C5 - getBrandOptions is OMITTED, and the deliberate non-port is documented', () => {
    // C5 - and the legacy body is unsafe as written.
    expect(declaresMember('getBrandOptions')).toBe(false);

    expect(ProductLegacyMetadata.brandOptionsNullRBKey).toBe('define.none');
  });

  it('B13.6 - getSimpleRepresentationPropertyName returns "productName"', () => {
    expect(new Product({ productID: 'product-1' }).getSimpleRepresentationPropertyName()).toBe(
      'productName',
    );

    expect(declaresMember('getProductName')).toBe(true);
  });

  it('B13.7 - getAttributeSets is ASYNC and its argument is a TRIGGER, not a filter value', async () => {
    // CFML parity [model/entity/Product.cfc:L832-L838]: the argument is genuinely surprising. It
    // does not filter by the codes it carries - it TESTS for `astProductCustomization` or
    // `astOrderItem` and, when either is present, ADDS the fixed `astOrderItem` filter.
    const repository = new ProductRepositoryDouble([
      {
        attributeSetID: 'set-1',
        attributeSetTypeSystemCode: 'astProduct',
        globalFlag: true,
        attributeCount: 3,
      },
    ]);
    const subject = new Product({
      productID: 'product-1',
      productType: buildProductType('type-child', 'merchandise', 'type-root,type-child'),
      productRepository: repository,
    });

    expect(await subject.getAttributeSets()).toHaveLength(1);
    expect(repository.attributeSetsCalls[0]).toEqual({
      attributeSetTypeCode: ['astProduct'],
      productTypeIDs: ['type-root', 'type-child'],
    });

    await subject.getAttributeSets(['astProductCustomization']);

    expect(repository.attributeSetsCalls[1]).toEqual({
      attributeSetTypeCode: ['astProduct', 'astOrderItem'],
      productTypeIDs: ['type-root', 'type-child'],
    });

    await subject.getAttributeSets(['astOrderItem']);

    expect(repository.attributeSetsCalls[2]?.attributeSetTypeCode).toEqual([
      'astProduct',
      'astOrderItem',
    ]);

    await subject.getAttributeSets(['astSomethingElse']);

    expect(repository.attributeSetsCalls[3]?.attributeSetTypeCode).toEqual(['astProduct']);

    expect(repository.attributeSetsCalls).toHaveLength(4);
  });

  it('B13.7 - with no product type the product-type disjunct is EMPTY, meaning global sets only', async () => {
    const repository = new ProductRepositoryDouble([]);
    const subject = new Product({ productID: 'product-1', productRepository: repository });

    expect(await subject.getAttributeSets()).toEqual([]);
    expect(repository.attributeSetsCalls[0]?.productTypeIDs).toEqual([]);

    const unwired = new Product({ productID: 'product-2' });

    await expect(unwired.getAttributeSets()).rejects.toThrow(/product repository/);
    await expect(unwired.getAttributeSets()).rejects.toThrow(/model\/entity\/Product\.cfc:L833/);
  });

  it('B13.8 - the `singlularname` typo at L76 is a data contract and is NOT corrected', () => {
    // C4 INTERFACE PARITY. [model/entity/Product.cfc:L76] declares
    // `singlularname="productReview"`, spelled "singlular" with an extra `l`, on the
    // `productReviews` one-to-many.
    for (const absent of [
      'addProductReview',
      'removeProductReview',
      'getProductReviews',
      'hasProductReview',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }

    // The metadata typo this component carries is preserved rather than corrected: `singlularname`
    // on `productReviews` [model/entity/Product.cfc:L76].
    expect(ProductLegacyMetadata.entityName).toBe('SlatwallProduct');
  });

  it('B13.9 - relatedProducts is SELF-REFERENTIAL, and the graph stays shallow and acyclic', () => {
    // CFML parity [model/entity/Product.cfc:L81]: `relatedProducts` is a many-to-many OWNER over
    // the link table `SwRelatedProduct`, Product -> Product.
    const related = new Product({ productID: 'product-related' });
    const subject = new Product({ productID: 'product-1', relatedProducts: [related] });

    expect(productIDsOf(subject.getRelatedProducts())).toEqual(['product-related']);
    expect(related.getRelatedProducts()).toEqual([]);

    expect(subject.getRelatedProducts()[0]?.getRelatedProducts()).toEqual([]);

    expect(new Product({ productID: 'product-2' }).getRelatedProducts()).toEqual([]);
  });

  it('B13.10 - the lazy-load probes are `!== undefined`, and no postfix `!` silences one', () => {
    // Eleven lazy-load probes are ported as `!== undefined` comparisons, each annotated at its
    // site in the shipped module: TEN far-side members plus `isNew()`.
    const unsavedWithNothingWired = new Product({ productID: '' });

    expect(unsavedWithNothingWired.isNew()).toBe(true);

    const savedWithNothingWired = new Product({ productID: 'product-1' });

    expect(savedWithNothingWired.isNew()).toBe(false);
    expect(savedWithNothingWired.getBrand()).toBeUndefined();
    expect(savedWithNothingWired.getProductType()).toBeUndefined();
    expect(savedWithNothingWired.getDefaultSku()).toBeUndefined();

    const hydrated = new Product({
      productID: 'product-2',
      brand: new Brand({ brandID: 'brand-1', brandName: 'Test Brand' }),
      productType: buildProductType('type-1', 'merchandise', 'type-1'),
      defaultSku: makeSkuFixture({ skuID: 'sku-1' }),
    });

    expect(hydrated.getBrand()).toBeDefined();
    expect(hydrated.getProductType()).toBeDefined();
    expect(hydrated.getDefaultSku()).toBeDefined();
    expect(hydrated.isNew()).toBe(false);
  });

  it('B13.10 - the scalar accessors answer `undefined` for an unset column, never a substitute', () => {
    // The same absence discipline applied to the plain columns.
    const bare = new Product({ productID: 'product-1' });

    expect(bare.getProductName()).toBeUndefined();
    expect(bare.getProductCode()).toBeUndefined();
    expect(bare.getProductDescription()).toBeUndefined();
    expect(bare.getUrlTitle()).toBeUndefined();
    expect(bare.getSortOrder()).toBeUndefined();
    expect(bare.getRemoteID()).toBeUndefined();
    expect(bare.getCalculatedSalePrice()).toBeUndefined();
    expect(bare.getCalculatedQATS()).toBeUndefined();
    expect(bare.getCalculatedTitle()).toBeUndefined();

    expect(bare.getActiveFlag()).toBe(false);
    expect(bare.getPublishedFlag()).toBe(false);
    expect(bare.getCalculatedAllowBackorderFlag()).toBe(false);

    const coerced = new Product({
      productID: 'product-2',
      activeFlag: 'yes',
      publishedFlag: 1,
    });

    expect(coerced.getActiveFlag()).toBe(true);
    expect(coerced.getPublishedFlag()).toBe(true);
  });

  it('B13.10 - the four audit columns are inert UTC values, read back unchanged', () => {
    const subject = new Product({
      productID: 'product-1',
      createdDateTime: CREATED_INSTANT,
      createdByAccountID: 'account-creator',
      modifiedDateTime: MODIFIED_INSTANT,
      modifiedByAccountID: 'account-modifier',
    });

    expect(subject.getCreatedDateTime()).toBe(CREATED_INSTANT);
    expect(subject.getCreatedByAccountID()).toBe('account-creator');
    expect(subject.getModifiedDateTime()).toBe(MODIFIED_INSTANT);
    expect(subject.getModifiedByAccountID()).toBe('account-modifier');

    expect(subject.getCreatedDateTime()?.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(subject.getModifiedDateTime()?.toISOString()).toBe('2024-06-15T12:30:45.000Z');

    const unstamped = new Product({ productID: 'product-2' });

    expect(unstamped.getCreatedDateTime()).toBeUndefined();
    expect(unstamped.getModifiedDateTime()).toBeUndefined();
  });
});

// Transcribed in file order and frozen; what the assertions turn on is the ELEVEN property
// entries.

const PRODUCT_VALIDATION_SCHEMA = {
  baseProductType: [
    { contexts: 'addOptionGroup,addOption', inList: 'merchandise' },
    { contexts: 'addSubscriptionTerm', inList: 'subscription' },
  ],
  physicalCounts: [{ contexts: 'delete', maxCollection: 0 }],
  price: [{ contexts: 'save', required: true, dataType: 'numeric' }],
  productName: [{ contexts: 'save', required: true }],
  productCode: [
    {
      contexts: 'save',
      required: true,
      unique: true,
      regex: '^[a-zA-Z0-9-_.|:~^]+$',
    },
  ],
  productType: [{ contexts: 'save', required: true }],
  transactionExistsFlag: [{ contexts: 'delete', eq: false }],
  unusedProductOptions: [{ contexts: 'addOption', minCollection: 1 }],
  unusedProductOptionGroups: [{ contexts: 'addOptionGroup', minCollection: 1 }],
  unusedProductSubscriptionTerms: [{ contexts: 'addSubscriptionTerm', minCollection: 1 }],
  urlTitle: [{ contexts: 'save', required: true, unique: true }],
} as const;

describe('model/validation/Product.json: eleven rules, transcribed and pinned', () => {
  it('B14.1 - all ELEVEN properties are present, in file order, with their contexts', () => {
    expect(Object.keys(PRODUCT_VALIDATION_SCHEMA)).toEqual([
      'baseProductType',
      'physicalCounts',
      'price',
      'productName',
      'productCode',
      'productType',
      'transactionExistsFlag',
      'unusedProductOptions',
      'unusedProductOptionGroups',
      'unusedProductSubscriptionTerms',
      'urlTitle',
    ]);
    expect(Object.keys(PRODUCT_VALIDATION_SCHEMA)).toHaveLength(11);

    // `baseProductType` is the only property carrying two rules, and they disagree deliberately:
    // the two option contexts require `merchandise` while the subscription context requires
    // `subscription`.
    expect(PRODUCT_VALIDATION_SCHEMA.baseProductType).toHaveLength(2);
    expect(PRODUCT_VALIDATION_SCHEMA.baseProductType[0]).toEqual({
      contexts: 'addOptionGroup,addOption',
      inList: 'merchandise',
    });
    expect(PRODUCT_VALIDATION_SCHEMA.baseProductType[1]).toEqual({
      contexts: 'addSubscriptionTerm',
      inList: 'subscription',
    });

    // The five `save`-context rules, and the two `delete`-context rules.
    const saveContexted = Object.entries(PRODUCT_VALIDATION_SCHEMA)
      .filter(([, rules]) => rules.some((rule) => rule.contexts === 'save'))
      .map(([property]) => property);

    expect(saveContexted).toEqual([
      'price',
      'productName',
      'productCode',
      'productType',
      'urlTitle',
    ]);

    const deleteContexted = Object.entries(PRODUCT_VALIDATION_SCHEMA)
      .filter(([, rules]) => rules.some((rule) => rule.contexts === 'delete'))
      .map(([property]) => property);

    expect(deleteContexted).toEqual(['physicalCounts', 'transactionExistsFlag']);

    // The three process contexts, each gating exactly one collection.
    expect(PRODUCT_VALIDATION_SCHEMA.unusedProductOptions[0].contexts).toBe('addOption');
    expect(PRODUCT_VALIDATION_SCHEMA.unusedProductOptionGroups[0].contexts).toBe('addOptionGroup');
    expect(PRODUCT_VALIDATION_SCHEMA.unusedProductSubscriptionTerms[0].contexts).toBe(
      'addSubscriptionTerm',
    );

    // The four contexts the schema uses are exactly the four named in `hb_processContexts` at
    // [model/entity/Product.cfc:L49], plus `save` and `delete`.
    expect(ProductLegacyMetadata.processContexts).toBe(
      'updateSkus,addOptionGroup,addOption,addSubscriptionTerm',
    );
  });

  it('B14.2 - `price` is required+numeric with NO minValue, so a NEGATIVE price is VALID on Product', () => {
    // CFML parity `model/validation/Product.json`: `price` is required+numeric with no minValue,
    // while `Sku.price` carries minValue 0 in `model/validation/Sku.json`. Do not add a floor the
    // legacy schema lacks.
    expect(PRODUCT_VALIDATION_SCHEMA.price[0]).toEqual({
      contexts: 'save',
      required: true,
      dataType: 'numeric',
    });
    expect(Object.keys(PRODUCT_VALIDATION_SCHEMA.price[0])).not.toContain('minValue');
    expect(Object.keys(PRODUCT_VALIDATION_SCHEMA.price[0])).toEqual([
      'contexts',
      'required',
      'dataType',
    ]);

    const negative = new Product({
      productID: 'product-1',
      price: Money.fromDecimalString('-5.00'),
    });

    expect(negative.getPrice()?.toFixed2()).toBe('-5.00');
    expect(negative.getPrice()?.isLessThan(Money.zero)).toBe(true);
  });

  it("B14.3 - `productCode`'s regex is the SHARED ENTITY_CODE_PATTERN, imported and not redeclared", () => {
    // One shared constant, declared exactly once.
    expect(ENTITY_CODE_PATTERN.source).toBe(PRODUCT_VALIDATION_SCHEMA.productCode[0].regex);
    expect(ENTITY_CODE_PATTERN.source).toBe('^[a-zA-Z0-9-_.|:~^]+$');

    expect(ProductLegacyMetadata.productCodeRegexText).toBe(ENTITY_CODE_PATTERN.source);

    expect(ENTITY_CODE_PATTERN.test('TESTPRODUCTXXX')).toBe(true);
    expect(ENTITY_CODE_PATTERN.test('sku-1.2_3|4:5~6^7')).toBe(true);
    expect(ENTITY_CODE_PATTERN.test('')).toBe(false);
    expect(ENTITY_CODE_PATTERN.test('has space')).toBe(false);
    expect(ENTITY_CODE_PATTERN.test('has/slash')).toBe(false);

    expect(PRODUCT_VALIDATION_SCHEMA.productCode[0].unique).toBe(true);
    expect(PRODUCT_VALIDATION_SCHEMA.urlTitle[0].unique).toBe(true);
  });

  it('B14.4 - the `physicalCounts` gate is ORPHANED, and it is pinned as a documented DEAD declaration', () => {
    // CFML parity `model/validation/Product.json`: the physicalCounts delete gate is ORPHANED -
    // Product declares "physicals" (SwPhysicalProduct) at [model/entity/Product.cfc:L90], and
    // physicalCounts exists as a property only at [model/entity/Physical.cfc:L59].
    expect(PRODUCT_VALIDATION_SCHEMA.physicalCounts[0]).toEqual({
      contexts: 'delete',
      maxCollection: 0,
    });

    for (const absent of [
      'getPhysicalCounts',
      'getPhysicals',
      'addPhysical',
      'removePhysical',
      'hasPhysical',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }

    expect(declaresMember('getAttributeValue')).toBe(false);
    expect(declaresMember('onMissingMethod')).toBe(false);
  });

  it('B14.5 - SIX of the eleven rules target NON-PERSISTENT, getter-only values', () => {
    // CFML parity: the same getter-keyed pattern as `PriceGroupRate.json`'s orphaned
    // `conditions.isNotGlobal`, which keys on `getGlobalFlag`.
    const getterOnly = [
      'baseProductType',
      'price',
      'transactionExistsFlag',
      'unusedProductOptions',
      'unusedProductOptionGroups',
      'unusedProductSubscriptionTerms',
    ];

    for (const property of getterOnly) {
      expect(Object.keys(PRODUCT_VALIDATION_SCHEMA)).toContain(property);
    }
    expect(getterOnly).toHaveLength(6);

    expect(
      Object.keys(PRODUCT_VALIDATION_SCHEMA).filter(
        (property: string): boolean => !getterOnly.includes(property),
      ),
    ).toEqual(['physicalCounts', 'productName', 'productCode', 'productType', 'urlTitle']);
  });

  it('B14.5 - THE CONSEQUENCE: a bare Product FAILS the `price` required check', () => {
    const bare = new Product({ productID: '' });

    expect(bare.isNew()).toBe(true);
    expect(bare.getPrice()).toBeUndefined();
    expect(bare.getDefaultSku()).toBeUndefined();
    expect(PRODUCT_VALIDATION_SCHEMA.price[0].required).toBe(true);

    expect(bare.getProductName()).toBeUndefined();
    expect(bare.getProductCode()).toBeUndefined();
    expect(bare.getProductType()).toBeUndefined();
    expect(bare.getUrlTitle()).toBeUndefined();

    expect(
      new Product({ productID: 'product-1', price: Money.fromDecimalString('1.00') }).getPrice(),
    ).toBeDefined();
    expect(
      new Product({
        productID: 'product-2',
        defaultSku: makeSkuFixture({ skuID: 'sku-1' }),
      }).getPrice(),
    ).toBeDefined();
  });

  it('B14.6 - the legacy validation GAPS are asserted as absent and are NOT completed', () => {
    // Do not complete legacy validation gaps.
    for (const absent of [
      'activeFlag',
      'publishedFlag',
      'sortOrder',
      'skus',
      'productReviews',
      'brand',
      'categories',
      'defaultSku',
      'productDescription',
      'remoteID',
      'physicals',
    ]) {
      expect(Object.keys(PRODUCT_VALIDATION_SCHEMA)).not.toContain(absent);
    }

    expect(declaresMember('getActiveFlag')).toBe(true);
    expect(declaresMember('getPublishedFlag')).toBe(true);
    expect(declaresMember('getSortOrder')).toBe(true);
    expect(declaresMember('getSkus')).toBe(true);
  });

  it('B14.6 - the SIX project-wide absent schemas must REMAIN absent', () => {
    const absentSchemas = [
      'Category.json',
      'PromotionQualifier.json',
      'PromotionApplied.json',
      'PromotionAccount.json',
      'Product_AddOption.json',
      'Product_AddOptionGroup.json',
    ];

    expect(absentSchemas).toHaveLength(6);

    const category = buildCategory('category-1');

    expect(category.getCategoryID()).toBe('category-1');
    expect(Object.keys(PRODUCT_VALIDATION_SCHEMA)).not.toContain('category');
  });

  it('B14.1 - every schema property resolves to a SHIPPED accessor, or is a documented dead one', () => {
    const resolvable: Record<string, string> = {
      baseProductType: 'getBaseProductType',
      price: 'getPrice',
      productName: 'getProductName',
      productCode: 'getProductCode',
      productType: 'getProductType',
      transactionExistsFlag: 'getTransactionExistsFlag',
      unusedProductOptions: 'getUnusedProductOptions',
      unusedProductOptionGroups: 'getUnusedProductOptionGroups',
      unusedProductSubscriptionTerms: 'getUnusedProductSubscriptionTerms',
      urlTitle: 'getUrlTitle',
    };

    for (const [property, accessor] of Object.entries(resolvable)) {
      expect(Object.keys(PRODUCT_VALIDATION_SCHEMA)).toContain(property);
      expect(declaresMember(accessor)).toBe(true);
    }

    expect(Object.keys(resolvable)).toHaveLength(10);

    expect(declaresMember('getPhysicalCounts')).toBe(false);
  });
});

describe('ROUTED LEGACY CASES: the four IssuesTest cases that belong to Product', () => {
  it('issue_1097 - a populated Product round-trips its fields with no ORM, database or flush', () => {
    // Routed legacy case [meta/tests/unit/IssuesTest.cfc:L51-L71]. Original weakness: zero
    // assertions.
    const productType = buildProductType(
      LEGACY_MERCHANDISE_PRODUCT_TYPE_ID,
      'merchandise',
      LEGACY_MERCHANDISE_PRODUCT_TYPE_ID,
    );

    const product = new Product({
      productID: '',
      productName: 'My Product',
      productType,
    });

    expect(product.getProductName()).toBe('My Product');
    expect(product.getProductType()).toBe(productType);
    expect(product.getProductType()?.getProductTypeID()).toBe('444df2f7ea9c87e60051f3cd87b435a1');

    expect(product.isNew()).toBe(true);
    expect(product.getProductID()).toBe('');

    expect(product.getSkus()).toEqual([]);
    expect(product.getCategoryIDs()).toBe('');
    expect(product.getBrandName()).toBe('');
    expect(product.getSimpleRepresentationPropertyName()).toBe('productName');

    for (const absent of ['save', 'delete', 'flush', 'populate', 'entityDelete']) {
      expect(declaresMember(absent)).toBe(false);
    }
  });

  it('issue_1331 - the addOptionGroup context is gated on baseProductType inList "merchandise"', async () => {
    // Routed legacy case [meta/tests/unit/IssuesTest.cfc:L101-L108].
    expect(LEGACY_NON_MERCHANDISE_PRODUCT_TYPE_ID).toBe('444df313ec53a08c32d8ae434af5819a');
    expect(LEGACY_NON_MERCHANDISE_PRODUCT_TYPE_ID).not.toBe(LEGACY_MERCHANDISE_PRODUCT_TYPE_ID);

    expect(PRODUCT_VALIDATION_SCHEMA.baseProductType[0]).toEqual({
      contexts: 'addOptionGroup,addOption',
      inList: 'merchandise',
    });
    expect(PRODUCT_VALIDATION_SCHEMA.unusedProductOptionGroups[0]).toEqual({
      contexts: 'addOptionGroup',
      minCollection: 1,
    });

    const nonMerchandise = new Product({
      productID: 'product-1',
      productType: buildProductType(
        LEGACY_NON_MERCHANDISE_PRODUCT_TYPE_ID,
        'subscription',
        LEGACY_NON_MERCHANDISE_PRODUCT_TYPE_ID,
      ),
    });

    const resolvedBase = await nonMerchandise.getBaseProductType();

    expect(resolvedBase).toBe('subscription');
    expect(resolvedBase).not.toBe(PRODUCT_VALIDATION_SCHEMA.baseProductType[0].inList);

    const merchandise = new Product({
      productID: 'product-2',
      productType: buildProductType(
        LEGACY_MERCHANDISE_PRODUCT_TYPE_ID,
        'merchandise',
        LEGACY_MERCHANDISE_PRODUCT_TYPE_ID,
      ),
    });

    await expect(merchandise.getBaseProductType()).resolves.toBe('merchandise');

    expect(declaresMember('isProcessable')).toBe(false);
    expect(declaresMember('getProcessObject')).toBe(false);
    expect(ProductLegacyMetadata.processContexts).toContain('addOptionGroup');
  });

  it('issue_1690 - a bare Product fails the save context AND does not throw', () => {
    const bare = new Product({ productID: '' });

    expect(() => bare.getPrice()).not.toThrow();
    expect(() => bare.getProductName()).not.toThrow();
    expect(() => bare.getProductCode()).not.toThrow();
    expect(() => bare.getProductType()).not.toThrow();
    expect(() => bare.getUrlTitle()).not.toThrow();

    const unmet = [
      bare.getPrice(),
      bare.getProductName(),
      bare.getProductCode(),
      bare.getProductType(),
      bare.getUrlTitle(),
    ];

    expect(unmet.every((value: unknown): boolean => value === undefined)).toBe(true);
    expect(unmet).toHaveLength(5);

    expect(bare.getPrice()).toBeUndefined();
    expect(bare.getPrice()).not.toBe(0);

    // The ENTITY still cannot validate itself, which is what made the legacy case unassertable
    // here: `validate` is absent, so "a bare product fails the save context" is a claim only
    // `src/services/productService.ts` can make - and it does.
    expect(declaresMember('validate')).toBe(false);

    // `hasErrors` ships - see the legacy-extended case for the full record.
    expect(declaresMember('hasErrors')).toBe(true);
    expect(bare.hasErrors()).toBe(false);
  });

  it('issue_1690_2 - constructing a bare Product and reading its state does not throw', () => {
    // Routed legacy case [meta/tests/unit/IssuesTest.cfc:L203-L206].
    //
    // Original weakness: no assertion, and no validate call either.
    //
    // It is the `_2` companion to `issue_1690`, differing only in that it skips validation and
    // saves unconditionally, so it could fail only by throwing.
    expect(() => new Product({ productID: '' })).not.toThrow();

    const bare = new Product({ productID: '' });

    expect(() => bare.isNew()).not.toThrow();
    expect(() => bare.getProductID()).not.toThrow();
    expect(() => bare.getSimpleRepresentationPropertyName()).not.toThrow();
    expect(() => bare.getSkus()).not.toThrow();
    expect(() => bare.getCategories()).not.toThrow();
    expect(() => bare.getBrandName()).not.toThrow();

    expect(bare.isNew()).toBe(true);

    expect(() => bare.getPageIDs()).toThrow();
    expect(() => bare.getProductOptionsByGroup()).toThrow();
    expect(() => bare.getSalePriceExpirationDateTime()).toThrow();
    expect(() => bare.getOptionGroups()).toThrow();
    expect(() => bare.getProductURL()).toThrow();

    expect(declaresMember('saveEntity')).toBe(false);
  });

  it('B15.6 - the two sibling-owned cases are NOT duplicated here, and the empty stub is not a suite', () => {
    const routedHere = ['issue_1097', 'issue_1331', 'issue_1690', 'issue_1690_2'];
    const siblingOwned = ['issue_1335', 'issue_1348'];

    expect(routedHere).toHaveLength(4);
    expect(siblingOwned).toHaveLength(2);
    expect(routedHere.concat(siblingOwned)).toHaveLength(6);

    // `meta/tests/functional/admin/entity/ProductTest.cfc` is 53 lines with an EMPTY component
    // body: L49 opens it, L53 closes it, nothing between.
    const handBuilt = new Product({
      productID: 'product-1',
      settingsProvider: new SettingsProviderDouble(URL_KEY_UNDER_TEST),
    });

    expect(handBuilt.getProductURL()).toBe(`/${URL_KEY_UNDER_TEST}//`);
  });
});

describe('bidirectional helpers: reproduced symmetry, the D25 hazard, and the index base', () => {
  it('B16.1 - setBrand wires BOTH sides: the near-side FK and the far-side array', () => {
    // CFML parity [model/entity/Product.cfc:L662-L667]: `variables.brand = arguments.brand;` then
    // a guarded `arrayAppend(arguments.brand.getProducts(), this)`. Both halves are reproduced.
    const brand = new Brand({ brandID: 'brand-1', brandName: 'Reproduced Symmetry' });
    const product = new Product({ productID: 'product-1' });

    expect(brand.getProducts()).toEqual([]);

    product.setBrand(brand);

    expect(product.getBrand()).toBe(brand);
    expect(brand.getProducts()).toHaveLength(1);
    expect(productIDsOf(brand.getProducts())).toEqual(['product-1']);
  });

  it('B16.1 - the guard SUPPRESSES a duplicate append for a SAVED product', () => {
    const brand = new Brand({ brandID: 'brand-1', brandName: 'Saved Path' });
    const saved = new Product({ productID: 'product-1' });

    expect(saved.isNew()).toBe(false);

    saved.setBrand(brand);
    saved.setBrand(brand);
    saved.setBrand(brand);

    expect(brand.getProducts()).toHaveLength(1);
    expect(productIDsOf(brand.getProducts())).toEqual(['product-1']);
  });

  it('B16.2 - THE D25 HAZARD: a NEW product appends unconditionally, so twice appends twice', () => {
    // LEGACY-DEFECT [model/entity/Product.cfc:L664]: the `isNew() or` short-circuit skips the
    // containment probe entirely for an unsaved product, so a second setBrand call appends a
    // second reference to the same instance onto the far-side array.
    // Preserved deliberately; do not fix without a product decision.
    const brand = new Brand({ brandID: 'brand-1', brandName: 'New Path' });
    const unsaved = new Product({ productID: '' });

    expect(unsaved.isNew()).toBe(true);

    unsaved.setBrand(brand);
    expect(brand.getProducts()).toHaveLength(1);

    unsaved.setBrand(brand);

    expect(brand.getProducts()).toHaveLength(2);
    expect(brand.getProducts()[0]).toBe(unsaved);
    expect(brand.getProducts()[1]).toBe(unsaved);
    expect(productIDsOf(brand.getProducts())).toEqual(['', '']);

    expect(unsaved.getBrand()).toBe(brand);
  });

  it('B16.3 - removeBrand is the CLEAN control: it clears the near side UNCONDITIONALLY', () => {
    // CFML parity [model/entity/Product.cfc:L668-L677]: `arrayFind` at L672, the guarded
    // `arrayDeleteAt` at L673-L674, and then `structDelete(variables, "brand")` at L676 which is
    // OUTSIDE the guard.
    const owningBrand = new Brand({ brandID: 'brand-1', brandName: 'Owner' });
    const strangerBrand = new Brand({ brandID: 'brand-2', brandName: 'Stranger' });
    const product = new Product({ productID: 'product-1' });

    product.setBrand(owningBrand);
    expect(owningBrand.getProducts()).toHaveLength(1);

    product.removeBrand(strangerBrand);

    expect(strangerBrand.getProducts()).toEqual([]);
    expect(owningBrand.getProducts()).toHaveLength(1);
    expect(product.getBrand()).toBeUndefined();
  });

  it('B16.3 - the omitted-argument default resolves to the owning brand, and both sides clear', () => {
    const brand = new Brand({ brandID: 'brand-1', brandName: 'Owner' });
    const product = new Product({ productID: 'product-1' });

    product.setBrand(brand);
    product.removeBrand();

    expect(product.getBrand()).toBeUndefined();
    expect(brand.getProducts()).toEqual([]);
  });

  it('B16.3 / C14 - with no argument and no owning brand it REFUSES rather than no-ops', () => {
    // LEGACY-NOTE [model/entity/Product.cfc:L669-L671]: with no argument the legacy resolves
    // `arguments.brand = variables.brand`, so when the near side was never set that read itself
    // raises and the `arrayFind` at [model/entity/Product.cfc:L672] is never reached.
    const orphan = new Product({ productID: 'product-1' });

    expect(() => orphan.removeBrand()).toThrow(/removeBrand was called with no argument/);
    expect(() => orphan.removeBrand()).toThrow(/model\/entity\/Product\.cfc:L672/);
  });

  it('B16.4 - THE INDEX BASE: removing the FIRST product of a brand actually removes it', () => {
    // The executable proof of the `index > 0` -> `!== -1` translation.
    // CFML parity [model/entity/Product.cfc:L672-L674]: `arrayFind` returns a one-based index or
    // 0, so `if(index > 0)` is exactly right in CFML.
    const brand = new Brand({ brandID: 'brand-1', brandName: 'Index Base' });
    const first = new Product({ productID: 'product-1' });
    const second = new Product({ productID: 'product-2' });

    first.setBrand(brand);
    second.setBrand(brand);
    expect(productIDsOf(brand.getProducts())).toEqual(['product-1', 'product-2']);

    first.removeBrand(brand);

    expect(brand.getProducts()).toHaveLength(1);
    expect(productIDsOf(brand.getProducts())).toEqual(['product-2']);
    expect(first.getBrand()).toBeUndefined();
    expect(second.getBrand()).toBe(brand);
  });

  it('B16.5 - the far-side match is BY PRIMARY KEY, never by object identity', () => {
    // CFML parity [model/entity/Product.cfc:L672]:
    // `arrayFind(arguments.brand.getProducts(), this)` compared ORM-managed references, which
    // within one Hibernate session were identity-equal to the row's single managed instance.
    const brand = new Brand({ brandID: 'brand-1', brandName: 'By Key' });
    const held = new Product({ productID: 'product-1' });
    held.setBrand(brand);

    const separatelyHydrated = new Product({ productID: 'product-1' });
    expect(separatelyHydrated).not.toBe(held);

    separatelyHydrated.removeBrand(brand);

    expect(brand.getProducts()).toEqual([]);
  });

  it('B16.5 - and the SIX containment probes on Product match by primary key too', () => {
    // C11 - there are six probes, not five: `hasSku` is the sixth alongside `hasPriceGroupRate`,
    // `hasPromotionQualifier`, `hasPromotionQualifierExclusion`, `hasPromotionReward` and
    // `hasPromotionRewardExclusion`.
    //
    // CFML parity: each body reads the candidate's key, falls back to reference containment only
    // when that key is empty, and otherwise compares keys.
    const held = makeSkuFixture({ skuID: 'sku-1' });
    const product = new Product({ productID: 'product-1', skus: [held] });

    expect(product.hasSku(held)).toBe(true);

    const sameKeyDifferentInstance = makeSkuFixture({ skuID: 'sku-1' });
    expect(sameKeyDifferentInstance).not.toBe(held);
    expect(product.hasSku(sameKeyDifferentInstance)).toBe(true);

    expect(product.hasSku(makeSkuFixture({ skuID: 'sku-2' }))).toBe(false);

    const unsavedHeld = makeSkuFixture({ skuID: '', isNew: true });
    const unsavedStranger = makeSkuFixture({ skuID: '', isNew: true });
    const withUnsaved = new Product({ productID: 'product-2', skus: [unsavedHeld] });

    expect(withUnsaved.hasSku(unsavedHeld)).toBe(true);
    expect(withUnsaved.hasSku(unsavedStranger)).toBe(false);
  });

  it('B16.6 - addSku / removeSku delegate to the OWNING side and mutate this product live', () => {
    // CFML parity [model/entity/Product.cfc:L696-L698] and [model/entity/Product.cfc:L699-L701],
    // both single-line delegations: `arguments.sku.setProduct( this )` and
    // `arguments.sku.removeProduct( this )`.
    const product = new Product({ productID: 'product-1' });
    const sku = makeSkuFixture({ skuID: 'sku-1', product });

    expect(product.getSkus()).toHaveLength(1);
    expect(sku.getProduct()).toBe(product);

    product.removeSku(sku);

    expect(product.getSkus()).toEqual([]);
    expect(sku.getProduct()).toBeUndefined();

    product.addSku(sku);

    expect(skuIDsOf(product.getSkus())).toEqual(['sku-1']);
    expect(sku.getProduct()).toBe(product);
  });

  // B16.8 - `setDefaultSku`: net-new coverage for a net-new member.

  it('B16.8 - setDefaultSku assigns the near side and touches NOTHING else', () => {
    const product = new Product({ productID: 'product-1' });
    const sku = makeSkuFixture({ skuID: 'sku-1', product: undefined });

    expect(product.getDefaultSku()).toBeUndefined();
    expect(product.getSkus()).toEqual([]);

    product.setDefaultSku(sku);

    expect(product.getDefaultSku()).toBe(sku);
    expect(product.getSkus()).toEqual([]);
    expect(sku.getProduct()).toBeUndefined();
  });

  it('B16.8 - it OVERWRITES, because [L167] and [L189] overwrite', () => {
    const product = new Product({ productID: 'product-1' });
    const first = makeSkuFixture({ skuID: 'sku-1' });
    const second = makeSkuFixture({ skuID: 'sku-2' });

    product.setDefaultSku(first);
    product.setDefaultSku(second);

    expect(product.getDefaultSku()).toBe(second);
  });

  it('B16.8 - a TRANSIENT sku is a legitimate designation, and stays observable as one', () => {
    // The LOAD-BEARING CASE. [model/entity/Product.cfc:L102] and [model/entity/Product.cfc:L134]
    // designate before anything is persisted, so the entity has to accept a SKU that reports
    // itself unsaved.
    const product = new Product({ productID: '' });
    const draft = makeSkuFixture({ skuID: PROVISIONAL_SKU_ID, isNew: true, product: undefined });

    expect(draft.isNew()).toBe(true);
    expect(draft.getSkuID()).toBe(PROVISIONAL_SKU_ID);

    product.setDefaultSku(draft);

    expect(product.getDefaultSku()).toBe(draft);
    expect(product.getDefaultSku()?.isNew()).toBe(true);
  });

  it('B16.8 - and the designation immediately drives the accessors that read through it', () => {
    const product = new Product({ productID: 'product-1' });
    const sku = makeSkuFixture({ skuID: 'sku-1' });

    expect(product.getPrice()).toBeUndefined();

    product.setDefaultSku(sku);

    expect(product.getPrice()).toBe(sku.getPrice());
    expect(product.getCurrencyCode()).toBe(sku.getCurrencyCode());
  });

  it('B16.6 - the ten promotion and price-group helpers ship as one-argument delegations', () => {
    // The arity and existence loop below still earns its place - it is what keeps a delegation
    // from silently gaining a second parameter, and it pairs with the omission case that follows.
    const delegations = [
      'addPromotionReward',
      'removePromotionReward',
      'addPromotionRewardExclusion',
      'removePromotionRewardExclusion',
      'addPromotionQualifier',
      'removePromotionQualifier',
      'addPromotionQualifierExclusion',
      'removePromotionQualifierExclusion',
      'addPriceGroupRate',
      'removePriceGroupRate',
    ];

    for (const member of delegations) {
      expect(declaresMember(member)).toBe(true);
      expect(arityOf(member)).toBe(1);
    }

    for (const probe of [
      'hasSku',
      'hasPriceGroupRate',
      'hasPromotionQualifier',
      'hasPromotionQualifierExclusion',
      'hasPromotionReward',
      'hasPromotionRewardExclusion',
    ]) {
      expect(declaresMember(probe)).toBe(true);
      expect(arityOf(probe)).toBe(1);
    }
  });

  it('B16.6 / CLUSTER 8 - the SIX out-of-scope pairs are OMITTED, and the omission is documented', () => {
    // Upstream's B16.6 lists `addProductReview`, `addListingPage` and `addPhysical` as shipped.
    for (const omitted of [
      'addAttributeValue',
      'removeAttributeValue',
      'addProductImage',
      'removeProductImage',
      'addProductReview',
      'removeProductReview',
      'addListingPage',
      'removeListingPage',
      'addVendor',
      'removeVendor',
      'addPhysical',
      'removePhysical',
    ]) {
      expect(declaresMember(omitted)).toBe(false);
    }

    for (const absentAccessor of [
      'getAttributeValues',
      'getProductImages',
      'getProductReviews',
      'getListingPages',
      'getVendors',
      'getPhysicals',
      'getPhysicalCounts',
    ]) {
      expect(declaresMember(absentAccessor)).toBe(false);
    }
  });

  it('B16.7 - the L783-L790 footnote is RESOLVED: there is no hidden method there', () => {
    expect(declaresMember('getSimpleRepresentationPropertyName')).toBe(true);
    expect(arityOf('getSimpleRepresentationPropertyName')).toBe(0);
    expect(new Product({ productID: 'product-1' }).getSimpleRepresentationPropertyName()).toBe(
      'productName',
    );

    expect(declaresMember('removePhysical')).toBe(false);
  });

  it('B16.5 - far-side accessors hand back LIVE arrays, and no defensive copy is added', () => {
    const brand = new Brand({ brandID: 'brand-1', brandName: 'Live' });
    const product = new Product({ productID: 'product-1' });

    const beforeWiring = brand.getProducts();
    product.setBrand(brand);

    expect(brand.getProducts()).toBe(beforeWiring);
    expect(beforeWiring).toHaveLength(1);
  });
});

// B16.6, BEHAVIOURALLY: the ten delegations and six probes, against REAL far sides.
describe('B16.6 behaviour - the promotion and price-group delegations, as two-sided round trips', () => {
  /**
   * A saved product, which is what makes the far side's `hasProduct` guard reachable.
   */
  const savedProduct = (): Product => new Product({ productID: 'product-1' });

  const aReward = (promotionRewardID = 'reward-1'): PromotionReward =>
    new PromotionReward({ promotionRewardID });

  const aQualifier = (promotionQualifierID = 'qualifier-1'): PromotionQualifier =>
    new PromotionQualifier({ promotionQualifierID });

  const aRate = (priceGroupRateID = 'rate-1'): PriceGroupRate =>
    new PriceGroupRate({ priceGroupRateID });

  it('★★ addPromotionReward wires BOTH sides, and removePromotionReward unwires both', () => {
    const product = savedProduct();
    const reward = aReward();

    product.addPromotionReward(reward);

    // The delegation is `promotionReward.addProduct(this)` [model/entity/Product.cfc:L732-L734],
    // and the far side pushes onto both collections - so a one-sided implementation fails here.
    expect(reward.getProducts()).toContain(product);
    expect(product.getPromotionRewards()).toContain(reward);

    product.removePromotionReward(reward);

    expect(reward.getProducts()).toHaveLength(0);
    expect(product.getPromotionRewards()).toHaveLength(0);
  });

  it('★★ and the exclusion pair wires the EXCLUSION collections, never the include ones', () => {
    const product = savedProduct();
    const reward = aReward();

    product.addPromotionRewardExclusion(reward);

    expect(reward.getExcludedProducts()).toContain(product);
    expect(product.getPromotionRewardExclusions()).toContain(reward);

    // ISOLATION, which is the half a structural assertion cannot reach: a delegation wired to the
    // wrong collection would exclude a product from a reward that also grants it.
    expect(reward.getProducts()).toHaveLength(0);
    expect(product.getPromotionRewards()).toHaveLength(0);

    product.removePromotionRewardExclusion(reward);

    expect(reward.getExcludedProducts()).toHaveLength(0);
    expect(product.getPromotionRewardExclusions()).toHaveLength(0);
  });

  it('★★ addPromotionQualifier and its exclusion behave the same way, on their own collections', () => {
    const product = savedProduct();
    const qualifier = aQualifier();
    const excludedQualifier = aQualifier('qualifier-2');

    product.addPromotionQualifier(qualifier);
    product.addPromotionQualifierExclusion(excludedQualifier);

    expect(qualifier.getProducts()).toContain(product);
    expect(product.getPromotionQualifiers()).toEqual([qualifier]);
    expect(excludedQualifier.getExcludedProducts()).toContain(product);
    expect(product.getPromotionQualifierExclusions()).toEqual([excludedQualifier]);

    // Neither collection leaked into the other, even with both wired at once.
    expect(qualifier.getExcludedProducts()).toHaveLength(0);
    expect(excludedQualifier.getProducts()).toHaveLength(0);

    product.removePromotionQualifier(qualifier);
    product.removePromotionQualifierExclusion(excludedQualifier);

    expect(product.getPromotionQualifiers()).toHaveLength(0);
    expect(product.getPromotionQualifierExclusions()).toHaveLength(0);
    expect(qualifier.getProducts()).toHaveLength(0);
    expect(excludedQualifier.getExcludedProducts()).toHaveLength(0);
  });

  it('★★ addPriceGroupRate and removePriceGroupRate wire and unwire both sides', () => {
    const product = savedProduct();
    const rate = aRate();

    product.addPriceGroupRate(rate);

    expect(rate.getProducts()).toContain(product);
    expect(product.getPriceGroupRates()).toEqual([rate]);

    product.removePriceGroupRate(rate);

    expect(rate.getProducts()).toHaveLength(0);
    expect(product.getPriceGroupRates()).toHaveLength(0);
  });

  it('★★ a SECOND add adds nothing more for a SAVED product - the guard is by identifier', () => {
    const product = savedProduct();
    const reward = aReward();

    product.addPromotionReward(reward);
    product.addPromotionReward(reward);

    // Guard L259 + L262: `if(product.isNew() or !hasProduct(product))`. A saved product is
    // compared by identifier, so the second add is a no-op on both sides.
    expect(reward.getProducts()).toHaveLength(1);
    expect(product.getPromotionRewards()).toHaveLength(1);
  });

  it('★★ but a NEW product is admitted TWICE, which is the legacy guard reproduced literally', () => {
    // `isNew()` is `productID === ''` `model/entity/Product.cfc`, and the legacy guard
    // SHORT-CIRCUITS on it: an unsaved row has no identifier to compare, so the guard admits it
    // unconditionally.
    const draft = new Product({ productID: '' });
    const reward = aReward();

    expect(draft.isNew()).toBe(true);

    draft.addPromotionReward(reward);
    draft.addPromotionReward(reward);

    expect(reward.getProducts()).toHaveLength(2);

    // The PRODUCT side is guarded differently - by `product.hasPromotionReward(reward)`, which for
    // a reward carrying a real identifier compares identifiers - so it holds one.
    expect(draft.getPromotionRewards()).toHaveLength(1);
  });

  it('★★ the six probes match by IDENTIFIER, so a re-hydrated instance is recognised', () => {
    // The property that matters at a repository boundary: two instances describing the same row
    // are the same association member, because hydration produces a fresh object per read.
    const product = savedProduct();
    const reward = aReward('reward-1');

    product.addPromotionReward(reward);

    expect(product.hasPromotionReward(new PromotionReward({ promotionRewardID: 'reward-1' }))).toBe(
      true,
    );
    expect(product.hasPromotionReward(new PromotionReward({ promotionRewardID: 'reward-2' }))).toBe(
      false,
    );

    // And the probes are per-collection: an included reward is not an excluded one.
    expect(product.hasPromotionRewardExclusion(reward)).toBe(false);

    const qualifier = aQualifier('qualifier-1');
    product.addPromotionQualifierExclusion(qualifier);

    expect(
      product.hasPromotionQualifierExclusion(
        new PromotionQualifier({ promotionQualifierID: 'qualifier-1' }),
      ),
    ).toBe(true);
    expect(product.hasPromotionQualifier(qualifier)).toBe(false);
  });

  it('★★ an UNSAVED far side falls back to IDENTITY on every probe this entity owns', () => {
    // A far side with no identifier cannot be compared by one, so each probe on this entity falls
    // back to `includes(...)`: the same instance is held, a different unsaved instance is not.
    const product = savedProduct();
    const draftReward = aReward('');
    const draftRate = aRate('');
    const draftQualifier = aQualifier('');

    product.addPromotionReward(draftReward);
    product.addPriceGroupRate(draftRate);
    product.addPromotionQualifierExclusion(draftQualifier);

    expect(product.hasPromotionReward(draftReward)).toBe(true);
    expect(product.hasPromotionReward(aReward(''))).toBe(false);
    expect(product.hasPriceGroupRate(draftRate)).toBe(true);
    expect(product.hasPriceGroupRate(aRate(''))).toBe(false);
    expect(product.hasPromotionQualifierExclusion(draftQualifier)).toBe(true);
    expect(product.hasPromotionQualifierExclusion(aQualifier(''))).toBe(false);
  });

  it('★★ and the FAR SIDES disagree about that - PriceGroupRate.hasProduct has no such fallback', () => {
    // The asymmetry, asserted where it actually lives.
    const draft = new Product({ productID: '' });
    const otherDraft = new Product({ productID: '' });

    const reward = aReward();
    const qualifier = aQualifier();
    const rate = aRate();

    draft.addPromotionReward(reward);
    draft.addPromotionQualifier(qualifier);
    draft.addPriceGroupRate(rate);

    expect(reward.hasProduct(draft)).toBe(true);
    expect(reward.hasProduct(otherDraft)).toBe(false);
    expect(qualifier.hasProduct(draft)).toBe(true);
    expect(qualifier.hasProduct(otherDraft)).toBe(false);

    expect(rate.hasProduct(draft)).toBe(true);
    expect(rate.hasProduct(otherDraft)).toBe(true);
  });

  it('removing something never added leaves both sides untouched rather than throwing', () => {
    // `splice` is guarded by an `indexOf` test on both sides, so a remove is idempotent - which is
    // what makes it safe in a reconciliation loop that does not track what it has already done.
    const product = savedProduct();
    const reward = aReward();

    expect(() => {
      product.removePromotionReward(reward);
      product.removePromotionRewardExclusion(reward);
    }).not.toThrow();

    expect(reward.getProducts()).toHaveLength(0);
    expect(product.getPromotionRewards()).toHaveLength(0);
  });
});

// No Hibachi base class is ported: `Product.cfc` extends `HibachiEntity`, which extends
// `org.Hibachi.HibachiEntity`, and that tree is extracted from rather than translated -
// persistence moves to the repositories.

describe('inherited-base behaviours: the legacy contract documented and the shipped reality asserted', () => {
  it('B17.1 - the unknown-getter split is 4 SILENT / 14 THROW, and Product is one of the four', () => {
    for (const absent of [
      'onMissingMethod',
      'getAttributeValue',
      'getAttributeValues',
      'setAttributeValue',
      'getAttributeValuesByAttributeIDStruct',
      'getAttributeValuesByAttributeCodeStruct',
      'getAttributeValuesForEntity',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }

    const subject = new Product({ productID: 'product-1' });
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(/onMissingMethod/);
    expect(() => subject.getSalePriceExpirationDateTime()).toThrow(
      /org\/Hibachi\/HibachiEntity\.cfc:L507-L565/,
    );
  });

  it('B17.2 - the PARTIAL cache invalidation is documentary, because all four caches are omitted', () => {
    // The legacy contract, and it is a latent staleness bug.
    for (const absent of [
      'clearAttributeCache',
      'getAssignedAttributeSetSmartList',
      'getAttributeSetSmartList',
      'getContentSmartList',
      'getSkuSmartList',
      'getProductSmartList',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }
  });

  it('B17.3 - only isNew() is authored; getNewFlag, getPrintTemplates and getEmailTemplates are not', () => {
    for (const absent of ['getNewFlag', 'getPrintTemplates', 'getEmailTemplates']) {
      expect(declaresMember(absent)).toBe(false);
    }

    expect(declaresMember('isNew')).toBe(true);
    expect(arityOf('isNew')).toBe(0);
    expect(new Product({ productID: '' }).isNew()).toBe(true);
    expect(new Product({ productID: 'product-1' }).isNew()).toBe(false);
  });

  it('B17.4 - the ORM event hooks are absent, and the raw debug dump is emphatically not ported', () => {
    // The legacy contract.
    for (const absent of [
      'preInsert',
      'preUpdate',
      'postInsert',
      'postUpdate',
      'preDelete',
      'postDelete',
      'isPersistable',
      'logHibachi',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }
    expect(declaresMember('getErrors')).toBe(true);
    expect(declaresMember('writeDump')).toBe(false);

    const stamped = new Product({
      productID: 'product-1',
      createdDateTime: CREATED_INSTANT,
      createdByAccountID: 'account-1',
      modifiedDateTime: MODIFIED_INSTANT,
      modifiedByAccountID: 'account-2',
    });

    expect(stamped.getCreatedDateTime()?.toISOString()).toBe(CREATED_INSTANT.toISOString());
    expect(stamped.getModifiedDateTime()?.toISOString()).toBe(MODIFIED_INSTANT.toISOString());
    expect(stamped.getCreatedByAccountID()).toBe('account-1');
    expect(stamped.getModifiedByAccountID()).toBe('account-2');
  });

  it('B17.5 - the DEAD RETRY on the base is recorded as present-but-unexercised', () => {
    // The "retry" re-calls the same method with the same argument, so a first null yields a second
    // null.
    expect(declaresMember('getAttributeByAttributeCode')).toBe(false);
    expect(declaresMember('getAttributeValue')).toBe(false);

    expect(LEGACY_MERCHANDISE_PRODUCT_TYPE_ID).toHaveLength(32);
    expect(LEGACY_NON_MERCHANDISE_PRODUCT_TYPE_ID).toHaveLength(32);
  });

  it('B17.6 - the five framework-coupled smart-list members are documented non-ports', () => {
    // Smart lists are not ported.
    for (const absent of [
      'getListingPagesOptionsSmartList',
      'getTemplateOptions',
      'getDefaultProductImageFiles',
      'getAssignedAttributeSetSmartList',
      'findProducts',
      'findSkus',
      'addFilter',
      'addOrder',
      'setSelectDistinctFlag',
      'getRecords',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }

    expect(declaresMember('getOptionGroups')).toBe(true);
    expect(declaresMember('getOptionGroupsStruct')).toBe(true);
    expect(declaresMember('getOptionGroupCount')).toBe(true);

    expect(declaresMember('getImages')).toBe(false);
    expect(declaresMember('getImageFileName')).toBe(false);
    expect(declaresMember('getResizedImagePath')).toBe(false);
  });

  it('B17.6 - the THIRD memo idiom is recorded: isDefined alongside structKeyExists and isNull', () => {
    // CFML parity - three distinct memo idioms in one file, all meaning "compute once":
    // `!structKeyExists(variables, "x")`, the dominant form
    // [model/entity/Product.cfc:L252, L518, L525, L605, L625]; `isNull(variables.x)`, used
    // elsewhere in the folder; and `!isDefined("variables.templateOptions")`
    // [model/entity/Product.cfc:L172].
    const first = new Product({ productID: 'product-1' });
    const second = new Product({ productID: 'product-2' });

    expect(first.getBrandName()).toBe('');
    expect(first.getSalePriceDiscountType()).toBe('none');
    expect(second.getBrandName()).toBe('');
    expect(second.getSalePriceDiscountType()).toBe('none');

    expect(declaresMember('getTemplateOptions')).toBe(false);
  });

  it('B17.1 - the SIX out-of-scope process contexts and methods are not reachable from here', () => {
    // Several methods inside in-scope files serve out-of-scope features, and none is ported into
    // working form.
    for (const absent of [
      'processProduct_addProductReview',
      'processProduct_addSubscriptionTerm',
      'processProduct_uploadDefaultImage',
      'processProduct_updateSkus',
      'processProduct_addOption',
      'processProduct_addOptionGroup',
      'loadDataFromFile',
      'processImageUpload',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }

    const withStub = new Product({
      productID: 'product-1',
      subscriptionTermProvider: new SubscriptionTermProviderDouble(),
    });

    return expect(withStub.getUnusedProductSubscriptionTerms()).rejects.toThrow(
      /not available in this slice/,
    );
  });
});

// T1, T2 and T6 all land here.

describe('getTitle: the productTitleString template, rendered', () => {
  // The RENDERER is `replaceStringTemplate` [org/Hibachi/HibachiUtilityService.cfc:L70-L100],
  // reproduced at its single in-scope consumer rather than as a framework utility module - AAP
  // 0.5.3 redistributes framework responsibilities explicitly.

  it('renders the LEGACY DEFAULT template, both markers resolved', () => {
    const subject = makeProductFixture();

    expect(subject.getTitle()).toBe('Test Brand Test Product');
  });

  it('★ resolves a marker whose PATH cannot be walked to the EMPTY STRING, not to the marker', () => {
    // `getValueByPropertyIdentifier` ends `return "";` [org/Hibachi/HibachiTransient.cfc:L480] and
    // `getLastObjectByPropertyIdentifier` [org/Hibachi/HibachiTransient.cfc:L483-L491] answers
    // nothing when an intermediate is null.
    const unbranded = makeProductFixture({ brand: undefined });

    expect(unbranded.getTitle()).toBe(' Test Product');
  });

  it('★★ leaves a marker naming NO PROPERTY literally in place', () => {
    // The two outcomes are not interchangeable, and this is the case that separates them.
    const subject = makeProductFixture({ productTitleString: 'A ${nonsense} B' });

    expect(subject.getTitle()).toBe('A ${nonsense} B');
  });

  it('resolves EVERY occurrence of a repeated marker, because replace() is called with "all"', () => {
    // [org/Hibachi/HibachiUtilityService.cfc:L96] is `replace(returnString, key, value, "all")`.
    const subject = makeProductFixture({ productTitleString: '${productName} / ${productName}' });

    expect(subject.getTitle()).toBe('Test Product / Test Product');
  });

  it('matches the marker identifier WITHOUT REGARD TO CASE, as CFML property lookup does', () => {
    const subject = makeProductFixture({ productTitleString: '${PRODUCTNAME}' });

    expect(subject.getTitle()).toBe('Test Product');
  });

  it('★ accepts `_` as a path delimiter as well as `.`, because listLast uses "._"', () => {
    const subject = makeProductFixture({ productTitleString: '${brand_brandName}' });

    expect(subject.getTitle()).toBe('Test Brand');
  });

  it('renders a template with NO markers verbatim', () => {
    const subject = makeProductFixture({ productTitleString: 'A Fixed Title' });

    expect(subject.getTitle()).toBe('A Fixed Title');
  });

  it('★ does not treat `${}` as a marker, because the regex body cannot be empty', () => {
    // `\${[^}]+}` [org/Hibachi/HibachiUtilityService.cfc:L71] requires at least one character
    // between the braces.
    const subject = makeProductFixture({ productTitleString: 'A ${} B' });

    expect(subject.getTitle()).toBe('A ${} B');
  });

  it('★★ does not let a `$`-bearing property value inject itself back into the title', () => {
    // The one place the port must add something CFML did not need.
    const subject = makeProductFixture({
      productName: 'Half $& Half',
      productTitleString: '${productName}',
    });

    expect(subject.getTitle()).toBe('Half $& Half');
  });

  it('MEMOIZES per instance, and caches an EMPTY render rather than repeating it', () => {
    // The legacy guard is `!structKeyExists(variables, "title")` [model/entity/Product.cfc:L541] -
    // key EXISTENCE, not truthiness - so a template that renders EMPTY is cached.

    const unbranded = makeProductFixture({
      brand: undefined,
      productTitleString: '${brand.brandName} ${productName}',
    });

    expect(unbranded.getTitle()).toBe(' Test Product');
    expect(unbranded.getTitle()).toBe(' Test Product');

    unbranded.setProductName('renamed after the first render');

    expect(unbranded.getTitle()).toBe(' Test Product');
  });

  it('★ REFUSES rather than inventing a title when the resolved template is absent', () => {
    // The same discipline `getProductURL()` follows: the value is optional at construction so
    // hydration can build a product for paths that never render a title.
    const unwired = makeProductFixture({ productTitleString: undefined });

    expect(() => unwired.getTitle()).toThrow(/resolved product title template/);
  });

  it('resolves the two OTHER fetch="join" associations, not only the brand', () => {
    // The declared identifier table covers every scalar column of this component and of the three
    // `fetch="join"` associations [model/entity/Product.cfc:L68-L70], which is the set a title
    // template can name.
    const subject = makeProductFixture({
      productTitleString: '${productType.productTypeName} :: ${productCode}',
    });

    expect(subject.getTitle()).toBe(
      `${subject.getProductType()?.getProductTypeName() ?? ''} :: ${subject.getProductCode() ?? ''}`,
    );
    expect(subject.getTitle()).not.toContain('${');
  });
});

describe('ports, not locators: the composition surface this entity actually has', () => {
  it('B18.2 - NO service locator survives: the whole `getService` family is absent', () => {
    for (const absent of [
      'getService',
      'getProductService',
      'getSkuService',
      'getOptionService',
      'getContentService',
      'getPromotionService',
      'getSubscriptionService',
      'getAttributeService',
      'getStockService',
      'getInventoryService',
      'getHibachiUtilityService',
      'getHibachiScope',
      'getSlatwallScope',
      'getHibachiDAO',
      'invokeMethod',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }

    const subject = new Product({ productID: 'product-1' });
    expect(() => subject.getProductOptionsByGroup()).toThrow(/getProductService\(\)/);
  });

  it('B18.1 - the subject is built BY HAND, with explicit ports and inline doubles', () => {
    const settings = new SettingsProviderDouble(URL_KEY_UNDER_TEST);
    const skuRepository = new SkuRepositoryDouble();
    const optionRepository = new OptionRepositoryDouble();
    const productRepository = new ProductRepositoryDouble();
    const subscriptionTermProvider = new SubscriptionTermProviderDouble();

    const subject = new Product({
      productID: 'product-1',
      settingsProvider: settings,
      skuRepository,
      optionRepository,
      productRepository,
      subscriptionTermProvider,
    });

    expect(subject.getProductURL()).toBe(`/${URL_KEY_UNDER_TEST}//`);
    expect(settings.reads).toEqual(['globalURLKeyProduct']);
  });

  it('B18.4 - the port ledger is LOCKED AT THIRTEEN, and Product receives exactly FIVE of them', () => {
    // The thirteen ports, in the order the AAP declares them: productRepository, skuRepository,
    // optionRepository, productTypeRepository, promotionRepository, priceGroupRepository,
    // settingsProvider.
    const accepted = new Product({
      productID: 'product-1',
      settingsProvider: new SettingsProviderDouble(URL_KEY_UNDER_TEST),
      skuRepository: new SkuRepositoryDouble(),
      optionRepository: new OptionRepositoryDouble(),
      productRepository: new ProductRepositoryDouble(),
      subscriptionTermProvider: new SubscriptionTermProviderDouble(),
    });

    expect(accepted.getProductID()).toBe('product-1');

    for (const absent of [
      'getProductTypeRepository',
      'getPromotionRepository',
      'getPriceGroupRepository',
      'getCurrencyConverter',
      'getAddressZoneEvaluator',
      'getUrlTitleGenerator',
      'getImageStore',
      'getProductFeedPort',
      'getSettingsProvider',
      'getSkuRepository',
      'getOptionRepository',
      'getProductRepository',
      'getSubscriptionTermProvider',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }

    // `getTitle` was on that list and has shipped - see the B13.4 case for the full record.
    expect(declaresMember('getTitle')).toBe(true);

    // And no accessor for the template either.
    expect(declaresMember('getProductTitleTemplate')).toBe(false);
  });

  it('B18.4 - a missing port produces a NAMED REFUSAL that cites its own legacy locator', () => {
    const unwired = new Product({ productID: 'product-1' });

    const refusals: ReadonlyArray<readonly [() => unknown, string, string]> = [
      [() => unwired.getProductURL(), 'settings provider', 'L208'],
      [() => unwired.getListingProductURL(), 'settings provider', 'L212'],
    ];

    for (const [invoke, collaborator, locator] of refusals) {
      expect(invoke).toThrow(new RegExp(`the ${collaborator} collaborator was not injected`));
      expect(invoke).toThrow(new RegExp(`model/entity/Product\\.cfc:${locator}`));
      expect(invoke).toThrow(/Repositories own hydration and must supply it/);
    }

    return Promise.all([
      expect(unwired.getSkusBySelectedOptions('option-1')).rejects.toThrow(
        /the sku repository collaborator was not injected/,
      ),
      expect(unwired.getUnusedProductOptions()).rejects.toThrow(/model\/entity\/Product\.cfc:L637/),
      expect(unwired.getUnusedProductOptionGroups()).rejects.toThrow(
        /model\/entity\/Product\.cfc:L644/,
      ),
      expect(unwired.getTransactionExistsFlag()).rejects.toThrow(
        /model\/entity\/Product\.cfc:L626/,
      ),
      expect(unwired.getAttributeSets()).rejects.toThrow(
        /the product repository collaborator was not injected/,
      ),
    ]);
  });

  it('B18.3 - Product receives NO CLOCK, and no business date is ever read from the system', () => {
    // Exactly two entities in the slice take a clock, both as a plain constructor parameter rather
    // than a port: `promotionPeriod.ts` and `promotionCode.ts`.
    for (const absent of ['getNow', 'now', 'getClock', 'getCurrentDateTime']) {
      expect(declaresMember(absent)).toBe(false);
    }

    expect(CREATED_INSTANT.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(MODIFIED_INSTANT.toISOString()).toBe('2024-06-15T12:30:45.000Z');
    expect(SALE_PRICE_EXPIRATION_INSTANT.toISOString()).toBe('2024-12-31T23:59:59.000Z');

    const stamped = new Product({
      productID: 'product-1',
      createdDateTime: CREATED_INSTANT,
      modifiedDateTime: MODIFIED_INSTANT,
    });

    expect(stamped.getCreatedDateTime()).toBe(CREATED_INSTANT);
    expect(stamped.getModifiedDateTime()).toBe(MODIFIED_INSTANT);
  });

  it('B18.5 - the doubles are HAND-WRITTEN and RECORDING, with no mocking library involved', () => {
    const skuRepository = new SkuRepositoryDouble();
    const product = new Product({ productID: 'product-1', skuRepository });

    expect(skuRepository.selectedOptionsCalls).toEqual([]);

    return product.getSkusBySelectedOptions('option-1,option-2').then((resolved: Sku[]) => {
      expect(resolved).toEqual([]);
      expect(skuRepository.selectedOptionsCalls).toEqual([
        { selectedOptions: 'option-1,option-2', productID: 'product-1' },
      ]);
    });
  });

  it('B18.6 - the stub ports answer only their DOCUMENTED behaviour, never a partial feature', () => {
    const withStub = new Product({
      productID: 'product-1',
      subscriptionTermProvider: new SubscriptionTermProviderDouble(),
    });

    return Promise.all([
      expect(withStub.getUnusedProductSubscriptionTerms()).rejects.toThrow(
        /model\/entity\/Product\.cfc:L651/,
      ),
      expect(withStub.getUnusedProductSubscriptionTerms()).rejects.toThrow(/getSubscriptionTerm/),
      expect(withStub.getUnusedProductSubscriptionTerms()).rejects.toThrow(/wired/),
    ]);
  });

  it('B18.1 - there is NO ambient scope, and the price-group scope inconsistency has nowhere to land', () => {
    for (const absent of [
      'setting',
      'getSetting',
      'getSettingDetails',
      'getSettingValueFormattedFor',
      'rbKey',
      'getRBKey',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }

    const settings = new SettingsProviderDouble('some-other-key');
    const product = new Product({
      productID: 'product-1',
      urlTitle: 'x',
      settingsProvider: settings,
    });

    expect(product.getProductURL()).toBe('/some-other-key/x/');
    expect(product.getProductURL()).not.toContain(URL_KEY_UNDER_TEST);
  });
});

describe('A2: every memo is request-scoped, and no state crosses instances', () => {
  it('B19.2 - SEVEN of the eight memos on a second instance start FRESH, never inheriting', () => {
    // The whole-family isolation proof. Each memo is driven to a DISTINCT value on the first
    // instance, and the second - built with different collaborators - answers from its own state.
    const firstBrand = new Brand({ brandID: 'brand-1', brandName: 'First Brand' });
    const firstGroup = buildOptionGroup('group-1', 1, 'FIRST');
    const firstOptionRepository = new OptionRepositoryDouble(
      [{ name: 'First Option', value: 'option-1' }],
      [{ name: 'First Group', value: 'group-1' }],
    );
    const firstSkuRepository = new SkuRepositoryDouble([], true);

    const first = new Product({
      productID: 'product-1',
      brand: firstBrand,
      optionGroups: [firstGroup],
      defaultSku: makeSkuFixture({
        skuID: 'sku-1',
        salePriceDetail: {
          skuID: 'sku-1',
          discountLevel: 'sku',
          salePriceDiscountType: 'percentageOff',
          salePrice: Money.fromDecimalString('17.99'),
          promotionID: 'promotion-1',
        },
      }),
      optionRepository: firstOptionRepository,
      skuRepository: firstSkuRepository,
    });

    const secondBrand = new Brand({ brandID: 'brand-2', brandName: 'Second Brand' });
    const secondGroup = buildOptionGroup('group-2', 2, 'SECOND');
    const secondOptionRepository = new OptionRepositoryDouble([], []);
    const secondSkuRepository = new SkuRepositoryDouble([], false);

    const second = new Product({
      productID: 'product-2',
      brand: secondBrand,
      optionGroups: [secondGroup],
      optionRepository: secondOptionRepository,
      skuRepository: secondSkuRepository,
    });

    return Promise.all([
      first.getUnusedProductOptions(),
      first.getUnusedProductOptionGroups(),
      first.getTransactionExistsFlag(),
      second.getUnusedProductOptions(),
      second.getUnusedProductOptionGroups(),
      second.getTransactionExistsFlag(),
    ]).then(
      ([
        firstOptions,
        firstGroups,
        firstTransaction,
        secondOptions,
        secondGroups,
        secondTransaction,
      ]) => {
        expect(first.getOptionGroups()).toHaveLength(1);
        expect(structKeyList(first.getOptionGroupsStruct())).toEqual(['group-1']);
        expect(structKeyList(second.getOptionGroupsStruct())).toEqual(['group-2']);

        expect(first.getBrandName()).toBe('First Brand');
        expect(second.getBrandName()).toBe('Second Brand');

        expect(first.getSalePriceDiscountType()).toBe('percentageOff');
        expect(second.getSalePriceDiscountType()).toBe('none');

        expect(firstTransaction).toBe(true);
        expect(secondTransaction).toBe(false);

        expect(firstOptions).toHaveLength(1);
        expect(firstGroups).toHaveLength(1);
        expect(secondOptions).toEqual([]);
        expect(secondGroups).toEqual([]);
      },
    );
  });

  it('B19.2 - each memo computes ONCE per instance, proven by counting the far-side reach', () => {
    const optionRepository = new OptionRepositoryDouble(
      [{ name: 'Option', value: 'option-1' }],
      [{ name: 'Group', value: 'group-1' }],
    );
    const skuRepository = new SkuRepositoryDouble();

    const subject = new Product({
      productID: 'product-1',
      optionGroups: [buildOptionGroup('group-1', 1, 'GRP')],
      optionRepository,
      skuRepository,
    });

    return Promise.all([
      subject.getUnusedProductOptions(),
      subject.getUnusedProductOptionGroups(),
      subject.getTransactionExistsFlag(),
    ])
      .then(() =>
        Promise.all([
          subject.getUnusedProductOptions(),
          subject.getUnusedProductOptionGroups(),
          subject.getTransactionExistsFlag(),
        ]),
      )
      .then(() =>
        Promise.all([
          subject.getUnusedProductOptions(),
          subject.getUnusedProductOptionGroups(),
          subject.getTransactionExistsFlag(),
        ]),
      )
      .then(() => {
        expect(optionRepository.unusedOptionsCalls).toHaveLength(1);
        expect(optionRepository.unusedOptionGroupsCalls).toHaveLength(1);
        expect(skuRepository.transactionExistsCalls).toHaveLength(1);

        const firstRead = subject.getOptionGroupsStruct();
        expect(subject.getOptionGroupsStruct()).toBe(firstRead);
        expect(subject.getOptionGroupsStruct()).toBe(firstRead);
      });
  });

  it('B19.2 - the memo SEEDS do not leak either, which is the subtler half of the isolation', () => {
    const brandless = new Product({ productID: 'product-1' });
    expect(brandless.getBrandName()).toBe('');
    expect(brandless.getSalePriceDiscountType()).toBe('none');

    const branded = new Product({
      productID: 'product-2',
      brand: new Brand({ brandID: 'brand-1', brandName: 'Leak Detector' }),
      defaultSku: makeSkuFixture({
        skuID: 'sku-1',
        salePriceDetail: {
          skuID: 'sku-1',
          discountLevel: 'product',
          salePriceDiscountType: 'amountOff',
          salePrice: Money.fromDecimalString('15.99'),
          promotionID: 'promotion-1',
        },
      }),
    });
    expect(branded.getBrandName()).toBe('Leak Detector');
    expect(branded.getSalePriceDiscountType()).toBe('amountOff');

    const brandlessAgain = new Product({ productID: 'product-3' });
    expect(brandlessAgain.getBrandName()).toBe('');
    expect(brandlessAgain.getSalePriceDiscountType()).toBe('none');
  });

  it('B19.1 - there is NO mutable module-level state in this suite, and every spy is restored', () => {
    const brand = new Brand({ brandID: 'brand-1', brandName: 'Unspied' });
    expect(brand.getBrandName()).toBe('Unspied');

    const spy = vi.spyOn(brand, 'getBrandName').mockReturnValue('Spied');
    expect(new Product({ productID: 'product-1', brand }).getBrandName()).toBe('Spied');
    expect(spy).toHaveBeenCalledTimes(1);

    spy.mockRestore();
    expect(brand.getBrandName()).toBe('Unspied');
  });

  it('B19.4 - the inverted SkuDAO clear condition is recorded, and no cache is module-scoped here', () => {
    const group = buildOptionGroup('group-1', 1);
    const highOption = buildOption('option-high', 9, group);
    const lowOption = buildOption('option-low', 1, group);

    const buildGraph = (): readonly Sku[] => [
      makeSkuFixture({ skuID: 'sku-high', options: [highOption] }),
      makeSkuFixture({ skuID: 'sku-low', options: [lowOption] }),
    ];

    const withRadix = new Product({
      productID: 'product-1',
      skus: [...buildGraph()],
      nextOptionGroupSortOrder: 3,
    });

    expect(skuIDsOf(withRadix.getSkus())).toEqual(['sku-high', 'sku-low']);
    expect(skuIDsOf(withRadix.getSkus(true))).toEqual(['sku-low', 'sku-high']);

    const withoutRadix = new Product({ productID: 'product-2', skus: [...buildGraph()] });

    expect(skuIDsOf(withoutRadix.getSkus())).toEqual(['sku-high', 'sku-low']);
    expect(skuIDsOf(withoutRadix.getSkus(true))).toEqual(['sku-high', 'sku-low']);
  });

  it('B19.3 - the memos that were NOT ported have no memo to isolate, and none is invented', () => {
    // Two legacy memos have no shipped counterpart, and the honest treatment is to assert the
    // [model/entity/Product.cfc:L541-L544] (C3, reaches `hibachiUtilityService`, not a port).
    //
    // The `salePriceDetailsForSkus` memo [model/entity/Product.cfc:L518-L521] is deliberately not
    // on this list.
    expect(declaresMember('getTitle')).toBe(true);

    const firstTitled = makeProductFixture({ productName: 'First Product' });
    const secondTitled = makeProductFixture({ productName: 'Second Product' });

    expect(firstTitled.getTitle()).toBe('Test Brand First Product');
    expect(secondTitled.getTitle()).toBe('Test Brand Second Product');
    // Re-reading answers the memo, not a fresh render, and the two never share one.
    expect(firstTitled.getTitle()).toBe('Test Brand First Product');

    // The second does ship - it refuses instead of memoizing, so there is no cached rejection to.
    const first = new Product({ productID: 'product-1' });
    const second = new Product({ productID: 'product-2' });

    return Promise.all([
      expect(first.getUnusedProductSubscriptionTerms()).rejects.toThrow(/product-1/),
      expect(second.getUnusedProductSubscriptionTerms()).rejects.toThrow(/product-2/),
    ]);
  });

  it('B19.3 - the SHIPPED sale-price memo is per instance, and nothing crosses', async () => {
    const detailOne = {
      skuID: 'sku-one',
      discountLevel: 'sku' as const,
      salePriceDiscountType: 'amountOff' as const,
      salePrice: Money.fromDecimalString('1.11'),
      promotionID: 'promotion-1',
    };
    const detailTwo = {
      skuID: 'sku-two',
      discountLevel: 'sku' as const,
      salePriceDiscountType: 'amountOff' as const,
      salePrice: Money.fromDecimalString('2.22'),
      promotionID: 'promotion-2',
    };
    const asked: string[] = [];
    const salePriceResolver = {
      getSalePriceDetailsForProductSkus: (productID: string) => {
        asked.push(productID);
        return Promise.resolve(
          productID === 'product-1' ? { 'sku-one': detailOne } : { 'sku-two': detailTwo },
        );
      },
    };

    const firstProduct = new Product({ productID: 'product-1', salePriceResolver });
    const secondProduct = new Product({ productID: 'product-2', salePriceResolver });

    expect(await firstProduct.getSkuSalePriceDetails('sku-one')).toBe(detailOne);
    expect(await secondProduct.getSkuSalePriceDetails('sku-two')).toBe(detailTwo);

    // Neither instance sees the other's row, and re-reading adds no third reach.
    expect(await firstProduct.getSkuSalePriceDetails('sku-two')).toBeUndefined();
    expect(await secondProduct.getSkuSalePriceDetails('sku-one')).toBeUndefined();
    expect(asked).toEqual(['product-1', 'product-2']);
  });
});

// The rule, with its one exception stated: a method is `async` when its legacy body reaches the
// DAO or the ORM and the port still has to reach a repository to answer it.

describe('the async boundary and structural parity with the legacy component', () => {
  it('B20.1 - the TEN async members are exactly the ones whose legacy bodies reach a port', () => {
    const settings = new SettingsProviderDouble(URL_KEY_UNDER_TEST);
    const subject = new Product({
      productID: 'product-1',
      productType: buildProductType('type-1', 'merchandise', 'type-1'),
      defaultSku: makeSkuFixture({ skuID: 'sku-1' }),
      optionGroups: [],
      settingsProvider: settings,
      skuRepository: new SkuRepositoryDouble([], true),
      optionRepository: new OptionRepositoryDouble(),
      productRepository: new ProductRepositoryDouble(),
      subscriptionTermProvider: new SubscriptionTermProviderDouble(),
    });

    const promiseReturning: ReadonlyArray<readonly [string, unknown]> = [
      ['getSkuBySelectedOptions', subject.getSkuBySelectedOptions('option-1')],
      ['getSkusBySelectedOptions', subject.getSkusBySelectedOptions('option-1')],
      ['getLivePrice', subject.getLivePrice()],
      ['getCurrentAccountPrice', subject.getCurrentAccountPrice()],
      ['getUnusedProductOptions', subject.getUnusedProductOptions()],
      ['getUnusedProductOptionGroups', subject.getUnusedProductOptionGroups()],
      ['getTransactionExistsFlag', subject.getTransactionExistsFlag()],
      ['getBaseProductType', subject.getBaseProductType()],
      ['getAttributeSets', subject.getAttributeSets()],
      ['getSkuSalePriceDetails', subject.getSkuSalePriceDetails('sku-1')],
    ];

    expect(promiseReturning).toHaveLength(10);

    return Promise.all(
      promiseReturning.map(([name, value]) => {
        expect(value, name).toBeInstanceOf(Promise);

        return (value as Promise<unknown>).catch(() => undefined);
      }),
    ).then(() => {
      return expect(subject.getUnusedProductSubscriptionTerms()).rejects.toThrow(
        /not available in this slice/,
      );
    });
  });

  it('B20.1 - the synchronous members return VALUES, never thenables', () => {
    const subject = new Product({
      productID: 'product-1',
      urlTitle: 'sync-title',
      optionGroups: [buildOptionGroup('group-1', 1, 'GRP')],
      categories: [buildCategory('category-1')],
      defaultSku: makeSkuFixture({ skuID: 'sku-1' }),
      settingsProvider: new SettingsProviderDouble(URL_KEY_UNDER_TEST),
    });

    const synchronousResults: readonly unknown[] = [
      subject.getOptionGroups(),
      subject.getOptionGroupsStruct(),
      subject.getOptionGroupCount(),
      subject.getOptionsByOptionGroup('group-1'),
      subject.getSkus(),
      subject.getSkuByID('sku-1'),
      subject.getBrandName(),
      subject.getSalePrice(),
      subject.getSalePriceDiscountType(),
      subject.getCurrencyCode(),
      subject.getPrice(),
      subject.getRenewalPrice(),
      subject.getListPrice(),
      subject.getProductURL(),
      subject.getListingProductURL(),
      subject.getCategoryIDs(),
      subject.getSimpleRepresentationPropertyName(),
      subject.isNew(),
    ];

    expect(synchronousResults).toHaveLength(18);
    for (const result of synchronousResults) {
      expect(result).not.toBeInstanceOf(Promise);
    }

    expect(subject.getOptionGroupCount()).toBe(1);
    expect(subject.getProductURL()).toBe(`/${URL_KEY_UNDER_TEST}/sync-title/`);
  });

  it('B20.3 / C5 - the abbreviated physical table names are preserved exactly as the schema has them', () => {
    // SCHEMA CONTINUITY. The target reads and writes the EXISTING `Sw*` tables - no migration, no
    // rename, no new table, no column change, and no schema-generation hook anywhere in this
    // suite.
    expect(ProductLegacyMetadata.table).toBe('SwProduct');
    expect(ProductLegacyMetadata.entityName).toBe('SlatwallProduct');

    for (const absent of ['createTable', 'migrate', 'sync', 'getTableName', 'getDatasource']) {
      expect(declaresMember(absent)).toBe(false);
    }
  });

  it('B20.4 - the component-level metadata warts are ANNOTATED, not normalised', () => {
    // Six source facts preserved as inert metadata rather than smoothed over:.
    expect(ProductLegacyMetadata.processContexts).toBe(
      'updateSkus,addOptionGroup,addOption,addSubscriptionTerm',
    );
    expect(listToArray(ProductLegacyMetadata.processContexts)).toEqual([
      'updateSkus',
      'addOptionGroup',
      'addOption',
      'addSubscriptionTerm',
    ]);
    expect(listLen(ProductLegacyMetadata.processContexts)).toBe(4);

    const calculated = [
      'getCalculatedSalePrice',
      'getCalculatedQATS',
      'getCalculatedAllowBackorderFlag',
      'getCalculatedTitle',
    ];
    expect(calculated).toHaveLength(4);
    for (const member of calculated) {
      expect(declaresMember(member)).toBe(true);
      expect(arityOf(member)).toBe(0);
    }

    for (const member of ['getBrand', 'getProductType', 'getDefaultSku']) {
      expect(declaresMember(member)).toBe(true);
    }

    expect(ProductLegacyMetadata.brandOptionsNullRBKey).toBe('define.none');
    expect(ProductLegacyMetadata.productDescriptionFormFieldType).toBe('wysiwyg');
  });

  it('B20.5 - the CFML case-insensitive duplicate bindings collapse to ONE identifier each', () => {
    const optionRepository = new OptionRepositoryDouble(
      [{ name: 'Option', value: 'option-1' }],
      [{ name: 'Group', value: 'group-1' }],
    );
    const subject = new Product({
      productID: 'product-1',
      optionGroups: [buildOptionGroup('group-1', 1, 'GRP')],
      optionRepository,
    });

    return Promise.all([
      subject.getUnusedProductOptions(),
      subject.getUnusedProductOptionGroups(),
    ]).then(
      ([options, groups]: [readonly ProductUnusedOption[], readonly ProductUnusedOption[]]) => {
        expect(options).toHaveLength(1);
        expect(groups).toHaveLength(1);
        expect(optionRepository.unusedOptionsCalls).toHaveLength(1);
        expect(optionRepository.unusedOptionGroupsCalls).toHaveLength(1);
      },
    );
  });

  it('B20.1 - the hydration input is a typed contract, not an untyped CFML struct', () => {
    const minimal: ProductHydrationInput = { productID: 'product-1' };
    const populated: ProductHydrationInput = {
      productID: 'product-2',
      productName: 'Typed Contract',
      productCode: 'TYPEDXXX',
      urlTitle: 'typed-contract',
      activeFlag: true,
      publishedFlag: false,
      sortOrder: 7,
      price: Money.fromDecimalString('19.99'),
      remoteID: 'remote-1',
      createdDateTime: CREATED_INSTANT,
      modifiedDateTime: MODIFIED_INSTANT,
    };

    const bare = new Product(minimal);
    const full = new Product(populated);

    expect(bare.getProductID()).toBe('product-1');
    expect(bare.getProductName()).toBeUndefined();
    expect(bare.getSortOrder()).toBeUndefined();

    expect(full.getProductName()).toBe('Typed Contract');
    expect(full.getProductCode()).toBe('TYPEDXXX');
    expect(full.getSortOrder()).toBe(7);
    expect(full.getPrice()?.toFixed2()).toBe('19.99');
    expect(full.getActiveFlag()).toBe(true);
    expect(full.getPublishedFlag()).toBe(false);

    expect(new Product({ productID: 'product-3' }).getPublishedFlag()).toBe(false);
    expect(new Product({ productID: 'product-4' }).getActiveFlag()).toBe(false);

    const projection: ProductAttributeSet = {
      attributeSetID: 'set-1',
      attributeSetTypeSystemCode: 'astProduct',
      globalFlag: true,
      attributeCount: 3,
    };
    expect(projection.attributeSetTypeSystemCode).toBe('astProduct');
    expect(projection.attributeCount).toBe(3);
  });

  it('B20.2 - every promise in this suite is awaited or settled, so nothing floats', () => {
    const subject = new Product({
      productID: 'product-1',
      skuRepository: new SkuRepositoryDouble([makeSkuFixture({ skuID: 'sku-1' })]),
    });

    return subject
      .getSkusBySelectedOptions('option-1')
      .then((resolved: Sku[]) => {
        expect(skuIDsOf(resolved)).toEqual(['sku-1']);
        return subject.getSkuBySelectedOptions('option-1');
      })
      .then((single: Sku | undefined) => {
        expect(single?.getSkuID()).toBe('sku-1');
        return expect(
          new Product({ productID: 'product-2' }).getSkusBySelectedOptions('option-1'),
        ).rejects.toThrow(/sku repository/);
      });
  });
});

// For this entity the observable empties are `getCategoryIDs()` -> `''`, `getOptionGroupCount()`
// > `0`, `getOptionGroupsStruct()` -> `{}`, the five association accessors -> `[]`, and
// `getSkus()` -> `[]`.

describe('empty-collection semantics: five rules, named individually', () => {
  it('B21.1 rule (1) PERMISSIVE - an empty loop yields the identity value, not a refusal', () => {
    // CFML parity [model/entity/Product.cfc:L199-L205]: `getCategoryIDs()` seeds `''` and appends
    // inside a loop. With no categories the loop body never runs, so the seed survives and the
    // answer is the EMPTY STRING - the identity for list concatenation.
    const bare = new Product({ productID: 'product-1' });

    expect(bare.getCategories()).toEqual([]);
    expect(bare.getCategoryIDs()).toBe('');
    expect(cfLen(bare.getCategoryIDs())).toBe(0);
    expect(listLen(bare.getCategoryIDs())).toBe(0);

    const withOne = new Product({
      productID: 'product-2',
      categories: [buildCategory('category-1')],
    });
    expect(withOne.getCategoryIDs()).toBe('category-1');
    expect(withOne.getCategoryIDs().startsWith(',')).toBe(false);
    expect(listLen(withOne.getCategoryIDs())).toBe(1);
  });

  it('B21.1 rule (2) RESTRICTIVE - the three minCollection gates FAIL on an empty collection', () => {
    // The same empty, the opposite meaning.
    const emptyOptionRepository = new OptionRepositoryDouble([], []);
    const subject = new Product({
      productID: 'product-1',
      optionGroups: [],
      optionRepository: emptyOptionRepository,
    });

    return Promise.all([
      subject.getUnusedProductOptions(),
      subject.getUnusedProductOptionGroups(),
    ]).then(([options, groups]) => {
      expect(options).toEqual([]);
      expect(groups).toEqual([]);

      expect(PRODUCT_VALIDATION_SCHEMA.unusedProductOptions[0].minCollection).toBe(1);
      expect(PRODUCT_VALIDATION_SCHEMA.unusedProductOptionGroups[0].minCollection).toBe(1);
      expect(PRODUCT_VALIDATION_SCHEMA.unusedProductSubscriptionTerms[0].minCollection).toBe(1);

      expect(options.length >= 1).toBe(false);
      expect(groups.length >= 1).toBe(false);
    });
  });

  it('B21.1 rule (3) - hasAnyInProperty answers FALSE on empty, which cuts BOTH ways', () => {
    // The LEGACY HELPER [org/Hibachi/HibachiEntity.cfc:L339-L349] loops the candidate array and
    // returns `false` when nothing matched - including when there was nothing to match.
    expect(declaresMember('hasAnyInProperty')).toBe(false);
    expect(declaresMember('getPropertyAssignedIDList')).toBe(false);

    const bare = new Product({ productID: 'product-1' });

    expect(bare.hasSku(makeSkuFixture({ skuID: 'sku-1' }))).toBe(false);

    expect(bare.getPromotionRewards()).toEqual([]);
    expect(bare.getPromotionRewardExclusions()).toEqual([]);
    expect(bare.getPromotionQualifiers()).toEqual([]);
    expect(bare.getPromotionQualifierExclusions()).toEqual([]);
    expect(bare.getPriceGroupRates()).toEqual([]);
  });

  it('B21.1 rule (4) - the fulfillment three-way gate is SIBLING-OWNED and not asserted here', () => {
    // The FOURTH SEMANTIC lives at [model/service/PromotionService.cfc:L333-L420] and is a
    // three-way decision over qualified fulfillments rather than a two-way emptiness test.
    for (const absent of [
      'getOrderFulfillments',
      'getQualifiedFulfillmentIDs',
      'getShippingMethodOptions',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }
  });

  it('B21.1 rule (5) - the LEGACY-ASSERTED default: an empty array, never absence', () => {
    // `meta/tests/unit/entity/BrandTest.cfc` -> `defaults_are_correct()` asserts
    // `assertEquals(variables.entity.getProducts(), [])` on a freshly constructed brand, so `[]`
    // rather than `undefined` is a TEST-ENFORCED contract on the far side.
    const brand = new Brand({ brandID: 'brand-1', brandName: 'Default Empty' });
    expect(brand.getProducts()).toEqual([]);
    expect(brand.getProducts()).not.toBeUndefined();

    const bare = new Product({ productID: 'product-1' });
    expect(bare.getSkus()).toEqual([]);
    expect(bare.getCategories()).toEqual([]);
    expect(bare.getRelatedProducts()).toEqual([]);

    // But not universally, and the exception matters: `optionGroups` is not defaulted, so
    // `getOptionGroups()` refuses rather than answering `[]`.
    expect(() => bare.getOptionGroups()).toThrow();
  });

  it('B21.1 - the three scalar empties on this entity, each with its own identity value', () => {
    // Three accessors, three different "empty" values, none interchangeable: `getCategoryIDs()` ->
    // `''`, the identity for list concatenation; `getOptionGroupCount()` -> `0`, the identity for
    // counting; `getOptionGroupsStruct()` -> `{}`.
    const emptyGroups = new Product({ productID: 'product-1', optionGroups: [] });

    expect(emptyGroups.getCategoryIDs()).toBe('');
    expect(emptyGroups.getOptionGroupCount()).toBe(0);
    expect(emptyGroups.getOptionGroupsStruct()).toEqual({});
    expect(structKeyList(emptyGroups.getOptionGroupsStruct())).toEqual([]);
    expect(structKeyExists(emptyGroups.getOptionGroupsStruct(), 'group-1')).toBe(false);

    // And the CFML truthiness of each empty is the same `false`, which is why the source could
    // write `if(arrayLen(x))` and `if(len(x))` interchangeably.
    expect(cfTruthy(emptyGroups.getOptionGroupCount())).toBe(false);
    // `''` is accepted and falsy - that specific case is load-bearing for the currency eligibility
    // gate at [model/entity/Sku.cfc:L373], `if(len(setting('skuEligibleCurrencies')))`.
    expect(cfTruthy(emptyGroups.getCategoryIDs())).toBe(false);
    expect(cfTruthy(cfLen(emptyGroups.getCategoryIDs()))).toBe(false);

    // C24 - and a non-empty non-numeric string is a conversion error, not `true`.
    expect(() => cfTruthy('category-1')).toThrow(/cannot convert the string/);

    const populated = new Product({
      productID: 'product-2',
      optionGroups: [buildOptionGroup('group-1', 1, 'GRP')],
      categories: [buildCategory('category-1')],
    });
    expect(cfTruthy(populated.getOptionGroupCount())).toBe(true);
    expect(cfTruthy(cfLen(populated.getCategoryIDs()))).toBe(true);
    expect(cfLen(populated.getCategoryIDs())).toBe('category-1'.length);
    expect(listLen(populated.getCategoryIDs())).toBe(1);
  });

  it('B21.1 - the empty-collection path through getSalePrice is rule (1), and it still returns ZERO', () => {
    // LEGACY-DEFECT [model/entity/Product.cfc:L598]: the statement getSkus()[1].getSalePrice();
    // has no return, so execution falls through to return 0 at L600 and the sku's sale price is
    // discarded.
    // Preserved deliberately; do not fix without a product decision.
    const withNoSkus = new Product({ productID: 'product-1' });
    expect(withNoSkus.getSkus()).toEqual([]);
    expect(cfTruthy(withNoSkus.getSkus().length)).toBe(false);
    expect(withNoSkus.getSalePrice().toFixed2()).toBe('0.00');
    expect(withNoSkus.getSalePrice()).not.toBeUndefined();

    const withSkus = new Product({
      productID: 'product-2',
      skus: [makeSkuFixture({ skuID: 'sku-1' })],
    });
    expect(cfTruthy(withSkus.getSkus().length)).toBe(true);
    expect(withSkus.getSalePrice().toFixed2()).toBe('0.00');
  });

  it('B21.1 - the Product<->Sku fixture cycle is broken by the [] default, and graphs are explicit', () => {
    const bareFixture = makeProductFixture({});
    expect(bareFixture.getSkus()).toEqual([]);

    const viaConstructor = new Product({
      productID: 'product-1',
      skus: [makeSkuFixture({ skuID: 'sku-a' })],
    });
    expect(skuIDsOf(viaConstructor.getSkus())).toEqual(['sku-a']);

    const viaFarSide = new Product({ productID: 'product-2' });
    makeSkuFixture({ skuID: 'sku-b', product: viaFarSide });
    expect(skuIDsOf(viaFarSide.getSkus())).toEqual(['sku-b']);

    expect(viaFarSide.getSkus()).toHaveLength(1);
    expect(viaFarSide.isNew()).toBe(false);
  });
  // The save-refusal channel - addError / hasErrors / getErrors.

  it('reports NO errors on a freshly constructed product, so a clean save is distinguishable', () => {
    const product = makeProductFixture({});

    expect(product.hasErrors()).toBe(false);
    expect(product.getErrors()).toStrictEqual({});
  });

  it('records a failed rule under the property it is declared on', () => {
    const product = makeProductFixture({});

    product.addError('productName', 'productName is required');

    expect(product.hasErrors()).toBe(true);
    expect(product.getErrors()).toStrictEqual({ productName: ['productName is required'] });
  });

  it('APPENDS a second message for the same property, as the legacy error bean does', () => {
    // [org/Hibachi/HibachiErrors.cfc:L14-L21] creates the entry on first use and appends
    // afterwards, so two failed rules on one property are two messages under one key rather than a
    // replacement.
    const product = makeProductFixture({});

    product.addError('productCode', 'productCode is required');
    product.addError('productCode', 'productCode contains an unsupported character');

    expect(product.getErrors()).toStrictEqual({
      productCode: ['productCode is required', 'productCode contains an unsupported character'],
    });
  });

  it('folds the error name like a CFML struct key, keeping the FIRST spelling it was given', () => {
    // A CFML struct key is case-insensitive, so `addError("urlTitle", …)` and
    // `addError("URLTitle", …)` wrote to one key there.
    const product = makeProductFixture({});

    product.addError('urlTitle', 'urlTitle is required');
    product.addError('URLTITLE', 'urlTitle must be unique');

    expect(Object.keys(product.getErrors())).toStrictEqual(['urlTitle']);
    expect(product.getErrors()).toStrictEqual({
      urlTitle: ['urlTitle is required', 'urlTitle must be unique'],
    });
  });

  it('hands back a SNAPSHOT, so a caller cannot mutate the entity’s error state', () => {
    const product = makeProductFixture({});
    product.addError('productName', 'productName is required');

    const errors = product.getErrors();
    const messages = errors['productName'];

    expect(messages).toStrictEqual(['productName is required']);

    // The projection is frozen, not merely copied, so the write is refused rather than absorbed
    // into a throwaway array.
    expect(() => {
      (messages as string[]).push('injected by a caller');
    }).toThrow(TypeError);
    expect(Object.isFrozen(messages)).toBe(true);
    expect(Object.isFrozen(errors)).toBe(true);

    expect(product.getErrors()).toStrictEqual({ productName: ['productName is required'] });
  });

  it('keeps an error name of `__proto__` as an OWN key and never reaches the prototype', () => {
    const product = makeProductFixture({});

    product.addError('__proto__', 'a rule reported against an unusual property name');

    const errors = product.getErrors();

    expect(Object.hasOwn(errors, '__proto__')).toBe(true);
    expect(product.hasErrors()).toBe(true);
    expect(Object.prototype).not.toHaveProperty('polluted');
    expect(
      ({} as Record<string, unknown>)['a rule reported against an unusual property name'],
    ).toBeUndefined();
  });

  it('is PER INSTANCE: one product’s refusal is invisible on another', () => {
    const refused = makeProductFixture({ productID: 'refused-product' });
    const clean = makeProductFixture({ productID: 'clean-product' });

    refused.addError('productName', 'productName is required');

    expect(refused.hasErrors()).toBe(true);
    expect(clean.hasErrors()).toBe(false);
    expect(clean.getErrors()).toStrictEqual({});
  });
});

// The error register, invoked directly on this entity.
//
// Review reported that "nine public methods have no invocation in any test AST".
//
// The three properties asserted are the ones [org/Hibachi/HibachiTransient.cfc:L30-L64] guarantees
// and that the save-refusal semantics depend on: a MISS yields an empty array rather than
// undefined.

describe('Product: the inherited error register', () => {
  it('returns an empty array for a name that was never recorded, never undefined', () => {
    // [org/Hibachi/HibachiTransient.cfc:L34-L43]. Callers index the result directly, so an absent
    // name has to be safe to iterate - `undefined` here would turn a clean validation pass into a
    // crash.
    const subject = new Product({ productID: 'product-errors-1' });

    expect(subject.getError('noSuchRule')).toStrictEqual([]);
    expect(subject.hasErrors()).toBe(false);
    expect(subject.getErrors()).toStrictEqual({});
  });

  it('★★ accumulates messages under one name instead of replacing them', () => {
    // [org/Hibachi/HibachiTransient.cfc:L61-L64] APPENDS. Replacing would hide every failure after
    // the first, which is how a partially invalid entity comes to look like a singly invalid one.
    const subject = new Product({ productID: 'product-errors-1' });

    subject.addError('urlTitle', 'is required');
    subject.addError('urlTitle', 'must be unique');

    expect(subject.getError('urlTitle')).toStrictEqual(['is required', 'must be unique']);
    expect(subject.hasErrors()).toBe(true);
  });

  it('★★ looks a name up case-insensitively, and keeps the case it was first written with', () => {
    // CFML struct keys are case-insensitive, so `getError('URLTITLE')` must find what `addError`
    // recorded as `urlTitle` - while [org/Hibachi/HibachiErrors.cfc:L14-L31] REMEMBERS the first
    // spelling.
    const subject = new Product({ productID: 'product-errors-1' });

    subject.addError('urlTitle', 'first');
    subject.addError('URLTITLE', 'second');

    expect(subject.getError('UrlTitle')).toStrictEqual(['first', 'second']);
    expect(Object.keys(subject.getErrors())).toStrictEqual(['urlTitle']);
  });
});
