/**
 * Brand domain tests — **TRACEABLE**.
 *
 * ================================================================================================
 * PROVENANCE
 * ================================================================================================
 * This suite is traceable to two legacy MXUnit components and to nothing else:
 *
 *   - `meta/tests/unit/entity/BrandTest.cfc:L52-L60` — the whole of Brand's own legacy test body.
 *     `setUp()` at `:L52-L56` calls `super.setup()` and then
 *     `variables.entity = request.slatwallScope.getService("brandService").newBrand();`, and
 *     `defaults_are_correct()` at `:L58-L60` is a single assertion,
 *     `assertEquals(variables.entity.getProducts(), []);`.
 *
 *   - `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L62` — the assertions Brand INHERITS,
 *     namely `validate_as_save_for_a_new_instance_doesnt_pass()` at `:L51-L54`,
 *     `simple_representation_exists_and_is_simple()` at `:L56-L58` and
 *     `has_primary_id_property_name()` at `:L60-L62`.
 *
 * ⚠️ THE BASE `defaults_are_correct()` IS **NOT** INHERITED BY BRAND. The base declares its own
 * version at `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67`
 * (`assert(entity.isNew())` and `assert(!len(entity.getPrimaryIDValue()))`), and
 * `meta/tests/unit/entity/BrandTest.cfc:L58-L60` REPLACES it — CFML method overriding, not
 * augmentation. The legacy Brand run therefore executed the overriding empty-products assertion
 * plus exactly THREE inherited assertions, and AAP §0.6.5.1 counts Brand's coverage that way. The
 * base version's own two assertions are still meaningful against the target class, so they ARE
 * covered here — but as **NET-NEW**, never as traceable, because `BrandTest.cfc` never ran them.
 *
 * ================================================================================================
 * TRACEABILITY IS DOCUMENTARY, NOT EMPIRICAL
 * ================================================================================================
 * The legacy suite CANNOT be executed in this environment, so no legacy result was observed and no
 * output was compared. Three independent reasons, each verified rather than assumed:
 *
 *   1. MXUnit is not vendored. `meta/tests/readme.txt:L4` requires MXUnit "Installed on your
 *      machine with a mapping inside of your CFIDE", and no such mapping exists here.
 *      `meta/tests/unit/SlatwallUnitTestBase.cfc:L49` extends `mxunit.framework.TestCase`, which is
 *      consequently unresolvable.
 *   2. CFSelenium is not vendored either (`meta/tests/readme.txt:L5`), so the functional tier is
 *      equally unrunnable.
 *   3. There is no CFML engine, and no local runtime definition to bring one up — AAP §0.8.4.1
 *      records that the `meta/docker/slatwall-local-dev/` setup cited as optional context does not
 *      exist in this repository.
 *
 * Every mapping below was therefore established by READING legacy test source line by line. That is
 * a weaker claim than a re-run comparison and it is stated plainly rather than implied away, exactly
 * as AAP §0.6.5.3 and §0.8.4.2 require.
 *
 * ================================================================================================
 * THE STRUCTURAL TRANSLATION: LEGACY INTEGRATION TEST -> TARGET UNIT TEST
 * ================================================================================================
 * A reviewer diffing the two suites should EXPECT them to differ in kind, per AAP §0.4.3.6. The
 * legacy fixture booted the entire application: `meta/tests/unit/SlatwallUnitTestBase.cfc:L51-L56`
 * instantiates `Slatwall.Application`, `:L59-L66` calls `bootstrap()` and promotes the request
 * account to super-user, and only then does `meta/tests/unit/entity/BrandTest.cfc:L55` reach the
 * entity — through a string-keyed DI/1 lookup, `getService("brandService")`, calling the
 * `onMissingMethod`-synthesized `newBrand()` of `org/Hibachi/HibachiService.cfc:L255-L281`. Every
 * legacy assertion was therefore an integration assertion over a live ORM session.
 *
 * The target fixture is `new Brand()`. Nothing is bootstrapped, no container is built, no service is
 * resolved, no connection is opened and no environment variable is read. The three legacy framework
 * members the inherited assertions called — `validate`/`hasErrors`, `getSimpleRepresentation` and
 * `getPrimaryIDPropertyName` — no longer live on the entity at all: AAP §0.8.3.2 retires
 * `org/Hibachi/**` for this slice rather than porting it, so validation moved to
 * `src/validation/Validator.ts` driving `src/validation/rules/brand.rules.ts`, and the two
 * introspection facts became declared structure. Each inherited assertion below is therefore
 * re-expressed against the layer that now owns the behaviour, and the re-expression is named at the
 * case that performs it.
 *
 * WHAT IS EXERCISED FOR REAL: the actual `Brand` class, the actual `Validator`, the actual
 * transliterated `brand.rules.ts` rule set and the actual `ValidationError` bag. Nothing here is a
 * re-implementation of the code under test. The two collaborators that genuinely sit outside this
 * slice — a Product and the uniqueness port — are supplied as narrow typed doubles declared in this
 * file, because AAP §0.4.3.6 records that the legacy repository ships NO mocking library and the
 * target suite substitutes plain doubles instead. `jest.mock` is not used, the module registry is
 * not touched, and no third-party mocking package is introduced.
 *
 * ================================================================================================
 * COVERAGE COMPLETENESS AND THE BOUNDARY STATEMENT
 * ================================================================================================
 * PERSISTENT + PRODUCTS COVERAGE IS COMPLETE FOR THIS SLICE, AND NO BOUNDARY STUB IS NEEDED.
 * `model/entity/Brand.cfc:L83-L85` — the entity's "Non-Persistent Property Methods" section — is a
 * START banner, a blank line and an END banner. Brand declares ZERO non-persistent properties, so
 * the calculated-property boundary of AAP §0.2.2.6 (which forces `Product` and `Sku` to exclude
 * pricing, promotion, inventory and currency members) simply does not arise here. There is nothing
 * to stub, and no fake non-persistent member is invented in order to have a boundary to test.
 * Covering the six persistent properties declared at `model/entity/Brand.cfc:L52-L57` and the
 * `products` relationship at `:L61` is therefore the whole of the assigned surface.
 *
 * SCOPE HELD DELIBERATELY NARROW. `model/entity/Brand.cfc` also declares `attributeValues` (`:L60`)
 * and six many-to-many-inverse collections (`:L66-L71`) reaching the promotion, vendor and physical
 * families — every one of which AAP §0.2.2.1 excludes. The AAP row for the Brand entity names "Six
 * persistent properties and the products relationship", so only the `products` relationship is
 * exercised below. No promotion, vendor, physical, attribute, pricing or currency behaviour is
 * pulled into this file, and no service is constructed.
 *
 * RULES: `review_rules` reports "No user rules provided." for this project, so no file enters scope
 * by rule and no rule-derived constraint applies here. Per UR4 that is not licence to lower the bar:
 * the enterprise standards of AAP §0.7.3 govern instead, and the ones with teeth in a test file are
 * strict type safety (no `any`, no unsafe cast, no non-null assertion, no suppression comment), the
 * one-test-per-converted-behaviour rule with an explicit TRACEABLE or NET-NEW label on EVERY case,
 * preserve-and-annotate rather than repair, and invent nothing — every literal below is read from a
 * cited legacy line.
 */

import {
  BRAND_PROPERTY_DESCRIPTORS,
  Brand,
  isBrandPopulateDisabledProperty,
  type BrandPropertyName,
} from '../../src/domain/product/Brand';
import { ValidationError } from '../../src/errors/ValidationError';
import { Validator } from '../../src/validation/Validator';
import {
  brandValidationRules,
  resolveBrandUniqueTarget,
} from '../../src/validation/rules/brand.rules';

/* ================================================================================================
 * SOURCE-GROUNDED CONSTANTS
 * Every value here is read from a cited legacy line. Nothing is invented: no UUID is generated, no
 * timing or capacity figure appears, and no coverage threshold is asserted.
 * ============================================================================================== */

/**
 * The class name the validation engine reports failures under.
 *
 * `org/Hibachi/HibachiValidationService.cfc:L202` reads it off the object, and for the entities of
 * this slice the value is the bare entity name. `model/entity/Brand.cfc:L49` declares
 * `displayname="Brand"`, and the legacy `getClassName()` returned the component name, so `Brand` is
 * the value that appears in every message key asserted below.
 */
const BRAND_CLASS_NAME = 'Brand';

/**
 * `model/entity/Brand.cfc:L49` declares `entityname="SlatwallBrand"`. Consumed only by the
 * uniqueness port double, whose legacy counterpart reads it at `org/Hibachi/HibachiDAO.cfc:L136`.
 */
const BRAND_ENTITY_NAME = 'SlatwallBrand';

/**
 * Brand's primary identifier property — `model/entity/Brand.cfc:L52`, the file's only
 * `fieldtype="id"` declaration.
 *
 * `Extract<BrandPropertyName, 'brandID'>` is the point, not decoration: it resolves to `'brandID'`
 * only while the entity really declares that property, so a rename in
 * `src/domain/product/Brand.ts` becomes a COMPILE error here rather than a silently stale literal.
 * The same technique guards the five rule identifiers in `src/validation/rules/brand.rules.ts`.
 */
const BRAND_PRIMARY_ID_PROPERTY_NAME: Extract<BrandPropertyName, 'brandID'> = 'brandID';

/**
 * The unsaved primary-identifier value, verbatim from `model/entity/Brand.cfc:L52`, which declares
 * both `unsavedvalue=""` and `default=""`.
 *
 * It is the sentinel `Brand.isNew()` compares against, reproducing `getNewFlag()` at
 * `org/Hibachi/HibachiEntity.cfc:L571-L576`. NO IDENTIFIER IS EVER GENERATED IN THIS FILE: per IR-6
 * a Brand key is a 32-character hex string minted by the persistence layer, and a test that invented
 * one would be asserting a value the source does not state.
 */
const BRAND_UNSAVED_ID_VALUE = '';

/**
 * The identifier `model/validation/Brand.json:L7` names and `model/entity/Brand.cfc` does not
 * declare — the entity declares `physicals` at `:L71` instead.
 *
 * `Exclude<'physicalCounts', BrandPropertyName>` resolves to `'physicalCounts'` ONLY WHILE THE
 * PROPERTY IS ABSENT from the entity's declared name space, so this declaration is a compile-checked
 * assertion that the fifth Brand rule is inert. If a `physicalCounts` property were ever added to
 * the entity the type would collapse to `never` and this line would stop compiling, forcing a reader
 * back to the finding before the guard could quietly come alive. It mirrors the identical guard in
 * `src/validation/rules/brand.rules.ts`.
 *
 * NO SUCH FIELD IS ADDED ANYWHERE — not to the entity, not to the validation subject below, and not
 * to any double. `org/Hibachi/HibachiValidationService.cfc:L171` SKIPS a rule whose property the
 * subject does not carry, so inertness is the legacy behaviour and preserving it is the requirement
 * (AAP §0.7.3, preserve and annotate rather than repair).
 */
const UNDECLARED_PHYSICAL_COUNTS_IDENTIFIER: Exclude<'physicalCounts', BrandPropertyName> =
  'physicalCounts';

/**
 * The SIX persistent properties of `model/entity/Brand.cfc:L52-L57`, in declaration order.
 *
 * `satisfies` rather than a cast: the literal tuple is preserved for the per-property cases below
 * while every member is checked against the entity's real property-name union. A typo or a property
 * that no longer exists is a compile error, and `physicalCounts` could not be added to this list.
 */
const BRAND_PERSISTENT_PROPERTY_NAMES = [
  'brandID',
  'activeFlag',
  'publishedFlag',
  'urlTitle',
  'brandName',
  'brandWebsite',
] as const satisfies readonly BrandPropertyName[];

/**
 * Every property `model/entity/Brand.cfc` declares, mapped to the line that declares it.
 *
 * `Record<BrandPropertyName, string>` makes this EXHAUSTIVE by compile check — a property added to
 * the entity's name space and not recorded here is an error — and the object literal's excess
 * property check makes it impossible to add a name the entity does not declare. Both halves matter,
 * because this map is what the validation subject's `hasProperty` answers over, and
 * `org/Hibachi/HibachiTransient.cfc:L763-L765` defines that predicate as
 * `structKeyExists(getPropertiesStruct(), name)` — a test of DECLARED METADATA, never of runtime
 * value presence. Answering it from runtime keys instead would make every rule skip and would turn
 * the traceable save assertion into a silent no-op.
 */
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

/**
 * The declared property names in legacy declaration order, derived from the locator map so the two
 * cannot drift.
 *
 * Typed as strings rather than as the union because the only consumer is a string comparison — the
 * property-existence predicate — and narrowing it further would add nothing.
 */
const BRAND_DECLARED_PROPERTY_NAMES: readonly string[] = Object.keys(
  BRAND_DECLARED_PROPERTY_LOCATORS,
);

/* ================================================================================================
 * THE PRODUCT-SIDE COLLABORATOR — A NARROW TYPED DOUBLE, NOT A MOCK AND NOT A CAST
 * ============================================================================================== */

/**
 * Exactly what `Brand`'s three product members touch on the far side of the relationship, and
 * nothing more.
 *
 * WHY A STRUCTURAL COLLABORATOR RATHER THAN THE `Product` CLASS. `Product` is not among this file's
 * declared dependencies, so importing it is not permitted, and it is deliberately not re-declared
 * either: a local fork of an in-scope domain type would be a second definition guaranteed to drift.
 * What IS declared is the minimum contract `src/domain/product/Brand.ts` actually exercises, read
 * straight off its two delegating bodies — `addProduct` calls `product.setBrand(this)` and
 * `removeProduct` calls `product.removeBrand(this)`. Those two members are the whole of Brand's
 * dependency on the far side, and both are guaranteed to exist on the real type, because if either
 * were missing `src/domain/product/Brand.ts` could not compile at all.
 *
 * `productID` is declared for one purpose only: the identity case below needs two DISTINCT
 * collaborators that agree on an identifier, in order to prove that membership is by object identity
 * and not by key. It is source-grounded — `model/entity/Product.cfc:L52` declares
 * `property name="productID" ... fieldtype="id"` — and it is never read by any Brand member.
 */
interface BrandProductCollaborator {
  /** `model/entity/Product.cfc:L52` — declared for the identity case, never read by Brand. */
  readonly productID: string;

  /** The port of `model/entity/Product.cfc:L661-L666`, invoked by `Brand.addProduct`. */
  setBrand(brand: Brand): void;

  /** The port of `model/entity/Product.cfc:L667-L676`, invoked by `Brand.removeProduct`. */
  removeBrand(brand: Brand): void;
}

/**
 * The `products` relationship of `model/entity/Brand.cfc:L61`, viewed over the narrow collaborator
 * shape above.
 *
 * G6 TRANSLATION DECISION — HOW A REAL `Brand` IS EXERCISED WITH A DOUBLE, WITHOUT A CAST. A `Brand`
 * instance is assigned to this interface with a plain annotated assignment. There is no `as`, no
 * `as unknown as`, no `any`, no non-null assertion and no suppression comment anywhere in this file;
 * the assignment is fully type-checked, and it succeeds because TypeScript compares the parameters
 * of members declared with METHOD SYNTAX bivariantly, even under `strict` and
 * `strictFunctionTypes`. `Brand.hasProduct`, `Brand.addProduct` and `Brand.removeProduct` are all
 * declared with method syntax, and the real product type satisfies
 * {@link BrandProductCollaborator}'s two behavioural members for the reason given above, so the
 * relation holds in both directions of the check.
 *
 * `getProducts()` is declared returning a MUTABLE array of collaborators rather than a read-only or
 * opaque one, and that is load-bearing: `model/entity/Product.cfc:L664` maintains the relationship
 * with `arrayAppend(arguments.brand.getProducts(), this)` and `:L673` breaks it with
 * `arrayDeleteAt(arguments.brand.getProducts(), index)`, so a faithful product-side double must be
 * able to push into and splice out of the very array `Brand` hands back. That is the live-array
 * contract `src/domain/product/Brand.ts` documents on `getProducts`, and asserting it is the point
 * of the traceable case below.
 *
 * WHY THIS SHAPE IS SAFE AT RUN TIME, not merely accepted by the compiler: the three Brand members
 * touch NOTHING on the collaborator beyond `setBrand`, `removeBrand` and array identity —
 * `hasProduct` is `this.products.includes(product)`, `addProduct` is `product.setBrand(this)` and
 * `removeProduct` is `product.removeBrand(this)`. A double implementing those two methods is
 * therefore sufficient for every path under test, and no member the doubles lack is ever reached.
 */
interface BrandProductsRelationship {
  /** The live collection — `model/entity/Brand.cfc:L61`. */
  getProducts(): BrandProductCollaborator[];

  /** The IR-1 explicitly declared membership predicate. */
  hasProduct(product: BrandProductCollaborator): boolean;

  /** `model/entity/Brand.cfc:L98-L100`. */
  addProduct(product: BrandProductCollaborator): void;

  /** `model/entity/Brand.cfc:L101-L103`. */
  removeProduct(product: BrandProductCollaborator): void;
}

/**
 * A product double that RECORDS the calls Brand delegates to it and does nothing else.
 *
 * Its whole purpose is to prove that `Brand.addProduct` and `Brand.removeProduct` are PURE
 * DELEGATIONS: because this double's `setBrand` deliberately does not append into
 * `brand.getProducts()`, an assertion that the collection is still empty afterwards proves Brand
 * never pushes on its own account. That is the behaviour `model/entity/Brand.cfc:L98-L100` and
 * `:L101-L103` specify — Brand hands itself to the product and the product owns both sides — and it
 * is exactly the property the assigned scope asks to be pinned.
 *
 * No mocking library is used: the recording is two plain arrays. `jest.fn` is deliberately avoided
 * too, so the double reads as ordinary code and carries no framework coupling.
 */
class RecordingProductDouble implements BrandProductCollaborator {
  /** Every brand `Brand.addProduct` handed to this product, in call order. */
  public readonly setBrandCalls: Brand[] = [];

  /** Every brand `Brand.removeProduct` handed to this product, in call order. */
  public readonly removeBrandCalls: Brand[] = [];

  public constructor(public readonly productID: string) {}

  public setBrand(brand: Brand): void {
    this.setBrandCalls.push(brand);
  }

  public removeBrand(brand: Brand): void {
    this.removeBrandCalls.push(brand);
  }
}

/**
 * A product double that reproduces the REAL product-side bodies, so the relationship actually forms.
 *
 * `setBrand` is `model/entity/Product.cfc:L661-L666` line for line:
 *
 *     variables.brand = arguments.brand;
 *     if(isNew() or !arguments.brand.hasProduct( this )) {
 *         arrayAppend(arguments.brand.getProducts(), this);
 *     }
 *
 * The `isNew() or` arm is reproduced as a plain identifier test against the unsaved value, because
 * `getNewFlag()` at `org/Hibachi/HibachiEntity.cfc:L571-L576` is precisely
 * `getPrimaryIDValue() == ""`. That arm is why an UNSAVED product appends unconditionally while a
 * saved one is guarded by `hasProduct`, and both routes are asserted below.
 *
 * `removeBrand` is `model/entity/Product.cfc:L667-L676`: locate this product in the brand's live
 * collection, splice it out when found, then drop the back-reference — which the legacy body does
 * with `structDelete(variables, "brand")`, so `delete` is the faithful translation rather than an
 * assignment of a sentinel.
 *
 * The argument-defaulting arm of the legacy body (`if(!structKeyExists(arguments, "brand"))` at
 * `:L668-L670`) is NOT reproduced, and deliberately: `Brand.removeProduct` always passes itself, so
 * that arm is unreachable from every path this file exercises. Adding it would be inventing a
 * behaviour no case here can observe.
 */
class RelationshipMaintainingProductDouble implements BrandProductCollaborator {
  /** The back-reference `model/entity/Product.cfc:L662` assigns and `:L675` deletes. */
  public brand?: Brand;

  public constructor(public readonly productID: string) {}

  /** `model/entity/Product.cfc:L661-L666`. */
  public setBrand(brand: Brand): void {
    this.brand = brand;
    const relationship: BrandProductsRelationship = brand;
    if (this.isNew() || !relationship.hasProduct(this)) {
      relationship.getProducts().push(this);
    }
  }

  /** `model/entity/Product.cfc:L667-L676`, minus its unreachable argument-defaulting arm. */
  public removeBrand(brand: Brand): void {
    const relationship: BrandProductsRelationship = brand;
    const products = relationship.getProducts();
    const index = products.indexOf(this);
    if (index > -1) {
      products.splice(index, 1);
    }
    delete this.brand;
  }

  /** `org/Hibachi/HibachiEntity.cfc:L571-L576` — the unsaved-value test, for `productID`. */
  private isNew(): boolean {
    return this.productID === BRAND_UNSAVED_ID_VALUE;
  }
}

/* ================================================================================================
 * THE VALIDATION HARNESS — REAL ENGINE, REAL RULES, ONE NARROW PORT DOUBLE
 * ============================================================================================== */

/**
 * The subject shape `brand.rules.ts` is typed over, obtained WITHOUT a forbidden import.
 *
 * `src/validation/rules/brand.rules.ts` exports `brandValidationRules` typed over the intersection
 * of its own subject shape and the uniqueness port's entity shape, and the second half of that
 * intersection lives in `src/ports/UniquePropertyPort.ts` — a module this file is not permitted to
 * import. `Parameters<typeof resolveBrandUniqueTarget>[0]` reads the exact same type off the
 * `resolveBrandUniqueTarget` export, which IS a declared dependency. No shape is duplicated, nothing
 * is widened, and the harness cannot drift from the rule set it feeds.
 */
type BrandUniquenessSubject = Parameters<typeof resolveBrandUniqueTarget>[0];

/**
 * The uniqueness port's shape, obtained the same way — `ConstructorParameters<typeof Validator>[0]`
 * — so the double is checked against the real contract with no extra import.
 */
type UniquePropertyPortShape = ConstructorParameters<typeof Validator>[0];

/** One recorded application-side uniqueness check, for the assertions on IR-5 below. */
interface RecordedUniquenessCheck {
  /** The trailing segment of the property identifier, per `org/Hibachi/HibachiDAO.cfc:L131`. */
  readonly propertyName: string;

  /** Read from the resolved entity, as the legacy body does at `org/Hibachi/HibachiDAO.cfc:L136`. */
  readonly entityName: string;

  /** Read from the resolved entity, as the legacy body does at `org/Hibachi/HibachiDAO.cfc:L137`. */
  readonly primaryIDValue: string;
}

/**
 * A uniqueness port double that records every check and returns a fixed verdict.
 *
 * IR-5 requires an APPLICATION-SIDE uniqueness check in addition to the database constraint —
 * `isUniqueProperty()` at `org/Hibachi/HibachiDAO.cfc:L130-L146` runs an existence query during
 * validation — and `src/validation/Validator.ts` reaches it through the injected port for every
 * `unique` rule. `urlTitle` at `model/validation/Brand.json:L5` is one of those rules, so a Brand
 * save cannot be validated without a port. This double supplies one without any data access: it is a
 * plain object literal, contextually typed against the real port contract, performing no I/O.
 *
 * `verdict` is the port's own polarity, preserved rather than inverted: `true` means the value IS
 * unique and therefore savable.
 *
 * @param verdict the answer the port returns for every check
 * @param recorded the array each check is appended to, in call order
 * @returns a port double satisfying the real contract
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
 * Adapts a REAL `Brand` instance to the subject contract the validation engine requires.
 *
 * WHY AN ADAPTER IS NEEDED AT ALL, AND WHY IT IS NOT A RE-IMPLEMENTATION. The legacy assertion
 * called `entity.validate(context="save")` directly, because `org/Hibachi/HibachiTransient.cfc:L408`
 * put `validate` on the entity and had it resolve the validation service dynamically.
 * `src/domain/product/Brand.ts` deliberately declares no `validate`, no `hasErrors`, no
 * `getClassName` and no `hasProperty`: AAP §0.8.3.2 retires `org/Hibachi/**` for this slice, and
 * `src/validation/rules/brand.rules.ts` records the same conclusion from the rule side — a rule set
 * typed against the entity class "would therefore not type-check at all, and forcing those two
 * members onto the entity to make it fit would push framework machinery back into the domain layer
 * that just finished shedding it". The adapter is the seam that replaced the entity method. Every
 * data read below delegates to the real Brand instance, and the real engine and real rule set do all
 * the deciding.
 *
 * ABSENCE IS PRESERVED AS ABSENCE. The four readable members are attached with conditional spreads
 * rather than assigned unconditionally, so a property the Brand does not carry is genuinely MISSING
 * from the subject instead of present-and-undefined. That is required twice over: the subtree enables
 * `exactOptionalPropertyTypes` precisely so the two states stay distinguishable, and the presence
 * predicate at `org/Hibachi/HibachiValidationService.cfc:L240-L245` turns on it. Under CFML the same
 * distinction was structural — an unassigned property simply did not exist in the `variables` scope —
 * and `src/domain/product/Brand.ts` reproduces it by declaring the five optional scalars with the
 * `declare` modifier so no own property is emitted for them.
 *
 * `hasProperty` ANSWERS OVER DECLARED METADATA, NOT RUNTIME KEYS. `products` is always attached
 * because `src/domain/product/Brand.ts` initialises the collection eagerly, so it is never absent on
 * a real instance.
 *
 * @param brand the real entity under test
 * @returns a subject the real rule set can be evaluated against
 */
function createBrandValidationSubject(brand: Brand): BrandUniquenessSubject {
  return {
    // --- ValidationSubject, per src/validation/Validator.ts -------------------------------------
    getClassName: (): string => BRAND_CLASS_NAME,
    hasProperty: (propertyIdentifier: string): boolean =>
      BRAND_DECLARED_PROPERTY_NAMES.includes(propertyIdentifier),

    // --- the uniqueness port's entity shape, per org/Hibachi/HibachiDAO.cfc:L134-L138 ----------
    getPropertyMetaData: (propertyName: string) => ({ name: propertyName }),
    getEntityName: (): string => BRAND_ENTITY_NAME,
    getPrimaryIDValue: (): string => brand.brandID,
    getPrimaryIDPropertyName: (): string => BRAND_PRIMARY_ID_PROPERTY_NAME,
    getValueByPropertyIdentifier: (propertyIdentifier: string): unknown => {
      switch (propertyIdentifier) {
        case 'brandID':
          return brand.brandID;
        case 'urlTitle':
          return brand.urlTitle;
        case 'brandName':
          return brand.brandName;
        case 'brandWebsite':
          return brand.brandWebsite;
        case 'products':
          return brand.getProducts();
        default:
          return undefined;
      }
    },

    // --- the four members the five Brand rules read, absence preserved --------------------------
    products: brand.getProducts(),
    ...(brand.brandName === undefined ? {} : { brandName: brand.brandName }),
    ...(brand.brandWebsite === undefined ? {} : { brandWebsite: brand.brandWebsite }),
    ...(brand.urlTitle === undefined ? {} : { urlTitle: brand.urlTitle }),
  };
}

/** The outcome of one validation run, so a case can assert on both the bag and the port traffic. */
interface BrandValidationRun {
  readonly errors: ValidationError;
  readonly uniquenessChecks: readonly RecordedUniquenessCheck[];
}

/**
 * Validates a real `Brand` with the real engine and the real transliterated rule set.
 *
 * Nothing about the rules is restated here: `brandValidationRules` is imported as it stands, so a
 * change to `model/validation/Brand.json`'s transliteration is observed by these cases rather than
 * shadowed by a local copy.
 *
 * @param brand the entity to validate
 * @param context the validation context — `save` and `delete` are the only two
 *   `model/validation/Brand.json` declares
 * @param unique the verdict the uniqueness port returns; `true` means unique and therefore savable
 * @returns the error bag the engine returned, plus every uniqueness check it performed
 */
async function validateBrand(
  brand: Brand,
  context: string,
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

/**
 * Resolves the simple-representation property by the legacy NAMING CONVENTION, rather than by
 * inventing an override on the entity.
 *
 * `org/Hibachi/HibachiEntity.cfc:L74-L86` scans the declared properties for the one whose name
 * equals `getClassName() & "name"`, and CFML string comparison is case-INSENSITIVE, which is why
 * `Brand` + `name` matches the `brandName` property declared at `model/entity/Brand.cfc:L56`.
 * `model/entity/Brand.cfc:L157-L159` — the entity's "Overridden Methods" section — is empty, so
 * Brand overrides NEITHER `getSimpleRepresentation()` nor `getSimpleRepresentationPropertyName()`,
 * and this file must not pretend otherwise: the convention is applied, not bypassed.
 *
 * The failure arm of the legacy method raises rather than returning, and its message text is not
 * reproduced here. It is unreachable for Brand in any case, because the convention does match.
 *
 * @param className the subject's class name
 * @param declaredPropertyNames the entity's declared property names
 * @returns every declared property the convention selects; exactly one for a well-formed entity
 */
function resolveSimpleRepresentationPropertyNames(
  className: string,
  declaredPropertyNames: readonly string[],
): readonly string[] {
  const conventionalName = `${className}name`.toLowerCase();
  return declaredPropertyNames.filter(
    (propertyName) => propertyName.toLowerCase() === conventionalName,
  );
}

/**
 * The simple representation of a Brand — the port of `org/Hibachi/HibachiEntity.cfc:L59-L72`.
 *
 * The legacy body reads the conventional property and returns it only when the value is non-null AND
 * simple, falling through to the EMPTY STRING otherwise (`:L71`). `typeof value === 'string'` is the
 * faithful analogue of `isSimpleValue` for a property `model/entity/Brand.cfc:L56` declares
 * `ormtype="string"`, and the blank fallthrough is preserved verbatim, which is what makes the
 * representation of a freshly constructed Brand a simple value rather than an absent one.
 *
 * @param brand the entity to represent
 * @returns the brand name when it is a simple value, otherwise the legacy blank fallthrough
 */
function readBrandSimpleRepresentation(brand: Brand): string {
  const value = brand.brandName;
  return typeof value === 'string' ? value : '';
}

/* ================================================================================================
 * THE LEGACY-TRACEABLE CONTRACT — ONE OVERRIDDEN ASSERTION PLUS EXACTLY THREE INHERITED
 * ============================================================================================== */

describe('Brand — the legacy-traceable contract', () => {
  it('TRACEABLE — meta/tests/unit/entity/BrandTest.cfc:L58-L60 — a fresh Brand is constructible and its products collection is an empty, live array', () => {
    // The legacy fixture at meta/tests/unit/entity/BrandTest.cfc:L55 obtained its entity from
    // `getService("brandService").newBrand()`. `newBrand()` is an IR-1 synthesized service member
    // fabricated by org/Hibachi/HibachiService.cfc:L255-L281 and belongs to the service layer, so
    // the target fixture is the constructor itself. It takes no arguments and performs no work,
    // which is precisely what turns this from an integration assertion into a unit assertion.
    const brand = new Brand();

    // ---------------------------------------------------------------------------------------------
    // THE LEGACY ASSERTION, VERBATIM. meta/tests/unit/entity/BrandTest.cfc:L59 is
    //     assertEquals(variables.entity.getProducts(), []);
    // and this single expectation is its whole content. Everything after it is target-contract
    // strengthening, kept separate so the ported assertion stays identifiable.
    // ---------------------------------------------------------------------------------------------
    expect(brand.getProducts()).toEqual([]);

    // --- strengthening required by the target contract, not by the legacy assertion --------------
    // src/domain/product/Brand.ts documents `getProducts()` as returning the LIVE array by
    // reference, because model/entity/Product.cfc:L664 appends into it with `arrayAppend` and :L673
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
    // The legacy body is
    //     variables.entity.validate(context="save");
    //     assert(variables.entity.hasErrors());
    // Re-expressed against the layer that now owns validation: the real Validator evaluating the
    // real transliteration of model/validation/Brand.json. No rule is restated locally.
    const { errors, uniquenessChecks } = await validateBrand(new Brand(), 'save');

    // `hasErrors()` is the direct port of org/Hibachi/HibachiTransient.cfc:L47-L53.
    expect(errors).toBeInstanceOf(ValidationError);
    expect(errors.hasErrors()).toBe(true);

    // WHY IT FAILS, stated rather than left implicit: model/validation/Brand.json:L3 makes
    // `brandName` required for save and :L5 makes `urlTitle` required for save, and a fresh Brand
    // carries neither — src/domain/product/Brand.ts declares both with the `declare` modifier so no
    // own property is emitted, reproducing CFML's unassigned-property semantics exactly.
    expect(errors.getErrors()).toEqual({
      brandName: ['validate.save.Brand.brandName.required'],
      urlTitle: ['validate.save.Brand.urlTitle.required'],
    });

    // The bag is KEYED BY PROPERTY and its values are ARRAYS — org/Hibachi/HibachiTransient.cfc:L30
    // returns a struct and :L35 an array — which is why one save can report several failures for one
    // property. The keyed shape is asserted here and exercised further below.
    expect(errors.hasError('brandName')).toBe(true);
    expect(errors.hasError('urlTitle')).toBe(true);
    expect(errors.getError('brandName')).toEqual(['validate.save.Brand.brandName.required']);

    // brandWebsite carries only a `dataType` rule at model/validation/Brand.json:L4, and
    // org/Hibachi/HibachiValidationService.cfc:L256-L262 PASSES that rule on an absent value, so an
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
    // model/entity/Brand.cfc:L157-L159 is empty, so Brand overrides neither
    // getSimpleRepresentation() nor getSimpleRepresentationPropertyName() and the framework default
    // applied. That default is a naming convention, so the convention is what is asserted — no
    // Brand-specific override is invented to stand in for it.
    const matches = resolveSimpleRepresentationPropertyNames(
      BRAND_CLASS_NAME,
      BRAND_DECLARED_PROPERTY_NAMES,
    );

    // Exactly one declared property satisfies the convention, so the resolution is unambiguous —
    // which is what makes org/Hibachi/HibachiEntity.cfc:L74-L86 deterministic for this entity.
    expect(matches).toEqual(['brandName']);

    // The representation of a freshly constructed Brand is a SIMPLE value: `brandName` is absent, so
    // org/Hibachi/HibachiEntity.cfc:L71 falls through to the blank default rather than returning
    // null. `typeof === 'string'` is the faithful analogue of `isSimpleValue` here.
    const brand = new Brand();
    const emptyRepresentation = readBrandSimpleRepresentation(brand);
    expect(typeof emptyRepresentation).toBe('string');
    expect(emptyRepresentation).toBe('');

    // Once populated it is the property's own value, still a simple value. The literal is arbitrary
    // test input rather than a source-declared default, so no default is being asserted here.
    brand.brandName = 'Traceable Brand Name';
    const populatedRepresentation = readBrandSimpleRepresentation(brand);
    expect(typeof populatedRepresentation).toBe('string');
    expect(populatedRepresentation).toBe('Traceable Brand Name');
  });

  it('TRACEABLE — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L60-L62 — a non-empty primary-ID property name exists, and it identifies brandID', () => {
    // The legacy body is `assert(len(variables.entity.getPrimaryIDPropertyName()))` — an assertion
    // about LENGTH, so the non-emptiness is asserted first and in its own right.
    expect(BRAND_PRIMARY_ID_PROPERTY_NAME.length).toBeGreaterThan(0);

    // The target contract makes the identity explicit, so it is asserted rather than left at
    // non-emptiness: model/entity/Brand.cfc:L52 is the file's only `fieldtype="id"` declaration, and
    // `brandID` is a member of the entity's declared property-name space.
    expect(BRAND_PRIMARY_ID_PROPERTY_NAME).toBe('brandID');
    expect(BRAND_DECLARED_PROPERTY_NAMES).toContain(BRAND_PRIMARY_ID_PROPERTY_NAME);
    expect(BRAND_DECLARED_PROPERTY_LOCATORS[BRAND_PRIMARY_ID_PROPERTY_NAME]).toBe(
      'model/entity/Brand.cfc:L52',
    );

    // The name really does address the primary identifier on a live instance, and on a fresh one it
    // holds the unsaved value from model/entity/Brand.cfc:L52. No identifier is generated (IR-6).
    const brand = new Brand();
    expect(brand.brandID).toBe(BRAND_UNSAVED_ID_VALUE);

    // The primary identifier is DELIBERATELY absent from the population descriptor set:
    // src/domain/product/Brand.ts records that no branch of the legacy populate pass admitted a
    // `fieldtype="id"` property, so a request payload could never write a key. Asserting the absence
    // keeps that decision from being quietly reversed.
    const descriptorNames = BRAND_PROPERTY_DESCRIPTORS.properties.map(
      (descriptor) => descriptor.name,
    );
    expect(descriptorNames).not.toContain(BRAND_PRIMARY_ID_PROPERTY_NAME);
  });
});

/* ================================================================================================
 * THE SIX PERSISTENT PROPERTIES — model/entity/Brand.cfc:L52-L57
 *
 * All NET-NEW. No legacy test touched any of them: meta/tests/unit/entity/BrandTest.cfc asserts only
 * the products default, and the three inherited assertions are covered above. Each case is grounded
 * in the line that declares the property, and no default the source does not state is asserted.
 * ============================================================================================== */

/** The five persistent scalars, i.e. every persistent property except the primary identifier. */
type BrandOptionalPersistentPropertyName = Exclude<
  (typeof BRAND_PERSISTENT_PROPERTY_NAMES)[number],
  'brandID'
>;

/**
 * The shared structural expectations for one of the five persistent scalars of
 * `model/entity/Brand.cfc:L53-L57`.
 *
 * Three facts are checked for each, and each is a fact about the LEGACY DECLARATION rather than a
 * convenience:
 *
 *   1. The property is in the entity's declared name space, at the cited line.
 *   2. It has exactly one population descriptor and that descriptor is populate-ENABLED. None of the
 *      five carries `hb_populateEnabled="false"` in the legacy source, so `populateEnabled` must be
 *      absent rather than `false` — `src/domain/base/populate.ts` types it as `false | 'public'`, so
 *      an absent value is the only faithful encoding of "no such attribute was declared".
 *   3. On a freshly constructed Brand THE KEY IS GENUINELY ABSENT, not present-and-undefined. None
 *      of the five declares a `default` attribute — unlike `brandID` at `:L52`, and unlike
 *      `model/entity/Product.cfc:L58` which does declare `default="false"` — so inventing a default
 *      here would be inventing behaviour. `src/domain/product/Brand.ts` achieves the absence with the
 *      `declare` modifier, which emits no class field, reproducing CFML's `variables`-scope
 *      semantics where `structKeyExists(variables, "urlTitle")` is false on a new entity.
 *
 * @param propertyName one of the five persistent scalars
 * @param locator the `model/entity/Brand.cfc` line that declares it
 */
function expectDeclaredOptionalPersistentProperty(
  propertyName: BrandOptionalPersistentPropertyName,
  locator: string,
): void {
  expect(BRAND_DECLARED_PROPERTY_LOCATORS[propertyName]).toBe(locator);

  const descriptors = BRAND_PROPERTY_DESCRIPTORS.properties.filter(
    (descriptor) => descriptor.name === propertyName,
  );
  expect(descriptors).toHaveLength(1);
  expect(descriptors.map((descriptor) => descriptor.populateEnabled)).toEqual([undefined]);
  expect(isBrandPopulateDisabledProperty(propertyName)).toBe(false);

  const brand = new Brand();
  expect(Object.hasOwn(brand, propertyName)).toBe(false);
  expect(propertyName in brand).toBe(false);
}

describe('Brand — the persistent property surface', () => {
  it('NET-NEW — model/entity/Brand.cfc:L52 — brandID is the primary identifier and holds the declared unsaved value on a fresh instance', () => {
    const brand = new Brand();

    // `unsavedvalue=""` and `default=""` are both declared on that line, so the empty string is the
    // source-stated default rather than a convenience. NO IDENTIFIER IS GENERATED HERE: per IR-6 a
    // real key is a 32-character hex string minted by the persistence layer, and `src/util/uuid.ts`
    // owns that. This file neither imports it nor fabricates a value.
    expect(brand.brandID).toBe(BRAND_UNSAVED_ID_VALUE);

    // Unlike the five scalars, the primary identifier IS an emitted own property, because
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
    expectDeclaredOptionalPersistentProperty('activeFlag', 'model/entity/Brand.cfc:L53');

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
    expectDeclaredOptionalPersistentProperty('publishedFlag', 'model/entity/Brand.cfc:L54');

    // The one persistent property in the file carrying no hint at all, and — like activeFlag and
    // unlike model/entity/Product.cfc:L58 — no `default` attribute either.
    const brand = new Brand();
    brand.publishedFlag = true;
    expect(brand.publishedFlag).toBe(true);
    brand.publishedFlag = false;
    expect(brand.publishedFlag).toBe(false);
  });

  it('NET-NEW — model/entity/Brand.cfc:L55 — urlTitle is a declared, populate-enabled string whose uniqueness is enforced outside the entity', () => {
    expectDeclaredOptionalPersistentProperty('urlTitle', 'model/entity/Brand.cfc:L55');

    // That line declares `unique="true"`, and the entity enforces NOTHING: per IR-5 the guard is the
    // application-side existence query of org/Hibachi/HibachiDAO.cfc:L130-L146, reached through the
    // port, in addition to the database column constraint. Assigning a value therefore performs no
    // check of any kind here — the uniqueness rule is exercised through the validator instead.
    const brand = new Brand();
    brand.urlTitle = 'a-brand-url-title';
    expect(brand.urlTitle).toBe('a-brand-url-title');
  });

  it('NET-NEW — model/entity/Brand.cfc:L56 — brandName is a declared, populate-enabled string whose presence is enforced only by validation', () => {
    expectDeclaredOptionalPersistentProperty('brandName', 'model/entity/Brand.cfc:L56');

    // The declaration carries no `required`, no `length` and no `unique` attribute, so there is no
    // schema-level guard behind it — model/validation/Brand.json:L3 is the sole enforcement, which is
    // why the traceable save assertion above depends on it. The entity itself accepts any string.
    const brand = new Brand();
    brand.brandName = 'A Brand Name';
    expect(brand.brandName).toBe('A Brand Name');
  });

  it('NET-NEW — model/entity/Brand.cfc:L57 — brandWebsite is a declared, populate-enabled string and the entity applies no URL formatting', () => {
    expectDeclaredOptionalPersistentProperty('brandWebsite', 'model/entity/Brand.cfc:L57');

    // That line declares `hb_formatType="url"`, and src/domain/product/Brand.ts records why that is a
    // DEAD PATH: the population block that would have consulted it,
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
    expect([...BRAND_DECLARED_PROPERTY_NAMES].sort()).toEqual(
      Object.keys(BRAND_DECLARED_PROPERTY_LOCATORS).sort(),
    );

    // The declared space is the whole legacy declaration — the six scalars, the two one-to-many
    // collections, the six many-to-many inverses, `remoteID` and the four audit properties — and
    // `vendors` at :L70 is the one many-to-many inverse that is NOT populate-disabled, an off-by-one
    // in a block of six near-identical lines that src/domain/product/Brand.ts turns into a
    // compile-checked invariant.
    expect(BRAND_DECLARED_PROPERTY_NAMES).toHaveLength(19);
    expect(isBrandPopulateDisabledProperty('vendors')).toBe(false);
    expect(isBrandPopulateDisabledProperty('physicals')).toBe(true);
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
    // ⚠️ LABELLED NET-NEW ON PURPOSE, AND THE LABEL IS THE POINT. This is the body of the BASE
    // `defaults_are_correct()`:
    //     assert(variables.entity.isNew());
    //     assert(!len(variables.entity.getPrimaryIDValue()));
    // meta/tests/unit/entity/BrandTest.cfc:L58-L60 REPLACES that method, so the legacy Brand run
    // never executed either assertion. Both are satisfiable against the target class and are
    // therefore covered — but claiming them as traceable would imply legacy parity that does not
    // exist, which AAP §0.8.3.7 forbids.
    const brand = new Brand();
    expect(brand.isNew()).toBe(true);
    expect(brand.brandID).toHaveLength(0);
  });
});

/* ================================================================================================
 * THE PRODUCTS RELATIONSHIP — model/entity/Brand.cfc:L61, L98-L103 — AND THE IR-1 MEMBER
 *
 * All NET-NEW. The only legacy assertion touching this relationship is the empty-collection default
 * already covered above; no legacy test ever added, removed or queried a product through a Brand.
 *
 * SCOPE: this is the ONE relationship the AAP row for the Brand entity names, so it is the only one
 * exercised. `attributeValues` (:L60) and the six many-to-many inverses (:L66-L71) reach the
 * attribute, promotion, vendor and physical families, every one of which AAP §0.2.2.1 excludes, and
 * none of them appears below.
 * ============================================================================================== */

describe('Brand — the products relationship and its IR-1 explicit member', () => {
  it('NET-NEW — model/entity/Brand.cfc:L61 — the products collection is a fresh, live, per-instance array', () => {
    const brand = new Brand();
    const relationship: BrandProductsRelationship = brand;

    // The narrow relationship view and the entity hand back the SAME array object. That is the whole
    // basis of the live-array contract: the far side mutates what it is given.
    expect(relationship.getProducts()).toBe(brand.products);
    expect(relationship.getProducts()).toHaveLength(0);
  });

  it('NET-NEW — model/entity/Brand.cfc:L98-L100 — addProduct is a pure delegation to the Product-side setBrand and never appends on its own account', () => {
    // The legacy body is exactly `arguments.product.setBrand(this);` — one statement, no append.
    // A recording double whose setBrand does nothing is therefore the only way to observe the
    // difference between delegating and appending: if Brand pushed independently the collection would
    // grow here, and it must not.
    const brand = new Brand();
    const relationship: BrandProductsRelationship = brand;
    const product = new RecordingProductDouble('00000000000000000000000000000010');

    relationship.addProduct(product);

    // The delegation happened, exactly once, and Brand handed ITSELF across — `this` in the legacy
    // body — which is what makes the product able to maintain both sides.
    expect(product.setBrandCalls).toEqual([brand]);
    expect(product.setBrandCalls[0]).toBe(brand);

    // And Brand did nothing else: no append, so no membership. This is the assertion that pins the
    // direction of the relationship.
    expect(relationship.getProducts()).toHaveLength(0);
    expect(relationship.hasProduct(product)).toBe(false);
    expect(product.removeBrandCalls).toHaveLength(0);
  });

  it('NET-NEW — model/entity/Brand.cfc:L101-L103 — removeProduct is a pure delegation to the Product-side removeBrand', () => {
    // The legacy body is `arguments.Product.removeBrand(this);`. The capital P is a CFML quirk —
    // the `arguments` scope is case-insensitive, so it denoted the same argument the signature
    // declares one line above — and src/domain/product/Brand.ts records the decision to use the
    // declared lower-case spelling, since TypeScript is case-sensitive and nothing observable changes.
    const brand = new Brand();
    const relationship: BrandProductsRelationship = brand;
    const product = new RecordingProductDouble('00000000000000000000000000000011');

    relationship.removeProduct(product);

    expect(product.removeBrandCalls).toEqual([brand]);
    expect(product.removeBrandCalls[0]).toBe(brand);
    expect(product.setBrandCalls).toHaveLength(0);

    // Brand did not touch its own collection, and removing a product that was never added is not an
    // error — the legacy body guards with `if(index > 0)` at model/entity/Product.cfc:L672-L674.
    expect(relationship.getProducts()).toHaveLength(0);
  });

  it('NET-NEW — model/entity/Product.cfc:L661-L666 — a relationship-maintaining Product appends itself into Brand live array, and hasProduct then reports membership', () => {
    const brand = new Brand();
    const relationship: BrandProductsRelationship = brand;
    const liveCollection = relationship.getProducts();
    const product = new RelationshipMaintainingProductDouble('00000000000000000000000000000012');

    relationship.addProduct(product);

    // The back-reference from model/entity/Product.cfc:L662.
    expect(product.brand).toBe(brand);

    // The append from :L664 landed in the very array Brand had already handed out, which is what a
    // defensive copy in getProducts() would have broken silently.
    expect(liveCollection).toEqual([product]);
    expect(relationship.getProducts()).toBe(liveCollection);
    expect(brand.getProducts()).toHaveLength(1);

    // IR-1: `hasProduct` has no declaration anywhere in model/entity/Brand.cfc — the CFML ORM
    // fabricated it from `singularname="product"` at :L61 — and it is an explicit typed member in the
    // port. model/entity/Product.cfc:L663 depends on it, so it is mandatory rather than convenient.
    expect(relationship.hasProduct(product)).toBe(true);
  });

  it('NET-NEW — model/entity/Product.cfc:L662-L664 — the Product-side duplicate guard means a saved product is not appended twice', () => {
    const brand = new Brand();
    const relationship: BrandProductsRelationship = brand;

    // A SAVED product — its identifier is not the unsaved value — so the `isNew() or` arm of the
    // legacy guard is false and the `!hasProduct(this)` arm decides. That is the only configuration in
    // which the guard is observable.
    const savedProduct = new RelationshipMaintainingProductDouble(
      '00000000000000000000000000000013',
    );

    relationship.addProduct(savedProduct);
    relationship.addProduct(savedProduct);

    expect(relationship.getProducts()).toEqual([savedProduct]);
    expect(relationship.hasProduct(savedProduct)).toBe(true);
  });

  it('NET-NEW — model/entity/Product.cfc:L662-L664 — an unsaved product appends unconditionally, because the isNew arm short-circuits the guard', () => {
    const brand = new Brand();
    const relationship: BrandProductsRelationship = brand;

    // An UNSAVED product carries the unsaved identifier value, so `isNew()` is true, the OR
    // short-circuits and `hasProduct` is never consulted. The legacy consequence is that the same
    // unsaved instance appends twice — carried across as observed behaviour rather than repaired,
    // because AAP §0.8.2 Guideline 4 forbids improving business logic during the port.
    const unsavedProduct = new RelationshipMaintainingProductDouble(BRAND_UNSAVED_ID_VALUE);

    relationship.addProduct(unsavedProduct);
    relationship.addProduct(unsavedProduct);

    expect(relationship.getProducts()).toEqual([unsavedProduct, unsavedProduct]);
    expect(relationship.hasProduct(unsavedProduct)).toBe(true);
  });

  it('NET-NEW — model/entity/Product.cfc:L667-L676 — a relationship-maintaining Product splices itself out of Brand live array and drops its back-reference', () => {
    const brand = new Brand();
    const relationship: BrandProductsRelationship = brand;
    const liveCollection = relationship.getProducts();
    const first = new RelationshipMaintainingProductDouble('00000000000000000000000000000014');
    const second = new RelationshipMaintainingProductDouble('00000000000000000000000000000015');

    relationship.addProduct(first);
    relationship.addProduct(second);
    expect(liveCollection).toEqual([first, second]);

    relationship.removeProduct(first);

    // Spliced out of the same live array, leaving the other member untouched and in place.
    expect(liveCollection).toEqual([second]);
    expect(relationship.getProducts()).toBe(liveCollection);
    expect(relationship.hasProduct(first)).toBe(false);
    expect(relationship.hasProduct(second)).toBe(true);

    // model/entity/Product.cfc:L675 is `structDelete(variables, "brand")`, so the back-reference is
    // DELETED rather than set to a sentinel — the same absence-means-absence semantic the persistent
    // scalars follow.
    expect(first.brand).toBeUndefined();
    expect(second.brand).toBe(brand);
  });

  it('NET-NEW — IR-1 — hasProduct matches by object identity, not by product identifier', () => {
    const brand = new Brand();
    const relationship: BrandProductsRelationship = brand;

    // Two DISTINCT instances that agree on their identifier. src/domain/product/Brand.ts implements
    // membership with `Array.prototype.includes`, whose SameValueZero comparison is reference equality
    // for objects — the faithful analogue of `arrayFind(arguments.brand.getProducts(), this)` at
    // model/entity/Product.cfc:L672, which locates THE SAME INSTANCE. A comparison by `productID`
    // would be a different predicate and would answer differently here.
    const sharedIdentifier = '00000000000000000000000000000016';
    const member = new RelationshipMaintainingProductDouble(sharedIdentifier);
    const twin = new RelationshipMaintainingProductDouble(sharedIdentifier);

    relationship.addProduct(member);

    expect(member.productID).toBe(twin.productID);
    expect(relationship.hasProduct(member)).toBe(true);
    expect(relationship.hasProduct(twin)).toBe(false);
  });
});

/* ================================================================================================
 * VALIDATION AND ERROR BEHAVIOUR — model/validation/Brand.json
 *
 * All NET-NEW. The one legacy assertion in this area — validate-as-save fails for a new instance — is
 * covered as TRACEABLE above; nothing legacy ever asserted a specific key, a specific message, the
 * delete context, or the shape of the error bag.
 *
 * The rules are NOT restated here. `brandValidationRules` is imported exactly as
 * `src/validation/rules/brand.rules.ts` publishes it, so these cases observe the real transliteration
 * of the source document rather than a local paraphrase of it.
 * ============================================================================================== */

describe('Brand — validation and error behaviour', () => {
  it('NET-NEW — model/validation/Brand.json:L5 — both urlTitle constraints report under one key, because the engine does not short-circuit', async () => {
    // That line declares `{"contexts":"save","required":true,"unique":true}` — two constraints on one
    // property. On a fresh Brand `urlTitle` is absent, so `required` fails; with the port answering
    // "not unique", `unique` fails too. org/Hibachi/HibachiValidationService.cfc accumulates rather
    // than stopping at the first failure, which is precisely why the bag's values are ARRAYS.
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

    // org/Hibachi/HibachiValidationService.cfc:L226 composes the data-type key with BOTH the
    // constraint type and its value, which is why this key ends in `.dataType.url` where the presence
    // and uniqueness keys end in the constraint type alone.
    expect(errors.getErrors()).toEqual({
      brandWebsite: ['validate.save.Brand.brandWebsite.dataType.url'],
    });
  });

  it('NET-NEW — model/validation/Brand.json:L6 — the products delete guard is live and fires for a Brand carrying a product', async () => {
    const brand = new Brand();
    const relationship: BrandProductsRelationship = brand;

    // An empty Brand is deletable: `maxCollection: 0` passes on a collection of length zero.
    const empty = await validateBrand(brand, 'delete');
    expect(empty.errors.hasErrors()).toBe(false);
    expect(empty.errors.getErrors()).toEqual({});

    // Attaching one product through the real relationship makes it undeletable. This is the guard that
    // exists because model/entity/Brand.cfc:L61 declares NO cascade, so deleting a brand never
    // cascaded to its products — unlike `attributeValues` at :L60, which declares
    // `cascade="all-delete-orphan"` and consequently needs no guard.
    relationship.addProduct(
      new RelationshipMaintainingProductDouble('00000000000000000000000000000020'),
    );

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
    const relationship: BrandProductsRelationship = brand;
    relationship.addProduct(
      new RelationshipMaintainingProductDouble('00000000000000000000000000000021'),
    );

    const { errors } = await validateBrand(brand, 'delete');

    // org/Hibachi/HibachiValidationService.cfc:L171 SKIPS a rule whose property the subject does not
    // carry — silently, not as a failure — so the fifth Brand rule never produces a key. The
    // transliteration keeps the rule rather than deleting it, so the document's own content stays
    // legible; inertness is preserved, not repaired.
    expect(errors.hasError(UNDECLARED_PHYSICAL_COUNTS_IDENTIFIER)).toBe(false);
    expect(Object.keys(errors.getErrors())).toEqual(['products']);

    // The key the rule WOULD have produced is absent from the bag entirely.
    expect(Object.keys(errors.getErrors())).not.toContain(UNDECLARED_PHYSICAL_COUNTS_IDENTIFIER);
  });

  it('NET-NEW — org/Hibachi/HibachiTransient.cfc:L35-L45 — an absent error key yields an empty array and never throws', () => {
    const errors = new ValidationError();

    // The legacy accessor checks for the key first and returns an empty array when it is missing.
    // ⚠️ The retired framework carried a SECOND, defective variant of this accessor that raised
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
    // resolved object IS the subject. Asserted directly against the exported resolver.
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
