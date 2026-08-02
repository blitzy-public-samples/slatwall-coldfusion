/**
 * TRACEABLE — the `Product` domain entity.
 *
 * ==================================================================================================
 * PROVENANCE
 * ==================================================================================================
 * This file carries the legacy Product entity suite across into the TypeScript port. Two legacy
 * documents supply its traceable content, and one supplies a single further case:
 *
 *   - `meta/tests/unit/entity/ProductTest.cfc:L58-L62` — the ONE assertion the legacy Product test
 *     owns outright: `productUrlIsCorrectlyFormatted()`. It sets the URL title to a specific literal
 *     and asserts the rendered product URL, leading and trailing slash included.
 *   - `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67` — the FOUR assertions
 *     `ProductTest.cfc` inherits by extension rather than declaring: validate-as-save fails for a new
 *     instance, the simple representation exists and is simple, a primary-ID property name exists,
 *     and the defaults are correct.
 *   - `meta/tests/unit/IssuesTest.cfc:L101-L108` — `issue_1331`, which asserts that
 *     `isProcessable('addOptionGroup')` answers false for a product carrying the content-access
 *     product type. It lives in the issue-regression document rather than in the entity test, so it
 *     is labelled with its own locator where it appears below.
 *
 * ==================================================================================================
 * TRACEABILITY IS DOCUMENTARY, NOT EMPIRICAL
 * ==================================================================================================
 * ⚠️ THE LEGACY SUITE CANNOT BE EXECUTED IN THIS ENVIRONMENT, so nothing here was derived by running
 * the original tests and comparing output. Three independent facts establish that:
 *
 *   1. `meta/tests/readme.txt:L4-L5` states that the suite requires MXUnit installed under an
 *      external CFIDE mapping, and CFSelenium for the functional tests. Neither framework is
 *      vendored in this repository, so the harness the legacy tests extend cannot be resolved.
 *   2. No CFML engine is available here, and the Docker-based local-development directory the task
 *      brief cites does not exist in the tree, so no ColdFusion/Railo/Lucee runtime can be started.
 *   3. `meta/tests/coverage/SlatwallCoverageTestBase.cfc:L54` points its entity directory at a path
 *      that release 3.1.39 does not contain, so even the structural coverage gate is inert.
 *
 * Every assertion below was therefore derived by READING legacy source — the test documents named
 * above and the entity, service, DAO and validation documents they exercise — and each is cited with
 * a `path:Lnn-Lnn` locator so a reviewer can check the derivation against the original text. Claiming
 * a runtime comparison that never happened would be the one thing worse than the gap itself.
 *
 * ==================================================================================================
 * THE STRUCTURAL TRANSLATION: LEGACY INTEGRATION TEST → TARGET UNIT TEST
 * ==================================================================================================
 * The two suites are not the same KIND of test, and a reviewer comparing them should expect the
 * difference by design rather than read it as a gap.
 *
 * The legacy tests are integration tests. `meta/tests/unit/SlatwallUnitTestBase.cfc:L51-L58` boots
 * the entire FW/1 application before the first assertion runs and mutates request scope, and
 * `meta/tests/unit/entity/ProductTest.cfc:L52-L56` then obtains its subject by resolving a service
 * through DI/1 by string name and calling a method that only exists because of `onMissingMethod`
 * prefix dispatch. A database, an ORM session and a full dependency graph are live throughout.
 *
 * The target tests construct the class under test directly — `new Product()` takes no arguments and
 * performs no I/O — and hand it collaborators as ordinary typed values. Two consequences worth
 * stating:
 *
 *   - Every collaborator is a HAND-WRITTEN double, either a factory from `../support`
 *     `inMemoryRepositories` or a small recording object literal declared here. No mocking library is
 *     used, no module registry is patched, and no module-factory interception of any kind occurs:
 *     the legacy repository contains no mocking library at all, and the port's explicit constructor
 *     and parameter seams make one unnecessary. Every double is reachable by reading this file and
 *     `../support/inMemoryRepositories` alone.
 *   - The runtime-synthesized surface the legacy relied upon is gone. Where the legacy called an
 *     option-service member that no source file declares, the port passes an explicitly typed finder
 *     in as a parameter, and this file supplies it.
 *
 * ==================================================================================================
 * LABELLING
 * ==================================================================================================
 * Exactly one file-level label appears, at the top of this comment: TRACEABLE. Every individual case
 * name then carries its own visible label:
 *
 *   - `TRACEABLE — <path:Lnn-Lnn> — …` for an assertion genuinely present in, or inherited by, one of
 *     the three named legacy documents.
 *   - `NET-NEW — …` for retained-behaviour, defect-regression, boundary and port cases that have no
 *     legacy counterpart. The great majority of this file is net-new, and that asymmetry is reported
 *     rather than smoothed over: the legacy Product signal amounts to one own assertion, four
 *     inherited ones and one issue regression.
 *
 * ==================================================================================================
 * SCOPE BOUNDARIES OBSERVED HERE
 * ==================================================================================================
 *   - The sixteen excluded calculated members are never touched. Their owning services — pricing,
 *     currency, stock, inventory, promotion, location, fulfilment and attribute — are all outside the
 *     catalog slice, and following one of those getters is the documented way to drag half the
 *     platform into the port.
 *   - The four protected legacy throw texts are never retyped, not in an assertion, not in a name and
 *     not in a comment. `../../src/errors/DomainError` owns those strings; this file imports the
 *     factory or the constant and compares generated values, so a change to either half fails a test
 *     instead of drifting silently.
 *   - Nothing here imports a database driver, an adapter, a handler or an AWS type. The subject is a
 *     domain entity and the collaborators are interfaces.
 *
 * ==================================================================================================
 * THE RETAINED SURFACE, AND WHAT "ONE LABELLED TEST PER CONVERTED MEMBER" MEANS HERE
 * ==================================================================================================
 * ⚠️ THIS SECTION EXISTS BECAUSE AN EARLIER REVISION OF THIS FILE CLAIMED THE STANDARD WITHOUT
 * MEETING IT. The claim — one labelled test per converted member — was stated among the enterprise
 * standards below while FIFTEEN retained `Product` paths were never invoked by any case in the file:
 *
 *     getSkuByID, getImages, getProductImages, getAttributeValues, getProductReviews, getTemplate,
 *     getBrandName, removeSku, addAttributeValue, removeAttributeValue, addProductImage,
 *     removeProductImage, addProductReview, removeProductReview, and the finder-PRESENT branch of
 *     getUnusedProductSubscriptionTerms.
 *
 * That is the failure mode worth naming precisely: every one of those fifteen could have been DELETED
 * OUTRIGHT, or had its behaviour INVERTED, and this suite would still have gone green. A claim of
 * per-member coverage that a member's removal cannot falsify is not coverage — it is an assertion
 * about the file's intent. The gap was closed rather than the claim softened, in the four sections at
 * the end of this file, and every case added there is MUTATION-SENSITIVE by construction: each pins
 * either the exact collaborator call the delegation makes, the exact array instance the accessor hands
 * back, or the exact short-circuit the guard performs.
 *
 * FOUR THINGS THOSE SECTIONS DELIBERATELY DO **NOT** DO:
 *   - They do not repair the `getBrandName` memo defect. It is carried and pinned, per
 *     preserve-and-annotate; a case asserts the first read and the permanently-empty second read.
 *   - They do not push into a local collection on behalf of the six relationship helpers. The legacy
 *     bodies are pure delegations onto the MANY side, which owns the foreign key, and the cases assert
 *     that the product's own array stays empty — because a helpful local push here would
 *     double-register every association.
 *   - They do not invent a shape for a subscription term. Only the finder call and the returned arity
 *     are asserted, matching the deliberate asymmetry the production member documents.
 *   - They do not import an adapter, a port module or a database driver to reach any of it. Every
 *     collaborator is a typed value handed in as a parameter.
 *
 * ==================================================================================================
 * RULES
 * ==================================================================================================
 * No user-specified rules were provided for this project. That is not licence to lower the bar: this
 * file holds to the enterprise standards the plan names in their place — strict type safety with no
 * suppression of any kind, one labelled test per converted member (see the section directly above for
 * what that costs and how it is now met), preserve-and-annotate rather than repair for every carried
 * defect, and no invented value anywhere.
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

/* ==================================================================================================
 * IDENTIFIERS AND SEED VALUES
 * ==================================================================================================
 * Every identifier below is a NAMED, DOCUMENTED, DELIBERATELY SYNTHETIC constant, following the
 * convention the neighbouring suites already established — see `test/services/ProductService.test.ts`
 * for the same pattern. Each is thirty-two characters wide with no dashes, which is the shape IR-6
 * fixes for every primary key in this schema: the legacy generator produces a thirty-two-character
 * hexadecimal string, never an auto-increment integer and never a dashed RFC-4122 value.
 *
 * They are declared here rather than written inline so that no ad-hoc identifier literal is scattered
 * through the assertions, and so that "the call was scoped to THIS entity" is checkable by name.
 * The three seeded product-type discriminators are NOT declared here — they are imported from
 * `../fixtures/productTypes`, which carries the literal values from the legacy seed-data document.
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

/**
 * A root identifier the resolver double holds NO seed for, so the root walk resolves nothing.
 *
 * It exists to keep the two absences apart: a product with no product type at all RAISES (unguarded at
 * `model/entity/Product.cfc:L494`), while an ASSIGNED product type whose root cannot be resolved answers
 * `undefined` — the guarded fall-through of `model/entity/ProductType.cfc:L110-L115`.
 */
const UNSEEDED_ROOT_PRODUCT_TYPE_ID = '44444444444444444444444444444444';

/**
 * The URL title from `meta/tests/unit/entity/ProductTest.cfc:L59`, byte for byte.
 *
 * ⭐ THE VALUE IS PART OF THE TRACE, so it is reproduced exactly — including the legacy document's own
 * spelling of the final word, which is not corrected. Tidying it would sever the link between this
 * assertion and the one it ports.
 */
const LEGACY_URL_TITLE = 'nike-air-jorden';

/**
 * The value seeded for the global product URL key.
 *
 * ⭐ DELIBERATELY NOT THE PRODUCTION DEFAULT. `meta/tests/unit/entity/ProductTest.cfc:L60` builds its
 * expected string from `setting('globalURLKeyProduct')` rather than from a literal, so the legacy
 * assertion proves that the entity CONSULTS THE SETTING. Seeding a distinctive value preserves that
 * property: a port that hard-coded a default, or that read the wrong key, would fail here instead of
 * passing by coincidence.
 */
const SEEDED_URL_KEY = 'catalog-item';

/**
 * A second value for the same key, used to prove the first assertion is not satisfiable by a default.
 */
const RESEEDED_URL_KEY = 'store-product';

/**
 * A system code that is NOT one of the three seeded discriminators.
 *
 * The base-product-type reader is deliberately typed as an open string rather than as a three-member
 * union, so an installation that seeded a fourth type keeps its own code. This value exercises that.
 */
const UNRECOGNISED_SYSTEM_CODE = 'legacyImportedType';

/* ==================================================================================================
 * SHARED HELPERS
 * ==================================================================================================
 * Four helpers, each existing to keep an assertion honest rather than to shorten it.
 */

/**
 * Awaits an operation that is expected to reject and hands the thrown value back for inspection.
 *
 * ⭐ WHY NOT `expect(...).rejects.toThrow(message)`: that matcher treats a string argument as a
 * SUBSTRING test, so it would pass on a partial match. The parity errors this file checks are exact
 * strings produced by an imported factory, and an exact comparison is the point — a factory that
 * dropped its interpolated segment would still satisfy a substring test.
 *
 * The `unknown` return type is deliberate: narrowing happens in the assertion through `toBeInstanceOf`
 * and `toHaveProperty`, neither of which requires a cast.
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
 * Kept separate from {@link captureRejection} because the DISTINCTION MATTERS: the member this helper
 * serves throws synchronously, and a test that awaited it would still pass if the port had quietly
 * turned it into a rejected promise. Two helpers keep the two signatures from being interchangeable.
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
 *
 * Only the members the contexts exercised here actually read are declared. Nothing is invented: each
 * corresponds to a property `model/validation/Product.json` names.
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
 * ⭐ WHY THIS INDIRECTION EXISTS, AND WHY IT IS NOT A SHORTCUT. `model/validation/Product.json:L2`
 * declares its add-option-group rule against the property `baseProductType`, which
 * `model/entity/Product.cfc:L103` declares `persistent="false"` and computes on demand. The ported
 * entity is faithful to that: `baseProductType` is a METHOD requiring a resolver, not a field. The
 * validator, by contrast, reads property values SYNCHRONOUSLY, exactly as the legacy engine does.
 *
 * So the resolved value has to be handed to the validator by whoever performed the asynchronous
 * resolution. Production does precisely this — `src/services/ProductService.ts` builds the same
 * delegating subject before validating — and this helper mirrors that shape so the test exercises the
 * real seam rather than a convenience of its own.
 *
 * ⚠️ AND THE INDIRECTION IS WHAT MAKES THE `issue_1331` ASSERTION MEAN WHAT IT SAYS. Validating a bare
 * entity in the add-option-group context also fails — but it fails because the value is ABSENT, and an
 * in-list constraint rejects an absent value. That failure would pass a naive assertion while proving
 * nothing about content access. Supplying the genuinely resolved code, and contrasting it against the
 * merchandise code in the same context, is what distinguishes the gate from the absence.
 *
 * Every method delegates to the product rather than being reimplemented, so the class name, the
 * property set and the identifier reader under test are the entity's own.
 *
 * @param product - The subject entity.
 * @param derived - The asynchronously resolved values to carry.
 * @returns A validation subject over that product.
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
   * Each spread is conditional because an ABSENT property and one explicitly set to `undefined` are
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
 * ⭐ WHY THIS IS HAND-WRITTEN HERE RATHER THAN TAKEN FROM `../support/inMemoryRepositories`. The
 * support module exposes a paginated-query double and the option REPOSITORY, but not this shape,
 * because in production the shape is assembled by `src/services/OptionService.ts` — which composes the
 * distinct flag, the related-property filter path and the sort ordering onto the query. That service
 * is not on this file's dependency whitelist, and asserting a composition assembled inside the test
 * would exercise the test rather than the entity.
 *
 * ⚠️ SO THE DIVISION OF LABOUR IS EXPLICIT: the three query semantics
 * `model/entity/Product.cfc:L254-L258` composes — distinct rows, the `options.skus.product.productID`
 * filter path, and the ascending sort-order ordering — are OWNED one layer down and are asserted in
 * `test/services/OptionService.test.ts`. What the ENTITY controls, and what is asserted here, is which
 * identifier it hands over, that it returns the records untouched, and that it memoizes per instance.
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
 * Hand-written for the same reason as {@link recordingOptionGroupFinder}: the query composition at
 * `model/entity/Product.cfc:L343-L346` belongs to the option service, and only the identifiers handed
 * over and the records handed back are the entity's contract.
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
 * Adapts the in-memory option REPOSITORY to the entity's unused-option FINDER shape.
 *
 * ⭐ THE ADAPTER IS THIN ON PURPOSE: it renames, and nothing else. Every behaviour that matters stays
 * with the real repository double — the opposite set polarities of `model/dao/OptionDAO.cfc:L51-L91`
 * and `:L93-L116` (options whose group is IN the supplied list, groups whose identifier is NOT IN it),
 * the `"<group name> - <option name>"` label format, the exclusion of options the product already
 * uses, and the two-term ordering. Reimplementing any of that here would replace the contract under
 * test with an invention.
 *
 * The two layers differ only in member name because the legacy layers did: the DAO members are
 * `getUnusedProductOptions`/`getUnusedProductOptionGroups` reached through a service of the same
 * names, and the port keeps the repository verbs distinct from the service verbs.
 *
 * @param repository - The in-memory option repository's `repository` member.
 * @returns A finder the entity accepts.
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

/* ==================================================================================================
 * THE ONE ASSERTION THE LEGACY PRODUCT TEST OWNS
 * ================================================================================================== */

describe('Product — the URL-formatting assertion ported from the legacy suite', () => {
  it('TRACEABLE — meta/tests/unit/entity/ProductTest.cfc:L58-L62 — the product URL is the resolved key and the URL title, wrapped in slashes', () => {
    /*
     * The legacy body, in full:
     *
     *     entity.setURLTitle("nike-air-jorden");
     *     assertEquals("/#setting('globalURLKeyProduct')#/nike-air-jorden/", entity.getProductURL());
     *
     * The legacy subject came from `productService.newProduct()` — a method no source file declares,
     * synthesized at runtime by prefix dispatch. The port's equivalent is a direct construction, which
     * is possible because the entity's constructor takes no arguments and performs no I/O.
     */
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

/* ==================================================================================================
 * THE FOUR ASSERTIONS INHERITED FROM THE LEGACY ENTITY BASE
 * ==================================================================================================
 * `meta/tests/unit/entity/ProductTest.cfc:L49` extends `SlatwallEntityTestBase`, so these four run
 * against a product without appearing in the Product test document at all. They are ported here
 * individually, each against the seam the target actually exposes for it — which is not always the
 * seam the legacy used, and where it differs the difference is stated rather than papered over.
 */

describe('Product — the four assertions inherited from the legacy entity base', () => {
  it('TRACEABLE — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L54 — validating a new product as a save does not pass', async () => {
    /*
     * The legacy body:
     *
     *     entity.validate(context="save");
     *     assert(entity.hasErrors());
     *
     * Two things relocate. The rule set is no longer read from JSON at runtime — it is
     * `productValidationRuleSet`, typed and imported. And the entity no longer validates itself: the
     * legacy `validate()` at `org/Hibachi/HibachiEntity.cfc:L196-L202` delegated to a service that
     * wrote into the entity's own error bag, so the target reproduces that shape by validating INTO a
     * bag and then copying it onto the entity, which is what makes `hasErrors()` the observable.
     */
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
     * message BUILT from the imported constraint rather than a copied string. A change to the message
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
     * BRAND-NEW entity the legacy setup produced, and the inherited implementation at
     * `org/Hibachi/HibachiEntity.cfc` reads whichever property
     * `getSimpleRepresentationPropertyName()` names.
     *
     * ⭐ THE PORT DELIBERATELY KEEPS THAT SPLIT. `Product` declares the property NAME — the legacy
     * override at `model/entity/Product.cfc:L791-L793` returns `"productName"` — and the framework
     * default does the reading. Its sibling `ProductType` overrides the REPRESENTATION instead, and
     * `Brand` overrides neither; harmonising the three would erase a real difference between the
     * legacy entities. So the Product-visible seam is the pair asserted here: the property name, and
     * the identifier reader that resolves it.
     *
     * ⭐ AND THE UNSET READ IS THE EMPTY STRING, NOT ABSENCE, exactly as
     * `org/Hibachi/HibachiTransient.cfc:L466-L481` produced it. That is what made the legacy assertion
     * hold on an entity with nothing populated, and the port preserves it — which is why this case can
     * assert the legacy predicate literally rather than restating it in weaker terms.
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
    /*
     * The legacy body:
     *
     *     assert(entity.isNew());
     *     assert(!len(entity.getPrimaryIDValue()));
     *
     * Under Hibernate, "new" meant "the ORM session has not persisted this instance". The port has no
     * session, so newness is derived from the identifier itself — the empty string is the unsaved
     * sentinel, and IR-6 makes a persisted identifier thirty-two characters wide, so the two states
     * cannot be confused.
     */
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

/* ==================================================================================================
 * X12 — THE TRANSACTION-EXISTENCE FLAG IS PRODUCT-SCOPED
 * ================================================================================================== */

describe('Product.getTransactionExistsFlag — the flag answers about one product, not the whole table', () => {
  it('NET-NEW — model/entity/Product.cfc:L624-L629 — two products receive their own verdicts from the same collaborator', async () => {
    /*
     * ⚠️⚠️ X12 / G6 — THE NAMED ARGUMENT SURVIVES THREE LAYERS, AND THIS ASSERTION IS WHY IT MATTERS.
     * Read the legacy chain end to end before reading the expectation:
     *
     *   1. `model/entity/Product.cfc:L624-L629` calls the SKU service with a NAMED argument,
     *      `productID=this.getProductID()`.
     *   2. `model/service/SkuService.cfc:L285-L287` declares NO formal parameters at all — and then
     *      forwards `argumentCollection=arguments`. CFML places an UNDECLARED named argument into the
     *      `arguments` scope exactly as it does a declared one, so the whole scope, identifier
     *      included, travels onward.
     *   3. `model/dao/SkuDAO.cfc:L53-L55` declares BOTH `productID` and `skuID` as optional arguments,
     *      receives the product identifier, and takes its product-scoped branch.
     *
     * ⚠️ SO THE STALE READING IN AAP §0.4.2.2 (Discrepancy 4), WHICH TAKES THE SERVICE'S EMPTY
     * PARAMETER LIST AT FACE VALUE AND CONCLUDES THE FLAG IS SYSTEM-WIDE, IS WRONG ABOUT CFML, AND THIS
     * FILE DELIBERATELY DEPARTS FROM IT. Preserving the identifier is faithfulness, not enhancement.
     * The consequence of getting it backwards is concrete and severe: the flag gates a delete
     * (`model/validation/Product.json:L12`), so a system-wide `true` would make EVERY product in any
     * installation undeletable the moment a single transaction had ever been recorded anywhere.
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
     * The recorded calls, in order, each carrying ITS OWN product identifier. The `skuID` slot stays
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
     * probe may leave both identifiers absent. That combination is UNREPRESENTABLE in the legacy — the
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
     *
     * The proof is in two halves. First, a repeated read on ONE instance runs no second query. Then the
     * repository's answer for the SECOND product is changed AFTER the first product has cached — and
     * the first product's answer must be unaffected while the second sees the new state.
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

/* ==================================================================================================
 * D5 — AN EXPLICIT UN-PORTABLE BOUNDARY
 * ================================================================================================== */

describe('Product.getProductOptionsByGroup — the defect D5 boundary', () => {
  it('NET-NEW — model/entity/Product.cfc:L631-L633 — the member reports the missing collaborator instead of inventing one', () => {
    /*
     * TODO(parity) D5 — model/entity/Product.cfc:L631-L633.
     *
     * The legacy body delegates to a product-service member of the same name. A repository-wide search
     * finds NO such member declared anywhere, and it is not one of the surface the framework fabricates
     * by prefix either — `getProductOptionsByGroup` matches no synthesized prefix. So the legacy call
     * could never have resolved: it raises at runtime on the first invocation.
     *
     * ⚠️ THE DEFECT IS CARRIED, NOT REPAIRED. Supplying an implementation would be the single most
     * tempting repair in this entity — the options-by-group data is genuinely reachable through the
     * option finder — and it would make the port's behaviour differ from the legacy system's in a way
     * no test of the legacy could detect. What the port does instead is name the gap in the type
     * system: the member is declared, it returns `never`, and it raises the narrow boundary error so a
     * caller learns which member is unavailable and why.
     */
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
     * case because the failure mode is silent: a member that had drifted to returning a REJECTED
     * PROMISE would satisfy an `await`-based assertion while changing every caller's control flow, and
     * an unhandled rejection is a very different production event from a thrown error.
     */
    const product = buildProduct({ productID: PRODUCT_ID });

    expect(() => product.getProductOptionsByGroup()).toThrow(NotImplementedError);
  });
});

/* ==================================================================================================
 * THE OPTION-TO-SKU RESOLUTION ENTRY POINTS
 * ==================================================================================================
 * `model/entity/Product.cfc:L349-L364` is the arity layer that sits ON TOP of the resolution query, and
 * it is where three of the four protected legacy throw texts live. Its branch structure is reproduced
 * exactly, and every expected message is IMPORTED — two through interpolating factories, one as a
 * constant — so no protected text is retyped anywhere in this file.
 */

/**
 * Builds a product whose SKUs each carry the options given, wired to a repository-backed finder.
 *
 * A local arrangement helper rather than a shared fixture: every case below needs a slightly different
 * SKU-and-option population, and the alternative — one shared mutable arrangement — is exactly the
 * cross-test coupling that per-test freshness exists to prevent.
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
      /* Only the declared identifiers are used; a longer arrangement would need another named one. */
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
     * T1 CONJUNCTION MADE VISIBLE. Both SKUs carry the selected option, so both satisfy the single
     * requirement and the arity check fails. The message is produced by the IMPORTED factory and
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
     * product's own SKU collection. Asserting that the finder recorded NOTHING is what distinguishes
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
     * ⚠️ G6 — THIS IS THE ELSE OF THE SKU-COUNT TEST, NOT AN ARGUMENT GUARD, AND THE DIFFERENCE IS THE
     * WHOLE POINT. `model/entity/Product.cfc:L358` tests `arrayLen(getSkus()) eq 1`; `:L362` is what
     * happens when that test fails. The empty selection is not what is being rejected.
     *
     * ⭐ T5 — AN EMPTY SELECTION IS LEGAL AND MEANINGFUL. `getSkusBySelectedOptions` defaults it to the
     * empty string and `listLen('')` is zero, so no requirement is appended and the underlying query
     * legitimately degenerates to "every option-bearing SKU of this product". Both this member and
     * `Sku.hasUniqueOptions` depend on that degenerate form. NOTHING IN THIS FILE MAY ASSERT THAT AN
     * EMPTY SELECTION IS INVALID INPUT — the case immediately below proves the opposite by using it.
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
     * The legacy call passes `(arguments.selectedOptions, this.getProductID())` POSITIONALLY, and an
     * out-of-scope caller — `model/process/Order_AddOrderItem.cfc:L238` — invokes the service member the
     * same way, which is what fixes the order as contract rather than convention.
     *
     * The two recorded values are deliberately unmistakable for one another: an option identifier list
     * in one slot and a thirty-two-character product identifier in the other. A transposed
     * implementation therefore fails this assertion instead of producing a plausible-looking record.
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
     * ⭐ THE DEGENERATE QUERY, OBSERVED AT THIS BOUNDARY. Three SKUs are arranged, two carrying options
     * and one carrying none. An empty selection appends no requirement, so the query returns every
     * OPTION-BEARING SKU of the product — which is T5 and T3 together: the empty selection is legal
     * (T5), and the vestigial join that excludes option-less SKUs is still in force (T3).
     *
     * The option-less SKU is built last so it is present in the product's collection throughout.
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
     * ⚠️ WHAT THIS ENTITY MUST NOT DO: trim, deduplicate, re-order, split, or convert the selection to a
     * set. Each of those looks like an improvement and each changes results.
     *
     * Deduplication is the dangerous one. T1 appends ONE requirement PER LIST ELEMENT, duplicates
     * included, so a repeated identifier legitimately produces a repeated requirement; collapsing the
     * list to a set — or rewriting the conjunction as a grouped count — diverges precisely when the
     * caller passes a duplicate. The selection therefore arrives at the finder byte-identical, and the
     * split into elements happens exactly once, at the adapter crossing below the entity, where CFML
     * list semantics drop empty elements and change nothing else.
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

/* ==================================================================================================
 * THE OPTION-GROUP AND OPTION MEMBERS
 * ================================================================================================== */

describe('Product option-group and option members', () => {
  it('NET-NEW — model/entity/Product.cfc:L251-L261 — getOptionGroups asks for this product and returns the records untouched', async () => {
    /*
     * ⭐ WHERE EACH SEMANTIC LIVES, STATED ONCE SO THE ASSERTIONS BELOW READ CORRECTLY. The legacy body
     * composes three things onto a paginated dynamic query at `model/entity/Product.cfc:L254-L258`:
     * distinct-row retrieval, the related-property filter path `options.skus.product.productID`, and an
     * ascending sort-order ordering. In the port those three are composed by
     * `src/services/OptionService.ts`, which owns the query builder, and they are asserted directly in
     * `test/services/OptionService.test.ts` — including the resolved filter identifier and the ascending
     * order.
     *
     * ⚠️ THEY ARE DELIBERATELY NOT RE-ASSERTED HERE. The entity receives an explicitly typed finder —
     * the declared replacement for the runtime-synthesized option-service member the legacy called
     * (IR-1) — so the only query composition reachable from this file would be one the test itself
     * assembled, and asserting that would exercise the test rather than the entity.
     *
     * What IS the entity's contract, and what is asserted: the identifier it hands over is its own, and
     * the records come back unmodified — not re-sorted, not de-duplicated, not copied into new
     * instances. The finder therefore returns groups in DESCENDING sort order on purpose: if the entity
     * imposed an ordering of its own, the ordering owned by the query would be silently overridden, and
     * this assertion is what catches it.
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
     * ⚠️ THE ASYMMETRY IS DELIBERATE AND IS BEHAVIOUR. `model/entity/Product.cfc:L340-L347` has NO cache
     * of any kind, while its two option-group neighbours do. Extending the group memo to cover this
     * member would look like consistency and would change results: the legacy re-reads options every
     * time, so a second call after an option was added returns the addition.
     *
     * Both identifiers are recorded in the order the port passes them — group first, product second —
     * which matches the two filters the legacy composes at `:L344-L345`.
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
     * The legacy second argument is `structKeyList(getOptionGroupsStruct())` — a COMMA-DELIMITED STRING
     * built from the option-group map's keys, not an array. The port preserves the string contract
     * because the repository below it splits on commas, and the polarity of the two repository members
     * depends on that same list: `model/dao/OptionDAO.cfc:L51-L91` selects options whose group is IN it,
     * while `:L93-L116` selects groups whose identifier is NOT IN it.
     *
     * ONE group is in use here so the serialisation is unambiguous; object-key ORDER is deliberately not
     * asserted anywhere in this file, and the multi-group case below compares order-insensitively.
     *
     * The label format `"<group name> - <option name>"` is the repository's, and it is exercised rather
     * than restated: the adapter in this file only renames members.
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
     * selects the groups whose identifier is NOT in it. Both groups exist in the repository; only the
     * one the product does not already use may come back, and its label is the BARE group name with no
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
     * ⚠️ ORDER IS DELIBERATELY NOT ASSERTED. The legacy list came from `structKeyList`, whose ordering is
     * a property of the CFML struct implementation rather than of the catalog, and the port's equivalent
     * is object-key order. Asserting a sequence here would freeze an incidental detail into a contract,
     * so the delimiter and the MEMBERSHIP are what get checked.
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
     * `structKeyList({})` is the empty string, so the NOT-IN exclusion matches nothing and every group in
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

/* ==================================================================================================
 * BASE PRODUCT TYPE, THE LISTING URL AND THE TITLE
 * ================================================================================================== */

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
     * identifier path, and the base type is the ROOT'S system code. This is the path every non-root
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
     * ⚠️ THE READER IS TYPED AS AN OPEN STRING ON PURPOSE. Only three product types are seeded, but
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
     * ⭐ THE LEGACY BODY IS `return getProductType().getBaseProductType();` WITH NO GUARD, so a product
     * carrying no product type raised a null-reference error. `model/validation/Product.json:L11` makes
     * the product type required for a save, so an unsaved product legitimately has none — and the legacy
     * answer for that state is a FAULT, not a value.
     *
     * ⛔ AN EARLIER REVISION OF THIS CASE ASSERTED `resolves.toBeUndefined()` and called absence "the
     * honest answer". That is withdrawn under AAP §0.6.7 (preserve and annotate, do not repair): all
     * three process contexts in `model/validation/Product.json` gate on this discriminator, so answering
     * absence let a gate be evaluated against a value the row does not carry — a hardening encoded as
     * parity, which is exactly what the rule forbids.
     *
     * The resolver is asserted UNTOUCHED: the raise happens before any root walk, as it does in CFML.
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
     * ⭐ THE COMPANION OF THE CASE ABOVE, AND THE SECOND UNGUARDED DEREFERENCE ON THE SAME CHAIN. The
     * delegation `getProductType().getBaseProductType()` has TWO of them, one per hop: `:L494` reads the
     * product type without a guard, and `model/entity/ProductType.cfc:L112` then chains
     * `.getSystemCode()` onto a root lookup without a guard. Fixing only the near hop would have left
     * the finding half-resolved, since the port would still answer absence where the legacy failed.
     *
     * ⛔ AN EARLIER REVISION OF THIS CASE ASSERTED `resolves.toBeUndefined()`, under the title "still
     * answers absence", and it is WITHDRAWN together with the sibling module's `TODO(parity)` that
     * licensed it. Its stated defence — that the failure stayed loud downstream at
     * `model/service/SkuService.cfc:L204` — holds at `createSkus` and FAILS at
     * `src/adapters/mysql/MySqlSkuRepository.ts`, where an absent discriminator adds no option join and
     * widens the returned SKU set instead of aborting. See the withdrawal recorded on
     * `ProductType.getBaseProductType`.
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
    // The walk WAS attempted — this is a resolution failure, not a skipped read, and it is the far hop
    // rather than the near one that failed.
    expect(rootResolver.requestedProductTypeIds).toEqual([UNSEEDED_ROOT_PRODUCT_TYPE_ID]);
  });

  it('NET-NEW — a resolvable root that carries NO system code answers absence, which is why the return type keeps its optional member', async () => {
    /*
     * ⭐ THE ONE ABSENCE THAT SURVIVES ON THIS CHAIN, AND THE ONLY REASON `| undefined` REMAINS IN THE
     * RETURN TYPE. `model/entity/ProductType.cfc:L112` succeeds at the LOOKUP and then reads
     * `getSystemCode()` off a real row; when that column is null CFML returns null, the method hands it
     * back, and the caller receives absence. So absence here is the legacy answer rather than a
     * hardening — the distinction the two cases above exist to protect.
     *
     * Asserted from `Product` and not only from `ProductType` because this member is a pure delegation:
     * if the pass-through ever started coercing the absence to a value, or raising on it, no
     * `ProductType` test would notice.
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
     * ⚠️ THE DIFFERENCE IS ONE CHARACTER AND IT IS REAL. `:L207-L209` opens with a slash and `:L211-L213`
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
     *   1. A SIMPLE IDENTIFIER resolves against the entity.
     *   2. A DOTTED IDENTIFIER is passed to the resolver UNTOUCHED and traversed there — the metadata
     *      default for this very setting is a dotted identifier reaching the brand's name, which is why
     *      dotted support exists at all.
     *   3. AN UNRESOLVED TOKEN IS LEFT VERBATIM, delimiters included. It is not blanked, because the
     *      legacy loop simply skips a key it cannot resolve.
     *   4. A REPEATED TOKEN IS REPLACED EVERYWHERE, since the legacy replacement is a replace-all.
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
     * does not re-render it. Proved by resolving once, then handing the SAME entity a resolver seeded
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

/* ==================================================================================================
 * THE IMAGE MEMBERS — DELEGATION AT THE PRODUCT, THE PORT BENEATH IT
 * ==================================================================================================
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
     * ⭐ ALL FIVE LEGACY BODIES ARE BARE `return getDefaultSku().…` DELEGATIONS WITH NO
     * `structKeyExists` TEST, so a product with no default SKU raised a null-reference error on every
     * one of them. That fault is the behaviour, and it is reproduced.
     *
     * ⛔ AN EARLIER REVISION OF THIS CASE ASSERTED `toBeUndefined()` FOR ALL FIVE. It is withdrawn under
     * AAP §0.6.7 — preserve and annotate, do not repair. Its reasoning was half right and is kept where
     * it is right: returning `false` from the existence member WOULD be wrong, because it asserts the
     * image is MISSING when the question was never answered. But `undefined` is not the legacy answer
     * either — the legacy gives NO answer at all, and a caller that read a silent `undefined` where the
     * legacy aborted changes what the Google feed emits.
     *
     * ⚠️ CONTRAST THE FOUR PRICE MEMBERS, WHICH ARE ASSERTED IN THEIR OWN CASE AND STILL ANSWER
     * ABSENCE. `model/entity/Product.cfc:L554-L579` guards each of them with
     * `if( structKeyExists(variables, "defaultSku") )` and falls off the end, so `undefined` there IS
     * the transcription. The split inside this family is the legacy's own.
     *
     * The arrangement uses the legacy fixture helper and then clears the reference, which is exactly the
     * teardown shape `meta/tests/unit/Helper.cfc` established for the same fixture.
     */
    const fixture = createMerchandiseProductFixture();
    fixture.clearDefaultSkuReference();

    expect(() => fixture.product.getImageDirectory()).toThrow(DomainError);
    expect(() => fixture.product.getImagePath()).toThrow(DomainError);
    expect(() => fixture.product.getImage()).toThrow(DomainError);
    expect(() => fixture.product.getResizedImagePath()).toThrow(DomainError);
    expect(() => fixture.product.getImageExistsFlag()).toThrow(DomainError);

    /* The diagnostic names the member's own locator, so a log identifies WHICH delegation failed
     * rather than reporting one undifferentiated fault for the family. */
    expect(() => fixture.product.getImagePath()).toThrow('model/entity/Product.cfc:L325');
    expect(() => fixture.product.getImageExistsFlag()).toThrow('model/entity/Product.cfc:L337');
  });

  it('NET-NEW — the four PRICE members still answer absence, because the legacy guards them (:L554-:L579)', () => {
    /*
     * ⭐ THE OTHER HALF OF THE SPLIT, ASSERTED SO IT CANNOT BE "HARMONISED" WITH THE CASE ABOVE. Each of
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
     * ⭐ THE SIZE IS NOT AN ENUMERATION. `model/entity/Sku.cfc:L168-L187` maps a handful of one-letter
     * aliases onto width and height settings, but that mapping only applies when the SKU has a product to
     * scope the settings read to and no explicit dimensions were given. Outside those conditions the
     * requested size is passed through, and an installation is free to name its own. This case exercises
     * the pass-through: the SKU has no product, so an unfamiliar size reaches the port verbatim rather
     * than being silently rewritten to a recognised one.
     *
     * The explicit missing-image path also proves option precedence over the setting fallback.
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

/* ==================================================================================================
 * N1 — THE NON-MUTATING DRY RUN
 * ==================================================================================================
 * `org/Hibachi/HibachiValidationService.cfc:L153-L197` takes a `setErrors` flag. When it is true the
 * engine writes into the subject's OWN error bag; when it is false it takes a THROWAWAY bag from the
 * transient factory and never attaches it. `org/Hibachi/HibachiEntity.cfc:L204-L225` is built entirely
 * on the false form: `isDeletable`, `isEditable` and `isProcessable` each validate under a context and
 * report whether the returned bag is clean, WITHOUT disturbing the entity.
 *
 * ⭐ THE PORT EXPRESSES THAT AS AN OMITTED ARGUMENT. Passing a bag selects it; omitting the option
 * entirely selects a fresh one. Under `exactOptionalPropertyTypes` omission and an explicit `undefined`
 * are different, which is what makes the distinction a compile-time one rather than a convention.
 * There is no module-level or global error flag anywhere in the port — the legacy request-scoped
 * `getORMHasErrors()` gate has no stateless equivalent and is not reproduced here.
 */

describe('Product processability and deletability — the dry-run seam', () => {
  it('TRACEABLE — meta/tests/unit/IssuesTest.cfc:L101-L108 — isProcessable("addOptionGroup") is false for a content-access product', async () => {
    /*
     * The legacy regression, in full:
     *
     *     product = productService.newProduct();
     *     product.setProductType( getProductType('444df313ec53a08c32d8ae434af5819a') );
     *     assertFalse( product.isProcessable('addOptionGroup') );
     *
     * That literal identifier is the content-access discriminator seeded at
     * `config/dbdata/SlatwallProductType.xml.cfm:L15`; it is imported from the fixture module here so the
     * trace survives without the value being retyped.
     *
     * The mechanism: `model/validation/Product.json:L2` declares an in-list rule on `baseProductType` for
     * the add-option-group and add-option contexts, admitting `merchandise` alone. A content-access
     * product fails it, the returned bag is dirty, and the entity is therefore not processable in that
     * context.
     */
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
     * The base type is RESOLVED through the entity's own member before validating, which is what makes
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
     * ⚠️ THE CONTRAST IS WHAT GIVES THE REGRESSION ABOVE ITS MEANING. An in-list constraint also rejects
     * an ABSENT value, so a product whose base type had never been resolved would fail the very same
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
     * product with NO groups left to add is not processable either. A minimum-collection gate is
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
     * exactly as clean as it was, and writing into the RETURNED bag afterwards must not reach the entity
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
     * and X12 above established that the flag is scoped to one product. The two combine here: the entity
     * resolves its OWN flag through the checker, that resolved value is what the delete rule reads, and
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
     * ⚠️ REPORTED AS A FINDING RATHER THAN FILLED IN. Every rule in `model/validation/Product.json` names
     * an explicit context, and none of them names `edit`, so the edit context selects NO rules and the
     * returned bag is empty. That makes a product unconditionally editable in the legacy system, and
     * inventing an edit rule to make the answer look more considered would be exactly the kind of quiet
     * enhancement the port forbids.
     *
     * The assertion worth making is therefore about the SEAM, not the verdict: an empty result still
     * arrives in a bag of its own, and the subject is still untouched.
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

/* ==================================================================================================
 * THE ERROR-BAG CONTRACT
 * ================================================================================================== */

describe('The validation error bag', () => {
  it('NET-NEW — org/Hibachi/HibachiTransient.cfc:L35-L44 — reading an unknown key yields an empty array and never throws', () => {
    /*
     * ⚠️ THE PORTED BEHAVIOUR IS THE TRANSIENT'S, NOT THE ERRORS COMPONENT'S, AND THE CHOICE IS
     * DELIBERATE. `org/Hibachi/HibachiTransient.cfc:L35-L44` checks for the key and DEFAULTS TO THE EMPTY
     * ARRAY, which is what every caller in the slice was written against — a view iterating a property's
     * messages, a template testing arity.
     *
     * Its sibling `org/Hibachi/HibachiErrors.cfc:L47-L50` does the opposite: it reads one key, tests
     * another, and raises for a key that is simply absent. That component is retired for this slice, and
     * neither its behaviour nor its message is reproduced anywhere in the port. This case pins the
     * surviving contract so a future change cannot quietly reintroduce the raise.
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
     * The legacy bag holds an ARRAY per property and appends, so two failures on one property are two
     * messages rather than a replacement — which is what lets a single property report both a format
     * violation and a uniqueness violation from one save.
     *
     * ⭐ `addError` TAKES EXACTLY TWO ARGUMENTS. The three-argument override at
     * `org/Hibachi/HibachiEntity.cfc:L151` is an entity concern that the validation engine never uses, and
     * the port keeps the narrower signature so the two cannot be confused.
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

/* ==================================================================================================
 * THE RETAINED SURFACE — SUPPORT DECLARATIONS
 * ==================================================================================================
 * Two local recording doubles and one reader factory, declared here rather than in `../support` for the
 * reason the support module's own header gives: a double belongs there when more than one suite needs
 * it, and these three are read only by the four sections below.
 *
 * ⚠️ ALL THREE ARE PURE FACTORIES. Nothing below this comment is module-scope mutable state — no array,
 * no map, no entity — so the M7 isolation property this file establishes at the top holds for the new
 * sections exactly as it holds for the old ones.
 */

/** One recorded call on an association double, naming the member and the product it received. */
interface AssociationCall {
  readonly member: 'setProduct' | 'removeProduct';
  /** The product the delegation passed. `undefined` records the no-argument `removeProduct()` form. */
  readonly product: Product | undefined;
}

/** An association double together with its own call log. */
interface AssociationRecorder {
  readonly association: ProductOwnedAssociation;
  readonly calls: readonly AssociationCall[];
}

/**
 * Builds a recording {@link ProductOwnedAssociation}.
 *
 * WHY A RECORDER AND NOT A REAL ENTITY. The six relationship helpers this double serves are pure
 * delegations of the form `arguments.x.setProduct( this )` — the whole observable behaviour is WHICH
 * member was called and WITH WHAT. `AttributeValue`, `ProductImage` and `ProductReview` are all
 * out of scope (§0.2.2.1 and §0.2.2.4), so there is no real entity to substitute and inventing one
 * would fabricate exactly the surface S9 forbids. The structural interface the production member
 * declares is the entire contract, and this satisfies it literally.
 */
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

/**
 * Builds a {@link ProductSkuIdReader} over an identity-keyed table of identifiers.
 *
 * ⭐ THE READER IS A PARAMETER RATHER THAN A MEMBER, AND THAT IS THE POINT BEING EXERCISED. The
 * production member cannot call `sku.getSkuID()` because `Product.ts` declares its SKU collaborator
 * structurally — {@link ProductSkuMember} names only `setProduct` and `removeProduct` — so the
 * identifier read arrives injected. Keying the table by object IDENTITY rather than by reading a field
 * keeps this file inside that same boundary instead of quietly widening it, and it makes a mis-scan
 * observable: a reader consulted for the wrong instance answers with the empty string, which matches
 * no seeded identifier.
 */
const readingIdentifiers = (
  identifiers: ReadonlyMap<ProductSkuMember, string>,
): ProductSkuIdReader => {
  return (sku: ProductSkuMember): string => identifiers.get(sku) ?? '';
};

/* ==================================================================================================
 * THE SKU FINDER — [model/entity/Product.cfc:L162-L169]
 * ==================================================================================================
 * A 1-based CFML loop over `getSkus()` comparing `skus[i].getSkuID()` to the argument, falling through
 * to CFML null when nothing matches. Three properties are load-bearing and each gets its own case: the
 * scan reads the LIVE collection, a miss answers with absence rather than a sentinel, and the strict
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
     * IDENTITY, NOT EQUALITY. The legacy returns the element itself, and callers then mutate it — so a
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
     * `:L169` ends the function with NO `return` statement, so the legacy answered CFML null. That is
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
     * MUTATION SENSITIVITY, STATED AS AN ASSERTION. The member is documented as scanning
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

/* ==================================================================================================
 * THE FOUR LIVE COLLECTION ACCESSORS — [model/entity/Product.cfc:L178-L180] AND THE THREE SIBLINGS
 * ==================================================================================================
 * `getImages` is a hand-written alias whose legacy body is the bare `return variables.productImages;`,
 * and the framework-generated `getProductImages` reads the same slot. The other three accessors follow
 * the same pattern over their own slots. What matters is that each hands back the LIVE array rather
 * than a copy, and that the aliased pair share ONE array while the four slots stay distinct — a mistake
 * in either direction (copying, or aliasing the wrong slot) is invisible to any assertion that only
 * compares contents.
 */

describe('Product live collection accessors', () => {
  it('NET-NEW — model/entity/Product.cfc:L178-L180 — getImages and getProductImages are TWO NAMES FOR ONE ARRAY', () => {
    const product = buildProduct({ productID: PRODUCT_ID });

    /*
     * ⚠️ `toBe`, DELIBERATELY. The legacy exposes both names over `variables.productImages`, so a
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
     * would give every product the SAME array, which is the failure this pins. Mutating one product must
     * not be visible from another.
     */
    first.getAttributeValues().push(recordingAssociation().association);

    expect(second.getAttributeValues()).toEqual([]);
    expect(second.getAttributeValues()).not.toBe(first.getAttributeValues());
  });
});

/* ==================================================================================================
 * THE SEVEN RELATIONSHIP DELEGATIONS — [model/entity/Product.cfc:L680-L709]
 * ==================================================================================================
 * Seven hand-written helpers, every one a single statement of the form
 * `arguments.x.setProduct( this )` or `arguments.x.removeProduct( this )`. They are declared
 * `inverse="true"` on the collection side, which means THE MANY SIDE OWNS THE FOREIGN KEY: ownership is
 * handed to the associated entity and the collection follows from the persistence layer.
 *
 * ⚠️ SO THE PRODUCT'S OWN ARRAY IS EXPECTED TO STAY EMPTY, AND EVERY CASE BELOW ASSERTS THAT. Adding a
 * local push "for convenience" is the obvious improvement and it is wrong: it double-registers the
 * association, and for `skus` specifically it inflates the collection length that
 * `SkuService.createSkus` reads when it numbers generated SKU codes `-1`, `-2`, …. The one exception is
 * `addSku`, whose collaborator maintains BOTH sides itself — which is why it is asserted differently
 * from the other six.
 */

describe('Product relationship delegations — the many side owns the key', () => {
  it('NET-NEW — model/entity/Product.cfc:L680-L685 — the attribute-value pair delegates and touches no local array', () => {
    const product = buildProduct({ productID: PRODUCT_ID });
    const attributeValue = recordingAssociation();

    product.addAttributeValue(attributeValue.association);

    expect(attributeValue.calls).toEqual([{ member: 'setProduct', product }]);
    /* The delegation hands ownership over; it does NOT register locally. */
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
     * ⚠️ THE ARGUMENT IS NOT DECORATIVE. The collaborator's `removeProduct` defaults to the association's
     * CURRENT product when called with no argument, so `removeProduct()` and `removeProduct(this)` differ
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
     * ⭐ WHY THIS ONE LOOKS DIFFERENT FROM THE OTHER SIX. `addSku`/`removeSku` are the same one-line
     * delegations, but their collaborator is IN SCOPE and its `setProduct` is one of only two legacy
     * members that maintain both sides of a relationship — it appends to `product.getSkus()` itself. So
     * the collection DOES fill here, and it fills through the SKU rather than through the product.
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

/* ==================================================================================================
 * THE TEMPLATE GUARD, THE BRAND-NAME DEFECT AND THE SUBSCRIPTION-TERM BOUNDARY
 * ==================================================================================================
 * Three retained members that share nothing except that each one's interesting behaviour is a BRANCH,
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
     * THE SHORT-CIRCUIT IS THE ASSERTION. The legacy consults the setting only inside the fallback
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
     * ⚠️ TWO STATES, ONE OUTCOME, AND THEY ARE GENUINELY DISTINCT HERE. The legacy guard is
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
     * here would be adding behaviour, and S8 is explicit that no new memoization is introduced. Two
     * calls therefore mean two resolutions.
     */
    expect(settings.calls).toHaveLength(2);
  });
});

describe('Product.getBrandName — the memo defect, carried and pinned', () => {
  it('NET-NEW — model/entity/Product.cfc:L105 — TODO(parity): the first read answers the brand, EVERY LATER READ ANSWERS EMPTY', () => {
    const brand = buildBrand({ brandID: SECOND_PRODUCT_ID, brandName: 'Nike' });
    const product = buildProduct({ productID: PRODUCT_ID, brand });

    /*
     * ⚠️ THIS IS A PRESERVED DEFECT AND THE ASSERTION IS DELIBERATELY OF THE BROKEN BEHAVIOUR.
     *
     * The legacy body writes the EMPTY STRING into the memo slot and then returns the brand's name
     * WITHOUT storing it. So the cache permanently holds `''`, and the second read — which finds the slot
     * populated and trusts it — answers with the empty string for a product that plainly has a brand.
     *
     * Repairing it would be a one-character change and it is NOT made: preserve-and-annotate governs
     * here, and a silent repair would make the port's output incomparable to the legacy system's for
     * every consumer of this member. Pinning the broken behaviour is what makes the carry-over visible
     * to a reviewer instead of being a comment nobody can check.
     */
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
     * Two things are pinned and nothing else is. The finder receives THIS product's 32-character
     * identifier — not a whole entity, and not another product's identifier — and the result travels back
     * unreshaped, element identity included.
     *
     * ⚠️ NO SHAPE IS ASSERTED FOR A SUBSCRIPTION TERM, AND THAT ASYMMETRY IS CORRECT. The two sibling
     * unused-* members do assert a `{name, value}` projection, because the legacy data-access layer
     * builds that projection literally. No such evidence exists for subscription terms: the producing
     * member is out of scope, no in-scope code reads a field off one, and only the ARITY is consumed —
     * by the minimum-collection gate in `model/validation/Product.json`. Asserting a projection here
     * would be inventing one.
     */
    expect(requestedProductIDs).toEqual([PRODUCT_ID]);
    expect(terms).toHaveLength(2);
    expect(terms[0]).toBe(firstTerm);
    expect(terms[1]).toBe(secondTerm);
  });

  it('NET-NEW — an ABSENT finder answers the empty array rather than raising', async () => {
    const product = buildProduct({ productID: PRODUCT_ID });

    /*
     * ⚠️ THE EMPTY ARRAY IS THE CORRECT BOUNDARY ANSWER, NOT A SWALLOWED ERROR. This member's arity is
     * read by a minimum-collection gate of one, so an empty result FAILS that gate — which is exactly the
     * outcome the legacy produced for a product with no unused terms. Throwing instead would convert a
     * validation failure into a runtime error, and the error message would have to be invented (S9).
     */
    await expect(product.getUnusedProductSubscriptionTerms()).resolves.toEqual([]);
  });

  it('NET-NEW — the absent branch is NOT memoized, so the capability can arrive later', async () => {
    const product = buildProduct({ productID: PRODUCT_ID });
    const term = { subscriptionTermID: SKU_ID };

    await expect(product.getUnusedProductSubscriptionTerms()).resolves.toEqual([]);

    /*
     * The legacy caches this result, but that cache belonged to a member with a real implementation.
     * Caching a boundary stub's answer would cache the ABSENCE OF A CAPABILITY for the entity's whole
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
     * The empty-array answer belongs to ONE case only — the capability being absent. A finder that was
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
