/**
 * Statement-and-parameter integration suite for `src/repositories/mysql/mysqlPromotionRepository.ts`.
 *
 * It asserts the EXACT SQL text the adapter emits and the EXACT array of values bound to it, for the
 * seven READ methods of `PromotionRepository`. It touches no database, socket, file or environment
 * file: the adapter takes its executor as a constructor parameter, and a recording double supplied
 * through that parameter is the whole harness. The subject is composed by hand with explicit
 * constructor arguments, so there is no application bootstrap, container, service locator or ambient
 * request scope anywhere in this file.
 *
 * THE SEVEN READS ARE THE WHOLE PORT, and this suite ENFORCES that rather than working around it.
 * There is no eighth member and no sibling suite: a type-level gate at the foot of this file fails to
 * COMPILE if the adapter ever publishes a public member the port does not declare, and a runtime gate
 * beside it fails if `saveRoundingRule` reappears on either the port or the adapter.
 *
 * NET-NEW COVERAGE, WITH NO LEGACY ANTECEDENT. This suite extends no legacy test and must not be
 * presented as parity. `meta/tests/unit/dao/` contains exactly two files - `AccountDAOTest.cfc` and
 * `PaymentDAOTest.cfc` - and both are out of scope; there is no `PromotionDAOTest.cfc`. Nothing in
 * the legacy suite asserts anything about the statements this adapter emits.
 *
 * ONE PLACE WHERE THE SHIPPED CODE DEPARTS FROM THE PLANNING NOTE, AND TWO THIS SUITE NO LONGER
 * NORMALISES
 * ---------------------------------------------------------------------------------------------
 * The genuine departure, asserted as shipped because the SOURCE is the authority over the note:
 *   * The optional `productID` filter was described as appearing in the final UNION branch only. It
 *     appears in ALL SIX branches - `model/dao/PromotionDAO.cfc:L359, L390, L423, L456, L497, L538` -
 *     and the shipped builder reproduces all six. The legacy query is what it is.
 *
 * ★ TWO FURTHER ENTRIES STOOD HERE FOR ONE REVISION AND HAVE BEEN WITHDRAWN, BECAUSE THEY WERE NOT
 * DEPARTURES A SUITE MAY RECORD - THEY WERE CONTRACT BREACHES A SUITE MUST FAIL ON. They read:
 *   * "The port was specified as exposing a second interface, `SalePriceResolver`. The shipped port
 *     does NOT export it - it was relocated module-locally into `src/domain/entities/product.ts`."
 *   * "The port was specified as having seven methods. It has EIGHT: the seven reads plus
 *     `saveRoundingRule`. This suite covers the seven reads."
 *
 * Both have been fixed in `src/**` rather than accommodated here: `SalePriceResolver` is exported from
 * the port again and IS imported below, and the port is seven reads again. The distinction that was
 * lost is the one this suite exists to hold - a suite may record what the SOURCE does that a note did
 * not predict, because the source is the authority for the source's own behaviour. It may not record
 * what the TARGET does that its own specification forbids, because then the specification stops being
 * a specification. Recording the drift in a header made it look accounted for while the assertion
 * below actively confirmed it, which is worse than no assertion: it converted a gate into a witness.
 * The gates at the foot of this file now fail on both, and the second of them fails at COMPILE time.
 *
 * CFML parity [model/dao/PromotionDAO.cfc:L51-L591]: every method name is the legacy camelCase name
 * verbatim, so a reviewer can diff the two surfaces directly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PROMOTION_USE_COUNT_STATEMENTS } from '../../../src/repositories/mysql/sql/promotionUseCounts.sql.js';
import { buildSalePricePromotionRewardsStatement } from '../../../src/repositories/mysql/sql/salePricePromotionRewards.sql.js';
import { MysqlPromotionRepository } from '../../../src/repositories/mysql/mysqlPromotionRepository.js';
import {
  assertMySqlDialect,
  materializedIdPathLikePatternFragment,
  optionGroupOdometerPowerFragment,
  resolveConfiguredDialect,
  resolveDialect,
  singleRowLimitFragments,
} from '../../../src/repositories/mysql/dialect.js';
import { appConfig } from '../../../src/lib/config.js';
import { listFindNoCase, listLen, listToArray } from '../../../src/lib/cfml/list.js';
import { cfBoolean, cfLen } from '../../../src/lib/cfml/truthiness.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import { idPathContainsId } from '../../../src/domain/valueObjects/materializedIdPath.js';
import { makePromotionFixtures } from '../../fixtures/promotionFixtures.js';

import type {
  PreparedStatementExecutor,
  SqlMutationResult,
  SqlRow,
} from '../../../src/repositories/mysql/connection.js';

/*
 * S-07, AND WHY NO ACTOR CONSTANT APPEARS BELOW. A superseded revision of this file supplied
 * `const NO_AUDIT_ACTOR: AuditActorContext = Object.freeze({ adminAccountFlag: false })` as the
 * adapter's second constructor argument, documented as "this file asserts READS, which stamp
 * nothing - so the actor it supplies is the unattributed one". The observation was right and the
 * parameter is now gone: `PromotionRepository` is locked at SEVEN methods, every one of them a
 * read, so this adapter has no write path for an actor to stamp and no longer accepts one. The four
 * adapters that DO write still take it as their second parameter, and their own suites assert it.
 */
import type { DatabaseDialect } from '../../../src/repositories/mysql/dialect.js';
import type {
  PromotionRepository,
  SalePriceResolver,
} from '../../../src/domain/ports/promotionRepository.js';
import type { RoundingRule } from '../../../src/domain/entities/roundingRule.js';

/**
 * Every timestamp this suite constructs itself is an explicit UTC instant expressed as a Zulu
 * literal. No bare `new Date()` and no local-time literal appears anywhere below.
 *
 * The adapter's two clock-reading methods - `getActivePromotionRewards` and
 * `getSalePricePromotionRewardsQuery` - read their instant from an INJECTED request clock, a required
 * third constructor argument, because one request must bind ONE instant across the promotion,
 * sale-price and price-group windows exactly as the legacy's `now()` calls did inside one ColdFusion
 * request. This suite asserts that guarantee two ways: the cases below read the captured instant back
 * OUT of the recorded parameter array and assert every bound timestamp in one invocation is the same
 * instant, and the dedicated cases at the end of each captured-instant block inject a FIXED instant
 * and assert the adapter bound that value rather than a clock of its own. Together they pin
 * "captured once, referenced many times, and captured from the request's clock", which is what
 * `model/dao/PromotionDAO.cfc:L117` and `:L306` guarantee.
 *
 * The default clock this suite composes with is a LIVE one, so every case that does not care about
 * the instant behaves exactly as an unconfigured production request does.
 */
const EXPLICIT_UTC_INSTANT = new Date('2024-06-15T12:00:00.000Z');
const PERIOD_START_INSTANT = new Date('2024-06-01T00:00:00.000Z');
const PERIOD_END_INSTANT = new Date('2024-07-01T00:00:00.000Z');

const OST_NOT_PLACED = 'ostNotPlaced';

const GLOBAL_REWARD_TYPES: readonly string[] = Object.freeze([
  'merchandise',
  'subscription',
  'contentAccess',
]);

/**
 * The DDL verbs no statement in this repository may ever contain. Schema continuity is a binding
 * constraint: the target reads and writes the existing `Sw*` tables unchanged, with no migration, no
 * rename, no new table and no column change.
 */
const DDL_VERBS: readonly string[] = Object.freeze([
  'CREATE',
  'ALTER',
  'DROP',
  'TRUNCATE',
  'RENAME',
]);

/**
 * One recorded call: the statement text and a DEFENSIVE COPY of the values bound to it.
 *
 * JUDGMENT CALL: the array is copied on the way in rather than stored by reference. The adapter
 * builds its bind arrays with `push`, and holding a live reference would let a later push mutate an
 * earlier recording - which would quietly destroy the bind-arity assertions that are the entire
 * point of this suite.
 */
interface RecordedStatement {
  readonly sql: string;
  readonly params: readonly unknown[];
  readonly inTransaction: boolean;
}

const NO_ROWS: readonly SqlRow[] = Object.freeze([]);

const UNUSED_MUTATION_RESULT: SqlMutationResult = Object.freeze({
  affectedRows: 0,
  warningStatus: 0,
});

/**
 * The recording test double that stands in for the MySQL pool.
 *
 * JUDGMENT CALL: hand-written rather than produced by a mocking library. The fixed dependency set
 * contains no mocking library and adding one would breach the exact-pinning standard, but the
 * stronger reason is that this double has to do something a generic mock does not: serve a DIFFERENT
 * canned result set per CALL ORDINAL. `getActivePromotionRewards` issues twenty-six statements for a
 * single reward row, and `getSalePricePromotionRewardsQuery` must be proven to issue exactly ONE -
 * neither claim is expressible without per-ordinal control.
 *
 * JUDGMENT CALL: defined inline in this file and duplicated across the sibling suites rather than
 * extracted to a shared helper. One exported unit per file is the standard, a test file exports
 * nothing, and a shared harness would couple six suites that must be able to fail independently.
 *
 * It implements the narrow executor contract `src/repositories/mysql/connection.ts` publishes - all
 * three members - and nothing else. It opens no connection, imports no driver and reads no
 * environment.
 */
class RecordingExecutor implements PreparedStatementExecutor {
  readonly calls: RecordedStatement[] = [];
  readonly mutationCalls: RecordedStatement[] = [];
  private depth = 0;

  constructor(private readonly cannedResultSets: readonly (readonly SqlRow[])[] = []) {}

  execute(sql: string, params: readonly unknown[] = []): Promise<readonly SqlRow[]> {
    const ordinal = this.calls.length;
    this.calls.push({ sql, params: [...params], inTransaction: this.depth > 0 });

    return Promise.resolve(this.cannedResultSets[ordinal] ?? NO_ROWS);
  }

  executeMutation(sql: string, params: readonly unknown[] = []): Promise<SqlMutationResult> {
    this.mutationCalls.push({ sql, params: [...params], inTransaction: this.depth > 0 });

    return Promise.resolve(UNUSED_MUTATION_RESULT);
  }

  transaction<T>(work: (tx: PreparedStatementExecutor) => Promise<T>): Promise<T> {
    this.depth += 1;

    return work(this).finally(() => {
      this.depth -= 1;
    });
  }
}

/**
 * Narrow one recorded call without a postfix `!` and without a type assertion.
 *
 * `noUncheckedIndexedAccess` types every indexed read as `T | undefined`, and that strictness is
 * doing real work here rather than being a nuisance: a suite that asserted against an index which
 * was never populated would pass vacuously. Throwing on absence turns that into a visible failure.
 */
function requireCall(executor: RecordingExecutor, index: number): RecordedStatement {
  const call = executor.calls[index];

  if (call === undefined) {
    throw new Error(
      `expected a recorded statement at index ${index} but only ${executor.calls.length} were recorded`,
    );
  }

  return call;
}

function requireOnlyCall(executor: RecordingExecutor): RecordedStatement {
  expect(executor.calls).toHaveLength(1);

  return requireCall(executor, 0);
}

function requireParam(call: RecordedStatement, index: number): unknown {
  if (index >= call.params.length) {
    throw new Error(
      `expected a bound parameter at index ${index} but only ${call.params.length} were bound`,
    );
  }

  return call.params[index];
}

function boundInstants(call: RecordedStatement): Date[] {
  return call.params.filter((value): value is Date => value instanceof Date);
}

function occurrencesOf(sql: string, fragment: string): number {
  if (fragment.length === 0) {
    throw new Error('a counted fragment must not be empty');
  }

  let count = 0;
  let cursor = sql.indexOf(fragment);

  while (cursor !== -1) {
    count += 1;
    cursor = sql.indexOf(fragment, cursor + fragment.length);
  }

  return count;
}

function placeholderCount(sql: string): number {
  return occurrencesOf(sql, '?');
}

/**
 * The value rounder the adapter's constructor requires.
 *
 * `RoundingRuleValueRounder` is module-local to the adapter and deliberately un-exported, so it is
 * satisfied structurally rather than by importing a type. It is IDENTITY here: this suite asserts
 * statements and bound parameters, and the rounding step belongs to
 * `model/service/PromotionService.cfc:L1025-L1026` at the service tier, not to the repository. The
 * sale-price statement projects `roundingRuleID` and applies no rule - keeping the split intact is
 * itself one of the assertions below.
 */
const IDENTITY_VALUE_ROUNDER = {
  roundValueByRoundingRule(value: Money, _rule: RoundingRule): Money {
    return value;
  },
};

/**
 * The request clock the subject factory composes with by default.
 *
 * A LIVE clock, so a case that says nothing about the instant exercises the same behaviour an
 * unconfigured production request does; it is the CONSTRUCTION that is explicit here, not the value.
 * Cases asserting on the value pass `fixedClock(...)` instead.
 */
const LIVE_REQUEST_CLOCK = { now: (): Date => new Date() };

/**
 * Compose the subject by hand, exactly as the composition root does.
 *
 * The return type is the PORT, not the class, so every call site below is checked against the
 * SEVEN-member interface rather than against the implementation - which is what makes this an
 * interface-parity assertion rather than an implementation-detail assertion.
 */
function makeSubject(
  cannedResultSets: readonly (readonly SqlRow[])[] = [],
  requestClock: { now: () => Date } = LIVE_REQUEST_CLOCK,
): {
  readonly executor: RecordingExecutor;
  readonly repository: PromotionRepository;
} {
  const executor = new RecordingExecutor(cannedResultSets);

  return {
    executor,
    repository: new MysqlPromotionRepository(executor, IDENTITY_VALUE_ROUNDER, requestClock),
  };
}

/**
 * A clock that answers a FIXED instant, for the cases that assert the adapter honours the one it is
 * given rather than reading a clock of its own.
 *
 * Each call returns a COPY, which is what the composition root does, so a case cannot mutate the
 * shared instant through a value it received.
 */
function fixedClock(instant: Date): { now: () => Date } {
  return { now: (): Date => new Date(instant.getTime()) };
}

const PROVENANCE_DATASOURCE_NAME = 'Slatwall';
const PROVENANCE_DATASOURCE_PORT = '3306';

/**
 * The one placeholder string this suite ever puts into the environment. The `.invalid` TLD is
 * reserved by RFC 2606 and can never resolve, so even a defect that tried to open a connection could
 * not reach a host.
 */
const UNUSED_PLACEHOLDER = 'unused-by-this-suite';

/**
 * The five variables `src/lib/config.ts` requires with no default. `DB_DIALECT` is the only one this
 * suite cares about; the other four are supplied solely because the configuration contract validates
 * as a whole and refuses to hand back a dialect while any required variable is missing.
 *
 * JUDGMENT CALL: configuration is SUPPLIED EXPLICITLY inside the test through `vi.stubEnv`, never
 * read from a real `.env`. `tests/setup.ts` loads `dotenv` best-effort, and `appConfig.load()`
 * memoizes, so `appConfig.reset()` is called on BOTH sides of every stub - structurally required,
 * because a memoized load would otherwise leak one case's dialect into the next.
 */
const REQUIRED_CONFIGURATION: readonly (readonly [string, string])[] = Object.freeze([
  Object.freeze(['DB_HOST', `${UNUSED_PLACEHOLDER}.invalid`] as const),
  Object.freeze(['DB_PORT', PROVENANCE_DATASOURCE_PORT] as const),
  Object.freeze(['DB_NAME', PROVENANCE_DATASOURCE_NAME] as const),
  Object.freeze(['DB_USER', UNUSED_PLACEHOLDER] as const),
  Object.freeze(['DB_PASSWORD', UNUSED_PLACEHOLDER] as const),
  Object.freeze(['DB_TLS_MODE', 'disabled'] as const),
]);

const DIALECT_VARIABLE_NAME = 'DB_DIALECT';

/**
 * The dialect this suite builds statements FOR, supplied as an ARGUMENT.
 *
 * ★ IT IS A LITERAL HERE BECAUSE IT IS A LITERAL IN THE ADAPTER. `MysqlPromotionRepository` declares
 * `STATEMENT_DIALECT` as a module constant pinned by `assertMySqlDialect` - the same shape
 * `mysqlProductRepository.ts`, `mysqlProductTypeRepository.ts` and `mysqlPriceGroupRepository.ts`
 * use - and hands it to `buildSalePricePromotionRewardsStatement`. The builder previously called
 * `resolveConfiguredDialect()` in its own body, so a statement could not be built without the five
 * no-default `DB_*` variables present in `process.env`; every statement-shape assertion below now
 * runs with the process UNCONFIGURED, which is what `tests/setup.ts` requires of a committed suite.
 *
 * The configuration seam is still asserted, in `the dialect contract` describe below - but against
 * the functions that genuinely own it (`resolveConfiguredDialect`, `resolveDialect`) and against the
 * builder's refusal of a non-MySQL ARGUMENT, rather than against an environment read hidden inside a
 * statement builder. `applyConfiguration()`/`applyMySqlConfiguration()` are therefore called only by
 * the cases whose SUBJECT is configuration, never by a describe that merely asserts statement shape,
 * and the "composes with no configuration at all" cases gate against the ambient read ever returning.
 */
const STATEMENT_DIALECT: DatabaseDialect = 'MySQL';

function applyConfiguration(dialectSpelling: string | undefined): void {
  appConfig.reset();

  for (const [name, value] of REQUIRED_CONFIGURATION) {
    vi.stubEnv(name, value);
  }

  vi.stubEnv(DIALECT_VARIABLE_NAME, dialectSpelling);
}

function applyMySqlConfiguration(): void {
  applyConfiguration('mySql');
}

function revertConfiguration(): void {
  vi.unstubAllEnvs();
  appConfig.reset();
}

/**
 * The forty-two aliased columns of the active-reward projection, built with every column PRESENT.
 *
 * Presence matters and absence is not interchangeable with null: the adapter's readers raise on an
 * ABSENT column and accept a null one, which is how a case-variant or short projection is caught at
 * the boundary rather than silently hydrating a half-built entity.
 */
function activeRewardRow(overrides: Readonly<Record<string, unknown>> = {}): SqlRow {
  const row: Record<string, unknown> = {
    spr_promotionRewardID: 'reward-1',
    spr_amount: '12.50',
    spr_amountType: 'percentageOff',
    spr_rewardType: 'merchandise',
    spr_applicableTerm: null,
    spr_maximumUsePerOrder: null,
    spr_maximumUsePerItem: null,
    spr_maximumUsePerQualification: null,
    spr_remoteID: null,
    spr_createdDateTime: null,
    spr_createdByAccountID: null,
    spr_modifiedDateTime: null,
    spr_modifiedByAccountID: null,

    spp_promotionPeriodID: 'period-1',
    spp_startDateTime: PERIOD_START_INSTANT,
    spp_endDateTime: PERIOD_END_INSTANT,
    spp_maximumUseCount: null,
    spp_maximumAccountUseCount: null,
    spp_promotionID: 'promotion-1',
    spp_remoteID: null,
    spp_createdDateTime: null,
    spp_createdByAccountID: null,
    spp_modifiedDateTime: null,
    spp_modifiedByAccountID: null,

    sp_promotionID: 'promotion-1',
    sp_promotionName: 'Ported Promotion',
    sp_promotionSummary: null,
    sp_promotionDescription: null,
    sp_activeFlag: 1,
    sp_defaultImageID: null,
    sp_remoteID: null,
    sp_createdDateTime: null,
    sp_createdByAccountID: null,
    sp_modifiedDateTime: null,
    sp_modifiedByAccountID: null,

    srr_roundingRuleID: null,
    srr_roundingRuleName: null,
    srr_roundingRuleExpression: null,
    srr_roundingRuleDirection: null,
    srr_createdDateTime: null,
    srr_createdByAccountID: null,
    srr_modifiedDateTime: null,
    srr_modifiedByAccountID: null,

    ...overrides,
  };

  return row;
}

function periodQualifierRow(overrides: Readonly<Record<string, unknown>> = {}): SqlRow {
  const row: Record<string, unknown> = {
    promotionQualifierID: 'qualifier-1',
    qualifierType: null,
    minimumOrderQuantity: null,
    maximumOrderQuantity: null,
    minimumOrderSubtotal: null,
    maximumOrderSubtotal: null,
    minimumItemQuantity: null,
    maximumItemQuantity: null,
    minimumItemPrice: null,
    maximumItemPrice: null,
    minimumFulfillmentWeight: null,
    maximumFulfillmentWeight: null,
    rewardMatchingType: null,
    promotionPeriodID: 'period-1',
    remoteID: null,
    createdDateTime: null,
    createdByAccountID: null,
    modifiedDateTime: null,
    modifiedByAccountID: null,
    ...overrides,
  };

  return row;
}

/**
 * One row of the sale-price reduction's EIGHT-column projection.
 *
 * `originalPrice` and `salePrice` are DECIMAL STRINGS, which is what the driver hands over because
 * `decimalNumbers` is left unset on purpose - so `Money` is constructed from the string and no float
 * ever touches a monetary value.
 */
function salePriceRow(overrides: Readonly<Record<string, unknown>> = {}): SqlRow {
  const row: Record<string, unknown> = {
    skuID: 'sku-1',
    originalPrice: '100.00',
    discountLevel: 'sku',
    salePriceDiscountType: 'percentageOff',
    salePrice: '87.50',
    roundingRuleID: null,
    salePriceExpirationDateTime: null,
    promotionID: 'promotion-1',
    ...overrides,
  };

  return row;
}

function roundingRuleRow(overrides: Readonly<Record<string, unknown>> = {}): SqlRow {
  const row: Record<string, unknown> = {
    roundingRuleID: 'rounding-rule-1',
    roundingRuleName: 'Nearest ninety-nine',
    roundingRuleExpression: '.99',
    roundingRuleDirection: 'Closest',
    createdDateTime: null,
    createdByAccountID: null,
    modifiedDateTime: null,
    modifiedByAccountID: null,
    ...overrides,
  };

  return row;
}

function countRow(count: number): SqlRow {
  return { count };
}

function oneRewardRowThenNoLinks(): readonly (readonly SqlRow[])[] {
  return [[activeRewardRow()]];
}

function linkTableOf(call: RecordedStatement): string {
  const lines = call.sql.split('\n');
  const fromIndex = lines.indexOf('FROM');
  const tableLine = fromIndex === -1 ? undefined : lines[fromIndex + 1];

  if (tableLine === undefined) {
    throw new Error(`statement has no FROM target line: ${call.sql}`);
  }

  return tableLine.trim();
}

/**
 * The reward's OPAQUE-IDENTIFIER link sets, in the frozen order the adapter reads them.
 *
 * ★★ THREE. `FulfillmentMethod`, `ShippingMethod` and `AddressZone` are out-of-scope entities, so
 * their link rows are carried as bare identifier strings. The ten catalog-typed sets are read
 * separately, once, and are listed in `REWARD_CATALOG_TABLES`; `eligiblePriceGroups` is the
 * fourteenth collection and is read LAST because it is reward-only. `SwPromoReward` carries FOURTEEN
 * many-to-many collections in total [model/entity/PromotionReward.cfc:L68-L88], and 3 + 10 + 1
 * accounts for all of them exactly once.
 *
 * ★ QUOTE-THEN-REVISE. This constant used to list THIRTEEN tables - the three opaque ones followed by
 * the ten catalog ones - and was documented as "THIRTEEN: the three whose members are out-of-scope
 * entities and collapse to opaque identifiers, then the ten catalog sets." It listed thirteen because
 * the adapter READ thirteen and then discarded ten of the resulting groupings, re-reading the same ten
 * tables through the catalog path a statement later. The suite therefore asserted a duplicated
 * sequence as though it were the intended fetch shape, which is how the duplication survived review.
 */
const REWARD_LINK_TABLES: readonly string[] = Object.freeze([
  'SwPromoRewardFulfillmentMethod',
  'SwPromoRewardShippingMethod',
  'SwPromoRewardShipAddressZone',
]);

const REWARD_CATALOG_TABLES: readonly string[] = Object.freeze([
  'SwPromoRewardBrand',
  'SwPromoRewardOption',
  'SwPromoRewardSku',
  'SwPromoRewardProduct',
  'SwPromoRewardProductType',
  'SwPromoRewardExclBrand',
  'SwPromoRewardExclOption',
  'SwPromoRewardExclSku',
  'SwPromoRewardExclProduct',
  'SwPromoRewardExclProductType',
]);

const REWARD_ELIGIBLE_PRICE_GROUP_TABLE = 'SwPromoRewardEligiblePriceGrp';

/**
 * The qualifier's three opaque-identifier link sets.
 *
 * Derived from the reward's by name substitution, which is the point: the two owner kinds share every
 * table name but the `SwPromoReward` / `SwPromoQual` prefix, so deriving rather than re-listing makes
 * a divergence impossible to introduce by typo. `SwPromoQual` carries THIRTEEN collections in total -
 * these three plus the ten in `QUALIFIER_CATALOG_TABLES` - one fewer than the reward, because
 * `eligiblePriceGroups` is reward-only.
 */
const QUALIFIER_LINK_TABLES: readonly string[] = Object.freeze(
  REWARD_LINK_TABLES.map((table) => table.replace('SwPromoReward', 'SwPromoQual')),
);

const QUALIFIER_CATALOG_TABLES: readonly string[] = Object.freeze(
  REWARD_CATALOG_TABLES.map((table) => table.replace('SwPromoReward', 'SwPromoQual')),
);

const PERIOD_QUALIFIER_TABLE = 'SwPromoQual';

const ACTIVE_REWARD_TABLES: readonly string[] = Object.freeze([
  'SwPromoReward spr',
  'SwPromotionPeriod spp on spr.promotionPeriodID = spp.promotionPeriodID',
  'SwPromotion sp on spp.promotionID = sp.promotionID',
  'SwRoundingRule srr on spr.roundingRuleID = srr.roundingRuleID',
]);

const NO_PROMOTION_CODE_FRAGMENT =
  ' AND ( NOT EXISTS ( SELECT c.promotionCodeID FROM SwPromotionCode c WHERE c.promotionID = sp.promotionID )';

const QUALIFIER_EXISTS_FRAGMENT =
  ' AND ( EXISTS ( SELECT pq.promotionQualifierID FROM SwPromoQual pq WHERE pq.promotionPeriodID = spp.promotionPeriodID )';

function promotionCodeExistsFragment(codePlaceholders: string): string {
  return ` OR EXISTS ( SELECT c.promotionCodeID FROM SwPromotionCode c WHERE c.promotionID = sp.promotionID AND c.promotionCode IN (${codePlaceholders}) AND (c.startDateTime is null or c.startDateTime < ?) AND (c.endDateTime is null or c.endDateTime > ?) )`;
}

function noQualificationRequiredFragment(typePlaceholders: string): string {
  return ` OR spr.rewardType IN (${typePlaceholders})`;
}

function placeholderList(count: number): string {
  if (count < 1) {
    throw new Error('an IN list with no elements is a MySQL syntax error and is never emitted');
  }

  return Array.from({ length: count }, () => '?').join(', ');
}

/**
 * Reproduce `noQualRequiredList` the way `model/dao/PromotionDAO.cfc:L56-L62` builds it: seed with an
 * empty string, then test for `"fulfillment"` and append it, then do the same for `"order"`. The
 * order of the two appends is load-bearing because it decides the bind order.
 *
 * Derived through `listFindNoCase` from `src/lib/cfml/list.js` rather than hardcoded, so the CFML
 * case-insensitive list semantics are exercised rather than assumed.
 */
function expectedNoQualRequiredTypes(rewardTypeList: string): string[] {
  const collected: string[] = [];

  if (listFindNoCase(rewardTypeList, 'fulfillment') > 0) {
    collected.push('fulfillment');
  }

  if (listFindNoCase(rewardTypeList, 'order') > 0) {
    collected.push('order');
  }

  return collected;
}

describe('MysqlPromotionRepository.getActivePromotionRewards - the preserved absence of ORDER BY', () => {
  // LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L51-L132]: getActivePromotionRewards has no ORDER BY,
  // so reward iteration order is whatever the engine returns; the promotion engine's use-limit
  // ledger (model/service/PromotionService.cfc:L297) is order-dependent, making the outcome
  // non-deterministic at the boundary of a tie.
  // Preserved deliberately; do not fix without a product decision.
  //
  // A case-insensitive search for `order by` across all 593 lines of the legacy DAO returns ZERO
  // matches. The characterisation suites under tests/unit/services/promotion/* therefore supply
  // their reward arrays EXPLICITLY rather than depending on this query's ordering - which is the
  // only way to test an order-dependent algorithm whose input order is undefined.
  it('emits no ORDER BY clause in any of the four conditional shapes', async () => {
    const shapes: readonly (readonly [string, string, boolean])[] = [
      ['merchandise', '', false],
      ['merchandise', '', true],
      ['merchandise', 'CODE-A,CODE-B', false],
      ['merchandise,order,fulfillment', 'CODE-A,CODE-B', true],
    ];

    for (const [rewardTypeList, promotionCodeList, qualificationRequired] of shapes) {
      const { executor, repository } = makeSubject();

      await repository.getActivePromotionRewards(
        rewardTypeList,
        promotionCodeList,
        qualificationRequired,
      );

      const { sql } = requireOnlyCall(executor);

      expect(sql).not.toMatch(/order\s+by/i);
      expect(sql).not.toMatch(/\bLIMIT\b/i);
      expect(sql).not.toMatch(/\bTOP\b/i);
      expect(sql).not.toMatch(/\bROWNUM\b/i);
    }
  });

  it('emits no deterministic sort even when the reward projection would allow one', async () => {
    const { executor, repository } = makeSubject();

    await repository.getActivePromotionRewards('merchandise', '', false);

    const { sql } = requireOnlyCall(executor);

    expect(sql).toContain('spr.promotionRewardID as spr_promotionRewardID');
    expect(sql).toContain('spr.createdDateTime as spr_createdDateTime');
    expect(sql).toContain('spp.promotionPeriodID as spp_promotionPeriodID');
    expect(occurrencesOf(sql.toLowerCase(), 'order by')).toBe(0);
  });
});

describe('MysqlPromotionRepository.getActivePromotionRewards - the captured instant', () => {
  // CFML parity [model/dao/PromotionDAO.cfc:L117]: `now = now()` is captured ONCE into the parameter
  // struct and referenced by NAME at L73, L75 and twice inside each conditional OR EXISTS fragment
  // appended at L90 and L110. Named HQL parameters do not survive the port - `namedPlaceholders` is
  // OFF on the pool - so the single captured instant must be bound POSITIONALLY at every occurrence,
  // in clause order.
  it('binds two identical instants when neither promotion-code fragment is emitted', async () => {
    for (const qualificationRequired of [false, true]) {
      const { executor, repository } = makeSubject();

      await repository.getActivePromotionRewards('merchandise', '', qualificationRequired);

      const call = requireOnlyCall(executor);
      const instants = boundInstants(call);

      expect(instants).toHaveLength(2);
      expect(new Set(instants.map((instant) => instant.getTime())).size).toBe(1);
    }
  });

  it('binds four identical instants when exactly one promotion-code fragment is emitted', async () => {
    const { executor, repository } = makeSubject();

    await repository.getActivePromotionRewards('merchandise', 'CODE-A,CODE-B', false);

    const call = requireOnlyCall(executor);
    const instants = boundInstants(call);

    expect(instants).toHaveLength(4);
    expect(new Set(instants.map((instant) => instant.getTime())).size).toBe(1);
  });

  it('binds six identical instants when both promotion-code fragments are emitted', async () => {
    const { executor, repository } = makeSubject();

    await repository.getActivePromotionRewards('merchandise', 'CODE-A,CODE-B', true);

    const call = requireOnlyCall(executor);
    const instants = boundInstants(call);

    expect(instants).toHaveLength(6);
    expect(new Set(instants.map((instant) => instant.getTime())).size).toBe(1);
  });

  it('binds the INJECTED instant, not a clock of its own', async () => {
    // THE REGRESSION THIS CASE EXISTS FOR. An adapter that read `new Date()` here would bind an
    // instant of its own, and one composed request could then evaluate the promotion window, the
    // sale-price window and the subscription-eligibility window against three different moments -
    // which decides whether a reward applies and therefore what a customer is charged. The legacy
    // could not do that: every `now()` in [model/dao/PromotionDAO.cfc] read one CFML request's clock.
    const { executor, repository } = makeSubject([], fixedClock(EXPLICIT_UTC_INSTANT));

    await repository.getActivePromotionRewards('merchandise', 'CODE-A,CODE-B', true);

    const instants = boundInstants(requireOnlyCall(executor));

    expect(instants).toHaveLength(6);

    for (const instant of instants) {
      expect(instant.getTime()).toBe(EXPLICIT_UTC_INSTANT.getTime());
    }
  });

  it('never emits SQL NOW(), so the instant is always a bound value', async () => {
    const { executor, repository } = makeSubject();

    await repository.getActivePromotionRewards('merchandise', 'CODE-A', true);

    const { sql, params } = requireOnlyCall(executor);

    expect(sql).not.toMatch(/\bNOW\s*\(/i);
    expect(sql).not.toMatch(/\bCURRENT_TIMESTAMP\b/i);
    expect(sql).not.toMatch(/\bSYSDATE\b/i);
    expect(params.filter((value) => value instanceof Date)).not.toHaveLength(0);
  });
});

describe('MysqlPromotionRepository.getActivePromotionRewards - the three distinct date windows', () => {
  // CFML parity: THREE DIFFERENT date windows exist in this slice and must never be conflated.
  //   1. This HQL window is EXCLUSIVE at both ends - `startDateTime < :now` and `endDateTime > :now`
  //      [model/dao/PromotionDAO.cfc:L73, L75], and the promotion-code fragment repeats the same
  //      strict comparisons [model/dao/PromotionDAO.cfc:L90, L110].
  //   2. The raw-SQL sale-price gate is INCLUSIVE at both ends - `<=` and `>=`
  //      [model/dao/PromotionDAO.cfc:L317, L319]. Asserted in the sale-price group below.
  //   3. `PromotionPeriod.isCurrent()` [model/entity/PromotionPeriod.cfc:L78] is start-inclusive and
  //      end-exclusive, and is asserted by the entity's own unit suite.
  it('compares the period window strictly at both ends', async () => {
    const { executor, repository } = makeSubject();

    await repository.getActivePromotionRewards('merchandise', '', false);

    const { sql } = requireOnlyCall(executor);

    expect(sql).toContain('(spp.startDateTime is null or spp.startDateTime < ?)');
    expect(sql).toContain('(spp.endDateTime is null or spp.endDateTime > ?)');
    expect(sql).not.toContain('spp.startDateTime <= ?');
    expect(sql).not.toContain('spp.endDateTime >= ?');
  });

  it('compares the promotion-code window strictly at both ends', async () => {
    const { executor, repository } = makeSubject();

    await repository.getActivePromotionRewards('merchandise', 'CODE-A', false);

    const { sql } = requireOnlyCall(executor);

    expect(sql).toContain('(c.startDateTime is null or c.startDateTime < ?)');
    expect(sql).toContain('(c.endDateTime is null or c.endDateTime > ?)');
    expect(sql).not.toContain('c.startDateTime <= ?');
    expect(sql).not.toContain('c.endDateTime >= ?');
  });
});

describe('MysqlPromotionRepository.getActivePromotionRewards - activeFlag binding shape', () => {
  // CFML parity [model/dao/PromotionDAO.cfc:L118]: this query binds `activeFlag = 1` as a NUMERIC 1
  // through the HQL parameter struct, while the raw-SQL gate at L321 binds the same logical value as
  // `cfsqltype="cf_sql_bit" value="1"`. The two binding shapes disagree WITHIN ONE FILE, and both are
  // preserved. The sale-price group below asserts the other half of the pair.
  it('binds activeFlag as the number 1, never as a boolean and never inline', async () => {
    const { executor, repository } = makeSubject();

    await repository.getActivePromotionRewards('merchandise', '', false);

    const call = requireOnlyCall(executor);

    expect(call.sql).toContain('sp.activeFlag = ?');
    expect(call.sql).not.toContain('sp.activeFlag = 1');
    expect(call.sql).not.toMatch(/activeFlag\s*=\s*(true|TRUE)/);
    expect(requireParam(call, call.params.length - 1)).toBe(1);
    expect(requireParam(call, call.params.length - 1)).not.toBe(true);
  });
});

describe('MysqlPromotionRepository.getActivePromotionRewards - the noQualRequiredList twin condition', () => {
  // NOT A DEFECT, and stated explicitly so no future reader mistakes it for one. The clause
  // ` OR spr.rewardType IN (:noQualRequiredList)` is appended only when `qualificationRequired` AND
  // `len(noQualRequiredList)` [model/dao/PromotionDAO.cfc:L94-L99], and the parameter is bound under
  // the SAME twin condition [model/dao/PromotionDAO.cfc:L121-L123]. The two conditions agree, so the
  // clause and its parameters appear together or not at all - which is exactly what a correct
  // conditional bind looks like.
  it('emits the clause and its parameters together when both halves of the twin condition hold', async () => {
    const rewardTypeList = 'merchandise,order,fulfillment';
    const expectedTypes = expectedNoQualRequiredTypes(rewardTypeList);

    expect(cfLen(expectedTypes)).toBeGreaterThan(0);

    const { executor, repository } = makeSubject();

    await repository.getActivePromotionRewards(rewardTypeList, '', true);

    const call = requireOnlyCall(executor);

    expect(call.sql).toContain(
      noQualificationRequiredFragment(placeholderList(expectedTypes.length)),
    );

    for (const type of expectedTypes) {
      expect(call.params).toContain(type);
    }
  });

  it('omits the clause and its parameters when qualificationRequired is false', async () => {
    const rewardTypeList = 'merchandise,order,fulfillment';
    const expectedTypes = expectedNoQualRequiredTypes(rewardTypeList);
    const { executor, repository } = makeSubject();

    await repository.getActivePromotionRewards(rewardTypeList, '', false);

    const call = requireOnlyCall(executor);

    expect(call.sql).not.toContain(' OR spr.rewardType IN (');

    expect(call.params.filter((value) => value === 'fulfillment')).toHaveLength(1);
    expect(call.params.filter((value) => value === 'order')).toHaveLength(1);
    expect(call.params).toHaveLength(listLen(rewardTypeList) + 3);
    expect(expectedTypes).toHaveLength(2);
  });

  it('omits the clause when the reward types contain neither fulfillment nor order', async () => {
    const rewardTypeList = 'merchandise,subscription';

    expect(expectedNoQualRequiredTypes(rewardTypeList)).toHaveLength(0);

    const { executor, repository } = makeSubject();

    await repository.getActivePromotionRewards(rewardTypeList, '', true);

    const call = requireOnlyCall(executor);

    expect(call.sql).not.toContain(' OR spr.rewardType IN (');
    expect(call.params).toHaveLength(listLen(rewardTypeList) + 3);
  });

  it('binds the two no-qualification-required types in the legacy append order', async () => {
    const { executor, repository } = makeSubject();

    await repository.getActivePromotionRewards('order,merchandise,fulfillment', '', true);

    const call = requireOnlyCall(executor);
    const fulfillmentIndexes = call.params
      .map((value, index) => ({ value, index }))
      .filter((entry) => entry.value === 'fulfillment')
      .map((entry) => entry.index);
    const orderIndexes = call.params
      .map((value, index) => ({ value, index }))
      .filter((entry) => entry.value === 'order')
      .map((entry) => entry.index);

    expect(fulfillmentIndexes).toHaveLength(2);
    expect(orderIndexes).toHaveLength(2);

    const lastFulfillment = fulfillmentIndexes[1];
    const lastOrder = orderIndexes[1];

    if (lastFulfillment === undefined || lastOrder === undefined) {
      throw new Error(
        'both types must be bound twice: once by the base predicate, once by the clause',
      );
    }

    expect(lastFulfillment).toBeLessThan(lastOrder);
  });
});

describe('MysqlPromotionRepository.getActivePromotionRewards - the doubled promotion-code fragment', () => {
  // CFML parity [model/dao/PromotionDAO.cfc:L89-L92 and L109-L112]: the SAME `OR EXISTS` promotion-code
  // fragment is appended TWICE - once inside the `qualificationRequired` group and once inside the
  // unconditional `NOT EXISTS` group - and both appends are gated on `len(promotionCodeList)`.
  it('emits the fragment twice and binds its parameters twice when a code list is supplied', async () => {
    const promotionCodeList = 'CODE-A,CODE-B';
    const codes = listToArray(promotionCodeList);
    const { executor, repository } = makeSubject();

    await repository.getActivePromotionRewards('merchandise', promotionCodeList, true);

    const call = requireOnlyCall(executor);
    const fragment = promotionCodeExistsFragment(placeholderList(codes.length));

    expect(occurrencesOf(call.sql, fragment)).toBe(2);

    for (const code of codes) {
      expect(call.params.filter((value) => value === code)).toHaveLength(2);
    }

    expect(boundInstants(call)).toHaveLength(6);
  });

  it('emits the fragment once - inside the unconditional group only - when qualification is not required', async () => {
    const promotionCodeList = 'CODE-A,CODE-B';
    const codes = listToArray(promotionCodeList);
    const { executor, repository } = makeSubject();

    await repository.getActivePromotionRewards('merchandise', promotionCodeList, false);

    const call = requireOnlyCall(executor);
    const fragment = promotionCodeExistsFragment(placeholderList(codes.length));

    expect(occurrencesOf(call.sql, fragment)).toBe(1);
    expect(call.sql).toContain(NO_PROMOTION_CODE_FRAGMENT);
    expect(call.sql).not.toContain(QUALIFIER_EXISTS_FRAGMENT);

    for (const code of codes) {
      expect(call.params.filter((value) => value === code)).toHaveLength(1);
    }

    expect(boundInstants(call)).toHaveLength(4);
  });

  it('emits neither occurrence and binds no code when the code list is empty', async () => {
    const { executor, repository } = makeSubject();

    await repository.getActivePromotionRewards('merchandise', '', true);

    const call = requireOnlyCall(executor);

    expect(call.sql).not.toContain(' OR EXISTS ( SELECT c.promotionCodeID');
    expect(call.sql).toContain(QUALIFIER_EXISTS_FRAGMENT);
    expect(call.sql).toContain(NO_PROMOTION_CODE_FRAGMENT);
    expect(call.params).toHaveLength(4);
  });

  it('always emits the unconditional NOT EXISTS group, in both qualification branches', async () => {
    for (const qualificationRequired of [false, true]) {
      const { executor, repository } = makeSubject();

      await repository.getActivePromotionRewards('merchandise', '', qualificationRequired);

      const { sql } = requireOnlyCall(executor);

      expect(occurrencesOf(sql, NO_PROMOTION_CODE_FRAGMENT)).toBe(1);

      expect(occurrencesOf(sql, '\n )')).toBe(qualificationRequired ? 2 : 1);
    }
  });
});

describe('MysqlPromotionRepository.getActivePromotionRewards - IN list expansion', () => {
  // MySQL prepared statements do NOT expand `IN (?)` from an array, so every comma list must be split
  // into one placeholder per element with one bound value each. An empty `IN ()` is a syntax error, so
  // it must never be emitted at all.
  it('expands rewardTypeList to one placeholder per element at one, two and three elements', async () => {
    const lists: readonly string[] = [
      'merchandise',
      'merchandise,subscription',
      'merchandise,subscription,contentAccess',
    ];

    for (const rewardTypeList of lists) {
      const expectedTypes = listToArray(rewardTypeList);
      const { executor, repository } = makeSubject();

      await repository.getActivePromotionRewards(rewardTypeList, '', false);

      const call = requireOnlyCall(executor);

      expect(call.sql).toContain(`spr.rewardType IN (${placeholderList(expectedTypes.length)})`);
      expect(expectedTypes).toHaveLength(listLen(rewardTypeList));

      for (const [offset, type] of expectedTypes.entries()) {
        expect(requireParam(call, offset)).toBe(type);
      }
    }
  });

  it('expands promotionCodeList to one placeholder per element at one, two and three elements', async () => {
    const lists: readonly string[] = ['CODE-A', 'CODE-A,CODE-B', 'CODE-A,CODE-B,CODE-C'];

    for (const promotionCodeList of lists) {
      const codes = listToArray(promotionCodeList);
      const { executor, repository } = makeSubject();

      await repository.getActivePromotionRewards('merchandise', promotionCodeList, true);

      const call = requireOnlyCall(executor);

      expect(occurrencesOf(call.sql, `c.promotionCode IN (${placeholderList(codes.length)})`)).toBe(
        2,
      );

      expect(placeholderCount(call.sql)).toBe(1 + codes.length * 2 + 1 + 6);
      expect(call.params).toHaveLength(placeholderCount(call.sql));
    }
  });

  it('expands noQualRequiredList to one placeholder per element at its reachable lengths', async () => {
    const cases: readonly (readonly [string, number])[] = [
      ['merchandise', 0],
      ['merchandise,order', 1],
      ['merchandise,order,fulfillment', 2],
    ];

    for (const [rewardTypeList, expectedLength] of cases) {
      const expectedTypes = expectedNoQualRequiredTypes(rewardTypeList);

      expect(expectedTypes).toHaveLength(expectedLength);

      const { executor, repository } = makeSubject();

      await repository.getActivePromotionRewards(rewardTypeList, '', true);

      const call = requireOnlyCall(executor);

      if (expectedLength === 0) {
        expect(call.sql).not.toContain(' OR spr.rewardType IN (');
      } else {
        expect(call.sql).toContain(
          noQualificationRequiredFragment(placeholderList(expectedLength)),
        );
      }

      expect(call.params).toHaveLength(listLen(rewardTypeList) + 3 + expectedLength);
    }
  });

  it('never emits an empty IN list', async () => {
    const shapes: readonly (readonly [string, string, boolean])[] = [
      ['merchandise', '', false],
      ['merchandise', '', true],
      ['merchandise,order,fulfillment', '', true],
      ['merchandise', 'CODE-A', true],
    ];

    for (const [rewardTypeList, promotionCodeList, qualificationRequired] of shapes) {
      const { executor, repository } = makeSubject();

      await repository.getActivePromotionRewards(
        rewardTypeList,
        promotionCodeList,
        qualificationRequired,
      );

      const { sql } = requireOnlyCall(executor);

      expect(sql).not.toContain('IN ()');
      expect(sql).not.toContain('IN ( )');
    }
  });

  it('short-circuits with no statement at all when the reward type list is empty', async () => {
    const { executor, repository } = makeSubject();

    const rewards = await repository.getActivePromotionRewards('', 'CODE-A', true);

    expect(cfLen('')).toBe(0);
    expect(executor.calls).toHaveLength(0);
    expect(executor.mutationCalls).toHaveLength(0);
    expect(rewards).toHaveLength(0);
  });
});

describe('MysqlPromotionRepository.getActivePromotionRewards - eager materialization', () => {
  // CFML parity [model/dao/PromotionDAO.cfc:L65-L69]: the legacy HQL carries TWO `INNER JOIN FETCH`
  // clauses - `spr.promotionPeriod spp` and `spp.promotion sp` - which are two of exactly five true
  // JOIN FETCH sites in the whole in-scope DAO layer.
  //
  // Hibernate lazy collections have no equivalent in a driver-only stack, and the target does not
  // SIMULATE laziness: every association a synchronous entity method traverses is materialized at the
  // repository boundary, with the fetch shape chosen once per repository method. That converts every
  // implicit lazy load into an explicit statement, which is why the statement COUNT below is a
  // meaningful assertion rather than an implementation detail.
  //
  // C7/B7 note: the statement count is asserted as a STRUCTURAL fact - which associations are
  // materialized and in what order - and never as a cost, a plan or an efficiency claim.
  it('joins the period, the promotion and the rounding rule in the one projection statement', async () => {
    const { executor, repository } = makeSubject(oneRewardRowThenNoLinks());

    await repository.getActivePromotionRewards('merchandise', '', false);

    const { sql } = requireCall(executor, 0);

    for (const table of ACTIVE_REWARD_TABLES) {
      expect(sql).toContain(table);
    }

    expect(sql).toContain('  INNER JOIN\n    SwPromotionPeriod spp');
    expect(sql).toContain('  INNER JOIN\n    SwPromotion sp');
    expect(sql).toContain('  LEFT JOIN\n    SwRoundingRule srr');
  });

  it('reads the fourteen reward link sets EXACTLY ONCE EACH, in a frozen order', async () => {
    const { executor, repository } = makeSubject(oneRewardRowThenNoLinks());

    await repository.getActivePromotionRewards('merchandise', '', false);

    const expectedTables: readonly string[] = [
      ...REWARD_LINK_TABLES,
      ...REWARD_CATALOG_TABLES,
      REWARD_ELIGIBLE_PRICE_GROUP_TABLE,
      PERIOD_QUALIFIER_TABLE,
    ];

    expect(executor.calls).toHaveLength(1 + expectedTables.length);

    for (const [offset, table] of expectedTables.entries()) {
      expect(linkTableOf(requireCall(executor, offset + 1))).toBe(table);
    }

    // `SwPromoReward` declares FOURTEEN many-to-many collections
    // [model/entity/PromotionReward.cfc:L68-L88]: three opaque-identifier sets, ten catalog-typed
    // sets, and `eligiblePriceGroups`, which is read last because it is reward-only.
    expect(
      new Set([...REWARD_LINK_TABLES, ...REWARD_CATALOG_TABLES, REWARD_ELIGIBLE_PRICE_GROUP_TABLE])
        .size,
    ).toBe(14);

    // ★★★ NO TABLE IS VISITED TWICE, which is the property the whole rewrite exists to establish.
    // The expected sequence above is a SET as well as a list: fourteen collection statements plus the
    // period-qualifier statement, all distinct. An earlier revision read the ten catalog tables once
    // into a grouping the caller discarded and then again through the catalog path, so this same
    // invocation issued twenty-five collection statements for fourteen collections. Comparing the
    // emitted table sequence against its own deduplication is what makes a regression to that shape a
    // test failure rather than a review question.
    const emittedLinkTables = executor.calls
      .slice(1)
      .map((call) => linkTableOf(call))
      .filter((table) => table !== PERIOD_QUALIFIER_TABLE);

    expect(emittedLinkTables).toHaveLength(14);
    expect(new Set(emittedLinkTables).size).toBe(14);
  });

  it('expands to the qualifier link sets when the period-qualifier read returns a row', async () => {
    const cannedResultSets: (readonly SqlRow[])[] = [];
    const qualifierReadOrdinal = 1 + REWARD_LINK_TABLES.length + REWARD_CATALOG_TABLES.length + 1;

    cannedResultSets[0] = [activeRewardRow()];
    cannedResultSets[qualifierReadOrdinal] = [periodQualifierRow()];

    const { executor, repository } = makeSubject(cannedResultSets);

    await repository.getActivePromotionRewards('merchandise', '', false);

    const expectedTables: readonly string[] = [
      ...REWARD_LINK_TABLES,
      ...REWARD_CATALOG_TABLES,
      REWARD_ELIGIBLE_PRICE_GROUP_TABLE,
      PERIOD_QUALIFIER_TABLE,
      ...QUALIFIER_LINK_TABLES,
      ...QUALIFIER_CATALOG_TABLES,
    ];

    expect(executor.calls).toHaveLength(1 + expectedTables.length);

    for (const [offset, table] of expectedTables.entries()) {
      expect(linkTableOf(requireCall(executor, offset + 1))).toBe(table);
    }

    // `SwPromoQual` declares THIRTEEN collections - three opaque-identifier sets plus ten
    // catalog-typed ones, one fewer than the reward because `eligiblePriceGroups` is reward-only. No
    // `SwPromoQualEligiblePriceGrp` statement is ever issued.
    expect(new Set([...QUALIFIER_LINK_TABLES, ...QUALIFIER_CATALOG_TABLES]).size).toBe(13);
    expect(executor.calls.map((call) => call.sql).join('\n')).not.toContain(
      'SwPromoQualEligiblePriceGrp',
    );

    // ★★★ TWENTY-NINE STATEMENTS FOR THE FULLY EXPANDED READ, and every collection visited exactly
    // once: 1 projection + 3 + 10 + 1 reward sets + 1 period-qualifier projection + 3 + 10 qualifier
    // sets. This is the ceiling `hydrateActiveRewards` documents. Before the duplication was removed
    // the same input produced FORTY-NINE, twenty of them discarded.
    expect(executor.calls).toHaveLength(29);

    const emittedLinkTables = executor.calls
      .slice(1)
      .map((call) => linkTableOf(call))
      .filter((table) => table !== PERIOD_QUALIFIER_TABLE);

    expect(emittedLinkTables).toHaveLength(27);
    expect(new Set(emittedLinkTables).size).toBe(27);
  });

  it('issues only the projection statement when the projection returns no rows', async () => {
    const { executor, repository } = makeSubject([[]]);

    const rewards = await repository.getActivePromotionRewards('merchandise', '', false);

    expect(executor.calls).toHaveLength(1);
    expect(rewards).toHaveLength(0);
  });

  it('hands back a reward whose associations are populated rather than absent', async () => {
    const { executor, repository } = makeSubject(oneRewardRowThenNoLinks());

    const rewards = await repository.getActivePromotionRewards('merchandise', '', false);
    const [reward] = rewards;

    if (reward === undefined) {
      throw new Error('the canned projection row must hydrate exactly one reward');
    }

    expect(reward.getPromotionRewardID()).toBe('reward-1');

    const period = reward.getPromotionPeriod();

    if (period === undefined) {
      throw new Error('the INNER JOIN FETCH of the period must be materialized, never left absent');
    }

    expect(period.getPromotionPeriodID()).toBe('period-1');
    expect(period.getPromotion()?.getPromotionID()).toBe('promotion-1');
    expect(period.getPromotionQualifiers()).toHaveLength(0);

    // The rounding rule arrives from the LEFT JOIN in the SAME projection statement, so the hydration
    // factory runs once per row and reaches nothing outward to finish the job. That is the observable
    // consequence of retiring the service locator: the legacy entities called `getService(...)` from
    // inside themselves [model/entity/Sku.cfc:L258, L379, L421, L436 and
    // model/entity/Product.cfc:L343, L367, L519], and here the collaborators arrive by constructor
    // injection instead - there is no second statement that fetches the rule on demand.
    expect(requireCall(executor, 0).sql).toContain('  LEFT JOIN\n    SwRoundingRule srr');
    expect(
      executor.calls.filter(({ sql }) => sql.includes('FROM\n    SwRoundingRule')),
    ).toHaveLength(0);

    expect(reward.getEligiblePriceGroups()).toEqual([]);
    expect(reward.getFulfillmentMethodIDs()).toEqual([]);
    expect(reward.getShippingMethodIDs()).toEqual([]);
    expect(reward.getShippingAddressZoneIDs()).toEqual([]);
    expect(reward.getBrands()).toEqual([]);
    expect(reward.getOptions()).toEqual([]);
    expect(reward.getSkus()).toEqual([]);
    expect(reward.getProducts()).toEqual([]);
    expect(reward.getProductTypes()).toEqual([]);
    expect(reward.getExcludedBrands()).toEqual([]);
    expect(reward.getExcludedOptions()).toEqual([]);
    expect(reward.getExcludedSkus()).toEqual([]);
    expect(reward.getExcludedProducts()).toEqual([]);
    expect(reward.getExcludedProductTypes()).toEqual([]);

    expect(reward.getRoundingRule()).toBeUndefined();
  });

  it('runs the hydration factory once per projection row', async () => {
    const { executor, repository } = makeSubject([
      [
        activeRewardRow({ spr_promotionRewardID: 'reward-1' }),
        activeRewardRow({ spr_promotionRewardID: 'reward-2' }),
      ],
    ]);

    const rewards = await repository.getActivePromotionRewards('merchandise', '', false);

    expect(rewards.map((reward) => reward.getPromotionRewardID())).toEqual([
      'reward-1',
      'reward-2',
    ]);

    const firstLinkRead = requireCall(executor, 1);

    expect(firstLinkRead.params).toEqual(['reward-1', 'reward-2']);
    expect(firstLinkRead.sql).toContain(`IN (${placeholderList(2)})`);
  });

  it('constructs the subject with explicit arguments and no locator of any kind', () => {
    // superuser elevation [meta/tests/unit/SlatwallUnitTestBase.cfc]. None of that is reproduced.
    // THREE explicit constructor arguments are the entire wiring, and the third is the one that
    // makes the point: the REQUEST CLOCK is REQUIRED rather than defaulted, so a construction site
    // cannot silently opt back into a private clock and let one request's pricing reads disagree
    // about what "now" means.
    //
    // ★ QUOTE-THEN-REVISE. This case asserted FOUR arguments and named "the AUDIT ACTOR (S-07)" as
    // the second of them, calling it "the closest thing to that elevated account the target has".
    // That was true of a revision in which this adapter still carried a rounding-rule WRITE. The
    // port is locked at seven READS and declares no save or delete, so the write, both of its
    // statement constants and the actor that stamped them are all withdrawn - an actor with nothing
    // to stamp is an unused field, not a security control. The four write-bearing adapters keep
    // theirs, and each of their suites still asserts it in second position.
    const executor = new RecordingExecutor();
    const repository: PromotionRepository = new MysqlPromotionRepository(
      executor,
      IDENTITY_VALUE_ROUNDER,
      LIVE_REQUEST_CLOCK,
    );

    expect(repository).toBeInstanceOf(MysqlPromotionRepository);
    expect(executor.calls).toHaveLength(0);

    // The arity is part of the contract: neither two nor four arguments compose this adapter.
    expect(MysqlPromotionRepository.length).toBe(3);
  });
});

describe('MysqlPromotionRepository.getActivePromotionRewards - the qualificationRequired flag', () => {
  // CFML parity [model/dao/PromotionDAO.cfc:L54]: the legacy argument carries `default="false"`. The
  // port records that default in a COMMENT and declares the parameter simply optional, so an omitted
  // argument and an explicit `false` must behave identically - and BOTH branches must be live.
  it('treats an omitted flag exactly as an explicit false', async () => {
    const omitted = makeSubject();
    const explicitlyFalse = makeSubject();

    await omitted.repository.getActivePromotionRewards('merchandise', 'CODE-A');
    await explicitlyFalse.repository.getActivePromotionRewards('merchandise', 'CODE-A', false);

    const omittedCall = requireOnlyCall(omitted.executor);
    const explicitCall = requireOnlyCall(explicitlyFalse.executor);

    expect(omittedCall.sql).toBe(explicitCall.sql);
    expect(omittedCall.params).toHaveLength(explicitCall.params.length);
    expect(omittedCall.sql).not.toContain(QUALIFIER_EXISTS_FRAGMENT);
  });

  it('emits the qualification group only when the flag is truthy under CFML semantics', async () => {
    const cases: readonly (readonly [string, boolean])[] = [
      ['false', false],
      ['0', false],
      ['no', false],
      ['true', true],
      ['1', true],
      ['yes', true],
    ];

    for (const [spelling, expectedGroupPresent] of cases) {
      const qualificationRequired = cfBoolean(spelling);

      expect(qualificationRequired).toBe(expectedGroupPresent);

      const { executor, repository } = makeSubject();

      await repository.getActivePromotionRewards('merchandise', '', qualificationRequired);

      const { sql } = requireOnlyCall(executor);

      expect(sql.includes(QUALIFIER_EXISTS_FRAGMENT)).toBe(expectedGroupPresent);
    }
  });

  it('reads the promotion-code list once, however the legacy scoped it', async () => {
    // CFML parity [model/dao/PromotionDAO.cfc:L89, L109, L125 versus L126]: the legacy guards with the
    // BARE name `promotionCodeList` but calls `listToArray(arguments.promotionCodeList)` - two
    // spellings of one argument, which CFML resolves identically. The target has a single parameter.
    // The BEHAVIOUR is asserted here; the source inconsistency is recorded rather than reproduced as
    // two variables, because reproducing it would be transliteration rather than a port.
    const { executor, repository } = makeSubject();

    await repository.getActivePromotionRewards('merchandise', 'CODE-A', true);

    const call = requireOnlyCall(executor);

    expect(occurrencesOf(call.sql, promotionCodeExistsFragment(placeholderList(1)))).toBe(2);
    expect(call.params.filter((value) => value === 'CODE-A')).toHaveLength(2);
    expect(cfLen('CODE-A')).toBeGreaterThan(0);
  });
});

const PERIOD_USE_COUNT_JOINS: readonly string[] = Object.freeze([
  'SwPromotion pap on pa.promotionID = pap.promotionID',
  'SwOrderItem oi on pa.orderItemID = oi.orderItemID',
  'SwOrder oio on oi.orderID = oio.orderID',
  'SwType oioost on oio.orderStatusTypeID = oioost.typeID',
  'SwOrder o on pa.orderID = o.orderID',
  'SwType oost on o.orderStatusTypeID = oost.typeID',
  'SwOrderFulfillment orderf on pa.orderfulfillmentID = orderf.orderFulfillmentID',
  'SwOrder ofo on orderf.orderID = ofo.orderID',
  'SwType ofoost on ofo.orderStatusTypeID = ofoost.typeID',
]);

const ACCOUNT_USE_COUNT_JOINS: readonly string[] = Object.freeze([
  'SwAccount oioa on oio.accountID = oioa.accountID',
  'SwAccount oa on o.accountID = oa.accountID',
  'SwAccount ofoa on ofo.accountID = ofoa.accountID',
]);

const NULL_TOLERANT_STATUS_PREDICATES: readonly string[] = Object.freeze([
  '(oioost.systemCode is null or oioost.systemCode != ?)',
  '(oost.systemCode is null or oost.systemCode != ?)',
  '(ofoost.systemCode is null or ofoost.systemCode != ?)',
]);

const CREATED_AFTER_PREDICATE = ' and pa.createdDateTime > ?';
const CREATED_BEFORE_PREDICATE = ' and pa.createdDateTime < ?';

/** Base bind count of each period statement, before either appended date bound. */
const PERIOD_USE_COUNT_BASE_BINDS = 4;

/** Narrow one appended bound without a postfix `!`, refusing anything that is neither Date nor null. */
function asBoundDate(value: unknown): Date | null {
  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  throw new Error(
    `expected a Date or null date bound but received a value of type ${typeof value}`,
  );
}

/**
 * Count how many applied-promotion rows the EMITTED date predicates would keep, under SQL
 * three-valued logic.
 *
 * This is deliberately not a re-statement of the builder's own conditions: it reads which clauses the
 * builder actually emitted out of the SQL text, reads the values it actually bound out of the
 * parameter array, and applies them. A predicate comparing against NULL evaluates to UNKNOWN, and a
 * WHERE clause keeps a row only when every predicate is TRUE, so an UNKNOWN excludes the row. Both
 * comparisons are strictly exclusive, matching [model/dao/PromotionDAO.cfc:L175, L179].
 */
function countRowsUnderSqlNullSemantics(
  statement: { readonly sql: string; readonly params: readonly unknown[] },
  createdDateTimes: readonly Date[],
): number {
  const lowerEmitted = statement.sql.includes(CREATED_AFTER_PREDICATE);
  const upperEmitted = statement.sql.includes(CREATED_BEFORE_PREDICATE);
  const appended = statement.params.slice(PERIOD_USE_COUNT_BASE_BINDS);

  // An unemitted clause does not constrain, so it is absent rather than defaulted. `asBoundDate`
  // throws on anything that is neither a Date nor null, so an emitted clause whose value never
  // arrived fails loudly instead of silently reading as "no constraint".
  const lowerBound: Date | null | undefined = lowerEmitted ? asBoundDate(appended[0]) : undefined;
  const upperBound: Date | null | undefined = upperEmitted
    ? asBoundDate(appended[lowerEmitted ? 1 : 0])
    : undefined;

  return createdDateTimes.filter((created) => {
    if (lowerBound !== undefined && !(lowerBound !== null && created > lowerBound)) {
      return false;
    }

    if (upperBound !== undefined && !(upperBound !== null && created < upperBound)) {
      return false;
    }

    return true;
  }).length;
}

describe('PROMOTION_USE_COUNT_STATEMENTS - the duplicated getStartDateTime guard', () => {
  // LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L177, L244]: the second date guard tests
  // getStartDateTime() but binds getEndDateTime(), so a period with a null start and a set end
  // skips the upper bound entirely (overcounting), while a set start and null end binds null.
  // Preserved deliberately; do not fix without a product decision.
  //
  // THE DUPLICATED GUARD IS IN THE TWO PERIOD STATEMENTS, AND THE PLAN RECORDS THAT ALREADY.
  // This suite's own brief states the placement and marks it as a correction the brief itself
  // verified first-hand against the legacy source. The assertions below comply with that record;
  // they do not amend it. It was nevertheless re-read line by line here before anything was
  // asserted, and it holds.
  //
  // CFML parity [model/dao/PromotionDAO.cfc:L173-L180, L240-L247]: `getPromotionPeriodUseCount`
  // [L134] appends its date guards at L173 and L177; `getPromotionPeriodAccountUseCount` [L187]
  // appends the same pair at L240 and L244. In both, the second guard tests `getStartDateTime()`
  // and binds `getEndDateTime()` - the defect markered above. `getPromotionCodeUseCount` [L254]
  // and `getPromotionCodeAccountUseCount` [L274] are single fixed-HQL `ormExecuteQuery` calls
  // carrying no `<cfif>` date guard at all, so the defect is structurally absent from them, which
  // is what the code group below asserts.
  it('skips the upper bound entirely when the start is null and the end is set', () => {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: 'promotion-1',
      startDateTime: null,
      endDateTime: PERIOD_END_INSTANT,
    });

    expect(statement.sql).not.toContain(CREATED_BEFORE_PREDICATE);
    expect(statement.sql).not.toContain(CREATED_AFTER_PREDICATE);
    expect(statement.params).not.toContain(PERIOD_END_INSTANT);
    expect(statement.params).toHaveLength(4);
  });

  it('binds a null into the upper bound when the start is set and the end is null', () => {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: 'promotion-1',
      startDateTime: PERIOD_START_INSTANT,
      endDateTime: null,
    });

    expect(statement.sql).toContain(CREATED_AFTER_PREDICATE);
    expect(statement.sql).toContain(CREATED_BEFORE_PREDICATE);
    expect(statement.params).toHaveLength(6);
    expect(statement.params[4]).toBe(PERIOD_START_INSTANT);
    expect(statement.params[5]).toBeNull();
  });

  it('binds both bounds when both dates are set', () => {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: 'promotion-1',
      startDateTime: PERIOD_START_INSTANT,
      endDateTime: PERIOD_END_INSTANT,
    });

    expect(statement.sql).toContain(CREATED_AFTER_PREDICATE);
    expect(statement.sql).toContain(CREATED_BEFORE_PREDICATE);
    expect(statement.params).toHaveLength(6);
    expect(statement.params[4]).toBe(PERIOD_START_INSTANT);
    expect(statement.params[5]).toBe(PERIOD_END_INSTANT);
  });

  it('emits neither bound when both dates are null', () => {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: 'promotion-1',
      startDateTime: null,
      endDateTime: null,
    });

    expect(statement.sql).not.toContain(CREATED_AFTER_PREDICATE);
    expect(statement.sql).not.toContain(CREATED_BEFORE_PREDICATE);
    expect(statement.params).toHaveLength(4);
  });

  it('exhibits the identical defect in the account variant at the L244 site', () => {
    const startNullEndSet = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodAccountUseCount({
      promotionID: 'promotion-1',
      startDateTime: null,
      endDateTime: PERIOD_END_INSTANT,
      accountID: 'account-1',
    });
    const startSetEndNull = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodAccountUseCount({
      promotionID: 'promotion-1',
      startDateTime: PERIOD_START_INSTANT,
      endDateTime: null,
      accountID: 'account-1',
    });
    const bothSet = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodAccountUseCount({
      promotionID: 'promotion-1',
      startDateTime: PERIOD_START_INSTANT,
      endDateTime: PERIOD_END_INSTANT,
      accountID: 'account-1',
    });
    const bothNull = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodAccountUseCount({
      promotionID: 'promotion-1',
      startDateTime: null,
      endDateTime: null,
      accountID: 'account-1',
    });

    expect(startNullEndSet.sql).not.toContain(CREATED_BEFORE_PREDICATE);
    expect(startNullEndSet.params).not.toContain(PERIOD_END_INSTANT);
    expect(startNullEndSet.params).toHaveLength(7);

    expect(startSetEndNull.sql).toContain(CREATED_BEFORE_PREDICATE);
    expect(startSetEndNull.params).toHaveLength(9);
    expect(startSetEndNull.params[8]).toBeNull();

    expect(bothSet.params).toHaveLength(9);
    expect(bothNull.params).toHaveLength(7);
  });

  it('never binds the arity the defect makes unreachable', () => {
    const combinations: readonly (readonly [Date | null, Date | null])[] = [
      [PERIOD_START_INSTANT, PERIOD_END_INSTANT],
      [PERIOD_START_INSTANT, null],
      [null, PERIOD_END_INSTANT],
      [null, null],
    ];

    for (const [startDateTime, endDateTime] of combinations) {
      const period = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
        promotionID: 'promotion-1',
        startDateTime,
        endDateTime,
      });
      const account = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodAccountUseCount({
        promotionID: 'promotion-1',
        startDateTime,
        endDateTime,
        accountID: 'account-1',
      });

      expect([4, 6]).toContain(period.params.length);
      expect(period.params).not.toHaveLength(5);
      expect([7, 9]).toContain(account.params.length);
      expect(account.params).not.toHaveLength(8);
    }
  });

  it('carries the defect through the adapter for every start and end combination', async () => {
    const combinations: readonly (readonly [string, Date | undefined, Date | undefined, number])[] =
      [
        ['both set', PERIOD_START_INSTANT, PERIOD_END_INSTANT, 6],
        ['start set, end null', PERIOD_START_INSTANT, undefined, 6],
        ['start null, end set', undefined, PERIOD_END_INSTANT, 4],
        ['both null', undefined, undefined, 4],
      ];

    for (const [, startDateTime, endDateTime, expectedArity] of combinations) {
      const graph = makePromotionFixtures({
        promotionPeriodStartDateTime: startDateTime,
        promotionPeriodEndDateTime: endDateTime,
      });

      expect(graph.promotionPeriod.getStartDateTime()).toBe(startDateTime);
      expect(graph.promotionPeriod.getEndDateTime()).toBe(endDateTime);

      const { executor, repository } = makeSubject([[countRow(11)]]);

      const count = await repository.getPromotionPeriodUseCount(graph.promotionPeriod);
      const call = requireOnlyCall(executor);

      expect(count).toBe(11);
      expect(call.params).toHaveLength(expectedArity);
      expect(call.sql.includes(CREATED_BEFORE_PREDICATE)).toBe(expectedArity === 6);
      expect(call.sql.includes(CREATED_AFTER_PREDICATE)).toBe(expectedArity === 6);
    }
  });

  it('★★ COUNTS THE WRONG ROWS IN BOTH DIRECTIONS once SQL null semantics are applied', () => {
    // The four cases above pin the statement TEXT and the bound VALUES. Neither is the consequence.
    // The consequence - a count that decides whether a use limit binds - only appears once the
    // emitted predicates are evaluated against rows, so it is evaluated here rather than asserted in
    // prose. Nothing about this test needs a database: it drives the builder's own output.
    //
    // Four applied promotions, positioned around the period 2024-06-01 .. 2024-07-01: one before it
    // opened, two inside it, one after it closed. A correctly guarded implementation counts exactly
    // the two inside, in every one of the four date combinations.
    const createdDateTimes: readonly Date[] = Object.freeze([
      new Date('2024-05-15T00:00:00.000Z'),
      new Date('2024-06-10T00:00:00.000Z'),
      new Date('2024-06-20T00:00:00.000Z'),
      new Date('2024-07-15T00:00:00.000Z'),
    ]);

    const bothSet = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: 'promotion-1',
      startDateTime: PERIOD_START_INSTANT,
      endDateTime: PERIOD_END_INSTANT,
    });
    const startSetEndNull = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: 'promotion-1',
      startDateTime: PERIOD_START_INSTANT,
      endDateTime: null,
    });
    const startNullEndSet = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: 'promotion-1',
      startDateTime: null,
      endDateTime: PERIOD_END_INSTANT,
    });
    const bothNull = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: 'promotion-1',
      startDateTime: null,
      endDateTime: null,
    });

    // A fully-bounded period is the only case that behaves: the two in-window rows, and neither the
    // row before the start nor the row after the end.
    expect(countRowsUnderSqlNullSemantics(bothSet, createdDateTimes)).toBe(2);

    // ★ DIRECTION 1 - THE USE-LIMIT BYPASS. An open-ended period ("forever") binds a null upper
    // bound, `createdDateTime < NULL` is UNKNOWN for every row, and the count collapses to ZERO. A
    // maximumUseCount of 1 is then compared against 0 at
    // `src/services/promotion/promotionPeriodQualification.ts`, so the limit never binds and the
    // promotion is redeemable without bound.
    expect(countRowsUnderSqlNullSemantics(startSetEndNull, createdDateTimes)).toBe(0);
    expect(countRowsUnderSqlNullSemantics(startSetEndNull, createdDateTimes)).toBeLessThan(
      countRowsUnderSqlNullSemantics(bothSet, createdDateTimes),
    );

    // ★ DIRECTION 2 - THE OVER-COUNT. A period opened "forever ago" emits NEITHER bound, because
    // both are gated on the null start, so every applied promotion ever recorded against the
    // promotion is counted - including the one created two weeks AFTER the period closed, and the one
    // created before it opened. The limit therefore binds sooner than the period's own window says.
    expect(countRowsUnderSqlNullSemantics(startNullEndSet, createdDateTimes)).toBe(4);
    expect(countRowsUnderSqlNullSemantics(startNullEndSet, createdDateTimes)).toBeGreaterThan(
      countRowsUnderSqlNullSemantics(bothSet, createdDateTimes),
    );

    // An entirely unbounded period counts everything, which is the one case where counting everything
    // is also the correct answer - so it is a control, not a defect.
    expect(countRowsUnderSqlNullSemantics(bothNull, createdDateTimes)).toBe(4);
  });

  it('★★ exhibits both directions identically in the account variant', () => {
    // The account variant carries seven base binds rather than four, so the shared evaluator cannot
    // be pointed at it directly. The two bounds are read off the tail instead, which is the same
    // reading by a different offset, and the two failure directions are asserted on the bounds
    // themselves: null upper bound present, or both clauses absent.
    const startSetEndNull = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodAccountUseCount({
      promotionID: 'promotion-1',
      startDateTime: PERIOD_START_INSTANT,
      endDateTime: null,
      accountID: 'account-1',
    });
    const startNullEndSet = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodAccountUseCount({
      promotionID: 'promotion-1',
      startDateTime: null,
      endDateTime: PERIOD_END_INSTANT,
      accountID: 'account-1',
    });

    // Direction 1: the upper clause is emitted and its bound is null, so the account count collapses
    // to zero exactly as the plain period count does.
    expect(startSetEndNull.sql).toContain(CREATED_BEFORE_PREDICATE);
    expect(asBoundDate(startSetEndNull.params[8])).toBeNull();

    // Direction 2: neither clause is emitted, so no date window constrains the account count at all.
    expect(startNullEndSet.sql).not.toContain(CREATED_AFTER_PREDICATE);
    expect(startNullEndSet.sql).not.toContain(CREATED_BEFORE_PREDICATE);
  });
});

describe('PROMOTION_USE_COUNT_STATEMENTS - the preserved join-shape asymmetry', () => {
  // CFML parity [model/dao/PromotionDAO.cfc:L149-L150 and L171 versus L238]: the plain period query
  // filters `pap.promotionID` through an EXPLICIT `LEFT JOIN pa.promotion pap`, while the account
  // variant uses the IMPLICIT path `pa.promotion.promotionID`, which Hibernate resolves as an INNER
  // join. The two statements therefore disagree about whether an applied promotion with no promotion
  // row is counted. The asymmetry is deliberate and is NOT harmonized.
  it('filters the plain period statement through the explicit promotion alias', () => {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: 'promotion-1',
      startDateTime: null,
      endDateTime: null,
    });

    expect(statement.sql).toContain('SwPromotion pap on pa.promotionID = pap.promotionID');
    expect(statement.sql).toContain('pap.promotionID = ?');
    expect(statement.sql).not.toContain('    pa.promotionID = ?');
  });

  it('filters the account variant on the applied row directly, with no promotion join', () => {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodAccountUseCount({
      promotionID: 'promotion-1',
      startDateTime: null,
      endDateTime: null,
      accountID: 'account-1',
    });

    expect(statement.sql).toContain('pa.promotionID = ?');
    expect(statement.sql).not.toContain('pap.promotionID');
    expect(statement.sql).not.toContain('SwPromotion pap');
  });

  it('carries all nine period joins and the three additional account joins', () => {
    const period = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: 'promotion-1',
      startDateTime: null,
      endDateTime: null,
    });
    const account = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodAccountUseCount({
      promotionID: 'promotion-1',
      startDateTime: null,
      endDateTime: null,
      accountID: 'account-1',
    });

    for (const join of PERIOD_USE_COUNT_JOINS) {
      expect(period.sql).toContain(join);
    }

    for (const join of ACCOUNT_USE_COUNT_JOINS) {
      expect(account.sql).toContain(join);
      expect(period.sql).not.toContain(join);
    }

    expect(occurrencesOf(period.sql, 'LEFT JOIN')).toBe(PERIOD_USE_COUNT_JOINS.length);
    expect(occurrencesOf(period.sql, 'INNER JOIN')).toBe(0);
    expect(occurrencesOf(account.sql, 'INNER JOIN')).toBe(0);
  });
});

describe('PROMOTION_USE_COUNT_STATEMENTS - the preserved NULL-tolerance asymmetry', () => {
  // CFML parity [model/dao/PromotionDAO.cfc:L165, L167, L169 and L232, L234, L236 versus L262 and
  // L286]: the two PERIOD statements wrap every order-status test as
  // `(x.systemCode is null or x.systemCode != :ostNotPlaced)`, while the two CODE statements use a
  // BARE `!=` with no null tolerance. Both shapes are reproduced exactly as written.
  it('wraps all three status tests with null tolerance in both period statements', () => {
    const period = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: 'promotion-1',
      startDateTime: null,
      endDateTime: null,
    });
    const account = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodAccountUseCount({
      promotionID: 'promotion-1',
      startDateTime: null,
      endDateTime: null,
      accountID: 'account-1',
    });

    for (const predicate of NULL_TOLERANT_STATUS_PREDICATES) {
      expect(period.sql).toContain(predicate);
      expect(account.sql).toContain(predicate);
    }
  });

  it('uses a bare inequality with no null tolerance in both code statements', () => {
    const code = PROMOTION_USE_COUNT_STATEMENTS.promotionCodeUseCount({
      promotionCodeID: 'code-1',
    });
    const codeAccount = PROMOTION_USE_COUNT_STATEMENTS.promotionCodeAccountUseCount({
      promotionCodeID: 'code-1',
      accountID: 'account-1',
    });

    for (const statement of [code, codeAccount]) {
      expect(statement.sql).toContain('ost.systemCode != ?');
      expect(statement.sql).not.toContain('ost.systemCode is null');
      expect(statement.sql).not.toContain('is null or');
    }
  });

  it('carries no date guard at all in either code statement', () => {
    const code = PROMOTION_USE_COUNT_STATEMENTS.promotionCodeUseCount({
      promotionCodeID: 'code-1',
    });
    const codeAccount = PROMOTION_USE_COUNT_STATEMENTS.promotionCodeAccountUseCount({
      promotionCodeID: 'code-1',
      accountID: 'account-1',
    });

    for (const statement of [code, codeAccount]) {
      expect(statement.sql).not.toContain('createdDateTime');
      expect(statement.params.filter((value) => value instanceof Date)).toHaveLength(0);
    }

    expect(code.params).toHaveLength(2);
    expect(codeAccount.params).toHaveLength(3);
  });

  it('preserves the one-keyword FROM placement difference between the two code statements', () => {
    // CFML parity [model/dao/PromotionDAO.cfc:L256 versus L276]: the legacy puts `FROM` on the SELECT
    // line in the plain code query and on its own line in the account variant. A cosmetic difference,
    // preserved because harmonizing it would mean the emitted text no longer matches either source.
    const code = PROMOTION_USE_COUNT_STATEMENTS.promotionCodeUseCount({
      promotionCodeID: 'code-1',
    });
    const codeAccount = PROMOTION_USE_COUNT_STATEMENTS.promotionCodeAccountUseCount({
      promotionCodeID: 'code-1',
      accountID: 'account-1',
    });

    expect(code.sql).toContain('SELECT count(o.orderID) as count FROM\n');
    expect(codeAccount.sql).toContain('SELECT count(o.orderID) as count\nFROM\n');
  });
});

describe('PROMOTION_USE_COUNT_STATEMENTS - the account identifier bound three times', () => {
  // CFML parity [model/dao/PromotionDAO.cfc:L224-L230]: the account variant's WHERE clause opens with
  // an OR-of-three disjunction across the item, order and fulfillment account aliases, referencing
  // `:accountID` three times from a single named binding. Named parameters do not survive the port, so
  // the one identifier must be bound three times, positionally, in clause order.
  it('binds the identical account identifier three times, before the status predicates', () => {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodAccountUseCount({
      promotionID: 'promotion-1',
      startDateTime: null,
      endDateTime: null,
      accountID: 'account-1',
    });

    expect(statement.sql).toContain('oioa.accountID = ?');
    expect(statement.sql).toContain('oa.accountID = ?');
    expect(statement.sql).toContain('ofoa.accountID = ?');
    expect(statement.params.filter((value) => value === 'account-1')).toHaveLength(3);
    expect(statement.params.slice(0, 3)).toEqual(['account-1', 'account-1', 'account-1']);
    expect(statement.params.slice(3, 6)).toEqual([OST_NOT_PLACED, OST_NOT_PLACED, OST_NOT_PLACED]);
  });

  it('disjoins the three account aliases rather than conjoining them', () => {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodAccountUseCount({
      promotionID: 'promotion-1',
      startDateTime: null,
      endDateTime: null,
      accountID: 'account-1',
    });

    expect(statement.sql).toContain('      or\n        oa.accountID = ?');
    expect(statement.sql).toContain('      or\n        ofoa.accountID = ?');
  });

  it('binds the account identifier last in the code account variant', () => {
    const statement = PROMOTION_USE_COUNT_STATEMENTS.promotionCodeAccountUseCount({
      promotionCodeID: 'code-1',
      accountID: 'account-1',
    });

    expect(statement.sql).toContain('o.accountID = ?');
    expect(statement.params).toEqual([OST_NOT_PLACED, 'code-1', 'account-1']);
  });
});

describe('PROMOTION_USE_COUNT_STATEMENTS - every value is bound, never inlined', () => {
  // The `ostNotPlaced` system code is a BOUND STRING LITERAL in all four statements
  // [model/dao/PromotionDAO.cfc:L143, L194, L263, L288]: three occurrences in each period statement,
  // one in each code statement. Inlining it would put a literal into the SQL text for no reason and
  // would break the invariant this suite exists to guarantee.
  it('binds ostNotPlaced three times per period statement and once per code statement', () => {
    const period = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
      promotionID: 'promotion-1',
      startDateTime: null,
      endDateTime: null,
    });
    const account = PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodAccountUseCount({
      promotionID: 'promotion-1',
      startDateTime: null,
      endDateTime: null,
      accountID: 'account-1',
    });
    const code = PROMOTION_USE_COUNT_STATEMENTS.promotionCodeUseCount({
      promotionCodeID: 'code-1',
    });
    const codeAccount = PROMOTION_USE_COUNT_STATEMENTS.promotionCodeAccountUseCount({
      promotionCodeID: 'code-1',
      accountID: 'account-1',
    });

    expect(period.params.filter((value) => value === OST_NOT_PLACED)).toHaveLength(3);
    expect(account.params.filter((value) => value === OST_NOT_PLACED)).toHaveLength(3);
    expect(code.params.filter((value) => value === OST_NOT_PLACED)).toHaveLength(1);
    expect(codeAccount.params.filter((value) => value === OST_NOT_PLACED)).toHaveLength(1);

    for (const statement of [period, account, code, codeAccount]) {
      expect(statement.sql).not.toContain(`'${OST_NOT_PLACED}'`);
      expect(statement.sql).not.toContain(`"${OST_NOT_PLACED}"`);
      expect(placeholderCount(statement.sql)).toBe(statement.params.length);
    }
  });

  it('never inlines an identifier, a date or a status code in any of the four statements', () => {
    const statements = [
      PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
        promotionID: 'promotion-1',
        startDateTime: PERIOD_START_INSTANT,
        endDateTime: PERIOD_END_INSTANT,
      }),
      PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodAccountUseCount({
        promotionID: 'promotion-1',
        startDateTime: PERIOD_START_INSTANT,
        endDateTime: PERIOD_END_INSTANT,
        accountID: 'account-1',
      }),
      PROMOTION_USE_COUNT_STATEMENTS.promotionCodeUseCount({ promotionCodeID: 'code-1' }),
      PROMOTION_USE_COUNT_STATEMENTS.promotionCodeAccountUseCount({
        promotionCodeID: 'code-1',
        accountID: 'account-1',
      }),
    ];

    for (const statement of statements) {
      expect(statement.sql).not.toContain('promotion-1');
      expect(statement.sql).not.toContain('account-1');
      expect(statement.sql).not.toContain('code-1');
      expect(statement.sql).not.toContain('2024-06-01');
      expect(statement.sql).not.toContain('2024-07-01');
      expect(statement.sql).not.toMatch(/\bNOW\s*\(/i);
      expect(statement.sql).not.toContain(';');
      expect(placeholderCount(statement.sql)).toBe(statement.params.length);
    }
  });

  it('produces its statements synchronously, with no clock read and no configuration read', () => {
    const first = PROMOTION_USE_COUNT_STATEMENTS.promotionCodeUseCount({
      promotionCodeID: 'code-1',
    });
    const second = PROMOTION_USE_COUNT_STATEMENTS.promotionCodeUseCount({
      promotionCodeID: 'code-1',
    });

    expect(first.sql).toBe(second.sql);
    expect(first.params).toEqual(second.params);
    expect(first.params.filter((value) => value instanceof Date)).toHaveLength(0);
  });
});

describe('MysqlPromotionRepository use counts - the honest numeric return type', () => {
  // LEGACY-DEFECT [model/service/PromotionService.cfc:L1094]: the wrapper declares
  // returntype="boolean" yet returns the DAO's numeric count, and its sibling carries the same
  // mis-declaration [model/service/PromotionService.cfc:L1098].
  //
  // WHAT IS PRESERVED IS THE RUNTIME VALUE, NOT THE DECLARATION. The legacy returned a count at
  // runtime and this port returns the same count, so no observable behaviour changes. The declared
  // type is DELIBERATELY CORRECTED: all four port members are typed `Promise<number>`, because a
  // `boolean` return type cannot be reconciled with the value actually returned and would make the
  // count unusable to a TypeScript caller. That correction is a target divergence, recorded here
  // rather than presented as parity.
  //
  // The mis-declaration is a SERVICE-tier artefact only. The DAO functions behind these two wrappers
  // declare `returntype="numeric"` and `return results[1]` [model/dao/PromotionDAO.cfc:L254] and
  // [model/dao/PromotionDAO.cfc:L274], as do the two promotion-period counterparts
  // [model/dao/PromotionDAO.cfc:L134] and [model/dao/PromotionDAO.cfc:L187].
  it('returns the numeric count from all four use-count members', async () => {
    const graph = makePromotionFixtures();
    const expectedCounts: readonly number[] = [3, 5, 7, 11];
    const [periodCount, accountCount, codeCount, codeAccountCount] = expectedCounts;

    if (
      periodCount === undefined ||
      accountCount === undefined ||
      codeCount === undefined ||
      codeAccountCount === undefined
    ) {
      throw new Error('four expected counts are required');
    }

    const period = makeSubject([[countRow(periodCount)]]);
    const account = makeSubject([[countRow(accountCount)]]);
    const code = makeSubject([[countRow(codeCount)]]);
    const codeAccount = makeSubject([[countRow(codeAccountCount)]]);

    const results = [
      await period.repository.getPromotionPeriodUseCount(graph.promotionPeriod),
      await account.repository.getPromotionPeriodAccountUseCount(
        graph.promotionPeriod,
        'account-1',
      ),
      await code.repository.getPromotionCodeUseCount(graph.promotionCode),
      await codeAccount.repository.getPromotionCodeAccountUseCount(
        graph.promotionCode,
        'account-1',
      ),
    ];

    expect(results).toEqual([...expectedCounts]);

    for (const result of results) {
      expect(typeof result).toBe('number');
      expect(typeof result).not.toBe('boolean');
    }
  });

  it('returns zero as the number zero, never as undefined and never as false', async () => {
    const graph = makePromotionFixtures();
    const { repository } = makeSubject([[countRow(0)]]);

    const count = await repository.getPromotionCodeUseCount(graph.promotionCode);

    expect(count).toBe(0);
    expect(count).not.toBeUndefined();
    expect(typeof count).toBe('number');
  });

  it('projects the aggregate under the alias count in all four statements', () => {
    const statements = [
      PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodUseCount({
        promotionID: 'promotion-1',
        startDateTime: null,
        endDateTime: null,
      }),
      PROMOTION_USE_COUNT_STATEMENTS.promotionPeriodAccountUseCount({
        promotionID: 'promotion-1',
        startDateTime: null,
        endDateTime: null,
        accountID: 'account-1',
      }),
      PROMOTION_USE_COUNT_STATEMENTS.promotionCodeUseCount({ promotionCodeID: 'code-1' }),
      PROMOTION_USE_COUNT_STATEMENTS.promotionCodeAccountUseCount({
        promotionCodeID: 'code-1',
        accountID: 'account-1',
      }),
    ];

    expect(statements[0]?.sql).toContain('SELECT count(pa.promotionAppliedID) as count');
    expect(statements[1]?.sql).toContain('SELECT count(pa.promotionAppliedID) as count');
    expect(statements[2]?.sql).toContain('SELECT count(o.orderID) as count');
    expect(statements[3]?.sql).toContain('SELECT count(o.orderID) as count');

    for (const statement of statements) {
      expect(statement?.sql).not.toMatch(/group\s+by/i);
      expect(statement?.sql).not.toMatch(/order\s+by/i);
    }
  });

  it('refuses an empty aggregate result rather than inventing a zero', async () => {
    const graph = makePromotionFixtures();
    const { repository } = makeSubject([[]]);

    await expect(repository.getPromotionCodeUseCount(graph.promotionCode)).rejects.toThrow(
      /count/i,
    );
  });

  it('refuses a count that did not arrive as an integer', async () => {
    const graph = makePromotionFixtures();
    const { repository } = makeSubject([[{ count: '4' }]]);

    await expect(repository.getPromotionCodeUseCount(graph.promotionCode)).rejects.toThrow(
      /integer/i,
    );
  });
});

describe('MysqlPromotionRepository use counts - the anti-corruption boundary', () => {
  // The out-of-scope `Account` entity is reduced to an OPAQUE identifier at the port: the legacy takes
  // `required any account` and immediately calls `getAccountID()`
  // [model/dao/PromotionDAO.cfc:L193, L292], so the identifier is all that ever crossed the boundary.
  // `PromotionApplied`'s Order, OrderItem and OrderFulfillment foreign keys are likewise opaque string
  // identifiers [model/entity/PromotionApplied.cfc:L49-L58].
  it('accepts the account as a plain string identifier, hydrating no account entity', async () => {
    const graph = makePromotionFixtures();
    const { executor, repository } = makeSubject([[countRow(1)]]);

    await repository.getPromotionPeriodAccountUseCount(graph.promotionPeriod, 'account-1');

    const call = requireOnlyCall(executor);

    expect(call.params.filter((value) => value === 'account-1')).toHaveLength(3);
    expect(call.sql).not.toContain('SELECT\n    oioa.');
    expect(call.sql).toContain('SELECT count(pa.promotionAppliedID) as count');
  });

  it('reads the order tables and writes nothing at all', async () => {
    const graph = makePromotionFixtures();
    const { executor, repository } = makeSubject([[countRow(1)], [countRow(1)]]);

    await repository.getPromotionPeriodUseCount(graph.promotionPeriod);
    await repository.getPromotionPeriodAccountUseCount(graph.promotionPeriod, 'account-1');

    for (const call of executor.calls) {
      // The joins traverse to the order tables in the legacy HQL, so the ported SQL reads them - but
      // strictly read-only. No promotion-applied write exists on this port at all: the promotion
      // engine's write side is expressed as intents returned to the caller, keyed by opaque
      // orderItemID / orderFulfillmentID / orderID.
      expect(call.sql.trimStart().startsWith('SELECT')).toBe(true);
      expect(call.sql).not.toMatch(/\bINSERT\b/i);
      expect(call.sql).not.toMatch(/\bUPDATE\b/i);
      expect(call.sql).not.toMatch(/\bDELETE\b/i);
      expect(call.sql).not.toMatch(/\bMERGE\b/i);
      expect(call.sql).not.toMatch(/\bREPLACE\b/i);
      expect(call.inTransaction).toBe(false);
    }

    expect(executor.mutationCalls).toHaveLength(0);
  });

  it('resolves the promotion identifier through the period rather than from the period itself', async () => {
    // CFML parity [model/dao/PromotionDAO.cfc:L138 and identically L193]: the legacy binds
    // `promotionPeriod.getPromotion().getPromotionID()`, so applied promotions are counted for the
    // period's PROMOTION across every one of its periods - not for the period in isolation.
    const graph = makePromotionFixtures();
    const promotionID = graph.promotionPeriod.getPromotion()?.getPromotionID();

    if (promotionID === undefined) {
      throw new Error('the fixture period must carry its promotion');
    }

    const { executor, repository } = makeSubject([[countRow(2)]]);

    await repository.getPromotionPeriodUseCount(graph.promotionPeriod);

    const call = requireOnlyCall(executor);

    expect(call.params).toContain(promotionID);
    expect(call.params).not.toContain(graph.promotionPeriod.getPromotionPeriodID());
  });
});

const SALE_PRICE_BRANCHES: readonly {
  readonly level: string;
  readonly reward: string;
  readonly period: string;
}[] = Object.freeze([
  Object.freeze({ level: 'sku', reward: 'prSku', period: 'ppSku' }),
  Object.freeze({ level: 'product', reward: 'prProduct', period: 'ppProduct' }),
  Object.freeze({ level: 'brand', reward: 'prBrand', period: 'ppBrand' }),
  Object.freeze({ level: 'option', reward: 'prOption', period: 'ppOption' }),
  Object.freeze({ level: 'productType', reward: 'prProductType', period: 'ppProductType' }),
  Object.freeze({ level: 'global', reward: 'prGlobal', period: 'ppGlobal' }),
]);

function branchProjection(level: string, reward: string, period: string): string {
  return [
    '        SwSku.skuID as skuID,',
    '        SwSku.price as originalPrice,',
    `        '${level}' as discountLevel,`,
    `        ${reward}.amountType as salePriceDiscountType,`,
    `        CASE ${reward}.amountType`,
    `            WHEN 'amount' THEN ${reward}.amount`,
    `            WHEN 'amountOff' THEN SwSku.price - ${reward}.amount`,
    `            WHEN 'percentageOff' THEN SwSku.price - (SwSku.price * (${reward}.amount / 100))`,
    '        END as salePrice,',
    `        ${reward}.roundingRuleID as roundingRuleID,`,
    `        ${period}.endDateTime as salePriceExpirationDateTime,`,
    `        ${period}.promotionPeriodID as promotionPeriodID,`,
    `        ${period}.promotionID as promotionID`,
  ].join('\n');
}

const STEP_ONE_PROJECTION = [
  '    SELECT DISTINCT',
  '        allDiscounts.skuID,',
  '        allDiscounts.originalPrice,',
  '        allDiscounts.discountLevel,',
  '        allDiscounts.salePriceDiscountType,',
  '        allDiscounts.salePrice,',
  '        allDiscounts.roundingRuleID,',
  '        allDiscounts.salePriceExpirationDateTime,',
  '        allDiscounts.promotionPeriodID,',
  '        allDiscounts.promotionID',
].join('\n');

const STEP_THREE_PROJECTION = [
  'SELECT',
  '    noQualifierDiscounts.skuID,',
  '    noQualifierDiscounts.originalPrice,',
  '    noQualifierDiscounts.discountLevel,',
  '    noQualifierDiscounts.salePriceDiscountType,',
  '    noQualifierDiscounts.salePrice,',
  '    noQualifierDiscounts.roundingRuleID,',
  '    noQualifierDiscounts.salePriceExpirationDateTime,',
  '    noQualifierDiscounts.promotionID',
].join('\n');

const SALE_PRICE_CTE_NAMES: readonly string[] = Object.freeze([
  'noQualifierCurrentActivePromotionPeriods',
  'allDiscounts',
  'noQualifierDiscounts',
  'skuPrice',
]);

describe('salePricePromotionRewards is a PURE builder that reads no configuration', () => {
  // ★ THE GATE FOR THE AMBIENT-CONFIGURATION DEFECT. `buildSalePricePromotionRewardsStatement` once
  // called `resolveConfiguredDialect()` inside its own body, so composing a SQL string loaded the
  // validated application configuration and raised `ConfigurationError` unless `DB_HOST`, `DB_USER`,
  // `DB_PASSWORD`, `DB_TLS_MODE` and `DB_DIALECT` were ALL set - four of which the statement never
  // used. That is ambient state, which AAP transformation rule T6 forbids ("No ambient state"), and
  // it broke the EMPTY-ENVIRONMENT GUARANTEE `tests/setup.ts` states for the whole suite. These cases
  // establish the environment is genuinely EMPTY rather than merely unstubbed, so they cannot pass
  // for the wrong reason on a developer machine that happens to export the variables.
  beforeEach(() => {
    applyConfiguration(undefined);

    for (const [name] of REQUIRED_CONFIGURATION) {
      vi.stubEnv(name, undefined);
    }
  });

  afterEach(() => {
    revertConfiguration();
  });

  it('composes every arity with EVERY DB_* variable deleted', () => {
    // Every reachable input shape, so the guarantee covers the branch that binds `productID` as well
    // as the one that omits it, and the empty-string case the six `structKeyExists` guards preserve.
    const absent = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });
    const present = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
      productID: 'product-1',
    });
    const presentButEmpty = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
      productID: '',
    });

    expect(absent.params).toHaveLength(18);
    expect(present.params).toHaveLength(24);
    expect(presentButEmpty.params).toHaveLength(24);

    // The MySQL fragment is emitted from the SUPPLIED dialect, with nothing read on its behalf.
    expect(absent.sql).toContain(
      materializedIdPathLikePatternFragment(
        STATEMENT_DIALECT,
        'SwPromoRewardProductType.productTypeID',
      ),
    );
  });

  it('is deterministic in the dialect it is handed, and refuses an unimplemented one', () => {
    // The dialect decides a FRAGMENT, never a bound value: it must not appear among the parameters,
    // and an engine this port does not implement is refused rather than served the MySQL text.
    const statement = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });

    expect(statement.params).not.toContain(STATEMENT_DIALECT);

    for (const dialect of NON_MYSQL_DIALECTS) {
      expect(() =>
        buildSalePricePromotionRewardsStatement({ now: EXPLICIT_UTC_INSTANT, dialect }),
      ).toThrow(/not implemented by this port/u);
    }
  });

  it('drives the whole repository read with no configuration, through the injected executor', async () => {
    // The adapter supplies the dialect from its own module constant, so the composed read needs no
    // credential either - which is what makes the statement-shape tier assertable with no database.
    const { executor, repository } = makeSubject([[salePriceRow()]]);

    const rows = await repository.getSalePricePromotionRewardsQuery('product-1');

    expect(rows).toHaveLength(1);
    expect(requireOnlyCall(executor).params).toHaveLength(24);
    expect(executor.mutationCalls).toHaveLength(0);
  });
});

describe('salePricePromotionRewards - the six UNION branches', () => {
  it('emits all six branches, each projecting the same nine columns in the same order', () => {
    const { sql } = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });

    expect(SALE_PRICE_BRANCHES).toHaveLength(6);

    for (const { level, reward, period } of SALE_PRICE_BRANCHES) {
      expect(sql).toContain(branchProjection(level, reward, period));
    }

    expect(occurrencesOf(sql, '\n  UNION\n')).toBe(5);
    expect(sql).not.toMatch(/UNION\s+ALL/i);
  });

  it('preserves each branch-specific join chain', () => {
    const { sql } = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });

    expect(sql).toContain('SwPromoRewardSku on SwPromoRewardSku.skuID = SwSku.skuID');
    expect(sql).toContain(
      'SwPromoRewardProduct on SwPromoRewardProduct.productID = SwSku.productID',
    );
    expect(sql).toContain('SwPromoRewardBrand on SwPromoRewardBrand.brandID = SwProduct.brandID');
    expect(sql).toContain('SwSkuOption on SwSkuOption.skuID = SwSku.skuID');
    expect(sql).toContain(
      'SwPromoRewardOption on SwPromoRewardOption.optionID = SwSkuOption.optionID',
    );
    expect(sql).toContain('SwProductType on SwProduct.productTypeID = SwProductType.productTypeID');

    expect(sql).toContain('  CROSS JOIN\n        SwPromoReward prGlobal');
  });

  it('binds the three global reward types rather than inlining them', () => {
    const statement = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });

    expect(statement.sql).toContain(`prGlobal.rewardType IN (${placeholderList(3)})`);

    for (const rewardType of GLOBAL_REWARD_TYPES) {
      expect(statement.sql).not.toContain(`'${rewardType}'`);
      expect(statement.params).toContain(rewardType);
    }

    const firstTypeIndex = statement.params.indexOf('merchandise');

    expect(statement.params.slice(firstTypeIndex, firstTypeIndex + 3)).toEqual([
      ...GLOBAL_REWARD_TYPES,
    ]);
  });

  it('emits the whole reduction as one statement, never several separated by a semicolon', () => {
    const { sql } = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });

    expect(sql).not.toContain(';');
    expect(sql.startsWith('WITH ')).toBe(true);
  });
});

describe('salePricePromotionRewards - the optional productID filter', () => {
  it('omits both the clause and its bound value when no productID is supplied', () => {
    const statement = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });

    expect(statement.sql).not.toContain('SwSku.productID = ?');
    expect(statement.params).toHaveLength(18);
    expect(placeholderCount(statement.sql)).toBe(statement.params.length);
  });

  it('narrows every one of the six branches when a productID is supplied', () => {
    // SIX BRANCHES, SIX GUARDS, SIX SEPARATE BINDS - AND THAT IS WHAT THE GOVERNING SPECIFICATION
    // ASKS FOR. The plan for `src/repositories/mysql/sql/salePricePromotionRewards.sql.ts` requires
    // six `structKeyExists(arguments, "productID")` guards and six separate binds, because each
    // UNION branch carries its own `WHERE`, and it fixes the bind census at EIGHTEEN parameters
    // without a `productID` and TWENTY-FOUR with one. Both numbers are asserted here and in the case
    // above.
    //
    // The legacy locators, read verbatim: the guard appears at
    // [model/dao/PromotionDAO.cfc:L359, L390, L423, L456, L497, L538] with its own `<cfqueryparam>`
    // at [L361, L392, L425, L458, L499, L540].
    //
    // JUDGMENT CALL: a parenthetical in this suite's own brief reads as though the filter appeared in
    // the final UNION branch alone. It was checked against `model/dao/PromotionDAO.cfc` line by line
    // before anything was asserted, and it is a READING ARTIFACT rather than a different
    // specification: the sixth branch's `</cfif>` at [L541] sits immediately above `</cfquery>` at
    // [L542] purely because the sixth branch is the last one, which makes that one guard look like
    // the only guard. The brief's operative instruction is to reproduce the legacy's placement, and
    // the six-branch reading is the one that does. It also matters for money rather than for tidiness
    // - narrowing only the last branch would let a row from an unfiltered earlier branch win the
    // `MIN(salePrice)` reduction, so the two readings do not merely differ in shape.
    const statement = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
      productID: 'product-1',
    });

    expect(occurrencesOf(statement.sql, 'SwSku.productID = ?')).toBe(SALE_PRICE_BRANCHES.length);
    expect(statement.params.filter((value) => value === 'product-1')).toHaveLength(6);
    expect(statement.params).toHaveLength(24);
    expect(statement.sql).not.toContain('product-1');
    expect(placeholderCount(statement.sql)).toBe(statement.params.length);
  });

  it('binds the productID after each branch own window predicates', () => {
    const statement = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
      productID: 'product-1',
    });
    const productIndexes = statement.params
      .map((value, index) => ({ value, index }))
      .filter((entry) => entry.value === 'product-1')
      .map((entry) => entry.index);

    expect(productIndexes).toEqual([5, 8, 11, 14, 17, 23]);
  });

  it('treats a present but empty productID as a real, bound case', () => {
    // The builder tests KEY PRESENCE rather than value definedness, so an explicitly empty string is
    // reachable and binds an empty string - which matches `structKeyExists(arguments, "productID")`
    // [model/dao/PromotionDAO.cfc:L538]. It is not intercepted and not silently dropped.
    const statement = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
      productID: '',
    });

    expect(statement.params).toHaveLength(24);
    expect(statement.params.filter((value) => value === '')).toHaveLength(6);
    expect(cfLen('')).toBe(0);
  });
});

describe('salePricePromotionRewards - the query-of-queries steps rewritten as CTEs', () => {
  it('names its four CTEs after the legacy query variables verbatim', () => {
    const { sql } = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });

    expect(sql).toContain(`WITH ${SALE_PRICE_CTE_NAMES[0] ?? ''} AS (`);

    for (const name of SALE_PRICE_CTE_NAMES.slice(1)) {
      expect(sql).toContain(`${name} AS (`);
    }
  });

  it('reproduces step one - the DISTINCT join against the gate set on promotionPeriodID', () => {
    // CFML parity [model/dao/PromotionDAO.cfc:L544-L559]: the `SELECT DISTINCT` is LOAD-BEARING. The
    // UNION already de-duplicates within a branch, but the join against the gate set can re-multiply
    // rows, and without DISTINCT a SKU could contribute the same discount more than once.
    const { sql } = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });

    expect(sql).toContain(STEP_ONE_PROJECTION);
    expect(sql).toContain(
      'allDiscounts.promotionPeriodID = noQualifierCurrentActivePromotionPeriods.promotionPeriodID',
    );
    expect(occurrencesOf(sql, 'SELECT DISTINCT')).toBe(1);

    // CFML parity: the legacy uses the old-style comma join in steps one and three
    // [model/dao/PromotionDAO.cfc:L554-L555, L583-L584]. The port keeps that formulation rather than
    // rewriting it as an explicit INNER JOIN, so the emitted text matches the source it came from.
    expect(sql).toContain('        allDiscounts, noQualifierCurrentActivePromotionPeriods');
  });

  it('reproduces step two - MIN(salePrice) grouped by skuID', () => {
    const { sql } = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });

    expect(sql).toContain('MIN(salePrice) as salePrice');
    expect(sql).toContain('    GROUP BY\n        skuID');
    expect(sql).toContain('skuPrice AS (');
    expect(occurrencesOf(sql, 'MIN(')).toBe(1);
    expect(sql).not.toContain('MAX(salePrice)');
  });

  it('reproduces step three - the eight-column join-back on both skuID and salePrice', () => {
    const { sql } = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });

    expect(sql).toContain(STEP_THREE_PROJECTION);
    expect(sql).toContain('    noQualifierDiscounts.skuID = skuPrice.skuID');
    expect(sql).toContain('    noQualifierDiscounts.salePrice = skuPrice.salePrice');

    // `promotionPeriodID` is carried through step one and DROPPED by step three. Its absence from the
    // final projection is what makes the winning period unrecoverable downstream, and it is preserved.
    expect(STEP_ONE_PROJECTION).toContain('promotionPeriodID');
    expect(STEP_THREE_PROJECTION).not.toContain('promotionPeriodID');
    expect(sql.endsWith('noQualifierDiscounts.salePrice = skuPrice.salePrice')).toBe(true);
  });
});

describe('salePricePromotionRewards - ties survive, with no invented tiebreaker', () => {
  it('adds no ORDER BY, no LIMIT and no secondary sort to the final projection', () => {
    // CFML parity [model/dao/PromotionDAO.cfc:L571-L588]: step three has no DISTINCT, no ORDER BY and
    // no LIMIT, so two rows sharing a SKU's minimum sale price BOTH survive. Adding `LIMIT 1`, a
    // secondary sort, a most-recent-wins rule or a reward-identifier ordering would pick a winner the
    // legacy never picked - and the winner decides the price shown.
    const { sql } = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });
    const finalProjection = sql.slice(sql.lastIndexOf(STEP_THREE_PROJECTION));

    expect(finalProjection).not.toMatch(/order\s+by/i);
    expect(finalProjection).not.toMatch(/\bLIMIT\b/i);
    expect(finalProjection).not.toContain('SELECT DISTINCT');
    expect(sql).not.toMatch(/\bROW_NUMBER\b/i);
    expect(sql).not.toMatch(/\bRANK\b/i);
    expect(sql).not.toMatch(/\bTOP\b/i);
  });

  it('returns both rows of a tie from the repository, in result-set order', async () => {
    const { executor, repository } = makeSubject([
      [
        salePriceRow({ skuID: 'sku-1', discountLevel: 'sku', salePrice: '87.50' }),
        salePriceRow({ skuID: 'sku-1', discountLevel: 'product', salePrice: '87.50' }),
      ],
    ]);

    const rows = await repository.getSalePricePromotionRewardsQuery();

    expect(executor.calls).toHaveLength(1);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.discountLevel)).toEqual(['sku', 'product']);
    expect(rows.map((row) => row.skuID)).toEqual(['sku-1', 'sku-1']);

    const [first, second] = rows;

    if (first === undefined || second === undefined) {
      throw new Error('both rows of the tie must survive');
    }

    expect(first.salePrice.equals(second.salePrice)).toBe(true);
    expect(first.salePrice.equals(Money.fromDecimalString('87.50'))).toBe(true);
  });

  it('returns the row array unkeyed, leaving the last-wins collapse to the service tier', async () => {
    // CFML parity [model/service/PromotionService.cfc:L1023]: the caller passes the query through
    // `queryToStructOfStructures(..., "skuID")`, which collapses duplicate keys LAST-WINS. That keying
    // - and the empty-string rounding-rule check at L1025 that follows it - belongs to the service
    // tier, so the repository must hand back the ARRAY and key nothing.
    const { repository } = makeSubject([
      [
        salePriceRow({ skuID: 'sku-1', discountLevel: 'sku', promotionID: 'promotion-first' }),
        salePriceRow({ skuID: 'sku-1', discountLevel: 'product', promotionID: 'promotion-last' }),
      ],
    ]);

    const rows = await repository.getSalePricePromotionRewardsQuery();

    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(2);

    const lastWins = new Map(rows.map((row) => [row.skuID, row]));

    expect(lastWins.size).toBe(1);
    expect(lastWins.get('sku-1')?.promotionID).toBe('promotion-last');
  });
});

describe('salePricePromotionRewards - the captured instant', () => {
  it('binds one instant into all fourteen timestamp placeholders and emits no SQL NOW()', () => {
    // CFML parity [model/dao/PromotionDAO.cfc:L306]: `timeNow = now()` is captured ONCE. ONE CAPTURED
    // INSTANT IS BOUND TO FOURTEEN TIMESTAMP PLACEHOLDERS ACROSS SEVEN WINDOWS - the gate's own start
    // and end bounds [model/dao/PromotionDAO.cfc:L317] and [model/dao/PromotionDAO.cfc:L319], plus a
    // start and an end bound in each of the six UNION branches. Emitting SQL `NOW()` instead would
    // let the database clock drift between the gate and the branches, and a period could then be
    // inside one window and outside another within a single statement.
    const statement = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });
    const instants = statement.params.filter((value): value is Date => value instanceof Date);

    expect(instants).toHaveLength(14);

    for (const instant of instants) {
      expect(instant.getTime()).toBe(EXPLICIT_UTC_INSTANT.getTime());
    }

    expect(statement.sql).not.toMatch(/\bNOW\s*\(/i);
    expect(statement.sql).not.toMatch(/\bCURRENT_TIMESTAMP\b/i);
    expect(statement.sql).not.toMatch(/\bSYSDATE\b/i);
  });

  it('accounts for every bound value as two gate windows, two per branch, the flag and three types', () => {
    const statement = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });

    // The whole eighteen-value bind array, derived rather than asserted as a bare number: the gate
    // contributes its start and end window, each of the six branches contributes its own start and end
    // window, the gate binds `activeFlag` once, and the global branch binds its three reward types.
    const expectedWindowBinds = 2 + SALE_PRICE_BRANCHES.length * 2;
    const expectedTotal = expectedWindowBinds + 1 + GLOBAL_REWARD_TYPES.length;

    expect(expectedWindowBinds).toBe(14);
    expect(expectedTotal).toBe(18);
    expect(statement.params.filter((value) => value instanceof Date)).toHaveLength(
      expectedWindowBinds,
    );
    expect(statement.params.filter((value) => value === 1)).toHaveLength(1);
    expect(statement.params).toHaveLength(expectedTotal);
    expect(placeholderCount(statement.sql)).toBe(statement.params.length);
  });

  it('binds the same instant through the repository, read back from the recorded call', async () => {
    const { executor, repository } = makeSubject([[salePriceRow()]]);

    await repository.getSalePricePromotionRewardsQuery();

    const call = requireOnlyCall(executor);
    const instants = boundInstants(call);

    expect(instants).toHaveLength(14);

    const [captured] = instants;

    if (captured === undefined) {
      throw new Error('the sale-price statement must bind at least one instant');
    }

    for (const instant of instants) {
      expect(instant.getTime()).toBe(captured.getTime());
    }

    expect(call.sql).not.toMatch(/\bNOW\s*\(/i);
  });

  it('binds the INJECTED instant at all fourteen positions', async () => {
    // The sale-price reduction and the active-reward statement are the adapter's two clock readers,
    // and they must agree with each other AND with the price-group adapter. Injecting one instant is
    // how that agreement is made structural rather than incidental; asserting it here is how the
    // structure is kept.
    const { executor, repository } = makeSubject(
      [[salePriceRow()]],
      fixedClock(EXPLICIT_UTC_INSTANT),
    );

    await repository.getSalePricePromotionRewardsQuery();

    const instants = boundInstants(requireOnlyCall(executor));

    expect(instants).toHaveLength(14);

    for (const instant of instants) {
      expect(instant.getTime()).toBe(EXPLICIT_UTC_INSTANT.getTime());
    }
  });
});

describe('salePricePromotionRewards - the gate window and the activeFlag binding shape', () => {
  it('makes the gate window INCLUSIVE at both ends', () => {
    // CFML parity: THREE DISTINCT DATE WINDOWS exist in the promotion slice and none of them may be
    // conflated with another.
    //   1. This one, the raw-SQL gate [model/dao/PromotionDAO.cfc:L317, L319] - INCLUSIVE at both
    //      ends, `<=` and `>=`.
    //   2. The HQL active-reward window [model/dao/PromotionDAO.cfc:L73, L75] - EXCLUSIVE at both
    //      ends, `<` and `>`, asserted in the active-reward block above.
    //   3. `PromotionPeriod.isCurrent()` [model/entity/PromotionPeriod.cfc:L78] - start-INCLUSIVE and
    //      end-EXCLUSIVE, owned by the entity's own unit suite.
    // A period whose start equals the captured instant passes this gate and fails window 2.
    const { sql } = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });

    expect(sql).toContain(
      '(SwPromotionPeriod.startDateTime is null or SwPromotionPeriod.startDateTime <= ?)',
    );
    expect(sql).toContain(
      '(SwPromotionPeriod.endDateTime is null or SwPromotionPeriod.endDateTime >= ?)',
    );
    expect(sql).not.toContain('SwPromotionPeriod.startDateTime < ?');
    expect(sql).not.toContain('SwPromotionPeriod.endDateTime > ?');
  });

  it('makes every branch window inclusive too, and null-tolerant at both ends', () => {
    const { sql } = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });

    for (const { period } of SALE_PRICE_BRANCHES) {
      expect(sql).toContain(`(${period}.startDateTime is null or ${period}.startDateTime <= ?)`);
      expect(sql).toContain(`(${period}.endDateTime is null or ${period}.endDateTime >= ?)`);
    }
  });

  it('binds activeFlag once, as a value rather than an inlined literal', () => {
    // The legacy binds the same flag two different ways: the HQL path binds NUMERIC 1
    // [model/dao/PromotionDAO.cfc:L118] while this raw-SQL gate binds
    // `cfsqltype="cf_sql_bit" value="1"` [model/dao/PromotionDAO.cfc:L321]. Both reach MySQL as the
    // same value. TARGET NORMALIZATION, NOT PRESERVED PARITY: this port canonicalises both sites to
    // one numeric bind rather than reproducing the two shapes, which is an improvement over the
    // in-file inconsistency; what the assertion below pins is that neither site inlines the literal.
    const statement = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });

    expect(statement.sql).toContain('SwPromotion.activeFlag = ?');
    expect(statement.sql).not.toContain('SwPromotion.activeFlag = 1');
    expect(statement.params.filter((value) => value === 1)).toHaveLength(1);
    expect(
      requireParam({ sql: statement.sql, params: [...statement.params], inTransaction: false }, 2),
    ).toBe(1);
  });

  it('keeps both NOT EXISTS gates, correlated exactly as written', () => {
    // These two gates are the entire reason the set is called the NO-QUALIFIER set: a period with any
    // qualifier, or a promotion with any code, is excluded outright. Rewriting either as
    // `LEFT JOIN ... IS NULL` or as `NOT IN` changes NULL handling and therefore changes the row set.
    const { sql } = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });

    expect(sql).toContain(
      'NOT EXISTS(SELECT promotionPeriodID FROM SwPromoQual WHERE SwPromoQual.promotionPeriodID = SwPromotionPeriod.promotionPeriodID)',
    );
    expect(sql).toContain(
      'NOT EXISTS(SELECT promotionID FROM SwPromotionCode WHERE SwPromotionCode.promotionID = SwPromotion.promotionID)',
    );
    expect(sql).not.toMatch(/NOT\s+IN\s*\(/i);
    expect(sql).not.toMatch(/IS\s+NULL\s*$/i);
  });

  it('keeps the global branch NOT EXISTS set at four link tables, omitting SwPromoRewardSku', () => {
    // LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L502-L537]: the global branch excludes rewards that
    // carry a product, brand, option or product-type link, but NOT rewards that carry a SKU link, so a
    // SKU-scoped reward is also counted as global and competes for the MIN sale price.
    // Preserved deliberately; do not fix without a product decision.
    const { sql } = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });
    const globalBranch = sql.slice(sql.indexOf("'global' as discountLevel"));

    for (const table of [
      'SwPromoRewardProduct',
      'SwPromoRewardBrand',
      'SwPromoRewardOption',
      'SwPromoRewardProductType',
    ]) {
      expect(globalBranch).toContain(
        `NOT EXISTS(SELECT promotionRewardID FROM ${table} WHERE ${table}.promotionRewardID = prGlobal.promotionRewardID)`,
      );
    }

    expect(globalBranch).not.toContain(
      'NOT EXISTS(SELECT promotionRewardID FROM SwPromoRewardSku WHERE SwPromoRewardSku.promotionRewardID = prGlobal.promotionRewardID)',
    );
  });
});

describe('salePricePromotionRewards - the CASE with no ELSE arm', () => {
  // LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L338-L342]: the three-arm CASE has no ELSE, so an
  // unrecognized amountType yields NULL salePrice; MIN(salePrice) ignores NULLs and the step-3
  // equality join on salePrice can never match NULL, so those rows are silently dropped twice.
  // Preserved deliberately; do not fix without a product decision.
  it('emits three arms with no ELSE and no COALESCE, in every branch', () => {
    const { sql } = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });

    expect(sql).not.toMatch(/\bELSE\b/i);
    expect(sql).not.toMatch(/\bCOALESCE\b/i);
    expect(sql).not.toMatch(/\bIFNULL\b/i);
    expect(occurrencesOf(sql, 'CASE ')).toBe(SALE_PRICE_BRANCHES.length);
    expect(occurrencesOf(sql, 'END as salePrice,')).toBe(SALE_PRICE_BRANCHES.length);
    expect(occurrencesOf(sql, "WHEN 'amount' THEN")).toBe(SALE_PRICE_BRANCHES.length);
    expect(occurrencesOf(sql, "WHEN 'amountOff' THEN")).toBe(SALE_PRICE_BRANCHES.length);
    expect(occurrencesOf(sql, "WHEN 'percentageOff' THEN")).toBe(SALE_PRICE_BRANCHES.length);
  });

  it('applies no rounding rule inside the SQL - roundingRuleID is only projected', () => {
    // The split is deliberate and must stay split. The statement carries `roundingRuleID` through
    // untouched; the rounding happens at `model/service/PromotionService.cfc:L1025-L1026`, gated on an
    // EMPTY-STRING check, after the reduction has already chosen a winner. Rounding inside the SQL
    // would change which row wins the MIN.
    const { sql } = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });

    expect(sql).toContain('roundingRuleID as roundingRuleID,');
    expect(sql).not.toContain('SwRoundingRule');
    expect(sql).not.toMatch(/\bROUND\s*\(/i);
    expect(sql).not.toMatch(/\bTRUNCATE\s*\(/i);
    expect(sql).not.toContain('roundingRuleExpression');
  });

  it('refuses a row whose discount type the three arms could never have produced', async () => {
    // The SQL can only ever emit one of the three recognized types, because the CASE has no ELSE and a
    // row with any other type is dropped twice before it can be returned. A row that nonetheless
    // carried an unrecognized type would be a contract violation, and it is REPORTED rather than
    // coerced - no fourth branch, no default, no `Money.zero`.
    const { repository } = makeSubject([[salePriceRow({ salePriceDiscountType: 'flatFee' })]]);

    await expect(repository.getSalePricePromotionRewardsQuery()).rejects.toThrow(
      /salePriceDiscountType.*outside the vocabulary/s,
    );
  });

  it('refuses a row whose discount level is not one of the six branch levels', async () => {
    const { repository } = makeSubject([[salePriceRow({ discountLevel: 'category' })]]);

    await expect(repository.getSalePricePromotionRewardsQuery()).rejects.toThrow(
      /discountLevel.*outside the vocabulary/s,
    );
  });

  it('builds Money from the decimal string the driver hands over, never from a float', async () => {
    // `decimalNumbers` is left unset on the pool, so DECIMAL arrives as a STRING. The percentage
    // arithmetic here is computed IN-DB as `price - (price * (amount / 100))`, which means the only
    // safe reading is the string one: parsing it as a float first would reintroduce exactly the drift
    // `precisionEvaluate` existed to prevent.
    const { repository } = makeSubject([
      [salePriceRow({ originalPrice: '19.99', salePrice: '17.49125' })],
    ]);

    const rows = await repository.getSalePricePromotionRewardsQuery();
    const [row] = rows;

    if (row === undefined) {
      throw new Error('the canned row must survive');
    }

    expect(row.salePrice.equals(Money.fromDecimalString('17.49125'))).toBe(true);
    expect(row.salePrice.toFixed2()).toBe('17.49');
    expect(row.originalPrice?.equals(Money.fromDecimalString('19.99'))).toBe(true);
  });

  it('maps an absent monetary value to undefined rather than to Money.zero', async () => {
    // `PromotionReward.amount` [model/entity/PromotionReward.cfc:L61] carries no default, so SQL NULL
    // is a real state. Substituting `Money.zero` would turn "no price recorded" into "free".
    const { repository } = makeSubject([
      [
        salePriceRow({
          originalPrice: null,
          roundingRuleID: null,
          salePriceExpirationDateTime: null,
        }),
      ],
    ]);

    const rows = await repository.getSalePricePromotionRewardsQuery();
    const [row] = rows;

    if (row === undefined) {
      throw new Error('the canned row must survive');
    }

    expect(row.originalPrice).toBeUndefined();
    expect(row.roundingRuleID).toBeUndefined();
    expect(row.salePriceExpirationDateTime).toBeUndefined();
    expect(row.originalPrice).not.toBe(Money.zero);
  });
});

describe('salePricePromotionRewards - the eliminated dead locals and scope leak', () => {
  // LEGACY-DEFECT [model/dao/PromotionDAO.cfc:L303] - IDENTIFIED, NOT REPRODUCED: dead locals sit
  // alongside an un-var'd `<cfquery name="...">` whose result set leaks into the component variables
  // scope [model/dao/PromotionDAO.cfc:L309].
  //
  // FUNCTION-SCOPE ISOLATION IS A DELIBERATE TARGET DIVERGENCE. The CTE rewrite makes every
  // intermediate result function-local, so this adapter has no component-scope slot for a result set
  // to leak into. Reproducing the leak would create a cross-invocation hazard on a warm Lambda
  // container - one request's rows visible to the next - so the divergence is structural, and the
  // test below asserts the isolation rather than the leak.
  it('holds no state between two invocations of one repository', async () => {
    const { executor, repository } = makeSubject([[salePriceRow({ skuID: 'sku-first' })], []]);

    const first = await repository.getSalePricePromotionRewardsQuery('product-1');
    const second = await repository.getSalePricePromotionRewardsQuery();

    expect(first.map((row) => row.skuID)).toEqual(['sku-first']);
    expect(second).toHaveLength(0);

    const firstCall = requireCall(executor, 0);
    const secondCall = requireCall(executor, 1);

    expect(occurrencesOf(firstCall.sql, 'SwSku.productID = ?')).toBe(6);
    expect(secondCall.sql).not.toContain('SwSku.productID = ?');
    expect(firstCall.params).toHaveLength(24);
    expect(secondCall.params).toHaveLength(18);
  });

  it('lets a second, independently constructed repository observe nothing of the first', async () => {
    const first = makeSubject([[salePriceRow({ skuID: 'sku-of-the-first-repository' })]]);
    const second = makeSubject([[salePriceRow({ skuID: 'sku-of-the-second-repository' })]]);

    const firstRows = await first.repository.getSalePricePromotionRewardsQuery('product-1');
    const secondRows = await second.repository.getSalePricePromotionRewardsQuery();

    expect(firstRows.map((row) => row.skuID)).toEqual(['sku-of-the-first-repository']);
    expect(secondRows.map((row) => row.skuID)).toEqual(['sku-of-the-second-repository']);

    expect(first.executor.calls).toHaveLength(1);
    expect(second.executor.calls).toHaveLength(1);
    expect(requireOnlyCall(second.executor).sql).not.toContain('SwSku.productID = ?');
    expect(first.executor.calls[0]?.sql).not.toBe(undefined);
    expect(second.executor.calls[0]?.params).toHaveLength(18);
  });

  it('mutates nothing - every statement it issues goes through the read path', async () => {
    const { executor, repository } = makeSubject([[salePriceRow()]]);

    await repository.getSalePricePromotionRewardsQuery();

    expect(executor.mutationCalls).toHaveLength(0);
    expect(requireOnlyCall(executor).inTransaction).toBe(false);
  });
});

describe('salePricePromotionRewards - the unanchored LIKE dialect site', () => {
  it('emits the MySQL concat arm exactly, unanchored on both sides', () => {
    // CFML parity [model/dao/PromotionDAO.cfc:L482-L488]: an UNANCHORED substring LIKE over a
    // comma-delimited materialized path. There is no comma anchoring and no FIND_IN_SET, so a
    // productTypeID of "abc" matches a path containing "xxabcyy". That over-matching decides whether a
    // product-type reward applies, and therefore decides money - so it is reproduced, not improved.
    const { sql } = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });

    expect(sql).toContain(
      "SwPromoRewardProductType on SwProductType.productTypeIDPath LIKE concat('%', SwPromoRewardProductType.productTypeID, '%')",
    );
    expect(
      materializedIdPathLikePatternFragment('MySQL', 'SwPromoRewardProductType.productTypeID'),
    ).toBe("concat('%', SwPromoRewardProductType.productTypeID, '%')");

    // Neither comma-anchored nor set-aware. Both would narrow the match set.
    expect(sql).not.toMatch(/FIND_IN_SET/i);
    expect(sql).not.toContain("concat('%,'");
    expect(sql).not.toContain("',%'");
    expect(sql).not.toContain("concat(',', ");
  });

  it('does not route this SQL path through the delimiter-aware path helper', () => {
    // `src/domain/valueObjects/materializedIdPath.ts` performs DELIMITER-AWARE membership, which is
    // deliberately NOT equivalent to the unanchored LIKE. The two disagree on exactly the case the
    // legacy over-matches, and this suite states that disagreement rather than hiding it: the SQL path
    // keeps the LIKE and the in-memory walks keep the helper.
    const overMatchingPath = 'xxabcyy';

    expect(idPathContainsId(overMatchingPath, 'abc')).toBe(false);
    expect(overMatchingPath.includes('abc')).toBe(true);

    // The helper agrees with the LIKE only when the element is a genuine path member.
    expect(idPathContainsId('aaa,abc,bbb', 'abc')).toBe(true);
    expect(listFindNoCase('aaa,abc,bbb', 'ABC')).toBe(2);
  });

  it('accounts for exactly three live dialect-branch SQL sites, not two', () => {
    // The census is three, and all three are modelled by a fragment accessor:
    //   1. model/dao/PromotionDAO.cfc:L482-L488   -> materializedIdPathLikePatternFragment (here)
    //   2. model/dao/PriceGroupDAO.cfc:L57        -> singleRowLimitFragments
    //   3. model/dao/SkuDAO.cfc:L194              -> optionGroupOdometerPowerFragment
    // model/dao/ProductDAO.cfc:288 and :304 sit inside the unexercised loadDataFromFile/saveImportData
    // path and are deliberately NOT modelled.
    expect(
      materializedIdPathLikePatternFragment('MySQL', 'SwProductType.productTypeIDPath'),
    ).toContain('concat(');
    expect(singleRowLimitFragments('MySQL')).toEqual({
      selectPrefix: '',
      trailingClause: 'LIMIT 1',
    });
    expect(optionGroupOdometerPowerFragment('MySQL', 'SwOptionGroup.sortOrder')).toBe(
      'POWER(10, ? - SwOptionGroup.sortOrder)',
    );
  });

  it('resolves the configured dialect through the config surface rather than the environment', () => {
    // ★ THIS IS THE ONE CASE IN THIS DESCRIBE THAT NEEDS CONFIGURATION, AND IT CONFIGURES ITSELF.
    // Every other case here asserts EMITTED TEXT, which no longer depends on the environment at all -
    // so the describe-level `beforeEach` that used to stub five `DB_*` variables for all of them is
    // gone. This case exercises `resolveConfiguredDialect`, whose entire job is to read configuration,
    // so it supplies one explicitly and the `afterEach` below reverts it.
    applyMySqlConfiguration();

    // `src/lib/config.ts` SUPPLIES and `dialect.ts` INTERPRETS - and neither reads the environment on
    // this suite's behalf, because the configuration is stubbed explicitly above. The mixed-case
    // `mySql` spelling three legacy sites actually use is what is configured, and it normalizes at the
    // configuration boundary, which makes `resolveDialect` idempotent over what it is handed.
    expect(resolveConfiguredDialect()).toBe('MySQL');
    expect(appConfig.load().dialect).toBe('MySQL');
    expect(resolveDialect('mySql')).toBe('MySQL');
    expect(resolveDialect(appConfig.load().dialect)).toBe(resolveConfiguredDialect());

    // And the value the adapter builds statements from is the SAME dialect, which is what makes an
    // argument safe where an environment read was not.
    expect(resolveConfiguredDialect()).toBe(STATEMENT_DIALECT);
  });

  afterEach(() => {
    revertConfiguration();
  });
});

const NON_MYSQL_DIALECTS: readonly DatabaseDialect[] = Object.freeze([
  'MicrosoftSQLServer',
  'Oracle10g',
]);

function messageRaisedBy(work: () => unknown): string {
  try {
    work();
  } catch (raised: unknown) {
    return raised instanceof Error ? raised.message : String(raised);
  }

  throw new Error('expected the call to raise, but it returned normally');
}

describe('the dialect contract - no fallback, no silent default', () => {
  afterEach(() => {
    revertConfiguration();
  });

  it('★ COMPOSES AND EXECUTES THE SALE-PRICE READ WITH NO CONFIGURATION AT ALL', async () => {
    // QUOTE-THEN-REVISE: THIS CASE ONCE ASSERTED THE OPPOSITE, AND THE ASSERTION WAS THE DEFECT. It
    // read "raises when the dialect is unset, and issues no statement at all", asserting that
    // `getSalePricePromotionRewardsQuery()` REJECTED whenever the five no-default `DB_*` variables
    // were absent - and it passed, because `buildSalePricePromotionRewardsStatement` called
    // `resolveConfiguredDialect()` inside its own body, so COMPOSING A SQL STRING loaded the whole
    // validated configuration and raised `ConfigurationError` naming five `DB_*` variables, four of
    // which the statement never used. That is ambient state, which AAP transformation rule T6 forbids
    // outright, and it broke the EMPTY-ENVIRONMENT GUARANTEE `tests/setup.ts` states for the whole
    // suite. QA testing recorded that shipped behaviour as a MAJOR defect: under the sanctioned
    // credential-free composition (`bootstrapCompositionRoot({ environment, executor })`) the read
    // threw, and with it the product feed, `getSalePriceDetailsForProductSkus`
    // [model/service/PromotionService.cfc:L1022] and 19 shipped tests in
    // `tests/unit/handlers/bootstrap.test.ts`.
    //
    // The CFML parity claim the old case rested on does not support it either. The legacy probe
    // [config/configORM.cfm:L4-L7] runs ONCE at application startup and aborts the request there;
    // `getApplicationValue("databaseType")` [model/dao/PromotionDAO.cfc:L482] then reads APPLICATION
    // scope, which is a resolved value and not a fresh probe. A per-query configuration read is
    // therefore LESS faithful than an argument, not more.
    //
    // The terminality of a failed datasource probe is NOT lost by this change; it simply lives where
    // the legacy actually put it. `resolveConfiguredDialect()` still raises on an unconfigured
    // process - asserted immediately below and in the three cases after this one - the composition
    // root calls it once, at startup, before any repository exists and refuses to compose under a
    // non-MySQL dialect, and `connection.ts` refuses to build a pool. Both are asserted in
    // `tests/unit/handlers/bootstrap.test.ts` and `tests/unit/repositories/connection.test.ts`. What
    // no longer happens is a STRING BUILDER demanding a host, an account and a password.
    applyConfiguration(undefined);

    const { executor, repository } = makeSubject([[salePriceRow()]]);

    await expect(repository.getSalePricePromotionRewardsQuery()).resolves.toHaveLength(1);
    expect(executor.calls).toHaveLength(1);
    expect(executor.mutationCalls).toHaveLength(0);

    // The statement is byte-identical to the one the configured-dialect describes assert, and its
    // bind census is the documented eighteen.
    const call = requireOnlyCall(executor);

    expect(call.sql).toBe(
      buildSalePricePromotionRewardsStatement({
        now: EXPLICIT_UTC_INSTANT,
        dialect: STATEMENT_DIALECT,
      }).sql,
    );
    expect(call.params).toHaveLength(18);

    // And the configured-dialect path, which is the composition root's business, still refuses an
    // unconfigured process rather than guessing at an engine.
    expect(messageRaisedBy(() => resolveConfiguredDialect())).toContain(DIALECT_VARIABLE_NAME);
  });

  it('raises when the CONFIGURED dialect is blank, exactly as it does for an absent one', () => {
    // CFML parity [config/configORM.cfm:L4-L7]: the legacy datasource probe sits inside a `<cftry>`
    // whose catch includes `nodatasource.cfm` and then `<cfabort/>`. A probe failure is TERMINAL, and
    // `resolveConfiguredDialect` is the one function in this port that turns configuration into a
    // dialect - so it is where that terminality belongs and where it is asserted. The statement
    // builder is deliberately not exercised here: it takes the dialect as an argument and so has no
    // configured value to reject.
    applyConfiguration('');

    const message = messageRaisedBy(() => resolveConfiguredDialect());

    expect(message).toContain(DIALECT_VARIABLE_NAME);
    expect(message).toContain('required');
  });

  it('raises for an unrecognized configured dialect, naming the variable and all three legal values', () => {
    // CFML parity [config/configORM.cfm:L9-L15]: MySQL is tested FIRST and the chain ends with no
    // `<cfelse>`, so an unrecognized product never assigns a dialect and startup fails. THERE IS NO
    // FALLBACK DIALECT, and the port must not invent one.
    applyConfiguration('Postgres');

    const message = messageRaisedBy(() => resolveConfiguredDialect());

    expect(message).toContain(DIALECT_VARIABLE_NAME);
    expect(message).toContain('Postgres');
    expect(message).toContain('MySQL');
    expect(message).toContain('MicrosoftSQLServer');
    expect(message).toContain('Oracle10g');
  });

  it('echoes no configured value into the failure message', () => {
    applyConfiguration('Postgres');

    const message = messageRaisedBy(() => resolveConfiguredDialect());

    expect(message).not.toContain(UNUSED_PLACEHOLDER);
    expect(message).not.toContain(`${UNUSED_PLACEHOLDER}.invalid`);
  });

  it('refuses a non-MySQL dialect ARGUMENT rather than emitting the MySQL concatenation', () => {
    // The builder's terminality, at the seam it now owns. A non-MySQL arm that emitted SOMETHING
    // would be worse than an error: the statement would run and quietly match the wrong rewards,
    // because `concat('%', c, '%')` is not portable to `||` or `+` semantics.
    for (const dialect of NON_MYSQL_DIALECTS) {
      const message = messageRaisedBy(() =>
        buildSalePricePromotionRewardsStatement({ now: EXPLICIT_UTC_INSTANT, dialect }),
      );

      expect(message).toContain('recognized but not implemented');
      expect(message).toContain(dialect);
    }
  });

  it('folds case for every MySQL spelling that appears in legacy source', () => {
    // THREE spellings exist in the source and a `===` comparison would fail on two of them:
    //   `MySQL` at [config/configORM.cfm:L10], and again at [model/dao/PromotionDAO.cfc:L482]
    //   `mySQL` at [model/dao/PriceGroupDAO.cfc:L57], and again at [model/dao/ProductDAO.cfc:L288]
    //   `mySql` [model/dao/ProductDAO.cfc:L304]
    // `findNoCase` was case-insensitive; the port folds case explicitly rather than relying on a loose
    // comparison, because `eqeqeq` is an error and `==` is never the answer.
    for (const spelling of ['mysql', 'MYSQL', 'MySQL', 'mySQL', 'mySql', '  MySQL  ']) {
      expect(resolveDialect(spelling)).toBe('MySQL');
    }

    expect(resolveDialect('MICROSOFTSQLSERVER')).toBe('MicrosoftSQLServer');
    expect(resolveDialect('microsoftsqlserver')).toBe('MicrosoftSQLServer');
    expect(resolveDialect('oracle10g')).toBe('Oracle10g');
    expect(resolveDialect('ORACLE10G')).toBe('Oracle10g');
  });

  it('raises from the direct resolver too, with no configuration in place', () => {
    applyConfiguration(undefined);

    expect(resolveDialect('mySql')).toBe('MySQL');
    expect(messageRaisedBy(() => resolveDialect('Postgres'))).toContain(DIALECT_VARIABLE_NAME);
    expect(messageRaisedBy(() => resolveDialect(''))).toContain(DIALECT_VARIABLE_NAME);
  });

  it('raises rather than emitting silently wrong SQL for either non-MySQL dialect', () => {
    // The MySQL-only guard covers all three fragment accessors. A non-MySQL arm that returned SOMETHING
    // would be worse than an error: the statement would run and quietly select the wrong rows.
    for (const dialect of NON_MYSQL_DIALECTS) {
      expect(() => assertMySqlDialect(dialect, 'model/dao/PromotionDAO.cfc:L482-L488')).toThrow();
      expect(() =>
        materializedIdPathLikePatternFragment(dialect, 'SwPromoRewardProductType.productTypeID'),
      ).toThrow();
      expect(() => singleRowLimitFragments(dialect)).toThrow();
      expect(() => optionGroupOdometerPowerFragment(dialect, 'SwOptionGroup.sortOrder')).toThrow();
    }

    const mysql: DatabaseDialect = 'MySQL';

    expect(() => assertMySqlDialect(mysql, 'model/dao/PromotionDAO.cfc:L482-L488')).not.toThrow();
  });

  it('drives the LIKE branch from ONE canonical dialect, not from two separate keys', () => {
    // CFML parity [Application.cfc:L87]: `setApplicationValue("databaseType", this.ormSettings.dialect)`
    // assigns `databaseType` FROM the Hibernate dialect literal that `config/configORM.cfm:L9-L15`
    // computes. The DAO's `getApplicationValue("databaseType")` branches therefore read the very value
    // the ORM configuration produced - they are ONE value, not two - and collapsing them into a single
    // canonical dialect is correct rather than a simplification.
    //
    // ★ AND THIS IS ALSO WHERE THE ADAPTER'S CONSTANT AND THE CONFIGURED VALUE ARE PROVEN TO AGREE.
    // `STATEMENT_DIALECT` is what the adapter hands the builder; `resolveConfiguredDialect()` is what
    // the composition root resolves and asserts. They must be the same dialect, or the port would
    // emit one engine's SQL while a pool was opened for another - so the equality below is a real
    // assertion rather than a tautology, and it is the reason the builder needs no environment read of
    // its own.
    applyMySqlConfiguration();

    const canonical = resolveConfiguredDialect();
    const { sql } = buildSalePricePromotionRewardsStatement({
      now: EXPLICIT_UTC_INSTANT,
      dialect: STATEMENT_DIALECT,
    });

    // The canonical configured dialect and the dialect the MySQL adapter states are the SAME value,
    // which is what makes supplying the adapter's constant equivalent to supplying the configured one
    // - the composition root refuses any process where they could differ.
    expect(canonical).toBe('MySQL');
    expect(canonical).toBe(STATEMENT_DIALECT);
    expect(sql).toContain(
      materializedIdPathLikePatternFragment(canonical, 'SwPromoRewardProductType.productTypeID'),
    );

    expect(sql).not.toContain("('%' || SwPromoRewardProductType.productTypeID || '%')");
    expect(sql).not.toContain("('%' + SwPromoRewardProductType.productTypeID + '%')");
  });
});

/**
 * The rounding-rule read, verbatim.
 *
 * JUDGMENT CALL: the projection is WIDENED from the legacy's two columns
 * [model/dao/RoundingRuleDAO.cfc:L51-L67 projects `roundingRuleExpression` and
 * `roundingRuleDirection` only] to eight. The legacy DAO handed a two-column query back to
 * `RoundingRuleService.getRoundingRuleDetailsByID` [model/service/RoundingRuleService.cfc:L67-L77],
 * which memoized a struct of exactly those two values. The port instead returns a hydrated
 * `RoundingRule` entity, because that is the return type the port declares
 * (`Promise<RoundingRule | undefined>`), and an entity cannot be built from two columns. The widening
 * is therefore PORT-MANDATED rather than discretionary, and it is asserted here as what shipped.
 */
const ROUNDING_RULE_STATEMENT = [
  'SELECT',
  '    roundingRuleID,',
  '    roundingRuleName,',
  '    roundingRuleExpression,',
  '    roundingRuleDirection,',
  '    createdDateTime,',
  '    createdByAccountID,',
  '    modifiedDateTime,',
  '    modifiedByAccountID',
  'FROM',
  '    SwRoundingRule',
  'WHERE',
  '    roundingRuleID = ?',
].join('\n');

describe('getRoundingRuleQuery - the seventh read, hosted on the promotion port', () => {
  it('emits one statement against SwRoundingRule with exactly one bound key', async () => {
    // This read lives on the promotion port because its only caller is a promotion-tier service:
    // `getRoundingRuleDetailsByID` reaches it at [model/service/RoundingRuleService.cfc:L70].
    const { executor, repository } = makeSubject([[roundingRuleRow()]]);

    await repository.getRoundingRuleQuery('rounding-rule-1');

    const call = requireOnlyCall(executor);

    expect(call.sql).toBe(ROUNDING_RULE_STATEMENT);
    expect(call.params).toStrictEqual(['rounding-rule-1']);
    expect(placeholderCount(call.sql)).toBe(1);
    expect(call.sql).not.toContain('rounding-rule-1');
    expect(call.inTransaction).toBe(false);
  });

  it('projects the eight widened columns and no others', () => {
    const projection = ROUNDING_RULE_STATEMENT.slice(
      ROUNDING_RULE_STATEMENT.indexOf('SELECT'),
      ROUNDING_RULE_STATEMENT.indexOf('FROM'),
    );
    const projectedColumns = projection
      .split('\n')
      .slice(1)
      .map((line) => line.trim().replace(/,$/u, ''))
      .filter((line) => line.length > 0);

    expect(projectedColumns).toStrictEqual([
      'roundingRuleID',
      'roundingRuleName',
      'roundingRuleExpression',
      'roundingRuleDirection',
      'createdDateTime',
      'createdByAccountID',
      'modifiedDateTime',
      'modifiedByAccountID',
    ]);

    expect(projectedColumns).toContain('roundingRuleExpression');
    expect(projectedColumns).toContain('roundingRuleDirection');
    expect(ROUNDING_RULE_STATEMENT).not.toContain('datasource');
    expect(ROUNDING_RULE_STATEMENT).not.toContain('*');
  });

  it('hydrates the rule from the row it read', async () => {
    const { repository } = makeSubject([[roundingRuleRow()]]);

    const rule = await repository.getRoundingRuleQuery('rounding-rule-1');

    if (rule === undefined) {
      throw new Error('the canned row must hydrate a rule');
    }

    expect(rule.getRoundingRuleID()).toBe('rounding-rule-1');
    expect(rule.getRoundingRuleExpression()).toBe('.99');
    expect(rule.getRoundingRuleDirection()).toBe('Closest');

    // `model/entity/RoundingRule.cfc` constrains neither field: the expression is free text with no
    // format constraint, so the port must not validate it into a shape the legacy never required.
    expect(rule.getRoundingRuleName()).toBe('Nearest ninety-nine');
  });

  it('returns undefined on a miss - never a zero, an empty object or a default rule', async () => {
    const { executor, repository } = makeSubject([[]]);

    const rule = await repository.getRoundingRuleQuery('no-such-rule');

    expect(rule).toBeUndefined();
    expect(requireOnlyCall(executor).params).toStrictEqual(['no-such-rule']);
  });

  it('tolerates a fully null optional projection without inventing values', async () => {
    const { repository } = makeSubject([
      [
        roundingRuleRow({
          roundingRuleName: null,
          roundingRuleExpression: null,
          roundingRuleDirection: null,
        }),
      ],
    ]);

    const rule = await repository.getRoundingRuleQuery('rounding-rule-1');

    if (rule === undefined) {
      throw new Error('a row with null optionals must still hydrate');
    }

    expect(rule.getRoundingRuleID()).toBe('rounding-rule-1');
    expect(rule.getRoundingRuleName()).toBeUndefined();
    expect(rule.getRoundingRuleExpression()).toBeUndefined();
    expect(rule.getRoundingRuleDirection()).toBeUndefined();
  });

  it('needs no dialect, so it resolves on a completely unconfigured process', async () => {
    // This read has no dialect-branching fragment, so unlike the sale-price statement it must work with
    // nothing configured at all. Asserting that keeps the dialect requirement scoped to the one
    // statement that genuinely branches.
    const { executor, repository } = makeSubject([[roundingRuleRow()]]);

    const rule = await repository.getRoundingRuleQuery('rounding-rule-1');

    expect(rule?.getRoundingRuleID()).toBe('rounding-rule-1');
    expect(requireOnlyCall(executor).sql).toBe(ROUNDING_RULE_STATEMENT);
  });
});

/**
 * Every statement the port can emit, collected in one pass over all seven reads.
 *
 * The seven reads are exercised through the PORT surface, each on its own repository instance and its
 * own executor, so the cross-cutting assertions below are made against the whole emitted corpus
 * rather than against one statement at a time. A read that grew a new statement, or a statement that
 * grew a new table, would show up here without any assertion needing to be edited.
 */
async function collectEveryEmittedStatement(): Promise<readonly RecordedStatement[]> {
  const graph = makePromotionFixtures();
  const collected: RecordedStatement[] = [];

  const activeCanned: (readonly SqlRow[])[] = [];
  const qualifierOrdinal = 1 + REWARD_LINK_TABLES.length + REWARD_CATALOG_TABLES.length + 1;

  activeCanned[0] = [activeRewardRow()];
  activeCanned[qualifierOrdinal] = [periodQualifierRow()];

  const active = makeSubject(activeCanned);

  await active.repository.getActivePromotionRewards(
    'merchandise,order,fulfillment',
    'CODE-A,CODE-B',
    true,
  );
  collected.push(...active.executor.calls);

  const period = makeSubject([[countRow(1)]]);
  await period.repository.getPromotionPeriodUseCount(graph.promotionPeriod);
  collected.push(...period.executor.calls);

  const periodAccount = makeSubject([[countRow(2)]]);
  await periodAccount.repository.getPromotionPeriodAccountUseCount(
    graph.promotionPeriod,
    'account-1',
  );
  collected.push(...periodAccount.executor.calls);

  const code = makeSubject([[countRow(3)]]);
  await code.repository.getPromotionCodeUseCount(graph.promotionCode);
  collected.push(...code.executor.calls);

  const codeAccount = makeSubject([[countRow(4)]]);
  await codeAccount.repository.getPromotionCodeAccountUseCount(graph.promotionCode, 'account-1');
  collected.push(...codeAccount.executor.calls);

  const salePrice = makeSubject([[salePriceRow()]]);
  await salePrice.repository.getSalePricePromotionRewardsQuery('product-1');
  collected.push(...salePrice.executor.calls);

  const roundingRule = makeSubject([[roundingRuleRow()]]);
  await roundingRule.repository.getRoundingRuleQuery('rounding-rule-1');
  collected.push(...roundingRule.executor.calls);

  for (const executor of [
    active.executor,
    period.executor,
    periodAccount.executor,
    code.executor,
    codeAccount.executor,
    salePrice.executor,
    roundingRule.executor,
  ]) {
    expect(executor.mutationCalls).toHaveLength(0);
  }

  return collected;
}

/**
 * The physical `Sw*` tables this port is allowed to name. Every one of them already exists: this
 * migration reads and writes the legacy schema UNCHANGED, with no migration, no rename, no new table
 * and no column change.
 *
 * The abbreviated link-table names are real, not shorthand: `SwPromoQual`
 * [model/entity/PromotionQualifier.cfc:L49] and `SwPromoReward`
 * [model/entity/PromotionReward.cfc:L57 - a specification correction, the declaration is at L57 and
 * not at L49], plus `SwPromotionApplied` [model/entity/PromotionApplied.cfc:L49].
 */
const PERMITTED_PHYSICAL_TABLES: readonly string[] = Object.freeze([
  'SwPromotion',
  'SwPromotionPeriod',
  'SwPromotionCode',
  'SwPromotionApplied',
  'SwPromoQual',
  'SwPromoReward',
  'SwRoundingRule',
  'SwSku',
  'SwSkuOption',
  'SwProduct',
  'SwProductType',
  'SwOrder',
  'SwOrderItem',
  'SwOrderFulfillment',
  'SwOrderPromotionCode',
  'SwAccount',
  'SwType',
  'SwPriceGroup',
  'SwOptionGroup',
]);

function physicalTablesNamedBy(statements: readonly RecordedStatement[]): string[] {
  const named = new Set<string>();

  for (const { sql } of statements) {
    for (const match of sql.matchAll(/\bSw[A-Za-z]+\b/gu)) {
      const [identifier] = match;

      if (identifier !== undefined) {
        named.add(identifier);
      }
    }
  }

  return [...named].sort();
}

describe('schema continuity - the existing Sw* tables, read and never reshaped', () => {
  it('names only physical Sw* tables that already exist', async () => {
    const statements = await collectEveryEmittedStatement();
    const named = physicalTablesNamedBy(statements);

    expect(named.length).toBeGreaterThan(0);

    for (const identifier of named) {
      const isPermitted =
        PERMITTED_PHYSICAL_TABLES.includes(identifier) ||
        identifier.startsWith('SwPromoReward') ||
        identifier.startsWith('SwPromoQual');

      expect(isPermitted, `unexpected physical identifier ${identifier}`).toBe(true);
    }
  });

  it('names the abbreviated link tables by their real abbreviated names', async () => {
    const statements = await collectEveryEmittedStatement();
    const everySql = statements.map((statement) => statement.sql).join('\n');

    expect(everySql).toContain('SwPromoQual');
    expect(everySql).toContain('SwPromoReward');

    expect(everySql).not.toContain('SwPromotionQualifier');
    expect(everySql).not.toContain('SwPromotionReward');
  });

  it('contains no DDL verb in any statement', async () => {
    const statements = await collectEveryEmittedStatement();

    for (const { sql } of statements) {
      for (const verb of DDL_VERBS) {
        expect(sql).not.toMatch(new RegExp(`\\b${verb}\\b`, 'iu'));
      }
    }
  });

  it('translates every HQL entity identifier into its physical table name', async () => {
    const statements = await collectEveryEmittedStatement();

    for (const { sql } of statements) {
      expect(sql).not.toContain('Slatwall');
    }
  });

  it('writes nothing - not SwPromotionApplied, and not one order table', async () => {
    // C2.7's boundary, asserted across the whole corpus: the use-count statements TRAVERSE to the order
    // tables because the legacy HQL does, but every one of them is a `SELECT`. The promotion engine's
    // write side is expressed as intents returned to the caller, keyed by opaque identifiers
    // [model/entity/PromotionApplied.cfc:L49], so no `PromotionApplied` write exists on this port at
    // all.
    const statements = await collectEveryEmittedStatement();

    for (const { sql } of statements) {
      expect(sql.trimStart().startsWith('SELECT') || sql.trimStart().startsWith('WITH')).toBe(true);
      expect(sql).not.toMatch(/\bINSERT\s+INTO\b/iu);
      expect(sql).not.toMatch(/\bUPDATE\s+Sw/iu);
      expect(sql).not.toMatch(/\bDELETE\s+FROM\b/iu);
      expect(sql).not.toMatch(/\bREPLACE\s+INTO\b/iu);
      expect(sql).not.toMatch(/\bFOR\s+UPDATE\b/iu);
    }
  });

  it('reads the order tables read-only, exactly where the legacy HQL joined them', async () => {
    const statements = await collectEveryEmittedStatement();
    const orderTouching = statements.filter(({ sql }) => sql.includes('SwOrder'));

    expect(orderTouching.length).toBeGreaterThan(0);

    for (const { sql } of orderTouching) {
      expect(sql.trimStart().startsWith('SELECT')).toBe(true);
      expect(sql).toContain('count(');
    }
  });
});

describe('parameterized SQL exclusively - every supplied value is bound, never interpolated', () => {
  it('binds one parameter per placeholder in every statement it emits', async () => {
    // Prepared statements are what preserves the injection-safety property `cfqueryparam` provided, and
    // an arity mismatch is the failure mode that quietly breaks it. Asserting the identity across the
    // whole corpus makes a drifted statement impossible to land unnoticed.
    const statements = await collectEveryEmittedStatement();

    for (const statement of statements) {
      expect(placeholderCount(statement.sql)).toBe(statement.params.length);
    }
  });

  it('never emits an empty IN list, and never a bare quoted literal for a supplied value', async () => {
    const statements = await collectEveryEmittedStatement();
    const suppliedValues: readonly string[] = [
      'merchandise',
      'order',
      'fulfillment',
      'CODE-A',
      'CODE-B',
      'account-1',
      'product-1',
      'rounding-rule-1',
      'promofx-promotion',
      'promofx-promotion-code',
      OST_NOT_PLACED,
    ];

    for (const statement of statements) {
      expect(statement.sql).not.toContain('IN ()');
      expect(statement.sql).not.toMatch(/IN\s*\(\s*\)/u);

      for (const value of suppliedValues) {
        expect(statement.sql).not.toContain(`'${value}'`);
        expect(statement.sql).not.toContain(`"${value}"`);
      }
    }
  });

  it('carries every supplied value in a bound-parameter array instead', async () => {
    const statements = await collectEveryEmittedStatement();
    const everyBoundValue = statements.flatMap((statement) => statement.params);

    for (const value of [
      'merchandise',
      'order',
      'fulfillment',
      'CODE-A',
      'CODE-B',
      'account-1',
      'product-1',
      'rounding-rule-1',
      'promofx-promotion',
      'promofx-promotion-code',
      OST_NOT_PLACED,
    ]) {
      expect(everyBoundValue).toContain(value);
    }

    expect(everyBoundValue.filter((value) => value === 1).length).toBeGreaterThanOrEqual(2);
  });

  it('interpolates no value into any statement, and reads no clock from the database', async () => {
    const statements = await collectEveryEmittedStatement();

    for (const { sql } of statements) {
      expect(sql).not.toMatch(/\bNOW\s*\(/iu);
      expect(sql).not.toMatch(/\bCURRENT_TIMESTAMP\b/iu);
      expect(sql).not.toMatch(/\bSYSDATE\b/iu);
      expect(sql).not.toContain(';');
      expect(sql).not.toContain('--');
      expect(sql).not.toContain('/*');
    }
  });

  it('binds every date as an explicit instant, identical within one statement', async () => {
    const statements = await collectEveryEmittedStatement();

    for (const statement of statements) {
      for (const instant of boundInstants(statement)) {
        expect(Number.isNaN(instant.getTime())).toBe(false);
      }
    }

    const salePriceStatement = statements.find(({ sql }) => sql.startsWith('WITH '));

    if (salePriceStatement === undefined) {
      throw new Error('the sale-price statement must be part of the collected corpus');
    }

    const instants = boundInstants(salePriceStatement);
    const [captured] = instants;

    if (captured === undefined) {
      throw new Error('the sale-price statement must bind at least one instant');
    }

    expect(instants).toHaveLength(14);

    for (const instant of instants) {
      expect(instant.getTime()).toBe(captured.getTime());
    }
  });

  it('never binds a value the caller did not supply, and never a boolean flag as a string', async () => {
    const statements = await collectEveryEmittedStatement();

    for (const statement of statements) {
      for (const value of statement.params) {
        const shapeIsBindable =
          value === null ||
          typeof value === 'string' ||
          typeof value === 'number' ||
          value instanceof Date;

        expect(shapeIsBindable, `unbindable parameter shape: ${typeof value}`).toBe(true);
        expect(value).not.toBe('1');
        expect(value).not.toBe('true');
        expect(typeof value).not.toBe('boolean');
        expect(typeof value).not.toBe('undefined');
      }
    }
  });
});

describe('the port surface this suite asserts against', () => {
  it('declares exactly the seven reads by their legacy names, and NOTHING ELSE', () => {
    // Interface parity is the acceptance contract, so the surface itself is asserted: the seven reads
    // carry their legacy camelCase names verbatim, and there is no eighth member of any kind.
    //
    // ★ THIS CASE ONCE ENDED IN `expect(typeof port.saveRoundingRule).toBe('function')`, WHICH IS
    // THE OPPOSITE OF WHAT IT IS FOR. A parity case that confirms an extra member is not asserting
    // parity; it is certifying the breach. The enumeration below is EXHAUSTIVE over `keyof
    // PromotionRepository`, so adding a member to the port breaks this file at compile time rather
    // than passing quietly through a `for` loop over a hand-written list.
    const graph = makePromotionFixtures();
    const { repository } = makeSubject([[]]);
    const port: PromotionRepository = repository;

    const readNames: readonly (keyof PromotionRepository)[] = [
      'getActivePromotionRewards',
      'getPromotionPeriodUseCount',
      'getPromotionPeriodAccountUseCount',
      'getPromotionCodeUseCount',
      'getPromotionCodeAccountUseCount',
      'getSalePricePromotionRewardsQuery',
      'getRoundingRuleQuery',
    ];

    for (const name of readNames) {
      expect(typeof port[name]).toBe('function');
    }

    // EXHAUSTIVE, so the seven above cannot be a stale subset of a wider port: a member added to
    // `PromotionRepository` leaves this object literal missing a required key, and the file stops
    // compiling. This is the check that would have caught `saveRoundingRule`.
    const portMembers: Readonly<Record<keyof PromotionRepository, true>> = Object.freeze({
      getActivePromotionRewards: true,
      getPromotionPeriodUseCount: true,
      getPromotionPeriodAccountUseCount: true,
      getPromotionCodeUseCount: true,
      getPromotionCodeAccountUseCount: true,
      getSalePricePromotionRewardsQuery: true,
      getRoundingRuleQuery: true,
    });

    expect(Object.keys(portMembers).sort()).toStrictEqual([...readNames].sort());
    expect(readNames).toHaveLength(7);

    // EVERY ONE OF THE SEVEN IS A READ. The write that briefly joined them is pinned absent by name,
    // on the port-typed reference and on the concrete adapter alike, because it went missing from
    // three places at once and any one of them coming back is the regression.
    expect('saveRoundingRule' in port).toBe(false);
    expect('saveRoundingRule' in repository).toBe(false);
    expect(
      Object.getOwnPropertyNames(MysqlPromotionRepository.prototype).includes('saveRoundingRule'),
    ).toBe(false);

    const absent = [
      'saveRoundingRule',
      'deleteRoundingRule',
      'savePromotion',
      'savePromotionApplied',
      'savePromotionReward',
      'savePromotionPeriod',
      'savePromotionCode',
      'savePromotionQualifier',
      'savePromotionAccount',
      'deletePromotion',
      'getPromotionByID',
      'getPromotionAppliedByID',
    ];

    for (const name of absent) {
      expect(Object.prototype.hasOwnProperty.call(port, name)).toBe(false);
      expect(name in port).toBe(false);
    }

    // THE SECOND EXPORTED INTERFACE, ASSERTED BY CONSTRUCTION. `SalePriceResolver` carries exactly
    // one method and lives in the port file rather than in a fourteenth port module. The literal
    // below type-checks only while that remains true - a missing member fails the assignment and a
    // second member trips the excess-property check - and `Object.keys` makes the same fact visible
    // at runtime. It has no adapter class anywhere in the layout by design: it is satisfied in
    // `src/handlers/bootstrap.ts` by adapting the ported `src/services/promotionService.ts` surface,
    // and injected into `Product` from there, which is why no statement of this adapter's serves it.
    const salePriceResolver: SalePriceResolver = {
      getSalePriceDetailsForProductSkus: (_productID: string) => Promise.resolve({}),
    };

    expect(Object.keys(salePriceResolver)).toEqual(['getSalePriceDetailsForProductSkus']);
    expect(typeof salePriceResolver.getSalePriceDetailsForProductSkus).toBe('function');

    expect(graph.promotionPeriod.getPromotionPeriodID()).toBe('promofx-promotion-period');
    expect(graph.promotionCode.getPromotionCodeID()).toBe('promofx-promotion-code');
  });

  it('★ publishes no public member the port does not declare - the build is the assertion', () => {
    // `keyof` IS the public surface: TypeScript excludes `private` and `protected` members from it,
    // and a runtime prototype sweep cannot express the same thing because `private` is ERASED - every
    // private helper in the adapter sits on the prototype indistinguishable from a public one. So the
    // gate is expressed where `public` still means something, in the type system.
    //
    // `Exclude<keyof MysqlPromotionRepository, keyof PromotionRepository>` collapses to `never`
    // exactly when the class publishes nothing beyond the port's seven, and `AssertNever` fails its
    // own constraint the moment it does not. This catches BOTH shapes the drift took: a write added
    // to the port and implemented here, and - the shape a hand-written name list would miss entirely -
    // a private helper promoted to public.
    type ExtraPublicMembers = Exclude<keyof MysqlPromotionRepository, keyof PromotionRepository>;

    type AssertNever<T extends never> = T;
    type NoExtraPublicMembers = AssertNever<ExtraPublicMembers>;

    const extraPublicMembers: NoExtraPublicMembers[] = [];

    expect(extraPublicMembers).toStrictEqual([]);

    // No entity-lifecycle write of any kind reached this adapter, stated by name so a reader sees the
    // class of member the type gate above keeps out.
    const { repository } = makeSubject();

    for (const name of ['saveRoundingRule', 'deleteRoundingRule', 'saveRoundingRuleByID']) {
      expect(name in repository).toBe(false);
    }
  });

  it('★ the port exports the co-located SalePriceResolver contract, with exactly one method', () => {
    // The port is specified as exporting a SECOND interface beside `PromotionRepository`:
    // `SalePriceResolver`, carrying the single method `getSalePriceDetailsForProductSkus`. It is
    // co-located there rather than given its own module because `src/domain/ports/` is locked at
    // thirteen FILES, and it stands in for the `getService("promotionService")` reach at
    // [model/entity/Product.cfc:L519] under transformation rule T2.
    //
    // ★ IT WAS UN-EXPORTED FOR ONE REVISION AND THIS SUITE RECORDED THAT AS A DEPARTURE INSTEAD OF
    // FAILING ON IT. The import below is now what makes the export load-bearing: un-export it again
    // and this file does not compile.
    const oneMethod: Readonly<Record<keyof SalePriceResolver, true>> = Object.freeze({
      getSalePriceDetailsForProductSkus: true,
    });

    expect(Object.keys(oneMethod)).toStrictEqual(['getSalePriceDetailsForProductSkus']);

    // It is a SEPARATE contract, not a member of this port - which is the whole reason the adapter
    // below cannot satisfy it and `src/handlers/bootstrap.ts` does, by adapting the ported
    // `src/services/promotionService.ts` surface.
    const { repository } = makeSubject();

    expect('getSalePriceDetailsForProductSkus' in repository).toBe(false);

    type ResolverIsNotThisPort =
      Extract<keyof SalePriceResolver, keyof PromotionRepository> extends never ? true : false;

    const resolverIsNotThisPort: ResolverIsNotThisPort = true;

    expect(resolverIsNotThisPort).toBe(true);
  });
});
