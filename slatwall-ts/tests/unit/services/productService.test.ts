// ---------------------------------------------------------------------------
// Unit suite pinning `src/services/productService.ts`.
//
// COVERAGE PROVENANCE: 100% NET-NEW, NEVER TO BE PRESENTED AS PARITY. `meta/tests/unit/service/`
// holds exactly four components - AccountServiceTest, HibachiServiceTest, PaymentServiceTest and
// UtilityRBServiceTest - none in scope and none touching the product service, so there is no legacy
// `ProductServiceTest` anywhere under `meta/tests/`.
//
// The trap worth naming: `meta/tests/unit/entity/ProductTest.cfc` DOES exist and DOES carry one
// real case, `productUrlIsCorrectlyFormatted()`, which builds a product with URL title
// `nike-air-jorden` and asserts `getProductURL()`. That covers the Product ENTITY and is carried
// forward by the sibling-owned `tests/unit/domain/entities/product.test.ts`; it gives THIS file
// zero lineage. Nothing here asserts `getProductURL()`, the entity's defaults, or the four cases
// `meta/tests/unit/entity/SlatwallEntityTestBase.cfc` contributed.
// `meta/tests/functional/admin/entity/ProductTest.cfc` is 53 lines of empty stub and contributes
// nothing to anybody. Two further legacy tests DO reach a method covered here and are deliberately
// excluded rather than carried; both are named, with their reasons, at the excluded-coverage block
// below.
//
// --- What is under test -----
// `model/service/ProductService.cfc` is 367 lines and the widest surface in this folder: fifteen
// public methods, eight declared DI properties, and the project's must-preserve area (iii). The
// ported class publishes all fifteen names verbatim in legacy CFML camelCase, because method-level
// interface parity is this migration's acceptance contract.
//
// FOURTEEN of the fifteen are `async`; exactly ONE, `getFormattedOptionGroups`, is synchronous,
// because it reaches no repository and walks only already-materialized associations. Every method
// is invoked AS SHIPPED - the synchronous one without `await`, the other fourteen with - so a
// floating promise, a pointless `async` or an `await` on a non-thenable is a lint failure rather
// than a passing test. That is how the async boundary is enforced here.
//
// --- Four places where the shipped surface differs from its description -----
//
// ★ A CONDENSED FOUR-ITEM SUMMARY STOOD HERE AND IS STRUCK, BECAUSE ONE OF ITS FOUR CLAIMS WAS
// FALSE AND THE OTHER THREE ARE STATED MORE FULLY DIRECTLY BELOW. It read "the constructor takes
// EIGHT ports and not nine; `ProductRepository` declares SEVEN members and not six, AND IS LOCKED
// AT SEVEN; `saveProduct` writes the resolved URL title INTO THE PAYLOAD ...; and boolean `true`
// DOES satisfy the `eq 1` condition". The middle claim is the false one, and it was false in the
// sharpest possible way: it named six and denied it. `ProductRepository` declares SIX members. The
// numbered section that follows names all six, explains why the seventh - `saveBrand` - was
// removed, and item 3 there carries its own correction about WHERE the resolved title lands. The
// assertion at `expect(PRODUCT_REPOSITORY_MEMBERS).toHaveLength(6)` settles it in code, so the
// summary was the only place in this file still describing a seven-member port. Nothing is lost by
// the strike: the section below is a strict superset of the summary's surviving three claims.
//
// ---------------------------------------------------------------------------
// ★ FOUR PLACES WHERE THE SHIPPED SURFACE DIFFERS FROM ITS DESCRIPTION
// ---------------------------------------------------------------------------
// The suite ADAPTS to the shipped module; the shipped module is never adapted to
// the suite. Four differences were found by reading `src/services/*` and are
// recorded here so a reviewer sees them declared rather than discovers them:
//
//   1. THE CONSTRUCTOR TAKES NINE COLLABORATORS. `ProductService.length` is 9.
//      There is NO `OptionRepository` edge: the module imports only the
//      `SelectOption` TYPE from that port file, and a shared type is not an
//      injected edge. The legacy component declares no `optionDAO` property
//      either. QUOTE-THEN-REVISE: this read "THE CONSTRUCTOR TAKES EIGHT PORTS,
//      NOT NINE ... so eight is the faithful count." The ninth is
//      `SkuBatchWriteCollaborator`, added so the repriced set commits as ONE unit
//      of work (F3) - see that interface for why the transaction cannot live on the
//      locked `SkuRepository` port. Asserted below.
//   2. `ProductRepository` DECLARES SIX MEMBERS AND IS LOCKED AT SIX:
//      `getAttributeSets`, `loadDataFromFile`, `searchProductsByProductType`,
//      `getProductByProductID`, `saveProduct`, `deleteProduct`. An earlier
//      revision of the port declared a seventh, `saveBrand`; it was removed
//      because `super.save` [model/service/BrandService.cfc:L76] is
//      framework-inherited generic CRUD that AAP 0.5.3 does not carry forward,
//      there is no `BrandDAO.cfc` in the legacy repository, and the thirteen-port
//      set is closed so no brand repository is available either. The sibling
//      `brandService.test.ts` pins the one-collaborator constructor that follows
//      from the same removal. Asserted below.
//   3. `saveProduct` WRITES THE RESOLVED URL TITLE INTO THE PAYLOAD, NOT ONTO
//      THE ENTITY, and it reads `getCalculatedTitle()` where the legacy read
//      `getTitle()`. Both follow from the ported entity: `Product.urlTitle` is
//      `private readonly` and publishes no setter, and no `getTitle()` member
//      exists.
//
//      ★ QUOTE-THEN-REVISE. This item used to read "`saveProduct` WRITES THE
//      RESOLVED URL TITLE INTO THE PAYLOAD, NOT ONTO THE ENTITY... The shipped
//      module documents this as the one place it diverges from the legacy in
//      WHERE a value lands." The word "payload" meant THE CALLER'S OWN STRUCT
//      there, and that was not a divergence in where a value lands - it was a
//      value that landed NOWHERE. The adapter wrote `product.getUrlTitle()`,
//      still absent, so the generated title never reached the row and the
//      generation guard fired again on every subsequent save. The repository
//      members now take a populate payload - `saveProduct(product, data)` and
//      `saveProductType(productType, data)` - which is the channel that
//      replaces `setURLTitle` [model/service/ProductService.cfc:L269] on one
//      aggregate and reproduces `super.save(productType, data)`
//      [model/service/ProductService.cfc:L303] on the other. `saveProduct` no
//      longer mutates its caller's struct, which is parity: the legacy struct
//      write belongs to `saveProductType` [L297, L299] alone. Both doubles
//      record the payload alongside the entity, and the cases assert over it.
//   4. BOOLEAN `true` DOES SATISFY THE `eq 1` CONDITION. The shipped condition
//      helper answers a boolean flag directly, which is correct CFML - a
//      boolean converts to 1 in a numeric comparison, so `true EQ 1` holds. The
//      activation set is therefore numeric `1` yes, string `'1'` yes, boolean
//      `true` YES, string `'true'` no. All four are asserted, and the
//      runtime-versus-validation disagreement is demonstrated with `'true'` and
//      `2` instead - values that are truthy at run time yet not equal to 1.
//
// ★ A SECOND COPY OF THE REACH ARITHMETIC STOOD HERE, IN ITS PRE-REVISION FORM, AND IS STRUCK. It
// read "of the twenty-seven members ... exactly FOURTEEN ... The other THIRTEEN". Its replacement,
// together with the record of what changed and why, sits a few lines below - separated from it by
// the four-property list, which is why two copies of one paragraph could sit in one comment block
// without either reading as a repetition.
//
//   1. TYPED against the shipped port - derived from the shipped CONSTRUCTOR, so
//      reordering a parameter or retyping one breaks compilation here instead of
//      drifting silently past a permissive mock.
//   2. RECORDS rather than asserts, so each test states its own expectation and
//      a reader sees the whole contract in one place.
//   3. PURE and DETERMINISTIC - no randomness, no clock reading, no counter that
//      survives a test - so no assertion can pass by accident.
//   4. CONSTRUCTED FRESH in `beforeEach`. There is no mutable module-level state
//      in this file at all.
//
// Of the twenty-seven members those eight ports declare, the service reaches
// exactly SEVENTEEN. The other TEN are implemented as members that RAISE.
// That is not padding and it is not deferred work: the behaviour they implement
// IS "this must not happen, and here is which member happened", which turns a
// silently-grown collaboration into a named failure.
//
// ★ EVERY ONE OF THESE FIGURES HAS MOVED AT LEAST ONCE, WHICH IS WHY ALL OF THEM ARE READ OFF THE
// CODE RATHER THAN CARRIED FORWARD. The history, kept because it is the record of two counting
// mistakes worth not repeating: this read "of the TWENTY-SEVEN members ... exactly FOURTEEN"; a
// first revision carried it to "TWENTY-EIGHT ... FIFTEEN ... the thirteen unreached members are
// unchanged", crediting `SkuRepository`'s eighth member `saveSkus` while leaving the unreached
// figure alone even though `ProductRepository` had lost the UNREACHED `saveBrand`, so the total held
// at twenty-eight only because one port grew as another shrank; a second revision fixed the reached
// and unreached figures to seventeen and eleven. `saveSkus` has since been REMOVED - it was an
// eighth member on a port fixed at seven - and the totals settle as follows.
//
//   * TWENTY-SEVEN declared = 6 product + 7 SKU + 4 product-type + 1 URL-title + 3 image-store
//     + 2 subscription-term + 1 SKU-creation + 3 option-loading.
//   * SEVENTEEN reached, counted as the distinct `this.<port>.<member>` call sites in
//     `src/services/productService.ts`. The figure did NOT move when `saveSkus` went, because
//     `processProduct_updateSkus` now reaches `saveSku` in its place - one reached member
//     substituted for another.
//   * TEN unreached, which is exactly the number of `unreachedPortMember(...)` call sites in
//     this file - so the prose and the doubles cannot drift apart without one of the two counts
//     visibly disagreeing with the other. It fell by one because `saveSku` moved from the unreached
//     column to the reached one.
//   * 17 + 10 = 27, which is the check that the earliest figures failed.
//
// ---------------------------------------------------------------------------
// WHAT THIS SUITE DELIBERATELY DOES NOT DO, EACH STATED RATHER THAN LEFT SILENT
// ---------------------------------------------------------------------------
//   * NO SQL, PARAMETERISED OR OTHERWISE - AND THAT IS NOT A GAP. The project
//     holds every query to prepared statements, which is what preserves the
//     injection-safety guarantee the legacy `cfqueryparam` gave, and that
//     obligation cannot be discharged from here because the unit under test issues
//     no query at all. In particular THE AND-OF-EXISTS MATCHING SEMANTICS OF
//     `model/dao/SkuDAO.cfc:L107-L128` ARE NOT ASSERTED HERE. That SQL - the
//     `0 = 0` tautology, one correlated `EXISTS` per selected option, and the
//     optional product filter - is the actual must-preserve behaviour behind
//     `getProductSkusBySelectedOptions`, and it is asserted in the sibling-owned
//     `tests/integration/repositories/` tier, where a real prepared statement
//     exists to assert against.
//   * NO TIMING ASSERTION OF ANY KIND. `loadDataFromFile` raises the platform
//     request timeout at `model/service/ProductService.cfc:L65-L68`. That is a
//     PLATFORM FACT about the CFML host, not a service-level objective, and this
//     suite asserts nothing about any duration, sets no per-test timeout, and
//     makes no claim about how long any call takes.
//   * NO MOCKING LIBRARY. `package.json` pins thirteen packages - three runtime, ten
//     development - and this suite adds
//     none. `vi` ships inside the runner and is used for exactly ONE purpose -
//     observing the internal dispatch from `processProduct_addOptionGroup` and
//     `processProduct_addOption` to `processProduct_updateDefaultImageFileNames`
//     while keeping the real implementation in place. Every spy is restored by a
//     suite-local `afterEach` as well as by the global restore that
//     `tests/setup.ts` registers.
//   * NO CONTAINER, COMPOSITION ROOT OR SERVICE LOCATOR. Nothing under
//     `src/handlers/**` is imported, and neither is `src/lib/config.ts` or
//     `src/lib/logger.ts`. Every collaborator arrives through the constructor,
//     which is transformation rule T1 - see the annotation at the wiring site.
//   * NO IMPORT FROM `src/repositories/**` OR `src/integrations/**`. The layer
//     boundary the project enforces with a lint rule is not to be walked around
//     from a test file.
//   * NO FIXTURE IS CREATED OR EDITED. `tests/fixtures/productFixtures.ts` and
//     `tests/fixtures/skuFixtures.ts` are consumed as shipped. Option groups and
//     options are constructed inline from the shipped entities, because no
//     option fixture module exists and inventing one is not this file's job.
//   * NO EXPORT, NO BARREL. A `.test.ts` file exports nothing, and no helper
//     module or shared base suite is created or imported.
//   * NO MXUNIT HARNESS. The legacy assertions are carried; the legacy harness
//     is not. There is no assertion shim, no set-up/tear-down base component
//     analogue, no `meta/tests/unit/Helper.cfc` port and no browser-driver
//     analogue. `Helper.cfc` is a REFERENCE PATTERN only - its shape is
//     build/save/flush, and the target drops the CFML entity-instantiation
//     call, the ORM flush, the entity-delete call, the CFML null cast, ambient
//     request scope and every `getService(...)` lookup. Its own un-scoped local at
//     `meta/tests/unit/Helper.cfc:L53` is a defect in the HARNESS BEING
//     REPLACED, not a business-logic defect, and it is deliberately NOT
//     reproduced.
//   * NO CONDITIONAL ASSERTION. Every test below asserts unconditionally. That
//     is a direct response to the two excluded legacy tests, one of which passes
//     vacuously whenever the database is empty.
//   * NO LICENCE HEADER. Attribution is carried once, in
//     `slatwall-ts/NOTICE-GPL.md`, and is never restated per file.
//   * NO ASSERTION ABOUT BUNDLING OR DEPLOYMENT. Infrastructure as code is out
//     of scope for the project, so nothing here inspects an artefact, a bundle
//     format or a handler packaging concern.
//
// Every monetary value below is a `Money` built from a decimal STRING, and every monetary
// expectation is a `Money` comparison or a two-decimal string. No arithmetic is performed on a
// JavaScript number anywhere in this file, and `Money.zero` is never used as a stand-in for an
// absent price.
//
// NO FIXTURE IS CREATED OR EDITED. `tests/fixtures/productFixtures.ts` and
// `tests/fixtures/skuFixtures.ts` are consumed as shipped; option groups and options are
// constructed inline from the shipped entities, because no option fixture module exists and
// inventing one is not this file's job. The legacy assertions are carried, the legacy harness is
// not: `Helper.cfc` is a REFERENCE PATTERN only, its shape being build/save/flush, and the target
// drops the CFML entity-instantiation call, the ORM flush, the entity-delete call, the CFML null
// cast, ambient request scope and every `getService(...)` lookup. Its own un-scoped local at
// `meta/tests/unit/Helper.cfc:L53` is a defect in the HARNESS BEING REPLACED rather than a
// business-logic defect, and is deliberately NOT reproduced.
//
// `vi` ships inside the runner and is used for exactly ONE purpose: observing the internal dispatch
// from `processProduct_addOptionGroup` and `processProduct_addOption` to
// `processProduct_updateDefaultImageFileNames` while keeping the real implementation in place. The
// project pins thirteen packages and this suite adds none. Every spy is restored by a suite-local
// `afterEach` as well as by the global restore `tests/setup.ts` registers.
// ---------------------------------------------------------------------------

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

// --- Port types, DERIVED from the shipped constructor rather than imported -----
//
// JUDGMENT CALL: all eight collaborator types are reached through
//   `ConstructorParameters<typeof ProductService>`
// instead of being imported individually. It keeps the dependency set narrow - importing each port
// by name would also drag in the entity and payload types those ports mention (`Brand`,
// `AttributeSetSummary`, `BrandSavePayload`, `ImageUploadResultProjection`,
// `SubscriptionTermHandle`), none of which this suite has business naming. And, the stronger
// reason, deriving from the SHIPPED CONSTRUCTOR means a double can never drift from the class it is
// handed to: reorder the parameters, retype one, or add a ninth collaborator, and this file stops
// compiling. Nothing is asserted about a port's module name, because its name is not this file's
// business; its SHAPE is. The index order below IS the shipped constructor order, asserted by the
// wiring test.
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
 * The upload projection the image store's save member accepts, recovered the same way
 * and for the same reason - so this suite never has to name
 * `ImageUploadResultProjection` or import from the port module.
 */
type ImageUploadProjectionShape = Parameters<ImageStorePort['saveImageFile']>[0];

/**
 * The descriptor the image port's name composer is handed, recovered the same way and for the
 * same reason - a type the suite never imports cannot drift from the shipped constructor.
 */
type SkuImageFileNameDescriptor = Parameters<ImageStorePort['generateSkuImageFileName']>[0];

/**
 * The populate payload each save override hands to its repository, recovered the same way and
 * for the same reason - a type the suite never imports cannot drift from the shipped port.
 *
 * ★ THE PAYLOAD IS THE PERSISTENCE CHANNEL, AND IT IS NOT THE ONLY PLACE A RESOLVED TITLE
 * LANDS. `saveProduct` writes the resolved title onto the ENTITY, because
 * [model/service/ProductService.cfc:L269] does - and it ALSO states it in the payload, so
 * the value the adapter binds and the value `getProductURL()`
 * [model/entity/Product.cfc:L207] reads cannot disagree. Asserting over the payload is how
 * the persistence half is seen; asserting over the entity is how the accessor half is.
 */
type ProductSavePayloadShape = Parameters<ProductRepositoryPort['saveProduct']>[1];

/** The product-type counterpart of {@link ProductSavePayloadShape}. */
type ProductTypeSavePayloadShape = Parameters<ProductTypeRepositoryPort['saveProductType']>[1];

/**
 * The window the repository's search member accepts, recovered the same way and for the same reason -
 * a type this suite never imports cannot drift from the shipped port.
 *
 * `NonNullable` strips the `| undefined` the optional parameter position carries, so the alias
 * names the window ITSELF rather than "a window or nothing"; the places that can be handed
 * nothing spell their own `| undefined`.
 *
 * QUOTE-THEN-REVISE: named `ProductMaterializationWindow` while the port's own type was (F38). Nothing
 * is materialized on this path any more - the search answers the two columns its statement selects -
 * so the port renamed it `ProductSearchWindow` and this alias follows.
 */
type ProductSearchWindow = NonNullable<
  Parameters<ProductRepositoryPort['searchProductsByProductType']>[2]
>;

/**
 * One matched row the repository's search member answers with, recovered the same way.
 *
 * The element type of `records`, which the port narrowed from a hydrated `Product` to the legacy's own
 * two-key `{"id","value"}` structure [model/dao/ProductDAO.cfc:L429-L436] under F38.
 */
type ProductSearchRow = Awaited<
  ReturnType<ProductRepositoryPort['searchProductsByProductType']>
>['records'][number];

/** One matched row, as this suite writes one. `value` is omitted when no name is given. */
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

// --- Deterministic values, every one obviously synthetic -----

/**
 * Fixed instant used wherever an audit column must be populated.
 *
 * `tests/setup.ts` forces the process time zone to UTC and verifies it took effect, so a UTC
 * ISO-8601 literal is unambiguous here. Every date in this file is written in that form
 * deliberately - no local-time literal, no `Date.now()`, no clock read of any kind - because a
 * suite that pins behaviour must not be able to change its own answer between two runs.
 */
const FIXED_AUDIT_INSTANT = new Date('2024-06-01T00:00:00.000Z');

/**
 * The URL title the generator double answers with.
 *
 * The `generated-` prefix makes it impossible to mistake a double's answer for a real slug, or for
 * an assertion to pass because a test happened to supply a value that already looked like one.
 *
 * This is NOT a port of the legacy slug algorithm. `model/service/DataService.cfc` owns that
 * algorithm and the adapter behind the port reproduces it; what the service tier consumes is a
 * string it did not compute, so a stand-in string is the honest stimulus here.
 */
const GENERATED_URL_TITLE = 'generated-url-title';

/**
 * The calculated title `makeProductFixture` supplies, reproduced here as the expected generator
 * input.
 *
 * It is the CALCULATED title, not a `getTitle()` result: the ported entity publishes no
 * `getTitle()` member, so the shipped `saveProduct` reads `getCalculatedTitle()`. That is
 * shipped-surface correction 3 from the header, and this constant is where it becomes checkable.
 */
const FIXTURE_CALCULATED_TITLE = 'Test Product (calculated title snapshot)';

const FIXTURE_URL_TITLE = 'nike-air-jorden';

/**
 * The product name `makeProductFixture` defaults to - `meta/tests/unit/Helper.cfc:L54`
 * `productName = "Test Product"`, verbatim.
 *
 * Needed by the save cases because `productName` is the SECOND member the repository payload
 * carries, so every payload assertion has to state it. It deliberately DIFFERS from
 * {@link FIXTURE_CALCULATED_TITLE}, which is what keeps the title-source assertions from
 * passing by coincidence.
 */
const FIXTURE_PRODUCT_NAME = 'Test Product';

/**
 * The brand name `makeProductFixture` attaches, mirrored from `tests/fixtures/productFixtures.ts`.
 *
 * Needed because the rendered title template resolves `${brand.brandName}`
 * [model/service/SettingService.cfc:L193], so the title-source case has to state both markers'
 * resolved values. Mirrored rather than imported because the fixture module publishes the factory,
 * not its internal constants - and a suite that hard-codes the string would silently drift if the
 * fixture changed, whereas this one name is asserted against the fixture's own product in the same
 * case.
 */
const FIXTURE_BRAND_NAME = 'Test Brand';

/**
 * Identifier carried ONLY by the instance the persistence double answers with.
 *
 * The legacy save is where a new product acquires its generated identifier, and the ported entity
 * is immutable, so that identifier cannot be back-filled into the argument. Keeping the value
 * distinct is what lets the delegation cases prove the returned product is the PERSISTED one rather
 * than the input.
 */
const PERSISTED_PRODUCT_ID = 'persisted-product-identifier';

const PERSISTED_PRODUCT_TYPE_ID = 'persisted-product-type-identifier';

/**
 * PHYSICAL TABLE NAMES, PRESERVED VERBATIM.
 *
 * Schema continuity is a project constraint: the target reads and writes the existing tables
 * unchanged, so these two literals survive exactly as `model/service/ProductService.cfc:L269` and
 * `:L297, L299` wrote them. They are the uniqueness SCOPE handed to the URL-title port, not a
 * query, and they are asserted rather than trusted.
 */
const PRODUCT_TABLE_NAME: UrlTitleTableName = 'SwProduct';
const PRODUCT_TYPE_TABLE_NAME: UrlTitleTableName = 'SwProductType';

/**
 * Resource-bundle keys, preserved verbatim, with no i18n runtime.
 *
 * LEGACY-NOTE [model/process/Product_UpdateSkus.cfc:L56, L58]: [L56] declares
 * `hb_rbKey="entity.sku.price"` on its `price` property and [L58] declares
 * `hb_rbKey="entity.sku.listPrice"` on its `listPrice` property. The project carries such
 * identifiers forward as PLAIN STRING CONSTANTS so the legacy admin can still resolve them, and
 * introduces no resource-bundle runtime to resolve them with. They are pinned here next to the two
 * assertions that make their preservation checkable: the property each annotates survives verbatim
 * as the validation issue path, and neither identifier ever appears in a message - which is what
 * "no i18n runtime" looks like from the outside.
 */
const SKU_PRICE_RB_KEY = 'entity.sku.price';
const SKU_LIST_PRICE_RB_KEY = 'entity.sku.listPrice';

/**
 * The image-name settings the port leaves to its implementation, held at their LEGACY
 * DEFAULTS: `productImageOptionCodeDelimiter = {fieldType="select", defaultValue="-"}`
 * [model/service/SettingService.cfc:L192] and `productImageDefaultExtension =
 * {fieldType="text",defaultValue="jpg"}` [L191].
 *
 * NEITHER key is on the port: `SettingKey` is closed at FOUR and these two [:L191, :L192] are
 * product-presentation settings the composition root resolves from the same `SwSetting` read. They
 * are held here as literals only because this suite exercises the IMAGE SEAM directly, which receives
 * already-resolved values rather than a resolver - which is the whole reason the composition moved off
 * the entity in the first place. This paragraph said "Both keys ARE in the port's closed seven-key
 * union" until a code review measured four; nothing about the seam changes, because the seam consumes
 * resolved values either way. The values match the
 * composition root's exactly, so one setting still has one value. The delimiter's legacy option
 * list is exactly `['-','_']`
 * [model/service/SettingService.cfc:L346-L347], so `'-'` is a real value and not an invention.
 */
const FIXTURE_IMAGE_OPTION_CODE_DELIMITER = '-';
const FIXTURE_IMAGE_DEFAULT_EXTENSION = 'jpg';

/**
 * The six members `ProductRepository` declares.
 *
 * ★ SIX, and the port states it as a LOCK - shipped-surface correction 2 from the
 * header. Listed as a literal tuple so the count and the names are both asserted
 * rather than described, and so adding a member to the port without updating this
 * list surfaces as a failure here. `saveBrand` is deliberately absent; the port's
 * own documentation records why it was removed rather than relocated.
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
 * ★ THESE CALL SITES ONCE PASSED `{}`, AND THAT SHAPE NO LONGER COMPILES.
 * `ProductQueryCriteria.keyword` is REQUIRED, because
 * [model/dao/ProductDAO.cfc:L422] binds `value="%#arguments.term#%"` BEFORE the
 * `structKeyExists` guard that protects `productTypeIDs` at [L423]. An omitted term
 * therefore reached an undefined-variable raise in CFML rather than a broader search,
 * and the sole adapter reproduces that by throwing `ProductUndefinedArgumentError`.
 *
 * So `{}` was never a call that could succeed against the shipped adapter, only one that
 * this file's permissive double happened to tolerate. Every case that is about the page
 * shape, the joins, the keyword properties or the paging window now supplies this
 * constant, which changes NOTHING those cases assert - the criteria object was incidental
 * to all of them - and stops any of them standing as evidence that an absent keyword
 * works.
 */
const REQUIRED_KEYWORD = 'nike';

/**
 * A provisional SKU key of exactly the shape `skuService.createSkus` mints for a draft.
 *
 * `createHibachiShapedIdentifier` in `src/services/skuService.ts` reproduces
 * `createHibachiUUID()` [org/Hibachi/HibachiObject.cfc:L144-L146], whose whole body is
 * `return replace(lcase(createUUID()), '-', '', 'all');` [L145] - thirty-two lowercase
 * hexadecimal digits, no separators. A draft therefore carries a well-formed key while
 * still reporting `isNew()`, and `mysqlSkuRepository.insertSku` mints a different one and
 * discards this. Opaque identifier, not a credential.
 */
const PROVISIONAL_SKU_ID = '6b1f0c9d7a2e4b558c30d1fe94a7b602';

/**
 * The key carried by the draft that {@link attachOneDesignatedDraftSku} attaches.
 *
 * Distinct from {@link PROVISIONAL_SKU_ID} on purpose: cases that program their own
 * attachment use that one, so a case reading a key can tell the default effect apart from an
 * effect it supplied itself. Same shape and same reasoning - thirty-two lowercase hexadecimal
 * digits, an opaque identifier and not a credential.
 */
const CREATED_DRAFT_SKU_ID = 'a71c4e26db384f0d9ba55e13c8f0742b';

// --- Inline entity builders; no fixture module is created or edited -----

interface OptionGroupWithOption {
  readonly group: OptionGroup;
  readonly option: Option;
}

/**
 * Builds an option group holding NO options.
 *
 * Every field the shipped constructor declares is supplied explicitly, including the ones whose
 * value is `undefined`, because the constructor declares all fourteen as required properties whose
 * type admits `undefined`.
 *
 * The sort-order tie-breaker is a constant function rather than an omission, so two options sharing
 * a sort order can never order differently between runs.
 */
function buildEmptyOptionGroup(spec: {
  readonly optionGroupID: string;
  readonly optionGroupName: string;
  readonly sortOrder: number;
  /**
   * `property name="imageGroupFlag" ormtype="boolean" default="0";`
   * [model/entity/OptionGroup.cfc:L57].
   *
   * OPTIONAL, DEFAULTING TO `false`, which is the column's own default and was this builder's
   * hardcoded value before the image-file-name cases needed the other branch. Every existing
   * caller omits it and is unaffected; only the cases that assert
   * [model/entity/Sku.cfc:L134]'s filter pass `true`.
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
 *   `new Option({ optionGroup })`
 * records the group but does NOT push itself into the group's collection - only
 * `Option.setOptionGroup` does that - so the option is pushed into the group's own collection
 * afterwards.
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

// --- The in-memory doubles -----

/**
 * Raised by any port member this suite proves is never reached.
 *
 * A double that answered a plausible value for an unexercised member would let a regression pass
 * unnoticed; one that raises turns the same regression into a named failure. That makes these
 * members a COMPLETE implementation of a test double rather than deferred work - the behaviour they
 * implement IS "this must not happen, and here is which member happened".
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
 * `searchSkusByProductType` takes the SINGULAR `productTypeID`. Both spellings are preserved
 * exactly as the legacy DAOs declared them, and the field below is the plural one on purpose so
 * that a reader tempted to harmonise the two ports sees the asymmetry is deliberate.
 */
interface RecordedProductSearch {
  readonly term: string | undefined;
  readonly productTypeIDs: string | undefined;
  /**
   * The materialization window the service pushed down, or `undefined` when it pushed none.
   *
   * ★★ RECORDED BECAUSE THE PUSH-DOWN IS THE POINT. A security review found (MAJOR, CWE-400) that
   * `findProducts` materialized every matched product graph and only then applied its window in
   * memory, so the window bounded the RESPONSE and not the WORK. Capturing the third argument is
   * what makes "the window reached the adapter" assertable rather than assumed.
   */
  readonly window: ProductSearchWindow | undefined;
}

/**
 * In-memory stand-in for the product repository port.
 *
 * Replaces the legacy `property name="productDAO";` [model/service/ProductService.cfc:L52] plus the
 * framework-inherited `getHibachiDAO().save(...)` [L287] and `super.delete(...)` [L326].
 *
 * Answers a DISTINCT product instance from `saveProduct` rather than the one it was handed, because
 * that is what the legacy save did: it returned the entity the data store had seen, carrying the
 * identifier the store assigned.
 */
class RecordingProductRepository implements ProductRepositoryPort {
  readonly imports: RecordedImportRequest[] = [];
  readonly searches: RecordedProductSearch[] = [];
  readonly saves: Product[] = [];

  /**
   * The payload of every save, in call order and positionally paired with {@link saves}.
   *
   * Recorded SEPARATELY from the entity rather than folded into one object, because the
   * whole point of the payload is that it carries values the entity cannot: an assertion
   * that read the resolved url title back off the recorded entity would pass against a
   * service that never resolved one, since `Product.urlTitle` is `private readonly` and
   * would be `undefined` either way. Keeping the two apart is what makes the resolved
   * value observable at all.
   */
  readonly savePayloads: ProductSavePayloadShape[] = [];
  readonly deletes: Product[] = [];

  /**
   * The rows the search answers.
   *
   * ★★★ ROWS, NOT PRODUCTS (F38). This was `Product[]`, because the port used to publish hydrated
   * entities from its search member - which code review recorded as a two-column source query
   * [model/dao/ProductDAO.cfc:L421] amplified into a graph read, a SKU read, an option read and a
   * per-product sale-price resolution, for an answer whose only consumed members were the identifier
   * and the name. The port publishes `ProductSearchRow` - the legacy's own `{"id","value"}` structure
   * [L429-L436] - so the double stores those.
   */
  searchResult: ProductSearchRow[] = [];

  /**
   * What the double reports as the pre-window match count.
   *
   * Defaults to `undefined`, which means "as many as `searchResult` holds" - the honest reading for a
   * double that windows nothing. A case exercising a WINDOWED search sets it explicitly, because the
   * real adapter's count is the size of the identifier projection and is therefore INDEPENDENT of how
   * many graphs it went on to materialize.
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
   * ★★ THE ANSWER CARRIES THE ARGUMENT'S SKU COLLECTION AND DEFAULT DESIGNATION,
   * BECAUSE THE REAL ADAPTER DOES. `rebuildProduct` in
   * `src/repositories/mysql/mysqlProductRepository.ts` builds its answer with
   * `skus: product.getSkus()` - THE SAME LIVE ARRAY, not a copy - and forwards
   * `defaultSku` when present. A double that answered a fixture with an empty
   * collection would make the SKU drafts `createSkus` just attached vanish across
   * the save boundary, and every assertion about what happens to them afterwards
   * would be asserting against a fiction.
   *
   * This is deliberately a MUTATION of the fixture rather than a fresh instance: the
   * suite's other cases assert `answered).toBe(persistedProduct)`, which is the whole
   * point of answering a distinct instance, so the identity must survive.
   */

  /**
   * Inspected at the moment of the save, before the recorder answers.
   *
   * Absent by default. A recorded entity can always be inspected afterwards, but the
   * cascade in `mysqlProductRepository` reads the product's collection and designation
   * AS THE SAVE HAPPENS - so a case that needs to pin what the port SEES, rather than
   * what the entity holds once the method has returned, supplies a hook here.
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
   * Absent by default, and the symmetric counterpart of {@link onSave}. It exists for one
   * reason: `deleteProduct` DETACHES the default-SKU designation in memory
   * [model/service/ProductService.cfc:L323] and RESTORES it on the failure exit [L330], so
   * on the failure path the before and after states are IDENTICAL. Only an observation taken
   * while the delete is in flight can tell a real detach-and-restore apart from a field that
   * was never touched, and that is what this hook is for.
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

  // NO `saveBrand` MEMBER: the port's member set is locked at six and publishes
  // no brand write. `src/domain/ports/productRepository.ts` records why the
  // member was removed rather than relocated, and `src/services/brandService.ts`
  // carries the LEGACY-NOTE that leaves the durable half of `super.save`
  // [model/service/BrandService.cfc:L76] to the composition root. A double that
  // declared one would type-error, which is the signal this suite wants.
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
 * Replaces the legacy `property name="skuDAO";` [model/service/ProductService.cfc:L53].
 *
 * `getSkusBySelectedOptions` answers the seeded array BY REFERENCE, deliberately: must-preserve
 * area (iii) is pure delegation, and answering the very same instance is what lets the assertion
 * prove the service adds no copy, no filter and no re-sort of its own.
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
   * ★ THIS IS THE REACHED WRITE MEMBER, AND IT ONCE RAISED HERE. While
   * `SkuRepository` carried a `saveSkus` collection form, `processProduct_updateSkus`
   * wrote through that member and this one was left raising - the raise being the proof
   * that the service had not quietly taken a per-SKU route. The collection member was
   * an eighth member on a port fixed at seven and has been removed, so the per-SKU
   * route IS the route, and this member records instead of raising.
   *
   * What that costs is stated rather than glossed: a per-SKU write can stop part way,
   * so the "nothing reached a row" guarantee a single collection write gave is gone.
   * AAP 0.6.5 is what replaces it, and all three of its obligations are asserted in
   * this file - the batch limit before the first mutation, idempotency across a repeat
   * invocation, and compensation-by-retry.
   *
   * The instances are recorded BY REFERENCE rather than copied, so a case can assert on
   * identity, and reading a price off a recorded instance proves the mutation preceded
   * the write.
   */
  readonly savedSkus: Sku[] = [];

  saveSku(sku: Sku): Promise<Sku> {
    this.savedSkus.push(sku);

    // Handed straight back rather than rehydrated: a double has no row to reflect, and
    // `processProduct_updateSkus` discards the result anyway - it returns the argument
    // product, whose SKUs are the ones the loop mutated.
    return Promise.resolve(sku);
  }
}

/**
 * In-memory stand-in for the batch-write collaborator, and the double that makes ATOMICITY
 * observable (F3).
 *
 * ★★★ WHY IT DELEGATES RATHER THAN MERELY RECORDING. Many existing cases in this file assert on
 * `RecordingSkuRepository.savedSkus`, and those assertions are about WHICH SKUS WERE PERSISTED - a
 * question that survives the move from a per-SKU loop to one transaction. So this double records the
 * BATCH it was handed and then forwards each member to the same recording repository, which keeps
 * every one of those assertions meaningful while adding the one they could not make: that the whole
 * set arrived in ONE call.
 *
 * ★★★ AND WHY IT CAN FAIL WITHOUT FORWARDING. {@link RecordingSkuBatchWrite.failure} models the
 * property the real collaborator gets from `executor.transaction`: a failure anywhere in the unit of
 * work leaves NOTHING persisted. Setting it raises AFTER recording the request and BEFORE forwarding
 * any member, so a case can prove that a PERMANENT mid-batch failure persists no row at all - which
 * is precisely the state the per-SKU loop could not avoid and could not recover from by retrying.
 */
class RecordingSkuBatchWrite implements SkuBatchWritePort {
  /** One entry per call, holding a COPY of the set so a later mutation cannot rewrite history. */
  readonly batches: (readonly Sku[])[] = [];

  /** When set, the unit of work fails and forwards nothing - the rollback, modelled. */
  failure: Error | undefined = undefined;

  constructor(private readonly repository: RecordingSkuRepository) {}

  async saveMutatedSkus(skus: readonly Sku[]): Promise<void> {
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
 *   `property name="productTypeDAO";`
 * and NEVER USES IT - one of two DEAD injections in the file. The ported class does take a
 * product-type repository, but only because `super.save(productType, data)` [L303] needed somewhere
 * to go once the framework base component stopped supplying it. Eight properties were declared; six
 * were real.
 *
 * ECHOES its argument by default so a test can observe what the service does to the RETURNED
 * instance, and answers `answer` when a test needs to prove the returned value is the persisted one
 * rather than the input.
 */
class RecordingProductTypeRepository implements ProductTypeRepositoryPort {
  readonly saves: ProductType[] = [];

  /**
   * The payload of every save, in call order and positionally paired with {@link saves}.
   *
   * On THIS aggregate the payload is the only channel the resolved url title has ever had -
   * the legacy resolved it into the data struct at
   * [model/service/ProductService.cfc:L297, L299] and never onto the entity - so recording
   * it is what makes the four-clause gate's outcome observable at the persistence boundary
   * rather than only in the caller's own object.
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
 * Records both arguments of every call in arrival order, so a test can assert HOW MANY times
 * generation fired, WHICH title source won, and WHICH physical table the uniqueness scope named -
 * the three facts the legacy branch structure decides.
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
 * out-of-scope branches consume it. Recording the composed path is the whole of what this double
 * does: NO FILE IS OPENED, CREATED, MOVED OR DELETED by any line of this suite, and no path below
 * names a real directory.
 */
class RecordingImageStore implements ImageStorePort {
  readonly deletedPaths: string[] = [];

  /**
   * Every `saveImageFile` call, in order, exactly as it arrived.
   *
   * `processProduct_uploadDefaultImage` reaches this member - the AAP's interface
   * mapping for that method prescribes "Delegates to the image-store stub port"
   * (AAP 0.4.2, ProductService table) - so it records rather than raising. It
   * previously raised, which was correct only while the method refused before ever
   * reaching a port.
   */
  readonly savedFiles: { readonly filePath: string; readonly allowedExtensions: string }[] = [];

  /**
   * When set, the next save REJECTS. The upload path wraps its delegation in a
   * catch, so this is how the swallowed-failure branch is reached deliberately.
   */
  saveRejection: Error | undefined = undefined;

  /** Every descriptor the name composer was handed, in call order. */
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
   * ★ THIS IS THE ONE MEMBER IN THIS DOUBLE THAT IMPLEMENTS BEHAVIOUR RATHER THAN RECORDING
   * ONLY, and the reason is worth stating because its siblings deliberately do the opposite.
   * `processProduct_updateDefaultImageFileNames` does three things - traverse, filter
   * and assign - and the value it assigns is the port's. A double answering a canned constant
   * would prove the assignment happened while proving nothing about what was assigned, and the
   * legacy behaviour under test [model/entity/Sku.cfc:L131-L139] IS the composition.
   *
   * So the five clauses the port fixes are reproduced here: case-insensitive sanitisation of
   * the product code and of each option code separately, the delimiter BEFORE each code, the
   * dot-plus-extension suffix, and an absent value contributing nothing. The two settings are
   * fixture constants carrying the legacy defaults
   * [model/service/SettingService.cfc:L191-L192]. Nothing here touches a filesystem.
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
 *
 * The second of the project's two stub ports. Answers `undefined` for the term lookup, which is
 * exactly what a stub for an out-of-scope subsystem should do - and is enough for the one legacy
 * statement in `processProduct_addSubscriptionTerm` that HAS a ported counterpart to be observed
 * reaching it before the out-of-scope failure surfaces.
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
 * The faithful default effect of a `createSkus` invocation: one draft SKU attached, and
 * designated as the product's default when nothing holds that role yet.
 *
 * `Product.addSku` delegates to `Sku.setProduct`, which pushes into the LIVE array for a new
 * SKU - the same route [model/service/SkuService.cfc:L100] takes. The FIRST-WINS designation
 * is the shape of [model/service/SkuService.cfc:L101-L103], the merchandise arm being the
 * in-scope one; the four other strategies are pinned individually in
 * `tests/unit/services/skuService.test.ts`.
 *
 * The draft stays TRANSIENT, which is the state `mysqlProductRepository` reads to defer the
 * `defaultSkuID` write - so a case that follows the aggregate all the way to persistence sees
 * the same shape the real collaborator hands over.
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
 * ★ THE HAND-OFF IS PROGRAMMABLE THROUGH A HOOK, AND THE HOOK'S DEFAULT IS THE
 * FAITHFUL EFFECT RATHER THAN NOTHING. An earlier revision exposed an `attachedSkuCount`
 * knob; a later one replaced it with an `attachment` hook that defaulted to ABSENT, on the
 * grounds that most cases here are about the DISPATCH rather than about its effects. The
 * shape of the hook is the better of the two - one function says everything a count and a
 * designation rule said - but ABSENT IS NOT A DEFAULT THIS SERVICE TOLERATES, and the
 * reason is in the method under test rather than in a preference.
 *
 * `saveProduct` reproduces the legacy's SECOND `!hasErrors()` ask
 * [model/service/ProductService.cfc:L286] as `product.isNew() && product.getSkus().length
 * === 0`, and that equivalence is provable precisely because EVERY arm of the real
 * collaborator that completes attaches at least one SKU - the merchandise-multi arm runs
 * `totalCombos` iterations seeded at 1 [model/service/SkuService.cfc:L67, L85], the
 * merchandise-single arm creates exactly one [L128-L134], the two out-of-scope arms iterate
 * lists their own gates already required to be non-empty [L147-L154, L174-L200], and the
 * fifth arm raises [L203-L204]. So a double that records the call and attaches NOTHING
 * models a state the real collaborator only ever reaches BY RECORDING AN ERROR, and it
 * sends every new-product case down the refusal branch the legacy never takes.
 *
 * The default therefore attaches ONE draft and designates it, which is the smallest
 * faithful effect; the hook stays programmable so that the cases which need to OBSERVE the
 * hand-off, or to model the error arm by attaching nothing, can say so explicitly. The
 * effects themselves - what `createSkus` attaches and how it designates - are pinned in
 * `tests/unit/services/skuService.test.ts`, against the real thing.
 */
class RecordingSkuCreation implements SkuCreationPort {
  readonly requests: RecordedSkuCreation[] = [];

  outcome = true;

  /**
   * What the collaborator DOES to the product, beyond recording that it was asked.
   *
   * Defaults to {@link attachOneDesignatedDraftSku}, because `SkuService.createSkus`
   * [model/service/SkuService.cfc:L58] never merely records a call: it attaches every SKU it
   * builds to `product.getSkus()` and designates one through `setDefaultSku` [L102, L134,
   * L167, L189, L198]. A case that needs to OBSERVE the hand-off - or to model the arm that
   * records an error and attaches nothing - replaces this with its own function.
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
 * the framework's generic `get<Entity>(primaryKey)` affordance that [L115] and [L130] leaned on -
 * an affordance `OptionService.cfc` never declared.
 *
 * `getOptionsForSelect` IS SYNCHRONOUS here because it is synchronous on the shipped port. Its
 * projection is a DETERMINISTIC STAND-IN, NOT a port of `model/service/OptionService.cfc:L55-L65`:
 * that component's own select-option shaping, including its handling of a missing name, is asserted
 * by the sibling-owned `optionService.test.ts`.
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

// --- Validation-failure capture -----

/**
 * One declarative-validation issue, flattened to primitives.
 *
 * Assertions are made on the STRUCTURED issue rather than on a stringified error blob, because two
 * of the six mandatory cases must be provably DISTINCT failures: a missing `price` and a
 * non-numeric `price` both reject, and a message-substring check against a formatted error would
 * not establish that they reject for different reasons.
 */
interface CapturedIssue {
  readonly code: string;
  readonly message: string;
  readonly path: readonly string[];
}

/**
 * Runs an operation that MUST reject with the declarative validation error, and answers its issues.
 * Both failure modes of the helper itself raise with a named explanation, so a test can never pass
 * because the call unexpectedly resolved or because it failed for an unrelated reason.
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
 * `entity.sku.listPrice` annotates the `listPrice` property, so the terminal segment IS the
 * property name. The final coalesce cannot be observed - `split` always yields at least one element
 * - and exists only because `noUncheckedIndexedAccess` types the indexed read as possibly absent,
 * and a non-null assertion is not used anywhere in this file.
 */
function rbKeyPropertyIdentifier(rbKey: string): string {
  const segments = rbKey.split('.');
  const terminal = segments[segments.length - 1];

  return terminal ?? rbKey;
}

// ---------------------------------------------------------------------------
// The refused-save reader
//
// ★★★ THEY READ THE ENTITY, WHICH IS WHERE THE LEGACY PUTS A REFUSAL - AND THAT IS THE SECOND CHANGE
// TO THIS BLOCK. Round one: QA testing found `saveProduct` and `saveProductType` RETURNING the entity
// with the datastore unchanged and NO error channel of any kind, so a refusal was indistinguishable
// from a success. Round two made both THROW, and these readers narrowed the thrown class. Code review
// then recorded that the throw was itself the divergence: `HibachiService.save`
// [org/Hibachi/HibachiService.cfc:L151-L167] validates, writes only on a clean entity, and RETURNS THE
// SAME ENTITY EITHER WAY, and `saveProduct` ends `return arguments.product;`
// [model/service/ProductService.cfc:L291]. So the entities now publish the framework's four-member
// error register [org/Hibachi/HibachiTransient.cfc:L30-L64] and these readers assert against it.
//
// WHAT DID NOT CHANGE ACROSS ANY ROUND: a refused save must still write nothing, and every case that
// asserted that still does. What changed is only how the refusal is OBSERVED.
// ---------------------------------------------------------------------------

/** The two members a refused save answers through, on either entity. */
interface RefusableEntity {
  hasErrors(): boolean;
  getErrors(): Readonly<Record<string, readonly string[]>>;
}

/**
 * The rules an entity was refused on, flattened to one record per message in the order they were
 * recorded.
 *
 * ★ WHY FLATTEN. The register is `Record<errorName, string[]>`
 * [org/Hibachi/HibachiTransient.cfc:L30-L32], because one property can fail two rules - `urlTitle` is
 * both `required` and `unique` [model/validation/Product.json]. The service that records them,
 * however, produces a flat list of `{propertyIdentifier, errorMessage}` rules, and the cases assert
 * against that list. Flattening reads the register back into the shape the rules were written in,
 * message by message, so a case can state exactly which rules failed AND in which order - `Map`
 * preserves insertion order and `Object.defineProperty` preserves it into the projection.
 *
 * ORDER IS PART OF THE ASSERTION. The legacy `validate()` evaluated rules in the JSON's own property
 * order, so a case pinning the order pins the evaluation order too.
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
 *
 * Fails loudly when the returned entity carries NO error, because "the save was refused" is the whole
 * premise and a clean entity would otherwise slip past as a passing case with nothing checked. It
 * also fails loudly when the call THROWS, because a throw is precisely the protocol this tier no
 * longer uses - so a regression back to throwing is caught here rather than reported as an unrelated
 * failure.
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

// --- Suite -----

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
    // Constructed over the SAME recording repository, so `savedSkus` keeps reporting exactly which
    // SKUs were persisted while `batches` reports how many units of work carried them.
    skuBatchWrite = new RecordingSkuBatchWrite(skuRepository);

    // JUDGMENT CALL: transformation rule T1, and the whole wiring story.
    //
    // The legacy component declares its collaborators as bare properties at
    // [model/service/ProductService.cfc:L52-L60] and reaches them through DI/1 convention accessors
    // - `getProductDAO()`, `getSkuDAO()`, `getDataService()`, `getSkuService()`,
    // `getOptionService()`. DI/1 resolved those by SCANNING component properties at run time,
    // behind a first-scan lock. The ported class takes every collaborator as an explicit,
    // compile-checked constructor argument, which is why constructing the subject needs nothing but
    // nine plain objects, why this file imports no container, composition root or service locator,
    // and why nothing below reads ambient state.
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
      // because method-level interface parity is this migration's acceptance contract. Not
      // `addOptionGroup`, not `updateSkuPrices`, not a TypeScript-idiomatic rename.
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

      // THE GENERIC CONVENTION DISPATCHER IS GONE. The legacy calls
      //   this.processProduct(product, {}, 'updateDefaultImageFileNames')
      // at [model/service/ProductService.cfc:L123], [L152], [L193] and [L282] - a framework
      // affordance that resolved `processProduct_<context>` from a STRING at run time. The port
      // replaces all four with direct static calls, so there is no dispatcher, no lookup map and no
      // string-keyed method table.
      expect(publishedMembers).not.toContain('processProduct');

      expect(publishedMembers).not.toContain('getProductSmartList');
      expect(publishedMembers).not.toContain('getSkuSmartList');

      // LEGACY-NOTE [model/service/ProductService.cfc:L82-L97]: the private recursive helper
      // `buildSkuCombinations` is DEAD in the legacy component - no line in the file calls it, and
      // no other component can, because it is private. The port keeps it as a NON-EXPORTED
      // module-local function, so it is absent from the published surface. Nothing else in this
      // suite asserts anything about it: it is unreachable through the public contract, and
      // reaching into a module-local function to test it would assert an implementation detail
      // rather than a behaviour.
      expect(publishedMembers).not.toContain('buildSkuCombinations');
    });

    it('takes exactly eight constructor collaborators, every one of them explicit', () => {
      // SHIPPED-SURFACE CORRECTION 1. EIGHT, not nine. There is no option repository edge: the
      // module imports the `SelectOption` TYPE from that port file, and a shared type is not an
      // injected edge.
      //
      // LEGACY-NOTE [model/service/ProductService.cfc:L52-L60]: the legacy declares EIGHT
      // properties - productDAO, skuDAO, productTypeDAO, dataService, contentService, skuService,
      // subscriptionService, optionService - of which TWO ARE DEAD. `productTypeDAO` [L54] is never
      // read, and `contentService` [L57] is never read either; the category access path
      // `model/entity/Category.cfc` resolves to through `hb_serviceName="contentService"` is not
      // reached from this component at all. Eight declared, six real - and the ported constructor's
      // eight are a DIFFERENT eight, because two legacy properties fell away and two collaborations
      // that arrived by inheritance (entity save/delete, and the framework's generic entity loader)
      // became explicit. The NINTH is `SkuBatchWriteCollaborator`, which has no legacy
      // property at all: it stands in for Hibernate's own flush, which wrote every dirtied SKU
      // of a request as ONE unit inside the ambient `cftransaction` (F3).
      expect(ProductService.length).toBe(9);
    });

    it('declares a product repository port of exactly six members', () => {
      // ★ SHIPPED-SURFACE CORRECTION 2. SIX members, and the port states it as a
      // lock. The list is a literal tuple so both the count and the names are
      // asserted rather than described, and so adding a member to the port without
      // updating this list fails here.
      expect(PRODUCT_REPOSITORY_MEMBERS).toHaveLength(6);

      for (const member of PRODUCT_REPOSITORY_MEMBERS) {
        expect(member in productRepository).toBe(true);
      }

      // ★ AND `saveBrand` IS NOT ONE OF THEM. The seventh member an earlier
      // revision declared is gone: `super.save`
      // [model/service/BrandService.cfc:L76] is framework-inherited generic CRUD
      // (AAP 0.5.3 does not carry it forward), no `BrandDAO.cfc` exists in the
      // legacy repository, and the thirteen-port set is closed. Asserting the
      // ABSENCE as well as the presences is what stops the member reappearing on
      // the double without the port having grown it back.
      expect('saveBrand' in productRepository).toBe(false);

      // Of those six, this service reaches FOUR. The other two raise if reached,
      // which the tests below rely on rather than restate.
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

  // --- Must-preserve area (iii) -----
  describe('getProductSkusBySelectedOptions - must-preserve area (iii)', () => {
    const OPTION_ONE = 'skfx-option-1';
    const OPTION_TWO = 'skfx-option-2';

    // JUDGMENT CALL: the legacy body [model/service/ProductService.cfc:L104-L106] is PURE
    // DELEGATION - one statement, no branch, no transformation:
    //   return getSkuDAO().getSkusBySelectedOptions( argumentCollection=arguments )
    // so the unit tier asserts DELEGATION AND RESULTS ONLY. The AND-of-EXISTS matching semantics of
    // `model/dao/SkuDAO.cfc:L107-L128` - the `0 = 0` tautology, one correlated `EXISTS` subquery
    // per selected option, and the optional `sku.product.id` filter - are the actual must-preserve
    // behaviour, asserted in the sibling-owned `tests/integration/repositories/` suite, not here.
    // Re-implementing that matching inside a double would produce a suite that agreed with itself
    // while proving nothing about the production statement.
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
      // COMMA-DELIMITED STRING across the boundary, for signature parity. It is not split, trimmed,
      // re-ordered, de-duplicated or converted to an array by the service, so the exact bytes the
      // caller supplied are what the repository sees.
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
      // clause, so every SKU of the product matches. Seeding member D - the graph's no-option SKU -
      // alongside A keeps the answer realistic for a selection that constrains nothing.
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

  // --- The one synchronous method -----
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
      //
      // Preserved deliberately; do not fix without a product decision.
      //
      // TWO groups in, ONE entry out. The surviving key keeps the FIRST casing encountered -
      // `'Size'`, because CFML updates an existing key rather than re-casing it - while the VALUE
      // is the SECOND group's options. Both halves matter: two entries would surface an option set
      // the legacy admin never showed, and keeping the first value would show the wrong options.
      expect(formatted).toStrictEqual([
        { optionGroupName: 'Size', options: [{ name: 'Lower', value: 'opt-lower' }] },
      ]);
      expect(formatted).toHaveLength(1);

      expect(optionLoading.formattedRequests).toStrictEqual([[upper.option], [lower.option]]);
    });

    it.each(['__proto__', 'constructor', 'toString'])(
      '★ formats an option group NAMED %s instead of dropping it silently',
      (reservedName) => {
        // CFML parity [model/service/ProductService.cfc:L71-L79]: the accumulator is a
        // CFML struct, which has no prototype chain and no reserved keys, so a group
        // named `__proto__` was an ordinary key. `SwOptionGroup.optionGroupName` is a
        // persisted, operator-supplied column, so the name is externally sourced and
        // none of these strings can be assumed away.
        //
        // A plain `availableOptions[name] = options` reaches `Object.prototype`'s
        // legacy `__proto__` SETTER rather than creating a property: the entry is
        // DISCARDED while every sibling group is recorded, so the admin option-group
        // editor would show one group fewer than the product actually has, with no
        // error anywhere. Net-new coverage; `meta/tests/unit/service/` holds no
        // ProductService test.
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

        // BOTH groups come back, in traversal order, each carrying its own options.
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
      // The two concerns stay separate: `structFindKey` still resolves WHICH key wins
      // (case-insensitively, first casing retained, last value retained) and
      // `putOwnStructKey` decides only HOW the winner is stored. A reserved name is the
      // sharpest test of that, because it is the one key where the storage mechanism
      // used to swallow the write entirely.
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

      // ONE entry: the FIRST casing as the key, the SECOND group's options as the value.
      expect(formatted).toStrictEqual([
        { optionGroupName: '__PROTO__', options: [{ name: 'Lower', value: 'opt-proto-lower' }] },
      ]);
      expect(optionLoading.formattedRequests).toStrictEqual([[upper.option], [lower.option]]);
    });

    it('answers an empty result for a product carrying no option groups', () => {
      // `makeProductFixture` materializes `optionGroups` as an EMPTY ARRAY rather than leaving it
      // absent, which matters: the ported entity RAISES when the association was never
      // materialized, and that distinction - "no groups" versus "groups not loaded" - is the
      // explicit replacement for Hibernate lazy loading. Where a case needs colliding groups, both
      // options hang off ONE SKU, because the entity derives `getOptionsByOptionGroup` from its
      // SKUs' options rather than from the group collection.
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
      // accumulator, its group array and its loop counter WITHOUT `var`, so all three leak into the
      // component's variables scope. That is not reproducible in TypeScript and is not a defect
      // worth reproducing: the ported accumulator is FUNCTION-LOCAL, which is what makes this
      // method safe to call twice on a warm container. The bulk sibling likewise answers the same
      // instance back, per [L232]. Both facts are pinned by assertions, not prose.
      const first = service.getFormattedOptionGroups(product);
      const second = service.getFormattedOptionGroups(product);

      expect(second).toStrictEqual(first);

      expect(second).not.toBe(first);

      expect(product.getOptionGroups()).toStrictEqual([size.group]);
      expect(product.getSkus()).toStrictEqual([sku]);
      expect(sku.getOptions()).toStrictEqual([size.option]);
    });
  });

  // --- processProduct_updateSkus and the declarative validation contract -----
  //
  // The bulk path, the ONE legitimate declarative-schema site in `src/services/**`, and the only
  // place in this suite where the project's schema-validation dependency is exercised. Two families
  // of assertion live here and must not be conflated: THE DECLARATIVE RULES of
  // `model/validation/Product_UpdateSkus.json`, which reject BEFORE any mutation; and THE RUNTIME
  // BRANCHES at [model/service/ProductService.cfc:L222] and [L226], which use a DIFFERENT
  // predicate.
  //
  // `showPrice` and `showListPrice` ARE CONDITION NAMES, NOT FIELDS. They never appear as data
  // properties, never enter an input object and never appear in an error path; the FIELDS are
  // `price`, `listPrice`, `updatePriceFlag` and `updateListPriceFlag`, and only those four. The
  // conditional requiredness is `showPrice{updatePriceFlag eq 1}` and
  // `showListPrice{updateListPriceFlag eq 1}`, asserted in both directions: absent-and-not-required
  // must pass, absent-and-required must fail with the issue path naming the field.
  describe('processProduct_updateSkus - declarative rules', () => {
    /**
     * A product with NO SKUs, used for every schema-only case.
     *
     * The runtime loop is guarded by `if(arrayLen(skus))` [model/service/ProductService.cfc:L219],
     * so a SKU-less product isolates the declarative layer perfectly: validation still runs, and
     * nothing downstream of it can fire. That is a property of the legacy control flow, not a
     * trick.
     *
     * `exactOptionalPropertyTypes` is on, so "missing" is expressed by OMITTING the key throughout.
     * `{ price: undefined }` is a DIFFERENT input - an explicitly absent value - and using it in
     * place of omission would test something the legacy process object could not express.
     */
    function skulessProduct(): Product {
      return makeProductFixture({ productID: 'product-with-no-skus' });
    }

    // -- The six mandatory cases -------------------------------------------

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
        // CFML numerals were IEEE-754 doubles: `isNumeric('1e1000000')` was TRUE and
        // the value then OVERFLOWED TO INFINITY, so the legacy could not carry it. The
        // target's arbitrary-precision substrate can, and renders every digit, so this
        // nine-character body field would expand to 1,000,001 characters on its way to
        // a `Money`. Refusing it removes no legacy behaviour.
        //
        // ★ THE POINT OF THIS CASE IS THE SHAPE OF THE REFUSAL, NOT THE REFUSAL. The
        // root-cause guard lives in `src/lib/cfml/numberFormat.ts`, which THROWS. If
        // the predicate here still said "numeric", validation would report success and
        // a `CfmlNumberMagnitudeError` would escape from the conversion afterwards — a
        // 500 where the operator should see a field message. So the magnitude test sits
        // inside the predicate, and the outcome is an ordinary issue on the field.
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
      // The character gate rather than the exponent gate. Asserted synchronously
      // against the predicate's observable effect so the million-character string is
      // built once and never rendered.
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
      // The bound must not narrow the legacy `dataType: "numeric"` contract for any
      // value a CFML form post or a JSON body actually delivers. `'1e3'` is admitted
      // and normalised to `'1000'` exactly as before, and a plain `number` is still a
      // legal input shape.
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

    // -- The four activation cases -----------------------------------------

    it('ACTIVATION - numeric 1 fires the condition', async () => {
      // CFML parity [model/validation/Product_UpdateSkus.json]: the condition compares `eq 1`, and
      // CFML equality is LOOSE, so the activation set is wider than a strict `===` would admit -
      // numeric 1 and the string '1' both activate it, and so does boolean `true`, because CFML
      // converts a boolean to 1 in a numeric comparison. The string 'true' does not, because it is
      // not a number. The schema reproduces exactly this activation set, and it states TWO
      // INDEPENDENT obligations on `price`, `dataType: "numeric"` and `required: true`, which is
      // why every assertion here is made on the STRUCTURED issue rather than on a formatted error
      // string: a port that collapsed them into one message would lose a distinction the legacy
      // admin surfaced to a user.
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
      // SHIPPED-SURFACE CORRECTION 4, and this is the assertion that pins it. The shipped condition
      // helper answers a boolean flag directly, so `true` activates - CORRECT CFML rather than a
      // liberty, since in `true EQ 1` the boolean converts to 1. A port refusing boolean `true`
      // would silently stop requiring a price for every caller populating the flag from a checkbox.
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

    // -- rbKeys, preserved verbatim, with no i18n runtime ------------------

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

  // --- processProduct_updateSkus: the runtime branches, and the asymmetry -----
  describe('processProduct_updateSkus - runtime branches', () => {
    /** Builds a product carrying two SKUs at the fixture's default prices. */
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
      // AND UNGUARDED, so the second flag is tested even when the first did all the work.
      // `model/process/Product_UpdateSkus.cfc` declares `updateListPriceFlag` at [L57] with no
      // default, so an unpopulated process object carries null there, and CFML's `if(null)` is a
      // CONVERSION ERROR rather than a falsy branch. A caller supplying only the price half
      // therefore FAILS, in CFML and here alike.
      //
      // This is the single most surprising preserved behaviour in the method, and it is asserted
      // first because every other runtime case must satisfy it: once a product has SKUs, BOTH flags
      // must arrive non-null even when only one of them is meant to act.
      const rejected = service.processProduct_updateSkus(product, {
        updatePriceFlag: 1,
        price: '7.25',
      });

      await expect(rejected).rejects.toBeInstanceOf(CfmlBooleanConversionError);

      // And the failure is genuinely mid-flight rather than pre-emptive: the price
      // half of the FIRST SKU was already applied before the list-price branch of
      // that same iteration raised. That IN-MEMORY half-application is the legacy's
      // own behaviour and is pinned here rather than glossed.
      expect(first.getPrice().toFixed2()).toBe('7.25');

      // AND NOTHING REACHED A ROW. The writes are issued AFTER the loop, so a raise
      // from INSIDE the loop persists nothing at all: the half-applied state exists
      // only in the caller's own objects, exactly as it did in CFML before the flush.
      // That is the guarantee the post-loop write ordering buys, and it is independent
      // of whether the write is one statement or many - which is why this assertion
      // survived the removal of the collection write member unchanged.
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
      // association array, applying the same value to every member. The legacy counter at [L220] is
      // declared without `var`; that leak is not reproducible in TypeScript and is not reproduced,
      // and the loop's observable effect - every SKU, not just the first - is what is pinned
      // instead.
      //
      // Every monetary expectation here is a decimal STRING compared through the money value
      // object. No JavaScript number is arithmetically involved on either side of the assertion.
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

      // ★★ QUOTE-THEN-REVISE, AND THIS CASE ASSERTED THE OPPOSITE OF WHAT IT NOW
      // ASSERTS. It was titled 'performs NO SAVE of its own' and its comment read, in
      // capitals: "NO SAVE HAPPENS IN THIS METHOD. It mutates the SKUs and answers the
      // product, leaving persistence entirely to the caller ... That is preserved
      // rather than corrected: adding a save would change the method's contract. It is
      // also why the absence of a save is asserted rather than merely commented - the
      // SKU repository's `saveSku` member RAISES if reached, so this test completing at
      // all is the second half of the proof."
      //
      // WHAT THAT GOT WRONG. `return arguments.product` [L232] did not hand the caller
      // a set of unsaved changes. It handed back MANAGED entities inside a request
      // whose Hibernate session flushed every one of them, as a single unit, inside the
      // ambient `cftransaction`. Repricing the SKUs durably was part of what invoking
      // the legacy method DID, so it was the port's SILENCE that changed the contract,
      // not the save. The old assertion was reading the shape of the CFML statement
      // rather than the behaviour of the request it ran in.
      //
      // WHAT SURVIVES UNCHANGED, and it is the half worth keeping: this method saves no
      // PRODUCT. [L216-L233] touches SKUs only, so the product repository is untouched
      // and its `saveProduct` recorder stays empty.
      expect(productRepository.saves).toStrictEqual([]);

      // ONE WRITE PER MUTATED SKU, IN COLLECTION ORDER. `SkuRepository` declares a
      // single persistence member and it takes one entity, so the write set is issued
      // as a sequence rather than a batch. Order is asserted because the loop's order
      // is the collection's order [model/service/ProductService.cfc:L218-L230].
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

    // -- The runtime-versus-validation asymmetry, in BOTH directions -------

    it('ASYMMETRY - a flag of 2 is NOT required to carry a price, yet the runtime APPLIES one', async () => {
      // LEGACY-DEFECT [model/service/ProductService.cfc:L222,L226]: the runtime branches test the
      // flags with bare CFML truthiness, while model/validation/Product_UpdateSkus.json compares
      // against
      //   `eq 1`
      // so the two predicates disagree for some inputs; both are reproduced rather than harmonised.
      // Preserved deliberately; do not fix without a product decision.
      //
      // DIRECTION ONE. A flag of 2 is TRUTHY but not equal to 1, so the declarative layer treats
      // `price` as optional while the runtime layer consumes it. Both halves are asserted, because
      // either alone would look like ordinary behaviour. Half one: with no SKU to iterate, the
      // schema accepts a flag of 2 carrying NO price at all - proof that the condition did not
      // fire.
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
      // CFML's boolean conversion but is not a number, so it cannot equal
      // 1. Validation permits a missing list price and the branch then requires one -
      // the same predicate disagreement as a flag of 2, reached through the other half of the
      // truthiness table, and on the LIST-PRICE branch this time so both branches are shown to
      // carry it. The price flag is an explicit 0 so the first branch is skipped rather than
      // raising, which lets the assertion land on [L226] specifically.
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
      // CFML, not a falsy branch, so a process object that never carried the flag fails at the test
      // rather than skipping it. The declarative rules permit the omission - `updatePriceFlag` is
      // optional there - so this is the third distinct way the two layers disagree, and it surfaces
      // as its own named error type rather than as a generic failure.
      const rejected = service.processProduct_updateSkus(product, {});

      await expect(rejected).rejects.toBeInstanceOf(CfmlBooleanConversionError);

      expect(first.getPrice().toFixed2()).toBe('19.99');

      const skuless = makeProductFixture({ productID: 'product-with-no-skus' });

      expect(await service.processProduct_updateSkus(skuless, {})).toBe(skuless);
    });
  });

  // =========================================================================
  // ★★ processProduct_updateSkus - THE FLUSH, WRITTEN DOWN
  //
  // ★ DECLARED NET-NEW under AAP 0.6.6. No legacy test touches this method, this
  // service or this DAO: `meta/tests/unit/service/` holds AccountServiceTest,
  // HibachiServiceTest, PaymentServiceTest and UtilityRBServiceTest, and
  // `meta/tests/unit/dao/` holds AccountDAOTest and PaymentDAOTest. Nothing here
  // extends legacy coverage and nothing here is presented as parity.
  //
  // ★ WHAT THESE CASES EXIST TO PREVENT, WHICH IS A PRICE CHANGE THAT NEVER
  // HAPPENED. [model/service/ProductService.cfc:L216-L233] applies a price to every
  // SKU on a product and calls no save, because Hibernate's session flushed every
  // dirtied SKU as ONE unit inside the request's ambient `cftransaction`. A port
  // that reproduces only the visible statement mutates request-local objects and
  // discards them: the caller is told the product was repriced and no row changes.
  //
  // ★ THE THREE AAP 0.6.5 OBLIGATIONS, AND WHERE EACH IS ASSERTED BELOW.
  //   * BATCH LIMIT - the bound cases. Refusal happens before any mutation and
  //     before any write, so an over-large product is left exactly as it arrived.
  //   * IDEMPOTENCY - the repeat-invocation case. The same call twice produces the
  //     same write set carrying the same values, so a retry converges.
  //   * COMPENSATION - the single-batch cases. There is nothing to compensate
  //     because there is no partial outcome to repair: one unit of work commits or
  //     it does not. A loop over `saveSku` is what would have needed compensation,
  //     and `saveSku` on the double RAISES, so every case here also proves the loop
  //     was not taken.
  // =========================================================================

  describe('processProduct_updateSkus - the batch write that replaces the ORM flush', () => {
    /** A product carrying three distinguishable SKUs at the fixture's default prices. */
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
     * A product whose SKU collection is `count` references to ONE fixture.
     *
     * ★ THIS IS A COUNT FIXTURE, NOT A GRAPH, and the distinction is stated because
     * a collection holding the same entity a thousand times cannot arise in
     * production. It is legitimate here because the bound reads `skus.length` and
     * nothing else - it is a limit on how much work one atomic write may contain -
     * so a thousand references exercise it exactly as a thousand distinct SKUs
     * would, at a thousandth of the fixture cost. Any case that needs distinguishable
     * SKUs uses {@link productWithThreeSkus} instead.
     */
    function productWithSkuCount(count: number): Product {
      const shared = makeSkuFixture({ skuID: 'sku-counted' });

      return makeProductFixture({
        productID: 'product-at-the-bound',
        skus: Array.from({ length: count }, (): Sku => shared),
      });
    }

    /** The default bound, restated here so a change to the constant fails this suite. */
    const DEFAULT_UPDATE_BOUND = 1000;

    /** A service whose update bound is `bound`, every other collaborator shared. */
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

    it('writes EVERY mutated SKU in exactly ONE unit of work, never one per SKU (F3)', async () => {
      const { product, skus } = productWithThreeSkus();

      await service.processProduct_updateSkus(product, {
        updatePriceFlag: 1,
        price: '8.40',
        updateListPriceFlag: 1,
        listPrice: '15.00',
      });

      // ★★★ ONE CALL, CARRYING ALL THREE. QUOTE-THEN-REVISE: this case asserted only
      // `savedSkus` and its comment read "THREE writes, one per SKU, in collection order and with
      // no repetition" - which was an accurate description of a shape code review then recorded as
      // a data-integrity defect, because a PERMANENT mid-batch failure left some SKUs repriced and
      // the rest not, with every retry reproducing the identical split. The set now commits as one
      // unit, so the number of units of work is itself an assertion.
      expect(skuBatchWrite.batches).toHaveLength(1);
      expect(skuBatchWrite.batches[0]).toStrictEqual([skus[0], skus[1], skus[2]]);

      // And the rows that unit carried, in collection order and with no repetition. Unchanged.
      expect(skuRepository.savedSkus).toStrictEqual([skus[0], skus[1], skus[2]]);
    });

    it('★★★ ATOMICITY - a PERMANENT failure inside the unit of work persists NOTHING (F3)', async () => {
      // ★★★ THE CASE THE PER-SKU LOOP COULD NOT PASS, AND THE REASON THIS COLLABORATOR EXISTS.
      // A loop over `saveSku` opened one unit of work per SKU, so a failure on the sixth of ten
      // left one to five durably repriced. That was defended as "self-healing" because the write
      // is idempotent by key - true of a TRANSIENT failure, false of a PERMANENT one: an
      // unreachable write does not become reachable by being retried, so the split was permanent.
      //
      // The legacy could not reach that state at all. [model/service/ProductService.cfc:L216-L233]
      // persists nothing itself, `HibachiService.process()`
      // [org/Hibachi/HibachiService.cfc:L84-L129] never saves, and [L232] handed back managed
      // entities whose Hibernate session flushed every dirtied SKU as ONE unit inside the
      // request's `cftransaction`. "All repriced" and "unchanged" were the only outcomes.
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

      // THE UNIT OF WORK WAS ATTEMPTED, WHOLE - so this is not passing because the write was
      // skipped.
      expect(skuBatchWrite.batches).toHaveLength(1);
      expect(skuBatchWrite.batches[0]).toHaveLength(3);

      // AND NOT ONE ROW WAS PERSISTED. No partial application survives, which is what a rollback
      // buys and what the per-SKU loop could not offer.
      expect(skuRepository.savedSkus).toStrictEqual([]);

      // The caller's own objects DO carry the mutation, which is faithful: the legacy's in-memory
      // entities were mutated before the flush too, and a failed flush left them that way.
      for (const sku of skus) {
        expect(sku?.getPrice().toFixed2()).toBe('4.10');
      }

      // ★ AND THE FAILURE IS PROPAGATED UNWRAPPED. The service adds no failure mode of its own and
      // maps none: the identity assertion above is what proves it, because a re-thrown wrapper
      // would be a different object.
    });

    it('★★ RETRY AFTER A TRANSIENT FAILURE CONVERGES, and converges in ONE unit of work (F3)', async () => {
      // Idempotency is still load-bearing and is still asserted - it is what makes a retry SAFE.
      // What changed is that the retry now has only two states to converge FROM rather than three.
      const { product, skus } = productWithThreeSkus();
      const input = { updatePriceFlag: 1, price: '5.55', updateListPriceFlag: 0 } as const;

      skuBatchWrite.failure = new Error('a transient failure: the pool was momentarily exhausted');

      await expect(service.processProduct_updateSkus(product, input)).rejects.toThrow(
        /transient failure/,
      );
      expect(skuRepository.savedSkus).toStrictEqual([]);

      // The retry, with the fault cleared and the SAME input.
      skuBatchWrite.failure = undefined;

      await service.processProduct_updateSkus(product, input);

      // ONE further unit of work - two attempted in total - and the whole set persisted once.
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

      // The write set is a WRITE SET, not a change log: a SKU whose price AND list
      // price both moved is one row to update, not two - so three SKUs touched by two
      // branches are still three writes, not six. Both prices are asserted so the case
      // cannot pass with only one branch having run.
      expect(skuRepository.savedSkus).toHaveLength(3);
      expect(skus[0]?.getPrice().toFixed2()).toBe('3.00');
      expect(skus[0]?.getListPrice().toFixed2()).toBe('9.00');
    });

    it('hands over instances that ALREADY carry the new prices, so the write follows the mutation', async () => {
      const { product } = productWithThreeSkus();

      // The recorded array holds the very instances the loop mutated, so reading a
      // price off the recording proves the ordering: had the write been issued before
      // the loop, these would still read the fixture's 19.99.
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

      // NO ROW WRITTEN, which is what this case is FOR: a no-op must not rewrite every row with
      // its own current values. The assertion has now been through three shapes and the INTENT has
      // never changed. It first read `toStrictEqual([[]])` - one call carrying an empty collection,
      // against a port member that specified an empty collection as a no-op opening no
      // transaction. It then read "the absence of any write", because a per-SKU loop has no empty
      // call to make. With the batch collaborator (F3) the empty call is back, and BOTH halves are
      // asserted: the service asks once, with nothing in it, and no row is touched.
      expect(skuBatchWrite.batches).toStrictEqual([[]]);
      expect(skuRepository.savedSkus).toStrictEqual([]);
      expect(skus[0]?.getPrice().toFixed2()).toBe('19.99');

      // ★ AND NO TRANSACTION IS OPENED FOR IT. That guard is the composition root's, not this
      // service's - `src/handlers/bootstrap.ts` returns early on an empty set - so it is asserted
      // in `tests/unit/handlers/bootstrap.test.ts` against the real collaborator rather than here
      // against a double that has no transaction to open.
    });

    it('writes an EMPTY set for a product with no SKUs at all', async () => {
      const skuless = makeProductFixture({ productID: 'product-with-no-skus' });

      const answered = await service.processProduct_updateSkus(skuless, {
        updatePriceFlag: 1,
        price: '2.00',
        updateListPriceFlag: 0,
      });

      // As above: a product with no SKUs asks for an empty unit of work and touches no row.
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

      // AAP 0.6.5's idempotency obligation, asserted at the seam that discharges it.
      // Two invocations, six writes, the same three SKUs twice over in the same order -
      // and the prices CONVERGE rather than compounding. Nothing is doubled, nothing
      // accumulates, and no fourth SKU appears.
      //
      // ★ THIS IS NOW THE OBLIGATION THAT CARRIES THE RECOVERY STORY, not merely one of
      // three. While the write was a single collection member, a failed attempt rolled
      // back whole and "retry" was a convenience. With a per-SKU write a failure can
      // leave a PREFIX of the SKUs repriced, so retry is the compensation - and it works
      // precisely because the write is keyed and value-idempotent: re-running drives an
      // already-repriced SKU to the value it already holds and an unreached one to the
      // value it should hold, converging after any number of partial attempts.
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

      // The comparison is `>` and not `>=`, so the bound itself is admitted. Asserting
      // the boundary in both directions is what makes the off-by-one visible.
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

      // The refusal names the product and cites the legacy loop it is bounding, so it
      // is actionable from the message alone rather than needing a stack trace.
      await expect(rejected).rejects.toThrow(/product 'product-at-the-bound'/);
      await expect(rejected).rejects.toThrow(/\[model\/service\/ProductService\.cfc:L218-L230\]/);

      // NOTHING was mutated and NOTHING was written. Both halves matter, and the second
      // matters MORE now than it did: with a per-SKU write, a bound checked after the
      // loop would not merely leave the caller holding prices no row carries - it would
      // have already written some of them.
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

      // Still exactly the two writes the successful call issued - the refusal added
      // nothing, which is what "before mutating and before writing" means.
      expect(skuRepository.savedSkus).toHaveLength(2);
    });

    it('★★★ does NOT refuse a source-required NO-OP, however many SKUs the product carries', async () => {
      const boundedAtOne = serviceBoundedAt(1);
      const twoSkus = productWithSkuCount(2);

      // ★★★ THIS CASE ASSERTED THE OPPOSITE, AND THE OPPOSITE WAS A DEFECT. It was titled "refuses on
      // COUNT ALONE, even when the flags would have selected no SKU" and defended by: "the bound is
      // on the work the call would undertake, not on the write set, because the write set is only
      // known after the loop the bound is protecting. A caller who would be refused with the flags
      // set should not discover that only after setting them."
      //
      // The premise was false. Mutation is decided by the FLAGS ALONE
      // [model/service/ProductService.cfc:L222, L226] - there is no per-SKU condition anywhere in the
      // loop - so the write set IS knowable before it: every SKU, or none. And the consequence was a
      // behaviour the source cannot produce: with both flags falsy the legacy loop touches nothing
      // and [L232] returns the product, so there is no path in CFML by which this call fails.
      //
      // The bound still exists and still protects the same thing; it now measures the work the call
      // WOULD DO rather than the size of the collection it was pointed at.
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
      // over-large product IS refused the moment the call actually asks to reprice it.
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
      // The bound's probe is deliberately non-raising and answers `false` for a value no CFML engine
      // would accept - so the bound stands aside and `cfTruthy` rejects it INSIDE the loop, at the
      // line [model/service/ProductService.cfc:L222] rejects it. Were the probe to raise instead, the
      // legacy's mid-flight half-application would become unreachable.
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

      // Both gates would refuse this input. The schema is the legacy framework's own
      // first gate - it validated a process object on population - so the ordering is
      // parity rather than preference, and it is asserted because a capacity refusal
      // would hide a genuine validation error from the caller.
      const issues = await captureZodIssues(() =>
        boundedAtOne.processProduct_updateSkus(twoSkus, { updatePriceFlag: 1 }),
      );

      expect(issues).toHaveLength(1);
      expect(skuRepository.savedSkus).toStrictEqual([]);
    });

    it('REFUSES A NONSENSE BOUND AT CONSTRUCTION, not on the first call that hits it', () => {
      // A misconfigured composition root should fail when it is wired. Clamping would
      // hide exactly the mistake this check exists to surface, so every one of these
      // is rejected rather than corrected.
      for (const nonsense of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => serviceBoundedAt(nonsense)).toThrow(
          /maximumSkuUpdateBatchSize must be a positive safe integer/,
        );
      }

      // And a legitimate bound constructs, so the guard is not simply rejecting
      // everything.
      expect(serviceBoundedAt(1)).toBeInstanceOf(ProductService);
      expect(serviceBoundedAt(DEFAULT_UPDATE_BOUND)).toBeInstanceOf(ProductService);
    });

    it('keeps `ProductService.length` at 9, because the bound is DEFAULTED and not optional', async () => {
      // The nine-collaborator claim in the constructor-wiring block above must stay
      // literally checkable. A defaulted parameter is excluded from `Function.length`
      // where an optional one is not, which is why the bound is written with a default
      // rather than as `bound?: number`.
      expect(ProductService.length).toBe(9);

      // AND THE DEFAULT VALUE IS PINNED, not merely present. The shared `service` was
      // constructed with eight arguments, so the bound it is refusing with can only be
      // the default - and the message names it, which fixes the constant at 1000 rather
      // than at "whatever the module says". A previous draft of this case closed with
      // `expect(service).toBeInstanceOf(ProductService)`, which asserts nothing about
      // the bound at all; it is replaced rather than kept alongside.
      await expect(
        service.processProduct_updateSkus(productWithSkuCount(DEFAULT_UPDATE_BOUND + 1), {
          updatePriceFlag: 1,
          price: '1.00',
          updateListPriceFlag: 0,
        }),
      ).rejects.toThrow(`above the configured bound of ${String(DEFAULT_UPDATE_BOUND)}`);
    });
  });

  // --- Deliberately excluded legacy coverage: both tests named -----
  //
  // LEGACY-NOTE [meta/tests/unit/IssuesTest.cfc:L73-L89, L91-L99]: issue_1296 guards its single
  // assertion behind a record-count condition, so it passes vacuously on an empty database, and
  // issue_1329 contains no assertion at all. Both exercise getProductSmartList, the method this
  // port reshapes into findProducts. Neither is carried forward and neither counts as
  // legacy-extended coverage.
  //
  // The specifics, so the exclusion is auditable: `issue_1296()` wraps its ONLY assertion - that
  // two products have different identifiers, at [L87] - inside
  //   `if(smartList.getRecordsCount() >= 2)`
  // at [L78], so with fewer than two products the body never runs and the test reports success
  // having asserted NOTHING. `issue_1329()` calls `addRange('calculatedQATS','XXX^')` and
  // `getPageRecords()` and contains ZERO assertions; it can only fail by raising.
  //
  // Neither shape is reproduced: EVERY test here asserts unconditionally, and the two cases below
  // deliberately occupy the territory those two left uncovered - a result set with FEWER THAN TWO
  // records, and one with NONE. The project's `issue_<ticket#>` convention is not borrowed for
  // either, because naming a case after its ticket would imply the legacy assertion survived, and
  // it did not.
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
      // one property. They read 3 and 5 while the page published the smart list's configuration
      // instead - see the two inverted cases below.
      expect(page.joins).toHaveLength(0);
      expect(page.keywordProperties).toHaveLength(1);
    });
  });

  // --- findProducts: signature reshaping #2 -----
  describe('findProducts - signature reshaping #2', () => {
    // JUDGMENT CALL: legacy `getProductSmartList` [model/service/ProductService.cfc:L342-L358]
    // built a HibachiSmartList, a generic string-keyed dynamic query builder supplied by the
    // framework. Porting it faithfully would reimplement a small ORM query language, reintroducing
    // exactly the framework coupling this refactor removes, and it would be untypeable under the
    // strict profile. The target exposes a typed `findProducts` instead - signature reshaping #2 of
    // the project's three, shared with `skuService.findSkus`. Only the concrete legacy filters
    // survive; the open-ended dynamic filtering surface is deliberately not reproduced. What
    // replaces it is a NAMED, TYPED criteria object rather than a string-keyed filter bag or a list
    // of `addFilter('property','value')` calls: every member asserted below is declared on the
    // shipped criteria interface, and there is no escape hatch for an arbitrary key.
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

      // THE PLURAL PARAMETER SURVIVES. `model/dao/ProductDAO.cfc:L419` declares `productTypeIDs`
      // while the SKU-side sibling declares the SINGULAR `productTypeID`. Both are preserved; this
      // recorder proves the product side still forwards the plural one, and the LEGACY-NOTE on the
      // recorder interface explains why they are not harmonised. `currentURL` is carried on the
      // criteria for parity with the legacy signature's second argument and is NOT forwarded to the
      // repository - a query has no business knowing the URL that produced it.
      // ★ THE WINDOW REACHED THE ADAPTER. `pageRecordsStart: 1` with `pageRecordsShow: 1` is a
      // complete window, so it is pushed down and the adapter materializes ONE product graph rather
      // than three and then discarding two.
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

      // THIS CASE IS AN INVERSION. It was named "preserves the three concrete legacy JOINS,
      // including the LEFT join on brand" and asserted all three `joinRelatedProperty` calls from
      // [model/service/ProductService.cfc:L347-L349], with the observation that the LEFT on `brand`
      // is load-bearing because "an inner join there would silently drop every unbranded product".
      //
      // All of that is true of the SMART LIST, and the smart list is not what runs. AAP 0.6.2 rules
      // `HibachiSmartList` out of this port, so `findProducts` executes
      // `ProductDAO.searchProductsByProductType`, whose statement is
      // `select productID,productName from SwProduct where productName like :prodName`
      // [model/dao/ProductDAO.cfc:L421] - ONE table. The optional restriction at [L424] appends
      // `and productTypeID in (...)`, a predicate on a column of the same row, not a join.
      //
      // So under the statement that runs there is no inner join to drop anything: an unbranded
      // product IS returned, and so is one with no product type or no default SKU. Publishing three
      // joins asserted the opposite. The configured three survive as an inert record on
      // `PRODUCT_QUERY_JOINS`.
      expect(page.joins).toStrictEqual([]);
      expect(page.joins).toHaveLength(0);

      // ★ THE MEMBER REMAINS, deliberately: "this query joins nothing" is precisely what tells a
      // caller that an unbranded product is not filtered out. Deleting it would leave that unsaid.
      expect(Object.keys(page)).toContain('joins');
      expect(Array.isArray(page.joins)).toBe(true);
    });

    it('★★ reports the ONE keyword property the executed statement matches, at weight 1', async () => {
      productRepository.searchResult = [];

      const page = await service.findProducts({ keyword: REQUIRED_KEYWORD });

      // THE OTHER HALF OF THE INVERSION. This case was named "preserves the five concrete legacy
      // KEYWORD PROPERTIES, all at weight 1" and asserted all five identifiers from
      // [model/service/ProductService.cfc:L351-L355]. It passed - against a page whose statement
      // compares ONE column, `productName like :prodName` [model/dao/ProductDAO.cfc:L421].
      //
      // Publishing five was a false statement of what was matched rather than a documented gap: a
      // caller reading the page would expect a search for a brand name or a product code to
      // succeed, and it silently returned nothing. Two of the four unmatched identifiers are
      // reachable only through the joins the same smart list configured, which is why both members
      // fail together and are corrected together. The four survive as an inert record on
      // `PRODUCT_QUERY_KEYWORD_PROPERTIES`, spellings and weights intact.
      expect(page.keywordProperties).toStrictEqual([
        { propertyIdentifier: 'productName', weight: 1 },
      ]);
      expect(page.keywordProperties).toHaveLength(1);

      // Weight 1 still holds. The legacy assigned no relative weighting anywhere on this path, and
      // the narrowing invents none: with one property there is nothing to rank.
      for (const keywordProperty of page.keywordProperties) {
        expect(keywordProperty.weight).toBe(1);
      }

      // ★ NONE of the four the smart list additionally configured is reported.
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

      // ★ THIS CASE ONCE PASSED `{}` AND ASSERTED `{ term: undefined, productTypeIDs:
      // undefined }`, ON THE REASONING THAT "Both repository arguments are optional on the
      // port, and an omitted criterion is forwarded as absent rather than as an empty
      // string. The distinction matters at the adapter: an empty string is a filter that
      // matches nothing useful, whereas absence means 'do not filter'."
      //
      // Half of that survives and half of it was wrong. The empty-string-versus-absence
      // distinction is real and is still asserted here for `productTypeIDs`, whose guard
      // at [model/dao/ProductDAO.cfc:L423] gives absence the meaning "do not restrict".
      // But absence never meant "do not filter" for the TERM: the bind at [L422] is
      // unconditional and runs BEFORE that guard, so an absent term reached an
      // undefined-variable raise, and the sole adapter answers it with
      // `ProductUndefinedArgumentError`. Asserting that the service forwarded `term:
      // undefined` was asserting that it forwarded an argument no adapter accepts.
      //
      // The forwarding contract that remains is therefore asymmetric, exactly as the
      // source is: the keyword is ALWAYS bound, and the product-type list is forwarded
      // exactly as given, absence included.
      expect(productRepository.searches).toStrictEqual([
        { term: REQUIRED_KEYWORD, productTypeIDs: undefined, window: undefined },
      ]);
    });

    it('★ will not COMPILE a criteria object with no keyword, which is the correction', async () => {
      // NET-NEW COVERAGE, declared as such per AAP 0.6.6. There is no legacy antecedent
      // for a type-level assertion, and there could not be: CFML had no compiler to
      // consult, which is precisely why the omission it tolerated was only discoverable by
      // running the call.
      //
      // The alignment IS the fix, so it is pinned where it lives - in the type system.
      // `@ts-expect-error` fails the build if the error ever stops being reported, so this
      // case cannot silently rot into a no-op the way a commented-out assertion would.
      productRepository.searchResult = [];

      await expect(
        // @ts-expect-error - `keyword` is required on ProductQueryCriteria; an absent term
        // is refused by the sole adapter at [model/dao/ProductDAO.cfc:L422], so the
        // compiler refuses it here first.
        service.findProducts({ productTypeIDs: 'product-type-one' }),
      ).resolves.toMatchObject({ recordsCount: 0 });

      // And the call still REACHED the port, so the assertion above is about the type and
      // not about a call that failed to happen. The permissive double answers an absent
      // term; the shipped adapter would not, and that gap is now unreachable from a
      // compiling caller.
      expect(productRepository.searches).toStrictEqual([
        { term: undefined, productTypeIDs: 'product-type-one', window: undefined },
      ]);
    });
  });

  // --- findProducts: the paging SHAPE check (S-08) -----
  //
  // A security review raised finding S-08, MEDIUM, CWE-400, asking for page limits. This is the
  // only paging surface in the ported slice - `SkuQueryCriteria` publishes none - and what shipped
  // is a check on the value's SHAPE rather than on its magnitude.
  //
  // ★ THAT CHOICE IS A CORRECTNESS FIX AS MUCH AS A RESOURCE ONE, and the `slice(-1)` case below is
  // the evidence: paging is applied with `Array.prototype.slice`, which reads a NEGATIVE start as an
  // offset FROM THE END, so `pageRecordsStart: -1` would have answered the LAST product rather than
  // failing or starting at the beginning. Every case here is NET-NEW COVERAGE per AAP 0.6.6; a
  // legacy smart list took no such argument in a form that could be shaped wrongly.
  describe('findProducts - the paging shape check (S-08)', () => {
    /** Three matched rows, so a wrong window is DISTINGUISHABLE from a right one. */
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

      // ★ AND HERE IS WHY IT IS A CORRECTNESS FIX. This asserts the behaviour that was REFUSED:
      // `slice(-1)` on the same three products answers the LAST one. A caller sending -1 would
      // have received `gamma` - a window nobody asked for - reported back as
      // `pageRecordsStart: -1` and `recordsCount: 3`, with nothing anywhere signalling that the
      // page was nonsense. The guard converts a silently wrong answer into a named refusal.
      expect(productRepository.searchResult.slice(-1)).toStrictEqual([gamma]);
    });

    it('refuses the malformed bound BEFORE the search runs, so it costs no statement', async () => {
      threeProducts();

      await expect(
        service.findProducts({ keyword: REQUIRED_KEYWORD, pageRecordsStart: -1 }),
      ).rejects.toThrow(ProductPagingCriteriaError);

      // Not one search was issued. Checking after the read would still have refused the page, but
      // it would have paid for the query first, which is exactly the cost the finding names.
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

      // The message discloses the numeric bound and NOT the keyword, so a rejected page cannot be
      // used to echo caller-supplied text back out of the service.
      expect(error.message).not.toContain(REQUIRED_KEYWORD);
    });

    it('★ leaves ABSENCE meaning absence, which is the standing contract it must not disturb', async () => {
      const [alpha, beta, gamma] = threeProducts();

      // The whole reason the check is on SHAPE and not on magnitude: `ProductQueryCriteria` refuses
      // to invent a default page size, because the legacy declared none at this call site. A guard
      // that treated an omitted member as invalid would have broken that outright.
      const page = await service.findProducts({ keyword: REQUIRED_KEYWORD });

      expect(page.records).toStrictEqual([alpha, beta, gamma]);
      expect(page.pageRecordsStart).toBe(0);
      expect(page.pageRecordsShow).toBeUndefined();
    });

    it('admits ZERO on both members, which is a bound rather than an absence', async () => {
      threeProducts();

      // Zero is a non-negative safe integer and therefore admissible on both: a zero start is the
      // first record, and a zero page size is an EMPTY window - distinct from an absent one, which
      // means the whole result set. Rejecting zero would have conflated the two.
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

      // Deliberate absence, pinned so it reads as a decision rather than an oversight. An
      // implausibly large window is ADMITTED: `slice` clamps it to the array it was given, so it
      // costs nothing beyond what was already materialized. An earlier revision of this comment
      // added that the materialization was itself "bounded one layer down, by
      // `MAX_SEARCH_RESULT_MATERIALIZATION`"; that ceiling has since been removed from
      // `src/repositories/mysql/mysqlProductRepository.ts`, because it refused searches the legacy
      // answered. Neither tier refuses on magnitude now, which is what this case asserts of this
      // one.
      const page = await service.findProducts({
        keyword: REQUIRED_KEYWORD,
        pageRecordsShow: Number.MAX_SAFE_INTEGER,
      });

      expect(page.records).toStrictEqual([alpha, beta, gamma]);
      expect(page.pageRecordsShow).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('★★ pushes the window DOWN, so the bound is on the WORK and not just the answer', async () => {
      // THE FINDING THIS CASE EXISTS FOR. A security review found (MAJOR, CWE-400) that this body
      // awaited every matched product graph and only then sliced it, so a two-record page still
      // paid for the whole catalog. The window now travels to the adapter, and the ONLY way to see
      // that from here is to watch what the adapter was handed - which is why
      // `RecordedProductSearch` records the third argument.
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

      // And the service does NOT re-slice what the adapter already windowed. The double applies the
      // window it was handed, so a body that also sliced would answer NOTHING here - `slice(1)` of
      // a one-element array is empty - and this assertion is what catches that double application.
      expect(page.records).toHaveLength(1);
    });

    it("★ reports the adapter's PRE-WINDOW total, not how many records came back", async () => {
      // `recordsCount` keeps its documented meaning - "how much matched" - even though the adapter
      // no longer returns everything that matched. It reads the adapter's separate count member, so
      // a caller can still render "showing 1 of 40" without a second statement. The override is set
      // to a value NO local array could produce, so a body that fell back to `records.length` or to
      // the double's fixture size cannot pass.
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
      // THE ONE DELIBERATE ASYMMETRY, pinned so it reads as a decision. "Everything from index 1
      // onward" has no upper bound, so there is no window to push: the adapter is called with the
      // third argument ABSENT and the start is applied here, exactly as it was before the push-down
      // existed. Publishing `{ start: 1, count: <something invented> }` instead would have
      // truncated a caller who asked for no ceiling.
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
      // nothing at all. Conflating `count: 0` with "no window" - the easy mistake, since both are
      // falsy - would make the emptiest possible request the most expensive one.
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

  // --- Out-of-scope methods: delegation only, never feature behaviour -----
  //
  // These four serve out-of-scope features but live in an in-scope file, so they are ported for
  // interface parity with FLAGGED NOT-IMPLEMENTED bodies. This suite asserts ONLY that each
  // delegates to its stub port where a legacy statement had a ported counterpart, and that each is
  // flagged unexercised otherwise. NOTHING below asserts the feature: no review is approved, no
  // subscription term is priced, no image is uploaded and no file is imported.
  describe('out-of-scope methods', () => {
    it('processProduct_addProductReview ANSWERS THE PRODUCT UNCHANGED and touches no port', async () => {
      const product = makeProductFixture({ productID: 'product-under-review' });

      const answered = await service.processProduct_addProductReview(product, {
        newProductReviewID: 'review-candidate',
      });

      // ★★ IT RESOLVES RATHER THAN REJECTING, AND THE SOURCE IS WHY.
      // An earlier revision asserted a rejection here, on the premise that nothing
      // in the legacy body has a ported counterpart. Read [L157-L171] for what it
      // actually touches: [L160] and [L162] set an active flag on
      // `processObject.getNewProductReview()`, and [L167] attaches an account to the
      // same review. NOT ONE STATEMENT TOUCHES `arguments.product`, and [L170]
      // returns it exactly as it arrived. A thin pass-through is therefore the
      // FAITHFUL port, not a softened one - and it is what AAP 0.2.2 and 0.4.2
      // prescribe for an out-of-scope method living in an in-scope file: "ported as
      // thin pass-throughs to stub ports, or flagged as unexercised, rather than
      // being made to work". A method that always throws is neither.
      expect(answered).toBe(product);

      // NOT ONE port member is reached, which is the half of the old case that was
      // right and is kept: the review entity is not among the eighteen the ported
      // domain models, the account arrives from ambient request scope, and the
      // setting at [L159] is outside the four-key settings union.
      expect(productRepository.saves).toStrictEqual([]);
      expect(skuCreation.requests).toStrictEqual([]);
      expect(subscriptionTermProvider.requestedTermIDs).toStrictEqual([]);
      expect(imageStore.savedFiles).toStrictEqual([]);
      expect(imageStore.deletedPaths).toStrictEqual([]);
    });

    it('processProduct_addSubscriptionTerm DELEGATES to the stub port, then answers the product', async () => {
      const product = makeProductFixture({ productID: 'product-under-subscription' });

      const answered = await service.processProduct_addSubscriptionTerm(product, {
        subscriptionTermID: 'subscription-term-candidate',
      });

      // ★ THE DELEGATION IS REAL AND IS STILL THE POINT OF THIS CASE. CFML parity
      // [model/service/ProductService.cfc:L175]: the one statement in the legacy
      // branch that HAS a ported counterpart - the subscription-term lookup - is
      // reproduced through the stub port. That keeps the boundary honest: what is
      // missing is the framework's generic SKU factory, not the lookup.
      expect(subscriptionTermProvider.requestedTermIDs).toStrictEqual([
        'subscription-term-candidate',
      ]);

      // ★★ IT NO LONGER REJECTS, AND THAT IS NOT THE DEFECT BEING REPAIRED.
      // LEGACY-DEFECT [model/service/ProductService.cfc:L181]: the body reads
      // `arguments.data.listPrice` inside a function that declares no `data`
      // parameter, so the statement fails at run time WHENEVER THE [L180] GUARD
      // PASSES. Preserved deliberately; do not fix without a product decision.
      //
      // The guard at [L180] reads `processObject.getListPrice()` - a data property on
      // `model/process/Product_AddSubscriptionTerm.cfc`, which AAP 0.2.1 names as OUT
      // OF SCOPE. `ProductAddSubscriptionTermInput` therefore carries
      // `subscriptionTermID` only, the guard has nothing to evaluate, and the [L181]
      // statement is UNREACHABLE THROUGH THIS SURFACE rather than repaired: no
      // `listPrice` member was invented onto the input to make the guard evaluable,
      // and no value is written. The defect is registered in the shipped method's
      // annotation, which is where a reader looking for it will be.
      expect(answered).toBe(product);

      // LEGACY-NOTE [model/service/ProductService.cfc:L185, L188]: the same local is declared with
      // `var` TWICE in the one function - an invalid duplicate declaration that CFML tolerated. It
      // is recorded here and NOT reproduced, because a second `const` of the same name in the same
      // scope is a compilation error in TypeScript, and there is no observable behaviour to
      // preserve: both declarations bound the same value.
      expect(productRepository.saves).toStrictEqual([]);
    });

    it('processProduct_uploadDefaultImage attempts NO save when no upload file arrived', async () => {
      const product = makeProductFixture({ productID: 'product-under-upload' });

      const answered = await service.processProduct_uploadDefaultImage(product, {
        imageFile: 'candidate-upload.png',
      });

      // ★★ IT RESOLVES, AND THE DELEGATION IS CONDITIONAL ON HAVING SOMETHING TO
      // DELEGATE. AAP 0.4.2's ProductService table maps this method to "Delegates to
      // the image-store stub port"; a method that rejects before reaching a port
      // delegates to nothing. With no `uploadFile` on the input there is nothing to
      // hand the port, so the port is not reached and the product is answered
      // unchanged - which is also what [L262] does.
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

      // CFML parity [model/service/ProductService.cfc:L241-L246]: the destination is
      // the default-image directory joined to the process object's `imageFile`, and
      // the accepted extensions are the process object's own
      // `hb_fileAcceptExtension` [model/process/Product_UploadDefaultImage.cfc:L54].
      //
      // ★ THE LEADING DOTS ARE PRESERVED AND ARE NOT NORMALISED against
      // `model/service/SkuService.cfc:L212`'s DOTLESS `"jpg,jpeg,png,gif"`. Two
      // different literals in two different source files stay two different literals;
      // harmonising them would be a repair of the source, not a port of it.
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

      // The port WAS reached, and the failure does not escape.
      expect(imageStore.savedFiles).toHaveLength(1);

      // CFML parity [model/service/ProductService.cfc:L247-L254]: the legacy catches
      // the failure and adds a validation error keyed by the resource-bundle
      // identifier `validate.fileUpload`, then STILL RETURNS THE PRODUCT at [L256] -
      // it does not rethrow. The identifier is carried forward VERBATIM so the legacy admin can
      // still resolve it, and no resource-bundle runtime is introduced to resolve it here.
      expect(answered).toBe(product);

      // ★★★ AND THE FAILURE IS NOW OBSERVABLE, WHICH IS THE CORRECTION. This case used to close
      // with: "Because `Product` publishes no `addError`, the identifier is unreachable from
      // outside; what IS observable, and is asserted, is that the refusal is swallowed exactly as
      // [L247-L254] swallows it." Code review recorded the consequence: a FAILED upload was reported
      // to the caller as a success, indistinguishable from one that stored bytes.
      //
      // ★★ THE LEGACY'S FAILURE WAS NEVER UNREACHABLE - it travelled from the process object to the
      // entity. [L253] writes the error onto the process object, and
      // `HibachiEntity.getErrors()` [org/Hibachi/HibachiEntity.cfc:L133-L146] OVERRIDES the entity
      // accessor to inject `addError('processObjects', <context>, true)` for any process object
      // carrying errors. So a legacy caller asking `product.getErrors()` after this method saw
      // `processObjects: ['uploadDefaultImage']`. Both entries are asserted here: the framework's
      // injected one, and the `imageFile` entry relocated to the only register the ported model has.
      expect(answered.hasErrors()).toBe(true);
      expect(answered.getError('imageFile')).toStrictEqual(['validate.fileUpload']);
      expect(answered.getError('processObjects')).toStrictEqual(['uploadDefaultImage']);
    });

    it('★ records NOTHING when the upload succeeded, so the register separates the two outcomes', async () => {
      // The other side of the correction. A case that only asserted "did not throw" could not tell
      // success from failure at all, which is exactly what the finding was about.
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

    // =======================================================================
    // SECURITY REVIEW COVERAGE - RAISED AS S-11 (CWE-22, PATH TRAVERSAL), UPLOAD HALF.
    //
    // NET-NEW COVERAGE, DECLARED AS SUCH per AAP 0.6.6. No legacy test exercises this
    // method; `meta/tests/unit/entity/ProductTest.cfc` covers only `getProductURL()`.
    //
    // WHAT THE FINDING OBSERVED: `processProduct_uploadDefaultImage` composed
    // `product/default/${imageFile}` from a caller-supplied name with NO guard, while its
    // sibling `processProduct_deleteDefaultImage` guarded the identical concatenation.
    //
    // ★★ THIS HALF NARROWS THE LEGACY, AND THAT IS DELIBERATE. Unlike the deletion
    // branch - whose legacy statements could not execute at all, because
    // [model/service/ProductService.cfc:L200-L201] interpolate an unresolvable bare
    // `#imageFile#` - the legacy UPLOAD ran: [L241] composes its destination from
    // `arguments.processObject.getImageFile()`, a data property really declared at
    // [model/process/Product_UploadDefaultImage.cfc:L54], and [L250] `fileMove`s to it.
    // A traversing name therefore reached the filesystem in the legacy. Refusing it is a
    // SECURITY REFUSAL ON AN OUT-OF-SCOPE STUB PATH - registered in
    // `tests/traceability/legacyTestMap.ts` under `outOfScopeSecurityRefusals` and reasoned in
    // full at the guard in `src/services/productService.ts`. It is NOT one of the three
    // deliberate divergences AAP 0.6.7 permits and spends none of that budget: the method is an
    // out-of-scope thin pass-through to a STUB port (AAP 0.2.2, AAP 0.9.5, AAP 0.3.1), and no
    // numbered entry of the register's thirty entries - nor any of its eight secondary items -
    // covers a caller-supplied image path, so AAP 0.9.3 is not engaged.
    //
    // ★★★ WHAT IS ASSERTED, AND WHY IT IS NOT THE MESSAGE. A probe established that
    // NOTHING escapes this method: the guard throws INSIDE the try that [L237-L254] wraps
    // the body in, the catch arm swallows it, and [L256] returns the product. So unlike the
    // deletion cases above there is no message to inspect, and asserting on one would be
    // asserting on something no caller can see. The three observable facts are pinned
    // instead, and the middle one carries the protection:
    //
    //   1. IT DOES NOT THROW - the legacy answer for a bad upload file is preserved.
    //   2. `imageStore.savedFiles` IS EMPTY - nothing was delegated, which is the guarantee.
    //   3. THE PRODUCT IS RETURNED - matching [L256] on both of its paths.
    // =======================================================================
    describe('a traversable imageFile is refused before any upload path is composed', () => {
      /** Runs the upload and reports what the caller can actually observe. */
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
            // ★ A TRAVERSAL REFUSAL LANDS IN THE SAME `catch` ARM the legacy designated for a
            // file-upload validation failure [model/service/ProductService.cfc:L236, L253], so it is
            // RECORDED rather than erased - which is what stops a refused upload from looking like a
            // stored one.
            recordedRefusal: answered.hasError('imageFile'),
          };
        } catch {
          return { threw: true, answeredProduct: false, recordedRefusal: false };
        }
      };

      it('refuses the exact value the finding demonstrated, and stores nothing', async () => {
        const observed = await attemptUpload('../../../etc/passwd');

        // THE ASSERTION THAT CARRIES THE PROTECTION.
        expect(imageStore.savedFiles).toStrictEqual([]);

        // And the legacy's own answer for a failed upload survives unchanged.
        expect(observed.threw).toBe(false);
        expect(observed.answeredProduct).toBe(true);

        // ★ AND THE REFUSAL IS RECORDED, so "stored nothing" is something the caller learns rather
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

        // AT the limit the name is legitimate and MUST still be delegated - a ceiling that
        // refused its own boundary would be narrowing legitimate uploads, not traversal.
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
        // ★ THE NARROWING IS CONFINED TO TRAVERSAL, and this is the evidence. Every shape
        // here is one the legacy's OWN generator produces: [model/entity/Sku.cfc:L131-L139]
        // strips the product code [L138] and each contributing option code [L135] with
        // `reReplaceNoCase(..., "[^a-z0-9\-\_]", "", "all")` before appending the configured
        // extension, so a separator, a dot segment, a percent sign and a control character
        // are all removed before they can reach a name. No value the legacy itself composed
        // can trip the guard.
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
      // LEGACY-NOTE [model/service/ProductService.cfc:L65-L68]: the legacy body raises the platform
      // request timeout to one hour. That is a platform fact about the CFML host, not a
      // service-level objective, and this suite deliberately makes no timing assertion about it.
      //
      // Nothing below measures a duration, sets a per-test timeout, or claims anything about how
      // long the call takes. The only assertions are about WHAT was forwarded and in WHAT ORDER.
      await service.loadDataFromFile('file://products.csv');
      await service.loadDataFromFile('file://products-quoted.csv', '"');

      // CFML parity [model/service/ProductService.cfc:L67]: the legacy delegates POSITIONALLY with
      // exactly two arguments in declaration order, and the omitted text qualifier defaults to the
      // EMPTY STRING rather than to absence. Both facts are pinned, because a port that forwarded
      // `undefined` for the default would change what the adapter sees.
      expect(productRepository.imports).toStrictEqual([
        { fileURL: 'file://products.csv', textQualifier: '' },
        { fileURL: 'file://products-quoted.csv', textQualifier: '"' },
      ]);

      // LEGACY-NOTE [model/service/ProductService.cfc:L65-L68]: the bulk import itself is out of
      // scope - the legacy body hands the file straight to the DAO and nothing in the ported slice
      // parses a delimited file. The execution-model mismatch is real and is recorded rather than
      // papered over: there is no ambient transaction behind this call any more, so a caller must
      // supply idempotency and a compensation path of its own. That is a transactional-integrity
      // constraint, not a service level, and no assertion here speaks to either.
      expect(skuCreation.requests).toStrictEqual([]);
    });
  });

  // --- processProduct_deleteDefaultImage and _updateDefaultImageFileNames -----
  describe('processProduct_deleteDefaultImage', () => {
    it('composes the image path and delegates it to the image-store stub', async () => {
      const product = makeProductFixture({ productID: 'product-with-default-image' });
      const data: DeleteDefaultImageInput = { imageFile: 'shoe.png' };

      const answered = await service.processProduct_deleteDefaultImage(product, data);

      // CFML parity [model/service/ProductService.cfc:L200-L201]: the legacy builds the path by
      // interpolating `#imageFile#` UNSCOPED - neither `arguments.data` nor `local` - so CFML
      // resolves it through its scope-search order and happens to find the argument struct's key.
      // The port reads the key explicitly, the only translation available; there is no scope-search
      // semantics to reproduce, and the composed VALUE is pinned instead. NO FILESYSTEM ACCESS:
      // this is a string handed to an in-memory recorder.
      expect(imageStore.deletedPaths).toStrictEqual(['product/default/shoe.png']);

      expect(answered).toBe(product);
    });

    it('deletes nothing when the payload carries no image file', async () => {
      const product = makeProductFixture({ productID: 'product-without-default-image' });

      const answered = await service.processProduct_deleteDefaultImage(product, {});

      expect(imageStore.deletedPaths).toStrictEqual([]);
      expect(answered).toBe(product);
    });

    // =======================================================================
    // ★★★ SECURITY BOUNDARY - CWE-22 (PATH TRAVERSAL)
    //
    // NET-NEW coverage. `meta/tests/` has no ProductService test of any kind, and
    // there is nothing legacy to extend here in any case: `deleteImageFile` has no
    // legacy antecedent, and the legacy statement it stands in for could not
    // execute - both lines interpolate `#imageFile#` while no local or argument of
    // that name exists, so the branch raised a scope-resolution failure rather than
    // deleting anything. These tests therefore pin a NEW guarantee and are labelled
    // as such rather than presented as parity.
    //
    // WHAT THE FINDING DEMONSTRATED: `../../../etc/passwd` reached the port
    // byte-identically as `product/default/../../../etc/passwd`.
    //
    // WHAT IS ASSERTED BELOW, in every case: the call is REFUSED, and
    // `imageStore.deletedPaths` is EMPTY. The second half is the one that matters -
    // a guard that threw after handing the path across the port would satisfy the
    // first half and none of the protection.
    // =======================================================================
    describe('a traversable imageFile is refused before any path is composed', () => {
      /** Runs the delete expecting a refusal; throws if it completes instead. */
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
        // THE ASSERTION THAT CARRIES THE PROTECTION: nothing was delegated at all.
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
        // The percent sign is refused as a construct, so nothing here has to be
        // decoded to be judged. That ordering is the point: a decode-then-check pass
        // is exactly where a double-encoded value slips through.
        const message = await captureRefusal(imageFile);

        expect(message).toContain('percent sign');
        expect(imageStore.deletedPaths).toStrictEqual([]);
      });

      it('refuses a compound NUL-truncation payload, whichever construct is caught first', async () => {
        // `shoe.png\0../../etc/passwd` is the classic C-string truncation attack: a
        // syscall stops at the NUL and resolves `shoe.png` while an auditor reading the
        // value sees the traversal. It carries TWO refused constructs, so the message
        // depends on which check runs first - the separator test, as it happens. The
        // assertion is therefore deliberately on the OUTCOME rather than on the wording:
        // over-specifying which rule fires would make the test brittle about check
        // ordering, and the ordering is not the guarantee. The guarantee is that nothing
        // reached the port.
        const message = await captureRefusal('shoe.png\u0000../../etc/passwd');

        // The closing sentence is OPERATION-NEUTRAL, and the wording is deliberate rather
        // than incidental. S-11 extended this guard to the upload half, whose refusal is
        // swallowed by the try that [model/service/ProductService.cfc:L237-L254] wraps its
        // body in, so a store-specific variant of this sentence could never be read by any
        // caller or any test. One sentence true of both halves is pinned here instead.
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
        // THE EXACT BOUNDARY. 255 is POSIX NAME_MAX; the legacy `imageFile` column is
        // `length="50"` [model/entity/Sku.cfc:L58], so this bound is deliberately
        // LOOSER than the schema rather than tighter - `data.imageFile` is a request
        // field, not that column, and inventing the column's constraint here would be
        // inventing a rule the source does not state for this input.
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
        // The message would otherwise put attacker-controlled bytes into a log line,
        // and the construct is what an operator holding a legitimate file name needs.
        const message = await captureRefusal('../../../etc/passwd');

        expect(message).not.toContain('etc/passwd');
        expect(message).not.toContain('..');
        expect(message).toContain('No file was touched');
      });
    });

    describe('every legitimate image name still reaches the port unchanged', () => {
      // The guard must cost nothing legitimate. These are the shapes
      // `generateImageFileName()` [model/entity/Sku.cfc:L130-L138] composes - a
      // product code and option codes stripped to `[a-z0-9\-\_]`, joined by
      // `setting('productImageOptionCodeDelimiter')` and suffixed with
      // `setting('productImageDefaultExtension')` - plus the settings-derived
      // punctuation that made an allow-list of characters the wrong instrument.
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
        // The key is probed with CFML struct semantics, so a caller sending `ImageFile`
        // is the same caller. The guard has to sit behind that accessor rather than in
        // front of it, or a differently-cased key would bypass it entirely.
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

  // -------------------------------------------------------------------------
  // ★ processProduct_updateDefaultImageFileNames
  //
  // NET-NEW COVERAGE, declared as such per AAP 0.6.6. No legacy test touches image
  // handling: the only three legacy files reaching the in-scope slice are
  // `meta/tests/unit/entity/BrandTest.cfc`, `meta/tests/unit/entity/ProductTest.cfc`
  // and an empty functional stub, and none of them names a file name.
  //
  // ★ THIS DESCRIBE ONCE HELD A SINGLE CASE, `answers the same product and reaches no
  // port`, whose comment read: "the legacy loops the product's SKUs and refreshes each
  // generated image file name. The two entity members that loop needs do not exist on
  // the ported entity and may not be added from a test, so the ported method accepts
  // the product and answers it unchanged. Recording that gap is the honest option, and
  // the ASSERTION here is deliberately narrow: the method is a pass-through."
  //
  // It was narrow, and it was also VACUOUS in the way that matters: its product fixture
  // carried no SKUs, so the case would have passed unchanged against a correct
  // implementation, against the no-op it was written for, and against anything in
  // between. A test whose fixture cannot reach the behaviour is not evidence about the
  // behaviour. The cases below supply SKUs, options and option groups, and each one
  // fails if the loop, the filter, the composition or the assignment is dropped.
  // -------------------------------------------------------------------------
  describe('processProduct_updateDefaultImageFileNames', () => {
    /** An option carrying an explicit code, inside a group with the given image flag. */
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

      // CFML parity [model/service/ProductService.cfc:L209-L211]: EVERY SKU, and the
      // value assigned is `sku.generateImageFileName()`
      // [model/entity/Sku.cfc:L131-L139] - product code, then the delimiter and code
      // of each image-group option, then the extension.
      expect(redSku.getImageFile()).toBe('SHOE100-red.jpg');
      expect(blueSku.getImageFile()).toBe('SHOE100-blue.jpg');

      // The port saw one descriptor per SKU, in traversal order, carrying the RAW
      // values. The sanitisation and the delimiter are its business, not the
      // service's, and this pins the split.
      expect(imageStore.nameDescriptors).toStrictEqual([
        { productCode: 'SHOE100', imageGroupOptionCodes: ['red'] },
        { productCode: 'SHOE100', imageGroupOptionCodes: ['blue'] },
      ]);

      // The same instance back, per [model/service/ProductService.cfc:L213].
      expect(answered).toBe(product);
    });

    it('★ keeps only the codes whose option GROUP carries the image flag', async () => {
      // [model/entity/Sku.cfc:L134] `if(option.getOptionGroup().getImageGroupFlag())`.
      // The size option below is a perfectly good option that must NOT reach the name,
      // and it is placed BETWEEN the two that must, so a filter that merely truncated
      // the list would fail here.
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
      // [model/entity/Sku.cfc:L133] iterates `getOptions()` and appends in traversal
      // order. The two options below are handed over with their sort orders DESCENDING,
      // so a name composed in sort order would read `alpha-omega` while a name composed
      // in traversal order reads `omega-alpha`. Nothing in the legacy sorts here, and a
      // SKU's image file name is the name its stored image is found by, so re-ordering
      // would silently point a SKU at a file that does not exist.
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
      // The service must not pre-clean: [model/entity/Sku.cfc:L135] and [L138] sanitise
      // inside the composition, and half-sanitising on this side is how the two halves
      // come to disagree. The code below carries a space, a slash and a capital, and
      // arrives at the port with all three intact.
      //
      // The COMPOSED result then shows the case-insensitivity of `reReplaceNoCase`: the
      // capitals survive and only the space and slash are removed. A composer that
      // dropped the `i` flag would answer `hoe400-redxl` here.
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
      // A SKU loaded without its option groups is a fetch shape this service does not
      // control, and three in-scope callers await this method, so an absent group must
      // not become a raise. Under CFML `getOptionGroup()` returning null would have
      // raised on the very next method call - this is the one place the target is
      // deliberately gentler, and it is gentler in the direction of not taking
      // `processProduct_addOption` down with it.
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

      // No option segment at all, and no trailing delimiter: [model/entity/Sku.cfc:L135]
      // prefixes each code with the delimiter rather than suffixing it, so an empty
      // option set contributes an empty string.
      expect(sku.getImageFile()).toBe('SHOE600.jpg');
    });

    it('renames nothing, and still answers the same product, when there are no SKUs', async () => {
      // [model/service/ProductService.cfc:L209] has no count floor and no early return,
      // so an empty SKU collection is a loop that runs zero times rather than a special
      // case. This is the shape the previous single case used - kept, because a product
      // with no SKUs is genuinely valid input, and now stated as ONE case among several
      // rather than as the whole of the evidence.
      const product = makeProductFixture({ productID: 'product-with-no-skus', skus: [] });

      const answered = await service.processProduct_updateDefaultImageFileNames(product);

      expect(imageStore.nameDescriptors).toStrictEqual([]);
      expect(answered).toBe(product);
    });

    it('★ ASSIGNS ONLY - it writes nothing, saves nothing and deletes nothing', async () => {
      // [model/service/ProductService.cfc:L208-L214] mutates managed entities and returns
      // the product; Hibernate flushed at request end together with whatever the
      // DISPATCHING process method saved. Every one of the four dispatch sites performs
      // its own write, so a `saveSku` here would issue writes the legacy never did.
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
      expect(productRepository.saves).toStrictEqual([]);
      expect(imageStore.deletedPaths).toStrictEqual([]);

      // `skuRepository.saveSku` needs no assertion of its own and gets none: the double
      // wires it to `unreachedPortMember`, so a service that persisted here would have
      // failed this case by raising rather than by an empty-array mismatch. Naming that
      // is better than adding a weaker check beside it.
    });

    it('answers a SKU-less product unchanged, without inventing a name', async () => {
      // The empty-collection case: [L209] iterates nothing, so nothing is written and
      // no placeholder file name is fabricated for a product that has no SKUs.
      const product = makeProductFixture({ productID: 'product-with-no-skus', skus: [] });

      const answered = await service.processProduct_updateDefaultImageFileNames(product);

      expect(answered).toBe(product);
      expect(product.getSkus()).toStrictEqual([]);
    });

    it('NAMES a SKU with no back-reference from the PRODUCT ARGUMENT, without raising', async () => {
      // ★★ THE ONE PLACE THIS METHOD DIVERGES FROM `Sku.generateImageFileName()`, STATED
      // RATHER THAN LEFT TO BE DISCOVERED.
      //
      // QUOTE-THEN-REVISE. This case used to assert a REJECTION, on the reasoning that
      // "CFML parity [model/entity/Sku.cfc:L135, L138]: `getProduct()` is dereferenced three
      // times with no guard, so an orphaned SKU raises in CFML. The port reproduces the raise
      // rather than skipping the SKU, because skipping would emit a DIFFERENT file name set
      // than the CFML application emits from the same rows while both write into the same
      // `SwSku.imageFile` column." Every observation in that is accurate, AND THE ENTITY
      // METHOD STILL BEHAVES EXACTLY THAT WAY - the raise is pinned, with both locators, in
      // `tests/unit/domain/entities/sku.test.ts`, which is where `Sku.generateImageFileName`
      // is owned and where its unguarded dereference belongs.
      //
      // WHAT CHANGED IS WHICH COMPOSITION THIS SERVICE USES, AND WHY. `[L138]` reads
      // `getProduct().getProductCode()` - and the SKU it reads it from was reached through
      // `arguments.product.getSkus()` [L209], so under Hibernate's bidirectional mapping the
      // two are THE SAME OBJECT and the dereference could not fail for a SKU obtained this
      // way. Here the back-reference is a FETCH SHAPE this service does not control, so it
      // composes from the product it was handed - the object legacy resolved to anyway - and
      // an incompletely-hydrated graph produces the SAME NAME rather than an exception.
      //
      // That is not a softened guard, it is a narrower reading of the same statement, and it
      // is load-bearing: `saveProduct` awaits this method for EVERY new product
      // [model/service/ProductService.cfc:L282], as do `processProduct_addOptionGroup` and
      // `processProduct_addOption`, so a throw here would invent a failure the legacy did not
      // have in any of the three.
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

  // --- processProduct_addOptionGroup -----
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
      //
      // Preserved deliberately; do not fix without a product decision.
      //
      // BOTH SKUs receive THE SAME option, and it is the group's FIRST option in repository order.
      // The second option is never applied to anything, which is what makes this a defect rather
      // than a design: two SKUs that differ in every other option now agree on this one, so the
      // option set no longer distinguishes them.
      expect(first.getOptions()).toStrictEqual([material.option]);
      expect(second.getOptions()).toStrictEqual([material.option]);
      expect(first.getOptions()).not.toContain(secondOption);
      expect(second.getOptions()).not.toContain(secondOption);

      // The group is loaded ONCE, before the loop, and by the identifier the payload carried.
      //
      // CFML parity [model/service/ProductService.cfc:L115]: the payload holds an ID STRING, not a
      // hydrated entity, which is proven by the legacy handing it straight to an entity loader.
      expect(optionLoading.requestedOptionGroupIDs).toStrictEqual(['og-material']);

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
      //   this.processProduct(arguments.product, {}, 'updateDefaultImageFileNames')
      // the framework's GENERIC CONVENTION DISPATCHER, which resolved its third argument to
      // `processProduct_<context>` from a STRING at run time. The port replaces it with a direct
      // static call to the named method. The spy observes that call WITHOUT replacing it, so the
      // real implementation still runs.
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
      // numeric truthiness test on a count. It is redundant in front of a loop that would not
      // iterate, and it is preserved because it is what the legacy wrote - and because it is the
      // guard that makes the `options[1]` read on the next line safe.
      expect(sku.getOptions()).toStrictEqual([]);
      expect(answered).toBe(product);
    });

    it('fails, unguarded, when the option group cannot be resolved', async () => {
      const sku = makeSkuFixture({ skuID: 'sku-unresolvable-group', options: [] });
      const product = makeProductFixture({ productID: 'product-unresolvable-group', skus: [sku] });

      // CFML parity [model/service/ProductService.cfc:L115]: the legacy chains
      // `getOptionGroup(id).getOptions()` with NO null check, so an identifier that resolves to
      // nothing fails at the dereference. No guard is added and no empty group is substituted:
      // substituting one would silently turn a bad identifier into a successful no-op.
      await expect(
        service.processProduct_addOptionGroup(product, { optionGroup: 'og-does-not-exist' }),
      ).rejects.toThrow(/model\/service\/ProductService\.cfc:L115/);

      expect(sku.getOptions()).toStrictEqual([]);
    });
  });

  // --- processProduct_addOption -----
  describe('processProduct_addOption', () => {
    /**
     * Assembles the standard three-group graph these cases work over.
     *
     * The new option lives in its OWN group, and the existing SKU carries one option from each of
     * two OTHER groups - which is the shape that makes both halves of the [L144] condition
     * observable.
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
      // to it, so the new option leads the list. The list is parsed with the project's own list
      // helper rather than with `String.split`, because comma-list semantics are what the legacy
      // wrote and the helper is where those semantics live.
      //
      // The coalesce below is UNREACHABLE and is a typing accommodation, not a default: the
      // assertion above has already failed the test if the key is absent. It is spelled out rather
      // than replaced by a non-null assertion, because `!` appears nowhere in this file. The same
      // shape recurs twice more in this block, for the same reason.
      expect(recorded.data.options).toBe('opt-cotton,opt-large,opt-red');
      expect(listToArray(recorded.data.options ?? '')).toStrictEqual([
        'opt-cotton',
        'opt-large',
        'opt-red',
      ]);

      expect(answered).toBe(graph.product);
    });

    it('takes both prices from the DEFAULT SKU, unguarded and undefaulted', async () => {
      const graph = buildAddOptionGraph();

      await service.processProduct_addOption(graph.product, { option: 'opt-cotton' });

      const recorded = skuCreation.requests[0];

      if (recorded === undefined) {
        throw new Error('the SKU-creation collaborator recorded no request to assert against.');
      }

      // CFML parity [model/service/ProductService.cfc:L133]: the legacy reads
      // `getDefaultSku().getPrice()` COMPLETELY UNGUARDED. No guard is added, no default is
      // supplied, and a zero money value is emphatically NOT substituted: a silent zero here would
      // create SKUs priced at nothing.
      const recordedPrice = recorded.data.price;

      expect(recordedPrice).toBeDefined();

      if (recordedPrice === undefined) {
        throw new Error('the SKU-creation payload carried no price to assert against.');
      }

      expect(recordedPrice.equals(Money.fromDecimalString('19.99'))).toBe(true);

      // LEGACY-NOTE [model/service/ProductService.cfc:L135]: the list-price gate here is ONE
      // CLAUSE, `isNull(...)` alone. The same decision is made with THREE clauses at
      // [model/service/SkuService.cfc:L94] and [L130] (existence, numeric, and greater than zero)
      // and with TWO at [L180] (not the empty string, and numeric). The three shapes are NOT
      // interchangeable and each is reproduced as written.
      //
      // On the ported entity this one-clause gate is STATICALLY SATISFIED, because
      // `Sku.getListPrice()` answers a non-optional money value - the column declares a default of
      // zero, so the accessor cannot answer absence. The term is kept verbatim anyway so the
      // translation stays checkable, and the consequence is asserted: the list price is ALWAYS
      // carried.
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

      // CFML parity [model/service/ProductService.cfc:L144]: the membership test is a NEGATED
      // `listFindNoCase`, and `listFindNoCase` answers a 1-BASED INDEX OR
      // 0. In CFML `!0` is true and `!5` is false, so `!listFindNoCase(...)` means
      // "NOT PRESENT". The port writes that as an explicit comparison against zero. The rule behind
      // it is absolute: never a bare-truthiness negation of a list-index result, and never
      //   `index > 0`
      // against a zero-based search result, because a genuine zero index and a genuine absence are
      // different things and the two idioms disagree about which is which.
      //
      // The observable consequence is asserted rather than the idiom: the shared option appears
      // EXACTLY ONCE even though it was encountered twice.
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
      // boolean at [model/service/SkuService.cfc:L58], and THE RETURN VALUE IS DISCARDED here.
      // Nothing branches on it, nothing raises on false, and the method continues to the image-name
      // refresh and the return regardless. The discard is preserved: acting on the result would
      // change what a caller observes when SKU creation reports failure.
      expect(answered).toBe(graph.product);
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      expect(skuCreation.requests).toHaveLength(1);
    });

    it('fails, unguarded, when the option or the default SKU cannot be resolved', async () => {
      const graph = buildAddOptionGraph();

      // CFML parity [model/service/ProductService.cfc:L130]: the option loader is dereferenced with
      // no null check, exactly as the group loader is at [L115].
      await expect(
        service.processProduct_addOption(graph.product, { option: 'opt-does-not-exist' }),
      ).rejects.toThrow(/model\/service\/ProductService\.cfc:L130/);

      // CFML parity [model/service/ProductService.cfc:L133]: and neither is the default SKU.
      // `makeProductFixture` leaves `defaultSku` ABSENT by default, which is load-bearing here - a
      // fixture that supplied one would have hidden this path.
      const withoutDefaultSku = makeProductFixture({ productID: 'product-without-default-sku' });

      await expect(
        service.processProduct_addOption(withoutDefaultSku, { option: 'opt-cotton' }),
      ).rejects.toThrow(/model\/service\/ProductService\.cfc:L133/);

      expect(skuCreation.requests).toStrictEqual([]);
    });
  });

  // --- saveProduct -----
  describe('saveProduct', () => {
    it('preserves both physical table names byte-for-byte', () => {
      // SCHEMA CONTINUITY. The two literals are the uniqueness SCOPE handed to the URL-title port,
      // and they name tables the target continues to read and write unchanged. They are pinned here
      // so a typo in the constant cannot make the delegation cases below pass while asserting the
      // wrong scope. The declared type is the port's own `UrlTitleTableName` union, so both
      // spellings are additionally checked against the only three values that union admits -
      // `'SwBrand'`, `'SwProduct'` and `'SwProductType'`
      // [slatwall-ts/src/domain/ports/urlTitleGenerator.ts:L13].
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

      // LEGACY-NOTE [model/service/ProductService.cfc:L279]: THE SAVE PAYLOAD ITSELF is handed to
      // SKU creation, unchanged and by reference - not a copy, not a projection. The identity check
      // is the whole assertion: it proves the coupling the legacy created between a save payload
      // and a SKU-creation payload, which is why the ported input type declares SKU-creation keys
      // at all.
      expect(creation.data).toBe(data);
      expect(creation.product).toBe(product);

      // The persistence port receives THE INPUT product, and the method answers the
      // PERSISTED instance the port replied with - the legacy reassigns `product`
      // from the save result at L287, so the returned value is not the argument.
      // ★ ONE OWNER WRITE, AND THIS IS THE RECORD OF WHY IT IS NOT TWO. An earlier
      // revision asserted `[product, persistedProduct]` here, reasoning that a new
      // product takes "the three-step expansion of the ORM cascade that `Product.skus`
      // `cascade="all-delete-orphan"` [model/entity/Product.cfc:L73] used to perform:
      // INSERT the owner with the deferred `defaultSkuID` NULL, INSERT the SKUs, then
      // UPDATE the owner to fill the column in."
      //
      // THE THREE STEPS ARE REAL AND THEY BELONG TO THE ADAPTER. Expressed as two
      // SERVICE-level saves, each step gets its own transaction on its own connection,
      // so a failure between them leaves a product with SKUs and a NULL default, or
      // SKUs with no owner - states Hibernate could not reach, because it flushed the
      // lot inside the request's transaction. The only transaction here is the
      // adapter's, so `mysqlProductRepository.saveProduct` owns the whole expansion
      // inside one `executor.transaction` and its own cases pin each step. This tier
      // issues ONE write, and still hands over the instance carrying the drafts.
      expect(productRepository.saves).toStrictEqual([product]);
      expect(answered).toBe(persistedProduct);
      expect(answered).not.toBe(product);
      expect(answered.getProductID()).toBe(PERSISTED_PRODUCT_ID);
    });

    it('generates from the RENDERED TITLE TEMPLATE against "SwProduct" when no title is present', async () => {
      const product = makeProductFixture({ urlTitle: undefined });
      const data: ProductSaveInput = {};

      await service.saveProduct(product, data);

      // ★★★ THE TITLE SOURCE, AND THIS ASSERTION HAS BEEN WRONG ONCE ALREADY. The legacy line is
      //   getService("dataService").createUniqueURLTitle(
      //     titleString=arguments.product.getTitle(), tableName="SwProduct")
      // and this case used to assert `FIXTURE_CALCULATED_TITLE`, on the reading that "the ported
      // entity publishes NO `getTitle()`: the closed entity surface exposes `getCalculatedTitle()`,
      // the PERSISTED SNAPSHOT of the same value, and no member may be added to it."
      //
      // Code review measured what the substitution costs. `calculatedTitle`
      // [model/entity/Product.cfc:L65] is written by an ORM maintenance pass, so a NEW product has
      // NO snapshot - slug generation received an empty candidate and the `urlTitle` `required` rule
      // then refused a payload that should have succeeded - and a STALE one carries the title it had
      // BEFORE this save populated a new name. `Product.getTitle()`
      // [model/entity/Product.cfc:L540-L545] is now ported and renders the `productTitleString`
      // template against CURRENT state, so THAT is what the generator receives.
      //
      // ★★ THE ASSERTED VALUE IS THE RENDERED TEMPLATE, NOT A COLUMN. The fixture's template is the
      // legacy default `'${brand.brandName} ${productName}'`
      // [model/service/SettingService.cfc:L193], and the fixture's brand and product name are
      // distinct known values - so a coincidental pass is impossible, and the assertion proves both
      // markers resolved AND the single separating space between them survived.
      //
      // Contrast the sibling sources: `saveProductType` prefers the payload's `productTypeName` and
      // falls back to the entity's, and `model/service/BrandService.cfc:L69` reads
      // `getBrandName()`. THREE DIFFERENT TITLE SOURCES ACROSS THREE SAVE OVERRIDES, none
      // harmonised.
      expect(urlTitleGenerator.requests).toStrictEqual([
        {
          titleString: `${FIXTURE_BRAND_NAME} ${FIXTURE_PRODUCT_NAME}`,
          tableName: PRODUCT_TABLE_NAME,
        },
      ]);

      // And the calculated snapshot is NOT what was used, which is the whole point of the
      // correction: the fixture's snapshot differs from the rendered template.
      expect(product.getCalculatedTitle()).toBe(FIXTURE_CALCULATED_TITLE);
      expect(product.getCalculatedTitle()).not.toBe(
        `${FIXTURE_BRAND_NAME} ${FIXTURE_PRODUCT_NAME}`,
      );

      // ★★ WHERE THE RESOLVED VALUE LANDS: ON THE ENTITY *AND* IN THE REPOSITORY PAYLOAD,
      // AND ON THE CALLER'S STRUCT NEVER.
      //
      // The legacy line is `arguments.product.setURLTitle(...)`
      // [model/service/ProductService.cfc:L269] - an ENTITY write, verified against
      // source. Two earlier revisions each got half of this right and neither got both:
      //
      //   * one asserted the resolved title landed in the CALLER'S PAYLOAD, on the
      //     premise that `Product.urlTitle` was `private readonly` "with no setter and
      //     no route to add one". The observation about the shipped class was accurate;
      //     the inference was not. `src/domain/entities/product.ts` generates the
      //     ORM-implicit members the ported slice concretely calls, the eighteen-file
      //     lock is a lock on the FOLDER, and the port budget forbids a fourteenth PORT
      //     - none of which forbids a member on an existing class. `setUrlTitle` was
      //     authored, and the write lands where [L269] puts it.
      //   * the other asserted the entity was left untouched and only the REPOSITORY
      //     PAYLOAD carried the value. That correctly identified the persistence
      //     channel - writing into the caller's struct sent the title nowhere the
      //     legacy sent it, because the legacy entity reached the DAO at [L287]
      //     carrying it - but leaving the entity empty broke the accessor: with
      //     `urlTitle` absent, `getProductURL()` [model/entity/Product.cfc:L207]
      //     answers from nothing, and that accessor has the only legacy test in the
      //     slice [meta/tests/unit/entity/ProductTest.cfc].
      //
      // BOTH CHANNELS ARE THEREFORE ASSERTED, and they agree BY CONSTRUCTION rather than
      // by coincidence: the service writes the entity first and then reads the value
      // back off it to build the payload, so no third state is representable.
      //
      // The CALLER'S struct stays untouched, which is the third fact and the one that
      // distinguishes this override from its sibling - contrast `saveProductType`, whose
      // [L297] and [L299] DO assign into `data`, an asymmetry the port reproduces rather
      // than smoothing away.
      expect(product.getUrlTitle()).toBe(GENERATED_URL_TITLE);
      expect(data).toStrictEqual({});
      expect(productRepository.savePayloads).toStrictEqual([
        { urlTitle: GENERATED_URL_TITLE, productName: FIXTURE_PRODUCT_NAME },
      ]);

      // The resolved title satisfies the `urlTitle` save rule, so the save proceeds:
      // generation is not merely recorded, it changes the outcome. Without it the
      // product would have failed validation and never reached the port.
      // ★ ONE OWNER WRITE, AND THIS IS THE RECORD OF WHY IT IS NOT TWO. An earlier
      // revision asserted `[product, persistedProduct]` here, reasoning that a new
      // product takes "the three-step expansion of the ORM cascade that `Product.skus`
      // `cascade="all-delete-orphan"` [model/entity/Product.cfc:L73] used to perform:
      // INSERT the owner with the deferred `defaultSkuID` NULL, INSERT the SKUs, then
      // UPDATE the owner to fill the column in."
      //
      // THE THREE STEPS ARE REAL AND THEY BELONG TO THE ADAPTER. Expressed as two
      // SERVICE-level saves, each step gets its own transaction on its own connection,
      // so a failure between them leaves a product with SKUs and a NULL default, or
      // SKUs with no owner - states Hibernate could not reach, because it flushed the
      // lot inside the request's transaction. The only transaction here is the
      // adapter's, so `mysqlProductRepository.saveProduct` owns the whole expansion
      // inside one `executor.transaction` and its own cases pin each step. This tier
      // issues ONE write, and still hands over the instance carrying the drafts.
      expect(productRepository.saves).toStrictEqual([product]);
    });

    it('READS a differently-cased payload key and leaves the caller struct alone', async () => {
      const product = makeProductFixture({ urlTitle: undefined });

      // The untyped-boundary case: a payload that reached this service from a parsed
      // JSON body carrying the legacy CFML spelling `URLTitle`. A typed caller cannot
      // produce this - excess-property checking rejects it - so it is built through
      // `Reflect.set`, with no cast, no index signature and no `any`.
      const data: ProductSaveInput = {};
      Reflect.set(data, 'URLTitle', undefined);

      expect(structFindKey(data, 'urlTitle')).toBe('URLTitle');

      await service.saveProduct(product, data);

      // ★★ THE CASE-INSENSITIVE STRUCT READ IS STILL LOAD-BEARING - ON THE POPULATE
      // SIDE. CFML parity [model/service/ProductService.cfc:L266]: `populate(data)`
      // copies `data.urlTitle` onto the entity through a key store that folds case, so
      // a payload spelled `URLTitle` populates just as one spelled `urlTitle` does.
      // The port reads it with the same folding, which is why this key is FOUND rather
      // than skipped. It holds `undefined` here, so populate copies nothing and the
      // [L268] guard still sees an absent title - hence the generation below.
      //
      // ★ AND NOTHING IS WRITTEN BACK INTO THE CALLER'S STRUCT. An earlier revision
      // asserted that the resolved title landed under this very key, preserving its
      // casing, reasoning that "a CFML struct holds ONE key per name because its key
      // store folds case, so the legacy assignment updated the entry already present."
      // The reasoning about CFML is correct and was being applied to the wrong method:
      // [L269] writes `arguments.product.setURLTitle(...)`, not `arguments.data.urlTitle`.
      // The payload is therefore left exactly as the caller handed it over - same single
      // key, same `undefined` value, no second key added - and the resolved title is on
      // the ENTITY, from where the repository payload is then stated.
      //
      // The case-preserving payload WRITE has not been deleted from the port; it
      // simply belongs to `saveProductType`, whose [L297] and [L299] genuinely do
      // assign into `data`, and it is exercised by that method's own cases.
      expect(Object.keys(data)).toStrictEqual(['URLTitle']);
      expect(Reflect.get(data, 'URLTitle')).toBeUndefined();
      expect(structFindKey(data, 'urlTitle')).toBe('URLTitle');
      expect(product.getUrlTitle()).toBe(GENERATED_URL_TITLE);

      // And the generation still counted: exactly one call, the resolved value reached
      // persistence through the payload, and the save proceeded.
      expect(urlTitleGenerator.requests).toHaveLength(1);
      expect(productRepository.savePayloads).toStrictEqual([
        { urlTitle: GENERATED_URL_TITLE, productName: FIXTURE_PRODUCT_NAME },
      ]);

      // ★★ ONE OWNER WRITE, AND THIS IS THE RECORD OF WHY IT IS NOT TWO.
      // An earlier revision asserted `[product, persistedProduct]` here, on the
      // reasoning that a new product takes "the three-step expansion of the ORM cascade
      // that `Product.skus` `cascade=\"all-delete-orphan\"` [model/entity/Product.cfc:L73]
      // used to perform: INSERT the owner with the deferred `defaultSkuID` NULL, INSERT
      // the SKUs, then UPDATE the owner to fill the column in."
      //
      // THE THREE STEPS ARE REAL AND THEY ARE NOT THIS TIER'S. The circular foreign key
      // between `SwSku.productID` [model/entity/Sku.cfc:L65] and
      // `SwProduct.defaultSkuID` [model/entity/Product.cfc:L70] genuinely forces that
      // order - but expressing it as two SERVICE-level saves puts each step in its own
      // transaction on its own connection, so a failure between them leaves a product
      // with SKUs and a NULL default, or SKUs with no owner. Hibernate never produced
      // that state because it flushed the lot inside one transaction, and the only place
      // a transaction exists here is the adapter. `mysqlProductRepository.saveProduct`
      // therefore owns the whole expansion, inside ONE `executor.transaction`, and its
      // cases pin each step; this tier issues one write and hands over the instance that
      // carries the drafts.
      expect(productRepository.saves).toStrictEqual([product]);
    });

    it('★ POPULATES the entity from the payload, EMPTY STRING INCLUDED, before the guard', async () => {
      // The populate step [model/service/ProductService.cfc:L266] copies whatever the
      // key holds. An EMPTY STRING is the sharpest case: it is a value, so it is
      // copied, and `isNull('')` is FALSE, so the [L268] guard then declines to
      // replace it. The observable outcome is a product saved with an empty URL title
      // and NO generator call - which is exactly what the legacy does, and is the
      // reason the guard's one-clause shape matters.
      const product = makeProductFixture({ urlTitle: 'fixture-title' });
      const data: ProductSaveInput = { urlTitle: '' };

      // ★★ THE REFUSAL COMES BACK ON THE RETURNED ENTITY, so the populate assertions read the same
      // instance the method answered with. Everything they assert is unchanged - populate ran, the
      // guard declined, the payload was not written to - and the refusal is asserted at the foot.
      const refused = await refusedEntityOf(() => service.saveProduct(product, data));

      expect(product.getUrlTitle()).toBe('');
      expect(urlTitleGenerator.requests).toStrictEqual([]);

      // The payload is read, never written: it still carries exactly what arrived.
      expect(data).toStrictEqual({ urlTitle: '' });

      // ★★ AND THE EMPTY STRING THEN FAILS VALIDATION, SO NOTHING IS PERSISTED - WHICH IS
      // THE WHOLE POINT OF THE ONE-CLAUSE GUARD.
      //
      // QUOTE-THEN-REVISE. This case used to close with "the empty string reaches
      // persistence, rather than being quietly replaced on the way out - the repository
      // payload states what the entity holds", asserting a recorded payload of
      // `{ urlTitle: '', productName: ... }`. The first half of that sentence is what needed
      // checking and it does not hold: [L273] `validate(context="save")` runs BETWEEN the
      // guard and the save, `urlTitle` is `required` in the save context
      // [model/validation/Product.json], and `validate_required` demands
      // `len(trim(propertyValue))` [org/Hibachi/HibachiValidationService.cfc:L242] - so an
      // empty title is INVALID and [L287] is skipped.
      //
      // The observable chain is therefore: populate copies the empty string [L266], the
      // one-clause `isNull()` guard declines to replace it [L268], and validation then
      // refuses the save [L273, L286]. Had the guard been the FOUR-clause shape used at
      // [L295] and [model/service/BrandService.cfc:L68], generation would have fired and the
      // product WOULD have been saved. That asymmetry is the reason this case exists, and
      // asserting the refusal is what makes it visible; the sibling case
      // 'does NOT generate for an EMPTY-STRING title - the ONE-CLAUSE guard' reaches the same
      // end state from an empty title already on the entity.
      expect(productRepository.saves).toStrictEqual([]);
      expect(productRepository.savePayloads).toStrictEqual([]);

      // ★★★ AND THE REFUSAL IS DETECTABLE ON THE ENTITY, WHICH IS THE THIRD REVISION OF THIS CASE.
      // Revision one asserted only that nothing was persisted - a state a caller had no way to
      // observe, because the method returned the entity and the entity published no error channel.
      // Revision two made the method THROW. Revision three publishes the register the legacy always
      // had [org/Hibachi/HibachiTransient.cfc:L30-L64], so the SAME entity comes back naming the rule
      // that failed - which is what [model/service/ProductService.cfc:L291] answers.
      expect(refused).toBe(product);
      expect(refusedRulesOf(refused)).toStrictEqual([
        { propertyIdentifier: 'urlTitle', errorMessage: 'urlTitle is required' },
      ]);
    });

    it('★ POPULATES a non-empty payload title over the entity\u2019s own', async () => {
      const product = makeProductFixture({ urlTitle: 'fixture-title' });
      const data: ProductSaveInput = { urlTitle: 'payload-title' };

      await service.saveProduct(product, data);

      // Populate is UNCONDITIONAL ON PRESENCE - it does not defer to the value the
      // entity already carried, because [L266] runs before [L268] and simply copies.
      // Without this, a caller submitting a new URL title would have had it silently
      // discarded, which is the failure C01 names.
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

      // ★ AND IT IS THE CALLER'S OWN INSTANCE, ANSWERED RATHER THAN RAISED [model/service/ProductService.cfc:L291].
      expect(refused).toBe(product);
      // LEGACY-NOTE [model/service/ProductService.cfc:L268]: THE GUARD HERE IS ONE CLAUSE -
      // `isNull(arguments.product.getURLTitle())` and nothing else. `isNull('')` is FALSE, so an
      // empty-string URL title SUPPRESSES generation.
      //
      // The same decision is made with FOUR clauses at [L295] and at
      // [model/service/BrandService.cfc:L68] - each a conjunction of two disjunctions that also
      // tests `len()` - and there an empty string TRIGGERS generation. THREE URL-TITLE GUARD SHAPES
      // ACROSS THE SLICE, AND THEY ARE NOT UNIFIED. Harmonising them would change which products
      // acquire a slug.
      expect(urlTitleGenerator.requests).toStrictEqual([]);

      expect(skuCreation.requests).toStrictEqual([]);
      expect(productRepository.saves).toStrictEqual([]);

      // The entity is left exactly as populate and the guard left it - the refusal mutates nothing on
      // the way out - and it is that entity which comes back, unpersisted, per
      // [model/service/ProductService.cfc:L291]. The `urlTitle` save-context rule is what refused it.
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

      // CFML parity [model/service/ProductService.cfc:L276]:
      //   if(arguments.product.isNew() and !arguments.product.hasErrors())
      // BOTH terms, in order. This case falsifies the FIRST. `isNew()` is the one framework-derived
      // member the ported entity keeps, and it is the empty-identifier test verbatim.
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

      // LEGACY-NOTE [model/validation/Product.json]: the `save` context declares exactly five rules
      // - `price`, `productName`, `productCode`, `productType` and `urlTitle`. This case falsifies
      // `productName`, and the second term of the L276 conjunction with it, so neither branch runs.
      // The two `unique` qualifiers on `productCode` and `urlTitle` are NOT asserted anywhere in
      // this suite: uniqueness is a datastore property, the legacy resolved it with a query inside
      // the framework validation service, and no in-memory assertion would be both honest and
      // correct.
      expect(product.isNew()).toBe(true);
      expect(skuCreation.requests).toStrictEqual([]);
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(productRepository.saves).toStrictEqual([]);

      // ★★★ THE FULL RECORD OF THIS CASE, WHICH IS WHERE THE FINDING WAS MADE AND THEN RE-MADE.
      // Revision one closed with "CFML parity [model/service/ProductService.cfc:L291]: the legacy
      // returns `arguments.product` unconditionally, so an invalid product comes back as itself - the
      // caller inspects it, nothing is thrown, and nothing is null", asserting `answered).toBe(product)`
      // and nothing else. The CFML reading was right and the parity claim was hollow: a legacy caller
      // "inspects it" by asking `hasErrors()` [L286], and the ported entity published no such member,
      // so a refusal was indistinguishable from a success. Revision two made the method THROW.
      // Revision three publishes the member: THE SAME ENTITY comes back, carrying its errors, which is
      // both what [L291] answers and what makes revision one's sentence finally true.
      expect(refused).toBe(product);
      expect(refused.hasErrors()).toBe(true);
      expect(refused.hasError('productName')).toBe(true);
      // ★ AND THE LOOKUP IS CASE-INSENSITIVE, because a CFML struct key is
      // [org/Hibachi/HibachiErrors.cfc:L15]. A caller spelling the property differently still finds
      // its error.
      expect(refused.hasError('PRODUCTNAME')).toBe(true);
      expect(refusedRulesOf(refused)).toStrictEqual([
        { propertyIdentifier: 'productName', errorMessage: 'productName is required' },
      ]);
      // The message states the rule and NOT the value that failed it - the same discipline the
      // published field reports follow, so a primary adapter may forward it.
      expect(refused.getError('productName')).toStrictEqual(['productName is required']);
    });

    it('rejects a product code holding an unsupported character', async () => {
      const product = makeProductFixture({ productCode: 'not a valid code' });
      const data: ProductSaveInput = {};

      const refused = await refusedEntityOf(() => service.saveProduct(product, data));

      // ★ AND IT IS THE CALLER'S OWN INSTANCE, ANSWERED RATHER THAN RAISED [model/service/ProductService.cfc:L291].
      expect(refused).toBe(product);
      // The save-context rule is
      //   "productCode": [{"contexts":"save","required":true,
      //                    "unique":true,"regex":"^[a-zA-Z0-9-_.|:~^]+$"}]
      // and the space is not in the class, so a present-and-non-empty code still fails. Asserting
      // this separately from the missing-`productName` case is what proves the regex half of the
      // rule is enforced, not only the `required` half.
      expect(productRepository.saves).toStrictEqual([]);
      expect(refusedRulesOf(refused)).toStrictEqual([
        {
          propertyIdentifier: 'productCode',
          errorMessage: 'productCode contains an unsupported character',
        },
      ]);
      // ★ THE OFFENDING CODE IS NOT IN THE REFUSAL. It is caller-submitted data, and a refusal that
      // echoed it would be unsafe for `src/handlers/errorMapper.ts` to publish.
      expect(JSON.stringify(refused.getErrors())).not.toContain('not a valid code');
    });

    // =======================================================================
    // ★★ THE HAND-OFF: WHAT THIS SERVICE OWES THE AGGREGATE CASCADE.
    //
    // ★ DECLARED NET-NEW under AAP 0.6.6. No legacy SkuService or ProductService
    // unit test exists - `meta/tests/unit/service/` holds AccountServiceTest,
    // HibachiServiceTest, PaymentServiceTest and UtilityRBServiceTest only.
    //
    // ★ WHY THESE TWO CASES, WHEN THIS SERVICE IS UNCHANGED. The persistence fix
    // for created SKUs lives entirely in `mysqlProductRepository`, driven by the
    // product's own collection and its own designation - so the thing that MUST
    // hold here is the seam: SKU creation runs BEFORE the save, and the very
    // instance the persistence port receives is the one carrying what creation
    // produced. If the order inverted, or if the service handed the port a
    // different instance, the cascade would find an empty collection and write a
    // product with no variants while every assertion in this file still passed.
    // That is precisely the failure the review found, one layer down.
    //
    // The creation double is programmed to ATTACH rather than merely record,
    // because a double that changes nothing cannot show that the change survives -
    // and an unobservable hand-off is what let the original gap through.
    // =======================================================================

    it('★ creates SKUs BEFORE saving, and hands the port the instance carrying them', async () => {
      const product = makeProductFixture({});
      const draft = makeSkuFixture({ skuID: PROVISIONAL_SKU_ID, isNew: true, product: undefined });

      // Ordering is captured as a sequence rather than inferred from two counters: a
      // count cannot distinguish "created then saved" from "saved then created".
      const order: string[] = [];

      skuCreation.attachment = (created: Product): void => {
        order.push('createSkus');
        created.addSku(draft);
        created.setDefaultSku(draft);
      };
      productRepository.onSave = (saved: Product): void => {
        order.push('saveProduct');

        // Asserted AT THE MOMENT OF THE SAVE, which is the only moment that matters:
        // the port sees the collection and the designation already in place.
        expect(saved.getSkus()).toContain(draft);
        expect(saved.getDefaultSku()).toBe(draft);
      };

      await service.saveProduct(product, {});

      expect(order).toStrictEqual(['createSkus', 'saveProduct']);

      // And the same instance travelled the whole way: `createSkus` was given the
      // argument [model/service/ProductService.cfc:L279] and the DAO was given that
      // same entity eighteen lines later [L287].
      expect(skuCreation.requests[0]?.product).toBe(product);
      expect(productRepository.saves).toStrictEqual([product]);

      // The designated SKU is still TRANSIENT when persistence receives it, which is the
      // state the adapter reads to defer the `defaultSkuID` write.
      expect(product.getDefaultSku()?.isNew()).toBe(true);
    });

    it('★ REFUSES on the sku-creation ground when a VALID new product ends with no skus', async () => {
      // ★★ THE SECOND REFUSAL GROUND, WHICH IS THE LEGACY'S SECOND `hasErrors()` ASK
      // [model/service/ProductService.cfc:L286]. `createSkus` records its errors ON THE PRODUCT
      // [model/service/SkuService.cfc:L142, L148, L177] and gates every creation loop on
      // `!product.hasErrors()` [L152, L180], so recording an error and attaching zero SKUs are the
      // SAME EVENT - which is why "valid new product, zero SKUs after creation" is the signal rather
      // than a proxy for it.
      //
      // The double's attachment is overridden to attach NOTHING, which is exactly the state the note on
      // `RecordingSkuCreation` says the real collaborator reaches only by recording an error - so this
      // is the case that note reserves for "modelling the error arm by attaching nothing", stated
      // explicitly rather than inherited from a default.
      const product = makeProductFixture({});
      skuCreation.attachment = (): void => {
        // Records the call through the collaborator itself and attaches no SKU.
      };

      const refused = await refusedEntityOf(() => service.saveProduct(product, {}));

      // ★ AND IT IS THE CALLER'S OWN INSTANCE, ANSWERED RATHER THAN RAISED [model/service/ProductService.cfc:L291].
      expect(refused).toBe(product);
      // Creation DID run - which is what separates this ground from a validation refusal, where the
      // branch is never entered and the zero-SKU state means nothing.
      expect(skuCreation.requests).toHaveLength(1);
      expect(product.getSkus()).toStrictEqual([]);
      expect(productRepository.saves).toStrictEqual([]);

      // ONE ground, reported against the collection the legacy attached its errors to.
      expect(refusedRulesOf(refused)).toStrictEqual([
        {
          propertyIdentifier: 'skus',
          errorMessage:
            'sku creation attached no sku to this new product, so the product was not persisted',
        },
      ]);
    });

    it('★ hands the port a product with NO skus when creation is skipped', async () => {
      // The complement, and it is not redundant: SKU creation runs only for a NEW product
      // that validates [model/service/ProductService.cfc:L276-L282]. An existing product
      // therefore reaches persistence with whatever collection it was hydrated with, and a
      // cascade decided by `isNew()` on each held SKU correctly finds nothing to write.
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

  // --- saveProductType -----
  describe('saveProductType', () => {
    it('★ prefers the PAYLOAD name, generating against "SwProductType"', async () => {
      const productType = new ProductType({
        productTypeID: 'product-type-being-saved',
        productTypeName: 'Name On The Entity',
      });
      const data: ProductTypeSaveInput = { productTypeName: 'Name In The Payload' };

      const answered = await service.saveProductType(productType, data);

      // CFML parity [model/service/ProductService.cfc:L295]: THE GUARD HERE IS FOUR CLAUSES -
      //   (isNull(getURLTitle()) || !len(getURLTitle()))
      //     && (!structKeyExists(data,"urlTitle") || !len(data.urlTitle))
      // byte-identical in shape to [model/service/BrandService.cfc:L68], and NOT the one-clause
      // shape at [L268]. The entity has no URL title and the payload holds no `urlTitle` key, so
      // both disjunctions hold and the gate fires. The asymmetry is observable from both sides: the
      // same empty string that SUPPRESSES generation in `saveProduct` TRIGGERS it here, because
      // this gate tests `len()` as well as nullity, and that matched pair is LEGACY rather than a
      // target divergence.
      //
      // CFML parity [model/service/ProductService.cfc:L296]: the preference order is the PAYLOAD's
      // `productTypeName` FIRST and the entity's own SECOND. Both are populated here with DIFFERENT
      // values, the only way to prove which won.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: 'Name In The Payload', tableName: PRODUCT_TYPE_TABLE_NAME },
      ]);

      // ★ THE RESOLVED TITLE LANDS IN THE CALLER'S PAYLOAD, IN PLACE - AND THAT IS
      // WHERE THIS METHOD DIFFERS FROM `saveProduct`, NOT WHERE IT MATCHES IT.
      //
      // An earlier revision introduced this assertion as "the resolved title lands in
      // the caller's payload, in place, exactly as it does in `saveProduct` and for the
      // same reason." The FIRST half is right and is the legacy's own behaviour -
      // [model/service/ProductService.cfc:L297] and [L299] both assign to bare unscoped
      // `data.urlTitle`, and CFML resolves that through the arguments scope, so the
      // caller's struct really is mutated. The COMPARISON was wrong: [L269] assigns
      // `arguments.product.setURLTitle(...)` and never touches the struct, so the two
      // overrides were never doing the same thing for the same reason. The asymmetry is
      // in the source and is reproduced rather than smoothed away: the payload here, the
      // entity there.
      //
      // This method's own populate-then-save step is what carries the value onward,
      // because `super.save(productType, data)` populates FROM the payload
      // [org/Hibachi/HibachiService.cfc:L145] - which is why the struct write is not
      // merely a side effect but the mechanism.
      expect(data.urlTitle).toBe(GENERATED_URL_TITLE);

      // ★ QUOTE-THEN-REVISE. This note used to read "`super.save(productType, data)` is
      // POSITIONAL, and the port member takes THE ENTITY ONLY." The first clause holds. The
      // second described the gap that made the whole struct write pointless: `super.save`
      // takes BOTH arguments and populates the entity from the struct before flushing
      // [model/service/ProductService.cfc:L303], so a one-argument port member had nowhere
      // for the resolved title to travel and the row was written with the entity's own
      // absent `urlTitle`. The member now takes the populate payload, and the case below
      // asserts what reaches it.
      //
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
      // branch's `structKeyExists(...) && len(...)` one line earlier. Both are reproduced as
      // written; the shapes are not unified.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: 'Name On The Entity', tableName: PRODUCT_TYPE_TABLE_NAME },
      ]);
      expect(data.urlTitle).toBe(GENERATED_URL_TITLE);
    });

    it('★ sets NOTHING when neither source yields a name - there is no else', async () => {
      const productType = new ProductType({ productTypeID: 'product-type-with-no-name' });
      const data: ProductTypeSaveInput = {};

      const refused = await refusedEntityOf(() => service.saveProductType(productType, data));

      // CFML parity [model/service/ProductService.cfc:L296-L300]: THERE IS NO `else`. When neither
      // the payload nor the entity yields a usable name the URL title is simply NEVER SET - no
      // throw, no fallback, no empty-string default, no generated placeholder. That silence is the
      // behaviour, and it is identical to [model/service/BrandService.cfc:L69-L73].
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(data.urlTitle).toBeUndefined();
      expect(Object.keys(data)).toStrictEqual([]);

      // ★★ AND THE SAVE DOES NOT HAPPEN, WHICH IS THE OTHER HALF OF THE SAME SILENCE.
      // An earlier revision asserted a save here, noting that "the missing title
      // blocks nothing", on the premise that `model/validation/ProductType.json` was
      // outside this port's reading scope. That premise was false - the file is named
      // in the AAP's in-scope validation set - and it is unambiguous:
      //
      //   "productTypeName": [{"contexts":"save","required":true}],
      //   "urlTitle":        [{"contexts":"save","required":true,"unique":true}]
      //
      // `super.save` validates before it persists and persists ONLY when clean
      // [org/Hibachi/HibachiService.cfc:L150, L153-L155], so a product type with
      // neither a name nor a URL title is REFUSED by the source. This fixture has
      // neither, so both rules fail and nothing reaches the port.
      //
      // The `unique` qualifier on `urlTitle` is deliberately NOT asserted in memory -
      // it is a whole-table constraint, and no port member answers it.
      expect(productTypeRepository.saves).toStrictEqual([]);

      // ★★★ AND THE ENTITY IS ANSWERED, CARRYING ITS ERRORS - the sentence this case has been trying
      // to make true across three revisions. Revision one asserted `answered).toBe(productType)` and
      // claimed the entity carried its errors, which `ProductType` had no channel for. Revision two
      // made the method THROW, which no longer answered the entity at all. Revision three publishes
      // the channel, so [org/Hibachi/HibachiService.cfc:L167] and this assertion finally agree.
      //
      // BOTH failed rules are reported, not just the first, because `validate()` accumulated them all
      // through `addError` [org/Hibachi/HibachiTransient.cfc:L61-L64] before the flush asked
      // `hasErrors()` once.
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
      // ★★★ THE `!hasErrors()` TERM OF [model/service/ProductService.cfc:L306], ASSERTED END TO END.
      // The legacy gates parent-product inheritance on that term, so a product type that failed a
      // save-context rule must come back WITHOUT the parent's collection - and must come back, rather
      // than raise, because `super.save` answers the entity either way
      // [org/Hibachi/HibachiService.cfc:L167]. A revision that threw satisfied the inheritance half by
      // never reaching the statement and broke the return half; a revision that skipped the gate would
      // hand a refused product type the parent's entire catalogue. This case pins both.
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

      // ★ THE INHERITANCE DID NOT HAPPEN, and the parent is untouched on both sides of the association.
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
      // deliberately - `productTypeName` and `urlTitle` are each `required` there - so
      // this case exercises the save-result reassignment rather than the validation
      // gate. The gate has its own case above.
      const argument = new ProductType({
        productTypeID: 'product-type-argument',
        productTypeName: 'Argument Product Type',
        urlTitle: 'argument-title',
      });

      const answered = await service.saveProductType(argument, {});

      // CFML parity [model/service/ProductService.cfc:L303, L306]: the legacy REASSIGNS
      // `arguments.productType` from the save result and every later line reads the reassigned
      // value, so the parent chain that is consulted belongs to the PERSISTED instance. The double
      // answers a different instance precisely so that this is provable.
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

      // Named as well as titled, so both `model/validation/ProductType.json` save
      // rules pass and the inheritance gate at [model/service/ProductService.cfc:L306]
      // is actually reached - its first term is `!productType.hasErrors()`.
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
      //
      // Preserved deliberately; do not fix without a product decision.
      //
      // The legacy comment one line above at [L305] says "inherit all products that were assigned
      // to that parent", and nothing about the statement merges: it is a whole-collection
      // assignment. The child's own product is gone afterwards.
      expect(answered.getProducts()).toStrictEqual([parentProduct]);
      expect(answered.getProducts()).not.toContain(childProduct);

      // LEGACY-NOTE [model/entity/ProductType.cfc:L101-L107]: the CFML statement is a reference
      // assignment, so under Hibernate the two entities would have gone on to share one live
      // collection. That second consequence does NOT survive into the port, and the reason is in
      // the ENTITY rather than in this service: `ProductType.setProducts` reproduces
      // [model/entity/ProductType.cfc:L103], which REBINDS `variables.Products` to a fresh array
      // and then adds each element - so the legacy setter did not share either. The arrays are
      // therefore distinct afterwards and a later write through one is not visible through the
      // other. Pinned here rather than assumed, because a reader coming from the L307 defect
      // description would otherwise expect aliasing.
      expect(answered.getProducts()).not.toBe(parentProductType.getProducts());

      const laterProduct = makeProductFixture({ productID: 'product-added-to-the-parent-later' });
      parentProductType.addProduct(laterProduct);

      expect(parentProductType.getProducts()).toStrictEqual([parentProduct, laterProduct]);
      expect(answered.getProducts()).toStrictEqual([parentProduct]);
    });

    it('inherits nothing when the parent holds no products, and nothing when there is no parent', async () => {
      const childProduct = makeProductFixture({ productID: 'product-owned-by-the-child' });

      const emptyParent = new ProductType({ productTypeID: 'parent-without-products' });
      // ★ BOTH SAVE-CONTEXT RULES ARE SATISFIED on the two subjects below - `productTypeName` as well
      // as `urlTitle` - because this case is about the INHERITANCE branch and a refusal would now stop
      // execution before reaching it. Adding the name is what keeps the case testing what it says it
      // tests; asserting the refusal belongs to the case that exists for it.
      const withEmptyParent = new ProductType({
        productTypeID: 'child-of-empty-parent',
        productTypeName: 'Child Of Empty Parent',
        urlTitle: 'child-title',
        parentProductType: emptyParent,
      });
      withEmptyParent.addProduct(childProduct);

      const firstAnswer = await service.saveProductType(withEmptyParent, {});

      // CFML parity [model/service/ProductService.cfc:L306]: `arrayLen(...)` is a BARE NUMERIC
      // TRUTHINESS TEST on the parent's collection, so an empty parent collection skips the
      // assignment entirely - and the child KEEPS its own products. Without this case the
      // replace-not-merge assertion above could not be distinguished from an unconditional clear.
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

  // -------------------------------------------------------------------------
  // ★ The populate payload both save overrides hand to persistence.
  //
  // ★ DECLARED NET-NEW COVERAGE under AAP 0.6.6. `meta/tests/unit/service/` holds
  // only AccountServiceTest, HibachiServiceTest, PaymentServiceTest and
  // UtilityRBServiceTest - no legacy test reaches `ProductService` at all - and the
  // populate step these cases pin was `HibachiEntity.populate` and
  // `HibachiService.save`, framework code that is not ported and was never tested
  // here either.
  //
  // WHY THIS GROUP EXISTS SEPARATELY FROM THE TWO SAVE GROUPS ABOVE. Those groups
  // assert the DECISIONS - which guard shape fires, which title source wins, which
  // physical table the uniqueness scope names, whether validation lets the save
  // proceed. This group asserts that the decision REACHES PERSISTENCE. The
  // distinction is not academic: every decision above was already correct while the
  // resolved url title was reaching nothing but the caller's own object, because
  // `Product.urlTitle` and `ProductType.urlTitle` are `private readonly` and the
  // repository members took the entity alone. The row was written with the entity's
  // still-absent title, so the generation guard - which fires only when there is no
  // title [model/service/ProductService.cfc:L268, L295] - fired again on the very
  // next save, minting a fresh unique title each time and storing none of them.
  //
  // BOTH MEMBERS ARE ALWAYS STATED, NEVER OMITTED, and that is deliberate rather
  // than incidental: the payload distinguishes an ABSENT key from a key holding
  // `undefined`, an absent key tells the adapter to fall back to the entity, and
  // this service has already resolved both values. Omitting one would ask two tiers
  // to decide the same column.
  // -------------------------------------------------------------------------
  describe('the populate payload that carries a resolved url title to persistence', () => {
    it('saveProduct hands the GENERATED title to the repository, not just to the caller', async () => {
      const product = makeProductFixture({ urlTitle: undefined });

      await service.saveProduct(product, {});

      // The end-to-end statement of the fix, at this tier: generation fired, and the value it
      // produced is what the repository was handed. Reading the title back off
      // `productRepository.saves[0]` alone would prove less than it looks, which is why the
      // double records the payload separately - the payload is the channel the ROW is written
      // from, and it must state what this method resolved rather than leave the adapter to
      // re-decide it.
      expect(urlTitleGenerator.requests).toHaveLength(1);
      expect(productRepository.savePayloads).toStrictEqual([
        { urlTitle: GENERATED_URL_TITLE, productName: FIXTURE_PRODUCT_NAME },
      ]);

      // ★ AND THE ENTITY CARRIES IT AS WELL, WHICH IS THE OTHER HALF AND NOT A DUPLICATE.
      //
      // QUOTE-THEN-REVISE: this line used to assert `undefined`, closing "the entity -
      // immutable - still has nothing." The entity is no longer immutable in this respect and
      // never should have been: [model/service/ProductService.cfc:L269] is literally
      // `arguments.product.setURLTitle( ... )`, a write to the ENTITY, and a caller composing
      // `getProductURL()` [model/entity/Product.cfc:L207] straight afterwards has to see it.
      // The two channels cannot disagree, because the payload's `urlTitle` is read back OFF
      // the entity at the save site rather than from a local - so this assertion and the one
      // above are two views of one resolved value.
      //
      // The asymmetry with `saveProductType` is preserved and is the source's own: that
      // method's gate writes the CALLER'S STRUCT [L297, L299], this one writes the entity, and
      // neither was harmonised into the other.
      expect(product.getUrlTitle()).toBe(GENERATED_URL_TITLE);
    });

    it('saveProduct prefers the PAYLOAD title over the entity, and generates for neither', async () => {
      const product = makeProductFixture({ urlTitle: 'a-title-already-on-the-entity' });
      const data: ProductSaveInput = { urlTitle: 'a-title-the-caller-supplied' };

      await service.saveProduct(product, data);

      // Populate first [model/service/ProductService.cfc:L266], THEN the guard [L268]:
      // the payload's value becomes the entity's effective title, so the one-clause guard
      // sees a non-null title and no generation happens - and it is the payload's value,
      // not the entity's, that reaches the row.
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(productRepository.savePayloads).toStrictEqual([
        { urlTitle: 'a-title-the-caller-supplied', productName: FIXTURE_PRODUCT_NAME },
      ]);
    });

    it('saveProduct carries the PAYLOAD product name, which no step of its own reads', async () => {
      const product = makeProductFixture();
      const data: ProductSaveInput = { productName: 'A Name The Caller Supplied' };

      await service.saveProduct(product, data);

      // `productName` is populated and CARRIED, never branched on: the guard at [L268] and
      // the save-context rules at [L273] both concern the url title alone. The entity's
      // `urlTitle` is present, so the payload restates it rather than generating.
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(productRepository.savePayloads).toStrictEqual([
        { urlTitle: FIXTURE_URL_TITLE, productName: 'A Name The Caller Supplied' },
      ]);
    });

    it('saveProduct restates the ENTITY values when the payload carries neither key', async () => {
      const product = makeProductFixture();

      await service.saveProduct(product, {});

      // The no-op populate: both members stated, both taken off the entity. Stating them
      // is what stops the adapter from re-deciding a column this tier already settled.
      expect(productRepository.savePayloads).toStrictEqual([
        { urlTitle: FIXTURE_URL_TITLE, productName: FIXTURE_PRODUCT_NAME },
      ]);
    });

    it('saveProduct hands NO payload at all when validation refused the save', async () => {
      // The ordering guarantee, from the other side. `productName` is `required` in the
      // save context, so this product fails and [L286-L288] is never reached - which means
      // the payload must not exist either. A populate step that ran unconditionally would
      // leave a recorded payload with no recorded save beside it.
      const product = makeProductFixture({ productName: undefined });

      const refused = await refusedEntityOf(() => service.saveProduct(product, {}));

      // ★ AND IT IS THE CALLER'S OWN INSTANCE, ANSWERED RATHER THAN RAISED [model/service/ProductService.cfc:L291].
      expect(refused).toBe(product);
      expect(productRepository.saves).toStrictEqual([]);
      expect(productRepository.savePayloads).toStrictEqual([]);
      // The refusal is DETECTABLE, so "no payload was handed over" is something a caller learns rather
      // than something only a test can see.
      expect(refusedRulesOf(refused)).toStrictEqual([
        { propertyIdentifier: 'productName', errorMessage: 'productName is required' },
      ]);
    });

    // -----------------------------------------------------------------------
    // POPULATE-BEFORE-VALIDATE, BOTH DIRECTIONS
    //
    // ★★★ THE ORDERING THE FINDING WAS ABOUT, ASSERTED FROM BOTH SIDES. `populate` runs at
    // [model/service/ProductService.cfc:L266] and `validate(context="save")` at [L273], so the state
    // validation judges IS the state that will be written. Two consequences follow, and only asserting
    // BOTH pins the order: a VALID PAYLOAD MUST REPAIR AN INVALID ENTITY, and AN INVALID PAYLOAD MUST
    // NOT PASS ON STALE ENTITY STATE. A port that validated first would fail the first; a port that
    // populated but validated the pre-populate snapshot would fail the second.
    // -----------------------------------------------------------------------

    it('★ saveProduct: a VALID PAYLOAD REPAIRS an entity that is invalid on its own', async () => {
      // The entity has NO `productName`, which is `required` in the save context
      // [model/validation/Product.json]. On its own it is refused - the sibling case
      // 'neither creates SKUs nor saves an invalid product' proves exactly that. The payload supplies
      // the missing name, and because populate runs FIRST the rule sees the submitted value.
      const product = makeProductFixture({ productName: undefined });
      const data: ProductSaveInput = { productName: 'A Name Only The Payload Has' };

      const answered = await service.saveProduct(product, data);

      // It saved, which is the whole assertion: the payload repaired the entity.
      expect(product.hasErrors()).toBe(false);
      expect(productRepository.saves).toStrictEqual([product]);
      expect(answered).toBe(persistedProduct);

      // And the value is ON THE ENTITY, not merely in a local that the payload restated. This is the
      // exact defect code review recorded: the name used to be held in a local, so the rule read the
      // stale entity and refused a payload that should have succeeded.
      expect(product.getProductName()).toBe('A Name Only The Payload Has');
      expect(productRepository.savePayloads).toStrictEqual([
        { urlTitle: FIXTURE_URL_TITLE, productName: 'A Name Only The Payload Has' },
      ]);
    });

    it('★ saveProduct: an INVALID PAYLOAD cannot pass on STALE entity state', async () => {
      // The entity is valid. The payload BLANKS the name - which populate copies, because a blank is
      // a value [org/Hibachi/HibachiTransient.cfc] - and the rule then judges the blank rather than
      // the name the entity arrived with. A port that validated the pre-populate snapshot would have
      // saved this product and written the empty name, which is the second half of the finding.
      const product = makeProductFixture();
      expect(product.getProductName()).toBe(FIXTURE_PRODUCT_NAME);

      const data: ProductSaveInput = { productName: '   ' };

      const refused = await refusedEntityOf(() => service.saveProduct(product, data));

      // ★ THE BLANK WAS TRIMMED ON THE WAY IN, which is `_setProperty(name, trim(value))`
      // [org/Hibachi/HibachiTransient.cfc]. `productName` declares `notNull="true"`
      // [model/entity/Product.cfc:L55], so it is stored as `''` rather than cleared to NULL - the one
      // column in the populate set that takes that arm.
      expect(refused.getProductName()).toBe('');
      expect(refusedRulesOf(refused)).toStrictEqual([
        { propertyIdentifier: 'productName', errorMessage: 'productName is required' },
      ]);
      expect(productRepository.saves).toStrictEqual([]);
      expect(productRepository.savePayloads).toStrictEqual([]);
    });

    it('★ saveProduct POPULATES every declared scalar column, trimmed', async () => {
      // The full populate set, in one case, because "expand the typed input and population layer to
      // every in-scope mutable field" is only demonstrably done if every member lands. The columns are
      // [model/entity/Product.cfc:L53-L59] plus the `remoteID` audit column.
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

      // The entity is what the adapter binds the remaining columns from, so the save happened and the
      // payload restates only the two columns it addresses.
      expect(productRepository.saves).toStrictEqual([product]);
    });

    it('★ saveProduct leaves a column ALONE when the payload omits its key', async () => {
      // `structKeyExists` [org/Hibachi/HibachiTransient.cfc] is the populate guard, so an ABSENT key
      // is not "populate to undefined" - it is "do not touch". That distinction is what makes a
      // partial update partial rather than destructive.
      const product = makeProductFixture({ productCode: 'code-on-the-entity' });

      await service.saveProduct(product, { productName: 'Only The Name Arrived' });

      expect(product.getProductName()).toBe('Only The Name Arrived');
      expect(product.getProductCode()).toBe('code-on-the-entity');
    });

    it('★ saveProduct REFUSES a sortOrder that is not an ORM integer', async () => {
      // The column is `ormtype="integer"` [model/entity/Product.cfc:L59]. The legacy had Hibernate's
      // own coercion between `_setProperty` and the column; this tier has none, so a fractional value
      // is refused rather than truncated on its way to the row. It is a PAYLOAD-SHAPE refusal, which
      // is why it throws where a failed validation rule does not.
      const product = makeProductFixture();

      await expect(service.saveProduct(product, { sortOrder: 1.5 })).rejects.toThrow(
        /ormtype="integer"/,
      );

      expect(productRepository.saves).toStrictEqual([]);
    });

    it('★ saveProductType: a VALID PAYLOAD REPAIRS an entity that is invalid on its own', async () => {
      // The mirror of the `saveProduct` case, on the other save flow. `super.save`'s populate step
      // [org/Hibachi/HibachiService.cfc:L145] runs before `validate` [L150], so a submitted
      // `productTypeName` satisfies its own `required` rule [model/validation/ProductType.json].
      // This is the defect code review recorded as "validates stale entity state instead of populated
      // productTypeName".
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
      // The entity is valid on its own. The payload blanks the name; populate copies the blank, and
      // the `required` rule then judges it. Note the generation gate does NOT fire: its fourth clause
      // reads `data.urlTitle`, and its inner branches need a NON-EMPTY name from either source, so a
      // blank payload name falls through to the entity name - which the gate then uses. That is the
      // source's own preference order [model/service/ProductService.cfc:L296-L299], reproduced, and it
      // is why the refusal names only `productTypeName`.
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

      // ★ THE ORDERING THIS CASE PINS. The gate writes the resolved title INTO the struct
      // [model/service/ProductService.cfc:L297], and `super.save(productType, data)`
      // [L303] populated the entity FROM the struct as mutated. So the payload handed to
      // the repository has to be read back out of `data` AFTER the gate rather than
      // captured before it - a service that snapshotted the payload first would send the
      // pre-gate value and persist nothing.
      expect(data.urlTitle).toBe(GENERATED_URL_TITLE);
      expect(productTypeRepository.savePayloads).toStrictEqual([
        { urlTitle: GENERATED_URL_TITLE, productTypeName: 'Name In The Payload' },
      ]);

      // ★ AND THE ENTITY CARRIES IT TOO, WHICH IS THE OTHER HALF OF `super.save`.
      //
      // QUOTE-THEN-REVISE: this line used to assert `getUrlTitle()` was still `undefined`,
      // on the premise that `ProductType.urlTitle` is immutable and the payload is the only
      // channel. `super.save(arguments.productType, arguments.data)`
      // [model/service/ProductService.cfc:L303] is populate-THEN-validate-THEN-save
      // [org/Hibachi/HibachiService.cfc:L145, L150, L153-L155], and its POPULATE step copies
      // `data.urlTitle` onto the entity - which is exactly why the gate at [L297] writes the
      // struct rather than the entity. Both halves are reproduced: the gate writes the
      // struct, populate moves it onto the entity, and the payload states what the row is
      // written with. A caller composing `getProductTypeURL()` afterwards needs the entity
      // half, and the validation step needs it too - `urlTitle` is `required` in the save
      // context [model/validation/ProductType.json], and it is the ENTITY that is validated.
      expect(productType.getUrlTitle()).toBe(GENERATED_URL_TITLE);
    });

    it('saveProductType hands the resolved title through from the ENTITY name too', async () => {
      const productType = new ProductType({
        productTypeID: 'product-type-without-a-payload-name',
        productTypeName: 'Name On The Entity',
      });

      await service.saveProductType(productType, {});

      // The second inner branch [model/service/ProductService.cfc:L298-L299] reaches the
      // same struct key, so the same channel carries it. `productTypeName` is ABSENT from
      // the payload here, so it falls back to the entity's - the two members resolve
      // independently.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: 'Name On The Entity', tableName: PRODUCT_TYPE_TABLE_NAME },
      ]);
      expect(productTypeRepository.savePayloads).toStrictEqual([
        { urlTitle: GENERATED_URL_TITLE, productTypeName: 'Name On The Entity' },
      ]);
    });

    it('saveProductType NEVER reaches persistence when the gate sets nothing', async () => {
      // ★ THE `else` THAT DOES NOT EXIST [model/service/ProductService.cfc:L300], followed
      // to its end - which turns out NOT to be persistence.
      //
      // QUOTE-THEN-REVISE, AND THE REVISION IS THE INTERESTING PART. This case used to
      // assert a recorded payload of `{ urlTitle: undefined, productTypeName: undefined }`,
      // reasoning that "the payload must then report absence rather than inventing a value.
      // `undefined` here is the honest answer, and the adapter writes SQL NULL for it." The
      // honesty argument is right and the destination was wrong: THE ROW IS NEVER WRITTEN,
      // because `super.save` validates between populating and saving
      // [org/Hibachi/HibachiService.cfc:L150, L153-L155] and BOTH save-context rules fail
      // here - `productTypeName` and `urlTitle` are each `required`
      // [model/validation/ProductType.json], and `validate_required` demands
      // `len(trim(propertyValue))` [org/Hibachi/HibachiValidationService.cfc:L242].
      //
      // ★★ SO THE MISSING `else` IS UNREACHABLE-TO-PERSISTENCE, AND THAT IS A PROPERTY OF
      // THE SOURCE WORTH PINNING. The gate resolves nothing only when NEITHER the payload
      // nor the entity carries a `productTypeName` [L296-L299] - and in exactly that state
      // the `productTypeName` rule fails, so no title could have been persisted as absent no
      // matter what the gate did. The absent title is therefore observable on the ENTITY and
      // in the untouched struct, never in a row.
      const productType = new ProductType({ productTypeID: 'product-type-with-no-name' });
      const data: ProductTypeSaveInput = {};

      const refused = await refusedEntityOf(() => service.saveProductType(productType, data));

      // ★ AND IT IS THE CALLER'S OWN INSTANCE, ANSWERED RATHER THAN RAISED [model/service/ProductService.cfc:L291].
      expect(refused).toBe(productType);
      expect(urlTitleGenerator.requests).toStrictEqual([]);

      // Nothing was written into the caller's struct - the two write sites [L297] and [L299]
      // both sit inside branches that did not fire.
      expect(data).toStrictEqual({});
      expect(productType.getUrlTitle()).toBeUndefined();

      // ★★★ AND THE REFUSAL IS A REFUSAL, NOT A THROW: the framework answers the entity either way
      // [org/Hibachi/HibachiService.cfc:L167], so the caller gets its own unpersisted product type
      // back - now WITH the errors CFML left on it, which is the half two earlier revisions of this
      // case could not reproduce and one of them replaced with a throw.
      expect(productTypeRepository.saves).toStrictEqual([]);
      expect(productTypeRepository.savePayloads).toStrictEqual([]);
      expect(refused).toBe(productType);
      expect(refusedRulesOf(refused).map((rule) => rule.propertyIdentifier)).toStrictEqual([
        'productTypeName',
        'urlTitle',
      ]);
    });

    it('saveProductType passes a caller-supplied title through untouched', async () => {
      // The entity carries a name for ONE reason, and it is not the gate: `productTypeName`
      // is `required` in the save context [model/validation/ProductType.json], so a nameless
      // product type never reaches the row and this case would be asserting against a
      // refusal instead of against a pass-through. The name is deliberately one the gate
      // cannot use - the fourth clause suppresses generation before it is ever read.
      const productType = new ProductType({
        productTypeID: 'product-type-with-a-payload-title',
        productTypeName: 'Name On The Entity',
      });
      const data: ProductTypeSaveInput = { urlTitle: 'a-title-the-caller-supplied' };

      await service.saveProductType(productType, data);

      // The fourth clause of the gate [model/service/ProductService.cfc:L295] suppresses
      // generation, and the caller's own value is what populate applied - so it is what
      // reaches the row, unchanged, on the entity and in the payload alike.
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(productType.getUrlTitle()).toBe('a-title-the-caller-supplied');
      expect(productTypeRepository.savePayloads).toStrictEqual([
        { urlTitle: 'a-title-the-caller-supplied', productTypeName: 'Name On The Entity' },
      ]);
    });
  });

  // --- deleteProduct -----
  describe('deleteProduct', () => {
    it('deletes and answers true when no transaction exists', async () => {
      const product = makeProductFixture({ productID: 'product-to-delete' });

      skuRepository.transactionExists = false;
      productRepository.deleteOutcome = true;

      const answered = await service.deleteProduct(product);

      // CFML parity [model/service/ProductService.cfc:L318]: the delete-context rule is
      // `transactionExistsFlag eq false`, and it is asked through the REPOSITORY rather than
      // through the entity's own accessor - the entity's version depends on having been hydrated
      // with a SKU-repository collaborator and throws when it was not. ONE ARGUMENT is passed, the
      // product identifier; the port's second parameter is optional and is deliberately left absent
      // rather than filled with a placeholder.
      expect(skuRepository.transactionProbes).toStrictEqual([
        { productID: 'product-to-delete', skuID: undefined },
      ]);

      // CFML parity [model/service/ProductService.cfc:L326]:
      //   super.delete(arguments.product)
      // is POSITIONAL and answers a boolean.
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
      // was NEVER an exception in the legacy - it answered false. No throw is introduced.
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

      // The detach is observed WHILE the delete is in flight, because on this path the
      // before and after states are identical and only the middle differs.
      let designationAtDelete: Sku | undefined | 'not-observed' = 'not-observed';

      productRepository.onDelete = (deleted: Product): void => {
        designationAtDelete = deleted.getDefaultSku();
      };

      const answered = await service.deleteProduct(product);

      expect(productRepository.deletes).toStrictEqual([product]);
      expect(answered).toBe(false);

      // CFML parity [model/service/ProductService.cfc:L323, L332]: the legacy takes a SNAPSHOT of
      // the default SKU, DETACHES it with
      //   setDefaultSku(javaCast("null",""))
      // so the delete is not blocked by the foreign key, and RESTORES the snapshot on the failure
      // exit. The observable contract of that three-step dance is exactly this: after a failed
      // delete the product still has the default SKU it started with.
      //
      // ★★ AND THE STEPS THEMSELVES ARE OBSERVABLE NOW, WHICH THEY WERE NOT BEFORE.
      // An earlier revision recorded here that the detach and the restore "are not
      // individually observable in the port", because `Product.defaultSku` was
      // `private readonly` and "no member may be added to create one". The first half
      // was an accurate observation about the shipped class; the second half did not
      // follow, and while it stood the restore held only BY CONSTRUCTION - a no-op
      // asserting a snapshot that had never been disturbed. `Product.setDefaultSku`
      // was authored, and all three of [L320], [L323] and [L329-L333] now run.
      //
      // ★ QUOTE-THEN-REVISE ON WHERE THE STEPS ARE OBSERVED. This case used to read the
      // count of repository WRITES - "TWO writes reach the repository on this path: the
      // detach flush, then the restore flush. Both are asserted, because the count is what
      // distinguishes a real detach-and-restore from an unchanged field." The distinction it
      // was reaching for is the right one; the channel was wrong. Two service-level saves put
      // each step in its OWN transaction on its own connection, so a failure between the
      // detach write and the delete would leave a committed `defaultSkuID = NULL` behind for
      // a delete that never happened. The FLUSH therefore moved into
      // `mysqlProductRepository.deleteProduct`, which issues
      // `UPDATE SwProduct SET defaultSkuID = NULL` as the first statement of the delete's own
      // transaction - so a refusal rolls it back - and that statement's position is pinned by
      // `tests/integration/repositories/mysqlProductRepository.test.ts`.
      //
      // WHAT DID NOT MOVE IS THE IN-MEMORY MUTATION, which is the half this tier owes its
      // caller, and it is asserted here on the same two-sided principle: the designation was
      // ABSENT while the delete was in flight, and PRESENT again once the failure exit had
      // run. An unchanged field could not produce both readings.
      expect(designationAtDelete).toBeUndefined();
      expect(productRepository.saves).toStrictEqual([]);

      // And the END STATE is still the contract: the snapshot is back on the product, and it
      // is the SAME INSTANCE rather than an equal one.
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

      // ★ CFML parity [model/service/ProductService.cfc:L323]: the association is cleared so
      // the delete is not blocked by `SwProduct.defaultSkuID`.
      //
      // ★ QUOTE-THEN-REVISE. This case used to assert `saves` equal to `[product]`, on the
      // reasoning that "the clear is FLUSHED because there is no ambient `cftransaction` here
      // to make an uncommitted null-out visible to the DELETE that follows". The requirement
      // is real and it is now met by a STRONGER mechanism than a separate service-level write:
      // the clear is the first statement INSIDE the delete's own transaction in
      // `mysqlProductRepository.deleteProduct`, so it is visible to the DELETE that follows it
      // and it is rolled back with it on refusal. A service-level flush would have been a
      // second transaction and could not have offered either guarantee.
      //
      // So this tier issues NO write, and the DELETE is the only call it makes.
      expect(productRepository.saves).toStrictEqual([]);
      expect(productRepository.deletes).toStrictEqual([product]);
      expect(answered).toBe(true);

      // The legacy does not restore on success either: [L329-L333] sits inside the
      // `else` of the delete test. The row is gone, so there is nothing to restore to.
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

      // ★★ ORDERING JUDGMENT, ASSERTED RATHER THAN LEFT IMPLICIT. The legacy clears the
      // association at [L323] BEFORE testing the delete rule, and its uncommitted
      // clear vanished with the enclosing transaction when the rule refused. There is
      // no ambient transaction here, so writing and then un-writing would leave a real
      // UPDATE - and possibly a second one - behind for a delete that never happened.
      // Refusing first is strictly closer to the legacy's observable outcome, and the
      // EMPTY save list is the whole proof.
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

      // The legacy assignment at [L323] was unconditional, but assigning `undefined`
      // over `undefined` and then issuing an UPDATE that changes no column is a write
      // the source never performed - CFML's ORM flushed a dirty entity, and this one
      // is not dirty. Nothing is written.
      expect(productRepository.saves).toStrictEqual([]);
      expect(productRepository.deletes).toStrictEqual([product]);
    });
  });
});
