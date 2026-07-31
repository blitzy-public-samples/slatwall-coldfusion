/**
 * Brand domain tests — TRACEABLE.
 *
 * PROVENANCE
 * This suite is traceable to two legacy MXUnit components and to nothing else:
 *
 *   - `meta/tests/unit/entity/BrandTest.cfc:L52-L60` — the whole of Brand's own legacy test body.
 *     `setUp()` at `:L52-L56` calls `super.setup()` and then
 *     `variables.entity = request.slatwallScope.getService("brandService").newBrand();`, and
 *     `defaults_are_correct()` at `:L58-L60` is a single assertion,
 *     `assertEquals(variables.entity.getProducts(), []);`.
 *   - `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L51-L62` — the assertions Brand INHERITS,
 *     namely `validate_as_save_for_a_new_instance_doesnt_pass()` at `:L51-L54`,
 *     `simple_representation_exists_and_is_simple()` at `:L56-L58` and
 *     `has_primary_id_property_name()` at `:L60-L62`.
 *
 * THE BASE `defaults_are_correct()` IS NOT INHERITED BY BRAND. The base declares its own version at
 * `meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L64-L67` (`assert(entity.isNew())` and
 * `assert(!len(entity.getPrimaryIDValue()))`), and `meta/tests/unit/entity/BrandTest.cfc:L58-L60`
 * REPLACES it — CFML method overriding, not augmentation. The legacy Brand run therefore executed the
 * overriding empty-products assertion plus exactly THREE inherited assertions, and AAP §0.6.5.1 counts
 * Brand's coverage that way. The base version's own two assertions are still meaningful against the
 * target class, so they ARE covered here — but as NET-NEW, never as traceable, because
 * `BrandTest.cfc` never ran them.
 *
 * TRACEABILITY IS DOCUMENTARY, NOT EMPIRICAL
 * The legacy suite cannot be executed in this environment, so no legacy result was observed and no
 * output was compared: MXUnit is not vendored — `meta/tests/readme.txt:L4` requires it to be
 * installed with a mapping inside CFIDE, and `meta/tests/unit/SlatwallUnitTestBase.cfc:L49` extends
 * `mxunit.framework.TestCase`, which is consequently unresolvable — CFSelenium is not vendored either
 * (`meta/tests/readme.txt:L5`), and there is no CFML engine and no local runtime definition to bring
 * one up (AAP §0.8.4.1). Every mapping below rests on the cited legacy source locators rather than on
 * a re-run comparison, which is a weaker claim and is stated rather than implied away, as AAP §0.6.5.3
 * and §0.8.4.2 require.
 *
 * THE STRUCTURAL TRANSLATION: LEGACY INTEGRATION TEST -> TARGET UNIT TEST
 * The two suites differ in kind by design (AAP §0.4.3.6). The legacy fixture booted the entire
 * application: `meta/tests/unit/SlatwallUnitTestBase.cfc:L51-L56` instantiates
 * `Slatwall.Application`, `:L59-L66` calls `bootstrap()` and promotes the request account to
 * super-user, and only then does `meta/tests/unit/entity/BrandTest.cfc:L55` reach the entity —
 * through a string-keyed DI/1 lookup, `getService("brandService")`, calling the
 * `onMissingMethod`-synthesized `newBrand()` of `org/Hibachi/HibachiService.cfc:L255-L281`. Every
 * legacy assertion was therefore an integration assertion over a live ORM session.
 *
 * The target fixture is `new Brand()`. Nothing is bootstrapped, no container is built, no service is
 * resolved, no connection is opened and no environment variable is read.
 *
 * OF THE THREE LEGACY FRAMEWORK MEMBERS THE INHERITED ASSERTIONS CALLED, ONE IS GONE AND TWO ARE BACK:
 *   `validate` / `hasErrors`      GONE from the entity. AAP §0.8.3.2 retires `org/Hibachi/**` for this
 *                                 slice rather than porting it, so validation moved out to
 *                                 `src/validation/Validator.ts` driving `brand.rules.ts`.
 *   `getSimpleRepresentation`     ⭐ PRESENT. `model/entity/Brand.cfc:L157-L159` is empty, so Brand
 *                                 overrode nothing and INHERITED the framework default — a naming
 *                                 convention at `org/Hibachi/HibachiEntity.cfc:L59-L88`. IR-1 makes
 *                                 an inherited member the slice depends on an explicit declaration,
 *                                 so `src/domain/product/Brand.ts` now declares the default itself
 *                                 and the case below CALLS IT. An earlier revision reproduced the
 *                                 convention in two test-local helpers and asserted against those,
 *                                 which is documentary rather than traceable; F22 named that gap and
 *                                 the helpers are gone.
 *   `getPrimaryIDPropertyName`    ⭐ PRESENT. It is one of the seven managed-entity members
 *                                 `src/domain/product/Brand.ts` now declares explicitly under IR-1,
 *                                 because `src/validation/Validator.ts` and
 *                                 `src/ports/UniquePropertyPort.ts` require them BY NAME. An earlier
 *                                 revision of this file recorded it as absent and asserted a
 *                                 test-local literal in its place; the case below now calls the real
 *                                 member, which is what F22 asks for.
 *
 * Each inherited assertion below is re-expressed against the layer that now owns the behaviour, and
 * the re-expression is named at the case that performs it.
 *
 * WHAT IS EXERCISED FOR REAL: the actual `Brand` class, the actual `Product` class, the actual
 * `Validator`, the actual transliterated `brand.rules.ts` rule set and the actual `ValidationError`
 * bag. Nothing about the code under test is re-implemented here.
 *
 * ⚠️ THE PRODUCT SIDE IS THE REAL `Product`, NOT A COPY OF IT — AND THAT IS LOAD-BEARING. Every case
 * below that makes a claim about Product-side behaviour — the append into Brand's live array, the
 * duplicate guard, the unsaved short-circuit, the splice-out and the back-reference delete —
 * constructs `new Product()` and calls the real `setBrand` / `removeBrand` / `isNew`. A regression in
 * `src/domain/product/Product.ts` therefore FAILS this suite. Reproducing those three bodies inside a
 * test double would have made the same assertions pass against test-local code while the production
 * implementation rotted unobserved, so no double reproduces them.
 *
 * The one collaborator that genuinely sits outside this slice is the uniqueness port, supplied as a
 * narrow typed double declared in this file. The suite also declares ONE Product-derived recorder,
 * {@link RecordingProductDouble}, whose sole purpose is to make Brand's PURE DELEGATION observable:
 * it is a real `Product` subclass that records the delegated call and deliberately declines to
 * maintain the relationship, which is the only way to prove Brand never appends on its own account.
 * It overrides two methods and reimplements neither.
 *
 * AAP §0.4.3.6 records that the legacy repository ships NO mocking library and that the target suite
 * substitutes plain doubles instead. `jest.mock` is not used, the module registry is not touched, and
 * no third-party mocking package is introduced.
 *
 * COVERAGE COMPLETENESS AND THE BOUNDARY STATEMENT
 * PERSISTENT + PRODUCTS COVERAGE IS COMPLETE FOR THIS SLICE, AND NO BOUNDARY STUB IS NEEDED. Brand
 * declares ZERO non-persistent properties — `model/entity/Brand.cfc:L83-L85`, the entity's
 * "Non-Persistent Property Methods" section, is a START banner, a blank line and an END banner — so
 * the calculated-property boundary of AAP §0.2.2.6 that forces `Product` and `Sku` to exclude
 * pricing, promotion, inventory and currency members does not arise here. There is nothing to stub,
 * and no fake non-persistent member is invented in order to have a boundary to test. Covering the six
 * persistent properties at `model/entity/Brand.cfc:L52-L57` and the `products` relationship at `:L61`
 * is the whole of the assigned surface.
 *
 * SCOPE HELD DELIBERATELY NARROW. `model/entity/Brand.cfc` also declares `attributeValues` (`:L60`)
 * and six many-to-many-inverse collections (`:L66-L71`) reaching the promotion, vendor and physical
 * families, every one of which AAP §0.2.2.1 excludes. The AAP row for the Brand entity names "Six
 * persistent properties and the products relationship", so only the `products` relationship is
 * exercised below: no promotion, vendor, physical, attribute, pricing or currency behaviour is pulled
 * into this file, and no service is constructed.
 *
 * Every case below carries an explicit TRACEABLE or NET-NEW label, every literal is read from a cited
 * legacy line, and the enterprise standards of AAP §0.7.3 govern — in a test file the ones with teeth
 * are strict type safety (no `any`, no unsafe cast, no non-null assertion, no suppression comment)
 * and preserve-and-annotate rather than repair.
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

/* ================================================================================================
 * SOURCE-GROUNDED CONSTANTS
 * Every value here is read from a cited legacy line. Nothing is invented: no UUID is generated, no
 * timing or capacity figure appears, and no coverage threshold is asserted.
 * ============================================================================================== */

/* ------------------------------------------------------------------------------------------------
 * F22 — THE THREE IDENTITY CONSTANTS ARE IMPORTED FROM PRODUCTION, NOT RESTATED HERE
 * ------------------------------------------------------------------------------------------------
 * `BRAND_CLASS_NAME` (`'Brand'`, `org/Hibachi/HibachiObject.cfc:L135-L137` over
 * `model/entity/Brand.cfc:L49`), `BRAND_ENTITY_NAME` (`'SlatwallBrand'`, the `entityname` attribute at
 * `:L49`, read by `org/Hibachi/HibachiDAO.cfc:L136`) and `BRAND_PRIMARY_ID_PROPERTY_NAME`
 * (`'brandID'`, the file's only `fieldtype="id"` declaration at `:L52`) now arrive from
 * `src/domain/product/Brand.ts` through the import above.
 *
 * ⭐ AN EARLIER REVISION DECLARED ALL THREE AS TEST-LOCAL LITERALS, and that is precisely what made
 * the two inherited assertions below non-traceable: a case that asserts a literal it declared itself
 * exercises the test file, not the code under test, and would keep passing after the production value
 * diverged. Importing them means a change in the entity FAILS these cases, which is the only
 * arrangement under which the `TRACEABLE` label is honest.
 *
 * The compile-checked-literal technique the local declaration used — `Extract<BrandPropertyName,
 * 'brandID'>` — is not lost either; it moved to where it belongs. `BRAND_DECLARED_PROPERTIES` is
 * annotated `DeclaredPropertyNameSet<BrandPropertyName>` in production, which checks the entire
 * declared set against the property-name union in BOTH directions rather than one name in one.
 * ---------------------------------------------------------------------------------------------- */

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
 * The declared property names in legacy declaration order.
 *
 * ⭐ F22 — DERIVED FROM THE PRODUCTION SET `BRAND_DECLARED_PROPERTIES`, not from the locator map
 * above. This is the same correction the identity constants got: `hasProperty` is answered in
 * production from that set, so a list built here from a different source could agree with the
 * locator map while disagreeing with the code under test. The locator map keeps its own job — it
 * pins each name to the legacy line that declares it, which the production set does not record — and
 * the case below asserts the two agree, so drift in either direction fails rather than hides.
 *
 * Typed as strings rather than as the union because the only consumer is a string comparison — the
 * property-existence predicate — and narrowing it further would add nothing.
 */
const BRAND_DECLARED_PROPERTY_NAMES: readonly string[] = Object.keys(BRAND_DECLARED_PROPERTIES);

/* ================================================================================================
 * THE PRODUCT-SIDE COLLABORATOR — THE REAL `Product`, PLUS ONE `Product` SUBCLASS THAT RECORDS
 *
 * There is deliberately no structural stand-in for `Product` here, and no local re-implementation of
 * any Product member. `src/domain/product/Brand.ts` types all four of its product members over the
 * concrete `Product` class — `products: Product[]`, `getProducts(): Product[]`,
 * `hasProduct(product: Product)`, `addProduct(product: Product)`, `removeProduct(product: Product)` —
 * so the concrete class is what the contract asks for and the concrete class is what is supplied.
 *
 * WHY THIS MATTERS RATHER THAN BEING A STYLE PREFERENCE. Brand's two mutators are pure delegations:
 * `addProduct` is `product.setBrand(this)` and `removeProduct` is `product.removeBrand(this)`, so
 * every observable effect on the relationship is produced by the PRODUCT side. A test double that
 * reproduced `setBrand`, `removeBrand` and `isNew` would therefore be asserting against test-local
 * code: the cases would keep passing while the real `src/domain/product/Product.ts` bodies regressed,
 * because nothing would import them. Constructing `new Product()` is what makes the append, the
 * duplicate guard, the unsaved short-circuit, the splice-out and the back-reference delete genuinely
 * covered, and it is available at zero cost — `Product` takes no constructor arguments, performs no
 * I/O and needs no container, exactly like `Brand`.
 *
 * WHY THERE IS NO CIRCULAR-IMPORT PROBLEM: `Brand.ts` and `Product.ts` reference each other with
 * `import type` only, so neither carries a runtime edge to the other and importing both here is
 * ordinary.
 *
 * The unsaved/saved distinction the guard turns on is expressed through the identifier itself, never
 * through a stubbed predicate: `model/entity/Product.cfc:L52` declares
 * `property name="productID" ... fieldtype="id" unsavedvalue="" default=""`, and
 * `src/domain/product/Product.ts` initialises the field to that same unsaved value — so a freshly
 * constructed `Product` is new, and assigning an identifier makes it saved. No identifier is
 * generated anywhere in this file (IR-6).
 * ============================================================================================== */

/**
 * Identifiers assigned to saved `Product` instances, so the cases that need the `!hasProduct(this)`
 * arm of the Product-side guard to decide can get there.
 *
 * These are opaque test inputs, not seeded data: they are 32-character lowercase-hex strings purely
 * so they have the SHAPE `model/entity/Product.cfc:L52` declares (`ormtype="string" length="32"`,
 * generated by `createSlatwallUUID()` — never dashed, never upper case). They are written out
 * literally rather than generated, because nothing in this file may call a UUID generator, and each
 * is distinct so no two collaborators are accidentally interchangeable.
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
 * Builds a SAVED real `Product` — one whose identifier is no longer the unsaved value, so
 * `Product.isNew()` is false and the Product-side duplicate guard is decided by `hasProduct`.
 *
 * The real `isNew()` at `src/domain/product/Product.ts` is `productID === ''`, the port of the
 * `unsavedvalue=""` declaration at `model/entity/Product.cfc:L52`. Assigning the identifier is
 * therefore the whole of "saving" for the purposes of that predicate — no persistence, no repository
 * and no service is involved — and the predicate itself is never stubbed.
 *
 * @param productID the identifier to assign
 * @returns a real `Product` for which `isNew()` returns false
 */
function createSavedProduct(productID: string): Product {
  const product = new Product();
  product.productID = productID;
  return product;
}

/**
 * A real `Product` that RECORDS the calls Brand delegates to it and deliberately declines to
 * maintain the relationship.
 *
 * WHY A SUBCLASS RATHER THAN A SEPARATE SHAPE. `Brand.addProduct` and `Brand.removeProduct` are pure
 * delegations — `model/entity/Brand.cfc:L98-L100` is exactly `arguments.product.setBrand(this);` and
 * `:L101-L103` exactly `arguments.Product.removeBrand(this);` — and the only way to observe the
 * difference between DELEGATING and APPENDING is a collaborator whose `setBrand` does not append: if
 * Brand pushed on its own account the collection would still grow, and it must not. Extending
 * `Product` keeps that recorder a genuine `Product`, so it satisfies Brand's declared parameter type
 * by inheritance instead of by a widened structural view, and every member the recorder does not
 * override is the real one.
 *
 * The two overrides are RECORDERS, not reimplementations: neither reproduces any part of the real
 * body, so nothing about Product's relationship logic is duplicated here. The cases that assert
 * Product-side behaviour use plain `new Product()` instances and never this class.
 *
 * `override` is mandatory — the subtree compiles with `noImplicitOverride` — and it is also a useful
 * guard: were either member renamed or removed upstream, this class would stop compiling rather than
 * silently start recording nothing.
 *
 * No mocking library is used: the recording is two plain arrays, and `jest.fn` is deliberately
 * avoided as well so the recorder reads as ordinary code and carries no framework coupling.
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
   * The parameter stays OPTIONAL so this override remains assignable to the real
   * `removeBrand(brand?: Brand)`, whose argument `model/entity/Product.cfc:L668` declares without
   * `required`. `Brand.removeProduct` always passes itself, so the absent-argument form is
   * unreachable from this suite; the presence check exists only to keep the override honest about the
   * signature, and no behaviour is invented for a call this file never makes.
   *
   * @param brand the brand Brand handed across — `this` in `model/entity/Brand.cfc:L102`
   */
  public override removeBrand(brand?: Brand): void {
    if (brand !== undefined) {
      this.removeBrandCalls.push(brand);
    }
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

interface RecordedUniquenessCheck {
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
 * unique and therefore savable. The `propertyName` each check records is the TRAILING SEGMENT of the
 * property identifier the port receives, per `org/Hibachi/HibachiDAO.cfc:L131`, not a dotted path.
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
 * `src/domain/product/Brand.ts` deliberately declares no `validate` and no `hasErrors`: AAP §0.8.3.2
 * retires `org/Hibachi/**` for this slice, so the dispatch that once lived on the entity now lives in
 * `src/validation/Validator.ts`. The adapter is the seam that replaced the entity method.
 *
 * ⚠️ WHAT CHANGED, AND WHY THE ADAPTER IS NOW A PURE DELEGATION. `getClassName` and `hasProperty` ARE
 * declared on the entity — they are two of the seven managed-entity members IR-1 requires, alongside
 * the five the uniqueness port reads. An earlier revision of this file asserted the opposite and
 * reimplemented all seven here, quoting `brand.rules.ts` to the effect that "forcing those two
 * members onto the entity would push framework machinery back into the domain layer". That reasoning
 * does not survive contact with the contracts: `ValidationSubject` requires `getClassName` and
 * `hasProperty` by name, `UniquePropertyEntity` requires the other five, and a `Brand` lacking them
 * cannot be validated or uniqueness-checked at all — which is finding F05. Declaring the seven is not
 * a return of framework machinery; it is the explicit form of members every legacy entity INHERITED,
 * which is exactly what IR-1 and TR-3 prescribe.
 *
 * WHAT REMAINS OF THE ADAPTER IS THEREFORE SHAPE, NOT BEHAVIOUR: the seven members are bound to the
 * real instance, and the four rule-read fields below are attached as data because the rule set reads
 * them positionally. Every decision is made by the real engine over the real rule set.
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
    /*
     * --- ALL SEVEN MANAGED MEMBERS DELEGATE TO THE REAL ENTITY (F22) --------------------------
     * Every one is bound straight to the `Brand` instance, so the production implementations — and
     * the production constants behind them — are what the engine and the uniqueness port actually
     * call. An earlier revision reimplemented all seven inside this factory; that made the adapter a
     * SECOND implementation of the contract, which is the one thing a test double must never be,
     * because the case then passes on the strength of the double rather than of the code.
     *
     * `getValueByPropertyIdentifier` is the clearest illustration. It was a five-arm `switch`
     * returning `undefined` by default; the production member is
     * `readValueByPropertyIdentifier(this, …)`, which walks `.`/`_`-delimited paths and returns `''`
     * rather than `undefined` on every failure path, per
     * `org/Hibachi/HibachiTransient.cfc:L466-L481`. The two disagreed on both the traversal and the
     * miss value, and only the production one matches the legacy.
     */
    getClassName: (): string => brand.getClassName(),
    hasProperty: (propertyIdentifier: string): boolean => brand.hasProperty(propertyIdentifier),
    getPropertyMetaData: (propertyName: string) => brand.getPropertyMetaData(propertyName),
    getEntityName: (): string => brand.getEntityName(),
    getPrimaryIDValue: (): string => brand.getPrimaryIDValue(),
    getPrimaryIDPropertyName: (): string => brand.getPrimaryIDPropertyName(),
    getValueByPropertyIdentifier: (propertyIdentifier: string): unknown =>
      brand.getValueByPropertyIdentifier(propertyIdentifier),

    // --- the four members the five Brand rules read, absence preserved --------------------------
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
 * Nothing about the rules is restated here: `brandValidationRules` is imported as it stands, so a
 * change to `model/validation/Brand.json`'s transliteration is observed by these cases rather than
 * shadowed by a local copy.
 *
 * @param brand the entity to validate
 * @param context the validation context — `save` and `delete` are the only two
 *   `model/validation/Brand.json` declares. Typed as the closed `ValidationContext` union rather
 *   than `string`, which is what makes the `:L162` bypass values unrepresentable here too: a case
 *   asserting that `'false'` skips validation could not be written even by accident.
 * @param unique the verdict the uniqueness port returns; `true` means unique and therefore savable
 * @returns the error bag the engine returned, plus every uniqueness check it performed
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
    //
    // ⭐ F22 — IT IS ASSERTED THROUGH THE REAL MEMBERS ON A REAL INSTANCE, which is what makes the
    // TRACEABLE label honest. model/entity/Brand.cfc:L157-L159 is empty, so Brand overrode neither
    // getSimpleRepresentation() nor getSimpleRepresentationPropertyName() and BOTH resolved through
    // inheritance from org/Hibachi/HibachiEntity.cfc. IR-1 requires an inherited member the slice
    // depends on to be declared explicitly, so src/domain/product/Brand.ts now declares the
    // framework default itself and this case calls it. An earlier revision of this file reproduced
    // the convention in two test-local helper functions and asserted against those, which is a
    // DOCUMENTARY claim about the legacy rather than a traceable exercise of production behaviour —
    // precisely the gap F22 named.
    const subject = new Brand();

    // The convention resolves to exactly one declared property, so org/Hibachi/HibachiEntity.cfc:L74
    // is deterministic for this entity — and it is the ENTITY that resolves it, not this file.
    expect(subject.getSimpleRepresentationPropertyName()).toBe('brandName');

    // The resolved name is a member of the declared property space, so the convention cannot drift
    // away from the entity's own declarations without this failing.
    expect(BRAND_DECLARED_PROPERTY_NAMES).toContain(subject.getSimpleRepresentationPropertyName());

    // The representation of a freshly constructed Brand is a SIMPLE value: `brandName` is absent, so
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
    // reading the property the entity itself names reproduces the representation exactly.
    const named = subject.getSimpleRepresentationPropertyName();
    expect(named).toBe('brandName');
    expect(subject.brandName).toBe(populatedRepresentation);
  });

  it('TRACEABLE — meta/tests/unit/entity/SlatwallEntityTestBase.cfc:L60-L62 — a non-empty primary-ID property name exists, and it identifies brandID', () => {
    // The legacy body is `assert(len(variables.entity.getPrimaryIDPropertyName()))` — an assertion
    // about LENGTH, so the non-emptiness is asserted first and in its own right.
    //
    // ⭐ F22 — IT IS ASSERTED THROUGH THE REAL MEMBER ON A REAL INSTANCE, which is what makes the
    // TRACEABLE label honest. `Brand.getPrimaryIDPropertyName()` is the explicit declaration of the
    // member the legacy inherited from org/Hibachi/HibachiEntity.cfc:L249-L251, so this line
    // reproduces the legacy call shape rather than inspecting a constant.
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
 *      absent rather than `false` — `src/domain/base/populate.ts` types an enabled descriptor's
 *      `populateEnabled` as `'public' | undefined` and routes the `false` value to its separate
 *      `DisabledPropertyDescriptor` shape, so an absent value is the only faithful encoding of "no
 *      such attribute was declared".
 *   3. It declares the value type its legacy `ormtype` states, which is what stops a JSON boolean
 *      from being written into it as the truthy string `'false'`. See the coercion cases below.
 *   4. On a freshly constructed Brand THE KEY IS GENUINELY ABSENT, not present-and-undefined. None
 *      of the five declares a `default` attribute — unlike `brandID` at `:L52`, and unlike
 *      `model/entity/Product.cfc:L58` which does declare `default="false"` — so inventing a default
 *      here would be inventing behaviour. `src/domain/product/Brand.ts` achieves the absence with the
 *      `declare` modifier, which emits no class field, reproducing CFML's `variables`-scope
 *      semantics where `structKeyExists(variables, "urlTitle")` is false on a new entity.
 *
 * @param propertyName one of the five persistent scalars
 * @param locator the `model/entity/Brand.cfc` line that declares it
 * @param valueType the `ormtype` that same line declares
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

    // That line declares `unique="true"`, and the entity enforces NOTHING: per IR-5 the guard is the
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

    // ⭐ THIS COMPARISON IS NOW A REAL CROSS-SOURCE CHECK RATHER THAN A TAUTOLOGY.
    // BRAND_DECLARED_PROPERTY_NAMES is derived from the PRODUCTION set BRAND_DECLARED_PROPERTIES,
    // while BRAND_DECLARED_PROPERTY_LOCATORS is this file's own record of which legacy line declares
    // each name. Before that change both sides came from the locator map, so the assertion compared a
    // value with itself and could never fail. It now fails if the entity's declared set and the
    // legacy-line record disagree in either direction, which is the drift worth catching: the set
    // decides what hasProperty answers, and a name silently dropped from it silently disables a
    // validation rule at org/Hibachi/HibachiValidationService.cfc:L171.
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

  it('NET-NEW — IR-1 — the four remaining managed-entity members answer from the real entity, including the raise and the empty-string miss', () => {
    const brand = new Brand();

    // getClassName — org/Hibachi/HibachiObject.cfc:L135-L137, the last dot-delimited segment of the
    // component name. It is what org/Hibachi/HibachiValidationService.cfc:L202 interpolates into
    // every message key, so a prefixed value here would change observable message text.
    expect(brand.getClassName()).toBe(BRAND_CLASS_NAME);
    expect(brand.getClassName()).toBe('Brand');

    // getEntityName — the `entityname` attribute at model/entity/Brand.cfc:L49, read at runtime by
    // org/Hibachi/HibachiEntity.cfc:L287-L289. DELIBERATELY DIFFERENT from the class name: the
    // uniqueness statement at org/Hibachi/HibachiDAO.cfc:L140 is expressed over the mapped object
    // graph, so the `Slatwall` prefix belongs there and is not a defect to correct.
    expect(brand.getEntityName()).toBe(BRAND_ENTITY_NAME);
    expect(brand.getEntityName()).not.toBe(brand.getClassName());

    // hasProperty answers TRUE for every declared name and FALSE for an undeclared one —
    // org/Hibachi/HibachiTransient.cfc:L763-L765, `structKeyExists(getPropertiesStruct(), name)`.
    for (const propertyName of BRAND_DECLARED_PROPERTY_NAMES) {
      expect(brand.hasProperty(propertyName)).toBe(true);
    }
    expect(brand.hasProperty(UNDECLARED_PHYSICAL_COUNTS_IDENTIFIER)).toBe(false);

    // getPropertyMetaData resolves a declared name and RAISES for an undeclared one, because
    // org/Hibachi/HibachiTransient.cfc:L738-L747 returns the struct entry when present and throws at
    // :L746 otherwise. The non-optional return type is faithful to that declaration, so the raise is
    // part of the contract rather than a defensive extra.
    expect(brand.getPropertyMetaData(BRAND_PRIMARY_ID_PROPERTY_NAME)).toEqual({ name: 'brandID' });
    expect(() => brand.getPropertyMetaData(UNDECLARED_PHYSICAL_COUNTS_IDENTIFIER)).toThrow(
      `No property found with name ${UNDECLARED_PHYSICAL_COUNTS_IDENTIFIER} in Brand`,
    );

    // getValueByPropertyIdentifier reads a declared value, and yields '' — NEVER undefined — on every
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
    // LABELLED NET-NEW ON PURPOSE, AND THE LABEL IS THE POINT. This is the body of the BASE
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

    // The accessor and the field hand back the SAME array object. That is the whole basis of the
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

    // The delegation happened, exactly once, and Brand handed ITSELF across — `this` in the legacy
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

  /* ----------------------------------------------------------------------------------------------
   * THE PRODUCT-SIDE BODIES, EXERCISED THROUGH THE REAL `Product`
   *
   * Every case below runs the actual `src/domain/product/Product.ts` implementations of `setBrand`,
   * `removeBrand` and `isNew` — reached through Brand's own delegating members, which is how a
   * caller reaches them in production. Nothing is reimplemented locally, so a regression in any of
   * those three bodies fails these cases.
   * -------------------------------------------------------------------------------------------- */

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

    // A SAVED product — its identifier is no longer the unsaved value — so the `isNew() or` arm of
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

    // An UNSAVED product is simply a freshly constructed one: src/domain/product/Product.ts
    // initialises `productID` to the `unsavedvalue=""` of model/entity/Product.cfc:L52, so `isNew()`
    // is true with nothing assigned and no identifier is generated (IR-6). Product's unsaved value is
    // its own — asserted against the real instance rather than borrowed from the Brand constant,
    // because the two entities declare it independently.
    const unsavedProduct = new Product();
    expect(unsavedProduct.productID).toHaveLength(0);
    expect(unsavedProduct.isNew()).toBe(true);

    // The OR short-circuits, so `hasProduct` is never consulted. The legacy consequence is that the
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

    // model/entity/Product.cfc:L676 is `structDelete(variables, "brand")`, so the back-reference is
    // DELETED rather than set to a sentinel — the same absence-means-absence semantic the persistent
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
    // locates THE SAME INSTANCE. A comparison by `productID` would be a different predicate and would
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

    // An empty Brand is deletable: `maxCollection: 0` passes on a collection of length zero.
    const empty = await validateBrand(brand, 'delete');
    expect(empty.errors.hasErrors()).toBe(false);
    expect(empty.errors.getErrors()).toEqual({});

    // Attaching one real Product through the real relationship makes it undeletable — the collection
    // is populated by the actual Product-side `setBrand`, not by a test that pushes directly. This is
    // the guard that exists because model/entity/Brand.cfc:L61 declares NO cascade, so deleting a
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
    // The retired framework carried a SECOND, defective variant of this accessor that raised
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

/* ================================================================================================
 * POPULATION AUTHORISATION AND DECLARED-TYPE COERCION — org/Hibachi/HibachiTransient.cfc:L184-L213
 *
 * ALL NET-NEW. AAP §0.6.5.2 verified that no legacy test exercises population at all: there is no
 * `HibachiTransientTest`, and `meta/tests/unit/entity/BrandTest.cfc` asserts only the products
 * default. These cases exist because a security review reproduced two concrete behaviours at run
 * time against this entity — an unauthorised caller changing `brandName`, `activeFlag` and
 * `publishedFlag`, and a JSON `false` arriving as the truthy string `'false'` — so each is pinned
 * here against the legacy line that governs it.
 *
 * Brand is the right home for them: it is the entity the review used, and its descriptor set covers
 * both a `boolean` and a `string` column plus nine populate-disabled properties.
 * ============================================================================================== */

/** Records every ARM 3 question the engine asks, so operand values can be asserted. */
interface RecordingAuthorization extends PopulationAuthorizationPort {
  readonly publicContextChecks: number[];
  readonly propertyRequests: EntityPropertyAuthorizationRequest[];
}

/**
 * Builds a policy that answers ARM 3 with `allow` for every property and records what it was asked.
 *
 * `getPublicPopulateFlag` returns false, which is the legacy default: `publicPopulateFlag` is
 * initialised `false` at org/Hibachi/HibachiScope.cfc:L22 and is only set true for a `public` or
 * `frontend` route at Application.cfc:L59-L63.
 *
 * @param allow what ARM 3 should answer
 * @returns the recording policy
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

    // Every property is SKIPPED rather than rejected, which is the legacy shape: the gate is an `if`
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

    // ARM 3's three operands are exactly what [:L190] passes: the fixed crudType, the legacy
    // `getClassName()` value, and the property name. Declaration order is population order, and
    // `activeFlag` is declared at :L53 ahead of `brandName` at :L56.
    expect(authorization.propertyRequests).toEqual([
      { crudType: 'update', entityName: BRAND_CLASS_NAME, propertyName: 'activeFlag' },
      { crudType: 'update', entityName: BRAND_CLASS_NAME, propertyName: 'brandName' },
    ]);

    // ARM 2 is evaluated first for each candidate, matching the operand order at [:L188].
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

    // ONLY the enabled, payload-present property is asked about. The two disabled keys never reach
    // ARM 3 at all, because CONDITION 2 (`populateEnabled === false`) and the structural audit
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
    // [:L186] short-circuits, whereas a persistent entity has ARM 3 consulted. Asserting the
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
   * @returns the populated Brand
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
    // The declared D18-precedent departure. `'maybe'` was never ACCEPTED by the legacy either — it
    // produced a CFML cast failure on the way to Hibernate — so this changes when and how loudly a
    // bad value fails, not whether. Silently skipping would leave the prior value in place, which
    // for a visibility flag is the worst of the three outcomes.
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
    // BRANCH 1. The blank-to-NULL rule is [:L195-L196]; Brand declares no `notNull`, so the key goes.
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
    // `trim(100)` is the STRING '100' in CFML, and `urlTitle` is `ormtype="string"` at :L55, so the
    // rendered form is the faithful one. This is the case renderSimpleValue still serves.
    expect(populateBrand({ urlTitle: 100 }).urlTitle).toBe('100');
  });
});

/* ================================================================================================
 * THE brandWebsite URL POLICY — DECISION V-2 IN `src/validation/Validator.ts`
 *
 * `model/validation/Brand.json:L4` is the ONLY `dataType: "url"` rule in the whole slice, so this
 * entity is the only place the policy split is observable. Every case here is NET-NEW: AAP 0.6.5.2
 * records that `meta/tests/unit/entity/BrandTest.cfc` asserts nothing but the `products` default, and
 * no legacy test exercises validation of this property at all.
 *
 * The cases pin BOTH halves of the departure — what is newly rejected, and what is unchanged — so a
 * reviewer can see the boundary rather than infer it. The unchanged half matters most: the message
 * key is composed from `constraintValue`, which is still `'url'`, so the bag stays byte-comparable to
 * legacy output.
 * ============================================================================================== */
describe('Brand — brandWebsite URL policy, model/validation/Brand.json:L4', () => {
  it('NET-NEW — the reported file:///etc/passwd vector is rejected under the webAddress policy', async () => {
    // The legacy engine's URL check accepted six protocols — HTTP, HTTPS, FTP, FILE, MAILTO and NEWS
    // — so this value satisfied the rule before DECISION V-2. It is the exact vector the security
    // review reported, and it is asserted by value rather than by category.
    const brand = new Brand();
    brand.brandName = 'ACME';
    brand.urlTitle = 'acme';
    brand.brandWebsite = 'file:///etc/passwd';

    const { errors } = await validateBrand(brand, 'save');
    expect(errors.getError('brandWebsite')).toEqual([
      'validate.save.Brand.brandWebsite.dataType.url',
    ]);
  });

  it('NET-NEW — the other three non-web legacy protocols are rejected too', async () => {
    for (const website of ['ftp://files.test/x', 'mailto:hello@acme.test', 'news:acme.group']) {
      const brand = new Brand();
      brand.brandName = 'ACME';
      brand.urlTitle = 'acme';
      brand.brandWebsite = website;

      const { errors } = await validateBrand(brand, 'save');
      expect(errors.hasError('brandWebsite')).toBe(true);
    }
  });

  it('NET-NEW — a genuine http or https website still passes, which is what the field is for', async () => {
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

  it('NET-NEW — embedded credentials and control characters are rejected', async () => {
    // Control characters are checked on the RAW value, before trimming: a trailing newline would
    // otherwise be stripped and the value would pass, which is how a stored link smuggles a second
    // line into whatever later consumes it.
    for (const website of [
      'https://user:pass@acme.test/',
      'https://user@acme.test/',
      'https://acme.test\n',
      '\thttps://acme.test',
      'https://ac\u0000me.test',
    ]) {
      const brand = new Brand();
      brand.brandName = 'ACME';
      brand.urlTitle = 'acme';
      brand.brandWebsite = website;

      const { errors } = await validateBrand(brand, 'save');
      expect(errors.hasError('brandWebsite')).toBe(true);
    }
  });

  it('NET-NEW — the rule still PASSES on an absent value, unchanged from :L259', async () => {
    // `org/Hibachi/HibachiValidationService.cfc:L259` passes the data-type rule on an absent value,
    // making it a format check rather than a presence check. `model/entity/Brand.cfc:L57` declares no
    // `required`, so an unset website is legal — and the policy split did not touch that.
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
    // model/validation/Brand.json:L4 declares `contexts: "save"`, and :L71 is the context gate.
    const brand = new Brand();
    brand.brandWebsite = 'file:///etc/passwd';

    const { errors } = await validateBrand(brand, 'delete');
    expect(errors.hasError('brandWebsite')).toBe(false);
  });
});

/* ================================================================================================
 * THE CLOSED VALIDATION CONTEXT — DECISION V-1 IN `src/validation/Validator.ts`
 *
 * `org/Hibachi/HibachiValidationService.cfc:L162` skips every rule when the context casts to boolean
 * false. These cases pin that the nine members of `ValidationContext` all validate normally, which is
 * the runtime half of the fix; the compile-time half — that `'false'`, `'no'` and `'0'` cannot be
 * written here at all — is enforced by the type of `validateBrand`'s `context` parameter and was
 * verified with a throwaway negative type probe rather than being expressible as a test.
 * ============================================================================================== */
describe('Brand — the closed validation context, org/Hibachi/HibachiValidationService.cfc:L162', () => {
  it('NET-NEW — the save context validates rather than skipping, for an entity that must fail', async () => {
    const { errors } = await validateBrand(new Brand(), 'save');
    expect(errors.hasErrors()).toBe(true);
    expect(errors.hasError('brandName')).toBe(true);
  });

  it('NET-NEW — the empty context does not cast to boolean and so validates normally', async () => {
    // This is the subtlety :L162 turns on: `''` is not boolean-castable in CFML, so an empty context
    // runs validation. Every Brand rule is context-scoped, so nothing FIRES under it — but the engine
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
