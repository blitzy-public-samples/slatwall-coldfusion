/**
 * MySQL adapter for the promotion repository port.
 *
 * Ports `model/dao/PromotionDAO.cfc` - 593 lines, the largest and most intricate DAO in the
 * slice, written in mixed cfscript and `<cffunction>` tag syntax with embedded `<cfquery>` bodies -
 * plus the single query of `model/dao/RoundingRuleDAO.cfc`, which the port hosts here as its
 * seventh method because the port inventory is locked at thirteen and no `roundingRuleRepository`
 * exists or may be created.
 *
 * THE BINDING STANDARD, STATED PLAINLY
 * No user-specified rules were provided for this project: the rules source returns only "No user
 * rules provided.", verified by reading it to the end - the document is one line. Zero rules govern
 * this file, none is invented to fill the gap, and the absence is not treated as licence to lower
 * the bar. Enterprise-standard practice governs instead, and the commitments it imposes here are
 * each discharged in the code below: maximal strictness with no `any`, no `@ts-ignore` and no
 * non-null assertion; the mechanically enforced layer boundary; the closed dependency set; money as
 * `Money` built from a decimal STRING and never from a number; prepared statements exclusively with
 * positional placeholders; no hardcoded credential and no environment read; one exported unit with
 * no barrel; and the uniform defect marker.
 *
 * WHAT THIS FILE OWNS THAT NOTHING ELSE DOES
 *
 *   1. THE ABSENT RESULT ORDERING of `getActivePromotionRewards`
 *      [model/dao/PromotionDAO.cfc:L51-L132]. A case-insensitive search for "order by" across the
 *      whole 593-line DAO returns nothing. That absence is load-bearing for the discount math and
 *      is preserved verbatim - see the marker on the method.
 *   2. THE THREE COMMA-LISTS - `rewardTypeList`, `promotionCodeList` and the derived
 *      `noQualRequiredList` - each expanded to one bound parameter PER ELEMENT, each with an
 *      explicit empty-list short-circuit because `IN ()` does not parse.
 *   3. THE ROUNDING-RULE LOOKUP, hosted here as method 7.
 *
 * The query-of-queries rewrite, the six-branch union and the only in-scope dialect fragment for
 * materialized-path matching live in the two sibling statement modules this file imports; they are
 * not re-authored here.
 *
 * LOCATOR DRIFT, RECORDED RATHER THAN TRUSTED
 * Every locator quoted in this file was re-verified against the source while porting, because the
 * planning notes carry two drifts:
 *
 *   * `model/entity/PromotionReward.cfc` - the persistent component declaration, and with it the
 *     misspelled `hb_permission="promotionPeriod.promtionRewards"` attribute, is at L57, not the
 *     L49 the plan cites. `amount` is at L61 and declares NO `default`.
 *   * `getSalePricePromotionRewardsQuery` - the plan cites L298-L591. L591 is where the
 *     `</cffunction>` tag closes; L593 is where `</cfcomponent>` closes. Both readings appear in
 *     the planning material, so both are stated here and the function's own span is cited as
 *     L298-L591 throughout.
 *   * the sale-price pre-query's INCLUSIVE date comparisons - the plan cites L311 and L313. Those
 *     two lines hold `promotionPeriodID` and `FROM`; the `<=` and `>=` tests are at L317 and L319,
 *     and the `cf_sql_bit` active-flag bind the plan places at L321 is there. L317 and L319 are
 *     cited throughout, and the offset is +6 lines against the planning note.
 *
 * FETCH SHAPE (T3) - THE SUMMARY; EACH METHOD RESTATES ITS OWN DECISION
 * Hibernate lazy loading has no equivalent in a driver-only stack and is deliberately NOT
 * simulated: there is no proxy, no deferred loader and no on-access fetch anywhere in this file.
 * Associations are materialized at this boundary, and what is materialized is an explicit decision
 * recorded at every one of the seven methods. Materialization here is BOUNDED: the number of
 * statements a call issues is fixed by the call's shape, never by the number of rows it returned,
 * so no method walks a result set issuing one lookup per row.
 *
 * THE ELEVEN CATALOG-TYPED LINK COLLECTIONS ARE NOT MATERIALIZED FROM HERE, AND THAT IS A DECISION
 * `PromotionReward` declares fourteen include/exclude link collections
 * [model/entity/PromotionReward.cfc:L74-L90] and `PromotionQualifier` declares thirteen
 * [model/entity/PromotionQualifier.cfc:L73-L87], hanging off the abbreviated physical bases
 * `SwPromoReward` and `SwPromoQual`. This adapter materializes the three whose members are
 * OUT-OF-SCOPE entities reduced to opaque identifiers - fulfillment methods, shipping methods and
 * shipping address zones - on both, by bounded keyed link queries. The remaining eleven hold
 * `Sku`, `Product`, `ProductType`, `Brand`, `Option` and `PriceGroup` members, and those are
 * hydrated by the catalog and price-group adapters, each of which owns its own row-to-entity
 * factory and - for `Sku` and `Product` - the collaborator ports those entities are constructed
 * with under transformation rule T2. Constructing them here would duplicate ownership of the same
 * link rows in two adapters, and this adapter's dependency surface deliberately excludes those
 * entity modules so that it cannot. `src/repositories/mysql/mysqlProductTypeRepository.ts` records
 * the identical decision for its own six many-to-many sets, in those words. The composition root is
 * where the promotion service meets the catalog adapters.
 *
 * `PromotionCode.orders` is never materialized either [model/entity/PromotionCode.cfc:L68] - see
 * the note on the two code counts for why an aggregate join over it is nonetheless legitimate.
 *
 * TEST COVERAGE IS NET-NEW, AND IS NOT PRESENTED AS PARITY
 * `meta/tests/unit/dao/` holds exactly two components, `AccountDAOTest` and `PaymentDAOTest`;
 * neither is in scope and there is no legacy `PromotionDAOTest` or `RoundingRuleDAOTest` to trace
 * to. Every obligation this file states for a test suite is therefore NET-NEW coverage. The
 * obligations, stated here and not authored here: assert the emitted statement text and the bound
 * parameter array for all seven methods against a capturing executor with no live database;
 * exercise multi-element, single-element and EMPTY `rewardTypeList` / `promotionCodeList` /
 * `noQualRequiredList`; exercise a PRESENT but empty-string `productID` against the sale-price
 * statement; assert `undefined` rather than a throw for an unknown rounding-rule identifier; and
 * assert that no ordering clause is emitted for the active-reward read and no row limit for the
 * sale-price join-back.
 *
 * CROSS-SERVICE ORDERING, RECORDED ONCE AND NOT ENFORCED HERE
 * `PromotionService.updateOrderAmountsWithPromotions` reads price-group state that
 * `PriceGroupService.updateOrderAmountsWithPriceGroups` produces
 * [model/service/PromotionService.cfc:L241-L254]; in the legacy system `OrderService` merely
 * happened to call them in that sequence. The target makes the ordering explicit in the composition
 * root and the promotion handler, and a test asserts it. It is NOT this repository's job: nothing
 * below sequences the two passes, guards their order, or reads price-group data, which is why the
 * reward reads here carry no price-group state at all.
 *
 * @see model/dao/PromotionDAO.cfc - the ported DAO; its query bodies are the source of truth
 * @see model/dao/RoundingRuleDAO.cfc - the single-declaration DAO whose lookup is method 7
 * @see model/service/PromotionService.cfc - the service tier that consumes this adapter
 * @see slatwall-ts/src/domain/ports/promotionRepository.ts - the contract, authoritative on shape
 */

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
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import { cfLen, isNullish } from '../../lib/cfml/truthiness.js';
import type { PreparedStatementExecutor, SqlRow } from './connection.js';
import { sqlPlaceholderList } from './connection.js';
import type { UseCountStatement } from './sql/promotionUseCounts.sql.js';
import { PROMOTION_USE_COUNT_STATEMENTS } from './sql/promotionUseCounts.sql.js';
import { buildSalePricePromotionRewardsStatement } from './sql/salePricePromotionRewards.sql.js';

// ---------------------------------------------------------------------------
// Collaborator contracts this adapter needs and cannot import
// ---------------------------------------------------------------------------

/**
 * The rounding collaborator a hydrated `RoundingRule` is constructed with.
 *
 * JUDGMENT CALL: declared module-locally and un-exported rather than imported. `RoundingRule`'s
 * second constructor argument is typed to an interface that `src/domain/entities/roundingRule.ts`
 * declares module-locally and does NOT export, so there is no name to import; the entity is
 * satisfied STRUCTURALLY, exactly as the port header describes for the narrow sale-price
 * collaborator that `Product` takes. Declaring it here adds no exported contract to the locked
 * inventory - this module exports exactly one unit, the class at the bottom of the file.
 *
 * The single method is the SERVICE-tier arithmetic `roundValueByRoundingRule`
 * [model/service/RoundingRuleService.cfc:L84], which `src/services/roundingRuleService.ts`
 * implements. This adapter never performs rounding: it hands the collaborator through to the entity
 * and does nothing else with it. The composition root wires the two together, and it is the
 * composition root - not this file - that resolves the wiring cycle created by the rounding-rule
 * service consuming method 7 of this same port.
 */
interface RoundingRuleValueRounder {
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money;
}

// ---------------------------------------------------------------------------
// Failure reporting
//
// Two fault types, each with an explicit `name`, following the pattern the sibling adapters
// established: the constructors stay unexported and callers identify the fault by its name rather
// than by importing the class. The two are kept apart because they say different things - one that
// the RESULT SET and this adapter disagree, the other that a caller handed in an ENTITY the legacy
// body would have dereferenced through a null.
//
// NO MESSAGE EVER ECHOES A REJECTED VALUE. Only the column, the statement that produced it and the
// JavaScript type appear. A promotion row carries no credential, but an error message is one of the
// easiest routes for any column value to reach a log stream, and `src/repositories/mysql/connection.ts`
// and `src/lib/config.ts` both take this position for the same reason.
// ---------------------------------------------------------------------------

/**
 * A result-set column that is absent, or present with a shape this adapter cannot read.
 *
 * The two faults are kept apart by the readers below: an absent column means the statement and this
 * file disagree about the projection, while an unreadable value means the schema or the driver
 * configuration moved underneath the adapter. Both are reported, never absorbed.
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
 * CFML parity [model/dao/PromotionDAO.cfc:L138,L193]: both period use-count functions bind
 * `arguments.promotionPeriod.getPromotion().getPromotionID()`. CFML has no optional-chaining and no
 * null guard there, so a period whose promotion is not loaded raises inside the DAO - the count is
 * never computed and never silently returned as zero. That failure is REPRODUCED rather than
 * smoothed: returning `0` would report "this promotion has never been used", which the engine
 * compares against a maximum use count [model/service/PromotionService.cfc:L567] and would read as
 * "the reward may still be applied". A wrong count changes money; a raised fault does not.
 *
 * The port states the precondition explicitly - the period's promotion "must already be
 * materialized" - so this type is what enforces that stated contract.
 */
class PromotionAssociationError extends Error {
  public constructor(entityName: string, associationName: string, methodName: string) {
    super(
      `${methodName} requires ${entityName}.${associationName} to be materialized, and it is absent`,
    );
    this.name = 'PromotionAssociationError';
  }
}

// ---------------------------------------------------------------------------
// Closed-union narrowers
//
// Three of the columns this adapter reads feed a narrowed union on an entity, and two feed a
// narrowed union on the port's row projection. THE TWO GROUPS ARE TREATED DIFFERENTLY ON PURPOSE,
// and the difference is not stylistic:
//
//   * The three ENTITY columns hold whatever the table holds. `amountType`, `applicableTerm` and
//     `rewardMatchingType` are all `ormtype="string"` with no database constraint and no validation
//     rule narrowing them [model/entity/PromotionReward.cfc:L62,L64;
//     model/entity/PromotionQualifier.cfc:L65], and the vocabularies exist only as option lists the
//     admin form renders. An unrecognized value is therefore a REACHABLE persisted state, and the
//     legacy handles it by falling through: the discount switch at
//     model/service/PromotionService.cfc:L992-L1002 has no `default` case, so an unknown amount type
//     yields no discount at all rather than an error. Mapping the value to `undefined` is what
//     reproduces that fall-through, because the entity's own accessor already returns `undefined`
//     for an absent amount type and every consumer already handles it.
//
//   * The two PROJECTION columns are produced by our own statement. `discountLevel` is a SQL string
//     literal this adapter's sibling module emits, one per branch, and `salePriceDiscountType` can
//     only survive the reduction when it matched one of the three `CASE` arms - a fourth value makes
//     `salePrice` NULL, and the final join-back compares that column for equality, which no NULL
//     satisfies. An unrecognized value there means the statement changed shape, so it is REPORTED.
// ---------------------------------------------------------------------------

/**
 * The three `amountType` values, from `getAmountTypeOptions()`
 * [model/entity/PromotionReward.cfc:L120-L133].
 *
 * All three are listed even though that method returns only the first two when the reward type is
 * `order` [model/entity/PromotionReward.cfc:L121-L125]: the narrowing here is over what the COLUMN
 * may hold, and the column is one `ormtype="string"` shared by every reward type. Restricting the
 * vocabulary per reward type would discard a stored `amount` on an order-level reward, which is a
 * repair rather than a port.
 */
const AMOUNT_TYPES: readonly AmountType[] = Object.freeze(['percentageOff', 'amountOff', 'amount']);

/** The three `applicableTerm` values [model/entity/PromotionReward.cfc:L112-L118]. */
const APPLICABLE_TERMS: readonly ApplicableTerm[] = Object.freeze(['both', 'initial', 'renewal']);

/**
 * The five `rewardMatchingType` values
 * [model/entity/PromotionQualifier.cfc:L107-L115].
 */
const REWARD_MATCHING_TYPES: readonly RewardMatchingType[] = Object.freeze([
  'any',
  'sku',
  'product',
  'productType',
  'brand',
]);

/** The six discount levels the sale-price statement emits, one literal per UNION branch. */
const DISCOUNT_LEVELS: readonly SalePricePromotionRewardRow['discountLevel'][] = Object.freeze([
  'sku',
  'product',
  'brand',
  'option',
  'productType',
  'global',
]);

/** The three amount types the sale-price `CASE` expression can match. */
const SALE_PRICE_DISCOUNT_TYPES: readonly SalePricePromotionRewardRow['salePriceDiscountType'][] =
  Object.freeze(['amount', 'amountOff', 'percentageOff']);

/**
 * Narrow a persisted string against a vocabulary, mapping anything else to absence.
 *
 * CFML parity [model/service/PromotionService.cfc:L992-L1002]: the legacy amount-type switch has no
 * `default` arm, so an unrecognized value produces no discount rather than a failure. Returning
 * `undefined` routes an unrecognized value into exactly the branch the entity already reserves for
 * an absent one.
 *
 * The comparison is EXACT, not case-folded. CFML's `switch`/`case` on a string is case-INSENSITIVE,
 * so `'AmountOff'` would have matched there and does not match here - and that divergence is
 * deliberate rather than overlooked. Case-folding the value would mean writing a canonical spelling
 * back over the persisted one, which is a repair; the vocabularies are written by the admin form's
 * own option lists, so a differently-cased value in the column is not a state the application
 * produces. Recorded so the choice is auditable.
 *
 * @param value the persisted value, or `undefined` for a NULL column.
 * @param vocabulary the permitted values, in source order.
 * @returns the narrowed value, or `undefined` when the column is NULL or holds something else.
 */
function narrowOrAbsent<T extends string>(
  value: string | undefined,
  vocabulary: readonly T[],
): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  return vocabulary.find((candidate): boolean => candidate === value);
}

/**
 * Narrow a value this adapter's own statement produced, reporting anything else.
 *
 * @param value the projected value.
 * @param vocabulary the values the statement can emit.
 * @param columnName the column being narrowed, for the fault message.
 * @param statementLabel which statement produced the row.
 * @returns the narrowed value.
 * @throws An error named `PromotionColumnError` when the value is outside the vocabulary, which
 *   means the statement and this file have drifted apart.
 */
function narrowOrReport<T extends string>(
  value: string,
  vocabulary: readonly T[],
  columnName: string,
  statementLabel: string,
): T {
  const narrowed = vocabulary.find((candidate): boolean => candidate === value);

  if (narrowed === undefined) {
    throw new PromotionColumnError(
      columnName,
      statementLabel,
      'the value is outside the vocabulary this statement emits, so the statement and this adapter have drifted apart',
    );
  }

  return narrowed;
}

// ---------------------------------------------------------------------------
// Statement labels
//
// Each label names the statement AND cites the legacy locator it ports, so a fault message points a
// reader at the CFML it came from rather than at a bare column name. The labels are the only place
// in this file where a legacy locator appears in a runtime string; every other citation is a comment.
// ---------------------------------------------------------------------------

/** Method 1. */
const ACTIVE_REWARDS_STATEMENT_LABEL =
  'the active promotion reward read [model/dao/PromotionDAO.cfc:L51-L132]';

/** The three reward link reads that satisfy method 1's opaque-identifier collections. */
const REWARD_LINK_STATEMENT_LABEL =
  'a promotion reward link read [model/entity/PromotionReward.cfc:L76-L78]';

/** The qualifier read that satisfies method 1's period association. */
const PERIOD_QUALIFIER_STATEMENT_LABEL =
  'the promotion qualifier read [model/entity/PromotionPeriod.cfc:L63]';

/** The three qualifier link reads. */
const QUALIFIER_LINK_STATEMENT_LABEL =
  'a promotion qualifier link read [model/entity/PromotionQualifier.cfc:L73-L75]';

/** Methods 2 and 3. */
const PERIOD_USE_COUNT_STATEMENT_LABEL =
  'a promotion period use-count read [model/dao/PromotionDAO.cfc:L134-L252]';

/** Methods 4 and 5. */
const CODE_USE_COUNT_STATEMENT_LABEL =
  'a promotion code use-count read [model/dao/PromotionDAO.cfc:L254-L296]';

/** Method 6. */
const SALE_PRICE_STATEMENT_LABEL =
  'the sale-price promotion reward read [model/dao/PromotionDAO.cfc:L298-L591]';

/** Method 7. */
const ROUNDING_RULE_STATEMENT_LABEL =
  'the rounding rule read [model/dao/RoundingRuleDAO.cfc:L51-L67]';

// ---------------------------------------------------------------------------
// Column readers
//
// CFML parity [model/entity/PromotionReward.cfc:L65-L66]: CFML identifiers are case-INSENSITIVE, so
// the legacy code could name a column or an attribute in any casing and the engine would still find
// it - which is exactly why those two adjacent lines can declare `ormType="integer"` and
// `ormtype="integer"` and mean the same thing. TypeScript property access is case-SENSITIVE, so
// every read below folds the label before comparing it rather than indexing the driver's row object
// with one assumed spelling. Only the LABEL is folded; no stored value is ever case-folded.
// ---------------------------------------------------------------------------

/** Either a column of that name was present - possibly holding SQL NULL - or it was not. */
type ColumnLookup = { readonly found: true; readonly value: unknown } | { readonly found: false };

/**
 * Case-fold an identifier for use as a comparison operand only.
 *
 * @param identifier a column label.
 * @returns the folded form. Never used as a value that reaches the database.
 */
function foldIdentifier(identifier: string): string {
  return identifier.toLowerCase();
}

/**
 * Look for one column of a row without assuming the driver's casing.
 *
 * @param row one result-set row, keyed by the label the driver reported.
 * @param columnName the column to look for, in any casing.
 * @returns the value when a column of that name is present - including when the cell is SQL NULL -
 *   and otherwise the absent outcome.
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
 * The ABSENCE of a column and a NULL VALUE in it are different faults and are kept apart
 * deliberately: this raises for the first and hands back `null` for the second, leaving the
 * nullability decision to the typed reader that called it.
 *
 * @param row one result-set row.
 * @param columnName the column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the raw driver value, which may be `null`.
 * @throws An error named `PromotionColumnError` when no column of that name is present.
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

/** Names the shape of a rejected column value without revealing the value itself. */
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
 * [model/entity/PromotionReward.cfc:L60], so a non-string here means the statement or the schema
 * moved and the read says so rather than coercing. The casing of the stored value is left untouched:
 * only the LABEL is folded, never the value.
 *
 * @param row one result-set row.
 * @param columnName the identifier column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the identifier exactly as stored.
 * @throws An error named `PromotionColumnError` when the column is absent, null or not text.
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
 * SQL NULL becomes `undefined` and NEVER the empty string. The distinction is load-bearing rather
 * than cosmetic across this slice: `unsavedvalue=""` gives the empty string the specific meaning
 * "not yet persisted" on every in-scope entity [model/entity/PromotionReward.cfc:L60], and
 * `PromotionCode.preInsert` exists precisely to repair a null code. Substituting `''` for NULL would
 * change entity behaviour, not merely its shape.
 *
 * @param row one result-set row.
 * @param columnName the column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the text, or `undefined` when the cell is SQL NULL.
 * @throws An error named `PromotionColumnError` when the column is absent, or present with a
 *   non-text, non-null value.
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
 * THE VALUE MUST ARRIVE AS A STRING AND IS NEVER COERCED THROUGH `Number`.
 * `src/repositories/mysql/connection.ts` deliberately leaves the driver's `decimalNumbers` option
 * unset, which is what makes a `DECIMAL` column arrive as a decimal string; handing that string
 * straight to `Money` is the whole mechanism by which currency arithmetic in this target carries no
 * IEEE-754 drift. A number here means that option was turned on, and surfacing the configuration
 * change is more useful than absorbing it.
 *
 * SQL NULL BECOMES `undefined`, NEVER `Money.zero`. `PromotionReward.amount`
 * [model/entity/PromotionReward.cfc:L61] declares no `default`, and neither does
 * `PromotionApplied.discountAmount` [model/entity/PromotionApplied.cfc:L53]; substituting a zero for
 * an absent amount would fabricate a real zero discount, which is a different fact from "no amount
 * was recorded".
 *
 * @param row one result-set row.
 * @param columnName the money column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the amount, or `undefined` when the cell is SQL NULL.
 * @throws An error named `PromotionColumnError` when the column is absent or is not a decimal
 *   string; or whatever `Money` raises for a malformed numeral, which is allowed to propagate
 *   unwrapped because it already names the fault precisely.
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
 *
 * Only the sale-price projection has such a column. The port derives its requiredness from the query
 * rather than assuming it: the final step joins the reduced rows back to the per-SKU minimum on SKU
 * and sale price [model/dao/PromotionDAO.cfc:L584-L587], an equality predicate cannot match a null,
 * and `MIN` skips nulls - so no row whose sale price is null can reach the projection at all. A null
 * arriving here therefore means the statement changed shape, and it is reported rather than mapped
 * to absence.
 *
 * @param row one result-set row.
 * @param columnName the money column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the amount.
 * @throws An error named `PromotionColumnError` when the column is absent, null, or not a decimal
 *   string.
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
 *
 * `undefined` for SQL NULL, and never `0`. On every use-limit column in this slice - the three on
 * the reward [model/entity/PromotionReward.cfc:L65-L67] and the two on the period
 * [model/entity/PromotionPeriod.cfc:L55-L56] - `hb_nullRBKey="define.unlimited"` says outright that
 * absence means UNLIMITED. A zero would mean the opposite: that no use is permitted at all.
 *
 * A `bigint` is admitted because the driver may widen an integral column to one, and it is
 * range-checked before conversion so nothing is lost silently. A string is REFUSED: that would mean
 * `bigNumberStrings` had been enabled, which the pool deliberately does not set.
 *
 * @param row one result-set row.
 * @param columnName the integer column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the integer, or `undefined` when the cell is SQL NULL.
 * @throws An error named `PromotionColumnError` when the column is absent or holds a shape no
 *   integer reading can accept.
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
 * Read a nullable `big_decimal` column that is NOT money.
 *
 * JUDGMENT CALL: the two fulfillment-weight gates are declared `ormtype="big_decimal"` with
 * `hb_formatType="weight"` [model/entity/PromotionQualifier.cfc:L62-L63], and
 * `src/domain/entities/promotionQualifier.ts` types both of them `number`. A weight is not a
 * monetary value, so routing it through `Money` would misrepresent it - and the single-arithmetic-
 * surface commitment is about CURRENCY, which is why this reader exists separately from
 * `readOptionalMoney` and why the conversion below is confined to a non-monetary column. No
 * arithmetic is performed on the result here; the qualifier gates compare it in the service tier.
 *
 * @param row one result-set row.
 * @param columnName the decimal column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the value, or `undefined` when the cell is SQL NULL.
 * @throws An error named `PromotionColumnError` when the column is absent, holds an unreadable
 *   shape, or holds a numeral that does not parse finitely.
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
 * `Date` already interpreted in UTC. A string is therefore REFUSED rather than parsed: a string here
 * means the pool's date handling changed underneath this adapter, and a parse would bury the
 * timezone assumption instead of surfacing it. An out-of-range or zero date that reaches JavaScript
 * as an invalid `Date` is refused for the matching reason - the pool refuses an invalid `Date` at the
 * BINDING boundary, so accepting one at the READING boundary would only defer the same failure.
 *
 * `undefined` for SQL NULL is meaningful and must not be replaced with an epoch or with the current
 * moment: `hb_nullRBKey="define.forever"` on both period bounds
 * [model/entity/PromotionPeriod.cfc:L53-L54] says absence means "no bound".
 *
 * @param row one result-set row.
 * @param columnName the timestamp column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the instant, or `undefined` when the cell is SQL NULL.
 * @throws An error named `PromotionColumnError` when the column is absent or is not a valid `Date`.
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
 * Read a boolean column WITHOUT deciding its truth.
 *
 * THE RAW VALUE IS CARRIED THROUGH, NARROWED ONLY TO THE INPUT TYPE THE ENTITY ACCEPTS.
 * `cfBoolean()` is deliberately NOT called here, and the reason is specific: `Promotion` stores
 * `activeFlag` as the raw persisted column and routes it through `cfBoolean()` INSIDE its own
 * constructor, applying the ORM default `default="1"` [model/entity/Promotion.cfc:L56] when the
 * value is absent. Coercing here would collapse absence into `false` before the entity could apply
 * that default, and an active promotion would silently stop matching. Coercion is therefore located
 * exactly once, in the entity, where the metadata that disambiguates it lives - and it is genuinely
 * ambiguous across the slice: the boolean default literal is spelled `"1"`
 * [model/entity/Promotion.cfc:L56], `"0"` [model/entity/OptionGroup.cfc:L57] and the STRING
 * `"false"` [model/entity/Product.cfc:L58], while twelve of the eighteen in-scope entities declare
 * no boolean default at all. NEVER `Boolean(value)`, `!!value` or `value === 1` anywhere in this
 * file.
 *
 * The `Uint8Array` arm is not defensive padding: Hibernate maps `ormtype="boolean"` to `bit(1)` and
 * the driver surfaces that as a one-byte buffer, which the shared decision table would otherwise
 * reject. An empty buffer carries no byte and is passed on as absence.
 *
 * @param row one result-set row.
 * @param columnName the boolean column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns a value the entity's own coercion accepts.
 * @throws An error named `PromotionColumnError` when the column is absent or holds a shape no CFML
 *   boolean conversion can accept.
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
 * CFML parity [model/dao/PromotionDAO.cfc:L184,L251,L270,L295]: all four legacy functions declare
 * `returntype="numeric"` and return `results[1]`, the single scalar the aggregate produced. That
 * numeric declaration is honest, and this adapter returns numbers.
 *
 * LEGACY-DEFECT [model/service/PromotionService.cfc:L1094-L1100]: the SERVICE methods that forward
 * two of those counts declare `returntype="boolean"` over the same numeric value. The lie is purely
 * in the service tier - the DAO never told it - so it is recorded here and NOT reproduced: a boolean
 * return is not expressible over a count without discarding the value the callers compare against a
 * use limit.
 * Preserved deliberately; do not fix without a product decision.
 *
 * @param row one result-set row.
 * @param columnName the count column to read, in any casing.
 * @param statementLabel which statement produced the row.
 * @returns the count.
 * @throws An error named `PromotionColumnError` when the column is absent, null, or not an integer.
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

// ---------------------------------------------------------------------------
// Statement text - method 1
//
// The legacy body composes HQL over ENTITY names (`SlatwallPromotionReward`) and lets Hibernate
// resolve them to tables. There is no ORM here, so the text below names the PHYSICAL tables, and the
// physical names are ABBREVIATED for two of the four: `SwPromoReward`
// [model/entity/PromotionReward.cfc:L57] and `SwPromoQual`
// [model/entity/PromotionQualifier.cfc:L49], NOT `SwPromotionReward`/`SwPromotionQualifier`.
// `SwPromotionPeriod` [model/entity/PromotionPeriod.cfc:L49], `SwPromotion`
// [model/entity/Promotion.cfc:L49], `SwPromotionCode` [model/entity/PromotionCode.cfc:L49] and
// `SwRoundingRule` [model/entity/RoundingRule.cfc:L49] are not abbreviated. Nothing about the schema
// changes: no DDL is emitted anywhere in this file and no table, column or index is added, renamed
// or dropped.
//
// The four legacy HQL aliases are carried over verbatim - `spr`, `spp`, `sp`, and `c` inside the
// subqueries [model/dao/PromotionDAO.cfc:L65,L67,L69,L86,L90] - and one alias is added, `srr`, for
// the rounding-rule join this file introduces. Every projected column is aliased with its owning
// alias as a prefix, because four of the tables carry a `remoteID`, a `createdDateTime` and a
// `modifiedDateTime` apiece and an unprefixed projection would collide.
// ---------------------------------------------------------------------------

/**
 * Every column the reward hydration reads, aliased by owner.
 *
 * FETCH SHAPE, stated once for method 1 and referenced from the method: the two legacy
 * `INNER JOIN FETCH` clauses [model/dao/PromotionDAO.cfc:L66,L68] are reproduced as two `INNER JOIN`
 * clauses whose columns are projected here, so `promotionPeriod` and `promotion` arrive fully
 * materialized on every returned reward in the SAME statement the rewards came from. `roundingRule`
 * is added as a `LEFT JOIN` - LEFT, not INNER, because `roundingRuleID` is nullable
 * [model/entity/PromotionReward.cfc:L71] and an INNER join would silently drop every reward that has
 * no rounding rule, which is most of them. Satisfying the association in this statement rather than
 * in a separate one is recorded as a FETCH-SHAPE EXPLICITNESS decision, and only that: the depth of
 * the graph becomes visible in the text a reviewer reads instead of being implied by a later
 * traversal. NO CLAIM IS MADE HERE - OR ANYWHERE IN THIS FILE - ABOUT EXECUTION CHARACTERISTICS OF
 * ANY KIND.
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
 * The join chain.
 *
 * VERBATIM LEGACY HQL - model/dao/PromotionDAO.cfc:L64-L69:
 *
 *     SELECT spr FROM
 *         SlatwallPromotionReward spr
 *       INNER JOIN FETCH
 *         spr.promotionPeriod spp
 *       INNER JOIN FETCH
 *         spp.promotion sp
 *
 * HQL infers each join condition from the association metadata; SQL does not, so the two foreign
 * keys are written out - `spr.promotionPeriodID` [model/entity/PromotionReward.cfc:L70] and
 * `spp.promotionID` [model/entity/PromotionPeriod.cfc:L59]. Both stay INNER, which is
 * behaviour-preserving: a reward whose period is missing, or whose period's promotion is missing, is
 * excluded by the legacy query too.
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
 * The base predicate: reward type, the two period date bounds, and the promotion's active flag.
 *
 * VERBATIM LEGACY HQL - model/dao/PromotionDAO.cfc:L70-L77:
 *
 *         WHERE
 *             spr.rewardType IN (:rewardTypeList)
 *           and
 *             (spp.startDateTime is null or spp.startDateTime < :now)
 *           and
 *             (spp.endDateTime is null or spp.endDateTime > :now)
 *           and
 *             sp.activeFlag = :activeFlag
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L73,L75]: THE DATE COMPARISONS ARE STRICT - `<` and `>`,
 * NOT `<=` and `>=`. A period that starts at exactly the compared instant does not yet apply, and one
 * that ends at exactly that instant no longer does. THE SALE-PRICE PATH USES THE OPPOSITE OPERATORS -
 * `<=` and `>=` at [model/dao/PromotionDAO.cfc:L317,L319] and in all six of its UNION branches - so
 * the two paths genuinely disagree about the boundary instant. NEITHER IS NORMALIZED TO THE OTHER.
 * See the matching note on method 6, which cross-references back to here.
 *
 * Both bounds are null-tolerant, and that is what `hb_nullRBKey="define.forever"`
 * [model/entity/PromotionPeriod.cfc:L53-L54] means: an absent bound is no bound.
 *
 * @param rewardTypePlaceholders the placeholder list for the reward-type element binds.
 * @returns the `WHERE` clause text.
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
 * The promotion-qualifier existence test that opens the optional qualification block.
 *
 * VERBATIM LEGACY HQL - model/dao/PromotionDAO.cfc:L86:
 *
 *     EXISTS( SELECT pq.promotionQualifierID FROM SlatwallPromotionQualifier pq
 *             WHERE pq.promotionPeriod.promotionPeriodID = spp.promotionPeriodID )
 *
 * The HQL association path `pq.promotionPeriod.promotionPeriodID` is the foreign key column itself,
 * so it becomes `pq.promotionPeriodID` with no join added. Binds nothing.
 */
const QUALIFIER_EXISTS_CLAUSE = ` AND ( EXISTS ( SELECT pq.promotionQualifierID FROM SwPromoQual pq WHERE pq.promotionPeriodID = spp.promotionPeriodID )`;

/**
 * The promotion-code existence test, emitted in TWO different places by the legacy body.
 *
 * VERBATIM LEGACY HQL - model/dao/PromotionDAO.cfc:L90, and again identically at L110:
 *
 *     OR EXISTS ( SELECT c.promotionCodeID FROM SlatwallPromotionCode c
 *                 WHERE c.promotion.promotionID = sp.promotionID
 *                   AND c.promotionCode IN (:promotionCodeList)
 *                   AND (c.startDateTime is null or c.startDateTime < :now)
 *                   AND (c.endDateTime is null or c.endDateTime > :now) )
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L116-L127]: THE LEGACY BINDS ONE NAMED PARAMETER SET FOR
 * BOTH OCCURRENCES. HQL named parameters are bound once by name and reused wherever the name appears,
 * whereas a positional `?` is bound once per occurrence - so when both occurrences are emitted, this
 * adapter binds the code list twice and the instant four times where the legacy bound each once. THE
 * MATCHED ROW SET IS IDENTICAL; only the transport differs, and that difference is a mechanical
 * consequence of positional binding rather than a change of behaviour.
 *
 * The strict date operators are the same ones the base clause uses, and the same asymmetry against
 * the sale-price path applies.
 *
 * @param codePlaceholders the placeholder list for the promotion-code element binds.
 * @returns the clause text, which binds the code elements then the instant twice, in that order.
 */
function promotionCodeExistsClause(codePlaceholders: string): string {
  return ` OR EXISTS ( SELECT c.promotionCodeID FROM SwPromotionCode c WHERE c.promotionID = sp.promotionID AND c.promotionCode IN (${codePlaceholders}) AND (c.startDateTime is null or c.startDateTime < ?) AND (c.endDateTime is null or c.endDateTime > ?) )`;
}

/**
 * The alternative that lets order-level and fulfillment-level rewards through without a qualifier.
 *
 * VERBATIM LEGACY HQL - model/dao/PromotionDAO.cfc:L95:
 *
 *     OR spr.rewardType IN (:noQualRequiredList)
 *
 * @param placeholders the placeholder list for the derived reward-type element binds.
 * @returns the clause text.
 */
function noQualificationRequiredClause(placeholders: string): string {
  return ` OR spr.rewardType IN (${placeholders})`;
}

/**
 * The unconditional promotion-code gate that closes every form of this statement.
 *
 * VERBATIM LEGACY HQL - model/dao/PromotionDAO.cfc:L103-L106:
 *
 *     AND (
 *       NOT EXISTS ( SELECT c.promotionCodeID FROM SlatwallPromotionCode c
 *                    WHERE c.promotion.promotionID = sp.promotionID )
 *
 * Read together with the `OR EXISTS` that may follow it, this says: the promotion has no codes at
 * all, or one of the supplied codes is currently valid for it. Binds nothing.
 */
const NO_PROMOTION_CODE_CLAUSE = ` AND ( NOT EXISTS ( SELECT c.promotionCodeID FROM SwPromotionCode c WHERE c.promotionID = sp.promotionID )`;

/** Closes an opened `AND (` group [model/dao/PromotionDAO.cfc:L99, L114]. */
const CLOSE_GROUP_CLAUSE = ' )';

// ---------------------------------------------------------------------------
// Statement text - the bounded collection reads that complete method 1's graph
//
// FETCH SHAPE, stated once and referenced from method 1. `PromotionReward` declares FOURTEEN
// many-to-many collections [model/entity/PromotionReward.cfc:L74-L90] and `PromotionQualifier`
// declares THIRTEEN [model/entity/PromotionQualifier.cfc:L73-L87]. This adapter materializes exactly
// the SIX of them whose members are opaque identifiers rather than in-scope entities - three on the
// reward and three on the qualifier - and it does so with SIX statements keyed by the whole set of
// owner identifiers at once, so the number of statements per invocation is FIXED and does not grow
// with the number of rows returned. Per-row lookups are not used anywhere in this file.
//
// THE REMAINING ELEVEN REWARD COLLECTIONS AND TEN QUALIFIER COLLECTIONS ARE DELIBERATELY NOT
// MATERIALIZED HERE, and the reason is ownership rather than convenience. Their members are `Sku`,
// `Product`, `ProductType`, `Brand`, `Option` and `PriceGroup` - each one an in-scope entity with its
// own canonical module and its own repository, and each one constructed with injected collaborator
// ports of its own. Building them from this file would put a second owner on the same link rows and
// would require this adapter to know how to wire another aggregate's collaborators. The sibling
// adapter `mysqlProductTypeRepository.ts` reached the same conclusion about its own six many-to-many
// sets and records it in the same terms. The entity constructors default every one of those
// collections to an empty array, so a reward hydrated here is well-formed; the promotion engine's
// membership tests read them through the entity's own `has*` predicates, which compare identifiers.
// ---------------------------------------------------------------------------

/** One many-to-many link table, described by the three names the entity metadata supplies. */
interface LinkTableDescriptor {
  /** The physical link table [model/entity/PromotionReward.cfc:L76 `linktable`]. */
  readonly table: string;

  /** The owning-side foreign key [`fkcolumn`]. */
  readonly ownerColumn: string;

  /** The member-side foreign key [`inversejoincolumn`]. */
  readonly memberColumn: string;
}

/**
 * `fulfillmentMethods` [model/entity/PromotionReward.cfc:L76].
 *
 * `FulfillmentMethod` is out of scope, so the collection collapses to its identifiers - which is
 * exactly what `src/domain/entities/promotionReward.ts` types it as.
 */
const REWARD_FULFILLMENT_METHOD_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardFulfillmentMethod',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'fulfillmentMethodID',
});

/** `shippingAddressZones` [model/entity/PromotionReward.cfc:L77]. `AddressZone` is out of scope. */
const REWARD_SHIPPING_ADDRESS_ZONE_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardShipAddressZone',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'addressZoneID',
});

/** `shippingMethods` [model/entity/PromotionReward.cfc:L78]. `ShippingMethod` is out of scope. */
const REWARD_SHIPPING_METHOD_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoRewardShippingMethod',
  ownerColumn: 'promotionRewardID',
  memberColumn: 'shippingMethodID',
});

/** `fulfillmentMethods` [model/entity/PromotionQualifier.cfc:L73]. */
const QUALIFIER_FULFILLMENT_METHOD_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualFulfillmentMethod',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'fulfillmentMethodID',
});

/** `shippingMethods` [model/entity/PromotionQualifier.cfc:L74]. */
const QUALIFIER_SHIPPING_METHOD_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualShippingMethod',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'shippingMethodID',
});

/** `shippingAddressZones` [model/entity/PromotionQualifier.cfc:L75]. */
const QUALIFIER_SHIPPING_ADDRESS_ZONE_LINK: LinkTableDescriptor = Object.freeze({
  table: 'SwPromoQualShipAddressZone',
  ownerColumn: 'promotionQualifierID',
  memberColumn: 'addressZoneID',
});

/**
 * Read one link table for a set of owners.
 *
 * The three interpolated fragments are the descriptor's own identifiers - table and column names
 * this file owns as literals - and the placeholder list. NO VALUE IS INTERPOLATED: every owner
 * identifier is bound positionally.
 *
 * NO `ORDER BY`. The legacy metadata declares no `orderby` on any of the six collections, so
 * Hibernate imposes none, and adding one here would introduce an ordering the source does not have.
 * The same rule that governs method 1's own absent ordering governs these.
 *
 * @param descriptor which link table to read.
 * @param ownerPlaceholders the placeholder list for the owner identifiers.
 * @returns the statement text.
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
 * FETCH SHAPE: this is the ONE statement that satisfies `PromotionPeriod.promotionQualifiers`
 * [model/entity/PromotionPeriod.cfc:L63], and it is keyed by every period identifier the reward read
 * returned, in one call. The legacy leaves this collection to Hibernate's lazy loader, which the
 * target does not simulate - so it is materialized here, at the boundary, where the decision is
 * visible.
 *
 * The inverse direction is NOT populated: `PromotionPeriod.promotionRewards` and
 * `Promotion.promotionPeriods` stay empty. The legacy `JOIN FETCH` does not populate them either,
 * and filling them with only the rewards this filtered statement happened to match would assert
 * something false about the period's contents.
 *
 * NO `ORDER BY`, for the same reason as the link reads: the source declares none.
 *
 * @param periodPlaceholders the placeholder list for the period identifiers.
 * @returns the statement text.
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

// ---------------------------------------------------------------------------
// Statement text - method 7
// ---------------------------------------------------------------------------

/**
 * Read one rounding rule by identifier.
 *
 * VERBATIM LEGACY SQL - model/dao/RoundingRuleDAO.cfc:L56-L64:
 *
 *     <cfquery name="rs">
 *         SELECT
 *             roundingRuleExpression,
 *             roundingRuleDirection
 *         FROM
 *             SwRoundingRule
 *         WHERE
 *             roundingRuleID = <cfqueryparam cfsqltype="cf_sql_varchar" value="#arguments.roundingRuleID#" />
 *     </cfquery>
 *
 * JUDGMENT CALL: THE PROJECTION IS WIDENED FROM TWO COLUMNS TO THE WHOLE PERSISTED ROW, and the
 * widening is PORT-MANDATED rather than chosen here. The legacy selects only the expression and the
 * direction, because its caller reads only those two [model/service/RoundingRuleService.cfc:L73-L74].
 * The port types this method `Promise<RoundingRule | undefined>` - a whole entity - and states why:
 * `RoundingRule` is an in-scope entity with a canonical module of its own, and inventing a
 * two-field projection beside it would be a duplicate contract. `RoundingRule`'s constructor
 * requires the identifier, the name, both of the legacy columns and the four audit fields, so the
 * projection is exactly what that constructor needs and nothing more. The legacy two-column
 * projection is recorded here so the widening is auditable.
 *
 * `priceGroupRates` [model/entity/RoundingRule.cfc:L64] is NOT read. FETCH SHAPE: an empty array is
 * passed, because `PriceGroupRate` is owned by the price-group repository and its rates reach a
 * rounding rule from the other direction. That depth suffices for every caller of this method - the
 * rounding arithmetic reads only the expression and the direction.
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

// ---------------------------------------------------------------------------
// List tokenization and the empty-list short-circuits
//
// E5 mechanics, stated once. `mysql2` does NOT expand an array into an `IN` list: handing it one
// value produces a single bound scalar, so every comma-list is TOKENIZED and rendered as one `?` per
// element, with one bound parameter per element. That is what preserves the legacy semantics here,
// because HQL's `IN (:list)` binds a COLLECTION and matches element by element.
//
// THIS TREATMENT IS DELIBERATELY NOT GENERALISED FROM THE ONE DOCUMENTED EXCEPTION ELSEWHERE IN THE
// FOLDER. `model/dao/ProductDAO.cfc:L64-L69` binds a whole joined comma STRING as a single parameter,
// and per-element binding there would change which rows match - so it is preserved as a single bind,
// confined to the product adapter. In THIS file per-element binding is what preserves the match, so
// it is mandatory. The two cases must never be conflated.
//
// AN EMPTY LIST CANNOT BE RENDERED. `IN ()` is not parseable by MySQL, and `sqlPlaceholderList`
// refuses a count of zero for exactly that reason, so every list is short-circuited BEFORE a
// placeholder list is asked for. What each short-circuit does is decided per list, from the legacy
// body, and is documented at its own call site rather than shared.
// ---------------------------------------------------------------------------

/**
 * Tokenize a CFML comma-list into its elements.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L122,L126,L129]: the legacy converts each list with
 * `listToArray`, which drops empty elements - so `'a,,b'` yields two elements and `''` yields none.
 * `listToArray` from `src/lib/cfml/list.ts` reproduces that, including the default delimiter set.
 *
 * @param list the comma-delimited list, exactly as the caller supplied it.
 * @returns the elements, in list order.
 */
function tokenizeList(list: string): readonly string[] {
  return listToArray(list);
}

/**
 * Derive the reward types that are exempt from the qualifier requirement.
 *
 * VERBATIM LEGACY - model/dao/PromotionDAO.cfc:L56-L62:
 *
 *     <cfset var noQualRequiredList = "" />
 *     <cfif listFindNoCase(arguments.rewardTypeList,"fulfillment")>
 *         <cfset noQualRequiredList = listAppend(noQualRequiredList, "fulfillment") />
 *     </cfif>
 *     <cfif listFindNoCase(arguments.rewardTypeList,"order")>
 *         <cfset noQualRequiredList = listAppend(noQualRequiredList, "order") />
 *     </cfif>
 *
 * Reproduced through the CFML list helpers rather than through TypeScript string work, so the
 * semantics carry over intact: `listFindNoCase` is an ELEMENT match and not a substring match - a
 * list of `'fulfillmentBonus'` does not contain `'fulfillment'` - and it is case-INSENSITIVE, so
 * `'Order'` in the caller's list does select the `'order'` element. `listAppend` builds the result in
 * the legacy's own order, `fulfillment` before `order`, and that order is preserved because the
 * elements become positional binds.
 *
 * NOTE WHICH VALUE IS APPENDED. The legacy appends the LITERAL `'fulfillment'` and `'order'`, not the
 * caller's spelling, so a caller passing `'Order'` produces the list `'order'` and binds `'order'`.
 * That is carried over exactly.
 *
 * @param rewardTypeList the caller's reward-type list.
 * @returns the derived list, as a CFML comma-list, empty when neither element is present.
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

// ---------------------------------------------------------------------------
// Hydration
//
// ONE row-to-entity factory for `PromotionReward`, plus the three helpers that assemble the
// associations it needs. Construction, collaborator injection and association materialization all
// happen in this one place, so there is no second site that knows how to build a reward.
//
// SMALL SEPARATE MAPPERS EXIST FOR FOUR OTHER SHAPES, AND NONE OF THEM IS ENTITY HYDRATION:
//   * the four use-count results are a single scalar each, so there is no object to build;
//   * the sale-price rows are the PORT'S OWN FLAT ROW PROJECTION - the port fixes that shape
//     deliberately, because the legacy returns a CFML query object rather than entities
//     [model/dao/PromotionDAO.cfc:L590], and no reward entity is reachable from those columns;
//   * the rounding-rule row builds a `RoundingRule`, which IS an entity - so it shares the same
//     mapper the reward factory uses for its joined rule, and there is only one of those;
//   * the qualifier rows build `PromotionQualifier` entities, which exist only to complete the
//     reward's period, and so are assembled by the reward factory's own helper.
//
// INSTANCE SHARING WITHIN ONE INVOCATION. Two rewards belonging to the same promotion period arrive
// as two rows carrying the same period columns. They are hydrated into ONE shared `PromotionPeriod`
// instance, keyed by folded identifier, and the same holds for the promotion and the rounding rule.
// This mirrors the identity Hibernate's session gave the legacy - `spr.getPromotionPeriod() is
// spr2.getPromotionPeriod()` held there - which matters because the promotion engine keys its
// qualification cache on `getPromotionPeriodID()` and reads state back off the period
// [model/service/PromotionService.cfc:L192-L222]. THE MAPS ARE INVOCATION-SCOPED, CREATED INSIDE THE
// METHOD: nothing here is module-scoped, because module state on a warm Lambda container would
// outlive the request and leak one caller's graph into another's.
// ---------------------------------------------------------------------------

/** The three opaque-identifier collections a reward or a qualifier carries. */
interface OpaqueLinkSets {
  readonly fulfillmentMethodIDs: readonly string[];
  readonly shippingMethodIDs: readonly string[];
  readonly shippingAddressZoneIDs: readonly string[];
}

/** Nothing linked. Frozen and shared, so an owner with no links allocates no arrays. */
const NO_LINK_MEMBERS: readonly string[] = Object.freeze([]);

/**
 * Group link rows by their owner.
 *
 * The map key is the FOLDED owner identifier. CFML struct keys are case-insensitive and MySQL's
 * default collation is too, so folding is what keeps the grouping and the later lookup agreeing with
 * both. The stored member values are NOT folded - they are handed on exactly as the column holds
 * them.
 *
 * @param rows the link rows.
 * @param descriptor which link table produced them.
 * @param statementLabel which statement produced them, for fault messages.
 * @returns owner identifier to member identifiers, in row order within each owner.
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
 * An owner with no link rows gets the shared frozen empty array, which is the same value the entity
 * constructors would have defaulted to. An empty collection is a legitimate state, never a fault.
 *
 * @param grouped the grouping produced by `groupLinkMembers`.
 * @param ownerID the owner to look up, in any casing.
 * @returns the member identifiers, or an empty array.
 */
function linkMembersOf(grouped: Map<string, string[]>, ownerID: string): readonly string[] {
  return grouped.get(foldIdentifier(ownerID)) ?? NO_LINK_MEMBERS;
}

/**
 * Hydrate one `SwRoundingRule` row.
 *
 * Shared by method 1's `LEFT JOIN` - through a column-prefix indirection - and by method 7. One
 * mapper, so the entity is constructed identically either way.
 *
 * `roundingRuleExpression` IS PASSED THROUGH UNTOUCHED. CFML parity
 * [model/entity/RoundingRule.cfc:L54]: the column is declared `ormtype="string"` with no length, no
 * format constraint, no validation rule and no normalization anywhere in the legacy tree - so it is
 * not trimmed, not case-folded, not defaulted and not rejected here, however odd it looks. What the
 * rounding algorithm does with an odd expression is a SERVICE concern
 * [model/service/RoundingRuleService.cfc:L88-L175], characterized by that tier's own tests, and a
 * repository that pre-validated it would hide the very inputs those tests exist to pin.
 *
 * @param row the row to hydrate.
 * @param columnPrefix `''` for method 7's unprefixed projection, or `'srr_'` for method 1's joined
 *   one.
 * @param statementLabel which statement produced the row.
 * @param valueRounder the arithmetic collaborator the entity delegates to.
 * @returns the rule.
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
 * `activeFlag` is handed over RAW, exactly as `readFlag` produced it. `Promotion`'s own constructor
 * applies the ORM default `default="1"` [model/entity/Promotion.cfc:L56] for an absent value and then
 * routes the result through `cfBoolean()`, so coercing here would pre-empt that default and could
 * turn an active promotion inactive. No `Boolean(...)`, no `!!`, no `=== 1` anywhere.
 *
 * FETCH SHAPE: `promotionPeriods`, `promotionCodes` and `appliedPromotions`
 * [model/entity/Promotion.cfc:L62-L64] are left empty. All three are inverse one-to-many collections
 * that the legacy `JOIN FETCH` does not populate either, and filling `promotionPeriods` with only the
 * one period this row came through would assert something false about the promotion's contents.
 * `defaultImageID` is carried as an opaque identifier because `Image` is out of scope.
 *
 * @param row the row to hydrate.
 * @returns the promotion.
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
 * The two fulfillment-weight gates go through the NON-MONETARY decimal reader: they are
 * `ormtype="big_decimal"` with `hb_formatType="weight"`
 * [model/entity/PromotionQualifier.cfc:L63-L64] and the entity types them `number`, so routing them
 * through `Money` would misrepresent a weight as currency. The four subtotal and price gates ARE
 * money and go through `Money`, from the decimal string the driver supplies.
 *
 * Not one of the ten gates is defaulted. `undefined` is the value that means "no bound", which
 * `hb_nullRBKey="define.0"` and `hb_nullRBKey="define.unlimited"` say outright
 * [model/entity/PromotionQualifier.cfc:L55-L64] - substituting `0` for a maximum would turn
 * "unlimited" into "nothing qualifies".
 *
 * FETCH SHAPE: `promotionPeriod` is left absent, deliberately. The qualifier is reached only THROUGH
 * its period in this graph, so setting the back-reference would create a cycle the hydration would
 * have to break by construction order rather than by design, and no consumer of a qualifier reached
 * from a period asks it for its period. The ten catalog collections are left empty on the ownership
 * grounds recorded above the link descriptors.
 *
 * @param row the row to hydrate.
 * @param links the three opaque-identifier collections for this qualifier.
 * @returns the qualifier.
 */
function toPromotionQualifier(row: SqlRow, links: OpaqueLinkSets): PromotionQualifier {
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
    remoteID: readOptionalText(row, 'remoteID', label),
    createdDateTime: readTimestamp(row, 'createdDateTime', label),
    createdByAccountID: readOptionalText(row, 'createdByAccountID', label),
    modifiedDateTime: readTimestamp(row, 'modifiedDateTime', label),
    modifiedByAccountID: readOptionalText(row, 'modifiedByAccountID', label),
  });
}

/**
 * Hydrate one `SwPromotionPeriod` row from method 1's prefixed projection.
 *
 * @param row the row to hydrate.
 * @param promotion the shared promotion instance this period belongs to.
 * @param promotionQualifiers the period's qualifiers, already assembled.
 * @param now the invocation's single captured instant, as the provider the entity requires.
 * @returns the period.
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
    // collection IS populated, because the promotion engine walks it and there is no lazy loader to
    // fall back on.
    promotionQualifiers,
  });
}

/**
 * THE row-to-entity factory for `PromotionReward`.
 *
 * Every reward this file returns is built here, and nowhere else. The period, promotion and rounding
 * rule handed in are the SHARED instances the invocation resolved, so two rewards on one period
 * reference one period object.
 *
 * `amount` is `Money | undefined` from the `big_decimal` column, which declares NO `default`
 * [model/entity/PromotionReward.cfc:L61] - so a NULL amount stays absent and is never `Money.zero`.
 * `amountType` and `applicableTerm` are narrowed permissively, mapping an unrecognized persisted
 * value to absence, which is what reproduces the legacy discount switch's missing `default` arm.
 * The three use limits are `number | undefined`, where absence means UNLIMITED
 * [model/entity/PromotionReward.cfc:L65-L67] and never zero uses.
 *
 * LEGACY-DEFECT [model/entity/PromotionReward.cfc:L57]: the component declares
 * `hb_permission="promotionPeriod.promtionRewards"` - `promtionRewards` is missing its `o`. The
 * misspelling is part of the persisted permission vocabulary the legacy admin resolves against, so
 * `src/domain/entities/promotionReward.ts` carries it verbatim in its entity metadata and this
 * factory does not touch, rewrite or normalize that metadata.
 * Preserved deliberately; do not fix without a product decision.
 *
 * @param row the reward row, carrying the prefixed projection.
 * @param promotionPeriod the shared period instance.
 * @param roundingRule the shared rule instance, or `undefined` when the `LEFT JOIN` matched nothing.
 * @param links the three opaque-identifier collections for this reward.
 * @returns the reward.
 */
function toPromotionReward(
  row: SqlRow,
  promotionPeriod: PromotionPeriod,
  roundingRule: RoundingRule | undefined,
  links: OpaqueLinkSets,
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
    remoteID: readOptionalText(row, 'spr_remoteID', label),
    createdDateTime: readTimestamp(row, 'spr_createdDateTime', label),
    createdByAccountID: readOptionalText(row, 'spr_createdByAccountID', label),
    modifiedDateTime: readTimestamp(row, 'spr_modifiedDateTime', label),
    modifiedByAccountID: readOptionalText(row, 'spr_modifiedByAccountID', label),

    // FETCH SHAPE: `eligiblePriceGroups` and the ten catalog collections are left to the entity's own
    // empty-array defaults, on the ownership grounds recorded above the link descriptors.
  });
}

/**
 * Map one sale-price row onto the port's row projection.
 *
 * NOT ENTITY HYDRATION, and that is the port's decision rather than a shortcut. The legacy returns a
 * CFML query object [model/dao/PromotionDAO.cfc:L590], the eight projected columns come from a
 * reduction across six UNION branches and are not the columns of any one row of any one table, and
 * no reward entity is reachable from them. The port fixes the shape as an array of flat rows.
 *
 * `originalPrice` and `salePrice` both arrive as DECIMAL STRINGS and go straight into `Money`. No
 * `Number()` and no arithmetic here: the rounding rule is NOT applied, only its identifier carried,
 * because rounding is the service tier's step
 * [model/service/PromotionService.cfc:L1024-L1028].
 *
 * `originalPrice` is optional and maps a NULL to absence rather than to a zero, on the same grounds
 * as every other no-default money column in this file. `salePrice` is required, and the reason it can
 * be is structural - see `readMoney`.
 *
 * @param row one row of the reduced result set.
 * @returns the port's row projection.
 */
function toSalePricePromotionRewardRow(row: SqlRow): SalePricePromotionRewardRow {
  const label = SALE_PRICE_STATEMENT_LABEL;
  const originalPrice = readOptionalMoney(row, 'originalPrice', label);
  const roundingRuleID = readOptionalText(row, 'roundingRuleID', label);
  const salePriceExpirationDateTime = readTimestamp(row, 'salePriceExpirationDateTime', label);

  // Under `exactOptionalPropertyTypes` the three optional members must be ABSENT to mean absent, so
  // each is spread in only when it has a value. Assigning `undefined` to them would not compile, and
  // that strictness is doing real work here: it keeps "no expiration recorded" distinguishable from
  // "expiration explicitly unset" at the type level.
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
 * Resolve the promotion identifier the two period use-count statements bind.
 *
 * VERBATIM LEGACY - model/dao/PromotionDAO.cfc:L138, and identically at L193:
 *
 *     promotionID = arguments.promotionPeriod.getPromotion().getPromotionID()
 *
 * The count is taken for the period's PROMOTION rather than for the period itself, which is what the
 * statements' predicates compare - so every period of a promotion shares one use count.
 *
 * CFML has no null guard on that chain, so a period whose promotion is not loaded raises inside the
 * DAO. That failure is reproduced rather than smoothed - see `PromotionAssociationError`.
 *
 * @param promotionPeriod the period whose promotion is read.
 * @param methodName the port method being served, for the fault message.
 * @returns the promotion identifier.
 * @throws An error named `PromotionAssociationError` when the promotion is not materialized.
 */
function requirePromotionID(promotionPeriod: PromotionPeriod, methodName: string): string {
  const promotion = promotionPeriod.getPromotion();

  if (promotion === undefined) {
    throw new PromotionAssociationError('PromotionPeriod', 'promotion', methodName);
  }

  return promotion.getPromotionID();
}

/** The three link tables that serve one owner kind. */
interface LinkDescriptorTriple {
  readonly fulfillmentMethods: LinkTableDescriptor;
  readonly shippingMethods: LinkTableDescriptor;
  readonly shippingAddressZones: LinkTableDescriptor;
}

/** The reward's three opaque-identifier collections [model/entity/PromotionReward.cfc:L76-L78]. */
const REWARD_LINK_DESCRIPTORS: LinkDescriptorTriple = Object.freeze({
  fulfillmentMethods: REWARD_FULFILLMENT_METHOD_LINK,
  shippingMethods: REWARD_SHIPPING_METHOD_LINK,
  shippingAddressZones: REWARD_SHIPPING_ADDRESS_ZONE_LINK,
});

/** The qualifier's three [model/entity/PromotionQualifier.cfc:L73-L75]. */
const QUALIFIER_LINK_DESCRIPTORS: LinkDescriptorTriple = Object.freeze({
  fulfillmentMethods: QUALIFIER_FULFILLMENT_METHOD_LINK,
  shippingMethods: QUALIFIER_SHIPPING_METHOD_LINK,
  shippingAddressZones: QUALIFIER_SHIPPING_ADDRESS_ZONE_LINK,
});

/** The three groupings one link read produces, keyed by folded owner identifier. */
interface LinkGrouping {
  readonly fulfillmentMethods: Map<string, string[]>;
  readonly shippingMethods: Map<string, string[]>;
  readonly shippingAddressZones: Map<string, string[]>;
}

/**
 * Reduce identifiers to the distinct ones, comparing case-insensitively and keeping first-seen order.
 *
 * CFML parity [model/service/PromotionService.cfc:L192-L222]: CFML struct keys are case-insensitive,
 * and the promotion engine keys its per-period cache with them - so two identifiers differing only in
 * case are ONE key there and are folded to one key here. Order is preserved so the bound parameter
 * array is a deterministic function of the rows, which is what lets a suite assert it.
 *
 * @param identifiers the identifiers to reduce, in row order.
 * @returns the distinct identifiers, in first-seen order, with their stored casing intact.
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

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------

/**
 * The MySQL implementation of `PromotionRepository`.
 *
 * Seven methods, exactly the seven the port declares, all of them `async` because all seven reach the
 * database. No eighth public member exists, and no `roundingRuleRepository` accompanies this file:
 * the port inventory is thirteen and `getRoundingRuleQuery` is hosted here precisely so it stays
 * thirteen.
 */
export class MysqlPromotionRepository implements PromotionRepository {
  /**
   * The narrow prepared-statement surface every read goes through.
   *
   * JUDGMENT CALL: the executor is a CONSTRUCTOR PARAMETER and never a module singleton, and that is
   * a mandatory design constraint rather than a convenience. It is what makes the emitted statement
   * text and the bound parameter array assertable WITH NO LIVE DATABASE - a suite can implement the
   * two-method interface outright, record each `sql` string and each `params` array and return canned
   * rows. That matters more for this file than for any of its siblings: the statement text IS the
   * behaviour here, because the absent `ORDER BY`, the strict date operators, the four-table
   * exclusion list and the missing tiebreaker are all facts about the text.
   *
   * It also keeps the one sanctioned module-scope pool in `src/repositories/mysql/connection.ts` from
   * leaking into this file. Nothing here imports a pool, builds one, or reads an environment
   * variable, and the single wiring point is the composition root that replaces DI/1's runtime
   * convention scan.
   *
   * The interface exposes no `query` method at all, so parameterization is structural rather than a
   * habit a reviewer has to police. That is the guarantee `<cfqueryparam>` gave the legacy `<cfquery>`
   * bodies, preserved exactly.
   */
  private readonly executor: PreparedStatementExecutor;

  /**
   * The rounding collaborator every hydrated `RoundingRule` is constructed with.
   *
   * JUDGMENT CALL: injected here rather than resolved inside the hydration, for the same reason as
   * the executor - the wiring belongs to the composition root. THIS ADAPTER NEVER ROUNDS ANYTHING: it
   * hands the collaborator to the entity and does nothing else with it. The arithmetic itself lives
   * in `roundValue` and its two wrappers [model/service/RoundingRuleService.cfc:L79,L84,L88], which
   * are service methods.
   *
   * The composition root also resolves the apparent cycle - the rounding-rule service consumes method
   * 7 of this same port - by wiring the service's own dependency lazily. That is a composition
   * concern, and no cycle-breaking logic appears in this file.
   */
  private readonly valueRounder: RoundingRuleValueRounder;

  /**
   * @param executor the prepared-statement executor this repository reads through.
   * @param valueRounder the rounding arithmetic a hydrated `RoundingRule` delegates to.
   */
  constructor(executor: PreparedStatementExecutor, valueRounder: RoundingRuleValueRounder) {
    this.executor = executor;
    this.valueRounder = valueRounder;
  }

  /**
   * Active promotion rewards of the requested types, within their period and promotion windows.
   *
   * Ports [model/dao/PromotionDAO.cfc:L51-L132].
   *
   * ⛔ THERE IS NO `ORDER BY`, AND THAT ABSENCE IS THE BEHAVIOUR.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L51-L132]: the legacy applies no `ORDER BY`, no
   * `DISTINCT`, no `LIMIT` and no tiebreaker of any kind, so the order in which rewards come back is
   * whatever the ORM happens to produce. That is not incidental. The promotion engine threads a
   * MUTABLE usage ledger through its whole loop and increments
   * `promotionRewardUsageDetails[rewardID].usedInOrder` in place
   * [model/service/PromotionService.cfc:L297], so whether a later reward is allowed depends on which
   * earlier rewards ran - and the two insertion sorts downstream
   * [model/service/PromotionService.cfc:L266-L294, L301-L329] run in OPPOSITE directions over the
   * results. ADDING AN ORDERING HERE WOULD CHANGE WHICH REWARDS WIN AND THEREFORE CHANGE THE AMOUNT A
   * CUSTOMER IS CHARGED. This is one of the three named must-preserve behaviours of the migration.
   *
   * JUDGMENT CALL: the resulting non-determinism at the boundary of a tie is REPRODUCED DELIBERATELY,
   * not overlooked. It was found, read against the engine that consumes it, and left exactly as the
   * source leaves it. A characterization suite pins the emitted statement text, and the absence of an
   * ordering clause is part of what it pins.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L117]: `now()` is CFML SERVER-LOCAL time. ONE instant is
   * captured per invocation and BOUND to every date placeholder - the legacy captures one value into
   * `params.now` [model/dao/PromotionDAO.cfc:L117] and reuses it across every clause, so emitting a
   * SQL `NOW()` per clause would let the clauses disagree with each other. The captured instant is
   * also what the hydrated period's date predicates read, through the provider its constructor takes,
   * so the whole invocation agrees on one moment. `connection.ts` fixes the pool's session timezone
   * and documents the explicit UTC policy this consumes; no clock abstraction is introduced, and the
   * whole mechanism is one captured value bound as a parameter.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L118,L321]: the legacy binds the promotion's active flag
   * TWO DIFFERENT WAYS in this one component - the numeric `1` here, and a `cf_sql_bit` `1` in the
   * sale-price statement [model/dao/PromotionDAO.cfc:L321]. Both match the same rows, since Hibernate
   * maps `ormtype="boolean"` [model/entity/Promotion.cfc:L56] to `bit(1)` and MySQL compares a bit
   * column against the integer `1` identically either way. This adapter reconciles them to ONE bound
   * shape, the numeric `1`, which is also what the sale-price statement module binds. The
   * reconciliation is recorded so it is auditable and is not mistaken for a change of semantics.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L89,L109,L125,L126]: the legacy reads its own
   * `promotionCodeList` argument INCONSISTENTLY - unqualified at L89, L109 and L125, and as
   * `arguments.promotionCodeList` at L126 - relying on CFML's implicit fallback to the `arguments`
   * scope. Both spellings resolve to the same value. TypeScript has no implicit argument scope, so
   * both collapse to the single parameter; the inconsistency is recorded rather than reproduced,
   * because there is nothing to reproduce - it was never a behavioural difference.
   *
   * FETCH SHAPE, in full. `promotionPeriod` and `promotion` are materialized by the two `INNER JOIN`
   * clauses that replace the legacy's two `INNER JOIN FETCH` clauses
   * [model/dao/PromotionDAO.cfc:L66,L68], in the same statement. `roundingRule` is materialized by a
   * `LEFT JOIN` in that statement too. The period's `promotionQualifiers` are materialized by ONE
   * further statement keyed by every period identifier at once. The three opaque-identifier
   * collections on each reward and on each qualifier are materialized by SIX further statements,
   * each keyed by every owner identifier at once. That is at most EIGHT statements per invocation,
   * FIXED, regardless of how many rewards match; there is no per-row lookup anywhere. Everything else
   * is left to the entities' own empty-collection defaults, on the ownership grounds recorded above
   * the link descriptors. No lazy loading is simulated.
   *
   * @param rewardTypeList comma-delimited reward types to match. An EMPTY list matches nothing and is
   *   short-circuited before any statement is built - see the note at the guard.
   * @param promotionCodeList comma-delimited promotion codes the caller supplied. An empty list means
   *   "no code was supplied", not "match every code", and it removes two clauses rather than
   *   emptying them.
   * @param qualificationRequired legacy default `false` [model/dao/PromotionDAO.cfc:L54]; when true,
   *   an additional alternation requires a qualifier, a valid supplied code, or an exempt reward type.
   * @returns The matching rewards, in the engine's own unspecified order.
   */
  async getActivePromotionRewards(
    rewardTypeList: string,
    promotionCodeList: string,
    qualificationRequired?: boolean,
  ): Promise<PromotionReward[]> {
    // VERBATIM LEGACY - model/dao/PromotionDAO.cfc:L54: `<cfargument name="qualificationRequired"
    // type="boolean" default="false" />`. The port makes the parameter optional, so the legacy default
    // is applied here explicitly rather than inherited from a declaration.
    const qualificationIsRequired = qualificationRequired ?? false;

    const noQualRequiredList = deriveNoQualificationRequiredList(rewardTypeList);
    const rewardTypes = tokenizeList(rewardTypeList);
    const promotionCodes = tokenizeList(promotionCodeList);
    const noQualRequiredTypes = tokenizeList(noQualRequiredList);

    // JUDGMENT CALL: an empty `rewardTypeList` returns no rewards WITHOUT issuing a statement, and
    // this is a documented normalization rather than a faithful reproduction. The legacy binds
    // `listToArray('')`, an empty collection, into HQL's `IN (:rewardTypeList)`; Hibernate renders
    // that as an unsatisfiable predicate and the query returns nothing. There is no way to render the
    // same thing in positional SQL - `IN ()` does not parse, and `sqlPlaceholderList` refuses a count
    // of zero for exactly that reason - so the OUTCOME is reproduced instead of the mechanism. An
    // empty array is what an unsatisfiable predicate would have produced. Nothing else in the method
    // runs, which also means no timestamp is captured for a call that cannot match.
    if (rewardTypes.length < 1) {
      return [];
    }

    // CFML parity [model/dao/PromotionDAO.cfc:L117]: THE SINGLE CAPTURED INSTANT. Read once, here,
    // and bound everywhere a date is compared. `new Date()` appears exactly once in this method.
    const capturedInstant = new Date();

    // The provider the period entity's constructor requires. It reads no clock: it hands back a copy
    // of the instant already captured, so a caller cannot mutate the value the statement was bound
    // with, and every date predicate on every hydrated period agrees with the statement.
    const now = (): Date => new Date(capturedInstant.getTime());

    const clauses: string[] = [
      ACTIVE_REWARD_PROJECTION,
      ACTIVE_REWARD_FROM,
      activeRewardBaseWhereClause(sqlPlaceholderList(rewardTypes.length)),
    ];

    // Text and binds move together, in the legacy's own clause order: the reward types, then the
    // instant twice for the two period bounds [model/dao/PromotionDAO.cfc:L73,L75], then the active
    // flag [model/dao/PromotionDAO.cfc:L118]. Positional binding makes that order load-bearing.
    const params: (string | number | Date)[] = [
      ...rewardTypes,
      capturedInstant,
      capturedInstant,
      1,
    ];

    // VERBATIM LEGACY - model/dao/PromotionDAO.cfc:L80-L100. The whole alternation is emitted only
    // when qualification is required, and the two `OR` arms inside it are each emitted only when
    // their list is non-empty - `<cfif len(promotionCodeList)>` at L89 and
    // `<cfif len(noQualRequiredList)>` at L94. `cfLen` reproduces those two tests rather than a
    // TypeScript truthiness check.
    if (qualificationIsRequired) {
      clauses.push(QUALIFIER_EXISTS_CLAUSE);

      // An EMPTY promotion-code list REMOVES this clause rather than emptying it, which is exactly
      // what the legacy `<cfif len(...)>` does. The distinction matters: an emptied `IN ()` would be
      // unparseable, and a clause that matched every code would let coded promotions through
      // unconditionally.
      if (cfLen(promotionCodeList) > 0 && promotionCodes.length > 0) {
        clauses.push(promotionCodeExistsClause(sqlPlaceholderList(promotionCodes.length)));
        params.push(...promotionCodes, capturedInstant, capturedInstant);
      }

      // CFML parity [model/dao/PromotionDAO.cfc:L94,L121]: the emission test and the BIND test are
      // written differently in the legacy - `len(noQualRequiredList)` guards the clause at L94, while
      // `arguments.qualificationRequired and len(noQualRequiredList)` guards the bind at L121 - and
      // they agree, because the clause only exists inside the `qualificationRequired` block. Nesting
      // this test inside that block is what keeps them agreeing here.
      if (cfLen(noQualRequiredList) > 0 && noQualRequiredTypes.length > 0) {
        clauses.push(noQualificationRequiredClause(sqlPlaceholderList(noQualRequiredTypes.length)));
        params.push(...noQualRequiredTypes);
      }

      clauses.push(CLOSE_GROUP_CLAUSE);
    }

    // VERBATIM LEGACY - model/dao/PromotionDAO.cfc:L102-L114. Emitted unconditionally, whatever the
    // qualification setting: the reward must belong to a promotion with no codes at all, or to one
    // whose code the caller supplied and which is currently valid.
    clauses.push(NO_PROMOTION_CODE_CLAUSE);

    if (cfLen(promotionCodeList) > 0 && promotionCodes.length > 0) {
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
   * Ports [model/dao/PromotionDAO.cfc:L134-L185]. The statement itself lives in
   * `sql/promotionUseCounts.sql.ts`; this method resolves the identifiers, executes it and reads the
   * scalar out.
   *
   * LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L177]: the clause that applies the counted window's
   * UPPER bound is guarded by `not isNull(arguments.promotionPeriod.getStartDateTime())` - a
   * duplicated test of the START date where an END-date test is plainly intended, sitting immediately
   * after the correct start/end pair at L173-L174. A period with a start date but no end date
   * therefore binds a NULL upper bound, and a period with an end date but no start date never applies
   * its upper bound at all. This widens or narrows the counted window, and the engine compares the
   * resulting count against the period's maximum use count
   * [model/service/PromotionService.cfc:L567] - so it decides whether a discount applies. It is
   * reproduced exactly, by the statement module, which binds the end value whenever the START value
   * is present.
   * Preserved deliberately; do not fix without a product decision.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L134-L296]: THE FOUR USE-COUNT QUERIES ARE ASYMMETRIC IN
   * THREE INDEPENDENT WAYS, and none of the three is harmonized. (1) NULL TOLERANCE: the two PERIOD
   * queries - this one and `getPromotionPeriodAccountUseCount` - wrap every order-status test in a
   * null-tolerant disjunction, while the two CODE queries use a bare `!=`, so an order whose status
   * system code is NULL is counted by the period queries and dropped by the code queries. (2) JOIN
   * SHAPE: see the marker on `getPromotionPeriodAccountUseCount`. (3) DATE WINDOW: only the two period
   * queries narrow by date at all. Each is preserved where it appears.
   *
   * FETCH SHAPE: NOTHING IS MATERIALIZED. The statement returns one aggregate scalar, so there is no
   * object to build and no association to fetch - which is why this method has a small mapper, the
   * count reader, rather than going through the reward factory.
   *
   * @param promotionPeriod The period whose promotion is counted. Its promotion must already be
   *   materialized, because the legacy body reaches through it
   *   [model/dao/PromotionDAO.cfc:L138].
   * @returns The count. A number, not a boolean.
   * @throws An error named `PromotionAssociationError` when the period's promotion is absent, which
   *   is where the legacy body raises too.
   */
  async getPromotionPeriodUseCount(promotionPeriod: PromotionPeriod): Promise<number> {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: requirePromotionID(promotionPeriod, 'getPromotionPeriodUseCount'),

      // CFML parity [model/dao/PromotionDAO.cfc:L173-L178]: the entity's `undefined` for an absent
      // bound becomes the statement module's `null`, which is the single spelling it uses for "no
      // date" - the same single state CFML's `isNull()` tests.
      startDateTime: promotionPeriod.getStartDateTime() ?? null,
      endDateTime: promotionPeriod.getEndDateTime() ?? null,
    });

    return await this.executeUseCount(statement, PERIOD_USE_COUNT_STATEMENT_LABEL);
  }

  /**
   * How many times ONE account has used the promotion behind a promotion period.
   *
   * Ports [model/dao/PromotionDAO.cfc:L187-L252].
   *
   * LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L244]: the SAME duplicated `getStartDateTime()` guard
   * as its sibling, in this method's own body, immediately after its own correct start/end pair at
   * L240-L241. BOTH SITES ARE PERIOD METHODS - neither belongs to a code method - and both are
   * reproduced exactly, with the same consequence for use-limit enforcement.
   * Preserved deliberately; do not fix without a product decision.
   *
   * LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L134-L252]: THE TWO PERIOD QUERIES JOIN THE PROMOTION
   * DIFFERENTLY. `getPromotionPeriodUseCount` declares an explicit `LEFT JOIN pa.promotion pap`
   * [model/dao/PromotionDAO.cfc:L144-L145] and filters `pap.promotionID`
   * [model/dao/PromotionDAO.cfc:L171]; THIS one uses the implicit association path
   * `pa.promotion.promotionID` [model/dao/PromotionDAO.cfc:L238], which Hibernate resolves as an
   * INNER join. An applied-promotion row whose promotion reference is null is therefore counted by
   * the sibling and silently excluded here. The two join types are NOT unified: the statement module
   * emits a `LEFT JOIN` for the first and an `INNER JOIN` for the second, exactly as written.
   * Preserved deliberately; do not fix without a product decision.
   *
   * FETCH SHAPE: nothing is materialized - one aggregate scalar, as above.
   *
   * @param promotionPeriod The period whose promotion is counted, with its promotion materialized.
   * @param accountID Opaque identifier of the account, replacing the out-of-scope entity. The legacy
   *   takes `required any account` and immediately reduces it to `getAccountID()`
   *   [model/dao/PromotionDAO.cfc:L193], so the identifier is exactly what the legacy query bound.
   * @returns The count. A number, not a boolean.
   * @throws An error named `PromotionAssociationError` when the period's promotion is absent.
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
   * Ports [model/dao/PromotionDAO.cfc:L254-L272].
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L262]: THE ORDER-STATUS TEST IS A BARE `!=` WITH NO NULL
   * TOLERANCE, unlike either period query. In HQL - and in SQL - a comparison against NULL is
   * UNKNOWN rather than true, so an order whose status system code is null is NOT counted here even
   * though the period queries would count it. Preserved as written; the asymmetry is not harmonized.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L259-L260]: the legacy joins `pc.orders`, which
   * `model/entity/PromotionCode.cfc:L68` declares `lazy="extra"`. THAT IS NOT A COLLECTION
   * MATERIALIZATION AND IT IS NOT A VIOLATION OF THE STANDING RULE AGAINST MATERIALIZING ONE. The
   * association is used purely as an `INNER JOIN` inside an aggregate: no order row is built, nothing
   * is attached to any entity, and the count is the only thing that crosses the boundary. `Order` is
   * out of scope and is reached here only as an opaque row source. The distinction is recorded so a
   * later reader does not set out to fix a phantom violation.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L254-L272]: THERE IS NO DATE WINDOW. The code queries
   * count every qualifying order regardless of when it was placed, while both period queries narrow
   * by the period's dates. That is the third of the three asymmetries, preserved.
   *
   * FETCH SHAPE: nothing is materialized - one aggregate scalar.
   *
   * @param promotionCode The code whose use is counted. The legacy binds
   *   `getPromotionCodeID()` [model/dao/PromotionDAO.cfc:L267].
   * @returns The count. A NUMBER, not a boolean - see the note on `readCount` about the service
   *   tier's contradictory declaration.
   */
  async getPromotionCodeUseCount(promotionCode: PromotionCode): Promise<number> {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionCodeUseCount({
      promotionCodeID: promotionCode.getPromotionCodeID(),
    });

    return await this.executeUseCount(statement, CODE_USE_COUNT_STATEMENT_LABEL);
  }

  /**
   * How many placed orders belonging to ONE account have used a promotion code.
   *
   * Ports [model/dao/PromotionDAO.cfc:L274-L296]. Identical in every respect to its sibling above -
   * the same bare `!=` at [model/dao/PromotionDAO.cfc:L284], the same legitimate aggregate join on
   * `pc.orders`, the same absent date window - with the account predicate added
   * [model/dao/PromotionDAO.cfc:L288].
   *
   * FETCH SHAPE: nothing is materialized - one aggregate scalar.
   *
   * @param promotionCode The code whose use is counted.
   * @param accountID Opaque identifier of the account [model/dao/PromotionDAO.cfc:L292].
   * @returns The count. A number, not a boolean.
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
   * Ports [model/dao/PromotionDAO.cfc:L298-L591]. The statement lives in
   * `sql/salePricePromotionRewards.sql.ts`; this method captures the instant, decides whether the
   * product identifier is PRESENT, executes, and maps the rows onto the port's projection.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L306]: ONE instant, captured once into `timeNow` and
   * reused by the preliminary query and by all six UNION branches. Reproduced exactly - `new Date()`
   * appears once in this method and the value is bound to every date placeholder. No SQL `NOW()` is
   * emitted anywhere.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L317,L319]: THE DATE COMPARISONS HERE ARE INCLUSIVE -
   * `<=` and `>=` - in the preliminary query and in every branch. THE HQL PATH IN
   * `getActivePromotionRewards` USES STRICT `<` AND `>` [model/dao/PromotionDAO.cfc:L73,L75]. The two
   * paths disagree about the boundary instant and NEITHER IS NORMALIZED. See the matching note on
   * that method, which cross-references back to here.
   *
   * LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L359,L390,L423,L456,L497,L538]: all six branches guard
   * the product filter with `structKeyExists(arguments,"productID")` and NO `len()` check, so a
   * PRESENT BUT EMPTY identifier is bound and every branch matches nothing. That behaviour is
   * preserved: no `len()` guard, no default, no early return. The identical wart appears in
   * `model/dao/SkuDAO.cfc:L107-L128`, which makes six instances plus a sibling - a house pattern
   * rather than a slip. In TypeScript, passing `''` reaches the same state, because `''` is not
   * `undefined` and so the identifier is present.
   * Preserved deliberately; do not fix without a product decision.
   *
   * LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L527-L533]: THE `'global'` BRANCH'S `NOT EXISTS` LIST
   * COVERS ONLY FOUR OF THE FIVE REWARD LINK TABLES - `SwPromoRewardProduct`, `SwPromoRewardBrand`,
   * `SwPromoRewardOption` and `SwPromoRewardProductType` - AND OMITS `SwPromoRewardSku`. The
   * consequence is observable and money-affecting: a reward linked ONLY to a SKU satisfies the
   * `'sku'` branch AND the `'global'` branch, so a SKU-specific reward is emitted a second time as a
   * global discount against EVERY SKU row, and the per-SKU minimum can then be won by a discount
   * that was never meant to reach that SKU. The four-table list is reproduced EXACTLY by the
   * statement module, which carries the full marker beside the branch it belongs to
   * [`sql/salePricePromotionRewards.sql.ts`]; NO fifth `NOT EXISTS` is added here or there. This is
   * one of the sharpest examples in the migration of why this port is not a cleanup exercise.
   * Preserved deliberately; do not fix without a product decision.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L307,L328-L330]: the legacy declares a local
   * `salePromotionPeriodIDs`, populates it inside the `<cfloop>` over the preliminary query, and then
   * NEVER READS IT AGAIN. It is not declared here. A never-read local has NO OBSERVABLE EFFECT, so
   * omitting it changes nothing at all - and `noUnusedLocals` would reject it outright, which is the
   * mechanical reason the omission is recorded in prose instead. This is NOT a divergence. It must not
   * be confused with `noQualifierCurrentActivePromotionPeriods`, a DIFFERENT local that IS consumed,
   * by the first of the three post-processing steps [model/dao/PromotionDAO.cfc:L556,L558], and which
   * the statement module reproduces as its first common table expression.
   *
   * The three chained in-engine `dbtype="query"` steps
   * [model/dao/PromotionDAO.cfc:L544-L559, L561-L569, L571-L588] are expressed as SQL common table
   * expressions by the statement module. Node has no query-of-queries equivalent - there is no
   * in-process engine to hand a result set back to for a second pass - so the same reduction is
   * computed in the database instead. Both formulations sit side by side in that module so a reviewer
   * can compare them directly. It is a mechanical necessity, and no claim of any other kind is made
   * about it.
   *
   * ⛔ TIES ARE NOT DISAMBIGUATED. The final step joins the reduced rows back to the per-SKU minimum
   * on SKU and sale price, and [model/dao/PromotionDAO.cfc:L571-L588] carries NO `LIMIT`, NO
   * `ORDER BY` and NO `DISTINCT` - so two rewards yielding the same minimum both survive and one SKU
   * can legitimately appear more than once. No tiebreaker is added: no single-row limit, no secondary
   * sort, no recency preference, no reward-identifier ordering. JUDGMENT CALL: this non-determinism is
   * reproduced deliberately, not overlooked - it is the same load-bearing family as the absent
   * ordering on method 1.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L482-L488]: the `productType` branch matches against the
   * comma-delimited `productTypeIDPath` with a DIALECT-SPECIFIC concatenation, and the MySQL arm is an
   * UNANCHORED substring `LIKE` - `concat('%', <idColumn>, '%')` - with no comma anchoring and
   * no `FIND_IN_SET`. That form is reproduced faithfully by the statement module, which composes it
   * through the fragment accessor in `./dialect.js` rather than inlining a `concat(...)` or
   * hand-rolling a dialect comparison; `dialect.ts` owns the case-folded product-name comparison and
   * the MySQL-only guard. The fragment is reached from THERE rather than from here because the module
   * that owns the statement carrying the match is the module that must compose it - importing the
   * accessor into this file as well would put two owners on one fragment. The identical unanchored
   * idiom appears at `model/dao/PhysicalDAO.cfc:L121`, which is what makes it a house pattern.
   *
   * ⚠ NOTE THE MECHANISM DIVERGENCE FROM `materializedIdPath.ts`, which does DELIMITER-AWARE
   * membership in TypeScript. The SQL side here is deliberately UNANCHORED and the TypeScript side is
   * deliberately delimiter-aware; THEY ARE NOT UNIFIED, and neither is changed to match the other.
   * `materializedIdPath.ts` supplies computation only - path building and in-memory membership - while
   * persistence-side matching lives in the statement, so nothing is imported from it here.
   *
   * FETCH SHAPE: NO ASSOCIATION IS MATERIALIZED, and no entity is built. Eight flat columns become the
   * port's row projection. `roundingRuleID` is PROJECTED BUT THE RULE IS NOT JOINED and NOT APPLIED:
   * rounding happens downstream, in `getSalePriceDetailsForProductSkus`
   * [model/service/PromotionService.cfc:L1024-L1028]. The `SwRoundingRule` join that method 1 and
   * method 7 legitimately use DOES NOT APPLY HERE - adding one would widen a reduction whose grouping
   * and join-back are behaviour, and the identifier is all the service needs.
   *
   * @param productID Optional product identifier narrowing every branch. OMIT it for every product;
   *   passing `''` is a real, reachable state that matches nothing.
   * @returns The winning rows, UNROUNDED, with ties left unresolved.
   */
  async getSalePricePromotionRewardsQuery(
    productID?: string,
  ): Promise<SalePricePromotionRewardRow[]> {
    // CFML parity [model/dao/PromotionDAO.cfc:L306]: `var timeNow = now()`, captured once.
    const capturedInstant = new Date();

    // JUDGMENT CALL: KEY PRESENCE IS PRESERVED THROUGH THE CALL. The statement module tests
    // `'productID' in input`, mirroring the legacy `structKeyExists`, and under
    // `exactOptionalPropertyTypes` assigning `undefined` to an optional member does not compile - so
    // the two calls below are how "absent" and "present, possibly empty" stay distinguishable across
    // the boundary. Collapsing them into one call with a spread would work, but it would hide the
    // very distinction the six preserved guards depend on.
    const statement =
      productID === undefined
        ? buildSalePricePromotionRewardsStatement({ now: capturedInstant })
        : buildSalePricePromotionRewardsStatement({ now: capturedInstant, productID });

    const rows = await this.executor.execute(statement.sql, statement.params);

    return rows.map(toSalePricePromotionRewardRow);
  }

  /**
   * Load one rounding rule by its identifier.
   *
   * Ports [model/dao/RoundingRuleDAO.cfc:L51-L67], hosted on this port by design - see the statement
   * constant for the projection-widening decision, and the port for why the count stays at thirteen.
   *
   * JUDGMENT CALL: `undefined` ON A MISS IS A PORT-MANDATED NORMALIZATION, and the legacy behaviour it
   * replaces is worth stating precisely. The legacy returns the QUERY OBJECT ITSELF
   * [model/dao/RoundingRuleDAO.cfc:L66], and for an unknown identifier that object is EMPTY rather
   * than null - so the caller's very next line, which reads a column off it
   * [model/service/RoundingRuleService.cfc:L73-L74], RAISES. The port types the method
   * `Promise<RoundingRule | undefined>` and states that explicit absence is the honest model. The
   * raise is therefore NOT reproduced; absence is returned instead, and it is never substituted with a
   * zero value, an empty object or a default rule. Recorded here so the normalization is auditable
   * rather than invisible.
   *
   * FETCH SHAPE: the whole persisted row, no associations. `priceGroupRates` is not read - see the
   * statement constant.
   *
   * @param roundingRuleID Identifier of the rule to load; required in the legacy signature
   *   [model/dao/RoundingRuleDAO.cfc:L52].
   * @returns The rule, or `undefined` when there is none.
   */
  async getRoundingRuleQuery(roundingRuleID: string): Promise<RoundingRule | undefined> {
    const rows = await this.executor.execute(ROUNDING_RULE_BY_ID_STATEMENT, [roundingRuleID]);

    // `noUncheckedIndexedAccess` makes this `SqlRow | undefined`, and it is narrowed explicitly. A
    // non-null assertion is never used anywhere in this file. An empty result is the documented miss,
    // not a fault.
    const row = rows[0];

    if (row === undefined) {
      return undefined;
    }

    return toRoundingRule(row, '', ROUNDING_RULE_STATEMENT_LABEL, this.valueRounder);
  }

  /**
   * Turn method 1's rows into rewards, materializing exactly the associations the fetch-shape
   * decision names.
   *
   * INSTANCE SHARING: the three maps below are INVOCATION-SCOPED locals, created here and discarded
   * when the call returns. Two rewards on one period get ONE `PromotionPeriod` object, mirroring the
   * identity Hibernate's session gave the legacy. Nothing is memoized beyond the call - module state
   * on a warm Lambda container would outlive the request.
   *
   * @param rows the reward rows, in the order the database produced them - which is deliberately not
   *   an order this file imposes.
   * @param now the invocation's single captured instant, as the provider the period entity requires.
   * @returns the hydrated rewards, in row order.
   */
  private async hydrateActiveRewards(
    rows: readonly SqlRow[],
    now: () => Date,
  ): Promise<PromotionReward[]> {
    const label = ACTIVE_REWARDS_STATEMENT_LABEL;

    // Both key sets are collected in ONE pass and deduped, so the two follow-up reads bind each owner
    // once. Reward identifiers are distinct already - every join in the statement is many-to-one, so a
    // reward cannot be duplicated - and they are deduped anyway rather than assumed, because the cost
    // of the assumption being wrong is a mis-keyed collection.
    const rewardIDs = dedupeIdentifiers(
      rows.map((row): string => readIdentifier(row, 'spr_promotionRewardID', label)),
    );
    const periodIDs = dedupeIdentifiers(
      rows.map((row): string => readIdentifier(row, 'spp_promotionPeriodID', label)),
    );

    // Read sequentially rather than concurrently. The statements are independent, so either would
    // work; sequential emission makes the order a suite observes a deterministic function of the
    // input, which is what lets `tests/integration/repositories` assert the emitted text and the bound
    // arrays in a fixed order against a capturing fake. No claim of any other kind is intended.
    const rewardLinks = await this.readLinkGrouping(
      rewardIDs,
      REWARD_LINK_DESCRIPTORS,
      REWARD_LINK_STATEMENT_LABEL,
    );
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
        // entity adopts the array by reference so its bidirectional helpers can mutate it, and two
        // periods sharing one array would let a write to either appear on both.
        promotionPeriod = toPromotionPeriod(
          row,
          promotion,
          qualifiersByPeriod.get(periodKey) ?? [],
          now,
        );
        promotionPeriods.set(periodKey, promotionPeriod);
      }

      // The rounding rule arrives through a `LEFT JOIN`, so its identifier column is NULL for every
      // reward that has no rule - which is the common case. Absence stays absence; no default rule is
      // substituted, and `readOptionalText` is what distinguishes a null cell from a missing column.
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
        toPromotionReward(row, promotionPeriod, roundingRule, {
          fulfillmentMethodIDs: linkMembersOf(rewardLinks.fulfillmentMethods, rewardID),
          shippingMethodIDs: linkMembersOf(rewardLinks.shippingMethods, rewardID),
          shippingAddressZoneIDs: linkMembersOf(rewardLinks.shippingAddressZones, rewardID),
        }),
      );
    }

    return rewards;
  }

  /**
   * Read the three opaque-identifier link tables for one set of owners.
   *
   * THREE statements, each keyed by EVERY owner identifier at once, so the count is fixed rather than
   * proportional to the owners. Shared by the reward owners and the qualifier owners, which differ
   * only in their descriptors and their label.
   *
   * An empty owner set issues NOTHING and returns empty groupings. That is not a special case bolted
   * on: `IN ()` is unparseable and `sqlPlaceholderList` refuses a count of zero, so the guard is where
   * the decision has to live. Fresh maps are constructed rather than a shared module-level constant
   * returned, so this file declares no module-scope mutable value of any kind.
   *
   * @param ownerIDs the distinct owner identifiers.
   * @param descriptors which three link tables to read.
   * @param statementLabel which family of statement it is, for fault messages.
   * @returns the three groupings, keyed by folded owner identifier.
   */
  private async readLinkGrouping(
    ownerIDs: readonly string[],
    descriptors: LinkDescriptorTriple,
    statementLabel: string,
  ): Promise<LinkGrouping> {
    if (ownerIDs.length < 1) {
      return {
        fulfillmentMethods: new Map<string, string[]>(),
        shippingMethods: new Map<string, string[]>(),
        shippingAddressZones: new Map<string, string[]>(),
      };
    }

    const placeholders = sqlPlaceholderList(ownerIDs.length);

    const fulfillmentRows = await this.executor.execute(
      buildLinkStatement(descriptors.fulfillmentMethods, placeholders),
      ownerIDs,
    );
    const shippingMethodRows = await this.executor.execute(
      buildLinkStatement(descriptors.shippingMethods, placeholders),
      ownerIDs,
    );
    const addressZoneRows = await this.executor.execute(
      buildLinkStatement(descriptors.shippingAddressZones, placeholders),
      ownerIDs,
    );

    return {
      fulfillmentMethods: groupLinkMembers(
        fulfillmentRows,
        descriptors.fulfillmentMethods,
        statementLabel,
      ),
      shippingMethods: groupLinkMembers(
        shippingMethodRows,
        descriptors.shippingMethods,
        statementLabel,
      ),
      shippingAddressZones: groupLinkMembers(
        addressZoneRows,
        descriptors.shippingAddressZones,
        statementLabel,
      ),
    };
  }

  /**
   * Read and assemble the qualifiers of a set of promotion periods.
   *
   * ONE statement for every period at once, plus the three qualifier link reads - four statements,
   * fixed. The legacy leaves this collection to Hibernate's lazy loader
   * [model/entity/PromotionPeriod.cfc:L63]; the target does not simulate lazy loading, so it is
   * materialized here where the decision is visible. The promotion engine walks it -
   * `getPromotionPeriodQualificationDetails` iterates the period's qualifiers
   * [model/service/PromotionService.cfc:L549-L627] - so a period without it would not qualify at all.
   *
   * @param periodIDs the distinct period identifiers.
   * @returns period identifier, folded, to its qualifiers in row order. A period with no qualifiers is
   *   simply absent from the map.
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
    const qualifierLinks = await this.readLinkGrouping(
      qualifierIDs,
      QUALIFIER_LINK_DESCRIPTORS,
      QUALIFIER_LINK_STATEMENT_LABEL,
    );

    for (const row of rows) {
      const qualifierID = readIdentifier(row, 'promotionQualifierID', label);
      const qualifier = toPromotionQualifier(row, {
        fulfillmentMethodIDs: linkMembersOf(qualifierLinks.fulfillmentMethods, qualifierID),
        shippingMethodIDs: linkMembersOf(qualifierLinks.shippingMethods, qualifierID),
        shippingAddressZoneIDs: linkMembersOf(qualifierLinks.shippingAddressZones, qualifierID),
      });

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
   * Shared by all four count methods, because all four differ only in the statement and in what they
   * bind - the extraction is identical.
   *
   * CFML parity [model/dao/PromotionDAO.cfc:L184,L251,L270,L295]: the legacy returns `results[1]`, the
   * first row's single column. The equivalent 0-based access is narrowed EXPLICITLY here rather than
   * asserted, and the empty case is a decided outcome rather than an accident: an aggregate
   * `COUNT(...)` with no `GROUP BY` always returns exactly one row, so an empty result set means the
   * statement is no longer an unconditional aggregate. That is REPORTED rather than smoothed to zero,
   * because a fabricated zero would tell the engine this promotion has never been used and let a
   * use-limited discount through [model/service/PromotionService.cfc:L567].
   *
   * @param statement the statement text and its bound values, from the statement module.
   * @param statementLabel which family of statement it is, for fault messages.
   * @returns the count.
   * @throws An error named `PromotionColumnError` when the result set is empty or the count column is
   *   missing or unreadable.
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
