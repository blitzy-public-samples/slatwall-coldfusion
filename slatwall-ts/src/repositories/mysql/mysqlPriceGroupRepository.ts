/**
 * MySQL adapter for the price-group side of the catalog slice.
 *
 * PROVENANCE. Ported from `model/dao/PriceGroupDAO.cfc` - a 104-line component holding EXACTLY ONE
 * function, `getAccountSubscriptionPriceGroups(accountID)` at [model/dao/PriceGroupDAO.cfc:L52-L100] -
 * plus the price-group and rate load-and-save surface that the five-level cascade at
 * [model/service/PriceGroupService.cfc:L140-L181] needs in order to run at all. Entity metadata comes
 * from [model/entity/PriceGroup.cfc], [model/entity/PriceGroupRate.cfc] and
 * [model/entity/RoundingRule.cfc]; the two persistence lifecycle hooks this file replaces are declared
 * at [model/entity/PriceGroup.cfc:L206] and [model/entity/PriceGroup.cfc:L211], and the path algorithm
 * they called lives on the NON-PORTED framework base at [org/Hibachi/HibachiEntity.cfc:L308]. Every one
 * of those paths is a citation. None is a modification target: `org/Hibachi/**` is a boundary to
 * extract from and never modify, and this migration modifies zero existing repository files.
 *
 * LICENSE. Attribution for the derived business logic is carried forward once, in
 * `slatwall-ts/NOTICE-GPL.md`. The GPL header from the legacy `.cfc` is deliberately NOT copied here.
 *
 * THE PORT IS AUTHORITATIVE. `src/domain/ports/priceGroupRepository.ts` declares the contract - six
 * methods, with their exact names, parameter shapes, optionality and return types. This class
 * implements those six and adds no seventh public member. Where a prose description and the port
 * disagreed, the port won; the two places that mattered are recorded as JUDGMENT CALLs below.
 *
 * WHAT THIS FILE OWNS THAT NOTHING ELSE IN THE FOLDER OWNS.
 *
 *   1. THE ONE DELIBERATE DATA-LAYER EXCEPTION. `getAccountSubscriptionPriceGroups` reaches READ-ONLY
 *      into six subscription-owned tables, because account price-group resolution is otherwise
 *      unreproducible. The ruling, its limits and its justification are stated at the method.
 *
 *   2. THE SECOND HALF OF THE MATERIALIZED-PATH PRECEDENT. `savePriceGroup` performs EXPLICIT
 *      `priceGroupIDPath` maintenance where the ORM previously fired `preInsert`/`preUpdate`.
 *      `src/repositories/mysql/mysqlProductTypeRepository.ts` owns the first half, for
 *      `productTypeIDPath`. The two implementations are deliberately the same pattern and are
 *      cross-referenced in both directions so they cannot drift apart.
 *
 * VERIFIED LOCATORS, AND TWO DRIFTS. Every locator below was re-verified against the source rather
 * than trusted from a citation, per the folder's standing caution.
 *
 *   VERIFIED EXACT
 *     [model/dao/PriceGroupDAO.cfc]                104 lines; exactly one function, L52-L100.
 *     [model/dao/PriceGroupDAO.cfc:L56]            the inline developer comment, carried verbatim below.
 *     [model/dao/PriceGroupDAO.cfc:L57]            the dialect branch, `eq "mySQL"`.
 *     [model/dao/PriceGroupDAO.cfc:L71]            `ORDER BY changeDateTime DESC LIMIT 1`.
 *     [model/dao/PriceGroupDAO.cfc:L92]            `<cfif getpg.recordCount>`.
 *     [model/dao/PriceGroupDAO.cfc:L98]            `<cfreturn [] />`.
 *     [model/entity/PriceGroup.cfc:L64]            `priceGroupRates` with `cascade="all-delete-orphan"`.
 *     [model/entity/PriceGroup.cfc:L83]            `getGlobalPriceGroupRate`.
 *     [model/entity/PriceGroup.cfc:L168]           the `subsciptionUsageBenefit` argument-name typo.
 *     [model/entity/PriceGroup.cfc:L195]           `getPriceGroupIDPath`.
 *     [model/entity/PriceGroup.cfc:L206, L211]     `preInsert` / `preUpdate`.
 *     [model/entity/PriceGroupRate.cfc:L53]        `globalFlag` defaulted to the STRING `"false"`.
 *     [model/entity/PriceGroupRate.cfc:L54]        `amount` big_decimal with NO default.
 *     [model/entity/PriceGroupRate.cfc:L95]        `getAppliesTo`.
 *     [model/entity/PriceGroupRate.cfc:L262]       `getAmountFormatted`.
 *
 *   DRIFT 1 - the `now()` count. The four `now()` calls are at L65 and L70 in the MySQL arm and at L81
 *   and L86 in the `<cfelse>` arm. They are TWO PER ARM, not four in one executed path, and only the
 *   MySQL arm is emitted. So the one captured timestamp this adapter takes is bound TWICE, not four
 *   times. The count is recorded accurately rather than repeated from the citation.
 *
 *   DRIFT 2 - the stage-2 HQL. The HQL STRING is assigned at L93; the `ormExecuteQuery` call that
 *   carries `listToArray(...)` and the numeric `activeFlag=1` is at L95. Both locators are used below
 *   for the half each one actually covers.
 *
 *   DRIFT 3 - `buildIDPathList`. Declared at [org/Hibachi/HibachiEntity.cfc:L308], not L307; the body
 *   runs L309-L324. Provenance only - the framework method is not ported.
 *
 * TABLE NAMES ARE ALREADY PHYSICAL, AND NOTHING HERE NEEDS CORRECTING. Three raw-SQL sites in this
 * slice name ORM entities where the physical table is required and must be corrected during porting -
 * [model/dao/ProductTypeDAO.cfc:L53-L54], [model/dao/SkuDAO.cfc:L131-L138] and
 * [model/dao/ProductDAO.cfc:L420-L427]. `PriceGroupDAO`'s `<cfquery>` body is NOT one of them: it
 * already names `SwSubsUsageBenefitAccount`, `SwSubsUsageBenefit`, `SwSubsUsageBenefitPriceGroup`,
 * `SwSubsUsage`, `SwSubscriptionStatus` and `SwType` correctly. This is stated explicitly so that no
 * later reader "corrects" something that was already right.
 *
 * FOUR SERVICE-TIER DEFECTS THIS FILE MUST NOT COMPENSATE FOR. All four live in
 * `model/service/PriceGroupService.cfc`, so they belong to `src/services/priceGroupService.ts`. This
 * adapter neither repairs them, nor pre-adjusts data to work around them, nor adds behaviour that
 * neutralises them. Each is named here so the boundary is legible, and each is re-cited at the point
 * where this file's only obligation to it is discharged.
 *
 *   CFML parity [model/service/PriceGroupService.cfc:L236]: `getPriceGroupDataJSON()` indexes with
 *   `local.i` while the loop variable is `i`. Purely a service concern; nothing here touches it.
 *
 *   CFML parity [model/service/PriceGroupService.cfc:L461-L470]: `deletePriceGroup` reads
 *   `getChildPriceGroups()` ONCE into a local and then loops `while(arrayLen(...) != 0)` without ever
 *   re-reading it. The collection it iterates is the one THIS repository returned, which is the one
 *   place the defect touches this file. The obligation is to return that collection faithfully - so
 *   `getPriceGroup` materializes the direct children, and this adapter adds NO bounded-iteration
 *   guard, NO re-read and NO live self-refreshing view. Any guard belongs in the service.
 *
 *   CFML parity [model/service/PriceGroupService.cfc:L174]: the parent recursion in
 *   `getRateForSkuBasedOnPriceGroup` calls the PRODUCT variant rather than the SKU variant, breaking
 *   the cascade's symmetry. Preserved in the service. The only obligation here is that the parent
 *   price group is materialized, so the asymmetric recursion can run at all.
 *
 *   CFML parity [model/service/PriceGroupService.cfc:L316-L340]: only the `percentageOff` branch
 *   applies the rounding rule (guard at L326, call at L327); `amountOff` and `amount` skip it, and the
 *   switch has no `default`. Preserved in the service. The only obligation here is that each rate's
 *   `roundingRule` is materialized, so the branch that does apply it can.
 *
 * ONE LEGACY IDENTIFIER TYPO, RECORDED AND NOT REACHED. [model/entity/PriceGroup.cfc:L168] - and again
 * at L169, L171 and L172 - carries the misspelled argument name `subsciptionUsageBenefit`, inside
 * `addSubscriptionUsageBenefit` and `removeSubscriptionUsageBenefit`. The finding is stated here rather
 * than left silent, and the outcome is that this adapter NEVER TOUCHES that member: `subscriptionUsageBenefits`
 * is the inverse side of the `SwSubsUsageBenefitPriceGroup` link table [model/entity/PriceGroup.cfc:L69],
 * the ported `PriceGroup` entity carries no such member at all, and this file neither hydrates nor writes
 * it. Were it ever reached, the typo would be preserved verbatim - it is a legacy argument name, and the
 * lint configuration deliberately enables no naming-convention rule so that preserved legacy identifiers
 * lint clean. The same table appears in the read-only reach-through, where it is read and never written.
 *
 * NET-NEW COVERAGE (B8). This adapter has NO legacy test antecedent: `meta/tests/unit/dao/` holds only
 * `AccountDAOTest` and `PaymentDAOTest`, and neither touches price groups. Every test written against
 * this file is net-new and must be labelled as such rather than presented as parity. Test obligations
 * are STATED in the per-method notes below; no test file is authored from here.
 */

import { randomUUID } from 'node:crypto';

import type { PriceGroupRepository } from '../../domain/ports/priceGroupRepository.js';
import { PriceGroup } from '../../domain/entities/priceGroup.js';
import type { PriceGroupRateAmountType } from '../../domain/entities/priceGroupRate.js';
import { PriceGroupRate } from '../../domain/entities/priceGroupRate.js';
import { RoundingRule } from '../../domain/entities/roundingRule.js';
// JUDGMENT CALL: `productType.js`, `product.js` and `sku.js` are imported even though the planned
// dependency list for this file named only the price-group trio. Three things force it, and all three
// are verifiable. First, this file's declared import allowance is `mysql2`, `src/lib/**`,
// `src/domain/**` and the sibling SQL module - and these three modules are `src/domain/**`. Second,
// the port - which is authoritative - requires `getPriceGroupRate` to return a rate whose
// `productTypes`, `products` and `skus` are POPULATED, because rate matching tests membership against
// them, and whose excluded collections are populated too. Third, leaving them empty would make
// `hasProductType`, `hasProduct` and `hasSku` answer false for every rate, collapsing the cascade
// straight to its global-rate level and changing which price a customer is charged - a change to a
// named must-preserve area. The instances are identity-only; §"IDENTITY-ONLY LINK HYDRATION" explains
// why that is sufficient and where it was verified.
import { ProductType } from '../../domain/entities/productType.js';
import { Product } from '../../domain/entities/product.js';
import { Sku } from '../../domain/entities/sku.js';
import { Money } from '../../domain/valueObjects/money.js';
import { buildIdPathList } from '../../domain/valueObjects/materializedIdPath.js';
import { listAppend } from '../../lib/cfml/list.js';
import type { CfBooleanInput } from '../../lib/cfml/truthiness.js';
import { isNullish } from '../../lib/cfml/truthiness.js';
import type { PreparedStatementExecutor, SqlParameter, SqlRow } from './connection.js';
import { sqlPlaceholderList } from './connection.js';
import type { DatabaseDialect } from './dialect.js';
import { ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS } from './sql/accountSubscriptionPriceGroups.sql.js';

// JUDGMENT CALL: the dialect used to BUILD statements is a module constant rather than a read of the
// configured dialect. `resolveConfiguredDialect()` reaches `src/lib/config.ts` and therefore the
// `DB_*` environment, and statement construction must not depend on the environment: the integration
// suites assert emitted SQL text and bound parameter arrays with no database and no configuration
// present. The value is `'MySQL'` because the target emits the MySQL arm only, while the row-limiting
// FRAGMENT itself stays dialect-parameterized - the sibling SQL module resolves it through
// `singleRowLimitFragments` in `./dialect.js`, so no dialect comparison is ever hand-rolled here.
// `src/repositories/mysql/mysqlProductTypeRepository.ts` makes the identical decision, for the
// identical reason; the two are deliberately consistent.
const STATEMENT_DIALECT: DatabaseDialect = 'MySQL';

/**
 * Raised when a row does not carry a column this adapter requires, or carries it with a type that
 * cannot be read safely.
 *
 * DELIBERATELY NOT EXPORTED, and deliberately silent about the offending VALUE: a price-group row can
 * carry a monetary amount, and an error message is the wrong place for one. The column name and the
 * observed JavaScript type are enough to diagnose a schema or driver-configuration mismatch, and
 * neither is sensitive. `name` is assigned explicitly because a bundled build can rename the class.
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
 * Raised when a write reaches the database but the outcome contradicts what the statement promised.
 *
 * DELIBERATELY NOT EXPORTED. Used for exactly two conditions, both of which are programming errors
 * rather than data conditions: a save routed down the wrong branch, and an insert that reported no
 * inserted row.
 */
class PriceGroupPersistenceError extends Error {
  public constructor(detail: string) {
    super(detail);
    this.name = 'PriceGroupPersistenceError';
  }
}

/**
 * The rounding collaborator a hydrated `RoundingRule` requires.
 *
 * JUDGMENT CALL: this interface is declared HERE, module-locally and unexported, and satisfied
 * STRUCTURALLY by whatever the composition root injects. `src/domain/entities/roundingRule.ts`
 * declares the same one-method shape for its own constructor parameter and deliberately does not
 * export it, so there is nothing to import; and importing the concrete rounding-rule service would
 * make a repository depend on `src/services/**`, which is outside this file's import allowance and
 * inverts the intended direction. Declaring the shape locally and taking it as a constructor
 * parameter keeps the dependency an interface, keeps the wiring in one place, and lets a test inject
 * a stub rounder without a service in sight.
 *
 * The rule entity needs it because `RoundingRule.roundValue(value)` delegates outward exactly as
 * [model/entity/RoundingRule.cfc] does through `getService("roundingRuleService")` - the service
 * locator that transformation rule T2 replaces with an injected collaborator.
 */
interface PriceGroupRoundingRuleValueRounder {
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money;
}

// --- Statement labels ----------------------------------------------------------------------------
//
// One label per statement. They appear in error messages and are the handle the integration suites use
// when they assert emitted SQL text, so they are declared as constants rather than written inline
// where a typo would go unnoticed.
const SELECT_PRICE_GROUP_BY_ID = 'selectPriceGroupByID';
const SELECT_CHILD_PRICE_GROUPS = 'selectChildPriceGroupsByParentID';
const SELECT_RATES_BY_PRICE_GROUP = 'selectPriceGroupRatesByPriceGroupID';
const SELECT_RATE_BY_ID = 'selectPriceGroupRateByID';
const SELECT_SUBSCRIPTION_PRICE_GROUP_IDS = 'selectSubscriptionPriceGroupIDs';
const SELECT_ACTIVE_PRICE_GROUPS_BY_ID = 'selectActivePriceGroupsByID';
const INSERT_PRICE_GROUP = 'insertPriceGroup';
const UPDATE_PRICE_GROUP = 'updatePriceGroup';
const INSERT_PRICE_GROUP_RATE = 'insertPriceGroupRate';
const UPDATE_PRICE_GROUP_RATE = 'updatePriceGroupRate';
// The delete statements carry no label, deliberately: a label exists to attribute a COLUMN READ to the
// statement that produced it, and a delete reads no column. Declaring labels nothing consumes would be
// dead state, which `noUnusedLocals` correctly refuses.

// --- Physical columns ----------------------------------------------------------------------------
//
// B5, schema continuity: the `Sw*` schema is unchanged - no migration, no rename, no new table, no
// column change. The arrays below are therefore a transcription of the persistent property metadata in
// the legacy entities, in declaration order, and they are the SINGLE source from which both the SQL
// text and the bound-parameter array are derived. Deriving both from one ordered list is what makes a
// column and its parameter impossible to get out of step.
//
// [model/entity/PriceGroup.cfc:L52-L56, L59, L73-L76] - ten columns. Note there is NO `remoteID` on
// this table, unlike `SwPriceGroupRate`; the asymmetry is the source's, not an omission here.
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

// The UPDATE set list. Three columns are excluded and each exclusion is deliberate: `priceGroupID` is
// the key and moves to the WHERE clause, and `createdDateTime`/`createdByAccountID` are write-once -
// [org/Hibachi/HibachiEntity.cfc:L651] stamps only the modified half on an update, so re-writing the
// created half would overwrite history the legacy left alone.
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

// [model/entity/RoundingRule.cfc] - eight columns, joined onto every rate read.
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
// the audit quartet - collide by name with the rate's own four, and an unaliased join would let one
// silently shadow the other depending on driver ordering. The prefix is mechanical, applied to all
// eight rather than only the colliding four, so a reader never has to remember which subset was
// special-cased. There is no legacy statement being edited here: Hibernate generated the rate read, so
// this statement is new and its shape is an explicit decision rather than a transcription.
const ROUNDING_RULE_ALIAS_PREFIX = 'roundingRule_';

// --- Rate link tables ----------------------------------------------------------------------------
//
// The six many-to-many link tables declared on [model/entity/PriceGroupRate.cfc:L71-L77]. The
// abbreviated physical name `SwPriceGrpRateExclProductType` at L75 is reproduced VERBATIM - the
// schema is unchanged, and "correcting" an abbreviation to the name a reader might expect would break
// B5 outright. Its five siblings are not abbreviated; the inconsistency is the source's.
interface RateLinkTable {
  readonly tableName: string;
  readonly memberColumn: string;
  readonly statementLabel: string;
}

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

// Enumerated rather than derived from `Object.keys`, so the list is typed without a cast and a reader
// can see all six names in one place.
const RATE_LINK_COLLECTION_NAMES: readonly RateLinkCollectionName[] = Object.freeze([
  'productTypes',
  'products',
  'skus',
  'excludedProductTypes',
  'excludedProducts',
  'excludedSkus',
]);

// --- Statements ----------------------------------------------------------------------------------
//
// E5: every value is a positional `?`. Nothing is interpolated except identifiers that this module
// itself owns - table names, column names and placeholder runs - none of which can carry caller input.
// The legacy's named HQL parameters (`:priceGroupIDs`, `:activeFlag` at
// [model/dao/PriceGroupDAO.cfc:L93]) become positional because `mysql2`'s prepared-statement protocol
// is positional; that translation is noted once, here, and not repeated at every statement.

const PRICE_GROUP_SELECT_LIST = PRICE_GROUP_COLUMNS.map((columnName) => `pg.${columnName}`).join(
  ', ',
);

// No `ORDER BY`, no `LIMIT`: the key is unique, and adding either would be a construct the legacy
// lacks. The same restraint applies to every statement in this file except the one row-limiting arm
// that the legacy itself carries at [model/dao/PriceGroupDAO.cfc:L57].
const SELECT_PRICE_GROUP_BY_ID_SQL = [
  `SELECT ${PRICE_GROUP_SELECT_LIST}`,
  'FROM SwPriceGroup pg',
  'WHERE pg.priceGroupID = ?',
].join('\n');

// CFML parity [model/service/PriceGroupService.cfc:L463]: this statement exists solely so that
// `getChildPriceGroups()` can answer with the direct children the service's detachment loop reads. No
// `ORDER BY` - the legacy read an unordered Hibernate collection, and imposing an order here would
// decide a sequence the source left undecided.
const SELECT_CHILD_PRICE_GROUPS_SQL = [
  `SELECT ${PRICE_GROUP_SELECT_LIST}`,
  'FROM SwPriceGroup pg',
  'WHERE pg.parentPriceGroupID = ?',
].join('\n');

const PRICE_GROUP_RATE_SELECT_LIST = [
  ...PRICE_GROUP_RATE_COLUMNS.map((columnName) => `pgr.${columnName}`),
  ...ROUNDING_RULE_COLUMNS.map(
    (columnName) => `rr.${columnName} AS ${ROUNDING_RULE_ALIAS_PREFIX}${columnName}`,
  ),
].join(', ');

// LEFT OUTER, not INNER, and the reason is in the source: the service guards the association with
// `if(!isNull(arguments.priceGroupRate.getRoundingRule()))` at
// [model/service/PriceGroupService.cfc:L326], which proves a rate is allowed to have no rounding rule.
// An INNER JOIN would drop exactly those rates, and a dropped rate changes which rate the cascade
// selects - and therefore the price. The join is how the rounding rule is materialized alongside its
// rate rather than through a second read; that is a fetch-shape decision (T3), stated as such.
const SELECT_RATES_BY_PRICE_GROUP_SQL = [
  `SELECT ${PRICE_GROUP_RATE_SELECT_LIST}`,
  'FROM SwPriceGroupRate pgr',
  'LEFT OUTER JOIN SwRoundingRule rr ON pgr.roundingRuleID = rr.roundingRuleID',
  'WHERE pgr.priceGroupID = ?',
].join('\n');

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
  `SET ${UPDATED_PRICE_GROUP_COLUMNS.map((columnName) => `${columnName} = ?`).join(', ')}`,
  'WHERE priceGroupID = ?',
].join('\n');

const INSERT_PRICE_GROUP_RATE_SQL = [
  `INSERT INTO SwPriceGroupRate (${PRICE_GROUP_RATE_COLUMNS.join(', ')})`,
  `VALUES (${sqlPlaceholderList(PRICE_GROUP_RATE_COLUMNS.length)})`,
].join('\n');

const UPDATE_PRICE_GROUP_RATE_SQL = [
  'UPDATE SwPriceGroupRate',
  `SET ${UPDATED_PRICE_GROUP_RATE_COLUMNS.map((columnName) => `${columnName} = ?`).join(', ')}`,
  'WHERE priceGroupRateID = ?',
].join('\n');

const DELETE_RATES_BY_PRICE_GROUP_SQL = 'DELETE FROM SwPriceGroupRate WHERE priceGroupID = ?';

const DELETE_PRICE_GROUP_ROW_SQL = 'DELETE FROM SwPriceGroup WHERE priceGroupID = ?';

/**
 * The link-row read for one collection across a set of rates.
 *
 * The rate identifier is included in the select list because one statement serves every rate on a
 * price group, and without it a returned row could not be attributed to the rate that owns it.
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
 * JUDGMENT CALL: scoped by a subquery on `SwPriceGroupRate` rather than by an `IN` list of the rate
 * identifiers the caller happened to have materialized. The legacy cascade was driven by the PERSISTED
 * collection, not by an in-memory one, so keying on what is stored reproduces it faithfully whatever
 * the caller's entity was loaded with - and it keeps the statement to a single bound parameter, so no
 * empty-`IN` case can arise on this path at all.
 */
function buildRateLinkDeleteSql(linkTable: RateLinkTable): string {
  return [
    `DELETE FROM ${linkTable.tableName}`,
    'WHERE priceGroupRateID IN (SELECT priceGroupRateID FROM SwPriceGroupRate WHERE priceGroupID = ?)',
  ].join('\n');
}

// --- Column readers ------------------------------------------------------------------------------
//
// CFML parity [model/dao/PriceGroupDAO.cfc:L59, L93]: CFML identifiers are CASE-INSENSITIVE, the ORM
// attribute is spelled both `ormtype` and `ormType` across this slice, and a query column is reachable
// under any casing. TypeScript object keys are case-SENSITIVE, so every column read below goes through
// one case-folding lookup rather than indexing the row directly. Nothing in this file assumes a
// column's casing.

/**
 * Case-folds a column name for comparison.
 *
 * `toLowerCase` and NOT `toLocaleLowerCase`: locale-aware folding maps `I` to a dotless `ı` under a
 * Turkish locale, which would make a column named `priceGroupID` unreachable on a host configured that
 * way. Column names are ASCII schema identifiers, so locale-invariant folding is the correct rule.
 */
function foldIdentifier(identifier: string): string {
  return identifier.toLowerCase();
}

/**
 * The outcome of a column lookup, with "absent" and "present but null" kept apart.
 *
 * They are different facts and the difference is load-bearing here: a NULL `amount` is a legitimate
 * value that maps to `undefined` [model/entity/PriceGroupRate.cfc:L54], whereas an ABSENT `amount`
 * column means the statement or the schema is wrong and must be reported rather than silently read as
 * an absent price. A single `unknown` return could not tell them apart.
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
 * Reads a non-null identifier column.
 *
 * Every primary and foreign key in this slice is `generator="uuid"` over a 32-character varchar
 * [model/entity/PriceGroup.cfc:L52], so a key always arrives as a string. A NULL key is a schema
 * violation rather than a data condition, which is why this reader refuses it instead of substituting
 * the empty string - the empty string is `unsavedvalue` and means "not yet persisted", a completely
 * different fact from "persisted with no key".
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
 *
 * The empty string is preserved as the empty string and NOT folded into `undefined`: CFML's `isNull()`
 * answers false for `''`, and `resolveIdPath` in the materialized-path value object depends on exactly
 * that distinction when it decides whether a stored `priceGroupIDPath` needs rebuilding.
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
 *
 * The driver hands back `Date` objects because `src/repositories/mysql/connection.ts` fixes the
 * connection time zone at UTC (`timezone: 'Z'`), so a `DATETIME` crosses the boundary in UTC in both
 * directions. This reader consumes that policy and neither re-interprets nor re-zones the value; the
 * legacy stored whatever the CFML server's local `now()` produced, and re-zoning here would shift
 * historic timestamps rather than read them.
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
 * JUDGMENT CALL: the single coercion funnel for every boolean in this slice is `cfBoolean()`, and it
 * runs in the ENTITY - `PriceGroup.getActiveFlag()` and `PriceGroupRate.getGlobalFlag()` both call it -
 * so this reader deliberately returns the raw `CfBooleanInput` instead of calling it here. Coercing in
 * the adapter would collapse the difference between "column is NULL" and "column is false" before the
 * entity ever sees it, and that difference matters: `activeFlag` on `SwPriceGroup`
 * [model/entity/PriceGroup.cfc:L54] declares NO default, so a NULL is genuinely reachable, while
 * `globalFlag` on `SwPriceGroupRate` [model/entity/PriceGroupRate.cfc:L53] declares its default as the
 * STRING `"false"` - a JavaScript-truthy string that only `cfBoolean()` reads correctly. Twelve
 * in-scope entities declare no boolean default at all and the literals that do appear are inconsistent
 * (`"0"`, `"1"`, `"false"`), which is precisely why the decision belongs in one place rather than at
 * each read. `src/repositories/mysql/mysqlProductTypeRepository.ts` makes the identical decision.
 *
 * FORBIDDEN FORMS, none of which appears anywhere in this file: `Boolean(x)`, `!!x`, `x === 1`.
 *
 * `Uint8Array` is handled because MySQL returns a `BIT(1)` column as a one-byte buffer. Its first byte
 * is forwarded as a number, which `cfBoolean()` then reads; an empty buffer carries no bit and is
 * reported as absent.
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
 * ⚠ SQL NULL MAPS TO `undefined`, NEVER TO `Money.zero`. [model/entity/PriceGroupRate.cfc:L54] declares
 * `amount` with NO default - one of only four no-default money columns in the slice, alongside
 * [model/entity/SkuCurrency.cfc:L53], [model/entity/PromotionApplied.cfc:L53] and
 * [model/entity/PromotionReward.cfc:L61] - so an absent amount is a reachable state. Substituting zero
 * for it would not produce a wrong number in a log; it would hand the pricing cascade a rate whose
 * amount is zero and sell products for free. `Money.zero` exists and its own documentation forbids this
 * exact use.
 *
 * E4: the value is read as a STRING and handed to `Money.fromDecimalString`. `decimalNumbers` is
 * deliberately left unset on the pool, so `DECIMAL` arrives as a string and full precision survives the
 * boundary. A numeric `DECIMAL` is therefore a driver-configuration fault and is REPORTED rather than
 * accepted: reading it would mean routing a monetary value through IEEE-754, which no path in this
 * target does. `Number()` appears nowhere in this file.
 *
 * A malformed string is not caught here either. `Money.fromDecimalString` documents that it throws
 * rather than parsing tolerantly, and letting its contract govern is better than inventing a second,
 * quieter rule for the same input in an adapter.
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
 * CFML parity [model/service/PriceGroupService.cfc:L316-L340]: the legacy `switch` has THREE cases and
 * no `default`, so a column holding anything else falls through and leaves the seeded passthrough price
 * in place. Mapping an unrecognised value to `undefined` reproduces that outcome exactly - the ported
 * switch falls through in the same way - which is why this reader does not throw on an unknown value.
 * Throwing would turn a fall-through into a failed request, which is a behaviour change.
 */
function readAmountType(
  row: SqlRow,
  columnName: string,
  statementLabel: string,
): PriceGroupRateAmountType | undefined {
  const value = readOptionalText(row, columnName, statementLabel);

  if (value === 'percentageOff' || value === 'amountOff' || value === 'amount') {
    return value;
  }

  return undefined;
}

/**
 * Narrows a value this adapter is about to bind.
 *
 * `SqlParameter` admits `null` but not `undefined`, which is the driver's boundary and not a stylistic
 * choice: `undefined` is how this file models an absent domain value, and it must be turned into the
 * SQL NULL it means before it reaches a statement. Every bound value in this file passes through here,
 * so the mapping happens in one place.
 */
function toBindableValue(value: string | number | boolean | Date | undefined): SqlParameter {
  return value === undefined ? null : value;
}

// --- Link membership ------------------------------------------------------------------------------

/** The six link collections of one rate, as identifier lists. */
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
 * IDENTITY-ONLY LINK HYDRATION.
 *
 * JUDGMENT CALL: the six link collections on a rate are materialized as instances carrying their
 * PRIMARY KEY and nothing else. What reads them was checked member by member before the decision was
 * taken, and the answer is narrow in every case: `hasProductType`, `hasProduct` and `hasSku` on
 * `src/domain/entities/priceGroupRate.ts` compare by primary key only, and `getAppliesTo()`
 * [model/entity/PriceGroupRate.cfc:L95] reads nothing but the `length` of the six collections. So a
 * key-bearing instance answers every question the cascade asks, and a fully hydrated product, SKU or
 * product type would answer them identically.
 *
 * The alternative of leaving the collections EMPTY was rejected outright rather than weighed: it would
 * make every membership probe answer false, drop the cascade straight to its global-rate level and
 * change the price a customer is charged - in a named must-preserve area. The alternative of hydrating
 * them fully was rejected because it would pull the product, SKU and product-type read paths - each
 * with its own associations - into a price-group read, for information nothing consults.
 *
 * The consequence a reader must know: these instances are NOT usable as products, SKUs or product
 * types. Every other member on them reads as the class's own default for an absent column. They exist
 * to answer "is this key in this collection", and that is the whole contract.
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

// --- Entity factories -----------------------------------------------------------------------------

/**
 * Builds the joined rounding rule for one rate row, or reports that the rate has none.
 *
 * The rule arrives through the LEFT OUTER JOIN on the rate read rather than through a second statement,
 * which is the same technique the promotion adapter uses for its own rounding-rule lookup. Every column
 * is read from its prefixed alias, and the join's outer-ness is what makes a rate with no rule return
 * `undefined` here rather than disappearing from the result set.
 *
 * CFML parity [model/entity/RoundingRule.cfc]: `roundingRuleExpression` is a plain `ormtype="string"`
 * with NO format constraint of any kind, so it is handed through EXACTLY as stored - not validated, not
 * normalised, not rejected when malformed. Its behaviour on odd expressions is a service concern with
 * its own characterization tests, including the fact that the default `"0.00"` expression is not a
 * no-op; deciding any of that at this boundary would move a documented service behaviour into the
 * repository and change what the service can be tested against.
 *
 * `roundingRuleDirection` is likewise passed through as free text. The entity's own constructor slot is
 * typed `string | undefined` rather than the three-value union, precisely so a stored value outside the
 * union survives the boundary instead of being coerced into one of the three.
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
      // The rule's own inverse collection of rates is NOT materialized. It is the inverse side of the
      // association this very read arrived through, so populating it would mean reading every other
      // rate that shares the rule in order to answer a question nothing in the price-group path asks.
      // The entity documents the one consequence: a delete guard for a rounding rule cannot be an
      // in-memory length check on this collection, and must be a query wherever such a guard is added.
      priceGroupRates: [],
    },
    valueRounder,
  );
}

/**
 * THE ONE row-to-entity factory for `PriceGroupRate`.
 *
 * Every rate in this adapter - whether reached through a price group, through the rate read, or through
 * the subscription reach-through - is constructed here. Construction, collaborator injection and
 * association materialization happen in exactly this one place, so a rate cannot acquire two different
 * shapes depending on which query produced it.
 *
 * FETCH SHAPE (T3). Materialized: `roundingRule` through the join, and all six link collections as
 * identity-only instances. Not materialized: `priceGroup`, which the caller supplies when it has one -
 * see the note at the call sites.
 *
 * LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L75-L77]: `excludedProductTypes`, `excludedProducts`
 * and `excludedSkus` are declared, persisted, reported by `getAppliesTo()` - and NEVER consulted by the
 * five-level cascade at [model/service/PriceGroupService.cfc:L140-L181]. They are read and populated
 * here for schema fidelity, because they are part of the persisted contract and `getAppliesTo()` counts
 * them, and they are NOT applied to any query in this file. Beginning to apply them would exclude
 * products from rates that currently match them and change prices.
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
    // Uncoerced; the entity's `getGlobalFlag()` applies `cfBoolean()`. [L53] defaults it to `"false"`.
    globalFlag: readFlag(row, 'globalFlag', statementLabel),
    // [L54] no default: a NULL amount stays absent. Never `Money.zero`.
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
 * THE ONE row-to-entity factory for `PriceGroup`.
 *
 * Pure: it takes the associations already materialized and assembles the entity. The queries that
 * produce those associations live on the class, because they need the injected executor; keeping the
 * assembly separate from the fetching is what lets all three read paths share one shape.
 *
 * Every constructor slot is supplied explicitly, including the ones whose value is `undefined`. The
 * entity declares them as required slots typed `T | undefined` rather than optional properties, so
 * "absent" has to be stated rather than omitted - which is the point: a column this adapter forgot
 * would be a compile error instead of a silent `undefined`.
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
    // The STORED path, passed through verbatim including the empty string. `getPriceGroupIDPath()`
    // rebuilds only when the value is genuinely absent [model/entity/PriceGroup.cfc:L196-L198], so
    // folding `''` into `undefined` here would trigger a rebuild the legacy did not perform.
    priceGroupIDPath: readOptionalText(row, 'priceGroupIDPath', statementLabel),
    // Uncoerced; the entity's `getActiveFlag()` applies `cfBoolean()`. [L54] declares NO default, so a
    // NULL is reachable and must reach the entity as absent rather than as `false`.
    activeFlag: readFlag(row, 'activeFlag', statementLabel),
    priceGroupName: readOptionalText(row, 'priceGroupName', statementLabel),
    priceGroupCode: readOptionalText(row, 'priceGroupCode', statementLabel),
    parentPriceGroup: associations.parentPriceGroup,
    childPriceGroups: associations.childPriceGroups,
    priceGroupRates: associations.priceGroupRates,
    // The inverse side of `SwPromoRewardEligiblePriceGrp` [model/entity/PriceGroup.cfc:L70]. Owned by
    // the promotion adapter, read by nothing in the price-group cascade, and deliberately empty here.
    promotionRewards: [],
    createdDateTime: readTimestamp(row, 'createdDateTime', statementLabel),
    createdByAccountID: readOptionalText(row, 'createdByAccountID', statementLabel),
    modifiedDateTime: readTimestamp(row, 'modifiedDateTime', statementLabel),
    modifiedByAccountID: readOptionalText(row, 'modifiedByAccountID', statementLabel),
    // `parentPriceGroupOptionCandidates` is deliberately omitted. It backs an admin dropdown
    // [model/entity/PriceGroup.cfc:L79, L94-L103] and `admin/**` is out of scope; the entity's accessor
    // is total over an absent candidate list, so omitting it is safe rather than merely convenient.
  });
}

// --- Write-side helpers ---------------------------------------------------------------------------

/** The values one statement binds, keyed by physical column name. */
type ColumnValues = Readonly<Record<string, string | number | boolean | Date | undefined>>;

/**
 * Projects a column-value map onto an ordered column list, producing the bound-parameter array.
 *
 * The ordered list is the same constant the SQL text was built from, so a column and its parameter
 * cannot drift out of step - the ordering exists in exactly one place. A column present in the SQL but
 * missing from the map is reported rather than bound as NULL: a silent NULL would overwrite a stored
 * value with nothing, which on `activeFlag` or `amount` is a data-loss event rather than a nuisance.
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
 * [model/entity/PriceGroup.cfc:L52, model/entity/PriceGroupRate.cfc:L52], and the CFML engine's `uuid`
 * generator produced an unhyphenated hex string of exactly that width. Stripping the hyphens from
 * `randomUUID()` reproduces the stored FORM as well as the uniqueness property, which matters because
 * the column length is declared and a hyphenated 36-character value would not fit it. The same routine
 * is used by `src/repositories/mysql/mysqlProductTypeRepository.ts`.
 */
function mintEntityIdentifier(): string {
  return randomUUID().replaceAll('-', '');
}

/**
 * Projects a previously persisted price group onto the raw property bag `preUpdate` declares.
 *
 * The legacy hook receives `struct oldData` - the ORM's pre-update property struct, not a hydrated
 * entity - and [model/entity/PriceGroup.cfc:L211-L214] NEVER READS IT: the body assigns the path and
 * forwards the whole argument collection to the non-ported base. The bag is therefore built for
 * signature fidelity and for whatever change-tracking a later step adds, and its contents are the ten
 * physical columns rather than an entity graph.
 *
 * Reading `getPriceGroupIDPath()` here may populate the prior instance's own memo when its stored path
 * was absent. That is the accessor's documented behaviour, and the instance is request-scoped, so the
 * write cannot outlive the call that made it.
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
 * Composes the materialized path for a price group that is being inserted for the first time.
 *
 * JUDGMENT CALL: this is the ONE route where the repository composes the path itself instead of calling
 * the entity's hook, and the reason is ordering rather than preference. `preInsert()`
 * [model/entity/PriceGroup.cfc:L206-L209] builds the path FROM the entity, so it can only produce a
 * correct path once the entity carries its identifier - and `unsavedvalue=""` [L52] means a
 * not-yet-inserted price group's identifier is the empty string, which would leave the path's terminal
 * segment blank. The legacy ORM assigned the generated uuid BEFORE firing the hook; minting the key
 * first and appending it to the ancestor segment reproduces that ordering exactly.
 *
 * The path ARITHMETIC is not reimplemented here: the ancestor segment comes from `buildIdPathList` in
 * `src/domain/valueObjects/materializedIdPath.ts`, which is the ported form of
 * [org/Hibachi/HibachiEntity.cfc:L308-L324], and the append is `listAppend` from the CFML list helpers.
 * `src/repositories/mysql/mysqlProductTypeRepository.ts` composes `productTypeIDPath` by the identical
 * route for the identical reason; the two must stay recognisably the same.
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

/** The mutable accumulator the link reads fill, before it is handed to the rate factory. */
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
 *
 * THE ONLY EXPORTED UNIT IN THIS MODULE (E7). No barrel, no `index.ts`, no second export.
 */
export class MySqlPriceGroupRepository implements PriceGroupRepository {
  /**
   * JUDGMENT CALL: both collaborators arrive as CONSTRUCTOR PARAMETERS, and the executor in particular
   * is never reached as a module singleton. `src/repositories/mysql/connection.ts` states this as a
   * mandatory design constraint rather than a convenience, and the reason is testability at the exact
   * boundary this class owns: the integration suites assert emitted SQL text and bound parameter arrays
   * with NO live database, which is only possible if the statement sink can be substituted. Reaching
   * `getPreparedStatementExecutor()` from inside a method would make that impossible and would also
   * make this class construct configuration it has no business reading.
   *
   * The rounder is the collaborator a hydrated `RoundingRule` requires; see
   * `PriceGroupRoundingRuleValueRounder` above for why its shape is declared locally. Injecting it here
   * is transformation rule T2 applied to [model/entity/RoundingRule.cfc]'s
   * `getService("roundingRuleService")` locator: the dependency becomes explicit, typed and wired once
   * in the composition root instead of resolved at runtime by name.
   *
   * NO MODULE-SCOPE MUTABLE STATE EXISTS IN THIS FILE, and no instance field is a cache. Every memo in
   * the target is request-scoped, and the pool inside `connection.ts` is the only sanctioned
   * module-scope state anywhere in the target - which is why a warm container cannot carry one
   * invocation's price-group state into another's.
   */
  public constructor(
    private readonly executor: PreparedStatementExecutor,
    private readonly valueRounder: PriceGroupRoundingRuleValueRounder,
  ) {}

  /**
   * ⭐⭐ THE ONE DELIBERATE DATA-LAYER EXCEPTION IN THIS MIGRATION.
   *
   * Ported from [model/dao/PriceGroupDAO.cfc:L52-L100], the single function in that component. Called
   * by `calculateSkuPriceBasedOnAccount` at [model/service/PriceGroupService.cfc:L277].
   *
   * JUDGMENT CALL: THE READ-ONLY SUBSCRIPTION REACH-THROUGH. The subscription, account, vendor and tax
   * modules are explicitly out of scope, and this method is the ONE sanctioned exception at the data
   * layer. The legacy statement joins `SwSubsUsageBenefitAccount`, `SwSubsUsageBenefit`,
   * `SwSubsUsageBenefitPriceGroup`, `SwSubsUsage`, `SwSubscriptionStatus` and `SwType` - every one of
   * them subscription-owned - through to price groups, and it is ported behind this repository port
   * because ACCOUNT PRICE-GROUP RESOLUTION IS OTHERWISE UNREPRODUCIBLE: without it,
   * `calculateSkuPriceBasedOnAccount` cannot see the price groups a subscription benefit grants, and
   * the price it computes is wrong. The reach-through is documented at the port as well as here, and
   * the following limits are binding:
   *
   *   - IT IS READ-ONLY, ABSOLUTELY. No `INSERT`, `UPDATE`, `DELETE` or DDL against any subscription
   *     table, ever. This file's only writes are to `SwPriceGroup`, `SwPriceGroupRate` and the six
   *     price-group-rate link tables, all of which are in-scope catalog tables.
   *   - NO SUBSCRIPTION BUSINESS LOGIC IS PORTED. There is no subscription entity, no subscription
   *     port, and no interpretation of `SwSubscriptionStatus` or `SwType` beyond reproducing the
   *     legacy filter as written.
   *   - THE REACH IS NOT WIDENED. Exactly the six tables the legacy statement touches, and no others.
   *   - NO SUBSCRIPTION DATA LEAKS OUT. The return type is `PriceGroup[]` and nothing else; the
   *     subscription tables are a means of RESOLUTION, never a data source the domain learns about.
   *     Stage one's projection is a single identifier column, mapped to strings and discarded once
   *     stage two has consumed it - which is also why that projection is not entity hydration and does
   *     not go through the price-group factory.
   *
   * FETCH SHAPE (T3). Each returned price group is materialized on exactly the same terms as
   * `getPriceGroup`: its rates with their joined rounding rules and identity-only link collections, its
   * parent chain hop by hop, and its direct children. One entity shape across all three read paths is
   * deliberate - a consumer cannot tell which query produced an entity, so it must not have to.
   *
   * NET-NEW COVERAGE (B8): no legacy test exercises this DAO. The obligations a suite must cover are an
   * account with candidates, an account with none - asserting `[]` AND that no stage-two statement was
   * emitted - and the exact bound-parameter arrays of both stages.
   */
  public async getAccountSubscriptionPriceGroups(accountID: string): Promise<PriceGroup[]> {
    // JUDGMENT CALL: ONE CAPTURED TIMESTAMP. The legacy calls `now()` twice per arm, at
    // [model/dao/PriceGroupDAO.cfc:L65] and [:L70] in the MySQL arm and at [:L81] and [:L86] in the
    // `<cfelse>` arm, and `now()` is CFML SERVER-LOCAL time. One instant is captured here, once per
    // invocation, and bound to both positions in the emitted arm, so the two comparisons cannot
    // straddle a tick and disagree - which two independent `now()` calls can. No SQL `NOW()` or
    // `CURRENT_TIMESTAMP` is emitted per clause, `new Date()` is called exactly once in this method, and
    // no clock abstraction is introduced: one captured value bound as a parameter is the whole
    // mechanism. The UTC decision is explicit and belongs to `connection.ts`, which fixes the connection
    // time zone at `'Z'`; this repository consumes that policy rather than restating it. The sibling
    // promotion adapter does the same thing, mirroring [model/dao/PromotionDAO.cfc:L306], where the
    // legacy itself captures once.
    const capturedNow = new Date();

    // The legacy developer comment at [model/dao/PriceGroupDAO.cfc:L56], carried forward VERBATIM -
    // not paraphrased, not summarised, not tidied - because it is the source's own explanation of why
    // this stage is a raw query rather than HQL, and that explanation is the reason the two-stage shape
    // exists at all:
    //
    // can't figure out top 1 hql so, doing query: Sumit
    //
    // It is carried in BOTH places on purpose: here, adjacent to the call that issues the statement,
    // and in `./sql/accountSubscriptionPriceGroups.sql.js` adjacent to the statement text itself. A
    // reader arriving at either one finds the source's own words rather than a pointer to them.
    //
    // The statement is built by `./sql/accountSubscriptionPriceGroups.sql.js` and is deliberately NOT
    // re-authored inline. That module resolves the row-limiting fragment for
    // [model/dao/PriceGroupDAO.cfc:L57] through `singleRowLimitFragments` in `./dialect.js`, and binds
    // the captured instant twice. Passing an already-resolved dialect is what keeps it free of any
    // configuration read.
    //
    // CFML parity [model/dao/PriceGroupDAO.cfc:L57]: the dialect branch selects `LIMIT 1` on the MySQL
    // arm and `TOP 1` elsewhere, and the emitted `ORDER BY changeDateTime DESC LIMIT 1` at [:L71] is
    // therefore LEGACY BEHAVIOUR BEING REPRODUCED, not a limit introduced here. The standing rule for
    // this folder - add no `LIMIT` the legacy lacks - is satisfied precisely because the legacy has this
    // one. The comparison itself is never hand-rolled: CFML's `eq` is case-insensitive and the source
    // spells the value `"mySQL"`, one of three distinct spellings across the slice, so the case-folding
    // and the MySQL-only guard both live in `./dialect.js`.
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

    // ⚠⚠ CFML parity [model/dao/PriceGroupDAO.cfc:L92, L98]: `<cfif getpg.recordCount>` guards stage two
    // and `<cfreturn [] />` is the fall-through. The guard is reproduced as an EARLY RETURN, before any
    // stage-two statement is issued. Mechanically it is also what stops an `IN ()` with zero
    // placeholders - a MySQL syntax error - from ever being built; the sibling SQL module states the
    // same precondition on its stage-two builder and rejects an empty set rather than emitting one.
    //
    // ⚠⚠ THIS IS THE OPPOSITE OF `src/repositories/mysql/mysqlOptionRepository.ts`, AND THE TWO MUST
    // NEVER BE HARMONISED. `OptionDAO` has NO emptiness guard, so that adapter must bind a single
    // empty-string element to reproduce the legacy's zero-rows / all-rows asymmetry, and an early
    // `return []` there would be WRONG. `PriceGroupDAO` DOES guard, so an early `return []` here is
    // exactly faithful. The difference is in the two source components, not in the two adapters.
    //
    // The legacy's own latent hole is reproduced rather than patched: `valueList(...)` plus
    // `listToArray(...)` at [model/dao/PriceGroupDAO.cfc:L95] drops blank elements, so a blank
    // identifier would have produced an empty HQL `IN` list in the legacy too. The guard keys on the ROW
    // COUNT, exactly as `recordCount` does, and no blank-filtering step is added on top of it. A blank
    // value is not reachable in practice: `SwSubsUsageBenefitPriceGroup.priceGroupID` is a foreign key
    // onto a 32-character uuid primary key.
    if (candidatePriceGroupIDs.length === 0) {
      return [];
    }

    // Stage two. CFML parity [model/dao/PriceGroupDAO.cfc:L93, L95]: the HQL string is assigned at L93
    // and the `ormExecuteQuery` call carrying `listToArray(...)` and the numeric `activeFlag=1` is at
    // L95. E5 - the builder emits ONE positional placeholder PER identifier and binds each element
    // separately; nothing is interpolated. It normalises the list through the ported `listToArray`
    // rather than a bare `split`, so CFML's list semantics are preserved at the boundary.
    //
    // The one documented exception to per-element binding elsewhere in this slice - at
    // [model/dao/ProductDAO.cfc:L66], where per-element binding would change WHICH ROWS MATCH - does
    // NOT apply here and must never be cross-applied to it. Here per-element binding PRESERVES
    // semantics, so it is mandatory.
    //
    // `activeFlag` is bound as a single numeric parameter, matching the legacy HQL's numeric `1`. The
    // slice binds this flag inconsistently - numeric `1` in HQL at [model/dao/PriceGroupDAO.cfc:L95] and
    // [model/dao/PromotionDAO.cfc:L118], but `cf_sql_bit` in raw SQL at [model/dao/PromotionDAO.cfc:L321]
    // - and the target reconciles to one bound shape. The matched row set is identical either way, which
    // is why reconciling is safe.
    const activePriceGroupStatement =
      ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildActivePriceGroupsByIDStatement({
        priceGroupIDs: candidatePriceGroupIDs,
      });

    const priceGroupRows = await this.executor.execute(
      activePriceGroupStatement.sql,
      activePriceGroupStatement.params,
    );

    const priceGroups: PriceGroup[] = [];

    for (const priceGroupRow of priceGroupRows) {
      priceGroups.push(
        await this.hydrateCascadeReadyPriceGroup(
          priceGroupRow,
          SELECT_ACTIVE_PRICE_GROUPS_BY_ID,
          new Set<string>(),
          true,
        ),
      );
    }

    return priceGroups;
  }

  /**
   * Loads one price group, materialized so the five-level cascade can run against it.
   *
   * FETCH SHAPE (T3), stated per association because the cascade at
   * [model/service/PriceGroupService.cfc:L140-L181] reaches every one of them:
   *
   *   - `priceGroupRates` - MATERIALIZED. Levels one through four walk this collection.
   *   - the GLOBAL rate - MATERIALIZED, and not as a separate read:
   *     `getGlobalPriceGroupRate()` [model/entity/PriceGroup.cfc:L83] is `priceGroupRates.find(...)`, so
   *     materializing the collection materializes the global rate by construction. Level four is
   *     therefore reachable without a fifth statement.
   *   - each rate's `roundingRule` - MATERIALIZED through the LEFT OUTER JOIN on the rate read. This is
   *     what lets the service's `percentageOff` branch apply it at
   *     [model/service/PriceGroupService.cfc:L327].
   *   - each rate's `appliesTo` determination and its six link collections - MATERIALIZED, identity-only.
   *   - `parentPriceGroup` - MATERIALIZED, hop by hop, each ancestor carrying its own rates and its own
   *     parent. Level five recurses into it, and does so asymmetrically
   *     [model/service/PriceGroupService.cfc:L174]; that asymmetry is preserved in the service, and the
   *     obligation discharged here is simply that the parent EXISTS so the recursion can run.
   *   - `childPriceGroups` - MATERIALIZED one level, direct children only.
   *
   * DEPTH DECISIONS, stated rather than left silent. The PARENT CHAIN is materialized to its ROOT: the
   * cascade's level-five recursion is itself unbounded, and the entity's path walk at
   * [model/entity/PriceGroup.cfc:L195] climbs to the root too, so truncating the chain at a fixed depth
   * would silently shorten a path and change which rate wins. The CHILD collection is materialized to
   * ONE LEVEL, because its only in-scope consumer is the detachment loop at
   * [model/service/PriceGroupService.cfc:L463-L467], which reads the direct children and detaches each
   * one; nothing walks a grandchild. Ancestors reached through `getParentPriceGroup()` carry NO children
   * - a deliberate asymmetry, because the detachment loop only ever runs against the entity the service
   * was handed, never against one of its ancestors.
   *
   * `undefined` ON A MISS, never a zero-value stand-in and never an empty placeholder entity. This is
   * the same null-semantics class that makes `Sku.getPriceByCurrencyCode()` returning `undefined`
   * load-bearing: a stand-in price group would carry no rates, and a caller would price against it
   * instead of failing.
   *
   * NET-NEW COVERAGE (B8): a suite must cover a hit, a miss asserting `undefined`, a group with no
   * rates asserting that no link statement was emitted, and a two-deep parent chain.
   */
  public async getPriceGroup(priceGroupID: string): Promise<PriceGroup | undefined> {
    const priceGroupRow = await this.readPriceGroupRow(priceGroupID);

    if (priceGroupRow === undefined) {
      return undefined;
    }

    return this.hydrateCascadeReadyPriceGroup(
      priceGroupRow,
      SELECT_PRICE_GROUP_BY_ID,
      new Set<string>(),
      true,
    );
  }

  /**
   * Loads one price-group rate.
   *
   * FETCH SHAPE (T3). Materialized: the `roundingRule` through the join - read by the service at
   * [model/service/PriceGroupService.cfc:L326-L327]; all three collections the rate APPLIES TO, because
   * rate matching tests membership against product types, products and SKUs; all three EXCLUDED
   * collections, because the entity retains them and `getAppliesTo()` [model/entity/PriceGroupRate.cfc:L95]
   * counts them, even though the cascade never consults them; and the OWNING price group, materialized
   * through `getPriceGroup` so that `getPriceGroup()` on the returned rate is not a null dereference
   * waiting to happen - [model/entity/PriceGroupRate.cfc:L275] dereferences it without a guard.
   *
   * ONE CONSEQUENCE A READER MUST KNOW: because the owning price group is itself materialized with its
   * rates, one stored rate row can yield TWO instances in one call - the one returned here and the one
   * inside `priceGroup.getPriceGroupRates()`. That is safe because every in-scope comparison is by
   * PRIMARY KEY, not by reference: the containment probes on `src/domain/entities/priceGroupRate.ts`
   * compare identifiers, and the sibling-rate reconciliation at
   * [model/service/PriceGroupService.cfc:L407-L444] compares `getPriceGroupRateID()`. The rates reached
   * through the price group carry NO back-link of their own, which is what stops this from recursing.
   *
   * `undefined` ON A MISS. NET-NEW COVERAGE (B8): a hit with a rounding rule, a hit without one
   * asserting `getRoundingRule()` is `undefined`, a NULL `amount` asserting `undefined` rather than
   * zero, and a miss.
   */
  public async getPriceGroupRate(priceGroupRateID: string): Promise<PriceGroupRate | undefined> {
    const rateRows = await this.executor.execute(SELECT_RATE_BY_ID_SQL, [priceGroupRateID]);
    const rateRow = rateRows.at(0);

    if (rateRow === undefined) {
      return undefined;
    }

    // Read back from the row rather than reusing the argument, so the membership lookup is keyed on the
    // identifier the database actually returned - the case-folding reader is the only thing that knows
    // what casing the driver used.
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
      membershipByRateID.get(storedPriceGroupRateID) ?? EMPTY_RATE_LINK_MEMBERSHIP,
      owningPriceGroup,
      this.valueRounder,
    );
  }

  /**
   * ⭐⭐ Persists a price group, WITH EXPLICIT `priceGroupIDPath` MAINTENANCE.
   *
   * CFML parity [model/entity/PriceGroup.cfc:L206, L211]: the legacy maintained the materialized path in
   * two ORM LIFECYCLE HOOKS - `preInsert` and `preUpdate` - which Hibernate fired for it. Transformation
   * rule T3 removes the ORM, so THERE ARE NO LIFECYCLE HOOKS: nothing fires them, and manufacturing a
   * session to fire them would re-import the framework this migration removes. Maintenance is therefore
   * performed HERE, explicitly, in the same save that writes the row - which is what keeps
   * `getPriceGroupIDPath()` [model/entity/PriceGroup.cfc:L195] answering with a path that matches the
   * stored hierarchy.
   *
   * ⭐ THE SECOND HALF OF A SHARED PRECEDENT. `mysqlProductTypeRepository.save` does exactly this for
   * `productTypeIDPath`, replacing [model/entity/ProductType.cfc:L306] and [:L311]. The two adapters are
   * deliberately the same pattern and cross-reference each other, so neither can drift. For the record,
   * the symmetry stops there: `Category.cfc`'s `categoryIDPath` has no repository in this folder, and
   * `Sku` and `Product` declare NO lifecycle hooks at all - verified - so no path maintenance exists in
   * those adapters and none should be looked for.
   *
   * ORDERING IS MANDATED BY THE ENTITY, not chosen here. `PriceGroup` assigns its path and calls `super`
   * AFTERWARDS [model/entity/PriceGroup.cfc:L207-L208], where `super` was the framework's
   * validate-and-stamp step [org/Hibachi/HibachiEntity.cfc:L598, L651]. So this method calls the
   * maintenance method FIRST and stamps AFTERWARDS. `Category` reverses that order, which is why the
   * entities preserve their orderings separately instead of normalising them.
   *
   * DESCENDANT PATHS ARE NOT REWRITTEN, and the decision is explicit rather than silent. Re-parenting a
   * price group does invalidate its descendants' stored paths, and the port's `priorState` parameter
   * exists precisely because finding those descendants would mean matching against the PRE-CHANGE path.
   * The legacy performed no such rewrite: Hibernate fired `preUpdate` only for the entity being flushed,
   * so a re-parent left descendant paths stale until each descendant was itself saved. Reproducing that
   * means writing no cascading rewrite. Adding one would be an unrequested behavioural change to a value
   * that decides which price-group rate wins - and it would change prices. The identical decision, with
   * the identical reasoning, is recorded in `mysqlProductTypeRepository`.
   *
   * NO SQL PATH MATCHING IS PERFORMED BY THIS FILE, so `materializedIdPathLikePatternFragment` from
   * `./dialect.js` is deliberately unimported and unused. Stating that is the point: had a descendant
   * rewrite been added, it would have had to match on the path in SQL, and the legacy idiom for that is
   * an UNANCHORED substring `LIKE` - `concat('%', <idColumn>, '%')`, with no comma anchoring and no
   * `FIND_IN_SET` (see [model/dao/PromotionDAO.cfc:L482-L488]). Any future path match in this file must
   * reproduce that unanchored form through the dialect fragment rather than substituting `FIND_IN_SET`.
   *
   * `createdByAccountID` and `modifiedByAccountID` are PASSED THROUGH from the entity and NOT stamped.
   * The legacy stamped them from the ambient request scope, which transformation rule T6 removes; there
   * is no ambient actor here to read, and inventing one would fabricate audit data.
   *
   * FETCH SHAPE (T3). NOTHING IS RE-READ FROM THE DATABASE BY THIS METHOD. The associations on the
   * returned price group are exactly the ones the caller supplied - `parentPriceGroup`,
   * `childPriceGroups`, `priceGroupRates` and `promotionRewards` are carried across BY REFERENCE, so a
   * caller holding one of those arrays still holds the same array afterwards. Only the columns this
   * method itself computes differ: the minted identifier and the maintained `priceGroupIDPath` on an
   * insert, and the audit stamps on both routes. That depth suffices because the caller reached this
   * method holding a graph it had already materialized, and re-reading it would either discard the
   * caller's in-flight edits or silently deepen the graph beyond what was handed in. The one association
   * that is READ here is the parent, and only its identifier, and only to compose the path - see
   * `composeInsertedPriceGroupIDPath`.
   *
   * NET-NEW COVERAGE (B8): a suite must cover an insert asserting the minted 32-character key and the
   * composed path, an update whose parent was reassigned asserting that maintenance ran and that the
   * prior state was consulted, and the absence of any descendant `UPDATE`.
   */
  public async savePriceGroup(
    priceGroup: PriceGroup,
    priorState?: PriceGroup,
  ): Promise<PriceGroup> {
    // ONE captured instant per save, written to every stamped column, exactly as
    // [org/Hibachi/HibachiEntity.cfc:L609] and [:L661] each take one `now()` per hook.
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
   * NO PATH MAINTENANCE, because `PriceGroupRate` declares no materialized path and no lifecycle hook -
   * verified against [model/entity/PriceGroupRate.cfc] rather than assumed from its sibling. The port
   * declares no prior-state parameter for this method for the same reason.
   *
   * THREE SERVICE-TIER BEHAVIOURS ARE DELIBERATELY NOT ABSORBED HERE. The sibling-rate reconciliation,
   * the global-flag exclusivity and the include/exclude clearing at
   * [model/service/PriceGroupService.cfc:L407-L444] all run around `super.save()` at
   * [model/service/PriceGroupService.cfc:L404] - in the SERVICE. Pulling any of them into this adapter
   * would move a documented service behaviour out of the file its characterization tests target.
   *
   * E4: `amount` is bound as a DECIMAL STRING, produced by `Money.toDecimalString()`. It is never bound
   * as a number, and an absent amount binds SQL NULL rather than zero - the same rule the read side
   * applies in reverse, and for the same reason.
   *
   * FETCH SHAPE (T3). The returned rate carries the associations the caller supplied, unchanged: this
   * method persists, and re-reading in order to return would issue statements the caller did not ask
   * for and could hand back a shape different from the one it passed in.
   *
   * NET-NEW COVERAGE (B8): an insert asserting the minted key, an update asserting the key binds LAST,
   * and an absent `amount` asserting a bound NULL.
   */
  public async savePriceGroupRate(priceGroupRate: PriceGroupRate): Promise<PriceGroupRate> {
    const auditTimestamp = new Date();

    if (priceGroupRate.isNew()) {
      return this.insertPriceGroupRate(priceGroupRate, auditTimestamp);
    }

    return this.updatePriceGroupRate(priceGroupRate, auditTimestamp);
  }

  /**
   * Deletes a price group and the rates it owns.
   *
   * CFML parity [model/entity/PriceGroup.cfc:L64]: `priceGroupRates` is the ONE association on this
   * entity declared `cascade="all-delete-orphan"`, so Hibernate removed the rate rows - and their link
   * rows - when the price group was deleted. With the ORM gone, that cascade must be performed
   * explicitly, and it is: the six rate link tables first, then `SwPriceGroupRate`, then `SwPriceGroup`,
   * in that order so no statement leaves a row pointing at a deleted parent. `PriceGroupRate` itself
   * declares NO cascade, which is why the walk stops at its link tables.
   *
   * NOTHING ELSE IS CASCADED, and the finding is stated explicitly rather than left to inference. The
   * remaining associations on [model/entity/PriceGroup.cfc:L62-L70] - `appliedOrderItems`,
   * `childPriceGroups`, `accounts`, `subscriptionBenefits`, `subscriptionUsageBenefits` and
   * `promotionRewards` - are all INVERSE sides, and Hibernate does not cascade an inverse side. So no
   * orphan cleanup, no referential repair and no cascading delete beyond the one the legacy actually
   * declared. In particular the two subscription link tables are NOT written to: the reach-through in
   * this file is read-only, absolutely, and a delete that touched them would violate that outright.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L461-L470]: the child DETACHMENT loop is a service
   * behaviour and stays there, including its non-termination hazard. This adapter returns the child
   * collection faithfully - see `getPriceGroup` - and adds NO bounded-iteration guard, NO re-read and NO
   * live self-refreshing view. The port makes the same commitment, deliberately declaring no guard,
   * bound, cursor or iteration-limit parameter.
   *
   * THE BOOLEAN. JUDGMENT CALL: `true` when the `SwPriceGroup` row was actually removed, `false` when no
   * row matched, matching the legacy `public boolean function` [model/service/PriceGroupService.cfc:L461]
   * whose `super.delete()` reported whether the deletion happened. Inspecting `affectedRows` is sound
   * for a DELETE, where MySQL reports rows REMOVED unambiguously - unlike an UPDATE, where it reports
   * rows CHANGED rather than rows MATCHED, which is why the update paths in this file inspect nothing.
   *
   * FETCH SHAPE (T3). NO ASSOCIATION IS MATERIALIZED, AND NONE IS READ. The return type is a boolean, so
   * nothing is hydrated; and the entity is consulted for exactly two things, `isNew()` and
   * `getPriceGroupID()`. In particular `getPriceGroupRates()` is NEVER read: every one of the eight
   * statements binds the price-group identifier alone, the six link deletes reaching their rows through a
   * subquery on `SwPriceGroupRate` rather than through an `IN` list of materialized rate identifiers -
   * see `buildRateLinkDeleteSql`. That is what makes this method correct for an entity loaded at ANY
   * depth, including one whose rate collection is empty because the caller never asked for it: the
   * cascade is driven by what is STORED, exactly as Hibernate's was, not by what happens to be in hand.
   *
   * NET-NEW COVERAGE (B8): a delete asserting all eight statements in order with one bound parameter
   * each, an unsaved entity asserting `false` with no statement emitted, and a grep-level assertion that
   * no subscription table appears in any emitted delete.
   */
  public async deletePriceGroup(priceGroup: PriceGroup): Promise<boolean> {
    if (priceGroup.isNew()) {
      // `unsavedvalue=""` [model/entity/PriceGroup.cfc:L52] means this entity has no row, so there is
      // nothing to delete and nothing to report as deleted. Issuing a statement keyed on the empty
      // string would match nothing while claiming to have tried.
      return false;
    }

    const priceGroupID = priceGroup.getPriceGroupID();

    for (const collectionName of RATE_LINK_COLLECTION_NAMES) {
      const linkTable = RATE_LINK_TABLES[collectionName];

      await this.executor.executeMutation(buildRateLinkDeleteSql(linkTable), [priceGroupID]);
    }

    await this.executor.executeMutation(DELETE_RATES_BY_PRICE_GROUP_SQL, [priceGroupID]);

    const priceGroupDeletion = await this.executor.executeMutation(DELETE_PRICE_GROUP_ROW_SQL, [
      priceGroupID,
    ]);

    return priceGroupDeletion.affectedRows > 0;
  }

  // --- Private: reads ----------------------------------------------------------------------------

  /** One price-group row by key, or `undefined` when the key matches nothing. */
  private async readPriceGroupRow(priceGroupID: string): Promise<SqlRow | undefined> {
    const rows = await this.executor.execute(SELECT_PRICE_GROUP_BY_ID_SQL, [priceGroupID]);

    return rows.at(0);
  }

  /**
   * Assembles a price group with everything the cascade walks.
   *
   * The visited set exists to TERMINATE THE READ, and its one visible effect is stated rather than
   * hidden: nothing in the schema prevents a cycle in `parentPriceGroupID`, and without the set this
   * walk would issue statements forever. With it, a cyclic chain is truncated at the first repeat, which
   * also means the entity's own path walk terminates instead of not terminating. The path algorithm
   * itself is untouched and still carries no cycle guard, matching
   * [org/Hibachi/HibachiEntity.cfc:L314-L321]; the choice made here is a read that RETURNS rather than a
   * read that never ends, and it is confined to this adapter.
   */
  private async hydrateCascadeReadyPriceGroup(
    row: SqlRow,
    statementLabel: string,
    visitedPriceGroupIDs: ReadonlySet<string>,
    includeDirectChildren: boolean,
  ): Promise<PriceGroup> {
    const priceGroupID = readIdentifier(row, 'priceGroupID', statementLabel);
    const visitedIncludingThis = new Set<string>(visitedPriceGroupIDs);
    visitedIncludingThis.add(priceGroupID);

    const parentPriceGroupID = readOptionalText(row, 'parentPriceGroupID', statementLabel);

    // An empty foreign key cannot resolve to a row, so it is treated as absent rather than looked up.
    // That is the same outcome the ORM reached when a many-to-one failed to resolve, without issuing a
    // statement that could not match.
    const parentPriceGroup =
      parentPriceGroupID === undefined ||
      parentPriceGroupID === '' ||
      visitedIncludingThis.has(parentPriceGroupID)
        ? undefined
        : await this.hydrateAncestorPriceGroup(parentPriceGroupID, visitedIncludingThis);

    const priceGroupRates = await this.loadRatesForPriceGroup(priceGroupID);

    const childPriceGroups = includeDirectChildren
      ? await this.loadDirectChildPriceGroups(priceGroupID)
      : [];

    return toPriceGroup(row, statementLabel, {
      parentPriceGroup,
      childPriceGroups,
      priceGroupRates,
    });
  }

  /**
   * One hop up the parent chain.
   *
   * Ancestors carry their own rates - level five of the cascade recurses into them and immediately walks
   * their rate collection - and their own parent, so the chain reaches the root. They carry NO children,
   * for the reason recorded on `getPriceGroup`.
   */
  private async hydrateAncestorPriceGroup(
    priceGroupID: string,
    visitedPriceGroupIDs: ReadonlySet<string>,
  ): Promise<PriceGroup | undefined> {
    const row = await this.readPriceGroupRow(priceGroupID);

    if (row === undefined) {
      return undefined;
    }

    return this.hydrateCascadeReadyPriceGroup(
      row,
      SELECT_PRICE_GROUP_BY_ID,
      visitedPriceGroupIDs,
      false,
    );
  }

  /**
   * The rate collection of one price group, each rate carrying its joined rounding rule and its six link
   * collections.
   *
   * The rates hydrated here carry NO `priceGroup` back-link. Populating it would require either
   * constructing the price group before its own rates exist or mutating a constructed entity afterwards,
   * and neither is warranted: the caller already holds the price group these rates belong to, the cascade
   * reads rates only through it, and the one unguarded dereference of the back-link is
   * [model/entity/PriceGroupRate.cfc:L275] in display code that `admin/**` owns and that is out of scope.
   * The rate-first read populates it, because there the caller has no price group in hand.
   *
   * WHEN A PRICE GROUP HAS NO RATES, NO LINK STATEMENT IS ISSUED. That is mechanical, not a behavioural
   * choice: an `IN ()` with zero placeholders is a MySQL syntax error, and `sqlPlaceholderList` refuses a
   * count below one for the same reason.
   */
  private async loadRatesForPriceGroup(priceGroupID: string): Promise<PriceGroupRate[]> {
    const rateRows = await this.executor.execute(SELECT_RATES_BY_PRICE_GROUP_SQL, [priceGroupID]);

    if (rateRows.length === 0) {
      return [];
    }

    const priceGroupRateIDs = rateRows.map((rateRow) =>
      readIdentifier(rateRow, 'priceGroupRateID', SELECT_RATES_BY_PRICE_GROUP),
    );

    const membershipByRateID = await this.loadRateLinkMembership(priceGroupRateIDs);

    return rateRows.map((rateRow) => {
      const storedPriceGroupRateID = readIdentifier(
        rateRow,
        'priceGroupRateID',
        SELECT_RATES_BY_PRICE_GROUP,
      );

      return toPriceGroupRate(
        rateRow,
        SELECT_RATES_BY_PRICE_GROUP,
        membershipByRateID.get(storedPriceGroupRateID) ?? EMPTY_RATE_LINK_MEMBERSHIP,
        undefined,
        this.valueRounder,
      );
    });
  }

  /**
   * Reads the six link collections for a set of rates, one statement per collection.
   *
   * Six statements rather than one union: each is trivially reviewable on its own, each maps to exactly
   * one declared association on [model/entity/PriceGroupRate.cfc:L71-L77], and the emitted text stays
   * assertable statement by statement. There is no legacy statement being reproduced here - Hibernate
   * generated these reads - so the shape is an explicit decision, recorded as one.
   *
   * E5: one positional placeholder per rate identifier, each bound separately. Nothing is interpolated
   * but the table and column identifiers this module owns.
   */
  private async loadRateLinkMembership(
    priceGroupRateIDs: readonly string[],
  ): Promise<ReadonlyMap<string, RateLinkMembership>> {
    const membershipByRateID = new Map<string, MutableRateLinkMembership>();

    for (const priceGroupRateID of priceGroupRateIDs) {
      membershipByRateID.set(priceGroupRateID, createMutableRateLinkMembership());
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

        const membership = membershipByRateID.get(owningRateID);

        // A link row whose owner is not in the requested set cannot arise from these statements, since
        // the `IN` list IS the requested set. The lookup is still narrowed explicitly rather than
        // asserted, because a non-null assertion is forbidden in `src/**` and this is precisely the kind
        // of place one would otherwise be written.
        if (membership !== undefined) {
          membership[collectionName].push(memberID);
        }
      }
    }

    return membershipByRateID;
  }

  /**
   * The direct children of one price group, as DETACHMENT HANDLES.
   *
   * JUDGMENT CALL: these instances carry their own columns and NOTHING ELSE - no rates, no children of
   * their own, and no parent back-link. What reads them was checked before the depth was chosen: the only
   * in-scope consumer is [model/service/PriceGroupService.cfc:L463-L467], which calls
   * `removeChildPriceGroup(child)`, which delegates to `child.removeParentPriceGroup(parent)`, which
   * needs exactly two things - the child's primary key, to find it in the parent's LIVE array, and the
   * parent passed explicitly as the argument. Neither the child's rates nor its own parent reference is
   * read. The parent back-link is additionally unnecessary because the visited set already contains the
   * parent, so the upward walk would short-circuit anyway.
   *
   * THE CONSEQUENCE, stated so nobody is misled: a child instance reports an EMPTY rate collection, which
   * is not a claim that it has no rates. Nothing in scope reads a child's rates - verified across the
   * cascade and the delete path - and hydrating them would pull a full rate read per child into a
   * price-group read for information no consumer asks for. A caller that needs a child's rates must load
   * that child through `getPriceGroup`, which is the read that promises them.
   */
  private async loadDirectChildPriceGroups(priceGroupID: string): Promise<PriceGroup[]> {
    const childRows = await this.executor.execute(SELECT_CHILD_PRICE_GROUPS_SQL, [priceGroupID]);

    return childRows.map((childRow) =>
      toPriceGroup(childRow, SELECT_CHILD_PRICE_GROUPS, {
        parentPriceGroup: undefined,
        childPriceGroups: [],
        priceGroupRates: [],
      }),
    );
  }

  // --- Private: writes ---------------------------------------------------------------------------

  private async insertPriceGroup(
    priceGroup: PriceGroup,
    auditTimestamp: Date,
  ): Promise<PriceGroup> {
    const mintedPriceGroupID = mintEntityIdentifier();
    const parentPriceGroup = priceGroup.getParentPriceGroup();

    // Maintenance FIRST, per the ordering the entity mandates. The path is composed rather than taken
    // from `preInsert()` because the entity cannot know the key that is being minted for it; see
    // `composeInsertedPriceGroupIDPath`.
    const priceGroupIDPath = composeInsertedPriceGroupIDPath(parentPriceGroup, mintedPriceGroupID);

    const columnValues: ColumnValues = {
      priceGroupID: mintedPriceGroupID,
      priceGroupIDPath,
      activeFlag: priceGroup.getActiveFlag(),
      priceGroupName: priceGroup.getPriceGroupName(),
      priceGroupCode: priceGroup.getPriceGroupCode(),
      parentPriceGroupID: parentPriceGroup?.getPriceGroupID(),
      createdDateTime: auditTimestamp,
      createdByAccountID: priceGroup.getCreatedByAccountID(),
      modifiedDateTime: auditTimestamp,
      modifiedByAccountID: priceGroup.getModifiedByAccountID(),
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

    // A NEW instance, because the identifier changed and the entity exposes no setter for it - which
    // mirrors `unsavedvalue=""` [model/entity/PriceGroup.cfc:L52] rather than working around it. The
    // legacy ORM mutated the in-session entity in place; without a session there is nothing to mutate,
    // and adding an identifier setter to widen the public surface would be the worse trade. The
    // associations are carried across by reference, so a caller holding the live child or rate array
    // still sees the same array.
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
      createdByAccountID: priceGroup.getCreatedByAccountID(),
      modifiedDateTime: auditTimestamp,
      modifiedByAccountID: priceGroup.getModifiedByAccountID(),
    });
  }

  private async updatePriceGroup(
    priceGroup: PriceGroup,
    priorState: PriceGroup | undefined,
    auditTimestamp: Date,
  ): Promise<PriceGroup> {
    // CFML parity [model/entity/PriceGroup.cfc:L211-L214]: the hook is invoked EXPLICITLY, and before the
    // stamping step, because the legacy body assigns the path and only then calls `super`. The prior
    // state is forwarded when the caller supplied it; the legacy body never reads `oldData` either, so
    // both routes are behaviourally identical and the parameter is carried for fidelity.
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
      modifiedByAccountID: priceGroup.getModifiedByAccountID(),
    };

    const boundValues = bindColumnValues(
      UPDATED_PRICE_GROUP_COLUMNS,
      columnValues,
      UPDATE_PRICE_GROUP,
    );

    // The key binds LAST, after the whole SET list, because that is the order the statement declares it.
    boundValues.push(priceGroup.getPriceGroupID());

    // NO ROW COUNT IS INSPECTED. MySQL reports rows CHANGED rather than rows MATCHED for an UPDATE, so a
    // save that stores exactly what was already stored reports zero - and treating that as a failure
    // would reject an idempotent save. A missing row is a caller error, not something this statement can
    // distinguish.
    await this.executor.executeMutation(UPDATE_PRICE_GROUP_SQL, boundValues);

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
      modifiedByAccountID: priceGroup.getModifiedByAccountID(),
    });
  }

  private async insertPriceGroupRate(
    priceGroupRate: PriceGroupRate,
    auditTimestamp: Date,
  ): Promise<PriceGroupRate> {
    const mintedPriceGroupRateID = mintEntityIdentifier();

    const insertion = await this.executor.executeMutation(
      INSERT_PRICE_GROUP_RATE_SQL,
      bindColumnValues(
        PRICE_GROUP_RATE_COLUMNS,
        this.toPriceGroupRateColumnValues(priceGroupRate, mintedPriceGroupRateID, {
          createdDateTime: auditTimestamp,
          modifiedDateTime: auditTimestamp,
        }),
        INSERT_PRICE_GROUP_RATE,
      ),
    );

    if (insertion.affectedRows === 0) {
      throw new PriceGroupPersistenceError(
        'The price-group-rate insert reported no inserted row, so no generated key can be returned.',
      );
    }

    return this.rehydrateSavedPriceGroupRate(priceGroupRate, mintedPriceGroupRateID, {
      createdDateTime: auditTimestamp,
      modifiedDateTime: auditTimestamp,
    });
  }

  private async updatePriceGroupRate(
    priceGroupRate: PriceGroupRate,
    auditTimestamp: Date,
  ): Promise<PriceGroupRate> {
    const priceGroupRateID = priceGroupRate.getPriceGroupRateID();

    const boundValues = bindColumnValues(
      UPDATED_PRICE_GROUP_RATE_COLUMNS,
      this.toPriceGroupRateColumnValues(priceGroupRate, priceGroupRateID, {
        createdDateTime: priceGroupRate.getCreatedDateTime(),
        modifiedDateTime: auditTimestamp,
      }),
      UPDATE_PRICE_GROUP_RATE,
    );

    boundValues.push(priceGroupRateID);

    await this.executor.executeMutation(UPDATE_PRICE_GROUP_RATE_SQL, boundValues);

    return this.rehydrateSavedPriceGroupRate(priceGroupRate, priceGroupRateID, {
      createdDateTime: priceGroupRate.getCreatedDateTime(),
      modifiedDateTime: auditTimestamp,
    });
  }

  /**
   * The column values for a rate write, keyed by physical column so the ordered list can project them.
   *
   * E4: `amount` becomes a DECIMAL STRING through `Money.toDecimalString()`, never a number. An absent
   * amount stays absent and binds SQL NULL - [model/entity/PriceGroupRate.cfc:L54] declares no default,
   * and writing zero for an absent amount would store a price of nothing as though it had been chosen.
   *
   * The two foreign keys are read off their associations. A rate whose price group or rounding rule is
   * absent binds NULL, which is what the ORM wrote for an unset many-to-one; the rounding-rule
   * association is genuinely optional, as the service's own guard at
   * [model/service/PriceGroupService.cfc:L326] proves.
   */
  private toPriceGroupRateColumnValues(
    priceGroupRate: PriceGroupRate,
    priceGroupRateID: string,
    stamps: { readonly createdDateTime: Date | undefined; readonly modifiedDateTime: Date },
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
      createdByAccountID: priceGroupRate.getCreatedByAccountID(),
      modifiedDateTime: stamps.modifiedDateTime,
      modifiedByAccountID: priceGroupRate.getModifiedByAccountID(),
    };
  }

  /**
   * Rebuilds a saved rate so the returned instance reflects what was written.
   *
   * The three readonly excluded collections are copied into fresh arrays because the entity exposes them
   * as `readonly` and its constructor takes mutable ones. The copy is shallow and the members are the
   * same instances, so nothing about membership changes - only the array wrapper is new.
   */
  private rehydrateSavedPriceGroupRate(
    priceGroupRate: PriceGroupRate,
    priceGroupRateID: string,
    stamps: { readonly createdDateTime: Date | undefined; readonly modifiedDateTime: Date },
  ): PriceGroupRate {
    return new PriceGroupRate({
      priceGroupRateID,
      globalFlag: priceGroupRate.getGlobalFlag(),
      amount: priceGroupRate.getAmount(),
      amountType: priceGroupRate.getAmountType(),
      remoteID: priceGroupRate.getRemoteID(),
      createdDateTime: stamps.createdDateTime,
      createdByAccountID: priceGroupRate.getCreatedByAccountID(),
      modifiedDateTime: stamps.modifiedDateTime,
      modifiedByAccountID: priceGroupRate.getModifiedByAccountID(),
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
