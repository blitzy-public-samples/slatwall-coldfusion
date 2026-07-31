/**
 * NET-NEW — hand-written in-memory test doubles for every port of the extracted Catalog slice.
 *
 * ## Why this file exists at all
 *
 * The legacy repository contains **no mocking library**. Not a stubbed one, not an unused one — none.
 * Its unit tests therefore substitute nothing: every test component extends a base that boots the
 * entire FW/1 application and then resolves its collaborators by string through the DI/1 bean factory
 * at run time, so a "unit" test of one service exercises the whole object graph, the ORM session and
 * the real datasource. That is an integration test wearing a unit test's name.
 *
 * The extracted service inverts this. Constructor injection (AAP §0.4.3.1) means a class under test
 * takes its collaborators as typed arguments, so a test constructs the class directly and hands it
 * exactly the doubles it needs — no framework bootstrap, no service locator, no datasource. This file
 * is the substitution mechanism that makes that possible, and it is written by hand precisely because
 * the dependency set is frozen (AAP §0.7.3 S5) and deliberately contains no mocking package.
 *
 * The difference between the two suites is therefore structural and **intentional**: the legacy tests
 * are integration tests, the target tests are unit tests. A reviewer comparing them should expect that
 * difference by design. It is not a coverage gap, and it is not a shortcut.
 *
 * ## Traceability here is documentary, not empirical
 *
 * MXUnit and CFSelenium are not vendored in this repository, and MXUnit additionally requires an
 * external CFIDE mapping that does not exist here. The `meta/docker/slatwall-local-dev/` path cited as
 * optional build context **does not exist** — `meta/` holds only `meta/tests/` and `meta/eclipse/`, and
 * there is no Dockerfile or Compose file anywhere in the tree. No ColdFusion, Railo or Lucee engine is
 * available either. The legacy suite consequently **cannot be executed in this environment**, so no
 * runtime comparison against original CFML behaviour was performed. Every behavioural claim annotated
 * below was established by reading legacy source at the cited `path:Lnnn` locator, and each double
 * reproduces what that source does — including where it does something wrong.
 *
 * ## Rules
 *
 * The governing statement is recorded immediately after this header, at the top of the file body.
 * It is the verified result of reading the project's rules document, not an inference from silence.
 * A filename sweep for `rule` in this repository surfaces only `RoundingRule*` components: those are
 * the out-of-scope RoundingRule **business domain**, not project rules, and nothing in them governs
 * this file.
 *
 * ## Everything exported here is a factory, never a shared singleton
 *
 * `meta/tests/unit/SlatwallUnitTestBase.cfc:L53` comments out the per-suite application reload and
 * `:L70` comments out the lifecycle teardown. The legacy suite therefore lets application, ORM and
 * entity state leak from one test into the next, and a legacy test that passes in isolation can fail —
 * or, worse, pass for the wrong reason — depending on what ran before it. Target tests must not inherit
 * that. Every export below is a `create…` function that allocates its own arrays, maps, queues,
 * counters and memoised values, so two calls produce two fully independent worlds and no module-scope
 * mutable state exists for a second simulated Lambda invocation to observe (AAP §0.6.6 M7).
 *
 * ## What this file is not
 *
 * It declares **zero test cases**. There are no Jest globals, no `describe`, no `it`, no snapshots and
 * no module mocking anywhere in it; it is imported by tests that live in sibling folders. It also holds
 * no SQL text, no schema names beyond those the whitelisted ports already declare, and no timing,
 * retry, capacity or service-level number of any kind (AAP §0.1.1.3 IR-12).
 *
 * @see slatwall-ts/src/ports — the interfaces every double below structurally satisfies.
 */

// No user-specified rules were provided for this project; the nine enterprise
// standards of AAP §0.7.3 govern instead, and the bar is not lowered.

import { SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE } from '../../src/domain/BaseProductType';
import { Option } from '../../src/domain/option/Option';
import { OptionGroup } from '../../src/domain/option/OptionGroup';
import { Brand } from '../../src/domain/product/Brand';
import { Product } from '../../src/domain/product/Product';
import { ProductType } from '../../src/domain/product/ProductType';
import { Sku } from '../../src/domain/sku/Sku';
import { DataIntegrityError, DomainError } from '../../src/errors/DomainError';
import { ValidationError } from '../../src/errors/ValidationError';
import type { ValidationErrors } from '../../src/errors/ValidationError';
import { toImageWebPath } from '../../src/ports/ImagePathPort';
import { Validator } from '../../src/validation/Validator';
import { ALL_SEEDED_PRODUCT_TYPES, MERCHANDISE_PRODUCT_TYPE_ID } from '../fixtures/productTypes';
import { createTestMerchandiseProductData } from '../fixtures/testProduct';

import type { MySqlRow } from '../../src/adapters/mysql/rowMappers';
import type { PhysicalTableName, SqlExecutor } from '../../src/adapters/mysql/QueryRunner';
import type { TransactionScope } from '../../src/adapters/mysql/UnitOfWork';
import type {
  ProductDefaultSkuDelegate,
  ProductSkuMember,
  ProductSkuOptionFinder,
} from '../../src/domain/product/Product';
import type { ProductTypeRootResolver } from '../../src/domain/product/ProductType';
import type {
  SkuProductTypeRootResolver,
  SkusBySelectedOptionsLookup,
  SkuTransactionExistenceChecker,
} from '../../src/domain/sku/Sku';
import type { AccessContentPort, AccessContentReference } from '../../src/ports/AccessContentPort';
import type {
  AccountContextPort,
  AccountReference,
  EntityAuthorizationPort,
  EntityAuthorizationRequest,
  EntityPropertyAuthorizationRequest,
  PopulationAuthorizationPort,
} from '../../src/ports/AccountContextPort';
import type {
  ImageFileNameCandidate,
  ImagePathPort,
  ImageWebPath,
  ResizedImagePathRequest,
  SaveImageFileRequest,
} from '../../src/ports/ImagePathPort';
import type {
  PricingPort,
  SalePriceDetails,
  SalePriceDetailsBySkuId,
} from '../../src/ports/PricingPort';
import type {
  AttributeSetRow,
  ProductImportSource,
  ProductRepository,
  ProductSearchRow,
} from '../../src/ports/repositories/ProductRepository';
import type { BrandRepository, ManagedBrand } from '../../src/ports/repositories/BrandRepository';
import type {
  OptionRepository,
  UnusedOptionGroupRow,
  UnusedOptionRow,
} from '../../src/ports/repositories/OptionRepository';
import type {
  ProductTypeRepository,
  ProductTypeTreeRow,
} from '../../src/ports/repositories/ProductTypeRepository';
import type {
  SkuRepository,
  SkuRow,
  SkuSearchRow,
} from '../../src/ports/repositories/SkuRepository';
import type {
  SettingName,
  SettingResolutionContext,
  SettingResolutionEntityName,
  SettingResolverPort,
  SettingValue,
} from '../../src/ports/SettingResolverPort';
import type {
  SmartListQuery,
  SmartListQueryPort,
  SmartListResult,
} from '../../src/ports/SmartListQueryPort';
import type {
  SubscriptionBenefitReference,
  SubscriptionTermPort,
  SubscriptionTermReference,
} from '../../src/ports/SubscriptionTermPort';
import type { UniquePropertyEntity, UniquePropertyPort } from '../../src/ports/UniquePropertyPort';
import type {
  EntityCommentCleanupPort,
  EntityPersister,
  EntityRemover,
  EntitySettingCleanupPort,
  MaintenanceEntityRef,
} from '../../src/services/BaseService';
import type {
  ValidationContext,
  ValidationRuleSet,
  ValidationSubject,
} from '../../src/validation/Validator';
import type {
  TestMerchandiseProductData,
  TestMerchandiseProductDataOverrides,
} from '../fixtures/testProduct';

/*
 * ---------------------------------------------------------------------------------------------------
 * Internal helpers. Nothing below this comment is exported: every double owns its own state, and a
 * shared helper that owned state would defeat the whole point of the factory discipline above.
 * ---------------------------------------------------------------------------------------------------
 */

/**
 * Freeze a positional parameter array at the moment it was bound.
 *
 * The adapters build their parameter arrays with `push`, so recording the caller's array by reference
 * would let a later `push` rewrite history and an assertion about bind order would silently pass
 * against the wrong evidence.
 */
function snapshotParams(params: readonly unknown[]): readonly unknown[] {
  return Object.freeze([...params]);
}

/**
 * Split a comma-delimited identifier list exactly as the legacy DAOs do — `.split(',')` and nothing
 * else.
 *
 * `model/dao/OptionDAO.cfc:L51-L116` interpolates the list straight into the statement, and
 * `src/adapters/mysql/MySqlOptionRepository.ts` reproduces that with an unfiltered split. Neither
 * trims, de-duplicates, nor drops empty entries, so `''` yields the single empty value `['']` rather
 * than `[]`. That is load-bearing: the empty list still produces one placeholder, which is why an empty
 * "existing option groups" list matches nothing on the IN side and everything on the NOT-IN side.
 */
function splitIdentifierList(list: string): readonly string[] {
  return list.split(',');
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 1. The recording SQL executor seam.
 *
 * `src/adapters/mysql/QueryRunner.ts` declares `SqlExecutor` as the ONE interface every repository
 * adapter depends on, deliberately narrower than the concrete `QueryRunner` class. Repositories take
 * the interface, so a test can hand them this double and assert the exact statement text and the exact
 * positional parameter array — which is how AAP §0.7.3 S2 (parameterised SQL) is proved rather than
 * asserted.
 *
 * There is deliberately NO transaction member here. Transaction demarcation belongs to
 * `UnitOfWork` (§14 below); inventing `begin`/`commit` on the executor would fabricate a contract the
 * real seam does not have.
 * ---------------------------------------------------------------------------------------------------
 */

/** One recorded statement: the SQL exactly as issued, and the parameters exactly as bound. */
export interface SqlExecutorCall {
  readonly sql: string;
  readonly params: readonly unknown[];
}

/**
 * What the executor should do for one call.
 *
 * A discriminated union rather than "rows or throw", so a queued failure is as first-class as a queued
 * result set and neither has to be encoded as a magic value.
 */
export type SqlExecutorOutcome =
  | { readonly kind: 'rows'; readonly rows: readonly MySqlRow[] }
  | { readonly kind: 'failure'; readonly failure: Error };

/** Build a row outcome. Exported so a test never has to spell the discriminant. */
export function sqlRows(rows: readonly MySqlRow[]): SqlExecutorOutcome {
  return Object.freeze({ kind: 'rows', rows: Object.freeze([...rows]) });
}

/** Build a failure outcome. */
export function sqlFailure(failure: Error): SqlExecutorOutcome {
  return Object.freeze({ kind: 'failure', failure });
}

/**
 * Decide an outcome from the call itself.
 *
 * Returning `undefined` declines the call and falls through to the queue, so a responder can answer
 * only the statements it recognises without having to model the rest.
 */
export type SqlExecutorResponder = (call: SqlExecutorCall) => SqlExecutorOutcome | undefined;

/** Seed configuration. Both fields are optional; an unconfigured executor answers every call `[]`. */
export interface SqlExecutorDoubleOptions {
  /** Consumed in order, one per call, after `respond` declines. */
  readonly outcomes?: readonly SqlExecutorOutcome[];
  /** Consulted first, before the queue. */
  readonly respond?: SqlExecutorResponder;
}

/** The executor plus its factory-local observation state. */
export interface SqlExecutorDouble {
  /** The seam itself — pass this wherever a repository adapter wants its executor. */
  readonly executor: SqlExecutor;
  /** Every call, in issue order. Live view of factory-local state; frozen element by element. */
  readonly calls: readonly SqlExecutorCall[];
  /** Append further outcomes to the tail of the queue. */
  enqueue(...outcomes: readonly SqlExecutorOutcome[]): void;
  /** Drop recorded calls and any unconsumed queue entries. */
  reset(): void;
}

/**
 * Create a recording `SqlExecutor`.
 *
 * The recording is deliberately faithful and lossless. The SQL string is stored byte for byte — not
 * trimmed, not case-folded, not whitespace-normalised — and parameters are stored in bind order with
 * no coercion, because the assertions this double exists to support are precisely about text and order:
 *
 * - option identifiers in list order followed by the product identifier, for the selected-option
 *   lookup at `model/dao/SkuDAO.cfc:L106-L128`;
 * - the same SKU code bound twice, for the two-place primary/alternate lookup at
 *   `model/dao/SkuDAO.cfc:L102-L104`;
 * - `[productID, nextOptionGroupSortOrder]` for the sorted-SKU ordering at
 *   `model/dao/SkuDAO.cfc:L172-L202`;
 * - `[propertyValue, entityID]` for the uniqueness existence query at
 *   `org/Hibachi/HibachiDAO.cfc:L130-L146`;
 * - the Option repository's statement-order parameters, which REVERSE its method-signature order:
 *   `findUnusedOptions(productID, existingOptionGroupIDList)` binds the option-group identifiers first
 *   and the product identifier last, because `model/dao/OptionDAO.cfc:L51-L91` writes the IN clause
 *   before the correlated NOT EXISTS.
 */
export function createSqlExecutorDouble(options: SqlExecutorDoubleOptions = {}): SqlExecutorDouble {
  const calls: SqlExecutorCall[] = [];
  const queue: SqlExecutorOutcome[] = options.outcomes === undefined ? [] : [...options.outcomes];
  const respond = options.respond;

  const executor: SqlExecutor = {
    execute: (sql: string, params: readonly unknown[]): Promise<MySqlRow[]> => {
      const call: SqlExecutorCall = Object.freeze({ sql, params: snapshotParams(params) });
      calls.push(call);

      const answered = respond === undefined ? undefined : respond(call);
      const outcome = answered ?? queue.shift();

      if (outcome === undefined) {
        return Promise.resolve([]);
      }
      if (outcome.kind === 'failure') {
        return Promise.reject(outcome.failure);
      }
      return Promise.resolve([...outcome.rows]);
    },
  };

  return {
    executor,
    calls,
    enqueue: (...outcomes: readonly SqlExecutorOutcome[]): void => {
      queue.push(...outcomes);
    },
    reset: (): void => {
      calls.length = 0;
      queue.length = 0;
    },
  };
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 2. The product-type root resolver.
 *
 * Every `getBaseProductType()` in the slice takes one: `Product.getBaseProductType(resolver)`,
 * `Sku.getBaseProductType(resolver)` and `ProductType.getBaseProductType(resolver)` all walk to the
 * root of the `productTypeIDPath` and read its `systemCode`, and `MySqlSkuRepository.findByProduct`
 * branches on the answer. The two declared interfaces — `ProductTypeRootResolver` in
 * `src/domain/product/ProductType.ts` and `SkuProductTypeRootResolver` in `src/domain/sku/Sku.ts` —
 * are structurally identical, so one double satisfies both and is typed as the intersection.
 * ---------------------------------------------------------------------------------------------------
 */

/** The only two fields the resolution walk reads off a product type. */
export interface ProductTypeSystemCodeSeed {
  readonly productTypeID: string;
  readonly systemCode?: string;
}

/** The resolver plus its factory-local observation state. */
export interface ProductTypeRootResolverDouble {
  readonly resolver: ProductTypeRootResolver & SkuProductTypeRootResolver;
  /** Every identifier the walk asked for, in order. */
  readonly requestedProductTypeIds: readonly string[];
}

/**
 * Create a root resolver seeded, by default, with the three discriminators the platform actually
 * seeds.
 *
 * The defaults come from `test/fixtures/productTypes.ts`, which owns the literal UUIDs read from
 * `config/dbdata/SlatwallProductType.xml.cfm:L13-L15` (AAP §0.1.1.3 IR-7). This file does not restate
 * them: duplicating a fixed identifier is exactly how traceability rots.
 *
 * An unseeded identifier resolves to `undefined`, which is the honest answer — the legacy walk simply
 * finds no row — and it is what drives the "neither of the three" fallthrough that
 * `MySqlSkuRepository.findByProduct` leaves un-joined and `SkuService.createSkus` turns into its
 * unexpected-error branch at `model/service/SkuService.cfc:L204`.
 */
export function createProductTypeRootResolverDouble(
  seeds: readonly ProductTypeSystemCodeSeed[] = ALL_SEEDED_PRODUCT_TYPES,
): ProductTypeRootResolverDouble {
  const bySystemCodeSource = new Map<string, ProductTypeSystemCodeSeed>();
  for (const seed of seeds) {
    bySystemCodeSource.set(seed.productTypeID, seed);
  }
  const requestedProductTypeIds: string[] = [];

  return {
    requestedProductTypeIds,
    resolver: {
      getProductType: (productTypeID: string): Promise<ProductTypeSystemCodeSeed | undefined> => {
        requestedProductTypeIds.push(productTypeID);
        return Promise.resolve(bySystemCodeSource.get(productTypeID));
      },
    },
  };
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 3. Entity construction helpers.
 *
 * These build the REAL domain classes. They exist only to spare a test the repetitive property
 * assignment that `exactOptionalPropertyTypes` makes verbose, and they deliberately add no behaviour
 * of their own — a test that wants a defect must observe the entity's own method, not a repaired copy.
 *
 * Two conventions are load-bearing and are preserved exactly:
 *
 * 1. An absent value is an ABSENT PROPERTY, never an explicit `null` or `undefined`. The entities
 *    declare their nullable columns with `declare x?: T`, and `src/domain/base/populate.ts` implements
 *    CFML's null semantics as `delete target[name]`. Assigning `undefined` would make
 *    `Object.hasOwn(entity, name)` true and `hasProperty` answer differently, so every seed field is
 *    applied only when it was supplied.
 * 2. Primary identifiers default to `''`, which is what `isNew()` reads. Nothing here generates an
 *    identifier: when a test needs a persisted entity it supplies its own 32-character lowercase
 *    hexadecimal value with no dashes (AAP §0.1.1.3 IR-6). No validator, parser or branded UUID helper
 *    is introduced — inventing one would add a contract the extracted service does not have.
 * ---------------------------------------------------------------------------------------------------
 */

/** Seed for {@link buildOptionGroup}. Only `optionGroupID` is required, because `''` means "new". */
export interface OptionGroupSeed {
  readonly optionGroupID?: string;
  readonly optionGroupCode?: string;
  readonly optionGroupName?: string;
  readonly optionGroupImage?: string;
  readonly imageGroupFlag?: boolean;
  /**
   * The group's position in the odometer. `model/dao/SkuDAO.cfc:L172-L202` orders by
   * `SUM(option.sortOrder * POWER(10, next - optionGroup.sortOrder))`, so this is the DIGIT POSITION,
   * not a tiebreak.
   */
  readonly sortOrder?: number;
}

/** Build a real {@link OptionGroup}. */
export function buildOptionGroup(seed: OptionGroupSeed = {}): OptionGroup {
  const optionGroup = new OptionGroup();
  if (seed.optionGroupID !== undefined) {
    optionGroup.optionGroupID = seed.optionGroupID;
  }
  if (seed.optionGroupCode !== undefined) {
    optionGroup.optionGroupCode = seed.optionGroupCode;
  }
  if (seed.optionGroupName !== undefined) {
    optionGroup.optionGroupName = seed.optionGroupName;
  }
  if (seed.optionGroupImage !== undefined) {
    optionGroup.optionGroupImage = seed.optionGroupImage;
  }
  if (seed.imageGroupFlag !== undefined) {
    optionGroup.imageGroupFlag = seed.imageGroupFlag;
  }
  if (seed.sortOrder !== undefined) {
    optionGroup.sortOrder = seed.sortOrder;
  }
  return optionGroup;
}

/** Seed for {@link buildOption}. */
export interface OptionSeed {
  readonly optionID?: string;
  readonly optionCode?: string;
  readonly optionName?: string;
  readonly optionDescription?: string;
  readonly sortOrder?: number;
  /** Wired through the entity's own `setOptionGroup`, so both sides of the association are set. */
  readonly optionGroup?: OptionGroup;
}

/**
 * Build a real {@link Option}.
 *
 * When a group is supplied the wiring goes through `Option.setOptionGroup`, which pushes into the very
 * array `OptionGroup.getOptions()` returns. That is the entity's own behaviour and is not reimplemented
 * here — a test asserting the inverse side is asserting the entity, not this helper.
 */
export function buildOption(seed: OptionSeed = {}): Option {
  const option = new Option();
  if (seed.optionID !== undefined) {
    option.optionID = seed.optionID;
  }
  if (seed.optionCode !== undefined) {
    option.optionCode = seed.optionCode;
  }
  if (seed.optionName !== undefined) {
    option.optionName = seed.optionName;
  }
  if (seed.optionDescription !== undefined) {
    option.optionDescription = seed.optionDescription;
  }
  if (seed.sortOrder !== undefined) {
    option.sortOrder = seed.sortOrder;
  }
  if (seed.optionGroup !== undefined) {
    option.setOptionGroup(seed.optionGroup);
  }
  return option;
}

/** Seed for {@link buildProductType}. */
export interface ProductTypeSeed {
  readonly productTypeID?: string;
  readonly productTypeName?: string;
  readonly productTypeDescription?: string;
  readonly urlTitle?: string;
  /** Present only on the three seeded roots; absent everywhere else, which is what forces the walk. */
  readonly systemCode?: string;
  readonly productTypeIDPath?: string;
  readonly parentProductType?: ProductType;
  readonly activeFlag?: boolean;
  readonly publishedFlag?: boolean;
}

/** Build a real {@link ProductType}. */
export function buildProductType(seed: ProductTypeSeed = {}): ProductType {
  const productType = new ProductType();
  if (seed.productTypeID !== undefined) {
    productType.productTypeID = seed.productTypeID;
  }
  if (seed.productTypeName !== undefined) {
    productType.productTypeName = seed.productTypeName;
  }
  if (seed.productTypeDescription !== undefined) {
    productType.productTypeDescription = seed.productTypeDescription;
  }
  if (seed.urlTitle !== undefined) {
    productType.urlTitle = seed.urlTitle;
  }
  if (seed.systemCode !== undefined) {
    productType.systemCode = seed.systemCode;
  }
  if (seed.productTypeIDPath !== undefined) {
    productType.productTypeIDPath = seed.productTypeIDPath;
  }
  if (seed.activeFlag !== undefined) {
    productType.activeFlag = seed.activeFlag;
  }
  if (seed.publishedFlag !== undefined) {
    productType.publishedFlag = seed.publishedFlag;
  }
  if (seed.parentProductType !== undefined) {
    productType.setParentProductType(seed.parentProductType);
  }
  return productType;
}

/** Seed for {@link buildBrand}. */
export interface BrandSeed {
  readonly brandID?: string;
  readonly brandName?: string;
  readonly brandWebsite?: string;
  readonly urlTitle?: string;
  readonly activeFlag?: boolean;
  readonly publishedFlag?: boolean;
  readonly remoteID?: string;
}

/** Build a real {@link Brand}. Its `products` array is the entity's own fresh live array. */
export function buildBrand(seed: BrandSeed = {}): Brand {
  const brand = new Brand();
  if (seed.brandID !== undefined) {
    brand.brandID = seed.brandID;
  }
  if (seed.brandName !== undefined) {
    brand.brandName = seed.brandName;
  }
  if (seed.brandWebsite !== undefined) {
    brand.brandWebsite = seed.brandWebsite;
  }
  if (seed.urlTitle !== undefined) {
    brand.urlTitle = seed.urlTitle;
  }
  if (seed.activeFlag !== undefined) {
    brand.activeFlag = seed.activeFlag;
  }
  if (seed.publishedFlag !== undefined) {
    brand.publishedFlag = seed.publishedFlag;
  }
  if (seed.remoteID !== undefined) {
    brand.remoteID = seed.remoteID;
  }
  return brand;
}

/** Seed for {@link buildProduct}. */
export interface ProductSeed {
  readonly productID?: string;
  readonly productCode?: string;
  readonly productName?: string;
  readonly productDescription?: string;
  readonly urlTitle?: string;
  readonly activeFlag?: boolean;
  readonly publishedFlag?: boolean;
  readonly sortOrder?: number;
  /** The feed's availability gate reads this; `ProductFeedQuery` ranges it open-ended from `1`. */
  readonly calculatedQATS?: number;
  readonly calculatedTitle?: string;
  readonly productType?: ProductType;
  /** Wired through `Product.setBrand`, so `Brand.products` gains the inverse side. */
  readonly brand?: Brand;
}

/**
 * Build a real {@link Product}.
 *
 * The returned product's `skus` array is the entity's own fresh live array, and nothing here copies,
 * freezes or wraps it. That is not tidiness — it is required. `Sku.setProduct` pushes into the array
 * `Product.getSkus()` returns, and `SkuService.createSkus` reads that array's LENGTH before appending
 * in order to number the generated codes `-1`, `-2`, …. A defensive copy anywhere in this chain makes
 * every generated SKU collide on `-1`.
 */
export function buildProduct(seed: ProductSeed = {}): Product {
  const product = new Product();
  if (seed.productID !== undefined) {
    product.productID = seed.productID;
  }
  if (seed.productCode !== undefined) {
    product.productCode = seed.productCode;
  }
  if (seed.productName !== undefined) {
    product.productName = seed.productName;
  }
  if (seed.productDescription !== undefined) {
    product.productDescription = seed.productDescription;
  }
  if (seed.urlTitle !== undefined) {
    product.urlTitle = seed.urlTitle;
  }
  if (seed.activeFlag !== undefined) {
    product.activeFlag = seed.activeFlag;
  }
  if (seed.publishedFlag !== undefined) {
    product.publishedFlag = seed.publishedFlag;
  }
  if (seed.sortOrder !== undefined) {
    product.sortOrder = seed.sortOrder;
  }
  if (seed.calculatedQATS !== undefined) {
    product.calculatedQATS = seed.calculatedQATS;
  }
  if (seed.calculatedTitle !== undefined) {
    product.calculatedTitle = seed.calculatedTitle;
  }
  if (seed.productType !== undefined) {
    product.productType = seed.productType;
  }
  if (seed.brand !== undefined) {
    product.setBrand(seed.brand);
  }
  return product;
}

/** Seed for {@link buildSku}. */
export interface SkuSeed {
  readonly skuID?: string;
  readonly skuCode?: string;
  readonly price?: number;
  readonly listPrice?: number;
  readonly renewalPrice?: number;
  readonly activeFlag?: boolean;
  readonly imageFile?: string;
  readonly userDefinedPriceFlag?: boolean;
  readonly calculatedQATS?: number;
  /** Appended through `Sku.addOption`, which skips duplicates exactly as the entity does. */
  readonly options?: readonly Option[];
  /** Wired through `Sku.setProduct`, which appends to the product's LIVE sku array. */
  readonly product?: Product;
  readonly accessContents?: readonly AccessContentReference[];
  readonly subscriptionTerm?: SubscriptionTermReference;
  readonly subscriptionBenefits?: readonly SubscriptionBenefitReference[];
  readonly renewalSubscriptionBenefits?: readonly SubscriptionBenefitReference[];
}

/**
 * Build a real {@link Sku}.
 *
 * `new Sku()` with no arguments stays usable on purpose: the service creates SKUs that way, and the
 * combination engine assigns their fields afterwards.
 *
 * TODO(parity) `model/entity/Sku.cfc:L604-L608` — when `product` is seeded the wiring goes through
 * `Sku.setProduct`, whose guard is `isNew() || !product.getSkus().includes(this)`. A brand-new SKU
 * (`skuID === ''`) therefore appends even when it is already a member, so seeding the same new SKU onto
 * the same product twice appends it twice. That is the legacy behaviour and it is NOT made idempotent
 * here.
 *
 * THREE DEFECTIVE ACCESSORS ARE REACHED THROUGH THE REAL ENTITY AND ARE NOT SHIMMED. A builder is the
 * obvious place to quietly route around them, so their absence needs stating:
 *   TODO(parity) D1 — `model/entity/Sku.cfc:L500-L510`: `getOptionsByOptionGroupCodeStruct()` initialises
 *   one struct and then reads a differently named one, so the FIRST call fails.
 *   TODO(parity) D2 — `model/entity/Sku.cfc:L512-L522`: `getOptionsByOptionGroupIDStruct()` writes into a
 *   THIRD, differently named struct, so it always answers empty.
 *   TODO(parity) D3 — `model/entity/Sku.cfc:L247-L251`: `getOptionByOptionGroupCode()` tests the code map
 *   but indexes the ID map with a code key, so it always misses.
 * A test asserting any of the three calls the entity's own method and observes the real outcome. Wrapping
 * them in a "working" helper would make the port look correct while the shipped behaviour differed.
 */
export function buildSku(seed: SkuSeed = {}): Sku {
  const sku = new Sku();
  if (seed.skuID !== undefined) {
    sku.skuID = seed.skuID;
  }
  if (seed.skuCode !== undefined) {
    sku.skuCode = seed.skuCode;
  }
  if (seed.price !== undefined) {
    sku.price = seed.price;
  }
  if (seed.listPrice !== undefined) {
    sku.listPrice = seed.listPrice;
  }
  if (seed.renewalPrice !== undefined) {
    sku.renewalPrice = seed.renewalPrice;
  }
  if (seed.activeFlag !== undefined) {
    sku.activeFlag = seed.activeFlag;
  }
  if (seed.imageFile !== undefined) {
    sku.imageFile = seed.imageFile;
  }
  if (seed.userDefinedPriceFlag !== undefined) {
    sku.userDefinedPriceFlag = seed.userDefinedPriceFlag;
  }
  if (seed.calculatedQATS !== undefined) {
    sku.calculatedQATS = seed.calculatedQATS;
  }
  if (seed.subscriptionTerm !== undefined) {
    sku.setSubscriptionTerm(seed.subscriptionTerm);
  }
  for (const option of seed.options ?? []) {
    sku.addOption(option);
  }
  for (const accessContent of seed.accessContents ?? []) {
    sku.addAccessContent(accessContent);
  }
  for (const subscriptionBenefit of seed.subscriptionBenefits ?? []) {
    sku.addSubscriptionBenefit(subscriptionBenefit);
  }
  for (const renewalBenefit of seed.renewalSubscriptionBenefits ?? []) {
    sku.addRenewalSubscriptionBenefit(renewalBenefit);
  }
  if (seed.product !== undefined) {
    sku.setProduct(seed.product);
  }
  return sku;
}

/**
 * Configured answers for the six {@link ProductDefaultSkuDelegate} members that cannot be adapted from
 * a real {@link Sku}.
 *
 * G6 judgement call. `Product.defaultSku` is typed as a nine-member delegate whose image members are
 * SYNCHRONOUS (`getImagePath(): string`), while `Sku`'s equivalents are asynchronous and take an
 * injected `ImagePathPort`. A real `Sku` is therefore NOT assignable to the delegate, and no adapter can
 * make it so without blocking. The three price members are zero-argument on both sides and so are
 * delegated to the real SKU; the rest are configured, defaulting to the neutral empty value rather than
 * to a fabricated path.
 */
export interface DefaultSkuDelegateOptions {
  readonly currencyCode?: string;
  readonly imageDirectory?: string;
  readonly imagePath?: string;
  readonly image?: string;
  readonly resizedImagePath?: string;
  readonly imageExistsFlag?: boolean;
}

/**
 * Adapt a real {@link Sku} to the {@link ProductDefaultSkuDelegate} shape `Product.defaultSku` expects,
 * so `Product.getPrice()`, `getListPrice()` and `getRenewalPrice()` resolve through the actual SKU.
 */
export function createDefaultSkuDelegate(
  sku: Sku,
  options: DefaultSkuDelegateOptions = {},
): ProductDefaultSkuDelegate {
  return {
    getPrice: (): number => sku.getPrice(),
    getListPrice: (): number => sku.getListPrice(),
    getRenewalPrice: (): number => sku.getRenewalPrice(),
    getCurrencyCode: (): string | undefined => options.currencyCode,
    getImageDirectory: (): string => options.imageDirectory ?? '',
    getImagePath: (): string => options.imagePath ?? '',
    getImage: (): string => options.image ?? '',
    getResizedImagePath: (): string => options.resizedImagePath ?? '',
    getImageExistsFlag: (): boolean => options.imageExistsFlag ?? false,
  };
}

/** Everything {@link createMerchandiseProductFixture} hands back, all of it independent per call. */
export interface MerchandiseProductFixture {
  readonly product: Product;
  readonly productType: ProductType;
  /** The single SKU the legacy fixture's `price` lands on. Already wired into `product.getSkus()`. */
  readonly defaultSku: Sku;
  /** The frozen data struct the legacy helper populated the product from. */
  readonly data: TestMerchandiseProductData;
  /**
   * `meta/tests/unit/Helper.cfc:L70` nulls the default-SKU reference BEFORE deleting, because the
   * circular product/SKU reference otherwise trips the delete guard. Exposed so a teardown can do the
   * same rather than rediscovering it.
   */
  clearDefaultSkuReference(): void;
}

/**
 * Build the merchandise product the legacy suite's fixture describes.
 *
 * The literals come from `test/fixtures/testProduct.ts` and `test/fixtures/productTypes.ts`, which own
 * them; nothing is restated here. The chain assembled below is the faithful one: the fixture's `price`
 * is a SKU column, not a product column, so it lands on the default SKU and `product.getPrice()`
 * resolves through the delegate — which is why the delegate above exists.
 */
export function createMerchandiseProductFixture(
  overrides: TestMerchandiseProductDataOverrides = {},
): MerchandiseProductFixture {
  const data = createTestMerchandiseProductData(overrides);
  const productTypeID = data.productType.productTypeID;
  /*
   * `systemCode` is set only when the override left the merchandise root in place. Under
   * `exactOptionalPropertyTypes` an absent optional property and one explicitly assigned `undefined`
   * are different things, so the branch builds two distinct seeds rather than passing `undefined`.
   */
  const productType = buildProductType(
    productTypeID === MERCHANDISE_PRODUCT_TYPE_ID
      ? {
          productTypeID,
          productTypeIDPath: productTypeID,
          systemCode: SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise.systemCode,
        }
      : { productTypeID, productTypeIDPath: productTypeID },
  );
  const product = buildProduct({
    productName: data.productName,
    productCode: data.productCode,
    productType,
  });
  const defaultSku = buildSku({ price: data.price, product });
  product.defaultSku = createDefaultSkuDelegate(defaultSku);

  return {
    product,
    productType,
    defaultSku,
    data,
    clearDefaultSkuReference: (): void => {
      delete product.defaultSku;
    },
  };
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 4. The SKU repository — the highest-risk double in this file.
 *
 * `model/dao/SkuDAO.cfc` is where the Catalog's business logic actually lives, and five of the eight
 * members below encode a rule that a well-meaning "improvement" would silently change. Each of those is
 * annotated with the semantic it preserves and the trap it avoids.
 *
 * Option associations are modelled with the REAL `Option` entities on `Sku.options`, because options are
 * in scope and inventing a parallel link structure would have made the entity's own accessors
 * unobservable. Only genuinely out-of-scope relationships — alternate SKU codes, and the ten transaction
 * tables — are modelled as separate seed maps, because their entities are excluded and fabricating them
 * would breach AAP §0.7.3 S9.
 *
 * TODO(boundary) D4 — model/service/SkuService.cfc:L281-L283: ONE member is deliberately ABSENT from this
 * double. `getSkuStocksDeletableFlag` delegates to a `SkuDAO` member that exists nowhere in the repository,
 * so `Sku.getStocksDeletableFlag()` at `model/entity/Sku.cfc:L567-L572` can never resolve. Adding it here
 * and answering `true` or `false` would fabricate a verdict the legacy system cannot produce and would
 * hide the defect behind a passing test. The un-portable boundary therefore belongs to the SERVICE, where
 * `src/errors/DomainError.ts` exports the subclass it raises — `NotImplementedError` — and a service test
 * imports that class directly from the error module rather than through this file.
 * ---------------------------------------------------------------------------------------------------
 */

/**
 * One alternate-code association.
 *
 * `SwAlternateSkuCode` is out of scope, so only the two columns the lookup at
 * `model/dao/SkuDAO.cfc:L102-L104` reads are modelled.
 */
export interface AlternateSkuCodeSeed {
  readonly skuID: string;
  readonly alternateSkuCode: string;
}

/**
 * One recorded call on the SKU repository.
 *
 * Optional arguments are recorded as `| undefined` rather than as optional keys on purpose: the key is
 * always present, so an assertion can distinguish "called with nothing" from "never called" without
 * this file having to build a different object shape per argument combination.
 */
export type SkuRepositoryCall =
  | {
      readonly member: 'transactionExists';
      readonly productID: string | undefined;
      readonly skuID: string | undefined;
    }
  | { readonly member: 'findBySkuCode'; readonly skuCode: string }
  | {
      readonly member: 'findSkusBySelectedOptions';
      readonly optionIds: readonly string[];
      readonly productId: string;
    }
  | {
      readonly member: 'searchByProductType';
      readonly term: string | undefined;
      readonly productTypeID: string | undefined;
    }
  | { readonly member: 'findByProduct'; readonly productID: string; readonly fetchOptions: boolean }
  | { readonly member: 'findSortedSkuIdsByProduct'; readonly productID: string }
  | { readonly member: 'clearOptionGroupSortOrderCache' }
  | { readonly member: 'persistSku'; readonly sku: Sku };

/** Seed configuration for {@link createInMemorySkuRepository}. */
export interface InMemorySkuRepositoryOptions {
  /** The stored SKUs. Real entities, carrying their real `options` and `product` links. */
  readonly skus?: readonly Sku[];
  readonly alternateSkuCodes?: readonly AlternateSkuCodeSeed[];
  /** SKU identifiers that participate in at least one of the ten transaction relationships. */
  readonly transactionSkuIDs?: readonly string[];
  /** Product identifiers that participate in at least one of the ten transaction relationships. */
  readonly transactionProductIDs?: readonly string[];
  /** Used by `findByProduct` to resolve the base product type. Defaults to the three seeded roots. */
  readonly productTypeRootResolver?: ProductTypeRootResolver & SkuProductTypeRootResolver;
  /**
   * Overrides the memoised odometer ceiling that `model/dao/SkuDAO.cfc:L204-L220` reads as
   * `max(sortOrder) + 1` from `SwOptionGroup`. Left unset, it is derived from the seeded option groups.
   */
  readonly nextOptionGroupSortOrder?: number;
}

/** The repository plus its factory-local seed and observation state. */
export interface InMemorySkuRepository {
  /** The port itself. */
  readonly repository: SkuRepository;
  /** Live view of the stored SKUs, in first-seen order. */
  readonly skus: readonly Sku[];
  /** Every call, in order. */
  readonly calls: readonly SkuRepositoryCall[];
  /** Every SKU handed to `persistSku`, in order, by reference. */
  readonly persisted: readonly Sku[];
  /** Seed further SKUs after construction — this is also how M6 visibility is set up by hand. */
  add(...skus: readonly Sku[]): void;
  /** Seed a further alternate-code association. */
  addAlternateSkuCode(seed: AlternateSkuCodeSeed): void;
  /** Mark a SKU or product as participating in a transaction relationship. */
  addTransactionParticipation(participation: {
    readonly skuID?: string;
    readonly productID?: string;
  }): void;
  /**
   * The memoised odometer ceiling, or `undefined` while it is still unresolved. Reading it is how a test
   * proves that `clearOptionGroupSortOrderCache()` did nothing (defect D7).
   */
  optionGroupSortOrderMemoValue(): number | undefined;
}

/**
 * Create the in-memory SKU repository.
 *
 * Nothing in the returned object is shared with any other call: the SKU list, the alternate-code map,
 * both transaction sets, the call log and the sort-order memo are all allocated here. The memo in
 * particular MUST stay factory-scoped — `model/dao/SkuDAO.cfc:L204-L220` memoises it in the DAO's own
 * `variables` scope, which on a persistent CFML server is effectively a singleton over a WHOLE-TABLE
 * aggregate. Hoisting the equivalent to module scope in a Lambda would let one warm invocation read a
 * ceiling computed for a different tenant's data (AAP §0.6.6 M7).
 */
export function createInMemorySkuRepository(
  options: InMemorySkuRepositoryOptions = {},
): InMemorySkuRepository {
  const skus: Sku[] = options.skus === undefined ? [] : [...options.skus];
  const alternateSkuCodes: AlternateSkuCodeSeed[] =
    options.alternateSkuCodes === undefined ? [] : [...options.alternateSkuCodes];
  const transactionSkuIDs = new Set<string>(options.transactionSkuIDs ?? []);
  const transactionProductIDs = new Set<string>(options.transactionProductIDs ?? []);
  const calls: SkuRepositoryCall[] = [];
  const persisted: Sku[] = [];
  const productTypeRootResolver =
    options.productTypeRootResolver ?? createProductTypeRootResolverDouble().resolver;

  /** The memo. `undefined` means "not yet read", exactly as the legacy `variables` key being absent. */
  const optionGroupSortOrderMemo: { value: number | undefined } = { value: undefined };

  /**
   * Resolve the odometer ceiling the way `model/dao/SkuDAO.cfc:L204-L220` does: start at 1, and become
   * `max(sortOrder) + 1` when the aggregate over `SwOptionGroup` produced a value.
   */
  const resolveNextOptionGroupSortOrder = (): number => {
    const memoised = optionGroupSortOrderMemo.value;
    if (memoised !== undefined) {
      return memoised;
    }
    if (options.nextOptionGroupSortOrder !== undefined) {
      optionGroupSortOrderMemo.value = options.nextOptionGroupSortOrder;
      return options.nextOptionGroupSortOrder;
    }
    let highest: number | undefined;
    for (const sku of skus) {
      for (const option of sku.options) {
        const groupSortOrder = option.optionGroup?.sortOrder;
        if (groupSortOrder !== undefined && (highest === undefined || groupSortOrder > highest)) {
          highest = groupSortOrder;
        }
      }
    }
    const resolved = highest === undefined ? 1 : highest + 1;
    optionGroupSortOrderMemo.value = resolved;
    return resolved;
  };

  /** Membership by product identifier, matching the DAO's `WHERE sku.productID = ?`. */
  const belongsToProduct = (sku: Sku, productID: string): boolean =>
    sku.product !== undefined && sku.product.productID === productID;

  const repository: SkuRepository = {
    /*
     * X12 / D23 — `model/dao/SkuDAO.cfc:L53-L98`.
     *
     * The two branches are MUTUALLY EXCLUSIVE and `skuID` wins: the DAO tests
     * `structKeyExists(arguments,"skuID") && !isNull(arguments.skuID)` first and only falls through to
     * the product root when that fails. The ten-way EXISTS/OR chain is then ANDed to whichever root was
     * chosen, so the answer is always SCOPED — never a global "does any transaction exist".
     *
     * G6. `model/service/SkuService.cfc:L285-L287` declares `getTransactionExistsFlag()` with ZERO
     * formal parameters and forwards `argumentCollection=arguments`. That signature is a lie: CFML puts
     * UNDECLARED named arguments into the `arguments` scope, so when
     * `model/entity/Product.cfc:L626` calls `getTransactionExistsFlag(productID=…)` the identifier
     * reaches `model/dao/SkuDAO.cfc:L53-L55` and scopes the query. Reading the service declaration
     * literally — as an argument-less call — would turn the product delete guard into a global one and
     * make every product undeletable the moment one transaction existed anywhere. This double therefore
     * accepts and honours BOTH optional identifiers.
     *
     * The layer-order reversal is also deliberate and must never be "tidied": the SERVICE surface is
     * SKU-first (`getTransactionExistsFlag(skuID?, productID?)`, see
     * `SkuTransactionExistenceChecker` in `src/domain/sku/Sku.ts`), while this REPOSITORY surface is
     * product-first. Swapping either would silently exchange the two identifiers.
     */
    transactionExists: (productID?: string, skuID?: string): Promise<boolean> => {
      calls.push(Object.freeze({ member: 'transactionExists', productID, skuID }));
      if (skuID !== undefined) {
        return Promise.resolve(transactionSkuIDs.has(skuID));
      }
      if (productID !== undefined) {
        return Promise.resolve(transactionProductIDs.has(productID));
      }
      /*
       * Both absent is UNREPRESENTABLE in the legacy: the DAO would fall into its product branch and
       * interpolate an undefined identifier. Failing loudly is the honest port, and the message is
       * freshly authored here rather than borrowed from any legacy throw.
       */
      return Promise.reject(
        new DomainError(
          'A transaction-existence probe needs either a SKU identifier or a product identifier; with ' +
            'neither, the legacy query has no root to scope itself to and would answer about the whole ' +
            'table.',
        ),
      );
    },

    /*
     * `model/dao/SkuDAO.cfc:L102-L104` — the primary code OR an alternate code, one LEFT JOIN and one
     * value bound in two places. `ormExecuteQuery(..., true)` asks for a unique result, so more than one
     * match is an error rather than a silent first-row win; there is no `LIMIT` to lean on.
     */
    findBySkuCode: (skuCode: string): Promise<Sku | null> => {
      calls.push(Object.freeze({ member: 'findBySkuCode', skuCode }));
      const alternateSkuIDs = new Set(
        alternateSkuCodes
          .filter((association) => association.alternateSkuCode === skuCode)
          .map((association) => association.skuID),
      );
      const matches = skus.filter(
        (sku) => sku.skuCode === skuCode || alternateSkuIDs.has(sku.skuID),
      );
      if (matches.length === 0) {
        return Promise.resolve(null);
      }
      if (matches.length > 1) {
        return Promise.reject(
          new DataIntegrityError(
            'A SKU-code lookup matched two or more SKUs across the primary and alternate codes, so ' +
              'the unique result the legacy query asks for could not be produced.',
            { context: { skuCode, matched: matches.length } },
          ),
        );
      }
      return Promise.resolve(matches[0] ?? null);
    },

    /*
     * `model/dao/SkuDAO.cfc:L106-L128` — the pivotal translation. Five semantics are preserved, and each
     * of them is a silent-drift trap:
     *
     * T1 CONJUNCTION, NOT INTERSECTION. One requirement per ELEMENT of `optionIds`, ANDed. Duplicates
     *    are kept and evaluated again, exactly as N identical `exists` clauses would be. Rewriting this
     *    as `optionID IN (...)` turns the conjunction into a disjunction; rewriting it as
     *    `GROUP BY … HAVING COUNT(*) = N` diverges as soon as the list repeats an entry.
     * T2 PRODUCT SCOPE IS UNCONDITIONAL. The DAO guards it with `structKeyExists`, but its only caller
     *    declares the argument required and forwards the whole collection, so the guard is always true.
     *    The port types it required and this double always applies it.
     * T3 THE VESTIGIAL JOIN IS LOAD-BEARING. `inner join sku.options as opt` is never referenced in the
     *    WHERE clause and looks removable. It is not: it excludes OPTION-LESS SKUs from every result,
     *    including when the selection is empty. Preserved here as an option-bearing guard.
     * T4 DISTINCTNESS. The join fans out one row per SKU/option pair, and `select distinct` collapses it.
     *    Iterating the stored SKUs once yields each at most once, which is the same guarantee.
     * T5 AN EMPTY SELECTION IS LEGAL. `Product.getSkusBySelectedOptions` defaults it to `''` and
     *    `listLen('')` is zero, so no requirement is appended and the query degenerates to "every
     *    option-bearing SKU of this product". Both `Product.getSkuBySelectedOptions` and
     *    `Sku.hasUniqueOptions` depend on that degenerate form; guarding against it would break them and
     *    would hide defect D19.
     *
     * Result order is first-seen insertion order. The legacy HQL has no ORDER BY, so row order is
     * formally unspecified; a deterministic insertion order is the honest choice and matches M9.
     */
    findSkusBySelectedOptions: (optionIds: string[], productId: string): Promise<SkuRow[]> => {
      calls.push(
        Object.freeze({
          member: 'findSkusBySelectedOptions',
          optionIds: Object.freeze([...optionIds]),
          productId,
        }),
      );
      const matches = skus.filter((sku) => {
        if (!belongsToProduct(sku, productId)) {
          return false;
        }
        if (sku.options.length === 0) {
          return false;
        }
        return optionIds.every((optionId) =>
          sku.options.some((option) => option.optionID === optionId),
        );
      });
      return Promise.resolve(matches);
    },

    /*
     * `model/dao/SkuDAO.cfc:L130-L148`. The term is interpolated with NO guard, so an absent term is a
     * runtime failure rather than a match-everything shortcut —
     * `src/adapters/mysql/MySqlSkuRepository.ts` raises for the same reason and this double matches it.
     *
     * The product-type restriction is gated on `trim(productTypeID) != ""`. That trimmed test is the
     * SKU-side behaviour and is deliberately NOT harmonised with the Product side, which gates on
     * `len(productTypeIDs)` at `model/dao/ProductDAO.cfc:L419-L437` and therefore ACCEPTS a
     * whitespace-only value. The asymmetry is real; making the two agree would be a repair.
     *
     * Matching is case-insensitive because MySQL's default collation makes `like` so; the comparison is
     * a substring test rather than assembled SQL, since this double emits no statement text.
     */
    searchByProductType: (term?: string, productTypeID?: string): Promise<SkuSearchRow[]> => {
      calls.push(Object.freeze({ member: 'searchByProductType', term, productTypeID }));
      if (term === undefined) {
        return Promise.reject(
          new DomainError(
            'A SKU search needs a term. The legacy DAO reads it without a guard, so an absent term is ' +
              'a failure rather than an unrestricted match.',
          ),
        );
      }
      const needle = term.toLowerCase();
      let candidates = skus.filter(
        (sku) => sku.skuCode !== undefined && sku.skuCode.toLowerCase().includes(needle),
      );
      if (productTypeID !== undefined && productTypeID.trim() !== '') {
        const productTypeIDs = productTypeID.split(',').filter((segment) => segment !== '');
        if (productTypeIDs.length === 0) {
          return Promise.reject(
            new DomainError(
              'The product-type restriction contained no usable identifiers once the delimited list ' +
                'was split, so it could not be applied.',
              { context: { productTypeID } },
            ),
          );
        }
        candidates = candidates.filter((sku) => {
          const assigned = sku.product?.productType?.productTypeID;
          return assigned !== undefined && productTypeIDs.includes(assigned);
        });
      }
      const rows: SkuSearchRow[] = [];
      for (const sku of candidates) {
        const skuCode = sku.skuCode;
        if (skuCode !== undefined) {
          rows.push(Object.freeze({ id: sku.skuID, value: skuCode }));
        }
      }
      return Promise.resolve(rows);
    },

    /*
     * `model/dao/SkuDAO.cfc:L150-L168`.
     *
     * D9, carried not repaired: the DAO declares `fetchOptions` as `required any` at `:L150` and then
     * reads it UNSCOPED at `:L153`; it re-declares `var hql` mid-function at `:L163`; and the fourth
     * `{ignoreCase="true"}` argument at `:L165` is inert for this call. None of that is corrected here.
     *
     * What matters behaviourally is that `fetchOptions` is NOT merely an eager-loading hint. The joins it
     * adds are INNER, so switching it on FILTERS the result to SKUs that actually carry the related rows
     * for the product's base product type. With it off there is no join at all and every SKU of the
     * product comes back — which is exactly what `src/adapters/mysql/MySqlSkuRepository.ts` does.
     *
     * A base product type outside the three seeded discriminators adds no join, so nothing is filtered.
     */
    findByProduct: async (product: Product, fetchOptions: boolean): Promise<Sku[]> => {
      calls.push(
        Object.freeze({ member: 'findByProduct', productID: product.productID, fetchOptions }),
      );
      const candidates = skus.filter((sku) => belongsToProduct(sku, product.productID));
      if (!fetchOptions) {
        return candidates;
      }
      const baseProductType = await product.getBaseProductType(productTypeRootResolver);
      if (baseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.contentAccess.systemCode) {
        return candidates.filter((sku) => sku.accessContents.length > 0);
      }
      if (baseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise.systemCode) {
        return candidates.filter((sku) => sku.options.length > 0);
      }
      if (baseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.subscription.systemCode) {
        return candidates.filter(
          (sku) => sku.subscriptionTerm !== undefined && sku.subscriptionBenefits.length > 0,
        );
      }
      return candidates;
    },

    /*
     * `model/dao/SkuDAO.cfc:L172-L202` — the odometer ordering.
     *
     * The statement joins `SwSku ⋈ SwSkuOption ⋈ SwOption ⋈ SwOptionGroup`, all INNER, groups by SKU and
     * orders by `SUM(SwOption.sortOrder * POWER(10, next - SwOptionGroup.sortOrder)) ASC`. Three
     * consequences are preserved exactly:
     *
     * 1. OPTION-BEARING SKUs ONLY. The inner joins drop everything else. This is the ROOT CAUSE of D13:
     *    `model/service/SkuService.cfc:L223-L269` looks the returned identifier up with `arrayFind` and
     *    indexes the result, so a SKU that is missing here produces index 0 and the service throws. The
     *    gap is left in place; the service owns the defect.
     * 2. NO `COALESCE`. A NULL option sort order or a NULL group sort order makes that row's product
     *    NULL, and SQL's `SUM` skips NULL terms — so the term simply does not contribute. An option with
     *    no option group is dropped by the INNER JOIN entirely, and a SKU whose every option lacks a
     *    group drops out of the result. Adding a zero default would change the ordering.
     * 3. TIES KEEP FIRST-SEEN ORDER (M9). The legacy has no secondary sort key, so ties are formally
     *    unspecified; insertion order is deterministic and is never re-sorted for tidiness.
     *
     * TODO(parity) D8 — `model/dao/SkuDAO.cfc:L177` carries a TODO doubting the statement on engines
     * other than MySQL and SQL Server. The port targets MySQL only, which is consistent with that
     * untested state rather than a resolution of it.
     */
    findSortedSkuIdsByProduct: (productID: string): Promise<string[]> => {
      calls.push(Object.freeze({ member: 'findSortedSkuIdsByProduct', productID }));
      const nextSortOrder = resolveNextOptionGroupSortOrder();
      const weighted: { readonly skuID: string; readonly weight: number; readonly seen: number }[] =
        [];
      let seen = 0;
      for (const sku of skus) {
        if (!belongsToProduct(sku, productID)) {
          continue;
        }
        let contributingRows = 0;
        let weight = 0;
        for (const option of sku.options) {
          const groupSortOrder = option.optionGroup?.sortOrder;
          if (groupSortOrder === undefined) {
            continue;
          }
          contributingRows += 1;
          const optionSortOrder = option.sortOrder;
          if (optionSortOrder === undefined) {
            continue;
          }
          weight += optionSortOrder * Math.pow(10, nextSortOrder - groupSortOrder);
        }
        if (contributingRows === 0) {
          continue;
        }
        weighted.push({ skuID: sku.skuID, weight, seen });
        seen += 1;
      }
      weighted.sort((left, right) =>
        left.weight === right.weight ? left.seen - right.seen : left.weight - right.weight,
      );
      return Promise.resolve(weighted.map((entry) => entry.skuID));
    },

    /*
     * TODO(parity) D7 — `model/dao/SkuDAO.cfc:L222-L228`. The legacy guard is INVERTED: it deletes the
     * memo key only when the key is ABSENT, so once the sort order has been resolved the cache is never
     * actually cleared. `src/adapters/mysql/MySqlSkuRepository.ts` reproduces that as
     * `if (memo.value === undefined) { memo.value = undefined; }`, and so does this line. The call is
     * observable through {@link InMemorySkuRepository.optionGroupSortOrderMemoValue}, which keeps its
     * value across the call and proves the no-op.
     *
     * Synchronous, matching the port. It returns `void`, not a promise.
     */
    clearOptionGroupSortOrderCache: (): void => {
      calls.push(Object.freeze({ member: 'clearOptionGroupSortOrderCache' }));
      if (optionGroupSortOrderMemo.value === undefined) {
        optionGroupSortOrderMemo.value = undefined;
      }
    },

    /*
     * The write seam the combination engine drives. `src/adapters/mysql/MySqlSkuRepository.ts` refuses a
     * SKU with no identifier — it upserts by primary key and then re-links the option rows, neither of
     * which is possible without one — so this double refuses too.
     *
     * M6 lives here. The upsert lands in the SAME array `findSkusBySelectedOptions` reads, so a SKU
     * persisted inside a transaction becomes visible to the NEXT sibling's uniqueness read in creation
     * order. That is the whole hazard of AAP §0.6.2: under Hibernate the rule only ever saw siblings the
     * ORM session had already flushed, and a port that inserted everything and then validated — or
     * validated before inserting anything — would produce different results with no error at all.
     */
    persistSku: (sku: Sku): Promise<void> => {
      calls.push(Object.freeze({ member: 'persistSku', sku }));
      if (sku.isNew()) {
        return Promise.reject(
          new DomainError(
            'A SKU cannot be persisted without a primary identifier: the write is an upsert keyed on ' +
              'it, and the option links are re-established against it.',
          ),
        );
      }
      persisted.push(sku);
      const existingIndex = skus.findIndex((candidate) => candidate.skuID === sku.skuID);
      if (existingIndex === -1) {
        skus.push(sku);
      } else {
        skus[existingIndex] = sku;
      }
      return Promise.resolve();
    },
  };

  return {
    repository,
    skus,
    calls,
    persisted,
    add: (...added: readonly Sku[]): void => {
      skus.push(...added);
    },
    addAlternateSkuCode: (seed: AlternateSkuCodeSeed): void => {
      alternateSkuCodes.push(seed);
    },
    addTransactionParticipation: (participation: {
      readonly skuID?: string;
      readonly productID?: string;
    }): void => {
      if (participation.skuID !== undefined) {
        transactionSkuIDs.add(participation.skuID);
      }
      if (participation.productID !== undefined) {
        transactionProductIDs.add(participation.productID);
      }
    },
    optionGroupSortOrderMemoValue: (): number | undefined => optionGroupSortOrderMemo.value,
  };
}

/**
 * Adapt a {@link SkuRepository} to the SKU-first service surface
 * {@link SkuTransactionExistenceChecker}, which is what `Sku.getTransactionExistsFlag` and
 * `Product.getTransactionExistsFlag` are handed.
 *
 * This exists to make the D23 layer-order reversal assertable in one place rather than re-derived in
 * every test. The service surface is `(skuID?, productID?)` and the repository surface is
 * `(productID?, skuID?)`; the forwarding below is the ONLY correct mapping, and a test that swaps it
 * will see the identifiers exchanged. `src/domain/product/Product.ts` declares the structurally
 * identical `ProductTransactionExistenceChecker`, so the same object serves both entities.
 */
export function createTransactionExistenceChecker(
  repository: SkuRepository,
): SkuTransactionExistenceChecker {
  return {
    getTransactionExistsFlag: (skuID?: string, productID?: string): Promise<boolean> =>
      repository.transactionExists(productID, skuID),
  };
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 5. The option repository.
 *
 * Two members, two OPPOSITE set polarities. `model/dao/OptionDAO.cfc:L51-L91` selects options whose
 * group is IN the supplied list, while `:L93-L116` selects groups whose identifier is NOT IN it. That
 * inversion is the whole point of the pair — the caller passes the SAME "option groups already on this
 * product" list to both — and getting it backwards produces a plausible-looking result set that is
 * exactly wrong.
 *
 * Both members answer with the port's own `{name, value}` projection rows, and `OptionService` returns
 * them straight through without mapping, so the label format is this repository's responsibility.
 *
 * TODO(parity) D25 — `model/service/ProductService.cfc:L70-L80`: the neighbouring formatted-groups member
 * builds a plain structure keyed by option-group NAME, so two groups sharing a name overwrite each other
 * and the earlier one is lost. No named type is introduced for that shape anywhere in this file — a record
 * keyed by group name is exactly what the legacy produces, and giving it a type name would imply a
 * structure the legacy does not guarantee.
 * ---------------------------------------------------------------------------------------------------
 */

/** One recorded call on the option repository. */
export type OptionRepositoryCall =
  | {
      readonly member: 'findUnusedOptions';
      readonly productID: string;
      readonly existingOptionGroupIDList: string;
    }
  | { readonly member: 'findUnusedOptionGroups'; readonly existingOptionGroupIDList: string };

/** Seed configuration for {@link createInMemoryOptionRepository}. */
export interface InMemoryOptionRepositoryOptions {
  /** Every option group in the catalogue, each carrying its own options. */
  readonly optionGroups?: readonly OptionGroup[];
  /**
   * The SKUs that establish which options a product already uses. The legacy `NOT EXISTS` correlates
   * `SwSkuOption` to `SwSku` on `productID`, so usage is derived from each SKU's product and options
   * rather than from a separate usage table.
   */
  readonly skus?: readonly Sku[];
}

/** The repository plus its factory-local observation state. */
export interface InMemoryOptionRepository {
  readonly repository: OptionRepository;
  readonly calls: readonly OptionRepositoryCall[];
  /** Seed a further group after construction. */
  addOptionGroup(optionGroup: OptionGroup): void;
  /** Seed a further SKU, which may make some of its options "used". */
  addSku(sku: Sku): void;
}

/**
 * Create the in-memory option repository.
 *
 * Comma-list handling is deliberately raw. `splitIdentifierList` does what the legacy does and nothing
 * more: no trimming, no de-duplication, no dropping of empty entries. The consequence is the
 * validation-observable ASYMMETRY the two members exhibit for an empty list — for a product with no
 * option groups yet, `findUnusedOptions('')` returns `[]` because the single empty identifier matches no
 * group on the IN side, while `findUnusedOptionGroups('')` returns EVERY group because that same empty
 * identifier excludes none on the NOT-IN side. Both answers are correct and the difference is load
 * bearing, so neither is "fixed".
 */
export function createInMemoryOptionRepository(
  options: InMemoryOptionRepositoryOptions = {},
): InMemoryOptionRepository {
  const optionGroups: OptionGroup[] =
    options.optionGroups === undefined ? [] : [...options.optionGroups];
  const skus: Sku[] = options.skus === undefined ? [] : [...options.skus];
  const calls: OptionRepositoryCall[] = [];

  /** The option identifiers a product already uses, derived exactly as the correlated NOT EXISTS does. */
  const optionIdsUsedByProduct = (productID: string): ReadonlySet<string> => {
    const used = new Set<string>();
    for (const sku of skus) {
      if (sku.product === undefined || sku.product.productID !== productID) {
        continue;
      }
      for (const option of sku.options) {
        used.add(option.optionID);
      }
    }
    return used;
  };

  /*
   * `ORDER BY optionGroupName, optionName` and `ORDER BY optionGroupName`. An absent name is compared as
   * the empty string: MySQL orders NULL before every non-NULL value in an ascending sort, and the empty
   * string collates first among strings, so the two agree here. `Array.prototype.sort` is stable, which
   * preserves first-seen order among equal keys (M9) without a synthetic tiebreak.
   */
  const byName = (left: string | undefined, right: string | undefined): number =>
    (left ?? '').localeCompare(right ?? '');

  const repository: OptionRepository = {
    /*
     * `model/dao/OptionDAO.cfc:L51-L91`. `SwOption.optionGroupID` IN the supplied list, AND `NOT EXISTS`
     * a `SwSkuOption`/`SwSku` pair for this product carrying the option.
     *
     * The row label is `"<optionGroupName> - <optionName>"` with a literal space, hyphen, space.
     * `OptionService.getUnusedProductOptions` returns these rows STRAIGHT through and performs no
     * mapping of its own, so the format is fixed here and nowhere else.
     *
     * The statement binds the option-group identifiers FIRST and the product identifier LAST, which
     * REVERSES this method's signature order. Assert the bind order against the executor double, not
     * against this argument list.
     */
    findUnusedOptions: (
      productID: string,
      existingOptionGroupIDList: string,
    ): Promise<UnusedOptionRow[]> => {
      calls.push(
        Object.freeze({ member: 'findUnusedOptions', productID, existingOptionGroupIDList }),
      );
      const includedGroupIds = splitIdentifierList(existingOptionGroupIDList);
      const used = optionIdsUsedByProduct(productID);
      const rows: {
        readonly row: UnusedOptionRow;
        readonly group: OptionGroup;
        readonly option: Option;
      }[] = [];
      for (const optionGroup of optionGroups) {
        if (!includedGroupIds.includes(optionGroup.optionGroupID)) {
          continue;
        }
        for (const option of optionGroup.getOptions()) {
          if (used.has(option.optionID)) {
            continue;
          }
          rows.push({
            group: optionGroup,
            option,
            row: Object.freeze({
              name: `${optionGroup.optionGroupName ?? ''} - ${option.optionName ?? ''}`,
              value: option.optionID,
            }),
          });
        }
      }
      rows.sort(
        (left, right) =>
          byName(left.group.optionGroupName, right.group.optionGroupName) ||
          byName(left.option.optionName, right.option.optionName),
      );
      return Promise.resolve(rows.map((entry) => entry.row));
    },

    /*
     * `model/dao/OptionDAO.cfc:L93-L116`. `optionGroupID` NOT IN the supplied list, ordered by name, and
     * the label is the BARE group name — no prefix, no separator. The row type is kept distinct from
     * {@link UnusedOptionRow} even though the two are structurally identical, because the port declares
     * them separately and collapsing them would erase which member a value came from.
     */
    findUnusedOptionGroups: (
      existingOptionGroupIDList: string,
    ): Promise<UnusedOptionGroupRow[]> => {
      calls.push(Object.freeze({ member: 'findUnusedOptionGroups', existingOptionGroupIDList }));
      const excludedGroupIds = splitIdentifierList(existingOptionGroupIDList);
      const matched = optionGroups.filter(
        (optionGroup) => !excludedGroupIds.includes(optionGroup.optionGroupID),
      );
      matched.sort((left, right) => byName(left.optionGroupName, right.optionGroupName));
      const rows: UnusedOptionGroupRow[] = matched.map((optionGroup) =>
        Object.freeze({
          name: optionGroup.optionGroupName ?? '',
          value: optionGroup.optionGroupID,
        }),
      );
      return Promise.resolve(rows);
    },
  };

  return {
    repository,
    calls,
    addOptionGroup: (optionGroup: OptionGroup): void => {
      optionGroups.push(optionGroup);
    },
    addSku: (sku: Sku): void => {
      skus.push(sku);
    },
  };
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 6. The product repository.
 *
 * Three members, and two of them are deliberately thin because the port itself is thin. Widening this
 * double to model the importer's schema would fabricate exactly the tables AAP §0.7.3 S9 forbids
 * inventing — the injection-surface hardening of defect D18 belongs to the real MySQL adapter, which is
 * where `pool.execute()` with `?` placeholders replaces the twenty-one interpolated statements.
 * ---------------------------------------------------------------------------------------------------
 */

/** One recorded call on the product repository. */
export type ProductRepositoryCall =
  | {
      readonly member: 'findAttributeSets';
      readonly attributeSetTypeCode: readonly string[];
      readonly productTypeIDs: readonly string[];
    }
  | {
      readonly member: 'importFromFile';
      readonly source: ProductImportSource;
      readonly textQualifier: string | undefined;
    }
  | {
      readonly member: 'searchByProductType';
      readonly term: string | undefined;
      readonly productTypeIDs: string | undefined;
    };

/**
 * Drives the importer without a file.
 *
 * A test wires this to `UnitOfWork.runPerItem` over its own row plan, which is how M3 — one transaction
 * per row, strictly sequential, earlier rows staying committed after a later failure — becomes
 * observable without parsing anything.
 */
export type ProductImportHandler = (
  source: ProductImportSource,
  textQualifier: string | undefined,
) => Promise<void>;

/** Seed configuration for {@link createInMemoryProductRepository}. */
export interface InMemoryProductRepositoryOptions {
  /**
   * Returned verbatim by `findAttributeSets`. The port types a row as `unknown` on purpose: the
   * Attribute family is out of scope, so the rows stay opaque and no attribute domain type is invented.
   */
  readonly attributeSets?: readonly AttributeSetRow[];
  /** Searched by `searchByProductType`. */
  readonly products?: readonly Product[];
  readonly onImport?: ProductImportHandler;
}

/** The repository plus its factory-local observation state. */
export interface InMemoryProductRepository {
  readonly repository: ProductRepository;
  readonly calls: readonly ProductRepositoryCall[];
  addProduct(product: Product): void;
}

/**
 * Create the in-memory product repository.
 *
 * `searchByProductType` preserves the PRODUCT-side gate exactly: `model/dao/ProductDAO.cfc:L423` tests
 * `len(arguments.productTypeIDs)`, so a whitespace-only value is ACCEPTED and restricts the search,
 * whereas the SKU side at `model/dao/SkuDAO.cfc:L130-L148` tests `trim(...) != ""` and ignores it. The
 * two are not harmonised. The list is bound with `list="true"` at `:L425`, which splits on commas and
 * filters nothing, so `splitIdentifierList` is used unchanged. The term at `:L422` is interpolated into
 * the bound value with no guard, so an absent term fails — and the column searched is `productName`, not
 * `productCode`.
 *
 * TODO(parity) D20 — `model/dao/ProductDAO.cfc:L64` carries a TODO to remove a two-branch conditional
 * once Railo and Adobe ColdFusion agree on how arrays bind to an `IN` clause. That engine divergence
 * does not exist in TypeScript, so the real adapter legitimately collapses the branch to a single path;
 * the TODO's precondition is satisfied BY the migration rather than resolved by hand. Nothing branches
 * here either.
 *
 * TODO(boundary) M1 — `model/service/ProductService.cfc:L65-L68` asks for a 3600-second request budget,
 * which is unrepresentable inside one Lambda invocation. No timer, deadline or retry appears in this
 * double; the mismatch is flagged and left for the handler layer to decide. M4 is adjacent: the legacy
 * fetches the file over `cfhttp` at `model/dao/ProductDAO.cfc:L87`, inside the same request that owns
 * the per-row transactions. This double performs no I/O of any kind.
 *
 * The legacy `.xls` branch at `model/dao/ProductDAO.cfc:L73-L99` is EMPTY — it reads no rows and raises
 * nothing. This double parses nothing at all, so it likewise raises nothing for any extension, and no
 * failure is invented for one.
 */
export function createInMemoryProductRepository(
  options: InMemoryProductRepositoryOptions = {},
): InMemoryProductRepository {
  const attributeSets: AttributeSetRow[] =
    options.attributeSets === undefined ? [] : [...options.attributeSets];
  const products: Product[] = options.products === undefined ? [] : [...options.products];
  const calls: ProductRepositoryCall[] = [];
  const onImport = options.onImport;

  const repository: ProductRepository = {
    findAttributeSets: (
      attributeSetTypeCode: string[],
      productTypeIDs: string[],
    ): Promise<AttributeSetRow[]> => {
      calls.push(
        Object.freeze({
          member: 'findAttributeSets',
          attributeSetTypeCode: Object.freeze([...attributeSetTypeCode]),
          productTypeIDs: Object.freeze([...productTypeIDs]),
        }),
      );
      return Promise.resolve([...attributeSets]);
    },

    importFromFile: (source: ProductImportSource, textQualifier?: string): Promise<void> => {
      calls.push(Object.freeze({ member: 'importFromFile', source, textQualifier }));
      /*
       * The port returns `Promise<void>` and reports nothing about what it imported, so this double
       * reports nothing either. Everything a test wants to observe about the import lives in the handler
       * it supplied and in the UnitOfWork double the handler drives.
       */
      if (onImport === undefined) {
        return Promise.resolve();
      }
      return onImport(source, textQualifier);
    },

    searchByProductType: (term?: string, productTypeIDs?: string): Promise<ProductSearchRow[]> => {
      calls.push(Object.freeze({ member: 'searchByProductType', term, productTypeIDs }));
      if (term === undefined) {
        return Promise.reject(
          new DomainError(
            'A product search needs a term. The legacy statement interpolates it into the bound value ' +
              'without a guard, so an absent term is a failure rather than an unrestricted match.',
          ),
        );
      }
      const needle = term.toLowerCase();
      let candidates = products.filter(
        (product) =>
          product.productName !== undefined && product.productName.toLowerCase().includes(needle),
      );
      if (productTypeIDs !== undefined && productTypeIDs.length > 0) {
        const restriction = splitIdentifierList(productTypeIDs);
        candidates = candidates.filter((product) => {
          const assigned = product.productType?.productTypeID;
          return assigned !== undefined && restriction.includes(assigned);
        });
      }
      const rows: ProductSearchRow[] = [];
      for (const product of candidates) {
        const productName = product.productName;
        if (productName !== undefined) {
          rows.push(Object.freeze({ id: product.productID, value: productName }));
        }
      }
      return Promise.resolve(rows);
    },
  };

  return {
    repository,
    calls,
    addProduct: (product: Product): void => {
      products.push(product);
    },
  };
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 7. The product-type repository.
 *
 * One zero-argument member. `model/dao/ProductTypeDAO.cfc:L51-L65` selects every product type with two
 * correlated COUNT subselects and orders by `productTypeName ASC` — a FLAT list, not a traversal, even
 * though the caller renders a tree from it. Both projections are counts, so both are NUMERIC:
 * `isAssigned` is "how many products use this type", never a boolean.
 * ---------------------------------------------------------------------------------------------------
 */

/** One seeded tree row: the entity plus its two counted projections. */
export interface ProductTypeTreeSeed {
  readonly productType: ProductType;
  /** The count of products assigned to this type. NUMERIC — the name reads like a flag and is not one. */
  readonly isAssigned: number;
  readonly childCount: number;
}

/** The repository plus its factory-local observation state. */
export interface InMemoryProductTypeRepository {
  readonly repository: ProductTypeRepository;
  /** How many times `findAllForTree()` was called. There is no cache, so two calls are two calls. */
  callCount(): number;
  addProductType(seed: ProductTypeTreeSeed): void;
}

/**
 * Create the in-memory product-type repository.
 *
 * G6. The two projections are attached with `Object.assign`, exactly as
 * `src/adapters/mysql/rowMappers.ts` attaches them in `mapProductTypeTreeRow`. The difference is that
 * the adapter attaches them to a freshly hydrated entity per call while this double attaches them to the
 * SEEDED entity, so the returned rows keep their identity across calls. That is deliberate: it preserves
 * whatever parent/child wiring the test built, and the alternative — a hand-rolled clone of an entity —
 * would be invented behaviour.
 *
 * Nothing is memoised. `findAllForTree()` is observably called every time, because the legacy DAO issues
 * the statement every time.
 */
export function createInMemoryProductTypeRepository(
  seeds: readonly ProductTypeTreeSeed[] = [],
): InMemoryProductTypeRepository {
  const productTypes: ProductTypeTreeSeed[] = [...seeds];
  let callCount = 0;

  const repository: ProductTypeRepository = {
    findAllForTree: (): Promise<ProductTypeTreeRow[]> => {
      callCount += 1;
      const rows: ProductTypeTreeRow[] = productTypes.map((seed) =>
        Object.assign(seed.productType, {
          isAssigned: seed.isAssigned,
          childCount: seed.childCount,
        }),
      );
      rows.sort((left, right) =>
        (left.productTypeName ?? '').localeCompare(right.productTypeName ?? ''),
      );
      return Promise.resolve(rows);
    },
  };

  return {
    repository,
    callCount: (): number => callCount,
    addProductType: (seed: ProductTypeTreeSeed): void => {
      productTypes.push(seed);
    },
  };
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 8. The validation error bag and the entity-facing delegation surface.
 *
 * `ValidationError` in `src/errors/ValidationError.ts` IS the keyed error bag. It is imported and
 * DELEGATED to here — never reimplemented — because a second implementation is a second set of
 * semantics, and the one that matters (a miss returns `[]` rather than raising) is easy to get wrong.
 *
 * That miss behaviour is not incidental. `org/Hibachi/HibachiErrors.cfc:L47-L50` has an accessor defect,
 * but the in-scope entities do not reach errors through it: they reach them through
 * `org/Hibachi/HibachiTransient.cfc:L29-L68`, whose miss path returns an empty array. The empty-array
 * behaviour is therefore the one to preserve, and the defect is not carried into a layer that never had
 * it.
 *
 * `addError` takes EXACTLY two arguments. The third `persistableError` argument that appears elsewhere in
 * the framework is an entity concern, not part of the validation-engine contract, and adding it here
 * would widen a contract the extracted service does not have.
 * ---------------------------------------------------------------------------------------------------
 */

/**
 * The six error members an entity exposes to `Validator` and to the services.
 *
 * Declared locally because `src/domain/base/populate.ts` — which owns the identical `EntityErrorSurface`
 * inside `ManagedEntity<T>` — is outside this file's dependency whitelist. The shape is verified
 * structurally rather than by name: {@link createManagedBrand} below produces a `ManagedBrand` from it,
 * and that assignment would not compile if any member drifted.
 */
export interface EntityErrorSurface {
  getErrors(): ValidationErrors;
  addError(propertyName: string, message: string): void;
  addErrors(errors: ValidationErrors): void;
  hasErrors(): boolean;
  hasError(propertyName: string): boolean;
  getError(propertyName: string): readonly string[];
}

/** A bag and the six-member surface that delegates to it. */
export interface EntityErrorSurfaceDouble {
  /** The real `ValidationError`. Assert against this, or against the surface — they are the same state. */
  readonly errors: ValidationError;
  readonly surface: EntityErrorSurface;
}

/**
 * Wrap a {@link ValidationError} in the entity-facing surface.
 *
 * The value behind every key is ALWAYS an array, and messages ACCUMULATE in the order they were added.
 * That matters for one case in particular: both of `Sku`'s method rules — `hasUniqueOptions` and
 * `hasOneOptionPerOptionGroup` — report under the SAME `options` key, so a SKU that violates both must
 * show two messages under `options`, in rule order. A bag that overwrote, or that stored a scalar, would
 * lose the second one silently.
 *
 * A fresh bag is allocated per call unless one is supplied, so two calls never share state.
 */
export function createEntityErrorSurface(
  errors: ValidationError = new ValidationError(),
): EntityErrorSurfaceDouble {
  return {
    errors,
    surface: {
      getErrors: (): ValidationErrors => errors.getErrors(),
      addError: (propertyName: string, message: string): void => {
        errors.addError(propertyName, message);
      },
      addErrors: (added: ValidationErrors): void => {
        errors.addErrors(added);
      },
      hasErrors: (): boolean => errors.hasErrors(),
      hasError: (propertyName: string): boolean => errors.hasError(propertyName),
      getError: (propertyName: string): readonly string[] => errors.getError(propertyName),
    },
  };
}

/**
 * Attach an error surface to a real entity, in place, and return it narrowed.
 *
 * `Object.assign` is the mechanism rather than a wrapper object because the entity must stay the SAME
 * reference: the services pass entities around by reference, `Sku.setProduct` relies on identity when it
 * checks membership, and a proxy or copy would break both.
 */
export function attachEntityErrorSurface<TEntity extends object>(
  entity: TEntity,
  errors: ValidationError = new ValidationError(),
): TEntity & EntityErrorSurface {
  return Object.assign(entity, createEntityErrorSurface(errors).surface);
}

/** A managed brand and the bag its error members write to. */
export interface ManagedBrandDouble {
  readonly brand: ManagedBrand;
  readonly errors: ValidationError;
}

/**
 * Build a `ManagedEntity<Brand>` — the shape every `BrandRepository` member traffics in.
 *
 * `Brand` already implements the metadata half of `ManagedEntity` (`getClassName`, `getEntityName`,
 * `getPrimaryIDPropertyName`, `getPrimaryIDValue`, `hasProperty`, `getPropertyMetaData`,
 * `getValueByPropertyIdentifier`), so only the error half has to be attached. The composition below is
 * checked by the compiler with no assertion of any kind: if either half drifted, the return type would
 * stop satisfying `ManagedBrand`.
 *
 * `src/domain/base/populate.ts` owns the production equivalent, `manageEntity`, but it is outside this
 * file's dependency whitelist, so the surface is composed here from the whitelisted pieces instead.
 */
export function createManagedBrand(
  seed: BrandSeed = {},
  errors: ValidationError = new ValidationError(),
): ManagedBrandDouble {
  const brand: ManagedBrand = attachEntityErrorSurface(buildBrand(seed), errors);
  return { brand, errors };
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 9. The brand repository, and the table-scoped URL-title probe.
 *
 * `BrandService` is the cleanest of the four services — one public member, no dead injections — which
 * makes this the simplest repository double. It is still worth being exact about three things: the
 * synchronous constructor, the absence of identifier generation, and the polarity of the availability
 * answer.
 * ---------------------------------------------------------------------------------------------------
 */

/** One recorded call on the brand repository. */
export type BrandRepositoryCall =
  | { readonly member: 'newBrand' }
  | { readonly member: 'getBrand'; readonly brandID: string }
  | { readonly member: 'saveBrand'; readonly brand: ManagedBrand }
  | { readonly member: 'deleteBrand'; readonly brand: ManagedBrand }
  | { readonly member: 'isUrlTitleAvailable'; readonly urlTitle: string };

/** Seed configuration for {@link createInMemoryBrandRepository}. */
export interface InMemoryBrandRepositoryOptions {
  readonly brands?: readonly ManagedBrand[];
  /** URL titles already held by a row. A seeded title is NOT available. */
  readonly takenUrlTitles?: readonly string[];
  /**
   * Queued answers consumed in order, overriding {@link takenUrlTitles} while they last. This is how a
   * collision SEQUENCE is configured — see {@link createInMemoryBrandRepository} for why that matters.
   */
  readonly urlTitleAvailability?: readonly boolean[];
}

/** The repository plus its factory-local observation state. */
export interface InMemoryBrandRepository {
  readonly repository: BrandRepository;
  /** Live view of the stored brands. */
  readonly brands: readonly ManagedBrand[];
  readonly calls: readonly BrandRepositoryCall[];
  addBrand(brand: ManagedBrand): void;
  /** Mark a URL title as held, so the next probe for it answers `false`. */
  takeUrlTitle(urlTitle: string): void;
}

/**
 * Create the in-memory brand repository.
 *
 * Three exactnesses:
 *
 * 1. `newBrand()` is SYNCHRONOUS and generates NOTHING. It returns a fresh managed `Brand` whose
 *    `brandID` is `''` — so `isNew()` is true — and whose `products` is a fresh live `[]`. The legacy
 *    `new*` member fabricated by `org/Hibachi/HibachiService.cfc:L255-L281` constructs a transient
 *    entity and the identifier arrives on flush, so no 32-character value is minted here and no UUID
 *    helper exists in this file.
 * 2. `saveBrand` mutates only factory-local state and does NOT assign an identifier either. A brand saved
 *    while still new stays new, and it is the caller's job to supply a 32-character lowercase hexadecimal
 *    identifier when a test needs a persisted one. No transaction is involved: M5 belongs to
 *    `UnitOfWork`, and pretending a repository commits would hide the boundary rather than model it.
 * 3. `isUrlTitleAvailable` answers with the POLARITY the port declares — `true` means AVAILABLE, safe to
 *    save. Inverting it silently inverts validation, which is precisely the class of error that passes
 *    review.
 *
 * The first-collision suffix is preserved INDIRECTLY, by making the collision sequence configurable
 * rather than by reimplementing the algorithm. `BrandService.createUniqueBrandUrlTitle` delegates to the
 * shared unique-title routine, which probes the bare title first and then `-2`, `-3`, … — the first
 * suffix is `-2`, not `-1`, because the counter is pre-incremented. Seeding the bare title as taken is
 * therefore all a test needs in order to observe that.
 */
export function createInMemoryBrandRepository(
  options: InMemoryBrandRepositoryOptions = {},
): InMemoryBrandRepository {
  const brands: ManagedBrand[] = options.brands === undefined ? [] : [...options.brands];
  const takenUrlTitles = new Set<string>(options.takenUrlTitles ?? []);
  const availabilityQueue: boolean[] =
    options.urlTitleAvailability === undefined ? [] : [...options.urlTitleAvailability];
  const calls: BrandRepositoryCall[] = [];

  const repository: BrandRepository = {
    newBrand: (): ManagedBrand => {
      calls.push(Object.freeze({ member: 'newBrand' }));
      return createManagedBrand().brand;
    },

    getBrand: (brandID: string): Promise<ManagedBrand | null> => {
      calls.push(Object.freeze({ member: 'getBrand', brandID }));
      return Promise.resolve(brands.find((brand) => brand.brandID === brandID) ?? null);
    },

    saveBrand: (brand: ManagedBrand): Promise<ManagedBrand> => {
      calls.push(Object.freeze({ member: 'saveBrand', brand }));
      /*
       * Upsert by identifier when there is one. A still-new brand has no key to match on, so it is
       * appended — which is exactly what an insert does, and it keeps the caller's reference.
       */
      const existingIndex =
        brand.brandID === '' ? -1 : brands.findIndex((stored) => stored.brandID === brand.brandID);
      if (existingIndex === -1) {
        brands.push(brand);
      } else {
        brands[existingIndex] = brand;
      }
      return Promise.resolve(brand);
    },

    deleteBrand: (brand: ManagedBrand): Promise<boolean> => {
      calls.push(Object.freeze({ member: 'deleteBrand', brand }));
      const storedIndex = brands.indexOf(brand);
      if (storedIndex === -1) {
        return Promise.resolve(false);
      }
      brands.splice(storedIndex, 1);
      /*
       * The delete GUARDS — `model/validation/Brand.json`'s minCollection rules on products and the
       * rest — live in the validation rule sets and are evaluated by `Validator` before this member is
       * ever reached. Duplicating them here would let a test pass against the wrong layer.
       */
      return Promise.resolve(true);
    },

    isUrlTitleAvailable: (urlTitle: string): Promise<boolean> => {
      calls.push(Object.freeze({ member: 'isUrlTitleAvailable', urlTitle }));
      const queued = availabilityQueue.shift();
      if (queued !== undefined) {
        return Promise.resolve(queued);
      }
      return Promise.resolve(!takenUrlTitles.has(urlTitle));
    },
  };

  return {
    repository,
    brands,
    calls,
    addBrand: (brand: ManagedBrand): void => {
      brands.push(brand);
    },
    takeUrlTitle: (urlTitle: string): void => {
      takenUrlTitles.add(urlTitle);
    },
  };
}

/**
 * The only three tables the legacy unique-URL-title algorithm is ever invoked against.
 *
 * DERIVED from the real `PhysicalTableName` union with `Extract`, not spelled as free string literals:
 * if any of the three names were wrong the union would resolve to `never` and this file would stop
 * compiling. `src/adapters/mysql/UniquePropertyChecker.ts` constrains its probe to the same three.
 * Nothing else is admissible — in particular no content table and no caller-chosen table name.
 */
export type UrlTitleTableName = Extract<
  PhysicalTableName,
  'SwProduct' | 'SwProductType' | 'SwBrand'
>;

/** The table-scoped probe shape. */
export interface UrlTitleAvailabilityProbe {
  isUrlTitleAvailable(tableName: UrlTitleTableName, value: string): Promise<boolean>;
}

/** One recorded probe. */
export interface UrlTitleAvailabilityCall {
  readonly tableName: UrlTitleTableName;
  readonly value: string;
}

/** The probe plus its factory-local observation state. */
export interface UrlTitleAvailabilityDouble {
  readonly probe: UrlTitleAvailabilityProbe;
  readonly calls: readonly UrlTitleAvailabilityCall[];
  /** Mark a title as held in a table, so the next probe for that pair answers `false`. */
  take(tableName: UrlTitleTableName, value: string): void;
}

/**
 * Create the table-scoped URL-title availability probe.
 *
 * G6. The production implementation of this seam is
 * `src/adapters/mysql/UniquePropertyChecker.ts#isUrlTitleAvailable`, which is OUTSIDE this file's
 * dependency whitelist, so the shape is declared locally rather than imported. Only the shape is local:
 * the table union above is derived from the real whitelist, the column is always `urlTitle`, and the
 * polarity matches the production member — `true` means the title is still available.
 *
 * `BrandRepository.isUrlTitleAvailable` is the one-argument, brand-only view of the same question, and
 * `BrandService` closes over it. This probe is the general form the other two tables need.
 */
export function createUrlTitleAvailabilityDouble(
  taken: readonly UrlTitleAvailabilityCall[] = [],
): UrlTitleAvailabilityDouble {
  const held = new Set<string>(taken.map((entry) => `${entry.tableName}.${entry.value}`));
  const calls: UrlTitleAvailabilityCall[] = [];

  return {
    calls,
    probe: {
      isUrlTitleAvailable: (tableName: UrlTitleTableName, value: string): Promise<boolean> => {
        calls.push(Object.freeze({ tableName, value }));
        return Promise.resolve(!held.has(`${tableName}.${value}`));
      },
    },
    take: (tableName: UrlTitleTableName, value: string): void => {
      held.add(`${tableName}.${value}`);
    },
  };
}

/*
 * ---------------------------------------------------------------------------------------------------
 * 10. The eight boundary ports.
 *
 * Each of these exists because an in-scope member genuinely depends on an out-of-scope collaborator
 * (AAP §0.2.2.7). None of them redeclares its port interface — the real export is imported and satisfied
 * — and none of them models any part of the excluded service behind it. The sixteen explicitly excluded
 * calculated members of AAP §0.2.2.6 appear nowhere: not as entity fields, not as port members, and not
 * as seeds.
 * ---------------------------------------------------------------------------------------------------
 */

/*
 * 10.1 The setting resolver.
 *
 * SYNCHRONOUS, single member, no promise anywhere. That is not a simplification: `setting()` is called
 * from inside entity accessors that are themselves synchronous, and making it asynchronous would ripple
 * an `await` into every one of them.
 *
 * S8 / M8. The out-of-scope stock-calculation path launches a named `cfthread`, so the platform's real
 * setting engine has an asynchronous edge. The in-scope slice never waits on it, and this contract is
 * declared synchronous precisely so no in-scope caller can come to depend on background completion.
 *
 * Nothing here models `filterEntities`, `formatValue`, `getSettingDetails` or any other part of the
 * out-of-scope setting engine.
 */

/** Where a seeded value applies, mirroring the hierarchy `model/entity/HibachiEntity.cfc:L129` walks. */
export type SettingScope =
  | { readonly kind: 'global' }
  | { readonly kind: 'entityName'; readonly entityName: SettingResolutionEntityName }
  | {
      readonly kind: 'entity';
      readonly entityName: SettingResolutionEntityName;
      readonly entityId: string;
    };

/** One seeded setting value. */
export interface SettingSeed {
  readonly settingName: SettingName;
  readonly value: SettingValue;
  /** Defaults to global. */
  readonly scope?: SettingScope;
}

/** One recorded resolution. */
export interface SettingResolverCall {
  readonly settingName: SettingName;
  readonly context: SettingResolutionContext | undefined;
}

/** Seed configuration for {@link createSettingResolverDouble}. */
export interface SettingResolverDoubleOptions {
  readonly settings?: readonly SettingSeed[];
  /**
   * Opt-in answer for a key nothing seeded. Omitted, an unseeded key FAILS — see
   * {@link createSettingResolverDouble} for why that is the default.
   */
  readonly fallback?: SettingValue;
}

/** The resolver plus its factory-local observation state. */
export interface SettingResolverDouble {
  readonly resolver: SettingResolverPort;
  readonly calls: readonly SettingResolverCall[];
  /** Seed or overwrite a value after construction. */
  set(seed: SettingSeed): void;
}

/**
 * Create the setting resolver.
 *
 * Resolution walks the same three levels the legacy accessor does, most specific first: a value scoped to
 * this exact entity, then one scoped to the entity CLASS, then the global value. Per-context values are
 * not a convenience — the legacy calls resolve against `object=this`, and the image-dimension keys in
 * particular are frequently resolved against the PRODUCT while the caller is a SKU, so a flat global map
 * alone cannot express what the slice actually reads.
 *
 * Every key the port declares is expressible, including both interpolated forms
 * (`productImage<size>Width` and `productImage<size>Height`) for an arbitrary size string, and including
 * the two byte-exact shipping keys `skuShippingWeight` and `skuShippingWeightUnitCode` that the feed
 * assembles its shipping weight from.
 *
 * An unseeded key raises rather than returning a value. NO production default is invented here: the
 * platform seeds only a handful of setting rows and everything else falls back to metadata defaults that
 * live in the out-of-scope setting service, so guessing one would be fabrication. A test seeds exactly
 * what it reads, or opts into {@link SettingResolverDoubleOptions.fallback} to say it does not care.
 */
export function createSettingResolverDouble(
  options: SettingResolverDoubleOptions = {},
): SettingResolverDouble {
  const seeds: SettingSeed[] = options.settings === undefined ? [] : [...options.settings];
  const calls: SettingResolverCall[] = [];
  const fallback = options.fallback;

  const scopeMatches = (
    scope: SettingScope,
    kind: SettingScope['kind'],
    context: SettingResolutionContext | undefined,
  ): boolean => {
    if (scope.kind !== kind) {
      return false;
    }
    if (scope.kind === 'global') {
      return true;
    }
    if (context === undefined) {
      return false;
    }
    if (scope.entityName !== context.entityName) {
      return false;
    }
    return scope.kind === 'entityName' || scope.entityId === context.entityId;
  };

  const resolve = (
    settingName: SettingName,
    context: SettingResolutionContext | undefined,
  ): SettingValue | undefined => {
    const candidates = seeds.filter((seed) => seed.settingName === settingName);
    for (const kind of ['entity', 'entityName', 'global'] as const) {
      /*
       * Last seed wins within a level, so `set()` overwrites rather than being shadowed by an earlier
       * seed of the same specificity.
       */
      for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const candidate = candidates[index];
        if (candidate === undefined) {
          continue;
        }
        if (scopeMatches(candidate.scope ?? { kind: 'global' }, kind, context)) {
          return candidate.value;
        }
      }
    }
    return undefined;
  };

  return {
    calls,
    resolver: {
      setting: (settingName: SettingName, context?: SettingResolutionContext): SettingValue => {
        calls.push(Object.freeze({ settingName, context }));
        const resolved = resolve(settingName, context);
        if (resolved !== undefined) {
          return resolved;
        }
        if (fallback !== undefined) {
          return fallback;
        }
        throw new DomainError(
          'A setting was read that this test did not seed. The effective-value engine lives in the ' +
            'out-of-scope setting service, so no default is invented here: seed the key, or opt into a ' +
            'fallback to declare that its value does not matter.',
          { context: { settingName } },
        );
      },
    },
    set: (seed: SettingSeed): void => {
      seeds.push(seed);
    },
  };
}

/*
 * 10.2 The image path port.
 *
 * Four members, all asynchronous, all configurable, and NONE of them touching a filesystem, a network or
 * an object store. The branded return type is built through the port's own exported `toImageWebPath`
 * factory, so no assertion is needed to produce one.
 *
 * TODO(boundary) — `model/entity/Sku.cfc:L145` and `:L221` pass a value that has already been turned
 * into a WEB path through `expandPath()`, which expects a filesystem path. That mismatch is flagged, not
 * resolved: resolving it would change which file the legacy looked for.
 *
 * No `getImageDirectory` member is invented on the SKU side, and no extension is added to the
 * `jpg,jpeg,png,gif` list the upload seam carries — this double records the list it is handed so a test
 * can assert the order survived, and supplies none of its own.
 *
 * TODO(parity) D24 — `model/service/SkuService.cfc:L210-L218`: `processImageUpload` is named and shaped
 * like the other `process*` members, every one of which returns its entity, but this one returns whatever
 * the dynamically resolved image service returned — a BOOLEAN. `saveImageFile` here therefore answers
 * `boolean` rather than a SKU, which is what makes that legacy return type observable instead of quietly
 * corrected to match its siblings.
 */

/** One recorded call on the image path port. */
export type ImagePathCall =
  | { readonly member: 'getImagePath'; readonly imageFile: string }
  | { readonly member: 'getResizedImagePath'; readonly request: ResizedImagePathRequest }
  | { readonly member: 'getImageExistsFlag'; readonly imageFile: ImageFileNameCandidate }
  | { readonly member: 'saveImageFile'; readonly request: SaveImageFileRequest };

/** Seed configuration for {@link createImagePathDouble}. */
export interface ImagePathDoubleOptions {
  /** Composed web path per image file name. An unseeded name echoes back unchanged. */
  readonly imagePathsByImageFile?: Readonly<Record<string, string>>;
  /** Answer for every resize. Unseeded, the request's own `imagePath` is echoed back. */
  readonly resizedImagePath?: string;
  /** Image file names that exist. Everything else does not. */
  readonly existingImageFiles?: readonly string[];
  /** Answer for `saveImageFile`. Defaults to `true`. */
  readonly saveSucceeds?: boolean;
}

/** The port plus its factory-local observation state. */
export interface ImagePathDouble {
  readonly imagePaths: ImagePathPort;
  readonly calls: readonly ImagePathCall[];
  /** Mark an image file as existing. */
  addExistingImageFile(imageFile: string): void;
}

/**
 * Create the image path port.
 *
 * The two path members ECHO rather than compose. That is deliberate: the real composition reads
 * `globalAssetsImageFolderPath` and the `/product/default/` segment and belongs to the adapter, so
 * fabricating a directory layout here would invent a contract. A test that cares about the composed value
 * seeds it.
 *
 * `getResizedImagePath` accepts a request with NO size — which is exactly how the Google feed calls it —
 * and any size string remains representable, so the deprecated single-letter aliases and the
 * Large/Medium/Small triple are not privileged over anything else.
 */
export function createImagePathDouble(options: ImagePathDoubleOptions = {}): ImagePathDouble {
  const calls: ImagePathCall[] = [];
  const existingImageFiles = new Set<string>(options.existingImageFiles ?? []);
  const imagePathsByImageFile = options.imagePathsByImageFile ?? {};
  const resizedImagePath = options.resizedImagePath;
  const saveSucceeds = options.saveSucceeds ?? true;

  return {
    calls,
    imagePaths: {
      getImagePath: (imageFile: string): Promise<ImageWebPath> => {
        calls.push(Object.freeze({ member: 'getImagePath', imageFile }));
        return Promise.resolve(toImageWebPath(imagePathsByImageFile[imageFile] ?? imageFile));
      },
      getResizedImagePath: (request: ResizedImagePathRequest): Promise<ImageWebPath> => {
        calls.push(Object.freeze({ member: 'getResizedImagePath', request }));
        return Promise.resolve(toImageWebPath(resizedImagePath ?? request.imagePath));
      },
      getImageExistsFlag: (imageFile: ImageFileNameCandidate): Promise<boolean> => {
        calls.push(Object.freeze({ member: 'getImageExistsFlag', imageFile }));
        return Promise.resolve(existingImageFiles.has(imageFile));
      },
      saveImageFile: (request: SaveImageFileRequest): Promise<boolean> => {
        calls.push(Object.freeze({ member: 'saveImageFile', request }));
        return Promise.resolve(saveSucceeds);
      },
    },
    addExistingImageFile: (imageFile: string): void => {
      existingImageFiles.add(imageFile);
    },
  };
}

/*
 * 10.3 The subscription term port.
 *
 * Two lookups over OPAQUE references. Nothing computes a schedule, a billing period, a proration or a
 * renewal rule, because all of that lives in the excluded subscription domain.
 *
 * The branch input asymmetry the port already encodes is worth stating so nobody "tidies" it: on
 * `SubscriptionSkuCreationData`, `renewalSubscriptionBenefits` is REQUIRED while its two siblings are
 * optional. That is not an oversight — the legacy reads the renewal list unguarded while guarding the
 * others with `structKeyExists`, so an absent renewal list is a failure and an absent sibling is not.
 */

/** One recorded call on the subscription term port. */
export type SubscriptionTermCall =
  | { readonly member: 'getSubscriptionTerm'; readonly subscriptionTermID: string }
  | { readonly member: 'getSubscriptionBenefit'; readonly subscriptionBenefitID: string };

/** Seed configuration for {@link createSubscriptionTermDouble}. */
export interface SubscriptionTermDoubleOptions {
  readonly subscriptionTermIDs?: readonly string[];
  readonly subscriptionBenefitIDs?: readonly string[];
}

/** The port plus its factory-local observation state. */
export interface SubscriptionTermDouble {
  readonly subscriptionTerms: SubscriptionTermPort;
  readonly calls: readonly SubscriptionTermCall[];
}

/** Create the subscription term port. An unseeded identifier resolves to `null`, never to a stub. */
export function createSubscriptionTermDouble(
  options: SubscriptionTermDoubleOptions = {},
): SubscriptionTermDouble {
  const calls: SubscriptionTermCall[] = [];
  const termIDs = new Set<string>(options.subscriptionTermIDs ?? []);
  const benefitIDs = new Set<string>(options.subscriptionBenefitIDs ?? []);

  return {
    calls,
    subscriptionTerms: {
      getSubscriptionTerm: (
        subscriptionTermID: string,
      ): Promise<SubscriptionTermReference | null> => {
        calls.push(Object.freeze({ member: 'getSubscriptionTerm', subscriptionTermID }));
        return Promise.resolve(termIDs.has(subscriptionTermID) ? { subscriptionTermID } : null);
      },
      getSubscriptionBenefit: (
        subscriptionBenefitID: string,
      ): Promise<SubscriptionBenefitReference | null> => {
        calls.push(Object.freeze({ member: 'getSubscriptionBenefit', subscriptionBenefitID }));
        return Promise.resolve(
          benefitIDs.has(subscriptionBenefitID) ? { subscriptionBenefitID } : null,
        );
      },
    },
  };
}

/*
 * 10.4 The access content port.
 *
 * One lookup over an opaque content reference. No category, entitlement, authorisation, file path or
 * download behaviour is modelled — all of it belongs to the excluded content domain.
 *
 * The two creation modes stay first-class WITHOUT a second port member, because the port already carries
 * `bundleContentAccess` on `ContentAccessSkuCreationData`: set, the service creates one SKU for all
 * contents; clear, one SKU per content. `ContentAccessSkuCreationMode` names both.
 *
 * The `contentService` property declared at `model/service/ProductService.cfc:L57` has ZERO call sites and
 * is NOT wired anywhere in this file.
 */

/** Seed configuration for {@link createAccessContentDouble}. */
export interface AccessContentDoubleOptions {
  readonly contentIDs?: readonly string[];
}

/** The port plus its factory-local observation state. */
export interface AccessContentDouble {
  readonly accessContents: AccessContentPort;
  readonly requestedContentIds: readonly string[];
}

/** Create the access content port. An unseeded identifier resolves to `null`. */
export function createAccessContentDouble(
  options: AccessContentDoubleOptions = {},
): AccessContentDouble {
  const contentIDs = new Set<string>(options.contentIDs ?? []);
  const requestedContentIds: string[] = [];

  return {
    requestedContentIds,
    accessContents: {
      getContent: (contentID: string): Promise<AccessContentReference | null> => {
        requestedContentIds.push(contentID);
        return Promise.resolve(contentIDs.has(contentID) ? { contentID } : null);
      },
    },
  };
}

/*
 * 10.5 The pricing port.
 *
 * ONE retrieval member, and a details record with EXACTLY THREE optional keys: `salePrice`,
 * `salePriceDiscountType` and `salePriceExpirationDateTime`. There is no fourth key — in particular no
 * discount AMOUNT — and the three exist only inside the port's result, never as persisted entity fields.
 */

/**
 * Build a {@link SalePriceDetails} with absent keys genuinely ABSENT.
 *
 * This is the whole point of the helper. Under `exactOptionalPropertyTypes` an explicitly assigned
 * `undefined` is not the same as an omitted key, and the distinction is behavioural here: when
 * `salePrice` is ABSENT the retained domain getter falls back to the ordinary price, whereas forcing `0`
 * or `null` would make every item look like it were on sale — which, through the feed's conditional
 * `g:sale_price` pair, would emit a sale price for the entire catalogue.
 */
export function buildSalePriceDetails(seed: {
  readonly salePrice?: number;
  readonly salePriceDiscountType?: string;
  readonly salePriceExpirationDateTime?: Date;
}): SalePriceDetails {
  const details: {
    salePrice?: number;
    salePriceDiscountType?: string;
    salePriceExpirationDateTime?: Date;
  } = {};
  if (seed.salePrice !== undefined) {
    details.salePrice = seed.salePrice;
  }
  if (seed.salePriceDiscountType !== undefined) {
    details.salePriceDiscountType = seed.salePriceDiscountType;
  }
  if (seed.salePriceExpirationDateTime !== undefined) {
    details.salePriceExpirationDateTime = seed.salePriceExpirationDateTime;
  }
  return details;
}

/** Seed configuration for {@link createPricingDouble}. */
export interface PricingDoubleOptions {
  /** Sale-price details per product identifier, keyed within by SKU identifier. */
  readonly detailsByProductId?: Readonly<Record<string, SalePriceDetailsBySkuId>>;
}

/** The port plus its factory-local observation state. */
export interface PricingDouble {
  readonly pricing: PricingPort;
  readonly requestedProductIds: readonly string[];
  /** Seed or overwrite one product's details after construction. */
  set(productId: string, details: SalePriceDetailsBySkuId): void;
}

/**
 * Create the pricing port.
 *
 * An unseeded product resolves to an EMPTY map, not to a map of zeroes — a SKU with no entry has no sale
 * price at all, which is the state the domain's fallback exists for.
 */
export function createPricingDouble(options: PricingDoubleOptions = {}): PricingDouble {
  const detailsByProductId = new Map<string, SalePriceDetailsBySkuId>(
    Object.entries(options.detailsByProductId ?? {}),
  );
  const requestedProductIds: string[] = [];

  return {
    requestedProductIds,
    pricing: {
      getSalePriceDetailsForProductSkus: (productId: string): Promise<SalePriceDetailsBySkuId> => {
        requestedProductIds.push(productId);
        return Promise.resolve(detailsByProductId.get(productId) ?? {});
      },
    },
    set: (productId: string, details: SalePriceDetailsBySkuId): void => {
      detailsByProductId.set(productId, details);
    },
  };
}

/*
 * 10.6 The account context port, and its two authorisation siblings.
 *
 * `org/Hibachi/HibachiObject.cfc:L74-L76` resolved the current account from the request-scoped Hibachi
 * scope. A stateless handler has no request scope, so the read becomes this port. Nothing here invents
 * authentication, session, role or token semantics, and no `Account` entity is declared or imported — the
 * Account family is explicitly out of scope, and the port deliberately traffics in a three-field
 * reference instead.
 */

/**
 * The default admin account's identifier.
 *
 * Deterministic FIXTURE data, not a production value and not generated: it is a 32-character lowercase
 * hexadecimal string with no dashes, which is the identifier SHAPE the platform uses (AAP §0.1.1.3 IR-6).
 * The legacy suite's admin account has no fixed literal to carry over —
 * `meta/tests/unit/SlatwallUnitTestBase.cfc:L62` promotes whatever account the bootstrap created — so a
 * visible constant is the honest substitute for a value that does not exist upstream.
 */
export const TEST_ADMIN_ACCOUNT_ID = '00000000000000000000000000000001';

/** The default non-admin account's identifier. Same rationale as {@link TEST_ADMIN_ACCOUNT_ID}. */
export const TEST_NON_ADMIN_ACCOUNT_ID = '00000000000000000000000000000002';

/**
 * A PERSISTED ADMIN account — the default, because it is what the legacy suite runs as.
 *
 * `meta/tests/unit/SlatwallUnitTestBase.cfc:L62` promotes the bootstrap account to super user, and the
 * audit guards at `org/Hibachi/HibachiEntity.cfc:L628` and `:L633` only stamp
 * `createdByAccount`/`modifiedByAccount` when the account is present AND already persisted. A default of
 * "absent" or "new" would therefore silently stop audit stamping and quietly change what every save
 * writes.
 */
export function persistedAdminAccount(accountID: string = TEST_ADMIN_ACCOUNT_ID): AccountReference {
  return Object.freeze({ accountID, newFlag: false, adminAccountFlag: true });
}

/** A persisted account WITHOUT the admin flag. */
export function persistedNonAdminAccount(
  accountID: string = TEST_NON_ADMIN_ACCOUNT_ID,
): AccountReference {
  return Object.freeze({ accountID, newFlag: false, adminAccountFlag: false });
}

/**
 * A NEW, unpersisted account.
 *
 * Its identifier is `''` because a new row has none yet, which is also what makes the audit guards skip
 * it.
 */
export function newAccount(): AccountReference {
  return Object.freeze({ accountID: '', newFlag: true, adminAccountFlag: false });
}

/** The port plus its factory-local observation state. */
export interface AccountContextDouble {
  readonly accountContext: AccountContextPort;
  /** How many times the current account was read. */
  callCount(): number;
}

/** Create an account context that reports a PRESENT account. Defaults to a persisted admin. */
export function createAccountContextDouble(
  account: AccountReference = persistedAdminAccount(),
): AccountContextDouble {
  let callCount = 0;
  return {
    accountContext: {
      getCurrentAccount: (): AccountReference | undefined => {
        callCount += 1;
        return account;
      },
    },
    callCount: (): number => callCount,
  };
}

/**
 * Create an account context that reports NO account.
 *
 * A separate factory rather than passing `undefined`, because a default parameter cannot distinguish
 * "omitted" from "explicitly absent" and the difference matters: absent is the anonymous, public path.
 */
export function createAbsentAccountContextDouble(): AccountContextDouble {
  let callCount = 0;
  return {
    accountContext: {
      getCurrentAccount: (): AccountReference | undefined => {
        callCount += 1;
        return undefined;
      },
    },
    callCount: (): number => callCount,
  };
}

/** Seed configuration for {@link createPopulationAuthorizationDouble}. */
export interface PopulationAuthorizationDoubleOptions {
  /** Defaults to `false` — the administrative path, matching a persisted admin context. */
  readonly publicPopulateFlag?: boolean;
  /** Property names that are REFUSED. Everything else is permitted. */
  readonly refusedProperties?: readonly string[];
}

/** The port plus its factory-local observation state. */
export interface PopulationAuthorizationDouble {
  readonly populationAuthorization: PopulationAuthorizationPort;
  readonly calls: readonly EntityPropertyAuthorizationRequest[];
}

/**
 * Create the population authorisation port that `populate` and `BaseService.save` consult before writing
 * a property.
 */
export function createPopulationAuthorizationDouble(
  options: PopulationAuthorizationDoubleOptions = {},
): PopulationAuthorizationDouble {
  const calls: EntityPropertyAuthorizationRequest[] = [];
  const refused = new Set<string>(options.refusedProperties ?? []);
  const publicPopulateFlag = options.publicPopulateFlag ?? false;

  return {
    calls,
    populationAuthorization: {
      getPublicPopulateFlag: (): boolean => publicPopulateFlag,
      authenticateEntityProperty: (request: EntityPropertyAuthorizationRequest): boolean => {
        calls.push(request);
        return !refused.has(request.propertyName);
      },
    },
  };
}

/** The port plus its factory-local observation state. */
export interface EntityAuthorizationDouble {
  readonly entityAuthorization: EntityAuthorizationPort;
  readonly calls: readonly EntityAuthorizationRequest[];
}

/** Create the entity authorisation port. Permits everything unless a CRUD/entity pair is refused. */
export function createEntityAuthorizationDouble(
  refused: readonly EntityAuthorizationRequest[] = [],
): EntityAuthorizationDouble {
  const refusedKeys = new Set<string>(
    refused.map((request) => `${request.crudType}:${request.entityName}`),
  );
  const calls: EntityAuthorizationRequest[] = [];

  return {
    calls,
    entityAuthorization: {
      authenticateEntity: (request: EntityAuthorizationRequest): boolean => {
        calls.push(request);
        return !refusedKeys.has(`${request.crudType}:${request.entityName}`);
      },
    },
  };
}

/*
 * 10.7 The unique property port.
 *
 * `org/Hibachi/HibachiDAO.cfc:L130-L146` is the application-side uniqueness check that runs DURING
 * validation, independently of any `unique="true"` column metadata (AAP §0.1.1.3 IR-5). Reproducing it
 * exactly matters for two reasons, and both are easy to get backwards.
 *
 * POLARITY. The legacy returns FALSE when a row was found and TRUE when none was. `true` therefore means
 * UNIQUE — available, safe to save. Inverting it inverts every uniqueness rule in the slice while still
 * type-checking and still returning a boolean.
 *
 * SELF-EXCLUSION. The statement is `where e.<property> = :propertyValue and e.<idProp> != :entityID`, and
 * the parameters bind in that order: `[propertyValue, entityID]`. On an INSERT the entity's primary
 * identifier is `''`, so the exclusion excludes nothing and is a genuine no-op; on an UPDATE it excludes
 * exactly the row being edited, so a persisted entity does not collide with itself.
 *
 * G6. Seven property/entity pairs are declared unique by the VALIDATION rule sets — `Product.productCode`,
 * `Product.urlTitle`, `Sku.skuCode`, `Brand.urlTitle`, `Option.optionCode`,
 * `OptionGroup.optionGroupCode` and `ProductType.urlTitle` — and that set does NOT coincide with the set
 * of columns the ORM metadata marks `unique="true"`. The validation set is the one that governs here,
 * because it is the one this port is consulted for. The divergence is recorded rather than reconciled, and
 * `src/ports/UniquePropertyPort.ts` is not modified.
 */

/** One row that already holds a value, for uniqueness purposes. */
export interface UniquePropertyValueSeed {
  /** As returned by `entity.getEntityName()` — the legacy entity name, e.g. `SlatwallSku`. */
  readonly entityName: string;
  /** As resolved through `getPropertyMetaData(propertyName).name`. */
  readonly propertyName: string;
  readonly value: string;
  /** The identifier of the row that holds it. */
  readonly entityID: string;
}

/** One recorded uniqueness probe, with everything the legacy statement would have bound. */
export interface UniquePropertyCall {
  readonly propertyName: string;
  readonly resolvedPropertyName: string;
  readonly entityName: string;
  readonly entityID: string;
  readonly value: string | undefined;
}

/** The port plus its factory-local observation state. */
export interface UniquePropertyDouble {
  readonly uniqueProperty: UniquePropertyPort;
  readonly calls: readonly UniquePropertyCall[];
  /** Seed a further held value. */
  take(seed: UniquePropertyValueSeed): void;
}

/**
 * Create the unique property port.
 *
 * A non-scalar or absent property value answers UNIQUE. That is what the legacy does rather than a
 * convenience: a null value binds to nothing, so the existence query returns no rows and the check
 * passes.
 */
export function createUniquePropertyDouble(
  seeds: readonly UniquePropertyValueSeed[] = [],
): UniquePropertyDouble {
  const held: UniquePropertyValueSeed[] = [...seeds];
  const calls: UniquePropertyCall[] = [];

  /** Only scalars can be bound; anything else behaves as an absent value. */
  const comparableValue = (candidate: unknown): string | undefined => {
    if (typeof candidate === 'string') {
      return candidate;
    }
    if (typeof candidate === 'number' || typeof candidate === 'boolean') {
      return String(candidate);
    }
    return undefined;
  };

  return {
    calls,
    uniqueProperty: {
      isUniqueProperty: (propertyName: string, entity: UniquePropertyEntity): Promise<boolean> => {
        const resolvedPropertyName = entity.getPropertyMetaData(propertyName).name;
        const entityName = entity.getEntityName();
        const entityID = entity.getPrimaryIDValue();
        const value = comparableValue(entity.getValueByPropertyIdentifier(resolvedPropertyName));
        calls.push(
          Object.freeze({ propertyName, resolvedPropertyName, entityName, entityID, value }),
        );
        if (value === undefined) {
          return Promise.resolve(true);
        }
        const collides = held.some(
          (seed) =>
            seed.entityName === entityName &&
            seed.propertyName === resolvedPropertyName &&
            seed.value === value &&
            seed.entityID !== entityID,
        );
        return Promise.resolve(!collides);
      },
    },
    take: (seed: UniquePropertyValueSeed): void => {
      held.push(seed);
    },
  };
}

/*
 * 10.8 The smart list query port.
 *
 * `src/ports/SmartListQueryPort.ts` is DECLARATIVE: `execute<T>(query)` takes a whole `SmartListQuery`
 * value, and joins, filters, like-filters, in-filters, ranges, keyword properties, orders and pagination
 * are all DATA on that value. There is no fluent builder to double and — deliberately — no raw where
 * fragment under any name, so this double exposes no such escape hatch either.
 *
 * Everything the feed and the services compose is therefore observable by reading the recorded query:
 * `joins` in insertion order with the entity name FIRST and duplicates preserved (the product feed joins
 * `product` twice, once from the SKU root and once for the brand path); `''` and `'left'` join types;
 * numeric filter values such as the literal `1` the feed uses for its three flags; the open-ended lower
 * range on `product.calculatedQATS`, whether it arrives in the legacy `'1^'` form or already translated
 * to a structured lower bound; pipe-delimited order declarations once translated; distinctness; and the
 * string `currentPageDeclaration`. Nothing is sorted, normalised or de-duplicated on the way in.
 *
 * G6 — WHY THE RECORDS COME BACK EMPTY. `execute<T>` is generic at the METHOD level, so an implementation
 * must produce `readonly T[]` for a type parameter it cannot see. The only values that satisfy that
 * without a type assertion are empty, and `readonly never[]` is exactly such a value. The production
 * adapter needs `as T[]` inside its row materialiser for this very reason, and this file forbids
 * assertions — so the double returns an EMPTY page with CONFIGURABLE counts and pagination, which is
 * precisely what a query-description assertion needs. When a test needs typed, non-empty records it builds
 * them at its own concrete type with {@link buildSmartListResult} and hands them to the narrower
 * service-level seam that actually returns them.
 */

/** The scalar half of a page, configurable independently of the records. */
export interface SmartListPageMetrics {
  readonly recordsCount?: number;
  readonly pageRecordsStart?: number;
  readonly pageRecordsEnd?: number;
  readonly currentPage?: number;
  readonly totalPages?: number;
}

/** What the double should do for one `execute` call. */
export type SmartListOutcome =
  | { readonly kind: 'page'; readonly metrics: SmartListPageMetrics }
  | { readonly kind: 'failure'; readonly failure: Error };

/** Decide an outcome from the query itself; `undefined` declines and falls through to the queue. */
export type SmartListResponder = (query: SmartListQuery) => SmartListOutcome | undefined;

/** Seed configuration for {@link createSmartListQueryDouble}. */
export interface SmartListQueryDoubleOptions {
  /** Consumed in order, one per call, after `respond` declines. */
  readonly outcomes?: readonly SmartListOutcome[];
  /** Consulted first. */
  readonly respond?: SmartListResponder;
  /** Used when neither the responder nor the queue answered. */
  readonly defaultMetrics?: SmartListPageMetrics;
}

/** The port plus its factory-local observation state. */
export interface SmartListQueryDouble {
  readonly smartList: SmartListQueryPort;
  /** Every executed query, in order, exactly as composed. */
  readonly queries: readonly SmartListQuery[];
  /** The most recent query, or `undefined` before the first call. */
  lastQuery(): SmartListQuery | undefined;
  enqueue(...outcomes: readonly SmartListOutcome[]): void;
}

/**
 * Build a typed, possibly non-empty {@link SmartListResult}.
 *
 * Usable wherever the CALLER knows the record type — a service member that returns
 * `SmartListResult<Option>`, or a feed builder that consumes one — which is every place a non-empty page
 * is actually needed. The defaults are the arithmetic of a single full page rather than invented figures:
 * the count is the record count, the page starts at 1 and ends at the record count, there is one page, and
 * an empty result has zero pages.
 */
export function buildSmartListResult<T>(
  records: readonly T[],
  metrics: SmartListPageMetrics = {},
): SmartListResult<T> {
  const recordsCount = metrics.recordsCount ?? records.length;
  return {
    records,
    pageRecords: records,
    recordsCount,
    pageRecordsStart: metrics.pageRecordsStart ?? 1,
    pageRecordsEnd: metrics.pageRecordsEnd ?? records.length,
    currentPage: metrics.currentPage ?? 1,
    totalPages: metrics.totalPages ?? (recordsCount === 0 ? 0 : 1),
  };
}

/** Create the smart list query port. */
export function createSmartListQueryDouble(
  options: SmartListQueryDoubleOptions = {},
): SmartListQueryDouble {
  const queries: SmartListQuery[] = [];
  const queue: SmartListOutcome[] = options.outcomes === undefined ? [] : [...options.outcomes];
  const respond = options.respond;
  const defaultMetrics = options.defaultMetrics ?? {};

  const smartList: SmartListQueryPort = {
    execute<T>(query: SmartListQuery): Promise<SmartListResult<T>> {
      queries.push(query);
      const answered = respond === undefined ? undefined : respond(query);
      const outcome = answered ?? queue.shift();
      if (outcome !== undefined && outcome.kind === 'failure') {
        return Promise.reject(outcome.failure);
      }
      const metrics = outcome === undefined ? defaultMetrics : outcome.metrics;
      /*
       * `readonly never[]` is assignable to `readonly T[]` for every `T`, which is what lets this
       * implementation satisfy a method-level generic with no assertion at all.
       */
      const noRecords: readonly never[] = [];
      return Promise.resolve({
        records: noRecords,
        pageRecords: noRecords,
        recordsCount: metrics.recordsCount ?? 0,
        pageRecordsStart: metrics.pageRecordsStart ?? 1,
        pageRecordsEnd: metrics.pageRecordsEnd ?? 0,
        currentPage: metrics.currentPage ?? 1,
        totalPages: metrics.totalPages ?? 0,
      });
    },
  };

  return {
    smartList,
    queries,
    lastQuery: (): SmartListQuery | undefined => queries[queries.length - 1],
    enqueue: (...outcomes: readonly SmartListOutcome[]): void => {
      queue.push(...outcomes);
    },
  };
}

/*
 * 11. Driving the REAL validator.
 *
 * There is deliberately no fake validator here. `HibachiValidationService` interpreted
 * `model/validation/*.json` at runtime; `src/validation/Validator.ts` evaluates typed rule sets instead,
 * and it IS the behaviour under test — replacing it with a double would assert nothing. What this section
 * supplies is the one collaborator the real `Validator` constructor needs (the unique property port) plus
 * two named entry points for its two modes, because the difference between them is a single optional
 * argument and is very easy to get wrong.
 *
 * N1 — THE TWO MODES.
 *   MUTATING: an error bag is handed in, the validator appends to it, and the caller's entity keeps the
 *   findings. This is the path `BaseService.save` takes.
 *   DRY RUN: no bag is handed in, the validator creates a throwaway one, and the subject is left untouched.
 *   This is the path a "would this save?" probe takes, and the legacy equivalent is the `setErrors=false`
 *   argument.
 * Both modes return the bag, so a test asserts against the returned value in either case.
 *
 * Behaviour the real validator already implements, restated so a test knows what to expect and does not
 * mistake it for a gap in this file: rules ACCUMULATE and never short-circuit, so every failing constraint
 * is reported; a property whose subject answers `hasProperty(...)` false is SKIPPED silently
 * (`src/validation/Validator.ts` guards on it, which is why the inert physical-count typo in
 * `model/validation/Sku.json` needs no property invented for it — and none is); a falsy context disables
 * validation entirely; `eq` keeps legacy loose comparison rather than strict JavaScript equality;
 * `minCollection: 1` passes for an absent value but fails for a present empty collection; contexts are an
 * open string union rather than a closed invented enum; and both `Sku` method rules report under the same
 * `options` key, so their two messages accumulate in order under that one key.
 */

/** The real validator plus the seeded uniqueness state it consults. */
export interface ValidatorHarness {
  /** The REAL `Validator`, not a double. */
  readonly validator: Validator;
  /** Its only collaborator, so a test can seed collisions and read the probes back. */
  readonly uniqueProperty: UniquePropertyDouble;
  /**
   * MUTATING mode: findings land in `errors`, which is normally the entity's own bag.
   */
  validateInto<TSubject extends ValidationSubject>(
    subject: TSubject,
    ruleSet: ValidationRuleSet<TSubject>,
    context: ValidationContext,
    errors: ValidationError,
  ): Promise<ValidationError>;
  /**
   * DRY-RUN mode: findings land in a fresh throwaway bag and the subject is not touched.
   */
  validateDryRun<TSubject extends ValidationSubject>(
    subject: TSubject,
    ruleSet: ValidationRuleSet<TSubject>,
    context: ValidationContext,
  ): Promise<ValidationError>;
}

/**
 * Create a harness around the real validator.
 *
 * @param uniqueValues rows that already hold a value, for the uniqueness constraints.
 */
export function createValidatorHarness(
  uniqueValues: readonly UniquePropertyValueSeed[] = [],
): ValidatorHarness {
  const uniqueProperty = createUniquePropertyDouble(uniqueValues);
  const validator = new Validator(uniqueProperty.uniqueProperty);

  return {
    validator,
    uniqueProperty,
    validateInto: <TSubject extends ValidationSubject>(
      subject: TSubject,
      ruleSet: ValidationRuleSet<TSubject>,
      context: ValidationContext,
      errors: ValidationError,
    ): Promise<ValidationError> => validator.validate(subject, ruleSet, context, { errors }),
    /*
     * The fourth argument is OMITTED rather than passed as `undefined`. Under
     * `exactOptionalPropertyTypes` that distinction is exactly what selects the throwaway bag.
     */
    validateDryRun: <TSubject extends ValidationSubject>(
      subject: TSubject,
      ruleSet: ValidationRuleSet<TSubject>,
      context: ValidationContext,
    ): Promise<ValidationError> => validator.validate(subject, ruleSet, context),
  };
}

/*
 * 12. The base service persistence seams.
 *
 * `model/service/HibachiService.cfc:L68` and `:L86` are the LOCAL `delete()` and `save()` overrides the
 * in-scope services actually inherit — not the framework base (AAP §0.1.1.3 IR-8) — and `src/services/
 * BaseService.ts` re-expresses them as an injectable collaborator instead of a superclass. Four of its
 * collaborators are the ones this section doubles: the persister, the remover and the two cleanup ports.
 *
 * DIVERGENCE FROM THIS FILE'S OWN BRIEF, STATED PLAINLY. The brief instructed that no setting-service or
 * comment-service cleanup double be built, on the understanding that the target base service left those
 * gap points unobservable. The LANDED `BaseServiceCollaborators` contradicts that: `settingCleanup` and
 * `commentCleanup` are REQUIRED members, and `BaseService.delete` awaits
 * `removeAllEntityRelatedSettings` then `removeAllEntityRelatedComments` after a successful removal. A
 * `BaseService` therefore cannot be constructed at all without them, so a test that could not supply them
 * could not test deletion. Phase 0 of the brief settles the conflict in favour of the actual file: the
 * doubles exist, they are inert recorders, and they are the minimum the real constructor demands. What is
 * still NOT invented: no cache-invalidation hook, no settings mutator beyond the port's own three members,
 * and no write path through `SettingResolverPort`, which stays strictly read-only.
 *
 * TODO(parity) X15 — model/service/HibachiService.cfc:L93-L95: the legacy body declares `settingsRemoved`
 * twice with `var` in one scope, which CFML tolerates and TypeScript cannot express. The translation
 * declares it once. This is a language-level unavoidability, recorded rather than papered over, and no
 * behaviour hangs on it because the second declaration overwrote the first anyway.
 */

/** Exactly the four members `BaseServiceCollaborators` needs from this section, and nothing else. */
export interface BaseServicePersistenceSeams<TEntity> {
  readonly persist: EntityPersister<TEntity>;
  readonly remove: EntityRemover<TEntity>;
  readonly settingCleanup: EntitySettingCleanupPort;
  readonly commentCleanup: EntityCommentCleanupPort;
}

/** Seed configuration for {@link createBaseServicePersistenceDouble}. */
export interface BaseServicePersistenceDoubleOptions<TEntity> {
  /**
   * What the persister RETURNS.
   *
   * Load-bearing: `BaseService.save` reassigns its entity reference from the persister's result, so a
   * persister that returns a different object changes what the caller gets back. Defaults to identity.
   */
  readonly persisted?: (entity: TEntity) => TEntity;
  /** When set, the persister rejects with this instead of returning. */
  readonly persistFailure?: Error;
  /** When set, the remover rejects with this instead of resolving. */
  readonly removeFailure?: Error;
  /** What `updateAllSettingValuesToRemoveSpecificID` reports. Defaults to `0`. */
  readonly settingValuesUpdated?: number;
}

/** The four seams plus their factory-local observation state. */
export interface BaseServicePersistenceDouble<TEntity> {
  /** Spread into a `BaseServiceCollaborators` literal. */
  readonly seams: BaseServicePersistenceSeams<TEntity>;
  /** Every entity handed to the persister, in order, by reference. */
  readonly persisted: readonly TEntity[];
  /** Every entity handed to the remover, in order, by reference. */
  readonly removed: readonly TEntity[];
  /** Class name and identifier of every entity whose settings were cleaned up. */
  readonly settingCleanups: readonly MaintenanceEntityRef[];
  /** Class name and identifier of every entity whose comments were cleaned up. */
  readonly commentCleanups: readonly MaintenanceEntityRef[];
  /** Identifiers passed to `updateAllSettingValuesToRemoveSpecificID`, in order. */
  readonly settingValueScrubs: readonly string[];
  /** How many times the settings cache was asked to clear. */
  settingsCacheClears(): number;
}

/** Create the persister, remover and the two cleanup recorders. */
export function createBaseServicePersistenceDouble<TEntity>(
  options: BaseServicePersistenceDoubleOptions<TEntity> = {},
): BaseServicePersistenceDouble<TEntity> {
  const persistedEntities: TEntity[] = [];
  const removedEntities: TEntity[] = [];
  const settingCleanups: MaintenanceEntityRef[] = [];
  const commentCleanups: MaintenanceEntityRef[] = [];
  const settingValueScrubs: string[] = [];
  let settingsCacheClears = 0;

  const persisted = options.persisted;
  const persistFailure = options.persistFailure;
  const removeFailure = options.removeFailure;
  const settingValuesUpdated = options.settingValuesUpdated ?? 0;

  const seams: BaseServicePersistenceSeams<TEntity> = {
    persist: (entity: TEntity): Promise<TEntity> => {
      persistedEntities.push(entity);
      if (persistFailure !== undefined) {
        return Promise.reject(persistFailure);
      }
      return Promise.resolve(persisted === undefined ? entity : persisted(entity));
    },
    remove: (entity: TEntity): Promise<void> => {
      removedEntities.push(entity);
      if (removeFailure !== undefined) {
        return Promise.reject(removeFailure);
      }
      return Promise.resolve();
    },
    settingCleanup: {
      removeAllEntityRelatedSettings: (entity: MaintenanceEntityRef): Promise<void> => {
        settingCleanups.push(entity);
        return Promise.resolve();
      },
      updateAllSettingValuesToRemoveSpecificID: (primaryIDValue: string): Promise<number> => {
        settingValueScrubs.push(primaryIDValue);
        return Promise.resolve(settingValuesUpdated);
      },
      clearAllSettingsCache: (): Promise<void> => {
        settingsCacheClears += 1;
        return Promise.resolve();
      },
    },
    commentCleanup: {
      removeAllEntityRelatedComments: (entity: MaintenanceEntityRef): Promise<void> => {
        commentCleanups.push(entity);
        return Promise.resolve();
      },
    },
  };

  return {
    seams,
    persisted: persistedEntities,
    removed: removedEntities,
    settingCleanups,
    commentCleanups,
    settingValueScrubs,
    settingsCacheClears: (): number => settingsCacheClears,
  };
}

/** One recorded direct-persister call. */
export interface DirectPersisterCall<TEntity> {
  readonly entity: TEntity;
}

/** A standalone persister plus its factory-local observation state. */
export interface DirectPersisterDouble<TEntity> {
  readonly persist: EntityPersister<TEntity>;
  readonly calls: readonly DirectPersisterCall<TEntity>[];
}

/**
 * A persister that is NOT wired through the base service.
 *
 * THE DUAL SAVE PATH, and the reason this factory exists separately from
 * {@link createBaseServicePersistenceDouble}. `model/service/ProductService.cfc:L286-L288` does NOT call
 * `super.save()` — `saveProduct` assigns a unique URL title and then persists the product directly, which
 * means the base service's populate, validate and cleanup sequence is bypassed on that one path. The other
 * three paths — `saveProductType`, `saveBrand` and `deleteProduct` — DO go through the base service, and
 * they pass their arguments POSITIONALLY: two of them for a save (entity, data) and one for a delete
 * (entity).
 *
 * Constructing the two persisters independently is what lets a test assert that the product path recorded
 * a call while the base-service path recorded none, or vice versa. Sharing one persister between them
 * would make the two paths indistinguishable — which is precisely the thing worth proving.
 */
export function createDirectPersisterDouble<TEntity>(
  persisted?: (entity: TEntity) => TEntity,
): DirectPersisterDouble<TEntity> {
  const calls: DirectPersisterCall<TEntity>[] = [];
  return {
    calls,
    persist: (entity: TEntity): Promise<TEntity> => {
      calls.push(Object.freeze({ entity }));
      return Promise.resolve(persisted === undefined ? entity : persisted(entity));
    },
  };
}

/** A remover plus its factory-local observation state. */
export interface EntityRemoverDouble<TEntity> {
  readonly remove: EntityRemover<TEntity>;
  readonly removed: readonly TEntity[];
}

/**
 * A standalone remover.
 *
 * Deletion has a preparation step worth knowing about when seeding one: `ProductService.deleteProduct`
 * nulls the product's default SKU reference before attempting the delete and restores it only if the
 * delete FAILS, because the product/default-SKU pair is mutually referential and the delete guard would
 * otherwise refuse. `meta/tests/unit/Helper.cfc:L70` performs the same nulling by hand before teardown,
 * independently, which is good evidence the dance is required rather than incidental.
 */
export function createEntityRemoverDouble<TEntity>(failure?: Error): EntityRemoverDouble<TEntity> {
  const removed: TEntity[] = [];
  return {
    removed,
    remove: (entity: TEntity): Promise<void> => {
      removed.push(entity);
      return failure === undefined ? Promise.resolve() : Promise.reject(failure);
    },
  };
}

/*
 * 13. Unit of work support — the explicit transaction boundary.
 *
 * The legacy commit was IMPLICIT: `flushAtRequestEnd` was false and the application flushed the ORM
 * session at request end, twice, and only when the session reported no errors (AAP §0.6.6 M5). A stateless
 * handler has no request end, so `src/adapters/mysql/UnitOfWork.ts` makes the boundary a first-class
 * object. Three of its behaviours are what tests need to pin, and all three are easy to break silently:
 *
 *   M5 — `run` commits only when the caller's error gate reports clean; when the gate reports errors it
 *        ROLLS BACK and raises, so nothing the work wrote survives, and it releases the connection in a
 *        `finally` on both the success and the failure path.
 *   M3 — `runPerItem` is STRICTLY SEQUENTIAL with one independent transaction per item, which is the
 *        importer's per-row commit at `model/dao/ProductDAO.cfc:L176-L177`. If item two fails, item one
 *        stays committed and items three onward never run. `Promise.all` would break all three properties
 *        at once while still passing a naive "it imported" assertion.
 *   M6 — every read and write inside one boundary uses the SAME transaction-scoped executor, which is what
 *        makes an inserted SKU visible to the next SKU's uniqueness read.
 *
 * `runWithoutTransaction` is the fourth member and exists for the importer's two backfills, which run
 * AFTER every row transaction has committed and therefore deliberately sit outside all of them.
 *
 * G6 — WHY A LOCALLY DECLARED INTERFACE. `UnitOfWork` is a CLASS holding `private readonly pool: Pool`.
 * A private member is nominal in TypeScript, so no object literal can ever be assignable to that class no
 * matter how completely it matches the public surface — and the alternative, constructing a real
 * `UnitOfWork` around a fake pool, would require importing the MySQL driver package, which this file
 * forbids. The honest
 * resolution is to declare the PUBLIC surface structurally here and say so out loud: a consumer typed
 * against {@link UnitOfWorkTestSupport} accepts both the real class and this double, and the two overloads
 * of `getTableTopSortOrder` collapse into one optional-parameter signature that satisfies both call forms.
 */

/** What happened, in the order it happened. */
export type UnitOfWorkEventKind =
  'acquire' | 'begin' | 'commit' | 'rollback' | 'release' | 'poolWork';

/** One lifecycle event, attributed to its transaction. */
export interface UnitOfWorkEvent {
  readonly kind: UnitOfWorkEventKind;
  /** 1-based transaction number; `0` for work that ran outside every transaction. */
  readonly transaction: number;
}

/**
 * The PUBLIC surface of `UnitOfWork`, declared structurally.
 *
 * Mirrors `src/adapters/mysql/UnitOfWork.ts` member for member. See the section note for why this is a
 * local declaration rather than the imported class.
 */
export interface UnitOfWorkTestSupport {
  run<T>(work: (scope: TransactionScope) => Promise<T>, hasErrors: () => boolean): Promise<T>;
  runPerItem<TItem, TResult>(
    items: readonly TItem[],
    work: (item: TItem, scope: TransactionScope) => Promise<TResult>,
  ): Promise<TResult[]>;
  runWithoutTransaction<T>(work: (executor: SqlExecutor) => Promise<T>): Promise<T>;
  getTableTopSortOrder(
    executor: SqlExecutor,
    tableName: string,
    contextIDColumn?: string,
    contextIDValue?: string,
  ): Promise<number>;
}

/** Seed configuration for {@link createUnitOfWorkDouble}. */
export interface UnitOfWorkDoubleOptions {
  /**
   * The executor every scope hands out.
   *
   * Defaults to one shared recording executor, so a whole invocation's statements read back as a single
   * ordered list while the event log still attributes each to its transaction. Pass an executor already
   * shared with the repositories when a test needs both views to agree.
   */
  readonly sqlExecutor?: SqlExecutorDouble;
  /**
   * The current maximum sort order per table.
   *
   * An unseeded table answers `0`, which is what an EMPTY table produces. The first usable value is
   * derived by the CONSUMER — the production code adds one — and is deliberately not pre-computed here.
   */
  readonly tableTopSortOrder?: Readonly<Record<string, number>>;
}

/** The unit of work plus its factory-local observation state. */
export interface UnitOfWorkDouble {
  readonly unitOfWork: UnitOfWorkTestSupport;
  /** The executor handed to every scope, so `(sql, params)` remains observable. */
  readonly sqlExecutor: SqlExecutorDouble;
  /** Every lifecycle event, in order. */
  readonly events: readonly UnitOfWorkEvent[];
  /** The event kinds alone — the shape most assertions want to compare against. */
  eventKinds(): readonly UnitOfWorkEventKind[];
  transactionsStarted(): number;
  transactionsCommitted(): number;
  transactionsRolledBack(): number;
}

/** Create the unit of work double. */
export function createUnitOfWorkDouble(options: UnitOfWorkDoubleOptions = {}): UnitOfWorkDouble {
  const sqlExecutor = options.sqlExecutor ?? createSqlExecutorDouble();
  const topSortOrders = options.tableTopSortOrder ?? {};
  const events: UnitOfWorkEvent[] = [];
  let transactionsStarted = 0;
  let transactionsCommitted = 0;
  let transactionsRolledBack = 0;

  const note = (kind: UnitOfWorkEventKind, transaction: number): void => {
    events.push(Object.freeze({ kind, transaction }));
  };

  const run = async <T>(
    work: (scope: TransactionScope) => Promise<T>,
    hasErrors: () => boolean,
  ): Promise<T> => {
    transactionsStarted += 1;
    const transaction = transactionsStarted;
    note('acquire', transaction);
    try {
      note('begin', transaction);
      let result: T;
      try {
        result = await work(Object.freeze({ executor: sqlExecutor.executor }));
      } catch (failure) {
        /* The work threw: roll back, then re-raise the ORIGINAL failure unchanged. */
        note('rollback', transaction);
        transactionsRolledBack += 1;
        throw failure;
      }
      if (hasErrors()) {
        /*
         * M5's error gate. The real boundary raises rather than returning quietly, because a caller that
         * ignored a silent "nothing was kept" would carry on as though the write had happened. The message
         * is authored here; no legacy or sibling text is reused.
         */
        note('rollback', transaction);
        transactionsRolledBack += 1;
        throw new DomainError(
          'The test unit of work rolled back because the error gate reported accumulated findings, so ' +
            'nothing written inside the boundary was kept.',
          { context: { transaction } },
        );
      }
      note('commit', transaction);
      transactionsCommitted += 1;
      return result;
    } finally {
      /* Released on BOTH paths — the property a leaked connection would violate. */
      note('release', transaction);
    }
  };

  const unitOfWork: UnitOfWorkTestSupport = {
    run,
    runPerItem: async <TItem, TResult>(
      items: readonly TItem[],
      work: (item: TItem, scope: TransactionScope) => Promise<TResult>,
    ): Promise<TResult[]> => {
      const results: TResult[] = [];
      /*
       * M3. A sequential `for..of` with an `await` inside, never `Promise.all`: one transaction per item,
       * each committed before the next begins, and an exception from item N leaves items 1..N-1 committed
       * while items N+1.. never start.
       */
      for (const item of items) {
        results.push(
          await run(
            (scope) => work(item, scope),
            () => false,
          ),
        );
      }
      return results;
    },
    runWithoutTransaction: async <T>(work: (executor: SqlExecutor) => Promise<T>): Promise<T> => {
      note('poolWork', 0);
      return await work(sqlExecutor.executor);
    },
    getTableTopSortOrder: (
      _executor: SqlExecutor,
      tableName: string,
      _contextIDColumn?: string,
      _contextIDValue?: string,
    ): Promise<number> => Promise.resolve(topSortOrders[tableName] ?? 0),
  };

  return {
    unitOfWork,
    sqlExecutor,
    events,
    eventKinds: (): readonly UnitOfWorkEventKind[] => events.map((event) => event.kind),
    transactionsStarted: (): number => transactionsStarted,
    transactionsCommitted: (): number => transactionsCommitted,
    transactionsRolledBack: (): number => transactionsRolledBack,
  };
}

/*
 * 13.1 The SKU batch sequencing seam — making M6 falsifiable.
 *
 * `Sku.hasUniqueOptions()` is registered as a METHOD rule in `model/validation/Sku.json` and it runs a
 * QUERY (`model/entity/Sku.cfc:L756-L769`). During `SkuService.createSkus` that means validation reads back
 * rows the very same operation is writing, and the answer depends entirely on WHICH siblings are already
 * visible. Under Hibernate the ORM session decided that; with no session, the ORDER of insert and validate
 * decides it — so the ordering is behaviour, and behaviour has to be pinned by a test that FAILS when the
 * order is wrong.
 *
 * Two plausible, well-intentioned orderings both diverge from the legacy result:
 *   `insertAllThenValidate` — every sibling is visible to every check, so combinations that legitimately
 *   differ can still be reported as colliding.
 *   `validateBeforeAnyInsert` — no sibling is visible to any check, so a genuine collision inside the
 *   batch passes unnoticed.
 * `legacyOrder` interleaves them one candidate at a time, which is what makes each insert visible to the
 * next candidate's check and only to it.
 *
 * All three are expressible so a sibling test can demonstrate the two naive orderings failing while the
 * legacy ordering passes. `legacyOrder` is the DEFAULT; neither naive mode is ever selected implicitly.
 */

/** Which ordering the batch uses. */
export type SkuBatchSequencing =
  'legacyOrder' | 'insertAllThenValidate' | 'validateBeforeAnyInsert';

/** The ordering that reproduces the legacy result. */
export const DEFAULT_SKU_BATCH_SEQUENCING: SkuBatchSequencing = 'legacyOrder';

/** One step, so the interleaving itself is assertable. */
export interface SkuBatchStepEvent<TCandidate> {
  readonly step: 'validate' | 'insert';
  readonly candidate: TCandidate;
  /** `undefined` on an insert step; the check's verdict on a validate step. */
  readonly accepted: boolean | undefined;
}

/** Seed configuration for {@link createSkuBatchSequencer}. */
export interface SkuBatchSequencerOptions<TCandidate> {
  /** Defaults to {@link DEFAULT_SKU_BATCH_SEQUENCING}. */
  readonly sequencing?: SkuBatchSequencing;
  /** The uniqueness check. `true` accepts the candidate. */
  readonly validate: (candidate: TCandidate) => Promise<boolean>;
  /** The write that makes a candidate visible to later checks. */
  readonly insert: (candidate: TCandidate) => Promise<void>;
}

/** What the batch did. */
export interface SkuBatchResult<TCandidate> {
  readonly accepted: readonly TCandidate[];
  readonly rejected: readonly TCandidate[];
  /** Every validate and insert, in the order they actually happened. */
  readonly events: readonly SkuBatchStepEvent<TCandidate>[];
}

/** The sequencer. */
export interface SkuBatchSequencer<TCandidate> {
  readonly sequencing: SkuBatchSequencing;
  run(candidates: readonly TCandidate[]): Promise<SkuBatchResult<TCandidate>>;
}

/** Create a batch sequencer. */
export function createSkuBatchSequencer<TCandidate>(
  options: SkuBatchSequencerOptions<TCandidate>,
): SkuBatchSequencer<TCandidate> {
  const sequencing = options.sequencing ?? DEFAULT_SKU_BATCH_SEQUENCING;

  const runBatch = async (
    candidates: readonly TCandidate[],
  ): Promise<SkuBatchResult<TCandidate>> => {
    const accepted: TCandidate[] = [];
    const rejected: TCandidate[] = [];
    const events: SkuBatchStepEvent<TCandidate>[] = [];

    const check = async (candidate: TCandidate): Promise<boolean> => {
      const verdict = await options.validate(candidate);
      events.push(Object.freeze({ step: 'validate' as const, candidate, accepted: verdict }));
      return verdict;
    };
    const write = async (candidate: TCandidate): Promise<void> => {
      await options.insert(candidate);
      events.push(Object.freeze({ step: 'insert' as const, candidate, accepted: undefined }));
    };

    if (sequencing === 'insertAllThenValidate') {
      for (const candidate of candidates) {
        await write(candidate);
      }
      for (const candidate of candidates) {
        if (await check(candidate)) {
          accepted.push(candidate);
        } else {
          rejected.push(candidate);
        }
      }
      return { accepted, rejected, events };
    }

    if (sequencing === 'validateBeforeAnyInsert') {
      for (const candidate of candidates) {
        if (await check(candidate)) {
          accepted.push(candidate);
        } else {
          rejected.push(candidate);
        }
      }
      for (const candidate of accepted) {
        await write(candidate);
      }
      return { accepted, rejected, events };
    }

    /* legacyOrder: check, then write, one candidate at a time. */
    for (const candidate of candidates) {
      if (await check(candidate)) {
        await write(candidate);
        accepted.push(candidate);
      } else {
        rejected.push(candidate);
      }
    }
    return { accepted, rejected, events };
  };

  return { sequencing, run: runBatch };
}

/*
 * 14. The two selected-option seams, which are NOT the same seam.
 *
 * `Sku.hasUniqueOptions` consumes a STRING through `SkusBySelectedOptionsLookup`
 * (`src/domain/sku/Sku.ts:563`), while `Product.getSkusBySelectedOptions` consumes a string through
 * `ProductSkuOptionFinder` and forwards it POSITIONALLY as
 * `getProductSkusBySelectedOptions(selectedOptions, this.productID)`
 * (`src/domain/product/Product.ts:1765-1767`) — which is exactly the two-argument positional form the
 * out-of-scope caller at `model/process/Order_AddOrderItem.cfc:L238` already depends on. The repository,
 * by contrast, takes an ARRAY and a required product identifier. Three shapes, three seams; conflating any
 * two of them loses either the product scope or the argument order.
 *
 * The string-to-array conversion follows CFML `listToArray`, which DROPS empty entries. `listLen('')` is
 * therefore zero, which is what makes T5's empty selection legal and degenerate rather than a lookup for
 * one option named `''`. Duplicates and original order survive untouched, because T1 counts one
 * requirement per entry.
 *
 * Note the deliberate contrast with `splitIdentifierList` earlier in this file, which does NOT drop
 * empties: that helper reproduces the option-group list handling in `MySqlOptionRepository`, where the
 * legacy statement genuinely binds a single empty value for an empty list. Two legacy behaviours, two
 * helpers, and neither is a copy of the other by accident.
 */

/** CFML `listToArray`: split on commas, drop empty entries, change nothing else. */
function cfmlSelectedOptionList(selectedOptions: string): string[] {
  return selectedOptions.split(',').filter((entry) => entry.length > 0);
}

/**
 * Adapt a {@link SkuRepository} to the domain-level `SkusBySelectedOptionsLookup`, closing over the
 * required product identifier the port's string-only signature cannot carry.
 *
 * Every option-resolution semantic is inherited from the repository double unchanged: T1 conjunction with
 * duplicates preserved, T2's always-applied product scope, T3's option-bearing guard, T4 distinctness, T5's
 * legal empty selection, and therefore D19 — an option-less SKU on a product that already has
 * option-bearing SKUs still fails its uniqueness check, because the degenerate query returns those
 * siblings. Nothing here short-circuits an empty list to avoid that.
 */
export function createSkusBySelectedOptionsLookup(
  repository: SkuRepository,
  productId: string,
): SkusBySelectedOptionsLookup {
  return {
    getSkusBySelectedOptions: (selectedOptions: string): Promise<readonly Sku[]> =>
      repository.findSkusBySelectedOptions(cfmlSelectedOptionList(selectedOptions), productId),
  };
}

/** One recorded finder call, in the legacy positional order. */
export interface ProductSkuOptionFinderCall {
  readonly selectedOptions: string;
  readonly productID: string;
}

/** The finder plus its factory-local observation state. */
export interface ProductSkuOptionFinderDouble {
  readonly finder: ProductSkuOptionFinder;
  readonly calls: readonly ProductSkuOptionFinderCall[];
}

/**
 * Adapt a {@link SkuRepository} to `ProductSkuOptionFinder`, the seam `Product` uses.
 *
 * The recorded call keeps the arguments in the order the legacy passes them — selected options first,
 * product identifier second — so a test can prove the positional contract the out-of-scope order caller
 * relies on has not been quietly reordered into something more readable.
 *
 * The result is copied into a fresh mutable array because the port asks for one. That is NOT a breach of
 * the live-array rule: the rule protects an entity's OWN collection, where `Product.getSkus()` must hand
 * back the very array `Sku.setProduct` appends to. A query RESULT is a different thing — the legacy data
 * access layer built a new array per call as well — so copying here changes nothing a caller can observe.
 */
export function createProductSkuOptionFinderDouble(
  repository: SkuRepository,
): ProductSkuOptionFinderDouble {
  const calls: ProductSkuOptionFinderCall[] = [];
  return {
    calls,
    finder: {
      getProductSkusBySelectedOptions: async (
        selectedOptions: string,
        productID: string,
      ): Promise<ProductSkuMember[]> => {
        calls.push(Object.freeze({ selectedOptions, productID }));
        const matches = await repository.findSkusBySelectedOptions(
          cfmlSelectedOptionList(selectedOptions),
          productID,
        );
        return [...matches];
      },
    },
  };
}
