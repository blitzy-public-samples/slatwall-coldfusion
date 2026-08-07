// slatwall-ts - MySQL SKU repository adapter.
//
// The secondary adapter behind `src/domain/ports/skuRepository.ts`, porting `model/dao/SkuDAO.cfc`
// (228 lines).
//
// So this class publishes SEVEN members, and the count is stated here rather than left for a
// reader to recount.
//
// LEGACY-NOTE [model/dao/SkuDAO.cfc:L172-L226]: two locator drifts surfaced when every citation
// was re-read off the source.

import { randomUUID } from 'node:crypto';

import type { Product } from '../../domain/entities/product.js';
import { Option } from '../../domain/entities/option.js';
import { OptionGroup } from '../../domain/entities/optionGroup.js';
import type { SkuCurrencyCascadeContext, SkuHydrationInput } from '../../domain/entities/sku.js';
import { Sku } from '../../domain/entities/sku.js';
import { SkuCurrency } from '../../domain/entities/skuCurrency.js';
import type { SkuRepository } from '../../domain/ports/skuRepository.js';
import { isCurrencyCode } from '../../domain/valueObjects/currencyCode.js';
import { Money } from '../../domain/valueObjects/money.js';
import { listToArray } from '../../lib/cfml/list.js';
import type { CfStruct } from '../../lib/cfml/struct.js';
import { cfEquals, cfFoldKey, structGet } from '../../lib/cfml/struct.js';
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import { cfTruthy, isNullish } from '../../lib/cfml/truthiness.js';
import type {
  AuditActorContext,
  PreparedStatementExecutor,
  SqlParameter,
  SqlRow,
} from './connection.js';
import {
  resolveAuditActorAccountID,
  resolveStampedModifiedByAccountID,
  chunkTupleRows,
  sqlPlaceholderList,
  sqlTuplePlaceholderList,
  sqlUpdateAssignment,
} from './connection.js';
import type { DatabaseDialect } from './dialect.js';
import { assertMySqlDialect } from './dialect.js';
import { buildSkusBySelectedOptionsStatement } from './sql/skusBySelectedOptions.sql.js';
import { buildSortedProductSkusStatement } from './sql/sortedProductSkus.sql.js';

// JUDGMENT CALL: the dialect is a module constant and is deliberately not read from configuration.
const STATEMENT_DIALECT: DatabaseDialect = 'MySQL';

assertMySqlDialect(STATEMENT_DIALECT, 'the ported SkuDAO statements');

// Three distinct faults, three types, following the pattern the sibling adapters established: each
// class is LOCAL and unexported, sets an explicit `name`.
//
// No message ever echoes a column value - only a column name, a statement label and a JavaScript
// type.

/**
 * A column a statement selected is absent, or holds a type the schema cannot produce.
 */
class SkuColumnError extends Error {
  readonly columnName: string;

  readonly detail: string;

  readonly statementLabel: string;

  constructor(columnName: string, detail: string, statementLabel: string) {
    super(
      `Column '${columnName}' of statement '${statementLabel}' is ${detail}. The statement text ` +
        `and the Sw* schema it reads must agree; no value is substituted for a column that cannot ` +
        `be read.`,
    );
    this.name = 'SkuColumnError';
    this.columnName = columnName;
    this.detail = detail;
    this.statementLabel = statementLabel;
  }
}

class SkuPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SkuPersistenceError';
  }
}

/**
 * A statement asked for a unique row and got more than one.
 *
 * CFML parity [model/dao/SkuDAO.cfc:L102-L103]: `getSkuBySkuCode` runs a `LEFT JOIN` onto
 * `ss.alternateSkuCodes` combined with an `OR` and passes `true` as the third argument to
 * `ormExecuteQuery`, asking for a unique result from a statement its own join can multiply, with
 * no `distinct`.
 */
class SkuNonUniqueResultError extends Error {
  readonly rowCount: number;

  constructor(rowCount: number) {
    super(
      `Statement 'selectSkuBySkuCode' returned ${String(rowCount)} rows where the legacy asks for a ` +
        `unique result [model/dao/SkuDAO.cfc:L103]. Reached when a matched sku carries two or more ` +
        `alternate sku codes, because the LEFT JOIN onto SwAlternateSkuCode multiplies the row. This ` +
        `adapter refuses rather than choosing a row: adding DISTINCT or a row limit here would decide ` +
        `which sku is returned.`,
    );
    this.name = 'SkuNonUniqueResultError';
    this.rowCount = rowCount;
  }
}

// IMPOSED here have been REMOVED. The record is kept because a reader will look for them, and
// because re-adding one would reintroduce the exact divergence that was ruled out.

const SELECT_SKU_BY_SKU_CODE = 'selectSkuBySkuCode';
const SELECT_SKUS_BY_SELECTED_OPTIONS = 'selectSkusBySelectedOptions';
const SEARCH_SKUS_BY_PRODUCT_TYPE = 'searchSkusByProductType';
const SELECT_PRODUCT_SKUS = 'selectProductSkus';
const SELECT_SORTED_PRODUCT_SKU_IDS = 'selectSortedProductSkuIDs';
const SELECT_TRANSACTION_EXISTS = 'selectTransactionExists';
const SELECT_NEXT_OPTION_GROUP_SORT_ORDER = 'selectNextOptionGroupSortOrder';
const SELECT_SKU_CURRENCIES = 'selectSkuCurrencies';
const SELECT_SKU_OPTIONS = 'selectSkuOptions';
const SELECT_SKU_ACCESS_CONTENT_IDS = 'selectSkuAccessContentIDs';
const SELECT_SKU_SUBSCRIPTION_BENEFIT_IDS = 'selectSkuSubscriptionBenefitIDs';
const INSERT_SKU = 'insertSku';
const UPDATE_SKU = 'updateSku';

// B5 - schema continuity.
//
// The write-side ordering is declared once and both the SQL text and the bound parameter array are
// derived from it, so a column and its placeholder cannot drift apart.

/**
 * The `SwSku` columns this adapter reads and writes.
 */
const SKU_COLUMNS = Object.freeze([
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

/**
 * The columns an UPDATE assigns: every column except the primary key and the creation timestamp.
 *
 * Derived from {@link SKU_COLUMNS} rather than restated, so the two can never disagree.
 *
 * `skuID` is excluded because it is `fieldtype="id" generator="uuid"` [model/entity/Sku.cfc:L52] -
 * an application-minted key that identifies the row being updated and is never itself updated.
 */
const UPDATED_SKU_COLUMNS = Object.freeze(
  SKU_COLUMNS.filter((columnName) => columnName !== 'skuID' && columnName !== 'createdDateTime'),
);

/**
 * The `SwSkuCurrency` columns the per-currency price map is built from.
 *
 * Order follows [model/entity/SkuCurrency.cfc:L52-L77]: the identifier, the three money columns in
 * the source's own sequence - `price`, then `renewalPrice`, then `listPrice`, which is not
 * alphabetical and is not reordered.
 */
const SKU_CURRENCY_COLUMNS = Object.freeze([
  'skuCurrencyID',
  'price',
  'renewalPrice',
  'listPrice',
  'skuID',
  'currencyCode',
  'remoteID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

/**
 * The `SwOption` columns an option is hydrated from. [model/entity/Option.cfc:L52-L74]
 *
 * `defaultImageID` is the `defaultImage` association's foreign key [model/dao/SkuDAO.cfc:L60];
 * `Image` is out of scope.
 */
const OPTION_COLUMNS = Object.freeze([
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

const OPTION_GROUP_COLUMNS = Object.freeze([
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

/**
 * Alias prefix for the option-group columns joined alongside an option.
 *
 * `SwOption` and `SwOptionGroup` share four column names outright - `remoteID` and the three audit
 * columns - plus `optionGroupID` itself.
 */
const OPTION_GROUP_ALIAS_PREFIX = 'optionGroup_';

const SKU_OPTION_LINK_SKU_ID = 'link_skuID';

const EMPTY_LIST_ELEMENT = '';

// CFML parity [model/dao/SkuDAO.cfc:L182-L189, L211]: query-column access in CFML is
// CASE-INSENSITIVE - `rs.max`, `rs.MAX` and `rs.Max` are one and the same read - and the ORM
// attribute is spelled both `ormtype` and `ormType` across this slice.
//
// `noUncheckedIndexedAccess` is on, so `row[name]` is `unknown | undefined` at every site.

/**
 * Case-folds a column name for comparison.
 *
 * `toLowerCase` and not `toLocaleLowerCase`: locale-aware folding maps `I` onto a dotless `ı`
 * under a Turkish locale, and all but one of the column names this file reads carries a capital
 * `I`.
 */
function foldIdentifier(identifier: string): string {
  return identifier.toLowerCase();
}

/**
 * The outcome of a column lookup, with "absent" and "present but NULL" kept apart.
 *
 * They are different facts and the difference is load-bearing here more than anywhere else in this
 * folder: a NULL `SwSkuCurrency.price` is a legitimate value that must become `undefined`
 * [model/entity/SkuCurrency.cfc:L53].
 */
type ColumnLookup = { readonly found: true; readonly value: unknown } | { readonly found: false };

function findColumn(row: SqlRow, columnName: string): ColumnLookup {
  if (Object.prototype.hasOwnProperty.call(row, columnName)) {
    return { found: true, value: row[columnName] };
  }

  const foldedColumnName = foldIdentifier(columnName);

  for (const presentColumnName of Object.keys(row)) {
    if (foldIdentifier(presentColumnName) === foldedColumnName) {
      return { found: true, value: row[presentColumnName] };
    }
  }

  return { found: false };
}

function describeColumnType(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (value instanceof Date) {
    return 'a Date';
  }

  if (value instanceof Uint8Array) {
    return 'a Uint8Array';
  }

  return `a ${typeof value}`;
}

function requireColumn(row: SqlRow, columnName: string, statementLabel: string): unknown {
  const lookup = findColumn(row, columnName);

  if (!lookup.found) {
    throw new SkuColumnError(columnName, 'absent', statementLabel);
  }

  return lookup.value;
}

/**
 * Reads a non-null identifier column.
 *
 * Every key in this slice is `generator="uuid"` over a 32-character varchar
 * [model/entity/Sku.cfc:L52], so a key always arrives as a string.
 */
function readIdentifier(row: SqlRow, columnName: string, statementLabel: string): string {
  const value = requireColumn(row, columnName, statementLabel);

  if (typeof value !== 'string') {
    throw new SkuColumnError(columnName, describeColumnType(value), statementLabel);
  }

  return value;
}

/**
 * Reads a nullable text column, mapping SQL NULL to `undefined`.
 *
 * The empty string is preserved and not folded into `undefined`.
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
    throw new SkuColumnError(columnName, describeColumnType(value), statementLabel);
  }

  return value;
}

/**
 * Reads a nullable `datetime` column.
 *
 * `./connection.js` fixes the session time zone at UTC (`timezone: 'Z'`) and leaves `dateStrings`
 * unset.
 */
function readTimestamp(row: SqlRow, columnName: string, statementLabel: string): Date | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (!(value instanceof Date)) {
    throw new SkuColumnError(columnName, describeColumnType(value), statementLabel);
  }

  return value;
}

/**
 * Reads a boolean column and hands it on UNCOERCED.
 *
 * JUDGMENT CALL: the single coercion funnel for every boolean in this slice is `cfBoolean()`, and
 * it runs in the ENTITY.
 *
 * `Uint8Array` is handled because MySQL delivers `BIT(1)` as a one-byte buffer; its first byte is
 * forwarded as a number and an empty buffer is reported as absent.
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

  throw new SkuColumnError(columnName, describeColumnType(value), statementLabel);
}

/**
 * Reads a `big_decimal` money column.
 *
 * Because CFML cannot store null in A STRUCT KEY, step 2 leaves the `price` sub-key ABSENT when an
 * override row's price is null, which is what lets step 3's `structKeyExists(entry, "price")` test
 * at [model/entity/Sku.cfc:L416] fire and convert.
 *
 * E4: the value is read as a STRING and handed to `Money.fromDecimalString`; `decimalNumbers` is
 * left unset on the pool so `DECIMAL` arrives as a string.
 */
function readMoney(row: SqlRow, columnName: string, statementLabel: string): Money | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new SkuColumnError(columnName, describeColumnType(value), statementLabel);
  }

  return Money.fromDecimalString(value);
}

/**
 * Reads a nullable `ormtype="integer"` column.
 *
 * Two columns reach it and both are genuinely nullable: `SwOption.sortOrder`
 * [model/entity/Option.cfc:L56] and `SwSku.calculatedQATS` [model/entity/Sku.cfc:L62], neither
 * declaring a default.
 *
 * `bigint` is accepted because MySQL can widen an integral result, and is refused outside the
 * exactly representable range rather than rounded.
 */
function readOptionalInteger(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): number | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(value);
    }

    throw new SkuColumnError(
      columnName,
      'a big integer outside the exactly representable range',
      statementLabel,
    );
  }

  throw new SkuColumnError(columnName, describeColumnType(value), statementLabel);
}

/**
 * Reads a not null `ormtype="integer"` column.
 */
function readRequiredInteger(row: SqlRow, columnName: string, statementLabel: string): number {
  const value = readOptionalInteger(row, columnName, statementLabel);

  if (value === undefined) {
    throw new SkuColumnError(
      columnName,
      'null where the schema declares it required',
      statementLabel,
    );
  }

  return value;
}

/**
 * Reads a `COUNT(...)` projection.
 *
 * Kept separate from {@link readOptionalInteger} because a `COUNT` cannot be NULL - MySQL returns
 * 0 for an empty set.
 */
function readCount(row: SqlRow, columnName: string, statementLabel: string): number {
  const value = readOptionalInteger(row, columnName, statementLabel);

  if (value === undefined) {
    throw new SkuColumnError(columnName, 'null where a count was projected', statementLabel);
  }

  return value;
}

/**
 * Narrows a value this adapter is about to bind.
 *
 * `SqlParameter` admits `null` but not `undefined`, which is the driver's boundary rather than a
 * stylistic choice: `undefined` is how this file models an absent domain value.
 */
function toBindableValue(value: string | number | boolean | Date | undefined): SqlParameter {
  return value === undefined ? null : value;
}

type ColumnValues = Readonly<Record<string, string | number | boolean | Date | undefined>>;

/**
 * The four audit values one write decided, plus the one the database will decide.
 */
interface SkuAuditStamps {
  /**
   * Bound by the insert only; the update's column list excludes it.
   */
  readonly createdDateTime: Date | undefined;

  /**
   * Bound by the insert only, for the same reason.
   */
  readonly createdByAccountID: string | undefined;

  /**
   * Bound by both statements.
   */
  readonly modifiedDateTime: Date;

  /**
   * What is BOUND for the modifying account: the actor resolution, or `undefined`.
   */
  readonly modifiedByAccountID: string | undefined;

  /**
   * What the ROW will hold once `COALESCE` has resolved the bound value.
   */
  readonly resolvedModifiedByAccountID: string | undefined;
}

/**
 * Projects a column-value map onto an ordered column list, producing the bound-parameter array.
 *
 * The ordered list is the same constant the SQL text was built from, so a column and its
 * placeholder cannot drift out of step.
 */
function bindColumnValues(
  columnNames: readonly string[],
  values: ColumnValues,
  statementLabel: string,
): SqlParameter[] {
  return columnNames.map((columnName) => {
    if (!Object.prototype.hasOwnProperty.call(values, columnName)) {
      throw new SkuPersistenceError(
        `Statement '${statementLabel}' names column '${columnName}', for which no value was ` +
          `supplied. The column list and the value map are derived from the same source and must ` +
          `agree.`,
      );
    }

    return toBindableValue(values[columnName]);
  });
}

/**
 * Mints a primary key for a first insert.
 */
function mintEntityIdentifier(): string {
  return randomUUID().replaceAll('-', '');
}

/**
 * Store `value` on `target` under `key` as an own, enumerable data property.
 *
 * CFML parity: a CFML struct has no prototype chain and no reserved keys, so a struct keyed by
 * such a value held it as an ordinary key. The plain assignment this replaces was the divergence.
 *
 * @param target the record being built.
 * @param key the identifier read out of the result set.
 * @param value the value to store.
 */
function putOwnStructKey<TValue>(target: Record<string, TValue>, key: string, value: TValue): void {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * CFML parity [model/entity/Sku.cfc:L269-L285]: CFML struct keys are case-insensitive, and the
 * legacy reached child collections through parent-keyed structs.
 */
function groupRowsByParentIdentifier(
  rows: readonly SqlRow[],
  parentColumnName: string,
  statementLabel: string,
): CfStruct<readonly SqlRow[]> {
  const grouped: Record<string, SqlRow[]> = {};

  for (const row of rows) {
    const parentIdentifier = readIdentifier(row, parentColumnName, statementLabel);
    const existing = structGet(grouped, parentIdentifier);

    if (existing === undefined) {
      putOwnStructKey(grouped, parentIdentifier, [row]);
      continue;
    }

    existing.push(row);
  }

  return grouped;
}

/**
 * The child rows belonging to one parent, or an empty array when the parent has none.
 *
 * Row order is preserved exactly as the statement returned it, and no statement in this file adds
 * an `ORDER BY` the legacy lacks.
 */
function childRowsFor(
  grouped: CfStruct<readonly SqlRow[]>,
  parentIdentifier: string,
): readonly SqlRow[] {
  return structGet(grouped, parentIdentifier) ?? [];
}

function distinctIdentifiers(
  rows: readonly SqlRow[],
  columnName: string,
  statementLabel: string,
): readonly string[] {
  const seen = new Set<string>();
  const identifiers: string[] = [];

  for (const row of rows) {
    const identifier = readIdentifier(row, columnName, statementLabel);
    const foldedIdentifier = foldIdentifier(identifier);

    if (seen.has(foldedIdentifier)) {
      continue;
    }

    seen.add(foldedIdentifier);
    identifiers.push(identifier);
  }

  return identifiers;
}

// Statement text for the six methods whose SQL is not extracted into `./sql/` lives here. Nothing
// below is exported (E7).
//
// CFML parity [model/dao/SkuDAO.cfc:L88, L90, L103, L165]: the legacy HQL binds NAMED parameters;
// where one appears twice in a statement, as `:skuCode` does at [model/dao/SkuDAO.cfc:L103], the
// positional form binds the same value twice.

/**
 * Load one SKU by its own code or by any of its alternate codes.
 *
 * Legacy [model/dao/SkuDAO.cfc:L102-L104], whose whole body is one `ormExecuteQuery` call.
 *
 * ROW, and the legacy asks for a unique result anyway - see {@link SkuNonUniqueResultError}.
 */
const SKU_BY_SKU_CODE_SQL = `select ss.* from SwSku ss
  left join SwAlternateSkuCode ascs on ascs.skuID = ss.skuID
  where ss.skuCode = ? or ascs.alternateSkuCode = ?`;

// The one place this file corrects the source instead of preserving it.
//
// CFML parity [model/dao/SkuDAO.cfc:L131-L138]: the legacy builds RAW SQL through `new Query()`
// and `setSQL()` naming `SlatwallSku` and `SlatwallProduct` - ORM ENTITY names.
//
// JUDGMENT CALL: the physical names `SwSku` and `SwProduct` are emitted, as a CORRECTION mandated
// by B5 (schema continuity) - the target reads and writes the existing `Sw*` schema, and a
// statement that cannot resolve a table reads nothing at all.
/**
 * Search SKUs by code, optionally narrowed to one or more product types.
 *
 * Sibling `ProductDAO.searchProductsByProductType` [model/dao/ProductDAO.cfc:L419-L427] filters
 * `productTypeID` DIRECTLY on the product row instead; the two shapes must not be unified.
 *
 * @param productTypeIDPlaceholders one `?` per product-type identifier, or the empty string when
 * the filter does not apply.
 */
function buildSearchSkusByProductTypeSql(productTypeIDPlaceholders: string): string {
  const base = 'select * from SwSku where skuCode like ?';

  if (productTypeIDPlaceholders.length === 0) {
    return base;
  }

  return `${base} and productID in (select productID from SwProduct where productTypeID in (${productTypeIDPlaceholders}))`;
}

/**
 * The `fetchOptions` join fragment for one base product type, and the one shape that has none.
 *
 * Legacy [model/dao/SkuDAO.cfc:L152-L163]. The base statement is `SELECT sku FROM SlatwallSku sku`
 * followed by `WHERE sku.product.productID =:productID`, and between them the legacy inserts one
 * of three eager-fetch fragments chosen by the product's base type.
 *
 * Each fragment is the physical rendering of the association the legacy fetches.
 */
const CONTENT_ACCESS_FETCH_JOIN =
  'INNER JOIN SwSkuAccessContent contents on contents.skuID = sku.skuID ';

const MERCHANDISE_FETCH_JOIN = 'INNER JOIN SwSkuOption `option` on `option`.skuID = sku.skuID ';

const SUBSCRIPTION_FETCH_JOINS =
  'INNER JOIN SwSubscriptionTerm st on st.subscriptionTermID = sku.subscriptionTermID ' +
  'INNER JOIN SwSkuSubsBenefit sb on sb.skuID = sku.skuID ';

const NO_FETCH_JOIN = '';

/**
 * Assembles one of the four `getProductSkus` statements.
 *
 * The three pieces and their order are the legacy's: the projection and `FROM`
 * [model/dao/SkuDAO.cfc:L152], the optional fetch join, then the `WHERE`
 * [model/dao/SkuDAO.cfc:L163].
 *
 * @param fetchJoin the fragment for the resolved base type, or the empty string for the bare
 * shape.
 */
function buildProductSkusSql(fetchJoin: string): string {
  return `SELECT sku.* FROM SwSku sku ${fetchJoin}WHERE sku.productID = ?`;
}

/**
 * The same statement, keyed to a SET of products.
 *
 * One statement for many products, which is the only difference.
 *
 * @param fetchJoin the branch's eager-fetch join text, exactly as the singular form receives it.
 * @param productIDCount how many identifiers will be bound.
 */
function buildProductSkusForProductsSql(fetchJoin: string, productIDCount: number): string {
  return `SELECT sku.* FROM SwSku sku ${fetchJoin}WHERE sku.productID IN (${sqlPlaceholderList(
    productIDCount,
  )})`;
}

// LEGACY-DEFECT [model/dao/SkuDAO.cfc:L65-L85]: all TEN `EXISTS` subqueries use UNQUALIFIED
// association paths - `sku.skuID` in the first and `stock.sku.skuID`, `fromStock.sku.skuID` or
// `toStock.sku.skuID` in the other nine - with no `a.` prefix.
// Preserved deliberately; do not fix without a product decision.
/**
 * The ten-way transaction existence probe.
 *
 * @param keyPredicate either the SKU-key or the product-key predicate, chosen by the caller.
 */
function buildTransactionExistsSql(keyPredicate: string): string {
  return `SELECT count(ss.skuID) as skuCount FROM SwSku ss WHERE ${keyPredicate}
      AND (
        EXISTS( SELECT a.orderItemID as id FROM SwOrderItem a WHERE a.skuID = ss.skuID )
          OR
        EXISTS( SELECT a.inventoryID as id FROM SwInventory a INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )
          OR
        EXISTS( SELECT a.orderDeliveryItemID as id FROM SwOrderDeliveryItem a INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )
          OR
        EXISTS( SELECT a.physicalCountItemID as id FROM SwPhysicalCountItem a INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )
          OR
        EXISTS( SELECT a.stockAdjustmentDeliveryItemID as id FROM SwStockAdjustmentDeliveryItem a INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )
          OR
        EXISTS( SELECT a.stockAdjustmentItemID as id FROM SwStockAdjustmentItem a INNER JOIN SwStock fromStock on fromStock.stockID = a.fromStockID WHERE fromStock.skuID = ss.skuID )
          OR
        EXISTS( SELECT a.stockAdjustmentItemID as id FROM SwStockAdjustmentItem a INNER JOIN SwStock toStock on toStock.stockID = a.toStockID WHERE toStock.skuID = ss.skuID )
          OR
        EXISTS( SELECT a.stockHoldID as id FROM SwStockHold a INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )
          OR
        EXISTS( SELECT a.stockReceiverItemID as id FROM SwStockReceiverItem a INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )
          OR
        EXISTS( SELECT a.vendorOrderItemID as id FROM SwVendorOrderItem a INNER JOIN SwStock stock on stock.stockID = a.stockID WHERE stock.skuID = ss.skuID )
      )`;
}

const TRANSACTION_EXISTS_SKU_PREDICATE = 'ss.skuID = ?';

const TRANSACTION_EXISTS_PRODUCT_PREDICATE = 'ss.productID = ?';

/**
 * The highest option-group sort order on record.
 *
 * Legacy [model/dao/SkuDAO.cfc:L211], reproduced token for token INCLUDING the alias `max` - a
 * function name used as a column label, which MySQL 8.0.46 accepts (probed).
 *
 * An aggregate with no `GROUP BY` always returns exactly one row, and `max` in that row is null
 * when the table is empty.
 */
const NEXT_OPTION_GROUP_SORT_ORDER_SQL =
  'SELECT max(SwOptionGroup.sortOrder) as max FROM SwOptionGroup';

/**
 * The per-currency price override rows for a set of SKUs.
 *
 * No legacy statement antecedent: `skuCurrencies` is a Hibernate one-to-many
 * [model/entity/Sku.cfc:L72] the legacy traversed lazily from inside the entity's own cascade
 * [model/entity/Sku.cfc:L399-L414].
 *
 * @param skuIDPlaceholders one `?` per SKU identifier.
 */
function buildSkuCurrenciesSql(skuIDPlaceholders: string): string {
  return `select ${SKU_CURRENCY_COLUMNS.join(', ')} from SwSkuCurrency where skuID in (${skuIDPlaceholders})`;
}

/**
 * The options of a set of SKUs, each with its option group.
 *
 * No legacy statement antecedent: `options` is a many-to-many over `SwSkuOption`
 * [model/entity/Sku.cfc:L76] that Hibernate loaded lazily.
 *
 * @param skuIDPlaceholders one `?` per SKU identifier; never empty.
 */
function buildSkuOptionsSql(skuIDPlaceholders: string): string {
  const optionProjection = OPTION_COLUMNS.map((columnName) => `SwOption.${columnName}`).join(', ');
  const optionGroupProjection = OPTION_GROUP_COLUMNS.map(
    (columnName) => `SwOptionGroup.${columnName} as ${OPTION_GROUP_ALIAS_PREFIX}${columnName}`,
  ).join(', ');

  return `select SwSkuOption.skuID as ${SKU_OPTION_LINK_SKU_ID}, ${optionProjection}, ${optionGroupProjection} from SwSkuOption
  inner join SwOption on SwOption.optionID = SwSkuOption.optionID
  left join SwOptionGroup on SwOptionGroup.optionGroupID = SwOption.optionGroupID
  where SwSkuOption.skuID in (${skuIDPlaceholders})`;
}

/**
 * The identifiers on one of the SKU link tables, for a set of SKUs.
 *
 * This projects identifiers and nothing else, and that is the whole point.
 *
 * @param linkTableName one of the two in-scope link tables, from a frozen constant - never a
 * caller-supplied value.
 * @param identifierColumnName the link table's `inversejoincolumn`, likewise from a constant.
 * @param skuIDPlaceholders one `?` per SKU identifier; never empty.
 */
function buildSkuLinkIdentifiersSql(
  linkTableName: string,
  identifierColumnName: string,
  skuIDPlaceholders: string,
): string {
  return `select ${linkTableName}.skuID as ${SKU_OPTION_LINK_SKU_ID}, ${linkTableName}.${identifierColumnName} from ${linkTableName}
  where ${linkTableName}.skuID in (${skuIDPlaceholders})`;
}

const ACCESS_CONTENT_LINK = Object.freeze({
  tableName: 'SwSkuAccessContent',
  identifierColumnName: 'contentID',
});

const SUBSCRIPTION_BENEFIT_LINK = Object.freeze({
  tableName: 'SwSkuSubsBenefit',
  identifierColumnName: 'subscriptionBenefitID',
});

const INSERT_SKU_SQL = `insert into SwSku (${SKU_COLUMNS.join(', ')}) values (${sqlPlaceholderList(
  SKU_COLUMNS.length,
)})`;

/**
 * Updates one `SwSku` row.
 */
const UPDATE_SKU_SQL = `update SwSku set ${UPDATED_SKU_COLUMNS.map((columnName) =>
  sqlUpdateAssignment(columnName),
).join(', ')} where skuID = ?`;

const DELETE_SKU_OPTIONS_SQL = 'delete from SwSkuOption where skuID = ?';

/**
 * Columns per `SwSkuOption` row: the owner key then the member key [model/entity/Sku.cfc:L76].
 */
const SKU_OPTION_TUPLE_WIDTH = 2;

/**
 * @param optionCount how many option rows to write.
 */
function buildSkuOptionInsertSql(optionCount: number): string {
  return `insert into SwSkuOption (skuID, optionID) values ${sqlTuplePlaceholderList(
    SKU_OPTION_TUPLE_WIDTH,
    optionCount,
  )}`;
}

/**
 * The collaborator ports a hydrated `Sku` carries.
 *
 * JUDGMENT CALL: this type is DERIVED from `SkuHydrationInput` with `Pick` rather than by
 * importing the four port modules, which are not among this file's dependencies; `Pick` gives the
 * same types and cannot drift from the entity's declaration.
 *
 * `imageSettingValues` is the one member that is not a port.
 */
type SkuHydrationCollaborators = Readonly<
  Pick<
    SkuHydrationInput,
    | 'settingsProvider'
    | 'currencyConverter'
    | 'priceGroupResolver'
    | 'currentAccountContext'
    | 'imageSettingValues'
  >
>;

/**
 * A mutable draft of the entity's hydration input.
 *
 * `exactOptionalPropertyTypes` is on, so `{ skuCode: undefined }` is not assignable to a member
 * declared `skuCode?: string`.
 */
type SkuHydrationDraft = {
  -readonly [K in keyof SkuHydrationInput]: SkuHydrationInput[K];
};

/**
 * What a read path materializes on the SKUs it returns.
 *
 * T3 - the fetch shape is a decision, not a default, so it is a parameter of the factory rather
 * than something each call site half-decides.
 */
type SkuFetchShape = {
  /**
   * The product to wire into each SKU's `product` association, when the caller already has one.
   *
   * Only `getProductSkus` does: it is HANDED a `Product`, and every SKU it returns is by
   * definition a SKU of that product, so the association is exact and free.
   */
  readonly product: Product | undefined;

  /**
   * The products a MULTI-PRODUCT read is hydrating, keyed by case-folded identifier.
   *
   * Supplied only by `getProductSkusForProducts`, `AND` it is the multi-product form of `product`
   * above.
   *
   * `product` wins when both are present, which never happens: the two are set by different
   * callers.
   */
  readonly productsByFoldedID?: ReadonlyMap<string, Product>;

  /**
   * Whether to materialize `accessContentIDs` from `SwSkuAccessContent`.
   *
   * True only on the `contentAccess` branch of `getProductSkus`, which is the one place the legacy
   * eagerly fetches that collection [model/dao/SkuDAO.cfc:L155].
   */
  readonly accessContents: boolean;

  /**
   * Whether to materialize `subscriptionBenefitIDs` from `SwSkuSubsBenefit`.
   */
  readonly subscriptionBenefits: boolean;
};

const BARE_SKU_FETCH_SHAPE: SkuFetchShape = Object.freeze({
  product: undefined,
  accessContents: false,
  subscriptionBenefits: false,
});

/**
 * The product a SKU row belongs to, when a multi-product read supplied the candidates.
 *
 * Reads the row's own `productID` - NULLABLE on `SwSku` [model/entity/Sku.cfc:L65], so absence is
 * a legitimate answer and never an error - and looks it up folded.
 *
 * @param row one SKU row.
 * @param statementLabel the statement's label, for a column-read failure.
 * @param productsByFoldedID the candidates, keyed by case-folded identifier.
 */
function resolveOwningProduct(
  row: SqlRow,
  statementLabel: string,
  productsByFoldedID: ReadonlyMap<string, Product> | undefined,
): Product | undefined {
  if (productsByFoldedID === undefined) {
    return undefined;
  }

  const productID = readOptionalText(row, 'productID', statementLabel);

  return productID === undefined ? undefined : productsByFoldedID.get(cfFoldKey(productID));
}

/**
 * Builds one `SkuCurrency` from a `SwSkuCurrency` row, or refuses the row.
 *
 * CFML parity [model/entity/SkuCurrency.cfc:L68]: `currencyCode` is declared
 * `insert="false" update="false"`, a read-only projection of the `currency` many-to-one's foreign key
 * [model/entity/SkuCurrency.cfc:L57], carrying no `ormtype`, no `length` and no format constraint, so
 * nothing about the stored value is normalised here.
 *
 * A row whose code is not a three-character currency code is skipped rather than repaired: the
 * cascade is unaffected, because a code the entity cannot key by could never be read back.
 *
 * @param row one `SwSkuCurrency` row.
 * @param statementLabel the statement that produced the row, for diagnostics.
 * @returns the entity, or `undefined` when the row's currency code is unusable.
 */
function toSkuCurrency(row: SqlRow, statementLabel: string): SkuCurrency | undefined {
  const currencyCodeValue = readOptionalText(row, 'currencyCode', statementLabel);

  if (!isCurrencyCode(currencyCodeValue)) {
    return undefined;
  }

  return new SkuCurrency({
    skuCurrencyID: readIdentifier(row, 'skuCurrencyID', statementLabel),
    price: readMoney(row, 'price', statementLabel),
    renewalPrice: readMoney(row, 'renewalPrice', statementLabel),
    listPrice: readMoney(row, 'listPrice', statementLabel),
    currencyCode: currencyCodeValue,
    sku: undefined,
    remoteID: readOptionalText(row, 'remoteID', statementLabel),
    createdDateTime: readTimestamp(row, 'createdDateTime', statementLabel),
    createdByAccountID: readOptionalText(row, 'createdByAccountID', statementLabel),
    modifiedDateTime: readTimestamp(row, 'modifiedDateTime', statementLabel),
    modifiedByAccountID: readOptionalText(row, 'modifiedByAccountID', statementLabel),
  });
}

/**
 * Builds the joined `OptionGroup` for one option row, or reports that the option has none.
 *
 * The group arrives through the left outer join on the option read rather than through a second
 * statement.
 *
 * Fetch shape (T3): the group is materialized without its own `options` collection.
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
    sortOrder: readRequiredInteger(row, `${OPTION_GROUP_ALIAS_PREFIX}sortOrder`, statementLabel),
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
 * Builds one `Option` from a joined `SwSkuOption` / `SwOption` / `SwOptionGroup` row.
 *
 * Fetch shape (T3): the option carries its option group and nothing else.
 */
function toOption(row: SqlRow, statementLabel: string): Option {
  return new Option({
    optionID: readIdentifier(row, 'optionID', statementLabel),
    optionCode: readOptionalText(row, 'optionCode', statementLabel),
    optionName: readOptionalText(row, 'optionName', statementLabel),
    optionDescription: readOptionalText(row, 'optionDescription', statementLabel),
    sortOrder: readOptionalInteger(row, 'sortOrder', statementLabel),
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
 * The MySQL implementation of `SkuRepository`.
 *
 * Seven port methods, matching the port exactly, and no eighth public member.
 *
 * @see `src/domain/ports/skuRepository.ts` for the authoritative contract, which declares SEVEN
 * methods - `getTransactionExistsFlag`, `getSkuBySkuCode`, `getSkusBySelectedOptions`,
 * `searchSkusByProductType`, `getProductSkus`, `getSortedProductSkusID` and `saveSku`.
 */
export class MysqlSkuRepository implements SkuRepository {
  /**
   * The next available option-group sort order, memoised for the life of this instance.
   *
   * JUDGMENT CALL: this is the only mutable state in this file, deliberately an instance field
   * rather than a module `let`, as `src/services/roundingRuleService.ts` does for its own memo.
   */
  private nextOptionGroupSortOrder: number | undefined;

  /**
   * JUDGMENT CALL: the hydration collaborators are a SECOND parameter defaulting to `{}`, which
   * lets a SQL-shape test construct this class with an executor alone.
   */
  public constructor(
    private readonly executor: PreparedStatementExecutor,
    private readonly auditActor: AuditActorContext,
    private readonly collaborators: SkuHydrationCollaborators = {},
  ) {}

  // The seven port methods.

  // CFML parity [model/service/SkuService.cfc:L285-L287]: the service declares
  // `getTransactionExistsFlag()` with no formal argument and forwards
  // `argumentCollection=arguments` to the DAO.
  /**
   * Whether any transaction record references the SKU, or any SKU of the product.
   *
   * CFML parity [model/dao/SkuDAO.cfc:L59-L63, L87-L91]: the SKU identifier is PREFERRED when both
   * are supplied, and the legacy tests that preference twice with an identical condition - once to
   * choose the predicate and once to choose the parameter struct.
   *
   * @param productID product whose SKUs are tested when no SKU is supplied.
   * @param skuID SKU to test; takes precedence when both arguments are supplied.
   * @returns true when at least one referencing record exists.
   */
  public async getTransactionExistsFlag(productID?: string, skuID?: string): Promise<boolean> {
    const useSkuIdentifier = skuID !== undefined;

    if (!useSkuIdentifier && productID === undefined) {
      throw new SkuColumnError(
        'productID',
        'not supplied, and no skuID was supplied either',
        SELECT_TRANSACTION_EXISTS,
      );
    }

    const keyPredicate = useSkuIdentifier
      ? TRANSACTION_EXISTS_SKU_PREDICATE
      : TRANSACTION_EXISTS_PRODUCT_PREDICATE;

    const boundKey = useSkuIdentifier ? skuID : productID;

    if (boundKey === undefined) {
      throw new SkuColumnError(
        useSkuIdentifier ? 'skuID' : 'productID',
        'not supplied',
        SELECT_TRANSACTION_EXISTS,
      );
    }

    const rows = await this.executor.execute(buildTransactionExistsSql(keyPredicate), [boundKey]);

    const countRow = rows[0];

    if (countRow === undefined) {
      throw new SkuColumnError(
        'skuCount',
        'missing because the aggregate returned no row at all',
        SELECT_TRANSACTION_EXISTS,
      );
    }

    return readCount(countRow, 'skuCount', SELECT_TRANSACTION_EXISTS) !== 0;
  }

  /**
   * Load a SKU by its code or one of its alternate codes.
   *
   * FETCH SHAPE (T3): the shared read shape the header describes.
   *
   * @param skuCode code to match.
   * @returns the SKU, or `undefined` when nothing matches.
   */
  public async getSkuBySkuCode(skuCode: string): Promise<Sku | undefined> {
    const rows = await this.executor.execute(SKU_BY_SKU_CODE_SQL, [skuCode, skuCode]);

    if (rows.length === 0) {
      return undefined;
    }

    if (rows.length > 1) {
      throw new SkuNonUniqueResultError(rows.length);
    }

    const hydrated = await this.hydrateSkus(rows, SELECT_SKU_BY_SKU_CODE, BARE_SKU_FETCH_SHAPE);

    return hydrated[0];
  }

  // [model/dao/SkuDAO.cfc:L107-L128]: the statement text is built by
  // `./sql/skusBySelectedOptions.sql.js` and is deliberately not re-authored here.
  /**
   * SKUs carrying all of the selected options.
   *
   * The empty-list case is real and is not short-circuited away.
   *
   * @param selectedOptions comma-delimited option identifiers that must ALL be present.
   * @param productID optional product to restrict the search to.
   * @returns matching SKUs; an empty array on no match, never `undefined`.
   */
  public async getSkusBySelectedOptions(
    selectedOptions: string,
    productID?: string,
  ): Promise<Sku[]> {
    const statement = buildSkusBySelectedOptionsStatement(selectedOptions, productID);

    const rows = await this.executor.execute(statement.sql, statement.params);

    return this.hydrateSkus(rows, SELECT_SKUS_BY_SELECTED_OPTIONS, BARE_SKU_FETCH_SHAPE);
  }

  // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L133]: `term` is bound unconditionally, while the very next
  // line [model/dao/SkuDAO.cfc:L134] guards its own optional argument with `structKeyExists` and
  // `trim`.
  // Preserved deliberately; do not fix without a product decision.
  /**
   * Search SKUs by code, optionally narrowed to one or more product types.
   *
   * Four sibling asymmetries are preserved deliberately, recorded so that nobody harmonises the
   * two `search*ByProductType` methods.
   *
   * @param term substring matched anywhere in the SKU code.
   * @param productTypeID comma-delimited product types to restrict the search to.
   * @returns matching SKUs; an empty array on no match.
   */
  public async searchSkusByProductType(term?: string, productTypeID?: string): Promise<Sku[]> {
    if (term === undefined) {
      throw new SkuColumnError(
        'term',
        'not supplied, which the legacy binds unconditionally and therefore fails on',
        SEARCH_SKUS_BY_PRODUCT_TYPE,
      );
    }
    const boundValues: SqlParameter[] = [`%${term}%`];

    const applyProductTypeFilter = productTypeID !== undefined && productTypeID.trim() !== '';
    let productTypeIDPlaceholders = '';

    if (applyProductTypeFilter) {
      const productTypeIDElements = listToArray(productTypeID);

      // JUDGMENT CALL: a delimiter-only list binds one empty-string element. The guard above tests
      // the raw string, so `',,'` passes it - `',,'.trim()` is `',,'`, not `''` - and then parses
      // to zero elements.
      const boundElements =
        productTypeIDElements.length > 0 ? productTypeIDElements : [EMPTY_LIST_ELEMENT];

      productTypeIDPlaceholders = sqlPlaceholderList(boundElements.length);
      boundValues.push(...boundElements);
    }

    const rows = await this.executor.execute(
      buildSearchSkusByProductTypeSql(productTypeIDPlaceholders),
      boundValues,
    );
    return this.hydrateSkus(rows, SEARCH_SKUS_BY_PRODUCT_TYPE, BARE_SKU_FETCH_SHAPE);
  }

  // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L150-L168]: the branch on the product's base type has no
  // `else` arm, so the method has five reachable code paths but only four distinct statements.
  // Preserved deliberately; do not fix without a product decision.
  //
  // CFML parity [model/dao/SkuDAO.cfc:L163]: the `WHERE` clause is appended LAST, after whichever
  // fetch fragment was chosen, and {@link buildProductSkusSql} assembles it in that order.
  //
  // CFML parity [model/dao/SkuDAO.cfc:L165]: the call is
  // `ORMExecuteQuery(hql, {...}, false, {ignoreCase="true"})`.
  //
  // CFML parity [model/dao/SkuDAO.cfc:L153]: the branch reads `if(fetchOptions)` - the argument by
  // BARE NAME, relying on CFML's implicit `arguments`-scope fallback - and it is declared
  // `required any` [model/dao/SkuDAO.cfc:L150] rather than `required boolean`.
  /**
   * Every SKU of a product.
   *
   * Fetch shape (T3) - the richest set of decisions in this file, stated per branch.
   *
   * @param product product whose SKUs are loaded.
   * @param fetchOptions when true, eagerly load the children matching the product's base type.
   * @returns the product's SKUs, unordered, with duplicates where the fetch join multiplies rows.
   */
  public async getProductSkus(product: Product, fetchOptions: boolean): Promise<Sku[]> {
    let fetchJoin = NO_FETCH_JOIN;

    if (cfTruthy(fetchOptions)) {
      const baseProductType = await product.getBaseProductType();

      if (cfEquals(baseProductType, 'contentAccess')) {
        fetchJoin = CONTENT_ACCESS_FETCH_JOIN;
      } else if (cfEquals(baseProductType, 'merchandise')) {
        fetchJoin = MERCHANDISE_FETCH_JOIN;
      } else if (cfEquals(baseProductType, 'subscription')) {
        fetchJoin = SUBSCRIPTION_FETCH_JOINS;
      }
      // No `else`. The fifth path lands here and emits the bare statement.
    }

    const rows = await this.executor.execute(buildProductSkusSql(fetchJoin), [
      product.getProductID(),
    ]);

    return this.hydrateSkus(rows, SELECT_PRODUCT_SKUS, {
      product,
      accessContents: fetchJoin === CONTENT_ACCESS_FETCH_JOIN,
      subscriptionBenefits: fetchJoin === SUBSCRIPTION_FETCH_JOINS,
    });
  }

  // Not a port method - the set-based form of getProductSkus

  /**
   * Every SKU of a SET of products, grouped by the branch each product's base type selects.
   *
   * @param products the products whose SKUs are wanted.
   * @param fetchOptions the legacy eager-fetch flag, applied to every product exactly as the
   * singular form applies it to one.
   * @returns each product's SKUs, keyed by the product's case-folded identifier.
   */
  public async getProductSkusForProducts(
    products: readonly Product[],
    fetchOptions: boolean,
  ): Promise<ReadonlyMap<string, Sku[]>> {
    const skusByFoldedProductID = new Map<string, Sku[]>();

    // Grouped by the fetch join each product's own base type selects, keyed by the join text
    // itself so the grouping cannot drift from the branch that produced it.
    const productsByFetchJoin = new Map<string, Product[]>();
    const seenFoldedProductIDs = new Set<string>();

    for (const product of products) {
      const foldedProductID = cfFoldKey(product.getProductID());

      if (seenFoldedProductIDs.has(foldedProductID)) {
        continue;
      }

      seenFoldedProductIDs.add(foldedProductID);

      const fetchJoin = await this.resolveProductSkusFetchJoin(product, fetchOptions);
      const group = productsByFetchJoin.get(fetchJoin);

      if (group === undefined) {
        productsByFetchJoin.set(fetchJoin, [product]);
      } else {
        group.push(product);
      }
    }

    for (const [fetchJoin, group] of productsByFetchJoin) {
      const productsByFoldedID = new Map<string, Product>();
      const productIDs: string[] = [];

      for (const product of group) {
        productsByFoldedID.set(cfFoldKey(product.getProductID()), product);
        productIDs.push(product.getProductID());
      }

      // Chunked under the driver's placeholder limit, exactly as every other identifier list in
      // this adapter is - a set of products large enough to exceed it must not fail one layer
      // down.
      const rows: SqlRow[] = [];

      for (const batch of chunkTupleRows(productIDs)) {
        rows.push(
          ...(await this.executor.execute(
            buildProductSkusForProductsSql(fetchJoin, batch.length),
            batch,
          )),
        );
      }

      const hydrated = await this.hydrateSkus(rows, SELECT_PRODUCT_SKUS, {
        product: undefined,
        productsByFoldedID,
        accessContents: fetchJoin === CONTENT_ACCESS_FETCH_JOIN,
        subscriptionBenefits: fetchJoin === SUBSCRIPTION_FETCH_JOINS,
      });

      for (const sku of hydrated) {
        const owningProductID = sku.getProduct()?.getProductID();

        if (owningProductID === undefined) {
          continue;
        }

        const foldedProductID = cfFoldKey(owningProductID);
        const collection = skusByFoldedProductID.get(foldedProductID);

        if (collection === undefined) {
          skusByFoldedProductID.set(foldedProductID, [sku]);
        } else {
          collection.push(sku);
        }
      }
    }

    return skusByFoldedProductID;
  }

  /**
   * The eager-fetch join one product's base type selects.
   *
   * Extracted verbatim from {@link MysqlSkuRepository.getProductSkus} so the singular and
   * set-based reads cannot drift apart on the one decision that distinguishes their statements.
   *
   * @param product the product whose base type decides the branch.
   * @param fetchOptions the legacy flag; falsy short-circuits to the bare statement.
   */
  private async resolveProductSkusFetchJoin(
    product: Product,
    fetchOptions: boolean,
  ): Promise<string> {
    if (!cfTruthy(fetchOptions)) {
      return NO_FETCH_JOIN;
    }

    const baseProductType = await product.getBaseProductType();

    if (cfEquals(baseProductType, 'contentAccess')) {
      return CONTENT_ACCESS_FETCH_JOIN;
    }

    if (cfEquals(baseProductType, 'merchandise')) {
      return MERCHANDISE_FETCH_JOIN;
    }

    if (cfEquals(baseProductType, 'subscription')) {
      return SUBSCRIPTION_FETCH_JOINS;
    }

    // No `else`. The fifth path lands here and emits the bare statement.
    return NO_FETCH_JOIN;
  }

  // must-preserve behaviour: the option-group positional-weight odometer ordering (B2).
  //
  // CFML parity [model/dao/SkuDAO.cfc:L172-L202]: the statement text is built by
  // `./sql/sortedProductSkus.sql.js` and is deliberately not re-authored here.
  //
  // TODO [model/dao/SkuDAO.cfc:L177]: test to see if this query works with DB's other than MSSQL
  // and MySQL.
  /**
   * SKU identifiers for a product, ordered by option group then option sort order.
   *
   * string-interpolates `#getNextOptionGroupSortOrder()#` at [model/dao/SkuDAO.cfc:L195] and
   * [model/dao/SkuDAO.cfc:L197]; it is a server-derived integer rather than caller input, but E5
   * admits no exception.
   *
   * @param productID product whose SKUs are ordered.
   * @returns SKU identifiers in display order.
   */
  public async getSortedProductSkusID(productID: string): Promise<string[]> {
    const statement = buildSortedProductSkusStatement(
      productID,
      await this.resolveNextOptionGroupSortOrder(),
      STATEMENT_DIALECT,
    );

    const rows = await this.executor.execute(statement.sql, statement.params);

    return rows.map((row) => readIdentifier(row, 'skuID', SELECT_SORTED_PRODUCT_SKU_IDS));
  }

  /**
   * No LEGACY ANTECEDENT on `SkuDAO.cfc`, and that is stated rather than implied: the component
   * declares no save function at all.
   *
   * There is no collection form.
   *
   * @param sku the SKU to persist.
   * @param productID the parent product's persisted identifier, bound in place of the association
   * read.
   * @param executor the statement sink.
   * @returns a new instance reflecting the persisted row.
   */
  public async saveSku(
    sku: Sku,
    // Explicitly defaulted rather than written `productID?: string`, and the reason is observable
    // arity.
    productID: string | undefined = undefined,
    executor: PreparedStatementExecutor = this.executor,
  ): Promise<Sku> {
    return await this.persistSku(sku, productID, executor);
  }

  /**
   * The one write path the public save member funnels through.
   *
   * @param sku the SKU to persist.
   * @param productIDOverride the owning product identifier when the SKU carries none, as during a
   * product-level cascade.
   * @param executor the statement executor to use, so a cascade can join the caller's unit of work.
   * @returns a new instance reflecting the persisted row.
   */
  private async persistSku(
    sku: Sku,
    productIDOverride: string | undefined,
    executor: PreparedStatementExecutor,
  ): Promise<Sku> {
    const auditTimestamp = new Date();

    return await executor.transaction(async (tx): Promise<Sku> => {
      const saved = sku.isNew()
        ? await this.insertSku(sku, auditTimestamp, tx, productIDOverride)
        : await this.updateSku(sku, auditTimestamp, tx, productIDOverride);

      await this.reconcileSkuOptions(saved.getSkuID(), sku, tx);

      return saved;
    });
  }

  /**
   * Rewrites one SKU's `SwSkuOption` membership to match the entity in hand.
   *
   * delete-then-insert, not a computed delta, and the choice is deliberate.
   *
   * An unmaterialised collection is indistinguishable from an empty one here, and that is why the
   * fetch shape matters upstream.
   *
   * @param skuID the identifier written by the scalar statement.
   * @param sku the entity whose option collection is authoritative.
   * @param tx the transaction-bound executor.
   */
  private async reconcileSkuOptions(
    skuID: string,
    sku: Sku,
    tx: PreparedStatementExecutor,
  ): Promise<void> {
    const optionIDs = sku.getOptions().map((option) => option.getOptionID());

    await tx.executeMutation(DELETE_SKU_OPTIONS_SQL, [skuID]);

    if (optionIDs.length === 0) {
      return;
    }
    for (const batch of chunkTupleRows(optionIDs)) {
      const boundValues: SqlParameter[] = [];

      for (const optionID of batch) {
        boundValues.push(skuID, optionID);
      }

      await tx.executeMutation(buildSkuOptionInsertSql(batch.length), boundValues);
    }
  }

  // The single row-to-entity factory for `Sku`: construction, collaborator injection and
  // association materialization happen in exactly one place rather than scattered across query
  // methods.
  //
  // JUDGMENT CALL: the three currency accessors [model/entity/Sku.cfc:L269-L273, L275-L279,
  // L281-L285] are synchronous in the legacy and synchronous in the target, which is why the whole
  // currency detail map is materialized here rather than fetched on demand.
  //
  // JUDGMENT CALL: three of the cascade's inputs do not vary from one sku to the next - the
  // `skuCurrency` setting [model/entity/Sku.cfc:L385], the `skuEligibleCurrencies` setting
  // [model/entity/Sku.cfc:L373, L375] and the eligible-currency listing
  // [model/entity/Sku.cfc:L371] - so `hydrateSkus` resolves them exactly once, through
  // `Sku.resolveCurrencyCascadeContext`.
  /**
   * Builds one `Sku` per distinct row, materialising the associations the fetch shape names.
   *
   * Row multiplication is handled here, once, for all four read paths.
   *
   * @param rows the result rows, in the order the statement returned them.
   * @param statementLabel which statement produced them, for error attribution.
   * @param fetchShape which optional associations to materialise.
   */
  private async hydrateSkus(
    rows: readonly SqlRow[],
    statementLabel: string,
    fetchShape: SkuFetchShape,
  ): Promise<Sku[]> {
    if (rows.length === 0) {
      return [];
    }

    const skuIDs = distinctIdentifiers(rows, 'skuID', statementLabel);

    const currencyRows = await this.executeOverSkuIDBatches(buildSkuCurrenciesSql, skuIDs);
    const optionRows = await this.executeOverSkuIDBatches(buildSkuOptionsSql, skuIDs);

    const currencyRowsBySku = groupRowsByParentIdentifier(
      currencyRows,
      'skuID',
      SELECT_SKU_CURRENCIES,
    );
    const optionRowsBySku = groupRowsByParentIdentifier(
      optionRows,
      SKU_OPTION_LINK_SKU_ID,
      SELECT_SKU_OPTIONS,
    );

    const accessContentRowsBySku = fetchShape.accessContents
      ? groupRowsByParentIdentifier(
          await this.executeOverSkuIDBatches(
            (placeholders) =>
              buildSkuLinkIdentifiersSql(
                ACCESS_CONTENT_LINK.tableName,
                ACCESS_CONTENT_LINK.identifierColumnName,
                placeholders,
              ),
            skuIDs,
          ),
          SKU_OPTION_LINK_SKU_ID,
          SELECT_SKU_ACCESS_CONTENT_IDS,
        )
      : undefined;

    const subscriptionBenefitRowsBySku = fetchShape.subscriptionBenefits
      ? groupRowsByParentIdentifier(
          await this.executeOverSkuIDBatches(
            (placeholders) =>
              buildSkuLinkIdentifiersSql(
                SUBSCRIPTION_BENEFIT_LINK.tableName,
                SUBSCRIPTION_BENEFIT_LINK.identifierColumnName,
                placeholders,
              ),
            skuIDs,
          ),
          SKU_OPTION_LINK_SKU_ID,
          SELECT_SKU_SUBSCRIPTION_BENEFIT_IDS,
        )
      : undefined;

    // The invariant half of the cascade, resolved once for this whole result set.
    //
    // Two settings reads and at most one eligible-currency listing, for every sku built below.
    const cascadeContext =
      this.collaborators.settingsProvider !== undefined &&
      this.collaborators.currencyConverter !== undefined
        ? await Sku.resolveCurrencyCascadeContext(
            this.collaborators.settingsProvider,
            this.collaborators.currencyConverter,
          )
        : undefined;

    const builtSkus: Record<string, Sku> = {};

    for (const row of rows) {
      const skuID = readIdentifier(row, 'skuID', statementLabel);

      if (structGet(builtSkus, skuID) !== undefined) {
        continue;
      }

      const currencies: SkuCurrency[] = [];

      for (const currencyRow of childRowsFor(currencyRowsBySku, skuID)) {
        const skuCurrency = toSkuCurrency(currencyRow, SELECT_SKU_CURRENCIES);

        if (skuCurrency !== undefined) {
          currencies.push(skuCurrency);
        }
      }

      const options = childRowsFor(optionRowsBySku, skuID).map((optionRow) =>
        toOption(optionRow, SELECT_SKU_OPTIONS),
      );

      putOwnStructKey(
        builtSkus,
        skuID,
        await this.buildSku(row, statementLabel, fetchShape, cascadeContext, {
          options,
          skuCurrencies: currencies,
          accessContentIDs:
            accessContentRowsBySku === undefined
              ? undefined
              : distinctIdentifiers(
                  childRowsFor(accessContentRowsBySku, skuID),
                  ACCESS_CONTENT_LINK.identifierColumnName,
                  SELECT_SKU_ACCESS_CONTENT_IDS,
                ),
          subscriptionBenefitIDs:
            subscriptionBenefitRowsBySku === undefined
              ? undefined
              : distinctIdentifiers(
                  childRowsFor(subscriptionBenefitRowsBySku, skuID),
                  SUBSCRIPTION_BENEFIT_LINK.identifierColumnName,
                  SELECT_SKU_SUBSCRIPTION_BENEFIT_IDS,
                ),
        }),
      );
    }

    const hydrated: Sku[] = [];

    for (const row of rows) {
      const skuID = readIdentifier(row, 'skuID', statementLabel);
      const builtSku = structGet(builtSkus, skuID);

      if (builtSku === undefined) {
        throw new SkuColumnError(
          'skuID',
          'not among the identifiers hydrated from this result set',
          statementLabel,
        );
      }

      hydrated.push(builtSku);
    }

    return hydrated;
  }

  /**
   * Runs one association statement over a set of SKU identifiers, in batches, and returns every
   * row the batches produced.
   *
   * What this EXISTS to PREVENT, and it is the whole reason the read ceilings above it could be
   * removed.
   *
   * @param buildSql renders the statement text for a given placeholder list.
   * @param skuIDs the distinct identifiers to fetch for; an empty set issues no statement.
   * @returns every row from every batch, concatenated in batch order.
   */
  private async executeOverSkuIDBatches(
    buildSql: (skuIDPlaceholders: string) => string,
    skuIDs: readonly string[],
  ): Promise<readonly SqlRow[]> {
    // `chunkTupleRows` refuses an empty set rather than yielding zero batches, so the empty case
    // is answered here.
    if (skuIDs.length === 0) {
      return [];
    }

    const collected: SqlRow[] = [];

    for (const batch of chunkTupleRows(skuIDs)) {
      const batchRows = await this.executor.execute(
        buildSql(sqlPlaceholderList(batch.length)),
        batch,
      );

      collected.push(...batchRows);
    }

    return collected;
  }

  /**
   * Builds one `Sku` from its own row plus its already-materialised associations.
   *
   * `isNew` is not SET, so the entity's own default of `false` applies.
   *
   * This instance is injected as the sku's own `skuRepository` collaborator, rule T2 applied to
   * the `getService("skuService")` locator at [model/entity/Sku.cfc:L569].
   */
  private async buildSku(
    row: SqlRow,
    statementLabel: string,
    fetchShape: SkuFetchShape,
    cascadeContext: SkuCurrencyCascadeContext | undefined,
    associations: {
      readonly options: Option[];
      readonly skuCurrencies: SkuCurrency[];
      readonly accessContentIDs: readonly string[] | undefined;
      readonly subscriptionBenefitIDs: readonly string[] | undefined;
    },
  ): Promise<Sku> {
    const draft: SkuHydrationDraft = {
      skuID: readIdentifier(row, 'skuID', statementLabel),
      activeFlag: readFlag(row, 'activeFlag', statementLabel),
      userDefinedPriceFlag: readFlag(row, 'userDefinedPriceFlag', statementLabel),
      options: associations.options,
      skuCurrencies: associations.skuCurrencies,
      skuRepository: this,
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

    const calculatedQATS = readOptionalInteger(row, 'calculatedQATS', statementLabel);
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

    // The owning product, from whichever of the two forms the caller supplied. A singular
    // read was handed the product itself; a set-based read was handed the set, and the row names
    // its owner.
    const owningProduct =
      fetchShape.product ??
      resolveOwningProduct(row, statementLabel, fetchShape.productsByFoldedID);

    if (owningProduct !== undefined) {
      draft.product = owningProduct;
    }

    if (associations.accessContentIDs !== undefined) {
      draft.accessContentIDs = associations.accessContentIDs;
    }

    if (associations.subscriptionBenefitIDs !== undefined) {
      draft.subscriptionBenefitIDs = associations.subscriptionBenefitIDs;
    }

    if (this.collaborators.settingsProvider !== undefined) {
      draft.settingsProvider = this.collaborators.settingsProvider;
    }

    if (this.collaborators.currencyConverter !== undefined) {
      draft.currencyConverter = this.collaborators.currencyConverter;
    }

    if (this.collaborators.priceGroupResolver !== undefined) {
      draft.priceGroupResolver = this.collaborators.priceGroupResolver;
    }

    if (this.collaborators.imageSettingValues !== undefined) {
      draft.imageSettingValues = this.collaborators.imageSettingValues;
    }

    if (this.collaborators.currentAccountContext !== undefined) {
      draft.currentAccountContext = this.collaborators.currentAccountContext;
    }

    const sku = new Sku(draft);

    // `hydrateSkus` resolved once for the whole result set.
    //
    // `Sku.hydrate` is the only way to start the cascade: the computation itself is PRIVATE to the
    // entity, so no caller downstream of this method can reach it and none has to.
    if (cascadeContext !== undefined) {
      return Sku.hydrate(sku, cascadeContext);
    }

    return sku;
  }

  // Private: the option-group place value.

  // LEGACY-NOTE [model/dao/SkuDAO.cfc:L206-L215]: the memo is seeded to 1, then overwritten with
  // `rs.max + 1` whenever `recordCount` is truthy - which it always is, because an aggregate with no
  // `GROUP BY` returns one row, so against an empty table `max` is NULL and `NULL + 1` is an
  // engine-dependent coercion. Recorded, not reproduced, in that empty case: there is no single legacy
  // outcome to reproduce, so the NULL is handled explicitly and the value falls back to
  // [model/dao/SkuDAO.cfc:L206]'s own 1. The populated case is identical to the legacy's.

  // LEGACY-DEFECT [model/dao/SkuDAO.cfc:L222-L226]: `clearNextOptionGroupSortOrder` deletes the memo
  // key only when that key is absent, so the delete is unreachable and the method is dead.
  // Preserved deliberately; do not fix without a product decision.
  //
  // Its unreachable outcome - a memo never invalidated within its scope - holds here because the memo
  // is per-instance and instances are request-scoped, so no such member is declared.
  /**
   * The next available option-group sort order, computed once per instance.
   *
   * This is the place value the odometer's exponent is derived from, and the only consumer is
   * `getSortedProductSkusID`.
   *
   * @returns the highest stored option-group sort order plus one, or 1 when none is stored.
   */
  private async resolveNextOptionGroupSortOrder(): Promise<number> {
    if (this.nextOptionGroupSortOrder !== undefined) {
      return this.nextOptionGroupSortOrder;
    }

    const rows = await this.executor.execute(NEXT_OPTION_GROUP_SORT_ORDER_SQL);
    const aggregateRow = rows[0];

    const highestSortOrder =
      aggregateRow === undefined
        ? undefined
        : readOptionalInteger(aggregateRow, 'max', SELECT_NEXT_OPTION_GROUP_SORT_ORDER);

    this.nextOptionGroupSortOrder = highestSortOrder === undefined ? 1 : highestSortOrder + 1;

    return this.nextOptionGroupSortOrder;
  }

  // Private: the write path.

  /**
   * Inserts one `SwSku` row and returns an entity carrying the minted key.
   *
   * The key is minted by the application, not by the database: [model/entity/Sku.cfc:L52] declares
   * `generator="uuid"`, and `SwSku` has no auto-increment column.
   */
  private async insertSku(
    sku: Sku,
    auditTimestamp: Date,
    tx: PreparedStatementExecutor,
    productIDOverride: string | undefined,
  ): Promise<Sku> {
    const mintedSkuID = mintEntityIdentifier();
    const auditActorAccountID = resolveAuditActorAccountID(this.auditActor);
    const stamps: SkuAuditStamps = {
      createdDateTime: auditTimestamp,
      createdByAccountID: auditActorAccountID,
      modifiedDateTime: auditTimestamp,
      modifiedByAccountID: auditActorAccountID,
      // On an insert there is no stored value to preserve, so the bound value and the resolved
      // value are necessarily the same one.
      resolvedModifiedByAccountID: auditActorAccountID,
    };

    const insertion = await tx.executeMutation(
      INSERT_SKU_SQL,
      bindColumnValues(
        SKU_COLUMNS,
        this.toSkuColumnValues(sku, mintedSkuID, stamps, productIDOverride),
        INSERT_SKU,
      ),
    );

    if (insertion.affectedRows === 0) {
      throw new SkuPersistenceError(
        'The SKU insert reported no inserted row, so the minted key cannot be reported as persisted.',
      );
    }

    return this.rehydrateSavedSku(sku, mintedSkuID, stamps);
  }

  /**
   * Updates one `SwSku` row.
   *
   * The created stamp is neither re-captured NOR bound - an update must not rewrite when a row was
   * created, and the assignment list no longer names the column.
   *
   * Called `saveSku` with a SKU whose `isNew()` was false and whose key named nothing, and the
   * method RESOLVED: it answered an entity carrying the caller's key, no row was written.
   */
  private async updateSku(
    sku: Sku,
    auditTimestamp: Date,
    tx: PreparedStatementExecutor,
    productIDOverride: string | undefined,
  ): Promise<Sku> {
    const skuID = sku.getSkuID();
    const stamps: SkuAuditStamps = {
      createdDateTime: sku.getCreatedDateTime(),
      createdByAccountID: undefined,
      modifiedDateTime: auditTimestamp,
      // Them would re-admit the spoof.
      modifiedByAccountID: resolveAuditActorAccountID(this.auditActor),
      resolvedModifiedByAccountID: resolveStampedModifiedByAccountID(
        this.auditActor,
        sku.getModifiedByAccountID(),
      ),
    };

    const boundValues = bindColumnValues(
      UPDATED_SKU_COLUMNS,
      this.toSkuColumnValues(sku, skuID, stamps, productIDOverride),
      UPDATE_SKU,
    );

    boundValues.push(skuID);

    const update = await tx.executeMutation(UPDATE_SKU_SQL, boundValues);
    if (update.affectedRows === 0) {
      throw new SkuPersistenceError(
        'The SKU update matched no row, so the entity cannot be reported as persisted. The key it ' +
          'carries names no SwSku row: Hibernate raised on an update to a non-existent row rather ' +
          'than reporting success, and reporting success here would hide a lost write.',
      );
    }

    return this.rehydrateSavedSku(sku, skuID, stamps);
  }

  /**
   * The column values for a SKU write, keyed by physical column so the ordered list can project
   * them.
   *
   * E4: the three money columns become DECIMAL STRINGS through `Money.toDecimalString()`, never
   * numbers, so full precision survives the write exactly as it survives the read.
   *
   * Tension with {@link readFlag}: on the READ side the raw value must reach the entity so its
   * declared default can apply, and on the WRITE side the entity has already applied it.
   */
  private toSkuColumnValues(
    sku: Sku,
    skuID: string,
    stamps: SkuAuditStamps,
    productIDOverride: string | undefined,
  ): ColumnValues {
    return {
      skuID,
      activeFlag: sku.getActiveFlag(),
      skuCode: sku.getSkuCode(),
      listPrice: sku.getListPrice().toDecimalString(),
      price: sku.getPrice().toDecimalString(),
      renewalPrice: sku.getRenewalPrice().toDecimalString(),
      imageFile: sku.getImageFile(),
      userDefinedPriceFlag: sku.getUserDefinedPriceFlag(),
      calculatedQATS: sku.getCalculatedQATS(),
      productID: productIDOverride ?? sku.getProduct()?.getProductID(),
      subscriptionTermID: sku.getSubscriptionTermID(),
      remoteID: sku.getRemoteID(),
      createdDateTime: stamps.createdDateTime,
      createdByAccountID: stamps.createdByAccountID,
      modifiedDateTime: stamps.modifiedDateTime,
      modifiedByAccountID: stamps.modifiedByAccountID,
    };
  }

  /**
   * Projects a persisted SKU onto a new instance carrying the key and stamps that were written.
   *
   * A new instance rather than the argument mutated, because `skuID` and the audit fields are
   * `private readonly` on the entity and because the caller's instance was never the row.
   */
  private rehydrateSavedSku(sku: Sku, skuID: string, stamps: SkuAuditStamps): Sku {
    const draft: SkuHydrationDraft = {
      skuID,
      activeFlag: sku.getActiveFlag(),
      userDefinedPriceFlag: sku.getUserDefinedPriceFlag(),
      listPrice: sku.getListPrice(),
      price: sku.getPrice(),
      renewalPrice: sku.getRenewalPrice(),
      options: sku.getOptions(),
      skuCurrencies: sku.getSkuCurrencies(),
      priceGroupRates: sku.getPriceGroupRates(),
      promotionRewards: sku.getPromotionRewards(),
      promotionRewardExclusions: sku.getPromotionRewardExclusions(),
      promotionQualifiers: sku.getPromotionQualifiers(),
      promotionQualifierExclusions: sku.getPromotionQualifierExclusions(),
      alternateSkuCodeIDs: [...sku.getAlternateSkuCodeIDs()],
      stockIDs: [...sku.getStockIDs()],
      accessContentIDs: [...sku.getAccessContentIDs()],
      subscriptionBenefitIDs: [...sku.getSubscriptionBenefitIDs()],
      renewalSubscriptionBenefitIDs: [...sku.getRenewalSubscriptionBenefitIDs()],
      physicalIDs: [...sku.getPhysicalIDs()],
      modifiedDateTime: stamps.modifiedDateTime,
      skuRepository: this,
    };

    const skuCode = sku.getSkuCode();
    if (skuCode !== undefined) {
      draft.skuCode = skuCode;
    }

    const imageFile = sku.getImageFile();
    if (imageFile !== undefined) {
      draft.imageFile = imageFile;
    }

    const calculatedQATS = sku.getCalculatedQATS();
    if (calculatedQATS !== undefined) {
      draft.calculatedQATS = calculatedQATS;
    }

    const subscriptionTermID = sku.getSubscriptionTermID();
    if (subscriptionTermID !== undefined) {
      draft.subscriptionTermID = subscriptionTermID;
    }

    const remoteID = sku.getRemoteID();
    if (remoteID !== undefined) {
      draft.remoteID = remoteID;
    }

    if (stamps.createdDateTime !== undefined) {
      draft.createdDateTime = stamps.createdDateTime;
    }
    if (stamps.createdByAccountID !== undefined) {
      draft.createdByAccountID = stamps.createdByAccountID;
    }

    if (stamps.resolvedModifiedByAccountID !== undefined) {
      draft.modifiedByAccountID = stamps.resolvedModifiedByAccountID;
    }

    const product = sku.getProduct();
    if (product !== undefined) {
      draft.product = product;
    }

    if (this.collaborators.settingsProvider !== undefined) {
      draft.settingsProvider = this.collaborators.settingsProvider;
    }

    if (this.collaborators.currencyConverter !== undefined) {
      draft.currencyConverter = this.collaborators.currencyConverter;
    }

    if (this.collaborators.priceGroupResolver !== undefined) {
      draft.priceGroupResolver = this.collaborators.priceGroupResolver;
    }

    if (this.collaborators.imageSettingValues !== undefined) {
      draft.imageSettingValues = this.collaborators.imageSettingValues;
    }

    if (this.collaborators.currentAccountContext !== undefined) {
      draft.currentAccountContext = this.collaborators.currentAccountContext;
    }

    // The completed per-currency map is carried forward rather than recomputed or dropped.
    //
    // JUDGMENT CALL: a save round-trip in the legacy hands back the same OBJECT, so
    // `variables.currencyDetails` [model/entity/Sku.cfc:L368-L369] survives it untouched - the
    // memo the caller had before the save is the memo it has after.
    const currencyDetails = sku.getCurrencyDetails();
    if (Object.keys(currencyDetails).length > 0) {
      draft.currencyDetails = currencyDetails;
    }

    return new Sku(draft);
  }
}
