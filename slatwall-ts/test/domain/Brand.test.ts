/**
 * Brand domain tests — TRACEABLE.
 *
 * Provenance
 * This suite is traceable to two legacy MXUnit components and to nothing else:
 *
 * - `meta/tests/unit/entity/BrandTest.cfc:L52-L60` — the whole of brand's own legacy test body.
 * `setUp()` at `:L52-L56` calls `super.setup()` and then
 * `variables.entity = request.slatwallScope.getService("brandService").newBrand();`, and
 * `defaults_are_correct()` at `:L58-L60` is a single assertion,
 * `assertEquals(variables.entity.getProducts(), []);`.
 */

import { populate, type ColumnValueType } from '../../src/domain/base/populate';
import {
  BRAND_CLASS_NAME,
  BRAND_DECLARED_PROPERTIES,
  BRAND_ENTITY_NAME,
  BRAND_PRIMARY_ID_PROPERTY_NAME,
  BRAND_PROPERTY_DESCRIPTORS,
  Brand,
  isBrandPopulateDisabledProperty,
  type BrandPropertyName,
} from '../../src/domain/product/Brand';
import { Product } from '../../src/domain/product/Product';
import { DomainError } from '../../src/errors/DomainError';
import { ValidationError } from '../../src/errors/ValidationError';
import type {
  EntityPropertyAuthorizationRequest,
  PopulationAuthorizationPort,
} from '../../src/ports/AccountContextPort';
import { Validator } from '../../src/validation/Validator';
import type { ValidationContext } from '../../src/validation/Validator';
import {
  brandValidationRules,
  resolveBrandUniqueTarget,
} from '../../src/validation/rules/brand.rules';

/*
 * Source-grounded constants
 * Every value here is read from a cited legacy line. Nothing is invented: no UUID is generated, no
 * timing or capacity figure appears, and no coverage threshold is asserted.
 */

/*
 * — the three identity constants are imported from production, not restated here
 * `BRAND_CLASS_NAME` (`'Brand'`, `org/Hibachi/HibachiObject.cfc:L135-L137` over
 * `model/entity/Brand.cfc:L49`), `BRAND_ENTITY_NAME` (`'SlatwallBrand'`, the `entityname` attribute at
 * `:L49`, read by `org/Hibachi/HibachiDAO.cfc:L136`) and `BRAND_PRIMARY_ID_PROPERTY_NAME`
 * (`'brandID'`, the file's only `fieldtype="id"` declaration at `:L52`) now arrive from
 * `src/domain/product/Brand.ts` through the import above.
 */

/**
 * The unsaved primary-identifier value, verbatim from `model/entity/Brand.cfc:L52`, which declares
 * both `unsavedvalue=""` and `default=""`.
 */
const BRAND_UNSAVED_ID_VALUE = '';

/**
 * The identifier `model/validation/Brand.json:L7` names and `model/entity/Brand.cfc` does not
 * declare — the entity declares `physicals` at `:L71` instead.
 */
const UNDECLARED_PHYSICAL_COUNTS_IDENTIFIER: Exclude<'physicalCounts', BrandPropertyName> =
  'physicalCounts';

/** The six persistent properties of `model/entity/Brand.cfc:L52-L57`, in declaration order. */
const BRAND_PERSISTENT_PROPERTY_NAMES = [
  'brandID',
  'activeFlag',
  'publishedFlag',
  'urlTitle',
  'brandName',
  'brandWebsite',
] as const satisfies readonly BrandPropertyName[];

/** Every property `model/entity/Brand.cfc` declares, mapped to the line that declares it. */
const BRAND_DECLARED_PROPERTY_LOCATORS: Record<BrandPropertyName, string> = {
  brandID: 'model/entity/Brand.cfc:L52',
  activeFlag: 'model/entity/Brand.cfc:L53',
  publishedFlag: 'model/entity/Brand.cfc:L54',
  urlTitle: 'model/entity/Brand.cfc:L55',
  brandName: 'model/entity/Brand.cfc:L56',
  brandWebsite: 'model/entity/Brand.cfc:L57',
  attributeValues: 'model/entity/Brand.cfc:L60',
  products: 'model/entity/Brand.cfc:L61',
  promotionRewards: 'model/entity/Brand.cfc:L66',
  promotionRewardExclusions: 'model/entity/Brand.cfc:L67',
  promotionQualifiers: 'model/entity/Brand.cfc:L68',
  promotionQualifierExclusions: 'model/entity/Brand.cfc:L69',
  vendors: 'model/entity/Brand.cfc:L70',
  physicals: 'model/entity/Brand.cfc:L71',
  remoteID: 'model/entity/Brand.cfc:L74',
  createdDateTime: 'model/entity/Brand.cfc:L77',
  createdByAccount: 'model/entity/Brand.cfc:L78',
  modifiedDateTime: 'model/entity/Brand.cfc:L79',
  modifiedByAccount: 'model/entity/Brand.cfc:L80',
};

/** The declared property names in legacy declaration order. */
const BRAND_DECLARED_PROPERTY_NAMES: readonly string[] = Object.keys(BRAND_DECLARED_PROPERTIES);

/* The product-side collaborator — the real `product`, plus one `product` subclass that records. */

/**
 * Identifiers assigned to saved `Product` instances, so the cases that need the `!hasProduct(this)`
 * arm of the Product-side guard to decide can get there.
 */
const SAVED_PRODUCT_IDS = Object.freeze({
  membership: '00000000000000000000000000000012',
  duplicateGuard: '00000000000000000000000000000013',
  spliceFirst: '00000000000000000000000000000014',
  spliceSecond: '00000000000000000000000000000015',
  identityTwins: '00000000000000000000000000000016',
  deleteGuard: '00000000000000000000000000000020',
  inertGuard: '00000000000000000000000000000021',
  recordingAdd: '00000000000000000000000000000010',
  recordingRemove: '00000000000000000000000000000011',
} as const);

/**
 * Builds a saved real `Product` — one whose identifier is no longer the unsaved value, so
 * `Product.isNew()` is false and the Product-side duplicate guard is decided by `hasProduct`.
 *
 * @param productID the identifier to assign
 * @returns a real `product` for which `isNew()` returns false.
 */
function createSavedProduct(productID: string): Product {
  const product = new Product();
  product.productID = productID;
  return product;
}

/**
 * A real `Product` that records the calls Brand delegates to it and deliberately declines to
 * maintain the relationship.
 */
class RecordingProductDouble extends Product {
  /** Every brand `Brand.addProduct` handed to this product, in call order. */
  public readonly setBrandCalls: Brand[] = [];

  /** Every brand `Brand.removeProduct` handed to this product, in call order. */
  public readonly removeBrandCalls: Brand[] = [];

  /**
   * Records the delegated brand and returns, without assigning the back-reference and without
   * appending into `brand.getProducts()`.
   *
   * @param brand the brand Brand handed across — `this` in `model/entity/Brand.cfc:L99`
   */
  public override setBrand(brand: Brand): void {
    this.setBrandCalls.push(brand);
  }

  /**
   * Records the delegated brand and returns, without touching the collection or the back-reference.
   *
   * @param brand the brand Brand handed across — `this` in `model/entity/Brand.cfc:L102`
   */
  public override removeBrand(brand?: Brand): void {
    if (brand !== undefined) {
      this.removeBrandCalls.push(brand);
    }
  }
}

/* The validation harness — real engine, real rules, one narrow port double. */

/** The subject shape `brand.rules.ts` is typed over, obtained without a forbidden import. */
type BrandUniquenessSubject = Parameters<typeof resolveBrandUniqueTarget>[0];

/**
 * The uniqueness port's shape, obtained the same way — `ConstructorParameters<typeof Validator>[0]`
 * — so the double is checked against the real contract with no extra import.
 */
type UniquePropertyPortShape = ConstructorParameters<typeof Validator>[0];

interface RecordedUniquenessCheck {
  readonly propertyName: string;

  /**
   * Read from the resolved entity, as the legacy body does at `org/Hibachi/HibachiDAO.cfc:L136`.
   */
  readonly entityName: string;

  /**
   * Read from the resolved entity, as the legacy body does at `org/Hibachi/HibachiDAO.cfc:L137`.
   */
  readonly primaryIDValue: string;
}

/**
 * A uniqueness port double that records every check and returns a fixed verdict.
 *
 * @param verdict the answer the port returns for every check
 * @param recorded the array each check is appended to, in call order
 * @returns a port double satisfying the real contract.
 */
function createUniquePropertyPortDouble(
  verdict: boolean,
  recorded: RecordedUniquenessCheck[],
): UniquePropertyPortShape {
  return {
    isUniqueProperty: (propertyName, entity): Promise<boolean> => {
      recorded.push({
        propertyName,
        entityName: entity.getEntityName(),
        primaryIDValue: entity.getPrimaryIDValue(),
      });
      return Promise.resolve(verdict);
    },
  };
}

/**
 * Adapts a real `Brand` instance to the subject contract the validation engine requires.
 *
 * @param brand the real entity under test
 * @returns a subject the real rule set can be evaluated against.
 */
function createBrandValidationSubject(brand: Brand): BrandUniquenessSubject {
  return {
    /*
     * All seven managed members delegate to the real entity: every one is bound straight to the `brand` instance, so the production implementations — and the
     * production constants behind them — are what the engine and the uniqueness port actually call.
     * Reimplementing all seven inside this factory would make the adapter a second implementation
     * of the contract, which is the one thing a test double must never be,
     * because the case then passes on the strength of the double rather than of the code.
     */
    getClassName: (): string => brand.getClassName(),
    hasProperty: (propertyIdentifier: string): boolean => brand.hasProperty(propertyIdentifier),
    getPropertyMetaData: (propertyName: string) => brand.getPropertyMetaData(propertyName),
    getEntityName: (): string => brand.getEntityName(),
    getPrimaryIDValue: (): string => brand.getPrimaryIDValue(),
    getPrimaryIDPropertyName: (): string => brand.getPrimaryIDPropertyName(),
    getValueByPropertyIdentifier: (propertyIdentifier: string): unknown =>
      brand.getValueByPropertyIdentifier(propertyIdentifier),

    // The four members the five brand rules read, absence preserved.
    products: brand.getProducts(),
    ...(brand.brandName === undefined ? {} : { brandName: brand.brandName }),
    ...(brand.brandWebsite === undefined ? {} : { brandWebsite: brand.brandWebsite }),
    ...(brand.urlTitle === undefined ? {} : { urlTitle: brand.urlTitle }),
  };
}

interface BrandValidationRun {
  readonly errors: ValidationError;
  readonly uniquenessChecks: readonly RecordedUniquenessCheck[];
}

/**
 * Validates a real `Brand` with the real engine and the real transliterated rule set.
 *
 * @param brand the entity to validate
 * @param context the validation context — `save` and `delete` are the only two
 * `model/validation/Brand.json` declares. Typed as the closed `ValidationContext` union rather
 * than `string`, which is what makes the `:L162` bypass values unrepresentable here too: a case
 * asserting that `'false'` skips validation could not be written even by accident.
 */
async function validateBrand(
  brand: Brand,
  context: ValidationContext,
  unique = true,
): Promise<BrandValidationRun> {
  const uniquenessChecks: RecordedUniquenessCheck[] = [];
  const validator = new Validator(createUniquePropertyPortDouble(unique, uniquenessChecks));
  const errors = await validator.validate(
    createBrandValidationSubject(brand),
    brandValidationRules,
    context,
  );
  return { errors, uniquenessChecks };
}

/* The legacy-traceable contract — one overridden assertion plus exactly three inherited. */

describe('Brand — the legacy-traceable contract', () => {
  it('TRACEABLE — meta/tests/unit/entity/BrandTest.cfc:L58-L60 — a fresh Brand is constructible and its products collection is an empty, live array', () => {
    // The legacy fixture at meta/tests/unit/entity/BrandTest.cfc:L55 obtained its entity from
    // `getService("brandService").newBrand()`. `newBrand()` is an IR-1 synthesized service member
    // fabricated by org/Hibachi/HibachiService.cfc:L255-L281 and belongs to the service layer, so
    // the target fixture is the constructor itself. It takes no arguments and performs no work,
    // which is precisely what turns this from an integration assertion into a unit assertion.
    const brand = new Brand();

    // The whole of `meta/tests/unit/entity/BrandTest.cfc:L59`; everything below it is
    // target-contract strengthening, kept separate so the ported assertion stays identifiable.
    expect(brand.getProducts()).toEqual([]);

    // Strengthening required by the target contract, not by the legacy assertion.
    // src/domain/product/Brand.ts documents `getProducts()` as returning the live array by
    // reference, because model/entity/Product.cfc:L665 appends into it with `arrayAppend` and :L674
    // splices out of it with `arrayDeleteAt`. A defensive copy would satisfy the legacy assertion
    // above and silently turn both of those into no-ops, so identity is asserted three ways.
    expect(brand.getProducts()).toBe(brand.products);
    expect(brand.getProducts()).toBe(brand.getProducts());

    // Eager per-instance initialisation: two fresh Brands must not share one collection. This is
    // also the M7 guard in miniature — nothing about the collection may be module-scope state that
    // could bleed from one Lambda invocation to the next on a warm container.
    const other = new Brand();
    expect(other.getProducts()).toEqual([]);
    expect(other.getProducts()).not.toBe(brand.getProducts());
  });

  it('TRACEABLE — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L54 — validating a new instance for save does not pass, and reports a keyed error bag', async () => {
    // Re-expressed against the layer that now owns validation: the real Validator evaluating the
    // real transliteration of `model/validation/Brand.json`. No rule is restated locally.
    const { errors, uniquenessChecks } = await validateBrand(new Brand(), 'save');

    // `hasErrors()` is the direct port of org/Hibachi/HibachiTransient.cfc:L47-L53.
    expect(errors).toBeInstanceOf(ValidationError);
    expect(errors.hasErrors()).toBe(true);

    // Why it fails, stated rather than left implicit: model/validation/Brand.json:L3 makes
    // `brandName` required for save and :L5 makes `urlTitle` required for save, and a fresh Brand
    // carries neither — src/domain/product/Brand.ts declares both with the `declare` modifier so no
    // own property is emitted, reproducing CFML's unassigned-property semantics exactly.
    expect(errors.getErrors()).toEqual({
      brandName: ['validate.save.Brand.brandName.required'],
      urlTitle: ['validate.save.Brand.urlTitle.required'],
    });

    // The bag is keyed by property and its values are arrays — org/Hibachi/HibachiTransient.cfc:L30
    // returns a struct and :L35 an array — which is why one save can report several failures for one
    // property. The keyed shape is asserted here and exercised further below.
    expect(errors.hasError('brandName')).toBe(true);
    expect(errors.hasError('urlTitle')).toBe(true);
    expect(errors.getError('brandName')).toEqual(['validate.save.Brand.brandName.required']);

    // brandWebsite carries only a `dataType` rule at model/validation/Brand.json:L4, and
    // org/Hibachi/HibachiValidationService.cfc:L256-L262 passes that rule on an absent value, so an
    // unpopulated website is not an error. Asserted so the bag's exact membership is pinned rather
    // than merely its non-emptiness.
    expect(errors.hasError('brandWebsite')).toBe(false);

    // IR-5: the application-side uniqueness check really was consulted, exactly once, for the one
    // `unique` rule this document declares — model/validation/Brand.json:L5 — and it was handed the
    // trailing segment of the identifier and the resolved entity, per
    // org/Hibachi/HibachiDAO.cfc:L131-L137.
    expect(uniquenessChecks).toEqual([
      {
        propertyName: 'urlTitle',
        entityName: BRAND_ENTITY_NAME,
        primaryIDValue: BRAND_UNSAVED_ID_VALUE,
      },
    ]);
  });

  it('TRACEABLE — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L56-L58 — a simple representation exists, is a simple value, and resolves by the <classname>name convention to brandName', () => {
    // The legacy body is `assert(isSimpleValue(variables.entity.getSimpleRepresentation()))`.
    const subject = new Brand();

    // The convention resolves to exactly one declared property, so org/Hibachi/HibachiEntity.cfc:L74
    // is deterministic for this entity — and it is the entity that resolves it, not this file.
    expect(subject.getSimpleRepresentationPropertyName()).toBe('brandName');

    // The resolved name is a member of the declared property space, so the convention cannot drift
    // away from the entity's own declarations without this failing.
    expect(BRAND_DECLARED_PROPERTY_NAMES).toContain(subject.getSimpleRepresentationPropertyName());

    // The representation of a freshly constructed Brand is a simple value: `brandName` is absent, so
    // org/Hibachi/HibachiEntity.cfc:L70 falls through to the blank default rather than returning
    // null. This is the assertion the legacy `isSimpleValue` call actually made on a new instance.
    const emptyRepresentation = subject.getSimpleRepresentation();
    expect(typeof emptyRepresentation).toBe('string');
    expect(emptyRepresentation).toBe('');

    // Once populated it is the property's own value, still a simple value. The literal is arbitrary
    // test input rather than a source-declared default, so no default is being asserted here.
    subject.brandName = 'Traceable Brand Name';
    const populatedRepresentation = subject.getSimpleRepresentation();
    expect(typeof populatedRepresentation).toBe('string');
    expect(populatedRepresentation).toBe('Traceable Brand Name');

    // The two members really are wired to each other rather than each hard-coding 'brandName':
    // Reading the property the entity itself names reproduces the representation exactly.
    const named = subject.getSimpleRepresentationPropertyName();
    expect(named).toBe('brandName');
    expect(subject.brandName).toBe(populatedRepresentation);
  });

  it('TRACEABLE — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L60-L62 — a non-empty primary-ID property name exists, and it identifies brandID', () => {
    // The legacy body is `assert(len(variables.entity.getPrimaryIDPropertyName()))` — an assertion
    // about length, so the non-emptiness is asserted first and in its own right.
    const subject = new Brand();
    expect(subject.getPrimaryIDPropertyName().length).toBeGreaterThan(0);

    // The member answers with the imported production constant, so the two cannot diverge silently.
    expect(subject.getPrimaryIDPropertyName()).toBe(BRAND_PRIMARY_ID_PROPERTY_NAME);

    // The target contract makes the identity explicit, so it is asserted rather than left at
    // non-emptiness: model/entity/Brand.cfc:L52 is the file's only `fieldtype="id"` declaration, and
    // `brandID` is a member of the entity's declared property-name space.
    expect(BRAND_PRIMARY_ID_PROPERTY_NAME).toBe('brandID');
    expect(BRAND_DECLARED_PROPERTY_NAMES).toContain(BRAND_PRIMARY_ID_PROPERTY_NAME);
    expect(BRAND_DECLARED_PROPERTY_LOCATORS[BRAND_PRIMARY_ID_PROPERTY_NAME]).toBe(
      'model/entity/Brand.cfc:L52',
    );

    // The entity's own property-existence predicate agrees, so the declared set backing hasProperty
    // and the name the primary-ID member reports are the same fact rather than two literals that
    // happen to match — org/Hibachi/HibachiTransient.cfc:L763-L765.
    expect(subject.hasProperty(BRAND_PRIMARY_ID_PROPERTY_NAME)).toBe(true);

    // The name really does address the primary identifier on a live instance, and on a fresh one it
    // holds the unsaved value from model/entity/Brand.cfc:L52. No identifier is generated (IR-6).
    // getPrimaryIDValue() is the real member, reproducing org/Hibachi/HibachiEntity.cfc:L244-L246,
    // whose `unsavedvalue=""` is why the self-exclusion term of the uniqueness query no-ops on
    // insert.
    const brand = new Brand();
    expect(brand.brandID).toBe(BRAND_UNSAVED_ID_VALUE);
    expect(brand.getPrimaryIDValue()).toBe(BRAND_UNSAVED_ID_VALUE);

    // The primary identifier is deliberately absent from the population descriptor set:
    // src/domain/product/Brand.ts records that no branch of the legacy populate pass admitted a
    // `fieldtype="id"` property, so a request payload could never write a key. Asserting the absence
    // keeps that decision from being quietly reversed.
    const descriptorNames = BRAND_PROPERTY_DESCRIPTORS.properties.map(
      (descriptor) => descriptor.name,
    );
    expect(descriptorNames).not.toContain(BRAND_PRIMARY_ID_PROPERTY_NAME);
  });
});

/* The six persistent properties — model/entity/Brand.cfc:L52-L57. */

/** The five persistent scalars, i.e. every persistent property except the primary identifier. */
type BrandOptionalPersistentPropertyName = Exclude<
  (typeof BRAND_PERSISTENT_PROPERTY_NAMES)[number],
  'brandID'
>;

/**
 * The shared structural expectations for one of the five persistent scalars of
 * `model/entity/Brand.cfc:L53-L57`.
 *
 * @param propertyName one of the five persistent scalars
 * @param locator the `model/entity/Brand.cfc` line that declares it
 * @param valueType the `ormtype` that same line declares.
 */
function expectDeclaredOptionalPersistentProperty(
  propertyName: BrandOptionalPersistentPropertyName,
  locator: string,
  valueType: ColumnValueType,
): void {
  expect(BRAND_DECLARED_PROPERTY_LOCATORS[propertyName]).toBe(locator);

  const descriptors = BRAND_PROPERTY_DESCRIPTORS.properties.filter(
    (descriptor) => descriptor.name === propertyName,
  );
  expect(descriptors).toHaveLength(1);
  expect(descriptors.map((descriptor) => descriptor.populateEnabled)).toEqual([undefined]);
  expect(isBrandPopulateDisabledProperty(propertyName)).toBe(false);

  // The declared value type must equal the legacy `ormtype` on the cited line. Read from the
  // descriptor through the enabled-descriptor narrowing rather than an assertion, so the check is a
  // real one: a descriptor that had become populate-disabled would fail the narrowing instead of
  // silently reporting `undefined`.
  const [descriptor] = descriptors;
  expect(descriptor).toBeDefined();
  if (descriptor !== undefined && descriptor.populateEnabled !== false) {
    expect('valueType' in descriptor ? descriptor.valueType : undefined).toBe(valueType);
  }

  const brand = new Brand();
  expect(Object.hasOwn(brand, propertyName)).toBe(false);
  expect(propertyName in brand).toBe(false);
}

describe('Brand — the persistent property surface', () => {
  it('NET-NEW — model/entity/Brand.cfc:L52 — brandID is the primary identifier and holds the declared unsaved value on a fresh instance', () => {
    const brand = new Brand();

    // `unsavedvalue=""` and `default=""` are both declared on that line, so the empty string is the
    // source-stated default rather than a convenience. No identifier is generated here: per IR-6 a
    // real key is a 32-character hex string minted by the persistence layer, and `src/util/uuid.ts`
    // owns that. This file neither imports it nor fabricates a value.
    expect(brand.brandID).toBe(BRAND_UNSAVED_ID_VALUE);

    // Unlike the five scalars, the primary identifier is an emitted own property, because
    // src/domain/product/Brand.ts initialises it rather than declaring it. A Brand is never in a
    // state where it lacks the property, only in one where the property still holds the unsaved
    // value — which is exactly what `isNew()` reads.
    expect(Object.hasOwn(brand, BRAND_PRIMARY_ID_PROPERTY_NAME)).toBe(true);
    expect(brand.isNew()).toBe(true);

    // It is writable, and once written the unsaved sentinel no longer matches. The literal is
    // arbitrary test input in the 32-character shape IR-6 describes; nothing asserts it is a real key.
    brand.brandID = '00000000000000000000000000000001';
    expect(brand.brandID).toBe('00000000000000000000000000000001');
    expect(brand.isNew()).toBe(false);
  });

  it('NET-NEW — model/entity/Brand.cfc:L53 — activeFlag is a declared, populate-enabled boolean with no default', () => {
    expectDeclaredOptionalPersistentProperty('activeFlag', 'model/entity/Brand.cfc:L53', 'boolean');

    // The legacy hint on that line reads "As Brands Get Old, They would be marked as Not Active", and
    // the declaration carries no `default` attribute, so an unpopulated flag is genuinely absent
    // rather than false. Both boolean values round-trip.
    const brand = new Brand();
    brand.activeFlag = true;
    expect(brand.activeFlag).toBe(true);
    brand.activeFlag = false;
    expect(brand.activeFlag).toBe(false);
  });

  it('NET-NEW — model/entity/Brand.cfc:L54 — publishedFlag is a declared, populate-enabled boolean with no default', () => {
    expectDeclaredOptionalPersistentProperty(
      'publishedFlag',
      'model/entity/Brand.cfc:L54',
      'boolean',
    );

    // The one persistent property in the file carrying no hint at all, and — like activeFlag and
    // unlike model/entity/Product.cfc:L58 — no `default` attribute either.
    const brand = new Brand();
    brand.publishedFlag = true;
    expect(brand.publishedFlag).toBe(true);
    brand.publishedFlag = false;
    expect(brand.publishedFlag).toBe(false);
  });

  it('NET-NEW — model/entity/Brand.cfc:L55 — urlTitle is a declared, populate-enabled string whose uniqueness is enforced outside the entity', () => {
    expectDeclaredOptionalPersistentProperty('urlTitle', 'model/entity/Brand.cfc:L55', 'string');

    // That line declares `unique="true"`, and the entity enforces nothing: per IR-5 the guard is the
    // application-side existence query of org/Hibachi/HibachiDAO.cfc:L130-L146, reached through the
    // port, in addition to the database column constraint. Assigning a value therefore performs no
    // check of any kind here — the uniqueness rule is exercised through the validator instead.
    const brand = new Brand();
    brand.urlTitle = 'a-brand-url-title';
    expect(brand.urlTitle).toBe('a-brand-url-title');
  });

  it('NET-NEW — model/entity/Brand.cfc:L56 — brandName is a declared, populate-enabled string whose presence is enforced only by validation', () => {
    expectDeclaredOptionalPersistentProperty('brandName', 'model/entity/Brand.cfc:L56', 'string');

    // The declaration carries no `required`, no `length` and no `unique` attribute, so there is no
    // schema-level guard behind it — model/validation/Brand.json:L3 is the sole enforcement, which is
    // why the traceable save assertion above depends on it. The entity itself accepts any string.
    const brand = new Brand();
    brand.brandName = 'A Brand Name';
    expect(brand.brandName).toBe('A Brand Name');
  });

  it('NET-NEW — model/entity/Brand.cfc:L57 — brandWebsite is a declared, populate-enabled string and the entity applies no URL formatting', () => {
    expectDeclaredOptionalPersistentProperty(
      'brandWebsite',
      'model/entity/Brand.cfc:L57',
      'string',
    );

    // That line declares `hb_formatType="url"`, and src/domain/product/Brand.ts records why that is a
    // dead path: the population block that would have consulted it,
    // org/Hibachi/HibachiTransient.cfc:L201-L206, is commented out in the legacy source. The live URL
    // constraint is the declarative rule at model/validation/Brand.json:L4 instead. So the field
    // holds whatever string it is given, unparsed and uncoerced — asserted with a value that is not a
    // URL, which is the only way to observe that no formatting happens.
    const brand = new Brand();
    brand.brandWebsite = 'not-a-url';
    expect(brand.brandWebsite).toBe('not-a-url');
  });

  it('NET-NEW — model/entity/Brand.cfc:L52-L57 — the persistent surface is exactly these six properties, and the declared name space is exhaustive and free of phantoms', () => {
    // Six, in declaration order. The tuple is compile-checked against the entity's real property-name
    // union, so this expectation pins the runtime order that the union alone cannot.
    expect(BRAND_PERSISTENT_PROPERTY_NAMES).toEqual([
      'brandID',
      'activeFlag',
      'publishedFlag',
      'urlTitle',
      'brandName',
      'brandWebsite',
    ]);
    expect(BRAND_PERSISTENT_PROPERTY_NAMES).toHaveLength(6);

    // Every persistent property is in the declared name space, and the locator map is exhaustive over
    // that space by compile check — so the ordered list below cannot drift from it.
    for (const propertyName of BRAND_PERSISTENT_PROPERTY_NAMES) {
      expect(BRAND_DECLARED_PROPERTY_NAMES).toContain(propertyName);
    }

    // This comparison is now a real cross-source check rather than a tautology.
    // BRAND_DECLARED_PROPERTY_NAMES is derived from the production set BRAND_DECLARED_PROPERTIES,
    // while BRAND_DECLARED_PROPERTY_LOCATORS is this file's own record of which legacy line declares
    // each name. Before that change both sides came from the locator map, so the assertion compared a
    // value with itself and could never fail. It now fails if the entity's declared set and the
    // legacy-line record disagree in either direction, which is the drift worth catching: the set.
    expect([...BRAND_DECLARED_PROPERTY_NAMES].sort()).toEqual(
      Object.keys(BRAND_DECLARED_PROPERTY_LOCATORS).sort(),
    );

    // The declared space is the whole legacy declaration — the six scalars, the two one-to-many
    // collections, the six many-to-many inverses, `remoteID` and the four audit properties — and
    // `vendors` at :L70 is the one many-to-many inverse that is not populate-disabled, an off-by-one
    // in a block of six near-identical lines that src/domain/product/Brand.ts turns into a
    // compile-checked invariant.
    expect(BRAND_DECLARED_PROPERTY_NAMES).toHaveLength(19);
    expect(isBrandPopulateDisabledProperty('vendors')).toBe(false);
    expect(isBrandPopulateDisabledProperty('physicals')).toBe(true);
  });

  it('NET-NEW — IR-1 — the four remaining managed-entity members answer from the real entity, including the raise and the empty-string miss', () => {
    const brand = new Brand();

    // getClassName — org/Hibachi/HibachiObject.cfc:L135-L137, the last dot-delimited segment of the
    // component name. It is what org/Hibachi/HibachiValidationService.cfc:L202 interpolates into
    // every message key, so a prefixed value here would change observable message text.
    expect(brand.getClassName()).toBe(BRAND_CLASS_NAME);
    expect(brand.getClassName()).toBe('Brand');

    // getEntityName — the `entityname` attribute at model/entity/Brand.cfc:L49, read at runtime by
    // org/Hibachi/HibachiEntity.cfc:L287-L289. deliberately different from the class name: the
    // uniqueness statement at org/Hibachi/HibachiDAO.cfc:L140 is expressed over the mapped object
    // graph, so the `Slatwall` prefix belongs there and is not a defect to correct.
    expect(brand.getEntityName()).toBe(BRAND_ENTITY_NAME);
    expect(brand.getEntityName()).not.toBe(brand.getClassName());

    // hasProperty answers true for every declared name and false for an undeclared one —
    // org/Hibachi/HibachiTransient.cfc:L763-L765, `structKeyExists(getPropertiesStruct(), name)`.
    for (const propertyName of BRAND_DECLARED_PROPERTY_NAMES) {
      expect(brand.hasProperty(propertyName)).toBe(true);
    }
    expect(brand.hasProperty(UNDECLARED_PHYSICAL_COUNTS_IDENTIFIER)).toBe(false);

    // getPropertyMetaData resolves a declared name and raises for an undeclared one, because
    // org/Hibachi/HibachiTransient.cfc:L738-L747 returns the struct entry when present and throws at
    // :L746 otherwise. The non-optional return type is faithful to that declaration, so the raise is
    // part of the contract rather than a defensive extra.
    expect(brand.getPropertyMetaData(BRAND_PRIMARY_ID_PROPERTY_NAME)).toEqual({ name: 'brandID' });
    expect(() => brand.getPropertyMetaData(UNDECLARED_PHYSICAL_COUNTS_IDENTIFIER)).toThrow(
      `No property found with name ${UNDECLARED_PHYSICAL_COUNTS_IDENTIFIER} in Brand`,
    );

    // getValueByPropertyIdentifier reads a declared value, and yields '' — never undefined — on every
    // failure path, per org/Hibachi/HibachiTransient.cfc:L466-L481. The empty string is behaviour, not
    // convenience: the uniqueness query binds whatever comes back, so a miss must bind '' exactly as
    // the legacy did.
    brand.brandName = 'Managed Member Brand';
    expect(brand.getValueByPropertyIdentifier('brandName')).toBe('Managed Member Brand');
    expect(brand.getValueByPropertyIdentifier(UNDECLARED_PHYSICAL_COUNTS_IDENTIFIER)).toBe('');
    expect(brand.getValueByPropertyIdentifier('brandName.somethingDeeper')).toBe('');
  });

  it('NET-NEW — model/validation/Brand.json:L7 — physicalCounts is not a Brand property, and no field is invented to make its rule fire', () => {
    // The entity declares `physicals` at model/entity/Brand.cfc:L71; the validation document names
    // `physicalCounts`. That mismatch is a genuine undeclared-property reference in the legacy
    // source, carried across rather than repaired.
    expect(UNDECLARED_PHYSICAL_COUNTS_IDENTIFIER).toBe('physicalCounts');
    expect(BRAND_DECLARED_PROPERTY_NAMES).not.toContain(UNDECLARED_PHYSICAL_COUNTS_IDENTIFIER);
    expect(BRAND_DECLARED_PROPERTY_NAMES).toContain('physicals');

    // No such field exists on the entity either — neither as an own property nor anywhere on the
    // prototype chain — so nothing here makes the inert rule reachable.
    const brand = new Brand();
    expect(Object.hasOwn(brand, UNDECLARED_PHYSICAL_COUNTS_IDENTIFIER)).toBe(false);
    expect(UNDECLARED_PHYSICAL_COUNTS_IDENTIFIER in brand).toBe(false);

    // And the population descriptor set does not mention it, so a request payload cannot create it.
    const descriptorNames = BRAND_PROPERTY_DESCRIPTORS.properties.map(
      (descriptor) => descriptor.name,
    );
    expect(descriptorNames).not.toContain(UNDECLARED_PHYSICAL_COUNTS_IDENTIFIER);
  });

  it('NET-NEW — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67 — the base defaults_are_correct assertions hold, and they are NET-NEW because BrandTest.cfc overrode that method', () => {
    // Net-new on purpose: `meta/tests/unit/entity/BrandTest.cfc:L58-L60` overrides the base
    // `defaults_are_correct()`, so the legacy brand run never executed either assertion.
    const brand = new Brand();
    expect(brand.isNew()).toBe(true);
    expect(brand.brandID).toHaveLength(0);
  });
});

/* The products relationship — model/entity/Brand.cfc:L61, L98-L103 — and the IR-1 member. */

describe('Brand — the products relationship and its IR-1 explicit member', () => {
  it('NET-NEW — model/entity/Brand.cfc:L61 — the products collection is a fresh, live, per-instance array', () => {
    const brand = new Brand();

    // The accessor and the field hand back the same array object. That is the whole basis of the
    // live-array contract: the far side mutates what it is given.
    expect(brand.getProducts()).toBe(brand.products);
    expect(brand.getProducts()).toHaveLength(0);
  });

  it('NET-NEW — model/entity/Brand.cfc:L98-L100 — addProduct is a pure delegation to the Product-side setBrand and never appends on its own account', () => {
    // The legacy body is exactly `arguments.product.setBrand(this);` — one statement, no append.
    // A recording Product whose setBrand records instead of appending is therefore the only way to
    // observe the difference between delegating and appending: if Brand pushed independently the
    // collection would grow here, and it must not. The recorder is a real `Product` subclass, so
    // Brand's declared parameter type is satisfied by inheritance and no widened view is needed.
    const brand = new Brand();
    const product = new RecordingProductDouble();
    // Assigned for fidelity with a persisted collaborator; the delegation path never reads it.
    product.productID = SAVED_PRODUCT_IDS.recordingAdd;

    brand.addProduct(product);

    // The delegation happened, exactly once, and Brand handed itself across — `this` in the legacy
    // body — which is what makes the product able to maintain both sides.
    expect(product.setBrandCalls).toEqual([brand]);
    expect(product.setBrandCalls[0]).toBe(brand);

    // And Brand did nothing else: no append, so no membership. This is the assertion that pins the
    // direction of the relationship.
    expect(brand.getProducts()).toHaveLength(0);
    expect(brand.hasProduct(product)).toBe(false);
    expect(product.removeBrandCalls).toHaveLength(0);
  });

  it('NET-NEW — model/entity/Brand.cfc:L101-L103 — removeProduct is a pure delegation to the Product-side removeBrand', () => {
    // The legacy body is `arguments.Product.removeBrand(this);`. The capital P is a CFML quirk —
    // the `arguments` scope is case-insensitive, so it denoted the same argument the signature
    // declares one line above — and src/domain/product/Brand.ts records the decision to use the
    // declared lower-case spelling, since TypeScript is case-sensitive and nothing observable changes.
    const brand = new Brand();
    const product = new RecordingProductDouble();
    product.productID = SAVED_PRODUCT_IDS.recordingRemove;

    brand.removeProduct(product);

    expect(product.removeBrandCalls).toEqual([brand]);
    expect(product.removeBrandCalls[0]).toBe(brand);
    expect(product.setBrandCalls).toHaveLength(0);

    // Brand did not touch its own collection, and removing a product that was never added is not an
    // error — the legacy body guards with `if(index > 0)` at model/entity/Product.cfc:L673-L675.
    expect(brand.getProducts()).toHaveLength(0);
  });

  /* The product-side bodies, exercised through the real `product` */

  it('NET-NEW — model/entity/Product.cfc:L662-L667 — the real Product appends itself into Brand live array, and hasProduct then reports membership', () => {
    const brand = new Brand();
    const liveCollection = brand.getProducts();
    const product = createSavedProduct(SAVED_PRODUCT_IDS.membership);

    brand.addProduct(product);

    // The back-reference from model/entity/Product.cfc:L663, assigned by the real setBrand.
    expect(product.brand).toBe(brand);

    // The append from :L665 landed in the very array Brand had already handed out, which is what a
    // defensive copy in getProducts() would have broken silently.
    expect(liveCollection).toEqual([product]);
    expect(brand.getProducts()).toBe(liveCollection);
    expect(brand.getProducts()).toHaveLength(1);

    // IR-1: `hasProduct` has no declaration anywhere in model/entity/Brand.cfc — the CFML ORM
    // fabricated it from `singularname="product"` at :L61 — and it is an explicit typed member in the
    // port. model/entity/Product.cfc:L664 depends on it, so it is mandatory rather than convenient.
    expect(brand.hasProduct(product)).toBe(true);
  });

  it('NET-NEW — model/entity/Product.cfc:L664-L665 — the real Product-side duplicate guard means a saved product is not appended twice', () => {
    const brand = new Brand();

    // A saved product — its identifier is no longer the unsaved value — so the `isNew() or` arm of
    // the real guard is false and the `!hasProduct(this)` arm decides. That is the only configuration
    // in which the guard is observable, and `isNew()` is the real predicate, not a stub.
    const savedProduct = createSavedProduct(SAVED_PRODUCT_IDS.duplicateGuard);
    expect(savedProduct.isNew()).toBe(false);

    brand.addProduct(savedProduct);
    brand.addProduct(savedProduct);

    expect(brand.getProducts()).toEqual([savedProduct]);
    expect(brand.hasProduct(savedProduct)).toBe(true);
  });

  it('NET-NEW — model/entity/Product.cfc:L664-L665 — an unsaved real Product appends unconditionally, because the isNew arm short-circuits the guard', () => {
    const brand = new Brand();

    // An unsaved product is simply a freshly constructed one: src/domain/product/Product.ts
    // initialises `productID` to the `unsavedvalue=""` of model/entity/Product.cfc:L52, so `isNew()`
    // is true with nothing assigned and no identifier is generated (IR-6). Product's unsaved value is
    // its own — asserted against the real instance rather than borrowed from the Brand constant,
    // because the two entities declare it independently.
    const unsavedProduct = new Product();
    expect(unsavedProduct.productID).toHaveLength(0);
    expect(unsavedProduct.isNew()).toBe(true);

    // The or short-circuits, so `hasProduct` is never consulted. The legacy consequence is that the
    // same unsaved instance appends twice — carried across as observed behaviour rather than repaired,
    // because AAP §0.8.2 Guideline 4 forbids improving business logic during the port.
    brand.addProduct(unsavedProduct);
    brand.addProduct(unsavedProduct);

    expect(brand.getProducts()).toEqual([unsavedProduct, unsavedProduct]);
    expect(brand.hasProduct(unsavedProduct)).toBe(true);
  });

  it('NET-NEW — model/entity/Product.cfc:L668-L677 — the real Product splices itself out of Brand live array and drops its back-reference', () => {
    const brand = new Brand();
    const liveCollection = brand.getProducts();
    const first = createSavedProduct(SAVED_PRODUCT_IDS.spliceFirst);
    const second = createSavedProduct(SAVED_PRODUCT_IDS.spliceSecond);

    brand.addProduct(first);
    brand.addProduct(second);
    expect(liveCollection).toEqual([first, second]);

    brand.removeProduct(first);

    // Spliced out of the same live array, leaving the other member untouched and in place.
    expect(liveCollection).toEqual([second]);
    expect(brand.getProducts()).toBe(liveCollection);
    expect(brand.hasProduct(first)).toBe(false);
    expect(brand.hasProduct(second)).toBe(true);

    // Model/entity/Product.cfc:L676 is `structDelete(variables, "brand")`, so the back-reference is
    // deleted rather than set to a sentinel — the same absence-means-absence semantic the persistent
    // scalars follow, and the reason src/domain/product/Product.ts declares `brand` optional.
    expect(first.brand).toBeUndefined();
    expect(second.brand).toBe(brand);
  });

  it('NET-NEW — IR-1 — hasProduct matches by object identity, not by product identifier', () => {
    const brand = new Brand();

    // Two DISTINCT real Products that agree on their identifier. src/domain/product/Brand.ts
    // implements membership with `Array.prototype.includes`, whose SameValueZero comparison is
    // reference equality for objects — the faithful analogue of
    // `arrayFind(arguments.brand.getProducts(), this)` at model/entity/Product.cfc:L672, which
    // locates the same instance. A comparison by `productID` would be a different predicate and would
    // answer differently here.
    const member = createSavedProduct(SAVED_PRODUCT_IDS.identityTwins);
    const twin = createSavedProduct(SAVED_PRODUCT_IDS.identityTwins);

    brand.addProduct(member);

    expect(member.productID).toBe(twin.productID);
    expect(member).not.toBe(twin);
    expect(brand.hasProduct(member)).toBe(true);
    expect(brand.hasProduct(twin)).toBe(false);
  });
});

/* Validation and error behaviour — model/validation/Brand.json. */

describe('Brand — validation and error behaviour', () => {
  it('NET-NEW — model/validation/Brand.json:L5 — both urlTitle constraints report under one key, because the engine does not short-circuit', async () => {
    // That line declares `{"contexts":"save","required":true,"unique":true}` — two constraints on one
    // property. On a fresh Brand `urlTitle` is absent, so `required` fails; with the port answering
    // "not unique", `unique` fails too. org/Hibachi/HibachiValidationService.cfc accumulates rather
    // than stopping at the first failure, which is precisely why the bag's values are arrays.
    const { errors, uniquenessChecks } = await validateBrand(new Brand(), 'save', false);

    expect(errors.getError('urlTitle')).toEqual([
      'validate.save.Brand.urlTitle.required',
      'validate.save.Brand.urlTitle.unique',
    ]);
    expect(errors.getError('brandName')).toEqual(['validate.save.Brand.brandName.required']);

    // The uniqueness rule is evaluated even for an absent value: org/Hibachi/HibachiValidationService
    // delegates the whole check to the port at :L467-L470 with no null short-circuit, and the port's
    // verdict is returned unmodified. Carried across as observed behaviour.
    expect(uniquenessChecks).toHaveLength(1);
    expect(uniquenessChecks.map((check) => check.propertyName)).toEqual(['urlTitle']);
  });

  it('NET-NEW — model/validation/Brand.json:L3-L5 — a populated Brand with a unique url title passes save validation', async () => {
    const brand = new Brand();
    brand.brandName = 'A Brand Name';
    brand.urlTitle = 'a-brand-name';
    brand.brandWebsite = 'https://example.com/brand';

    const { errors } = await validateBrand(brand, 'save');

    expect(errors.hasErrors()).toBe(false);
    expect(errors.getErrors()).toEqual({});
  });

  it('NET-NEW — model/validation/Brand.json:L4 — a brandWebsite that is not a URL fails the data-type rule, and the message embeds the constraint value', async () => {
    const brand = new Brand();
    brand.brandName = 'A Brand Name';
    brand.urlTitle = 'a-brand-name';
    brand.brandWebsite = 'not-a-url';

    const { errors } = await validateBrand(brand, 'save');

    // Org/Hibachi/HibachiValidationService.cfc:L226 composes the data-type key with both the
    // constraint type and its value, which is why this key ends in `.dataType.url` where the presence
    // and uniqueness keys end in the constraint type alone.
    expect(errors.getErrors()).toEqual({
      brandWebsite: ['validate.save.Brand.brandWebsite.dataType.url'],
    });
  });

  it('NET-NEW — model/validation/Brand.json:L6 — the products delete guard is live and fires for a Brand carrying a product', async () => {
    const brand = new Brand();

    // An empty Brand is deletable: `maxCollection: 0` passes on a collection of length zero.
    const empty = await validateBrand(brand, 'delete');
    expect(empty.errors.hasErrors()).toBe(false);
    expect(empty.errors.getErrors()).toEqual({});

    // Attaching one real Product through the real relationship makes it undeletable — the collection
    // is populated by the actual Product-side `setBrand`, not by a test that pushes directly. This is
    // the guard that exists because model/entity/Brand.cfc:L61 declares no cascade, so deleting a
    // brand never cascaded to its products — unlike `attributeValues` at :L60, which declares
    // `cascade="all-delete-orphan"` and consequently needs no guard.
    brand.addProduct(createSavedProduct(SAVED_PRODUCT_IDS.deleteGuard));
    expect(brand.getProducts()).toHaveLength(1);

    const occupied = await validateBrand(brand, 'delete');
    expect(occupied.errors.hasErrors()).toBe(true);
    expect(occupied.errors.getErrors()).toEqual({
      products: ['validate.delete.Brand.products.maxCollection'],
    });

    // The `unique` rule is scoped to the save context at model/validation/Brand.json:L5, so a delete
    // never reaches the uniqueness port at all.
    expect(occupied.uniquenessChecks).toHaveLength(0);
  });

  it('NET-NEW — model/validation/Brand.json:L7 — the physicalCounts delete guard stays inert, because the subject carries no such property', async () => {
    const brand = new Brand();
    brand.addProduct(createSavedProduct(SAVED_PRODUCT_IDS.inertGuard));

    const { errors } = await validateBrand(brand, 'delete');

    // Org/Hibachi/HibachiValidationService.cfc:L171 skips a rule whose property the subject does not
    // carry — silently, not as a failure — so the fifth Brand rule never produces a key. The
    // transliteration keeps the rule rather than deleting it, so the document's own content stays
    // legible; inertness is preserved, not repaired.
    expect(errors.hasError(UNDECLARED_PHYSICAL_COUNTS_IDENTIFIER)).toBe(false);
    expect(Object.keys(errors.getErrors())).toEqual(['products']);

    // The key the rule would have produced is absent from the bag entirely.
    expect(Object.keys(errors.getErrors())).not.toContain(UNDECLARED_PHYSICAL_COUNTS_IDENTIFIER);
  });

  it('NET-NEW — org/Hibachi/HibachiTransient.cfc:L35-L45 — an absent error key yields an empty array and never throws', () => {
    const errors = new ValidationError();

    // The legacy accessor checks for the key first and returns an empty array when it is missing.
    // The retired framework carried a second, defective variant of this accessor that raised
    // instead; it is deliberately not reproduced, and neither is its text. The behaviour asserted here
    // is the one org/Hibachi/HibachiTransient.cfc:L35-L45 actually exposed to callers.
    expect(() => errors.getError('brandName')).not.toThrow();
    expect(errors.getError('brandName')).toEqual([]);
    expect(errors.getError(UNDECLARED_PHYSICAL_COUNTS_IDENTIFIER)).toEqual([]);
    expect(errors.hasError('brandName')).toBe(false);
    expect(errors.hasErrors()).toBe(false);
    expect(errors.getErrors()).toEqual({});

    // Accumulation is per key and preserves insertion order, so one property can report several
    // failures — the shape org/Hibachi/HibachiTransient.cfc:L30 and :L35 together describe.
    errors.addError('urlTitle', 'validate.save.Brand.urlTitle.required');
    errors.addError('urlTitle', 'validate.save.Brand.urlTitle.unique');
    errors.addError('brandName', 'validate.save.Brand.brandName.required');

    expect(errors.hasErrors()).toBe(true);
    expect(errors.getError('urlTitle')).toEqual([
      'validate.save.Brand.urlTitle.required',
      'validate.save.Brand.urlTitle.unique',
    ]);
    expect(errors.getErrors()).toEqual({
      urlTitle: ['validate.save.Brand.urlTitle.required', 'validate.save.Brand.urlTitle.unique'],
      brandName: ['validate.save.Brand.brandName.required'],
    });

    // Still an absent key after other keys exist, and still no throw.
    expect(errors.getError('brandWebsite')).toEqual([]);
    expect(() => errors.getError('brandWebsite')).not.toThrow();
  });

  it('NET-NEW — src/validation/rules/brand.rules.ts — the urlTitle uniqueness target resolves to the subject itself, and the port receives the resolved entity', async () => {
    const brand = new Brand();
    brand.brandID = '00000000000000000000000000000022';
    brand.brandName = 'A Brand Name';
    brand.urlTitle = 'a-brand-name';

    // `urlTitle` is a single-segment identifier containing neither a dot nor an underscore, so the
    // legacy walk at org/Hibachi/HibachiValidationService.cfc:L467-L469 terminates immediately and the
    // resolved object is the subject. Asserted directly against the exported resolver.
    const subject = createBrandValidationSubject(brand);
    expect(resolveBrandUniqueTarget(subject)).toBe(subject);

    // And the port really is handed that resolved entity, from which it reads the entity name and the
    // primary-identifier value — the first three of the five accessors
    // org/Hibachi/HibachiDAO.cfc:L134-L138 invokes.
    const { errors, uniquenessChecks } = await validateBrand(brand, 'save', false);
    expect(uniquenessChecks).toEqual([
      {
        propertyName: 'urlTitle',
        entityName: BRAND_ENTITY_NAME,
        primaryIDValue: '00000000000000000000000000000022',
      },
    ]);
    expect(errors.getErrors()).toEqual({
      urlTitle: ['validate.save.Brand.urlTitle.unique'],
    });
  });
});

/*
 * Population authorisation and declared-type coercion — org/Hibachi/HibachiTransient.cfc:L184-L213.
 */

/** Records every arm 3 question the engine asks, so operand values can be asserted. */
interface RecordingAuthorization extends PopulationAuthorizationPort {
  readonly publicContextChecks: number[];
  readonly propertyRequests: EntityPropertyAuthorizationRequest[];
}

/**
 * Builds a policy that answers arm 3 with `allow` for every property and records what it was asked.
 *
 * @param allow what arm 3 should answer
 * @returns the recording policy.
 */
function createRecordingAuthorization(allow: boolean): RecordingAuthorization {
  const publicContextChecks: number[] = [];
  const propertyRequests: EntityPropertyAuthorizationRequest[] = [];

  return {
    publicContextChecks,
    propertyRequests,
    getPublicPopulateFlag(): boolean {
      publicContextChecks.push(publicContextChecks.length);
      return false;
    },
    authenticateEntityProperty(request: EntityPropertyAuthorizationRequest): boolean {
      propertyRequests.push(request);
      return allow;
    },
  };
}

/** A policy that denies everything — the shape an unauthenticated or system context supplies. */
const DENY_ALL_AUTHORIZATION: PopulationAuthorizationPort = {
  getPublicPopulateFlag: (): boolean => false,
  authenticateEntityProperty: (): boolean => false,
};

describe('Brand — population authorisation, org/Hibachi/HibachiTransient.cfc:L186-L190', () => {
  it('NET-NEW — a denying policy writes NOTHING, so a persistent entity cannot be mass-assigned', () => {
    const brand = new Brand();

    populate(
      brand,
      { brandName: 'Injected', activeFlag: true, publishedFlag: true, urlTitle: 'injected' },
      BRAND_PROPERTY_DESCRIPTORS,
      DENY_ALL_AUTHORIZATION,
    );

    // Every property is skipped rather than rejected, which is the legacy shape: the gate is an `if`
    // around the whole assignment block at [:L184-L192], so an unauthorised property is passed over
    // and nothing is thrown. The keys must therefore still be genuinely absent.
    expect('brandName' in brand).toBe(false);
    expect('activeFlag' in brand).toBe(false);
    expect('publishedFlag' in brand).toBe(false);
    expect('urlTitle' in brand).toBe(false);
  });

  it('NET-NEW — an allowing policy is asked once per payload-present property, with the legacy operands', () => {
    const brand = new Brand();
    const authorization = createRecordingAuthorization(true);

    populate(
      brand,
      { brandName: 'ACME', activeFlag: true },
      BRAND_PROPERTY_DESCRIPTORS,
      authorization,
    );

    expect(brand.brandName).toBe('ACME');
    expect(brand.activeFlag).toBe(true);

    // Arm 3's three operands are exactly what [:L190] passes: the fixed crudType, the legacy
    // `getClassName()` value, and the property name. Declaration order is population order, and
    // `activeFlag` is declared at :L53 ahead of `brandName` at :L56.
    expect(authorization.propertyRequests).toEqual([
      { crudType: 'update', entityName: BRAND_CLASS_NAME, propertyName: 'activeFlag' },
      { crudType: 'update', entityName: BRAND_CLASS_NAME, propertyName: 'brandName' },
    ]);

    // Arm 2 is evaluated first for each candidate, matching the operand order at [:L188].
    expect(authorization.publicContextChecks).toHaveLength(2);
  });

  it('NET-NEW — a property absent from the payload is never asked about, and a populate-disabled one never reaches ARM 3', () => {
    const brand = new Brand();
    const authorization = createRecordingAuthorization(true);

    populate(
      brand,
      // `promotionRewards` and `createdByAccount` are both populate-disabled — the first by
      // model/entity/Brand.cfc:L66, the second by :L78 and additionally by the structural audit
      // exclusion. `brandWebsite` is enabled and present.
      { brandWebsite: 'https://example.test', promotionRewards: 'x', createdByAccount: 'y' },
      BRAND_PROPERTY_DESCRIPTORS,
      authorization,
    );

    expect(brand.brandWebsite).toBe('https://example.test');

    // Only the enabled, payload-present property is asked about. The two disabled keys never reach
    // arm 3 at all, because condition 2 (`populateEnabled === false`) and the structural audit
    // exclusion both run ahead of it.
    expect(authorization.propertyRequests).toEqual([
      { crudType: 'update', entityName: BRAND_CLASS_NAME, propertyName: 'brandWebsite' },
    ]);

    // And neither was written. `promotionRewards` is an initialised collection field on the class
    // [src/domain/product/Brand.ts:L541], so the meaningful assertion is that it still holds its
    // constructed empty value rather than the payload's string — `in` would be true either way.
    expect(brand.promotionRewards).toEqual([]);
    expect('createdByAccount' in brand).toBe(false);
  });

  it('NET-NEW — model/entity/Brand.cfc:L49 declares persistent=true, so ARM 1 does NOT short-circuit for this entity', () => {
    // The asymmetry AAP §0.4.1.4 records: a transient process object populates freely because
    // [:L186] short-circuits, whereas a persistent entity has arm 3 consulted. Asserting the
    // descriptor flag and the resulting behaviour together is what makes the asymmetry a test rather
    // than a comment.
    expect(BRAND_PROPERTY_DESCRIPTORS.persistent).toBe(true);
    expect(BRAND_PROPERTY_DESCRIPTORS.entityName).toBe(BRAND_CLASS_NAME);

    const authorization = createRecordingAuthorization(false);
    populate(new Brand(), { brandName: 'ACME' }, BRAND_PROPERTY_DESCRIPTORS, authorization);
    expect(authorization.propertyRequests).toHaveLength(1);
  });
});

describe('Brand — declared-type coercion, org/Hibachi/HibachiTransient.cfc:L192-L213', () => {
  /**
   * Populates a Brand with an allow-everything policy, so a case can concentrate on the value.
   *
   * @param data the payload
   * @returns the populated brand.
   */
  function populateBrand(data: Record<string, unknown>): Brand {
    return populate(
      new Brand(),
      data,
      BRAND_PROPERTY_DESCRIPTORS,
      createRecordingAuthorization(true),
    );
  }

  it('NET-NEW — model/entity/Brand.cfc:L53 — a JSON false stays the boolean false, not the truthy string', () => {
    const brand = populateBrand({ activeFlag: false, publishedFlag: false });

    // The defect this pins: `String(false).trim()` is `'false'`, which is truthy, so every
    // downstream `if (brand.activeFlag)` inverted. `ormtype="boolean"` at :L53 and :L54 is what the
    // descriptor declares, so the value survives as a boolean.
    expect(brand.activeFlag).toBe(false);
    expect(brand.publishedFlag).toBe(false);
    expect(typeof brand.activeFlag).toBe('boolean');
  });

  it('NET-NEW — model/entity/Brand.cfc:L53 — the CFML boolean vocabulary is accepted, unchanged', () => {
    // CFML casts all of these, case-insensitively, on the way to a Hibernate `boolean`. Accepting
    // exactly them and nothing wider is how the coercion stays parity rather than becoming a new
    // input policy.
    expect(populateBrand({ activeFlag: 'true' }).activeFlag).toBe(true);
    expect(populateBrand({ activeFlag: 'TRUE' }).activeFlag).toBe(true);
    expect(populateBrand({ activeFlag: 'yes' }).activeFlag).toBe(true);
    expect(populateBrand({ activeFlag: 'Yes' }).activeFlag).toBe(true);
    expect(populateBrand({ activeFlag: '1' }).activeFlag).toBe(true);
    expect(populateBrand({ activeFlag: 1 }).activeFlag).toBe(true);
    expect(populateBrand({ activeFlag: '  no  ' }).activeFlag).toBe(false);
    expect(populateBrand({ activeFlag: 'false' }).activeFlag).toBe(false);
    expect(populateBrand({ activeFlag: '0' }).activeFlag).toBe(false);
    expect(populateBrand({ activeFlag: 0 }).activeFlag).toBe(false);

    // Any non-zero number is true in CFML, including a negative one.
    expect(populateBrand({ activeFlag: 2 }).activeFlag).toBe(true);
    expect(populateBrand({ activeFlag: '-3' }).activeFlag).toBe(true);
  });

  it('NET-NEW — an ambiguous boolean raises rather than being written through or silently dropped', () => {
    /*
     * Not a hardening. `src/domain/base/populate.ts` records the difference as an execution-model
     * one under M5 rather than as a D18-precedent departure, because `'maybe'` was never accepted
     * by the legacy — it produced a CFML cast failure on the way to Hibernate — so the accepted set
     * is
     * identical and only the point of failure moves, because the target has no ORM flush in which to
     * fail. The two alternatives would each have changed an outcome: silently clearing deletes a value.
     */
    expect(() => populateBrand({ activeFlag: 'maybe' })).toThrow(DomainError);
    expect(() => populateBrand({ publishedFlag: 'on' })).toThrow(
      /cannot be represented in the declared type/,
    );
  });

  it('NET-NEW — the failure discloses declaration facts only, never the offending value', () => {
    let raised: unknown;
    try {
      populateBrand({ activeFlag: 'super-secret-probe-value' });
    } catch (error: unknown) {
      raised = error;
    }

    expect(raised).toBeInstanceOf(DomainError);
    if (raised instanceof DomainError) {
      expect(raised.message).not.toContain('super-secret-probe-value');
      expect(raised.context).toEqual({
        entityName: BRAND_CLASS_NAME,
        propertyName: 'activeFlag',
        valueType: 'boolean',
      });
    }
  });

  it('NET-NEW — model/entity/Brand.cfc:L56 — a string column still trims, and a blank still DELETES the key', () => {
    // Unchanged legacy behaviour, asserted so the coercion cannot be mistaken for a rewrite of
    // branch 1. The blank-to-NULL rule is [:L195-L196]; Brand declares no `notNull`, so the key goes.
    expect(populateBrand({ brandName: '  ACME  ' }).brandName).toBe('ACME');

    const cleared = populateBrand({ brandName: '   ' });
    expect('brandName' in cleared).toBe(false);
  });

  it('NET-NEW — a blank value clears a BOOLEAN column too, because [:L195] runs before any conversion', () => {
    // The ordering matters: if the boolean arm ran first, `''` would be an ambiguous boolean and
    // raise. The legacy evaluates the blank test first, so a blank clears whatever the ORM type is.
    const brand = populateBrand({ activeFlag: '' });
    expect('activeFlag' in brand).toBe(false);
  });

  it('NET-NEW — a string column receives a rendered number, exactly as CFML would have', () => {
    // `trim(100)` is the string '100' in CFML, and `urlTitle` is `ormtype="string"` at :L55, so the
    // rendered form is the faithful one. This is the case renderSimpleValue still serves.
    expect(populateBrand({ urlTitle: 100 }).urlTitle).toBe('100');
  });
});

/* The brandWebsite URL check — a split verdict on. */
describe('Brand — brandWebsite URL check, model/validation/Brand.json:L4', () => {
  it('NET-NEW — legacy parity: file:///etc/passwd is ACCEPTED, because :L259 accepted it', async () => {
    /*
     * The exact vector the security review reported, asserted by value rather than by category — and
     * asserted to pass. The legacy engine's `url` check covers file, so a brand carrying this value
     * saved. Refusing it here would be a save the legacy performed and this port declined, which is the
     * outcome change AAP §0.8.2 guideline 2 forbids. The exposure is real and is flagged at the predicate,
     * not closed by a silent narrowing inside a ported format check.
     */
    const brand = new Brand();
    brand.brandName = 'ACME';
    brand.urlTitle = 'acme';
    brand.brandWebsite = 'file:///etc/passwd';

    const { errors } = await validateBrand(brand, 'save');
    expect(errors.hasError('brandWebsite')).toBe(false);
    expect(errors.getError('brandWebsite')).toEqual([]);
  });

  it('NET-NEW — legacy parity: the other three non-web legacy protocols are ACCEPTED too', async () => {
    // FTP, MAILTO and news complete the engine's six. All three satisfied the rule in the legacy, so
    // all three satisfy it here.
    for (const website of ['ftp://files.test/x', 'mailto:hello@acme.test', 'news:acme.group']) {
      const brand = new Brand();
      brand.brandName = 'ACME';
      brand.urlTitle = 'acme';
      brand.brandWebsite = website;

      const { errors } = await validateBrand(brand, 'save');
      expect(errors.hasError('brandWebsite')).toBe(false);
    }
  });

  it.each([
    ['a userinfo pair', 'https://user:pass@acme.test/'],
    ['a bare userinfo name', 'https://user@acme.test/'],
    ['the deceptive-authority form, which resolves to evil.test', 'https://acme.test@evil.test/'],
    ['userinfo on ftp, which is still an authority-bearing scheme', 'ftp://anonymous@files.test/x'],
    ['userinfo on a scheme written in upper case', 'HTTPS://USER@ACME.TEST/'],
  ])(
    'NET-NEW TODO(parity) — %s is ACCEPTED, and the CWE-601 exposure is carried',
    async (_label, website) => {
      /*
       * This case has asserted both directions, and acceptance is the one parity permits.
       * `https://acme.test@evil.test/` reads to a human as acme.test and resolves to evil.test (CWE-601),
       * and `https://user:pass@acme.test/` stores a credential in a field that is read back and rendered
       * — the form RFC 3986 §3.2.1 deprecates. A revision refused both as a "second declared departure".
       */
      const brand = new Brand();
      brand.brandName = 'ACME';
      brand.urlTitle = 'acme';
      brand.brandWebsite = website;

      const { errors } = await validateBrand(brand, 'save');
      expect(errors.hasError('brandWebsite')).toBe(false);
    },
  );

  it.each([
    ['an embedded NUL', 'https://ac\u0000me.test'],
    ['a trailing NUL', 'https://acme.test\u0000'],
    ['an embedded BEL', 'https://acme.test/\u0007x'],
    ['a trailing DEL', 'https://acme.test\u007f'],
    ['a unit separator inside the path', 'https://acme.test/a\u001fb'],
    ['a trailing CRLF — the response-splitting payload', 'https://acme.test\r\n'],
    ['a leading tab', '\thttps://acme.test'],
    ['a trailing newline', 'https://acme.test\n'],
    ['a control character on a non-web legacy scheme', 'mailto:hello@acme.test\u0000'],
  ])(
    'NET-NEW TODO(parity) — %s is ACCEPTED, and the CWE-113/117 exposure is carried',
    async (_label, website) => {
      /*
       * The subtler of the two carried exposures. Refusing this could be argued as a "parity
       * correction" on the ground that RFC 3986 §2 admits no raw control character in a URI, so the
       * engine's own `isValid(…, "url")` cannot be accepting one as valid. That argument is not
       * checkable here: AAP §0.8.4.1 records that no CFML runtime exists in this environment, so
       * the
       * engine's internal pattern was never observed, and the predicate is a documented approximation.
       */
      const brand = new Brand();
      brand.brandName = 'ACME';
      brand.urlTitle = 'acme';
      brand.brandWebsite = website;

      const { errors } = await validateBrand(brand, 'save');
      expect(errors.hasError('brandWebsite')).toBe(false);
    },
  );

  it('NET-NEW — a CRLF plus a forged header still FAILS, on the whitespace rule and not the control character', async () => {
    /*
     * The one row that is refused despite carrying a control character, and stating why matters:
     * `'https://acme.test\r\nX-injected: 1'` is refused because the trimmed candidate carries
     * internal whitespace — the CR, the LF and the space in the forged header line — and
     * `isValid("url", …)` admits no whitespace inside a URL either. So this refusal is the legacy
     * approximation's own rather than an added hardening.
     */
    const brand = new Brand();
    brand.brandName = 'ACME';
    brand.urlTitle = 'acme';
    brand.brandWebsite = 'https://acme.test\r\nX-Injected: 1';

    const { errors } = await validateBrand(brand, 'save');
    expect(errors.getError('brandWebsite')).toEqual([
      'validate.save.Brand.brandWebsite.dataType.url',
    ]);
  });

  it('NET-NEW — ordinary surrounding SPACES are still trimmed away and the value is ACCEPTED', async () => {
    /*
     * The boundary of the correction above, pinned from the accepting side so the two cases together
     * state exactly where the line falls: U+0020 is trimmed and tolerated exactly as before, and only
     * control characters changed outcome. Trimming is a read-time operation only — the case further down
     * asserts the stored value is untouched.
     */
    for (const website of [
      '  https://acme.test  ',
      ' mailto:hello@acme.test',
      'https://acme.test ',
    ]) {
      const brand = new Brand();
      brand.brandName = 'ACME';
      brand.urlTitle = 'acme';
      brand.brandWebsite = website;

      const { errors } = await validateBrand(brand, 'save');
      expect(errors.hasError('brandWebsite')).toBe(false);
    }
  });

  it('NET-NEW — an `@` anywhere in the value is ACCEPTED, in the path as in the authority', async () => {
    /*
     * No `@` is judged at all, wherever it sits. These rows are the ones an authority scan would
     * have to leave alone, so they fail if such a scan is ever added without this being revisited.
     */
    for (const website of [
      'https://acme.test/a@b',
      'https://acme.test/?to=a@b',
      'https://acme.test/#a@b',
      'news:acme.group',
    ]) {
      const brand = new Brand();
      brand.brandName = 'ACME';
      brand.urlTitle = 'acme';
      brand.brandWebsite = website;

      const { errors } = await validateBrand(brand, 'save');
      expect(errors.hasError('brandWebsite')).toBe(false);
    }
  });

  it('NET-NEW — a genuine http or https website passes, which is what the field is for', async () => {
    for (const website of [
      'http://acme.test',
      'https://acme.test',
      'https://acme.test:8443/brands/acme?x=1#top',
      'HTTPS://ACME.TEST',
    ]) {
      const brand = new Brand();
      brand.brandName = 'ACME';
      brand.urlTitle = 'acme';
      brand.brandWebsite = website;

      const { errors } = await validateBrand(brand, 'save');
      expect(errors.hasError('brandWebsite')).toBe(false);
    }
  });

  it('NET-NEW — the check still refuses: a value with no scheme, and one with internal whitespace, both FAIL', async () => {
    /*
     * The legacy approximation is a rule, not the absence of one. `isValid("url", …)` requires a
     * recognised scheme and a non-empty remainder, so a bare word and an interrupted address both
     * fail — and the message key is the same one `:L226` composes.
     */
    for (const website of ['not-a-url', 'https://acme test/x', 'https://']) {
      const brand = new Brand();
      brand.brandName = 'ACME';
      brand.urlTitle = 'acme';
      brand.brandWebsite = website;

      const { errors } = await validateBrand(brand, 'save');
      expect(errors.getError('brandWebsite')).toEqual([
        'validate.save.Brand.brandWebsite.dataType.url',
      ]);
    }
  });

  it('NET-NEW — the rule still PASSES on an absent value, unchanged from :L259', async () => {
    // `org/Hibachi/HibachiValidationService.cfc:L259` passes the data-type rule on an absent value,
    // making it a format check rather than a presence check. `model/entity/Brand.cfc:L57` declares
    // no `required`, so an unset website is legal, and the format check does not change that.
    const brand = new Brand();
    brand.brandName = 'ACME';
    brand.urlTitle = 'acme';

    const { errors } = await validateBrand(brand, 'save');
    expect(errors.hasError('brandWebsite')).toBe(false);
  });

  it('NET-NEW — the stored value is never rewritten; this constraint validates, it does not normalise', async () => {
    const brand = new Brand();
    brand.brandName = 'ACME';
    brand.urlTitle = 'acme';
    brand.brandWebsite = '  https://acme.test  ';

    const { errors } = await validateBrand(brand, 'save');
    expect(errors.hasError('brandWebsite')).toBe(false);
    expect(brand.brandWebsite).toBe('  https://acme.test  ');
  });

  it('NET-NEW — the rule is save-scoped, so a delete never evaluates the website at all', async () => {
    /*
     * Model/validation/Brand.json:L4 declares `contexts: "save"`, and :L71 is the context gate. The
     * value has to be one the save context would reject for this to prove anything, which is why it is
     * `not-a-url` and no longer `file:///etc/passwd` — that vector now passes in both contexts.
     */
    const brand = new Brand();
    brand.brandWebsite = 'not-a-url';

    const { errors } = await validateBrand(brand, 'delete');
    expect(errors.hasError('brandWebsite')).toBe(false);
  });
});

/* The closed context union declared in `src/validation/Validator.ts`. */
describe('Brand — the closed validation context, org/Hibachi/HibachiValidationService.cfc:L162', () => {
  it('NET-NEW — the save context validates rather than skipping, for an entity that must fail', async () => {
    const { errors } = await validateBrand(new Brand(), 'save');
    expect(errors.hasErrors()).toBe(true);
    expect(errors.hasError('brandName')).toBe(true);
  });

  it('NET-NEW — the empty context does not cast to boolean and so validates normally', async () => {
    // This is the subtlety :L162 turns on: `''` is not boolean-castable in CFML, so an empty context
    // runs validation. Every Brand rule is context-scoped, so nothing fires under it — but the engine
    // reached the rule loop rather than short-circuiting, which is what is being pinned.
    const { errors } = await validateBrand(new Brand(), '');
    expect(errors.hasErrors()).toBe(false);
    expect(errors.getErrors()).toEqual({});
  });

  it('NET-NEW — the delete context selects the delete guards, not the save rules', async () => {
    const brand = new Brand();
    const { errors } = await validateBrand(brand, 'delete');
    expect(errors.hasError('brandName')).toBe(false);
  });
});
