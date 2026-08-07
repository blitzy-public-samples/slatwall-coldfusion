/**
 * MySQL adapter for the product repository port: six port methods, six implementations, over
 * `mysql2` prepared statements.
 *
 * Port of model/dao/ProductDAO.cfc (441 lines), whose HQL and `<cfquery>` bodies are the SQL
 * authority for every statement in this file.
 *
 * @see model/dao/ProductDAO.cfc - the ported DAO.
 */

import { randomUUID } from 'node:crypto';
import { Brand } from '../../domain/entities/brand.js';
import { Option } from '../../domain/entities/option.js';
import { OptionGroup } from '../../domain/entities/optionGroup.js';
import type { ProductHydrationInput } from '../../domain/entities/product.js';
import { Product } from '../../domain/entities/product.js';
import { ProductType } from '../../domain/entities/productType.js';
import type { SkuHydrationInput } from '../../domain/entities/sku.js';
import { Sku } from '../../domain/entities/sku.js';
import type {
  AttributeSetSummary,
  ProductRepository,
  ProductSavePayload,
  ProductSearchMatches,
  ProductSearchRow,
  ProductSearchWindow,
} from '../../domain/ports/productRepository.js';
import type { ProductTypeRepository } from '../../domain/ports/productTypeRepository.js';
import type { SalePriceDetail } from '../../domain/ports/promotionRepository.js';
import { Money } from '../../domain/valueObjects/money.js';
import { listToArray } from '../../lib/cfml/list.js';
import type { CfStruct } from '../../lib/cfml/struct.js';
import { cfFoldKey } from '../../lib/cfml/struct.js';
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import { cfBoolean, cfLen, isNullish } from '../../lib/cfml/truthiness.js';
import type { AuditActorContext, PreparedStatementExecutor, SqlRow } from './connection.js';
import {
  chunkTupleRows,
  isPreparablePlaceholderCount,
  MAX_PLACEHOLDER_COUNT,
  resolveAuditActorAccountID,
  resolveStampedModifiedByAccountID,
  SQL_TUPLE_ROW_LIMIT,
  sqlPlaceholderList,
  sqlUpdateAssignment,
} from './connection.js';
import type { DatabaseDialect } from './dialect.js';
import { assertMySqlDialect } from './dialect.js';

// Every statement in this module is written in the MySQL arm of the dialect selection that
// `config/configORM.cfm:L1-L15` performed at runtime from the database product name.
//
// EXCLUSION §8.5 -
// CFML parity [model/dao/ProductDAO.cfc:L288, L304, L310]: the three dialect branches inside this
// DAO are not modelled as live dialect sites, and `./dialect.js` deliberately does not carry them.

/**
 * The dialect every statement in this module is written for.
 */
const STATEMENT_DIALECT: DatabaseDialect = 'MySQL';

assertMySqlDialect(STATEMENT_DIALECT, 'the ported ProductDAO statements');

/**
 * `sa.activeFlag = 1` [model/dao/ProductDAO.cfc:L54] - the active-attribute test.
 */
const ACTIVE_ATTRIBUTE_FLAG_BOUND_VALUE = 1;

/**
 * `sas.globalFlag = 1` [model/dao/ProductDAO.cfc:L57, L60] - the global-set test.
 */
const GLOBAL_ATTRIBUTE_SET_FLAG_BOUND_VALUE = 1;

/**
 * A result-set column is missing, or holds a shape this adapter cannot map.
 */
class ProductColumnError extends Error {
  constructor(columnName: string, statementLabel: string, detail: string) {
    super(`Column '${columnName}' of ${statementLabel}: ${detail}.`);
    this.name = 'ProductColumnError';
  }
}

/**
 * A write cannot proceed, or a write proceeded and its result cannot be read back.
 */
class ProductPersistenceError extends Error {
  constructor(detail: string) {
    super(`Cannot persist this product: ${detail}.`);
    this.name = 'ProductPersistenceError';
  }
}

/**
 * A mandatory collaborator was not supplied at construction.
 */
class ProductWiringError extends Error {
  constructor(collaboratorName: string) {
    super(
      `MysqlProductRepository was constructed without its '${collaboratorName}' collaborator. It is ` +
        'mandatory: this adapter constructs no collaborator of its own, and the composition root ' +
        'src/handlers/bootstrap.ts is the only place the dependency graph is assembled.',
    );
    this.name = 'ProductWiringError';
  }
}

/**
 * A ported call cannot be satisfied in this runtime at all. See `loadDataFromFile`.
 */
class ProductBulkImportUnavailableError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'ProductBulkImportUnavailableError';
  }
}

/**
 * A collection-valued predicate was handed an empty collection it cannot render.
 */
class ProductEmptyInListError extends Error {
  constructor(parameterName: string, statementLabel: string, detail: string) {
    super(`Parameter '${parameterName}' of ${statementLabel} is empty: ${detail}.`);
    this.name = 'ProductEmptyInListError';
  }
}

/**
 * A required legacy argument was not supplied, and the legacy would have raised on it too.
 *
 * //
 * JUDGMENT CALL: the throw is EXPLICIT because TypeScript would otherwise not throw at all. // ``
 * `%${term}%` `` on an absent `term` interpolates the literal text `undefined` and would search //
 * for `%undefined%`.
 */
class ProductUndefinedArgumentError extends Error {
  constructor(argumentName: string, statementLabel: string) {
    super(
      `Argument '${argumentName}' of ${statementLabel} was not supplied. The legacy binds it ` +
        `unconditionally and CFML raises "element ${argumentName.toUpperCase()} is undefined" at ` +
        `[model/dao/ProductDAO.cfc:L422]; that outcome is preserved rather than defaulted away.`,
    );
    this.name = 'ProductUndefinedArgumentError';
  }
}

/**
 * A product-type filter would make the complete search statement unpreparable.
 */
class ProductSearchPlaceholderCountError extends Error {
  /**
   * How many product-type identifiers the caller supplied.
   */
  public readonly productTypeIDCount: number;

  /**
   * How many placeholders the complete statement would have carried.
   */
  public readonly placeholderCount: number;

  public constructor(productTypeIDCount: number, placeholderCount: number) {
    super(
      [
        `The productTypeIDs argument carries ${String(productTypeIDCount)} identifiers, so the`,
        `complete product search would carry ${String(placeholderCount)} placeholders; MySQL cannot`,
        `prepare a statement with more than ${String(MAX_PLACEHOLDER_COUNT)} placeholders.`,
        'The list is refused on its count alone and no identifier is reproduced or altered.',
      ].join(' '),
    );
    this.name = 'ProductSearchPlaceholderCountError';
    this.productTypeIDCount = productTypeIDCount;
    this.placeholderCount = placeholderCount;
  }
}

// The full reasoning is recorded once, in the matching block at the head of
// `./mysqlSkuRepository.ts`.
//
// Materialization is already BATCHED rather than per-row - one graph statement, one SKU statement
// and one option statement for the whole match set.

/**
 * A row carries a foreign key that names no row in the referenced table.
 *
 * CFML parity: a Hibernate many-to-one defaults to `not-found="exception"`, and none of the three
 * many-to-one associations on `model/entity/Product.cfc` - `brand` (L68), `productType` (L69) and
 * `defaultSku` (L70) - overrides it.
 *
 * //
 * JUDGMENT CALL: raising is not merely parity here, it is protective.
 */
class ProductAssociationError extends Error {
  constructor(associationName: string, referencedTable: string, statementLabel: string) {
    super(
      `A row read by ${statementLabel} references a ${associationName} that does not exist in ` +
        `${referencedTable}. A Hibernate many-to-one defaults to not-found="exception" and none of ` +
        `the product associations overrides it, so this row did not load in the legacy either.`,
    );
    this.name = 'ProductAssociationError';
  }
}

// One per statement, carrying the legacy locator where a legacy statement exists, so a column
// fault names both the reader and the provenance of the statement it read from.

const ATTRIBUTE_SETS_GLOBAL_LABEL =
  'the attribute-set read, global-only arm [model/dao/ProductDAO.cfc:L60, L68]';

const ATTRIBUTE_SETS_BY_PRODUCT_TYPE_LABEL =
  'the attribute-set read, product-type arm [model/dao/ProductDAO.cfc:L57-L58, L66]';

const PRODUCT_SEARCH_LABEL =
  'the product search by product type [model/dao/ProductDAO.cfc:L419-L437]';

const PRODUCT_GRAPH_LABEL = 'the product read with its eager brand and product type';

const PRODUCT_SKUS_LABEL = 'the product sku read';

const PRODUCT_SKU_OPTIONS_LABEL = 'the sku option read';

const PRODUCT_INSERT_LABEL = 'the product insert';

const PRODUCT_UPDATE_LABEL = 'the product update';

// Reading a result-set row.
//
// CFML parity [model/dao/ProductDAO.cfc:L432-L433]: query-column access in CFML is
// case-insensitive.
//
// JUDGMENT CALL: every fold uses `toLowerCase()` and never `toLocaleLowerCase()`.

/**
 * The outcome of looking for one column, keeping "absent" distinct from "null".
 */
type ColumnLookup = { readonly found: true; readonly value: unknown } | { readonly found: false };

/**
 * Fold an identifier for comparison, once, in one place.
 *
 * @param identifier a column name, an alias or a persisted identifier.
 * @returns the case-folded form, for use as a map key or a comparison operand only.
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
 * Read one column the statement is required to have selected.
 *
 * @param row one result-set row.
 * @param columnName the column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the raw driver value, which may be `null`.
 * @throws An error named `ProductColumnError` when no column of that name is present.
 */
function requireColumn(row: SqlRow, columnName: string, statementLabel: string): unknown {
  const lookup = findColumn(row, columnName);

  if (!lookup.found) {
    throw new ProductColumnError(
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

  if (value === undefined) {
    return 'an absent value';
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
 * Read a NOT-NULL identifier column - a primary key, or a foreign key the statement filtered on.
 *
 * @param row one result-set row.
 * @param columnName the column to read.
 * @param statementLabel which statement produced the row.
 * @returns the identifier as text.
 * @throws An error named `ProductColumnError` when the cell is NULL, empty, or not textual.
 */
function readIdentifier(row: SqlRow, columnName: string, statementLabel: string): string {
  const value = requireColumn(row, columnName, statementLabel);

  if (typeof value !== 'string') {
    throw new ProductColumnError(
      columnName,
      statementLabel,
      `expected an identifier string but the driver returned ${describeColumnType(value)}`,
    );
  }

  if (value.length === 0) {
    throw new ProductColumnError(columnName, statementLabel, 'the identifier is the empty string');
  }

  return value;
}

/**
 * Read a nullable text column, mapping SQL NULL to `undefined`.
 *
 * CFML parity: a CFML query cell that is NULL reads as the empty string, so legacy code cannot
 * tell NULL from `''` and never needed to.
 *
 * @param row one result-set row.
 * @param columnName the column to read.
 * @param statementLabel which statement produced the row.
 * @returns the text, or `undefined` when the cell is SQL NULL.
 * @throws An error named `ProductColumnError` when the cell holds a non-textual, non-null value.
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

  if (typeof value !== 'string') {
    throw new ProductColumnError(
      columnName,
      statementLabel,
      `expected text or SQL NULL but the driver returned ${describeColumnType(value)}`,
    );
  }

  return value;
}

/**
 * Read a nullable whole-number column - `sortOrder`, `calculatedQATS`, and the aggregate count.
 *
 * @param row one result-set row.
 * @param columnName the column to read.
 * @param statementLabel which statement produced the row.
 * @returns the number, or `undefined` when the cell is SQL NULL.
 * @throws An error named `ProductColumnError` when the cell is not a whole number in range.
 */
function readOptionalCount(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): number | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value === 'bigint') {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new ProductColumnError(
        columnName,
        statementLabel,
        'the value exceeds the safe integer range and cannot be represented without loss',
      );
    }

    return Number(value);
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ProductColumnError(
      columnName,
      statementLabel,
      `expected a finite number or SQL NULL but the driver returned ${describeColumnType(value)}`,
    );
  }

  return value;
}

/**
 * Read a NOT-NULL aggregate count - the correlated attribute count of the attribute-set
 * projection.
 *
 * @param row one result-set row.
 * @param columnName the column to read.
 * @param statementLabel which statement produced the row.
 * @returns the count.
 * @throws An error named `ProductColumnError` when the aggregate is NULL or out of range.
 */
function readCount(row: SqlRow, columnName: string, statementLabel: string): number {
  const value = readOptionalCount(row, columnName, statementLabel);

  if (value === undefined) {
    throw new ProductColumnError(
      columnName,
      statementLabel,
      'an aggregate count cannot be SQL NULL',
    );
  }

  return value;
}

/**
 * Read a nullable `DATETIME` / `TIMESTAMP` column.
 *
 * @param row one result-set row.
 * @param columnName the column to read.
 * @param statementLabel which statement produced the row.
 * @returns the timestamp, or `undefined` when the cell is SQL NULL.
 * @throws An error named `ProductColumnError` when the cell is neither a valid `Date` nor NULL.
 */
function readTimestamp(row: SqlRow, columnName: string, statementLabel: string): Date | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ProductColumnError(
      columnName,
      statementLabel,
      `expected a valid Date or SQL NULL but the driver returned ${describeColumnType(value)}`,
    );
  }

  return value;
}

/**
 * Read a boolean column and hand it on UNCOERCED.
 *
 * JUDGMENT CALL: the single coercion funnel for every boolean in this slice is `cfBoolean()`, and
 * it runs in the ENTITY - `src/domain/entities/product.ts` calls it on `activeFlag`,
 * `publishedFlag` and `calculatedAllowBackorderFlag`, `src/domain/entities/brand.ts` calls it on
 * `activeFlag` and `publishedFlag`.
 *
 * @param row one result-set row.
 * @param columnName the column to read.
 * @param statementLabel which statement produced the row.
 * @returns the value in the shape `cfBoolean()` accepts, uncoerced.
 * @throws An error named `ProductColumnError` when the cell is none of the accepted shapes.
 */
function readFlag(row: SqlRow, columnName: string, statementLabel: string): CfBooleanInput {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (value instanceof Uint8Array) {
    const firstByte = value.at(0);

    return firstByte === undefined ? undefined : firstByte;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  throw new ProductColumnError(
    columnName,
    statementLabel,
    `expected a boolean, number, string, BIT buffer or SQL NULL but the driver returned ${describeColumnType(
      value,
    )}`,
  );
}

/**
 * Read a `big_decimal` money column.
 *
 * @param row one result-set row.
 * @param columnName the column to read.
 * @param statementLabel which statement produced the row.
 * @returns the amount, or `undefined` when the cell is SQL NULL.
 * @throws An error named `ProductColumnError` when the cell is not a decimal string or NULL, or an
 * error named `MoneyParseError` from `Money.fromDecimalString` when the text is not a decimal.
 */
function readMoney(row: SqlRow, columnName: string, statementLabel: string): Money | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ProductColumnError(
      columnName,
      statementLabel,
      `expected a decimal string or SQL NULL but the driver returned ${describeColumnType(value)} - ` +
        'the pool leaves `decimalNumbers` unset so DECIMAL must arrive as text',
    );
  }

  return Money.fromDecimalString(value);
}

/**
 * Normalize one value for binding.
 *
 * @param value the value to bind.
 * @returns the value, or `null` when it is absent.
 */
function toBindableValue(value: unknown): unknown {
  return isNullish(value) ? null : value;
}

/**
 * Render a money value for binding, or `null` when it is absent.
 *
 * @param amount the amount to bind, if any.
 * @returns the decimal string, or `null`.
 */
function toBindableMoney(amount: Money | undefined): string | null {
  return amount === undefined ? null : amount.toDecimalString();
}

// The persisted columns.
//
// B5, schema continuity: these lists ENUMERATE what already exists.
//
// JUDGMENT CALL: each write statement's TEXT and its bound parameter ARRAY are both derived from
// one ordered list, so their agreement is structural rather than maintained by eye.

/**
 * The twenty physical columns of `SwProduct`, in insert order.
 */
const PRODUCT_INSERTED_COLUMNS = [
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
] as const;

/**
 * The seventeen columns an update SETs - and the three deliberate exclusions.
 *
 * `productID` is excluded because it is the key the statement MATCHES on rather than a value it
 * sets.
 */
const PRODUCT_UPDATED_COLUMNS = [
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
  'modifiedDateTime',
  'modifiedByAccountID',
] as const;

/**
 * The eleven physical columns of `SwBrand`, read-only in this module.
 *
 * Taken from `model/entity/Brand.cfc`: the six scalars at L52-L57, `remoteID` at L77, and the four
 * audit columns at L80-L83.
 *
 * This module never writes `SwBrand`, and no module in the slice does.
 */
const BRAND_READ_COLUMNS = [
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
] as const;

/**
 * A row about to be written, keyed by physical column name.
 *
 * Deliberately not the entity: the entity publishes no `brandID`, `productTypeID` or
 * `defaultSkuID` accessor - it publishes the ASSOCIATIONS those columns implement.
 */
type PersistableRecord = Readonly<Record<string, unknown>>;

/**
 * Project a persistable record onto an ordered column list, ready to bind.
 *
 * @param record the row to bind.
 * @param columns the ordered column names, which must match the statement's own order exactly.
 * @param statementLabel which statement is being bound.
 * @returns the bound parameters, in column order, with every absent value normalized to `null`.
 * @throws An error named `ProductColumnError` when the record does not carry a listed column.
 */
function toBoundParameters(
  record: PersistableRecord,
  columns: readonly string[],
  statementLabel: string,
): unknown[] {
  return columns.map((columnName: string) =>
    toBindableValue(requireColumn(record, columnName, statementLabel)),
  );
}

// E5, parameterized SQL exclusively: every VALUE below is a positional `?` bound through
// `executor.execute` / `executor.executeMutation`, which are server-side prepared statements.

/**
 * The attribute-set read projection.
 *
 * Asks whether at least one ACTIVE attribute exists [model/dao/ProductDAO.cfc:L54].
 *
 * CFML parity [model/dao/ProductDAO.cfc:L55, L62]: `sas.attributeSetType.systemCode` is an HQL
 * implicit join across the many-to-one at [model/entity/AttributeSet.cfc:L64], and Hibernate
 * renders an implicit join in a where clause as an inner join.
 */
const ATTRIBUTE_SET_PROJECTION = [
  'sas.attributeSetID as attributeSetID',
  'sas.activeFlag as activeFlag',
  'sas.attributeSetName as attributeSetName',
  'sas.attributeSetCode as attributeSetCode',
  'sas.attributeSetDescription as attributeSetDescription',
  'sas.globalFlag as globalFlag',
  'sas.requiredFlag as requiredFlag',
  'sas.sortOrder as sortOrder',
  'sast.systemCode as attributeSetTypeSystemCode',
  '(SELECT COUNT(*) FROM SwAttribute sac WHERE sac.attributeSetID = sas.attributeSetID) as attributeCount',
].join(',\n  ');

/**
 * The from and the two predicates every arm shares, plus the legacy ORDER by.
 *
 * The ordering is the legacy's own [model/dao/ProductDAO.cfc:L62], carried over verbatim - primary
 * key the type system code ascending, secondary key the attribute-set sort order ascending.
 */
const ATTRIBUTE_SET_FROM_AND_TYPE_FILTER = `FROM SwAttributeSet sas
INNER JOIN SwType sast ON sast.typeID = sas.attributeSetTypeID
WHERE (EXISTS (
    SELECT 1 FROM SwAttribute sa
    WHERE sa.attributeSetID = sas.attributeSetID AND sa.activeFlag = ?
  )`;

/**
 * The legacy ordering, shared by both arms [model/dao/ProductDAO.cfc:L62].
 */
const ATTRIBUTE_SET_ORDER_BY = 'ORDER BY sast.systemCode ASC, sas.sortOrder ASC';

/**
 * The global-only arm - the branch the legacy takes when `productTypeIDs` is EMPTY.
 *
 * CFML parity [model/dao/ProductDAO.cfc:L60, L68]: the HQL fragment is `AND sas.globalFlag = 1`,
 * and the binding at L68 passes `arguments.attributeSetTypeCode` as AN ARRAY.
 *
 * @param typeCodeCount how many attribute-set type codes will be bound; must be at least one.
 * @returns the statement text.
 * @throws An error named `SqlPlaceholderCountError` when `typeCodeCount` is below one.
 */
function buildGlobalAttributeSetsSql(typeCodeCount: number): string {
  return `SELECT
  ${ATTRIBUTE_SET_PROJECTION}
${ATTRIBUTE_SET_FROM_AND_TYPE_FILTER}
  AND sast.systemCode IN (${sqlPlaceholderList(typeCodeCount)}))
  AND sas.globalFlag = ?
${ATTRIBUTE_SET_ORDER_BY}`;
}

/**
 * The product-type arm: the branch the legacy takes when `productTypeIDs` is non-empty.
 *
 * TODO: Remove this conditional when railo and ACF match how they handle arrays for '`IN`' clause.
 *
 * The TODO above is [model/dao/ProductDAO.cfc:L64], carried over character for character including
 * the lower-case `railo` and the single quotes around `IN`.
 *
 * JUDGMENT CALL: `systemCode IN (?)` renders exactly one placeholder and the joined comma-delimited
 * string is bound to it as a single parameter, which is what the legacy `cfqueryparam` did.
 *
 * JUDGMENT CALL: the real link table is named, because the existing `Sw*` schema is the contract and
 * a statement naming a table that does not exist cannot read it.
 *
 * @param productTypeIDCount how many product-type identifiers will be bound; must be at least one.
 * @returns the statement text.
 * @throws An error named `SqlPlaceholderCountError` when `productTypeIDCount` is below one.
 */
function buildAttributeSetsByProductTypeSql(productTypeIDCount: number): string {
  return `SELECT
  ${ATTRIBUTE_SET_PROJECTION}
${ATTRIBUTE_SET_FROM_AND_TYPE_FILTER}
  AND sast.systemCode IN (?))
  AND (sas.globalFlag = ?
    OR EXISTS (
      SELECT 1 FROM SwAttributeSetProductType saspt
      WHERE saspt.attributeSetID = sas.attributeSetID
        AND saspt.productTypeID IN (${sqlPlaceholderList(productTypeIDCount)})
    ))
${ATTRIBUTE_SET_ORDER_BY}`;
}

/**
 * The ported product search, [model/dao/ProductDAO.cfc:L419-L437].
 *
 * //
 * JUDGMENT CALL: the correct physical name `SwProduct` is emitted, as a documented CORRECTION //
 * mandated by B5 (schema continuity).
 *
 * //
 * CFML parity [model/dao/ProductDAO.cfc:L420-L427]: the legacy spelling was `SlatwallProduct` and
 * // the keyword casing was lower case.
 *
 * @param productTypeIDCount how many product-type identifiers will be bound, or zero to omit the
 * product-type predicate entirely.
 * @returns the statement text.
 */
function buildProductSearchSql(productTypeIDCount: number): string {
  const base = 'select productID,productName from SwProduct where productName like ?';

  if (productTypeIDCount < 1) {
    return base;
  }

  return `${base} and productTypeID in (${sqlPlaceholderList(productTypeIDCount)})`;
}

/**
 * The fourteen physical columns of `SwProductType`, read-only in this module.
 *
 * From `model/entity/ProductType.cfc`: the eight scalars at L52-L59, the `parentProductTypeID`
 * foreign key at L62, `remoteID` at L80, and the four audit columns at L83-L86.
 */
const PRODUCT_TYPE_READ_COLUMNS = [
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
 * The sixteen physical columns of `SwSku`, read-only in this module.
 *
 * From `model/entity/Sku.cfc`: the eight scalars at L52-L59, `calculatedQATS` at L62, the two
 * foreign keys at L65-L66 (`productID`, `subscriptionTermID`), `remoteID`.
 */
const SKU_READ_COLUMNS = [
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
] as const;

/**
 * The twelve `SwOption` columns this module reads.
 *
 * From `model/entity/Option.cfc`: the five scalars at L52-L56, `optionGroupID` at L59,
 * `defaultImageID` at L60, `remoteID` at L69, and the four audit columns at L72-L75.
 *
 * The group therefore arrives through the same left outer join `mysqlSkuRepository.ts` uses,
 * adding no statement to the fetch shape - see {@link buildSkuOptionsSql}.
 */
const OPTION_READ_COLUMNS = [
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
] as const;

/**
 * The twelve `SwOptionGroup` columns joined alongside each option.
 * [model/entity/OptionGroup.cfc:L52-L67]
 *
 * Identical to the set `mysqlSkuRepository.ts` reads, deliberately: the two adapters hydrate the
 * same entity from the same table.
 */
const OPTION_GROUP_READ_COLUMNS = [
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
] as const;

/**
 * Alias prefix for the option-group columns joined alongside an option.
 */
const OPTION_GROUP_ALIAS_PREFIX = 'optionGroup_';

/**
 * Render an aliased projection for one table of a multi-table read.
 *
 * `SwProduct`, `SwBrand` and `SwProductType` all carry `activeFlag`, `urlTitle`, `remoteID` and
 * the four audit columns.
 *
 * @param tableAlias the table's alias inside the statement.
 * @param labelPrefix the prefix applied to every result label.
 * @param columns the columns to project, in order.
 * @returns the projection fragment, newline-and-indent separated to match the surrounding
 * statements.
 */
function aliasedProjection(
  tableAlias: string,
  labelPrefix: string,
  columns: readonly string[],
): string {
  return columns
    .map((columnName: string) => `${tableAlias}.${columnName} as ${labelPrefix}${columnName}`)
    .join(',\n  ');
}

/**
 * The product graph projection - forty-five labels across three tables.
 *
 * T3, FETCH SHAPE is A DECISION: `brand` and `productType` are materialized in the same statement
 * as the product, and that is CFML parity rather than preference.
 *
 * `defaultSku` also declares `fetch="join"` [model/entity/Product.cfc:L70] and is not joined here.
 */
const PRODUCT_GRAPH_PROJECTION = [
  aliasedProjection('p', 'p_', PRODUCT_INSERTED_COLUMNS),
  aliasedProjection('b', 'b_', BRAND_READ_COLUMNS),
  aliasedProjection('pt', 'pt_', PRODUCT_TYPE_READ_COLUMNS),
].join(',\n  ');

/**
 * Read one or more products with their eager brand and product type.
 *
 * @param productIDCount how many product identifiers will be bound; must be at least one.
 * @returns the statement text.
 * @throws An error named `SqlPlaceholderCountError` when `productIDCount` is below one.
 */
function buildProductGraphSql(productIDCount: number): string {
  return `SELECT
  ${PRODUCT_GRAPH_PROJECTION}
FROM SwProduct p
LEFT JOIN SwBrand b ON b.brandID = p.brandID
LEFT JOIN SwProductType pt ON pt.productTypeID = p.productTypeID
WHERE p.productID IN (${sqlPlaceholderList(productIDCount)})`;
}

/**
 * @param productIDCount how many product identifiers will be bound; may be zero when only
 * default-SKU identifiers are being resolved.
 * @param defaultSkuIDCount how many default-SKU identifiers will be bound; may be zero.
 * @returns the statement text.
 * @throws An error named `ProductEmptyInListError` when both counts are zero, which would render a
 * predicate that matches nothing and must be short-circuited by the caller instead.
 */
function buildProductSkusSql(productIDCount: number, defaultSkuIDCount: number): string {
  const predicates: string[] = [];

  if (productIDCount > 0) {
    predicates.push(`s.productID IN (${sqlPlaceholderList(productIDCount)})`);
  }

  if (defaultSkuIDCount > 0) {
    predicates.push(`s.skuID IN (${sqlPlaceholderList(defaultSkuIDCount)})`);
  }

  if (predicates.length === 0) {
    throw new ProductEmptyInListError(
      'productID',
      PRODUCT_SKUS_LABEL,
      'neither a product nor a default-sku predicate was requested, so the caller must short-circuit',
    );
  }

  return `SELECT
  ${SKU_READ_COLUMNS.map((columnName: string) => `s.${columnName}`).join(',\n  ')}
FROM SwSku s
WHERE ${predicates.join('\n  OR ')}`;
}

/**
 * Read the options of a set of SKUs across the `SwSkuOption` link table.
 *
 * CFML parity [model/entity/Sku.cfc:L76]: `options` is a many-to-many declared
 * `linktable="SwSkuOption" fkcolumn="skuID" inversejoincolumn="optionID"`, with no `orderby`.
 *
 * @param skuIDCount how many SKU identifiers will be bound; must be at least one.
 * @returns the statement text.
 * @throws An error named `SqlPlaceholderCountError` when `skuIDCount` is below one.
 */
function buildSkuOptionsSql(skuIDCount: number): string {
  return `SELECT
  so.skuID as link_skuID,
  ${OPTION_READ_COLUMNS.map((columnName: string) => `o.${columnName}`).join(',\n  ')},
  ${aliasedProjection('og', OPTION_GROUP_ALIAS_PREFIX, OPTION_GROUP_READ_COLUMNS)}
FROM SwSkuOption so
INNER JOIN SwOption o ON o.optionID = so.optionID
LEFT JOIN SwOptionGroup og ON og.optionGroupID = o.optionGroupID
WHERE so.skuID IN (${sqlPlaceholderList(skuIDCount)})`;
}

/**
 * Existence read for the product save path.
 *
 * One column, because one column is all the decision needs.
 */
const SELECT_PRODUCT_ID_SQL = 'SELECT productID FROM SwProduct WHERE productID = ?';

/**
 * Insert one product row.
 */
const INSERT_PRODUCT_SQL = `INSERT INTO SwProduct (
  ${PRODUCT_INSERTED_COLUMNS.join(',\n  ')}
) VALUES (${sqlPlaceholderList(PRODUCT_INSERTED_COLUMNS.length)})`;

/**
 * Update one product row, matched on its primary key.
 *
 * Seventeen set assignments then the key, so eighteen parameters bind in that order and the key is
 * bound last.
 */
const UPDATE_PRODUCT_SQL = `UPDATE SwProduct
SET
  ${PRODUCT_UPDATED_COLUMNS.map((columnName: string) => sqlUpdateAssignment(columnName)).join(',\n  ')}
WHERE productID = ?`;

/**
 * Point a product row at its default SKU, once that SKU has a key.
 *
 * References `SwProduct` [model/entity/Sku.cfc:L65] and `SwProduct.defaultSkuID` references
 * `SwSku` [model/entity/Product.cfc:L70], so neither row can be written with its key already
 * satisfied: the product row has to exist before any SKU row may name it.
 *
 * `defaultSkuID` binds first and the key binds last, matching the placeholder order.
 */
const UPDATE_PRODUCT_DEFAULT_SKU_SQL = 'UPDATE SwProduct SET defaultSkuID = ? WHERE productID = ?';

/**
 * Detach a product from its default SKU so that its SKU rows may be deleted.
 *
 * This is the SQL half of `arguments.product.setDefaultSku(javaCast("null", ""))`
 * [model/service/ProductService.cfc:L323].
 *
 * The audit stamps are left alone, unlike the child detachment in the price-group adapter.
 */
const DETACH_PRODUCT_DEFAULT_SKU_SQL =
  'UPDATE SwProduct SET defaultSkuID = NULL WHERE productID = ?';

/**
 * The three link tables the product OWNS, whose rows go with it.
 *
 * `listingPages` -> `SwProductListingPage` [model/entity/Product.cfc:L79], `categories` ->
 * `SwProductCategory` [model/dao/ProductDAO.cfc:L80] and `relatedProducts` -> `SwRelatedProduct`
 * [model/dao/ProductDAO.cfc:L81] are all declared `fieldtype="many-to-many"` with
 * `fkcolumn="productID"` and no `inverse="true"`.
 *
 * `SwRelatedProduct` is self-referential, and only the owned half is deleted.
 */
const PRODUCT_OWNED_LINK_TABLES: readonly string[] = Object.freeze([
  'SwProductListingPage',
  'SwProductCategory',
  'SwRelatedProduct',
]);

/**
 * The seven INVERSE `many-to-many` link tables that name this product, in declaration order.
 *
 * `model/entity/Product.cfc` declares exactly ten `many-to-many` properties - the three owner
 * tables above [model/entity/Product.cfc:L79-L81] and the seven inverse ones here
 * [model/dao/ProductDAO.cfc:L84-L90] - and not one of them declares a `cascade`.
 */
const PRODUCT_INVERSE_LINK_TABLES: readonly string[] = Object.freeze([
  'SwPromoRewardProduct',
  'SwPromoRewardExclProduct',
  'SwPromoQualProduct',
  'SwPromoQualExclProduct',
  'SwPriceGroupRateProduct',
  'SwVendorProduct',
  'SwPhysicalProduct',
]);

/**
 * The product's own one-to-many dependents, each declared `cascade="all-delete-orphan"`.
 *
 * `skus` [model/dao/ProductDAO.cfc:L73] carries the same declaration but is deleted separately,
 * because its own dependents have to go first.
 */
const PRODUCT_DEPENDENT_TABLES: readonly string[] = Object.freeze([
  'SwImage',
  'SwAttributeValue',
  'SwProductReview',
]);

/**
 * The physical table behind the `skus` collection [model/entity/Product.cfc:L73].
 */
const SKU_TABLE_NAME = 'SwSku';

/**
 * Everything that hangs off a SKU, which the `skus` cascade reached transitively.
 *
 * `cascade="all-delete-orphan"` on `Product.skus` [model/entity/Product.cfc:L73] deleted each SKU
 * entity, and deleting a SKU entity ran its own declarations in turn.
 *
 * `SwSkuSubsBenefit` and `SwSkuRenewalSubsBenefit` are LINK tables owned by `Sku` itself, not
 * subscription business logic: their rows exist only to join a SKU to a benefit, they carry no
 * payload.
 */
const SKU_DEPENDENT_TABLES: readonly string[] = Object.freeze([
  'SwAlternateSkuCode',
  'SwAttributeValue',
  'SwSkuCurrency',
  'SwStock',
  'SwSkuOption',
  'SwSkuAccessContent',
  'SwSkuSubsBenefit',
  'SwSkuRenewalSubsBenefit',
]);

/**
 * Delete every row of one table that names this product directly.
 *
 * One shared builder rather than a dozen hand-written constants, because the statement is the same
 * shape in every case and the table name is the only variable.
 *
 * @param tableName the physical table to delete from.
 * @returns a single-parameter DELETE keyed on `productID`.
 */
function buildDeleteByProductIdSql(tableName: string): string {
  return `DELETE FROM ${tableName} WHERE productID = ?`;
}

/**
 * Delete every row of one table that names any SKU of this product.
 *
 * It runs before `SwSku` itself is emptied, or the subquery would select nothing and the
 * dependents would survive as orphans.
 *
 * @param tableName the physical table to delete from.
 * @returns a single-parameter DELETE keyed on the product's SKUs.
 */
function buildDeleteBySkuOfProductSql(tableName: string): string {
  return `DELETE FROM ${tableName} WHERE skuID IN (SELECT skuID FROM ${SKU_TABLE_NAME} WHERE productID = ?)`;
}

/**
 * Delete one product row - the last statement of the cascade, not the whole of it.
 *
 * The old reasoning was: "Reproducing the cascade would mean four to six dependent DELETEs with no
 * enclosing transaction.
 *
 * The conditional was sound and its premise is no longer true.
 */
const DELETE_PRODUCT_SQL = 'DELETE FROM SwProduct WHERE productID = ?';

/**
 * Mint a persisted identifier.
 *
 * CFML parity [model/entity/Product.cfc:L52] and [model/entity/Brand.cfc:L52]: both keys declare
 * `ormtype="string" length="32" fieldtype="id" generator="uuid" unsavedvalue="" default=""`.
 *
 * The legacy bulk importer's own `createUUID()` calls are not the model here.
 *
 * @returns a 32-character lower-case hexadecimal identifier.
 */
function generatePersistedIdentifier(): string {
  return randomUUID().replaceAll('-', '');
}

// `exactOptionalPropertyTypes` is on, so `{ urlTitle: undefined }` is not assignable to a member
// declared `urlTitle?: string` - an optional member may be ABSENT or a string.
//
// Each draft type is DERIVED from the entity's own input type, so the two cannot drift.

/**
 * A mutable draft of {@link ProductHydrationInput}.
 */
type ProductHydrationDraft = {
  -readonly [K in keyof ProductHydrationInput]: ProductHydrationInput[K];
};

/**
 * A mutable draft of {@link SkuHydrationInput}.
 */
type SkuHydrationDraft = {
  -readonly [K in keyof SkuHydrationInput]: SkuHydrationInput[K];
};

/**
 * A mutable draft of the port's read projection.
 */
type AttributeSetSummaryDraft = {
  -readonly [K in keyof AttributeSetSummary]: AttributeSetSummary[K];
};

/**
 * Every SKU one graph read needs, indexed the two ways that read consumes it.
 *
 * One statement, two indexes, and the second index is not a convenience.
 */
type MaterializedSkus = {
  /**
   * The SKUs of each requested product, in the order the SKU statement returned them.
   */
  readonly byProductID: ReadonlyMap<string, Sku[]>;
  /**
   * Every SKU the statement returned, by identifier, including default SKUs owned elsewhere.
   */
  readonly bySkuID: ReadonlyMap<string, Sku>;
};

/**
 * The collaborator ports this adapter forwards into every entity it hydrates.
 *
 * `productRepository` is not in this bag, because this instance is it.
 *
 * //
 * JUDGMENT CALL: the bag is a REQUIRED constructor parameter whose members are individually //
 * optional EXCEPT `productTypeRepository`.
 */
type ProductHydrationCollaborators = Readonly<
  Pick<
    ProductHydrationInput,
    | 'settingsProvider'
    | 'productTitleTemplate'
    | 'skuRepository'
    | 'optionRepository'
    | 'subscriptionTermProvider'
    | 'salePriceResolver'
  >
> & {
  readonly salePriceResolver?: ProductSalePriceResolver;

  /**
   * The product-type load-by-identifier port forwarded into every `ProductType` this adapter
   * hydrates. REQUIRED.
   *
   * Absent, `POST /promotions/application` answers 500 for ordinary catalogue data, because every
   * hydrated `ProductType` needs it to resolve its ancestry.
   */
  readonly productTypeRepository: ProductTypeRepository;
};

/**
 * The narrow sale-price capability this adapter consults on the read path.
 *
 * //
 * JUDGMENT CALL: the member is OPTIONAL on the collaborators bag, exactly like the four ports
 * beside // it.
 */
interface ProductSalePriceResolver {
  /**
   * The sale-price details for one product's SKUs, keyed by `skuID`.
   *
   * @param productID the product whose SKUs to resolve.
   * @returns one detail per SKU that has one; empty when the product has no sale-price rewards.
   */
  getSalePriceDetailsForProductSkus(productID: string): Promise<CfStruct<SalePriceDetail>>;

  /**
   * Read a whole product set's sale-price rows ahead of the per-product resolutions, so that those
   * resolutions have nothing left to read.
   *
   * WHY A SECOND MEMBER HERE RATHER THAN A SECOND RESOLUTION SHAPE. QA measured the sequenced
   * price-group-then-promotion pass and counted the statements one request executed: 32 for a
   * one-item order, 48 for ten, 228 for a hundred, 1028 for five hundred. The single-product
   * resolution below was issued once per DISTINCT PRODUCT, so the six-branch sale-price reduction -
   * the most involved statement in the slice - ran five hundred times for one request. AAP T3 makes
   * this boundary's fetch shape "an explicit, documented decision per method", and a count that is a
   * function of the caller's item count is not a decision this file had taken; AAP 0.4.3 names that
   * same statement as the one whose reduction was moved into SQL. This member is how the decision gets
   * taken, WITHOUT touching a single signature that has a legacy counterpart:
   *
   * `getSalePriceDetailsForProductSkus` [model/service/PromotionService.cfc:L1022] still takes ONE
   * product and still performs the whole reduction-and-rounding loop, and the exported
   * `SalePriceResolver` port still declares exactly one method.
   *
   * IT IS OPTIONAL, FOR THE SAME REASON THE RESOLVER ITSELF IS. Over a hundred construction sites
   * in the integration suites build this adapter with a capturing executor and a one-method resolver
   * object; a required member would break every one of them. Its absence is precise and bounded: the
   * per-product resolutions below simply do what they have always done, one read each. Nothing degrades
   * except the statement count, and no product hydrates differently.
   *
   * THE MAPPING IS SUPPLIED BECAUSE THE ROWS CANNOT SUPPLY IT. The reduced result set projects
   * eight columns and no owning product identifier, and §4.3 of
   * `./sql/salePricePromotionRewards.sql.ts` forbids adding one - `noQualifierDiscounts` takes
   * `DISTINCT` over exactly the nine columns it projects, and that set IS the reviewer's guarantee. So
   * the implementation is handed the `productID -> skuIDs` mapping this adapter has ALREADY read, from
   * {@link MysqlProductRepository.readSkus}, and partitions with it. An implementation that cannot
   * partition a row must abandon the batch rather than drop the row.
   *
   * @param skuIDsByProductID every product to be resolved, mapped to the identifiers of the SKUs it
   *   owns. Implementations must treat an EMPTY map as a no-op and must NOT read the whole catalogue
   *   for one.
   * @returns nothing observable. Whatever it read is answered through
   *   `getSalePriceDetailsForProductSkus`, which is still the only way a detail is obtained.
   */
  prefetchSalePriceDetailsForProducts?(
    skuIDsByProductID: ReadonlyMap<string, readonly string[]>,
  ): Promise<void>;
}

/**
 * The `productID -> skuIDs` mapping a batched sale-price read partitions its rows with, projected from
 * the SKUs this adapter has already materialized.
 *
 * THE KEYS ARE THE IDENTIFIERS THE RESOLVER WILL BE ASKED FOR, and the values are drawn from the SKU
 * index under a FOLDED lookup. The two sides come from different statements - the product graph read
 * projects `p_productID`, the SKU read projects `SwSku.productID` - and MySQL's default collation is
 * case-insensitive, so two spellings of one identifier are the same product to the database and two
 * different keys to a `Map`. Folding the lookup is what stops a product being narrowed on while its
 * SKUs are attributed to nobody, which is precisely the state that makes a batch unpartitionable.
 *
 * A product with no materialized SKUs maps to an EMPTY list rather than being omitted: it must still be
 * narrowed on, so that the batch covers it and its answer is "no sale-price rows" rather than "not
 * read". A batch that quietly skipped it would leave the per-product call to read it alone, which is
 * the statement this exists to avoid.
 *
 * A module-level function rather than a private method, deliberately: it is a pure projection over its
 * two arguments, it reaches no field, and
 * `tests/integration/repositories/mysqlProductRepository.test.ts` pins this class's prototype member
 * list exactly - a helper that needs no instance should not appear on it.
 *
 * @param productIDs the distinct products about to be resolved, in the caller's own spelling.
 * @param skusByProductID every materialized SKU, indexed by the owning identifier the SKU rows carried.
 * @returns one entry per requested product, mapped to the identifiers of its materialized SKUs.
 */
function salePriceSkuIdentifiers(
  productIDs: readonly string[],
  skusByProductID: ReadonlyMap<string, readonly Sku[]>,
): ReadonlyMap<string, readonly string[]> {
  const skuIDsByFoldedProductID = new Map<string, string[]>();

  for (const [owningProductID, skus] of skusByProductID) {
    const folded = cfFoldKey(owningProductID);
    const collected = skuIDsByFoldedProductID.get(folded);
    const skuIDs = skus.map((sku: Sku): string => sku.getSkuID());

    if (collected === undefined) {
      skuIDsByFoldedProductID.set(folded, skuIDs);
    } else {
      collected.push(...skuIDs);
    }
  }

  const mapping = new Map<string, readonly string[]>();

  for (const productID of productIDs) {
    mapping.set(productID, skuIDsByFoldedProductID.get(cfFoldKey(productID)) ?? []);
  }

  return mapping;
}

/**
 * The one write capability this adapter borrows from its SKU sibling, to reproduce
 * `cascade="all-delete-orphan"` on `Product.skus` [model/entity/Product.cfc:L73].
 *
 * Declared here rather than in `src/domain/ports/`, and that placement is forced.
 *
 * This seam once named a dedicated `saveSkuForProduct` member, and the record of the change
 * belongs here.
 */
export interface ProductSkuCascadeWriter {
  /**
   * Persist one SKU as part of an enclosing product write.
   *
   * @param sku the SKU to persist - transient on the creation path.
   * @param productID the parent product's persisted identifier, to bind as `SwSku.productID`.
   * @param executor the enclosing transaction's statement sink.
   * @returns the persisted SKU, carrying the key that was written.
   */
  saveSku(sku: Sku, productID: string, executor: PreparedStatementExecutor): Promise<Sku>;
}

/**
 * What an aggregate write asks the cascade to do, gathered once so the row-writing methods take
 * one extra parameter rather than three.
 *
 * Its presence is also the signal that the write is running inside a transaction: `tx` is the
 * transaction-bound executor.
 */
type SkuCascadePlan = {
  /**
   * The SKUs on the product that have never been persisted, in the collection's own order.
   */
  readonly transientSkus: readonly Sku[];
  /**
   * The sibling adapter that writes a SKU row and its option membership.
   */
  readonly writer: ProductSkuCascadeWriter;
  /**
   * The enclosing transaction's statement sink.
   */
  readonly tx: PreparedStatementExecutor;
};

/**
 * What the cascade produced, so the returned product can report the aggregate that was actually
 * written rather than the drafts it was built from.
 */
type PersistedSkuCascade = {
  /**
   * The product's full SKU collection in its ORIGINAL ORDER, with each persisted draft replaced by
   * the instance that carries its minted key.
   */
  readonly skus: Sku[];
  /**
   * The designated default SKU, replaced the same way, or `undefined` when none was designated.
   */
  readonly defaultSku: Sku | undefined;
};

/**
 * Build one attribute-set read projection from its row.
 *
 * `globalFlag` declares `default="1"` [model/entity/AttributeSet.cfc:L57] and that default is not
 * applied here.
 *
 * @param row one row of either attribute-set statement.
 * @param statementLabel which arm produced it.
 * @returns the projection.
 * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
 */
function toAttributeSetSummary(row: SqlRow, statementLabel: string): AttributeSetSummary {
  const draft: AttributeSetSummaryDraft = {
    attributeSetID: readIdentifier(row, 'attributeSetID', statementLabel),
    attributeSetTypeSystemCode: readIdentifier(row, 'attributeSetTypeSystemCode', statementLabel),
    globalFlag: cfBoolean(readFlag(row, 'globalFlag', statementLabel)),
    attributeCount: readCount(row, 'attributeCount', statementLabel),
  };

  const attributeSetName = readOptionalText(row, 'attributeSetName', statementLabel);
  if (attributeSetName !== undefined) {
    draft.attributeSetName = attributeSetName;
  }

  const attributeSetCode = readOptionalText(row, 'attributeSetCode', statementLabel);
  if (attributeSetCode !== undefined) {
    draft.attributeSetCode = attributeSetCode;
  }

  const attributeSetDescription = readOptionalText(row, 'attributeSetDescription', statementLabel);
  if (attributeSetDescription !== undefined) {
    draft.attributeSetDescription = attributeSetDescription;
  }

  const activeFlag = readFlag(row, 'activeFlag', statementLabel);
  if (activeFlag !== undefined) {
    draft.activeFlag = cfBoolean(activeFlag);
  }

  const requiredFlag = readFlag(row, 'requiredFlag', statementLabel);
  if (requiredFlag !== undefined) {
    draft.requiredFlag = cfBoolean(requiredFlag);
  }

  const sortOrder = readOptionalCount(row, 'sortOrder', statementLabel);
  if (sortOrder !== undefined) {
    draft.sortOrder = sortOrder;
  }

  return draft;
}

/**
 * Build the joined `OptionGroup` for one option row, or report that the option has none.
 *
 * @param row one row of the SKU option read.
 * @param statementLabel the statement that produced it.
 * @returns the group, or `undefined` when the option has none.
 * @throws An error named `ProductColumnError` when a projected column is missing or malformed, or
 * when the joined group's `sortOrder` is NULL where the schema declares it required.
 */
function toOptionGroup(row: SqlRow, statementLabel: string): OptionGroup | undefined {
  const optionGroupID = readOptionalText(
    row,
    `${OPTION_GROUP_ALIAS_PREFIX}optionGroupID`,
    statementLabel,
  );

  if (optionGroupID === undefined) {
    return undefined;
  }

  // `SwOptionGroup.sortOrder` is `required="true"` [model/entity/OptionGroup.cfc:L58] and
  // `src/domain/entities/optionGroup.ts` types its slot as a bare `number` in consequence.
  const optionGroupSortOrder = readOptionalCount(
    row,
    `${OPTION_GROUP_ALIAS_PREFIX}sortOrder`,
    statementLabel,
  );
  if (optionGroupSortOrder === undefined) {
    throw new ProductColumnError(
      `${OPTION_GROUP_ALIAS_PREFIX}sortOrder`,
      statementLabel,
      'the joined option group carries a NULL sortOrder where [model/entity/OptionGroup.cfc:L58] declares it required="true"',
    );
  }

  return new OptionGroup({
    optionGroupID,
    optionGroupName: readOptionalText(
      row,
      `${OPTION_GROUP_ALIAS_PREFIX}optionGroupName`,
      statementLabel,
    ),
    optionGroupCode: readOptionalText(
      row,
      `${OPTION_GROUP_ALIAS_PREFIX}optionGroupCode`,
      statementLabel,
    ),
    optionGroupImage: readOptionalText(
      row,
      `${OPTION_GROUP_ALIAS_PREFIX}optionGroupImage`,
      statementLabel,
    ),
    optionGroupDescription: readOptionalText(
      row,
      `${OPTION_GROUP_ALIAS_PREFIX}optionGroupDescription`,
      statementLabel,
    ),
    imageGroupFlag: readFlag(row, `${OPTION_GROUP_ALIAS_PREFIX}imageGroupFlag`, statementLabel),
    sortOrder: optionGroupSortOrder,
    remoteID: readOptionalText(row, `${OPTION_GROUP_ALIAS_PREFIX}remoteID`, statementLabel),
    createdDateTime: readTimestamp(
      row,
      `${OPTION_GROUP_ALIAS_PREFIX}createdDateTime`,
      statementLabel,
    ),
    createdByAccountID: readOptionalText(
      row,
      `${OPTION_GROUP_ALIAS_PREFIX}createdByAccountID`,
      statementLabel,
    ),
    modifiedDateTime: readTimestamp(
      row,
      `${OPTION_GROUP_ALIAS_PREFIX}modifiedDateTime`,
      statementLabel,
    ),
    modifiedByAccountID: readOptionalText(
      row,
      `${OPTION_GROUP_ALIAS_PREFIX}modifiedByAccountID`,
      statementLabel,
    ),
    options: [],
    optionSortTieBreaker: undefined,
  });
}

/**
 * Build one `Option` from a row of the SKU-option read.
 *
 * @param row one row of the SKU-option read.
 * @param statementLabel the statement that produced it.
 * @returns the option.
 * @throws An error named `ProductColumnError` when a projected column is missing or malformed, or
 * when the joined option group carries a NULL `sortOrder`.
 */
function toOption(row: SqlRow, statementLabel: string): Option {
  return new Option({
    optionID: readIdentifier(row, 'optionID', statementLabel),
    optionCode: readOptionalText(row, 'optionCode', statementLabel),
    optionName: readOptionalText(row, 'optionName', statementLabel),
    optionDescription: readOptionalText(row, 'optionDescription', statementLabel),
    sortOrder: readOptionalCount(row, 'sortOrder', statementLabel),
    optionGroup: toOptionGroup(row, statementLabel),
    defaultImageID: readOptionalText(row, 'defaultImageID', statementLabel),
    remoteID: readOptionalText(row, 'remoteID', statementLabel),
    createdDateTime: readTimestamp(row, 'createdDateTime', statementLabel),
    createdByAccountID: readOptionalText(row, 'createdByAccountID', statementLabel),
    modifiedDateTime: readTimestamp(row, 'modifiedDateTime', statementLabel),
    modifiedByAccountID: readOptionalText(row, 'modifiedByAccountID', statementLabel),
  });
}

/**
 * Reduce one product's SKUs to the DISTINCT option groups reachable through their options, ordered
 * by `sortOrder` ascending.
 *
 * This is the fetch shape `src/domain/entities/product.ts` names as the one the repository owes.
 *
 * @param skus this product's own SKUs, each with its options already materialized.
 * @returns the distinct option groups, ordered by `sortOrder` ascending.
 */
function deriveProductOptionGroups(skus: readonly Sku[]): OptionGroup[] {
  const byOptionGroupID = new Map<string, OptionGroup>();

  for (const sku of skus) {
    for (const option of sku.getOptions()) {
      const optionGroup = option.getOptionGroup();
      if (optionGroup === undefined) {
        continue;
      }

      const optionGroupID = optionGroup.getOptionGroupID();
      if (!byOptionGroupID.has(optionGroupID)) {
        byOptionGroupID.set(optionGroupID, optionGroup);
      }
    }
  }

  return [...byOptionGroupID.values()].sort(
    (left: OptionGroup, right: OptionGroup): number => left.getSortOrder() - right.getSortOrder(),
  );
}

/**
 * Build one `Sku` from its row plus its already-materialized options.
 *
 * @param row one row of the SKU read.
 * @param statementLabel the statement that produced it.
 * @param options the options of this SKU, already materialized.
 * @param collaborators the ports to forward; only the two whose types the SKU shares are
 * forwarded.
 * @returns the SKU.
 * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
 */
function toSku(
  row: SqlRow,
  statementLabel: string,
  options: Option[],
  collaborators: ProductHydrationCollaborators,
): Sku {
  const draft: SkuHydrationDraft = {
    skuID: readIdentifier(row, 'skuID', statementLabel),
    activeFlag: readFlag(row, 'activeFlag', statementLabel),
    userDefinedPriceFlag: readFlag(row, 'userDefinedPriceFlag', statementLabel),
    options,
  };

  const skuCode = readOptionalText(row, 'skuCode', statementLabel);
  if (skuCode !== undefined) {
    draft.skuCode = skuCode;
  }

  const listPrice = readMoney(row, 'listPrice', statementLabel);
  if (listPrice !== undefined) {
    draft.listPrice = listPrice;
  }

  const price = readMoney(row, 'price', statementLabel);
  if (price !== undefined) {
    draft.price = price;
  }

  const renewalPrice = readMoney(row, 'renewalPrice', statementLabel);
  if (renewalPrice !== undefined) {
    draft.renewalPrice = renewalPrice;
  }

  const imageFile = readOptionalText(row, 'imageFile', statementLabel);
  if (imageFile !== undefined) {
    draft.imageFile = imageFile;
  }

  const calculatedQATS = readOptionalCount(row, 'calculatedQATS', statementLabel);
  if (calculatedQATS !== undefined) {
    draft.calculatedQATS = calculatedQATS;
  }

  const subscriptionTermID = readOptionalText(row, 'subscriptionTermID', statementLabel);
  if (subscriptionTermID !== undefined) {
    draft.subscriptionTermID = subscriptionTermID;
  }

  const remoteID = readOptionalText(row, 'remoteID', statementLabel);
  if (remoteID !== undefined) {
    draft.remoteID = remoteID;
  }

  const createdDateTime = readTimestamp(row, 'createdDateTime', statementLabel);
  if (createdDateTime !== undefined) {
    draft.createdDateTime = createdDateTime;
  }

  const createdByAccountID = readOptionalText(row, 'createdByAccountID', statementLabel);
  if (createdByAccountID !== undefined) {
    draft.createdByAccountID = createdByAccountID;
  }

  const modifiedDateTime = readTimestamp(row, 'modifiedDateTime', statementLabel);
  if (modifiedDateTime !== undefined) {
    draft.modifiedDateTime = modifiedDateTime;
  }

  const modifiedByAccountID = readOptionalText(row, 'modifiedByAccountID', statementLabel);
  if (modifiedByAccountID !== undefined) {
    draft.modifiedByAccountID = modifiedByAccountID;
  }

  // The two ports whose declared types `SkuHydrationInput` shares with `ProductHydrationInput`.
  if (collaborators.settingsProvider !== undefined) {
    draft.settingsProvider = collaborators.settingsProvider;
  }

  if (collaborators.skuRepository !== undefined) {
    draft.skuRepository = collaborators.skuRepository;
  }

  return new Sku(draft);
}

/**
 * Build one `Brand` from the `b_`-prefixed half of a product graph row.
 *
 * `Brand`'s constructor declares every slot `?: T | undefined`, so the whole record is passed in
 * one literal and no draft is needed.
 *
 * @param row one product graph row.
 * @param statementLabel the statement that produced it.
 * @returns the brand.
 * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
 */
function toBrandFromGraphRow(row: SqlRow, statementLabel: string): Brand {
  return new Brand({
    brandID: readIdentifier(row, 'b_brandID', statementLabel),
    activeFlag: readFlag(row, 'b_activeFlag', statementLabel),
    publishedFlag: readFlag(row, 'b_publishedFlag', statementLabel),
    urlTitle: readOptionalText(row, 'b_urlTitle', statementLabel),
    brandName: readOptionalText(row, 'b_brandName', statementLabel),
    brandWebsite: readOptionalText(row, 'b_brandWebsite', statementLabel),
    remoteID: readOptionalText(row, 'b_remoteID', statementLabel),
    createdDateTime: readTimestamp(row, 'b_createdDateTime', statementLabel),
    createdByAccountID: readOptionalText(row, 'b_createdByAccountID', statementLabel),
    modifiedDateTime: readTimestamp(row, 'b_modifiedDateTime', statementLabel),
    modifiedByAccountID: readOptionalText(row, 'b_modifiedByAccountID', statementLabel),
  });
}

/**
 * @param row one product graph row.
 * @param statementLabel the statement that produced it.
 * @param productTypeRepository the load-by-identifier port every hydrated product type carries, so
 * that `getBaseProductType()` can resolve the root of `productTypeIDPath`
 * [model/entity/ProductType.cfc:L112].
 * @returns the product type.
 * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
 */
function toProductTypeFromGraphRow(
  row: SqlRow,
  statementLabel: string,
  productTypeRepository: ProductTypeRepository,
  parentProductType: ProductType | undefined,
): ProductType {
  return new ProductType({
    productTypeID: readIdentifier(row, 'pt_productTypeID', statementLabel),
    productTypeIDPath: readOptionalText(row, 'pt_productTypeIDPath', statementLabel),
    activeFlag: readFlag(row, 'pt_activeFlag', statementLabel),
    publishedFlag: readFlag(row, 'pt_publishedFlag', statementLabel),
    urlTitle: readOptionalText(row, 'pt_urlTitle', statementLabel),
    productTypeName: readOptionalText(row, 'pt_productTypeName', statementLabel),
    productTypeDescription: readOptionalText(row, 'pt_productTypeDescription', statementLabel),
    systemCode: readOptionalText(row, 'pt_systemCode', statementLabel),
    parentProductType,
    remoteID: readOptionalText(row, 'pt_remoteID', statementLabel),
    createdDateTime: readTimestamp(row, 'pt_createdDateTime', statementLabel),
    createdByAccountID: readOptionalText(row, 'pt_createdByAccountID', statementLabel),
    modifiedDateTime: readTimestamp(row, 'pt_modifiedDateTime', statementLabel),
    modifiedByAccountID: readOptionalText(row, 'pt_modifiedByAccountID', statementLabel),
    productTypeRepository,
  });
}

// The write path - materializing a row, and rebuilding the entity that was written.
//
// E4 THROUGHOUT: the single money column on either table crosses the wire as a decimal STRING
// through `toBindableMoney`.
//
// E6: nothing here reads an environment variable, names a datasource, or handles a credential.

/**
 * The key to bind into `SwProduct.defaultSkuID`, or `undefined` when there is none to bind yet.
 *
 * @param defaultSku the designated default SKU, if any.
 * @returns its identifier, or `undefined` when it is absent or not yet persisted.
 */
function resolvePersistedDefaultSkuKey(defaultSku: Sku | undefined): string | undefined {
  if (defaultSku === undefined || defaultSku.isNew()) {
    return undefined;
  }

  return defaultSku.getSkuID();
}

/**
 * @param product the entity being written.
 * @param productID the identifier the row will carry - minted for a new entity, the entity's own
 * otherwise.
 * @param urlTitle the url title the populate step settled on, if any.
 * @param productName the product name the populate step settled on, if any.
 * @param createdDateTime the creation stamp; bound on insert, ignored on update.
 * @param modifiedDateTime the modification stamp, bound by both statements.
 * @param auditActorAccountID the account the request's audit actor resolves to, or `undefined`
 * when the legacy gate refuses.
 * @returns the row, keyed by physical column name, carrying all twenty columns.
 */
function toProductRecord(
  product: Product,
  productID: string,
  urlTitle: string | undefined,
  productName: string | undefined,
  createdDateTime: Date | undefined,
  modifiedDateTime: Date,
  auditActorAccountID: string | undefined,
): PersistableRecord {
  return {
    productID,
    activeFlag: product.getActiveFlag(),
    urlTitle,
    productName,
    productCode: product.getProductCode(),
    productDescription: product.getProductDescription(),
    publishedFlag: product.getPublishedFlag(),
    sortOrder: product.getSortOrder(),
    calculatedSalePrice: toBindableMoney(product.getCalculatedSalePrice()),
    calculatedQATS: product.getCalculatedQATS(),
    calculatedAllowBackorderFlag: product.getCalculatedAllowBackorderFlag(),
    calculatedTitle: product.getCalculatedTitle(),
    brandID: product.getBrand()?.getBrandID(),
    productTypeID: product.getProductType()?.getProductTypeID(),
    defaultSkuID: resolvePersistedDefaultSkuKey(product.getDefaultSku()),
    remoteID: product.getRemoteID(),
    createdDateTime,
    createdByAccountID: auditActorAccountID,
    modifiedDateTime,
    // On the UPDATE path a `null` here does not erase the stored value: that statement renders
    // this column through `COALESCE(?, modifiedByAccountID)`.
    modifiedByAccountID: auditActorAccountID,
  };
}

/**
 * @param product the argument that was saved, read for its scalars and its four associations.
 * @param productID the identifier the row now carries.
 * @param urlTitle the url title that was written, if any.
 * @param productName the product name that was written, if any.
 * @param createdDateTime the creation stamp the row carries; omitted from the draft when absent.
 * @param modifiedDateTime the modification stamp that was written.
 * @param createdByAccountID the creating actor the row carries, when one is recorded.
 * @param modifiedByAccountID the modifying actor that was written, when one is recorded.
 * @param repository the adapter that performed the save, forwarded as the entity's product port.
 * @param collaborators the remaining ports to forward; each is assigned only when present.
 * @param cascade what the SKU cascade persisted, or `undefined` when no cascade ran.
 * @returns a new product carrying the persisted state.
 */
function rebuildProduct(
  product: Product,
  productID: string,
  urlTitle: string | undefined,
  productName: string | undefined,
  createdDateTime: Date | undefined,
  modifiedDateTime: Date,
  createdByAccountID: string | undefined,
  modifiedByAccountID: string | undefined,
  repository: ProductRepository,
  collaborators: ProductHydrationCollaborators,
  cascade: PersistedSkuCascade | undefined,
): Product {
  const draft: ProductHydrationDraft = {
    productID,
    activeFlag: product.getActiveFlag(),
    publishedFlag: product.getPublishedFlag(),
    calculatedAllowBackorderFlag: product.getCalculatedAllowBackorderFlag(),
    // `getSkus()` with both flags defaulted returns the materialized collection with no reordering
    // and no option fetch, which is the collection the argument carried. Sorting is a read-path
    // concern.
    skus: cascade === undefined ? product.getSkus() : cascade.skus,
    modifiedDateTime,
    // T2: the entity's `getService("productService")` reach at [model/entity/Product.cfc:L367] is
    // satisfied by the adapter that just wrote the row.
    productRepository: repository,
  };

  // Omitted rather than assigned when absent: `ProductHydrationInput` declares
  // `createdDateTime?: Date` without `| undefined`, so `exactOptionalPropertyTypes` refuses an
  // explicit `undefined`.
  if (createdDateTime !== undefined) {
    draft.createdDateTime = createdDateTime;
  }

  // The two populated members, assigned from what the save decided rather than from the argument.
  // The `undefined` case is OMITTED rather than assigned, for the same
  // `exactOptionalPropertyTypes` reason.
  if (urlTitle !== undefined) {
    draft.urlTitle = urlTitle;
  }

  if (productName !== undefined) {
    draft.productName = productName;
  }

  const productCode = product.getProductCode();
  if (productCode !== undefined) {
    draft.productCode = productCode;
  }

  const productDescription = product.getProductDescription();
  if (productDescription !== undefined) {
    draft.productDescription = productDescription;
  }

  const sortOrder = product.getSortOrder();
  if (sortOrder !== undefined) {
    draft.sortOrder = sortOrder;
  }

  // No `default` on this column [model/entity/Product.cfc:L57], so absent stays absent - never
  // `Money.zero`, which would report a sale price the row does not hold.
  const calculatedSalePrice = product.getCalculatedSalePrice();
  if (calculatedSalePrice !== undefined) {
    draft.calculatedSalePrice = calculatedSalePrice;
  }

  const calculatedQATS = product.getCalculatedQATS();
  if (calculatedQATS !== undefined) {
    draft.calculatedQATS = calculatedQATS;
  }

  const calculatedTitle = product.getCalculatedTitle();
  if (calculatedTitle !== undefined) {
    draft.calculatedTitle = calculatedTitle;
  }

  const brand = product.getBrand();
  if (brand !== undefined) {
    draft.brand = brand;
  }

  const productType = product.getProductType();
  if (productType !== undefined) {
    draft.productType = productType;
  }

  // The cascade's answer wins outright when there was one, INCLUDING its `undefined`: a cascade
  // that resolved no default means the product designated none.
  const defaultSku = cascade === undefined ? product.getDefaultSku() : cascade.defaultSku;
  if (defaultSku !== undefined) {
    draft.defaultSku = defaultSku;
  }

  const remoteID = product.getRemoteID();
  if (remoteID !== undefined) {
    draft.remoteID = remoteID;
  }
  if (createdByAccountID !== undefined) {
    draft.createdByAccountID = createdByAccountID;
  }

  if (modifiedByAccountID !== undefined) {
    draft.modifiedByAccountID = modifiedByAccountID;
  }
  if (collaborators.productTitleTemplate !== undefined) {
    draft.productTitleTemplate = collaborators.productTitleTemplate;
  }

  if (collaborators.settingsProvider !== undefined) {
    draft.settingsProvider = collaborators.settingsProvider;
  }

  if (collaborators.skuRepository !== undefined) {
    draft.skuRepository = collaborators.skuRepository;
  }

  if (collaborators.optionRepository !== undefined) {
    draft.optionRepository = collaborators.optionRepository;
  }

  if (collaborators.subscriptionTermProvider !== undefined) {
    draft.subscriptionTermProvider = collaborators.subscriptionTermProvider;
  }

  if (collaborators.salePriceResolver !== undefined) {
    draft.salePriceResolver = collaborators.salePriceResolver;
  }

  return new Product(draft);
}

/**
 * Run one identifier-keyed statement over a set of identifiers, in batches, returning every row.
 *
 * @param executor the statement executor to run each batch on.
 * @param identifiers the identifiers to bind; an empty set issues no statement at all.
 * @param buildSql renders the statement text for a given identifier count.
 * @returns every row from every batch, concatenated in batch order.
 */
async function executeInIdentifierBatches(
  executor: PreparedStatementExecutor,
  identifiers: readonly string[],
  buildSql: (identifierCount: number) => string,
): Promise<readonly SqlRow[]> {
  // `chunkTupleRows` refuses an empty set rather than yielding zero batches, and every statement
  // builder here refuses a zero-length `IN` list, so the empty case is answered before either.
  if (identifiers.length === 0) {
    return [];
  }

  const collected: SqlRow[] = [];

  for (const batch of chunkTupleRows(identifiers)) {
    const batchRows = await executor.execute(buildSql(batch.length), batch);

    collected.push(...batchRows);
  }

  return collected;
}

/**
 * The MySQL product adapter - the only exported unit of this module.
 *
 * JUDGMENT CALL: the query executor arrives as a constructor parameter rather than by importing the
 * pool, so this module holds no mutable state of its own and no field on this class is a cache. The
 * pool itself is module-scope, in `./connection.ts`, which documents why.
 */
export class MysqlProductRepository implements ProductRepository {
  /**
   * @param executor the prepared-statement executor; see the class note for why it is a parameter.
   * @param auditActor who writes are attributed to.
   * @param collaborators the ports forwarded into every hydrated entity; see {@link
   * ProductHydrationCollaborators}.
   * @param skuCascadeWriter the sibling adapter that writes a SKU row and its option membership on
   * this adapter's transaction; see {@link ProductSkuCascadeWriter}.
   * @throws An error named `ProductWiringError` when `productTypeRepository` is absent at run
   * time.
   */
  public constructor(
    private readonly executor: PreparedStatementExecutor,
    private readonly auditActor: AuditActorContext,
    private readonly collaborators: ProductHydrationCollaborators,
    private readonly skuCascadeWriter?: ProductSkuCascadeWriter,
  ) {
    if (
      collaborators.productTypeRepository === undefined ||
      collaborators.productTypeRepository === null
    ) {
      throw new ProductWiringError('productTypeRepository');
    }

    this.productTypeRepository = collaborators.productTypeRepository;
  }

  /**
   * The port every `ProductType` this adapter hydrates is constructed with.
   *
   * Resolved once, in the constructor, from the collaborators bag - which is now the only place it
   * can come from, because this adapter constructs no collaborator of its own.
   */
  private readonly productTypeRepository: ProductTypeRepository;

  // Port method 1 of 7 - getAttributeSets [model/dao/ProductDAO.cfc:L52-L71]

  /**
   * Attribute sets for a set of type system codes, narrowed by product type.
   *
   * //
   * TODO: Remove this conditional when railo and ACF match how they handle arrays for '`IN`'
   * clause.
   *
   * //
   * CFML parity [model/dao/ProductDAO.cfc:L66]: `arrayToList(...)` is a PLAIN JOIN on a comma -
   * CFML // lists cannot represent an empty element, so `arrayToList` has no empty-element rule to
   * apply. // `Array.prototype.join(',')` is therefore its exact equivalent.
   *
   * @param attributeSetTypeCode attribute-set type system codes to match.
   * @param productTypeIDs product-type identifiers to narrow by; empty means "global sets only".
   * @returns the matching projections, in the legacy order.
   * @throws An error named `ProductEmptyInListError` when both collections are empty.
   */
  public async getAttributeSets(
    attributeSetTypeCode: readonly string[],
    productTypeIDs: readonly string[],
  ): Promise<AttributeSetSummary[]> {
    if (productTypeIDs.length > 0) {
      const rows = await this.executor.execute(
        buildAttributeSetsByProductTypeSql(productTypeIDs.length),
        [
          ACTIVE_ATTRIBUTE_FLAG_BOUND_VALUE,
          // [model/dao/ProductDAO.cfc:L66] the whole list as one bound parameter. See the
          // statement.
          attributeSetTypeCode.join(','),
          GLOBAL_ATTRIBUTE_SET_FLAG_BOUND_VALUE,
          ...productTypeIDs,
        ],
      );

      return rows.map((row: SqlRow) =>
        toAttributeSetSummary(row, ATTRIBUTE_SETS_BY_PRODUCT_TYPE_LABEL),
      );
    }

    // [model/dao/ProductDAO.cfc:L67-L69] the `else` arm. An empty type-code array here would
    // render `IN ()`, which is a MySQL syntax error and is refused rather than emitted.
    if (attributeSetTypeCode.length < 1) {
      throw new ProductEmptyInListError(
        'attributeSetTypeCode',
        ATTRIBUTE_SETS_GLOBAL_LABEL,
        'the global-only arm expands the codes into a real IN list, and an empty one is unparseable',
      );
    }

    const rows = await this.executor.execute(
      buildGlobalAttributeSetsSql(attributeSetTypeCode.length),
      [
        ACTIVE_ATTRIBUTE_FLAG_BOUND_VALUE,
        // [model/dao/ProductDAO.cfc:L68] the raw array, expanded - one parameter per element.
        ...attributeSetTypeCode,
        GLOBAL_ATTRIBUTE_SET_FLAG_BOUND_VALUE,
      ],
    );

    return rows.map((row: SqlRow) => toAttributeSetSummary(row, ATTRIBUTE_SETS_GLOBAL_LABEL));
  }

  // Port method 2 of 7 - loadDataFromFile [model/dao/ProductDAO.cfc:L73-L326]

  /**
   * Bulk product / sku import from a delimited file - declared, and deliberately unexercised.
   *
   * "//
   * TODO: the bulk import path is not ported...", and the sentence is accurate - what it is not is
   * a deferral.
   *
   * //
   * JUDGMENT CALL: an explicit refusal is the only honest body. Silently inventing a working
   * importer // would be the single largest unrequested behaviour in this subtree, and returning
   * quietly would be // worse - a caller would believe an import had happened.
   *
   * @param fileURL location of the delimited file; the legacy body derives its delimiter from the
   * file extension [model/dao/ProductDAO.cfc:L74-L80].
   * @param textQualifier optional text qualifier; the legacy default is the empty string.
   * @returns never returns; the promise always rejects.
   * @throws An error named `ProductBulkImportUnavailableError`, always.
   */
  public async loadDataFromFile(fileURL: string, textQualifier?: string): Promise<void> {
    await Promise.resolve();

    throw new ProductBulkImportUnavailableError(
      'The bulk product import [model/dao/ProductDAO.cfc:L73-L326] is not ported. Its calling ' +
        'service raises the request timeout to 3600 seconds [model/service/ProductService.cfc:L65-L68], ' +
        'a budget this runtime does not offer, and no batching, chunking or job-orchestration ' +
        'mechanism the legacy lacked has been invented in its place. Requested for ' +
        `'${fileURL}'${textQualifier === undefined ? '' : ' with a text qualifier'}.`,
    );
  }

  // Port method 3 of 7 - searchProductsByProductType [model/dao/ProductDAO.cfc:L419-L437]

  /**
   * Product search by name fragment, optionally narrowed to a comma-delimited product-type list.
   *
   * The module header's "live disagreement" is settled by this.
   *
   * @param term optional name fragment.
   * @param productTypeIDs optional comma-delimited product-type identifiers.
   * @param window optional row window; the whole match set is materialized when absent.
   * @returns the materialized window and the complete pre-window match count.
   * @throws An error named `ProductUndefinedArgumentError` when `term` is absent.
   */
  public async searchProductsByProductType(
    term?: string,
    productTypeIDs?: string,
    window?: ProductSearchWindow,
  ): Promise<ProductSearchMatches> {
    // [model/dao/ProductDAO.cfc:L422] the unconditional bind. See ProductUndefinedArgumentError.
    if (term === undefined) {
      throw new ProductUndefinedArgumentError('term', PRODUCT_SEARCH_LABEL);
    }
    const boundProductTypeIDs: readonly string[] =
      productTypeIDs !== undefined && cfLen(productTypeIDs) > 0 ? listToArray(productTypeIDs) : [];
    const placeholderCount = boundProductTypeIDs.length + 1;

    if (!isPreparablePlaceholderCount(placeholderCount)) {
      throw new ProductSearchPlaceholderCountError(boundProductTypeIDs.length, placeholderCount);
    }

    const rows = await this.executor.execute(buildProductSearchSql(boundProductTypeIDs.length), [
      // [model/dao/ProductDAO.cfc:L422] `value="%#arguments.term#%"` - the wildcards are part of
      // the VALUE and are bound with it. They are not concatenated into the statement text.
      `%${term}%`,
      ...boundProductTypeIDs,
    ]);

    // Three things follow, all of them improvements the source already had.
    const matchedRows: readonly ProductSearchRow[] = rows.map((row: SqlRow): ProductSearchRow => {
      const id = readIdentifier(row, 'productID', PRODUCT_SEARCH_LABEL);

      // `SwProduct.productName` is nullable [model/entity/Product.cfc:L55].
      const value = readOptionalText(row, 'productName', PRODUCT_SEARCH_LABEL);

      return value === undefined ? { id } : { id, value };
    });

    // The window is a slice of the rows.
    return {
      records:
        window === undefined
          ? matchedRows
          : matchedRows.slice(window.start, window.start + window.count),
      matchedCount: matchedRows.length,
    };
  }

  // Port method 4 of 7 - getProductByProductID (no legacy antecedent)

  /**
   * Load one product by its identifier, or nothing.
   *
   * RETURNS `undefined` on A MISS - never a zero-valued object, never an empty `Product`, never a
   * throw.
   *
   * @param productID identifier of the product to load.
   * @returns the materialized product, or `undefined` when there is none.
   * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
   */
  public async getProductByProductID(productID: string): Promise<Product | undefined> {
    const products = await this.materializeProducts([productID]);

    return products[0];
  }

  // Not a port method - the set-based form of the by-key load

  /**
   * Load a SET of products by identifier, in the same statements one product costs.
   *
   * And it is STRICTLY BETTER on ENTITY IDENTITY, for the reason the price-group twin records: N
   * separate singular reads hand back N separately-materialized copies of any SHARED association.
   *
   * @param productIDs the identifiers to load, in whatever order and with whatever repetition the
   * caller holds them.
   * @returns the products that exist, keyed by case-folded identifier.
   */
  public async getProductsByProductID(
    productIDs: readonly string[],
  ): Promise<ReadonlyMap<string, Product>> {
    const products = await this.materializeProducts(productIDs);
    const productsByFoldedID = new Map<string, Product>();

    for (const product of products) {
      productsByFoldedID.set(cfFoldKey(product.getProductID()), product);
    }

    return productsByFoldedID;
  }

  // Port method 5 of 7 - saveProduct (no legacy antecedent on the DAO)

  /**
   * Persist one product.
   *
   * //
   * CFML parity [model/service/ProductService.cfc:L266]: the legacy `populate(arguments.data)`
   * copied // the keys the struct has, and `Object.hasOwn` is the exact equivalent of the
   * `structKeyExists` test // that underpins it.
   *
   * @param product the product to persist.
   * @param data the resolved payload to populate from before writing.
   * @returns the persisted product - the argument itself when it already carried an identifier,
   * and a new instance carrying the minted identifier and the populated values when it did not.
   * @throws An error named `ProductPersistenceError` when an association is transient.
   */
  public async saveProduct(product: Product, data: ProductSavePayload): Promise<Product> {
    // Transaction is opened, whether a transient default SKU is refused, and which instance is
    // handed back.
    const transientSkus = product.getSkus().filter((held: Sku) => held.isNew());

    this.assertAssociationsPersisted(product, transientSkus);

    // The populate step, in the one place it happens. See the CFML parity note above.
    const populatedUrlTitle: string | undefined = Object.hasOwn(data, 'urlTitle')
      ? data.urlTitle
      : product.getUrlTitle();
    const populatedProductName: string | undefined = Object.hasOwn(data, 'productName')
      ? data.productName
      : product.getProductName();

    if (transientSkus.length === 0) {
      // No cascade, so no transaction: this path issues the single row write it always issued, and
      // wrapping one statement in a transaction would report a unit of work that has no second
      // member.
      const rowExists = product.isNew()
        ? false
        : await this.productRowExists(product.getProductID());

      if (!rowExists) {
        return await this.insertProduct(product, populatedUrlTitle, populatedProductName);
      }

      return await this.updateProduct(product, populatedUrlTitle, populatedProductName);
    }

    const writer = this.skuCascadeWriter;

    if (writer === undefined) {
      throw new ProductPersistenceError(
        `it carries ${String(transientSkus.length)} sku(s) that have never been persisted and this ` +
          'repository was constructed without a sku cascade writer, so those rows would be silently ' +
          'dropped',
      );
    }

    // Groups of statements have to succeed or fail together: the `SwProduct` row, one `SwSku` row
    // plus its `SwSkuOption` membership per transient SKU, and the deferred `defaultSkuID` update.
    //
    // Every statement below this line must route through `tx`.
    return await this.executor.transaction(async (tx): Promise<Product> => {
      const plan: SkuCascadePlan = { transientSkus, writer, tx };

      const rowExists = product.isNew()
        ? false
        : await this.productRowExists(product.getProductID(), tx);

      if (!rowExists) {
        return await this.insertProduct(product, populatedUrlTitle, populatedProductName, plan);
      }

      return await this.updateProduct(product, populatedUrlTitle, populatedProductName, plan);
    });
  }

  // Port method 6 of 7 - deleteProduct (no legacy antecedent on the DAO)

  /**
   * Delete one product.
   *
   * No legacy antecedent on the DAO; deletion ran through the ORM as
   * `super.delete(arguments.product)` [model/service/ProductService.cfc:L326].
   *
   * What `false` means here, and how that differs from the legacy `false`.
   *
   * @param product the product to delete.
   * @returns true when the product row was deleted, false when none matched.
   */
  public async deleteProduct(product: Product): Promise<boolean> {
    if (product.isNew()) {
      // No row exists, so there is nothing to detach, nothing to cascade and nothing to report as
      // deleted. See the guard's justification in the doc block above.
      return false;
    }

    const productID = product.getProductID();

    return await this.executor.transaction(async (tx): Promise<boolean> => {
      // The SQL half of [model/service/ProductService.cfc:L323], first because the mutual foreign
      // key between `SwProduct` and `SwSku` blocks everything that follows while it stands.
      await tx.executeMutation(DETACH_PRODUCT_DEFAULT_SKU_SQL, [productID]);

      // SEQUENTIAL, not CONCURRENT, throughout: every statement travels the single connection this
      // transaction holds, which has no statement concurrency to exploit.
      for (const tableName of SKU_DEPENDENT_TABLES) {
        await tx.executeMutation(buildDeleteBySkuOfProductSql(tableName), [productID]);
      }

      // Now that nothing references them.
      await tx.executeMutation(buildDeleteByProductIdSql(SKU_TABLE_NAME), [productID]);

      for (const tableName of PRODUCT_OWNED_LINK_TABLES) {
        await tx.executeMutation(buildDeleteByProductIdSql(tableName), [productID]);
      }
      for (const tableName of PRODUCT_INVERSE_LINK_TABLES) {
        await tx.executeMutation(buildDeleteByProductIdSql(tableName), [productID]);
      }

      for (const tableName of PRODUCT_DEPENDENT_TABLES) {
        await tx.executeMutation(buildDeleteByProductIdSql(tableName), [productID]);
      }

      const result = await tx.executeMutation(DELETE_PRODUCT_SQL, [productID]);

      // The legacy service's boolean [model/service/ProductService.cfc:L317].
      return result.affectedRows > 0;
    });
  }

  // Private - the read path.

  /**
   * Materialize a set of products by identifier, preserving the caller's order.
   *
   * @param productIDs the identifiers to materialize, in the order the result should carry.
   * @returns the products that exist, in that order.
   * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
   */
  private async materializeProducts(productIDs: readonly string[]): Promise<Product[]> {
    if (productIDs.length === 0) {
      return [];
    }

    // De-duplicated for the bind, because a caller may legitimately ask for the same product twice
    // and `IN` would otherwise carry a redundant placeholder.
    const distinctProductIDs = [...new Set(productIDs)];

    const graphRows = await executeInIdentifierBatches(
      this.executor,
      distinctProductIDs,
      buildProductGraphSql,
    );

    if (graphRows.length === 0) {
      return [];
    }

    const foundProductIDs: string[] = [];
    const defaultSkuIDs: string[] = [];

    for (const row of graphRows) {
      foundProductIDs.push(readIdentifier(row, 'p_productID', PRODUCT_GRAPH_LABEL));

      const defaultSkuID = readOptionalText(row, 'p_defaultSkuID', PRODUCT_GRAPH_LABEL);
      if (defaultSkuID !== undefined) {
        defaultSkuIDs.push(defaultSkuID);
      }
    }

    const materializedSkus = await this.readSkus(foundProductIDs, [...new Set(defaultSkuIDs)]);

    // AFTER the SKUs and BEFORE any product is constructed, because the entity takes the map as a
    // constructed-with value and there is no later moment at which it could be attached - see
    // {@link ProductSalePriceResolver}. The SKU materialization is handed over as well, because its
    // `productID -> skus` index is exactly the mapping a batched sale-price read needs in order to
    // partition its rows, and this is the moment at which it is already in hand.
    const salePriceDetails = await this.readSalePriceDetails(
      foundProductIDs,
      materializedSkus.byProductID,
    );

    // AND THE PARENT OF EVERY PRODUCT TYPE THIS BATCH REACHED, resolved once per distinct parent
    // through the SAME loader a standalone product-type read uses. Before this pre-read existed the
    // hydrated product type had no parent at all, so the price-group cascade's pointer walk
    // [model/service/PriceGroupService.cfc:L66-L79] could not climb and an ancestor's rate was silently
    // skipped - measured as 17.99 charged where 20.00 was configured (finding F-08). Resolved BEFORE any
    // product is constructed for the same reason the sale-price map is: the entity takes its parent as a
    // constructed-with value and there is no later moment at which one could be attached.
    const productTypeParents = await this.readProductTypeParents(graphRows);

    // KEYED BY THE FOLDED IDENTIFIER. The map is built from the identifier the DATABASE
    // returned and read back with the identifier the CALLER supplied, and `productID IN (...)`
    // matches under MySQL's case-insensitive default collation - so a caller spelling that differs
    // in case from the stored column found no entry and the product was silently DROPPED from the
    // answer, turning a found row into a missing one. Folding both sides restores the CFML struct
    // identity the ORM-backed lookup had.
    const productsByID = new Map<string, Product>();
    for (const row of graphRows) {
      const product = this.buildProduct(
        row,
        materializedSkus,
        salePriceDetails,
        productTypeParents,
      );
      productsByID.set(cfFoldKey(product.getProductID()), product);
    }

    const ordered: Product[] = [];
    for (const productID of productIDs) {
      const product = productsByID.get(cfFoldKey(productID));
      if (product !== undefined) {
        ordered.push(product);
      }
    }

    return ordered;
  }

  /**
   * Read the SKUs of a set of products together with any default SKUs those products name, and
   * index them.
   *
   * @param productIDs the products whose SKU collections are wanted.
   * @param defaultSkuIDs the default-SKU identifiers to resolve, already de-duplicated.
   * @returns the two indexes; both are empty when neither list has an element.
   * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
   */
  private async readSkus(
    productIDs: readonly string[],
    defaultSkuIDs: readonly string[],
  ): Promise<MaterializedSkus> {
    if (productIDs.length === 0 && defaultSkuIDs.length === 0) {
      return { byProductID: new Map<string, Sku[]>(), bySkuID: new Map<string, Sku>() };
    }

    const skuRows = await this.readSkuRows(productIDs, defaultSkuIDs);

    if (skuRows.length === 0) {
      return { byProductID: new Map<string, Sku[]>(), bySkuID: new Map<string, Sku>() };
    }

    const skuIDs = skuRows.map((row: SqlRow) => readIdentifier(row, 'skuID', PRODUCT_SKUS_LABEL));
    const optionsBySkuID = await this.readSkuOptions(skuIDs);

    const byProductID = new Map<string, Sku[]>();
    const bySkuID = new Map<string, Sku>();

    for (const row of skuRows) {
      const skuID = readIdentifier(row, 'skuID', PRODUCT_SKUS_LABEL);
      const sku = toSku(
        row,
        PRODUCT_SKUS_LABEL,
        optionsBySkuID.get(skuID) ?? [],
        this.collaborators,
      );

      bySkuID.set(skuID, sku);

      // A SKU reached only as a default SKU may belong to another product - or to none, since
      // `SwSku.productID` is nullable - so it is indexed by product only when it actually carries
      // one.
      const owningProductID = readOptionalText(row, 'productID', PRODUCT_SKUS_LABEL);
      if (owningProductID !== undefined) {
        const collection = byProductID.get(owningProductID);
        if (collection === undefined) {
          byProductID.set(owningProductID, [sku]);
        } else {
          collection.push(sku);
        }
      }
    }

    return { byProductID, bySkuID };
  }

  /**
   * Resolve the sale-price details of a set of products and index them by product identifier.
   *
   * What changes relative to the legacy, stated plainly: the legacy reach was lazy - no query ran
   * until something asked a product for its sale prices - and this is eager.
   *
   * @param productIDs the products whose sale-price details are wanted; duplicates are collapsed.
   * @param skusByProductID the SKUs already materialized for those products, indexed by owning
   *   product - handed to the batched prefetch so it can partition its rows. A product absent from
   *   this index is still resolved; it simply contributes no SKU identifiers to the partition.
   * @returns the details, indexed by product identifier; empty when no resolver was supplied.
   */
  private async readSalePriceDetails(
    productIDs: readonly string[],
    skusByProductID: ReadonlyMap<string, readonly Sku[]>,
  ): Promise<ReadonlyMap<string, CfStruct<SalePriceDetail>>> {
    const indexed = new Map<string, CfStruct<SalePriceDetail>>();
    const resolver = this.collaborators.salePriceResolver;

    if (resolver === undefined) {
      return indexed;
    }

    // Distinctness and index identity are both folded.
    const distinctProductIDs: string[] = [];
    const seenProductIdentities = new Set<string>();
    for (const productID of productIDs) {
      const identity = cfFoldKey(productID);
      if (!seenProductIdentities.has(identity)) {
        seenProductIdentities.add(identity);
        distinctProductIDs.push(productID);
      }
    }

    // THE ONE BATCHED READ, WHEN THE COLLABORATOR OFFERS ONE. It is given the SAME distinct
    // identifiers the per-product calls below will use, each mapped to the SKUs already read for it,
    // so the batch covers exactly the products about to be asked for and nothing else. The `?.` is
    // what makes the member genuinely optional at the call site; the `??` keeps the awaited expression
    // a promise in both directions so a reader does not have to reason about a conditional await.
    await (resolver.prefetchSalePriceDetailsForProducts?.(
      salePriceSkuIdentifiers(distinctProductIDs, skusByProductID),
    ) ?? Promise.resolve());

    const resolved = await Promise.all(
      distinctProductIDs.map(
        async (productID: string): Promise<readonly [string, CfStruct<SalePriceDetail>]> => [
          productID,
          await resolver.getSalePriceDetailsForProductSkus(productID),
        ],
      ),
    );

    for (const [productID, details] of resolved) {
      indexed.set(cfFoldKey(productID), details);
    }

    return indexed;
  }

  /**
   * Resolve the parent product type named by every graph row that declares one, indexed by identifier.
   *
   * THIS METHOD EXISTS BECAUSE THE PRICE-GROUP CASCADE CLIMBS POINTERS, NOT PATHS. Its third level
   * walks `currentProductType.getParentProductType()` up the chain
   * [model/service/PriceGroupService.cfc:L66-L79] - a MUST-PRESERVE behaviour (AAP 0.1.1) - and until
   * this read existed `toProductTypeFromGraphRow` hydrated `parentProductType` as `undefined`, so the
   * walk stopped at the first hop and the ancestor's rate was never seen. The consequence was money:
   * a global 17.99 selected where the ancestor configured 20.00, on the same SKU and the same price
   * group, through both `getProductByProductID` and `getSkuBySkuIdentity` - while the standalone
   * product-type loader read the SAME row and selected the ancestor's rate correctly.
   *
   * IT DELEGATES TO `getProductTypeByProductTypeID`, AND THAT IS THE WHOLE CORRECTNESS ARGUMENT.
   * F-08's acceptance criterion is that a product type reached through a PRODUCT and one reached
   * through the product-type loader select the SAME RATE. Resolving through the very method that
   * loader is makes them the same by CONSTRUCTION rather than by argument: the chain this index holds
   * is byte-for-byte the chain the standalone loader builds, including its pointer-following order, its
   * per-identifier fallback for an ancestor a stale `productTypeIDPath` fails to name, and its
   * `ProductTypeCycleError` on corrupt data. Nothing about ancestry is re-derived here, so there is no
   * second traversal to keep in step - the objection this adapter's single-graph-loader comment makes
   * about fetch shapes generally.
   *
   * ⚠ THE COST, STATED PLAINLY RATHER THAN GLOSSED. One resolve per DISTINCT PARENT IDENTIFIER in the
   * batch - not one per product, and NOT one per hop up the tree, because that loader reads a whole
   * ancestry from `productTypeIDPath` in a single statement. A page of products sharing a taxonomy
   * therefore costs as many resolves as the page has distinct parent types, which for real catalogue
   * data is a small number and is often zero: a batch whose types are all ROOTS issues NO statement at
   * all, because a root declares no `pt_parentProductTypeID` and the loop below never runs.
   *
   * ⚠ A SINGLE COMBINED `getProductTypesByProductTypeIDPath` READ WAS CONSIDERED AND REJECTED. Joining
   * every row's `productTypeIDPath` into one comma-list would answer the whole batch in ONE statement,
   * and it would be wrong in precisely the way this finding is about: that read links only the rows the
   * path MATCHED, so an ancestor a stale path fails to name is hydrated with no parent, while
   * `getProductTypeByProductTypeID` reads it by identifier and finds it. Nothing rewrites a
   * descendant's path when an ancestor moves - `mysqlProductTypeRepository.saveProductType` says so
   * outright - so stale paths are a reachable state, and a cheaper read that disagrees with the
   * standalone loader in exactly that state would reintroduce F-08 in a narrower form. AAP 0.8.1
   * forbids inventing a performance requirement to trade a must-preserve money path against, so the
   * provable answer is the one taken.
   *
   * DE-DUPLICATION IS BY FOLDED IDENTIFIER and is local to this call. `productTypeID` is an opaque
   * persisted string matched under MySQL's case-insensitive default collation, so two rows spelling one
   * parent differently name the same parent and must resolve once - the same folding
   * {@link MysqlProductRepository.materializeProducts} applies to its own product index. The memo is
   * NOT held on the instance: `saveProductType` can move a parent within one request, and an
   * instance-lifetime cache would serve a chain that the request itself has already invalidated.
   *
   * @param graphRows the rows one product graph read returned.
   * @returns the resolved parents by folded identifier; an identifier whose row does not exist is
   *   simply absent, which stops that chain quietly - the same answer the standalone loader gives for
   *   the same dangling key, and deliberately NOT a `ProductAssociationError`, because raising here
   *   would make the two loaders disagree again in the other direction.
   * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
   * @throws An error named `ProductTypeCycleError` when the chain above a row cycles, raised by the
   *   loader this method delegates to.
   */
  private async readProductTypeParents(
    graphRows: readonly SqlRow[],
  ): Promise<ReadonlyMap<string, ProductType>> {
    const wantedParentIDs: string[] = [];
    const seenParentIdentities = new Set<string>();

    for (const row of graphRows) {
      // THE PRODUCT-TYPE COLUMN IS TESTED FIRST, AND THE ORDER IS LOAD-BEARING RATHER THAN TIDY. A
      // product with no product type contributes no `pt_*` value at all, and asking such a row for its
      // parent key would be asking a question about an association that is not there - which
      // {@link buildProduct} answers, correctly, by not constructing a product type either. Reading the
      // parent key unconditionally also makes this method demand a column of every row shape a caller
      // can hand it, including the product-type-less ones, which is a wider contract than the work
      // needs.
      if (readOptionalText(row, 'pt_productTypeID', PRODUCT_GRAPH_LABEL) === undefined) {
        continue;
      }

      // Absent for a ROOT product type, which declares no parent. Ordinary, and it means there is
      // nothing above this row to read.
      const parentProductTypeID = readOptionalText(
        row,
        'pt_parentProductTypeID',
        PRODUCT_GRAPH_LABEL,
      );

      if (parentProductTypeID === undefined) {
        continue;
      }

      const identity = cfFoldKey(parentProductTypeID);
      if (!seenParentIdentities.has(identity)) {
        seenParentIdentities.add(identity);
        wantedParentIDs.push(parentProductTypeID);
      }
    }

    const resolvedParents = new Map<string, ProductType>();

    // SEQUENTIAL, not `Promise.all`. Every read on this adapter travels the SAME executor, which may be
    // a transaction-scoped connection, and a MySQL connection cannot carry concurrent statements. The
    // sale-price pre-read above parallelises safely only because it calls a SERVICE-level resolver
    // rather than this adapter's executor.
    for (const parentProductTypeID of wantedParentIDs) {
      const parent =
        await this.productTypeRepository.getProductTypeByProductTypeID(parentProductTypeID);

      if (parent !== undefined) {
        resolvedParents.set(cfFoldKey(parentProductTypeID), parent);
      }
    }

    return resolvedParents;
  }

  /**
   * Read the SKU rows for a product set and a default-SKU set, batching only when it is necessary.
   *
   * @param productIDs the products whose SKU collections are wanted.
   * @param defaultSkuIDs the default-SKU identifiers to resolve, already de-duplicated.
   * @returns the matched SKU rows, each appearing exactly once.
   * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
   */
  private async readSkuRows(
    productIDs: readonly string[],
    defaultSkuIDs: readonly string[],
  ): Promise<readonly SqlRow[]> {
    if (productIDs.length + defaultSkuIDs.length <= SQL_TUPLE_ROW_LIMIT) {
      return await this.executor.execute(
        buildProductSkusSql(productIDs.length, defaultSkuIDs.length),
        [...productIDs, ...defaultSkuIDs],
      );
    }

    const productKeyedRows = await executeInIdentifierBatches(
      this.executor,
      productIDs,
      (identifierCount: number) => buildProductSkusSql(identifierCount, 0),
    );

    const defaultSkuKeyedRows = await executeInIdentifierBatches(
      this.executor,
      defaultSkuIDs,
      (identifierCount: number) => buildProductSkusSql(0, identifierCount),
    );

    const seenSkuIDs = new Set<string>();
    const merged: SqlRow[] = [];

    for (const row of [...productKeyedRows, ...defaultSkuKeyedRows]) {
      const skuID = readIdentifier(row, 'skuID', PRODUCT_SKUS_LABEL);

      if (!seenSkuIDs.has(skuID)) {
        seenSkuIDs.add(skuID);
        merged.push(row);
      }
    }

    return merged;
  }

  /**
   * Read the options of a set of SKUs and index them by SKU identifier.
   *
   * A SKU with no link rows is ABSENT from the map, and the caller substitutes `[]`.
   *
   * @param skuIDs the SKUs whose option collections are wanted.
   * @returns the options, indexed by SKU identifier.
   * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
   */
  private async readSkuOptions(skuIDs: readonly string[]): Promise<ReadonlyMap<string, Option[]>> {
    const distinctSkuIDs = [...new Set(skuIDs)];
    const indexed = new Map<string, Option[]>();

    if (distinctSkuIDs.length === 0) {
      return indexed;
    }

    const optionRows = await executeInIdentifierBatches(
      this.executor,
      distinctSkuIDs,
      buildSkuOptionsSql,
    );

    for (const row of optionRows) {
      const skuID = readIdentifier(row, 'link_skuID', PRODUCT_SKU_OPTIONS_LABEL);
      const option = toOption(row, PRODUCT_SKU_OPTIONS_LABEL);

      const collection = indexed.get(skuID);
      if (collection === undefined) {
        indexed.set(skuID, [option]);
      } else {
        collection.push(option);
      }
    }

    return indexed;
  }

  /**
   * Two entity defects are not this file's to compensate for.
   *
   * @param row one product graph row.
   * @param materializedSkus the SKU indexes from {@link readSkus}.
   * @param salePriceDetails the sale-price index from {@link readSalePriceDetails}; a product
   * absent from it is hydrated without a sale-price map, which is the no-resolver state.
   * @returns the product.
   * @throws An error named `ProductColumnError` when a projected column is missing or malformed.
   */
  private buildProduct(
    row: SqlRow,
    materializedSkus: MaterializedSkus,
    salePriceDetails: ReadonlyMap<string, CfStruct<SalePriceDetail>>,
    productTypeParents: ReadonlyMap<string, ProductType>,
  ): Product {
    const productID = readIdentifier(row, 'p_productID', PRODUCT_GRAPH_LABEL);

    // Bound once because two members read it.
    const ownSkus = materializedSkus.byProductID.get(productID) ?? [];

    const draft: ProductHydrationDraft = {
      productID,
      activeFlag: readFlag(row, 'p_activeFlag', PRODUCT_GRAPH_LABEL),
      publishedFlag: readFlag(row, 'p_publishedFlag', PRODUCT_GRAPH_LABEL),
      calculatedAllowBackorderFlag: readFlag(
        row,
        'p_calculatedAllowBackorderFlag',
        PRODUCT_GRAPH_LABEL,
      ),
      skus: ownSkus,
      optionGroups: deriveProductOptionGroups(ownSkus),
      // T2: the entity's `getService("productService")` reach at [model/entity/Product.cfc:L367]
      // becomes this very instance, injected at construction instead of resolved by name at the
      // point of use.
      productRepository: this,
    };

    const urlTitle = readOptionalText(row, 'p_urlTitle', PRODUCT_GRAPH_LABEL);
    if (urlTitle !== undefined) {
      draft.urlTitle = urlTitle;
    }

    const productName = readOptionalText(row, 'p_productName', PRODUCT_GRAPH_LABEL);
    if (productName !== undefined) {
      draft.productName = productName;
    }

    const productCode = readOptionalText(row, 'p_productCode', PRODUCT_GRAPH_LABEL);
    if (productCode !== undefined) {
      draft.productCode = productCode;
    }

    const productDescription = readOptionalText(row, 'p_productDescription', PRODUCT_GRAPH_LABEL);
    if (productDescription !== undefined) {
      draft.productDescription = productDescription;
    }

    const sortOrder = readOptionalCount(row, 'p_sortOrder', PRODUCT_GRAPH_LABEL);
    if (sortOrder !== undefined) {
      draft.sortOrder = sortOrder;
    }

    const calculatedSalePrice = readMoney(row, 'p_calculatedSalePrice', PRODUCT_GRAPH_LABEL);
    if (calculatedSalePrice !== undefined) {
      draft.calculatedSalePrice = calculatedSalePrice;
    }

    const calculatedQATS = readOptionalCount(row, 'p_calculatedQATS', PRODUCT_GRAPH_LABEL);
    if (calculatedQATS !== undefined) {
      draft.calculatedQATS = calculatedQATS;
    }

    const calculatedTitle = readOptionalText(row, 'p_calculatedTitle', PRODUCT_GRAPH_LABEL);
    if (calculatedTitle !== undefined) {
      draft.calculatedTitle = calculatedTitle;
    }

    const remoteID = readOptionalText(row, 'p_remoteID', PRODUCT_GRAPH_LABEL);
    if (remoteID !== undefined) {
      draft.remoteID = remoteID;
    }

    const createdDateTime = readTimestamp(row, 'p_createdDateTime', PRODUCT_GRAPH_LABEL);
    if (createdDateTime !== undefined) {
      draft.createdDateTime = createdDateTime;
    }

    const createdByAccountID = readOptionalText(row, 'p_createdByAccountID', PRODUCT_GRAPH_LABEL);
    if (createdByAccountID !== undefined) {
      draft.createdByAccountID = createdByAccountID;
    }

    const modifiedDateTime = readTimestamp(row, 'p_modifiedDateTime', PRODUCT_GRAPH_LABEL);
    if (modifiedDateTime !== undefined) {
      draft.modifiedDateTime = modifiedDateTime;
    }

    const modifiedByAccountID = readOptionalText(row, 'p_modifiedByAccountID', PRODUCT_GRAPH_LABEL);
    if (modifiedByAccountID !== undefined) {
      draft.modifiedByAccountID = modifiedByAccountID;
    }

    // The three many-to-one associations. Each is present exactly when its key is, and a key that
    // names no row is a fault rather than an absence.
    const brandID = readOptionalText(row, 'p_brandID', PRODUCT_GRAPH_LABEL);
    if (brandID !== undefined) {
      if (readOptionalText(row, 'b_brandID', PRODUCT_GRAPH_LABEL) === undefined) {
        throw new ProductAssociationError('brand', 'SwBrand', PRODUCT_GRAPH_LABEL);
      }

      draft.brand = toBrandFromGraphRow(row, PRODUCT_GRAPH_LABEL);
    }

    const productTypeID = readOptionalText(row, 'p_productTypeID', PRODUCT_GRAPH_LABEL);
    if (productTypeID !== undefined) {
      if (readOptionalText(row, 'pt_productTypeID', PRODUCT_GRAPH_LABEL) === undefined) {
        throw new ProductAssociationError('productType', 'SwProductType', PRODUCT_GRAPH_LABEL);
      }

      // The port travels with the entity, so a product type reached through a PRODUCT read can
      // resolve the root of its own `productTypeIDPath` exactly as one reached through
      // `mysqlProductTypeRepository` can. Before this argument existed the two disagreed, and the
      // disagreement was a 500 on the promotion-application journey.
      //
      // AND THE PARENT NOW TRAVELS TOO, WHICH CLOSES THE SECOND HALF OF THE SAME DISAGREEMENT.
      // The port fixed `getBaseProductType()`, which reads the ROOT of `productTypeIDPath`; it did
      // nothing for the consumers that climb POINTERS, and the third level of the price-group cascade
      // is one of those [model/service/PriceGroupService.cfc:L66-L79]. So this loader still answered a
      // different object graph than the standalone one, and the difference was MONEY: a global 17.99
      // selected where the ancestor configured 20.00. The parent is looked up by
      // the row's own `pt_parentProductTypeID` - a column this projection has always carried and never
      // read - in the index {@link readProductTypeParents} resolved through that same standalone
      // loader, so the two are now the same chain by construction.
      const parentProductTypeID = readOptionalText(
        row,
        'pt_parentProductTypeID',
        PRODUCT_GRAPH_LABEL,
      );

      draft.productType = toProductTypeFromGraphRow(
        row,
        PRODUCT_GRAPH_LABEL,
        this.productTypeRepository,
        parentProductTypeID === undefined
          ? undefined
          : productTypeParents.get(cfFoldKey(parentProductTypeID)),
      );
    }

    const defaultSkuID = readOptionalText(row, 'p_defaultSkuID', PRODUCT_GRAPH_LABEL);
    if (defaultSkuID !== undefined) {
      const defaultSku = materializedSkus.bySkuID.get(defaultSkuID);
      if (defaultSku === undefined) {
        throw new ProductAssociationError('defaultSku', 'SwSku', PRODUCT_GRAPH_LABEL);
      }

      draft.defaultSku = defaultSku;
    }

    // The remaining collaborator ports, forwarded exactly as injected.
    if (this.collaborators.productTitleTemplate !== undefined) {
      draft.productTitleTemplate = this.collaborators.productTitleTemplate;
    }

    if (this.collaborators.settingsProvider !== undefined) {
      draft.settingsProvider = this.collaborators.settingsProvider;
    }

    if (this.collaborators.skuRepository !== undefined) {
      draft.skuRepository = this.collaborators.skuRepository;
    }

    if (this.collaborators.optionRepository !== undefined) {
      draft.optionRepository = this.collaborators.optionRepository;
    }

    if (this.collaborators.subscriptionTermProvider !== undefined) {
      draft.subscriptionTermProvider = this.collaborators.subscriptionTermProvider;
    }

    // The resolved sale-price map, which is a VALUE rather than a port and so is not forwarded
    // from the collaborators bag - see {@link ProductSalePriceResolver}.
    const productSalePriceDetails = salePriceDetails.get(cfFoldKey(productID));
    if (productSalePriceDetails !== undefined) {
      draft.salePriceDetailsForSkus = productSalePriceDetails;
    }

    // And the resolver itself, alongside the map rather than instead of it.
    if (this.collaborators.salePriceResolver !== undefined) {
      draft.salePriceResolver = this.collaborators.salePriceResolver;
    }

    return new Product(draft);
  }

  // Private - the write path.

  /**
   * Refuse a save whose associations have never been persisted.
   *
   * CFML parity: Hibernate raised `TransientObjectException` when a save reached an association
   * that had no identifier yet, rather than writing a key it could not satisfy.
   *
   * @param product the product about to be written.
   * @param transientSkus the never-persisted SKUs this write will cascade to, in collection order.
   * @throws An error named `ProductPersistenceError` when any of the three associations is
   * transient and this write cannot persist it.
   */
  private assertAssociationsPersisted(product: Product, transientSkus: readonly Sku[]): void {
    const brand = product.getBrand();
    if (brand !== undefined && brand.isNew()) {
      throw new ProductPersistenceError(
        'its brand has never been persisted, so `brandID` would be written as the empty string',
      );
    }

    const productType = product.getProductType();
    if (productType !== undefined && productType.isNew()) {
      throw new ProductPersistenceError(
        'its product type has never been persisted, so `productTypeID` would be written as the empty string',
      );
    }

    const defaultSku = product.getDefaultSku();
    if (defaultSku !== undefined && defaultSku.isNew() && !transientSkus.includes(defaultSku)) {
      throw new ProductPersistenceError(
        'its default sku has never been persisted and is not among the skus held on the product, so ' +
          'this write cannot cascade to it and `defaultSkuID` would name nothing',
      );
    }
  }

  /**
   * Whether a product row carries this identifier.
   *
   * @param productID the identifier to match.
   * @param executor the statement sink.
   * @returns true when a row exists.
   */
  private async productRowExists(
    productID: string,
    executor: PreparedStatementExecutor = this.executor,
  ): Promise<boolean> {
    const rows = await executor.execute(SELECT_PRODUCT_ID_SQL, [productID]);

    return rows.length > 0;
  }

  /**
   * Write the transient SKUs of a product whose row has just been written, then settle the
   * product's own `defaultSkuID`.
   *
   * @param product the product whose collection is authoritative for order.
   * @param productID the key the row now carries, bound as each SKU's `productID`.
   * @param plan the cascade set, the sibling writer and the enclosing transaction.
   * @returns the persisted collection and the resolved default, for the rebuilt instance to
   * report.
   */
  private async cascadeTransientSkus(
    product: Product,
    productID: string,
    plan: SkuCascadePlan,
  ): Promise<PersistedSkuCascade> {
    // Keyed by the DRAFT INSTANCE rather than by an identifier, because the correspondence this
    // map records is between two DIFFERENT identifiers.
    const persistedByDraft = new Map<Sku, Sku>();

    for (const draft of plan.transientSkus) {
      persistedByDraft.set(draft, await plan.writer.saveSku(draft, productID, plan.tx));
    }

    const skus = product.getSkus().map((held: Sku) => persistedByDraft.get(held) ?? held);

    const designated = product.getDefaultSku();

    if (designated === undefined) {
      return { skus, defaultSku: undefined };
    }

    const persistedDefault = persistedByDraft.get(designated);

    if (persistedDefault === undefined) {
      // Already persisted before this write, so its key went into the row that was just written.
      return { skus, defaultSku: designated };
    }

    const designation = await plan.tx.executeMutation(UPDATE_PRODUCT_DEFAULT_SKU_SQL, [
      persistedDefault.getSkuID(),
      productID,
    ]);

    // It runs inside the transaction that has just written the product row, so a zero here means
    // that row is not where this statement looked.
    if (designation.affectedRows === 0) {
      throw new ProductPersistenceError(
        'the deferred defaultSkuID update matched no SwProduct row, so the designation the cascade ' +
          'just persisted could not be recorded',
      );
    }

    return { skus, defaultSku: persistedDefault };
  }

  /**
   * Insert a product that has no row yet.
   *
   * @param product the product to insert.
   * @param urlTitle the url title the populate step settled on, if any.
   * @param productName the product name the populate step settled on, if any.
   * @param plan the SKU cascade to run after the row write, when this save carries transient SKUs.
   * @returns the persisted product.
   * @throws An error named `ProductColumnError` when the record does not carry a listed column.
   */
  private async insertProduct(
    product: Product,
    urlTitle: string | undefined,
    productName: string | undefined,
    plan?: SkuCascadePlan,
  ): Promise<Product> {
    // [org/Hibachi/HibachiEntity.cfc:L609] one timestamp, written to both stamps, byte-identical.
    const auditTimestamp = new Date();
    const detached = !product.isNew();
    const productID = detached ? product.getProductID() : generatePersistedIdentifier();
    const executor = plan?.tx ?? this.executor;
    const auditActorAccountID = resolveAuditActorAccountID(this.auditActor);

    const record = toProductRecord(
      product,
      productID,
      urlTitle,
      productName,
      auditTimestamp,
      auditTimestamp,
      auditActorAccountID,
    );

    await executor.executeMutation(
      INSERT_PRODUCT_SQL,
      toBoundParameters(record, PRODUCT_INSERTED_COLUMNS, PRODUCT_INSERT_LABEL),
    );

    // After the row, because `SwSku.productID` references it, and the transaction is what makes
    // the in-between state unobservable.
    const cascade =
      plan === undefined ? undefined : await this.cascadeTransientSkus(product, productID, plan);

    if (detached && cascade === undefined) {
      return product;
    }

    return rebuildProduct(
      product,
      productID,
      urlTitle,
      productName,
      // [org/Hibachi/HibachiEntity.cfc:L609] the same instant in both columns, byte-identical.
      auditTimestamp,
      auditTimestamp,
      // And the same account in both, for the same reason.
      auditActorAccountID,
      auditActorAccountID,
      this,
      this.collaborators,
      cascade,
    );
  }

  /**
   * @param product the product to update.
   * @param urlTitle the url title the populate step settled on, if any.
   * @param productName the product name the populate step settled on, if any.
   * @param plan the SKU cascade to run after the row write, when this save carries transient SKUs.
   * @returns the argument when the populate step overrode nothing and no cascade ran, and
   * otherwise a new instance carrying the values that were written.
   * @throws An error named `ProductColumnError` when the record does not carry a listed column.
   */
  private async updateProduct(
    product: Product,
    urlTitle: string | undefined,
    productName: string | undefined,
    plan?: SkuCascadePlan,
  ): Promise<Product> {
    // [org/Hibachi/HibachiEntity.cfc:L662-L667] the modified stamp only; the created pair is not
    // in the SET list at all, so the value passed here for it is never written.
    const modifiedDateTime = new Date();
    const executor = plan?.tx ?? this.executor;

    const record = toProductRecord(
      product,
      product.getProductID(),
      urlTitle,
      productName,
      product.getCreatedDateTime(),
      modifiedDateTime,
      resolveAuditActorAccountID(this.auditActor),
    );

    const update = await executor.executeMutation(UPDATE_PRODUCT_SQL, [
      ...toBoundParameters(record, PRODUCT_UPDATED_COLUMNS, PRODUCT_UPDATE_LABEL),
      // The key is bound last, matching the statement's `WHERE productID = ?`.
      product.getProductID(),
    ]);

    // REFUSED when no ROW MATCHED, the same guard the SKU adapter's update carries and for the
    // same reason: without it, an update against a non-existent key reports SUCCESS.
    if (update.affectedRows === 0) {
      throw new ProductPersistenceError(
        'the update matched no SwProduct row, so the key it carries names nothing and the entity ' +
          'cannot be reported as persisted',
      );
    }

    const cascade =
      plan === undefined
        ? undefined
        : await this.cascadeTransientSkus(product, product.getProductID(), plan);

    const populateOverrodeNothing =
      urlTitle === product.getUrlTitle() && productName === product.getProductName();

    if (populateOverrodeNothing && cascade === undefined) {
      return product;
    }

    return rebuildProduct(
      product,
      product.getProductID(),
      urlTitle,
      productName,
      // The row's own creation stamp, untouched by an update - the created pair is absent from the
      // SET list entirely, so this reports what the row holds rather than what this write decided.
      product.getCreatedDateTime(),
      modifiedDateTime,
      product.getCreatedByAccountID(),
      resolveStampedModifiedByAccountID(this.auditActor, product.getModifiedByAccountID()),
      this,
      this.collaborators,
      cascade,
    );
  }
}

// EXCLUSION NOTES - the legacy machinery this adapter deliberately does not port.
//
// CFML parity [model/dao/ProductDAO.cfc:L188, L196]: the same local is declared twice with `var`,
// eight lines apart, inside the excluded importer. CFML tolerates the redeclaration and the second
// one simply reassigns.
//
// CFML parity [model/dao/ProductDAO.cfc:L356-L360]: a two-armed conditional inside
// `saveImportData` whose arms are character-for-character identical, so the test cannot affect the
// outcome. Recorded as an exclusion; nothing is reproduced.
