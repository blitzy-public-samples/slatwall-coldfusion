/**
 * rowMappers — explicit, typed column-to-field hydration for the extracted Catalog slice.
 *
 * AAP §0.4.1.7 makes this file create against the six in-scope entity files: "Explicit column-to-field
 * mapping replacing Hibernate hydration; 32-character string identifiers honoured (IR-6)". The legacy
 * system never wrote a mapper — Hibernate hydrated each entity from the CFC `property` metadata, so the
 * correspondence between a `Sw*` column and an entity field was implicit and unverifiable. Every mapping
 * decision the ORM used to absorb is made here instead, which makes this module the single place the
 * physical column vocabulary is spoken. `src/ports/repositories/SkuRepository.ts` and
 * `src/domain/base/AuditableEntity.ts` both defer to it by name.
 *
 * What this module does not do, because each boundary is load-bearing:
 *
 * What this file is not
 * - it contains no statement text and no table or column identifier in an executable position
 * beyond the column names it reads. Statement composition and parameter binding belong to
 * `queryRunner.ts` and the five repositories, which bind every value through `pool.execute`
 * with `?` placeholders (AAP §0.7.3). Hydration and query composition are separate concerns,
 * and keeping them separate is what makes both testable. There is deliberately no
 * "fetch-and-map" convenience helper here.
 *
 * @see `src/domain/base/populate.ts` for the sibling half of the same null convention.
 */

import { Brand, BRAND_ENTITY_METADATA } from '../../domain/product/Brand';
import { Option, OPTION_ENTITY_METADATA } from '../../domain/option/Option';
import { OptionGroup, OPTION_GROUP_ENTITY_METADATA } from '../../domain/option/OptionGroup';
import { Product, PRODUCT_ENTITY_METADATA } from '../../domain/product/Product';
import { ProductType, PRODUCT_TYPE_ENTITY_METADATA } from '../../domain/product/ProductType';
import { Sku, SKU_ENTITY_METADATA } from '../../domain/sku/Sku';
import { manageEntity } from '../../domain/base/populate';
import { parseExactDecimal } from '../../util/formatting';
import { DataIntegrityError, DomainError } from '../../errors/DomainError';

import type { AuditableEntity } from '../../domain/base/AuditableEntity';
import type { ExactDecimal } from '../../util/formatting';
import type { ManagedEntity } from '../../domain/base/populate';
import type { ProductDefaultSkuDelegate } from '../../domain/product/Product';
import type {
  UnusedOptionGroupRow,
  UnusedOptionRow,
} from '../../ports/repositories/OptionRepository';
import type { ProductSearchRow } from '../../ports/repositories/ProductRepository';
import type { ProductTypeTreeRow } from '../../ports/repositories/ProductTypeRepository';
import type { SkuSearchRow } from '../../ports/repositories/SkuRepository';

/*
 * TODO(parity) D22 [model/dao/SkuDAO.cfc:L132] — the logical versus physical name vocabulary
 * Byte-verified at each entity file's `:L49`. Recorded here because this is the natural place for a
 * reader of the adapter folder to find the shared vocabulary the repositories depend on, and because
 * getting it wrong produces a statement that fails at run time with nothing to catch it earlier.
 */

/** One row of a MySQL result set, before any narrowing. */
export type MySqlRow = Record<string, unknown>;

/**
 * Narrows an unknown value to an array of unknown elements.
 *
 * @param value - Any value.
 * @returns `true` when `value` is an array.
 */
function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

/**
 * Narrows an unknown value to a single result-set row.
 *
 * @param value - Any value.
 * @returns `true` when `value` can be read as a result-set row.
 */
function isMySqlRow(value: unknown): value is MySqlRow {
  return typeof value === 'object' && value !== null && !isUnknownArray(value);
}

/**
 * Narrows a whole driver array to a list of rows, in place, without copying it.
 *
 * @param candidate - An array the driver returned, not yet known to hold rows.
 * @throws {DomainError} When any element is not a row object. The failing index and that entry's
 * runtime type travel on `context`.
 */
function assertRowList(candidate: readonly unknown[]): asserts candidate is MySqlRow[] {
  for (let index = 0; index < candidate.length; index += 1) {
    const element = candidate[index];

    if (!isMySqlRow(element)) {
      throw new DomainError(
        'The database driver returned a list whose entries are not all rows, so it cannot be read as a result set.',
        { context: { index, entryType: typeof element } },
      );
    }
  }
}

/**
 * Narrows a driver result to the rows it carries.
 *
 * @param result - The value a driver returned for a statement, unnarrowed.
 * @returns The driver's own array, in the order the driver produced it, once every element is known
 * to be a row.
 *
 * @throws {DomainError} When `result` is not an array, or when any element is not a row object.
 *
 * @example
 * ```ts
 * const [driverResult] = await pool.execute(sql, params);
 * Const skus = mapRows(toRows(driverResult), mapSkuRow);
 * ```
 */
export function toRows(result: unknown): MySqlRow[] {
  if (!isUnknownArray(result)) {
    throw new DomainError(
      'The database driver returned a result that is not a list of rows, so it cannot be read as one.',
      { context: { resultType: typeof result } },
    );
  }

  /*
   * Validated in place and handed straight back. The driver's array is already exactly the list this
   * function's callers want, and every element has just been checked, so copying it would allocate a
   * second array of the same length for no reason other than to satisfy the compiler — once per
   * statement, and on a catalog-wide read that is a second copy of the catalog.
   */
  assertRowList(result);

  return result;
}

/**
 * Applies a mapper to every row of a result set.
 *
 * @typeParam T - What each row maps to.
 *
 * @param rows - The rows to map, typically from {@link toRows}.
 * @param map - The per-row mapper, typically one of the `map*Row` functions in this module.
 * @returns One mapped value per row, in row order.
 */
export function mapRows<T>(rows: readonly MySqlRow[], map: (row: MySqlRow) => T): T[] {
  const mapped: T[] = [];
  for (const row of rows) {
    mapped.push(map(row));
  }
  return mapped;
}

/*
 * The two assignment primitives
 * Every field in this module is written through exactly one of the two functions below, and which
 * one applies is decided by the domain declaration rather than by the column. The distinction is
 * behaviour-bearing, so it is encoded in the types: each helper accepts only the kind of field it is
 * meant for, so using the wrong one is a compile error.
 */

/**
 * The names of `TTarget`'s genuinely optional fields.
 *
 * @typeParam TTarget - The object whose optional field names are wanted.
 */
type NullableFieldName<TTarget> = {
  [TKey in keyof TTarget]-?: undefined extends TTarget[TKey] ? TKey : never;
}[keyof TTarget] &
  string;

/**
 * The names of `TTarget`'s required fields — the exact complement of {@link NullableFieldName}.
 *
 * @typeParam TTarget - The object whose required field names are wanted.
 */
type DefaultedFieldName<TTarget> = {
  [TKey in keyof TTarget]-?: undefined extends TTarget[TKey] ? never : TKey;
}[keyof TTarget] &
  string;

/**
 * Writes a nullable column into an optional domain field, deleting the field when the column is
 * NULL.
 *
 * @typeParam TTarget - The entity being hydrated.
 * @typeParam TKey - One of `TTarget`'s optional field names. Passing a required field name is a
 * compile error, which is what stops a declared default from being deleted.
 *
 * @param target - The entity being hydrated, mutated in place.
 * @param key - The field to write.
 * @param value - The column value, already narrowed. `null` or `undefined` deletes the field.
 */
function assignOptional<TTarget extends object, TKey extends NullableFieldName<TTarget>>(
  target: TTarget,
  key: TKey,
  value: TTarget[TKey] | null | undefined,
): void {
  if (value === null || value === undefined) {
    const clearable: Partial<Record<TKey, unknown>> = target;
    delete clearable[key];
    return;
  }
  target[key] = value;
}

/**
 * Writes a nullable column into a required domain field, leaving the declared default in place when
 * the column is NULL.
 *
 * @typeParam TTarget - The entity being hydrated.
 * @typeParam TKey - One of `TTarget`'s required field names. Passing an optional field name is a
 * compile error, which is what keeps nullable columns on the deleting path.
 *
 * @param target - The entity being hydrated, mutated in place.
 * @param key - The field to write.
 * @param value - The column value, already narrowed. `null` or `undefined` writes nothing.
 */
function assignDefaulted<TTarget extends object, TKey extends DefaultedFieldName<TTarget>>(
  target: TTarget,
  key: TKey,
  value: TTarget[TKey] | null | undefined,
): void {
  if (value === null || value === undefined) {
    return;
  }
  target[key] = value;
}

/*
 * The typed column readers
 * `noUncheckedIndexedAccess` types every `row['column']` read as `unknown`, which is exactly right:
 * a row arrives from a driver and nothing about its contents is guaranteed. Each reader below
 * narrows one column with explicit `typeof` and `instanceof` tests, so no assertion, cast or
 * non-null operator appears anywhere in this file (AAP §0.7.3).
 */

/**
 * Reads a text column.
 *
 * @param row - The row being read.
 * @param columnName - The physical column name.
 * @returns The string, or `undefined` when the column is absent or NULL.
 * @throws {DomainError} When the column holds a value that is not a string.
 */
function readOptionalString(row: MySqlRow, columnName: string): string | undefined {
  const value = row[columnName];
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  throw columnTypeError(columnName, 'a string', value);
}

/**
 * Reads a text column that feeds a non-optional string field, yielding `''` when it is absent or
 * NULL.
 *
 * @param row - The row being read.
 * @param columnName - The physical column name, tried first.
 * @param alternateColumnName - The projection key to fall back to, when the statement aliased it.
 * @returns The string, or `''` when neither name is present or both are NULL.
 * @throws {DomainError} When either name holds a value that is not a string.
 */
function readRequiredString(
  row: MySqlRow,
  columnName: string,
  alternateColumnName?: string,
): string {
  const value = readOptionalString(row, columnName);
  if (value !== undefined) {
    return value;
  }
  if (alternateColumnName !== undefined) {
    const alternateValue = readOptionalString(row, alternateColumnName);
    if (alternateValue !== undefined) {
      return alternateValue;
    }
  }

  /*
   * Neither alias is present, so this raises rather than substituting `''`: every caller of this
   * function is building an identifier or a
   * human-readable label for a projection row — `id`/`value` for the SKU and product search rows,
   * `name`/`value` for the two unused-option rows — and not one of those has a meaningful empty
   * value. A blank id cannot be selected, fetched or round-tripped, and a blank label renders as an
   * empty entry in a picker.
   */
  throw new DataIntegrityError(
    alternateColumnName === undefined
      ? `Column "${columnName}" is required by this projection but the row supplies no value.`
      : `Neither column "${columnName}" nor its alias "${alternateColumnName}" is present in the row, ` +
          `so this projection cannot be mapped.`,
    {
      context:
        alternateColumnName === undefined ? { columnName } : { columnName, alternateColumnName },
    },
  );
}

/**
 * Reads a numeric column.
 *
 * @param row - The row being read.
 * @param columnName - The physical column name.
 * @returns The number, or `undefined` when the column is absent or NULL.
 * @throws {DomainError} When the column holds a value that is not a finite number, a finite numeric
 * string, or a `bigint`.
 */
function readOptionalNumber(row: MySqlRow, columnName: string): number | undefined {
  const value = row[columnName];
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return value;
    }
    throw columnTypeError(columnName, 'a finite number', value);
  }
  if (typeof value === 'bigint') {
    /*
     * Defence in depth: `Number(value)` unchecked would silently round any magnitude beyond 2^53. this reader serves the integer columns
     * (`sortOrder`, `calculatedQATS`; `ormtype="integer"`), whose declared range fits a double
     * comfortably — so the guard should never fire. It is written anyway because the cost is one
     * comparison and the alternative is an undetectable off-by-a-few in a quantity. Monetary
     * columns do not come through here at all; see {@link readOptionalExactDecimal}.
     */
    const converted = Number(value);
    if (BigInt(converted) === value) {
      return converted;
    }
    throw integrityError(
      `Column "${columnName}" holds the integer ${value.toString()}, which cannot be represented ` +
        `exactly as a JavaScript number.`,
      { columnName, exactValue: value.toString() },
    );
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (value.trim().length > 0 && Number.isFinite(parsed)) {
      return parsed;
    }
    throw columnTypeError(columnName, 'a number, or a string holding one', value);
  }
  throw columnTypeError(columnName, 'a number', value);
}

/**
 * Reads a numeric column that a projection is required to supply.
 *
 * @param row - The row being read.
 * @param columnName - The projection's column alias.
 * @returns The number.
 * @throws {DomainError} When the column is absent, NULL, or holds a value that is not numeric.
 */
function readRequiredNumber(row: MySqlRow, columnName: string): number {
  const value = readOptionalNumber(row, columnName);
  if (value === undefined) {
    throw columnTypeError(columnName, 'a number the projection always supplies', row[columnName]);
  }
  return value;
}

/**
 * Reads a boolean-flag column.
 *
 * @param row - The row being read.
 * @param columnName - The physical column name.
 * @returns The boolean, or `undefined` when the column is absent or NULL.
 * @throws {DomainError} When the column holds a value that denotes no recognisable flag.
 */
function readOptionalBoolean(row: MySqlRow, columnName: string): boolean | undefined {
  const value = row[columnName];
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return value !== 0;
    }
    throw columnTypeError(columnName, 'a zero-or-one flag', value);
  }
  if (typeof value === 'string') {
    if (value === '1' || value === 'true') {
      return true;
    }
    if (value === '0' || value === 'false') {
      return false;
    }
    throw columnTypeError(columnName, 'a zero-or-one flag', value);
  }
  if (value instanceof Uint8Array) {
    const firstByte = value[0];
    if (value.length === 1 && firstByte !== undefined) {
      return firstByte !== 0;
    }
    throw columnTypeError(columnName, 'a single-byte binary flag', value);
  }
  throw columnTypeError(columnName, 'a zero-or-one flag', value);
}

/**
 * Reads a timestamp column.
 *
 * @param row - The row being read.
 * @param columnName - The physical column name.
 * @returns The `Date`, or `undefined` when the column is absent or NULL.
 * @throws {DomainError} When the column holds a value that is not a valid date or a parseable date
 * string.
 */
function readOptionalDate(row: MySqlRow, columnName: string): Date | undefined {
  const value = row[columnName];
  if (value === null || value === undefined) {
    return undefined;
  }
  if (value instanceof Date) {
    if (Number.isFinite(value.getTime())) {
      return value;
    }
    throw columnTypeError(columnName, 'a valid timestamp', value);
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return parsed;
    }
    throw columnTypeError(columnName, 'a parseable timestamp string', value);
  }
  throw columnTypeError(columnName, 'a timestamp', value);
}

/**
 * Builds the error a reader raises when a column's runtime type does not match the field it feeds.
 *
 * @param columnName - The column that was read.
 * @param expectation - What the reader required, phrased to complete "expected ...".
 * @param value - The value actually found, attached as context rather than interpolated.
 * @returns The error to throw.
 */
function columnTypeError(columnName: string, expectation: string, value: unknown): DomainError {
  return new DomainError(
    `Column "${columnName}" cannot be read: expected ${expectation}, but the row holds a value of type ${typeof value}.`,
    { context: { columnName, expectation, valueType: typeof value } },
  );
}

/**
 * Builds the row-integrity fault raised when a column's value cannot be carried without loss, or when
 * a column the projection promised is missing.
 *
 * @param message - The internal diagnostic. Never reaches a response body; the public presentation is
 * supplied by `DataIntegrityError.getPublicError()`.
 *
 * @param context - Structured diagnostic fields, kept server-side.
 * @returns The error to throw.
 */
function integrityError(message: string, context: Record<string, unknown>): DataIntegrityError {
  return new DataIntegrityError(message, { context });
}

/**
 * Reads an exact-decimal (`ormtype="big_decimal"`) column, keeping its digits as digits.
 *
 * @param row - The row being read.
 * @param columnName - The column or projection alias to read.
 * @returns The exact value as decimal text, or `undefined` when the column is absent or NULL.
 * @throws {DataIntegrityError} When the text is not a well-formed decimal, or when the driver delivered
 * a pre-converted number.
 */
function readOptionalExactDecimal(row: MySqlRow, columnName: string): ExactDecimal | undefined {
  const value = row[columnName];
  if (value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'string' || typeof value === 'bigint') {
    const decimalText = typeof value === 'bigint' ? value.toString() : value.trim();
    const exact = parseExactDecimal(decimalText);
    if (exact === undefined) {
      throw integrityError(
        `Column "${columnName}" holds ${JSON.stringify(decimalText)}, which is not a well-formed ` +
          `exact-decimal value.`,
        { columnName },
      );
    }
    return exact;
  }

  if (typeof value === 'number') {
    throw integrityError(
      `Column "${columnName}" is an exact-decimal column but the driver delivered a JavaScript ` +
        `number, so its exact digits have already been lost. Check that the pool keeps ` +
        `decimalNumbers disabled, as ../../config/database.ts requires.`,
      { columnName, deliveredValue: value },
    );
  }

  throw columnTypeError(columnName, 'an exact-decimal string', value);
}

/**
 * Hydrates the four audit fields every in-scope entity declares.
 *
 * TODO(parity): the two Account fields deliberately get no empty-string default.
 * `org/Hibachi/HibachiEntity.cfc:L291-L305` overrides only `getCreatedDateTime` and
 * `getModifiedDateTime` to return `""` in place of a null; the two Account getters carry no override
 * at all and are genuinely null when unset. Giving them a blank default here would invent behaviour
 * the legacy system does not have, so they follow the ordinary nullable-column rule and are absent
 * when the column is NULL.
 *
 * @param entity - The entity being hydrated, mutated in place.
 * @param row - The row being read.
 */
function assignAuditColumns(entity: AuditableEntity, row: MySqlRow): void {
  assignOptional(entity, 'createdDateTime', readOptionalDate(row, 'createdDateTime'));
  assignOptional(entity, 'createdByAccount', readOptionalString(row, 'createdByAccountID'));
  assignOptional(entity, 'modifiedDateTime', readOptionalDate(row, 'modifiedDateTime'));
  assignOptional(entity, 'modifiedByAccount', readOptionalString(row, 'modifiedByAccountID'));
}

/* The entity mappers — five rules that apply to all seven. */

/*
 * Rule 3a — the four foreign-key REFERENCES
 * Every factory below mints an association slot value carrying nothing but the identifier the row's
 * foreign-key column supplied. The module header states the two obligations that force them and the
 * "a reference may not lie" bound that limits them to these four; this section is the mechanism.
 */

/**
 * A `Product` reference carrying only `productID` — the resolved form of the `productID` foreign key
 * at `model/entity/Sku.cfc:L65`.
 *
 * @param productID - The foreign-key value, already narrowed to a present string.
 * @returns a managed product whose only populated field is its primary key. Every other read yields
 * `undefined`; every collection is its own fresh empty array.
 */
export function productReference(productID: string): ManagedEntity<Product> {
  const product = manageEntity(new Product(), PRODUCT_ENTITY_METADATA);
  product.productID = productID;
  return product;
}

/**
 * A `ProductType` reference carrying only `productTypeID` — the resolved form of the `productTypeID`
 * foreign key at `model/entity/Product.cfc:L69`.
 *
 * @param productTypeID - The foreign-key value, already narrowed to a present string.
 * @returns a managed product type whose only populated field is its primary key. Its own
 * `parentProductType` is left absent, so `getSimpleRepresentation` reports `undefined` rather
 * than walking into a second reference.
 */
export function productTypeReference(productTypeID: string): ManagedEntity<ProductType> {
  const productType = manageEntity(new ProductType(), PRODUCT_TYPE_ENTITY_METADATA);
  productType.productTypeID = productTypeID;
  return productType;
}

/**
 * A `Brand` reference carrying only `brandID` — the resolved form of the `brandID` foreign key at
 * `model/entity/Product.cfc:L68`.
 *
 * @param brandID - The foreign-key value, already narrowed to a present string.
 * @returns a managed brand whose only populated field is its primary key.
 */
export function brandReference(brandID: string): ManagedEntity<Brand> {
  const brand = manageEntity(new Brand(), BRAND_ENTITY_METADATA);
  brand.brandID = brandID;
  return brand;
}

/*
 * Rule 3b — the preserved product-type parent foreign key
 * The full rationale is in the rule 3b section of the module header: the association slot must stay
 * absent so no read path renders from a parent that carries no name, while the write paths still need
 * the key so a read-modify-save does not detach the child. These three members are that separation.
 */

/**
 * The provenance table behind rule 3b: for each product type hydrated from a row, the
 * `parentProductTypeID` that row carried.
 */
const hydratedParentProductTypeIds = new WeakMap<object, string>();

/**
 * Records the `parentProductTypeID` a row supplied for a product type, without touching the
 * association slot.
 *
 * @param productType - The instance just hydrated from the row.
 * @param parentProductTypeID - The row's foreign-key value, already narrowed to a present string.
 */
function recordHydratedParentProductTypeID(productType: object, parentProductTypeID: string): void {
  hydratedParentProductTypeIds.set(productType, parentProductTypeID);
}

/*
 * Rule 3d — a hydrated product's owned link-table load state.
 *
 * The product-side counterpart of rule 3c, and it exists for the same reason. `model/entity/Product.cfc:L81`
 * declares `relatedProducts` as an owning many-to-many over `SwRelatedProduct`, so Hibernate's collection
 * flush wrote and removed those rows whenever the in-memory collection changed. {@link mapProductRow}
 * hydrates the collection empty, and `MySqlProductPersistence.saveProduct` reconciles the owner side by
 * delete-then-insert — so without a load-state record, saving a product read without its links would
 * delete every link row the product had, which is precisely the hazard rule 3c closed for the SKU.
 *
 * Only `relatedProducts` is tracked: it is the one owning collection of `Product` that this port writes.
 * `listingPages` and `categories` are also owning many-to-manys at `:L79-L80`, and both reach excluded
 * families (`Content*` and `Category`), so no statement here touches their tables at all.
 */

/**
 * For each product hydrated from a row, the subset of its owned link collections that has been loaded.
 */
const hydratedProductLoadedOwnedLinks = new WeakMap<object, Set<ProductOwnedLinkCollection>>();

/** The owning link collection of `model/entity/Product.cfc` that this port writes. */
export const PRODUCT_OWNED_LINK_COLLECTIONS = Object.freeze(['relatedProducts'] as const);

/** One of the owned link collection names of {@link PRODUCT_OWNED_LINK_COLLECTIONS}. */
export type ProductOwnedLinkCollection = (typeof PRODUCT_OWNED_LINK_COLLECTIONS)[number];

/**
 * Records that a product came from a row, with none of its owned link collections loaded yet.
 *
 * @param product - The instance just hydrated from the row.
 */
function recordHydratedProductOwnedLinks(product: object): void {
  hydratedProductLoadedOwnedLinks.set(product, new Set<ProductOwnedLinkCollection>());
}

/**
 * Declares that one owned link collection of a hydrated product now holds what the database holds.
 *
 * @param product - A product, hydrated or not.
 * @param collection - The collection whose rows were just read.
 */
export function markProductOwnedLinkLoaded(
  product: object,
  collection: ProductOwnedLinkCollection,
): void {
  hydratedProductLoadedOwnedLinks.get(product)?.add(collection);
}

/**
 * Whether a product's owned link collection may be taken as the complete intended contents.
 *
 * @param product - A product, hydrated or not.
 * @param collection - The collection being written.
 * @returns `true` when the collection may be replaced — either because the product was never hydrated
 * from a row, so its collection is whatever this request built, or because the rows were read. `false`
 * when the stored rows must be preserved.
 */
export function isProductOwnedLinkAuthoritative(
  product: object,
  collection: ProductOwnedLinkCollection,
): boolean {
  const loaded = hydratedProductLoadedOwnedLinks.get(product);

  return loaded === undefined || loaded.has(collection);
}

/**
 * The `parentProductTypeID` this product type was hydrated with, if it was hydrated from a row at all.
 *
 * @param productType - Any product type. A freshly constructed one, or one this module never mapped,
 * yields `undefined` — there is nothing to preserve for it, and `NULL` is then the correct column
 * value because the entity is a genuine root.
 *
 * @returns the preserved identifier, or `undefined` when none was recorded or it has been forgotten.
 */
export function readHydratedParentProductTypeID(productType: object): string | undefined {
  return hydratedParentProductTypeIds.get(productType);
}

/**
 * Discards the preserved `parentProductTypeID`, so a subsequent write stores `NULL` and the detach is
 * durable.
 *
 * @param productType - The product type whose preserved parent key should be dropped.
 */
export function forgetHydratedParentProductTypeID(productType: object): void {
  hydratedParentProductTypeIds.delete(productType);
}

/*
 * Rule 3c — a hydrated SKU's preserved subscription-term key and its owned-link load state the
 * defect this closes (finding ). {@link mapSkuRow} produces a SKU carrying no `subscriptionTerm`
 * association and four empty owned link collections, and `MySqlSkuRepository.persistSku` then
 * writes `subscriptionTerm?.subscriptionTermID ?? null` and delete-replaces all four link tables
 * whenever the SKU row pre-existed. Put together, any save of a database-loaded SKU nulled its
 * subscription term and deleted every one of its `SwSkuOption`, `SwSkuAccessContent`,
 * `SwSkuSubsBenefit` and `SwSkuRenewalSubsBenefit` rows. Three in-scope service members reach that
 * write on an existing SKU: `processProductAddOptionGroup`, `processProductAddOption` and
 * `processProductUpdateSkus`.
 */

/**
 * The four collections `model/entity/Sku.cfc` declares as owned many-to-many link tables, named by the
 * entity's own property names at `:L76` through `:L79`.
 */
export const SKU_OWNED_LINK_COLLECTIONS = Object.freeze([
  'options',
  'accessContents',
  'subscriptionBenefits',
  'renewalSubscriptionBenefits',
] as const);

/** One of the four owned link collection names of {@link SKU_OWNED_LINK_COLLECTIONS}. */
export type SkuOwnedLinkCollection = (typeof SKU_OWNED_LINK_COLLECTIONS)[number];

/**
 * For each SKU hydrated from a row, the subset of its owned link collections that has since been loaded.
 */
const hydratedSkuLoadedOwnedLinks = new WeakMap<object, Set<SkuOwnedLinkCollection>>();

/** For each SKU hydrated from a row, the `subscriptionTermID` that row carried. */
const hydratedSkuSubscriptionTermIds = new WeakMap<object, string>();

/**
 * Records that a SKU came from a row, with none of its owned link collections loaded yet.
 *
 * @param sku - the instance just hydrated from the row.
 */
function recordHydratedSkuOwnedLinks(sku: object): void {
  hydratedSkuLoadedOwnedLinks.set(sku, new Set<SkuOwnedLinkCollection>());
}

/**
 * Declares that one owned link collection of a hydrated SKU now holds what the database holds.
 *
 * @param sku - a SKU, hydrated or not.
 * @param collection - the collection whose rows were just read.
 */
export function markSkuOwnedLinkLoaded(sku: object, collection: SkuOwnedLinkCollection): void {
  hydratedSkuLoadedOwnedLinks.get(sku)?.add(collection);
}

/**
 * Whether a SKU's owned link collection may be taken as the complete intended contents.
 *
 * @param sku - a SKU, hydrated or not.
 * @param collection - the collection being written.
 * @returns `true` when the collection may be replaced; `false` when its stored rows must be preserved.
 */
export function isSkuOwnedLinkAuthoritative(
  sku: object,
  collection: SkuOwnedLinkCollection,
): boolean {
  const loaded = hydratedSkuLoadedOwnedLinks.get(sku);
  return loaded === undefined || loaded.has(collection);
}

/**
 * The `subscriptionTermID` this SKU was hydrated with, if it was hydrated from a row at all.
 *
 * @param sku - any SKU. One never mapped here yields `undefined`, and `NULL` is then the correct column
 * value because the entity genuinely carries no term.
 *
 * @returns The preserved identifier, or `undefined` when none was recorded or it has been forgotten.
 */
export function readHydratedSkuSubscriptionTermID(sku: object): string | undefined {
  return hydratedSkuSubscriptionTermIds.get(sku);
}

/**
 * Discards the preserved `subscriptionTermID`, so a subsequent write stores `NULL` and the detach is
 * durable.
 *
 * @param sku - the SKU whose preserved term key should be dropped.
 */
export function forgetHydratedSkuSubscriptionTermID(sku: object): void {
  hydratedSkuSubscriptionTermIds.delete(sku);
}

/** A `defaultSku` slot value that also reports the identifier the delegate interface hides. */
export interface IdentifiedProductDefaultSku extends ProductDefaultSkuDelegate {
  readonly skuID: string;
}

/** Raises for a member of an unresolved default-SKU reference. */
function refuseUnresolvedDefaultSku(skuID: string, member: string): never {
  throw new DomainError(
    "A product's default SKU was read before the reference to it had been resolved, so no value " +
      'could be produced for it.',
    { context: { skuID, member } },
  );
}

/**
 * A `defaultSku` reference carrying only `skuID` — the resolved form of the `defaultSkuID` foreign
 * key at `model/entity/Product.cfc:L70`.
 *
 * @param skuID - The foreign-key value, already narrowed to a present string.
 * @returns a frozen delegate reporting the identifier and refusing every value read.
 */
export function defaultSkuReference(skuID: string): IdentifiedProductDefaultSku {
  return Object.freeze({
    skuID,
    getCurrencyCode: (): never => refuseUnresolvedDefaultSku(skuID, 'getCurrencyCode'),
    getPrice: (): never => refuseUnresolvedDefaultSku(skuID, 'getPrice'),
    getRenewalPrice: (): never => refuseUnresolvedDefaultSku(skuID, 'getRenewalPrice'),
    getListPrice: (): never => refuseUnresolvedDefaultSku(skuID, 'getListPrice'),
    getImageDirectory: (): never => refuseUnresolvedDefaultSku(skuID, 'getImageDirectory'),
    getImagePath: (): never => refuseUnresolvedDefaultSku(skuID, 'getImagePath'),
    getImage: (): never => refuseUnresolvedDefaultSku(skuID, 'getImage'),
    getResizedImagePath: (): never => refuseUnresolvedDefaultSku(skuID, 'getResizedImagePath'),
    getImageExistsFlag: (): never => refuseUnresolvedDefaultSku(skuID, 'getImageExistsFlag'),
  });
}

/*
 * `resolvedProductDefaultSku` was removed from this module, and the capability is injected instead.
 * A companion to {@link defaultSkuReference} once stood here: given a loaded `Sku` it returned a
 * delegate whose three price members forwarded and whose other six raised. It had no caller anywhere in
 * `src/` or `test/` — inside this module or outside it — and it could not have acquired one honestly,
 * because the six it could not answer are the whole difficulty. `Sku.getCurrencyCode` needs a
 * `SettingResolverPort`, and the five image members are asynchronous on `Sku` and take an `ImagePathPort`,
 * while the delegate declares them synchronous and argument-free.
 */

/**
 * Reads the identifier off a `defaultSku` slot value, whether it is a reference or a resolved wrapper.
 *
 * @param defaultSku - A `defaultSku` slot value.
 * @returns The identifier, or `undefined` when the value carries none — which is the state of a
 * delegate assembled by some other collaborator, not an error this module can adjudicate.
 */
export function readProductDefaultSkuId(defaultSku: object): string | undefined {
  if ('skuID' in defaultSku) {
    const candidate: unknown = defaultSku.skuID;
    return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
  }
  return undefined;
}

/**
 * Hydrates a `SwProduct` row into a {@link Product}.
 *
 * @param row - One `SwProduct` row.
 * @returns a managed product (rule 5) carrying every persistent column the row supplied, its three
 * many-to-one fields holding rule 3a references where the row carried the foreign key, and its
 * collections empty and live.
 *
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field.
 *
 * @example
 * ```ts
 * const product = mapProductRow({ productID: 'a'.repeat(32), productName: 'Test Product' });
 * ```
 */
export function mapProductRow(row: MySqlRow): ManagedEntity<Product> {
  const product = manageEntity(new Product(), PRODUCT_ENTITY_METADATA);

  /*
   * Rule 3d — recorded before any field is read, so a product that came from a row is marked as
   * carrying **no** loaded owned link collection. `markProductOwnedLinkLoaded` promotes one to loaded
   * once its rows have been read; until then `MySqlProductPersistence.saveProduct` preserves the stored
   * link rows rather than replacing them.
   */
  recordHydratedProductOwnedLinks(product);

  assignDefaulted(product, 'productID', readOptionalString(row, 'productID'));
  assignOptional(product, 'activeFlag', readOptionalBoolean(row, 'activeFlag'));
  assignOptional(product, 'urlTitle', readOptionalString(row, 'urlTitle'));
  assignOptional(product, 'productName', readOptionalString(row, 'productName'));
  assignOptional(product, 'productCode', readOptionalString(row, 'productCode'));
  assignOptional(product, 'productDescription', readOptionalString(row, 'productDescription'));
  assignOptional(product, 'publishedFlag', readOptionalBoolean(row, 'publishedFlag'));
  assignOptional(product, 'sortOrder', readOptionalNumber(row, 'sortOrder'));

  // The four persisted columns under the legacy "Calculated Properties" comment. See the
  // calculated-property boundary note above for why these are mapped and the sixteen derived members
  // are not.
  /*
   * — `calculatedSalePrice` is `ormtype="big_decimal"` at [model/entity/Product.cfc:L62], the
   * same exact type as the three Sku monetary columns and carrying the same loss if converted
   * unchecked. It is read through the exact reader for that reason; the finding named the Sku three,
   * but the defect is the ormtype, not the entity, so fixing only the named three would have left the
   * identical bug one file away. It stays `assignOptional` because it declares no legacy default.
   */
  assignOptional(
    product,
    'calculatedSalePrice',
    readOptionalExactDecimal(row, 'calculatedSalePrice'),
  );
  assignOptional(product, 'calculatedQATS', readOptionalNumber(row, 'calculatedQATS'));
  assignOptional(
    product,
    'calculatedAllowBackorderFlag',
    readOptionalBoolean(row, 'calculatedAllowBackorderFlag'),
  );
  assignOptional(product, 'calculatedTitle', readOptionalString(row, 'calculatedTitle'));

  assignOptional(product, 'remoteID', readOptionalString(row, 'remoteID'));
  assignAuditColumns(product, row);

  /*
   * Rule 3a — the three many-to-one foreign keys at [model/entity/Product.cfc:L68-L70], each read as
   * an identifier and attached as a reference. `assignOptional` is not used: these are not scalar
   * fields, so the presence test is written out and the field is simply left untouched — and therefore
   * absent, since all three are declared with `declare` — when the column supplies nothing.
   */
  const brandID = readOptionalString(row, 'brandID');
  if (brandID !== undefined) {
    product.brand = brandReference(brandID);
  }

  const productTypeID = readOptionalString(row, 'productTypeID');
  if (productTypeID !== undefined) {
    product.productType = productTypeReference(productTypeID);
  }

  const defaultSkuID = readOptionalString(row, 'defaultSkuID');
  if (defaultSkuID !== undefined) {
    product.defaultSku = defaultSkuReference(defaultSkuID);
  }

  return product;
}

/**
 * Hydrates a `SwSku` row into a {@link Sku}.
 *
 * @param row - One `SwSku` row.
 * @returns a managed SKU (rule 5) carrying every persistent column the row supplied, its `product`
 * field holding a rule 3a reference where the row carried the foreign key, its four owned link
 * collections empty, live and marked not loaded (rule 3c), and its `subscriptionTermID` preserved
 * beside it where the row carried one.
 *
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field.
 */
export function mapSkuRow(row: MySqlRow): ManagedEntity<Sku> {
  const sku = manageEntity(new Sku(), SKU_ENTITY_METADATA);

  assignDefaulted(sku, 'skuID', readOptionalString(row, 'skuID'));
  assignDefaulted(sku, 'activeFlag', readOptionalBoolean(row, 'activeFlag'));
  assignOptional(sku, 'skuCode', readOptionalString(row, 'skuCode'));
  /*
   * — the three `ormtype="big_decimal"` columns of [model/entity/Sku.cfc:L55-L57] are read
   * through {@link readOptionalExactDecimal}, not the general numeric reader, so a value the double
   * cannot carry raises instead of being silently replaced by the nearest one. Their legacy
   * `default="0"` is what `assignDefaulted` supplies when the column is absent or NULL.
   */
  assignDefaulted(sku, 'listPrice', readOptionalExactDecimal(row, 'listPrice'));
  assignDefaulted(sku, 'price', readOptionalExactDecimal(row, 'price'));
  assignDefaulted(sku, 'renewalPrice', readOptionalExactDecimal(row, 'renewalPrice'));
  assignOptional(sku, 'imageFile', readOptionalString(row, 'imageFile'));
  assignDefaulted(sku, 'userDefinedPriceFlag', readOptionalBoolean(row, 'userDefinedPriceFlag'));

  assignOptional(sku, 'calculatedQATS', readOptionalNumber(row, 'calculatedQATS'));

  assignOptional(sku, 'remoteID', readOptionalString(row, 'remoteID'));
  assignAuditColumns(sku, row);

  /*
   * Rule 3a — the `productID` foreign key at [model/entity/Sku.cfc:L63]. `setProduct` is deliberately
   * not called: the legacy many-to-one population branch assigned through the framework's own property
   * writer rather than through the hand-written bidirectional helper, so the product's own `skus`
   * collection was not updated by a hydration pass either.
   */
  const productID = readOptionalString(row, 'productID');
  if (productID !== undefined) {
    sku.product = productReference(productID);
  }

  /*
   * Rule 3c — the subscription-term foreign key at [model/entity/Sku.cfc:L64]. Recorded beside the
   * instance, never attached: `SubscriptionTerm` is out of scope (AAP §0.2.2.1) and the slot stays absent,
   * so every read path sees exactly what it saw before while the write path stops nulling the column.
   */
  const subscriptionTermID = readOptionalString(row, 'subscriptionTermID');
  if (subscriptionTermID !== undefined) {
    hydratedSkuSubscriptionTermIds.set(sku, subscriptionTermID);
  }

  /*
   * Rule 3c — and none of the four owned link collections has been read. Recorded unconditionally,
   * including when the tables hold nothing, because "no rows" and "not read" are different facts and this
   * mapper established neither. `persistSku` consults it before replacing any link table.
   */
  recordHydratedSkuOwnedLinks(sku);

  return sku;
}

/**
 * Hydrates a `SwProductType` row into a {@link ProductType}.
 *
 * @param row - One `SwProductType` row.
 * @returns a managed product type (rule 5) carrying every persistent column the row supplied, with its
 * parent association unresolved, its parent foreign key preserved beside it, and its collections
 * empty and live.
 *
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field.
 */
export function mapProductTypeRow(row: MySqlRow): ManagedEntity<ProductType> {
  const productType = manageEntity(new ProductType(), PRODUCT_TYPE_ENTITY_METADATA);

  assignDefaulted(productType, 'productTypeID', readOptionalString(row, 'productTypeID'));
  assignOptional(productType, 'productTypeIDPath', readOptionalString(row, 'productTypeIDPath'));
  assignOptional(productType, 'activeFlag', readOptionalBoolean(row, 'activeFlag'));
  assignOptional(productType, 'publishedFlag', readOptionalBoolean(row, 'publishedFlag'));
  assignOptional(productType, 'urlTitle', readOptionalString(row, 'urlTitle'));
  assignOptional(productType, 'productTypeName', readOptionalString(row, 'productTypeName'));
  assignOptional(
    productType,
    'productTypeDescription',
    readOptionalString(row, 'productTypeDescription'),
  );
  assignOptional(productType, 'systemCode', readOptionalString(row, 'systemCode'));

  assignOptional(productType, 'remoteID', readOptionalString(row, 'remoteID'));
  assignAuditColumns(productType, row);

  /*
   * Rule 3b — the self-referencing foreign key at [model/entity/ProductType.cfc:L62]. Recorded beside
   * the entity rather than assigned into `parentProductType`, because the association is what read
   * paths render from and an identifier-only parent would empty `getSimpleRepresentation`. A null
   * column records nothing, which is the ordinary state for a root.
   */
  const parentProductTypeID = readOptionalString(row, 'parentProductTypeID');
  if (parentProductTypeID !== undefined) {
    recordHydratedParentProductTypeID(productType, parentProductTypeID);
  }

  return productType;
}

/**
 * Hydrates one row of the product-type tree projection into a {@link ProductTypeTreeRow}.
 *
 * @param row - One row of the product-type tree projection.
 * @returns a managed product type (rule 5) carrying its two derived counts, and the same object
 * {@link mapProductTypeRow} produced rather than a copy of it.
 *
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field, or
 * when either count is missing or not numeric.
 */
export function mapProductTypeTreeRow(row: MySqlRow): ManagedEntity<ProductTypeTreeRow> {
  const productType = mapProductTypeRow(row);

  return Object.assign(productType, {
    isAssigned: readRequiredNumber(row, 'isAssigned'),
    childCount: readRequiredNumber(row, 'childCount'),
  });
}

/**
 * Hydrates a `SwBrand` row into a {@link Brand}.
 *
 * @param row - One `SwBrand` row.
 * @returns a managed brand (rule 5) carrying every persistent column the row supplied, with its
 * collections empty and live.
 *
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field.
 */
export function mapBrandRow(row: MySqlRow): ManagedEntity<Brand> {
  const brand = manageEntity(new Brand(), BRAND_ENTITY_METADATA);

  assignDefaulted(brand, 'brandID', readOptionalString(row, 'brandID'));
  assignOptional(brand, 'activeFlag', readOptionalBoolean(row, 'activeFlag'));
  assignOptional(brand, 'publishedFlag', readOptionalBoolean(row, 'publishedFlag'));
  assignOptional(brand, 'urlTitle', readOptionalString(row, 'urlTitle'));
  assignOptional(brand, 'brandName', readOptionalString(row, 'brandName'));
  assignOptional(brand, 'brandWebsite', readOptionalString(row, 'brandWebsite'));

  assignOptional(brand, 'remoteID', readOptionalString(row, 'remoteID'));
  assignAuditColumns(brand, row);

  return brand;
}

/**
 * Hydrates a `SwOption` row into an {@link Option}.
 *
 * @param row - One `SwOption` row.
 * @returns a managed option (rule 5) carrying every persistent column the row supplied, with its
 * group unresolved and its SKU collection empty and live.
 *
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field.
 */
export function mapOptionRow(row: MySqlRow): ManagedEntity<Option> {
  const option = manageEntity(new Option(), OPTION_ENTITY_METADATA);

  assignDefaulted(option, 'optionID', readOptionalString(row, 'optionID'));
  assignOptional(option, 'optionCode', readOptionalString(row, 'optionCode'));
  assignOptional(option, 'optionName', readOptionalString(row, 'optionName'));
  assignOptional(option, 'optionDescription', readOptionalString(row, 'optionDescription'));
  assignOptional(option, 'sortOrder', readOptionalNumber(row, 'sortOrder'));

  assignOptional(option, 'remoteID', readOptionalString(row, 'remoteID'));
  assignAuditColumns(option, row);

  return option;
}

/**
 * Hydrates a `SwOptionGroup` row into an {@link OptionGroup}.
 *
 * @param row - One `SwOptionGroup` row.
 * @returns a managed option group (rule 5) carrying every persistent column the row supplied, with
 * its options collection empty and live.
 *
 * @throws {DomainError} When a column holds a value whose runtime type does not match its field.
 */
export function mapOptionGroupRow(row: MySqlRow): ManagedEntity<OptionGroup> {
  const optionGroup = manageEntity(new OptionGroup(), OPTION_GROUP_ENTITY_METADATA);

  assignDefaulted(optionGroup, 'optionGroupID', readOptionalString(row, 'optionGroupID'));
  assignOptional(optionGroup, 'optionGroupName', readOptionalString(row, 'optionGroupName'));
  assignOptional(optionGroup, 'optionGroupCode', readOptionalString(row, 'optionGroupCode'));
  assignOptional(optionGroup, 'optionGroupImage', readOptionalString(row, 'optionGroupImage'));
  assignOptional(
    optionGroup,
    'optionGroupDescription',
    readOptionalString(row, 'optionGroupDescription'),
  );
  assignDefaulted(optionGroup, 'imageGroupFlag', readOptionalBoolean(row, 'imageGroupFlag'));
  assignOptional(optionGroup, 'sortOrder', readOptionalNumber(row, 'sortOrder'));

  assignOptional(optionGroup, 'remoteID', readOptionalString(row, 'remoteID'));
  assignAuditColumns(optionGroup, row);

  return optionGroup;
}

/*
 * The projection mappers — flat two-field rows
 * Four legacy members do not return entities. Each runs a narrow statement and then loops the result
 * building a two-key struct, and the ports declare the resulting shapes as their own row types. This
 * is where those renames live, because renaming a column to a field is the mapping this module owns.
 */

/**
 * Maps one row of the SKU search projection.
 *
 * @param row - One row of the SKU search projection.
 * @returns The projected row.
 * @throws {DomainError} When either column holds a value that is not a string.
 * @throws {DataIntegrityError} When a required column and its alias are both absent from the row,
 * which means the SQL projection and this mapper have drifted .
 *
 * @example
 * ```ts
 * mapSkuSearchRow({ skuID: 'a'.repeat(32), skuCode: 'TESTPRODUCTXXX-1' });
 * // { id: 'aaaa…', value: 'TESTPRODUCTXXX-1' }
 * ```
 */
export function mapSkuSearchRow(row: MySqlRow): SkuSearchRow {
  return {
    id: readRequiredString(row, 'skuID', 'id'),
    value: readRequiredString(row, 'skuCode', 'value'),
  };
}

/**
 * Maps one row of the product search projection.
 *
 * @param row - One row of the product search projection.
 * @returns The projected row.
 * @throws {DomainError} When either column holds a value that is not a string.
 * @throws {DataIntegrityError} When a required column and its alias are both absent from the row,
 * which means the SQL projection and this mapper have drifted .
 */
export function mapProductSearchRow(row: MySqlRow): ProductSearchRow {
  return {
    id: readRequiredString(row, 'productID', 'id'),
    value: readRequiredString(row, 'productName', 'value'),
  };
}

/**
 * Maps one row of the unused-product-options projection.
 *
 * @param row - One row of the unused-product-options projection, its label already composed.
 * @returns The projected row.
 * @throws {DomainError} When either key holds a value that is not a string.
 * @throws {DataIntegrityError} When a required column and its alias are both absent from the row,
 * which means the SQL projection and this mapper have drifted .
 */
export function mapUnusedOptionRow(row: MySqlRow): UnusedOptionRow {
  return {
    name: readRequiredString(row, 'name'),
    value: readRequiredString(row, 'optionID', 'value'),
  };
}

/**
 * Maps one row of the unused-product-option-groups projection.
 *
 * @param row - One row of the unused-product-option-groups projection.
 * @returns The projected row.
 * @throws {DomainError} When either column holds a value that is not a string.
 * @throws {DataIntegrityError} When a required column and its alias are both absent from the row,
 * which means the SQL projection and this mapper have drifted .
 */
export function mapUnusedOptionGroupRow(row: MySqlRow): UnusedOptionGroupRow {
  return {
    name: readRequiredString(row, 'optionGroupName', 'name'),
    value: readRequiredString(row, 'optionGroupID', 'value'),
  };
}
