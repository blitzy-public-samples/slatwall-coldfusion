// slatwall-ts - the MySQL adapter for product-type reads and writes.
//
// The secondary adapter implementing `ProductTypeRepository` over `mysql2` server-side prepared
// statements.
//
// LEGACY-NOTE [model/dao/ProductTypeDAO.cfc:L54-L62]: three cited locators carried drift and are
// corrected throughout this file.
//
// The physical names are therefore emitted. That is a CORRECTION mandated by B5 (schema
// continuity), and it deliberately carries no `LEGACY-DEFECT` marker: that marker means "preserved
// deliberately", and here the behaviour is corrected rather than preserved.

import { randomUUID } from 'node:crypto';
import { ProductType } from '../../domain/entities/productType.js';
import type {
  ProductTypeRepository,
  ProductTypeSavePayload,
  ProductTypeTreeRow,
} from '../../domain/ports/productTypeRepository.js';
import { buildIdPathList } from '../../domain/valueObjects/materializedIdPath.js';
import { listAppend, listFindNoCase, listLen } from '../../lib/cfml/list.js';
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import { isNullish } from '../../lib/cfml/truthiness.js';
import type { AuditActorContext, PreparedStatementExecutor, SqlRow } from './connection.js';
import {
  resolveAuditActorAccountID,
  resolveStampedModifiedByAccountID,
  sqlPlaceholderList,
  sqlUpdateAssignment,
} from './connection.js';
import type { DatabaseDialect } from './dialect.js';
import { materializedIdPathLikePatternFragment } from './dialect.js';

// JUDGMENT CALL: the dialect is a module constant and is deliberately not read from configuration.
const STATEMENT_DIALECT: DatabaseDialect = 'MySQL';

/**
 * The result set and the row reader disagree about a column.
 *
 * The offending value is never carried - only the column name, the statement it came from and a
 * description of the fault.
 *
 * CFML parity [model/dao/ProductTypeDAO.cfc:L64]: the legacy body hands its query object straight
 * back and the consumer reads columns off it by name, which raises in CFML when the name is not a
 * column of that result set.
 */
class ProductTypeColumnError extends Error {
  /**
   * The column the reader asked for, as the reader spelled it.
   */
  readonly columnName: string;

  /**
   * Which statement produced the row, so the fault is attributable.
   */
  readonly statementLabel: string;

  /**
   * What went wrong. Never the value itself.
   */
  readonly detail: string;

  constructor(columnName: string, statementLabel: string, detail: string) {
    super(
      [
        `Column "${columnName}" of ${statementLabel} cannot be read: ${detail}.`,
        'The statement and its row reader must agree: every column a reader reads has to be',
        'selected by the statement that produced the row, and has to arrive in a shape that',
        'column can legitimately take.',
      ].join(' '),
    );
    this.name = 'ProductTypeColumnError';
    this.columnName = columnName;
    this.statementLabel = statementLabel;
    this.detail = detail;
  }
}

/**
 * Raised when the stored `parentProductTypeID` pointers form a cycle, so a product type is its own
 * ancestor and there is no ancestry to return.
 *
 * DELIBERATELY not EXPORTED, matching the two errors around it: a caller has nothing useful to do
 * with the distinction.
 *
 * The identifiers are echoed here, unlike the persistence error above: a cycle is a data fault
 * whose repair requires knowing which rows point at each other.
 */
class ProductTypeCycleError extends Error {
  constructor(chain: readonly string[], repeatedProductTypeID: string) {
    super(
      [
        `The parentProductTypeID pointers form a cycle: ${chain.join(' -> ')} ->`,
        `${repeatedProductTypeID}, which repeats an identifier already in that chain.`,
        'No ancestry can be returned, and returning a truncated chain would silently change which',
        'promotions qualify and which price-group rate the cascade selects.',
      ].join(' '),
    );
    this.name = 'ProductTypeCycleError';
  }
}

/**
 * Raised when a product type cannot be persisted in the state it was handed over in.
 */
class ProductTypePersistenceError extends Error {
  /**
   * What made the product type unpersistable. Never a value.
   */
  readonly detail: string;

  constructor(detail: string) {
    super(
      [
        `A product type cannot be saved: ${detail}.`,
        'Hibernate raised on a transient association rather than writing a placeholder key, and',
        'model/entity/ProductType.cfc:L62 declares no cascade on parentProductType, so the parent',
        'has to be saved before the child references it.',
      ].join(' '),
    );
    this.name = 'ProductTypePersistenceError';
    this.detail = detail;
  }
}

// CFML parity [model/dao/ProductTypeDAO.cfc:L64]: query-column access in CFML is CASE-INSENSITIVE
// `rs.productTypeName`, `rs.PRODUCTTYPENAME` and `rs.producttypename` are one and the same read
// so these readers FOLD CASE rather than demanding an exact key.
//
// JUDGMENT CALL: an exact-key lookup is not used, because the result-set LABEL follows the query
// text while the field's ORIGINAL name follows the table definition, and the two differ whenever
// the two spellings differ - as they do here.
//
// JUDGMENT CALL: every case fold here uses `toLowerCase()` and never `toLocaleLowerCase()`,
// because a locale-sensitive fold changes the result under a Turkish-dotless-I locale and
// `productTypeID`, `parentProductTypeID`.

/**
 * The outcome of looking for one column, keeping "absent" distinct from "null".
 */
type ColumnLookup = { readonly found: true; readonly value: unknown } | { readonly found: false };

/**
 * Fold an identifier for comparison, once, in one place.
 *
 * CFML parity: the legacy engine compares strings with `eq` and `findNoCase`, both
 * case-insensitive, and MySQL's default collation is case-insensitive too.
 *
 * @param identifier a product-type identifier or a column name.
 * @returns the case-folded form, for use as a map key or comparison operand only.
 */
function foldIdentifier(identifier: string): string {
  return identifier.toLowerCase();
}

/**
 * Look for one column of a row, without assuming the driver's casing.
 *
 * @param row one result-set row, keyed by the label the driver reported.
 * @param columnName the column to look for, in any casing.
 * @returns the value when a column of that name is present - including when the cell is SQL NULL -
 * and otherwise the absent outcome.
 */
function findColumn(row: SqlRow, columnName: string): ColumnLookup {
  const foldedName = foldIdentifier(columnName);

  for (const [label, value] of Object.entries(row)) {
    if (foldIdentifier(label) === foldedName) {
      return { found: true, value };
    }
  }

  return { found: false };
}

/**
 * Read one column that the statement is required to have selected.
 *
 * @param row one result-set row.
 * @param columnName the column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the raw driver value, which may be `null`.
 * @throws An error named `ProductTypeColumnError` when no column of that name is present.
 */
function requireColumn(row: SqlRow, columnName: string, statementLabel: string): unknown {
  const lookup = findColumn(row, columnName);

  if (!lookup.found) {
    throw new ProductTypeColumnError(
      columnName,
      statementLabel,
      'the result set has no column of that name',
    );
  }

  return lookup.value;
}

/**
 * Names the shape of a rejected column value without revealing the value itself.
 */
function describeColumnType(value: unknown): string {
  if (value === null) {
    return 'SQL NULL';
  }

  if (Array.isArray(value)) {
    return 'an array';
  }

  if (value instanceof Date) {
    return 'an invalid Date';
  }

  if (value instanceof Uint8Array) {
    return 'a byte buffer';
  }

  return `a ${typeof value}`;
}

/**
 * Read a column that holds an identifier: present, not null, and text.
 *
 * @param row one result-set row.
 * @param columnName the identifier column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the identifier exactly as stored, with its casing untouched.
 * @throws An error named `ProductTypeColumnError` when the column is absent, null or not text.
 */
function readIdentifier(row: SqlRow, columnName: string, statementLabel: string): string {
  const value = requireColumn(row, columnName, statementLabel);

  if (typeof value === 'string') {
    return value;
  }

  throw new ProductTypeColumnError(
    columnName,
    statementLabel,
    `an identifier column must arrive as text and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read a nullable text column, mapping SQL NULL to absence.
 *
 * CFML parity [model/entity/ProductType.cfc:L250-L255]: the legacy guard is
 * `isNull(variables.productTypeIDPath)`, and in CFML the empty string is not null either - so an
 * empty stored path triggers no rebuild there and none here.
 *
 * @param row one result-set row.
 * @param columnName the column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the text, or `undefined` when the cell is SQL NULL.
 * @throws An error named `ProductTypeColumnError` when the column is absent or is present with a
 * non-text, non-null value.
 */
function readOptionalText(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): string | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value === 'string') {
    return value;
  }

  throw new ProductTypeColumnError(
    columnName,
    statementLabel,
    `a text column must arrive as text and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read a text column that `SELECT *` may not have produced at all.
 *
 * JUDGMENT CALL: the distinction exists because the enumerated hydration reads NAME their columns,
 * so a column missing from one of those result sets means the statement and the schema disagree.
 *
 * @param row one row of a `SELECT *` result set.
 * @param columnName the column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the text, or `undefined` when the column is absent from the result set or holds SQL
 * NULL.
 * @throws An error named `ProductTypeColumnError` when the column is present with a non-text,
 * non-null value.
 */
function readProjectedText(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): string | undefined {
  const lookup = findColumn(row, columnName);

  if (!lookup.found || isNullish(lookup.value)) {
    return undefined;
  }

  if (typeof lookup.value === 'string') {
    return lookup.value;
  }

  throw new ProductTypeColumnError(
    columnName,
    statementLabel,
    `a text column must arrive as text and this one arrived as ${describeColumnType(lookup.value)}`,
  );
}

/**
 * Read a correlated `count(...)` column as a non-negative integer.
 *
 * @param row one result-set row.
 * @param columnName the count column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the count.
 * @throws An error named `ProductTypeColumnError` when the column is absent, null, non-numeric,
 * fractional or too large to represent exactly.
 */
function readCount(row: SqlRow, columnName: string, statementLabel: string): number {
  const value = requireColumn(row, columnName, statementLabel);

  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    if (value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(value);
    }

    throw new ProductTypeColumnError(
      columnName,
      statementLabel,
      'a count arrived as a big integer outside the exactly representable range',
    );
  }

  throw new ProductTypeColumnError(
    columnName,
    statementLabel,
    `a count column must arrive as an integer and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read a nullable `datetime` column.
 *
 * @param row one result-set row.
 * @param columnName the timestamp column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the instant, or `undefined` when the cell is SQL NULL.
 * @throws An error named `ProductTypeColumnError` when the column is absent, is not a `Date`, or
 * is an invalid `Date`.
 */
function readTimestamp(row: SqlRow, columnName: string, statementLabel: string): Date | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  throw new ProductTypeColumnError(
    columnName,
    statementLabel,
    `a datetime column must arrive as a valid Date and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * JUDGMENT CALL: `cfBoolean()` is deliberately not called here - the raw value is carried through,
 * narrowed only to the input type the entity accepts.
 *
 * @param row one result-set row.
 * @param columnName the boolean column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns a value the entity's own coercion accepts: `undefined` for SQL NULL, the unwrapped byte
 * for a `BIT` buffer, or the driver's own string, number or boolean.
 * @throws An error named `ProductTypeColumnError` when the column is absent or holds a shape no
 * CFML boolean conversion can accept.
 */
function readFlag(row: SqlRow, columnName: string, statementLabel: string): CfBooleanInput {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Uint8Array) {
    const firstByte = value[0];

    return firstByte === undefined ? undefined : firstByte;
  }

  throw new ProductTypeColumnError(
    columnName,
    statementLabel,
    `a boolean column must arrive as text, a number, a boolean or a BIT buffer and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Convert a value destined for a bound parameter into a shape the driver accepts.
 *
 * CFML parity: an ORM property that was never set persisted as SQL NULL, and
 * `<cfqueryparam null="...">` spelled the same thing in the tag-syntax DAOs.
 *
 * @param value a value read off the persistable record.
 * @returns the value unchanged, or `null` when it was absent.
 */
function toBindableValue(value: unknown): unknown {
  return isNullish(value) ? null : value;
}

// One label per statement, carrying the legacy locator where a legacy statement exists, so a
// column fault names both the reader and the provenance of the statement it read from.

const TREE_STATEMENT_LABEL = 'the product-type tree read [model/dao/ProductTypeDAO.cfc:L52-L65]';

const BY_ID_STATEMENT_LABEL = 'the product-type read by identifier';

const BY_ID_PATH_STATEMENT_LABEL = 'the product-type read by materialized path';

const INSERT_STATEMENT_LABEL = 'the product-type insert';

const UPDATE_STATEMENT_LABEL = 'the product-type update';

// The fourteen physical columns of `SwProductType`, taken from `model/entity/ProductType.cfc`: the
// eight scalars at L52-L59, the `parentProductTypeID` foreign key that `fkcolumn` declares on the
// many-to-one at L62, `remoteID` at L80.

/**
 * The insert column order.
 *
 * JUDGMENT CALL: the statement text and the bound parameter array are both derived from this one
 * list.
 */
const INSERTED_COLUMNS = [
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
] as const;

/**
 * The update column order - eleven columns, and three deliberate exclusions.
 *
 * `productTypeID` is excluded because it is the key the statement matches on rather than a value
 * it sets.
 */
const UPDATED_COLUMNS = [
  'productTypeIDPath',
  'activeFlag',
  'publishedFlag',
  'urlTitle',
  'productTypeName',
  'productTypeDescription',
  'systemCode',
  'parentProductTypeID',
  'remoteID',
  'modifiedDateTime',
  'modifiedByAccountID',
] as const;

/**
 * The tree read, ported from [model/dao/ProductTypeDAO.cfc:L54-L62].
 *
 * CFML parity [model/dao/ProductTypeDAO.cfc:L62]: `ORDER BY productTypeName ASC` is carried over
 * VERBATIM - not widened, no secondary sort, no tiebreaker.
 *
 * CFML parity [model/dao/ProductTypeDAO.cfc:L54]: the projection stays `SELECT *`.
 *
 * JUDGMENT CALL: the two table names are CORRECTED to the physical `SwProductType` and `SwProduct`
 * per the ruling in this file's header [model/dao/ProductTypeDAO.cfc:L53-L54], and indentation is
 * normalised to spaces with no trailing whitespace.
 */
const SELECT_PRODUCT_TYPE_TREE_SQL = `SELECT *,
  (SELECT count(SwProduct.productID)
   FROM SwProduct
   WHERE SwProduct.productTypeID = SwProductType.productTypeID) as isAssigned,
  (SELECT count(spt.productTypeID)
   FROM SwProductType spt
   WHERE spt.parentProductTypeID = SwProductType.productTypeID) as childCount
FROM SwProductType
ORDER BY productTypeName ASC`;

/**
 * The enumerated hydration projection, shared by both entity reads.
 *
 * JUDGMENT CALL: these two statements ENUMERATE their columns where the ported tree read keeps
 * `SELECT *`.
 */
const PRODUCT_TYPE_PROJECTION = `  SwProductType.productTypeID,
  SwProductType.productTypeIDPath,
  SwProductType.activeFlag,
  SwProductType.publishedFlag,
  SwProductType.urlTitle,
  SwProductType.productTypeName,
  SwProductType.productTypeDescription,
  SwProductType.systemCode,
  SwProductType.parentProductTypeID,
  SwProductType.remoteID,
  SwProductType.createdDateTime,
  SwProductType.createdByAccountID,
  SwProductType.modifiedDateTime,
  SwProductType.modifiedByAccountID`;

/**
 * Read one product-type row by identifier.
 */
const SELECT_PRODUCT_TYPE_BY_ID_SQL = `SELECT
${PRODUCT_TYPE_PROJECTION}
FROM SwProductType
WHERE SwProductType.productTypeID = ?`;

/**
 * Read every product type whose identifier appears in a materialized path.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L482-L488]: the path-membership predicate is the
 * UNANCHORED SUBSTRING `LIKE` this repository uses everywhere - MySQL arm
 * `concat('%', <idColumn>, '%')`, no comma anchoring, no `FIND_IN_SET` - and the identical idiom
 * appears again at [model/dao/PhysicalDAO.cfc:L121].
 *
 * JUDGMENT CALL: the bound path is the LIKE SUBJECT and the column is inside the PATTERN, the same
 * operand arrangement as the legacy, so a `%` or `_` in the caller's path is matched literally and
 * no `ESCAPE` clause is needed - the legacy has none.
 */
const SELECT_PRODUCT_TYPES_BY_ID_PATH_SQL = `SELECT
${PRODUCT_TYPE_PROJECTION}
FROM SwProductType
WHERE ? LIKE ${materializedIdPathLikePatternFragment(STATEMENT_DIALECT, 'SwProductType.productTypeID')}`;

/**
 * Insert one product-type row.
 *
 * The emitted text is fixed and fully determined by `INSERTED_COLUMNS`.
 */
const INSERT_PRODUCT_TYPE_SQL = `INSERT INTO SwProductType (
  ${INSERTED_COLUMNS.join(',\n  ')}
) VALUES (${sqlPlaceholderList(INSERTED_COLUMNS.length)})`;

/**
 * Update one product-type row, matched on its primary key.
 *
 * The emitted text is fixed and fully determined by `UPDATED_COLUMNS`.
 */
const UPDATE_PRODUCT_TYPE_SQL = `UPDATE SwProductType
SET
  ${UPDATED_COLUMNS.map((columnName) => sqlUpdateAssignment(columnName)).join(',\n  ')}
WHERE SwProductType.productTypeID = ?`;

/**
 * Everything one read needs in order to turn its rows into linked entities.
 *
 * The maps are keyed by CASE-FOLDED identifier for the reason `foldIdentifier` records: MySQL's
 * default collation matched the rows case-insensitively.
 */
interface HydrationScope {
  /**
   * Every row available to this hydration, by folded identifier.
   */
  readonly rowsByFoldedID: ReadonlyMap<string, SqlRow>;

  /**
   * Entities already built, so one row yields exactly one instance.
   */
  readonly hydratedByFoldedID: Map<string, ProductType>;

  /**
   * Distinct from `hydratedByFoldedID` above on purpose: that one records rows already built,
   * which is how a shared ancestor is reused; this one records rows whose own ancestry is still
   * being walked.
   */
  readonly linkageInProgress: Set<string>;

  /**
   * Injected into every entity so `getBaseProductType()` can reach the database.
   */
  readonly productTypeRepository: ProductTypeRepository;

  /**
   * Which statement produced these rows, for column-fault attribution.
   */
  readonly statementLabel: string;
}

/**
 * @param row one result-set row carrying the fourteen enumerated columns.
 * @param parentProductType the already-hydrated parent, or `undefined` for a root row or for a
 * read that deliberately stops short of the parent.
 * @param scope the hydration scope, supplying the injected port and the label.
 * @returns the hydrated product type.
 * @throws An error named `ProductTypeColumnError` when a column is absent from the row or arrives
 * in a shape that column cannot take.
 */
function toProductType(
  row: SqlRow,
  parentProductType: ProductType | undefined,
  scope: HydrationScope,
): ProductType {
  const label = scope.statementLabel;

  return new ProductType({
    productTypeID: readIdentifier(row, 'productTypeID', label),
    productTypeIDPath: readOptionalText(row, 'productTypeIDPath', label),
    activeFlag: readFlag(row, 'activeFlag', label),
    publishedFlag: readFlag(row, 'publishedFlag', label),
    urlTitle: readOptionalText(row, 'urlTitle', label),
    productTypeName: readOptionalText(row, 'productTypeName', label),
    productTypeDescription: readOptionalText(row, 'productTypeDescription', label),
    systemCode: readOptionalText(row, 'systemCode', label),
    parentProductType,
    remoteID: readOptionalText(row, 'remoteID', label),
    createdDateTime: readTimestamp(row, 'createdDateTime', label),
    createdByAccountID: readOptionalText(row, 'createdByAccountID', label),
    modifiedDateTime: readTimestamp(row, 'modifiedDateTime', label),
    modifiedByAccountID: readOptionalText(row, 'modifiedByAccountID', label),
    productTypeRepository: scope.productTypeRepository,
  });
}

/**
 * JUDGMENT CALL: the linkage is one-directional - a child points at its parent, and the parent's
 * `childProductTypes` collection is deliberately LEFT EMPTY even when the scope holds both rows.
 *
 * @param foldedProductTypeID the case-folded identifier of the row to hydrate.
 * @param scope the hydration scope; its `hydratedByFoldedID` and `linkageInProgress` members are
 * mutated as the walk proceeds.
 * @returns the hydrated entity, or `undefined` when the scope holds no row of that identifier.
 * @throws An error named `ProductTypeColumnError` when a row is missing a column, or
 * `ProductTypeCycleError` when the ancestry closes into a cycle.
 */
function hydrateWithAncestry(
  foldedProductTypeID: string,
  scope: HydrationScope,
): ProductType | undefined {
  const alreadyHydrated = scope.hydratedByFoldedID.get(foldedProductTypeID);

  if (alreadyHydrated !== undefined) {
    return alreadyHydrated;
  }

  const row = scope.rowsByFoldedID.get(foldedProductTypeID);

  if (row === undefined) {
    return undefined;
  }

  if (scope.linkageInProgress.has(foldedProductTypeID)) {
    throw new ProductTypeCycleError([...scope.linkageInProgress], foldedProductTypeID);
  }

  scope.linkageInProgress.add(foldedProductTypeID);

  const parentProductTypeID = readOptionalText(row, 'parentProductTypeID', scope.statementLabel);
  const parentProductType =
    parentProductTypeID === undefined
      ? undefined
      : hydrateWithAncestry(foldIdentifier(parentProductTypeID), scope);

  scope.linkageInProgress.delete(foldedProductTypeID);

  const productType = toProductType(row, parentProductType, scope);
  scope.hydratedByFoldedID.set(foldedProductTypeID, productType);

  return productType;
}

/**
 * Build a hydration scope over a set of rows, keyed by folded identifier.
 *
 * @param rows the rows this hydration may draw on.
 * @param productTypeRepository the port injected into every hydrated entity.
 * @param statementLabel which statement produced the rows.
 * @returns a fresh, request-scoped hydration scope.
 * @throws An error named `ProductTypeColumnError` when a row has no identifier column.
 */
function createHydrationScope(
  rows: readonly SqlRow[],
  productTypeRepository: ProductTypeRepository,
  statementLabel: string,
): HydrationScope {
  const rowsByFoldedID = new Map<string, SqlRow>();

  for (const row of rows) {
    rowsByFoldedID.set(foldIdentifier(readIdentifier(row, 'productTypeID', statementLabel)), row);
  }

  return {
    rowsByFoldedID,
    hydratedByFoldedID: new Map<string, ProductType>(),
    linkageInProgress: new Set<string>(),
    productTypeRepository,
    statementLabel,
  };
}

/**
 * Project one tree row onto the port's row type.
 *
 * @param row one row of the tree read.
 * @returns the row projected onto `ProductTypeTreeRow`.
 * @throws An error named `ProductTypeColumnError` when a required column is absent, or when any
 * column arrives in a shape it cannot take.
 */
function toProductTypeTreeRow(row: SqlRow): ProductTypeTreeRow {
  const productTypeName = readProjectedText(row, 'productTypeName', TREE_STATEMENT_LABEL);
  const productTypeIDPath = readProjectedText(row, 'productTypeIDPath', TREE_STATEMENT_LABEL);
  const parentProductTypeID = readProjectedText(row, 'parentProductTypeID', TREE_STATEMENT_LABEL);

  return {
    productTypeID: readIdentifier(row, 'productTypeID', TREE_STATEMENT_LABEL),
    isAssigned: readCount(row, 'isAssigned', TREE_STATEMENT_LABEL),
    childCount: readCount(row, 'childCount', TREE_STATEMENT_LABEL),
    ...(productTypeName === undefined ? {} : { productTypeName }),
    ...(productTypeIDPath === undefined ? {} : { productTypeIDPath }),
    ...(parentProductTypeID === undefined ? {} : { parentProductTypeID }),
  };
}

/**
 * Mint the identifier for a product type that has never been persisted.
 *
 * CFML parity [model/entity/ProductType.cfc:L52]: the column is
 * `fieldtype="id" generator="uuid" length="32"`, so the identifier came from HIBERNATE'S `uuid`
 * generator and not from CFML's `createUUID()`.
 *
 * JUDGMENT CALL: `randomUUID()` from `node:crypto` supplies the randomness and its hyphens are
 * removed to reach the 32-character form, following `src/domain/entities/promotionCode.ts`.
 *
 * @returns a fresh 32-character lower-case hexadecimal identifier.
 */
function generateProductTypeID(): string {
  return randomUUID().replaceAll('-', '');
}

/**
 * Resolve the foreign key to write for the parent association.
 *
 * @param productType the product type being saved.
 * @returns the parent's identifier, or `undefined` when the product type is a root.
 * @throws An error named `ProductTypePersistenceError` when a parent is present but has never been
 * persisted, matching the ORM's refusal to write a key for a transient association.
 */
function resolveParentProductTypeID(productType: ProductType): string | undefined {
  const parentProductType = productType.getParentProductType();

  if (parentProductType === undefined) {
    return undefined;
  }

  if (parentProductType.isNew()) {
    throw new ProductTypePersistenceError(
      'its parent product type has never been persisted, so there is no key to reference',
    );
  }

  return parentProductType.getProductTypeID();
}

/**
 * @param productType the product type being saved.
 * @param productTypeID the identifier to write - the entity's own for an update, or the freshly
 * minted one for a first insert.
 * @param productTypeIDPath the maintained materialized path to write.
 * @param urlTitle the url title the populate step settled on, if any.
 * @param productTypeName the product type name the populate step settled on, if any.
 * @param createdDateTime the creation stamp; consumed by the insert only.
 * @param modifiedDateTime the modification stamp.
 * @param auditActorAccountID the account the request's audit actor resolves to, or `undefined`
 * when the legacy gate refuses.
 * @returns the record every write binds from.
 * @throws An error named `ProductTypePersistenceError` when the parent is transient.
 */
function toPersistableRecord(
  productType: ProductType,
  productTypeID: string,
  productTypeIDPath: string,
  urlTitle: string | undefined,
  productTypeName: string | undefined,
  createdDateTime: Date | undefined,
  modifiedDateTime: Date,
  auditActorAccountID: string | undefined,
): SqlRow {
  return {
    productTypeID,
    productTypeIDPath,
    activeFlag: productType.getActiveFlag(),
    publishedFlag: productType.getPublishedFlag(),
    urlTitle,
    productTypeName,
    productTypeDescription: productType.getProductTypeDescription(),
    systemCode: productType.getSystemCode(),
    parentProductTypeID: resolveParentProductTypeID(productType),
    remoteID: productType.getRemoteID(),
    createdDateTime,
    createdByAccountID: auditActorAccountID,
    modifiedDateTime,
    // On the UPDATE path a `null` here does not erase the stored value: the statement renders this
    // column through `COALESCE(?, modifiedByAccountID)`.
    modifiedByAccountID: auditActorAccountID,
  };
}

/**
 * Bind a statement's parameters from the persistable record, in the statement's own column order.
 *
 * @param record the persistable record.
 * @param columnOrder the ordered column list the statement text was built from.
 * @param statementLabel which statement is being bound.
 * @returns the positional parameter array, with absence spelled `null`.
 * @throws An error named `ProductTypeColumnError` when the record is missing a column the
 * statement names.
 */
function toBoundParameters(
  record: SqlRow,
  columnOrder: readonly string[],
  statementLabel: string,
): readonly unknown[] {
  return columnOrder.map((columnName) =>
    toBindableValue(requireColumn(record, columnName, statementLabel)),
  );
}

/**
 * Compute the materialized path for a product type whose identifier has just been minted.
 *
 * CFML parity [model/entity/ProductType.cfc:L306] and [org/Hibachi/HibachiEntity.cfc:L308-L324]:
 * the legacy path is the ancestry from the ROOT down to and INCLUDING the entity itself, built by
 * climbing the parent chain and prepending each identifier.
 *
 * JUDGMENT CALL: this is the one route where the repository composes the path itself instead of
 * calling the entity's hook, and the reason is ordering.
 *
 * @param productType the product type being inserted, carrying its parent link.
 * @param generatedProductTypeID the freshly minted identifier.
 * @returns the comma-delimited path, root first, ending in the new identifier.
 */
function buildIdPathForGeneratedIdentifier(
  productType: ProductType,
  generatedProductTypeID: string,
): string {
  const parentProductType = productType.getParentProductType();

  const ancestorIdPath =
    parentProductType === undefined
      ? ''
      : buildIdPathList<ProductType>(
          parentProductType,
          (node) => node.getProductTypeID(),
          (node) => node.getParentProductType(),
        );

  return listAppend(ancestorIdPath, generatedProductTypeID);
}

/**
 * The MySQL implementation of {@link ProductTypeRepository}.
 *
 * Every method is `async` because every method reaches the database.
 */
export class MysqlProductTypeRepository implements ProductTypeRepository {
  /**
   * The prepared-statement executor, INJECTED.
   *
   * JUDGMENT CALL: the executor arrives as a constructor argument and the pool is never imported
   * as a module singleton. Three consequences follow, and all three are wanted.
   */
  private readonly executor: PreparedStatementExecutor;

  /**
   * WHO this adapter stamps its writes on behalf of, INJECTED and immutable.
   */
  private readonly auditActor: AuditActorContext;

  /**
   * @param executor the narrow prepared-statement executor from `./connection.js`.
   * @param auditActor the request's audit actor, for stamping `createdByAccountID` and
   * `modifiedByAccountID`.
   */
  constructor(executor: PreparedStatementExecutor, auditActor: AuditActorContext) {
    this.executor = executor;
    this.auditActor = auditActor;
  }

  /**
   * The full product-type listing with per-row product and child counts.
   *
   * LEGACY-NOTE [model/dao/ProductTypeDAO.cfc:L51-L63]: both of those comments call this a
   * TREE-SORTED query, and it is not one - the statement orders by `productTypeName ASC`
   * [model/dao/ProductTypeDAO.cfc:L62], so rows arrive in name order and a caller that wants tree
   * order has to rebuild it from `productTypeIDPath`.
   *
   * @returns every product type, ordered by name, as rows.
   * @throws An error named `ProductTypeColumnError` when the result set is missing a column this
   * read projects.
   */
  async getProductTypeQuery(): Promise<readonly ProductTypeTreeRow[]> {
    const rows = await this.executor.execute(SELECT_PRODUCT_TYPE_TREE_SQL);

    return rows.map(toProductTypeTreeRow);
  }

  /**
   * Load one product type by identifier, with its parent chain.
   *
   * `undefined` for a miss, and never a zero-valued stand-in.
   *
   * Fetch shape - the parent chain, hop by hop, to the root.
   *
   * @param productTypeID the identifier to load.
   * @returns the hydrated product type with its ancestry, or `undefined` when no row matches.
   * @throws An error named `ProductTypeColumnError` when a row is missing a column this read
   * projects.
   */
  async getProductTypeByProductTypeID(productTypeID: string): Promise<ProductType | undefined> {
    const targetRow = await this.readProductTypeRow(productTypeID);

    if (targetRow === undefined) {
      return undefined;
    }

    const targetFoldedID = foldIdentifier(
      readIdentifier(targetRow, 'productTypeID', BY_ID_STATEMENT_LABEL),
    );

    const ancestryRows: SqlRow[] = [targetRow];
    const visitedFoldedIDs = new Set<string>([targetFoldedID]);

    // The same `PRODUCT_TYPE_PROJECTION` from the same table with no additional predicate - no
    // `activeFlag` filter, no `LIMIT`, no `ORDER BY`.
    //
    // The read is lazy and gated, so no statement is issued that provably cannot answer.
    //
    // The walk is unchanged in every other respect, which is the point.
    const targetProductTypeIDPath =
      readOptionalText(targetRow, 'productTypeIDPath', BY_ID_STATEMENT_LABEL) ?? '';
    let pathAncestorRowsByFoldedID: ReadonlyMap<string, SqlRow> | undefined;

    let descendantRow: SqlRow = targetRow;
    let hasUnvisitedAncestor = true;

    while (hasUnvisitedAncestor) {
      const parentProductTypeID = readOptionalText(
        descendantRow,
        'parentProductTypeID',
        BY_ID_STATEMENT_LABEL,
      );

      // The visited set does two jobs, and only one of them is observable here.
      if (
        parentProductTypeID !== undefined &&
        visitedFoldedIDs.has(foldIdentifier(parentProductTypeID))
      ) {
        throw new ProductTypeCycleError([...visitedFoldedIDs], foldIdentifier(parentProductTypeID));
      }
      let parentRow: SqlRow | undefined;

      if (parentProductTypeID !== undefined) {
        if (listFindNoCase(targetProductTypeIDPath, parentProductTypeID) > 0) {
          pathAncestorRowsByFoldedID ??= await this.readAncestryRowsByPath(
            targetRow,
            targetFoldedID,
          );
          parentRow = pathAncestorRowsByFoldedID.get(foldIdentifier(parentProductTypeID));
        }

        parentRow ??= await this.readProductTypeRow(parentProductTypeID);
      }

      if (parentRow === undefined) {
        hasUnvisitedAncestor = false;
      } else {
        ancestryRows.push(parentRow);
        visitedFoldedIDs.add(
          foldIdentifier(readIdentifier(parentRow, 'productTypeID', BY_ID_STATEMENT_LABEL)),
        );
        descendantRow = parentRow;
      }
    }

    return hydrateWithAncestry(
      targetFoldedID,
      createHydrationScope(ancestryRows, this, BY_ID_STATEMENT_LABEL),
    );
  }

  /**
   * Load every product type whose identifier occurs in a materialized path.
   *
   * A path of zero elements short-circuits with the empty array and issues no statement.
   *
   * @param productTypeIDPath comma-delimited product type identifiers, root first.
   * @returns the product types the path names; an identifier with no row is simply not returned.
   * @throws An error named `ProductTypeColumnError` when a row is missing a column this read
   * projects.
   */
  async getProductTypesByProductTypeIDPath(productTypeIDPath: string): Promise<ProductType[]> {
    if (listLen(productTypeIDPath) === 0) {
      return [];
    }

    const rows = await this.executor.execute(SELECT_PRODUCT_TYPES_BY_ID_PATH_SQL, [
      productTypeIDPath,
    ]);

    const scope = createHydrationScope(rows, this, BY_ID_PATH_STATEMENT_LABEL);
    const productTypes: ProductType[] = [];

    for (const row of rows) {
      const productType = hydrateWithAncestry(
        foldIdentifier(readIdentifier(row, 'productTypeID', BY_ID_PATH_STATEMENT_LABEL)),
        scope,
      );

      if (productType !== undefined) {
        productTypes.push(productType);
      }
    }

    return productTypes;
  }

  /**
   * Persist one product type, inserting or updating as its stored state requires.
   *
   * CFML parity [model/entity/ProductType.cfc:L305-L313]: both ORM hooks assign
   * `productTypeIDPath` from the parent chain before delegating to the framework base, so the path is
   * maintained here instead.
   *
   * CFML parity [model/service/ProductService.cfc:L303]: the populate step copies only the keys the
   * struct carries, which is what `Object.hasOwn` tests.
   *
   * @param productType the product type to persist.
   * @param data the resolved payload to populate from before writing.
   * @returns the persisted product type - the argument itself when it already carried an
   * identifier and the populate step overrode nothing.
   * @throws An error named `ProductTypePersistenceError` when the parent association is transient.
   */
  async saveProductType(
    productType: ProductType,
    data: ProductTypeSavePayload,
  ): Promise<ProductType> {
    // The populate step, in the one place it happens. See the CFML parity note above.
    const populatedUrlTitle: string | undefined = Object.hasOwn(data, 'urlTitle')
      ? data.urlTitle
      : productType.getUrlTitle();
    const populatedProductTypeName: string | undefined = Object.hasOwn(data, 'productTypeName')
      ? data.productTypeName
      : productType.getProductTypeName();

    const priorRow = productType.isNew()
      ? undefined
      : await this.readProductTypeRow(productType.getProductTypeID());

    if (priorRow === undefined) {
      return this.insertProductType(productType, populatedUrlTitle, populatedProductTypeName);
    }

    return this.updateProductType(
      productType,
      priorRow,
      populatedUrlTitle,
      populatedProductTypeName,
    );
  }

  /**
   * @param targetRow the row the ancestry walk starts from, whose `productTypeIDPath` is read.
   * @param targetFoldedID the folded identifier of `targetRow`, excluded from the result.
   * @returns every ancestor row the path names, keyed by folded identifier; empty when the path is
   * absent or names nothing.
   * @throws An error named `ProductTypeColumnError` when a returned row is missing a projected
   * column.
   */
  private async readAncestryRowsByPath(
    targetRow: SqlRow,
    targetFoldedID: string,
  ): Promise<ReadonlyMap<string, SqlRow>> {
    const productTypeIDPath = readOptionalText(
      targetRow,
      'productTypeIDPath',
      BY_ID_STATEMENT_LABEL,
    );

    // A row with no stored path - the column is nullable - yields nothing here, and the walk then
    // resolves every ancestor through its own read exactly as it did before. No path is invented.
    if (productTypeIDPath === undefined || listLen(productTypeIDPath) === 0) {
      return new Map<string, SqlRow>();
    }

    const rows = await this.executor.execute(SELECT_PRODUCT_TYPES_BY_ID_PATH_SQL, [
      productTypeIDPath,
    ]);
    const rowsByFoldedID = new Map<string, SqlRow>();

    for (const row of rows) {
      const foldedID = foldIdentifier(readIdentifier(row, 'productTypeID', BY_ID_STATEMENT_LABEL));

      // The target is excluded, deliberately: it is already the head of `ancestryRows`.
      if (foldedID !== targetFoldedID) {
        rowsByFoldedID.set(foldedID, row);
      }
    }

    return rowsByFoldedID;
  }

  /**
   * One product-type row by identifier, or nothing.
   *
   * @param productTypeID the identifier to read.
   * @returns the row, or `undefined` when no row matches.
   */
  private async readProductTypeRow(productTypeID: string): Promise<SqlRow | undefined> {
    const rows = await this.executor.execute(SELECT_PRODUCT_TYPE_BY_ID_SQL, [productTypeID]);

    return rows[0];
  }

  /**
   * Insert a product type that has no row yet.
   *
   * Two routes, differing only in where the path comes from.
   *
   * @param productType the product type to insert.
   * @param urlTitle the url title the populate step settled on, if any.
   * @param productTypeName the product type name the populate step settled on, if any.
   * @returns the persisted product type.
   * @throws An error named `ProductTypePersistenceError` when the parent is transient.
   */
  private async insertProductType(
    productType: ProductType,
    urlTitle: string | undefined,
    productTypeName: string | undefined,
  ): Promise<ProductType> {
    // [org/Hibachi/HibachiEntity.cfc:L609] one timestamp, written to both stamps.
    const auditTimestamp = new Date();

    if (!productType.isNew()) {
      // [model/entity/ProductType.cfc:L306] the path hook first, then the stamping.
      productType.preInsert();

      const detachedRecord = toPersistableRecord(
        productType,
        productType.getProductTypeID(),
        productType.getProductTypeIDPath(),
        urlTitle,
        productTypeName,
        auditTimestamp,
        auditTimestamp,
        resolveAuditActorAccountID(this.auditActor),
      );

      await this.executor.executeMutation(
        INSERT_PRODUCT_TYPE_SQL,
        toBoundParameters(detachedRecord, INSERTED_COLUMNS, INSERT_STATEMENT_LABEL),
      );

      return productType;
    }

    const generatedProductTypeID = generateProductTypeID();

    const record = toPersistableRecord(
      productType,
      generatedProductTypeID,
      buildIdPathForGeneratedIdentifier(productType, generatedProductTypeID),
      urlTitle,
      productTypeName,
      auditTimestamp,
      auditTimestamp,
      resolveAuditActorAccountID(this.auditActor),
    );

    await this.executor.executeMutation(
      INSERT_PRODUCT_TYPE_SQL,
      toBoundParameters(record, INSERTED_COLUMNS, INSERT_STATEMENT_LABEL),
    );

    // The scope is created over no rows: the parent comes from the argument's own already-hydrated
    // chain, so there is nothing for the linkage walk to draw on and the factory is called
    // directly.
    return toProductType(
      record,
      productType.getParentProductType(),
      createHydrationScope([], this, INSERT_STATEMENT_LABEL),
    );
  }

  /**
   * @param productType the product type to update.
   * @param priorRow the row as it stands before this write.
   * @param urlTitle the url title the populate step settled on, if any.
   * @param productTypeName the product type name the populate step settled on, if any.
   * @returns the argument when the populate step overrode nothing, and otherwise an instance
   * hydrated from the record that was written.
   * @throws An error named `ProductTypePersistenceError` when the parent is transient.
   */
  private async updateProductType(
    productType: ProductType,
    priorRow: SqlRow,
    urlTitle: string | undefined,
    productTypeName: string | undefined,
  ): Promise<ProductType> {
    // [model/entity/ProductType.cfc:L311] the path hook first.
    productType.preUpdate(priorRow);

    // [org/Hibachi/HibachiEntity.cfc:L662-L667] then the stamping, modified only.
    const record = toPersistableRecord(
      productType,
      productType.getProductTypeID(),
      productType.getProductTypeIDPath(),
      urlTitle,
      productTypeName,
      productType.getCreatedDateTime(),
      new Date(),
      resolveAuditActorAccountID(this.auditActor),
    );

    const parameters = [
      ...toBoundParameters(record, UPDATED_COLUMNS, UPDATE_STATEMENT_LABEL),
      productType.getProductTypeID(),
    ];

    const update = await this.executor.executeMutation(UPDATE_PRODUCT_TYPE_SQL, parameters);

    // REFUSED when no row matched. Without the guard an update whose key names no row reports
    // SUCCESS, where Hibernate raised - so every update path in this persistence tier carries it.
    if (update.affectedRows === 0) {
      throw new ProductTypePersistenceError(
        'the update matched no SwProductType row, so the key it carries names nothing and the ' +
          'maintained productTypeIDPath was not stored',
      );
    }

    const populateOverrodeNothing =
      urlTitle === productType.getUrlTitle() &&
      productTypeName === productType.getProductTypeName();

    if (populateOverrodeNothing) {
      return productType;
    }

    return toProductType(
      {
        ...record,
        // The record carries what was BOUND; the row now holds what the statement RESOLVED.
        createdByAccountID: productType.getCreatedByAccountID(),
        modifiedByAccountID: resolveStampedModifiedByAccountID(
          this.auditActor,
          productType.getModifiedByAccountID(),
        ),
      },
      productType.getParentProductType(),
      createHydrationScope([], this, UPDATE_STATEMENT_LABEL),
    );
  }
}
