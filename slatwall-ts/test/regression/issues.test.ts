/**
 * TRACEABLE — the catalog issue regressions ported from `meta/tests/unit/IssuesTest.cfc`.
 *
 * WHAT THIS FILE CONTRIBUTES, STATED AS A DOCUMENTARY COUNT AND NOTHING MORE
 * -------------------------------------------------------------------------
 * This file carries **five of the suite's nine traceable assertions** — the five AAP-named catalog
 * regressions — and it is one of only **five of the twenty files under `test/**` that are traceable
 * at all**. Alongside those five it adds **three further in-scope regressions discovered by reading
 * the legacy class directly** rather than by working from the plan's list: `issue_1348`,
 * `issue_1690` and `issue_1690_2`. Eight tests, five traceable-and-named, three
 * traceable-and-beyond-the-plan.
 *
 * ⚠️ THAT COUNT IS DOCUMENTARY BOOKKEEPING, NOT A COVERAGE MEASUREMENT. It says how many
 * assertions can be pointed back at a named legacy line. It says nothing about how much of the
 * ported slice is exercised, and it must not be re-read as an empirical coverage figure. The
 * honest ratio for the slice as a whole lives in the subtree README; the per-file labels exist so
 * that ratio stays visible per file instead of only in aggregate.
 *
 * AN INTENTIONAL INTEGRATION-TO-UNIT STRUCTURAL SHIFT
 * --------------------------------------------------
 * `meta/tests/unit/IssuesTest.cfc` extends `SlatwallUnitTestBase`, which boots the whole FW/1
 * application (`SlatwallUnitTestBase.cfc:L52`, `:L60`) and then resolves collaborators through DI/1
 * by string name — `request.slatwallScope.getService("productService")` at `:L75`, `:L93` and
 * `:L103`. Those are INTEGRATION tests against a live ORM session and a live datasource.
 *
 * The tests below import the class under test and construct it with hand-written doubles, so they
 * are UNIT tests. That is a deliberate structural change, made possible by the ports, and a
 * reviewer comparing the two suites should expect the difference by design rather than read it as
 * a gap. The consequence worth naming: these tests can prove ordering, argument shape and
 * per-instance isolation that the legacy suite could not observe, and they cannot prove anything
 * about Hibernate's own behaviour, which the legacy suite exercised implicitly.
 *
 * TRACEABILITY HERE IS DOCUMENTARY, NEVER EMPIRICAL
 * ------------------------------------------------
 * MXUnit and CFSelenium are not vendored in this repository, and `meta/tests/readme.txt:L4-L5`
 * requires MXUnit to be installed with a mapping inside CFIDE — and CFSelenium likewise for the
 * functional folder — before any of it can run. `meta/docker/slatwall-local-dev/` does not exist,
 * so there is no CFML runtime here either. **The legacy suite was therefore never executed, and no
 * runtime behavioural comparison against the original was performed.** Every locator below was
 * established by READING the legacy source. Where this file records what the legacy code does, that
 * is a reading, not a measurement.
 *
 * M5 — EACH MANUAL `ormFlush()` BECOMES AN EXPLICIT UNIT-OF-WORK BOUNDARY
 * ----------------------------------------------------------------------
 * `issue_1097` calls `ormFlush()` twice, at `IssuesTest.cfc:L66` and `:L70` — once after the save
 * and once after the delete. Those calls are not incidental: the two lifecycle hooks that would
 * otherwise have flushed are COMMENTED OUT in the base class, at `SlatwallUnitTestBase.cfc:L53`
 * (`reloadApplication()`) and `:L70` (`endSlatwallLifecycle()`), so no automatic request-end flush
 * ever ran and the test had to force one itself. A stateless handler has no request-end hook to
 * inherit either, so each flush becomes one explicit `UnitOfWork` boundary — two boundaries, in the
 * same order, asserted as such.
 *
 * M6 — SAME-TRANSACTION VISIBILITY FOR SKU UNIQUENESS IS PRESERVED
 * ---------------------------------------------------------------
 * `hasUniqueOptions` is a declarative rule that runs a QUERY (`model/entity/Sku.cfc:L763`), so a
 * SKU's uniqueness verdict depends on what its siblings have already written. The port keeps that
 * ordering: the uniqueness lookup reads live state, in sequence, inside the boundary that is
 * writing. No test below may substitute a pre-fetched snapshot, cache a lookup across saves,
 * reorder or batch the validation, or validate only after every insert — each of those changes the
 * verdict silently, with no error and no compile failure.
 *
 * M7 — MEMOISATION IS REQUEST/FACTORY SCOPED, NEVER MODULE SCOPED
 * --------------------------------------------------------------
 * Nothing survives between Lambda invocations except module-scope state, so every test below builds
 * its own doubles through a factory and holds no shared mutable state. `issue_1097` proves the
 * point rather than asserting it in prose: it runs a second, freshly built simulated invocation and
 * shows it inherits none of the first invocation's transaction events or recorded calls.
 *
 * CORRECTED DECLARATION ADJUDICATION — READ FROM `meta/tests/unit/IssuesTest.cfc` DIRECTLY
 * ---------------------------------------------------------------------------------------
 * Three locators are easy to get wrong, so all three are named:
 *
 *   - **`:L126-L138` is `issue_1348`** — a Product/Sku catalog regression, fully in scope, and one
 *     of the three beyond-the-plan additions carried here.
 *   - **`:L140` begins `issue_1376`** — DELIBERATELY DECLINED. It drives `accountService` and
 *     `entityNew("SlatwallAccount")`, and the Account family is explicitly out of scope, so no test
 *     named `issue_1376` exists in this file.
 *   - **`:L183` begins `issue_1604`** — DELIBERATELY DECLINED. It reads `getCart()` and calls
 *     `orderService.processOrder(...)`, and the Order family is explicitly out of scope. **`:L183`
 *     is NOT the locator for `issue_1348`**; a plan revision that paired them was wrong, and the
 *     correction is recorded here so a reader following that pairing finds the real span.
 *
 * `issue_1335` IS A PARTIAL TRANSLATION, AND SAYS SO
 * -------------------------------------------------
 * Its legacy subject is `entityNew("SlatwallSkuCurrency")` (`:L112`) — an entity the slice
 * excludes. The regression is retained because the CONSTRAINTS it asserts are in scope: see the
 * scoping note on that test, which names the excluded `model/validation/SkuCurrency.json` and shows
 * why its price and list-price rules are byte-equivalent to the retained `Sku` ones. What is
 * exercised is the in-scope `Sku`, never a Currency or SkuCurrency relationship.
 *
 * CARRIED DEFECTS
 * --------------
 * Two defects are carried here as focused `TODO(parity)` annotations at the exact assertion or
 * wiring site that exercises them — **D17** on `issue_1097` and **D19** on `issue_1348`. The
 * standard is preserve-and-annotate rather than repair. Defects this file does not exercise are not
 * restated: the register is the register, and copying unrelated entries here would dilute the two
 * that matter.
 */

import {
  CONTENT_ACCESS_PRODUCT_TYPE_ID,
  MERCHANDISE_PRODUCT_TYPE_ID,
} from '../fixtures/productTypes';
import {
  buildOption,
  buildOptionGroup,
  buildProduct,
  buildProductType,
  buildSku,
  createAccessContentDouble,
  createAccountContextDouble,
  createBaseServicePersistenceDouble,
  createDefaultSkuDelegate,
  createImagePathDouble,
  createInMemoryOptionRepository,
  createInMemoryProductRepository,
  createInMemorySkuRepository,
  createPopulationAuthorizationDouble,
  createProductTypeRootResolverDouble,
  createSettingResolverDouble,
  createSkusBySelectedOptionsLookup,
  createSmartListQueryDouble,
  createSubscriptionTermDouble,
  createTransactionExistenceChecker,
  createUniquePropertyDouble,
  createUnitOfWorkDouble,
  createUrlTitleAvailabilityDouble,
  createValidatorHarness,
  type SettingSeed,
  type SmartListOutcome,
  type SmartListResponder,
  type UrlTitleTableName,
} from '../support/inMemoryRepositories';
import { populate } from '../../src/domain/base/populate';
import type { PropertyDescriptorSet, RelatedEntityLoader } from '../../src/domain/base/populate';
import {
  createProductPropertyDescriptors,
  Product,
  PRODUCT_PROPERTY_DESCRIPTORS,
  type ProductPropertyName,
  type ProductTransactionExistenceChecker,
} from '../../src/domain/product/Product';
import { ProductType } from '../../src/domain/product/ProductType';
import { Sku } from '../../src/domain/sku/Sku';
import { ValidationError } from '../../src/errors/ValidationError';
import { BaseService } from '../../src/services/BaseService';
// `OptionService` is imported as a TRANSITIVE CONSTRUCTOR REQUIREMENT, not as a subject under test.
// `SkuService`'s second constructor parameter is typed `OptionService` (`src/services/SkuService.ts`
// declaration), and `ProductServiceCollaborators.optionService` is typed the same way, so a real
// `ProductService` cannot be constructed without a real instance. The alternatives were all forbidden:
// a cast, a locally duplicated interface standing in for a class that already exists, or abandoning the
// real service the AAP requires these regressions to drive. No regression below CALLS it — it is wired
// because explicit constructor injection means every collaborator must be supplied, which is precisely
// the property that replaced DI/1's runtime property injection.
import { OptionService } from '../../src/services/OptionService';
import {
  ProductService,
  type ProductProcessValidator,
  type ProductServiceCollaborators,
  type ProductTypeWithErrorState,
} from '../../src/services/ProductService';
import { SkuService } from '../../src/services/SkuService';
import type { SmartListQuery } from '../../src/ports/SmartListQueryPort';
import type { UniquePropertyPort } from '../../src/ports/UniquePropertyPort';
import type { SkuRepository } from '../../src/ports/repositories/SkuRepository';
import { Validator } from '../../src/validation/Validator';
import type {
  ProcessValidationRequest,
  ProcessValidationResult,
  ValidateOptions,
  ValidationContext,
  ValidationRuleSet,
  ValidationSubject,
} from '../../src/validation/Validator';
import {
  productValidationRuleSet,
  transactionExistsFlagEqualityConstraint,
} from '../../src/validation/rules/product.rules';
import type { ProductValidationSubject } from '../../src/validation/rules/product.rules';
import {
  createSkuValidationRules,
  resolveSkuUniqueTarget,
} from '../../src/validation/rules/sku.rules';

/* ==================================================================================================
 * LOCAL HELPERS
 *
 * Deliberately narrow and specific to the eight regressions below. This file does NOT build a
 * reusable harness framework: the shared doubles already live in `test/support/inMemoryRepositories`,
 * and anything general enough to be reused belongs there rather than here.
 *
 * There is no mocking library anywhere in this subtree and none is added. `jest.fn` is likewise
 * avoided in favour of plain recording objects and counters, so what each double records is visible
 * in the assertion rather than hidden behind matcher state — and so `clearMocks`/`restoreMocks` in
 * jest.config.ts have nothing of ours to reset.
 * ================================================================================================ */

/**
 * Narrow an indexed read under `noUncheckedIndexedAccess`.
 *
 * Every indexed access in this file goes through here rather than through a non-null assertion. The
 * flag exists to surface exactly this hazard, so suppressing it with `!` would discard the signal the
 * configuration is there to produce. Mirrors the same helper in the sibling suites.
 */
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
 * A `ProductValidationSubject` view over a live `Product`, plus the values the rules read that the
 * entity cannot answer synchronously.
 *
 * `ProductService` builds an equivalent view internally, but that function is private to the module,
 * so this is a local mirror of its shape rather than a duplicated port or domain type. The mirror is
 * faithful in the one respect that matters to these tests:
 *
 * ⛔ `physicalCounts` IS OMITTED, and the omission is the point. `model/validation/Product.json:L7`
 * declares a delete guard on `physicalCounts`, but NO entity in the slice declares such a property —
 * `model/entity/Product.cfc:L90` declares `physicals`, and `physicalCounts` is declared only by the
 * EXCLUDED `model/entity/Physical.cfc:L59`. `hasProperty('physicalCounts')` therefore answers false
 * and `org/Hibachi/HibachiValidationService.cfc:L171` skips the rule. Adding the field, or pointing
 * the rule at `physicals`, would invent a guard the legacy application does not enforce.
 */
interface ProductDerivedValues {
  readonly baseProductType?: string;
  readonly unusedProductOptions?: readonly unknown[];
  readonly unusedProductOptionGroups?: readonly unknown[];
  readonly unusedProductSubscriptionTerms?: readonly unknown[];
}

function productSubject(
  product: Product,
  derived: ProductDerivedValues = {},
): ProductValidationSubject {
  // `price` is read the way `ProductService.saveProduct` reads it — through `getPrice()`, which falls
  // back to the default SKU — rather than being passed in, so the helper cannot drift from the service.
  const price = product.getPrice();
  return {
    getClassName: () => product.getClassName(),
    hasProperty: (propertyIdentifier: string) => product.hasProperty(propertyIdentifier),
    getPropertyMetaData: (propertyName: string) => product.getPropertyMetaData(propertyName),
    getEntityName: () => product.getEntityName(),
    getPrimaryIDValue: () => product.getPrimaryIDValue(),
    getPrimaryIDPropertyName: () => product.getPrimaryIDPropertyName(),
    getValueByPropertyIdentifier: (propertyIdentifier: string) =>
      product.getValueByPropertyIdentifier(propertyIdentifier),
    productType: product.productType,
    ...(derived.baseProductType === undefined ? {} : { baseProductType: derived.baseProductType }),
    ...(price === undefined ? {} : { price }),
    ...(product.productName === undefined ? {} : { productName: product.productName }),
    ...(product.productCode === undefined ? {} : { productCode: product.productCode }),
    ...(product.urlTitle === undefined ? {} : { urlTitle: product.urlTitle }),
    ...(product.transactionExistsFlag === undefined
      ? {}
      : { transactionExistsFlag: product.transactionExistsFlag }),
    ...(derived.unusedProductOptions === undefined
      ? {}
      : { unusedProductOptions: derived.unusedProductOptions }),
    ...(derived.unusedProductOptionGroups === undefined
      ? {}
      : { unusedProductOptionGroups: derived.unusedProductOptionGroups }),
    ...(derived.unusedProductSubscriptionTerms === undefined
      ? {}
      : { unusedProductSubscriptionTerms: derived.unusedProductSubscriptionTerms }),
  };
}

/**
 * A product-type catalog standing in for the many-to-one population boundary.
 *
 * `populate` resolves a nested many-to-one struct through a `RelatedEntityLoader`. When the struct
 * carries EXACTLY ONE key — the related primary id, which is precisely the shape
 * `meta/tests/unit/IssuesTest.cfc:L57-L59` uses — it takes the `loadExisting` path, so that is the
 * path `issue_1097` exercises. `loadOrCreate` is supplied because the descriptor requires it, and it
 * refuses rather than fabricating a row, since no test below should reach it.
 */
interface ProductTypeCatalog {
  readonly loader: RelatedEntityLoader<ProductType>;
  readonly loadExistingIds: readonly string[];
}

function createProductTypeCatalog(productTypes: readonly ProductType[]): ProductTypeCatalog {
  const loadExistingIds: string[] = [];
  return {
    loadExistingIds,
    loader: {
      loadExisting: (relatedId: string): ProductType | undefined => {
        loadExistingIds.push(relatedId);
        return productTypes.find((candidate) => candidate.productTypeID === relatedId);
      },
      loadOrCreate: (relatedId: string): ProductType => {
        const existing = productTypes.find((candidate) => candidate.productTypeID === relatedId);
        if (existing === undefined) {
          throw new Error(
            `The population boundary was asked to CREATE product type "${relatedId}". No regression ` +
              'in this file populates a multi-key product-type struct, so this is a wiring mistake.',
          );
        }
        return existing;
      },
    },
  };
}

/**
 * A validator that records nothing and rejects nothing.
 *
 * Used only where the legacy code performed NO validation at all, so that the ported call can be
 * driven with the legacy data shape unchanged. `issue_1097` is the case: `IssuesTest.cfc:L64` and
 * `:L68` call the raw ORM functions `entitySave`/`entityDelete`, which do not run the declarative
 * rule sets, which is exactly why a two-field product is savable there. Substituting a permissive
 * validator on the SAVE path is therefore the faithful translation — and it is done through the real
 * `ProductServiceCollaborators.validator` seam, not by weakening a rule set or padding the source
 * data with fields the legacy test never supplied.
 *
 * The DELETE path keeps the real `Validator` and the real `productValidationRuleSet`, because the
 * delete guards are behaviour that regression asserts.
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

/**
 * A one-property rule set that reads its flag as `unknown`, so the delete guard can be fed the
 * false-like values CFML accepts.
 *
 * `model/validation/Product.json:L11` and `model/validation/Sku.json:L13` both declare the guard as
 * `eq false`, and CFML's `eq` is a LOOSE comparison: `'false'`, `0`, `'0'` and `'no'` are all equal to
 * `false`. The target preserves that in the engine — `Validator` coerces both sides before comparing —
 * but `ProductValidationSubject` narrows its own `transactionExistsFlag` slot to `boolean`, so a
 * false-like string cannot be routed through that subject type without a cast, and a cast is not
 * permitted here.
 *
 * The resolution reuses the REAL exported constraint object rather than restating it, and pairs it
 * with a subject whose slot is `unknown`. What is asserted is therefore the engine's comparison
 * semantics — which is exactly where the looseness lives — with no rule weakened and no type widened.
 */
interface LooseFalseGuardSubject extends ValidationSubject {
  readonly transactionExistsFlag?: unknown;
}

const looseFalseGuardRuleSet: ValidationRuleSet<LooseFalseGuardSubject> = {
  properties: [
    {
      propertyIdentifier: 'transactionExistsFlag',
      read: (subject: LooseFalseGuardSubject): unknown => subject.transactionExistsFlag,
      rules: [
        {
          contexts: 'delete',
          constraints: [transactionExistsFlagEqualityConstraint],
        },
      ],
    },
  ],
};

function looseFalseGuardSubject(transactionExistsFlag: unknown): LooseFalseGuardSubject {
  return {
    getClassName: (): string => 'Product',
    hasProperty: (propertyIdentifier: string): boolean =>
      propertyIdentifier === 'transactionExistsFlag',
    transactionExistsFlag,
  };
}

/* --------------------------------------------------------------------------------------------------
 * Ordering evidence
 *
 * `issue_1690` asserts an ORDER, not just a set of calls, so validation and persistence must write
 * into ONE log. A plain array plus two thin wrappers gives that, and keeps the evidence readable in
 * the assertion. Both wrappers delegate to the real collaborator, so nothing is stubbed away.
 * ------------------------------------------------------------------------------------------------ */
/**
 * The `Sku` save rule set, built the way production builds it.
 *
 * Both method rules from `model/validation/Sku.json:L5-L8` are bound to real domain FUNCTIONS rather
 * than resolved from method-name strings, and `hasUniqueOptions` needs a live lookup because it runs a
 * query. Binding that lookup to the repository under test is what makes the M6 same-transaction
 * sequence observable: the rule reads whatever the repository holds at the moment it is evaluated.
 */
function buildSkuSaveRuleSet(repository: SkuRepository, productID: string): ValidationRuleSet<Sku> {
  return createSkuValidationRules<Sku>(
    (subject) => resolveSkuUniqueTarget(subject),
    createSkusBySelectedOptionsLookup(repository, productID),
  );
}

/** The three tables that declare a `urlTitle` column, per `model/validation/*.json` uniqueness. */
const URL_TITLE_TABLES: readonly UrlTitleTableName[] = ['SwProduct', 'SwProductType', 'SwBrand'];

type HarnessEvent =
  | { readonly kind: 'validate'; readonly className: string; readonly context: ValidationContext }
  | { readonly kind: 'validateProcess'; readonly className: string }
  | { readonly kind: 'persist'; readonly productID: string }
  | { readonly kind: 'remove'; readonly productID: string };

class OrderRecordingValidator extends Validator {
  private readonly log: HarnessEvent[];

  public constructor(uniqueProperty: UniquePropertyPort, log: HarnessEvent[]) {
    super(uniqueProperty);
    this.log = log;
  }

  public override validate<TSubject extends ValidationSubject>(
    subject: TSubject,
    ruleSet: ValidationRuleSet<TSubject>,
    context: ValidationContext,
    options?: ValidateOptions,
  ): Promise<ValidationError> {
    this.log.push(
      Object.freeze({ kind: 'validate', className: subject.getClassName(), context } as const),
    );
    return super.validate(subject, ruleSet, context, options);
  }

  public override validateProcess<
    TEntity extends ValidationSubject,
    TProcessObject extends ValidationSubject,
  >(request: ProcessValidationRequest<TEntity, TProcessObject>): Promise<ProcessValidationResult> {
    this.log.push(
      Object.freeze({
        kind: 'validateProcess',
        className: request.entity.getClassName(),
      } as const),
    );
    return super.validateProcess(request);
  }
}

/* --------------------------------------------------------------------------------------------------
 * The harness
 *
 * One fresh graph per call — there is no module-scoped cache, no shared singleton and no `beforeEach`
 * mutation of outer state, which is how M7 is honoured: memoized values such as
 * `Product.transactionExistsFlag` and the SKU repository's option-group sort-order memo are born and
 * die with the harness, exactly as they would be born and die with one Lambda invocation.
 *
 * Only the collaborators these eight regressions actually reach are given behaviour. Every one of the
 * nineteen constructor members is still supplied, because `ProductServiceCollaborators` requires them
 * and constructor injection is the whole point of the port — but none of the five measured-zero dead
 * injections is reintroduced, because none of them is a member of that interface in the first place.
 * ------------------------------------------------------------------------------------------------ */
interface HarnessOptions {
  /** SKUs already in the repository, used to seed the option-bearing peer for the D19 scenario. */
  readonly repositorySkus?: readonly Sku[];
  /** Product ids that a transaction already references, driving the per-product delete guard. */
  readonly transactionProductIDs?: readonly string[];
  /** Product types the population boundary may resolve a nested one-key struct against. */
  readonly productTypes?: readonly ProductType[];
  /**
   * Settings the slice reads. Nothing is defaulted: the double refuses an unseeded key because the
   * effective-value engine lives in the out-of-scope setting service, so every key a regression needs
   * is seeded with the literal default declared at its `model/service/SettingService.cfc` locator.
   */
  readonly settings?: readonly SettingSeed[];
  /** Answers the SmartList port per query, so paging can be honoured rather than replayed. */
  readonly smartListRespond?: SmartListResponder;
  /** A fixed queue of SmartList answers, shifted one per execution. */
  readonly smartListOutcomes?: readonly SmartListOutcome[];
  /**
   * `'permissive'` mirrors the raw `entitySave`/`entityDelete` of `IssuesTest.cfc:L64`/`:L68`, which
   * ran no declarative rules. `'real'` is the default and runs `productValidationRuleSet`.
   */
  readonly saveValidation?: 'real' | 'permissive';
}

interface Harness {
  readonly service: ProductService;
  /**
   * The SAME validator instance the service and base service were constructed with, so a caller-side
   * N3 flow can be driven through the real seam rather than a parallel one.
   */
  readonly validator: Validator;
  /** The SAME persistence seam the service was constructed with. */
  readonly persistProduct: (product: Product) => Promise<Product>;
  /** Validate/persist/remove in the order they happened — the N3 evidence. */
  readonly log: readonly HarnessEvent[];
  readonly persistedProducts: readonly Product[];
  readonly removedProducts: readonly Product[];
  readonly smartListQueries: readonly SmartListQuery[];
  readonly productTypeCatalog: ProductTypeCatalog;
  /** One entry per transaction-existence probe, recording the argument order it was called with. */
  readonly transactionChecks: readonly string[];
  readonly productPropertyDescriptors: PropertyDescriptorSet<Product, ProductPropertyName>;
}

function buildHarness(options: HarnessOptions = {}): Harness {
  const log: HarnessEvent[] = [];

  const skuRepository = createInMemorySkuRepository({
    skus: options.repositorySkus ?? [],
    transactionProductIDs: options.transactionProductIDs ?? [],
  });
  const productRepository = createInMemoryProductRepository({});
  const optionRepository = createInMemoryOptionRepository({});

  const smartList = createSmartListQueryDouble({
    ...(options.smartListRespond === undefined ? {} : { respond: options.smartListRespond }),
    ...(options.smartListOutcomes === undefined ? {} : { outcomes: options.smartListOutcomes }),
  });
  const optionSmartList = createSmartListQueryDouble({});

  const settings = createSettingResolverDouble({ settings: options.settings ?? [] });
  const urlTitles = createUrlTitleAvailabilityDouble();
  const populationAuthorization = createPopulationAuthorizationDouble();
  const uniqueProperty = createUniquePropertyDouble();
  const validator = new OrderRecordingValidator(uniqueProperty.uniqueProperty, log);
  const persistence = createBaseServicePersistenceDouble<Product>();
  const productTypeRoots = createProductTypeRootResolverDouble();
  const subscriptionTerms = createSubscriptionTermDouble({ subscriptionTermIDs: [] });
  const accessContents = createAccessContentDouble();
  const imagePaths = createImagePathDouble();
  const accountContext = createAccountContextDouble();

  // The G6 chain, recorded end to end. `Product.getTransactionExistsFlag` supplies the product id in
  // the SECOND slot and leaves the sku id absent, which is how `model/entity/Product.cfc:L626` passes
  // `productID=` BY NAME; `model/service/SkuService.cfc:L286` forwards it untouched, and
  // `model/dao/SkuDAO.cfc:L62` filters on it. Recording the pair is what lets the assertion prove the
  // guard is scoped to ONE product.
  const baseTransactionChecker = createTransactionExistenceChecker(skuRepository.repository);
  const transactionChecks: string[] = [];
  const transactionChecker: ProductTransactionExistenceChecker = {
    argumentOrder: 'skuID-first-productID-second',
    getTransactionExistsFlag: (skuID?: string, productID?: string): Promise<boolean> => {
      transactionChecks.push(`skuID=${skuID ?? ''}|productID=${productID ?? ''}`);
      return baseTransactionChecker.getTransactionExistsFlag(skuID, productID);
    },
  };

  const productTypeCatalog = createProductTypeCatalog(options.productTypes ?? []);
  const productPropertyDescriptors = createProductPropertyDescriptors({
    productType: {
      loader: productTypeCatalog.loader,
      populate: (target: ProductType, data: Record<string, unknown>): void => {
        throw new Error(
          'The product-type population boundary was asked to populate ' +
            `"${target.productTypeID}" from ${Object.keys(data).length} key(s). No regression here ` +
            'supplies a multi-key product-type struct, so this is a wiring mistake.',
        );
      },
    },
  });

  const productBaseService = new BaseService<Product, ProductPropertyName>({
    validator,
    ruleSet: productValidationRuleSet,
    propertyDescriptors: productPropertyDescriptors,
    populationAuthorization: populationAuthorization.populationAuthorization,
    persist: persistence.seams.persist,
    remove: async (entity: Product): Promise<void> => {
      log.push(Object.freeze({ kind: 'remove', productID: entity.productID } as const));
      await persistence.seams.remove(entity);
    },
    settingCleanup: persistence.seams.settingCleanup,
    commentCleanup: persistence.seams.commentCleanup,
    resolveDeleteSubject: async (candidate: Product): Promise<Product> => {
      await candidate.getTransactionExistsFlag(transactionChecker);
      return candidate;
    },
  });

  const productTypeBaseService = {
    save: (entity: ProductTypeWithErrorState): Promise<ProductTypeWithErrorState> =>
      Promise.resolve(entity),
  };

  const optionService = new OptionService(optionRepository.repository, optionSmartList.smartList);
  const skuService = new SkuService(
    skuRepository.repository,
    optionService,
    subscriptionTerms.subscriptionTerms,
    accessContents.accessContents,
    imagePaths.imagePaths,
    smartList.smartList,
    validator,
    productTypeRoots.resolver,
    (sku: Sku) => createDefaultSkuDelegate(sku),
  );

  const persistedProducts: Product[] = [];
  const persistProduct = (product: Product): Promise<Product> => {
    log.push(Object.freeze({ kind: 'persist', productID: product.productID } as const));
    persistedProducts.push(product);
    return Promise.resolve(product);
  };
  const collaborators: ProductServiceCollaborators = {
    productRepository: productRepository.repository,
    skuRepository: skuRepository.repository,
    skuService,
    optionService,
    baseService: productBaseService,
    productTypeBaseService,
    validator: options.saveValidation === 'permissive' ? createPermissiveValidator() : validator,
    settings: settings.resolver,
    accountContext: accountContext.accountContext,
    smartListQueryPort: smartList.smartList,
    subscriptionTermPort: subscriptionTerms.subscriptionTerms,
    productTypeRootResolver: productTypeRoots.resolver,
    productPropertyDescriptors,
    populationAuthorization: populationAuthorization.populationAuthorization,
    // `UniqueValueProbe` takes a plain string; the double narrows to the three tables that actually
    // carry a urlTitle column. `find` performs the narrowing without a cast, and an unknown table is
    // refused rather than silently answered, so a mis-wiring surfaces as a failure.
    isUrlTitleAvailable: (tableName: string, value: string): Promise<boolean> => {
      const known = URL_TITLE_TABLES.find((candidate) => candidate === tableName);
      if (known === undefined) {
        return Promise.reject(
          new Error(`A URL title was probed against the unexpected table "${tableName}".`),
        );
      }
      return urlTitles.probe.isUrlTitleAvailable(known, value);
    },
    persistProduct,
    defaultSkuIdReader: (): string => '',
  };

  return {
    service: new ProductService(collaborators),
    validator,
    persistProduct,
    log,
    persistedProducts,
    removedProducts: persistence.removed,
    smartListQueries: smartList.queries,
    productTypeCatalog,
    transactionChecks,
    productPropertyDescriptors,
  };
}

/** `model/service/SettingService.cfc:L193` — the declared default, carried verbatim. */
const PRODUCT_TITLE_STRING_SETTING: SettingSeed = {
  settingName: 'productTitleString',
  value: '${brand.brandName} ${productName}',
};

describe('meta/tests/unit/IssuesTest.cfc — catalog issue regressions', () => {
  /*
   * TRACEABLE — meta/tests/unit/IssuesTest.cfc:L51-L71 — AAP-named regression.
   *
   * Legacy shape, read from source rather than recalled:
   *   :L53  var product = entityNew("SlatwallProduct");
   *   :L55  productData = {                      <-- UNSCOPED (D17)
   *   :L56    productName = "My Product",
   *   :L57-59 productType = { productTypeID = <merchandise discriminator> }
   *   :L60  product.populate(productData);
   *   :L64  entitySave(product);
   *   :L66  ormFlush();
   *   :L68  entityDelete(product);
   *   :L70  ormFlush();
   *
   * TWO honest differences, stated rather than smoothed over:
   *
   * 1. The legacy test used the RAW ORM functions `entitySave`/`entityDelete`. Those run no service
   *    logic and no declarative rule set, which is exactly why a two-field product is savable there.
   *    The AAP requires the round trip to be driven through the real `ProductService` contract, so the
   *    save path is given a permissive validator through the REAL
   *    `ProductServiceCollaborators.validator` seam — no rule set is weakened, and the source data
   *    shape is carried across untouched. The DELETE path keeps the real `Validator` and the real
   *    `productValidationRuleSet`, because the delete guards are behaviour this regression asserts.
   *
   * 2. The product carries an identifier. `entityDelete` at :L68 acts on the product that :L64-:L66
   *    already saved and flushed, so it is identified by then. Routing an UNidentified product through
   *    `saveProduct` would additionally enter the new-product branch and run `SkuService.createSkus`,
   *    which raw `entitySave` never did — a consequence of using the service, not a property of issue
   *    1097. Keeping the product identified holds the regression on its actual subject.
   */
  it('issue_1097', async () => {
    const subjectProductID = 'issue-1097-subject';
    const otherProductID = 'issue-1097-other';
    const merchandiseProductType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: 'Merchandise',
      systemCode: 'merchandise',
    });
    const harness = buildHarness({
      productTypes: [merchandiseProductType],
      settings: [PRODUCT_TITLE_STRING_SETTING],
      saveValidation: 'permissive',
      transactionProductIDs: [otherProductID],
    });

    // :L55-:L59, carried field for field. No price, productCode or urlTitle is added: the legacy test
    // supplied exactly these two keys, and padding them would change what is being regressed.
    //
    // TODO(parity) D17 — `IssuesTest.cfc:L55` reads `productData = {` with no `var`, so the struct
    // leaks into the component's shared variables scope; `meta/tests/unit/Helper.cfc:L53` repeats it.
    // TypeScript block scoping removes the hazard by construction, so there is nothing to carry into
    // the runtime behaviour here. The canonical annotation, including the locator correction against
    // the defect register, already lives in `test/fixtures/testProduct.ts` and is not restated.
    const productData: Record<string, unknown> = {
      productName: 'My Product',
      productType: { productTypeID: MERCHANDISE_PRODUCT_TYPE_ID },
    };

    const authorization = createPopulationAuthorizationDouble();

    // The population boundary is real and injected, not ambient. `PRODUCT_PROPERTY_DESCRIPTORS` — the
    // default set — declares NO productType collaborator, so `createProductPropertyDescriptors`
    // emits no many-to-one descriptor for it and the nested struct is never visited. Asserting that
    // first proves the collaborator is what does the work.
    const withoutCollaborator = populate(
      new Product(),
      productData,
      PRODUCT_PROPERTY_DESCRIPTORS,
      authorization.populationAuthorization,
    );
    expect(withoutCollaborator.productName).toBe('My Product');
    expect(withoutCollaborator.productType).toBeUndefined();

    // :L60 — `product.populate(productData)`. `Product` exposes no `populate` method: the framework
    // facility at `model/entity/HibachiEntity.cfc:L56` became the free `populate(...)` helper plus an
    // explicit descriptor set, so the call site names both.
    const product = new Product();
    product.productID = subjectProductID;
    const populated = populate(
      product,
      productData,
      harness.productPropertyDescriptors,
      authorization.populationAuthorization,
    );
    expect(populated).toBe(product);
    expect(product.productName).toBe('My Product');
    expect(product.productType).toBe(merchandiseProductType);
    // ONE key in the struct, so `populate` takes the `loadExisting` path rather than `loadOrCreate`.
    expect(harness.productTypeCatalog.loadExistingIds).toStrictEqual([MERCHANDISE_PRODUCT_TYPE_ID]);

    // :L64-:L66 — save, then flush. M5: `SlatwallUnitTestBase.cfc:L53` and `:L70` are BOTH commented
    // out, so no request-end lifecycle ran and the legacy test had to flush by hand. Each manual
    // `ormFlush()` therefore becomes one explicit `UnitOfWork` boundary, committed only when the
    // entity carries no errors — the translation of the `getORMHasErrors()` gate.
    const saveWork = createUnitOfWorkDouble();
    const saved = await saveWork.unitOfWork.run(
      () => harness.service.saveProduct(product, productData),
      () => product.hasErrors(),
    );
    expect(saved).toBe(product);
    expect(product.hasErrors()).toBe(false);
    expect(harness.persistedProducts).toStrictEqual([product]);
    expect(saveWork.transactionsStarted()).toBe(1);
    expect(saveWork.transactionsCommitted()).toBe(1);
    expect(saveWork.transactionsRolledBack()).toBe(0);

    // The inert delete guard. `model/validation/Product.json:L7` declares `physicalCounts` with
    // `maxCollection: 0` for the delete context, but NO entity in the slice declares that property —
    // `model/entity/Product.cfc:L90` declares `physicals`, and `physicalCounts` belongs to the
    // EXCLUDED `model/entity/Physical.cfc:L59`. `hasProperty` answers false, so
    // `org/Hibachi/HibachiValidationService.cfc:L171` skips the rule and the delete is not blocked by
    // it. No physical-count collaborator is constructed anywhere in this file, and none is consulted.
    expect(product.hasProperty('physicalCounts')).toBe(false);
    expect(product.hasProperty('physicals')).toBe(true);

    // :L68-:L70 — delete, then flush, in its own boundary.
    const deleteWork = createUnitOfWorkDouble();
    const deleted = await deleteWork.unitOfWork.run(
      () => harness.service.deleteProduct(product),
      () => product.hasErrors(),
    );
    expect(deleted).toBe(true);
    expect(harness.removedProducts).toStrictEqual([product]);
    expect(deleteWork.transactionsStarted()).toBe(1);
    expect(deleteWork.transactionsCommitted()).toBe(1);

    // G6 — the transaction delete guard is scoped to ONE product, not to the whole table.
    // `model/entity/Product.cfc:L626` passes `productID=` BY NAME to
    // `model/service/SkuService.cfc:L285-L287`, which forwards it untouched with
    // `argumentCollection=arguments`, and `model/dao/SkuDAO.cfc:L53-L98` filters the existence chain on
    // `ss.product.productID = :productID` in its `<cfelse>` branch. This intentionally CORRECTS the
    // stale global reading recorded as AAP discrepancy 4: a transaction against another product
    // cannot make this one undeletable. The recorded probe also shows the argument order — sku id
    // absent, product id second — which is what `ProductTransactionExistenceChecker.argumentOrder`
    // declares.
    expect(harness.transactionChecks).toStrictEqual([`skuID=|productID=${subjectProductID}`]);
    const otherProduct = buildProduct({ productID: otherProductID });
    const otherDeleted = await harness.service.deleteProduct(otherProduct);
    expect(otherDeleted).toBe(false);
    expect(harness.removedProducts).toStrictEqual([product]);
    expect(harness.transactionChecks).toStrictEqual([
      `skuID=|productID=${subjectProductID}`,
      `skuID=|productID=${otherProductID}`,
    ]);
    expect(otherProduct.getError('transactionExistsFlag')).toStrictEqual([]);

    // The guard's comparison is CFML-loose, and that looseness is the engine's. Every false-like
    // value CFML accepts satisfies `eq false`; every true-like value fails it; and an ABSENT flag
    // fails rather than being coalesced to false.
    const guard = createValidatorHarness();
    const falseLike: readonly unknown[] = [false, 'false', 0, '0', 'no'];
    for (const value of falseLike) {
      const bag = await guard.validateDryRun(
        looseFalseGuardSubject(value),
        looseFalseGuardRuleSet,
        'delete',
      );
      expect(bag.getError('transactionExistsFlag')).toStrictEqual([]);
    }
    const trueLike: readonly unknown[] = [true, 'true', 1, '1', 'yes'];
    for (const value of trueLike) {
      const bag = await guard.validateDryRun(
        looseFalseGuardSubject(value),
        looseFalseGuardRuleSet,
        'delete',
      );
      expect(bag.getError('transactionExistsFlag')).toStrictEqual([
        'validate.delete.Product.transactionExistsFlag.eq',
      ]);
    }
    const absent = await guard.validateDryRun(
      looseFalseGuardSubject(undefined),
      looseFalseGuardRuleSet,
      'delete',
    );
    expect(absent.getError('transactionExistsFlag')).toStrictEqual([
      'validate.delete.Product.transactionExistsFlag.eq',
    ]);

    // M7 — nothing survives the invocation. A second harness is a second simulated invocation: its
    // log, its probe record, its persistence record and its population record are all empty, and a
    // freshly built product carries no memoized `transactionExistsFlag` from the first invocation, so
    // the guard is asked again rather than answered from warm state.
    const secondInvocation = buildHarness({
      productTypes: [merchandiseProductType],
      settings: [PRODUCT_TITLE_STRING_SETTING],
      saveValidation: 'permissive',
      transactionProductIDs: [otherProductID],
    });
    expect(secondInvocation.log).toStrictEqual([]);
    expect(secondInvocation.transactionChecks).toStrictEqual([]);
    expect(secondInvocation.persistedProducts).toStrictEqual([]);
    expect(secondInvocation.removedProducts).toStrictEqual([]);
    expect(secondInvocation.productTypeCatalog.loadExistingIds).toStrictEqual([]);
    const freshProduct = buildProduct({ productID: subjectProductID });
    expect(freshProduct.transactionExistsFlag).toBeUndefined();
    expect(await secondInvocation.service.deleteProduct(freshProduct)).toBe(true);
    expect(secondInvocation.transactionChecks).toStrictEqual([
      `skuID=|productID=${subjectProductID}`,
    ]);
  });

  /*
   * TRACEABLE — meta/tests/unit/IssuesTest.cfc:L73-L89 — AAP-named regression.
   *
   * Legacy shape:
   *   :L75  smartList = getService("productService").getProductSmartList();
   *   :L77  if(smartList.getRecordsCount() >= 2) {        <-- conditional; skipped on an empty DB
   *   :L79    smartList.setPageRecordsShow(1);
   *   :L80    productOne = smartList.getPageRecords(true)[1];
   *   :L82    smartList.setCurrentPageDeclaration(2);      <-- NUMERIC in CFML
   *   :L83    productTwo = smartList.getPageRecords(true)[1];
   *   :L85    assert(productOne.getProductID() neq productTwo.getProductID());
   *
   * TWO translation decisions, both deliberate:
   *
   * 1. The legacy guard at :L77 made the assertion conditional, so on a database with fewer than two
   *    products the regression silently asserted NOTHING. The target does not carry that guard: the
   *    recording double supplies the records, so the assertion always runs. Carrying a skip that only
   *    existed because the fixture was unreliable would carry the unreliability, not the behaviour.
   *
   * 2. `setCurrentPageDeclaration(2)` passes a NUMBER. The target's `SmartListPagination` declares
   *    `currentPageDeclaration?: string`, and `translateSmartListInput` normalises through `String(...)`,
   *    so the page is declared here in the strict string form the port actually carries.
   */
  it('issue_1296', async () => {
    const productOneID = 'issue-1296-one';
    const productTwoID = 'issue-1296-two';
    const catalogue: readonly Product[] = [
      buildProduct({ productID: productOneID, productName: 'First Product' }),
      buildProduct({ productID: productTwoID, productName: 'Second Product' }),
    ];

    // One record per page, and the page window is recomputed from the query on every execution. That
    // is the point: nothing is pre-fetched and nothing is replayed, so if the service handed back a
    // cached first page the second call would return the same record and the assertion would fail.
    const respond: SmartListResponder = (query): SmartListOutcome => {
      const show = query.pagination?.pageRecordsShow ?? catalogue.length;
      const declaredPage = Number(query.pagination?.currentPageDeclaration ?? '1');
      const start = (declaredPage - 1) * show;
      const window: Product[] = [];
      for (let index = start; index < start + show && index < catalogue.length; index += 1) {
        const record = catalogue[index];
        if (record !== undefined) {
          window.push(record);
        }
      }
      return {
        kind: 'page',
        metrics: {
          recordsCount: catalogue.length,
          pageRecordsStart: start + 1,
          pageRecordsEnd: start + window.length,
          currentPage: declaredPage,
          totalPages: Math.ceil(catalogue.length / show),
        },
        records: catalogue,
        pageRecords: window,
      };
    };

    const harness = buildHarness({ smartListRespond: respond });

    // :L75-:L79 — `currentURL` stays optional and string-typed, which is AAP discrepancy 1: the legacy
    // declares it with NO type at all (`currentURL=""`).
    const pageOne = await harness.service.getProductSmartList({ 'P:Show': 1 }, '');
    expect(pageOne.recordsCount).toBe(2);
    expect(pageOne.pageRecords).toHaveLength(1);
    const firstPageProduct = requireAt(pageOne.pageRecords, 0);

    // :L82-:L83 — page two of the same one-record window.
    const pageTwo = await harness.service.getProductSmartList(
      { 'P:Show': 1, 'P:Current': '2' },
      '',
    );
    expect(pageTwo.currentPage).toBe(2);
    expect(pageTwo.pageRecords).toHaveLength(1);
    const secondPageProduct = requireAt(pageTwo.pageRecords, 0);

    // :L85 — the regression itself: consecutive single-record pages must not hand back the same row.
    expect(firstPageProduct.productID).not.toBe(secondPageProduct.productID);
    expect(firstPageProduct.productID).toBe(productOneID);
    expect(secondPageProduct.productID).toBe(productTwoID);

    // Distinctness matters precisely BECAUSE the product smart list joins. The emitted query carries
    // three related-property joins — productType, defaultSku, and brand as a LEFT join — and a left
    // join is exactly what fans a single product row out into several. Asserting the joins are present
    // records why the page window has to be de-duplicated rather than merely paginated.
    expect(harness.smartListQueries).toHaveLength(2);
    const emitted = requireAt(harness.smartListQueries, 0);
    expect(emitted.entityName).toBe('SlatwallProduct');
    expect(emitted.joins).toStrictEqual([
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'productType' },
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'defaultSku' },
      { parentEntityName: 'SlatwallProduct', relatedProperty: 'brand', joinType: 'left' },
    ]);
    expect(emitted.pagination).toStrictEqual({ pageRecordsShow: 1 });
    expect(requireAt(harness.smartListQueries, 1).pagination).toStrictEqual({
      pageRecordsShow: 1,
      currentPageDeclaration: '2',
    });
  });

  /*
   * TRACEABLE — meta/tests/unit/IssuesTest.cfc:L91-L99 — AAP-named regression.
   *
   * Legacy shape:
   *   :L93  smartList = getService("productService").getProductSmartList();
   *   :L95  smartList.addRange('calculatedQATS', 'XXX^');
   *   :L97  smartList.getPageRecords();
   *   ...and NO assertion at all. The legacy test asserts nothing, so the regression is that the call
   *   COMPLETES: a non-numeric, non-date range bound must not blow up the query.
   *
   * The target reproduces that literally, and nothing is invented on top of it: no record-value
   * assertion is added, because the legacy test made none.
   *
   * `calculatedQATS` is a PERSISTED `SwProduct` column and is therefore a legal SmartList property
   * identifier. The excluded non-persistent `qats` member is never named or read — the boundary in
   * AAP section 0.2.2.6 holds.
   */
  it('issue_1329', async () => {
    const harness = buildHarness({
      smartListOutcomes: [{ kind: 'page', metrics: {} }],
    });

    // :L95-:L97 — must resolve, not reject.
    await expect(
      harness.service.getProductSmartList({ 'R:calculatedQATS': 'XXX^' }, ''),
    ).resolves.toBeDefined();

    // The mechanism, recorded rather than guessed: `XXX^` declares an upper delimiter with a lower
    // bound of `XXX`, which reads as neither numeric nor a date, so the range is DROPPED during
    // translation instead of being emitted or thrown. With no filters, like-filters, in-filters or
    // ranges surviving, the composed query carries no where group at all.
    expect(harness.smartListQueries).toHaveLength(1);
    const emitted = requireAt(harness.smartListQueries, 0);
    expect(emitted.whereGroups).toBeUndefined();

    // No SQL, no HQL, no adapter and no database took part: the only boundary crossed is the port.
    expect(emitted.entityName).toBe('SlatwallProduct');
  });

  /*
   * TRACEABLE — meta/tests/unit/IssuesTest.cfc:L101-L108 — AAP-named regression.
   *
   * Legacy shape:
   *   :L103  product = getService("productService").newProduct();
   *   :L104  product.setProductType(getService("productService").getProductType(<contentAccess id>));
   *   :L106  assertFalse(product.isProcessable('addOptionGroup'));
   *
   * `isProcessable` is a framework facility, not a domain method: `org/Hibachi/HibachiEntity.cfc:L203-L228`
   * implements `isDeletable`, `isEditable` and `isProcessable` by calling
   * `validate(object=this, context=..., setErrors=false).hasErrors()`. N1: the target keeps that shape
   * by validating in the Validator's non-mutating mode, which returns a THROWAWAY error bag and leaves
   * the entity's own error state untouched. No `isProcessable` method is added to `Product` to mimic
   * CFML.
   *
   * The process itself is never executed. Availability is what :L106 asks about, so the D14
   * first-option-only defect and the image-filename chain are correctly out of this regression's reach.
   */
  it('issue_1331', async () => {
    const contentAccessProductType = buildProductType({
      productTypeID: CONTENT_ACCESS_PRODUCT_TYPE_ID,
      productTypeName: 'Content Access',
      systemCode: 'contentAccess',
    });
    const contentAccessProduct = buildProduct({
      productID: 'issue-1331-content-access',
      productType: contentAccessProductType,
    });
    const harness = createValidatorHarness();

    // :L106 — the gate is CLOSED for a content-access product, because
    // `model/validation/Product.json` declares `baseProductType` with `inList: "merchandise"` for the
    // `addOptionGroup,addOption` contexts.
    const denied = await harness.validateDryRun(
      productSubject(contentAccessProduct, { baseProductType: 'contentAccess' }),
      productValidationRuleSet,
      'addOptionGroup',
    );
    expect(denied.hasErrors()).toBe(true);
    expect(denied.getError('baseProductType')).toStrictEqual([
      'validate.addOptionGroup.Product.baseProductType.inList',
    ]);

    // N1 — the bag is a throwaway. The entity carries no errors of its own afterwards, so asking
    // whether a process is available never poisons the entity that was asked about.
    expect(contentAccessProduct.hasErrors()).toBe(false);
    expect(contentAccessProduct.getError('baseProductType')).toStrictEqual([]);

    // The gate DISCRIMINATES rather than always denying. A merchandise product with at least one
    // unused option group passes the same rules in the same context.
    const merchandiseProductType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: 'Merchandise',
      systemCode: 'merchandise',
    });
    const merchandiseProduct = buildProduct({
      productID: 'issue-1331-merchandise',
      productType: merchandiseProductType,
    });
    const permitted = await harness.validateDryRun(
      productSubject(merchandiseProduct, {
        baseProductType: 'merchandise',
        unusedProductOptionGroups: [buildOptionGroup({ optionGroupID: 'og-1331' })],
      }),
      productValidationRuleSet,
      'addOptionGroup',
    );
    expect(permitted.hasErrors()).toBe(false);

    // Context selection is WHOLE-ELEMENT and case-insensitive, matching CFML `listFindNoCase`, never
    // substring matching. `ValidationContext` is a closed union in the target, so a case variant is not
    // type-legal and cannot be used to demonstrate this. The type-legal discriminator is better:
    // `unusedProductOptionGroups` is gated on `addOptionGroup` ALONE, and the string `addOption` is a
    // strict substring of `addOptionGroup`. An EMPTY collection therefore fails under `addOptionGroup`,
    // and must NOT fail under `addOption` — which it would if matching were done by substring.
    const emptyGroups: readonly unknown[] = [];
    const underAddOptionGroup = await harness.validateDryRun(
      productSubject(merchandiseProduct, {
        baseProductType: 'merchandise',
        unusedProductOptionGroups: emptyGroups,
      }),
      productValidationRuleSet,
      'addOptionGroup',
    );
    expect(underAddOptionGroup.getError('unusedProductOptionGroups')).toStrictEqual([
      'validate.addOptionGroup.Product.unusedProductOptionGroups.minCollection',
    ]);
    const underAddOption = await harness.validateDryRun(
      productSubject(merchandiseProduct, {
        baseProductType: 'merchandise',
        unusedProductOptionGroups: emptyGroups,
      }),
      productValidationRuleSet,
      'addOption',
    );
    expect(underAddOption.getError('unusedProductOptionGroups')).toStrictEqual([]);
    expect(merchandiseProduct.hasErrors()).toBe(false);
  });

  /*
   * TRACEABLE — meta/tests/unit/IssuesTest.cfc:L110-L124 — AAP-named regression, PARTIAL SCOPE.
   *
   * Legacy shape:
   *   :L112  skuCurrency = entityNew("SlatwallSkuCurrency");
   *   :L114  skuCurrency.setPrice(-20);
   *   :L115  skuCurrency.setListPrice('test');
   *   :L117  skuCurrency.validate(context="save");
   *   :L119  assert(skuCurrency.hasError('price'));
   *   :L120  assert(skuCurrency.hasError('listPrice'));
   *   :L122  assert(right(skuCurrency.getError('price')[1], 8) neq "_missing");
   *   :L123  assert(right(skuCurrency.getError('listPrice')[1], 8) neq "_missing");
   *
   * G6 SCOPE NOTE. The legacy subject is `SlatwallSkuCurrency`, and both that entity and
   * `model/validation/SkuCurrency.json` are EXCLUDED from this slice — `SkuCurrency.json` is named in
   * the excluded catalog-adjacent list, and no currency relationship is modelled anywhere in the port.
   * The translation is therefore partial BY SCOPE, and the substitution is exact rather than
   * approximate: the `price` and `listPrice` records in `model/validation/SkuCurrency.json` are
   * byte-equivalent to the ones in `model/validation/Sku.json` — `price` required + numeric + min 0,
   * `listPrice` numeric + min 0 — so validating an in-scope `Sku` exercises the identical constraint
   * set that issue 1335 was filed against. Nothing about currency is imported, modelled or asserted.
   *
   * DECISION D-1 is what :L122-:L123 actually test, and it is preserved: the target's validation
   * messages are RAW CONSTRUCTED KEYS, not translated sentences. No resource bundle is consulted, no
   * `_missing` suffix is appended, and no case, spacing or pluralisation normalisation is applied.
   */
  it('issue_1335', async () => {
    const productID = 'issue-1335-product';
    const product = buildProduct({ productID });
    const repository = createInMemorySkuRepository({});
    const ruleSet = buildSkuSaveRuleSet(repository.repository, productID);
    const harness = createValidatorHarness();

    // :L114-:L115. `SkuSeed` accepts `number | string` for both, so the non-numeric list price goes
    // through the real conversion path with no cast and no suppression — exactly as a form post would
    // deliver it. `skuCode` is supplied only so the unrelated `required` record is satisfied and the
    // regression stays on price and list price; the real uniqueness and method rules are left in place.
    const sku = buildSku({
      skuID: 'issue-1335-sku',
      skuCode: 'ISSUE1335',
      price: -20,
      listPrice: 'test',
    });
    sku.setProduct(product);

    // :L117 — the framework `validate(context="save")` becomes an explicit Validator call against the
    // typed rule set. `Sku` exposes no `validate` method, and none is added.
    const errors = await harness.validateDryRun(sku, ruleSet, 'save');

    // :L119-:L120.
    expect(errors.hasError('price')).toBe(true);
    expect(errors.hasError('listPrice')).toBe(true);

    // The rule sets accumulate rather than short-circuit, and their constraint order is declared, so
    // the exact key sequence is assertable. `price = -20` reads as numeric, so only `minValue` fails.
    // `listPrice = 'test'` reads as NON-numeric, so `dataType` fails AND `minValue` fails after it,
    // because a non-numeric value cannot satisfy a minimum either.
    expect(errors.getError('price')).toStrictEqual(['validate.save.Sku.price.minValue']);
    expect(errors.getError('listPrice')).toStrictEqual([
      'validate.save.Sku.listPrice.dataType.numeric',
      'validate.save.Sku.listPrice.minValue',
    ]);

    // :L122-:L123 — `right(..., 8) neq "_missing"`, carried as an explicit suffix check over every
    // inspected key rather than only the first.
    const inspected: readonly string[] = [
      ...errors.getError('price'),
      ...errors.getError('listPrice'),
    ];
    expect(inspected.length).toBeGreaterThan(0);
    for (const message of inspected) {
      expect(message.endsWith('_missing')).toBe(false);
    }

    // Nothing else in the save rule set fired, which is what keeps the regression pointed at its
    // subject rather than at incidental wiring.
    expect(Object.keys(errors.getErrors()).sort()).toStrictEqual(['listPrice', 'price']);
  });

  /*
   * TRACEABLE — meta/tests/unit/IssuesTest.cfc:L126-L138 — beyond-the-AAP / X9 addition.
   *
   * DECLARATION ADJUDICATION, read from source rather than inherited from a plan: `issue_1348` is
   * declared at :L126-:L138. It is NOT at :L183 — :L183 begins `issue_1604`, an excluded Order-family
   * regression — and :L140 begins `issue_1376`, an excluded Account-family regression. Both are
   * declined, deliberately and by family, and neither has a test here.
   *
   * Legacy shape:
   *   :L128  product = entityNew("SlatwallProduct");
   *   :L129  sku = entityNew("SlatwallSku");
   *   :L131  sku.setProduct(product);
   *   :L132  sku.setSkuCode("issue_1348");
   *   :L133  sku.setPrice(-20);
   *   :L135  sku.validate(context="save");
   *   :L137  assert(sku.hasError('price'));
   *   :L138  assert(right(sku.getError('price')[1],8) neq "_missing");
   */
  it('issue_1348', async () => {
    const productID = 'issue-1348-product';
    const product = buildProduct({ productID });
    const repository = createInMemorySkuRepository({});
    const ruleSet = buildSkuSaveRuleSet(repository.repository, productID);
    const harness = createValidatorHarness();

    // :L129-:L133. `setProduct` is the real domain method and it mutates the LIVE array returned by
    // `Product.getSkus()` — no copy, no freeze, no readonly view — so the coupling the legacy ORM
    // relationship provided is genuinely exercised.
    const sku = buildSku({ skuID: 'issue-1348-sku', skuCode: 'issue_1348', price: -20 });
    sku.setProduct(product);
    expect(sku.skuCode).toBe('issue_1348');
    expect(product.getSkus()).toContain(sku);
    expect(sku.product).toBe(product);

    // :L135-:L138.
    const errors = await harness.validateDryRun(sku, ruleSet, 'save');
    expect(errors.hasError('price')).toBe(true);
    expect(errors.getError('price')).toStrictEqual(['validate.save.Sku.price.minValue']);
    expect(requireAt(errors.getError('price'), 0).endsWith('_missing')).toBe(false);

    /*
     * M6 — the `hasUniqueOptions` rule is not a pure predicate. It is a declarative rule from
     * `model/validation/Sku.json` that RUNS A QUERY, so what it sees depends on what the surrounding
     * transaction has already written. The sequence below is deliberately sequential: each validation
     * is awaited before the next write, there is no `Promise.all`, no pre-fetched snapshot, no cache
     * held across saves and no reordering of the batch. Reordering or batching here would change the
     * result with no error and no compile failure, which is exactly the hazard.
     */
    const sizeGroup = buildOptionGroup({
      optionGroupID: 'issue-1348-size',
      optionGroupName: 'Size',
      optionGroupCode: 'size',
    });
    const small = buildOption({
      optionID: 'issue-1348-small',
      optionName: 'Small',
      optionCode: 'small',
      optionGroup: sizeGroup,
    });

    const firstCombination = buildSku({
      skuID: 'issue-1348-combo-1',
      skuCode: 'ISSUE1348-COMBO-1',
      price: 10,
      options: [small],
    });
    firstCombination.setProduct(product);

    const secondCombination = buildSku({
      skuID: 'issue-1348-combo-2',
      skuCode: 'ISSUE1348-COMBO-2',
      price: 10,
      options: [small],
    });
    secondCombination.setProduct(product);

    // Step 1 — nothing written yet, so the duplicate combination is not yet a duplicate.
    const beforeSibling = await harness.validateDryRun(secondCombination, ruleSet, 'save');
    expect(beforeSibling.getError('options')).toStrictEqual([]);

    // Step 2 — the sibling becomes visible WITHIN the same transaction...
    repository.add(firstCombination);

    // ...and step 3 re-validates and now sees it. Same subject, same rule set, different answer,
    // because the rule reads live state rather than a snapshot.
    const afterSibling = await harness.validateDryRun(secondCombination, ruleSet, 'save');
    expect(afterSibling.getError('options')).toStrictEqual([
      'validate.save.Sku.options.hasUniqueOptions',
    ]);

    /*
     * TODO(parity) D19 — carried as observed behaviour, NOT repaired.
     *
     * `model/entity/Sku.cfc:L756-L769` builds `optionsList` from `getOptions()` and asks
     * `Product.getSkusBySelectedOptions(selectedOptions=optionsList)`. For a SKU with ZERO options that
     * list is the empty string, and an empty selection appends no `EXISTS` clause at all, so the query
     * legitimately degenerates to "every option-BEARING SKU of this product" — the vestigial
     * `inner join sku.options` still excludes option-less rows. The guard at :L764 then reads
     * `if(!arrayLen(skus) || (arrayLen(skus) == 1 && skus[1].getSkuID() == getSkuID()))`, which can only
     * pass when the product has no option-bearing SKUs whatsoever.
     *
     * The consequence is that an option-LESS default SKU FAILS `hasUniqueOptions` on any product that
     * already carries an option-bearing SKU. No empty-options short circuit and no default-SKU
     * exception is introduced to soften it: repairing this would make the port's output incomparable to
     * the legacy system, which AAP guideline 4 forbids. The failure surfaces under `options` with the
     * raw method key, as every method rule does.
     */
    const optionLess = buildSku({
      skuID: 'issue-1348-option-less',
      skuCode: 'ISSUE1348-OPTIONLESS',
      price: 10,
    });
    optionLess.setProduct(product);
    expect(optionLess.getOptions()).toStrictEqual([]);
    const optionLessErrors = await harness.validateDryRun(optionLess, ruleSet, 'save');
    expect(optionLessErrors.getError('options')).toStrictEqual([
      'validate.save.Sku.options.hasUniqueOptions',
    ]);
    expect(optionLessErrors.getError('price')).toStrictEqual([]);
  });

  /*
   * TRACEABLE — meta/tests/unit/IssuesTest.cfc:L192-L201 — beyond-the-AAP / X9 addition.
   *
   * Legacy shape, verbatim in structure:
   *   :L194  var product = request.slatwallScope.newEntity("Product");
   *   :L196  product.validate( context="save" );
   *   :L198  if(!product.hasErrors()){
   *   :L199    request.slatwallScope.saveEntity( product );
   *   :L200  }
   *
   * The regression is an ORDER, and N3 names it: validation runs FIRST, the CALLER inspects the
   * resulting error bag, and persistence is reached only when that bag is empty. Two consequences are
   * asserted rather than assumed:
   *
   *   - The `Validator` never persists. It has no persister among its constructor arguments — its sole
   *     collaborator is the `UniquePropertyPort` — and the shared ordering log proves that a validation
   *     which finds errors is followed by nothing at all.
   *   - Validation does NOT set a global, ORM-style error flag. Each call returns its own bag, so the
   *     decision belongs to the caller. `request.slatwallScope.newEntity`/`saveEntity` are the
   *     `org/Hibachi/HibachiScope.cfc` facade; the target reaches the same two seams directly, through
   *     explicit constructor injection rather than a string-keyed scope lookup.
   */
  it('issue_1690', async () => {
    const harness = buildHarness({ settings: [PRODUCT_TITLE_STRING_SETTING] });

    // The caller from :L196-:L200, written once and exercised down both branches. It is the only place
    // that decides to persist, which is the whole point of the assertion.
    const saveWhenValid = async (candidate: Product): Promise<'persisted' | 'refused'> => {
      const bag = await harness.validator.validate(
        productSubject(candidate),
        productValidationRuleSet,
        'save',
      );
      if (bag.hasErrors()) {
        return 'refused';
      }
      await harness.persistProduct(candidate);
      return 'persisted';
    };

    // :L194 — a brand-new entity, populated with nothing. This is the branch the legacy test actually
    // took, and it must refuse to persist.
    const newProduct = new Product();
    expect(newProduct.isNew()).toBe(true);
    expect(await saveWhenValid(newProduct)).toBe('refused');
    expect(harness.persistedProducts).toStrictEqual([]);

    // Validation happened, and NOTHING followed it. One entry in the log, and it is the validation.
    expect(harness.log).toStrictEqual([
      { kind: 'validate', className: 'Product', context: 'save' },
    ]);

    // The bag belongs to the call, not to the entity: nothing was attached to the product, so a second
    // caller asking the same question is not answered from the first caller's verdict.
    expect(newProduct.hasErrors()).toBe(false);

    // The other branch, so the ordering is proved THROUGH persistence rather than only up to it. A
    // product satisfying every `model/validation/Product.json` save record is accepted, and the log then
    // shows validate STRICTLY BEFORE persist.
    const merchandiseProductType = buildProductType({
      productTypeID: MERCHANDISE_PRODUCT_TYPE_ID,
      productTypeName: 'Merchandise',
      systemCode: 'merchandise',
    });
    const validProduct = buildProduct({
      productID: 'issue-1690-valid',
      productName: 'Valid Product',
      productCode: 'ISSUE1690',
      urlTitle: 'issue-1690',
      productType: merchandiseProductType,
    });
    // `price` is not a column on `SwProduct`: `Product.getPrice()` reads through the default SKU, so the
    // required price record is satisfied the way the entity actually satisfies it.
    const pricedSku = buildSku({ skuID: 'issue-1690-sku', skuCode: 'ISSUE1690-1', price: 100 });
    pricedSku.setProduct(validProduct);
    validProduct.defaultSku = createDefaultSkuDelegate(pricedSku);

    expect(await saveWhenValid(validProduct)).toBe('persisted');
    expect(harness.persistedProducts).toStrictEqual([validProduct]);
    expect(harness.log).toStrictEqual([
      { kind: 'validate', className: 'Product', context: 'save' },
      { kind: 'validate', className: 'Product', context: 'save' },
      { kind: 'persist', productID: 'issue-1690-valid' },
    ]);
    // Stated as an index comparison so the ORDER is the assertion, not a by-product of array equality:
    // the latest validation strictly precedes the only persistence.
    const persistIndex = harness.log.findIndex((event) => event.kind === 'persist');
    const lastValidateIndex = harness.log.reduce(
      (latest, event, index) => (event.kind === 'validate' ? index : latest),
      -1,
    );
    expect(persistIndex).toBeGreaterThan(-1);
    expect(lastValidateIndex).toBeGreaterThan(-1);
    expect(lastValidateIndex).toBeLessThan(persistIndex);
  });

  /*
   * TRACEABLE — meta/tests/unit/IssuesTest.cfc:L203-L206 — beyond-the-AAP / X9 addition.
   *
   * Legacy shape:
   *   :L204  var product = request.slatwallScope.newEntity("Product");
   *   :L205  request.slatwallScope.saveEntity( product );
   *
   * The difference from `issue_1690` is the whole regression: there is NO validate-first guard here.
   * An invalid, brand-new product is handed straight to the save contract, and the save must come back
   * rather than blow up. In the target that is explicit — `ProductService.saveProduct` attaches the
   * errors to the entity and RETURNS it, so a validation failure is DATA on the returned entity, never
   * an exception. Nothing is thrown, nothing is rejected, and nothing is persisted.
   */
  it('issue_1690_2', async () => {
    const harness = buildHarness({ settings: [PRODUCT_TITLE_STRING_SETTING] });

    // :L204-:L205 — straight to save, with no guard and an empty payload.
    const product = new Product();
    const answer = await harness.service.saveProduct(product, {});

    // The SAME instance comes back, carrying its own validation state.
    expect(answer).toBe(product);
    expect(product.hasErrors()).toBe(true);

    // The failure is data, so it is inspectable through the entity's own error surface. Every key is a
    // raw constructed key (decision D-1), and the required records from `model/validation/Product.json`
    // are the ones that fired.
    //
    // `urlTitle` is NOT among them, and that is the service earning its keep rather than a gap in the
    // rule set: `saveProduct` sees an absent urlTitle and derives one from `Product.getTitle()` before
    // validating, so the required record is satisfied by the time it is evaluated. The raw
    // `request.slatwallScope.saveEntity` at :L205 did no such thing — one more place where routing
    // through the service adds behaviour the legacy call site did not have.
    expect(Object.keys(product.getErrors()).sort()).toStrictEqual([
      'price',
      'productCode',
      'productName',
      'productType',
    ]);
    expect(product.getError('productName')).toStrictEqual([
      'validate.save.Product.productName.required',
    ]);
    expect(product.getError('urlTitle')).toStrictEqual([]);
    expect(product.urlTitle).not.toBe('');
    expect(typeof product.urlTitle).toBe('string');

    // Nothing was persisted, and the new-product branch never reached SKU creation, because
    // `saveProduct` gates both on an empty error state.
    expect(harness.persistedProducts).toStrictEqual([]);
    expect(harness.log).toStrictEqual([
      { kind: 'validate', className: 'Product', context: 'save' },
    ]);

    // And it RESOLVES rather than rejecting — asserted directly, not merely implied by the await above.
    const second = new Product();
    await expect(harness.service.saveProduct(second, {})).resolves.toBe(second);
    expect(second.hasErrors()).toBe(true);
    expect(harness.persistedProducts).toStrictEqual([]);
  });
});
