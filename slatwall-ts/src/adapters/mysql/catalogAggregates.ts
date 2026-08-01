/**
 * Resolves the many-to-one associations a hydrated Catalog record needs before business logic reads it.
 *
 * AAP authority: AAP 0.4.4 authorises `slatwall-ts/src/adapters/mysql/**` | CREATE. This module is the
 * "aggregate loader" half of the Data Mapper pattern AAP 0.3.3 assigns to this layer; the scalar half
 * is `src/adapters/mysql/rowMappers.ts` and stays exactly as it is.
 *
 * =================================================================================================
 * WHY THIS FILE EXISTS — AND WHY THE FIX IS NOT "MAKE THE ROW MAPPERS RESOLVE ASSOCIATIONS"
 * =================================================================================================
 * `rowMappers.ts` RULE 3 is explicit and this module is written to obey it, not to work around it: a
 * row mapper hydrates scalar columns only, and every many-to-one field is left genuinely ABSENT rather
 * than filled with a stub. That rule states its own escape hatch, and this module is that hatch:
 *
 *   "A caller either resolves the association through the repository or gets a compile error. The
 *    foreign-key value is not lost either — the repository holds the same row and reads the `*ID`
 *    column itself when it needs to resolve the other side."
 *
 * That is precisely the mechanism here. Every loader below receives the RAW ROWS alongside the mapped
 * entities, reads the foreign-key column the mapper deliberately skipped, and resolves the other side
 * with its own parameterized statement. Nothing stubs, nothing guesses, and `rowMappers.ts` keeps its
 * invariant intact.
 *
 * ⚠️ TWO FINDINGS SHARE ONE ROOT CAUSE, WHICH IS WHY THEY SHARE ONE FIX. Both reported symptoms are the
 * same absent-association fault observed at two different roots:
 *
 *   INT-02 — `SmartListQueryBuilder` projects `<baseAlias>.*`, so a SKU smart list hydrates SKUs whose
 *            `product` is absent. The Google feed's first act is `requireProduct(sku)`, so EVERY item
 *            raised and the feed produced nothing.
 *   DATA-02 — the same builder rooted at `SlatwallOption` hydrates options whose `optionGroup` is
 *            absent. `OptionService.getOption` reads through that builder and
 *            `SkuService.createSkus` immediately calls `requireOptionGroupID(option)`, so EVERY
 *            merchandise SKU creation with options raised.
 *
 * Both are resolved by giving the builder a per-root loader rather than by patching either consumer:
 * the consumers' guards are correct and stay as they are. A guard that fires on absent data is doing
 * its job; the defect was that the data was absent.
 *
 * ⚠️ WHAT EACH ROOT LOADS IS DETERMINED BY WHAT ITS CONSUMERS ACTUALLY READ, not by loading everything
 * reachable. Eager-versus-lazy is this layer's decision to make (RULE 3), and it is made narrowly:
 *
 *   SlatwallSku      -> `product`, and on that product `productType`, `brand`, `defaultSku`.
 *                       `product.getPrice()` falls through to `defaultSku.getPrice()`, which is why the
 *                       default SKU is required and not merely convenient.
 *   SlatwallOption   -> `optionGroup`. Required, never optional [model/entity/Option.cfc:L59].
 *   SlatwallProduct  -> `productType`, `brand`, `defaultSku` and `skus`.
 *
 * The remaining three roots — `SlatwallProductType`, `SlatwallBrand`, `SlatwallOptionGroup` — and
 * `SlatwallAlternateSkuCode` declare NO loader. That is a decision, not an omission: `Brand` and
 * `OptionGroup` declare no many-to-one at all, and `ProductType.parentProductType` is not how the
 * hierarchy is read — `getBaseProductType` walks `productTypeIDPath` through an injected resolver, and
 * the tree query has its own dedicated projection. Declaring an empty loader for them would suggest
 * there was something to load.
 *
 * ⚠️ THE BRAND ASSOCIATION IS OPTIONAL AND STAYS OPTIONAL. `integrationServices/google/controllers/
 * feed.cfc` joins to brand with a LEFT join and the view guards the read at `product.cfm:L32`, so a
 * product with no brand is ordinary data rather than a fault. An absent `brandID`, or one naming a row
 * that no longer exists, leaves the field absent and raises nothing. `productType` is the opposite: the
 * view dereferences it unguarded, so its absence is left to surface at the consumer's own guard rather
 * than being masked here.
 *
 * ⚠️ ONE STATEMENT PER TABLE PER BATCH, NOT ONE PER ROW. Identifiers are collected and de-duplicated
 * across the whole batch before a single `IN (…)` statement is issued, so a page of fifty SKUs spanning
 * three products issues one product statement rather than fifty. Placeholders are generated to match the
 * identifier count and every value is bound (TR-4); no identifier is ever interpolated into the text.
 *
 * ⚠️ ORDER IS PRESERVED BECAUSE NOTHING IS REORDERED. Loaders mutate the entities they are given in
 * place and never re-sort, filter, replace or copy the arrays, so the caller's query order — which the
 * sorted-SKU odometer and the feed both depend on — survives untouched.
 *
 * ⛔ NOTHING HERE COMMITS, AND NOTHING HERE OPENS A CONNECTION. Every statement runs on the injected
 * executor, which is the same one the caller is using, so a load inside a transaction observes that
 * transaction's own uncommitted writes (M6). The boundary belongs to `src/adapters/mysql/UnitOfWork.ts`.
 *
 * No timeout, retry, batch-size cap, page size or cache lifetime appears below: the legacy declares
 * none and AAP 0.7.3 S9 forbids inventing one.
 */

import { SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE } from '../../domain/BaseProductType';
import { DataIntegrityError } from '../../errors/DomainError';
import { assertColumnName, assertTableName } from './QueryRunner';
import {
  mapBrandRow,
  mapOptionGroupRow,
  mapOptionRow,
  mapProductRow,
  mapProductTypeRow,
  mapSkuRow,
} from './rowMappers';

import type { Option } from '../../domain/option/Option';
import type { OptionGroup } from '../../domain/option/OptionGroup';
import type { Product, ProductDefaultSkuDelegate } from '../../domain/product/Product';
import type { Sku } from '../../domain/sku/Sku';
import type { SmartListEntityName } from '../../ports/SmartListQueryPort';
import type { PhysicalTableName, SqlExecutor } from './QueryRunner';
import type { MySqlRow } from './rowMappers';

/* ================================================================================================
 * THE TABLES AND COLUMNS THIS MODULE READS
 *
 * Every identifier goes through the same whitelist the rest of the adapter layer uses, so a typo is a
 * build failure rather than a statement that reaches the driver.
 * ============================================================================================== */

const PRODUCT_TABLE: PhysicalTableName = assertTableName('SwProduct');
const SKU_TABLE: PhysicalTableName = assertTableName('SwSku');
const PRODUCT_TYPE_TABLE: PhysicalTableName = assertTableName('SwProductType');
const BRAND_TABLE: PhysicalTableName = assertTableName('SwBrand');
const OPTION_GROUP_TABLE: PhysicalTableName = assertTableName('SwOptionGroup');
const SKU_OPTION_TABLE: PhysicalTableName = assertTableName('SwSkuOption');
const OPTION_TABLE: PhysicalTableName = assertTableName('SwOption');
const SKU_ACCESS_CONTENT_TABLE: PhysicalTableName = assertTableName('SwSkuAccessContent');
const SKU_SUBSCRIPTION_BENEFIT_TABLE: PhysicalTableName = assertTableName('SwSkuSubsBenefit');

/** The identifier and foreign-key columns each loader reads or filters on. */
const COLUMN = Object.freeze({
  productID: assertColumnName(PRODUCT_TABLE, 'productID'),
  productBrandID: assertColumnName(PRODUCT_TABLE, 'brandID'),
  productProductTypeID: assertColumnName(PRODUCT_TABLE, 'productTypeID'),
  productDefaultSkuID: assertColumnName(PRODUCT_TABLE, 'defaultSkuID'),
  skuID: assertColumnName(SKU_TABLE, 'skuID'),
  skuProductID: assertColumnName(SKU_TABLE, 'productID'),
  productTypeID: assertColumnName(PRODUCT_TYPE_TABLE, 'productTypeID'),
  brandID: assertColumnName(BRAND_TABLE, 'brandID'),
  optionGroupID: assertColumnName(OPTION_GROUP_TABLE, 'optionGroupID'),
  optionID: assertColumnName(OPTION_TABLE, 'optionID'),
  optionOptionGroupID: assertColumnName(OPTION_TABLE, 'optionGroupID'),
  skuOptionSkuID: assertColumnName(SKU_OPTION_TABLE, 'skuID'),
  skuOptionOptionID: assertColumnName(SKU_OPTION_TABLE, 'optionID'),
  accessContentSkuID: assertColumnName(SKU_ACCESS_CONTENT_TABLE, 'skuID'),
  accessContentContentID: assertColumnName(SKU_ACCESS_CONTENT_TABLE, 'contentID'),
  subscriptionBenefitSkuID: assertColumnName(SKU_SUBSCRIPTION_BENEFIT_TABLE, 'skuID'),
  subscriptionBenefitID: assertColumnName(SKU_SUBSCRIPTION_BENEFIT_TABLE, 'subscriptionBenefitID'),
});

/**
 * Builds an explicit, TABLE-QUALIFIED projection for one table.
 *
 * Explicit rather than `*` for the reason `MySqlSkuRepository` states about its own projection: it keeps
 * the statement stable if the physical table ever carries a column the entity does not declare. Column
 * order is immaterial — every mapper reads by name.
 *
 * ⭐ QUALIFICATION IS THE DEFAULT, AND IT IS THE FIX FOR A DEFECT THAT COULD ONLY BE SEEN ON A REAL
 * SERVER. This function used to return BARE column names. That is safe in the three single-table
 * statements below and FATAL in the one join: {@link attachSkuOptions} reads
 * `SwSkuOption link INNER JOIN SwOption`, and `optionID` is a column of BOTH tables, so MySQL refused
 * the whole statement with `ER_NON_UNIQ_ERROR (1052): Column 'optionID' in field list is ambiguous`.
 * `SwSkuOption.optionID` is the port's own schema contract — `MySqlSkuRepository.persistSku` writes
 * `INSERT INTO SwSkuOption (skuID, optionID)` and `findSkusBySelectedOptions` reads `so.optionID`
 * (AAP §0.3.3.1) — so the collision is structural rather than incidental, and every SKU-option fetch
 * through `SkuRepository.findByProduct` with `fetchOptions` raised failed on every invocation.
 *
 * ⚠️ FIXING THE ONE CALLER WOULD HAVE LEFT THE TRAP IN PLACE. A projection builder that takes a table
 * name and then discards it is an invitation: every `*_PROJECTION` constant below reads as safe, and the
 * next joined statement that reuses one reproduces the same failure with no warning. Qualifying HERE
 * makes every projection in this module safe in a join by construction, which is the difference between
 * fixing the instance and closing the class.
 *
 * ⚠️ THE QUALIFIER IS THE VALIDATED PHYSICAL TABLE NAME, NEVER A CALLER-SUPPLIED ALIAS. `table` has
 * already been through {@link assertTableName} — the parameter type admits nothing else — so the emitted
 * identifier is drawn from the same whitelist as the columns (AAP §0.7.3: "identifiers built only from
 * validated whitelists"). No alias parameter is accepted, because an alias is a free string and would
 * reopen the identifier surface the whitelist exists to close. Statements that need an ALIASED
 * projection build one from the whitelist themselves, as `MySqlSkuRepository.hydrateSkuOptions` does.
 *
 * ⚠️ AND IT COSTS NOTHING AT EITHER END. Every single-table statement in this module names its table in
 * `FROM` WITHOUT an alias, so `SwProduct.productID` resolves exactly as `productID` did; and the driver
 * returns result keys UNQUALIFIED (`productID`, not `SwProduct.productID`), so every row mapper reads
 * the same field names it always read and none of them changes.
 */
function projectionFor(table: PhysicalTableName, columns: readonly string[]): string {
  return columns.map((column) => `${table}.${assertColumnName(table, column)}`).join(', ');
}

const PRODUCT_PROJECTION = projectionFor(PRODUCT_TABLE, [
  'productID',
  'activeFlag',
  'urlTitle',
  'productName',
  'productCode',
  'productDescription',
  'publishedFlag',
  'sortOrder',
  'calculatedSalePrice',
  'calculatedQATS',
  'calculatedAllowBackorderFlag',
  'calculatedTitle',
  'brandID',
  'productTypeID',
  'defaultSkuID',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

const SKU_PROJECTION = projectionFor(SKU_TABLE, [
  'skuID',
  'activeFlag',
  'skuCode',
  'listPrice',
  'price',
  'renewalPrice',
  'imageFile',
  'userDefinedPriceFlag',
  'calculatedQATS',
  'productID',
  'subscriptionTermID',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

const PRODUCT_TYPE_PROJECTION = projectionFor(PRODUCT_TYPE_TABLE, [
  'productTypeID',
  'productTypeIDPath',
  'activeFlag',
  'publishedFlag',
  'urlTitle',
  'productTypeName',
  'productTypeDescription',
  'systemCode',
  'parentProductTypeID',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

const BRAND_PROJECTION = projectionFor(BRAND_TABLE, [
  'brandID',
  'activeFlag',
  'publishedFlag',
  'urlTitle',
  'brandName',
  'brandWebsite',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

const OPTION_GROUP_PROJECTION = projectionFor(OPTION_GROUP_TABLE, [
  'optionGroupID',
  'optionGroupName',
  'optionGroupCode',
  'optionGroupImage',
  'optionGroupDescription',
  'imageGroupFlag',
  'sortOrder',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

const OPTION_PROJECTION = projectionFor(OPTION_TABLE, [
  'optionID',
  'optionCode',
  'optionName',
  'optionDescription',
  'sortOrder',
  'optionGroupID',
  'defaultImageID',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

/* ================================================================================================
 * THE ONE COLLABORATOR THESE LOADERS CANNOT SUPPLY THEMSELVES
 * ============================================================================================== */

/**
 * What a caller must provide before the product and SKU roots can be resolved.
 *
 * ⛔ THE BINDER IS REQUIRED, NOT OPTIONAL, AND THAT IS DELIBERATE. `src/domain/sku/Sku.ts` records in
 * its own mismatch register that `Sku` IS INTENTIONALLY NOT ASSIGNABLE to
 * {@link ProductDefaultSkuDelegate}: the delegate wants nine synchronous, argument-free readers, while
 * the entity's image and currency equivalents are asynchronous and port-parameterised. The register also
 * names the resolution — "a thin binding adapter in the composition root closes over the ports and
 * satisfies the delegate" — and {@link SkuDefaultSkuDelegateBinder} on `SkuService` is the same
 * collaborator, injected the same way, for the same reason.
 *
 * ⛔ SO THIS MODULE DOES NOT CAST, DOES NOT INVENT `getImageDirectory` ON `Sku`, AND DOES NOT MAKE THE
 * BINDER OPTIONAL. A cast would be unsound and S1 forbids it; inventing the member would contradict
 * `model/entity/Sku.cfc`, which declares no such member, and S9 forbids it; and an optional binder would
 * mean `product.defaultSku` was silently left unresolved, which is exactly the class of half-load this
 * module exists to eliminate. `Product.getPrice()` falls through to `defaultSku.getPrice()`, so an
 * unresolved default SKU makes the Google feed emit an empty `<g:price>` for every item — a quiet wrong
 * answer rather than a failure.
 *
 * ⚠️ MAKING IT REQUIRED PUTS THE COMPILER IN CHARGE OF THE WIRING. Every site that constructs a
 * {@link SmartListQueryBuilder} must now supply these loaders, and therefore a binder, or the build
 * fails. That is a stronger guarantee than any comment, and it costs nothing today because no
 * construction site exists yet.
 */
export interface CatalogAggregateDependencies {
  /**
   * Adapts a hydrated SKU to the shape `Product.defaultSku` accepts.
   *
   * Assembling it needs the setting, pricing and image ports, none of which belong to this layer, so it
   * arrives as the function it is.
   */
  readonly bindDefaultSkuDelegate: (sku: Sku) => ProductDefaultSkuDelegate;
}

/* ================================================================================================
 * THE REQUEST SHAPE
 * ============================================================================================== */

/**
 * One batch of hydrated records whose associations are to be resolved.
 *
 * ⚠️ `rows` AND `entities` MUST BE INDEX-ALIGNED, because that alignment is the only thing connecting a
 * mapped entity to the foreign-key column its mapper skipped. The caller produced both from one result
 * set, so the alignment holds by construction; a loader that re-sorted either would break it silently,
 * which is why no loader here does.
 */
export interface AggregateLoadRequest {
  /**
   * The executor the caller is already using.
   *
   * Reusing it rather than reaching for a pool is what keeps M6 intact: inside a transaction, a load
   * observes that transaction's own uncommitted writes.
   */
  readonly executor: SqlExecutor;
  /** The raw rows, carrying the foreign-key columns the mappers deliberately skipped. */
  readonly rows: readonly MySqlRow[];
  /** The mapped entities, index-aligned with `rows` and mutated in place. */
  readonly entities: readonly unknown[];
}

/** Resolves the associations one root entity's consumers require. */
export type CatalogAggregateLoader = (request: AggregateLoadRequest) => Promise<void>;

/* ================================================================================================
 * READING FOREIGN KEYS OFF A RAW ROW
 * ============================================================================================== */

/**
 * Reads one foreign-key column as a non-empty string, or `undefined` when the association is absent.
 *
 * ⚠️ AN EMPTY STRING IS TREATED AS ABSENCE, NOT AS AN IDENTIFIER. `unsavedvalue=""` means the legacy
 * spells "no value yet" as the empty string as well as NULL (IR-6), so both must collapse to the same
 * answer or a `WHERE id = ''` statement would be issued for a row that simply has no association.
 *
 * @param row - one raw result row.
 * @param column - the whitelisted column name to read.
 * @returns the identifier, or `undefined` when the column is absent, NULL or empty.
 * @throws {DataIntegrityError} when the column holds something that is not a string. A foreign key that
 *   is not text is a schema disagreement, and guessing at a coercion would hide it.
 */
function readForeignKey(row: MySqlRow, column: string): string | undefined {
  const value = row[column];

  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new DataIntegrityError(
      'A Catalog foreign-key column holds a value that is not text, so the association it names ' +
        'could not be resolved. Every identifier in this schema is a 32-character string ' +
        '[model/entity/Sku.cfc:L52].',
      { context: { column, receivedType: typeof value } },
    );
  }

  return value;
}

/** Every distinct identifier the given column holds across the batch, in first-seen order. */
function collectIdentifiers(rows: readonly MySqlRow[], column: string): readonly string[] {
  const seen = new Set<string>();

  for (const row of rows) {
    const identifier = readForeignKey(row, column);
    if (identifier !== undefined) {
      seen.add(identifier);
    }
  }

  return [...seen];
}

/**
 * Loads rows from one table by identifier and indexes the mapped results.
 *
 * Issues NO statement for an empty identifier list — an `IN ()` clause is not legal SQL, and there is
 * nothing to ask for.
 *
 * @param request - the batch being resolved, for its executor.
 * @param table - the whitelisted table to read.
 * @param projection - that table's explicit column list.
 * @param idColumn - the whitelisted identifier column to filter on.
 * @param identifiers - the distinct identifiers wanted.
 * @param mapper - the scalar row mapper for this table.
 * @returns the mapped entities keyed by identifier, alongside the raw row for each.
 */
async function loadByIdentifiers<TEntity>(
  request: AggregateLoadRequest,
  table: PhysicalTableName,
  projection: string,
  idColumn: string,
  identifiers: readonly string[],
  mapper: (row: MySqlRow) => TEntity,
): Promise<Map<string, { readonly entity: TEntity; readonly row: MySqlRow }>> {
  const indexed = new Map<string, { readonly entity: TEntity; readonly row: MySqlRow }>();

  if (identifiers.length === 0) {
    return indexed;
  }

  const placeholders = identifiers.map(() => '?').join(', ');
  const rows = await request.executor.execute(
    `SELECT ${projection} FROM ${table} WHERE ${idColumn} IN (${placeholders})`,
    [...identifiers],
  );

  for (const row of rows) {
    const identifier = readForeignKey(row, idColumn);
    if (identifier !== undefined) {
      indexed.set(identifier, { entity: mapper(row), row });
    }
  }

  return indexed;
}

/* ================================================================================================
 * THE PRODUCT AGGREGATE, SHARED BY TWO ROOTS
 * ============================================================================================== */

/**
 * Resolves `productType`, `brand` and `defaultSku` on a batch of products.
 *
 * Shared by the product root and the SKU root rather than written twice, because "what a usable product
 * carries" is one answer and two copies of it would drift.
 *
 * ⚠️ ASSIGNED AS PLAIN FIELDS, NEVER THROUGH A SETTER — `rowMappers.ts` RULE 1. It also matters
 * specifically here: `Sku.setProduct` would append the SKU to `product.skus` as a side effect, so using
 * it to attach a default SKU would fabricate a collection membership the database never stated. Direct
 * assignment resolves the association and nothing else.
 *
 * @param request - the batch being resolved, for its executor.
 * @param dependencies - supplies the default-SKU delegate binder.
 * @param productRows - the raw product rows, carrying the three foreign keys.
 * @param products - the mapped products, index-aligned with `productRows`.
 */
async function attachProductAssociations(
  request: AggregateLoadRequest,
  dependencies: CatalogAggregateDependencies,
  productRows: readonly MySqlRow[],
  products: readonly Product[],
): Promise<void> {
  const productTypes = await loadByIdentifiers(
    request,
    PRODUCT_TYPE_TABLE,
    PRODUCT_TYPE_PROJECTION,
    COLUMN.productTypeID,
    collectIdentifiers(productRows, COLUMN.productProductTypeID),
    mapProductTypeRow,
  );

  const brands = await loadByIdentifiers(
    request,
    BRAND_TABLE,
    BRAND_PROJECTION,
    COLUMN.brandID,
    collectIdentifiers(productRows, COLUMN.productBrandID),
    mapBrandRow,
  );

  const defaultSkus = await loadByIdentifiers(
    request,
    SKU_TABLE,
    SKU_PROJECTION,
    COLUMN.skuID,
    collectIdentifiers(productRows, COLUMN.productDefaultSkuID),
    mapSkuRow,
  );

  products.forEach((product, index) => {
    const row = productRows[index];
    if (row === undefined) {
      return;
    }

    const productTypeID = readForeignKey(row, COLUMN.productProductTypeID);
    const resolvedProductType =
      productTypeID === undefined ? undefined : productTypes.get(productTypeID);
    if (resolvedProductType !== undefined) {
      product.productType = resolvedProductType.entity;
    }

    /* Optional by design — see the LEFT-join note in this module's header. */
    const brandID = readForeignKey(row, COLUMN.productBrandID);
    const resolvedBrand = brandID === undefined ? undefined : brands.get(brandID);
    if (resolvedBrand !== undefined) {
      product.brand = resolvedBrand.entity;
    }

    /* Bound through the injected adapter, never assigned directly — the entity does not satisfy the
     * delegate and deliberately never will. See {@link CatalogAggregateDependencies}. */
    const defaultSkuID = readForeignKey(row, COLUMN.productDefaultSkuID);
    const resolvedDefaultSku =
      defaultSkuID === undefined ? undefined : defaultSkus.get(defaultSkuID);
    if (resolvedDefaultSku !== undefined) {
      product.defaultSku = dependencies.bindDefaultSkuDelegate(resolvedDefaultSku.entity);
    }
  });
}

/* ================================================================================================
 * THE LOADERS
 * ============================================================================================== */

/**
 * `SlatwallSku` — attaches each SKU's product, fully associated. Resolves INT-02.
 *
 * The Google feed reads `sku.product`, then that product's `productType` (unguarded), `brand` (guarded)
 * and — through `product.getPrice()`'s fall-through — its `defaultSku`. All four are therefore resolved
 * here, in two waves: the products first, then their own associations.
 *
 * ⚠️ ONE PRODUCT INSTANCE PER PRODUCT, SHARED BY EVERY SKU THAT NAMES IT. Sibling SKUs of one product
 * observe the same object, which is what the mapping layer's identity semantics give them and what lets
 * a consumer compare products by reference.
 */
const createSkuAggregateLoader =
  (dependencies: CatalogAggregateDependencies): CatalogAggregateLoader =>
  async (request) => {
    const productIdentifiers = collectIdentifiers(request.rows, COLUMN.skuProductID);

    const products = await loadByIdentifiers(
      request,
      PRODUCT_TABLE,
      PRODUCT_PROJECTION,
      COLUMN.productID,
      productIdentifiers,
      mapProductRow,
    );

    const loaded = [...products.values()];
    await attachProductAssociations(
      request,
      dependencies,
      loaded.map((entry) => entry.row),
      loaded.map((entry) => entry.entity),
    );

    request.entities.forEach((entity, index) => {
      const row = request.rows[index];
      if (row === undefined) {
        return;
      }

      const productID = readForeignKey(row, COLUMN.skuProductID);
      const resolved = productID === undefined ? undefined : products.get(productID);
      if (resolved !== undefined) {
        (entity as Sku).product = resolved.entity;
      }
    });
  };

/**
 * `SlatwallOption` — attaches each option's option group. Resolves DATA-02.
 *
 * `model/entity/Option.cfc:L59` declares the relationship REQUIRED, and `SkuService.createSkus` reads it
 * for every selected option through `requireOptionGroupID`, so without this every merchandise SKU
 * creation carrying options raised.
 *
 * ⚠️ A MISSING GROUP IS LEFT ABSENT RATHER THAN RAISED HERE. The consumer's own guard already reports it
 * with the option identifier and the legacy locator, which is a better error than anything this loader
 * could produce, and raising here would also break the read paths that never touch the group.
 */
const loadOptionAggregates: CatalogAggregateLoader = async (request) => {
  const optionGroups = await loadByIdentifiers(
    request,
    OPTION_GROUP_TABLE,
    OPTION_GROUP_PROJECTION,
    COLUMN.optionGroupID,
    collectIdentifiers(request.rows, COLUMN.optionOptionGroupID),
    mapOptionGroupRow,
  );

  request.entities.forEach((entity, index) => {
    const row = request.rows[index];
    if (row === undefined) {
      return;
    }

    const optionGroupID = readForeignKey(row, COLUMN.optionOptionGroupID);
    const resolved = optionGroupID === undefined ? undefined : optionGroups.get(optionGroupID);
    if (resolved !== undefined) {
      (entity as Option).optionGroup = resolved.entity;
    }
  });
};

/**
 * `SlatwallProduct` — attaches `productType`, `brand`, `defaultSku` and `skus`.
 *
 * The first three come from the shared product aggregate. The SKU collection is loaded here because
 * `ProductService.getProduct` reads through this builder and its callers expect a usable product
 * aggregate.
 *
 * ⚠️ THE SKU COLLECTION IS FILLED BY PUSHING ONTO THE LIVE ARRAY, never by replacing it —
 * `rowMappers.ts` RULE 4 keeps entity collections live, and several domain members mutate the array they
 * are handed in place. Each SKU's own `product` back-reference is assigned directly for the same reason
 * `attachProductAssociations` does: `setProduct` would append a second time.
 *
 * ⚠️ EACH PRODUCT ENTITY RECEIVES ITS OWN SKU INSTANCES, mapped from the shared rows rather than shared
 * as objects. The reason is an object-identity one and is argued at the bucketing step below.
 */
const createProductAggregateLoader =
  (dependencies: CatalogAggregateDependencies): CatalogAggregateLoader =>
  async (request) => {
    const products = request.entities as readonly Product[];

    await attachProductAssociations(request, dependencies, request.rows, products);

    const productIdentifiers = collectIdentifiers(request.rows, COLUMN.productID);
    if (productIdentifiers.length === 0) {
      return;
    }

    const placeholders = productIdentifiers.map(() => '?').join(', ');
    const skuRows = await request.executor.execute(
      `SELECT ${SKU_PROJECTION} FROM ${SKU_TABLE} WHERE ${COLUMN.skuProductID} IN (${placeholders})`,
      [...productIdentifiers],
    );

    /*
     * ⭐ THE ROWS ARE BUCKETED, AND EACH PRODUCT ENTITY THEN MAPS ITS OWN SKU INSTANCES FROM THEM.
     *
     * Bucketing already-mapped SKUs would be one line shorter and is WRONG. `records` and `pageRecords`
     * are materialised from two separate result sets, so they hold DISTINCT Product objects for the same
     * row, and both are handed to this loader in ONE call — see the hook in
     * `SmartListQueryBuilder.execute`. A SKU can back-reference exactly ONE product, so pushing a single
     * SKU instance onto both collections leaves every SKU reachable through `records[0].getSkus()`
     * naming `pageRecords[0]` as its product: two objects for one row, with a mutation through either
     * path invisible on the other. One SKU instance per owning product entity keeps each graph
     * internally consistent, which is the identity Hibernate's session gave the legacy for free and
     * which this port has to arrange for itself.
     *
     * ⚠️ THIS IS NOT THE SAME QUESTION AS THE MANY-TO-ONE SHARING ABOVE. `productType`, `brand` and each
     * SKU's own `product` are TARGETS of an association, so one instance per row shared by every owner
     * is both correct and desirable (`createSkuAggregateLoader` states that explicitly). It is only the
     * OWNED side of a one-to-many — a child carrying a back-reference to exactly one parent — that
     * cannot be shared.
     */
    const skuRowsByProduct = new Map<string, MySqlRow[]>();
    for (const skuRow of skuRows) {
      const owningProductID = readForeignKey(skuRow, COLUMN.skuProductID);
      if (owningProductID === undefined) {
        continue;
      }

      let bucket = skuRowsByProduct.get(owningProductID);
      if (bucket === undefined) {
        bucket = [];
        skuRowsByProduct.set(owningProductID, bucket);
      }
      bucket.push(skuRow);
    }

    products.forEach((product, index) => {
      const row = request.rows[index];
      if (row === undefined) {
        return;
      }

      const productID = readForeignKey(row, COLUMN.productID);
      const bucket = productID === undefined ? undefined : skuRowsByProduct.get(productID);
      if (bucket === undefined) {
        return;
      }

      for (const skuRow of bucket) {
        const sku = mapSkuRow(skuRow);
        sku.product = product;
        product.skus.push(sku);
      }
    });
  };

/**
 * Builds every root's loader, or `undefined` where the root has nothing to resolve.
 *
 * ⚠️ `undefined` IS A DECISION, NOT A GAP, at each of the four roots that carry it — see the header. The
 * map is exhaustive over {@link SmartListEntityName}, so a new root cannot be added to the port without
 * this file being made to state which of the two it is.
 */
export function createCatalogAggregateLoaders(
  dependencies: CatalogAggregateDependencies,
): Readonly<Record<SmartListEntityName, CatalogAggregateLoader | undefined>> {
  return Object.freeze({
    SlatwallSku: createSkuAggregateLoader(dependencies),
    SlatwallOption: loadOptionAggregates,
    SlatwallProduct: createProductAggregateLoader(dependencies),
    /* `getBaseProductType` walks `productTypeIDPath` through an injected resolver and the tree query has
     * its own projection, so `parentProductType` is not read as an association by anything in the slice. */
    SlatwallProductType: undefined,
    /* Declares no many-to-one at all [model/entity/Brand.cfc]. */
    SlatwallBrand: undefined,
    /* Declares no many-to-one at all; its `options` collection is the inverse side. */
    SlatwallOptionGroup: undefined,
    /* No domain module and no association the slice reads. */
    SlatwallAlternateSkuCode: undefined,
  });
}

/* ================================================================================================
 * THE SKU OPTION COLLECTION — REQUESTED EXPLICITLY, NOT BY ROOT
 * ============================================================================================== */

/**
 * Attaches each SKU's `options` collection, with its option groups resolved.
 *
 * Separate from {@link createCatalogAggregateLoaders} because it is requested per call rather than implied by
 * a root: `SkuRepository.findByProduct` takes an explicit `fetchOptions` argument, and the members that
 * read a SKU's options — `getOptionsDisplay`, `getOptionByOptionGroupCode`, `getSkuDefinition` — are only
 * reached on that path. Loading options for every SKU smart list would resolve a collection the feed
 * never reads.
 *
 * ⚠️ THE OPTION GROUPS COME WITH THEM, because the option members that matter here read through the
 * group. `Sku.generateImageFileName` reads `option.getOptionGroup().getImageGroupFlag()`
 * [model/entity/Sku.cfc:L134] and `getOptionsByOptionGroupCodeStruct` keys on the group's code, so an
 * option attached without its group would satisfy the type and then fail — or, worse, answer from a
 * class default. That is exactly the silent-failure class `rowMappers.ts` RULE 3 exists to prevent.
 *
 * ⚠️ ORDERED BY THE LINK TABLE'S NATURAL READ, WITH NO ORDER CLAUSE INVENTED. `model/entity/Sku.cfc:L76`
 * declares no ordering for the option collection — unlike `OptionGroup.getOptions()`, which orders by
 * sort order at `model/entity/OptionGroup.cfc:L73` — so none is imposed here (AAP 0.7.3 S9).
 *
 * @param executor - the caller's executor, so the read shares its transaction (M6).
 * @param skus - the SKUs whose options are wanted; mutated in place.
 */
export async function attachSkuOptions(executor: SqlExecutor, skus: readonly Sku[]): Promise<void> {
  const skuIdentifiers = distinctSkuIdentifiers(skus);

  if (skuIdentifiers.length === 0) {
    return;
  }

  const placeholders = skuIdentifiers.map(() => '?').join(', ');
  /*
   * ⚠️ THE ONLY JOIN IN THIS MODULE, AND THEREFORE THE ONLY STATEMENT WHERE AN UNQUALIFIED PROJECTION
   * IS FATAL. Both tables declare `optionID` — the link table because that IS the association, the
   * option table because that is its primary key — so a bare `optionID` in the field list is ambiguous
   * and MySQL refuses the statement outright with `ER_NON_UNIQ_ERROR (1052)` rather than guessing. That
   * is what happened while {@link projectionFor} emitted bare names: this statement could not run at
   * all, so `SkuRepository.findByProduct` with `fetchOptions` raised — the port of
   * `model/dao/SkuDAO.cfc:L157`'s `INNER JOIN FETCH sku.options` — failed on every invocation.
   *
   * Every projected identifier below is now qualified: `link.` for the link table's own column, and the
   * whitelisted table name for the option's columns, which {@link projectionFor} supplies. The two sides
   * of the `ON` clause were already qualified and are unchanged, as are the bound parameters and their
   * order (TR-4).
   */
  const rows = await executor.execute(
    `SELECT link.${COLUMN.skuOptionSkuID}, ${OPTION_PROJECTION} ` +
      `FROM ${SKU_OPTION_TABLE} link ` +
      `INNER JOIN ${OPTION_TABLE} ON ${OPTION_TABLE}.${COLUMN.optionID} = ` +
      `link.${COLUMN.skuOptionOptionID} ` +
      `WHERE link.${COLUMN.skuOptionSkuID} IN (${placeholders})`,
    [...skuIdentifiers],
  );

  const optionGroups = await loadByIdentifiers(
    { executor, rows, entities: [] },
    OPTION_GROUP_TABLE,
    OPTION_GROUP_PROJECTION,
    COLUMN.optionGroupID,
    collectIdentifiers(rows, COLUMN.optionOptionGroupID),
    mapOptionGroupRow,
  );

  const optionsBySku = new Map<string, Option[]>();
  for (const row of rows) {
    const owningSkuID = readForeignKey(row, COLUMN.skuOptionSkuID);
    if (owningSkuID === undefined) {
      continue;
    }

    const option = mapOptionRowWithGroup(row, optionGroups);

    let bucket = optionsBySku.get(owningSkuID);
    if (bucket === undefined) {
      bucket = [];
      optionsBySku.set(owningSkuID, bucket);
    }
    bucket.push(option);
  }

  for (const sku of skus) {
    const bucket = optionsBySku.get(sku.skuID);
    if (bucket === undefined) {
      continue;
    }

    /* Pushed onto the live array (RULE 4), and NOT through `Sku.addOption`: that member dedupes by
     * reference, which is right for graph construction and wrong for hydration, where each row is a
     * distinct instance and the link table has already decided what the collection contains. */
    for (const option of bucket) {
      sku.options.push(option);
    }
  }
}

/**
 * Maps one joined option row and resolves its group from the pre-loaded index.
 *
 * ⚠️ THE JOINED ROW CARRIES THE LINK TABLE'S `skuID` ALONGSIDE THE OPTION'S OWN COLUMNS, and that does
 * not violate `rowMappers.ts` RULE 2 ("one mapper reads one table's columns"): `mapOptionRow` reads by
 * name and the only added column belongs to no option field, so it is simply never read.
 *
 * @param row - a row carrying the option's own columns plus the link table's SKU identifier.
 * @param optionGroups - the groups already loaded for this batch.
 * @returns the mapped option, with its group attached when the group was found.
 */
function mapOptionRowWithGroup(
  row: MySqlRow,
  optionGroups: ReadonlyMap<string, { readonly entity: OptionGroup }>,
): Option {
  const option = mapOptionRow(row);

  const optionGroupID = readForeignKey(row, COLUMN.optionOptionGroupID);
  const resolved = optionGroupID === undefined ? undefined : optionGroups.get(optionGroupID);
  if (resolved !== undefined) {
    option.optionGroup = resolved.entity;
  }

  return option;
}

/* ================================================================================================
 * THE THREE `INNER JOIN FETCH` BRANCHES OF `getProductSkus`
 * ============================================================================================== */

/**
 * Groups one link table's far identifiers by the SKU that owns them.
 *
 * @param executor - the caller's executor, so the read shares its transaction (M6).
 * @param table - the whitelisted link table.
 * @param skuColumn - its owning SKU column.
 * @param farColumn - its far identifier column.
 * @param skuIdentifiers - the SKUs wanted.
 * @returns far identifiers keyed by SKU identifier, in row order.
 */
async function groupLinkIdentifiers(
  executor: SqlExecutor,
  table: PhysicalTableName,
  skuColumn: string,
  farColumn: string,
  skuIdentifiers: readonly string[],
): Promise<ReadonlyMap<string, readonly string[]>> {
  const grouped = new Map<string, string[]>();

  if (skuIdentifiers.length === 0) {
    return grouped;
  }

  const placeholders = skuIdentifiers.map(() => '?').join(', ');
  const rows = await executor.execute(
    `SELECT ${skuColumn}, ${farColumn} FROM ${table} WHERE ${skuColumn} IN (${placeholders})`,
    [...skuIdentifiers],
  );

  for (const row of rows) {
    const owningSkuID = readForeignKey(row, skuColumn);
    const farIdentifier = readForeignKey(row, farColumn);
    if (owningSkuID === undefined || farIdentifier === undefined) {
      continue;
    }

    let bucket = grouped.get(owningSkuID);
    if (bucket === undefined) {
      bucket = [];
      grouped.set(owningSkuID, bucket);
    }
    bucket.push(farIdentifier);
  }

  return grouped;
}

/** The distinct, saved identifiers of a SKU batch, in first-seen order. */
function distinctSkuIdentifiers(skus: readonly Sku[]): readonly string[] {
  return [...new Set(skus.map((sku) => sku.skuID).filter((skuID) => skuID !== ''))];
}

/**
 * Performs the eager fetch `getProductSkus` requests, for whichever collection its base product type
 * selects.
 *
 * ⚠️ THIS IS THE `FETCH` HALF OF `INNER JOIN FETCH`, AND IT WAS THE MISSING HALF.
 * `model/dao/SkuDAO.cfc:L152-L162` writes three branches, and every one of them is `INNER JOIN FETCH`
 * rather than a plain `INNER JOIN` — except the subscription term at `:L159`, which is deliberately NOT a
 * fetch. Hibernate's `FETCH` keyword does two distinct things at once:
 *
 *   1. it RESTRICTS the result set, because the join is inner — a SKU with none of the association is
 *      excluded, and one with three of it comes back three times; and
 *   2. it POPULATES the association on the returned entities, in the same round trip.
 *
 * `MySqlSkuRepository.findByProduct` already reproduced (1) faithfully, duplicates included. It did not
 * reproduce (2), so a caller that asked for the fetch received SKUs whose collection was still empty —
 * and, because the count of rows was right, nothing looked wrong. Every member that reads a fetched
 * collection then answered from an empty array rather than raising: `getOptionsDisplay` produced the
 * empty string, `getSkuDefinition` produced nothing, and `getOptionsIDList` produced no identifiers.
 * That is a wrong answer with no error attached, which is the failure class this module exists to close.
 *
 * ⚠️ ONE BRANCH PER BASE PRODUCT TYPE, MATCHING THE LEGACY CHAIN EXACTLY, INCLUDING ITS SILENCE. An
 * unrecognised base product type fetches nothing, because `model/dao/SkuDAO.cfc:L154-L161` has no final
 * alternative and simply leaves the statement alone. It does not raise there and does not raise here.
 *
 * ⚠️ THE TWO REFERENCE COLLECTIONS CARRY IDENTIFIERS, NOT ENTITIES, AND THAT IS THE PORT'S OWN SHAPE
 * RATHER THAN A SHORTCUT. `Content` and `SubscriptionBenefit` are out of scope (AAP 0.2.2.1), so
 * `src/domain/sku/Sku.ts` models both collections as identifier references — `AccessContentReference` is
 * `{ contentID }` and `SubscriptionBenefitReference` is `{ subscriptionBenefitID }`. Populating them
 * needs only the link table this adapter already owns the write side of, so no excluded entity is
 * hydrated, queried or constructed.
 *
 * ⚠️ A DUPLICATED SKU RECEIVES THE WHOLE COLLECTION, ONCE PER DUPLICATE. The fan-out of (1) means one
 * SKU may appear several times, and each appearance is a distinct mapped object in this port where
 * Hibernate's identity map would have returned one shared instance. Giving each duplicate the complete
 * collection is the closest available match; the divergence in instance identity is the one
 * `MySqlSkuRepository.findByProduct` already records.
 *
 * ⛔ THE COLLECTIONS ARE APPENDED TO, NEVER REPLACED (RULE 4), and never through the entity's `add*`
 * members: those dedupe by reference, which is correct while a graph is being built and wrong during
 * hydration, where the link table has already decided what the collection contains.
 *
 * @param executor - the caller's executor, so the fetch shares its transaction (M6).
 * @param skus - the SKUs just hydrated; mutated in place.
 * @param baseProductType - the product's resolved base product type, or `undefined` when unresolved.
 */
export async function attachFetchedSkuAssociations(
  executor: SqlExecutor,
  skus: readonly Sku[],
  baseProductType: string | undefined,
): Promise<void> {
  if (skus.length === 0 || baseProductType === undefined) {
    return;
  }

  if (baseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.merchandise.systemCode) {
    /* `model/dao/SkuDAO.cfc:L157` — `INNER JOIN FETCH sku.options`. */
    await attachSkuOptions(executor, skus);
    return;
  }

  if (baseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.contentAccess.systemCode) {
    /* `model/dao/SkuDAO.cfc:L155` — `INNER JOIN FETCH sku.accessContents`. */
    const grouped = await groupLinkIdentifiers(
      executor,
      SKU_ACCESS_CONTENT_TABLE,
      COLUMN.accessContentSkuID,
      COLUMN.accessContentContentID,
      distinctSkuIdentifiers(skus),
    );

    for (const sku of skus) {
      for (const contentID of grouped.get(sku.skuID) ?? []) {
        sku.accessContents.push({ contentID });
      }
    }
    return;
  }

  if (baseProductType === SEEDED_PRODUCT_TYPES_BY_SYSTEM_CODE.subscription.systemCode) {
    /* `model/dao/SkuDAO.cfc:L160` — `INNER JOIN FETCH sku.subscriptionBenefits`. The term join at
     * `:L159` is a plain `INNER JOIN` with NO `FETCH`, so `subscriptionTerm` is deliberately left
     * unresolved here; reproducing the restriction without the fetch is exactly what the legacy does. */
    const grouped = await groupLinkIdentifiers(
      executor,
      SKU_SUBSCRIPTION_BENEFIT_TABLE,
      COLUMN.subscriptionBenefitSkuID,
      COLUMN.subscriptionBenefitID,
      distinctSkuIdentifiers(skus),
    );

    for (const sku of skus) {
      for (const subscriptionBenefitID of grouped.get(sku.skuID) ?? []) {
        sku.subscriptionBenefits.push({ subscriptionBenefitID });
      }
    }
  }
}
