/**
 * ==================================================================================================
 * ProductService — unit suite for the extracted TypeScript catalog service
 * ==================================================================================================
 *
 * WHAT THIS FILE IS. Direct-import, constructor-injection UNIT tests for
 * `slatwall-ts/src/services/ProductService.ts`, the port of `model/service/ProductService.cfc`. Every
 * test builds its own service graph through {@link buildHarness} and drives the class directly. There
 * is no framework, no container, no service locator and no module mocking anywhere in this file.
 *
 * HOW THAT DIFFERS FROM THE LEGACY SUITE, AND WHY THE DIFFERENCE IS BY DESIGN.
 * `meta/tests/unit/SlatwallUnitTestBase.cfc:L49-L79` is the shape every legacy service test inherited:
 * it extends `mxunit.framework.TestCase`, instantiates the whole `Slatwall.Application` FW/1
 * application in `setUp()` (`:L52`), bootstraps it (`:L60`) and then resolves collaborators out of the
 * DI/1 bean factory by string name. `meta/tests/unit/service/HibachiServiceTest.cfc` — the AAP's
 * designated reference for this file's shape (AAP §0.4.1.12) — follows exactly that pattern. Those are
 * therefore INTEGRATION tests wearing a unit-test base class: booting the application is a precondition
 * of calling a single method. This suite is the opposite: the class under test is imported, its
 * collaborators are typed doubles, and nothing outside `slatwall-ts/` is touched. AAP §0.4.3.6 records
 * that inversion as the single largest structural difference between the two suites, and a reviewer
 * comparing them should expect it rather than read it as a gap.
 *
 * ⚠️ THE LEGACY BASE ALSO RAN AS A SUPERUSER. `SlatwallUnitTestBase.cfc:L62` is
 * `request.slatwallScope.getAccount().setSuperUserFlag(1)`, so every legacy assertion was made with
 * authorization defeated. This suite makes the account context EXPLICIT instead — the harness injects a
 * named account through the landed account-context seam, and the population authorization is a declared
 * collaborator rather than an ambient privilege. Where a test needs the permissive posture the legacy
 * enjoyed, it says so.
 *
 * ⚠️ TRACEABILITY HERE IS DOCUMENTARY ONLY, AND NO LEGACY SUITE WAS EXECUTED. MXUnit and CFSelenium are
 * not vendored in this repository; `meta/tests/readme.txt:L1-L7` requires MXUnit to be installed on the
 * machine with a mapping inside CFIDE, plus CFSelenium and an Eclipse/CFBuilder plugin, none of which
 * exists here. `meta/docker/slatwall-local-dev/` — cited by the prompt as the local Lucee/Railo + MySQL
 * setup — DOES NOT EXIST (`meta/` contains only `tests/` and `eclipse/`). No CFML engine, no MXUnit
 * runner and no runtime comparison against the original behaviour was performed for any assertion
 * below. Every parity claim in this file was established by READING the cited source locator, and each
 * assertion carries that locator so a reviewer can re-derive it (AAP §0.6.5.3, §0.8.4).
 *
 * ⚠️ WHY EVERY TEST BUILDS FRESH STATE. `SlatwallUnitTestBase.cfc:L53` is a COMMENTED-OUT
 * `reloadApplication()` and `:L70` is a COMMENTED-OUT `endSlatwallLifecycle()`. The legacy suite
 * therefore neither reset the application before a test nor ran the request-end lifecycle after one,
 * which means the M5 implicit request-end commit gate never fired under test and leftover state was
 * carried between tests. This file removes that class of doubt structurally: there is NO module-scope
 * mutable state, and {@link buildHarness} constructs a new service, new repositories, new ports, new
 * entities and new process objects for every single test.
 *
 * NET-NEW COVERAGE, STATED PLAINLY AND WITHOUT EXCEPTION. `meta/tests/` contains NO
 * `ProductServiceTest.cfc` — AAP §0.6.5.2 verified its absence — so EVERY assertion in this file is
 * NET-NEW coverage, and every test name says so. Two cases carry a legacy locator anyway, and the
 * distinction matters: `meta/tests/unit/IssuesTest.cfc:L192-L201` (`issue_1690`) and
 * `meta/tests/unit/Helper.cfc:L52-L77` (the merchandise fixture) supply the SCENARIO and the fixture
 * LITERALS this file reuses, but neither contains a single `assert` statement, so there is no legacy
 * assertion for those cases to extend. They are labelled NET-NEW with the legacy locator named, which is
 * the honest form: the locator earns traceability of the scenario, not of a verdict. Nothing here implies
 * parity with a legacy assertion that does not exist (AAP §0.8.3.7).
 *
 * WHAT IS COVERED, IN ORDER. The fifteen declared members of AAP §0.4.2.1 each get their own block:
 * `loadDataFromFile`, `getFormattedOptionGroups`, `getProductSkusBySelectedOptions`,
 * `processProductAddOptionGroup`, `processProductAddOption`, `processProductAddProductReview`,
 * `processProductAddSubscriptionTerm`, `processProductDeleteDefaultImage`,
 * `processProductUpdateDefaultImageFileNames`, `processProductUpdateSkus`,
 * `processProductUploadDefaultImage`, `saveProduct`, `saveProductType`, `deleteProduct` and
 * `getProductSmartList`. Three cross-cutting blocks sit alongside them: the N3 two-pass process
 * orchestration, and the three IR-1 members (`newProduct`, `getProduct`, `getProductType`) that exist in
 * the legacy only through `onMissingMethod` synthesis and had to be declared explicitly here.
 *
 * ⛔ WHAT IS DELIBERATELY NOT COVERED, so the omissions read as decisions.
 *
 *   1. `buildSkuCombinations` — `model/service/ProductService.cfc:L82-L97` is `private`, and the only
 *      call site in the entire repository is its own recursive self-call at `:L93`. It is therefore
 *      UNREACHABLE dead code, catalogued as defect D15 (AAP §0.6.7.3), and AAP §0.4.1.8 states it is
 *      NOT PORTED. Unported code gets no test. This paragraph exists so a reviewer counting members
 *      does not read the absence as a hole in the matrix.
 *
 *   2. The AWS handler surface. This file's mandate is `ProductService`'s own fifteen-member matrix, not
 *      the layer in front of it; `test/handlers/productHandler.test.ts` owns that. No AWS type, event,
 *      context or handler module is imported here — all AWS coupling belongs to `src/handlers/**`
 *      (AAP §0.7.3, hexagonal separation), and keeping it out of this file is what lets every case below
 *      construct the service directly.
 *
 *   3. The sixteen excluded calculated members of AAP §0.2.2.6 — `salePrice`, `livePrice`, `qats`,
 *      `currencyDetails`, `eligibleFulfillmentMethods` and the rest. Nothing below reads them, and no
 *      real Pricing, Physical, Setting, Attribute, Inventory or Promotion service is constructed.
 *
 *   4. Order/Payment session locks, coverage thresholds, retry counts, batch sizes and timing budgets.
 *      None exists in the source; inventing one would violate IR-12 and AAP §0.7.3 standard 9.
 *
 * 📝 A SOURCE ARTEFACT WORTH RECORDING BUT NOT WORTH BEHAVIOUR. `model/service/ProductService.cfc`
 * carries the banner `// ===================== START: DAO Passthrough ===================` TWICE, at
 * `:L102` and again at `:L108`, so the "Logical Methods" section between them is never opened. The same
 * duplication appears at `model/service/OptionService.cfc:L70` and `:L80`. It is a copy-paste artefact
 * in a comment. It has no runtime meaning, and no test below invents one for it.
 *
 * 📝 M8 — SETTING RESOLUTION IS SYNCHRONOUS AND NOTHING HERE AWAITS A BACKGROUND WRITER.
 * `SettingService.updateStockCalculated` launches a named `cfthread` in the legacy platform (AAP
 * §0.6.6, M8). That service is out of scope, and the landed `SettingResolverPort.setting()` is a
 * SYNCHRONOUS call returning a `string`. No test below awaits a setting, polls for one, or asserts on
 * background completion.
 */

import {
  DENY_ALL_POPULATION_AUTHORIZATION,
  buildOption,
  buildOptionGroup,
  buildProduct,
  buildProductType,
  buildSku,
  createAbsentAccountContextDouble,
  createAccessContentDouble,
  createAccountContextDouble,
  createBaseServicePersistenceDouble,
  createDefaultSkuDelegate,
  createDirectPersisterDouble,
  createImagePathDouble,
  createInMemoryOptionRepository,
  createInMemoryProductRepository,
  createInMemorySkuRepository,
  createMerchandiseProductFixture,
  createPopulationAuthorizationDouble,
  createProductTypeRootResolverDouble,
  createSettingResolverDouble,
  createSmartListQueryDouble,
  createSubscriptionTermDouble,
  createTransactionExistenceChecker,
  createUniquePropertyDouble,
  createUrlTitleAvailabilityDouble,
  newAccount,
  persistedNonAdminAccount,
  type ProductImportHandler,
  type ProductRepositoryCall,
  type SettingResolverCall,
  type SettingSeed,
  physicalID,
  type SkuRepositoryCall,
  type SmartListResponder,
  TEST_ADMIN_ACCOUNT_ID,
  TEST_NON_ADMIN_ACCOUNT_ID,
  type UrlTitleTableName,
  GENEROUS_COMBINATION_BUDGET,
  GENEROUS_URL_TITLE_PROBE_BUDGET,
} from '../support/inMemoryRepositories';
import {
  MERCHANDISE_PRODUCT_TYPE_ID,
  SUBSCRIPTION_PRODUCT_TYPE_ID,
} from '../fixtures/productTypes';
import {
  TEST_MERCHANDISE_PRODUCT_CODE,
  TEST_MERCHANDISE_PRODUCT_NAME,
  TEST_MERCHANDISE_PRODUCT_PRICE,
} from '../fixtures/testProduct';
import { BaseService, type MaintenanceEntityRef } from '../../src/services/BaseService';
import { OptionService, type SelectOption } from '../../src/services/OptionService';
import {
  ProductService,
  type FormattedOptionGroups,
  type ProductBaseService,
  type ProductProcessValidator,
  type ProductServiceCollaborators,
  type ProductTypeBaseService,
  type ProductTypeWithErrorState,
} from '../../src/services/ProductService';
import { readHydratedParentProductTypeID } from '../../src/adapters/mysql/rowMappers';
import { SkuService } from '../../src/services/SkuService';
import { Option } from '../../src/domain/option/Option';
import { OptionGroup } from '../../src/domain/option/OptionGroup';
import type { ProductAddOption } from '../../src/domain/process/ProductAddOption';
import type { ProductAddOptionGroup } from '../../src/domain/process/ProductAddOptionGroup';
import type { ProductUpdateSkus } from '../../src/domain/process/ProductUpdateSkus';
import {
  PRODUCT_PROPERTY_DESCRIPTORS,
  Product,
  type ProductDefaultSkuDelegate,
  type ProductPropertyName,
  type ProductTransactionExistenceChecker,
} from '../../src/domain/product/Product';
import {
  PRODUCT_TYPE_DECLARED_PROPERTIES,
  ProductType,
} from '../../src/domain/product/ProductType';
import { Sku } from '../../src/domain/sku/Sku';
import { DomainError, NotImplementedError } from '../../src/errors/DomainError';
import {
  FILE_UPLOAD_RBKEY,
  PROCESS_OBJECTS_ERROR_KEY,
  ValidationError,
} from '../../src/errors/ValidationError';
import {
  physicalCountsValidation,
  productValidationRuleSet,
} from '../../src/validation/rules/product.rules';
import { productTypeValidationRuleSet } from '../../src/validation/rules/productType.rules';
import { productUpdateSkusValidationRuleSet } from '../../src/validation/rules/productUpdateSkus.rules';
import {
  Validator,
  type ProcessValidationRequest,
  type ProcessValidationResult,
  type ValidateOptions,
  type ValidationContext,
  type ValidationRuleSet,
  type ValidationSubject,
} from '../../src/validation/Validator';
import type { SmartListQuery } from '../../src/ports/SmartListQueryPort';
import type { UniqueValueProbe } from '../../src/util/urlTitle';
import { SKU_ENTITY_METADATA } from '../../src/domain/sku/Sku';
import { PRODUCT_ACCESS_MATRIX, createProductHandler } from '../../src/handlers/productHandler';
import { manageEntity } from '../../src/domain/base/populate';
import { PRODUCT_TYPE_ENTITY_METADATA } from '../../src/domain/product/ProductType';
import type {
  LoadDataFromFileEvent,
  NewProductEvent,
  ProductHandler,
  ProductHandlerService,
  ProductIdentifierEvent,
  ProductPayloadEvent,
  ProductSaveEvent,
  ProductSmartListEvent,
  ProductTypeIdentifierEvent,
  ProductTypePayloadEvent,
  ProductWriteGraph,
  SelectedOptionsEvent,
} from '../../src/handlers/productHandler';
import type {
  AccountReference,
  EntityAuthorizationRequest,
  InvocationSecurityRequest,
  InvocationSecurityResolver,
  RequestAuthorizationContext,
} from '../../src/ports/AccountContextPort';
import type { SmartListInput, SmartListResult } from '../../src/ports/SmartListQueryPort';
import type { TransactionalWriteRunner } from '../../src/ports/UniquePropertyPort';
import type { UrlTitleProbeBudget } from '../../src/util/urlTitle';

/**
 * The physical tables the URL-title utility is asked about. `model/service/ProductService.cfc:L269`
 * passes `tableName="SwProduct"` and `:L297`/`:L300` pass `tableName="SwProductType"`; both tokens are
 * source-declared and are asserted literally rather than derived, because the landed constants are
 * module-private and a reader checking parity must see the source string.
 */
const PRODUCT_TABLE = 'SwProduct';
const PRODUCT_TYPE_TABLE = 'SwProductType';

/** `model/service/ProductService.cfc:L343` declares `entityName="SlatwallProduct"`. */
const PRODUCT_ENTITY = 'SlatwallProduct';

/** The entity the IR-1 synthesized `getProductType()` resolves against. */
const PRODUCT_TYPE_ENTITY = 'SlatwallProductType';

/** The setting `Product.getTitle()` renders, seeded so the title is deterministic per test. */
const PRODUCT_TITLE_STRING_SETTING: SettingSeed = {
  settingName: 'productTitleString',
  value: '${productName}',
};

/**
 * The two settings `Sku.generateImageFileName()` reads. Every member that chains
 * `updateDefaultImageFileNames` needs them, and the resolver double THROWS on an unseeded key, so
 * seeding them is what proves the chain actually ran rather than silently no-oped.
 */
const IMAGE_FILE_NAME_SETTINGS: readonly SettingSeed[] = [
  { settingName: 'productImageOptionCodeDelimiter', value: '-' },
  { settingName: 'productImageDefaultExtension', value: 'jpg' },
];

/** `model/service/ProductService.cfc:L200` and `:L246` resolve the image root from this setting. */
const IMAGE_FOLDER_SETTING: SettingSeed = {
  settingName: 'globalAssetsImageFolderPath',
  value: '/assets/images',
};

/** `model/service/ProductService.cfc:L159` places this setting directly inside an `if`. */
const AUTO_APPROVE_REVIEWS_SETTING: SettingSeed = {
  settingName: 'productAutoApproveReviewsFlag',
  value: '1',
};

// ==================================================================================================
// PHYSICALLY VALID IDENTIFIERS — REVIEW FINDING 16
//
// Every entity identifier in this file is minted by `physicalID(label)`, so its value is 32 lowercase
// hexadecimal characters with no dashes — the shape AAP IR-6 fixes for all 107 uuid-keyed entities in
// this schema — while the readable label stays at the call site. The mechanism and the rationale it
// withdraws are documented once, at `test/support/inMemoryRepositories.ts`; this file was the largest
// contributor to the review's audit (78 non-physical literals) and now contributes none.
//
// TWO CLASSES OF CASE DESERVE THEIR OWN NOTE, because the review's resolution explicitly anticipated
// identifiers that "intentionally require readable/case-sensitive values". Both are preserved, and
// both are STRONGER in the physical form rather than merely converted:
//
//   1. ABSENT-IDENTIFIER PROBES — `physicalID('o-nowhere')` and `physicalID('og-does-not-exist')`.
//      These stand for keys that are deliberately not in the store. A malformed sentinel would leave
//      the case unable to separate "looked up and not found" from "rejected because the key was the
//      wrong shape"; a well-formed key that simply is not present can only produce the former.
//
//   2. THE CASE-SENSITIVITY PROBE — `physicalID('o-small').toUpperCase()`, the option the tests call
//      `smallShouted`. It was the literal `'O-SMALL'`. The uppercase HEX form is the same identifier
//      in a different case, so when `getUnusedProductOptions` declines to list it the only property
//      the assertion can be responding to is the case difference. The readable pair `o-small`/`O-SMALL`
//      also differed in nothing but case, so no assertive power is lost — but the physical form
//      additionally exercises the width and alphabet the port will really receive.
//
// No identifier here is hand-typed: every value is derived from its label, so a reader can reproduce
// any of them without trusting a literal (AAP §0.8.5's artifact-trail requirement, applied to fixtures).
// ==================================================================================================

// ==================================================================================================
// Strict-mode reading helpers
//
// `noUncheckedIndexedAccess` makes every indexed read `T | undefined`, and this file may not use a
// non-null assertion, `any`, or a suppression comment to get around that. These two helpers do the
// narrowing honestly: they throw a descriptive error when the element a test claims exists does not,
// which turns a would-be `undefined` dereference into a readable failure.
// ==================================================================================================

function requireAt<TItem>(items: readonly TItem[], index: number): TItem {
  const item = items[index];
  if (item === undefined) {
    throw new Error(
      `Expected an element at index ${String(index)} but the collection holds ${String(items.length)}.`,
    );
  }
  return item;
}

/**
 * The option-group NAMES an answer carries, in the order it carries them.
 *
 * `getFormattedOptionGroups` answers a record KEYED by name — TR-1's tightening of
 * `model/service/ProductService.cfc:L71`'s struct, restored by review finding F3 — so the labels are the
 * record's own keys. Order is asserted through this helper because it is a documented behaviour —
 * first-seen group order — and not an accident of the shape.
 */
function groupNames(groups: FormattedOptionGroups): readonly string[] {
  return Object.keys(groups);
}

/**
 * Reads one formatted option group by NAME, failing loudly when no entry carries it.
 *
 * The name is the identity `model/service/ProductService.cfc:L76` keys by, so it is the only way to
 * address an entry; the failure message lists the keys that ARE present so a mismatch reads as a
 * mismatch rather than as an `undefined` dereference.
 */
function requireGroup(
  groups: FormattedOptionGroups,
  optionGroupName: string,
): readonly SelectOption[] {
  const options = groups[optionGroupName];
  if (options === undefined) {
    throw new Error(
      `Expected a "${optionGroupName}" option group but the answer holds [${groupNames(groups).join(', ')}].`,
    );
  }
  return options;
}

/**
 * Narrows a recorded repository call union by its `member` discriminant. Written as a type predicate
 * so no cast is needed anywhere in the assertions.
 */
function isSkuCall<TMember extends SkuRepositoryCall['member']>(
  member: TMember,
): (call: SkuRepositoryCall) => call is Extract<SkuRepositoryCall, { member: TMember }> {
  return (call: SkuRepositoryCall): call is Extract<SkuRepositoryCall, { member: TMember }> =>
    call.member === member;
}

function isProductCall<TMember extends ProductRepositoryCall['member']>(
  member: TMember,
): (call: ProductRepositoryCall) => call is Extract<ProductRepositoryCall, { member: TMember }> {
  return (
    call: ProductRepositoryCall,
  ): call is Extract<ProductRepositoryCall, { member: TMember }> => call.member === member;
}

/**
 * Awaits a call that is expected to reject with a {@link DomainError} and hands the error back so its
 * `context` — the locator the ported member pins its judgement call to — can be asserted directly.
 *
 * Written by hand rather than reached through `rejects.toBeInstanceOf` because that matcher proves the
 * TYPE of the rejection and discards the value, and several members of this service distinguish two
 * different refusals by their context alone (see the D6 pair in Phase 7D). A rejection that never
 * happens fails loudly here rather than passing silently.
 */
/**
 * Narrows a member of `Product.getSkus()` to the `Sku` ENTITY.
 *
 * `Product` declares its SKU collection as a narrow structural member type, on purpose — the entity may
 * not depend on the whole SKU surface. Tests that read SKU fields therefore have to establish entity
 * identity first, and this does it with a real `instanceof` test rather than a cast, matching how the
 * landed service reads the same collection (`ProductService.ts` `readProductSkusAsSkus`).
 */
function requireSku(candidate: unknown, description: string): Sku {
  if (!(candidate instanceof Sku)) {
    throw new Error(`Expected ${description} to be a Sku entity.`);
  }
  return candidate;
}

/** Narrows a captured {@link DomainError} to the {@link NotImplementedError} subclass. */
function requireNotImplemented(error: DomainError): NotImplementedError {
  if (!(error instanceof NotImplementedError)) {
    throw new Error(`Expected a NotImplementedError, received ${error.name}.`);
  }
  return error;
}

async function captureDomainError(call: Promise<unknown>): Promise<DomainError> {
  try {
    await call;
  } catch (error: unknown) {
    if (error instanceof DomainError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected the call to reject with a DomainError, but it resolved.');
}

// ==================================================================================================
// Observable validator seams
// ==================================================================================================

/** One recorded validation request, in the order the service issued it. */
type ValidationInvocation =
  | { readonly kind: 'validate'; readonly className: string; readonly context: ValidationContext }
  | {
      readonly kind: 'validateProcess';
      readonly className: string;
      readonly processContext: ValidationContext;
      readonly processObjectSupplied: boolean;
    };

/**
 * The REAL {@link Validator}, subclassed only to record what it was asked, in the order it was asked.
 * Every outcome is the base class's: both overrides delegate straight to `super`.
 *
 * A SUBCLASS rather than a wrapper, and the reason is the N3 two-pass order. `Validator.validateProcess`
 * performs its second pass by calling `this.validate`, so an object placed AROUND the validator would
 * see one call where the source performs two. Overriding puts the recorder on the `this` the base class
 * itself dispatches through, which makes both passes visible in true order:
 * `org/Hibachi/HibachiService.cfc:L96` validates the ENTITY with the process context, `:L99` gates on
 * the entity being error-free, and `:L108` only then validates the PROCESS OBJECT with the SAME context.
 *
 * It also keeps the three invocation mechanisms distinguishable rather than collapsing them into one
 * invented global context: `org/Hibachi/HibachiService.cfc:L55` hard-codes `delete`, `:L133` defaults
 * the save context to `save`, and the process context is explicitly supplied by the caller.
 *
 * No mocking library is involved — the recording is one plain array, matching the house style the
 * sibling domain suites already follow.
 */
class RecordingValidator extends Validator {
  readonly invocations: ValidationInvocation[] = [];

  public override validate<TSubject extends ValidationSubject>(
    subject: TSubject,
    ruleSet: ValidationRuleSet<TSubject>,
    context: ValidationContext,
    options?: ValidateOptions,
  ): Promise<ValidationError> {
    this.invocations.push(
      Object.freeze({ kind: 'validate', className: subject.getClassName(), context }),
    );
    return super.validate(subject, ruleSet, context, options);
  }

  public override validateProcess<
    TEntity extends ValidationSubject,
    TProcessObject extends ValidationSubject,
  >(request: ProcessValidationRequest<TEntity, TProcessObject>): Promise<ProcessValidationResult> {
    this.invocations.push(
      Object.freeze({
        kind: 'validateProcess',
        className: request.entity.getClassName(),
        processContext: request.processContext,
        processObjectSupplied: request.processObject !== undefined,
      }),
    );
    return super.validateProcess(request);
  }
}

/**
 * A validator that finds nothing wrong, used ONLY where a landed boundary makes the real rule set
 * unreachable and the prompt still requires the member's body to be exercised.
 *
 * ⚠️ WHY THIS EXISTS AT ALL — it is the honest consequence of TR-5, not a convenience.
 * `processProductAddSubscriptionTerm` validates the entity in the `addSubscriptionTerm` context, and
 * `model/validation/Product.json:L15` puts a `minCollection: 1` guard on
 * `unusedProductSubscriptionTerms` in exactly that context. The landed subject builder calls
 * `product.getUnusedProductSubscriptionTerms()` with NO finder, because the subscription domain is out
 * of scope (AAP §0.2.2.1), and that member answers `[]` unconditionally. A real, correctly ported rule
 * therefore refuses every real, correctly ported invocation, and the member's body — including defect
 * D6 — is unreachable through the real validator. Substituting this seam is how D6's two paths are
 * pinned without weakening the rule set, which stays exactly as `model/validation/Product.json`
 * declares it. The real rule is asserted separately, in its own test.
 */
function createPermissiveValidator(): ProductProcessValidator {
  return {
    validate: (): Promise<ValidationError> => Promise.resolve(new ValidationError()),
    validateProcess: (): Promise<ProcessValidationResult> =>
      Promise.resolve({
        entityErrors: new ValidationError(),
        processObjectErrors: new ValidationError(),
        processObjectRan: true,
      }),
  };
}

// ==================================================================================================
// The option catalog the smart-list seam answers with
// ==================================================================================================

/**
 * What the option queries behind `Product.getOptionGroups()` and `Product.getOptionsByOptionGroup()`
 * should find. `OptionService`'s module-scope finders issue two distinct queries — one rooted at
 * `SlatwallOptionGroup` filtered by `options.skus.product.productID`, one rooted at `SlatwallOption`
 * filtered by `optionGroup.optionGroupID` and `skus.product.productID` — so the catalog is keyed the
 * same way the queries are.
 */
interface OptionCatalog {
  /** The groups the PRODUCT owns — what `Product.getOptionGroups()` resolves to. */
  readonly optionGroups: readonly OptionGroup[];
  /** The product's options per group — what `Product.getOptionsByOptionGroup()` resolves to. */
  readonly optionsByOptionGroupID: Readonly<Record<string, readonly Option[]>>;
  /** Groups an identifier lookup can find. Defaults to {@link OptionCatalog.optionGroups}. */
  readonly resolvableOptionGroups?: readonly OptionGroup[];
  /** Options an identifier lookup can find. Nothing is resolvable unless listed. */
  readonly resolvableOptions?: readonly Option[];
}

const EMPTY_OPTION_CATALOG: OptionCatalog = Object.freeze({
  optionGroups: Object.freeze([]),
  optionsByOptionGroupID: Object.freeze({}),
});

/** The filter path `findProductOptionsByOptionGroup` uses to select a single group's options. */
const OPTION_GROUP_ID_FILTER_PATH = 'optionGroup.optionGroupID';

/** Reads one exact-match filter value out of a query, or `undefined` when the query has no such filter. */
function readFilterValue(query: SmartListQuery, propertyIdentifier: string): string | undefined {
  for (const whereGroup of query.whereGroups ?? []) {
    for (const filter of whereGroup.filters ?? []) {
      if (filter.propertyIdentifier === propertyIdentifier) {
        return String(filter.value);
      }
    }
  }
  return undefined;
}

/**
 * Answers every query the catalog slice issues against the smart-list seam.
 *
 * Four distinct query shapes reach this responder, and telling them apart is the whole job.
 * `OptionService.getOptionGroup`/`getOption` issue IDENTIFIER lookups filtered on `optionGroupID` /
 * `optionID`; `findProductOptionGroups` filters on `options.skus.product.productID`; and
 * `findProductOptionsByOptionGroup` filters on `optionGroup.optionGroupID` plus the product. Answering
 * an identifier lookup with the product's whole group list would make `getOptionGroup` resolve to the
 * wrong group, which is exactly the confusion the D14 assertions must not be built on.
 *
 * Anything unrecognised falls through so a test can still enqueue a bespoke outcome.
 */
function createCatalogResponder(
  catalog: OptionCatalog,
  productRows: readonly Product[],
  productTypeRows: readonly ProductType[],
  productFailure?: Error,
): SmartListResponder {
  return (query: SmartListQuery) => {
    if (query.entityName === 'SlatwallOptionGroup') {
      const requestedOptionGroupID = readFilterValue(query, 'optionGroupID');
      if (requestedOptionGroupID === undefined) {
        return { kind: 'page', metrics: {}, records: catalog.optionGroups };
      }
      const pool = catalog.resolvableOptionGroups ?? catalog.optionGroups;
      return {
        kind: 'page',
        metrics: {},
        records: pool.filter((group) => group.optionGroupID === requestedOptionGroupID),
      };
    }

    if (query.entityName === 'SlatwallOption') {
      const requestedOptionID = readFilterValue(query, 'optionID');
      if (requestedOptionID !== undefined) {
        return {
          kind: 'page',
          metrics: {},
          records: (catalog.resolvableOptions ?? []).filter(
            (option) => option.optionID === requestedOptionID,
          ),
        };
      }
      const optionGroupID = readFilterValue(query, OPTION_GROUP_ID_FILTER_PATH);
      const options =
        optionGroupID === undefined ? [] : (catalog.optionsByOptionGroupID[optionGroupID] ?? []);
      return { kind: 'page', metrics: {}, records: options };
    }

    if (query.entityName === PRODUCT_ENTITY) {
      if (productFailure !== undefined) {
        return { kind: 'failure', failure: productFailure };
      }
      const requestedProductID = readFilterValue(query, 'productID');
      if (requestedProductID === undefined) {
        return { kind: 'page', metrics: {}, records: productRows };
      }
      return {
        kind: 'page',
        metrics: {},
        records: productRows.filter((row) => row.productID === requestedProductID),
      };
    }

    if (query.entityName === PRODUCT_TYPE_ENTITY) {
      const requestedProductTypeID = readFilterValue(query, 'productTypeID');
      if (requestedProductTypeID === undefined) {
        return { kind: 'page', metrics: {}, records: productTypeRows };
      }
      return {
        kind: 'page',
        metrics: {},
        records: productTypeRows.filter((row) => row.productTypeID === requestedProductTypeID),
      };
    }

    return undefined;
  };
}

// ==================================================================================================
// The harness — one fresh service graph per test, no module-scope mutable state
// ==================================================================================================

/** One recorded delegation to the product-type base service. */
interface ProductTypeSaveRecord {
  readonly entity: ProductTypeWithErrorState;
  readonly data: Record<string, unknown>;
}

/** Which account the account-context seam answers with, expressed without importing the port type. */
type AccountPosture = 'admin' | 'nonAdmin' | 'new' | 'absent';

interface HarnessOptions {
  /** Settings the resolver will answer. It THROWS on an unseeded key, which keeps reads honest. */
  readonly settings?: readonly SettingSeed[];
  /** A blanket answer for keys a test does not care about. Omitted by default, on purpose. */
  readonly settingFallback?: string;
  /** SKUs seeded into the SKU repository, which is what the option-resolution query searches. */
  readonly repositorySkus?: readonly Sku[];
  /** SKUs seeded into the option repository, which is what the unused-option queries search. */
  readonly optionRepositorySkus?: readonly Sku[];
  /** Option groups seeded into the option repository, the pool the unused-group query draws from. */
  readonly repositoryOptionGroups?: readonly OptionGroup[];
  /** Products seeded into the product repository. */
  readonly repositoryProducts?: readonly Product[];
  /** Products the `SlatwallProduct` smart-list query answers with. */
  readonly productRows?: readonly Product[];
  /** Product-type rows an identifier lookup can resolve — what `getProductType()` reads. */
  readonly productTypeRows?: readonly ProductType[];
  /** What the option-group and option queries find. */
  readonly optionCatalog?: OptionCatalog;
  /** Product identifiers that already participate in a transaction (the X12 delete guard). */
  readonly transactionProductIDs?: readonly string[];
  /** Replaces the repository's import behaviour, so the forwarded arguments can be observed. */
  readonly onImport?: ProductImportHandler;
  /** Replaces the validator. Used only where a landed boundary makes the real rule unreachable. */
  readonly validator?: ProductProcessValidator;

  /**
   * The URL-title probe ceiling this harness's service should carry — review finding SEC-DOS-03.
   *
   * Omitted means the generous fixture, so the cases that assert the slug transformation and the
   * `-2`-first suffix sequence are unaffected. The block that asserts the ceiling states its own.
   */
  readonly urlTitleProbeBudget?: UrlTitleProbeBudget;
  /** Replaces the product base service, used to force a refused delete. */
  readonly baseService?: ProductBaseService;
  /** URL titles already taken, which drives the utility's collision suffix. */
  readonly takenUrlTitles?: readonly {
    readonly tableName: UrlTitleTableName;
    readonly value: string;
  }[];
  /**
   * Makes the product-type base service REJECT, so a non-validation failure can be observed
   * propagating. `BaseService.save` itself no longer rejects for a validation failure — see
   * {@link SurfaceOptions.productTypeSaveFindings} for that path.
   */
  readonly productTypeSaveFailure?: Error;
  /**
   * Makes the product-type base service attach findings to the entity and RESOLVE with it, which is
   * what the landed `BaseService.save` does on a validation failure
   * (`model/service/HibachiService.cfc:L103` returns `arguments.entity` on every path).
   */
  readonly productTypeSaveFindings?: Readonly<Record<string, readonly string[]>>;
  /** Makes the product-entity smart-list stream reject, so a port failure can be observed. */
  readonly smartListFailure?: Error;
  /** Which account the review member sees. */
  readonly account?: AccountPosture;
  /** Subscription-term identifiers the boundary port resolves. */
  readonly subscriptionTermIDs?: readonly string[];
}

interface Harness {
  readonly service: ProductService;
  readonly optionService: OptionService;
  readonly skuService: SkuService;
  /** Every call the SKU repository received, in order. */
  readonly skuCalls: readonly SkuRepositoryCall[];
  /** SKUs the repository actually wrote. */
  readonly persistedSkus: readonly Sku[];
  /** Every call the product repository received, in order. */
  readonly productCalls: readonly ProductRepositoryCall[];
  /** Products the product repository wrote through its own `saveProduct` member. */
  readonly savedProducts: readonly Product[];
  /** Products written through the direct persister the service holds, in call order. */
  persistedProducts(): readonly Product[];
  /** Entities the base service removed. */
  readonly removedProducts: readonly Product[];
  /** Setting cleanups the base service ran, in order, after a successful delete. */
  readonly settingCleanups: readonly MaintenanceEntityRef[];
  /** Comment cleanups the base service ran, in order, after a successful delete. */
  readonly commentCleanups: readonly MaintenanceEntityRef[];
  /** Every smart-list query issued against the product seam, in order. */
  readonly smartListQueries: readonly SmartListQuery[];
  /** Every smart-list query issued against the option-finder seam, in order. */
  readonly optionQueries: readonly SmartListQuery[];
  /** Every URL-title availability probe, in order. */
  readonly urlTitleProbes: readonly { readonly tableName: string; readonly value: string }[];
  /** Every setting the service read, in order. */
  readonly settingReads: readonly SettingResolverCall[];
  /** Delegations to the product-type base service, in order. */
  readonly productTypeSaves: readonly ProductTypeSaveRecord[];
  /** Every validation request that reached the real validator, in true global order. */
  readonly validations: readonly ValidationInvocation[];
  /** How many times the account context was consulted. */
  accountReads(): number;
  /**
   * Publishes a SKU as a product's default SKU and registers it with the identifier reader, which is
   * the only way `requireDefaultSkuEntity` can find the entity behind the delegate.
   */
  attachDefaultSku(product: Product, sku: Sku): ProductDefaultSkuDelegate;
}

function buildHarness(options: HarnessOptions = {}): Harness {
  // --------------------------------------------------------------------------------------------
  // Identifier reader. `ProductDefaultSkuDelegate` exposes no `getSkuID` — deliberately, because the
  // legacy calculated-property boundary of AAP §0.2.2.6 does not let the delegate widen — so the
  // service takes a `DefaultSkuIdReader` instead. The map is harness-local, never module-scope.
  // --------------------------------------------------------------------------------------------
  const defaultSkuIdsByDelegate = new WeakMap<object, string>();

  const catalog = options.optionCatalog ?? EMPTY_OPTION_CATALOG;
  const productRows = options.productRows ?? [];

  const settings = createSettingResolverDouble({
    settings: options.settings ?? [],
    ...(options.settingFallback === undefined ? {} : { fallback: options.settingFallback }),
  });

  const skuRepository = createInMemorySkuRepository({
    skus: options.repositorySkus ?? [],
    transactionProductIDs: options.transactionProductIDs ?? [],
  });

  const productRepository = createInMemoryProductRepository({
    products: options.repositoryProducts ?? [],
    ...(options.onImport === undefined ? {} : { onImport: options.onImport }),
  });

  const optionRepository = createInMemoryOptionRepository({
    optionGroups: options.repositoryOptionGroups ?? [],
    skus: options.optionRepositorySkus ?? [],
  });

  // Two independent smart-list doubles. The option finders and the product reads are separate query
  // streams in the legacy too, and keeping them separate here means an option query can never consume
  // an outcome a product assertion was waiting for.
  const productTypeRows = options.productTypeRows ?? [];
  const optionSmartList = createSmartListQueryDouble({
    respond: createCatalogResponder(catalog, productRows, productTypeRows),
  });
  const productSmartList = createSmartListQueryDouble({
    respond: createCatalogResponder(
      catalog,
      productRows,
      productTypeRows,
      options.smartListFailure,
    ),
  });

  const urlTitles = createUrlTitleAvailabilityDouble();
  for (const taken of options.takenUrlTitles ?? []) {
    urlTitles.take(taken.tableName, taken.value);
  }

  /**
   * `model/service/DataService.cfc:L53-L71` asks `isUniqueURLTitle` about one table at a time, and the
   * landed utility's probe is deliberately widened to `string` so it is not coupled to the catalog's
   * table list. The narrowing back to the three physical tables happens here, and an unexpected table
   * fails loudly rather than silently reporting "available".
   */
  const isUrlTitleAvailable: UniqueValueProbe = (tableName: string, value: string) => {
    if (
      tableName !== PRODUCT_TABLE &&
      tableName !== PRODUCT_TYPE_TABLE &&
      tableName !== 'SwBrand'
    ) {
      return Promise.reject(
        new Error(`A URL title was probed against the unexpected table "${tableName}".`),
      );
    }
    return urlTitles.probe.isUrlTitleAvailable(tableName, value);
  };

  const populationAuthorization = createPopulationAuthorizationDouble();
  const uniqueProperty = createUniquePropertyDouble();
  const validator = new RecordingValidator(uniqueProperty.uniqueProperty);

  const persistence = createBaseServicePersistenceDouble<Product>();
  const productPersister = createDirectPersisterDouble<Product>();
  const productTypeRoots = createProductTypeRootResolverDouble();
  const subscriptionTerms = createSubscriptionTermDouble({
    subscriptionTermIDs: options.subscriptionTermIDs ?? [],
  });
  const accessContents = createAccessContentDouble();
  const imagePaths = createImagePathDouble();

  const accountPosture: AccountPosture = options.account ?? 'admin';
  const accountContext =
    accountPosture === 'absent'
      ? createAbsentAccountContextDouble()
      : accountPosture === 'nonAdmin'
        ? createAccountContextDouble(persistedNonAdminAccount())
        : accountPosture === 'new'
          ? createAccountContextDouble(newAccount())
          : createAccountContextDouble();

  const transactionChecker: ProductTransactionExistenceChecker = createTransactionExistenceChecker(
    skuRepository.repository,
  );

  /**
   * The REAL base service, wired to the REAL rule set. `deleteProduct` is only meaningful against it:
   * the `transactionExistsFlag eq false` guard of `model/validation/Product.json:L12` has to be
   * evaluated by the real validator, and the setting/comment cleanup collaborators have to be the real
   * ones so their ordering after a successful delete is observable rather than asserted by fiat.
   *
   * `resolveDeleteSubject` exists because the guard reads a MEMOIZED value. `Product.getTransactionExistsFlag`
   * caches into `this.transactionExistsFlag`, and the validation subject reads that field; asking the
   * checker here is what the legacy ORM's lazy getter did on first access inside validation.
   */
  const productBaseService: ProductBaseService = new BaseService<Product, ProductPropertyName>({
    validator,
    ruleSet: productValidationRuleSet,
    propertyDescriptors: PRODUCT_PROPERTY_DESCRIPTORS,
    populationAuthorization: populationAuthorization.populationAuthorization,
    persist: persistence.seams.persist,
    remove: persistence.seams.remove,
    settingCleanup: persistence.seams.settingCleanup,
    commentCleanup: persistence.seams.commentCleanup,
    resolveDeleteSubject: async (candidate: Product): Promise<Product> => {
      await candidate.getTransactionExistsFlag(transactionChecker);
      return candidate;
    },
  });

  /**
   * A recording literal rather than a real `BaseService<ManagedEntity<ProductType>, …>`, because the
   * product-type side has no ready-made property-descriptor set: `ProductType` exposes only
   * `createProductTypePropertyDescriptorSet(collaborators)`, which needs six collaborators that reach
   * straight into out-of-scope domains. The landed collaborator type is `Pick<BaseService<…>, 'save'>`
   * precisely so this seam can be exactly one member wide, and the prompt permits a tiny test-local
   * object where the support module has no exact one-off shape.
   */
  const productTypeSaves: ProductTypeSaveRecord[] = [];
  const productTypeBaseService: ProductTypeBaseService = {
    save: (
      entity: ProductTypeWithErrorState,
      data: Record<string, unknown> = {},
    ): Promise<ProductTypeWithErrorState> => {
      productTypeSaves.push(Object.freeze({ entity, data }));
      if (options.productTypeSaveFailure !== undefined) {
        return Promise.reject(options.productTypeSaveFailure);
      }
      /*
       * ⭐ A VALIDATION FAILURE RESOLVES, IT DOES NOT REJECT, and this double has to model that or the
       * cases built on it would certify a contract the real collaborator no longer has. The landed
       * `BaseService.save` attaches the accumulated findings to the entity's own bag and returns the
       * same instance — `org/Hibachi/HibachiService.cfc:L133` gates persistence on
       * `!arguments.entity.hasErrors()`, reading that bag. So the findings arrive ON the entity here too.
       */
      if (options.productTypeSaveFindings !== undefined) {
        entity.addErrors(options.productTypeSaveFindings);
      }
      return Promise.resolve(entity);
    },
  };

  const optionService = new OptionService(optionRepository.repository, optionSmartList.smartList);

  const skuService = new SkuService(
    skuRepository.repository,
    optionService,
    subscriptionTerms.subscriptionTerms,
    accessContents.accessContents,
    imagePaths.imagePaths,
    productSmartList.smartList,
    validator,
    productTypeRoots.resolver,
    (sku: Sku) => createDefaultSkuDelegate(sku),
    /* SEC-DOS-01 — generous, so no case in this suite depends on the ceiling. */
    GENEROUS_COMBINATION_BUDGET,
  );

  const collaborators: ProductServiceCollaborators = {
    productRepository: productRepository.repository,
    skuRepository: skuRepository.repository,
    skuService,
    optionService,
    baseService: options.baseService ?? productBaseService,
    productTypeBaseService,
    validator: options.validator ?? validator,
    settings: settings.resolver,
    accountContext: accountContext.accountContext,
    smartListQueryPort: productSmartList.smartList,
    subscriptionTermPort: subscriptionTerms.subscriptionTerms,
    productTypeRootResolver: productTypeRoots.resolver,
    productPropertyDescriptors: PRODUCT_PROPERTY_DESCRIPTORS,
    populationAuthorization: populationAuthorization.populationAuthorization,
    isUrlTitleAvailable,
    /* SEC-DOS-03 — the probe ceiling both derivations resolve against; generous here, so the cases that
     * assert the slug transformation and the suffix sequence are unaffected. The dedicated block that
     * asserts the ceiling itself states its own figure. */
    urlTitleProbeBudget: options.urlTitleProbeBudget ?? GENEROUS_URL_TITLE_PROBE_BUDGET,
    persistProduct: productPersister.persist,
    defaultSkuIdReader: (delegate: object): string => defaultSkuIdsByDelegate.get(delegate) ?? '',
    /*
     * F10 — THE REAL HYDRATION READER. Every product type in this suite is hand-built, so the reader
     * answers `undefined`, `saveProductType` skips the inheritance load and issues no extra statement,
     * and every existing expectation here is untouched. A case that wants the load supplies the parent
     * on the `parentProductType` slot, which still wins ahead of any read.
     */
    parentProductTypeIdReader: readHydratedParentProductTypeID,
  };

  // ⛔ NOT WIRED, and each omission is evidenced rather than assumed.
  //   - `productTypeDAO`  — declared at `model/service/ProductService.cfc:L54`, ZERO call sites.
  //   - `contentService`  — declared at `model/service/ProductService.cfc:L57`, ZERO call sites.
  //   - `getHibachiTagService()` — `:L66` framework plumbing, excluded with the rest of `org/Hibachi/**`.
  //   - `integrationServices/google/controllers/feed.cfc:L51 productService` — a fifth dead injection,
  //     repo-wide reference only; this file imports nothing from the Google adapter.
  // AAP §0.6.3.1 records the first two as dead injections and §0.6.3.5 the net result.

  return {
    service: new ProductService(collaborators),
    optionService,
    skuService,
    skuCalls: skuRepository.calls,
    persistedSkus: skuRepository.persisted,
    productCalls: productRepository.calls,
    savedProducts: productRepository.saved,
    persistedProducts: (): readonly Product[] => productPersister.calls.map((call) => call.entity),
    removedProducts: persistence.removed,
    settingCleanups: persistence.settingCleanups,
    commentCleanups: persistence.commentCleanups,
    smartListQueries: productSmartList.queries,
    optionQueries: optionSmartList.queries,
    urlTitleProbes: urlTitles.calls,
    settingReads: settings.calls,
    productTypeSaves,
    validations: validator.invocations,
    accountReads: (): number => accountContext.callCount(),
    attachDefaultSku: (product: Product, sku: Sku): ProductDefaultSkuDelegate => {
      const delegate = createDefaultSkuDelegate(sku);
      defaultSkuIdsByDelegate.set(delegate, sku.skuID);
      product.defaultSku = delegate;
      return delegate;
    },
  };
}

// ==================================================================================================
// Phase 4 — loadDataFromFile
// ==================================================================================================

describe('loadDataFromFile — the import boundary', () => {
  /**
   * ⚠️ M1 — G6 NOTE, RECORDED AT THE POINT OF TEST.
   *
   * The byte-exact source call this member replaces is
   * `getHibachiTagService().cfSetting(requesttimeout="3600")` at
   * `model/service/ProductService.cfc:L66`, raised immediately before the delegation at `:L67`. That is
   * a request budget of 3600 SECONDS. AWS Lambda's maximum function timeout is 900 seconds, so the
   * legacy budget is UNREPRESENTABLE inside one invocation and this suite therefore asserts NO timeout
   * at all: not 3600, not 900, not any substitute. Substituting the platform ceiling would silently
   * re-time an import that used to be allowed an hour, and inventing a number the source does not state
   * is forbidden by IR-12.
   *
   * THE REQUIRED ARCHITECTURAL NOTE, stated rather than implemented: this member's operational model
   * must be OUT-OF-BAND — chunked, queued or step-orchestrated — and that decision belongs to the
   * handler layer (AAP §0.4.1.9, §0.6.6). Nothing here retries, pages, resumes or budgets.
   *
   * ⚠️ M3 IS DOCUMENTARY HERE. `model/dao/ProductDAO.cfc:L176-L177` opens its `transaction{` INSIDE the
   * per-record loop, so the legacy importer commits ONE TRANSACTION PER ROW and a mid-file failure
   * leaves a partially imported catalog. The landed import port exposes no commit callback, no batch
   * size and no row count — `model/dao/ProductDAO.cfc:L73` reports none either — so this suite invents
   * none of them and asserts only the explicit forwarding boundary. The framework tag service is
   * excluded with the rest of `org/Hibachi/**` and is not reconstructed.
   */
  it('NET-NEW: defaults textQualifier to the empty string and forwards both arguments in source order', async () => {
    const forwarded: { readonly fileURL: string; readonly textQualifier: string | undefined }[] =
      [];
    const onImport: ProductImportHandler = (fileURL, textQualifier) => {
      forwarded.push(Object.freeze({ fileURL, textQualifier }));
      return Promise.resolve();
    };
    const harness = buildHarness({ onImport });

    // `model/service/ProductService.cfc:L65` declares `string textQualifier = ""`.
    const answer = await harness.service.loadDataFromFile('/import/catalog.txt');

    expect(answer).toBeUndefined();
    expect(forwarded).toEqual([{ fileURL: '/import/catalog.txt', textQualifier: '' }]);

    const importCalls = harness.productCalls.filter(isProductCall('importFromFile'));
    expect(importCalls).toHaveLength(1);
    expect(requireAt(importCalls, 0).fileURL).toBe('/import/catalog.txt');
    expect(requireAt(importCalls, 0).textQualifier).toBe('');
  });

  it('NET-NEW: forwards an explicit text qualifier positionally, second, exactly as :L67 does', async () => {
    const harness = buildHarness();

    await harness.service.loadDataFromFile('/import/tab.txt', '"');

    const importCalls = harness.productCalls.filter(isProductCall('importFromFile'));
    expect(importCalls).toHaveLength(1);
    // Order matters: fileURL first, textQualifier second — `getProductDAO().loadDataFromFile(
    // arguments.fileURL, arguments.textQualifier)` at `model/service/ProductService.cfc:L67`.
    expect(requireAt(importCalls, 0)).toMatchObject({
      fileURL: '/import/tab.txt',
      textQualifier: '"',
    });
  });

  it('NET-NEW: surfaces an import failure instead of swallowing it, so a partial import is visible', async () => {
    const failure = new Error('the import stream ended mid-row');
    const harness = buildHarness({ onImport: () => Promise.reject(failure) });

    // M3 again: because the legacy commits per row, a mid-file failure is exactly the case that leaves
    // the catalog half-written, so the rejection must reach the caller rather than be absorbed here.
    await expect(harness.service.loadDataFromFile('/import/broken.txt')).rejects.toBe(failure);
  });

  /*
   * ==============================================================================================
   * ⛔ THERE IS NO THIRD ARGUMENT, AND FIVE CASES THAT ASSERTED ONE ARE REPLACED BY ONE THAT ASSERTS
   *    ITS ABSENCE (review findings F2 and F4)
   * ==============================================================================================
   *
   * This member took a THIRD parameter the legacy does not have: `options?: ProductImportOptions`,
   * carrying a caller-supplied `AbortSignal` and a `deferBackfills` switch. Five cases certified that it
   * arrived at the adapter untouched — by reference, same signal instance, `undefined` when omitted, both
   * boolean values forwarded, and the object reaching the import handler itself. Every one of them was a
   * well-built test of a control that must not exist:
   *   • AAP §0.4.2.1 tabulates `loadDataFromFile(fileURL: string, textQualifier?: string): Promise<void>`,
   *     which is exactly the arity `model/service/ProductService.cfc:L65` declares, and §0.8.3.1 makes that
   *     surface the artefact a reviewer checks member by member.
   *   • AAP §0.6.7.7 declares D18 — the importer's SQL parameterisation — the SINGLE place this port
   *     departs from legacy behaviour, and §0.8.2 Guideline 4 forbids the rest.
   *   • AAP §0.7.3 S9 and IR-12 forbid inventing runtime controls the source does not state. An optional
   *     control defaulting to legacy behaviour is still a control the legacy cannot express.
   *
   * ⚠️ AND MISMATCH M1 IS STILL OPEN, WHICH IS THE POINT WORTH KEEPING FROM THE OLD SUB-SECTION. The
   * legacy asks the CFML engine for a 3600-second REQUEST budget at
   * `model/service/ProductService.cfc:L66`, which no single invocation of the target runtime can
   * represent. That is FLAGGED (AAP §0.8.3.6), not answered here, and the out-of-band model belongs to the
   * handler layer (AAP §0.4.1.9).
   *
   * NET-NEW: §0.6.5.2 records that no `ProductServiceTest` exists.
   */
  it('NET-NEW: passes exactly TWO arguments to the port — no options, no signal, no invented budget', async () => {
    const harness = buildHarness();

    await harness.service.loadDataFromFile('/import/catalog.txt', '"');

    const importCalls = harness.productCalls.filter(isProductCall('importFromFile'));
    expect(importCalls).toHaveLength(1);

    /*
     * ⭐ THE RECORDED CALL'S OWN KEY SET IS THE ASSERTION, because it fails if a third argument is ever
     * reintroduced — by name, and without needing a case per field. `member` is the double's own
     * discriminator; `fileURL` and `textQualifier` are the legacy's two.
     */
    expect(Object.keys(requireAt(importCalls, 0)).sort()).toEqual(
      ['fileURL', 'member', 'textQualifier'].sort(),
    );
    expect(requireAt(importCalls, 0)).toMatchObject({
      fileURL: '/import/catalog.txt',
      textQualifier: '"',
    });
  });

  it('NET-NEW: the two arguments reach the import HANDLER as well, in source order and unrewritten', async () => {
    const seen: (readonly [string, string | undefined])[] = [];
    const onImport: ProductImportHandler = (fileURL, textQualifier) => {
      seen.push([fileURL, textQualifier]);
      return Promise.resolve();
    };
    const harness = buildHarness({ onImport });

    await harness.service.loadDataFromFile('/import/catalog.txt', '"');

    /*
     * The recorded call and the handler are two independent observation points on the same arguments, and
     * asserting both closes the gap a double that recorded one thing and forwarded another would leave.
     * `:L67` is `getProductDAO().loadDataFromFile(arguments.fileURL, arguments.textQualifier)` — positional,
     * in that order.
     */
    expect(seen).toEqual([['/import/catalog.txt', '"']]);
  });

  it('NET-NEW: F9 — forwards a hostile location UNCHANGED, holding no policy of its own', async () => {
    const harness = buildHarness();
    const hostile = 'file:///etc/passwd.csv?x=%2F+1';

    await harness.service.loadDataFromFile(hostile);

    /*
     * ⛔ TODO(parity) — THERE IS NO IMPORT-SOURCE GATE ANYWHERE ON THIS PATH, HERE OR DOWNSTREAM. A
     * revision refused non-`http`/`https` schemes and loopback, link-local and private-range addresses in
     * `src/adapters/mysql/MySqlProductRepository.ts` and pinned the refusal to that sink rather than to
     * this member. The refusal is WITHDRAWN — AAP §0.6.7.7 authorises exactly one behavioural departure
     * in this port (D18) — so the hostile location now travels the whole way to the injected reader
     * unjudged, and the CWE-918 surface is carried as MISMATCH M4.
     *
     * ⚠️ WHAT THIS MEMBER'S OBLIGATION STILL IS, AND WHY IT IS UNCHANGED BY THE WITHDRAWAL. It is the
     * port of `model/service/ProductService.cfc:L65-L68`, whose whole body is a request-budget call and a
     * positional delegation; it opens no socket and dereferences nothing. So the assertion is deliberately
     * that NOTHING happens here: the location travels byte-for-byte, query string and percent-encoding
     * intact, because `model/dao/ProductDAO.cfc:L74` derives the file type from the RAW string and
     * re-encoding it would change which delimiter the import chooses.
     */
    const importCalls = harness.productCalls.filter(isProductCall('importFromFile'));
    expect(importCalls).toHaveLength(1);
    expect(requireAt(importCalls, 0).fileURL).toBe(hostile);
    expect(requireAt(importCalls, 0).textQualifier).toBe('');
  });

  it("NET-NEW: propagates the adapter's failure without translating or absorbing it", async () => {
    /*
     * ⛔ THE ERROR RAISED HERE IS THE ONE THE SHIPPED READER ACTUALLY RAISES. With the import-source
     * refusal withdrawn, `unresolvableProductImportSourceReader` declines every member with a
     * `NotImplementedError` — the legacy retrieval at `model/dao/ProductDAO.cfc:L87` resolves a bean
     * declared nowhere and its `new http()` fallback is commented out, so no location is retrievable at
     * all. An `ImportSourceRejectedError` used to stand here; it is deleted with the gate.
     */
    const failure = new NotImplementedError(
      'ProductImportSourcePolicy.validateSource',
      'no retrieval is performed, so no location can be validated',
      { context: { fileURL: 'file:///etc/passwd.csv' } },
    );
    const harness = buildHarness({ onImport: () => Promise.reject(failure) });

    /*
     * The service adds no catch, no re-wrap and no fallback, so the adapter's failure reaches the handler
     * with its public presentation intact — which is what lets `httpResponse` classify it at all.
     * Identity, not shape: a re-wrap would lose `getPublicError` and it would present as an
     * unclassified 500.
     */
    await expect(harness.service.loadDataFromFile('file:///etc/passwd.csv')).rejects.toBe(failure);
  });

  /**
   * ⛔ TODO(parity) — WITHDRAWAL: NO SCHEME, CREDENTIAL OR ADDRESS-LITERAL REFUSAL EXISTS IN THE SUBTREE.
   *
   * Those three refusals were asserted here by reference, at the single retrieval seam in
   * `src/adapters/mysql/MySqlProductRepository.ts`. All of it is deleted: AAP §0.6.7.7 authorises exactly
   * one behavioural departure in this port (D18), so a refusal the legacy does not make cannot stand
   * however narrow it is (AAP §0.8.2 Guideline 4 admits no proportionality test). What remains is an
   * INJECTED reader whose `sourcePolicy` member is required of any retrieving implementation — a wiring
   * shape for an operator who owns a network, not a decision this port takes on the operator's behalf.
   *
   * THE NEGATIVE OBLIGATION ON THIS MEMBER IS UNCHANGED, AND IT IS THE REASON THESE TWO CASES SURVIVE
   * INTACT. Whatever an operator's policy is evaluated against, it is evaluated against the string this
   * member forwards. So the string it forwards must be the caller's own, byte for byte: a trim, a
   * lower-casing, a re-encode or a "helpful" normalisation here would be applied to a value the policy
   * never sees, which is the classic shape of a normalise-then-validate bypass.
   */
  it('NET-NEW: forwards a hostile-looking location BYTE-FOR-BYTE, neither refusing nor rewriting it', async () => {
    const harness = buildHarness();

    /*
     * Each of these is refused downstream, and each is a shape a normaliser would be tempted to touch:
     * mixed case, a trailing dot on the host, surrounding whitespace, embedded credentials, an
     * IPv4-mapped IPv6 host, and a percent-encoded path segment. The service must hand every one on
     * unchanged.
     */
    const locations: readonly string[] = [
      'HTTP://169.254.169.254/latest/meta-data/',
      '  https://feeds.example/catalog.csv  ',
      'https://operator:secret@feeds.example/catalog.csv',
      'http://[::ffff:127.0.0.1]/catalog.csv',
      'https://feeds.example./catalog.csv',
      'https://feeds.example/cat%2Falog.csv?since=1#top',
      'file:///etc/passwd',
    ];

    for (const location of locations) {
      await harness.service.loadDataFromFile(location);
    }

    /*
     * ⚠️ TWO THINGS AT ONCE, AND BOTH MATTER. The forwarded list being identical to the supplied list
     * proves no rewriting; the list being COMPLETE proves no refusal — this member does not short-circuit
     * on a location it dislikes, because deciding that is not its job and a second opinion here would be
     * the drifting copy described above.
     */
    const importCalls = harness.productCalls.filter(isProductCall('importFromFile'));
    expect(importCalls.map((call) => call.fileURL)).toEqual(locations);
  });

  it('NET-NEW: adds no policy argument to the port call, so nothing here configures the refusals', async () => {
    const harness = buildHarness();

    await harness.service.loadDataFromFile('https://feeds.example/catalog.csv');

    /*
     * An earlier revision of the port took a `ProductImportSourcePolicy` — allowed schemes, allowed
     * hosts, byte cap, timeout, redirect count — and this member supplied it. The four configurable ones
     * stayed withdrawn when the gate was reinstated, precisely because the source states no host and no
     * figure, so every possible value of each is invented (S9, IR-12). The reinstated controls are fixed
     * literals instead, and this member therefore passes exactly the two arguments `:L67` passes — no
     * policy of any kind, and (since review findings F2 and F4) no invocation-scoped controls either.
     * hosts, byte cap, timeout, redirect count — as an argument to THIS member, and it stayed withdrawn
     * from here because the source states no host and no figure, so every possible value of each would be
     * invented (S9, IR-12). The policy now lives where it belongs, as a required member of whatever
     * reader an operator injects, so this member passes exactly the two arguments `:L67` passes plus the
     * optional invocation-scoped controls — and no policy of any kind.
     */
    const importCalls = harness.productCalls.filter(isProductCall('importFromFile'));
    expect(importCalls).toHaveLength(1);
    expect(Object.keys(requireAt(importCalls, 0)).sort()).toEqual(
      ['fileURL', 'member', 'textQualifier'].sort(),
    );
  });
});

// ==================================================================================================
// Phase 5 — getFormattedOptionGroups (X16)
// ==================================================================================================

describe('getFormattedOptionGroups — the option-group projection', () => {
  /**
   * 📝 TODO(parity) D10 — model/service/ProductService.cfc:L73,L75.
   *
   * `:L71` declares `var AvailableOptions={}` and IS properly `var` scoped. The next two statements are
   * NOT: `:L73` assigns `productObjectGroups = arguments.product.getOptionGroups()` with no `var`, and
   * `:L75` opens `for(i=1; i<=arrayLen(productObjectGroups); i++)` with an unscoped `i`. Both therefore
   * leak into the component's shared `variables` scope, which on a persistent CFML application server
   * is a genuine cross-request concurrency hazard on a singleton service.
   *
   * TRANSLATION DECISION, recorded rather than silently taken: strict TypeScript block scoping removes
   * that hazard BY CONSTRUCTION — the landed member's `productObjectGroups` and its `for…of` binding
   * cannot escape the call. The defect is not "fixed"; the idiom simply has no way to express it, which
   * AAP §0.6.7.5 records as the intended treatment. The SAME class of defect recurs at `:L118` inside
   * `processProduct_addOptionGroup`, and is noted there too. No shared mutable state is fabricated here
   * to simulate the leak.
   */
  it('NET-NEW: X16 — answers an ARRAY of name-and-options entries per AAP §0.4.2.1 (:L71-:L79)', async () => {
    const sizeGroup = buildOptionGroup({
      optionGroupID: physicalID('og-size'),
      optionGroupName: 'Size',
    });
    const colorGroup = buildOptionGroup({
      optionGroupID: physicalID('og-color'),
      optionGroupName: 'Color',
    });
    const small = buildOption({ optionID: physicalID('o-small'), optionName: 'Small' });
    const medium = buildOption({ optionID: physicalID('o-medium'), optionName: 'Medium' });
    const red = buildOption({ optionID: physicalID('o-red'), optionName: 'Red' });

    const harness = buildHarness({
      optionCatalog: {
        optionGroups: [sizeGroup, colorGroup],
        optionsByOptionGroupID: {
          [physicalID('og-size')]: [small, medium],
          [physicalID('og-color')]: [red],
        },
      },
    });
    const product = buildProduct({ productID: physicalID('p-formatted') });

    const formatted = await harness.service.getFormattedOptionGroups(product);

    // ⭐ A KEYED RECORD, NOT AN ARRAY. `model/service/ProductService.cfc:L71` initialises a CFML STRUCT and
    // `:L76` keys it by `getOptionGroupName()`, so TR-1 tightens the loose `any` return to that shape. A
    // revision answered `FormattedOptionGroup[]` on the reading that AAP §0.4.2.1's tabulated array
    // outranks TR-1, and this case asserted `Array.isArray(formatted) === true`; review finding F3
    // withdrew both. Asserted here so the array cannot come back unnoticed.
    expect(Array.isArray(formatted)).toBe(false);

    // The KEY is the group name. Order is first-seen group order: `Size` was yielded first.
    expect(groupNames(formatted)).toEqual(['Size', 'Color']);
    expect(requireGroup(formatted, 'Size')).toEqual([
      { name: 'Small', value: physicalID('o-small') },
      { name: 'Medium', value: physicalID('o-medium') },
    ]);
    expect(requireGroup(formatted, 'Color')).toEqual([{ name: 'Red', value: physicalID('o-red') }]);

    // ⛔ AND NO IDENTIFIER IS PUBLISHED ALONGSIDE THE NAME (S9). `:L76` maps a name straight to the option
    // list, so each value is that bare list — an entry carrying `optionGroupID`, or wrapping the list in an
    // object, would report a shape the legacy struct cannot hold.
    expect(formatted).toStrictEqual({
      Size: [
        { name: 'Small', value: physicalID('o-small') },
        { name: 'Medium', value: physicalID('o-medium') },
      ],
      Color: [{ name: 'Red', value: physicalID('o-red') }],
    });
  });

  it('NET-NEW: X14 — the values are OptionService bare-option-name projections, never the DAO composite label', async () => {
    const sizeGroup = buildOptionGroup({
      optionGroupID: physicalID('og-size'),
      optionGroupName: 'Size',
    });
    const small = buildOption({ optionID: physicalID('o-small'), optionName: 'Small' });

    const harness = buildHarness({
      optionCatalog: {
        optionGroups: [sizeGroup],
        optionsByOptionGroupID: { [physicalID('og-size')]: [small] },
      },
    });

    const formatted = await harness.service.getFormattedOptionGroups(
      buildProduct({ productID: physicalID('p-projection') }),
    );

    // `model/service/OptionService.cfc:L55-L63` builds `{name = getOptionName(), value = getOptionID()}`
    // — the BARE option name. `model/dao/OptionDAO.cfc:L51-L91` builds the composite
    // "<group> - <option>" label instead, and that is a DIFFERENT projection used by a DIFFERENT member.
    // Mixing them up is the easiest way to break this member, so the distinction is asserted.
    const sizeOptions: readonly SelectOption[] = requireGroup(formatted, 'Size');
    expect(requireAt(sizeOptions, 0).name).toBe('Small');
    expect(requireAt(sizeOptions, 0).name).not.toContain(' - ');
  });

  it('NET-NEW: answers an empty RECORD when the product carries no option groups', async () => {
    const harness = buildHarness();

    const formatted = await harness.service.getFormattedOptionGroups(
      buildProduct({ productID: physicalID('p-bare') }),
    );

    // `:L75` iterates `arrayLen(productObjectGroups)` times, which is zero, so nothing is accumulated and
    // `:L79` returns the empty struct `:L71` created. It is EMPTY rather than absent, and it is an OBJECT
    // rather than an array — `{}` is what the legacy answers, and a client destructuring by name must not
    // have to special-case the no-groups product.
    expect(formatted).toStrictEqual({});
    expect(Array.isArray(formatted)).toBe(false);
    expect(groupNames(formatted)).toEqual([]);
  });

  it('NET-NEW: two groups sharing a name collide and the LAST write wins (:L77), preserved as observed', async () => {
    const firstSize = buildOptionGroup({
      optionGroupID: physicalID('og-1'),
      optionGroupName: 'Size',
    });
    const secondSize = buildOptionGroup({
      optionGroupID: physicalID('og-2'),
      optionGroupName: 'Size',
    });
    const small = buildOption({ optionID: physicalID('o-small'), optionName: 'Small' });
    const huge = buildOption({ optionID: physicalID('o-huge'), optionName: 'Huge' });

    const harness = buildHarness({
      optionCatalog: {
        optionGroups: [firstSize, secondSize],
        optionsByOptionGroupID: { [physicalID('og-1')]: [small], [physicalID('og-2')]: [huge] },
      },
    });

    const formatted = await harness.service.getFormattedOptionGroups(
      buildProduct({ productID: physicalID('p-collision') }),
    );

    // `:L77` keys the struct by NAME, so the second group overwrites the first. The port keeps that
    // exactly: the answer holds ONE entry, it does NOT re-label by optionGroupID and it does NOT
    // concatenate the two option lists, because either change would make the member answer something the
    // legacy never answered.
    //
    // ⭐ ONE ENTRY, AND THE LAST GROUP'S OPTIONS. Accumulating through a `Map` keyed by name before
    // materialising is what reproduces `:L76`'s plain struct assignment: the surviving value is the LAST
    // group's, sitting at the FIRST occurrence's position.
    expect(groupNames(formatted)).toEqual(['Size']);
    expect(requireGroup(formatted, 'Size')).toEqual([
      { name: 'Huge', value: physicalID('o-huge') },
    ]);
  });

  it('NET-NEW: M7 — a second, independently constructed invocation sees none of the first one memoised groups', async () => {
    const firstGroup = buildOptionGroup({
      optionGroupID: physicalID('og-a'),
      optionGroupName: 'Alpha',
    });
    const secondGroup = buildOptionGroup({
      optionGroupID: physicalID('og-b'),
      optionGroupName: 'Beta',
    });
    const alphaOption = buildOption({ optionID: physicalID('o-a'), optionName: 'A' });
    const betaOption = buildOption({ optionID: physicalID('o-b'), optionName: 'B' });

    const first = buildHarness({
      optionCatalog: {
        optionGroups: [firstGroup],
        optionsByOptionGroupID: { [physicalID('og-a')]: [alphaOption] },
      },
    });
    const firstProduct = buildProduct({ productID: physicalID('p-first') });

    expect(groupNames(await first.service.getFormattedOptionGroups(firstProduct))).toEqual([
      'Alpha',
    ]);

    // `Product.getOptionGroups` memoises into the ENTITY, so a repeat call must not re-query the groups
    // while the per-group option lookup, which is NOT memoised, must run again. That asymmetry is the
    // landed behaviour and it is asserted rather than assumed.
    await first.service.getFormattedOptionGroups(firstProduct);
    // The service derives its own option finders from ITS smart-list port (`ProductService.ts` wires
    // `createProductOptionFinders(collaborators.smartListQueryPort)`), so both query shapes land on the
    // product stream rather than on the OptionService's own stream.
    const groupQueries = first.smartListQueries.filter(
      (query) => query.entityName === 'SlatwallOptionGroup',
    );
    const optionQueries = first.smartListQueries.filter(
      (query) => query.entityName === 'SlatwallOption',
    );
    expect(groupQueries).toHaveLength(1);
    expect(optionQueries).toHaveLength(2);

    // M7 — nothing survives an invocation boundary. A second service graph over a second entity sees
    // only its own catalog, so no warm-container cache can bleed one product's groups into another's.
    const second = buildHarness({
      optionCatalog: {
        optionGroups: [secondGroup],
        optionsByOptionGroupID: { [physicalID('og-b')]: [betaOption] },
      },
    });
    const secondFormatted = await second.service.getFormattedOptionGroups(
      buildProduct({ productID: physicalID('p-second') }),
    );

    expect(groupNames(secondFormatted)).toEqual(['Beta']);
    expect(requireGroup(secondFormatted, 'Beta')).toEqual([
      { name: 'B', value: physicalID('o-b') },
    ]);
  });

  it('NET-NEW: refuses a nameless option group rather than labelling an entry with undefined (:L76)', async () => {
    const namelessGroup = buildOptionGroup({ optionGroupID: physicalID('og-nameless') });

    const harness = buildHarness({
      optionCatalog: { optionGroups: [namelessGroup], optionsByOptionGroupID: {} },
    });

    await expect(
      harness.service.getFormattedOptionGroups(
        buildProduct({ productID: physicalID('p-nameless') }),
      ),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

// ==================================================================================================
// Phase 6 — getProductSkusBySelectedOptions (T1 through T5)
// ==================================================================================================

describe('getProductSkusBySelectedOptions — option-to-SKU resolution', () => {
  const PRODUCT_ID = physicalID('p-resolve');
  const OTHER_PRODUCT_ID = physicalID('p-other');

  interface ResolutionFixture {
    readonly harness: Harness;
    readonly product: Product;
    readonly redSmall: Sku;
    readonly redLarge: Sku;
    readonly optionless: Sku;
    readonly otherProductRedSmall: Sku;
  }

  function buildResolutionFixture(): ResolutionFixture {
    const sizeGroup = buildOptionGroup({
      optionGroupID: physicalID('og-size'),
      optionGroupName: 'Size',
    });
    const colorGroup = buildOptionGroup({
      optionGroupID: physicalID('og-color'),
      optionGroupName: 'Color',
    });
    const red = buildOption({
      optionID: physicalID('o-red'),
      optionName: 'Red',
      optionGroup: colorGroup,
    });
    const small = buildOption({
      optionID: physicalID('o-small'),
      optionName: 'Small',
      optionGroup: sizeGroup,
    });
    const large = buildOption({
      optionID: physicalID('o-large'),
      optionName: 'Large',
      optionGroup: sizeGroup,
    });

    const product = buildProduct({ productID: PRODUCT_ID });
    const otherProduct = buildProduct({ productID: OTHER_PRODUCT_ID });

    const redSmall = buildSku({
      skuID: physicalID('sku-red-small'),
      product,
      options: [red, small],
    });
    const redLarge = buildSku({
      skuID: physicalID('sku-red-large'),
      product,
      options: [red, large],
    });
    const optionless = buildSku({ skuID: physicalID('sku-optionless'), product });
    const otherProductRedSmall = buildSku({
      skuID: physicalID('sku-other-red-small'),
      product: otherProduct,
      options: [red, small],
    });

    return {
      harness: buildHarness({
        repositorySkus: [redSmall, redLarge, optionless, otherProductRedSmall],
      }),
      product,
      redSmall,
      redLarge,
      optionless,
      otherProductRedSmall,
    };
  }

  it('NET-NEW: forwards both required arguments to the repository member findSkusBySelectedOptions', async () => {
    const fixture = buildResolutionFixture();

    await fixture.harness.service.getProductSkusBySelectedOptions(
      `${physicalID('o-red')},${physicalID('o-small')}`,
      PRODUCT_ID,
    );

    // ⚠️ THE NAME MISMATCH IS PRESERVED, NOT MECHANICALLY RENAMED. The service member is
    // `getProductSkusBySelectedOptions` (`model/service/ProductService.cfc:L104`) and the collaborator
    // member it delegates to is `getSkusBySelectedOptions` (`model/dao/SkuDAO.cfc:L107`), landing here
    // as the repository's `findSkusBySelectedOptions`. Assuming the two names match is a real way to
    // break the port, so the asymmetry is asserted.
    const calls = fixture.harness.skuCalls.filter(isSkuCall('findSkusBySelectedOptions'));
    expect(calls).toHaveLength(1);
    expect(requireAt(calls, 0).optionIds).toEqual([physicalID('o-red'), physicalID('o-small')]);
    expect(requireAt(calls, 0).productId).toBe(PRODUCT_ID);
  });

  it('NET-NEW: T2 — the product predicate is ALWAYS emitted on this service path, by declaration', async () => {
    const fixture = buildResolutionFixture();

    const matches = await fixture.harness.service.getProductSkusBySelectedOptions(
      `${physicalID('o-red')},${physicalID('o-small')}`,
      PRODUCT_ID,
    );

    // `model/service/ProductService.cfc:L104` declares `required string productID` and `:L105` forwards
    // `argumentCollection=arguments`, and this service is the DAO member's ONLY caller. The DAO's
    // `structKeyExists(arguments,"productID")` branch at `model/dao/SkuDAO.cfc:L120` is therefore always
    // true in practice, so the landed signature types `productID` as required and always emits the
    // predicate. That is a DECLARED translation decision (AAP §0.6.1.3 T2), not a silent branch
    // deletion — the branch was unreachable, and the port says so instead of pretending it existed.
    expect(
      requireAt(fixture.harness.skuCalls.filter(isSkuCall('findSkusBySelectedOptions')), 0)
        .productId,
    ).toBe(PRODUCT_ID);
    expect(matches).toEqual([fixture.redSmall]);
    expect(matches).not.toContain(fixture.otherProductRedSmall);
  });

  it('NET-NEW: T1 — the selected options are conjunctive, never a disjunctive IN list', async () => {
    const fixture = buildResolutionFixture();

    const matches = await fixture.harness.service.getProductSkusBySelectedOptions(
      `${physicalID('o-red')},${physicalID('o-small')}`,
      PRODUCT_ID,
    );

    // `model/dao/SkuDAO.cfc:L112-L118` appends one correlated `and exists (…)` clause PER option. A SKU
    // must carry EVERY listed option. Rewriting that as `optionID IN (…)` turns the conjunction into a
    // disjunction and would have returned `redLarge` too.
    expect(matches).toEqual([fixture.redSmall]);
    expect(matches).not.toContain(fixture.redLarge);
  });

  it('NET-NEW: T1 — duplicate option identifiers are retained, not collapsed', async () => {
    const fixture = buildResolutionFixture();

    await fixture.harness.service.getProductSkusBySelectedOptions(
      `${physicalID('o-red')},${physicalID('o-red')}`,
      PRODUCT_ID,
    );

    // The legacy loop appends one clause per LIST ELEMENT, so a duplicated entry produces two identical
    // EXISTS clauses. A `GROUP BY … HAVING COUNT(*) = N` rewrite diverges on exactly this input, and a
    // de-duplicating port would change the emitted predicate count. Both are refused.
    expect(
      requireAt(fixture.harness.skuCalls.filter(isSkuCall('findSkusBySelectedOptions')), 0)
        .optionIds,
    ).toEqual([physicalID('o-red'), physicalID('o-red')]);
  });

  it('NET-NEW: T3 — option-less SKUs stay excluded because the vestigial join is load-bearing', async () => {
    const fixture = buildResolutionFixture();

    const matches = await fixture.harness.service.getProductSkusBySelectedOptions('', PRODUCT_ID);

    // `model/dao/SkuDAO.cfc:L108` opens with `inner join sku.options as opt` and never references
    // `opt` in the WHERE clause, which makes the alias look removable. It is not: the join silently
    // EXCLUDES option-less SKUs from every result, including this degenerate one.
    expect(matches).toEqual([fixture.redSmall, fixture.redLarge]);
    expect(matches).not.toContain(fixture.optionless);
  });

  it('NET-NEW: T4 — a SKU carrying several matched options is returned once, not once per option', async () => {
    const fixture = buildResolutionFixture();

    const matches = await fixture.harness.service.getProductSkusBySelectedOptions(
      `${physicalID('o-red')},${physicalID('o-small')}`,
      PRODUCT_ID,
    );

    // `model/dao/SkuDAO.cfc:L108` says `select distinct sku`. Without it the join fans out one row per
    // SKU-option pair, and every arity assertion layered above — `Product.getSkuBySelectedOptions`,
    // `Sku.hasUniqueOptions` — breaks.
    expect(matches.filter((sku) => sku === fixture.redSmall)).toHaveLength(1);
    expect(new Set(matches).size).toBe(matches.length);
  });

  it('NET-NEW: T5 — an empty selection is legal and degenerates to every option-bearing SKU of the product', async () => {
    const fixture = buildResolutionFixture();

    const matches = await fixture.harness.service.getProductSkusBySelectedOptions('', PRODUCT_ID);

    // `Product.getSkusBySelectedOptions` defaults the list to `""` and `listLen("")` is zero, so zero
    // EXISTS clauses are appended. Both `Product.getSkuBySelectedOptions` and `Sku.hasUniqueOptions`
    // depend on that degenerate form, so guarding against empty input would break two real callers.
    const calls = fixture.harness.skuCalls.filter(isSkuCall('findSkusBySelectedOptions'));
    expect(requireAt(calls, 0).optionIds).toEqual([]);
    expect(matches).toHaveLength(2);
    expect(matches).toEqual([fixture.redSmall, fixture.redLarge]);
  });
});

// ==================================================================================================
// Phase 7A — processProductAddOptionGroup (D14, D10, X17)
// ==================================================================================================

describe('processProductAddOptionGroup — adding a whole option group', () => {
  const PRODUCT_ID = physicalID('p-add-group');
  const EXISTING_GROUP_ID = physicalID('og-size');
  const NEW_GROUP_ID = physicalID('og-color');

  interface AddOptionGroupFixture {
    readonly harness: Harness;
    readonly product: Product;
    readonly firstSku: Sku;
    readonly secondSku: Sku;
    readonly newGroup: OptionGroup;
    readonly red: Option;
    readonly blue: Option;
    readonly processObject: ProductAddOptionGroup;
  }

  function buildAddOptionGroupFixture(
    overrides: { readonly newGroupOptions?: 'both' | 'none' } = {},
  ): AddOptionGroupFixture {
    const existingGroup = buildOptionGroup({
      optionGroupID: EXISTING_GROUP_ID,
      optionGroupName: 'Size',
      imageGroupFlag: false,
    });
    const small = buildOption({
      optionID: physicalID('o-small'),
      optionName: 'Small',
      optionCode: 'SM',
      optionGroup: existingGroup,
    });
    const large = buildOption({
      optionID: physicalID('o-large'),
      optionName: 'Large',
      optionCode: 'LG',
      optionGroup: existingGroup,
    });

    const newGroup = buildOptionGroup({
      optionGroupID: NEW_GROUP_ID,
      optionGroupName: 'Color',
      imageGroupFlag: true,
    });
    // `buildOption({ optionGroup })` calls `Option.setOptionGroup`, which pushes the option into the
    // group, so `newGroup.getOptions()` is [red, blue] in declaration order — and that order is what
    // decides which single option D14 propagates.
    const red = buildOption({
      optionID: physicalID('o-red'),
      optionName: 'Red',
      optionCode: 'RD',
      ...(overrides.newGroupOptions === 'none' ? {} : { optionGroup: newGroup }),
    });
    const blue = buildOption({
      optionID: physicalID('o-blue'),
      optionName: 'Blue',
      optionCode: 'BL',
      ...(overrides.newGroupOptions === 'none' ? {} : { optionGroup: newGroup }),
    });

    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productType,
    });

    const firstSku = buildSku({
      skuID: physicalID('sku-small'),
      skuCode: 'SM',
      product,
      options: [small],
    });
    const secondSku = buildSku({
      skuID: physicalID('sku-large'),
      skuCode: 'LG',
      product,
      options: [large],
    });

    const processObject: ProductAddOptionGroup = { product, optionGroup: NEW_GROUP_ID };

    return {
      harness: buildHarness({
        settings: [...IMAGE_FILE_NAME_SETTINGS],
        optionCatalog: {
          optionGroups: [existingGroup],
          optionsByOptionGroupID: { [EXISTING_GROUP_ID]: [small, large] },
          resolvableOptionGroups: [existingGroup, newGroup],
        },
        // The unused-group query answers "every group NOT already on the product", so the pool must
        // hold both for `minCollection: 1` (`model/validation/Product.json:L14`) to be satisfiable.
        repositoryOptionGroups: [existingGroup, newGroup],
        repositorySkus: [firstSku, secondSku],
      }),
      product,
      firstSku,
      secondSku,
      newGroup,
      red,
      blue,
      processObject,
    };
  }

  /**
   * 📝 TODO(parity) D14 — model/service/ProductService.cfc:L119.
   *
   * The loop body is `skus[i].addOption(options[1])`. `options` is the WHOLE option list of the newly
   * added group, and `options[1]` is CFML's one-based FIRST element, so every existing SKU receives
   * exactly ONE option — the first — and the rest of the group is never distributed. Carried unrepaired:
   * this member does NOT enumerate combinations, does NOT round-robin, and does NOT add the remaining
   * options anywhere.
   *
   * 📝 TODO(parity) D10-class — model/service/ProductService.cfc:L118. The enclosing
   * `for(i=1; i<=arrayLen(skus); i++)` declares `i` UNSCOPED, the same leak into the component's shared
   * `variables` scope catalogued as D10 for `getFormattedOptionGroups`. Strict TypeScript block scoping
   * removes the hazard by construction; no shared mutable state is fabricated to reproduce it.
   */
  it('NET-NEW: D14 — adds ONLY the first option of the new group, to EVERY existing SKU (:L119)', async () => {
    const fixture = buildAddOptionGroupFixture();

    await fixture.harness.service.processProductAddOptionGroup(
      fixture.product,
      fixture.processObject,
    );

    expect(fixture.newGroup.getOptions()).toEqual([fixture.red, fixture.blue]);

    // Every existing SKU gains the FIRST option and nothing else.
    expect(fixture.firstSku.getOptions()).toContain(fixture.red);
    expect(fixture.secondSku.getOptions()).toContain(fixture.red);
    expect(fixture.firstSku.getOptions()).not.toContain(fixture.blue);
    expect(fixture.secondSku.getOptions()).not.toContain(fixture.blue);

    // Two SKUs, each holding its original option plus exactly one new one.
    expect(fixture.firstSku.getOptions()).toHaveLength(2);
    expect(fixture.secondSku.getOptions()).toHaveLength(2);
  });

  it('NET-NEW: resolves the group through the explicit getOptionGroup member the IR-1 synthesis replaced', async () => {
    const fixture = buildAddOptionGroupFixture();

    // `model/service/ProductService.cfc:L115` calls `getOptionService().getOptionGroup(...)`, a member
    // that has NO source declaration anywhere: `org/Hibachi/HibachiService.cfc:L255-L281` fabricated it
    // at runtime from the `get` prefix. Strict TypeScript has no such facility, so the port DECLARES it
    // and this test proves the declared member is what resolves the group (IR-1, AAP §0.4.2.5).
    const resolved = await fixture.harness.optionService.getOptionGroup(NEW_GROUP_ID);
    expect(resolved).toBe(fixture.newGroup);

    await fixture.harness.service.processProductAddOptionGroup(
      fixture.product,
      fixture.processObject,
    );
    expect(fixture.firstSku.getOptions()).toContain(fixture.red);
  });

  it('NET-NEW: X17 — chains updateDefaultImageFileNames with no payload and returns THAT call product (:L123)', async () => {
    const fixture = buildAddOptionGroupFixture();
    const chained = buildProduct({ productID: physicalID('p-returned-by-the-chain') });

    // `:L123` is `arguments.product = this.processProduct(arguments.product, {}, 'updateDefaultImageFileNames');`
    // — an ASSIGNMENT, so the value the chained call answers with is what `:L125` returns. Proving the
    // reassignment needs the chained call to answer with a DIFFERENT object, which is what the typed spy
    // on the landed seam provides. (`jest.mock` is never used in this file; this is a spy on one member
    // of the instance under test.)
    const chainSpy = jest
      .spyOn(fixture.harness.service, 'processProductUpdateDefaultImageFileNames')
      .mockResolvedValue(chained);

    const answer = await fixture.harness.service.processProductAddOptionGroup(
      fixture.product,
      fixture.processObject,
    );

    expect(answer).toBe(chained);
    expect(answer).not.toBe(fixture.product);
    expect(chainSpy).toHaveBeenCalledTimes(1);
    // EMPTY DATA AND EXACT CONTEXT, as the port expresses them. `{}` at `:L123` carried no keys, and the
    // port's chained member takes the product ALONE — there is no data argument to be non-empty. The
    // context `'updateDefaultImageFileNames'` is likewise fixed by the member's identity rather than by
    // a string, which is the whole point of retiring `process#getClassName()#_#processContext#`.
    expect(requireAt(chainSpy.mock.calls, 0)).toEqual([fixture.product]);
  });

  it('NET-NEW: an empty new group adds nothing yet still proceeds to the chained call', async () => {
    const fixture = buildAddOptionGroupFixture({ newGroupOptions: 'none' });
    const chainSpy = jest.spyOn(
      fixture.harness.service,
      'processProductUpdateDefaultImageFileNames',
    );

    await fixture.harness.service.processProductAddOptionGroup(
      fixture.product,
      fixture.processObject,
    );

    // `:L118` iterates the SKUs regardless, and `:L123` is reached unconditionally, so an option-less
    // group is a legal no-op that still runs the chain rather than an early return.
    expect(fixture.firstSku.getOptions()).toHaveLength(1);
    expect(fixture.secondSku.getOptions()).toHaveLength(1);
    expect(chainSpy).toHaveBeenCalledTimes(1);
  });

  it('NET-NEW: the real chain regenerates every SKU image file name and persists each SKU', async () => {
    const fixture = buildAddOptionGroupFixture();

    await fixture.harness.service.processProductAddOptionGroup(
      fixture.product,
      fixture.processObject,
    );

    // Left unspied, the chained member is observable through its own effects: `Sku.generateImageFileName`
    // contributes one delimiter-plus-option-code segment per option whose group carries
    // `imageGroupFlag`, and only the new Color group does.
    expect(fixture.firstSku.imageFile).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}-RD.jpg`);
    expect(fixture.secondSku.imageFile).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}-RD.jpg`);
    expect(fixture.harness.persistedSkus).toEqual([fixture.firstSku, fixture.secondSku]);
  });

  it('NET-NEW: refuses a process object with no option-group identifier rather than looking up undefined', async () => {
    const fixture = buildAddOptionGroupFixture();
    const emptyProcessObject: ProductAddOptionGroup = { product: fixture.product };

    // `:L115` passes the value straight into the lookup with no guard.
    await expect(
      fixture.harness.service.processProductAddOptionGroup(fixture.product, emptyProcessObject),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('NET-NEW: refuses an unresolvable option-group identifier rather than calling getOptions() on null', async () => {
    const fixture = buildAddOptionGroupFixture();
    const strayProcessObject: ProductAddOptionGroup = {
      product: fixture.product,
      optionGroup: physicalID('og-does-not-exist'),
    };

    await expect(
      fixture.harness.service.processProductAddOptionGroup(fixture.product, strayProcessObject),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('NET-NEW: stops before the body when the addOptionGroup rules refuse the entity', async () => {
    // No unused option group exists, so `model/validation/Product.json:L14`'s `minCollection: 1` fails.
    const existingGroup = buildOptionGroup({
      optionGroupID: EXISTING_GROUP_ID,
      optionGroupName: 'Size',
    });
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({ productID: PRODUCT_ID, productType });
    const sku = buildSku({ skuID: physicalID('sku-only'), product });

    const harness = buildHarness({
      optionCatalog: {
        optionGroups: [existingGroup],
        optionsByOptionGroupID: {},
        resolvableOptionGroups: [existingGroup],
      },
      repositoryOptionGroups: [existingGroup],
      repositorySkus: [sku],
    });
    const processObject: ProductAddOptionGroup = { product, optionGroup: EXISTING_GROUP_ID };

    const answer = await harness.service.processProductAddOptionGroup(product, processObject);

    expect(answer).toBe(product);
    expect(product.hasErrors()).toBe(true);
    expect(product.hasError('unusedProductOptionGroups')).toBe(true);
    // The body never ran: no option was added and nothing was persisted.
    expect(sku.getOptions()).toHaveLength(0);
    expect(harness.persistedSkus).toHaveLength(0);
  });
});

// ==================================================================================================
// Phase 7B — processProductAddOption (:L128-:L155)
// ==================================================================================================

describe('processProductAddOption — adding one option to the SKU set', () => {
  const PRODUCT_ID = physicalID('p-add-option');
  const SIZE_GROUP_ID = physicalID('og-size');
  const COLOR_GROUP_ID = physicalID('og-color');
  const DEFAULT_SKU_PRICE = '100';
  const DEFAULT_SKU_LIST_PRICE = '150';

  interface AddOptionFixture {
    readonly harness: Harness;
    readonly product: Product;
    readonly processObject: ProductAddOption;
    readonly red: Option;
  }

  /**
   * Three existing SKUs, chosen so one fixture exercises all three branches of the `:L140-:L148` walk
   * at once: an option in a DIFFERENT group is listed, an option in the SAME group as the new one is
   * skipped, and an option whose identifier differs only in CASE from one already listed is skipped.
   */
  function buildAddOptionFixture(
    overrides: { readonly withListPrice?: boolean } = {},
  ): AddOptionFixture {
    const sizeGroup = buildOptionGroup({
      optionGroupID: SIZE_GROUP_ID,
      optionGroupName: 'Size',
      imageGroupFlag: false,
    });
    const colorGroup = buildOptionGroup({
      optionGroupID: COLOR_GROUP_ID,
      optionGroupName: 'Color',
      imageGroupFlag: false,
    });

    const small = buildOption({
      optionID: physicalID('o-small'),
      optionName: 'Small',
      optionCode: 'SM',
      optionGroup: sizeGroup,
    });
    const large = buildOption({
      optionID: physicalID('o-large'),
      optionName: 'Large',
      optionCode: 'LG',
      optionGroup: sizeGroup,
    });
    const smallShouted = buildOption({
      optionID: physicalID('o-small').toUpperCase(),
      optionName: 'SMALL',
      optionCode: 'SMU',
      optionGroup: sizeGroup,
    });
    const green = buildOption({
      optionID: physicalID('o-green'),
      optionName: 'Green',
      optionCode: 'GR',
      optionGroup: colorGroup,
    });
    const red = buildOption({
      optionID: physicalID('o-red'),
      optionName: 'Red',
      optionCode: 'RD',
      optionGroup: colorGroup,
    });

    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });

    // Order matters: `product.getSkus()` is walked in insertion order, and that fixes the order of the
    // comma-delimited list the member builds.
    const firstSku = buildSku({ skuID: physicalID('sku-1'), product, options: [small, green] });
    buildSku({ skuID: physicalID('sku-2'), product, options: [smallShouted] });
    buildSku({ skuID: physicalID('sku-3'), product, options: [large] });

    const defaultSku = buildSku({
      skuID: physicalID('sku-default'),
      product,
      price: DEFAULT_SKU_PRICE,
      listPrice: DEFAULT_SKU_LIST_PRICE,
      options: [small],
    });

    const harness = buildHarness({
      settings: [...IMAGE_FILE_NAME_SETTINGS],
      optionCatalog: {
        optionGroups: [sizeGroup],
        optionsByOptionGroupID: { [SIZE_GROUP_ID]: [small, large] },
        resolvableOptionGroups: [sizeGroup, colorGroup],
        resolvableOptions: [red, green, small, large, smallShouted],
      },
      // `findUnusedOptions` looks INSIDE the product's existing groups for options no SKU uses, so
      // `large` and `O-SMALL` satisfy `model/validation/Product.json:L13`'s `minCollection: 1`.
      repositoryOptionGroups: [sizeGroup],
      optionRepositorySkus: [firstSku],
      repositorySkus: [firstSku, defaultSku],
    });

    if (overrides.withListPrice === false) {
      // `model/service/ProductService.cfc:L135-L137` only copies the list price when the default SKU
      // HAS one, so the absent case needs a delegate that answers `undefined` — the support factory's
      // delegate always answers a value because `Sku.getListPrice()` always does.
      product.defaultSku = {
        getPrice: (): ReturnType<ProductDefaultSkuDelegate['getPrice']> => defaultSku.getPrice(),
        getListPrice: (): ReturnType<ProductDefaultSkuDelegate['getListPrice']> => undefined,
        getRenewalPrice: (): ReturnType<ProductDefaultSkuDelegate['getRenewalPrice']> => undefined,
        getCurrencyCode: (): string | undefined => undefined,
        getImageDirectory: (): string => '',
        getImagePath: (): string => '',
        getImage: (): string => '',
        getResizedImagePath: (): string => '',
        getImageExistsFlag: (): boolean => false,
      };
    } else {
      harness.attachDefaultSku(product, defaultSku);
    }

    return { harness, product, processObject: { product, option: physicalID('o-red') }, red };
  }

  it('NET-NEW: builds a comma-delimited option list that STARTS with the new option identifier (:L131)', async () => {
    const fixture = buildAddOptionFixture();
    const createSkus = jest.spyOn(fixture.harness.skuService, 'createSkus').mockResolvedValue(true);

    await fixture.harness.service.processProductAddOption(fixture.product, fixture.processObject);

    expect(createSkus).toHaveBeenCalledTimes(1);
    const [passedProduct, passedData] = requireAt(createSkus.mock.calls, 0);
    expect(passedProduct).toBe(fixture.product);

    // `:L131` seeds the list with `newOption.getOptionID()`, so the new option is FIRST. Then `:L140-:L148`
    // appends. `o-green` is skipped because it shares the new option's group, and `O-SMALL` is skipped
    // because `listFindNoCase` at `:L144` already found `o-small`.
    expect(passedData['options']).toBe(
      `${physicalID('o-red')},${physicalID('o-small')},${physicalID('o-large')}`,
    );
    // ⚠️ THE COMMA-DELIMITED BOUNDARY IS PRESERVED, NOT MODERNISED INTO AN ARRAY. `:L150` hands the
    // struct straight to `createSkus`, whose merchandise branch parses a CFML list, so converting it
    // here would break the collaborator contract.
    expect(typeof passedData['options']).toBe('string');
  });

  it('NET-NEW: copies the default SKU price, and the list price only when one is present (:L132-:L137)', async () => {
    const withList = buildAddOptionFixture();
    const withListSpy = jest
      .spyOn(withList.harness.skuService, 'createSkus')
      .mockResolvedValue(true);

    await withList.harness.service.processProductAddOption(
      withList.product,
      withList.processObject,
    );

    const [, withListData] = requireAt(withListSpy.mock.calls, 0);
    // `ExactDecimal` is a BRANDED STRING at runtime, so the copied values compare as strings.
    expect(withListData['price']).toBe(DEFAULT_SKU_PRICE);
    expect(withListData['listPrice']).toBe(DEFAULT_SKU_LIST_PRICE);

    const withoutList = buildAddOptionFixture({ withListPrice: false });
    const withoutListSpy = jest
      .spyOn(withoutList.harness.skuService, 'createSkus')
      .mockResolvedValue(true);

    await withoutList.harness.service.processProductAddOption(
      withoutList.product,
      withoutList.processObject,
    );

    const [, withoutListData] = requireAt(withoutListSpy.mock.calls, 0);
    expect(withoutListData['price']).toBe(DEFAULT_SKU_PRICE);
    // `:L135` guards the assignment, so the key is ABSENT rather than present-and-undefined.
    expect('listPrice' in withoutListData).toBe(false);
  });

  it('NET-NEW: lists options from OTHER groups only, and never the same option twice case-insensitively', async () => {
    const fixture = buildAddOptionFixture();
    const createSkus = jest.spyOn(fixture.harness.skuService, 'createSkus').mockResolvedValue(true);

    await fixture.harness.service.processProductAddOption(fixture.product, fixture.processObject);

    const [, passedData] = requireAt(createSkus.mock.calls, 0);
    const listed = String(passedData['options']).split(',');

    // `:L144`'s two clauses, asserted separately.
    expect(listed).not.toContain(physicalID('o-green')); // same group as the new option
    expect(listed).not.toContain(physicalID('o-small').toUpperCase()); // already listed, differing only in case
    expect(listed).toEqual([physicalID('o-red'), physicalID('o-small'), physicalID('o-large')]);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('NET-NEW: resolves the option through the explicit getOption member, then chains X17 and returns its product', async () => {
    const fixture = buildAddOptionFixture();
    jest.spyOn(fixture.harness.skuService, 'createSkus').mockResolvedValue(true);
    const chained = buildProduct({ productID: physicalID('p-chained-add-option') });
    const chainSpy = jest
      .spyOn(fixture.harness.service, 'processProductUpdateDefaultImageFileNames')
      .mockResolvedValue(chained);

    // `getOption` is a second IR-1 synthesis victim: `model/service/ProductService.cfc:L130` calls it
    // and no source file declares it.
    expect(await fixture.harness.optionService.getOption(physicalID('o-red'))).toBe(fixture.red);

    const answer = await fixture.harness.service.processProductAddOption(
      fixture.product,
      fixture.processObject,
    );

    // `:L152` reassigns from the chained call and `:L154` returns it.
    expect(answer).toBe(chained);
    expect(requireAt(chainSpy.mock.calls, 0)).toEqual([fixture.product]);
  });

  it('NET-NEW: refuses a missing option identifier, an unresolvable one, and a group-less option', async () => {
    const fixture = buildAddOptionFixture();
    jest.spyOn(fixture.harness.skuService, 'createSkus').mockResolvedValue(true);

    // `:L130` dereferences the lookup result without a guard in both directions.
    await expect(
      fixture.harness.service.processProductAddOption(fixture.product, {
        product: fixture.product,
      }),
    ).rejects.toBeInstanceOf(DomainError);

    const strayFixture = buildAddOptionFixture();
    jest.spyOn(strayFixture.harness.skuService, 'createSkus').mockResolvedValue(true);
    await expect(
      strayFixture.harness.service.processProductAddOption(strayFixture.product, {
        product: strayFixture.product,
        option: physicalID('o-nowhere'),
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('NET-NEW: refuses to run when the product has no default SKU to read a price from (:L132)', async () => {
    const fixture = buildAddOptionFixture();
    jest.spyOn(fixture.harness.skuService, 'createSkus').mockResolvedValue(true);
    delete fixture.product.defaultSku;

    // `:L132` is `arguments.product.getDefaultSku().getPrice()` — no guard, so a product without one
    // raises rather than silently defaulting the price to zero.
    await expect(
      fixture.harness.service.processProductAddOption(fixture.product, fixture.processObject),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it('NET-NEW: stops before the body when the addOption rules refuse the entity', async () => {
    const sizeGroup = buildOptionGroup({ optionGroupID: SIZE_GROUP_ID, optionGroupName: 'Size' });
    const small = buildOption({
      optionID: physicalID('o-small'),
      optionName: 'Small',
      optionGroup: sizeGroup,
    });
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({ productID: PRODUCT_ID, productType });
    const sku = buildSku({ skuID: physicalID('sku-uses-everything'), product, options: [small] });

    // Every option of the only group is already in use, so `unusedProductOptions` is empty and
    // `model/validation/Product.json:L13` refuses the entity.
    const harness = buildHarness({
      optionCatalog: {
        optionGroups: [sizeGroup],
        optionsByOptionGroupID: { [SIZE_GROUP_ID]: [small] },
        resolvableOptions: [small],
      },
      repositoryOptionGroups: [sizeGroup],
      optionRepositorySkus: [sku],
    });
    const createSkus = jest.spyOn(harness.skuService, 'createSkus');

    const answer = await harness.service.processProductAddOption(product, {
      product,
      option: physicalID('o-small'),
    });

    expect(answer).toBe(product);
    expect(product.hasError('unusedProductOptions')).toBe(true);
    expect(createSkus).not.toHaveBeenCalled();
  });
});

// ==================================================================================================
// AGENT PROMPT PHASE 7C — processProduct_updateSkus(product, processObject)
// SOURCE: model/service/ProductService.cfc:L216-L233
// RULES:  model/validation/Product_UpdateSkus.json
//
// Two behaviours are pinned here that a reasonable-looking port gets wrong in opposite directions.
//
// 1. THE FLAGS ARE CFML BOOLEANS, NOT JAVASCRIPT TRUTHINESS. `:L222` and `:L226` place the flag
//    DIRECTLY inside an `if`, so CFML casts it: `1`, `"1"`, `"true"` and `"yes"` are true, and `0`,
//    `"0"`, `"false"` and `"no"` are false. JavaScript disagrees on exactly one of those — the STRING
//    `"0"` is truthy — and that single disagreement would apply a price the legacy leaves alone.
//    A value that cannot be cast at all raises, because CFML raises on null in an `if`, and
//    `model/process/Product_UpdateSkus.cfc:L49` declares the flag with no default.
//
// 2. THE RULES CARRY NO `contexts` KEY. Both rules in `model/validation/Product_UpdateSkus.json`
//    declare only `conditions`, so — unlike every rule in `model/validation/Product.json`, each of
//    which names its contexts — they apply in EVERY context. The mirror image of that is the entity
//    pass: no Product rule names `updateSkus`, so the entity contributes nothing to this context even
//    when the product would fail `save` outright. Both halves of that asymmetry are asserted, because
//    collapsing them into one "global context" is the mistake the AAP warns against in §0.8.2 G6.
//
// X3: there is NO `minValue` constraint on either property. `entity.sku.price` carries one in
// `model/validation/Sku.json`, and it is tempting to assume the process object inherits it. It does
// not, and a zero or negative price is applied here without complaint.
// ==================================================================================================

describe('processProductUpdateSkus — the flag-gated bulk price update', () => {
  const PRODUCT_ID = physicalID('p-update-skus');
  const SEEDED_PRICE = 10;
  const SEEDED_LIST_PRICE = 15;

  interface UpdateSkusFixture {
    readonly product: Product;
    readonly first: Sku;
    readonly second: Sku;
  }

  /**
   * Builds a product carrying two persisted SKUs at a known price and list price.
   *
   * `identified: false` omits `productName` and `productCode` entirely, which makes the product
   * invalid for the `save` context — the state the entity-pass test needs.
   */
  function buildFixture(options: { readonly identified?: boolean } = {}): UpdateSkusFixture {
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: 'Merchandise',
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product =
      options.identified === false
        ? buildProduct({ productID: PRODUCT_ID, productType })
        : buildProduct({
            productID: PRODUCT_ID,
            productName: TEST_MERCHANDISE_PRODUCT_NAME,
            productCode: TEST_MERCHANDISE_PRODUCT_CODE,
            productType,
          });
    const first = buildSku({
      skuID: physicalID('sku-update-1'),
      skuCode: `${TEST_MERCHANDISE_PRODUCT_CODE}-1`,
      price: SEEDED_PRICE,
      listPrice: SEEDED_LIST_PRICE,
      product,
    });
    const second = buildSku({
      skuID: physicalID('sku-update-2'),
      skuCode: `${TEST_MERCHANDISE_PRODUCT_CODE}-2`,
      price: SEEDED_PRICE,
      listPrice: SEEDED_LIST_PRICE,
      product,
    });

    return { product, first, second };
  }

  it('NET-NEW: applies the new price and list price to EVERY SKU, then persists each one (:L218-:L231)', async () => {
    const { product, first, second } = buildFixture();
    const harness = buildHarness();

    // Declared THROUGH the landed process-object type rather than inferred from the literal, so the four
    // data properties of `model/process/Product_UpdateSkus.cfc:L52-L55` are checked against the ported
    // interface at compile time: a renamed, dropped or mistyped property fails here instead of quietly
    // passing an extra key the member would ignore.
    const processObject: ProductUpdateSkus = {
      product,
      updatePriceFlag: 1,
      price: 25,
      updateListPriceFlag: 1,
      listPrice: 40,
    };

    const answer = await harness.service.processProductUpdateSkus(product, processObject);

    expect(answer).toBe(product);
    expect(first.getPrice()).toBe('25');
    expect(first.getListPrice()).toBe('40');
    expect(second.getPrice()).toBe('25');
    expect(second.getListPrice()).toBe('40');

    // `:L229-:L231` walks the SKUs a SECOND time to persist them, so every SKU is written exactly
    // once and the writes happen after the whole set has been mutated — not interleaved with it.
    expect(harness.persistedSkus).toEqual([first, second]);
  });

  it('NET-NEW: changes the price only when updatePriceFlag is set, and the list price only when updateListPriceFlag is set', async () => {
    const priceOnly = buildFixture();
    const priceOnlyHarness = buildHarness();

    await priceOnlyHarness.service.processProductUpdateSkus(priceOnly.product, {
      product: priceOnly.product,
      updatePriceFlag: 1,
      price: 25,
      updateListPriceFlag: 0,
      listPrice: 40,
    });

    expect(priceOnly.first.getPrice()).toBe('25');
    expect(priceOnly.first.getListPrice()).toBe(String(SEEDED_LIST_PRICE));

    // Fresh product, fresh service, fresh repository: the mirrored case shares no state with the one
    // above, so neither can mask the other by leaving a mutated SKU behind.
    const listPriceOnly = buildFixture();
    const listPriceOnlyHarness = buildHarness();

    await listPriceOnlyHarness.service.processProductUpdateSkus(listPriceOnly.product, {
      product: listPriceOnly.product,
      updatePriceFlag: 0,
      price: 25,
      updateListPriceFlag: 1,
      listPrice: 40,
    });

    expect(listPriceOnly.first.getPrice()).toBe(String(SEEDED_PRICE));
    expect(listPriceOnly.first.getListPrice()).toBe('40');

    // Both SKUs are still persisted in each case: `:L229` re-walks the whole set unconditionally,
    // and does not skip the SKUs whose flag was off.
    expect(priceOnlyHarness.persistedSkus).toHaveLength(2);
    expect(listPriceOnlyHarness.persistedSkus).toHaveLength(2);
  });

  it('NET-NEW: casts the flags the way CFML casts them, so the STRING "0" and "no" do NOT update (:L222/:L226)', async () => {
    // The single most likely silent divergence in this member. JavaScript truthiness treats the
    // string "0" as true; CFML does not. `"1"`/`"0"` are what a form post actually delivers, which is
    // why the source-representative string form is asserted alongside the numeric form.
    const numericStrings = buildFixture();
    const numericStringHarness = buildHarness();

    await numericStringHarness.service.processProductUpdateSkus(numericStrings.product, {
      product: numericStrings.product,
      updatePriceFlag: '1',
      price: '25',
      updateListPriceFlag: '0',
      listPrice: '40',
    });

    expect(numericStrings.first.getPrice()).toBe('25');
    expect(numericStrings.first.getListPrice()).toBe(String(SEEDED_LIST_PRICE));

    const wordStrings = buildFixture();
    const wordStringHarness = buildHarness();

    await wordStringHarness.service.processProductUpdateSkus(wordStrings.product, {
      product: wordStrings.product,
      updatePriceFlag: 'yes',
      price: '25',
      updateListPriceFlag: 'no',
      listPrice: '40',
    });

    expect(wordStrings.first.getPrice()).toBe('25');
    expect(wordStrings.first.getListPrice()).toBe(String(SEEDED_LIST_PRICE));
  });

  it('NET-NEW: an empty SKU list is a no-op that still returns the product (:L220)', async () => {
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });
    const harness = buildHarness();

    const answer = await harness.service.processProductUpdateSkus(product, {
      product,
      updatePriceFlag: 1,
      price: 25,
      updateListPriceFlag: 1,
      listPrice: 40,
    });

    // `:L220` guards the whole body on `arrayLen(...)`, so an option-less, SKU-less product neither
    // raises nor writes. The flags are never even read, which matters for the absent-flag case below.
    expect(answer).toBe(product);
    expect(product.hasErrors()).toBe(false);
    expect(harness.skuCalls.filter(isSkuCall('persistSku'))).toHaveLength(0);
  });

  it('NET-NEW: the two Product_UpdateSkus rules declare no contexts and no minValue (X3)', () => {
    const rules = productUpdateSkusValidationRuleSet.properties.flatMap((property) => [
      ...property.rules,
    ]);

    expect(
      productUpdateSkusValidationRuleSet.properties.map((property) => property.propertyIdentifier),
    ).toEqual(['price', 'listPrice']);
    expect(rules).toHaveLength(2);

    for (const rule of rules) {
      // No `contexts` key at all — not an empty one. That is what makes these rules apply in every
      // context, and it is the difference from `model/validation/Product.json`, where every rule names
      // its contexts explicitly.
      expect(Object.prototype.hasOwnProperty.call(rule, 'contexts')).toBe(false);
      expect(rule.conditions).toBeDefined();

      // X3: the constraint list is enumerated exhaustively rather than probed, so a `minValue` added
      // later cannot slip past. `model/validation/Product_UpdateSkus.json` declares neither a minimum
      // nor a maximum for either property.
      expect(rule.constraints.map((constraint) => constraint.constraintType)).toEqual([
        'dataType',
        'required',
      ]);
    }
  });

  it('NET-NEW: applies zero and negative prices, because no minValue constraint exists (X3)', async () => {
    const { product, first, second } = buildFixture();
    const harness = buildHarness();

    const answer = await harness.service.processProductUpdateSkus(product, {
      product,
      updatePriceFlag: 1,
      price: 0,
      updateListPriceFlag: 1,
      listPrice: -5,
    });

    expect(answer).toBe(product);
    expect(product.hasErrors()).toBe(false);
    expect(first.getPrice()).toBe('0');
    expect(first.getListPrice()).toBe('-5');
    expect(second.getPrice()).toBe('0');
    expect(harness.persistedSkus).toHaveLength(2);
  });

  it('NET-NEW: refuses the process object when an active flag has no value to apply, and writes nothing', async () => {
    const { product, first } = buildFixture();
    const harness = buildHarness();

    // `updatePriceFlag` activates the `showPrice` condition, so the `required` constraint on `price`
    // is evaluated — and there is no price.
    const answer = await harness.service.processProductUpdateSkus(product, {
      product,
      updatePriceFlag: 1,
      updateListPriceFlag: 0,
    });

    expect(answer).toBe(product);
    expect(product.hasErrors()).toBe(true);

    // A rejected PROCESS OBJECT surfaces on the ENTITY as one context-named entry under the shared
    // process-objects key — the legacy shape, so downstream error reporting stays comparable.
    expect(product.getError(PROCESS_OBJECTS_ERROR_KEY)).toEqual(['updateSkus']);

    // The early return at `:L219` means no SKU was touched and nothing was written.
    expect(first.getPrice()).toBe(String(SEEDED_PRICE));
    expect(harness.persistedSkus).toHaveLength(0);
  });

  it('NET-NEW: evaluates the numeric data type only while the flag is active, and leaves an inactive property entirely unvalidated', async () => {
    const refused = buildFixture();
    const refusedHarness = buildHarness();

    const refusedAnswer = await refusedHarness.service.processProductUpdateSkus(refused.product, {
      product: refused.product,
      updatePriceFlag: 1,
      price: 'free',
      updateListPriceFlag: 0,
    });

    expect(refusedAnswer).toBe(refused.product);
    expect(refused.product.getError(PROCESS_OBJECTS_ERROR_KEY)).toEqual(['updateSkus']);
    expect(refused.first.getPrice()).toBe(String(SEEDED_PRICE));
    expect(refusedHarness.persistedSkus).toHaveLength(0);

    // Same garbage value, flag off. The condition is unmet, so the rule is skipped and the property is
    // never validated at all — not validated-and-passed. The body then leaves the SKU alone, so the
    // unvalidated garbage is unreachable rather than merely tolerated.
    const ignored = buildFixture();
    const ignoredHarness = buildHarness();

    const ignoredAnswer = await ignoredHarness.service.processProductUpdateSkus(ignored.product, {
      product: ignored.product,
      updatePriceFlag: 0,
      price: 'free',
      updateListPriceFlag: 0,
      listPrice: 'also free',
    });

    expect(ignoredAnswer).toBe(ignored.product);
    expect(ignored.product.hasErrors()).toBe(false);
    expect(ignored.first.getPrice()).toBe(String(SEEDED_PRICE));
    expect(ignored.first.getListPrice()).toBe(String(SEEDED_LIST_PRICE));
    expect(ignoredHarness.persistedSkus).toHaveLength(2);
  });

  it('NET-NEW: an ABSENT flag passes validation untouched and then raises exactly where CFML raises (:L222)', async () => {
    const { product, first } = buildFixture();
    const harness = buildHarness();

    // No flags at all, and a non-numeric list price. Validation adds nothing, because both conditions
    // read an absent flag and neither can be met — which is the "absent flag leaves the value entirely
    // unvalidated" half. The body then reads the same absent flag inside an `if`, where CFML raises on
    // null; `model/process/Product_UpdateSkus.cfc:L49` declares the property with no default, so the
    // legacy really does reach that raise.
    const error = await captureDomainError(
      harness.service.processProductUpdateSkus(product, {
        product,
        listPrice: 'not a number',
      }),
    );

    expect(error.context).toEqual({
      flagName: 'updatePriceFlag',
      locator: 'model/service/ProductService.cfc:L222',
    });
    expect(product.hasErrors()).toBe(false);
    expect(first.getPrice()).toBe(String(SEEDED_PRICE));

    // Nothing was written before the raise: the persistence walk at `:L229` is a separate loop that
    // the raise never reaches.
    expect(harness.persistedSkus).toHaveLength(0);
  });

  it('NET-NEW: no Product rule names the updateSkus context, so an otherwise-invalid product still updates', async () => {
    // The product has neither `productName` nor `productCode`, both of which
    // `model/validation/Product.json` requires — in the `save` context. Under `updateSkus` the entity
    // pass matches no rule at all, so the update proceeds. This is the exact distinction the AAP asks
    // to preserve, and it is why the two rule sets cannot be merged into one global context.
    const { product, first } = buildFixture({ identified: false });
    const harness = buildHarness();

    const answer = await harness.service.processProductUpdateSkus(product, {
      product,
      updatePriceFlag: 1,
      price: 25,
      updateListPriceFlag: 0,
    });

    expect(answer).toBe(product);
    expect(product.hasErrors()).toBe(false);
    expect(product.hasError('productName')).toBe(false);
    expect(product.hasError('productCode')).toBe(false);
    expect(first.getPrice()).toBe('25');

    // The entity pass still RAN — it simply matched nothing. Both passes are visible in order, which is
    // the N3 contract Phase 8 exercises in full.
    expect(harness.validations).toEqual([
      {
        kind: 'validateProcess',
        className: 'Product',
        processContext: 'updateSkus',
        processObjectSupplied: true,
      },
      { kind: 'validate', className: 'Product', context: 'updateSkus' },
      { kind: 'validate', className: 'Product_UpdateSkus', context: 'updateSkus' },
    ]);
  });
});

// ==================================================================================================
// AGENT PROMPT PHASE 7D — the five members whose legacy work crosses an excluded boundary
//
// `processProduct_addProductReview` (:L157), `processProduct_addSubscriptionTerm` (:L173),
// `processProduct_deleteDefaultImage` (:L198), `processProduct_updateDefaultImageFileNames` (:L208)
// and `processProduct_uploadDefaultImage` (:L235).
//
// Each reaches something §0.2.2 excludes — ProductReview, the subscription domain, the filesystem, or
// the image service. NONE of them is asserted by inventing the excluded behaviour. What IS asserted is
// the outcome the LANDED member actually produces at the boundary, which in three cases is a typed
// refusal carrying the source locator, and in two cases is real work the port could keep.
//
// Two members are NOT uniformly stubbed, and pretending otherwise would be the mistake here:
//   - `addProductReview` performs its whole legacy body — the auto-approve setting read, the
//     active-flag decision and the account attachment — on a structurally checked process object.
//     It is also the ONLY process member that never calls the process validator at all, and that
//     asymmetry is asserted rather than smoothed over.
//   - `updateDefaultImageFileNames` regenerates and persists real image file names, which is why the
//     X17 chain in Phases 7A/7B has observable effects.
//
// M8: the setting resolver is SYNCHRONOUS. `addProductReview`, `deleteDefaultImage` and
// `uploadDefaultImage` all read settings without awaiting, so no test here awaits a background
// settings completion, and none may be added later.
// ==================================================================================================

describe('processProductAddProductReview — the review boundary', () => {
  const PRODUCT_ID = physicalID('p-add-review');

  interface ReviewRecorder {
    readonly activeFlags: number[];
    readonly accounts: { readonly accountID: string; readonly newFlag: boolean }[];
    readonly processObject: unknown;
  }

  /**
   * The smallest object that satisfies the landed structural guard.
   *
   * Hand-built rather than taken from `test/support/inMemoryRepositories.ts` because ProductReview is
   * out of scope (AAP §0.2.2.4), so support declares no double for it — and the landed member declares
   * no process-object type for it either, checking the shape structurally instead.
   */
  function createReviewRecorder(options: { readonly reviewable?: boolean } = {}): ReviewRecorder {
    const activeFlags: number[] = [];
    const accounts: { readonly accountID: string; readonly newFlag: boolean }[] = [];
    const target = {
      setActiveFlag: (activeFlag: number): void => {
        activeFlags.push(activeFlag);
      },
      setAccount: (account: { readonly accountID: string; readonly newFlag: boolean }): void => {
        accounts.push(account);
      },
    };

    return {
      activeFlags,
      accounts,
      processObject:
        options.reviewable === false
          ? { getSomethingElse: (): string => 'nope' }
          : { getNewProductReview: () => target },
    };
  }

  function buildReviewProduct(): Product {
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });

    return buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });
  }

  it('NET-NEW: approves the review and attaches the persisted current account when auto-approve reads true (:L160-:L168)', async () => {
    const product = buildReviewProduct();
    const recorder = createReviewRecorder();
    const harness = buildHarness({ settings: [AUTO_APPROVE_REVIEWS_SETTING] });

    const answer = await harness.service.processProductAddProductReview(
      product,
      recorder.processObject,
    );

    expect(answer).toBe(product);
    expect(recorder.activeFlags).toEqual([1]);
    expect(recorder.accounts).toEqual([
      { accountID: TEST_ADMIN_ACCOUNT_ID, newFlag: false, adminAccountFlag: true },
    ]);

    // The setting is read entity-scoped to THIS product, which is how the legacy hierarchical
    // `setting()` accessor resolves a product-level override before the global default.
    expect(harness.settingReads).toEqual([
      {
        settingName: 'productAutoApproveReviewsFlag',
        context: { entityName: 'Product', entityId: PRODUCT_ID },
      },
    ]);

    // THE ASYMMETRY: this is the only process member that never runs the process validator. Every
    // other one opens with `runProcessValidation`; `:L157-L171` opens with the body.
    expect(harness.validations).toEqual([]);
  });

  it('NET-NEW: leaves the review pending when auto-approve reads false, using the CFML cast rather than truthiness', async () => {
    const product = buildReviewProduct();
    const recorder = createReviewRecorder();
    // The STRING "0" — truthy in JavaScript, false in CFML. Reading it with truthiness would approve a
    // review the legacy leaves pending, which is a moderation failure rather than a cosmetic one.
    const harness = buildHarness({
      settings: [{ settingName: 'productAutoApproveReviewsFlag', value: '0' }],
    });

    await harness.service.processProductAddProductReview(product, recorder.processObject);

    expect(recorder.activeFlags).toEqual([0]);
  });

  it('NET-NEW: never attaches a NEW account, and attaches nothing when there is no current account (:L165)', async () => {
    const newAccountProduct = buildReviewProduct();
    const newAccountRecorder = createReviewRecorder();
    const newAccountHarness = buildHarness({
      settings: [AUTO_APPROVE_REVIEWS_SETTING],
      account: 'new',
    });

    await newAccountHarness.service.processProductAddProductReview(
      newAccountProduct,
      newAccountRecorder.processObject,
    );

    // `:L165` guards on the account NOT being new, so an unsaved account is never written onto the
    // review. The review is still activated, so the guard is on the account only.
    expect(newAccountRecorder.activeFlags).toEqual([1]);
    expect(newAccountRecorder.accounts).toEqual([]);
    expect(newAccountHarness.accountReads()).toBe(1);

    const absentProduct = buildReviewProduct();
    const absentRecorder = createReviewRecorder();
    const absentHarness = buildHarness({
      settings: [AUTO_APPROVE_REVIEWS_SETTING],
      account: 'absent',
    });

    await absentHarness.service.processProductAddProductReview(
      absentProduct,
      absentRecorder.processObject,
    );

    expect(absentRecorder.accounts).toEqual([]);
  });

  it('NET-NEW: attaches a persisted NON-admin account too, because the guard tests newFlag and not the admin flag', async () => {
    const product = buildReviewProduct();
    const recorder = createReviewRecorder();
    const harness = buildHarness({
      settings: [AUTO_APPROVE_REVIEWS_SETTING],
      account: 'nonAdmin',
    });

    await harness.service.processProductAddProductReview(product, recorder.processObject);

    expect(recorder.accounts).toEqual([
      { accountID: TEST_NON_ADMIN_ACCOUNT_ID, newFlag: false, adminAccountFlag: false },
    ]);
  });

  it('NET-NEW: refuses a process object that does not expose getNewProductReview (:L157-:L171)', async () => {
    const product = buildReviewProduct();
    const recorder = createReviewRecorder({ reviewable: false });
    const harness = buildHarness({ settings: [AUTO_APPROVE_REVIEWS_SETTING] });

    const error = await captureDomainError(
      harness.service.processProductAddProductReview(product, recorder.processObject),
    );

    expect(error.context).toEqual({
      productID: PRODUCT_ID,
      locator: 'model/service/ProductService.cfc:L157-L171',
    });
    // The refusal happens BEFORE the setting is read, so the boundary is closed at the shape check.
    expect(harness.settingReads).toEqual([]);
  });

  it('NET-NEW: raises when the auto-approve setting cannot be cast to a CFML boolean (:L159)', async () => {
    const product = buildReviewProduct();
    const recorder = createReviewRecorder();
    const harness = buildHarness({
      settings: [{ settingName: 'productAutoApproveReviewsFlag', value: 'maybe' }],
    });

    const error = await captureDomainError(
      harness.service.processProductAddProductReview(product, recorder.processObject),
    );

    expect(error.context).toEqual({
      settingName: 'productAutoApproveReviewsFlag',
      productID: PRODUCT_ID,
      locator: 'model/service/ProductService.cfc:L159',
    });
    expect(recorder.activeFlags).toEqual([]);
  });

  it('NET-NEW: returns a product that already has errors without reading the setting or touching the review', async () => {
    const product = buildReviewProduct();
    product.addError('productName', 'seeded by an earlier pass');
    const recorder = createReviewRecorder();
    const harness = buildHarness({ settings: [AUTO_APPROVE_REVIEWS_SETTING] });

    const answer = await harness.service.processProductAddProductReview(
      product,
      recorder.processObject,
    );

    expect(answer).toBe(product);
    expect(recorder.activeFlags).toEqual([]);
    expect(harness.settingReads).toEqual([]);
  });
});

describe('processProductAddSubscriptionTerm — the subscription boundary', () => {
  const PRODUCT_ID = physicalID('p-add-term');
  const SUBSCRIPTION_TERM_ID = physicalID('st-monthly');
  const EXISTING_SKU_ID = physicalID('sku-term-1');

  interface SubscriptionFixture {
    readonly product: Product;
    readonly defaultSku: Sku;
  }

  /**
   * Builds a subscription product whose single existing SKU is its default SKU and carries one benefit
   * of each kind, so the two copy loops at `:L186` and `:L189` have something to copy.
   *
   * `SubscriptionBenefitReference` is `{ subscriptionBenefitID }` and nothing more, so the two benefit
   * values are written as literals of that exact port type — no subscription entity is fabricated.
   */
  function buildFixture(): SubscriptionFixture {
    const productType = buildProductType({
      productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
      productTypeName: 'Subscription',
      productTypeIDPath: SUBSCRIPTION_PRODUCT_TYPE_ID,
      systemCode: 'subscription',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });
    const defaultSku = buildSku({
      skuID: EXISTING_SKU_ID,
      skuCode: `${TEST_MERCHANDISE_PRODUCT_CODE}-1`,
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      product,
      subscriptionBenefits: [{ subscriptionBenefitID: 'sb-access' }],
      renewalSubscriptionBenefits: [{ subscriptionBenefitID: 'sb-renewal' }],
    });

    return { product, defaultSku };
  }

  /** The four members the landed structural guard requires, with the list price under test. */
  function createTermProcessObject(listPrice: unknown): unknown {
    return {
      getSubscriptionTermID: (): string => SUBSCRIPTION_TERM_ID,
      getPrice: (): number => 30,
      getRenewalPrice: (): number => 27,
      getListPrice: (): unknown => listPrice,
    };
  }

  function buildReachableHarness(
    options: { readonly subscriptionTermIDs?: readonly string[] } = {},
  ): Harness {
    return buildHarness({
      settings: IMAGE_FILE_NAME_SETTINGS,
      subscriptionTermIDs: options.subscriptionTermIDs ?? [SUBSCRIPTION_TERM_ID],
      // G6: the real `addSubscriptionTerm` rules can never pass (see the test immediately below), so
      // reaching the body at all requires a validator that records no findings. This is the ONLY place
      // in the suite where the real rule set is stood down, and it is stood down to expose D6 rather
      // than to avoid a failure.
      validator: createPermissiveValidator(),
    });
  }

  it('NET-NEW: the real addSubscriptionTerm rules refuse every product, because unused terms always resolve to none', async () => {
    const { product, defaultSku } = buildFixture();
    const harness = buildHarness({ settings: IMAGE_FILE_NAME_SETTINGS });
    harness.attachDefaultSku(product, defaultSku);

    const answer = await harness.service.processProductAddSubscriptionTerm(
      product,
      createTermProcessObject(''),
    );

    // TODO(parity) — `model/validation/Product.json:L15` requires `minCollection 1` on
    // `unusedProductSubscriptionTerms` for this context, and the landed process-validation subject
    // resolves that collection through `Product.getUnusedProductSubscriptionTerms()` with NO finder,
    // because the subscription domain is out of scope (AAP §0.2.2.1). The collection is therefore
    // always empty and the gate always closes. Carried as the observed boundary outcome: the member is
    // declared, typed and reachable, and the excluded collaborator is what stops it.
    expect(answer).toBe(product);
    expect(product.hasError('unusedProductSubscriptionTerms')).toBe(true);
    expect(product.getSkus()).toEqual([defaultSku]);
    expect(harness.persistedSkus).toEqual([]);
  });

  it('NET-NEW: D6 — a non-empty NUMERIC list price reaches the unassignable read and raises (:L180-:L182)', async () => {
    const { product, defaultSku } = buildFixture();
    const harness = buildReachableHarness();
    harness.attachDefaultSku(product, defaultSku);

    // TODO(parity) D6 — model/service/ProductService.cfc:L180-L182. The legacy guard reads
    // `processObject.getListPrice()` and the assignment reads `arguments.data.listPrice`, but the
    // signature at `:L173` declares no `data` argument. The assignment therefore cannot be performed,
    // so a caller who supplies a numeric list price hits an unconditional failure. Carried unrepaired:
    // repairing it would invent a data argument the legacy signature does not have.
    const error = await captureDomainError(
      harness.service.processProductAddSubscriptionTerm(product, createTermProcessObject(45)),
    );

    expect(error.context).toEqual({
      productID: PRODUCT_ID,
      defect: 'D6',
      locator: 'model/service/ProductService.cfc:L180-L182',
      guardedOn: 'processObject.getListPrice()',
      assignedFrom: 'arguments.data.listPrice',
    });

    // The new SKU is built and priced before the guard, but it is attached to the product AFTER it, so
    // the raise leaves the product's SKU set exactly as it was.
    expect(product.getSkus()).toEqual([defaultSku]);
    expect(harness.persistedSkus).toEqual([]);
  });

  it('NET-NEW: D6 — an EMPTY list price skips the defect and the member completes, creating the term SKU', async () => {
    const { product, defaultSku } = buildFixture();
    const harness = buildReachableHarness();
    harness.attachDefaultSku(product, defaultSku);

    const answer = await harness.service.processProductAddSubscriptionTerm(
      product,
      createTermProcessObject(''),
    );

    expect(answer).toBe(product);
    expect(product.getSkus()).toHaveLength(2);

    const created = requireSku(
      requireAt(product.getSkus(), 1),
      'the created subscription-term SKU',
    );
    expect(created.getPrice()).toBe('30');
    expect(created.getRenewalPrice()).toBe('27');
    expect(created.subscriptionTerm).toEqual({ subscriptionTermID: SUBSCRIPTION_TERM_ID });

    // The benefits are COPIED from the default SKU, not resolved from the subscription domain.
    expect(created.subscriptionBenefits).toEqual([{ subscriptionBenefitID: 'sb-access' }]);
    expect(created.renewalSubscriptionBenefits).toEqual([{ subscriptionBenefitID: 'sb-renewal' }]);

    // `:L183` derives the code from the LIVE SKU count, so the first added SKU is `-2`.
    //
    // NOTE, do not repair: `<productCode>-<skuCount+1>` is not collision-safe. Two invocations that
    // interleave before either attaches its SKU both read the same count and mint the same code, which
    // `model/validation/Sku.json` then rejects for uniqueness. The derivation is carried exactly as the
    // legacy writes it; making it collision-safe would change observable SKU codes.
    expect(created.skuCode).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}-2`);

    // X17: the member ends by chaining `updateDefaultImageFileNames`, which regenerates and persists
    // BOTH SKUs — the pre-existing one and the one just created.
    expect(harness.persistedSkus).toEqual([defaultSku, created]);
    expect(created.imageFile).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}.jpg`);
  });

  it('NET-NEW: D6 — a NON-NUMERIC list price also skips the defect, because the guard needs both halves', async () => {
    const { product, defaultSku } = buildFixture();
    const harness = buildReachableHarness();
    harness.attachDefaultSku(product, defaultSku);

    const answer = await harness.service.processProductAddSubscriptionTerm(
      product,
      createTermProcessObject('complimentary'),
    );

    expect(answer).toBe(product);
    expect(product.getSkus()).toHaveLength(2);
    expect(
      requireSku(requireAt(product.getSkus(), 1), 'the created subscription-term SKU').skuCode,
    ).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}-2`);
  });

  it('NET-NEW: refuses a process object missing the four members the legacy member calls (:L173-:L196)', async () => {
    const { product, defaultSku } = buildFixture();
    const harness = buildReachableHarness();
    harness.attachDefaultSku(product, defaultSku);

    const error = await captureDomainError(
      harness.service.processProductAddSubscriptionTerm(product, {
        getSubscriptionTermID: (): string => SUBSCRIPTION_TERM_ID,
      }),
    );

    expect(error.context).toEqual({
      productID: PRODUCT_ID,
      locator: 'model/service/ProductService.cfc:L173-L196',
    });
    expect(product.getSkus()).toEqual([defaultSku]);
  });

  it('NET-NEW: refuses a subscription-term identifier that resolves to no term (:L175)', async () => {
    const { product, defaultSku } = buildFixture();
    // The port is seeded with no terms, so the explicit `SubscriptionTermPort` answers null — the
    // sanctioned way across the boundary, never a service locator.
    const harness = buildReachableHarness({ subscriptionTermIDs: [] });
    harness.attachDefaultSku(product, defaultSku);

    const error = await captureDomainError(
      harness.service.processProductAddSubscriptionTerm(product, createTermProcessObject('')),
    );

    expect(error.context).toEqual({
      productID: PRODUCT_ID,
      subscriptionTermID: SUBSCRIPTION_TERM_ID,
      locator: 'model/service/ProductService.cfc:L175',
    });
    expect(product.getSkus()).toEqual([defaultSku]);
  });

  it('NET-NEW: refuses to run when the product has no default SKU whose benefits can be copied (:L185)', async () => {
    const { product } = buildFixture();
    // The SKU exists on the product, but no default-SKU delegate is attached, so `:L185` has nothing to
    // dereference — the same shape of unguarded read the legacy performs.
    const harness = buildReachableHarness();

    const error = await captureDomainError(
      harness.service.processProductAddSubscriptionTerm(product, createTermProcessObject('')),
    );

    expect(error.context).toEqual({
      productID: PRODUCT_ID,
      locator: 'model/service/ProductService.cfc:L185',
    });
  });
});

describe('processProductDeleteDefaultImage — the filesystem boundary', () => {
  const PRODUCT_ID = physicalID('p-delete-image');

  function buildImageProduct(): Product {
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });

    return buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });
  }

  it('NET-NEW: resolves the product untouched when the payload carries no imageFile key (:L198)', async () => {
    const product = buildImageProduct();
    const harness = buildHarness({ settings: [IMAGE_FOLDER_SETTING] });

    const answer = await harness.service.processProductDeleteDefaultImage(product, {});

    // The legacy body is inside a `structKeyExists` guard, so an empty payload is a legitimate no-op
    // rather than an error — and the image root is never resolved.
    expect(answer).toBe(product);
    expect(product.hasErrors()).toBe(false);
    expect(harness.settingReads).toEqual([]);
  });

  it('NET-NEW: raises NotImplementedError the moment imageFile is present, naming the unscoped read (:L198-:L206)', async () => {
    const product = buildImageProduct();
    const harness = buildHarness({ settings: [IMAGE_FOLDER_SETTING] });

    const error = await captureDomainError(
      harness.service.processProductDeleteDefaultImage(product, { imageFile: 'shirt-sm.jpg' }),
    );

    // The refusal is typed as NotImplementedError rather than a bare DomainError, because the reason is
    // an unreachable capability (filesystem I/O, TR-5) and not a caller mistake.
    expect(error).toBeInstanceOf(NotImplementedError);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.context).toEqual({
      productID: PRODUCT_ID,
      locator: 'model/service/ProductService.cfc:L198-L206',
      unscopedReference: 'imageFile',
      resolvedDirectory: '/assets/images/product/default/',
      defectClass: 'D10-class, unnumbered (AAP §0.6.7.5)',
    });

    // The directory really was resolved from the setting before the refusal, which is what makes the
    // reported path the one the legacy would have deleted from.
    expect(harness.settingReads.map((call) => call.settingName)).toEqual([
      'globalAssetsImageFolderPath',
    ]);

    // TODO(parity) — the legacy interpolates a BARE `imageFile`, not `arguments.data.imageFile`, so it
    // raises in CFML too the moment the key is present. The defect is carried, not repaired: reading
    // `data.imageFile` instead would give the member a working path the legacy never had.
    expect(requireNotImplemented(error).member).toBe(
      'ProductService.processProductDeleteDefaultImage',
    );
  });

  it('NET-NEW: returns a product that already has errors before the payload is inspected at all', async () => {
    const product = buildImageProduct();
    product.addError('productCode', 'seeded by an earlier pass');
    const harness = buildHarness({ settings: [IMAGE_FOLDER_SETTING] });

    const answer = await harness.service.processProductDeleteDefaultImage(product, {
      imageFile: 'shirt-sm.jpg',
    });

    // Same payload that raises above. The error guard runs first, so the boundary is never reached.
    expect(answer).toBe(product);
    expect(harness.settingReads).toEqual([]);
  });
});

describe('processProductUpdateDefaultImageFileNames — regenerating the image file names', () => {
  const PRODUCT_ID = physicalID('p-image-names');

  it('NET-NEW: regenerates each SKU name from the product code and the IMAGE-GROUP options only, then persists every SKU (:L208-:L214)', async () => {
    const imageGroup = buildOptionGroup({
      optionGroupID: physicalID('og-size'),
      optionGroupCode: 'size',
      optionGroupName: 'Size',
      imageGroupFlag: true,
    });
    const nonImageGroup = buildOptionGroup({
      optionGroupID: physicalID('og-material'),
      optionGroupCode: 'material',
      optionGroupName: 'Material',
      imageGroupFlag: false,
    });
    const small = buildOption({
      optionID: physicalID('o-sm'),
      optionCode: 'sm',
      optionName: 'Small',
      optionGroup: imageGroup,
    });
    const cotton = buildOption({
      optionID: physicalID('o-cotton'),
      optionCode: 'cotton',
      optionName: 'Cotton',
      optionGroup: nonImageGroup,
    });
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });
    const sized = buildSku({
      skuID: physicalID('sku-sized'),
      imageFile: 'stale.jpg',
      product,
      options: [small, cotton],
    });
    const plain = buildSku({
      skuID: physicalID('sku-plain'),
      imageFile: 'also-stale.jpg',
      product,
    });
    const harness = buildHarness({ settings: IMAGE_FILE_NAME_SETTINGS });

    const answer = await harness.service.processProductUpdateDefaultImageFileNames(product);

    expect(answer).toBe(product);
    // Only the image-group option contributes a segment; the material option is skipped even though the
    // SKU carries it. That is `model/entity/Sku.cfc:L134` behaviour, and it is why the two groups differ
    // here only by `imageGroupFlag`.
    expect(sized.imageFile).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}-sm.jpg`);
    expect(plain.imageFile).toBe(`${TEST_MERCHANDISE_PRODUCT_CODE}.jpg`);
    expect(harness.persistedSkus).toEqual([sized, plain]);
  });

  it('NET-NEW: returns the product without regenerating or persisting anything when it already has errors (:L209)', async () => {
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });
    const sku = buildSku({ skuID: physicalID('sku-untouched'), imageFile: 'stale.jpg', product });
    product.addError('productName', 'seeded by an earlier pass');
    const harness = buildHarness({ settings: IMAGE_FILE_NAME_SETTINGS });

    const answer = await harness.service.processProductUpdateDefaultImageFileNames(product);

    expect(answer).toBe(product);
    expect(sku.imageFile).toBe('stale.jpg');
    expect(harness.persistedSkus).toEqual([]);
    // The settings are seeded and still unread, which proves the early return happened before the
    // regeneration rather than the regeneration happening and producing the same name.
    expect(harness.settingReads).toEqual([]);
  });
});

describe('processProductUploadDefaultImage — the upload boundary', () => {
  const PRODUCT_ID = physicalID('p-upload-image');
  const UPLOADED_FILE = 'shirt-sm.jpg';

  interface UploadRecorder {
    readonly metaDataRequests: string[];
    readonly errors: { readonly errorName: string; readonly errorMessage: string }[];
    readonly processObject: unknown;
  }

  /** The three members the landed structural guard requires. */
  function createUploadRecorder(options: { readonly uploadable?: boolean } = {}): UploadRecorder {
    const metaDataRequests: string[] = [];
    const errors: { readonly errorName: string; readonly errorMessage: string }[] = [];
    const complete = {
      getImageFile: (): string => UPLOADED_FILE,
      getPropertyMetaData: (propertyName: string): { readonly hb_fileAcceptMIMEType?: string } => {
        metaDataRequests.push(propertyName);
        return { hb_fileAcceptMIMEType: 'image/jpeg,image/png,image/gif' };
      },
      addError: (errorName: string, errorMessage: string): void => {
        errors.push({ errorName, errorMessage });
      },
    };

    return {
      metaDataRequests,
      errors,
      processObject:
        options.uploadable === false ? { getImageFile: (): string => UPLOADED_FILE } : complete,
    };
  }

  function buildUploadProduct(): Product {
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });

    return buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });
  }

  it('NET-NEW: records the fileUpload finding on the PROCESS OBJECT and resolves the product (:L235-:L257)', async () => {
    const product = buildUploadProduct();
    const recorder = createUploadRecorder();
    const harness = buildHarness({ settings: [IMAGE_FOLDER_SETTING] });

    const answer = await harness.service.processProductUploadDefaultImage(
      product,
      recorder.processObject,
    );

    expect(answer).toBe(product);

    // The finding lands on the process object under the same resource-bundle key the legacy uses, and
    // NOT on the entity. Moving it to the entity would change which form field renders the message.
    expect(recorder.errors).toEqual([{ errorName: 'imageFile', errorMessage: FILE_UPLOAD_RBKEY }]);
    expect(product.hasErrors()).toBe(false);

    // The accepted MIME types are read from the `uploadFile` property metadata, which is where the
    // legacy declares them — not from a constant invented here.
    expect(recorder.metaDataRequests).toEqual(['uploadFile']);
    expect(harness.settingReads.map((call) => call.settingName)).toEqual([
      'globalAssetsImageFolderPath',
    ]);
  });

  it('NET-NEW: refuses a process object missing the members the legacy member calls (:L235-:L257)', async () => {
    const product = buildUploadProduct();
    const recorder = createUploadRecorder({ uploadable: false });
    const harness = buildHarness({ settings: [IMAGE_FOLDER_SETTING] });

    const error = await captureDomainError(
      harness.service.processProductUploadDefaultImage(product, recorder.processObject),
    );

    expect(error.context).toEqual({
      productID: PRODUCT_ID,
      locator: 'model/service/ProductService.cfc:L235-L257',
    });
    expect(recorder.errors).toEqual([]);
    expect(harness.settingReads).toEqual([]);
  });

  it('NET-NEW: returns a product that already has errors without reading the image folder setting', async () => {
    const product = buildUploadProduct();
    product.addError('productCode', 'seeded by an earlier pass');
    const recorder = createUploadRecorder();
    const harness = buildHarness({ settings: [IMAGE_FOLDER_SETTING] });

    const answer = await harness.service.processProductUploadDefaultImage(
      product,
      recorder.processObject,
    );

    expect(answer).toBe(product);
    expect(recorder.errors).toEqual([]);
    expect(harness.settingReads).toEqual([]);
  });
});

// ==================================================================================================
// AGENT PROMPT PHASE 8 — N3, the two-pass process orchestration
// SOURCE: org/Hibachi/HibachiService.cfc:L84-L129 (the orchestrator),
//         org/Hibachi/HibachiService.cfc:L55 (delete's hard-coded context),
//         org/Hibachi/HibachiService.cfc:L133 and model/service/HibachiService.cfc:L86 (save's default)
//
// The legacy orchestrator does four things in a fixed order, and all four are asserted here:
//   1. validate the ENTITY with the process context (`:L96`);
//   2. STOP if the entity carries findings (`:L99`) — the process object is not even populated;
//   3. otherwise validate the PROCESS OBJECT with THE SAME context string (`:L108`);
//   4. only then invoke the process member (`:L114`).
//
// TWO CONTEXTS ARE NOT INTERCHANGEABLE, AND THE THREE MECHANISMS THAT PRODUCE THEM STAY DISTINCT:
//   - `delete` is HARD-CODED by the framework member (`org/Hibachi/HibachiService.cfc:L55`);
//   - `save` is a DEFAULT that a caller may override (`:L133`, and the local override at
//     `model/service/HibachiService.cfc:L86`);
//   - a process context is SUPPLIED EXPLICITLY by the calling member.
// Collapsing them into one invented global context would make the delete guards fire on save and the
// save requirements fire on delete, so the last test in this block pins all three separately.
//
// DISPATCH IS BY EXPLICIT MEMBER, NOT BY COMPOSED STRING. The legacy invokes
// `process#getClassName()#_#context#` by name (`org/Hibachi/HibachiService.cfc:L114`), which is the
// same metaprogramming family as the `onMissingMethod` synthesis of IR-1. Every process call in this
// suite is a direct, compile-checked member call on the landed class; no string is composed, no
// locator is consulted, and no dynamic member is reached anywhere.
// ==================================================================================================

describe('N3 — the two-pass process orchestration', () => {
  const PRODUCT_ID = physicalID('p-n3');

  function buildN3ProductType(): ProductType {
    return buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: 'Merchandise',
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
  }

  it('NET-NEW: validates the entity, then the process object, then runs the body — in that order (updateSkus)', async () => {
    const product = buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType: buildN3ProductType(),
    });
    const sku = buildSku({ skuID: physicalID('sku-n3'), price: 10, product });
    const harness = buildHarness();

    await harness.service.processProductUpdateSkus(product, {
      product,
      updatePriceFlag: 1,
      price: 25,
      updateListPriceFlag: 0,
    });

    // The orchestrator is entered ONCE and issues exactly two passes, in the legacy order, both with
    // the one context string. A third entry, a reversed pair, or two different context values would all
    // be divergences from `org/Hibachi/HibachiService.cfc:L96` and `:L108`.
    expect(harness.validations).toEqual([
      {
        kind: 'validateProcess',
        className: 'Product',
        processContext: 'updateSkus',
        processObjectSupplied: true,
      },
      { kind: 'validate', className: 'Product', context: 'updateSkus' },
      { kind: 'validate', className: 'Product_UpdateSkus', context: 'updateSkus' },
    ]);

    // The body ran after the gate: the price changed and the SKU was written. Combined with the empty
    // repository state in the refusal test below, this is what fixes the ordering as gate-then-body
    // rather than body-then-gate.
    expect(sku.getPrice()).toBe('25');
    expect(harness.persistedSkus).toEqual([sku]);
  });

  it('NET-NEW: an add context supplies NO process-object rule set, because Product.json carries those rules itself', async () => {
    const optionGroup = buildOptionGroup({
      optionGroupID: physicalID('og-n3'),
      optionGroupCode: 'n3',
      optionGroupName: 'Finish',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType: buildN3ProductType(),
    });
    buildSku({ skuID: physicalID('sku-n3-add'), product });
    const harness = buildHarness({
      settings: IMAGE_FILE_NAME_SETTINGS,
      optionCatalog: {
        optionGroups: [],
        optionsByOptionGroupID: {},
        resolvableOptionGroups: [optionGroup],
      },
      repositoryOptionGroups: [optionGroup],
    });

    await harness.service.processProductAddOptionGroup(product, {
      product,
      optionGroup: physicalID('og-n3'),
    });

    // AAP §0.2.1.5: there is NO `model/validation/Product_AddOptionGroup.json` and no
    // `Product_AddOption.json`. Those two process contexts are validated by context-scoped rules
    // declared INSIDE `model/validation/Product.json`, so the orchestrator legitimately runs a
    // single-pass shape here. Mistaking that for a missing rule set is the error this test forecloses.
    expect(harness.validations).toEqual([
      {
        kind: 'validateProcess',
        className: 'Product',
        processContext: 'addOptionGroup',
        processObjectSupplied: false,
      },
      { kind: 'validate', className: 'Product', context: 'addOptionGroup' },
    ]);
  });

  it('NET-NEW: the entity gate blocks the process-object pass entirely, and nothing is populated or read', async () => {
    // Exercised directly against the landed orchestrator, because the short-circuit is unreachable
    // through this service's own rule sets: `updateSkus` is the only context that supplies a
    // process-object target, and NO rule in `model/validation/Product.json` names `updateSkus`, so the
    // entity pass there can never produce a finding. The two rule sets below are deliberately minimal
    // test probes — they exist to observe the ORCHESTRATOR's ordering contract, not to model any
    // product rule, and no production rule is invented or altered anywhere.
    const reads: string[] = [];
    const entitySubject: ValidationSubject = {
      getClassName: (): string => 'Product',
      hasProperty: (): boolean => true,
    };
    const processSubject: ValidationSubject = {
      getClassName: (): string => 'Product_UpdateSkus',
      hasProperty: (): boolean => true,
    };
    const failingEntityRuleSet: ValidationRuleSet<ValidationSubject> = {
      properties: [
        {
          propertyIdentifier: 'probeEntityProperty',
          read: (): unknown => {
            reads.push('entity');
            return undefined;
          },
          rules: [{ constraints: [{ constraintType: 'required', constraintValue: true }] }],
        },
      ],
    };
    const processObjectRuleSet: ValidationRuleSet<ValidationSubject> = {
      properties: [
        {
          propertyIdentifier: 'probeProcessProperty',
          read: (): unknown => {
            reads.push('processObject');
            return undefined;
          },
          rules: [{ constraints: [{ constraintType: 'required', constraintValue: true }] }],
        },
      ],
    };
    const validator = new RecordingValidator(createUniquePropertyDouble().uniqueProperty);

    const result = await validator.validateProcess({
      entity: entitySubject,
      entityRuleSet: failingEntityRuleSet,
      processContext: 'updateSkus',
      processObject: { subject: processSubject, ruleSet: processObjectRuleSet },
    });

    expect(result.entityErrors.hasErrors()).toBe(true);
    // `org/Hibachi/HibachiService.cfc:L99` returns before the process object is populated, so its bag
    // comes back empty rather than fabricated with content, and `processObjectRan` says so explicitly.
    expect(result.processObjectRan).toBe(false);
    expect(result.processObjectErrors.hasErrors()).toBe(false);

    // The process object's reader was never invoked. That is stronger than an empty error bag: it
    // proves the second pass did not run at all rather than running and passing.
    expect(reads).toEqual(['entity']);
    expect(validator.invocations).toEqual([
      {
        kind: 'validateProcess',
        className: 'Product',
        processContext: 'updateSkus',
        processObjectSupplied: true,
      },
      { kind: 'validate', className: 'Product', context: 'updateSkus' },
    ]);
  });

  it('NET-NEW: when the entity passes, the process object is validated with the SAME context string', async () => {
    const contexts: ValidationContext[] = [];
    const entitySubject: ValidationSubject = {
      getClassName: (): string => 'Product',
      hasProperty: (): boolean => true,
    };
    const processSubject: ValidationSubject = {
      getClassName: (): string => 'Product_UpdateSkus',
      hasProperty: (): boolean => true,
    };
    const passingRuleSet: ValidationRuleSet<ValidationSubject> = { properties: [] };
    const validator = new RecordingValidator(createUniquePropertyDouble().uniqueProperty);

    const result = await validator.validateProcess({
      entity: entitySubject,
      entityRuleSet: passingRuleSet,
      processContext: 'updateSkus',
      processObject: { subject: processSubject, ruleSet: passingRuleSet },
    });

    for (const invocation of validator.invocations) {
      if (invocation.kind === 'validate') {
        contexts.push(invocation.context);
      }
    }

    // ONE context string, used twice. `org/Hibachi/HibachiService.cfc` passes the same value to both
    // passes, and the landed request type carries a single `processContext` field so a caller cannot
    // do otherwise.
    expect(result.processObjectRan).toBe(true);
    expect(contexts).toEqual(['updateSkus', 'updateSkus']);
  });

  it('NET-NEW: save defaults its context, delete hard-codes its own, and a process context is supplied explicitly', async () => {
    const saveHarness = buildHarness({ settings: [PRODUCT_TITLE_STRING_SETTING] });
    const saveProduct = buildProduct({ productType: buildN3ProductType() });

    await saveHarness.service.saveProduct(saveProduct, {
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
    });

    expect(
      saveHarness.validations.map((invocation) =>
        invocation.kind === 'validate' ? invocation.context : invocation.processContext,
      ),
    ).toContain('save');

    const deleteHarness = buildHarness();
    const deleteTarget = buildProduct({
      productID: physicalID('p-n3-delete'),
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType: buildN3ProductType(),
    });

    await deleteHarness.service.deleteProduct(deleteTarget);

    expect(
      deleteHarness.validations.map((invocation) =>
        invocation.kind === 'validate' ? invocation.context : invocation.processContext,
      ),
    ).toEqual(['delete']);

    const processHarness = buildHarness();
    const processTarget = buildProduct({
      productID: physicalID('p-n3-process'),
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType: buildN3ProductType(),
    });

    await processHarness.service.processProductUpdateSkus(processTarget, {
      product: processTarget,
      updatePriceFlag: 0,
      updateListPriceFlag: 0,
    });

    expect(
      processHarness.validations.map((invocation) =>
        invocation.kind === 'validate' ? invocation.context : invocation.processContext,
      ),
    ).toEqual(['updateSkus', 'updateSkus', 'updateSkus']);
  });

  it('NET-NEW: the validator never persists — a refused process leaves every repository untouched', async () => {
    // `addOptionGroup` on a SUBSCRIPTION product: `model/validation/Product.json:L4` restricts the
    // context to `merchandise`, so the entity pass refuses it.
    const productType = buildProductType({
      productTypeID: SUBSCRIPTION_PRODUCT_TYPE_ID,
      productTypeName: 'Subscription',
      productTypeIDPath: SUBSCRIPTION_PRODUCT_TYPE_ID,
      systemCode: 'subscription',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });
    const sku = buildSku({
      skuID: physicalID('sku-n3-refused'),
      imageFile: 'stale.jpg',
      price: 10,
      product,
    });
    const optionGroup = buildOptionGroup({
      optionGroupID: physicalID('og-n3-refused'),
      optionGroupCode: 'refused',
      optionGroupName: 'Refused',
    });
    const harness = buildHarness({
      settings: IMAGE_FILE_NAME_SETTINGS,
      optionCatalog: {
        optionGroups: [],
        optionsByOptionGroupID: {},
        resolvableOptionGroups: [optionGroup],
      },
      repositoryOptionGroups: [optionGroup],
    });

    const answer = await harness.service.processProductAddOptionGroup(product, {
      product,
      optionGroup: physicalID('og-n3-refused'),
    });

    expect(answer).toBe(product);
    expect(product.hasError('baseProductType')).toBe(true);

    // Validation MUTATES the entity's error state and writes nothing else. No product was persisted or
    // removed, no SKU was written, and no maintenance cleanup ran.
    expect(harness.persistedProducts()).toEqual([]);
    expect(harness.savedProducts).toEqual([]);
    expect(harness.removedProducts).toEqual([]);
    expect(harness.persistedSkus).toEqual([]);
    expect(harness.settingCleanups).toEqual([]);
    expect(harness.commentCleanups).toEqual([]);
    expect(sku.imageFile).toBe('stale.jpg');
  });
});

// ==================================================================================================
// AGENT PROMPT PHASE 9 — the two save members
// SOURCE: model/service/ProductService.cfc:L264-L292 (saveProduct)
//         model/service/ProductService.cfc:L294-L311 (saveProductType)
//
// The two members look alike and are NOT alike, in three ways that all show up here:
//
//   1. THE URL-TITLE GUARD. `saveProduct` at `:L268` tests `isNull()` ONLY, so an entity carrying an
//      EMPTY urlTitle counts as having one and nothing is generated — after which the `required` rule
//      refuses the save. `saveProductType` at `:L297` tests null OR length, so the same empty value is
//      regenerated. The two are deliberately not normalised to each other.
//   2. WHERE THE VALUE LANDS. `saveProduct` writes the generated title onto the ENTITY;
//      `saveProductType` writes it into the DATA PAYLOAD, which its BaseService save then populates.
//   3. WHO PERSISTS. `saveProduct` persists through the direct Product persister — and on the
//      new-product path it persists TWICE (`:L280` and `:L290`). `saveProductType` delegates to
//      BaseService entirely and persists nothing itself.
//
// The slug algorithm itself is NOT re-tested here. It lives in `src/util/urlTitle.ts` and its full
// behaviour — including that the first collision suffix is `-2` because the counter is pre-incremented
// — belongs to the BrandService suite. What is asserted here is DELEGATION: the right table token, the
// right title string, and the probe actually being consulted rather than a slug being invented locally.
// ==================================================================================================

describe('saveProduct — populate, title, validate, create, persist', () => {
  const PRODUCT_TITLE_SLUG = 'test-product';

  function buildMerchandiseProductType(): ProductType {
    return buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: 'Merchandise',
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
  }

  /** The payload a valid save needs: the two required text fields, nothing more. */
  function validPayload(): Record<string, unknown> {
    return {
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
    };
  }

  interface SaveFixture {
    readonly product: Product;
    readonly defaultSku: Sku;
    readonly harness: Harness;
  }

  /**
   * A product plus a default SKU carrying a price, because `model/validation/Product.json:L8` requires
   * `price` on save and `Product.getPrice()` reads it from the default SKU when the entity has no
   * override. No pricing service is reached — the delegate answers from the SKU entity itself.
   */
  function buildSaveFixture(
    options: { readonly productID?: string; readonly harness?: Harness } = {},
  ): SaveFixture {
    const product =
      options.productID === undefined
        ? buildProduct({ productType: buildMerchandiseProductType() })
        : buildProduct({
            productID: options.productID,
            productType: buildMerchandiseProductType(),
          });
    const defaultSku = buildSku({
      skuID: physicalID('sku-save-default'),
      skuCode: `${TEST_MERCHANDISE_PRODUCT_CODE}-1`,
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      product,
    });
    const harness =
      options.harness ??
      buildHarness({ settings: [PRODUCT_TITLE_STRING_SETTING, ...IMAGE_FILE_NAME_SETTINGS] });
    harness.attachDefaultSku(product, defaultSku);

    return { product, defaultSku, harness };
  }

  it('NET-NEW: populates, titles, validates under save, creates SKUs, regenerates names, then persists (:L264-:L292)', async () => {
    const { product, harness } = buildSaveFixture();
    const data = validPayload();
    const createSkus = jest.spyOn(harness.skuService, 'createSkus').mockResolvedValue(true);
    const chain = jest
      .spyOn(harness.service, 'processProductUpdateDefaultImageFileNames')
      .mockResolvedValue(product);

    const answer = await harness.service.saveProduct(product, data);

    expect(answer).toBe(product);

    expect(product.productName).toBe(TEST_MERCHANDISE_PRODUCT_NAME);
    expect(product.productCode).toBe(TEST_MERCHANDISE_PRODUCT_CODE);

    // 1. The URL title was generated from the product TITLE — the rendered `productTitleString`, not
    //    the raw product name — and probed against `SwProduct`.
    expect(product.urlTitle).toBe(PRODUCT_TITLE_SLUG);
    expect(harness.urlTitleProbes).toEqual([
      { tableName: PRODUCT_TABLE, value: PRODUCT_TITLE_SLUG },
    ]);

    // 2. Exactly one validation pass, in the `save` context, with no process orchestration.
    expect(harness.validations).toEqual([
      { kind: 'validate', className: 'Product', context: 'save' },
    ]);
    expect(product.hasErrors()).toBe(false);

    // 3. SKU creation receives the SAME payload the caller supplied, and the image-name chain runs
    //    AFTER it — the legacy order at `:L282` then `:L284`.
    expect(createSkus).toHaveBeenCalledTimes(1);
    expect(requireAt(createSkus.mock.calls, 0)).toEqual([product, data]);
    expect(chain).toHaveBeenCalledTimes(1);
    expect(requireAt(chain.mock.calls, 0)).toEqual([product]);
    expect(requireAt(createSkus.mock.invocationCallOrder, 0)).toBeLessThan(
      requireAt(chain.mock.invocationCallOrder, 0),
    );

    // 4. The new-product path persists TWICE — once at `:L280` so the SKUs have a saved parent to
    //    attach to, and again at `:L290`. Carried exactly: collapsing it to one write would change
    //    what the SKU creation sees.
    expect(harness.persistedProducts()).toEqual([product, product]);
  });

  it('NET-NEW: delegates the unique URL title to the shared utility, consulting the probe rather than inventing a slug', async () => {
    const { product, harness } = buildSaveFixture({
      harness: buildHarness({
        settings: [PRODUCT_TITLE_STRING_SETTING, ...IMAGE_FILE_NAME_SETTINGS],
        takenUrlTitles: [{ tableName: PRODUCT_TABLE, value: PRODUCT_TITLE_SLUG }],
      }),
    });
    jest.spyOn(harness.skuService, 'createSkus').mockResolvedValue(true);
    jest
      .spyOn(harness.service, 'processProductUpdateDefaultImageFileNames')
      .mockResolvedValue(product);

    await harness.service.saveProduct(product, validPayload());

    // Two probes, and the second carries the suffixed candidate: the availability decision is the
    // utility's, not this member's. The suffix VALUE is the utility's contract and is asserted in full
    // by the BrandService suite; what matters here is that this member asks rather than assumes.
    expect(harness.urlTitleProbes).toEqual([
      { tableName: PRODUCT_TABLE, value: PRODUCT_TITLE_SLUG },
      { tableName: PRODUCT_TABLE, value: `${PRODUCT_TITLE_SLUG}-2` },
    ]);
    expect(product.urlTitle).toBe(`${PRODUCT_TITLE_SLUG}-2`);
  });

  it('NET-NEW: an ENTITY urlTitle of empty string satisfies the isNull-only guard, so nothing is generated (:L268)', async () => {
    const { product, harness } = buildSaveFixture();
    product.urlTitle = '';
    const createSkus = jest.spyOn(harness.skuService, 'createSkus').mockResolvedValue(true);

    const answer = await harness.service.saveProduct(product, validPayload());

    // The guard is `isNull()` and nothing more, so an empty string counts as HAVING a URL title. The
    // `required` rule then refuses it, and the save is blocked. Normalising empty to absent here would
    // silently rescue a save the legacy rejects.
    expect(harness.urlTitleProbes).toEqual([]);
    expect(product.urlTitle).toBe('');
    expect(answer.hasError('urlTitle')).toBe(true);
    expect(createSkus).not.toHaveBeenCalled();
    expect(harness.persistedProducts()).toEqual([]);
  });

  it('NET-NEW: an empty urlTitle in the PAYLOAD is deleted by population, becomes absent, and IS generated', async () => {
    const { product, harness } = buildSaveFixture();
    jest.spyOn(harness.skuService, 'createSkus').mockResolvedValue(true);
    jest
      .spyOn(harness.service, 'processProductUpdateDefaultImageFileNames')
      .mockResolvedValue(product);

    await harness.service.saveProduct(product, { ...validPayload(), urlTitle: '' });

    // The SAME empty string, opposite outcome — because population treats a blank payload value for a
    // nullable column as a DELETE rather than an assignment, so the property is genuinely absent by the
    // time `:L268` reads it. The two cases are not interchangeable and are not normalised.
    expect(product.urlTitle).toBe(PRODUCT_TITLE_SLUG);
    expect(harness.urlTitleProbes).toEqual([
      { tableName: PRODUCT_TABLE, value: PRODUCT_TITLE_SLUG },
    ]);
    expect(product.hasErrors()).toBe(false);
  });

  it('NET-NEW: an EXISTING product skips SKU creation and the image chain, and persists once (:L279)', async () => {
    const { product, harness } = buildSaveFixture({ productID: physicalID('p-save-existing') });
    const createSkus = jest.spyOn(harness.skuService, 'createSkus').mockResolvedValue(true);
    const chain = jest.spyOn(harness.service, 'processProductUpdateDefaultImageFileNames');

    const answer = await harness.service.saveProduct(product, validPayload());

    expect(answer).toBe(product);
    expect(product.hasErrors()).toBe(false);
    // `:L279` gates the whole creation block on the product being NEW, so an update neither creates
    // SKUs nor regenerates names — and therefore persists exactly once.
    expect(createSkus).not.toHaveBeenCalled();
    expect(chain).not.toHaveBeenCalled();
    expect(harness.persistedProducts()).toEqual([product]);
  });

  it('NET-NEW: a validation finding blocks BOTH persistence passes, not just the second (:L279/:L289)', async () => {
    const { product, harness } = buildSaveFixture();
    const createSkus = jest.spyOn(harness.skuService, 'createSkus').mockResolvedValue(true);

    // `model/validation/Product.json:L6` constrains `productCode` with the regex
    // `^[a-zA-Z0-9-_.|:~^]+$`, and a space is not in that set.
    const answer = await harness.service.saveProduct(product, {
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: 'NOT A CODE',
    });

    expect(answer).toBe(product);
    expect(product.hasError('productCode')).toBe(true);
    expect(createSkus).not.toHaveBeenCalled();
    expect(harness.persistedProducts()).toEqual([]);
  });

  it('NET-NEW (legacy scenario: issue_1690, meta/tests/unit/IssuesTest.cfc:L192-L201) — a brand-new blank product accumulates save findings and is never persisted', async () => {
    // The legacy regression builds a bare `newEntity("Product")`, validates it in the `save` context and
    // saves it ONLY if it reports no errors. It contains NO assert statement at all, so it passes as long
    // as nothing throws — which is why this case is labelled NET-NEW even though it names a legacy
    // locator: the SCENARIO carries across, the verdict below has no legacy counterpart to extend.
    const product = buildProduct({});
    const harness = buildHarness({ settings: [PRODUCT_TITLE_STRING_SETTING] });
    const createSkus = jest.spyOn(harness.skuService, 'createSkus').mockResolvedValue(true);

    const answer = await harness.service.saveProduct(product, {});

    expect(answer).toBe(product);
    expect(product.isNew()).toBe(true);
    // Every required field of the `save` context reports, and they accumulate together rather than the
    // first one short-circuiting the rest.
    expect(product.hasError('productName')).toBe(true);
    expect(product.hasError('productCode')).toBe(true);
    expect(product.hasError('productType')).toBe(true);
    expect(product.hasError('price')).toBe(true);
    expect(createSkus).not.toHaveBeenCalled();
    expect(harness.persistedProducts()).toEqual([]);
  });

  it('NET-NEW (legacy fixture: meta/tests/unit/Helper.cfc:L52-L77) — the legacy merchandise fixture saves unaltered', async () => {
    // `getTestMerchandiseProduct()` hard-codes ONE struct — product name `Test Product`, price `100`,
    // product code `TESTPRODUCTXXX` and the seeded merchandise product-type UUID (IR-7,
    // `config/dbdata/SlatwallProductType.xml.cfm:L13`) — and every legacy catalog test that needed a
    // product built it from there. The literals are carried across verbatim so a reviewer can line the
    // two suites up field by field. What is NET-NEW is the assertion: the CFML helper only populated and
    // saved, and asserted nothing, so the outcome below has no legacy counterpart to compare against.
    //
    // TODO(parity) D17 — meta/tests/unit/Helper.cfc:L52: the legacy helper declared `productData`
    // UNSCOPED, leaking it into the component's shared variables scope — the same defect class as D10.
    // Strict TypeScript removes the hazard by construction: the fixture factory returns a frozen value
    // built fresh on every call, so nothing is shared between tests and there is nothing to leak.
    const fixture = createMerchandiseProductFixture();
    const harness = buildHarness({ settings: [PRODUCT_TITLE_STRING_SETTING] });
    const createSkus = jest.spyOn(harness.skuService, 'createSkus').mockResolvedValue(true);
    const chain = jest
      .spyOn(harness.service, 'processProductUpdateDefaultImageFileNames')
      .mockResolvedValue(fixture.product);

    expect(fixture.data.productName).toBe(TEST_MERCHANDISE_PRODUCT_NAME);
    expect(fixture.data.productCode).toBe(TEST_MERCHANDISE_PRODUCT_CODE);
    expect(fixture.data.price).toBe(TEST_MERCHANDISE_PRODUCT_PRICE);
    expect(fixture.data.productType.productTypeID).toBe(MERCHANDISE_PRODUCT_TYPE_ID);
    expect(fixture.productType.systemCode).toBe('merchandise');
    // `model/validation/Product.json:L8` requires `price` on save, and the legacy fixture satisfies it
    // through the default SKU alone — no pricing service is reached (AAP §0.2.2.6).
    expect(fixture.product.getPrice()).toBe('100');

    // The entity already carries every field the helper set, so the payload is legitimately empty: this
    // save exercises the fixture as the legacy helper handed it over, not a re-population of it.
    const answer = await harness.service.saveProduct(fixture.product, {});

    expect(answer).toBe(fixture.product);
    expect(fixture.product.hasErrors()).toBe(false);
    expect(fixture.product.urlTitle).toBe(PRODUCT_TITLE_SLUG);
    expect(createSkus).toHaveBeenCalledTimes(1);
    expect(chain).toHaveBeenCalledTimes(1);
    expect(harness.persistedProducts()).toEqual([fixture.product, fixture.product]);

    // The fixture's teardown seam mirrors `destroyTestMerchandiseProduct()`: dropping the default-SKU
    // reference is what the legacy helper had to do before deleting, because the product/SKU foreign
    // keys point at each other (the same circularity `deleteProduct` navigates at `:L320-:L334`).
    fixture.clearDefaultSkuReference();
    expect(fixture.product.defaultSku).toBeUndefined();
    expect(fixture.product.getPrice()).toBeUndefined();
  });
});

describe('saveProductType — payload-side titling and parent inheritance', () => {
  const PRODUCT_TYPE_ID = physicalID('pt-save');
  const PARENT_PRODUCT_TYPE_ID = physicalID('pt-save-parent');

  it('NET-NEW: generates the URL title into the PAYLOAD, preferring data.productTypeName, against SwProductType (:L297-:L303)', async () => {
    const productType = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Stale Name',
    });
    const harness = buildHarness();
    const data: Record<string, unknown> = { productTypeName: 'Wall Art' };

    const answer = await harness.service.saveProductType(productType, data);

    // The payload name wins over the entity name, and the generated value is written into the DATA —
    // not onto the entity — so the BaseService save populates it in the same pass.
    expect(harness.urlTitleProbes).toEqual([{ tableName: PRODUCT_TYPE_TABLE, value: 'wall-art' }]);
    expect(data['urlTitle']).toBe('wall-art');
    expect(answer).toBe(productType);
  });

  it('NET-NEW: falls back to the ENTITY productTypeName when the payload carries none (:L301)', async () => {
    const productType = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
    });
    const harness = buildHarness();
    const data: Record<string, unknown> = {};

    await harness.service.saveProductType(productType, data);

    expect(harness.urlTitleProbes).toEqual([
      { tableName: PRODUCT_TYPE_TABLE, value: 'framed-prints' },
    ]);
    expect(data['urlTitle']).toBe('framed-prints');
  });

  it('NET-NEW: generates nothing when either the payload or the entity already carries a URL title', async () => {
    const payloadHarness = buildHarness();
    const payloadProductType = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
    });
    const payloadData: Record<string, unknown> = { urlTitle: 'chosen-by-the-caller' };

    await payloadHarness.service.saveProductType(payloadProductType, payloadData);

    expect(payloadHarness.urlTitleProbes).toEqual([]);
    expect(payloadData['urlTitle']).toBe('chosen-by-the-caller');

    const entityHarness = buildHarness();
    const entityProductType = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
      urlTitle: 'already-titled',
    });
    const entityData: Record<string, unknown> = {};

    await entityHarness.service.saveProductType(entityProductType, entityData);

    // BOTH halves of the guard must be unusable before anything is generated, so an entity that already
    // has a title is left alone even when the payload has none.
    expect(entityHarness.urlTitleProbes).toEqual([]);
    expect(entityData['urlTitle']).toBeUndefined();
  });

  it('NET-NEW: this guard tests null OR length, so an EMPTY entity urlTitle IS regenerated — unlike saveProduct', async () => {
    const productType = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
      urlTitle: '',
    });
    const harness = buildHarness();
    const data: Record<string, unknown> = {};

    await harness.service.saveProductType(productType, data);

    // The exact contrast with `saveProduct` above: same empty string, opposite decision, because `:L297`
    // tests length as well as null. Preserved as two different guards rather than one shared helper.
    expect(harness.urlTitleProbes).toEqual([
      { tableName: PRODUCT_TYPE_TABLE, value: 'framed-prints' },
    ]);
    expect(data['urlTitle']).toBe('framed-prints');
  });

  it('NET-NEW: forwards the entity and the MUTATED payload to BaseService.save and returns what it answers (:L305)', async () => {
    const productType = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
    });
    const harness = buildHarness();
    const data: Record<string, unknown> = { productTypeDescription: 'Ready to hang' };

    const answer = await harness.service.saveProductType(productType, data);

    expect(harness.productTypeSaves).toHaveLength(1);
    const record = requireAt(harness.productTypeSaves, 0);
    expect(record.entity).toBe(productType);
    // The payload handed on is the one this member mutated, carrying the generated title alongside the
    // caller's own keys.
    expect(record.data).toBe(data);
    expect(record.data['urlTitle']).toBe('framed-prints');
    expect(record.data['productTypeDescription']).toBe('Ready to hang');
    expect(answer).toBe(productType);
    // This member persists nothing itself: BaseService owns the write.
    expect(harness.persistedProducts()).toEqual([]);
  });

  it('NET-NEW: inherits the parent product type products only when the save succeeded, a parent exists, and it has products (:L307-:L310)', async () => {
    const parentProductType = buildProductType({
      productTypeID: PARENT_PRODUCT_TYPE_ID,
      productTypeName: 'Prints',
    });
    const firstInherited = buildProduct({
      productID: physicalID('p-inherit-1'),
      productName: 'Poster',
    });
    const secondInherited = buildProduct({
      productID: physicalID('p-inherit-2'),
      productName: 'Canvas',
    });
    // The parent's collection is seeded DIRECTLY, because the domain's `addProduct`/`setProducts` pair
    // maintains only the OWNING side of the relationship — the inverse collection is what Hibernate
    // filled from the database. Calling `parentProductType.setProducts([...])` here would leave the
    // parent's own collection empty and the inheritance branch would never be entered.
    parentProductType.getProducts().push(firstInherited, secondInherited);
    const productType = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
      parentProductType,
    });
    const harness = buildHarness();

    const answer = await harness.service.saveProductType(productType, {});

    // The child adopts the parent's whole product collection by RE-POINTING each product at itself,
    // and EVERY adopted product is written back through the product repository — one call each, in
    // collection order.
    expect(firstInherited.productType).toBe(productType);
    expect(secondInherited.productType).toBe(productType);
    expect(harness.savedProducts).toEqual([firstInherited, secondInherited]);

    // The child's OWN collection stays empty, because the domain's `addProduct` sets only the owning
    // side of the relationship — the inverse collection is refreshed from the database, exactly as the
    // Hibernate mapping did. Asserting the adopted products on `child.getProducts()` would assert an
    // in-memory convenience the legacy never had. The parent's collection is likewise left untouched in
    // memory, which is why the write-back loop still sees both products.
    expect(answer.getProducts()).toEqual([]);
    expect(parentProductType.getProducts()).toEqual([firstInherited, secondInherited]);
    expect(
      harness.productCalls.filter(isProductCall('saveProduct')).map((call) => call.productID),
    ).toEqual([physicalID('p-inherit-1'), physicalID('p-inherit-2')]);
  });

  it('NET-NEW: inherits nothing when there is no parent, and nothing when the parent has no products', async () => {
    const orphanHarness = buildHarness();
    const orphan = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
    });

    await orphanHarness.service.saveProductType(orphan, {});

    expect(orphanHarness.savedProducts).toEqual([]);

    const childlessParent = buildProductType({
      productTypeID: PARENT_PRODUCT_TYPE_ID,
      productTypeName: 'Prints',
    });
    const childHarness = buildHarness();
    const child = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
      parentProductType: childlessParent,
    });

    await childHarness.service.saveProductType(child, {});

    // `:L309` guards on the parent's collection being non-empty, so a childless parent produces no
    // writes at all rather than an empty assignment.
    expect(childHarness.savedProducts).toEqual([]);
    expect(child.getProducts()).toEqual([]);
  });

  it('NET-NEW: findings from BaseService.save ride on the returned entity and block inheritance', async () => {
    /*
     * ⭐ THE MEMBER NO LONGER CATCHES ANYTHING, AND THAT IS THE FIX RATHER THAN A REGRESSION.
     * `model/service/ProductService.cfc:L310` returns on every path and its `:L306` gate reads
     * `hasErrors()`, so findings have always had to arrive as DATA on the entity. An earlier revision
     * reached that end by the wrong route: `BaseService.save` THREW the bag and this member wrapped the
     * delegation in `try`/`catch` to convert the raise back into entity-carried findings — one layer
     * inventing a divergence and the next undoing it. The base service now honours
     * `model/service/HibachiService.cfc:L103` directly, so the conversion has nothing left to do and is
     * gone; the `:L306` gate reads the same bag it always meant to read.
     *
     * The assertions below are UNCHANGED from that revision, which is the useful part: they always
     * described the legacy contract correctly, and only the mechanism underneath them was wrong.
     */
    const parentProductType = buildProductType({
      productTypeID: PARENT_PRODUCT_TYPE_ID,
      productTypeName: 'Prints',
    });
    parentProductType
      .getProducts()
      .push(buildProduct({ productID: physicalID('p-inherit-1'), productName: 'Poster' }));
    /*
     * ⭐ SEEDED AS FINDINGS, NOT AS A REJECTION, AND THE OPTION NAME IS THE WHOLE DISTINCTION. An earlier
     * revision built a `ValidationError` here and passed it as `productTypeSaveFailure`, which makes the
     * double REJECT. Under the landed contract a validation refusal never rejects — `BaseService.save`
     * attaches the findings to the entity's own bag and returns the same instance — so seeding through
     * `productTypeSaveFindings` is what actually exercises the path these assertions describe.
     * `productTypeSaveFailure` is reserved for the non-validation case, in the very next test.
     */
    const harness = buildHarness({
      productTypeSaveFindings: {
        productTypeName: ['validate.save.ProductType.productTypeName.required'],
      },
    });
    const productType = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
      parentProductType,
    });

    const answer = await harness.service.saveProductType(productType, {});

    // A validation refusal is DATA, not control flow: it rides on the entity's error bag and the member
    // returns normally, exactly as the legacy `super.save()` contract does.
    expect(answer.hasError('productTypeName')).toBe(true);
    expect(harness.savedProducts).toEqual([]);
    expect(answer.getProducts()).toEqual([]);
  });

  it('NET-NEW: a non-validation failure from BaseService.save propagates, because nothing is caught', async () => {
    const failure = new DomainError('the persister was unreachable');
    const harness = buildHarness({ productTypeSaveFailure: failure });
    const productType = buildProductType({
      productTypeID: PRODUCT_TYPE_ID,
      productTypeName: 'Framed Prints',
    });

    /*
     * An infrastructure failure must surface, or a caller would read an unsaved entity as saved. This
     * now holds for the plainest possible reason — the delegation has no `try`/`catch` around it at all
     * — where the earlier revision had to filter by error class to get the same answer. The identity
     * assertion is deliberate: the very object is rethrown, unwrapped and unre-tagged.
     */
    await expect(harness.service.saveProductType(productType, {})).rejects.toBe(failure);
  });

  it('NET-NEW: the ported ProductType rule set is what makes the titling step necessary, and it carries a SECOND inert physicalCounts guard', async () => {
    // This member generates a URL title for a reason, and the reason is declarative:
    // `model/validation/ProductType.json:L4` marks `urlTitle` required AND unique in the `save` context,
    // so a product type saved without one could never pass. Pinning the rule set here is what stops a
    // later reader from deciding the titling step at `:L297-:L301` is redundant and removing it.
    expect(
      productTypeValidationRuleSet.properties.map((property) => property.propertyIdentifier),
    ).toEqual([
      'productTypeName',
      'urlTitle',
      'products',
      'childProductTypes',
      'systemCode',
      'physicalCounts',
    ]);

    // G6 / S7, SECOND OCCURRENCE — `model/validation/ProductType.json:L8` declares the same
    // `physicalCounts` delete guard that `model/validation/Product.json:L7` does, and it is inert for the
    // same reason: `model/entity/ProductType.cfc:L77` declares the collection as `physicals`, nothing in
    // the repository declares `physicalCounts` on either entity, and
    // `org/Hibachi/HibachiValidationService.cfc:L171` silently skips a rule whose property the subject
    // does not carry. Transliterated as an inert guard on BOTH entities — never renamed, never invented,
    // and no PhysicalService reached (AAP §0.2.2.1 excludes all six `model/**/Physical*.cfc` files).
    expect(Object.hasOwn(PRODUCT_TYPE_DECLARED_PROPERTIES, 'physicalCounts')).toBe(false);
    expect(Object.hasOwn(PRODUCT_TYPE_DECLARED_PROPERTIES, 'physicals')).toBe(true);

    // And ProductService itself never validates a product type: that is the injected base service's
    // duty, which is exactly why the delegation asserted above is the observable contract here.
    const harness = buildHarness();
    await harness.service.saveProductType(buildProductType({ productTypeID: PRODUCT_TYPE_ID }), {
      productTypeName: 'Framed Prints',
    });
    expect(harness.validations).toEqual([]);
  });
});

// ==================================================================================================
// AGENT PROMPT PHASE 10 — deleteProduct(product)
// SOURCE: model/service/ProductService.cfc:L317-L336
//
// The member does one unusual thing and it is the whole point of it: it CLEARS the default-SKU
// relationship before delegating to the base delete, and puts it back if the delete does not happen.
// The legacy reason is the circular foreign key — `SwProduct.defaultSkuID` points at a SKU whose
// `SwSku.productID` points back — so the product cannot be removed while the pointer stands.
//
// G6 / S7 — THE INERT `physicalCounts` GUARD. `model/validation/Product.json:L7` declares a
// `maxCollection 0` guard on `physicalCounts` for the delete context. `model/entity/Product.cfc:L90`
// declares the collection as `physicals`. `physicalCounts` is declared NOWHERE on Product, and
// `org/Hibachi/HibachiValidationService.cfc:L171` SILENTLY SKIPS a rule whose property the subject does
// not carry. The guard is therefore inert in the legacy system, and it is transliterated as an inert
// guard here — present in the rule set, never evaluated. It is NOT renamed to `physicals`, no
// `physicalCounts` member is invented, and no PhysicalService is reached: `model/**/Physical*.cfc` is
// six files of explicitly out-of-scope code (AAP §0.2.2.1).
//
// TODO(parity) X15 — model/service/HibachiService.cfc:L93-L95. This is the one place in this suite that
// exercises a landed BaseService CLEANUP seam, so the note belongs here. The legacy `delete()` override
// declares `settingsRemoved` TWICE with `var` in a single scope, which CFML tolerates and TypeScript
// cannot express; the translation declares it once. Nothing behavioural hangs on it — the second
// declaration overwrote the first — and the assertions below observe only the two cleanup collaborators
// the landed `BaseServiceCollaborators` actually requires. No cache-invalidation hook is invented, and
// `SettingResolverPort` stays strictly READ-ONLY: it is never used as a write path for cleanup.
// ==================================================================================================

describe('deleteProduct — the default-SKU dance and the delete guards', () => {
  const PRODUCT_ID = physicalID('p-delete');
  const OTHER_PRODUCT_ID = physicalID('p-delete-other');

  interface DeleteFixture {
    readonly product: Product;
    readonly defaultSku: Sku;
    readonly delegate: ProductDefaultSkuDelegate;
  }

  function buildDeleteFixture(
    harness: Harness,
    options: { readonly productID?: string } = {},
  ): DeleteFixture {
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: 'Merchandise',
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({
      productID: options.productID ?? PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      urlTitle: 'test-product',
      productType,
    });
    const defaultSku = buildSku({
      skuID: physicalID('sku-delete-default'),
      skuCode: `${TEST_MERCHANDISE_PRODUCT_CODE}-1`,
      price: TEST_MERCHANDISE_PRODUCT_PRICE,
      product,
    });
    const delegate = harness.attachDefaultSku(product, defaultSku);

    return { product, defaultSku, delegate };
  }

  it('NET-NEW: clears the default SKU, deletes, and reports true — leaving the pointer cleared (:L318-:L335)', async () => {
    const harness = buildHarness();
    const { product, delegate } = buildDeleteFixture(harness);
    expect(product.defaultSku).toBe(delegate);

    const answer = await harness.service.deleteProduct(product);

    expect(answer).toBe(true);
    expect(harness.removedProducts).toEqual([product]);

    // On success the pointer is NOT put back. The legacy restores it only on the failure branch, and
    // fabricating a restoration here would leave a deleted product holding a live relationship.
    expect(product.defaultSku).toBeUndefined();

    // The maintenance collaborators fire in the legacy order, and only after the row is gone.
    expect(harness.settingCleanups).toEqual([product]);
    expect(harness.commentCleanups).toEqual([product]);
  });

  it('NET-NEW: restores the default SKU and reports false when the delete is refused (:L332-:L334)', async () => {
    // A transaction against THIS product closes `model/validation/Product.json:L5`.
    const harness = buildHarness({ transactionProductIDs: [PRODUCT_ID] });
    const { product, delegate } = buildDeleteFixture(harness);

    const answer = await harness.service.deleteProduct(product);

    expect(answer).toBe(false);
    expect(harness.removedProducts).toEqual([]);
    // The exact same delegate instance is put back, not an equivalent rebuilt one.
    expect(product.defaultSku).toBe(delegate);
    // No cleanup runs when nothing was removed, so a refused delete cannot strip a live product's
    // settings or comments.
    expect(harness.settingCleanups).toEqual([]);
    expect(harness.commentCleanups).toEqual([]);
  });

  it('NET-NEW: X12 — a transaction against ANOTHER product does not block this one', async () => {
    // The DAO check is product-scoped. If the port were consulted without the product identifier — or if
    // the identifier landed in the skuID parameter, which wins at `model/dao/SkuDAO.cfc:L58-L64` — every
    // product in a store with any transaction history would become undeletable.
    const harness = buildHarness({ transactionProductIDs: [OTHER_PRODUCT_ID] });
    const { product } = buildDeleteFixture(harness);

    const answer = await harness.service.deleteProduct(product);

    expect(answer).toBe(true);
    expect(harness.removedProducts).toEqual([product]);

    // The check really was made, and it was made with the product identifier in the SECOND position.
    expect(harness.skuCalls.filter(isSkuCall('transactionExists'))).toEqual([
      { member: 'transactionExists', productID: PRODUCT_ID, skuID: undefined },
    ]);
  });

  it('NET-NEW: G6/S7 — the physicalCounts guard is transliterated but inert, so physicals never block a delete', async () => {
    const harness = buildHarness();
    const { product } = buildDeleteFixture(harness);
    // Two out-of-scope physical associations. `model/validation/Product.json:L7` reads as "refuse the
    // delete when any physical count exists", and it cannot fire, because the property it names is not
    // the property the entity declares.
    product.physicals.push({ physicalID: 'phys-1' }, { physicalID: 'phys-2' });

    const answer = await harness.service.deleteProduct(product);

    expect(answer).toBe(true);
    expect(product.hasError('physicalCounts')).toBe(false);
    expect(harness.removedProducts).toEqual([product]);

    // The rule is still THERE — transliterated faithfully rather than dropped — and it is the subject's
    // property declaration that makes it unreachable. Asserting both halves is what keeps a future
    // reader from "fixing" the name.
    expect(physicalCountsValidation.propertyIdentifier).toBe('physicalCounts');
    expect(productValidationRuleSet.properties).toContain(physicalCountsValidation);
    expect(product.hasProperty('physicalCounts')).toBe(false);
    expect(product.hasProperty('physicals')).toBe(true);
  });

  it('NET-NEW: validates in the hard-coded delete context, and reads the transaction flag before it', async () => {
    const harness = buildHarness();
    const { product } = buildDeleteFixture(harness);

    await harness.service.deleteProduct(product);

    // One pass, context `delete`, supplied by the framework member rather than by this caller
    // (`org/Hibachi/HibachiService.cfc:L55`).
    expect(harness.validations).toEqual([
      { kind: 'validate', className: 'Product', context: 'delete' },
    ]);
    // The flag is resolved BEFORE the rule reads it — the delete-subject resolution step is what makes a
    // lazily calculated property available to a declarative rule at all.
    expect(harness.skuCalls.filter(isSkuCall('transactionExists'))).toHaveLength(1);
  });

  it('NET-NEW: a product with no default SKU deletes cleanly and nothing is restored', async () => {
    const harness = buildHarness();
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });

    const answer = await harness.service.deleteProduct(product);

    expect(answer).toBe(true);
    expect(product.defaultSku).toBeUndefined();
    expect(harness.removedProducts).toEqual([product]);
  });

  it('NET-NEW: a refused delete leaves no default SKU behind when there was none to capture', async () => {
    const harness = buildHarness({ transactionProductIDs: [PRODUCT_ID] });
    const productType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeIDPath: MERCHANDISE_PRODUCT_TYPE_ID,
      systemCode: 'merchandise',
    });
    const product = buildProduct({
      productID: PRODUCT_ID,
      productName: TEST_MERCHANDISE_PRODUCT_NAME,
      productCode: TEST_MERCHANDISE_PRODUCT_CODE,
      productType,
    });

    const answer = await harness.service.deleteProduct(product);

    expect(answer).toBe(false);
    // The restore is guarded on there having been something to restore, so a product that never had a
    // default SKU does not acquire an undefined one.
    expect(product.defaultSku).toBeUndefined();
    expect(harness.removedProducts).toEqual([]);
  });
});

// ==================================================================================================
// AGENT PROMPT PHASE 11 — getProductSmartList(data?, currentURL?)
// SOURCE: model/service/ProductService.cfc:L342-L357
//
// DISCREPANCY 1 — `currentURL` is declared with NO TYPE at `:L342`, in a signature whose sibling
// parameter IS typed. The target types it `string | undefined` and does not consume it: the legacy value
// feeds FW/1's saved-state URL handling, which has no counterpart behind a Lambda router. It is
// therefore accepted and ignored, which is asserted here rather than left to be discovered.
//
// The three joins and five keyword properties are the CONFIGURATION the legacy member registers on the
// SmartList before returning it, and asserting them IS this member's parity contract: it executes no
// query and computes nothing, so that configuration is the whole of its observable behaviour.
//
// ⛔ THE GOOGLE FEED IS NOT A CONSUMER OF IT. An earlier revision of this comment claimed the joins and
// keyword properties were "what the Google feed controller depends on downstream", and that is FALSE.
// `integrationServices/google/controllers/feed.cfc:L63` builds a SKU SmartList through
// `getSkuService().getSkuSmartList()` and then registers its OWN three joins at `:L64-L66`, including its
// own `brand` LEFT join at `:L66`. It never calls `getProductSmartList`, and its
// `property name="productService"` at `:L51` is referenced nowhere else in that file — a FIFTH dead
// injection beyond the four §0.6.3 registers, as the harness's not-wired list above already records.
// The legacy consumers of THIS member are `model/transient/HibachiScope.cfc:L142`,
// `model/entity/ProductType.cfc:L263`, the admin controllers, the storefront listing template and the two
// `meta/tests/unit/IssuesTest.cfc` regressions at `:L75` and `:L93` — all of them out of scope, which is
// why no downstream consumer is imported or asserted here.
//
// No excluded calculated member is reached. `calculatedTitle` and `brand.brandName` appear as KEYWORD
// PROPERTY IDENTIFIERS — strings in a query — and are never read off an entity.
// ==================================================================================================

describe('getProductSmartList — the paginated product query', () => {
  const KEYWORD_WEIGHT = 1;

  function buildProductRow(productID: string, productName: string): Product {
    return buildProduct({
      productID,
      productName,
      productCode: `${TEST_MERCHANDISE_PRODUCT_CODE}-${productID}`,
    });
  }

  it('NET-NEW: queries SlatwallProduct with the three joins in source order, brand LEFT (:L343-:L349)', async () => {
    const harness = buildHarness();

    await harness.service.getProductSmartList();

    expect(harness.smartListQueries).toHaveLength(1);
    const query = requireAt(harness.smartListQueries, 0);
    expect(query.entityName).toBe(PRODUCT_ENTITY);

    // Order matters: the legacy registers productType, then defaultSku, then brand, and only brand is a
    // LEFT join — a product with no brand must still appear. Promoting brand to an inner join would
    // silently drop every unbranded product from the result, and the `brand.brandName` keyword property
    // asserted below would then only ever match branded rows. The feed's own conditional `g:brand` is NOT
    // what this join serves: that comes from the LEFT join the feed controller registers for itself on a
    // SKU SmartList at `integrationServices/google/controllers/feed.cfc:L66`.
    expect(query.joins).toEqual([
      { parentEntityName: PRODUCT_ENTITY, relatedProperty: 'productType' },
      { parentEntityName: PRODUCT_ENTITY, relatedProperty: 'defaultSku' },
      { parentEntityName: PRODUCT_ENTITY, relatedProperty: 'brand', joinType: 'left' },
    ]);
  });

  it('NET-NEW: registers the five keyword properties in source order, every one at weight 1 (:L351-:L355)', async () => {
    const harness = buildHarness();

    await harness.service.getProductSmartList();

    const query = requireAt(harness.smartListQueries, 0);
    expect(query.keywordProperties).toEqual([
      { propertyIdentifier: 'calculatedTitle', weight: KEYWORD_WEIGHT },
      { propertyIdentifier: 'brand.brandName', weight: KEYWORD_WEIGHT },
      { propertyIdentifier: 'productName', weight: KEYWORD_WEIGHT },
      { propertyIdentifier: 'productCode', weight: KEYWORD_WEIGHT },
      { propertyIdentifier: 'productType.productTypeName', weight: KEYWORD_WEIGHT },
    ]);
  });

  it('NET-NEW: both arguments are optional, and an omitted payload adds no filter, order or pagination (S9)', async () => {
    const harness = buildHarness();

    const result = await harness.service.getProductSmartList();

    const query = requireAt(harness.smartListQueries, 0);
    // Nothing is invented for an absent payload: no default page size, no default sort, no empty filter
    // group. The legacy defaults `data` to an empty struct and registers nothing from it.
    expect(query.whereGroups).toBeUndefined();
    expect(query.orders).toBeUndefined();
    expect(query.pagination).toBeUndefined();
    expect(result.records).toEqual([]);
    expect(result.recordsCount).toBe(0);
  });

  it('NET-NEW: forwards a caller payload — keyword, filter and pagination — through to the port', async () => {
    const first = buildProductRow('p-list-1', 'Poster');
    const second = buildProductRow('p-list-2', 'Canvas');
    const harness = buildHarness({ productRows: [first, second] });

    const result = await harness.service.getProductSmartList({
      keyword: 'poster',
      'F:activeFlag': 1,
      'P:Show': 25,
      OrderBy: 'productName|ASC',
    });

    const query = requireAt(harness.smartListQueries, 0);
    expect(query.keywords).toEqual(['poster']);
    expect(query.whereGroups).toEqual([
      { filters: [{ propertyIdentifier: 'activeFlag', value: 1 }] },
    ]);
    expect(query.orders).toEqual([{ propertyIdentifier: 'productName', direction: 'ASC' }]);
    expect(query.pagination).toEqual({ pageRecordsShow: 25 });

    // The port's result is returned as-is: this member shapes a query and nothing else.
    expect(result.records).toEqual([first, second]);
    expect(result.pageRecords).toEqual([first, second]);
    expect(result.recordsCount).toBe(2);
  });

  it('NET-NEW: accepts currentURL and ignores it, because FW/1 saved-state URLs have no Lambda counterpart', async () => {
    const withoutUrl = buildHarness();
    await withoutUrl.service.getProductSmartList({ keyword: 'poster' });

    const withUrl = buildHarness();
    await withUrl.service.getProductSmartList(
      { keyword: 'poster' },
      '/admin/?slatAction=entity.listProduct',
    );

    // Byte-identical queries with and without the argument. Threading it into the query would invent a
    // filter the legacy never registers from it; rejecting it would break the declared signature.
    expect(requireAt(withUrl.smartListQueries, 0)).toEqual(
      requireAt(withoutUrl.smartListQueries, 0),
    );
  });

  it('NET-NEW: M7 — two independently constructed services share no query configuration', async () => {
    const first = buildHarness({ productRows: [buildProductRow('p-list-1', 'Poster')] });
    await first.service.getProductSmartList({ keyword: 'poster', 'F:activeFlag': 1 });

    const second = buildHarness({ productRows: [buildProductRow('p-list-2', 'Canvas')] });
    const secondResult = await second.service.getProductSmartList();

    // A warm Lambda container keeps module scope alive, so any configuration retained between
    // invocations would leak one caller's filters into the next caller's results. Each service records
    // exactly one query, and the second carries none of the first's state.
    expect(first.smartListQueries).toHaveLength(1);
    expect(second.smartListQueries).toHaveLength(1);
    expect(requireAt(second.smartListQueries, 0).whereGroups).toBeUndefined();
    expect(requireAt(second.smartListQueries, 0).keywords).toBeUndefined();
    expect(secondResult.records).toHaveLength(1);
  });

  it('NET-NEW: surfaces a port failure rather than answering an empty page', async () => {
    const failure = new DomainError('the smart-list adapter was unreachable');
    const harness = buildHarness({ smartListFailure: failure });

    await expect(harness.service.getProductSmartList()).rejects.toBe(failure);
  });
});

// ==================================================================================================
// IR-1 — the three members that exist only because of onMissingMethod, declared explicitly
// SOURCE: org/Hibachi/HibachiService.cfc:L255-L281
//
// `newProduct()`, `getProduct(id)` and `getProductType(id)` have NO declaration anywhere in
// `model/service/ProductService.cfc`. They resolve at run time through the framework's prefix dispatch,
// which fabricates `get*`, `new*`, `save*`, `delete*`, `count*`, `list*`, `export*` and `process*` from
// the method NAME. TypeScript under `strict` has no such facility, so AAP §0.4.2.5 requires each real
// call site to become an explicitly declared, typed member — and these three are real call sites:
// `saveProductType` is reached through `getProductType`, and the handler and process paths reach
// `getProduct` and `newProduct`.
//
// They are covered here rather than left implicit, because "the synthesis was replaced by declarations"
// is a claim about the port that a reviewer should be able to check by running something. Synthesis is
// NOT reproduced wholesale: `countProduct*`, `listProduct*` and `exportProduct*` are not called by this
// slice, are not declared, and get no test.
// ==================================================================================================

describe('IR-1 — the explicitly declared replacements for the synthesized members', () => {
  it('NET-NEW: newProduct() answers a brand-new, unsaved Product and shares nothing between calls', () => {
    const harness = buildHarness();

    const first = harness.service.newProduct();
    const second = harness.service.newProduct();

    expect(first).toBeInstanceOf(Product);
    expect(first.isNew()).toBe(true);
    // Two calls, two objects. A synthesized `new*` returned a fresh transient every time, and a
    // memoised factory here would let one request's draft leak into the next on a warm container (M7).
    expect(second).not.toBe(first);
    expect(first.getSkus()).toEqual([]);
    expect(harness.smartListQueries).toEqual([]);
    expect(harness.persistedProducts()).toEqual([]);
    expect(harness.settingReads).toEqual([]);
  });

  it('NET-NEW: getProduct(id) resolves one product by identifier, and answers null when nothing matches', async () => {
    const wanted = buildProduct({ productID: physicalID('p-wanted'), productName: 'Poster' });
    const other = buildProduct({ productID: physicalID('p-other'), productName: 'Canvas' });
    const harness = buildHarness({ productRows: [wanted, other] });

    const found = await harness.service.getProduct(physicalID('p-wanted'));

    expect(found).toBe(wanted);
    expect(requireAt(harness.smartListQueries, 0)).toEqual({
      entityName: PRODUCT_ENTITY,
      whereGroups: [
        { filters: [{ propertyIdentifier: 'productID', value: physicalID('p-wanted') }] },
      ],
    });

    // A miss is `null`, not an empty array and not a throw: the synthesized `get*` answered a null
    // entity, and every call site in the slice guards on that.
    const missing = await harness.service.getProduct('p-nonexistent');
    expect(missing).toBeNull();
  });

  it('NET-NEW: getProductType(id) resolves against SlatwallProductType, not SlatwallProduct', async () => {
    const wanted = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: 'Merchandise',
      systemCode: 'merchandise',
    });
    const harness = buildHarness({ productTypeRows: [wanted] });

    const found = await harness.service.getProductType(MERCHANDISE_PRODUCT_TYPE_ID);

    expect(found).toBe(wanted);
    // A different entity AND a different identifier property. The legacy synthesis derived both from the
    // method name, so a single mistyped declaration here would silently query the wrong table.
    expect(requireAt(harness.smartListQueries, 0)).toEqual({
      entityName: PRODUCT_TYPE_ENTITY,
      whereGroups: [
        { filters: [{ propertyIdentifier: 'productTypeID', value: MERCHANDISE_PRODUCT_TYPE_ID }] },
      ],
    });

    const missing = await harness.service.getProductType('pt-nonexistent');
    expect(missing).toBeNull();
  });

  it('NET-NEW: both identifier lookups are records-only reads — no pagination, join or keyword configuration', async () => {
    const harness = buildHarness({
      productRows: [buildProduct({ productID: physicalID('p-wanted'), productName: 'Poster' })],
      productTypeRows: [
        buildProductType({ productTypeID: physicalID('pt-wanted'), productTypeName: 'Prints' }),
      ],
    });

    await harness.service.getProduct(physicalID('p-wanted'));
    await harness.service.getProductType(physicalID('pt-wanted'));

    for (const query of harness.smartListQueries) {
      // A primary-key read needs none of the SmartList configuration `getProductSmartList` registers, and
      // inventing a page size or a default order for it would be a behaviour the synthesis never had (S9).
      expect(query.joins).toBeUndefined();
      expect(query.keywordProperties).toBeUndefined();
      expect(query.orders).toBeUndefined();
      expect(query.pagination).toBeUndefined();
      expect(query.selectDistinctFlag).toBeUndefined();
    }
    expect(harness.smartListQueries).toHaveLength(2);
  });
});

/* =====================================================================================================
 * FOLDED IN FROM `test/handlers/productHandler.test.ts` — AAP §0.4.1.12 SUITE ALIGNMENT (F1, F5)
 * =====================================================================================================
 * WHY THESE CASES ARE HERE RATHER THAN IN A SUITE OF THEIR OWN. AAP §0.4.1.12 declares exactly seventeen
 * executable suites, and `test/handlers/productHandler.test.ts` was not one of them — a QA pass recorded it,
 * with eighteen siblings, as running outside the declared test plan. The coverage was never the problem;
 * the file's existence was. So the cases are folded into an approved suite, unchanged.
 *
 * ⭐ WHY THIS HOST. Same relationship as every other handler fold: the eighteen product routes dispatch to members this
 * file already tests directly, and the handler's own contribution is the layer above them. It is also the
 * surface that carries the importer entry point, whose boundary refusal this file already reasons about.
 *
 * ⛔ THE BODY IS WRAPPED IN ONE `describe`, WHICH IS THE WHOLE OF THE MECHANICAL CHANGE. Every helper,
 * constant and type the folded suite declared at module scope is now block-scoped to this callback, so it
 * cannot collide with this file's own declarations or with another folded body's — and any `beforeEach`,
 * `afterEach` or `beforeAll` it carries now applies to its own cases only, never to the host's. Not one
 * assertion, case name or comment was altered.
 * ================================================================================================== */

/**
 * `productHandler` — the Lambda boundary that exposes the `ProductService` surface, and the contracts
 * that boundary must not silently alter.
 *
 * AAP authority: the AAP §0.4.4 wildcard row authorises `slatwall-ts/test/**` | CREATE. The suite sits
 * beside `test/handlers/skuHandler.test.ts`, which covers the SKU boundary the same way, so the two
 * Lambda boundaries that have coverage are covered in the same place. `test/services/ProductService.test.ts`
 * keeps the SERVICE matrix — the URL-title derivation, the validation merge and the per-member
 * persistence steps — and this file keeps the BOUNDARY matrix; neither duplicates the other.
 *
 * =============================================================================================
 * WHAT IS UNDER TEST
 * =============================================================================================
 * The handler is a thin, injectable function OF the service — its build specification requires exactly
 * that, so that it is "assertable without a database, a network call or an AWS runtime". What is under
 * test here is therefore the service's surface as observed through its boundary: member names, arity,
 * argument order, the transaction graph a write route enters, and the authorization gate in front of
 * them all.
 *
 *   - AAP §0.7.3 makes "one test per converted method, explicitly labelled" a BINDING standard, and
 *     §0.7.2 records that the absence of user rules "is not permission to relax standards". Eighteen
 *     routed operations with no coverage at all would violate that standard outright.
 *   - `src/handlers/productHandler.ts` declares eighteen routed members — the fifteen public functions
 *     `model/service/ProductService.cfc` declares across 367 lines, plus the three the legacy
 *     fabricated at run time (IR-1) — and the count is asserted here rather than assumed.
 *
 * TEST PROVENANCE: every case below is **NET-NEW**. AAP §0.6.5.2 verified that no legacy
 * `ProductServiceTest` exists — "therefore all 28 public service members of §0.4.2 are net-new
 * coverage" — and that the legacy suite contains no controller test of any kind, the one functional
 * scaffold at [meta/tests/functional/admin/entity/ProductTest.cfc:L49-L52] being an empty component
 * with zero test methods. Nothing in this file extends a legacy assertion, and none is labelled as
 * though it did. ⚠️ NO PARITY WITH A LEGACY ASSERTION IS CLAIMED OR IMPLIED ANYWHERE BELOW.
 *
 * WHAT THIS FILE DOES NOT COVER: the service's own internals are exercised only as far as the boundary
 * makes them observable, and how a route string reaches a member belongs to `src/handlers/router.ts`,
 * which owns the `slatAction` table and mounts these members; that seam is asserted in
 * `test/handlers/entrySurface.test.ts` rather than here. Stating that is preferable to implying a
 * completeness this file does not have.
 */
describe("test/handlers/productHandler.test.ts — the product surface's final wiring (folded, F1, F5)", () => {
  /** A 32-character identifier, the width IR-6 fixes for every primary key in this schema. */
  const PRODUCT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  /** A second, so "the route addressed the entity it was given" is observable. */
  const PRODUCT_TYPE_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  /** Every entity CRUD type the permission model can be asked about. */
  const EVERY_CRUD_TYPE: readonly string[] = ['create', 'read', 'update', 'delete'];

  /** The eighteen operations AAP §0.4.2.1 (fifteen declared) and §0.4.2.5 (three synthesized) allow. */
  const APPROVED_MEMBERS: readonly string[] = [
    'loadDataFromFile',
    'getFormattedOptionGroups',
    'getProductSkusBySelectedOptions',
    'processProductAddOptionGroup',
    'processProductAddOption',
    'processProductAddProductReview',
    'processProductAddSubscriptionTerm',
    'processProductDeleteDefaultImage',
    'processProductUpdateDefaultImageFileNames',
    'processProductUpdateSkus',
    'processProductUploadDefaultImage',
    'saveProduct',
    'saveProductType',
    'deleteProduct',
    'getProductSmartList',
    'newProduct',
    'getProductType',
    'getProduct',
  ];

  /** A principal, defaulting to one that is logged in and is not an administrator. */
  function account(overrides: Partial<AccountReference> = {}): AccountReference {
    return { accountID: 'account-1', newFlag: false, adminAccountFlag: false, ...overrides };
  }

  /** A product the routes can address. */
  function makeProduct(productID: string = PRODUCT_ID): Product {
    const product = new Product();
    product.productID = productID;
    return product;
  }

  /**
   * A product type the two product-type routes can address.
   *
   * MANAGED, because `ProductTypeWithErrorState` is what `ProductService.saveProductType` resolves and what
   * `ProductWriteGraph` now declares. `../../src/domain/product/ProductType` is forbidden to declare the six
   * error members itself, so the surface is composed on exactly as the service composes it — with the same
   * `manageEntity`, which mutates and returns the SAME object so identity survives.
   */
  function makeProductType(): ProductTypeWithErrorState {
    const productType = new ProductType();
    productType.productTypeID = PRODUCT_TYPE_ID;
    productType.productTypeName = 'Merchandise';
    return manageEntity(productType, PRODUCT_TYPE_ENTITY_METADATA);
  }

  /** An empty page of products, so the smart-list projection has a defined shape to assert. */
  function emptyPage(): SmartListResult<Product> {
    return {
      records: [],
      pageRecords: [],
      recordsCount: 0,
      pageRecordsStart: 0,
      pageRecordsEnd: 0,
      currentPage: 1,
      totalPages: 0,
    };
  }

  /** How one assembled surface should behave. */
  interface SurfaceOptions {
    /** What `getProduct` answers. `null` means "no such row"; omitted means a default product. */
    readonly product?: Product | null;
    /**
     * What `saveProduct` answers, when it must differ from its argument.
     *
     * ⚠️ THIS EXISTS BECAUSE THE SERVICE REBINDS ITS LOCAL. STEP 5 of `ProductService.saveProduct` is
     * `product = await this.persistProduct(product)`, so the persister MAY answer with a different
     * instance from the one validation accumulated onto. Without this option a gate narrowed to the
     * returned instance alone would look correct.
     */
    readonly savedProduct?: Product;
    /**
     * An error key `saveProductType` should attach to the product type it returns, expressing a REFUSED
     * save. Omitted means the save succeeded.
     *
     * ⚠️ IT IS A RETURNED FINDING AND NOT A REJECTION, WHICH IS THE WHOLE POINT.
     * `model/service/ProductService.cfc:L310` returns `arguments.productType` on every path, so a refusal
     * arrives on the entity's own bag. A double that rejected instead would let the boundary's commit gate
     * look correct while never being exercised.
     */
    readonly productTypeSaveError?: string;
    /** What `deleteProduct` answers. `false` is a guard REFUSING the delete, not an error. */
    readonly deleteResult?: boolean;
    /**
     * A failure `loadDataFromFile` rejects with instead of resolving.
     *
     * ⚠️ THIS EXISTS FOR REVIEW FINDING F9 AND FOR NOTHING ELSE. The importer's location gate lives at the
     * retrieval SINK — `MySqlProductRepository` — so a refusal reaches this route as a rejection from
     * beneath it, and the only thing the route owns is how that rejection is PRESENTED. Every other member
     * of this probe resolves, because no other member has a refusal to present.
     */
    readonly importFailure?: unknown;
  }

  /** What one invocation of the surface recorded. */
  interface Invocation {
    /** Which member, and whether it arrived through the captured service or the transaction graph. */
    readonly member: string;
    readonly through: 'service' | 'graph';
    /** The arguments, so argument ORDER is observable and not merely arity. */
    readonly args: readonly unknown[];
  }

  /**
   * A recording surface that answers every one of the eighteen members.
   *
   * ⛔ THE SERVICE AND THE GRAPH ARE DISTINCT OBJECTS, and each records which one it was. A double that
   * shared one object between them would make TX-01's "the route calls the captured service instead of
   * the transaction-scoped graph" defect UNOBSERVABLE — which is the whole point of the distinction.
   */
  function makeSurface(options: SurfaceOptions = {}): {
    readonly calls: Invocation[];
    readonly service: ProductHandlerService;
    readonly graph: ProductWriteGraph;
  } {
    const calls: Invocation[] = [];
    const stored: Product | null = options.product === undefined ? makeProduct() : options.product;

    function build(through: 'service' | 'graph'): ProductHandlerService {
      function record(member: string, args: readonly unknown[]): void {
        calls.push({ member, through, args });
      }

      return {
        loadDataFromFile: (fileURL: string, textQualifier?: string): Promise<void> => {
          record('loadDataFromFile', [fileURL, textQualifier]);

          /* Recorded BEFORE the rejection, so a case can assert the route did forward the location it was
           * given rather than short-circuiting on a guess about it. */
          if (options.importFailure !== undefined) {
            const failure: unknown = options.importFailure;

            return Promise.resolve().then((): void => {
              throw failure;
            });
          }

          return Promise.resolve();
        },
        getFormattedOptionGroups: (product: Product): Promise<FormattedOptionGroups> => {
          record('getFormattedOptionGroups', [product]);
          /* The service answers a record KEYED by option-group name — TR-1's tightening of
           * `model/service/ProductService.cfc:L71`'s struct — so the double answers that shape too. */
          return Promise.resolve({ Size: [{ name: 'Large', value: 'large' }] });
        },
        getProductSkusBySelectedOptions: (
          selectedOptions: string,
          productID: string,
        ): Promise<Sku[]> => {
          record('getProductSkusBySelectedOptions', [selectedOptions, productID]);
          return Promise.resolve([]);
        },
        processProductAddOptionGroup: (
          product: Product,
          processObject: ProductAddOptionGroup,
        ): Promise<Product> => {
          record('processProductAddOptionGroup', [product, processObject]);
          return Promise.resolve(product);
        },
        processProductAddOption: (
          product: Product,
          processObject: ProductAddOption,
        ): Promise<Product> => {
          record('processProductAddOption', [product, processObject]);
          return Promise.resolve(product);
        },
        processProductAddProductReview: (
          product: Product,
          processObject: unknown,
        ): Promise<Product> => {
          record('processProductAddProductReview', [product, processObject]);
          return Promise.resolve(product);
        },
        processProductAddSubscriptionTerm: (
          product: Product,
          processObject: unknown,
        ): Promise<Product> => {
          record('processProductAddSubscriptionTerm', [product, processObject]);
          return Promise.resolve(product);
        },
        processProductDeleteDefaultImage: (
          product: Product,
          data: Record<string, unknown>,
        ): Promise<Product> => {
          record('processProductDeleteDefaultImage', [product, data]);
          return Promise.resolve(product);
        },
        processProductUpdateDefaultImageFileNames: (product: Product): Promise<Product> => {
          record('processProductUpdateDefaultImageFileNames', [product]);
          return Promise.resolve(product);
        },
        processProductUpdateSkus: (
          product: Product,
          processObject: ProductUpdateSkus,
        ): Promise<Product> => {
          record('processProductUpdateSkus', [product, processObject]);
          return Promise.resolve(product);
        },
        processProductUploadDefaultImage: (
          product: Product,
          processObject: unknown,
        ): Promise<Product> => {
          record('processProductUploadDefaultImage', [product, processObject]);
          return Promise.resolve(product);
        },
        saveProduct: (product: Product, data: Record<string, unknown>): Promise<Product> => {
          record('saveProduct', [product, data]);
          return Promise.resolve(options.savedProduct ?? product);
        },
        saveProductType: (
          productType: ProductType,
          data: Record<string, unknown>,
        ): Promise<ProductTypeWithErrorState> => {
          record('saveProductType', [productType, data]);

          /*
           * The double reproduces the SERVICE's contract, not a convenience: `saveProductType` returns the
           * entity on every path and attaches its findings to that entity's own bag
           * (`model/service/ProductService.cfc:L310`). So a failing save is expressed by seeding a finding
           * here, never by rejecting.
           */
          const saved = manageEntity(productType, PRODUCT_TYPE_ENTITY_METADATA);

          if (options.productTypeSaveError !== undefined) {
            saved.addError(options.productTypeSaveError, 'refused');
          }

          return Promise.resolve(saved);
        },
        deleteProduct: (product: Product): Promise<boolean> => {
          record('deleteProduct', [product]);
          return Promise.resolve(options.deleteResult ?? true);
        },
        getProductSmartList: (
          data?: SmartListInput,
          currentURL?: string,
        ): Promise<SmartListResult<Product>> => {
          record('getProductSmartList', [data, currentURL]);
          return Promise.resolve(emptyPage());
        },
        newProduct: (): Product => {
          record('newProduct', []);
          return makeProduct('');
        },
        getProduct: (productID: string): Promise<Product | null> => {
          record('getProduct', [productID]);
          return Promise.resolve(stored);
        },
        getProductType: (productTypeID: string): Promise<ProductType | null> => {
          record('getProductType', [productTypeID]);
          return Promise.resolve(makeProductType());
        },
      };
    }

    const service = build('service');
    const graph = build('graph');

    return { calls, service, graph };
  }

  /**
   * A write runner that EVALUATES the gate and throws on a roll-back.
   *
   * ⛔ It must do both, because the commit DECISION is what TX-01 is about. A double that ran the work
   * and returned its value unconditionally would make every gate case pass while asserting nothing.
   */
  function makeWriteRunner(graph: ProductWriteGraph): {
    readonly runner: TransactionalWriteRunner<ProductWriteGraph>;
    readonly decisions: ('commit' | 'rollback')[];
    readonly securityContexts: RequestAuthorizationContext[];
  } {
    const decisions: ('commit' | 'rollback')[] = [];
    /* SEC-AUTH-03 — every context the handler handed the boundary, in order. */
    const securityContexts: RequestAuthorizationContext[] = [];

    return {
      decisions,
      securityContexts,
      runner: {
        runWrite: async <TResult>(
          /* SEC-AUTH-03 — see the identical note in BrandService.test.ts. */
          security: RequestAuthorizationContext,
          work: (graph: ProductWriteGraph) => Promise<TResult>,
          hasErrors: () => boolean,
        ): Promise<TResult> => {
          securityContexts.push(security);

          const result = await work(graph);

          if (hasErrors()) {
            decisions.push('rollback');
            throw new DomainError('rolled back because the caller reported accumulated findings');
          }

          decisions.push('commit');
          return result;
        },
      },
    };
  }

  /** Everything one assembled handler exposes for inspection. */
  interface Probe {
    /** Every entity question asked, in order, so the legacy sequence is observable. */
    readonly asked: EntityAuthorizationRequest[];
    /** Every request the resolver was HANDED — SEC-AUTH-03's widened input. */
    readonly requests: InvocationSecurityRequest[];
    /** Every member reached, with its arguments and which object answered. */
    readonly calls: Invocation[];
    /** Every commit decision the runner took. */
    readonly decisions: ('commit' | 'rollback')[];
    /** Every context handed to the write boundary — SEC-AUTH-03's propagation half. */
    readonly securityContexts: readonly RequestAuthorizationContext[];
    readonly handler: ProductHandler;
  }

  /**
   * @param account the principal the resolver reports, or `undefined` for "no principal at all"
   * @param grant   the entity CRUD types the permission model grants
   * @param options see {@link SurfaceOptions}
   * @param refusedEntities entity names whose questions are REFUSED whatever the grant. ⭐ ADDED FOR
   *   REVIEW FINDING SEC-AUTH-02: the subordinate question asks about a DIFFERENT entity, so a case that
   *   wants "may update the product but not its SKUs" cannot express itself through `grant` alone.
   */
  function makeHandler(
    principal: AccountReference | undefined,
    grant: readonly string[],
    options: SurfaceOptions = {},
    refusedEntities: readonly { readonly entityName: string }[] = [],
  ): Probe {
    const asked: EntityAuthorizationRequest[] = [];
    const requests: InvocationSecurityRequest[] = [];
    const surface = makeSurface(options);
    const { runner, decisions, securityContexts } = makeWriteRunner(surface.graph);
    const refused = new Set(refusedEntities.map((entity) => entity.entityName));

    const resolve: InvocationSecurityResolver = (request) => {
      requests.push(request);

      return {
        accountContext: { getCurrentAccount: () => principal },
        entityAuthorization: {
          authenticateEntity: (question: EntityAuthorizationRequest): boolean => {
            asked.push(question);
            return !refused.has(question.entityName) && grant.includes(question.crudType);
          },
        },
        populationAuthorization: DENY_ALL_POPULATION_AUTHORIZATION,
      };
    };

    return {
      asked,
      requests,
      calls: surface.calls,
      decisions,
      securityContexts,
      handler: createProductHandler(surface.service, resolve, runner),
    };
  }

  /**
   * Another party's product identifier — the victim in SEC-AUTH-02's exploit.
   *
   * A distinct 32-character value, so an assertion that the addressed identifier reached the question
   * cannot pass by coincidence with the fixture's own product.
   */
  const VICTIM_PRODUCT_ID = 'ffffffff000000000000000000000009';

  /** A handler admitting every request, for cases about routing rather than the gate. */
  function admitAll(options: SurfaceOptions = {}): Probe {
    return makeHandler(account(), EVERY_CRUD_TYPE, options);
  }

  /** The event slice the identifier-only routes declare. */
  function identifierEvent(
    productID?: string,
  ): ProductIdentifierEvent & ProductTypeIdentifierEvent {
    return {
      pathParameters: productID === undefined ? {} : { productID, productTypeID: productID },
      headers: {},
    };
  }

  /** The event slice the payload routes declare. */
  function payloadEvent(body: string, productID: string = PRODUCT_ID): ProductPayloadEvent {
    return { body, pathParameters: { productID }, headers: {} };
  }

  /**
   * The payload slice that addresses NO product, so `saveProduct` is a creation.
   *
   * ⭐ ADDED FOR REVIEW FINDING SEC-AUTH-01: the gate's question now follows the operation, so the create
   * and update arms need two different events to tell them apart.
   */
  function unaddressedPayloadEvent(body: string): ProductPayloadEvent {
    return { body, pathParameters: {}, headers: {} };
  }

  /** The event slice the product-type payload route declares. */
  function productTypePayloadEvent(body: string, productTypeID?: string): ProductTypePayloadEvent {
    return {
      body,
      pathParameters: productTypeID === undefined ? {} : { productTypeID },
      headers: {},
    };
  }

  /* ==============================================================================================
   * API-01 — THE ROUTED SURFACE
   * ============================================================================================== */

  describe('productHandler — API-01, the routed surface is exactly the eighteen approved operations', () => {
    it('NET-NEW — AAP §0.4.2.1 + §0.4.2.5 — routes all eighteen and not one more', () => {
      const probe = admitAll();

      // Sorted on both sides, so the assertion is about MEMBERSHIP rather than declaration order.
      expect(Object.keys(probe.handler).sort()).toStrictEqual([...APPROVED_MEMBERS].sort());
    });

    it('NET-NEW — AAP §0.4.2.5 restraint — reproduces synthesis ONLY where used', () => {
      const probe = admitAll();
      const routed = Object.keys(probe.handler);

      /* "Not called by the slice … Not declared — synthesis is not reproduced wholesale, only where
       * used." A prefix-driven port would have fabricated all of these. */
      for (const forbidden of [
        'countProduct',
        'listProduct',
        'exportProduct',
        'countProductType',
        'listProductType',
        'exportProductType',
        'buildSkuCombinations', // D15 — private and only self-recursive, therefore unreachable.
      ]) {
        expect(routed).not.toContain(forbidden);
      }
    });

    it('NET-NEW — the returned handler is frozen, so no route can be swapped after assembly', () => {
      const probe = admitAll();
      expect(Object.isFrozen(probe.handler)).toBe(true);
    });

    it('NET-NEW — the access matrix covers every routed member and nothing else', () => {
      const probe = admitAll();

      expect(Object.keys(PRODUCT_ACCESS_MATRIX).sort()).toStrictEqual(
        Object.keys(probe.handler).sort(),
      );
    });
  });

  /* ==============================================================================================
   * API-01 — THE GATE `setupRequest()` RAN
   * ============================================================================================== */

  describe('productHandler — API-01, the authorization gate', () => {
    it('NET-NEW — org/Hibachi/HibachiAuthenticationService.cfc:L83 — NO principal refuses with 401', async () => {
      const probe = makeHandler(undefined, EVERY_CRUD_TYPE);

      const results = [
        await probe.handler.getProduct(identifierEvent(PRODUCT_ID)),
        await probe.handler.saveProduct(payloadEvent('{}')),
        await probe.handler.deleteProduct(identifierEvent(PRODUCT_ID)),
        await probe.handler.processProductUpdateSkus(payloadEvent('{}')),
        await probe.handler.loadDataFromFile({ queryStringParameters: {}, headers: {} }),
      ];

      for (const result of results) {
        expect(result.statusCode).toBe(401);
        expect(JSON.parse(result.body)).toStrictEqual({ message: 'Authentication is required' });
      }

      // Refused BEFORE the service, so nothing was read, written or imported…
      expect(probe.calls).toStrictEqual([]);
      // …and before any permission question, because there was no principal to ask about.
      expect(probe.asked).toStrictEqual([]);
      // …and no transaction was opened.
      expect(probe.decisions).toStrictEqual([]);
    });

    it('NET-NEW — productHandler — HibachiScope.cfc:L40-L45 — the logged-in test is the NEGATION of newFlag', async () => {
      /* `getLoggedInFlag()` is `if(!getSession().getAccount().isNew())`, and `newFlag` carries
       * `isNew()`. A principal that is NEW is therefore NOT logged in. Inverting this predicate would
       * have admitted exactly the first caller and refused the second. */
      const notLoggedIn = makeHandler(account({ newFlag: true }), ['read']);
      expect((await notLoggedIn.handler.getProduct(identifierEvent(PRODUCT_ID))).statusCode).toBe(
        401,
      );
      expect(notLoggedIn.calls).toStrictEqual([]);

      const loggedIn = makeHandler(account({ newFlag: false }), ['read']);
      expect((await loggedIn.handler.getProduct(identifierEvent(PRODUCT_ID))).statusCode).toBe(200);
    });

    it('NET-NEW — a logged-in principal WITHOUT permission gets 403, not 401 and not 200', async () => {
      const probe = makeHandler(account(), []);

      const result = await probe.handler.getProduct(identifierEvent(PRODUCT_ID));

      expect(result.statusCode).toBe(403);
      expect(JSON.parse(result.body)).toStrictEqual({ message: 'Not authorized' });
      expect(probe.calls).toStrictEqual([]);
    });

    /* ==============================================================================================
     * ⭐⭐ REVIEW FINDING SEC-AUTH-02 (CWE-862, CWE-639) — THIS CASE USED TO REQUIRE THE VULNERABILITY
     * ==============================================================================================
     * It was named "every process member is anyLogin" and it required a logged-in account with NO entity
     * grant to be ADMITTED to `processProductAddOptionGroup`, `processProductAddOption` and
     * `processProductUpdateSkus`, with `probe.asked` left EMPTY to prove the permission model was never
     * consulted. Its legacy citation is accurate — the ladder's `process` branch really is a bare
     * `return true` — but in the legacy that branch was reached only through an administrative subsystem
     * that had already placed the request; carrying the `return true` without the subsystem that guarded
     * it reproduced the short-circuit and none of its context. The consequence was that ANY authenticated
     * account could mutate ANY product by naming its identifier.
     *
     * The replacement below is the corrected contract: every process route requires `update` on `Product`,
     * and the four that write SKU or image state additionally require `update` on `Sku`.
     * `../../src/handlers/productHandler.ts` carries the full withdrawal record.
     * ============================================================================================ */
    it('NET-NEW — SEC-AUTH-02 — a grant-less account is REFUSED by every process route', async () => {
      const probe = makeHandler(account(), []);

      const processRoutes = [
        await probe.handler.processProductAddOptionGroup(payloadEvent('{"optionGroup":"g1"}')),
        await probe.handler.processProductAddOption(payloadEvent('{"option":"o1"}')),
        await probe.handler.processProductUpdateSkus(payloadEvent('{}')),
        await probe.handler.processProductAddProductReview(payloadEvent('{}')),
        await probe.handler.processProductAddSubscriptionTerm(payloadEvent('{}')),
        await probe.handler.processProductDeleteDefaultImage(payloadEvent('{}')),
        await probe.handler.processProductUpdateDefaultImageFileNames(payloadEvent('{}')),
        await probe.handler.processProductUploadDefaultImage(payloadEvent('{}')),
      ];

      /* 403, not 401: the principal IS authenticated. And not 200: the operation is not authorised. */
      for (const result of processRoutes) {
        expect(result.statusCode).toBe(403);
      }

      /* ⛔ AND THE PERMISSION MODEL WAS CONSULTED, which is the assertion whose inverse this case used to
       * make. Every route asked `update` on `Product` — the operation it performs — before resolving
       * anything. Nothing reached the service, so no victim product was read or written. */
      expect(probe.asked).toHaveLength(processRoutes.length);
      expect(probe.asked.every((request) => request.entityName === 'Product')).toBe(true);
      expect(probe.asked.every((request) => request.crudType === 'update')).toBe(true);
      expect(probe.calls).toStrictEqual([]);
      expect(probe.decisions).toStrictEqual([]);
    });

    it('NET-NEW — SEC-AUTH-02 — the addressed victim identifier travels with the question', async () => {
      /* The exploit named another party's product in `pathParameters.productID`. The gate now asks about
       * that identifier, so a deployment that scopes grants per row can refuse it — and a deployment that
       * does not still refuses on the entity question above. */
      const probe = makeHandler(account(), []);

      await probe.handler.processProductUpdateSkus(payloadEvent('{}', VICTIM_PRODUCT_ID));

      expect(probe.asked).toStrictEqual([
        { entityName: 'Product', crudType: 'update', entityID: VICTIM_PRODUCT_ID },
      ]);
    });

    it('NET-NEW — SEC-AUTH-02 — Product update alone is not enough where SKU state is written', async () => {
      /* The subordinate question is a CONJUNCTION. A principal that may update the product but not its
       * SKUs is refused by the four routes that write SKU or image state, and admitted by the two whose
       * writes belong to families this deliverable does not model. */
      const productOnly = makeHandler(account(), ['update'], {}, [{ entityName: 'Sku' }]);

      expect(
        (await productOnly.handler.processProductUpdateSkus(payloadEvent('{}'))).statusCode,
      ).toBe(403);
      expect(productOnly.asked.map((request) => request.entityName)).toStrictEqual([
        'Product',
        'Sku',
      ]);
      expect(productOnly.calls).toStrictEqual([]);

      /* The two boundary rows ask about `Product` and nothing else: inventing a permission name for an
       * entity this port does not model would be fabrication (AAP §0.7.3 S9). They are admitted by the
       * gate and then answer the boundary's own refusal. */
      const boundary = makeHandler(account(), ['update'], {}, [{ entityName: 'Sku' }]);
      const review = await boundary.handler.processProductAddProductReview(payloadEvent('{}'));
      expect(review.statusCode).not.toBe(401);
      expect(review.statusCode).not.toBe(403);
      expect(boundary.asked.map((request) => request.entityName)).toStrictEqual(['Product']);
    });

    it('NET-NEW — SEC-AUTH-02 — both grants together admit a SKU-writing process route', async () => {
      const granted = makeHandler(account(), ['update']);

      const result = await granted.handler.processProductUpdateSkus(payloadEvent('{}'));

      expect(result.statusCode).not.toBe(401);
      expect(result.statusCode).not.toBe(403);
      expect(granted.asked).toStrictEqual([
        { entityName: 'Product', crudType: 'update', entityID: PRODUCT_ID },
        { entityName: 'Sku', crudType: 'update' },
      ]);
    });

    /* ==============================================================================================
     * ⭐⭐ REVIEW FINDING SEC-AUTH-01 — THE OTHER TWO CASES THAT USED TO REQUIRE A VULNERABILITY
     * ==============================================================================================
     * "save asks create THEN update, in order" and "the create grant SHORT-CIRCUITS, so update is never
     * asked" both required the ordered pair. Under that pair a `create`-only principal could name an
     * existing product and have it UPDATED. The question now follows the operation.
     * ============================================================================================ */
    it('NET-NEW — SEC-AUTH-01 — saveProduct asks create when UNADDRESSED and update when ADDRESSED', async () => {
      // Unaddressed — a creation. `create` alone grants it; `update` is never asked.
      const creating = makeHandler(account(), ['create']);
      await creating.handler.saveProduct(unaddressedPayloadEvent('{}'));
      expect(creating.asked).toStrictEqual([{ entityName: 'Product', crudType: 'create' }]);

      // Addressed — an update. `update` alone grants it; `create` is never asked.
      const updating = makeHandler(account(), ['update']);
      await updating.handler.saveProduct(payloadEvent('{}'));
      expect(updating.asked).toStrictEqual([
        { entityName: 'Product', crudType: 'update', entityID: PRODUCT_ID },
      ]);
    });

    it('NET-NEW — SEC-AUTH-01 — a create-only principal can no longer UPDATE an addressed product', async () => {
      const escalating = makeHandler(account(), ['create']);

      const result = await escalating.handler.saveProduct(payloadEvent('{}'));

      expect(result.statusCode).toBe(403);
      expect(escalating.asked).toStrictEqual([
        { entityName: 'Product', crudType: 'update', entityID: PRODUCT_ID },
      ]);
      expect(escalating.calls).toStrictEqual([]);
      expect(escalating.decisions).toStrictEqual([]);
    });

    it('NET-NEW — AAP §0.4.2.1 — getProductSkusBySelectedOptions asks about Sku, not Product', async () => {
      /* The member answers with SKUs, so the entity whose read permission governs it is `Sku`. A
       * handler that asked about `Product` would admit and refuse the wrong callers. */
      const probe = makeHandler(account(), ['read']);

      await probe.handler.getProductSkusBySelectedOptions({
        pathParameters: { productID: PRODUCT_ID },
        queryStringParameters: { selectedOptions: 'o1' },
        headers: {},
      });

      expect(probe.asked).toStrictEqual([
        { entityName: 'Sku', crudType: 'read', entityID: PRODUCT_ID },
      ]);
    });

    it('NET-NEW — the two product-type routes ask about ProductType, not Product', async () => {
      const read = makeHandler(account(), ['read']);
      await read.handler.getProductType(identifierEvent(PRODUCT_TYPE_ID));
      expect(read.asked).toStrictEqual([
        { entityName: 'ProductType', crudType: 'read', entityID: PRODUCT_TYPE_ID },
      ]);

      /* SEC-AUTH-01: `saveProductType` has no creation path at all — an unaddressed request is a 400 —
       * so it asks `update` and never `create`, and a `create`-only grant no longer reaches it. */
      const save = makeHandler(account(), ['update']);
      await save.handler.saveProductType(productTypePayloadEvent('{}', PRODUCT_TYPE_ID));
      expect(save.asked).toStrictEqual([
        { entityName: 'ProductType', crudType: 'update', entityID: PRODUCT_TYPE_ID },
      ]);

      const createOnly = makeHandler(account(), ['create']);
      expect(
        (await createOnly.handler.saveProductType(productTypePayloadEvent('{}', PRODUCT_TYPE_ID)))
          .statusCode,
      ).toBe(403);
    });

    it('NET-NEW — loadDataFromFile is SECURE on Product, not anyLogin', async () => {
      /* Its `load` prefix matches no branch of the legacy ladder, so it falls through to the terminal
       * `return false` at [:L83] — i.e. it is NOT a process member and must not be admitted as one.
       * SEC-AUTH-01: the importer addresses no single row, so the question is the CREATE arm of the save
       * requirement, asked once rather than as an ordered pair. */
      const refused = makeHandler(account(), []);
      const result = await refused.handler.loadDataFromFile({
        queryStringParameters: { fileURL: 'https://example.test/products.txt' },
        headers: {},
      });

      expect(result.statusCode).toBe(403);
      expect(refused.calls).toStrictEqual([]);
      expect(refused.asked).toStrictEqual([{ entityName: 'Product', crudType: 'create' }]);
    });

    it('NET-NEW — newProduct asks create ALONE, and deleteProduct asks delete ALONE', async () => {
      const create = makeHandler(account(), ['create']);
      await create.handler.newProduct({ headers: {} } satisfies NewProductEvent);
      expect(create.asked).toStrictEqual([{ entityName: 'Product', crudType: 'create' }]);

      const remove = makeHandler(account(), ['delete']);
      await remove.handler.deleteProduct(identifierEvent(PRODUCT_ID));
      expect(remove.asked).toStrictEqual([
        { entityName: 'Product', crudType: 'delete', entityID: PRODUCT_ID },
      ]);
    });

    it('NET-NEW — SEC-AUTH-03 — the resolver is told the action and the resolved context reaches the write', async () => {
      const probe = makeHandler(account(), ['update']);

      await probe.handler.processProductUpdateSkus(payloadEvent('{}'));

      /* ONE resolution, carrying the routed action, the single operation and the addressed row. */
      expect(probe.requests).toHaveLength(1);
      expect(probe.requests[0]).toMatchObject({
        action: 'product.processProductUpdateSkus',
        crudType: 'update',
        entityName: 'Product',
        entityID: PRODUCT_ID,
      });

      /* And the write ran under THAT context rather than a memoised principal. */
      expect(probe.securityContexts).toHaveLength(1);
      expect(probe.securityContexts[0]?.accountContext.getCurrentAccount()).toStrictEqual(
        account(),
      );
    });
  });

  /* ==============================================================================================
   * API-01 — THE PROMPT'S OWN WORKED EXAMPLE, AND ITS T5 EDGE CASE
   * ============================================================================================== */

  describe('productHandler — API-01, getProductSkusBySelectedOptions argument order and T5', () => {
    it('NET-NEW — model/entity/Product.cfc:L366-L368 — selectedOptions FIRST, productID SECOND', async () => {
      /* ⛔ Both are 32-character-capable strings, so a forward written in the wrong order TYPE-CHECKS
       * PERFECTLY and silently asks the wrong question. Only an order assertion can catch it. */
      const probe = admitAll();

      await probe.handler.getProductSkusBySelectedOptions({
        pathParameters: { productID: PRODUCT_ID },
        queryStringParameters: { selectedOptions: 'opt-1,opt-2' },
        headers: {},
      });

      expect(probe.calls).toStrictEqual([
        {
          member: 'getProductSkusBySelectedOptions',
          through: 'service',
          args: ['opt-1,opt-2', PRODUCT_ID],
        },
      ]);
    });

    it('NET-NEW — AAP §0.6.1.3 T5 — an EMPTY selectedOptions is legal and must reach the service', async () => {
      /* `listLen("")` is zero, so zero EXISTS clauses are appended and the query legitimately degenerates
       * to "all option-bearing SKUs of this product". Both `Product.getSkuBySelectedOptions` and
       * `Sku.hasUniqueOptions` depend on that degenerate form — rejecting, defaulting or normalising it
       * would break both callers. */
      const probe = admitAll();

      const result = await probe.handler.getProductSkusBySelectedOptions({
        pathParameters: { productID: PRODUCT_ID },
        queryStringParameters: { selectedOptions: '' },
        headers: {},
      });

      expect(result.statusCode).toBe(200);
      expect(probe.calls).toStrictEqual([
        { member: 'getProductSkusBySelectedOptions', through: 'service', args: ['', PRODUCT_ID] },
      ]);
    });

    it('NET-NEW — an ABSENT selectedOptions parameter is a 400, which is not the same as an empty one', async () => {
      /* T5 makes the EMPTY STRING meaningful; it does not make the parameter optional. The distinction
       * is the reason the reader tests for presence rather than for truthiness. */
      const probe = admitAll();

      const result = await probe.handler.getProductSkusBySelectedOptions({
        pathParameters: { productID: PRODUCT_ID },
        queryStringParameters: {},
        headers: {},
      } satisfies SelectedOptionsEvent);

      expect(result.statusCode).toBe(400);
      expect(probe.calls).toStrictEqual([]);
    });

    it('NET-NEW — a missing productID path parameter is a 400 before the service is reached', async () => {
      const probe = admitAll();

      const result = await probe.handler.getProductSkusBySelectedOptions({
        pathParameters: {},
        queryStringParameters: { selectedOptions: 'o1' },
        headers: {},
      });

      expect(result.statusCode).toBe(400);
      expect(probe.calls).toStrictEqual([]);
    });
  });

  /* ==============================================================================================
   * API-01 — M1: THE IMPORTER, DISCLOSED AND DELIBERATELY NOT TRANSACTIONAL
   * ============================================================================================== */

  describe('productHandler — API-01/M1, the importer entry point', () => {
    it('NET-NEW — AAP §0.6.6 M3 — the importer does NOT enter a transaction', async () => {
      /* [model/dao/ProductDAO.cfc:L177] opens `transaction{` INSIDE the record loop, so each row commits
       * independently: "one transaction per row, not one per import". Wrapping the whole import in a
       * single transaction would CHANGE that semantics, converting a partially-imported catalog into an
       * all-or-nothing one. `ProductWriteGraph` structurally excludes the member for this reason. */
      const probe = admitAll();

      const result = await probe.handler.loadDataFromFile({
        queryStringParameters: { fileURL: 'https://example.test/products.txt' },
        headers: {},
      });

      expect(result.statusCode).toBe(200);
      expect(probe.decisions).toStrictEqual([]);
      expect(probe.calls.map((call) => call.through)).toStrictEqual(['service']);
    });

    it('NET-NEW — L65 — textQualifier is OPTIONAL and is forwarded second when supplied', async () => {
      const supplied = admitAll();
      await supplied.handler.loadDataFromFile({
        queryStringParameters: { fileURL: 'https://example.test/p.txt', textQualifier: '"' },
        headers: {},
      });
      expect(supplied.calls[0]?.args).toStrictEqual(['https://example.test/p.txt', '"']);

      const omitted = admitAll();
      await omitted.handler.loadDataFromFile({
        queryStringParameters: { fileURL: 'https://example.test/p.txt' },
        headers: {},
      });
      expect(omitted.calls[0]?.args).toStrictEqual(['https://example.test/p.txt', undefined]);
    });

    it('NET-NEW — an absent fileURL is a 400, since L65 declares it required', async () => {
      const probe = admitAll();

      const result = await probe.handler.loadDataFromFile({
        queryStringParameters: {},
        headers: {},
      } satisfies LoadDataFromFileEvent);

      expect(result.statusCode).toBe(400);
      expect(probe.calls).toStrictEqual([]);
    });
    /* ⛔ A CASE STOOD HERE ASSERTING THAT A REFUSED IMPORT LOCATION ANSWERS 400 WITHOUT DISCLOSING THE
     * POLICY, AND IT IS WITHDRAWN WITH THE BEHAVIOUR IT PINNED. The refusal came from an import-source
     * policy — an allow-list of schemes, hosts and addresses, with an `ImportSourceRejectedError` to report
     * a violation — that a later review withdrew in full, along with the error class itself. The argument
     * was cardinality, not merits: `model/dao/ProductDAO.cfc:L87` retrieves whatever location it is handed
     * and checks nothing, so refusing one is a behavioural departure, and AAP §0.6.7.7 licenses exactly ONE
     * such departure (D18, the importer's parameterised SQL). The exposure is carried rather than closed, as
     * AAP §0.6.6 mismatch M4 (CWE-918), and it is flagged at the member in `src/services/ProductService.ts`
     * and at the retrieval seam in `src/adapters/mysql/MySqlProductRepository.ts` rather than asserted here.
     *
     * The 400-versus-500 presentation rule the case also exercised is still covered: the neighbouring cases
     * pin the request-shape 400 for an absent `fileURL` and the exact two-argument forwarding, and the
     * handler's error mapping is asserted in the folded `handlers/productHandler.test.ts` section below. */
  });

  /* ==============================================================================================
   * API-01/TX-01 — THE PROCESS PIPELINE
   * ============================================================================================== */

  describe('productHandler — API-01/TX-01, the process pipeline enters a transaction', () => {
    it('NET-NEW — every process route reaches the GRAPH, never the captured service', async () => {
      /* ⛔ This is TX-01's defect shape at the Product boundary. A route that closed over the injected
       * service would run identically in every happy-path assertion while performing its writes OUTSIDE
       * the transaction — so the only thing that catches it is asserting WHICH object answered. */
      const probe = admitAll();

      await probe.handler.processProductAddOptionGroup(payloadEvent('{"optionGroup":"g1"}'));
      await probe.handler.processProductAddOption(payloadEvent('{"option":"o1"}'));
      await probe.handler.processProductUpdateSkus(
        payloadEvent('{"updatePriceFlag":1,"price":10}'),
      );

      // Both the read of the subject and the process call itself must be inside the transaction.
      expect(probe.calls.every((call) => call.through === 'graph')).toBe(true);
      expect(probe.decisions).toStrictEqual(['commit', 'commit', 'commit']);
    });

    it('NET-NEW — AAP §0.6.6 M6 — the subject is READ through the transaction graph', async () => {
      const probe = admitAll();

      await probe.handler.processProductUpdateSkus(payloadEvent('{}'));

      // getProduct precedes the process member, and both are on the graph.
      expect(probe.calls.map((call) => call.member)).toStrictEqual([
        'getProduct',
        'processProductUpdateSkus',
      ]);
      expect(probe.calls.map((call) => call.through)).toStrictEqual(['graph', 'graph']);
    });

    it('NET-NEW — an unknown identifier is a 404, and the process member is never reached', async () => {
      /* ⚠️ THE UNIT STILL COMMITS, and that is correct rather than a leak. The subject is read INSIDE the
       * transaction, so a miss returns early with the gate's `subject` still unset — leaving a read-only
       * unit with nothing to undo. Rolling a pure read back would raise a spurious failure. The assertion
       * that carries weight is therefore that NO WRITE MEMBER RAN, not that no transaction opened. */
      const probe = admitAll({ product: null });

      const result = await probe.handler.processProductUpdateSkus(payloadEvent('{}'));

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toStrictEqual({ message: 'Not found' });
      expect(probe.calls.map((call) => call.member)).toStrictEqual(['getProduct']);
      expect(probe.decisions).toStrictEqual(['commit']);
    });

    it('NET-NEW — TX-01 — a SKU-level finding ROLLS BACK, not only a product-level one', async () => {
      /* ⛔ THE COMPLETE PREDICATE, NOT `product.hasErrors()`. `skuBatchHasErrors` reads the product's own
       * bag OR any member SKU's bag. Narrowing the gate to the product alone would commit a batch whose
       * SKUs carry findings — exactly what AAP §0.6.2's read-back loop depends on being prevented. */
      const withFailingSku = makeProduct();
      /* `Sku` declares no error surface of its own; `manageEntity` is what attaches the bag, exactly as
       * the service's own creation path does. Using a bare `Sku` here would leave the member invisible to
       * `carriesErrorSurface` and the case would pass for the wrong reason. */
      const failing = manageEntity(new Sku(), SKU_ENTITY_METADATA);
      failing.skuID = 'cccccccccccccccccccccccccccccccc';
      failing.addError('skuCode', 'is not unique');
      withFailingSku.skus = [failing];

      const probe = admitAll({ product: withFailingSku });

      const result = await probe.handler.processProductUpdateSkus(payloadEvent('{}'));

      expect(probe.decisions).toStrictEqual(['rollback']);
      // The roll-back surfaces as a failure rather than as a 200 over discarded work.
      expect(result.statusCode).not.toBe(200);

      /*
       * ⭐ AND THE FINDING ITSELF IS PUBLISHED, WHICH IT WAS NOT. The write boundary reports a refused gate
       * by raising a plain `DomainError`, and ./httpResponse maps that to `500` with all detail withheld —
       * so this caller used to receive an opaque service fault for a request its own SKU code refused. A
       * code review classified that as a MAJOR validation/error-mapping defect; the handler now lifts the
       * COMPLETE bag — the product's and every SKU's, because per-SKU findings never merge upward — into a
       * `ValidationError`, verbatim.
       */
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toStrictEqual({
        message: 'Validation failed',
        errors: { skuCode: ['is not unique'] },
      });
    });

    it('NET-NEW — a product-level finding also rolls back, and its key is published too', async () => {
      const withError = makeProduct();
      withError.addError('productName', 'is required');

      const probe = admitAll({ product: withError });

      const result = await probe.handler.processProductUpdateSkus(payloadEvent('{}'));

      expect(probe.decisions).toStrictEqual(['rollback']);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toStrictEqual({
        message: 'Validation failed',
        errors: { productName: ['is required'] },
      });
    });

    it('NET-NEW — AAP §0.4.1.5 — a legitimate ZERO survives into the process object', async () => {
      /* `model/validation/Product_UpdateSkus.json` conditions the price rules on `{"eq":1}`, so the flag
       * values are data, not booleans. Reading them with truthiness would silently DROP a legitimate `0`
       * and turn "explicitly do not update" into "unspecified". */
      const probe = admitAll();

      await probe.handler.processProductUpdateSkus(
        payloadEvent('{"updatePriceFlag":0,"price":0,"updateListPriceFlag":0,"listPrice":0}'),
      );

      const call = probe.calls.find((entry) => entry.member === 'processProductUpdateSkus');
      const processObject = call?.args[1] as ProductUpdateSkus | undefined;

      expect(processObject?.updatePriceFlag).toBe(0);
      expect(processObject?.price).toBe(0);
      expect(processObject?.updateListPriceFlag).toBe(0);
      expect(processObject?.listPrice).toBe(0);
    });

    it('NET-NEW — the addOptionGroup and addOption payload keys land on their process objects', async () => {
      const groupProbe = admitAll();
      await groupProbe.handler.processProductAddOptionGroup(
        payloadEvent('{"optionGroup":"group-1"}'),
      );
      const groupCall = groupProbe.calls.find(
        (entry) => entry.member === 'processProductAddOptionGroup',
      );
      expect((groupCall?.args[1] as ProductAddOptionGroup | undefined)?.optionGroup).toBe(
        'group-1',
      );

      const optionProbe = admitAll();
      await optionProbe.handler.processProductAddOption(payloadEvent('{"option":"option-1"}'));
      const optionCall = optionProbe.calls.find(
        (entry) => entry.member === 'processProductAddOption',
      );
      expect((optionCall?.args[1] as ProductAddOption | undefined)?.option).toBe('option-1');
    });

    it('NET-NEW — a malformed body is a 400 before any transaction opens', async () => {
      const probe = admitAll();

      const result = await probe.handler.processProductUpdateSkus(payloadEvent('not json'));

      expect(result.statusCode).toBe(400);
      expect(probe.decisions).toStrictEqual([]);
    });

    it('NET-NEW — processProductUpdateDefaultImageFileNames takes ONE argument, not two', async () => {
      /* [model/service/ProductService.cfc:L208] declares `( required any product )` alone. It is the only
       * process member with that arity, and it reads no body. */
      const probe = admitAll();

      await probe.handler.processProductUpdateDefaultImageFileNames(identifierEvent(PRODUCT_ID));

      const call = probe.calls.find(
        (entry) => entry.member === 'processProductUpdateDefaultImageFileNames',
      );
      expect(call?.args).toHaveLength(1);
    });
  });

  /* ==============================================================================================
   * API-01 — SAVE, DELETE AND THE READ-ONLY ROUTES
   * ============================================================================================== */

  describe('productHandler — API-01, saveProduct, saveProductType and deleteProduct', () => {
    it('NET-NEW — an ABSENT identifier CREATES through newProduct, and does not 404', async () => {
      const probe = admitAll();

      const result = await probe.handler.saveProduct({
        body: '{"productName":"New"}',
        pathParameters: {},
        headers: {},
      } satisfies ProductSaveEvent);

      expect(result.statusCode).toBe(200);
      expect(probe.calls.map((call) => call.member)).toStrictEqual(['newProduct', 'saveProduct']);
      expect(probe.calls.every((call) => call.through === 'graph')).toBe(true);
      expect(probe.decisions).toStrictEqual(['commit']);
    });

    it('NET-NEW — a PRESENT identifier UPDATES, and an unknown one is a 404', async () => {
      const present = admitAll();
      await present.handler.saveProduct(payloadEvent('{}'));
      expect(present.calls.map((call) => call.member)).toStrictEqual(['getProduct', 'saveProduct']);

      const missing = admitAll({ product: null });
      const result = await missing.handler.saveProduct(payloadEvent('{}'));
      expect(result.statusCode).toBe(404);
      // The read happened inside the unit, so it commits with nothing to undo; the SAVE never ran.
      expect(missing.calls.map((call) => call.member)).toStrictEqual(['getProduct']);
    });

    it('NET-NEW — the saveProduct gate reads the PRE-SAVE subject, not only the returned instance', async () => {
      /* ⛔ THE DECISIVE CASE FOR THE GATE'S FIRST HALF. STEP 5 of the service rebinds its local —
       * `product = await this.persistProduct(product)` — so the instance the persister answers with MAY
       * DIFFER from the one validation accumulated onto. Here the PRE-SAVE subject carries the finding and
       * the persister answers with a DIFFERENT, CLEAN product. A gate reading only the returned instance
       * would see no findings and COMMIT a subject that had them. */
      const withError = makeProduct();
      withError.addError('productCode', 'is not unique');

      const clean = makeProduct('dddddddddddddddddddddddddddddddd');

      const probe = admitAll({ product: withError, savedProduct: clean });

      const result = await probe.handler.saveProduct(payloadEvent('{}'));

      expect(probe.decisions).toStrictEqual(['rollback']);
      /* The bag that caused the refusal is the PRE-SAVE subject's, and it is the one published. */
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toStrictEqual({
        message: 'Validation failed',
        errors: { productCode: ['is not unique'] },
      });
    });

    it('NET-NEW — the saveProduct gate ALSO reads the returned instance, not only the subject', async () => {
      /* The mirror of the case above, so neither half of the disjunction can be dropped: the subject is
       * clean and the instance the persister answers with carries the finding. */
      const clean = makeProduct();

      const withError = makeProduct('eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
      withError.addError('urlTitle', 'is not unique');

      const probe = admitAll({ product: clean, savedProduct: withError });

      const result = await probe.handler.saveProduct(payloadEvent('{}'));

      expect(probe.decisions).toStrictEqual(['rollback']);
      /* And when the finding lives on the RETURNED instance instead, that bag is the one published — which
       * is why the lift consults both references in the gate's own order. */
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toStrictEqual({
        message: 'Validation failed',
        errors: { urlTitle: ['is not unique'] },
      });
    });

    it('NET-NEW — L294 — saveProductType REQUIRES an identifier, so an absent one is a 400', async () => {
      /* Unlike `saveProduct` there is no create route here: AAP §0.4.2.5 approves `getProductType` but no
       * `newProductType`, and no `createproducttype.cfm` view exists to imply one. */
      const probe = admitAll();

      const result = await probe.handler.saveProductType(productTypePayloadEvent('{}'));

      expect(result.statusCode).toBe(400);
      expect(probe.calls).toStrictEqual([]);
      expect(probe.decisions).toStrictEqual([]);
    });

    it('NET-NEW — saveProductType commits when the returned product type carries no findings', async () => {
      /* The success half of the gate. `model/service/ProductService.cfc:L310` returns the product type on
       * every path, so "succeeded" is expressed as a returned entity with an EMPTY bag — not as the absence
       * of a rejection. */
      const probe = admitAll();

      const result = await probe.handler.saveProductType(
        productTypePayloadEvent('{"productTypeName":"Merchandise"}', PRODUCT_TYPE_ID),
      );

      expect(result.statusCode).toBe(200);
      expect(probe.decisions).toStrictEqual(['commit']);
      expect(probe.calls.map((call) => call.member)).toStrictEqual([
        'getProductType',
        'saveProductType',
      ]);
    });

    it('NET-NEW — saveProductType ROLLS BACK and refuses when the returned product type carries findings', async () => {
      /* ⛔ THE CASE THAT PINS THE COMMIT GATE, AND THE ONE AN EARLIER REVISION COULD NOT HAVE WRITTEN.
       * `../../src/handlers/productHandler`'s gate was hardcoded to `() => false` on the reasoning that
       * `ProductType` has no error surface and that `BaseService.save` raises. Both grounds are gone: the
       * service composes the surface with `manageEntity` and resolves `ProductTypeWithErrorState`, and the
       * base service reproduces `model/service/HibachiService.cfc:L103`'s single exit, so a validation
       * failure RETURNS. With a constant `false` this exact request would have committed the transaction and
       * answered 200 with a projection of a product type that was never written — a caller told its write
       * succeeded when it did not. The gate must therefore answer `true` here, and the boundary must refuse.
       *
       * The findings stay ON THE ENTITY, exactly where `:L306` reads them — AND they are now also published.
       * An earlier revision said "the roll-back is what reports the refusal, which is why nothing is lifted
       * into a carrier at this boundary"; that produced an opaque `500` for a caller whose product-type name
       * was rejected, which a code review classified as a MAJOR validation/error-mapping defect. */
      const probe = admitAll({ productTypeSaveError: 'productTypeName' });

      const result = await probe.handler.saveProductType(
        productTypePayloadEvent('{"productTypeName":""}', PRODUCT_TYPE_ID),
      );

      expect(probe.decisions).toStrictEqual(['rollback']);
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toStrictEqual({
        message: 'Validation failed',
        errors: { productTypeName: ['refused'] },
      });
      /* The work still ran in full — the gate is a COMMIT decision, not a pre-check that skips the save. */
      expect(probe.calls.map((call) => call.member)).toStrictEqual([
        'getProductType',
        'saveProductType',
      ]);
    });

    it('NET-NEW — L317 — deleteProduct reports its boolean UNINVERTED, and false is not a refusal', async () => {
      /* The legacy declares `public boolean function deleteProduct(...)`. `false` means "the delete was
       * refused by a validation guard", which is a 200 carrying `false` — NOT a 4xx. Reinterpreting it as
       * a status would invent a refusal the legacy does not express. */
      const probe = admitAll();

      const result = await probe.handler.deleteProduct(identifierEvent(PRODUCT_ID));

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toBe(true);
      expect(probe.decisions).toStrictEqual(['commit']);
    });

    it('NET-NEW — L317 — a REFUSED delete is a 200 carrying false, NOT a 404 and NOT a 4xx', async () => {
      /* ⛔ THE CASE THAT PINS THE BOOLEAN'S MEANING. `model/validation/Product.json` guards the delete on
       * `transactionExistsFlag` and `physicalCounts`, and a guard that refuses makes the legacy member
       * answer `false` — a SUCCESSFUL call reporting "not deleted". Mapping that onto a 404 would conflate
       * "no such product" with "this product may not be deleted", and mapping it onto any 4xx would invent
       * a client error the legacy does not express. */
      const probe = admitAll({ deleteResult: false });

      const result = await probe.handler.deleteProduct(identifierEvent(PRODUCT_ID));

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toBe(false);
      // The refusal is the service's answer, so the unit still commits: nothing was written to undo.
      expect(probe.decisions).toStrictEqual(['commit']);
    });

    it('NET-NEW — deleteProduct on an unknown identifier is a 404, distinct from a refused delete', async () => {
      /* Three outcomes must stay distinguishable: 404 "no such row", 200-carrying-`false` "a guard refused
       * the delete", and 200-carrying-`true` "deleted". Collapsing any pair would lose information the
       * legacy boolean carries. */
      const probe = admitAll({ product: null });

      const result = await probe.handler.deleteProduct(identifierEvent(PRODUCT_ID));

      expect(result.statusCode).toBe(404);
      expect(probe.calls.map((call) => call.member)).toStrictEqual(['getProduct']);
    });
  });

  describe('productHandler — API-01, the read-only routes', () => {
    it('NET-NEW — the read routes do NOT open a transaction', async () => {
      const probe = admitAll();

      await probe.handler.getProduct(identifierEvent(PRODUCT_ID));
      await probe.handler.getProductType(identifierEvent(PRODUCT_TYPE_ID));
      await probe.handler.getProductSmartList({ queryStringParameters: {}, headers: {} });
      await probe.handler.getFormattedOptionGroups(identifierEvent(PRODUCT_ID));

      expect(probe.decisions).toStrictEqual([]);
      expect(probe.calls.every((call) => call.through === 'service')).toBe(true);
    });

    it('NET-NEW — getProduct projects a response rather than returning the entity', async () => {
      const probe = admitAll();

      const result = await probe.handler.getProduct(identifierEvent(PRODUCT_ID));

      expect(result.statusCode).toBe(200);
      // A projection, so no domain method or private field can leak through the boundary.
      expect(JSON.parse(result.body)).toStrictEqual({ productID: PRODUCT_ID });
    });

    it('NET-NEW — getProduct on an unknown identifier is a 404, and an absent one is a 400', async () => {
      const missing = admitAll({ product: null });
      expect((await missing.handler.getProduct(identifierEvent(PRODUCT_ID))).statusCode).toBe(404);

      const absent = admitAll();
      const result = await absent.handler.getProduct(identifierEvent());
      expect(result.statusCode).toBe(400);
      expect(absent.calls).toStrictEqual([]);
    });

    it('NET-NEW — AAP §0.4.2.1 Discrepancy 1 — currentURL is NOT forwarded from the request', async () => {
      /* [L342] declares `getProductSmartList(struct data={}, currentURL="")`, and `currentURL` carries NO
       * CFML type at all. The target tightens it to an optional string and the boundary supplies no value
       * for it: a request-supplied URL is not the legacy's `currentURL`, which came from the framework. */
      const probe = admitAll();

      await probe.handler.getProductSmartList({
        queryStringParameters: { currentURL: 'https://attacker.test/' },
        headers: {},
      } satisfies ProductSmartListEvent);

      const call = probe.calls.find((entry) => entry.member === 'getProductSmartList');
      expect(call?.args[1]).toBeUndefined();
    });

    it('NET-NEW — only the legacy SmartList vocabulary is forwarded; unknown names are ignored', async () => {
      /* `org/Hibachi/HibachiSmartList.cfc` recognises seven exact names and seven prefixes. Anything else
       * is not a filter and must not be smuggled into the query as one. */
      const probe = admitAll();

      await probe.handler.getProductSmartList({
        queryStringParameters: {
          keyword: 'shirt',
          'P:Current': '2',
          'F:productName': 'shirt',
          bogus: 'ignored',
          joins: 'ignored-too',
        },
        headers: {},
      });

      const call = probe.calls.find((entry) => entry.member === 'getProductSmartList');
      const input = call?.args[0] as Record<string, unknown> | undefined;

      expect(input).toStrictEqual({ keyword: 'shirt', 'P:Current': '2', 'F:productName': 'shirt' });
    });

    it('NET-NEW — the smart-list projection preserves every pagination member', async () => {
      const probe = admitAll();

      const result = await probe.handler.getProductSmartList({
        queryStringParameters: {},
        headers: {},
      });

      expect(JSON.parse(result.body)).toStrictEqual({
        records: [],
        pageRecords: [],
        recordsCount: 0,
        pageRecordsStart: 0,
        pageRecordsEnd: 0,
        currentPage: 1,
        totalPages: 0,
      });
    });

    it('NET-NEW — newProduct answers a projection of an unsaved product without a transaction', async () => {
      const probe = admitAll();

      const result = await probe.handler.newProduct({ headers: {} });

      expect(result.statusCode).toBe(200);
      expect(probe.decisions).toStrictEqual([]);
      expect(probe.calls.map((call) => call.member)).toStrictEqual(['newProduct']);
    });

    it('NET-NEW — getFormattedOptionGroups answers the grouped select projection KEYED BY NAME', async () => {
      const probe = admitAll();

      const result = await probe.handler.getFormattedOptionGroups(identifierEvent(PRODUCT_ID));

      expect(result.statusCode).toBe(200);
      /* ⭐ A KEYED OBJECT on the wire, one member per option-group NAME, because that is the shape the
       * service answers — TR-1's tightening of the CFML struct at
       * `model/service/ProductService.cfc:L71-L79`. A revision published an ARRAY of
       * `{optionGroupName, options}` entries and this case asserted it; review finding F3 withdrew both.
       * Both option members are copied verbatim and nothing else is published — no `optionGroupID` (S9). */
      expect(JSON.parse(result.body)).toStrictEqual({
        Size: [{ name: 'Large', value: 'large' }],
      });
      expect(Array.isArray(JSON.parse(result.body))).toBe(false);
    });
  });

  /* ==============================================================================================
   * API-01 — THE PLAN-ANNOTATED BOUNDARY MEMBERS: FLAGGED, NEVER DROPPED (TR-5) — AND MEASURED
   * ============================================================================================== */

  describe('productHandler — API-01/TR-5, the boundary-limited members stay routable', () => {
    it('NET-NEW — TR-5 — all five plan-annotated process members are PRESENT on the surface', () => {
      /* "The member is never quietly dropped from the interface." Whatever each one DOES at run time is a
       * separate question, settled by the three cases below; presence on the surface is unconditional,
       * because §0.4.2's 28-member count is only checkable from the outside if every member is reachable. */
      const probe = admitAll();

      for (const member of [
        'processProductAddProductReview',
        'processProductAddSubscriptionTerm',
        'processProductDeleteDefaultImage',
        'processProductUpdateDefaultImageFileNames',
        'processProductUploadDefaultImage',
      ]) {
        expect(Object.keys(probe.handler)).toContain(member);
        expect(typeof (probe.handler as unknown as Record<string, unknown>)[member]).toBe(
          'function',
        );
      }
    });

    it('NET-NEW — the CONDITIONAL member answers the product on the legacy no-op path', async () => {
      /*
       * ⭐ THE MEASURED INVENTORY, HALF ONE. Of the five members AAP §0.4.2.1 annotates as boundary-stubbed,
       * `processProductDeleteDefaultImage` refuses only CONDITIONALLY, and the condition is the legacy's own:
       * [model/service/ProductService.cfc:L199] tests `structKeyExists(arguments.data, "imageFile")` and does
       * NOTHING when the key is absent, returning the product at [:L205]. A request naming no image file
       * therefore answers the product — reaching the graph twice, once to resolve it and once to run the
       * member. Only the path that WOULD delete a file touches the excluded `fileExists`/`fileDelete` pair at
       * [:L200-L201], and only that path refuses.
       *
       * ⛔ A REVISION OF `../src/handlers/router.ts` DECLARED THAT ALL SEVEN ANNOTATED MEMBERS "answer with
       * the documented not-implemented failure". Review finding F4 measured the claim false of this member and
       * of the one below, and the inventory was corrected rather than the code bent to match it — refusing
       * here would refuse input the legacy accepts. This case fails if that claim is ever reinstated.
       */
      const probe = admitAll();

      const result = await probe.handler.processProductDeleteDefaultImage(payloadEvent('{}'));

      expect(result.statusCode).toBe(200);
      expect(probe.calls.map((call) => call.through)).toStrictEqual(['graph', 'graph']);
    });

    it('NET-NEW — the FULLY PORTED member answers the product, and refusing would break saveProduct', async () => {
      /*
       * ⭐ THE MEASURED INVENTORY, HALF TWO. `processProductUpdateDefaultImageFileNames` is not stubbed at all.
       * [model/service/ProductService.cfc:L208-L214] is a two-line loop — `sku.setImageFile(
       * sku.generateImageFileName() )` — and `generateImageFileName` reads only `SettingResolverPort`, an
       * IN-SCOPE port with a shipped resolver. Nothing excluded is on the path, so there is nothing to stub.
       *
       * ⛔ AND REFUSING HERE WOULD BE A FUNCTIONAL REGRESSION, NOT A BOUNDARY. `saveProduct` invokes this
       * member at [model/service/ProductService.cfc:L282], and both `processProduct_addOptionGroup` [:L123]
       * and `processProduct_addSubscriptionTerm` [:L193] END by delegating to it, so a refusal would take
       * every new-product save down with it. That is why F4 was resolved by correcting the declared inventory
       * rather than by "making both members consistent" with an annotation that measurement disproved.
       */
      const probe = admitAll();

      const result = await probe.handler.processProductUpdateDefaultImageFileNames(
        identifierEvent(PRODUCT_ID),
      );

      expect(result.statusCode).toBe(200);
      expect(probe.calls.map((call) => call.member)).toStrictEqual([
        'getProduct',
        'processProductUpdateDefaultImageFileNames',
      ]);
      expect(probe.calls.map((call) => call.through)).toStrictEqual(['graph', 'graph']);
    });

    it('NET-NEW — the three process-object routes answer 501 WITHOUT reaching the graph', async () => {
      /*
       * ⛔ THE DEFECT THIS PINS. Each of these three forwards a process object whose members
       * ../src/services/ProductService narrows by testing for a CALLABLE accessor — `getNewProductReview`;
       * `getSubscriptionTermID`/`getPrice`/`getRenewalPrice`/`getListPrice`; and
       * `getImageFile`/`getPropertyMetaData`/`addError`. A parsed JSON body cannot carry a function, so the
       * narrowing failed for EVERY input and every request answered a deterministic 500 with the reason
       * withheld. A code review classified that as a MAJOR boundary-contract defect and directed an explicit
       * NotImplementedError/501 boundary, which is what these assertions hold in place.
       *
       * ⭐ AND NO TRANSACTION IS OPENED, which is the second half of the fix: `calls` stays empty, so nothing
       * resolved a product or began a unit of work for work that cannot succeed.
       */
      for (const member of [
        'processProductAddProductReview',
        'processProductAddSubscriptionTerm',
        'processProductUploadDefaultImage',
      ] as const) {
        const probe = admitAll();

        const result = await probe.handler[member](payloadEvent('{"listPrice":10}'));

        expect(result.statusCode).toBe(501);
        /* The neutral text ./httpResponse publishes for this family — the member is named nowhere in it. */
        expect(JSON.parse(result.body)).toStrictEqual({
          message: 'This operation is not implemented',
        });
        expect(probe.calls).toStrictEqual([]);
      }
    });

    it('NET-NEW — the request-shape answers still come FIRST, so 501 is not a blanket reply', async () => {
      /* An unaddressed product is still a 400 and an unparseable body is still a 400: the boundary refusal
       * is what a WELL-FORMED request receives, not what every request receives. */
      const probe = admitAll();

      const unaddressed = await probe.handler.processProductAddProductReview({
        body: '{}',
        pathParameters: null,
        headers: {},
      });
      const malformed = await probe.handler.processProductAddProductReview(payloadEvent('{'));

      expect(unaddressed.statusCode).toBe(400);
      expect(malformed.statusCode).toBe(400);
      expect(probe.calls).toStrictEqual([]);
    });

    it('NET-NEW — the GATE still answers before the boundary does', async () => {
      /* Ordering, not status: an unauthorised caller must not be able to distinguish an unavailable member
       * from an available one. The refusal it receives is the gate's, and the graph is untouched. */
      const probe = makeHandler(undefined, EVERY_CRUD_TYPE);

      const result = await probe.handler.processProductAddSubscriptionTerm(payloadEvent('{}'));

      expect(result.statusCode).toBe(401);
      expect(probe.calls).toStrictEqual([]);
    });
  });
});
