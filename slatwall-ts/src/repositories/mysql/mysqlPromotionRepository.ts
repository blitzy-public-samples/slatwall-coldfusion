/**
 * MySQL adapter for the promotion repository port.
 *
 * Ports `model/dao/PromotionDAO.cfc` - 593 lines, the largest and most intricate DAO in the slice,
 * mixed cfscript and `<cffunction>` tag syntax with embedded `<cfquery>` bodies - plus the single
 * query of `model/dao/RoundingRuleDAO.cfc`.
 *
 * LEGACY-NOTE [model/dao/PromotionDAO.cfc:L298-L591]: three locators quoted here disagree with the
 * planning notes and were re-verified against the source.
 *
 * @see model /dao/PromotionDAO.cfc - the ported DAO; its query bodies are the source of truth.
 */

// The six member entity types the twenty-one catalog link tables project onto.
import { Brand } from '../../domain/entities/brand.js';
import { Option } from '../../domain/entities/option.js';
import { PriceGroup } from '../../domain/entities/priceGroup.js';
import { Product } from '../../domain/entities/product.js';
import { ProductType } from '../../domain/entities/productType.js';
import { Sku } from '../../domain/entities/sku.js';
import { Promotion } from '../../domain/entities/promotion.js';
import type { PromotionCode } from '../../domain/entities/promotionCode.js';
import { PromotionPeriod } from '../../domain/entities/promotionPeriod.js';
import { PromotionQualifier } from '../../domain/entities/promotionQualifier.js';
import type { RewardMatchingType } from '../../domain/entities/promotionQualifier.js';
import { PromotionReward } from '../../domain/entities/promotionReward.js';
import type { AmountType, ApplicableTerm } from '../../domain/entities/promotionReward.js';
import { RoundingRule } from '../../domain/entities/roundingRule.js';
import type {
  PromotionRepository,
  SalePricePromotionRewardRow,
} from '../../domain/ports/promotionRepository.js';
import { Money } from '../../domain/valueObjects/money.js';
import { listAppend, listFindNoCase, listToArray } from '../../lib/cfml/list.js';
import { cfEquals } from '../../lib/cfml/struct.js';
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import { cfLen, isNullish } from '../../lib/cfml/truthiness.js';
import type { PreparedStatementExecutor, SqlRow } from './connection.js';
import {
  MAX_PLACEHOLDER_COUNT,
  isPreparablePlaceholderCount,
  sqlPlaceholderList,
} from './connection.js';
import type { DatabaseDialect } from './dialect.js';
import { assertMySqlDialect } from './dialect.js';
import type { UseCountStatement } from './sql/promotionUseCounts.sql.js';
import { PROMOTION_USE_COUNT_STATEMENTS } from './sql/promotionUseCounts.sql.js';
import { buildSalePricePromotionRewardsStatement } from './sql/salePricePromotionRewards.sql.js';

// JUDGMENT CALL: the dialect is a module constant and is deliberately not read from configuration.
//
// AAP 0.4.3 asks for the dialect-branching SQL sites to be DIALECT-PARAMETERIZED, and both that
// and T6 are satisfied by deciding the dialect here, once, and passing it.
const STATEMENT_DIALECT: DatabaseDialect = 'MySQL';

assertMySqlDialect(STATEMENT_DIALECT, 'the ported PromotionDAO statements');

// Collaborator contracts this adapter needs and cannot import.

/**
 * The rounding collaborator a hydrated `RoundingRule` is constructed with.
 *
 * JUDGMENT CALL: declared module-locally and un-exported because
 * `src/domain/entities/roundingRule.ts` declares its second constructor argument's interface
 * module-locally too and does not export it - there is no name to import.
 */
interface RoundingRuleValueRounder {
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money;
}

/**
 * The clock this adapter reads its one instant from, supplied by the composition root.
 *
 * JUDGMENT CALL: declared module-locally and un-exported, exactly as `RoundingRuleValueRounder`
 * above is, and satisfied STRUCTURALLY by whatever the composition root passes.
 *
 * Mutable, so a provider handing out its own instance would let one read move every other read's
 * baseline; the composition root returns a copy per call.
 */
interface PromotionRequestClock {
  now(): Date;
}

// Two fault types, each with an explicit `name` and an unexported constructor, following the
// sibling adapters: one says the RESULT SET and this adapter disagree.

/**
 * A result-set column that is absent, or present with a shape this adapter cannot read.
 *
 * The two faults are kept apart by the readers below: an absent column means the statement and
 * this file disagree about the projection.
 */
class PromotionColumnError extends Error {
  public constructor(columnName: string, statementLabel: string, detail: string) {
    super(`column "${columnName}" of ${statementLabel}: ${detail}`);
    this.name = 'PromotionColumnError';
  }
}

/**
 * An entity argument arrived without an association the legacy body dereferences.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L138, L193]: both period use-count functions bind
 * `arguments.promotionPeriod.getPromotion().getPromotionID()` with no null guard, so a period
 * whose promotion is not loaded raises inside the DAO.
 */
class PromotionAssociationError extends Error {
  public constructor(entityName: string, associationName: string, methodName: string) {
    super(
      `${methodName} requires ${entityName}.${associationName} to be materialized, and it is absent`,
    );
    this.name = 'PromotionAssociationError';
  }
}

/**
 * Raised when `getActivePromotionRewards` would build a statement wider than MySQL can prepare.
 *
 * The observable consequence was a caller-controlled internal error: roughly 32_766 codes - a
 * comma list well inside any request-size bound - drove the total past 65_535.
 */
class PromotionRewardPlaceholderBudgetError extends Error {
  /**
   * The rejected total, kept for programmatic inspection.
   */
  public readonly placeholderCount: number;

  public constructor(placeholderCount: number) {
    super(
      `getActivePromotionRewards would bind ${String(placeholderCount)} placeholders, and a prepared ` +
        `statement carries at most ${String(MAX_PLACEHOLDER_COUNT)}. Every promotion code is bound ` +
        'TWICE - once in the qualification arm and once in the unconditional arm - so the supplied ' +
        'promotion-code list is the term to reduce.',
    );
    this.name = 'PromotionRewardPlaceholderBudgetError';
    this.placeholderCount = placeholderCount;
  }
}

// Three columns feed a narrowed union on an ENTITY and two feed one on the port's row projection,
// and the two groups are treated differently on purpose.

/**
 * The three `amountType` values, from `getAmountTypeOptions()`
 * [model/entity/PromotionReward.cfc:L120-L133].
 */
const AMOUNT_TYPES: readonly AmountType[] = Object.freeze(['percentageOff', 'amountOff', 'amount']);

/**
 * The three `applicableTerm` values [model/entity/PromotionReward.cfc:L112-L118].
 */
const APPLICABLE_TERMS: readonly ApplicableTerm[] = Object.freeze(['both', 'initial', 'renewal']);

/**
 * The five `rewardMatchingType` values [model/entity/PromotionQualifier.cfc:L107-L115].
 */
const REWARD_MATCHING_TYPES: readonly RewardMatchingType[] = Object.freeze([
  'any',
  'sku',
  'product',
  'productType',
  'brand',
]);

/**
 * The six discount levels the sale-price statement emits, one literal per UNION branch.
 */
const DISCOUNT_LEVELS: readonly SalePricePromotionRewardRow['discountLevel'][] = Object.freeze([
  'sku',
  'product',
  'brand',
  'option',
  'productType',
  'global',
]);

/**
 * The three amount types the sale-price `CASE` expression can match.
 */
const SALE_PRICE_DISCOUNT_TYPES: readonly SalePricePromotionRewardRow['salePriceDiscountType'][] =
  Object.freeze(['amount', 'amountOff', 'percentageOff']);

/**
 * Narrow a persisted string against a vocabulary, mapping anything else to absence.
 *
 * CFML parity [model/service/PromotionService.cfc:L992-L1002]: the legacy amount-type switch has
 * no `default` arm, so an unrecognized value produces no discount rather than a failure.
 *
 * @param value the persisted value, or `undefined` for a NULL column.
 * @param vocabulary the permitted values, in source order.
 * @returns the value AS PERSISTED when it matches a vocabulary member up to case, or `undefined`
 * when the column is NULL or holds something outside the vocabulary.
 */
function narrowOrAbsent<T extends string>(
  value: string | undefined,
  vocabulary: readonly T[],
): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  const matches = vocabulary.some((candidate): boolean => cfEquals(candidate, value));

  return matches ? (value as T) : undefined;
}

/**
 * @param value the projected value.
 * @param vocabulary the values the statement can emit.
 * @param columnName the column being narrowed, for the fault message.
 * @param statementLabel which statement produced the row.
 * @returns the value AS PROJECTED, once it has matched a vocabulary member up to case.
 * @throws An error named `PromotionColumnError` when the value matches no vocabulary member even
 * with case folded, which means the statement and this file have drifted apart.
 */
function narrowOrReport<T extends string>(
  value: string,
  vocabulary: readonly T[],
  columnName: string,
  statementLabel: string,
): T {
  const matches = vocabulary.some((candidate): boolean => cfEquals(candidate, value));

  if (!matches) {
    throw new PromotionColumnError(
      columnName,
      statementLabel,
      'the value is outside the vocabulary this statement emits, so the statement and this adapter have drifted apart',
    );
  }

  return value as T;
}

// Each label names the statement and cites the legacy locator it ports, so a fault message points
// at the CFML it came from - the only place here where a locator appears in a runtime string.
const ACTIVE_REWARDS_STATEMENT_LABEL =
  'the active promotion reward read [model/dao/PromotionDAO.cfc:L51-L132]';

/**
 * The three reward link reads that satisfy method 1's opaque-identifier collections.
 */
const REWARD_LINK_STATEMENT_LABEL =
  'a promotion reward link read [model/entity/PromotionReward.cfc:L76-L78]';

/**
 * The eleven reward link reads that satisfy method 1's catalog-typed collections.
 */
const REWARD_CATALOG_LINK_STATEMENT_LABEL =
  'a promotion reward catalog link read [model/entity/PromotionReward.cfc:L74, L80-L90]';

/**
 * The qualifier read that satisfies method 1's period association.
 */
const PERIOD_QUALIFIER_STATEMENT_LABEL =
  'the promotion qualifier read [model/entity/PromotionPeriod.cfc:L63]';

/**
 * The three qualifier link reads.
 */
const QUALIFIER_LINK_STATEMENT_LABEL =
  'a promotion qualifier link read [model/entity/PromotionQualifier.cfc:L73-L75]';

/**
 * The ten qualifier link reads that satisfy the catalog-typed collections.
 */
const QUALIFIER_CATALOG_LINK_STATEMENT_LABEL =
  'a promotion qualifier catalog link read [model/entity/PromotionQualifier.cfc:L77-L87]';
const PERIOD_USE_COUNT_STATEMENT_LABEL =
  'a promotion period use-count read [model/dao/PromotionDAO.cfc:L134-L252]';
const CODE_USE_COUNT_STATEMENT_LABEL =
  'a promotion code use-count read [model/dao/PromotionDAO.cfc:L254-L296]';
const SALE_PRICE_STATEMENT_LABEL =
  'the sale-price promotion reward read [model/dao/PromotionDAO.cfc:L298-L591]';
const ROUNDING_RULE_STATEMENT_LABEL =
  'the rounding rule read [model/dao/RoundingRuleDAO.cfc:L51-L67]';

// CFML parity [model/entity/PromotionReward.cfc:L65-L66]: CFML identifiers are case-INSENSITIVE,
// which is why those two adjacent lines can declare `ormType="integer"` and `ormtype="integer"`
// and mean the same thing.

/**
 * Either a column of that name was present - possibly holding SQL NULL - or it was not.
 */
type ColumnLookup = { readonly found: true; readonly value: unknown } | { readonly found: false };

/**
 * Case-fold an identifier for use as a comparison operand only. Never used as a bound value.
 */
function foldIdentifier(identifier: string): string {
  return identifier.toLowerCase();
}

/**
 * Look for one column of a row without assuming the driver's casing. Present - including when the
 * cell holds SQL NULL - or absent.
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
 * The ABSENCE of a column and a NULL VALUE in it are different faults: this raises for the first
 * and hands back `null` for the second.
 */
function requireColumn(row: SqlRow, columnName: string, statementLabel: string): unknown {
  const lookup = findColumn(row, columnName);

  if (!lookup.found) {
    throw new PromotionColumnError(
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
 * Read a column holding an identifier: present, not null, and text.
 *
 * Every in-scope primary key is `ormtype="string" length="32"`
 * [model/entity/PromotionReward.cfc:L60], so a non-string means the statement or the schema moved.
 */
function readIdentifier(row: SqlRow, columnName: string, statementLabel: string): string {
  const value = requireColumn(row, columnName, statementLabel);

  if (typeof value === 'string') {
    return value;
  }

  throw new PromotionColumnError(
    columnName,
    statementLabel,
    `an identifier column must arrive as text and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read a nullable text column, mapping SQL NULL to absence.
 *
 * SQL NULL becomes `undefined` and never the empty string, and the distinction is load-bearing:
 * `unsavedvalue=""` gives the empty string the specific meaning "not yet persisted" on every
 * in-scope entity [model/entity/PromotionReward.cfc:L60].
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

  throw new PromotionColumnError(
    columnName,
    statementLabel,
    `a text column must arrive as text or SQL NULL and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read a nullable `big_decimal` money column as `Money`.
 *
 * `src/repositories/mysql/connection.ts` deliberately leaves the driver's `decimalNumbers` option
 * unset, which is what makes a `DECIMAL` column arrive as a decimal string.
 */
function readOptionalMoney(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): Money | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value === 'string') {
    return Money.fromDecimalString(value);
  }

  throw new PromotionColumnError(
    columnName,
    statementLabel,
    `a big_decimal column must arrive as a decimal string, which leaving decimalNumbers unset guarantees, and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read a money column the row contract declares REQUIRED.
 */
function readMoney(row: SqlRow, columnName: string, statementLabel: string): Money {
  const amount = readOptionalMoney(row, columnName, statementLabel);

  if (amount === undefined) {
    throw new PromotionColumnError(
      columnName,
      statementLabel,
      'this projection cannot carry SQL NULL here, because the join-back compares the value for equality',
    );
  }

  return amount;
}

/**
 * Read a nullable `ormtype="integer"` column.
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

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'bigint') {
    if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(value);
    }
  }

  throw new PromotionColumnError(
    columnName,
    statementLabel,
    `an integer column must arrive as a finite number or an in-range bigint and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read a nullable `big_decimal` column that is not money.
 *
 * JUDGMENT CALL: the two fulfillment-weight gates are `ormtype="big_decimal"` with
 * `hb_formatType="weight"` [model/entity/PromotionQualifier.cfc:L62-L63] and
 * `src/domain/entities/promotionQualifier.ts` types both `number`.
 */
function readOptionalNonMonetaryDecimal(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): number | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new PromotionColumnError(
    columnName,
    statementLabel,
    `a non-monetary decimal column must arrive as a finite number or a parseable decimal string and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read a nullable `timestamp` column.
 *
 * The pool leaves `dateStrings` unset and fixes its session timezone, so a `datetime` arrives as a
 * `Date` already interpreted in UTC.
 */
function readTimestamp(row: SqlRow, columnName: string, statementLabel: string): Date | undefined {
  const value = requireColumn(row, columnName, statementLabel);

  if (isNullish(value)) {
    return undefined;
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  throw new PromotionColumnError(
    columnName,
    statementLabel,
    `a timestamp column must arrive as a valid Date and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read a boolean column without deciding its truth.
 *
 * `cfBoolean()` is deliberately not called here: `Promotion` routes the raw persisted column
 * through `cfBoolean()` inside its own constructor, applying the ORM default `default="1"`
 * [model/entity/Promotion.cfc:L56] when the value is absent.
 *
 * The `Uint8Array` arm is not defensive padding: Hibernate maps `ormtype="boolean"` to `bit(1)`
 * and the driver surfaces that as a one-byte buffer.
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

  throw new PromotionColumnError(
    columnName,
    statementLabel,
    `a boolean column must arrive as text, a number, a boolean or a BIT buffer and this one arrived as ${describeColumnType(value)}`,
  );
}

/**
 * Read an aggregate count.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L184, L251, L270, L295]: all four legacy functions
 * declare `returntype="numeric"` and return `results[1]`, the single scalar the aggregate
 * produced. That numeric declaration is honest, and this adapter returns numbers.
 *
 * LEGACY-NOTE [model/service/PromotionService.cfc:L1094-L1100]: the SERVICE methods that forward two
 * of those counts declare `returntype="boolean"` over the same numeric value. Recorded, not
 * reproduced: AAP 0.4.2 types the honest `Promise<number>` on both, so this adapter answers a
 * number.
 */
function readCount(row: SqlRow, columnName: string, statementLabel: string): number {
  const value = requireColumn(row, columnName, statementLabel);

  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'bigint' && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }

  throw new PromotionColumnError(
    columnName,
    statementLabel,
    `a count column must arrive as an integer and this one arrived as ${describeColumnType(value)}`,
  );
}

// Statement text - method.
//
// The legacy body composes HQL over ENTITY names (`SlatwallPromotionReward`) and lets Hibernate
// resolve them to tables.

/**
 * Every column the reward hydration reads, aliased by owner.
 *
 * FETCH SHAPE for method 1: the two legacy `INNER JOIN FETCH` clauses
 * [model/dao/PromotionDAO.cfc:L66, L68] become two `INNER JOIN` clauses whose columns are
 * projected here.
 */
const ACTIVE_REWARD_PROJECTION = `SELECT
    spr.promotionRewardID as spr_promotionRewardID,
    spr.amount as spr_amount,
    spr.amountType as spr_amountType,
    spr.rewardType as spr_rewardType,
    spr.applicableTerm as spr_applicableTerm,
    spr.maximumUsePerOrder as spr_maximumUsePerOrder,
    spr.maximumUsePerItem as spr_maximumUsePerItem,
    spr.maximumUsePerQualification as spr_maximumUsePerQualification,
    spr.remoteID as spr_remoteID,
    spr.createdDateTime as spr_createdDateTime,
    spr.createdByAccountID as spr_createdByAccountID,
    spr.modifiedDateTime as spr_modifiedDateTime,
    spr.modifiedByAccountID as spr_modifiedByAccountID,
    spp.promotionPeriodID as spp_promotionPeriodID,
    spp.startDateTime as spp_startDateTime,
    spp.endDateTime as spp_endDateTime,
    spp.maximumUseCount as spp_maximumUseCount,
    spp.maximumAccountUseCount as spp_maximumAccountUseCount,
    spp.promotionID as spp_promotionID,
    spp.remoteID as spp_remoteID,
    spp.createdDateTime as spp_createdDateTime,
    spp.createdByAccountID as spp_createdByAccountID,
    spp.modifiedDateTime as spp_modifiedDateTime,
    spp.modifiedByAccountID as spp_modifiedByAccountID,
    sp.promotionID as sp_promotionID,
    sp.promotionName as sp_promotionName,
    sp.promotionSummary as sp_promotionSummary,
    sp.promotionDescription as sp_promotionDescription,
    sp.activeFlag as sp_activeFlag,
    sp.defaultImageID as sp_defaultImageID,
    sp.remoteID as sp_remoteID,
    sp.createdDateTime as sp_createdDateTime,
    sp.createdByAccountID as sp_createdByAccountID,
    sp.modifiedDateTime as sp_modifiedDateTime,
    sp.modifiedByAccountID as sp_modifiedByAccountID,
    srr.roundingRuleID as srr_roundingRuleID,
    srr.roundingRuleName as srr_roundingRuleName,
    srr.roundingRuleExpression as srr_roundingRuleExpression,
    srr.roundingRuleDirection as srr_roundingRuleDirection,
    srr.createdDateTime as srr_createdDateTime,
    srr.createdByAccountID as srr_createdByAccountID,
    srr.modifiedDateTime as srr_modifiedDateTime,
    srr.modifiedByAccountID as srr_modifiedByAccountID`;

/**
 * The join chain, porting the legacy HQL [model/dao/PromotionDAO.cfc:L64-L69].
 *
 * HQL infers each join condition from the association metadata; SQL does not, so the two foreign
 * keys are written out.
 */
const ACTIVE_REWARD_FROM = `FROM
    SwPromoReward spr
  INNER JOIN
    SwPromotionPeriod spp on spr.promotionPeriodID = spp.promotionPeriodID
  INNER JOIN
    SwPromotion sp on spp.promotionID = sp.promotionID
  LEFT JOIN
    SwRoundingRule srr on spr.roundingRuleID = srr.roundingRuleID`;

/**
 * The base predicate: reward type, the two period date bounds, and the promotion's active flag,
 * porting the legacy HQL `WHERE` clause [model/dao/PromotionDAO.cfc:L70-L77].
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L73, L75]: the DATE COMPARISONS are STRICT - `<` and
 * `>`, not `<=` and `>=`. A period that starts at exactly the compared instant does not yet apply,
 * and one that ends at exactly that instant no longer does.
 */
function activeRewardBaseWhereClause(rewardTypePlaceholders: string): string {
  return `WHERE
    spr.rewardType IN (${rewardTypePlaceholders})
  and
    (spp.startDateTime is null or spp.startDateTime < ?)
  and
    (spp.endDateTime is null or spp.endDateTime > ?)
  and
    sp.activeFlag = ?`;
}

/**
 * The promotion-qualifier existence test that opens the optional qualification block
 * [model/dao/PromotionDAO.cfc:L86].
 */
const QUALIFIER_EXISTS_CLAUSE = ` AND ( EXISTS ( SELECT pq.promotionQualifierID FROM SwPromoQual pq WHERE pq.promotionPeriodID = spp.promotionPeriodID )`;

/**
 * The promotion-code existence test, emitted in two different places by the legacy body -
 * [model/dao/PromotionDAO.cfc:L90], and again identically at L110.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L116-L127]: the legacy binds one named parameter set for
 * both occurrences.
 */
function promotionCodeExistsClause(codePlaceholders: string): string {
  return ` OR EXISTS ( SELECT c.promotionCodeID FROM SwPromotionCode c WHERE c.promotionID = sp.promotionID AND c.promotionCode IN (${codePlaceholders}) AND (c.startDateTime is null or c.startDateTime < ?) AND (c.endDateTime is null or c.endDateTime > ?) )`;
}

/**
 * The alternative that lets order-level and fulfillment-level rewards through without a qualifier
 * [model/dao/PromotionDAO.cfc:L95].
 */
function noQualificationRequiredClause(placeholders: string): string {
  return ` OR spr.rewardType IN (${placeholders})`;
}
const NO_PROMOTION_CODE_CLAUSE = ` AND ( NOT EXISTS ( SELECT c.promotionCodeID FROM SwPromotionCode c WHERE c.promotionID = sp.promotionID )`;

/**
 * Closes an opened `AND (` group [model/dao/PromotionDAO.cfc:L99, L114].
 */
const CLOSE_GROUP_CLAUSE = ' )';

// Statement text - the bounded collection reads that complete method 1's graph.
//
// SUFFICIENT - every one of the eleven predicates compares one accessor:
// `held.getBrandID() === candidateID` and its five siblings.
//
// A projection is therefore never a substitute for a hydrated aggregate.

/**
 * One many-to-many link table, described by the three names the entity metadata supplies.
 */
interface LinkTableDescriptor {
  /**
   * The physical link table [model/entity/PromotionReward.cfc:L76 `linktable`].
   */
  readonly table: string;

  /**
   * The owning-side foreign key [`fkcolumn`].
   */
  readonly ownerColumn: string;

  /**
   * The member-side foreign key [`inversejoincolumn`].
   */
  readonly memberColumn: string;
}

/**
 * `fulfillmentMethods` [model/entity/PromotionReward.cfc:L76]. `FulfillmentMethod` is out of
 * scope, so the collection collapses to the identifiers `promotionReward.ts` types it as.
 */
const REWARD_FULFILLMENT_METHOD_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardFulfillmentMethod',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'fulfillmentMethodID',
});

/**
 * `shippingAddressZones` [model/entity/PromotionReward.cfc:L77]. `AddressZone` is out of scope.
 */
const REWARD_SHIPPING_ADDRESS_ZONE_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardShipAddressZone',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'addressZoneID',
});

/**
 * `shippingMethods` [model/entity/PromotionReward.cfc:L78]. `ShippingMethod` is out of scope.
 */
const REWARD_SHIPPING_METHOD_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardShippingMethod',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'shippingMethodID',
});
const QUALIFIER_FULFILLMENT_METHOD_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualFulfillmentMethod',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'fulfillmentMethodID',
});
const QUALIFIER_SHIPPING_METHOD_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualShippingMethod',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'shippingMethodID',
});
const QUALIFIER_SHIPPING_ADDRESS_ZONE_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualShipAddressZone',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'addressZoneID',
});

// The twenty-one catalog-typed link tables.
//
// Eleven on the reward - `eligiblePriceGroups` plus five includes and five excludes
// [model/entity/PromotionReward.cfc:L74, L80-L90] - and ten on the qualifier.
//
// Schema continuity: these tables are READ exactly as they stand.

/**
 * `eligiblePriceGroups` [model/entity/PromotionReward.cfc:L74]. Note the truncated table name.
 */
const REWARD_ELIGIBLE_PRICE_GROUP_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardEligiblePriceGrp',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'priceGroupID',
});
const REWARD_BRAND_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardBrand',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'brandID',
});
const REWARD_OPTION_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardOption',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'optionID',
});
const REWARD_SKU_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardSku',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'skuID',
});
const REWARD_PRODUCT_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardProduct',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'productID',
});
const REWARD_PRODUCT_TYPE_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardProductType',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'productTypeID',
});
const REWARD_EXCLUDED_BRAND_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardExclBrand',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'brandID',
});
const REWARD_EXCLUDED_OPTION_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardExclOption',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'optionID',
});
const REWARD_EXCLUDED_SKU_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardExclSku',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'skuID',
});
const REWARD_EXCLUDED_PRODUCT_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardExclProduct',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'productID',
});
const REWARD_EXCLUDED_PRODUCT_TYPE_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardExclProductType',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'productTypeID',
});
const QUALIFIER_BRAND_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualBrand',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'brandID',
});
const QUALIFIER_OPTION_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualOption',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'optionID',
});
const QUALIFIER_SKU_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualSku',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'skuID',
});
const QUALIFIER_PRODUCT_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualProduct',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'productID',
});
const QUALIFIER_PRODUCT_TYPE_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualProductType',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'productTypeID',
});
const QUALIFIER_EXCLUDED_BRAND_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualExclBrand',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'brandID',
});
const QUALIFIER_EXCLUDED_OPTION_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualExclOption',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'optionID',
});
const QUALIFIER_EXCLUDED_SKU_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualExclSku',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'skuID',
});
const QUALIFIER_EXCLUDED_PRODUCT_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualExclProduct',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'productID',
});
const QUALIFIER_EXCLUDED_PRODUCT_TYPE_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualExclProductType',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'productTypeID',
});

/**
 * Read one link table for a set of owners.
 *
 * The three interpolated fragments are the descriptor's own table and column names, literals this
 * file owns, plus the placeholder list.
 */
function buildLinkStatement(descriptor: LinkTableDescriptor, ownerPlaceholders: string): string {
  return `SELECT
    ${descriptor.ownerColumn},
    ${descriptor.memberColumn}
FROM
    ${descriptor.table}
WHERE
    ${descriptor.ownerColumn} IN (${ownerPlaceholders})`;
}

/**
 * Read the qualifiers of a set of promotion periods.
 *
 * FETCH SHAPE: the one statement that satisfies `PromotionPeriod.promotionQualifiers`
 * [model/entity/PromotionPeriod.cfc:L63], keyed by every period identifier the reward read
 * returned.
 */
function buildPeriodQualifierStatement(periodPlaceholders: string): string {
  return `SELECT
    promotionQualifierID,
    qualifierType,
    minimumOrderQuantity,
    maximumOrderQuantity,
    minimumOrderSubtotal,
    maximumOrderSubtotal,
    minimumItemQuantity,
    maximumItemQuantity,
    minimumItemPrice,
    maximumItemPrice,
    minimumFulfillmentWeight,
    maximumFulfillmentWeight,
    rewardMatchingType,
    promotionPeriodID,
    remoteID,
    createdDateTime,
    createdByAccountID,
    modifiedDateTime,
    modifiedByAccountID
FROM
    SwPromoQual
WHERE
    promotionPeriodID IN (${periodPlaceholders})`;
}

// Statement text - method.

/**
 * Read one rounding rule by identifier, porting [model/dao/RoundingRuleDAO.cfc:L56-L64].
 */
const ROUNDING_RULE_BY_ID_STATEMENT = `SELECT
    roundingRuleID,
    roundingRuleName,
    roundingRuleExpression,
    roundingRuleDirection,
    createdDateTime,
    createdByAccountID,
    modifiedDateTime,
    modifiedByAccountID
FROM
    SwRoundingRule
WHERE
    roundingRuleID = ?`;

// No rounding-rule write statement is declared here, and this is the record of its removal.
//
// `ROUNDING_RULE_BY_ID_STATEMENT` above is the only rounding-rule statement in this file, and it
// is a read: it ports the single query of `model/dao/RoundingRuleDAO.cfc`.

// List tokenization and the empty-list short-circuits.

/**
 * Tokenize a CFML comma-list into its elements.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L122, L126, L129]: the legacy converts each list with
 * `listToArray`, which drops empty elements - `'a,,b'` yields two elements and `''` yields none -
 * and `src/lib/cfml/list.ts` reproduces that.
 */
function tokenizeList(list: string): readonly string[] {
  return listToArray(list);
}

/**
 * Derive the reward types that are exempt from the qualifier requirement, porting
 * [model/dao/PromotionDAO.cfc:L56-L62].
 *
 * Reproduced through the CFML list helpers rather than through TypeScript string work, so the
 * semantics carry over intact: `listFindNoCase` is an ELEMENT match and not a substring match.
 */
function deriveNoQualificationRequiredList(rewardTypeList: string): string {
  let noQualRequiredList = '';

  if (listFindNoCase(rewardTypeList, 'fulfillment') > 0) {
    noQualRequiredList = listAppend(noQualRequiredList, 'fulfillment');
  }

  if (listFindNoCase(rewardTypeList, 'order') > 0) {
    noQualRequiredList = listAppend(noQualRequiredList, 'order');
  }

  return noQualRequiredList;
}

// One row-to-entity factory for `PromotionReward`, plus the helpers that assemble the associations
// it needs, so there is no second site that knows how to build a reward.

/**
 * The three opaque-identifier collections a reward or a qualifier carries.
 */
interface OpaqueLinkSets {
  readonly fulfillmentMethodIDs: readonly string[];
  readonly shippingMethodIDs: readonly string[];
  readonly shippingAddressZoneIDs: readonly string[];
}

/**
 * The five catalog-typed include collections and the five exclude collections both owners carry.
 *
 * `PromotionQualifier` carries exactly these ten [model/entity/PromotionQualifier.cfc:L77-L87];
 * `PromotionReward` carries the same ten [model/entity/PromotionReward.cfc:L80-L90] plus
 * `eligiblePriceGroups`.
 */
interface CatalogLinkSets {
  readonly brands: Brand[];
  readonly options: Option[];
  readonly skus: Sku[];
  readonly products: Product[];
  readonly productTypes: ProductType[];
  readonly excludedBrands: Brand[];
  readonly excludedOptions: Option[];
  readonly excludedSkus: Sku[];
  readonly excludedProducts: Product[];
  readonly excludedProductTypes: ProductType[];
}

/**
 * The reward's eleven catalog-typed collections: the shared ten plus `eligiblePriceGroups`.
 *
 * `eligiblePriceGroups` [model/entity/PromotionReward.cfc:L74] has no qualifier counterpart, which
 * is the whole reason the reward set is separate.
 */
interface RewardCatalogLinkSets extends CatalogLinkSets {
  readonly eligiblePriceGroups: PriceGroup[];
}

/**
 * Nothing linked. Frozen and shared, so an owner with no links allocates no arrays.
 */
const NO_LINK_MEMBERS: readonly string[] = Object.freeze([]);

/**
 * Group link rows by their owner.
 *
 * The map key is the FOLDED owner identifier, because CFML struct keys are case-insensitive and
 * MySQL's default collation is too.
 */
function groupLinkMembers(
  rows: readonly SqlRow[],
  descriptor: LinkTableDescriptor,
  statementLabel: string,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const row of rows) {
    const ownerID = readIdentifier(row, descriptor.ownerColumn, statementLabel);
    const memberID = readIdentifier(row, descriptor.memberColumn, statementLabel);
    const key = foldIdentifier(ownerID);
    const members = grouped.get(key);

    if (members === undefined) {
      grouped.set(key, [memberID]);
    } else {
      members.push(memberID);
    }
  }

  return grouped;
}

/**
 * Read one owner's members out of a grouping.
 *
 * An owner with no link rows gets the shared frozen empty array, which is the same value the
 * entity constructors would have defaulted to.
 */
function linkMembersOf(grouped: Map<string, string[]>, ownerID: string): readonly string[] {
  return grouped.get(foldIdentifier(ownerID)) ?? NO_LINK_MEMBERS;
}

// The six identity-projection factories.
//
// Each turns one owner's link-row identifiers into membership tokens of the corresponding in-scope
// entity type.
//
// It promises the identifier accessor - `getBrandID()`, `getOptionID()`, `getSkuID()`,
// `getProductID()`, `getProductTypeID()`, `getPriceGroupID()` - and nothing else.

/**
 * Identity-only `Brand` tokens, for `brands` and `excludedBrands`.
 */
function toBrandProjections(brandIDs: readonly string[]): Brand[] {
  return brandIDs.map((brandID: string): Brand => new Brand({ brandID }));
}

/**
 * Identity-only `Option` tokens, for `options` and `excludedOptions`.
 *
 * `Option`'s constructor declares its twelve scalar members REQUIRED-BUT-NULLABLE rather than
 * optional, so each must be passed explicitly as `undefined`.
 */
function toOptionProjections(optionIDs: readonly string[]): Option[] {
  return optionIDs.map(
    (optionID: string): Option =>
      new Option({
        optionID,
        optionCode: undefined,
        optionName: undefined,
        optionDescription: undefined,
        sortOrder: undefined,
        optionGroup: undefined,
        defaultImageID: undefined,
        remoteID: undefined,
        createdDateTime: undefined,
        createdByAccountID: undefined,
        modifiedDateTime: undefined,
        modifiedByAccountID: undefined,
      }),
  );
}

/**
 * Identity-only `Sku` tokens, for `skus` and `excludedSkus`.
 */
function toSkuProjections(skuIDs: readonly string[]): Sku[] {
  return skuIDs.map((skuID: string): Sku => new Sku({ skuID }));
}

/**
 * Identity-only `Product` tokens, for `products` and `excludedProducts`.
 */
function toProductProjections(productIDs: readonly string[]): Product[] {
  return productIDs.map((productID: string): Product => new Product({ productID }));
}

/**
 * Identity-only `ProductType` tokens, for `productTypes` and `excludedProductTypes`.
 */
function toProductTypeProjections(productTypeIDs: readonly string[]): ProductType[] {
  return productTypeIDs.map(
    (productTypeID: string): ProductType => new ProductType({ productTypeID }),
  );
}

/**
 * Identity-only `PriceGroup` tokens, for the reward's `eligiblePriceGroups`.
 *
 * `PriceGroup`'s constructor declares its scalars and its three collections REQUIRED, so all of
 * them are passed explicitly.
 */
function toPriceGroupProjections(priceGroupIDs: readonly string[]): PriceGroup[] {
  return priceGroupIDs.map(
    (priceGroupID: string): PriceGroup =>
      new PriceGroup({
        priceGroupID,
        priceGroupIDPath: undefined,
        activeFlag: undefined,
        priceGroupName: undefined,
        priceGroupCode: undefined,
        parentPriceGroup: undefined,
        childPriceGroups: [],
        priceGroupRates: [],
        promotionRewards: [],
        createdDateTime: undefined,
        createdByAccountID: undefined,
        modifiedDateTime: undefined,
        modifiedByAccountID: undefined,
      }),
  );
}

/**
 * Hydrate one `SwRoundingRule` row, shared by method 1's `LEFT JOIN` - through a column-prefix
 * indirection - and by method 7, so the entity is constructed identically either way.
 *
 * `roundingRuleExpression` is passed through untouched.
 *
 * @param row the result row to hydrate from.
 * @param columnPrefix `''` for method 7's unprefixed projection, or `'srr_'` for method 1's joined
 * one.
 * @param statementLabel the statement name, carried into any column error so it is attributable.
 * @param valueRounder the rounding collaborator the constructed entity holds.
 */
function toRoundingRule(
  row: SqlRow,
  columnPrefix: string,
  statementLabel: string,
  valueRounder: RoundingRuleValueRounder,
): RoundingRule {
  return new RoundingRule(
    {
      roundingRuleID: readIdentifier(row, `${columnPrefix}roundingRuleID`, statementLabel),
      roundingRuleName: readOptionalText(row, `${columnPrefix}roundingRuleName`, statementLabel),
      roundingRuleExpression: readOptionalText(
        row,
        `${columnPrefix}roundingRuleExpression`,
        statementLabel,
      ),
      roundingRuleDirection: readOptionalText(
        row,
        `${columnPrefix}roundingRuleDirection`,
        statementLabel,
      ),
      createdDateTime: readTimestamp(row, `${columnPrefix}createdDateTime`, statementLabel),
      createdByAccountID: readOptionalText(
        row,
        `${columnPrefix}createdByAccountID`,
        statementLabel,
      ),
      modifiedDateTime: readTimestamp(row, `${columnPrefix}modifiedDateTime`, statementLabel),
      modifiedByAccountID: readOptionalText(
        row,
        `${columnPrefix}modifiedByAccountID`,
        statementLabel,
      ),

      // FETCH SHAPE: not read. `priceGroupRates` [model/entity/RoundingRule.cfc:L64] is an inverse
      // one-to-many owned by the price-group side, and no consumer of a rounding rule reached from
      // here traverses it.
      priceGroupRates: [],
    },
    valueRounder,
  );
}

/**
 * Hydrate one `SwPromotion` row from method 1's prefixed projection.
 *
 * `activeFlag` is handed over RAW, exactly as `readFlag` produced it: `Promotion`'s own
 * constructor applies the ORM default `default="1"` [model/entity/Promotion.cfc:L56] for an absent
 * value and then routes the result through `cfBoolean()`.
 */
function toPromotion(row: SqlRow): Promotion {
  return new Promotion({
    promotionID: readIdentifier(row, 'sp_promotionID', ACTIVE_REWARDS_STATEMENT_LABEL),
    promotionName: readOptionalText(row, 'sp_promotionName', ACTIVE_REWARDS_STATEMENT_LABEL),
    promotionSummary: readOptionalText(row, 'sp_promotionSummary', ACTIVE_REWARDS_STATEMENT_LABEL),
    promotionDescription: readOptionalText(
      row,
      'sp_promotionDescription',
      ACTIVE_REWARDS_STATEMENT_LABEL,
    ),
    activeFlag: readFlag(row, 'sp_activeFlag', ACTIVE_REWARDS_STATEMENT_LABEL),
    defaultImageID: readOptionalText(row, 'sp_defaultImageID', ACTIVE_REWARDS_STATEMENT_LABEL),
    remoteID: readOptionalText(row, 'sp_remoteID', ACTIVE_REWARDS_STATEMENT_LABEL),
    createdDateTime: readTimestamp(row, 'sp_createdDateTime', ACTIVE_REWARDS_STATEMENT_LABEL),
    createdByAccountID: readOptionalText(
      row,
      'sp_createdByAccountID',
      ACTIVE_REWARDS_STATEMENT_LABEL,
    ),
    modifiedDateTime: readTimestamp(row, 'sp_modifiedDateTime', ACTIVE_REWARDS_STATEMENT_LABEL),
    modifiedByAccountID: readOptionalText(
      row,
      'sp_modifiedByAccountID',
      ACTIVE_REWARDS_STATEMENT_LABEL,
    ),
  });
}

/**
 * Hydrate one `SwPromoQual` row.
 *
 * @param row the row to hydrate.
 * @param links the three opaque-identifier collections for this qualifier.
 * @param catalogLinks the ten catalog-typed collections for this qualifier, already projected.
 * @returns the qualifier.
 */
function toPromotionQualifier(
  row: SqlRow,
  links: OpaqueLinkSets,
  catalogLinks: CatalogLinkSets,
): PromotionQualifier {
  const label = PERIOD_QUALIFIER_STATEMENT_LABEL;

  return new PromotionQualifier({
    promotionQualifierID: readIdentifier(row, 'promotionQualifierID', label),
    qualifierType: readOptionalText(row, 'qualifierType', label),
    minimumOrderQuantity: readOptionalInteger(row, 'minimumOrderQuantity', label),
    maximumOrderQuantity: readOptionalInteger(row, 'maximumOrderQuantity', label),
    minimumOrderSubtotal: readOptionalMoney(row, 'minimumOrderSubtotal', label),
    maximumOrderSubtotal: readOptionalMoney(row, 'maximumOrderSubtotal', label),
    minimumItemQuantity: readOptionalInteger(row, 'minimumItemQuantity', label),
    maximumItemQuantity: readOptionalInteger(row, 'maximumItemQuantity', label),
    minimumItemPrice: readOptionalMoney(row, 'minimumItemPrice', label),
    maximumItemPrice: readOptionalMoney(row, 'maximumItemPrice', label),
    minimumFulfillmentWeight: readOptionalNonMonetaryDecimal(
      row,
      'minimumFulfillmentWeight',
      label,
    ),
    maximumFulfillmentWeight: readOptionalNonMonetaryDecimal(
      row,
      'maximumFulfillmentWeight',
      label,
    ),
    rewardMatchingType: narrowOrAbsent(
      readOptionalText(row, 'rewardMatchingType', label),
      REWARD_MATCHING_TYPES,
    ),
    fulfillmentMethodIDs: links.fulfillmentMethodIDs,
    shippingMethodIDs: links.shippingMethodIDs,
    shippingAddressZoneIDs: links.shippingAddressZoneIDs,
    brands: catalogLinks.brands,
    options: catalogLinks.options,
    skus: catalogLinks.skus,
    products: catalogLinks.products,
    productTypes: catalogLinks.productTypes,
    excludedBrands: catalogLinks.excludedBrands,
    excludedOptions: catalogLinks.excludedOptions,
    excludedSkus: catalogLinks.excludedSkus,
    excludedProducts: catalogLinks.excludedProducts,
    excludedProductTypes: catalogLinks.excludedProductTypes,

    remoteID: readOptionalText(row, 'remoteID', label),
    createdDateTime: readTimestamp(row, 'createdDateTime', label),
    createdByAccountID: readOptionalText(row, 'createdByAccountID', label),
    modifiedDateTime: readTimestamp(row, 'modifiedDateTime', label),
    modifiedByAccountID: readOptionalText(row, 'modifiedByAccountID', label),
  });
}

/**
 * Hydrate one `SwPromotionPeriod` row from method 1's prefixed projection, taking the shared
 * promotion instance, the period's already-assembled qualifiers.
 */
function toPromotionPeriod(
  row: SqlRow,
  promotion: Promotion,
  promotionQualifiers: PromotionQualifier[],
  now: () => Date,
): PromotionPeriod {
  const label = ACTIVE_REWARDS_STATEMENT_LABEL;

  return new PromotionPeriod({
    promotionPeriodID: readIdentifier(row, 'spp_promotionPeriodID', label),
    startDateTime: readTimestamp(row, 'spp_startDateTime', label),
    endDateTime: readTimestamp(row, 'spp_endDateTime', label),
    maximumUseCount: readOptionalInteger(row, 'spp_maximumUseCount', label),
    maximumAccountUseCount: readOptionalInteger(row, 'spp_maximumAccountUseCount', label),
    promotion,
    promotionID: readOptionalText(row, 'spp_promotionID', label),
    remoteID: readOptionalText(row, 'spp_remoteID', label),
    createdDateTime: readTimestamp(row, 'spp_createdDateTime', label),
    createdByAccountID: readOptionalText(row, 'spp_createdByAccountID', label),
    modifiedDateTime: readTimestamp(row, 'spp_modifiedDateTime', label),
    modifiedByAccountID: readOptionalText(row, 'spp_modifiedByAccountID', label),
    now,

    // FETCH SHAPE: the inverse reward collection stays empty - see `toPromotion`. The qualifier
    // collection is populated, because the promotion engine walks it and there is no lazy loader
    // to fall back on.
    promotionQualifiers,
  });
}

/**
 * LEGACY-DEFECT [model/entity/PromotionReward.cfc:L57]: the component declares
 * `hb_permission="promotionPeriod.promtionRewards"` - `promtionRewards` is missing its `o`.
 * Preserved deliberately; do not fix without a product decision.
 *
 * @param row the reward row, carrying the prefixed projection.
 * @param promotionPeriod the shared period instance.
 * @param roundingRule the shared rule instance, or `undefined` when the `LEFT JOIN` matched
 * nothing.
 * @param links the three opaque-identifier collections for this reward.
 * @param catalogLinks the eleven catalog-typed collections for this reward, already projected.
 * @returns the reward.
 */
function toPromotionReward(
  row: SqlRow,
  promotionPeriod: PromotionPeriod,
  roundingRule: RoundingRule | undefined,
  links: OpaqueLinkSets,
  catalogLinks: RewardCatalogLinkSets,
): PromotionReward {
  const label = ACTIVE_REWARDS_STATEMENT_LABEL;

  return new PromotionReward({
    promotionRewardID: readIdentifier(row, 'spr_promotionRewardID', label),
    amount: readOptionalMoney(row, 'spr_amount', label),
    amountType: narrowOrAbsent(readOptionalText(row, 'spr_amountType', label), AMOUNT_TYPES),
    rewardType: readOptionalText(row, 'spr_rewardType', label),
    applicableTerm: narrowOrAbsent(
      readOptionalText(row, 'spr_applicableTerm', label),
      APPLICABLE_TERMS,
    ),
    maximumUsePerOrder: readOptionalInteger(row, 'spr_maximumUsePerOrder', label),
    maximumUsePerItem: readOptionalInteger(row, 'spr_maximumUsePerItem', label),
    maximumUsePerQualification: readOptionalInteger(row, 'spr_maximumUsePerQualification', label),
    promotionPeriod,
    roundingRule,
    fulfillmentMethodIDs: links.fulfillmentMethodIDs,
    shippingAddressZoneIDs: links.shippingAddressZoneIDs,
    shippingMethodIDs: links.shippingMethodIDs,

    // The ten catalog collections, spread as one unit - see the matching note in
    // `toPromotionQualifier` for why they are spread rather than named one at a time.
    ...catalogLinks,
    remoteID: readOptionalText(row, 'spr_remoteID', label),
    createdDateTime: readTimestamp(row, 'spr_createdDateTime', label),
    createdByAccountID: readOptionalText(row, 'spr_createdByAccountID', label),
    modifiedDateTime: readTimestamp(row, 'spr_modifiedDateTime', label),
    modifiedByAccountID: readOptionalText(row, 'spr_modifiedByAccountID', label),
    eligiblePriceGroups: catalogLinks.eligiblePriceGroups,
    brands: catalogLinks.brands,
    options: catalogLinks.options,
    skus: catalogLinks.skus,
    products: catalogLinks.products,
    productTypes: catalogLinks.productTypes,
    excludedBrands: catalogLinks.excludedBrands,
    excludedOptions: catalogLinks.excludedOptions,
    excludedSkus: catalogLinks.excludedSkus,
    excludedProducts: catalogLinks.excludedProducts,
    excludedProductTypes: catalogLinks.excludedProductTypes,
  });
}

/**
 * Map one sale-price row onto the port's row projection.
 *
 * Not ENTITY HYDRATION, and that is the port's decision rather than a shortcut: the legacy returns
 * a CFML query object [model/dao/PromotionDAO.cfc:L590].
 *
 * `originalPrice` and `salePrice` both arrive as DECIMAL STRINGS and go straight into `Money` - no
 * `Number()` and no arithmetic here.
 */
function toSalePricePromotionRewardRow(row: SqlRow): SalePricePromotionRewardRow {
  const label = SALE_PRICE_STATEMENT_LABEL;
  const originalPrice = readOptionalMoney(row, 'originalPrice', label);
  const roundingRuleID = readOptionalText(row, 'roundingRuleID', label);
  const salePriceExpirationDateTime = readTimestamp(row, 'salePriceExpirationDateTime', label);

  // Under `exactOptionalPropertyTypes` the three optional members must be ABSENT to mean absent,
  // so each is spread in only when it has a value.
  return {
    skuID: readIdentifier(row, 'skuID', label),
    ...(originalPrice === undefined ? {} : { originalPrice }),
    discountLevel: narrowOrReport(
      readIdentifier(row, 'discountLevel', label),
      DISCOUNT_LEVELS,
      'discountLevel',
      label,
    ),
    salePriceDiscountType: narrowOrReport(
      readIdentifier(row, 'salePriceDiscountType', label),
      SALE_PRICE_DISCOUNT_TYPES,
      'salePriceDiscountType',
      label,
    ),
    salePrice: readMoney(row, 'salePrice', label),
    ...(roundingRuleID === undefined ? {} : { roundingRuleID }),
    ...(salePriceExpirationDateTime === undefined ? {} : { salePriceExpirationDateTime }),
    promotionID: readIdentifier(row, 'promotionID', label),
  };
}

/**
 * Resolve the promotion identifier the two period use-count statements bind:
 * `arguments.promotionPeriod.getPromotion().getPromotionID()`
 * [model/dao/PromotionDAO.cfc:L138, and identically at L193].
 *
 * The count is taken for the period's PROMOTION rather than for the period itself, so every period
 * of a promotion shares one use count.
 */
function requirePromotionID(promotionPeriod: PromotionPeriod, methodName: string): string {
  const promotion = promotionPeriod.getPromotion();

  if (promotion === undefined) {
    throw new PromotionAssociationError('PromotionPeriod', 'promotion', methodName);
  }

  return promotion.getPromotionID();
}

/**
 * The names of the link sets whose members are out of SCOPE and therefore collapse to opaque
 * identifiers.
 *
 * Declared as a tuple of literal names, and the descriptor and grouping records are keyed by it,
 * so a set added to one and forgotten in the other does not compile.
 */
const OPAQUE_LINK_SET_NAMES = [
  'fulfillmentMethods',
  'shippingMethods',
  'shippingAddressZones',
] as const;

/**
 * One of the three opaque link-set names.
 */
type OpaqueLinkSetName = (typeof OPAQUE_LINK_SET_NAMES)[number];

/**
 * The three opaque-identifier link tables that serve one owner kind.
 */
type OpaqueLinkDescriptorSet = Readonly<Record<OpaqueLinkSetName, LinkTableDescriptor>>;

/**
 * The reward's three opaque-identifier sets [model/entity/PromotionReward.cfc:L76-L78].
 *
 * FETCH SHAPE: three statements, each keyed by every reward identifier the invocation resolved at
 * once.
 */
const REWARD_OPAQUE_LINK_DESCRIPTORS: OpaqueLinkDescriptorSet = Object.freeze({
  fulfillmentMethods: REWARD_FULFILLMENT_METHOD_LINK,
  shippingMethods: REWARD_SHIPPING_METHOD_LINK,
  shippingAddressZones: REWARD_SHIPPING_ADDRESS_ZONE_LINK,
});

/**
 * The qualifier's three opaque-identifier sets [model/entity/PromotionQualifier.cfc:L73-L75].
 */
const QUALIFIER_OPAQUE_LINK_DESCRIPTORS: OpaqueLinkDescriptorSet = Object.freeze({
  fulfillmentMethods: QUALIFIER_FULFILLMENT_METHOD_LINK,
  shippingMethods: QUALIFIER_SHIPPING_METHOD_LINK,
  shippingAddressZones: QUALIFIER_SHIPPING_ADDRESS_ZONE_LINK,
});

/**
 * The three groupings one opaque link read produces, keyed by folded owner identifier.
 */
type OpaqueLinkGrouping = Readonly<Record<OpaqueLinkSetName, Map<string, string[]>>>;

/**
 * The ten catalog-typed link tables that serve one owner kind.
 *
 * Declared as a keyed set rather than a positional tuple so the read loop can name each collection
 * it is filling.
 */
interface CatalogLinkDescriptorSet {
  readonly brands: LinkTableDescriptor;
  readonly options: LinkTableDescriptor;
  readonly skus: LinkTableDescriptor;
  readonly products: LinkTableDescriptor;
  readonly productTypes: LinkTableDescriptor;
  readonly excludedBrands: LinkTableDescriptor;
  readonly excludedOptions: LinkTableDescriptor;
  readonly excludedSkus: LinkTableDescriptor;
  readonly excludedProducts: LinkTableDescriptor;
  readonly excludedProductTypes: LinkTableDescriptor;
}

/**
 * The reward's ten shared catalog tables [model/entity/PromotionReward.cfc:L80-L90].
 */
const REWARD_CATALOG_LINK_DESCRIPTORS: CatalogLinkDescriptorSet = Object.freeze({
  brands: REWARD_BRAND_LINK,
  options: REWARD_OPTION_LINK,
  skus: REWARD_SKU_LINK,
  products: REWARD_PRODUCT_LINK,
  productTypes: REWARD_PRODUCT_TYPE_LINK,
  excludedBrands: REWARD_EXCLUDED_BRAND_LINK,
  excludedOptions: REWARD_EXCLUDED_OPTION_LINK,
  excludedSkus: REWARD_EXCLUDED_SKU_LINK,
  excludedProducts: REWARD_EXCLUDED_PRODUCT_LINK,
  excludedProductTypes: REWARD_EXCLUDED_PRODUCT_TYPE_LINK,
});

/**
 * The qualifier's ten [model/entity/PromotionQualifier.cfc:L77-L87].
 */
const QUALIFIER_CATALOG_LINK_DESCRIPTORS: CatalogLinkDescriptorSet = Object.freeze({
  brands: QUALIFIER_BRAND_LINK,
  options: QUALIFIER_OPTION_LINK,
  skus: QUALIFIER_SKU_LINK,
  products: QUALIFIER_PRODUCT_LINK,
  productTypes: QUALIFIER_PRODUCT_TYPE_LINK,
  excludedBrands: QUALIFIER_EXCLUDED_BRAND_LINK,
  excludedOptions: QUALIFIER_EXCLUDED_OPTION_LINK,
  excludedSkus: QUALIFIER_EXCLUDED_SKU_LINK,
  excludedProducts: QUALIFIER_EXCLUDED_PRODUCT_LINK,
  excludedProductTypes: QUALIFIER_EXCLUDED_PRODUCT_TYPE_LINK,
});

/**
 * The ten groupings the catalog link reads produce, keyed by folded owner identifier.
 */
type CatalogLinkGrouping = {
  readonly [Collection in keyof CatalogLinkDescriptorSet]: Map<string, string[]>;
};

/**
 * The eleventh grouping, the reward's alone [model/entity/PromotionReward.cfc:L74].
 */
interface RewardCatalogLinkGrouping extends CatalogLinkGrouping {
  readonly eligiblePriceGroups: Map<string, string[]>;
}

/**
 * The order the ten catalog link tables are read in, and therefore the order their statements are
 * emitted in.
 *
 * Fixed and frozen so the emitted statement sequence is a deterministic function of the call
 * rather than of object-key iteration order, which is what lets a suite assert it.
 */
const CATALOG_LINK_READ_ORDER: readonly (keyof CatalogLinkDescriptorSet)[] = Object.freeze([
  'brands',
  'options',
  'skus',
  'products',
  'productTypes',
  'excludedBrands',
  'excludedOptions',
  'excludedSkus',
  'excludedProducts',
  'excludedProductTypes',
]);

/**
 * Turn one owner's slice of a catalog grouping into the ten identity-projected collections the
 * entity constructor adopts.
 *
 * @param grouping the ten groupings, keyed by folded owner identifier.
 * @param ownerID the reward or qualifier identifier, in any casing.
 * @returns the ten collections, each holding identity-complete membership tokens.
 */
function toCatalogLinkSets(grouping: CatalogLinkGrouping, ownerID: string): CatalogLinkSets {
  return {
    brands: toBrandProjections(linkMembersOf(grouping.brands, ownerID)),
    options: toOptionProjections(linkMembersOf(grouping.options, ownerID)),
    skus: toSkuProjections(linkMembersOf(grouping.skus, ownerID)),
    products: toProductProjections(linkMembersOf(grouping.products, ownerID)),
    productTypes: toProductTypeProjections(linkMembersOf(grouping.productTypes, ownerID)),
    excludedBrands: toBrandProjections(linkMembersOf(grouping.excludedBrands, ownerID)),
    excludedOptions: toOptionProjections(linkMembersOf(grouping.excludedOptions, ownerID)),
    excludedSkus: toSkuProjections(linkMembersOf(grouping.excludedSkus, ownerID)),
    excludedProducts: toProductProjections(linkMembersOf(grouping.excludedProducts, ownerID)),
    excludedProductTypes: toProductTypeProjections(
      linkMembersOf(grouping.excludedProductTypes, ownerID),
    ),
  };
}

/**
 * The reward variant: the ten shared collections plus `eligiblePriceGroups`.
 *
 * @param grouping the eleven groupings, keyed by folded owner identifier.
 * @param rewardID the reward identifier, in any casing.
 * @returns the eleven collections, each holding identity-complete membership tokens.
 */
function toRewardCatalogLinkSets(
  grouping: RewardCatalogLinkGrouping,
  rewardID: string,
): RewardCatalogLinkSets {
  return {
    ...toCatalogLinkSets(grouping, rewardID),
    eligiblePriceGroups: toPriceGroupProjections(
      linkMembersOf(grouping.eligiblePriceGroups, rewardID),
    ),
  };
}

/**
 * Ten empty groupings, for the case where there is no owner to key a read by.
 */
function emptyCatalogLinkGrouping(): CatalogLinkGrouping {
  return {
    brands: new Map<string, string[]>(),
    options: new Map<string, string[]>(),
    skus: new Map<string, string[]>(),
    products: new Map<string, string[]>(),
    productTypes: new Map<string, string[]>(),
    excludedBrands: new Map<string, string[]>(),
    excludedOptions: new Map<string, string[]>(),
    excludedSkus: new Map<string, string[]>(),
    excludedProducts: new Map<string, string[]>(),
    excludedProductTypes: new Map<string, string[]>(),
  };
}

/**
 * Reduce identifiers to the distinct ones, comparing case-insensitively and keeping first-seen
 * order.
 *
 * CFML parity [model/service/PromotionService.cfc:L192-L222]: CFML struct keys are
 * case-insensitive and the promotion engine keys its per-period cache with them, so two
 * identifiers differing only in case are one key there and are folded to one key here.
 */
function dedupeIdentifiers(identifiers: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const distinct: string[] = [];

  for (const identifier of identifiers) {
    const key = foldIdentifier(identifier);

    if (!seen.has(key)) {
      seen.add(key);
      distinct.push(identifier);
    }
  }

  return distinct;
}

/**
 * The MySQL implementation of `PromotionRepository`.
 *
 * Seven methods, exactly the seven the port declares, all of them `async` because all seven reach
 * the database, and all SEVEN are READS.
 *
 * For one REVISION this READ "Eight methods, exactly the eight the port declares... The eighth,
 * `saveRoundingRule`, is the only write in this file".
 */
export class MysqlPromotionRepository implements PromotionRepository {
  /**
   * The narrow prepared-statement surface every read goes through.
   *
   * JUDGMENT CALL: the executor is a CONSTRUCTOR PARAMETER and never a module singleton, and that
   * is a mandatory design constraint rather than a convenience.
   *
   * It also keeps the one sanctioned module-scope pool in `src/repositories/mysql/connection.ts`
   * from leaking into this file.
   */
  private readonly executor: PreparedStatementExecutor;

  /**
   * The rounding collaborator every hydrated `RoundingRule` is constructed with.
   *
   * JUDGMENT CALL: injected here rather than resolved inside the hydration, for the same reason as
   * the executor. This ADAPTER never ROUNDS ANYTHING: it hands the collaborator to the entity and
   * does nothing else with it.
   */
  private readonly valueRounder: RoundingRuleValueRounder;

  /**
   * The request clock every date-dependent read here is bound to.
   */
  private readonly requestClock: PromotionRequestClock;

  /**
   * No audit actor is injected here, and the reason is recorded rather than left as an asymmetry.
   *
   * @param executor the prepared-statement executor this repository reads through.
   * @param valueRounder the rounding arithmetic a hydrated `RoundingRule` delegates to.
   * @param requestClock the one request epoch every date comparison in this adapter reads.
   */
  constructor(
    executor: PreparedStatementExecutor,
    valueRounder: RoundingRuleValueRounder,
    requestClock: PromotionRequestClock,
  ) {
    this.executor = executor;
    this.valueRounder = valueRounder;
    this.requestClock = requestClock;
  }

  /**
   * The active rewards for a set of reward types and supplied promotion codes.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L117, L118, L321]: `now()` is server-local time, and the
   * active flag is bound as a numeric `1` here but as a `cf_sql_bit` in the sale-price statement.
   *
   * @param rewardTypeList comma-delimited reward types to match.
   * @param promotionCodeList comma-delimited promotion codes the caller supplied.
   * @param qualificationRequired legacy default `false` [model/dao/PromotionDAO.cfc:L54]; when
   * true, an additional alternation requires a qualifier, a valid supplied code, or an exempt
   * reward type.
   * @returns The matching rewards, in the engine's own unspecified order.
   */
  async getActivePromotionRewards(
    rewardTypeList: string,
    promotionCodeList: string,
    qualificationRequired?: boolean,
  ): Promise<PromotionReward[]> {
    // The port makes the parameter optional, so the legacy default `false`
    // [model/dao/PromotionDAO.cfc:L54] is applied here explicitly rather than inherited.
    const qualificationIsRequired = qualificationRequired ?? false;

    const noQualRequiredList = deriveNoQualificationRequiredList(rewardTypeList);
    const rewardTypes = tokenizeList(rewardTypeList);
    const promotionCodes = tokenizeList(promotionCodeList);
    const noQualRequiredTypes = tokenizeList(noQualRequiredList);

    // JUDGMENT CALL: an empty `rewardTypeList` returns no rewards without issuing a statement, a
    // documented normalization rather than a faithful reproduction.
    if (rewardTypes.length < 1) {
      return [];
    }

    // Individual `sqlPlaceholderList` call below applies the protocol ceiling to its own count,
    // and that was not enough: this statement's width is a SUM, and the promotion-code list
    // contributes to it twice.
    //
    // The reward types, plus the two period bounds and the active flag -> types + 3 * inside the
    // qualification group only: the codes.
    const codeArmIsEmitted = cfLen(promotionCodeList) > 0 && promotionCodes.length > 0;
    const noQualArmIsEmitted = cfLen(noQualRequiredList) > 0 && noQualRequiredTypes.length > 0;
    const placeholderCount =
      rewardTypes.length +
      3 +
      (qualificationIsRequired && codeArmIsEmitted ? promotionCodes.length + 2 : 0) +
      (qualificationIsRequired && noQualArmIsEmitted ? noQualRequiredTypes.length : 0) +
      (codeArmIsEmitted ? promotionCodes.length + 2 : 0);

    if (!isPreparablePlaceholderCount(placeholderCount)) {
      throw new PromotionRewardPlaceholderBudgetError(placeholderCount);
    }

    // CFML parity [model/dao/PromotionDAO.cfc:L117]: the single captured instant. Read once, here,
    // and bound everywhere a date is compared.
    const capturedInstant = this.requestClock.now();

    // The provider the period entity's constructor requires.
    const now = (): Date => new Date(capturedInstant.getTime());

    const clauses: string[] = [
      ACTIVE_REWARD_PROJECTION,
      ACTIVE_REWARD_FROM,
      activeRewardBaseWhereClause(sqlPlaceholderList(rewardTypes.length)),
    ];

    // Text and binds move together, in the legacy's own clause order: the reward types, then the
    // instant twice for the two period bounds [model/dao/PromotionDAO.cfc:L73, L75].
    const params: (string | number | Date)[] = [
      ...rewardTypes,
      capturedInstant,
      capturedInstant,
      1,
    ];

    // The whole alternation [model/dao/PromotionDAO.cfc:L80-L100] is emitted only when
    // qualification is required, and the two `OR` arms inside it only when their list is
    // non-empty: `<cfif len(promotionCodeList)>` at L89 and `<cfif len(noQualRequiredList)>` at
    // L94.
    if (qualificationIsRequired) {
      clauses.push(QUALIFIER_EXISTS_CLAUSE);
      if (codeArmIsEmitted) {
        clauses.push(promotionCodeExistsClause(sqlPlaceholderList(promotionCodes.length)));
        params.push(...promotionCodes, capturedInstant, capturedInstant);
      }

      // CFML parity [model/dao/PromotionDAO.cfc:L94, L121]: the emission test and the BIND test
      // are written differently - `len(noQualRequiredList)` guards the clause, and its conjunction
      // with `arguments.qualificationRequired` guards the bind - and they agree because the clause
      // only exists inside that block.
      if (noQualArmIsEmitted) {
        clauses.push(noQualificationRequiredClause(sqlPlaceholderList(noQualRequiredTypes.length)));
        params.push(...noQualRequiredTypes);
      }

      clauses.push(CLOSE_GROUP_CLAUSE);
    }
    clauses.push(NO_PROMOTION_CODE_CLAUSE);

    if (codeArmIsEmitted) {
      clauses.push(promotionCodeExistsClause(sqlPlaceholderList(promotionCodes.length)));
      params.push(...promotionCodes, capturedInstant, capturedInstant);
    }

    clauses.push(CLOSE_GROUP_CLAUSE);

    const rows = await this.executor.execute(clauses.join('\n'), params);

    if (rows.length < 1) {
      return [];
    }

    return this.hydrateActiveRewards(rows, now);
  }

  /**
   * How many times any account has used the promotion behind a promotion period.
   *
   * LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L177]: the clause that applies the counted window's
   * UPPER bound is guarded by `not isNull(arguments.promotionPeriod.getStartDateTime())` - a
   * duplicated test of the START date where an END-date test is plainly intended.
   * Preserved deliberately; do not fix without a product decision.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L134-L296]: the four use-count queries are asymmetric
   * in three independent ways, none of them harmonized.
   *
   * @param promotionPeriod The period whose promotion is counted, which must already be
   * materialized because the legacy body reaches through it [model/dao/PromotionDAO.cfc:L138].
   * @returns The count.
   * @throws `PromotionAssociationError` when the period's promotion is absent, where the legacy
   * body raises too.
   */
  async getPromotionPeriodUseCount(promotionPeriod: PromotionPeriod): Promise<number> {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: requirePromotionID(promotionPeriod, 'getPromotionPeriodUseCount'),

      // CFML parity [model/dao/PromotionDAO.cfc:L173-L178]: the entity's `undefined` for an absent
      // bound becomes the statement module's `null`, the single spelling it uses for "no date" and
      // the same single state CFML's `isNull()` tests.
      startDateTime: promotionPeriod.getStartDateTime() ?? null,
      endDateTime: promotionPeriod.getEndDateTime() ?? null,
    });

    return await this.executeUseCount(statement, PERIOD_USE_COUNT_STATEMENT_LABEL);
  }

  /**
   * How many times one account has used the promotion behind a promotion period.
   *
   * LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L244]: the same duplicated `getStartDateTime()`
   * guard as its sibling, in this method's own body, immediately after its own correct start/end
   * pair at L240-L241.
   * Preserved deliberately; do not fix without a product decision.
   *
   * @param promotionPeriod The period whose promotion is counted, with its promotion materialized.
   * @param accountID Opaque identifier of the account, which is what the legacy bound after
   * reducing `required any account` to `getAccountID()` [model/dao/PromotionDAO.cfc:L193].
   * @returns The count.
   * @throws `PromotionAssociationError` when the period's promotion is absent.
   */
  async getPromotionPeriodAccountUseCount(
    promotionPeriod: PromotionPeriod,
    accountID: string,
  ): Promise<number> {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodAccountUseCount({
      promotionID: requirePromotionID(promotionPeriod, 'getPromotionPeriodAccountUseCount'),
      startDateTime: promotionPeriod.getStartDateTime() ?? null,
      endDateTime: promotionPeriod.getEndDateTime() ?? null,
      accountID,
    });

    return await this.executeUseCount(statement, PERIOD_USE_COUNT_STATEMENT_LABEL);
  }

  /**
   * How many placed orders have used a promotion code.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L262]: the order-status test is a bare `!=` with no
   * null tolerance, unlike either period query.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L259-L260]: the legacy joins `pc.orders`, which
   * `model/entity/PromotionCode.cfc:L68` declares `lazy="extra"`.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L254-L272]: there is no DATE WINDOW. The code queries
   * count every qualifying order regardless of when it was placed, while both period queries
   * narrow by the period's dates - the third of the three asymmetries.
   *
   * @param promotionCode The code whose use is counted [model/dao/PromotionDAO.cfc:L267].
   * @returns The count.
   */
  async getPromotionCodeUseCount(promotionCode: PromotionCode): Promise<number> {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionCodeUseCount({
      promotionCodeID: promotionCode.getPromotionCodeID(),
    });

    return await this.executeUseCount(statement, CODE_USE_COUNT_STATEMENT_LABEL);
  }

  /**
   * How many placed orders belonging to one account have used a promotion code.
   *
   * @param promotionCode The code whose use is counted for that account.
   * @param accountID Opaque identifier of the account [model/dao/PromotionDAO.cfc:L292].
   * @returns The count.
   */
  async getPromotionCodeAccountUseCount(
    promotionCode: PromotionCode,
    accountID: string,
  ): Promise<number> {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionCodeAccountUseCount({
      promotionCodeID: promotionCode.getPromotionCodeID(),
      accountID,
    });

    return await this.executeUseCount(statement, CODE_USE_COUNT_STATEMENT_LABEL);
  }

  /**
   * The winning sale-price rows: the lowest sale price per SKU across every unconditional reward.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L306, L317, L319]: one instant, captured once and reused
   * by the preliminary query and all six UNION branches, with inclusive date comparisons.
   *
   * LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L359, L390, L423, L456, L497, L538]: all six branches
   * guard the product filter with `structKeyExists` and no `len()` check, so a present but empty
   * identifier is bound and every branch then matches nothing.
   * Preserved deliberately; do not fix without a product decision.
   *
   * @param productID Optional product identifier narrowing every branch.
   * @returns The winning rows, unrounded, with ties left unresolved.
   */
  async getSalePricePromotionRewardsQuery(
    productID?: string,
  ): Promise<SalePricePromotionRewardRow[]> {
    // CFML parity [model/dao/PromotionDAO.cfc:L306]: `var timeNow = now()`, captured once - and
    // captured from the INJECTED request clock, so this reduction and the active-reward statement
    // above evaluate their windows against one instant rather than two.
    const capturedInstant = this.requestClock.now();

    // JUDGMENT CALL: key presence is preserved through the call.
    const statement =
      productID === undefined
        ? buildSalePricePromotionRewardsStatement({
            now: capturedInstant,
            dialect: STATEMENT_DIALECT,
          })
        : buildSalePricePromotionRewardsStatement({
            now: capturedInstant,
            dialect: STATEMENT_DIALECT,
            productID,
          });

    const rows = await this.executor.execute(statement.sql, statement.params);

    return rows.map(toSalePricePromotionRewardRow);
  }

  /**
   * Load one rounding rule by its identifier.
   *
   * Ports [model/dao/RoundingRuleDAO.cfc:L51-L67], hosted on this port by design - see the
   * statement constant for the projection-widening decision.
   *
   * JUDGMENT CALL: `undefined` on a miss is a port-mandated normalization.
   *
   * @param roundingRuleID Identifier of the rule to load; required in the legacy signature
   * [model/dao/RoundingRuleDAO.cfc:L52].
   * @returns The rule, or `undefined` when there is none.
   */
  async getRoundingRuleQuery(roundingRuleID: string): Promise<RoundingRule | undefined> {
    const rows = await this.executor.execute(ROUNDING_RULE_BY_ID_STATEMENT, [roundingRuleID]);

    // `noUncheckedIndexedAccess` makes this `SqlRow | undefined` and it is narrowed explicitly; a
    // non-null assertion is never used anywhere in this file. An empty result is the documented
    // miss, not a fault.
    const row = rows[0];

    if (row === undefined) {
      return undefined;
    }

    return toRoundingRule(row, '', ROUNDING_RULE_STATEMENT_LABEL, this.valueRounder);
  }

  /**
   * Hydrate the rows `getActivePromotionRewards` produced into rewards, materializing exactly the
   * associations that method's fetch-shape decision names.
   *
   * @param rows the reward rows `getActivePromotionRewards` read, in the order the database
   * produced them - deliberately not an order this file imposes.
   * @param now that method's single captured instant, as the provider the period entity requires.
   * @returns the hydrated rewards, in row order.
   */
  private async hydrateActiveRewards(
    rows: readonly SqlRow[],
    now: () => Date,
  ): Promise<PromotionReward[]> {
    const label = ACTIVE_REWARDS_STATEMENT_LABEL;
    const rewardIDs = dedupeIdentifiers(
      rows.map((row): string => readIdentifier(row, 'spr_promotionRewardID', label)),
    );
    const periodIDs = dedupeIdentifiers(
      rows.map((row): string => readIdentifier(row, 'spp_promotionPeriodID', label)),
    );

    // Read sequentially rather than concurrently.
    const rewardLinks = await this.readOpaqueLinkGrouping(
      rewardIDs,
      REWARD_OPAQUE_LINK_DESCRIPTORS,
      REWARD_LINK_STATEMENT_LABEL,
    );

    // The reward's ten catalog-typed sets plus `eligiblePriceGroups`, read here and only here.
    // `readOpaqueLinkGrouping` above deliberately does not touch them.
    const rewardCatalogLinks = await this.readRewardCatalogLinkGrouping(rewardIDs);
    const qualifiersByPeriod = await this.readPeriodQualifiers(periodIDs);

    const promotions = new Map<string, Promotion>();
    const promotionPeriods = new Map<string, PromotionPeriod>();
    const roundingRules = new Map<string, RoundingRule>();
    const rewards: PromotionReward[] = [];

    for (const row of rows) {
      const promotionKey = foldIdentifier(readIdentifier(row, 'sp_promotionID', label));
      let promotion = promotions.get(promotionKey);

      if (promotion === undefined) {
        promotion = toPromotion(row);
        promotions.set(promotionKey, promotion);
      }

      const periodKey = foldIdentifier(readIdentifier(row, 'spp_promotionPeriodID', label));
      let promotionPeriod = promotionPeriods.get(periodKey);

      if (promotionPeriod === undefined) {
        // A period with no qualifier rows gets a FRESH empty array rather than a shared one: the
        // entity adopts the array by reference so its bidirectional helpers can mutate it.
        promotionPeriod = toPromotionPeriod(
          row,
          promotion,
          qualifiersByPeriod.get(periodKey) ?? [],
          now,
        );
        promotionPeriods.set(periodKey, promotionPeriod);
      }

      // The rounding rule arrives through a `LEFT JOIN`, so its identifier column is NULL for
      // every reward that has no rule - the common case.
      const roundingRuleID = readOptionalText(row, 'srr_roundingRuleID', label);
      let roundingRule: RoundingRule | undefined;

      if (roundingRuleID !== undefined) {
        const ruleKey = foldIdentifier(roundingRuleID);
        roundingRule = roundingRules.get(ruleKey);

        if (roundingRule === undefined) {
          roundingRule = toRoundingRule(row, 'srr_', label, this.valueRounder);
          roundingRules.set(ruleKey, roundingRule);
        }
      }

      const rewardID = readIdentifier(row, 'spr_promotionRewardID', label);

      rewards.push(
        toPromotionReward(
          row,
          promotionPeriod,
          roundingRule,
          {
            fulfillmentMethodIDs: linkMembersOf(rewardLinks.fulfillmentMethods, rewardID),
            shippingMethodIDs: linkMembersOf(rewardLinks.shippingMethods, rewardID),
            shippingAddressZoneIDs: linkMembersOf(rewardLinks.shippingAddressZones, rewardID),
          },
          toRewardCatalogLinkSets(rewardCatalogLinks, rewardID),
        ),
      );
    }

    return rewards;
  }

  /**
   * Read the three opaque-identifier link tables for one set of owners.
   *
   * Shared by the reward owners and the qualifier owners, which differ only in their descriptors
   * and their label.
   *
   * @param ownerIDs the distinct owner identifiers.
   * @param descriptors which three link tables to read - the reward set or the qualifier set.
   * @param statementLabel which family of statement it is, for fault messages.
   * @returns the three groupings, keyed by folded owner identifier.
   */
  private async readOpaqueLinkGrouping(
    ownerIDs: readonly string[],
    descriptors: OpaqueLinkDescriptorSet,
    statementLabel: string,
  ): Promise<OpaqueLinkGrouping> {
    // Built by iterating the name tuple rather than by naming three members three times.
    const grouping: Record<OpaqueLinkSetName, Map<string, string[]>> = {
      fulfillmentMethods: new Map<string, string[]>(),
      shippingMethods: new Map<string, string[]>(),
      shippingAddressZones: new Map<string, string[]>(),
    };

    if (ownerIDs.length < 1) {
      return grouping;
    }

    const placeholders = sqlPlaceholderList(ownerIDs.length);

    // Sequential, and deliberately so.
    for (const name of OPAQUE_LINK_SET_NAMES) {
      const descriptor = descriptors[name];
      const rows = await this.executor.execute(
        buildLinkStatement(descriptor, placeholders),
        ownerIDs,
      );

      grouping[name] = groupLinkMembers(rows, descriptor, statementLabel);
    }

    return grouping;
  }

  /**
   * Read the ten catalog-typed link tables for one set of owners.
   *
   * TEN statements, each keyed by every owner identifier at once, in the frozen
   * `CATALOG_LINK_READ_ORDER`.
   *
   * @param ownerIDs the distinct owner identifiers.
   * @param descriptors which ten link tables to read.
   * @param statementLabel which family of statement it is, for fault messages.
   * @returns the ten groupings, keyed by folded owner identifier.
   */
  private async readCatalogLinkGrouping(
    ownerIDs: readonly string[],
    descriptors: CatalogLinkDescriptorSet,
    statementLabel: string,
  ): Promise<CatalogLinkGrouping> {
    const grouping = emptyCatalogLinkGrouping();

    if (ownerIDs.length < 1) {
      return grouping;
    }

    const placeholders = sqlPlaceholderList(ownerIDs.length);

    for (const collection of CATALOG_LINK_READ_ORDER) {
      const descriptor = descriptors[collection];
      const rows = await this.executor.execute(
        buildLinkStatement(descriptor, placeholders),
        ownerIDs,
      );
      const readMembers = groupLinkMembers(rows, descriptor, statementLabel);

      // The target map is the one `emptyCatalogLinkGrouping` created for this collection, so the
      // members are copied into it rather than the map being replaced - `CatalogLinkGrouping`
      // declares every member `readonly`.
      for (const [ownerKey, members] of readMembers) {
        grouping[collection].set(ownerKey, members);
      }
    }

    return grouping;
  }

  /**
   * Read the reward's eleven catalog-typed link tables: the shared ten plus `eligiblePriceGroups`.
   *
   * @param rewardIDs the distinct reward identifiers.
   * @returns the eleven groupings, keyed by folded owner identifier.
   */
  private async readRewardCatalogLinkGrouping(
    rewardIDs: readonly string[],
  ): Promise<RewardCatalogLinkGrouping> {
    const shared = await this.readCatalogLinkGrouping(
      rewardIDs,
      REWARD_CATALOG_LINK_DESCRIPTORS,
      REWARD_CATALOG_LINK_STATEMENT_LABEL,
    );

    if (rewardIDs.length < 1) {
      return { ...shared, eligiblePriceGroups: new Map<string, string[]>() };
    }

    const priceGroupRows = await this.executor.execute(
      buildLinkStatement(REWARD_ELIGIBLE_PRICE_GROUP_LINK, sqlPlaceholderList(rewardIDs.length)),
      rewardIDs,
    );

    return {
      ...shared,
      eligiblePriceGroups: groupLinkMembers(
        priceGroupRows,
        REWARD_ELIGIBLE_PRICE_GROUP_LINK,
        REWARD_CATALOG_LINK_STATEMENT_LABEL,
      ),
    };
  }

  /**
   * Read and assemble the qualifiers of a set of promotion periods.
   *
   * One statement for every period at once, plus the three opaque qualifier link reads and the ten
   * catalog qualifier link reads - FOURTEEN statements, fixed.
   *
   * @returns period identifier, folded, to its qualifiers in row order.
   */
  private async readPeriodQualifiers(
    periodIDs: readonly string[],
  ): Promise<Map<string, PromotionQualifier[]>> {
    const grouped = new Map<string, PromotionQualifier[]>();

    if (periodIDs.length < 1) {
      return grouped;
    }

    const rows = await this.executor.execute(
      buildPeriodQualifierStatement(sqlPlaceholderList(periodIDs.length)),
      periodIDs,
    );

    if (rows.length < 1) {
      return grouped;
    }

    const label = PERIOD_QUALIFIER_STATEMENT_LABEL;
    const qualifierIDs = dedupeIdentifiers(
      rows.map((row): string => readIdentifier(row, 'promotionQualifierID', label)),
    );
    const qualifierLinks = await this.readOpaqueLinkGrouping(
      qualifierIDs,
      QUALIFIER_OPAQUE_LINK_DESCRIPTORS,
      QUALIFIER_LINK_STATEMENT_LABEL,
    );

    // The qualifier's ten catalog-typed sets, read here and only here.
    const qualifierCatalogLinks = await this.readCatalogLinkGrouping(
      qualifierIDs,
      QUALIFIER_CATALOG_LINK_DESCRIPTORS,
      QUALIFIER_CATALOG_LINK_STATEMENT_LABEL,
    );

    for (const row of rows) {
      const qualifierID = readIdentifier(row, 'promotionQualifierID', label);
      const qualifier = toPromotionQualifier(
        row,
        {
          fulfillmentMethodIDs: linkMembersOf(qualifierLinks.fulfillmentMethods, qualifierID),
          shippingMethodIDs: linkMembersOf(qualifierLinks.shippingMethods, qualifierID),
          shippingAddressZoneIDs: linkMembersOf(qualifierLinks.shippingAddressZones, qualifierID),
        },
        toCatalogLinkSets(qualifierCatalogLinks, qualifierID),
      );

      const key = foldIdentifier(readIdentifier(row, 'promotionPeriodID', label));
      const existing = grouped.get(key);

      if (existing === undefined) {
        grouped.set(key, [qualifier]);
      } else {
        existing.push(qualifier);
      }
    }

    return grouped;
  }

  /**
   * Execute one use-count statement and read its scalar.
   *
   * Shared by all four count methods, which differ only in the statement and in what they bind.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L184, L251, L270, L295]: the legacy returns
   * `results[1]`, the first row's single column.
   *
   * @throws An error named `PromotionColumnError` when the result set is empty or the count column
   * is missing or unreadable.
   */
  private async executeUseCount(
    statement: UseCountStatement,
    statementLabel: string,
  ): Promise<number> {
    const rows = await this.executor.execute(statement.sql, statement.params);
    const row = rows[0];

    if (row === undefined) {
      throw new PromotionColumnError(
        'count',
        statementLabel,
        'the result set is empty, and an unconditional aggregate always returns exactly one row',
      );
    }

    return readCount(row, 'count', statementLabel);
  }
}
