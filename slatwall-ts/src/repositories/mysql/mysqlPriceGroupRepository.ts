/**
 * MySQL adapter for the price-group side of the catalog slice. Port of model/dao/PriceGroupDAO.cfc,
 * including the one deliberate read-only reach into subscription-owned tables
 * [model/dao/PriceGroupDAO.cfc:L52-L100].
 *
 * The cascade's own quirks - the parent recursion at [model/service/PriceGroupService.cfc:L174] and
 * the rounding-rule asymmetry at [model/service/PriceGroupService.cfc:L316-L340] - are annotated in
 * `src/services/priceGroupService.ts`, which owns them. This file's only obligation to them is that
 * every association the cascade walks arrives materialized.
 */

import { randomUUID } from 'node:crypto';

import type { PriceGroupRepository } from '../../domain/ports/priceGroupRepository.js';
import { PriceGroup } from '../../domain/entities/priceGroup.js';
import type { PriceGroupRateAmountType } from '../../domain/entities/priceGroupRate.js';
import { PriceGroupRate } from '../../domain/entities/priceGroupRate.js';
import { RoundingRule } from '../../domain/entities/roundingRule.js';
// JUDGMENT CALL: `productType.js`, `product.js` and `sku.js` are imported even though this file's
// subject is the price-group trio.
import { ProductType } from '../../domain/entities/productType.js';
import { Product } from '../../domain/entities/product.js';
import { Sku } from '../../domain/entities/sku.js';
import { Money } from '../../domain/valueObjects/money.js';
import { buildIdPathList } from '../../domain/valueObjects/materializedIdPath.js';
import { listAppend, listToArray } from '../../lib/cfml/list.js';
import { cfEquals, cfFoldKey } from '../../lib/cfml/struct.js';
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import { isNullish } from '../../lib/cfml/truthiness.js';
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
import { ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS } from './sql/accountSubscriptionPriceGroups.sql.js';

// JUDGMENT CALL: the dialect used to BUILD statements is a module constant rather than a read of
// the configured dialect, because `resolveConfiguredDialect()` reaches `src/lib/config.ts` and
// therefore the `DB_*` environment.
const STATEMENT_DIALECT: DatabaseDialect = 'MySQL';

/**
 * Raised when a row does not carry a column this adapter requires, or carries it with a type that
 * cannot be read safely.
 */
class PriceGroupColumnError extends Error {
  public constructor(columnName: string, observedType: string, statementLabel: string) {
    super(
      `Column '${columnName}' from '${statementLabel}' is unusable: observed ${observedType}. The ` +
        `Sw* schema is unchanged by this migration, so a mismatch here indicates a driver or ` +
        `statement problem rather than a data problem.`,
    );
    this.name = 'PriceGroupColumnError';
  }
}

/**
 * Raised when a write reaches the database but the outcome contradicts what the statement
 * promised.
 */
class PriceGroupPersistenceError extends Error {
  public constructor(detail: string, options?: { readonly cause?: unknown }) {
    super(detail, options);
    this.name = 'PriceGroupPersistenceError';
  }
}

/**
 * One price-group row gathered by the collection pass, with the two things the materialization
 * pass needs alongside it.
 *
 * `statementLabel` travels with the row because column-fault attribution names the statement that
 * produced the row, and a seed row and an ancestor row come from different statements.
 */
interface CollectedPriceGroupRow {
  readonly row: SqlRow;
  readonly statementLabel: string;
  readonly parentPriceGroupID: string | undefined;
}

/**
 * Raised when the stored `parentPriceGroupID` pointers form a cycle, so a price group is its own
 * ancestor and there is no ancestry to return.
 */
class PriceGroupCycleError extends Error {
  public constructor(chain: readonly string[], repeatedPriceGroupID: string) {
    super(
      `The parentPriceGroupID pointers form a cycle: ${chain.join(' -> ')} -> ` +
        `${repeatedPriceGroupID}, which repeats an identifier already in that chain. No ancestry can ` +
        `be returned, and returning a truncated chain would silently change which price-group rate ` +
        `the five-level cascade selects.`,
    );
    this.name = 'PriceGroupCycleError';
  }
}

/**
 * The rounding collaborator a hydrated `RoundingRule` requires.
 *
 * JUDGMENT CALL: declared here, module-locally and unexported, and satisfied STRUCTURALLY by
 * whatever the composition root injects.
 */
interface PriceGroupRoundingRuleValueRounder {
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money;
}

/**
 * The clock this adapter reads its one instant from, supplied by the composition root.
 *
 * JUDGMENT CALL: declared module-locally and un-exported, exactly as
 * `PriceGroupRoundingRuleValueRounder` above is, and satisfied STRUCTURALLY by whatever the
 * composition root passes.
 *
 * `Date` is mutable, so the composition root mints a new one from the frozen request epoch on
 * every call rather than handing out one shared instance.
 */
interface PriceGroupRequestClock {
  now(): Date;
}

// One label per statement.
const SELECT_PRICE_GROUP_BY_ID = 'selectPriceGroupByID';
const SELECT_PRICE_GROUPS_BY_ID = 'selectPriceGroupsByID';
const SELECT_CHILD_PRICE_GROUPS = 'selectChildPriceGroupsByParentID';
const SELECT_RATES_BY_PRICE_GROUP = 'selectPriceGroupRatesByPriceGroupID';
const SELECT_RATE_BY_ID = 'selectPriceGroupRateByID';
const SELECT_SUBSCRIPTION_PRICE_GROUP_IDS = 'selectSubscriptionPriceGroupIDs';
const SELECT_ACTIVE_PRICE_GROUPS_BY_ID = 'selectActivePriceGroupsByID';
const INSERT_PRICE_GROUP = 'insertPriceGroup';
const UPDATE_PRICE_GROUP = 'updatePriceGroup';
const INSERT_PRICE_GROUP_RATE = 'insertPriceGroupRate';
const UPDATE_PRICE_GROUP_RATE = 'updatePriceGroupRate';
// The delete statements carry no label: a label attributes a COLUMN READ to the statement that
// produced it, and a delete reads none.

// B5, schema continuity: the `Sw*` schema is unchanged.
const PRICE_GROUP_COLUMNS = Object.freeze([
  'priceGroupID',
  'priceGroupIDPath',
  'activeFlag',
  'priceGroupName',
  'priceGroupCode',
  'parentPriceGroupID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

// The update set list.
const UPDATED_PRICE_GROUP_COLUMNS = Object.freeze(
  PRICE_GROUP_COLUMNS.filter(
    (columnName) =>
      columnName !== 'priceGroupID' &&
      columnName !== 'createdDateTime' &&
      columnName !== 'createdByAccountID',
  ),
);

// [model/entity/PriceGroupRate.cfc:L52-L58, L61-L64, L67-L68] - eleven columns.
const PRICE_GROUP_RATE_COLUMNS = Object.freeze([
  'priceGroupRateID',
  'globalFlag',
  'amount',
  'amountType',
  'remoteID',
  'priceGroupID',
  'roundingRuleID',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

const UPDATED_PRICE_GROUP_RATE_COLUMNS = Object.freeze(
  PRICE_GROUP_RATE_COLUMNS.filter(
    (columnName) =>
      columnName !== 'priceGroupRateID' &&
      columnName !== 'createdDateTime' &&
      columnName !== 'createdByAccountID',
  ),
);

// `model/entity/RoundingRule.cfc` - eight columns, joined onto every rate read.
const ROUNDING_RULE_COLUMNS = Object.freeze([
  'roundingRuleID',
  'roundingRuleName',
  'roundingRuleExpression',
  'roundingRuleDirection',
  'createdDateTime',
  'createdByAccountID',
  'modifiedDateTime',
  'modifiedByAccountID',
]);

// JUDGMENT CALL: the joined rounding-rule columns are ALIASED with a prefix. Four of the eight -
// the audit quartet - collide by name with the rate's own four, and an unaliased join would let
// one silently shadow the other depending on driver ordering.
const ROUNDING_RULE_ALIAS_PREFIX = 'roundingRule_';
/**
 * The four audit values a rate write stamps, plus the fifth that says what the row will HOLD.
 *
 * The created pair has no such split: it is absent from {@link UPDATED_PRICE_GROUP_RATE_COLUMNS}.
 */
interface PriceGroupRateAuditStamps {
  readonly createdDateTime: Date | undefined;
  readonly createdByAccountID: string | undefined;
  readonly modifiedDateTime: Date;
  /**
   * What the statement BINDS for the modifying account: the actor resolution, or `undefined`.
   */
  readonly modifiedByAccountID: string | undefined;
  /**
   * What the ROW will hold for the modifying account once `COALESCE` has resolved the binding.
   */
  readonly resolvedModifiedByAccountID: string | undefined;
}

// The six many-to-many link tables declared on [model/entity/PriceGroupRate.cfc:L71-L77].
interface RateLinkTable {
  readonly tableName: string;
  readonly memberColumn: string;
  readonly statementLabel: string;
}

/**
 * Columns per link row: the owning rate key then the member key
 * [model/entity/PriceGroupRate.cfc:L71-L77].
 */
const RATE_LINK_TUPLE_WIDTH = 2;

const RATE_LINK_TABLES = Object.freeze({
  productTypes: Object.freeze({
    tableName: 'SwPriceGroupRateProductType',
    memberColumn: 'productTypeID',
    statementLabel: 'selectRateProductTypes',
  }),
  products: Object.freeze({
    tableName: 'SwPriceGroupRateProduct',
    memberColumn: 'productID',
    statementLabel: 'selectRateProducts',
  }),
  skus: Object.freeze({
    tableName: 'SwPriceGroupRateSku',
    memberColumn: 'skuID',
    statementLabel: 'selectRateSkus',
  }),
  excludedProductTypes: Object.freeze({
    tableName: 'SwPriceGrpRateExclProductType',
    memberColumn: 'productTypeID',
    statementLabel: 'selectRateExcludedProductTypes',
  }),
  excludedProducts: Object.freeze({
    tableName: 'SwPriceGroupRateExclProduct',
    memberColumn: 'productID',
    statementLabel: 'selectRateExcludedProducts',
  }),
  excludedSkus: Object.freeze({
    tableName: 'SwPriceGroupRateExclSku',
    memberColumn: 'skuID',
    statementLabel: 'selectRateExcludedSkus',
  }),
}) satisfies Readonly<Record<string, RateLinkTable>>;

type RateLinkCollectionName = keyof typeof RATE_LINK_TABLES;

// Enumerated rather than derived from `Object.keys`, so the list is typed without a cast and a
// reader can see all six names in one place.
const RATE_LINK_COLLECTION_NAMES: readonly RateLinkCollectionName[] = Object.freeze([
  'productTypes',
  'products',
  'skus',
  'excludedProductTypes',
  'excludedProducts',
  'excludedSkus',
]);

// E5: every value is a positional `?`. Nothing is interpolated except identifiers this module
// itself owns - table names, column names and placeholder runs - none of which can carry caller
// input.

const PRICE_GROUP_SELECT_LIST = PRICE_GROUP_COLUMNS.map((columnName) => `pg.${columnName}`).join(
  ', ',
);

// No `ORDER BY`, no `LIMIT`: the key is unique. The same restraint applies to every statement in
// this file except the one row-limiting arm the legacy itself carries at
// [model/dao/PriceGroupDAO.cfc:L57].
const SELECT_PRICE_GROUP_BY_ID_SQL = [
  `SELECT ${PRICE_GROUP_SELECT_LIST}`,
  'FROM SwPriceGroup pg',
  'WHERE pg.priceGroupID = ?',
].join('\n');

/**
 * The same read as {@link SELECT_PRICE_GROUP_BY_ID_SQL}, for a set of keys.
 *
 * E5: one positional `?` per identifier, each bound separately.
 *
 * @param identifierCount how many keys the statement will bind.
 */
function buildSelectPriceGroupsByIDSql(identifierCount: number): string {
  return [
    `SELECT ${PRICE_GROUP_SELECT_LIST}`,
    'FROM SwPriceGroup pg',
    `WHERE pg.priceGroupID IN (${new Array<string>(identifierCount).fill('?').join(', ')})`,
  ].join('\n');
}

/**
 * CFML parity [model/service/PriceGroupService.cfc:L463]: this statement exists solely so
 * `getChildPriceGroups()` can answer with the direct children the service's detachment loop reads.
 * No `ORDER BY` - the legacy read an unordered Hibernate collection.
 *
 * @param parentCount how many parent keys the statement binds.
 */
function buildSelectChildPriceGroupsSql(parentCount: number): string {
  return [
    `SELECT ${PRICE_GROUP_SELECT_LIST}`,
    'FROM SwPriceGroup pg',
    `WHERE pg.parentPriceGroupID IN (${sqlPlaceholderList(parentCount)})`,
  ].join('\n');
}

const PRICE_GROUP_RATE_SELECT_LIST = [
  ...PRICE_GROUP_RATE_COLUMNS.map((columnName) => `pgr.${columnName}`),
  ...ROUNDING_RULE_COLUMNS.map(
    (columnName) => `rr.${columnName} AS ${ROUNDING_RULE_ALIAS_PREFIX}${columnName}`,
  ),
].join(', ');

// No `ORDER BY`, matching the single-identifier form it replaces: the legacy read an unordered
// Hibernate collection.
function buildRatesByPriceGroupSql(priceGroupCount: number): string {
  return [
    `SELECT ${PRICE_GROUP_RATE_SELECT_LIST}`,
    'FROM SwPriceGroupRate pgr',
    'LEFT OUTER JOIN SwRoundingRule rr ON pgr.roundingRuleID = rr.roundingRuleID',
    `WHERE pgr.priceGroupID IN (${sqlPlaceholderList(priceGroupCount)})`,
  ].join('\n');
}

const SELECT_RATE_BY_ID_SQL = [
  `SELECT ${PRICE_GROUP_RATE_SELECT_LIST}`,
  'FROM SwPriceGroupRate pgr',
  'LEFT OUTER JOIN SwRoundingRule rr ON pgr.roundingRuleID = rr.roundingRuleID',
  'WHERE pgr.priceGroupRateID = ?',
].join('\n');

const INSERT_PRICE_GROUP_SQL = [
  `INSERT INTO SwPriceGroup (${PRICE_GROUP_COLUMNS.join(', ')})`,
  `VALUES (${sqlPlaceholderList(PRICE_GROUP_COLUMNS.length)})`,
].join('\n');

const UPDATE_PRICE_GROUP_SQL = [
  'UPDATE SwPriceGroup',
  `SET ${UPDATED_PRICE_GROUP_COLUMNS.map((columnName) => sqlUpdateAssignment(columnName)).join(', ')}`,
  'WHERE priceGroupID = ?',
].join('\n');

const INSERT_PRICE_GROUP_RATE_SQL = [
  `INSERT INTO SwPriceGroupRate (${PRICE_GROUP_RATE_COLUMNS.join(', ')})`,
  `VALUES (${sqlPlaceholderList(PRICE_GROUP_RATE_COLUMNS.length)})`,
].join('\n');

const UPDATE_PRICE_GROUP_RATE_SQL = [
  'UPDATE SwPriceGroupRate',
  `SET ${UPDATED_PRICE_GROUP_RATE_COLUMNS.map((columnName) => sqlUpdateAssignment(columnName)).join(', ')}`,
  'WHERE priceGroupRateID = ?',
].join('\n');

const DELETE_RATES_BY_PRICE_GROUP_SQL = 'DELETE FROM SwPriceGroupRate WHERE priceGroupID = ?';

const DELETE_PRICE_GROUP_ROW_SQL = 'DELETE FROM SwPriceGroup WHERE priceGroupID = ?';

/**
 * Persists the child detachment the service performs in memory.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L462-L467]: the service loop calls
 * `removeChildPriceGroup` on every inheriting group, and each call resolves through
 * [model/entity/PriceGroup.cfc:L139] to `removeParentPriceGroup`, which nulls the child's
 * `parentPriceGroup` association.
 *
 * set-based, keyed on the parent, and that is forced rather than chosen.
 */
const DETACH_CHILD_PRICE_GROUPS_SQL = [
  'UPDATE SwPriceGroup',
  'SET parentPriceGroupID = NULL, priceGroupIDPath = priceGroupID, modifiedDateTime = ?, ' +
    `${sqlUpdateAssignment('modifiedByAccountID')}`,
  'WHERE parentPriceGroupID = ?',
].join('\n');

/**
 * One delete gate that reaches a table this slice does not own.
 */
interface PriceGroupDeleteGate {
  readonly propertyName: string;
  readonly tableName: string;
  readonly foreignKeyColumn: string;
}

/**
 * The five delete gates whose collections the ported entity does not carry.
 *
 * CFML parity `model/validation/PriceGroup.json`: the `delete` context sets `maxCollection: 0` on
 * six properties - `appliedOrderItems`, `childPriceGroups`, `accounts`, `subscriptionBenefits`,
 * `subscriptionUsageBenefits` and `promotionRewards`.
 *
 * Substance - stated in the same plan as "no subscription business logic is ported, and the
 * reach-through is documented at the port".
 */
const PRICE_GROUP_DELETE_GATES: readonly PriceGroupDeleteGate[] = Object.freeze([
  // [model/entity/PriceGroup.cfc:L62] one-to-many, fkcolumn `appliedPriceGroupID`; the far side is
  // [model/entity/OrderItem.cfc:L60], whose table is `SwOrderItem`
  // [model/entity/OrderItem.cfc:L49].
  Object.freeze({
    propertyName: 'appliedOrderItems',
    tableName: 'SwOrderItem',
    foreignKeyColumn: 'appliedPriceGroupID',
  }),
  // [model/entity/PriceGroup.cfc:L67] many-to-many, linktable `SwAccountPriceGroup`.
  Object.freeze({
    propertyName: 'accounts',
    tableName: 'SwAccountPriceGroup',
    foreignKeyColumn: 'priceGroupID',
  }),
  // [model/entity/PriceGroup.cfc:L68] many-to-many, linktable `SwSubsBenefitPriceGroup`.
  Object.freeze({
    propertyName: 'subscriptionBenefits',
    tableName: 'SwSubsBenefitPriceGroup',
    foreignKeyColumn: 'priceGroupID',
  }),
  // [model/entity/PriceGroup.cfc:L69] many-to-many, linktable `SwSubsUsageBenefitPriceGroup` - the
  // same table stage one of the reach-through reads, and still never written.
  Object.freeze({
    propertyName: 'subscriptionUsageBenefits',
    tableName: 'SwSubsUsageBenefitPriceGroup',
    foreignKeyColumn: 'priceGroupID',
  }),
  // [model/entity/PriceGroup.cfc:L70] many-to-many, linktable `SwPromoRewardEligiblePriceGrp`.
  Object.freeze({
    propertyName: 'promotionRewards',
    tableName: 'SwPromoRewardEligiblePriceGrp',
    foreignKeyColumn: 'priceGroupID',
  }),
]);

/**
 * The existence probe for one delete gate.
 *
 * JUDGMENT CALL: `SELECT 1... LIMIT 1`, and the `LIMIT` is not a breach of this file's standing
 * restraint against row-limiting clauses the legacy lacks.
 *
 * No `COUNT(*)` either, for the same reason in reverse: a count would read every matching row to
 * produce a number this method compares against zero and then discards.
 */
function buildDeleteGateProbeSql(gate: PriceGroupDeleteGate): string {
  return [
    'SELECT 1',
    `FROM ${gate.tableName}`,
    `WHERE ${gate.foreignKeyColumn} = ?`,
    'LIMIT 1',
  ].join('\n');
}

/**
 * The link-row read for one collection across a set of rates.
 */
function buildRateLinkSelectSql(linkTable: RateLinkTable, rateCount: number): string {
  return [
    `SELECT priceGroupRateID, ${linkTable.memberColumn}`,
    `FROM ${linkTable.tableName}`,
    `WHERE priceGroupRateID IN (${sqlPlaceholderList(rateCount)})`,
  ].join('\n');
}

/**
 * The link-row delete for one collection, scoped by owning price group.
 *
 * JUDGMENT CALL: scoped by a subquery on `SwPriceGroupRate` rather than by an `IN` list of
 * whichever rate identifiers the caller materialized.
 */
function buildRateLinkDeleteSql(linkTable: RateLinkTable): string {
  return [
    `DELETE FROM ${linkTable.tableName}`,
    'WHERE priceGroupRateID IN (SELECT priceGroupRateID FROM SwPriceGroupRate WHERE priceGroupID = ?)',
  ].join('\n');
}

/**
 * The link-row delete for one collection, scoped to a SINGLE rate.
 *
 * Distinct from `buildRateLinkDeleteSql` above, which is scoped by owning PRICE GROUP and serves
 * the delete cascade.
 */
function buildRateLinkDeleteByRateSql(linkTable: RateLinkTable): string {
  return [`DELETE FROM ${linkTable.tableName}`, 'WHERE priceGroupRateID = ?'].join('\n');
}

/**
 * A `switch` over the closed collection union rather than a lookup table of accessor callbacks:
 * the six accessors return six different element types, each with its own key method.
 *
 * Nothing is filtered out either - in particular a member carrying `''` is returned rather than
 * dropped, so the caller can refuse it.
 */
function readRateLinkMemberIDs(
  priceGroupRate: PriceGroupRate,
  collectionName: RateLinkCollectionName,
): readonly string[] {
  switch (collectionName) {
    case 'productTypes':
      return priceGroupRate
        .getProductTypes()
        .map((productType: ProductType) => productType.getProductTypeID());
    case 'products':
      return priceGroupRate.getProducts().map((product: Product) => product.getProductID());
    case 'skus':
      return priceGroupRate.getSkus().map((sku: Sku) => sku.getSkuID());
    case 'excludedProductTypes':
      return priceGroupRate
        .getExcludedProductTypes()
        .map((productType: ProductType) => productType.getProductTypeID());
    case 'excludedProducts':
      return priceGroupRate.getExcludedProducts().map((product: Product) => product.getProductID());
    case 'excludedSkus':
      return priceGroupRate.getExcludedSkus().map((sku: Sku) => sku.getSkuID());
  }
}

/**
 * The link-row insert for one collection on one rate, as a single multi-row statement.
 *
 * One statement per collection rather than one per member, so a rate covering twenty products
 * emits the same two statements for its `products` collection as a rate covering one.
 *
 * @param linkTable the collection's physical table and member column.
 * @param memberCount how many members are being written.
 */
function buildRateLinkInsertSql(linkTable: RateLinkTable, memberCount: number): string {
  try {
    return [
      `INSERT INTO ${linkTable.tableName} (priceGroupRateID, ${linkTable.memberColumn})`,
      `VALUES ${sqlTuplePlaceholderList(RATE_LINK_TUPLE_WIDTH, memberCount)}`,
    ].join('\n');
  } catch (cause) {
    throw new PriceGroupPersistenceError(
      `A link-row insert into ${linkTable.tableName} was built for ${String(memberCount)} members, ` +
        'which is not a shape a multi-row VALUES body can take. An insert with no rows is not a ' +
        'statement, and a batch beyond the ceiling must be chunked, so the caller must do one or the ' +
        'other instead of asking for this SQL.',
      { cause },
    );
  }
}

// CFML parity [model/dao/PriceGroupDAO.cfc:L59, L93]: CFML identifiers are CASE-INSENSITIVE and a
// query column is reachable under any casing, while TypeScript object keys are case-SENSITIVE.

/**
 * Case-folds a column name for comparison.
 */
function foldIdentifier(identifier: string): string {
  return identifier.toLowerCase();
}

/**
 * The outcome of a column lookup, with "absent" and "present but null" kept apart.
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

/**
 * Names a value's JavaScript type for an error message, without ever including the value itself.
 */
function describeColumnType(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (value instanceof Date) {
    return 'Date';
  }

  if (value instanceof Uint8Array) {
    return 'Uint8Array';
  }

  return typeof value;
}

function requireColumn(row: SqlRow, columnName: string, statementLabel: string): unknown {
  const lookup = findColumn(row, columnName);

  if (!lookup.found) {
    throw new PriceGroupColumnError(columnName, 'absent', statementLabel);
  }

  return lookup.value;
}

/**
 * Reads a non-null identifier column. Every key in this slice is `generator="uuid"` over a
 * 32-character varchar [model/entity/PriceGroup.cfc:L52], so a key always arrives as a string.
 */
function readIdentifier(row: SqlRow, columnName: string, statementLabel: string): string {
  const value = requireColumn(row, columnName, statementLabel);

  if (typeof value !== 'string') {
    throw new PriceGroupColumnError(columnName, describeColumnType(value), statementLabel);
  }

  return value;
}

/**
 * Reads a nullable text column, mapping SQL NULL to `undefined`.
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
    throw new PriceGroupColumnError(columnName, describeColumnType(value), statementLabel);
  }

  return value;
}

/**
 * Reads a nullable timestamp column.
 */
function readTimestamp(row: SqlRow, columnName: string, statementLabel: string): Date | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (!(value instanceof Date)) {
    throw new PriceGroupColumnError(columnName, describeColumnType(value), statementLabel);
  }

  return value;
}

/**
 * Reads a boolean column and hands it on UNCOERCED.
 *
 * JUDGMENT CALL: the single coercion funnel for every boolean in this slice is `cfBoolean()` and
 * it runs in the ENTITY.
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

  throw new PriceGroupColumnError(columnName, describeColumnType(value), statementLabel);
}

/**
 * Reads a `big_decimal` money column.
 *
 * E4: the value is read as a STRING and handed to `Money.fromDecimalString`.
 */
function readMoney(row: SqlRow, columnName: string, statementLabel: string): Money | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new PriceGroupColumnError(columnName, describeColumnType(value), statementLabel);
  }

  return Money.fromDecimalString(value);
}

/**
 * Reads the `amountType` discriminator.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L316-L340]: the legacy `switch` has three cases
 * and no `default`, so a column holding anything else falls through and leaves the seeded
 * passthrough price in place.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L316]: the match folds case. A CFML `switch` on
 * a string is case-INSENSITIVE, so `'PercentageOff'` reaches `case "percentageOff"` in the legacy
 * engine.
 */
function readAmountType(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): PriceGroupRateAmountType | undefined {
  const value = readOptionalText(row, columnName, statementLabel);

  if (value === undefined) {
    return undefined;
  }

  if (
    cfEquals(value, 'percentageOff') ||
    cfEquals(value, 'amountOff') ||
    cfEquals(value, 'amount')
  ) {
    return value as PriceGroupRateAmountType;
  }

  return undefined;
}

/**
 * Narrows a value this adapter is about to bind.
 */
function toBindableValue(value: string | number | boolean | Date | undefined): SqlParameter {
  return value === undefined ? null : value;
}

/**
 * The six link collections of one rate, as identifier lists.
 */
type RateLinkMembership = Readonly<Record<RateLinkCollectionName, readonly string[]>>;

const EMPTY_RATE_LINK_MEMBERSHIP: RateLinkMembership = Object.freeze({
  productTypes: Object.freeze([]),
  products: Object.freeze([]),
  skus: Object.freeze([]),
  excludedProductTypes: Object.freeze([]),
  excludedProducts: Object.freeze([]),
  excludedSkus: Object.freeze([]),
});

/**
 * Identity-only link hydration.
 *
 * JUDGMENT CALL: the six link collections on a rate are materialized as instances carrying their
 * PRIMARY KEY and nothing else, because what reads them needs nothing else: `hasProductType`,
 * `hasProduct` and `hasSku` on `src/domain/entities/priceGroupRate.ts` compare by primary key
 * only.
 */
function toIdentityProductType(productTypeID: string): ProductType {
  return new ProductType({ productTypeID });
}

function toIdentityProduct(productID: string): Product {
  return new Product({ productID });
}

function toIdentitySku(skuID: string): Sku {
  return new Sku({ skuID });
}

/**
 * CFML parity `model/entity/RoundingRule.cfc`: `roundingRuleExpression` is a plain
 * `ormtype="string"` with no format constraint, so it is handed through EXACTLY as stored - not
 * validated, not normalised, not rejected when malformed.
 */
function toRoundingRule(
  row: SqlRow,
  statementLabel: string,
  valueRounder: PriceGroupRoundingRuleValueRounder,
): RoundingRule | undefined {
  const roundingRuleID = readOptionalText(
    row,
    `${ROUNDING_RULE_ALIAS_PREFIX}roundingRuleID`,
    statementLabel,
  );

  if (roundingRuleID === undefined) {
    return undefined;
  }

  return new RoundingRule(
    {
      roundingRuleID,
      roundingRuleName: readOptionalText(
        row,
        `${ROUNDING_RULE_ALIAS_PREFIX}roundingRuleName`,
        statementLabel,
      ),
      roundingRuleExpression: readOptionalText(
        row,
        `${ROUNDING_RULE_ALIAS_PREFIX}roundingRuleExpression`,
        statementLabel,
      ),
      roundingRuleDirection: readOptionalText(
        row,
        `${ROUNDING_RULE_ALIAS_PREFIX}roundingRuleDirection`,
        statementLabel,
      ),
      createdDateTime: readTimestamp(
        row,
        `${ROUNDING_RULE_ALIAS_PREFIX}createdDateTime`,
        statementLabel,
      ),
      createdByAccountID: readOptionalText(
        row,
        `${ROUNDING_RULE_ALIAS_PREFIX}createdByAccountID`,
        statementLabel,
      ),
      modifiedDateTime: readTimestamp(
        row,
        `${ROUNDING_RULE_ALIAS_PREFIX}modifiedDateTime`,
        statementLabel,
      ),
      modifiedByAccountID: readOptionalText(
        row,
        `${ROUNDING_RULE_ALIAS_PREFIX}modifiedByAccountID`,
        statementLabel,
      ),
      // The rule's own inverse collection of rates is not materialized: it is the inverse side of
      // the association this read arrived through.
      priceGroupRates: [],
    },
    valueRounder,
  );
}

/**
 * The one row-to-entity factory for `PriceGroupRate`.
 *
 * LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L75-L77]: `excludedProductTypes`,
 * `excludedProducts` and `excludedSkus` are declared, persisted, reported by `getAppliesTo()`.
 * Preserved deliberately; do not fix without a product decision.
 */
function toPriceGroupRate(
  row: SqlRow,
  statementLabel: string,
  membership: RateLinkMembership,
  priceGroup: PriceGroup | undefined,
  valueRounder: PriceGroupRoundingRuleValueRounder,
): PriceGroupRate {
  return new PriceGroupRate({
    priceGroupRateID: readIdentifier(row, 'priceGroupRateID', statementLabel),
    // Uncoerced; the entity's `getGlobalFlag()` applies `cfBoolean()`.
    // [model/entity/PriceGroup.cfc:L53] defaults it to `"false"`.
    globalFlag: readFlag(row, 'globalFlag', statementLabel),
    // [model/entity/PriceGroup.cfc:L54] no default: a NULL amount stays absent. Never
    // `Money.zero`.
    amount: readMoney(row, 'amount', statementLabel),
    amountType: readAmountType(row, 'amountType', statementLabel),
    remoteID: readOptionalText(row, 'remoteID', statementLabel),
    createdDateTime: readTimestamp(row, 'createdDateTime', statementLabel),
    createdByAccountID: readOptionalText(row, 'createdByAccountID', statementLabel),
    modifiedDateTime: readTimestamp(row, 'modifiedDateTime', statementLabel),
    modifiedByAccountID: readOptionalText(row, 'modifiedByAccountID', statementLabel),
    priceGroup,
    roundingRule: toRoundingRule(row, statementLabel, valueRounder),
    productTypes: membership.productTypes.map(toIdentityProductType),
    products: membership.products.map(toIdentityProduct),
    skus: membership.skus.map(toIdentitySku),
    excludedProductTypes: membership.excludedProductTypes.map(toIdentityProductType),
    excludedProducts: membership.excludedProducts.map(toIdentityProduct),
    excludedSkus: membership.excludedSkus.map(toIdentitySku),
  });
}

/**
 * The one row-to-entity factory for `PriceGroup`.
 *
 * Pure: it takes the associations already materialized and assembles the entity, which is what
 * lets all three read paths share one shape.
 */
function toPriceGroup(
  row: SqlRow,
  statementLabel: string,
  associations: {
    readonly parentPriceGroup: PriceGroup | undefined;
    readonly childPriceGroups: PriceGroup[];
    readonly priceGroupRates: PriceGroupRate[];
  },
): PriceGroup {
  return new PriceGroup({
    priceGroupID: readIdentifier(row, 'priceGroupID', statementLabel),
    // The STORED path, verbatim including the empty string.
    priceGroupIDPath: readOptionalText(row, 'priceGroupIDPath', statementLabel),
    // Uncoerced; `getActiveFlag()` applies `cfBoolean()`. [model/entity/PriceGroup.cfc:L54]
    // declares no default, so a NULL is reachable and must reach the entity as absent rather than
    // as `false`.
    activeFlag: readFlag(row, 'activeFlag', statementLabel),
    priceGroupName: readOptionalText(row, 'priceGroupName', statementLabel),
    priceGroupCode: readOptionalText(row, 'priceGroupCode', statementLabel),
    parentPriceGroup: associations.parentPriceGroup,
    childPriceGroups: associations.childPriceGroups,
    priceGroupRates: associations.priceGroupRates,
    // The inverse side of `SwPromoRewardEligiblePriceGrp` [model/entity/PriceGroup.cfc:L70]. Owned
    // by the promotion adapter and read by nothing in the price-group cascade.
    promotionRewards: [],
    createdDateTime: readTimestamp(row, 'createdDateTime', statementLabel),
    createdByAccountID: readOptionalText(row, 'createdByAccountID', statementLabel),
    modifiedDateTime: readTimestamp(row, 'modifiedDateTime', statementLabel),
    modifiedByAccountID: readOptionalText(row, 'modifiedByAccountID', statementLabel),
    // `parentPriceGroupOptionCandidates` is omitted: it backs an admin dropdown
    // [model/entity/PriceGroup.cfc:L79, L94-L103], `admin/**` is out of scope.
  });
}

/**
 * The values one statement binds, keyed by physical column name.
 */
type ColumnValues = Readonly<Record<string, string | number | boolean | Date | undefined>>;

/**
 * Projects a column-value map onto an ordered column list, producing the bound-parameter array.
 * The ordered list is the same constant the SQL text was built from, so the ordering exists in
 * exactly one place.
 */
function bindColumnValues(
  columnNames: readonly string[],
  values: ColumnValues,
  statementLabel: string,
): SqlParameter[] {
  return columnNames.map((columnName) => {
    if (!Object.prototype.hasOwnProperty.call(values, columnName)) {
      throw new PriceGroupPersistenceError(
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
 *
 * B5: every in-scope entity declares `generator="uuid"` over a 32-character varchar
 * [model/entity/PriceGroup.cfc:L52, model/entity/PriceGroupRate.cfc:L52], and the CFML engine's
 * `uuid` generator produced an unhyphenated hex string of exactly that width.
 */
function mintEntityIdentifier(): string {
  return randomUUID().replaceAll('-', '');
}

/**
 * Projects a previously persisted price group onto the raw property bag `preUpdate` declares.
 *
 * The legacy hook receives `struct oldData` - the ORM's pre-update property struct, not a hydrated
 * entity.
 */
function toPriorStatePropertyBag(priorState: PriceGroup): Readonly<Record<string, unknown>> {
  return Object.freeze({
    priceGroupID: priorState.getPriceGroupID(),
    priceGroupIDPath: priorState.getPriceGroupIDPath(),
    activeFlag: priorState.getActiveFlag(),
    priceGroupName: priorState.getPriceGroupName(),
    priceGroupCode: priorState.getPriceGroupCode(),
    parentPriceGroupID: priorState.getParentPriceGroup()?.getPriceGroupID(),
    createdDateTime: priorState.getCreatedDateTime(),
    createdByAccountID: priorState.getCreatedByAccountID(),
    modifiedDateTime: priorState.getModifiedDateTime(),
    modifiedByAccountID: priorState.getModifiedByAccountID(),
  });
}

/**
 * Composes the materialized path for a price group being inserted for the first time.
 *
 * JUDGMENT CALL: this is the one route where the repository composes the path itself instead of
 * calling the entity's hook, and the reason is ordering.
 */
function composeInsertedPriceGroupIDPath(
  parentPriceGroup: PriceGroup | undefined,
  mintedPriceGroupID: string,
): string {
  const ancestorIDPath =
    parentPriceGroup === undefined
      ? ''
      : buildIdPathList<PriceGroup>(
          parentPriceGroup,
          (node) => node.getPriceGroupID(),
          (node) => node.getParentPriceGroup(),
        );

  return listAppend(ancestorIDPath, mintedPriceGroupID);
}

/**
 * The mutable accumulator the link reads fill, before it is handed to the rate factory.
 */
interface MutableRateLinkMembership {
  productTypes: string[];
  products: string[];
  skus: string[];
  excludedProductTypes: string[];
  excludedProducts: string[];
  excludedSkus: string[];
}

function createMutableRateLinkMembership(): MutableRateLinkMembership {
  return {
    productTypes: [],
    products: [],
    skus: [],
    excludedProductTypes: [],
    excludedProducts: [],
    excludedSkus: [],
  };
}

/**
 * The MySQL implementation of the price-group repository port.
 */
export class MySqlPriceGroupRepository implements PriceGroupRepository {
  /**
   * JUDGMENT CALL: both collaborators arrive as CONSTRUCTOR PARAMETERS, and the executor in
   * particular is never reached as a module singleton.
   *
   * The target is request-scoped and the pool inside `connection.ts` is the only sanctioned
   * module-scope state anywhere.
   *
   * The clock is a required parameter, not an optional one.
   */
  public constructor(
    private readonly executor: PreparedStatementExecutor,
    private readonly auditActor: AuditActorContext,
    private readonly valueRounder: PriceGroupRoundingRuleValueRounder,
    private readonly requestClock: PriceGroupRequestClock,
  ) {}

  /**
   * The one deliberate data-layer exception in this migration.
   *
   * Ported from [model/dao/PriceGroupDAO.cfc:L52-L100], the single function in that component.
   *
   * JUDGMENT CALL: the read-only subscription reach-through.
   */
  public async getAccountSubscriptionPriceGroups(accountID: string): Promise<PriceGroup[]> {
    // JUDGMENT CALL: one captured timestamp. The legacy calls `now()` twice per arm, at
    // [model/dao/PriceGroupDAO.cfc:L65, L70] in the MySQL arm and at
    // [model/dao/PriceGroupDAO.cfc:L81, L86] in the `<cfelse>` arm, and `now()` is CFML
    // server-local time.
    const capturedNow = this.requestClock.now();

    // CFML parity [model/dao/PriceGroupDAO.cfc:L57]: the dialect branch selects `LIMIT 1` on the
    // MySQL arm and `TOP 1` elsewhere, so the emitted `ORDER BY changeDateTime DESC LIMIT 1` at
    // [model/entity/PriceGroup.cfc:L71] is legacy behaviour being reproduced, not a limit
    // introduced here.
    const candidateStatement =
      ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildSubscriptionPriceGroupIDsStatement({
        accountID,
        now: capturedNow,
        dialect: STATEMENT_DIALECT,
      });

    const candidateRows = await this.executor.execute(
      candidateStatement.sql,
      candidateStatement.params,
    );

    const candidatePriceGroupIDs = candidateRows.map((row) =>
      readIdentifier(row, 'priceGroupID', SELECT_SUBSCRIPTION_PRICE_GROUP_IDS),
    );

    // CFML parity [model/dao/PriceGroupDAO.cfc:L92, L98]: `<cfif getpg.recordCount>` guards stage
    // two and `<cfreturn [] />` is the fall-through, reproduced as an EARLY RETURN before any
    // stage-two statement is issued - which mechanically also stops an `IN ()` with zero
    // placeholders, a MySQL syntax error.
    if (candidatePriceGroupIDs.length === 0) {
      return [];
    }

    // Stage two.
    // CFML parity [model/dao/PriceGroupDAO.cfc:L93, L95]: the HQL string is assigned at L93 and
    // the `ormExecuteQuery` call carrying `listToArray(...)` and the numeric `activeFlag=1` is at
    // L95.
    const activePriceGroupStatement =
      ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildActivePriceGroupsByIDStatement({
        priceGroupIDs: candidatePriceGroupIDs,
      });

    const priceGroupRows = await this.executor.execute(
      activePriceGroupStatement.sql,
      activePriceGroupStatement.params,
    );

    // Subscription-owned price groups routinely inherit from a common parent - a price-group
    // hierarchy is what the `parentPriceGroupID` pointer exists for - and hydrating row by row
    // hands back a SEPARATE parent object per result.
    return this.hydrateCascadeReadyPriceGroups(
      priceGroupRows,
      SELECT_ACTIVE_PRICE_GROUPS_BY_ID,
      true,
    );
  }

  /**
   * Loads one price group, materialized so the five-level cascade can run against it.
   *
   * `undefined` on A MISS, never a zero-value stand-in and never an empty placeholder entity: a
   * stand-in price group would carry no rates and a caller would price against it instead of
   * failing.
   */
  public async getPriceGroup(priceGroupID: string): Promise<PriceGroup | undefined> {
    const priceGroupRow = await this.readPriceGroupRow(priceGroupID);

    if (priceGroupRow === undefined) {
      return undefined;
    }

    return this.hydrateCascadeReadyPriceGroup(priceGroupRow, SELECT_PRICE_GROUP_BY_ID, true);
  }

  /**
   * Loads a SET of price groups by key, in one seed statement, keyed by case-folded identifier.
   *
   * This is not a seventh port method, and that is deliberate.
   *
   * `src/handlers/bootstrap.ts` resolved an account's price-group association, the price-group
   * page, and the price groups named by pass one's intents by awaiting one `getPriceGroup` per
   * identifier.
   *
   * @param priceGroupIDs the keys to load, in whatever order and with whatever repetition the
   * caller holds them.
   */
  public async getPriceGroupsByID(
    priceGroupIDs: readonly string[],
  ): Promise<ReadonlyMap<string, PriceGroup>> {
    // De-duplicated by FOLDED key while BINDING the first spelling seen.
    const requestedPriceGroupIDs: string[] = [];
    const seenFoldedIDs = new Set<string>();

    for (const priceGroupID of priceGroupIDs) {
      const foldedPriceGroupID = foldIdentifier(priceGroupID);

      if (seenFoldedIDs.has(foldedPriceGroupID)) {
        continue;
      }

      seenFoldedIDs.add(foldedPriceGroupID);
      requestedPriceGroupIDs.push(priceGroupID);
    }

    if (requestedPriceGroupIDs.length === 0) {
      return new Map<string, PriceGroup>();
    }

    const seedRows = await this.executor.execute(
      buildSelectPriceGroupsByIDSql(requestedPriceGroupIDs.length),
      requestedPriceGroupIDs,
    );

    const hydrated = await this.hydrateCascadeReadyPriceGroups(
      seedRows,
      SELECT_PRICE_GROUPS_BY_ID,
      // No direct children: none of this method's three consumers reads them. See the fetch-shape
      // paragraph above, which names each one and what it does read.
      false,
    );

    const priceGroupsByFoldedID = new Map<string, PriceGroup>();

    for (const priceGroup of hydrated) {
      priceGroupsByFoldedID.set(foldIdentifier(priceGroup.getPriceGroupID()), priceGroup);
    }

    return priceGroupsByFoldedID;
  }

  /**
   * Loads one price-group rate.
   *
   * One CONSEQUENCE A READER must KNOW: because the owning price group is itself materialized with
   * its rates, one stored rate row can yield two instances in one call.
   */
  public async getPriceGroupRate(priceGroupRateID: string): Promise<PriceGroupRate | undefined> {
    const rateRows = await this.executor.execute(SELECT_RATE_BY_ID_SQL, [priceGroupRateID]);
    const rateRow = rateRows.at(0);

    if (rateRow === undefined) {
      return undefined;
    }

    // Read back from the row rather than reusing the argument, so the membership lookup is keyed
    // on the identifier the database actually returned.
    const storedPriceGroupRateID = readIdentifier(rateRow, 'priceGroupRateID', SELECT_RATE_BY_ID);

    const membershipByRateID = await this.loadRateLinkMembership([storedPriceGroupRateID]);

    const owningPriceGroupID = readOptionalText(rateRow, 'priceGroupID', SELECT_RATE_BY_ID);
    const owningPriceGroup =
      owningPriceGroupID === undefined || owningPriceGroupID === ''
        ? undefined
        : await this.getPriceGroup(owningPriceGroupID);

    return toPriceGroupRate(
      rateRow,
      SELECT_RATE_BY_ID,
      membershipByRateID.get(cfFoldKey(storedPriceGroupRateID)) ?? EMPTY_RATE_LINK_MEMBERSHIP,
      owningPriceGroup,
      this.valueRounder,
    );
  }

  /**
   * Persists a price group, with explicit `priceGroupIDPath` maintenance.
   *
   * CFML parity [model/entity/PriceGroup.cfc:L206, L211]: the legacy maintained the materialized
   * path in two ORM lifecycle hooks, `preInsert` and `preUpdate`, which Hibernate fired.
   *
   * Ordering is mandated by the entity, not chosen here: `PriceGroup` assigns its path and calls
   * `super` afterwards [model/entity/PriceGroup.cfc:L207-L208].
   */
  public async savePriceGroup(
    priceGroup: PriceGroup,
    priorState?: PriceGroup,
  ): Promise<PriceGroup> {
    // One captured instant per save, written to every stamped column, exactly as
    // [org/Hibachi/HibachiEntity.cfc:L609] and `model/entity/PriceGroup.cfc` each take one `now()`
    // per hook.
    const auditTimestamp = new Date();

    if (priceGroup.isNew()) {
      if (priorState !== undefined) {
        throw new PriceGroupPersistenceError(
          'savePriceGroup received a prior state for a price group that has never been persisted. ' +
            'The port declares prior state as absent on an insert, so this combination indicates the ' +
            'caller routed a first insert down the update path.',
        );
      }

      return this.insertPriceGroup(priceGroup, auditTimestamp);
    }

    return this.updatePriceGroup(priceGroup, priorState, auditTimestamp);
  }

  /**
   * Persists a price-group rate.
   *
   * many-to-many associations at [model/entity/PriceGroupRate.cfc:L71-L77] are declared without
   * `inverse="true"`, which makes this rate the OWNING side of every one of them.
   *
   * The DECISION of which members a rate should carry stays entirely at the service tier; only the
   * STORAGE of whatever it carries by the time it arrives here belongs to this adapter.
   */
  public async savePriceGroupRate(
    priceGroupRate: PriceGroupRate,
    reconciledSiblings?: readonly PriceGroupRate[],
  ): Promise<PriceGroupRate> {
    const auditTimestamp = new Date();
    return await this.executor.transaction(async (tx): Promise<PriceGroupRate> => {
      const saved = await this.writePriceGroupRate(priceGroupRate, auditTimestamp, tx);

      // Sequential, not concurrent.
      for (const sibling of reconciledSiblings ?? []) {
        await this.writePriceGroupRate(sibling, auditTimestamp, tx);
      }

      return saved;
    });
  }

  /**
   * Writes one rate - scalar columns and all six link collections - on an already-open
   * transaction.
   *
   * @param priceGroupRate the rate to persist.
   * @param auditTimestamp the one captured instant shared by every row in this unit of work.
   * @param tx the transaction-bound executor; reaching past it would escape the transaction.
   * @returns the persisted rate, carrying its written identifier and audit stamps.
   */
  private async writePriceGroupRate(
    priceGroupRate: PriceGroupRate,
    auditTimestamp: Date,
    tx: PreparedStatementExecutor,
  ): Promise<PriceGroupRate> {
    const saved = priceGroupRate.isNew()
      ? await this.insertPriceGroupRate(priceGroupRate, auditTimestamp, tx)
      : await this.updatePriceGroupRate(priceGroupRate, auditTimestamp, tx);

    // Keyed on the identifier that was actually written, which for an insert is the minted one -
    // the argument still reports `''`.
    await this.reconcileRateLinks(saved.getPriceGroupRateID(), priceGroupRate, tx);

    return saved;
  }

  /**
   * Rewrites all six link collections for one rate to match the entity in hand.
   *
   * Why it matters more than an ordinary missing write: these collections decide which products
   * and SKUs a rate applies to [model/service/PriceGroupService.cfc:L57-L181].
   *
   * @param priceGroupRateID the identifier written by the scalar statement.
   * @param priceGroupRate the entity whose collections are authoritative.
   * @param tx the transactional executor.
   */
  private async reconcileRateLinks(
    priceGroupRateID: string,
    priceGroupRate: PriceGroupRate,
    tx: PreparedStatementExecutor,
  ): Promise<void> {
    // Phase one: read and admit every collection, issuing nothing.
    const reconciliations: { linkTable: RateLinkTable; memberIDs: readonly string[] }[] = [];

    for (const collectionName of RATE_LINK_COLLECTION_NAMES) {
      const linkTable = RATE_LINK_TABLES[collectionName];
      const memberIDs = readRateLinkMemberIDs(priceGroupRate, collectionName);

      for (const memberID of memberIDs) {
        if (memberID === '') {
          throw new PriceGroupPersistenceError(
            `The ${collectionName} collection of price-group rate '${priceGroupRateID}' holds a ` +
              'member that has never been persisted, so no link row can name it. Save the member ' +
              'before attaching it to a rate.',
          );
        }
      }

      reconciliations.push({ linkTable, memberIDs });
    }

    // Phase two: write. Six deletes always, and one insert per collection that has members.
    for (const { linkTable, memberIDs } of reconciliations) {
      await tx.executeMutation(buildRateLinkDeleteByRateSql(linkTable), [priceGroupRateID]);

      if (memberIDs.length === 0) {
        continue;
      }

      // Flattened to one pair per member, in collection order, matching the placeholder pairs the
      // statement rendered.
      const boundValues: SqlParameter[] = [];

      for (const memberID of memberIDs) {
        boundValues.push(priceGroupRateID, memberID);
      }
      for (const batch of chunkTupleRows(memberIDs)) {
        const batchValues: SqlParameter[] = [];

        for (const memberID of batch) {
          batchValues.push(priceGroupRateID, memberID);
        }

        await tx.executeMutation(buildRateLinkInsertSql(linkTable, batch.length), batchValues);
      }
    }
  }

  /**
   * Deletes a price group and the rates it owns.
   *
   * CFML parity [model/entity/PriceGroup.cfc:L64]: `priceGroupRates` is the one association on
   * this entity declared `cascade="all-delete-orphan"`, so Hibernate removed the rate rows - and
   * their link rows - when the price group was deleted.
   *
   * The second read: "CFML parity [model/service/PriceGroupService.cfc:L461-L470]: the child
   * DETACHMENT loop is a service behaviour and stays there, including its non-termination hazard.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L461-L470]: the child DETACHMENT loop is a
   * service behaviour and stays there, including its non-termination hazard.
   */
  public async deletePriceGroup(priceGroup: PriceGroup): Promise<boolean> {
    if (priceGroup.isNew()) {
      // `unsavedvalue=""` [model/entity/PriceGroup.cfc:L52] means this entity has no row, so there
      // is nothing to delete and nothing to report as deleted.
      return false;
    }

    const priceGroupID = priceGroup.getPriceGroupID();

    // Atomicity boundary - every statement in this unit, or none of them.
    //
    // CFML parity, and the reason this is a transaction rather than a sequence.
    //
    // Issuing these as autocommit statements would not preserve that behaviour - it would DISCARD
    // a guarantee the source had.

    // One instant for the whole unit of work, captured before it opens, matching the single
    // `now()` the ORM's flush would have stamped across every row it touched.
    const auditTimestamp = new Date();

    return await this.executor.transaction(async (tx): Promise<boolean> => {
      // [org/Hibachi/HibachiService.cfc:L55] validates the whole delete context up front, so a
      // relationship on the LAST gate refuses the delete just as completely as one on the first.
      //
      // SEQUENTIAL, not CONCURRENT: every statement here travels the single connection this
      // transaction holds, which has no statement concurrency to exploit.
      for (const gate of PRICE_GROUP_DELETE_GATES) {
        const blockingRows = await tx.execute(buildDeleteGateProbeSql(gate), [priceGroupID]);

        if (blockingRows.length > 0) {
          return false;
        }
      }

      // The detachment the service decided, now performed. Before the deletes, because a child
      // whose parent row was already gone would have violated the reference in the interim.
      await tx.executeMutation(DETACH_CHILD_PRICE_GROUPS_SQL, [
        auditTimestamp,
        resolveAuditActorAccountID(this.auditActor) ?? null,
        priceGroupID,
      ]);

      for (const collectionName of RATE_LINK_COLLECTION_NAMES) {
        const linkTable = RATE_LINK_TABLES[collectionName];

        await tx.executeMutation(buildRateLinkDeleteSql(linkTable), [priceGroupID]);
      }

      await tx.executeMutation(DELETE_RATES_BY_PRICE_GROUP_SQL, [priceGroupID]);

      const priceGroupDeletion = await tx.executeMutation(DELETE_PRICE_GROUP_ROW_SQL, [
        priceGroupID,
      ]);
      return priceGroupDeletion.affectedRows > 0;
    });
  }

  /**
   * One price-group row by key, or `undefined` when the key matches nothing.
   */
  private async readPriceGroupRow(priceGroupID: string): Promise<SqlRow | undefined> {
    const rows = await this.executor.execute(SELECT_PRICE_GROUP_BY_ID_SQL, [priceGroupID]);

    return rows.at(0);
  }

  /**
   * Assembles a price group with everything the cascade walks.
   *
   * The visited set exists to TERMINATE the READ: nothing in the schema prevents a cycle in
   * `parentPriceGroupID`, and without it this walk would issue statements forever.
   *
   * What a revisit does, and why it raises rather than truncates.
   */
  private async hydrateCascadeReadyPriceGroup(
    row: SqlRow,
    statementLabel: string,
    includeDirectChildren: boolean,
  ): Promise<PriceGroup> {
    const hydrated = await this.hydrateCascadeReadyPriceGroups(
      [row],
      statementLabel,
      includeDirectChildren,
    );

    const only = hydrated.at(0);

    if (only === undefined) {
      throw new PriceGroupPersistenceError(
        'Hydrating a single price-group row produced no entity. One row always yields one entity, so ' +
          'this indicates the collection pass dropped a seed row.',
      );
    }

    return only;
  }

  /**
   * Assembles several price groups, each with everything the cascade walks, in one pass.
   *
   * Read one group at a time and each read hands back its own fresh instances.
   *
   * FETCH SHAPE (T3): identical to the singular form it replaces, association for association.
   */
  private async hydrateCascadeReadyPriceGroups(
    seedRows: readonly SqlRow[],
    statementLabel: string,
    includeDirectChildren: boolean,
  ): Promise<PriceGroup[]> {
    if (seedRows.length === 0) {
      return [];
    }

    const collected = await this.collectPriceGroupAncestry(seedRows, statementLabel);

    const ratesByPriceGroupID = await this.loadRatesForPriceGroups([...collected.keys()]);

    const seedPriceGroupIDs = seedRows.map((seedRow) =>
      readIdentifier(seedRow, 'priceGroupID', statementLabel),
    );
    const childPriceGroupsByFoldedParentID = includeDirectChildren
      ? await this.loadDirectChildPriceGroups(seedPriceGroupIDs)
      : new Map<string, PriceGroup[]>();

    const hydratedByPriceGroupID = new Map<string, PriceGroup>();
    const seeds: PriceGroup[] = [];

    for (const seedPriceGroupID of seedPriceGroupIDs) {
      const childPriceGroups =
        childPriceGroupsByFoldedParentID.get(cfFoldKey(seedPriceGroupID)) ?? [];

      seeds.push(
        this.materializeCollectedPriceGroup(
          seedPriceGroupID,
          collected,
          ratesByPriceGroupID,
          hydratedByPriceGroupID,
          childPriceGroups,
        ),
      );
    }

    return seeds;
  }

  /**
   * Phase one: every row the seeds and their ancestry need, each read exactly once.
   *
   * Returned map is call-scoped: a row already in it has been read, and its own ancestry has
   * already been collected in full, so the walk can stop there.
   *
   * Each seed starts with an EMPTY chain rather than inheriting one, because a chain is exactly
   * the per-seed thing: two seeds sharing an ancestor have not looped.
   */
  private async collectPriceGroupAncestry(
    seedRows: readonly SqlRow[],
    statementLabel: string,
  ): Promise<Map<string, CollectedPriceGroupRow>> {
    const collected = new Map<string, CollectedPriceGroupRow>();
    const pathAncestorRowsByFoldedID = await this.readAncestorRowsBySeedPaths(
      seedRows,
      statementLabel,
    );

    for (const seedRow of seedRows) {
      const seedPriceGroupID = readIdentifier(seedRow, 'priceGroupID', statementLabel);
      // DEPENDS on it. `parentPriceGroupID = ?` runs under MySQL's default collation, so a stored
      // parent link of `ABC` resolves the row whose own `priceGroupID` column reads `abc`.
      const chain = new Set<string>();
      const chainOrder: string[] = [];

      let currentPriceGroupID = seedPriceGroupID;
      let currentRow: SqlRow = seedRow;
      let currentStatementLabel = statementLabel;
      let walking = true;

      while (walking) {
        chain.add(cfFoldKey(currentPriceGroupID));
        chainOrder.push(currentPriceGroupID);

        const alreadyCollected = collected.get(cfFoldKey(currentPriceGroupID));

        const collectedCurrent: CollectedPriceGroupRow = alreadyCollected ?? {
          row: currentRow,
          statementLabel: currentStatementLabel,
          parentPriceGroupID: readOptionalText(
            currentRow,
            'parentPriceGroupID',
            currentStatementLabel,
          ),
        };

        if (alreadyCollected === undefined) {
          collected.set(cfFoldKey(currentPriceGroupID), collectedCurrent);
        }

        const parentPriceGroupID = collectedCurrent.parentPriceGroupID;

        // Ordering is what makes the two sets mean what they say.
        if (parentPriceGroupID === undefined || parentPriceGroupID === '') {
          // An empty foreign key cannot resolve to a row, so it is treated as absent rather than
          // looked up.
          walking = false;
        } else if (chain.has(cfFoldKey(parentPriceGroupID))) {
          // This chain has climbed back onto itself: the stored pointers form a cycle.
          throw new PriceGroupCycleError(chainOrder, parentPriceGroupID);
        } else if (collected.has(cfFoldKey(parentPriceGroupID))) {
          // The parent - and therefore its whole chain above it - was collected by an earlier
          // seed. Stopping here is what makes a shared ancestor one row read and one instance.
          walking = false;
        } else {
          const prefetchedParentRow = pathAncestorRowsByFoldedID.get(cfFoldKey(parentPriceGroupID));
          const parentRow =
            prefetchedParentRow ?? (await this.readPriceGroupRow(parentPriceGroupID));

          if (parentRow === undefined) {
            walking = false;
          } else {
            const parentStatementLabel =
              prefetchedParentRow === undefined
                ? SELECT_PRICE_GROUP_BY_ID
                : SELECT_PRICE_GROUPS_BY_ID;

            currentPriceGroupID = readIdentifier(parentRow, 'priceGroupID', parentStatementLabel);
            currentRow = parentRow;
            currentStatementLabel = parentStatementLabel;
          }
        }
      }
    }

    return collected;
  }

  /**
   * @param seedRows the rows the ancestry walk will start from.
   * @param statementLabel the label attributing the seed rows' columns, for column-error messages.
   * @returns every prefetched ancestor row, keyed by folded identifier; empty when no seed path
   * names an identifier other than a seed's own.
   * @throws An error named `PriceGroupColumnError` when a seed row or a returned row is missing a
   * column this read projects.
   */
  private async readAncestorRowsBySeedPaths(
    seedRows: readonly SqlRow[],
    statementLabel: string,
  ): Promise<ReadonlyMap<string, SqlRow>> {
    const seedFoldedIDs = new Set<string>();

    for (const seedRow of seedRows) {
      seedFoldedIDs.add(cfFoldKey(readIdentifier(seedRow, 'priceGroupID', statementLabel)));
    }

    const candidatePriceGroupIDs: string[] = [];
    const requestedFoldedIDs = new Set<string>();

    for (const seedRow of seedRows) {
      const priceGroupIDPath = readOptionalText(seedRow, 'priceGroupIDPath', statementLabel);

      if (priceGroupIDPath === undefined) {
        continue;
      }

      for (const pathElement of listToArray(priceGroupIDPath)) {
        const foldedPathElement = cfFoldKey(pathElement);

        if (seedFoldedIDs.has(foldedPathElement) || requestedFoldedIDs.has(foldedPathElement)) {
          continue;
        }

        requestedFoldedIDs.add(foldedPathElement);
        candidatePriceGroupIDs.push(pathElement);
      }
    }

    if (candidatePriceGroupIDs.length === 0) {
      return new Map<string, SqlRow>();
    }

    const ancestorRows = await this.executor.execute(
      buildSelectPriceGroupsByIDSql(candidatePriceGroupIDs.length),
      candidatePriceGroupIDs,
    );

    const rowsByFoldedID = new Map<string, SqlRow>();

    for (const ancestorRow of ancestorRows) {
      rowsByFoldedID.set(
        cfFoldKey(readIdentifier(ancestorRow, 'priceGroupID', SELECT_PRICE_GROUPS_BY_ID)),
        ancestorRow,
      );
    }

    return rowsByFoldedID;
  }

  /**
   * Phase three: one entity per collected row, parents before children.
   *
   * Recursion terminates on the identity map and on an absent parent, and phase one raised on any
   * cycle before this method was reached.
   *
   * The in-progress set is a real guard, not a comment about one.
   */
  private materializeCollectedPriceGroup(
    priceGroupID: string,
    collected: ReadonlyMap<string, CollectedPriceGroupRow>,
    ratesByPriceGroupID: ReadonlyMap<string, PriceGroupRate[]>,
    hydratedByPriceGroupID: Map<string, PriceGroup>,
    childPriceGroups: PriceGroup[],
    inProgressPriceGroupIDs: readonly string[] = [],
  ): PriceGroup {
    // Every map and set identity in this pass is folded, for the reason recorded on
    // `collectPriceGroupAncestry`: the collation behind every identifier predicate is
    // case-insensitive.
    const identity = cfFoldKey(priceGroupID);
    const alreadyHydrated = hydratedByPriceGroupID.get(identity);

    if (alreadyHydrated !== undefined) {
      return alreadyHydrated;
    }

    if (inProgressPriceGroupIDs.some((held: string) => cfEquals(held, priceGroupID))) {
      throw new PriceGroupCycleError(inProgressPriceGroupIDs, priceGroupID);
    }

    const collectedRow = collected.get(identity);

    if (collectedRow === undefined) {
      throw new PriceGroupPersistenceError(
        `Price group '${priceGroupID}' was requested during materialization but was never collected. ` +
          'Every identifier reached here comes from the collection pass, so this indicates the two ' +
          'passes disagree about the graph.',
      );
    }

    const parentPriceGroupID = collectedRow.parentPriceGroupID;

    const parentPriceGroup =
      parentPriceGroupID === undefined ||
      parentPriceGroupID === '' ||
      !collected.has(cfFoldKey(parentPriceGroupID))
        ? undefined
        : this.materializeCollectedPriceGroup(
            parentPriceGroupID,
            collected,
            ratesByPriceGroupID,
            hydratedByPriceGroupID,
            [],
            [...inProgressPriceGroupIDs, priceGroupID],
          );

    const priceGroup = toPriceGroup(collectedRow.row, collectedRow.statementLabel, {
      parentPriceGroup,
      childPriceGroups,
      priceGroupRates: ratesByPriceGroupID.get(identity) ?? [],
    });

    hydratedByPriceGroupID.set(identity, priceGroup);

    return priceGroup;
  }

  /**
   * The rate collections of several price groups, each rate carrying its joined rounding rule and
   * its six link collections, partitioned back to the group that owns it.
   *
   * A group with no rates is present in the result with an EMPTY collection, so a caller can tell
   * "this group has no rates" from "this group was not asked about" without a fallback.
   */
  private async loadRatesForPriceGroups(
    priceGroupIDs: readonly string[],
  ): Promise<ReadonlyMap<string, PriceGroupRate[]>> {
    const ratesByPriceGroupID = new Map<string, PriceGroupRate[]>();

    // Folded keys, matching the collection and materialisation passes.
    for (const priceGroupID of priceGroupIDs) {
      ratesByPriceGroupID.set(cfFoldKey(priceGroupID), []);
    }

    if (priceGroupIDs.length === 0) {
      return ratesByPriceGroupID;
    }

    const rateRows = await this.executor.execute(buildRatesByPriceGroupSql(priceGroupIDs.length), [
      ...priceGroupIDs,
    ]);

    if (rateRows.length === 0) {
      return ratesByPriceGroupID;
    }

    const priceGroupRateIDs = rateRows.map((rateRow) =>
      readIdentifier(rateRow, 'priceGroupRateID', SELECT_RATES_BY_PRICE_GROUP),
    );

    const membershipByRateID = await this.loadRateLinkMembership(priceGroupRateIDs);

    for (const rateRow of rateRows) {
      const storedPriceGroupRateID = readIdentifier(
        rateRow,
        'priceGroupRateID',
        SELECT_RATES_BY_PRICE_GROUP,
      );

      const owningPriceGroupID = readIdentifier(
        rateRow,
        'priceGroupID',
        SELECT_RATES_BY_PRICE_GROUP,
      );

      const rate = toPriceGroupRate(
        rateRow,
        SELECT_RATES_BY_PRICE_GROUP,
        membershipByRateID.get(storedPriceGroupRateID) ?? EMPTY_RATE_LINK_MEMBERSHIP,
        undefined,
        this.valueRounder,
      );

      // A row whose owner is not in the requested set cannot arise from this statement, since the
      // `IN` list is the requested set.
      const ownerRates = ratesByPriceGroupID.get(cfFoldKey(owningPriceGroupID));

      if (ownerRates !== undefined) {
        ownerRates.push(rate);
      }
    }

    return ratesByPriceGroupID;
  }

  /**
   * Reads the six link collections for a set of rates, one statement per collection: each is
   * trivially reviewable on its own, each maps to exactly one declared association on
   * [model/entity/PriceGroupRate.cfc:L71-L77].
   */
  private async loadRateLinkMembership(
    priceGroupRateIDs: readonly string[],
  ): Promise<ReadonlyMap<string, RateLinkMembership>> {
    const membershipByRateID = new Map<string, MutableRateLinkMembership>();
    for (const priceGroupRateID of priceGroupRateIDs) {
      membershipByRateID.set(cfFoldKey(priceGroupRateID), createMutableRateLinkMembership());
    }

    if (priceGroupRateIDs.length === 0) {
      return membershipByRateID;
    }

    for (const collectionName of RATE_LINK_COLLECTION_NAMES) {
      const linkTable = RATE_LINK_TABLES[collectionName];

      const linkRows = await this.executor.execute(
        buildRateLinkSelectSql(linkTable, priceGroupRateIDs.length),
        [...priceGroupRateIDs],
      );

      for (const linkRow of linkRows) {
        const owningRateID = readIdentifier(linkRow, 'priceGroupRateID', linkTable.statementLabel);
        const memberID = readIdentifier(linkRow, linkTable.memberColumn, linkTable.statementLabel);

        const membership = membershipByRateID.get(cfFoldKey(owningRateID));

        // A link row whose owner is not in the requested set cannot arise from these statements,
        // since the `IN` list is the requested set.
        if (membership !== undefined) {
          membership[collectionName].push(memberID);
        }
      }
    }

    return membershipByRateID;
  }

  /**
   * The direct children of one price group, as detachment handles.
   *
   * JUDGMENT CALL: these instances carry their own columns and nothing ELSE - no rates, no
   * children of their own, and no parent back-link.
   *
   * @param priceGroupIDs the parents whose direct children are wanted.
   * @returns the direct children of each parent, keyed by folded parent identifier; empty when no
   * key was supplied or no row matched.
   */
  private async loadDirectChildPriceGroups(
    priceGroupIDs: readonly string[],
  ): Promise<ReadonlyMap<string, PriceGroup[]>> {
    const childPriceGroupsByFoldedParentID = new Map<string, PriceGroup[]>();

    if (priceGroupIDs.length === 0) {
      return childPriceGroupsByFoldedParentID;
    }

    const childRows = await this.executor.execute(
      buildSelectChildPriceGroupsSql(priceGroupIDs.length),
      [...priceGroupIDs],
    );

    for (const childRow of childRows) {
      const foldedParentID = cfFoldKey(
        readIdentifier(childRow, 'parentPriceGroupID', SELECT_CHILD_PRICE_GROUPS),
      );

      const childPriceGroup = toPriceGroup(childRow, SELECT_CHILD_PRICE_GROUPS, {
        parentPriceGroup: undefined,
        childPriceGroups: [],
        priceGroupRates: [],
      });

      const siblings = childPriceGroupsByFoldedParentID.get(foldedParentID);

      if (siblings === undefined) {
        childPriceGroupsByFoldedParentID.set(foldedParentID, [childPriceGroup]);
      } else {
        siblings.push(childPriceGroup);
      }
    }

    return childPriceGroupsByFoldedParentID;
  }

  private async insertPriceGroup(
    priceGroup: PriceGroup,
    auditTimestamp: Date,
  ): Promise<PriceGroup> {
    const mintedPriceGroupID = mintEntityIdentifier();
    const parentPriceGroup = priceGroup.getParentPriceGroup();
    const insertedAuditActorAccountID = resolveAuditActorAccountID(this.auditActor);

    // Maintenance FIRST, per the ordering the entity mandates. The path is composed rather than
    // taken from `preInsert()` because the entity cannot know the key being minted for it.
    const priceGroupIDPath = composeInsertedPriceGroupIDPath(parentPriceGroup, mintedPriceGroupID);

    const columnValues: ColumnValues = {
      priceGroupID: mintedPriceGroupID,
      priceGroupIDPath,
      activeFlag: priceGroup.getActiveFlag(),
      priceGroupName: priceGroup.getPriceGroupName(),
      priceGroupCode: priceGroup.getPriceGroupCode(),
      parentPriceGroupID: parentPriceGroup?.getPriceGroupID(),
      createdDateTime: auditTimestamp,
      createdByAccountID: insertedAuditActorAccountID,
      modifiedDateTime: auditTimestamp,
      modifiedByAccountID: insertedAuditActorAccountID,
    };

    const insertion = await this.executor.executeMutation(
      INSERT_PRICE_GROUP_SQL,
      bindColumnValues(PRICE_GROUP_COLUMNS, columnValues, INSERT_PRICE_GROUP),
    );

    if (insertion.affectedRows === 0) {
      throw new PriceGroupPersistenceError(
        'The price-group insert reported no inserted row. No generated key can be returned, so the ' +
          'entity would otherwise be handed back claiming an identifier that is not stored.',
      );
    }

    // A NEW instance, because the identifier changed and the entity exposes no setter for it -
    // mirroring `unsavedvalue=""` [model/entity/PriceGroup.cfc:L52] rather than working around it.
    return new PriceGroup({
      priceGroupID: mintedPriceGroupID,
      priceGroupIDPath,
      activeFlag: priceGroup.getActiveFlag(),
      priceGroupName: priceGroup.getPriceGroupName(),
      priceGroupCode: priceGroup.getPriceGroupCode(),
      parentPriceGroup,
      childPriceGroups: priceGroup.getChildPriceGroups(),
      priceGroupRates: priceGroup.getPriceGroupRates(),
      promotionRewards: priceGroup.getPromotionRewards(),
      createdDateTime: auditTimestamp,
      // The same resolution the statement bound, so the returned entity describes the stored row.
      createdByAccountID: insertedAuditActorAccountID,
      modifiedDateTime: auditTimestamp,
      modifiedByAccountID: insertedAuditActorAccountID,
    });
  }

  private async updatePriceGroup(
    priceGroup: PriceGroup,
    priorState: PriceGroup | undefined,
    auditTimestamp: Date,
  ): Promise<PriceGroup> {
    // CFML parity [model/entity/PriceGroup.cfc:L211-L214]: the hook is invoked EXPLICITLY and
    // before the stamping step, because the legacy body assigns the path and only then calls
    // `super`.
    priceGroup.preUpdate(
      priorState === undefined ? undefined : toPriorStatePropertyBag(priorState),
    );

    const parentPriceGroup = priceGroup.getParentPriceGroup();
    const maintainedPriceGroupIDPath = priceGroup.getPriceGroupIDPath();

    const columnValues: ColumnValues = {
      priceGroupIDPath: maintainedPriceGroupIDPath,
      activeFlag: priceGroup.getActiveFlag(),
      priceGroupName: priceGroup.getPriceGroupName(),
      priceGroupCode: priceGroup.getPriceGroupCode(),
      parentPriceGroupID: parentPriceGroup?.getPriceGroupID(),
      modifiedDateTime: auditTimestamp,
      modifiedByAccountID: resolveAuditActorAccountID(this.auditActor),
    };

    const boundValues = bindColumnValues(
      UPDATED_PRICE_GROUP_COLUMNS,
      columnValues,
      UPDATE_PRICE_GROUP,
    );

    // The key binds LAST, after the whole SET list, because that is the order the statement
    // declares it.
    boundValues.push(priceGroup.getPriceGroupID());
    const update = await this.executor.executeMutation(UPDATE_PRICE_GROUP_SQL, boundValues);

    if (update.affectedRows === 0) {
      throw new PriceGroupPersistenceError(
        'The price-group update matched no row, so the key it carries names no SwPriceGroup row and ' +
          'the entity cannot be reported as persisted. The materialized priceGroupIDPath this save ' +
          'computed was therefore not stored either.',
      );
    }

    return new PriceGroup({
      priceGroupID: priceGroup.getPriceGroupID(),
      priceGroupIDPath: maintainedPriceGroupIDPath,
      activeFlag: priceGroup.getActiveFlag(),
      priceGroupName: priceGroup.getPriceGroupName(),
      priceGroupCode: priceGroup.getPriceGroupCode(),
      parentPriceGroup,
      childPriceGroups: priceGroup.getChildPriceGroups(),
      priceGroupRates: priceGroup.getPriceGroupRates(),
      promotionRewards: priceGroup.getPromotionRewards(),
      // Write-once, and therefore read back off the entity rather than restamped.
      createdDateTime: priceGroup.getCreatedDateTime(),
      createdByAccountID: priceGroup.getCreatedByAccountID(),
      modifiedDateTime: auditTimestamp,
      modifiedByAccountID: resolveStampedModifiedByAccountID(
        this.auditActor,
        priceGroup.getModifiedByAccountID(),
      ),
    });
  }

  private async insertPriceGroupRate(
    priceGroupRate: PriceGroupRate,
    auditTimestamp: Date,
    tx: PreparedStatementExecutor,
  ): Promise<PriceGroupRate> {
    const mintedPriceGroupRateID = mintEntityIdentifier();
    const stamps = this.insertedRateAuditStamps(auditTimestamp);

    const insertion = await tx.executeMutation(
      INSERT_PRICE_GROUP_RATE_SQL,
      bindColumnValues(
        PRICE_GROUP_RATE_COLUMNS,
        this.toPriceGroupRateColumnValues(priceGroupRate, mintedPriceGroupRateID, stamps),
        INSERT_PRICE_GROUP_RATE,
      ),
    );

    if (insertion.affectedRows === 0) {
      throw new PriceGroupPersistenceError(
        'The price-group-rate insert reported no inserted row, so no generated key can be returned.',
      );
    }

    return this.rehydrateSavedPriceGroupRate(priceGroupRate, mintedPriceGroupRateID, stamps);
  }

  private async updatePriceGroupRate(
    priceGroupRate: PriceGroupRate,
    auditTimestamp: Date,
    tx: PreparedStatementExecutor,
  ): Promise<PriceGroupRate> {
    const priceGroupRateID = priceGroupRate.getPriceGroupRateID();
    const stamps = this.updatedRateAuditStamps(priceGroupRate, auditTimestamp);

    const boundValues = bindColumnValues(
      UPDATED_PRICE_GROUP_RATE_COLUMNS,
      this.toPriceGroupRateColumnValues(priceGroupRate, priceGroupRateID, stamps),
      UPDATE_PRICE_GROUP_RATE,
    );

    boundValues.push(priceGroupRateID);

    const update = await tx.executeMutation(UPDATE_PRICE_GROUP_RATE_SQL, boundValues);
    if (update.affectedRows === 0) {
      throw new PriceGroupPersistenceError(
        'The price-group-rate update matched no row, so the key it carries names no SwPriceGroupRate ' +
          'row and the entity cannot be reported as persisted.',
      );
    }

    return this.rehydrateSavedPriceGroupRate(priceGroupRate, priceGroupRateID, stamps);
  }

  /**
   * The audit values an inserted rate carries.
   */
  private insertedRateAuditStamps(auditTimestamp: Date): PriceGroupRateAuditStamps {
    const auditActorAccountID = resolveAuditActorAccountID(this.auditActor);

    return {
      createdDateTime: auditTimestamp,
      createdByAccountID: auditActorAccountID,
      modifiedDateTime: auditTimestamp,
      modifiedByAccountID: auditActorAccountID,
      resolvedModifiedByAccountID: auditActorAccountID,
    };
  }

  /**
   * The audit values an updated rate carries.
   */
  private updatedRateAuditStamps(
    priceGroupRate: PriceGroupRate,
    auditTimestamp: Date,
  ): PriceGroupRateAuditStamps {
    return {
      createdDateTime: priceGroupRate.getCreatedDateTime(),
      createdByAccountID: priceGroupRate.getCreatedByAccountID(),
      modifiedDateTime: auditTimestamp,
      modifiedByAccountID: resolveAuditActorAccountID(this.auditActor),
      resolvedModifiedByAccountID: resolveStampedModifiedByAccountID(
        this.auditActor,
        priceGroupRate.getModifiedByAccountID(),
      ),
    };
  }

  /**
   * The column values for a rate write, keyed by physical column so the ordered list can project
   * them.
   *
   * E4: `amount` becomes a decimal string through `Money.toDecimalString()`, never a number.
   */
  private toPriceGroupRateColumnValues(
    priceGroupRate: PriceGroupRate,
    priceGroupRateID: string,
    stamps: PriceGroupRateAuditStamps,
  ): ColumnValues {
    return {
      priceGroupRateID,
      globalFlag: priceGroupRate.getGlobalFlag(),
      amount: priceGroupRate.getAmount()?.toDecimalString(),
      amountType: priceGroupRate.getAmountType(),
      remoteID: priceGroupRate.getRemoteID(),
      priceGroupID: priceGroupRate.getPriceGroup()?.getPriceGroupID(),
      roundingRuleID: priceGroupRate.getRoundingRule()?.getRoundingRuleID(),
      createdDateTime: stamps.createdDateTime,
      createdByAccountID: stamps.createdByAccountID,
      modifiedDateTime: stamps.modifiedDateTime,
      modifiedByAccountID: stamps.modifiedByAccountID,
    };
  }

  /**
   * Rebuilds a saved rate so the returned instance reflects what was written.
   */
  private rehydrateSavedPriceGroupRate(
    priceGroupRate: PriceGroupRate,
    priceGroupRateID: string,
    stamps: PriceGroupRateAuditStamps,
  ): PriceGroupRate {
    return new PriceGroupRate({
      priceGroupRateID,
      globalFlag: priceGroupRate.getGlobalFlag(),
      amount: priceGroupRate.getAmount(),
      amountType: priceGroupRate.getAmountType(),
      remoteID: priceGroupRate.getRemoteID(),
      createdDateTime: stamps.createdDateTime,
      createdByAccountID: stamps.createdByAccountID,
      modifiedDateTime: stamps.modifiedDateTime,
      modifiedByAccountID: stamps.resolvedModifiedByAccountID,
      priceGroup: priceGroupRate.getPriceGroup(),
      roundingRule: priceGroupRate.getRoundingRule(),
      productTypes: priceGroupRate.getProductTypes(),
      products: priceGroupRate.getProducts(),
      skus: priceGroupRate.getSkus(),
      excludedProductTypes: [...priceGroupRate.getExcludedProductTypes()],
      excludedProducts: [...priceGroupRate.getExcludedProducts()],
      excludedSkus: [...priceGroupRate.getExcludedSkus()],
    });
  }
}
