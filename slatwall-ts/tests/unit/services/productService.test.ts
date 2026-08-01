// ---------------------------------------------------------------------------
// slatwall-ts - unit suite pinning `src/services/productService.ts`
//
// ---------------------------------------------------------------------------
// 100% NET-NEW COVERAGE - NEVER TO BE PRESENTED AS PARITY
// ---------------------------------------------------------------------------
// Not one assertion below has a legacy antecedent. `meta/tests/unit/service/`
// holds exactly four components - AccountServiceTest, HibachiServiceTest,
// PaymentServiceTest and UtilityRBServiceTest - none of them in scope and none
// of them touching the product service, so there is NO legacy
// `ProductServiceTest` anywhere under `meta/tests/`. This suite is net-new in
// full, and saying so is a requirement rather than a courtesy: presenting
// net-new coverage as parity would fail the traceability gate.
//
// ! THE TRAP WORTH NAMING, AND IT IS SHARPER HERE THAN ANYWHERE ELSE IN THE
// FOLDER. `meta/tests/unit/entity/ProductTest.cfc` DOES exist, and it DOES
// carry one real legacy case - `productUrlIsCorrectlyFormatted()`, which builds
// a product with the URL title `nike-air-jorden` and asserts the formatting of
// `getProductURL()`. That case covers the Product ENTITY, and it is carried
// forward by the sibling-owned `tests/unit/domain/entities/product.test.ts`. It
// gives THIS file zero coverage lineage, and its coverage is deliberately NOT
// claimed here. Nothing below asserts anything about `getProductURL()`, about
// the entity's own defaults, or about the four cases the legacy base component
// `meta/tests/unit/entity/SlatwallEntityTestBase.cfc` contributed to it.
//
// The one legacy functional artefact for this area,
// `meta/tests/functional/admin/entity/ProductTest.cfc`, is 53 lines of EMPTY
// STUB - a component declaration with no test method in it at all. It
// contributes ZERO coverage to anybody. It is acknowledged here as a gap and is
// never counted.
//
// Two further legacy tests DO reach a method this file covers, and both are
// deliberately EXCLUDED rather than carried. They are named, with their reasons,
// in the `deliberately excluded legacy coverage` block far below - not hidden in
// this header, because an exclusion that a reader has to hunt for is not really
// declared.
//
// ---------------------------------------------------------------------------
// WHAT IS UNDER TEST
// ---------------------------------------------------------------------------
// `model/service/ProductService.cfc` is 367 lines and is the WIDEST surface in
// this folder: fifteen public methods, eight declared DI properties, and the
// project's must-preserve area (iii). The ported class publishes all fifteen
// method names verbatim in legacy CFML camelCase, because method-level interface
// parity is this migration's acceptance contract.
//
// FOURTEEN of the fifteen are `async`; exactly ONE - `getFormattedOptionGroups`
// - is synchronous, because it reaches no repository and only walks
// already-materialized associations. Every method below is invoked AS SHIPPED:
// the synchronous one without `await`, the other fourteen with. That is not a
// stylistic preference, it is how this suite enforces the async-boundary
// contract - a floating promise, a pointless `async`, or an `await` on a
// non-thenable would each be a lint failure rather than a passing test.
//
// ---------------------------------------------------------------------------
// ★ FOUR PLACES WHERE THE SHIPPED SURFACE DIFFERS FROM ITS DESCRIPTION
// ---------------------------------------------------------------------------
// The suite ADAPTS to the shipped module; the shipped module is never adapted to
// the suite. Four differences were found by reading `src/services/*` and are
// recorded here so a reviewer sees them declared rather than discovers them:
//
//   1. THE CONSTRUCTOR TAKES EIGHT PORTS, NOT NINE. `ProductService.length` is
//      8. There is NO `OptionRepository` edge: the module imports only the
//      `SelectOption` TYPE from that port file, and a shared type is not an
//      injected edge. The legacy component declares no `optionDAO` property
//      either, so eight is the faithful count. Asserted below.
//   2. `ProductRepository` DECLARES SEVEN MEMBERS, NOT SIX, and it is locked at
//      seven: `getAttributeSets`, `loadDataFromFile`,
//      `searchProductsByProductType`, `getProductByProductID`, `saveProduct`,
//      `deleteProduct`, `saveBrand`. The sibling `brandService.test.ts` double
//      implements the same seven, which corroborates the count independently.
//      Asserted below.
//   3. `saveProduct` WRITES THE RESOLVED URL TITLE INTO THE PAYLOAD, NOT ONTO
//      THE ENTITY, and it reads `getCalculatedTitle()` where the legacy read
//      `getTitle()`. Both follow from the ported entity: `Product.urlTitle` is
//      `private readonly` and publishes no setter, and no `getTitle()` member
//      exists. The shipped module documents this as the one place it diverges
//      from the legacy in WHERE a value lands. This suite pins WHAT SHIPPED and
//      annotates the departure; it does not assert the description.
//   4. BOOLEAN `true` DOES SATISFY THE `eq 1` CONDITION. The shipped condition
//      helper answers a boolean flag directly, which is correct CFML - a
//      boolean converts to 1 in a numeric comparison, so `true EQ 1` holds. The
//      activation set is therefore numeric `1` yes, string `'1'` yes, boolean
//      `true` YES, string `'true'` no. All four are asserted, and the
//      runtime-versus-validation disagreement is demonstrated with `'true'` and
//      `2` instead - values that are truthy at run time yet not equal to 1.
//
// ---------------------------------------------------------------------------
// THE IN-MEMORY DOUBLE IDIOM THIS FILE FOLLOWS
// ---------------------------------------------------------------------------
// All EIGHT ports are replaced by hand-written in-memory doubles declared inline
// in this file, typed against the shipped contract, recording what they received
// and answering deterministic synthetic values. Four properties make each one a
// double rather than a mock, and every one is load-bearing:
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
// exactly FOURTEEN. The other THIRTEEN are implemented as members that RAISE.
// That is not padding and it is not deferred work: the behaviour they implement
// IS "this must not happen, and here is which member happened", which turns a
// silently-grown collaboration into a named failure.
//
// ---------------------------------------------------------------------------
// WHAT THIS SUITE DELIBERATELY DOES NOT DO, EACH STATED RATHER THAN LEFT SILENT
// ---------------------------------------------------------------------------
//   * NO SQL, PARAMETERISED OR OTHERWISE - AND THAT IS NOT A GAP. The project
//     holds every query to prepared statements, which is what preserves the
//     injection-safety guarantee the legacy `cfqueryparam` gave. That obligation
//     cannot be discharged from here, because the unit under test issues no
//     query at all. In particular THE AND-OF-EXISTS MATCHING SEMANTICS OF
//     `model/dao/SkuDAO.cfc:L107-L128` ARE NOT ASSERTED IN THIS SUITE. That SQL
//     - the `0 = 0` tautology, one correlated `EXISTS` per selected option, and
//     the optional product filter - is the actual must-preserve behaviour behind
//     `getProductSkusBySelectedOptions`, and it is asserted in the
//     sibling-owned `tests/integration/repositories/` tier, where a real
//     statement exists to assert against. Recording that here is the difference
//     between "not applicable" and "forgotten".
//   * NO DATABASE, NO NETWORK, NO FILESYSTEM AND NO ENVIRONMENT READ. All eight
//     collaborators are in-memory doubles, so this suite passes with a
//     completely empty environment and no `.env` present. `tests/setup.ts` loads
//     dotenv defensively for the tiers that need it; nothing here reads what it
//     loaded, and no credential, host name or connection value appears anywhere
//     in this file. The image path assertions compose STRINGS and touch no disk.
//   * NO RAW FLOATING-POINT MONEY, INCLUDING IN EXPECTED VALUES. Every monetary
//     value below is a `Money` built from a decimal STRING, and every monetary
//     expectation is either a `Money` comparison or a two-decimal decimal
//     string. No arithmetic is performed on a JavaScript number anywhere in this
//     file, and `Money.zero` is never used as a stand-in for an absent price.
//   * NO TIMING ASSERTION OF ANY KIND. `loadDataFromFile` raises the platform
//     request timeout at `model/service/ProductService.cfc:L65-L68`. That is a
//     PLATFORM FACT about the CFML host, not a service-level objective, and this
//     suite asserts nothing about any duration, sets no per-test timeout, and
//     makes no claim about how long any call takes.
//   * NO MOCKING LIBRARY. The project pins fourteen packages and this suite adds
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
// ---------------------------------------------------------------------------
// USER-SPECIFIED RULES: NONE EXIST
// ---------------------------------------------------------------------------
// The project's rules document reports that no user rules were provided. Their
// absence is NOT licence to lower the bar and is NOT an invitation to invent
// one, so no rule is cited anywhere in this file and no file enters scope by
// rule mandate. Enterprise-standard best practice applies in their place, and
// the specific practices this suite is held to are the ones listed above.
//
// ---------------------------------------------------------------------------
// BUDGET LEDGERS THIS SUITE SPENDS FROM, AND THE ONES IT DOES NOT
// ---------------------------------------------------------------------------
//   * SIGNATURE RESHAPING #2 is HALF-SPENT HERE. Legacy `getProductSmartList`
//     [model/service/ProductService.cfc:L342-L358] became the typed
//     `findProducts(criteria)`; its twin `findSkus` lives in
//     `skuService.test.ts`. The rename is annotated at the assertion, and NO
//     generic dynamic query language is built or asserted.
//   * ZERO DELIBERATE DIVERGENCES belong here. All three the project permits are
//     spent elsewhere - two in `promotion/discountAmount.test.ts` and one in
//     `src/domain/entities/product.ts` - so nothing below is presented as a
//     deliberate divergence.
//   * NO VISIBILITY WIDENING. All five the project permits are in the promotion
//     slice. Every method exercised below is public on the shipped class.
//   * NO SIGNATURE WIDENING. The one the project permits is spent on a sibling
//     entity method.
//   * ENTITY-OWNED DEFECTS ARE NOT ASSERTED HERE. Defect 19, the `getBrandName`
//     memo poisoning at `model/entity/Product.cfc:L524-L532`, and defect 20, the
//     missing `return` at `model/entity/Product.cfc:L598`, both belong to
//     `tests/unit/domain/entities/product.test.ts`. Neither appears below.
//
// The marker forms that DO appear in this file are LEGACY-DEFECT, LEGACY-NOTE,
// JUDGMENT CALL and CFML parity, each written immediately adjacent to the
// assertion it pins.
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
import { ProductService } from '../../../src/services/productService.js';
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

// ---------------------------------------------------------------------------
// Port types, DERIVED from the shipped constructor rather than imported by name
// ---------------------------------------------------------------------------
//
// JUDGMENT CALL: all eight collaborator types are reached through
// `ConstructorParameters<typeof ProductService>` instead of being imported
// individually. Two reasons, and the second is the stronger one.
//
// First, it keeps the dependency set narrow. Importing each port by name would
// also drag in the entity and payload types those ports mention in their
// signatures - `Brand`, `AttributeSetSummary`, `BrandSavePayload`,
// `ImageUploadResultProjection`, `SubscriptionTermHandle` - none of which this
// suite has any business naming.
//
// Second, and independently worth doing: deriving from the SHIPPED CONSTRUCTOR
// means a double can never drift from the class it is handed to. Reorder the
// parameters, retype one, or add a ninth collaborator, and this file stops
// compiling - which is exactly the signal a suite should give, rather than
// continuing to pass against a contract that has moved. Nothing is asserted
// about a port's own module name here, because its name is not this file's
// business; its SHAPE is.
//
// The index order below IS the shipped constructor order and is asserted as such
// by the wiring test.
type ProductRepositoryPort = ConstructorParameters<typeof ProductService>[0];
type SkuRepositoryPort = ConstructorParameters<typeof ProductService>[1];
type ProductTypeRepositoryPort = ConstructorParameters<typeof ProductService>[2];
type UrlTitleGeneratorPort = ConstructorParameters<typeof ProductService>[3];
type ImageStorePort = ConstructorParameters<typeof ProductService>[4];
type SubscriptionTermProviderPort = ConstructorParameters<typeof ProductService>[5];
type SkuCreationPort = ConstructorParameters<typeof ProductService>[6];
type OptionLoadingPort = ConstructorParameters<typeof ProductService>[7];

/**
 * The payload the SKU-creation collaborator promises to carry, derived the same
 * way and for the same reason. `ProductSaveInput` is structurally identical to
 * it, which is why no conversion, copy or cast appears anywhere below.
 */
type SkuCreationPayloadShape = Parameters<SkuCreationPort['createSkus']>[1];

// ---------------------------------------------------------------------------
// Deterministic values. Every one of them is obviously synthetic.
// ---------------------------------------------------------------------------

/**
 * Fixed instant used wherever an audit column must be populated.
 *
 * `tests/setup.ts` forces the process time zone to UTC and verifies it took
 * effect, so a UTC ISO-8601 literal is unambiguous here. Every date in this
 * file is
 * written in that form deliberately - no local-time literal, no `Date.now()`,
 * no clock read of any kind - because a suite that pins behaviour must not be
 * able to change its own answer between two runs.
 */
const FIXED_AUDIT_INSTANT = new Date('2024-06-01T00:00:00.000Z');

/**
 * The URL title the generator double answers with.
 *
 * The `generated-` prefix makes it impossible to mistake a double's answer for a
 * real slug, and impossible for an assertion to pass because a test happened to
 * supply a value that already looked like one.
 *
 * This is NOT a port of the legacy slug algorithm and must never be read as one.
 * `model/service/DataService.cfc` owns that algorithm, and the adapter behind the
 * port reproduces it. What the service tier consumes is a string it did not
 * compute, so a stand-in string is the honest stimulus here.
 */
const GENERATED_URL_TITLE = 'generated-url-title';

/**
 * The calculated title `makeProductFixture` supplies, reproduced here as the
 * expected generator input.
 *
 * ★ It is the CALCULATED title, not a `getTitle()` result: the ported entity
 * publishes no `getTitle()` member, so the shipped `saveProduct` reads
 * `getCalculatedTitle()`. That is shipped-surface correction 3 from the header,
 * and this constant is where it becomes checkable.
 */
const FIXTURE_CALCULATED_TITLE = 'Test Product (calculated title snapshot)';

/** The URL title `makeProductFixture` defaults to, carried from `Helper.cfc`. */
const FIXTURE_URL_TITLE = 'nike-air-jorden';

/**
 * Identifier carried ONLY by the instance the persistence double answers with.
 *
 * The legacy save is where a new product acquires its generated identifier, and
 * the ported entity is immutable, so that identifier cannot be back-filled into
 * the argument. Keeping the value distinct is what lets the delegation cases
 * prove the returned product is the PERSISTED one rather than the input.
 */
const PERSISTED_PRODUCT_ID = 'persisted-product-identifier';

/** Same idea for the product-type save path. */
const PERSISTED_PRODUCT_TYPE_ID = 'persisted-product-type-identifier';

/**
 * ★ PHYSICAL TABLE NAMES, PRESERVED VERBATIM.
 *
 * Schema continuity is a project constraint: the target reads and writes the
 * existing tables unchanged, so these two literals survive the migration exactly
 * as `model/service/ProductService.cfc:L269` and
 * `model/service/ProductService.cfc:L297, L299` wrote them. They are the
 * uniqueness SCOPE handed to the URL-title port, not a query, and they are
 * asserted rather than trusted.
 */
const PRODUCT_TABLE_NAME: UrlTitleTableName = 'SwProduct';
const PRODUCT_TYPE_TABLE_NAME: UrlTitleTableName = 'SwProductType';

/**
 * ★ RESOURCE-BUNDLE KEYS, PRESERVED VERBATIM, WITH NO i18n RUNTIME.
 *
 * `model/process/Product_UpdateSkus.cfc:L56` declares
 * `hb_rbKey="entity.sku.price"` on its `price` property and
 * `model/process/Product_UpdateSkus.cfc:L58` declares
 * `hb_rbKey="entity.sku.listPrice"` on its `listPrice` property. The project
 * carries such identifiers forward as PLAIN STRING CONSTANTS so the legacy admin
 * can still resolve them, and introduces no resource-bundle runtime to resolve
 * them with.
 *
 * LEGACY-NOTE [model/process/Product_UpdateSkus.cfc:L56, L58]: the shipped
 * service preserves both identifiers as documentation on the `price` and
 * `listPrice` members of its update-SKUs input contract rather than exporting
 * them as runtime constants, because nothing in the ported slice resolves a
 * resource bundle. They are therefore pinned here, next to the two assertions
 * that make their preservation checkable: the property each one annotates
 * survives verbatim as the validation issue path, and neither identifier ever
 * appears in a message - which is precisely what "no i18n runtime" looks like
 * from the outside.
 */
const SKU_PRICE_RB_KEY = 'entity.sku.price';
const SKU_LIST_PRICE_RB_KEY = 'entity.sku.listPrice';

/**
 * The seven members `ProductRepository` declares.
 *
 * ★ SEVEN, not six - shipped-surface correction 2 from the header. Listed as a
 * literal tuple so the count and the names are both asserted rather than
 * described, and so adding a member to the port without updating this list
 * surfaces as a failure here.
 */
const PRODUCT_REPOSITORY_MEMBERS = [
  'getAttributeSets',
  'loadDataFromFile',
  'searchProductsByProductType',
  'getProductByProductID',
  'saveProduct',
  'deleteProduct',
  'saveBrand',
] as const;

/** The fifteen public method names the ported class must publish verbatim. */
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

// ---------------------------------------------------------------------------
// Inline entity builders. No fixture module is created or edited.
// ---------------------------------------------------------------------------

/** An option group paired with the single option that belongs to it. */
interface OptionGroupWithOption {
  readonly group: OptionGroup;
  readonly option: Option;
}

/**
 * Builds an option group holding NO options.
 *
 * Every field the shipped constructor declares is supplied explicitly, including
 * the ones whose value is `undefined`, because the constructor declares all
 * fourteen as required properties whose type admits `undefined`.
 *
 * The sort-order tie-breaker is a constant function rather than an omission, so
 * two options sharing a sort order can never order differently between runs.
 */
function buildEmptyOptionGroup(spec: {
  readonly optionGroupID: string;
  readonly optionGroupName: string;
  readonly sortOrder: number;
}): OptionGroup {
  return new OptionGroup({
    optionGroupID: spec.optionGroupID,
    optionGroupName: spec.optionGroupName,
    optionGroupCode: spec.optionGroupID,
    optionGroupImage: undefined,
    optionGroupDescription: undefined,
    imageGroupFlag: false,
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
 * Builds one option group holding one option, with the back-reference wired both
 * ways.
 *
 * The two-step wiring is required by the shipped entities and is not a
 * workaround: `new Option({ optionGroup })` records the group but does NOT push
 * itself into the group's collection - only `Option.setOptionGroup` does that -
 * so the option is pushed into the group's own collection afterwards.
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

/**
 * Builds a second option inside an EXISTING group, wired both ways.
 *
 * Needed by the `processProduct_addOptionGroup` cases, which must distinguish
 * "the first option of the group" from "an option of the group".
 */
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

// ---------------------------------------------------------------------------
// The in-memory doubles
// ---------------------------------------------------------------------------

/**
 * Raised by any port member this suite proves is never reached.
 *
 * A double that answered a plausible value for an unexercised member would let a
 * regression pass unnoticed; one that raises turns the same regression into a
 * named failure. That makes these members a COMPLETE implementation of a test
 * double rather than deferred work - the behaviour they implement IS "this must
 * not happen, and here is which member happened".
 */
function unreachedPortMember(portName: string, member: string): never {
  throw new Error(
    `the ${portName} double's ${member} was reached. The ported ProductService reaches exactly ` +
      'fourteen of the twenty-seven members its eight ports declare, and this is not one of ' +
      'them, so reaching it means the service under test has grown a collaboration this suite ' +
      'does not describe.',
  );
}

/** One recorded bulk-import request, exactly as it arrived. */
interface RecordedImportRequest {
  readonly fileURL: string;
  readonly textQualifier: string | undefined;
}

/**
 * One recorded product search, exactly as it arrived.
 *
 * ★ LEGACY-NOTE [model/dao/ProductDAO.cfc:L419 versus model/dao/SkuDAO.cfc:L130]:
 * the product-side parameter is PLURAL - `productTypeIDs`, a comma-delimited list
 * - while the SKU-side equivalent `searchSkusByProductType` takes the SINGULAR
 * `productTypeID`. Both spellings are preserved exactly as the legacy DAOs
 * declared them. The field name below is the plural one on purpose, so a reader
 * who is tempted to harmonise the two ports sees that the asymmetry is
 * deliberate rather than an oversight.
 */
interface RecordedProductSearch {
  readonly term: string | undefined;
  readonly productTypeIDs: string | undefined;
}

/**
 * In-memory stand-in for the product repository port.
 *
 * Replaces the legacy `property name="productDAO";`
 * [model/service/ProductService.cfc:L52] plus the framework-inherited
 * `getHibachiDAO().save(...)` [model/service/ProductService.cfc:L287] and
 * `super.delete(...)` [model/service/ProductService.cfc:L326].
 *
 * Answers a DISTINCT product instance from `saveProduct` rather than the one it
 * was handed, because that is what the legacy save did: it returned the entity
 * the data store had seen, carrying the identifier the store assigned.
 */
class RecordingProductRepository implements ProductRepositoryPort {
  readonly imports: RecordedImportRequest[] = [];
  readonly searches: RecordedProductSearch[] = [];
  readonly saves: Product[] = [];
  readonly deletes: Product[] = [];

  /** Programmable search answer. Set by a test before the call it drives. */
  searchResult: Product[] = [];

  /** Programmable delete outcome, so both the true and false paths are reachable. */
  deleteOutcome = true;

  constructor(private readonly persistedProduct: Product) {}

  loadDataFromFile(fileURL: string, textQualifier?: string): Promise<void> {
    this.imports.push({ fileURL, textQualifier });

    return Promise.resolve();
  }

  searchProductsByProductType(term?: string, productTypeIDs?: string): Promise<Product[]> {
    this.searches.push({ term, productTypeIDs });

    return Promise.resolve(this.searchResult);
  }

  saveProduct(product: Product): Promise<Product> {
    this.saves.push(product);

    return Promise.resolve(this.persistedProduct);
  }

  deleteProduct(product: Product): Promise<boolean> {
    this.deletes.push(product);

    return Promise.resolve(this.deleteOutcome);
  }

  readonly getAttributeSets: ProductRepositoryPort['getAttributeSets'] = () =>
    unreachedPortMember('product repository', 'getAttributeSets');

  readonly getProductByProductID: ProductRepositoryPort['getProductByProductID'] = () =>
    unreachedPortMember('product repository', 'getProductByProductID');

  readonly saveBrand: ProductRepositoryPort['saveBrand'] = () =>
    unreachedPortMember('product repository', 'saveBrand');
}

/** One recorded selected-options lookup, exactly as it arrived. */
interface RecordedSelectedOptionsLookup {
  readonly selectedOptions: string;
  readonly productID: string | undefined;
}

/** One recorded transaction-existence probe, exactly as it arrived. */
interface RecordedTransactionProbe {
  readonly productID: string | undefined;
  readonly skuID: string | undefined;
}

/**
 * In-memory stand-in for the SKU repository port.
 *
 * Replaces the legacy `property name="skuDAO";`
 * [model/service/ProductService.cfc:L53].
 *
 * `getSkusBySelectedOptions` answers the seeded array BY REFERENCE, deliberately:
 * must-preserve area (iii) is pure delegation, and answering the very same
 * instance is what lets the assertion prove the service adds no copy, no filter
 * and no re-sort of its own.
 */
class RecordingSkuRepository implements SkuRepositoryPort {
  readonly selectedOptionsLookups: RecordedSelectedOptionsLookup[] = [];
  readonly transactionProbes: RecordedTransactionProbe[] = [];

  /** Programmable answer for the selected-options path. */
  selectedOptionsResult: Sku[] = [];

  /** Programmable answer for the delete-guard probe. */
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

  readonly saveSku: SkuRepositoryPort['saveSku'] = () =>
    unreachedPortMember('SKU repository', 'saveSku');
}

/**
 * In-memory stand-in for the product-type repository port.
 *
 * ★ LEGACY-NOTE [model/service/ProductService.cfc:L54]: the legacy component
 * declares `property name="productTypeDAO";` and NEVER USES IT - it is one of two
 * DEAD injections in the file. The ported class does take a product-type
 * repository, but only because `super.save(productType, data)`
 * [model/service/ProductService.cfc:L303] needed somewhere to go once the
 * framework base component stopped supplying it. Eight properties were declared;
 * six were real.
 *
 * ECHOES its argument by default so a test can observe what the service does to
 * the RETURNED instance, and answers `answer` when a test needs to prove the
 * returned value is the persisted one rather than the input.
 */
class RecordingProductTypeRepository implements ProductTypeRepositoryPort {
  readonly saves: ProductType[] = [];

  /** When set, answered in place of the argument. Double configuration, not a data fallback. */
  answer: ProductType | undefined = undefined;

  saveProductType(productType: ProductType): Promise<ProductType> {
    this.saves.push(productType);

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

/** One recorded URL-title generation request, exactly as it arrived. */
interface RecordedUrlTitleRequest {
  readonly titleString: string;
  readonly tableName: UrlTitleTableName;
}

/**
 * In-memory stand-in for the URL-title generator port.
 *
 * Replaces the legacy `property name="dataService";`
 * [model/service/ProductService.cfc:L55], narrowed by the port to the single
 * method this component ever consumed.
 *
 * Records both arguments of every call in arrival order, so a test can assert HOW
 * MANY times generation fired, WHICH title source won, and WHICH physical table
 * the uniqueness scope named - the three facts the legacy branch structure
 * decides.
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
 * The image service is one of the two collaborators the project ports as a stub,
 * because only out-of-scope branches consume it. Recording the composed path is
 * the whole of what this double does: NO FILE IS OPENED, CREATED, MOVED OR
 * DELETED by any line of this suite, and no path below names a real directory.
 */
class RecordingImageStore implements ImageStorePort {
  readonly deletedPaths: string[] = [];

  deleteImageFile(filePath: string): Promise<void> {
    this.deletedPaths.push(filePath);

    return Promise.resolve();
  }

  readonly saveImageFile: ImageStorePort['saveImageFile'] = () =>
    unreachedPortMember('image store', 'saveImageFile');
}

/**
 * In-memory stand-in for the subscription-term STUB port.
 *
 * The second of the project's two stub ports. Answers `undefined` for the term
 * lookup, which is exactly what a stub for an out-of-scope subsystem should do -
 * and is enough for the one legacy statement in
 * `processProduct_addSubscriptionTerm` that HAS a ported counterpart to be
 * observed reaching it before the out-of-scope failure surfaces.
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

/** One recorded SKU-creation request, exactly as it arrived. */
interface RecordedSkuCreation {
  readonly product: Product;
  readonly data: SkuCreationPayloadShape;
}

/**
 * In-memory stand-in for the SKU-creation collaborator.
 *
 * Replaces the legacy `property name="skuService";`
 * [model/service/ProductService.cfc:L58] narrowed to the one method this
 * component calls - `createSkus` - at [model/service/ProductService.cfc:L150] and
 * [model/service/ProductService.cfc:L279].
 *
 * Records the payload BY REFERENCE, so the payload recorded is the very object
 * the service assembled and wrote into. That is what lets a single identity check
 * prove both the resolved value and CFML's pass-by-reference semantics.
 *
 * The outcome is programmable so the DISCARDED RETURN VALUE at
 * [model/service/ProductService.cfc:L150] can be pinned: a `false` answer must
 * change nothing a caller observes.
 */
class RecordingSkuCreation implements SkuCreationPort {
  readonly requests: RecordedSkuCreation[] = [];

  /** Programmable outcome, so the discarded-return case is reachable. */
  outcome = true;

  createSkus(product: Product, data: SkuCreationPayloadShape): Promise<boolean> {
    this.requests.push({ product, data });

    return Promise.resolve(this.outcome);
  }
}

/**
 * In-memory stand-in for the option-loading collaborator.
 *
 * Replaces the legacy `property name="optionService";`
 * [model/service/ProductService.cfc:L60] plus the framework's generic
 * `get<Entity>(primaryKey)` affordance that
 * [model/service/ProductService.cfc:L115] and
 * [model/service/ProductService.cfc:L130] leaned on - an affordance
 * `OptionService.cfc` never declared.
 *
 * ! `getOptionsForSelect` IS SYNCHRONOUS here because it is synchronous on the
 * shipped port. Its projection is a DETERMINISTIC STAND-IN and is NOT a port of
 * `model/service/OptionService.cfc:L55-L65`: that component's own select-option
 * shaping - including its handling of a missing name - is asserted by the
 * sibling-owned `optionService.test.ts`. What the product service consumes is a
 * list it did not compute, so a stand-in projection is the honest stimulus.
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

// ---------------------------------------------------------------------------
// Validation-failure capture
// ---------------------------------------------------------------------------

/**
 * One declarative-validation issue, flattened to primitives.
 *
 * Assertions are made on the STRUCTURED issue rather than on a stringified error
 * blob, because two of the six mandatory cases must be provably DISTINCT
 * failures: a missing `price` and a non-numeric `price` both reject, and a
 * message-substring check against a formatted error would not establish that
 * they reject for different reasons.
 */
interface CapturedIssue {
  readonly code: string;
  readonly message: string;
  readonly path: readonly string[];
}

/**
 * Runs an operation that MUST reject with the declarative validation error and
 * answers its issues.
 *
 * Both failure modes of the helper itself raise with a named explanation, so a
 * test can never pass because the call unexpectedly resolved or because it failed
 * for some unrelated reason.
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
 * `entity.sku.listPrice` annotates the `listPrice` property, so the terminal
 * segment IS the property name. The final coalesce cannot be observed - `split`
 * always yields at least one element - and exists only because
 * `noUncheckedIndexedAccess` types the indexed read as possibly absent, and a
 * non-null assertion is not used anywhere in this file.
 */
function rbKeyPropertyIdentifier(rbKey: string): string {
  const segments = rbKey.split('.');
  const terminal = segments[segments.length - 1];

  return terminal ?? rbKey;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ProductService', () => {
  let productRepository: RecordingProductRepository;
  let skuRepository: RecordingSkuRepository;
  let productTypeRepository: RecordingProductTypeRepository;
  let urlTitleGenerator: RecordingUrlTitleGenerator;
  let imageStore: RecordingImageStore;
  let subscriptionTermProvider: RecordingSubscriptionTermProvider;
  let skuCreation: RecordingSkuCreation;
  let optionLoading: RecordingOptionLoading;
  let persistedProduct: Product;
  let service: ProductService;

  beforeEach(() => {
    // The instance the persistence double answers with. It carries an identifier
    // and a title that only a saved row has, so no case can conflate it with the
    // product it was handed.
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

    // JUDGMENT CALL - TRANSFORMATION RULE T1, AND THE WHOLE WIRING STORY.
    //
    // The legacy component declares its collaborators as bare properties at
    // [model/service/ProductService.cfc:L52-L60] and reaches them through DI/1
    // convention accessors - `getProductDAO()`, `getSkuDAO()`, `getDataService()`,
    // `getSkuService()`, `getOptionService()`. DI/1 resolved those by SCANNING
    // component properties at run time, behind a first-scan lock. The ported class
    // takes every collaborator as an explicit, compile-checked constructor
    // argument instead, which is transformation rule T1 and which is why
    // constructing the subject here needs nothing but eight plain objects.
    //
    // That is also why this file imports NO container, NO composition root and NO
    // service locator, and why nothing below reads ambient state. Every edge the
    // service has is visible on this one line.
    service = new ProductService(
      productRepository,
      skuRepository,
      productTypeRepository,
      urlTitleGenerator,
      imageStore,
      subscriptionTermProvider,
      skuCreation,
      optionLoading,
    );
  });

  afterEach(() => {
    // Two cases install a spy to observe the internal dispatch to
    // `processProduct_updateDefaultImageFileNames` while keeping the real
    // implementation in place. `tests/setup.ts` already registers a global
    // restore, and the runner is configured to restore mocks between tests; this
    // suite-local restore is stated explicitly anyway, so the obligation is
    // discharged where the spy is created rather than assumed from configuration
    // written elsewhere.
    vi.restoreAllMocks();
  });

  describe('published surface and constructor wiring', () => {
    it('publishes all fifteen legacy method names verbatim and no framework surface', () => {
      const publishedMembers = Object.getOwnPropertyNames(ProductService.prototype);

      // CFML parity [model/service/ProductService.cfc:L65-L358]: every name is
      // carried over in legacy CFML camelCase, including the underscore-separated
      // process-method convention, because method-level interface parity is this
      // migration's acceptance contract. Not `addOptionGroup`, not
      // `updateSkuPrices`, not a TypeScript-idiomatic rename.
      for (const methodName of LEGACY_METHOD_NAMES) {
        expect(publishedMembers).toContain(methodName);
      }

      expect(LEGACY_METHOD_NAMES).toHaveLength(15);

      // The framework base component supplied a great deal more, and NONE of it
      // is ported, so its absence is faithful rather than incomplete. An exact
      // whole-list assertion is deliberately not used: it would also fail for a
      // private helper, which is an implementation detail this contract does not
      // speak to.
      expect(publishedMembers).not.toContain('getProduct');
      expect(publishedMembers).not.toContain('newProduct');
      expect(publishedMembers).not.toContain('getProductType');
      expect(publishedMembers).not.toContain('newProductType');
      expect(publishedMembers).not.toContain('save');
      expect(publishedMembers).not.toContain('delete');

      // ★ THE GENERIC CONVENTION DISPATCHER IS GONE. The legacy calls
      // `this.processProduct(product, {}, 'updateDefaultImageFileNames')` at
      // [model/service/ProductService.cfc:L123], [L152], [L193] and [L282] - a
      // framework affordance that resolved `processProduct_<context>` from a
      // STRING at run time. The port replaces all four with direct static calls,
      // so there is no dispatcher, no lookup map and no string-keyed method
      // table to publish.
      expect(publishedMembers).not.toContain('processProduct');

      // ★ SIGNATURE RESHAPING #2. The two smart-list accessors are gone by name:
      // `getProductSmartList` became `findProducts`, and its twin
      // `getSkuSmartList` became `findSkus` on the sibling service. Both names
      // are asserted absent so the reshaping is visible here rather than only in
      // the annotation at the `findProducts` cases below.
      expect(publishedMembers).not.toContain('getProductSmartList');
      expect(publishedMembers).not.toContain('getSkuSmartList');

      // LEGACY-NOTE [model/service/ProductService.cfc:L82-L97]: the private
      // recursive helper `buildSkuCombinations` is DEAD in the legacy component -
      // no line in the file calls it, and no other component can, because it is
      // private. The port keeps it as a NON-EXPORTED module-local function, so it
      // is absent from the published surface. Nothing else in this suite asserts
      // anything about it: it is unreachable through the public contract, and
      // reaching into a module-local function to test it would assert an
      // implementation detail rather than a behaviour.
      expect(publishedMembers).not.toContain('buildSkuCombinations');
    });

    it('takes exactly eight constructor collaborators, every one of them explicit', () => {
      // ★ SHIPPED-SURFACE CORRECTION 1. EIGHT, not nine. There is no option
      // repository edge: the module imports the `SelectOption` TYPE from that port
      // file, and a shared type is not an injected edge.
      //
      // LEGACY-NOTE [model/service/ProductService.cfc:L52-L60]: the legacy
      // component declares EIGHT properties - productDAO, skuDAO, productTypeDAO,
      // dataService, contentService, skuService, subscriptionService,
      // optionService - of which TWO ARE DEAD. `productTypeDAO` [L54] is never
      // read, and `contentService` [L57] is never read either; the category access
      // path that `model/entity/Category.cfc` resolves to through
      // `hb_serviceName="contentService"` is not reached from this component at
      // all. Eight declared, six real - and the ported constructor's eight
      // parameters are a different eight, because two legacy properties fell away
      // and two collaborations that used to arrive invisibly by inheritance
      // (entity save/delete, and the framework's generic entity loader) became
      // explicit.
      expect(ProductService.length).toBe(8);
    });

    it('declares a product repository port of exactly seven members', () => {
      // ★ SHIPPED-SURFACE CORRECTION 2. SEVEN members, not six. The list is a
      // literal tuple so both the count and the names are asserted rather than
      // described, and so adding a member to the port without updating this list
      // fails here.
      expect(PRODUCT_REPOSITORY_MEMBERS).toHaveLength(7);

      for (const member of PRODUCT_REPOSITORY_MEMBERS) {
        expect(member in productRepository).toBe(true);
      }

      // Of those seven, this service reaches FOUR. The other three raise if
      // reached, which the tests below rely on rather than restate.
      expect('getAttributeSets' in productRepository).toBe(true);
      expect('saveBrand' in productRepository).toBe(true);
    });

    it('needs nothing but its eight collaborators to answer a call', async () => {
      // The strongest available statement that wiring is complete and explicit:
      // a subject constructed from eight plain objects, with no container
      // initialised, no configuration read and no environment variable consulted,
      // answers a real call. This is what replaces the DI/1 convention scan.
      await service.loadDataFromFile('file://products.csv');

      expect(productRepository.imports).toStrictEqual([
        { fileURL: 'file://products.csv', textQualifier: '' },
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // ★ MUST-PRESERVE AREA (iii)
  // -------------------------------------------------------------------------
  describe('getProductSkusBySelectedOptions - must-preserve area (iii)', () => {
    // The option identifiers `tests/fixtures/skuFixtures.ts` builds its
    // AND-of-EXISTS graph from. Named here so the comma-list assertions below
    // read as identifiers rather than as opaque strings.
    const OPTION_ONE = 'skfx-option-1';
    const OPTION_TWO = 'skfx-option-2';

    // JUDGMENT CALL: the legacy body [model/service/ProductService.cfc:L104-L106]
    // is PURE DELEGATION - `return getSkuDAO().getSkusBySelectedOptions(
    // argumentCollection=arguments )`, one statement, no branch, no
    // transformation - so the unit tier asserts DELEGATION AND RESULTS ONLY. The
    // AND-of-EXISTS matching semantics of `model/dao/SkuDAO.cfc:L107-L128` - the
    // `0 = 0` tautology, one correlated `EXISTS` subquery per selected option, and
    // the optional `sku.product.id` filter - are the actual must-preserve
    // behaviour, and they are asserted in the sibling-owned
    // `tests/integration/repositories/` suite, not here. Re-implementing that
    // matching inside a double would produce a suite that agreed with itself
    // while proving nothing about the statement that runs in production.
    it('forwards a multi-identifier comma list byte for byte and answers the port result', async () => {
      // A realistic seeded result rather than a synthetic one: under the legacy
      // AND-of-EXISTS semantics a two-option selection matches every SKU whose
      // option set CONTAINS both, so member A ({O1,O2}) and member C
      // ({O1,O2,O3}) are the honest answer for this selection. The double does
      // not compute that - it is seeded with it - which is exactly the point.
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

      // CFML parity [model/service/ProductService.cfc:L104]: `selectedOptions`
      // stays a COMMA-DELIMITED STRING across the boundary, for signature parity.
      // It is not split, trimmed, re-ordered, de-duplicated or converted to an
      // array by the service, so the exact bytes the caller supplied are what the
      // repository sees.
      expect(skuRepository.selectedOptionsLookups).toStrictEqual([
        { selectedOptions: 'skfx-option-1,skfx-option-2', productID: 'product-under-selection' },
      ]);

      // Exactly once. A second lookup would mean the port was consulted twice for
      // one question, which the single-statement legacy body cannot do.
      expect(skuRepository.selectedOptionsLookups).toHaveLength(1);

      // The port's own collection is answered BY IDENTITY: no copy, no re-sort,
      // no filter, no wrapper. That is what "pure delegation" means at the
      // boundary, and identity is the only assertion that proves it.
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
      // The legacy body has no length guard: an empty `selectedOptions` reaches
      // the DAO, where `model/dao/SkuDAO.cfc:L110` opens with the `0 = 0`
      // tautology and appends no `EXISTS` clause, so every SKU of the product
      // matches. Seeding member D - the graph's no-option SKU - alongside A keeps
      // the answer realistic for a selection that constrains nothing.
      const everySku = [
        makeSkuFixture({ skuID: 'sku-and-of-exists-a', andOfExistsMember: 'A' }),
        makeSkuFixture({ skuID: 'sku-and-of-exists-d', andOfExistsMember: 'D' }),
      ];

      skuRepository.selectedOptionsResult = everySku;

      const answered = await service.getProductSkusBySelectedOptions('', 'product-empty-selection');

      // The empty string is FORWARDED, not replaced by a default, not turned into
      // an empty array, and not used as a reason to skip the call.
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

      // No match is a legitimate answer and must stay one. Nothing is substituted,
      // no error is raised, and no second lookup is attempted with a relaxed
      // selection.
      expect(answered).toStrictEqual([]);
      expect(skuRepository.selectedOptionsLookups).toHaveLength(1);
    });

    it('reaches the selected-options lookup and no other repository member', async () => {
      skuRepository.selectedOptionsResult = [];

      await service.getProductSkusBySelectedOptions(OPTION_ONE, 'product-isolation-check');

      // Every unexercised member of every port raises when reached, so the call
      // completing at all already proves the service touched nothing else. These
      // assertions state the same fact positively, for the four recorders that
      // could have shown a stray call.
      expect(skuRepository.transactionProbes).toStrictEqual([]);
      expect(productRepository.searches).toStrictEqual([]);
      expect(skuCreation.requests).toStrictEqual([]);
      expect(urlTitleGenerator.requests).toStrictEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // ★ THE ONE SYNCHRONOUS METHOD
  // -------------------------------------------------------------------------
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

      // ! INVOKED WITHOUT `await`, and the test is NOT `async`. This is the ONE
      // synchronous method on the class, because the legacy body
      // [model/service/ProductService.cfc:L70-L80] walks already-materialized
      // associations and reaches no DAO. Awaiting it would be an await on a
      // non-thenable, and declaring the test `async` for it would be a pointless
      // async - both of which the project's lint gate rejects. The
      // async-boundary contract is enforced BY INVOCATION here, not by comment.
      const formatted = service.getFormattedOptionGroups(product);

      // CFML parity [model/service/ProductService.cfc:L76]: the struct key is
      // `getOptionGroupName()`, and the select projection is whatever the option
      // collaborator answers for that group's options.
      expect(formatted).toStrictEqual([
        { optionGroupName: 'Size', options: [{ name: 'Large', value: 'opt-large' }] },
        { optionGroupName: 'Colour', options: [{ name: 'Red', value: 'opt-red' }] },
      ]);

      // One formatting request per group, in group order, each carrying that
      // group's own options - which is the whole of the legacy loop body.
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

      // Both options hang off ONE SKU, because the entity derives
      // `getOptionsByOptionGroup` from its SKUs' options rather than from the
      // group collection.
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

      // LEGACY-DEFECT [model/service/ProductService.cfc:L70-L80]: the result is
      // keyed by option-group name and CFML struct keys are case-insensitive, so
      // two groups whose names differ only in case collide and the last one
      // written wins.
      // Preserved deliberately; do not fix without a product decision.
      //
      // TWO groups in, ONE entry out. The surviving key keeps the FIRST casing
      // encountered - `'Size'`, because CFML updates an existing key rather than
      // re-casing it - while the VALUE is the SECOND group's options. Both halves
      // matter: a port that produced two entries would silently surface an option
      // set the legacy admin never showed, and a port that kept the first value
      // would show the wrong options under the right name.
      expect(formatted).toStrictEqual([
        { optionGroupName: 'Size', options: [{ name: 'Lower', value: 'opt-lower' }] },
      ]);
      expect(formatted).toHaveLength(1);

      // Both groups WERE visited - the collision happens at the write, not at the
      // read - which is what makes the lost entry a defect rather than a skipped
      // iteration.
      expect(optionLoading.formattedRequests).toStrictEqual([[upper.option], [lower.option]]);
    });

    it('answers an empty result for a product carrying no option groups', () => {
      // `makeProductFixture` materializes `optionGroups` as an EMPTY ARRAY rather
      // than leaving it absent, which matters: the ported entity RAISES when the
      // association was never materialized, and that distinction - "no groups"
      // versus "groups not loaded" - is the explicit replacement for Hibernate
      // lazy loading.
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

      // CFML parity [model/service/ProductService.cfc:L71, L73, L75]: the legacy
      // body declares its accumulator, its group array and its loop counter
      // WITHOUT `var`, so all three leak into the component's variables scope.
      // That is not reproducible in TypeScript and is not a defect worth
      // reproducing: the ported accumulator is FUNCTION-LOCAL, which is what makes
      // this method safe to call twice on a warm container. Both facts are pinned
      // by the two assertions below rather than described.
      const first = service.getFormattedOptionGroups(product);
      const second = service.getFormattedOptionGroups(product);

      // Same answer, twice, with no accumulation across calls - which is what a
      // leaked component-scoped accumulator would have broken.
      expect(second).toStrictEqual(first);

      // A FRESH array each time, so a caller cannot mutate a shared accumulator.
      expect(second).not.toBe(first);

      // The product's own associations are untouched by a read.
      expect(product.getOptionGroups()).toStrictEqual([size.group]);
      expect(product.getSkus()).toStrictEqual([sku]);
      expect(sku.getOptions()).toStrictEqual([size.option]);
    });
  });

  // -------------------------------------------------------------------------
  // ★★ processProduct_updateSkus AND THE DECLARATIVE VALIDATION CONTRACT
  //
  // This is the ONE legitimate declarative-schema site in `src/services/**`, and
  // the only place in this suite where the project's schema-validation dependency
  // is exercised. Two families of assertion live here and they must not be
  // conflated:
  //
  //   * THE DECLARATIVE RULES of `model/validation/Product_UpdateSkus.json`,
  //     which reject BEFORE any mutation.
  //   * THE RUNTIME BRANCHES at [model/service/ProductService.cfc:L222] and
  //     [L226], which use a DIFFERENT predicate.
  //
  // ★★ `showPrice` and `showListPrice` ARE CONDITION NAMES, NOT FIELDS. They
  // never appear as data properties, never go into an input object, and never
  // appear in an error path. The FIELDS are `price`, `listPrice`,
  // `updatePriceFlag` and `updateListPriceFlag`, and only those four.
  // -------------------------------------------------------------------------
  describe('processProduct_updateSkus - declarative rules', () => {
    /**
     * A product with NO SKUs, used for every schema-only case.
     *
     * The runtime loop is guarded by `if(arrayLen(skus))`
     * [model/service/ProductService.cfc:L219], so a SKU-less product isolates the
     * declarative layer perfectly: validation still runs, and nothing downstream
     * of it can fire. That is a property of the legacy control flow, not a trick.
     */
    function skulessProduct(): Product {
      return makeProductFixture({ productID: 'product-with-no-skus' });
    }

    // -- The six mandatory cases -------------------------------------------

    it('CASE 1 - rejects when updatePriceFlag is 1 and price is MISSING', async () => {
      const product = skulessProduct();

      // `exactOptionalPropertyTypes` is on, so "missing" is expressed by OMITTING
      // the key. `{ price: undefined }` is a DIFFERENT input - an explicitly
      // absent value - and using it here would test something the legacy process
      // object could not express.
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

      // The same instance back, per [model/service/ProductService.cfc:L232].
      expect(answered).toBe(product);
    });

    it('CASE 3 - accepts when the flag is ABSENT and price is missing, and when it is 0', async () => {
      const product = skulessProduct();

      // Flag absent entirely: the condition never fires, so `price` is not
      // required. This is the shape a process object populated from a form with
      // the checkbox unticked actually has.
      const withoutFlag: ProductUpdateSkusInput = {};

      expect(await service.processProduct_updateSkus(product, withoutFlag)).toBe(product);

      // Flag present and zero: `0 eq 1` is false, so the condition still does not
      // fire.
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

      // The point of this case is not that both reject - it is that they reject
      // for DIFFERENT REASONS, which is why the assertions are made on the
      // structured issue rather than on a formatted error string. The declarative
      // file states two independent obligations on `price`, `dataType: "numeric"`
      // and `required: true`, and a port that collapsed them into one message
      // would lose a distinction the legacy admin surfaced to a user.
      const missingMessages = missingPriceIssues.map((issue: CapturedIssue) => issue.message);
      const nonNumericMessages = nonNumericIssues.map((issue: CapturedIssue) => issue.message);

      expect(nonNumericMessages).not.toStrictEqual(missingMessages);

      // Both, however, are reported against the SAME property, because both rules
      // are declared on `price` and neither is declared on the flag.
      expect(missingPriceIssues.map((issue: CapturedIssue) => issue.path)).toStrictEqual([
        ['price'],
      ]);
      expect(nonNumericIssues.map((issue: CapturedIssue) => issue.path)).toStrictEqual([['price']]);
    });

    // -- The four activation cases -----------------------------------------

    it('ACTIVATION - numeric 1 fires the condition', async () => {
      // CFML parity [model/validation/Product_UpdateSkus.json]: the condition
      // compares `eq 1`, and CFML equality is LOOSE, so the activation set is
      // wider than a strict `===` would admit - numeric 1 and the string '1' both
      // activate it, and so does boolean `true`, because CFML converts a boolean
      // to 1 in a numeric comparison. The string 'true' does not, because it is
      // not a number. The schema reproduces exactly this activation set.
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
      // ★ SHIPPED-SURFACE CORRECTION 4, and this is the assertion that pins it.
      // The shipped condition helper answers a boolean flag directly, so `true`
      // activates. That is CORRECT CFML rather than a liberty: in `true EQ 1` the
      // boolean converts to the number 1, and the comparison holds. A port that
      // refused boolean `true` here would silently stop requiring a price for
      // every caller that populated the flag from a checkbox binding.
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

      // Not a number, so `'true' eq 1` is false and the rule never applies. The
      // call resolves with `price` absent, which is the whole assertion.
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

      // The identifiers survive byte for byte from
      // [model/process/Product_UpdateSkus.cfc:L56] and [L58].
      expect(SKU_PRICE_RB_KEY).toBe('entity.sku.price');
      expect(SKU_LIST_PRICE_RB_KEY).toBe('entity.sku.listPrice');

      // ★ AND THEY STILL ANNOTATE THE SAME PROPERTIES. The terminal segment of
      // each key IS the property identifier it was declared on, and that property
      // is exactly what the validation failure is reported against. This is the
      // assertion that makes "preserved verbatim" mean something: the key and the
      // field it labels have not drifted apart.
      expect(priceIssues.map((issue: CapturedIssue) => issue.path)).toStrictEqual([
        [rbKeyPropertyIdentifier(SKU_PRICE_RB_KEY)],
      ]);
      expect(listPriceIssues.map((issue: CapturedIssue) => issue.path)).toStrictEqual([
        [rbKeyPropertyIdentifier(SKU_LIST_PRICE_RB_KEY)],
      ]);

      // ★ NO i18n RUNTIME. Neither identifier appears in any message: the port
      // carries the keys forward as data for the legacy admin to resolve and
      // introduces no resource-bundle machinery of its own, so the messages are
      // plain text rather than lookup keys. A port that had introduced an i18n
      // runtime would emit one of these strings here.
      for (const issue of [...priceIssues, ...listPriceIssues]) {
        expect(issue.message).not.toContain(SKU_PRICE_RB_KEY);
        expect(issue.message).not.toContain(SKU_LIST_PRICE_RB_KEY);
        expect(issue.message).not.toContain('entity.sku.');
      }
    });
  });

  // -------------------------------------------------------------------------
  // ★★ processProduct_updateSkus - THE RUNTIME BRANCHES, AND THE ASYMMETRY
  // -------------------------------------------------------------------------
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

      // ★ CFML parity [model/service/ProductService.cfc:L222, L226]: the two
      // branches are SEQUENTIAL AND UNGUARDED, so the second flag is tested even
      // when the first did all the work. `model/process/Product_UpdateSkus.cfc`
      // declares `updateListPriceFlag` at [L57] with no default, so an unpopulated
      // process object carries null there, and CFML's `if(null)` is a CONVERSION
      // ERROR rather than a falsy branch. A caller that supplies only the price
      // half therefore FAILS, in CFML and here alike.
      //
      // This is the single most surprising preserved behaviour in the method, and
      // it is asserted first because every other runtime case has to satisfy it:
      // once a product has SKUs, BOTH flags must arrive non-null even when only
      // one of them is meant to act.
      const rejected = service.processProduct_updateSkus(product, {
        updatePriceFlag: 1,
        price: '7.25',
      });

      await expect(rejected).rejects.toBeInstanceOf(CfmlBooleanConversionError);

      // And the failure is genuinely mid-flight rather than pre-emptive: the price
      // half of the FIRST SKU was already applied before the list-price branch of
      // that same iteration raised. With no ambient transaction to roll back, that
      // partial application is exactly the transactional-integrity concern the
      // port documents, and it is pinned here rather than glossed.
      expect(first.getPrice().toFixed2()).toBe('7.25');
    });

    it('applies the price to EVERY SKU on the product', async () => {
      const { product, first, second } = productWithTwoSkus();

      // `updateListPriceFlag` is supplied as an explicit 0 rather than omitted,
      // because omitting it raises - see the preceding case. Zero is falsy under
      // CFML truthiness, so the list-price branch is skipped rather than failing.
      const answered = await service.processProduct_updateSkus(product, {
        updatePriceFlag: 1,
        price: '7.25',
        updateListPriceFlag: 0,
      });

      // CFML parity [model/service/ProductService.cfc:L218-L231]: one loop over
      // the LIVE association array, applying the same value to every member. The
      // legacy counter at [L220] is declared without `var`; that leak is not
      // reproducible in TypeScript and is not reproduced, and the loop's observable
      // effect - every SKU, not just the first - is what is pinned instead.
      //
      // Every monetary expectation here is a decimal STRING compared through the
      // money value object. No JavaScript number is arithmetically involved on
      // either side of the assertion.
      expect(first.getPrice().equals(Money.fromDecimalString('7.25'))).toBe(true);
      expect(second.getPrice().equals(Money.fromDecimalString('7.25'))).toBe(true);
      expect(first.getPrice().toFixed2()).toBe('7.25');

      // The list price is gated INDEPENDENTLY, so an unflagged list price is left
      // exactly as the fixture set it. The two declarative conditions do not
      // interact and neither do the two branches.
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

    it('performs NO SAVE of its own', async () => {
      const { product, first } = productWithTwoSkus();

      await service.processProduct_updateSkus(product, {
        updatePriceFlag: 1,
        price: '4.00',
        updateListPriceFlag: 0,
      });

      // LEGACY-NOTE [model/service/ProductService.cfc:L216-L233]: NO SAVE HAPPENS
      // IN THIS METHOD. It mutates the SKUs and answers the product, leaving
      // persistence entirely to the caller - which in CFML meant the ORM flushing
      // the session at the end of the request. There is no ORM here and no session
      // to flush, so a caller that does not subsequently save the SKUs through the
      // repository will observe nothing. That is preserved rather than corrected:
      // adding a save would change the method's contract. It is also why the
      // absence of a save is asserted rather than merely commented - the SKU
      // repository's `saveSku` member RAISES if reached, so this test completing at
      // all is the second half of the proof.
      expect(productRepository.saves).toStrictEqual([]);

      // The in-memory mutation did happen; only its persistence is the caller's
      // problem.
      expect(first.getPrice().toFixed2()).toBe('4.00');
    });

    it('rejects BEFORE mutating anything when the declarative rule fails', async () => {
      const { product, first } = productWithTwoSkus();

      const issues = await captureZodIssues(() =>
        service.processProduct_updateSkus(product, { updatePriceFlag: 1 }),
      );

      expect(issues).toHaveLength(1);

      // Validation runs first, which is the order the legacy framework used when it
      // populated and validated a process object. A port that validated after
      // mutating would leave the first SKU changed and the rest untouched.
      expect(first.getPrice().toFixed2()).toBe('19.99');
      expect(first.getListPrice().toFixed2()).toBe('24.99');
    });

    // -- The runtime-versus-validation asymmetry, in BOTH directions -------

    it('ASYMMETRY - a flag of 2 is NOT required to carry a price, yet the runtime APPLIES one', async () => {
      // LEGACY-DEFECT [model/service/ProductService.cfc:L222,L226]: the runtime
      // branches test the flags with bare CFML truthiness while
      // model/validation/Product_UpdateSkus.json compares `eq 1`. The two
      // predicates disagree for some inputs; both are reproduced rather than
      // harmonised.
      // Preserved deliberately; do not fix without a product decision.
      //
      // DIRECTION ONE, STATED PRECISELY. A flag of 2 is TRUTHY but not equal to 1,
      // so the declarative layer treats `price` as optional while the runtime layer
      // consumes it. Both halves are asserted, because either alone would look like
      // ordinary behaviour.
      //
      // Half one: with no SKU to iterate, the schema accepts a flag of 2 carrying
      // NO price at all - proof that the condition did not fire.
      const validationOnly = makeProductFixture({ productID: 'product-with-no-skus' });

      expect(await service.processProduct_updateSkus(validationOnly, { updatePriceFlag: 2 })).toBe(
        validationOnly,
      );

      // Half two: with a SKU, that same unfired condition is followed by a branch
      // that DOES fire, and the price it was never required to supply is applied.
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

      // DIRECTION TWO. The declarative layer permitted this input - proven by the
      // SKU-less case above - and the runtime branch then demanded the very value
      // validation had made optional. The failure names both files, so the two
      // disagreeing predicates are identifiable from the message alone.
      await expect(rejected).rejects.toThrow(/model\/service\/ProductService\.cfc:L222/);
      await expect(rejected).rejects.toThrow(/model\/validation\/Product_UpdateSkus\.json/);

      // And it is emphatically NOT the declarative error. Conflating the two would
      // hide the asymmetry, which is why this suite's capture helper refuses a
      // non-schema failure rather than reporting it as a validation issue.
      await expect(rejected).rejects.not.toBeInstanceOf(ZodError);

      // Nothing was applied, because the branch fails before the setter.
      expect(first.getPrice().toFixed2()).toBe('19.99');
    });

    it("ASYMMETRY - the string 'true' is truthy at run time yet never satisfies eq 1", async () => {
      const { product } = productWithTwoSkus();

      // The second of the two values the project names as disagreeing. `'true'` is
      // truthy under CFML's boolean conversion but is not a number, so it cannot be
      // equal to 1. Validation therefore permits a missing list price and the
      // branch then requires one - the same predicate disagreement as a flag of 2,
      // reached through the other half of the truthiness table, and reached on the
      // LIST-PRICE branch this time so both branches are shown to carry it.
      //
      // The price flag is an explicit 0 so the first branch is skipped rather than
      // raising, which is what lets the assertion land on [L226] specifically.
      await expect(
        service.processProduct_updateSkus(product, {
          updatePriceFlag: 0,
          updateListPriceFlag: 'true',
        }),
      ).rejects.toThrow(/model\/service\/ProductService\.cfc:L226/);
    });

    it('ASYMMETRY - an ABSENT flag passes validation and raises the CFML conversion error', async () => {
      const { product, first } = productWithTwoSkus();

      // CFML parity [model/service/ProductService.cfc:L222]: `if(null)` is a
      // CONVERSION ERROR in CFML, not a falsy branch, so a process object that
      // never carried the flag fails at the test rather than skipping it. The
      // declarative rules permit the omission - `updatePriceFlag` is optional
      // there - so this is the third distinct way the two layers disagree, and it
      // surfaces as its own named error type rather than as a generic failure.
      const rejected = service.processProduct_updateSkus(product, {});

      await expect(rejected).rejects.toBeInstanceOf(CfmlBooleanConversionError);

      expect(first.getPrice().toFixed2()).toBe('19.99');

      // The very same input on a SKU-LESS product resolves, which localises the
      // failure to the branch rather than to the schema.
      const skuless = makeProductFixture({ productID: 'product-with-no-skus' });

      expect(await service.processProduct_updateSkus(skuless, {})).toBe(skuless);
    });
  });

  // -------------------------------------------------------------------------
  // ★★ DELIBERATELY EXCLUDED LEGACY COVERAGE - BOTH TESTS NAMED
  //
  // LEGACY-NOTE [meta/tests/unit/IssuesTest.cfc:L73-L89, L91-L99]: issue_1296
  // guards its single assertion behind a record-count condition, so it passes
  // vacuously on an empty database, and issue_1329 contains no assertion at all.
  // Both exercise getProductSmartList, the method this port reshapes into
  // findProducts. Neither is carried forward and neither is counted as
  // legacy-extended coverage; their conditional and no-assertion shapes are
  // deliberately excluded.
  //
  // The specifics, so the exclusion is auditable rather than asserted:
  //
  //   * `issue_1296()` [meta/tests/unit/IssuesTest.cfc:L73-L89] obtains a product
  //     smart list, then wraps its ONLY assertion - that two products have
  //     different identifiers, at [L87] - inside `if(smartList.getRecordsCount()
  //     >= 2)` at [L78]. On a database with fewer than two products the body never
  //     runs and the test reports success having asserted NOTHING.
  //   * `issue_1329()` [meta/tests/unit/IssuesTest.cfc:L91-L99] obtains a product
  //     smart list, calls `addRange('calculatedQATS','XXX^')` and
  //     `getPageRecords()`, and contains ZERO assertions. It can only fail by
  //     raising.
  //
  // Neither shape is reproduced anywhere in this file: EVERY test here asserts
  // unconditionally, and no test relies on absence-of-exception as its only
  // verdict. The two cases below deliberately occupy the exact territory those two
  // legacy tests left uncovered - a result set with FEWER THAN TWO records, and a
  // result set with NONE - and assert unconditionally in both.
  //
  // The `issue_<ticket#>` naming convention that `meta/tests/unit/IssuesTest.cfc`
  // established IS carried forward by the project, but only for `issue_1766` in
  // the promotion suite, where a preserved no-op branch genuinely needs a named
  // regression test. Naming either of these two after its ticket would imply the
  // legacy assertion survived, and it did not.
  // -------------------------------------------------------------------------
  describe('findProducts - the territory the two excluded legacy tests left uncovered', () => {
    it('asserts UNCONDITIONALLY on a result set of fewer than two records', async () => {
      const onlyProduct = makeProductFixture({ productID: 'product-alpha' });

      productRepository.searchResult = [onlyProduct];

      const page = await service.findProducts({});

      // This is precisely the state in which `issue_1296` asserted nothing. Here
      // the single record, the count and the page window are all asserted with no
      // guard in front of them, so an empty or single-record answer FAILS this test
      // instead of passing it silently.
      expect(page.records).toStrictEqual([onlyProduct]);
      expect(page.recordsCount).toBe(1);
      expect(page.pageRecordsStart).toBe(0);
    });

    it('asserts UNCONDITIONALLY on an EMPTY result set, page shape included', async () => {
      productRepository.searchResult = [];

      const page = await service.findProducts({});

      // And this is the state in which `issue_1329` asserted nothing whatsoever. An
      // empty answer is still a fully-formed page: the entity name, the join set
      // and the keyword set are all present, because they describe the QUERY rather
      // than its result.
      expect(page.records).toStrictEqual([]);
      expect(page.recordsCount).toBe(0);
      expect(page.entityName).toBe('SlatwallProduct');
      expect(page.joins).toHaveLength(3);
      expect(page.keywordProperties).toHaveLength(5);
    });
  });

  // -------------------------------------------------------------------------
  // ★ findProducts - SIGNATURE RESHAPING #2
  // -------------------------------------------------------------------------
  describe('findProducts - signature reshaping #2', () => {
    // JUDGMENT CALL: legacy getProductSmartList (model/service/ProductService.cfc:L342-L358) built a
    // HibachiSmartList - a generic, string-keyed dynamic query builder supplied by the framework.
    // Porting it faithfully would reimplement a small ORM query language, reintroducing exactly the
    // framework coupling this refactor removes, and it would be untypeable under the strict profile.
    // The target exposes a typed findProducts instead. This is signature reshaping #2 of the
    // project's three, shared with skuService.findSkus. Only the concrete legacy filters survive;
    // the open-ended dynamic filtering surface is deliberately not reproduced.
    it('takes a TYPED criteria object and answers a TYPED page', async () => {
      const alpha = makeProductFixture({ productID: 'product-alpha' });
      const beta = makeProductFixture({ productID: 'product-beta' });
      const gamma = makeProductFixture({ productID: 'product-gamma' });

      productRepository.searchResult = [alpha, beta, gamma];

      // A NAMED, TYPED criteria object - not a string-keyed filter bag, and not a
      // list of `addFilter('property','value')` calls. Every member below is
      // declared on the shipped criteria interface; there is no escape hatch for an
      // arbitrary key, which is the whole point of the reshaping.
      const criteria: ProductQueryCriteria = {
        keyword: 'nike',
        productTypeIDs: 'product-type-one,product-type-two',
        pageRecordsStart: 1,
        pageRecordsShow: 1,
        currentURL: '/listing?page=2',
      };

      const page: ProductPage = await service.findProducts(criteria);

      // ★ THE PLURAL PARAMETER SURVIVES. `model/dao/ProductDAO.cfc:L419` declares
      // `productTypeIDs`, and the SKU-side sibling declares the SINGULAR
      // `productTypeID`. Both spellings are preserved; this recorder proves the
      // product side still forwards the plural one, and the LEGACY-NOTE on the
      // recorder interface explains why they are not harmonised.
      expect(productRepository.searches).toStrictEqual([
        { term: 'nike', productTypeIDs: 'product-type-one,product-type-two' },
      ]);

      // The page window is applied to the matched set, and the COUNT is the full
      // match rather than the window - which is what a paged listing needs.
      expect(page.records).toStrictEqual([beta]);
      expect(page.recordsCount).toBe(3);
      expect(page.pageRecordsStart).toBe(1);
      expect(page.pageRecordsShow).toBe(1);

      // `currentURL` is carried on the criteria for parity with the legacy
      // signature's second argument and is NOT forwarded to the repository - a
      // query has no business knowing the URL that produced it.
      expect(productRepository.searches).toHaveLength(1);
    });

    it('preserves the three concrete legacy JOINS, including the LEFT join on brand', async () => {
      productRepository.searchResult = [];

      const page = await service.findProducts({});

      // CFML parity [model/service/ProductService.cfc:L347-L349]: three joins, in
      // declaration order, with the brand join declared `"left"` while the other
      // two are inner. That asymmetry is load-bearing rather than incidental: a
      // product need not have a brand, so an inner join there would silently drop
      // every unbranded product from the listing.
      expect(page.joins).toStrictEqual([
        { entityName: 'SlatwallProduct', propertyIdentifier: 'productType', joinType: 'inner' },
        { entityName: 'SlatwallProduct', propertyIdentifier: 'defaultSku', joinType: 'inner' },
        { entityName: 'SlatwallProduct', propertyIdentifier: 'brand', joinType: 'left' },
      ]);
    });

    it('preserves the five concrete legacy KEYWORD PROPERTIES, all at weight 1', async () => {
      productRepository.searchResult = [];

      const page = await service.findProducts({});

      // CFML parity [model/service/ProductService.cfc:L351-L355]: five keyword
      // properties in declaration order, EVERY ONE at weight 1. The legacy assigned
      // no relative weighting at all, and inventing one here would change which
      // product a search ranked first.
      expect(page.keywordProperties).toStrictEqual([
        { propertyIdentifier: 'calculatedTitle', weight: 1 },
        { propertyIdentifier: 'brand.brandName', weight: 1 },
        { propertyIdentifier: 'productName', weight: 1 },
        { propertyIdentifier: 'productCode', weight: 1 },
        { propertyIdentifier: 'productType.productTypeName', weight: 1 },
      ]);

      for (const keywordProperty of page.keywordProperties) {
        expect(keywordProperty.weight).toBe(1);
      }
    });

    it('defaults the page window without inventing a page size', async () => {
      const alpha = makeProductFixture({ productID: 'product-alpha' });
      const beta = makeProductFixture({ productID: 'product-beta' });

      productRepository.searchResult = [alpha, beta];

      const page = await service.findProducts({});

      // An omitted start becomes 0 - the first record - while an omitted page size
      // stays UNDEFINED and yields the whole matched set. A default page size would
      // be an invented non-functional requirement, and the legacy smart list
      // carried none, so none is introduced.
      expect(page.pageRecordsStart).toBe(0);
      expect(page.pageRecordsShow).toBeUndefined();
      expect(page.records).toStrictEqual([alpha, beta]);
    });

    it('forwards an ABSENT keyword and product-type filter as absent', async () => {
      productRepository.searchResult = [];

      await service.findProducts({});

      // Both repository arguments are optional on the port, and an omitted
      // criterion is forwarded as absent rather than as an empty string. The
      // distinction matters at the adapter: an empty string is a filter that
      // matches nothing useful, whereas absence means "do not filter".
      expect(productRepository.searches).toStrictEqual([
        { term: undefined, productTypeIDs: undefined },
      ]);
    });
  });

  // -------------------------------------------------------------------------
  // OUT-OF-SCOPE METHODS - DELEGATION ONLY, NEVER FEATURE BEHAVIOUR
  //
  // These four serve out-of-scope features but live in an in-scope file, so they
  // are ported for interface parity with FLAGGED NOT-IMPLEMENTED bodies. This
  // suite asserts ONLY that each one delegates to its stub port where a legacy
  // statement had a ported counterpart, and that each is flagged as unexercised
  // otherwise. NOTHING below asserts the feature: no review is approved, no
  // subscription term is priced, no image is uploaded and no file is imported.
  // -------------------------------------------------------------------------
  describe('out-of-scope methods', () => {
    it('processProduct_addProductReview is flagged unexercised and touches no port', async () => {
      const product = makeProductFixture({ productID: 'product-under-review' });

      await expect(
        service.processProduct_addProductReview(product, {
          newProductReviewID: 'review-candidate',
        }),
      ).rejects.toThrow(/out of scope for this migration slice/);

      await expect(
        service.processProduct_addProductReview(product, {
          newProductReviewID: 'review-candidate',
        }),
      ).rejects.toThrow(/model\/service\/ProductService\.cfc:L157-L171/);

      // NOT ONE port member is reached, because none of the legacy body's
      // statements has a ported counterpart: it depends on a setting outside the
      // closed setting union, on ambient request scope for the logged-in account,
      // and on a product-review entity the ported domain does not model.
      expect(productRepository.saves).toStrictEqual([]);
      expect(skuCreation.requests).toStrictEqual([]);
      expect(subscriptionTermProvider.requestedTermIDs).toStrictEqual([]);
      expect(imageStore.deletedPaths).toStrictEqual([]);
    });

    it('processProduct_addSubscriptionTerm DELEGATES to the stub port before failing', async () => {
      const product = makeProductFixture({ productID: 'product-under-subscription' });

      const rejected = service.processProduct_addSubscriptionTerm(product, {
        subscriptionTermID: 'subscription-term-candidate',
      });

      await expect(rejected).rejects.toThrow(/out of scope for this migration slice/);

      // ★ THE DELEGATION IS REAL AND IS THE POINT OF THIS CASE. CFML parity
      // [model/service/ProductService.cfc:L175]: the one statement in the legacy
      // branch that HAS a ported counterpart - the subscription-term lookup - is
      // reproduced through the stub port BEFORE the out-of-scope failure surfaces.
      // That keeps the boundary honest: what is missing is the framework's generic
      // SKU factory, not the lookup.
      expect(subscriptionTermProvider.requestedTermIDs).toStrictEqual([
        'subscription-term-candidate',
      ]);

      // LEGACY-DEFECT [model/service/ProductService.cfc:L181]: the body reads
      // `arguments.data.listPrice` inside a function that declares no `data`
      // parameter, so the statement fails at run time whenever the [L180] guard
      // passes.
      // Preserved deliberately; do not fix without a product decision.
      //
      // The port names that line in its failure rather than quietly supplying an
      // empty struct, which is what makes the defect discoverable from the outside.
      await expect(rejected).rejects.toThrow(/arguments\.data\.listPrice/);
      await expect(rejected).rejects.toThrow(/model\/service\/ProductService\.cfc:L176/);

      // LEGACY-NOTE [model/service/ProductService.cfc:L185, L188]: the same local
      // is declared with `var` TWICE in the one function - an invalid duplicate
      // declaration that CFML tolerated. It is recorded here and NOT reproduced,
      // because a second `const` of the same name in the same scope is a
      // compilation error in TypeScript, and there is no observable behaviour to
      // preserve: both declarations bound the same value.
      expect(productRepository.saves).toStrictEqual([]);
    });

    it("processProduct_uploadDefaultImage preserves the literal 'validate.fileUpload'", async () => {
      const product = makeProductFixture({ productID: 'product-under-upload' });

      const rejected = service.processProduct_uploadDefaultImage(product, {
        imageFile: 'candidate-upload.png',
      });

      await expect(rejected).rejects.toThrow(/out of scope for this migration slice/);

      // CFML parity [model/service/ProductService.cfc:L253]: the legacy adds a
      // validation error keyed by the resource-bundle identifier
      // `validate.fileUpload`. That identifier is carried forward VERBATIM as a
      // plain string so the legacy admin can still resolve it, and no
      // resource-bundle runtime is introduced to resolve it here.
      await expect(rejected).rejects.toThrow(/validate\.fileUpload/);

      // NO FILE IS WRITTEN. The image store's save member RAISES if reached, so
      // this call completing as a rejection is itself the proof that no upload was
      // attempted; the recorder assertion states it positively.
      expect(imageStore.deletedPaths).toStrictEqual([]);
    });

    it('loadDataFromFile delegates positionally, with the legacy empty-string default', async () => {
      // LEGACY-NOTE [model/service/ProductService.cfc:L65-L68]: the legacy body
      // raises the platform request timeout to one hour. That is a platform fact
      // about the CFML host, not a service-level objective, and this suite
      // deliberately makes no timing assertion about it.
      //
      // Nothing below measures a duration, sets a per-test timeout, or claims
      // anything about how long the call takes. The only assertions are about WHAT
      // was forwarded and in WHAT ORDER.
      await service.loadDataFromFile('file://products.csv');
      await service.loadDataFromFile('file://products-quoted.csv', '"');

      // CFML parity [model/service/ProductService.cfc:L67]: the legacy delegates
      // POSITIONALLY with exactly two arguments in declaration order, and the
      // omitted text qualifier defaults to the EMPTY STRING rather than to absence.
      // Both facts are pinned, because a port that forwarded `undefined` for the
      // default would change what the adapter sees.
      expect(productRepository.imports).toStrictEqual([
        { fileURL: 'file://products.csv', textQualifier: '' },
        { fileURL: 'file://products-quoted.csv', textQualifier: '"' },
      ]);

      // LEGACY-NOTE [model/service/ProductService.cfc:L65-L68]: the bulk import
      // itself is out of scope - the legacy body hands the file straight to the DAO
      // and nothing in the ported slice parses a delimited file. The execution-model
      // mismatch is real and is recorded rather than papered over: there is no
      // ambient transaction behind this call any more, so a caller must supply
      // idempotency and a compensation path of its own. That is a
      // transactional-integrity constraint, not a service level, and no assertion
      // here speaks to either.
      expect(skuCreation.requests).toStrictEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // processProduct_deleteDefaultImage AND processProduct_updateDefaultImageFileNames
  // -------------------------------------------------------------------------
  describe('processProduct_deleteDefaultImage', () => {
    it('composes the image path and delegates it to the image-store stub', async () => {
      const product = makeProductFixture({ productID: 'product-with-default-image' });
      const data: DeleteDefaultImageInput = { imageFile: 'shoe.png' };

      const answered = await service.processProduct_deleteDefaultImage(product, data);

      // CFML parity [model/service/ProductService.cfc:L200-L201]: the legacy builds
      // the path by interpolating `#imageFile#` UNSCOPED - neither `arguments.data`
      // nor `local` - so CFML resolves it through its scope-search order and
      // happens to find the argument struct's key. The port reads the key
      // explicitly, which is the only translation available; there is no
      // scope-search semantics to reproduce, and the composed VALUE is what is
      // pinned instead.
      //
      // NO FILESYSTEM ACCESS. This is a string handed to a port, and the port is an
      // in-memory recorder. Nothing is opened, stat-ed, moved or unlinked.
      expect(imageStore.deletedPaths).toStrictEqual(['product/default/shoe.png']);

      // The same instance back, per [model/service/ProductService.cfc:L205].
      expect(answered).toBe(product);
    });

    it('deletes nothing when the payload carries no image file', async () => {
      const product = makeProductFixture({ productID: 'product-without-default-image' });

      // The key is OMITTED rather than set to `undefined`: under CFML a struct key
      // holding null does not exist at all, so omission is the faithful shape and
      // `exactOptionalPropertyTypes` makes the distinction explicit.
      const answered = await service.processProduct_deleteDefaultImage(product, {});

      expect(imageStore.deletedPaths).toStrictEqual([]);
      expect(answered).toBe(product);
    });
  });

  describe('processProduct_updateDefaultImageFileNames', () => {
    it('answers the same product and reaches no port', async () => {
      const product = makeProductFixture({ productID: 'product-under-filename-refresh' });

      const answered = await service.processProduct_updateDefaultImageFileNames(product);

      // CFML parity [model/service/ProductService.cfc:L208-L214]: the legacy loops
      // the product's SKUs and refreshes each generated image file name. The two
      // entity members that loop needs do not exist on the ported entity and may
      // not be added from a test, so the ported method accepts the product and
      // answers it unchanged. Recording that gap is the honest option, and the
      // ASSERTION here is deliberately narrow: the method is a pass-through, and it
      // is a pass-through that three in-scope callers depend on being callable.
      expect(answered).toBe(product);
      expect(imageStore.deletedPaths).toStrictEqual([]);
      expect(productRepository.saves).toStrictEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // ★ processProduct_addOptionGroup
  // -------------------------------------------------------------------------
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

      // LEGACY-DEFECT [model/service/ProductService.cfc:L119]: every existing SKU
      // is given options[1] - the first option of the newly added group - rather
      // than an option matched to that SKU.
      // Preserved deliberately; do not fix without a product decision.
      //
      // BOTH SKUs receive THE SAME option, and it is the group's FIRST option in
      // repository order. The second option is never applied to anything, which is
      // what makes this a defect rather than a design: two SKUs that differ in
      // every other option now agree on this one, so the option set no longer
      // distinguishes them.
      expect(first.getOptions()).toStrictEqual([material.option]);
      expect(second.getOptions()).toStrictEqual([material.option]);
      expect(first.getOptions()).not.toContain(secondOption);
      expect(second.getOptions()).not.toContain(secondOption);

      // The group is loaded ONCE, before the loop, and by the identifier the
      // payload carried. CFML parity [model/service/ProductService.cfc:L115]: the
      // payload holds an ID STRING, not a hydrated entity, which is proven by the
      // legacy handing it straight to an entity loader.
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
      // `this.processProduct(arguments.product, {}, 'updateDefaultImageFileNames')`
      // - the framework's GENERIC CONVENTION DISPATCHER, which resolved its third
      // argument to `processProduct_<context>` from a STRING at run time. The port
      // replaces it with a direct static call to the named method. The spy observes
      // that call WITHOUT replacing it, so the real implementation still runs and
      // the follow-on behaviour is unchanged by the observation.
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

      // CFML parity [model/service/ProductService.cfc:L117]: `if(arrayLen(options))`
      // is a bare numeric truthiness test on a count. It is redundant in front of a
      // loop that would not iterate, and it is preserved because it is what the
      // legacy wrote - and because it is the guard that makes the `options[1]` read
      // on the next line safe.
      expect(sku.getOptions()).toStrictEqual([]);
      expect(answered).toBe(product);
    });

    it('fails, unguarded, when the option group cannot be resolved', async () => {
      const sku = makeSkuFixture({ skuID: 'sku-unresolvable-group', options: [] });
      const product = makeProductFixture({ productID: 'product-unresolvable-group', skus: [sku] });

      // CFML parity [model/service/ProductService.cfc:L115]: the legacy chains
      // `getOptionGroup(id).getOptions()` with NO null check, so an identifier that
      // resolves to nothing fails at the dereference. No guard is added and no
      // empty group is substituted: substituting one would silently turn a bad
      // identifier into a successful no-op.
      await expect(
        service.processProduct_addOptionGroup(product, { optionGroup: 'og-does-not-exist' }),
      ).rejects.toThrow(/model\/service\/ProductService\.cfc:L115/);

      expect(sku.getOptions()).toStrictEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // ★ processProduct_addOption
  // -------------------------------------------------------------------------
  describe('processProduct_addOption', () => {
    /**
     * Assembles the standard three-group graph these cases work over.
     *
     * The new option lives in its OWN group, and the existing SKU carries one
     * option from each of two OTHER groups - which is the shape that makes both
     * halves of the [L144] condition observable.
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

      // Narrowed rather than asserted with a postfix operator: `!` appears nowhere
      // in this file, and `noUncheckedIndexedAccess` types the indexed read as
      // possibly absent.
      expect(recorded).toBeDefined();
      expect(skuCreation.requests).toHaveLength(1);

      if (recorded === undefined) {
        throw new Error('the SKU-creation collaborator recorded no request to assert against.');
      }

      // CFML parity [model/service/ProductService.cfc:L131, L146]: the payload's
      // `options` key starts as the NEW option's identifier and every other group's
      // existing option is APPENDED to it, so the new option leads the list. The
      // list is parsed with the project's own list helper rather than with
      // `String.split`, because comma-list semantics are what the legacy wrote and
      // the helper is where those semantics live.
      //
      // The coalesce below is UNREACHABLE and is a typing accommodation, not a
      // default: the assertion on the line above has already failed the test if the
      // key is absent. It is spelled out rather than replaced by a non-null
      // assertion, because `!` appears nowhere in this file. The same shape recurs
      // twice more in this block, for the same reason.
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
      // `getDefaultSku().getPrice()` COMPLETELY UNGUARDED. No guard is added, no
      // default is supplied, and a zero money value is emphatically NOT substituted:
      // a silent zero here would create SKUs priced at nothing.
      const recordedPrice = recorded.data.price;

      expect(recordedPrice).toBeDefined();

      if (recordedPrice === undefined) {
        throw new Error('the SKU-creation payload carried no price to assert against.');
      }

      expect(recordedPrice.equals(Money.fromDecimalString('19.99'))).toBe(true);

      // LEGACY-NOTE [model/service/ProductService.cfc:L135]: the list-price gate
      // here is ONE CLAUSE - `isNull(...)` alone. The same decision is made with
      // THREE clauses at [model/service/SkuService.cfc:L94] and [L130] (existence,
      // numeric, and greater than zero) and with TWO at
      // [model/service/ProductService.cfc:L180] (not the empty string, and
      // numeric). The three shapes are NOT interchangeable and each is reproduced as
      // written; harmonising them would change which callers set a list price.
      //
      // On the ported entity this one-clause gate is STATICALLY SATISFIED, because
      // `Sku.getListPrice()` answers a non-optional money value - the column
      // declares a default of zero, so the accessor cannot answer absence. The term
      // is kept verbatim anyway so the translation stays checkable against the
      // legacy line, and the consequence is asserted here: the list price is ALWAYS
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

      // The SAME option instance on both SKUs, which is routine: two SKUs of one
      // product regularly share an option row.
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

      // ★ CFML parity [model/service/ProductService.cfc:L144]: the membership test
      // is a NEGATED `listFindNoCase`, and `listFindNoCase` answers a 1-BASED INDEX
      // OR 0. In CFML `!0` is true and `!5` is false, so `!listFindNoCase(...)`
      // means "NOT PRESENT". The port writes that as an explicit comparison against
      // zero. The rule behind it is absolute: never a bare-truthiness negation of a
      // list-index result, and never `index > 0` against a zero-based search
      // result, because a genuine zero index and a genuine absence are different
      // things and the two idioms disagree about which is which.
      //
      // The observable consequence is asserted here rather than the idiom: the
      // shared option appears EXACTLY ONCE even though it was encountered twice.
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

      // The SAME group identifier in a DIFFERENT CASE. CFML string comparison folds
      // case, so the legacy treats these as one group and skips the existing option.
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

      // The existing option is NOT appended, because its group is the new option's
      // group under case-folding comparison. A port that had used a case-sensitive
      // comparison here would have appended it and produced an option list naming
      // two options from one group - a combination no SKU can have.
      expect(recorded.data.options).toBe('opt-cotton');
      expect(listToArray(recorded.data.options ?? '')).toStrictEqual(['opt-cotton']);
    });

    it('DISCARDS the SKU-creation outcome and continues regardless', async () => {
      const graph = buildAddOptionGraph();

      // The collaborator reports FAILURE.
      skuCreation.outcome = false;

      const dispatchSpy = vi.spyOn(service, 'processProduct_updateDefaultImageFileNames');

      const answered = await service.processProduct_addOption(graph.product, {
        option: 'opt-cotton',
      });

      // LEGACY-NOTE [model/service/ProductService.cfc:L150]: `createSkus` is
      // declared to answer a boolean at [model/service/SkuService.cfc:L58], and THE
      // RETURN VALUE IS DISCARDED here. Nothing branches on it, nothing raises on
      // false, and the method continues to the image-name refresh and the return
      // regardless. The discard is preserved: acting on the result would change what
      // a caller observes when SKU creation reports failure.
      expect(answered).toBe(graph.product);
      expect(dispatchSpy).toHaveBeenCalledTimes(1);
      expect(skuCreation.requests).toHaveLength(1);
    });

    it('fails, unguarded, when the option or the default SKU cannot be resolved', async () => {
      const graph = buildAddOptionGraph();

      // CFML parity [model/service/ProductService.cfc:L130]: the option loader is
      // dereferenced with no null check, exactly as the group loader is at [L115].
      await expect(
        service.processProduct_addOption(graph.product, { option: 'opt-does-not-exist' }),
      ).rejects.toThrow(/model\/service\/ProductService\.cfc:L130/);

      // CFML parity [model/service/ProductService.cfc:L133]: and neither is the
      // default SKU. `makeProductFixture` leaves `defaultSku` ABSENT by default,
      // which is load-bearing here - a fixture that supplied one would have hidden
      // this path.
      const withoutDefaultSku = makeProductFixture({ productID: 'product-without-default-sku' });

      await expect(
        service.processProduct_addOption(withoutDefaultSku, { option: 'opt-cotton' }),
      ).rejects.toThrow(/model\/service\/ProductService\.cfc:L133/);

      expect(skuCreation.requests).toStrictEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // ★ saveProduct
  // -------------------------------------------------------------------------
  describe('saveProduct', () => {
    it('preserves both physical table names byte-for-byte', () => {
      // C5, SCHEMA CONTINUITY. The two literals are the uniqueness SCOPE handed to
      // the URL-title port, and they name tables the target continues to read and
      // write unchanged. They are pinned here so a typo in the constant cannot make
      // the delegation cases below pass while asserting the wrong scope.
      //
      // The declared type is the port's own `UrlTitleTableName` union, so these two
      // spellings are additionally checked against the only three values that union
      // admits - `'SwBrand'`, `'SwProduct'` and `'SwProductType'`
      // [src/domain/ports/urlTitleGenerator.ts:L164].
      expect(PRODUCT_TABLE_NAME).toBe('SwProduct');
      expect(PRODUCT_TYPE_TABLE_NAME).toBe('SwProductType');
    });

    it('leaves the URL title alone when the entity already carries one', async () => {
      const product = makeProductFixture({});
      const data: ProductSaveInput = {};

      const dispatchSpy = vi.spyOn(service, 'processProduct_updateDefaultImageFileNames');

      const answered = await service.saveProduct(product, data);

      // The fixture carries `'nike-air-jorden'`, so the L268 gate does not fire and
      // NOTHING is generated. Asserting the empty request list rather than a call
      // count keeps the failure message informative when it does fire.
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(product.getUrlTitle()).toBe(FIXTURE_URL_TITLE);

      // The payload is not touched at all - no key added, none removed.
      expect(data).toStrictEqual({});

      // CFML parity [model/service/ProductService.cfc:L276-L282]: the fixture's
      // `productID` defaults to the empty string, so `isNew()` holds, and the
      // fixture validates, so both terms of the conjunction are satisfied and the
      // new-product branch runs.
      expect(skuCreation.requests).toHaveLength(1);
      expect(dispatchSpy).toHaveBeenCalledTimes(1);

      const creation = skuCreation.requests[0];

      if (creation === undefined) {
        throw new Error('the SKU-creation collaborator recorded no request to assert against.');
      }

      // ★ LEGACY-NOTE [model/service/ProductService.cfc:L279]: THE SAVE PAYLOAD
      // ITSELF is handed to SKU creation, unchanged and by reference - not a copy,
      // not a projection. The identity check is the whole assertion: it proves the
      // coupling the legacy created between a save payload and a SKU-creation
      // payload, which is why the ported input type declares SKU-creation keys at
      // all.
      expect(creation.data).toBe(data);
      expect(creation.product).toBe(product);

      // The persistence port receives THE INPUT product, and the method answers the
      // PERSISTED instance the port replied with - the legacy reassigns `product`
      // from the save result at L287, so the returned value is not the argument.
      expect(productRepository.saves).toStrictEqual([product]);
      expect(answered).toBe(persistedProduct);
      expect(answered).not.toBe(product);
      expect(answered.getProductID()).toBe(PERSISTED_PRODUCT_ID);
    });

    it('generates from the CALCULATED TITLE against "SwProduct" when no title is present', async () => {
      // `urlTitle: undefined` is the fixture's OWN vocabulary for the absent state,
      // not an accidental `undefined` assignment: `makeProductFixture` distinguishes
      // "key present holding undefined" from "key absent" so that a caller can ask
      // for absence explicitly, and the override type admits `undefined` for exactly
      // that purpose. Omitting the key would instead take the DEFAULT title,
      // `'nike-air-jorden'`, which is the previous case rather than this one.
      const product = makeProductFixture({ urlTitle: undefined });
      const data: ProductSaveInput = {};

      await service.saveProduct(product, data);

      // ★ SHIPPED-SURFACE CORRECTION 3, PART ONE - THE TITLE SOURCE.
      //
      // The legacy line is `getService("dataService").createUniqueURLTitle(
      // titleString=arguments.product.getTitle(), tableName="SwProduct")`. The ported
      // entity publishes NO `getTitle()`: the closed entity surface exposes
      // `getCalculatedTitle()`, the PERSISTED SNAPSHOT of the same value, and no
      // member may be added to it. The shipped service reads that accessor, so THAT
      // is what the generator receives and that is what is asserted. The fixture
      // deliberately gives the calculated title a value that differs from
      // `productName`, so this assertion cannot pass by coincidence.
      //
      // Contrast the sibling sources: `saveProductType` prefers the payload's
      // `productTypeName` and falls back to the entity's, and
      // `model/service/BrandService.cfc:L69` reads `getBrandName()`. THREE DIFFERENT
      // TITLE SOURCES ACROSS THREE SAVE OVERRIDES, none harmonised.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: FIXTURE_CALCULATED_TITLE, tableName: PRODUCT_TABLE_NAME },
      ]);

      // ★ SHIPPED-SURFACE CORRECTION 3, PART TWO - WHERE THE RESOLVED VALUE LANDS.
      //
      // The legacy line is `arguments.product.setURLTitle(...)`, an ENTITY write.
      // `Product.urlTitle` is `private readonly` on the ported entity - immutable by
      // design, with no setter and no route to add one - so the shipped service
      // writes the resolved title INTO THE CALLER'S PAYLOAD instead. Both halves of
      // that are asserted here, because pinning only the payload write would leave a
      // reader believing the entity was updated too.
      expect(data.urlTitle).toBe(GENERATED_URL_TITLE);
      expect(product.getUrlTitle()).toBeUndefined();

      // The resolved title satisfies the `urlTitle` save rule, so the save proceeds:
      // generation is not merely recorded, it changes the outcome. Without it the
      // product would have failed validation and never reached the port.
      expect(productRepository.saves).toStrictEqual([product]);
    });

    it('writes the resolved title UNDER THE PAYLOAD KEY ALREADY IN USE, whatever its casing', async () => {
      const product = makeProductFixture({ urlTitle: undefined });

      // The untyped-boundary case: a payload that reached this service from a parsed
      // JSON body carrying the legacy CFML spelling `URLTitle`. A typed caller cannot
      // produce this - excess-property checking rejects it - so it is built the same
      // way the shipped writer writes: through `Reflect.set`, with no cast, no index
      // signature and no `any`.
      const data: ProductSaveInput = {};
      Reflect.set(data, 'URLTitle', undefined);

      expect(structFindKey(data, 'urlTitle')).toBe('URLTitle');

      await service.saveProduct(product, data);

      // CFML parity [model/service/ProductService.cfc:L269]: a CFML struct holds ONE
      // key per name because its key store folds case, so the legacy assignment
      // updated the entry already present. The port reproduces that: the value lands
      // under the key that was there, and NO SECOND KEY IS ADDED. A plain
      // `data.urlTitle = value` would have created one and left the original entry
      // shadowing it, because every struct read in this port answers with the FIRST
      // matching own key.
      expect(Object.keys(data)).toStrictEqual(['URLTitle']);
      expect(Reflect.get(data, 'URLTitle')).toBe(GENERATED_URL_TITLE);
      expect(structFindKey(data, 'urlTitle')).toBe('URLTitle');

      // And the generation still counted: exactly one call, and the save proceeded.
      expect(urlTitleGenerator.requests).toHaveLength(1);
      expect(productRepository.saves).toStrictEqual([product]);
    });

    it('★ does NOT generate for an EMPTY-STRING title - the ONE-CLAUSE guard', async () => {
      const product = makeProductFixture({ urlTitle: '' });
      const data: ProductSaveInput = {};

      const answered = await service.saveProduct(product, data);

      // ★ LEGACY-NOTE [model/service/ProductService.cfc:L268]: THE GUARD HERE IS ONE
      // CLAUSE - `isNull(arguments.product.getURLTitle())` and nothing else.
      // `isNull('')` is FALSE, so an empty-string URL title SUPPRESSES generation.
      //
      // The same decision is made with FOUR clauses at
      // [model/service/ProductService.cfc:L295] and at
      // [model/service/BrandService.cfc:L68] - each a conjunction of two disjunctions
      // that also tests `len()` - and there an empty string TRIGGERS generation.
      // THREE URL-TITLE GUARD SHAPES ACROSS THE SLICE, AND THEY ARE NOT UNIFIED. The
      // difference is observable, it is asserted here and in the `saveProductType`
      // block below, and harmonising the three would change which products acquire a
      // slug.
      expect(urlTitleGenerator.requests).toStrictEqual([]);

      // And the consequence of the asymmetry, which is the part that matters: with
      // generation suppressed the empty title reaches the `urlTitle` save rule, which
      // requires length, so the product is INVALID and NEVER PERSISTED. The
      // four-clause siblings would have generated a title and saved.
      expect(skuCreation.requests).toStrictEqual([]);
      expect(productRepository.saves).toStrictEqual([]);

      // The legacy answers the entity either way, so the caller gets its own
      // unpersisted product back rather than an exception or a null.
      expect(answered).toBe(product);
      expect(answered.getUrlTitle()).toBe('');
    });

    it('skips SKU creation for a product that is NOT new, yet still saves it', async () => {
      const product = makeProductFixture({ productID: 'already-persisted-product' });
      const data: ProductSaveInput = {};

      const dispatchSpy = vi.spyOn(service, 'processProduct_updateDefaultImageFileNames');

      const answered = await service.saveProduct(product, data);

      // CFML parity [model/service/ProductService.cfc:L276]: `if(arguments.product
      // .isNew() and !arguments.product.hasErrors())` - BOTH terms, in order. This
      // case falsifies the FIRST. `isNew()` is the one framework-derived member the
      // ported entity keeps, and it is the empty-identifier test verbatim.
      expect(product.isNew()).toBe(false);
      expect(skuCreation.requests).toStrictEqual([]);
      expect(dispatchSpy).not.toHaveBeenCalled();

      // The save is gated on validity ALONE, not on newness, so it still runs.
      expect(productRepository.saves).toStrictEqual([product]);
      expect(answered).toBe(persistedProduct);
    });

    it('neither creates SKUs nor saves an invalid product, and answers the entity', async () => {
      const product = makeProductFixture({ productName: undefined });
      const data: ProductSaveInput = {};

      const dispatchSpy = vi.spyOn(service, 'processProduct_updateDefaultImageFileNames');

      const answered = await service.saveProduct(product, data);

      // LEGACY-NOTE [model/validation/Product.json]: the `save` context declares
      // exactly five rules - `price`, `productName`, `productCode`, `productType` and
      // `urlTitle`. This case falsifies `productName`, and the second term of the
      // L276 conjunction with it, so neither branch runs.
      //
      // The two `unique` qualifiers on `productCode` and `urlTitle` are NOT asserted
      // anywhere in this suite: uniqueness is a datastore property, the legacy
      // resolved it with a query inside the framework validation service, and there
      // is no in-memory assertion that would be both honest and correct.
      expect(product.isNew()).toBe(true);
      expect(skuCreation.requests).toStrictEqual([]);
      expect(dispatchSpy).not.toHaveBeenCalled();
      expect(productRepository.saves).toStrictEqual([]);

      // CFML parity [model/service/ProductService.cfc:L291]: the legacy returns
      // `arguments.product` unconditionally, so an invalid product comes back as
      // itself - the caller inspects it, nothing is thrown, and nothing is null.
      expect(answered).toBe(product);
    });

    it('rejects a product code holding an unsupported character', async () => {
      const product = makeProductFixture({ productCode: 'not a valid code' });
      const data: ProductSaveInput = {};

      const answered = await service.saveProduct(product, data);

      // `"productCode": [{"contexts":"save","required":true,"unique":true,
      // "regex":"^[a-zA-Z0-9-_.|:~^]+$"}]` - the space is not in the class, so the
      // present-and-non-empty code still fails. Asserting this separately from the
      // missing-`productName` case is what proves the regex half of the rule is
      // enforced rather than only the `required` half.
      expect(productRepository.saves).toStrictEqual([]);
      expect(answered).toBe(product);
    });
  });

  // -------------------------------------------------------------------------
  // ★ saveProductType
  // -------------------------------------------------------------------------
  describe('saveProductType', () => {
    it('★ prefers the PAYLOAD name, generating against "SwProductType"', async () => {
      const productType = new ProductType({
        productTypeID: 'product-type-being-saved',
        productTypeName: 'Name On The Entity',
      });
      const data: ProductTypeSaveInput = { productTypeName: 'Name In The Payload' };

      const answered = await service.saveProductType(productType, data);

      // ★ CFML parity [model/service/ProductService.cfc:L295]: THE GUARD HERE IS FOUR
      // CLAUSES - `(isNull(getURLTitle()) || !len(getURLTitle())) && (
      // !structKeyExists(data,"urlTitle") || !len(data.urlTitle))`. Byte-identical in
      // shape to [model/service/BrandService.cfc:L68], and NOT the one-clause shape at
      // [model/service/ProductService.cfc:L268]. The entity here has no URL title and
      // the payload holds no `urlTitle` key, so both disjunctions hold and the gate
      // fires.
      //
      // CFML parity [model/service/ProductService.cfc:L296]: the preference order is
      // the PAYLOAD's `productTypeName` FIRST and the entity's own SECOND. Both
      // sources are populated here with DIFFERENT values, which is the only way to
      // prove which one won.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: 'Name In The Payload', tableName: PRODUCT_TYPE_TABLE_NAME },
      ]);

      // The resolved title lands in the caller's payload, in place, exactly as it does
      // in `saveProduct` and for the same reason.
      expect(data.urlTitle).toBe(GENERATED_URL_TITLE);

      // ★ CFML parity [model/service/ProductService.cfc:L303]: `super.save(productType,
      // data)` is POSITIONAL, and the port member takes THE ENTITY ONLY. The
      // delegation is asserted as a single-element list so an extra save cannot hide.
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

      // CFML parity [model/service/ProductService.cfc:L298]: the second inner branch
      // asks `!isNull(getProductTypeName()) && len(...)` - a DIFFERENT guard shape
      // from the payload branch's `structKeyExists(...) && len(...)` one line earlier.
      // Both are reproduced as written; the shapes are not unified.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: 'Name On The Entity', tableName: PRODUCT_TYPE_TABLE_NAME },
      ]);
      expect(data.urlTitle).toBe(GENERATED_URL_TITLE);
    });

    it('★ sets NOTHING when neither source yields a name - there is no else', async () => {
      const productType = new ProductType({ productTypeID: 'product-type-with-no-name' });
      const data: ProductTypeSaveInput = {};

      const answered = await service.saveProductType(productType, data);

      // ★ CFML parity [model/service/ProductService.cfc:L296-L300]: THERE IS NO `else`.
      // When neither the payload nor the entity yields a usable name the URL title is
      // simply NEVER SET - no throw, no fallback, no empty-string default, no
      // generated placeholder. That silence is the behaviour, and it is identical to
      // [model/service/BrandService.cfc:L69-L73].
      expect(urlTitleGenerator.requests).toStrictEqual([]);
      expect(data.urlTitle).toBeUndefined();
      expect(Object.keys(data)).toStrictEqual([]);

      // And the save still happens: the missing title blocks nothing here, unlike
      // `saveProduct`, whose hand-written save-context rules refuse it.
      expect(productTypeRepository.saves).toStrictEqual([productType]);
      expect(answered).toBe(productType);
    });

    it('does not generate when the PAYLOAD already supplies a usable urlTitle', async () => {
      const productType = new ProductType({
        productTypeID: 'product-type-with-payload-title',
        productTypeName: 'Name On The Entity',
      });
      const data: ProductTypeSaveInput = { urlTitle: 'supplied-by-the-caller' };

      await service.saveProductType(productType, data);

      // The SECOND disjunction of the four-clause gate fails, so the gate does not
      // fire even though the entity has no title of its own. This is the half of the
      // guard the one-clause shape at L268 does not have at all.
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

      // ★ THE ASYMMETRY, MADE OBSERVABLE FROM THE OTHER SIDE. The same empty string
      // that SUPPRESSED generation in `saveProduct` TRIGGERS it here, because this
      // gate tests `len()` as well as nullity. The two cases are deliberately written
      // as a matched pair - one in each block - so the LEGACY asymmetry between the
      // two guard shapes cannot be read as an accident of fixture choice. It is not a
      // target divergence and nothing here spends from that ledger.
      expect(urlTitleGenerator.requests).toStrictEqual([
        { titleString: 'Name On The Entity', tableName: PRODUCT_TYPE_TABLE_NAME },
      ]);
      expect(data.urlTitle).toBe(GENERATED_URL_TITLE);
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

      const argument = new ProductType({
        productTypeID: 'product-type-argument',
        urlTitle: 'argument-title',
      });

      const answered = await service.saveProductType(argument, {});

      // CFML parity [model/service/ProductService.cfc:L303, L306]: the legacy
      // REASSIGNS `arguments.productType` from the save result and every later line
      // reads the reassigned value, so the parent chain that is consulted belongs to
      // the PERSISTED instance. The double answers a different instance precisely so
      // that this is provable.
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

      const childProductType = new ProductType({
        productTypeID: 'child-product-type',
        urlTitle: 'child-title',
        parentProductType,
      });
      childProductType.addProduct(childProduct);

      expect(childProductType.getProducts()).toStrictEqual([childProduct]);

      const answered = await service.saveProductType(childProductType, {});

      // ★ LEGACY-DEFECT [model/service/ProductService.cfc:L307]: the parent's product
      // collection is assigned straight to the child, REPLACING rather than merging,
      // so whatever products the child already had are DROPPED.
      // Preserved deliberately; do not fix without a product decision.
      //
      // The legacy comment one line above at [L305] says "inherit all products that
      // were assigned to that parent", and nothing about the statement merges: it is a
      // whole-collection assignment. The child's own product is gone afterwards, which
      // is the observable consequence and the reason this is a defect rather than a
      // design.
      expect(answered.getProducts()).toStrictEqual([parentProduct]);
      expect(answered.getProducts()).not.toContain(childProduct);

      // LEGACY-NOTE [model/entity/ProductType.cfc:L101-L107]: the CFML statement is a
      // reference assignment, so under Hibernate the two entities would have gone on
      // to share one live collection. That second consequence does NOT survive into
      // the port, and the reason is in the ENTITY rather than in this service:
      // `ProductType.setProducts` reproduces [model/entity/ProductType.cfc:L103],
      // which REBINDS `variables.Products` to a fresh array and then adds each
      // element - so the legacy setter did not share either. The arrays are therefore
      // distinct afterwards and a later write through one is not visible through the
      // other. That is pinned here rather than assumed, because a reader coming from
      // the L307 defect description would otherwise expect aliasing.
      expect(answered.getProducts()).not.toBe(parentProductType.getProducts());

      const laterProduct = makeProductFixture({ productID: 'product-added-to-the-parent-later' });
      parentProductType.addProduct(laterProduct);

      expect(parentProductType.getProducts()).toStrictEqual([parentProduct, laterProduct]);
      expect(answered.getProducts()).toStrictEqual([parentProduct]);
    });

    it('inherits nothing when the parent holds no products, and nothing when there is no parent', async () => {
      const childProduct = makeProductFixture({ productID: 'product-owned-by-the-child' });

      const emptyParent = new ProductType({ productTypeID: 'parent-without-products' });
      const withEmptyParent = new ProductType({
        productTypeID: 'child-of-empty-parent',
        urlTitle: 'child-title',
        parentProductType: emptyParent,
      });
      withEmptyParent.addProduct(childProduct);

      const firstAnswer = await service.saveProductType(withEmptyParent, {});

      // CFML parity [model/service/ProductService.cfc:L306]: `arrayLen(...)` is a BARE
      // NUMERIC TRUTHINESS TEST on the parent's collection, so an empty parent
      // collection skips the assignment entirely - and the child KEEPS its own
      // products. Without this case the replace-not-merge assertion above could not be
      // distinguished from an unconditional clear.
      expect(firstAnswer.getProducts()).toStrictEqual([childProduct]);

      const orphanProduct = makeProductFixture({ productID: 'product-owned-by-the-orphan' });
      const withoutParent = new ProductType({
        productTypeID: 'child-without-parent',
        urlTitle: 'orphan-title',
      });
      withoutParent.addProduct(orphanProduct);

      const secondAnswer = await service.saveProductType(withoutParent, {});

      // And the first term of the same condition: no parent, no inheritance, no throw.
      expect(secondAnswer.getParentProductType()).toBeUndefined();
      expect(secondAnswer.getProducts()).toStrictEqual([orphanProduct]);
    });
  });

  // -------------------------------------------------------------------------
  // ★ deleteProduct
  // -------------------------------------------------------------------------
  describe('deleteProduct', () => {
    it('deletes and answers true when no transaction exists', async () => {
      const product = makeProductFixture({ productID: 'product-to-delete' });

      skuRepository.transactionExists = false;
      productRepository.deleteOutcome = true;

      const answered = await service.deleteProduct(product);

      // CFML parity [model/service/ProductService.cfc:L318]: the delete-context rule
      // is `transactionExistsFlag eq false`, and it is asked through the REPOSITORY
      // rather than through the entity's own accessor - the entity's version depends
      // on having been hydrated with a SKU-repository collaborator and throws when it
      // was not. ONE ARGUMENT is passed, the product identifier; the port's second
      // parameter is optional and is deliberately left absent rather than filled with
      // a placeholder.
      expect(skuRepository.transactionProbes).toStrictEqual([
        { productID: 'product-to-delete', skuID: undefined },
      ]);

      // CFML parity [model/service/ProductService.cfc:L326]: `super.delete(
      // arguments.product)` is POSITIONAL and answers a boolean.
      expect(productRepository.deletes).toStrictEqual([product]);
      expect(answered).toBe(true);
    });

    it('answers false and NEVER REACHES the delete when a transaction exists', async () => {
      const product = makeProductFixture({ productID: 'product-with-a-transaction' });

      skuRepository.transactionExists = true;
      productRepository.deleteOutcome = true;

      const answered = await service.deleteProduct(product);

      // The refusal SHORT-CIRCUITS. Zero delete calls is the load-bearing assertion:
      // a port that had probed and then deleted anyway would still have answered
      // false here, and only the empty call list distinguishes the two.
      expect(productRepository.deletes).toStrictEqual([]);
      expect(answered).toBe(false);

      // CFML parity [model/service/ProductService.cfc:L329-L335]: a delete blocked by
      // validation was NEVER an exception in the legacy - it answered false. No throw
      // is introduced.
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

      const answered = await service.deleteProduct(product);

      expect(productRepository.deletes).toStrictEqual([product]);
      expect(answered).toBe(false);

      // ★ THE RESTORE-ON-FAILURE CONTRACT, ASSERTED AS AN OBSERVABLE OUTCOME.
      //
      // CFML parity [model/service/ProductService.cfc:L323, L332]: the legacy takes a
      // SNAPSHOT of the default SKU, DETACHES it with
      // `setDefaultSku(javaCast("null",""))` so the delete is not blocked by the
      // foreign key, and RESTORES the snapshot on the failure exit. The observable
      // contract of that three-step dance is exactly this: after a failed delete the
      // product still has the default SKU it started with.
      //
      // LEGACY-NOTE [model/service/ProductService.cfc:L323]: the detach-and-restore
      // STEPS are not individually observable in the port, and that is a consequence
      // of the ported entity rather than a choice made here - `Product.defaultSku` is
      // `private readonly`, so there is no setter to detach through and no member may
      // be added to create one. The snapshot is therefore never disturbed and the
      // restore is a no-op that holds BY CONSTRUCTION. The contract is asserted; the
      // mechanism is recorded as absent rather than faked with a spy on a member that
      // does not exist.
      expect(product.getDefaultSku()).toBe(defaultSku);
    });
  });
});
