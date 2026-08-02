/**
 * Sku domain tests — NET-NEW.
 *
 * PROVENANCE, STATED BEFORE ANYTHING ELSE
 * There is NO dedicated legacy test for this entity. `meta/tests/unit/entity/` contains
 * `ProductTest.cfc` and `BrandTest.cfc` and nothing else for the catalog slice — no `SkuTest.cfc`
 * exists anywhere in the repository, and AAP §0.6.5.2 records that absence explicitly. Nothing in
 * this file may therefore be read as parity with a legacy Sku test, because there is no legacy Sku
 * test to be at parity with. Every case name below carries the same label as the file header for
 * exactly that reason.
 *
 * The one legacy artefact that DOES bear on this entity is the shared entity base,
 * `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L67`, whose four assertions every entity
 * test inherited: `validate_as_save_for_a_new_instance_doesnt_pass()` at `:L51-L54`,
 * `simple_representation_exists_and_is_simple()` at `:L56-L58`, `has_primary_id_property_name()` at
 * `:L60-L62` and `defaults_are_correct()` at `:L64-L67`. Those four assertions are re-expressed here
 * against the target seams that now own the behaviour — but they are still not traceable coverage,
 * because no component ever inherited them ON BEHALF OF Sku. They are the legacy PATTERN, followed
 * deliberately, applied to a surface the legacy suite never reached.
 *
 * TRACEABILITY IS SOURCE-DOCUMENTARY, NEVER EMPIRICAL
 * The legacy suite cannot be executed in this environment, so no legacy result was observed and no
 * output was compared. MXUnit is not vendored — `meta/tests/readme.txt:L4` requires it to be
 * installed with a mapping inside CFIDE, and `meta/tests/unit/SlatwallUnitTestBase.cfc:L49` extends
 * `mxunit.framework.TestCase`, which is consequently unresolvable. CFSelenium is not vendored either
 * (`meta/tests/readme.txt:L5`). There is no ColdFusion, Railo or Lucee engine on this host and no
 * local runtime definition in the repository to bring one up (AAP §0.8.4.1, §0.8.4.2). Every mapping
 * below therefore rests on the cited legacy source locators, read line by line, rather than on a
 * re-run comparison. That is a weaker claim than "the outputs match", and it is stated plainly
 * instead of being implied away.
 *
 * THE STRUCTURAL TRANSLATION: LEGACY INTEGRATION TEST -> TARGET UNIT TEST
 * The two suites differ in kind by design (AAP §0.4.3.6). The legacy fixture booted the whole
 * application: `meta/tests/unit/SlatwallUnitTestBase.cfc:L51-L56` instantiates `Slatwall.Application`
 * and `:L59-L66` calls `bootstrap()` and promotes the request account to super-user, after which each
 * entity was obtained through a string-keyed DI/1 lookup against an `onMissingMethod`-synthesized
 * factory member (`org/Hibachi/HibachiService.cfc:L255-L281`). Every legacy assertion was an
 * integration assertion over a live ORM session and a live datasource.
 *
 * The target fixture is `new Sku()` plus hand-written doubles injected directly as arguments. Nothing
 * is bootstrapped, no container is built, no service is resolved, no connection is opened, no
 * environment variable is read and no file system is touched. AAP §0.4.3.6 also records that the
 * legacy repository ships NO mocking library at all; accordingly `jest.mock` is not used here, the
 * module registry is never touched, and no third-party mocking package is introduced. The collaborator
 * seams come from `../support/inMemoryRepositories` and from two narrow doubles declared in this file.
 *
 * WHAT IS EXERCISED FOR REAL: the actual `Sku`, `Product`, `ProductType`, `Option` and `OptionGroup`
 * classes, the actual `Validator`, the actual transliterated `sku.rules.ts` rule set, the actual
 * `ValidationError` bag and the actual `DomainError` / `NotImplementedError` boundary types. No
 * behaviour under test is re-implemented in this file.
 *
 * ⭐ THE DEFECT CLUSTER IS THE POINT OF THIS FILE, AND IT IS PRESERVED RATHER THAN REPAIRED
 * `model/entity/Sku.cfc` carries the densest concentration of carried-over defects in the whole slice,
 * and Refactor Discipline Guideline 4 forbids fixing any of them (AAP §0.6.7, §0.8.2). Six outcomes
 * below are consequently ASSERTIONS OF BROKENNESS, each annotated at the assertion that makes it
 * observable:
 *
 *   D1   `getOptionsByOptionGroupCodeStruct()` raises on every call, by two independent routes.
 *   D2   `getOptionsByOptionGroupIDStruct()` silently answers an empty struct, always.
 *   D1→D2 the raise from D1 first WIPES the struct D2 memoised, which a caller can observe.
 *   D3   `getOptionByOptionGroupCode()` raises rather than missing, because it evaluates D1 first.
 *   D4   `getStocksDeletableFlag()` is a declared boundary that raises, not a computed flag.
 *   D19  an option-less SKU FAILS its own uniqueness rule whenever a sibling carries options.
 *
 * A reviewer who expects these to pass has misread the brief. Each is a legacy behaviour reproduced
 * on purpose; none is initialised, guarded or short-circuited into working.
 *
 * SCOPE HELD TO THE CALCULATED-PROPERTY BOUNDARY OF AAP §0.2.2.6
 * `model/entity/Sku.cfc:L99-L121` declares twenty-three non-persistent properties, and the pricing,
 * promotion, inventory, currency and fulfilment members among them reach exclusively into services
 * that AAP §0.2.2.1 excludes. None of those members is exercised here, no such service is imported,
 * and no stand-in for one is invented in order to have something to assert. The members this file
 * does cover are the option structure, the identifier list, the SKU definition, the two custom
 * validators, the deprecated region, the image members behind their port, and the managed-entity
 * introspection surface — which is exactly the retained set the AAP row for this entity names.
 *
 * No user-specified rules were provided for this project: `review_rules` reports "No user rules
 * provided." That is not licence to lower the bar (UR4), so the enterprise standards inventory of AAP
 * §0.7.3 governs instead. In a test file the ones with teeth are strict type safety — no `any`, no
 * unsafe or double cast, no non-null assertion, no suppression comment of any kind — and
 * preserve-and-annotate rather than repair.
 */

import { DomainError, NotImplementedError } from '../../src/errors/DomainError';
import { ValidationError } from '../../src/errors/ValidationError';
import { Option } from '../../src/domain/option/Option';
import { OptionGroup } from '../../src/domain/option/OptionGroup';
import { Product } from '../../src/domain/product/Product';
import { ProductType } from '../../src/domain/product/ProductType';
import {
  SKU_DEFINITION_SEGMENT_DELIMITER,
  SKU_OPTIONS_DISPLAY_DEFAULT_DELIMITER,
  SKU_PRIMARY_ID_PROPERTY_NAME,
  SKU_RESIZE_METHOD_SCALE_BEST,
  SKU_SIMPLE_REPRESENTATION_PROPERTY_NAME,
  SKU_UNSAVED_ID_VALUE,
  SUBSCRIPTION_TERM_RESOURCE_BUNDLE_KEY,
  Sku,
  type SkuResizedImageRenderer,
  type SkuResizedImageRequest,
  type SkusBySelectedOptionsLookup,
} from '../../src/domain/sku/Sku';
import { Validator, type ValidationRuleSet } from '../../src/validation/Validator';
import {
  createHasUniqueOptionsConstraint,
  createOptionsPropertyValidation,
  createSkuValidationRules,
  hasOneOptionPerOptionGroupMethodConstraint,
  resolveSkuUniqueTarget,
} from '../../src/validation/rules/sku.rules';
import {
  CONTENT_ACCESS_PRODUCT_TYPE,
  MERCHANDISE_PRODUCT_TYPE,
  SUBSCRIPTION_PRODUCT_TYPE,
} from '../fixtures/productTypes';
import {
  buildOption,
  buildOptionGroup,
  buildProduct,
  buildProductType,
  buildSku,
  createDefaultSkuDelegate,
  createImagePathDouble,
  createInMemorySkuRepository,
  createProductTypeRootResolverDouble,
  createSettingResolverDouble,
  createSkusBySelectedOptionsLookup,
  createUniquePropertyDouble,
  createValidatorHarness,
  physicalID,
} from '../support/inMemoryRepositories';

/* =================================================================================================
 * TEST-LOCAL IDENTIFIERS — PHYSICALLY VALID, PER REVIEW FINDING 16
 * -------------------------------------------------------------------------------------------------
 * Every identifier below is minted by `physicalID(label)`, so its VALUE is 32 lowercase hexadecimal
 * characters with no dashes — the shape AAP IR-6 fixes for every primary key in this schema — while its
 * LABEL stays readable at the call site and in the constant's name. The mechanism, and the three
 * grounds of the readable-identifier rationale it withdraws, are documented once at
 * `test/support/inMemoryRepositories.ts` rather than restated here.
 *
 * ⛔ WHAT THIS BLOCK USED TO SAY, AND WHY IT WAS WRONG
 *
 * It claimed the readable form was "the convention every landed sibling suite already follows". That
 * was the specific factual error the review corrected: sibling suites split both ways, and several —
 * `test/domain/Product.test.ts`, `test/services/OptionService.test.ts`, `test/handlers/*.test.ts` —
 * deliberately pinned the physical contract. Citing half a divided tree as a convention is how a
 * fixture drifts away from the schema it is supposed to be faithful to.
 *
 * It also claimed a physical identifier offered "no assertive gain". It does, and this file is the
 * clearest place in the subtree to see it: the members under test here compare, group, memoise and
 * struct-key on identifiers, and every one of those operations can hold a shape assumption that a
 * seven-character ASCII token would satisfy by accident.
 *
 * The identifiers below remain string CONSTANTS, not shared entity instances. Every entity is rebuilt
 * inside the case that uses it, so no mutable state crosses a case boundary — which matters more than
 * usual in this file, because several members under test memoise on first call.
 * ============================================================================================== */

const SIZE_OPTION_GROUP_ID = physicalID('og-size');
const SIZE_OPTION_GROUP_CODE = 'SIZE';
const SIZE_OPTION_GROUP_NAME = 'Size';

const COLOUR_OPTION_GROUP_ID = physicalID('og-colour');
const COLOUR_OPTION_GROUP_CODE = 'COLOUR';
const COLOUR_OPTION_GROUP_NAME = 'Colour';

const LARGE_OPTION_ID = physicalID('o-large');
const LARGE_OPTION_NAME = 'Large';

const RED_OPTION_ID = physicalID('o-red');
const RED_OPTION_NAME = 'Red';

const CATALOG_PRODUCT_ID = physicalID('p-catalog-1');
const PERSISTED_SKU_ID = physicalID('sku-persisted-1');
const SIBLING_SKU_ID = physicalID('sku-sibling-1');
const SECOND_SIBLING_SKU_ID = physicalID('sku-sibling-2');
const OPTIONLESS_SKU_ID = physicalID('sku-optionless-1');
const CATALOG_SKU_CODE = 'CATALOG-SKU-1';

/**
 * A delimiter that is deliberately NOT the declared default.
 *
 * `model/entity/Sku.cfc:L233` defaults the argument to a single space, so asserting the joined output
 * with a space would pass whether the caller's delimiter were honoured or silently ignored. A
 * multi-character delimiter that could not arise by accident is the only form of the assertion that
 * can fail if the argument stops being threaded through.
 */
const NON_DEFAULT_OPTIONS_DELIMITER = ' | ';

/* =================================================================================================
 * TEST-LOCAL BUILDERS
 * -------------------------------------------------------------------------------------------------
 * Thin wrappers over the shared support factories. They exist so that every case starts from an
 * identical, freshly constructed graph without repeating a seed literal at thirty call sites, and so
 * that a change to the shape of the fixture graph is a one-line change here.
 * ============================================================================================== */

/** A fresh option group. `imageGroupFlag` is the only axis any case below needs to vary. */
function newSizeGroup(imageGroupFlag = false): OptionGroup {
  return buildOptionGroup({
    optionGroupID: SIZE_OPTION_GROUP_ID,
    optionGroupCode: SIZE_OPTION_GROUP_CODE,
    optionGroupName: SIZE_OPTION_GROUP_NAME,
    imageGroupFlag,
    sortOrder: 1,
  });
}

/** A second, distinct option group, so one-option-per-group cases have a legitimate pair. */
function newColourGroup(imageGroupFlag = false): OptionGroup {
  return buildOptionGroup({
    optionGroupID: COLOUR_OPTION_GROUP_ID,
    optionGroupCode: COLOUR_OPTION_GROUP_CODE,
    optionGroupName: COLOUR_OPTION_GROUP_NAME,
    imageGroupFlag,
    sortOrder: 2,
  });
}

/**
 * An option in a given group. `buildOption` routes the group through `Option.setOptionGroup`, which
 * maintains both sides of the association exactly as `model/entity/Option.cfc:L59` requires — the
 * relationship is not stitched together by hand here.
 */
function newOption(
  group: OptionGroup,
  optionID: string,
  optionName: string,
  optionCode: string,
): Option {
  return buildOption({ optionID, optionName, optionCode, optionGroup: group, sortOrder: 1 });
}

/** The `Large` option of the size group, the option every option-bearing case starts from. */
function newLargeOption(group: OptionGroup): Option {
  return newOption(group, LARGE_OPTION_ID, LARGE_OPTION_NAME, 'Lg');
}

/** The `Red` option of the colour group. */
function newRedOption(group: OptionGroup): Option {
  return newOption(group, RED_OPTION_ID, RED_OPTION_NAME, 'Rd');
}

/**
 * A product of one of the three seeded types.
 *
 * The discriminator identifier is always one of the three literals at
 * `config/dbdata/SlatwallProductType.xml.cfm:L13-L15`, imported rather than retyped (IR-7). No fourth
 * discriminator is introduced anywhere in this file.
 */
function newProductOfType(productTypeID: string, productCode = 'CatalogProduct-1'): Product {
  const productType = buildProductType({ productTypeID, productTypeIDPath: productTypeID });
  return buildProduct({ productID: CATALOG_PRODUCT_ID, productCode, productType });
}

/** A merchandise product, which is the branch nearly every option-bearing case needs. */
function newMerchandiseProduct(productCode = 'CatalogProduct-1'): Product {
  return newProductOfType(MERCHANDISE_PRODUCT_TYPE.productTypeID, productCode);
}

/**
 * A SKU carrying one option from each of two distinct groups, attached to a merchandise product.
 *
 * Returned as a record rather than as a bare SKU because most cases need to reach the options and the
 * groups as well, and re-deriving them from `sku.options` would make the assertion depend on the very
 * accessor under test.
 */
interface TwoOptionSkuFixture {
  readonly sku: Sku;
  readonly product: Product;
  readonly sizeGroup: OptionGroup;
  readonly colourGroup: OptionGroup;
  readonly largeOption: Option;
  readonly redOption: Option;
}

function buildTwoOptionSku(skuID: string = PERSISTED_SKU_ID): TwoOptionSkuFixture {
  const sizeGroup = newSizeGroup();
  const colourGroup = newColourGroup();
  const largeOption = newLargeOption(sizeGroup);
  const redOption = newRedOption(colourGroup);
  const product = newMerchandiseProduct();
  const sku = buildSku({
    skuID,
    skuCode: CATALOG_SKU_CODE,
    product,
    options: [largeOption, redOption],
  });

  return { sku, product, sizeGroup, colourGroup, largeOption, redOption };
}

/* =================================================================================================
 * TEST-LOCAL DOUBLES
 * ============================================================================================== */

/**
 * A recorder for the one argument `hasUniqueOptions` sends across the domain seam.
 *
 * `Sku.hasUniqueOptions` takes a {@link SkusBySelectedOptionsLookup}, whose single member accepts one
 * string. The recorder captures every string it is handed and answers with a configured result set,
 * which is what makes the "no sorting, no de-duplication, nothing but the string" assertions of
 * `model/entity/Sku.cfc:L757-L763` observable. It is a plain object literal implementing the real
 * interface — not a mock, not a spy and not a module replacement.
 */
interface RecordingSelectedOptionsLookup {
  readonly lookup: SkusBySelectedOptionsLookup;
  readonly received: readonly string[];
}

function createRecordingSelectedOptionsLookup(
  results: readonly Sku[] = [],
): RecordingSelectedOptionsLookup {
  const received: string[] = [];

  return {
    received,
    lookup: {
      getSkusBySelectedOptions: (selectedOptions: string): Promise<readonly Sku[]> => {
        received.push(selectedOptions);
        return Promise.resolve(results);
      },
    },
  };
}

/**
 * A real `Sku` subclass that records HOW the rule boundary called each of the two method rules.
 *
 * The legacy engine invoked a method rule with ZERO arguments —
 * `org/Hibachi/HibachiValidationService.cfc:L333-L335` is
 * `return arguments.object.invokeMethod(arguments.constraintValue);` and nothing else. Proving the
 * target honours that is only possible by observing the call, and the honest way to observe it without
 * a mocking library is a subclass that records the arity and then delegates to the real
 * implementation. Both overrides delegate through `super`; neither reimplements any logic.
 */
class DispatchRecordingSku extends Sku {
  /** One entry per `hasOneOptionPerOptionGroup` invocation, holding the argument count received. */
  readonly synchronousRuleArgumentCounts: number[] = [];

  /** One entry per `hasUniqueOptions` invocation, holding the argument count received. */
  readonly asynchronousRuleArgumentCounts: number[] = [];

  override hasOneOptionPerOptionGroup(...received: unknown[]): boolean {
    this.synchronousRuleArgumentCounts.push(received.length);
    return super.hasOneOptionPerOptionGroup();
  }

  override hasUniqueOptions(
    lookup: SkusBySelectedOptionsLookup,
    ...surplus: unknown[]
  ): Promise<boolean> {
    this.asynchronousRuleArgumentCounts.push(1 + surplus.length);
    return super.hasUniqueOptions(lookup);
  }
}

/** A lookup that answers "nothing matched", so uniqueness never becomes the reason a case fails. */
const noMatchingSkusLookup: SkusBySelectedOptionsLookup = {
  getSkusBySelectedOptions: (): Promise<readonly Sku[]> => Promise.resolve([]),
};

/**
 * Run `act` and hand back the {@link DomainError} it raised.
 *
 * `expect(...).toThrow(DomainError)` proves the CLASS but discards the instance, and several of the
 * defect cases below need the instance so they can read the structured `context` the port attaches —
 * the defect identifier, the legacy locator and the state the member was in when it failed. Capturing
 * it through a narrowing `instanceof` keeps the file free of casts and non-null assertions, and the
 * final `throw` is what stops a member that has been quietly "repaired" from passing this suite by
 * returning normally.
 *
 * @param act the call expected to raise
 * @returns the raised error, narrowed
 */
function captureError<TError extends DomainError>(
  act: () => unknown,
  expected: new (...args: never[]) => TError,
): TError {
  try {
    act();
  } catch (error: unknown) {
    if (error instanceof expected) {
      return error;
    }
    throw error;
  }
  throw new Error(`Expected the call to raise ${expected.name}, but it returned normally.`);
}

/** {@link captureError} for the base class, which is what most of the carried defects raise. */
function captureDomainError(act: () => unknown): DomainError {
  return captureError(act, DomainError);
}

/**
 * The ported SKU rule set, wired to a caller-chosen lookup.
 *
 * `createSkuValidationRules` is a FACTORY rather than a constant precisely because the uniqueness rule
 * needs a collaborator: `model/validation/Sku.json:L6` names a method that reaches the database, so the
 * rule set cannot be a module-level frozen object the way a pure rule set could be. Threading the
 * lookup in per case is the target's replacement for the legacy engine resolving `productService`
 * through DI/1 at evaluation time.
 */
function skuRulesFor<TSubject extends Sku>(
  lookup: SkusBySelectedOptionsLookup,
): ValidationRuleSet<TSubject> {
  return createSkuValidationRules<TSubject>(resolveSkuUniqueTarget, lookup);
}

/* =================================================================================================
 * THE LEGACY ENTITY-BASE ASSERTION PATTERN, RE-EXPRESSED AGAINST THE TARGET SEAMS
 * ============================================================================================== */

describe('Sku — the legacy entity-base assertion pattern', () => {
  it('NET-NEW — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L54 — a fresh Sku fails save validation, and it fails on the required skuCode rule rather than on price', async () => {
    const sku = new Sku();
    const harness = createValidatorHarness();

    const errors = await harness.validateDryRun(sku, skuRulesFor(noMatchingSkusLookup), 'save');

    /* The legacy assertion was `entity.validate(context="save"); assert(entity.hasErrors());`. The
     * entity no longer validates itself — AAP §0.8.3.2 retires `org/Hibachi/**` for this slice — so the
     * same claim is made against the layer that now owns it. */
    expect(errors).toBeInstanceOf(ValidationError);
    expect(errors.hasErrors()).toBe(true);

    /* WHICH rule failed is asserted, not just THAT one did. `model/validation/Sku.json:L11` requires
     * `skuCode`, and `model/entity/Sku.cfc:L54` declares no default for it, so a fresh SKU has none. */
    expect(errors.getError('skuCode')).toHaveLength(1);

    /* And `:L9` requires `price`, which DOES default — to zero — so the required rule must be
     * satisfied by it. A JavaScript falsiness test would wrongly reject that value. */
    expect(errors.hasError('price')).toBe(false);
  });

  it('NET-NEW — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58 — the simple representation is skuCode, and it reads back as a simple string value', () => {
    const fresh = new Sku();

    /* `model/entity/Sku.cfc:L809` overrides the framework naming convention and returns the literal
     * `"skuCode"`. The target declares the same property name, and the legacy assertion —
     * `isSimpleValue(entity.getSimpleRepresentation())` — becomes: the named property resolves, and
     * what it resolves to is a simple value rather than a struct or an object. */
    expect(fresh.getSimpleRepresentationPropertyName()).toBe(
      SKU_SIMPLE_REPRESENTATION_PROPERTY_NAME,
    );
    expect(fresh.getSimpleRepresentationPropertyName()).toBe('skuCode');
    expect(typeof fresh.getValueByPropertyIdentifier('skuCode')).toBe('string');

    /* An absent value reads as the empty string rather than as `undefined`, which is what keeps the
     * "is a simple value" claim true for a brand-new instance. */
    expect(fresh.getValueByPropertyIdentifier('skuCode')).toBe('');

    const coded = buildSku({ skuCode: CATALOG_SKU_CODE });
    expect(coded.getValueByPropertyIdentifier('skuCode')).toBe(CATALOG_SKU_CODE);
  });

  it('NET-NEW — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L60-L62 — a non-empty primary-ID property name exists and it identifies skuID', () => {
    const sku = buildSku({ skuID: PERSISTED_SKU_ID });

    expect(sku.getPrimaryIDPropertyName()).toBe(SKU_PRIMARY_ID_PROPERTY_NAME);
    expect(sku.getPrimaryIDPropertyName()).toBe('skuID');
    expect(sku.getPrimaryIDPropertyName().length).toBeGreaterThan(0);

    /* The name is not merely present: it names the member that actually carries the value, which is
     * what `org/Hibachi/HibachiDAO.cfc:L130-L146` relies on when it builds the self-exclusion clause
     * for the uniqueness check (IR-5). */
    expect(sku.getPrimaryIDValue()).toBe(PERSISTED_SKU_ID);
    expect(sku.getValueByPropertyIdentifier(sku.getPrimaryIDPropertyName())).toBe(PERSISTED_SKU_ID);
  });

  it('NET-NEW — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67 — a fresh Sku is new and carries no primary identifier value', () => {
    const sku = new Sku();

    expect(sku.isNew()).toBe(true);
    expect(sku.getPrimaryIDValue()).toBe('');
    expect(sku.getPrimaryIDValue()).toBe(SKU_UNSAVED_ID_VALUE);
  });

  it('NET-NEW — model/entity/Sku.cfc:L52-L59 — new Sku() takes no arguments and every declared default lands, with a fresh live options array', () => {
    const sku = new Sku();

    /* `unsavedvalue="" default=""` at `:L52`. */
    expect(sku.skuID).toBe('');
    /* `ormtype="boolean" default="1"` at `:L53`. */
    expect(sku.activeFlag).toBe(true);
    /* `default="0"` at `:L55`, `:L56` and `:L57`. The stored form is an exact decimal rather than an
     * IEEE-754 double, so the declared zero is the string `'0'` — the same digits Hibernate's
     * `big_decimal` mapping would have carried, with no floating-point step anywhere. */
    expect(sku.listPrice).toBe('0');
    expect(sku.price).toBe('0');
    expect(sku.renewalPrice).toBe('0');
    /* `ormtype="boolean" default="0"` at `:L59`. */
    expect(sku.userDefinedPriceFlag).toBe(false);

    /* `:L76`. The array must be live and per-instance, because the odometer at
     * `model/service/SkuService.cfc:L107` appends into it immediately after construction. */
    expect(sku.options).toEqual([]);
    expect(sku.getOptions()).toBe(sku.options);
    expect(new Sku().options).not.toBe(sku.options);

    /* `:L54`, `:L58` and `:L62` declare no default at all, so those keys must be ABSENT rather than
     * present-and-undefined — a distinction `exactOptionalPropertyTypes` makes load-bearing. */
    expect(Object.hasOwn(sku, 'skuCode')).toBe(false);
    expect(Object.hasOwn(sku, 'imageFile')).toBe(false);
    expect(Object.hasOwn(sku, 'calculatedQATS')).toBe(false);
  });

  it('NET-NEW — model/validation/Sku.json:L13 — physicalCounts is not a Sku property, so its delete guard stays inert and no field is invented to make it fire', async () => {
    const sku = buildSku({ skuID: PERSISTED_SKU_ID, skuCode: CATALOG_SKU_CODE });

    /* `model/entity/Sku.cfc:L87` declares `physicals`, never `physicalCounts`. The rule at
     * `model/validation/Sku.json:L13` is therefore a TYPO that can never fire, and the engine's own
     * guard is what makes it harmless: a property the subject does not declare is skipped outright.
     * No `physicalCounts` member is added to the entity or to any double in order to exercise it. */
    expect(sku.hasProperty('physicalCounts')).toBe(false);
    expect(sku.hasProperty('physicals')).toBe(true);

    const harness = createValidatorHarness();
    const errors = await harness.validateDryRun(sku, skuRulesFor(noMatchingSkusLookup), 'delete');

    expect(errors.getError('physicalCounts')).toEqual([]);
    expect(errors.hasError('physicalCounts')).toBe(false);
  });

  it('NET-NEW — IR-1 — the managed-entity introspection members are declared explicitly and answer from the real entity', () => {
    const { sku, product } = buildTwoOptionSku();

    /* Every one of these resolved through `onMissingMethod` or through framework inheritance in the
     * legacy system; under `strict` each has to be a declaration. `src/validation/Validator.ts` and
     * `src/ports/UniquePropertyPort.ts` both require them BY NAME, so they are contract, not
     * convenience. */
    expect(sku.getClassName()).toBe('Sku');
    expect(sku.getEntityName()).toBe('SlatwallSku');
    expect(sku.getPropertyMetaData('skuCode').name).toBe('skuCode');
    expect(sku.hasProperty('options')).toBe(true);
    expect(sku.hasProperty('thisIsNotASkuProperty')).toBe(false);
    expect(() => sku.getPropertyMetaData('thisIsNotASkuProperty')).toThrow(DomainError);

    /* The graph under test is built from the real classes, not from look-alike literals — a regression
     * in any of them fails this suite rather than passing against a private copy. */
    expect(sku).toBeInstanceOf(Sku);
    expect(product).toBeInstanceOf(Product);
    expect(product.productType).toBeInstanceOf(ProductType);
    expect(sku.options[0]).toBeInstanceOf(Option);
    expect(sku.options[0]?.optionGroup).toBeInstanceOf(OptionGroup);
  });
});

/* =================================================================================================
 * THE THREE-STRUCT DEFECT CLUSTER — D1, D2, D3 AND THE SHARED-CACHE CROSS-TALK BETWEEN THEM
 * =================================================================================================
 * `model/entity/Sku.cfc` maintains three option maps whose names differ by one word each:
 * `optionsByOptionGroupCodeStruct`, `optionsByOptionGroupIDStruct` and `OptionsByGroupIDStruct`. Every
 * defect below is a consequence of that naming, and AAP 0.6.7.2 draws the design lesson the port
 * acts on: distinct typed accessors instead of parallel string-keyed maps.
 *
 * NOTHING HERE IS REPAIRED. Refactor Discipline Guideline 4 forbids it, and the reason is concrete —
 * repairing D1 would activate a code-keyed lookup the legacy system has never once performed, and
 * repairing D2 would start returning options to callers that have always received none. Each case
 * therefore asserts the DEFECTIVE outcome and carries a `TODO(parity)` locator next to it.
 * ============================================================================================== */

describe('Sku — D1/D2/D3, the three-struct option-map defect cluster', () => {
  it('NET-NEW — model/entity/Sku.cfc:L500-L510 — getOptionsByOptionGroupCodeStruct() raises with an EMPTY options array, because the loop never runs and the return reads a struct that was never created', () => {
    /* TODO(parity) D1 — model/entity/Sku.cfc:L500-L510 — carried, not repaired. */
    const sku = buildSku({ skuID: PERSISTED_SKU_ID });

    expect(sku.getOptions()).toEqual([]);
    expect(() => sku.getOptionsByOptionGroupCodeStruct()).toThrow(DomainError);

    /* This is the `:L509` path. With no options the `for` body at `:L503` never executes, control
     * reaches the `return` at `:L509`, and THAT is the statement which dereferences
     * `variables.optionsByOptionGroupCodeStruct` — a variable `:L502` never created because it
     * initialised the IDENTIFIER-keyed name instead. The failure is structural, not data-dependent,
     * which the recorded option count makes explicit. */
    const raised = captureDomainError(() => sku.getOptionsByOptionGroupCodeStruct());
    expect(raised.context?.['defect']).toBe('D1');
    expect(raised.context?.['locator']).toBe('model/entity/Sku.cfc:L500-L510');
    expect(raised.context?.['optionCount']).toBe(0);
  });

  it('NET-NEW — model/entity/Sku.cfc:L500-L510 — getOptionsByOptionGroupCodeStruct() raises INDEPENDENTLY with a NON-EMPTY options array, where :L502 creates the wrong struct and :L504 reads the never-created one', () => {
    /* TODO(parity) D1 — model/entity/Sku.cfc:L500-L510 — carried, not repaired. */
    const { sku } = buildTwoOptionSku();

    expect(sku.getOptions()).toHaveLength(2);
    expect(() => sku.getOptionsByOptionGroupCodeStruct()).toThrow(DomainError);

    /* SAME OUTCOME, DIFFERENT CAUSE, AND BOTH MATTER. Here the first loop iteration at `:L504`
     * evaluates `structKeyExists(variables.optionsByOptionGroupCodeStruct, ...)` and raises on the
     * missing variable long before `:L509` is reached. The register summarises D1 as one defect; the
     * control flow carries two failure sites, so both are exercised rather than one being taken as
     * representative of the other. The option count is the observable difference. */
    const raised = captureDomainError(() => sku.getOptionsByOptionGroupCodeStruct());
    expect(raised.context?.['defect']).toBe('D1');
    expect(raised.context?.['optionCount']).toBe(2);

    /* The memoization guard at `:L501` tests the same never-created variable, so it is always true and
     * the member raises on EVERY call rather than caching a first failure. */
    expect(() => sku.getOptionsByOptionGroupCodeStruct()).toThrow(DomainError);
    expect(() => sku.getOptionsByOptionGroupCodeStruct()).toThrow(DomainError);
  });

  it('NET-NEW — model/entity/Sku.cfc:L512-L522 — getOptionsByOptionGroupIDStruct() returns an empty map for EMPTY options without raising', () => {
    /* TODO(parity) D2 — model/entity/Sku.cfc:L512-L522 — carried, not repaired. */
    const sku = buildSku({ skuID: PERSISTED_SKU_ID });

    /* Unlike its code-keyed sibling this member never raises: the guard at `:L513`, the creation at
     * `:L514` and the return at `:L521` all name the SAME variable. Only the write at `:L517` is
     * wrong, and with no options that write is never attempted. */
    expect(() => sku.getOptionsByOptionGroupIDStruct()).not.toThrow();
    expect(sku.getOptionsByOptionGroupIDStruct()).toEqual({});
  });

  it('NET-NEW — model/entity/Sku.cfc:L512-L522 — getOptionsByOptionGroupIDStruct() STILL returns an empty map for NON-EMPTY options, because :L517 writes into a third differently named struct', () => {
    /* TODO(parity) D2 — model/entity/Sku.cfc:L512-L522 — carried, not repaired. */
    const { sku, sizeGroup, colourGroup } = buildTwoOptionSku();

    expect(sku.getOptions()).toHaveLength(2);
    expect(() => sku.getOptionsByOptionGroupIDStruct()).not.toThrow();

    const optionsByGroupId = sku.getOptionsByOptionGroupIDStruct();

    /* THE DEFECT, STATED THREE WAYS. The loop at `:L515` runs, the existence check at `:L516` consults
     * the map that IS returned, and then `:L517` assigns into `variables.OptionsByGroupIDStruct` — a
     * third struct with a third distinct name. So the returned map is the one that was created at
     * `:L514` and never written to. */
    expect(optionsByGroupId).toEqual({});
    expect(Object.keys(optionsByGroupId)).toHaveLength(0);
    expect(Object.hasOwn(optionsByGroupId, sizeGroup.optionGroupID)).toBe(false);
    expect(Object.hasOwn(optionsByGroupId, colourGroup.optionGroupID)).toBe(false);
  });

  it('NET-NEW — model/entity/Sku.cfc:L513-L521 — the empty map is memoized per instance, so repeated calls hand back the very same object', () => {
    /* TODO(parity) D2 — model/entity/Sku.cfc:L512-L522 — carried, not repaired. */
    const { sku } = buildTwoOptionSku();

    const first = sku.getOptionsByOptionGroupIDStruct();
    const second = sku.getOptionsByOptionGroupIDStruct();

    /* The guard at `:L513` makes this a real cache. Establishing the identity here is what gives the
     * next case its instrument: once the memo is known to be stable, a CHANGE of identity can only
     * have come from something else writing to it. */
    expect(second).toBe(first);
    expect(sku.getOptionsByOptionGroupIDStruct()).toBe(first);
  });

  it('NET-NEW — model/entity/Sku.cfc:L502 — a raising getOptionsByOptionGroupCodeStruct() call REPLACES the identifier-keyed memo on its way out, so the two accessors share one mutable cache', () => {
    /* TODO(parity) D1 — model/entity/Sku.cfc:L500-L510 — the clobber at :L502.
     * TODO(parity) D2 — model/entity/Sku.cfc:L512-L522 — the memo that gets clobbered. */
    const { sku } = buildTwoOptionSku();

    /* 1. Establish D2's memo and confirm it is stable. */
    const beforeD1 = sku.getOptionsByOptionGroupIDStruct();
    expect(sku.getOptionsByOptionGroupIDStruct()).toBe(beforeD1);

    /* 2. Invoke D1 and absorb its expected failure. */
    expect(() => sku.getOptionsByOptionGroupCodeStruct()).toThrow(DomainError);

    /* 3. `:L502` assigned a FRESH empty struct to the identifier-keyed name BEFORE `:L504` raised, so
     *    D2's cache is no longer the object it was. The evidence is reference identity: the value is
     *    still empty — D2 is no less broken than it was — but it is a DIFFERENT empty object. Read
     *    through the public accessor only; no private field is touched, no cast is taken and no
     *    non-null assertion is needed to see it. */
    const afterD1 = sku.getOptionsByOptionGroupIDStruct();
    expect(afterD1).toEqual({});
    expect(afterD1).not.toBe(beforeD1);
  });

  it('NET-NEW — model/entity/Sku.cfc:L502 — and the replacement SUPPRESSES the D2 loop, so an option with no option group raises before a D1 call and returns quietly after one', () => {
    /* TODO(parity) D1 — model/entity/Sku.cfc:L500-L510 — the clobber at :L502.
     * TODO(parity) D2 — model/entity/Sku.cfc:L512-L522 — the loop that stops running. */
    const grouplessOptionSku = buildSku({
      skuID: PERSISTED_SKU_ID,
      options: [buildOption({ optionID: LARGE_OPTION_ID, optionName: LARGE_OPTION_NAME })],
    });

    /* BEFORE: `:L516` and `:L517` both dereference the option group without a guard, so a SKU holding
     * an option with no group raises inside D2's loop — in CFML and here alike. */
    expect(() => grouplessOptionSku.getOptionsByOptionGroupIDStruct()).toThrow(DomainError);

    /* AFTER: on a fresh instance, running D1 first pre-populates the very cache D2's guard at `:L513`
     * tests. The loop is skipped entirely, no option group is ever dereferenced, and the same SKU that
     * raised a moment ago now returns an empty map without complaint. TWO CALL ORDERS, TWO
     * BEHAVIOURS, ONE SHARED CACHE — a second, independent proof of the clobber at `:L502` that does
     * not rely on object identity at all. */
    const sameShapeSku = buildSku({
      skuID: PERSISTED_SKU_ID,
      options: [buildOption({ optionID: LARGE_OPTION_ID, optionName: LARGE_OPTION_NAME })],
    });
    expect(() => sameShapeSku.getOptionsByOptionGroupCodeStruct()).toThrow(DomainError);
    expect(() => sameShapeSku.getOptionsByOptionGroupIDStruct()).not.toThrow();
    expect(sameShapeSku.getOptionsByOptionGroupIDStruct()).toEqual({});
  });

  it('NET-NEW — model/entity/Sku.cfc:L247-L251 — getOptionByOptionGroupCode() raises rather than missing, because :L248 calls the code-keyed accessor first', () => {
    /* TODO(parity) D3 — model/entity/Sku.cfc:L247-L251 — carried, not repaired. */
    const { sku, sizeGroup } = buildTwoOptionSku();

    /* THE OBSERVABLE BEHAVIOUR IS A RAISE, NOT A MISS. `:L248` wraps the guard around
     * `getOptionsByOptionGroupCodeStruct()`, which D1 makes raise on every call, so control never
     * reaches the mismatched index at `:L249`. Asserting `undefined` here would describe a system in
     * which D1 had been fixed — and would let a D1 repair pass unnoticed. */
    expect(() => sku.getOptionByOptionGroupCode(SIZE_OPTION_GROUP_CODE)).toThrow(DomainError);
    const raised = captureDomainError(() => sku.getOptionByOptionGroupCode(SIZE_OPTION_GROUP_CODE));
    expect(raised.context?.['defect']).toBe('D1');

    /* A code that is not present raises identically — the failure precedes any lookup, so the argument
     * has no bearing on it. */
    expect(() => sku.getOptionByOptionGroupCode('NO-SUCH-GROUP-CODE')).toThrow(DomainError);

    /* And it raises even when passed a group IDENTIFIER, which is the value `:L249` would actually
     * have needed. D3 proper is that `:L248` tests the CODE-keyed map while `:L249` indexes the
     * IDENTIFIER-keyed one, so a hit was impossible even before D1; the two defects compound. */
    expect(() => sku.getOptionByOptionGroupCode(sizeGroup.optionGroupID)).toThrow(DomainError);

    /* G6 — WHAT A REPAIR WOULD REVEAL, RECORDED AND DELIBERATELY NOT ASSERTED. The legacy declares
     * `returntype="any"` with no `else` arm, so were D1 repaired, `:L249`'s mismatched index would
     * simply miss and control would fall off the end of the function — CFML returning null, the port
     * returning `undefined`. That is a description of a hypothetical system. Today's observable
     * behaviour is the raise above, and that is what this file pins. */
  });

  it('NET-NEW — model/entity/Sku.cfc:L500-L510 — the never-created code-keyed struct stays never-created: no test seeds it to coax a return value', () => {
    /* TODO(parity) D1 — model/entity/Sku.cfc:L500-L510 — carried, not repaired. */
    const { sku, largeOption, redOption } = buildTwoOptionSku();

    /* The options really are attached and really do carry codes, so nothing about the fixture is what
     * makes D1 fail — it fails because `variables.optionsByOptionGroupCodeStruct` is never
     * initialised anywhere in `model/entity/Sku.cfc`, and this suite initialises it nowhere either.
     * There is no seam through which a test COULD initialise it, and inventing one would be a repair
     * wearing a test's clothes. */
    expect(largeOption.optionGroup?.optionGroupCode).toBe(SIZE_OPTION_GROUP_CODE);
    expect(redOption.optionGroup?.optionGroupCode).toBe(COLOUR_OPTION_GROUP_CODE);
    expect(() => sku.getOptionsByOptionGroupCodeStruct()).toThrow(DomainError);

    /* Meanwhile the correct data IS computable from the same options — which is precisely why the
     * defect is worth pinning. A caller wanting a code-keyed view has to build it, because no accessor
     * on this entity will ever hand one back. */
    const builtByHand: Record<string, string> = {};
    for (const option of sku.getOptions()) {
      const code = option.optionGroup?.optionGroupCode;
      if (code !== undefined) {
        builtByHand[code] = option.optionID;
      }
    }
    expect(builtByHand).toEqual({
      [SIZE_OPTION_GROUP_CODE]: LARGE_OPTION_ID,
      [COLOUR_OPTION_GROUP_CODE]: RED_OPTION_ID,
    });
  });
});

/* =================================================================================================
 * THE OPTION DISPLAY, IDENTIFIER-LIST, LOOKUP AND MUTATOR SURFACE
 * ============================================================================================== */

describe('Sku — option display, identifier list, lookup and mutators', () => {
  it('NET-NEW — model/entity/Sku.cfc:L233-L238 — getOptionsDisplay() joins option NAMES in options-array order using a caller-supplied NON-DEFAULT delimiter', () => {
    const { sku } = buildTwoOptionSku();

    /* The delimiter deliberately is NOT the default. `:L233` declares `string delimiter=" "` and
     * `:L236` calls `listAppend(..., arguments.delimiter)`, so the caller's value is the one used —
     * asserting only the default would leave the parameter entirely unexercised. */
    expect(NON_DEFAULT_OPTIONS_DELIMITER).not.toBe(SKU_OPTIONS_DISPLAY_DEFAULT_DELIMITER);
    expect(sku.getOptionsDisplay(NON_DEFAULT_OPTIONS_DELIMITER)).toBe(
      `${LARGE_OPTION_NAME}${NON_DEFAULT_OPTIONS_DELIMITER}${RED_OPTION_NAME}`,
    );

    /* ORDER IS THE OPTIONS ARRAY'S ORDER, not the option groups' sort order and not alphabetical.
     * `:L235` iterates `getOptions()` directly, so whatever order the collection holds is the order
     * displayed — which matters because the combination engine at
     * `model/service/SkuService.cfc:L107` appends options in odometer order. */
    expect(sku.getOptionsDisplay(NON_DEFAULT_OPTIONS_DELIMITER)).toBe('Large | Red');

    /* And the declared default is still the single space of `:L233`. */
    expect(SKU_OPTIONS_DISPLAY_DEFAULT_DELIMITER).toBe(' ');
    expect(sku.getOptionsDisplay()).toBe(`${LARGE_OPTION_NAME} ${RED_OPTION_NAME}`);

    /* No options means the empty string — `listAppend` never runs, so nothing is prefixed. */
    expect(buildSku({}).getOptionsDisplay(NON_DEFAULT_OPTIONS_DELIMITER)).toBe('');
  });

  it('NET-NEW — model/entity/Sku.cfc:L241-L245 — getOptionByOptionGroupID() is faithful in itself yet can never find anything, because the map it consults is the one D2 keeps empty', () => {
    /* TODO(parity) D2 — model/entity/Sku.cfc:L512-L522 — the empty map this member reads.
     * NO NEW DEFECT NUMBER IS MINTED HERE. `:L241-L245` tests and indexes the SAME map, so the member
     * is correct as written; its futility is entirely inherited from D2's third-struct write at
     * `:L517`. Recording the relationship is what stops a reader who verifies this member against the
     * source, finds it faithful, and then concludes the port is broken somewhere else. */
    const { sku, sizeGroup, colourGroup, largeOption } = buildTwoOptionSku();

    expect(sku.getOptions()).toContain(largeOption);
    expect(largeOption.optionGroup).toBe(sizeGroup);

    /* The option IS attached and its group identifier IS the one asked for, and the lookup still
     * misses. The legacy has no `else` arm at `:L241-L245`, so control falls off the end and CFML
     * returns null — `undefined` here. */
    expect(sku.getOptionByOptionGroupID(sizeGroup.optionGroupID)).toBeUndefined();
    expect(sku.getOptionByOptionGroupID(colourGroup.optionGroupID)).toBeUndefined();
    expect(sku.getOptionByOptionGroupID('og-not-on-this-sku')).toBeUndefined();

    /* Unlike its code-keyed sibling at `:L247` it does NOT raise, because it never touches the
     * code-keyed struct D1 destroys. Miss and raise are different observable outcomes and this file
     * keeps them apart. */
    expect(() => sku.getOptionByOptionGroupID(sizeGroup.optionGroupID)).not.toThrow();
  });

  it('NET-NEW — model/entity/Sku.cfc:L524-L533 — getOptionsIDList() returns a COMMA-delimited string in options-array order and memoizes per instance', () => {
    const { sku, sizeGroup } = buildTwoOptionSku();

    /* The comma is `listAppend`'s default delimiter at `:L529`, and the string return type is
     * preserved rather than "improved" to an array: this exact shape is what the option-resolution
     * repository consumes and what `hasUniqueOptions` rebuilds independently at `:L757-L761`. */
    expect(sku.getOptionsIDList()).toBe(`${LARGE_OPTION_ID},${RED_OPTION_ID}`);
    expect(sku.getOptionsIDList().split(',')).toEqual([LARGE_OPTION_ID, RED_OPTION_ID]);

    /* THE MEMO IS OBSERVABLE THROUGH ITS STALENESS. `:L525` caches on first call, so an option added
     * afterwards is absent from every later read. That is the legacy behaviour, and it is why the
     * combination engine must finish assembling a SKU's options before anything reads this member. */
    const greenOption = newOption(sizeGroup, 'o-green', 'Green', 'Gr');
    sku.addOption(greenOption);
    expect(sku.getOptions()).toHaveLength(3);
    expect(sku.getOptionsIDList()).toBe(`${LARGE_OPTION_ID},${RED_OPTION_ID}`);

    /* A SKU built with all three from the start sees all three — so the staleness above really is the
     * cache and not a lost option. */
    const freshSku = buildSku({
      skuID: SIBLING_SKU_ID,
      options: [newLargeOption(newSizeGroup()), newRedOption(newColourGroup())],
    });
    expect(freshSku.getOptionsIDList()).toBe(`${LARGE_OPTION_ID},${RED_OPTION_ID}`);

    /* No options means the empty string, which `hasUniqueOptions` then treats as a legal selection
     * (semantic T5). */
    expect(buildSku({}).getOptionsIDList()).toBe('');
  });

  it('NET-NEW — model/entity/Sku.cfc:L76 — addOption/removeOption/hasOption mutate ONLY the SKU-owned options array, with no inverse write onto the Option', () => {
    const sizeGroup = newSizeGroup();
    const largeOption = newLargeOption(sizeGroup);
    const sku = buildSku({ skuID: PERSISTED_SKU_ID });

    expect(sku.hasOption(largeOption)).toBe(false);

    sku.addOption(largeOption);
    expect(sku.hasOption(largeOption)).toBe(true);
    expect(sku.getOptions()).toEqual([largeOption]);

    /* `:L76` declares the many-to-many with `linktable="SwSkuOption"` and no `inverse` attribute, so
     * THE SKU IS THE OWNING SIDE. `model/entity/Option.cfc` declares the mirror with `inverse="true"`,
     * which means the owning mutator writes one collection and one only. NO INVERSE WRITE IS INVENTED
     * HERE: `Option.skus` stays empty, exactly as adding from the owning side leaves it. */
    expect(largeOption.skus).toEqual([]);

    /* Idempotent, because the guard tests membership before pushing. Adding the same object twice is
     * what the combination engine does when a group repeats, and it must not double the row. */
    sku.addOption(largeOption);
    expect(sku.getOptions()).toEqual([largeOption]);

    /* Removal takes the first matching entry out and leaves the array otherwise intact. */
    const redOption = newRedOption(newColourGroup());
    sku.addOption(redOption);
    expect(sku.getOptions()).toEqual([largeOption, redOption]);
    sku.removeOption(largeOption);
    expect(sku.getOptions()).toEqual([redOption]);
    expect(sku.hasOption(largeOption)).toBe(false);

    /* Removing something that was never present is a no-op rather than an error. */
    sku.removeOption(largeOption);
    expect(sku.getOptions()).toEqual([redOption]);

    /* And the mutations happened in place, on the very array the entity exposes — the property the
     * ORM-facing populate descriptors at `readRelated` depend on. */
    expect(sku.getOptions()).toBe(sku.options);
  });
});

/* =================================================================================================
 * THE SKU DEFINITION — THREE PRODUCT-TYPE BRANCHES, EACH PRESERVED AS WRITTEN
 * ============================================================================================== */

describe('Sku — getSkuDefinition across the three seeded product types', () => {
  it('NET-NEW — model/entity/Sku.cfc:L577-L578 — the contentAccess branch is DELIBERATELY EMPTY and yields the empty string even with options attached', async () => {
    const sizeGroup = newSizeGroup();
    const contentAccessProduct = newProductOfType(CONTENT_ACCESS_PRODUCT_TYPE.productTypeID);
    const sku = buildSku({
      skuID: PERSISTED_SKU_ID,
      product: contentAccessProduct,
      options: [newLargeOption(sizeGroup)],
    });
    const { resolver, requestedProductTypeIds } = createProductTypeRootResolverDouble();

    /* `:L577` opens the `contentAccess` branch and `:L578` closes it with nothing in between. The
     * emptiness is the behaviour, not an omission in the port: a content-access SKU has no option
     * combination to describe, so the legacy author left the branch blank. Filling it would invent a
     * definition string the legacy never produced. */
    await expect(sku.getSkuDefinition(resolver)).resolves.toBe('');

    /* The branch really was selected — the root product type was resolved through the injected port,
     * which is the target's replacement for `getProduct().getProductType().getBaseProductType()`. */
    expect(requestedProductTypeIds).toEqual([CONTENT_ACCESS_PRODUCT_TYPE.productTypeID]);
    expect(CONTENT_ACCESS_PRODUCT_TYPE.systemCode).toBe('contentAccess');

    /* Options are present, so the empty result cannot be explained away as "there was nothing to
     * describe". */
    expect(sku.getOptions()).toHaveLength(1);
  });

  it('NET-NEW — model/entity/Sku.cfc:L579-L583 — the merchandise branch keeps the LEADING SPACE inside every segment, because the trim() at :L583 discards its own result', async () => {
    const { sku } = buildTwoOptionSku();
    const { resolver } = createProductTypeRootResolverDouble();

    const definition = await sku.getSkuDefinition(resolver);

    /* `:L581` appends `" #optionGroupName#: #optionName#"` — note the space BEFORE the group name —
     * and `:L582` joins with a comma. The result reads as `" Size: Large, Colour: Red"`. */
    expect(SKU_DEFINITION_SEGMENT_DELIMITER).toBe(',');
    expect(definition).toBe(
      ` ${SIZE_OPTION_GROUP_NAME}: ${LARGE_OPTION_NAME}${SKU_DEFINITION_SEGMENT_DELIMITER} ${COLOUR_OPTION_GROUP_NAME}: ${RED_OPTION_NAME}`,
    );
    expect(definition).toBe(' Size: Large, Colour: Red');

    /* THE DISCARDED TRIM IS THE POINT. `:L583` reads `trim(variables.skuDefinition);` — an expression
     * statement whose value is never assigned back — so the leading space survives into the returned
     * string. Trimming here would be a silent repair, and it would change every rendered SKU
     * definition in the system. */
    expect(definition.startsWith(' ')).toBe(true);
    expect(definition).not.toBe(definition.trim());
    expect(definition.trim()).toBe('Size: Large, Colour: Red');

    /* Segment order follows the options array, for the same reason the display member does. */
    expect(definition.split(SKU_DEFINITION_SEGMENT_DELIMITER)).toEqual([
      ' Size: Large',
      ' Colour: Red',
    ]);
  });

  it('NET-NEW — model/entity/Sku.cfc:L584-L585 — the subscription branch formats the resource-bundle key and the term name with a colon and a space', async () => {
    const subscriptionProduct = newProductOfType(SUBSCRIPTION_PRODUCT_TYPE.productTypeID);
    const sku = buildSku({ skuID: PERSISTED_SKU_ID, product: subscriptionProduct });
    /* The term is attached through the entity setter rather than through the fixture seed, because the
     * port's `SubscriptionTermReference` is a MINIMAL OPAQUE REFERENCE carrying only the identifier —
     * the boundary type for the excluded `Subscription*` family — whereas the entity's own
     * `SubscriptionTermRef` also admits the display name this member renders. Reaching for the setter
     * keeps the narrower boundary type intact instead of widening a port to suit a test. */
    sku.setSubscriptionTerm({
      subscriptionTermID: physicalID('st-monthly'),
      subscriptionTermName: 'Monthly',
    });
    const { resolver } = createProductTypeRootResolverDouble();

    /* `:L585` builds `"#rbKey('entity.subscriptionTerm')#: #getSubscriptionTerm().getSubscriptionTermName()#"`.
     * The resource-bundle machinery itself is out of scope, so the KEY is the seam: the default
     * argument carries the literal key and a caller may substitute a resolved label. Either way the
     * `": "` between the two halves is the formatting this case pins. */
    expect(SUBSCRIPTION_TERM_RESOURCE_BUNDLE_KEY).toBe('entity.subscriptionTerm');
    await expect(sku.getSkuDefinition(resolver)).resolves.toBe(
      `${SUBSCRIPTION_TERM_RESOURCE_BUNDLE_KEY}: Monthly`,
    );

    /* With a resolved label supplied instead of the raw key, the same `": "` formatting holds — which
     * is what makes the seam usable without dragging the bundle in. */
    const relabelledSku = buildSku({
      skuID: SIBLING_SKU_ID,
      product: newProductOfType(SUBSCRIPTION_PRODUCT_TYPE.productTypeID),
    });
    relabelledSku.setSubscriptionTerm({
      subscriptionTermID: physicalID('st-monthly'),
      subscriptionTermName: 'Monthly',
    });
    await expect(relabelledSku.getSkuDefinition(resolver, 'Subscription Term')).resolves.toBe(
      'Subscription Term: Monthly',
    );
  });

  it('NET-NEW — model/entity/Sku.cfc:L575-L589 — the definition is memoized per instance and an unassociated SKU matches no branch at all', async () => {
    const { sku, sizeGroup } = buildTwoOptionSku();
    const { resolver, requestedProductTypeIds } = createProductTypeRootResolverDouble();

    const first = await sku.getSkuDefinition(resolver);
    expect(first).toBe(' Size: Large, Colour: Red');
    expect(requestedProductTypeIds).toHaveLength(1);

    /* `:L575` guards on the cache, so a second call neither rebuilds the string nor re-consults the
     * resolver — the probe count is the evidence, and it is what makes the M7 isolation case later in
     * this file a meaningful question rather than a formality. */
    sku.addOption(newOption(sizeGroup, 'o-green', 'Green', 'Gr'));
    await expect(sku.getSkuDefinition(resolver)).resolves.toBe(first);
    expect(requestedProductTypeIds).toHaveLength(1);

    /*
     * ⭐ AN UNASSOCIATED SKU RAISES ON THE FIRST CALL AND THEN ANSWERS `''` ON EVERY LATER ONE, AND
     * BOTH HALVES ARE THE LEGACY'S. `:L576` writes `variables.skuDefinition = ""` BEFORE `:L577`
     * evaluates `getBaseProductType()`, and that evaluation reaches the bare
     * `return getProduct().getBaseProductType();` at `:L357` — so the first call fails with the memo
     * already seeded, and the `:L575` cache guard then short-circuits every subsequent call.
     *
     * ⛔ THIS BLOCK PREVIOUSLY ASSERTED `''` ON THE FIRST CALL, claiming "the legacy behaves
     * identically — `getProduct()` returns null and the comparison at `:L577` simply fails".
     * WITHDRAWN: the comparison is never reached, because the CALL raises first. Reading a null and
     * comparing it is not what `:L577` does.
     */
    const buildUnassociatedSku = (): Sku =>
      buildSku({ skuID: OPTIONLESS_SKU_ID, options: [newLargeOption(newSizeGroup())] });

    /* A FRESH instance per rejection assertion, deliberately: the memo below means the same instance
     * answers differently on a second call, so reusing one here would assert the opposite thing. */
    await expect(buildUnassociatedSku().getSkuDefinition(resolver)).rejects.toBeInstanceOf(
      DomainError,
    );
    await expect(buildUnassociatedSku().getSkuDefinition(resolver)).rejects.toThrow(
      /model\/entity\/Sku\.cfc:L357/,
    );

    /* And the memo the FAILED call already seeded then takes over, exactly as `:L575-L576` make it: the
     * second call raises nothing and answers the empty string. Asserted rather than left implicit
     * because it is the whole difference between porting `:L576`'s POSITION faithfully and hoisting it
     * to the end of the method for tidiness — the tidy version would have raised here forever. */
    const memoisedAfterFailure = buildUnassociatedSku();
    await expect(memoisedAfterFailure.getSkuDefinition(resolver)).rejects.toBeInstanceOf(
      DomainError,
    );
    await expect(memoisedAfterFailure.getSkuDefinition(resolver)).resolves.toBe('');
  });
});

/* =================================================================================================
 * D16 — THE THREE-MEMBER DEPRECATED REGISTRATION, PLUS THE FOURTH MEMBER OUTSIDE IT
 * =================================================================================================
 * `model/entity/Sku.cfc:L882-L912` is an explicit deprecated region, closed at `:L912`. D16 registers
 * exactly THREE members inside it, each with its own in-source hint — and, decisively, THEY DO NOT
 * SHARE AN OUTCOME. One is broken, two work perfectly. A single blanket "the deprecated members are
 * deprecated" assertion would erase that difference and mislabel two correct methods as defective, so
 * each gets its own case and its own verdict.
 *
 * `displayOptions()` at `:L884-L891` also carries a deprecation hint but is NOT part of D16's
 * three-member registration, so it is tested separately and no defect identifier is attached to it.
 *
 * THE REGION IS CLOSED AT `model/entity/Sku.cfc:L912`. That boundary is what makes the membership
 * question answerable at all: four hint-bearing members sit between `:L882` and `:L912`, three of them
 * registered under D16 and one not, and nothing after `:L912` belongs to the region however similar it
 * may look. The four cases below are therefore the complete set — no fifth deprecated member is
 * invented, and none of the four is folded into another.
 * ============================================================================================== */

describe('Sku — D16 deprecated members, three distinct outcomes', () => {
  it('NET-NEW — model/entity/Sku.cfc:L893-L896 — getOptionsByGroupIDStruct() is BROKEN: it delegates to the D2 accessor and therefore always returns an empty map', () => {
    // @hint: USE getOptionsByOptionGroupIDStruct()
    /* TODO(parity) D16 — model/entity/Sku.cfc:L893-L896 — the hint above is the source's own, carried
     * verbatim as a deprecation annotation.
     * TODO(parity) D2 — model/entity/Sku.cfc:L512-L522 — the accessor it delegates to. */
    const { sku, sizeGroup, colourGroup } = buildTwoOptionSku();

    /* The hint points a caller at the accessor `:L895` already calls, which is the whole body. So the
     * migration it recommends changes nothing: the recommended member is broken in exactly the same
     * way, and the caller receives an empty map either way. */
    expect(sku.getOptionsByGroupIDStruct()).toEqual({});
    expect(sku.getOptionsByGroupIDStruct()).toEqual(sku.getOptionsByOptionGroupIDStruct());
    expect(Object.hasOwn(sku.getOptionsByGroupIDStruct(), sizeGroup.optionGroupID)).toBe(false);
    expect(Object.hasOwn(sku.getOptionsByGroupIDStruct(), colourGroup.optionGroupID)).toBe(false);

    /* Pure delegation, so it inherits the memo too — the same object comes back each time. */
    expect(sku.getOptionsByGroupIDStruct()).toBe(sku.getOptionsByOptionGroupIDStruct());
  });

  it('NET-NEW — model/entity/Sku.cfc:L898-L905 — getOptionsValueStruct() WORKS CORRECTLY: keyed by option-group NAME, valued by option IDENTIFIER, with the last option for a name winning', () => {
    // @hint: NEVER USE
    /* The hint above is the source's own, carried verbatim as a deprecation annotation. IT IS
     * SEMANTIC GUIDANCE, NOT A DEFECT REPORT. `:L899-L904` reads each option's group name and each
     * option's identifier and assembles exactly the map it promises. The advice not to use it is the
     * author's; the method's correctness is not in question, and this case deliberately does not label
     * it broken. */
    const { sku } = buildTwoOptionSku();

    expect(sku.getOptionsValueStruct()).toEqual({
      [SIZE_OPTION_GROUP_NAME]: LARGE_OPTION_ID,
      [COLOUR_OPTION_GROUP_NAME]: RED_OPTION_ID,
    });

    /* THE KEY IS THE DISPLAY NAME, NOT THE CODE AND NOT THE IDENTIFIER — a distinction that matters
     * precisely because the three-struct cluster above shows how easily those are confused. */
    expect(Object.keys(sku.getOptionsValueStruct()).sort()).toEqual([
      COLOUR_OPTION_GROUP_NAME,
      SIZE_OPTION_GROUP_NAME,
    ]);
    expect(Object.hasOwn(sku.getOptionsValueStruct(), SIZE_OPTION_GROUP_CODE)).toBe(false);

    /* LAST WINS, and that is not an accident of the port. `:L902` assigns unconditionally, with none of
     * the `if(!structKeyExists(...))` guard that `:L504` uses — so two option groups sharing a display
     * name collapse onto one key and the later option overwrites the earlier. Contrast D1's
     * first-wins intent. Both are preserved as written. */
    const duplicateNameGroup = buildOptionGroup({
      optionGroupID: physicalID('og-size-duplicate'),
      optionGroupCode: 'SIZE-2',
      optionGroupName: SIZE_OPTION_GROUP_NAME,
    });
    sku.addOption(newOption(duplicateNameGroup, 'o-small', 'Small', 'Sm'));
    expect(sku.getOptionsValueStruct()[SIZE_OPTION_GROUP_NAME]).toBe('o-small');

    /* Not memoized — `:L899` rebuilds the map on every call, which is why the addition above is
     * visible here while the same addition is invisible to the memoized identifier list. */
    expect(sku.getOptionsValueStruct()).not.toBe(sku.getOptionsValueStruct());
  });

  it('NET-NEW — model/entity/Sku.cfc:L907-L910 — isNotDefaultSku() WORKS CORRECTLY as the exact boolean inverse of getDefaultFlag()', () => {
    // @hint: USE getDefaultFlag()
    /* The hint above is the source's own, carried verbatim as a deprecation annotation. The method it
     * recommends is the one `:L909` already calls, negated — so again this is guidance rather than a
     * bug, and the member is asserted as CORRECT. */
    const { sku, product } = buildTwoOptionSku();
    product.defaultSku = createDefaultSkuDelegate(sku);

    /* The product's default sku exposes no identifier accessor of its own, so the identifier is read
     * through an injected reader — the target's replacement for `getProduct().getDefaultSku().getSkuID()`.
     * When it names THIS sku, the flag is true and the negation is false. */
    expect(sku.getDefaultFlag(() => PERSISTED_SKU_ID)).toBe(true);
    expect(sku.isNotDefaultSku(() => PERSISTED_SKU_ID)).toBe(false);

    /* When it names a sibling, both flip. */
    expect(sku.getDefaultFlag(() => SIBLING_SKU_ID)).toBe(false);
    expect(sku.isNotDefaultSku(() => SIBLING_SKU_ID)).toBe(true);

    /* Exact inverse for every input, which is the entire contract of `:L909`. */
    for (const readDefaultSkuId of [
      (): string => PERSISTED_SKU_ID,
      (): string => SIBLING_SKU_ID,
      (): string => SECOND_SIBLING_SKU_ID,
    ]) {
      expect(sku.isNotDefaultSku(readDefaultSkuId)).toBe(!sku.getDefaultFlag(readDefaultSkuId));
    }

    /* ⭐ A SKU WITH NO PRODUCT GETS NO ANSWER FROM EITHER MEMBER, BECAUSE `:L443` DEREFERENCES TWICE
     * WITH NO GUARD — `getProduct()` and then `getDefaultSku()` — and CFML raises on the first hop.
     * `:L909` negates the RESULT of that call, so there is nothing to negate and the deprecated member
     * raises too. The inverse relationship is therefore intact for every input that HAS one.
     *
     * ⛔ AN EARLIER REVISION ASSERTED `false` AND `true` HERE, on the reading that "a SKU with no product
     * is nobody's default". That is withdrawn under AAP §0.6.7 (preserve and annotate, do not repair):
     * `model/validation/Sku.json:L3` gates deletion on `defaultFlag eq false`, so answering `false`
     * PASSED the delete guard and permitted a delete the legacy system aborted — a hardening encoded as
     * parity, in the one direction where being wrong destroys data. */
    const unassociatedSku = buildSku({ skuID: OPTIONLESS_SKU_ID });
    expect(() => unassociatedSku.getDefaultFlag(() => OPTIONLESS_SKU_ID)).toThrow(DomainError);
    expect(() => unassociatedSku.isNotDefaultSku(() => OPTIONLESS_SKU_ID)).toThrow(DomainError);
    expect(() => unassociatedSku.getDefaultFlag(() => OPTIONLESS_SKU_ID)).toThrow(
      'model/entity/Sku.cfc:L443',
    );

    /* ⭐ AND THE SECOND HOP RAISES ON ITS OWN, WHICH IS A DIFFERENT INPUT AND A DIFFERENT MESSAGE. A SKU
     * that HAS a product whose `defaultSku` is unset reaches `getDefaultSku()` and fails there. Both
     * dereferences at `:L443` are unguarded, so both are reproduced rather than only the first. */
    const { sku: orphanedSku } = buildTwoOptionSku();
    expect(() => orphanedSku.getDefaultFlag(() => PERSISTED_SKU_ID)).toThrow(DomainError);
    expect(() => orphanedSku.getDefaultFlag(() => PERSISTED_SKU_ID)).toThrow(
      'which has no default SKU',
    );
  });

  it('NET-NEW — model/entity/Sku.cfc:L884-L891 — displayOptions() is a FOURTH deprecated member outside the D16 registration, and it forwards the caller-supplied delimiter unchanged', () => {
    // @hint: USE skuDefinition()
    /* The hint above is the source's own. NO DEFECT IDENTIFIER IS ATTACHED: `:L884-L891` carries a
     * deprecation hint but is not one of D16's three registered members, and inventing a number for it
     * would corrupt the register. Its body at `:L890` is `return getOptionsDisplay(arguments.delimiter);`
     * — identical forwarding, delimiter included. */
    const { sku } = buildTwoOptionSku();

    expect(sku.displayOptions(NON_DEFAULT_OPTIONS_DELIMITER)).toBe('Large | Red');
    expect(sku.displayOptions(NON_DEFAULT_OPTIONS_DELIMITER)).toBe(
      sku.getOptionsDisplay(NON_DEFAULT_OPTIONS_DELIMITER),
    );

    /* Same declared default as the member it forwards to, so an argument-free call agrees as well. */
    expect(sku.displayOptions()).toBe(sku.getOptionsDisplay());
    expect(sku.displayOptions()).toBe('Large Red');

    /* The hint recommends the definition member instead, and the two are genuinely different shapes —
     * which is worth showing, because "deprecated in favour of X" is only useful if X differs. */
    expect(sku.displayOptions(NON_DEFAULT_OPTIONS_DELIMITER)).not.toBe(' Size: Large, Colour: Red');
  });
});

/* =================================================================================================
 * hasUniqueOptions — THE ASYNCHRONOUS READ-BACK VALIDATOR, AND D19
 * =================================================================================================
 * `model/entity/Sku.cfc:L756-L769` is not an ordinary helper. It is a METHOD-BASED VALIDATION RULE
 * registered for the save context by `model/validation/Sku.json:L6`, and it REACHES THE DATABASE to do
 * its work — which makes it the entry point of the read-back loop AAP 0.6.2 identifies as the
 * highest-risk item in the whole slice. Under CFML the rule saw whatever the Hibernate session had
 * flushed; under `mysql2` there is no session and no automatic flush, so a port that inserts a whole
 * combination batch and then validates, or validates before inserting anything, produces DIFFERENT
 * results with no error and no compile failure.
 *
 * The seam is therefore the thing under test here. Everything about WHICH rows come back belongs to
 * the repository adapter; everything about the string sent and the verdict returned belongs to the
 * entity, and that is exactly the split these cases assert.
 * ============================================================================================== */

describe('Sku — hasUniqueOptions selected-options assembly at the domain seam', () => {
  it('NET-NEW — model/entity/Sku.cfc:L757-L761 — the option identifiers are assembled into ONE comma-delimited string in current iteration order, with no sorting', async () => {
    const sizeGroup = newSizeGroup();
    const colourGroup = newColourGroup();
    /* Deliberately reversed relative to the fixture, so an alphabetical or identifier-sorted
     * implementation produces a visibly different string. */
    const sku = buildSku({
      skuID: PERSISTED_SKU_ID,
      product: newMerchandiseProduct(),
      options: [newRedOption(colourGroup), newLargeOption(sizeGroup)],
    });
    const recording = createRecordingSelectedOptionsLookup();

    await sku.hasUniqueOptions(recording.lookup);

    /* `:L758-L760` uses `listAppend` with the DEFAULT delimiter, so a comma, and appends in the order
     * `getOptions()` yields — nothing reorders it. */
    expect(recording.received).toEqual([`${RED_OPTION_ID},${LARGE_OPTION_ID}`]);

    /* ⭐ REVIEW FINDING 16, ASSERTED RATHER THAN ASSUMED. The line above compares against the same
     * two constants the fixture was built from, so it would hold for any identifier shape whatsoever —
     * including the short readable tokens this file used to carry. This line pins the SHAPE of what
     * actually crossed the seam: two IR-6 identifiers, 32 lowercase hexadecimal characters each, joined
     * by exactly one comma and nothing else. It is the assertion that would catch a padding step, a
     * case fold, a dash reinsertion or a stray delimiter, none of which a seven-character ASCII fixture
     * can distinguish from correct behaviour. (It replaces a duplicate restatement of the line above
     * that hard-coded the readable literals.) */
    expect(recording.received[0]).toMatch(/^[0-9a-f]{32},[0-9a-f]{32}$/);

    /* And the string really is unsorted: sorting the same identifiers gives the other order.
     *
     * ⚠️ The proof depends on the pair being out of sorted order to begin with, which is a property of
     * the two derived values and not something the member controls. Asserting that precondition
     * explicitly means a future label change fails HERE, with a legible reason, instead of turning the
     * `not.toBe` below into a passing tautology. */
    expect(RED_OPTION_ID > LARGE_OPTION_ID).toBe(true);
    const sortedEquivalent = [RED_OPTION_ID, LARGE_OPTION_ID].slice().sort().join(',');
    expect(recording.received[0]).not.toBe(sortedEquivalent);

    /* It is also built independently of the memoized identifier list at `:L524-L533`, which is why the
     * two must agree in shape: `:L757-L761` duplicates that assembly rather than calling it. */
    expect(recording.received[0]).toBe(sku.getOptionsIDList());
  });

  it('NET-NEW — model/entity/Sku.cfc:L757-L761 — repeated option identifiers are NOT de-duplicated, so a duplicated identifier appears once per option held', async () => {
    /* Two DISTINCT option objects that happen to carry the same identifier. The owning-side
     * `addOption` guard tests object membership, not identifier equality, so both are held — and the
     * legacy `listAppend` loop has no de-duplication step of its own. */
    const firstGroup = newSizeGroup();
    const secondGroup = newColourGroup();
    const sku = buildSku({
      skuID: PERSISTED_SKU_ID,
      product: newMerchandiseProduct(),
      options: [
        newOption(firstGroup, LARGE_OPTION_ID, LARGE_OPTION_NAME, 'Lg'),
        newOption(secondGroup, LARGE_OPTION_ID, LARGE_OPTION_NAME, 'Lg'),
      ],
    });
    const recording = createRecordingSelectedOptionsLookup();

    expect(sku.getOptions()).toHaveLength(2);
    await sku.hasUniqueOptions(recording.lookup);

    /* THE DUPLICATE SURVIVES, AND IT MATTERS DOWNSTREAM. Semantic T1 appends one correlated `EXISTS`
     * clause PER LIST ELEMENT, so a duplicated identifier yields a duplicated clause — harmless for
     * the result set but the reason a `GROUP BY ... HAVING COUNT(*) = N` rewrite would diverge.
     * De-duplicating here would quietly change the query the repository builds. */
    expect(recording.received).toEqual([`${LARGE_OPTION_ID},${LARGE_OPTION_ID}`]);
  });

  it('NET-NEW — model/entity/Sku.cfc:L757-L761 — zero options produce the legal EMPTY STRING rather than a guard or an early return', async () => {
    const sku = buildSku({ skuID: PERSISTED_SKU_ID, product: newMerchandiseProduct() });
    const recording = createRecordingSelectedOptionsLookup();

    expect(sku.getOptions()).toEqual([]);
    await sku.hasUniqueOptions(recording.lookup);

    /* `listLen("")` is zero, so semantic T5 makes the empty selection a LEGAL input that the repository
     * degenerates into "every option-bearing SKU of this product". The lookup is still called — no
     * short circuit is introduced — because both `Product.getSkuBySelectedOptions` and this member
     * depend on that degenerate form. */
    expect(recording.received).toEqual(['']);
    expect(recording.received).toHaveLength(1);
  });

  it('NET-NEW — model/entity/Sku.cfc:L763 — the lookup receives ONLY the selected-options string, with product scoping resolved behind the repository', async () => {
    const { sku, product } = buildTwoOptionSku();

    /* The domain seam is one string and nothing else. `SkusBySelectedOptionsLookup` declares a single
     * parameter, and this recorder counts what actually arrives rather than trusting the declaration. */
    const receivedArgumentCounts: number[] = [];
    const arityRecordingLookup: SkusBySelectedOptionsLookup = {
      getSkusBySelectedOptions: (...received: unknown[]): Promise<readonly Sku[]> => {
        receivedArgumentCounts.push(received.length);
        return Promise.resolve([]);
      },
    };

    await sku.hasUniqueOptions(arityRecordingLookup);
    expect(receivedArgumentCounts).toEqual([1]);

    /* WHERE THE PRODUCT IDENTIFIER GOES. The legacy `:L763` reads
     * `getProduct().getSkusBySelectedOptions(selectedOptions=optionsList)` and the product identifier
     * is supplied further down the chain — `model/entity/Product.cfc:L367` passes it positionally to
     * the service, which passes it to the DAO. Semantic T2 records that it is therefore ALWAYS present
     * on the real path. So the scoping is not lost, it is simply not the entity's business: the
     * repository double below receives it while the entity never mentions it. */
    const repository = createInMemorySkuRepository({ skus: [sku] });
    const scopedLookup = createSkusBySelectedOptionsLookup(
      repository.repository,
      product.productID,
    );

    await sku.hasUniqueOptions(scopedLookup);

    expect(repository.calls).toEqual([
      {
        member: 'findSkusBySelectedOptions',
        optionIds: [LARGE_OPTION_ID, RED_OPTION_ID],
        productId: CATALOG_PRODUCT_ID,
      },
    ]);
  });
});

describe('Sku — hasUniqueOptions verdicts and self-exclusion', () => {
  it('NET-NEW — model/entity/Sku.cfc:L764 — no matching rows means unique, and the verdict is a real boolean despite the legacy declaring returntype any', async () => {
    const { sku } = buildTwoOptionSku();

    const verdict = await sku.hasUniqueOptions(noMatchingSkusLookup);

    /* `!arrayLen(skus)` is the first half of the `:L764` guard. */
    expect(verdict).toBe(true);
    /* The legacy signature at `:L755` is `public any function hasUniqueOptions()`, yet every branch
     * yields a boolean and the validation engine coerces whatever it gets. The port narrows the
     * declaration to the observed contract, which is the tightening recorded under TR-1. */
    expect(typeof verdict).toBe('boolean');
  });

  it('NET-NEW — model/entity/Sku.cfc:L764 — exactly one row that IS this SKU means unique, because self-exclusion happens in application code rather than in SQL', async () => {
    const { sku } = buildTwoOptionSku();
    const selfOnlyLookup = createRecordingSelectedOptionsLookup([sku]);

    /* G6 — WHERE SELF-EXCLUSION LIVES, AND WHY IT IS A STRICT COMPARISON HERE.
     * `:L764` is APPLICATION CODE, not SQL: the query at `:L763` happily returns the SKU being
     * validated, and the second half of the guard —
     * `arrayLen(skus) == 1 && skus[1].getSkuID() == getSkuID()` — is what forgives it. Contrast
     * `org/Hibachi/HibachiDAO.cfc:L130-L146`, where the uniqueness check DOES push exclusion into the
     * statement. No SQL self-exclusion is added to the repository double, because adding one would
     * make this branch unreachable and would change which rows the query returns.
     * CFML `==` on strings is CASE-INSENSITIVE, whereas TypeScript `===` is case-sensitive. The
     * identifiers being compared are the 32-character lowercase hex values of IR-6, produced by
     * `createSlatwallUUID()`, so no two identifiers can ever differ only by case — which makes strict
     * comparison the correct target decision rather than a behavioural narrowing. The case-variant
     * assertion below states that decision explicitly instead of leaving it implicit. */
    await expect(sku.hasUniqueOptions(selfOnlyLookup.lookup)).resolves.toBe(true);
    expect(selfOnlyLookup.received).toEqual([`${LARGE_OPTION_ID},${RED_OPTION_ID}`]);

    /* A single row whose identifier differs from this one ONLY BY CASE is treated as a different SKU
     * under `===`. Derived from the fixture identifier rather than invented, so no new literal enters
     * the file. */
    const caseVariantSku = buildSku({
      skuID: PERSISTED_SKU_ID.toUpperCase(),
      product: newMerchandiseProduct(),
      options: [newLargeOption(newSizeGroup()), newRedOption(newColourGroup())],
    });
    expect(caseVariantSku.skuID).not.toBe(sku.skuID);
    const caseVariantLookup = createRecordingSelectedOptionsLookup([caseVariantSku]);
    await expect(sku.hasUniqueOptions(caseVariantLookup.lookup)).resolves.toBe(false);
  });

  it('NET-NEW — model/entity/Sku.cfc:L768 — exactly one row that is a DIFFERENT SKU means not unique', async () => {
    const { sku } = buildTwoOptionSku();
    const sibling = buildSku({
      skuID: SIBLING_SKU_ID,
      product: newMerchandiseProduct(),
      options: [newLargeOption(newSizeGroup()), newRedOption(newColourGroup())],
    });
    const siblingLookup = createRecordingSelectedOptionsLookup([sibling]);

    /* The `arrayLen(skus) == 1` half of the guard holds but the identifier comparison fails, so control
     * falls through to the `return false` at `:L768`. */
    await expect(sku.hasUniqueOptions(siblingLookup.lookup)).resolves.toBe(false);
  });

  it('NET-NEW — model/entity/Sku.cfc:L768 — more than one row means not unique, even when one of them is this very SKU', async () => {
    const { sku } = buildTwoOptionSku();
    const sibling = buildSku({
      skuID: SIBLING_SKU_ID,
      product: newMerchandiseProduct(),
      options: [newLargeOption(newSizeGroup()), newRedOption(newColourGroup())],
    });
    const secondSibling = buildSku({
      skuID: SECOND_SIBLING_SKU_ID,
      product: newMerchandiseProduct(),
      options: [newLargeOption(newSizeGroup()), newRedOption(newColourGroup())],
    });

    /* THE SELF-FORGIVENESS IS GATED ON THE ROW COUNT, NOT ON MEMBERSHIP. `:L764` only reaches the
     * identifier comparison when the result holds EXACTLY ONE row, so a result containing this SKU
     * alongside any other is not unique. Rewriting the guard as "every row is me" would be a different
     * predicate that happens to agree on most inputs. */
    const withSelfLookup = createRecordingSelectedOptionsLookup([sku, sibling]);
    await expect(sku.hasUniqueOptions(withSelfLookup.lookup)).resolves.toBe(false);

    const withoutSelfLookup = createRecordingSelectedOptionsLookup([sibling, secondSibling]);
    await expect(sku.hasUniqueOptions(withoutSelfLookup.lookup)).resolves.toBe(false);
  });

  it('NET-NEW — model/entity/Sku.cfc:L764 — the INSERT-TIME path runs with an unset skuID and assumes no generated database identifier', async () => {
    const sizeGroup = newSizeGroup();
    const colourGroup = newColourGroup();
    const product = newMerchandiseProduct();

    /* A SKU mid-insert: `model/entity/Sku.cfc:L52` declares `unsavedvalue=""`, and per IR-6 the
     * 32-character identifier is generated in APPLICATION code — not by the database — so nothing has
     * assigned one yet and nothing in this case pretends otherwise. */
    const insertingSku = buildSku({
      product,
      options: [newLargeOption(sizeGroup), newRedOption(colourGroup)],
    });
    expect(insertingSku.skuID).toBe(SKU_UNSAVED_ID_VALUE);
    expect(insertingSku.isNew()).toBe(true);

    /* With nothing else matching, the batch is still clean. */
    await expect(insertingSku.hasUniqueOptions(noMatchingSkusLookup)).resolves.toBe(true);

    /* SELF-EXCLUSION IS A NO-OP ON INSERT, and that is the point of exercising this path. The row does
     * not exist yet, so it cannot come back from `:L763`; any row that DOES come back is necessarily a
     * different SKU and the identifier comparison at `:L764` can never forgive it. The same
     * observation applies to the self-exclusion clause of `org/Hibachi/HibachiDAO.cfc:L130-L146`. */
    const persistedSibling = buildSku({
      skuID: SIBLING_SKU_ID,
      product,
      options: [newLargeOption(newSizeGroup()), newRedOption(newColourGroup())],
    });
    const repository = createInMemorySkuRepository({ skus: [persistedSibling] });
    const scopedLookup = createSkusBySelectedOptionsLookup(
      repository.repository,
      product.productID,
    );

    await expect(insertingSku.hasUniqueOptions(scopedLookup)).resolves.toBe(false);

    /* And the query it drove really was scoped and really was conjunctive — the adapter received the
     * split identifier list, in order, alongside the product. */
    expect(repository.calls).toEqual([
      {
        member: 'findSkusBySelectedOptions',
        optionIds: [LARGE_OPTION_ID, RED_OPTION_ID],
        productId: CATALOG_PRODUCT_ID,
      },
    ]);
  });
});

describe('Sku — D19, the option-less SKU that can never satisfy hasUniqueOptions', () => {
  it('NET-NEW — model/entity/Sku.cfc:L756-L769 — an option-less SKU FAILS uniqueness whenever its product already holds an option-bearing SKU', async () => {
    /* TODO(parity) D19 — model/entity/Sku.cfc:L756-L769 — carried, not repaired. */
    const product = newMerchandiseProduct();
    const optionBearingSibling = buildSku({
      skuID: SIBLING_SKU_ID,
      product,
      options: [newLargeOption(newSizeGroup())],
    });
    const optionlessSku = buildSku({ skuID: OPTIONLESS_SKU_ID, product });
    const repository = createInMemorySkuRepository({ skus: [optionBearingSibling, optionlessSku] });
    const lookup = createSkusBySelectedOptionsLookup(repository.repository, product.productID);

    expect(optionlessSku.getOptions()).toEqual([]);
    expect(optionlessSku.getOptionsIDList()).toBe('');

    /* THE MECHANISM, STEP BY STEP.
     *   1. `:L757-L761` builds `optionsList` as the EMPTY STRING, because there are no options.
     *   2. Semantic T5: `listLen("")` is zero, so the DAO at `model/dao/SkuDAO.cfc:L107-L128` appends
     *      ZERO `EXISTS` clauses and the query degenerates to "the option-bearing SKUs of this product".
     *   3. Semantic T3: the vestigial `inner join sku.options as opt` at `model/dao/SkuDAO.cfc:L109`
     *      silently excludes option-LESS SKUs, so the result CANNOT contain the SKU being validated.
     *   4. `:L764` therefore sees one row that is not this SKU, and returns false.
     * The verdict is a defect, not a design: an option-less default SKU is rejected by a uniqueness
     * rule that was never about it. It is carried across exactly, and NO ZERO-OPTION EARLY RETURN IS
     * ADDED — an early `return true` would look like a tidy guard and would silently change which
     * products can be saved. */
    await expect(optionlessSku.hasUniqueOptions(lookup)).resolves.toBe(false);

    /* Steps 2 and 3 made observable: the adapter really was asked for an empty selection, and the
     * option-less SKU really is absent from a result set drawn from a store that contains it. */
    expect(repository.calls).toEqual([
      { member: 'findSkusBySelectedOptions', optionIds: [], productId: CATALOG_PRODUCT_ID },
    ]);
    expect(repository.skus).toContain(optionlessSku);
    await expect(lookup.getSkusBySelectedOptions('')).resolves.toEqual([optionBearingSibling]);
  });

  it('NET-NEW — model/entity/Sku.cfc:L756-L769 — an option-less SKU passes ONLY when its product holds no option-bearing SKU at all', async () => {
    /* TODO(parity) D19 — model/entity/Sku.cfc:L756-L769 — carried, not repaired. */
    const product = newMerchandiseProduct();
    const optionlessSku = buildSku({ skuID: OPTIONLESS_SKU_ID, product });
    const repository = createInMemorySkuRepository({ skus: [optionlessSku] });
    const lookup = createSkusBySelectedOptionsLookup(repository.repository, product.productID);

    /* The ONLY configuration in which the guard can pass: nothing option-bearing exists to come back,
     * so the result is empty and the first half of `:L764` succeeds. That narrowness is what makes D19
     * a defect rather than a quirk — the rule effectively forbids a product from holding both an
     * option-less SKU and any option-bearing one. */
    await expect(optionlessSku.hasUniqueOptions(lookup)).resolves.toBe(true);

    /* Add one option-bearing sibling to the very same product and the same SKU starts failing, with no
     * change whatsoever to the SKU under validation. */
    const freshOptionlessSku = buildSku({ skuID: OPTIONLESS_SKU_ID, product });
    repository.add(
      buildSku({ skuID: SIBLING_SKU_ID, product, options: [newLargeOption(newSizeGroup())] }),
    );
    await expect(freshOptionlessSku.hasUniqueOptions(lookup)).resolves.toBe(false);

    /* A second option-less SKU on the same product is likewise invisible to the query, so it cannot
     * rescue the first — the exclusion at T3 applies to every option-less row alike. */
    repository.add(buildSku({ skuID: SECOND_SIBLING_SKU_ID, product }));
    const thirdOptionlessSku = buildSku({ skuID: OPTIONLESS_SKU_ID, product });
    await expect(thirdOptionlessSku.hasUniqueOptions(lookup)).resolves.toBe(false);
  });
});

/* =================================================================================================
 * hasOneOptionPerOptionGroup — THE PURE, IN-MEMORY VALIDATOR
 * =================================================================================================
 * The counterpart to `hasUniqueOptions`, and its opposite in almost every respect: synchronous, pure,
 * touching no collaborator and reaching no database. `model/entity/Sku.cfc:L772-L784` walks the options
 * once and answers on the first repeated option-group identifier.
 *
 * S7 — THE SOURCE HINT ON THIS METHOD IS WRONG, AND IT IS PRESERVED VERBATIM RATHER THAN CORRECTED.
 * `model/entity/Sku.cfc:L771` reads, exactly:
 *
 *   // @hint this method validates that this skus has a unique option combination that no other sku has
 *
 * That describes `hasUniqueOptions` at `:L756-L769`, the method immediately above it — it is a
 * copy-paste of the preceding description, left in place when this method was added. What this method
 * actually validates is that no option group contributes more than one option to a single SKU, which is
 * a different claim entirely and involves no other SKU at all. THE MISLABELLING IS RECORDED WITHOUT A
 * DEFECT NUMBER: it is a comment, it changes no behaviour, and minting a D-number for it would corrupt
 * the register in AAP 0.6.7.
 * ============================================================================================== */

describe('Sku — hasOneOptionPerOptionGroup, the pure in-memory validator', () => {
  it('NET-NEW — model/entity/Sku.cfc:L783 — no options at all is valid, because the loop never runs and control reaches the trailing true', () => {
    const sku = buildSku({ skuID: PERSISTED_SKU_ID, product: newMerchandiseProduct() });

    expect(sku.getOptions()).toEqual([]);
    expect(sku.hasOneOptionPerOptionGroup()).toBe(true);
    expect(typeof sku.hasOneOptionPerOptionGroup()).toBe('boolean');

    /* Worth stating alongside D19: the two method rules disagree about the option-less SKU. This one
     * passes it and `hasUniqueOptions` rejects it, so a SKU can fail save validation on exactly one of
     * the two constraints that share the `options` key. */
  });

  it('NET-NEW — model/entity/Sku.cfc:L774-L783 — a single option is valid, and so is one option from each of several distinct groups', () => {
    const singleOptionSku = buildSku({
      skuID: PERSISTED_SKU_ID,
      product: newMerchandiseProduct(),
      options: [newLargeOption(newSizeGroup())],
    });
    expect(singleOptionSku.hasOneOptionPerOptionGroup()).toBe(true);

    /* Two distinct groups — the ordinary merchandise shape the combination engine produces. */
    const { sku: twoGroupSku } = buildTwoOptionSku();
    expect(twoGroupSku.hasOneOptionPerOptionGroup()).toBe(true);

    /* Three distinct groups, to show the walk keeps accumulating rather than comparing only neighbours.
     * A pairwise-adjacent implementation would agree on two options and diverge on three. */
    const materialGroup = buildOptionGroup({
      optionGroupID: physicalID('og-material'),
      optionGroupCode: 'MATERIAL',
      optionGroupName: 'Material',
    });
    twoGroupSku.addOption(newOption(materialGroup, 'o-cotton', 'Cotton', 'Ct'));
    expect(twoGroupSku.getOptions()).toHaveLength(3);
    expect(twoGroupSku.hasOneOptionPerOptionGroup()).toBe(true);
  });

  it('NET-NEW — model/entity/Sku.cfc:L776-L777 — two options from the SAME group are invalid, and the answer comes on the FIRST repeat rather than after a full scan', () => {
    const sizeGroup = newSizeGroup();
    const product = newMerchandiseProduct();

    const repeatedGroupSku = buildSku({
      skuID: PERSISTED_SKU_ID,
      product,
      options: [newLargeOption(sizeGroup), newOption(sizeGroup, 'o-small', 'Small', 'Sm')],
    });
    expect(repeatedGroupSku.hasOneOptionPerOptionGroup()).toBe(false);

    /* EARLY RETURN, PROVEN BY WHAT IS NEVER EXAMINED. `:L776-L777` returns the moment a group repeats,
     * so any option AFTER the repeat is never inspected. An option carrying NO option group is the
     * instrument: dereferencing it raises, so its silence is evidence the walk stopped. */
    const optionAfterRepeat = buildOption({
      optionID: physicalID('o-groupless-tail'),
      optionName: 'Tail',
    });
    const earlyReturnSku = buildSku({
      skuID: SIBLING_SKU_ID,
      product,
      options: [
        newLargeOption(newSizeGroup()),
        newOption(newSizeGroup(), 'o-small', 'Small', 'Sm'),
        optionAfterRepeat,
      ],
    });
    expect(optionAfterRepeat.optionGroup).toBeUndefined();
    /* The two size groups above are DISTINCT objects sharing one identifier, which is what makes the
     * repeat happen at index 1 — the check is on the group identifier, not on group identity. */
    expect(earlyReturnSku.getOptions()).toHaveLength(3);
    expect(() => earlyReturnSku.hasOneOptionPerOptionGroup()).not.toThrow();
    expect(earlyReturnSku.hasOneOptionPerOptionGroup()).toBe(false);

    /* CONTROL: the very same group-less option placed BEFORE the repeat is reached, and then it does
     * raise. Without this pairing the case above would prove only that group-less options are
     * harmless, not that the walk stopped short. */
    const fullScanSku = buildSku({
      skuID: SECOND_SIBLING_SKU_ID,
      product,
      options: [
        newLargeOption(newSizeGroup()),
        buildOption({ optionID: physicalID('o-groupless-head'), optionName: 'Head' }),
        newOption(newSizeGroup(), 'o-small', 'Small', 'Sm'),
      ],
    });
    expect(() => fullScanSku.hasOneOptionPerOptionGroup()).toThrow(DomainError);
  });

  it('NET-NEW — model/entity/Sku.cfc:L776 — comparison of option-group identifiers is CASE-SENSITIVE, unlike the list search the validation engine uses', () => {
    const sizeGroup = newSizeGroup();
    /* Derived from the verified fixture identifier rather than invented, so no new literal and no new
     * UUID enters the file. */
    const caseVariantGroup = buildOptionGroup({
      optionGroupID: SIZE_OPTION_GROUP_ID.toUpperCase(),
      optionGroupCode: 'SIZE-UPPER',
      optionGroupName: 'Size (upper)',
    });
    expect(caseVariantGroup.optionGroupID).not.toBe(sizeGroup.optionGroupID);

    const sku = buildSku({
      skuID: PERSISTED_SKU_ID,
      product: newMerchandiseProduct(),
      options: [newLargeOption(sizeGroup), newOption(caseVariantGroup, 'o-small', 'Small', 'Sm')],
    });

    /* `:L776` uses `listFind`, the CASE-SENSITIVE search — deliberately unlike
     * `org/Hibachi/HibachiValidationService.cfc`, which reaches for `listFindNoCase` at `:L71`, `:L258`
     * and `:L461`. Two identifiers differing only in case are therefore two DIFFERENT groups, and this
     * SKU is valid. Substituting the case-insensitive search would flip the verdict, which is why the
     * distinction is asserted rather than assumed. IR-6's identifiers are lowercase 32-character hex,
     * so the situation cannot arise from generated data — it is a property of the comparison, pinned
     * here so a later "harmonise the list searches" change cannot pass unnoticed. */
    expect(sku.hasOneOptionPerOptionGroup()).toBe(true);

    /* The exact-case repeat still fails, so the case sensitivity is the only thing separating the two
     * outcomes. */
    const exactRepeatSku = buildSku({
      skuID: SIBLING_SKU_ID,
      product: newMerchandiseProduct(),
      options: [newLargeOption(sizeGroup), newOption(newSizeGroup(), 'o-small', 'Small', 'Sm')],
    });
    expect(exactRepeatSku.hasOneOptionPerOptionGroup()).toBe(false);
  });
});

/* =================================================================================================
 * THE TYPED RULE RECORDS FOR THE TWO CUSTOM VALIDATORS
 * =================================================================================================
 * `model/validation/Sku.json:L6` registers the two method rules against the `options` property, and the
 * custom-validation region `model/entity/Sku.cfc:L753-L786` declares EXACTLY those two members and no
 * third. The rule records below are where that pairing becomes checkable: a rule set that gained a
 * third method constraint, lost one, reordered them, or filed either under a different key would fail
 * here rather than silently changing which saves succeed.
 * ============================================================================================== */

describe('Sku — the options rule record declares exactly the two method constraints', () => {
  it('NET-NEW — model/validation/Sku.json:L6 — the options property carries exactly two method rules, in source order, both under the options key and both scoped to save', () => {
    const optionsValidation = createOptionsPropertyValidation(noMatchingSkusLookup);

    /* THE ERROR KEY IS THE PROPERTY, NOT THE METHOD NAME.
     * `org/Hibachi/HibachiValidationService.cfc:L221-L224` registers a failure with
     * `arguments.errorBean.addError(arguments.propertyIdentifier, ...)`, so both method failures land
     * under `options`. Nothing anywhere keys an error by `hasUniqueOptions`. */
    expect(optionsValidation.propertyIdentifier).toBe('options');
    expect(optionsValidation.rules).toHaveLength(2);

    const constraintValues: unknown[] = [];
    for (const rule of optionsValidation.rules) {
      /* One constraint per rule, matching the JSON document where each entry carries a single
       * `"method"` key. */
      expect(rule.constraints).toHaveLength(1);
      /* `:L6` scopes both to the save context; neither is a delete guard. */
      expect(rule.contexts).toBe('save');
      for (const constraint of rule.constraints) {
        expect(constraint.constraintType).toBe('method');
        if (constraint.constraintType === 'method') {
          constraintValues.push(constraint.constraintValue);
        }
      }
    }

    /* SOURCE ORDER IS PRESERVED, which matters because it is the order the two messages accumulate
     * under the single `options` key. */
    expect(constraintValues).toEqual(['hasUniqueOptions', 'hasOneOptionPerOptionGroup']);
  });

  it('NET-NEW — model/entity/Sku.cfc:L753-L786 — the whole SKU rule set contains exactly two method constraints, and both belong to the options property', async () => {
    const ruleSet = skuRulesFor<Sku>(noMatchingSkusLookup);

    const methodConstraintOwners: string[] = [];
    const methodConstraintNames: unknown[] = [];
    for (const property of ruleSet.properties) {
      for (const rule of property.rules) {
        for (const constraint of rule.constraints) {
          if (constraint.constraintType === 'method') {
            methodConstraintOwners.push(property.propertyIdentifier);
            methodConstraintNames.push(constraint.constraintValue);
          }
        }
      }
    }

    /* EXACTLY TWO, ACROSS EVERY PROPERTY. The custom-validation region declares two members and the
     * rule set declares two constraints; every other rule in `model/validation/Sku.json` is
     * declarative — required, numeric, minValue, unique, eq, maxCollection — and none of them invokes a
     * method. */
    expect(methodConstraintNames).toEqual(['hasUniqueOptions', 'hasOneOptionPerOptionGroup']);
    expect(methodConstraintOwners).toEqual(['options', 'options']);

    /* And the two exported standalone constraints are the very ones the rule set uses, so a caller
     * assembling a narrower rule set cannot drift from the registered pair. */
    const standaloneUniqueConstraint = createHasUniqueOptionsConstraint(noMatchingSkusLookup);
    expect(standaloneUniqueConstraint.constraintType).toBe('method');
    expect(standaloneUniqueConstraint.constraintValue).toBe('hasUniqueOptions');
    expect(hasOneOptionPerOptionGroupMethodConstraint.constraintType).toBe('method');
    expect(hasOneOptionPerOptionGroupMethodConstraint.constraintValue).toBe(
      'hasOneOptionPerOptionGroup',
    );

    /* THE ASYNCHRONOUS AND SYNCHRONOUS SHAPES ARE BOTH PRESERVED AT THE CONSTRAINT BOUNDARY.
     * `hasUniqueOptions` reaches the database and returns a promise; `hasOneOptionPerOptionGroup` is
     * pure and returns a boolean outright. The engine at
     * `org/Hibachi/HibachiValidationService.cfc:L333-L335` cannot tell the difference because CFML has
     * no promises, so the port awaits both — and each constraint keeps its own natural shape rather
     * than one being forced to imitate the other. */
    const { sku } = buildTwoOptionSku();
    await expect(standaloneUniqueConstraint.invoke(sku)).resolves.toBe(true);
    expect(hasOneOptionPerOptionGroupMethodConstraint.invoke(sku)).toBe(true);
  });
});

/* =================================================================================================
 * D4 — THE STOCKS-DELETABLE CHAIN THAT WAS ALREADY BROKEN IN THE LEGACY SOURCE
 * ============================================================================================== */

describe('Sku — D4, the stocks-deletable boundary', () => {
  it('NET-NEW — model/entity/Sku.cfc:L567-L572 — getStocksDeletableFlag() is a declared boundary that raises, because the DAO member it ultimately calls exists nowhere in the repository', () => {
    /* TODO(parity) D4 — model/entity/Sku.cfc:L567-L572; model/service/SkuService.cfc:L281-L283 —
     * carried, not repaired. */
    const { sku } = buildTwoOptionSku();

    /* THE CHAIN, AND WHERE IT STOPS.
     *   `model/entity/Sku.cfc:L569` calls `getSkuService().getSkuStocksDeletableFlag(skuID=getSkuID())`;
     *   `model/service/SkuService.cfc:L281-L283` forwards to `getSkuDAO().getSkuStocksDeletableFlag(...)`;
     *   and that DAO member IS NOT DECLARED ANYWHERE — not in `model/dao/SkuDAO.cfc`, not in
     *   `model/dao/HibachiDAO.cfc`, not in `org/Hibachi/HibachiDAO.cfc`, and not synthesized, because
     *   `onMissingMethod` prefix dispatch at `org/Hibachi/HibachiService.cfc:L255-L281` fabricates
     *   SERVICE members and not DAO members.
     * So the legacy member cannot succeed either. The honest port is a declared boundary that says so
     * in a typed way, and the assertion below pins the boundary rather than a value. */
    const raised = captureError(() => sku.getStocksDeletableFlag(), NotImplementedError);
    expect(raised).toBeInstanceOf(NotImplementedError);
    /* `NotImplementedError` extends `DomainError`, so a caller catching the base class still catches
     * this — which is what keeps the boundary from needing special handling anywhere. */
    expect(raised).toBeInstanceOf(DomainError);
    expect(raised.member).toBe('Sku.getStocksDeletableFlag');
    expect(raised.context?.['defect']).toBe('D4');
    expect(raised.context?.['locator']).toBe('model/entity/Sku.cfc:L567-L572');

    /* NO IMPLEMENTATION IS INVENTED. Neither a repository member nor a hard-coded boolean is added to
     * make the call succeed: the repository port genuinely has no such member, and a `true` or `false`
     * here would be a fabricated answer to a question the legacy system cannot answer. */
    const repository = createInMemorySkuRepository({ skus: [sku] });
    expect('getSkuStocksDeletableFlag' in repository.repository).toBe(false);
    expect('stocksDeletableFlag' in repository.repository).toBe(false);

    /* It raises identically for an unsaved SKU, so the failure is the missing member rather than a
     * missing identifier. */
    expect(() => buildSku({}).getStocksDeletableFlag()).toThrow(NotImplementedError);
  });
});

/* =================================================================================================
 * M7 — MEMOIZATION SCOPE UNDER A STATELESS INVOCATION MODEL
 * =================================================================================================
 * AAP 0.6.6 M7 records the mismatch: `cacheuse="transactional"` on the entity plus lazy caches held in
 * the CFC `variables` scope have no equivalent in a stateless handler, where NOTHING survives between
 * invocations EXCEPT module-scope state. That exception is the hazard — a module-scope cache on a warm
 * container would leak one request into the next, and across tenants.
 *
 * THE DECISION, STATED RATHER THAN IMPLIED: every memo in this entity lives on the INSTANCE, in private
 * `#` fields, so its lifetime is the lifetime of the object the request built. No module-scope mutable
 * cache exists anywhere in the entity, and none is introduced by this suite. The cases below are what
 * makes that claim falsifiable instead of merely asserted in a comment.
 * ============================================================================================== */

describe('Sku — M7, memoization is per instance and never bleeds between simulated invocations', () => {
  it('NET-NEW — model/entity/Sku.cfc:L525 — a second Sku computes its own option-identifier list and sees nothing of the first', () => {
    const firstSku = buildSku({
      skuID: PERSISTED_SKU_ID,
      product: newMerchandiseProduct(),
      options: [newLargeOption(newSizeGroup()), newRedOption(newColourGroup())],
    });
    expect(firstSku.getOptionsIDList()).toBe(`${LARGE_OPTION_ID},${RED_OPTION_ID}`);

    /* Invocation two, on a different SKU with a different option set. If the memo were module-scoped
     * this would return the first list. */
    const secondSku = buildSku({
      skuID: SIBLING_SKU_ID,
      product: newMerchandiseProduct(),
      options: [newRedOption(newColourGroup())],
    });
    expect(secondSku.getOptionsIDList()).toBe(RED_OPTION_ID);
    expect(secondSku.getOptionsIDList()).not.toBe(firstSku.getOptionsIDList());

    /* Invocation three, option-less: it must see the empty string rather than either earlier value. */
    const thirdSku = buildSku({ skuID: OPTIONLESS_SKU_ID, product: newMerchandiseProduct() });
    expect(thirdSku.getOptionsIDList()).toBe('');

    /* And the first is undisturbed by the two that followed. */
    expect(firstSku.getOptionsIDList()).toBe(`${LARGE_OPTION_ID},${RED_OPTION_ID}`);
  });

  it('NET-NEW — model/entity/Sku.cfc:L575 — a second Sku resolves its own definition through its own collaborator, with no shared cache and no shared probe state', async () => {
    /* Invocation one: merchandise, with its own resolver double. */
    const firstFixture = buildTwoOptionSku();
    const firstResolver = createProductTypeRootResolverDouble();
    await expect(firstFixture.sku.getSkuDefinition(firstResolver.resolver)).resolves.toBe(
      ' Size: Large, Colour: Red',
    );
    expect(firstResolver.requestedProductTypeIds).toEqual([MERCHANDISE_PRODUCT_TYPE.productTypeID]);

    /* Invocation two: a DIFFERENT product type and a DIFFERENT collaborator instance. A module-scope
     * memo would hand back the merchandise string; a shared collaborator would show the first probe. */
    const secondSku = buildSku({
      skuID: SIBLING_SKU_ID,
      product: newProductOfType(CONTENT_ACCESS_PRODUCT_TYPE.productTypeID),
      options: [newLargeOption(newSizeGroup())],
    });
    const secondResolver = createProductTypeRootResolverDouble();
    await expect(secondSku.getSkuDefinition(secondResolver.resolver)).resolves.toBe('');
    expect(secondResolver.requestedProductTypeIds).toEqual([
      CONTENT_ACCESS_PRODUCT_TYPE.productTypeID,
    ]);

    /* Invocation three: subscription, again fresh. Three instances, three answers, three probe logs. */
    const thirdSku = buildSku({
      skuID: SECOND_SIBLING_SKU_ID,
      product: newProductOfType(SUBSCRIPTION_PRODUCT_TYPE.productTypeID),
    });
    thirdSku.setSubscriptionTerm({
      subscriptionTermID: physicalID('st-annual'),
      subscriptionTermName: 'Annual',
    });
    const thirdResolver = createProductTypeRootResolverDouble();
    await expect(thirdSku.getSkuDefinition(thirdResolver.resolver)).resolves.toBe(
      `${SUBSCRIPTION_TERM_RESOURCE_BUNDLE_KEY}: Annual`,
    );

    /* The first instance still answers from its own memo, unchanged by either later invocation, and its
     * probe log still holds exactly one entry. */
    await expect(firstFixture.sku.getSkuDefinition(firstResolver.resolver)).resolves.toBe(
      ' Size: Large, Colour: Red',
    );
    expect(firstResolver.requestedProductTypeIds).toHaveLength(1);
  });

  it('NET-NEW — model/entity/Sku.cfc:L795 — the image-name memo is per instance too, so two SKUs of the same product still generate their own names', () => {
    const settingDouble = createSettingResolverDouble({
      settings: [
        { settingName: 'productImageOptionCodeDelimiter', value: '_' },
        { settingName: 'productImageDefaultExtension', value: 'jpg' },
      ],
    });
    const product = newMerchandiseProduct('CatalogProduct-1');
    const imageGroup = newSizeGroup(true);

    const largeSku = buildSku({
      skuID: PERSISTED_SKU_ID,
      product,
      options: [newLargeOption(imageGroup)],
    });
    const smallSku = buildSku({
      skuID: SIBLING_SKU_ID,
      product,
      options: [newOption(imageGroup, 'o-small', 'Small', 'Sm')],
    });

    /* Same product, same option group, same collaborator — and still two distinct names, because the
     * memo at `:L795` is a field on each object rather than a table keyed by product. */
    expect(largeSku.getImageName(settingDouble.resolver)).toBe('CatalogProduct-1_Lg.jpg');
    expect(smallSku.getImageName(settingDouble.resolver)).toBe('CatalogProduct-1_Sm.jpg');

    /* Repeated reads are served from each instance memo, which the probe log makes visible: the two
     * settings are read once per SKU and not again. */
    expect(largeSku.getImageName(settingDouble.resolver)).toBe('CatalogProduct-1_Lg.jpg');
    expect(smallSku.getImageName(settingDouble.resolver)).toBe('CatalogProduct-1_Sm.jpg');
    expect(settingDouble.calls).toHaveLength(4);
  });
});

/* =================================================================================================
 * THE IMAGE MEMBERS — EVERY PATH AND EVERY EXISTENCE CHECK THROUGH ImagePathPort
 * =================================================================================================
 * `model/entity/Sku.cfc:L131-L227` composes file names, web paths and resized paths, and at `:L221-L227`
 * asks the FILESYSTEM whether an image exists via `fileExists(expandPath(...))`. Neither of those
 * functions has a place in a Lambda handler, so AAP 0.2.2.7 declares `ImagePathPort` and the entity
 * delegates. These cases exercise the entity side of that seam ONLY: no filesystem is touched, no
 * network call is made, no image library is loaded and no path is expanded — every answer comes from a
 * hand-written port double and a hand-written setting double.
 *
 * `getImageDirectory()` is NOT tested against the SKU, because `model/entity/Sku.cfc` DOES NOT DECLARE
 * ONE. The directory member belongs to the product side of the relationship; inventing a SKU-level
 * accessor to make the port symmetrical would add API the legacy never had.
 * ============================================================================================== */

describe('Sku — image file name generation', () => {
  it('NET-NEW — model/entity/Sku.cfc:L131-L139 — generateImageFileName() strips disallowed characters CASE-INSENSITIVELY, so uppercase letters survive', () => {
    const settingDouble = createSettingResolverDouble({
      settings: [
        { settingName: 'productImageOptionCodeDelimiter', value: '_' },
        { settingName: 'productImageDefaultExtension', value: 'jpg' },
      ],
    });
    /* Both the product code and the option code carry characters the legacy strips, and both carry
     * UPPERCASE letters that it must KEEP. */
    const product = newMerchandiseProduct('Cat alog*Product-1');
    const imageGroup = newSizeGroup(true);
    const sku = buildSku({
      skuID: PERSISTED_SKU_ID,
      product,
      options: [newOption(imageGroup, LARGE_OPTION_ID, LARGE_OPTION_NAME, 'Lg*Si ze')],
    });

    /* `:L134` and `:L137` both use `reReplaceNoCase(value, "[^a-z0-9\-\_]", "", "all")`. THE `NoCase`
     * SUFFIX IS THE WHOLE POINT: the character class names lowercase letters only, so a case-SENSITIVE
     * strip would delete every capital. Reading it as `/[^a-z0-9\-_]/g` instead of `/[^a-z0-9\-_]/gi`
     * would silently mangle every product code in the catalogue, and the assertion below is what
     * catches that. */
    expect(sku.generateImageFileName(settingDouble.resolver)).toBe('CatalogProduct-1_LgSize.jpg');

    /* Spaces and the asterisk are gone; the hyphen, the digits and every capital remain. */
    expect(sku.generateImageFileName(settingDouble.resolver)).toContain('C');
    expect(sku.generateImageFileName(settingDouble.resolver)).toContain('P');
    expect(sku.generateImageFileName(settingDouble.resolver)).toContain('-1');
    expect(sku.generateImageFileName(settingDouble.resolver)).not.toContain(' ');
    expect(sku.generateImageFileName(settingDouble.resolver)).not.toContain('*');

    /* The delimiter and the extension are BOTH configuration, read per product — `:L135` and `:L138`
     * resolve them against the product rather than globally, which is why the double records a product
     * scope on each probe. */
    expect(settingDouble.calls.map((call) => call.settingName)).toContain(
      'productImageOptionCodeDelimiter',
    );
    expect(settingDouble.calls.map((call) => call.settingName)).toContain(
      'productImageDefaultExtension',
    );
    expect(settingDouble.calls[0]?.context).toEqual({
      entityName: 'Product',
      entityId: CATALOG_PRODUCT_ID,
    });
  });

  it('NET-NEW — model/entity/Sku.cfc:L133-L136 — only option groups flagged for images contribute a segment, and the segments follow options-array order', () => {
    const settingDouble = createSettingResolverDouble({
      settings: [
        { settingName: 'productImageOptionCodeDelimiter', value: '-' },
        { settingName: 'productImageDefaultExtension', value: 'png' },
      ],
    });
    const imageGroup = newSizeGroup(true);
    const nonImageGroup = newColourGroup(false);
    const product = newMerchandiseProduct('CatalogProduct-1');

    /* The colour option is attached FIRST but its group is not an image group, so it contributes
     * nothing — which also proves the segments are not simply "one per option". */
    const sku = buildSku({
      skuID: PERSISTED_SKU_ID,
      product,
      options: [newRedOption(nonImageGroup), newLargeOption(imageGroup)],
    });

    expect(nonImageGroup.imageGroupFlag).toBe(false);
    expect(imageGroup.imageGroupFlag).toBe(true);
    expect(sku.generateImageFileName(settingDouble.resolver)).toBe('CatalogProduct-1-Lg.png');

    /* Two image groups: both contribute, each prefixed by the delimiter, in options-array order. */
    const secondImageGroup = buildOptionGroup({
      optionGroupID: physicalID('og-material'),
      optionGroupCode: 'MATERIAL',
      optionGroupName: 'Material',
      imageGroupFlag: true,
    });
    const twoSegmentSku = buildSku({
      skuID: SIBLING_SKU_ID,
      product,
      options: [
        newLargeOption(imageGroup),
        newOption(secondImageGroup, 'o-cotton', 'Cotton', 'Ct'),
      ],
    });
    expect(twoSegmentSku.generateImageFileName(settingDouble.resolver)).toBe(
      'CatalogProduct-1-Lg-Ct.png',
    );

    /* No image groups at all: just the sanitised product code and the extension. */
    const plainSku = buildSku({
      skuID: SECOND_SIBLING_SKU_ID,
      product,
      options: [newRedOption(newColourGroup(false))],
    });
    expect(plainSku.generateImageFileName(settingDouble.resolver)).toBe('CatalogProduct-1.png');
  });

  it('NET-NEW — model/entity/Sku.cfc:L135 — a SKU with no product cannot generate a name, because the legacy dereferences getProduct() without a guard', () => {
    const settingDouble = createSettingResolverDouble({
      settings: [
        { settingName: 'productImageOptionCodeDelimiter', value: '_' },
        { settingName: 'productImageDefaultExtension', value: 'jpg' },
      ],
    });
    const unassociatedSku = buildSku({ skuID: PERSISTED_SKU_ID });

    /* `:L135` and `:L138` both read the delimiter and the extension through `getProduct().setting(...)`,
     * with no null check, so an unassociated SKU raises in CFML as well. The port raises rather than
     * inventing a global fallback, because a global read would resolve a DIFFERENT effective value than
     * the product-scoped one and would quietly change generated file names. */
    expect(() => unassociatedSku.generateImageFileName(settingDouble.resolver)).toThrow(
      DomainError,
    );
    expect(settingDouble.calls).toEqual([]);
  });

  it('NET-NEW — model/entity/Sku.cfc:L141-L143 — getImageExtension() reads the LAST dot-separated element of the stored file name and answers empty when there is none', () => {
    /* `listLast(getImageFile(), ".")`, so a name with several dots yields only the final element and the
     * stored case is preserved rather than normalised. */
    expect(buildSku({ imageFile: 'photo.name.PNG' }).getImageExtension()).toBe('PNG');
    expect(buildSku({ imageFile: 'CatalogProduct-1_Lg.jpg' }).getImageExtension()).toBe('jpg');

    /* CFML list semantics ignore empty elements, so a name with no dot at all is its own last element
     * and an absent file name yields the empty string. */
    expect(buildSku({ imageFile: 'noextension' }).getImageExtension()).toBe('noextension');
    expect(buildSku({}).getImageExtension()).toBe('');
  });
});

describe('Sku — image paths and existence, entirely through ImagePathPort', () => {
  it('NET-NEW — model/entity/Sku.cfc:L145-L147 — getImagePath() sends only the stored file name across the port, and the composed path carries the byte-exact /product/default/ segment', async () => {
    const imageFile = 'CatalogProduct-1_Lg.jpg';
    /* `:L146` composes `getBaseImageURL() & "/product/default/" & getImageFile()`. Composition is the
     * ADAPTER concern in the target — a Lambda has no `expandPath` — so the double is seeded with the
     * legacy composition and the assertion pins the segment BYTE FOR BYTE. Singular `product`, singular
     * `default`, a leading slash and a trailing slash: `/products/default/` or `/product/defaults/`
     * would break every image URL in the catalogue and would look almost identical in a diff. */
    const composedPath = `/custom/assets/images/product/default/${imageFile}`;
    const imageDouble = createImagePathDouble({
      imagePathsByImageFile: { [imageFile]: composedPath },
    });
    const sku = buildSku({ skuID: PERSISTED_SKU_ID, imageFile });

    await expect(sku.getImagePath(imageDouble.imagePaths)).resolves.toBe(composedPath);
    expect(composedPath).toContain('/product/default/');

    /* The entity contributes exactly one value: the stored file name. It does not compose, does not
     * prefix and does not know the base URL. */
    expect(imageDouble.calls).toEqual([{ member: 'getImagePath', imageFile }]);

    /* A SKU with no stored image sends the empty string rather than `undefined`, matching the legacy
     * concatenation of a null-safe ORM string column. */
    const imagelessDouble = createImagePathDouble();
    await expect(buildSku({}).getImagePath(imagelessDouble.imagePaths)).resolves.toBe('');
    expect(imagelessDouble.calls).toEqual([{ member: 'getImagePath', imageFile: '' }]);
  });

  it('NET-NEW — model/entity/Sku.cfc:L221-L227 — getImageExistsFlag() resolves the path and then asks the PORT, with no fileExists and no expandPath anywhere', async () => {
    const imageFile = 'CatalogProduct-1_Lg.jpg';
    const composedPath = `/custom/assets/images/product/default/${imageFile}`;
    const imageDouble = createImagePathDouble({
      imagePathsByImageFile: { [imageFile]: composedPath },
    });
    const sku = buildSku({ skuID: PERSISTED_SKU_ID, imageFile });

    /* Nothing is seeded as existing, so the answer is false — and it is false because the PORT said so,
     * not because a directory was inspected. */
    await expect(sku.getImageExistsFlag(imageDouble.imagePaths)).resolves.toBe(false);

    /* TWO CALLS, IN ORDER: resolve the path, then ask about that exact path. `:L226` passes the composed
     * path to `fileExists(expandPath(...))` in the legacy; here the same composed path is passed to the
     * port, which is the single place a real deployment would decide how to look. */
    expect(imageDouble.calls).toEqual([
      { member: 'getImagePath', imageFile },
      { member: 'getImageExistsFlag', imagePath: composedPath },
    ]);

    /* Seed the file as existing and the same call answers true, with no change to the SKU. */
    imageDouble.addExistingImageFile(composedPath);
    await expect(sku.getImageExistsFlag(imageDouble.imagePaths)).resolves.toBe(true);
  });

  it('NET-NEW — model/entity/Sku.cfc:L192-L219 — getResizedImagePath() maps the deprecated size alias, resolves width and height from settings, and forwards scaleBest', async () => {
    const imageFile = 'CatalogProduct-1_Lg.jpg';
    const composedPath = `/custom/assets/images/product/default/${imageFile}`;
    const resizedPath = '/custom/assets/images/cache/640w480h_scaleBest.jpg';
    const imageDouble = createImagePathDouble({
      imagePathsByImageFile: { [imageFile]: composedPath },
      resizedImagePath: resizedPath,
    });
    const settingDouble = createSettingResolverDouble({
      settings: [
        { settingName: 'imageMissingImagePath', value: '/custom/assets/images/missing.png' },
        { settingName: 'productImageLargeWidth', value: '640' },
        { settingName: 'productImageLargeHeight', value: '480' },
      ],
    });
    const sku = buildSku({
      skuID: PERSISTED_SKU_ID,
      imageFile,
      product: newMerchandiseProduct('CatalogProduct-1'),
    });

    await expect(
      sku.getResizedImagePath(imageDouble.imagePaths, settingDouble.resolver, { size: 'l' }),
    ).resolves.toBe(resizedPath);

    /* `:L196-L211` maps `l` to `Large`, then reads `productImageLargeWidth` and
     * `productImageLargeHeight` and forwards `resizeMethod="scaleBest"` from `:L216`. The mapped SIZE is
     * NOT forwarded — the legacy replaces it with the resolved dimensions — so the request carries
     * width, height and the resize method, and no `size`. */
    expect(imageDouble.calls).toEqual([
      { member: 'getImagePath', imageFile },
      {
        member: 'getResizedImagePath',
        request: {
          imagePath: composedPath,
          missingImagePath: '/custom/assets/images/missing.png',
          width: 640,
          height: 480,
          resizeMethod: SKU_RESIZE_METHOD_SCALE_BEST,
        },
      },
    ]);
    expect(SKU_RESIZE_METHOD_SCALE_BEST).toBe('scaleBest');

    /* The width and height really are numbers rather than the setting strings they came from, which is
     * what the resize contract needs. */
    expect(settingDouble.calls.map((call) => call.settingName)).toEqual([
      'imageMissingImagePath',
      'productImageLargeWidth',
      'productImageLargeHeight',
    ]);
  });

  it('NET-NEW — model/entity/Sku.cfc:L206-L211 — an ARBITRARY size value falls through to Small on the path member, because the legacy else arm has no unrecognised-size branch', async () => {
    const imageFile = 'CatalogProduct-1_Lg.jpg';
    const imageDouble = createImagePathDouble({
      imagePathsByImageFile: { [imageFile]: `/custom/assets/images/product/default/${imageFile}` },
    });
    const settingDouble = createSettingResolverDouble({
      settings: [
        { settingName: 'imageMissingImagePath', value: '/custom/assets/images/missing.png' },
        { settingName: 'productImageSmallWidth', value: '160' },
        { settingName: 'productImageSmallHeight', value: '120' },
      ],
    });
    const sku = buildSku({
      skuID: PERSISTED_SKU_ID,
      imageFile,
      product: newMerchandiseProduct('CatalogProduct-1'),
    });

    /* `:L198-L211` is a three-branch `if / else if / else` on `l`, `m` and EVERYTHING ELSE — so an
     * unrecognised size is not rejected, it is treated as Small. That is a genuine legacy behaviour and
     * not a defect, and it differs from the sibling member at `:L153-L190` which keeps an unrecognised
     * size as given. Both shapes are preserved rather than harmonised. */
    await sku.getResizedImagePath(imageDouble.imagePaths, settingDouble.resolver, {
      size: 'unrecognised-size',
    });

    expect(settingDouble.calls.map((call) => call.settingName)).toEqual([
      'imageMissingImagePath',
      'productImageSmallWidth',
      'productImageSmallHeight',
    ]);

    const explicitDouble = createSettingResolverDouble({
      settings: [
        { settingName: 'imageMissingImagePath', value: '/custom/assets/images/missing.png' },
      ],
    });
    await sku.getResizedImagePath(imageDouble.imagePaths, explicitDouble.resolver, {
      size: 'l',
      width: 1024,
      height: 768,
    });
    expect(explicitDouble.calls.map((call) => call.settingName)).toEqual(['imageMissingImagePath']);
    const lastCall = imageDouble.calls[imageDouble.calls.length - 1];
    expect(lastCall).toEqual({
      member: 'getResizedImagePath',
      request: {
        imagePath: `/custom/assets/images/product/default/${imageFile}`,
        missingImagePath: '/custom/assets/images/missing.png',
        size: 'l',
        width: 1024,
        height: 768,
      },
    });
  });

  it('NET-NEW — model/entity/Sku.cfc:L153-L190 — getResizedImage() forwards the same dimensions plus the resolved alt text, through a hand-written renderer double', async () => {
    const imageFile = 'CatalogProduct-1_Lg.jpg';
    const composedPath = `/custom/assets/images/product/default/${imageFile}`;
    const imageDouble = createImagePathDouble({
      imagePathsByImageFile: { [imageFile]: composedPath },
    });
    const settingDouble = createSettingResolverDouble({
      settings: [
        { settingName: 'imageAltString', value: '${productName} - ${skuDefinition}' },
        { settingName: 'imageMissingImagePath', value: '/custom/assets/images/missing.png' },
        { settingName: 'productImageMediumWidth', value: '320' },
        { settingName: 'productImageMediumHeight', value: '240' },
      ],
    });

    /* A hand-written renderer, not a mocking library and not a module replacement: an object literal
     * implementing the exported renderer interface, recording what it was asked to render. */
    const renderedRequests: SkuResizedImageRequest[] = [];
    const renderer: SkuResizedImageRenderer = {
      getResizedImage: (request: SkuResizedImageRequest): Promise<string> => {
        renderedRequests.push(request);
        return Promise.resolve(`<img src="${request.imagePath}" alt="${request.alt ?? ''}" />`);
      },
    };
    const expandedTemplates: string[] = [];
    const sku = buildSku({
      skuID: PERSISTED_SKU_ID,
      imageFile,
      product: newMerchandiseProduct('CatalogProduct-1'),
    });

    const rendered = await sku.getResizedImage(
      {
        renderer,
        imagePaths: imageDouble.imagePaths,
        settings: settingDouble.resolver,
        expandStringTemplate: (template: string): string => {
          expandedTemplates.push(template);
          return 'Catalog Product - Size: Large';
        },
      },
      { size: 'm' },
    );

    expect(expandedTemplates).toEqual(['${productName} - ${skuDefinition}']);
    expect(renderedRequests).toEqual([
      {
        imagePath: composedPath,
        missingImagePath: '/custom/assets/images/missing.png',
        width: 320,
        height: 240,
        resizeMethod: SKU_RESIZE_METHOD_SCALE_BEST,
        alt: 'Catalog Product - Size: Large',
      },
    ]);
    expect(rendered).toBe(
      '<img src="/custom/assets/images/product/default/CatalogProduct-1_Lg.jpg" alt="Catalog Product - Size: Large" />',
    );

    /* A caller-supplied alt wins outright, so the template is never read or expanded — the `:L165`
     * guard is on the ARGUMENT, not on the setting. */
    const secondSettingDouble = createSettingResolverDouble({
      settings: [
        { settingName: 'imageMissingImagePath', value: '/custom/assets/images/missing.png' },
        { settingName: 'productImageMediumWidth', value: '320' },
        { settingName: 'productImageMediumHeight', value: '240' },
      ],
    });
    const untouchedTemplates: string[] = [];
    await sku.getResizedImage(
      {
        renderer,
        imagePaths: imageDouble.imagePaths,
        settings: secondSettingDouble.resolver,
        expandStringTemplate: (template: string): string => {
          untouchedTemplates.push(template);
          return template;
        },
      },
      { size: 'm', alt: 'A supplied alternative text' },
    );
    expect(untouchedTemplates).toEqual([]);
    expect(secondSettingDouble.calls.map((call) => call.settingName)).not.toContain(
      'imageAltString',
    );
    expect(renderedRequests[1]?.alt).toBe('A supplied alternative text');
  });
});

/* =================================================================================================
 * VALIDATION INTEGRATION — THE REAL VALIDATOR, THE REAL RULE SET, THE REAL ERROR BAG
 * =================================================================================================
 * The cases above test each validator in isolation. These drive them the way the system does: through
 * `src/validation/Validator.ts`, against the rule set produced from `model/validation/Sku.json`, with
 * findings landing in a real `ValidationError`. That is where the properties the JSON document actually
 * guarantees become visible — the shared error key, the dispatch shapes, the zero-argument invocation,
 * and the fact that a price of zero is legal.
 * ============================================================================================== */

describe('Sku — validation integration through the real Validator', () => {
  it('NET-NEW — model/validation/Sku.json:L6 — both method failures accumulate under the single options key, in rule-declaration order', async () => {
    /* A SKU that fails BOTH method rules at once: two options from one group breaks
     * `hasOneOptionPerOptionGroup`, and a lookup answering with a foreign SKU breaks
     * `hasUniqueOptions`. */
    const sizeGroup = newSizeGroup();
    const product = newMerchandiseProduct();
    const sku = buildSku({
      skuID: PERSISTED_SKU_ID,
      skuCode: CATALOG_SKU_CODE,
      product,
      options: [newLargeOption(sizeGroup), newOption(sizeGroup, 'o-small', 'Small', 'Sm')],
    });
    const foreignMatch = buildSku({
      skuID: SIBLING_SKU_ID,
      product,
      options: [newLargeOption(newSizeGroup())],
    });
    const harness = createValidatorHarness();

    const errors = await harness.validateDryRun(
      sku,
      skuRulesFor<Sku>(createRecordingSelectedOptionsLookup([foreignMatch]).lookup),
      'save',
    );

    /* TWO MESSAGES, ONE KEY. `org/Hibachi/HibachiValidationService.cfc:L221-L224` registers a failure
     * against the PROPERTY IDENTIFIER, so neither message is filed under its method name and the two do
     * not overwrite one another. */
    expect(errors.getError('options')).toHaveLength(2);
    expect(errors.getError('hasUniqueOptions')).toEqual([]);
    expect(errors.getError('hasOneOptionPerOptionGroup')).toEqual([]);

    /* ORDER FOLLOWS THE RULE SET, WHICH FOLLOWS THE JSON DOCUMENT. `:L6` lists `hasUniqueOptions`
     * first, so its message is first — and the message itself is the legacy resource-bundle key shape,
     * `validate.<context>.<class>.<property>.<method>`, preserved so failures stay comparable to legacy
     * output. */
    expect(errors.getError('options')).toEqual([
      'validate.save.Sku.options.hasUniqueOptions',
      'validate.save.Sku.options.hasOneOptionPerOptionGroup',
    ]);

    /* The findings live in a real `ValidationError`, and an untouched property reads back as an empty
     * list rather than as `undefined` — which is what lets a caller loop without a guard. */
    expect(errors).toBeInstanceOf(ValidationError);
    expect(errors.hasError('options')).toBe(true);
    expect(errors.getError('missing')).toEqual([]);
    expect(errors.hasError('missing')).toBe(false);
  });

  it('NET-NEW — org/Hibachi/HibachiValidationService.cfc:L333-L335 — the rule boundary invokes the synchronous validator with ZERO arguments and the asynchronous one with only its injected lookup', async () => {
    /* The legacy engine body is `return arguments.object.invokeMethod(arguments.constraintValue);` and
     * nothing more — no argument is ever passed. Reproducing that is only checkable by observing the
     * call, so a real subclass records the arity and delegates through `super`. */
    const recordingSku = new DispatchRecordingSku();
    recordingSku.skuID = PERSISTED_SKU_ID;
    recordingSku.skuCode = CATALOG_SKU_CODE;
    recordingSku.setProduct(newMerchandiseProduct());
    recordingSku.addOption(newLargeOption(newSizeGroup()));
    recordingSku.addOption(newRedOption(newColourGroup()));

    const harness = createValidatorHarness();
    const errors = await harness.validateDryRun(
      recordingSku,
      skuRulesFor<DispatchRecordingSku>(noMatchingSkusLookup),
      'save',
    );

    /* SYNCHRONOUS RULE: zero arguments, exactly as the legacy engine passes. */
    expect(recordingSku.synchronousRuleArgumentCounts).toEqual([0]);

    /* ASYNCHRONOUS RULE: one argument, and it is NOT supplied by the engine. The lookup is closed over
     * by `createHasUniqueOptionsConstraint`, so the engine still calls the constraint with the subject
     * alone and the collaborator arrives out of band. That is how a database-reaching rule survives an
     * engine that knows nothing about collaborators. */
    expect(recordingSku.asynchronousRuleArgumentCounts).toEqual([1]);

    /* Both shapes are honoured: the promise is awaited and the boolean is read directly, so a valid SKU
     * reports no option findings at all. */
    expect(errors.getError('options')).toEqual([]);
    expect(errors.hasError('options')).toBe(false);
  });

  it('NET-NEW — model/validation/Sku.json:L9 — a price of ZERO satisfies required, numeric and minValue, while a negative price fails only minValue', async () => {
    const validProduct = newMerchandiseProduct();
    const zeroPricedSku = buildSku({
      skuID: PERSISTED_SKU_ID,
      skuCode: CATALOG_SKU_CODE,
      price: 0,
      product: validProduct,
      options: [newLargeOption(newSizeGroup())],
    });
    const harness = createValidatorHarness();

    /* ZERO IS A VALUE, NOT AN ABSENCE. `:L9` requires `price`, types it numeric and floors it at zero,
     * and `model/entity/Sku.cfc:L56` defaults it to zero — so the default must satisfy its own rules.
     * A JavaScript falsiness test would reject `0` and make every defaulted SKU unsavable, which is
     * exactly the mistake this case exists to catch. `org/Hibachi/HibachiValidationService.cfc:L240-L245`
     * measures a trimmed LENGTH rather than truthiness, and the port keeps that semantic. */
    expect(zeroPricedSku.price).toBe('0');
    const zeroErrors = await harness.validateDryRun(
      zeroPricedSku,
      skuRulesFor<Sku>(noMatchingSkusLookup),
      'save',
    );
    expect(zeroErrors.getError('price')).toEqual([]);
    expect(zeroErrors.getError('listPrice')).toEqual([]);
    expect(zeroErrors.getError('renewalPrice')).toEqual([]);
    expect(zeroErrors.hasErrors()).toBe(false);

    /* Below zero DOES fail, and it fails on `minValue` alone — required and numeric are both satisfied,
     * so exactly one finding is registered. */
    const negativelyPricedSku = buildSku({
      skuID: SIBLING_SKU_ID,
      skuCode: CATALOG_SKU_CODE,
      price: -5,
      product: validProduct,
      options: [newLargeOption(newSizeGroup())],
    });
    const negativeErrors = await harness.validateDryRun(
      negativelyPricedSku,
      skuRulesFor<Sku>(noMatchingSkusLookup),
      'save',
    );
    expect(negativeErrors.getError('price')).toEqual(['validate.save.Sku.price.minValue']);
  });

  it('NET-NEW — org/Hibachi/HibachiDAO.cfc:L130-L146 — the skuCode uniqueness rule consults the injected port and excludes the row being saved', async () => {
    const product = newMerchandiseProduct();
    const sku = buildSku({
      skuID: PERSISTED_SKU_ID,
      skuCode: CATALOG_SKU_CODE,
      product,
      options: [newLargeOption(newSizeGroup())],
    });

    /* THE REAL VALIDATOR, CONSTRUCTED DIRECTLY, so the collaborator wiring is visible rather than
     * assumed: one port in, one error bag out. */
    const collidingDouble = createUniquePropertyDouble([
      {
        entityName: 'SlatwallSku',
        propertyName: 'skuCode',
        value: CATALOG_SKU_CODE,
        entityID: SIBLING_SKU_ID,
      },
    ]);
    const validator = new Validator(collidingDouble.uniqueProperty);
    expect(validator).toBeInstanceOf(Validator);

    const collisionErrors = await validator.validate(
      sku,
      skuRulesFor<Sku>(noMatchingSkusLookup),
      'save',
    );

    /* `:L11` declares `skuCode` unique. Another row holds the value, so the save is rejected. */
    expect(collisionErrors.getError('skuCode')).toEqual(['validate.save.Sku.skuCode.unique']);

    /* The probe carries everything the legacy statement would have bound — the entity name, the
     * resolved property name, the value and the identifier of the row being excluded. */
    expect(collidingDouble.calls).toEqual([
      {
        propertyName: 'skuCode',
        resolvedPropertyName: 'skuCode',
        entityName: 'SlatwallSku',
        entityID: PERSISTED_SKU_ID,
        value: CATALOG_SKU_CODE,
      },
    ]);

    /* SELF-EXCLUSION: when the row holding the value IS this row, the save is allowed. That is the
     * `and #primaryIDPropertyName# != :primaryIDValue` clause of `:L138-L140`, and it is also why the
     * same check is a no-op on insert — an unsaved SKU has no identifier to exclude. */
    const selfHeldDouble = createUniquePropertyDouble([
      {
        entityName: 'SlatwallSku',
        propertyName: 'skuCode',
        value: CATALOG_SKU_CODE,
        entityID: PERSISTED_SKU_ID,
      },
    ]);
    const selfErrors = await new Validator(selfHeldDouble.uniqueProperty).validate(
      sku,
      skuRulesFor<Sku>(noMatchingSkusLookup),
      'save',
    );
    expect(selfErrors.getError('skuCode')).toEqual([]);
    expect(selfErrors.hasErrors()).toBe(false);
  });

  it('NET-NEW — model/validation/Sku.json:L3 and :L12-L13 — the delete context evaluates only its own guards, and the physicalCounts typo contributes no key at all', async () => {
    const { sku } = buildTwoOptionSku();
    const harness = createValidatorHarness();

    const errors = await harness.validateDryRun(
      sku,
      skuRulesFor<Sku>(noMatchingSkusLookup),
      'delete',
    );

    /* `:L3` and `:L12` guard deletion on `defaultFlag` and `transactionExistsFlag` both equalling
     * false. Neither is resolved on this instance — they are non-persistent members a service supplies
     * ahead of validation — so both guards fire, which is the legacy behaviour for an unresolved view. */
    expect(errors.getError('defaultFlag')).toEqual(['validate.delete.Sku.defaultFlag.eq']);
    expect(errors.getError('transactionExistsFlag')).toEqual([
      'validate.delete.Sku.transactionExistsFlag.eq',
    ]);

    /* THE SAVE RULES ARE NOT EVALUATED, because a rule whose contexts do not include the active context
     * is skipped — so the two method rules never run and `skuCode` is never checked for uniqueness. */
    expect(errors.getError('options')).toEqual([]);
    expect(errors.getError('skuCode')).toEqual([]);
    expect(errors.getError('price')).toEqual([]);

    /* AND THE TYPO CONTRIBUTES NOTHING. `:L13` constrains `physicalCounts`, which no entity property
     * declares, so the property is skipped outright and does not even appear among the reported keys. */
    expect(Object.keys(errors.getErrors()).sort()).toEqual([
      'defaultFlag',
      'transactionExistsFlag',
    ]);
  });
});
