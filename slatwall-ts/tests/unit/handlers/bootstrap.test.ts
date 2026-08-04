// ---------------------------------------------------------------------------
// The composition root, under test.
//
// ★ 100% NET-NEW COVERAGE. There is no legacy antecedent and none is claimed. The subject replaces
// DI/1 0.4.2's convention scan of `property name="xService";` declarations, and `meta/tests/` holds
// no test of the container at all - `meta/tests/unit/service/` contains only AccountServiceTest,
// HibachiServiceTest, PaymentServiceTest and UtilityRBServiceTest, none of them in scope. Presenting
// anything here as parity would fail the AAP 0.9.4 traceability gate, so nothing here is.
//
// WHAT THIS SUITE OWNS, and what it deliberately does not:
//   - IT OWNS THE WIRING AND THE COMPOSITION. Which tier-1 values are published; that the eager
//     settings read happens once; that the dialect decision refuses a non-MySQL dialect BEFORE any
//     statement is issued; that the memo is a single in-flight promise, that a failed
//     initialization clears it, that `resetCompositionRoot` discards it and that ANY overrides
//     bypass it; that a request scope is fresh per request; and that the one composed pricing
//     operation runs the price-group pass strictly before the promotion pass and projects pass
//     one's intents onto the view pass two reads.
//   - IT DOES NOT OWN REPOSITORY HYDRATION. `tests/integration/repositories/*.test.ts` owns the SQL
//     shape, the column projections and the entity hydration of all six repositories. Rebuilding
//     those row fixtures here would duplicate them and pin the same behaviour twice, in two places
//     that could then drift.
//
// JUDGMENT CALL: the composition step is isolated by substituting the collaborators the SCOPE
// ITSELF PUBLISHES - `scope.priceGroupService` and `scope.priceGroupRepository` - with `vi.spyOn`,
// rather than by seeding the several statements a full price-group hydration would need. This is
// legitimate precisely because `createRequestScope` publishes the very instances the composed
// operation closes over, so substituting one is substituting the collaborator the subject actually
// calls, not a lookalike. `vi` is vitest itself, already one of the fourteen exact pins; NO MOCKING
// LIBRARY IS ADDED, and every spy is restored in a suite-local `afterEach` as well as by the global
// one in `tests/setup.ts`.
//
// JUDGMENT CALL: the executor is a HAND-WRITTEN recording double keyed BY STATEMENT TEXT rather
// than by call ordinal. The subject issues statements from several collaborators in an order this
// suite does not assert and must not accidentally pin, so keying by text is what keeps the seeding
// honest: a statement the subject never issues simply never matches.
//
// P5 (parameterized SQL exclusively) IS NOT APPLICABLE HERE IN SUBSTANCE, and that is recorded
// rather than left implicit. This suite issues no SQL of its own and asserts no parameter binding;
// it observes the statements the subject issues in order to prove ORDER and COUNT, and every
// statement it observes is a literal the subject owns. Binding and injection safety belong to
// `tests/integration/repositories/`.
//
// NO DATABASE, NO POOL, NO NETWORK, NO FILESYSTEM, NO `.env`. Configuration is supplied as an
// EXPLICIT `EnvironmentSource` through `CompositionOverrides.environment`, which
// `appConfig.load(source)` never memoizes - so no case here can leak configuration into another.
// The two variables the credential group requires are supplied as an obviously non-credential
// placeholder solely because the configuration contract validates as a whole; no credential,
// secret, host, IP or connection string appears in this file.
//
// NO USER RULES GOVERN THIS FILE. AAP 0.7 records `review_rules` returning "No user rules
// provided.", so the binding standard is the nine enterprise practices of AAP 0.8.3 and the eight
// constraints of AAP 0.8.1. The absence is not licence to lower the bar.
//
// BUDGET LEDGERS ARE EXHAUSTED AND `src/handlers/**` OWNS NONE OF THEM: three signature
// reshapings, five visibility widenings, one entity-layer widening and three deliberate
// divergences are all spent elsewhere. Nothing here adds a fourth of anything, and no preserved
// defect is repaired.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PriceGroup } from '../../../src/domain/entities/priceGroup.js';
import type { PromotionAppliedIntent } from '../../../src/domain/promotionEngine/qualifiedDiscountTypes.js';
import { Money } from '../../../src/domain/valueObjects/money.js';
import type { OrderItemView } from '../../../src/domain/views/orderItemView.js';
import type { OrderView } from '../../../src/domain/views/orderView.js';
import {
  bootstrapCompositionRoot,
  resetCompositionRoot,
  UntrustedFeedHostError,
  UrlTitleCollisionLimitError,
} from '../../../src/handlers/bootstrap.js';
import type { CompositionRoot, RequestScope } from '../../../src/handlers/bootstrap.js';
import { appConfig } from '../../../src/lib/config.js';
import type { EnvironmentSource } from '../../../src/lib/config.js';
import type {
  PreparedStatementExecutor,
  SqlMutationResult,
  SqlRow,
} from '../../../src/repositories/mysql/connection.js';
import type {
  PriceGroupAppliedIntent,
  PriceGroupService,
} from '../../../src/services/priceGroupService.js';
import type { PromotionService } from '../../../src/services/promotionService.js';
import { makeOrderViewFixture } from '../../fixtures/orderViewFixtures.js';
import { makePriceGroupFixtures } from '../../fixtures/priceGroupFixtures.js';
import { Brand } from '../../../src/domain/entities/brand.js';
import { toCurrencyCode } from '../../../src/domain/valueObjects/currencyCode.js';
// ★ IMPORTED FROM THE COMPOSITION ROOT, NOT FROM THE FEED SERVICE. This type used to be exported
// from `src/integrations/google/googleFeedService.js` beside a branded `TrustedFeedHost` and the
// `toTrustedFeedHost` mint that produced it. A completeness review withdrew all of that from the feed
// module - its authority excludes an allow-list by name - and its own guidance keeps origin policy
// "at the request-handler/configuration boundary" when it is separately authorized, which security
// finding S-15 is. So the refusal now lives in `bootstrap.ts`, reads a list only a deployment can
// write, and is imported from there.

import { BrandPersistenceUnavailableError } from '../../../src/services/brandService.js';
import { MySqlPriceGroupRepository } from '../../../src/repositories/mysql/mysqlPriceGroupRepository.js';

// ---------------------------------------------------------------------------
// The statements this suite observes, quoted from the subject verbatim
// ---------------------------------------------------------------------------

/** `SELECT_CURRENCY_RECORDS_SQL`, the one EAGER read tier 1 performs. */
const CURRENCY_RECORDS_SQL = 'SELECT currencyCode, activeFlag FROM SwCurrency';

/** `SELECT_ACCOUNT_PRICE_GROUP_IDS_SQL`, the first statement the price-group pass issues. */
const ACCOUNT_PRICE_GROUP_IDS_SQL =
  'SELECT priceGroupID FROM SwAccountPriceGroup WHERE accountID = ?';

// ---------------------------------------------------------------------------
// The recording executor
// ---------------------------------------------------------------------------

/** One statement, exactly as the recording executor received it. */
interface RecordedStatement {
  readonly sql: string;
  readonly params: readonly unknown[] | undefined;
}

/** An empty result set. Frozen, so a caller cannot grow one double's answer into another's. */
const NO_ROWS: readonly SqlRow[] = Object.freeze([]);

/**
 * What a mutation would answer if one were ever issued.
 *
 * Nothing in the composition root writes, and the initialization case ASSERTS that - a mutation
 * arriving here would be a real finding, so it is recorded rather than swallowed.
 */
const UNUSED_MUTATION_RESULT: SqlMutationResult = Object.freeze({
  affectedRows: 0,
  warningStatus: 0,
});

/**
 * A hand-written `PreparedStatementExecutor` that records every statement and answers from a
 * text-keyed table.
 *
 * Hand-written because the fourteen exact pins include no mocking library and none may be added,
 * and because what this suite needs from a double is exactly two things a library would not give it
 * more cheaply: the ORDER statements arrived in, and the ability to answer one specific statement
 * while every other one answers nothing.
 */
class RecordingExecutor implements PreparedStatementExecutor {
  /** Every result-set statement, in the order it was issued. */
  public readonly calls: RecordedStatement[] = [];

  /** Every data-modifying statement. Expected to stay empty. */
  public readonly mutationCalls: RecordedStatement[] = [];

  private readonly rowsBySql = new Map<string, readonly SqlRow[]>();

  /** Answer `sql` with `rows`. Every unseeded statement answers no rows. */
  public seed(sql: string, rows: readonly SqlRow[]): this {
    this.rowsBySql.set(sql, rows);

    return this;
  }

  public execute(sql: string, params?: readonly unknown[]): Promise<readonly SqlRow[]> {
    this.calls.push({ sql, params });

    return Promise.resolve(this.rowsBySql.get(sql) ?? NO_ROWS);
  }

  public executeMutation(sql: string, params?: readonly unknown[]): Promise<SqlMutationResult> {
    this.mutationCalls.push({ sql, params });

    return Promise.resolve(UNUSED_MUTATION_RESULT);
  }

  /**
   * Join rather than nest, which is what the port itself does: the callback receives THIS executor,
   * so every statement it issues is recorded in the same sequence as every other.
   */
  public transaction<T>(work: (tx: PreparedStatementExecutor) => Promise<T>): Promise<T> {
    return work(this);
  }

  /** How many times `sql` was issued, by exact text. */
  public countOf(sql: string): number {
    return this.calls.filter((call) => call.sql === sql).length;
  }

  /** The index of the first issue of `sql`, or `-1`. */
  public firstIndexOf(sql: string): number {
    return this.calls.findIndex((call) => call.sql === sql);
  }
}

// ---------------------------------------------------------------------------
// Configuration, supplied explicitly and never read from a file
// ---------------------------------------------------------------------------

/**
 * The value standing in for the two variables the credential group requires.
 *
 * It is not a credential and is not credential-shaped: nothing in this suite opens a connection, an
 * executor override means no pool is ever created, and the value exists only because
 * `src/lib/config.ts` validates the whole contract in one pass and refuses to hand back a dialect
 * while any required variable is missing.
 */
const UNUSED_PLACEHOLDER = 'unused-by-this-suite';

/** Every variable `src/lib/config.ts` requires with no default, with a MIS-CASED dialect spelling. */
const BASE_ENVIRONMENT: EnvironmentSource = Object.freeze({
  DB_HOST: `${UNUSED_PLACEHOLDER}.invalid`,
  DB_USER: UNUSED_PLACEHOLDER,
  DB_PASSWORD: UNUSED_PLACEHOLDER,
  DB_TLS_MODE: 'disabled',
  // `mySql` rather than `MySQL`: three legacy sites spell the product name three different ways, so
  // the case-folding normalization in `src/lib/config.ts` is part of the contract, not a nicety.
  DB_DIALECT: 'mySql',
});

/**
 * The same contract with a product-feed allow-list configured.
 *
 * Finding S-15 moved the allow-list OUT of `RequestScopeInput` and into deployment
 * configuration, so a caller can no longer supply both the candidate and the list it is
 * checked against. Supplying it here is what makes a feed host admissible at all.
 */
const FEED_ENVIRONMENT: EnvironmentSource = Object.freeze({
  ...BASE_ENVIRONMENT,
  FEED_ALLOWED_HOSTS: 'shop.example.com',
});

/** The same contract with a recognized-but-unimplemented dialect. */
const ORACLE_ENVIRONMENT: EnvironmentSource = Object.freeze({
  ...BASE_ENVIRONMENT,
  DB_DIALECT: 'Oracle10g',
});

/**
 * Three currency rows, one of them INACTIVE.
 *
 * The inactive row is the whole point: `getAllActiveCurrencyIDList` applies the
 * `addFilter('activeFlag', 1)` the legacy applies [model/service/CurrencyService.cfc:L60], and
 * record ORDER is preserved because `listAppend` preserved it and the legacy query carries no
 * `ORDER BY`. So the eligible list must be exactly `'USD,GBP'` - not `'USD,EUR,GBP'`, and not
 * `'GBP,USD'`.
 */
const CURRENCY_ROWS: readonly SqlRow[] = Object.freeze([
  Object.freeze({ currencyCode: 'USD', activeFlag: 1 }),
  Object.freeze({ currencyCode: 'EUR', activeFlag: 0 }),
  Object.freeze({ currencyCode: 'GBP', activeFlag: 1 }),
]);

/** The same three currencies with none of them active. */
const INACTIVE_CURRENCY_ROWS: readonly SqlRow[] = Object.freeze([
  Object.freeze({ currencyCode: 'USD', activeFlag: 0 }),
  Object.freeze({ currencyCode: 'EUR', activeFlag: 0 }),
]);

// ---------------------------------------------------------------------------
// Narrowing helpers. `noUncheckedIndexedAccess` is on, so every indexed read is
// narrowed rather than asserted - there is no postfix `!` anywhere in this file.
// ---------------------------------------------------------------------------

function requirePresent<TValue>(value: TValue | undefined, description: string): TValue {
  if (value === undefined) {
    throw new Error(`the suite required ${description}, which was absent`);
  }

  return value;
}

/** The order item at `index`, narrowed. */
function itemAt(order: OrderView, index: number): OrderItemView {
  return requirePresent(order.orderItems[index], `order item ${String(index)}`);
}

/**
 * The `Error` a rejected promise carries.
 *
 * JUDGMENT CALL: the module keeps every one of its five error classes
 * non-exported - `CompositionColumnError` [src/handlers/bootstrap.ts:L630],
 * `CompositionDataError` [L648], `CompositionWiringError` [L663],
 * `ImageStoreNotConfiguredError` [L674] and `SubscriptionTermsNotConfiguredError`
 * [L687] - and so do `dialect.ts` and `config.ts`. A suite cannot `instanceof`
 * a class it cannot import, so refusals are identified by the `name` each
 * constructor assigns to itself plus the message text. That is a weaker
 * assertion than `instanceof`, and it is the strongest one available without
 * widening the module's export surface, which is locked.
 */
async function rejectionOf(run: () => Promise<unknown>): Promise<Error> {
  try {
    await run();
  } catch (error: unknown) {
    if (error instanceof Error) {
      return error;
    }

    throw new Error(`the suite expected an Error and the call raised a ${typeof error}`);
  }

  throw new Error('the suite expected the call to reject, and it resolved');
}

/**
 * The `Error` a synchronous call raises.
 *
 * `createRequestScope` is deliberately SYNCHRONOUS - every read it needs was
 * already performed once at tier one - so its refusals are thrown, not rejected,
 * and they need their own helper.
 */
function raisedBy(run: () => unknown): Error {
  try {
    run();
  } catch (error: unknown) {
    if (error instanceof Error) {
      return error;
    }

    throw new Error(`the suite expected an Error and the call raised a ${typeof error}`);
  }

  throw new Error('the suite expected the call to raise, and it returned');
}

// ---------------------------------------------------------------------------
// Shared construction.
//
// Every case builds its OWN executor. `RecordingExecutor` is a ledger, and a
// shared one would let an earlier case's statements satisfy a later case's count
// assertion - which is the exact vacuity this suite exists to avoid.
// ---------------------------------------------------------------------------

/** A recording executor already seeded with the one statement tier 1 issues. */
function makeExecutor(currencyRows: readonly SqlRow[] = CURRENCY_ROWS): RecordingExecutor {
  return new RecordingExecutor().seed(CURRENCY_RECORDS_SQL, currencyRows);
}

/**
 * Boot with BOTH overrides supplied.
 *
 * Supplying `executor` means `getPreparedStatementExecutor()` is never reached
 * [src/handlers/bootstrap.ts:L2071-L2072], so no `mysql2` pool is created and no
 * socket is opened. Supplying `environment` means `appConfig.load(source)` takes
 * its explicit-source arm [src/lib/config.ts], which does not memoize and does
 * not read `process.env`. Together they are what makes this a unit suite.
 */
/**
 * The two ORDER PASSES, restored FOR OBSERVATION ONLY.
 *
 * The composition root withdraws `updateOrderAmountsWithPriceGroups` and
 * `updateOrderAmountsWithPromotions` from the PUBLISHED TYPES -
 * `RequestScope.priceGroupService` is `Omit<PriceGroupService,
 * 'updateOrderAmountsWithPriceGroups'>` and `RequestScope.promotionService` is the
 * promotion equivalent - so no caller can run either pass alone, which AAP 0.6.1
 * requires be non-optional. It withdraws them from the TYPE, not from the OBJECT: the
 * very instances the composed operation closes over are what the scope publishes,
 * which is precisely why spying on one of these members intercepts the call the
 * composed operation makes.
 *
 * These two readers restate that fact for the type checker, and nothing else. They do
 * NOT widen the contract: the refusal is asserted independently in the trust-boundary
 * half of this file, where a compile-level probe proves both members are unreachable
 * through the published surface.
 */
function observableOrderPass(published: RequestScope['priceGroupService']): PriceGroupService {
  return published as PriceGroupService;
}

/** The promotion half of {@link observableOrderPass}. */
function observablePromotionPass(published: RequestScope['promotionService']): PromotionService {
  return published as PromotionService;
}

/**
 * The SET-BASED by-key price-group read, reached through the port-typed member that publishes it.
 *
 * ★ WHY A READER IS NEEDED AT ALL, AND WHY IT IS SOUND. The composed operation resolves the price
 * groups its intents name through ONE keyed statement -
 * `priceGroupSetLoader.getPriceGroupsByID(ids)` in `src/handlers/bootstrap.ts` - not through one
 * `getPriceGroup` call per identifier. That seventh read is deliberately NOT a port member:
 * `src/domain/ports/priceGroupRepository.ts` locks its count at six explicitly, so only the
 * composition root, which constructs the adapter and therefore holds its concrete type, can reach
 * it. `RequestScope.priceGroupRepository` publishes THE VERY SAME INSTANCE the composed operation
 * closes over, narrowed to the port - so spying here intercepts exactly the call it makes.
 *
 * The narrowing is an `instanceof` test rather than an assertion, so if composition ever publishes
 * something else this fails loudly at the seam instead of silently mocking a method nobody calls.
 */
function observableSetLoader(
  published: RequestScope['priceGroupRepository'],
): MySqlPriceGroupRepository {
  if (!(published instanceof MySqlPriceGroupRepository)) {
    throw new TypeError(
      'RequestScope.priceGroupRepository is expected to be the MySQL adapter, which is what ' +
        'carries the set-based by-key read the composed pricing operation uses.',
    );
  }

  return published;
}

/**
 * Arms the set loader with the price groups a case wants resolvable, keyed the way the real loader
 * keys its answer.
 *
 * CASE-FOLDED KEYS, because the real loader folds: CFML identifiers are case-insensitive and the
 * intent's spelling need not match the stored row's. A key that matches nothing is ABSENT from the
 * map rather than `undefined`-valued, which is the contract the refusal path depends on.
 */
function armSetLoader(scope: RequestScope, resolvable: readonly PriceGroup[]) {
  const answer = new Map<string, PriceGroup>(
    resolvable.map((priceGroup) => [priceGroup.getPriceGroupID().toLowerCase(), priceGroup]),
  );

  return vi
    .spyOn(observableSetLoader(scope.priceGroupRepository), 'getPriceGroupsByID')
    .mockImplementation(
      (priceGroupIDs: readonly string[]): Promise<ReadonlyMap<string, PriceGroup>> =>
        Promise.resolve(
          new Map(
            priceGroupIDs.flatMap((priceGroupID): readonly [string, PriceGroup][] => {
              const resolved = answer.get(priceGroupID.toLowerCase());

              return resolved === undefined ? [] : [[priceGroupID.toLowerCase(), resolved]];
            }),
          ),
        ),
    );
}

function bootWith(
  executor: RecordingExecutor,
  environment: EnvironmentSource = BASE_ENVIRONMENT,
): Promise<CompositionRoot> {
  return bootstrapCompositionRoot({ executor, environment });
}

beforeEach(() => {
  // The memo is module state and `appConfig` carries its own. Both are cleared
  // on the way in as well as on the way out, so a case cannot inherit either
  // from a sibling file that ran earlier in the same worker.
  resetCompositionRoot();
  appConfig.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetCompositionRoot();
  appConfig.reset();
});

// ===========================================================================
// 1. Tier-one initialization - what happens exactly once, before any request.
// ===========================================================================

describe('bootstrapCompositionRoot tier-one initialization', () => {
  it('publishes exactly the five module-scope members and nothing else', async () => {
    const executor = makeExecutor();

    const root = await bootWith(executor);

    // The published surface is asserted as a SET, not member by member, so that
    // a member silently added or dropped fails here rather than passing quietly.
    expect(Object.keys(root).sort()).toEqual([
      'config',
      'createRequestScope',
      'dialect',
      'integration',
      'settingsProvider',
    ]);
    expect(typeof root.createRequestScope).toBe('function');
  });

  it('normalizes the configured dialect spelling and republishes it as its own member', async () => {
    const executor = makeExecutor();

    const root = await bootWith(executor);

    // BASE_ENVIRONMENT spells it `mySql`. `resolveDatabaseDialect` matches
    // without regard to case and then normalizes to the canonical spelling
    // [config/configORM.cfm:L1-L15 is the source of the roster], so BOTH the
    // config member and the republished `dialect` member read `MySQL`.
    expect(root.config.dialect).toBe('MySQL');
    expect(root.dialect).toBe('MySQL');
    expect(root.dialect).toBe(root.config.dialect);
  });

  it('carries the two defaulted database values through from the environment contract', async () => {
    const executor = makeExecutor();

    const root = await bootWith(executor);

    // Only the two non-secret defaults are asserted. Host, user and credential
    // are required with no default, and this suite never asserts their values
    // beyond the placeholder host it supplied itself.
    expect(root.config.database.database).toBe('Slatwall');
    expect(root.config.database.port).toBe(3306);
    expect(root.config.database.host).toBe(`${UNUSED_PLACEHOLDER}.invalid`);
  });

  it('reads SwCurrency exactly once, eagerly, with no parameters, and issues no other statement', async () => {
    const executor = makeExecutor();

    await bootWith(executor);

    // EAGERLY: the count is taken before any request scope exists, so the read
    // cannot have been triggered by request-time work.
    expect(executor.countOf(CURRENCY_RECORDS_SQL)).toBe(1);
    expect(executor.calls).toHaveLength(1);
    expect(executor.mutationCalls).toHaveLength(0);

    // NO PARAMETERS: `readCurrencyRecords` calls `execute(sql)` with one
    // argument [src/handlers/bootstrap.ts:L1939], so the recorded params are
    // `undefined` rather than an empty array.
    const recorded = requirePresent(executor.calls[0], 'the recorded currency read');
    expect(recorded.sql).toBe(CURRENCY_RECORDS_SQL);
    expect(recorded.params).toBeUndefined();
  });

  it('resolves skuEligibleCurrencies from the ACTIVE rows only, preserving the order the rows arrived in', async () => {
    const executor = makeExecutor();

    const root = await bootWith(executor);

    // The seeded rows are USD (active), EUR (INACTIVE), GBP (active).
    expect(root.settingsProvider.setting('skuEligibleCurrencies')).toBe('USD,GBP');

    // Both ways this could go wrong are named explicitly, so the assertion
    // above cannot be satisfied by an implementation that skips the filter or
    // one that sorts the result.
    expect(root.settingsProvider.setting('skuEligibleCurrencies')).not.toBe('USD,EUR,GBP');
    expect(root.settingsProvider.setting('skuEligibleCurrencies')).not.toBe('GBP,USD');
  });

  it('carries the three non-currency settings at their documented defaults', async () => {
    const executor = makeExecutor();

    const root = await bootWith(executor);

    // CFML parity: `skuCurrency` defaults to `USD`
    // [model/service/SettingService.cfc:L221] - the default lives in the setting
    // declaration, never in the entity - and the two URL keys default to `sp`
    // and `spt` [model/service/SettingService.cfc:L178-L179].
    expect(root.settingsProvider.setting('skuCurrency')).toBe('USD');
    expect(root.settingsProvider.setting('globalURLKeyProduct')).toBe('sp');
    expect(root.settingsProvider.setting('globalURLKeyProductType')).toBe('spt');
  });

  it('yields an EMPTY eligible list when no currency row is active, which is the gate the cascade honours', async () => {
    const executor = makeExecutor(INACTIVE_CURRENCY_ROWS);

    const root = await bootWith(executor);

    // CFML parity [model/entity/Sku.cfc:L373]: the whole currency-details body
    // is wrapped in `if(len(setting('skuEligibleCurrencies')))`. An empty list
    // is therefore load-bearing - it closes the gate and every
    // `getPriceByCurrencyCode` call then answers undefined. A port that
    // substituted a fallback here would silently reopen the gate.
    expect(root.settingsProvider.setting('skuEligibleCurrencies')).toBe('');
    expect(executor.countOf(CURRENCY_RECORDS_SQL)).toBe(1);
  });

  it('yields an empty eligible list for an empty currency table without failing', async () => {
    const executor = makeExecutor([]);

    const root = await bootWith(executor);

    expect(root.settingsProvider.setting('skuEligibleCurrencies')).toBe('');
    // The other three settings are unaffected by the currency read.
    expect(root.settingsProvider.setting('skuCurrency')).toBe('USD');
  });

  it('publishes the Google integration adapter at its documented contract values', async () => {
    const executor = makeExecutor();

    const root = await bootWith(executor);

    // LEGACY-DEFECT [integrationServices/google/Integration.cfc:L49]: the
    // component's own `displayname` attribute reads "USA epay" while
    // `getDisplayName()` returns "Google" [L59-L61]. The method is the contract
    // member, so the composition root publishes an adapter that answers
    // "Google", and the attribute artifact is preserved in the adapter itself.
    expect(root.integration.getDisplayName()).toBe('Google');

    // The interface's documented type vocabulary carries no product-feed type,
    // and the legacy adapter registers as `fw1` [google/Integration.cfc:L55-L57].
    expect(root.integration.getIntegrationTypes()).toBe('fw1');
  });

  it('refuses a recognized but unimplemented dialect BEFORE issuing any statement', async () => {
    const executor = makeExecutor();

    const error = await rejectionOf(() => bootWith(executor, ORACLE_ENVIRONMENT));

    expect(error.name).toBe('UnsupportedDialectError');
    expect(error.message).toContain('Oracle10g');
    // The refusal names the decision site, which is what makes the message
    // actionable: `DIALECT_DECISION_SITE` [src/handlers/bootstrap.ts:L581].
    expect(error.message).toContain('bootstrap.ts composition root');

    // ORDERING, and the reason this case is not redundant with dialect.ts's own
    // suite: the gate runs at step 2 of `createModuleScopeGraph`, before the
    // executor is obtained at step 3 and before the eager read at step 4. A zero
    // statement count is the only proof of that ordering available from outside.
    expect(executor.calls).toHaveLength(0);
    expect(executor.countOf(CURRENCY_RECORDS_SQL)).toBe(0);
  });

  it('refuses a dialect spelling the environment contract does not admit, before wiring begins', async () => {
    const executor = makeExecutor();
    const unknownDialect: EnvironmentSource = Object.freeze({
      ...BASE_ENVIRONMENT,
      DB_DIALECT: 'Postgres',
    });

    const error = await rejectionOf(() => bootWith(executor, unknownDialect));

    // Configuration validation is step 1, so an unrecognized spelling never
    // reaches `resolveDialect` at all - it is refused by the environment
    // contract, with the aggregate diagnostic that file produces.
    expect(error.name).toBe('ConfigurationError');
    expect(executor.calls).toHaveLength(0);
  });

  it('refuses a required environment variable that is absent, and names it', async () => {
    const executor = makeExecutor();
    // Rebuilt member by member rather than by rest-destructuring BASE_ENVIRONMENT,
    // so that no binding is declared only to be discarded.
    const incomplete: EnvironmentSource = Object.freeze({
      DB_HOST: BASE_ENVIRONMENT.DB_HOST,
      DB_USER: BASE_ENVIRONMENT.DB_USER,
      DB_TLS_MODE: BASE_ENVIRONMENT.DB_TLS_MODE,
      DB_DIALECT: BASE_ENVIRONMENT.DB_DIALECT,
    });

    const error = await rejectionOf(() => bootWith(executor, incomplete));

    expect(error.name).toBe('ConfigurationError');
    expect(error.message).toContain('DB_PASSWORD');
    // The credential itself must never appear in a diagnostic. BASE_ENVIRONMENT
    // uses a placeholder rather than a credential-shaped literal, and the
    // message is checked for its absence regardless.
    expect(error.message).not.toContain(UNUSED_PLACEHOLDER);
    expect(executor.calls).toHaveLength(0);
  });

  it('refuses a currency row that is missing the currencyCode column, as a schema violation', async () => {
    const executor = makeExecutor([Object.freeze({ activeFlag: 1 })]);

    const error = await rejectionOf(() => bootWith(executor));

    // The `Sw*` schema is unchanged by this migration, so a column the statement
    // selected but the driver did not return is a driver or statement problem,
    // not a data condition - which is exactly what the message says.
    expect(error.name).toBe('CompositionColumnError');
    expect(error.message).toContain('bootstrapSelectCurrencyRecords');
    expect(error.message).toContain('currencyCode');
    expect(error.message).toContain('absent');

    // The read WAS issued: this refusal happens after step 4 begins, unlike the
    // two configuration refusals above.
    expect(executor.countOf(CURRENCY_RECORDS_SQL)).toBe(1);
  });

  it('refuses a currency row whose activeFlag arrives as a type no flag encoding covers', async () => {
    const executor = makeExecutor([
      Object.freeze({ currencyCode: 'USD', activeFlag: { nested: true } }),
    ]);

    const error = await rejectionOf(() => bootWith(executor));

    expect(error.name).toBe('CompositionColumnError');
    expect(error.message).toContain('activeFlag');
    // `describeColumnType` renders the observed type without echoing the value
    // [src/handlers/bootstrap.ts:L899-L913], and for a plain object that is the
    // bare `typeof` result.
    expect(error.message).toContain('a object');
  });

  it('accepts the three flag encodings a MySQL driver can return for activeFlag', async () => {
    // `readFlag` accepts string, number, boolean and Uint8Array, because
    // `SwCurrency.activeFlag` is a bit-ish column and which of those arrives
    // depends on driver options rather than on the schema. All three of the
    // encodings a caller can reasonably meet are exercised in one pass.
    const executor = makeExecutor([
      Object.freeze({ currencyCode: 'USD', activeFlag: true }),
      Object.freeze({ currencyCode: 'EUR', activeFlag: '1' }),
      Object.freeze({ currencyCode: 'GBP', activeFlag: Uint8Array.from([1]) }),
      Object.freeze({ currencyCode: 'JPY', activeFlag: 0 }),
    ]);

    const root = await bootWith(executor);

    expect(root.settingsProvider.setting('skuEligibleCurrencies')).toBe('USD,EUR,GBP');
  });
});

// ===========================================================================
// 2. The memo - warm-container idempotence, and the two ways out of it.
//
// ★ WHY THIS BLOCK DRIVES THE FAILURE PATH RATHER THAN THE SUCCESS PATH ★
//
// The memo is consulted ONLY when no overrides are supplied
// [src/handlers/bootstrap.ts:L2205-L2213], and a no-override boot obtains the
// real `getPreparedStatementExecutor()` and reads `SwCurrency` for real. Whether
// that read succeeds depends on whether a database happens to be reachable from
// wherever the suite runs - which would make the outcome of these cases an
// accident of the host. So this block deliberately makes the process environment
// INVALID for the duration, which forces the no-override path to refuse at
// configuration validation (step 1) before any executor is obtained (step 3) or
// any statement is issued (step 4).
//
// That costs nothing in coverage of the memo itself, because `??=`, the `.catch`
// that clears it, and `resetCompositionRoot` are the SAME code on both paths:
// the memoized value is a promise, and promise IDENTITY - not the value it
// settles to - is what every assertion below turns on. Identity is observable
// synchronously, and it is the only property that distinguishes "shared" from
// "re-initialized".
// ===========================================================================

describe('bootstrapCompositionRoot memoization', () => {
  /**
   * Blank a required variable that has no default, so a no-override boot is
   * guaranteed to refuse at step 1 on any host, database present or not.
   */
  function forceInvalidProcessEnvironment(): void {
    vi.stubEnv('DB_HOST', '');
    appConfig.reset();
  }

  it('hands two synchronous no-override callers the SAME in-flight promise', async () => {
    forceInvalidProcessEnvironment();

    // No `await` between them, which is the concurrent-cold-start case: the
    // first call assigns the memo, the second finds it already assigned.
    const first = bootstrapCompositionRoot();
    const second = bootstrapCompositionRoot();

    expect(second).toBe(first);

    const error = await rejectionOf(() => first);
    expect(error.name).toBe('ConfigurationError');
    expect(error.message).toContain('DB_HOST');
    await expect(second).rejects.toThrow(/DB_HOST/);
  });

  it('clears the memo when initialization fails, so a later invocation retries', async () => {
    forceInvalidProcessEnvironment();

    const failed = bootstrapCompositionRoot();
    await expect(failed).rejects.toThrow(/DB_HOST/);

    // A warm container must not inherit a permanently rejected promise. A
    // DIFFERENT promise object is the proof that the `.catch` arm cleared the
    // memo rather than leaving the rejected one in place.
    const retried = bootstrapCompositionRoot();
    expect(retried).not.toBe(failed);
    await expect(retried).rejects.toThrow(/DB_HOST/);
  });

  it('discards the memo on resetCompositionRoot, mid-flight, without settling it', async () => {
    forceInvalidProcessEnvironment();

    const first = bootstrapCompositionRoot();
    const shared = bootstrapCompositionRoot();
    expect(shared).toBe(first);

    resetCompositionRoot();

    const afterReset = bootstrapCompositionRoot();
    expect(afterReset).not.toBe(first);

    // Every promise handed out is still settled, so none of them becomes an
    // unhandled rejection - and the reset did not cancel the in-flight one.
    await expect(first).rejects.toThrow(/DB_HOST/);
    await expect(afterReset).rejects.toThrow(/DB_HOST/);
  });

  it('bypasses the memo entirely when ANY overrides are supplied', async () => {
    const executor = makeExecutor();

    const first = bootstrapCompositionRoot({ executor, environment: BASE_ENVIRONMENT });
    const second = bootstrapCompositionRoot({ executor, environment: BASE_ENVIRONMENT });

    // Distinct promises, and therefore distinct graphs: an override caller must
    // never be served a root that another caller composed.
    expect(second).not.toBe(first);

    const [firstRoot, secondRoot] = await Promise.all([first, second]);
    expect(secondRoot).not.toBe(firstRoot);
    expect(secondRoot.settingsProvider).not.toBe(firstRoot.settingsProvider);

    // Two independent graphs each performed their own eager read. One read would
    // mean the memo had leaked into the override path.
    expect(executor.countOf(CURRENCY_RECORDS_SQL)).toBe(2);
  });

  it('leaves the memo untouched after an override boot, so a no-override caller still initializes itself', async () => {
    const executor = makeExecutor();

    const overridden = await bootWith(executor);
    expect(overridden.dialect).toBe('MySQL');

    forceInvalidProcessEnvironment();

    // If the override boot had populated the memo, this would resolve to
    // `overridden`. It must refuse instead.
    await expect(bootstrapCompositionRoot()).rejects.toThrow(/DB_HOST/);

    // And the override boot's own executor saw exactly its own one read - the
    // refused no-override attempt issued nothing at all.
    expect(executor.countOf(CURRENCY_RECORDS_SQL)).toBe(1);
  });

  it('creates no pool and opens no socket on the override path, which is what makes this a unit suite', async () => {
    const executor = makeExecutor();

    await bootWith(executor);

    // Every statement the graph issued went to the recording executor. If
    // `getPreparedStatementExecutor()` had been reached, the eager read would
    // have gone to a pool instead and this ledger would be empty.
    expect(executor.calls).toHaveLength(1);
    expect(executor.calls.map((recorded: RecordedStatement): string => recorded.sql)).toEqual([
      CURRENCY_RECORDS_SQL,
    ]);
  });

  it('is safe to reset when nothing was ever memoized', () => {
    // `resetCompositionRoot` is called from this suite's own hooks and from
    // every handler test; it must be a no-op rather than a fault when the memo
    // is already empty. It also does NOT close the pool, by design - the pool
    // outlives the memo across warm invocations.
    expect(() => {
      resetCompositionRoot();
      resetCompositionRoot();
    }).not.toThrow();
  });
});

// ===========================================================================
// 3. Request scopes - what is fresh per request, and what is refused at the door.
// ===========================================================================

describe('createRequestScope', () => {
  const PINNED_INSTANT = new Date('2024-03-01T12:00:00.000Z');
  const FEED_HOST = 'shop.example.com';
  // Declared here rather than reused from the order fixtures, whose golden
  // account identifier is module-local to that file and carries a per-call
  // prefix. This suite needs a value it controls, not one it inherits.
  const ACCOUNT_ID = 'account-bootstrap-scope-1';

  it('publishes exactly the nineteen documented members', async () => {
    const root = await bootWith(makeExecutor());

    const scope = root.createRequestScope();

    // Asserted as a set for the same reason the module-scope surface is: a
    // member quietly added or dropped must fail here.
    expect(Object.keys(scope).sort()).toEqual([
      'brandService',
      'currencyConverter',
      'currentAccountContext',
      'getSalePriceDetailsForProductSkus',
      'now',
      'optionRepository',
      'optionService',
      'priceGroupRepository',
      'priceGroupService',
      'productFeedPort',
      'productRepository',
      'productService',
      'productTypeRepository',
      'promotionRepository',
      'promotionService',
      'roundingRuleService',
      'skuRepository',
      'skuService',
      'updateOrderAmountsWithPriceGroupsThenPromotions',
    ]);
  });

  it('hands every request its OWN service and repository instances', async () => {
    const root = await bootWith(makeExecutor());

    const first = root.createRequestScope();
    const second = root.createRequestScope();

    expect(second).not.toBe(first);

    // ★ WHY PER-REQUEST FRESHNESS IS A CORRECTNESS PROPERTY, NOT A STYLE CHOICE.
    // AAP 0.6.5 catalogues four component-level mutable caches in the legacy
    // slice - `SkuDAO.variables.nextOptionGroupSortOrder`
    // [model/dao/SkuDAO.cfc:L204-L220], whose clear method's condition is
    // inverted so it can never fire [L222-L226];
    // `RoundingRuleService.variables.roundingRuleDetails`
    // [model/service/RoundingRuleService.cfc:L67-L77]; and every entity memo. On
    // a warm Lambda container, module-scope instances would turn each of those
    // into state shared between unrelated customers' requests. Fresh instances
    // per scope are what neutralize them.
    expect(second.roundingRuleService).not.toBe(first.roundingRuleService);
    expect(second.priceGroupService).not.toBe(first.priceGroupService);
    expect(second.promotionService).not.toBe(first.promotionService);
    expect(second.productService).not.toBe(first.productService);
    expect(second.skuService).not.toBe(first.skuService);
    expect(second.brandService).not.toBe(first.brandService);
    expect(second.optionService).not.toBe(first.optionService);
    expect(second.priceGroupRepository).not.toBe(first.priceGroupRepository);
    expect(second.skuRepository).not.toBe(first.skuRepository);
    expect(second.promotionRepository).not.toBe(first.promotionRepository);
    expect(second.currencyConverter).not.toBe(first.currencyConverter);
  });

  it('opening a scope issues no statement of its own', async () => {
    const executor = makeExecutor();
    const root = await bootWith(executor);

    root.createRequestScope();
    root.createRequestScope();
    root.createRequestScope();

    // Scope construction is pure wiring. The only statement on the ledger is
    // still the single eager tier-one read - three scopes added nothing, which
    // is what makes the tier-one/tier-two split worth having.
    expect(executor.calls).toHaveLength(1);
    expect(executor.countOf(CURRENCY_RECORDS_SQL)).toBe(1);
  });

  it('adopts an injected instant rather than minting one', async () => {
    const root = await bootWith(makeExecutor());

    const scope = root.createRequestScope({ now: PINNED_INSTANT });

    // ★ VALUE, AND DELIBERATELY NOT IDENTITY. The scope must carry the caller's instant so
    // that every date comparison inside one request - `PromotionPeriod.isCurrent(now)` among
    // them, the one entity signature widened for exactly this reason - reads a single instant
    // instead of drifting mid-request. What it must NOT do is hand back the baseline itself.
    //
    // ★ QUOTE-THEN-REVISE. This assertion used to read `toBe(PINNED_INSTANT)` under the
    // heading "Identity, not equality", which was true of an earlier revision that stored the
    // caller's `Date`. The graph now holds its epoch as a PRIMITIVE and every consumer takes
    // its own reading through the injected request clock, so this exposure is NOT the baseline
    // any repository, entity or the feed service compares against - which is what lets one
    // request bind ONE instant across the promotion, sale-price, price-group and feed paths
    // without also making that instant reachable for mutation. Asserting identity would now
    // assert the mutable-baseline arrangement that was deliberately removed, so the VALUE is
    // pinned and the copy is pinned alongside it.
    expect(scope.now.getTime()).toBe(PINNED_INSTANT.getTime());
    expect(scope.now).toStrictEqual(PINNED_INSTANT);
    expect(scope.now).not.toBe(PINNED_INSTANT);
  });

  it('mints its own instant when none is injected, and a distinct one per scope', async () => {
    const root = await bootWith(makeExecutor());
    const before = Date.now();

    const scope = root.createRequestScope();
    const scopeFromEmptyInput = root.createRequestScope({});

    const after = Date.now();

    expect(scope.now).toBeInstanceOf(Date);
    expect(scope.now.getTime()).toBeGreaterThanOrEqual(before);
    expect(scope.now.getTime()).toBeLessThanOrEqual(after);
    expect(scope.now).not.toBe(PINNED_INSTANT);

    // An empty input object and no input at all take the same arm
    // [src/handlers/bootstrap.ts:L2182-L2183 collapses `undefined` to `{}`], and
    // each mints its own Date rather than sharing one.
    expect(scopeFromEmptyInput.now).not.toBe(scope.now);
  });

  it('reflects an absent accountID as an EMPTY current-account context', async () => {
    const root = await bootWith(makeExecutor());

    const scope = root.createRequestScope();

    // `exactOptionalPropertyTypes` is on, so "absent" means the key is not
    // present at all rather than present-and-undefined. Both are asserted,
    // because only the second distinguishes the two.
    expect(scope.currentAccountContext).toEqual({});
    expect('accountID' in scope.currentAccountContext).toBe(false);
    expect(scope.currentAccountContext.accountID).toBeUndefined();
  });

  it('reflects a supplied accountID as a populated current-account context', async () => {
    const root = await bootWith(makeExecutor());

    const scope = root.createRequestScope({ accountID: ACCOUNT_ID });

    expect(scope.currentAccountContext.accountID).toBe(ACCOUNT_ID);
    expect('accountID' in scope.currentAccountContext).toBe(true);

    // The ambient `getSlatwallScope()` this replaces
    // [model/service/PriceGroupService.cfc:L262-L268] was reached from inside the
    // service; here it is a parameter the scope carries, which is transformation
    // rule T6 and also normalizes the legacy divergence between the two scope
    // accessors.
  });

  it('omits productFeedPort entirely unless a feed host is requested', async () => {
    const root = await bootWith(makeExecutor());

    const scope = root.createRequestScope({ accountID: ACCOUNT_ID, now: PINNED_INSTANT });

    // Undefined rather than a port that refuses on use: the feed capability is
    // simply not present on a scope that did not ask for it.
    expect(scope.productFeedPort).toBeUndefined();
  });

  it('publishes productFeedPort for a host on the allow-list, folding case and trimming', async () => {
    const root = await bootWith(makeExecutor(), FEED_ENVIRONMENT);

    const scope = root.createRequestScope({
      now: PINNED_INSTANT,
      feedHost: '  Shop.Example.COM  ',
    });

    // `toTrustedFeedHost` normalizes with `trim().toLowerCase()` before it
    // compares, so a host that differs from the allow-list entry only by
    // surrounding whitespace and letter case is admitted.
    const feedPort = requirePresent(scope.productFeedPort, 'the product feed port');
    expect(typeof feedPort.generateProductFeed).toBe('function');
  });

  it('refuses a feed host that is not on the allow-list, and says so', async () => {
    const root = await bootWith(makeExecutor(), FEED_ENVIRONMENT);

    const error = raisedBy(() => root.createRequestScope({ feedHost: 'attacker.example.net' }));

    expect(error.name).toBe('UntrustedFeedHostError');
    expect(error.message).toContain('allow-list');
  });

  it('refuses a feed host that is empty or only whitespace', async () => {
    const root = await bootWith(makeExecutor(), FEED_ENVIRONMENT);

    const error = raisedBy(() => root.createRequestScope({ feedHost: '   ' }));

    expect(error.name).toBe('UntrustedFeedHostError');
    expect(error.message).toContain('empty');
  });

  it('refuses a URL where a host belongs, by membership rather than by grammar', async () => {
    const root = await bootWith(makeExecutor(), FEED_ENVIRONMENT);

    // ★ QUOTE-THEN-REVISE. This case asserted `toContain('bare host authority')`, against a
    // revision in which the composition root ran a host GRAMMAR of its own before consulting the
    // list, with the comment "a scheme, a path, credentials, a query, a fragment, whitespace or a
    // non-ASCII character each disqualify the candidate before the allow-list is even consulted".
    // That grammar was a SECOND COPY of the one `rssFeedRenderer.ts` owns - same character class,
    // same 259-character bound - and a completeness review removed the duplicate. It was not
    // re-created here, so this root now checks MEMBERSHIP and nothing else.
    //
    // The candidate is still refused, and refused for a reason that cannot be bypassed: an
    // allow-list holds bare authorities, so a URL cannot equal an entry in it. What changes is the
    // message, and the case asserts the grammar is NOT what did the refusing so a future re-added
    // duplicate would be visible here rather than silently absorbed.
    const error = raisedBy(() =>
      root.createRequestScope({ feedHost: `https://${FEED_HOST}/feed/product` }),
    );

    expect(error.name).toBe('UntrustedFeedHostError');
    expect(error.message).toContain('allow-list');
    expect(error.message).not.toContain('bare host authority');
  });

  it('describes a refused candidate WITHOUT reproducing it', async () => {
    // ★★ THE SECURITY PROPERTY THIS ERROR EXISTS TO NOT VIOLATE, MOVED HERE WITH THE REFUSAL.
    // A comment review raised it as MAJOR that the withdrawn mint echoed the rejected candidate
    // verbatim - `The feed host ${JSON.stringify(candidate)} ...` - under a JSDoc claim that a
    // pre-validation host "is not a secret". It can be: the very traits that get a candidate
    // refused are the ones that make it sensitive, since a `user:password@` authority carries
    // credentials and a query string can carry a token, and either would then be written to
    // whatever collects the throw. The case that pinned this lived in
    // `tests/unit/integrations/google/googleFeedService.test.ts` while the mint did; it is pinned
    // here now, because this is where the refusal is.
    const root = await bootWith(makeExecutor(), FEED_ENVIRONMENT);
    const secretBearingCandidate = 'admin:sup3rs3cret@feed.example.invalid?token=abc123';

    const error = raisedBy(() => root.createRequestScope({ feedHost: secretBearingCandidate }));

    expect(error.name).toBe('UntrustedFeedHostError');

    // Not the value, and not any part of it that could carry the secret.
    expect(error.message).not.toContain(secretBearingCandidate);
    expect(error.message).not.toContain('sup3rs3cret');
    expect(error.message).not.toContain('abc123');

    // What it says instead: the reason, plus a summary built only from DERIVED facts - a length
    // and trait names that are constants in the source rather than substrings of the input.
    expect(error.message).toContain('allow-list');
    expect(error.message).toContain('The value itself is not reproduced');
    expect(error.message).toContain(String(secretBearingCandidate.length));
    expect(error.message).toContain('credentials');
    expect(error.message).toContain('a query');

    // And the two halves are separately reachable, for a caller that logs the diagnosis, or
    // branches on the ground of the refusal, without parsing a sentence. The suite that pinned
    // this on the withdrawn mint asserted both members, so both are asserted here.
    const raised = error as unknown as {
      readonly candidateSummary?: unknown;
      readonly reason?: unknown;
    };

    expect(typeof raised.candidateSummary).toBe('string');
    expect(String(raised.candidateSummary)).not.toContain('sup3rs3cret');
    expect(String(raised.candidateSummary)).toContain('credentials');
    expect(raised.reason).toBe('it is not on this deployment\u2019s allow-list');
  });

  it('refuses BEFORE it builds anything, so no feed port holds an unlisted origin', async () => {
    // Moved here with the refusal, from the case that asserted the withdrawn constructor guard
    // "refuses BEFORE constructing, so no instance holds a bad origin and no read is issued". The
    // property is the same one and it is now this root's: the check runs inside
    // `createProductFeedPort`, so a refused candidate yields no `GoogleFeedService` at all, and
    // because the port is built lazily per request nothing was read to find that out.
    const executor = makeExecutor();
    const root = await bootWith(executor, FEED_ENVIRONMENT);
    const statementsBefore = executor.calls.length;

    expect(() => root.createRequestScope({ feedHost: 'attacker.example.net' })).toThrow(
      UntrustedFeedHostError,
    );

    expect(executor.calls).toHaveLength(statementsBefore);
  });

  it('refuses a feed host when the allow-list is empty, rather than admitting everything', async () => {
    // No `FEED_ALLOWED_HOSTS` in this environment, so the configured list is EMPTY - the
    // deliberate default, because an empty list matches nothing and a deployment that does
    // not serve a feed therefore cannot accidentally serve one.
    const root = await bootWith(makeExecutor());

    const error = raisedBy(() => root.createRequestScope({ feedHost: FEED_HOST }));

    expect(error.name).toBe('UntrustedFeedHostError');
    expect(error.message).toContain('allow-list');
  });

  it('resolves both construction cycles before returning, so no wiring fault is reachable', async () => {
    const root = await bootWith(makeExecutor());

    const scope = root.createRequestScope({ now: PINNED_INSTANT });

    // The rounding-rule binding and the three-method price-group delegate are
    // both `undefined` while the graph is being built and are assigned before
    // the scope is returned. `CompositionWiringError` exists only to make that
    // window expressible without a cast or a non-null assertion, and it must be
    // unreachable through any published entry point. Driving a real rounding
    // call through the published instance is the proof.
    //
    // 12.3456 with the expression `.99`, Closest, is one of the nine cases
    // AAP 0.6.4 measured against the legacy algorithm: the two-decimal mask
    // makes it 12.35, the lower candidate is 11.99 and the upper 12.99, and
    // 11.99 is nearer.
    expect(
      scope.roundingRuleService.roundValue(Money.fromDecimalString('12.3456'), '.99', 'Closest'),
    ).toBe('11.99');

    expect(
      typeof observableOrderPass(scope.priceGroupService).updateOrderAmountsWithPriceGroups,
    ).toBe('function');
    expect(typeof scope.getSalePriceDetailsForProductSkus).toBe('function');
    expect(typeof scope.updateOrderAmountsWithPriceGroupsThenPromotions).toBe('function');
  });

  it('carries the eagerly-read currency records into every scope-level converter', async () => {
    const executor = makeExecutor();
    const root = await bootWith(executor);

    const scope = root.createRequestScope();
    const activeCurrencies = await scope.currencyConverter.getAllActiveCurrencyIDList();

    // The converter is built per scope from the module-scope currency records, so
    // it answers from the eager read and issues nothing of its own - the ledger
    // still shows exactly one statement afterwards.
    expect(activeCurrencies.map(String)).toEqual(['USD', 'GBP']);
    expect(executor.countOf(CURRENCY_RECORDS_SQL)).toBe(1);

    // CFML parity [model/service/SettingService.cfc:L222]: the setting's default
    // IS `getCurrencyService().getAllActiveCurrencyIDList()`, and the legacy
    // returns a comma-delimited list string rather than an array. Both shapes are
    // therefore correct in their own place, and they must agree.
    expect(root.settingsProvider.setting('skuEligibleCurrencies')).toBe(
      activeCurrencies.map(String).join(','),
    );
  });
});

// ===========================================================================
// 4. The composed pricing operation.
//
// ★ THIS IS THE ONE CROSS-SERVICE ORDERING CONSTRAINT THE LEGACY LEAVES IMPLICIT.
//
// `updateOrderAmountsWithPromotions` chooses its discount base differently
// depending on whether the item is price-group eligible
// [model/service/PromotionService.cfc:L241-L254]: an ineligible item uses
// `getPrice()`, an eligible one uses `getSkuPrice()` plus a correction term. The
// value that discriminator reads is written by
// `PriceGroupService.updateOrderAmountsWithPriceGroups`
// [model/service/PriceGroupService.cfc:L364-L375]. In the legacy system the
// ordering holds only because `OrderService` happens to call them in that
// sequence [model/service/OrderService.cfc:L60-L61]. Here the composition root
// owns the sequence, and these cases are what hold it.
//
// JUDGMENT CALL - WHY SPIES ARE LEGITIMATE HERE. `createRequestScope` publishes
// the very `priceGroupService`, `promotionService` and `priceGroupRepository`
// instances that the composed closure captured, so `vi.spyOn` on a published
// member substitutes the collaborator the subject actually calls. No mocking
// library is added - `vi` is vitest itself - and the suite-level `afterEach`
// restores every spy. The alternative, a hand-written double, cannot be injected
// at all: `CompositionOverrides` exposes an executor, an environment and a rate
// table, and deliberately no service seam.
// ===========================================================================

describe('updateOrderAmountsWithPriceGroupsThenPromotions', () => {
  /** A scope over a recording executor, plus the fixtures the cases price against. */
  async function openScope(): Promise<{
    readonly scope: RequestScope;
    readonly order: OrderView;
    readonly priceGroup: PriceGroup;
    readonly otherPriceGroup: PriceGroup;
  }> {
    const root = await bootWith(makeExecutor());
    const fixtures = makePriceGroupFixtures();

    return {
      scope: root.createRequestScope(),
      order: makeOrderViewFixture(),
      priceGroup: fixtures.rootPriceGroup,
      otherPriceGroup: fixtures.siblingPriceGroup,
    };
  }

  /**
   * Substitutes the promotion pass with one that records the view it was handed.
   *
   * The capture is an ARRAY rather than a reassigned `let` on purpose: control-flow
   * analysis cannot see that a callback ran, so a `let` narrows to `undefined` at
   * the assertion and forces either a cast or a non-null assertion. Neither is
   * permitted here, and an array needs neither. It also lets a case assert HOW
   * MANY times the pass ran, which a scalar cannot.
   */
  function capturePromotionPassInput(scope: RequestScope): readonly OrderView[] {
    const captured: OrderView[] = [];

    // Not an `async` arrow: there is nothing to await, and an `async` function
    // with no `await` is a lint error here. `Promise.resolve` satisfies the
    // signature honestly instead.
    vi.spyOn(
      observablePromotionPass(scope.promotionService),
      'updateOrderAmountsWithPromotions',
    ).mockImplementation((candidate: OrderView): Promise<PromotionAppliedIntent[]> => {
      captured.push(candidate);

      return Promise.resolve([]);
    });

    return captured;
  }

  it('runs the price-group pass strictly BEFORE the promotion pass', async () => {
    const { scope, order } = await openScope();
    const sequence: string[] = [];

    vi.spyOn(
      observableOrderPass(scope.priceGroupService),
      'updateOrderAmountsWithPriceGroups',
    ).mockImplementation((): Promise<PriceGroupAppliedIntent[]> => {
      sequence.push('priceGroups');

      return Promise.resolve([]);
    });
    vi.spyOn(
      observablePromotionPass(scope.promotionService),
      'updateOrderAmountsWithPromotions',
    ).mockImplementation((): Promise<PromotionAppliedIntent[]> => {
      sequence.push('promotions');

      return Promise.resolve([]);
    });

    await scope.updateOrderAmountsWithPriceGroupsThenPromotions(order);

    // Recorded rather than inferred: reversing the two lines in the composed
    // operation flips this array and nothing else in the suite would notice.
    expect(sequence).toEqual(['priceGroups', 'promotions']);
  });

  it('returns exactly the three documented members, each being the value its pass produced', async () => {
    const { scope, order, priceGroup } = await openScope();
    const intents: PriceGroupAppliedIntent[] = [
      {
        orderItemID: itemAt(order, 0).orderItemID,
        price: Money.fromDecimalString('15.00'),
        priceGroupID: priceGroup.getPriceGroupID(),
      },
    ];
    const promotionIntents: PromotionAppliedIntent[] = [];

    vi.spyOn(
      observableOrderPass(scope.priceGroupService),
      'updateOrderAmountsWithPriceGroups',
    ).mockResolvedValue(intents);
    vi.spyOn(
      observablePromotionPass(scope.promotionService),
      'updateOrderAmountsWithPromotions',
    ).mockResolvedValue(promotionIntents);
    armSetLoader(scope, [priceGroup]);

    const result = await scope.updateOrderAmountsWithPriceGroupsThenPromotions(order);

    expect(Object.keys(result).sort()).toEqual([
      'priceGroupIntents',
      'pricedOrder',
      'promotionIntents',
    ]);
    // Identity, so neither array can have been rebuilt, filtered or reordered on
    // the way out.
    expect(result.priceGroupIntents).toBe(intents);
    expect(result.promotionIntents).toBe(promotionIntents);
  });

  it('hands the promotion pass the PROJECTED order rather than the caller\u2019s order', async () => {
    const { scope, order, priceGroup } = await openScope();
    const projectedPrice = Money.fromDecimalString('15.00');

    vi.spyOn(
      observableOrderPass(scope.priceGroupService),
      'updateOrderAmountsWithPriceGroups',
    ).mockResolvedValue([
      {
        orderItemID: itemAt(order, 0).orderItemID,
        price: projectedPrice,
        priceGroupID: priceGroup.getPriceGroupID(),
      },
    ]);
    armSetLoader(scope, [priceGroup]);
    const captured = capturePromotionPassInput(scope);

    const result = await scope.updateOrderAmountsWithPriceGroupsThenPromotions(order);

    expect(captured).toHaveLength(1);

    const pricedOrder = requirePresent(captured[0], 'the order the promotion pass read');
    expect(pricedOrder).not.toBe(order);
    expect(pricedOrder).toBe(result.pricedOrder);
    // The L241 discriminator reads BOTH of these, so both must be present on the
    // view pass two receives.
    expect(itemAt(pricedOrder, 0).price.toFixed2()).toBe('15.00');
    expect(itemAt(pricedOrder, 0).appliedPriceGroup).toBe(priceGroup);
  });

  it('projects price, extendedPrice and appliedPriceGroup, and leaves the sku-price pair alone', async () => {
    const { scope, order, priceGroup } = await openScope();
    const originalItem = itemAt(order, 0);
    const projectedPrice = Money.fromDecimalString('15.00');

    vi.spyOn(
      observableOrderPass(scope.priceGroupService),
      'updateOrderAmountsWithPriceGroups',
    ).mockResolvedValue([
      {
        orderItemID: originalItem.orderItemID,
        price: projectedPrice,
        priceGroupID: priceGroup.getPriceGroupID(),
      },
    ]);
    armSetLoader(scope, [priceGroup]);
    vi.spyOn(
      observablePromotionPass(scope.promotionService),
      'updateOrderAmountsWithPromotions',
    ).mockResolvedValue([]);

    const result = await scope.updateOrderAmountsWithPriceGroupsThenPromotions(order);
    const projectedItem = itemAt(result.pricedOrder, 0);

    expect(projectedItem.price).toBe(projectedPrice);
    // `extendedPrice` is derived and never stored [model/entity/OrderItem.cfc:L200],
    // so a changed price necessarily changes it: 15.00 x 3.
    expect(projectedItem.extendedPrice.toFixed2()).toBe(
      projectedPrice.times(originalItem.quantity).toFixed2(),
    );
    expect(projectedItem.appliedPriceGroup).toBe(priceGroup);

    // The sku-price pair is the OTHER half of the L241-L254 correction term. If
    // the projection touched it, the correction would double-count.
    expect(projectedItem.skuPrice).toBe(originalItem.skuPrice);
    expect(projectedItem.extendedSkuPrice).toBe(originalItem.extendedSkuPrice);
    expect(projectedItem.quantity).toBe(originalItem.quantity);
    expect(projectedItem.orderItemID).toBe(originalItem.orderItemID);
    expect(projectedItem.sku).toBe(originalItem.sku);
  });

  it('leaves every order-level member of the projected view untouched', async () => {
    const { scope, order, priceGroup } = await openScope();

    vi.spyOn(
      observableOrderPass(scope.priceGroupService),
      'updateOrderAmountsWithPriceGroups',
    ).mockResolvedValue([
      {
        orderItemID: itemAt(order, 0).orderItemID,
        price: Money.fromDecimalString('15.00'),
        priceGroupID: priceGroup.getPriceGroupID(),
      },
    ]);
    armSetLoader(scope, [priceGroup]);
    vi.spyOn(
      observablePromotionPass(scope.promotionService),
      'updateOrderAmountsWithPromotions',
    ).mockResolvedValue([]);

    const { pricedOrder } = await scope.updateOrderAmountsWithPriceGroupsThenPromotions(order);

    expect(pricedOrder.orderID).toBe(order.orderID);
    expect(pricedOrder.accountID).toBe(order.accountID);
    expect(pricedOrder.orderType).toBe(order.orderType);
    expect(pricedOrder.promotionCodeList).toBe(order.promotionCodeList);
    expect(pricedOrder.totalSaleQuantity).toBe(order.totalSaleQuantity);
    // Fulfillments are handed across by identity - the projection is an
    // item-level operation and touches nothing else.
    expect(pricedOrder.orderFulfillments).toBe(order.orderFulfillments);
  });

  it('does not disturb the projection when no price-group intent names an item', async () => {
    const { scope, order } = await openScope();

    vi.spyOn(
      observableOrderPass(scope.priceGroupService),
      'updateOrderAmountsWithPriceGroups',
    ).mockResolvedValue([]);
    const load = armSetLoader(scope, []);
    const captured = capturePromotionPassInput(scope);

    const result = await scope.updateOrderAmountsWithPriceGroupsThenPromotions(order);

    // IDENTITY, not a rebuilt equal: an empty intent list is a NORMAL outcome -
    // the L369 conditional declining for every item - and the view is handed on
    // untouched so nothing downstream sees a disturbed reference.
    expect(captured).toHaveLength(1);
    expect(captured[0]).toBe(order);
    expect(result.pricedOrder).toBe(order);
    // And no price group is resolved, because there is no intent to resolve one
    // from - the repository is never reached at all. Not even with an EMPTY key set: the
    // composed operation returns before it would ask, so this is a statement that is never
    // issued rather than one issued with nothing in it.
    expect(load).not.toHaveBeenCalled();
  });

  it('loads each DISTINCT price group exactly once, however many items name it', async () => {
    const { scope, order, priceGroup, otherPriceGroup } = await openScope();
    const sharedID = priceGroup.getPriceGroupID();
    const otherID = otherPriceGroup.getPriceGroupID();

    expect(sharedID).not.toBe(otherID);

    vi.spyOn(
      observableOrderPass(scope.priceGroupService),
      'updateOrderAmountsWithPriceGroups',
    ).mockResolvedValue([
      {
        orderItemID: itemAt(order, 0).orderItemID,
        price: Money.fromDecimalString('15.00'),
        priceGroupID: sharedID,
      },
      {
        orderItemID: itemAt(order, 1).orderItemID,
        price: Money.fromDecimalString('14.00'),
        priceGroupID: sharedID,
      },
      {
        orderItemID: itemAt(order, 2).orderItemID,
        price: Money.fromDecimalString('6.00'),
        priceGroupID: otherID,
      },
    ]);
    const load = armSetLoader(scope, [priceGroup, otherPriceGroup]);
    vi.spyOn(
      observablePromotionPass(scope.promotionService),
      'updateOrderAmountsWithPromotions',
    ).mockResolvedValue([]);

    const { pricedOrder } = await scope.updateOrderAmountsWithPriceGroupsThenPromotions(order);

    // Three intents, two distinct price groups, ONE keyed read. De-duplicating is a correctness
    // measure and not only an efficiency one: the L241 comparison
    // `reward.hasEligiblePriceGroup(...)` compares ENTITIES, so two separately loaded views of one
    // price group could answer it differently. The set read guarantees agreement STRUCTURALLY - it
    // answers KEYED BY IDENTIFIER, so the two items naming one group receive one instance whatever
    // the key list looked like.
    expect(load).toHaveBeenCalledTimes(1);

    // ★ WHERE THE DE-DUPLICATION HAPPENS, STATED EXACTLY. The composed operation asks for one key
    // PER SURVIVING INTENT - three here - and the adapter folds the list before binding it, so the
    // STATEMENT carries each identifier once. That split is deliberate: the projection needs the
    // per-intent list anyway to walk its refusal check, and folding is the loader's own documented
    // contract. The statement-level guarantee is pinned where it belongs, on the adapter, in
    // `tests/integration/repositories/mysqlPriceGroupRepository.test.ts`.
    const requested = requirePresent(load.mock.calls[0], 'the set-loader call')[0];
    expect(requested).toHaveLength(3);
    expect([...new Set(requested)].sort()).toEqual([sharedID, otherID].sort());

    // And the shared group is the SAME object on both items it was applied to.
    expect(itemAt(pricedOrder, 0).appliedPriceGroup).toBe(priceGroup);
    expect(itemAt(pricedOrder, 1).appliedPriceGroup).toBe(priceGroup);
    expect(itemAt(pricedOrder, 2).appliedPriceGroup).toBe(otherPriceGroup);
  });

  it('lets the LAST intent for an order item win', async () => {
    const { scope, order, priceGroup, otherPriceGroup } = await openScope();
    const targetID = itemAt(order, 0).orderItemID;

    vi.spyOn(
      observableOrderPass(scope.priceGroupService),
      'updateOrderAmountsWithPriceGroups',
    ).mockResolvedValue([
      {
        orderItemID: targetID,
        price: Money.fromDecimalString('15.00'),
        priceGroupID: priceGroup.getPriceGroupID(),
      },
      {
        orderItemID: targetID,
        price: Money.fromDecimalString('11.00'),
        priceGroupID: otherPriceGroup.getPriceGroupID(),
      },
    ]);
    const load = armSetLoader(scope, [priceGroup, otherPriceGroup]);
    vi.spyOn(
      observablePromotionPass(scope.promotionService),
      'updateOrderAmountsWithPromotions',
    ).mockResolvedValue([]);

    const { pricedOrder } = await scope.updateOrderAmountsWithPriceGroupsThenPromotions(order);
    const projectedItem = itemAt(pricedOrder, 0);

    // CFML parity: the legacy L366 loop calls `setPrice` repeatedly on ONE
    // object, so the last write is what persists. The map reproduces that.
    expect(projectedItem.price.toFixed2()).toBe('11.00');
    expect(projectedItem.appliedPriceGroup).toBe(otherPriceGroup);

    // Superseded intents are not resolved: only the surviving one's price group
    // is in the requested key set, so the discarded intent costs nothing to resolve.
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith([otherPriceGroup.getPriceGroupID()]);
  });

  it('applies nothing when an intent names an order item the order does not carry', async () => {
    const { scope, order, priceGroup } = await openScope();

    vi.spyOn(
      observableOrderPass(scope.priceGroupService),
      'updateOrderAmountsWithPriceGroups',
    ).mockResolvedValue([
      {
        orderItemID: 'orderItem-not-on-this-order',
        price: Money.fromDecimalString('1.00'),
        priceGroupID: priceGroup.getPriceGroupID(),
      },
    ]);
    const load = armSetLoader(scope, [priceGroup]);
    vi.spyOn(
      observablePromotionPass(scope.promotionService),
      'updateOrderAmountsWithPromotions',
    ).mockResolvedValue([]);

    const { pricedOrder } = await scope.updateOrderAmountsWithPriceGroupsThenPromotions(order);

    // The price group is still resolved - resolution is driven by the intents, not
    // by the items - but no item matches, so every item is handed across by
    // identity and no price is disturbed.
    expect(load).toHaveBeenCalledTimes(1);
    expect(pricedOrder.orderItems).toHaveLength(order.orderItems.length);
    expect(itemAt(pricedOrder, 0)).toBe(itemAt(order, 0));
    expect(itemAt(pricedOrder, 1)).toBe(itemAt(order, 1));
    expect(itemAt(pricedOrder, 2)).toBe(itemAt(order, 2));
  });

  it('refuses, rather than quietly dropping, an intent whose price group cannot be loaded', async () => {
    const { scope, order } = await openScope();
    const missingID = 'priceGroup-deleted-mid-request';

    vi.spyOn(
      observableOrderPass(scope.priceGroupService),
      'updateOrderAmountsWithPriceGroups',
    ).mockResolvedValue([
      {
        orderItemID: itemAt(order, 0).orderItemID,
        price: Money.fromDecimalString('15.00'),
        priceGroupID: missingID,
      },
    ]);
    // Nothing is resolvable, so the loader answers a map WITHOUT the requested key - which is
    // how the set read reports a miss. It neither throws nor substitutes; the caller decides.
    armSetLoader(scope, []);
    const promotionPass = vi
      .spyOn(observablePromotionPass(scope.promotionService), 'updateOrderAmountsWithPromotions')
      .mockResolvedValue([]);

    const error = await rejectionOf(() =>
      scope.updateOrderAmountsWithPriceGroupsThenPromotions(order),
    );

    expect(error.name).toBe('CompositionDataError');
    expect(error.message).toContain(missingID);
    expect(error.message).toContain('could not be loaded');

    // WHY REFUSAL AND NOT A SKIP: dropping the intent would move the L241
    // discriminator to its other arm and change the discount the customer is
    // charged. The promotion pass must therefore not run at all.
    expect(promotionPass).not.toHaveBeenCalled();
  });

  it('does not mutate the caller\u2019s order or any of its items', async () => {
    const { scope, order, priceGroup } = await openScope();
    const originalItem = itemAt(order, 0);
    const originalPrice = originalItem.price.toFixed2();
    const originalExtended = originalItem.extendedPrice.toFixed2();

    vi.spyOn(
      observableOrderPass(scope.priceGroupService),
      'updateOrderAmountsWithPriceGroups',
    ).mockResolvedValue([
      {
        orderItemID: originalItem.orderItemID,
        price: Money.fromDecimalString('15.00'),
        priceGroupID: priceGroup.getPriceGroupID(),
      },
    ]);
    armSetLoader(scope, [priceGroup]);
    vi.spyOn(
      observablePromotionPass(scope.promotionService),
      'updateOrderAmountsWithPromotions',
    ).mockResolvedValue([]);

    await scope.updateOrderAmountsWithPriceGroupsThenPromotions(order);

    // The anti-corruption boundary is read-only in both directions: the engine
    // consumes a view and emits intents, and the legacy in-place mutation of the
    // order aggregate [model/service/PromotionService.cfc:L58 returns void] is
    // exactly what this replaces.
    expect(itemAt(order, 0).price.toFixed2()).toBe(originalPrice);
    expect(itemAt(order, 0).extendedPrice.toFixed2()).toBe(originalExtended);
    expect(itemAt(order, 0).appliedPriceGroup).toBe(originalItem.appliedPriceGroup);
    expect(itemAt(order, 0)).toBe(originalItem);
  });

  it('issues no statement of its own beyond what the collaborators it calls would', async () => {
    const executor = makeExecutor();
    const root = await bootWith(executor);
    const scope = root.createRequestScope();

    vi.spyOn(
      observableOrderPass(scope.priceGroupService),
      'updateOrderAmountsWithPriceGroups',
    ).mockResolvedValue([]);
    vi.spyOn(
      observablePromotionPass(scope.promotionService),
      'updateOrderAmountsWithPromotions',
    ).mockResolvedValue([]);

    await scope.updateOrderAmountsWithPriceGroupsThenPromotions(makeOrderViewFixture());

    // The composed operation is sequencing and projection only. With both passes
    // substituted, the ledger still shows nothing but the eager tier-one read.
    expect(executor.calls).toHaveLength(1);
    expect(executor.mutationCalls).toHaveLength(0);
  });

  it('drives the REAL price-group pass through the wired repository, parameterized by the account', async () => {
    const executor = makeExecutor();
    const root = await bootWith(executor);
    const scope = root.createRequestScope();
    const order = makeOrderViewFixture();
    const accountID = requirePresent(order.accountID, 'the fixture order account');

    // Only the promotion pass is substituted here. The price-group pass runs for
    // real, so this case proves the composition root wired a repository that
    // actually reaches the executor - which none of the spied cases above can.
    vi.spyOn(
      observablePromotionPass(scope.promotionService),
      'updateOrderAmountsWithPromotions',
    ).mockResolvedValue([]);

    const result = await scope.updateOrderAmountsWithPriceGroupsThenPromotions(order);

    expect(executor.countOf(ACCOUNT_PRICE_GROUP_IDS_SQL)).toBe(1);

    const recorded = requirePresent(
      executor.calls[executor.firstIndexOf(ACCOUNT_PRICE_GROUP_IDS_SQL)],
      'the account price-group read',
    );
    // PARAMETERIZED, never interpolated: this is the property `cfqueryparam`
    // carried in the legacy and the reason the port uses prepared statements
    // exclusively.
    expect(recorded.params).toEqual([accountID]);

    // No `SwAccountPriceGroup` row was seeded, so the pass declines for every
    // item - the `cfLen(accountPriceGroups) > 0` gate - and the view is handed on
    // by identity.
    expect(result.priceGroupIntents).toEqual([]);
    expect(result.pricedOrder).toBe(order);
  });
});

// ===========================================================================
// 5. The scope-level convenience delegate.
//
// One member of `RequestScope` is neither a collaborator nor the composed pricing
// operation: `getSalePriceDetailsForProductSkus` forwards to the promotion
// service. It is asserted here rather than at the promotion service's own suite
// because what is under test is the FORWARDING - that the delegate the composition
// root published reaches the promotion service the composition root wired, which
// in turn reaches the executor the composition root injected. Nothing about the
// six-branch UNION or its reduction is asserted here; that belongs to the
// repository's own suite, and this suite does not own repository hydration.
// ===========================================================================

describe('RequestScope.getSalePriceDetailsForProductSkus', () => {
  /**
   * ★ A REACH-THROUGH THIS SUITE DOCUMENTS RATHER THAN HIDES.
   *
   * The sale-price statement is dialect-parameterized - the legacy branches its
   * `productTypeIDPath` concatenation by dialect [model/dao/PromotionDAO.cfc:L482-L488]
   * - and the fragment builder resolves that dialect by calling
   * `resolveConfiguredDialect()` [src/repositories/mysql/dialect.ts:L177], which
   * reads `appConfig.load()` and therefore the PROCESS environment. It does not
   * read the `environment` this suite hands to `bootstrapCompositionRoot`, and it
   * does not read the dialect the composed root already resolved and published.
   *
   * So the process environment has to be populated for this one case, and stating
   * that plainly is the point: every OTHER case in this file proves its behaviour
   * with `process.env` untouched, and the difference marks exactly where the
   * composition root's configuration stops being the single source of it. No
   * connection is opened either way - the executor is still the injected one, and
   * the reach-through is a configuration read, not a query.
   */
  function stubProcessEnvironmentForDialectFragments(): void {
    vi.stubEnv('DB_HOST', `${UNUSED_PLACEHOLDER}.invalid`);
    vi.stubEnv('DB_USER', UNUSED_PLACEHOLDER);
    vi.stubEnv('DB_PASSWORD', UNUSED_PLACEHOLDER);
    vi.stubEnv('DB_DIALECT', 'MySQL');
    vi.stubEnv('DB_TLS_MODE', 'disabled');
    appConfig.reset();
  }

  it('forwards to the wired promotion service, which reaches the injected executor', async () => {
    const executor = makeExecutor();
    const root = await bootWith(executor);
    const scope = root.createRequestScope();

    stubProcessEnvironmentForDialectFragments();

    const details = await scope.getSalePriceDetailsForProductSkus('product-with-no-sale-prices');

    // No sale-price row was seeded, so the reduced result is empty - which is the
    // normal outcome for a product carrying no active sale-price reward, not a
    // failure.
    expect(details).toEqual({});

    // The forwarding is what is proven: at least one statement beyond the eager
    // tier-one currency read was issued, and it went to THIS executor.
    expect(executor.calls.length).toBeGreaterThan(1);
    expect(executor.countOf(CURRENCY_RECORDS_SQL)).toBe(1);
    expect(executor.mutationCalls).toHaveLength(0);
  });

  it('forwards to the same promotion service instance the scope published', async () => {
    const root = await bootWith(makeExecutor());
    const scope = root.createRequestScope();
    const forwarded = vi
      .spyOn(scope.promotionService, 'getSalePriceDetailsForProductSkus')
      .mockResolvedValue({});

    await scope.getSalePriceDetailsForProductSkus('product-1');

    // Substituting the PUBLISHED instance changes what the delegate calls, which
    // is only true if the delegate closed over that same instance. A second
    // instance constructed privately would leave this spy uncalled.
    expect(forwarded).toHaveBeenCalledTimes(1);
    expect(forwarded).toHaveBeenCalledWith('product-1');
  });
});

// ===========================================================================
// SECOND SUITE IN THIS FILE: THE TRUST-BOUNDARY CASES.
//
// The cases above own the WIRING of the composition root. The cases below own its
// TRUST BOUNDARIES - the security decisions that live in this module and nowhere
// else. They were authored against a separate review and share the subject, so they
// share its suite file rather than splitting the module's coverage across two
// registrations. Nothing is duplicated: the two halves keep their own scaffolding
// (a recording executor above, a stub executor below) because they observe different
// things, and neither reaches into the other's helpers.
// ===========================================================================

// ---------------------------------------------------------------------------
// tests/unit/handlers/bootstrap.test.ts
//
// WHY THIS FILE EXISTS. A security review recorded it as a Test Assurance Gap: the
// composition root had no suite, while being the module that decides which
// capabilities a caller can reach and where each one's trust boundary sits. Four
// findings then put security decisions INSIDE it, so the gap stopped being untidy and
// became the reason those fixes could regress unnoticed:
//
//   - S-05  The two order-pricing passes were individually reachable, so a caller
//           could run the promotion pass alone. The promotion pass READS state the
//           price-group pass writes [model/service/PromotionService.cfc:L241], and
//           AAP 0.6.1 requires the ordering be "non-optional in the composition root".
//   - S-15  (CWE-346) The feed host allow-list arrived in the REQUEST, alongside the
//           candidate it validated. Anyone could allow themselves.
//   - S-19  (CWE-834, CWE-400) The URL-title collision loop was unbounded, one serial
//           query per suffix.
//   - S-20  (CWE-754, CWE-840) Production always composed an EMPTY currency rate
//           table, so cross-currency conversion silently priced at 1:1.
//
// WHAT IT DOES NOT DO. It is not a second home for logic owned elsewhere. Money
// arithmetic, promotion qualification and the price-group cascade have their own
// suites; the cases here assert WIRING and TRUST BOUNDARIES only. Where a case does
// touch money it is because the composition root itself computes something - the
// projected subtotal - and that computation has no other owner.
//
// NO DATABASE IS REQUIRED. `CompositionOverrides.executor` is documented as replacing
// the module-scope pool entirely ("Supplying one means no pool is ever created"), and
// `environment` replaces `process.env`, so every case here is hermetic. The root is
// always built with explicit overrides, which also bypasses the memo and keeps the
// cases order-independent.
// ---------------------------------------------------------------------------

/** The five variables with no default. Every case adds only what it is about. */
const BASE_ENV: Readonly<Record<string, string>> = Object.freeze({
  DB_HOST: 'db.internal.invalid',
  DB_USER: 'slatwall',
  DB_PASSWORD: 'unit-test-password',
  DB_TLS_MODE: 'disabled',
  DB_DIALECT: 'MySQL',
});

const ALLOWED_FEED_HOST = 'shop.example.com';

/**
 * An executor that answers a caller-chosen row set for every statement.
 *
 * Deliberately NOT a mock framework double. The composition root reads currency
 * records eagerly during construction, so the executor has to be a real object with
 * real behaviour before anything else can be observed; recording the statements it
 * saw is also how the URL-title case counts round trips.
 */
class StubExecutor implements PreparedStatementExecutor {
  readonly statements: string[] = [];

  /**
   * Every write, with its bound values. Recorded because S-07's wiring is only
   * observable as a BOUND PARAMETER: the audit actor is not published on
   * `RequestScope`, so the sole honest way to assert it reached the repositories is
   * to issue a write through one of them and read what the statement carried.
   */
  readonly mutations: { readonly sql: string; readonly params: readonly unknown[] }[] = [];

  constructor(private readonly answer: (sql: string) => readonly SqlRow[] = () => []) {}

  execute(sql: string, _params?: readonly unknown[]): Promise<readonly SqlRow[]> {
    this.statements.push(sql);

    return Promise.resolve(this.answer(sql));
  }

  executeMutation(sql: string, params: readonly unknown[] = []): Promise<SqlMutationResult> {
    this.mutations.push({ sql, params: [...params] });

    return Promise.resolve({ affectedRows: 0, warningStatus: 0 });
  }

  transaction<T>(work: (tx: PreparedStatementExecutor) => Promise<T>): Promise<T> {
    return work(this);
  }
}

interface RootOptions {
  readonly env?: Readonly<Record<string, string>>;
  readonly executor?: StubExecutor;
  readonly rates?: Readonly<Record<string, string>>;
}

async function makeRoot(options: RootOptions = {}): Promise<CompositionRoot> {
  return bootstrapCompositionRoot({
    executor: options.executor ?? new StubExecutor(),
    environment: { ...BASE_ENV, ...options.env },
    ...(options.rates === undefined ? {} : { europeanCentralBankRates: options.rates }),
  });
}

/** Captures the structured JSON lines the logger writes, parsed. */
interface CapturedLine {
  readonly level: string;
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>>;
}

function captureLogLines(): { readonly lines: CapturedLine[] } {
  const lines: CapturedLine[] = [];

  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown): boolean => {
    const parsed: unknown = JSON.parse(String(chunk));
    if (typeof parsed === 'object' && parsed !== null) {
      const record = parsed as { level?: unknown; message?: unknown; context?: unknown };
      lines.push({
        level: String(record.level),
        message: String(record.message),
        context: (record.context ?? {}) as Readonly<Record<string, unknown>>,
      });
    }

    return true;
  });

  return { lines };
}

describe('bootstrapCompositionRoot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds without a database, because the executor override replaces the pool', () => {
    // The precondition every other case rests on, asserted rather than assumed. If
    // the root ever reached for a real pool despite the override, every case below
    // would fail for a reason that had nothing to do with what it was testing.
    return expect(makeRoot()).resolves.toBeDefined();
  });

  // -------------------------------------------------------------------------
  // S-05 - the two order passes are reachable only in the mandated order
  // -------------------------------------------------------------------------

  describe('the order-pricing trust boundary (S-05)', () => {
    let scope: RequestScope;

    beforeEach(async () => {
      scope = (await makeRoot()).createRequestScope();
    });

    it('publishes the composed fixed-order command', () => {
      expect(typeof scope.updateOrderAmountsWithPriceGroupsThenPromotions).toBe('function');
    });

    it('★★ REFUSES TO TYPE either individual pass, so neither can be called alone', () => {
      // ★ WHY THE ASSERTION IS A COMPILER ASSERTION AND NOT A RUNTIME ONE. `Omit` is
      // erased at run time: the underlying service instances still carry both methods,
      // and `'updateOrderAmountsWithPromotions' in scope.promotionService` would answer
      // TRUE. Asserting that would prove the opposite of the fix.
      //
      // What S-05 required was that a caller cannot REACH a pass individually, and the
      // published type is what enforces it. `@ts-expect-error` is therefore the honest
      // instrument: the directive FAILS TO COMPILE if the error it expects disappears,
      // so this case goes red the moment either method is put back on the surface.
      // AAP 0.9.1 permits the directive for exactly this - "no `@ts-expect-error`
      // outside a test asserting a type failure" - and this is that test.
      //
      // ★ EXPRESSED AS A KEY-MEMBERSHIP PROBE RATHER THAN AS `@ts-expect-error`. The
      // directive was tried first and works, but it forces the member to be READ, and
      // reading an erroring member yields an `error`-typed value that
      // `@typescript-eslint/no-unsafe-assignment` rightly refuses - suppressing a lint
      // rule to make a security assertion is a poor trade. This formulation needs no
      // suppression of any kind: it asks the type system a question and gets a literal
      // type back.
      //
      // HOW IT FAILS IF THE FIX REGRESSES. `Absent<K, T>` is `true` exactly when `K` is
      // not a key of `T`. Putting either method back on the published type flips the
      // corresponding alias to `false`, and `const x: false = true` does not compile -
      // so the regression is a BUILD failure, which is stronger than a red test.
      type Absent<TKey extends string, TSubject> = TKey extends keyof TSubject ? false : true;

      const priceGroupPassAbsent: Absent<
        'updateOrderAmountsWithPriceGroups',
        RequestScope['priceGroupService']
      > = true;
      const promotionPassAbsent: Absent<
        'updateOrderAmountsWithPromotions',
        RequestScope['promotionService']
      > = true;

      expect(priceGroupPassAbsent).toBe(true);
      expect(promotionPassAbsent).toBe(true);

      // ★ AND THE PROBE ITSELF IS CONTROLLED, because a probe that answered `true` for
      // everything would assert nothing at all. A member that DOES survive must come
      // back `false`, which proves the mechanism discriminates.
      const survivingMemberIsPresent: Absent<
        'calculateSkuPriceBasedOnPriceGroup',
        RequestScope['priceGroupService']
      > = false;

      expect(survivingMemberIsPresent).toBe(false);
    });

    it('keeps every OTHER price-group and promotion capability reachable', () => {
      // The narrowing has to be surgical. AAP 0.4.1 requires
      // `priceResolutionHandler.ts` to expose "the price-group and currency resolution
      // surface", so withdrawing the whole service - the blunt version of this fix -
      // would have broken a mandated handler. These are the members that had to
      // survive, and this case is what stops a future `Omit` from widening.
      expect(typeof scope.priceGroupService.calculateSkuPriceBasedOnPriceGroup).toBe('function');
      expect(typeof scope.priceGroupService.calculateSkuPriceBasedOnAccount).toBe('function');
      expect(typeof scope.priceGroupService.getRateForSkuBasedOnPriceGroup).toBe('function');
      expect(typeof scope.priceGroupService.getBestPriceGroupDetailsBasedOnSkuAndAccount).toBe(
        'function',
      );
      expect(typeof scope.promotionService.getSalePriceDetailsForProductSkus).toBe('function');
      expect(typeof scope.promotionService.getDiscountAmount).toBe('function');
      expect(typeof scope.promotionService.getPromotionCodeUseCount).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // S-15 - the feed allow-list is deployment-owned
  // -------------------------------------------------------------------------

  describe('the product-feed host allow-list (S-15)', () => {
    it('reads the allow-list from configuration', async () => {
      const root = await makeRoot({ env: { FEED_ALLOWED_HOSTS: ALLOWED_FEED_HOST } });

      expect(root.config.feed.allowedHosts).toStrictEqual([ALLOWED_FEED_HOST]);
    });

    it('mints a feed port for a host that IS on the deployment allow-list', async () => {
      const root = await makeRoot({ env: { FEED_ALLOWED_HOSTS: ALLOWED_FEED_HOST } });

      const scope = root.createRequestScope({ feedHost: ALLOWED_FEED_HOST });

      expect(scope.productFeedPort).toBeDefined();
    });

    it('★★ REFUSES A CALLER-SUPPLIED HOST that is not on the deployment allow-list', () => {
      // The whole of S-15 in one case. The candidate still comes from the request -
      // that is faithful, since the legacy template rendered
      // `http://#CGI.HTTP_HOST#` at five sites in
      // `integrationServices/google/views/feed/product.cfm` - but the list it is
      // checked against now comes from the process configuration, so the caller can
      // no longer supply both halves of its own validation.
      return expect(async () => {
        const root = await makeRoot({ env: { FEED_ALLOWED_HOSTS: ALLOWED_FEED_HOST } });

        root.createRequestScope({ feedHost: 'attacker.example.invalid' });
      }).rejects.toBeInstanceOf(UntrustedFeedHostError);
    });

    it('refuses every host when no allow-list is configured, publishing no feed at all', () => {
      // The intended default rather than a degraded mode: an empty list matches
      // nothing, so a deployment that does not serve a feed cannot accidentally serve
      // one. This is also why the variable stayed OPTIONAL - making it required would
      // have broken every deployment that never had a feed.
      return expect(async () => {
        const root = await makeRoot();

        root.createRequestScope({ feedHost: ALLOWED_FEED_HOST });
      }).rejects.toBeInstanceOf(UntrustedFeedHostError);
    });

    it('mints no feed port when the request names no host', async () => {
      const root = await makeRoot({ env: { FEED_ALLOWED_HOSTS: ALLOWED_FEED_HOST } });

      expect(root.createRequestScope().productFeedPort).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // The configured feed URL scheme reaches the document (S-09)
  //
  // ★★ THIS BLOCK EXISTS BECAUSE MUTATION TESTING FOUND ITS ABSENCE. Replacing
  // `graph.config.feed.scheme` in the composition root with a hardcoded `'http'` - the
  // exact defect finding S-09 named - left ALL 5,168 tests passing. The renderer suite
  // proved the renderer honours a scheme, and the service suite proved the service
  // forwards one, but NOTHING proved the composition root read the configured value, so
  // the fix could have been silently inert in the only wiring that ships.
  //
  // A zero-row feed is deliberately enough to assert this: a feed with no items is still a
  // complete document carrying the channel `<link>`, which is one of the five sites the
  // legacy built from `http://#CGI.HTTP_HOST#`
  // [integrationServices/google/views/feed/product.cfm:L14]. So the origin is observable
  // without fabricating catalog rows, and the case stays about wiring.
  // -------------------------------------------------------------------------

  describe('the configured feed URL scheme reaches the document (S-09)', () => {
    /** A root whose feed host is allowed, under the given scheme configuration. */
    async function feedPortUnder(
      env: Readonly<Record<string, string>>,
    ): Promise<{ readonly document: Promise<string> }> {
      const root = await makeRoot({
        env: { FEED_ALLOWED_HOSTS: ALLOWED_FEED_HOST, ...env },
        executor: new StubExecutor(),
      });
      const port = root.createRequestScope({ feedHost: ALLOWED_FEED_HOST }).productFeedPort;

      if (port === undefined) {
        throw new Error('expected a feed port for an allow-listed host');
      }

      return { document: port.generateProductFeed() };
    }

    it('★★ publishes https URLs when the deployment configured https', async () => {
      const { document } = await feedPortUnder({ FEED_URL_SCHEME: 'https' });

      await expect(document).resolves.toContain(`<link>https://${ALLOWED_FEED_HOST}</link>`);
    });

    it('★★ publishes https URLs when the deployment configured NOTHING, because that is the default', async () => {
      // The default path is the one most deployments take, so it is asserted rather than
      // inferred from the config suite. An unconfigured deployment must not inherit the
      // legacy cleartext origin.
      const { document } = await feedPortUnder({});

      await expect(document).resolves.toContain(`<link>https://${ALLOWED_FEED_HOST}</link>`);
      await expect(document).resolves.not.toContain(`<link>http://${ALLOWED_FEED_HOST}</link>`);
    });

    it('★★ publishes http URLs when the deployment explicitly configured http', async () => {
      // The case that would have caught the hardcoding had it been the other way round: the
      // root must read the value, not choose one. Together with the https case above, a
      // hardcoded scheme in the composition root fails one of the two whichever value it
      // hardcodes.
      const { document } = await feedPortUnder({ FEED_URL_SCHEME: 'http' });

      await expect(document).resolves.toContain(`<link>http://${ALLOWED_FEED_HOST}</link>`);
    });

    it('leaves the xmlns:g namespace URI alone, whatever the configured scheme', async () => {
      // `http://base.google.com/ns/1.0` is an XML namespace NAME compared byte for byte by
      // consumers, never dereferenced. Upgrading it would break the feed contract outright.
      const { document } = await feedPortUnder({ FEED_URL_SCHEME: 'https' });

      await expect(document).resolves.toContain('xmlns:g="http://base.google.com/ns/1.0"');
    });
  });

  // -------------------------------------------------------------------------
  // S-20 - the currency rate table has a supply route, and its age is reported
  // -------------------------------------------------------------------------

  describe('the currency rate table (S-20)', () => {
    it('★★ COMPOSES RATES FROM CONFIGURATION, which production previously could not', () => {
      // The defect was that `EMPTY_EUROPEAN_CENTRAL_BANK_RATES` was the ONLY
      // production possibility: the sole other route was a test-seam override, so a
      // deployed service converted nothing and priced foreign currencies at parity.
      // A conversion succeeding with a real rate is the proof that route now exists.
      const { lines } = captureLogLines();

      return makeRoot({
        env: {
          ECB_REFERENCE_RATES: 'USD=1.0850',
          ECB_RATES_RETRIEVED_AT: new Date().toISOString(),
        },
      }).then(async (root) => {
        expect(root.config.currency.europeanCentralBankRates).toStrictEqual({ USD: '1.0850' });

        // EUR is the implicit pivot and is deliberately absent from the table, so a
        // EUR-to-USD conversion exercises the multiply-out half against a configured
        // rate: 100 EUR * 1.0850.
        const converted = await root
          .createRequestScope()
          .currencyConverter.convertCurrency(
            Money.fromDecimalString('100.00'),
            toCurrencyCode('EUR'),
            toCurrencyCode('USD'),
          );

        expect(converted.toFixed2()).toBe('108.50');

        // And nothing warned, because the table is fresh.
        expect(lines.filter((line) => line.level === 'warn')).toStrictEqual([]);
      });
    });

    it('reports a rate table older than the one-day refresh window as a warning', async () => {
      // The freshness bound mirrors the legacy refresh interval
      // [model/service/CurrencyService.cfc:L105]. It REPORTS rather than refuses - see
      // the next case for why that is deliberate.
      const { lines } = captureLogLines();
      const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();

      await makeRoot({
        env: { ECB_REFERENCE_RATES: 'USD=1.0850', ECB_RATES_RETRIEVED_AT: threeDaysAgo },
      });

      const warned = lines.filter(
        (line) => line.level === 'warn' && line.message.includes('older'),
      );
      expect(warned).toHaveLength(1);

      // ★ AND THE AGE IS LEGIBLE RATHER THAN REDACTED. `src/lib/logger.ts` fails
      // closed on any context key it does not enumerate; before `ageInDays` was added
      // to its diagnostic allow-list this line emitted `"[REDACTED]"` and could say
      // something was stale without saying how stale. That coupling is invisible from
      // the emitting module, so it is asserted here as well as in the logger's suite.
      expect(warned[0]?.context['ageInDays']).toBe(3);
      expect(warned[0]?.context['rowCount']).toBe(1);
    });

    it('★★ STILL USES a stale table, which is the deliberately declined half of S-20', () => {
      // The review asked to "fail closed on unavailable cross-currency rates". A stale
      // table is not refused, and the legacy is why: its refetch sat in a `try` whose
      // `catch` was EMPTY [model/service/CurrencyService.cfc:L127-L128], so a failed
      // download left the previous table in place and L130 returned it - rates of any
      // age were served indefinitely. Refusing would also diverge in the WORSE
      // direction, because the alternative to a day-old rate is no conversion at all,
      // which returns the amount unchanged and prices at parity. Cents against tens of
      // percent.
      captureLogLines();
      const yearAgo = new Date(Date.now() - 400 * 86_400_000).toISOString();

      return makeRoot({
        env: { ECB_REFERENCE_RATES: 'USD=1.0850', ECB_RATES_RETRIEVED_AT: yearAgo },
      })
        .then(async (root) =>
          root
            .createRequestScope()
            .currencyConverter.convertCurrency(
              Money.fromDecimalString('100.00'),
              toCurrencyCode('EUR'),
              toCurrencyCode('USD'),
            ),
        )
        .then((converted) => {
          expect(converted.toFixed2()).toBe('108.50');
        });
    });

    it('reports that conversions will pass through when no rates are configured', async () => {
      const { lines } = captureLogLines();

      await makeRoot();

      const reported = lines.filter((line) => line.message.includes('pass through'));
      expect(reported).toHaveLength(1);
      expect(reported[0]?.context['rowCount']).toBe(0);
    });

    it('★★ LOGS THE UNCONVERTED PASS-THROUGH, so 1:1 pricing is never silent', async () => {
      // The observability half of S-20, and the reason the pass-through VALUE could
      // not change: `model/service/CurrencyService.cfc:L100-L101` returns the amount
      // unchanged when no conversion is possible, and step 3 of the SKU cascade
      // [model/entity/Sku.cfc:L416-L428] consumes that value as a price. What the fix
      // could change is whether the event is visible - and now it is.
      const { lines } = captureLogLines();
      const root = await makeRoot();

      const converted = await root
        .createRequestScope()
        .currencyConverter.convertCurrency(
          Money.fromDecimalString('100.00'),
          toCurrencyCode('USD'),
          toCurrencyCode('GBP'),
        );

      // Must-preserve: the amount is answered unchanged.
      expect(converted.toFixed2()).toBe('100.00');

      const warned = lines.filter((line) => line.message.includes('passed through'));
      expect(warned).toHaveLength(1);

      // Both codes legible, and the AMOUNT deliberately absent - it is a customer's
      // price, and the codes are the whole operator-actionable signal.
      expect(warned[0]?.context['originalCurrencyCode']).toBe('USD');
      expect(warned[0]?.context['convertToCurrencyCode']).toBe('GBP');
      expect(Object.keys(warned[0]?.context ?? {})).toStrictEqual([
        'originalCurrencyCode',
        'convertToCurrencyCode',
      ]);
    });

    it('★ REPORTS EVEN A SAME-CURRENCY CALL when that currency has no rate, because the legacy gate is not about sameness', async () => {
      // ★ THIS CASE CORRECTS AN ASSUMPTION, AND THE CORRECTION IS THE VALUE IN IT. It
      // was first written asserting that a same-currency call must NOT report a
      // pass-through, on the reasoning that USD-to-USD is a no-op rather than a failed
      // conversion. It failed, so the legacy was read rather than the test forced:
      //
      //   [model/service/CurrencyService.cfc:L86] gates on
      //     ( structKeyExists(cbRates, original) || original eq "EUR" )
      //     && ( structKeyExists(cbRates, convertTo) || convertTo eq "EUR" )
      //
      // THERE IS NO SAME-CURRENCY SHORT-CIRCUIT ANYWHERE IN THAT FUNCTION. The gate
      // asks only whether each code is quotable - present in the table, or the euro
      // pivot itself. USD-to-USD against an empty table therefore FAILS the gate and
      // falls to [L100-L101], `return arguments.amount`, exactly like a cross-currency
      // call would. The port reproduces that, and the report is correct to fire.
      //
      // Which also means the report is not evidence of a mispricing on its own: for a
      // same-currency call the unchanged amount is the right answer anyway. That is
      // precisely why the observability half of S-20 reports and does not refuse.
      const { lines } = captureLogLines();
      const root = await makeRoot();

      const converted = await root
        .createRequestScope()
        .currencyConverter.convertCurrency(
          Money.fromDecimalString('100.00'),
          toCurrencyCode('USD'),
          toCurrencyCode('USD'),
        );

      expect(converted.toFixed2()).toBe('100.00');

      const reported = lines.filter((line) => line.message.includes('passed through'));
      expect(reported).toHaveLength(1);
      expect(reported[0]?.context['originalCurrencyCode']).toBe('USD');
      expect(reported[0]?.context['convertToCurrencyCode']).toBe('USD');
    });

    it('converts a same-currency call through the pivot, and reports nothing, once it has a rate', async () => {
      // The other side of the case above, and what makes the distinction observable:
      // with USD in the table the gate PASSES, so the legacy divides into euros [L90]
      // and multiplies straight back out [L96]. The round trip returns the original
      // amount - by arithmetic rather than by a short-circuit - and nothing is
      // reported, because nothing passed through unconverted.
      const { lines } = captureLogLines();
      const root = await makeRoot({
        env: {
          ECB_REFERENCE_RATES: 'USD=1.0850',
          ECB_RATES_RETRIEVED_AT: new Date().toISOString(),
        },
      });

      const converted = await root
        .createRequestScope()
        .currencyConverter.convertCurrency(
          Money.fromDecimalString('100.00'),
          toCurrencyCode('USD'),
          toCurrencyCode('USD'),
        );

      expect(converted.toFixed2()).toBe('100.00');
      expect(lines.filter((line) => line.message.includes('passed through'))).toStrictEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // S-19 - the URL-title collision loop is bounded
  // -------------------------------------------------------------------------

  describe('the URL-title collision bound (S-19)', () => {
    /** Answers "taken" for every uniqueness probe, so the loop can never settle. */
    function alwaysCollidingExecutor(): StubExecutor {
      return new StubExecutor((sql) => (sql.includes('urlTitle') ? [{ urlTitle: 'taken' }] : []));
    }

    it('★★ REFUSES rather than looping forever when every candidate collides', async () => {
      // The legacy loop is genuinely unbounded -
      // `model/service/DataService.cfc:L64-L68` is `while(!unique) { addon++; ... }`
      // with no ceiling and one round trip per iteration. Under Lambda that is a
      // correctness problem rather than merely slow, which is what AAP 0.6.5 requires
      // "explicit batch limits" for.
      //
      // Reached through `saveBrand`, because that is the caller AAP 0.4.1 gives the
      // generator. The refusal must be the COLLISION error and not the persistence
      // error `saveBrand` ends with, which is what pins that the bound fires first.
      const executor = alwaysCollidingExecutor();
      const scope = (await makeRoot({ executor })).createRequestScope();

      await expect(
        scope.brandService.saveBrand(new Brand({ brandID: 'b-1' }), { brandName: 'Acme' }),
      ).rejects.toBeInstanceOf(UrlTitleCollisionLimitError);
    });

    it('issues a bounded number of probes, not an unbounded one', async () => {
      // The resource half. 100 suffixed attempts plus the unsuffixed candidate tried
      // before the loop is 101 reads - a number a reviewer can multiply out, which is
      // why the bound is a COUNT rather than a wall-clock deadline whose outcome would
      // depend on how loaded the database was that day.
      const executor = alwaysCollidingExecutor();
      const scope = (await makeRoot({ executor })).createRequestScope();

      await expect(
        scope.brandService.saveBrand(new Brand({ brandID: 'b-2' }), { brandName: 'Acme' }),
      ).rejects.toBeInstanceOf(UrlTitleCollisionLimitError);

      const probes = executor.statements.filter((sql) => sql.includes('urlTitle'));
      expect(probes).toHaveLength(101);
    });

    it('discloses neither the candidate title nor the table in the error it raises', async () => {
      // The disclosure half. A caller able to submit titles and read errors must not
      // be able to learn, one refusal at a time, which slugs are crowded.
      const executor = alwaysCollidingExecutor();
      const scope = (await makeRoot({ executor })).createRequestScope();

      const thrown = await scope.brandService
        .saveBrand(new Brand({ brandID: 'b-3' }), { brandName: 'Acme Widgets' })
        .then(
          () => undefined,
          (error: unknown) => error,
        );

      expect(thrown).toBeInstanceOf(UrlTitleCollisionLimitError);
      const message = thrown instanceof Error ? thrown.message : '';
      expect(message).not.toContain('acme');
      expect(message).not.toContain('Acme');
      expect(message).not.toContain('SwBrand');
    });

    it('settles on the first free suffixed candidate, preserving the legacy -2 start', async () => {
      // The bound must not have changed the ordinary outcome. The unsuffixed candidate
      // is tried first [L60], so the FIRST suffix the legacy ever produces is `-2` and
      // never `-1` - `addon` starts at 1 and is incremented before use [L55, L65].
      let probe = 0;
      const executor = new StubExecutor((sql) => {
        if (!sql.includes('urlTitle')) {
          return [];
        }
        probe += 1;
        // First two candidates taken, third free.
        return probe <= 2 ? [{ urlTitle: 'taken' }] : [];
      });
      const scope = (await makeRoot({ executor })).createRequestScope();
      const payload: { brandName: string; urlTitle?: string } = { brandName: 'Acme' };

      // `saveBrand` still fails closed on the absent durable write (S-06), so the
      // resolved title is read from the payload it was handed - the same route the
      // legacy `super.save` read the column from.
      await expect(
        scope.brandService.saveBrand(new Brand({ brandID: 'b-4' }), payload),
      ).rejects.toBeInstanceOf(BrandPersistenceUnavailableError);

      expect(payload.urlTitle).toBe('acme-3');
    });
  });

  // -------------------------------------------------------------------------
  // S-07 - who a write is attributed to
  // -------------------------------------------------------------------------

  describe('the audit actor (S-07)', () => {
    // The five MySQL repositories each own the assertions about HOW they stamp; what
    // belongs here is the WIRING - that the actor is built from request-scope input,
    // reaches the adapters, and defaults to refusing rather than to stamping.
    //
    // The actor is deliberately NOT published on `RequestScope`, so it is observed the
    // only honest way available: a write is issued through one of the repositories the
    // scope does publish, and the bound values are read back. `savePriceGroup` on a
    // PERSISTED price group is chosen because its update path inspects no row count, so
    // the stub's `affectedRows: 0` is not mistaken for a failure.

    /** Position of `modifiedByAccountID` in the price-group update's bound values. */
    const UPDATE_MODIFIED_BY_POSITION = 6;

    /** An account the CALLER put on the entity, which must never be written. */
    const FORGED_ACCOUNT_ID = 'forged-account-from-the-request-body';

    const REQUEST_ACCOUNT_ID = 'acct-from-the-authenticated-request';

    function makePersistedPriceGroup(): PriceGroup {
      return new PriceGroup({
        priceGroupID: 'pg-00000000000000000000000000001',
        priceGroupIDPath: 'pg-00000000000000000000000000001',
        activeFlag: true,
        priceGroupName: 'Wholesale',
        priceGroupCode: 'wholesale',
        parentPriceGroup: undefined,
        childPriceGroups: [],
        priceGroupRates: [],
        promotionRewards: [],
        createdDateTime: undefined,
        modifiedDateTime: undefined,
        createdByAccountID: FORGED_ACCOUNT_ID,
        modifiedByAccountID: FORGED_ACCOUNT_ID,
      });
    }

    async function saveThrough(
      input: { accountID?: string; adminAccountFlag?: boolean } = {},
    ): Promise<StubExecutor> {
      const executor = new StubExecutor();
      const scope = (await makeRoot({ executor })).createRequestScope(input);

      await scope.priceGroupRepository.savePriceGroup(makePersistedPriceGroup());

      return executor;
    }

    it('★★ STAMPS THE ACCOUNT FROM REQUEST SCOPE, not the one on the entity', async () => {
      const executor = await saveThrough({
        accountID: REQUEST_ACCOUNT_ID,
        adminAccountFlag: true,
      });

      const write = executor.mutations[0];

      expect(write).toBeDefined();
      expect(write?.params[UPDATE_MODIFIED_BY_POSITION]).toBe(REQUEST_ACCOUNT_ID);

      // And the value the caller put on the entity reached no bound position at all.
      expect(write?.params).not.toContain(FORGED_ACCOUNT_ID);
    });

    it('★★ DEFAULTS TO NOT STAMPING when the admin flag is omitted', async () => {
      // The fail-safe property. `adminAccountFlag` is optional on `RequestScopeInput`,
      // and an omitted flag must mean "elevation was never established" - the non-admin
      // arm of the legacy gate [org/Hibachi/HibachiEntity.cfc:L628, L633], under which
      // `preInsert` never reached its setter. If this ever defaulted to `true`, every
      // unauthenticated request would mint an admin attribution.
      const executor = await saveThrough({ accountID: REQUEST_ACCOUNT_ID });

      expect(executor.mutations[0]?.params[UPDATE_MODIFIED_BY_POSITION]).toBeNull();
      expect(executor.mutations[0]?.params).not.toContain(REQUEST_ACCOUNT_ID);
    });

    it('stamps nothing for a request carrying no account at all', async () => {
      // The `!account.isNew()` half: no identifier means no persisted account, so there
      // is nothing to attribute the row to and none is invented.
      const executor = await saveThrough({ adminAccountFlag: true });

      expect(executor.mutations[0]?.params[UPDATE_MODIFIED_BY_POSITION]).toBeNull();
    });

    it('keeps the audit actor off the published scope, so no caller can restate it', () => {
      // The actor is composed INSIDE `createRequestScope` and never surfaced. Publishing
      // it would hand back a mutable handle on the very value the finding is about.
      return expect(
        makeRoot().then((root) => {
          const scope = root.createRequestScope({ accountID: REQUEST_ACCOUNT_ID });

          return Object.keys(scope);
        }),
      ).resolves.not.toContain('auditActor');
    });

    it('gives two request scopes independent actors', async () => {
      // Per-request construction, not process state: the whole reason the legacy memo
      // families were re-scoped. One request's attribution cannot leak into another's.
      const root = await makeRoot({ executor: new StubExecutor() });
      const first = root.createRequestScope({
        accountID: 'acct-first',
        adminAccountFlag: true,
      });
      const second = root.createRequestScope({
        accountID: 'acct-second',
        adminAccountFlag: true,
      });

      expect(first.priceGroupRepository).not.toBe(second.priceGroupRepository);
      expect(first.currentAccountContext.accountID).toBe('acct-first');
      expect(second.currentAccountContext.accountID).toBe('acct-second');
    });
  });
});

// ---------------------------------------------------------------------------
// The price-group page ceiling (S-08)
//
// A security review raised finding S-08, MEDIUM, CWE-400, naming the price-group page path among
// its unbounded surfaces: the hydration that follows the page read issues ONE further statement per
// distinct identifier, each materializing that group's rates and their link tables, so a wide page
// costs one statement per row plus that row's whole rate graph.
//
// ★ QUOTE-THEN-REVISE ON WHAT THE PAGE STATEMENT ASKS FOR. This block used to open by calling the
// statement unbounded - "the page is the collection", on the reading that
// [model/service/PriceGroupService.cfc:L233] declares no page size and that stating one would invent
// observable behaviour. It does not have to declare one: it calls `getPriceGroupSmartList()` with no
// arguments, and `HibachiSmartList.setup` declares `pageRecordsShow=10`
// [org/Hibachi/HibachiSmartList.cfc:L39] which `getPageRecords()` executes as `maxresults=10`
// [org/Hibachi/HibachiSmartList.cfc:L759-L764] - MySQL `LIMIT 10`. The page size IS in the source,
// so the statement now carries it, and `tests/unit/handlers/bootstrapStatements.test.ts` pins the
// literal. The `ORDER BY` absence is unaffected and still preserved: an unordered `LIMIT` is an
// unstable page, and that instability is the legacy outcome.
//
// THE CEILING THEREFORE BOUNDS THE HYDRATION, NOT THE STATEMENT, and it remains as a defensive
// invariant rather than the primary bound: what is refused is turning an implausible number of rows
// into entities, however many rows the read actually volunteered.
// ---------------------------------------------------------------------------

describe('the price-group page ceiling (S-08)', () => {
  /**
   * The exact page statement, so no sibling read is mistaken for it - `LIMIT 10` included, because
   * that is the statement `src/handlers/bootstrap.ts` emits.
   */
  const PAGE_STATEMENT = 'SELECT priceGroupID FROM SwPriceGroup LIMIT 10';

  /** An executor answering the page statement with `count` identifiers and nothing else. */
  function pageOf(count: number): StubExecutor {
    return new StubExecutor((sql) =>
      sql === PAGE_STATEMENT
        ? Array.from({ length: count }, (_unused, index) => ({
            priceGroupID: `pg-${String(index)}`,
          }))
        : [],
    );
  }

  /**
   * The statements ONE CALL issued, excluding everything composition had already read.
   *
   * `bootstrapCompositionRoot` reads `SwCurrency` once at composition time - see
   * `readCurrencyRecords`, whose eagerness is itself deliberate - so the executor is never empty
   * by the time a scope exists. Marking the boundary keeps these cases about the call under test
   * instead of silently asserting how many reads composition performs, which is a different
   * contract tested elsewhere in this file.
   */
  function statementsSince(executor: StubExecutor, mark: number): readonly string[] {
    return executor.statements.slice(mark);
  }

  it('★★ refuses a page ABOVE the ceiling before hydrating a single group', async () => {
    const executor = pageOf(1_001);
    const scope = (await makeRoot({ executor })).createRequestScope();
    const mark = executor.statements.length;

    await expect(scope.priceGroupService.getPriceGroupDataJSON()).rejects.toThrow(
      /returned 1001 price groups and at most 1000/u,
    );

    // The call issued exactly ONE statement - the identifier read - and not one of the 1,001
    // per-group hydration statements. Refusing before hydration is what makes this a bound
    // rather than a late complaint about work already done.
    expect(statementsSince(executor, mark)).toStrictEqual([PAGE_STATEMENT]);
  });

  it('proceeds past a page AT the ceiling, so the limit is inclusive', async () => {
    const executor = pageOf(1_000);
    const scope = (await makeRoot({ executor })).createRequestScope();
    const mark = executor.statements.length;

    // It gets PAST the ceiling and into hydration, which then fails for an unrelated and honest
    // reason: this stub answers no price-group row, so the first identifier names nothing. That the
    // failure is the DANGLING-IDENTIFIER one and not the ceiling one is the assertion.
    await expect(scope.priceGroupService.getPriceGroupDataJSON()).rejects.toThrow(
      /which SwPriceGroup does not contain/u,
    );

    // And it genuinely REACHED hydration: the page read was followed by a further statement,
    // which is precisely the per-group cost the ceiling exists to bound.
    const issued = statementsSince(executor, mark);

    expect(issued[0]).toBe(PAGE_STATEMENT);
    expect(issued.length).toBeGreaterThan(1);
  });

  it('leaves the page statement carrying the source-declared LIMIT and no invented ORDER BY', async () => {
    const executor = pageOf(1);
    const scope = (await makeRoot({ executor })).createRequestScope();
    const mark = executor.statements.length;

    await expect(scope.priceGroupService.getPriceGroupDataJSON()).rejects.toThrow();

    // The CEILING is enforced in the adapter and never in the statement: the 1,000 does not appear
    // in the SQL. What the SQL does carry is the page size the framework default declares
    // [org/Hibachi/HibachiSmartList.cfc:L39, L759-L764] - and no sort, because the caller declares
    // none and inventing one to make the row limit stable would invent observable behaviour.
    const page = statementsSince(executor, mark).find((sql) => sql === PAGE_STATEMENT);

    expect(page).toBeDefined();
    expect(page).toBe('SELECT priceGroupID FROM SwPriceGroup LIMIT 10');
    expect(page?.toUpperCase()).not.toContain('ORDER BY');
    expect(page).not.toContain(String(1_000));
  });
});
