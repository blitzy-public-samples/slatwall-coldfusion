/**
 * MySQL adapter for the price-group side of the catalog slice.
 *
 * Ported from [model/dao/PriceGroupDAO.cfc] - a 104-line component holding EXACTLY ONE function,
 * `getAccountSubscriptionPriceGroups(accountID)` at [model/dao/PriceGroupDAO.cfc:L52-L100] - plus
 * the price-group and rate load-and-save surface the five-level cascade at
 * [model/service/PriceGroupService.cfc:L140-L181] needs in order to run. Entity metadata comes from
 * [model/entity/PriceGroup.cfc], [model/entity/PriceGroupRate.cfc] and
 * [model/entity/RoundingRule.cfc]. `org/Hibachi/**` is a boundary to extract from and never modify;
 * it is cited only as provenance. `src/domain/ports/priceGroupRepository.ts` is authoritative: this
 * class implements its six methods and DECLARES NO SEVENTH PORT MEMBER.
 *
 * ★ QUOTE-THEN-REVISE ON THE PUBLIC SURFACE. That sentence used to end "and adds no seventh public
 * member." It now publishes exactly one member the port does not declare -
 * {@link MySqlPriceGroupRepository.getPriceGroupsByID}, a set-based form of the by-key read - and the
 * distinction the old wording collapsed is the one that matters. The PORT is still locked at six, so
 * nothing that depends on `PriceGroupRepository` can see the extra member and no service tier can
 * reach it; only `src/handlers/bootstrap.ts`, which constructs this class and therefore already holds
 * its concrete type, consumes it. That is the same shape the composition root already uses for
 * `MySqlSkuRepository`, which it deliberately holds un-narrowed because one instance fills two roles.
 * The alternative - a seventh port method - would have broken a count that file locks explicitly and
 * that has already shaped two of its own designs.
 *
 * LEGACY-NOTE [model/dao/PriceGroupDAO.cfc:L52-L100]: three cited facts carried drift and are
 * corrected throughout. The four `now()` calls are at L65 and L70 in the MySQL arm and at L81 and
 * L86 in the `<cfelse>` arm - TWO PER ARM, not four in one executed path - and only the MySQL arm
 * is emitted, so the one captured timestamp is bound TWICE. The stage-two HQL STRING is assigned at
 * L93 while the `ormExecuteQuery` call carrying `listToArray(...)` and the numeric `activeFlag=1`
 * is at L95. `buildIDPathList` is declared at [org/Hibachi/HibachiEntity.cfc:L308], not L307, with
 * its body at L309-L324.
 *
 * Locators reproduced here and cited nowhere else in this file; every other locator is cited at its
 * point of use:
 *   [model/dao/PriceGroupDAO.cfc:L71]        `ORDER BY changeDateTime DESC LIMIT 1`.
 *   [model/dao/PriceGroupDAO.cfc:L98]        `<cfreturn [] />`, the fall-through.
 *   [model/entity/PriceGroup.cfc:L168]       the `subsciptionUsageBenefit` argument-name typo.
 *   [model/entity/PriceGroupRate.cfc:L262]   `getAmountFormatted`.
 *
 * That typo is recorded rather than reached: the ported `PriceGroup` carries no such member, since
 * `subscriptionUsageBenefits` is the inverse side of `SwSubsUsageBenefitPriceGroup`
 * [model/entity/PriceGroup.cfc:L69]. Were it reached it would be preserved verbatim.
 *
 * TABLE NAMES ARE ALREADY PHYSICAL HERE. Three raw-SQL sites in this slice name ORM entities where
 * the physical table is required - [model/dao/ProductTypeDAO.cfc:L53-L54],
 * [model/dao/SkuDAO.cfc:L131-L138] and [model/dao/ProductDAO.cfc:L420-L427]. `PriceGroupDAO`'s body
 * is NOT one of them, so no later reader should "correct" what was already right.
 *
 * FOUR SERVICE-TIER DEFECTS THIS FILE MUST NOT COMPENSATE FOR, all belonging to
 * `src/services/priceGroupService.ts`. This adapter neither repairs them nor pre-adjusts data
 * around them.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L236]: `getPriceGroupDataJSON()` indexes with
 * `local.i` while the loop variable is `i`.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L461-L470]: `deletePriceGroup` reads
 * `getChildPriceGroups()` ONCE into a local and then loops `while(arrayLen(...) != 0)` without ever
 * re-reading it. The collection it iterates is the one THIS repository returned, so the obligation
 * is to return it faithfully - `getPriceGroup` materializes the direct children and this adapter
 * adds NO bounded-iteration guard, NO re-read and NO live self-refreshing view.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L174]: the parent recursion in
 * `getRateForSkuBasedOnPriceGroup` calls the PRODUCT variant rather than the SKU variant; the only
 * obligation here is that the parent price group is materialized.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L316-L340]: only the `percentageOff` branch
 * applies the rounding rule (guard at L326, call at L327), `amountOff` and `amount` skip it and the
 * switch has no `default`; the only obligation here is that each rate's `roundingRule` is
 * materialized.
 */

import { randomUUID } from 'node:crypto';

import type { PriceGroupRepository } from '../../domain/ports/priceGroupRepository.js';
import { PriceGroup } from '../../domain/entities/priceGroup.js';
import type { PriceGroupRateAmountType } from '../../domain/entities/priceGroupRate.js';
import { PriceGroupRate } from '../../domain/entities/priceGroupRate.js';
import { RoundingRule } from '../../domain/entities/roundingRule.js';
// JUDGMENT CALL: `productType.js`, `product.js` and `sku.js` are imported even though this file's
// subject is the price-group trio. The port requires `getPriceGroupRate` to return a rate whose
// `productTypes`, `products` and `skus` are POPULATED, because rate matching tests membership
// against them; leaving them empty would make `hasProductType`, `hasProduct` and `hasSku` answer
// false for every rate, collapse the cascade straight to its global-rate level and change which
// price a customer is charged - a change to a named must-preserve area. All three modules are
// `src/domain/**`, which is inside this file's import allowance. The instances are identity-only;
// see "IDENTITY-ONLY LINK HYDRATION" for why that suffices.
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
// therefore the `DB_*` environment, and the integration suites assert emitted SQL text with no
// database and no configuration present. The row-limiting FRAGMENT itself stays
// dialect-parameterized through `singleRowLimitFragments` in `./dialect.js`, so no dialect
// comparison is ever hand-rolled here. `mysqlProductTypeRepository.ts` decides the same way.
const STATEMENT_DIALECT: DatabaseDialect = 'MySQL';

/**
 * Raised when a row does not carry a column this adapter requires, or carries it with a type that
 * cannot be read safely. Deliberately unexported, and deliberately silent about the offending
 * VALUE: a price-group row can carry a monetary amount and an error message is the wrong place for
 * one. The column name and the observed JavaScript type are enough to diagnose a schema or driver
 * mismatch. `name` is assigned explicitly because a bundled build can rename the class.
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
 * Deliberately unexported, and used for exactly two programming errors rather than data conditions:
 * a save routed down the wrong branch, and an insert that reported no inserted row.
 */
class PriceGroupPersistenceError extends Error {
  // `options` is optional so every existing single-argument call site is untouched. It exists for
  // S-12: a shape rejection from `sqlTuplePlaceholderList` is re-wrapped so this adapter keeps
  // reporting write failures in ONE error type, while `cause` preserves the original for diagnosis
  // rather than discarding it.
  public constructor(detail: string, options?: { readonly cause?: unknown }) {
    super(detail, options);
    this.name = 'PriceGroupPersistenceError';
  }
}

/**
 * One price-group row gathered by the collection pass, with the two things the materialization pass
 * needs alongside it.
 *
 * `statementLabel` travels with the row because column-fault attribution names the statement that
 * produced the row, and a seed row and an ancestor row come from different statements. `parentPriceGroupID`
 * is read once during collection rather than twice, since both passes need it.
 */
interface CollectedPriceGroupRow {
  readonly row: SqlRow;
  readonly statementLabel: string;
  readonly parentPriceGroupID: string | undefined;
}

/**
 * Raised when the stored `parentPriceGroupID` pointers form a cycle, so a price group is its own
 * ancestor and there is no ancestry to return.
 *
 * DELIBERATELY NOT EXPORTED, for the same reason as the two above: a caller has nothing useful to do
 * with the distinction, and the message carries everything needed to repair the data.
 *
 * ★ WHY THIS IS AN ERROR RATHER THAN A TRUNCATION. See `hydrateCascadeReadyPriceGroup` for the full
 * argument; in one line, the cascade reaches its upper levels only by walking one hop further, so a
 * chain returned with the repeat dropped succeeds and yields a DIFFERENT RATE - a different price -
 * with nothing reported. The chain that was followed is named in the message so the offending rows can
 * be found directly.
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
 * JUDGMENT CALL: declared HERE, module-locally and unexported, and satisfied STRUCTURALLY by
 * whatever the composition root injects. `src/domain/entities/roundingRule.ts` declares the same
 * one-method shape and does not export it, so there is nothing to import, and importing the
 * concrete service would make a repository depend on `src/services/**`. The rule entity needs the
 * collaborator because `RoundingRule.roundValue()` delegates outward exactly as
 * [model/entity/RoundingRule.cfc] does through the `getService("roundingRuleService")` locator rule
 * T2 replaces.
 */
interface PriceGroupRoundingRuleValueRounder {
  roundValueByRoundingRule(value: Money, rule: RoundingRule): Money;
}

/**
 * The clock this adapter reads its one instant from, supplied by the composition root.
 *
 * ★ WHY THE CLOCK IS INJECTED RATHER THAN READ. `getAccountSubscriptionPriceGroups` compares
 * subscription-eligibility dates [model/dao/PriceGroupDAO.cfc:L65,L70] while the sibling promotion
 * adapter compares promotion-period and sale-price dates [model/dao/PromotionDAO.cfc:L117,L306]. In
 * the legacy all of those were `now()` inside ONE ColdFusion request, so an account's entitlement
 * window and the promotion window applied to the same order could not disagree about what "now"
 * meant. Reading the host clock independently per adapter reproduces the CALL and loses that
 * agreement, and the price a customer sees depends on it: an eligibility window that has just
 * closed against one instant and is still open against another selects a different price group.
 *
 * JUDGMENT CALL: declared module-locally and un-exported, exactly as
 * `PriceGroupRoundingRuleValueRounder` above is, and satisfied STRUCTURALLY by whatever the
 * composition root passes. The port set stays locked at thirteen - this is a constructor
 * collaborator, not a fourteenth port - and no clock abstraction enters the domain layer.
 *
 * IMPLEMENTATIONS MUST RETURN A VALUE THE CALLER CANNOT USE TO MUTATE THE SHARED EPOCH, `Date`
 * being mutable; the composition root returns a copy per call.
 */
interface PriceGroupRequestClock {
  now(): Date;
}

// --- Statement labels ----------------------------------------------------------------------------
// One label per statement. They appear in error messages and are the handle the integration suites
// use when they assert emitted SQL text, so they are constants rather than inline strings a typo
// could corrupt unnoticed.
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

// --- Physical columns ----------------------------------------------------------------------------
// B5, schema continuity: the `Sw*` schema is unchanged. The arrays below transcribe the persistent
// property metadata of the legacy entities, in declaration order, and are the SINGLE source from
// which both the SQL text and the bound-parameter array are derived.
//
// [model/entity/PriceGroup.cfc:L52-L56, L59, L73-L76] - ten columns. There is NO `remoteID` on this
// table, unlike `SwPriceGroupRate`; the asymmetry is the source's.
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

// The UPDATE set list. `priceGroupID` is the key and moves to the WHERE clause;
// `createdDateTime`/`createdByAccountID` are write-once, because
// [org/Hibachi/HibachiEntity.cfc:L651] stamps only the modified half on an update.
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
// silently shadow the other depending on driver ordering. The prefix is applied to all eight so a
// reader never has to remember which subset was special-cased. Hibernate generated the rate read,
// so this statement is new and its shape is an explicit decision rather than a transcription.
const ROUNDING_RULE_ALIAS_PREFIX = 'roundingRule_';

// --- Rate link tables ----------------------------------------------------------------------------
/**
 * The four audit values a rate write stamps, plus the fifth that says what the row will HOLD.
 *
 * SECURITY REVIEW DISPOSITION - RAISED AS S-07, ACCEPTED. Before this type existed, the two rate
 * helpers took only the two DATE stamps as a parameter and read both ACCOUNT columns off the
 * caller-supplied entity, so a caller that hand-built a `PriceGroupRate` chose the row's recorded
 * authorship. `HibachiEntity` never consulted the entity for either: `preInsert` took both from the
 * ambient request scope [org/Hibachi/HibachiEntity.cfc:L628-L630, L632-L635] and `preUpdate` took
 * only the modifying one [L676-L678]. Both accounts therefore now travel the same seam the dates
 * always did, resolved from the request-scoped {@link AuditActorContext}.
 *
 * The fifth member exists because BOUND and STORED can differ. `UPDATE_PRICE_GROUP_RATE_SQL` renders
 * the modifying account through {@link sqlUpdateAssignment}, so it binds the actor resolution and
 * lets `COALESCE` keep the stored account when the admin gate refuses - reproducing `preUpdate`
 * never reaching its setter, which left the loaded value in place for Hibernate to write back
 * unchanged. `modifiedByAccountID` is what the statement BINDS; `resolvedModifiedByAccountID` is
 * what the row ends up holding, and it is that second value the re-hydrated entity must report.
 * Using one value for both would re-admit the very defect S-07 names.
 *
 * The created pair has no such split: it is absent from {@link UPDATED_PRICE_GROUP_RATE_COLUMNS}, so
 * on an update it is carried only so the returned entity can restate what the row already holds.
 */
interface PriceGroupRateAuditStamps {
  readonly createdDateTime: Date | undefined;
  readonly createdByAccountID: string | undefined;
  readonly modifiedDateTime: Date;
  /** What the statement BINDS for the modifying account: the actor resolution, or `undefined`. */
  readonly modifiedByAccountID: string | undefined;
  /** What the ROW will hold for the modifying account once `COALESCE` has resolved the binding. */
  readonly resolvedModifiedByAccountID: string | undefined;
}

// The six many-to-many link tables declared on [model/entity/PriceGroupRate.cfc:L71-L77]. The
// abbreviated physical name `SwPriceGrpRateExclProductType` at L75 is reproduced VERBATIM - the
// schema is unchanged, and "correcting" it would break B5 outright. Its five siblings are not
// abbreviated; the inconsistency is the source's.
interface RateLinkTable {
  readonly tableName: string;
  readonly memberColumn: string;
  readonly statementLabel: string;
}

/**
 * Columns per link row: the owning rate key then the member key
 * [model/entity/PriceGroupRate.cfc:L71-L77]. All six tables share this shape - they carry no
 * surrogate key, no audit columns and no payload - which is what lets one builder serve all six.
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

// --- Statements ----------------------------------------------------------------------------------
// E5: every value is a positional `?`. Nothing is interpolated except identifiers this module
// itself owns - table names, column names and placeholder runs - none of which can carry caller
// input. The legacy's named HQL parameters (`:priceGroupIDs`, `:activeFlag` at
// [model/dao/PriceGroupDAO.cfc:L93]) become positional, which is what `mysql2` requires.

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
 * The same read as {@link SELECT_PRICE_GROUP_BY_ID_SQL}, for a SET of keys.
 *
 * ★★ THE PROJECTION AND THE PREDICATE ARE THE SINGULAR FORM'S, WIDENED IN EXACTLY ONE RESPECT. The
 * select list is the identical `PRICE_GROUP_SELECT_LIST`, the table is the identical `SwPriceGroup`,
 * and the filter is the identical primary-key equality - just stated over N keys instead of one.
 * Nothing else changes: NO `activeFlag` predicate (the singular form carries none, and adding one
 * here would drop an inactive price group a caller can still load today), no `ORDER BY` and no
 * `LIMIT`. The set-based form must be interchangeable with N singular calls or it is not a
 * refactoring of the fetch shape, it is a different query.
 *
 * ★ WHY ROW ORDER IS NOT SPECIFIED, AND WHY THAT IS SAFE. `IN (...)` does not order its results by
 * the order of the list, and no `ORDER BY` is added to make it. The caller does not read this
 * statement's row order at all: the adapter keys the results by identifier and the CALLER rebuilds
 * its own requested order from its own list. Ordering in SQL would be inventing an ordering the
 * legacy never expressed, for a consumer that does not read one - the same restraint
 * `buildSelectChildPriceGroupsSql` and `getActivePromotionRewards` exercise.
 *
 * E5: one positional `?` per identifier, each bound separately. `identifierCount` is a number this
 * module computes from an array length and never a caller-supplied string, so the interpolated run
 * of placeholders cannot carry caller input.
 *
 * @param identifierCount - how many keys the statement will bind. MUST be one or more: `IN ()` is a
 *   MySQL syntax error, which is why the only caller returns before reaching this builder when its
 *   key set is empty.
 */
function buildSelectPriceGroupsByIDSql(identifierCount: number): string {
  return [
    `SELECT ${PRICE_GROUP_SELECT_LIST}`,
    'FROM SwPriceGroup pg',
    `WHERE pg.priceGroupID IN (${new Array<string>(identifierCount).fill('?').join(', ')})`,
  ].join('\n');
}

/**
 * The direct children of a SET of parent price groups (F37).
 *
 * CFML parity [model/service/PriceGroupService.cfc:L463]: this statement exists solely so
 * `getChildPriceGroups()` can answer with the direct children the service's detachment loop reads.
 * No `ORDER BY` - the legacy read an unordered Hibernate collection.
 *
 * QUOTE-THEN-REVISE. A module constant `SELECT_CHILD_PRICE_GROUPS_SQL` stood here, ending
 * `WHERE pg.parentPriceGroupID = ?`, and its caller bound it once per seed. It is REPLACED rather
 * than kept alongside this builder, because after F37 nothing binds one parent: keeping two texts
 * for one read would leave a constant no code path emits and give the suite two shapes to pin. For a
 * single parent this builder emits `IN (?)`, which MySQL evaluates identically to `= ?` - the same
 * substitution `buildSelectPriceGroupsByIDSql` already makes for the by-key read.
 *
 * ★★ THE PROJECTION AND THE PREDICATE ARE THE SINGULAR FORM'S, WIDENED IN EXACTLY ONE RESPECT, on
 * the same terms as `buildSelectPriceGroupsByIDSql`: the identical `PRICE_GROUP_SELECT_LIST`, the
 * identical `SwPriceGroup`, and the identical `parentPriceGroupID` equality stated over N keys
 * instead of one. `parentPriceGroupID` is selected by that list, so every returned row carries the
 * key it must be partitioned by - which is what lets one statement answer for N parents.
 *
 * The set-based form must be interchangeable with N singular calls or it is not a refactoring of the
 * fetch shape, and here it is: `parentPriceGroupID IN (a, b)` returns exactly the union of
 * `= a` and `= b`, with no row belonging to both, because a row has one parent.
 *
 * E5: one positional `?` per key. `parentCount` is a number this module computes from an array
 * length, never a caller-supplied string.
 *
 * @param parentCount - how many parent keys the statement binds. `sqlPlaceholderList` refuses zero,
 *   so `IN ()` cannot be emitted; the caller returns early on an empty set.
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

// LEFT OUTER, not INNER, and the reason is in the source: the service guards the association with
// `if(!isNull(arguments.priceGroupRate.getRoundingRule()))` at
// [model/service/PriceGroupService.cfc:L326], which proves a rate is allowed to have no rounding rule.
// An INNER JOIN would drop exactly those rates, and a dropped rate changes which rate the cascade
// selects - and therefore the price. The join is how the rounding rule is materialized alongside its
// rate rather than through a second read; that is a fetch-shape decision (T3), stated as such.
// ★ KEYED BY A LIST, NOT BY ONE IDENTIFIER, and the reason is one-instance-per-row rather than
// anything about how many statements result. A price group's rate collection is decided entirely by
// `pgr.priceGroupID`, so asking for several groups' rates together returns exactly the union of what
// asking for each in turn would return, partitioned by that same column. What it additionally makes
// possible is materializing a SHARED ANCESTOR ONCE: two results that inherit from the same parent must
// see ONE parent instance carrying ONE rate collection, which is what Hibernate's session guaranteed
// and what the entity-identity comparisons in `src/domain/entities/priceGroup.ts` and
// `priceGroupRate.ts` rely on. Reading per group cannot deliver that, because each read hands back a
// fresh collection.
//
// No `ORDER BY`, matching the single-identifier form it replaces: the legacy read an unordered
// Hibernate collection, and imposing an order here would decide a sequence the source left undecided.
// The `IN` list is rendered by `sqlPlaceholderList`, which refuses a count of zero, so `IN ()` cannot
// be emitted; the caller short-circuits on an empty identifier set before reaching this builder.
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
 * `parentPriceGroup` association - the one mapped to `SwPriceGroup.parentPriceGroupID`
 * [model/entity/PriceGroup.cfc:L59]. Under the ORM those children were MANAGED, so nulling the
 * association marked each one dirty and Hibernate issued the UPDATE at request-end flush. With the ORM
 * gone there is no flush, and the in-memory detachment reached no column at all.
 *
 * SET-BASED, KEYED ON THE PARENT, AND THAT IS FORCED RATHER THAN CHOSEN. By the time this method runs
 * the service loop has already EMPTIED the entity's `childPriceGroups` array - that emptying is what
 * discharges the `childPriceGroups` delete gate - so the adapter has no list of children in hand to
 * iterate. Keying on `parentPriceGroupID` reaches exactly the rows the loop detached, which is also the
 * same "driven by what is STORED" rule the rest of this cascade follows: a caller who loaded the entity
 * without its children still gets every child detached, where an `IN` list of materialized identifiers
 * would silently orphan the ones the caller never asked for.
 *
 * `priceGroupIDPath = priceGroupID` IS A COLUMN-TO-COLUMN ASSIGNMENT, not a bound value, and it stands
 * for a lifecycle hook. [model/entity/PriceGroup.cfc:L211-L214] recomputes
 * `setPriceGroupIDPath( buildIDPathList( "parentPriceGroup" ) )` on every update, and
 * [org/Hibachi/HibachiEntity.cfc:L309-L324] walks the parent chain including self - so a group whose
 * parent has just become null resolves to its own identifier alone. Leaving the old path in place would
 * leave every detached child pointing THROUGH A DELETED PARENT, and `priceGroupIDPath` is read by the
 * cascade; a stale path there changes which rate a SKU resolves to.
 *
 * ONLY THE DIRECT CHILDREN ARE REPATHED, and that asymmetry is the legacy's. Hibernate fired
 * `preUpdate` for DIRTY entities only, and the loop dirtied nothing but the direct children, so a
 * grandchild kept a path still naming the deleted group. Recomputing the whole subtree here would be a
 * repair the source never performed.
 *
 * BOTH MODIFYING HALVES ARE STAMPED. [org/Hibachi/HibachiEntity.cfc:L662-L667] sets the timestamp from
 * one captured `now()` with no dependency on the ambient scope, and [L676-L678] sets the account when
 * that scope reports an initialized, non-new, admin account. The legacy detached children by loading and
 * saving each one, so Hibernate fired `preUpdate` per dirty child and stamped both; this statement
 * collapses that into one bulk UPDATE and must therefore stamp both itself.
 *
 * SECURITY REVIEW DISPOSITION - RAISED AS S-07, ACCEPTED. An earlier revision of this comment recorded
 * that the account half was left unstamped because "this method takes no context parameter, so the
 * account half has no reproducible input - and inventing one would write an attribution nothing
 * established". That reasoning was SOUND WHEN WRITTEN and has since EXPIRED: S-07 introduced a
 * request-scoped {@link AuditActorContext} on this adapter's constructor, so the account half now has
 * exactly the reproducible input it lacked, resolved through the same gate `preUpdate` applied. Leaving
 * it unstamped would now be the invention - a deliberate omission dressed as a limitation.
 *
 * The assignment renders through {@link sqlUpdateAssignment}, so a refusal by the admin gate binds NULL
 * and `COALESCE` keeps each child's STORED attribution rather than erasing it - the same reason every
 * other update path in this file uses it. `createdDateTime` and `createdByAccountID` remain untouched,
 * matching `UPDATED_PRICE_GROUP_COLUMNS` above and `preUpdate` having no created setter at all.
 */
const DETACH_CHILD_PRICE_GROUPS_SQL = [
  'UPDATE SwPriceGroup',
  'SET parentPriceGroupID = NULL, priceGroupIDPath = priceGroupID, modifiedDateTime = ?, ' +
    `${sqlUpdateAssignment('modifiedByAccountID')}`,
  'WHERE parentPriceGroupID = ?',
].join('\n');

/**
 * One delete gate that reaches a table this slice does not own.
 *
 * `propertyName` is the legacy association the gate is declared on, carried so the probe can be traced
 * back to the `model/validation/PriceGroup.json` rule it enforces rather than only to a table.
 */
interface PriceGroupDeleteGate {
  readonly propertyName: string;
  readonly tableName: string;
  readonly foreignKeyColumn: string;
}

/**
 * The five delete gates whose collections the ported entity does not carry.
 *
 * CFML parity [model/validation/PriceGroup.json]: the `delete` context sets `maxCollection: 0` on SIX
 * properties - `appliedOrderItems`, `childPriceGroups`, `accounts`, `subscriptionBenefits`,
 * `subscriptionUsageBenefits` and `promotionRewards`. [org/Hibachi/HibachiService.cfc:L55] runs that
 * validation BEFORE anything is removed and [org/Hibachi/HibachiService.cfc:L58, L79] turns a failure
 * into a bare `return false`, so a price group with any of those relationships was REFUSED rather than
 * partially deleted. Every one of the six is declared `inverse="true"`
 * [model/entity/PriceGroup.cfc:L62-L70], so Hibernate cascaded none of them - the gate was the whole
 * protection.
 *
 * FIVE HERE, NOT SIX. `childPriceGroups` is deliberately absent: it is enforced at the service tier by
 * the detachment loop, which empties the collection so the gate passes, and discharged HERE by
 * `DETACH_CHILD_PRICE_GROUPS_SQL`. Probing the stored rows for it would refuse EVERY delete the legacy
 * allowed, because at the moment this method is called those children are still parented in the table -
 * the loop nulled an association, not a column.
 *
 * ★★ A SECOND NARROW READ-ONLY REACH-THROUGH, DECLARED WITH THE SAME LIMITS AS THE FIRST. Two of these
 * five tables are subscription-owned and two more belong to the order and account aggregates, all of
 * which are out of scope. The ruling is the same one `getAccountSubscriptionPriceGroups` carries and it
 * is repeated rather than assumed: these tables are READ and NEVER WRITTEN; the read is a bare
 * existence probe keyed on a single bound price-group identifier; no out-of-scope column is selected, no
 * out-of-scope entity is hydrated, and NO out-of-scope business logic is ported. The alternative was to
 * leave five money-affecting relationships unguarded so that a price group could be deleted out from
 * under a live order item, an account, a subscription benefit or a promotion reward - which is data
 * corruption, not scope discipline.
 *
 * NO PORT MEMBER WAS ADDED FOR THIS. `src/domain/ports/priceGroupRepository.ts` forbids a seventh
 * method and forbids a count or existence probe as a CONTRACT, and that prohibition is honoured
 * literally: these probes are internal statements of the existing `deletePriceGroup`, whose published
 * signature and boolean return are unchanged. Nothing outside this file can ask for a count.
 *
 * ★★ ONE MIGRATION-PLAN SENTENCE BECOMES LITERALLY FALSE HERE, AND IT IS QUOTED RATHER THAN GLOSSED.
 * The plan's scope gate reads: "The single deliberate data-layer exception - the subscription
 * price-group query at [model/dao/PriceGroupDAO.cfc:L52-L100] - is the only place subscription tables
 * are touched, and it is read-only." Two of the five gate tables above are subscription-owned, so this
 * is now a SECOND place they are touched and that sentence no longer holds word for word. Recording it
 * plainly is the point; quietly leaving the reader to discover it would be worse than the divergence.
 *
 * WHAT THE SENTENCE PROTECTS IS FULLY INTACT, AND THAT IS WHY THE DIVERGENCE IS THE RIGHT CALL. Its
 * substance - stated in the same plan as "no subscription business logic is ported, and the
 * reach-through is documented at the port" - holds without qualification: these are bare existence
 * probes, READ-ONLY, projecting the literal `1` and no column of any subscription table, hydrating no
 * subscription entity, and reachable through no published contract. The plan grants its exception on
 * the grounds that account price-group resolution is "otherwise unreproducible"; price-group DELETION
 * is unreproducible for the identical reason, because the relationships that must gate it exist in no
 * other table. And the same plan requires the declarative validation under `model/validation/` to be
 * "ported as it is rather than completed" - `model/validation/PriceGroup.json`'s delete context IS
 * that validation, so porting the file while discarding six of its eight rules would be the larger
 * infidelity. The alternative on offer was a price group deletable out from under a live order item,
 * leaving `SwOrderItem.appliedPriceGroupID` pointing at a row that no longer exists.
 *
 * The order is the declaration order at [model/entity/PriceGroup.cfc:L62-L70], so a reviewer reading
 * the entity top to bottom meets the gates in the same sequence.
 */
const PRICE_GROUP_DELETE_GATES: readonly PriceGroupDeleteGate[] = Object.freeze([
  // [model/entity/PriceGroup.cfc:L62] one-to-many, fkcolumn `appliedPriceGroupID`; the far side is
  // [model/entity/OrderItem.cfc:L60], whose table is `SwOrderItem` [model/entity/OrderItem.cfc:L49].
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
  // [model/entity/PriceGroup.cfc:L69] many-to-many, linktable `SwSubsUsageBenefitPriceGroup` - the same
  // table stage one of the reach-through reads, and still never written.
  Object.freeze({
    propertyName: 'subscriptionUsageBenefits',
    tableName: 'SwSubsUsageBenefitPriceGroup',
    foreignKeyColumn: 'priceGroupID',
  }),
  // [model/entity/PriceGroup.cfc:L70] many-to-many, linktable `SwPromoRewardEligiblePriceGrp`. The
  // owning side spells the same table at [model/entity/PromotionReward.cfc:L74] with the two columns
  // swapped, which is how a link table's two ends always read; the abbreviated `PriceGrp` is the
  // schema's own spelling and is reproduced verbatim.
  Object.freeze({
    propertyName: 'promotionRewards',
    tableName: 'SwPromoRewardEligiblePriceGrp',
    foreignKeyColumn: 'priceGroupID',
  }),
]);

/**
 * The existence probe for one delete gate.
 *
 * JUDGMENT CALL: `SELECT 1 ... LIMIT 1`, and the `LIMIT` is not a breach of this file's standing
 * restraint against row-limiting clauses the legacy lacks. That restraint protects result sets a caller
 * CONSUMES, where a limit would truncate data and an order would decide a sequence the source left
 * undecided. Nothing here is consumed: the whole answer is whether any row exists, one row settles it,
 * and the legacy asked the same question by loading the ENTIRE collection to compare its length against
 * `maxCollection: 0`. So the probe does strictly less work than the source did while answering
 * identically, and no column of an out-of-scope table is read at all - `1` is a literal, not a
 * projection.
 *
 * NO `COUNT(*)` either, for the same reason in reverse: a count would read every matching row to
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
 * The link-row read for one collection across a set of rates. The rate identifier is in the select
 * list because one statement serves every rate on a price group, and without it a returned row
 * could not be attributed to the rate that owns it.
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
 * whichever rate identifiers the caller materialized. The legacy cascade was driven by the
 * PERSISTED collection, so keying on what is stored reproduces it faithfully whatever the caller
 * loaded - and it keeps the statement to a single bound parameter, so no empty-`IN` case can arise
 * on this path.
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
 * Distinct from `buildRateLinkDeleteSql` above, which is scoped by owning PRICE GROUP and serves the
 * delete cascade. Both are needed and neither generalises to the other: the cascade must clear every
 * rate the price group owns whether or not the caller materialized them, while a save must touch only
 * the rate it was handed and must leave its siblings' link rows exactly as they are. This one is the
 * first half of the delete-then-insert reconciliation a rate SAVE performs.
 */
function buildRateLinkDeleteByRateSql(linkTable: RateLinkTable): string {
  return [`DELETE FROM ${linkTable.tableName}`, 'WHERE priceGroupRateID = ?'].join('\n');
}

/**
 * The member keys a rate currently holds for one of its six link collections.
 *
 * A `switch` over the closed collection union rather than a lookup table of accessor callbacks: the
 * six accessors return six different element types, each with its own key method, and the compiler
 * checks the mapping exhaustively this way. There is deliberately no `default:` - adding a seventh
 * collection would make this a compile error, which is the correct place to find out.
 *
 * NO DE-DUPLICATION, AND THE ORDER IS THE ENTITY'S. None of the six associations declares
 * `type="array"` [model/entity/PriceGroupRate.cfc:L71-L77], so each is a Hibernate BAG: a bag permits
 * the same member twice and its link table is generated without a primary key. Collapsing duplicates
 * here, or sorting, would impose a constraint the source does not have and would make a round-trip
 * through this adapter change a collection the legacy would have preserved verbatim.
 *
 * NOTHING IS FILTERED OUT EITHER - in particular a member carrying `''` is returned rather than
 * dropped, so the caller can REFUSE it. Silently skipping a transient member would persist a
 * membership that is quietly smaller than the one the caller handed over; see
 * `MySqlPriceGroupRepository.reconcileRateLinks` for where the refusal happens and why it happens
 * before any statement is issued.
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
 * ONE STATEMENT PER COLLECTION RATHER THAN ONE PER MEMBER, so a rate covering twenty products emits
 * the same two statements for its `products` collection as a rate covering one. Hibernate's own
 * collection flush batched the same way; more importantly, a per-member statement count would make
 * the number of statements a save emits depend on data rather than on shape, which is precisely what
 * the fetch-shape documentation on the public method is there to pin down. The row count is the
 * caller's, so the placeholder pairs are rendered to match and every value is still bound - nothing
 * is interpolated but the table and column identifiers this module owns (E5).
 *
 * WHY DELETE-THEN-INSERT AND NOT A COMPUTED DIFF. Hibernate reconciled a many-to-many collection by
 * removing the rows that were no longer members and inserting the ones that had become members, and
 * the OBSERVABLE end state of that is exactly the end state of a delete followed by an insert of the
 * current members. A diff would be strictly more code for an identical result, and it would need the
 * stored membership read back first - a round trip this path does not otherwise need. The link tables
 * carry no surrogate key, no audit columns and no payload of their own
 * [model/entity/PriceGroupRate.cfc:L71-L77], so a rewritten row is indistinguishable from a retained
 * one. That is what makes the simpler formulation faithful rather than merely convenient.
 *
 * @param linkTable the collection's physical table and member column.
 * @param memberCount how many members are being written. Never zero - the caller short-circuits an
 *   empty collection, because `VALUES` with no rows is not parseable, and this refuses rather than
 *   emitting it.
 */
function buildRateLinkInsertSql(linkTable: RateLinkTable, memberCount: number): string {
  // S-12. The lower bound was already refused here; the UPPER bound was not, so the member count -
  // which originates in a caller-supplied collection - decided the size of one allocation.
  // `sqlTuplePlaceholderList` now owns both bounds and checks them BEFORE allocating, and the caller
  // chunks rather than being refused. Its own rejection is re-wrapped as a persistence error so this
  // adapter keeps reporting write failures in one error type; the cause is preserved for diagnosis.
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

// --- Column readers ------------------------------------------------------------------------------
// CFML parity [model/dao/PriceGroupDAO.cfc:L59, L93]: CFML identifiers are CASE-INSENSITIVE and a
// query column is reachable under any casing, while TypeScript object keys are case-SENSITIVE.
// Every column read below therefore goes through one case-folding lookup; nothing in this file
// assumes a column's casing.

/**
 * Case-folds a column name for comparison. `toLowerCase` and NOT `toLocaleLowerCase`: locale-aware
 * folding maps `I` to a dotless `ı` under a Turkish locale, which would make a column named
 * `priceGroupID` unreachable on a host configured that way.
 */
function foldIdentifier(identifier: string): string {
  return identifier.toLowerCase();
}

/**
 * The outcome of a column lookup, with "absent" and "present but null" kept apart. The difference
 * is load-bearing: a NULL `amount` is a legitimate value mapping to `undefined`
 * [model/entity/PriceGroupRate.cfc:L54], whereas an ABSENT `amount` column means the statement or
 * the schema is wrong and must be reported rather than read as an absent price.
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
 * 32-character varchar [model/entity/PriceGroup.cfc:L52], so a key always arrives as a string. A
 * NULL key is a schema violation, which is why this refuses it instead of substituting the empty
 * string - the empty string is `unsavedvalue` and means "not yet persisted", a different fact
 * entirely.
 */
function readIdentifier(row: SqlRow, columnName: string, statementLabel: string): string {
  const value = requireColumn(row, columnName, statementLabel);

  if (typeof value !== 'string') {
    throw new PriceGroupColumnError(columnName, describeColumnType(value), statementLabel);
  }

  return value;
}

/**
 * Reads a nullable text column, mapping SQL NULL to `undefined`. The empty string is preserved and
 * NOT folded into `undefined`: CFML's `isNull()` answers false for `''`, and `resolveIdPath` in the
 * materialized-path value object depends on that distinction when it decides whether a stored
 * `priceGroupIDPath` needs rebuilding.
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
 * Reads a nullable timestamp column. The driver hands back `Date` objects because
 * `src/repositories/mysql/connection.ts` fixes the connection time zone at UTC (`timezone: 'Z'`),
 * so a `DATETIME` crosses the boundary in UTC in both directions. This reader consumes that policy
 * and neither re-interprets nor re-zones the value; the legacy stored whatever the CFML server's
 * local `now()` produced, and re-zoning would shift historic timestamps rather than read them.
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
 * JUDGMENT CALL: the single coercion funnel for every boolean in this slice is `cfBoolean()` and it
 * runs in the ENTITY. Coercing here would collapse the difference between "column is NULL" and
 * "column is false" before the entity saw it, and that difference matters: `activeFlag`
 * [model/entity/PriceGroup.cfc:L54] declares NO default, so a NULL is genuinely reachable, while
 * `globalFlag` [model/entity/PriceGroupRate.cfc:L53] defaults to the STRING `"false"` - a
 * JavaScript-truthy string only `cfBoolean()` reads correctly. `Boolean(x)`, `!!x` and `x === 1`
 * appear nowhere in this file. A `BIT(1)` arrives as a one-byte buffer, whose first byte is
 * forwarded as a number; an empty buffer is absent.
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
 * SQL NULL MAPS TO `undefined`, NEVER TO `Money.zero`. [model/entity/PriceGroupRate.cfc:L54]
 * declares `amount` with NO default - one of only four no-default money columns in the slice,
 * alongside [model/entity/SkuCurrency.cfc:L53], [model/entity/PromotionApplied.cfc:L53] and
 * [model/entity/PromotionReward.cfc:L61] - so substituting zero would hand the cascade a rate whose
 * amount is zero and sell products for free.
 *
 * E4: the value is read as a STRING and handed to `Money.fromDecimalString`. `decimalNumbers` is
 * left unset on the pool so `DECIMAL` arrives as a string and full precision survives; a numeric
 * `DECIMAL` is a driver-configuration fault and is REPORTED rather than routed through IEEE-754.
 * `Number()` appears nowhere in this file, and a malformed string is left to
 * `Money.fromDecimalString`, which throws rather than parsing tolerantly.
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
 * CFML parity [model/service/PriceGroupService.cfc:L316-L340]: the legacy `switch` has THREE cases
 * and no `default`, so a column holding anything else falls through and leaves the seeded
 * passthrough price in place. Mapping an unrecognised value to `undefined` reproduces that outcome
 * exactly, which is why this reader does not throw - throwing would turn a fall-through into a
 * failed request.
 *
 * CFML parity [model/service/PriceGroupService.cfc:L316]: THE MATCH FOLDS CASE. A CFML `switch` on a
 * string is case-INSENSITIVE, so `'PercentageOff'` reaches `case "percentageOff"` in the legacy
 * engine. An earlier revision compared with `===` and mapped a case variant to `undefined`, which
 * sent it down the no-`default` fall-through and quietly returned the SKU's own price instead of the
 * discounted one - the wrong price, with nothing reported. `SwPriceGroupRate.amountType` is a plain
 * `ormType="string"` column with no check constraint, so a case variant is a state the database can
 * hold and this reader must tolerate.
 *
 * ★ THIS READER IS THE ONE PLACE IN THE SLICE WHERE FOLDING CASE COULD CORRUPT DATA, AND IT DOES NOT.
 *
 * Every other discriminator in the slice is read-only. This one is not: `savePriceGroupRate` routes a
 * non-new rate to `updatePriceGroupRate`, and `toPriceGroupRateColumnValues` binds
 * `priceGroupRate.getAmountType()` straight into that UPDATE. So if this reader answered the
 * CANONICAL vocabulary member instead of the persisted text, an ordinary hydrate-then-save round trip
 * - a caller loading a rate, changing its `amount`, and saving - would silently rewrite
 * `SwPriceGroupRate.amountType` from `'PercentageOff'` to `'percentageOff'`. That is a schema-content
 * repair performed as a side effect of a read, and B5/schema continuity forbids it.
 *
 * The value returned is therefore `value` itself, the exact bytes the column held, and the cast is
 * the price of preserving them. It is confined to this one expression and is sound in the sense the
 * three comparisons establish: the value has been PROVEN to equal a published member up to case.
 * Consumers fold case rather than relying on the spelling; see the module-local matchers in
 * `src/domain/entities/priceGroupRate.ts` and `src/services/priceGroupService.ts`.
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
 * Narrows a value this adapter is about to bind. `SqlParameter` admits `null` but not `undefined`,
 * which is the driver's boundary: `undefined` is how this file models an absent domain value and
 * must become the SQL NULL it means before it reaches a statement. Every bound value passes through
 * here.
 */
function toBindableValue(value: string | number | boolean | Date | undefined): SqlParameter {
  return value === undefined ? null : value;
}

// --- Link membership -----------------------------------------------------------------------------

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
 * PRIMARY KEY and nothing else, because what reads them needs nothing else: `hasProductType`,
 * `hasProduct` and `hasSku` on `src/domain/entities/priceGroupRate.ts` compare by primary key only,
 * and `getAppliesTo()` [model/entity/PriceGroupRate.cfc:L95] reads nothing but the `length` of the
 * six collections. Leaving them EMPTY would make every membership probe answer false, drop the
 * cascade to its global-rate level and change the price a customer is charged, in a named
 * must-preserve area. The consequence a reader must know: these instances are NOT usable as
 * products, SKUs or product types - every other member reads as the class's own default.
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

// --- Entity factories ----------------------------------------------------------------------------

/**
 * Builds the joined rounding rule for one rate row, or reports that the rate has none. The rule
 * arrives through the LEFT OUTER JOIN on the rate read rather than a second statement, every column
 * is read from its prefixed alias, and the join's outer-ness is what makes a rate with no rule
 * return `undefined` here rather than disappear from the result set.
 *
 * CFML parity [model/entity/RoundingRule.cfc]: `roundingRuleExpression` is a plain
 * `ormtype="string"` with NO format constraint, so it is handed through EXACTLY as stored - not
 * validated, not normalised, not rejected when malformed; its behaviour on odd expressions is a
 * service concern with its own characterization tests. `roundingRuleDirection` is likewise free
 * text, and the entity's constructor slot is typed `string | undefined` rather than the three-value
 * union precisely so a stored value outside the union survives the boundary.
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
      // The rule's own inverse collection of rates is NOT materialized: it is the inverse side of
      // the association this read arrived through, so populating it would mean reading every other
      // rate sharing the rule to answer a question nothing in the price-group path asks. One
      // consequence - a delete guard for a rounding rule cannot be an in-memory length check on
      // this collection.
      priceGroupRates: [],
    },
    valueRounder,
  );
}

/**
 * THE ONE row-to-entity factory for `PriceGroupRate`.
 *
 * Every rate in this adapter - through a price group, through the rate read, or through the
 * subscription reach-through - is constructed here, so a rate cannot acquire two shapes.
 *
 * FETCH SHAPE (T3). Materialized: `roundingRule` through the join, and all six link collections as
 * identity-only instances. Not materialized: `priceGroup`, supplied by the caller when it has one.
 *
 * LEGACY-DEFECT [model/entity/PriceGroupRate.cfc:L75-L77]: `excludedProductTypes`,
 * `excludedProducts` and `excludedSkus` are declared, persisted, reported by `getAppliesTo()` - and
 * NEVER consulted by the five-level cascade at [model/service/PriceGroupService.cfc:L140-L181].
 * They are read and populated here for schema fidelity, because they are part of the persisted
 * contract and `getAppliesTo()` counts them, and they are NOT applied to any query in this file.
 * Beginning to apply them would exclude products from rates that currently match them and change
 * prices.
 *
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
    // Uncoerced; the entity's `getGlobalFlag()` applies `cfBoolean()`. [L53] defaults it to
    // `"false"`.
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
 * Pure: it takes the associations already materialized and assembles the entity, which is what lets
 * all three read paths share one shape. Every constructor slot is supplied explicitly, including
 * the ones whose value is `undefined`, because the entity declares them as required slots typed
 *   `T | undefined` -
 * so a column this adapter forgot is a compile error rather than a silent `undefined`.
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
    // The STORED path, verbatim including the empty string. `getPriceGroupIDPath()` rebuilds only
    // when the value is genuinely absent [model/entity/PriceGroup.cfc:L196-L198], so folding `''`
    // into `undefined` here would trigger a rebuild the legacy did not perform.
    priceGroupIDPath: readOptionalText(row, 'priceGroupIDPath', statementLabel),
    // Uncoerced; `getActiveFlag()` applies `cfBoolean()`. [L54] declares NO default, so a NULL is
    // reachable and must reach the entity as absent rather than as `false`.
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
    // [model/entity/PriceGroup.cfc:L79, L94-L103], `admin/**` is out of scope, and the entity's
    // accessor is total over an absent candidate list.
  });
}

// --- Write-side helpers --------------------------------------------------------------------------

/** The values one statement binds, keyed by physical column name. */
type ColumnValues = Readonly<Record<string, string | number | boolean | Date | undefined>>;

/**
 * Projects a column-value map onto an ordered column list, producing the bound-parameter array. The
 * ordered list is the same constant the SQL text was built from, so the ordering exists in exactly
 * one place. A column present in the SQL but missing from the map is reported rather than bound as
 * NULL: a silent NULL would overwrite a stored value with nothing, which on `activeFlag` or
 * `amount` is data loss.
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
 * `uuid` generator produced an unhyphenated hex string of exactly that width - a hyphenated
 * 36-character value would not fit the declared column length.
 */
function mintEntityIdentifier(): string {
  return randomUUID().replaceAll('-', '');
}

/**
 * Projects a previously persisted price group onto the raw property bag `preUpdate` declares.
 *
 * The legacy hook receives `struct oldData` - the ORM's pre-update property struct, not a hydrated
 * entity - and [model/entity/PriceGroup.cfc:L211-L214] NEVER READS IT: the body assigns the path
 * and forwards the whole argument collection to the non-ported base. The bag is therefore built for
 * signature fidelity. Reading `getPriceGroupIDPath()` here may populate the prior instance's own
 * memo when its stored path was absent - documented accessor behaviour on a request-scoped
 * instance, so the write cannot outlive the call.
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
 * JUDGMENT CALL: this is the ONE route where the repository composes the path itself instead of
 * calling the entity's hook, and the reason is ordering. `preInsert()`
 * [model/entity/PriceGroup.cfc:L206-L209] builds the path FROM the entity, so it needs the
 * identifier - and `unsavedvalue=""` [L52] means a not-yet-inserted price group's identifier is the
 * empty string, which would leave the path's terminal segment blank. The legacy ORM assigned the
 * generated uuid BEFORE firing the hook, so minting the key first and appending it to the ancestor
 * segment reproduces that ordering exactly. The path ARITHMETIC is not reimplemented: the ancestor
 * segment comes from `buildIdPathList` in `src/domain/valueObjects/materializedIdPath.ts`, the
 * ported form of [org/Hibachi/HibachiEntity.cfc:L308-L324], and the append is `listAppend`.
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
 */
export class MySqlPriceGroupRepository implements PriceGroupRepository {
  /**
   * JUDGMENT CALL: both collaborators arrive as CONSTRUCTOR PARAMETERS, and the executor in
   * particular is never reached as a module singleton. `connection.ts` states this as a mandatory
   * design constraint, and the reason is testability at the exact boundary this class owns: the
   * integration suites assert emitted SQL text and bound parameter arrays with NO live database.
   * Injecting the rounder is rule T2 applied to [model/entity/RoundingRule.cfc]'s
   * `getService("roundingRuleService")` locator.
   *
   * MODULE-SCOPE MUTABLE STATE AND CACHING INSTANCE FIELDS ARE BOTH FORBIDDEN HERE. Every memo in
   * the target is request-scoped and the pool inside `connection.ts` is the only sanctioned
   * module-scope state anywhere, which is what stops a warm container from carrying one
   * invocation's price-group state - and therefore one customer's price - into another's.
   *
   * S-07: the audit actor is the SECOND parameter, immediately after the executor and uniformly so
   * across all five writing adapters. It replaces the two account columns being read off
   * caller-hydrated entities, which let a caller name whoever it liked as the author of a row.
   * `HibachiEntity` took both from the ambient request scope
   * [org/Hibachi/HibachiEntity.cfc:L628-L630, L632-L635, L676-L678] and never from a caller, so this
   * is transformation rule T6 applied to the last place that scope still had a job - and it is
   * DISTINCT from `CurrentAccountContext`, which this file also consumes: that one answers "whose
   * prices", carries one opaque identifier and explicitly refuses permission members, while the
   * audit gate needs the admin flag. Two questions, two types.
   *
   * THE CLOCK IS A REQUIRED PARAMETER, NOT AN OPTIONAL ONE. A default of `() => new Date()` would
   * let a future construction site silently opt back into a private clock, which is exactly the
   * divergence the parameter removes; requiring it means every composition states which epoch its
   * pricing reads share. See {@link PriceGroupRequestClock}. It sits LAST, after the audit actor,
   * so the ordering rule the four writing adapters share - executor, then audit actor, then the
   * collaborators this adapter alone needs - is not disturbed by adding one.
   */
  public constructor(
    private readonly executor: PreparedStatementExecutor,
    private readonly auditActor: AuditActorContext,
    private readonly valueRounder: PriceGroupRoundingRuleValueRounder,
    private readonly requestClock: PriceGroupRequestClock,
  ) {}

  /**
   * THE ONE DELIBERATE DATA-LAYER EXCEPTION IN THIS MIGRATION.
   *
   * Ported from [model/dao/PriceGroupDAO.cfc:L52-L100], the single function in that component.
   * Called by `calculateSkuPriceBasedOnAccount` at [model/service/PriceGroupService.cfc:L277].
   *
   * JUDGMENT CALL: THE READ-ONLY SUBSCRIPTION REACH-THROUGH. The subscription, account, vendor and
   * tax modules are out of scope, and this method is the one sanctioned exception at the data
   * layer: the legacy statement joins `SwSubsUsageBenefitAccount`, `SwSubsUsageBenefit`,
   * `SwSubsUsageBenefitPriceGroup`, `SwSubsUsage`, `SwSubscriptionStatus` and `SwType` - every one
   * subscription-owned - through to price groups, and without it `calculateSkuPriceBasedOnAccount`
   * cannot see the price groups a subscription benefit grants and the price it computes is wrong.
   * Four limits bind. It is READ-ONLY, ABSOLUTELY: no `INSERT`, `UPDATE`, `DELETE` or DDL against
   * any subscription table, ever, this file's only writes being to `SwPriceGroup`,
   * `SwPriceGroupRate` and the six rate link tables. NO SUBSCRIPTION BUSINESS LOGIC IS PORTED: no
   * subscription entity, no subscription port, no interpretation of `SwSubscriptionStatus` or
   * `SwType` beyond reproducing the legacy filter. THE REACH IS NOT WIDENED beyond those six
   * tables. And NO SUBSCRIPTION DATA LEAKS OUT: the return type is `PriceGroup[]` and nothing else.
   *
   * FETCH SHAPE (T3). Each returned price group is materialized on exactly the same terms as
   * `getPriceGroup` - one entity shape across all three read paths, so a consumer cannot tell which
   * query produced an entity and must not have to.
   */
  public async getAccountSubscriptionPriceGroups(accountID: string): Promise<PriceGroup[]> {
    // JUDGMENT CALL: ONE CAPTURED TIMESTAMP. The legacy calls `now()` twice per arm, at
    // [model/dao/PriceGroupDAO.cfc:L65] and [:L70] in the MySQL arm and at [:L81] and [:L86] in the
    // `<cfelse>` arm, and `now()` is CFML SERVER-LOCAL time. One instant is captured here, once per
    // invocation, and bound to both positions in the emitted arm, so the two comparisons cannot
    // straddle a tick and disagree - which two independent `now()` calls can. No SQL `NOW()` is
    // emitted per clause and no clock abstraction is introduced. The UTC decision belongs to
    // `connection.ts`, which fixes the connection time zone at `'Z'`. The sibling promotion adapter
    // does the same, mirroring [model/dao/PromotionDAO.cfc:L306], where the legacy itself captures
    // once.
    //
    // AND THE INSTANT COMES FROM THE INJECTED REQUEST CLOCK, WHICH EXTENDS THAT AGREEMENT FROM ONE
    // STATEMENT TO ONE REQUEST. Capturing here with `new Date()` would keep the two bound positions
    // consistent with each other while letting this eligibility window disagree with the promotion
    // and sale-price windows evaluated for the same order - a disagreement the legacy could not have,
    // because every `now()` in the request read one CFML request's clock.
    const capturedNow = this.requestClock.now();

    // The legacy developer comment at [model/dao/PriceGroupDAO.cfc:L56], carried forward VERBATIM
    // because it is the source's own explanation of why this stage is a raw query rather than HQL:
    //
    // can't figure out top 1 hql so, doing query: Sumit
    //
    // The statement is built by `./sql/accountSubscriptionPriceGroups.sql.js`, which resolves the
    // row-limiting fragment for [model/dao/PriceGroupDAO.cfc:L57] through `singleRowLimitFragments`
    // in `./dialect.js` and binds the captured instant twice.
    //
    // CFML parity [model/dao/PriceGroupDAO.cfc:L57]: the dialect branch selects `LIMIT 1` on the
    // MySQL arm and `TOP 1` elsewhere, so the emitted `ORDER BY changeDateTime DESC LIMIT 1` at
    // [:L71] is LEGACY BEHAVIOUR BEING REPRODUCED, not a limit introduced here. The comparison is
    // never hand-rolled: CFML's `eq` is case-insensitive and the source spells the value `"mySQL"`,
    // one of three spellings across the slice, so case folding and the MySQL-only guard both live
    // in `./dialect.js`.
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
    // placeholders, a MySQL syntax error, from ever being built.
    //
    // THIS IS THE OPPOSITE OF `src/repositories/mysql/mysqlOptionRepository.ts`, AND THE TWO MUST
    // NEVER BE HARMONISED. `OptionDAO` has NO emptiness guard, so that adapter must bind a single
    // empty-string element to reproduce the legacy's zero-rows / all-rows asymmetry and an early
    // `return []` there would be WRONG. The difference is in the two source components, not in the
    // two adapters.
    //
    // The legacy's own latent hole is reproduced rather than patched: `valueList(...)` plus
    // `listToArray(...)` at [model/dao/PriceGroupDAO.cfc:L95] drops blank elements, so the guard
    // keys on the ROW COUNT exactly as `recordCount` does and adds no blank-filtering step.
    if (candidatePriceGroupIDs.length === 0) {
      return [];
    }

    // Stage two. CFML parity [model/dao/PriceGroupDAO.cfc:L93, L95]: the HQL string is assigned at
    // L93 and the `ormExecuteQuery` call carrying `listToArray(...)` and the numeric `activeFlag=1`
    // is at L95. E5 - the builder emits ONE positional placeholder PER identifier and binds each
    // element separately, normalising the list through the ported `listToArray` rather than a bare
    // `split` so CFML's list semantics survive the boundary. The one documented exception to
    // per-element binding in this slice - [model/dao/ProductDAO.cfc:L66], where it would change
    // WHICH ROWS MATCH - does NOT apply here and must never be cross-applied to it. `activeFlag`
    // binds as one numeric parameter matching the legacy HQL's numeric `1`; the slice binds this
    // flag inconsistently (numeric `1` at [model/dao/PriceGroupDAO.cfc:L95] and
    // [model/dao/PromotionDAO.cfc:L118], `cf_sql_bit` at [model/dao/PromotionDAO.cfc:L321]) and the
    // target reconciles to one bound shape, safe because the matched row set is identical.
    const activePriceGroupStatement =
      ACCOUNT_SUBSCRIPTION_PRICE_GROUP_STATEMENTS.buildActivePriceGroupsByIDStatement({
        priceGroupIDs: candidatePriceGroupIDs,
      });

    const priceGroupRows = await this.executor.execute(
      activePriceGroupStatement.sql,
      activePriceGroupStatement.params,
    );

    // ★ ONE HYDRATION PASS OVER ALL RESULT ROWS, NOT ONE PASS PER ROW, AND THE REASON IS IDENTITY.
    // Subscription-owned price groups routinely inherit from a common parent - a price-group hierarchy is
    // what the `parentPriceGroupID` pointer exists for - and hydrating row by row hands back a SEPARATE
    // parent object per result, each built from the SAME stored row and each carrying its own separately
    // materialized rate collection. Hibernate's session could not produce that: one row was one instance
    // for the life of the session, and the key-based identity comparisons in
    // `src/domain/entities/priceGroup.ts` and `src/domain/entities/priceGroupRate.ts` are faithful
    // precisely because of it. The plural form materializes each stored row once and hands the same
    // instance to every descendant that needs it, which is what makes those comparisons mean what the
    // legacy meant. This is a fidelity decision about object identity, not a statement-count one.
    //
    // The fetch shape is unchanged, association for association: every returned group still carries its
    // rates, its ancestry to the root, and its direct children, exactly as the singular form gave it.
    return this.hydrateCascadeReadyPriceGroups(
      priceGroupRows,
      SELECT_ACTIVE_PRICE_GROUPS_BY_ID,
      true,
    );
  }

  /**
   * Loads one price group, materialized so the five-level cascade can run against it. FETCH SHAPE
   * (T3), stated per association because the cascade at
   * [model/service/PriceGroupService.cfc:L140-L181] reaches every one of them. `priceGroupRates` is
   * MATERIALIZED, because levels one through four walk it - and materializing it materializes the
   * GLOBAL rate by construction, since `getGlobalPriceGroupRate()`
   * [model/entity/PriceGroup.cfc:L83] is `priceGroupRates.find(...)`, so level four needs no fifth
   * statement. Each rate's `roundingRule` is MATERIALIZED through the LEFT OUTER JOIN on the rate
   * read, which is what lets the `percentageOff` branch apply it at
   * [model/service/PriceGroupService.cfc:L327], and each rate's `appliesTo` determination and six
   * link collections are MATERIALIZED identity-only. `parentPriceGroup` is MATERIALIZED hop by hop,
   * each ancestor carrying its own rates and its own parent, because level five recurses into it
   * asymmetrically [model/service/PriceGroupService.cfc:L174]. `childPriceGroups` is MATERIALIZED
   * one level.
   *
   * DEPTH DECISIONS. The PARENT CHAIN reaches its ROOT because the level-five recursion is itself
   * unbounded and the entity's path walk at [model/entity/PriceGroup.cfc:L195] climbs to the root
   * too, so truncating at a fixed depth would silently shorten a path and change which rate wins.
   * The CHILD collection stops at ONE LEVEL because its only in-scope consumer is the detachment
   * loop at [model/service/PriceGroupService.cfc:L463-L467], which detaches direct children and
   * never walks a grandchild. Ancestors reached through `getParentPriceGroup()` carry NO children,
   * a deliberate asymmetry - the detachment loop only ever runs against the entity the service was
   * handed.
   *
   * `undefined` ON A MISS, never a zero-value stand-in and never an empty placeholder entity: a
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
   * Loads a SET of price groups by key, in ONE seed statement, keyed by case-folded identifier.
   *
   * ★★ THIS IS NOT A SEVENTH PORT METHOD, AND THAT IS DELIBERATE. `PriceGroupRepository` is locked
   * at SIX MEMBERS by its own contract, and the lock has already shaped two decisions in that file -
   * `savePriceGroupRate` took an optional trailing parameter rather than gaining a sibling, and
   * `deletePriceGroup` keeps its existence probes internal rather than publishing them. The same
   * discipline applies here: this method is declared on the ADAPTER and is NOT added to the port. The
   * composition root, which already constructs this class and already holds `MySqlSkuRepository` at
   * its concrete type for a comparable reason, satisfies a narrow module-local contract with it. No
   * fourteenth port file is created and no seventh port member is declared.
   *
   * ★★ WHY IT EXISTS AT ALL: THREE CALL SITES EACH RAN A SERIAL READ PER IDENTIFIER.
   * `src/handlers/bootstrap.ts` resolved an account's price-group association, the price-group page,
   * and the price groups named by pass one's intents by awaiting one `getPriceGroup` per identifier -
   * a statement count linear in the collection, issued strictly one after another when nothing in the
   * work depends on the previous answer. Under Hibernate those were ONE association fetch each. This
   * method restores the single-fetch shape.
   *
   * FETCH SHAPE (T3): every returned group carries its rates, each rate's rounding rule and its six
   * identity-only link collections, and its parent chain to the ROOT. It does NOT carry its direct
   * children.
   *
   * QUOTE-THEN-REVISE, and the revision is a deliberate divergence from the singular form. This
   * paragraph previously read: "IDENTICAL TO `getPriceGroup`, ASSOCIATION FOR ASSOCIATION, because it
   * hands the seed rows to the very same hydrator with the very same `includeDirectChildren: true`
   * ... and its DIRECT children one level. Nothing is added and nothing is dropped, so a caller
   * cannot tell which form produced the entity it holds - which is the property that makes this
   * substitution safe." The children clause is now false, on purpose (F37), and the invariant it was
   * protecting survives intact in the form that actually matters: NO CONSUMER OF THIS METHOD CAN TELL,
   * because no consumer of this method reads `getChildPriceGroups()`. All three are enumerated in
   * `src/handlers/bootstrap.ts` and each was checked:
   *
   *  * the account price-group association read, whose groups are merged at
   *    [model/service/PriceGroupService.cfc:L280-L284] and passed to
   *    `calculateSkuPriceBasedOnPriceGroup` (L290), which walks RATES and the PARENT chain;
   *  * order-document materialization, whose groups become `OrderItemView.appliedPriceGroup` - a
   *    read-only view consumed by the L241 discriminator and the rate cascade;
   *  * price-group intent projection, which produces the same read-only view.
   *
   * WHY THIS IS THE FAITHFUL SHAPE RATHER THAN A REDUCED ONE. `childPriceGroups` was a LAZY Hibernate
   * collection: the legacy paid for it only where it was touched, and the one place it is touched is
   * the detachment loop at [model/service/PriceGroupService.cfc:L463-L467] together with the
   * `"childPriceGroups": [{"contexts":"delete","maxCollection":0}]` delete rule. Materializing it for
   * three callers that never look was the implicit N+1 that transformation rule T3 exists to remove -
   * one statement per seed, answering a question nobody asked.
   *
   * ★ THE PORT'S CONTRACT IS UNTOUCHED, AND THAT LINE IS THE SAFETY ARGUMENT. Both PORT reads -
   * `getPriceGroup` and `getAccountSubscriptionPriceGroups` - still pass `includeDirectChildren: true`,
   * so every entity reachable through `PriceGroupRepository` still arrives with the collection the
   * delete rule reads, and an entity that reaches `deletePriceGroup` cannot have come from here: this
   * method is declared on the ADAPTER, is reached only through the `PriceGroupSetLoader` contract in
   * the composition root, and that contract publishes no delete.
   *
   * ★ AND IT IS STRICTLY BETTER ON ENTITY IDENTITY, for the reason
   * {@link MySqlPriceGroupRepository.hydrateCascadeReadyPriceGroups} records at length: N separate
   * singular reads hand back N separately-materialized copies of any SHARED ancestor, which Hibernate's
   * session could never do. One batched read shares them. That is a fidelity gain, not a new
   * behaviour: the key-based comparisons in `src/domain/entities/priceGroup.ts` already assume one row
   * means one instance.
   *
   * ★★ KEYED BY CASE-FOLDED IDENTIFIER, AND THE CALLER REBUILDS ITS OWN ORDER. CFML identifiers are
   * case-INSENSITIVE and MySQL's default collation matches them that way, so a caller asking for
   * `'ABC'` must find the row stored as `'abc'`. The map key is therefore folded exactly as every
   * column read in this file is folded. The map is UNORDERED by construction, which is the honest
   * shape: `IN (...)` does not preserve list order, so an array return would be publishing an order
   * the statement does not guarantee. Callers that need an order hold their own request list and walk
   * it - and each of the three does something different with an absent key, which a map lets them
   * decide and an array would not.
   *
   * ★ AN ABSENT KEY IS SIMPLY ABSENT FROM THE MAP, exactly as `getPriceGroup` yields `undefined`.
   * This method reports nothing and throws nothing for a key that matches no row: whether a miss is a
   * broken foreign key that must be refused or a variation to skip is the CALLER'S question, and the
   * two price-group callers in the composition root answer it differently on purpose.
   *
   * ★ AN EMPTY REQUEST ISSUES NO STATEMENT, and that is parity rather than an optimisation: N calls
   * to `getPriceGroup` issue N statements, so zero calls issue zero. It also mechanically prevents
   * `IN ()`, a MySQL syntax error. This early return is NOT the `recordCount` guard reproduced in
   * `getAccountSubscriptionPriceGroups`, which reproduces a guard the legacy SOURCE carries at
   * [model/dao/PriceGroupDAO.cfc:L92, L98]; there is no legacy antecedent for this method at all. The
   * two must not be conflated, and neither may be harmonised with
   * `src/repositories/mysql/mysqlOptionRepository.ts`, which MUST bind a single empty-string element
   * because `OptionDAO` carries no guard whatsoever.
   *
   * @param priceGroupIDs - the keys to load, in whatever order and with whatever repetition the
   *   caller holds them. Repeated keys - including keys repeated only in casing - are collapsed to
   *   ONE placeholder, so the statement never asks the database for a row twice.
   */
  public async getPriceGroupsByID(
    priceGroupIDs: readonly string[],
  ): Promise<ReadonlyMap<string, PriceGroup>> {
    // De-duplicated by FOLDED key while BINDING the first spelling seen. Folding the key is what
    // collapses `'ABC'` and `'abc'` into one request; binding the caller's own spelling is what keeps
    // the bound parameter identical to the one the singular form would have bound.
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
   * FETCH SHAPE (T3). Materialized: the `roundingRule` through the join, read by the service at
   * [model/service/PriceGroupService.cfc:L326-L327]; all three collections the rate APPLIES TO,
   * because rate matching tests membership against product types, products and SKUs; all three
   * EXCLUDED collections, because the entity retains them and `getAppliesTo()`
   * [model/entity/PriceGroupRate.cfc:L95] counts them even though the cascade never consults them;
   * and the OWNING price group, because [model/entity/PriceGroupRate.cfc:L275] dereferences it
   * without a guard. `undefined` ON A MISS.
   *
   * ONE CONSEQUENCE A READER MUST KNOW: because the owning price group is itself materialized with
   * its rates, one stored rate row can yield TWO instances in one call. That is safe because every
   * in-scope comparison is by PRIMARY KEY, not by reference - the containment probes on
   * `src/domain/entities/priceGroupRate.ts` and the sibling-rate reconciliation at
   * [model/service/PriceGroupService.cfc:L407-L444] both compare `getPriceGroupRateID()`. The rates
   * reached through the price group carry NO back-link, which stops this recursing.
   */
  public async getPriceGroupRate(priceGroupRateID: string): Promise<PriceGroupRate | undefined> {
    const rateRows = await this.executor.execute(SELECT_RATE_BY_ID_SQL, [priceGroupRateID]);
    const rateRow = rateRows.at(0);

    if (rateRow === undefined) {
      return undefined;
    }

    // Read back from the row rather than reusing the argument, so the membership lookup is keyed on
    // the identifier the database actually returned - the case-folding reader is the only thing
    // that knows what casing the driver used.
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
   * Persists a price group, WITH EXPLICIT `priceGroupIDPath` MAINTENANCE.
   *
   * CFML parity [model/entity/PriceGroup.cfc:L206, L211]: the legacy maintained the materialized
   * path in two ORM LIFECYCLE HOOKS, `preInsert` and `preUpdate`, which Hibernate fired. Rule T3
   * removes the ORM, so nothing fires them and manufacturing a session to fire them would re-import
   * the framework this migration removes. Maintenance is therefore performed HERE, in the same save
   * that writes the row, which keeps `getPriceGroupIDPath()` [model/entity/PriceGroup.cfc:L195]
   * answering with a path that matches the stored hierarchy. `mysqlProductTypeRepository.save` does
   * exactly this for `productTypeIDPath`, replacing [model/entity/ProductType.cfc:L306] and
   * [:L311]; the symmetry stops there, because `Category.cfc`'s `categoryIDPath` has no repository
   * in this folder and `Sku` and `Product` declare NO lifecycle hooks at all.
   *
   * ORDERING IS MANDATED BY THE ENTITY, not chosen here: `PriceGroup` assigns its path and calls
   * `super` AFTERWARDS [model/entity/PriceGroup.cfc:L207-L208], where `super` was the framework's
   * validate-and-stamp step [org/Hibachi/HibachiEntity.cfc:L598, L651]. `Category` reverses that
   * order, which is why the entities preserve their orderings separately.
   *
   * DESCENDANT PATHS ARE NOT REWRITTEN, and the port's `priorState` parameter exists precisely
   * because finding those descendants would mean matching against the PRE-CHANGE path. The legacy
   * performed no such rewrite - Hibernate fired `preUpdate` only for the entity being flushed - and
   * adding a cascading rewrite would change a value that decides which rate wins. Any future path
   * match added here must go through `materializedIdPathLikePatternFragment` in `./dialect.js` and
   * reproduce the legacy's UNANCHORED substring `LIKE` - `concat('%', <idColumn>, '%')`, no comma
   * anchoring, never `FIND_IN_SET` (see [model/dao/PromotionDAO.cfc:L482-L488]).
   *
   * `createdByAccountID` and `modifiedByAccountID` are PASSED THROUGH and NOT stamped: the legacy
   * stamped them from the ambient request scope, which rule T6 removes, and inventing an actor
   * would fabricate audit data.
   *
   * FETCH SHAPE (T3). NOTHING IS RE-READ FROM THE DATABASE BY THIS METHOD. The returned price group
   * carries exactly the associations the caller supplied, BY REFERENCE; only the minted identifier,
   * the maintained `priceGroupIDPath` on an insert and the audit stamps differ. The one association
   * READ here is the parent, and only its identifier, and only to compose the path.
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
   * NO PATH MAINTENANCE, because `PriceGroupRate` declares no materialized path and no lifecycle
   * hook - verified against [model/entity/PriceGroupRate.cfc] rather than assumed from its sibling.
   * The port declares no prior-state parameter for the same reason.
   *
   * THREE SERVICE-TIER BEHAVIOURS ARE STILL NOT DECIDED HERE, AND THAT LINE HAS MOVED RATHER THAN
   * BLURRED. The sibling-rate reconciliation, the global-flag exclusivity and the include/exclude
   * clearing at [model/service/PriceGroupService.cfc:L407-L444] all run around `super.save()` at
   * [model/service/PriceGroupService.cfc:L404] - in the SERVICE - and none of those RULES is
   * evaluated by this adapter. What this method now accepts is the RESULT of them: the set of
   * sibling rates the service already mutated, so that they land in the same transaction as the rate
   * that caused the mutation. Hibernate flushed exactly that set together at request end; a contract
   * able to persist only one rate could not express it, and the reachable half-applied states - two
   * global rates in one group, or a member that left one rate without leaving the other - each change
   * which rate a SKU resolves to. The port records the same change against its own declaration.
   *
   * ★★ WHAT *IS* ABSORBED HERE IS THE LINK-TABLE WRITE, BECAUSE IT WAS NEVER SERVICE BEHAVIOUR. The six
   * many-to-many associations at [model/entity/PriceGroupRate.cfc:L71-L77] are declared WITHOUT
   * `inverse="true"`, which makes this rate the OWNING side of every one of them, and Hibernate flushed
   * an owning-side collection to its link table as part of persisting the entity - not as part of any
   * service call. `super.save()` at [model/service/PriceGroupService.cfc:L404] therefore stored the
   * rate's membership as well as its columns, and so must this method. Writing only the
   * `SwPriceGroupRate` row would mean an `addProduct` or a `setSkus([])` was accepted by the entity,
   * reported as saved, and then silently lost - see `reconcileRateLinks` for the shape.
   *
   * The DECISION of which members a rate should carry stays entirely at the service tier; only the
   * STORAGE of whatever it carries by the time it arrives here belongs to this adapter.
   *
   * E4: `amount` is bound as a DECIMAL STRING, produced by `Money.toDecimalString()`. It is never bound
   * as a number, and an absent amount binds SQL NULL rather than zero - the same rule the read side
   * applies in reverse, and for the same reason.
   *
   * FETCH SHAPE (T3). The returned rate carries the associations the caller supplied, unchanged: this
   * method persists, and re-reading in order to return would issue statements the caller did not ask
   * for and could hand back a shape different from the one it passed in. STATEMENT SHAPE is likewise
   * fixed rather than data-driven - one row write, then one delete per link table and one insert per
   * NON-EMPTY link table, so between seven and thirteen statements whatever the membership sizes are.
   *
   * NO TRANSACTION WRAPS THE GROUP, and that is a property of the connection contract rather than a
   * choice made here: `src/repositories/mysql/connection.ts:L262-L308` publishes `execute` and
   * `executeMutation` and states without qualification that "there is no transaction method either",
   * because "adding a transaction here would imply a guarantee the surrounding execution model does not
   * provide". The consequence is stated plainly: a failure part-way through leaves the row written and
   * some link tables reconciled. The operation is RETRYABLE rather than atomic - every statement it
   * issues is idempotent for a given rate, since each collection is deleted before it is re-inserted -
   * so re-running the same save converges on the same stored state. This is the same disposition, for
   * the same cited reason, as the catalog delete cascade in `mysqlProductRepository.deleteProduct`.
   *
   * NET-NEW COVERAGE (B8): an insert asserting the minted key, an update asserting the key binds LAST,
   * an absent `amount` asserting a bound NULL, a save asserting one delete per link table followed by
   * an insert carrying every member of each non-empty collection, a save of a rate whose collections
   * are all empty asserting six deletes and no insert, and a member with an unsaved key asserting the
   * refusal.
   */
  public async savePriceGroupRate(
    priceGroupRate: PriceGroupRate,
    reconciledSiblings?: readonly PriceGroupRate[],
  ): Promise<PriceGroupRate> {
    const auditTimestamp = new Date();

    // ONE UNIT OF WORK. The scalar row and up to six link collections are written together, so a
    // failure part-way through cannot leave a rate whose amount was updated but whose membership was
    // not - which is the state that changes which SKUs a price applies to. Under the ORM this ran
    // inside the transaction Hibachi opened; with the ORM gone the transaction is opened here.
    //
    // THE SIBLINGS JOIN THAT SAME UNIT OF WORK rather than getting one each. Hibernate flushed every
    // dirty managed entity together at request end, so a rate promoted to global and the sibling
    // demoted to make room for it either both landed or neither did. Persisting them in separate
    // transactions would make the half-applied state reachable - two global rates in one price
    // group, which makes `getGlobalPriceGroupRate()` [model/entity/PriceGroup.cfc:L83-L90]
    // nondeterministic. The service decides WHICH siblings changed; this method only persists them.
    return await this.executor.transaction(async (tx): Promise<PriceGroupRate> => {
      const saved = await this.writePriceGroupRate(priceGroupRate, auditTimestamp, tx);

      // SEQUENTIAL, NOT CONCURRENT. Every statement in this unit of work travels the one connection
      // the transaction holds, and a single connection has no statement concurrency to exploit -
      // issuing these in parallel would interleave them on that connection for no gain.
      for (const sibling of reconciledSiblings ?? []) {
        await this.writePriceGroupRate(sibling, auditTimestamp, tx);
      }

      return saved;
    });
  }

  /**
   * Writes one rate - scalar columns and all six link collections - on an already-open transaction.
   *
   * ONE ROUTINE FOR THE SAVED RATE AND FOR EVERY SIBLING, deliberately. A sibling reached this
   * method because the exclusivity rule stripped a member from it or cleared its global flag, and
   * both of those are ordinary rate mutations; giving siblings a narrower write path would mean
   * deciding here which of their columns the service was allowed to have changed, which is a rule
   * this adapter must not hold. The insert branch stays reachable for the same reason Hibernate's
   * flush did not special-case it: a dirty managed entity is persisted according to whether it has a
   * key, not according to how it came to be dirty.
   *
   * The row FIRST, then its link rows: a link row names a `priceGroupRateID`, so on an insert there
   * is no key to name until the row exists.
   *
   * @param priceGroupRate - the rate to persist.
   * @param auditTimestamp - the one captured instant shared by every row in this unit of work.
   * @param tx - the transaction-bound executor; reaching past it would escape the transaction.
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

    // Keyed on the identifier that was actually written, which for an insert is the minted one - the
    // argument still reports `''`.
    await this.reconcileRateLinks(saved.getPriceGroupRateID(), priceGroupRate, tx);

    return saved;
  }

  /**
   * Rewrites all six link collections for one rate to match the entity in hand.
   *
   * THIS IS THE HALF THAT WAS MISSING. The scalar write below it always worked; the six many-to-many
   * collections declared at [model/entity/PriceGroupRate.cfc:L71-L77] were READ by
   * `loadRateLinkMembership`, and CASCADE-DELETED when their price group was deleted, but never
   * written on a save. Hibernate reconciled them from the entity's collections on flush, so a rate
   * saved with a changed product list persisted that change; the target rehydrated the collections
   * in memory and returned a rate that LOOKED updated while `SwPriceGroupRateProduct` still held the
   * old membership. Nothing about the returned value revealed it, which is what made the gap durable.
   *
   * WHY IT MATTERS MORE THAN AN ORDINARY MISSING WRITE: these collections decide WHICH products and
   * SKUs a rate applies to [model/service/PriceGroupService.cfc:L57-L181]. A stale link row does not
   * corrupt a display value, it charges the wrong price.
   *
   * DELETE-THEN-INSERT PER COLLECTION, which is the only shape that can express a REMOVAL. A rate
   * arriving here has already had members added or taken away by the service - `removeProductType`,
   * `removeProduct` and `removeSku` at [model/service/PriceGroupService.cfc:L417, L421, L425], and all
   * six whole-collection replacements at [model/service/PriceGroupService.cfc:L437-L442] - and an
   * insert-only reconciliation would store the additions while leaving the removals in the table. What
   * the entity holds is the complete intended membership, so replacing the stored set with it is what
   * makes the two agree.
   *
   * ALL SIX ARE RECONCILED, INCLUDING THE THREE EXCLUSION COLLECTIONS, even though the cascade never
   * consults them - a documented legacy gap recorded against `getRateForSkuBasedOnPriceGroup`. The
   * entity retains them and `getAppliesTo()` [model/entity/PriceGroupRate.cfc:L95] counts them, so
   * dropping their persistence would turn a read-side gap into a data-loss bug.
   *
   * ★ EVERY MEMBER KEY IS CHECKED BEFORE ANY STATEMENT IS ISSUED. A member that has never been
   * persisted carries `''`, and storing that would write a link row pointing at no row at all.
   * Hibernate refused the same state - an owning-side collection holding a transient instance, with no
   * `cascade` declared on any of the six associations at [model/entity/PriceGroupRate.cfc:L71-L77] -
   * so refusing is the faithful outcome, and silently dropping the member would persist a membership
   * quietly smaller than the one the caller handed over. Admitting all six collections up front rather
   * than as each is reached is what keeps the refusal from landing half-way through; the surrounding
   * transaction would roll a partial pass back, but a refusal that never issued a statement is easier
   * to reason about than one that relies on the rollback to be correct.
   *
   * AN EMPTY COLLECTION STILL ISSUES ITS DELETE. That is the whole point of clearing membership: a
   * rate whose product list is emptied must lose its rows, so the delete is unconditional and only
   * the INSERT is skipped. Short-circuiting the delete for an empty collection would make clearing a
   * collection impossible - the one operation most likely to be attempted after a mistake.
   *
   * @param priceGroupRateID the identifier written by the scalar statement.
   * @param priceGroupRate the entity whose collections are authoritative.
   * @param tx the transactional executor. Passed explicitly rather than read from `this.executor`,
   *   because reaching the outer executor would send these statements on a different connection where
   *   they would commit independently of the scalar write.
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

      // S-12. Batched inside the transaction this reconciliation already runs in, so the six
      // collections stay atomic together: a failure in the fourth table rolls the first three back
      // and a retry rewrites all six from scratch. For every realistic membership this is one
      // statement per table, exactly as before.
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
   * CFML parity [model/entity/PriceGroup.cfc:L64]: `priceGroupRates` is the ONE association on this
   * entity declared `cascade="all-delete-orphan"`, so Hibernate removed the rate rows - and their link
   * rows - when the price group was deleted. With the ORM gone, that cascade must be performed
   * explicitly, and it is: the six rate link tables first, then `SwPriceGroupRate`, then `SwPriceGroup`,
   * in that order so no statement leaves a row pointing at a deleted parent. `PriceGroupRate` itself
   * declares NO cascade, which is why the walk stops at its link tables.
   *
   * ★★ TWO CLAIMS THIS BLOCK ONCE MADE ARE NOW FALSE, AND THEY ARE QUOTED RATHER THAN OVERWRITTEN.
   *
   * The first read: "NOTHING ELSE IS CASCADED, and the finding is stated explicitly rather than left to
   * inference. The remaining associations on [model/entity/PriceGroup.cfc:L62-L70] - `appliedOrderItems`,
   * `childPriceGroups`, `accounts`, `subscriptionBenefits`, `subscriptionUsageBenefits` and
   * `promotionRewards` - are all INVERSE sides, and Hibernate does not cascade an inverse side. So no
   * orphan cleanup, no referential repair and no cascading delete beyond the one the legacy actually
   * declared."
   *
   * Every sentence of that is still TRUE ABOUT CASCADING, and none of it is retracted: those six
   * associations are still not cascaded, and this method still deletes no order item, no account, no
   * subscription benefit and no promotion reward. What the passage got wrong was treating "Hibernate
   * cascaded nothing here" as "nothing happened here", when the ORM's actual behaviour was to REFUSE THE
   * DELETE OUTRIGHT. [model/validation/PriceGroup.json] sets `maxCollection: 0` on all six,
   * [org/Hibachi/HibachiService.cfc:L55] validates BEFORE removing anything, and
   * [org/Hibachi/HibachiService.cfc:L79] returns `false` when that validation fails. Not cascading was
   * safe only because the gate stood in front of it; porting the absence of the cascade without the gate
   * left a price group deletable out from under a live order item, and the `SwOrderItem` row that
   * survived then pointed at a `priceGroupID` that no longer exists. Five of those six gates are now
   * enforced here as bare existence probes - see `PRICE_GROUP_DELETE_GATES` - and the standing read-only
   * ruling is unchanged and restated there: the two subscription link tables are READ and NEVER WRITTEN.
   *
   * The second read: "CFML parity [model/service/PriceGroupService.cfc:L461-L470]: the child DETACHMENT
   * loop is a service behaviour and stays there, including its non-termination hazard. This adapter
   * returns the child collection faithfully - see `getPriceGroup` - and adds NO bounded-iteration guard,
   * NO re-read and NO live self-refreshing view."
   *
   * The LOOP is still a service behaviour and still lives there, guard and hazard included, and this
   * method still adds no guard, no re-read and no self-refreshing view. What was wrong was the unstated
   * inference that the loop was therefore COMPLETE at the service tier. It was complete under the ORM
   * because `removeChildPriceGroup` mutated MANAGED entities and Hibernate flushed the resulting UPDATEs
   * at request end - the loop decided WHICH children detach, the session performed the detachment.
   * Without a session the loop decided and nothing performed: `SwPriceGroup.parentPriceGroupID` was
   * never touched, so every child kept a foreign key into a row this method then deleted. The DECISION
   * stays at the service tier; the WRITE it implies is discharged here by
   * `DETACH_CHILD_PRICE_GROUPS_SQL`, which is why that statement is keyed on the parent rather than on a
   * list of children the service already removed from the entity.
   *
   * The port makes the same commitment about the loop, deliberately declaring no guard, bound, cursor or
   * iteration-limit parameter, and that is unchanged - persisting a detachment adds no parameter.
   *
   * ONE UNIT OF WORK, AND THE ORDER WITHIN IT IS THE ORM'S. Every statement runs inside a single
   * transaction, because a delete that removed a group's rates and then failed before the group itself
   * would leave a price group with no rate at all - which the cascade reads as "no rate applies" and
   * silently prices at list. The sequence reproduces Hibernate's flush order: the gates first
   * ([org/Hibachi/HibachiService.cfc:L55], before any removal), then the child UPDATEs, then the entity
   * deletions outside-in. Hibernate's `ActionQueue` executed updates ahead of entity deletions for
   * exactly the reason it matters here - a child detached after its parent row was gone would already
   * have violated the reference.
   *
   * A FAILED GATE COMMITS AN EMPTY TRANSACTION AND DOES NOT RAISE. The legacy reports refusal as
   * `return false` [org/Hibachi/HibachiService.cfc:L79], not as an exception, so this method returns the
   * same boolean; and because the gates are evaluated before the first mutation, the transaction that
   * commits at that point contains nothing. Throwing to force a rollback would convert a legitimate,
   * expected refusal into a failure the caller has to catch.
   *
   * ★★ AND WRITING NOTHING ON A REFUSAL IS FAITHFUL, NOT MERELY TIDY - THE FLUSH-SUPPRESSION CHAIN WAS
   * VERIFIED RATHER THAN ASSUMED. The refusal arrives AFTER the service loop has already detached the
   * children in memory, so the obvious worry is that legacy left those detachments applied and flushed
   * them anyway - which would make "refuse and write nothing" a divergence. It does not, and the chain is
   * three links, every one of them read:
   *
   *   1. [org/Hibachi/HibachiTransient.cfc:L455-L457] - `validate()` ends with
   *      `if(this.isPersistent() && this.hasErrors()) { getHibachiScope().setORMHasErrors( true ); }`, so
   *      a persistent price group that fails its delete gates sets the request-wide error flag.
   *   2. [org/Hibachi/Hibachi.cfc:L455-L459] - `endHibachiLifecycle()` flushes the ORM session ONLY
   *      `if(!getHibachiScope().getORMHasErrors())`. The same guard is repeated at
   *      [org/Hibachi/HibachiScope.cfc:L119-L123].
   *   3. Therefore the request ended with NO flush: the child UPDATEs the loop had implied were
   *      discarded along with everything else the session held.
   *
   * So legacy's observable outcome for a refused delete is exactly this method's - the boolean `false`
   * and not one modified row - and the transaction is what reproduces it. That also settles why the
   * detachment cannot be persisted eagerly, before the gates: doing so would write a change legacy threw
   * away, orphaning every child of a price group whose delete was refused.
   *
   * CFML parity [model/service/PriceGroupService.cfc:L461-L470]: the child DETACHMENT loop is a
   * service behaviour and stays there, including its non-termination hazard. This adapter returns
   * the child collection faithfully and adds NO bounded-iteration guard, NO re-read and NO live
   * self-refreshing view; the port makes the same commitment.
   *
   * FETCH SHAPE (T3). NO ASSOCIATION IS MATERIALIZED, AND NONE IS READ FROM THE ENTITY. The return type
   * is a boolean, so nothing is hydrated; and the entity is consulted for exactly two things, `isNew()`
   * and `getPriceGroupID()`. In particular `getPriceGroupRates()` is NEVER read and neither is
   * `getChildPriceGroups()`: every one of the fourteen statements binds the price-group identifier alone,
   * the six link deletes reaching their rows through a subquery on `SwPriceGroupRate` rather than through
   * an `IN` list of materialized rate identifiers - see `buildRateLinkDeleteSql` - and the child detach
   * keying on `parentPriceGroupID`. That is what makes this method correct for an entity loaded at ANY
   * depth, including one whose rate collection is empty because the caller never asked for it and one
   * whose child collection the service loop has just emptied: the cascade, the gates and the detachment
   * are all driven by what is STORED, exactly as Hibernate's were, not by what happens to be in hand.
   *
   * The five gate probes ARE reads, and they are the only reads: five bare existence tests, no column of
   * an out-of-scope table projected and no out-of-scope entity constructed.
   *
   * NET-NEW COVERAGE (B8): a delete asserting all fourteen statements in order with their bound
   * parameters, one case per gate proving a populated relationship refuses the delete before any
   * mutation is emitted, the child detach asserting the nulled parent and the repathed column, an unsaved
   * entity asserting `false` with no statement emitted, a grep-level assertion that no subscription table
   * appears in any WRITE, and an assertion that every statement runs inside the transaction.
   */
  public async deletePriceGroup(priceGroup: PriceGroup): Promise<boolean> {
    if (priceGroup.isNew()) {
      // `unsavedvalue=""` [model/entity/PriceGroup.cfc:L52] means this entity has no row, so there
      // is nothing to delete and nothing to report as deleted.
      return false;
    }

    const priceGroupID = priceGroup.getPriceGroupID();

    // ★★★ ATOMICITY BOUNDARY - EVERY STATEMENT IN THIS UNIT, OR NONE OF THEM.
    //
    // CFML parity, and the reason this is a transaction rather than a sequence. The legacy performed
    // this delete as `removeAllManyToManyRelationships()` followed by `entityDelete()`
    // [org/Hibachi/HibachiService.cfc:L49-L80, org/Hibachi/HibachiDAO.cfc:L68-L76], and BOTH ARE ORM
    // SESSION OPERATIONS: no SQL reached the server until the session flushed, and Hibernate flushes
    // inside one JDBC transaction. The child detachment, the six rate-link deletes, the rate delete and
    // the row delete therefore either all landed or none did, and no legacy execution could leave a
    // price group whose link rows are gone and whose row remains. The framework reaches for
    // `<cftransaction>` explicitly wherever it drives raw SQL over several statements
    // [org/Hibachi/HibachiDAO.cfc:L183-L263], which is the same guarantee stated the other way round.
    //
    // Issuing these as autocommit statements would not preserve that behaviour - it would DISCARD a
    // guarantee the source had. A failure part-way through leaves a price group stripped of its rate
    // links but still present and still resolvable by the pricing cascade, which is a WRONG PRICE
    // rather than a failed delete. AAP 0.6.5 requires an explicit boundary here precisely because
    // there is no ambient `cftransaction` to inherit one from.
    //
    // BOUNDED ON PURPOSE: a fixed, known statement count over ONE aggregate, keyed on one identifier -
    // five existence probes, one detachment, six rate-link deletes, one rate delete, one row delete.
    // This is not the bulk case; the per-SKU save loop [model/service/ProductService.cfc:L216-L233] and
    // the SKU cartesian product [model/service/SkuService.cfc:L109-L121] are unbounded and are handled
    // by batch limits and idempotency instead, per AAP 0.6.5. Wrapping an unbounded loop in one
    // transaction would hold locks past the platform timeout.
    //
    // The transactional executor is the one the work function RECEIVES. Reaching `this.executor` from
    // inside would send the statement to a different pooled connection, outside the transaction, which
    // is exactly the defect being fixed.

    // One instant for the whole unit of work, captured before it opens, matching the single `now()` the
    // ORM's flush would have stamped across every row it touched.
    const auditTimestamp = new Date();

    return await this.executor.transaction(async (tx): Promise<boolean> => {
      // GATES FIRST, ALL OF THEM, BEFORE THE FIRST MUTATION.
      // [org/Hibachi/HibachiService.cfc:L55] validates the whole delete context up front, so a
      // relationship on the LAST gate refuses the delete just as completely as one on the first. Probing
      // lazily - after some rows had already gone - would produce a half-deleted price group that the
      // legacy could never reach.
      //
      // SEQUENTIAL, NOT CONCURRENT: every statement here travels the single connection this transaction
      // holds, which has no statement concurrency to exploit.
      for (const gate of PRICE_GROUP_DELETE_GATES) {
        const blockingRows = await tx.execute(buildDeleteGateProbeSql(gate), [priceGroupID]);

        if (blockingRows.length > 0) {
          // The bare boolean refusal of [org/Hibachi/HibachiService.cfc:L79]. Nothing has been mutated,
          // so the transaction commits empty; see the block above for why this does not throw.
          return false;
        }
      }

      // The detachment the service decided, now performed. Before the deletes, because a child whose
      // parent row was already gone would have violated the reference in the interim.
      await tx.executeMutation(DETACH_CHILD_PRICE_GROUPS_SQL, [
        auditTimestamp,
        // S-07. The account half, on the same footing as the timestamp beside it.
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

  // --- Private: reads ----------------------------------------------------------------------------

  /** One price-group row by key, or `undefined` when the key matches nothing. */
  private async readPriceGroupRow(priceGroupID: string): Promise<SqlRow | undefined> {
    const rows = await this.executor.execute(SELECT_PRICE_GROUP_BY_ID_SQL, [priceGroupID]);

    return rows.at(0);
  }

  /**
   * Assembles a price group with everything the cascade walks.
   *
   * The visited set exists to TERMINATE THE READ: nothing in the schema prevents a cycle in
   * `parentPriceGroupID`, and without it this walk would issue statements forever.
   *
   * ★★ WHAT A REVISIT DOES, AND WHY IT RAISES RATHER THAN TRUNCATES. A repeat within one ancestor
   * chain means the stored parent pointers form a cycle, and there is no ancestry to return - so this
   * walk RAISES `PriceGroupCycleError` and reports the chain it followed. It does not hand back a chain
   * with the repeat silently dropped.
   *
   * The reason is the cascade this read feeds. The five-level price-group resolution is a NAMED
   * must-preserve behaviour, and each of levels three, four and five is reached only by walking one hop
   * further up [model/service/PriceGroupService.cfc:L140-L181]. A truncated chain therefore does not
   * fail - it SUCCEEDS AND RETURNS A DIFFERENT RATE, which is a different price, with nothing reported
   * anywhere. Legacy never did that: Hibernate's lazy many-to-one followed the pointers until the JVM
   * stack gave out, so a cyclic chain FAILED. Raising is the behaviour-preserving choice as well as the
   * diagnosable one; truncating is the only option that can quietly change what a customer is charged.
   *
   * ★ THIS GUARD IS THE ONLY ONE, AND THAT IS DELIBERATE - IT IS A FETCH-SHAPE DECISION, NOT A
   * DIVERGENCE. It spends no part of the three-divergence budget, because a divergence changes
   * behaviour the source actually HAD and this read has no source behaviour to change: it is a
   * hand-written recursive query that exists only because transformation rule T3 replaces Hibernate's
   * lazy many-to-one traversal, and choosing where such a query STOPS is a decision the legacy system
   * never had to take. Termination is therefore decided here, once, at the boundary that owns the
   * query.
   *
   * ★ AN EARLIER REVISION SPREAD THE DECISION ACROSS THREE PLACES, AND THE RECORD BELONGS HERE. It
   * truncated here and leaned on two guards further in: a `CyclicIdPathError` thrown by
   * `buildIdPathList`, and a `PriceGroup.setParentPriceGroup` that refused to create a cyclic chain in
   * the first place. Both of those have been removed - the legacy setter validates nothing
   * [model/entity/PriceGroup.cfc:L110-L115] and the legacy walk carries no visited set
   * [org/Hibachi/HibachiEntity.cfc:L314-L321], so reproducing them faithfully means adding neither.
   * That makes this guard MORE load-bearing, not less, and it is the reason the read raises instead of
   * truncating: a truncated GRAPH is not a safe thing to hand anyone, because the cascade walks the
   * graph directly and never asks for a path at all.
   *
   * ★ ONE POLICY ACROSS ALL THREE RECURSIVE READS IN THE TARGET, so a cycle cannot mean three different
   * things depending on which adapter noticed it. `mysqlProductTypeRepository`'s ancestry walk raises
   * for the same reason, and `src/integrations/google/googleFeedRepository.ts` never truncates either -
   * its `Set` there is a DEDUPE over a flat result list, not a cycle guard, so it has no truncating
   * behaviour to reconcile.
   *
   * ★ A REVISIT WITHIN ONE CHAIN IS NOT THE SAME EVENT AS THE SAME ROW BEING REACHED TWICE. Two
   * different results legitimately share an ancestor, and that ancestor must then be ONE instance
   * reached twice, not a cycle: the collection pass keeps a chain-scoped set, which is what detects a
   * loop, alongside a call-scoped map, which is what makes a shared ancestor yield ONE instance. The
   * two answer different questions and are deliberately separate - conflating them would either raise
   * on an ordinary hierarchy or accept a cycle silently.
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
   * Assembles several price groups, each with everything the cascade walks, in ONE pass.
   *
   * ★★ WHY THE PLURAL FORM IS THE PRIMARY ONE, AND WHAT IT FIXES THAT THE SINGULAR FORM COULD NOT.
   * Read one group at a time and each read hands back its own fresh instances, so two results that
   * inherit from the same parent end up holding TWO DIFFERENT PARENT OBJECTS built from ONE STORED ROW,
   * each with its own separately-materialized rate collection. Hibernate could not do that: one row was
   * one instance for the life of a session, and everything downstream assumes it. The entity-identity
   * comparisons in `src/domain/entities/priceGroup.ts` and `src/domain/entities/priceGroupRate.ts`
   * compare stored keys precisely BECAUSE one row means one row; and the exclusivity reconciliation at
   * [model/service/PriceGroupService.cfc:L409-L433] mutates sibling rates reached through a shared
   * price group, which is only coherent if that price group is shared. This method is what makes it so.
   *
   * THREE PHASES, IN ORDER, AND THE ORDER IS WHAT MAKES IT WORK:
   *
   *   1. COLLECT. Walk up from every seed row, reading each unseen ancestor row exactly once into a
   *      map keyed by identifier. A cycle inside any one chain raises here - see the note on cycles
   *      below - so the graph handed to phase 3 is acyclic by construction.
   *   2. LOAD. Ask for the rates of every collected identifier together, then for the six link
   *      collections of every one of those rates together. Both are keyed reads over the same columns
   *      the single-identifier forms used, partitioned by identifier afterwards, so each group receives
   *      exactly the collection it would have received alone.
   *   3. MATERIALIZE. Build each entity from the root of its chain downward, so a parent exists before
   *      the child that must be constructed with it, and record each one in an identity map so a shared
   *      ancestor is constructed once and handed to every descendant that needs it.
   *
   * FETCH SHAPE (T3): identical to the singular form it replaces, association for association. Seeds
   * carry their rates, their ancestry, and - when asked - their direct children; ancestors carry their
   * rates and their own ancestry but no children; children carry neither, for the reason recorded on
   * `getPriceGroup`. Nothing is materialized that was not materialized before, and nothing that was is
   * dropped.
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

    // ★★★ ONE CHILD STATEMENT FOR EVERY SEED, NOT ONE PER SEED (F37). This read used to sit inside
    // the loop below, so a set of P seeds issued P statements that differ only in the key they bind.
    // `buildSelectChildPriceGroupsSql` states the identical predicate over the whole key set and the
    // result is partitioned by the `parentPriceGroupID` the projection already carries, so each seed
    // receives exactly the collection its own statement would have returned. When children are not
    // wanted, NO statement is issued at all rather than one per seed being issued and discarded.
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
   * ★ TWO SETS, ANSWERING TWO DIFFERENT QUESTIONS, AND CONFLATING THEM IS THE BUG THIS AVOIDS. The
   * returned map is call-scoped: a row already in it has been read, and its own ancestry has already
   * been collected in full, so the walk can stop there. `chain` is SEED-SCOPED: an identifier already in
   * it means this chain has looped back on itself. So two seeds sharing an ancestor stop early and share
   * it, while a genuine cycle raises - and the same repeat can never mean both things at once.
   *
   * Each seed starts with an EMPTY chain rather than inheriting one, because a chain is exactly the
   * per-seed thing: two seeds sharing an ancestor have not looped, and seeding one seed's chain into
   * another's would report that legitimate sharing as a cycle.
   *
   * ★★★ EVERY ANCESTOR OF EVERY SEED IS READ IN ONE STATEMENT BEFORE THE WALK (F37). This pass used
   * to `await this.readPriceGroupRow(parentPriceGroupID)` on every hop of every chain, so P seeds
   * standing D levels deep cost up to P x D statements - and every seed row ALREADY CARRIES the
   * answer: `priceGroupIDPath` is a stored materialized path [model/entity/PriceGroup.cfc:L53],
   * maintained by the entity's `preInsert`/`preUpdate` hooks [L206, L211] and by this adapter's own
   * insert and update paths, and read by the legacy service itself at
   * [model/service/PriceGroupService.cfc:L236]. Asking for those identifiers once is the same
   * question asked once.
   *
   * THE WALK ITSELF IS UNTOUCHED, WHICH IS THE POINT. It still climbs PARENT POINTERS rather than the
   * path's order, so a path that disagrees with the stored pointers does not get to redraw the
   * hierarchy; both decisions - cycle and shared-ancestor - are still made on the parent identifier
   * BEFORE its row is resolved; and a parent the path does not name still falls back to its own read,
   * which is what keeps a STALE path (nothing rewrites a descendant's path when an ancestor moves)
   * answering exactly as it did. The prefetch changes WHERE A ROW COMES FROM and nothing else.
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
      // ★★★ THE TWO IDENTITY SETS ARE KEYED BY THE FOLDED IDENTIFIER, AND THE CYCLE GUARD
      // DEPENDS ON IT. `parentPriceGroupID = ?` runs under MySQL's default collation, so a stored
      // parent link of `ABC` resolves the row whose own `priceGroupID` column reads `abc`. With raw
      // keys, `chain.has('ABC')` was then false for a chain that already held `abc`, the loop climbed
      // the same pointer again, and a two-row cycle spelled in two cases span FOREVER instead of
      // raising `PriceGroupCycleError` - one request pinned to a connection until the platform killed
      // it. `collected` is folded for the same reason on the benign side: an ancestor shared by two
      // seeds under two spellings was otherwise read and constructed twice.
      // The ORIGINAL spelling is what still reaches the statement below and what
      // `PriceGroupCycleError` reports; only set identity is folded.
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

        // ★ BOTH DECISIONS ARE MADE ON THE PARENT IDENTIFIER, BEFORE ITS ROW IS READ, AND THAT
        // ORDERING IS WHAT MAKES THE TWO SETS MEAN WHAT THEY SAY. Deciding after the read would make
        // detection depend on whether the read matched: a cycle whose next row happened not to come
        // back would slip through as an ordinary truncation, and a shared ancestor would be re-read
        // once per descendant and then reconciled - which is the very thing this pass exists to stop.
        if (parentPriceGroupID === undefined || parentPriceGroupID === '') {
          // An empty foreign key cannot resolve to a row, so it is treated as absent rather than
          // looked up. That is the outcome the ORM reached when a many-to-one failed to resolve,
          // without issuing a statement that could not match.
          walking = false;
        } else if (chain.has(cfFoldKey(parentPriceGroupID))) {
          // This chain has climbed back onto itself: the stored pointers form a cycle.
          throw new PriceGroupCycleError(chainOrder, parentPriceGroupID);
        } else if (collected.has(cfFoldKey(parentPriceGroupID))) {
          // The parent - and therefore its whole chain above it - was collected by an earlier seed.
          // Stopping here is what makes a shared ancestor ONE row read and ONE instance. It cannot
          // hide a cycle: the chain that collected it climbed it to the end and raised on any repeat
          // of its own, and the check above catches a loop back into THIS chain.
          walking = false;
        } else {
          // FROM THE ONE PREFETCH when a seed's stored path named this ancestor, which is the
          // ordinary case; from its own read when no path named it, or when the prefetch found no
          // such row. Both arms yield the SAME row shape - `buildSelectPriceGroupsByIDSql` projects
          // the identical `PRICE_GROUP_SELECT_LIST` from the identical table with the identical
          // primary-key predicate and no extra filter - so which arm answered is unobservable.
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
   * Every ancestor named by any seed's stored materialized path, in ONE statement (F37).
   *
   * The candidate set is assembled ENTIRELY CLIENT-SIDE from `priceGroupIDPath` on the seed rows the
   * caller already holds, so this method asks the database nothing it cannot use:
   *
   *  * The seeds' own identifiers are removed. Their rows are already in hand and phase one records
   *    each one in `collected` before it climbs, so re-reading them would be pure waste - and asking
   *    for one would additionally let a self-parent resolve from this map instead of reaching the
   *    cycle guard.
   *  * Repeats across seeds are folded away with `cfFoldKey`, so a shared ancestor is requested once
   *    however many seeds' paths name it and whatever case each of them spells it in. The ORIGINAL
   *    spelling is what gets bound; `priceGroupID IN (...)` runs under MySQL's default collation, so
   *    either spelling resolves the row, exactly as the singular `= ?` read did.
   *  * AN EMPTY CANDIDATE SET ISSUES NO STATEMENT. A set of roots - every path naming nothing but its
   *    own row, which is what `DETACH_CHILD_PRICE_GROUPS_SQL` leaves behind and what
   *    `composeInsertedPriceGroupIDPath` writes for a parentless insert - therefore costs ZERO extra
   *    reads rather than one that could only come back empty.
   *
   * `listToArray` splits the path with CFML list semantics, so `''`, `','` and `',,'` all contribute
   * nothing, matching `listLen`'s reading of the same three values.
   *
   * THE STATEMENT IS THE EXISTING SET-BASED READ, not a new one. `buildSelectPriceGroupsByIDSql` is
   * documented at its definition as interchangeable with N singular calls - same projection, same
   * table, same primary-key predicate, no `activeFlag` filter, no `ORDER BY`, no `LIMIT` - which is
   * exactly the property that makes substituting it for N `readPriceGroupRow` calls a fetch-shape
   * refactor rather than a different query. Row order is not read: the result is keyed by identifier
   * and the walk decides its own order from the stored pointers.
   *
   * A returned row can never be a seed, because seed identifiers are filtered out of the bound list
   * above; no second exclusion is applied here, since a guard on an unreachable case would be dead
   * code asserting something the `IN` list already guarantees.
   *
   * @param seedRows the rows the ancestry walk will start from.
   * @param statementLabel the label attributing the seed rows' columns, for column-error messages.
   * @returns every prefetched ancestor row, keyed by folded identifier; empty when no seed path names
   *   an identifier other than a seed's own.
   * @throws An error named `PriceGroupColumnError` when a seed row or a returned row is missing a
   *   column this read projects.
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
   * cycle before this method was reached - which is the other reason the raise belongs there rather
   * than here.
   *
   * ★ THE IN-PROGRESS SET IS A REAL GUARD, NOT A COMMENT ABOUT ONE. This recursion is driven entirely
   * by stored pointer data, so "phase one made a cycle impossible" is a claim about another method
   * rather than a property of this one. Asserting it here is what keeps the method TOTAL: a violation
   * surfaces as the same named, chain-bearing error the collection pass raises, instead of as a stack
   * overflow with nothing in it to identify the offending rows.
   */
  private materializeCollectedPriceGroup(
    priceGroupID: string,
    collected: ReadonlyMap<string, CollectedPriceGroupRow>,
    ratesByPriceGroupID: ReadonlyMap<string, PriceGroupRate[]>,
    hydratedByPriceGroupID: Map<string, PriceGroup>,
    childPriceGroups: PriceGroup[],
    inProgressPriceGroupIDs: readonly string[] = [],
  ): PriceGroup {
    // ★ EVERY MAP AND SET IDENTITY IN THIS PASS IS FOLDED, for the reason recorded on
    // `collectPriceGroupAncestry`: the collation behind every identifier predicate is
    // case-insensitive, so two spellings of one identifier are one row and must be one key. An
    // unfolded `includes` here would also let the recursion re-enter a node it is already
    // materialising, which is a stack overflow rather than a named error.
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
   * The rate collections of several price groups, each rate carrying its joined rounding rule and its six
   * link collections, partitioned back to the group that owns it.
   *
   * A group with no rates is present in the result with an EMPTY collection, so a caller can tell "this
   * group has no rates" from "this group was not asked about" without a fallback.
   *
   * Ancestors need their rates for the same reason seeds do: level five of the cascade recurses into the
   * parent price group and immediately walks its rate collection
   * [model/service/PriceGroupService.cfc:L166-L176]. That is why the chain is included in the identifier
   * set rather than only the seeds.
   *
   * The rates hydrated here carry NO `priceGroup` back-link. Populating it would require either
   * constructing the price group before its own rates exist or mutating a constructed entity afterwards,
   * and neither is warranted: the caller already holds the price group these rates belong to, the cascade
   * reads rates only through it, and the one unguarded dereference of the back-link is
   * [model/entity/PriceGroupRate.cfc:L275] in display code that `admin/**` owns and that is out of scope.
   * The rate-first read populates it, because there the caller has no price group in hand.
   *
   * WHEN NOTHING IS ASKED FOR, OR NO GROUP HAS ANY RATE, NO FURTHER STATEMENT IS ISSUED. That is
   * mechanical, not a behavioural choice: an `IN ()` with zero placeholders is a MySQL syntax error, and
   * `sqlPlaceholderList` refuses a count below one for the same reason.
   */
  private async loadRatesForPriceGroups(
    priceGroupIDs: readonly string[],
  ): Promise<ReadonlyMap<string, PriceGroupRate[]>> {
    const ratesByPriceGroupID = new Map<string, PriceGroupRate[]>();

    // ★ FOLDED KEYS, MATCHING THE COLLECTION AND MATERIALISATION PASSES. The partitioning below
    // reads the OWNER identifier off the returned row, whose stored spelling need not match the
    // spelling that was bound; without the fold a rate row could find no bucket and the group would
    // hydrate with no rates at all - a silently unpriced price group.
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

      // A row whose owner is not in the requested set cannot arise from this statement, since the `IN`
      // list IS the requested set. The lookup is still narrowed explicitly rather than asserted, because
      // a non-null assertion is forbidden in `src/**`.
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
   * [model/entity/PriceGroupRate.cfc:L71-L77], and the emitted text stays assertable statement by
   * statement. E5: one positional placeholder per rate identifier, each bound separately.
   */
  private async loadRateLinkMembership(
    priceGroupRateIDs: readonly string[],
  ): Promise<ReadonlyMap<string, RateLinkMembership>> {
    const membershipByRateID = new Map<string, MutableRateLinkMembership>();

    // ★ FOLDED KEYS. Every caller looks a bucket up by an identifier read back off a RETURNED row,
    // whose stored spelling need not match the spelling that was bound, and the link predicates are
    // themselves case-insensitive. An unfolded key silently dropped a rate's whole link membership,
    // which reads downstream as "this rate excludes nothing".
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
        // since the `IN` list IS the requested set. The lookup is still narrowed explicitly rather
        // than asserted, because a non-null assertion is forbidden in `src/**`.
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
   * JUDGMENT CALL: these instances carry their own columns and NOTHING ELSE - no rates, no children
   * of their own, and no parent back-link. The only in-scope consumer is
   * [model/service/PriceGroupService.cfc:L463-L467], which calls `removeChildPriceGroup(child)`,
   * which delegates to `child.removeParentPriceGroup(parent)`, which needs exactly the child's
   * primary key and the parent passed explicitly as the argument; the back-link is additionally
   * unnecessary because the visited set already contains the parent. THE CONSEQUENCE: a child
   * reports an EMPTY rate collection, which is not a claim that it has no rates. A caller that
   * needs a child's rates must load that child through `getPriceGroup`.
   *
   * THE SHALLOW DEPTH IS STILL SUFFICIENT NOW THAT THE DETACHMENT IS PERSISTED, and that is worth saying
   * because the obvious worry is the opposite. `DETACH_CHILD_PRICE_GROUPS_SQL` keys on
   * `parentPriceGroupID` rather than on a list of child identifiers, so it needs NOTHING from these
   * instances - not their keys, not their paths, not their depth. These handles serve the service loop
   * and only the service loop, and that is exactly what makes the two halves independent: a caller who
   * loaded the parent without its children still gets every stored child detached.
   *
   * ★ KEYED BY A SET OF PARENTS, ANSWERED IN ONE STATEMENT (F37). QUOTE-THEN-REVISE: this method took
   * a single `priceGroupID` and bound a `parentPriceGroupID = ?` statement, and its caller
   * invoked it once per seed. Nothing about the returned handles changes - same columns, same three
   * empty associations, same statement label - only how many statements produce them. A parent with
   * no stored child is ABSENT from the returned map rather than present with an empty array, and the
   * caller reads it as `?? []`, so "no children" and "not asked about" stay the same answer they were
   * when each parent got its own read.
   *
   * @param priceGroupIDs the parents whose direct children are wanted.
   * @returns the direct children of each parent, keyed by folded parent identifier; empty when no key
   *   was supplied or no row matched.
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

  // --- Private: writes ---------------------------------------------------------------------------

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
      // S-07. ONE actor resolution serves both columns, because `preInsert` calls both setters under
      // a single gate [org/Hibachi/HibachiEntity.cfc:L628-L635]. Neither is read off the entity any
      // more: doing so let a caller that hand-built a `PriceGroup` forge the row's authorship.
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
    // The legacy ORM mutated the in-session entity in place; without a session there is nothing to
    // mutate. The associations are carried across by reference, so a caller holding the live child
    // or rate array still sees the same array.
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
    // `super`. The prior state is forwarded when supplied; the legacy body never reads `oldData`
    // either, so both routes are behaviourally identical and the parameter is carried for fidelity.
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
      // S-07. The actor resolution ALONE is bound. A refused gate binds null and the statement's
      // `COALESCE` resolves it against the stored column, so the previous attribution survives -
      // which is what Hibernate produced when `setModifiedByAccount` was never reached
      // [org/Hibachi/HibachiEntity.cfc:L676-L678]. Binding the entity's own value instead would
      // re-admit the forgery this fix removes.
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

    // ★★★ QUOTE-THEN-REVISE, AND THE QUOTED PREMISE IS FALSE ON THIS POOL. This block used to read:
    // "NO ROW COUNT IS INSPECTED. MySQL reports rows CHANGED rather than rows MATCHED for an UPDATE, so
    // a save storing exactly what was already stored reports zero and treating that as a failure would
    // reject an idempotent save. A missing row is a caller error this statement cannot distinguish."
    // The FIRST sentence is true of the MySQL protocol's DEFAULT and is not true of the connection this
    // adapter is handed: `mysql2`'s default client flag set includes `FOUND_ROWS`
    // [node_modules/mysql2/lib/connection_config.js: `getDefaultFlags`] and `./connection.js`
    // `buildPoolOptions()` overrides no `flags`, so the server reports rows MATCHED. Measured against
    // the live schema: a no-change update answers `affectedRows: 1` with `Rows matched: 1  Changed: 0`,
    // and a no-match update answers `affectedRows: 0`. So the two ARE distinguishable, the idempotent
    // save is not at risk, and the last sentence's conclusion no longer follows from its premise.
    //
    // ★★ WHY IT IS WORTH REFUSING. QA testing found the sibling SKU update reporting SUCCESS for a key
    // that named no row - the entity came back carrying that key and a follow-up read found nothing -
    // and Hibernate raised in that situation rather than reporting success. A lost update that reads as
    // a completed one is the one outcome a money-adjacent persistence tier must not have, so every
    // update path in this tier now carries the same guard.
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
      // Write-once, and therefore read back off the entity rather than restamped. Both created
      // columns are absent from `UPDATED_PRICE_GROUP_COLUMNS`, so this update touched neither and
      // the entity - loaded from the row - is reporting what the row still holds.
      createdDateTime: priceGroup.getCreatedDateTime(),
      createdByAccountID: priceGroup.getCreatedByAccountID(),
      modifiedDateTime: auditTimestamp,
      // S-07. What the ROW will hold, which is not what was BOUND: the statement bound the actor
      // resolution and `COALESCE` turns a refusal into the stored value.
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
    // S-07. ONE resolution, shared by the statement and by the entity handed back, so the two
    // cannot disagree about who the row is attributed to.
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

    // The same guard the price-group update above carries, for the same measured reason - see the
    // QUOTE-THEN-REVISE note there for why `affectedRows` counts rows MATCHED on this pool and why a
    // silent no-match update is the outcome being closed. A rate is a MONEY row, so a lost update here
    // changes what a customer is charged.
    if (update.affectedRows === 0) {
      throw new PriceGroupPersistenceError(
        'The price-group-rate update matched no row, so the key it carries names no SwPriceGroupRate ' +
          'row and the entity cannot be reported as persisted.',
      );
    }

    return this.rehydrateSavedPriceGroupRate(priceGroupRate, priceGroupRateID, stamps);
  }

  /**
   * The audit values an inserted rate carries. Both accounts are the same resolution, because
   * `preInsert` calls both setters under one gate [org/Hibachi/HibachiEntity.cfc:L628-L635], and
   * there is no stored value to preserve - so the bound and resolved forms coincide.
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
   *
   * The created pair is absent from {@link UPDATED_PRICE_GROUP_RATE_COLUMNS}, so both created values
   * are built and never bound; they are stated so the re-hydrated entity reports what the row still
   * holds. The modifying account is the one member where BOUND and RESOLVED differ - see
   * {@link PriceGroupRateAuditStamps}.
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
   * E4: `amount` becomes a DECIMAL STRING through `Money.toDecimalString()`, never a number. An
   * absent amount stays absent and binds SQL NULL - [model/entity/PriceGroupRate.cfc:L54] declares
   * no default, and writing zero would store a price of nothing as though it had been chosen. The
   * two foreign keys are read off their associations, and an absent one binds NULL exactly as the
   * ORM wrote for an unset many-to-one.
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
      // S-07. Both accounts come off the STAMPS, alongside the two dates, and no longer off the
      // entity - which is what let a caller that hand-built a `PriceGroupRate` forge the row's
      // authorship. `HibachiEntity` took both from the ambient request scope
      // [org/Hibachi/HibachiEntity.cfc:L628-L630, L632-L635] and never from a caller.
      createdByAccountID: stamps.createdByAccountID,
      modifiedDateTime: stamps.modifiedDateTime,
      modifiedByAccountID: stamps.modifiedByAccountID,
    };
  }

  /**
   * Rebuilds a saved rate so the returned instance reflects what was written. The three readonly
   * excluded collections are copied into fresh arrays because the entity exposes them as `readonly`
   * and its constructor takes mutable ones; the copy is shallow and the members are the same
   * instances, so only the array wrapper is new.
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
      // S-07. The RESOLVED value, not the bound one: on an update the statement binds the actor
      // resolution and `COALESCE` turns a refusal into the stored account, so this is the only
      // member where the two differ.
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
