// slatwall-ts - unit suite for `src/domain/entities/product.ts`, the port of the 841-line
// `model/entity/Product.cfc`.
//
// PROVENANCE, in three classes, labelled at every `describe` so net-new coverage is never read as
// parity:
//   1. LEGACY-EXTENDED - five cases. [meta/tests/unit/entity/ProductTest.cfc] declares
//      `productUrlIsCorrectlyFormatted` (with the `nike-air-jorden` fixture kept verbatim) and
//      overrides nothing, so it adds to the four inherited from
//      [meta/tests/unit/entity/SlatwallEntityTestBase.cfc].
//   2. ROUTED LEGACY CASES - four from [meta/tests/unit/IssuesTest.cfc]: `issue_1097`, `issue_1331`,
//      `issue_1690` and `issue_1690_2`. Three of the four assert nothing in the legacy, so each is
//      strengthened here with its lineage and original weakness named at the case. `issue_1335` and
//      `issue_1348` are recorded as sibling-owned by `skuCurrency.test.ts` and `sku.test.ts`.
//   3. NET-NEW - everything else.
//
// [meta/tests/functional/admin/entity/ProductTest.cfc] has a literally empty component body and
// contributes zero coverage; it is acknowledged as a gap rather than counted.
//
// The suite is hermetic: no environment variable, socket, filesystem, `.env` or database is touched.
//
// TWO MEMBERS THE PLAN NAMES ARE WORTH STATING HERE, because a reader checking the census against
// this file will look for both and find only one:
//
//   C3. `getTitle()` is **OMITTED**, for ONE reason: the legacy body [L540-L545]
//       routes through `hibachiUtilityService`, which is not one of the thirteen
//       ports and is not ported. `productTitleString` IS one of the seven keys the
//       settings port publishes [model/service/SettingService.cfc:L193], so the
//       setting is not a reason and is not offered as one. The omission is
//       asserted; no fourteenth port is invented.
//   C7. `getSalePriceDetailsForSkus()` **SHIPS** [L517-L522] under the shipped
//       module's documented branch (a), memoized over an injected
//       `salePriceResolver` - the SECOND interface exported by
//       `src/domain/ports/promotionRepository.ts`, satisfied in
//       `src/handlers/bootstrap.ts` and injected into `Product` from there. The
//       collaborator is OPTIONAL, so a pre-materialised map still answers
//       without reaching anything.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Inert test data
//
// Every business date is an EXPLICIT UTC ISO-8601 instant; the ambient clock is never read. This
// matters most for the sale-price expiration accessor, whose legacy body seeds itself from `now()`
// at [model/entity/Product.cfc:L616] before reaching the misspelled call at [L618].
// ---------------------------------------------------------------------------

const CREATED_INSTANT = new Date('2024-06-01T00:00:00.000Z');
const MODIFIED_INSTANT = new Date('2024-06-15T12:30:45.000Z');
const SALE_PRICE_EXPIRATION_INSTANT = new Date('2024-12-31T23:59:59.000Z');

/**
 * The URL key this suite drives `globalURLKeyProduct` with.
 *
 * DELIBERATELY NOT `'sp'`. The legacy default lives in the SETTING declaration -
 * `globalURLKeyProduct = {fieldType="text",defaultValue="sp"}` at
 * [model/service/SettingService.cfc:L178] - and NOT in the entity. A value that could never be a
 * default proves the read really goes through the settings double. The sibling keys
 * `globalURLKeyProductType` [L179] and `globalURLKeyBrand` [L177] are likewise never written as
 * literals here.
 */
const URL_KEY_UNDER_TEST = 'catalog-key-under-test';

/** The legacy fixture's url title, retained VERBATIM. See the B1 block. */
const LEGACY_URL_TITLE = 'nike-air-jorden';

/**
 * The merchandise product-type identifier the legacy seeds use, VERBATIM.
 *
 * [meta/tests/unit/IssuesTest.cfc:L58] in `issue_1097` and [meta/tests/unit/Helper.cfc:L57] both
 * name this row, and `tests/fixtures/productFixtures.ts` carries it as its default child product
 * type. It is an opaque identifier, not a credential.
 */
const LEGACY_MERCHANDISE_PRODUCT_TYPE_ID = '444df2f7ea9c87e60051f3cd87b435a1';

/**
 * The NON-merchandise product-type identifier `issue_1331` names, VERBATIM.
 *
 * [meta/tests/unit/IssuesTest.cfc:L105]. The whole point of that case is that this row is NOT
 * merchandise, so the `addOptionGroup` context gate closes.
 */
const LEGACY_NON_MERCHANDISE_PRODUCT_TYPE_ID = '444df313ec53a08c32d8ae434af5819a';

/**
 * A provisional SKU key of exactly the shape `skuService.createSkus` mints.
 *
 * `createHibachiShapedIdentifier` in `src/services/skuService.ts` reproduces
 * `createHibachiUUID()` [org/Hibachi/HibachiObject.cfc:L144-L146], whose whole body is
 * `return replace(lcase(createUUID()), '-', '', 'all');` [L145]
 * - so a draft carries thirty-two lowercase hexadecimal digits BEFORE it is
 * persisted, and `mysqlSkuRepository.insertSku` then mints a different key of the same
 * shape and discards this one. The constant is a literal rather than a call to that
 * generator because this suite asserts on the value, and because reaching into a
 * service from an entity suite would import a layer this file does not depend on.
 *
 * It is an opaque identifier, not a credential.
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

// ---------------------------------------------------------------------------
// Real far-side entities, built by hand
//
// P3 prefers hand-written doubles, and the far sides that matter - `OptionGroup`, `Option`,
// `Category`, `Brand`, `ProductType` - are all inside this suite's dependency boundary and cheap to
// construct, so REAL instances are used.

/**
 * An `OptionGroup` with a deterministic tie-breaker.
 *
 * `optionGroup.ts` defaults `optionSortTieBreaker` to a random generator, which is correct for
 * production and unusable in an assertion, so a constant is supplied. Nothing below reaches the
 * tie-breaking path - `Product` sorts on `sortOrder` alone - so this is belt and braces.
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
 * ordering in `getOptionsByOptionGroup` observable, so it is a first-class parameter here rather
 * than something the builder invents.
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
 * A `Category`, whose constructor requires EVERY key to be written.
 *
 * CFML parity [model/entity/Category.cfc]: `cmsCategoryID` and the site association are the Mura
 * CMS bridge's columns, preserved as INERT persisted values so the `Sw*` schema contract is
 * unbroken (C5), with no CMS behaviour ported. They are written as `undefined` here.
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
 * A NON-EMPTY `systemCode` SHORT-CIRCUITS THE REPOSITORY: `ProductType.getBaseProductType()`
 * returns its own system code directly when it has one, and only reaches the product-type
 * repository to load the ROOT of `productTypeIDPath` when it does not
 * [model/entity/ProductType.cfc:L110-L115]. Supplying a code is how this suite reaches the answer
 * without wiring a port that `Product` does not own.
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

// ---------------------------------------------------------------------------
// Inline hand-written recording port doubles
//
// `Product` is constructed with five collaborators here: `settingsProvider`, `skuRepository`,
// `optionRepository`, `productRepository` and `subscriptionTermProvider`. Recorders rather than
// stubs, because the argument ORDER of a positional port call is part of the contract - the legacy
// passed `(selectedOptions, productID)` positionally at [model/entity/Product.cfc:L367] - and only a
// recorder can observe it.
// ---------------------------------------------------------------------------

/** One recorded `setting(...)` read. */
type SettingRead = string;

/**
 * The settings port, over the SEVEN keys `settingsProvider.ts` publishes.
 *
 * CFML parity [model/service/SettingService.cfc:L178]: only `globalURLKeyProduct` is this entity's
 * concern, and its legacy default lives in the setting declaration rather than in the component.
 * The others are answered so the double satisfies the whole port contract - the catch-all return
 * below covers every key this entity never reads, including the three product-subsystem keys
 * [:L191, :L192, :L193].
 */
class SettingsProviderDouble {
  readonly reads: SettingRead[] = [];

  /**
   * MUTABLE ON PURPOSE. Reassigning it between two accessor calls is how B2.2 proves the URL
   * accessors re-read the port on every call instead of memoising the first answer - a memo there
   * would be wrong, because a setting is request-scoped configuration and not entity state (A2).
   */
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
      // currency. The real default is `defaultValue="USD"` at
      // [model/service/SettingService.cfc:L221], a SETTING default rather than a literal this
      // entity owns, and it is deliberately not written here.
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
 * P5: this stands in for [model/dao/SkuDAO.cfc] WITHOUT reproducing any SQL. The AND-of-EXISTS
 * matching semantics of `getSkusBySelectedOptions` [model/dao/SkuDAO.cfc:L107-L128] are an
 * integration-tier concern; here the result set is handed in, so the assertions are about what the
 * ENTITY does with a result and with what arguments it asked for one.
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
    // The port's ONLY write member, present so this double still satisfies
    // `SkuRepository`. No entity method reaches it - persistence is not an entity
    // concern - so it answers the instance unchanged.
    //
    // ★ A `saveSkus` COLLECTION FORM STOOD BESIDE IT FOR ONE REVISION, as an eighth
    // port member. It has been removed and so has this double's copy of it.
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
 * CFML parity [model/service/OptionService.cfc:L72, L76]: the legacy service passes a COMMA LIST of
 * existing option-group identifiers straight through to [model/dao/OptionDAO.cfc:L51, L94]. The
 * list stays a `string` on the port so the signature keeps parity, and this double records it
 * verbatim so the assertions can inspect what the entity built.
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
 *
 * `loadDataFromFile` REFUSES rather than resolving. The legacy bulk import
 * [model/service/ProductService.cfc:L65-L68] sets `requesttimeout=3600`, is explicitly out of
 * scope, and must not be exercised from an entity suite (C7).
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
 * B18.6: subscription handling is out of scope, so this answers `undefined` and nothing more. It
 * exists to prove that WIRING it changes nothing: the shipped `getUnusedProductSubscriptionTerms()`
 * refuses either way, because the port declares no member for that query.
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

// --- B1: THE FIVE LEGACY CASES - LEGACY-EXTENDED ---------------------------------------------
// One `it` per legacy method, each NAMED AFTER the legacy method so the lineage is greppable, each
// citing its locator, and each assertion INLINED. No shared base class is built (C1).
// [meta/tests/unit/entity/SlatwallEntityTestBase.cfc] is 70 lines.
//   L51-L54  validate_as_save_for_a_new_instance_doesnt_pass
//              variables.entity.validate(context="save");
//              assert(variables.entity.hasErrors());
//   L56-L58  simple_representation_exists_and_is_simple
//              assert(isSimpleValue(variables.entity.getSimpleRepresentation()));
//   L60-L62  has_primary_id_property_name
//              assert(len(variables.entity.getPrimaryIDPropertyName()));
//   L64-L67  defaults_are_correct                        <-- TWO assertions
//              assert(variables.entity.isNew());
//              assert(!len(variables.entity.getPrimaryIDValue()));
// with the closing brace at L68. B1.4: sibling documents variously cite the base cases as
// `L49-L68`; the VERIFIED range is L51-L67, since L49 is the `component extends=...` declaration
// and L68 the closing brace. The third case reads `getPrimaryIDPropertyName`, a DIFFERENT member
// from `getSimpleRepresentationPropertyName`; the two are never conflated.
// [meta/tests/unit/entity/ProductTest.cfc] is 65 lines: L49 declares
// `extends="Slatwall.meta.tests.unit.entity.SlatwallEntityTestBase"`, L52-L56 is a `setUp`, and
// L58-L62 adds `productUrlIsCorrectlyFormatted`. IT OVERRIDES NOTHING, so all four base bodies run
// for Product unchanged - including both assertions of `defaults_are_correct`, which the Brand
// suite correctly does NOT carry because Brand overrides that case.

describe('LEGACY-EXTENDED: the five cases Product inherits and adds', () => {
  it('validate_as_save_for_a_new_instance_doesnt_pass - not portable to this tier', () => {
    // The legacy body, verbatim [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L54]:
    //
    //   variables.entity.validate(context="save");
    //   assert(variables.entity.hasErrors());
    //
    // The legacy contract is REAL and it genuinely failed for a bare product.
    // [model/validation/Product.json] marks FIVE things required in the `save` context - `price`,
    // `productName`, `productCode`, `productType` and `urlTitle` - and `newProduct()` supplies none
    // of them.
    //
    // CFML parity [model/entity/Product.cfc:L49]: neither `validate()` nor the error register was
    // Product's own member - both came from the framework base reached through the unqualified
    // `extends="HibachiEntity"`. THE TWO ARE NOT PORTED ALIKE, and this case used to assert the
    // absence of all five members as though they were one thing.
    //
    // `validate` is metadata-driven DISPATCH over `model/validation/Product.json` through
    // `HibachiValidationService`, and it stays unported - the rules are transcribed by the service
    // that needs them, which is what "redistributed to service-tier schemas" meant.
    //
    // ★★★ THE FIVE-MEMBER REGISTER [org/Hibachi/HibachiTransient.cfc:L30-L64] IS PORTED, AND ITS
    // ABSENCE WAS A DEFECT. `HibachiService.save` [org/Hibachi/HibachiService.cfc:L151-L167] and
    // `saveProduct` [model/service/ProductService.cfc:L276, L286, L291] both read `hasErrors()` off
    // the entity and both RETURN that entity - so with no register the ported save had nowhere to put
    // a refusal, returned an entity indistinguishable from a persisted one, and was changed to throw
    // instead. Code review recorded the throw as the divergence. THE LEGACY CASE THIS BLOCK PORTS IS
    // NOW ASSERTABLE AS WRITTEN.
    expect(declaresMember('validate')).toBe(false);

    for (const present of ['hasErrors', 'hasError', 'getErrors', 'getError', 'addError']) {
      expect(declaresMember(present)).toBe(true);
    }

    // `assert(variables.entity.hasErrors())` is the legacy assertion, and it needs the SERVICE to run
    // the rules - the entity carries the answer, it does not compute it. A bare product therefore
    // starts clean here, and `tests/unit/services/productService.test.ts` is where the refusal is
    // asserted end to end.
    expect(new Product({ productID: '' }).hasErrors()).toBe(false);

    const bare = new Product({ productID: '' });

    expect(bare.getPrice()).toBeUndefined();
    expect(bare.getProductName()).toBeUndefined();
    expect(bare.getProductCode()).toBeUndefined();
    expect(bare.getProductType()).toBeUndefined();
    expect(bare.getUrlTitle()).toBeUndefined();

    // THE MECHANISM BEHIND THE LEGACY FAILURE, subtler than the other four requirements: `price`
    // resolves through `getPrice()` [model/entity/Product.cfc:L561-L568], which has neither a
    // `variables.price` shadow nor a `defaultSku` to delegate to on a bare product, so it answers
    // NOTHING. A `required` rule over an accessor that resolves to absence is what makes the save
    // context fail. This is the same fact `issue_1690` rests on.
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
    // The legacy body, verbatim [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58]:
    //
    //   assert(isSimpleValue(variables.entity.getSimpleRepresentation()));
    //
    // CFML parity [model/entity/Product.cfc:L791-L793]: Product DOES override
    // `getSimpleRepresentationPropertyName()`, returning the literal `"productName"`. What it never
    // declares is `getSimpleRepresentation()` itself - that was the framework base reading the
    // named property back off the component through its metadata dispatcher, and neither the base
    // nor the dispatcher is ported.
    //
    // So half of this case is portable and half is not, and the two halves are separated: the
    // property NAME is asserted because the component declares it; the RESOLVED representation is
    // not, because nothing resolves it.
    expect(declaresMember('getSimpleRepresentationPropertyName')).toBe(true);
    expect(new Product({ productID: 'product-1' }).getSimpleRepresentationPropertyName()).toBe(
      'productName',
    );

    expect(declaresMember('getSimpleRepresentation')).toBe(false);

    const populated = new Product({ productID: 'product-1', productName: 'Test Product' });

    expect(typeof populated.getProductName()).toBe('string');
  });

  it('has_primary_id_property_name - not portable as written; the fact is asserted instead', () => {
    // The legacy body, verbatim [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L60-L62]:
    //
    //   assert(len(variables.entity.getPrimaryIDPropertyName()));
    //
    // CFML parity [model/entity/Product.cfc:L52]: that accessor was metadata-driven dynamic
    // dispatch, synthesised by reading the `fieldtype="id"` declaration off the component's own
    // property metadata. The target has no dispatcher and no metadata scan, so no such runtime
    // string is published.
    expect(declaresMember('getPrimaryIDPropertyName')).toBe(false);
    expect(declaresMember('getPrimaryIDValue')).toBe(false);
    expect(declaresMember('getProductID')).toBe(true);

    const saved = new Product({ productID: 'product-1' });

    expect(saved.getProductID()).toBe('product-1');
    expect(cfLen(saved.getProductID())).toBeGreaterThan(0);
  });

  it('defaults_are_correct - BOTH base assertions, because Product overrides nothing', () => {
    // The legacy body, verbatim [meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67]:
    //   assert(variables.entity.isNew());
    //   assert(!len(variables.entity.getPrimaryIDValue()));
    // TWO ASSERTIONS, AND PRODUCT CARRIES BOTH. [meta/tests/unit/entity/ProductTest.cfc] does not
    // declare `defaults_are_correct`, so MXUnit dispatched the base body unchanged for Product. The
    // sibling Brand suite correctly does NOT carry these two, because
    // [meta/tests/unit/entity/BrandTest.cfc:L58-L60] REPLACES the body. CFML parity
    // [model/entity/Product.cfc:L52]: `productID` carries `unsavedvalue="" default=""`, which is
    // exactly what `HibachiEntity.getNewFlag()` [org/Hibachi/HibachiEntity.cfc:L571-L576] tests.
    // The shipped `isNew()` is that test, spelled `productID === ''`.
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
    // The legacy body, verbatim [meta/tests/unit/entity/ProductTest.cfc:L58-L62]:
    //   public void function productUrlIsCorrectlyFormatted() {
    //     variables.entity.setURLTitle("nike-air-jorden");
    //     assertEquals(
    //       "/#request.slatwallScope.setting('globalURLKeyProduct')#/nike-air-jorden/",
    //       variables.entity.getProductURL()
    //     );
    //   }
    // B2.3 - `getProductURL()` IS THE ONLY ENTITY METHOD IN THIS ENTIRE SLICE WITH LEGACY TEST
    // COVERAGE. Sixteen of the eighteen ported entities have no legacy test at all, and the two
    // that do are Brand and Product. B1.2 - THE FIXTURE IS RETAINED VERBATIM. `nike-air-jorden` is
    // the legacy string, misspelling and all ("jorden", not "jordan"), and it is not corrected,
    // normalised or parameterised away. The MXUnit argument order is not transliterated:
    // [meta/tests/unit/entity/ProductTest.cfc:L61] puts the EXPECTED value FIRST, which is a
    // harness artefact rather than a contract (C1).
    const subject = makeProductFixture({ globalURLKeyProduct: URL_KEY_UNDER_TEST });

    expect(subject.getUrlTitle()).toBe(LEGACY_URL_TITLE);

    // THE SETTING IS RESOLVED THROUGH THE PORT, NEVER HARDCODED. The legacy default is
    // `defaultValue="sp"` at [model/service/SettingService.cfc:L178] - it lives in the SETTING
    // declaration, not in this entity - so this suite drives a value that could never be that
    // default and builds the expectation from the same source the accessor reads.
    expect(subject.getProductURL()).toBe(`/${URL_KEY_UNDER_TEST}/${LEGACY_URL_TITLE}/`);

    expect(subject.getProductURL()).toBe('/catalog-key-under-test/nike-air-jorden/');
    expect(subject.getProductURL().startsWith('/')).toBe(true);
    expect(subject.getProductURL().endsWith('/')).toBe(true);

    // The write accessor exists because the ported slice calls it:
    // [model/service/ProductService.cfc:L269] is
    // `arguments.product.setURLTitle( getDataService().createUniqueURLTitle(...) )`, a write ONTO
    // the entity whose result the save-context validation then reads.
    //
    // ACRONYM CASING IS NORMALISED, NOT VERBATIM. The legacy sources spell the pair `setURLTitle` /
    // `getURLTitle` [model/service/ProductService.cfc:L268] while the property is `urlTitle`
    // [model/entity/Product.cfc:L54]; CFML method names are case-insensitive so both spellings
    // resolved to one generated accessor, and TypeScript is case-sensitive, so the port publishes
    // exactly one spelling - `setUrlTitle` / `getUrlTitle`, matching the property. Both the presence
    // and the casing are asserted so neither is left to inference.
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

// --- B2: THE URL SLASH ASYMMETRY -------------------------------------------------------------
// The two URL accessors sit FOUR LINES APART in the legacy component and differ by exactly ONE
// CHARACTER.

describe('NET-NEW: the URL pair and its deliberate slash asymmetry', () => {
  it('getProductURL leads with a slash and getListingProductURL does not', () => {
    // CFML parity [model/entity/Product.cfc:L207-L209 vs L211-L214]: getProductURL has a leading
    // slash and getListingProductURL does not. The asymmetry is deliberate in the source and must
    // not be normalised.
    //
    // Legacy bodies, verbatim:
    //   L207-L209  return "/#setting('globalURLKeyProduct')#/#getURLTitle()#/";
    //   L211-L213  return  "#setting('globalURLKeyProduct')#/#getURLTitle()#/";
    //
    // The trailing slash is present in BOTH. Only the leading one differs, because the listing
    // variant is concatenated INTO a listing page's own path, where a second leading slash would
    // produce a double separator. B2.3: `getProductURL()` is the ONE entity method in the whole
    // in-scope slice with legacy test coverage [meta/tests/unit/entity/ProductTest.cfc:L58-L62],
    // and its sibling `getListingProductURL()` has none - so the tested one anchors the untested
    // one.
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
    // NO URL SEGMENT IS EVER HARDCODED. The legacy default lives at
    // [model/service/SettingService.cfc:L178] as the `defaultValue` of the `globalURLKeyProduct`
    // text setting - NOT in the entity - and transcribing it here would move a configuration
    // decision into a test and would pass even if the accessor stopped consulting the port.
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

    // Both accessors read `globalURLKeyProduct` and NOTHING ELSE - in particular neither reaches
    // for `globalURLKeyProductType`, the adjacent setting at
    // [model/service/SettingService.cfc:L179], which belongs to ProductType.
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
    // the empty string. `urlTitle` carries `unique="true"` at [L54] but NO `notNull`, so an unset
    // title is reachable - it is `productName` that carries `notNull="true"` at [L55]. The result
    // is a doubled separator, and that is the faithful output.
    const untitled = new Product({
      productID: 'product-1',
      settingsProvider: new SettingsProviderDouble(URL_KEY_UNDER_TEST),
    });

    expect(untitled.getUrlTitle()).toBeUndefined();
    expect(untitled.getProductURL()).toBe(`/${URL_KEY_UNDER_TEST}//`);
    expect(untitled.getListingProductURL()).toBe(`${URL_KEY_UNDER_TEST}//`);
  });

  it('both accessors refuse rather than guess when the settings port was never injected', () => {
    // CFML parity [model/entity/Product.cfc:L208, L212]: in CFML `setting(...)` was reached through
    // the framework base on every entity unconditionally, so the legacy accessors could not fail
    // this way. In the target the port is an explicit constructor argument a repository owns
    // supplying, so its absence is a WIRING error and is reported as one - naming the collaborator
    // and the exact legacy locator that could not be evaluated.
    //
    // THE TWO LOCATORS DIFFER, which is the point of asserting both refusals: `getProductURL` names
    // L208 and `getListingProductURL` names L212, so a stack-free error message still says which of
    // the two near-identical accessors was called.
    const unwired = new Product({ productID: 'product-1', urlTitle: LEGACY_URL_TITLE });

    expect(() => unwired.getProductURL()).toThrow(/settings provider/);
    expect(() => unwired.getProductURL()).toThrow(/model\/entity\/Product\.cfc:L208/);

    expect(() => unwired.getListingProductURL()).toThrow(/settings provider/);
    expect(() => unwired.getListingProductURL()).toThrow(/model\/entity\/Product\.cfc:L212/);

    expect(() => unwired.getProductURL()).toThrow(/Product 'product-1'/);

    // The failure message names the STATEMENT that needs the collaborator, not the declaration:
    // the settings read is at [model/entity/Product.cfc:L208] for `getProductURL` and at [L212] for
    // `getListingProductURL`, while L207 and L211 are only the `function` lines.
    expect(() => unwired.getListingProductURL()).not.toThrow(/L211/);
    expect(() => unwired.getProductURL()).not.toThrow(/L207/);
  });
});

// --- B3: DIVERGENCE (c) - DEFECT 19 IS FIXED, AND ITS CONTROL SITS BESIDE IT -----------------
// The legacy body verbatim [model/entity/Product.cfc:L524-L532]:
//   L524  public string function getBrandName() {
//   L525    if(!structKeyExists(variables, "brandName")) {
//   L526      variables.brandName = "";                    <-- seeds the memo to empty
//   L527      if( structKeyExists(variables, "brand") ) {
//   L528        return getBrand().getBrandName();          <-- returns WITHOUT assigning
//           }
//         }
//   L531    return variables.brandName;
//   L532  }
// So the FIRST call answers with the real brand name while leaving `""` behind in the memo, and
// EVERY SUBSEQUENT CALL short-circuits at L525 - the memo key now exists - and returns the empty
// string from L531. The accessor is poisoned after one use. The control proving this is a slip
// rather than a convention sits eighty lines away: `getSalePriceDiscountType()` [L604-L612] has the
// IDENTICAL shape - outer memo guard, seed, inner association probe - and at L608 it ASSIGNS before
// falling through to the shared return.

describe('DIVERGENCE (c): getBrandName is fixed, getSalePriceDiscountType is the control', () => {
  it('B3.1 - returns AND caches, so repeated calls keep answering the real brand name', () => {
    // DELIBERATE DIVERGENCE (c) [model/entity/Product.cfc:L524-L532]: legacy L526 seeds the memo to
    // "" and L528 returns without assigning it, so the accessor is poisoned after the first call.
    // Fixed here as a documented deliberate divergence (c).
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
    // CFML parity [model/entity/Product.cfc:L526-L527]: the seed at L526 is NOT itself the defect.
    // When the brand is absent, the L527 probe fails, nothing overwrites the seed, and the shared
    // return answers `""`. That behaviour is legitimate and is preserved exactly - the fix touches
    // only the assignment the brand-present path forgot.
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
    // A2: all entity memos are request-scoped. The legacy cache is `variables.brandName` -
    // COMPONENT-level state, which on a warm Lambda container would persist between two unrelated
    // invocations if it were reproduced as module state, leaking one customer's data into another's
    // request.
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
    // identical in shape to getBrandName at L524-L532, except that L608 writes
    // `variables.salePriceDiscountType = getDefaultSku().getSalePriceDiscountType();` and falls
    // through to the shared return at L611 instead of returning past the memo. This is the CONTROL
    // that proves L524-L532 is a defect rather than a house style: two methods, eighty lines apart,
    // one assignment apart.
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
    // [model/entity/Sku.cfc:L557]. Two different stand-ins for the same absence, in two sibling components,
    // neither copied onto the other.
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
    // THE AUTHORIZED DIVERGENCES THAT BEAR ON THIS FILE:
    //   (a) the un-`var`'d `discountAmount` [model/service/PromotionService.cfc:L1007, L1009, L1014]
    //       - sibling-owned by `src/services`, because shared mutable state surviving between warm
    //       Lambda invocations could leak one customer's discount into another's order.
    //   (b) the `amountOff` raw-float gap [model/service/PromotionService.cfc:L998] - sibling-owned
    //       by `src/services`, because routing all arithmetic through `Money` is structural and
    //       preserving one branch's drift would mean deliberately bypassing the value object.
    //   (c) the entity memo bugs: DEFECT 17 [model/entity/Sku.cfc:L500-L510] and DEFECT 18
    //       [model/entity/Sku.cfc:L512-L522], owned by `sku.test.ts`, and DEFECT 19
    //       [model/entity/Product.cfc:L524-L532], owned HERE.
    //
    // What this case asserts is the observable half: the members this file preserves as defective
    // are still defective. DEFECT 20 is one of them - the discarded sale price still falls through
    // to zero [model/entity/Product.cfc:L598].
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

// --- B4: DEFECT 20 - PRESERVED. THE MISSING `return` AT L598 ---------------------------------
//
// The legacy body verbatim [model/entity/Product.cfc:L594-L601]:
//
//   L594  public any function getSalePrice() {
//   L595    if( structKeyExists(variables,"defaultSku") ) {
//   L596      return getDefaultSku().getSalePrice();
//   L597    } else if (arrayLen(getSkus())) {
//   L598      getSkus()[1].getSalePrice();          <-- NO `return`
//           }
//   L600    return 0;
//   L601  }
//
// Three branches. Branch 1 returns the default sku's sale price. Branch 2 CALLS the first sku's
// sale price and THROWS THE RESULT AWAY, then falls through to branch 3's terminal zero.

describe('DEFECT 20 (preserved): getSalePrice discards the first sku and falls through to zero', () => {
  it('B4.1 - branch 2 returns ZERO, not the sku sale price and not undefined', () => {
    // LEGACY-DEFECT [model/entity/Product.cfc:L598]: the statement getSkus()[1].getSalePrice(); has
    // no return, so execution falls through to return 0 at L600 and the sku's sale price is
    // discarded.
    //
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

    // AND NOT `undefined`. This is one half of the ABSENCE CONVENTION and the direction is
    // load-bearing: `Product.getSalePrice()` MUST return `0` and never `undefined`, because [L600]
    // declares the zero explicitly.
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
    // [L595-L596] is the only arm that returns a real number, and it is the arm the defect does not
    // touch. Asserting it is what makes the branch-2 zero meaningful: the accessor is capable of
    // answering correctly, and only branch 2 loses the value.
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
    // The terminal `return 0` at [L600] is reached by TWO paths - the fall-through from branch 2
    // and the nothing-at-all path - and both are asserted so a future edit cannot satisfy one while
    // breaking the other.
    //
    // CFML parity [model/entity/Product.cfc:L597]: `arrayLen(getSkus())` is CFML NUMERIC TRUTHINESS
    // over a length, so an empty array skips the branch. The shipped body routes that through
    // `cfTruthy` rather than relying on JavaScript coercion agreeing by coincidence.
    const empty = new Product({ productID: 'product-1' });

    expect(empty.getSkus()).toEqual([]);
    expect(empty.getSalePrice().toFixed2()).toBe('0.00');
    expect(empty.getSalePrice()).toBeInstanceOf(Money);
  });

  it('B4.3 - Sku.getSalePrice() is CORRECT, and this defect must NOT propagate to it', () => {
    const skuWithoutDetail = makeSkuFixture({ skuID: 'sku-1' });

    expect(skuWithoutDetail.getSalePrice().toFixed2()).toBe('19.99');
    expect(skuWithoutDetail.getSalePrice().equals(skuWithoutDetail.getPrice())).toBe(true);

    // THE ABSENCE CONVENTION, STATED IN BOTH DIRECTIONS, because collapsing either one is a money
    // bug:
    //   `Product.getSalePrice()` MUST answer `0` and never `undefined`, because
    //     [model/entity/Product.cfc:L600] declares the zero explicitly.
    //   `Sku.getPriceByCurrencyCode()` MUST answer `undefined` and never `0`, because
    //     [model/entity/Sku.cfc:L269-L273] has no `else` and substituting `0` would
    //     SILENTLY SELL PRODUCTS FOR FREE.
    // Same domain, same quantity, opposite conventions. Both halves are asserted here so neither
    // can be "harmonised" by a later reader.
    const productZero = new Product({ productID: 'product-1' });

    expect(productZero.getSalePrice().toFixed2()).toBe('0.00');
    expect(productZero.getSalePrice()).not.toBeUndefined();

    expect(skuWithoutDetail.getPriceByCurrencyCode('ZZZ')).toBeUndefined();
    expect(skuWithoutDetail.getPriceByCurrencyCode('ZZZ')).not.toBe(0);
  });
});

// --- B5: G1 / DEFECT 25 - `getSalePriceExpirationDateTime()` THROWS --------------------------
//
// The legacy body verbatim [model/entity/Product.cfc:L614-L622]:
//
//   L614  public date function getSalePriceExpirationDateTime() {
//   L615    if(!structKeyExists(variables, "salePriceExpirationDateTime")) {
//   L616      variables.salePriceExpirationDateTime = now();
//   L617      if( structKeyExists(variables,"defaultSku") ) {
//   L618        variables.salePriceExpirationDateTime = getDefaultSku().getSalePricExpirationDateTime();
//             }
//           }
//   L621    return variables.salePriceExpirationDateTime;
//   L622  }
//
// THE NAMING PRECISION POINT: THE DECLARATION AT L614 IS SPELLED CORRECTLY. The typo -
// `getSalePricExpirationDateTime`, missing the `e` in "Price" - is at the CALL SITE at L618, on the
// delegate.

describe('DEFECT 25 / G1 (preserved): getSalePriceExpirationDateTime cannot return', () => {
  it('B5.1 - the shipped accessor THROWS, and the throw is the faithful arm', () => {
    // LEGACY-NOTE [model/entity/Product.cfc:L618]: the declaration at L614 is spelled correctly
    // while the call at L618 invokes the misspelled `getSalePricExpirationDateTime()` on the
    // delegate. The misspelling is carried over rather than corrected, because correcting it would
    // change what the method resolves.
    //
    // STATIC-DISPATCH DIVERGENCE, NOT PRESERVED PARITY. In CFML the misspelled call entered
    // `onMissingMethod` [org/Hibachi/HibachiEntity.cfc:L507-L565] and, because
    // [model/entity/Sku.cfc:L70] declares `attributeValues`, matched the attribute fallback at
    // [org/Hibachi/HibachiEntity.cfc:L559-L561] BEFORE the terminal throw at [L565] - so what a CFML
    // runtime did next is not established here and is not asserted. The target has no dynamic
    // dispatch at all: the misspelled member does not exist on the ported `Sku`, so the call is
    // refused rather than dispatched, and THAT refusal is what is asserted below.
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
    // DEFECT PRESERVATION, NOT A SOURCE TODO: the legacy carries no TODO here. The misspelling IS
    // the defect, so it survives verbatim in the reproduction rather than being silently corrected.
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
    // THE BEHAVIOUR THAT IS GENUINELY LOST, RECORDED RATHER THAN HIDDEN. [L617] is a LAZY-LOAD
    // STATE probe in CFML with two different outcomes: unloaded, and the `now()` seed from [L616]
    // is returned; loaded, and [L618] runs and fails. Under eager materialization there is no
    // "unloaded" state, so the port always reaches the failing arm and the seeded `now()` is
    // unreachable.
    const withoutDefaultSku = new Product({ productID: 'product-1' });

    expect(withoutDefaultSku.getDefaultSku()).toBeUndefined();
    expect(() => withoutDefaultSku.getSalePriceExpirationDateTime()).toThrow(Error);

    // B5.4 / NO CLOCK IS READ ANYWHERE. The legacy seeded from `now()` at [L616]; the port reads no
    // clock at all, and `Product` is injected with none. Nothing in this suite calls a bare
    //   new Date()
    // or `Date.now()` for a business value: every instant is an explicit UTC ISO-8601 literal
    // declared at module scope.
    expect(SALE_PRICE_EXPIRATION_INSTANT.toISOString()).toBe('2024-12-31T23:59:59.000Z');
    expect(CREATED_INSTANT.toISOString()).toBe('2024-06-01T00:00:00.000Z');
    expect(MODIFIED_INSTANT.toISOString()).toBe('2024-06-15T12:30:45.000Z');
  });

  it("B5.3 - the SKU accessor is correctly spelled and returns '' on a miss: the control", () => {
    // THE TYPO MUST NOT BE IMPORTED INTO THE SKU SIDE. `Sku.getSalePriceExpirationDateTime()`
    // [model/entity/Sku.cfc:L560-L565] is spelled CORRECTLY and answers `Date | ''` - a timestamp
    // at [L562] and the empty string at [L564].
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

// --- B6: TWO MORE PRESERVED THROWS, EACH BESIDE ITS WORKING TWIN -----------------------------
// `getPageIDs()` and `getCategoryIDs()` are FOUR LINES APART and structurally identical - same
// loop, same `listAppend`, same comma-list return.

describe('PRESERVED THROWS: getPageIDs and getProductOptionsByGroup, with their twins', () => {
  it('B6.1 - getPageIDs THROWS, because getPages() is not declared on the component', () => {
    // LEGACY-NOTE [model/entity/Product.cfc:L191-L197]: `getPageIDs()` loops `arrayLen(getPages())`
    // at L193, and `getPages()` is declared nowhere and corresponds to no property - the component
    // declares `listingPages` [model/entity/Product.cfc:L79], not `pages`.
    //
    // THE FAILURE POINT, PRECISELY. The missing `getPages` did NOT reach the terminal throw:
    // `onMissingMethod` matched the attribute fallback at [org/Hibachi/HibachiEntity.cfc:L559-L561]
    // first, because `get`-prefixed names satisfy that branch once the entity declares
    // `attributeValues` [model/entity/Product.cfc:L75], and the fallback answers `''` for an unknown
    // code [model/entity/HibachiEntity.cfc:L202]. Whatever failed, failed at the LATER array use in
    // L193-L194 rather than at dispatch, and that runtime outcome is not measured here. The target
    // has no dynamic dispatch, so the member is simply absent and the call is refused.
    //
    // NO WORKING IMPLEMENTATION IS WRITTEN OVER `listingPages`, and none may be: a listing-page link
    // row is not a page, and substituting one would be inventing a feature and calling it a port.
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

    // C17 - A LOCATOR CORRECTION, RECORDED AND NOT APPLIED. The shipped message cites
    // `listingPages` at [L82]. The VERIFIED declaration is at model/entity/Product.cfc:L79: L79 is
    // `listingPages`, L80 is `categories` and L81 is `relatedProducts`, all three confirmed by
    // direct read.
    expect(() => subject.getPageIDs()).toThrow(/listingPages at \[L82\]/);
  });

  it('B6.1 - the WORKING TWIN: getCategoryIDs builds a comma list with NO leading delimiter', () => {
    // CFML parity [model/entity/Product.cfc:L199-L205]: the same loop shape as `getPageIDs`, over
    // `categories` at [L80], which the component DOES declare. This one works, and asserting it is
    // what proves the other throw is about the missing collection rather than about the loop.
    // `listAppend` IS USED RATHER THAN `Array.join`, and the difference is contractual rather than
    // cosmetic: the helper emits NO LEADING DELIMITER on an empty list.
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
    // FAILURE 1 - `getProductService()` is declared neither on `Product.cfc` nor on
    // `model/entity/HibachiEntity.cfc`, and every other outward reach in this component goes through
    // `getService("...")`. FAILURE 2 - `ProductService` declares no `getProductOptionsByGroup`
    // either, so the intended target does not exist.
    //
    // THE FAILURE POINT, PRECISELY. `getProductService` is `get`-prefixed, so `onMissingMethod`
    // matched the attribute fallback at [org/Hibachi/HibachiEntity.cfc:L559-L561] BEFORE the
    // terminal throw at [L565] and answered `''` [model/entity/HibachiEntity.cfc:L202]; the chained
    // call at L632 is what could not proceed. The target refuses the member statically instead.
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
    // CFML parity [model/entity/Product.cfc:L340-L347]: the near-twin of the broken accessor above,
    // and the one that works - it reaches `getService("optionService")` at [L341] with the
    // LOWERCASE spelling, which resolves, rather than the bare `getProductService()` at [L632],
    // which does not. IN THE PORT IT NEEDS NO PORT AT ALL. The legacy body ran a smart-list query
    // filtered by option-group id AND by this product's id [L343-L344] and ordered by
    // `sortOrder|ASC` [L345].
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

// --- B7: C2 MUST-PRESERVE: PRODUCT / SKU / OPTION RESOLUTION - THE ENTITY HALF ---------------
//
// One of the project's THREE must-preserve areas, and this suite guards its ENTITY half. The legacy
// body verbatim [model/entity/Product.cfc:L349-L364]:
//
//   L349  public any function getSkuBySelectedOptions(string selectedOptions="") {
//   L350    if(len(arguments.selectedOptions) > 0) {
//   L351      var skus = getSkusBySelectedOptions(selectedOptions=arguments.selectedOptions);
//   L352      if(arrayLen(skus) == 1) {
//   L353        return skus[1];
//   L354      } else if (arrayLen(skus) > 1) {
//   L355        throw("More than one sku is returned when the selected options are: #arguments.selectedOptions#");
//   L356      } else if (arrayLen(skus) < 1) {
//   L357        throw("No Skus are found for these selected options: #arguments.selectedOptions#");
//           }
//   L359    } else if (arrayLen(getSkus()) == 1) {
//   L360      return getSkus()[1];
//   L361    } else {
//   L362      throw("You must submit a comma seperated list of selectOptions to find an indvidual sku in this product");
//           }
//   L364  }
//
// B7.5 - THE P5 BOUNDARY. Everything below drives an INLINE REPOSITORY DOUBLE and asserts RESULTS,
// never queries. The AND-of-EXISTS option-matching SQL at [model/dao/SkuDAO.cfc:L107-L128] is
// explicitly OUT OF SCOPE for a domain suite and belongs to `tests/integration` - no SQL string
// appears anywhere in this file.

describe('C2 MUST-PRESERVE: getSkuBySelectedOptions - all five outcomes', () => {
  it('B7.1 - it is ASYNC, because its legacy body reaches the DAO through the delegate', () => {
    // CFML parity: a method is async IFF its legacy body reaches the DAO/ORM. Methods that only
    // traverse already-materialized associations or perform pure arithmetic stay synchronous.
    //
    // [L351] calls `getSkusBySelectedOptions`, which at [L367] reaches
    // `skuService.getProductSkusBySelectedOptions` and from there the AND-of-EXISTS query. So this
    // accessor genuinely crosses the persistence boundary and is async, while its sibling
    // `getSkuByID` [L162-L169] walks the materialized array and stays synchronous.
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
    // `cfLen` reproduces that rather than relying on JavaScript truthiness agreeing by coincidence.
    // AND THE REPOSITORY IS NEVER CONSULTED ON THIS PATH. A single-sku product needs no option
    // resolution at all, so [L359] answers from the materialized array and the query never runs.
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
    // CFML parity [model/entity/Product.cfc:L362]: the message carries TWO misspellings -
    // "seperated" for "separated" and "indvidual" for "individual" - and BOTH are preserved
    // verbatim because the string is OBSERVABLE THROUGH THE PUBLIC CONTRACT. Correcting a message a
    // caller may be matching on is a behaviour change dressed as a typo fix.
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
    // THE SHAPE OF THE WHOLE METHOD, STATED ONCE. Of the five outcomes, exactly TWO return a sku
    // and THREE throw. The declared return type still admits `undefined` only because [L358] closes
    // the inner chain with no `else` and the shipped body reproduces that unreachable tail rather
    // than deleting it - but no input reaches it.
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
    // CFML parity [model/entity/Product.cfc:L366-L368]: the legacy body reads
    //
    //   return getService("productService").getProductSkusBySelectedOptions(
    //     arguments.selectedOptions, this.getProductID()
    //   );
    //
    // POSITIONALLY, in that order. Argument ORDER is a real contract - two string parameters that
    // silently swap would produce a query filtered by a product id that is actually an option list,
    // and a recording double is the only way to observe it.
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
    // function has NO TRAILING RETURN, so CFML answers null on a miss. The port answers
    // `undefined`, which is the same absence. AND THIS IS THE OPPOSITE MISS CONVENTION FROM
    // `getSkuBySelectedOptions`, which throws.
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
    // two strings is case-INSENSITIVE. A `===` port answered `undefined` for a SKU the product
    // genuinely owns whenever the caller's spelling differed in case from the stored column - and
    // the identifiers are database-generated, read back through a predicate that is itself
    // case-insensitive under MySQL's default collation, so the two spellings are one key.
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

// --- B8: `getSkus()` - THE RAW, NO-COPY RETURN AND ITS FLAGGED PROJECTION --------------------
//
// The legacy body verbatim [model/entity/Product.cfc:L155-L160]:
//
//   L155  public array function getSkus(boolean sorted=false, boolean fetchOptions=false) {
//   L156    if(!arguments.sorted && !arguments.fetchOptions) {
//   L157      return variables.skus;                       <-- RAW, no defensive copy
//           }
//   L159    return getService("skuService").getProductSkus(product=this, sorted=arguments.sorted, fetchOptions=arguments.fetchOptions);
//   L160  }

describe('getSkus: the live array on the fast path, a projection on the flagged path', () => {
  it('B8.1 - UNFLAGGED it returns the UNDERLYING array by reference, with NO defensive copy', () => {
    // CFML parity [model/entity/Product.cfc:L155-L160]: [L157] returns `variables.skus` RAW. A CFML
    // array is a value type on ASSIGNMENT but this is a RETURN of the same reference the component
    // holds, and the legacy callers rely on it - `Sku.setProduct()` [model/entity/Sku.cfc:L604]
    // appends to `product.getSkus()` and expects the append to be visible on the product.
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
    // CFML parity [model/entity/Product.cfc:L155]: the legacy signature is
    //   boolean sorted=false, boolean fetchOptions=false
    // and both defaults are preserved, with the arity asserted rather than assumed so a signature
    // change is caught here. SYNCHRONOUS EVEN THOUGH [L159] REACHED THE SERVICE.
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
    // leftmost group dominates. The port computes the same weighting over the materialized graph.
    // `nextOptionGroupSortOrder` is a GLOBAL aggregate over `SwOptionGroup` and is not derivable
    // from one product's graph, so it arrives as a hydration input.
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
    // CFML parity [model/service/SkuService.cfc:L223]: the legacy guard is a three-clause test in a
    // fixed order, and the third clause probes ONLY THE FIRST element rather than the whole
    // collection. All three arms are asserted, plus the radix arm the port adds because the global
    // aggregate can be absent.
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
    // COVERING THE `no first element` ARM OF THE THREE-CLAUSE GUARD.
    // [model/service/SkuService.cfc:L223] probes `getSkus()[1].getOptions()`, which in CFML over an
    // empty array is a runtime index error. THE TARGET GUARD IS A BEHAVIOUR CHANGE, NOT PARITY: with
    // no first element it short-circuits and returns the empty projection, so a caller that would
    // have seen an exception now sees `[]`.
    const subject = new Product({ productID: 'product-1', skus: [] });

    expect(subject.getSkus(true)).toEqual([]);
    expect(subject.getSkus(true, true)).toEqual([]);

    expect(subject.getSkus(true)).not.toBe(subject.getSkus());
  });

  it('B8.2 - the weighting SKIPS an option with no sortOrder and one with no option group', () => {
    // COVERING THE `continue` ARM OF THE POSITIONAL WEIGHTING. CFML parity
    // [model/dao/SkuDAO.cfc:L172-L202]: the weight is a SUM over the option rows reached by an
    // INNER JOIN through `SwOptionGroup`. `SUM` skips a NULL product, so an option with a NULL
    // `sortOrder` contributes nothing; and the inner join drops an option with no group outright.
    // Neither term is in the SQL answer, and neither is coerced to zero and silently counted here.
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
    // C6 - A PROMPT-CLAIMED MEMBER THAT DOES NOT SHIP, RECORDED AND NOT INVENTED. `getImages()`
    // [model/entity/Product.cfc:L178-L180] returns `variables.productImages` raw, exactly as
    // `getSkus()` returns `variables.skus` raw. It is nonetheless absent from the shipped surface,
    // along with the whole `productImages` association and the image-file accessors, because the
    // image subsystem reaches `imageStore` - a STUB port whose branches are out of scope.
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

// --- B9: THE OPTION-GROUP FAMILY, WITH THE SEED-THEN-OVERWRITE AND CASING WARTS --------------
//
// The legacy body verbatim [model/entity/Product.cfc:L251-L261]:
//
//   L251  public array function getOptionGroups() {
//   L252    if( !structKeyExists(variables, "optionGroups") ) {
//   L253      variables.optionGroups = [];                              <-- the seed
//   L254      var smartList = getService("OptionService").getOptionGroupSmartList();   <-- CAPITAL O
//   L255      smartList.addSelect('optionGroupID', 'optionGroupID');  // DISTINCT
//   L256      smartList.addFilter('options.skus.product.productID', getProductID());
//   L257      smartList.addOrder('sortOrder|ASC');
//   L258      variables.optionGroups = smartList.getRecords();          <-- OVERWRITES the seed
//           }
//   L260    return variables.optionGroups;
//   L261  }

describe('the option-group family: getOptionGroups, its struct, and its count', () => {
  it('B9.1 - the SEED-THEN-OVERWRITE wart is annotated, not tidied, and is UNOBSERVABLE here', () => {
    // CFML parity [model/entity/Product.cfc:L253 vs L258]: the empty-array seed at L253 is
    // immediately discarded by the assignment at L258. Preserved as written; source warts are
    // annotated, not normalised. C9 - AND THE SHIPPED SURFACE MAKES IT UNOBSERVABLE, which is why
    // this case asserts the shipped behaviour instead of the wart.
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
    // same service THREE ways - "OptionService" at L254, "optionService" at L341, and
    // 'optionService' at L637 and L644. CFML component lookup is case-insensitive; the target
    // resolves one injected port and annotates the divergence rather than normalising the source.
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
    //
    // Two entries sharing a key is reachable because the legacy L254-L257 smart list selected
    // DISTINCT on `optionGroupID` at the QUERY level rather than in the loop - so the loop itself
    // never guarded, and a hydration that supplies a duplicate exercises the unguarded assignment
    // exactly as the legacy would have.
    const firstWithKey = buildOptionGroup('group-shared', 1, 'FIRST');
    const secondWithKey = buildOptionGroup('group-shared', 2, 'SECOND');
    const subject = new Product({
      productID: 'product-1',
      optionGroups: [firstWithKey, secondWithKey],
    });

    const struct = subject.getOptionGroupsStruct();

    expect(structKeyExists(struct, 'group-shared')).toBe(true);

    // The shipped `structKeyList` in slatwall-ts/src/lib/cfml/struct.ts returns a `string[]`, NOT
    // the comma-delimited list CFML's same-named function returns, so
    // `Product.buildExistingOptionGroupIDList` folds that array through `listAppend` to BUILD the
    // comma list rather than receiving one.
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
      // CFML parity [model/entity/Product.cfc:L241-L249]: a CFML struct has no
      // prototype chain and no reserved keys, so `variables.optionGroupsStruct[
      // '__proto__' ]` was an ordinary key. `SwOptionGroup.optionGroupID` is a
      // persisted `varchar(32)` column, so every one of these strings FITS and the
      // key is externally sourced, not generated in this file.
      //
      // A plain `accumulator[id] = optionGroup` would have hit `Object.prototype`'s
      // legacy `__proto__` SETTER: the entry would be silently DISCARDED - so
      // `structKeyList` would come back EMPTY and `buildExistingOptionGroupIDList`
      // would report "this product has no option groups" - while the accumulator's
      // own prototype was replaced by the OptionGroup instance. Net-new coverage;
      // no `meta/tests/**` file exercises a reserved key.
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
    // B10 [model/entity/Product.cfc:L644]: the comma list handed to the option port is
    // folded out of `structKeyList(getOptionGroupsStruct())`, so it is the DOWNSTREAM
    // observable of the discarded write. With the `__proto__` entry missing, the list
    // would name only `group-2` and `getUnusedProductOptionGroups` would offer the
    // operator an option group this product already carries.
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
    // option group at [L343] AND on this product's own id at [L344], then ordered `sortOrder|ASC`
    // at [L345]. The product filter is reproduced STRUCTURALLY rather than as a predicate: the port
    // walks only THIS product's own skus, so an option reachable from another product cannot
    // appear.
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
    // C15 - VERIFIED AGAINST THE SHIPPED COMPARATOR, NOT ASSUMED. `SwOption.sortOrder` is NULLable,
    // and the shipped comparator places an absent order BEFORE a present one.
    //
    // An option with no option group is skipped entirely, because the legacy filter at [L343] was
    // an INNER JOIN through the group and could not have returned it.
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
    // COVERING THE COMPARATOR EXHAUSTIVELY RATHER THAN THE ONE ARM THAT HAPPENED TO RUN. The
    // shipped comparator at the tail of `getOptionsByOptionGroup` has FOUR arms, and the sibling
    // test above reaches only the `left is absent` arm - V8 sorts a short array with binary
    // insertion, comparing the LATER element against the earlier one, so the absent order always
    // arrived as the RIGHT operand there. Feeding the pair in the opposite input order reaches the
    // `right is absent` arm, and a pair with two absent orders reaches the `equal` arm. CFML parity
    // [model/entity/Product.cfc:L345]: `addOrder("sortOrder|ASC")` over a NULLable
    // `SwOption.sortOrder`. MySQL places NULL FIRST on an ascending order, so the port must be
    // NULL-first regardless of which side of a comparison the NULL lands on.
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

// --- B10: THE `unusedProduct*` TRIO - ALL THREE ASYNC AND MEMOIZED ---------------------------
//
// The legacy bodies verbatim [model/entity/Product.cfc:L635-L654]:
//
//   L635  public array function getUnusedProductOptions() {
//   L636    if( !structKeyExists(variables, "unusedProductOptions") ) {
//   L637      variables.unusedProductOptions = getService('optionService').getUnusedProductOptions( getProductID(), structKeyList(getOptionGroupsStruct()) );
//           }
//   L639    return variables.unusedProductOptions;
//         }
//   L642  public array function getUnusedProductOptionGroups() {
//   L643    if( !structKeyExists(variables, "unusedProductOptionGroups") ) {
//   L644      variables.unusedProductOptionGroups = getService('optionService').getUnusedProductOptionGroups( structKeyList(getOptionGroupsStruct()) );
//           }
//   L646    return variables.unusedProductOptionGroups;
//         }
//   L649  public array function getUnusedProductSubscriptionTerms() {
//   L650    if( !structKeyExists(variables, "unusedProductSubscriptionTerms") ) {
//   L651      variables.unusedProductSubscriptionTerms = getService('subscriptionService').getUnusedProductSubscriptionTerms( getProductID() );
//           }
//   L653    return variables.unusedProductSubscriptionTerms;
//         }
//
// B10.5 - ALL THREE ARE THE DECLARATIVE TARGETS OF `model/validation/Product.json`'s
// `minCollection: 1` GATES, one per process context. That is why none may be omitted and why none
// may answer an empty array on a failed reach: an empty array would fail the very rule that reads
// through it, for the wrong reason.

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
    // CFML parity [model/entity/Product.cfc:L644]: ONE argument - the comma list only, with no
    // product id. The asymmetry with [L637] is real, it matches
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
    // C12 - IT REJECTS RATHER THAN RESOLVING. `subscriptionTermProvider` is a STUB port declaring
    // only `getSubscriptionTerm` and `getSubscriptionBenefit`; the legacy target
    // `getUnusedProductSubscriptionTerms(productID)` is deliberately NOT among its members, so
    // there is nothing to delegate to.
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

// --- B11: THE SIX GUARDED DEFAULT-SKU DELEGATIONS - EVERY ONE CAN BE `undefined` -------------
//
// Verified verbatim: NONE of the six has an `else`, and NONE has a trailing `return`.
//
//   getCurrencyCode()        [L555-L559]  one guard  - defaultSku
//   getPrice()               [L561-L568]  TWO        - a `variables.price` shadow
//                                                      at L562, THEN defaultSku at L565
//   getRenewalPrice()        [L570-L574]  one guard
//   getListPrice()           [L576-L580]  one guard
//   getLivePrice()           [L582-L586]  one guard
//   getCurrentAccountPrice() [L588-L592]  one guard

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
    // CFML parity [model/entity/Product.cfc:L561-L568]: the ONLY member of the six with two guards.
    // [L562] probes a `variables.price` shadow and [L563] returns it; only when that fails does
    // [L565] probe the default sku and [L566] delegate.
    //
    // AND THE SHADOW WINS WITHOUT THE SKU BEING CONSULTED AT ALL - asserted with a spy, because a
    // port that checked both and preferred the shadow would pass a value-only assertion while
    // behaving differently for a sku whose price accessor has side effects or throws.
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
    // `price` IS declared [model/entity/Product.cfc:L118] - `persistent="false"` with
    // `hb_formatType="currency"`, inside the "Non-Persistent Properties - Delegated to default sku"
    // block opened at [L115] - but it is not a persistent column and appears nowhere in the
    // [L52-L59] persistent block.
    //
    // THAT IS WHY THE TWO-GUARD SHAPE EXISTS: a non-persistent property can be populated in memory
    // by a form or a process object without ever being a column, so the accessor prefers it when
    // present and falls through when not. The hydration surface accepts `price` because the legacy
    // property exists; no column is added and the `Sw*` schema is untouched.
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
    // A RUNTIME-VERIFIED TRAP, RECORDED SO IT IS NOT RE-DISCOVERED: `Money.toDecimalString()` DROPS
    // TRAILING ZEROS, so `'100.00'` comes back as `'100'`.
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
    // because [model/entity/Sku.cfc] declares the column `default="0"` - so a present default sku
    // ALWAYS yields a price. The only way any of the six answers nothing is the guard itself
    // failing.
    const sku = makeSkuFixture({ skuID: 'sku-1' });

    expect(sku.getPrice()).toBeInstanceOf(Money);
    expect(sku.getListPrice()).toBeInstanceOf(Money);
    expect(sku.getRenewalPrice()).toBeInstanceOf(Money);

    const withSku = new Product({ productID: 'product-1', defaultSku: sku });

    expect(withSku.getPrice()).toBeInstanceOf(Money);
    expect(new Product({ productID: 'product-2' }).getPrice()).toBeUndefined();
  });

  it('★ setDefaultSku is published, accepts the null-out, and moves all six delegations with it', () => {
    // `setDefaultSku(...)` is published because two ported callers write it; an entity that
    // answered the association but could never be told to change it would leave both writes with
    // nowhere to land:
    //
    //   [model/service/SkuService.cfc:L101-L103]  if(isNull(arguments.product.getDefaultSku())) {
    //                                               arguments.product.setDefaultSku(newSku);
    //                                             }
    //   [model/service/ProductService.cfc:L323]   arguments.product.setDefaultSku(javaCast("null",""));
    //
    // The first is `createSkus` designating the first SKU it created; the second is `deleteProduct`
    // nulling the FK before delegating to the framework delete. Both are ORM-implicit members the
    // ported slice concretely calls, which is what sanctions generating them.
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

    // ⚠ AND NO FAR SIDE IS TOUCHED. `defaultSku` [model/entity/Product.cfc:L70] is a
    // plain many-to-one with no inverse collection on the SKU - `Sku.getDefaultFlag()`
    // answers by asking its product rather than by holding a flag - so unlike
    // `setBrand`, this setter has nothing to append to. Detaching the reference is NOT
    // a delete either: `cascade="delete"` on the mapping is the adapter's concern, and
    // the sku instance is untouched by the null-out.
    //
    // The sharpest form of that: the sku's OWN `product` reference never became this
    // subject, in either direction. `setDefaultSku` wired no far side on the way in, so
    // it had none to unwire on the way out. Contrast `setBrand`, which DOES push onto
    // `Brand.getProducts()` because there the inverse collection exists.
    expect(sku.getSkuID()).toBe('sku-1');
    expect(sku.getProduct()).not.toBe(subject);
    expect(subject.getSkus()).toHaveLength(0);
  });
});

// --- B12: THE SALE-PRICE-DETAILS SEAM --------------------------------------------------------
//
// The legacy bodies verbatim [model/entity/Product.cfc:L182-L187, L517-L522]:
//
//   L182  public struct function getSkuSalePriceDetails( required any skuID ) {
//   L183    if(structKeyExists(getSalePriceDetailsForSkus(), arguments.skuID)) {
//   L184      return getSalePriceDetailsForSkus()[ arguments.skuID ];
//           }
//   L186    return {};
//         }
//   L517  public struct function getSalePriceDetailsForSkus() {
//   L518    if(!structKeyExists(variables, "salePriceDetailsForSkus")) {
//   L519      variables.salePriceDetailsForSkus = getService("promotionService").getSalePriceDetailsForProductSkus(productID=getProductID());
//           }
//   L521    return variables.salePriceDetailsForSkus;
//         }

describe('the sale-price-details seam between Product and Sku', () => {
  it('B12.1 / C7 - getSalePriceDetailsForSkus SHIPS, under the branch-(a) decision', () => {
    // C7 - THE DECISION PROCEDURE, AND WHICH ARM OF IT THE SHIPPED CODE TAKES. The T2 mapping
    // replaces the [model/entity/Product.cfc:L519] `getService("promotionService")` locator with an
    // injected sale-price resolver, and the governing plan makes the choice conditional: branch (a)
    // if the promotion port exposes a member that can serve `getSalePriceDetailsForProductSkus`,
    // branch (b) - omit - if it does not.
    //
    // IT DOES. `src/domain/ports/promotionRepository.ts` exports a SECOND interface,
    // `SalePriceResolver`, carrying exactly one method,
    //   getSalePriceDetailsForProductSkus(productID: string): Promise<Record<string, SalePriceDetail>>
    // co-located in that file rather than given its own module because the port count is locked at
    // thirteen. So branch (a) is the live arm, and this member ships.
    //
    // THE ROUNDING-RULE OBJECTION IS ANSWERED BY WHERE THE RESOLVER IS SATISFIED, NOT BY OMISSION.
    // `getSalePriceDetailsForProductSkus` [model/service/PromotionService.cfc:L1022] does reduce the
    // raw six-branch UNION [model/dao/PromotionDAO.cfc:L298] AND apply the rounding rule at
    // [model/service/PromotionService.cfc:L1024-L1028], and an entity genuinely cannot perform that
    // step - `roundingRuleService` lives under `src/services`, outside the domain layer's legal
    // import surface. But `SalePriceResolver` has no adapter file anywhere in the locked layout: it
    // is satisfied in `src/handlers/bootstrap.ts` by adapting the ported
    // `src/services/promotionService.ts` surface, and it is injected into `Product` FROM THERE. The
    // composition root performs the reduction and the rounding; the domain imports the TYPE only, so
    // no layer boundary is crossed, no fourteenth port exists, and no port member was invented.
    expect(declaresMember('getSalePriceDetailsForSkus')).toBe(true);

    // Its ONE in-scope consumer IS shipped, and it reads through the accessor above.
    expect(declaresMember('getSkuSalePriceDetails')).toBe(true);
  });

  it('B12.1 - a pre-materialized map is read per instance, with no port reached', async () => {
    // BRANCH (a) IS ADDITIVE, NOT A REPLACEMENT. The resolver is an OPTIONAL collaborator, so a
    // product hydrated with the detail map already in hand answers from it and reaches nothing -
    // exactly as it did before the collaborator existed. This is the [L518] memo arriving
    // pre-seeded rather than being filled on first read.
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
    // THE MEMO IS THE POINT OF THE LEGACY BODY, so it is asserted as a call count rather than as a
    // returned value. [model/entity/Product.cfc:L518] guards the reach with
    // `!structKeyExists(variables, "salePriceDetailsForSkus")`, so the resolver is consulted on the
    // FIRST read and never again for the life of the instance. Variant TWO of the three-way
    // seed/guard pattern is NOT what this is: there is no dead seed here, the guard is the whole
    // mechanism, and the memo is instance-scoped because instances are request-scoped.
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

    // ONE reach, and the SAME struct object handed back both times.
    expect(productIDsAsked).toEqual(['product-resolver']);
    expect(second).toBe(first);

    // The keyed consumer routes through the same memo, so it adds no second reach. The argument the
    // resolver receives is `getProductID()` [L519], not a SKU key.
    expect(await subject.getSkuSalePriceDetails('sku-resolved')).toBe(detail);
    expect(await subject.getSkuSalePriceDetails('sku-absent')).toBeUndefined();
    expect(productIDsAsked).toEqual(['product-resolver']);
  });

  it('B12.1 - with NEITHER a map NOR a resolver, the accessor REFUSES and names [L519]', async () => {
    // The established refusal convention for an unwired collaborator, applied here too: the entity
    // does not invent an empty struct, it names the locator it cannot evaluate. Repositories own
    // hydration - `src/repositories/mysql/mysqlProductRepository.ts` forwards the resolver into every
    // product it builds, and `src/handlers/bootstrap.ts` is where that resolver is satisfied.
    const bare = new Product({ productID: 'product-unwired' });

    await expect(bare.getSalePriceDetailsForSkus()).rejects.toThrow(/L519/);
    await expect(bare.getSalePriceDetailsForSkus()).rejects.toThrow(/product-unwired/);

    // ITS CONSUMER STILL ANSWERS ABSENCE RATHER THAN RAISING, which is the [L186] `return {}` arm
    // surviving intact: a caller probing for a sale price on a product that has none must not be
    // handed an exception where the legacy handed it an empty struct.
    await expect(bare.getSkuSalePriceDetails('sku-1')).resolves.toBeUndefined();
  });

  it('B12.2 - a miss answers `undefined`, which is the faithful port of the legacy `{}`', async () => {
    // CFML parity [model/entity/Product.cfc:L186]: the legacy returns the EMPTY STRUCT on a miss.
    // `undefined` is substituted, and the substitution is SAFE rather than convenient: every legacy
    // reader tests for its key before reading it - [model/entity/Sku.cfc:L547] and [L554] both
    // guard with `structKeyExists` - so an empty struct and an absent one are INDISTINGUISHABLE to
    // every caller. AND IT IS A COMPILE-HARD CONTRACT, NOT A STYLE CHOICE.
    // `src/domain/entities/sku.ts` declares
    //   SkuSalePriceDetails = Awaited<ReturnType<Product['getSkuSalePriceDetails']>>
    // and assigns an OPTIONAL field to a return of that type, so the type MUST admit `undefined`.
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
    // `structGet`. Nothing in the slice varies the case of a UUID key today, but the assumption is
    // not this suite's to make - and asserting it is what keeps a future `Record`-style rewrite
    // from passing.
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
    // LEGACY-NOTE [model/entity/Product.cfc:L182]: the legacy declares `required any skuID`, NOT
    // `required string skuID`. It is a primary key and every call site passes a string -
    // [model/entity/Sku.cfc:L541] passes `getSkuID()` - so `string` here is a NARROWING of `any`,
    // strictly more precise than the source and never less.
    //
    // The arity is asserted so a later edit cannot quietly default the parameter and turn a
    // programming error into a silent absence.
    expect(arityOf('getSkuSalePriceDetails')).toBe(1);
  });

  it('B12.3 - the ROUND TRIP: Sku.getSalePriceDetails reaches back into this product', async () => {
    // THE DIRECTION OF THE SEAM, ASSERTED IN BOTH HALVES. [model/entity/Sku.cfc:L539-L544] calls
    // `getProduct().getSkuSalePriceDetails(getSkuID())` at [L541] - the SKU asks the PRODUCT, not
    // the other way round. In the port that reach is pre-materialized on both sides at the
    // repository boundary, so the relationship survives as data rather than as a call, and the two
    // sides must agree.
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
    // CFML parity [model/entity/Product.cfc:L493-L495]: an UNGUARDED pure delegation,
    //   return getProductType().getBaseProductType();
    // with no `structKeyExists` probe, so a product with no product type raises and the refusal
    // names that locator rather than inventing an absence. C1: it is ASYNC, because
    // `ProductType.getBaseProductType()` [model/entity/ProductType.cfc:L110-L115] answers its own
    // `systemCode` when it has one and otherwise loads the ROOT of `productTypeIDPath` via
    // `listFirst` at [L112] - element ONE, the root, not the second.
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
    // THE FLAG IS PER-PRODUCT, SO NO DEFECT MARKER BELONGS HERE.
    // [model/entity/Product.cfc:L626] passes `productID=this.getProductID()`;
    // [model/service/SkuService.cfc:L285-L287] declares no parameters but forwards
    // `argumentCollection=arguments`, passing the whole scope through; and
    // [model/dao/SkuDAO.cfc:L53-L55] declares both `productID` and `skuID` and branches on them at
    // [L59-L63] - `ss.skuID = :skuID` when a skuID is supplied, otherwise
    // `ss.product.productID = :productID`. The identifier reaches the query.
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
    // A2: all entity memos are request-scoped, and here the leak would be a DELETE-AUTHORISATION
    // bug - `transactionExistsFlag` gates the `delete` context in `model/validation/Product.json`
    // via `eq: false`, so a shared memo could report "no transactions" for a product that has them
    // and authorise a delete that must be refused.
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
    // C4 - A PROMPT-CLAIMED MEMBER THAT DOES NOT SHIP. [model/entity/Product.cfc:L551-L553]
    // declares `returntype="numeric"` while returning the BOOLEAN setting `skuAllowBackorderFlag` -
    // a genuine legacy type mismatch. It is nonetheless omitted, because `skuAllowBackorderFlag`
    // [model/service/SettingService.cfc:L219] is NOT among the seven keys `settingsProvider`
    // publishes and is named there as explicitly excluded, so widening the contract would put an
    // eighth key on a port the checkpoint fixes at seven.
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
    // C3 - A PROMPT-CLAIMED MEMBER THAT DOES NOT SHIP, for ONE reason.
    // ★★★ QUOTE-THEN-REVISE - `getTitle` NOW SHIPS, AND THE ARGUMENT AGAINST IT WAS ONE STEP TOO
    // SHORT. It read: "That setting IS among the keys `settingsProvider` publishes
    // [model/service/SettingService.cfc:L193] and this entity holds the provider that resolves it, so
    // the setting is not the obstacle. What is missing is the RENDERER: [L542] hands the template to
    // `getService("hibachiUtilityService").replaceStringTemplate(...)`, a framework utility under
    // `org/Hibachi/` that this migration never ports, so the `${...}` markers have nothing to resolve
    // them."
    //
    // Every factual clause there is true. The conclusion does not follow, because AAP 0.2.2 says the
    // framework is not PORTED while AAP 0.5.3 says its responsibilities are REDISTRIBUTED EXPLICITLY -
    // and `replaceStringTemplate` [org/Hibachi/HibachiUtilityService.cfc:L70-L100] has exactly ONE
    // in-scope consumer, this method. So the renderer's behaviour is reproduced AT that consumer
    // instead of resurrecting a framework utility module the plan's layout does not contain.
    //
    // Code review recorded what the omission cost: `saveProduct` substituted
    // `getCalculatedTitle()` at [model/service/ProductService.cfc:L269], an ORM-maintained snapshot
    // that a NEW product does not have and a STALE one has out of date - so slug generation received
    // an empty or obsolete candidate.
    expect(declaresMember('getTitle')).toBe(true);

    expect(declaresMember('getCalculatedTitle')).toBe(true);

    const subject = new Product({ productID: 'product-1', calculatedTitle: 'Test Brand Product' });

    expect(subject.getCalculatedTitle()).toBe('Test Brand Product');
    expect(new Product({ productID: 'product-2' }).getCalculatedTitle()).toBeUndefined();
  });

  it('B13.5 / C5 - getBrandOptions is OMITTED, and the deliberate non-port is documented', () => {
    // C5 - AND THE LEGACY BODY IS UNSAFE AS WRITTEN. [model/entity/Product.cfc:L534-L538] mutates
    // `options[1].name` UNGUARDED at [L536], so it raises on an empty option list, and it reaches
    // `rbKey(...)` for the `define.none` resource-bundle label. JavaRB is not ported, so
    // resource-bundle identifiers survive only as inert string constants:
    // `hb_optionsNullRBKey="define.none"` at [model/entity/Product.cfc:L68] IS preserved on the
    // legacy metadata so the admin can still resolve the label, which is the whole obligation
    // without an i18n runtime.
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
    // does NOT filter by the codes it carries - it TESTS for `astProductCustomization` or
    // `astOrderItem` and, when either is present, ADDS the fixed `astOrderItem` filter. The base
    // `astProduct` filter always applies. This is the one ported route into the attribute
    // subsystem; the `attributeValues` EAV READ path is deliberately not ported, so this accessor
    // and nothing else crosses that boundary.
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
    // C4 INTERFACE PARITY. [model/entity/Product.cfc:L76] declares `singlularname="productReview"`,
    // spelled "singlular" with an extra `l`, on the `productReviews` one-to-many. It is an ORM
    // METADATA ATTRIBUTE, so it named the generated `addProductReview` / `removeProductReview`
    // helpers, which makes it a DATA CONTRACT rather than an internal identifier; it is preserved
    // with a comment rather than renamed.
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
    // the link table `SwRelatedProduct`, Product -> Product. Self-referential associations are
    // where a naive traversal loops, so the graph built here is deliberately shallow: A relates to
    // B, and B relates to nothing. No `addRelatedProduct` / `removeRelatedProduct` pair is asserted
    // or created - the shipped surface publishes the read accessor only.
    const related = new Product({ productID: 'product-related' });
    const subject = new Product({ productID: 'product-1', relatedProducts: [related] });

    expect(productIDsOf(subject.getRelatedProducts())).toEqual(['product-related']);
    expect(related.getRelatedProducts()).toEqual([]);

    expect(subject.getRelatedProducts()[0]?.getRelatedProducts()).toEqual([]);

    expect(new Product({ productID: 'product-2' }).getRelatedProducts()).toEqual([]);
  });

  it('B13.10 - the lazy-load probes are `!== undefined`, and no postfix `!` silences one', () => {
    // ELEVEN LAZY-LOAD PROBES are ported as `!== undefined` comparisons, each annotated at its site
    // in the shipped module: TEN far-side members plus `isNew()`. Never a postfix `!` to silence
    // one - every optional value here is narrowed by a real test or read through `?.`. The
    // observable half of the probe contract: each probed association answers absence rather than
    // throwing, and answers a value when materialized. An unsaved product carries an EMPTY
    // `productID` [model/entity/Product.cfc:L52, `unsavedvalue="" default=""`], so a product with a
    // real key is NOT new even when every association is absent.
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
    // The same absence discipline applied to the plain columns. `activeFlag` has NO default at
    // [model/entity/Product.cfc:L53] while `publishedFlag` declares `default="false"` at [L58] - a
    // real asymmetry in the source - and the port routes both through `cfBoolean`.
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

// --- the declarative validation schema `model/validation/Product.json` -------------------------
//
// Transcribed in file order and frozen; what the assertions turn on is the ELEVEN property entries.

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

    // `baseProductType` is the only property carrying TWO rules, and they disagree deliberately:
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
    // [model/entity/Product.cfc:L49], plus `save` and `delete`. That attribute is UNIQUE TO THIS
    // ENTITY in the slice and is preserved as an inert metadata constant.
    expect(ProductLegacyMetadata.processContexts).toBe(
      'updateSkus,addOptionGroup,addOption,addSubscriptionTerm',
    );
  });

  it('B14.2 - `price` is required+numeric with NO minValue, so a NEGATIVE price is VALID on Product', () => {
    // CFML parity [model/validation/Product.json]: `price` is required+numeric with NO minValue,
    // while `Sku.price` carries minValue 0 in [model/validation/Sku.json]. Do not add a floor the
    // legacy schema lacks. Verified by direct read: `model/validation/Sku.json:L9` reads
    // `{"contexts":"save","required":true,"dataType":"numeric","minValue":0}` while
    // `model/validation/Product.json` reads
    // `{"contexts":"save","required":true,"dataType":"numeric"}` and stops there.
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
    // ONE SHARED CONSTANT, DECLARED EXACTLY ONCE. The pattern `^[a-zA-Z0-9-_.|:~^]+$` is IDENTICAL
    // in `Product.json`'s `productCode`, `Option.json`'s `optionCode` and `OptionGroup.json`'s
    // `optionGroupCode`, and is modelled as a single exported constant on `optionGroup.ts`.
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
    // CFML parity [model/validation/Product.json]: the physicalCounts delete gate is ORPHANED -
    // Product declares "physicals" (SwPhysicalProduct) at [model/entity/Product.cfc:L90], and
    // physicalCounts exists as a property only at [model/entity/Physical.cfc:L59]. Documented as
    // a dead declaration; not a defect, not a divergence. WHY IT WENT UNNOTICED FOR THE WHOLE LIFE
    // OF THE CODEBASE: FIVE schemas carry the gate - Brand.json, Location.json, Product.json,
    // ProductType.json and Sku.json - and FOUR of the entities behind them declare
    // `attributeValues`: Brand.cfc:L60, Product.cfc:L75, Sku.cfc:L70 and ProductType.cfc:L67, all
    // verified by direct read. Those four are EXACTLY the four silent-unknown-getter entities, so
    // an unknown `getPhysicalCounts()` routed SILENTLY to `getAttributeValue('physicalCounts')` ->
    // `''` via [org/Hibachi/HibachiEntity.cfc:L559-L561] instead of throwing at [L565].
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
    // A STRUCTURAL FINDING, LOAD-BEARING FOR B15.3. Six of the eleven rules key on a GETTER rather
    // than on a persisted column:
    //
    //   baseProductType                 [L103 non-persistent, resolved at L493]
    //   price                           non-persistent shadow at L118, resolved at L561
    //   transactionExistsFlag           [L110 non-persistent, resolved at L624]
    //   unusedProductOptions            [L111 non-persistent, resolved at L635]
    //   unusedProductOptionGroups       [L112 non-persistent, resolved at L642]
    //   unusedProductSubscriptionTerms  [L113 non-persistent, resolved at L649]
    //
    // CFML parity: the same getter-keyed pattern as `PriceGroupRate.json`'s orphaned
    // `conditions.isNotGlobal`, which keys on `getGlobalFlag`. Validating through an accessor is a
    // legitimate Hibachi idiom, not an error - but it means a rule can fail for a WIRING reason
    // rather than a DATA one, which the three refusing accessors here demonstrate.
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
    // DO NOT COMPLETE LEGACY VALIDATION GAPS. There is NO `activeFlag` rule, NO `publishedFlag`
    // rule, NO `sortOrder` rule, NO `skus` gate and NO `productReviews` gate - every one a
    // plausible rule a well-meaning author would add.
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

// --- B15: the four routed `IssuesTest` cases -------------------------------
//
// `meta/tests/unit/IssuesTest.cfc` is 209 lines; the component opens at L49. FOUR of its six cases
// route to this file, and the other two are sibling-owned:
//   issue_1335 [meta/tests/unit/IssuesTest.cfc:L110-L124] -> `skuCurrency.test.ts`
//   issue_1348 [meta/tests/unit/IssuesTest.cfc:L126-L138] -> `sku.test.ts`
// THREE OF THE FOUR ARE WEAK LEGACY TESTS - one has ZERO assertions, one is conditional with no
// assertion, and one has neither an assertion nor even a validate call. They are STRENGTHENED into
// meaningful target assertions, each carrying a comment naming BOTH its lineage AND its original
// weakness; copying a weak test across and presenting it as coverage would be worse than not
// carrying it at all. And `meta/tests/functional/admin/entity/ProductTest.cfc` is an EMPTY
// component body - 53 lines, opening at L49 and closing at L53 with nothing between - so it
// contributes ZERO coverage, is acknowledged rather than counted, and must NOT produce a functional
// suite here.

describe('ROUTED LEGACY CASES: the four IssuesTest cases that belong to Product', () => {
  it('issue_1097 - a populated Product round-trips its fields with no ORM, database or flush', () => {
    // ROUTED LEGACY CASE [meta/tests/unit/IssuesTest.cfc:L51-L71]. ORIGINAL WEAKNESS: ZERO
    // ASSERTIONS. The legacy body is `entityNew` -> `populate` -> `entitySave` -> `ormFlush` ->
    // `entityDelete` -> `ormFlush` and then simply ends, so it could only ever have failed by
    // THROWING - a real but very weak signal that needed a live ORM, a database and two flushes to
    // produce. THE LEGACY SEED UUID IS PRESERVED VERBATIM: `444df2f7ea9c87e60051f3cd87b435a1`
    // appears at [meta/tests/unit/IssuesTest.cfc:L58] and again at
    // [meta/tests/unit/Helper.cfc:L53], so it is the codebase's own merchandise
    // product-type identifier and is retained rather than replaced with an arbitrary id.
    //
    // ⚠️ THE HARNESS'S OWN BUG IS DELIBERATELY NOT REPRODUCED. `productData = {` at
    // [meta/tests/unit/IssuesTest.cfc:L55] - NOT L51, which is the function
    // declaration - is declared WITHOUT `var`, so it leaked into the component scope.
    // That is HARNESS HYGIENE, not one of the thirty preserved defects, and reproducing
    // it would mean introducing shared mutable state into a test file whose whole
    // discipline is per-test isolation (A2). Its non-reproduction is stated here rather
    // than left silent.
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
    // ROUTED LEGACY CASE [meta/tests/unit/IssuesTest.cfc:L101-L108]. THIS ONE HAS A REAL ASSERTION,
    // `assertFalse(product.isProcessable('addOptionGroup'))` at
    // [meta/tests/unit/IssuesTest.cfc:L107], so it is the strongest of the four. But it depends on
    // Hibachi `isProcessable()` machinery that is not ported: the method read `hb_processContexts`
    // off the component metadata and then evaluated the context's validation rules through
    // `HibachiValidationService`, and neither is in scope. THE PORTABLE CORE:
    // `model/validation/Product.json` gates the `addOptionGroup` context on
    //   baseProductType inList "merchandise"
    // plus a `minCollection` of 1 on `unusedProductOptionGroups`, and the product type the legacy
    // case selects at [meta/tests/unit/IssuesTest.cfc:L105] is NON-MERCHANDISE:
    //   444df313ec53a08c32d8ae434af5819a
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
    // ROUTED LEGACY CASE [meta/tests/unit/IssuesTest.cfc:L192-L201]. ORIGINAL WEAKNESS:
    // CONDITIONAL, WITH NO ASSERTION. The legacy body reads
    //   var product = request.slatwallScope.newEntity("Product");
    //   product.validate( context="save" );
    //   if(!product.hasErrors()){ request.slatwallScope.saveEntity( product ); }
    // so if validation FAILED the body did nothing at all, and if it PASSED the body saved and
    // still asserted nothing. Either outcome was a pass. The ticket is clearly about a bare product
    // NOT being savable, but the test never says so.
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

    // ★ THE ENTITY STILL CANNOT VALIDATE ITSELF, which is what made the legacy case unassertable
    // here: `validate` is absent, so "a bare product fails the save context" is a claim only
    // `src/services/productService.ts` can make - and it does, in its own suite. The entity carries the
    // VERDICT (`hasErrors`) and does not reach it, and a bare product has not been told anything yet.
    expect(declaresMember('validate')).toBe(false);

    // ★ `hasErrors` SHIPS - see the LEGACY-EXTENDED case for the full record. What matters here is
    // unchanged: the entity does not COMPUTE the five unmet requirements, it only carries whatever a
    // service recorded, and a bare product has recorded nothing.
    expect(declaresMember('hasErrors')).toBe(true);
    expect(bare.hasErrors()).toBe(false);
  });

  it('issue_1690_2 - constructing a bare Product and reading its state does not throw', () => {
    // ROUTED LEGACY CASE [meta/tests/unit/IssuesTest.cfc:L203-L206].
    //
    // ORIGINAL WEAKNESS: NO ASSERTION, AND NO VALIDATE CALL EITHER. The whole legacy body is
    //
    //   var product = request.slatwallScope.newEntity("Product");
    //   request.slatwallScope.saveEntity( product );
    //
    // It is the `_2` companion to `issue_1690`, differing only in that it skips validation and
    // saves unconditionally, so it could fail only by throwing.
    //
    // THE PORTABLE CORE, AND DELIBERATELY NOTHING MORE: constructing a bare `Product` and reading
    // its validation-relevant state DOES NOT THROW. That is exactly what the legacy body could have
    // detected, and inflating it into a claim about save behaviour would be fabricating coverage -
    // `saveEntity` is a framework member that is not ported.
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
    // THE ROUTING LEDGER, ASSERTED SO THE BOUNDARY IS EXECUTABLE RATHER THAN MERELY STATED. Six
    // `IssuesTest` cases touch this slice; four are routed here and two are sibling-owned:
    //
    //   issue_1097    [L51-L71]    -> THIS FILE
    //   issue_1331    [L101-L108]  -> THIS FILE
    //   issue_1335    [L110-L124]  -> `skuCurrency.test.ts`  (NOT here)
    //   issue_1348    [L126-L138]  -> `sku.test.ts`          (NOT here)
    //   issue_1690    [L192-L201]  -> THIS FILE
    //   issue_1690_2  [L203-L206]  -> THIS FILE
    //
    // The naming convention `issue_<ticket#>` is carried over from `IssuesTest.cfc`, with `_2` as
    // the second-case suffix, so a reviewer can grep either file for a ticket number.
    const routedHere = ['issue_1097', 'issue_1331', 'issue_1690', 'issue_1690_2'];
    const siblingOwned = ['issue_1335', 'issue_1348'];

    expect(routedHere).toHaveLength(4);
    expect(siblingOwned).toHaveLength(2);
    expect(routedHere.concat(siblingOwned)).toHaveLength(6);

    // AND THE EMPTY FUNCTIONAL STUB CONTRIBUTES ZERO COVERAGE.
    // `meta/tests/functional/admin/entity/ProductTest.cfc` is 53 lines with an EMPTY component
    // body: L49 opens it, L53 closes it, nothing between.
    const handBuilt = new Product({
      productID: 'product-1',
      settingsProvider: new SettingsProviderDouble(URL_KEY_UNDER_TEST),
    });

    expect(handBuilt.getProductURL()).toBe(`/${URL_KEY_UNDER_TEST}//`);
  });
});

// --- bidirectional helpers and the CFML-vs-JS index base ---------------------------------------
//
// PRODUCT IS THE OWNING SIDE, WHICH IS WHY ITS HELPERS MUTATE THE FAR ARRAY. `setBrand` pushes onto
// `brand.getProducts()` behind the guard `isNew() || !hasProduct(this)`, reproducing
// [model/entity/Product.cfc:L662-L667]; `removeBrand` splices out of `brand.getProducts()` when
// `arrayFind` located it and then clears the near side UNCONDITIONALLY, reproducing
// [model/entity/Product.cfc:L668-L677]. `Brand.addProduct`/`removeProduct` do the opposite - they
// delegate and touch no array - because `Product` holds the `brandID` FK
// [model/entity/Product.cfc:L68]. The asymmetry is read off the shipped modules and asserted as
// found rather than assumed to be a folder-wide convention.

describe('bidirectional helpers: reproduced symmetry, the D25 hazard, and the index base', () => {
  it('B16.1 - setBrand wires BOTH sides: the near-side FK and the far-side array', () => {
    // CFML parity [model/entity/Product.cfc:L662-L667]: `variables.brand = arguments.brand;` then a
    // guarded `arrayAppend(arguments.brand.getProducts(), this)`. Both halves are reproduced.
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
    // containment probe entirely for an unsaved product, so a second setBrand call appends a second
    // reference to the same instance onto the far-side array.
    //
    // Preserved deliberately; do not fix without a product decision.
    //
    // WHY IT IS PRESERVED RATHER THAN GUARDED: the short-circuit exists because probing an UNSAVED
    // key is meaningless - `hasProduct` would compare `''` against `''` and match any other unsaved
    // product in the collection - so the legacy dodged the ambiguity by not probing at all.
    // Reversing the operands to probe first would trade a duplicate append for a FALSE MATCH
    // between two different unsaved products, which is strictly worse. AND THE GUARDED CONVENTION
    // IS FOLDER-WIDE, so this hazard is not local to Product: `PriceGroupRate.setPriceGroup`
    // [model/entity/PriceGroupRate.cfc:L181-L186], `PromotionPeriod.setPromotion`
    // [model/entity/PromotionPeriod.cfc:L100], `SkuCurrency.setSku`
    // [model/entity/SkuCurrency.cfc:L91], `PromotionApplied.setPromotion`
    // [model/entity/PromotionApplied.cfc:L81], `PromotionAccount.setAccount`
    // [model/entity/PromotionAccount.cfc:L74] and `setPromotion` [L92], and
    // `PromotionCode.setPromotion` [model/entity/PromotionCode.cfc:L104] all carry the identical
    // shape.
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
    // OUTSIDE the guard. So a far-side miss still detaches the near side, and that is deliberate,
    // because the identifier at L672 and L674 is the SAME one, unlike the leaked-variable defect
    // that afflicts the promotion over-use loop.
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
    // raises and the `arrayFind` at [model/entity/Product.cfc:L672] is never reached. The target
    // refuses the call for the same reason and names L672 - the statement that would have
    // dereferenced it - in the message. Reproduced as a refusal deliberately; a silent no-op here
    // would invent a guard the legacy never had.
    const orphan = new Product({ productID: 'product-1' });

    expect(() => orphan.removeBrand()).toThrow(/removeBrand was called with no argument/);
    expect(() => orphan.removeBrand()).toThrow(/model\/entity\/Product\.cfc:L672/);
  });

  it('B16.4 - THE INDEX BASE: removing the FIRST product of a brand actually removes it', () => {
    // THE EXECUTABLE PROOF OF THE `index > 0` -> `!== -1` TRANSLATION. CFML parity
    // [model/entity/Product.cfc:L672-L674]: `arrayFind` returns a ONE-BASED index or 0, so
    // `if(index > 0)` is exactly right in CFML. TypeScript's `findIndex` returns a ZERO-BASED index
    // or -1, so carrying `> 0` across LITERALLY would silently refuse to remove element 0 - the
    // first product of a brand would test false and survive.
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
    // CFML parity [model/entity/Product.cfc:L672]: `arrayFind(arguments.brand.getProducts(), this)`
    // compared ORM-managed references, which within one Hibernate session were identity-equal to
    // the row's single managed instance. Without a session there is no such guarantee, so the
    // shipped body compares `getProductID()` - which makes a DIFFERENT instance carrying the SAME
    // key remove the held one, the behaviour a repository-hydrated graph needs.
    const brand = new Brand({ brandID: 'brand-1', brandName: 'By Key' });
    const held = new Product({ productID: 'product-1' });
    held.setBrand(brand);

    const separatelyHydrated = new Product({ productID: 'product-1' });
    expect(separatelyHydrated).not.toBe(held);

    separatelyHydrated.removeBrand(brand);

    expect(brand.getProducts()).toEqual([]);
  });

  it('B16.5 - and the SIX containment probes on Product match by primary key too', () => {
    // C11 - THERE ARE SIX PROBES, NOT FIVE: `hasSku` is the sixth alongside `hasPriceGroupRate`,
    // `hasPromotionQualifier`, `hasPromotionQualifierExclusion`, `hasPromotionReward` and
    // `hasPromotionRewardExclusion`.
    //
    // CFML parity: each body reads the candidate's key, falls back to reference containment ONLY
    // when that key is empty, and otherwise compares keys. The empty-key fallback is what keeps an
    // UNSAVED candidate probeable at all - and is exactly why `setBrand`'s `isNew() or`
    // short-circuit exists (B16.2).
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
    // CFML parity [model/entity/Product.cfc:L696-L698] and [L699-L701], both single-line
    // delegations: `arguments.sku.setProduct( this )` and `arguments.sku.removeProduct( this )`.
    // `Sku` holds the `productID` FK at [model/entity/Sku.cfc:L65], so the SKU is what changes -
    // and this product's `skus` array is appended to BY `Sku.setProduct`, not here.
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

  // ═════════════════════════════════════════════════════════════════════════
  // B16.8 - `setDefaultSku`: NET-NEW COVERAGE for a NET-NEW member.
  //
  // ★ DECLARED NET-NEW under AAP 0.6.6. `meta/tests/unit/entity/ProductTest.cfc`
  // carries ONE case - `productUrlIsCorrectlyFormatted()` - and asserts nothing
  // about the default SKU, so no legacy antecedent exists for any of this.
  //
  // ★ WHY THE MEMBER EXISTS, WHICH IS WHAT THESE CASES ARE REALLY PINNING.
  // `model/service/SkuService.cfc` calls `arguments.product.setDefaultSku(...)` at
  // FIVE sites - [L102], [L134], [L167], [L189] and [L198] - and that call is the
  // only thing that ever gives a freshly created product a default SKU. The shipped
  // module held `defaultSku` as a hydration-time field with a getter only, so those
  // five designations had nowhere to land: every product the service built reported
  // `getDefaultSku() === undefined`, `SwProduct.defaultSkuID` was written NULL, and
  // the eight accessors on this class that read through the default SKU all answered
  // their absent-value fallback.
  //
  // ★ AND IT IS THE ONE MUTATOR ON THIS CLASS WITH NO FAR-SIDE WIRING, WHICH IS
  // NOT AN OVERSIGHT. `model/entity/Product.cfc` declares NO hand-written
  // `setDefaultSku` at all - verified by reading the file - so the legacy used the
  // setter Hibachi GENERATES for a persistent property: a plain assignment.
  // Contrast `setBrand` [model/entity/Product.cfc:L662-L667], which the legacy
  // authors wrote out precisely so it could push onto the far side. There is also
  // nothing on the far side to push onto: `Sku` declares no "products I am the
  // default for" collection anywhere in [model/entity/Sku.cfc:L65-L79].
  // ═════════════════════════════════════════════════════════════════════════

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
    // ⚠ THE LOAD-BEARING CASE. [L102] and [L134] designate BEFORE anything is
    // persisted, so the entity has to accept a SKU that reports itself unsaved. The
    // persistence adapter reads exactly this state to decide that it must bind SQL
    // NULL for `defaultSkuID` and issue a follow-up update once the SKU row exists, so
    // a setter that refused a transient SKU would make creating a product with SKUs
    // impossible.
    //
    // ★ TRANSIENCE ON `Sku` IS A FLAG, NOT AN EMPTY IDENTIFIER, AND THIS CASE IS
    // WRITTEN TO SAY SO. The legacy predicate does test the identifier -
    // `getNewFlag()` [org/Hibachi/HibachiEntity.cfc:L571-L576] is
    // `getPrimaryIDValue() == ""` and `isNew()` [L707-L709] is its deprecated alias -
    // and `Product.isNew()` reproduces it literally as `productID === ''`. `Sku` does
    // not, because `skuService.createSkus` mints a PROVISIONAL 32-hex key for each
    // draft so it is addressable in memory, so the flag is what carries the state the
    // identifier no longer can. An earlier draft of this case passed `skuID: ''` and
    // asserted `isNew()`, which FAILED - the fixture honoured the empty string
    // faithfully and the entity still reported itself saved. That is the shape a
    // transient SKU really has, so it is the shape asserted here.
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
    // ALL TEN ARE PURE SINGLE-LINE DELEGATIONS to the far side, verbatim from
    // [model/entity/Product.cfc:L732-L769]:
    //   addPromotionReward              -> promotionReward.addProduct(this)             [L732-L734]
    //   removePromotionReward           -> promotionReward.removeProduct(this)          [L735-L737]
    //   addPromotionRewardExclusion     -> promotionReward.addExcludedProduct(this)     [L740-L742]
    //   removePromotionRewardExclusion  -> promotionReward.removeExcludedProduct(this)  [L743-L745]
    //   addPromotionQualifier           -> promotionQualifier.addProduct(this)          [L748-L750]
    //   removePromotionQualifier        -> promotionQualifier.removeProduct(this)       [L751-L753]
    //   addPromotionQualifierExclusion  -> ...addExcludedProduct(this)                  [L756-L758]
    //   removePromotionQualifierExclusion -> ...removeExcludedProduct(this)             [L759-L761]
    //   addPriceGroupRate               -> priceGroupRate.addProduct(this)              [L764-L766]
    //   removePriceGroupRate            -> priceGroupRate.removeProduct(this)           [L767-L769]
    // ★★★ THIS CASE IS THE STRUCTURAL HALF ONLY, AND IT USED TO BE THE WHOLE THING. It once carried
    // this justification: "`PromotionReward`, `PromotionQualifier` and `PriceGroupRate` are NOT in
    // this suite's dependency whitelist, and all three are classes with private state, so no
    // structural stand-in can satisfy their parameter types: constructing one would mean either
    // importing outside the whitelist or reaching for a cast."
    //
    // A CODE REVIEW REJECTED THAT, AND IT WAS RIGHT: there is no such whitelist. `eslint.config.mjs`
    // restricts imports for `src/domain/**` - outward layers and barrels - and imposes nothing of the
    // kind on `tests/**`, and this suite already imports five sibling entity classes for exactly this
    // purpose. All three far-side classes take a single required identifier, so a real one costs one
    // line and no cast. Ten delegations and six probes were therefore never called at all: an
    // inverted add/remove, a dropped guard or an include/exclude swap would all have passed.
    //
    // The arity and existence loop below still earns its place - it is what keeps a delegation from
    // silently gaining a second parameter, and it pairs with the omission case that follows - but the
    // BEHAVIOUR is asserted in the round-trip block after it, against real instances.
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
    // TWELVE MEMBERS ACROSS SIX PAIRS point at entities outside the eighteen, so none is authored,
    // because there is nothing in the domain layer for them to delegate to:
    //
    //   addAttributeValue / removeAttributeValue  [model/entity/Product.cfc:L680-L685]
    //   addProductImage   / removeProductImage    [L688-L693]
    //   addProductReview  / removeProductReview   [L704-L709]
    //   addListingPage    / removeListingPage     [L712-L729]  <- the only OWNING side of the six
    //   addVendor         / removeVendor          [L772-L777]
    //   addPhysical       / removePhysical        [L780-L785]
    //
    // Upstream's B16.6 lists `addProductReview`, `addListingPage` AND `addPhysical` as SHIPPED.
    // They are not, and the source explains why: `ProductReview`, `Content` (listing pages),
    // `Vendor`, `Physical`, `ProductImage` and `AttributeValue` are all outside the eighteen
    // in-scope entities. VERIFY BEFORE YOU QUOTE; SOURCE WINS.
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

// =========================================================================================
// B16.6, BEHAVIOURALLY: the ten delegations and six probes, against REAL far sides.
//
// ★★★ WHY THIS BLOCK EXISTS. The structural case above asserts that ten members exist and take
// one argument each. A code review measured that as the ONLY coverage they had: not one of them
// was ever called, so an inverted add/remove, a dropped duplicate guard or an include list wired
// to the exclusion collection would all have passed. The three far-side classes each take a
// single required identifier, so every case here constructs real ones - no cast, no stand-in.
//
// WHAT EACH ROUND TRIP HAS TO SHOW, because the legacy helpers are BIDIRECTIONAL
// [model/entity/PromotionReward.cfc:L258-L275, PromotionQualifier.cfc:L301-L306,
// PriceGroupRate.cfc:L216-L236]: after an add, BOTH collections hold the counterpart; after a
// remove, NEITHER does; a second add adds nothing more for a SAVED product; and the include and
// exclude collections never see each other's members.
// =========================================================================================
describe('B16.6 behaviour - the promotion and price-group delegations, as two-sided round trips', () => {
  /** A saved product, which is what makes the far side's `hasProduct` guard reachable. */
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

    // The delegation is `promotionReward.addProduct(this)` [model/entity/Product.cfc:L732-L734], and
    // the far side pushes onto both collections - so a one-sided implementation fails here.
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

    // Guard L259 + L262: `if(product.isNew() or !hasProduct(product))`. A saved product is compared
    // by identifier, so the second add is a no-op on both sides.
    expect(reward.getProducts()).toHaveLength(1);
    expect(product.getPromotionRewards()).toHaveLength(1);
  });

  it('★★ but a NEW product is admitted TWICE, which is the legacy guard reproduced literally', () => {
    // `isNew()` is `productID === ''` [model/entity/Product.cfc], and the legacy guard SHORT-CIRCUITS
    // on it: an unsaved row has no identifier to compare, so the guard admits it unconditionally. The
    // duplicate is therefore legacy behaviour rather than a defect in the delegation, and pinning it
    // is what keeps a well-meant `includes()` check from being added later.
    const draft = new Product({ productID: '' });
    const reward = aReward();

    expect(draft.isNew()).toBe(true);

    draft.addPromotionReward(reward);
    draft.addPromotionReward(reward);

    expect(reward.getProducts()).toHaveLength(2);

    // The PRODUCT side is guarded differently - by `product.hasPromotionReward(reward)`, which for a
    // reward carrying a real identifier compares identifiers - so it holds one.
    expect(draft.getPromotionRewards()).toHaveLength(1);
  });

  it('★★ the six probes match by IDENTIFIER, so a re-hydrated instance is recognised', () => {
    // The property that matters at a repository boundary: two instances describing the SAME row are
    // the same association member, because hydration produces a fresh object per read.
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
    // A far side with no identifier cannot be compared by one, so each probe on THIS entity falls
    // back to `includes(...)`: the same instance is held, a different unsaved instance is not. All
    // six behave alike, which is worth pinning because the far sides do not - see the next case.
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
    // THE ASYMMETRY, ASSERTED WHERE IT ACTUALLY LIVES. `PromotionReward.hasProduct` and
    // `PromotionQualifier.hasProduct` (through its shared `indexOfEntity` helper) both take the
    // identity branch for an unsaved candidate; `PriceGroupRate.hasProduct` compares `productID`
    // unconditionally, so with two unsaved products it answers TRUE for one it has never held -
    // `'' === ''`. Reproduced rather than smoothed over: the guard that consults it short-circuits on
    // `product.isNew()` first [model/entity/PriceGroupRate.cfc:L216-L223], so no shipped path depends
    // on the difference, and a repository mints an identifier before anything is associated.
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

// --- the inherited-base behaviours - documented, not fabricated --------------------------------
//
// No Hibachi base class is ported: `Product.cfc` extends `HibachiEntity`, which extends
// `org.Hibachi.HibachiEntity`, and that tree is extracted from rather than translated - persistence
// moves to the repositories, validation to typed schemas, ambient scope to explicit context
// parameters, smart lists to typed repository queries. For most base members the shipped reality is
// therefore a DOCUMENTED ABSENCE, and each case below asserts that absence and records the legacy
// contract it replaces.

describe('inherited-base behaviours: the legacy contract documented and the shipped reality asserted', () => {
  it('B17.1 - the unknown-getter split is 4 SILENT / 14 THROW, and Product is one of the four', () => {
    // THE MECHANISM. `onMissingMethod` [org/Hibachi/HibachiEntity.cfc:L507-L565] matched a series
    // of name patterns and, having matched none, fell through to a `getAttributeValue` fallback at
    // [L559-L561] and only then to the throw at [L565]. The fallback fired ONLY for entities
    // declaring an `attributeValues` collection, so those answered `''` where the rest raised. THE
    // FOUR SILENT ENTITIES: Brand [model/entity/Brand.cfc:L60], Product
    // [model/entity/Product.cfc:L75], Sku [model/entity/Sku.cfc:L70], ProductType
    // [model/entity/ProductType.cfc:L67]; the other FOURTEEN in-scope entities declare no
    // `attributeValues` and therefore threw. No EAV read path is invented: no `getAttributeValue`,
    // no `onMissingMethod`, no Proxy dispatcher, and `attributeValues` [L75] - also one of the FOUR
    // one-to-many declarations missing `type="array"` - is not materialized at all.
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
    // THE LEGACY CONTRACT, AND IT IS A LATENT STALENESS BUG. `clearAttributeCache()`
    // [model/entity/HibachiEntity.cfc:L246-L252] deletes EXACTLY TWO keys -
    // `attributeValuesByAttributeIDStruct` [L247-L249] and `attributeValuesByAttributeCodeStruct`
    // [L250-L252] - leaving `attributeValuesForEntity` and `assignedAttributeSetSmartList` STALE.
    // `getAssignedAttributeSetSmartList()` IS SHADOWED AT FOUR SITES, NOT THREE:
    // [model/entity/HibachiEntity.cfc:L205] the base, [model/entity/Sku.cfc:L813],
    // [model/entity/ProductType.cfc:L280] and [model/entity/Product.cfc:L795] - the VERIFIED
    // fourth, omitted upstream.
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
    // THE LEGACY CONTRACT. `preInsert()` [org/Hibachi/HibachiEntity.cfc:L598-L619] threw when
    // `!isPersistable()`, logged every validation error, and stamped `createdDateTime` and
    // `modifiedDateTime` from `now()` at [L609]. At [org/Hibachi/HibachiEntity.cfc:L605] it calls
    // `writeDump(getErrors())` - raw debug output written straight to the response on a failed
    // flush - which is never ported in any form: not as a console write, not as a logger call.
    // Where the legacy used a hook for real work - the materialized-path maintenance at
    // [model/entity/PriceGroup.cfc:L206, L211] - it becomes REPOSITORY-INVOKED EXPLICIT MAINTENANCE
    // rather than entity behaviour.
    // ★ `getErrors` LEFT THIS LIST, AND `writeDump(getErrors())` STILL IS NOT PORTED IN ANY FORM. The
    // member exists because the save-refusal protocol answers through it (see the block at the foot of
    // this file); what remains absent is the HOOK that dumped it to the response, and nothing in the
    // subtree writes an error collection to a stream, a console or a log line.
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

    // ★ `getErrors` USED TO BE ON THAT LIST AND NO LONGER BELONGS THERE. This case is about the ORM
    // EVENT HOOKS and the raw `writeDump(getErrors())` debug output
    // [org/Hibachi/HibachiEntity.cfc:L605] - not about the register the dump happened to read. The
    // register is ported [org/Hibachi/HibachiTransient.cfc:L30-L32]; the dump is not, and keeping the
    // two apart is the point.
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
    // THE LEGACY CONTRACT [model/entity/HibachiEntity.cfc:L180-L183]:
    //
    //   var thisAttribute = getService("attributeService").getAttributeByAttributeCode(
    //   arguments.attribute );
    //   if(isNull(thisAttribute) && len(arguments.attribute) eq 32) {
    //     thisAttribute = getService("attributeService").getAttributeByAttributeCode(
    //     arguments.attribute );
    //   }
    //
    // The "retry" re-calls the SAME method with the SAME argument, so a first null yields a second
    // null. It is a NO-OP - almost certainly a half-finished intent to fall back to a lookup by
    // attribute ID for a 32-character UUID. Recorded, not reproduced, and no test path is invented:
    // the whole `getAttributeValue` family is a documented non-port (B17.1).
    expect(declaresMember('getAttributeByAttributeCode')).toBe(false);
    expect(declaresMember('getAttributeValue')).toBe(false);

    expect(LEGACY_MERCHANDISE_PRODUCT_TYPE_ID).toHaveLength(32);
    expect(LEGACY_NON_MERCHANDISE_PRODUCT_TYPE_ID).toHaveLength(32);
  });

  it('B17.6 - the five framework-coupled smart-list members are documented non-ports', () => {
    // SMART LISTS ARE NOT PORTED. `HibachiSmartList` is a generic, string-keyed, dynamically
    // filtered query builder; porting it faithfully would mean reimplementing a small ORM query
    // language - re-importing exactly the coupling this refactor removes, and untypeable under the
    // strict profile. THE FIVE SITES ON THIS ENTITY, EACH VERIFIED FIRST-HAND:
    //   getListingPagesOptionsSmartList()  [model/entity/Product.cfc:L146-L153] -> contentService
    //   getTemplateOptions()               [model/entity/Product.cfc:L171-L176] -> ProductService
    //   getOptionGroups()                  [model/entity/Product.cfc:L251-L261] -> THE EXCEPTION
    //   getDefaultProductImageFiles()      [model/entity/Product.cfc:L497-L515] -> skuService
    //   getAssignedAttributeSetSmartList() [model/entity/Product.cfc:L795] -> attributeService
    // `getOptionGroups()` could not be omitted: `model/validation/Product.json` gates three
    // contexts on `unusedProductOptions` and `unusedProductOptionGroups` with `minCollection:1`,
    // both are built from `structKeyList(getOptionGroupsStruct())`, and that struct comes from
    // `getOptionGroups()` - drop the first and the other two become unsatisfiable. So its RESULT is
    // materialized at the repository boundary and the accessor refuses when it was not (B9). The
    // other four had no such live dependent.
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
    // CFML PARITY - THREE DISTINCT MEMO IDIOMS IN ONE FILE, all meaning "compute once":
    // `!structKeyExists(variables, "x")`, the dominant form [model/entity/Product.cfc:L252, L518,
    // L525, L605, L625]; `isNull(variables.x)`, used elsewhere in the folder; and
    // `!isDefined("variables.templateOptions")` [model/entity/Product.cfc:L172], the third idiom
    // and the only occurrence on Product.
    //
    // All three collapse to a single `=== undefined` probe, because that is the one thing
    // TypeScript can check. The divergence is ANNOTATED rather than normalised in the source, and
    // the collapse is safe only because the memos are request-scoped: `isDefined` on a
    // component-scope key and `=== undefined` on an instance field agree exactly when the instance
    // lives for one request, which A2 guarantees and B19 proves.
    const first = new Product({ productID: 'product-1' });
    const second = new Product({ productID: 'product-2' });

    expect(first.getBrandName()).toBe('');
    expect(first.getSalePriceDiscountType()).toBe('none');
    expect(second.getBrandName()).toBe('');
    expect(second.getSalePriceDiscountType()).toBe('none');

    expect(declaresMember('getTemplateOptions')).toBe(false);
  });

  it('B17.1 - the SIX out-of-scope process contexts and methods are not reachable from here', () => {
    // SEVERAL METHODS INSIDE IN-SCOPE FILES SERVE OUT-OF-SCOPE FEATURES, and none is ported into
    // working form. They live on `ProductService`, not the entity, and the entity publishes no
    // route to them: `processProduct_addProductReview` [model/service/ProductService.cfc:L157],
    // `processProduct_addSubscriptionTerm` [L173], `processProduct_uploadDefaultImage` [L235] and
    // `loadDataFromFile` [L65]. `loadDataFromFile` sets `requesttimeout=3600` at
    // [model/service/ProductService.cfc:L65-L68].
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

// --- B18: ports, not locators; no ambient scope; no clock ------------------
// T1, T2 and T6 all land here. DI/1's convention scan of `property name="xService";` becomes
// explicit constructor parameters typed to ports; the `getService("x")` locator calls embedded in
// entities become injected ports; and the ambient request scope - `getHibachiScope()`, plus the
// inconsistent `getSlatwallScope()` at [model/service/PriceGroupService.cfc:L262-L268] - becomes an
// explicit context parameter.

describe('getTitle: the productTitleString template, rendered (F13)', () => {
  // ★★★ WHY THIS BLOCK EXISTS. `getTitle()` [model/entity/Product.cfc:L540-L545] was deliberately
  // omitted from an earlier revision of the port, and `src/services/productService.ts` substituted
  // `getCalculatedTitle()` at the one site that needs it - the URL-slug derivation at
  // [model/service/ProductService.cfc:L269]. Code review recorded the cost: `calculatedTitle`
  // [model/entity/Product.cfc:L65] is an ORM-maintained snapshot, so a NEW product has none and a
  // STALE one carries a title from before this save populated a new name. The template must be
  // evaluated against CURRENT state, which is what these cases pin.
  //
  // THE RENDERER IS `replaceStringTemplate` [org/Hibachi/HibachiUtilityService.cfc:L70-L100],
  // reproduced at its single in-scope consumer rather than as a framework utility module - AAP 0.5.3
  // redistributes framework responsibilities explicitly, and this one has exactly one consumer.

  it('renders the LEGACY DEFAULT template, both markers resolved', () => {
    // `productTitleString = {fieldType="text", defaultValue="${brand.brandName} ${productName}"}`
    // [model/service/SettingService.cfc:L193]. The fixture's brand and product name are distinct
    // known values, so this also proves the single separating space survives.
    const subject = makeProductFixture();

    expect(subject.getTitle()).toBe('Test Brand Test Product');
  });

  it('★ resolves a marker whose PATH cannot be walked to the EMPTY STRING, not to the marker', () => {
    // `getValueByPropertyIdentifier` ends `return "";` [org/Hibachi/HibachiTransient.cfc:L480] and
    // `getLastObjectByPropertyIdentifier` [L483-L491] answers nothing when an intermediate is null.
    // So an UNBRANDED product renders the default template's first marker empty - which leaves a
    // LEADING SPACE, and that is the legacy's own output rather than a defect of the port.
    const unbranded = makeProductFixture({ brand: undefined });

    expect(unbranded.getTitle()).toBe(' Test Product');
  });

  it('★★ leaves a marker naming NO PROPERTY literally in place', () => {
    // The two outcomes are NOT interchangeable, and this is the case that separates them.
    // `replaceDetails.value` is seeded to the marker itself [org/Hibachi/HibachiUtilityService.cfc:L78]
    // and the `removeMissingKeys` arm [L89] is not taken, because `Product.getTitle()` passes only
    // `template` and `object` [model/entity/Product.cfc:L542] and that flag defaults to `false`.
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
    // `listLast(propertyIdentifier, '._')` and `listFirst(..., '._')`
    // [org/Hibachi/HibachiTransient.cfc:L467, L485] make BOTH characters delimit a path, so
    // `brand_brandName` names the same property as `brand.brandName`.
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
    // THE ONE PLACE THE PORT MUST ADD SOMETHING CFML DID NOT NEED. `String.prototype.replaceAll`
    // interprets `$$`, `$&`, `` $` ``, `$'` and `$<name>` inside the REPLACEMENT, whereas CFML's
    // `replace()` has no substitution syntax at all - so a product name legitimately containing `$&`
    // would otherwise re-insert the matched marker into its own title.
    const subject = makeProductFixture({
      productName: 'Half $& Half',
      productTitleString: '${productName}',
    });

    expect(subject.getTitle()).toBe('Half $& Half');
  });

  it('MEMOIZES per instance, and caches an EMPTY render rather than repeating it', () => {
    // The legacy guard is `!structKeyExists(variables, "title")` [model/entity/Product.cfc:L541] -
    // key EXISTENCE, not truthiness - so a template that renders EMPTY is cached. Testing the string
    // instead would re-render on every call, re-reading the setting and re-walking the graph.
    let settingReads = 0;
    const countingProvider = {
      setting: (): string => {
        settingReads += 1;

        return '${brand.brandName}';
      },
    };

    const unbranded = makeProductFixture({
      brand: undefined,
      productPresentationSettingsProvider: countingProvider,
    });

    expect(unbranded.getTitle()).toBe('');
    expect(unbranded.getTitle()).toBe('');
    expect(settingReads).toBe(1);
  });

  it('★ REFUSES rather than inventing a title when the presentation provider is absent', () => {
    // The same discipline `getProductURL()` follows: the collaborator is optional at construction so
    // hydration can build a product for paths that never read a setting, and a path that DOES read one
    // says so instead of substituting a plausible answer.
    const unwired = makeProductFixture({ productPresentationSettingsProvider: undefined });

    expect(() => unwired.getTitle()).toThrow(/product presentation settings provider/);
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
    // THE EIGHTEEN LEGACY SITES ON THIS ENTITY, EVERY ONE VERIFIED FIRST-HAND, WITH ITS PORTED
    // DISPOSITION:
    //   L132 productService  -> out of scope (searchProductsByProductType smart list)
    //   L148 contentService  -> OMITTED (getListingPagesOptionsSmartList, B17.6)
    //   L159 skuService      -> `skuRepository` (the flagged getSkus path, B8.2)
    //   L173 ProductService  -> OMITTED (getTemplateOptions, B17.6)
    //   L254 OptionService   -> materialized at the repository boundary (B9.1)
    //   L341 optionService   -> resolved IN MEMORY over `skus` (B9.6)
    //   L367 productService  -> `skuRepository` (B7.4)
    //   L401 stockService    -> out of scope (estimated receival)
    //   L441, L443 inventoryService -> out of scope (quantity types)
    //   L501 skuService      -> OMITTED (getDefaultProductImageFiles, B17.6)
    //   L519 promotionService-> `salePriceResolver`, the SECOND interface exported by
    //                           `src/domain/ports/promotionRepository.ts` (B12.1, branch (a))
    //   L542 hibachiUtilityService -> OMITTED (getTitle, C3 - NOT a port)
    //   L626 skuService      -> `skuRepository` (B13.2)
    //   L637, L644 optionService -> `optionRepository` (B10.1, B10.2)
    //   L651 subscriptionService -> `subscriptionTermProvider` STUB (B10.3)
    //   L798 attributeService-> OMITTED (getAssignedAttributeSetSmartList, B17.2)
    // AND THE AAP'S `Product.cfc:L343` IS DRIFTED: the `optionService` locator is at L341, verified
    // by direct read. VERIFY BEFORE YOU QUOTE; SOURCE WINS.
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
    // THE THIRTEEN PORTS, IN THE ORDER THE AAP DECLARES THEM: productRepository, skuRepository,
    // optionRepository, productTypeRepository, promotionRepository, priceGroupRepository,
    // settingsProvider, currencyConverter, addressZoneEvaluator, urlTitleGenerator, imageStore,
    // subscriptionTermProvider, productFeedPort. Product receives five of them - the first three
    // plus `settingsProvider` and the `subscriptionTermProvider` STUB. `hibachiUtilityService` is
    // NOT on that list and is NOT a port. It is the collaborator `getTitle()`
    // [model/entity/Product.cfc:L542] reached for, and rather than invent a fourteenth port to host
    // it, `getTitle` is a documented non-port (C3).
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

    // ★ `getTitle` WAS ON THAT LIST AND HAS SHIPPED - see the B13.4 case for the full record. It is
    // not a port ACCESSOR, which is what this case is actually about: no `get<Port>` member exists,
    // so a caller cannot reach a collaborator through the entity.
    expect(declaresMember('getTitle')).toBe(true);
    expect(declaresMember('getProductPresentationSettingsProvider')).toBe(false);
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
    // EXACTLY TWO ENTITIES IN THE SLICE TAKE A CLOCK, both as a PLAIN CONSTRUCTOR PARAMETER rather
    // than a port: `promotionPeriod.ts` and `promotionCode.ts`, each accepting
    //   now: () => Date
    // because `isCurrent`/`isExpired` genuinely need the current instant
    // [model/entity/PromotionPeriod.cfc:L78, L83]. Deliberately NOT a fourteenth port and
    // deliberately not sourced from `src/lib/config.ts`. Product needs none. The one place the
    // legacy reached for `now()` is `getSalePriceExpirationDateTime()` at
    // [model/entity/Product.cfc:L616], and that method cannot return at all (B5), so the seed is
    // unreachable.
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
    // TWO OF THE THIRTEEN PORTS ARE STUBS BY DESIGN - `imageStore` and `subscriptionTermProvider` -
    // because subscription and content-access SKU handling is out of scope
    // [model/service/SkuService.cfc:L139-L202, L210-L218]. They are narrow interfaces with
    // documented stub behaviour so the merchandise path compiles and runs unchanged, NOT
    // half-implementations awaiting completion. Product reaches exactly one, at
    // [model/entity/Product.cfc:L651], and the accessor refuses with a message naming the port, its
    // two real members, and the validation rule that would have consumed the result.
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
    // T6. `getHibachiScope()` was the ambient request scope every legacy component reached for, and
    // `PriceGroupService` reached the SAME object through a differently-named `getSlatwallScope()`
    // at [model/service/PriceGroupService.cfc:L262-L268].
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

// --- memo isolation and freshness ----------------------------------------------------------------
// EVERY MEMO ON EVERY SHIPPED ENTITY IS REQUEST-SCOPED, and this section proves it for the EIGHT
// `Product` carries: `optionGroups` [model/entity/Product.cfc:L252], `optionGroupsStruct` [L242],
// `brandName` [L525] - the divergence-(c) one, `salePriceDiscountType` [L605] - the correct
// control, `transactionExistsFlag` [L625], `unusedProductOptions` [L636],
// `unusedProductOptionGroups` [L643] and `salePriceDetailsForSkus` [L518] - the branch-(a) one,
// which fills through the injected `salePriceResolver` and is proved isolated in its own case
// below. The other two - `title` [L541] and `unusedProductSubscriptionTerms` [L650] - are a
// documented non-port and a refusal (C3, C12), so their absence is asserted rather than a memo
// invented.
//
// THE JUSTIFICATION IS STATE MANAGEMENT, NEVER SPEED. Legacy component-scope caches become
// cross-request state on a warm container, so all of them are request-scoped here:
//   1. `SkuDAO.variables.nextOptionGroupSortOrder` [model/dao/SkuDAO.cfc:L204-L220], whose clear
//      method [model/dao/SkuDAO.cfc:L222-L226] tests `not structKeyExists(...)` before deleting and
//      so can never fire. IDENTIFIED, NOT REPRODUCED - the target gives the value a different owner.
//   2. `RoundingRuleService.variables.roundingRuleDetails` [model/service/RoundingRuleService.cfc:L67-L77],
//      seeded at component scope and cleared only on save.
//   3. The un-`var`'d `discountAmount` [model/service/PromotionService.cfc:L1007, L1009, L1014],
//      which leaks into component scope - divergence (a), SIBLING-OWNED by `src/services`.
//   4. Every entity memo, including the eight above.
// Reproducing any of them as module state would be actively unsafe, which is why (3) is an authorized
// divergence rather than a preserved defect.

describe('A2: every memo is request-scoped, and no state crosses instances', () => {
  it('B19.2 - SEVEN of the eight memos on a second instance start FRESH, never inheriting', () => {
    // THE WHOLE-FAMILY ISOLATION PROOF. Each memo is driven to a DISTINCT value on the first
    // instance, and the second - built with different collaborators - answers from its own state.
    // The eighth, `salePriceDetailsForSkus` [model/entity/Product.cfc:L518], needs an injected
    // resolver to fill rather than a differing collaborator to observe, so it is proved in the
    // dedicated case at the end of this block instead of here.
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
    // LEGACY-NOTE [model/dao/SkuDAO.cfc:L222-L226]: `clearNextOptionGroupSortOrder` guards its
    // `structDelete` with `not structKeyExists(variables, "nextOptionGroupSortOrder")`, so it deletes
    // the key only when the key is already absent and can never clear the populated cache it was
    // written to clear.
    //
    // NEUTRALISED BY OWNERSHIP, NOT PRESERVED. `nextOptionGroupSortOrder` arrives as a per-instance
    // HYDRATION INPUT rather than a DAO-scoped cache, so there is no shared key to clear and the
    // inverted guard has nothing to guard: the stale-ceiling consequence is structurally impossible
    // here. That is a deliberate containment of the defect, not a reproduction of it.
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
    // TWO LEGACY MEMOS HAVE NO SHIPPED COUNTERPART, and the honest treatment is to assert the
    // [model/entity/Product.cfc:L541-L544] (C3, reaches `hibachiUtilityService`, not a port); and
    // `unusedProductSubscriptionTerms` [L650-L652] (C12, refuses, because subscription handling is
    // out of scope).
    //
    // THE `salePriceDetailsForSkus` MEMO [L518-L521] IS DELIBERATELY NOT ON THIS LIST. It ships,
    // under the branch-(a) decision recorded at B12.1, and its per-instance isolation is asserted in
    // the case immediately below rather than as an absence here.
    //
    // ★★ NOR IS THE TITLE MEMO [L541] ANY LONGER. `getTitle` ships, so its memo is a memo that must be
    // PER-INSTANCE rather than one that does not exist - which is what this describe block is for.
    // Two products render independently, and the guard is key EXISTENCE not truthiness, so an entity
    // whose template renders EMPTY caches that empty answer instead of re-rendering forever.
    expect(declaresMember('getTitle')).toBe(true);

    const firstTitled = makeProductFixture({ productName: 'First Product' });
    const secondTitled = makeProductFixture({ productName: 'Second Product' });

    expect(firstTitled.getTitle()).toBe('Test Brand First Product');
    expect(secondTitled.getTitle()).toBe('Test Brand Second Product');
    // Re-reading answers the memo, not a fresh render, and the two never share one.
    expect(firstTitled.getTitle()).toBe('Test Brand First Product');

    // The second DOES ship - it refuses instead of memoizing, so there is no cached rejection to
    const first = new Product({ productID: 'product-1' });
    const second = new Product({ productID: 'product-2' });

    return Promise.all([
      expect(first.getUnusedProductSubscriptionTerms()).rejects.toThrow(/product-1/),
      expect(second.getUnusedProductSubscriptionTerms()).rejects.toThrow(/product-2/),
    ]);
  });

  it('B19.3 - the SHIPPED sale-price memo is per instance, and nothing crosses', async () => {
    // A2 APPLIED TO THE ONE MEMO THAT REACHES A PORT. Two products, one shared resolver: each
    // instance fills its OWN [model/entity/Product.cfc:L518] memo, so the resolver is consulted once
    // PER PRODUCT and neither instance can serve the other's rows. Reproducing this memo as module
    // state would be actively unsafe on a warm container - one product's sale prices would leak into
    // another's.
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

// --- the async boundary and structural parity ---------------------------------------------------
// THE RULE, WITH ITS ONE EXCEPTION STATED: a method is `async` when its legacy body reaches the DAO
// or the ORM AND the port still has to reach a repository to answer it. Methods that only traverse
// already-materialized associations, or that perform pure arithmetic, stay synchronous - which is why
// `getPriceByCurrencyCode` stays sync on `Sku` and why `getSkus` stays sync here even though the
// legacy walked a lazy Hibernate collection: the repository materialized the association at hydration
// time, so no I/O remains at call time. Four of the six delegations are sync; `getLivePrice`
// [model/entity/Product.cfc:L582] and `getCurrentAccountPrice` [L588] are async because the sku-side
// accessors they delegate to still reach a repository.

describe('the async boundary and structural parity with the legacy component', () => {
  it('B20.1 - the TEN async members are exactly the ones whose legacy bodies reach a port', () => {
    // EACH ONE TRACED TO THE LOCATOR THAT FORCES IT ASYNC: getSkuBySelectedOptions [L349] via
    // getSkusBySelectedOptions; getSkusBySelectedOptions [L367] -> productService -> skuRepository;
    // getLivePrice [L582] and getCurrentAccountPrice [L588] -> the default sku's own accessors;
    // getUnusedProductOptions [L637] and getUnusedProductOptionGroups [L644] -> optionRepository;
    // getUnusedProductSubscriptionTerms [L651] -> subscriptionTermProvider (STUB);
    // getTransactionExistsFlag [L626] -> skuRepository; getBaseProductType [L494] -> productType ->
    // productTypeRepository; getAttributeSets [L833] -> productRepository.
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
    // rename, no new table, no column change, and NO schema-generation hook anywhere in this suite.
    // The link tables for this entity use ABBREVIATED names, and the abbreviations are load-bearing
    // rather than cosmetic:
    //   SwProduct                [model/entity/Product.cfc:L49]  the entity's own table
    //   SwProductListingPage     [L79]        SwProductCategory        [L80]
    //   SwRelatedProduct         [L81]  SELF-REFERENTIAL
    //   SwPromoRewardProduct     [L84]        SwPromoRewardExclProduct [L85]  `Excl`
    //   SwPromoQualProduct       [L86]  `Qual`
    //   SwPromoQualExclProduct   [L87]        SwPriceGroupRateProduct  [L88]
    //   SwVendorProduct          [L89]
    //   SwPhysicalProduct        [L90]  the `physicals` collection, NOT `physicalCounts`
    //
    // `SwPromoQual` and `SwPromoReward` are likewise the PHYSICAL names of the qualifier table
    // [model/entity/PromotionQualifier.cfc:L49] and the reward table
    // [model/entity/PromotionReward.cfc:L57] -
    // "normalising" any of these to a spelled-out form would break every existing row.
    expect(ProductLegacyMetadata.table).toBe('SwProduct');
    expect(ProductLegacyMetadata.entityName).toBe('SlatwallProduct');

    for (const absent of ['createTable', 'migrate', 'sync', 'getTableName', 'getDatasource']) {
      expect(declaresMember(absent)).toBe(false);
    }
  });

  it('B20.4 - the component-level metadata warts are ANNOTATED, not normalised', () => {
    // SIX SOURCE FACTS PRESERVED AS INERT METADATA rather than smoothed over:
    //   1. `hb_processContexts="updateSkus,addOptionGroup,addOption,addSubscriptionTerm"`
    //      [model/entity/Product.cfc:L49] - UNIQUE TO THIS ENTITY in the slice. The admin
    //      resolves the four contexts off it, so it is carried verbatim even though
    //      `isProcessable()` is not ported (B17.1).
    //   2. FOUR calculated properties [L62-L65] - `calculatedSalePrice`, `calculatedQATS`,
    //      `calculatedAllowBackorderFlag`, `calculatedTitle`. `Sku` has only ONE.
    //   3. THREE eager `fetch="join"` many-to-ones [L68-L70] - `brand`, `productType`,
    //      `defaultSku`. Elsewhere `PromotionPeriod.promotion` [L59] is also eager while
    //      `ProductType.products` is `lazy="extra"` [L66]; none is normalised.
    //   4. `attributeValues` [L75] declares NO `type="array"`, unlike [L73], [L74] and [L76].
    //   5. `productDescription` carries `hb_formFieldType="wysiwyg"` and a 4000 length [L56].
    //   6. `brand` carries `hb_optionsNullRBKey="define.none"` [L68] - an rbKey identifier.
    // `ormtype`/`ormType` casing is likewise not normalised in the source; the target has one field
    // declaration per property, so the casing has nowhere to exist.
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

// --- B21: the five distinct empty-collection semantics ---------------------
//
// "Empty" does not mean one thing here. FIVE genuinely different rules govern what an empty
// collection means, and conflating any two of them changes money:
//   (1) PERMISSIVE IN THE CALLER'S LOOP - a `for` over an empty array does not execute, so the
//       surrounding decision falls through to whatever the caller had already decided. Empty
//       means "no opinion".
//   (2) RESTRICTIVE IN THE EVALUATOR - a gate that must find a match fails when the collection is
//       empty. Empty means "no".
//   (3) `hasAnyInProperty` RETURNS FALSE ON EMPTY [org/Hibachi/HibachiEntity.cfc:L339-L349] - it
//       loops the candidate array and returns `false` having found nothing. Because promotion
//       membership reads INCLUDE lists and EXCLUDE lists through the same helper, that single
//       `false` is PERMISSIVE on an exclude-list and RESTRICTIVE on an include-list. One helper,
//       two opposite meanings.
//   (4) THE FULFILLMENT THREE-WAY GATE [model/service/PromotionService.cfc:L333-L420] - a third,
//       distinct shape, SIBLING-OWNED by the service tier.
//   (5) `Brand.getProducts()` DEFAULTS TO `[]` - a hard, TEST-ASSERTED contract from
//       `meta/tests/unit/entity/BrandTest.cfc` -> `defaults_are_correct()`, which asserts
//       `assertEquals(variables.entity.getProducts(), [])`.
//
// For this entity the observable empties are `getCategoryIDs()` -> `''`, `getOptionGroupCount()` ->
// `0`, `getOptionGroupsStruct()` -> `{}`, the five association accessors -> `[]`, and `getSkus()`
// -> `[]`, each asserted below with the rule it follows named. And `productFixtures.ts` defaults
// `skus` to `[]` DELIBERATELY - that default breaks the Product<->Sku fixture cycle, since
// `skuFixtures.ts` builds a Product and a Product that auto-built Skus would recurse.

describe('empty-collection semantics: five rules, named individually', () => {
  it('B21.1 rule (1) PERMISSIVE - an empty loop yields the identity value, not a refusal', () => {
    // CFML parity [model/entity/Product.cfc:L199-L205]: `getCategoryIDs()` seeds `''` and appends
    // inside a loop. With no categories the loop body never runs, so the seed survives and the
    // answer is the EMPTY STRING - the identity for list concatenation. That is "no opinion", not
    // "no": a caller comparing against a comma list gets a zero-length list rather than an error.
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
    // THE SAME EMPTY, THE OPPOSITE MEANING. `model/validation/Product.json` requires
    // `minCollection: 1` on `unusedProductOptions`, `unusedProductOptionGroups` and
    // `unusedProductSubscriptionTerms`, each in its own process context.
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
    // THE LEGACY HELPER [org/Hibachi/HibachiEntity.cfc:L339-L349] loops the candidate array and
    // returns `false` when nothing matched - including when there was nothing to match. Promotion
    // membership reads BOTH include-lists and exclude-lists through it, so on an INCLUDE list
    // `false` means NOTHING QUALIFIES (restrictive) and on an EXCLUDE list it means NOTHING IS
    // EXCLUDED (permissive).
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
    // THE FOURTH SEMANTIC lives at [model/service/PromotionService.cfc:L333-L420] and is a
    // three-way decision over qualified fulfillments rather than a two-way emptiness test. It
    // belongs to `src/services/promotion/**`, and this entity has no fulfillment surface, so there
    // is nothing here to assert about it.
    for (const absent of [
      'getOrderFulfillments',
      'getQualifiedFulfillmentIDs',
      'getShippingMethodOptions',
    ]) {
      expect(declaresMember(absent)).toBe(false);
    }
  });

  it('B21.1 rule (5) - the LEGACY-ASSERTED default: an empty array, never absence', () => {
    // THE ONE EMPTY-COLLECTION RULE WITH ACTUAL LEGACY TEST COVERAGE.
    // `meta/tests/unit/entity/BrandTest.cfc` -> `defaults_are_correct()` asserts
    // `assertEquals(variables.entity.getProducts(), [])` on a freshly constructed brand, so `[]`
    // rather than `undefined` is a TEST-ENFORCED contract on the far side - and it is what makes
    // `Product.setBrand`'s `arrayAppend(arguments.brand.getProducts(), this)` safe without a null
    // check.
    const brand = new Brand({ brandID: 'brand-1', brandName: 'Default Empty' });
    expect(brand.getProducts()).toEqual([]);
    expect(brand.getProducts()).not.toBeUndefined();

    const bare = new Product({ productID: 'product-1' });
    expect(bare.getSkus()).toEqual([]);
    expect(bare.getCategories()).toEqual([]);
    expect(bare.getRelatedProducts()).toEqual([]);

    // BUT NOT UNIVERSALLY, AND THE EXCEPTION MATTERS: `optionGroups` is NOT defaulted, so
    // `getOptionGroups()` REFUSES rather than answering `[]`.
    expect(() => bare.getOptionGroups()).toThrow();
  });

  it('B21.1 - the three scalar empties on this entity, each with its own identity value', () => {
    // THREE ACCESSORS, THREE DIFFERENT "EMPTY" VALUES, none interchangeable: `getCategoryIDs()` ->
    // `''`, the identity for list concatenation; `getOptionGroupCount()` -> `0`, the identity for
    // counting; `getOptionGroupsStruct()` -> `{}`, the identity for keyed lookup.
    const emptyGroups = new Product({ productID: 'product-1', optionGroups: [] });

    expect(emptyGroups.getCategoryIDs()).toBe('');
    expect(emptyGroups.getOptionGroupCount()).toBe(0);
    expect(emptyGroups.getOptionGroupsStruct()).toEqual({});
    expect(structKeyList(emptyGroups.getOptionGroupsStruct())).toEqual([]);
    expect(structKeyExists(emptyGroups.getOptionGroupsStruct(), 'group-1')).toBe(false);

    // AND THE CFML TRUTHINESS OF EACH EMPTY IS THE SAME `false`, which is why the source could
    // write `if(arrayLen(x))` and `if(len(x))` interchangeably - and why a literal translation to a
    // JavaScript truthiness test would have been wrong for `'0'`.
    expect(cfTruthy(emptyGroups.getOptionGroupCount())).toBe(false);
    // `''` IS accepted and falsy - that specific case is load-bearing for the currency eligibility
    // gate at [model/entity/Sku.cfc:L373], `if(len(setting('skuEligibleCurrencies')))`.
    expect(cfTruthy(emptyGroups.getCategoryIDs())).toBe(false);
    expect(cfTruthy(cfLen(emptyGroups.getCategoryIDs()))).toBe(false);

    // C24 - AND A NON-EMPTY NON-NUMERIC STRING IS A CONVERSION ERROR, NOT `true`.
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
    // WHERE THE FIVE SEMANTICS MEET THE ABSENCE CONVENTION. `getSalePrice()`
    // [model/entity/Product.cfc:L594-L601] guards its second branch with the CFML
    // `if(arrayLen(getSkus()))` idiom - rule (1), permissive. Both the skipped path and the taken
    // path then fall through to `return 0` at [L600], because [L598] has no `return` (defect 20).
    //
    // LEGACY-DEFECT [model/entity/Product.cfc:L598]: the statement getSkus()[1].getSalePrice(); has
    // no return, so execution falls through to return 0 at L600 and the sku's sale price is
    // discarded.
    //
    // Preserved deliberately; do not fix without a product decision.
    //
    // AND THE ABSENCE CONVENTION IS DIRECTIONAL. `Product.getSalePrice()` MUST answer `Money('0')`
    // and NEVER `undefined`; `Sku.getPriceByCurrencyCode()` MUST answer `undefined` and NEVER `0`.
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
  // =========================================================================
  // THE SAVE-REFUSAL CHANNEL - addError / hasErrors / getErrors
  //
  // NET-NEW COVERAGE (AAP 0.6.6). The legacy antecedent is a FRAMEWORK base class this port does not
  // carry - [org/Hibachi/HibachiEntity.cfc:L134, L151] over [org/Hibachi/HibachiErrors.cfc:L14-L60] -
  // and `meta/tests/unit/entity/ProductTest.cfc` asserts nothing about it. The three members exist
  // because `ProductService.saveProduct` answers a REFUSED save by returning this entity with its
  // failed rules recorded on it [model/service/ProductService.cfc:L286-L291], which is the protocol a
  // code review required restored, so the channel is exercised here as its own contract rather than
  // only through the service.
  // =========================================================================

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
    // [org/Hibachi/HibachiErrors.cfc:L14-L21] creates the entry on first use and appends afterwards, so
    // two failed rules on one property are two messages under one key rather than a replacement.
    const product = makeProductFixture({});

    product.addError('productCode', 'productCode is required');
    product.addError('productCode', 'productCode contains an unsupported character');

    expect(product.getErrors()).toStrictEqual({
      productCode: ['productCode is required', 'productCode contains an unsupported character'],
    });
  });

  it('folds the error name like a CFML struct key, keeping the FIRST spelling it was given', () => {
    // A CFML struct key is case-insensitive, so `addError("urlTitle", …)` and `addError("URLTitle", …)`
    // wrote to ONE key there. The fold is `toLowerCase()` and nothing else, matching
    // `src/lib/cfml/struct.ts`; what is reported back is the spelling first supplied.
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

    // ★ THE PROJECTION IS FROZEN, NOT MERELY COPIED, so the write is REFUSED rather than absorbed
    // into a throwaway array. This case originally pushed onto the result and then asserted the
    // entity was unchanged, which a mutable defensive copy would also satisfy; `getErrors()` freezes
    // both the projection and each message array, so the stronger property is available and is what
    // is asserted. The intent is unchanged - a caller cannot reach the entity's error state - and the
    // guarantee is now checked at the point of the write instead of after it.
    expect(() => {
      (messages as string[]).push('injected by a caller');
    }).toThrow(TypeError);
    expect(Object.isFrozen(messages)).toBe(true);
    expect(Object.isFrozen(errors)).toBe(true);

    expect(product.getErrors()).toStrictEqual({ productName: ['productName is required'] });
  });

  it('keeps an error name of `__proto__` as an OWN key and never reaches the prototype', () => {
    // The store is a `Map` and the snapshot is built with `Object.fromEntries`, so this name cannot
    // become an assignment to `Object.prototype`. No ported call site supplies it - every error name is
    // a property identifier from `model/validation/Product.json` - and the property is asserted anyway,
    // because "no caller does that today" is not a guarantee.
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

// ===========================================================================
// The error register, invoked directly on this entity
// ===========================================================================
//
// ★★★ ADDED BECAUSE A MECHANICAL INVENTORY FOUND THESE MEMBERS NAMED BUT NEVER CALLED HERE. A code
// review reported that "nine public methods have no invocation in any test AST", which is a sharper
// question than whether a name appears somewhere: a method mentioned only in a comment is a method
// nothing exercises. The register's behaviour WAS covered - through the service suites, where a refused
// save is observed - but not at the entity that declares it, so the per-entity contract rested on
// another tier's assertions. Gate `A24` now requires an actual invocation.
//
// The three properties asserted are the ones [org/Hibachi/HibachiTransient.cfc:L30-L64] guarantees and
// that the save-refusal semantics depend on: a MISS yields an empty array rather than undefined,
// messages ACCUMULATE under one name rather than replacing, and lookup is CASE-INSENSITIVE while the
// key remembers the case it was FIRST written with.

describe('Product: the inherited error register', () => {
  it('returns an empty array for a name that was never recorded, never undefined', () => {
    // [org/Hibachi/HibachiTransient.cfc:L34-L43]. Callers index the result directly, so an absent name
    // has to be safe to iterate - `undefined` here would turn a clean validation pass into a crash.
    const subject = new Product({ productID: 'product-errors-1' });

    expect(subject.getError('noSuchRule')).toStrictEqual([]);
    expect(subject.hasErrors()).toBe(false);
    expect(subject.getErrors()).toStrictEqual({});
  });

  it('★★ accumulates messages under one name instead of replacing them', () => {
    // [org/Hibachi/HibachiTransient.cfc:L61-L64] APPENDS. Replacing would hide every failure after the
    // first, which is how a partially invalid entity comes to look like a singly invalid one.
    const subject = new Product({ productID: 'product-errors-1' });

    subject.addError('urlTitle', 'is required');
    subject.addError('urlTitle', 'must be unique');

    expect(subject.getError('urlTitle')).toStrictEqual(['is required', 'must be unique']);
    expect(subject.hasErrors()).toBe(true);
  });

  it('★★ looks a name up case-insensitively, and keeps the case it was first written with', () => {
    // CFML struct keys are case-insensitive, so `getError('URLTITLE')` must find what `addError`
    // recorded as `urlTitle` - while [org/Hibachi/HibachiErrors.cfc:L14-L31] REMEMBERS the first
    // spelling, so the published key is the one the first write used.
    const subject = new Product({ productID: 'product-errors-1' });

    subject.addError('urlTitle', 'first');
    subject.addError('URLTITLE', 'second');

    expect(subject.getError('UrlTitle')).toStrictEqual(['first', 'second']);
    expect(Object.keys(subject.getErrors())).toStrictEqual(['urlTitle']);
  });
});
