/* ==================================================================================================
 * container.ts — THE COMPOSITION ROOT.
 *
 * The single place the Catalog object graph is wired. It is the declared replacement for the DI/1
 * runtime bean scan at `org/Hibachi/Hibachi.cfc:L289-L292`, and it is the only file in
 * `slatwall-ts/src/**` that calls `new` on a service, a repository or an adapter.
 *
 * ⭐ (a) WHAT IT REPLACES — DI/1 0.4.2, AND BOTH HALVES OF IT.
 * The legacy container is `new DI1.ioc("/#applicationKey#/model", …)`
 * [`org/Hibachi/Hibachi.cfc:L289`], whose version is `'0.4.2'`
 * [`org/Hibachi/DI1/ioc.cfc:L546`, accessor `:L108-L110`]. It resolved collaborators two ways, and
 * this file retires both:
 *
 *   R1 — PROPERTY INJECTION BY NAME. A service declared `property name="skuDAO" type="any"`
 *        [`model/service/ProductService.cfc:L53`] and reached it through a generated accessor
 *        `getSkuDAO()`. Both halves collapse into ONE typed constructor argument, passed here.
 *   R2 — DYNAMIC STRING LOOKUP. `getService("imageService")`
 *        [`model/service/SkuService.cfc:L212`] resolved through the factory at run time, and the
 *        lookup was case-insensitive, so the legacy tree spells the same bean two ways. Every such
 *        call becomes a compile-checked constructor dependency; where its target is out of scope it
 *        terminates at one of the declared ports (TR-5).
 *
 * TR-3 is why there is no third mechanism. `onMissingMethod`
 * [`org/Hibachi/HibachiService.cfc:L255-L281`] fabricated an entire CRUD surface by prefix, and
 * TypeScript under `strict` has no equivalent — so this file contains NO `Proxy`, no `Reflect`, no
 * name-keyed registry, no decorator, no DI library and no `resolve('name')`. Wiring is a list of
 * `new` expressions in dependency order, and nothing else.
 *
 * ⭐ (b) THE LIFECYCLE SPLIT, WHICH IS BEHAVIOUR AND NOT IDIOM.
 * The bean scan's second argument is the whole lifecycle contract:
 *
 *     transients = ["entity", "process", "transient", "report"], transientPattern = "Bean$"
 *     [`org/Hibachi/Hibachi.cfc:L290-L291`]
 *
 * `model/service/**` and `model/dao/**` are ABSENT from that list. That absence is the PROOF — not
 * the assumption — that every service and every DAO was a SINGLETON, and that entities and process
 * objects were TRANSIENT. The framework's own beans say the same thing twice over: ELEVEN explicit
 * singletons, each `declareBean(name, class, TRUE)` at `:L299`, `:L302`, `:L305`, `:L308`, `:L311`,
 * `:L314`, `:L317`, `:L320`, `:L323`, `:L326` and `:L329`; and FOUR explicit transients, each
 * `declareBean(name, class, FALSE)` at `:L334` (`hibachiScope`), `:L337` (`hibachiSmartList`),
 * `:L340` (`hibachiErrors`) and `:L343` (`hibachiMessages`).
 *
 * ⚠️ THE ASYMMETRY IS THE TELL, AND IT IS HONOURED HERE. `hibachiValidationService` is a SINGLETON
 * at `:L329` while `hibachiErrors` is a TRANSIENT at `:L340`. The legacy authors distinguished
 * MACHINERY from PER-OPERATION RESULTS. So {@link Validator} is built once and memoized, and a
 * `ValidationError` is never constructed, held or cached by this file — the services mint one per
 * operation. `hibachiSmartList` is transient for the same reason, which is why
 * {@link SmartListQueryBuilder} is stateless here and any memoization inside a query is the
 * request's, never the module's (M7).
 *
 * ⛔ (h) THE `custom/model` PARENT FACTORY IS NOT REPRODUCED.
 * `org/Hibachi/Hibachi.cfc:L347-L358` builds a SECOND DI/1 factory over `/custom/model` and chains
 * it with `customBF.setParent( coreBF )` at `:L353`, giving a two-tier override lookup. AAP §0.2.2.2
 * verified that `custom/**` holds nothing but readme stubs — there are ZERO catalog overrides to
 * reconcile — so there is no parent factory here, no override resolution and no `setParent`
 * analogue. Reproducing an empty override tier would be machinery with nothing to resolve.
 *
 * ⛔ (i) `writeLog(...)` IS NOT CARRIED.
 * The legacy factory logs its own construction at `org/Hibachi/Hibachi.cfc:L359`. No logging
 * framework is a dependency of this subtree (S5) and no `console` output is permitted, so the line
 * has no port and no replacement. Its absence is a decision, recorded here.
 *
 * ⭐ (f) M5 — THE REQUEST-END COMMIT HAS NO ANALOGUE, AND THIS FILE IMPLEMENTS NONE OF IT.
 * The legacy chain is: `this.ormSettings.flushAtRequestEnd = false`
 * [`org/Hibachi/Hibachi.cfc:L103`] -> `endHibachiLifecycle()` gated on
 * `!getHibachiScope().getORMHasErrors()` [`:L455-L459`] -> `flushORMSession()`, whose body is a
 * DOUBLE `ormFlush()` [`org/Hibachi/HibachiDAO.cfc:L92-L96`]. A stateless invocation has no
 * request-end hook. The replacement is `../adapters/mysql/UnitOfWork.ts`, which this file
 * CONSTRUCTS and never imitates: there is no flush, no commit, no rollback, no error gate and no
 * transaction helper anywhere below.
 *
 * ⭐ (g) M7 — THE GRAPH IS MEMOIZED; NO DERIVED VALUE IS.
 * `model/dao/SkuDAO.cfc:L204-L220` memoizes a table-wide aggregate into a SINGLETON DAO's own
 * `variables` scope, and its clearing member is inverted so the memo is never actually cleared
 * [`:L222-L226`, defect D7, carried unrepaired by
 * `../adapters/mysql/MySqlSkuRepository.ts`]. On a persistent application server that is stale; on a
 * warm, reused container it is cross-invocation bleed. So this file memoizes the WIRING and owns the
 * one request-scoped holder that ordering needs, resetting it at the invocation boundary — see
 * {@link CatalogContainer.beginInvocation}. It memoizes no query result, no setting, no identifier
 * and no derived value of any kind, and it holds no entity and no process object: those are the
 * TRANSIENTS of `:L290`, minted per request by the services through `newSku()`, `newProduct()` and
 * `newBrand()`.
 *
 * ⭐ (j) TWO WIRING CONTRACTS THAT FAIL AT RUN TIME RATHER THAN AT COMPILE TIME.
 * Both are enforced at their wiring sites below, and both are recorded here because neither produces a
 * type error when it is got wrong.
 *   1. EVERY `EntityPersister` AND `EntityRemover` CALLBACK IS WRAPPED IN AN ARROW. `EntityPersister<T>`
 *      is declared by `../services/BaseService.ts` as a plain `(entity: T) => Promise<T>`, so a bare
 *      `repository.saveBrand` satisfies it structurally and then loses `this` when the base service
 *      invokes it. Every callback handed over in Tier 5 is `(entity) => repository.save…(entity)`, never
 *      the bare member. The same applies to the URL-title probe, which
 *      `../adapters/mysql/UniquePropertyChecker.ts` deliberately exposes as a METHOD.
 *   2. THE `UniqueValueProbe` POLARITY IS `true` MEANS AVAILABLE. `../util/urlTitle.ts` declares
 *      `(tableName, value) => Promise<boolean>`, and the legacy loop it ports is `while(!unique)` at
 *      `model/service/DataService.cfc:L64` — with `addon` pre-incremented at `:L65`, which is why the
 *      first collision suffix is `-2`. An inverted probe type-checks perfectly and then either spins
 *      forever or hands out duplicate titles. `BrandService` probes `SwBrand`; `ProductService` probes
 *      `SwProduct` and `SwProductType`, which is why only it receives the table-taking form.
 *
 * ⭐ (k) THE FIXED-MySQL DECISION IS DOCUMENTED IN `./env`, NOT HERE.
 * The legacy chose its Hibernate dialect at run time from a `cfdbinfo` version probe
 * [`config/configORM.cfm:L8-L14`]. That collapse to a single MySQL target is `./env`'s decision and
 * its reasoning lives there; this file reads the resolved configuration and states nothing further
 * about it. It also reads NO environment variable: `./env` is the only file in `src/**` permitted to
 * touch `process.env` (AAP §0.4.3.5).
 *
 * --------------------------------------------------------------------------------------------------
 * COVERAGE PROVENANCE — 100% NET-NEW, AND NO PARITY IS IMPLIED
 * --------------------------------------------------------------------------------------------------
 * There is NO legacy counterpart to this file. The legacy application resolved its dependencies by a
 * run-time bean scan [`org/Hibachi/Hibachi.cfc:L289-L292`], so there is no composition-root component
 * to trace a test to, and `meta/tests/` contains no factory or bean-wiring test of any kind. Every
 * assertion written against this file is therefore NET-NEW coverage rather than a legacy test carried
 * across, and it is labelled that way rather than presented as parity (AAP §0.6.5.2). The only parity
 * claims made anywhere below are about BEHAVIOUR — the singleton/transient split, the exact set of
 * edges, the four omissions — each carrying the locator that evidences it.
 *
 * --------------------------------------------------------------------------------------------------
 * LAYERING — ONE DIRECTION, ENFORCED FROM BOTH ENDS
 * --------------------------------------------------------------------------------------------------
 * `config/` sits ABOVE `domain`, `ports`, `adapters`, `validation`, `services` and `integrations`,
 * and BELOW `handlers`. It imports all of the former; NONE of them may import it, and twenty sibling
 * files list `../config/**` among their forbidden imports for that reason. `handlers/**` imports the
 * container; the container imports no handler, no AWS type and no AWS SDK — all AWS coupling stays in
 * `src/handlers/**` (S4). Every import below is relative, extensionless and single-quoted, because
 * `tsc` and `esbuild` must resolve identically and an alias that type-checks can still throw
 * `MODULE_NOT_FOUND` at a cold start (AAP §0.4.3.5).
 * ============================================================================================== */

import { createCatalogAggregateLoaders } from '../adapters/mysql/catalogAggregates';
import { MySqlBrandRepository } from '../adapters/mysql/MySqlBrandRepository';
import { MySqlOptionRepository } from '../adapters/mysql/MySqlOptionRepository';
import {
  MySqlProductPersistence,
  type ProductDependencyCleanup,
} from '../adapters/mysql/MySqlProductPersistence';
import {
  MySqlProductRepository,
  unresolvableImportUrlTitleFilter,
  unresolvableProductContentAssignmentPort,
  unresolvableProductImportSourceReader,
} from '../adapters/mysql/MySqlProductRepository';
import { MySqlProductTypeRepository } from '../adapters/mysql/MySqlProductTypeRepository';
import {
  createOptionGroupSortOrderMemo,
  MySqlSkuRepository,
} from '../adapters/mysql/MySqlSkuRepository';
import { QueryRunner } from '../adapters/mysql/QueryRunner';
import {
  readProductDefaultSkuId,
  type IdentifiedProductDefaultSku,
} from '../adapters/mysql/rowMappers';
import { SmartListQueryBuilder } from '../adapters/mysql/SmartListQueryBuilder';
import { UniquePropertyChecker } from '../adapters/mysql/UniquePropertyChecker';
import { UnitOfWork } from '../adapters/mysql/UnitOfWork';
import { StaticSettingResolver } from '../adapters/settings/StaticSettingResolver';
import { populate, type ManagedEntity, type PropertyDescriptorSet } from '../domain/base/populate';
import { BRAND_PROPERTY_DESCRIPTORS, type BrandPropertyName } from '../domain/product/Brand';
import {
  PRODUCT_PROPERTY_DESCRIPTORS,
  type Product,
  type ProductPropertyName,
} from '../domain/product/Product';
import {
  createProductTypePropertyDescriptorSet,
  type ProductType,
  type ProductTypePopulationCollaborators,
  type ProductTypePropertyName,
  type ProductTypeRootResolver,
} from '../domain/product/ProductType';
import type { DefaultSkuIdReader, Sku } from '../domain/sku/Sku';
import { DomainError, NotImplementedError } from '../errors/DomainError';
import { GoogleIntegration } from '../integrations/google/GoogleIntegration';
import { ProductFeedBuilder } from '../integrations/google/ProductFeedBuilder';
import { ProductFeedQuery } from '../integrations/google/ProductFeedQuery';
import type { AccessContentPort } from '../ports/AccessContentPort';
import type { AccountContextPort, PopulationAuthorizationPort } from '../ports/AccountContextPort';
import type { ImagePathPort } from '../ports/ImagePathPort';
import type { PricingPort } from '../ports/PricingPort';
import type { BrandRepository } from '../ports/repositories/BrandRepository';
import type { OptionRepository } from '../ports/repositories/OptionRepository';
import type { ProductRepository } from '../ports/repositories/ProductRepository';
import type { ProductTypeRepository } from '../ports/repositories/ProductTypeRepository';
import type { SkuRepository } from '../ports/repositories/SkuRepository';
import type { SettingResolverPort } from '../ports/SettingResolverPort';
import type { SmartListQueryPort } from '../ports/SmartListQueryPort';
import type { SubscriptionTermPort } from '../ports/SubscriptionTermPort';
import type { UniquePropertyPort } from '../ports/UniquePropertyPort';
import {
  BaseService,
  type EntityCommentCleanupPort,
  type EntitySettingCleanupPort,
} from '../services/BaseService';
import { BrandService, type ManagedBrand } from '../services/BrandService';
import { OptionService } from '../services/OptionService';
import { ProductService } from '../services/ProductService';
import { SkuService } from '../services/SkuService';
import type { UniqueValueProbe } from '../util/urlTitle';
import { brandValidationRules } from '../validation/rules/brand.rules';
import { productValidationRuleSet } from '../validation/rules/product.rules';
import { productTypeValidationRuleSet } from '../validation/rules/productType.rules';
import { Validator } from '../validation/Validator';
import { pool } from './database';
import { config, type AppConfig } from './env';

/* ================================================================================================
 * THE WIRED GRAPH
 * ============================================================================================== */

/**
 * Every collaborator the Catalog slice needs, wired once.
 *
 * ⭐ WHY A FROZEN RECORD RATHER THAN A LOOKUP. The legacy factory answered
 * `getBean("productService")` — a name-keyed lookup whose misses surfaced at run time. Every member
 * below is a declared, typed field, so a wiring mistake is a compile error and a member the slice
 * does not use cannot be reached at all. There is no `get(name)`, no indexer and no mutation: the
 * object is frozen, so a caller can read the graph but cannot re-point it (S3).
 *
 * ⚠️ NO ENTITY AND NO PROCESS OBJECT APPEARS HERE, AND THAT IS THE `:L290` CONTRACT.
 * `org/Hibachi/Hibachi.cfc:L290` declares `entity` and `process` TRANSIENT. The synthesized
 * constructors stay on the services — `ProductService.newProduct()`, `SkuService.newSku()`,
 * `BrandService.newBrand()` — so an instance is minted per request and this container never holds
 * one.
 */
export interface CatalogContainer {
  /**
   * The resolved configuration, exposed so the routing layer can read `config.googleFeed.host`
   * without importing `./env` and without reading `process.env` itself.
   */
  readonly config: AppConfig;

  /** `pool.execute()` over the shared pool — the port of the legacy DAO query primitives. */
  readonly queryRunner: QueryRunner;

  /** The explicit transaction boundary that replaces the implicit request-end commit (M5). */
  readonly unitOfWork: UnitOfWork;

  /** Application-side uniqueness checking — the port of `org/Hibachi/HibachiDAO.cfc:L130-L146`. */
  readonly uniqueProperty: UniquePropertyPort;

  /** The paginated dynamic-query surface that replaces `org/Hibachi/HibachiSmartList.cfc`. */
  readonly smartListQueryPort: SmartListQueryPort;

  /** Effective values for the eighteen setting names the slice reads. */
  readonly settings: SettingResolverPort;

  /** Image paths and uploads — a declared boundary, see the stub block below. */
  readonly imagePaths: ImagePathPort;

  /** Sale-price details — a declared boundary, see the stub block below. */
  readonly pricing: PricingPort;

  /** Subscription terms and benefits — a declared boundary, see the stub block below. */
  readonly subscriptionTerms: SubscriptionTermPort;

  /** Access content — a declared boundary, see the stub block below. */
  readonly accessContent: AccessContentPort;

  /** The acting principal — a declared boundary, resolved per invocation at the handler edge. */
  readonly accountContext: AccountContextPort;

  /** ARMS 2 and 3 of the population gate, wired fail-closed. */
  readonly populationAuthorization: PopulationAuthorizationPort;

  /** The three business queries of `model/dao/ProductDAO.cfc`, plus its importer. */
  readonly productRepository: ProductRepository;

  /** The six members of `model/dao/SkuDAO.cfc`, including the option-to-SKU resolver. */
  readonly skuRepository: SkuRepository;

  /** The two unused-option queries of `model/dao/OptionDAO.cfc`. */
  readonly optionRepository: OptionRepository;

  /** The tree-sorted query of `model/dao/ProductTypeDAO.cfc`. */
  readonly productTypeRepository: ProductTypeRepository;

  /** The CRUD surface `BrandService` reached through `onMissingMethod` synthesis (IR-1). */
  readonly brandRepository: BrandRepository;

  /** The write surface for `SwProduct` and `SwProductType`. */
  readonly productPersistence: MySqlProductPersistence;

  /** The typed rule-set evaluator that replaces `org/Hibachi/HibachiValidationService.cfc`. */
  readonly validator: Validator;

  /** The LOCAL `save()`/`delete()` overrides of `model/service/HibachiService.cfc`, at Brand. */
  readonly brandBaseService: BaseService<ManagedBrand, BrandPropertyName>;

  /** The same overrides at Product — `ProductService` narrows this to `delete`. */
  readonly productBaseService: BaseService<Product, ProductPropertyName>;

  /** The same overrides at ProductType — `ProductService` narrows this to `save`. */
  readonly productTypeBaseService: BaseService<ManagedEntity<ProductType>, ProductTypePropertyName>;

  /** The three declared members of `model/service/OptionService.cfc`, plus the four synthesized. */
  readonly optionService: OptionService;

  /** The nine members of `model/service/SkuService.cfc`, including the combination engine. */
  readonly skuService: SkuService;

  /** The fifteen members of `model/service/ProductService.cfc`. */
  readonly productService: ProductService;

  /** The one member of `model/service/BrandService.cfc`, plus the three synthesized. */
  readonly brandService: BrandService;

  /** The interface-conformant stub of `integrationServices/google/Integration.cfc`. */
  readonly googleIntegration: GoogleIntegration;

  /** The record selection of `integrationServices/google/controllers/feed.cfc`. */
  readonly productFeedQuery: ProductFeedQuery;

  /** The field mapping of `integrationServices/google/views/feed/product.cfm`. */
  readonly productFeedBuilder: ProductFeedBuilder;

  /**
   * Discards the one piece of request-scoped state the graph carries. The routing layer calls it
   * FIRST, on every invocation, before any handler runs.
   *
   * ⭐ M7, AND WHY IT IS A BOUNDARY RATHER THAN A CACHE FLUSH. The sorted-SKU ordering needs the
   * next option-group sort order [`model/dao/SkuDAO.cfc:L204-L220`], and the legacy memoized it in a
   * SINGLETON DAO's `variables` scope. The cached aggregate takes no parameters and applies no
   * product scoping [`:L210-L212`], so on a warm container one caller's value would silently weight
   * a later, unrelated caller's ordering. `../adapters/mysql/MySqlSkuRepository.ts` makes the memo an
   * injected holder whose lifetime the composition root owns; this member IS that lifetime.
   *
   * ⚠️ IT IS NOT THE PORT OF `clearNextOptionGroupSortOrder()`. That member's legacy guard is
   * inverted, so it never clears anything [`model/dao/SkuDAO.cfc:L222-L226`, defect D7], and
   * `MySqlSkuRepository.clearOptionGroupSortOrderCache()` preserves the defect unrepaired (S7). This
   * boundary is a separate, execution-model adaptation (IR-10) that the legacy had no equivalent of,
   * because a persistent application server never ended the memo's life at all.
   *
   * Calling it more than once is harmless and calling it never is what the legacy did.
   */
  beginInvocation(): void;
}

/**
 * Substitutions a caller may make when building a graph.
 *
 * ⭐ WHY THIS EXISTS AT ALL — S6. The legacy suite vendored NO mocking library and booted the whole
 * FW/1 application to reach a service through DI/1 [`meta/tests/unit/SlatwallUnitTestBase.cfc`], so
 * its tests were integration tests. The target suite constructs a class directly against a double
 * (AAP §0.4.3.6), and these slots are what let it do that for a WHOLE graph rather than one class:
 * every boundary a test needs to control is listed, and anything omitted falls back to the
 * production collaborator. Under `exactOptionalPropertyTypes` an omitted slot is ABSENT rather than
 * `undefined`, which is why every member is optional rather than nullable.
 *
 * ⚠️ OVERRIDES ARE HONOURED ONLY BY {@link createCatalogContainer}. {@link getCatalogContainer}
 * takes no argument, so a double can never reach the memoized production graph.
 */
export interface CatalogContainerOverrides {
  readonly settings?: SettingResolverPort;
  readonly imagePaths?: ImagePathPort;
  readonly pricing?: PricingPort;
  readonly subscriptionTerms?: SubscriptionTermPort;
  readonly accessContent?: AccessContentPort;
  readonly accountContext?: AccountContextPort;
  readonly populationAuthorization?: PopulationAuthorizationPort;
  readonly uniqueProperty?: UniquePropertyPort;

  /**
   * The URL-title probe `../util/urlTitle` calls once per collision candidate.
   *
   * ⚠️⚠️ POLARITY: `true` MEANS THE VALUE IS AVAILABLE. `model/service/DataService.cfc:L64` loops
   * `while(!unique)`, so a probe that answers `false` for a free title never terminates and one that
   * answers `true` for a taken title produces duplicates. Both ends of the real wiring were read to
   * confirm it: `../util/urlTitle` names the parameter `isValueAvailable`, and
   * `../adapters/mysql/UniquePropertyChecker.ts` documents `isUrlTitleAvailable` as answering
   * "`true` when no row holds that title and it is therefore still available … never inverted".
   */
  readonly isUrlTitleAvailable?: UniqueValueProbe;

  readonly smartListQueryPort?: SmartListQueryPort;
  readonly productRepository?: ProductRepository;
  readonly skuRepository?: SkuRepository;
  readonly optionRepository?: OptionRepository;
  readonly productTypeRepository?: ProductTypeRepository;
  readonly brandRepository?: BrandRepository;
  readonly settingCleanup?: EntitySettingCleanupPort;
  readonly commentCleanup?: EntityCommentCleanupPort;
  readonly productDependencyCleanup?: ProductDependencyCleanup;
  readonly productTypeRootResolver?: ProductTypeRootResolver;
}

/* ================================================================================================
 * (e) THE BOUNDARY STUBS — TR-5, DECLARED INLINE
 * ================================================================================================
 * TR-5 reads: "Cross the scope boundary only through a declared port. Where an in-scope member
 * depends on an out-of-scope collaborator, the port interface is declared, the member is implemented
 * against it, and the gap is flagged. THE MEMBER IS NEVER QUIETLY DROPPED FROM THE INTERFACE."
 *
 * So every port must be given something. Five of the thirteen ports have NO in-scope adapter, by
 * design — `SubscriptionTermPort`, `AccessContentPort`, `PricingPort`, `AccountContextPort` and
 * `ImagePathPort` — because each stands for a service in an excluded family: `Subscription*` (11
 * files), `Content*` (5), `PriceGroup*` (4), `Currency*` (2), `Promotion*` (9) and the image service,
 * none of which this slice converts (AAP §0.2.2.1). The other three do have adapters:
 * `SettingResolverPort` -> `../adapters/settings/StaticSettingResolver`, `UniquePropertyPort` ->
 * `../adapters/mysql/UniquePropertyChecker`, `SmartListQueryPort` ->
 * `../adapters/mysql/SmartListQueryBuilder`.
 *
 * ⭐ EVERY STUB MEMBER RAISES, AND NOTHING RETURNS A PLAUSIBLE VALUE. A stub that answered `null`,
 * `undefined`, `''`, `0` or a fabricated price would be an invented behaviour (S9) and would be
 * indistinguishable from data at the call site. A raise cannot be mistaken for data, names the
 * collaborator that is missing, and fails at the first read rather than corrupting a rendered feed —
 * the pattern `../adapters/mysql/MySqlProductRepository.ts` already uses for
 * `unresolvableProductImportSourceReader` and `unresolvableImportUrlTitleFilter`.
 *
 * ⭐ AND EVERY STUB GENUINELY IMPLEMENTS ITS INTERFACE. There is no `as unknown as` anywhere in this
 * file: each object below is annotated with its port type and satisfies it structurally, so a member
 * added to a port breaks this build (S1). A cast would have hidden exactly that signal.
 *
 * ⚠️ THREE OF THESE STAND FOR COLLABORATORS THE AAP's five-port list does not name, and they are
 * here because `../services/BaseService.ts` and `../adapters/mysql/MySqlProductPersistence.ts`
 * declare them REQUIRED. Both files say in their own words that "nothing in this subtree implements
 * it, and nothing here may", which leaves the wiring site as the only place they can be satisfied.
 * `../services/BaseService.ts` also rejects the alternative explicitly: an empty branch "would
 * silently decide, on the owner's behalf, that its cache does not need invalidating". So they raise
 * too, and the consequence is stated rather than smoothed over — a delete that passes its guards
 * reaches the cleanup step and fails there, loudly, instead of half-completing in silence.
 * ============================================================================================== */

/**
 * Refuses one member of one boundary port, naming the legacy collaborator that owns the real
 * behaviour.
 *
 * @param member the refusing member, spelled `Port.method` so a log or a test can identify it
 * @param reason the out-of-scope collaborator and the legacy locator that proves the crossing
 */
function refuseBoundary(member: string, reason: string): never {
  throw new NotImplementedError(member, reason);
}

/**
 * Subscription terms and benefits — `subscriptionService`, three call sites in
 * `model/service/SkuService.cfc` and one at `model/service/ProductService.cfc:L173`. The
 * `subscription` branch of the combination engine [`model/service/SkuService.cfc:L58-L211`] and
 * `processProductAddSubscriptionTerm` both reach it. The `Subscription*` family is excluded.
 */
const notImplementedSubscriptionTermPort: SubscriptionTermPort = {
  getSubscriptionTerm: () =>
    refuseBoundary(
      'SubscriptionTermPort.getSubscriptionTerm',
      'it stands for subscriptionService, whose family model/**/Subscription*.cfc is out of scope',
    ),
  getSubscriptionBenefit: () =>
    refuseBoundary(
      'SubscriptionTermPort.getSubscriptionBenefit',
      'it stands for subscriptionService, whose family model/**/Subscription*.cfc is out of scope',
    ),
  getSubscriptionTermsByIDs: () =>
    refuseBoundary(
      'SubscriptionTermPort.getSubscriptionTermsByIDs',
      'it stands for subscriptionService, whose family model/**/Subscription*.cfc is out of scope',
    ),
  getSubscriptionBenefitsByIDs: () =>
    refuseBoundary(
      'SubscriptionTermPort.getSubscriptionBenefitsByIDs',
      'it stands for subscriptionService, whose family model/**/Subscription*.cfc is out of scope',
    ),
};

/**
 * Access content — `contentService`, two call sites in `model/service/SkuService.cfc`, reached by the
 * `contentAccess` branch of the combination engine. The `Content*` family is excluded.
 */
const notImplementedAccessContentPort: AccessContentPort = {
  getContent: () =>
    refuseBoundary(
      'AccessContentPort.getContent',
      'it stands for contentService, whose family model/**/Content*.cfc is out of scope',
    ),
  getContentsByIDs: () =>
    refuseBoundary(
      'AccessContentPort.getContentsByIDs',
      'it stands for contentService, whose family model/**/Content*.cfc is out of scope',
    ),
};

/**
 * (d) THE HIDDEN DYNAMIC DEPENDENCY. `model/service/SkuService.cfc:L212` calls
 * `getService("imageService").saveImageFile(…, allowedExtensions="jpg,jpeg,png,gif")` and
 * `imageService` is NEVER DECLARED AS A PROPERTY on that component. Any dependency analysis driven by
 * component metadata therefore misses it entirely, and a port built from such an analysis would
 * compile and then fail at the first image operation. It is surfaced here as `ImagePathPort`, which
 * also carries the derived image-path members at `model/entity/Sku.cfc:L145`, `:L192` and `:L221`.
 */
const notImplementedImagePathPort: ImagePathPort = {
  getImagePath: () =>
    refuseBoundary(
      'ImagePathPort.getImagePath',
      'it stands for imageService, resolved dynamically at model/service/SkuService.cfc:L212 and out of scope',
    ),
  getResizedImagePath: () =>
    refuseBoundary(
      'ImagePathPort.getResizedImagePath',
      'it stands for imageService, resolved dynamically at model/service/SkuService.cfc:L212 and out of scope',
    ),
  getImageExistsFlag: () =>
    refuseBoundary(
      'ImagePathPort.getImageExistsFlag',
      'it stands for imageService, resolved dynamically at model/service/SkuService.cfc:L212 and out of scope',
    ),
  saveImageFile: () =>
    refuseBoundary(
      'ImagePathPort.saveImageFile',
      'it stands for imageService, resolved dynamically at model/service/SkuService.cfc:L212 and out of scope',
    ),
};

/**
 * Sale-price details — the `priceGroupService`, `currencyService` and `promotionService` trio the
 * non-persistent sale-price members of `model/entity/Sku.cfc` and `Product.price` reach. All three
 * families are excluded, which is exactly why AAP §0.2.2.6 draws the calculated-property boundary.
 * The Google feed's conditional `g:sale_price` pair is the one in-scope reader.
 */
const notImplementedPricingPort: PricingPort = {
  getSalePriceDetailsForProductSkus: () =>
    refuseBoundary(
      'PricingPort.getSalePriceDetailsForProductSkus',
      'it stands for priceGroupService, currencyService and promotionService, all out of scope',
    ),
};

/**
 * The acting principal — the `getHibachiScope()` request lookup at
 * `org/Hibachi/HibachiObject.cfc:L74-L76`.
 *
 * ⭐ IT RAISES RATHER THAN ANSWERING "NO ACCOUNT", AND THE DIFFERENCE MATTERS. Returning `undefined`
 * would be a fabricated verdict: it reads as "this invocation has no principal", which is a
 * statement about the request that a graph built BEFORE any request cannot make. It is also the one
 * thing `../ports/AccountContextPort.ts` forbids this file to hold — a principal captured at build
 * time on a memoized graph is precisely the cross-tenant bleed M7 exists to prevent — so the real
 * principal arrives per invocation, as a FUNCTION, at the handler edge. Everything below this
 * boundary that legitimately has no principal already models that itself: the audit stamp in
 * `../adapters/mysql/rowMappers.ts` and the repositories treat an absent account as absent without
 * asking this port.
 */
const notImplementedAccountContextPort: AccountContextPort = {
  getCurrentAccount: () =>
    refuseBoundary(
      'AccountContextPort.getCurrentAccount',
      'the acting principal is resolved per invocation at the handler edge, never captured by the memoized graph',
    ),
};

/**
 * The setting-side effect of the LOCAL delete and save overrides — `settingService` at
 * `model/service/HibachiService.cfc:L76`, `:L94-L96` and `:L98-L100`. The `Setting*` family is
 * excluded.
 */
const notImplementedSettingCleanupPort: EntitySettingCleanupPort = {
  removeAllEntityRelatedSettings: () =>
    refuseBoundary(
      'EntitySettingCleanupPort.removeAllEntityRelatedSettings',
      'it stands for settingService at model/service/HibachiService.cfc:L76, whose family is out of scope',
    ),
  updateAllSettingValuesToRemoveSpecificID: () =>
    refuseBoundary(
      'EntitySettingCleanupPort.updateAllSettingValuesToRemoveSpecificID',
      'it stands for settingService at model/service/HibachiService.cfc:L94-L96, whose family is out of scope',
    ),
  clearAllSettingsCache: () =>
    refuseBoundary(
      'EntitySettingCleanupPort.clearAllSettingsCache',
      'it stands for settingService at model/service/HibachiService.cfc:L98-L100, whose family is out of scope',
    ),
};

/**
 * The comment-side effect of the LOCAL delete override — `commentService` at
 * `model/service/HibachiService.cfc:L79`. No comment family is in scope anywhere in this slice,
 * because there is none to list.
 */
const notImplementedCommentCleanupPort: EntityCommentCleanupPort = {
  removeAllEntityRelatedComments: () =>
    refuseBoundary(
      'EntityCommentCleanupPort.removeAllEntityRelatedComments',
      'it stands for commentService at model/service/HibachiService.cfc:L79, which this slice does not convert',
    ),
};

/**
 * The link-table cleanup a product or product-type removal performs across excluded families —
 * declared by `../adapters/mysql/MySqlProductPersistence.ts`, which states that its implementation
 * belongs outside this subtree.
 */
const notImplementedProductDependencyCleanup: ProductDependencyCleanup = {
  removeProductDependencies: () =>
    refuseBoundary(
      'ProductDependencyCleanup.removeProductDependencies',
      'the link tables it clears belong to excluded families — promotion, price group, attribute and physical',
    ),
  removeProductTypeDependencies: () =>
    refuseBoundary(
      'ProductDependencyCleanup.removeProductTypeDependencies',
      'the link tables it clears belong to excluded families — promotion, price group, attribute and physical',
    ),
};

/**
 * ARMS 2 and 3 of the population gate at `org/Hibachi/HibachiTransient.cfc:L186-L190`, wired
 * FAIL-CLOSED.
 *
 * ⭐ THIS ONE IS NOT A RAISING STUB, AND THE ASYMMETRY IS DELIBERATE. `../ports/AccountContextPort.ts`
 * states the contract in its own words — "ABSENT MEANS DENY, NOT ALLOW", and an implementation that
 * cannot reach a decision "returns `false`, never `true`" — and it supplies this exact literal as the
 * shape a caller wires. A raise would refuse population outright where the legacy asked a question
 * and got an answer; a permissive default would be STRICTLY MORE PERMISSIVE than the system being
 * replaced, which is the one outcome the port forbids. `false`/`false` is the legacy's own default at
 * `org/Hibachi/HibachiTransient.cfc:L186`.
 *
 * ⚠️ THE OBSERVABLE CONSEQUENCE, STATED PLAINLY. ARM 1 is `!isPersistent()`, so the three in-scope
 * PROCESS OBJECTS still populate freely — that arm short-circuits before this port is consulted. A
 * PERSISTENT entity, however, populates no property until a real authoriser is wired: the legacy
 * consulted `hibachiAuthenticationService`, a framework component AAP §0.6.3.1 classifies as excluded.
 * {@link CatalogContainerOverrides.populationAuthorization} is how a deployment or a test supplies
 * one, and the gap is recorded here rather than closed by guessing a permission model.
 */
const denyAllPopulationAuthorization: PopulationAuthorizationPort = {
  getPublicPopulateFlag: () => false,
  authenticateEntityProperty: () => false,
};

/* ================================================================================================
 * THE FOUR COLLABORATORS ONLY A COMPOSITION ROOT CAN ASSEMBLE
 * ================================================================================================
 * Each of these is required by a sibling that explicitly declines to build it, on the grounds that
 * doing so would need a collaborator from a layer it may not import. None of them is a stub: they are
 * real adapters between two real contracts, and the only thing they refuse is the part no in-scope
 * collaborator can answer.
 * ============================================================================================== */

/**
 * Adapts a hydrated `Sku` to the nine-member delegate `Product.defaultSku` accepts.
 *
 * ⭐ WHY IT LIVES HERE. `../domain/sku/Sku.ts` records in its own mismatch register that `Sku` IS
 * INTENTIONALLY NOT ASSIGNABLE to `ProductDefaultSkuDelegate` — the delegate wants nine SYNCHRONOUS,
 * ARGUMENT-FREE readers, while the entity's currency and image equivalents are asynchronous and
 * port-parameterised — and it names the resolution in as many words: "a thin binding adapter in the
 * composition root closes over the ports and satisfies the delegate".
 * `../adapters/mysql/catalogAggregates.ts` declares the same collaborator REQUIRED for the identical
 * reason, and `../services/SkuService.ts` takes it as its ninth constructor argument.
 *
 * THE THREE MONETARY MEMBERS FORWARD EXACTLY. `Sku.getPrice()`, `getListPrice()` and
 * `getRenewalPrice()` are zero-argument and synchronous already, so no adaptation is needed — and they
 * are the three that matter, because `Product.getPrice()` falls through to `defaultSku.getPrice()`
 * whenever the product carries no override [`model/entity/Product.cfc:L563-L568`], which is every
 * freshly mapped product, since `price` is a column of `SwSku` and not of `SwProduct`. The Google
 * feed's `g:price` reads through this delegate on every record.
 *
 * THE CURRENCY MEMBER IS ANSWERED FOR REAL. `Sku.getCurrencyCode(settings)` is synchronous and takes
 * a resolver whose `setting(...)` member is synchronous too, so closing over the real
 * `SettingResolverPort` satisfies it without inventing anything.
 *
 * ⛔ THE FIVE IMAGE MEMBERS RAISE, AND `ImagePathPort` IS DELIBERATELY NOT A PARAMETER HERE. Every
 * image member of `Sku` is `async` and takes the port as an argument, so no amount of closing over
 * that port can produce a synchronous `string`. Accepting the port would imply a bridge that cannot
 * exist. `getImageDirectory` is refused for a second, independent reason: `Sku` declares NO such
 * member at all, and `model/entity/Sku.cfc` declares none either — the asymmetry is recorded as a
 * carried parity note on `../ports/ImagePathPort.ts` and inventing the member would contradict it.
 *
 * ⚠️ MEMOIZED IN A `WeakMap`, WHICH IS LEGAL UNDER S8/M7 AND IS NOT A CACHE. Identity is required
 * one level up: two products sharing a default SKU must receive the SAME delegate or `===` between
 * them is false and the identity map above breaks. The table is object-keyed, so no value can be
 * reached without already holding the exact instance it describes, a later invocation constructs
 * different instances and can reach nothing, and each entry dies with its SKU —
 * `../adapters/mysql/rowMappers.ts` establishes exactly this precedent for its
 * parent-product-type provenance table.
 *
 * @param settings the real setting resolver, closed over for `getCurrencyCode`
 * @returns the binder, one per graph
 */
function createDefaultSkuDelegateBinder(
  settings: SettingResolverPort,
): (sku: Sku) => IdentifiedProductDefaultSku {
  const boundDelegates = new WeakMap<Sku, IdentifiedProductDefaultSku>();

  const refuseImageMember = (member: string): never =>
    refuseBoundary(
      `IdentifiedProductDefaultSku.${member}`,
      'the delegate declares it synchronous while Sku answers asynchronously through ImagePathPort, which is out of scope',
    );

  return (sku: Sku): IdentifiedProductDefaultSku => {
    const existing = boundDelegates.get(sku);
    if (existing !== undefined) {
      return existing;
    }

    const delegate: IdentifiedProductDefaultSku = {
      /* Carried so `readProductDefaultSkuId` can read the identifier off the delegate without a cast
       * — the mechanism `../adapters/mysql/rowMappers.ts` declares for exactly this slot. */
      skuID: sku.skuID,
      getPrice: () => sku.getPrice(),
      getListPrice: () => sku.getListPrice(),
      getRenewalPrice: () => sku.getRenewalPrice(),
      getCurrencyCode: () => sku.getCurrencyCode(settings),
      getImageDirectory: () => refuseImageMember('getImageDirectory'),
      getImagePath: () => refuseImageMember('getImagePath'),
      getImage: () => refuseImageMember('getImage'),
      getResizedImagePath: () => refuseImageMember('getResizedImagePath'),
      getImageExistsFlag: () => refuseImageMember('getImageExistsFlag'),
    };

    boundDelegates.set(sku, delegate);

    return delegate;
  };
}

/**
 * Reads the identifier of whatever sits in `Product.defaultSku`.
 *
 * `../adapters/mysql/rowMappers.ts` exports the structural read — it tests for the key with `in` and
 * narrows with `typeof`, so no cast is involved — and answers `undefined` for a delegate that carries
 * no identifier. The seam both `../services/ProductService.ts` and
 * `../adapters/mysql/MySqlProductRepository.ts` declare demands a `string`, so the absent case is
 * refused rather than papered over with `''`: an empty identifier would compare equal to the
 * `unsavedvalue=""` every primary key declares and would make `Sku.getDefaultFlag` answer TRUE for a
 * SKU that is not the default.
 */
const readDefaultSkuIdOrRefuse: DefaultSkuIdReader = (defaultSku) => {
  const skuID = readProductDefaultSkuId(defaultSku);

  if (skuID === undefined) {
    throw new DomainError(
      "A product's default SKU was read for its identifier and carried none. The delegate in that " +
        'slot is expected to be either a hydrated SKU or the identifier-carrying reference the row ' +
        'mappers mint, and this one was neither.',
    );
  }

  return skuID;
};

/**
 * Resolves a product type by identifier so `Product.getBaseProductType(…)` can walk
 * `productTypeIDPath` to its root and answer the discriminator the three process contexts gate on.
 *
 * ⭐ WHY IT IS BUILT OVER `SmartListQueryPort` AND NOT OVER `ProductService.getProductType`.
 * `../services/ProductService.ts` says the two are not interchangeable — that member answers
 * `ProductType | null` while this contract answers `… | undefined` — and states that the resolver is
 * the composition root's to supply. The decisive reason is structural, though: routing it through
 * `ProductService` would create `SkuService -> resolver -> ProductService -> SkuService`, and the only
 * way to wire a cycle is a lazy getter or a deferred field, which would hide the cycle from review.
 * Built over the query port instead, it sits in the same tier as the repositories and the graph stays
 * ACYCLIC by construction.
 *
 * ⚠️ AND NOT OVER `QueryRunner` EITHER. This file writes no SQL and passes no raw-SQL capability to
 * anything (S2). The query below is a typed descriptor — an entity name, a property identifier and a
 * value — assembled exactly as `../services/ProductService.ts` and `../services/OptionService.ts`
 * each assemble their own identifier lookups. `productTypeID` is the primary key at
 * `model/entity/ProductType.cfc:L52`.
 */
function createProductTypeRootResolver(
  smartListQueryPort: SmartListQueryPort,
): ProductTypeRootResolver {
  return {
    getProductType: async (productTypeID: string) => {
      const records = await smartListQueryPort.executeRecords({
        entityName: 'SlatwallProductType',
        whereGroups: [{ filters: [{ propertyIdentifier: 'productTypeID', value: productTypeID }] }],
      });

      /* `noUncheckedIndexedAccess` already yields `ProductType | undefined` here, which is precisely
       * the contract: absent means "no such product type", the same answer the legacy `get(id)` gave
       * by returning null. */
      return records[0];
    },
  };
}

/**
 * Builds the population contract for `ProductType`.
 *
 * `../domain/product/ProductType.ts` declares its six relationship collaborators REQUIRED and states
 * that they are "supplied by the composition root … rather than resolved here", because a
 * module-scope constant would have to close over module-scope collaborators, which M7 forbids.
 *
 * ⛔ THE TWO LOADER ARMS ARE ANSWERED DIFFERENTLY, AND EACH ANSWER IS THE LEGACY'S OWN.
 * `RelatedEntityLoader` is SYNCHRONOUS by declaration, so no member of it can perform the database
 * read the legacy performed through `getService("hibachiService").getServiceByEntityName(…)`
 * [`org/Hibachi/HibachiTransient.cfc:L233`] — and NO adapter in this subtree implements the
 * interface, which is why the honest wiring is:
 *
 *   • `loadExisting` answers `undefined`. That is not an invention: it is the legacy's own not-found
 *     arm, whose comment reads "if one doesn't exist... this will be null" [`:L257-L266`], and the
 *     population engine assigns only when the load returned something. A seam that holds no rows can
 *     truthfully say only "not found".
 *   • `loadOrCreate` REFUSES. Its contract cannot answer "absent", so something must be produced, and
 *     every candidate would be a fabrication: a bare transient would write an empty foreign key, and
 *     an identifier-only reference would assert an existence this seam cannot verify. A raise names
 *     the missing adapter instead.
 *
 * ⚠️ THE ASYMMETRY WITH `Product` IS EXPLAINED BY ITS OPTIONALITY, NOT BY A DIFFERENT JUDGEMENT.
 * `../domain/product/Product.ts` makes every relationship collaborator OPTIONAL and blesses the
 * dependency-free form used below as "the form a caller uses when it has no related-entity loaders to
 * supply and needs none" — omitting a collaborator omits its descriptor entirely, so a relationship
 * payload key is IGNORED rather than refused. `ProductType`'s are required, so omission is not
 * available and refusal is the only non-fabricating option. Both consequences are the same in kind: a
 * relationship arriving in a payload is not resolved until a `RelatedEntityLoader` adapter exists.
 *
 * ⚠️ `populateAttributeValue` REFUSES FOR A SECOND REASON. `AttributeValue` belongs to the excluded
 * `model/**\/Attribute*.cfc` family, so there is no descriptor set to recurse with; inventing one
 * would be inventing the attribute subsystem's population contract (S9).
 *
 * @param populationAuthorization the gate the recursive populators must apply, exactly as the
 *   top-level call does — a sub-object populated through a laxer gate than its parent would be a new
 *   control path, and there is no second gate here
 */
function createProductTypeDescriptorSet(
  populationAuthorization: PopulationAuthorizationPort,
): PropertyDescriptorSet<ProductType, ProductTypePropertyName> {
  /*
   * THE RECURSION SEAM, AS `../domain/base/populate.ts` DESCRIBES IT: "typically a one-line call back
   * into populate with that module's own descriptor set". `parentProductType` and
   * `childProductTypes` are self-referencing, so the set this function returns is the set the
   * recursion needs. A hoisted function declaration closes that loop without a lazy field: the body
   * reads `descriptorSet` only when a nested payload is actually populated, which is necessarily
   * after the binding below has been initialised.
   */
  function populateProductTypeSubProperty(
    related: ProductType,
    data: Record<string, unknown>,
  ): void {
    populate(related, data, descriptorSet, populationAuthorization);
  }

  function populateProductSubProperty(related: Product, data: Record<string, unknown>): void {
    populate(related, data, PRODUCT_PROPERTY_DESCRIPTORS, populationAuthorization);
  }

  const refuseLoader = (relatedEntityName: string): never =>
    refuseBoundary(
      `RelatedEntityLoader.loadOrCreate(${relatedEntityName})`,
      'the loader is synchronous by declaration and no adapter in this subtree can read a row synchronously',
    );

  const collaborators: ProductTypePopulationCollaborators = {
    /* ONE LOADER SERVES BOTH `parentProductType` AND `childProductTypes`, because the legacy resolved
     * both through the SAME entity-service lookup keyed on the related component name
     * [`org/Hibachi/HibachiTransient.cfc:L227`, `:L233`]. */
    productTypeLoader: {
      loadOrCreate: () => refuseLoader('ProductType'),
      loadExisting: () => undefined,
    },
    populateProductType: populateProductTypeSubProperty,
    productLoader: {
      loadOrCreate: () => refuseLoader('Product'),
      loadExisting: () => undefined,
    },
    populateProduct: populateProductSubProperty,
    attributeValueLoader: {
      loadOrCreate: () => refuseLoader('AttributeValue'),
      loadExisting: () => undefined,
    },
    populateAttributeValue: () =>
      refuseBoundary(
        'ProductTypePopulationCollaborators.populateAttributeValue',
        'AttributeValue belongs to the excluded model/**/Attribute*.cfc family, so it declares no descriptor set to recurse with',
      ),
  };

  const descriptorSet = createProductTypePropertyDescriptorSet(collaborators);

  return descriptorSet;
}

/* ================================================================================================
 * (c) THE FOUR DEAD INJECTIONS — DECLARED IN THE LEGACY, NOT WIRED HERE
 * ================================================================================================
 * Four `property name=` declarations in the four in-scope services have ZERO call sites in the whole
 * legacy tree. AAP §0.4.3.1 says they are "not carried", so there is no constructor argument, no
 * binding, no placeholder, no commented-out line and no optional slot for any of them below:
 *
 *   1. `productTypeDAO`  [`model/service/ProductService.cfc:L54`]  — 0 call sites
 *   2. `contentService`  [`model/service/ProductService.cfc:L57`]  — 0 call sites
 *   3. `productService`  [`model/service/SkuService.cfc:L54`]      — 0 call sites
 *   4. `productService`  [`model/service/OptionService.cfc:L53`]   — 0 call sites
 *
 * ⭐ NUMBER 3 IS WHY THE GRAPH BELOW IS ACYCLIC. `ProductService` genuinely uses `skuService` (three
 * call sites), so wiring `SkuService`'s unused `productService` back would close a cycle — and the
 * only way to construct a cycle is a lazy getter or a deferred field, which is exactly the mechanism
 * that would then hide the cycle from review. AAP §0.4.3.1 records that dropping it removes the cycle
 * "at no cost", and the construction order below proves it: two roots, then one dependent, then one.
 *
 * ⚠️ NONE OF THIS EDITS THE LEGACY. The four declarations stay exactly where they are; the CFML tree
 * is byte-for-byte untouched (TR-6). This is an omission in NEW code, and it is recorded here because
 * an omission is invisible at the wiring site otherwise.
 *
 * ⚠️ AND `productTypeRepository` BELOW IS NOT NUMBER 1 SNEAKING BACK IN. That repository is the port
 * of `model/dao/ProductTypeDAO.cfc`, an in-scope file whose tree-sorted query is real behaviour; it is
 * constructed and exposed for the routing layer, and it is injected into NO service — which is
 * precisely what the dead `productTypeDAO` injection means. `../adapters/mysql/MySqlProductTypeRepository.ts`
 * states the same thing from its own side: constructible and correct, and nothing in the slice invokes it.
 * ============================================================================================== */

/**
 * Builds a FRESH graph.
 *
 * This is the S6 seam: every boundary a test needs to control is a slot on
 * {@link CatalogContainerOverrides}, and anything omitted falls back to the production collaborator.
 * Production code calls {@link getCatalogContainer} instead, so a double can never reach the memoized
 * graph.
 *
 * ⭐ IT OPENS NO CONNECTION AND PERFORMS NO I/O. Every expression below is a constructor call.
 * `./database` created the pool at module scope for warm reuse, and a pool holds no connection until
 * one is checked out — which is what lets `tsc`, `eslint`, `esbuild`, the bundle cold-load and the
 * whole test suite run with no `.env` file and no environment variable set.
 *
 * ⭐ SIX TIERS, IN DEPENDENCY ORDER, WITH NO FORWARD REFERENCE. There is no lazy getter, no deferred
 * `let x!: T`, no two-pass wiring and no re-entrant factory anywhere: each tier consumes only tiers
 * above it. If a future edit seems to need one of those devices, an edge has been added that the AAP
 * does not have — check it against the four dead injections above before reaching for a workaround.
 *
 * @param overrides substitutions for any boundary; omit it entirely for the production graph
 * @returns the frozen graph
 */
export function createCatalogContainer(
  overrides: CatalogContainerOverrides = {},
): CatalogContainer {
  /* ----------------------------------------------------------------------------------------------
   * TIER 1 — CONFIGURATION AND THE BOUNDARY COLLABORATORS
   * Nothing here depends on anything else in the graph. `./env` has already read and frozen the
   * environment; this file reads no variable of its own.
   * -------------------------------------------------------------------------------------------- */
  const settings: SettingResolverPort =
    overrides.settings ?? new StaticSettingResolver(config.settings);
  const imagePaths: ImagePathPort = overrides.imagePaths ?? notImplementedImagePathPort;
  const pricing: PricingPort = overrides.pricing ?? notImplementedPricingPort;
  const subscriptionTerms: SubscriptionTermPort =
    overrides.subscriptionTerms ?? notImplementedSubscriptionTermPort;
  const accessContent: AccessContentPort =
    overrides.accessContent ?? notImplementedAccessContentPort;
  const accountContext: AccountContextPort =
    overrides.accountContext ?? notImplementedAccountContextPort;
  const populationAuthorization: PopulationAuthorizationPort =
    overrides.populationAuthorization ?? denyAllPopulationAuthorization;
  const settingCleanup: EntitySettingCleanupPort =
    overrides.settingCleanup ?? notImplementedSettingCleanupPort;
  const commentCleanup: EntityCommentCleanupPort =
    overrides.commentCleanup ?? notImplementedCommentCleanupPort;
  const productDependencyCleanup: ProductDependencyCleanup =
    overrides.productDependencyCleanup ?? notImplementedProductDependencyCleanup;

  /* ----------------------------------------------------------------------------------------------
   * TIER 2 — INFRASTRUCTURE OVER THE ONE POOL
   * `QueryRunner` and `UnitOfWork` each take the SAME pool: the runner for statements outside a
   * transaction, the boundary for those inside one. `UnitOfWork` is also handed straight to the
   * importer below, because it already satisfies that adapter's transaction-boundary shape.
   * -------------------------------------------------------------------------------------------- */
  const queryRunner = new QueryRunner(pool);
  const unitOfWork = new UnitOfWork(pool);
  const uniquePropertyChecker = new UniquePropertyChecker(queryRunner);
  const uniqueProperty: UniquePropertyPort = overrides.uniqueProperty ?? uniquePropertyChecker;

  /*
   * ⚠️⚠️ THE PROBE IS WRAPPED, NOT PASSED BARE, AND THE POLARITY IS THE HIGHEST-RISK SEMANTIC IN THIS
   * FILE. `isUrlTitleAvailable` is a METHOD on the checker, so a bare `uniquePropertyChecker.isUrlTitleAvailable`
   * would lose `this` and fail at run time with no compile error — `../adapters/mysql/UniquePropertyChecker.ts`
   * says in its own words that a composition root must hand it over wrapped. And `true` MEANS AVAILABLE:
   * `model/service/DataService.cfc:L64` loops `while(!unique)`, so an inverted probe either never
   * terminates or hands out duplicate titles, and neither failure is a type error.
   */
  const isUrlTitleAvailable: UniqueValueProbe =
    overrides.isUrlTitleAvailable ??
    ((tableName, value) => uniquePropertyChecker.isUrlTitleAvailable(tableName, value));

  /*
   * The delegate binder must exist before the aggregate loaders, which must exist before the query
   * builder: `../adapters/mysql/catalogAggregates.ts` makes the binder a REQUIRED dependency of the
   * loaders, and the builder takes the loaders. That ordering is the reason those three lines are
   * adjacent rather than grouped with their neighbours by kind.
   */
  const bindDefaultSkuDelegate = createDefaultSkuDelegateBinder(settings);
  const smartListQueryPort: SmartListQueryPort =
    overrides.smartListQueryPort ??
    new SmartListQueryBuilder(
      queryRunner,
      createCatalogAggregateLoaders({ bindDefaultSkuDelegate }),
    );

  /* One resolver serves the SKU repository, the SKU service and the product service — the legacy read
   * the same product-type ancestry from one place too. */
  const productTypeRootResolver: ProductTypeRootResolver =
    overrides.productTypeRootResolver ?? createProductTypeRootResolver(smartListQueryPort);

  /* ----------------------------------------------------------------------------------------------
   * TIER 3 — REPOSITORIES AND THE PRODUCT WRITE SURFACE
   * One executor serves every adapter: `QueryRunner` implements the read/write pair each of them
   * declares for itself, so there is no per-adapter shim and every statement runs on one pool.
   * -------------------------------------------------------------------------------------------- */

  /*
   * ⭐ M7 — THE ONE PIECE OF REQUEST-SCOPED STATE IN THE GRAPH, AND ITS LIFETIME IS OWNED HERE.
   * `../adapters/mysql/MySqlSkuRepository.ts` makes the sorted-SKU sort-order memo a constructor
   * parameter for exactly this reason: the legacy kept it in a singleton DAO's `variables` scope
   * [`model/dao/SkuDAO.cfc:L204-L220`] where it outlived every request, and the value it caches is
   * scoped to the whole option-group table rather than to any product [`:L210-L212`]. The holder is
   * minted here and discarded by {@link CatalogContainer.beginInvocation}; nothing else in this file
   * memoizes a value of any kind.
   */
  const optionGroupSortOrderMemo = createOptionGroupSortOrderMemo();

  const skuRepository: SkuRepository =
    overrides.skuRepository ??
    new MySqlSkuRepository(
      queryRunner,
      optionGroupSortOrderMemo,
      productTypeRootResolver,
      accountContext,
    );
  const optionRepository: OptionRepository =
    overrides.optionRepository ?? new MySqlOptionRepository(queryRunner);
  const productTypeRepository: ProductTypeRepository =
    overrides.productTypeRepository ?? new MySqlProductTypeRepository(queryRunner, accountContext);
  const brandRepository: BrandRepository =
    overrides.brandRepository ?? new MySqlBrandRepository(queryRunner, accountContext);

  /*
   * The importer's three refusing collaborators come from the adapter that declares them, rather than
   * being re-declared here: a remote source reader, a content assignment port and a URL-title filter,
   * each of which raises for a collaborator no in-scope file can supply. Reusing the adapter's own
   * exports keeps one statement of each refusal instead of two that could drift.
   */
  const productRepository: ProductRepository =
    overrides.productRepository ??
    new MySqlProductRepository({
      executor: queryRunner,
      transactions: unitOfWork,
      sourceReader: unresolvableProductImportSourceReader,
      contentAssignment: unresolvableProductContentAssignmentPort,
      accountContext,
      urlTitleFilter: unresolvableImportUrlTitleFilter,
      readDefaultSkuId: readDefaultSkuIdOrRefuse,
    });

  const productPersistence = new MySqlProductPersistence(
    queryRunner,
    productDependencyCleanup,
    readDefaultSkuIdOrRefuse,
  );

  /* ----------------------------------------------------------------------------------------------
   * TIER 4 — VALIDATION
   * `hibachiValidationService` is a SINGLETON at `org/Hibachi/Hibachi.cfc:L329`, so the validator is
   * built once. `hibachiErrors` is a TRANSIENT at `:L340`, so no `ValidationError` is constructed,
   * held or cached anywhere in this file — the services mint one per operation.
   * -------------------------------------------------------------------------------------------- */
  const validator = new Validator(uniqueProperty);

  /* ----------------------------------------------------------------------------------------------
   * TIER 5 — THE LOCAL BASE OVERRIDES, THEN THE FOUR SERVICES
   * `model/service/BrandService.cfc:L76` calls `super.save()`, which resolves to the LOCAL override at
   * `model/service/HibachiService.cfc:L86` — not to the framework base (IR-8). R3 replaces that
   * inheritance with composition: `BaseService` is INJECTED, never extended, so the framework members
   * the slice never used are never inherited either.
   *
   * ⚠️ EVERY PERSISTER AND REMOVER IS WRAPPED IN AN ARROW. A bare `brandRepository.saveBrand` handed to
   * `EntityPersister` would lose `this` and fail only at run time — the single most likely silent break
   * in the whole wiring. The removers also adapt a return type: the repositories answer a boolean or an
   * entity, while `EntityRemover` answers `void`, and the boolean verdict of the delete path belongs to
   * the base service [`org/Hibachi/HibachiService.cfc:L71`, `:L79`].
   * -------------------------------------------------------------------------------------------- */
  const brandBaseService = new BaseService<ManagedBrand, BrandPropertyName>({
    validator,
    ruleSet: brandValidationRules,
    propertyDescriptors: BRAND_PROPERTY_DESCRIPTORS,
    populationAuthorization,
    persist: (brand) => brandRepository.saveBrand(brand),
    remove: async (brand) => {
      await brandRepository.deleteBrand(brand);
    },
    settingCleanup,
    commentCleanup,
  });

  const productBaseService = new BaseService<Product, ProductPropertyName>({
    validator,
    ruleSet: productValidationRuleSet,
    propertyDescriptors: PRODUCT_PROPERTY_DESCRIPTORS,
    populationAuthorization,
    persist: (product) => productPersistence.saveProduct(product),
    remove: async (product) => {
      await productPersistence.deleteProduct(product);
    },
    settingCleanup,
    commentCleanup,
  });

  const productTypeBaseService = new BaseService<
    ManagedEntity<ProductType>,
    ProductTypePropertyName
  >({
    validator,
    ruleSet: productTypeValidationRuleSet,
    propertyDescriptors: createProductTypeDescriptorSet(populationAuthorization),
    populationAuthorization,
    /* `saveProductType` answers the entity it was given, so returning the argument keeps the managed
     * surface the base service declared without a cast. */
    persist: async (productType) => {
      await productPersistence.saveProductType(productType);
      return productType;
    },
    remove: async (productType) => {
      await productPersistence.deleteProductType(productType);
    },
    settingCleanup,
    commentCleanup,
  });

  /*
   * TWO ROOTS, THEN ONE DEPENDENT, THEN ONE. `OptionService` and the base services depend on no
   * service; `SkuService` depends on `OptionService` (one legacy call site); `ProductService` depends on
   * both plus the product base services (three call sites each); `BrandService` depends on its base
   * service alone. That is the whole service graph, and it has no cycle because
   * `model/service/SkuService.cfc:L54` is not wired.
   */
  const optionService = new OptionService(optionRepository, smartListQueryPort);

  /*
   * The tenth constructor argument — a maximum combination count — is deliberately OMITTED.
   * `../services/SkuService.ts` says a composition root that supplies one has RELOCATED a fabrication
   * rather than avoided it: the legacy states no such ceiling, and S9 forbids inventing one. Under
   * `exactOptionalPropertyTypes` an omitted argument is ABSENT rather than `undefined`, which is what
   * keeps the parity path — the legacy's unbounded enumeration — the default. The same reasoning omits
   * the URL-title attempt budget and the smart-list materialisation budget above.
   */
  const skuService = new SkuService(
    skuRepository,
    optionService,
    subscriptionTerms,
    accessContent,
    imagePaths,
    smartListQueryPort,
    validator,
    productTypeRootResolver,
    bindDefaultSkuDelegate,
  );

  const productService = new ProductService({
    productRepository,
    skuRepository,
    skuService,
    optionService,
    baseService: productBaseService,
    productTypeBaseService,
    validator,
    settings,
    accountContext,
    smartListQueryPort,
    subscriptionTermPort: subscriptionTerms,
    productTypeRootResolver,
    productPropertyDescriptors: PRODUCT_PROPERTY_DESCRIPTORS,
    populationAuthorization,
    isUrlTitleAvailable,
    persistProduct: (product) => productPersistence.saveProduct(product),
    defaultSkuIdReader: readDefaultSkuIdOrRefuse,
  });

  /* `BrandService` reaches its own uniqueness probe through the repository's `isUrlTitleAvailable`,
   * which is brand-scoped, so it takes no probe argument — unlike `ProductService`, which serves two
   * tables (`SwProduct` and `SwProductType`) through the one table-taking probe above. */
  const brandService = new BrandService(brandRepository, brandBaseService);

  /* ----------------------------------------------------------------------------------------------
   * TIER 6 — THE GOOGLE ADAPTER
   * The interface-conformant component carries NO feed logic — `getIntegrationTypes()` returns "fw1"
   * and `getSettings()` is empty [`integrationServices/google/Integration.cfc`] — so the stub takes no
   * collaborator. The real work is split in two, exactly as the legacy split it: record selection came
   * from `integrationServices/google/controllers/feed.cfc` and the field mapping from
   * `integrationServices/google/views/feed/product.cfm`. No outbound call to Google exists anywhere in
   * this graph, and no HTTP client is a dependency.
   * -------------------------------------------------------------------------------------------- */
  const googleIntegration = new GoogleIntegration();
  const productFeedQuery = new ProductFeedQuery(skuService);
  const productFeedBuilder = new ProductFeedBuilder(imagePaths, pricing, settings);

  return Object.freeze({
    config,
    queryRunner,
    unitOfWork,
    uniqueProperty,
    smartListQueryPort,
    settings,
    imagePaths,
    pricing,
    subscriptionTerms,
    accessContent,
    accountContext,
    populationAuthorization,
    productRepository,
    skuRepository,
    optionRepository,
    productTypeRepository,
    brandRepository,
    productPersistence,
    validator,
    brandBaseService,
    productBaseService,
    productTypeBaseService,
    optionService,
    skuService,
    productService,
    brandService,
    googleIntegration,
    productFeedQuery,
    productFeedBuilder,

    beginInvocation: (): void => {
      optionGroupSortOrderMemo.value = undefined;
    },
  });
}

/* ================================================================================================
 * THE MEMOIZED PRODUCTION GRAPH
 * ============================================================================================== */

/**
 * The one memo cell in this file, and the only mutable module-scope binding it declares.
 *
 * ⭐ IT HOLDS THE GRAPH AND NOTHING ELSE. AAP §0.4.1.3 requires the wiring to be memoized across warm
 * invocations, mirroring the DI/1 singleton registration at `org/Hibachi/Hibachi.cfc:L298-L330`, and
 * this cell is that memo. It caches no query result, no setting value, no identifier and no derived
 * value — those are the reads M7 keeps request-scoped. It is declared `const` and holds one mutable
 * field, so the binding itself can never be re-pointed by anything.
 */
const memoizedGraph: { container: CatalogContainer | undefined } = { container: undefined };

/**
 * The production accessor: builds the graph on first call and returns the same graph thereafter.
 *
 * The routing layer calls this once per module load and {@link CatalogContainer.beginInvocation} once
 * per invocation. It takes NO argument on purpose — {@link createCatalogContainer} is where a
 * substitution belongs, so no test double can reach the graph a warm container reuses.
 *
 * @returns the memoized graph
 */
export function getCatalogContainer(): CatalogContainer {
  memoizedGraph.container ??= createCatalogContainer();

  return memoizedGraph.container;
}
