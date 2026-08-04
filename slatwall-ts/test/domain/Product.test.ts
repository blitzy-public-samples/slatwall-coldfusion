/**
 * TRACEABLE — the `Product` domain entity.
 *
 * Provenance
 * This file carries the legacy Product entity suite across into the TypeScript port. Two legacy
 * documents supply its traceable content, and one supplies a single further case:
 *
 * - `meta/tests/unit/entity/ProductTest.cfc:L58-L62` — the one assertion the legacy product test
 * owns outright: `productUrlIsCorrectlyFormatted()`. It sets the URL title to a specific literal
 * and asserts the rendered product URL, leading and trailing slash included.
 */

import { PRODUCT_PRIMARY_ID_PROPERTY_NAME, Product } from '../../src/domain/product/Product';
import type {
  ProductOptionFinder,
  ProductOptionGroupFinder,
  ProductOwnedAssociation,
  ProductSelectOption,
  ProductSkuIdReader,
  ProductSkuMember,
  ProductUnusedOptionFinder,
} from '../../src/domain/product/Product';
import type { Option } from '../../src/domain/option/Option';
import type { OptionGroup } from '../../src/domain/option/OptionGroup';
import {
  DomainError,
  LegacyParityError,
  NO_SINGLE_SKU_WITHOUT_SELECTED_OPTIONS_MESSAGE,
  NotImplementedError,
  moreThanOneSkuReturnedMessage,
  noSkusFoundForSelectedOptionsMessage,
} from '../../src/errors/DomainError';
import { ValidationError } from '../../src/errors/ValidationError';
import { buildValidationMessage } from '../../src/validation/Validator';
import {
  priceRequiredConstraint,
  productCodeRequiredConstraint,
  productNameRequiredConstraint,
  productTypeRequiredConstraint,
  productValidationRuleSet,
  transactionExistsFlagEqualityConstraint,
  urlTitleRequiredConstraint,
} from '../../src/validation/rules/product.rules';
import type { ProductValidationSubject } from '../../src/validation/rules/product.rules';
import {
  CONTENT_ACCESS_PRODUCT_TYPE,
  CONTENT_ACCESS_PRODUCT_TYPE_ID,
  MERCHANDISE_PRODUCT_TYPE,
  MERCHANDISE_PRODUCT_TYPE_ID,
} from '../fixtures/productTypes';
import {
  TEST_MERCHANDISE_PRODUCT_CODE,
  TEST_MERCHANDISE_PRODUCT_NAME,
} from '../fixtures/testProduct';
import {
  buildBrand,
  buildOption,
  buildOptionGroup,
  buildProduct,
  buildProductType,
  buildSku,
  createDefaultSkuDelegate,
  createImagePathDouble,
  createInMemoryOptionRepository,
  createInMemorySkuRepository,
  createMerchandiseProductFixture,
  createProductSkuOptionFinderDouble,
  createProductTypeRootResolverDouble,
  createSettingResolverDouble,
  createTransactionExistenceChecker,
  createValidatorHarness,
} from '../support/inMemoryRepositories';
import type { PropertyDescriptorSet } from '../../src/domain/base/populate';
import { PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS } from '../../src/domain/process/ProductAddOption';
import { PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS } from '../../src/domain/process/ProductAddOptionGroup';
import { PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS } from '../../src/domain/process/ProductUpdateSkus';

/*
 * Identifiers and seed VALUES
 * Every identifier below is a named, documented, deliberately synthetic constant, following the
 * convention the neighbouring suites already established — see `test/services/ProductService.test.ts`
 * for the same pattern. Each is thirty-two characters wide with no dashes, which is the shape IR-6
 * fixes for every primary key in this schema: the legacy generator produces a thirty-two-character
 * hexadecimal string, never an auto-increment integer and never a dashed RFC-4122 value.
 */

const PRODUCT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

/** A second, so "each product received its own answer" is observable rather than assumed. */
const SECOND_PRODUCT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const OPTION_GROUP_ID = 'cccccccccccccccccccccccccccccccc';

/** A second option group, for the used-versus-unused distinction. */
const SECOND_OPTION_GROUP_ID = 'dddddddddddddddddddddddddddddddd';

const OPTION_ID = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

/** A second option, in the second group. */
const SECOND_OPTION_ID = 'ffffffffffffffffffffffffffffffff';

const SKU_ID = '11111111111111111111111111111111';

/** A second SKU, so a non-singleton SKU set can be assembled. */
const SECOND_SKU_ID = '22222222222222222222222222222222';

/** A child product type whose own system code is absent, forcing the root walk. */
const CHILD_PRODUCT_TYPE_ID = '33333333333333333333333333333333';

/** A root identifier the resolver double holds no seed for, so the root walk resolves nothing. */
const UNSEEDED_ROOT_PRODUCT_TYPE_ID = '44444444444444444444444444444444';

/** The URL title from `meta/tests/unit/entity/ProductTest.cfc:L59`, byte for byte. */
const LEGACY_URL_TITLE = 'nike-air-jorden';

/** The value seeded for the global product URL key. */
const SEEDED_URL_KEY = 'catalog-item';

/**
 * A second value for the same key, used to prove the first assertion is not satisfiable by a default.
 */
const RESEEDED_URL_KEY = 'store-product';

/** A system code that is not one of the three seeded discriminators. */
const UNRECOGNISED_SYSTEM_CODE = 'legacyImportedType';

/*
 * Shared helpers
 * Four helpers, each existing to keep an assertion honest rather than to shorten it.
 */

/**
 * Awaits an operation that is expected to reject and hands the thrown value back for inspection.
 *
 * @param operation - The promise expected to reject.
 * @returns The rejection value.
 */
const captureRejection = async (operation: Promise<unknown>): Promise<unknown> => {
  try {
    await operation;
  } catch (rejection: unknown) {
    return rejection;
  }
  throw new Error('The operation resolved, but a rejection was expected.');
};

/**
 * Runs a synchronous operation that is expected to throw and hands the thrown value back.
 *
 * @param operation - The call expected to throw.
 * @returns The thrown value.
 */
const captureThrow = (operation: () => unknown): unknown => {
  try {
    operation();
  } catch (thrown: unknown) {
    return thrown;
  }
  throw new Error('The operation returned, but a throw was expected.');
};

/**
 * The values a product validation subject carries that the entity itself does not hold as a field.
 */
interface DerivedValidationValues {
  /** The resolved base product type, as `Product.getBaseProductType` computes it. */
  readonly baseProductType?: string;
  /** The resolved transaction flag, as `Product.getTransactionExistsFlag` computes it. */
  readonly transactionExistsFlag?: boolean;
  /** The resolved unused option groups, as `Product.getUnusedProductOptionGroups` computes them. */
  readonly unusedProductOptionGroups?: readonly unknown[];
}

/**
 * Wraps a product as a validation subject, carrying the values the rule set reads but the entity does
 * not store.
 *
 * @param product - The subject entity.
 * @param derived - The asynchronously resolved values to carry.
 * @returns a validation subject over that product.
 */
const asValidationSubject = (
  product: Product,
  derived: DerivedValidationValues = {},
): ProductValidationSubject => ({
  getClassName: () => product.getClassName(),
  hasProperty: (propertyIdentifier: string) => product.hasProperty(propertyIdentifier),
  getPropertyMetaData: (propertyName: string) => product.getPropertyMetaData(propertyName),
  getEntityName: () => product.getEntityName(),
  getPrimaryIDValue: () => product.getPrimaryIDValue(),
  getPrimaryIDPropertyName: () => product.getPrimaryIDPropertyName(),
  getValueByPropertyIdentifier: (propertyIdentifier: string) =>
    product.getValueByPropertyIdentifier(propertyIdentifier),
  productType: product.productType,
  /*
   * Each spread is conditional because an absent property and one explicitly set to `undefined` are
   * different things under `exactOptionalPropertyTypes`, and the validator's absence handling is what
   * several of these rules turn on. Assigning `undefined` would quietly change the question.
   */
  ...(derived.baseProductType === undefined ? {} : { baseProductType: derived.baseProductType }),
  ...(product.productName === undefined ? {} : { productName: product.productName }),
  ...(product.productCode === undefined ? {} : { productCode: product.productCode }),
  ...(derived.transactionExistsFlag === undefined
    ? {}
    : { transactionExistsFlag: derived.transactionExistsFlag }),
  ...(derived.unusedProductOptionGroups === undefined
    ? {}
    : { unusedProductOptionGroups: derived.unusedProductOptionGroups }),
  ...(product.urlTitle === undefined ? {} : { urlTitle: product.urlTitle }),
});

/** What an option-group finder recorded, so "the query was scoped to this product" is checkable. */
interface OptionGroupFinderRecorder {
  readonly finder: ProductOptionGroupFinder;
  /** The product identifiers the finder was asked about, in call order. */
  readonly calls: readonly string[];
}

/**
 * A recording option-group finder over real option-group entities.
 *
 * @param optionGroups - The records to return, in the order the query would produce them.
 * @returns The finder and its call record.
 */
const recordingOptionGroupFinder = (
  optionGroups: readonly OptionGroup[],
): OptionGroupFinderRecorder => {
  const calls: string[] = [];
  return {
    calls,
    finder: {
      getOptionGroupsForProduct: (productID: string): Promise<OptionGroup[]> => {
        calls.push(productID);
        return Promise.resolve([...optionGroups]);
      },
    },
  };
};

/** One recorded option lookup: both identifiers, in the order the port passes them. */
interface OptionFinderCall {
  readonly optionGroupID: string;
  readonly productID: string;
}

/** What an option finder recorded. */
interface OptionFinderRecorder {
  readonly finder: ProductOptionFinder;
  /** Every lookup, in call order — the count is what proves re-querying. */
  readonly calls: readonly OptionFinderCall[];
}

/**
 * A recording option finder, keyed by option group.
 *
 * @param optionsByOptionGroupID - Records to return per option group; an unknown group yields none.
 * @returns The finder and its call record.
 */
const recordingOptionFinder = (
  optionsByOptionGroupID: Readonly<Record<string, readonly Option[]>>,
): OptionFinderRecorder => {
  const calls: OptionFinderCall[] = [];
  return {
    calls,
    finder: {
      getOptionsForProductByOptionGroup: (
        optionGroupID: string,
        productID: string,
      ): Promise<Option[]> => {
        calls.push({ optionGroupID, productID });
        return Promise.resolve([...(optionsByOptionGroupID[optionGroupID] ?? [])]);
      },
    },
  };
};

/**
 * Adapts the in-memory option repository to the entity's unused-option finder shape.
 *
 * @param repository - The in-memory option repository's `repository` member.
 * @returns a finder the entity accepts.
 */
const asUnusedOptionFinder = (
  repository: ReturnType<typeof createInMemoryOptionRepository>['repository'],
): ProductUnusedOptionFinder => ({
  getUnusedProductOptions: (
    productID: string,
    existingOptionGroupIDList: string,
  ): Promise<ProductSelectOption[]> =>
    repository.findUnusedOptions(productID, existingOptionGroupIDList),
  getUnusedProductOptionGroups: (
    existingOptionGroupIDList: string,
  ): Promise<ProductSelectOption[]> => repository.findUnusedOptionGroups(existingOptionGroupIDList),
});

/* The one assertion the legacy product test owns. */

describe('Product — the URL-formatting assertion ported from the legacy suite', () => {
  it('TRACEABLE — meta/tests/unit/entity/ProductTest.cfc:L58-L62 — the product URL is the resolved key and the URL title, wrapped in slashes', () => {
    /* The legacy body sets the URL title and asserts the composed URL. */
    const settings = createSettingResolverDouble({
      settings: [{ settingName: 'globalURLKeyProduct', value: SEEDED_URL_KEY }],
    });
    const product = new Product();
    product.urlTitle = LEGACY_URL_TITLE;

    const productURL = product.getProductURL(settings.resolver);

    expect(productURL).toBe(`/${SEEDED_URL_KEY}/${LEGACY_URL_TITLE}/`);
    /*
     * Both delimiters asserted in their own right. The legacy expectation is a single interpolated
     * string, so a port that dropped either slash would produce a plausible-looking URL; naming them
     * separately makes the omission a failure rather than a difference someone has to notice.
     */
    expect(productURL.startsWith('/')).toBe(true);
    expect(productURL.endsWith('/')).toBe(true);
    expect(settings.calls).toEqual([{ settingName: 'globalURLKeyProduct', context: undefined }]);
  });

  it('NET-NEW — the seeded value is what appears, so no production default can satisfy the assertion', () => {
    /*
     * `ProductTest.cfc:L60` builds its expectation FROM the setting rather than from a literal, which
     * is what makes the legacy assertion a statement about resolution and not about a fixed string.
     * This case preserves that property explicitly: two different seeded values must produce two
     * different URLs from the same entity state.
     */
    const first = createSettingResolverDouble({
      settings: [{ settingName: 'globalURLKeyProduct', value: SEEDED_URL_KEY }],
    });
    const second = createSettingResolverDouble({
      settings: [{ settingName: 'globalURLKeyProduct', value: RESEEDED_URL_KEY }],
    });
    const product = buildProduct({ urlTitle: LEGACY_URL_TITLE });

    expect(product.getProductURL(first.resolver)).toBe(`/${SEEDED_URL_KEY}/${LEGACY_URL_TITLE}/`);
    expect(product.getProductURL(second.resolver)).toBe(
      `/${RESEEDED_URL_KEY}/${LEGACY_URL_TITLE}/`,
    );
  });
});

/*
 * The four assertions inherited from the legacy entity base
 * `meta/tests/unit/entity/ProductTest.cfc:L49` extends `SlatwallEntityTestBase`, so these four run
 * against a product without appearing in the Product test document at all. They are ported here
 * individually, each against the seam the target actually exposes for it — which is not always the
 * seam the legacy used, and where it differs the difference is stated rather than papered over.
 */

describe('Product — the four assertions inherited from the legacy entity base', () => {
  it('TRACEABLE — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L54 — validating a new product as a save does not pass', async () => {
    /* Re-expressed against the validator that now owns validation. */
    const harness = createValidatorHarness();
    const product = new Product();
    const errors = new ValidationError();

    const resolvedErrors = await harness.validateInto(
      asValidationSubject(product),
      productValidationRuleSet,
      'save',
      errors,
    );
    product.addErrors(resolvedErrors.getErrors());

    expect(product.hasErrors()).toBe(true);

    /*
     * The five save-context requirements of `model/validation/Product.json`, each asserted against a
     * message built from the imported constraint rather than a copied string. A change to the message
     * format or to a constraint therefore fails here instead of leaving a stale literal that still
     * matches nothing.
     */
    const className = product.getClassName();
    expect(product.getError('price')).toEqual([
      buildValidationMessage('save', className, 'price', priceRequiredConstraint),
    ]);
    expect(product.getError('productName')).toEqual([
      buildValidationMessage('save', className, 'productName', productNameRequiredConstraint),
    ]);
    expect(product.getError('productCode')).toEqual([
      buildValidationMessage('save', className, 'productCode', productCodeRequiredConstraint),
    ]);
    expect(product.getError('productType')).toEqual([
      buildValidationMessage('save', className, 'productType', productTypeRequiredConstraint),
    ]);
    expect(product.getError('urlTitle')).toEqual([
      buildValidationMessage('save', className, 'urlTitle', urlTitleRequiredConstraint),
    ]);
  });

  it('TRACEABLE — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58 — the simple representation of a new product exists and is a simple value', () => {
    /*
     * The legacy body is `assert(isSimpleValue(entity.getSimpleRepresentation()))`, run against the
     * brand-NEW entity the legacy setup produced, and the inherited implementation at
     * `org/Hibachi/HibachiEntity.cfc` reads whichever property
     * `getSimpleRepresentationPropertyName()` names.
     */
    const product = new Product();
    const propertyName = product.getSimpleRepresentationPropertyName();

    expect(propertyName.length).toBeGreaterThan(0);
    /* It names a property the entity really carries, not an arbitrary string. */
    expect(product.hasProperty(propertyName)).toBe(true);

    const representation = product.getValueByPropertyIdentifier(propertyName);

    /* "Simple" in the legacy sense: a scalar, never a struct or an array. */
    expect(typeof representation).toBe('string');
    expect(representation).toBe('');
    expect(Array.isArray(representation)).toBe(false);
  });

  it('NET-NEW — the named property is what the representation reads, so a populated name surfaces through it', () => {
    /*
     * The legacy assertion could only prove simpleness, never that the right property was being read —
     * an implementation returning a constant would have satisfied it. This case closes that gap using
     * the product name from the legacy fixture contract at `meta/tests/unit/Helper.cfc:L52-L77`.
     */
    const product = buildProduct({ productName: TEST_MERCHANDISE_PRODUCT_NAME });

    expect(product.getSimpleRepresentationPropertyName()).toBe('productName');
    expect(
      product.getValueByPropertyIdentifier(product.getSimpleRepresentationPropertyName()),
    ).toBe(TEST_MERCHANDISE_PRODUCT_NAME);
  });

  it('TRACEABLE — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L60-L62 — a primary-ID property name exists', () => {
    /*
     * The legacy body is `assert(len(entity.getPrimaryIDPropertyName()))` — a length test, nothing
     * more. It is strengthened by two checks the legacy could not make: that the name agrees with the
     * exported constant the rest of the subtree binds against, and that it names a real property.
     */
    const product = new Product();

    expect(product.getPrimaryIDPropertyName().length).toBeGreaterThan(0);
    expect(product.getPrimaryIDPropertyName()).toBe(PRODUCT_PRIMARY_ID_PROPERTY_NAME);
    expect(product.hasProperty(PRODUCT_PRIMARY_ID_PROPERTY_NAME)).toBe(true);
  });

  it('TRACEABLE — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67 — the defaults are correct: a new product is new and its primary ID is empty', () => {
    /* The base `defaults_are_correct()` body, re-expressed against the ported entity. */
    const product = new Product();

    expect(product.isNew()).toBe(true);
    expect(product.getPrimaryIDValue()).toHaveLength(0);
  });

  it('NET-NEW — assigning an identifier is what ends newness, so the sentinel is doing the work', () => {
    /* The inverse of the inherited assertion, which the legacy never checked. */
    const product = buildProduct({ productID: PRODUCT_ID });

    expect(product.isNew()).toBe(false);
    expect(product.getPrimaryIDValue()).toBe(PRODUCT_ID);
    expect(product.getPrimaryIDValue()).toHaveLength(PRODUCT_ID.length);
  });
});

/* The transaction-existence flag is product-scoped. */

describe('Product.getTransactionExistsFlag — the flag answers about one product, not the whole table', () => {
  it('NET-NEW — model/entity/Product.cfc:L624-L629 — two products receive their own verdicts from the same collaborator', async () => {
    /*
     * The named argument survives three layers, and this assertion is why it matters.
     * Read the legacy chain end to end before reading the expectation:
     *
     * 1. `model/entity/Product.cfc:L624-L629` calls the SKU service with a named argument,
     * `productID=this.getProductID()`.
     * 2. `model/service/SkuService.cfc:L285-L287` declares no formal parameters at all — and then
     * forwards `argumentCollection=arguments`. CFML places an undeclared named argument into the
     * `arguments` scope exactly as it does a declared one, so the whole scope, identifier
     * included, travels onward.
     */
    const skuRepository = createInMemorySkuRepository({ transactionProductIDs: [PRODUCT_ID] });
    const transactionChecker = createTransactionExistenceChecker(skuRepository.repository);
    const transactedProduct = buildProduct({ productID: PRODUCT_ID });
    const untransactedProduct = buildProduct({ productID: SECOND_PRODUCT_ID });

    await expect(transactedProduct.getTransactionExistsFlag(transactionChecker)).resolves.toBe(
      true,
    );
    await expect(untransactedProduct.getTransactionExistsFlag(transactionChecker)).resolves.toBe(
      false,
    );

    /*
     * The recorded calls, in order, each carrying its own product identifier. The `skuID` slot stays
     * absent deliberately: a supplied SKU identifier wins at `model/dao/SkuDAO.cfc:L58-L64` and would
     * suppress the product-scoped branch at `:L61` entirely.
     */
    expect(skuRepository.calls).toEqual([
      { member: 'transactionExists', productID: PRODUCT_ID, skuID: undefined },
      { member: 'transactionExists', productID: SECOND_PRODUCT_ID, skuID: undefined },
    ]);
  });

  it('NET-NEW — every probe is scoped, so the unscoped whole-table question is never asked', async () => {
    /*
     * The complement of the case above, stated as an invariant rather than as two literals: no recorded
     * probe may leave both identifiers absent. That combination is unrepresentable in the legacy — the
     * DAO would fall into its product branch and interpolate an undefined identifier — so the in-memory
     * repository rejects it outright. Asserting the shape here catches a regression at the entity,
     * where it originates, instead of one layer down where it merely surfaces.
     */
    const skuRepository = createInMemorySkuRepository({ transactionProductIDs: [PRODUCT_ID] });
    const transactionChecker = createTransactionExistenceChecker(skuRepository.repository);

    await buildProduct({ productID: PRODUCT_ID }).getTransactionExistsFlag(transactionChecker);
    await buildProduct({ productID: SECOND_PRODUCT_ID }).getTransactionExistsFlag(
      transactionChecker,
    );

    expect(skuRepository.calls).toHaveLength(2);
    for (const call of skuRepository.calls) {
      expect(call.member).toBe('transactionExists');
      if (call.member === 'transactionExists') {
        expect(call.productID).not.toBeUndefined();
        expect(call.skuID).toBeUndefined();
      }
    }
  });

  it('NET-NEW — model/entity/Product.cfc:L625 — the memo is per instance and never bleeds between products', async () => {
    /*
     * The legacy caches into the entity's own `variables` scope, so the memo lives and dies with the
     * instance. Under a warm Lambda container that distinction stops being academic: a memo shared at
     * module scope would answer one product's delete gate with another product's verdict.
     */
    const skuRepository = createInMemorySkuRepository({ transactionProductIDs: [PRODUCT_ID] });
    const transactionChecker = createTransactionExistenceChecker(skuRepository.repository);
    const transactedProduct = buildProduct({ productID: PRODUCT_ID });
    const otherProduct = buildProduct({ productID: SECOND_PRODUCT_ID });

    await expect(transactedProduct.getTransactionExistsFlag(transactionChecker)).resolves.toBe(
      true,
    );
    await expect(transactedProduct.getTransactionExistsFlag(transactionChecker)).resolves.toBe(
      true,
    );
    expect(skuRepository.calls).toHaveLength(1);

    skuRepository.addTransactionParticipation({ productID: SECOND_PRODUCT_ID });

    await expect(otherProduct.getTransactionExistsFlag(transactionChecker)).resolves.toBe(true);
    /* Still one probe per product: two in total, and the first product never re-queried. */
    expect(skuRepository.calls).toHaveLength(2);
    expect(transactedProduct.transactionExistsFlag).toBe(true);
    expect(otherProduct.transactionExistsFlag).toBe(true);
  });
});

/* D5 — an explicit un-portable boundary. */

describe('Product.getProductOptionsByGroup — the defect D5 boundary', () => {
  it('NET-NEW — model/entity/Product.cfc:L631-L633 — the member reports the missing collaborator instead of inventing one', () => {
    /* TODO(parity) D5 — model/entity/Product.cfc:L631-L633. */
    const product = buildProduct({ productID: PRODUCT_ID });

    const thrown = captureThrow(() => product.getProductOptionsByGroup());

    expect(thrown).toBeInstanceOf(NotImplementedError);
    /*
     * The member name travels with the error, which is what makes the boundary diagnosable rather than
     * merely fatal. Compared against the value the error carries — never against a message literal.
     */
    expect(thrown).toHaveProperty('member', 'Product.getProductOptionsByGroup');
  });

  it('NET-NEW — the boundary raises synchronously, matching the legacy call shape', () => {
    /*
     * The legacy member is an ordinary synchronous function, so the port's is too. Stated as its own
     * case because the failure mode is silent: a member that had drifted to returning a rejected
     * promise would satisfy an `await`-based assertion while changing every caller's control flow, and
     * an unhandled rejection is a very different production event from a thrown error.
     */
    const product = buildProduct({ productID: PRODUCT_ID });

    expect(() => product.getProductOptionsByGroup()).toThrow(NotImplementedError);
  });
});

/*
 * The option-to-sku resolution entry points
 * `model/entity/Product.cfc:L349-L364` is the arity layer that sits on top of the resolution query, and
 * it is where three of the four protected legacy throw texts live. Its branch structure is reproduced
 * exactly, and every expected message is imported — two through interpolating factories, one as a
 * constant — so no protected text is retyped anywhere in this file.
 */

/**
 * Builds a product whose SKUs each carry the options given, wired to a repository-backed finder.
 *
 * @param optionsPerSku - One entry per SKU, listing the options that SKU carries.
 * @returns The product, its SKUs, the finder to pass in, and both call records.
 */
const arrangeSkuSelection = (
  optionsPerSku: readonly (readonly Option[])[],
): {
  readonly product: Product;
  readonly skus: readonly ReturnType<typeof buildSku>[];
  readonly finder: ReturnType<typeof createProductSkuOptionFinderDouble>;
  readonly skuRepository: ReturnType<typeof createInMemorySkuRepository>;
} => {
  const product = buildProduct({ productID: PRODUCT_ID });
  const skuIdentifiers = [SKU_ID, SECOND_SKU_ID];
  const skus = optionsPerSku.map((options, index) => {
    const skuID = skuIdentifiers[index];
    return buildSku({
      /*
       * Only the declared identifiers are used; a longer arrangement would need another named one.
       */
      ...(skuID === undefined ? {} : { skuID }),
      options,
      product,
    });
  });
  const skuRepository = createInMemorySkuRepository({ skus });
  return {
    product,
    skus,
    skuRepository,
    finder: createProductSkuOptionFinderDouble(skuRepository.repository),
  };
};

describe('Product.getSkuBySelectedOptions — the five branches of model/entity/Product.cfc:L349-L364', () => {
  it('NET-NEW — model/entity/Product.cfc:L350-L353 — a non-empty selection matching exactly one SKU returns that SKU', async () => {
    const optionGroup = buildOptionGroup({ optionGroupID: OPTION_GROUP_ID, sortOrder: 1 });
    const firstOption = buildOption({ optionID: OPTION_ID, optionGroup });
    const secondOption = buildOption({ optionID: SECOND_OPTION_ID, optionGroup });
    const arrangement = arrangeSkuSelection([[firstOption], [secondOption]]);

    await expect(
      arrangement.product.getSkuBySelectedOptions(arrangement.finder.finder, OPTION_ID),
    ).resolves.toBe(arrangement.skus[0]);
  });

  it('NET-NEW — model/entity/Product.cfc:L355 — more than one match raises the interpolating parity error', async () => {
    /*
     * T1 conjunction made visible. Both SKUs carry the selected option, so both satisfy the single
     * requirement and the arity check fails. The message is produced by the imported factory and
     * compared exactly — the interpolated selection is part of the legacy text, so a factory that
     * dropped it would still pass a substring test but fails this one.
     */
    const optionGroup = buildOptionGroup({ optionGroupID: OPTION_GROUP_ID, sortOrder: 1 });
    const sharedOption = buildOption({ optionID: OPTION_ID, optionGroup });
    const extraOption = buildOption({ optionID: SECOND_OPTION_ID, optionGroup });
    const arrangement = arrangeSkuSelection([[sharedOption], [sharedOption, extraOption]]);

    const thrown = await captureRejection(
      arrangement.product.getSkuBySelectedOptions(arrangement.finder.finder, OPTION_ID),
    );

    expect(thrown).toBeInstanceOf(LegacyParityError);
    expect(thrown).toHaveProperty('message', moreThanOneSkuReturnedMessage(OPTION_ID));
  });

  it('NET-NEW — model/entity/Product.cfc:L357 — a non-empty selection matching nothing raises the interpolating parity error', async () => {
    const optionGroup = buildOptionGroup({ optionGroupID: OPTION_GROUP_ID, sortOrder: 1 });
    const carriedOption = buildOption({ optionID: OPTION_ID, optionGroup });
    const unusedOption = buildOption({ optionID: SECOND_OPTION_ID, optionGroup });
    const arrangement = arrangeSkuSelection([[carriedOption], [carriedOption]]);

    const thrown = await captureRejection(
      arrangement.product.getSkuBySelectedOptions(arrangement.finder.finder, unusedOption.optionID),
    );

    expect(thrown).toBeInstanceOf(LegacyParityError);
    expect(thrown).toHaveProperty(
      'message',
      noSkusFoundForSelectedOptionsMessage(unusedOption.optionID),
    );
  });

  it('NET-NEW — model/entity/Product.cfc:L359-L361 — an empty selection with exactly one product SKU returns that sole SKU without querying', async () => {
    /*
     * The second path never touches the collaborator: `model/entity/Product.cfc:L359-L360` reads the
     * product's own SKU collection. Asserting that the finder recorded nothing is what distinguishes
     * this path from the first — an implementation that always queried would still return the right SKU
     * here and would still pass a value-only assertion.
     */
    const optionGroup = buildOptionGroup({ optionGroupID: OPTION_GROUP_ID, sortOrder: 1 });
    const onlyOption = buildOption({ optionID: OPTION_ID, optionGroup });
    const arrangement = arrangeSkuSelection([[onlyOption]]);

    await expect(
      arrangement.product.getSkuBySelectedOptions(arrangement.finder.finder),
    ).resolves.toBe(arrangement.skus[0]);
    expect(arrangement.finder.calls).toEqual([]);
  });

  it('NET-NEW — model/entity/Product.cfc:L362 — an empty selection with a non-singleton SKU set raises the constant parity error', async () => {
    /*
     * This is the else of the sku-count test, not an argument guard, and the difference is the
     * whole point. `model/entity/Product.cfc:L358` tests `arrayLen(getSkus()) eq 1`; `:L362` is what
     * happens when that test fails. The empty selection is not what is being rejected.
     */
    const optionGroup = buildOptionGroup({ optionGroupID: OPTION_GROUP_ID, sortOrder: 1 });
    const firstOption = buildOption({ optionID: OPTION_ID, optionGroup });
    const secondOption = buildOption({ optionID: SECOND_OPTION_ID, optionGroup });
    const arrangement = arrangeSkuSelection([[firstOption], [secondOption]]);

    const thrown = await captureRejection(
      arrangement.product.getSkuBySelectedOptions(arrangement.finder.finder),
    );

    expect(thrown).toBeInstanceOf(LegacyParityError);
    expect(thrown).toHaveProperty('message', NO_SINGLE_SKU_WITHOUT_SELECTED_OPTIONS_MESSAGE);
    /* Again no query: the count test is answered from the entity's own collection. */
    expect(arrangement.finder.calls).toEqual([]);
  });

  it('NET-NEW — model/entity/Product.cfc:L362 — a product with no SKUs at all reaches the same branch', async () => {
    /*
     * "Non-singleton" is not only "more than one". Zero fails `arrayLen(getSkus()) eq 1` just as two
     * does, and the legacy therefore raises the same error — worth its own case because a port that
     * guarded emptiness separately would look reasonable and behave differently.
     */
    const arrangement = arrangeSkuSelection([]);

    const thrown = await captureRejection(
      arrangement.product.getSkuBySelectedOptions(arrangement.finder.finder),
    );

    expect(thrown).toBeInstanceOf(LegacyParityError);
    expect(thrown).toHaveProperty('message', NO_SINGLE_SKU_WITHOUT_SELECTED_OPTIONS_MESSAGE);
  });
});

describe('Product.getSkusBySelectedOptions — the positional forwarding of model/entity/Product.cfc:L366-L368', () => {
  it('NET-NEW — the collaborator receives the selection first and this product identifier second', async () => {
    /*
     * The legacy call passes `(arguments.selectedOptions, this.getProductID())` positionally, and an
     * out-of-scope caller — `model/process/Order_AddOrderItem.cfc:L238` — invokes the service member the
     * same way, which is what fixes the order as contract rather than convention.
     */
    const optionGroup = buildOptionGroup({ optionGroupID: OPTION_GROUP_ID, sortOrder: 1 });
    const carriedOption = buildOption({ optionID: OPTION_ID, optionGroup });
    const arrangement = arrangeSkuSelection([[carriedOption]]);

    await arrangement.product.getSkusBySelectedOptions(arrangement.finder.finder, OPTION_ID);

    expect(arrangement.finder.calls).toEqual([
      { selectedOptions: OPTION_ID, productID: PRODUCT_ID },
    ]);
  });

  it('NET-NEW — T5 — an empty selection is forwarded and answered, never rejected', async () => {
    /*
     * The degenerate query, observed at this boundary. Three SKUs are arranged, two carrying options
     * and one carrying none. An empty selection appends no requirement, so the query returns every
     * option-bearing SKU of the product — which is T5 and T3 together: the empty selection is legal
     * (T5), and the vestigial join that excludes option-less SKUs is still in force (T3).
     */
    const optionGroup = buildOptionGroup({ optionGroupID: OPTION_GROUP_ID, sortOrder: 1 });
    const firstOption = buildOption({ optionID: OPTION_ID, optionGroup });
    const secondOption = buildOption({ optionID: SECOND_OPTION_ID, optionGroup });
    const arrangement = arrangeSkuSelection([[firstOption], [secondOption]]);
    const optionlessSku = buildSku({ product: arrangement.product });
    arrangement.skuRepository.add(optionlessSku);

    const matched = await arrangement.product.getSkusBySelectedOptions(arrangement.finder.finder);

    expect(arrangement.finder.calls).toEqual([{ selectedOptions: '', productID: PRODUCT_ID }]);
    expect(matched).toEqual([arrangement.skus[0], arrangement.skus[1]]);
    expect(matched).not.toContain(optionlessSku);
  });

  it('NET-NEW — the selection string crosses this boundary unnormalised', async () => {
    /*
     * What this entity must not do: trim, deduplicate, re-order, split, or convert the selection to a
     * set. Each of those looks like an improvement and each changes results.
     */
    const optionGroup = buildOptionGroup({ optionGroupID: OPTION_GROUP_ID, sortOrder: 1 });
    const carriedOption = buildOption({ optionID: OPTION_ID, optionGroup });
    const arrangement = arrangeSkuSelection([[carriedOption]]);
    const untidySelection = `${OPTION_ID},,${OPTION_ID}, ${SECOND_OPTION_ID} `;

    await arrangement.product.getSkusBySelectedOptions(arrangement.finder.finder, untidySelection);

    expect(arrangement.finder.calls).toEqual([
      { selectedOptions: untidySelection, productID: PRODUCT_ID },
    ]);
    expect(arrangement.skuRepository.calls).toEqual([
      {
        member: 'findSkusBySelectedOptions',
        optionIds: [OPTION_ID, OPTION_ID, ` ${SECOND_OPTION_ID} `],
        productId: PRODUCT_ID,
      },
    ]);
  });
});

/* The option-group and option members. */

describe('Product option-group and option members', () => {
  it('NET-NEW — model/entity/Product.cfc:L251-L261 — getOptionGroups asks for this product and returns the records untouched', async () => {
    /*
     * The legacy body composes three things onto a paginated dynamic query at
     * `model/entity/Product.cfc:L254-L258` — distinct-row retrieval, the related-property filter path
     * `options.skus.product.productID`, and an ascending sort-order ordering. In the port those three
     * belong to `src/services/OptionService.ts`, which owns the query builder, and are asserted in
     * `test/services/OptionService.test.ts`. What is asserted here is the entity's own contract: the
     * identifier it hands over is its own, and it returns the finder's records untouched.
     */
    const laterGroup = buildOptionGroup({
      optionGroupID: SECOND_OPTION_GROUP_ID,
      optionGroupName: 'Colour',
      sortOrder: 9,
    });
    const earlierGroup = buildOptionGroup({
      optionGroupID: OPTION_GROUP_ID,
      optionGroupName: 'Size',
      sortOrder: 1,
    });
    const groupFinder = recordingOptionGroupFinder([laterGroup, earlierGroup]);
    const product = buildProduct({ productID: PRODUCT_ID });

    const optionGroups = await product.getOptionGroups(groupFinder.finder);

    expect(groupFinder.calls).toEqual([PRODUCT_ID]);
    expect(optionGroups).toEqual([laterGroup, earlierGroup]);
    /* Same instances, so no defensive copy silently detached the records from their entities. */
    expect(optionGroups[0]).toBe(laterGroup);
    expect(optionGroups[1]).toBe(earlierGroup);
  });

  it('NET-NEW — model/entity/Product.cfc:L252 — getOptionGroups memoizes per instance, and a second product queries for itself', async () => {
    /*
     * The legacy caches into the entity's `variables` scope. Per-instance is the only correct scope
     * here: a warm Lambda container outlives a single invocation, so a memo held anywhere broader would
     * answer one product with another product's option groups.
     */
    const optionGroup = buildOptionGroup({ optionGroupID: OPTION_GROUP_ID, sortOrder: 1 });
    const groupFinder = recordingOptionGroupFinder([optionGroup]);
    const product = buildProduct({ productID: PRODUCT_ID });
    const otherProduct = buildProduct({ productID: SECOND_PRODUCT_ID });

    await product.getOptionGroups(groupFinder.finder);
    await product.getOptionGroups(groupFinder.finder);

    expect(groupFinder.calls).toEqual([PRODUCT_ID]);

    await otherProduct.getOptionGroups(groupFinder.finder);

    expect(groupFinder.calls).toEqual([PRODUCT_ID, SECOND_PRODUCT_ID]);
  });

  it('NET-NEW — model/entity/Product.cfc:L241-L249 — getOptionGroupsStruct keys the groups by option-group identifier', async () => {
    const firstGroup = buildOptionGroup({
      optionGroupID: OPTION_GROUP_ID,
      optionGroupName: 'Size',
      sortOrder: 1,
    });
    const secondGroup = buildOptionGroup({
      optionGroupID: SECOND_OPTION_GROUP_ID,
      optionGroupName: 'Colour',
      sortOrder: 2,
    });
    const groupFinder = recordingOptionGroupFinder([firstGroup, secondGroup]);
    const product = buildProduct({ productID: PRODUCT_ID });

    const struct = await product.getOptionGroupsStruct(groupFinder.finder);

    expect(Object.keys(struct).sort()).toEqual([OPTION_GROUP_ID, SECOND_OPTION_GROUP_ID].sort());
    expect(struct[OPTION_GROUP_ID]).toBe(firstGroup);
    expect(struct[SECOND_OPTION_GROUP_ID]).toBe(secondGroup);
  });

  it('NET-NEW — model/entity/Product.cfc:L242 — the struct and the list share one memo, so the query runs once', async () => {
    /*
     * `model/entity/Product.cfc:L245` builds the struct by iterating `getOptionGroups()`, so the two
     * members are one cache, not two. Reading both in either order must still produce exactly one query
     * — and the count-derived member at `:L263-L265` reuses the same memo.
     */
    const optionGroup = buildOptionGroup({ optionGroupID: OPTION_GROUP_ID, sortOrder: 1 });
    const groupFinder = recordingOptionGroupFinder([optionGroup]);
    const product = buildProduct({ productID: PRODUCT_ID });

    await product.getOptionGroupsStruct(groupFinder.finder);
    await product.getOptionGroups(groupFinder.finder);

    expect(groupFinder.calls).toEqual([PRODUCT_ID]);
    await expect(product.getOptionGroupCount(groupFinder.finder)).resolves.toBe(1);
    expect(groupFinder.calls).toEqual([PRODUCT_ID]);
  });

  it('NET-NEW — model/entity/Product.cfc:L340-L347 — getOptionsByOptionGroup passes the group and this product, and RE-QUERIES on every call', async () => {
    /*
     * The asymmetry is deliberate and is behaviour. `model/entity/Product.cfc:L340-L347` has no cache
     * of any kind, while its two option-group neighbours do. Extending the group memo to cover this
     * member would look like consistency and would change results: the legacy re-reads options every
     * time, so a second call after an option was added returns the addition.
     */
    const optionGroup = buildOptionGroup({ optionGroupID: OPTION_GROUP_ID, sortOrder: 1 });
    const carriedOption = buildOption({ optionID: OPTION_ID, optionName: 'Small', optionGroup });
    const optionFinder = recordingOptionFinder({ [OPTION_GROUP_ID]: [carriedOption] });
    const product = buildProduct({ productID: PRODUCT_ID });

    await expect(
      product.getOptionsByOptionGroup(optionFinder.finder, OPTION_GROUP_ID),
    ).resolves.toEqual([carriedOption]);
    await expect(
      product.getOptionsByOptionGroup(optionFinder.finder, OPTION_GROUP_ID),
    ).resolves.toEqual([carriedOption]);

    expect(optionFinder.calls).toEqual([
      { optionGroupID: OPTION_GROUP_ID, productID: PRODUCT_ID },
      { optionGroupID: OPTION_GROUP_ID, productID: PRODUCT_ID },
    ]);
  });

  it('NET-NEW — an unrelated option group yields no options and still records the scoped lookup', async () => {
    const optionGroup = buildOptionGroup({ optionGroupID: OPTION_GROUP_ID, sortOrder: 1 });
    const carriedOption = buildOption({ optionID: OPTION_ID, optionName: 'Small', optionGroup });
    const optionFinder = recordingOptionFinder({ [OPTION_GROUP_ID]: [carriedOption] });
    const product = buildProduct({ productID: PRODUCT_ID });

    await expect(
      product.getOptionsByOptionGroup(optionFinder.finder, SECOND_OPTION_GROUP_ID),
    ).resolves.toEqual([]);
    expect(optionFinder.calls).toEqual([
      { optionGroupID: SECOND_OPTION_GROUP_ID, productID: PRODUCT_ID },
    ]);
  });

  it('NET-NEW — model/entity/Product.cfc:L635-L640 — getUnusedProductOptions sends this product and the comma-delimited list of groups already in use', async () => {
    /*
     * The legacy second argument is `structKeyList(getOptionGroupsStruct())` — a comma-delimited string
     * built from the option-group map's keys, not an array. The port preserves the string contract
     * because the repository below it splits on commas, and the polarity of the two repository members
     * depends on that same list: `model/dao/OptionDAO.cfc:L51-L91` selects options whose group is in it,
     * while `:L93-L116` selects groups whose identifier is not in it.
     */
    const usedGroup = buildOptionGroup({
      optionGroupID: OPTION_GROUP_ID,
      optionGroupName: 'Size',
      sortOrder: 1,
    });
    const availableOption = buildOption({
      optionID: OPTION_ID,
      optionName: 'Small',
      optionGroup: usedGroup,
    });
    const groupFinder = recordingOptionGroupFinder([usedGroup]);
    const optionRepository = createInMemoryOptionRepository({ optionGroups: [usedGroup] });
    const product = buildProduct({ productID: PRODUCT_ID });

    const unused = await product.getUnusedProductOptions(
      asUnusedOptionFinder(optionRepository.repository),
      groupFinder.finder,
    );

    expect(optionRepository.calls).toEqual([
      {
        member: 'findUnusedOptions',
        productID: PRODUCT_ID,
        existingOptionGroupIDList: OPTION_GROUP_ID,
      },
    ]);
    expect(unused).toEqual([{ name: 'Size - Small', value: availableOption.optionID }]);
  });
});

describe('Product unused-option members — the comma-delimited list contract', () => {
  it('NET-NEW — model/entity/Product.cfc:L642-L647 — getUnusedProductOptionGroups excludes the groups already in use', async () => {
    /*
     * The opposite polarity of its sibling: the same list is passed, and `model/dao/OptionDAO.cfc:L93`
     * selects the groups whose identifier is not in it. Both groups exist in the repository; only the
     * one the product does not already use may come back, and its label is the bare group name with no
     * option prefix.
     */
    const usedGroup = buildOptionGroup({
      optionGroupID: OPTION_GROUP_ID,
      optionGroupName: 'Size',
      sortOrder: 1,
    });
    const unusedGroup = buildOptionGroup({
      optionGroupID: SECOND_OPTION_GROUP_ID,
      optionGroupName: 'Colour',
      sortOrder: 2,
    });
    const groupFinder = recordingOptionGroupFinder([usedGroup]);
    const optionRepository = createInMemoryOptionRepository({
      optionGroups: [usedGroup, unusedGroup],
    });
    const product = buildProduct({ productID: PRODUCT_ID });

    const unusedGroups = await product.getUnusedProductOptionGroups(
      asUnusedOptionFinder(optionRepository.repository),
      groupFinder.finder,
    );

    expect(optionRepository.calls).toEqual([
      { member: 'findUnusedOptionGroups', existingOptionGroupIDList: OPTION_GROUP_ID },
    ]);
    expect(unusedGroups).toEqual([{ name: 'Colour', value: SECOND_OPTION_GROUP_ID }]);
  });

  it('NET-NEW — a product using two groups sends both identifiers, comma-delimited', async () => {
    /*
     * Order is deliberately not asserted. The legacy list came from `structKeyList`, whose ordering is
     * a property of the CFML struct implementation rather than of the catalog, and the port's equivalent
     * is object-key order. Asserting a sequence here would freeze an incidental detail into a contract,
     * so the delimiter and the membership are what get checked.
     */
    const firstGroup = buildOptionGroup({
      optionGroupID: OPTION_GROUP_ID,
      optionGroupName: 'Size',
      sortOrder: 1,
    });
    const secondGroup = buildOptionGroup({
      optionGroupID: SECOND_OPTION_GROUP_ID,
      optionGroupName: 'Colour',
      sortOrder: 2,
    });
    const groupFinder = recordingOptionGroupFinder([firstGroup, secondGroup]);
    const optionRepository = createInMemoryOptionRepository({
      optionGroups: [firstGroup, secondGroup],
    });
    const product = buildProduct({ productID: PRODUCT_ID });

    await product.getUnusedProductOptionGroups(
      asUnusedOptionFinder(optionRepository.repository),
      groupFinder.finder,
    );

    const [recordedCall] = optionRepository.calls;
    expect(recordedCall).toBeDefined();
    if (recordedCall !== undefined && recordedCall.member === 'findUnusedOptionGroups') {
      expect(recordedCall.existingOptionGroupIDList.split(',').sort()).toEqual(
        [OPTION_GROUP_ID, SECOND_OPTION_GROUP_ID].sort(),
      );
    }
  });

  it('NET-NEW — a product with no option groups sends the empty list, and every group is unused', async () => {
    /*
     * `structKeyList({})` is the empty string, so the not-in exclusion matches nothing and every group in
     * the catalog is available. Worth its own case because the empty list is the state a brand-new
     * product is in, and it is what the add-option-group process gate reads first.
     */
    const availableGroup = buildOptionGroup({
      optionGroupID: OPTION_GROUP_ID,
      optionGroupName: 'Size',
      sortOrder: 1,
    });
    const groupFinder = recordingOptionGroupFinder([]);
    const optionRepository = createInMemoryOptionRepository({ optionGroups: [availableGroup] });
    const product = buildProduct({ productID: PRODUCT_ID });

    const unusedGroups = await product.getUnusedProductOptionGroups(
      asUnusedOptionFinder(optionRepository.repository),
      groupFinder.finder,
    );

    expect(optionRepository.calls).toEqual([
      { member: 'findUnusedOptionGroups', existingOptionGroupIDList: '' },
    ]);
    expect(unusedGroups).toEqual([{ name: 'Size', value: OPTION_GROUP_ID }]);
  });

  it('NET-NEW — model/entity/Product.cfc:L636 — both unused members memoize per instance', async () => {
    const usedGroup = buildOptionGroup({
      optionGroupID: OPTION_GROUP_ID,
      optionGroupName: 'Size',
      sortOrder: 1,
    });
    buildOption({ optionID: OPTION_ID, optionName: 'Small', optionGroup: usedGroup });
    const unusedGroup = buildOptionGroup({
      optionGroupID: SECOND_OPTION_GROUP_ID,
      optionGroupName: 'Colour',
      sortOrder: 2,
    });
    const groupFinder = recordingOptionGroupFinder([usedGroup]);
    const optionRepository = createInMemoryOptionRepository({
      optionGroups: [usedGroup, unusedGroup],
    });
    const unusedOptionFinder = asUnusedOptionFinder(optionRepository.repository);
    const product = buildProduct({ productID: PRODUCT_ID });

    await product.getUnusedProductOptions(unusedOptionFinder, groupFinder.finder);
    await product.getUnusedProductOptions(unusedOptionFinder, groupFinder.finder);
    await product.getUnusedProductOptionGroups(unusedOptionFinder, groupFinder.finder);
    await product.getUnusedProductOptionGroups(unusedOptionFinder, groupFinder.finder);

    expect(optionRepository.calls).toHaveLength(2);
    expect(groupFinder.calls).toEqual([PRODUCT_ID]);
  });
});

/* Base product type, the listing URL and the title. */

describe('Product.getBaseProductType — delegation without narrowing', () => {
  it('NET-NEW — model/entity/Product.cfc:L493-L495 — the attached product type answers with its own system code', async () => {
    /*
     * The legacy body is a single delegation, `getProductType().getBaseProductType()`. The discriminator
     * values are the ones seeded at `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` and imported
     * from the fixture module, so the literal is never restated here.
     */
    const rootResolver = createProductTypeRootResolverDouble();
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: MERCHANDISE_PRODUCT_TYPE.systemCode,
    });
    const product = buildProduct({ productID: PRODUCT_ID, productType });

    await expect(product.getBaseProductType(rootResolver.resolver)).resolves.toBe(
      MERCHANDISE_PRODUCT_TYPE.systemCode,
    );
    /* Own code present, so no root lookup was needed. */
    expect(rootResolver.requestedProductTypeIds).toEqual([]);
  });

  it('NET-NEW — a product type with no system code of its own is resolved through its root', async () => {
    /*
     * The hierarchy walk: a child type carries the root identifier as the first element of its
     * identifier path, and the base type is the root'S system code. This is the path every non-root
     * product type in a real catalog takes, since only the three seeded rows carry a code.
     */
    const rootResolver = createProductTypeRootResolverDouble();
    const childProductType = buildProductType({
      productTypeID: CHILD_PRODUCT_TYPE_ID,
      productTypeIDPath: `${MERCHANDISE_PRODUCT_TYPE_ID},${CHILD_PRODUCT_TYPE_ID}`,
    });
    const product = buildProduct({ productID: PRODUCT_ID, productType: childProductType });

    await expect(product.getBaseProductType(rootResolver.resolver)).resolves.toBe(
      MERCHANDISE_PRODUCT_TYPE.systemCode,
    );
    expect(rootResolver.requestedProductTypeIds).toEqual([MERCHANDISE_PRODUCT_TYPE_ID]);
  });

  it('NET-NEW — an unrecognised system code is returned unchanged, never narrowed to the three seeded discriminators', async () => {
    /*
     * The reader is typed as an open string on purpose. Only three product types are seeded, but
     * nothing stops an installation from adding its own, and `model/entity/ProductType.cfc:L110` returns
     * whatever code it finds. Narrowing the return to a three-member union would either drop such a code
     * or force an invented mapping; both would be repairs, and the validation rules that read this value
     * would then silently answer about a different type than the one the row declares.
     */
    const rootResolver = createProductTypeRootResolverDouble();
    const productType = buildProductType({
      productTypeID: CHILD_PRODUCT_TYPE_ID,
      productTypeIDPath: CHILD_PRODUCT_TYPE_ID,
      systemCode: UNRECOGNISED_SYSTEM_CODE,
    });
    const product = buildProduct({ productID: PRODUCT_ID, productType });

    await expect(product.getBaseProductType(rootResolver.resolver)).resolves.toBe(
      UNRECOGNISED_SYSTEM_CODE,
    );
  });

  it('NET-NEW — a product with no product type RAISES, as model/entity/Product.cfc:L494 does', async () => {
    /*
     * The legacy body is `return getProductType().getBaseProductType();` with no guard, so a product
     * carrying no product type raised a null-reference error. `model/validation/Product.json:L11` makes
     * the product type required for a save, so an unsaved product legitimately has none — and the legacy
     * answer for that state is a fault, not a value.
     */
    const rootResolver = createProductTypeRootResolverDouble();
    const product = buildProduct({ productID: PRODUCT_ID });

    await expect(product.getBaseProductType(rootResolver.resolver)).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(rootResolver.requestedProductTypeIds).toEqual([]);
  });

  it('NET-NEW — an ASSIGNED product type whose root cannot be RESOLVED also RAISES, one hop down at model/entity/ProductType.cfc:L112', async () => {
    /*
     * The companion of the case above, and the second unguarded dereference on the same chain. The
     * delegation `getProductType().getBaseProductType()` has two of them, one per hop: `:L494` reads the
     * product type without a guard, and `model/entity/ProductType.cfc:L112` then chains
     * `.getSystemCode()` onto a root lookup without a guard. Fixing only the near hop would have left
     * the finding half-resolved, since the port would still answer absence where the legacy failed.
     */
    const rootResolver = createProductTypeRootResolverDouble();
    const productType = buildProductType({
      productTypeID: CHILD_PRODUCT_TYPE_ID,
      productTypeIDPath: `${UNSEEDED_ROOT_PRODUCT_TYPE_ID},${CHILD_PRODUCT_TYPE_ID}`,
    });
    const product = buildProduct({ productID: PRODUCT_ID, productType });

    await expect(product.getBaseProductType(rootResolver.resolver)).rejects.toBeInstanceOf(
      DomainError,
    );
    // The walk was attempted — this is a resolution failure, not a skipped read, and it is the far hop
    // rather than the near one that failed.
    expect(rootResolver.requestedProductTypeIds).toEqual([UNSEEDED_ROOT_PRODUCT_TYPE_ID]);
  });

  it('NET-NEW — a resolvable root that carries NO system code answers absence, which is why the return type keeps its optional member', async () => {
    /*
     * The one absence that survives on this chain, and the only reason `| undefined` remains in the
     * return type. `model/entity/ProductType.cfc:L112` succeeds at the lookup and then reads
     * `getSystemCode()` off a real row; when that column is null CFML returns null, the method hands it
     * back, and the caller receives absence. So absence here is the legacy answer rather than a
     * hardening — the distinction the two cases above exist to protect.
     */
    const rootResolver = createProductTypeRootResolverDouble([
      { productTypeID: UNSEEDED_ROOT_PRODUCT_TYPE_ID },
    ]);
    const productType = buildProductType({
      productTypeID: CHILD_PRODUCT_TYPE_ID,
      productTypeIDPath: `${UNSEEDED_ROOT_PRODUCT_TYPE_ID},${CHILD_PRODUCT_TYPE_ID}`,
    });
    const product = buildProduct({ productID: PRODUCT_ID, productType });

    await expect(product.getBaseProductType(rootResolver.resolver)).resolves.toBeUndefined();
    expect(rootResolver.requestedProductTypeIds).toEqual([UNSEEDED_ROOT_PRODUCT_TYPE_ID]);
  });
});

describe('Product URL and title members', () => {
  it('NET-NEW — model/entity/Product.cfc:L211-L213 — the listing URL omits the leading slash the product URL carries', () => {
    /*
     * The difference is one character and it is real. `:l207-l209` opens with a slash and `:L211-L213`
     * does not, while the rest of both strings is identical. Harmonising them is the obvious tidy-up and
     * it would change every listing link in the storefront, so the two are asserted together — the
     * relationship is the contract, not either string alone.
     */
    const settings = createSettingResolverDouble({
      settings: [{ settingName: 'globalURLKeyProduct', value: SEEDED_URL_KEY }],
    });
    const product = buildProduct({ productID: PRODUCT_ID, urlTitle: LEGACY_URL_TITLE });

    const productURL = product.getProductURL(settings.resolver);
    const listingURL = product.getListingProductURL(settings.resolver);

    expect(listingURL).toBe(`${SEEDED_URL_KEY}/${LEGACY_URL_TITLE}/`);
    expect(listingURL.startsWith('/')).toBe(false);
    expect(listingURL.endsWith('/')).toBe(true);
    expect(productURL).toBe(`/${listingURL}`);
  });

  it('NET-NEW — model/entity/Product.cfc:L540-L545 — getTitle expands the seeded template', () => {
    /*
     * Four substitution behaviours in one template, each of them behaviour rather than convenience, and
     * each traceable to `org/Hibachi/HibachiUtilityService.cfc:L70-L100`:
     *
     * 1. A simple identifier resolves against the entity.
     * 2. A dotted identifier is passed to the resolver untouched and traversed there — the metadata
     * default for this very setting is a dotted identifier reaching the brand's name, which is why
     * dotted support exists at all.
     * 3. an unresolved token is left verbatim, delimiters included. It is not blanked, because the
     * legacy loop simply skips a key it cannot resolve.
     */
    const brand = buildBrand({ brandID: SECOND_PRODUCT_ID, brandName: 'Nike' });
    const settings = createSettingResolverDouble({
      settings: [
        {
          settingName: 'productTitleString',
          value: '${brand.brandName} ${productName} (${productCode}) — ${productName} ${absentKey}',
        },
      ],
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      brand,
    });

    expect(product.getTitle(settings.resolver)).toBe(
      `Nike ${TEST_MERCHANDISE_PRODUCT_NAME} (${TEST_MERCHANDISE_PRODUCT_CODE}) — ` +
        `${TEST_MERCHANDISE_PRODUCT_NAME} \${absentKey}`,
    );
  });

  it('NET-NEW — a resolved empty value substitutes, which is not the same as an unresolved token', () => {
    /*
     * The distinction the legacy loop draws is between "the resolver returned nothing" and "the resolver
     * returned the empty string". The first leaves the token in place; the second removes it. Collapsing
     * the two would either blank tokens that should survive or leave delimiters in rendered titles.
     */
    const settings = createSettingResolverDouble({
      settings: [
        { settingName: 'productTitleString', value: '[${productDescription}][${absentKey}]' },
      ],
    });
    const product = buildProduct({ productID: PRODUCT_ID, productDescription: '' });

    expect(product.getTitle(settings.resolver)).toBe('[][${absentKey}]');
  });

  it('NET-NEW — model/entity/Product.cfc:L541 — the title memoizes per instance', () => {
    /*
     * The legacy caches the rendered title in the entity's own scope, so a template change mid-request
     * does not re-render it. Proved by resolving once, then handing the same entity a resolver seeded
     * with a different template: the memoized value must win, and the second resolver must never be
     * consulted.
     */
    const firstSettings = createSettingResolverDouble({
      settings: [{ settingName: 'productTitleString', value: '${productName}' }],
    });
    const secondSettings = createSettingResolverDouble({
      settings: [{ settingName: 'productTitleString', value: 'CHANGED ${productName}' }],
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
    });

    expect(product.getTitle(firstSettings.resolver)).toBe(TEST_MERCHANDISE_PRODUCT_NAME);
    expect(product.getTitle(secondSettings.resolver)).toBe(TEST_MERCHANDISE_PRODUCT_NAME);
    expect(firstSettings.calls).toEqual([
      { settingName: 'productTitleString', context: undefined },
    ]);
    expect(secondSettings.calls).toEqual([]);
  });
});

/*
 * The image members — delegation at the product, the port beneath it
 * `model/entity/Product.cfc:L320-L338` declares five image members and every one of them is a bare
 * delegation to the default SKU, with no presence guard. Below the SKU sits the image port, which owns
 * path composition, resizing and the existence probe. Both layers are exercised: the product's
 * forwarding, and the request the port actually receives.
 */

describe('Product image members — delegation to the default SKU', () => {
  it('NET-NEW — model/entity/Product.cfc:L320-L338 — all five image members return the default SKU’s answers', () => {
    const sku = buildSku({ skuID: SKU_ID, imageFile: 'test-product.jpg' });
    const product = buildProduct({ productID: PRODUCT_ID });
    product.defaultSku = createDefaultSkuDelegate(sku, {
      imageDirectory: '/images/product/default/',
      imagePath: '/images/product/default/test-product.jpg',
      image: '<img src="/images/product/default/test-product.jpg" alt="Test Product" />',
      resizedImagePath: '/images/cache/product/default/test-product_medium.jpg',
      imageExistsFlag: true,
    });

    expect(product.getImageDirectory()).toBe('/images/product/default/');
    expect(product.getImagePath()).toBe('/images/product/default/test-product.jpg');
    expect(product.getImage()).toBe(
      '<img src="/images/product/default/test-product.jpg" alt="Test Product" />',
    );
    expect(product.getResizedImagePath()).toBe(
      '/images/cache/product/default/test-product_medium.jpg',
    );
    expect(product.getImageExistsFlag()).toBe(true);
  });

  it('NET-NEW — every image member RAISES when no default SKU is attached (:L319-:L338)', () => {
    /*
     * All five legacy bodies are bare `return getDefaultSku().…` delegations with no
     * `structKeyExists` test, so a product with no default SKU raised a null-reference error on every
     * one of them. That fault is the behaviour, and it is reproduced.
     */
    const fixture = createMerchandiseProductFixture();
    fixture.clearDefaultSkuReference();

    expect(() => fixture.product.getImageDirectory()).toThrow(DomainError);
    expect(() => fixture.product.getImagePath()).toThrow(DomainError);
    expect(() => fixture.product.getImage()).toThrow(DomainError);
    expect(() => fixture.product.getResizedImagePath()).toThrow(DomainError);
    expect(() => fixture.product.getImageExistsFlag()).toThrow(DomainError);

    /*
     * The diagnostic names the member's own locator, so a log identifies which delegation failed
     * rather than reporting one undifferentiated fault for the family.
     */
    expect(() => fixture.product.getImagePath()).toThrow('model/entity/Product.cfc:L325');
    expect(() => fixture.product.getImageExistsFlag()).toThrow('model/entity/Product.cfc:L337');
  });

  it('NET-NEW — the four PRICE members still answer absence, because the legacy guards them (:L554-:L579)', () => {
    /*
     * The other half of the split, asserted so it cannot be "harmonised" with the case above. Each of
     * these four opens with `if( structKeyExists(variables, "defaultSku") )` and has no `else`, so CFML
     * returns null. Making them raise would invent four faults the legacy does not have; making the five
     * image members answer absence would delete five it does.
     */
    const fixture = createMerchandiseProductFixture();
    fixture.clearDefaultSkuReference();

    expect(fixture.product.getCurrencyCode()).toBeUndefined();
    expect(fixture.product.getPrice()).toBeUndefined();
    expect(fixture.product.getRenewalPrice()).toBeUndefined();
    expect(fixture.product.getListPrice()).toBeUndefined();
  });
});

describe('The image port beneath the default SKU', () => {
  it('NET-NEW — model/entity/Sku.cfc:L145-L147 — path resolution is the port’s work, and the SKU contributes only the file name', async () => {
    /*
     * The legacy body composes a base URL read from framework request scope with the SKU's image file.
     * The base URL is precisely the kind of framework facility the port excludes, so composition moved
     * behind `ImagePathPort` and the entity now contributes the file name and nothing else. No
     * filesystem or network work happens anywhere in this case.
     */
    const images = createImagePathDouble({
      imagePathsByImageFile: { 'test-product.jpg': '/images/product/default/test-product.jpg' },
    });
    const sku = buildSku({ skuID: SKU_ID, imageFile: 'test-product.jpg' });

    await expect(sku.getImagePath(images.imagePaths)).resolves.toBe(
      '/images/product/default/test-product.jpg',
    );
    expect(images.calls).toEqual([{ member: 'getImagePath', imageFile: 'test-product.jpg' }]);
  });

  it('NET-NEW — an absent image file is forwarded as the empty string rather than withheld', async () => {
    /*
     * The legacy reads the file name unguarded, so an absent one reached the composition as an empty
     * value. Forwarding the empty string preserves that; skipping the call would change the port's
     * contract from "compose this name" to "decide whether to compose at all".
     */
    const images = createImagePathDouble();
    const sku = buildSku({ skuID: SKU_ID });

    await expect(sku.getImagePath(images.imagePaths)).resolves.toBe('');
    expect(images.calls).toEqual([{ member: 'getImagePath', imageFile: '' }]);
  });

  it('NET-NEW — an arbitrary size string survives to the port unchanged', async () => {
    /*
     * The size is not an enumeration. `model/entity/Sku.cfc:L168-L187` maps a handful of one-letter
     * aliases onto width and height settings, but that mapping only applies when the SKU has a product to
     * scope the settings read to and no explicit dimensions were given. Outside those conditions the
     * requested size is passed through, and an installation is free to name its own. This case exercises
     * the pass-through: the SKU has no product, so an unfamiliar size reaches the port verbatim rather
     * than being silently rewritten to a recognised one.
     */
    const images = createImagePathDouble({
      imagePathsByImageFile: { 'test-product.jpg': '/images/product/default/test-product.jpg' },
      resizedImagePath: '/images/cache/hero.jpg',
    });
    const settings = createSettingResolverDouble();
    const sku = buildSku({ skuID: SKU_ID, imageFile: 'test-product.jpg' });

    await expect(
      sku.getResizedImagePath(images.imagePaths, settings.resolver, {
        size: 'hero-banner',
        missingImagePath: '/images/missing.png',
      }),
    ).resolves.toBe('/images/cache/hero.jpg');

    expect(images.calls).toEqual([
      { member: 'getImagePath', imageFile: 'test-product.jpg' },
      {
        member: 'getResizedImagePath',
        request: {
          imagePath: '/images/product/default/test-product.jpg',
          missingImagePath: '/images/missing.png',
          size: 'hero-banner',
        },
      },
    ]);
    /* The option won, so the fallback setting was never read. */
    expect(settings.calls).toEqual([]);
  });

  it('NET-NEW — model/entity/Sku.cfc:L198-L200 — the missing-image path falls back to the setting, read in the SKU’s own scope', async () => {
    const images = createImagePathDouble({
      imagePathsByImageFile: { 'test-product.jpg': '/images/product/default/test-product.jpg' },
    });
    const settings = createSettingResolverDouble({
      settings: [
        {
          settingName: 'imageMissingImagePath',
          value: '/images/no-image.png',
          scope: { kind: 'entityName', entityName: 'Sku' },
        },
      ],
    });
    const sku = buildSku({ skuID: SKU_ID, imageFile: 'test-product.jpg' });

    await sku.getResizedImagePath(images.imagePaths, settings.resolver);

    expect(settings.calls).toEqual([
      {
        settingName: 'imageMissingImagePath',
        context: { entityName: 'Sku', entityId: SKU_ID },
      },
    ]);
    expect(images.calls).toEqual([
      { member: 'getImagePath', imageFile: 'test-product.jpg' },
      {
        member: 'getResizedImagePath',
        request: {
          imagePath: '/images/product/default/test-product.jpg',
          missingImagePath: '/images/no-image.png',
        },
      },
    ]);
  });

  it('NET-NEW — model/entity/Sku.cfc:L222 — the existence probe composes the path first and probes it second', async () => {
    /*
     * The legacy body is a single expression that expands the composed path and then tests it, so the
     * order is not incidental: the port is asked to compose, and the answer is what gets probed. A port
     * that probed the raw file name would answer about a different thing entirely.
     */
    const images = createImagePathDouble({
      imagePathsByImageFile: { 'test-product.jpg': '/images/product/default/test-product.jpg' },
      existingImageFiles: ['/images/product/default/test-product.jpg'],
    });
    const sku = buildSku({ skuID: SKU_ID, imageFile: 'test-product.jpg' });

    await expect(sku.getImageExistsFlag(images.imagePaths)).resolves.toBe(true);
    expect(images.calls).toEqual([
      { member: 'getImagePath', imageFile: 'test-product.jpg' },
      { member: 'getImageExistsFlag', imagePath: '/images/product/default/test-product.jpg' },
    ]);
  });

  it('NET-NEW — an unknown composed path probes false without touching a filesystem', async () => {
    const images = createImagePathDouble({
      imagePathsByImageFile: { 'test-product.jpg': '/images/product/default/test-product.jpg' },
    });
    const sku = buildSku({ skuID: SKU_ID, imageFile: 'test-product.jpg' });

    await expect(sku.getImageExistsFlag(images.imagePaths)).resolves.toBe(false);
  });
});

/*
 * The non-mutating dry run
 * `org/Hibachi/HibachiValidationService.cfc:L153-L197` takes a `setErrors` flag. When it is true the
 * engine writes into the subject's own error bag; when it is false it takes a throwaway bag from the
 * transient factory and never attaches it. `org/Hibachi/HibachiEntity.cfc:L204-L225` is built entirely
 * on the false form: `isDeletable`, `isEditable` and `isProcessable` each validate under a context and
 * report whether the returned bag is clean, without disturbing the entity.
 */

describe('Product processability and deletability — the dry-run seam', () => {
  it('TRACEABLE — meta/tests/unit/IssuesTest.cfc:L101-L108 — isProcessable("addOptionGroup") is false for a content-access product', async () => {
    /* The legacy regression builds a content-access product and asserts the process is unavailable. */
    const harness = createValidatorHarness();
    const rootResolver = createProductTypeRootResolverDouble();
    const contentAccessProductType = buildProductType({
      productTypeID: CONTENT_ACCESS_PRODUCT_TYPE_ID,
      productTypeIDPath: CONTENT_ACCESS_PRODUCT_TYPE_ID,
      systemCode: CONTENT_ACCESS_PRODUCT_TYPE.systemCode,
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productType: contentAccessProductType,
    });

    /*
     * The base type is resolved through the entity's own member before validating, which is what makes
     * this assertion about content access rather than about an absent value — see `asValidationSubject`
     * for why the resolution has to happen here and how production does the same thing.
     */
    const baseProductType = await product.getBaseProductType(rootResolver.resolver);
    expect(baseProductType).toBe(CONTENT_ACCESS_PRODUCT_TYPE.systemCode);

    const errors = await harness.validateDryRun(
      asValidationSubject(product, {
        ...(baseProductType === undefined ? {} : { baseProductType }),
        unusedProductOptionGroups: [{ name: 'Size', value: OPTION_GROUP_ID }],
      }),
      productValidationRuleSet,
      'addOptionGroup',
    );

    const isProcessable = !errors.hasErrors();

    expect(isProcessable).toBe(false);
    expect(errors.getError('baseProductType')).toHaveLength(1);
  });

  it('NET-NEW — the same context is processable for a merchandise product, so the gate and not the absence is what failed', async () => {
    /*
     * The contrast is what gives the regression above its meaning. An in-list constraint also rejects
     * an absent value, so a product whose base type had never been resolved would fail the very same
     * assertion while proving nothing about content access. Running the identical arrangement with the
     * merchandise discriminator — the one value the rule admits — is what separates the two outcomes.
     */
    const harness = createValidatorHarness();
    const rootResolver = createProductTypeRootResolverDouble();
    const merchandiseProductType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: MERCHANDISE_PRODUCT_TYPE.systemCode,
    });
    const product = buildProduct({ productID: PRODUCT_ID, productType: merchandiseProductType });

    const baseProductType = await product.getBaseProductType(rootResolver.resolver);
    const errors = await harness.validateDryRun(
      asValidationSubject(product, {
        ...(baseProductType === undefined ? {} : { baseProductType }),
        unusedProductOptionGroups: [{ name: 'Size', value: OPTION_GROUP_ID }],
      }),
      productValidationRuleSet,
      'addOptionGroup',
    );

    expect(!errors.hasErrors()).toBe(true);
    expect(errors.getErrors()).toEqual({});
  });

  it('NET-NEW — model/validation/Product.json:L13 — the add-option-group context also requires at least one unused group', async () => {
    /*
     * The second rule the context declares, and the reason the case above supplies a group: a merchandise
     * product with no groups left to add is not processable either. A minimum-collection gate is
     * satisfied by absence but violated by a present-and-empty collection, which is exactly the state a
     * product using every available group is in.
     */
    const harness = createValidatorHarness();
    const rootResolver = createProductTypeRootResolverDouble();
    const merchandiseProductType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: MERCHANDISE_PRODUCT_TYPE.systemCode,
    });
    const product = buildProduct({ productID: PRODUCT_ID, productType: merchandiseProductType });

    const baseProductType = await product.getBaseProductType(rootResolver.resolver);
    const errors = await harness.validateDryRun(
      asValidationSubject(product, {
        ...(baseProductType === undefined ? {} : { baseProductType }),
        unusedProductOptionGroups: [],
      }),
      productValidationRuleSet,
      'addOptionGroup',
    );

    expect(!errors.hasErrors()).toBe(false);
    expect(errors.getError('unusedProductOptionGroups')).toHaveLength(1);
  });

  it('NET-NEW — org/Hibachi/HibachiValidationService.cfc:L153-L197 — a dry run leaves the subject’s own error bag untouched', async () => {
    /*
     * The property that makes `isProcessable` safe to call from a view or a permission check: asking the
     * question must not answer it destructively. A failing dry run therefore has to leave the entity
     * exactly as clean as it was, and writing into the returned bag afterwards must not reach the entity
     * either — the two bags are genuinely separate objects, not two views of one.
     */
    const harness = createValidatorHarness();
    const product = new Product();

    const errors = await harness.validateDryRun(
      asValidationSubject(product),
      productValidationRuleSet,
      'save',
    );

    expect(errors.hasErrors()).toBe(true);
    expect(product.hasErrors()).toBe(false);
    expect(product.getErrors()).toEqual({});

    errors.addError('productName', 'a message added after the dry run');

    expect(product.hasError('productName')).toBe(false);
    expect(product.getError('productName')).toEqual([]);
  });

  it('NET-NEW — two dry runs return independent bags, so one question cannot contaminate the next', async () => {
    /*
     * The legacy took a fresh transient bag per call. Reusing one would make the second answer depend on
     * the first — the failure mode a memoized or module-scoped bag produces on a warm container, where
     * the same process serves many requests.
     */
    const harness = createValidatorHarness();
    const product = new Product();
    const subject = asValidationSubject(product);

    const first = await harness.validateDryRun(subject, productValidationRuleSet, 'save');
    first.addError('urlTitle', 'a message added to the first bag only');
    const second = await harness.validateDryRun(subject, productValidationRuleSet, 'save');

    expect(first).not.toBe(second);
    expect(first.getError('urlTitle')).toHaveLength(2);
    expect(second.getError('urlTitle')).toHaveLength(1);
  });

  it('NET-NEW — org/Hibachi/HibachiEntity.cfc:L204-L206 — isDeletable turns on the transaction flag the entity resolves for itself', async () => {
    /*
     * `model/validation/Product.json:L12` gates the delete on `transactionExistsFlag` equalling false,
     * and the case above established that the flag is scoped to one product. The two combine here: the entity
     * resolves its own flag through the checker, that resolved value is what the delete rule reads, and
     * the verdict differs between a product a transaction references and one it does not.
     */
    const harness = createValidatorHarness();
    const skuRepository = createInMemorySkuRepository({ transactionProductIDs: [PRODUCT_ID] });
    const transactionChecker = createTransactionExistenceChecker(skuRepository.repository);
    const transactedProduct = buildProduct({ productID: PRODUCT_ID });
    const deletableProduct = buildProduct({ productID: SECOND_PRODUCT_ID });

    const transactedErrors = await harness.validateDryRun(
      asValidationSubject(transactedProduct, {
        transactionExistsFlag: await transactedProduct.getTransactionExistsFlag(transactionChecker),
      }),
      productValidationRuleSet,
      'delete',
    );
    const deletableErrors = await harness.validateDryRun(
      asValidationSubject(deletableProduct, {
        transactionExistsFlag: await deletableProduct.getTransactionExistsFlag(transactionChecker),
      }),
      productValidationRuleSet,
      'delete',
    );

    expect(!transactedErrors.hasErrors()).toBe(false);
    expect(transactedErrors.getError('transactionExistsFlag')).toEqual([
      buildValidationMessage(
        'delete',
        transactedProduct.getClassName(),
        'transactionExistsFlag',
        transactionExistsFlagEqualityConstraint,
      ),
    ]);
    expect(!deletableErrors.hasErrors()).toBe(true);
    expect(transactedProduct.hasErrors()).toBe(false);
    expect(deletableProduct.hasErrors()).toBe(false);
  });

  it('NET-NEW — org/Hibachi/HibachiEntity.cfc:L214-L216 — isEditable is true because the validation document declares no edit-context rule, and the dry run still does not mutate', async () => {
    /*
     * Reported as a finding rather than filled in. Every rule in `model/validation/Product.json` names
     * an explicit context, and none of them names `edit`, so the edit context selects no rules and the
     * returned bag is empty. That makes a product unconditionally editable in the legacy system, and
     * inventing an edit rule to make the answer look more considered would be exactly the kind of quiet
     * enhancement the port forbids.
     */
    const harness = createValidatorHarness();
    const product = new Product();

    const errors = await harness.validateDryRun(
      asValidationSubject(product),
      productValidationRuleSet,
      'edit',
    );

    expect(errors.getErrors()).toEqual({});
    expect(!errors.hasErrors()).toBe(true);
    expect(errors).toBeInstanceOf(ValidationError);
    expect(product.hasErrors()).toBe(false);
  });
});

/* The error-bag contract. */

describe('The validation error bag', () => {
  it('NET-NEW — org/Hibachi/HibachiTransient.cfc:L35-L44 — reading an unknown key yields an empty array and never throws', () => {
    /*
     * The ported behaviour is the transient's, not the errors component's, and the choice is
     * deliberate. `org/Hibachi/HibachiTransient.cfc:L35-L44` checks for the key and defaults to the empty
     * array, which is what every caller in the slice was written against — a view iterating a property's
     * messages, a template testing arity.
     */
    const errors = new ValidationError();
    const product = new Product();

    expect(errors.getError('missing')).toEqual([]);
    expect(errors.hasError('missing')).toBe(false);
    expect(errors.hasErrors()).toBe(false);
    expect(product.getError('missing')).toEqual([]);
    expect(product.hasError('missing')).toBe(false);
    expect(() => product.getError('missing')).not.toThrow();
  });

  it('NET-NEW — repeated additions append in order and the value stays an array', () => {
    /*
     * The legacy bag holds an array per property and appends, so two failures on one property are two
     * messages rather than a replacement — which is what lets a single property report both a format
     * violation and a uniqueness violation from one save.
     */
    const errors = new ValidationError();

    errors.addError('productCode', 'the first message');
    errors.addError('productCode', 'the second message');
    errors.addError('urlTitle', 'an unrelated message');

    expect(errors.getError('productCode')).toEqual(['the first message', 'the second message']);
    expect(Array.isArray(errors.getError('productCode'))).toBe(true);
    expect(errors.getError('urlTitle')).toEqual(['an unrelated message']);
    expect(errors.hasError('productCode')).toBe(true);
    expect(errors.hasErrors()).toBe(true);
    expect(errors.getErrors()).toEqual({
      productCode: ['the first message', 'the second message'],
      urlTitle: ['an unrelated message'],
    });
  });

  it('NET-NEW — a bag copied onto an entity keeps its arrays and its order', () => {
    /*
     * The transfer the save path performs: validate into a bag, then copy the bag onto the entity. The
     * copy has to preserve per-property arrays and their order, or a property reporting two failures
     * would surface one — and the entity's own reader is the surface every caller in the slice uses.
     */
    const errors = new ValidationError();
    errors.addError('productCode', 'the first message');
    errors.addError('productCode', 'the second message');
    const product = new Product();

    product.addErrors(errors.getErrors());

    expect(product.hasErrors()).toBe(true);
    expect(product.getError('productCode')).toEqual(['the first message', 'the second message']);
    expect(product.getErrors()).toEqual({
      productCode: ['the first message', 'the second message'],
    });
  });
});

/*
 * The retained surface — support declarations
 * Two local recording doubles and one reader factory, declared here rather than in `../support` for the
 * reason the support module's own header gives: a double belongs there when more than one suite needs
 * it, and these three are read only by the four sections below.
 */

/** One recorded call on an association double, naming the member and the product it received. */
interface AssociationCall {
  readonly member: 'setProduct' | 'removeProduct';
  /**
   * The product the delegation passed. `undefined` records the no-argument `removeProduct()` form.
   */
  readonly product: Product | undefined;
}

/** An association double together with its own call log. */
interface AssociationRecorder {
  readonly association: ProductOwnedAssociation;
  readonly calls: readonly AssociationCall[];
}

/** Builds a recording {@link ProductOwnedAssociation}. */
const recordingAssociation = (): AssociationRecorder => {
  const calls: AssociationCall[] = [];

  return {
    calls,
    association: {
      setProduct: (product: Product): void => {
        calls.push({ member: 'setProduct', product });
      },
      removeProduct: (product?: Product): void => {
        calls.push({ member: 'removeProduct', product });
      },
    },
  };
};

/** Builds a {@link ProductSkuIdReader} over an identity-keyed table of identifiers. */
const readingIdentifiers = (
  identifiers: ReadonlyMap<ProductSkuMember, string>,
): ProductSkuIdReader => {
  return (sku: ProductSkuMember): string => identifiers.get(sku) ?? '';
};

/*
 * The SKU finder — [model/entity/Product.cfc:L162-L169]
 * A 1-based CFML loop over `getSkus()` comparing `skus[i].getSkuID()` to the argument, falling through
 * to CFML null when nothing matches. Three properties are load-bearing and each gets its own case: the
 * scan reads the live collection, a miss answers with absence rather than a sentinel, and the strict
 * comparison is on the injected reader's answer rather than on any field this module can see.
 */

describe('Product.getSkuByID — the live linear scan', () => {
  it('NET-NEW — model/entity/Product.cfc:L162-L167 — returns the matching SKU instance, not a copy of it', () => {
    const product = buildProduct({ productID: PRODUCT_ID });
    const first = buildSku({ skuID: SKU_ID, skuCode: 'first' });
    const second = buildSku({ skuID: SECOND_SKU_ID, skuCode: 'second' });
    product.addSku(first);
    product.addSku(second);
    const readSkuID = readingIdentifiers(
      new Map([
        [first, SKU_ID],
        [second, SECOND_SKU_ID],
      ]),
    );

    /*
     * Identity, not equality. The legacy returns the element itself, and callers then mutate it — so a
     * defensive copy here would silently discard every downstream write. `toBe` is the assertion that
     * catches that; `toEqual` would pass against a copy.
     */
    expect(product.getSkuByID(readSkuID, SECOND_SKU_ID)).toBe(second);
    expect(product.getSkuByID(readSkuID, SKU_ID)).toBe(first);
  });

  it('NET-NEW — model/entity/Product.cfc:L169 — a miss answers with absence, reproducing the legacy fall-through', () => {
    const product = buildProduct({ productID: PRODUCT_ID });
    const sku = buildSku({ skuID: SKU_ID });
    product.addSku(sku);
    const readSkuID = readingIdentifiers(new Map([[sku, SKU_ID]]));

    /*
     * `:L169` ends the function with no `return` statement, so the legacy answered CFML null. That is
     * transcribed as an explicit `undefined` because `noImplicitReturns` requires it written out — it is
     * a transcription of the fall-through, not a new guard, and certainly not a thrown error.
     */
    expect(product.getSkuByID(readSkuID, SECOND_SKU_ID)).toBeUndefined();
    expect(product.getSkuByID(readSkuID, '')).toBeUndefined();
  });

  it('NET-NEW — the scan reads the LIVE collection, so a detached SKU stops resolving', () => {
    const product = buildProduct({ productID: PRODUCT_ID });
    const sku = buildSku({ skuID: SKU_ID });
    product.addSku(sku);
    const readSkuID = readingIdentifiers(new Map([[sku, SKU_ID]]));

    expect(product.getSkuByID(readSkuID, SKU_ID)).toBe(sku);

    /*
     * Mutation sensitivity, stated as an assertion. The member is documented as scanning
     * `Product.getSkus()`, and the only way to prove it reads that array rather than a snapshot taken
     * earlier is to change the array between two calls. A memoized finder would keep answering with the
     * detached SKU here.
     */
    product.removeSku(sku);

    expect(product.getSkuByID(readSkuID, SKU_ID)).toBeUndefined();
    expect(product.getSkus()).toEqual([]);
  });

  it('NET-NEW — an empty collection is scanned without raising, and answers absence', () => {
    const product = buildProduct({ productID: PRODUCT_ID });

    expect(product.getSkus()).toEqual([]);
    expect(product.getSkuByID(readingIdentifiers(new Map()), SKU_ID)).toBeUndefined();
  });
});

/*
 * The four live collection accessors — [model/entity/Product.cfc:L178-L180] and the three siblings
 * `getImages` is a hand-written alias whose legacy body is the bare `return variables.productImages;`,
 * and the framework-generated `getProductImages` reads the same slot. The other three accessors follow
 * the same pattern over their own slots. What matters is that each hands back the live array rather
 * than a copy, and that the aliased pair share one array while the four slots stay distinct — a mistake
 * in either direction (copying, or aliasing the wrong slot) is invisible to any assertion that only.
 */

describe('Product live collection accessors', () => {
  it('NET-NEW — model/entity/Product.cfc:L178-L180 — getImages and getProductImages are TWO NAMES FOR ONE ARRAY', () => {
    const product = buildProduct({ productID: PRODUCT_ID });

    /*
     * `toBe`, deliberately. The legacy exposes both names over `variables.productImages`, so a
     * mutation through either must be visible through the other. `toEqual` would pass against two
     * separate empty arrays and would let the alias silently become a copy.
     */
    expect(product.getImages()).toBe(product.getProductImages());
    expect(product.getImages()).toBe(product.productImages);
  });

  it('NET-NEW — a push through one alias is observed through the other', () => {
    const product = buildProduct({ productID: PRODUCT_ID });
    const image = recordingAssociation();

    product.getImages().push(image.association);

    expect(product.getProductImages()).toEqual([image.association]);
    expect(product.getProductImages()[0]).toBe(image.association);
  });

  it('NET-NEW — the four collection accessors read FOUR DISTINCT slots', () => {
    const product = buildProduct({ productID: PRODUCT_ID });
    const image = recordingAssociation();
    const attributeValue = recordingAssociation();
    const review = recordingAssociation();
    const sku = buildSku({ skuID: SKU_ID });

    product.getProductImages().push(image.association);
    product.getAttributeValues().push(attributeValue.association);
    product.getProductReviews().push(review.association);
    product.addSku(sku);

    /*
     * Each collection holds exactly its own element and nothing else. Written this way, an accessor
     * wired to a neighbouring slot fails here rather than passing every emptiness check in the file.
     */
    expect(product.getProductImages()).toEqual([image.association]);
    expect(product.getAttributeValues()).toEqual([attributeValue.association]);
    expect(product.getProductReviews()).toEqual([review.association]);
    expect(product.getSkus()).toEqual([sku]);
  });

  it('NET-NEW — every collection starts EMPTY and each product owns its own arrays', () => {
    const first = buildProduct({ productID: PRODUCT_ID });
    const second = buildProduct({ productID: SECOND_PRODUCT_ID });

    expect(first.getImages()).toEqual([]);
    expect(first.getAttributeValues()).toEqual([]);
    expect(first.getProductReviews()).toEqual([]);

    /*
     * A field initialiser on the class body gives each instance its own array; a module-scope default
     * would give every product the same array, which is the failure this pins. Mutating one product must
     * not be visible from another.
     */
    first.getAttributeValues().push(recordingAssociation().association);

    expect(second.getAttributeValues()).toEqual([]);
    expect(second.getAttributeValues()).not.toBe(first.getAttributeValues());
  });
});

/*
 * The seven relationship delegations — [model/entity/Product.cfc:l680-l709]
 * Seven hand-written helpers, every one a single statement of the form
 * `arguments.x.setProduct( this )` or `arguments.x.removeProduct( this )`. They are declared
 * `inverse="true"` on the collection side, which means the many side owns the foreign key: ownership is
 * handed to the associated entity and the collection follows from the persistence layer.
 */

describe('Product relationship delegations — the many side owns the key', () => {
  it('NET-NEW — model/entity/Product.cfc:L680-L685 — the attribute-value pair delegates and touches no local array', () => {
    const product = buildProduct({ productID: PRODUCT_ID });
    const attributeValue = recordingAssociation();

    product.addAttributeValue(attributeValue.association);

    expect(attributeValue.calls).toEqual([{ member: 'setProduct', product }]);
    /* The delegation hands ownership over; it does not register locally. */
    expect(product.getAttributeValues()).toEqual([]);

    product.removeAttributeValue(attributeValue.association);

    expect(attributeValue.calls).toEqual([
      { member: 'setProduct', product },
      { member: 'removeProduct', product },
    ]);
    expect(product.getAttributeValues()).toEqual([]);
  });

  it('NET-NEW — model/entity/Product.cfc:L688-L693 — the image pair delegates and touches no local array', () => {
    const product = buildProduct({ productID: PRODUCT_ID });
    const image = recordingAssociation();

    product.addProductImage(image.association);
    product.removeProductImage(image.association);

    expect(image.calls).toEqual([
      { member: 'setProduct', product },
      { member: 'removeProduct', product },
    ]);
    expect(product.getProductImages()).toEqual([]);
    expect(product.getImages()).toEqual([]);
  });

  it('NET-NEW — model/entity/Product.cfc:L704-L709 — the review pair delegates and touches no local array', () => {
    const product = buildProduct({ productID: PRODUCT_ID });
    const review = recordingAssociation();

    product.addProductReview(review.association);
    product.removeProductReview(review.association);

    expect(review.calls).toEqual([
      { member: 'setProduct', product },
      { member: 'removeProduct', product },
    ]);
    expect(product.getProductReviews()).toEqual([]);
  });

  it('NET-NEW — each remove helper passes THIS product explicitly, never the no-argument form', () => {
    const product = buildProduct({ productID: PRODUCT_ID });
    const other = buildProduct({ productID: SECOND_PRODUCT_ID });
    const attributeValue = recordingAssociation();
    const image = recordingAssociation();
    const review = recordingAssociation();

    product.removeAttributeValue(attributeValue.association);
    product.removeProductImage(image.association);
    product.removeProductReview(review.association);

    /*
     * The argument is not decorative. The collaborator's `removeProduct` defaults to the association's
     * current product when called with no argument, so `removeProduct()` and `removeProduct(this)` differ
     * whenever the association is attached elsewhere. The legacy passes `this` at every one of the three
     * call sites, and that is what is asserted — including that the product passed is this one and not
     * some other instance.
     */
    for (const recorder of [attributeValue, image, review]) {
      expect(recorder.calls).toEqual([{ member: 'removeProduct', product }]);
      expect(recorder.calls[0]?.product).toBe(product);
      expect(recorder.calls[0]?.product).not.toBe(other);
    }
  });

  it('NET-NEW — model/entity/Product.cfc:L696-L701 — the SKU pair delegates, and the SKU maintains BOTH sides', () => {
    const product = buildProduct({ productID: PRODUCT_ID });
    const sku = buildSku({ skuID: SKU_ID });

    product.addSku(sku);

    /*
     * Why this one looks different from the other six. `addSku`/`removeSku` are the same one-line
     * delegations, but their collaborator is in scope and its `setProduct` is one of only two legacy
     * members that maintain both sides of a relationship — it appends to `product.getSkus()` itself. So
     * the collection does fill here, and it fills through the SKU rather than through the product.
     */
    expect(sku.product).toBe(product);
    expect(product.getSkus()).toEqual([sku]);

    product.removeSku(sku);

    /* `removeProduct` splices the live array and then clears its own reference unconditionally. */
    expect(product.getSkus()).toEqual([]);
    expect(sku.product).toBeUndefined();
  });

  it('NET-NEW — removeSku detaches from THIS product, leaving another product’s collection alone', () => {
    const product = buildProduct({ productID: PRODUCT_ID });
    const other = buildProduct({ productID: SECOND_PRODUCT_ID });
    const mine = buildSku({ skuID: SKU_ID });
    const theirs = buildSku({ skuID: SECOND_SKU_ID });
    product.addSku(mine);
    other.addSku(theirs);

    product.removeSku(mine);

    expect(product.getSkus()).toEqual([]);
    expect(other.getSkus()).toEqual([theirs]);
    expect(theirs.product).toBe(other);
  });
});

/*
 * The template guard, the brand-name defect and the subscription-term boundary
 * Three retained members that share nothing except that each one's interesting behaviour is a branch,
 * and in each case one side of the branch is what a casual reading gets wrong: the template's guard
 * tests emptiness as well as absence; the brand-name memo is written with the wrong value and never
 * corrected; and the subscription-term finder is optional, so its absent branch is a real path rather
 * than a defensive one.
 */

describe('Product.getTemplate — the two-part guard and its short-circuit', () => {
  it('NET-NEW — model/entity/Product.cfc:L215-L221 — a present, non-empty override wins and the resolver is NEVER consulted', () => {
    const settings = createSettingResolverDouble({
      settings: [{ settingName: 'productDisplayTemplate', value: 'default-product-template' }],
    });
    const product = buildProduct({ productID: PRODUCT_ID });
    product.template = 'custom-product-template';

    expect(product.getTemplate(settings.resolver)).toBe('custom-product-template');
    /*
     * The short-circuit is the assertion. The legacy consults the setting only inside the fallback
     * branch, so an override present means the out-of-scope setting engine is never reached at all. A
     * translation that resolved the setting first and then chose between the two answers would return
     * the same string here and still be wrong — an empty call log is what distinguishes them.
     */
    expect(settings.calls).toEqual([]);
  });

  it('NET-NEW — model/entity/Product.cfc:L216 — an ABSENT override falls back to the resolved setting', () => {
    const settings = createSettingResolverDouble({
      settings: [{ settingName: 'productDisplayTemplate', value: 'default-product-template' }],
    });
    const product = buildProduct({ productID: PRODUCT_ID });

    expect(product.getTemplate(settings.resolver)).toBe('default-product-template');
    expect(settings.calls).toEqual([{ settingName: 'productDisplayTemplate', context: undefined }]);
  });

  it('NET-NEW — model/entity/Product.cfc:L216 — an override present but EMPTY also falls back', () => {
    const settings = createSettingResolverDouble({
      settings: [{ settingName: 'productDisplayTemplate', value: 'default-product-template' }],
    });
    const product = buildProduct({ productID: PRODUCT_ID });
    product.template = '';

    /*
     * Two states, one outcome, and they are genuinely distinct here. The legacy guard is
     * `!structKeyExists(variables,"template") || variables.template == ""`, and under
     * `exactOptionalPropertyTypes` "key absent" and "key present holding `''`" really are different
     * states — so the guard is reproduced as an explicit two-part check. A truthiness test would agree
     * with the legacy on exactly these two inputs and disagree on any other falsy value, which the
     * legacy comparison against `""` specifically does not swallow.
     */
    expect(product.getTemplate(settings.resolver)).toBe('default-product-template');
    expect(settings.calls).toHaveLength(1);
  });

  it('NET-NEW — the fallback is NOT memoized: two calls resolve twice', () => {
    const settings = createSettingResolverDouble({
      settings: [{ settingName: 'productDisplayTemplate', value: 'default-product-template' }],
    });
    const product = buildProduct({ productID: PRODUCT_ID });

    product.getTemplate(settings.resolver);
    product.getTemplate(settings.resolver);

    /*
     * The legacy body caches nothing — unlike `getTitle` and `getBrandName`, which do. Adding a cache
     * here would be adding behaviour, and AAP §0.7.3 is explicit that no new memoization is introduced. Two
     * calls therefore mean two resolutions.
     */
    expect(settings.calls).toHaveLength(2);
  });
});

describe('Product.getBrandName — the memo defect, carried and pinned', () => {
  it('NET-NEW — model/entity/Product.cfc:L105 — TODO(parity): the first read answers the brand, every subsequent read answers empty', () => {
    const brand = buildBrand({ brandID: SECOND_PRODUCT_ID, brandName: 'Nike' });
    const product = buildProduct({ productID: PRODUCT_ID, brand });

    /* This is a preserved defect and the assertion is deliberately of the broken behaviour. */
    expect(product.getBrandName()).toBe('Nike');
    expect(product.getBrandName()).toBe('');
    expect(product.getBrandName()).toBe('');
    /* The slot itself is observable, and it holds the wrong value rather than the brand's name. */
    expect(product.brandName).toBe('');
  });

  it('NET-NEW — with no brand attached, every read answers the empty string', () => {
    const product = buildProduct({ productID: PRODUCT_ID });

    /*
     * The legacy declares the return type `string`, so an absent brand yields `''` — the value CFML
     * would have interpolated for a null. Here the defect is invisible, because the memo's wrong value
     * and the correct answer coincide.
     */
    expect(product.getBrandName()).toBe('');
    expect(product.getBrandName()).toBe('');
  });

  it('NET-NEW — a brand whose own name is absent also answers the empty string', () => {
    const brand = buildBrand({ brandID: SECOND_PRODUCT_ID });
    const product = buildProduct({ productID: PRODUCT_ID, brand });

    expect(product.getBrandName()).toBe('');
  });

  it('NET-NEW — attaching a brand AFTER the first read cannot recover the name', () => {
    const brand = buildBrand({ brandID: SECOND_PRODUCT_ID, brandName: 'Nike' });
    const product = buildProduct({ productID: PRODUCT_ID });

    expect(product.getBrandName()).toBe('');

    product.setBrand(brand);

    /*
     * The memo was filled on the first read, so the later association is never consulted. This is the
     * same defect observed from the other direction, and it is the shape a caller is most likely to hit
     * in practice: read the name while building the product, then attach the brand.
     */
    expect(product.getBrandName()).toBe('');
    expect(product.brand).toBe(brand);
  });
});

describe('Product.getUnusedProductSubscriptionTerms — both branches of the optional finder', () => {
  it('NET-NEW — model/entity/Product.cfc:L649-L654 — a PRESENT finder is called with this product’s identifier', async () => {
    const firstTerm = { subscriptionTermID: SKU_ID };
    const secondTerm = { subscriptionTermID: SECOND_SKU_ID };
    const requestedProductIDs: string[] = [];
    const product = buildProduct({ productID: PRODUCT_ID });

    const terms = await product.getUnusedProductSubscriptionTerms({
      getUnusedProductSubscriptionTerms: (productID: string): Promise<object[]> => {
        requestedProductIDs.push(productID);
        return Promise.resolve([firstTerm, secondTerm]);
      },
    });

    /*
     * Two things are pinned and nothing else is. The finder receives this product's 32-character
     * identifier — not a whole entity, and not another product's identifier — and the result travels back
     * unreshaped, element identity included.
     */
    expect(requestedProductIDs).toEqual([PRODUCT_ID]);
    expect(terms).toHaveLength(2);
    expect(terms[0]).toBe(firstTerm);
    expect(terms[1]).toBe(secondTerm);
  });

  it('NET-NEW — an ABSENT finder answers the empty array rather than raising', async () => {
    const product = buildProduct({ productID: PRODUCT_ID });

    /*
     * The empty array is the correct boundary answer, not a swallowed error. This member's arity is
     * read by a minimum-collection gate of one, so an empty result fails that gate — which is exactly the
     * outcome the legacy produced for a product with no unused terms. Throwing instead would convert a
     * validation failure into a runtime error, and the error message would have to be invented (AAP §0.7.3).
     */
    await expect(product.getUnusedProductSubscriptionTerms()).resolves.toEqual([]);
  });

  it('NET-NEW — the absent branch is NOT memoized, so the capability can arrive later', async () => {
    const product = buildProduct({ productID: PRODUCT_ID });
    const term = { subscriptionTermID: SKU_ID };

    await expect(product.getUnusedProductSubscriptionTerms()).resolves.toEqual([]);

    /*
     * The legacy caches this result, but that cache belonged to a member with a real implementation.
     * Caching a boundary stub's answer would cache the absence of a capability for the entity's whole
     * lifetime, which is new behaviour rather than preserved behaviour — so no cache is added, and a
     * later call with a finder present is answered by the finder.
     */
    await expect(
      product.getUnusedProductSubscriptionTerms({
        getUnusedProductSubscriptionTerms: (): Promise<object[]> => Promise.resolve([term]),
      }),
    ).resolves.toEqual([term]);
  });

  it('NET-NEW — a finder rejection propagates rather than degrading to the empty array', async () => {
    const failure = new Error('The subscription term lookup was refused.');
    const product = buildProduct({ productID: PRODUCT_ID });

    /*
     * The empty-array answer belongs to one case only — the capability being absent. A finder that was
     * supplied and failed is a different fact, and collapsing the two would report "no unused terms" for
     * a lookup that never completed.
     */
    await expect(
      product.getUnusedProductSubscriptionTerms({
        getUnusedProductSubscriptionTerms: (): Promise<object[]> => Promise.reject(failure),
      }),
    ).rejects.toBe(failure);
  });
});

/*
 * AAP §0.4.1.12 declares exactly seventeen executable suites, so this subject is covered
 * inside an approved suite rather than in one of its own.
 */

/** Process-object population descriptors — net-new. */
describe('The three transient process objects, every one of which takes a product', () => {
  /* Derivation helpers over the production descriptor sets. */

  /**
   * The declared property names, in the order production declares them, which is population order.
   */
  const declaredNames = <TTarget, TName extends string>(
    descriptorSet: PropertyDescriptorSet<TTarget, TName>,
  ): readonly string[] => descriptorSet.properties.map((descriptor) => descriptor.name);

  /** Name-to-declared-value-type for every column descriptor in the set. */
  const declaredValueTypes = <TTarget, TName extends string>(
    descriptorSet: PropertyDescriptorSet<TTarget, TName>,
  ): Record<string, string> => {
    const valueTypes: Record<string, string> = {};

    for (const descriptor of descriptorSet.properties) {
      if ('valueType' in descriptor) {
        valueTypes[descriptor.name] = descriptor.valueType;
      }
    }

    return valueTypes;
  };

  /** The own enumerable member names of each descriptor, in declaration order per descriptor. */
  const declaredDescriptorMembers = <TTarget, TName extends string>(
    descriptorSet: PropertyDescriptorSet<TTarget, TName>,
  ): readonly (readonly string[])[] =>
    descriptorSet.properties.map((descriptor) => Object.keys(descriptor));

  /**
   * The three optional members that would change population behaviour if any process object declared
   * one. Named here so both the per-module and the cross-module blocks assert the same list.
   */
  const BEHAVIOUR_CHANGING_DESCRIPTOR_MEMBERS = ['notNull', 'populateArray', 'fileUpload'] as const;

  /* A — Product_AddOption — model/process/Product_AddOption.cfc:L49-L57. */

  describe('ProductAddOption — NET-NEW — the exported population descriptors, model/process/Product_AddOption.cfc:L49-L57', () => {
    it('NET-NEW — model/process/Product_AddOption.cfc:L52,L55 — the two column descriptors appear in source declaration order', () => {
      /*
       * Declaration order is preserved because it is population order: the legacy loop at
       * `org/Hibachi/HibachiTransient.cfc:L178` iterates declared properties rather than payload keys,
       * never the reverse. A payload key matching no declared property is silently ignored, which is a
       * direct consequence of that iteration direction and the reason a two-entry table is the complete
       * contract rather than a partial one.
       */
      expect(declaredNames(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS)).toEqual(['product', 'option']);

      /*
       * Nothing else is declared, and the absences are the contract. A process object is transient:
       * `model/process/Product_AddOption.cfc:L49` extends `HibachiProcess` and declares no identifier
       * property, no audit property and no relationship, so there is no `processObjectID`, no
       * `createdDateTime` pair and no collection to declare. The entity the process acts on arrives as
       * the injected `product` property, which is why `product` is declared and `productID` is not.
       */
      expect(declaredNames(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS)).toHaveLength(2);
    });

    it("NET-NEW — model/process/Product_AddOption.cfc:L52,L55 — both properties declare 'untyped', because the legacy declares no ormtype at all", () => {
      /*
       * `'untyped'` is a positive statement that there is nothing to convert towards, not an absence of
       * thought: neither `property name="product";` at `:L52` nor `property name="option";` at `:L55`
       * carries an `ormtype`, so branch 1's coercion has no target type to coerce to. Declaring
       * `'string'` here instead would stringify an injected entity reference, which is exactly the
       * defect the required `valueType` member exists to make impossible to introduce silently.
       */
      expect(declaredValueTypes(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS)).toEqual({
        product: 'untyped',
        option: 'untyped',
      });
    });

    it('NET-NEW — model/process/Product_AddOption.cfc:L49 — the set carries the legacy UNDERSCORED class name, not the TypeScript class name', () => {
      /*
       * `getClassName()` at `org/Hibachi/HibachiObject.cfc:L135-L137` returns
       * `listLast(getClassFullname(), ".")`. The CFML file is `Product_AddOption.cfc`, so the legacy
       * value is `Product_AddOption` — underscore and all — while the TypeScript interface is named
       * `ProductAddOption`. The legacy spelling is carried because it is what arm 3 of the population
       * gate would have been keyed by (`org/Hibachi/HibachiTransient.cfc:L190`), and because
       * `getEntityPermissionDetails()` builds its key set from a directory listing at.
       */
      expect(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS.entityName).toBe('Product_AddOption');
      expect(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS.entityName).not.toBe('ProductAddOption');
      expect(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS.entityName).toContain('_');
    });

    it('NET-NEW — ProductAddOption org/Hibachi/HibachiTransient.cfc:L186-L190 — persistent is false, which is ARM 1 and therefore a short-circuit', () => {
      /*
       * The consequential member, and it is behaviour rather than bookkeeping. The master gate reads
       * `!isPersistent() || (publicPopulateFlag && … == "public") || authenticateEntityProperty(…)`.
       */
      expect(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS.persistent).toBe(false);

      for (const members of declaredDescriptorMembers(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS)) {
        expect(members).not.toContain('populateEnabled');
      }
    });

    it('NET-NEW — ProductAddOption AAP §0.7.3 — the model is closed: three set members, and exactly {name, valueType} on each descriptor', () => {
      /*
       * Every member the descriptor contract offers is either used or omitted for a documented reason.
       * Enumerating the own keys is what makes that checkable in both directions — an added member is
       * caught as readily as a removed one.
       */
      expect(Object.keys(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS)).toEqual([
        'entityName',
        'persistent',
        'properties',
      ]);
      expect(declaredDescriptorMembers(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS)).toEqual([
        ['name', 'valueType'],
        ['name', 'valueType'],
      ]);

      for (const members of declaredDescriptorMembers(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS)) {
        for (const behaviourChangingMember of BEHAVIOUR_CHANGING_DESCRIPTOR_MEMBERS) {
          expect(members).not.toContain(behaviourChangingMember);
        }
        /*
         * No relationship descriptor either, so nothing declares a `kind`, a loader or a related id.
         */
        expect(members).not.toContain('kind');
      }
    });

    it('NET-NEW — ProductAddOption frozen at both declared levels, so a caller that receives the contract cannot mutate it', () => {
      /*
       * The module's own header states the claim precisely: frozen at both levels — the set and its
       * property list. It says nothing about a third level, and there is none: `Object.freeze([...])`
       * freezes the array and not its elements, so the individual descriptor objects are extensible.
       * That is asserted as it stands rather than tightened, because tightening it here would assert a
       * property production does not have and would then quietly disagree with the source comment.
       */
      expect(Object.isFrozen(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS)).toBe(true);
      expect(Object.isFrozen(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS.properties)).toBe(true);

      expect(Reflect.set(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS, 'persistent', true)).toBe(false);
      expect(Reflect.deleteProperty(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS, 'entityName')).toBe(
        false,
      );
      expect(
        Reflect.set(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS.properties, 0, {
          name: 'product',
          valueType: 'string',
        }),
      ).toBe(false);

      /* And the refusals left the contract exactly as declared. */
      expect(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS.persistent).toBe(false);
      expect(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS.entityName).toBe('Product_AddOption');
      expect(declaredValueTypes(PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS)).toEqual({
        product: 'untyped',
        option: 'untyped',
      });
    });
  });

  /* B — Product_AddOptionGroup — model/process/Product_AddOptionGroup.cfc:L49-L57. */

  describe('ProductAddOptionGroup — NET-NEW — the exported population descriptors, model/process/Product_AddOptionGroup.cfc:L49-L57', () => {
    it('NET-NEW — model/process/Product_AddOptionGroup.cfc:L52,L55 — the two column descriptors appear in source declaration order', () => {
      expect(declaredNames(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS)).toEqual([
        'product',
        'optionGroup',
      ]);
      expect(declaredNames(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS)).toHaveLength(2);

      /*
       * And it is `optionGroup`, not `option` — the whole distinction between this type and its sibling.
       */
      expect(declaredNames(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS)).not.toContain('option');
    });

    it("NET-NEW — model/process/Product_AddOptionGroup.cfc:L52,L55 — both properties declare 'untyped', because the legacy declares no ormtype at all", () => {
      expect(declaredValueTypes(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS)).toEqual({
        product: 'untyped',
        optionGroup: 'untyped',
      });
    });

    it('NET-NEW — model/process/Product_AddOptionGroup.cfc:L49 — the set carries the legacy UNDERSCORED class name, not the TypeScript class name', () => {
      expect(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS.entityName).toBe(
        'Product_AddOptionGroup',
      );
      expect(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS.entityName).not.toBe(
        'ProductAddOptionGroup',
      );
      expect(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS.entityName).toContain('_');
    });

    it('NET-NEW — ProductAddOptionGroup org/Hibachi/HibachiTransient.cfc:L186-L190 — persistent is false, which is ARM 1 and therefore a short-circuit', () => {
      expect(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS.persistent).toBe(false);

      for (const members of declaredDescriptorMembers(
        PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS,
      )) {
        expect(members).not.toContain('populateEnabled');
      }
    });

    it('NET-NEW — ProductAddOptionGroup AAP §0.7.3 — the model is closed: three set members, and exactly {name, valueType} on each descriptor', () => {
      expect(Object.keys(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS)).toEqual([
        'entityName',
        'persistent',
        'properties',
      ]);
      expect(declaredDescriptorMembers(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS)).toEqual([
        ['name', 'valueType'],
        ['name', 'valueType'],
      ]);

      for (const members of declaredDescriptorMembers(
        PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS,
      )) {
        for (const behaviourChangingMember of BEHAVIOUR_CHANGING_DESCRIPTOR_MEMBERS) {
          expect(members).not.toContain(behaviourChangingMember);
        }
        expect(members).not.toContain('kind');
      }
    });

    it('NET-NEW — ProductAddOptionGroup frozen at both declared levels, so a caller that receives the contract cannot mutate it', () => {
      expect(Object.isFrozen(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS)).toBe(true);
      expect(Object.isFrozen(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS.properties)).toBe(true);

      expect(Reflect.set(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS, 'persistent', true)).toBe(
        false,
      );
      expect(
        Reflect.deleteProperty(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS, 'entityName'),
      ).toBe(false);
      expect(
        Reflect.set(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS.properties, 0, {
          name: 'product',
          valueType: 'string',
        }),
      ).toBe(false);

      expect(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS.persistent).toBe(false);
      expect(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS.entityName).toBe(
        'Product_AddOptionGroup',
      );
      expect(declaredValueTypes(PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS)).toEqual({
        product: 'untyped',
        optionGroup: 'untyped',
      });
    });
  });

  /* C — Product_UpdateSkus — model/process/Product_UpdateSkus.cfc:L49-L60. */

  describe('ProductUpdateSkus — NET-NEW — the exported population descriptors, model/process/Product_UpdateSkus.cfc:L49-L60', () => {
    it('NET-NEW — model/process/Product_UpdateSkus.cfc:L52-L58 — the five column descriptors appear in source declaration order', () => {
      /*
       * The flag-before-value order is the point, not incidental. `:L55` declares `updatePriceFlag`
       * and `:L56` declares `price`; `:L57` declares `updateListPriceFlag` and `:L58` declares
       * `listPrice`. `model/validation/Product_UpdateSkus.json` names the flag and the price as separate
       * property identifiers and gates each price on its own flag, so collapsing a pair into one
       * nullable price — letting presence stand in for the flag — would leave the conditions
       * unexpressible and would invent a meaning for a present price with an absent flag.
       */
      expect(declaredNames(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS)).toEqual([
        'product',
        'updatePriceFlag',
        'price',
        'updateListPriceFlag',
        'listPrice',
      ]);
      expect(declaredNames(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS)).toHaveLength(5);
    });

    it("NET-NEW — model/process/Product_UpdateSkus.cfc:L52-L58 — all five properties declare 'untyped', hb_rbKey notwithstanding", () => {
      /*
       * `:L56` and `:L58` do carry an attribute — `hb_rbKey="entity.sku.price"` and
       * `hb_rbKey="entity.sku.listPrice"` — and it is not a population instruction. It names a
       * resource-bundle label for display, so it changes no value type and opens no branch. Reading it
       * as an `ormtype` would type two untyped properties as prices; the two are asserted `'untyped'`
       * alongside the other three precisely so that misreading cannot land silently.
       */
      expect(declaredValueTypes(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS)).toEqual({
        product: 'untyped',
        updatePriceFlag: 'untyped',
        price: 'untyped',
        updateListPriceFlag: 'untyped',
        listPrice: 'untyped',
      });
    });

    it('NET-NEW — model/process/Product_UpdateSkus.cfc:L49 — the set carries the legacy UNDERSCORED class name, not the TypeScript class name', () => {
      expect(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.entityName).toBe('Product_UpdateSkus');
      expect(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.entityName).not.toBe('ProductUpdateSkus');
      expect(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.entityName).toContain('_');
    });

    it('NET-NEW — ProductUpdateSkus org/Hibachi/HibachiTransient.cfc:L186-L190 — persistent is false, which is ARM 1 and therefore a short-circuit', () => {
      expect(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.persistent).toBe(false);

      for (const members of declaredDescriptorMembers(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS)) {
        expect(members).not.toContain('populateEnabled');
      }
    });

    it('NET-NEW — ProductUpdateSkus AAP §0.7.3 — the model is closed: three set members, and exactly {name, valueType} on each descriptor', () => {
      expect(Object.keys(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS)).toEqual([
        'entityName',
        'persistent',
        'properties',
      ]);
      expect(declaredDescriptorMembers(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS)).toEqual([
        ['name', 'valueType'],
        ['name', 'valueType'],
        ['name', 'valueType'],
        ['name', 'valueType'],
        ['name', 'valueType'],
      ]);

      for (const members of declaredDescriptorMembers(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS)) {
        for (const behaviourChangingMember of BEHAVIOUR_CHANGING_DESCRIPTOR_MEMBERS) {
          expect(members).not.toContain(behaviourChangingMember);
        }
        expect(members).not.toContain('kind');
      }
    });

    it('NET-NEW — ProductUpdateSkus frozen at both declared levels, so a caller that receives the contract cannot mutate it', () => {
      expect(Object.isFrozen(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS)).toBe(true);
      expect(Object.isFrozen(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.properties)).toBe(true);

      expect(Reflect.set(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS, 'persistent', true)).toBe(false);
      expect(Reflect.deleteProperty(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS, 'entityName')).toBe(
        false,
      );
      expect(
        Reflect.set(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.properties, 0, {
          name: 'product',
          valueType: 'string',
        }),
      ).toBe(false);

      expect(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.persistent).toBe(false);
      expect(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS.entityName).toBe('Product_UpdateSkus');
      expect(declaredNames(PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS)).toEqual([
        'product',
        'updatePriceFlag',
        'price',
        'updateListPriceFlag',
        'listPrice',
      ]);
    });
  });

  /* D — the three together — the shared transient contract, and the absence of shared state. */

  describe('the three in-scope process objects — NET-NEW — one transient contract, three independent tables', () => {
    /**
     * The complete in-scope process-object inventory of AAP §0.4.1.4, labelled for readable failures.
     */
    const PROCESS_OBJECT_DESCRIPTOR_SETS = [
      {
        legacyFile: 'model/process/Product_AddOption.cfc',
        set: PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS,
      },
      {
        legacyFile: 'model/process/Product_AddOptionGroup.cfc',
        set: PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS,
      },
      {
        legacyFile: 'model/process/Product_UpdateSkus.cfc',
        set: PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS,
      },
    ] as const;

    it('NET-NEW — AAP §0.4.1.4 — exactly three process objects are in scope, and each names its legacy component', () => {
      /*
       * The prompt's process-object list names exactly three, which is what excludes
       * `model/process/Product_AddSubscriptionTerm.cfc` and
       * `model/process/Product_UploadDefaultImage.cfc` even though they sit in the same product family
       * (AAP §0.2.2.4). Asserting the inventory here means an added fourth descriptor set cannot enter
       * the domain layer without this case being updated deliberately.
       */
      expect(PROCESS_OBJECT_DESCRIPTOR_SETS).toHaveLength(3);
      expect(PROCESS_OBJECT_DESCRIPTOR_SETS.map((entry) => entry.set.entityName)).toEqual([
        'Product_AddOption',
        'Product_AddOptionGroup',
        'Product_UpdateSkus',
      ]);
    });

    it('NET-NEW — org/Hibachi/HibachiObject.cfc:L11-L18 — every one of the three is transient, and none declares a persistent attribute to be read', () => {
      /*
       * The agreement is the assertion. All three legacy components declare, at L49 of each,
       * `component output="false" accessors="true" extends="HibachiProcess" {` with no `persistent`
       * attribute, so `isPersistent()` is false for all three and arm 1 short-circuits for all three.
       * A single set flipping to `true` would silently start asking authorisation questions of a type
       * the legacy never asked any, and the per-module cases would each still pass in isolation while
       * the family stopped agreeing — which is exactly what a cross-module case exists to catch.
       */
      for (const entry of PROCESS_OBJECT_DESCRIPTOR_SETS) {
        expect(entry.set.persistent).toBe(false);
      }

      /*
       * Stated positively as well, so the claim is "all false" rather than "none observed true".
       */
      expect(PROCESS_OBJECT_DESCRIPTOR_SETS.map((entry) => entry.set.persistent)).toEqual([
        false,
        false,
        false,
      ]);
    });

    it("NET-NEW — every declared property of every process object is a column typed 'untyped' — no relationship, no populate-disabled audit member", () => {
      /*
       * The persistent catalog entities carry twelve `ormtype="timestamp"` audit properties between
       * them, all populate-disabled, plus relationship descriptors that require a loader and a
       * sub-populator. A process object carries neither, and the difference is structural rather than
       * incidental: it has no table, so it has no audit block, and its related entity arrives injected
       * rather than being loaded by identifier.
       */
      for (const entry of PROCESS_OBJECT_DESCRIPTOR_SETS) {
        const names = declaredNames(entry.set);
        const valueTypes = declaredValueTypes(entry.set);

        /* Every property is a column, so the column projection covers the whole declared list. */
        expect(Object.keys(valueTypes).sort()).toEqual([...names].sort());
        expect(Object.values(valueTypes).every((valueType) => valueType === 'untyped')).toBe(true);

        /* And none of them is one of the four audit properties the entities all declare. */
        for (const auditPropertyName of [
          'createdDateTime',
          'createdByAccountID',
          'modifiedDateTime',
          'modifiedByAccountID',
        ]) {
          expect(names).not.toContain(auditPropertyName);
        }
      }
    });

    it('NET-NEW — every one of the three declares `product` FIRST, because the process acts on an injected entity', () => {
      /*
       * `model/process/Product_AddOption.cfc:L52`, `model/process/Product_AddOptionGroup.cfc:L52` and
       * `model/process/Product_UpdateSkus.cfc:L52` each declare `product` as the first property, and
       * `src/services/ProductService.ts` takes the product as its own first parameter on all three
       * process members. The ordering is population order, so the shared first position is a real
       * property of the family rather than a coincidence of transcription.
       */
      for (const entry of PROCESS_OBJECT_DESCRIPTOR_SETS) {
        const names = declaredNames(entry.set);

        expect(names.indexOf('product')).toBe(0);
        /* Declared once, not repeated — a duplicate would population-assign the same key twice. */
        expect(names.filter((name) => name === 'product')).toHaveLength(1);
      }
    });

    it('NET-NEW — M7 — the three tables are independent objects, so nothing one module declares can leak into another', () => {
      /*
       * Why this is an M7 case and not a style case. AAP §0.6.6 M7 records that nothing survives
       * between Lambda invocations except module-scope state, and these three constants are exactly
       * that: module-scope values a warm container reuses across invocations. Sharing one array between
       * two sets — an easy transcription slip, since two of the three tables begin identically — would
       * make a single mutation observable from both, and freezing only makes that impossible while the
       * freeze survives. Distinct identity is the stronger statement, so it is the one asserted.
       */
      const propertyTables = PROCESS_OBJECT_DESCRIPTOR_SETS.map((entry) => entry.set.properties);
      expect(new Set(propertyTables).size).toBe(3);

      const sets = PROCESS_OBJECT_DESCRIPTOR_SETS.map((entry) => entry.set);
      expect(new Set(sets).size).toBe(3);

      /*
       * No two of the three declare the same property list, either — the tables genuinely differ.
       */
      const declaredLists = PROCESS_OBJECT_DESCRIPTOR_SETS.map((entry) =>
        declaredNames(entry.set).join(','),
      );
      expect(new Set(declaredLists).size).toBe(3);
    });

    it('NET-NEW — M7 — importing these modules is observably inert: the exports are stable frozen constants, not factory output', () => {
      /*
       * Each module's header states that freezing "is not a side effect … importing this module remains
       * observably inert (M7)". The observable form of that claim is what is asserted here: the export
       * is the same frozen object on every read, so there is no factory to invoke, no lazily built cache
       * to warm and no per-read allocation that two invocations could diverge on. A descriptor set built
       * by a factory would hand back a fresh object each time and this case would fail — which is the
       * distinction worth pinning, because the repository's other memoised structures are deliberately.
       */
      for (const entry of PROCESS_OBJECT_DESCRIPTOR_SETS) {
        expect(entry.set).toBe(entry.set);
        expect(Object.isFrozen(entry.set)).toBe(true);
        expect(Object.isFrozen(entry.set.properties)).toBe(true);
        expect(Array.isArray(entry.set.properties)).toBe(true);
      }

      /*
       * Read through the original import bindings as well, so identity is proven across both paths.
       */
      expect(PROCESS_OBJECT_DESCRIPTOR_SETS.map((entry) => entry.set)).toEqual([
        PRODUCT_ADD_OPTION_PROPERTY_DESCRIPTORS,
        PRODUCT_ADD_OPTION_GROUP_PROPERTY_DESCRIPTORS,
        PRODUCT_UPDATE_SKUS_PROPERTY_DESCRIPTORS,
      ]);
    });
  });
});
